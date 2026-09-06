/**
 * F5-07 / F5-08 · Prenotare, liberare, spostare.
 *
 * Ogni funzione qui gira in transazione e passa da `useCase()`, che verifica
 * il permesso e traduce i vincoli del database in errori leggibili.
 *
 * Il prezzo viene dal listino (`F6-16`) e resta CONGELATO sulla riga
 * (RF-RES-04): modifiche successive al listino non lo alterano.
 */
import { useCase } from '@/server/use-case'
import { P } from '@/domain/auth/permissions'
import { DomainError } from '@/domain/errors'
import { audit } from '@/server/audit'
import { covers } from '@/domain/umbrella/state'
import { calcolaCredito, descrizioneCredito } from '@/domain/seasonal/credit'
import { calcolaPrezzo, verificaOverride, type RegolaPrezzo } from '@/domain/pricing/engine'
import { trovaOCreaCliente, type ClienteInput } from '@/server/use-cases/customers'
import { registraIncasso, type EsitoIncasso, type MetodoPagamento }
  from '@/server/use-cases/payments'

const iso = (d: Date) => d.toISOString().slice(0, 10)

const giorni = (from: Date, to: Date) =>
  Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1

export type CreateReservationInput = {
  umbrellaIds: string[]
  /** cliente già in anagrafica; in alternativa `cliente` per crearlo al volo */
  customerId?: string
  /**
   * Il cliente nuovo al banco, creato nella STESSA transazione (C-05).
   * Al banco è il caso normale: chi arriva in spiaggia non è già in
   * anagrafica, e farne prima una chiamata a sé significa tre andate e
   * ritorni sulla rete di uno stabilimento — e un cliente orfano ogni volta
   * che la seconda fallisce.
   */
  cliente?: ClienteInput
  /** «prenotato e pagato» è un gesto solo: l'incasso entra nella transazione */
  incassa?: { method?: MetodoPagamento }
  from: Date
  to: Date
  peopleCount?: number
  source?: 'PHONE' | 'WHATSAPP' | 'RECEPTION' | 'WEB' | 'OTHER'
  notes?: string
  /** F6-18 · scostamento manuale dal listino, con il motivo */
  override?: { totaleCents: number; motivo: string }
}

export type EsitoPrenotazione = {
  id: string
  totalCents: number
  /** credito maturato allo stagionale, quando si è venduto un posto liberato */
  creditoMaturatoCents: number
  /** quanto avrebbe detto il listino, se è stato applicato uno scostamento */
  totaleListinoCents: number
  /** il cliente usato: creato ora o ritrovato dal telefono */
  customerId: string
  customerName: string
  /** presente solo se si è incassato contestualmente */
  incasso?: EsitoIncasso
}

