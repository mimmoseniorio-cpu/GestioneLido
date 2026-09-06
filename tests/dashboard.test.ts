/**
 * F6-24 · Dashboard (criterio 9 di accettazione: i numeri quadrano).
 *
 * Una dashboard che non quadra con le prenotazioni è peggio di nessuna
 * dashboard: il gestore la usa per decidere, e se sbaglia una volta smette di
 * fidarsene per sempre.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { dashboard } from '@/server/queries/dashboard'
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

const staff = (beachClubId: string, userId: string): Ctx => ({
  kind: 'STAFF', beachClubId, userId, actor: 'ADMIN',
  timezone: 'Europe/Rome', settings: DEFAULT_SETTINGS,
})

async function stabilimento(label: string, quanti = 6) {
  const c = await makeClub(prisma, label)
  await prisma.season.update({ where: { id: c.season.id },
    data: { status: 'ACTIVE', startDate: fraGiorni(-30), endDate: fraGiorni(60) } })
  await prisma.umbrella.update({ where: { id: c.umbrella.id }, data: { basePriceCents: 2500 } })
  const ombrelloni = [c.umbrella]
  for (let i = 1; i < quanti; i++) {
    ombrelloni.push(await prisma.umbrella.create({
      data: { beachClubId: c.club.id, beachMapId: c.map.id, visibleNumber: String(200 + i),
              rowLabel: 'A', posX: i, posY: 0, basePriceCents: 2500 },
    }))
  }
  const cliente = async (nome: string) => prisma.customer.create({
    data: { beachClubId: c.club.id, firstName: nome, lastName: label },
  })
  return { ...c, ombrelloni, cliente, ctx: staff(c.club.id, c.user.id) }
}

beforeAll(async () => { await prisma.$connect() })
afterAll(async () => { await prisma.$disconnect() })

describe('criterio 9 · i numeri quadrano', () => {
  it('gli stati sommano al totale degli ombrelloni', async () => {
    const s = await stabilimento('dash-somma')
    await createReservation(s.ctx, {
      umbrellaIds: [s.ombrelloni[1]!.id], customerId: (await s.cliente('Uno')).id,
      from: fraGiorni(0), to: fraGiorni(2),
    })
    await prisma.umbrella.update({ where: { id: s.ombrelloni[2]!.id },
      data: { blocked: true, blockedReason: 'Palo' } })

    const d = await dashboard(s.ctx)
    const o = d.occupazione
    expect(o.occupati + o.liberi + o.stagionali + o.assenti + o.fuoriServizio).toBe(o.totali)
    expect(o.totali).toBe(6)
  })

  it('«disponibili da vendere» = liberi + stagionali assenti', async () => {
    const s = await stabilimento('dash-vendibili')
    const stag = await s.cliente('Stagionale')
    const ct = await prisma.seasonalContract.create({
      data: { beachClubId: s.club.id, seasonId: s.season.id, customerId: stag.id,
              umbrellaId: s.ombrelloni[1]!.id, startDate: fraGiorni(-10), endDate: fraGiorni(40),
              priceCents: 180000, accessTokenHash: 'h-dash' },
    })
    await declareAbsence(s.ctx, { contractId: ct.id, from: fraGiorni(0), to: fraGiorni(0) })

    const d = await dashboard(s.ctx)
    expect(d.occupazione.vendibili).toBe(d.occupazione.liberi + d.occupazione.assenti)
    expect(d.occupazione.assenti).toBe(1)
  })

  it('«previsto oggi» è la quota giornaliera di ciò che è occupato', async () => {
    const s = await stabilimento('dash-previsto')
    // 4 giorni × 25 € = 100 €, ma oggi vale un quarto
    await createReservation(s.ctx, {
      umbrellaIds: [s.ombrelloni[1]!.id], customerId: (await s.cliente('Lungo')).id,
      from: fraGiorni(0), to: fraGiorni(3),
    })
    const d = await dashboard(s.ctx)
    expect(d.incassi.previstoOggiCents).toBe(2500)
  })

  it('«da incassare» è la somma dei saldi ancora aperti', async () => {
    const s = await stabilimento('dash-saldi')
    const r1 = await createReservation(s.ctx, {
      umbrellaIds: [s.ombrelloni[1]!.id], customerId: (await s.cliente('Debitore')).id,
      from: fraGiorni(0), to: fraGiorni(0),
    })
    const r2 = await createReservation(s.ctx, {
      umbrellaIds: [s.ombrelloni[2]!.id], customerId: (await s.cliente('Pagante')).id,
      from: fraGiorni(0), to: fraGiorni(0),
    })
    await prisma.payment.create({
      data: { beachClubId: s.club.id, reservationId: r2.id, amountCents: 2500 } })

    const d = await dashboard(s.ctx)
    expect(d.incassi.daIncassareCents).toBe(2500)     // solo r1
    expect(d.incassi.quantiDaIncassare).toBe(1)
    expect(d.incassi.incassatoOggiCents).toBe(2500)   // il pagamento di r2, oggi
  })

  it('un pagamento parziale lascia aperto solo il residuo', async () => {
    const s = await stabilimento('dash-parziale')
    const r = await createReservation(s.ctx, {
      umbrellaIds: [s.ombrelloni[1]!.id], customerId: (await s.cliente('Acconto')).id,
      from: fraGiorni(0), to: fraGiorni(1),          // 50 €
    })
    await prisma.payment.create({
      data: { beachClubId: s.club.id, reservationId: r.id, amountCents: 2000 } })
    const d = await dashboard(s.ctx)
    expect(d.incassi.daIncassareCents).toBe(3000)
  })

  it('una prenotazione annullata non conta più', async () => {
    const s = await stabilimento('dash-annullata')
    const r = await createReservation(s.ctx, {
      umbrellaIds: [s.ombrelloni[1]!.id], customerId: (await s.cliente('Sparito')).id,
      from: fraGiorni(0), to: fraGiorni(0),
    })
    await prisma.reservation.update({ where: { id: r.id }, data: { status: 'CANCELLED' } })
    const d = await dashboard(s.ctx)
    expect(d.incassi.daIncassareCents).toBe(0)
    expect(d.occupazione.occupati).toBe(0)
  })
})

describe('cosa il gestore deve poter fare', () => {
  it('ogni voce «da fare» porta a un’azione', async () => {
    const s = await stabilimento('dash-dafare')
    await createReservation(s.ctx, {
      umbrellaIds: [s.ombrelloni[1]!.id], customerId: (await s.cliente('Deve')).id,
      from: fraGiorni(0), to: fraGiorni(0),
    })
    const d = await dashboard(s.ctx)
    expect(d.daFare.length).toBeGreaterThan(0)
    for (const v of d.daFare) {
      expect(v.azione).toMatch(/^\//)
      expect(v.valore).not.toBe('')
    }
  })

  it('mostra sette giorni con occupazione e disponibilità', async () => {
    const s = await stabilimento('dash-settimana')
    await createReservation(s.ctx, {
      umbrellaIds: [s.ombrelloni[1]!.id], customerId: (await s.cliente('Futuro')).id,
      from: fraGiorni(2), to: fraGiorni(3),
    })
    const d = await dashboard(s.ctx)
    expect(d.prossimiGiorni).toHaveLength(7)
    for (const g of d.prossimiGiorni) {
      expect(g.percentuale).toBeGreaterThanOrEqual(0)
      expect(g.percentuale).toBeLessThanOrEqual(100)
    }
    // il giorno +2 ha una prenotazione futura
    expect(d.prossimiGiorni[1]!.percentuale).toBeGreaterThan(0)
  })

  it('la capacità recuperata conta solo le vendite su posti liberati', async () => {
    const s = await stabilimento('dash-recupero')
    const stag = await s.cliente('Assente')
    const ct = await prisma.seasonalContract.create({
      data: { beachClubId: s.club.id, seasonId: s.season.id, customerId: stag.id,
              umbrellaId: s.ombrelloni[1]!.id, startDate: fraGiorni(-10), endDate: fraGiorni(40),
              priceCents: 180000, accessTokenHash: 'h-rec' },
    })
    await declareAbsence(s.ctx, { contractId: ct.id, from: fraGiorni(0), to: fraGiorni(0) })
    await createReservation(s.ctx, {
      umbrellaIds: [s.ombrelloni[1]!.id], customerId: (await s.cliente('Giornaliero')).id,
      from: fraGiorni(0), to: fraGiorni(0),
    })
    // e una prenotazione normale, che NON deve contare come recupero
    await createReservation(s.ctx, {
      umbrellaIds: [s.ombrelloni[2]!.id], customerId: (await s.cliente('Normale')).id,
      from: fraGiorni(0), to: fraGiorni(0),
    })

    const d = await dashboard(s.ctx)
    expect(d.recupero.oggi).toBe(1)
    expect(d.recupero.oggiCents).toBe(2500)
  })
})
