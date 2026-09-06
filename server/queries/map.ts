/**
 * F5-02 · Lo stato dell'intera mappa per un giorno.
 *
 * Vincolo di progettazione: il numero di query è COSTANTE, non proporzionale
 * agli ombrelloni. Cinque query insiemistiche, poi la funzione pura di
 * `domain/umbrella/state` applicata in memoria.
 *
 * Una query per ombrellone sarebbe 96 round-trip: il target di 500 ms (NF-01)
 * si perde nella latenza di rete, non nel database.
 */
import type { Ctx } from '@/server/context'
import { scoped, prisma, type Tx } from '@/server/repositories/scoped'
import { umbrellaViewState, isSellable, umbrellaState,
         type UmbrellaViewState } from '@/domain/umbrella/state'

export type MapUmbrella = {
  id: string
  visibleNumber: string
  rowLabel: string
  zoneId: string | null
  posX: number
  posY: number
  capacity: number
  basePriceCents: number | null
  state: UmbrellaViewState
  sellable: boolean
  /** chi c'è, o di chi è il posto: serve al pannello rapido senza un'altra query */
  customerName: string | null
  customerPhone: string | null
  period: { from: string; to: string } | null
  /** valorizzato quando il posto è vendibile perché lo stagionale è assente */
  absence: { id: string; from: string; to: string; seasonalName: string } | null
  reservationId: string | null
  isTemporarySlot: boolean
  amountDueCents: number | null
  blockedReason: string | null
}

