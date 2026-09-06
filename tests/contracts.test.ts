/**
 * F6-05 / F6-11 · Contratti stagionali gestiti dal gestore.
 *
 * Prima di questo, gli stagionali esistevano solo nel seed: la funzione che
 * vale il prodotto era inarrivabile per chi lo usa davvero. Qui si verifica
 * che il gestore possa crearli, che gli venga detto QUALI prenotazioni sono
 * in conflitto (C-16), e che annullare un contratto non tolga il posto a
 * qualcuno che ha già pagato (C-17, D-01).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { creaContratto, annullaContratto } from '@/server/use-cases/contracts'
import { declareAbsence } from '@/server/use-cases/absences'
import { createReservation } from '@/server/use-cases/reservations'
import { elencoStagionali } from '@/server/queries/seasonal'
import { prisma } from '@/server/repositories/scoped'
import { hashToken } from '@/server/auth/magic-link'
import { DEFAULT_SETTINGS, type Ctx } from '@/server/context'
import { makeClub } from './helpers'

const GIORNO = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
/** Come in absences.test.ts: il taglio delle 20:00 rende «domani» instabile
 *  a seconda dell'ora in cui girano i test. Un giorno di margine lo evita. */
const MARGINE = 1
const fraGiorni = (n: number) => {
  const o = new Date()
  const base = Date.UTC(o.getUTCFullYear(), o.getUTCMonth(), o.getUTCDate())
  return new Date(base + (n > 0 ? n + MARGINE : n) * GIORNO)
}

const staff = (beachClubId: string, userId: string,
               actor: 'ADMIN' | 'OPERATOR' = 'ADMIN'): Ctx => ({
  kind: 'STAFF', beachClubId, userId, actor,
  timezone: 'Europe/Rome', settings: DEFAULT_SETTINGS,
})

async function scenario(label: string) {
  const c = await makeClub(prisma, label)
  const inizio = fraGiorni(-30), fine = fraGiorni(60)
  await prisma.season.update({ where: { id: c.season.id },
    data: { status: 'ACTIVE', startDate: inizio, endDate: fine } })
  const giornaliero = await prisma.customer.create({
    data: { beachClubId: c.club.id, firstName: 'Giornaliero', lastName: label },
  })
  await prisma.priceRule.create({
    data: { beachClubId: c.club.id, seasonId: c.season.id, name: 'Base',
            priority: 0, priceCents: 2500 },
  })
  return { ...c, inizio, fine, giornaliero,
           ctx: staff(c.club.id, c.user.id),
           ctxOperatore: staff(c.club.id, c.user.id, 'OPERATOR') }
}

beforeAll(async () => { await prisma.$connect() })
afterAll(async () => { await prisma.$disconnect() })

