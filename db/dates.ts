/** Le date di soggiorno sono DATE, non timestamp: nessun fuso, nessun bug
 *  all'ora legale (docs/03 §1, caso limite C-50). Rappresentate come Date a
 *  mezzanotte UTC. */
export const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

export const addDays = (d: Date, n: number) =>
  new Date(d.getTime() + n * 86_400_000)

export const daysBetween = (a: Date, b: Date) =>
  Math.round((b.getTime() - a.getTime()) / 86_400_000)

/** Intervalli inclusivi: il 10-12 agosto sono tre giorni. */
export const nightsInclusive = (from: Date, to: Date) => daysBetween(from, to) + 1

export const fmt = (d: Date) => d.toISOString().slice(0, 10)

export const overlaps = (aFrom: Date, aTo: Date, bFrom: Date, bTo: Date) =>
  aFrom <= bTo && bFrom <= aTo
