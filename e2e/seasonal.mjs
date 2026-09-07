/**
 * F6-05 / F6-11 · Verifica nel browser che il gestore possa davvero usare
 * la funzione che vale il prodotto.
 *
 * Il giro completo: provo a creare un contratto dove ci sono già prenotazioni
 * (e controllo che il rifiuto dica QUALI — C-16), poi ne creo uno buono,
 * apro il link personale come farebbe il cliente, registro l'assenza per chi
 * «telefona» (F6-11) e controllo che l'ombrellone diventi vendibile domani.
 *
 * Uso:  npm start   (in un altro terminale)  →  node e2e/seasonal.mjs
 */
import { apriBrowser } from './browser.mjs'
import { accedi } from './login.mjs'

const URL = process.env.E2E_URL ?? 'http://localhost:3000'
const b = await apriBrowser()
const p = await b.newPage({ viewport: { width: 1180, height: 820 } })

const esiti = []
const verifica = (nome, cond) => { esiti.push([nome, cond]); if (!cond) process.exitCode = 1 }
const fraGiorni = n => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)

await accedi(p, URL)

// ── la pagina esiste ed è raggiungibile dalla mappa ───────────────────────
await p.getByRole('link', { name: /Stagionali/i }).click()
await p.waitForURL(`${URL}/seasonal`)
const righeIniziali = await p.locator('tbody tr').count()
verifica('l’elenco degli stagionali si apre dalla mappa', righeIniziali > 0)

// ── chi è assente oggi sta in cima ────────────────────────────────────────
const classi = await p.locator('tbody tr').evaluateAll(rs => rs.map(r => r.className))
const assenti = classi.map((c, i) => [c.includes('assente-oggi'), i]).filter(([a]) => a).map(([, i]) => i)
verifica('chi è assente oggi viene prima di tutti', assenti.every((i, k) => i === k))

// ── il modulo del nuovo contratto ─────────────────────────────────────────
await p.getByRole('button', { name: '+ Nuovo contratto stagionale' }).click()
await p.getByPlaceholder('Cerca il cliente per cognome o telefono').fill('Ross')
await p.waitForSelector('.clienti-trovati button', { timeout: 5_000 })
const nomeCliente = (await p.locator('.clienti-trovati button .chi').first().innerText()).trim()
await p.locator('.clienti-trovati button').first().click()

const select = p.locator('.campi select')
const dal = p.locator('.campi input[type="date"]').first()
const al  = p.locator('.campi input[type="date"]').nth(1)
const opzioni = await select.locator('option').evaluateAll(os =>
  os.map(o => ({ value: o.value, numero: o.textContent.split(' ·')[0].trim() })))
const presi = (await p.locator('tbody tr td:first-child b').allInnerTexts()).map(s => s.trim())
const liberi = opzioni.filter(o => !presi.includes(o.numero))
verifica('la select propone gli ombrelloni non ancora assegnati', liberi.length > 0)

// ── C-16 · il rifiuto deve dire QUALI prenotazioni sono in conflitto ──────
// A stagione piena, su un ombrellone qualunque, qualche giornaliero c'è.
await select.selectOption(liberi[liberi.length - 1].value)
await p.getByRole('button', { name: 'CREA CONTRATTO' }).click()
await p.waitForSelector('.err', { timeout: 15_000 })
const messaggio = await p.locator('.err').innerText()
verifica('il conflitto elenca cliente e date, non dice solo «non si può»',
  /prenotazioni nel periodo/.test(messaggio) && /\d{1,2} \w{3}–\d{1,2} \w{3}/.test(messaggio))

// ── un contratto che si può davvero fare ─────────────────────────────────
// Periodo corto in coda di stagione: cerco il primo ombrellone senza
// prenotazioni in quei giorni, come farebbe il gestore provando.
await dal.fill(fraGiorni(1))
await al.fill(fraGiorni(3))
let scelto = null
for (const o of liberi.slice().reverse()) {
  await select.selectOption(o.value)
  await p.getByRole('button', { name: 'CREA CONTRATTO' }).click()
  try {
    await p.waitForSelector('.link-personale', { timeout: 8_000 })
    scelto = o.numero
    break
  } catch { /* conflitto: provo il prossimo */ }
}
verifica('il gestore riesce a creare un contratto stagionale', scelto !== null)
if (!scelto) { for (const [n, ok] of esiti) console.log(`${ok ? '✓' : '✗'} ${n}`); await b.close(); process.exit(1) }

