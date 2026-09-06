/**
 * F6-12 · Calcolo del credito allo stagionale (docs/08 §7).
 *
 * Regola confermata dall'utente: **il credito matura solo se il gestore
 * riesce effettivamente a rivendere il posto**. Se l'ombrellone resta vuoto,
 * lo stagionale non prende nulla — altrimenti lo stabilimento pagherebbe per
 * un posto che non ha incassato niente (K-04).
 *
 * Funzione pura: nessun database, nessuna data, nessun effetto.
 */

export type RegoleCredito = {
  /** quota dell'incasso della rivendita riconosciuta allo stagionale */
  creditPercent: number
  /** tetto per stagione e per contratto (D-13), 0 = nessun tetto */
  creditCapCentsPerSeason: number
}

export type EsitoCredito = {
  importoCents: number
  /** perché il credito è zero o ridotto: serve a spiegarlo al cliente */
  motivo: 'MATURATO' | 'ASSENZA_TARDIVA' | 'TETTO_RAGGIUNTO' | 'TETTO_PARZIALE' | 'NULLA_DA_MATURARE'
}

export function calcolaCredito(input: {
  prezzoVenditaCents: number
  giaMaturatoCents: number
  assenzaTardiva: boolean
  regole: RegoleCredito
}): EsitoCredito {
  // K-01 · dichiarata dopo il taglio: il posto non era realisticamente
  // vendibile, quindi lo stabilimento non deve pagare per averlo venduto lo
  // stesso. L'incasso resta suo per intero.
  if (input.assenzaTardiva) return { importoCents: 0, motivo: 'ASSENZA_TARDIVA' }

  if (input.prezzoVenditaCents <= 0) return { importoCents: 0, motivo: 'NULLA_DA_MATURARE' }

  const pieno = Math.round(input.prezzoVenditaCents * (input.regole.creditPercent / 100))
  if (pieno <= 0) return { importoCents: 0, motivo: 'NULLA_DA_MATURARE' }

  const tetto = input.regole.creditCapCentsPerSeason
  if (tetto <= 0) return { importoCents: pieno, motivo: 'MATURATO' }

  // D-13 · il tetto limita l'incentivo alle assenze dichiarate "tanto per
  // provare", senza togliere valore a chi libera il posto poche volte.
  const residuo = tetto - input.giaMaturatoCents
  if (residuo <= 0) return { importoCents: 0, motivo: 'TETTO_RAGGIUNTO' }
  if (pieno > residuo) return { importoCents: residuo, motivo: 'TETTO_PARZIALE' }
  return { importoCents: pieno, motivo: 'MATURATO' }
}

/** Il testo che legge il cliente nel suo storico. */
export function descrizioneCredito(dal: string, al: string, motivo: EsitoCredito['motivo']) {
  const periodo = dal === al ? `del ${dal}` : `dal ${dal} al ${al}`
  if (motivo === 'TETTO_PARZIALE')
    return `Posto liberato ${periodo} e riassegnato (raggiunto il massimo stagionale)`
  return `Posto liberato ${periodo} e riassegnato`
}
