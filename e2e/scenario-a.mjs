/**
 * Scenario A · "Avete un ombrellone libero oggi?"
 *
 * Criterio di accettazione (docs/07): rispondere costa 0 interazioni — il
 * numero è già sullo schermo — e prenotare un cliente nuovo ne costa al
 * massimo 5. Questo script CONTA le interazioni, non si limita a verificare
 * che il flusso funzioni: un percorso che funziona ma richiede otto tap è un
 * difetto, non un dettaglio.
 *
 * Uso:  npm start   (in un altro terminale)  →  npm run e2e
 * Diventerà un test Playwright vero in F7-01.
 */
import { chromium } from 'playwright'

const URL = process.env.E2E_URL ?? 'http://localhost:3000'
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium' })
const p = await b.newPage({ viewport: { width: 1180, height: 820 } })   // tablet orizzontale

let interazioni = 0
const esiti = []
const verifica = (nome, cond) => { esiti.push([nome, cond]); if (!cond) process.exitCode = 1 }

await p.goto(`${URL}/map`, { waitUntil: 'networkidle' })

// ── 0 interazioni: la risposta è già visibile (scenario F) ────────────────
const liberi = await p.locator('.chip', { hasText: 'liberi' }).innerText()
const vendibili = await p.locator('.chip', { hasText: 'vendibili' }).innerText()
verifica('la mappa dice quanti sono liberi senza toccare nulla', /\d+/.test(liberi))
verifica('la mappa dice cosa si può vendere ora', /\d+/.test(vendibili))
verifica('96 ombrelloni disegnati', (await p.locator('g.umb').count()) === 96)

const prima = parseInt(liberi, 10)

// ── prenotazione ──────────────────────────────────────────────────────────
await p.locator('g.umb[aria-label*="Libero"]').first().click();          interazioni++
await p.waitForSelector('.panel')
await p.getByRole('button', { name: 'PRENOTA' }).click();                interazioni++
await p.getByPlaceholder('Cognome').fill('Bianchi');                     interazioni++
await p.getByRole('button', { name: 'CONFERMA' }).click();               interazioni++
await p.waitForSelector('.panel', { state: 'detached', timeout: 15_000 })
await p.waitForTimeout(500)

const dopo = parseInt(await p.locator('.chip', { hasText: 'liberi' }).innerText(), 10)
verifica('un ombrellone in meno tra i liberi', dopo === prima - 1)
verifica(`prenotazione in ≤ 5 interazioni (usate ${interazioni})`, interazioni <= 5)

for (const [nome, ok] of esiti) console.log(`${ok ? '✓' : '✗'} ${nome}`)
console.log(`\ninterazioni: ${interazioni}`)
await b.close()
