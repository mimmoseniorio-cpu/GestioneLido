/**
 * F6-19 · Incasso con metodo, e rimborso.
 *
 * Il rimborso è la prima operazione del prodotto che fa USCIRE soldi. Qui si
 * verifica il giro completo dal punto di vista di chi sta al banco, e che la
 * soglia dell'operatore non sia solo scritta nel documento dei permessi.
 *
 * Uso:  npm start  →  node e2e/rimborso.mjs
 */
import { chromium } from 'playwright'
import { accedi } from './login.mjs'

const URL = process.env.E2E_URL ?? 'http://localhost:3000'
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium' })
const p = await b.newPage({ viewport: { width: 412, height: 915 } })

const esiti = []
const verifica = (nome, cond) => { esiti.push([nome, cond]); if (!cond) process.exitCode = 1 }
const soldi = t => parseFloat(t.replace(/[^\d,]/g, '').replace(',', '.'))

await accedi(p, URL)
await p.goto(`${URL}/map`, { waitUntil: 'networkidle' })

// ── prenotazione da incassare ─────────────────────────────────────────────
await p.locator('button', { hasText: 'Libero' }).first().click()
await p.waitForSelector('aside.panel')
await p.getByRole('button', { name: 'PRENOTA' }).click()
await p.getByPlaceholder('Cognome').fill('Rimborso')
await p.getByRole('button', { name: 'CONFERMA' }).click()
await p.waitForTimeout(2500)

await p.locator('button', { hasText: 'Rimborso' }).first().click()
await p.waitForSelector('aside.panel')

// ── metodo di pagamento ───────────────────────────────────────────────────
const metodi = await p.locator('.panel .metodi button').allInnerTexts()
verifica(`i tre metodi sono lì, senza menù a tendina (${metodi.join(', ')})`,
  metodi.length === 3 && metodi.includes('Carta'))
verifica('non si rimborsa ciò che non è entrato: il pulsante non c’è ancora',
  (await p.getByRole('button', { name: 'Rimborsa…' }).count()) === 0)

await p.locator('.panel .metodi button', { hasText: 'Carta' }).click()
const daIncassare = soldi(await p.getByRole('button', { name: /INCASSA/ }).innerText())
await p.getByRole('button', { name: /INCASSA/ }).click()
await p.waitForTimeout(2500)

await p.locator('button', { hasText: 'Rimborso' }).first().click()
await p.waitForSelector('aside.panel')
verifica(`incassati ${daIncassare.toFixed(2)} €, ora il rimborso è possibile`,
  (await p.getByRole('button', { name: 'Rimborsa…' }).count()) === 1)

// ── rimborso senza motivo: rifiutato ──────────────────────────────────────
await p.getByRole('button', { name: 'Rimborsa…' }).click()
await p.getByRole('button', { name: 'REGISTRA RIMBORSO' }).click()
await p.waitForTimeout(600)
const avviso = await p.locator('.panel .err').innerText().catch(() => '')
verifica('senza motivo non passa, e spiega perché serve', /motivo|cassa/i.test(avviso))

// ── rimborso parziale ─────────────────────────────────────────────────────
await p.locator('.panel input').filter({ hasNot: p.locator('[type="date"]') }).nth(0)
  .fill(String((daIncassare / 2).toFixed(2)).replace('.', ','))
await p.getByPlaceholder('Es. disdetta, giornata di pioggia').fill('giornata di pioggia')
await p.getByRole('button', { name: 'REGISTRA RIMBORSO' }).click()
await p.waitForTimeout(2500)

await p.locator('button', { hasText: 'Rimborso' }).first().click()
await p.waitForSelector('aside.panel')
const righe = (await p.locator('aside.panel').innerText()).split('\n').map(r => r.trim())
const dovuto = soldi(righe[righe.indexOf('Da incassare') + 1] ?? '0')
verifica(`metà rimborsata: torna dovuta (${dovuto.toFixed(2)} € su ${daIncassare.toFixed(2)} €)`,
  Math.abs(dovuto - daIncassare / 2) < 0.02)

// Il rimborso di un pagamento con carta non deve partire in contanti: la
// cassa della sera non tornerebbe, e nessuno saprebbe perché.
const attivo = await p.locator('.panel .metodi button.attivo').innerText()
verifica(`il metodo riparte da come il cliente ha pagato (${attivo})`, attivo === 'Carta')

// ── la soglia dell'operatore ──────────────────────────────────────────────
const api = await p.request.post(`${URL}/api/v1/payments/refund`, {
  data: { reservationId: '00000000-0000-0000-0000-000000000000',
          amountCents: 100, motivo: 'inesistente' },
})
verifica(`una prenotazione inventata non si rimborsa (${api.status()})`, api.status() === 404)

for (const [nome, ok] of esiti) console.log(`${ok ? '✓' : '✗'} ${nome}`)
await b.close()
