/**
 * Da dove si prende Chromium.
 *
 * Sembra un dettaglio di infrastruttura, ed è la ragione per cui la suite
 * degli scenari passava qui e sarebbe fallita nella CI: un `executablePath`
 * inventato non dà un errore chiaro, dice solo che l'eseguibile non parte.
 */
import { describe, it, expect } from 'vitest'
// @ts-expect-error — modulo JavaScript senza tipi, di proposito: gli script
// e2e girano con node semplice, senza passare dal compilatore.
import { percorsoBrowser } from '../e2e/browser.mjs'

describe('percorsoBrowser', () => {
  it('sceglie il primo percorso che esiste davvero', () => {
    expect(percorsoBrowser(['/non/esiste', '/opt/pw-browsers/chromium']))
      .toBe('/opt/pw-browsers/chromium')
  })

  it('se nessuno esiste torna null: decide Playwright, come nella CI', () => {
    expect(percorsoBrowser(['/non/esiste', '/nemmeno/questo'])).toBeNull()
  })

  it('i valori vuoti non contano come candidati', () => {
    expect(percorsoBrowser([undefined, '', null])).toBeNull()
  })
})
