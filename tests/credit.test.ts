/**
 * F6-12 · Il credito allo stagionale (T-07, T-14, T-15, T-16).
 *
 * La regola, confermata dall'utente: il credito matura SOLO se il posto
 * liberato viene effettivamente rivenduto. Se resta vuoto, niente credito.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { calcolaCredito, descrizioneCredito } from '@/domain/seasonal/credit'
import { declareAbsence } from '@/server/use-cases/absences'
import { createReservation, cancelReservation } from '@/server/use-cases/reservations'
import { prisma } from '@/server/repositories/scoped'
import { DEFAULT_SETTINGS, type Ctx } from '@/server/context'
import { makeClub } from './helpers'

const GIORNO = 86_400_000
/**
 * Le assenze si dichiarano da DOPODOMANI in poi.
 *
 * Il taglio è alle 20:00 del giorno prima (D-12): un test che dichiara
 * un'assenza «per domani» passerebbe di mattina e fallirebbe di sera. Con due
 * giorni di margine il taglio è sempre nel futuro, a qualunque ora si eseguano
 * i test. La logica del taglio è verificata a parte, con un orologio fisso.
 */
const MARGINE = 1

const fraGiorni = (n: number) => {
  const o = new Date()
  const base = Date.UTC(o.getUTCFullYear(), o.getUTCMonth(), o.getUTCDate())
  // Gli offset futuri scalano di MARGINE; quelli passati (stagione) restano.
  return new Date(base + (n > 0 ? n + MARGINE : n) * GIORNO)
}
const regole = { creditPercent: 30, creditCapCentsPerSeason: 30_000 }

// ─────────────────────────────────────────────────────────────────────────
describe('calcolo del credito (funzione pura)', () => {
  it('riconosce la percentuale configurata sull’incasso della rivendita', () => {
    expect(calcolaCredito({ prezzoVenditaCents: 2500, giaMaturatoCents: 0,
                            assenzaTardiva: false, regole }))
      .toEqual({ importoCents: 750, motivo: 'MATURATO' })
  })

  it('K-01 · un’assenza tardiva non matura nulla', () => {
    // Il posto non era realisticamente vendibile: lo stabilimento non deve
    // pagare per averlo venduto lo stesso.
    expect(calcolaCredito({ prezzoVenditaCents: 2500, giaMaturatoCents: 0,
                            assenzaTardiva: true, regole }))
      .toEqual({ importoCents: 0, motivo: 'ASSENZA_TARDIVA' })
  })

  it('T-15 · il tetto stagionale ferma la maturazione', () => {
    expect(calcolaCredito({ prezzoVenditaCents: 2500, giaMaturatoCents: 30_000,
                            assenzaTardiva: false, regole }))
      .toEqual({ importoCents: 0, motivo: 'TETTO_RAGGIUNTO' })
  })

  it('vicino al tetto riconosce solo il residuo', () => {
    expect(calcolaCredito({ prezzoVenditaCents: 10_000, giaMaturatoCents: 29_500,
                            assenzaTardiva: false, regole }))
      .toEqual({ importoCents: 500, motivo: 'TETTO_PARZIALE' })
  })

  it('tetto a zero significa nessun tetto', () => {
    expect(calcolaCredito({ prezzoVenditaCents: 100_000, giaMaturatoCents: 999_999,
      assenzaTardiva: false, regole: { creditPercent: 30, creditCapCentsPerSeason: 0 } }))
      .toEqual({ importoCents: 30_000, motivo: 'MATURATO' })
  })

  it('una vendita a zero non matura nulla', () => {
    expect(calcolaCredito({ prezzoVenditaCents: 0, giaMaturatoCents: 0,
                            assenzaTardiva: false, regole }).importoCents).toBe(0)
  })

  it('la descrizione è comprensibile per il cliente', () => {
    expect(descrizioneCredito('2027-08-12', '2027-08-12', 'MATURATO'))
      .toBe('Posto liberato del 2027-08-12 e riassegnato')
    expect(descrizioneCredito('2027-08-12', '2027-08-14', 'TETTO_PARZIALE'))
      .toContain('massimo stagionale')
  })
})

