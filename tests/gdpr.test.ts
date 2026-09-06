/**
 * F6-33 · GDPR (NF-05).
 *
 * La cancellazione è un'anonimizzazione: cancellare fisicamente il cliente
 * romperebbe lo storico contabile e l'audit, e toglierebbe allo stabilimento
 * l'informazione che gli serve per difendersi in una contestazione.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { anonimizzaCliente, esportaCliente } from '@/server/use-cases/gdpr'
import { createReservation } from '@/server/use-cases/reservations'
import { prisma } from '@/server/repositories/scoped'
import { DEFAULT_SETTINGS, type Ctx } from '@/server/context'
import { makeClub } from './helpers'

const GIORNO = 86_400_000
const fraGiorni = (n: number) => {
  const o = new Date()
  return new Date(Date.UTC(o.getUTCFullYear(), o.getUTCMonth(), o.getUTCDate()) + n * GIORNO)
}
const ctxDi = (beachClubId: string, userId: string, actor: 'ADMIN' | 'OPERATOR' = 'ADMIN'): Ctx => ({
  kind: 'STAFF', beachClubId, userId, actor, timezone: 'Europe/Rome', settings: DEFAULT_SETTINGS,
})

async function conStorico(label: string) {
  const c = await makeClub(prisma, label)
  await prisma.season.update({ where: { id: c.season.id },
    data: { status: 'ACTIVE', startDate: fraGiorni(-30), endDate: fraGiorni(60) } })
  await prisma.umbrella.update({ where: { id: c.umbrella.id }, data: { basePriceCents: 2500 } })
  await prisma.customer.update({ where: { id: c.customer.id },
    data: { phoneRaw: '348 1234567', phoneNormalized: `+3934812${label.length}4567`.slice(0, 13),
            email: 'tizio@example.it', notes: 'Cliente storico' } })
  await prisma.customerPreference.create({
    data: { beachClubId: c.club.id, customerId: c.customer.id, preferredRow: 'A',
            freeNotes: 'Arriva dopo le 10' } })
  const ctx = ctxDi(c.club.id, c.user.id)
  const r = await createReservation(ctx, {
    umbrellaIds: [c.umbrella.id], customerId: c.customer.id,
    from: fraGiorni(1), to: fraGiorni(2),
  })
  await prisma.payment.create({
    data: { beachClubId: c.club.id, reservationId: r.id, amountCents: 5000 } })
  return { ...c, ctx, prenotazione: r }
}

beforeAll(async () => { await prisma.$connect() })
afterAll(async () => { await prisma.$disconnect() })

describe('anonimizzazione', () => {
  it('toglie i dati personali ma conserva lo storico contabile', async () => {
    const s = await conStorico('gdpr-anon')
    await anonimizzaCliente(s.ctx, { customerId: s.customer.id })

    const dopo = await prisma.customer.findUniqueOrThrow({ where: { id: s.customer.id } })
    expect(dopo.phoneNormalized).toBeNull()
    expect(dopo.phoneRaw).toBeNull()
    expect(dopo.email).toBeNull()
    expect(dopo.notes).toBeNull()
    expect(dopo.lastName).toContain('anonimizzato')
    expect(dopo.anonymizedAt).not.toBeNull()

    // ma la prenotazione e il pagamento restano: servono a bilancio
    const prenotazione = await prisma.reservation.findUniqueOrThrow({
      where: { id: s.prenotazione.id }, include: { payments: true } })
    expect(prenotazione.totalCents).toBe(5000)
    expect(prenotazione.payments).toHaveLength(1)
  })

  it('cancella anche le preferenze: sono dati personali', async () => {
    const s = await conStorico('gdpr-pref')
    await anonimizzaCliente(s.ctx, { customerId: s.customer.id })
    expect(await prisma.customerPreference.count({ where: { customerId: s.customer.id } })).toBe(0)
  })

  it('non lascia dati personali nemmeno nell’audit', async () => {
    const s = await conStorico('gdpr-audit')
    await anonimizzaCliente(s.ctx, { customerId: s.customer.id })
    const riga = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: s.customer.id, action: 'customer.anonymize' } })
    expect(JSON.stringify(riga.after)).not.toContain('348')
    expect(JSON.stringify(riga.after)).not.toContain('example.it')
  })

  it('il cliente anonimizzato non compare più nella ricerca', async () => {
    const s = await conStorico('gdpr-ricerca')
    const { cercaClienti } = await import('@/server/queries/customers')
    expect(await cercaClienti(s.ctx, 'Cliente')).not.toHaveLength(0)
    await anonimizzaCliente(s.ctx, { customerId: s.customer.id })
    const trovati = await cercaClienti(s.ctx, 'Test')
    expect(trovati.find(x => x.id === s.customer.id)).toBeUndefined()
  })

  it('libera il vincolo di unicità del telefono', async () => {
    // Così un nuovo cliente può usare quel numero senza scontrarsi con un
    // fantasma nell'anagrafica.
    const s = await conStorico('gdpr-telefono')
    const numero = (await prisma.customer.findUniqueOrThrow({
      where: { id: s.customer.id } })).phoneNormalized!
    await anonimizzaCliente(s.ctx, { customerId: s.customer.id })
    await expect(prisma.customer.create({
      data: { beachClubId: s.club.id, firstName: 'Nuovo', lastName: 'Cliente',
              phoneNormalized: numero },
    })).resolves.toBeDefined()
  })

  it('rifiuta se c’è un contratto stagionale attivo', async () => {
    const s = await conStorico('gdpr-stagionale')
    await prisma.seasonalContract.create({
      data: { beachClubId: s.club.id, seasonId: s.season.id, customerId: s.customer.id,
              umbrellaId: s.umbrella.id, startDate: fraGiorni(20), endDate: fraGiorni(40),
              priceCents: 180000, accessTokenHash: 'h-gdpr' } })
    await expect(anonimizzaCliente(s.ctx, { customerId: s.customer.id }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('anonimizzare due volte non passa in silenzio', async () => {
    const s = await conStorico('gdpr-due')
    await anonimizzaCliente(s.ctx, { customerId: s.customer.id })
    await expect(anonimizzaCliente(s.ctx, { customerId: s.customer.id })).rejects.toThrow()
  })

  it('l’operatore non può anonimizzare', async () => {
    const s = await conStorico('gdpr-permessi')
    const operatore = ctxDi(s.club.id, s.user.id, 'OPERATOR')
    await expect(anonimizzaCliente(operatore, { customerId: s.customer.id }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('esportazione', () => {
  it('consegna tutto ciò che riguarda il cliente', async () => {
    const s = await conStorico('gdpr-export')
    const dati = await esportaCliente(s.ctx, { customerId: s.customer.id })

    expect(dati.cliente.telefono).toContain('+39')
    expect(dati.cliente.note).toBe('Cliente storico')
    expect(dati.preferenze).toMatchObject({ fila: 'A', note: 'Arriva dopo le 10' })
    expect(dati.prenotazioni).toHaveLength(1)
    expect(dati.pagamenti).toHaveLength(1)
    expect(dati.esportatoIl).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('non esce dai confini dello stabilimento', async () => {
    const a = await conStorico('gdpr-tenant-a')
    const b = await conStorico('gdpr-tenant-b')
    await expect(esportaCliente(a.ctx, { customerId: b.customer.id }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
