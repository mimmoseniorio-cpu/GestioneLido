/** D-04 / C-81 · Lo stesso numero digitato in modi diversi è la stessa persona. */
import { describe, it, expect } from 'vitest'
import { normalizzaTelefono, formattaTelefono, coda } from '@/domain/customers/phone'

const e164 = (s: string) => {
  const r = normalizzaTelefono(s)
  return r.ok ? r.e164 : `ERRORE:${r.motivo}`
}

describe('C-81 · formati diversi, stesso cliente', () => {
  it('riconosce le cinque scritture più comuni di un cellulare', () => {
    for (const scritto of ['3481234567', '348 1234567', '348-123-4567',
                           '+39 348 1234567', '0039 348 1234567']) {
      expect(e164(scritto)).toBe('+393481234567')
    }
  })

  it('riconosce anche il numero internazionale senza il +', () => {
    expect(e164('393481234567')).toBe('+393481234567')
  })

  it('gestisce i fissi italiani', () => {
    expect(e164('0544 123456')).toBe('+390544123456')
    expect(e164('+39 0544 123456')).toBe('+390544123456')
  })

  it('lascia in pace i numeri esteri', () => {
    expect(e164('+43 664 1234567')).toBe('+436641234567')
    expect(e164('+386 40 123456')).toBe('+38640123456')
  })

  it('il prefisso predefinito è configurabile per gli stabilimenti di confine', () => {
    const r = normalizzaTelefono('664 1234567', '43')
    expect(r.ok && r.e164).toBe('+436641234567')
  })
})

describe('rifiuti', () => {
  it('rifiuta il vuoto e i numeri troppo corti', () => {
    expect(e164('')).toBe('ERRORE:TROPPO_CORTO')
    expect(e164('123')).toBe('ERRORE:NON_RICONOSCIUTO')
    expect(e164('3481')).toBe('ERRORE:TROPPO_CORTO')
  })

  it('rifiuta ciò che non può essere un numero italiano', () => {
    // I fissi italiani iniziano per 0, i cellulari per 3: accettare il resto
    // trasformerebbe un numero digitato male in un cliente nuovo, che poi
    // duplica quello vero e spezza lo storico.
    expect(e164('12345678')).toBe('ERRORE:NON_RICONOSCIUTO')
    expect(e164('987654321')).toBe('ERRORE:NON_RICONOSCIUTO')
  })

  it('ma con un altro prefisso paese non pretende di conoscere le regole locali', () => {
    const r = normalizzaTelefono('12345678', '43')
    expect(r.ok && r.e164).toBe('+4312345678')
  })

  it('rifiuta oltre il limite E.164', () => {
    expect(e164('+3934812345678901234')).toBe('ERRORE:NON_RICONOSCIUTO')
  })
})

describe('presentazione', () => {
  it('formatta i cellulari italiani in modo leggibile', () => {
    expect(formattaTelefono('+393481234567')).toBe('+39 348 1234567')
  })

  it('lascia inalterato ciò che non riconosce', () => {
    expect(formattaTelefono('+436641234567')).toBe('+436641234567')
  })

  it('la coda è come il gestore cerca davvero', () => {
    expect(coda('+393481234567')).toBe('4567')
    expect(coda('+393481234567', 6)).toBe('234567')
  })
})
