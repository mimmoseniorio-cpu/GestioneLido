/**
 * Il contesto della richiesta corrente, dal cookie di sessione.
 *
 * Sostituisce `server/dev-session.ts`, che era un ponte temporaneo dichiarato
 * tale: prendeva il primo admin del primo stabilimento e non chiedeva nulla.
 */
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { contestoDaSessione, NOME_COOKIE, type SessioneCorrente }
  from '@/server/auth/session'
import { DomainError } from '@/domain/errors'
import type { StaffContext } from '@/server/context'

export async function contestoCorrente(): Promise<SessioneCorrente | null> {
  const c = await cookies()
  return contestoDaSessione(c.get(NOME_COOKIE)?.value)
}

/**
 * Per le pagine: chi non è autenticato va al login, chi ha lo schermo
 * bloccato va al PIN.
 *
 * Il blocco reindirizza invece di sovrapporre un velo: una pagina già
 * disegnata contiene i nomi e i telefoni dei clienti, e un velo si toglie
 * con due tocchi negli strumenti del browser. Chi si allontana dal tablet
 * perde il punto in cui era — è il prezzo, ed è basso.
 */
export async function richiediStaff(): Promise<StaffContext> {
  const ctx = await contestoCorrente()
  if (!ctx) redirect('/login')
  if (ctx.bloccata) redirect('/blocco')
  return ctx
}

/** Per le API: chi non è autenticato riceve 401, non una pagina HTML. */
export async function richiediStaffApi(): Promise<StaffContext> {
  const ctx = await contestoCorrente()
  if (!ctx) throw new DomainError('UNAUTHENTICATED', 'Sessione scaduta. Rientra e riprova.')
  // 423: il client deve poter distinguere «rientra» da «sblocca», altrimenti
  // butterebbe via una sessione ancora buona e con essa la coda di scritture.
  if (ctx.bloccata)
    throw new DomainError('SESSION_LOCKED', 'Schermo bloccato: inserisci il PIN.')
  return ctx
}

export async function intestazioniRichiesta() {
  const h = await headers()
  return {
    userAgent: h.get('user-agent'),
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  }
}
