import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { esci, NOME_COOKIE } from '@/server/auth/session'

export const dynamic = 'force-dynamic'

/**
 * «Ho dimenticato il PIN»: chiude la sessione e riporta al login.
 *
 * È una GET perché è un link su una pagina bloccata, dove non gira nulla che
 * possa comporre una POST. Chiude solo la propria sessione, e la conseguenza
 * peggiore è dover rifare il login: non c'è nulla da proteggere con un token
 * anti-falsificazione.
 */
export async function GET() {
  const c = await cookies()
  await esci(c.get(NOME_COOKIE)?.value)
  c.delete(NOME_COOKIE)
  redirect('/login')
}
