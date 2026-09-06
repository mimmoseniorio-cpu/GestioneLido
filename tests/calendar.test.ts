/** F6-25 · Griglia ombrelloni × giorni. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { calendario } from '@/server/queries/calendar'
import { createReservation } from '@/server/use-cases/reservations'
import { declareAbsence } from '@/server/use-cases/absences'
import { prisma } from '@/server/repositories/scoped'
import { DEFAULT_SETTINGS, type Ctx } from '@/server/context'
import { makeClub } from './helpers'

const GIORNO = 86_400_000
const oggiUtc = () => {
  const o = new Date()
  return new Date(Date.UTC(o.getUTCFullYear(), o.getUTCMonth(), o.getUTCDate()))
}
const fraGiorni = (n: number) => new Date(oggiUtc().getTime() + n * GIORNO)
const iso = (d: Date) => d.toISOString().slice(0, 10)

async function stabilimento(label: string, quanti = 4) {
  const c = await makeClub(prisma, label)
  await prisma.season.update({ where: { id: c.season.id },
    data: { status: 'ACTIVE', startDate: fraGiorni(-30), endDate: fraGiorni(60) } })
  await prisma.umbrella.update({ where: { id: c.umbrella.id }, data: { basePriceCents: 2500 } })
  const ombrelloni = [c.umbrella]
  for (let i = 1; i < quanti; i++) {
    ombrelloni.push(await prisma.umbrella.create({
      data: { beachClubId: c.club.id, beachMapId: c.map.id, visibleNumber: String(300 + i),
              rowLabel: 'A', posX: i, posY: 0, basePriceCents: 2500 },
    }))
  }
  const ctx: Ctx = { kind: 'STAFF', beachClubId: c.club.id, userId: c.user.id,
                     actor: 'ADMIN', timezone: 'Europe/Rome', settings: DEFAULT_SETTINGS }
  return { ...c, ombrelloni, ctx }
}

beforeAll(async () => { await prisma.$connect() })
afterAll(async () => { await prisma.$disconnect() })

describe('griglia', () => {
  it('una riga per ombrellone e una colonna per giorno', async () => {
    const s = await stabilimento('cal-forma')
    const c = await calendario(s.ctx, oggiUtc(), 14)
    expect(c.righe).toHaveLength(4)
    expect(c.giorni).toHaveLength(14)
    for (const r of c.righe) expect(r.celle).toHaveLength(14)
    expect(c.dal).toBe(iso(oggiUtc()))
    expect(c.al).toBe(iso(fraGiorni(13)))
  })

  it('una prenotazione colora solo i suoi giorni', async () => {
    const s = await stabilimento('cal-prenota')
    const cliente = await prisma.customer.create({
      data: { beachClubId: s.club.id, firstName: 'Mario', lastName: 'Rossi' } })
    await createReservation(s.ctx, {
      umbrellaIds: [s.ombrelloni[1]!.id], customerId: cliente.id,
      from: fraGiorni(2), to: fraGiorni(4),
    })
    const c = await calendario(s.ctx, oggiUtc(), 14)
    const riga = c.righe.find(r => r.umbrellaId === s.ombrelloni[1]!.id)!

    expect(riga.celle[0]!.stato).toBe('LIBERO')
    expect(riga.celle[1]!.stato).toBe('LIBERO')
    for (const k of [2, 3, 4]) {
      expect(riga.celle[k]!.stato).toBe('PRENOTATO')
      expect(riga.celle[k]!.chi).toBe('Mario Rossi')
    }
    expect(riga.celle[5]!.stato).toBe('LIBERO')
  })

  it('mostra la finestra di assenza dentro un contratto stagionale', async () => {
    const s = await stabilimento('cal-assenza')
    const stag = await prisma.customer.create({
      data: { beachClubId: s.club.id, firstName: 'Luigi', lastName: 'Verdi' } })
    const ct = await prisma.seasonalContract.create({
      data: { beachClubId: s.club.id, seasonId: s.season.id, customerId: stag.id,
              umbrellaId: s.ombrelloni[2]!.id, startDate: fraGiorni(-10), endDate: fraGiorni(40),
              priceCents: 180000, accessTokenHash: 'h-cal' } })
    await declareAbsence(s.ctx, { contractId: ct.id, from: fraGiorni(3), to: fraGiorni(5) })

    const c = await calendario(s.ctx, oggiUtc(), 14)
    const riga = c.righe.find(r => r.umbrellaId === s.ombrelloni[2]!.id)!
    expect(riga.celle[0]!.stato).toBe('STAGIONALE_PRESENTE')
    for (const k of [3, 4, 5]) expect(riga.celle[k]!.stato).toBe('STAGIONALE_ASSENTE')
    expect(riga.celle[6]!.stato).toBe('STAGIONALE_PRESENTE')   // rientro automatico
  })

  it('il riepilogo dice quanti se ne possono vendere ogni giorno', async () => {
    const s = await stabilimento('cal-riepilogo')
    const cliente = await prisma.customer.create({
      data: { beachClubId: s.club.id, firstName: 'Tizio', lastName: 'T' } })
    await createReservation(s.ctx, {
      umbrellaIds: [s.ombrelloni[0]!.id], customerId: cliente.id,
      from: fraGiorni(1), to: fraGiorni(1),
    })
    const c = await calendario(s.ctx, oggiUtc(), 7)
    expect(c.riepilogo).toHaveLength(7)
    expect(c.riepilogo[0]!.vendibili).toBe(4)
    expect(c.riepilogo[1]!.vendibili).toBe(3)   // uno prenotato
    expect(c.riepilogo[1]!.occupati).toBe(1)
  })

  it('distingue i giorni festivi', async () => {
    const s = await stabilimento('cal-festivi')
    const c = await calendario(s.ctx, oggiUtc(), 14)
    const festivi = c.giorni.filter(g => !g.feriale)
    expect(festivi.length).toBeGreaterThanOrEqual(4)   // due settimane = 4 fra sab e dom
    for (const g of festivi) {
      const giorno = new Date(g.data + 'T00:00:00Z').getUTCDay()
      expect([0, 6]).toContain(giorno)
    }
  })

  it('non mostra ombrelloni di altri stabilimenti', async () => {
    const a = await stabilimento('cal-tenant-a', 2)
    await stabilimento('cal-tenant-b', 3)
    const c = await calendario(a.ctx, oggiUtc(), 7)
    expect(c.righe).toHaveLength(2)
  })
})

describe('fuori stagione', () => {
  it('i giorni oltre la fine della stagione non contano come vendibili', async () => {
    // Fuori stagione tutti gli ombrelloni risultano "liberi" per la funzione di
    // stato, ma non sono vendibili: mostrarli come disponibili sarebbe un
    // numero falso, e i numeri falsi fanno smettere di usare il calendario.
    const s = await stabilimento('cal-fuori')
    await prisma.season.update({ where: { id: s.season.id },
      data: { startDate: fraGiorni(-30), endDate: fraGiorni(3) } })

    const c = await calendario(s.ctx, oggiUtc(), 10)
    expect(c.giorni[0]!.fuoriStagione).toBe(false)
    expect(c.giorni[3]!.fuoriStagione).toBe(false)
    expect(c.giorni[4]!.fuoriStagione).toBe(true)

    expect(c.riepilogo[0]!.vendibili).toBe(4)
    expect(c.riepilogo[4]!.vendibili).toBe(0)   // chiuso: niente da vendere
  })
})
