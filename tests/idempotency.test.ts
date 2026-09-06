/**
 * F4-07 · Idempotenza (T-21) — risolve C-05.
 *
 * Lo scenario: l'operatore tocca "Conferma", la rete e' lenta, tocca di
 * nuovo. Senza questo, il secondo tap registra un secondo incasso.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { withIdempotency, purgeIdempotencyKeys } from '@/server/idempotency'
import { prisma } from '@/server/repositories/scoped'
import { DomainError } from '@/domain/errors'
import { makeClub } from './helpers'
import { randomUUID } from 'node:crypto'

let club: string
beforeAll(async () => { club = (await makeClub(prisma, 'idem')).club.id })
afterAll(async () => { await prisma.$disconnect() })

const pagamento = (key: string | undefined, esecuzioni: { n: number }) =>
  withIdempotency(
    { key, beachClubId: club, endpoint: 'POST /payments', body: { amount: 12000 } },
    async () => { esecuzioni.n++; return { status: 201, body: { id: 'pay-1', amount: 12000 } } },
  )

describe('doppio invio della stessa operazione', () => {
  it('esegue una sola volta e restituisce la stessa risposta', async () => {
    const key = randomUUID()
    const run = { n: 0 }

    const primo = await pagamento(key, run)
    const secondo = await pagamento(key, run)

    expect(run.n).toBe(1)                     // il lavoro e' avvenuto una volta sola
    expect(primo.replayed).toBe(false)
    expect(secondo.replayed).toBe(true)
    expect(secondo.body).toEqual(primo.body)
    expect(secondo.status).toBe(201)
  })

  it('senza chiave non protegge: due esecuzioni', async () => {
    const run = { n: 0 }
    await pagamento(undefined, run)
    await pagamento(undefined, run)
    expect(run.n).toBe(2)
  })

  it('stessa chiave con corpo diverso e un errore del client, non un retry', async () => {
    const key = randomUUID()
    await pagamento(key, { n: 0 })
    // Restituire la vecchia risposta nasconderebbe un bug reale del client.
    await expect(withIdempotency(
      { key, beachClubId: club, endpoint: 'POST /payments', body: { amount: 99999 } },
      async () => ({ status: 201, body: {} }),
    )).rejects.toBeInstanceOf(DomainError)
  })

  it('chiavi diverse restano indipendenti', async () => {
    const run = { n: 0 }
    await pagamento(randomUUID(), run)
    await pagamento(randomUUID(), run)
    expect(run.n).toBe(2)
  })
})

describe('pulizia', () => {
  it('rimuove solo le chiavi piu vecchie di 24 ore', async () => {
    const vecchia = randomUUID()
    await prisma.idempotencyKey.create({
      data: { key: vecchia, beachClubId: club, endpoint: 'x', requestHash: 'h',
              responseStatus: 200, responseBody: {},
              createdAt: new Date(Date.now() - 25 * 3_600_000) },
    })
    const recente = randomUUID()
    await pagamento(recente, { n: 0 })

    await purgeIdempotencyKeys()

    expect(await prisma.idempotencyKey.findUnique({ where: { key: vecchia } })).toBeNull()
    expect(await prisma.idempotencyKey.findUnique({ where: { key: recente } })).not.toBeNull()
  })
})
