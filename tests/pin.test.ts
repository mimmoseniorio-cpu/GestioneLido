/** F6-32 · Le regole del PIN, senza database. */
import { describe, it, expect } from 'vitest'
import { validaPin, daBloccare, TENTATIVI_MASSIMI } from '@/domain/auth/pin'

const ok = (s: string) => validaPin(s).ok

describe('validaPin', () => {
  it('accetta un PIN normale', () => {
    expect(validaPin('4071')).toEqual({ ok: true, pin: '4071' })
  })

  it('accetta fino a otto cifre', () => {
    expect(ok('40718392')).toBe(true)
    expect(ok('407183921')).toBe(false)
  })

  it('rifiuta ciò che non è una cifra', () => {
    expect(ok('40a1')).toBe(false)
    expect(ok('')).toBe(false)
    expect(ok('lido')).toBe(false)
  })

  it('rifiuta il PIN troppo corto', () => {
    expect(ok('407')).toBe(false)
  })

  it('rifiuta tutte cifre uguali e le scalette, in tutti e due i versi', () => {
    expect(ok('1111')).toBe(false)
    expect(ok('1234')).toBe(false)
    expect(ok('4321')).toBe(false)
    expect(ok('9876543')).toBe(false)
    // Ma una scaletta interrotta va bene: non è più il primo tentativo ovvio.
    expect(ok('1235')).toBe(true)
  })

  it('spiega perché, invece di dire solo «non valido»', () => {
    const e = validaPin('1111')
    expect(e.ok).toBe(false)
    if (!e.ok) expect(e.motivo).toMatch(/uguali/)
  })

  it('gli spazi intorno non contano', () => {
    expect(validaPin('  4071 ')).toEqual({ ok: true, pin: '4071' })
  })
})

describe('daBloccare', () => {
  // Orologio fermo: con `new Date()` chiamato due volte il caso «esattamente
  // al minuto» perde i millisecondi che passano fra una riga e l'altra, e il
  // test fallirebbe per il motivo sbagliato.
  const ora = new Date('2026-08-12T10:00:00Z')
  const t = (min: number) => new Date(ora.getTime() - min * 60_000)

  it('si blocca dopo i minuti di inattività', () => {
    expect(daBloccare(t(11), ora, 10, true)).toBe(true)
    expect(daBloccare(t(9), ora, 10, true)).toBe(false)
  })

  it('esattamente al minuto stabilito si blocca', () => {
    expect(daBloccare(t(10), ora, 10, true)).toBe(true)
  })

  it('senza PIN non si blocca mai: chiuderebbe fuori l’operatore', () => {
    expect(daBloccare(t(600), ora, 10, false)).toBe(false)
  })

  it('a zero minuti resta solo il blocco a mano', () => {
    expect(daBloccare(t(600), ora, 0, true)).toBe(false)
  })
})

describe('tentativi', () => {
  it('il limite è basso: quattro cifre non reggono un attacco', () => {
    expect(TENTATIVI_MASSIMI).toBeLessThanOrEqual(5)
  })
})
