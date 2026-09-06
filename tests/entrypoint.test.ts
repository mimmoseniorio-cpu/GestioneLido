/**
 * Il controllo che ha fatto fallire il primo rilascio su Vercel.
 *
 * `db/deploy-seed.ts` importa il seed per richiamarlo dopo aver verificato che
 * il database sia vuoto. Con un confronto per suffisso, il seed partiva ANCHE
 * da solo — perché "deploy-seed.ts" finisce per "seed.ts" — e le due copie si
 * azzeravano il database a vicenda.
 */
import { describe, it, expect } from 'vitest'
import { eseguitoDirettamente } from '../db/entrypoint'

describe('eseguitoDirettamente', () => {
  it('riconosce il file lanciato davvero', () => {
    expect(eseguitoDirettamente('seed.ts', '/vercel/path0/db/seed.ts')).toBe(true)
  })

  it('NON scatta per un file che finisce con lo stesso nome', () => {
    // Il bug: questo dava true, e il seed girava due volte insieme.
    expect(eseguitoDirettamente('seed.ts', '/vercel/path0/db/deploy-seed.ts')).toBe(false)
  })

  it('non scatta per un altro file qualunque', () => {
    expect(eseguitoDirettamente('seed.ts', '/vercel/path0/db/dates.ts')).toBe(false)
  })

  it('senza argomenti non esegue nulla', () => {
    expect(eseguitoDirettamente('seed.ts', undefined)).toBe(false)
  })
})
