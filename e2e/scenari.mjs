/**
 * F7 · I sei scenari di `docs/07`, con i nove numeri che li accettano.
 *
 * «Semplice» per questo prodotto non è un aggettivo: è la tabella in fondo a
 * `docs/07`. Rispondere «c'è posto?» costa zero interazioni, prenotare ne
 * costa al massimo quattro, uno stagionale comunica un'assenza in tre tap.
 * Questo script CONTA — un percorso che funziona ma richiede otto tap è un
 * difetto, non un dettaglio.
 *
 * Quello che NON può fare, e va detto: `F5-11`, cioè se un bagnino al sole
 * capisce la mappa in cinque secondi. Qui si misura che l'informazione ci sia
 * e arrivi in tempo, non che una persona la legga.
 *
 * Uso:  npm start  →  npm run e2e
 */
import { apriBrowser } from './browser.mjs'
import { accedi } from './login.mjs'

const URL = process.env.E2E_URL ?? 'http://localhost:3000'
const browser = await apriBrowser()

/** Un tap, una digitazione: le interazioni si contano solo passando da qui. */
class Conta {
  constructor(page) { this.p = page; this.n = 0 }
  azzera() { this.n = 0; return this }
  async tap(loc) { this.n++; await loc.click() }
  async scrivi(loc, testo) { this.n++; await loc.fill(testo) }
}

/** Nomi diversi a ogni esecuzione: i clienti restano sulla mappa. */
const suffisso = Date.now().toString().slice(-6)

const criteri = []
const criterio = (scenario, cosa, usate, limite) => {
  const ok = usate <= limite
  criteri.push({ scenario, cosa, usate, limite, ok })
  if (!ok) process.exitCode = 1
  return ok
}
const controlli = []
const verifica = (nome, cond) => { controlli.push([nome, cond]); if (!cond) process.exitCode = 1 }

const staff = async () => {
  const p = await browser.newPage({ viewport: { width: 1180, height: 900 } })
  await accedi(p, URL)
  return p
}
const libero = p => p.locator('g.umb[aria-label*="Libero"]').first()

// ─────────────────────────────────────────────────────────────────────────
// F · «Il gestore guarda la mappa alle 09:30». Nessuna interazione.
// ─────────────────────────────────────────────────────────────────────────
async function scenarioF() {
  const p = await staff()
  const t0 = Date.now()
  await p.goto(`${URL}/map`, { waitUntil: 'networkidle' })
  await p.waitForSelector('.tile.forte b')
  const secondi = (Date.now() - t0) / 1000
  criterio('F', 'la mappa è leggibile (secondi)', Math.ceil(secondi), 5)

  // Le sei domande di `docs/07` §F, senza toccare nulla.
  const testo = await p.locator('section.oggi').innerText()
  const risposte = {
    'quanto sono pieno': /\d+\s*\n?occupati/i.test(testo),
    'cosa posso vendere ora': /\d+\s*\n?disponibili/i.test(testo),
    'quali stagionali mancano': /stagionali/i.test(testo),
    'c’è qualcosa di rotto': /fuori servizio|\d+\s*\n?fuori/i.test(testo),
  }
  for (const [domanda, ok] of Object.entries(risposte))
    verifica(`F · «${domanda}» ha risposta senza toccare nulla`, ok)

  // I contatori sono TESTO, non solo colori: un daltonico li legge lo stesso.
  verifica('F · i contatori sono numeri scritti, non solo colori sulla mappa',
    /\d/.test(testo))
  verifica('F · la mappa entra intera: 96 ombrelloni disegnati',
    (await p.locator('g.umb').count()) === 96)

  // Sesta domanda: «chi deve ancora pagarmi?». `docs/07` §F le dà un tocco.
  const filtro = p.locator('.actions button', { hasText: /Da incassare/ })
  if (await filtro.count() === 0) {
    verifica('F · «chi deve ancora pagarmi» ha un filtro da un tocco', false)
    await p.close(); return
  }
  const quanti = parseInt((await filtro.innerText()).replace(/\D/g, ''), 10)
  const c = new Conta(p)
  await c.tap(filtro)
  await p.waitForSelector('.risultati')
  criterio('F', 'chi deve ancora pagarmi', c.n, 1)
  verifica(`F · il filtro mostra i ${quanti} da incassare, e il totale in euro`,
    /Da incassare/.test(await p.locator('.risultati').innerText()) &&
    /€/.test(await p.locator('.risultati').innerText()))

  await p.locator('.commuta button', { hasText: 'Elenco' }).click()
  await p.waitForTimeout(400)
  const righe = await p.locator('.elenco-ombrelloni .riga-ombrellone').count()
  verifica(`F · anche l’elenco rispetta il filtro, non solo la mappa (${righe} righe)`,
    righe === quanti)
  await p.close()
}

