/**
 * F5-07 / F5-08 · Prenotare, liberare, spostare.
 *
 * Ogni funzione qui gira in transazione e passa da `useCase()`, che verifica
 * il permesso e traduce i vincoli del database in errori leggibili.
 *
 * Il prezzo è provvisorio: tariffa base × giorni. Il motore di listino vero è
 * `F6-16`; quando arriva, cambia solo `prezzoProvvisorio()`. Il prezzo resta
 * comunque CONGELATO sulla riga (RF-RES-04), quindi le prenotazioni create ora
 * non si alterano quando il listino esisterà.
 */
import { useCase } from '@/server/use-case'
import { P } from '@/domain/auth/permissions'
import { DomainError } from '@/domain/errors'
import { audit } from '@/server/audit'
import { covers } from '@/domain/umbrella/state'

const giorni = (from: Date, to: Date) =>
  Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1

const prezzoProvvisorio = (basePriceCents: number | null, from: Date, to: Date) =>
  (basePriceCents ?? 0) * giorni(from, to)

export type CreateReservationInput = {
  umbrellaIds: string[]
  customerId: string
  from: Date
  to: Date
  peopleCount?: number
  source?: 'PHONE' | 'WHATSAPP' | 'RECEPTION' | 'WEB' | 'OTHER'
  notes?: string
}

export const createReservation = useCase<CreateReservationInput, { id: string; totalCents: number }>({
  permission: P.RESERVATION_CREATE,
  async run({ db, tx, ctx }, input) {
    if (input.umbrellaIds.length === 0)
      throw new DomainError('INVALID_RANGE', 'Nessun ombrellone selezionato.')
    if (input.from.getTime() > input.to.getTime())
      throw new DomainError('INVALID_RANGE', 'La data di fine precede quella di inizio.')

    const cliente = await db.customer.byIdOrFail(input.customerId)

    const stagione = await db.season.findFirst({ where: { status: 'ACTIVE' } })
    if (!stagione)
      throw new DomainError('NOT_FOUND', 'Nessuna stagione attiva per questo stabilimento.')
    if (input.from < stagione.startDate || input.to > stagione.endDate)
      throw new DomainError('INVALID_RANGE',
        'Il periodo richiesto è fuori dalla stagione.', {
          seasonFrom: stagione.startDate, seasonTo: stagione.endDate })

    const umbrellas = await db.umbrella.findMany({ where: { id: { in: input.umbrellaIds } } })
    if (umbrellas.length !== input.umbrellaIds.length)
      throw new DomainError('NOT_FOUND', 'Uno degli ombrelloni non esiste.')

    // `blocked` batte tutto: un ombrellone rotto non si vende (docs/03 §6).
    const bloccato = (umbrellas as any[]).find(u =>
      u.blocked && (!u.blockedUntil || covers(input.from, input.to, u.blockedUntil) || u.blockedUntil >= input.from))
    if (bloccato)
      throw new DomainError('UMBRELLA_BLOCKED',
        `L'ombrellone ${bloccato.visibleNumber} non è utilizzabile: ${bloccato.blockedReason ?? 'bloccato'}.`,
        { umbrellaId: bloccato.id })

    // Un posto stagionale è vendibile solo dentro una finestra di assenza.
    // Qui lo si marca; il credito allo stagionale è `F6-12`.
    const contratti = await db.seasonalContract.findMany({
      where: { status: 'ACTIVE', umbrellaId: { in: input.umbrellaIds },
               startDate: { lte: input.to }, endDate: { gte: input.from } },
    })
    const assenze = contratti.length === 0 ? [] : await db.seasonalAbsence.findMany({
      where: { status: 'ACTIVE',
               seasonalContractId: { in: (contratti as any[]).map(c => c.id) },
               startDate: { lte: input.from }, endDate: { gte: input.to } },
    })
    const assenzaPerOmbrellone = new Map<string, string>()
    for (const c of contratti as any[]) {
      const a = (assenze as any[]).find(x => x.seasonalContractId === c.id)
      if (!a) {
        throw new DomainError('NO_ACTIVE_ABSENCE',
          `L'ombrellone è riservato a un cliente stagionale per quel periodo.`,
          { umbrellaId: c.umbrellaId })
      }
      assenzaPerOmbrellone.set(c.umbrellaId, a.id)
    }

    const totale = (umbrellas as any[])
      .reduce((s, u) => s + prezzoProvvisorio(u.basePriceCents, input.from, input.to), 0)

    const prenotazione = await db.reservation.create({
      data: {
        seasonId: stagione.id,
        customerId: cliente.id,
        peopleCount: input.peopleCount ?? 2,
        source: input.source ?? 'RECEPTION',
        status: 'CONFIRMED',
        totalCents: totale,
        notes: input.notes ?? null,
        createdById: ctx.kind === 'STAFF' ? ctx.userId : null,
      },
    })

    // Gli item si creano separatamente: `beachClubId` fa parte della relazione
    // composta verso `reservation` e Prisma lo esclude dal create annidato (D-16).
    for (const u of umbrellas as any[]) {
      const assenzaId = assenzaPerOmbrellone.get(u.id) ?? null
      await db.reservationItem.create({
        data: {
          reservationId: prenotazione.id,
          umbrellaId: u.id,
          startDate: input.from,
          endDate: input.to,
          status: 'CONFIRMED',
          priceCents: prezzoProvvisorio(u.basePriceCents, input.from, input.to),
          priceBreakdown: [{ giorni: giorni(input.from, input.to), tariffaCents: u.basePriceCents ?? 0 }],
          isTemporarySlot: assenzaId !== null,
          seasonalAbsenceId: assenzaId,
        },
      })
    }

    await audit(tx, ctx,
      assenzaPerOmbrellone.size > 0 ? 'reservation.create.temporary' : 'reservation.create',
      { type: 'reservation', id: prenotazione.id },
      { after: { umbrelle: (umbrellas as any[]).map(u => u.visibleNumber),
                 dal: input.from, al: input.to, totaleCents: totale } })

    return { id: prenotazione.id, totalCents: totale }
  },
})

