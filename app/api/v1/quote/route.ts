import type { NextRequest } from 'next/server'
import { scoped } from '@/server/repositories/scoped'
import { devContext } from '@/server/dev-session'
import { calcolaPrezzo, type RegolaPrezzo } from '@/domain/pricing/engine'
import { ok, fail, parseDay } from '@/server/http'
import { DomainError } from '@/domain/errors'

export const dynamic = 'force-dynamic'

/**
 * Preventivo immediato: l'operatore deve poter dire il prezzo al telefono
 * mentre compila, e il numero dev'essere lo stesso che uscirà alla conferma.
 * Per questo lo calcola il server con lo stesso motore, non il client a occhio.
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await devContext()
    const q = req.nextUrl.searchParams
    const db = scoped(ctx)

    const umbrellaId = q.get('umbrellaId')
    if (!umbrellaId) throw new DomainError('NOT_FOUND', 'Ombrellone non indicato.')
    const u = await db.umbrella.byIdOrFail(umbrellaId)

    const stagione = await db.season.findFirst({ where: { status: 'ACTIVE' } })
    if (!stagione) throw new DomainError('NOT_FOUND', 'Nessuna stagione attiva.')

    const regole = await db.priceRule.findMany({
      where: { seasonId: stagione.id, active: true } })

    const preventivo = calcolaPrezzo({
      ombrellone: { id: u.id, visibleNumber: u.visibleNumber, zoneId: u.zoneId,
                    rowLabel: u.rowLabel, category: u.category,
                    basePriceCents: u.basePriceCents },
      dal: parseDay(q.get('from')),
      al: parseDay(q.get('to') ?? q.get('from')),
      regole: regole as unknown as RegolaPrezzo[],
    })
    return ok(preventivo)
  } catch (e) {
    return fail(e)
  }
}
