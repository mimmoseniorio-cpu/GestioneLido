/**
 * F6-26 · Generatore di griglia — risolve C-08.
 *
 * Nessun gestore posizionerà 96 ombrelloni uno a uno col mouse a stagione
 * iniziata. Se configurare richiede un'ora, il prodotto non viene mai
 * adottato: questo è un requisito di adozione, non una comodità.
 *
 * «6 file da 16, numerazione progressiva» → la mappa esiste in un colpo, poi
 * si aggiusta.
 *
 * Funzione pura: la stessa anteprima che il gestore vede prima di confermare
 * è ciò che verrà scritto nel database.
 */

export type Numerazione =
  /** 1, 2, 3 … continuando da una fila all'altra */
  | 'PROGRESSIVA'
  /** A1, A2 … B1, B2 … */
  | 'LETTERA_FILA'
  /** ogni fila riparte da 1: 1…16, 1…16 (numeri ripetuti: non ammesso) */
  | 'PER_FILA'

export type ParametriGriglia = {
  file: number
  perFila: number
  numerazione: Numerazione
  /** da quale numero parte la numerazione progressiva */
  inizioDa?: number
  /** etichette delle file; se assenti si usano A, B, C… */
  etichetteFile?: string[]
  /** una passerella orizzontale dopo la N-esima fila (0 = nessuna) */
  passerellaDopoFila?: number
  /** un corridoio verticale ogni N ombrelloni (0 = nessuno) */
  corridoioOgni?: number
}

export type OmbrelloneGenerato = {
  visibleNumber: string
  rowLabel: string
  posX: number
  posY: number
  /** indice di fila a partire dal mare (0 = prima fila) */
  indiceFila: number
}

export type FeatureGenerata = {
  kind: 'WALKWAY' | 'CORRIDOR'
  label: string | null
  posX: number; posY: number; width: number; height: number
}

export type Griglia = {
  ombrelloni: OmbrelloneGenerato[]
  features: FeatureGenerata[]
  larghezza: number
  altezza: number
  errori: string[]
}

const LETTERE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export const etichettaFila = (i: number, personalizzate?: string[]) =>
  personalizzate?.[i] ?? (LETTERE[i] ?? `F${i + 1}`)

export function generaGriglia(p: ParametriGriglia): Griglia {
  const errori: string[] = []
  if (p.file < 1) errori.push('Serve almeno una fila.')
  if (p.perFila < 1) errori.push('Serve almeno un ombrellone per fila.')
  if (p.file * p.perFila > 1000) errori.push('Massimo 1000 ombrelloni.')
  if (p.numerazione === 'PER_FILA')
    errori.push('Numerare ripartendo da 1 a ogni fila crea numeri duplicati: usa A1, B1… oppure la numerazione progressiva.')
  if (errori.length > 0)
    return { ombrelloni: [], features: [], larghezza: 0, altezza: 0, errori }

  const passerellaDopo = p.passerellaDopoFila ?? 0
  const corridoioOgni = p.corridoioOgni ?? 0
  const ombrelloni: OmbrelloneGenerato[] = []
  let n = p.inizioDa ?? 1

  for (let f = 0; f < p.file; f++) {
    const etichetta = etichettaFila(f, p.etichetteFile)
    // La passerella occupa una riga intera: le file dopo scalano di uno.
    const posY = f + (passerellaDopo > 0 && f >= passerellaDopo ? 1 : 0)

    for (let c = 0; c < p.perFila; c++) {
      // Ogni corridoio occupa una colonna: gli ombrelloni dopo scalano.
      const salti = corridoioOgni > 0 ? Math.floor(c / corridoioOgni) : 0
      const posX = c + salti

      ombrelloni.push({
        visibleNumber: p.numerazione === 'LETTERA_FILA' ? `${etichetta}${c + 1}` : String(n),
        rowLabel: etichetta,
        posX, posY, indiceFila: f,
      })
      n++
    }
  }

  const larghezza = Math.max(...ombrelloni.map(o => o.posX)) + 1
  const altezza = Math.max(...ombrelloni.map(o => o.posY)) + 1

  const features: FeatureGenerata[] = []
  if (passerellaDopo > 0 && passerellaDopo < p.file) {
    features.push({ kind: 'WALKWAY', label: 'Passerella',
                    posX: 0, posY: passerellaDopo, width: larghezza, height: 1 })
  }
  if (corridoioOgni > 0) {
    for (let c = corridoioOgni; c < p.perFila; c += corridoioOgni) {
      const salti = Math.floor((c - 1) / corridoioOgni)
      features.push({ kind: 'CORRIDOR', label: null,
                      posX: c + salti, posY: 0, width: 1, height: altezza })
    }
  }

  return { ombrelloni, features, larghezza, altezza, errori: [] }
}

/**
 * Le zone tariffarie predefinite: prima fila, centrale, retro. Il gestore
 * ragiona così, e senza zone il listino non ha su cosa appoggiarsi.
 */
export function zonePredefinite(file: number): { nome: string; dalla: number; alla: number }[] {
  if (file <= 1) return [{ nome: 'Unica', dalla: 0, alla: 0 }]
  if (file === 2) return [{ nome: 'Prima fila', dalla: 0, alla: 0 },
                          { nome: 'Retro', dalla: 1, alla: 1 }]
  return [
    { nome: 'Prima fila', dalla: 0, alla: 0 },
    { nome: 'Centrale', dalla: 1, alla: file - 2 },
    { nome: 'Retro', dalla: file - 1, alla: file - 1 },
  ]
}
