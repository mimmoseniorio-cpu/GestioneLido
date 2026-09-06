import type { NextRequest } from 'next/server'
import { annullaContratto } from '@/server/use-cases/contracts'
import { richiediStaffApi } from '@/server/current-user'
import { ok, fail } from '@/server/http'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await annullaContratto(await richiediStaffApi(), { id })
    return ok({ ok: true })
  } catch (e) {
    return fail(e)
  }
}
