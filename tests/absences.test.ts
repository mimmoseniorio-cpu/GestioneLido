/**
 * F6-07 / F6-08 · Assenze stagionali (T-01…T-06, T-11…T-13, T-17, T-18).
 *
 * T-12 — annullamento parziale con un giorno già venduto — è uno dei sei test
 * che decidono il rilascio (docs/09 §10): se fallisce, o si toglie il posto a
 * un cliente che ha pagato, o lo si nega a uno stagionale che ne aveva diritto.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { declareAbsence, cancelAbsence } from '@/server/use-cases/absences'
import { createReservation } from '@/server/use-cases/reservations'
import { getMapForDate } from '@/server/queries/map'
import { prisma } from '@/server/repositories/scoped'
import { DEFAULT_SETTINGS, type Ctx } from '@/server/context'
import { fuoriTempo, istanteDiTaglio, istanteLocale } from '@/domain/seasonal/cutoff'
import { sottraiGiorni, giorniVenduti } from '@/domain/seasonal/intervals'
import { makeClub, day } from './helpers'

const GIORNO = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
/** Domani rispetto a oggi: le assenze non si dichiarano nel passato. */
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
  const inizio = fraGiorni(-30), fine = fraGiorni(60)
  await prisma.season.update({ where: { id: c.season.id },
    data: { status: 'ACTIVE', startDate: inizio, endDate: fine } })
  await prisma.umbrella.update({ where: { id: c.umbrella.id }, data: { basePriceCents: 2500 } })
  const contratto = await prisma.seasonalContract.create({
    data: { beachClubId: c.club.id, seasonId: c.season.id, customerId: c.customer.id,
            umbrellaId: c.umbrella.id, startDate: inizio, endDate: fine,
            priceCents: 180000, accessTokenHash: `h-${label}` },
  })
  const giornaliero = await prisma.customer.create({
    data: { beachClubId: c.club.id, firstName: 'Giornaliero', lastName: label },
  })
  return { ...c, contratto, giornaliero,
           ctxStaff: staff(c.club.id, c.user.id), ctxCliente: cliente(c.club.id, contratto.id) }
}

beforeAll(async () => { await prisma.$connect() })
afterAll(async () => { await prisma.$disconnect() })

// ─────────────────────────────────────────────────────────────────────────
describe('D-12 rivista · il taglio è la mattina del giorno stesso', () => {
  // La regola vera del prodotto, dopo la prova sul campo: 10:00 del giorno
  // di assenza. Prima era 20:00 del giorno PRIMA, ed era troppo severa —
  // chi avvisava alle 20:01 per il giorno dopo non maturava credito mentre
  // il gestore aveva tutta la notte e la mattina per rivendere il posto.
  const oggi = { absenceCutoffHour: 10, absenceCutoffDaysBefore: 0 }
  const ferragosto = day(2027, 8, 15)

  it('avvisare la sera prima è ampiamente in tempo — era il caso rotto', () => {
    // 15 agosto 2027, ore legale: il taglio è alle 10:00 locali = 08:00 UTC.
    expect(fuoriTempo(new Date('2027-08-14T21:30:00Z'), ferragosto, oggi, 'Europe/Rome'))
      .toBe(false)
  })

  it('avvisare la mattina stessa, presto, è in tempo', () => {
    expect(fuoriTempo(new Date('2027-08-15T06:00:00Z'), ferragosto, oggi, 'Europe/Rome'))
      .toBe(false)   // 08:00 a Roma
  })

  it('un minuto dopo il taglio è tardi', () => {
    expect(fuoriTempo(new Date('2027-08-15T08:01:00Z'), ferragosto, oggi, 'Europe/Rome'))
      .toBe(true)    // 10:01 a Roma
  })

  it('a mezzogiorno il posto non si vende più: niente credito', () => {
    expect(fuoriTempo(new Date('2027-08-15T10:00:00Z'), ferragosto, oggi, 'Europe/Rome'))
      .toBe(true)    // 12:00 a Roma
  })

  it('resta configurabile: chi apre alle 8 mette un taglio diverso', () => {
    const presto = { absenceCutoffHour: 8, absenceCutoffDaysBefore: 0 }
    expect(fuoriTempo(new Date('2027-08-15T06:30:00Z'), ferragosto, presto, 'Europe/Rome'))
      .toBe(true)    // 08:30 a Roma, oltre il taglio delle 8
  })

  it('e il fuso resta quello dello stabilimento, anche d’inverno', () => {
    const gennaio = day(2027, 1, 15)
    // Ora solare: 10:00 a Roma = 09:00 UTC.
    expect(fuoriTempo(new Date('2027-01-15T08:59:00Z'), gennaio, oggi, 'Europe/Rome'))
      .toBe(false)
    expect(fuoriTempo(new Date('2027-01-15T09:01:00Z'), gennaio, oggi, 'Europe/Rome'))
      .toBe(true)
  })
})

