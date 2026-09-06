/**
 * Errori di dominio tipizzati (F4-06).
 *
 * L'operatore deve leggere una frase comprensibile mentre ha un cliente
 * davanti, non un codice di errore del database. La violazione del vincolo
 * PostgreSQL viene tradotta qui, non lasciata risalire come 500.
 */
export type DomainErrorCode =
  | 'UMBRELLA_NOT_AVAILABLE'
  | 'UMBRELLA_BLOCKED'
  | 'ABSENCE_OVERLAP'
  | 'ABSENCE_FULLY_SOLD'
  | 'ABSENCE_IN_THE_PAST'
  | 'ABSENCE_OUTSIDE_CONTRACT'
  | 'NO_ACTIVE_ABSENCE'
  | 'CONTRACT_OVERLAP'
  | 'CONTRACT_NOT_FOUND'
  | 'INVALID_RANGE'
  | 'DUPLICATE_PHONE'
  | 'PRICE_RULE_MISSING'
  | 'DISCOUNT_ABOVE_LIMIT'
  | 'REFUND_ABOVE_LIMIT'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  /** sessione assente o scaduta: il client deve poter distinguere «rientra»
   *  da «non ti è permesso», altrimenti non sa se riproporre il login */
  | 'UNAUTHENTICATED'
  | 'IDEMPOTENCY_MISMATCH'
  /** sessione viva ma schermo bloccato: si riapre con il PIN, non col login */
  | 'SESSION_LOCKED'

const HTTP_STATUS: Record<DomainErrorCode, number> = {
  UMBRELLA_NOT_AVAILABLE: 409,
  UMBRELLA_BLOCKED: 409,
  ABSENCE_OVERLAP: 409,
  ABSENCE_FULLY_SOLD: 409,
  ABSENCE_IN_THE_PAST: 422,
  ABSENCE_OUTSIDE_CONTRACT: 422,
  NO_ACTIVE_ABSENCE: 409,
  CONTRACT_OVERLAP: 409,
  CONTRACT_NOT_FOUND: 404,
  INVALID_RANGE: 422,
  DUPLICATE_PHONE: 409,
  PRICE_RULE_MISSING: 422,
  DISCOUNT_ABOVE_LIMIT: 403,
  REFUND_ABOVE_LIMIT: 403,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  UNAUTHENTICATED: 401,
  IDEMPOTENCY_MISMATCH: 422,
  SESSION_LOCKED: 423,
}

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'DomainError'
  }
  get httpStatus() { return HTTP_STATUS[this.code] }
  toJSON() { return { error: this.code, message: this.message, details: this.details } }
}

/** Codici PostgreSQL che dobbiamo saper riconoscere. */
const PG_EXCLUSION_VIOLATION = '23P01'
const PG_UNIQUE_VIOLATION = '23505'

const pgCode = (e: unknown): string | undefined => {
  const meta = (e as { meta?: { code?: string }; code?: string } | null)
  if (meta?.meta?.code) return meta.meta.code
  const m = /\b(23P01|23505|23503)\b/.exec(String(e))
  return m?.[1]
}

export const isExclusionViolation = (e: unknown) =>
  pgCode(e) === PG_EXCLUSION_VIOLATION || String(e).includes('exclusion constraint')

export const isUniqueViolation = (e: unknown) =>
  pgCode(e) === PG_UNIQUE_VIOLATION || String(e).includes('P2002')

/**
 * Traduce la violazione del vincolo nel messaggio che l'operatore leggera'.
 * Il nome del vincolo dice quale garanzia è scattata: senza questa mappa,
 * un conflitto legittimo arriverebbe all'utente come errore di sistema.
 */
export function translateConstraintError(e: unknown): DomainError | null {
  if (!isExclusionViolation(e)) return null
  const s = String(e)
  if (s.includes('reservation_item_no_overlap'))
    return new DomainError('UMBRELLA_NOT_AVAILABLE',
      "L'ombrellone è già prenotato in parte del periodo richiesto.")
  if (s.includes('seasonal_absence_no_overlap'))
    return new DomainError('ABSENCE_OVERLAP',
      "Hai già comunicato un'assenza che copre queste date.")
  if (s.includes('seasonal_contract_no_overlap'))
    return new DomainError('CONTRACT_OVERLAP',
      "L'ombrellone ha già un contratto stagionale attivo in quel periodo.")
  return new DomainError('UMBRELLA_NOT_AVAILABLE', 'Il posto non è più disponibile.')
}

/** Da avvolgere attorno a ogni scrittura che tocca la disponibilità. */
export async function withDomainErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    const translated = translateConstraintError(e)
    if (translated) throw translated
    throw e
  }
}
