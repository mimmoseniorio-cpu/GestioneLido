import type { NextRequest } from 'next/server'
import { scoped } from '@/server/repositories/scoped'
import { devContext } from '@/server/dev-session'
import { requirePermission } from '@/server/context'
import { P } from '@/domain/auth/permissions'
import { generaToken, urlPersonale, messaggioWhatsApp } from '@/server/auth/magic-link'
import { prisma } from '@/server/repositories/scoped'
import { ok, fail } from '@/server/http'

export const dynamic = 'force-dynamic'

/**
 * Rigenera il link personale dello stagionale e restituisce il messaggio
 * WhatsApp già pronto. L'operatore può rigenerarlo per un cliente che l'ha
 * perso (docs/04 ▲⁴); revocarlo definitivamente resta all'admin.
 *
 * Rigenerare invalida il link precedente: è la contromisura al link inoltrato
 * a mezzo paese (C-06).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ctx = await devContext()
    requirePermission(ctx, P.TOKEN_REGENERATE)

    const db = scoped(ctx)
    const contratto = await db.seasonalContract.byIdOrFail(id)
    const cliente = await db.customer.byIdOrFail(contratto.customerId)
    const ombrellone = await db.umbrella.byIdOrFail(contratto.umbrellaId)
    const club = await prisma.beachClub.findUniqueOrThrow({ where: { id: ctx.beachClubId } })

    const { token, hash } = generaToken()
    await db.seasonalContract.updateById(id, { accessTokenHash: hash, tokenRevokedAt: null })

    const base = req.nextUrl.origin
    const link = urlPersonale(base, token)
    const testo = messaggioWhatsApp(cliente.firstName, ombrellone.visibleNumber, link, club.name)

    return ok({
      link,
      whatsapp: cliente.phoneNormalized
        ? `https://wa.me/${cliente.phoneNormalized.replace(/\D/g, '')}?text=${encodeURIComponent(testo)}`
        : null,
      testo,
    }, 201)
  } catch (e) {
    return fail(e)
  }
}