// ─────────────────────────────────────────────────────────────────────────
// A · «Avete un ombrellone libero oggi?»
// ─────────────────────────────────────────────────────────────────────────
async function scenarioA() {
  const p = await staff()
  await p.goto(`${URL}/map`, { waitUntil: 'networkidle' })

  // Rispondere: zero interazioni, il numero è già sullo schermo.
  const prima = parseInt(await p.locator('.tile.forte b').innerText(), 10)
  criterio('A', 'rispondere «c’è posto?»', 0, 0)
  verifica('A · il numero da vendere è un numero vero', Number.isFinite(prima))

  const c = new Conta(p)
  await c.tap(libero(p))
  await p.waitForSelector('aside.panel')
  await c.tap(p.getByRole('button', { name: 'PRENOTA' }))
  await c.scrivi(p.getByPlaceholder('Cognome'), `ScenarioA${suffisso}`)
  await c.tap(p.getByRole('button', { name: 'CONFERMA' }))
  criterio('A', 'prenotare un cliente', c.n, 4)

  await p.waitForTimeout(2500)
  const dopo = parseInt(await p.locator('.tile.forte b').innerText(), 10)
  verifica(`A · un posto in meno da vendere (${prima} → ${dopo})`, dopo === prima - 1)
  await p.close()
}

// ─────────────────────────────────────────────────────────────────────────
// B · «Due ombrelloni vicini dal 10 al 15 agosto»
// ─────────────────────────────────────────────────────────────────────────
async function scenarioB() {
  const p = await staff()
  await p.goto(`${URL}/map`, { waitUntil: 'networkidle' })
  const fra = n => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)

  const c = new Conta(p)
  await c.tap(p.getByRole('button', { name: /Trova il posto migliore/ }))
  await p.waitForSelector('aside.panel')
  const campi = p.locator('aside.panel input[type="date"]')
  await c.scrivi(campi.first(), fra(2))
  await c.scrivi(campi.nth(1), fra(5))
  await c.tap(p.getByRole('button', { name: 'CERCA' }))
  await p.waitForSelector('.esito-testata', { timeout: 20_000 })
  criterio('B', 'dalla mappa alle proposte', c.n, 4)

  const proposte = await p.locator('.soluzione, .proposta').count()
  verifica('B · propone qualcosa: mai «nessun risultato» (C-20)',
    proposte > 0 || /meglio disponibile/.test(await p.locator('.esito-testata').innerText()))

  const scelta = p.locator('.proposta').first()
  const numeri = (await scelta.locator('.numeri').innerText()).replace('★', '').trim()

  await c.scrivi(p.getByPlaceholder('Cognome del cliente'), `ScenarioB${suffisso}`)
  await c.tap(scelta.getByRole('button', { name: 'Prenota', exact: true }))
  await c.tap(scelta.getByRole('button', { name: 'CONFERMA' }))
  await p.waitForTimeout(3000)
  criterio('B', 'prenotazione multipla completa', c.n, 8)

  // Contare le interazioni di un percorso che non prenota non dimostra nulla:
  // la prima versione di questo script si fermava al pulsante «Prenota», che
  // arma la conferma e basta, e dichiarava sei interazioni per un nulla di
  // fatto. Qui si controlla che i posti risultino davvero venduti.
  const cercati = numeri.split('+').map(x => x.trim()).filter(Boolean)
  const giorno = await (await p.request.get(`${URL}/api/v1/map?date=${fra(2)}`)).json()
  const venduti = cercati.map(n =>
    giorno.umbrellas.find(u => u.visibleNumber === n)?.customerName ?? '')
  verifica(`B · i posti proposti risultano prenotati il ${fra(2)} (${numeri})`,
    venduti.length > 0 && venduti.every(nome => nome.includes(`ScenarioB${suffisso}`)))
  await p.close()
}

