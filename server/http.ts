/** Confine HTTP: valida, chiama il caso d'uso, traduce l'errore. Nessuna
 *  logica di dominio qui dentro (docs/02 §5). */
import { NextResponse } from 'next/server'
import { DomainError } from '@/domain/errors'

export function ok<T>(body: T, status = 200) {
  return NextResponse.json(body, { status })
}

export function fail(e: unknown) {
  if (e instanceof DomainError) {
    return NextResponse.json(e.toJSON(), { status: e.httpStatus })
  }
  console.error('[errore non gestito]', e)
  return NextResponse.json(
    { error: 'INTERNAL', message: 'Si è verificato un errore. Riprova.' },
    { status: 500 },
  )
}

/** Le date arrivano come 'YYYY-MM-DD' e restano date, senza fusi (C-50). */
export function parseDay(value: string | null, fallback = new Date()): Date {
  if (!value) {
    return new Date(Date.UTC(fallback.getUTCFullYear(), fallback.getUTCMonth(), fallback.getUTCDate()))
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) throw new DomainError('INVALID_RANGE', `Data non valida: ${value}`)
  return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!))
}

/**
 * L'indirizzo pubblico dell'applicazione (F4-10).
 *
 * `req.nextUrl.origin` è l'origine che il processo Next vede: dietro il proxy
 * di un fornitore di hosting è un indirizzo interno. Un link personale
 * costruito su quello finisce su WhatsApp e non porta da nessuna parte, e il
 * cliente stagionale non ha nessun modo di accorgersene o di rimediare.
 *
 * Ordine: la configurazione esplicita, poi l'intestazione del proxy, e solo
 * come ultima spiaggia ciò che vede il processo.
 */
export function baseUrl(req: { headers: Headers; nextUrl: URL }): string {
  const configurato = process.env.APP_URL?.trim()
  if (configurato) return configurato.replace(/\/$/, '')

  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  if (host) {
    const proto = req.headers.get('x-forwarded-proto')
      ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
    return `${proto}://${host}`
  }
  return req.nextUrl.origin
}
