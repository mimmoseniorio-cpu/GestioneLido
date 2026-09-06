import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma, scoped } from '@/server/repositories/scoped'
import { richiediStaffApi } from '@/server/current-user'
import { requirePermission } from '@/server/context'
import { P } from '@/domain/auth/permissions'
import { registraRimborso } from '@/server/use-cases/payments'
import { withIdempotency } from '@/server/idempotency'
import { audit } from '@/server/audit'
import { ok, fail } from '@/server/http'

export const dynamic = 'force-dynamic'

const Body = z.object({
  reservationId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  method: z.enum(['CASH', 'CARD', 'TRANSFER', 'ONLINE', 'OTHER']).optional(),
  motivo: z.string().min(1).max(300),
})

export async function POST(req: NextRequest) {
  try {
    const ctx = await richiediStaffApi()
    requirePermission(ctx, P.PAYMENT_REFUND)
    const body = Body.parse(await req.json())

    // Il doppio tap non deve far uscire due volte gli stessi soldi (C-05).
    const res = await withIdempotency(
      { key: req.headers.get('idempotency-key') ?? undefined,
        beachClubId: ctx.beachClubId, endpoint: 'POST /payments/refund', body },
      async () => {
        const esito = await prisma.$transaction(async tx => {
          const db = scoped(ctx, tx)
          const r = await registraRimborso(db, ctx, body)
          // Il motivo finisce nel registro: è ciò che a fine stagione spiega
          // perché la cassa di quel giorno non torna con gli incassi.
          await audit(tx, ctx, 'payment.refund',
            { type: 'reservation', id: body.reservationId },
            { after: { rimborsatoCents: r.rimborsatoCents, motivo: body.motivo,
                       metodo: body.method ?? 'CASH', stato: r.stato } })
          return r
        })
        return { status: 201, body: esito }
      },
    )
    return ok(res.body, res.status)
  } catch (e) {
    return fail(e)
  }
}