export type MapDay = {
  date: string
  umbrellas: MapUmbrella[]
  zones: { id: string; name: string; color: string }[]
  features: { id: string; kind: string; label: string | null; posX: number; posY: number; width: number; height: number }[]
  /** Risponde allo scenario F senza che il gestore tocchi nulla. */
  counters: {
    total: number
    occupied: number
    free: number
    booked: number
    seasonalPresent: number
    seasonalAbsent: number
    blocked: number
    sellable: number
    occupancyPercent: number
    /** RF-DSH-05 · capacità recuperata: la metrica che vende il prodotto.
     *  Posti di stagionali assenti effettivamente rivenduti, e il loro valore. */
    recoveredToday: number
    recoveredTodayCents: number
    recoveredSeason: number
    recoveredSeasonCents: number
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

export async function getMapForDate(
  ctx: Ctx,
  date: Date,
  today = new Date(),
  /** iniettabile: consente ai test di contare le query e dimostrare che il
   *  numero non cresce con gli ombrelloni. */
  client: Tx | typeof prisma = prisma,
): Promise<MapDay> {
  const db = scoped(ctx, client)
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))

  // ── 1..5: query insiemistiche, mai in ciclo ──────────────────────────────
  const [umbrellas, zones, features, contracts, absences, items] = await Promise.all([
    db.umbrella.findMany({ orderBy: [{ rowLabel: 'asc' }, { posX: 'asc' }] }),
    db.zone.findMany({ orderBy: { sortOrder: 'asc' } }),
    db.mapFeature.findMany(),
    db.seasonalContract.findMany({
      where: { status: 'ACTIVE', startDate: { lte: date }, endDate: { gte: date } },
      include: { customer: true },
    }),
    db.seasonalAbsence.findMany({
      where: { status: 'ACTIVE', startDate: { lte: date }, endDate: { gte: date } },
      include: { contract: { include: { customer: true } } },
    }),
    db.reservationItem.findMany({
      where: {
        status: { in: ['CONFIRMED', 'CHECKED_IN'] },
        startDate: { lte: date }, endDate: { gte: date },
      },
      include: { reservation: { include: { customer: true, payments: true } } },
    }),
  ])

  // ── indicizzazione in memoria: O(n), nessun accesso al database ──────────
  // `any` deliberato: il repository layer restituisce righe non tipizzate.
  // I tipi veri sono garantiti dal confine — MapUmbrella qui sotto.
  const contractByUmbrella = new Map<string, any>((contracts as any[]).map(c => [c.umbrellaId, c]))
  const absenceByContract  = new Map<string, any>((absences as any[]).map(a => [a.seasonalContractId, a]))
  const itemByUmbrella     = new Map<string, any>((items as any[]).map(i => [i.umbrellaId, i]))

  const rows: MapUmbrella[] = (umbrellas as any[]).map(u => {
    const contract = contractByUmbrella.get(u.id) ?? null
    const absence  = contract ? (absenceByContract.get(contract.id) ?? null) : null
    const item     = itemByUmbrella.get(u.id) ?? null

    const input = {
      umbrella: { blocked: u.blocked, blockedUntil: u.blockedUntil },
      date, today: todayUtc, contract, absence, item,
    }
    const view = umbrellaViewState(input)
    const logical = umbrellaState(input)

    // Chi mostrare nel pannello: chi occupa il posto, altrimenti chi ne è
    // titolare. Sono informazioni diverse e il pannello le distingue.
    const occupante = item?.reservation?.customer ?? null
    const titolare  = contract?.customer ?? null
    const persona   = occupante ?? titolare

    const pagato = (item?.reservation?.payments ?? [])
      .reduce((s: number, p: any) => s + p.amountCents, 0)

    return {
      id: u.id,
      visibleNumber: u.visibleNumber,
      rowLabel: u.rowLabel,
      zoneId: u.zoneId,
      posX: u.posX,
      posY: u.posY,
      capacity: u.capacity,
      basePriceCents: u.basePriceCents,
      state: view,
      sellable: isSellable(logical),
      customerName: persona ? `${persona.firstName} ${persona.lastName}` : null,
      customerPhone: persona?.phoneRaw ?? null,
      period: item ? { from: iso(item.startDate), to: iso(item.endDate) } : null,
      absence: absence && contract
        ? { id: absence.id, from: iso(absence.startDate), to: iso(absence.endDate),
            seasonalName: `${contract.customer.firstName} ${contract.customer.lastName}` }
        : null,
      reservationId: item?.reservationId ?? null,
      isTemporarySlot: item?.isTemporarySlot ?? false,
      amountDueCents: item ? Math.max(0, item.reservation.totalCents - pagato) : null,
      blockedReason: u.blocked ? u.blockedReason : null,
    }
  })

  const conta = (s: UmbrellaViewState) => rows.filter(r => r.state === s).length
  const occupied = conta('OCCUPATO')
  const total = rows.length

  // Quota giornaliera degli item temporanei che coprono questa data: il prezzo
  // è per l'intero periodo, ma il gestore vuole sapere quanto ha recuperato OGGI.
  const giorniDi = (i: any) =>
    Math.round((i.endDate.getTime() - i.startDate.getTime()) / 86_400_000) + 1
  const temporaneiOggi = (items as any[]).filter(i => i.isTemporarySlot)
  const recoveredTodayCents = temporaneiOggi
    .reduce((s, i) => s + Math.round(i.priceCents / giorniDi(i)), 0)

  // Totale di stagione: è il numero che il gestore userà per decidere se il
  // software si è ripagato. Una query aggregata, non una per riga.
  const stagione = await db.season.findFirst({ where: { status: 'ACTIVE' } })
  const recuperiStagione = stagione
    ? await db.reservationItem.findMany({
        where: { isTemporarySlot: true, status: { in: ['CONFIRMED', 'CHECKED_IN'] },
                 startDate: { gte: stagione.startDate }, endDate: { lte: stagione.endDate } },
      })
    : []
  const recoveredSeasonCents = (recuperiStagione as any[])
    .reduce((s, i) => s + i.priceCents, 0)

  return {
    date: iso(date),
    umbrellas: rows,
    zones: (zones as any[]).map(z => ({ id: z.id, name: z.name, color: z.color })),
    features: (features as any[]).map(f => ({
      id: f.id, kind: f.kind, label: f.label,
      posX: f.posX, posY: f.posY, width: f.width, height: f.height,
    })),
    counters: {
      total,
      occupied,
      free: conta('LIBERO'),
      booked: conta('PRENOTATO'),
      seasonalPresent: conta('STAGIONALE_PRESENTE'),
      seasonalAbsent: conta('STAGIONALE_ASSENTE'),
      blocked: conta('BLOCCATO'),
      sellable: rows.filter(r => r.sellable).length,
      occupancyPercent: total === 0 ? 0 : Math.round((occupied / total) * 100),
      recoveredToday: temporaneiOggi.length,
      recoveredTodayCents,
      recoveredSeason: recuperiStagione.length,
      recoveredSeasonCents,
    },
  }
}