/**
 * F5-08 · Liberare un ombrellone.
 *
 * Annullare la TESTATA, non le righe: il trigger del database propaga lo stato
 * agli item, e il vincolo di esclusione smette di considerarli. Toccare le
 * righe a mano aprirebbe una finestra in cui i due stati divergono.
 */
export const cancelReservation = useCase<{ reservationId: string; reason?: string }, void>({
  permission: P.RESERVATION_CANCEL,
  async run({ db, tx, ctx }, input) {
    const prima = await db.reservation.byIdOrFail(input.reservationId)
    if (prima.status === 'CANCELLED') return   // idempotente: annullare due volte non è un errore

    await db.reservation.updateById(input.reservationId,
      { status: 'CANCELLED', cancelledAt: new Date() })

    await audit(tx, ctx, 'reservation.cancel',
      { type: 'reservation', id: input.reservationId },
      { before: { status: prima.status }, after: { status: 'CANCELLED', motivo: input.reason ?? null } })
  },
})

/**
 * Spostare un cliente su un altro ombrellone.
 *
 * UN SOLO UPDATE, mai "cancella e ricrea" (C-07): la cancellazione seguita da
 * un inserimento apre una finestra — anche di millisecondi — in cui
 * l'ombrellone di origine risulta libero e un'altra transazione può venderlo.
 */
export const moveReservationItem = useCase<
  { itemId: string; toUmbrellaId: string }, void
>({
  permission: P.RESERVATION_UPDATE,
  async run({ db, tx, ctx }, input) {
    const item = await db.reservationItem.byIdOrFail(input.itemId)
    const destinazione = await db.umbrella.byIdOrFail(input.toUmbrellaId)
    if (destinazione.blocked)
      throw new DomainError('UMBRELLA_BLOCKED', `L'ombrellone ${destinazione.visibleNumber} non è utilizzabile.`)

    await db.reservationItem.updateById(input.itemId, { umbrellaId: input.toUmbrellaId })

    await audit(tx, ctx, 'reservation.move',
      { type: 'reservation_item', id: input.itemId },
      { before: { umbrellaId: item.umbrellaId }, after: { umbrellaId: input.toUmbrellaId } })
  },
})

export const blockUmbrella = useCase<
  { umbrellaId: string; reason: string; until?: Date | null }, void
>({
  permission: P.UMBRELLA_BLOCK,
  async run({ db, tx, ctx }, input) {
    const prima = await db.umbrella.byIdOrFail(input.umbrellaId)

    // docs/04 ▲¹: l'operatore blocca per un guasto del giorno, non per sempre.
    // Un blocco permanente è configurazione, quindi da admin.
    if (ctx.kind === 'STAFF' && ctx.actor === 'OPERATOR') {
      const limite = new Date(Date.now() + 7 * 86_400_000)
      if (!input.until || input.until > limite)
        throw new DomainError('FORBIDDEN',
          'Un operatore può bloccare un ombrellone per un massimo di 7 giorni. Per un blocco permanente serve un amministratore.')
    }

    await db.umbrella.updateById(input.umbrellaId,
      { blocked: true, blockedReason: input.reason, blockedUntil: input.until ?? null })

    await audit(tx, ctx, 'umbrella.block',
      { type: 'umbrella', id: input.umbrellaId },
      { before: { blocked: prima.blocked }, after: { blocked: true, motivo: input.reason } })
  },
})