describe('D-12 · il meccanismo del taglio, con la vecchia regola come esempio', () => {
  const regole = { absenceCutoffHour: 20, absenceCutoffDaysBefore: 1 }

  it('il taglio è alle 20:00 del giorno prima, ora italiana', () => {
    const t = istanteDiTaglio(day(2027, 8, 12), regole, 'Europe/Rome')
    // 11 agosto, ora legale (UTC+2) → 18:00 UTC
    expect(t.toISOString()).toBe('2027-08-11T18:00:00.000Z')
  })

  it('in inverno il fuso cambia e il taglio resta le 20:00 locali', () => {
    const t = istanteDiTaglio(day(2027, 1, 12), regole, 'Europe/Rome')
    expect(t.toISOString()).toBe('2027-01-11T19:00:00.000Z')   // UTC+1
  })

  it('C-52 · funziona anche a cavallo del cambio d’ora', () => {
    // Ultima domenica di marzo 2027: 28 marzo.
    const t = istanteLocale(2027, 3, 28, 20, 'Europe/Rome')
    expect(t.toISOString()).toBe('2027-03-28T18:00:00.000Z')
  })

  it('dichiarata prima del taglio: in tempo', () => {
    expect(fuoriTempo(new Date('2027-08-11T17:00:00Z'), day(2027, 8, 12), regole, 'Europe/Rome'))
      .toBe(false)
  })

  it('dichiarata dopo il taglio: tardiva', () => {
    // Le 11:30 di ferragosto per lo stesso giorno: nessuno comprerà più.
    expect(fuoriTempo(new Date('2027-08-12T09:30:00Z'), day(2027, 8, 12), regole, 'Europe/Rome'))
      .toBe(true)
  })
})

describe('aritmetica degli intervalli (funzioni pure)', () => {
  const d = (n: number) => day(2027, 8, n)

  it('toglie un giorno in mezzo e spezza in due', () => {
    const f = sottraiGiorni({ da: d(10), a: d(15) }, [d(12)])
    expect(f.map(x => [iso(x.da), iso(x.a)]))
      .toEqual([['2027-08-10', '2027-08-11'], ['2027-08-13', '2027-08-15']])
  })

  it('toglie il primo giorno', () => {
    const f = sottraiGiorni({ da: d(10), a: d(12) }, [d(10)])
    expect(f.map(x => [iso(x.da), iso(x.a)])).toEqual([['2027-08-11', '2027-08-12']])
  })

  it('toglie l’ultimo giorno', () => {
    const f = sottraiGiorni({ da: d(10), a: d(12) }, [d(12)])
    expect(f.map(x => [iso(x.da), iso(x.a)])).toEqual([['2027-08-10', '2027-08-11']])
  })

  it('toglie giorni non contigui e produce tre frammenti', () => {
    const f = sottraiGiorni({ da: d(10), a: d(16) }, [d(12), d(14)])
    expect(f.map(x => [iso(x.da), iso(x.a)])).toEqual([
      ['2027-08-10', '2027-08-11'], ['2027-08-13', '2027-08-13'], ['2027-08-15', '2027-08-16'],
    ])
  })

  it('se sono venduti tutti non resta nulla', () => {
    expect(sottraiGiorni({ da: d(10), a: d(11) }, [d(10), d(11)])).toEqual([])
  })

  it('individua i giorni coperti da una prenotazione', () => {
    const v = giorniVenduti({ da: d(10), a: d(15) }, [{ da: d(12), a: d(13) }])
    expect(v.map(iso)).toEqual(['2027-08-12', '2027-08-13'])
  })
})

