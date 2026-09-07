/**
 * F6-07 / F6-08 · Assenze stagionali — il cuore del prodotto.
 *
 * Tre garanzie, e sono tutto ciò che questo file protegge (docs/08 §1):
 *
 *  1. Il posto torna SEMPRE allo stagionale, da solo. Se ha il dubbio di
 *     perderlo, non dichiarerà mai un'assenza e la funzione muore.
 *  2. Non si vende due volte lo stesso giorno, mai.
 *  3. Il credito matura solo su ciò che è stato davvero venduto.
 */
import { useCase } from '@/server/use-case'
import { P } from '@/domain/auth/permissions'
import { DomainError } from '@/domain/errors'
import { audit } from '@/server/audit'
import { notifica } from '@/server/notifications'
import { fuoriTempo } from '@/domain/seasonal/cutoff'
import { sottraiGiorni, giorniVenduti, giornoUtc, giorniInclusi }
  from '@/domain/seasonal/intervals'

const iso = (d: Date) => d.toISOString().slice(0, 10)

export type DichiaraAssenzaInput = {
  /** omesso per il cliente: si usa il contratto della sessione */
  contractId?: string
  from: Date
  to: Date
}

export const declareAbsence = useCase<DichiaraAssenzaInput, {
  id: string; from: string; to: string; isLate: boolean; giorni: number
}>({
  // Lo staff dichiara per chiunque, il cliente solo la propria: il vincolo
  // "solo la propria" è applicato sotto, leggendo il contratto dal contesto.
  permission: [P.ABSENCE_DECLARE, P.ABSENCE_DECLARE_OWN],
  async run({ db, tx, ctx }, input) {
    const contractId = ctx.kind === 'CUSTOMER' ? ctx.seasonalContractId : input.contractId
    if (!contractId) throw new DomainError('CONTRACT_NOT_FOUND', 'Contratto non indicato.')

    const contratto = await db.seasonalContract.byIdOrFail(contractId)
    if (contratto.status !== 'ACTIVE')                                        // A-01
      throw new DomainError('CONTRACT_NOT_FOUND', 'Il contratto stagionale non è attivo.')

    const da = giornoUtc(input.from), a = giornoUtc(input.to)
    if (da.getTime() > a.getTime())                                           // A-02
      throw new DomainError('INVALID_RANGE', 'La data di fine precede quella di inizio.')

    const oggi = giornoUtc(new Date())
    if (da.getTime() < oggi.getTime())                                        // A-04
      throw new DomainError('ABSENCE_IN_THE_PAST',
        'Non si può comunicare un’assenza per un giorno già passato.')

    if (da < contratto.startDate || a > contratto.endDate)                    // A-02
      throw new DomainError('ABSENCE_OUTSIDE_CONTRACT',
        'Le date sono fuori dal periodo del tuo contratto stagionale.',
        { contrattoDal: iso(contratto.startDate), contrattoAl: iso(contratto.endDate) })

    // A-07 · una prenotazione dello stagionale stesso su quei giorni va tolta
    // prima: altrimenti resterebbe un posto occupato dentro una finestra che
    // il gestore vede come vendibile.
    const suoi = await db.reservationItem.findMany({
      where: { umbrellaId: contratto.umbrellaId, status: { in: ['CONFIRMED', 'CHECKED_IN'] },
               startDate: { lte: a }, endDate: { gte: da } },
    })
    if ((suoi as any[]).length > 0)
      throw new DomainError('UMBRELLA_NOT_AVAILABLE',
        'Su quei giorni risulta già una prenotazione su questo ombrellone. Va annullata prima.',
        { prenotazioni: (suoi as any[]).map(i => i.reservationId) })

    const isLate = fuoriTempo(new Date(), da, ctx.settings, ctx.timezone)     // A-05

    let assenza
    try {
      assenza = await db.seasonalAbsence.create({
        data: {
          seasonalContractId: contratto.id, startDate: da, endDate: a,
          declaredAt: new Date(),
          declaredBy: ctx.kind === 'CUSTOMER' ? 'CUSTOMER' : 'STAFF',
          isLate, status: 'ACTIVE',
        },
      })
    } catch (e) {
      // A-03 · il vincolo del database regge il doppio tap del cliente: senza,
      // due assenze sovrapposte raddoppierebbero il credito.
      throw e
    }

    await audit(tx, ctx, 'absence.declare',
      { type: 'seasonal_absence', id: assenza.id },
      { after: { dal: iso(da), al: iso(a), tardiva: isLate } })

    // F6-29 · si avvisa solo quando è il CLIENTE a dichiarare: se l'ha
    // registrata l'operatore, il gestore lo sa già — era lui al telefono.
    if (ctx.kind === 'CUSTOMER') {
      const cliente = await db.customer.byId(contratto.customerId)
      const ombrellone = await db.umbrella.byId(contratto.umbrellaId)
      await notifica({
        tipo: 'ASSENZA_DICHIARATA',
        beachClubId: ctx.beachClubId,
        seasonalContractId: contratto.id,
        cliente: cliente ? `${cliente.firstName} ${cliente.lastName}`.trim() : 'Uno stagionale',
        ombrellone: ombrellone?.visibleNumber ?? '—',
        dal: iso(da), al: iso(a), tardiva: isLate,
      })
    }

    return { id: assenza.id, from: iso(da), to: iso(a), isLate,
             giorni: giorniInclusi({ da, a }) }
  },
})

