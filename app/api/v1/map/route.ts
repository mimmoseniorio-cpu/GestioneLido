import type { NextRequest } from 'next/server'
import { getMapForDate } from '@/server/queries/map'
import { richiediStaffApi } from '@/server/current-user'
import { ok, fail, parseDay } from '@/server/http'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const ctx = await richiediStaffApi()
    const date = parseDay(req.nextUrl.searchParams.get('date'))
    return ok(await getMapForDate(ctx, date))
  } catch (e) {
    return fail(e)
  }
}