// ─────────────────────────────────────────────────────────────────────────
// C · Lo stagionale: «domani non vengo». Tre tap, nessuna password.
// ─────────────────────────────────────────────────────────────────────────
async function scenarioC() {
  // Il gestore prende il link personale dal pannello dello stagionale: è il
  // gesto vero, quello che poi finisce su WhatsApp.
  const p = await staff()
  await p.goto(`${URL}/map`, { waitUntil: 'networkidle' })
  const stagionale = p.locator('g.umb[aria-label*="Stagionale"]').first()
  await stagionale.click()
  await p.waitForSelector('aside.panel')
  await p.getByRole('button', { name: /Manda il link personale/ }).click()
  await p.waitForSelector('.link-personale, code', { timeout: 15_000 })
  const link = (await p.locator('.link-personale, code').first().innerText()).trim()
  verifica('C · il gestore ottiene il link personale da mandare su WhatsApp',
    /\/s\/[A-Za-z0-9_-]{20,}/.test(link))
  await p.close()

  // Il cliente: browser nuovo, nessuna sessione, nessuna password.
  const ctxCliente = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const pc = await ctxCliente.newPage()
  await pc.goto(link, { waitUntil: 'networkidle' })
  verifica('C · si apre senza login', !pc.url().includes('/login'))

  const c = new Conta(pc)
  await c.tap(pc.getByRole('button', { name: 'NON SARÒ PRESENTE' }))
  await c.tap(pc.getByRole('button', { name: 'DOMANI', exact: true }))
  await c.tap(pc.getByRole('button', { name: 'CONFERMA' }))
  await pc.waitForTimeout(2500)
  criterio('C', 'assenza per domani (cliente)', c.n, 3)

  const dopo = await pc.locator('body').innerText()
  verifica('C · il cliente vede confermato che il posto resta suo',
    /torna suo|resta suo|assenza/i.test(dopo))
  await ctxCliente.close()

  // F6-29 · l'anello che chiude il meccanismo: se il gestore non se ne
  // accorge, quel posto resta vuoto e lo stagionale non matura credito.
  const pg = await staff()
  await pg.goto(`${URL}/map`, { waitUntil: 'networkidle' })
  const fascia = pg.locator('.novita')
  verifica('C · il gestore lo vede sulla mappa, senza cercarlo',
    (await fascia.count()) === 1 && /comunicato un’assenza/.test(await fascia.innerText()))
  verifica('C · e la fascia dice quale ombrellone è diventato vendibile',
    /Ombrellone/.test(await fascia.innerText()))
  await pg.close()
}

// ─────────────────────────────────────────────────────────────────────────
// C variante · lo stagionale telefona, registra l'operatore.
// ─────────────────────────────────────────────────────────────────────────
/** Restituisce il numero dell'ombrellone liberato: lo scenario D lo vende. */
async function scenarioCbis() {
  const p = await staff()
  await p.goto(`${URL}/seasonal`, { waitUntil: 'networkidle' })

  // Una riga senza assenze già dichiarate: due assenze sovrapposte sarebbero
  // rifiutate dal database, e misurerei i tap di un errore.
  const riga = p.locator('tbody tr').filter({ has: p.locator('td:nth-child(5) .minuto') })
    .filter({ hasNotText: 'future' }).first()
  const numero = (await riga.locator('td:first-child b').innerText()).trim()

  const c = new Conta(p)
  await c.tap(riga.getByRole('button', { name: 'Registra assenza' }))
  await p.waitForSelector('aside.panel')
  await c.tap(p.getByRole('button', { name: 'DOMANI' }))
  await p.waitForSelector('aside.panel', { state: 'detached', timeout: 20_000 })
  criterio('C', 'assenza registrata dall’operatore', c.n, 4)

  // La riga va ritrovata per numero: dopo l'aggiornamento l'elenco si
  // riordina, e il filtro «senza assenze» che l'aveva selezionata non la
  // trova più — cioè proprio perché l'assenza c'è.
  await p.waitForTimeout(800)
  const dopo = p.locator('tbody tr').filter({
    has: p.locator(`td:first-child b:text-is("${numero}")`) })
  verifica(`C · l’assenza dell’ombrellone ${numero} è registrata`,
    /assente|1 future/.test(await dopo.innerText()))
  await p.close()
  return numero
}

// ─────────────────────────────────────────────────────────────────────────
// D · Un giornaliero prende il posto dello stagionale assente.
// ─────────────────────────────────────────────────────────────────────────
/**
 * Vende il posto che lo stagionale ha appena liberato.
 *
 * Guarda DOMANI, non oggi: l'assenza si dichiara dal giorno dopo (D-12), e un
 * test che dipendesse dai posti già liberi nei dati dimostrativi passerebbe o
 * fallirebbe a seconda di quanti ne ha venduti chi ha provato prima.
 */
