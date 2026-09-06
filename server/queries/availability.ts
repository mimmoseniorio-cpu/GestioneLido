/**
 * F6-03 · "Trova il posto migliore" — collega la ricerca al database.
 *
 * Il cliente dice «siamo in quattro e vogliamo stare vicino al mare» oppure
 * «due ombrelloni vicini dal 10 al 15». L'operatore non deve incrociare nulla
 * a mente: sceglie periodo, quantità e una preferenza, e legge le proposte.
 *
 * Nessuna AI: l'algoritmo è deterministico e vive in `domain/availability`.
 * Qui si fa solo il lavoro sporco — capire, per ogni ombrellone, qual è la
 * finestra contigua più lunga davvero disponibile dentro il periodo chiesto.
 */
import type { Ctx } from '@/server/context'
import { scoped } from '@/server/repositories/scoped'
import { readSettings } from '@/server/context'
import { umbrellaState } from '@/domain/umbrella/state'
import { cercaDisponibilita, type Candidato, type Preferenze, type Soluzione }
  from '@/domain/availability/search'
import { DomainError } from '@/domain/errors'

const GIORNO = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)

export type RisultatoRicerca = {
  from: string
  to: string
  giorniRichiesti: number
  quantita: number
  soluzioni: (Omit<Soluzione, 'ombrelloni' | 'daGiorno' | 'aGiorno'> & {
    ombrelloni: { id: string; visibleNumber: string; rowLabel: string; temporaneo: boolean }[]
    dal: string
    al: string
  })[]
  completeTrovate: number
}

export async function cercaPosti(
  ctx: Ctx,
  input: { from: Date; to: Date; quantita: number; preferenze?: Preferenze },
  today = new Date(),
): Promise<RisultatoRicerca> {
  if (input.from.getTime() > input.to.getTime())
    throw new DomainError('INVALID_RANGE', 'La data di fine precede quella di inizio.')

  const db = scoped(ctx)
  const settings = readSettings(ctx.settings)
  const giorniRichiesti = Math.round((input.to.getTime() - input.from.getTime()) / GIORNO) + 1
  if (giorniRichiesti > 120)
    throw new DomainError('INVALID_RANGE', 'Il periodo richiesto è troppo lungo.')

  const [umbrellas, features, contracts, absences, items] = await Promise.all([
    db.umbrella.findMany(),
    db.mapFeature.findMany(),
    db.seasonalContract.findMany({
      where: { status: 'ACTIVE', startDate: { lte: input.to }, endDate: { gte: input.from } },
    }),
    db.seasonalAbsence.findMany({
      where: { status: 'ACTIVE', startDate: { lte: input.to }, endDate: { gte: input.from } },
    }),
    db.reservationItem.findMany({
      where: { status: { in: ['CONFIRMED', 'CHECKED_IN'] },
               startDate: { lte: input.to }, endDate: { gte: input.from } },
    }),
  ])

  const perOmbrellone = <T extends { umbrellaId: string }>(xs: T[]) => {
    const m = new Map<string, T[]>()
    for (const x of xs) m.set(x.umbrellaId, [...(m.get(x.umbrellaId) ?? []), x])
    return m
  }
  const contrattiDi = perOmbrellone(contracts as any[])
  const itemsDi = perOmbrellone(items as any[])
  const assenzePerContratto = new Map<string, any[]>()
  for (const a of absences as any[])
    assenzePerContratto.set(a.seasonalContractId,
      [...(assenzePerContratto.get(a.seasonalContractId) ?? []), a])

  const copre = (r: { startDate: Date; endDate: Date }, d: Date) =>
    d >= r.startDate && d <= r.endDate

  // ── finestra contigua più lunga disponibile, per ogni ombrellone ────────
  const candidati: Candidato[] = []
  for (const u of umbrellas as any[]) {
    let inizio = -1, migliore = { da: -1, a: -1, len: 0 }
    let temporaneoNellaFinestra = false, temporaneoMigliore = false

    for (let g = 0; g < giorniRichiesti; g++) {
      const d = new Date(input.from.getTime() + g * GIORNO)
      const contratto = (contrattiDi.get(u.id) ?? []).find(c => copre(c, d)) ?? null
      const assenza = contratto
        ? (assenzePerContratto.get(contratto.id) ?? []).find(a => copre(a, d)) ?? null
        : null
      const item = (itemsDi.get(u.id) ?? []).find(i => copre(i, d)) ?? null

      const stato = umbrellaState({
        umbrella: { blocked: u.blocked, blockedUntil: u.blockedUntil },
        date: d, today, contract: contratto, absence: assenza, item,
      })
      const libero = stato === 'LIBERO' || stato === 'TEMP_DISPONIBILE'

      if (libero) {
        if (inizio < 0) { inizio = g; temporaneoNellaFinestra = false }
        if (stato === 'TEMP_DISPONIBILE') temporaneoNellaFinestra = true
        const len = g - inizio + 1
        if (len > migliore.len) {
          migliore = { da: inizio, a: g, len }
          temporaneoMigliore = temporaneoNellaFinestra
        }
      } else {
        inizio = -1
      }
    }

    if (migliore.len === 0) continue
    candidati.push({
      id: u.id, visibleNumber: u.visibleNumber, rowLabel: u.rowLabel,
      posX: u.posX, posY: u.posY, zoneId: u.zoneId,
      prezzoGiornoCents: u.basePriceCents ?? 0,
      temporaneo: temporaneoMigliore,
      daGiorno: migliore.da, aGiorno: migliore.a,
    })
  }

  const { soluzioni, completeTrovate } = cercaDisponibilita(candidati, {
    giorniRichiesti,
    quantita: input.quantita,
    preferenze: input.preferenze,
    ostacoli: (features as any[]).map(f => ({
      kind: f.kind, posX: f.posX, posY: f.posY, width: f.width, height: f.height,
    })),
    pesi: { rowChangePenalty: settings.rowChangePenalty, corridorPenalty: settings.corridorPenalty },
  })

  return {
    from: iso(input.from),
    to: iso(input.to),
    giorniRichiesti,
    quantita: input.quantita,
    completeTrovate,
    soluzioni: soluzioni.map(s => ({
      giorniCoperti: s.giorniCoperti,
      completa: s.completa,
      prezzoTotaleCents: s.prezzoTotaleCents,
      punteggio: s.punteggio,
      contieneTemporanei: s.contieneTemporanei,
      dal: iso(new Date(input.from.getTime() + s.daGiorno * GIORNO)),
      al: iso(new Date(input.from.getTime() + s.aGiorno * GIORNO)),
      ombrelloni: s.ombrelloni.map(o => ({
        id: o.id, visibleNumber: o.visibleNumber, rowLabel: o.rowLabel, temporaneo: o.temporaneo,
      })),
    })),
  }
}
