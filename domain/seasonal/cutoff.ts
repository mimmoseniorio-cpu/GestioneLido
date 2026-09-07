/**
 * D-12 · L'orario di taglio delle assenze — risolve C-02.
 *
 * Uno stagionale che alle 13:00 di ferragosto dichiara «oggi non vengo» libera
 * un posto che nessuno comprerà più: i clienti sono arrivati alle 9. Se il
 * sistema gli accredita comunque un credito, lo stabilimento paga per nulla.
 *
 * L'assenza si registra lo stesso — al gestore serve saperlo — ma marcata
 * `is_late`, e non matura credito (K-01).
 *
 * REVISIONE, dopo la prova sul campo. Il taglio era alle 20:00 del giorno
 * PRECEDENTE. È risultato troppo severo: una comunicazione arrivata alle 20:01
 * per il giorno dopo non maturava credito, mentre il posto era perfettamente
 * vendibile — il gestore aveva tutta la notte e la mattina. Una regola che
 * punisce lo stagionale per un posto che lo stabilimento ha comunque
 * rivenduto insegna a non comunicare le assenze, e senza quelle il prodotto
 * non esiste.
 *
 * Ora il taglio è alle 10:00 del giorno STESSO: la mattina il posto si vende
 * ancora, a metà mattinata no. Resta configurabile per stabilimento — chi
 * apre alle 8 vorrà un'ora diversa da chi apre alle 10.
 *
 * Il taglio si valuta nel FUSO DELLO STABILIMENTO: «entro le 10:00» deve
 * significare le 10:00 sull'orologio del gestore, anche all'ora legale (C-52).
 */

export type RegoleCutoff = {
  /** ora locale del taglio, 0–23 */
  absenceCutoffHour: number
  /** quanti giorni prima del primo giorno di assenza */
  absenceCutoffDaysBefore: number
}

/** Offset del fuso, in minuti, all'istante indicato. */
function offsetMinuti(istante: Date, timeZone: string): number {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p = Object.fromEntries(f.formatToParts(istante).map(x => [x.type, x.value])) as
    Record<string, string>
  const comeSeUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!,
                             +p.hour! % 24, +p.minute!, +p.second!)
  return (comeSeUtc - istante.getTime()) / 60_000
}

/**
 * L'istante UTC corrispondente a una data-ora LOCALE di quel fuso.
 * Due passaggi: il primo offset è approssimato, il secondo lo corregge quando
 * il cambio d'ora cade proprio lì in mezzo.
 */
export function istanteLocale(
  anno: number, mese: number, giorno: number, ora: number, timeZone: string,
): Date {
  const primoTentativo = Date.UTC(anno, mese - 1, giorno, ora)
  let utc = primoTentativo - offsetMinuti(new Date(primoTentativo), timeZone) * 60_000
  utc = primoTentativo - offsetMinuti(new Date(utc), timeZone) * 60_000
  return new Date(utc)
}

/** L'istante entro cui l'assenza va dichiarata per maturare credito. */
export function istanteDiTaglio(
  primoGiornoAssenza: Date, regole: RegoleCutoff, timeZone: string,
): Date {
  const g = new Date(primoGiornoAssenza.getTime() - regole.absenceCutoffDaysBefore * 86_400_000)
  return istanteLocale(g.getUTCFullYear(), g.getUTCMonth() + 1, g.getUTCDate(),
                       regole.absenceCutoffHour, timeZone)
}

/** true = dichiarata fuori tempo: si registra, ma non matura credito. */
export function fuoriTempo(
  dichiarataIl: Date, primoGiornoAssenza: Date, regole: RegoleCutoff, timeZone: string,
): boolean {
  return dichiarataIl.getTime() > istanteDiTaglio(primoGiornoAssenza, regole, timeZone).getTime()
}
