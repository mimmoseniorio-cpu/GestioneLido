/**
 * F4-03 · Il livello domain/ non deve conoscere Prisma, React o HTTP.
 *
 * Nel brief era una lint rule. Un test ottiene la stessa garanzia, gira nella
 * stessa pipeline e non richiede di configurare e mantenere un plugin ESLint
 * dedicato (D-17).
 *
 * Serve perche' la regola di dipendenza e' l'unica cosa che tiene testabili le
 * regole di dominio senza database: basta un import "comodo" per perderla.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function sources(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p)
    }
  }
  try { walk(dir) } catch { /* cartella non ancora creata */ }
  return out
}

const importsOf = (file: string) =>
  [...readFileSync(file, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1]!)

describe('regola di dipendenza', () => {
  it('domain/ non importa Prisma, React o oggetti HTTP', () => {
    const violazioni: string[] = []
    for (const file of sources('domain')) {
      for (const imp of importsOf(file)) {
        if (/@prisma\/client|^next|^react|@\/server|@\/db|@\/app/.test(imp)) {
          violazioni.push(`${file} → ${imp}`)
        }
      }
    }
    expect(violazioni).toEqual([])
  })

  it('solo il repository layer e il seed parlano con Prisma', () => {
    const consentiti = ['server/repositories/', 'db/']
    const violazioni: string[] = []
    for (const dir of ['server', 'app', 'domain']) {
      for (const file of sources(dir)) {
        if (consentiti.some(c => file.startsWith(c))) continue
        if (importsOf(file).some(i => i === '@prisma/client' && !file.endsWith('.d.ts'))) {
          // I soli type import sono ammessi: non creano una connessione.
          const testo = readFileSync(file, 'utf8')
          const soloTipi = /import\s+type\s+\{[^}]*\}\s+from\s+['"]@prisma\/client['"]/.test(testo)
          if (!soloTipi) violazioni.push(file)
        }
      }
    }
    expect(violazioni).toEqual([])
  })
})
