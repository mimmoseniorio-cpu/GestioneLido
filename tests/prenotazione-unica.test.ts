/**
 * Prenotazione in una chiamata sola: cliente, prenotazione e incasso nella
 * stessa transazione.
 *
 * Nasce da un difetto di velocità — tre andate e ritorni sulla rete di uno
 * stabilimento — ma il test che conta è un altro: se una parte fallisce, non
 * deve restarne nessuna. Un cliente creato e mai usato sporca l'anagrafica
 * per sempre; una prenotazione senza l'incasso che l'operatore ha già preso
 * in mano non la scopre nessuno fino alla chiusura di cassa.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createReservation } from '@/server/use-cases/reservations'
import { prisma } from '@/server/repositories/scoped'
import { DEFAULT_SETTINGS, type Ctx } from '@/server/context'
import { makeClub, day } from './helpers'

const staff = (beachClubId: string, userId: string): Ctx => ({
  kind: 'STAFF', beachClubId, userId, actor: 'ADMIN',
  timezone: 'Europe/Rome', settings: DEFAULT_SETTINGS,
})

async function scenario(label: string) {
  const c = await makeClub(prisma, label)
  await prisma.season.update({ where: { id: c.season.id }, data: { status: 'ACTIVE' } })
  await prisma.priceRule.create({
    data: { beachClubId: c.club.id, seasonId: c.season.id, name: 'Base',
            priority: 0, priceCents: 2500 },
  })
  return { ...c, ctx: staff(c.club.id, c.user.id) }
}

const clienti = (clubId: string) =>
  prisma.customer.count({ where: { beachClubId: clubId } })

beforeAll(async () => { await prisma.$connect() })
afterAll(async () => { await prisma.$disconnect() })

describe('cliente creato al volo', () => {
  it('crea cliente e prenotazione in un colpo solo', async () => {
    const s = await scenario('unica')
    const r = await createReservation(s.ctx, {
      umbrellaIds: [s.umbrella.id],
      cliente: { firstName: 'Mimmo', lastName: 'Dotolo', phone: '3331234567' },
      from: day(2030, 8, 10), to: day(2030, 8, 12),
    })
    expect(r.customerName).toBe('Mimmo Dotolo')
    const cliente = await prisma.customer.findUniqueOrThrow({ where: { id: r.customerId } })
    expect(cliente.phoneNormalized).toBe('+393331234567')
    expect(await prisma.reservationItem.count({ where: { reservationId: r.id } })).toBe(1)
  })

  it('senza nome il cliente resta prenotabile: al banco basta il cognome', async () => {
    const s = await scenario('cognome')
    const r = await createReservation(s.ctx, {
      umbrellaIds: [s.umbrella.id], cliente: { lastName: 'Bianchi' },
      from: day(2030, 8, 10), to: day(2030, 8, 10),
    })
    expect(r.customerName).toBe('Cliente Bianchi')
  })

  it('C-80 · lo stesso telefono ritrova il cliente, non ne crea un secondo', async () => {
    const s = await scenario('c80')
    const secondo = await prisma.umbrella.create({
      data: { beachClubId: s.club.id, beachMapId: s.map.id, visibleNumber: '64',
              rowLabel: 'A', posX: 2, posY: 1, basePriceCents: 2500 },
    })
    const prima = await clienti(s.club.id)
    const a = await createReservation(s.ctx, {
      umbrellaIds: [s.umbrella.id], cliente: { lastName: 'Russo', phone: '+39 333 000 1122' },
      from: day(2030, 8, 10), to: day(2030, 8, 10),
    })
    const b = await createReservation(s.ctx, {
      umbrellaIds: [secondo.id], cliente: { lastName: 'Russo', phone: '333 0001122' },
      from: day(2030, 8, 11), to: day(2030, 8, 11),
    })
    expect(b.customerId).toBe(a.customerId)
    expect(await clienti(s.club.id)).toBe(prima + 1)
  })

  it('senza cliente né customerId rifiuta, invece di prenotare a nome di nessuno', async () => {
    const s = await scenario('senza')
    await expect(createReservation(s.ctx, {
      umbrellaIds: [s.umbrella.id], from: day(2030, 8, 10), to: day(2030, 8, 10),
    })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('incasso contestuale', () => {
  it('«prenotato e pagato» è un gesto solo', async () => {
    const s = await scenario('pagato')
    const r = await createReservation(s.ctx, {
      umbrellaIds: [s.umbrella.id], cliente: { lastName: 'Verdi' },
      from: day(2030, 8, 10), to: day(2030, 8, 12), incassa: { method: 'CASH' },
    })
    expect(r.incasso).toEqual({ pagatoCents: r.totalCents, stato: 'PAID', eccedenzaCents: 0 })
    const pren = await prisma.reservation.findUniqueOrThrow({ where: { id: r.id } })
    expect(pren.paymentStatus).toBe('PAID')
    const pagamenti = await prisma.payment.findMany({ where: { reservationId: r.id } })
    expect(pagamenti).toHaveLength(1)
    expect(pagamenti[0]!.amountCents).toBe(r.totalCents)
    // Chi ha incassato resta scritto: serve alla chiusura di cassa.
    expect(pagamenti[0]!.collectedById).toBe(s.user.id)
  })

  it('senza incasso la prenotazione resta da pagare', async () => {
    const s = await scenario('daPagare')
    const r = await createReservation(s.ctx, {
      umbrellaIds: [s.umbrella.id], cliente: { lastName: 'Neri' },
      from: day(2030, 8, 10), to: day(2030, 8, 10),
    })
    expect(r.incasso).toBeUndefined()
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: r.id } })).paymentStatus)
      .toBe('UNPAID')
  })
})

describe('atomicità — la ragione vera per cui è una chiamata sola', () => {
  it('se l’ombrellone non è più libero, il cliente NON resta in anagrafica', async () => {
    const s = await scenario('orfano')
    await createReservation(s.ctx, {
      umbrellaIds: [s.umbrella.id], cliente: { lastName: 'Primo' },
      from: day(2030, 8, 10), to: day(2030, 8, 15),
    })
    const prima = await clienti(s.club.id)

    // Il secondo cliente esiste solo dentro la transazione che sta per fallire.
    await expect(createReservation(s.ctx, {
      umbrellaIds: [s.umbrella.id], cliente: { lastName: 'Sfortunato', phone: '3339998877' },
      from: day(2030, 8, 12), to: day(2030, 8, 13),
    })).rejects.toMatchObject({ code: 'UMBRELLA_NOT_AVAILABLE' })

    expect(await clienti(s.club.id)).toBe(prima)
    expect(await prisma.customer.findFirst({
      where: { beachClubId: s.club.id, lastName: 'Sfortunato' } })).toBeNull()
  })

  it('lo sconto oltre soglia non lascia dietro né cliente né incasso', async () => {
    const s = await scenario('sconto')
    const operatore: Ctx = { ...s.ctx, actor: 'OPERATOR' } as Ctx
    const prima = await clienti(s.club.id)
    await expect(createReservation(operatore, {
      umbrellaIds: [s.umbrella.id], cliente: { lastName: 'Scontato' },
      from: day(2030, 8, 10), to: day(2030, 8, 12),
      override: { totaleCents: 100, motivo: 'amico del titolare' },
      incassa: { method: 'CASH' },
    })).rejects.toMatchObject({ code: 'DISCOUNT_ABOVE_LIMIT' })

    expect(await clienti(s.club.id)).toBe(prima)
    expect(await prisma.payment.count({ where: { beachClubId: s.club.id } })).toBe(0)
  })
})
