import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { declareAbsence } from '@/server/use-cases/absences'
import { contestoDaToken } from '@/server/customer-session'
import { ok, fail, parseDay } from '@/server/http'
import { DomainError } from '@/domain/errors'

export const dynamic = 'force-dynamic'

const Body = z.object({ from: z.string(), to: z.string() })

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const esito = await contestoDaToken(token)
    if (!esito.ok) throw new DomainError('NOT_FOUND', 'Link non valido o scaduto.')

    const body = Body.parse(await req.json())
    // Il contratto viene dalla sessione, mai dal client: il cliente può
    // dichiarare solo la PROPRIA assenza (docs/04 §3).
    return ok(await declareAbsence(esito.ctx, {
      from: parseDay(body.from), to: parseDay(body.to),
    }), 201)
  } catch (e) {
    return fail(e)
  }
}
