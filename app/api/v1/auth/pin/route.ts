import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/server/repositories/scoped'
import { richiediStaffApi } from '@/server/current-user'
import { hashPassword, verifyPassword } from '@/server/auth/password'
import { validaPin } from '@/domain/auth/pin'
import { audit } from '@/server/audit'
import { ok, fail } from '@/server/http'
import { DomainError } from '@/domain/errors'

export const dynamic = 'force-dynamic'

/**
 * Impostare o togliere il PIN del blocco schermo.
 *
 * Serve sempre la password, anche per cambiarlo: senza, chiunque trovi il
 * tablet già sbloccato potrebbe mettersi un PIN suo e chiudere fuori il
 * gestore dal proprio stabilimento.
 */
const Body = z.object({
  password: z.string().min(1),
  pin: z.string().max(20).nullable(),
})

export async function POST(req: NextRequest) {
  try {
    const ctx = await richiediStaffApi()
    const body = Body.parse(await req.json())

    const utente = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } })
    if (!await verifyPassword(utente.passwordHash, body.password))
      throw new DomainError('FORBIDDEN', 'Password non corretta.')

    if (body.pin === null || body.pin.trim() === '') {
      await prisma.user.update({ where: { id: utente.id }, data: { pinHash: null } })
      // Senza PIN non c'è nulla che possa sbloccare una sessione bloccata:
      // vanno riaperte tutte, o l'utente resterebbe chiuso fuori.
      await prisma.session.updateMany({
        where: { userId: utente.id, lockedAt: { not: null } },
        data: { lockedAt: null, pinAttempts: 0 },
      })
      await audit(prisma, ctx, 'user.pin.clear', { type: 'user', id: utente.id }, {})
      return ok({ haPin: false })
    }

    const esito = validaPin(body.pin)
    if (!esito.ok) throw new DomainError('INVALID_RANGE', esito.motivo)

    await prisma.user.update({
      where: { id: utente.id }, data: { pinHash: await hashPassword(esito.pin) },
    })
    // Il PIN non finisce nell'audit: ci finisce il fatto che è cambiato.
    await audit(prisma, ctx, 'user.pin.set', { type: 'user', id: utente.id }, {})
    return ok({ haPin: true })
  } catch (e) {
    return fail(e)
  }
}
