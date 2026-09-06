/**
 * F6-27 · Spostare gli ombrelloni.
 *
 * La regola che tiene in piedi tutto: spostare NON cambia l'identità. Un
 * gestore che rifà la disposizione a metà stagione non deve perdere una
 * prenotazione, e un cliente che ha pagato l'ombrellone 63 deve restare
 * sull'ombrellone 63 anche se quello si è spostato di due caselle.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spostaOmbrellone, rinumeraOmbrellone } from '@/server/use-cases/map-setup'
import { createReservation } from '@/server/use-cases/reservations'
import { disposizione } from '@/server/queries/layout'
import { prisma } from '@/server/repositories/scoped'
import { DEFAULT_SETTINGS, type Ctx } from '@/server/context'
import { makeClub, day } from './helpers'

const ctxDi = (beachClubId: string, userId: string,
               actor: 'ADMIN' | 'OPERATOR' = 'ADMIN'): Ctx => ({
  kind: 'STAFF', beachClubId, userId, actor,
  timezone: 'Europe/Rome', settings: DEFAULT_SETTINGS,
})

async function scenario(label: string) {
  const c = await makeClub(prisma, label)
  await prisma.season.update({ where: { id: c.season.id }, data: { status: 'ACTIVE' } })
  await prisma.priceRule.create({
    data: { beachClubId: c.club.id, seasonId: c.season.id, name: 'Base',
            priority: 0, priceCents: 2500 },
  })
  // `makeClub` ne crea uno in (1,1); ne serve un secondo per i conflitti.
  const vicino = await prisma.umbrella.create({
    data: { beachClubId: c.club.id, beachMapId: c.map.id, visibleNumber: '64',
            rowLabel: 'A', posX: 2, posY: 1, basePriceCents: 2500 },
  })
  return { ...c, vicino, ctx: ctxDi(c.club.id, c.user.id),
           operatore: ctxDi(c.club.id, c.user.id, 'OPERATOR') }
}

const posizione = (id: string) =>
  prisma.umbrella.findUniqueOrThrow({ where: { id } })
    .then(u => ({ x: u.posX, y: u.posY, fila: u.rowLabel }))

beforeAll(async () => { await prisma.$connect() })
afterAll(async () => { await prisma.$disconnect() })

describe('spostare', () => {
  it('sposta l’ombrellone in una casella libera', async () => {
    const s = await scenario('sposta')
    const esito = await spostaOmbrellone(s.ctx, { umbrellaId: s.umbrella.id, posX: 5, posY: 3 })
    expect(esito).toMatchObject({ visibleNumber: '63', posX: 5, posY: 3 })
    expect(await posizione(s.umbrella.id)).toEqual({ x: 5, y: 3, fila: 'A' })
  })

  it('la fila resta quella se non la si cambia: cambierebbe anche il listino', async () => {
    const s = await scenario('fila')
    await spostaOmbrellone(s.ctx, { umbrellaId: s.umbrella.id, posX: 5, posY: 9 })
    expect((await posizione(s.umbrella.id)).fila).toBe('A')

    await spostaOmbrellone(s.ctx, { umbrellaId: s.umbrella.id, posX: 6, posY: 9, rowLabel: 'C' })
    expect((await posizione(s.umbrella.id)).fila).toBe('C')
  })

  it('la casella occupata è rifiutata, e dice CHI c’è: il gestore guarda i numeri', async () => {
    const s = await scenario('occupata')
    const errore = await spostaOmbrellone(s.ctx, {
      umbrellaId: s.umbrella.id, posX: s.vicino.posX, posY: s.vicino.posY,
    }).catch(e => e)
    expect(errore.code).toBe('UMBRELLA_NOT_AVAILABLE')
    expect(errore.message).toContain('64')
    expect(errore.details.occupante).toBe('64')
    expect(await posizione(s.umbrella.id)).toEqual({ x: 1, y: 1, fila: 'A' })
  })

  it('rimetterlo dov’è già non è un errore', async () => {
    const s = await scenario('fermo')
    await expect(spostaOmbrellone(s.ctx, { umbrellaId: s.umbrella.id, posX: 1, posY: 1 }))
      .resolves.toMatchObject({ posX: 1, posY: 1 })
  })

  it('rifiuta coordinate negative', async () => {
    const s = await scenario('negativo')
    await expect(spostaOmbrellone(s.ctx, { umbrellaId: s.umbrella.id, posX: -1, posY: 0 }))
      .rejects.toMatchObject({ code: 'INVALID_RANGE' })
  })

  it('il database rifiuta comunque due ombrelloni nella stessa casella', async () => {
    const s = await scenario('vincolo')
    // Il controllo del caso d'uso è la cortesia; questa è la garanzia, e serve
    // perché due tablet possono spostare nello stesso istante.
    const errore = await prisma.umbrella.update({
      where: { id: s.umbrella.id },
      data: { posX: s.vicino.posX, posY: s.vicino.posY },
    }).catch(e => e)
    expect(errore).toBeInstanceOf(Error)
    expect(String(errore)).toMatch(/P2002|unique|Unique/)
  })
})

describe('l’identità non cambia — è tutta la questione', () => {
  it('la prenotazione resta attaccata all’ombrellone spostato', async () => {
    const s = await scenario('identita')
    const r = await createReservation(s.ctx, {
      umbrellaIds: [s.umbrella.id], cliente: { lastName: 'Fedele' },
      from: day(2030, 8, 10), to: day(2030, 8, 12),
    })
    await spostaOmbrellone(s.ctx, { umbrellaId: s.umbrella.id, posX: 7, posY: 4 })

    const items = await prisma.reservationItem.findMany({ where: { reservationId: r.id } })
    expect(items).toHaveLength(1)
    expect(items[0]!.umbrellaId).toBe(s.umbrella.id)
    expect(items[0]!.status).toBe('CONFIRMED')
  })

  it('anche rinumerandolo: cambia l’etichetta, non la riga', async () => {
    const s = await scenario('rinumera')
    const r = await createReservation(s.ctx, {
      umbrellaIds: [s.umbrella.id], cliente: { lastName: 'Numero' },
      from: day(2030, 8, 10), to: day(2030, 8, 10),
    })
    await rinumeraOmbrellone(s.ctx, { umbrellaId: s.umbrella.id, nuovoNumero: '63A' })
    const items = await prisma.reservationItem.findMany({ where: { reservationId: r.id } })
    expect(items[0]!.umbrellaId).toBe(s.umbrella.id)
    expect((await prisma.umbrella.findUniqueOrThrow({ where: { id: s.umbrella.id } })).visibleNumber)
      .toBe('63A')
  })

  it('lo spostamento lascia traccia nel registro, con il prima e il dopo', async () => {
    const s = await scenario('audit')
    await spostaOmbrellone(s.ctx, { umbrellaId: s.umbrella.id, posX: 8, posY: 2 })
    const riga = await prisma.auditLog.findFirstOrThrow({
      where: { beachClubId: s.club.id, action: 'umbrella.move' } })
    expect(riga.before).toMatchObject({ posX: 1, posY: 1 })
    expect(riga.after).toMatchObject({ posX: 8, posY: 2 })
  })
})

describe('permessi e tenant', () => {
  it('l’operatore non ridisegna la mappa', async () => {
    const s = await scenario('perm')
    await expect(spostaOmbrellone(s.operatore, { umbrellaId: s.umbrella.id, posX: 5, posY: 5 }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('l’ombrellone di un altro stabilimento è NOT_FOUND', async () => {
    const a = await scenario('t-a')
    const b = await scenario('t-b')
    await expect(spostaOmbrellone(b.ctx, { umbrellaId: a.umbrella.id, posX: 5, posY: 5 }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('la disposizione che vede l’editor', () => {
  it('dice quanti impegni ha ogni ombrellone: spostarne uno pieno si sa prima', async () => {
    const s = await scenario('editor')
    await createReservation(s.ctx, {
      umbrellaIds: [s.umbrella.id], cliente: { lastName: 'Pieno' },
      from: day(2030, 8, 10), to: day(2030, 8, 12),
    })
    const d = await disposizione(s.ctx)
    const pieno = d.ombrelloni.find(o => o.id === s.umbrella.id)!
    const vuoto = d.ombrelloni.find(o => o.id === s.vicino.id)!
    expect(pieno.impegni).toBe(1)
    expect(vuoto.impegni).toBe(0)
  })

  it('la griglia si allarga se un ombrellone è stato spostato oltre il bordo', async () => {
    const s = await scenario('bordo')
    const prima = await disposizione(s.ctx)
    await spostaOmbrellone(s.ctx, { umbrellaId: s.umbrella.id, posX: prima.larghezza + 4, posY: 1 })
    const dopo = await disposizione(s.ctx)
    // Senza, l'ombrellone appena spostato uscirebbe dal disegno e sparirebbe.
    expect(dopo.larghezza).toBeGreaterThan(prima.larghezza)
    expect(dopo.ombrelloni.some(o => o.posX === prima.larghezza + 4)).toBe(true)
  })

  it('vede solo il proprio stabilimento', async () => {
    const a = await scenario('t-c')
    await scenario('t-d')
    const d = await disposizione(a.ctx)
    expect(d.ombrelloni).toHaveLength(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────
describe('le passerelle e i corridoi', () => {
  it('arrivano all’editor con misure vere, non NaN', async () => {
    const s = await scenario('features')
    await prisma.mapFeature.create({
      data: { beachClubId: s.club.id, beachMapId: s.map.id, kind: 'WALKWAY',
              posX: 0, posY: 4, width: 12, height: 1, label: 'passerella' },
    })
    const d = await disposizione(s.ctx)
    // Lo schema li chiama `posX/width`, l'editor `x/w`: la prima versione
    // leggeva i nomi corti dallo schema e disegnava tutta la mappa a NaN.
    expect(d.features).toEqual([
      { kind: 'WALKWAY', x: 0, y: 4, w: 12, h: 1, label: 'passerella' },
    ])
    expect(Number.isFinite(d.larghezza) && Number.isFinite(d.altezza)).toBe(true)
    expect(d.larghezza).toBeGreaterThanOrEqual(12)
  })
})
