import { cookies } from 'next/headers'
import { esci, NOME_COOKIE } from '@/server/auth/session'
import { ok, fail } from '@/server/http'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const c = await cookies()
    await esci(c.get(NOME_COOKIE)?.value)
    c.delete(NOME_COOKIE)
    return ok({ ok: true })
  } catch (e) {
    return fail(e)
  }
}
