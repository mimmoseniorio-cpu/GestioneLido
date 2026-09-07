/**
 * Aprire il browser, ovunque si stia girando.
 *
 * Nel contenitore di sviluppo Chromium è già in `/opt/pw-browsers`, e usarlo
 * evita di scaricarne un altro a ogni sessione. Su un runner di GitHub quel
 * percorso non esiste e va usato quello che Playwright si è installato da sé.
 * Un percorso inventato non dà un errore chiaro: dice solo che l'eseguibile
 * non parte, e si perde mezz'ora a capire perché.
 */
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'

const CANDIDATI = [
  process.env.PW_CHROMIUM,
  '/opt/pw-browsers/chromium',
].filter(Boolean)

/** Il primo percorso che esiste davvero, o `null` per lasciar decidere Playwright. */
export function percorsoBrowser(candidati = CANDIDATI) {
  return candidati.filter(Boolean).find(p => existsSync(p)) ?? null
}

export function apriBrowser(opzioni = {}) {
  const trovato = percorsoBrowser()
  // Senza executablePath Playwright usa il browser che ha scaricato lui.
  return chromium.launch(trovato ? { ...opzioni, executablePath: trovato } : opzioni)
}
