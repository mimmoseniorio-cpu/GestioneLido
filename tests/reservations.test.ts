/**
 * F5-07 / F5-08 · Casi d'uso di prenotazione.
 *
 * Qui si verifica il comportamento che l'operatore vede, non i vincoli del
 * database (già coperti da `constraints.test.ts`): che l'errore sia
 * comprensibile, che l'audit registri, che annullare liberi davvero il posto.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createReservation, cancelReservation, moveReservationItem, blockUmbrella }
  from '@/server/use-cases/reservations'
import { getMapForDate } from '@/server/queries/map'
import { prisma } from '@/server/repositories/scoped'
import { DEFAULT_SETTINGS, type Ctx } from '@/server/context'
import { DomainError } from '@/domain/errors'
import { makeClub, day } from './helpers'

const OGGI = day(2030, 8, 12)

const ctxOf = (beachClubId: string, userId: string,
               actor: 'ADMIN' | 'OPERATOR' = 'ADMIN'): Ctx => ({
  kind: 'STAFF', beachClubId, userId, actor,
  timezone: 'Europe/Rome', settings: DEFAULT_SETTINGS,
})

async function stabilimento(label: string) {
  const c = await makeClub(prisma, label)
  await prisma.season.update({ where: { id: c.season.id }, data: { status: 'ACTIVE' } })
  await prisma.umbrella.update({ where: { id: c.umbrella.id }, data: { basePriceCents: 2500 } })
  const secondo = await prisma.umbrella.create({
    data: { beachClubId: c.club.id, beachMapId: c.map.id, visibleNumber: '64',
            rowLabel: 'A', posX: 2, posY: 1, basePriceCents: 2500 },
  })
  return { ...c, secondo, ctx: ctxOf(c.club.id, c.user.id) }
}

beforeAll(async () => { await prisma.$connect() })
afterAll(async () => { await prisma.$disconnect() })

describe('creare una prenotazione', () => {
  it('scenario A · assegna un ombrellone libero e congela il prezzo', async () => {
    const s = await stabilimento('res-create')
    const r = await createReservation(s.ctx, {
      umbrellaIds: [s.umbrella.id], customerId: s.customer.id,
      from: day(2030, 8, 10), to: day(2030, 8, 15),
    })
    expect(r.totalCents).toBe(2500 * 6)   // 10..15 inclusi = 6 giorni

    const item = await prisma.reservationItem.findFirstOrThrow({ where: { reservationId: r.id } })
    expect(item.priceCents).toBe(15000)

    // Il listino cambia: il prezzo della prenotazione NON si muove (RF-RES-04).
    await prisma.umbrella.update({ where: { id: s.umbrella.id }, data: { basePriceCents: 9900 } })
    const dopo = await prisma.reservationItem.findUniqueOrThrow({ where: { id: item.id } })
    expect(dopo.priceCents).toBe(15000)
  })

  it('scenario B · più ombrelloni in una sola prenotazione', async () => {
    const s = await stabilimento('res-multi')
    const r = await createReservation(s.ctx, {
      umbrellaIds: [s.umbrella.id, s.secondo.id], customerId: s.customer.id,
      from: day(2030, 8, 10), to: day(2030, 8, 12),
    })
    const items = await prisma.reservationItem.findMany({ where: { reservationId: r.id } })
    expect(items).toHaveLength(2)
    expect(r.totalCents).toBe(2500 * 3 * 2)
  })

  it('rifiuta un ombrellone bloccato con un messaggio comprensibile', async () => {
    const s = await stabilimento('res-blocked')
    await prisma.umbrella.update({ where: { id: s.umbrella.id },
      data: { blocked: true, blockedReason: 'Palo rotto' } })

    await expect(createReservation(s.ctx, {
      umbrellaIds: [s.umbrella.id], customerId: s.customer.id,
      from: day(2030, 8, 10), to: day(2030, 8, 12),
    })).rejects.toMatchObject({ code: 'UMBRELLA_BLOCKED' })
  })

  it('traduce la sovrapposizione in una frase, non in un errore di sistema', async () => {
    const s = await stabilimento('res-overlap')
    await createReservation(s.ctx, {
      umbrellaIds: [s.umbrella.id], customerId: s.customer.id,
      from: day(2030, 8, 10), to: day(2030, 8, 15),
    })
    try {
      await createReservation(s.ctx, {
        umbrellaIds: [s.umbrella.id], customerId: s.customer.id,
        from: day(2030, 8, 14), to: day(2030, 8, 18),
      })
      expect.unreachable('doveva sollevare')
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError)
      expect((e as DomainError).code).toBe('UMBRELLA_NOT_AVAILABLE')
      expect((e as DomainError).httpStatus).toBe(409)
      // L'operatore ha un cliente davanti: deve leggere italiano.
      expect((e as DomainError).message).toContain('già prenotato')
    }
  })

  it('rifiuta un periodo fuori dalla stagione', async () => {
    const s = await stabilimento('res-season')
    await expect(createReservation(s.ctx, {
      umbrellaIds: [s.umbrella.id], customerId: s.customer.id,
      from: day(2030, 12, 1), to: day(2030, 12, 5),
    })).rejects.toMatchObject({ code: 'INVALID_RANGE' })
  })

  it('rifiuta un cliente di un altro stabilimento con NOT_FOUND', async () => {
    const a = await stabilimento('res-tenant-a')
    const b = await stabilimento('res-tenant-b')
    await expect(createReservation(a.ctx, {
      umbrellaIds: [a.umbrella.id], customerId: b.customer.id,
      from: day(2030, 8, 10), to: day(2030, 8, 12),
    })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('lascia traccia nell audit', async () => {
    const s = await stabilimento('res-audit')
    const r = await createReservation(s.ctx, {
      umbrellaIds: [s.umbrella.id], customerId: s.customer.id,
      from: day(2030, 8, 10), to: day(2030, 8, 12),
    })
    const righe = await prisma.auditLog.findMany({
      where: { entityType: 'reservation', entityId: r.id },
    })
    expect(righe).toHaveLength(1)
    expect(righe[0]!.action).toBe('reservation.create')
    expect(righe[0]!.actorType).toBe('USER')
  })
})

describe('posti stagionali', () => {
  async function conStagionale(label: string) {
    const s = await stabilimento(label)
    const ct = await prisma.seasonalContract.create({
      data: { beachClubId: s.club.id, seasonId: s.season.id, customerId: s.customer.id,
              umbrellaId: s.umbrella.id, startDate: day(2030, 5, 1), endDate: day(2030, 9, 30),
              priceCents: 180000, accessTokenHash: 'h' },
    })
    const giornaliero = await prisma.customer.create({
      data: { beachClubId: s.club.id, firstName: 'Giornaliero', lastName: 'Test' },
    })
    return { ...s, contratto: ct, giornaliero }
  }

  it('non si vende il posto di uno stagionale presente', async () => {
    const s = await conStagionale('seas-present')
    await expect(createReservation(s.ctx, {
      umbrellaIds: [s.umbrella.id], customerId: s.giornaliero.id,
      from: day(2030, 8, 12), to: day(2030, 8, 12),
    })).rejects.toMatchObject({ code: 'NO_ACTIVE_ABSENCE' })
  })

  it('scenario D · si vende dentro la finestra di assenza, marcato come temporaneo', async () => {
    const s = await conStagionale('seas-absent')
    const assenza = await prisma.seasonalAbsence.create({
      data: { beachClubId: s.club.id, seasonalContractId: s.contratto.id,
              startDate: day(2030, 8, 11), endDate: day(2030, 8, 14), declaredBy: 'CUSTOMER' },
    })

    const r = await createReservation(s.ctx, {
      umbrellaIds: [s.umbrella.id], customerId: s.giornaliero.id,
      from: day(2030, 8, 12), to: day(2030, 8, 13),
    })

    const item = await prisma.reservationItem.findFirstOrThrow({ where: { reservationId: r.id } })
    expect(item.isTemporarySlot).toBe(true)
    // È il collegamento che, in F6-12, farà maturare il credito allo stagionale.
    expect(item.seasonalAbsenceId).toBe(assenza.id)

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: r.id } })
    expect(audit.action).toBe('reservation.create.temporary')
  })

  it('non si vende oltre la finestra di assenza', async () => {
    const s = await conStagionale('seas-beyond')
    await prisma.seasonalAbsence.create({
      data: { beachClubId: s.club.id, seasonalContractId: s.contratto.id,
              startDate: day(2030, 8, 11), endDate: day(2030, 8, 13), declaredBy: 'CUSTOMER' },
    })
    // Il cliente ne vuole 4, ma lo stagionale rientra il 14.
    await expect(createReservation(s.ctx, {
      umbrellaIds: [s.umbrella.id], customerId: s.giornaliero.id,
      from: day(2030, 8, 11), to: day(2030, 8, 15),
    })).rejects.toMatchObject({ code: 'NO_ACTIVE_ABSENCE' })
  })

  it('RIENTRO AUTOMATICO · dopo la vendita temporanea il posto torna suo', async () => {
    const s = await conStagionale('seas-return')
    await prisma.seasonalAbsence.create({
      data: { beachClubId: s.club.id, seasonalContractId: s.contratto.id,
              startDate: day(2030, 8, 12), endDate: day(2030, 8, 12), declaredBy: 'CUSTOMER' },
    })
    await createReservation(s.ctx, {
      umbrellaIds: [s.umbrella.id], customerId: s.giornaliero.id,
      from: day(2030, 8, 12), to: day(2030, 8, 12),
    })

    const oggi = await getMapForDate(s.ctx, day(2030, 8, 12), OGGI)
    expect(oggi.umbrellas.find(u => u.id === s.umbrella.id)!.state).toBe('OCCUPATO')

    // Nessun job notturno, nessun intervento: il giorno dopo è di nuovo suo.
    const domani = await getMapForDate(s.ctx, day(2030, 8, 13), OGGI)
    expect(domani.umbrellas.find(u => u.id === s.umbrella.id)!.state).toBe('STAGIONALE_PRESENTE')
  })
})

describe('liberare e spostare', () => {
  it('annullare la testata libera davvero il posto', async () => {
    const s = await stabilimento('res-cancel')
    const r = await createReservation(s.ctx, {
      umbrellaIds: [s.umbrella.id], customerId: s.customer.id,
      from: day(2030, 8, 10), to: day(2030, 8, 15),
    })
    await cancelReservation(s.ctx, { reservationId: r.id, reason: 'Cliente non arrivato' })

    const mappa = await getMapForDate(s.ctx, day(2030, 8, 12), OGGI)
    expect(mappa.umbrellas.find(u => u.id === s.umbrella.id)!.state).toBe('LIBERO')

    // E il posto è di nuovo vendibile: nessuno deve toccare le righe a mano.
    await expect(createReservation(s.ctx, {
      umbrellaIds: [s.umbrella.id], customerId: s.customer.id,
      from: day(2030, 8, 10), to: day(2030, 8, 15),
    })).resolves.toBeDefined()
  })

  it('annullare due volte non è un errore', async () => {
    const s = await stabilimento('res-cancel-twice')
    const r = await createReservation(s.ctx, {
      umbrellaIds: [s.umbrella.id], customerId: s.customer.id,
      from: day(2030, 8, 10), to: day(2030, 8, 12),
    })
    await cancelReservation(s.ctx, { reservationId: r.id })
    await expect(cancelReservation(s.ctx, { reservationId: r.id })).resolves.toBeUndefined()
  })

  it('C-07 · spostare è un solo update, e non lascia il posto di origine occupato', async () => {
    const s = await stabilimento('res-move')
    const r = await createReservation(s.ctx, {
      umbrellaIds: [s.umbrella.id], customerId: s.customer.id,
      from: day(2030, 8, 10), to: day(2030, 8, 15),
    })
    const item = await prisma.reservationItem.findFirstOrThrow({ where: { reservationId: r.id } })

    await moveReservationItem(s.ctx, { itemId: item.id, toUmbrellaId: s.secondo.id })

    const mappa = await getMapForDate(s.ctx, day(2030, 8, 12), OGGI)
    expect(mappa.umbrellas.find(u => u.id === s.umbrella.id)!.state).toBe('LIBERO')
    expect(mappa.umbrellas.find(u => u.id === s.secondo.id)!.state).toBe('OCCUPATO')

    // Una sola riga: nessun "cancella e ricrea".
    const items = await prisma.reservationItem.findMany({ where: { reservationId: r.id } })
    expect(items).toHaveLength(1)
  })
})

describe('bloccare un ombrellone', () => {
  it("l'admin può bloccare a tempo indeterminato", async () => {
    const s = await stabilimento('block-admin')
    await expect(blockUmbrella(s.ctx, { umbrellaId: s.umbrella.id, reason: 'Palo rotto' }))
      .resolves.toBeUndefined()
  })

  it("l'operatore non può bloccare per sempre (docs/04 ▲¹)", async () => {
    const s = await stabilimento('block-operator')
    const operatore = ctxOf(s.club.id, s.user.id, 'OPERATOR')
    await expect(blockUmbrella(operatore, { umbrellaId: s.umbrella.id, reason: 'Guasto' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it("l'operatore può bloccare per il guasto del giorno", async () => {
    const s = await stabilimento('block-operator-ok')
    const operatore = ctxOf(s.club.id, s.user.id, 'OPERATOR')
    await expect(blockUmbrella(operatore, {
      umbrellaId: s.umbrella.id, reason: 'Telo strappato',
      until: new Date(Date.now() + 2 * 86_400_000),
    })).resolves.toBeUndefined()
  })
})
