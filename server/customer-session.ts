/**
 * Contesto del cliente stagionale, ricavato dal magic link.
 *
 * Un token scaduto, revocato o di una stagione chiusa non deve dare un errore
 * tecnico: il cliente vede una pagina che spiega e dà il telefono dello
 * stabilimento (C-64).
 */
import { prisma } from '@/server/repositories/scoped'
import { readSettings, type CustomerContext } from '@/server/context'
import { hashToken } from '@/server/auth/magic-link'

export type EsitoLink =
  | { ok: true; ctx: CustomerContext; contratto: any; club: any }
  | { ok: false; motivo: 'NON_VALIDO' | 'REVOCATO' | 'STAGIONE_CHIUSA' }

export async function contestoDaToken(token: string): Promise<EsitoLink> {
  if (!token || token.length < 20) return { ok: false, motivo: 'NON_VALIDO' }

  const contratto = await prisma.seasonalContract.findFirst({
    where: { accessTokenHash: hashToken(token) },
    // `beachClub` non è una relazione di SeasonalContract: il tenant viaggia
    // dentro le chiavi composte di D-14, quindi lo stabilimento si carica a parte.
    include: { customer: true, umbrella: true, season: true },
  })
  if (!contratto) return { ok: false, motivo: 'NON_VALIDO' }
  if (contratto.tokenRevokedAt) return { ok: false, motivo: 'REVOCATO' }
  if (contratto.status !== 'ACTIVE') return { ok: false, motivo: 'REVOCATO' }
  if (contratto.season.status === 'CLOSED') return { ok: false, motivo: 'STAGIONE_CHIUSA' }

  const club = await prisma.beachClub.findUnique({ where: { id: contratto.beachClubId } })
  if (!club) return { ok: false, motivo: 'NON_VALIDO' }
  return {
    ok: true,
    contratto,
    club,
    ctx: {
      kind: 'CUSTOMER',
      beachClubId: club.id,
      seasonalContractId: contratto.id,
      actor: 'SEASONAL_CUSTOMER',
      timezone: club.timezone,
      settings: readSettings(club.settings),
    },
  }
}