// ─────────────────────────────────────────────────────────────────────────
describe('T-01…T-06 · dichiarare un’assenza', () => {
  it('scenario C · lo stagionale dichiara e il posto diventa rivendibile', async () => {
    const s = await scenario('abs-declare')
    const domani = fraGiorni(1)
    const a = await declareAbsence(s.ctxCliente, { from: domani, to: domani })

    expect(a.isLate).toBe(false)
    expect(a.giorni).toBe(1)

    const mappa = await getMapForDate(s.ctxStaff, domani)
    const riga = mappa.umbrellas.find(u => u.id === s.umbrella.id)!
    expect(riga.state).toBe('STAGIONALE_ASSENTE')
    expect(riga.sellable).toBe(true)
    expect(mappa.counters.seasonalAbsent).toBe(1)
  })

  it('T-02 · su un intervallo, tutti i giorni diventano vendibili', async () => {
    const s = await scenario('abs-range')
    await declareAbsence(s.ctxCliente, { from: fraGiorni(2), to: fraGiorni(4) })
    for (const n of [2, 3, 4]) {
      const m = await getMapForDate(s.ctxStaff, fraGiorni(n))
      expect(m.umbrellas.find(u => u.id === s.umbrella.id)!.sellable).toBe(true)
    }
    // il giorno dopo la finestra torna suo, senza che nessuno faccia nulla
    const m5 = await getMapForDate(s.ctxStaff, fraGiorni(5))
    expect(m5.umbrellas.find(u => u.id === s.umbrella.id)!.state).toBe('STAGIONALE_PRESENTE')
  })

  it('T-03 · il doppio tap non crea due assenze sovrapposte', async () => {
    const s = await scenario('abs-double')
    await declareAbsence(s.ctxCliente, { from: fraGiorni(1), to: fraGiorni(3) })
    await expect(declareAbsence(s.ctxCliente, { from: fraGiorni(2), to: fraGiorni(4) }))
      .rejects.toThrow()
  })

  it('T-05 · non si dichiara un’assenza per un giorno passato', async () => {
    const s = await scenario('abs-past')
    await expect(declareAbsence(s.ctxCliente, { from: fraGiorni(-2), to: fraGiorni(-1) }))
      .rejects.toMatchObject({ code: 'ABSENCE_IN_THE_PAST' })
  })

  it('T-04 · non si dichiara fuori dal proprio contratto', async () => {
    const s = await scenario('abs-outside')
    await expect(declareAbsence(s.ctxCliente, { from: fraGiorni(80), to: fraGiorni(81) }))
      .rejects.toMatchObject({ code: 'ABSENCE_OUTSIDE_CONTRACT' })
  })

  it('T-17 · rifiuta se su quei giorni c’è già una prenotazione sull’ombrellone', async () => {
    const s = await scenario('abs-conflict')
    await declareAbsence(s.ctxCliente, { from: fraGiorni(1), to: fraGiorni(1) })
    await createReservation(s.ctxStaff, {
      umbrellaIds: [s.umbrella.id], customerId: s.giornaliero.id,
      from: fraGiorni(1), to: fraGiorni(1),
    })
    // ora lo stagionale prova a estendere l'assenza su quel giorno venduto
    await expect(declareAbsence(s.ctxCliente, { from: fraGiorni(1), to: fraGiorni(2) }))
      .rejects.toThrow()
  })

  it('lo staff può dichiarare per conto del cliente che telefona', async () => {
    const s = await scenario('abs-staff')
    const a = await declareAbsence(s.ctxStaff, {
      contractId: s.contratto.id, from: fraGiorni(1), to: fraGiorni(1),
    })
    const riga = await prisma.seasonalAbsence.findUniqueOrThrow({ where: { id: a.id } })
    expect(riga.declaredBy).toBe('STAFF')
  })

  it('il cliente non può dichiarare per il contratto di un altro', async () => {
    const a = await scenario('abs-tenant-a')
    const b = await scenario('abs-tenant-b')
    // il contesto è quello di A, ma prova a indicare il contratto di B
    await expect(declareAbsence(a.ctxCliente, {
      contractId: b.contratto.id, from: fraGiorni(1), to: fraGiorni(1),
    })).resolves.toMatchObject({ giorni: 1 })
    // ha dichiarato sul PROPRIO contratto, non su quello di B: il contractId
    // passato dal client viene ignorato per i clienti.
    const diB = await prisma.seasonalAbsence.count({
      where: { seasonalContractId: b.contratto.id } })
    expect(diB).toBe(0)
  })

  it('lascia traccia nell’audit', async () => {
    const s = await scenario('abs-audit')
    const a = await declareAbsence(s.ctxCliente, { from: fraGiorni(1), to: fraGiorni(1) })
    const righe = await prisma.auditLog.findMany({ where: { entityId: a.id } })
    expect(righe).toHaveLength(1)
    expect(righe[0]!.action).toBe('absence.declare')
    expect(righe[0]!.actorType).toBe('CUSTOMER')
  })
})

