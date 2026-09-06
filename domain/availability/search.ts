/**
 * F6-02 · Ricerca disponibilità — scenario B.
 *
 * "Mi servono due ombrelloni vicini dal 10 al 15 agosto." L'operatore è al
 * telefono e non può far aspettare il cliente.
 *
 * Due regole di prodotto che l'algoritmo deve rispettare:
 *
 *  1. MAI "nessun risultato" (C-20). Se non esiste la soluzione perfetta si
 *     propone la migliore parziale — tre giorni su sei, o due non adiacenti —
 *     perché è ciò che permette di negoziare invece di riattaccare.
 *  2. Un posto realmente libero viene PRIMA di un posto stagionale liberato,
 *     a parità di punteggio: costa meno (nessun credito da riconoscere) e non
 *     ha implicazioni relazionali con lo stagionale.
 *
 * Deterministico: nessuna AI, nessuna casualità. Stessi input, stessi output.
 */
import { punteggioGruppo, PESI_DEFAULT,
         type Ostacolo, type PesiProssimita, type Punto } from './proximity'

export type Candidato = Punto & {
  id: string
  visibleNumber: string
  zoneId: string | null
  prezzoGiornoCents: number
  /** vero se il posto è di uno stagionale assente (docs/08 §9) */
  temporaneo: boolean
  /** finestra contigua più lunga disponibile dentro il periodo richiesto */
  daGiorno: number
  aGiorno: number
}

export type Preferenze = {
  filaPreferita?: string | null
  zonaPreferita?: string | null
  prezzoMassimoCents?: number | null
  vicinoA?: Punto | null
}

export type RichiestaDisponibilita = {
  /** giorni come indici interi: 0 = primo giorno richiesto */
  giorniRichiesti: number
  quantita: number
  preferenze?: Preferenze
  ostacoli?: readonly Ostacolo[]
  pesi?: PesiProssimita
  massimoSoluzioni?: number
}

export type Soluzione = {
  ombrelloni: Candidato[]
  /** quanti giorni del periodo richiesto copre davvero */
  giorniCoperti: number
  completa: boolean
  daGiorno: number
  aGiorno: number
  prezzoTotaleCents: number
  punteggio: number
  /** true se almeno un posto viene da un'assenza stagionale */
  contieneTemporanei: boolean
}

const PENALITA = {
  filaDiversa: 3,
  zonaDiversa: 4,
  oltrePrezzo: 6,
  temporaneo: 0.5,      // a parità, meglio un posto davvero libero
  giornoMancante: 8,    // una copertura parziale è peggio di una completa
}

/** Sovrapposizione fra le finestre di più candidati. */
function finestraComune(gruppo: readonly Candidato[]) {
  const da = Math.max(...gruppo.map(c => c.daGiorno))
  const a  = Math.min(...gruppo.map(c => c.aGiorno))
  return { da, a, giorni: a >= da ? a - da + 1 : 0 }
}

function penalitaPreferenze(c: Candidato, p: Preferenze | undefined,
                            ostacoli: readonly Ostacolo[], pesi: PesiProssimita): number {
  if (!p) return c.temporaneo ? PENALITA.temporaneo : 0
  let s = c.temporaneo ? PENALITA.temporaneo : 0
  if (p.filaPreferita && c.rowLabel !== p.filaPreferita) s += PENALITA.filaDiversa
  if (p.zonaPreferita && c.zoneId !== p.zonaPreferita) s += PENALITA.zonaDiversa
  if (p.prezzoMassimoCents != null && c.prezzoGiornoCents > p.prezzoMassimoCents) s += PENALITA.oltrePrezzo
  if (p.vicinoA) s += punteggioGruppo([c, p.vicinoA], ostacoli, pesi) * 0.5
  return s
}