export const createReservation = useCase<CreateReservationInput, EsitoPrenotazione>({
  permission: P.RESERVATION_CREATE,
  async run({ db, tx, ctx }, input) {
    if (input.umbrellaIds.length === 0)
      throw new DomainError('INVALID_RANGE', 'Nessun ombrellone selezionato.')
    if (input.from.getTime() > input.to.getTime())
      throw new DomainError('INVALID_RANGE', 'La data di fine precede quella di inizio.')

    if (!input.customerId && !input.cliente)
      throw new DomainError('NOT_FOUND', 'Manca il cliente della prenotazione.')

    const cliente = input.customerId
      ? await db.customer.byIdOrFail(input.customerId)
      : (await trovaOCreaCliente(db, input.cliente!)).cliente

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
    const assenzaPerOmbrellone = new Map<string, any>()
    const contrattoPerOmbrellone = new Map<string, any>()
    for (const c of contratti as any[]) {
      const a = (assenze as any[]).find(x => x.seasonalContractId === c.id)
      if (!a) {
        throw new DomainError('NO_ACTIVE_ABSENCE',
          `L'ombrellone è riservato a un cliente stagionale per quel periodo.`,
          { umbrellaId: c.umbrellaId })
      }
      assenzaPerOmbrellone.set(c.umbrellaId, a)
      contrattoPerOmbrellone.set(c.umbrellaId, c)
    }

    // ── prezzo dal listino, giorno per giorno ──────────────────────────────
    const regole = await db.priceRule.findMany({
      where: { seasonId: stagione.id, active: true },
    })
    const preventivi = new Map<string, ReturnType<typeof calcolaPrezzo>>()
    for (const u of umbrellas as any[]) {
      preventivi.set(u.id, calcolaPrezzo({
        ombrellone: {
          id: u.id, visibleNumber: u.visibleNumber, zoneId: u.zoneId,
          rowLabel: u.rowLabel, category: u.category, basePriceCents: u.basePriceCents,
        },
        dal: input.from, al: input.to,
        regole: regole as unknown as RegolaPrezzo[],
      }))
    }
    const totaleListino = [...preventivi.values()].reduce((s, p) => s + p.totaleCents, 0)

    // F6-18 · lo scostamento passa dalla soglia del ruolo (docs/04 ▲³).
    let totale = totaleListino
    if (input.override) {
      const esito = verificaOverride({
        prezzoListinoCents: totaleListino,
        prezzoApplicatoCents: input.override.totaleCents,
        ruolo: ctx.kind === 'STAFF' ? ctx.actor : 'OPERATOR',
        scontoMassimoPercento: ctx.settings.operatorDiscountPercent,
      })
      if (!esito.ammesso)
        throw new DomainError('DISCOUNT_ABOVE_LIMIT',
          `Puoi scendere al massimo a ${(esito.limiteCents / 100).toFixed(2)} €. Per meno serve un amministratore.`,
          { limiteCents: esito.limiteCents, listinoCents: totaleListino })
      totale = input.override.totaleCents
    }
    /** Lo scostamento si distribuisce in proporzione sulle righe. */
    const quota = totaleListino > 0 ? totale / totaleListino : 1

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
    let creditoMaturatoCents = 0

    for (const u of umbrellas as any[]) {
      const assenza = assenzaPerOmbrellone.get(u.id) ?? null
      const preventivo = preventivi.get(u.id)!
      const prezzoRiga = Math.round(preventivo.totaleCents * quota)

      await db.reservationItem.create({
        data: {
          reservationId: prenotazione.id,
          umbrellaId: u.id,
          startDate: input.from,
          endDate: input.to,
          status: 'CONFIRMED',
          priceCents: prezzoRiga,
          // Il dettaglio serve a giustificare il prezzo al cliente che chiede
          // "perché costa così": senza, resta la parola dell'operatore.
          priceBreakdown: {
            righe: preventivo.righe,
            listinoCents: preventivo.totaleCents,
            ...(input.override ? { scostamento: input.override.motivo } : {}),
          } as never,
          isTemporarySlot: assenza !== null,
          seasonalAbsenceId: assenza?.id ?? null,
        },
      })

      // F6-12 · il credito matura QUI, nella stessa transazione della vendita:
      // se una delle due fallisce non deve restare traccia dell'altra.
      if (!assenza) continue
      const contratto = contrattoPerOmbrellone.get(u.id)
      const maturati = await db.creditTransaction.findMany({
        where: { seasonalContractId: contratto.id, kind: 'EARNED' },
      })
      const giaMaturatoCents = (maturati as any[]).reduce((s, c) => s + c.amountCents, 0)

      const esito = calcolaCredito({
        prezzoVenditaCents: prezzoRiga,
        giaMaturatoCents,
        assenzaTardiva: assenza.isLate,
        regole: ctx.settings,
      })
      if (esito.importoCents <= 0) continue

      await db.creditTransaction.create({
        data: {
          seasonalContractId: contratto.id,
          amountCents: esito.importoCents,
          unit: 'EUR',
          kind: 'EARNED',
          absenceDate: input.from,
          sourceReservationId: prenotazione.id,
          seasonalAbsenceId: assenza.id,
          description: descrizioneCredito(iso(input.from), iso(input.to), esito.motivo),
          createdById: ctx.kind === 'STAFF' ? ctx.userId : null,
        },
      })
      await tx.seasonalContract.update({
        where: { id: contratto.id },
        data: { creditBalanceCents: { increment: esito.importoCents } },
      })
      creditoMaturatoCents += esito.importoCents

      await audit(tx, ctx, 'credit.earn',
        { type: 'seasonal_contract', id: contratto.id },
        { after: { importoCents: esito.importoCents, motivo: esito.motivo,
                   prenotazione: prenotazione.id } })
    }

    await audit(tx, ctx,
      assenzaPerOmbrellone.size > 0 ? 'reservation.create.temporary' : 'reservation.create',
      { type: 'reservation', id: prenotazione.id },
      { after: { umbrelle: (umbrellas as any[]).map(u => u.visibleNumber),
                 dal: iso(input.from), al: iso(input.to), totaleCents: totale } })

    // Ogni scostamento lascia traccia con il motivo: serve a ricostruire
    // perché quel giorno si è pagato meno (docs/04 ▲³).
    if (input.override) {
      await audit(tx, ctx, 'price.override',
        { type: 'reservation', id: prenotazione.id },
        { before: { totaleCents: totaleListino },
          after: { totaleCents: totale, motivo: input.override.motivo } })
    }

    // L'incasso chiude la transazione: o esistono entrambi, o nessuno dei due.
    const incasso = input.incassa
      ? await registraIncasso(db, ctx, {
          reservationId: prenotazione.id, amountCents: totale,
          method: input.incassa.method,
        })
      : undefined

    return { id: prenotazione.id, totalCents: totale, creditoMaturatoCents,
             totaleListinoCents: totaleListino,
             customerId: cliente.id,
             customerName: `${cliente.firstName} ${cliente.lastName}`.trim(),
             ...(incasso ? { incasso } : {}) }
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

    // T-14 · se la rivendita salta, il credito già riconosciuto va stornato:
    // non è stato incassato nulla (K-02). Si storna con una riga nuova, non
    // cancellando quella vecchia — il registro è append-only (K-05).
    const maturati = await db.creditTransaction.findMany({
      where: { sourceReservationId: input.reservationId, kind: 'EARNED' },
    })
    for (const c of maturati as any[]) {
      await db.creditTransaction.create({
        data: {
          seasonalContractId: c.seasonalContractId,
          amountCents: -c.amountCents,
          unit: c.unit,
          kind: 'REVERSED',
          absenceDate: c.absenceDate,
          sourceReservationId: input.reservationId,
          seasonalAbsenceId: c.seasonalAbsenceId,
          description: `Storno: la prenotazione è stata annullata`,
          createdById: ctx.kind === 'STAFF' ? ctx.userId : null,
        },
      })
      await tx.seasonalContract.update({
        where: { id: c.seasonalContractId },
        data: { creditBalanceCents: { decrement: c.amountCents } },
      })
      await audit(tx, ctx, 'credit.reverse',
        { type: 'seasonal_contract', id: c.seasonalContractId },
        { before: { importoCents: c.amountCents }, after: { stornato: true } })
    }

    await audit(tx, ctx, 'reservation.cancel',
      { type: 'reservation', id: input.reservationId },
      { before: { status: prima.status },
        after: { status: 'CANCELLED', motivo: input.reason ?? null,
                 creditiStornati: (maturati as any[]).length } })
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
