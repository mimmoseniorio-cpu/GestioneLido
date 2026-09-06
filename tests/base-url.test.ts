/**
 * F4-10 · L'indirizzo pubblico nei link personali.
 *
 * Un link costruito sull'origine interna del processo finisce su WhatsApp e
 * non porta da nessuna parte: il cliente stagionale non se ne accorge e non
 * può rimediare. Vale la pena di un test.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { baseUrl } from '@/server/http'

const richiesta = (headers: Record<string, string>, origin = 'http://localhost:3000') =>
  ({ headers: new Headers(headers), nextUrl: new URL(origin) })

const originale = process.env.APP_URL
afterEach(() => {
  if (originale === undefined) delete process.env.APP_URL
  else process.env.APP_URL = originale
})

describe('baseUrl', () => {
  it('la configurazione esplicita vince su tutto', () => {
    process.env.APP_URL = 'https://lidoadriano.it'
    expect(baseUrl(richiesta({ 'x-forwarded-host': 'altro.vercel.app' })))
      .toBe('https://lidoadriano.it')
  })

  it('toglie la barra finale, così i link non hanno il doppio slash', () => {
    process.env.APP_URL = 'https://lidoadriano.it/'
    expect(baseUrl(richiesta({}))).toBe('https://lidoadriano.it')
  })

  it('senza configurazione usa l’intestazione del proxy, non l’origine interna', () => {
    delete process.env.APP_URL
    expect(baseUrl(richiesta({ 'x-forwarded-host': 'lido.vercel.app', 'x-forwarded-proto': 'https' })))
      .toBe('https://lido.vercel.app')
  })

  it('un host pubblico senza protocollo dichiarato si assume in https', () => {
    delete process.env.APP_URL
    expect(baseUrl(richiesta({ host: 'lido.vercel.app' }))).toBe('https://lido.vercel.app')
  })

  it('in locale resta http: altrimenti il browser rifiuterebbe il link', () => {
    delete process.env.APP_URL
    expect(baseUrl(richiesta({ host: 'localhost:3000' }))).toBe('http://localhost:3000')
  })

  it('senza nulla ricade sull’origine del processo', () => {
    delete process.env.APP_URL
    expect(baseUrl(richiesta({}, 'http://127.0.0.1:3000'))).toBe('http://127.0.0.1:3000')
  })
})
