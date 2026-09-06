/**
 * F6-27 · La disposizione com'è adesso, per l'editor.
 *
 * Diversa da `getMapForDate`: lì conta lo stato di un giorno, qui conta dove
 * stanno le cose. L'editor mostra però quali ombrelloni hanno prenotazioni o
 * contratti attaccati, perché spostarne uno pieno è legittimo ma non è la
 * stessa cosa che spostarne uno vuoto.
 */
import type { Ctx } from '@/server/context'
import { scoped } from '@/server/repositories/scoped'

export type OmbrelloneDisposto = {
  id: string
  visibleNumber: string
  rowLabel: string
  posX: number
  posY: number
  blocked: boolean
  /** prenotazioni e contratti attaccati: si sposta lo stesso, ma si sa */
  impegni: number
}

export type Disposizione = {
  beachMapId: string | null
  larghezza: number
  altezza: number
  ombrelloni: OmbrelloneDisposto[]
  features: { kind: string; x: number; y: number; w: number; h: number; label: string | null }[]
}

export async function disposizione(ctx: Ctx): Promise<Disposizione> {
  const db = scoped(ctx)
  const mappa = await db.beachMap.findFirst({})
  if (!mappa) return { beachMapId: null, larghezza: 0, altezza: 0, ombrelloni: [], features: [] }

  const [ombrelloni, features, items, contratti] = await Promise.all([
    db.umbrella.findMany({ where: { beachMapId: mappa.id }, orderBy: [{ posY: 'asc' }, { posX: 'asc' }] }),
    db.mapFeature.findMany({ where: { beachMapId: mappa.id } }),
    db.reservationItem.findMany({ where: { status: { in: ['CONFIRMED', 'CHECKED_IN'] } } }),
    db.seasonalContract.findMany({ where: { status: 'ACTIVE' } }),
  ])

  // Un conteggio in memoria: due liste già caricate, nessuna query per riga.
  const impegni = new Map<string, number>()
  for (const r of [...(items as any[]), ...(contratti as any[])])
    impegni.set(r.umbrellaId, (impegni.get(r.umbrellaId) ?? 0) + 1)

  const righe = (ombrelloni as any[]).map(u => ({
    id: u.id, visibleNumber: u.visibleNumber, rowLabel: u.rowLabel,
    posX: u.posX, posY: u.posY, blocked: u.blocked,
    impegni: impegni.get(u.id) ?? 0,
  }))

  // La griglia si adatta a ciò che contiene: dopo qualche spostamento la
  // mappa può essere più larga di com'era stata generata.
  const max = (n: number[]) => (n.length ? Math.max(...n) : 0)
  return {
    beachMapId: mappa.id,
    larghezza: Math.max(mappa.width ?? 0,
      max(righe.map(r => r.posX)) + 1, max((features as any[]).map(f => f.posX + f.width))),
    altezza: Math.max(mappa.height ?? 0,
      max(righe.map(r => r.posY)) + 1, max((features as any[]).map(f => f.posY + f.height))),
    ombrelloni: righe,
    // Rinominati apposta: nello schema sono `posX/width`, qui `x/w`. Il nome
    // corto è quello che l'editor disegna, e tenerli uguali aveva già prodotto
    // un `NaN` silenzioso in tutta la mappa.
    features: (features as any[]).map(f => ({
      kind: f.kind, x: f.posX, y: f.posY, w: f.width, h: f.height,
      label: f.label ?? null })),
  }
}
