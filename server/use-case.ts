/**
 * Involucro dei casi d'uso (F4-04, F4-06).
 *
 * Ogni caso d'uso dichiara il permesso che richiede e gira in transazione.
 * Il permesso si verifica QUI, non nella rotta: una funzione richiamata da
 * due punti diversi resta protetta (docs/04 §3.3).
 */
import type { Ctx } from '@/server/context'
import { requirePermission } from '@/server/context'
import type { Permission } from '@/domain/auth/permissions'
import { prisma, scoped, type ScopedDb, type Tx } from '@/server/repositories/scoped'
import { withDomainErrors } from '@/domain/errors'

export type UseCaseDeps = { db: ScopedDb; tx: Tx; ctx: Ctx }

export function useCase<I, O>(spec: {
  /** uno o più permessi in alternativa (vedi requirePermission) */
  permission: Permission | Permission[]
  /** false solo per le sole letture che non toccano disponibilita'. */
  transactional?: boolean
  run: (deps: UseCaseDeps, input: I) => Promise<O>
}) {
  return async (ctx: Ctx, input: I): Promise<O> => {
    requirePermission(ctx, spec.permission)

    if (spec.transactional === false) {
      return withDomainErrors(() => spec.run({ db: scoped(ctx), tx: prisma, ctx }, input))
    }
    // Ogni operazione che tocca disponibilita' o prenotazioni e' atomica:
    // niente prenotazione senza credito, niente credito senza prenotazione.
    return withDomainErrors(() =>
      prisma.$transaction(tx => spec.run({ db: scoped(ctx, tx), tx, ctx }, input)),
    )
  }
}
