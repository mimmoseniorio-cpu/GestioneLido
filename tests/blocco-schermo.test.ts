/**
 * F6-32 · Blocco schermo con PIN.
 *
 * Il punto di questi test è uno solo: che il blocco NON sia un velo disegnato
 * nel browser. Il tablet resta sul bancone di uno stabilimento, con
 * l'anagrafica dei clienti dentro; se la protezione vive nella pagina, si
 * toglie con due tocchi negli strumenti di sviluppo. Quindi si verifica che
 * sia il server a rifiutare, e che si blocchi da solo anche a schermo spento.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { accedi, contestoDaSessione, blocca, sblocca } from '@/server/auth/session'
import { hashPassword } from '@/server/auth/password'
import { prisma } from '@/server/repositories/scoped'
import { TENTATIVI_MASSIMI } from '@/domain/auth/pin'
import { makeClub } from './helpers'
import { randomUUID } from 'node:crypto'

const PASSWORD = 'segretissima'
const PIN = '2604'

async function conPin(label: string, opzioni: { pin?: string | null; minuti?: number } = {}) {
  const c = await makeClub(prisma, label)
  if (opzioni.minuti !== undefined) {
    await prisma.beachClub.update({
      where: { id: c.club.id },
      data: { settings: { screenLockMinutes: opzioni.minuti } },
    })
  }
  const email = `u-${randomUUID()}@test.it`
  const pin = opzioni.pin === null ? null : await hashPassword(opzioni.pin ?? PIN)
  const utente = await prisma.user.create({
    data: { beachClubId: c.club.id, email, name: 'Operatore', role: 'OPERATOR',
            passwordHash: await hashPassword(PASSWORD), pinHash: pin },
  })
  const { token } = await accedi({ email, password: PASSWORD })
  return { ...c, utente, email, token }
}

const sessioneDi = async (userId: string) =>
  prisma.session.findFirstOrThrow({ where: { userId } })

beforeAll(async () => { await prisma.$connect() })
afterAll(async () => { await prisma.$disconnect() })

describe('blocco a mano', () => {
  it('dopo il blocco la sessione è viva, ma bloccata', async () => {
    const s = await conPin('mano')
    expect((await contestoDaSessione(s.token))!.bloccata).toBe(false)

    await blocca(s.token)

    const ctx = await contestoDaSessione(s.token)
    // Viva: la coda delle scritture e il punto in cui si era non si perdono.
    expect(ctx).not.toBeNull()
    expect(ctx!.userId).toBe(s.utente.id)
    // Ma bloccata: `richiediStaffApi` da qui in poi risponde 423.
    expect(ctx!.bloccata).toBe(true)
  })
})

describe('blocco automatico — deve funzionare a schermo spento', () => {
  it('si blocca da solo dopo i minuti di inattività', async () => {
    const s = await conPin('auto', { minuti: 10 })
    await prisma.session.updateMany({
      where: { userId: s.utente.id },
      data: { lastSeenAt: new Date(Date.now() - 11 * 60_000) },
    })
    // Nessuna pagina ha girato nel frattempo: è il server ad accorgersene.
    expect((await contestoDaSessione(s.token))!.bloccata).toBe(true)
    expect((await sessioneDi(s.utente.id)).lockedAt).not.toBeNull()
  })

  it('prima della scadenza resta aperta', async () => {
    const s = await conPin('auto2', { minuti: 10 })
    await prisma.session.updateMany({
      where: { userId: s.utente.id },
      data: { lastSeenAt: new Date(Date.now() - 5 * 60_000) },
    })
    expect((await contestoDaSessione(s.token))!.bloccata).toBe(false)
  })

  it('senza PIN non si blocca mai: chiuderebbe fuori chi non può rientrare', async () => {
    const s = await conPin('senzaPin', { pin: null, minuti: 10 })
    await prisma.session.updateMany({
      where: { userId: s.utente.id },
      data: { lastSeenAt: new Date(Date.now() - 600 * 60_000) },
    })
    expect((await contestoDaSessione(s.token))!.bloccata).toBe(false)
  })

  it('a zero minuti resta solo il blocco a mano', async () => {
    const s = await conPin('zero', { minuti: 0 })
    await prisma.session.updateMany({
      where: { userId: s.utente.id },
      data: { lastSeenAt: new Date(Date.now() - 600 * 60_000) },
    })
    expect((await contestoDaSessione(s.token))!.bloccata).toBe(false)
    await blocca(s.token)
    expect((await contestoDaSessione(s.token))!.bloccata).toBe(true)
  })

  it('l’uso tiene sveglio il tablet: l’attività si annota', async () => {
    const s = await conPin('attivita', { minuti: 10 })
    await prisma.session.updateMany({
      where: { userId: s.utente.id },
      data: { lastSeenAt: new Date(Date.now() - 5 * 60_000) },
    })
    await contestoDaSessione(s.token)
    const dopo = await sessioneDi(s.utente.id)
    expect(Date.now() - dopo.lastSeenAt.getTime()).toBeLessThan(60_000)
  })
})

describe('sbloccare', () => {
  it('il PIN giusto riapre la stessa sessione, senza rifare il login', async () => {
    const s = await conPin('apre')
    await blocca(s.token)
    expect(await sblocca(s.token, PIN)).toEqual({ esito: 'APERTO' })

    const ctx = await contestoDaSessione(s.token)
    expect(ctx!.bloccata).toBe(false)
    expect(ctx!.userId).toBe(s.utente.id)   // è la stessa sessione, non una nuova
  })

  it('il PIN sbagliato non apre, e dice quanti tentativi restano', async () => {
    const s = await conPin('errato')
    await blocca(s.token)
    const esito = await sblocca(s.token, '9999')
    expect(esito).toEqual({ esito: 'PIN_ERRATO', tentativiRimasti: TENTATIVI_MASSIMI - 1 })
    expect((await contestoDaSessione(s.token))!.bloccata).toBe(true)
  })

  it('un tentativo andato a buon fine azzera i precedenti errori', async () => {
    const s = await conPin('azzera')
    await blocca(s.token)
    await sblocca(s.token, '9999')
    await sblocca(s.token, '9999')
    await sblocca(s.token, PIN)
    expect((await sessioneDi(s.utente.id)).pinAttempts).toBe(0)
  })

  it('dopo troppi errori la sessione si chiude: quattro cifre non reggono un attacco', async () => {
    const s = await conPin('forza')
    await blocca(s.token)
    for (let i = 1; i < TENTATIVI_MASSIMI; i++) {
      expect((await sblocca(s.token, '9999')).esito).toBe('PIN_ERRATO')
    }
    expect(await sblocca(s.token, '9999')).toEqual({ esito: 'SESSIONE_CHIUSA' })

    // E da lì nemmeno il PIN giusto vale più: si rientra con la password.
    expect(await sblocca(s.token, PIN)).toEqual({ esito: 'SESSIONE_CHIUSA' })
    expect(await contestoDaSessione(s.token)).toBeNull()
  })

  it('un token inventato non sblocca nulla', async () => {
    expect(await sblocca('token-che-non-esiste-ma-abbastanza-lungo', PIN))
      .toEqual({ esito: 'SESSIONE_CHIUSA' })
  })

  it('il PIN di un altro utente non apre questa sessione', async () => {
    const a = await conPin('tizio')
    await conPin('caio', { pin: '7391' })
    await blocca(a.token)
    expect((await sblocca(a.token, '7391')).esito).toBe('PIN_ERRATO')
  })
})

describe('togliere il PIN', () => {
  it('riapre le sessioni bloccate: senza PIN non ci sarebbe modo di rientrare', async () => {
    const s = await conPin('togli')
    await blocca(s.token)
    expect((await contestoDaSessione(s.token))!.bloccata).toBe(true)

    // Quello che fa la rotta: toglie il PIN e riapre ciò che era bloccato.
    await prisma.user.update({ where: { id: s.utente.id }, data: { pinHash: null } })
    await prisma.session.updateMany({
      where: { userId: s.utente.id, lockedAt: { not: null } },
      data: { lockedAt: null, pinAttempts: 0 },
    })
    expect((await contestoDaSessione(s.token))!.bloccata).toBe(false)
  })
})
