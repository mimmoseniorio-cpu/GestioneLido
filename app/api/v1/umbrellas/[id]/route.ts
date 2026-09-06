import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { spostaOmbrellone, rinumeraOmbrellone } from '@/server/use-cases/map-setup'
import { richiediStaffApi } from '@/server/current-user'
import { ok, fail } from '@/server/http'
import { DomainError } from '@/domain/errors'

export const dynamic = 'force-dynamic'

const Body = z.object({
  posX: z.number().int().min(0).max(200).optional(),
  posY: z.number().int().min(0).max(200).optional(),
  rowLabel: z.string().min(1).max(8).optional(),
  visibleNumber: z.string().min(1).max(12).optional(),
})

/** F6-27 · spostare e rinumerare: due modifiche alla stessa riga. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await richiediStaffApi()
    const { id } = await params
    const b = Body.parse(await req.json())

    if (b.visibleNumber !== undefined)
      await rinumeraOmbrellone(ctx, { umbrellaId: id, nuovoNumero: b.visibleNumber })

    if (b.posX !== undefined || b.posY !== undefined) {
      if (b.posX === undefined || b.posY === undefined)
        throw new DomainError('INVALID_RANGE', 'Servono tutte e due le coordinate.')
      const esito = await spostaOmbrellone(ctx,
        { umbrellaId: id, posX: b.posX, posY: b.posY, rowLabel: b.rowLabel })
      return ok(esito)
    }
    return ok({ visibleNumber: b.visibleNumber })
  } catch (e) {
    return fail(e)
  }
}
