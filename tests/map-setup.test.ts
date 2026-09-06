/**
 * F6-26 · Creazione della mappa (C-08, C-83, C-84, C-85).
 *
 * È il punto in cui si decide se un gestore adotterà il prodotto: se
 * configurare costa un'ora, tornerà al quaderno.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { generaMappa, rinumeraOmbrellone } from '@/server/use-cases/map-setup'
import { createReservation } from '@/server/use-cases/reservations'
import { prisma } from '@/server/repositories/scoped'
import { DEFAULT_SETTINGS, type Ctx } from '@/server/context'
import { makeClub, day } from './helpers'
import { randomUUID } from 'node:crypto'

const GIORNO = 86_400_000
const fraGiorni = (n: number) => {
  const o = new Date()
  return new Date(Date.UTC(o.getUTCFullYear(), o.getUTCMonth(), o.getUTCDate()) + n * GIORNO)
}

const admin = (beachClubId: string, userId: string): Ctx => ({
  kind: 'STAFF', beachClubId, userId, actor: 'ADMIN',
  timezone: 'Europe/Rome', settings: DEFAULT_SETTINGS,
})

/** Uno stabilimento vuoto: nessuna mappa, nessun ombrellone. */
async function vuoto(label: string) {
  const club = await prisma.beachClub.create({
    data: { name: label, slug: `${label}-${randomUUID()}` },
  })
  const user = await prisma.user.create({
    data: { beachClubId: club.id, email: `a-${randomUUID()}@t.it`, name: 'A',
            role: 'ADMIN', passwordHash: 'x' },
  })
  const season = await prisma.season.create({
    data: { beachClubId: club.id, year: 2035 + Math.floor(Math.random() * 900),
            startDate: fraGiorni(-30), endDate: fraGiorni(60), status: 'ACTIVE' },
  })
  return { club, user, season, ctx: admin(club.id, user.id) }
}

beforeAll(async () => { await prisma.$connect() })
afterAll(async () => { await prisma.$disconnect() })

describe('«6 file da 16» e la mappa esiste', () => {
  it('crea 96 ombrelloni, tre zone e le feature', async () => {
    const s = await vuoto('gen-base')
    const esito = await generaMappa(s.ctx, {
      file: 6, perFila: 16, numerazione: 'PROGRESSIVA',
      passerellaDopoFila: 3, corridoioOgni: 8,
      prezziPerZonaCents: [3500, 2500, 1800],
    })
    expect(esito.ombrelloni).toBe(96)
    expect(esito.zone).toBe(3)
    expect(esito.features).toBeGreaterThan(0)

    const ombrelloni = await prisma.umbrella.findMany({
      where: { beachClubId: s.club.id }, orderBy: { visibleNumber: 'asc' } })
    expect(ombrelloni).toHaveLength(96)
    expect(new Set(ombrelloni.map(u => u.visibleNumber)).size).toBe(96)
  })

  it('la prima fila prende il prezzo della prima fila', async () => {
    const s = await vuoto('gen-prezzi')
    await generaMappa(s.ctx, {
      file: 3, perFila: 4, numerazione: 'PROGRESSIVA',
      prezziPerZonaCents: [3500, 2500, 1800],
    })
    const prima = await prisma.umbrella.findFirstOrThrow({
      where: { beachClubId: s.club.id, rowLabel: 'A' } })
    const ultima = await prisma.umbrella.findFirstOrThrow({
      where: { beachClubId: s.club.id, rowLabel: 'C' } })
    expect(prima.basePriceCents).toBe(3500)
    expect(ultima.basePriceCents).toBe(1800)
    expect(prima.category).toBe('prima fila')
  })

  it('ogni ombrellone finisce in una zona', async () => {
    const s = await vuoto('gen-zone')
    await generaMappa(s.ctx, { file: 4, perFila: 5, numerazione: 'PROGRESSIVA' })
    const senzaZona = await prisma.umbrella.count({
      where: { beachClubId: s.club.id, zoneId: null } })
    expect(senzaZona).toBe(0)
  })

  it('rifiuta parametri impossibili prima di scrivere qualsiasi cosa', async () => {
    const s = await vuoto('gen-invalido')
    await expect(generaMappa(s.ctx, { file: 0, perFila: 10, numerazione: 'PROGRESSIVA' }))
      .rejects.toMatchObject({ code: 'INVALID_RANGE' })
    expect(await prisma.umbrella.count({ where: { beachClubId: s.club.id } })).toBe(0)
  })
})

