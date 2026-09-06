import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { scoped } from '@/server/repositories/scoped'
import { richiediStaffApi } from '@/server/current-user'
import { creaRegola } from '@/server/use-cases/price-rules'
import { ok, fail } from '@/server/http'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const ctx = await richiediStaffApi()
    const db = scoped(ctx)
    const stagione = await db.season.findFirst({ where: { status: 'ACTIVE' } })
    if (!stagione) return ok([])
    const regole = await db.priceRule.findMany({
      where: { seasonId: stagione.id },
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
    })
    return ok(regole)
  } catch (e) {
    return fail(e)
  }
}

const giorno = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()

const Body = z.object({
  name: z.string().min(1).max(80),
  priority: z.number().int().min(0).max(1000),
  priceCents: z.number().int().min(0).max(10_000_00),
  zoneId: z.string().uuid().nullable().optional(),
  rowLabel: z.string().max(20).nullable().optional(),
  dateFrom: giorno,
  dateTo: giorno,
  weekdays: z.array(z.number().int().min(1).max(7)).optional(),
  minDays: z.number().int().min(1).max(365).nullable().optional(),
  maxDays: z.number().int().min(1).max(365).nullable().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const ctx = await richiediStaffApi()
    const b = Body.parse(await req.json())
    return ok(await creaRegola(ctx, {
      ...b,
      dateFrom: b.dateFrom ? new Date(b.dateFrom + 'T00:00:00Z') : null,
      dateTo: b.dateTo ? new Date(b.dateTo + 'T00:00:00Z') : null,
    }), 201)
  } catch (e) {
    return fail(e)
  }
}
