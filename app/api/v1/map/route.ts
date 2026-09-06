import type { NextRequest } from 'next/server'
import { getMapForDate } from '@/server/queries/map'
import { devContext } from '@/server/dev-session'
import { ok, fail, parseDay } from '@/server/http'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const ctx = await devContext()
    const date = parseDay(req.nextUrl.searchParams.get('date'))
    return ok(await getMapForDate(ctx, date))
  } catch (e) {
    return fail(e)
  }
}
