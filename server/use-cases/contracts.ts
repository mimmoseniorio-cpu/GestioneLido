/**
 * F6-05 · Contratti stagionali.
 *
 * Senza questi, gli stagionali esistono solo nel seed: il gestore non
 * potrebbe usare la funzione che vale il prodotto.
 *
 * Il caso realistico è quello scomodo (C-16): il gestore inserisce i contratti
 * a stagione già iniziata, quando su quegli ombrelloni ci sono già prenotazioni
 * giornaliere future. Rifiutare senza spiegare lo farebbe tornare al quaderno.
 */
import { useCase } from '@/server/use-case'
import { P } from '@/domain/auth/permissions'
import { DomainError } from '@/domain/errors'
import { audit } from '@/server/audit'
import { generaToken } from '@/server/auth/magic-link'

const iso = (d: Date) => d.toISOString().slice(0, 10)

export type NuovoContratto = {
  customerId: string
  umbrellaId: string
  dal: Date
  al: Date
  prezzoCents: number
}

export const creaContratto = useCase<NuovoContratto, { id: string; token: string }>({
  permission: P.CONTRACT_MANAGE,
  async run({ db, tx, ctx }, input) {
    if (input.dal.getTime() > input.al.getTime())
      throw new DomainError('INVALID_RANGE', 'La data di fine precede quella di inizio.')
    if (input.prezzoCents < 0)
      throw new DomainError('INVALID_RANGE', 'Il prezzo non può essere negativo.')

    const stagione = await db.season.findFirst({ where: { status: 'ACTIVE' } })
    if (!stagione) throw new DomainError('NOT_FOUND', 'Nessuna stagione attiva.')
    if (input.dal < stagione.startDate || input.al > stagione.endDate)
      throw new DomainError('INVALID_RANGE',
        'Il periodo è fuori dalla stagione.',
        { stagioneDal: iso(stagione.startDate), stagioneAl: iso(stagione.endDate) })

    const cliente = await db.customer.byIdOrFail(input.customerId)
    const ombrellone = await db.umbrella.byIdOrFail(input.umbrellaId)
    if (ombrellone.blocked)
      throw new DomainError('UMBRELLA_BLOCKED',
        `L'ombrellone ${ombrellone.visibleNumber} è fuori servizio.`)

    // C-16 · dire QUALI prenotazioni sono in conflitto, non solo che c'è un
    // conflitto: il gestore deve poter decidere se spostarle.
    const inConflitto = await db.reservationItem.findMany({
      where: { umbrellaId: ombrellone.id, status: { in: ['CONFIRMED', 'CHECKED_IN'] },
               startDate: { lte: input.al }, endDate: { gte: input.dal } },
      include: { reservation: { include: { customer: true } } },
    })
    if ((inConflitto as any[]).length > 0)
      throw new DomainError('UMBRELLA_NOT_AVAILABLE',
        `Su questo ombrellone ci sono già ${(inConflitto as any[]).length} prenotazioni nel periodo: vanno spostate prima.`,
        { prenotazioni: (inConflitto as any[]).map(i => ({
            id: i.reservationId,
            cliente: `${i.reservation.customer.firstName} ${i.reservation.customer.lastName}`,
            dal: iso(i.startDate), al: iso(i.endDate),
          })) })

    const { token, hash } = generaToken()
    // Due contratti attivi sovrapposti li respinge il vincolo del database
    // (`seasonal_contract_no_overlap`); `withDomainErrors` lo traduce in
    // CONTRACT_OVERLAP. Il controllo qui sopra riguarda le sole prenotazioni
    // giornaliere, che il vincolo non vede.
    const contratto = await db.seasonalContract.create({
      data: {
        seasonId: stagione.id, customerId: cliente.id, umbrellaId: ombrellone.id,
        startDate: input.dal, endDate: input.al, priceCents: input.prezzoCents,
        status: 'ACTIVE', accessTokenHash: hash,
      },
    })

    await db.customer.updateById(cliente.id, { isSeasonal: true })
    await audit(tx, ctx, 'contract.create',
      { type: 'seasonal_contract', id: contratto.id },
      { after: { ombrellone: ombrellone.visibleNumber, dal: iso(input.dal), al: iso(input.al),
                 prezzoCents: input.prezzoCents } })

    return { id: contratto.id, token }
  },
})

export const annullaContratto = useCase<{ id: string; motivo?: string }, void>({
  permission: P.CONTRACT_MANAGE,
  async run({ db, tx, ctx }, input) {
    const contratto = await db.seasonalContract.byIdOrFail(input.id)
    if (contratto.status !== 'ACTIVE') return   // idempotente

    await db.seasonalContract.updateById(input.id, { status: 'CANCELLED' })

    // C-17 · le vendite temporanee già fatte restano valide: chi ha pagato ha
    // pagato. I giorni futuri tornano semplicemente liberi.
    await db.seasonalAbsence.updateMany({
      where: { seasonalContractId: input.id, status: 'ACTIVE' },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    })

    // Il cliente resta stagionale solo se ha altri contratti attivi.
    const altri = await db.seasonalContract.count({
      where: { customerId: contratto.customerId, status: 'ACTIVE' } })
    if (altri === 0) await db.customer.updateById(contratto.customerId, { isSeasonal: false })

    await audit(tx, ctx, 'contract.cancel',
      { type: 'seasonal_contract', id: input.id },
      { before: { status: 'ACTIVE' }, after: { status: 'CANCELLED', motivo: input.motivo ?? null } })
  },
})
