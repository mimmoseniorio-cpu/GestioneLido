import type { NextRequest } from 'next/server'
import { scoped } from '@/server/repositories/scoped'
import { richiediStaffApi } from '@/server/current-user'
import { requirePermission } from '@/server/context'
import { P } from '@/domain/auth/permissions'
import { generaToken, urlPersonale } from '@/server/auth/magic-link'
import { messaggioLinkStagionale, linkWhatsApp } from '@/domain/messaging/whatsapp'
import { prisma } from '@/server/repositories/scoped'
import { ok, fail, baseUrl } from '@/server/http'

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
    const ctx = await richiediStaffApi()
    requirePermission(ctx, P.TOKEN_REGENERATE)

    const db = scoped(ctx)
    const contratto = await db.seasonalContract.byIdOrFail(id)
    const cliente = await db.customer.byIdOrFail(contratto.customerId)
    const ombrellone = await db.umbrella.byIdOrFail(contratto.umbrellaId)
    const club = await prisma.beachClub.findUniqueOrThrow({ where: { id: ctx.beachClubId } })

    const { token, hash } = generaToken()
    await db.seasonalContract.updateById(id, { accessTokenHash: hash, tokenRevokedAt: null })

    const base = baseUrl(req)
    const link = urlPersonale(base, token)
    const testo = messaggioLinkStagionale(
      cliente.firstName, ombrellone.visibleNumber, link, club.name)

    return ok({
      link,
      whatsapp: cliente.phoneNormalized
        ? linkWhatsApp(cliente.phoneNormalized, testo)
        : null,
      testo,
    }, 201)
  } catch (e) {
    return fail(e)
  }
}
