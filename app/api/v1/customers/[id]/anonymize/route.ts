import type { NextRequest } from 'next/server'
import { anonimizzaCliente } from '@/server/use-cases/gdpr'
import { richiediStaffApi } from '@/server/current-user'
import { ok, fail } from '@/server/http'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    return ok(await anonimizzaCliente(await richiediStaffApi(), { customerId: id }))
  } catch (e) {
    return fail(e)
  }
}
