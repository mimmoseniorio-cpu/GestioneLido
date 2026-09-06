/**
 * Audit log (F4-08) — docs/03 §3.14.
 *
 * Serve a ricostruire cosa e' successo quando un cliente contesta. Registra
 * solo i campi cambiati: non duplica dati personali (NF-05) e non gonfia la
 * tabella. Append-only garantito da trigger, non da convenzione.
 */
import type { Ctx } from '@/server/context'
import type { Tx } from '@/server/repositories/scoped'

export type AuditAction =
  | 'reservation.create' | 'reservation.update' | 'reservation.cancel'
  | 'reservation.create.temporary' | 'reservation.move'
  | 'price.override' | 'payment.create' | 'payment.refund'
  | 'absence.declare' | 'absence.cancel.full' | 'absence.cancel.partial'
  | 'credit.earn' | 'credit.reverse' | 'credit.use' | 'credit.adjust'
  | 'contract.create' | 'contract.cancel' | 'token.regenerate' | 'token.revoke'
  | 'umbrella.block' | 'umbrella.renumber' | 'umbrella.move' | 'map.generate'
  | 'customer.anonymize' | 'customer.merge'
  /** F6-32 · il PIN non finisce mai nel registro: ci finisce che è cambiato */
  | 'user.pin.set' | 'user.pin.clear'

/** Solo i campi effettivamente cambiati finiscono nel registro. */
export function diff<T extends Record<string, unknown>>(before: T, after: T) {
  const b: Record<string, unknown> = {}
  const a: Record<string, unknown> = {}
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      b[k] = before[k]; a[k] = after[k]
    }
  }
  return { before: b, after: a }
}

export async function audit(
  tx: Tx,
  ctx: Ctx,
  action: AuditAction,
  entity: { type: string; id: string },
  changes?: { before?: unknown; after?: unknown },
) {
  await tx.auditLog.create({
    data: {
      beachClubId: ctx.beachClubId,
      actorType: ctx.kind === 'STAFF' ? 'USER' : 'CUSTOMER',
      actorId: ctx.kind === 'STAFF' ? ctx.userId : ctx.seasonalContractId,
      action,
      entityType: entity.type,
      entityId: entity.id,
      before: (changes?.before ?? null) as never,
      after: (changes?.after ?? null) as never,
    },
  })
}
