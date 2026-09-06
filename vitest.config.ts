import { defineConfig } from 'vitest/config'
import { readFileSync, existsSync } from 'node:fs'

// Vitest non legge .env da solo. Caricatore minimo: evita una dipendenza in
// piu' per un file di tre righe.
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?(.*?)"?\s*$/.exec(line)
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]
  }
}

export default defineConfig({
  test: {
    globalSetup: ['./tests/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
})
