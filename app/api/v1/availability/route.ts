import type { NextRequest } from 'next/server'
import { cercaPosti } from '@/server/queries/availability'
import { devContext } from '@/server/dev-session'
import { ok, fail, parseDay } from '@/server/http'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const ctx = await devContext()
    const q = req.nextUrl.searchParams
    const from = parseDay(q.get('from'))
    const to = parseDay(q.get('to') ?? q.get('from'))
    const quantita = Math.min(8, Math.max(1, Number(q.get('qty') ?? 1)))

    return ok(await cercaPosti(ctx, {
      from, to, quantita,
      preferenze: {
        filaPreferita: q.get('row'),
        zonaPreferita: q.get('zone'),
        prezzoMassimoCents: q.get('maxPrice') ? Number(q.get('maxPrice')) : null,
        vicinoAlMare: q.get('sea') === '1',
      },
    }))
  } catch (e) {
    return fail(e)
  }
}
