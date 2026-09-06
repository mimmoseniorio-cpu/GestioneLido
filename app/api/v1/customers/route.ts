import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { scoped } from '@/server/repositories/scoped'
import { richiediStaffApi } from '@/server/current-user'
import { cercaClienti } from '@/server/queries/customers'
import { trovaOCreaCliente } from '@/server/use-cases/customers'
import { ok, fail } from '@/server/http'
import { DomainError } from '@/domain/errors'

export const dynamic = 'force-dynamic'

/** Scenario E: si cerca per cognome, nome o le ultime cifre del telefono. */
export async function GET(req: NextRequest) {
  try {
    const ctx = await richiediStaffApi()
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
    const ctx = await richiediStaffApi()
    const body = Body.parse(await req.json())
    const { cliente, creato } = await trovaOCreaCliente(scoped(ctx), body)
    return ok(cliente, creato ? 201 : 200)
  } catch (e) {
    if (e instanceof z.ZodError)
      return fail(new DomainError('INVALID_RANGE', 'Nome e cognome sono obbligatori.'))
    return fail(e)
  }
}
