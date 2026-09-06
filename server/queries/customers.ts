/**
 * Scenario E · Il cliente abituale telefona.
 *
 * Criterio (docs/07): dalla mappa alla scheda completa in ≤ 3 interazioni, e
 * la scheda deve avere tutto sotto gli occhi — storico, preferenze, ultimi
 * ombrelloni — senza scorrere su tablet.
 */
import type { Ctx } from '@/server/context'
import { scoped } from '@/server/repositories/scoped'
import { normalizzaTelefono, formattaTelefono } from '@/domain/customers/phone'
import { DomainError } from '@/domain/errors'

const iso = (d: Date) => d.toISOString().slice(0, 10)

export type ClienteTrovato = {
  id: string
  nome: string
  telefono: string | null
  stagionale: boolean
  ultimoOmbrellone: string | null
}

export type SchedaCliente = {
  id: string
  nome: string
  cognome: string
  telefono: string | null
  telefonoWhatsApp: string | null
  email: string | null
  note: string | null
  stagionale: boolean
  contrattoStagionale: { ombrellone: string; dal: string; al: string; creditoCents: number } | null
  preferenze: {
    fila: string | null
    zona: string | null
    ombrellone: string | null
    vicinanzaMare: string | null
    lato: string | null
    note: string | null
  } | null
  ombrelloniRicorrenti: { numero: string; volte: number }[]
  storico: {
    id: string
    dal: string
    al: string
    ombrelloni: string[]
    persone: number
    totaleCents: number
    pagatoCents: number
    stato: string
    origine: string
  }[]
}

/**
 * Ricerca mentre si digita: cognome, nome, o le ultime cifre del telefono —
 * che è come il gestore cerca davvero quando ha la cornetta in mano.
 */
export async function cercaClienti(ctx: Ctx, q: string, limite = 8): Promise<ClienteTrovato[]> {
  const testo = q.trim()
  if (testo.length < 2) return []
  const db = scoped(ctx)

  const cifre = testo.replace(/\D/g, '')
  const perTelefono = cifre.length >= 3
    ? (normalizzaTelefono(testo).ok ? normalizzaTelefono(testo) : null)
    : null

  const clienti = await db.customer.findMany({
    where: {
      anonymizedAt: null,
      OR: [
        { lastName: { contains: testo, mode: 'insensitive' } },
        { firstName: { contains: testo, mode: 'insensitive' } },
        ...(cifre.length >= 3 ? [{ phoneNormalized: { contains: cifre } }] : []),
        ...(perTelefono?.ok ? [{ phoneNormalized: perTelefono.e164 }] : []),
      ],
    },
    take: limite,
    orderBy: [{ isSeasonal: 'desc' }, { lastName: 'asc' }],
  })
  if ((clienti as any[]).length === 0) return []

  // Un'unica query per gli ultimi ombrelloni: mai una per cliente.
  const items = await db.reservationItem.findMany({
    where: { reservation: { customerId: { in: (clienti as any[]).map(c => c.id) } },
             status: { in: ['CONFIRMED', 'CHECKED_IN'] } },
    include: { umbrella: true, reservation: true },
    orderBy: { startDate: 'desc' },
    take: 200,
  })
  const ultimo = new Map<string, string>()
  for (const i of items as any[])
    if (!ultimo.has(i.reservation.customerId)) ultimo.set(i.reservation.customerId, i.umbrella.visibleNumber)

  return (clienti as any[]).map(c => ({
    id: c.id,
    nome: `${c.firstName} ${c.lastName}`.trim(),
    telefono: c.phoneNormalized ? formattaTelefono(c.phoneNormalized) : c.phoneRaw,
    stagionale: c.isSeasonal,
    ultimoOmbrellone: ultimo.get(c.id) ?? null,
  }))
}

export async function schedaCliente(ctx: Ctx, id: string): Promise<SchedaCliente> {
  const db = scoped(ctx)
  const c = await db.customer.byIdOrFail(id)
  if (c.anonymizedAt) throw new DomainError('NOT_FOUND', 'Cliente non disponibile.')

  const [pref, contratti, prenotazioni] = await Promise.all([
    db.customerPreference.findFirst({ where: { customerId: id } }),
    db.seasonalContract.findMany({
      where: { customerId: id, status: 'ACTIVE' }, include: { umbrella: true },
    }),
    db.reservation.findMany({
      where: { customerId: id },
      include: { items: { include: { umbrella: true } }, payments: true },
      orderBy: { createdAt: 'desc' },
      take: 25,
    }),
  ])

  const zona = (pref as any)?.preferredZoneId
    ? await db.zone.byId((pref as any).preferredZoneId) : null
  const ombPref = (pref as any)?.preferredUmbrellaId
    ? await db.umbrella.byId((pref as any).preferredUmbrellaId) : null

  // Gli ombrelloni che sceglie di solito: è la risposta a "dove lo metto?".
  const conteggio = new Map<string, number>()
  for (const r of prenotazioni as any[])
    for (const i of r.items) conteggio.set(i.umbrella.visibleNumber,
      (conteggio.get(i.umbrella.visibleNumber) ?? 0) + 1)

  const contratto = (contratti as any[])[0] ?? null

  return {
    id: c.id,
    nome: c.firstName,
    cognome: c.lastName,
    telefono: c.phoneNormalized ? formattaTelefono(c.phoneNormalized) : c.phoneRaw,
    telefonoWhatsApp: c.phoneNormalized ? c.phoneNormalized.replace(/\D/g, '') : null,
    email: c.email,
    note: c.notes,
    stagionale: c.isSeasonal,
    contrattoStagionale: contratto ? {
      ombrellone: contratto.umbrella.visibleNumber,
      dal: iso(contratto.startDate), al: iso(contratto.endDate),
      creditoCents: contratto.creditBalanceCents,
    } : null,
    preferenze: pref ? {
      fila: (pref as any).preferredRow,
      zona: (zona as any)?.name ?? null,
      ombrellone: (ombPref as any)?.visibleNumber ?? null,
      vicinanzaMare: (pref as any).seaProximity,
      lato: (pref as any).side,
      note: (pref as any).freeNotes,
    } : null,
    ombrelloniRicorrenti: [...conteggio.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'it', { numeric: true }))
      .slice(0, 5)
      .map(([numero, volte]) => ({ numero, volte })),
    storico: (prenotazioni as any[]).map(r => {
      const dal = r.items.map((i: any) => i.startDate).sort()[0]
      const al = r.items.map((i: any) => i.endDate).sort().reverse()[0]
      return {
        id: r.id,
        dal: dal ? iso(dal) : '',
        al: al ? iso(al) : '',
        ombrelloni: r.items.map((i: any) => i.umbrella.visibleNumber),
        persone: r.peopleCount,
        totaleCents: r.totalCents,
        pagatoCents: r.payments.reduce((s: number, p: any) => s + p.amountCents, 0),
        stato: r.status,
        origine: r.source,
      }
    }),
  }
}
