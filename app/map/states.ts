/**
 * F5-04 · Ogni stato è codificato da TRE segnali simultanei: colore, simbolo e
 * trattamento del bordo.
 *
 * Non è decorazione. Il colore da solo non funziona per un daltonico né sotto
 * il sole diretto, e la mappa è la schermata su cui il gestore prende ogni
 * decisione (NF-06).
 */
import type { UmbrellaViewState } from '@/domain/umbrella/state'

export type StateStyle = {
  label: string
  short: string
  fill: string
  line: string
  ink: string
  symbol: string
  /** 'solid' | 'dashed' | 'double' | 'hatch' — il terzo segnale */
  border: 'solid' | 'dashed' | 'double' | 'hatch'
}

export const STATES: Record<UmbrellaViewState, StateStyle> = {
  LIBERO: {
    label: 'Libero', short: 'Libero',
    fill: 'var(--s-free-fill)', line: 'var(--s-free-line)', ink: '#111827',
    symbol: '●', border: 'solid',
  },
  OCCUPATO: {
    label: 'Occupato', short: 'Occupato',
    fill: 'var(--s-busy-fill)', line: 'var(--s-busy-line)', ink: '#ffffff',
    symbol: '■', border: 'solid',
  },
  PRENOTATO: {
    label: 'Prenotato', short: 'Prenotato',
    fill: 'var(--s-booked-fill)', line: 'var(--s-booked-line)', ink: '#1e1b4b',
    symbol: '◐', border: 'dashed',
  },
  STAGIONALE_PRESENTE: {
    label: 'Stagionale', short: 'Stagionale',
    fill: 'var(--s-seasonal-fill)', line: 'var(--s-seasonal-line)', ink: '#1e3a8a',
    symbol: '★', border: 'solid',
  },
  // La casella economicamente più interessante dell'applicazione: l'etichetta
  // dev'essere ESPLICITA, non un sinonimo di "libero" che costringe a pensare.
  STAGIONALE_ASSENTE: {
    label: 'Liberato da stagionale — rivendibile oggi', short: 'Liberato da stagionale',
    fill: 'var(--s-sellable-fill)', line: 'var(--s-sellable-line)', ink: '#78350f',
    symbol: '☆', border: 'double',
  },
  TEMP_DISPONIBILE: {
    label: 'Disponibile temporaneamente', short: 'Liberato da stagionale',
    fill: 'var(--s-sellable-fill)', line: 'var(--s-sellable-line)', ink: '#78350f',
    symbol: '☆', border: 'double',
  },
  BLOCCATO: {
    label: 'Fuori servizio', short: 'Fuori servizio',
    fill: 'var(--s-blocked-fill)', line: 'var(--s-blocked-line)', ink: '#374151',
    symbol: '⊘', border: 'hatch',
  },
}

export const euro = (cents: number | null | undefined) =>
  cents == null ? '—' : (cents / 100).toLocaleString('it-IT',
    { style: 'currency', currency: 'EUR' })

export const dataLunga = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('it-IT',
    { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

export const dataBreve = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('it-IT',
    { day: 'numeric', month: 'short', timeZone: 'UTC' })

export const spostaGiorni = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export const oggiIso = () => new Date().toISOString().slice(0, 10)
