import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { cookies } from 'next/headers'
import { accedi, NOME_COOKIE } from '@/server/auth/session'
import { intestazioniRichiesta } from '@/server/current-user'
import { ok, fail } from '@/server/http'

export const dynamic = 'force-dynamic'

const Body = z.object({ email: z.string().min(3).max(200), password: z.string().min(1).max(200) })

export async function POST(req: NextRequest) {
  try {
    const b = Body.parse(await req.json())
    const { userAgent, ip } = await intestazioniRichiesta()
    const esito = await accedi({ ...b, userAgent, ip })

    const c = await cookies()
    c.set(NOME_COOKIE, esito.token, {
      httpOnly: true,                       // inaccessibile a JavaScript
      sameSite: 'lax',                      // niente invio da siti terzi
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: esito.scadenza,
    })
    return ok({ nome: esito.nome, ruolo: esito.ruolo })
  } catch (e) {
    return fail(e)
  }
}
