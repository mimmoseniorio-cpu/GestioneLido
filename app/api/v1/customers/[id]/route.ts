import type { NextRequest } from 'next/server'
import { schedaCliente } from '@/server/queries/customers'
import { devContext } from '@/server/dev-session'
import { ok, fail } from '@/server/http'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    return ok(await schedaCliente(await devContext(), id))
  } catch (e) {
    return fail(e)
  }
}
