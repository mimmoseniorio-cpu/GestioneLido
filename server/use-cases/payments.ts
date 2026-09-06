/**
 * F6-19 · Incassi e rimborsi.
 *
 * Estratto dalle rotte perché la prenotazione al banco incassa nella propria
 * transazione: «prenotato e pagato» è UN gesto solo per chi sta all'ombrellone,
 * e deve esserlo anche per il database.
 *
 * Il rimborso è un pagamento negativo, non una riga cancellata (`docs/03`
 * §`amount_cents`): la cassa della sera deve poter ricostruire cosa è entrato
 * e cosa è uscito, e una riga sparita non si ricostruisce.
 */
import type { Ctx } from '@/server/context'
import type { ScopedDb } from '@/server/repositories/scoped'
import { DomainError } from '@/domain/errors'

export type MetodoPagamento = 'CASH' | 'CARD' | 'TRANSFER' | 'ONLINE' | 'OTHER'

export type StatoPagamento = 'UNPAID' | 'PARTIAL' | 'PAID' | 'REFUNDED'

export type EsitoIncasso = {
  pagatoCents: number
  stato: StatoPagamento
  /** C-45 · quanto è stato incassato oltre il dovuto: si segnala, non si blocca */
  eccedenzaCents: number
}

/**
 * Lo stato si RICALCOLA dalla somma, non si incrementa.
 *
 * Un acconto, un rimborso e un saldo devono portare allo stesso risultato in
 * qualunque ordine siano arrivati. Uno stato incrementato dipenderebbe
 * dall'ordine, e a fine stagione nessuno saprebbe più dire quale sia giusto.
 */
export function statoDa(
  pagamenti: { amountCents: number }[], totaleCents: number,
): StatoPagamento {
  const somma = pagamenti.reduce((s, p) => s + p.amountCents, 0)
  const cRimborsi = pagamenti.some(p => p.amountCents < 0)
  if (somma <= 0) return cRimborsi ? 'REFUNDED' : 'UNPAID'
  return somma >= totaleCents ? 'PAID' : 'PARTIAL'
}

async function aggiorna(db: ScopedDb, reservationId: string, totaleCents: number) {
  const pagamenti = await db.payment.findMany({ where: { reservationId } })
  const righe = pagamenti as unknown as { amountCents: number }[]
  const pagatoCents = righe.reduce((s, p) => s + p.amountCents, 0)
  const stato = statoDa(righe, totaleCents)
  await db.reservation.updateById(reservationId, { paymentStatus: stato })
  return { pagatoCents, stato }
}

export async function registraIncasso(
  db: ScopedDb, ctx: Ctx,
  input: { reservationId: string; amountCents: number; method?: MetodoPagamento;
           notes?: string },
): Promise<EsitoIncasso> {
  if (input.amountCents <= 0)
    throw new DomainError('INVALID_RANGE', 'L’importo incassato dev’essere positivo.')

  const prenotazione = await db.reservation.byIdOrFail(input.reservationId)

  await db.payment.create({
    data: {
      reservationId: prenotazione.id,
      amountCents: input.amountCents,
      method: input.method ?? 'CASH',
      notes: input.notes ?? null,
      collectedById: ctx.kind === 'STAFF' ? ctx.userId : null,
    },
  })

  const { pagatoCents, stato } = await aggiorna(db, prenotazione.id, prenotazione.totalCents)
  // C-45 · l'eccedenza si segnala e basta. Bloccare l'incasso perché il
  // cliente ha dato dieci euro in più significa rifiutare i soldi in mano.
  return { pagatoCents, stato, eccedenzaCents: Math.max(0, pagatoCents - prenotazione.totalCents) }
}

export type EsitoRimborso = {
  rimborsatoCents: number
  /** quanto resta incassato dopo il rimborso */
  pagatoCents: number
  stato: StatoPagamento
}

/**
 * F6-19 · Registrare un rimborso.
 *
 * `C-48`: annullare una prenotazione pagata NON rimborsa da sola. I soldi
 * escono dalla cassa quando qualcuno li tira fuori, e quel gesto lo registra
 * una persona — altrimenti la cassa non torna e non si sa perché.
 */
export async function registraRimborso(
  db: ScopedDb, ctx: Ctx,
  input: { reservationId: string; amountCents: number; method?: MetodoPagamento;
           motivo: string },
): Promise<EsitoRimborso> {
  if (input.amountCents <= 0)
    throw new DomainError('INVALID_RANGE', 'L’importo da rimborsare dev’essere positivo.')
  if (!input.motivo.trim())
    throw new DomainError('INVALID_RANGE',
      'Serve il motivo del rimborso: è ciò che spiega la cassa a fine giornata.')

  const prenotazione = await db.reservation.byIdOrFail(input.reservationId)
  const pagamenti = await db.payment.findMany({ where: { reservationId: prenotazione.id } })
  const incassato = (pagamenti as any[]).reduce((s, p) => s + p.amountCents, 0)

  // C-46 · non si restituisce ciò che non è mai entrato.
  if (incassato <= 0)
    throw new DomainError('REFUND_ABOVE_LIMIT',
      'Su questa prenotazione non risulta nulla di incassato.')
  if (input.amountCents > incassato)
    throw new DomainError('REFUND_ABOVE_LIMIT',
      `Si può rimborsare al massimo ${(incassato / 100).toFixed(2)} €, cioè quanto è stato incassato.`,
      { incassatoCents: incassato })

  // ▲³ · l'operatore rimborsa fino a una soglia; oltre, serve un admin.
  const ruolo = ctx.kind === 'STAFF' ? ctx.actor : 'SEASONAL_CUSTOMER'
  if (ruolo === 'OPERATOR' && input.amountCents > ctx.settings.operatorMaxRefundCents)
    throw new DomainError('REFUND_ABOVE_LIMIT',
      `Puoi rimborsare fino a ${(ctx.settings.operatorMaxRefundCents / 100).toFixed(2)} €. ` +
      'Per una cifra più alta serve un amministratore.',
      { limiteCents: ctx.settings.operatorMaxRefundCents })

  await db.payment.create({
    data: {
      reservationId: prenotazione.id,
      amountCents: -input.amountCents,          // il segno È il rimborso
      method: input.method ?? 'CASH',
      notes: input.motivo.trim(),
      collectedById: ctx.kind === 'STAFF' ? ctx.userId : null,
    },
  })

  const { pagatoCents, stato } = await aggiorna(db, prenotazione.id, prenotazione.totalCents)
  return { rimborsatoCents: input.amountCents, pagatoCents, stato }
}
