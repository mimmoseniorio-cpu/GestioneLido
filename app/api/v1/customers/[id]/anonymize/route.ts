import type { NextRequest } from 'next/server'
import { anonimizzaCliente } from '@/server/use-cases/gdpr'
import { devContext } from '@/server/dev-session'
import { ok, fail } from '@/server/http'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    return ok(await anonimizzaCliente(await devContext(), { customerId: id }))
  } catch (e) {
    return fail(e)
  }
}
