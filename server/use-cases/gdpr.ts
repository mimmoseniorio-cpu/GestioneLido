/**
 * F6-33 · GDPR — NF-05.
 *
 * Due obblighi concreti: poter cancellare i dati di un cliente e poterglieli
 * consegnare.
 *
 * La cancellazione è un'ANONIMIZZAZIONE, non un DELETE. Cancellare fisicamente
 * il cliente romperebbe lo storico contabile e l'audit, e cancellerebbe anche
 * l'informazione che serve allo stabilimento per difendersi in una
 * contestazione. Si tolgono i dati personali e si tiene il fatto che una
 * prenotazione c'è stata (docs/02 §10).
 */
import { useCase } from '@/server/use-case'
import { P } from '@/domain/auth/permissions'
import { DomainError } from '@/domain/errors'
import { audit } from '@/server/audit'

const iso = (d: Date) => d.toISOString().slice(0, 10)

export const anonimizzaCliente = useCase<{ customerId: string }, { etichetta: string }>({
  permission: P.CUSTOMER_ANONYMIZE,
  async run({ db, tx, ctx }, input) {
    const c = await db.customer.byIdOrFail(input.customerId)
    if (c.anonymizedAt)
      throw new DomainError('NOT_FOUND', 'Questo cliente è già stato anonimizzato.')

    // Un contratto stagionale attivo va chiuso prima: anonimizzare un cliente
    // che ha ancora un ombrellone assegnato lascerebbe un posto senza titolare.
    const contratti = await db.seasonalContract.count({
      where: { customerId: c.id, status: 'ACTIVE' } })
    if (contratti > 0)
      throw new DomainError('FORBIDDEN',
        'Questo cliente ha un contratto stagionale attivo: va chiuso prima di anonimizzarlo.')

    const etichetta = `Cliente anonimizzato ${c.id.slice(0, 8)}`

    await db.customer.updateById(c.id, {
      firstName: 'Cliente', lastName: `anonimizzato ${c.id.slice(0, 8)}`,
      phoneRaw: null, phoneNormalized: null, email: null, notes: null,
      anonymizedAt: new Date(),
    })
    // Le preferenze sono dati personali a tutti gli effetti.
    await db.customerPreference.deleteMany({ where: { customerId: c.id } })

    await audit(tx, ctx, 'customer.anonymize',
      { type: 'customer', id: c.id },
      { after: { anonimizzato: true } })   // nessun dato personale nell'audit

    return { etichetta }
  },
})

export type EsportazioneCliente = {
  esportatoIl: string
  cliente: { nome: string; cognome: string; telefono: string | null; email: string | null; note: string | null }
  preferenze: Record<string, unknown> | null
  contrattiStagionali: unknown[]
  prenotazioni: unknown[]
  pagamenti: unknown[]
  crediti: unknown[]
}

/** Tutti i dati del cliente in un file leggibile: è ciò che va consegnato. */
export const esportaCliente = useCase<{ customerId: string }, EsportazioneCliente>({
  permission: P.CUSTOMER_EXPORT,
  transactional: false,
  async run({ db }, input) {
    const c = await db.customer.byIdOrFail(input.customerId)

    const [pref, contratti, prenotazioni] = await Promise.all([
      db.customerPreference.findFirst({ where: { customerId: c.id } }),
      db.seasonalContract.findMany({ where: { customerId: c.id }, include: { umbrella: true } }),
      db.reservation.findMany({
        where: { customerId: c.id },
        include: { items: { include: { umbrella: true } }, payments: true },
        orderBy: { createdAt: 'desc' },
      }),
    ])
    const crediti = (contratti as any[]).length === 0 ? [] : await db.creditTransaction.findMany({
      where: { seasonalContractId: { in: (contratti as any[]).map(x => x.id) } },
    })

    return {
      esportatoIl: new Date().toISOString(),
      cliente: {
        nome: c.firstName, cognome: c.lastName,
        telefono: c.phoneNormalized ?? c.phoneRaw, email: c.email, note: c.notes,
      },
      preferenze: pref
        ? { fila: (pref as any).preferredRow, vicinanzaMare: (pref as any).seaProximity,
            lato: (pref as any).side, note: (pref as any).freeNotes }
        : null,
      contrattiStagionali: (contratti as any[]).map(x => ({
        ombrellone: x.umbrella.visibleNumber, dal: iso(x.startDate), al: iso(x.endDate),
        prezzoCents: x.priceCents, stato: x.status, creditoCents: x.creditBalanceCents,
      })),
      prenotazioni: (prenotazioni as any[]).map(r => ({
        dal: r.items[0] ? iso(r.items[0].startDate) : null,
        al: r.items[0] ? iso(r.items[0].endDate) : null,
        ombrelloni: r.items.map((i: any) => i.umbrella.visibleNumber),
        persone: r.peopleCount, totaleCents: r.totalCents,
        stato: r.status, origine: r.source, creataIl: r.createdAt.toISOString(),
      })),
      pagamenti: (prenotazioni as any[]).flatMap(r => r.payments.map((p: any) => ({
        importoCents: p.amountCents, metodo: p.method, il: p.paidAt.toISOString(),
      }))),
      crediti: (crediti as any[]).map(x => ({
        importoCents: x.amountCents, tipo: x.kind, descrizione: x.description,
        il: x.createdAt.toISOString(),
      })),
    }
  },
})