async function scenarioD(numero) {
  const p = await staff()
  await p.goto(`${URL}/map`, { waitUntil: 'networkidle' })
  await p.getByRole('button', { name: 'Giorno successivo' }).click()
  await p.waitForTimeout(1500)

  const liberato = numero
    ? p.locator(`g.umb[aria-label^="Ombrellone ${numero},"]`).first()
    : p.locator('g.umb[aria-label*="Liberato da stagionale"]').first()
  const etichetta = (await liberato.getAttribute('aria-label').catch(() => null)) ?? ''
  if (!/Liberato da stagionale/.test(etichetta)) {
    verifica(`D · c’è un posto liberato da vendere domani (${etichetta || 'nessuno'})`, false)
    await p.close(); return
  }
  const c = new Conta(p)
  await c.tap(liberato)
  await p.waitForSelector('aside.panel')

  // Il costo in credito va visto MENTRE si decide, non dopo.
  const pannello = await p.locator('aside.panel').innerText()
  verifica('D · il costo in credito è visibile prima di vendere',
    /Credito a/i.test(pannello))

  await c.tap(p.getByRole('button', { name: 'VENDI QUESTO POSTO' }))
  await c.scrivi(p.getByPlaceholder('Cognome'), `ScenarioD${suffisso}`)
  await c.tap(p.getByRole('button', { name: 'CONFERMA' }))
  criterio('D', 'vendita del posto stagionale', c.n, 4)
  await p.waitForTimeout(3000)

  // T-20 · il giro completo: assenza → posto vendibile → venduto → credito.
  await p.goto(`${URL}/seasonal`, { waitUntil: 'networkidle' })
  const riga = p.locator('tbody tr').filter({
    has: p.locator(`td:first-child b:text-is("${numero}")`) })
  const credito = (await riga.locator('td.num').innerText()).trim()
  verifica(`D · lo stagionale ha maturato credito sulla rivendita (${credito})`,
    /€/.test(credito) && credito !== '—')
  await p.close()
}

