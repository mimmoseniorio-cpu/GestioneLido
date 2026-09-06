/** F4-04 · La matrice di docs/04 e' vincolante, non indicativa. */
import { describe, it, expect } from 'vitest'
import { P, can, PERMISSIONS } from '../domain/auth/permissions'
import { requirePermission, DEFAULT_SETTINGS, type Ctx } from '../server/context'
import { DomainError } from '../domain/errors'

const staff = (actor: 'ADMIN' | 'OPERATOR'): Ctx => ({
  kind: 'STAFF', beachClubId: 'club', userId: 'u', actor,
  timezone: 'Europe/Rome', settings: DEFAULT_SETTINGS,
})
const cliente: Ctx = {
  kind: 'CUSTOMER', beachClubId: 'club', seasonalContractId: 'ct',
  actor: 'SEASONAL_CUSTOMER', timezone: 'Europe/Rome', settings: DEFAULT_SETTINGS,
}

describe('matrice ruoli', () => {
  it("l'operatore gestisce l'operativita' quotidiana", () => {
    for (const p of [P.RESERVATION_CREATE, P.RESERVATION_CANCEL, P.PAYMENT_CREATE,
                     P.ABSENCE_DECLARE, P.CUSTOMER_WRITE, P.MAP_VIEW]) {
      expect(can('OPERATOR', p)).toBe(true)
    }
  })

  it("l'operatore non tocca la configurazione", () => {
    for (const p of [P.MAP_EDIT, P.SEASON_MANAGE, P.USER_MANAGE, P.PRICE_RULE_MANAGE,
                     P.CONTRACT_MANAGE, P.CUSTOMER_ANONYMIZE, P.CREDIT_ADJUST,
                     P.AUDIT_READ_ALL, P.TOKEN_REVOKE]) {
      expect(can('OPERATOR', p)).toBe(false)
    }
  })

  it("l'admin puo' tutto", () => {
    for (const p of Object.values(P)) expect(can('ADMIN', p)).toBe(true)
  })

  it('il magic link ha una sola scrittura raggiungibile', () => {
    // Il link finisce inoltrato su WhatsApp (C-06): la superficie deve
    // restare minima anche se qualcun altro lo apre.
    expect(PERMISSIONS.SEASONAL_CUSTOMER).toEqual([
      P.CONTRACT_READ_OWN, P.ABSENCE_DECLARE_OWN, P.CREDIT_READ_OWN,
    ])
  })

  it('il cliente stagionale non raggiunge nulla dello staff', () => {
    for (const p of [P.RESERVATION_CREATE, P.PAYMENT_CREATE, P.CUSTOMER_READ,
                     P.MAP_VIEW, P.DASHBOARD_VIEW, P.ABSENCE_DECLARE]) {
      expect(can('SEASONAL_CUSTOMER', p)).toBe(false)
    }
  })
})

describe('requirePermission', () => {
  it('lascia passare chi ha il permesso', () => {
    expect(() => requirePermission(staff('OPERATOR'), P.RESERVATION_CREATE)).not.toThrow()
  })

  it('blocca chi non ce l ha, con errore FORBIDDEN', () => {
    try {
      requirePermission(staff('OPERATOR'), P.SEASON_MANAGE)
      expect.unreachable('doveva sollevare')
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError)
      expect((e as DomainError).code).toBe('FORBIDDEN')
      expect((e as DomainError).httpStatus).toBe(403)
    }
  })

  it('blocca il cliente stagionale sulle azioni staff', () => {
    expect(() => requirePermission(cliente, P.PAYMENT_CREATE)).toThrow(DomainError)
  })
})
