/**
 * F5-02 · La mappa di un giorno.
 *
 * Due garanzie: gli stati sono quelli giusti, e il numero di query NON cresce
 * con gli ombrelloni. La seconda è quella che fa la differenza tra 500 ms e
 * cinque secondi su un tablet con il wifi dello stabilimento.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { getMapForDate } from '@/server/queries/map'
import { DEFAULT_SETTINGS, type Ctx } from '@/server/context'
import { prisma } from '@/server/repositories/scoped'
import { makeClub, day } from './helpers'

/** Client con log delle query: serve solo a contarle. */
const spia = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL! } },
  log: [{ emit: 'event', level: 'query' }],
})
let queryCount = 0
;(spia as any).$on('query', () => { queryCount++ })

const ctxOf = (beachClubId: string): Ctx => ({
  kind: 'STAFF', beachClubId, userId: 'u', actor: 'ADMIN',
  timezone: 'Europe/Rome', settings: DEFAULT_SETTINGS,
})

const OGGI = day(2030, 8, 12)

/** Uno stabilimento con un ombrellone per ogni stato possibile. */
async function scenario(label: string, quanti = 6) {
  const ctx = await makeClub(prisma, label)
  // Senza stagione attiva non si vende nulla, e la mappa lo dice: i test
  // devono partire da uno stabilimento aperto.
  await prisma.season.update({ where: { id: ctx.season.id },
    data: { status: 'ACTIVE', startDate: day(2030, 1, 1), endDate: day(2030, 12, 31) } })
  const umbrellas = [ctx.umbrella]
  for (let i = 1; i < quanti; i++) {
    umbrellas.push(await prisma.umbrella.create({
      data: { beachClubId: ctx.club.id, beachMapId: ctx.map.id,
              visibleNumber: String(100 + i), rowLabel: 'A', posX: i, posY: 0,
              basePriceCents: 2500 },
    }))
  }
  const cliente = async (nome: string) => prisma.customer.create({
    data: { beachClubId: ctx.club.id, firstName: nome, lastName: 'Test' },
  })
  const prenota = async (umbrellaId: string, from: Date, to: Date, customerId: string) => {
    const r = await prisma.reservation.create({
      data: { beachClubId: ctx.club.id, seasonId: ctx.season.id, customerId, totalCents: 5000 },
    })
    await prisma.reservationItem.create({
      data: { beachClubId: ctx.club.id, reservationId: r.id, umbrellaId,
              startDate: from, endDate: to, priceCents: 5000 },
    })
    return r
  }
  return { ctx, umbrellas, cliente, prenota }
}

beforeAll(async () => { await prisma.$connect() })
afterAll(async () => { await prisma.$disconnect(); await spia.$disconnect() })

