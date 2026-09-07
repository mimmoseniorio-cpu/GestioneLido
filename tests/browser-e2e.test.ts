/**
 * Da dove si prende Chromium.
 *
 * Sembra un dettaglio di infrastruttura, ed è la ragione per cui la suite
 * degli scenari passava qui e sarebbe fallita nella CI: un `executablePath`
 * inventato non dà un errore chiaro, dice solo che l'eseguibile non parte.
 */
import { describe, it, expect } from 'vitest'
// Modulo JavaScript di proposito: gli script e2e girano con node semplice,
// senza passare dal compilatore. I tipi TypeScript li deduce da solo.
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
    // `PW_CHROMIUM` non impostata arriva come undefined, e una stringa vuota
    // è ciò che si ottiene da una variabile dichiarata e lasciata in bianco.
    expect(percorsoBrowser([undefined, ''])).toBeNull()
  })
})