// ─────────────────────────────────────────────────────────────────────────
const staff = (beachClubId: string, userId: string): Ctx => ({
  kind: 'STAFF', beachClubId, userId, actor: 'OPERATOR',
  timezone: 'Europe/Rome', settings: DEFAULT_SETTINGS,
})
const cliente = (beachClubId: string, seasonalContractId: string): Ctx => ({
  kind: 'CUSTOMER', beachClubId, seasonalContractId,
  actor: 'SEASONAL_CUSTOMER', timezone: 'Europe/Rome', settings: DEFAULT_SETTINGS,
})

async function scenario(label: string) {
  const c = await makeClub(prisma, label)
  await prisma.season.update({ where: { id: c.season.id },
    data: { status: 'ACTIVE', startDate: fraGiorni(-30), endDate: fraGiorni(60) } })
  await prisma.umbrella.update({ where: { id: c.umbrella.id }, data: { basePriceCents: 2500 } })
  const contratto = await prisma.seasonalContract.create({
    data: { beachClubId: c.club.id, seasonId: c.season.id, customerId: c.customer.id,
            umbrellaId: c.umbrella.id, startDate: fraGiorni(-30), endDate: fraGiorni(60),
            priceCents: 180000, accessTokenHash: `h-${label}` },
  })
  const giornaliero = await prisma.customer.create({
    data: { beachClubId: c.club.id, firstName: 'Giornaliero', lastName: label },
  })
  return { ...c, contratto, giornaliero,
           ctxStaff: staff(c.club.id, c.user.id), ctxCliente: cliente(c.club.id, contratto.id) }
}

const saldo = async (id: string) =>
  (await prisma.seasonalContract.findUniqueOrThrow({ where: { id } })).creditBalanceCents

const sommaRegistro = async (id: string) =>
  (await prisma.creditTransaction.findMany({ where: { seasonalContractId: id } }))
    .reduce((s, c) => s + c.amountCents, 0)

beforeAll(async () => { await prisma.$connect() })
afterAll(async () => { await prisma.$disconnect() })

describe('T-07 · il credito matura alla rivendita, non alla dichiarazione', () => {
  it('dichiarare un’assenza NON matura credito', async () => {
    const s = await scenario('cr-declare')
    await declareAbsence(s.ctxCliente, { from: fraGiorni(1), to: fraGiorni(1) })
    expect(await saldo(s.contratto.id)).toBe(0)
  })

  it('vendere il posto liberato matura il 30% dell’incasso', async () => {
    const s = await scenario('cr-earn')
    await declareAbsence(s.ctxCliente, { from: fraGiorni(1), to: fraGiorni(1) })
    const r = await createReservation(s.ctxStaff, {
      umbrellaIds: [s.umbrella.id], customerId: s.giornaliero.id,
      from: fraGiorni(1), to: fraGiorni(1),
    })
    expect(r.totalCents).toBe(2500)
    expect(r.creditoMaturatoCents).toBe(750)
    expect(await saldo(s.contratto.id)).toBe(750)

    const riga = await prisma.creditTransaction.findFirstOrThrow({
      where: { seasonalContractId: s.contratto.id } })
    expect(riga.kind).toBe('EARNED')
    expect(riga.sourceReservationId).toBe(r.id)
    expect(riga.description).toContain('riassegnato')
  })

  it('una prenotazione su un posto normale non matura nulla', async () => {
    const s = await scenario('cr-normal')
    const altro = await prisma.umbrella.create({
      data: { beachClubId: s.club.id, beachMapId: s.map.id, visibleNumber: '99',
              rowLabel: 'B', posX: 9, posY: 9, basePriceCents: 2500 },
    })
    const r = await createReservation(s.ctxStaff, {
      umbrellaIds: [altro.id], customerId: s.giornaliero.id,
      from: fraGiorni(1), to: fraGiorni(1),
    })
    expect(r.creditoMaturatoCents).toBe(0)
    expect(await prisma.creditTransaction.count({ where: { beachClubId: s.club.id } })).toBe(0)
  })

  it('su più giorni il credito segue l’incasso vero', async () => {
    const s = await scenario('cr-multi')
    await declareAbsence(s.ctxCliente, { from: fraGiorni(1), to: fraGiorni(3) })
    const r = await createReservation(s.ctxStaff, {
      umbrellaIds: [s.umbrella.id], customerId: s.giornaliero.id,
      from: fraGiorni(1), to: fraGiorni(3),
    })
    expect(r.totalCents).toBe(7500)          // 3 giorni × 25 €
    expect(r.creditoMaturatoCents).toBe(2250) // 30%
  })
})

