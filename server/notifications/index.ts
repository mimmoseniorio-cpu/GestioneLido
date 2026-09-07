/**
 * F6-29 · Dove finiscono gli eventi.
 *
 * Un'astrazione con una sola implementazione è di solito un peso inutile.
 * Qui serve per una ragione precisa: il canale vero — una notifica sul
 * telefono del gestore — è previsto in `R2`, e quando arriverà non deve
 * costringere a rimettere le mani dentro `declareAbsence`, che è il codice
 * più delicato del prodotto.
 *
 * Intanto l'avviso vero al gestore non passa da qui: è la fascia sulla mappa
 * (`server/queries/novita.ts`), che legge le assenze appena dichiarate. Questo
 * porto lascia la traccia nel registro dell'applicazione, ed è il gancio a cui
 * si attaccherà il resto.
 */
import type { Evento } from '@/domain/notifications'
import { descrizione } from '@/domain/notifications'

export type NotificationPort = {
  invia(evento: Evento): Promise<void>
}

/** Implementazione a log: non fa nulla di visibile, e lo dichiara. */
export const notificatoreDiLog: NotificationPort = {
  async invia(evento) {
    console.log(`[notifica] ${evento.tipo} · ${descrizione(evento)}`)
  },
}

let attivo: NotificationPort = notificatoreDiLog

/** Sostituibile nei test e, in `R2`, dal canale vero. */
export function usaNotificatore(porto: NotificationPort) {
  const precedente = attivo
  attivo = porto
  return () => { attivo = precedente }
}

/**
 * Avvisare non deve poter far fallire l'operazione che l'ha causata.
 *
 * Se il canale è giù, l'assenza resta dichiarata: il cliente ha fatto la sua
 * parte e il posto è vendibile lo stesso. Il contrario — perdere l'assenza
 * perché una notifica non è partita — sarebbe assurdo.
 */
export async function notifica(evento: Evento): Promise<void> {
  try {
    await attivo.invia(evento)
  } catch (e) {
    console.error('[notifica] invio fallito, proseguo', e)
  }
}
