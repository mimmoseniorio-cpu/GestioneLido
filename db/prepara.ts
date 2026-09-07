/**
 * F4-10 · Cosa fare al database prima di compilare, e quando NON farlo.
 *
 * Su Vercel le variabili d'ambiente valgono per «Production and Preview»: se
 * non ci si mette in mezzo, un rilascio di prova nato da un ramo qualunque
 * applica le proprie migrazioni al database VERO. Non è un'ipotesi remota —
 * è il comportamento predefinito, e basta aprire una pull request.
 *
 * Quindi: in produzione si migra e, se il database è vuoto, si popola. In
 * preview non si tocca niente, a meno che qualcuno lo chieda esplicitamente
 * avendo prima collegato un database separato.
 */
import { execSync } from 'node:child_process'

const ambiente = process.env.VERCEL_ENV ?? 'development'
const consentito = process.env.ALLOW_PREVIEW_DB_WRITES === 'true'

/** Uguali = un solo database per tutto: allora il preview non deve scrivere. */
const stessoDatabase = () => {
  const a = process.env.DATABASE_URL ?? ''
  const b = process.env.PRODUCTION_DATABASE_URL ?? ''
  return a !== '' && a === b
}

function esegui(comando: string) {
  console.log(`· ${comando}`)
  execSync(comando, { stdio: 'inherit' })
}

if (ambiente === 'preview' && !consentito) {
  console.log(
    '· rilascio di prova: NON tocco il database.\n' +
    '  Le variabili di Vercel valgono anche per il preview, quindi senza\n' +
    '  questo controllo un ramo di prova migrerebbe il database di produzione.\n' +
    '  Per usare un database separato: crealo, impostane le variabili per il\n' +
    '  solo Preview e aggiungi ALLOW_PREVIEW_DB_WRITES=true.',
  )
} else if (ambiente === 'preview' && stessoDatabase()) {
  // Consenso dato ma database non separato: è quasi sempre una svista.
  console.error(
    '✗ ALLOW_PREVIEW_DB_WRITES è attivo ma DATABASE_URL punta allo stesso\n' +
    '  database della produzione. Rifiuto: un ramo di prova non migra i dati veri.',
  )
  process.exit(1)
} else {
  esegui('prisma migrate deploy')
  esegui('tsx db/deploy-seed.ts')
}
