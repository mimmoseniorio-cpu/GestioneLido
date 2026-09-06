import type { NextRequest } from 'next/server'
import { cancelReservation } from '@/server/use-cases/reservations'
import { richiediStaffApi } from '@/server/current-user'
import { ok, fail } from '@/server/http'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await cancelReservation(await richiediStaffApi(), { reservationId: id })
    return ok({ ok: true })
  } catch (e) {
    return fail(e)
  }
}
