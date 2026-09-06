import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { declareAbsence } from '@/server/use-cases/absences'
import { richiediStaffApi } from '@/server/current-user'
import { ok, fail, parseDay } from '@/server/http'

export const dynamic = 'force-dynamic'

const Body = z.object({ contractId: z.string().uuid(), from: z.string(), to: z.string() })

/** F6-11 · l'operatore registra l'assenza per lo stagionale che telefona. */
export async function POST(req: NextRequest) {
  try {
    const ctx = await richiediStaffApi()
    const b = Body.parse(await req.json())
    return ok(await declareAbsence(ctx, {
      contractId: b.contractId, from: parseDay(b.from), to: parseDay(b.to),
    }), 201)
  } catch (e) {
    return fail(e)
  }
}