describe('stati e contatori', () => {
  it('classifica correttamente ogni situazione e i contatori quadrano', async () => {
    const { ctx, umbrellas, cliente, prenota } = await scenario('map-states')
    const [u0, u1, u2, u3, u4, u5] = umbrellas as any[]

    // u0 → LIBERO (niente)
    // u1 → OCCUPATO (periodo che include oggi)
    await prenota(u1.id, day(2030, 8, 10), day(2030, 8, 15), (await cliente('Occupante')).id)
    // u2 → LIBERO oggi, PRENOTATO sulla mappa del 22 (verificato sotto):
    // una prenotazione futura non occupa il giorno di oggi.
    await prenota(u2.id, day(2030, 8, 20), day(2030, 8, 25), (await cliente('Futuro')).id)
    // u3 → STAGIONALE_PRESENTE
    const stag = await cliente('Stagionale')
    await prisma.seasonalContract.create({
      data: { beachClubId: ctx.club.id, seasonId: ctx.season.id, customerId: stag.id,
              umbrellaId: u3.id, startDate: day(2030, 5, 1), endDate: day(2030, 9, 30),
              priceCents: 180000, accessTokenHash: 'h1' },
    })
    // u4 → STAGIONALE_ASSENTE (vendibile oggi)
    const assente = await cliente('Assente')
    const ct = await prisma.seasonalContract.create({
      data: { beachClubId: ctx.club.id, seasonId: ctx.season.id, customerId: assente.id,
              umbrellaId: u4.id, startDate: day(2030, 5, 1), endDate: day(2030, 9, 30),
              priceCents: 180000, accessTokenHash: 'h2' },
    })
    await prisma.seasonalAbsence.create({
      data: { beachClubId: ctx.club.id, seasonalContractId: ct.id,
              startDate: day(2030, 8, 11), endDate: day(2030, 8, 14), declaredBy: 'CUSTOMER' },
    })
    // u5 → BLOCCATO
    await prisma.umbrella.update({ where: { id: u5.id },
      data: { blocked: true, blockedReason: 'Palo rotto' } })

    const mappa = await getMapForDate(ctxOf(ctx.club.id), OGGI, OGGI)
    const per = (id: string) => mappa.umbrellas.find(u => u.id === id)!

    expect(per(u0.id).state).toBe('LIBERO')
    expect(per(u1.id).state).toBe('OCCUPATO')
    expect(per(u2.id).state).toBe('LIBERO')          // la prenotazione è dal 20
    expect(per(u3.id).state).toBe('STAGIONALE_PRESENTE')
    expect(per(u4.id).state).toBe('STAGIONALE_ASSENTE')
    expect(per(u5.id).state).toBe('BLOCCATO')

    const c = mappa.counters
    expect(c.total).toBe(6)
    expect(c.free + c.occupied + c.booked + c.seasonalPresent + c.seasonalAbsent + c.blocked)
      .toBe(c.total)

    // Ciò che il gestore può vendere oggi: liberi + stagionali assenti.
    expect(c.sellable).toBe(c.free + c.seasonalAbsent)
    expect(c.sellable).toBe(3)                       // u0, u2, u4

    // Sulla mappa del 22, lo stesso ombrellone risulta PRENOTATO: `oggi` resta
    // il 12, quindi il 22 è un giorno futuro.
    const futura = await getMapForDate(ctxOf(ctx.club.id), day(2030, 8, 22), OGGI)
    expect(futura.umbrellas.find(u => u.id === u2.id)!.state).toBe('PRENOTATO')
    expect(futura.counters.booked).toBe(1)
  })

  it('il pannello ha già i dati che gli servono, senza altre query', async () => {
    const { ctx, umbrellas, cliente, prenota } = await scenario('map-panel', 2)
    const u = (umbrellas as any[])[1]
    const c = await cliente('Bianchi')
    const r = await prenota(u.id, day(2030, 8, 10), day(2030, 8, 15), c.id)
    await prisma.payment.create({
      data: { beachClubId: ctx.club.id, reservationId: r.id, amountCents: 2000 },
    })

    const mappa = await getMapForDate(ctxOf(ctx.club.id), OGGI, OGGI)
    const riga = mappa.umbrellas.find(x => x.id === u.id)!

    expect(riga.customerName).toBe('Bianchi Test')
    expect(riga.period).toEqual({ from: '2030-08-10', to: '2030-08-15' })
    expect(riga.amountDueCents).toBe(3000)   // 5000 totale − 2000 incassato
    expect(riga.reservationId).toBe(r.id)
  })

  it("mostra chi è lo stagionale assente e fino a quando", async () => {
    const { ctx, umbrellas, cliente } = await scenario('map-absence', 2)
    const u = (umbrellas as any[])[1]
    const verdi = await cliente('Verdi')
    const ct = await prisma.seasonalContract.create({
      data: { beachClubId: ctx.club.id, seasonId: ctx.season.id, customerId: verdi.id,
              umbrellaId: u.id, startDate: day(2030, 5, 1), endDate: day(2030, 9, 30),
              priceCents: 180000, accessTokenHash: 'h' },
    })
    await prisma.seasonalAbsence.create({
      data: { beachClubId: ctx.club.id, seasonalContractId: ct.id,
              startDate: day(2030, 8, 12), endDate: day(2030, 8, 14), declaredBy: 'CUSTOMER' },
    })

    const mappa = await getMapForDate(ctxOf(ctx.club.id), OGGI, OGGI)
    const riga = mappa.umbrellas.find(x => x.id === u.id)!

    expect(riga.state).toBe('STAGIONALE_ASSENTE')
    expect(riga.sellable).toBe(true)
    // Il pannello deve poter dire "torna riservato il 15": è ciò che toglie al
    // gestore la paura di vendere (docs/06 §3.3).
    expect(riga.absence).toEqual({
      id: expect.any(String), from: '2030-08-12', to: '2030-08-14', seasonalName: 'Verdi Test',
      // F6-13 · e quanto gli costa venderlo, mentre decide
      creditoGiornoCents: 750,        // 30% di 25 €
      creditoMotivo: 'MATURATO',
    })
  })

  it("dice che un'assenza tardiva non costa nulla", async () => {
    const { ctx, umbrellas, cliente } = await scenario('map-late', 2)
    const u = (umbrellas as any[])[1]
    const tizio = await cliente('Tardivo')
    const ct = await prisma.seasonalContract.create({
      data: { beachClubId: ctx.club.id, seasonId: ctx.season.id, customerId: tizio.id,
              umbrellaId: u.id, startDate: day(2030, 5, 1), endDate: day(2030, 9, 30),
              priceCents: 180000, accessTokenHash: 'h-late' },
    })
    await prisma.seasonalAbsence.create({
      data: { beachClubId: ctx.club.id, seasonalContractId: ct.id,
              startDate: OGGI, endDate: OGGI, declaredBy: 'CUSTOMER', isLate: true },
    })
    const mappa = await getMapForDate(ctxOf(ctx.club.id), OGGI, OGGI)
    const riga = mappa.umbrellas.find(x => x.id === u.id)!
    expect(riga.absence!.creditoGiornoCents).toBe(0)
    expect(riga.absence!.creditoMotivo).toBe('ASSENZA_TARDIVA')
  })
})