const link = await p.locator('.link-personale').innerText()
verifica('il contratto creato restituisce un link personale', /\/s\/[A-Za-z0-9_-]{20,}/.test(link))
await p.waitForTimeout(800)
verifica('l’elenco ha una riga in più', (await p.locator('tbody tr').count()) === righeIniziali + 1)

// ── il link funziona davvero, senza password ─────────────────────────────
const anonimo = await b.newContext()
const pc = await anonimo.newPage()
await pc.goto(link, { waitUntil: 'networkidle' })
const testoCliente = await pc.locator('body').innerText()
verifica('il cliente apre la sua area con quel link, senza password',
  testoCliente.includes(scelto) && !pc.url().includes('/login'))
await anonimo.close()

// ── com'è quel posto domani, PRIMA dell'assenza ──────────────────────────
const ambra = async () => (await p.locator('.tile.ambra b').count())
  ? parseInt(await p.locator('.tile.ambra b').innerText(), 10) : 0
const etichettaDi = n => p.locator(`g.umb[aria-label^="Ombrellone ${n},"]`).first()
  .getAttribute('aria-label').then(t => t ?? '')

const vaiADomani = async () => {
  await p.goto(`${URL}/map`, { waitUntil: 'networkidle' })
  await p.getByRole('button', { name: 'Giorno successivo' }).click()
  await p.waitForTimeout(1_500)
}

await vaiADomani()
const assentiPrima = await ambra()
verifica(`domani l’ombrellone ${scelto} risulta occupato dallo stagionale`,
  /Stagionale/.test(await etichettaDi(scelto)))

// ── F6-11 · l'operatore registra l'assenza per chi telefona ───────────────
await p.goto(`${URL}/seasonal`, { waitUntil: 'networkidle' })
const riga = p.locator('tbody tr').filter({ has: p.locator(`td:first-child b:text-is("${scelto}")`) })
await riga.getByRole('button', { name: 'Registra assenza' }).click()
await p.waitForSelector('aside.panel')
verifica('il pannello dice di chi è l’ombrellone',
  (await p.locator('aside.panel .sub').innerText()).trim() === nomeCliente)
await p.getByRole('button', { name: 'DOMANI' }).click()
await p.waitForSelector('aside.panel', { state: 'detached', timeout: 15_000 })
await p.waitForTimeout(800)
verifica('la riga mostra l’assenza appena registrata',
  /assente fino al|1 future/.test(await riga.innerText()))

// ── e adesso quel posto è vendibile: è tutto il prodotto ─────────────────
await vaiADomani()
const etichetta = await etichettaDi(scelto)
verifica(`l’ombrellone ${scelto} domani è liberato dallo stagionale (${etichetta})`,
  /Liberato da stagionale|Disponibile temporaneamente/.test(etichetta))
const assentiDopo = await ambra()
verifica(`il contatore di domani lo conta senza che il gestore tocchi nulla (${assentiPrima} → ${assentiDopo})`,
  assentiDopo === assentiPrima + 1)

// ── pulizia: chiudo il contratto, così lo script è ripetibile ────────────
await p.goto(`${URL}/seasonal`, { waitUntil: 'networkidle' })
await p.locator('tbody tr').filter({ has: p.locator(`td:first-child b:text-is("${scelto}")`) })
  .getByRole('button', { name: 'Chiudi' }).click()
await p.waitForTimeout(1_000)
verifica('chiudere il contratto riporta l’elenco com’era',
  (await p.locator('tbody tr').count()) === righeIniziali)

for (const [nome, ok] of esiti) console.log(`${ok ? '✓' : '✗'} ${nome}`)
await b.close()