// ─────────────────────────────────────────────────────────────────────────
describe('T-11…T-13 · annullare un’assenza', () => {
  it('T-11 · nessun giorno venduto: torna tutto suo', async () => {
    const s = await scenario('canc-full')
    const a = await declareAbsence(s.ctxCliente, { from: fraGiorni(1), to: fraGiorni(3) })
    const esito = await cancelAbsence(s.ctxCliente, { absenceId: a.id })

    expect(esito).toEqual({ esito: 'COMPLETO' })
    const m = await getMapForDate(s.ctxStaff, fraGiorni(2))
    expect(m.umbrellas.find(u => u.id === s.umbrella.id)!.state).toBe('STAGIONALE_PRESENTE')
  })

  it('T-12 · UN GIORNO VENDUTO: l’intervallo si spezza, nessuno perde ciò che gli spetta', async () => {
    const s = await scenario('canc-partial')
    const a = await declareAbsence(s.ctxCliente, { from: fraGiorni(1), to: fraGiorni(5) })

    // il gestore vende il terzo giorno a un giornaliero
    await createReservation(s.ctxStaff, {
      umbrellaIds: [s.umbrella.id], customerId: s.giornaliero.id,
      from: fraGiorni(3), to: fraGiorni(3),
    })

    const esito = await cancelAbsence(s.ctxCliente, { absenceId: a.id })
    expect(esito.esito).toBe('PARZIALE')
    if (esito.esito !== 'PARZIALE') throw new Error('atteso PARZIALE')
    expect(esito.giorniVenduti).toEqual([iso(fraGiorni(3))])
    expect(esito.giorniRipristinati).toEqual(
      [1, 2, 4, 5].map(n => iso(fraGiorni(n))))

    // D-01: chi ha pagato tiene il posto
    const venduto = await getMapForDate(s.ctxStaff, fraGiorni(3))
    expect(venduto.umbrellas.find(u => u.id === s.umbrella.id)!.state).toBe('PRENOTATO')

    // e lo stagionale riprende TUTTI gli altri giorni
    for (const n of [1, 2, 4, 5]) {
      const m = await getMapForDate(s.ctxStaff, fraGiorni(n))
      expect(m.umbrellas.find(u => u.id === s.umbrella.id)!.state).toBe('STAGIONALE_PRESENTE')
    }

    // L'assenza è annullata per intero: nessun frammento resta attivo,
    // altrimenti i giorni ripresi resterebbero vendibili (vedi la correzione
    // di docs/08 §6.2 in server/use-cases/absences.ts).
    const attive = await prisma.seasonalAbsence.count({
      where: { seasonalContractId: s.contratto.id, status: 'ACTIVE' } })
    expect(attive).toBe(0)

    // ma lo storico resta ricostruibile
    const originale = await prisma.seasonalAbsence.findUniqueOrThrow({ where: { id: a.id } })
    expect(originale.status).toBe('CANCELLED')
    expect(originale.cancelledAt).not.toBeNull()
  })

  it('T-13 · tutti i giorni venduti: non c’è nulla da ripristinare', async () => {
    const s = await scenario('canc-sold')
    const a = await declareAbsence(s.ctxCliente, { from: fraGiorni(1), to: fraGiorni(2) })
    await createReservation(s.ctxStaff, {
      umbrellaIds: [s.umbrella.id], customerId: s.giornaliero.id,
      from: fraGiorni(1), to: fraGiorni(2),
    })
    await expect(cancelAbsence(s.ctxCliente, { absenceId: a.id }))
      .rejects.toMatchObject({ code: 'ABSENCE_FULLY_SOLD' })

    // e nulla è cambiato
    const ancora = await prisma.seasonalAbsence.findUniqueOrThrow({ where: { id: a.id } })
    expect(ancora.status).toBe('ACTIVE')
  })

  it('un cliente non può annullare l’assenza di un altro contratto', async () => {
    const a = await scenario('canc-tenant-a')
    const b = await scenario('canc-tenant-b')
    const suaB = await declareAbsence(b.ctxCliente, { from: fraGiorni(1), to: fraGiorni(1) })
    await expect(cancelAbsence(a.ctxCliente, { absenceId: suaB.id }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('annullare due volte non passa in silenzio', async () => {
    const s = await scenario('canc-twice')
    const a = await declareAbsence(s.ctxCliente, { from: fraGiorni(1), to: fraGiorni(1) })
    await cancelAbsence(s.ctxCliente, { absenceId: a.id })
    await expect(cancelAbsence(s.ctxCliente, { absenceId: a.id })).rejects.toThrow()
  })
})