// ─────────────────────────────────────────────────────────────────────────
// E · Il cliente abituale telefona: dalla mappa alla sua scheda.
// ─────────────────────────────────────────────────────────────────────────
async function scenarioE() {
  const p = await staff()
  await p.goto(`${URL}/map`, { waitUntil: 'networkidle' })
  const c = new Conta(p)
  await c.scrivi(p.getByLabel('Cerca'), 'Rossi')
  await p.waitForSelector('.clienti-trovati a', { timeout: 15_000 })
  await c.tap(p.locator('.clienti-trovati a').first())
  await p.waitForURL(/\/customers\//, { timeout: 15_000 })
  criterio('E', 'da mappa a scheda cliente', c.n, 3)

  const scheda = await p.locator('main').innerText()
  verifica('E · la scheda dice lo storico, non solo il nome',
    /prenotazion|ombrellone|stagion/i.test(scheda))
  await p.close()
}

// ─────────────────────────────────────────────────────────────────────────
// F6-28 · La conferma su WhatsApp, già scritta.
// ─────────────────────────────────────────────────────────────────────────
async function scenarioConferma() {
  const p = await staff()
  const giorno = await (await p.request.get(`${URL}/api/v1/map`)).json()
  const conTelefono = giorno.umbrellas.find(u => u.customerPhone && u.customerName && u.period)
  if (!conTelefono) {
    verifica('Conferma · c’è una prenotazione con un telefono', false)
    await p.close(); return
  }

  await p.goto(`${URL}/map`, { waitUntil: 'networkidle' })
  await p.locator(`g.umb[aria-label^="Ombrellone ${conTelefono.visibleNumber},"]`).first().click()
  await p.waitForSelector('aside.panel')
  const link = p.getByRole('link', { name: 'Manda la conferma su WhatsApp' })
  if (await link.count() === 0) {
    verifica('Conferma · il pannello offre la conferma su WhatsApp', false)
    await p.close(); return
  }
  const testo = decodeURIComponent(((await link.getAttribute('href')) ?? '').split('text=')[1] ?? '')

  // Le tre cose che il cliente cercherà nella chat arrivando in spiaggia.
  verifica(`Conferma · dice quale ombrellone (${conTelefono.visibleNumber})`,
    testo.includes(`ombrellone ${conTelefono.visibleNumber}`))
  verifica('Conferma · dice i giorni', /\d{1,2} (gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)/.test(testo))
  verifica('Conferma · dice quanto, e se è già pagato',
    /€/.test(testo) && /(saldato|da pagare)/.test(testo))
  // Il nome dello stabilimento era fisso a «Stabilimento»: si notava appena
  // in cima alla pagina, ma qui lo legge il cliente.
  verifica('Conferma · nomina lo stabilimento vero, non un segnaposto',
    /Lido/.test(testo) && !/^Stabilimento$/.test(testo))
  await p.close()
}

// ─────────────────────────────────────────────────────────────────────────
// Criterio 10 · la rete cade a metà prenotazione (F7-08).
//
// Su una spiaggia il segnale va e viene. Ciò che non è passato deve restare
// visibile e riprovabile: se sparisce, l'operatore torna al quaderno e non
// torna più indietro.
// ─────────────────────────────────────────────────────────────────────────
async function scenarioRete() {
  // Cognome diverso a ogni esecuzione: quello fisso restava sulla mappa dal
  // giro precedente, e al secondo lancio il controllo «una sola volta» ne
  // trovava due. La suite dev'essere ripetibile senza ricaricare i dati.
  const cliente = `SenzaRete${Date.now().toString().slice(-6)}`
  const p = await staff()
  await p.goto(`${URL}/map`, { waitUntil: 'networkidle' })

  await p.route('**/api/v1/reservations', r => r.abort('internetdisconnected'))
  await p.locator('g.umb[aria-label*="Libero"]').first().click()
  await p.waitForSelector('aside.panel')
  await p.getByRole('button', { name: 'PRENOTA' }).click()
  await p.getByPlaceholder('Cognome').fill(cliente)
  await p.getByRole('button', { name: 'CONFERMA' }).click()

  // Quattro tentativi con attese crescenti prima di arrendersi e chiedere.
  await p.waitForSelector('.coda .azioni-coda', { timeout: 40_000 })
  const avviso = await p.locator('.coda').innerText()
  verifica('Rete · la prenotazione non passata resta visibile, col nome del cliente',
    avviso.includes(cliente) && /Connessione assente/.test(avviso))
  verifica('Rete · e si può riprovare o scartare, non sparisce',
    (await p.locator('.coda button', { hasText: 'Riprova' }).count()) === 1)

  // Torna la linea: ciò che era in coda deve andare a buon fine, con la
  // STESSA chiave di idempotenza — quindi una prenotazione sola.
  await p.unroute('**/api/v1/reservations')
  await p.locator('.coda button', { hasText: 'Riprova' }).click()
  await p.waitForSelector('.coda', { state: 'detached', timeout: 40_000 })
  await p.waitForTimeout(2000)
  verifica('Rete · al ritorno della linea la prenotazione va a buon fine, una sola volta',
    (await p.locator(`g.umb[aria-label*="${cliente}"]`).count()) === 1)
  await p.close()
}

// ─────────────────────────────────────────────────────────────────────────
// L'ordine non è casuale: C-bis libera il posto che D vende. È anche il giro
// vero del prodotto — lo stagionale avvisa, il gestore rivende.
let liberatoDaCbis = null
const scenari = [
  ['F', scenarioF], ['A', scenarioA], ['B', scenarioB], ['C', scenarioC],
  ['Cbis', async () => { liberatoDaCbis = await scenarioCbis() }],
  ['D', async () => scenarioD(liberatoDaCbis)],
  ['E', scenarioE],
  ['Conferma', scenarioConferma],
  ['Rete', scenarioRete],
]
for (const [nome, fn] of scenari) {
  try { await fn() }
  catch (e) {
    process.exitCode = 1
    controlli.push([`${nome} · lo scenario è arrivato in fondo — ${String(e).split('\n')[0]}`, false])
  }
}

console.log('\n  I nove criteri di docs/07 §Riepilogo\n')
for (const c of criteri) {
  const segno = c.ok ? '✓' : '✗'
  console.log(`  ${segno} ${c.scenario} · ${c.cosa}: ${c.usate} (limite ${c.limite})`)
}
console.log('')
for (const [nome, ok] of controlli) console.log(`  ${ok ? '✓' : '✗'} ${nome}`)
console.log('\n  Non verificabile qui: F5-11, se una persona vera capisce la')
console.log('  mappa in cinque secondi. Servono mezz’ora e un tablet.\n')

await browser.close()
