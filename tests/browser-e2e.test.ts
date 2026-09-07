/**
 * Da dove si prende Chromium.
 *
 * Sembra un dettaglio di infrastruttura, ed è la ragione per cui la suite
 * degli scenari passava qui e sarebbe fallita nella CI: un `executablePath`
 * inventato non dà un errore chiaro, dice solo che l'eseguibile non parte.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Modulo JavaScript di proposito: gli script e2e girano con node semplice,
// senza passare dal compilatore. I tipi TypeScript li deduce da solo.
import { percorsoBrowser } from '../e2e/browser.mjs'

describe('percorsoBrowser', () => {
  // Un file creato apposta, invece di `/opt/pw-browsers/chromium`: quel
  // percorso esiste nel contenitore di sviluppo e non su un runner di GitHub,
  // e la prima versione di questo test passava qui e falliva nella CI —
  // esattamente il difetto che doveva prevenire.
  let cartella = ''
  let esistente = ''
  beforeAll(() => {
    cartella = mkdtempSync(join(tmpdir(), 'browser-'))
    esistente = join(cartella, 'chromium')
    writeFileSync(esistente, '')
  })
  afterAll(() => rmSync(cartella, { recursive: true, force: true }))

  it('sceglie il primo percorso che esiste davvero', () => {
    expect(percorsoBrowser(['/non/esiste', esistente])).toBe(esistente)
  })

  it('salta i percorsi inesistenti anche se vengono prima', () => {
    expect(percorsoBrowser(['/nemmeno/questo', '/non/esiste', esistente])).toBe(esistente)
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
