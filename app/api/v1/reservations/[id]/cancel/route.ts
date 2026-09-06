import type { NextRequest } from 'next/server'
import { cancelReservation } from '@/server/use-cases/reservations'
import { devContext } from '@/server/dev-session'
import { ok, fail } from '@/server/http'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await cancelReservation(await devContext(), { reservationId: id })
    return ok({ ok: true })
  } catch (e) {
    return fail(e)
  }
}
