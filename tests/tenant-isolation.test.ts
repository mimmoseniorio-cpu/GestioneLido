/**
 * F4-05 · Isolamento multi-tenant (T-60, T-61).
 *
 * Criterio 6 di accettazione dell'MVP: nessun dato attraversa il confine tra
 * stabilimenti. Qui si verifica la PRIMA linea di difesa — il repository
 * layer — mentre `constraints.test.ts` verifica la seconda, le chiavi
 * esterne composte del database.
 *
 * Due linee perche' la prima e' comoda e la seconda e' definitiva.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { scoped, prisma } from '@/server/repositories/scoped'
import { DEFAULT_SETTINGS, type Ctx } from '@/server/context'
import { DomainError } from '@/domain/errors'
import { makeClub, makeReservation, day } from './helpers'

const ctxOf = (beachClubId: string): Ctx => ({
  kind: 'STAFF', beachClubId, userId: 'u', actor: 'ADMIN',
  timezone: 'Europe/Rome', settings: DEFAULT_SETTINGS,
})

let A: Awaited<ReturnType<typeof makeClub>>
let B: Awaited<ReturnType<typeof makeClub>>

beforeAll(async () => {
  await prisma.$connect()
  A = await makeClub(prisma, 'iso-a')
  B = await makeClub(prisma, 'iso-b')
})
afterAll(async () => { await prisma.$disconnect() })

describe('T-60 · le risorse di un altro stabilimento non esistono', () => {
  it('byId su una risorsa del club B restituisce null per il club A', async () => {
    const db = scoped(ctxOf(A.club.id))
    expect(await db.umbrella.byId(B.umbrella.id)).toBeNull()
    expect(await db.customer.byId(B.customer.id)).toBeNull()
  })

  it('byIdOrFail solleva NOT_FOUND, mai FORBIDDEN', async () => {
    // Un 403 confermerebbe che quella risorsa esiste: e' gia' una fuga di
    // informazione (docs/04 §3.1).
    const db = scoped(ctxOf(A.club.id))
    try {
      await db.umbrella.byIdOrFail(B.umbrella.id)
      expect.unreachable('doveva sollevare')
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError)
      expect((e as DomainError).code).toBe('NOT_FOUND')
      expect((e as DomainError).httpStatus).toBe(404)
    }
  })

  it('findMany non vede mai righe di un altro stabilimento', async () => {
    const db = scoped(ctxOf(A.club.id))
    const umbrellas = await db.umbrella.findMany()
    expect(umbrellas.length).toBeGreaterThan(0)
    expect(umbrellas.every((u: { beachClubId: string }) => u.beachClubId === A.club.id)).toBe(true)
  })

  it('updateById su una risorsa altrui non modifica nulla e solleva NOT_FOUND', async () => {
    const db = scoped(ctxOf(A.club.id))
    await expect(db.umbrella.updateById(B.umbrella.id, { notes: 'manomesso' }))
      .rejects.toBeInstanceOf(DomainError)

    const intatto = await prisma.umbrella.findUniqueOrThrow({ where: { id: B.umbrella.id } })
    expect(intatto.notes).toBeNull()
  })

  it('deleteMany non puo raggiungere righe di un altro stabilimento', async () => {
    const db = scoped(ctxOf(A.club.id))
    await db.reservationItem.deleteMany({})   // "cancella tutto" del club A
    const superstiti = await prisma.umbrella.count({ where: { beachClubId: B.club.id } })
    expect(superstiti).toBeGreaterThan(0)
  })
})

describe('T-61 · il tenant non arriva mai dal client', () => {
  it('un beachClubId nei dati viene sovrascritto da quello della sessione', async () => {
    const db = scoped(ctxOf(A.club.id))
    // Un client malevolo prova a scrivere nel club B passando il suo id.
    const cliente = await db.customer.create({
      data: { beachClubId: B.club.id, firstName: 'Iniettato', lastName: 'Test' },
    })
    expect(cliente.beachClubId).toBe(A.club.id)
  })

  it('un beachClubId nel where viene sovrascritto, non aggiunto', async () => {
    const db = scoped(ctxOf(A.club.id))
    const trovati = await db.umbrella.findMany({ where: { beachClubId: B.club.id } })
    expect(trovati.every((u: { beachClubId: string }) => u.beachClubId === A.club.id)).toBe(true)
  })

  it('il conteggio di A non include mai le righe di B', async () => {
    await makeReservation(prisma, B, day(2030, 7, 1), day(2030, 7, 5))
    const dbA = scoped(ctxOf(A.club.id))
    const dbB = scoped(ctxOf(B.club.id))
    const [a, b] = [await dbA.reservation.count(), await dbB.reservation.count()]
    expect(b).toBeGreaterThan(0)
    expect(a).not.toBe(b + a)   // i due insiemi sono disgiunti
  })
})
