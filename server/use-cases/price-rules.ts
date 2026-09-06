/**
 * F6-17 · Gestione del listino.
 *
 * Il criterio non è la flessibilità: sono 5–10 righe per stabilimento, e il
 * gestore deve poter guardare la lista e capire perché un prezzo è quello. Se
 * non ci riesce applicherà sempre lo sconto manuale e il listino diventerà
 * decorativo.
 */
import { useCase } from '@/server/use-case'
import { P } from '@/domain/auth/permissions'
import { DomainError } from '@/domain/errors'
import { audit } from '@/server/audit'

export type DatiRegola = {
  name: string
  priority: number
  priceCents: number
  zoneId?: string | null
  rowLabel?: string | null
  category?: string | null
  dateFrom?: Date | null
  dateTo?: Date | null
  weekdays?: number[]
  minDays?: number | null
  maxDays?: number | null
  customerType?: 'DAILY' | 'SEASONAL' | null
  active?: boolean
}

function valida(d: DatiRegola) {
  if (!d.name.trim()) throw new DomainError('INVALID_RANGE', 'La regola deve avere un nome.')
  if (d.priceCents < 0) throw new DomainError('INVALID_RANGE', 'Il prezzo non può essere negativo.')
  if (d.dateFrom && d.dateTo && d.dateFrom > d.dateTo)
    throw new DomainError('INVALID_RANGE', 'La data di fine precede quella di inizio.')
  if (d.minDays != null && d.maxDays != null && d.minDays > d.maxDays)
    throw new DomainError('INVALID_RANGE', 'La durata minima supera la massima.')
  for (const g of d.weekdays ?? [])
    if (g < 1 || g > 7) throw new DomainError('INVALID_RANGE', 'Giorno della settimana non valido.')
}

export const creaRegola = useCase<DatiRegola, { id: string }>({
  permission: P.PRICE_RULE_MANAGE,
  async run({ db, tx, ctx }, input) {
    valida(input)
    const stagione = await db.season.findFirst({ where: { status: 'ACTIVE' } })
    if (!stagione) throw new DomainError('NOT_FOUND', 'Nessuna stagione attiva.')

    const regola = await db.priceRule.create({
      data: {
        seasonId: stagione.id,
        name: input.name.trim(), priority: input.priority, priceCents: input.priceCents,
        zoneId: input.zoneId ?? null, rowLabel: input.rowLabel ?? null,
        category: input.category ?? null,
        dateFrom: input.dateFrom ?? null, dateTo: input.dateTo ?? null,
        weekdays: input.weekdays ?? [],
        minDays: input.minDays ?? null, maxDays: input.maxDays ?? null,
        customerType: input.customerType ?? null,
        active: input.active ?? true,
      },
    })
    await audit(tx, ctx, 'price.override',
      { type: 'price_rule', id: regola.id },
      { after: { nome: regola.name, prezzoCents: regola.priceCents, priorita: regola.priority } })
    return { id: regola.id }
  },
})

export const modificaRegola = useCase<{ id: string } & Partial<DatiRegola>, void>({
  permission: P.PRICE_RULE_MANAGE,
  async run({ db, tx, ctx }, input) {
    const prima = await db.priceRule.byIdOrFail(input.id)
    const dati = { ...prima, ...input } as DatiRegola
    valida(dati)

    const { id, ...campi } = input
    await db.priceRule.updateById(id, {
      ...campi,
      ...(campi.name ? { name: campi.name.trim() } : {}),
    })
    await audit(tx, ctx, 'price.override',
      { type: 'price_rule', id },
      { before: { prezzoCents: prima.priceCents, priorita: prima.priority, attiva: prima.active },
        after: { prezzoCents: dati.priceCents, priorita: dati.priority, attiva: dati.active } })
  },
})

/**
 * Le regole non si cancellano se hanno già prodotto prezzi: si disattivano.
 * Il prezzo è comunque congelato sulle prenotazioni, ma il nome della regola
 * resta nel dettaglio salvato, e cancellarla renderebbe illeggibile il perché
 * di un prezzo passato.
 */
export const disattivaRegola = useCase<{ id: string }, void>({
  permission: P.PRICE_RULE_MANAGE,
  async run({ db, tx, ctx }, input) {
    const regola = await db.priceRule.byIdOrFail(input.id)
    await db.priceRule.updateById(input.id, { active: false })
    await audit(tx, ctx, 'price.override',
      { type: 'price_rule', id: input.id },
      { before: { attiva: true }, after: { attiva: false, nome: regola.name } })
  },
})
