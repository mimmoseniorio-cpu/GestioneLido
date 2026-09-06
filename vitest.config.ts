import { defineConfig } from 'vitest/config'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Vitest non legge .env da solo. Caricatore minimo: evita una dipendenza in
// piu' per un file di tre righe.
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?(.*?)"?\s*$/.exec(line)
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]
  }
}

// I test girano SEMPRE sul database dedicato: qualunque modulo che legge
// DATABASE_URL (compreso il client del repository layer) punta li'.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL

export default defineConfig({
  // Stesso alias di tsconfig: i test importano i moduli come lo fa l'app.
  resolve: { alias: { '@': resolve(__dirname, '.') } },
  test: {
    globalSetup: ['./tests/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
})
