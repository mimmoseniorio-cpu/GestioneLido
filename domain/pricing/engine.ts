/**
 * F6-16 · Motore dei prezzi (RF-PRC-03, docs/03 §3.11).
 *
 * NON è un sistema generico di regole: sono 5–10 righe per stabilimento, e la
 * prevedibilità vale più della flessibilità. Il gestore deve poter guardare la
 * lista e capire perché un prezzo è quello — se non ci riesce, applicherà
 * sempre l'override e il listino diventa decorativo.
 *
 * Funzione pura: nessun database, nessun `new Date()` nascosto.
 *
 * Il prezzo si calcola GIORNO PER GIORNO, perché alta stagione e weekend
 * cambiano dentro lo stesso soggiorno. Poi i giorni con la stessa tariffa si
 * raggruppano, così il breakdown resta leggibile al cliente.
 */
import { DomainError } from '@/domain/errors'

export type OmbrelloneTariffabile = {
  id: string
  visibleNumber: string
  zoneId: string | null
  rowLabel: string
  category: string | null
  basePriceCents: number | null
}

export type RegolaPrezzo = {
  id: string
  name: string
  priority: number
  zoneId: string | null
  rowLabel: string | null
  category: string | null
  dateFrom: Date | null
  dateTo: Date | null
  /** 1 = lunedì … 7 = domenica; vuoto = tutti */
  weekdays: number[]
  minDays: number | null
  maxDays: number | null
  customerType: 'DAILY' | 'SEASONAL' | null
  priceCents: number
  active: boolean
}

export type RigaPrezzo = {
  dal: string
  al: string
  giorni: number
  tariffaGiornoCents: number
  importoCents: number
  regola: string
}

export type Preventivo = {
  totaleCents: number
  righe: RigaPrezzo[]
}

const GIORNO = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)

/** 1 = lunedì … 7 = domenica (ISO), non 0 = domenica. */
export const giornoSettimana = (d: Date) => ((d.getUTCDay() + 6) % 7) + 1

/** Quante condizioni la regola impone: più è specifica, più "vale" a parità. */
function specificita(r: RegolaPrezzo): number {
  return [r.zoneId, r.rowLabel, r.category, r.dateFrom, r.dateTo,
          r.minDays, r.maxDays, r.customerType].filter(x => x != null).length
       + (r.weekdays.length > 0 ? 1 : 0)
}

function regolaSiApplica(
  r: RegolaPrezzo, u: OmbrelloneTariffabile, giorno: Date,
  durataGiorni: number, tipoCliente: 'DAILY' | 'SEASONAL',
): boolean {
  if (!r.active) return false
  if (r.zoneId && r.zoneId !== u.zoneId) return false
  if (r.rowLabel && r.rowLabel !== u.rowLabel) return false
  if (r.category && r.category !== u.category) return false
  if (r.dateFrom && giorno < r.dateFrom) return false
  if (r.dateTo && giorno > r.dateTo) return false
  if (r.weekdays.length > 0 && !r.weekdays.includes(giornoSettimana(giorno))) return false
  if (r.minDays != null && durataGiorni < r.minDays) return false
  if (r.maxDays != null && durataGiorni > r.maxDays) return false
  if (r.customerType && r.customerType !== tipoCliente) return false
  return true
}

/**
 * C-44 · A parità di priorità vince la più specifica; a parità di specificità
 * vince l'ultima definita. Deterministico: due preventivi identici devono
 * dare lo stesso prezzo, o l'operatore smette di fidarsi del listino.
 */
export function regolaPerGiorno(
  regole: readonly RegolaPrezzo[], u: OmbrelloneTariffabile, giorno: Date,
  durataGiorni: number, tipoCliente: 'DAILY' | 'SEASONAL',
): RegolaPrezzo | null {
  const applicabili = regole.filter(r => regolaSiApplica(r, u, giorno, durataGiorni, tipoCliente))
  if (applicabili.length === 0) return null
  return applicabili.sort((a, b) =>
    b.priority - a.priority ||
    specificita(b) - specificita(a) ||
    a.id.localeCompare(b.id))[0]!
}

export function calcolaPrezzo(input: {
  ombrellone: OmbrelloneTariffabile
  dal: Date
  al: Date
  regole: readonly RegolaPrezzo[]
  tipoCliente?: 'DAILY' | 'SEASONAL'
}): Preventivo {
  const { ombrellone: u, dal, al } = input
  if (dal.getTime() > al.getTime())
    throw new DomainError('INVALID_RANGE', 'La data di fine precede quella di inizio.')

  const tipoCliente = input.tipoCliente ?? 'DAILY'
  const durata = Math.round((al.getTime() - dal.getTime()) / GIORNO) + 1

  const perGiorno: { giorno: Date; tariffa: number; regola: string }[] = []
  for (let t = dal.getTime(); t <= al.getTime(); t += GIORNO) {
    const giorno = new Date(t)
    const r = regolaPerGiorno(input.regole, u, giorno, durata, tipoCliente)
    if (r) {
      perGiorno.push({ giorno, tariffa: r.priceCents, regola: r.name })
      continue
    }
    // C-43 · nessuna regola: si ricade sulla tariffa dell'ombrellone. Se manca
    // anche quella si solleva un errore, MAI un prezzo a zero — è il tipo di
    // errore che passa inosservato per settimane e si scopre a bilancio.
    if (u.basePriceCents == null)
      throw new DomainError('PRICE_RULE_MISSING',
        `Nessuna tariffa per l'ombrellone ${u.visibleNumber} il ${iso(giorno)}.`,
        { umbrellaId: u.id, giorno: iso(giorno) })
    perGiorno.push({ giorno, tariffa: u.basePriceCents, regola: 'Tariffa base' })
  }

  // Giorni consecutivi con la stessa tariffa → una riga sola.
  const righe: RigaPrezzo[] = []
  for (const g of perGiorno) {
    const ultima = righe[righe.length - 1]
    if (ultima && ultima.tariffaGiornoCents === g.tariffa && ultima.regola === g.regola) {
      ultima.al = iso(g.giorno)
      ultima.giorni += 1
      ultima.importoCents += g.tariffa
    } else {
      righe.push({
        dal: iso(g.giorno), al: iso(g.giorno), giorni: 1,
        tariffaGiornoCents: g.tariffa, importoCents: g.tariffa, regola: g.regola,
      })
    }
  }

  return { totaleCents: righe.reduce((s, r) => s + r.importoCents, 0), righe }
}

/**
 * F6-18 · Scostamento manuale dal listino.
 *
 * L'operatore può scostarsi entro una soglia; oltre serve un admin (docs/04 ▲³).
 * Ogni override finisce nell'audit con il motivo: serve a ricostruire perché
 * quel giorno si è pagato meno.
 */
export function verificaOverride(input: {
  prezzoListinoCents: number
  prezzoApplicatoCents: number
  ruolo: 'ADMIN' | 'OPERATOR'
  scontoMassimoPercento: number
}): { ammesso: true } | { ammesso: false; limiteCents: number } {
  if (input.prezzoApplicatoCents < 0) return { ammesso: false, limiteCents: 0 }
  if (input.ruolo === 'ADMIN') return { ammesso: true }
  if (input.prezzoApplicatoCents >= input.prezzoListinoCents) return { ammesso: true }

  const limite = Math.round(
    input.prezzoListinoCents * (1 - input.scontoMassimoPercento / 100))
  return input.prezzoApplicatoCents >= limite
    ? { ammesso: true }
    : { ammesso: false, limiteCents: limite }
}
