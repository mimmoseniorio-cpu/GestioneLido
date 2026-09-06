import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { cookies } from 'next/headers'
import { sblocca, NOME_COOKIE } from '@/server/auth/session'
import { ok, fail } from '@/server/http'
import { DomainError } from '@/domain/errors'

export const dynamic = 'force-dynamic'

const Body = z.object({ pin: z.string().min(1).max(20) })

export async function POST(req: NextRequest) {
  try {
    const { pin } = Body.parse(await req.json())
    const c = await cookies()
    const esito = await sblocca(c.get(NOME_COOKIE)?.value, pin)

    if (esito.esito === 'APERTO') return ok({ esito: 'APERTO' })

    if (esito.esito === 'SESSIONE_CHIUSA') {
      // Il cookie va tolto: lasciarlo lì manderebbe l'operatore su una pagina
      // che lo rimanda al PIN di una sessione che non esiste più.
      c.delete(NOME_COOKIE)
      throw new DomainError('UNAUTHENTICATED',
        'Troppi tentativi. Rientra con la password.')
    }

    throw new DomainError('FORBIDDEN',
      esito.tentativiRimasti === 1
        ? 'PIN errato. Ancora un tentativo, poi serve la password.'
        : `PIN errato. Restano ${esito.tentativiRimasti} tentativi.`,
      { tentativiRimasti: esito.tentativiRimasti })
  } catch (e) {
    return fail(e)
  }
}
