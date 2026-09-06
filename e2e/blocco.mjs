/**
 * F6-32 · Blocco schermo con PIN.
 *
 * La verifica che conta non è che compaia il tastierino: è che il server
 * rifiuti. Un blocco disegnato nella pagina si toglie con due tocchi negli
 * strumenti di sviluppo, e su quel tablet c'è l'anagrafica dei clienti.
 *
 * Uso:  npm start  →  node e2e/blocco.mjs
 */
import { chromium } from 'playwright'
import { accedi } from './login.mjs'

const URL = process.env.E2E_URL ?? 'http://localhost:3000'
const PIN = '2604'
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium' })
const p = await b.newPage({ viewport: { width: 412, height: 915 } })

const esiti = []
const verifica = (nome, cond) => { esiti.push([nome, cond]); if (!cond) process.exitCode = 1 }

await accedi(p, URL)
await p.goto(`${URL}/map`, { waitUntil: 'networkidle' })

// ── blocco a mano ─────────────────────────────────────────────────────────
await p.getByRole('button', { name: 'Blocca' }).click()
await p.waitForURL(`${URL}/blocco`, { timeout: 10_000 })
verifica('il pulsante Blocca porta al tastierino', p.url().endsWith('/blocco'))
verifica('il tastierino ha le dieci cifre più cancella e conferma',
  (await p.locator('.tastierino button').count()) === 12)

// ── il server rifiuta davvero ─────────────────────────────────────────────
const api = await p.request.get(`${URL}/api/v1/map`)
verifica(`l’API risponde 423, non 200 (${api.status()})`, api.status() === 423)
const corpo = await api.json().catch(() => ({}))
verifica('e dice che è bloccato, non che la sessione è scaduta',
  corpo.error === 'SESSION_LOCKED')

// Le pagine non si disegnano nemmeno: chi arriva da un link torna al PIN.
await p.goto(`${URL}/seasonal`, { waitUntil: 'networkidle' })
verifica('anche entrando da un altro indirizzo si finisce al PIN',
  p.url().endsWith('/blocco'))

// ── PIN sbagliato ─────────────────────────────────────────────────────────
for (const c of '9999') await p.locator('.tastierino button', { hasText: c }).first().click()
await p.waitForSelector('.err', { timeout: 10_000 })
verifica('il PIN sbagliato dice quanti tentativi restano',
  /tentativ/i.test(await p.locator('.err').innerText()))
verifica('e non fa passare', p.url().endsWith('/blocco'))

// ── PIN giusto ────────────────────────────────────────────────────────────
for (const c of PIN) await p.locator('.tastierino button', { hasText: c }).first().click()
await p.waitForURL(`${URL}/map`, { timeout: 15_000 })
verifica('il PIN giusto riapre la mappa', p.url().endsWith('/map'))
verifica('ed è la stessa sessione: non è passato dal login',
  (await p.locator('.tile.forte b').count()) === 1)

const dopo = await p.request.get(`${URL}/api/v1/map`)
verifica(`e l’API torna a rispondere (${dopo.status()})`, dopo.status() === 200)

for (const [nome, ok] of esiti) console.log(`${ok ? '✓' : '✗'} ${nome}`)
await b.close()
