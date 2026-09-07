/**
 * F6-29 · Avvisare il gestore che uno stagionale non verrà.
 *
 * È l'anello che chiude il meccanismo del prodotto: un'assenza comunicata di
 * sera dal telefono di un cliente è capacità vendibile domani, e se nessuno
 * la nota il posto resta vuoto e lo stagionale non matura credito.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { declareAbsence } from '@/server/use-cases/absences'
import { novita } from '@/server/queries/novita'
import { usaNotificatore, type NotificationPort } from '@/server/notifications'
import { descrizione, type Evento } from '@/domain/notifications'
import { prisma } from '@/server/repositories/scoped'
import { DEFAULT_SETTINGS, type Ctx } from '@/server/context'
import { makeClub } from './helpers'

const GIORNO = 86_400_000
const MARGINE = 1        // come in absences.test.ts: il taglio è alle 20:00
const fraGiorni = (n: number) => {
  const o = new Date()
  const base = Date.UTC(o.getUTCFullYear(), o.getUTCMonth(), o.getUTCDate())
  return new Date(base + (n > 0 ? n + MARGINE : n) * GIORNO)
}

const staff = (beachClubId: string, userId: string): Ctx => ({
  kind: 'STAFF', beachClubId, userId, actor: 'ADMIN',
  timezone: 'Europe/Rome', settings: DEFAULT_SETTINGS,
})
const cliente = (beachClubId: string, seasonalContractId: string): Ctx => ({
  kind: 'CUSTOMER', beachClubId, seasonalContractId,
  actor: 'SEASONAL_CUSTOMER', timezone: 'Europe/Rome', settings: DEFAULT_SETTINGS,
})

async function scenario(label: string) {
  const c = await makeClub(prisma, label)
  const inizio = fraGiorni(-30), fine = fraGiorni(60)
  await prisma.season.update({ where: { id: c.season.id },
    data: { status: 'ACTIVE', startDate: inizio, endDate: fine } })
  await prisma.customer.update({ where: { id: c.customer.id },
    data: { firstName: 'Marco', lastName: 'Bianchi' } })
  const contratto = await prisma.seasonalContract.create({
    data: { beachClubId: c.club.id, seasonId: c.season.id, customerId: c.customer.id,
            umbrellaId: c.umbrella.id, startDate: inizio, endDate: fine,
            priceCents: 180000, accessTokenHash: `h-${label}` },
  })
  return { ...c, contratto,
           ctxStaff: staff(c.club.id, c.user.id),
           ctxCliente: cliente(c.club.id, contratto.id) }
}

/** Raccoglie gli eventi al posto del registro. */
function spia() {
  const visti: Evento[] = []
  const porto: NotificationPort = { async invia(e) { visti.push(e) } }
  return { visti, ripristina: usaNotificatore(porto) }
}

beforeAll(async () => { await prisma.$connect() })
afterAll(async () => { await prisma.$disconnect() })

let ripristina: (() => void) | null = null
afterEach(() => { ripristina?.(); ripristina = null })

describe('l’evento', () => {
  it('parte quando è il CLIENTE a dichiarare', async () => {
    const s = await scenario('cliente')
    const sp = spia(); ripristina = sp.ripristina

    await declareAbsence(s.ctxCliente, { from: fraGiorni(3), to: fraGiorni(4) })

    expect(sp.visti).toHaveLength(1)
    expect(sp.visti[0]).toMatchObject({
      tipo: 'ASSENZA_DICHIARATA',
      beachClubId: s.club.id,
      cliente: 'Marco Bianchi',
      ombrellone: '63',
      tardiva: false,
    })
  })

  it('NON parte se l’ha registrata l’operatore: era lui al telefono', async () => {
    const s = await scenario('staff')
    const sp = spia(); ripristina = sp.ripristina

    await declareAbsence(s.ctxStaff, {
      contractId: s.contratto.id, from: fraGiorni(3), to: fraGiorni(4) })

    expect(sp.visti).toHaveLength(0)
  })

  it('un canale rotto non fa fallire l’assenza', async () => {
    const s = await scenario('rotto')
    ripristina = usaNotificatore({ async invia() { throw new Error('canale giù') } })

    // Il cliente ha fatto la sua parte: il posto dev'essere vendibile lo
    // stesso. Perdere l'assenza perché una notifica non parte è assurdo.
    const esito = await declareAbsence(s.ctxCliente, { from: fraGiorni(3), to: fraGiorni(3) })
    expect(esito.id).toBeTruthy()
    expect(await prisma.seasonalAbsence.count({
      where: { seasonalContractId: s.contratto.id, status: 'ACTIVE' } })).toBe(1)
  })
})

