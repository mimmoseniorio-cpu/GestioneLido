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
