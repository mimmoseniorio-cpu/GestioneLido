import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { creaContratto } from '@/server/use-cases/contracts'
import { richiediStaffApi } from '@/server/current-user'
import { ok, fail, parseDay, baseUrl } from '@/server/http'

export const dynamic = 'force-dynamic'

const Body = z.object({
  customerId: z.string().uuid(),
  umbrellaId: z.string().uuid(),
  dal: z.string(), al: z.string(),
  prezzoCents: z.number().int().min(0).max(100_000_00),
})

export async function POST(req: NextRequest) {
  try {
    const ctx = await richiediStaffApi()
    const b = Body.parse(await req.json())
    const esito = await creaContratto(ctx, {
      customerId: b.customerId, umbrellaId: b.umbrellaId,
      dal: parseDay(b.dal), al: parseDay(b.al), prezzoCents: b.prezzoCents,
    })
    return ok({ id: esito.id, link: `${baseUrl(req)}/s/${esito.token}` }, 201)
  } catch (e) {
    return fail(e)
  }
}
