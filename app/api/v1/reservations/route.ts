import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createReservation } from '@/server/use-cases/reservations'
import { richiediStaffApi } from '@/server/current-user'
import { withIdempotency } from '@/server/idempotency'
import { ok, fail, parseDay } from '@/server/http'

export const dynamic = 'force-dynamic'

// Validazione lato server sempre, anche dove la UI valida già (NF-03).
const Body = z.object({
  umbrellaIds: z.array(z.string().uuid()).min(1),
  customerId: z.string().uuid(),
  from: z.string(),
  to: z.string(),
  peopleCount: z.number().int().min(1).max(20).optional(),
  source: z.enum(['PHONE', 'WHATSAPP', 'RECEPTION', 'WEB', 'OTHER']).optional(),
  notes: z.string().max(500).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const ctx = await richiediStaffApi()
    const body = Body.parse(await req.json())

    // Il doppio tap su rete lenta non deve creare due prenotazioni (C-05).
    const res = await withIdempotency(
      { key: req.headers.get('idempotency-key') ?? undefined,
        beachClubId: ctx.beachClubId, endpoint: 'POST /reservations', body },
      async () => {
        const created = await createReservation(ctx, {
          ...body, from: parseDay(body.from), to: parseDay(body.to),
        })
        return { status: 201, body: created }
      },
    )
    return ok(res.body, res.status)
  } catch (e) {
    return fail(e)
  }
}
