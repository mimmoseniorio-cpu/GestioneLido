/**
 * Registrare un incasso (F6-19).
 *
 * Estratto dalla rotta perché la prenotazione al banco lo fa nella propria
 * transazione: «prenotato e pagato» è UN gesto solo per chi sta all'ombrellone,
 * e deve esserlo anche per il database. Una prenotazione confermata con
 * l'incasso perso per strada è peggio di un errore: nessuno se ne accorge
 * finché non si chiude la cassa la sera.
 */
import type { Ctx } from '@/server/context'
import type { ScopedDb } from '@/server/repositories/scoped'

export type EsitoIncasso = { pagatoCents: number; stato: 'UNPAID' | 'PARTIAL' | 'PAID' }

export async function registraIncasso(
  db: ScopedDb, ctx: Ctx,
  input: { reservationId: string; amountCents: number;
           method?: 'CASH' | 'CARD' | 'TRANSFER' | 'ONLINE' | 'OTHER' },
): Promise<EsitoIncasso> {
  const prenotazione = await db.reservation.byIdOrFail(input.reservationId)

  await db.payment.create({
    data: {
      reservationId: prenotazione.id,
      amountCents: input.amountCents,
      method: input.method ?? 'CASH',
      collectedById: ctx.kind === 'STAFF' ? ctx.userId : null,
    },
  })

  // Lo stato si ricalcola dalla somma dei pagamenti, non si incrementa: un
  // acconto, uno storno e un saldo devono portare allo stesso risultato in
  // qualunque ordine siano arrivati.
  const pagamenti = await db.payment.findMany({ where: { reservationId: prenotazione.id } })
  const pagatoCents = (pagamenti as any[]).reduce((s, p) => s + p.amountCents, 0)
  const stato = pagatoCents <= 0 ? 'UNPAID'
    : pagatoCents >= prenotazione.totalCents ? 'PAID' : 'PARTIAL'

  await db.reservation.updateById(prenotazione.id, { paymentStatus: stato })
  return { pagatoCents, stato }
}
