/**
 * Il contesto della richiesta corrente, dal cookie di sessione.
 *
 * Sostituisce `server/dev-session.ts`, che era un ponte temporaneo dichiarato
 * tale: prendeva il primo admin del primo stabilimento e non chiedeva nulla.
 */
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { contestoDaSessione, NOME_COOKIE } from '@/server/auth/session'
import { DomainError } from '@/domain/errors'
import type { StaffContext } from '@/server/context'

export async function contestoCorrente(): Promise<StaffContext | null> {
  const c = await cookies()
  return contestoDaSessione(c.get(NOME_COOKIE)?.value)
}

/** Per le pagine: chi non è autenticato va al login. */
export async function richiediStaff(): Promise<StaffContext> {
  const ctx = await contestoCorrente()
  if (!ctx) redirect('/login')
  return ctx
}

/** Per le API: chi non è autenticato riceve 401, non una pagina HTML. */
export async function richiediStaffApi(): Promise<StaffContext> {
  const ctx = await contestoCorrente()
  if (!ctx) throw new DomainError('UNAUTHENTICATED', 'Sessione scaduta. Rientra e riprova.')
  return ctx
}

export async function intestazioniRichiesta() {
  const h = await headers()
  return {
    userAgent: h.get('user-agent'),
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  }
}