describe('nessun N+1', () => {
  it('il numero di query NON cresce con gli ombrelloni', async () => {
    const piccolo = await scenario('map-n1-small', 5)
    const grande  = await scenario('map-n1-big', 96)

    queryCount = 0
    await getMapForDate(ctxOf(piccolo.ctx.club.id), OGGI, OGGI, spia)
    const con5 = queryCount

    queryCount = 0
    await getMapForDate(ctxOf(grande.ctx.club.id), OGGI, OGGI, spia)
    const con96 = queryCount

    // Se fosse una query per ombrellone, sarebbero 96 round-trip: il target
    // di 500 ms si perderebbe tutto in latenza di rete.
    expect(con96).toBe(con5)
    expect(con96).toBeLessThanOrEqual(8)
  }, 60_000)

  it('96 ombrelloni si risolvono in fretta', async () => {
    const { ctx } = await scenario('map-perf', 96)
    const t0 = performance.now()
    const mappa = await getMapForDate(ctxOf(ctx.club.id), OGGI, OGGI)
    const ms = performance.now() - t0
    expect(mappa.umbrellas).toHaveLength(96)
    expect(ms).toBeLessThan(500)
  }, 60_000)
})

describe('fuori stagione', () => {
  it('non mostra come vendibile ciò che non si può vendere', async () => {
    const { ctx } = await scenario('map-fuori', 3)
    await prisma.season.update({ where: { id: ctx.season.id },
      data: { startDate: day(2030, 5, 1), endDate: day(2030, 8, 31) } })

    const dentro = await getMapForDate(ctxOf(ctx.club.id), day(2030, 8, 12), OGGI)
    expect(dentro.fuoriStagione).toBe(false)
    expect(dentro.counters.sellable).toBeGreaterThan(0)

    const fuori = await getMapForDate(ctxOf(ctx.club.id), day(2030, 10, 12), OGGI)
    expect(fuori.fuoriStagione).toBe(true)
    expect(fuori.counters.sellable).toBe(0)
  })
})
