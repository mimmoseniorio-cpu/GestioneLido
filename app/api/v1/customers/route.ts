import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { scoped } from '@/server/repositories/scoped'
import { devContext } from '@/server/dev-session'
import { cercaClienti } from '@/server/queries/customers'
import { normalizzaTelefono } from '@/domain/customers/phone'
import { ok, fail } from '@/server/http'
import { DomainError } from '@/domain/errors'

export const dynamic = 'force-dynamic'

/** Scenario E: si cerca per cognome, nome o le ultime cifre del telefono. */
export async function GET(req: NextRequest) {
  try {
    const ctx = await devContext()
    return ok(await cercaClienti(ctx, req.nextUrl.searchParams.get('q') ?? ''))
  } catch (e) {
    return fail(e)
  }
}

const Body = z.object({
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  phone: z.string().min(3).max(30).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const ctx = await devContext()
    const body = Body.parse(await req.json())
    const db = scoped(ctx)

    const esito = body.phone ? normalizzaTelefono(body.phone) : null
    const phoneNormalized = esito?.ok ? esito.e164 : null

    if (phoneNormalized) {
      // C-80 · un duplicato non è un errore secco: è il cliente che esiste già.
      const esistente = await db.customer.findFirst({ where: { phoneNormalized } })
      if (esistente) return ok(esistente, 200)
    }

    const creato = await db.customer.create({
      data: { firstName: body.firstName, lastName: body.lastName,
              phoneRaw: body.phone ?? null, phoneNormalized },
    })
    return ok(creato, 201)
  } catch (e) {
    if (e instanceof z.ZodError)
      return fail(new DomainError('INVALID_RANGE', 'Nome e cognome sono obbligatori.'))
    return fail(e)
  }
}