/**
 * Genera i gruppi candidati per espansione ai vicini più prossimi.
 *
 * Non tutte le combinazioni: con 96 ombrelloni e 4 posti sarebbero oltre tre
 * milioni. Per ogni candidato si prende lui più i (quantità−1) più vicini —
 * che è esattamente ciò che cerca chi chiede "vicini tra loro", e cattura
 * anche le coppie su file diverse che una finestra scorrevole per fila
 * perderebbe.
 */
function generaGruppi(candidati: readonly Candidato[], quantita: number,
                      ostacoli: readonly Ostacolo[], pesi: PesiProssimita): Candidato[][] {
  if (quantita === 1) return candidati.map(c => [c])

  const visti = new Set<string>()
  const gruppi: Candidato[][] = []

  for (const seme of candidati) {
    const vicini = candidati
      .filter(c => c.id !== seme.id)
      .map(c => ({ c, d: punteggioGruppo([seme, c], ostacoli, pesi) }))
      .sort((a, b) => a.d - b.d || a.c.visibleNumber.localeCompare(b.c.visibleNumber))
      .slice(0, quantita - 1)
      .map(x => x.c)

    if (vicini.length < quantita - 1) continue
    const gruppo = [seme, ...vicini]
    const chiave = gruppo.map(g => g.id).sort().join('|')
    if (visti.has(chiave)) continue
    visti.add(chiave)
    gruppi.push(gruppo)
  }
  return gruppi
}

export function cercaDisponibilita(
  candidati: readonly Candidato[],
  richiesta: RichiestaDisponibilita,
): { soluzioni: Soluzione[]; completeTrovate: number } {
  const ostacoli = richiesta.ostacoli ?? []
  const pesi = richiesta.pesi ?? PESI_DEFAULT
  const massimo = richiesta.massimoSoluzioni ?? 5

  if (richiesta.quantita < 1) return { soluzioni: [], completeTrovate: 0 }

  const gruppi = generaGruppi(candidati, richiesta.quantita, ostacoli, pesi)

  const soluzioni: Soluzione[] = gruppi.flatMap(gruppo => {
    const f = finestraComune(gruppo)
    if (f.giorni === 0) return []   // nessun giorno in comune: non è una soluzione

    const completa = f.giorni >= richiesta.giorniRichiesti
    const mancanti = Math.max(0, richiesta.giorniRichiesti - f.giorni)

    const punteggio =
      punteggioGruppo(gruppo, ostacoli, pesi) +
      gruppo.reduce((s, c) => s + penalitaPreferenze(c, richiesta.preferenze, ostacoli, pesi), 0) +
      mancanti * PENALITA.giornoMancante

    return [{
      ombrelloni: [...gruppo].sort((a, b) => a.visibleNumber.localeCompare(b.visibleNumber, 'it', { numeric: true })),
      giorniCoperti: f.giorni,
      completa,
      daGiorno: f.da,
      aGiorno: f.a,
      prezzoTotaleCents: gruppo.reduce((s, c) => s + c.prezzoGiornoCents * f.giorni, 0),
      punteggio: Math.round(punteggio * 1000) / 1000,
      contieneTemporanei: gruppo.some(c => c.temporaneo),
    }]
  })

  // Le complete prima, poi per punteggio. A parità, il numero più basso:
  // l'ordine deve essere stabile o due ricerche identiche darebbero risposte
  // diverse e l'operatore perderebbe fiducia.
  soluzioni.sort((a, b) =>
    Number(b.completa) - Number(a.completa) ||
    b.giorniCoperti - a.giorniCoperti ||
    a.punteggio - b.punteggio ||
    a.prezzoTotaleCents - b.prezzoTotaleCents ||
    a.ombrelloni[0]!.visibleNumber.localeCompare(b.ombrelloni[0]!.visibleNumber, 'it', { numeric: true }))

  return {
    soluzioni: soluzioni.slice(0, massimo),
    completeTrovate: soluzioni.filter(s => s.completa).length,
  }
}
