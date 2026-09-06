/**
 * F5-01 · Lo stato di un ombrellone si CALCOLA, non si memorizza (D-10, RD-01).
 *
 * Punto unico di verità di tutto il prodotto. Funzione pura: nessun accesso al
 * database, nessuna dipendenza dal framework, coperta al 100% dei rami.
 *
 * Perché non una colonna `status`. Qualunque stato persistito si disallinea al
 * primo caso limite — modifica del periodo, annullamento, ritorno anticipato
 * dello stagionale — e il disallineamento si manifesta come doppia vendita
 * davanti al cliente. In più servirebbe un processo notturno per far rientrare
 * gli stagionali, e la prima notte in cui non gira si vende un posto occupato.
 */

export type UmbrellaState =
  | 'LIBERO'
  | 'OCCUPATO'
  | 'PRENOTATO'
  | 'STAGIONALE_PRESENTE'
  | 'TEMP_DISPONIBILE'
  | 'BLOCCATO'

/** Come lo legge il gestore sulla mappa: `TEMP_DISPONIBILE` su un posto
 *  stagionale merita un'etichetta diversa, perché è ciò che può vendere. */
export type UmbrellaViewState = UmbrellaState | 'STAGIONALE_ASSENTE'

export type ReservationLike = {
  id: string
  startDate: Date
  endDate: Date
  status: 'CONFIRMED' | 'CHECKED_IN' | 'CANCELLED' | 'NO_SHOW'
  isTemporarySlot?: boolean
}

export type ContractLike = { id: string; startDate: Date; endDate: Date }
export type AbsenceLike = { id: string; startDate: Date; endDate: Date }

export type StateInput = {
  umbrella: { blocked: boolean; blockedUntil?: Date | null }
  date: Date
  today: Date
  /** contratto stagionale attivo che copre `date`, se esiste */
  contract?: ContractLike | null
  /** assenza attiva che copre `date`, se esiste */
  absence?: AbsenceLike | null
  /** item confermato o in corso che copre `date`, se esiste */
  item?: ReservationLike | null
}

/** Intervalli inclusivi: il 10–12 agosto sono tre giorni (D-02). */
export const covers = (from: Date, to: Date, d: Date) =>
  d.getTime() >= from.getTime() && d.getTime() <= to.getTime()

const isBlocked = (i: StateInput) => {
  if (!i.umbrella.blocked) return false
  // Un blocco a termine (l'operatore può bloccare per un guasto del giorno,
  // docs/04 ▲¹) non deve rendere l'ombrellone invendibile per sempre.
  if (i.umbrella.blockedUntil) return i.date.getTime() <= i.umbrella.blockedUntil.getTime()
  return true
}

/**
 * L'ORDINE È NORMATIVO, non stilistico:
 *
 *  1. `blocked` batte tutto. Un ombrellone rotto non si vende neanche se
 *     qualcuno l'ha prenotato: il gestore deve vedere il guasto.
 *  2. La prenotazione batte il contratto stagionale. Nei giorni di assenza è
 *     la prenotazione a dire la verità: il posto è stato rivenduto.
 *  3. Il contratto senza assenza significa che lo stagionale c'è.
 *  4. Altrimenti è libero.
 */
export function umbrellaState(i: StateInput): UmbrellaState {
  if (isBlocked(i)) return 'BLOCCATO'

  if (i.item && covers(i.item.startDate, i.item.endDate, i.date)) {
    // Passato e presente sono OCCUPATO: il gestore ragiona su "c'è qualcuno",
    // non sullo stato amministrativo della prenotazione.
    return i.date.getTime() <= i.today.getTime() ? 'OCCUPATO' : 'PRENOTATO'
  }

  if (i.contract && covers(i.contract.startDate, i.contract.endDate, i.date)) {
    if (i.absence && covers(i.absence.startDate, i.absence.endDate, i.date)) {
      return 'TEMP_DISPONIBILE'   // libero e vendibile
    }
    return 'STAGIONALE_PRESENTE'
  }

  return 'LIBERO'
}

/** Proiezione per la mappa: un solo stato logico, due letture per il gestore. */
export function umbrellaViewState(i: StateInput): UmbrellaViewState {
  const s = umbrellaState(i)
  if (s === 'TEMP_DISPONIBILE' && i.contract) return 'STAGIONALE_ASSENTE'
  return s
}

/** Ciò che il gestore può vendere oggi: risponde allo scenario F. */
export const isSellable = (s: UmbrellaState) => s === 'LIBERO' || s === 'TEMP_DISPONIBILE'