describe('C-85 · non si distrugge ciò che è già in uso', () => {
  it('rifiuta di rigenerare se ci sono prenotazioni', async () => {
    const s = await vuoto('gen-occupato')
    await generaMappa(s.ctx, { file: 2, perFila: 3, numerazione: 'PROGRESSIVA',
                               prezziPerZonaCents: [2500, 2500] })
    const u = await prisma.umbrella.findFirstOrThrow({ where: { beachClubId: s.club.id } })
    const c = await prisma.customer.create({
      data: { beachClubId: s.club.id, firstName: 'Tizio', lastName: 'Test' } })
    await createReservation(s.ctx, {
      umbrellaIds: [u.id], customerId: c.id, from: fraGiorni(1), to: fraGiorni(2) })

    await expect(generaMappa(s.ctx, { file: 9, perFila: 9, numerazione: 'PROGRESSIVA' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' })

    // e la mappa esistente è intatta
    expect(await prisma.umbrella.count({ where: { beachClubId: s.club.id } })).toBe(6)
  })

  it('ma rigenera senza problemi se non c’è ancora nulla', async () => {
    const s = await vuoto('gen-rigenera')
    await generaMappa(s.ctx, { file: 2, perFila: 3, numerazione: 'PROGRESSIVA' })
    const esito = await generaMappa(s.ctx, { file: 3, perFila: 4, numerazione: 'PROGRESSIVA' })
    expect(esito.ombrelloni).toBe(12)
    expect(await prisma.umbrella.count({ where: { beachClubId: s.club.id } })).toBe(12)
  })
})

describe('C-83 · rinumerare', () => {
  it('cambia il numero visibile senza toccare l’identità', async () => {
    const s = await vuoto('gen-rinumera')
    await generaMappa(s.ctx, { file: 1, perFila: 3, numerazione: 'PROGRESSIVA',
                               prezziPerZonaCents: [2500] })
    const u = await prisma.umbrella.findFirstOrThrow({
      where: { beachClubId: s.club.id, visibleNumber: '2' } })
    const c = await prisma.customer.create({
      data: { beachClubId: s.club.id, firstName: 'Tizio', lastName: 'R' } })
    const r = await createReservation(s.ctx, {
      umbrellaIds: [u.id], customerId: c.id, from: fraGiorni(1), to: fraGiorni(1) })

    await rinumeraOmbrellone(s.ctx, { umbrellaId: u.id, nuovoNumero: '2bis' })

    const dopo = await prisma.umbrella.findUniqueOrThrow({ where: { id: u.id } })
    expect(dopo.visibleNumber).toBe('2bis')
    // la prenotazione è ancora sua: è cambiata l'etichetta, non l'ombrellone
    const item = await prisma.reservationItem.findFirstOrThrow({ where: { reservationId: r.id } })
    expect(item.umbrellaId).toBe(u.id)
  })

  it('non permette due ombrelloni con lo stesso numero', async () => {
    const s = await vuoto('gen-dup')
    await generaMappa(s.ctx, { file: 1, perFila: 3, numerazione: 'PROGRESSIVA' })
    const u = await prisma.umbrella.findFirstOrThrow({
      where: { beachClubId: s.club.id, visibleNumber: '1' } })
    await expect(rinumeraOmbrellone(s.ctx, { umbrellaId: u.id, nuovoNumero: '3' }))
      .rejects.toThrow()
  })

  it('lascia traccia nell’audit', async () => {
    const s = await vuoto('gen-audit')
    await generaMappa(s.ctx, { file: 1, perFila: 2, numerazione: 'PROGRESSIVA' })
    const u = await prisma.umbrella.findFirstOrThrow({ where: { beachClubId: s.club.id } })
    await rinumeraOmbrellone(s.ctx, { umbrellaId: u.id, nuovoNumero: '77' })
    const righe = await prisma.auditLog.findMany({
      where: { entityId: u.id, action: 'umbrella.renumber' } })
    expect(righe).toHaveLength(1)
    expect((righe[0]!.after as any).visibleNumber).toBe('77')
  })
})

describe('una mappa senza tariffe non vende, e lo dice', () => {
  it('prenotare senza listino né tariffa base fallisce con un messaggio chiaro', async () => {
    // C-43 · meglio fermarsi che registrare un incasso a zero, che passerebbe
    // inosservato fino a bilancio.
    const s = await vuoto('gen-senza-prezzi')
    await generaMappa(s.ctx, { file: 1, perFila: 2, numerazione: 'PROGRESSIVA' })
    const u = await prisma.umbrella.findFirstOrThrow({ where: { beachClubId: s.club.id } })
    const c = await prisma.customer.create({
      data: { beachClubId: s.club.id, firstName: 'Tizio', lastName: 'NP' } })

    await expect(createReservation(s.ctx, {
      umbrellaIds: [u.id], customerId: c.id, from: fraGiorni(1), to: fraGiorni(1),
    })).rejects.toMatchObject({ code: 'PRICE_RULE_MISSING' })
  })
})

describe('l’operatore non configura la mappa', () => {
  it('serve un amministratore', async () => {
    const s = await vuoto('gen-permessi')
    const operatore: Ctx = { ...s.ctx, actor: 'OPERATOR' } as Ctx
    await expect(generaMappa(operatore, { file: 2, perFila: 2, numerazione: 'PROGRESSIVA' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
