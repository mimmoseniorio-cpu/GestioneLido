import { cookies } from 'next/headers'
import { blocca, NOME_COOKIE } from '@/server/auth/session'
import { ok, fail } from '@/server/http'

export const dynamic = 'force-dynamic'

/** Il pulsante che l'operatore preme quando si allontana dal bancone. */
export async function POST() {
  try {
    const c = await cookies()
    await blocca(c.get(NOME_COOKIE)?.value)
    return ok({ bloccato: true })
  } catch (e) {
    return fail(e)
  }
}
