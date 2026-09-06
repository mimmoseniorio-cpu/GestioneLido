/** F6-17 · Gestione del listino: il gestore deve poter cambiare i suoi prezzi. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { creaRegola, modificaRegola, disattivaRegola } from '@/server/use-cases/price-rules'
import { createReservation } from '@/server/use-cases/reservations'
import { prisma } from '@/server/repositories/scoped'
import { DEFAULT_SETTINGS, type Ctx } from '@/server/context'
import { makeClub } from './helpers'

const GIORNO = 86_400_000
const fraGiorni = (n: number) => {
  const o = new Date()
  return new Date(Date.UTC(o.getUTCFullYear(), o.getUTCMonth(), o.getUTCDate()) + n * GIORNO)
}
const ctxDi = (beachClubId: string, userId: string, actor: 'ADMIN' | 'OPERATOR' = 'ADMIN'): Ctx => ({
  kind: 'STAFF', beachClubId, userId, actor, timezone: 'Europe/Rome', settings: DEFAULT_SETTINGS,
})

async function stabilimento(label: string) {
  const c = await makeClub(prisma, label)
  await prisma.season.update({ where: { id: c.season.id },
    data: { status: 'ACTIVE', startDate: fraGiorni(-30), endDate: fraGiorni(60) } })
  await prisma.umbrella.update({ where: { id: c.umbrella.id }, data: { basePriceCents: 2500 } })
  const cliente = await prisma.customer.create({
    data: { beachClubId: c.club.id, firstName: 'Tizio', lastName: label } })
  return { ...c, cliente, ctx: ctxDi(c.club.id, c.user.id) }
}

beforeAll(async () => { await prisma.$connect() })
afterAll(async () => { await prisma.$disconnect() })

describe('creare e applicare una regola', () => {
  it('la regola creata cambia subito il prezzo delle nuove prenotazioni', async () => {
    const s = await stabilimento('pr-crea')
    const prima = await createReservation(s.ctx, {
      umbrellaIds: [s.umbrella.id], customerId: s.cliente.id,
      from: fraGiorni(1), to: fraGiorni(1),
    })
    expect(prima.totalCents).toBe(2500)          // tariffa base

    await creaRegola(s.ctx, { name: 'Alta stagione', priority: 100, priceCents: 4500 })

    const dopo = await createReservation(s.ctx, {
      umbrellaIds: [s.umbrella.id], customerId: s.cliente.id,
      from: fraGiorni(3), to: fraGiorni(3),
    })
    expect(dopo.totalCents).toBe(4500)

    // e la prenotazione di prima non si è mossa (T-40)
    const item = await prisma.reservationItem.findFirstOrThrow({
      where: { reservationId: prima.id } })
    expect(item.priceCents).toBe(2500)
  })

  it('modificare il prezzo di una regola vale da subito', async () => {
    const s = await stabilimento('pr-modifica')
    const r = await creaRegola(s.ctx, { name: 'Base', priority: 50, priceCents: 3000 })
    await modificaRegola(s.ctx, { id: r.id, priceCents: 3900 })
    const p = await createReservation(s.ctx, {
      umbrellaIds: [s.umbrella.id], customerId: s.cliente.id,
      from: fraGiorni(1), to: fraGiorni(1),
    })
    expect(p.totalCents).toBe(3900)
  })

  it('disattivare una regola la toglie dal calcolo senza cancellarla', async () => {
    const s = await stabilimento('pr-disattiva')
    const r = await creaRegola(s.ctx, { name: 'Promo', priority: 100, priceCents: 1000 })
    await disattivaRegola(s.ctx, { id: r.id })

    const p = await createReservation(s.ctx, {
      umbrellaIds: [s.umbrella.id], customerId: s.cliente.id,
      from: fraGiorni(1), to: fraGiorni(1),
    })
    expect(p.totalCents).toBe(2500)              // torna la tariffa base

    // la riga resta: cancellarla renderebbe illeggibile il perché dei prezzi passati
    const ancora = await prisma.priceRule.findUniqueOrThrow({ where: { id: r.id } })
    expect(ancora.active).toBe(false)
    expect(ancora.name).toBe('Promo')
  })
})

describe('validazione', () => {
  it('rifiuta una regola senza nome', async () => {
    const s = await stabilimento('pr-nome')
    await expect(creaRegola(s.ctx, { name: '   ', priority: 10, priceCents: 100 }))
      .rejects.toMatchObject({ code: 'INVALID_RANGE' })
  })

  it('rifiuta un prezzo negativo', async () => {
    const s = await stabilimento('pr-negativo')
    await expect(creaRegola(s.ctx, { name: 'X', priority: 10, priceCents: -1 }))
      .rejects.toMatchObject({ code: 'INVALID_RANGE' })
  })

  it('rifiuta un periodo rovesciato', async () => {
    const s = await stabilimento('pr-periodo')
    await expect(creaRegola(s.ctx, { name: 'X', priority: 10, priceCents: 100,
      dateFrom: fraGiorni(10), dateTo: fraGiorni(2) }))
      .rejects.toMatchObject({ code: 'INVALID_RANGE' })
  })

  it('rifiuta durata minima maggiore della massima', async () => {
    const s = await stabilimento('pr-durata')
    await expect(creaRegola(s.ctx, { name: 'X', priority: 10, priceCents: 100,
      minDays: 10, maxDays: 3 })).rejects.toMatchObject({ code: 'INVALID_RANGE' })
  })

  it('rifiuta un giorno della settimana inesistente', async () => {
    const s = await stabilimento('pr-giorni')
    await expect(creaRegola(s.ctx, { name: 'X', priority: 10, priceCents: 100, weekdays: [8] }))
      .rejects.toMatchObject({ code: 'INVALID_RANGE' })
  })
})

describe('permessi', () => {
  it('l’operatore non tocca il listino', async () => {
    const s = await stabilimento('pr-permessi')
    const operatore = ctxDi(s.club.id, s.user.id, 'OPERATOR')
    await expect(creaRegola(operatore, { name: 'X', priority: 10, priceCents: 100 }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('una regola di un altro stabilimento non esiste', async () => {
    const a = await stabilimento('pr-tenant-a')
    const b = await stabilimento('pr-tenant-b')
    const r = await creaRegola(b.ctx, { name: 'Sua', priority: 10, priceCents: 100 })
    await expect(modificaRegola(a.ctx, { id: r.id, priceCents: 1 }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