export type EsitoAnnullamento =
  | { esito: 'COMPLETO' }
  | { esito: 'PARZIALE'; giorniVenduti: string[]; giorniRipristinati: string[] }

/**
 * F6-08 · Annullare un'assenza.
 *
 * Se qualche giorno è già stato venduto vale `D-01`: chi ha pagato tiene il
 * posto. Lo stagionale riprende TUTTI gli altri giorni.
 *
 * NOTA — correzione di `docs/08` §6.2. Il documento prescriveva di annullare
 * l'assenza e RICREARE come attivi i frammenti non venduti. È sbagliato, e il
 * test T-12 lo ha dimostrato: un'assenza attiva significa "posto vendibile",
 * quindi ricreare i frammenti lascerebbe liberati proprio i giorni che il
 * cliente sta chiedendo di riprendersi — l'opposto di annullare. Il documento
 * si contraddiceva da solo, perché a parole diceva «10, 11, 13, 14, 15 →
 * torna suo».
 *
 * Il comportamento corretto è più semplice: si annulla l'assenza per intero.
 * La vendita del giorno 12 regge da sé, perché `umbrellaState` guarda prima le
 * prenotazioni e poi il contratto (RD-01): quel giorno resta OCCUPATO
 * qualunque sia lo stato dell'assenza. Il credito già maturato resta, perché
 * la vendita è davvero avvenuta (K-05).
 *
 * Lo spezzamento dell'intervallo resta utile per un'operazione diversa — il
 * cliente che vuole annullare solo una PARTE dell'assenza — che non è nell'MVP.
 */
export const cancelAbsence = useCase<{ absenceId: string }, EsitoAnnullamento>({
  permission: [P.ABSENCE_CANCEL, P.ABSENCE_CANCEL_OWN],
  async run({ db, tx, ctx }, input) {
    const assenza = await db.seasonalAbsence.byIdOrFail(input.absenceId)
    if (assenza.status !== 'ACTIVE')
      throw new DomainError('NOT_FOUND', 'Questa assenza è già stata annullata.')

    const contratto = await db.seasonalContract.byIdOrFail(assenza.seasonalContractId)

    // Il cliente può annullare solo la PROPRIA assenza.
    if (ctx.kind === 'CUSTOMER' && ctx.seasonalContractId !== contratto.id)
      throw new DomainError('NOT_FOUND', 'Assenza non trovata.')

    const vendite = await db.reservationItem.findMany({
      where: { seasonalAbsenceId: assenza.id, status: { in: ['CONFIRMED', 'CHECKED_IN'] } },
    })
    const intervallo = { da: assenza.startDate, a: assenza.endDate }
    const venduti = giorniVenduti(intervallo,
      (vendite as any[]).map(v => ({ da: v.startDate, a: v.endDate })))

    if (venduti.length === 0) {
      await db.seasonalAbsence.updateById(assenza.id,
        { status: 'CANCELLED', cancelledAt: new Date() })
      await audit(tx, ctx, 'absence.cancel.full',
        { type: 'seasonal_absence', id: assenza.id },
        { before: { dal: iso(intervallo.da), al: iso(intervallo.a) }, after: { status: 'CANCELLED' } })
      return { esito: 'COMPLETO' }
    }

    const liberi = sottraiGiorni(intervallo, venduti)
    if (liberi.length === 0)
      throw new DomainError('ABSENCE_FULLY_SOLD',
        'Tutti i giorni di questa assenza sono già stati assegnati ad altri clienti.',
        { giorniVenduti: venduti.map(iso) })

    await db.seasonalAbsence.updateById(assenza.id,
      { status: 'CANCELLED', cancelledAt: new Date() })

    await audit(tx, ctx, 'absence.cancel.partial',
      { type: 'seasonal_absence', id: assenza.id },
      { before: { dal: iso(intervallo.da), al: iso(intervallo.a) },
        after: { status: 'CANCELLED', venduti: venduti.map(iso),
                 ripristinati: liberi.map(f => `${iso(f.da)}–${iso(f.a)}`) } })

    // Il posto NON torna allo stagionale nei giorni venduti, ma torna in tutti
    // gli altri: è questa la differenza fra un rifiuto e una soluzione.
    return {
      esito: 'PARZIALE',
      giorniVenduti: venduti.map(iso),
      giorniRipristinati: liberi.flatMap(f =>
        Array.from({ length: giorniInclusi(f) },
          (_, k) => iso(new Date(f.da.getTime() + k * 86_400_000)))),
    }
  },
})