// ─────────────────────────────────────────────────────────────────────────
describe('F6-05 · creazione del contratto', () => {
  it('crea il contratto e restituisce un token che apre l’area del cliente', async () => {
    const s = await scenario('crea')
    const { id, token } = await creaContratto(s.ctx, {
      customerId: s.customer.id, umbrellaId: s.umbrella.id,
      dal: s.inizio, al: s.fine, prezzoCents: 180_000,
    })

    const riga = await prisma.seasonalContract.findUniqueOrThrow({ where: { id } })
    expect(riga.status).toBe('ACTIVE')
    expect(riga.priceCents).toBe(180_000)
    // Il token in chiaro non finisce nel database: solo il suo hash (D-05).
    expect(riga.accessTokenHash).toBe(hashToken(token))
    expect(riga.accessTokenHash).not.toContain(token)
  })

  it('il cliente diventa stagionale', async () => {
    const s = await scenario('flag')
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: s.customer.id } })).isSeasonal)
      .toBe(false)
    await creaContratto(s.ctx, { customerId: s.customer.id, umbrellaId: s.umbrella.id,
      dal: s.inizio, al: s.fine, prezzoCents: 180_000 })
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: s.customer.id } })).isSeasonal)
      .toBe(true)
  })

  it('rifiuta un periodo fuori dalla stagione, dicendo quali sono le date buone', async () => {
    const s = await scenario('fuori')
    await expect(creaContratto(s.ctx, {
      customerId: s.customer.id, umbrellaId: s.umbrella.id,
      dal: s.inizio, al: new Date(s.fine.getTime() + 10 * GIORNO), prezzoCents: 180_000,
    })).rejects.toMatchObject({
      code: 'INVALID_RANGE',
      details: { stagioneDal: iso(s.inizio), stagioneAl: iso(s.fine) },
    })
  })

  it('rifiuta un intervallo rovesciato', async () => {
    const s = await scenario('rovescio')
    await expect(creaContratto(s.ctx, {
      customerId: s.customer.id, umbrellaId: s.umbrella.id,
      dal: s.fine, al: s.inizio, prezzoCents: 180_000,
    })).rejects.toMatchObject({ code: 'INVALID_RANGE' })
  })

  it('rifiuta un ombrellone fuori servizio, chiamandolo per numero', async () => {
    const s = await scenario('blocco')
    await prisma.umbrella.update({ where: { id: s.umbrella.id }, data: { blocked: true } })
    await expect(creaContratto(s.ctx, {
      customerId: s.customer.id, umbrellaId: s.umbrella.id,
      dal: s.inizio, al: s.fine, prezzoCents: 180_000,
    })).rejects.toMatchObject({ code: 'UMBRELLA_BLOCKED', message: expect.stringContaining('63') })
  })
})

// ─────────────────────────────────────────────────────────────────────────
describe('C-16 · il conflitto dice QUALI prenotazioni', () => {
  it('elenca cliente e date di ogni prenotazione che blocca il contratto', async () => {
    const s = await scenario('c16')
    const dal = fraGiorni(5), al = fraGiorni(8)
    const pren = await createReservation(s.ctx, {
      customerId: s.giornaliero.id, umbrellaIds: [s.umbrella.id],
      from: dal, to: al
    })

    const errore = await creaContratto(s.ctx, {
      customerId: s.customer.id, umbrellaId: s.umbrella.id,
      dal: s.inizio, al: s.fine, prezzoCents: 180_000,
    }).catch(e => e)

    expect(errore.code).toBe('UMBRELLA_NOT_AVAILABLE')
    // Senza i dettagli il gestore saprebbe solo che «non si può»: non
    // potrebbe decidere se spostare quella prenotazione altrove.
    expect(errore.details.prenotazioni).toEqual([
      { id: pren.id, cliente: `Giornaliero c16`, dal: iso(dal), al: iso(al) },
    ])
    expect(await prisma.seasonalContract.count({ where: { beachClubId: s.club.id } })).toBe(0)
  })

  it('una prenotazione annullata non è un conflitto', async () => {
    const s = await scenario('c16b')
    const res = await prisma.reservation.create({
      data: { beachClubId: s.club.id, seasonId: s.season.id,
              customerId: s.giornaliero.id, status: 'CANCELLED', totalCents: 1000 },
    })
    await prisma.reservationItem.create({
      data: { beachClubId: s.club.id, reservationId: res.id, umbrellaId: s.umbrella.id,
              startDate: fraGiorni(5), endDate: fraGiorni(8),
              status: 'CANCELLED', priceCents: 1000 },
    })
    await expect(creaContratto(s.ctx, {
      customerId: s.customer.id, umbrellaId: s.umbrella.id,
      dal: s.inizio, al: s.fine, prezzoCents: 180_000,
    })).resolves.toMatchObject({ id: expect.any(String) })
  })

  it('il database rifiuta comunque due contratti attivi sovrapposti', async () => {
    const s = await scenario('overlap')
    await creaContratto(s.ctx, { customerId: s.customer.id, umbrellaId: s.umbrella.id,
      dal: s.inizio, al: s.fine, prezzoCents: 180_000 })
    const altro = await prisma.customer.create({
      data: { beachClubId: s.club.id, firstName: 'Secondo', lastName: 'Cliente' },
    })
    await expect(creaContratto(s.ctx, {
      customerId: altro.id, umbrellaId: s.umbrella.id,
      dal: s.inizio, al: s.fine, prezzoCents: 180_000,
    })).rejects.toMatchObject({ code: 'CONTRACT_OVERLAP' })
  })
})

