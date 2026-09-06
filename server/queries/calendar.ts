/**
 * F6-25 · Vista calendario.
 *
 * `docs/01` §4 ha ridimensionato il requisito: invece di tre viste separate
 * (giorno / settimana / mese) una sola griglia **ombrelloni × giorni** su un
 * intervallo scorrevole. Copre gli stessi tre casi d'uso senza costruire tre
 * componenti, ed è il modo in cui il gestore guarda davvero il registro.
 *
 * Query costanti: quattro, indipendenti dal numero di giorni e di ombrelloni.
 */
import type { Ctx } from '@/server/context'
import { scoped } from '@/server/repositories/scoped'
import { umbrellaViewState, type UmbrellaViewState } from '@/domain/umbrella/state'

const GIORNO = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)

export type Calendario = {
  dal: string
  al: string
  giorni: { data: string; feriale: boolean; fuoriStagione: boolean }[]
  righe: {
    umbrellaId: string
    numero: string
    fila: string
    celle: { stato: UmbrellaViewState; chi: string | null }[]
  }[]
  /** occupazione per giorno, per la riga di riepilogo in alto */
  riepilogo: { data: string; occupati: number; vendibili: number; fuoriStagione: boolean }[]
}

export async function calendario(
  ctx: Ctx, dal: Date, giorniDaMostrare = 14, oggi = new Date(),
): Promise<Calendario> {
  const db = scoped(ctx)
  const al = new Date(dal.getTime() + (giorniDaMostrare - 1) * GIORNO)
  const oggiUtc = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), oggi.getUTCDate()))

  const [stagione, umbrellas, contratti, assenze, items] = await Promise.all([
    db.season.findFirst({ where: { status: 'ACTIVE' } }),
    db.umbrella.findMany({ orderBy: [{ rowLabel: 'asc' }, { posX: 'asc' }] }),
    db.seasonalContract.findMany({
      where: { status: 'ACTIVE', startDate: { lte: al }, endDate: { gte: dal } },
      include: { customer: true },
    }),
    db.seasonalAbsence.findMany({
      where: { status: 'ACTIVE', startDate: { lte: al }, endDate: { gte: dal } },
    }),
    db.reservationItem.findMany({
      where: { status: { in: ['CONFIRMED', 'CHECKED_IN'] },
               startDate: { lte: al }, endDate: { gte: dal } },
      include: { reservation: { include: { customer: true } } },
    }),
  ])

  const copre = (r: { startDate: Date; endDate: Date }, d: Date) => d >= r.startDate && d <= r.endDate
  const assenzePerContratto = new Map<string, any[]>()
  for (const a of assenze as any[])
    assenzePerContratto.set(a.seasonalContractId,
      [...(assenzePerContratto.get(a.seasonalContractId) ?? []), a])

  // Fuori dalla stagione tutti gli ombrelloni risultano "liberi", ma non sono
  // vendibili: mostrarli come disponibili sarebbe un numero falso, e i numeri
  // falsi sono il modo più veloce per far smettere di usare il calendario.
  const fuori = (d: Date) => !stagione
    || d < (stagione as any).startDate || d > (stagione as any).endDate

  const giorni = Array.from({ length: giorniDaMostrare }, (_, k) => {
    const d = new Date(dal.getTime() + k * GIORNO)
    const g = d.getUTCDay()
    return { data: iso(d), feriale: g !== 0 && g !== 6, fuoriStagione: fuori(d), _d: d }
  })

  const righe = (umbrellas as any[]).map(u => {
    const suoiContratti = (contratti as any[]).filter(c => c.umbrellaId === u.id)
    const suoiItems = (items as any[]).filter(i => i.umbrellaId === u.id)

    const celle = giorni.map(({ _d }) => {
      const contratto = suoiContratti.find(c => copre(c, _d)) ?? null
      const assenza = contratto
        ? (assenzePerContratto.get(contratto.id) ?? []).find(a => copre(a, _d)) ?? null : null
      const item = suoiItems.find(i => copre(i, _d)) ?? null

      const stato = umbrellaViewState({
        umbrella: { blocked: u.blocked, blockedUntil: u.blockedUntil },
        date: _d, today: oggiUtc, contract: contratto, absence: assenza, item,
      })
      const persona = item?.reservation?.customer ?? contratto?.customer ?? null
      return { stato, chi: persona ? `${persona.firstName} ${persona.lastName}` : null }
    })

    return { umbrellaId: u.id, numero: u.visibleNumber, fila: u.rowLabel, celle }
  })

  return {
    dal: iso(dal), al: iso(al),
    giorni: giorni.map(({ data, feriale, fuoriStagione }) => ({ data, feriale, fuoriStagione })),
    righe,
    riepilogo: giorni.map((g, k) => ({
      data: g.data,
      fuoriStagione: g.fuoriStagione,
      occupati: righe.filter(r => r.celle[k]!.stato === 'OCCUPATO' || r.celle[k]!.stato === 'PRENOTATO').length,
      vendibili: g.fuoriStagione ? 0 : righe.filter(r =>
        r.celle[k]!.stato === 'LIBERO' || r.celle[k]!.stato === 'STAGIONALE_ASSENTE').length,
    })),
  }
}
