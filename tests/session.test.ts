/**
 * F4-01 / D-18 · Sessioni staff.
 *
 * `docs/02` §4.1 chiede sessioni REVOCABILI: una sessione revocabile non può
 * essere un token autoconsistente, serve una riga da cancellare. Questi test
 * verificano che revocare funzioni davvero, non che il login vada a buon fine.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { accedi, contestoDaSessione, esci, revocaSessioniDi, purgaSessioni }
  from '@/server/auth/session'
import { hashPassword } from '@/server/auth/password'
import { prisma } from '@/server/repositories/scoped'
import { makeClub } from './helpers'
import { randomUUID } from 'node:crypto'

async function conUtente(label: string, password = 'segretissima') {
  const c = await makeClub(prisma, label)
  const email = `u-${randomUUID()}@test.it`
  const utente = await prisma.user.create({
    data: { beachClubId: c.club.id, email, name: 'Operatore',
            role: 'OPERATOR', passwordHash: await hashPassword(password) },
  })
  return { ...c, utente, email, password }
}

beforeAll(async () => { await prisma.$connect() })
afterAll(async () => { await prisma.$disconnect() })

describe('accesso', () => {
  it('con le credenziali giuste apre una sessione', async () => {
    const s = await conUtente('sess-ok')
    const esito = await accedi({ email: s.email, password: s.password })
    expect(esito.token.length).toBeGreaterThan(30)
    expect(esito.nome).toBe('Operatore')

    const ctx = await contestoDaSessione(esito.token)
    expect(ctx).not.toBeNull()
    expect(ctx!.userId).toBe(s.utente.id)
    expect(ctx!.actor).toBe('OPERATOR')
    expect(ctx!.beachClubId).toBe(s.club.id)
  })

  it('memorizza solo l’hash del token, mai il token', async () => {
    const s = await conUtente('sess-hash')
    const { token } = await accedi({ email: s.email, password: s.password })
    const righe = await prisma.session.findMany({ where: { userId: s.utente.id } })
    expect(righe).toHaveLength(1)
    expect(righe[0]!.tokenHash).not.toContain(token)
    expect(righe[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('la password sbagliata non entra', async () => {
    const s = await conUtente('sess-pwd')
    await expect(accedi({ email: s.email, password: 'sbagliata' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('un’email inesistente dà lo STESSO messaggio di una password sbagliata', async () => {
    // Messaggi diversi direbbero a un estraneo quali email esistono.
    const s = await conUtente('sess-enum')
    const a = await accedi({ email: s.email, password: 'no' }).catch(e => e.message)
    const b = await accedi({ email: 'nessuno@test.it', password: 'no' }).catch(e => e.message)
    expect(a).toBe(b)
  })

  it('un utente disattivato non entra e le sue sessioni non valgono più', async () => {
    const s = await conUtente('sess-inattivo')
    const { token } = await accedi({ email: s.email, password: s.password })
    await prisma.user.update({ where: { id: s.utente.id }, data: { active: false } })

    expect(await contestoDaSessione(token)).toBeNull()
    await expect(accedi({ email: s.email, password: s.password })).rejects.toThrow()
  })

  it('l’email non è sensibile alle maiuscole né agli spazi', async () => {
    const s = await conUtente('sess-maiuscole')
    const esito = await accedi({ email: `  ${s.email.toUpperCase()} `, password: s.password })
    expect(esito.nome).toBe('Operatore')
  })
})

describe('D-18 · revoca', () => {
  it('uscire spegne la sessione', async () => {
    const s = await conUtente('sess-esci')
    const { token } = await accedi({ email: s.email, password: s.password })
    expect(await contestoDaSessione(token)).not.toBeNull()
    await esci(token)
    expect(await contestoDaSessione(token)).toBeNull()
  })

  it('l’admin può spegnere TUTTE le sessioni di un utente', async () => {
    // È il motivo per cui la sessione è una riga e non un token autoconsistente.
    const s = await conUtente('sess-revoca')
    const a = await accedi({ email: s.email, password: s.password })
    const b = await accedi({ email: s.email, password: s.password })

    const quante = await revocaSessioniDi(s.utente.id)
    expect(quante).toBe(2)
    expect(await contestoDaSessione(a.token)).toBeNull()
    expect(await contestoDaSessione(b.token)).toBeNull()
  })

  it('una sessione scaduta non vale', async () => {
    const s = await conUtente('sess-scaduta')
    const { token } = await accedi({ email: s.email, password: s.password })
    await prisma.session.updateMany({
      where: { userId: s.utente.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    expect(await contestoDaSessione(token)).toBeNull()
  })

  it('un token inventato o troppo corto non vale', async () => {
    expect(await contestoDaSessione('x')).toBeNull()
    expect(await contestoDaSessione(undefined)).toBeNull()
    expect(await contestoDaSessione('token-lungo-ma-completamente-inventato')).toBeNull()
  })

  it('la pulizia rimuove solo le sessioni scadute da oltre un mese', async () => {
    const s = await conUtente('sess-purga')
    const { token } = await accedi({ email: s.email, password: s.password })
    await prisma.session.create({
      data: { beachClubId: s.club.id, userId: s.utente.id, tokenHash: randomUUID(),
              expiresAt: new Date(Date.now() - 60 * 86_400_000) },
    })
    await purgaSessioni()
    expect(await contestoDaSessione(token)).not.toBeNull()
    expect(await prisma.session.count({ where: { userId: s.utente.id } })).toBe(1)
  })
})
