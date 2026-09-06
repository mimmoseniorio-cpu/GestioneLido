import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { generaMappa } from '@/server/use-cases/map-setup'
import { devContext } from '@/server/dev-session'
import { ok, fail } from '@/server/http'

export const dynamic = 'force-dynamic'

const Body = z.object({
  file: z.number().int().min(1).max(60),
  perFila: z.number().int().min(1).max(120),
  numerazione: z.enum(['PROGRESSIVA', 'LETTERA_FILA', 'PER_FILA']),
  inizioDa: z.number().int().min(1).max(9999).optional(),
  passerellaDopoFila: z.number().int().min(0).max(60).optional(),
  corridoioOgni: z.number().int().min(0).max(120).optional(),
  creaZone: z.boolean().optional(),
  prezziPerZonaCents: z.array(z.number().int().min(0)).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const ctx = await devContext()
    return ok(await generaMappa(ctx, Body.parse(await req.json())), 201)
  } catch (e) {
    return fail(e)
  }
}
