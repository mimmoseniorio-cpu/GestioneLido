/**
 * Permessi (F4-04) — docs/04.
 *
 * Costanti tipizzate, non stringhe sparse: un permesso scritto male deve
 * essere un errore di compilazione, non un controllo che passa sempre.
 */
export const P = {
  CLUB_MANAGE:        'club:manage',
  SEASON_MANAGE:      'season:manage',
  USER_MANAGE:        'user:manage',
  MAP_EDIT:           'map:edit',
  MAP_VIEW:           'map:view',
  UMBRELLA_BLOCK:     'umbrella:block',
  CUSTOMER_READ:      'customer:read',
  CUSTOMER_WRITE:     'customer:write',
  CUSTOMER_ANONYMIZE: 'customer:anonymize',
  CUSTOMER_EXPORT:    'customer:export',
  CUSTOMER_MERGE:     'customer:merge',
  RESERVATION_CREATE: 'reservation:create',
  RESERVATION_UPDATE: 'reservation:update',
  RESERVATION_CANCEL: 'reservation:cancel',
  PRICE_OVERRIDE:     'price:override',
  PRICE_RULE_MANAGE:  'price_rule:manage',
  CONTRACT_MANAGE:    'contract:manage',
  TOKEN_REGENERATE:   'token:regenerate',
  TOKEN_REVOKE:       'token:revoke',
  ABSENCE_DECLARE:    'absence:declare',
  ABSENCE_CANCEL:     'absence:cancel',
  ABSENCE_DECLARE_OWN:'absence:declare_own',
  CREDIT_READ:        'credit:read',
  CREDIT_READ_OWN:    'credit:read_own',
  CREDIT_USE:         'credit:use',
  CREDIT_ADJUST:      'credit:adjust',
  PAYMENT_CREATE:     'payment:create',
  PAYMENT_REFUND:     'payment:refund',
  DASHBOARD_VIEW:     'dashboard:view',
  AUDIT_READ_ALL:     'audit:read_all',
  AUDIT_READ_ENTITY:  'audit:read_entity',
  CONTRACT_READ_OWN:  'contract:read_own',
} as const

export type Permission = (typeof P)[keyof typeof P]

export type Actor = 'ADMIN' | 'OPERATOR' | 'SEASONAL_CUSTOMER'

const OPERATOR: Permission[] = [
  P.MAP_VIEW, P.UMBRELLA_BLOCK,
  P.CUSTOMER_READ, P.CUSTOMER_WRITE,
  P.RESERVATION_CREATE, P.RESERVATION_UPDATE, P.RESERVATION_CANCEL,
  P.PRICE_OVERRIDE,
  P.ABSENCE_DECLARE, P.ABSENCE_CANCEL,
  P.CREDIT_READ, P.CREDIT_USE,
  P.PAYMENT_CREATE, P.PAYMENT_REFUND,
  P.TOKEN_REGENERATE,
  P.DASHBOARD_VIEW, P.AUDIT_READ_ENTITY,
]

/**
 * Il cliente stagionale ha una sola scrittura raggiungibile: la propria
 * assenza. Il magic link finisce inoltrato su WhatsApp (C-06), quindi la
 * superficie e' deliberatamente minima.
 */
const SEASONAL_CUSTOMER: Permission[] = [
  P.CONTRACT_READ_OWN, P.ABSENCE_DECLARE_OWN, P.CREDIT_READ_OWN,
]

export const PERMISSIONS: Record<Actor, readonly Permission[]> = {
  ADMIN: Object.values(P),
  OPERATOR,
  SEASONAL_CUSTOMER,
}

export const can = (actor: Actor, permission: Permission) =>
  PERMISSIONS[actor].includes(permission)