describe('descrizione · la riga che una persona legge', () => {
  const base = {
    tipo: 'ASSENZA_DICHIARATA', beachClubId: 'x', seasonalContractId: 'y',
    cliente: 'Marco Bianchi', ombrellone: '63',
    dal: '2026-08-10', al: '2026-08-10', tardiva: false,
  } as const

  it('dice chi, quando e che il posto è vendibile', () => {
    const t = descrizione(base)
    expect(t).toContain('Marco Bianchi')
    expect(t).toContain('63')
    expect(t).toContain('vendibile')
  })

  it('un solo giorno si dice «il», più giorni «dal … al …»', () => {
    expect(descrizione(base)).toContain('il 2026-08-10')
    expect(descrizione({ ...base, al: '2026-08-14' })).toContain('dal 2026-08-10 al 2026-08-14')
  })

  it('l’assenza tardiva lo dice: vendibile sì, credito no', () => {
    expect(descrizione({ ...base, tardiva: true })).toContain('nessun credito')
  })
})

describe('la fascia sulla mappa', () => {
  it('mostra le assenze comunicate dai clienti nelle ultime 24 ore', async () => {
    const s = await scenario('fascia')
    await declareAbsence(s.ctxCliente, { from: fraGiorni(3), to: fraGiorni(5) })

    const n = await novita(s.ctxStaff)
    expect(n.assenze).toHaveLength(1)
    expect(n.assenze[0]).toMatchObject({ cliente: 'Marco Bianchi', ombrellone: '63' })
  })

  it('non mostra quelle registrate dall’operatore: le sa già', async () => {
    const s = await scenario('fascia2')
    await declareAbsence(s.ctxStaff, {
      contractId: s.contratto.id, from: fraGiorni(3), to: fraGiorni(3) })
    expect((await novita(s.ctxStaff)).assenze).toHaveLength(0)
  })

  it('non mostra quelle vecchie di più di un giorno', async () => {
    const s = await scenario('vecchie')
    const a = await declareAbsence(s.ctxCliente, { from: fraGiorni(3), to: fraGiorni(4) })
    await prisma.seasonalAbsence.update({
      where: { id: a.id }, data: { declaredAt: new Date(Date.now() - 30 * 3_600_000) } })
    expect((await novita(s.ctxStaff)).assenze).toHaveLength(0)
  })

  it('non mostra un’assenza già finita: non è più capacità vendibile', async () => {
    const s = await scenario('finita')
    const a = await declareAbsence(s.ctxCliente, { from: fraGiorni(3), to: fraGiorni(3) })
    await prisma.seasonalAbsence.update({
      where: { id: a.id },
      data: { startDate: fraGiorni(-5), endDate: fraGiorni(-3) } })
    expect((await novita(s.ctxStaff)).assenze).toHaveLength(0)
  })

  it('non mostra quelle annullate', async () => {
    const s = await scenario('annullata')
    const a = await declareAbsence(s.ctxCliente, { from: fraGiorni(3), to: fraGiorni(4) })
    await prisma.seasonalAbsence.update({
      where: { id: a.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } })
    expect((await novita(s.ctxStaff)).assenze).toHaveLength(0)
  })

  it('non mostra le assenze di un altro stabilimento', async () => {
    const a = await scenario('t-a')
    const b = await scenario('t-b')
    await declareAbsence(a.ctxCliente, { from: fraGiorni(3), to: fraGiorni(4) })
    expect((await novita(b.ctxStaff)).assenze).toHaveLength(0)
  })
})
