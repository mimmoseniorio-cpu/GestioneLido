/**
 * Contesto di richiesta (F4-02).
 *
 * Il tenant NON arriva mai dal client: si deriva dalla sessione. Un
 * beachClubId nel corpo di una richiesta viene ignorato (docs/04 §3.2).
 */
import { DomainError } from '@/domain/errors'
import { can, type Actor, type Permission } from '@/domain/auth/permissions'

export type StaffContext = {
  kind: 'STAFF'
  beachClubId: string
  userId: string
  actor: Extract<Actor, 'ADMIN' | 'OPERATOR'>
  timezone: string
  settings: ClubSettings
}

export type CustomerContext = {
  kind: 'CUSTOMER'
  beachClubId: string
  seasonalContractId: string
  actor: 'SEASONAL_CUSTOMER'
  timezone: string
  settings: ClubSettings
}

export type Ctx = StaffContext | CustomerContext

/** Policy per stabilimento. Lette con default: un settings incompleto non
 *  deve poter cambiare silenziosamente il comportamento economico. */
export type ClubSettings = {
  absenceCutoffHour: number
  absenceCutoffDaysBefore: number
  creditPercent: number
  creditCapCentsPerSeason: number
  absenceConflictPolicy: 'IRREVOCABLE' | 'SEASONAL_PRIORITY' | 'MANUAL'
  rowChangePenalty: number
  corridorPenalty: number
  operatorDiscountPercent: number
  operatorMaxRefundCents: number
}

export const DEFAULT_SETTINGS: ClubSettings = {
  absenceCutoffHour: 20,
  absenceCutoffDaysBefore: 1,
  creditPercent: 30,
  creditCapCentsPerSeason: 30_000,
  absenceConflictPolicy: 'IRREVOCABLE', // D-01
  rowChangePenalty: 1.5,
  corridorPenalty: 2.0,
  operatorDiscountPercent: 20,
  operatorMaxRefundCents: 5_000,
}

export function readSettings(raw: unknown): ClubSettings {
  const o = (raw ?? {}) as Partial<ClubSettings>
  return { ...DEFAULT_SETTINGS, ...o }
}

/** La UI nasconde, il server nega (docs/04 §3.4). */
export function requirePermission(ctx: Ctx, permission: Permission): void {
  if (!can(ctx.actor, permission)) {
    throw new DomainError('FORBIDDEN', 'Operazione non consentita per il tuo ruolo.',
      { permission, actor: ctx.actor })
  }
}

export const isStaff = (ctx: Ctx): ctx is StaffContext => ctx.kind === 'STAFF'