describe('T-14 · annullare la rivendita storna il credito', () => {
  it('storna con una riga nuova, senza cancellare quella vecchia', async () => {
    const s = await scenario('cr-reverse')
    await declareAbsence(s.ctxCliente, { from: fraGiorni(1), to: fraGiorni(1) })
    const r = await createReservation(s.ctxStaff, {
      umbrellaIds: [s.umbrella.id], customerId: s.giornaliero.id,
      from: fraGiorni(1), to: fraGiorni(1),
    })
    expect(await saldo(s.contratto.id)).toBe(750)

    await cancelReservation(s.ctxStaff, { reservationId: r.id })

    expect(await saldo(s.contratto.id)).toBe(0)
    const righe = await prisma.creditTransaction.findMany({
      where: { seasonalContractId: s.contratto.id }, orderBy: { createdAt: 'asc' } })
    expect(righe.map(x => x.kind)).toEqual(['EARNED', 'REVERSED'])
    expect(righe[1]!.amountCents).toBe(-750)
    // K-05 · il registro è append-only: la riga originale resta
    expect(righe[0]!.amountCents).toBe(750)
  })

  it('e il posto torna vendibile: l’assenza è ancora attiva', async () => {
    const s = await scenario('cr-resell')
    await declareAbsence(s.ctxCliente, { from: fraGiorni(1), to: fraGiorni(1) })
    const r = await createReservation(s.ctxStaff, {
      umbrellaIds: [s.umbrella.id], customerId: s.giornaliero.id,
      from: fraGiorni(1), to: fraGiorni(1),
    })
    await cancelReservation(s.ctxStaff, { reservationId: r.id })

    const r2 = await createReservation(s.ctxStaff, {
      umbrellaIds: [s.umbrella.id], customerId: s.giornaliero.id,
      from: fraGiorni(1), to: fraGiorni(1),
    })
    expect(r2.creditoMaturatoCents).toBe(750)
    expect(await saldo(s.contratto.id)).toBe(750)
  })
})

describe('T-15 · tetto stagionale', () => {
  it('smette di maturare una volta raggiunto', async () => {
    const s = await scenario('cr-cap')
    // tetto basso: due vendite lo superano
    const stretto = { ...s.ctxStaff, settings: { ...DEFAULT_SETTINGS, creditCapCentsPerSeason: 1000 } } as Ctx

    await declareAbsence(s.ctxCliente, { from: fraGiorni(1), to: fraGiorni(1) })
    const a = await createReservation(stretto, {
      umbrellaIds: [s.umbrella.id], customerId: s.giornaliero.id,
      from: fraGiorni(1), to: fraGiorni(1),
    })
    expect(a.creditoMaturatoCents).toBe(750)

    await declareAbsence(s.ctxCliente, { from: fraGiorni(3), to: fraGiorni(3) })
    const b = await createReservation(stretto, {
      umbrellaIds: [s.umbrella.id], customerId: s.giornaliero.id,
      from: fraGiorni(3), to: fraGiorni(3),
    })
    expect(b.creditoMaturatoCents).toBe(250)   // solo il residuo fino al tetto
    expect(await saldo(s.contratto.id)).toBe(1000)
  })
})

describe('T-16 · il saldo quadra sempre con il registro', () => {
  it('dopo maturazione, storno e nuova maturazione', async () => {
    const s = await scenario('cr-quadra')
    await declareAbsence(s.ctxCliente, { from: fraGiorni(1), to: fraGiorni(2) })
    const r = await createReservation(s.ctxStaff, {
      umbrellaIds: [s.umbrella.id], customerId: s.giornaliero.id,
      from: fraGiorni(1), to: fraGiorni(2),
    })
    await cancelReservation(s.ctxStaff, { reservationId: r.id })
    await createReservation(s.ctxStaff, {
      umbrellaIds: [s.umbrella.id], customerId: s.giornaliero.id,
      from: fraGiorni(1), to: fraGiorni(1),
    })

    // La verità è la somma delle transazioni; il saldo è una denormalizzazione.
    expect(await saldo(s.contratto.id)).toBe(await sommaRegistro(s.contratto.id))
  })
})
