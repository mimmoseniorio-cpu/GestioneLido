import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { modificaRegola, disattivaRegola } from '@/server/use-cases/price-rules'
import { devContext } from '@/server/dev-session'
import { ok, fail } from '@/server/http'

export const dynamic = 'force-dynamic'

const Body = z.object({
  name: z.string().min(1).max(80).optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  priceCents: z.number().int().min(0).max(10_000_00).optional(),
  active: z.boolean().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await modificaRegola(await devContext(), { id, ...Body.parse(await req.json()) })
    return ok({ ok: true })
  } catch (e) {
    return fail(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await disattivaRegola(await devContext(), { id })
    return ok({ ok: true })
  } catch (e) {
    return fail(e)
  }
}
