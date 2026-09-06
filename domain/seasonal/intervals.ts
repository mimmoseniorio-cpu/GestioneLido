/**
 * Aritmetica sugli intervalli di assenza (docs/08 §6.2).
 *
 * Un'assenza è un INTERVALLO, non un insieme di giorni: è la scelta che tiene
 * compatto il modello. Il prezzo da pagare è che l'annullamento parziale deve
 * spezzare l'intervallo, ed è esattamente il caso in cui sbagliare significa
 * togliere il posto a un cliente che ha pagato, o negarlo a uno stagionale che
 * ne aveva diritto.
 */

export type Intervallo = { da: Date; a: Date }

const GIORNO = 86_400_000
export const giornoUtc = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

export const copre = (i: Intervallo, d: Date) =>
  d.getTime() >= i.da.getTime() && d.getTime() <= i.a.getTime()

export const siSovrappongono = (a: Intervallo, b: Intervallo) =>
  a.da.getTime() <= b.a.getTime() && b.da.getTime() <= a.a.getTime()

/** Numero di giorni, estremi inclusi: il 10–12 sono tre giorni. */
export const giorniInclusi = (i: Intervallo) =>
  Math.round((i.a.getTime() - i.da.getTime()) / GIORNO) + 1

export function elencoGiorni(i: Intervallo): Date[] {
  const out: Date[] = []
  for (let t = i.da.getTime(); t <= i.a.getTime(); t += GIORNO) out.push(new Date(t))
  return out
}

/**
 * Toglie da un intervallo i giorni occupati, restituendo i frammenti rimasti.
 *
 * Assenza 10–15 con il 12 venduto → [10–11], [13–15].
 * È il cuore di T-12: lo stagionale riprende i giorni liberi, il cliente che
 * ha pagato tiene il suo.
 */
export function sottraiGiorni(i: Intervallo, occupati: readonly Date[]): Intervallo[] {
  const daEscludere = new Set(occupati.map(d => giornoUtc(d).getTime()))
  const frammenti: Intervallo[] = []
  let inizio: Date | null = null

  for (const g of elencoGiorni(i)) {
    if (daEscludere.has(g.getTime())) {
      if (inizio) { frammenti.push({ da: inizio, a: new Date(g.getTime() - GIORNO) }); inizio = null }
    } else if (!inizio) {
      inizio = g
    }
  }
  if (inizio) frammenti.push({ da: inizio, a: i.a })
  return frammenti
}

/** I giorni di un intervallo coperti da almeno una delle prenotazioni date. */
export function giorniVenduti(
  assenza: Intervallo, prenotazioni: readonly Intervallo[],
): Date[] {
  return elencoGiorni(assenza).filter(g => prenotazioni.some(p => copre(p, g)))
}
