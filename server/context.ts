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
  /** F6-32 · minuti di inattività dopo i quali il tablet si blocca da solo */
  screenLockMinutes: number
}

export const DEFAULT_SETTINGS: ClubSettings = {
  // D-12 (rivista) · le 10:00 del giorno stesso, non le 20:00 di quello prima.
  absenceCutoffHour: 10,
  absenceCutoffDaysBefore: 0,
  creditPercent: 30,
  creditCapCentsPerSeason: 30_000,
  absenceConflictPolicy: 'IRREVOCABLE', // D-01
  rowChangePenalty: 1.5,
  corridorPenalty: 2.0,
  operatorDiscountPercent: 20,
  operatorMaxRefundCents: 5_000,
  screenLockMinutes: 10,
}

export function readSettings(raw: unknown): ClubSettings {
  const o = (raw ?? {}) as Partial<ClubSettings>
  return { ...DEFAULT_SETTINGS, ...o }
}

/**
 * La UI nasconde, il server nega (docs/04 §3.4).
 *
 * Accetta più permessi in alternativa: alcune operazioni sono raggiungibili sia
 * dallo staff sia dal cliente, ma con permessi diversi — lo staff può
 * dichiarare l'assenza di chiunque, il cliente solo la propria. Il vincolo
 * "solo la propria" lo applica il caso d'uso, che conosce il contesto.
 */
export function requirePermission(ctx: Ctx, permission: Permission | Permission[]): void {
  const ammessi = Array.isArray(permission) ? permission : [permission]
  if (!ammessi.some(p => can(ctx.actor, p))) {
    throw new DomainError('FORBIDDEN', 'Operazione non consentita per il tuo ruolo.',
      { permission: ammessi, actor: ctx.actor })
  }
}

export const isStaff = (ctx: Ctx): ctx is StaffContext => ctx.kind === 'STAFF'
