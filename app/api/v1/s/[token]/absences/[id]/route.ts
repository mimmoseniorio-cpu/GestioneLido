import type { NextRequest } from 'next/server'
import { cancelAbsence } from '@/server/use-cases/absences'
import { contestoDaToken } from '@/server/customer-session'
import { ok, fail } from '@/server/http'
import { DomainError } from '@/domain/errors'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _req: NextRequest, { params }: { params: Promise<{ token: string; id: string }> },
) {
  try {
    const { token, id } = await params
    const esito = await contestoDaToken(token)
    if (!esito.ok) throw new DomainError('NOT_FOUND', 'Link non valido o scaduto.')
    return ok(await cancelAbsence(esito.ctx, { absenceId: id }))
  } catch (e) {
    return fail(e)
  }
}
