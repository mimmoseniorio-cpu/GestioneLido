import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { scoped } from '@/server/repositories/scoped'
import { richiediStaffApi } from '@/server/current-user'
import { withIdempotency } from '@/server/idempotency'
import { ok, fail } from '@/server/http'

export const dynamic = 'force-dynamic'

const Body = z.object({
  reservationId: z.string().uuid(),
  amountCents: z.number().int(),
  method: z.enum(['CASH', 'CARD', 'TRANSFER', 'ONLINE', 'OTHER']).default('CASH'),
})

export async function POST(req: NextRequest) {
  try {
    const ctx = await richiediStaffApi()
    const body = Body.parse(await req.json())
    const db = scoped(ctx)

    // Il doppio tap su "incassa" non deve registrare due pagamenti (C-05).
    const res = await withIdempotency(
      { key: req.headers.get('idempotency-key') ?? undefined,
        beachClubId: ctx.beachClubId, endpoint: 'POST /payments', body },
      async () => {
        const prenotazione = await db.reservation.byIdOrFail(body.reservationId)
        await db.payment.create({
          data: { reservationId: prenotazione.id, amountCents: body.amountCents,
                  method: body.method,
                  collectedById: ctx.kind === 'STAFF' ? ctx.userId : null },
        })
        const pagamenti = await db.payment.findMany({ where: { reservationId: prenotazione.id } })
        const pagato = (pagamenti as any[]).reduce((s, p) => s + p.amountCents, 0)
        const stato = pagato <= 0 ? 'UNPAID'
          : pagato >= prenotazione.totalCents ? 'PAID' : 'PARTIAL'
        await db.reservation.updateById(prenotazione.id, { paymentStatus: stato })
        return { status: 201, body: { pagatoCents: pagato, stato } }
      },
    )
    return ok(res.body, res.status)
  } catch (e) {
    return fail(e)
  }
}
