/**
 * Le due correzioni nate dalla registrazione dell'utente sul telefono.
 *
 *  1. Il pannello deve chiudersi appena l'azione è riflessa (F5-10), non dopo
 *     che la rete ha finito: nel video l'operatore ha guardato un pulsante
 *     grigio per otto secondi con il cliente davanti.
 *  2. La data dev'essere leggibile anche se il telefono è in inglese: il
 *     selettore nativo scriveva «09/06/2026» per il 6 settembre.
 */
import { chromium } from 'playwright'
import { accedi } from './login.mjs'

const URL = process.env.E2E_URL ?? 'http://localhost:3000'
// Telefono in inglese: è la condizione in cui la data diventa ambigua.
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium' })
const p = await b.newPage({ viewport: { width: 412, height: 915 }, locale: 'en-US' })

const esiti = []
const verifica = (nome, cond) => { esiti.push([nome, cond]); if (!cond) process.exitCode = 1 }

// Ogni scrittura verso il server viene contata: il punto della modifica è
// che «prenotato e pagato» costi UNA chiamata, non tre.
const scritture = []
p.on('request', r => {
  if (r.method() === 'POST' && r.url().includes('/api/v1/'))
    scritture.push(r.url().replace(/.*\/api\/v1/, ''))
})

await accedi(p, URL)
await p.goto(`${URL}/map`, { waitUntil: 'networkidle' })
// Sotto i 700 px la mappa è un elenco: si prende il primo libero da lì.
await p.locator('button', { hasText: 'Libero' }).first().click()
await p.waitForSelector('aside.panel')
await p.getByRole('button', { name: 'PRENOTA' }).click()

// ── la data a parole ──────────────────────────────────────────────────────
const chiare = await p.locator('.data-chiara').allInnerTexts()
verifica(`le due date sono scritte a parole (${chiare.join(' → ')})`,
  chiare.length === 2 && chiare.every(t => /\b(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)\b/.test(t)))
const nativa = await p.locator('.due-campi input[type="date"]').first().inputValue()
verifica('e il campo resta una data vera per il browser', /^\d{4}-\d{2}-\d{2}$/.test(nativa))

// ── il pannello si chiude subito ──────────────────────────────────────────
// La rete viene rallentata di proposito: è la condizione del video.
await p.route('**/api/v1/reservations', async r => {
  await new Promise(res => setTimeout(res, 4000))
  await r.continue()
})
await p.getByPlaceholder('Cognome').fill('Verifica')
const t0 = Date.now()
await p.getByRole('button', { name: 'CONFERMA' }).click()
await p.waitForSelector('aside.panel', { state: 'detached', timeout: 3000 }).catch(() => {})
const chiuso = Date.now() - t0
verifica(`il pannello si chiude in ${chiuso} ms, senza aspettare la rete`, chiuso < 1500)
verifica('il posto risulta già occupato sulla mappa',
  (await p.locator('button', { hasText: 'Verifica' }).count()) > 0)

// ── una chiamata sola ─────────────────────────────────────────────────────
await p.waitForTimeout(5500)
const dellaPrenotazione = scritture.filter(u => !u.includes('/auth/'))
verifica(`la prenotazione costa una sola chiamata (${dellaPrenotazione.join(', ') || 'nessuna'})`,
  dellaPrenotazione.length === 1 && dellaPrenotazione[0].startsWith('/reservations'))

// ── e se la scrittura fallisce, si vede ───────────────────────────────────
await p.unroute('**/api/v1/reservations')
await p.route('**/api/v1/reservations', r =>
  r.fulfill({ status: 409, contentType: 'application/json',
              body: JSON.stringify({ error: 'UMBRELLA_NOT_AVAILABLE',
                                     message: 'Il posto non è più disponibile.' }) }))
await p.locator('button', { hasText: 'Libero' }).first().click()
await p.waitForSelector('aside.panel')
await p.getByRole('button', { name: 'PRENOTA' }).click()
await p.getByPlaceholder('Cognome').fill('Fallita')
await p.getByRole('button', { name: 'CONFERMA' }).click()
await p.waitForSelector('.err.fascia', { timeout: 15_000 }).catch(() => {})
const fascia = await p.locator('.err.fascia').count()
verifica('a pannello chiuso l’errore compare sopra la mappa, non sparisce',
  fascia === 1 && /non è più disponibile/.test(await p.locator('.err.fascia').innerText()))

for (const [nome, ok] of esiti) console.log(`${ok ? '✓' : '✗'} ${nome}`)
await b.close()
