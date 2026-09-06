/**
 * F6-01 · Cosa vuol dire "ombrelloni vicini" — risolve C-04.
 *
 * Il brief chiede ombrelloni adiacenti ma "vicino" non è una proprietà del
 * dato: va derivato dalla geometria. E le domande a cui rispondere non hanno
 * una risposta unica per tutti gli stabilimenti:
 *
 *   · due ombrelloni separati da un corridoio sono adiacenti?
 *   · il 12 e il 13 di file diverse sono vicini quanto quelli della stessa fila?
 *
 * Per questo il risultato è un PUNTEGGIO, non un booleano: l'algoritmo può
 * sempre proporre il meglio disponibile invece di dire "nessun risultato" —
 * che è ciò che serve all'operatore per negoziare al telefono (C-20).
 *
 * Punteggio più BASSO = più vicino.
 */

export type Punto = { posX: number; posY: number; rowLabel: string }

export type Ostacolo = {
  kind: string
  posX: number; posY: number; width: number; height: number
}

export type PesiProssimita = {
  /** quanto "costa" cambiare fila */
  rowChangePenalty: number
  /** quanto costa attraversare una passerella o un corridoio */
  corridorPenalty: number
}

export const PESI_DEFAULT: PesiProssimita = { rowChangePenalty: 1.5, corridorPenalty: 2.0 }

const SEPARANO = new Set(['CORRIDOR', 'WALKWAY'])

/** Il segmento fra i due centri attraversa il rettangolo? (Cohen–Sutherland) */
export function segmentoAttraversa(
  a: { x: number; y: number }, b: { x: number; y: number },
  r: { x: number; y: number; w: number; h: number },
): boolean {
  const [xmin, ymin, xmax, ymax] = [r.x, r.y, r.x + r.w, r.y + r.h]
  const codice = (x: number, y: number) =>
    (x < xmin ? 1 : 0) | (x > xmax ? 2 : 0) | (y < ymin ? 4 : 0) | (y > ymax ? 8 : 0)

  let c1 = codice(a.x, a.y), c2 = codice(b.x, b.y)
  let [x1, y1, x2, y2] = [a.x, a.y, b.x, b.y]

  for (let guardia = 0; guardia < 8; guardia++) {
    if (!(c1 | c2)) return true       // entrambi dentro: attraversa
    if (c1 & c2) return false         // entrambi dallo stesso lato: non attraversa

    const fuori = c1 || c2
    let x = 0, y = 0
    if (fuori & 8)      { x = x1 + ((x2 - x1) * (ymax - y1)) / (y2 - y1); y = ymax }
    else if (fuori & 4) { x = x1 + ((x2 - x1) * (ymin - y1)) / (y2 - y1); y = ymin }
    else if (fuori & 2) { y = y1 + ((y2 - y1) * (xmax - x1)) / (x2 - x1); x = xmax }
    else                { y = y1 + ((y2 - y1) * (xmin - x1)) / (x2 - x1); x = xmin }

    if (fuori === c1) { [x1, y1] = [x, y]; c1 = codice(x1, y1) }
    else              { [x2, y2] = [x, y]; c2 = codice(x2, y2) }
  }
  return false
}

export function punteggioProssimita(
  a: Punto, b: Punto,
  ostacoli: readonly Ostacolo[] = [],
  pesi: PesiProssimita = PESI_DEFAULT,
): number {
  if (a.posX === b.posX && a.posY === b.posY) return 0

  let punteggio = Math.hypot(a.posX - b.posX, a.posY - b.posY)

  if (a.rowLabel !== b.rowLabel) punteggio += pesi.rowChangePenalty

  // In certi stabilimenti la passerella separa davvero, in altri no: per
  // questo il peso è configurabile per stabilimento (BeachClub.settings).
  const attraversa = ostacoli.some(o =>
    SEPARANO.has(o.kind) &&
    segmentoAttraversa(
      { x: a.posX, y: a.posY }, { x: b.posX, y: b.posY },
      { x: o.posX - 0.5, y: o.posY - 0.5, w: o.width, h: o.height },
    ))
  if (attraversa) punteggio += pesi.corridorPenalty

  return punteggio
}

/** Quanto è compatto un gruppo: somma delle distanze a coppie. */
export function punteggioGruppo(
  gruppo: readonly Punto[],
  ostacoli: readonly Ostacolo[] = [],
  pesi: PesiProssimita = PESI_DEFAULT,
): number {
  let somma = 0
  for (let i = 0; i < gruppo.length; i++)
    for (let j = i + 1; j < gruppo.length; j++)
      somma += punteggioProssimita(gruppo[i]!, gruppo[j]!, ostacoli, pesi)
  return somma
}

/** Affiancati sulla stessa fila, senza nulla in mezzo: il caso ideale. */
export const sonoAffiancati = (a: Punto, b: Punto) =>
  a.rowLabel === b.rowLabel && Math.abs(a.posX - b.posX) === 1 && a.posY === b.posY
