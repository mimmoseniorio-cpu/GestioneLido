import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { scoped } from '@/server/repositories/scoped'
import { devContext } from '@/server/dev-session'
import { ok, fail } from '@/server/http'
import { DomainError } from '@/domain/errors'

export const dynamic = 'force-dynamic'

/** Normalizzazione minima verso E.164 (D-04). La versione completa è F6-20. */
function normalizzaTelefono(raw: string): string | null {
  const solo = raw.replace(/[^\d+]/g, '')
  if (solo.length < 6) return null
  if (solo.startsWith('+')) return solo
  if (solo.startsWith('00')) return '+' + solo.slice(2)
  if (solo.startsWith('3')) return '+39' + solo      // cellulare italiano
  return '+39' + solo
}

/** Scenario E: si cerca per cognome o per le ultime cifre del telefono. */
export async function GET(req: NextRequest) {
  try {
    const ctx = await devContext()
    const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
    if (q.length < 2) return ok([])
    const db = scoped(ctx)
    const clienti = await db.customer.findMany({
      where: {
        OR: [
          { lastName:  { contains: q, mode: 'insensitive' } },
          { firstName: { contains: q, mode: 'insensitive' } },
          { phoneNormalized: { contains: q.replace(/\D/g, '') } },
        ],
      },
      take: 8,
      orderBy: { lastName: 'asc' },
    })
    return ok(clienti)
  } catch (e) {
    return fail(e)
  }
}

const Body = z.object({
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  phone: z.string().min(6).max(30).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const ctx = await devContext()
    const body = Body.parse(await req.json())
    const db = scoped(ctx)
    const phoneNormalized = body.phone ? normalizzaTelefono(body.phone) : null

    if (phoneNormalized) {
      // Duplicato: non un errore secco, ma il cliente che esiste già (C-80).
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