// ─────────────────────────────────────────────────────────────────────────
describe('annullamento del contratto', () => {
  it('C-17 · la vendita temporanea già fatta resta valida', async () => {
    const s = await scenario('c17')
    const { id } = await creaContratto(s.ctx, {
      customerId: s.customer.id, umbrellaId: s.umbrella.id,
      dal: s.inizio, al: s.fine, prezzoCents: 180_000,
    })
    const dal = fraGiorni(3), al = fraGiorni(4)
    await declareAbsence(s.ctx, { contractId: id, from: dal, to: al })
    const venduta = await createReservation(s.ctx, {
      customerId: s.giornaliero.id, umbrellaIds: [s.umbrella.id],
      from: dal, to: al
    })

    await annullaContratto(s.ctx, { id, motivo: 'cliente non rinnova' })

    expect((await prisma.seasonalContract.findUniqueOrThrow({ where: { id } })).status)
      .toBe('CANCELLED')
    // L'assenza si chiude — non c'è più un contratto da cui assentarsi —
    // ma chi ha pagato quei giorni li tiene (D-01).
    const assenze = await prisma.seasonalAbsence.findMany({ where: { seasonalContractId: id } })
    expect(assenze.map(a => a.status)).toEqual(['CANCELLED'])
    const items = await prisma.reservationItem.findMany({
      where: { reservationId: venduta.id } })
    expect(items.map(i => i.status)).toEqual(['CONFIRMED'])
  })

  it('il cliente smette di essere stagionale solo se non ha altri contratti', async () => {
    const s = await scenario('flag2')
    const secondo = await prisma.umbrella.create({
      data: { beachClubId: s.club.id, beachMapId: s.map.id, visibleNumber: '64',
              rowLabel: 'A', posX: 2, posY: 1, basePriceCents: 2500 },
    })
    const a = await creaContratto(s.ctx, { customerId: s.customer.id, umbrellaId: s.umbrella.id,
      dal: s.inizio, al: s.fine, prezzoCents: 180_000 })
    const b = await creaContratto(s.ctx, { customerId: s.customer.id, umbrellaId: secondo.id,
      dal: s.inizio, al: s.fine, prezzoCents: 180_000 })

    await annullaContratto(s.ctx, { id: a.id })
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: s.customer.id } })).isSeasonal)
      .toBe(true)
    await annullaContratto(s.ctx, { id: b.id })
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: s.customer.id } })).isSeasonal)
      .toBe(false)
  })

  it('annullare due volte non è un errore', async () => {
    const s = await scenario('idem')
    const { id } = await creaContratto(s.ctx, { customerId: s.customer.id,
      umbrellaId: s.umbrella.id, dal: s.inizio, al: s.fine, prezzoCents: 180_000 })
    await annullaContratto(s.ctx, { id })
    await expect(annullaContratto(s.ctx, { id })).resolves.toBeUndefined()
    // Un secondo annullamento non deve lasciare traccia in audit come se
    // fosse successo qualcosa.
    expect(await prisma.auditLog.count({
      where: { beachClubId: s.club.id, action: 'contract.cancel' } })).toBe(1)
  })

  it('lo stesso ombrellone torna assegnabile dopo l’annullamento', async () => {
    const s = await scenario('riuso')
    const { id } = await creaContratto(s.ctx, { customerId: s.customer.id,
      umbrellaId: s.umbrella.id, dal: s.inizio, al: s.fine, prezzoCents: 180_000 })
    await annullaContratto(s.ctx, { id })
    const altro = await prisma.customer.create({
      data: { beachClubId: s.club.id, firstName: 'Nuovo', lastName: 'Stagionale' },
    })
    await expect(creaContratto(s.ctx, { customerId: altro.id, umbrellaId: s.umbrella.id,
      dal: s.inizio, al: s.fine, prezzoCents: 180_000 })).resolves.toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────
describe('F6-11 · l’operatore registra l’assenza per chi telefona', () => {
  it('l’assenza dichiarata dallo staff risulta come STAFF, non come CUSTOMER', async () => {
    const s = await scenario('f611')
    const { id } = await creaContratto(s.ctx, { customerId: s.customer.id,
      umbrellaId: s.umbrella.id, dal: s.inizio, al: s.fine, prezzoCents: 180_000 })
    const a = await declareAbsence(s.ctxOperatore, {
      contractId: id, from: fraGiorni(2), to: fraGiorni(2) })
    const riga = await prisma.seasonalAbsence.findUniqueOrThrow({ where: { id: a.id } })
    expect(riga.declaredBy).toBe('STAFF')
    expect(riga.status).toBe('ACTIVE')
  })

  it('chi è assente oggi viene prima: è il posto che il gestore può vendere adesso', async () => {
    const s = await scenario('ordine')
    const secondo = await prisma.umbrella.create({
      data: { beachClubId: s.club.id, beachMapId: s.map.id, visibleNumber: '10',
              rowLabel: 'A', posX: 2, posY: 1, basePriceCents: 2500 },
    })
    const altro = await prisma.customer.create({
      data: { beachClubId: s.club.id, firstName: 'Assente', lastName: 'Oggi' },
    })
    await creaContratto(s.ctx, { customerId: s.customer.id, umbrellaId: s.umbrella.id,
      dal: s.inizio, al: s.fine, prezzoCents: 180_000 })
    const b = await creaContratto(s.ctx, { customerId: altro.id, umbrellaId: secondo.id,
      dal: s.inizio, al: s.fine, prezzoCents: 180_000 })
    // Assenza che copre oggi: creata direttamente, perché dichiararla per
    // oggi passerebbe dal controllo del taglio.
    await prisma.seasonalAbsence.create({
      data: { beachClubId: s.club.id, seasonalContractId: b.id,
              startDate: fraGiorni(-1), endDate: fraGiorni(3),
              declaredBy: 'STAFF', status: 'ACTIVE' },
    })

    const righe = await elencoStagionali(s.ctx)
    expect(righe.map(r => r.ombrellone)).toEqual(['10', '63'])
    expect(righe[0]!.assenteOggi).toEqual({ dal: iso(fraGiorni(-1)), al: iso(fraGiorni(3)) })
    expect(righe[1]!.assenteOggi).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────
describe('permessi e tenant', () => {
  it('l’operatore non può creare contratti: è una decisione del titolare', async () => {
    const s = await scenario('perm')
    await expect(creaContratto(s.ctxOperatore, {
      customerId: s.customer.id, umbrellaId: s.umbrella.id,
      dal: s.inizio, al: s.fine, prezzoCents: 180_000,
    })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('l’operatore non può annullarli', async () => {
    const s = await scenario('perm2')
    const { id } = await creaContratto(s.ctx, { customerId: s.customer.id,
      umbrellaId: s.umbrella.id, dal: s.inizio, al: s.fine, prezzoCents: 180_000 })
    await expect(annullaContratto(s.ctxOperatore, { id }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('il contratto di un altro stabilimento è NOT_FOUND, non FORBIDDEN', async () => {
    const a = await scenario('tenant-a')
    const b = await scenario('tenant-b')
    const { id } = await creaContratto(a.ctx, { customerId: a.customer.id,
      umbrellaId: a.umbrella.id, dal: a.inizio, al: a.fine, prezzoCents: 180_000 })
    // Un 403 confermerebbe che quel contratto esiste (docs/04 §3.1).
    await expect(annullaContratto(b.ctx, { id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect((await prisma.seasonalContract.findUniqueOrThrow({ where: { id } })).status)
      .toBe('ACTIVE')
  })

  it('non si può intestare un contratto al cliente di un altro stabilimento', async () => {
    const a = await scenario('tenant-c')
    const b = await scenario('tenant-d')
    await expect(creaContratto(a.ctx, { customerId: b.customer.id,
      umbrellaId: a.umbrella.id, dal: a.inizio, al: a.fine, prezzoCents: 180_000 }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
