/**
 * F6-27 · Spostare e rinumerare dall'editor.
 *
 * Il gestore ridisegna la propria spiaggia: la verifica che conta è che dopo
 * uno spostamento la mappa operativa mostri l'ombrellone al posto nuovo, e
 * che chi ci aveva prenotato non sia sparito.
 *
 * Uso:  npm start  →  node e2e/disposizione.mjs
 */
import { chromium } from 'playwright'
import { accedi } from './login.mjs'

const URL = process.env.E2E_URL ?? 'http://localhost:3000'
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium' })
const p = await b.newPage({ viewport: { width: 1180, height: 900 } })

const esiti = []
const verifica = (nome, cond) => { esiti.push([nome, cond]); if (!cond) process.exitCode = 1 }

await accedi(p, URL)
await p.goto(`${URL}/settings/map`, { waitUntil: 'networkidle' })

const quanti = await p.locator('svg.disposizione g.omb').count()
verifica(`la disposizione disegna i 96 ombrelloni (${quanti})`, quanti === 96)
verifica('le caselle libere non sono bersagli finché non c’è nulla da posare',
  (await p.locator('svg.disposizione .vuota.attiva').count()) === 0)

// ── seleziona ─────────────────────────────────────────────────────────────
const primo = p.locator('svg.disposizione g.omb').first()
const numero = (await primo.locator('text').textContent()).trim()
await primo.click()
verifica(`selezionato l’ombrellone ${numero}`,
  (await p.locator('svg.disposizione g.omb.scelto').count()) === 1)
verifica('e ora le caselle libere sono bersagli',
  (await p.locator('svg.disposizione .vuota.attiva').count()) > 0)

// ── sposta ────────────────────────────────────────────────────────────────
const casella = p.locator('svg.disposizione .vuota.attiva').last()
const dove = { x: await casella.getAttribute('x'), y: await casella.getAttribute('y') }
await casella.click()
await p.waitForTimeout(1800)

const spostato = p.locator('svg.disposizione g.omb').filter({
  has: p.locator(`text:text-is("${numero}")`) }).locator('rect')
verifica(`l’ombrellone ${numero} è nella casella toccata`,
  (await spostato.getAttribute('x')) === dove.x && (await spostato.getAttribute('y')) === dove.y)

// ── casella occupata ──────────────────────────────────────────────────────
const g = p.locator('svg.disposizione g.omb')
await g.nth(1).click()
const bersaglio = (await g.nth(2).locator('text').textContent()).trim()
await g.nth(2).click()          // toccare un altro ombrellone lo SELEZIONA
verifica('toccare un altro ombrellone cambia la selezione, non lo sovrascrive',
  (await p.locator('svg.disposizione g.omb.scelto text').textContent()).trim() === bersaglio)

// ── rinumera ──────────────────────────────────────────────────────────────
const nuovo = `${bersaglio}bis`
await p.locator('.box.form input').first().fill(nuovo)
await p.getByRole('button', { name: 'RINUMERA' }).click()
await p.waitForTimeout(1800)
verifica(`rinumerato in ${nuovo} (D-15: i numeri sono testo, esistono 12bis)`,
  (await p.locator(`svg.disposizione g.omb text:text-is("${nuovo}")`).count()) === 1)

// ── e la mappa operativa lo segue ─────────────────────────────────────────
await p.goto(`${URL}/map`, { waitUntil: 'networkidle' })
verifica('la mappa di lavoro mostra il numero nuovo',
  (await p.locator(`g.umb[aria-label^="Ombrellone ${nuovo},"]`).count()) === 1)
verifica('e ci sono ancora tutti e 96',
  (await p.locator('g.umb').count()) === 96)

for (const [nome, ok] of esiti) console.log(`${ok ? '✓' : '✗'} ${nome}`)
await b.close()
