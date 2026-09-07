/**
 * I difetti trovati dalla prova su tablet, e le loro correzioni.
 *
 * Ogni controllo qui nasce da un difetto vero segnalato da chi ha provato il
 * prodotto, non da un'ipotesi: sono i casi che i miei test non vedevano.
 *
 * Uso:  npm start  →  node e2e/riscontro-tablet.mjs
 */
import { apriBrowser } from './browser.mjs'
import { accedi } from './login.mjs'

// `SITO` e non `URL`: la costante oscurerebbe il costruttore globale URL,
// che qui serve per leggere il percorso dopo un rimando.
const SITO = process.env.E2E_URL ?? 'http://localhost:3000'
const browser = await apriBrowser()
const esiti = []
const verifica = (nome, cond) => { esiti.push([nome, cond]); if (!cond) process.exitCode = 1 }
const suffisso = Date.now().toString().slice(-5)

const scheda = async (utente = 'admin@lidoadriano.it') => {
  const c = await browser.newContext({ viewport: { width: 1363, height: 936 } })
  const p = await c.newPage()
  await accedi(p, SITO, utente)
  await p.goto(`${SITO}/map`, { waitUntil: 'networkidle' })
  return p
}

// ── #1 · due reception sullo stesso posto ────────────────────────────────
{
  const A = await scheda(), B = await scheda()
  const numero = await A.locator('g.umb[aria-label*="Libero"]').first()
    .getAttribute('aria-label').then(l => l.match(/Ombrellone (\S+),/)[1])

  const prepara = async (p, cognome) => {
    await p.locator(`g.umb[aria-label^="Ombrellone ${numero},"]`).first().click()
    await p.waitForSelector('aside.panel')
    await p.getByRole('button', { name: 'PRENOTA' }).click()
    await p.getByPlaceholder('Cognome').fill(cognome)
  }
  await prepara(A, `ConcA${suffisso}`)
  await prepara(B, `ConcB${suffisso}`)
  await Promise.all([
    A.getByRole('button', { name: 'CONFERMA' }).click(),
    B.getByRole('button', { name: 'CONFERMA' }).click(),
  ])
  await A.waitForTimeout(4000)

  const perdente = (await A.locator('.err.fascia').count()) ? A : B
  verifica('#1 · chi perde la corsa riceve un avviso, non un silenzio',
    (await perdente.locator('.err.fascia').count()) === 1)

  // Il punto vero: dev'essere visibile DA DOVE si guarda la mappa.
  await perdente.evaluate(() => document.querySelector('svg.map')?.scrollIntoView({ block: 'center' }))
  await perdente.waitForTimeout(300)
  const visibile = await perdente.evaluate(() => {
    const r = document.querySelector('.err.fascia')?.getBoundingClientRect()
    return !!r && r.bottom > 0 && r.top < window.innerHeight
  })
  verifica('#1 · e l’avviso resta visibile mentre si guarda la mappa, non sopra di essa',
    visibile)

  const dati = await A.request.get(`${SITO}/api/v1/map`).then(r => r.json())
  const u = dati.umbrellas.find(x => x.visibleNumber === numero)
  verifica(`#1 · il server ne ha registrata una sola (${u.customerName})`,
    /Conc[AB]/.test(u.customerName ?? '') )
  await A.context().close(); await B.context().close()
}

// ── #7 · il doppio tocco non deve attraversare il pannello ───────────────
{
  const p = await scheda()
  await p.locator('g.umb[aria-label*="Libero"]').first().click()
  await p.waitForSelector('aside.panel')
  await p.getByRole('button', { name: 'PRENOTA' }).click()
  await p.getByPlaceholder('Cognome').fill(`Doppio${suffisso}`)
  await p.getByRole('button', { name: 'CONFERMA' }).dblclick()
  await p.waitForTimeout(1200)
  verifica('#7 · dopo il doppio tocco non si apre il pannello di un altro posto',
    (await p.locator('aside.panel').count()) === 0)
  await p.context().close()
}

// ── #8 · «rivendibile oggi» su una data futura ───────────────────────────
{
  const p = await scheda()
  await p.getByRole('button', { name: 'Giorno successivo' }).click()
  await p.waitForTimeout(1500)
  const liberato = p.locator('g.umb[aria-label*="Liberato da stagionale"]').first()
  if (await liberato.count()) {
    const et = await liberato.getAttribute('aria-label')
    verifica(`#8 · su una data futura non dice «oggi» (${et.split(',')[1]?.trim()})`,
      !/rivendibile oggi/.test(et))
  } else {
    verifica('#8 · c’è un posto liberato domani da controllare', false)
  }
  await p.context().close()
}

// ── #3 · l'operatore non deve vedere il listino ──────────────────────────
{
  const p = await scheda('reception@lidoadriano.it')
  verifica('#3 · l’operatore non vede il collegamento al listino',
    (await p.locator('.actions', { hasText: 'Listino' }).count()) === 0)
  await p.goto(`${SITO}/settings/pricing`, { waitUntil: 'networkidle' })
  verifica(`#3 · e digitando l’indirizzo a mano torna alla mappa (${new URL(p.url()).pathname})`,
    new URL(p.url()).pathname === '/map')
  await p.goto(`${SITO}/settings/map`, { waitUntil: 'networkidle' })
  verifica('#3 · idem per la configurazione della mappa',
    new URL(p.url()).pathname === '/map')
  await p.context().close()
}

// ── #3b · l'amministratore invece ci arriva ──────────────────────────────
{
  const p = await scheda()
  await p.goto(`${SITO}/settings/pricing`, { waitUntil: 'networkidle' })
  verifica('#3 · il titolare il listino lo apre eccome',
    new URL(p.url()).pathname === '/settings/pricing')
  await p.context().close()
}

// ── #9 · i bersagli non devono mai scendere sotto la soglia del dito ─────
{
  for (const [w, h] of [[1363, 936], [1180, 820], [1024, 768], [820, 1180], [390, 844]]) {
    const c = await browser.newContext({ viewport: { width: w, height: h } })
    const p = await c.newPage()
    await accedi(p, SITO)
    await p.goto(`${SITO}/map`, { waitUntil: 'networkidle' })
    // Su schermo stretto la mappa non è il modo predefinito: la si chiede.
    const bottone = p.locator('.commuta button', { hasText: 'Mappa' })
    if (await bottone.count()) await bottone.click()
    await p.waitForTimeout(400)
    const lato = await p.evaluate(() => {
      const g = document.querySelector('g.umb')     // l'area toccabile, non il disegno
      return g ? Math.round(g.getBoundingClientRect().width * 10) / 10 : 0
    })
    verifica(`#9 · a ${w}×${h} il bersaglio è ${lato} px (minimo dichiarato 44)`, lato >= 44)
    await c.close()
  }
}

for (const [nome, ok] of esiti) console.log(`${ok ? '✓' : '✗'} ${nome}`)
await browser.close()
