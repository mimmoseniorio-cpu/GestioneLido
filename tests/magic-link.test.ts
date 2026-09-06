/**
 * F6-06 · Magic link (T-19, T-62, T-63, T-64).
 *
 * Il link finirà inoltrato su WhatsApp e salvato nella chat di famiglia
 * (C-06). Queste prove verificano che, anche se lo apre qualcun altro, la
 * superficie resti quella minima: il proprio ombrellone e la propria assenza.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { generaToken, hashToken, tokenCorrisponde, urlPersonale, messaggioWhatsApp }
  from '@/server/auth/magic-link'
import { contestoDaToken } from '@/server/customer-session'
import { declareAbsence } from '@/server/use-cases/absences'
import { prisma } from '@/server/repositories/scoped'
import { makeClub, day } from './helpers'

const GIORNO = 86_400_000
const fraGiorni = (n: number) => {
  const o = new Date()
  return new Date(Date.UTC(o.getUTCFullYear(), o.getUTCMonth(), o.getUTCDate()) + n * GIORNO)
}

async function conContratto(label: string) {
  const c = await makeClub(prisma, label)
  await prisma.season.update({ where: { id: c.season.id },
    data: { status: 'ACTIVE', startDate: fraGiorni(-30), endDate: fraGiorni(60) } })
  const { token, hash } = generaToken()
  const contratto = await prisma.seasonalContract.create({
    data: { beachClubId: c.club.id, seasonId: c.season.id, customerId: c.customer.id,
            umbrellaId: c.umbrella.id, startDate: fraGiorni(-30), endDate: fraGiorni(60),
            priceCents: 180000, accessTokenHash: hash },
  })
  return { ...c, contratto, token }
}

beforeAll(async () => { await prisma.$connect() })
afterAll(async () => { await prisma.$disconnect() })

describe('generazione del token', () => {
  it('produce token lunghi e sempre diversi', () => {
    const a = generaToken(), b = generaToken()
    expect(a.token).not.toBe(b.token)
    expect(a.token.length).toBeGreaterThanOrEqual(40)   // 32 byte in base64url
  })

  it('memorizza solo l’hash, mai il token in chiaro', () => {
    const { token, hash } = generaToken()
    expect(hash).not.toContain(token)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hashToken(token)).toBe(hash)
  })

  it('riconosce il token giusto e rifiuta quello sbagliato', () => {
    const { token, hash } = generaToken()
    expect(tokenCorrisponde(token, hash)).toBe(true)
    expect(tokenCorrisponde(generaToken().token, hash)).toBe(false)
  })

  it('compone il link e un messaggio WhatsApp comprensibile', () => {
    const link = urlPersonale('https://lido.example/', 'abc')
    expect(link).toBe('https://lido.example/s/abc')
    const m = messaggioWhatsApp('Luigi', '51', link, 'Lido Adriano')
    expect(m).toContain('Luigi')
    expect(m).toContain('ombrellone 51')
    expect(m).toContain(link)
    // La promessa che convince a comunicare l'assenza.
    expect(m).toContain('il posto resta suo')
  })
})

describe('apertura del link', () => {
  it('un token valido apre il contratto giusto', async () => {
    const s = await conContratto('ml-ok')
    const e = await contestoDaToken(s.token)
    expect(e.ok).toBe(true)
    if (!e.ok) return
    expect(e.ctx.seasonalContractId).toBe(s.contratto.id)
    expect(e.ctx.actor).toBe('SEASONAL_CUSTOMER')
    expect(e.ctx.beachClubId).toBe(s.club.id)
  })

  it('T-64 · un token revocato non apre più nulla', async () => {
    const s = await conContratto('ml-revoked')
    await prisma.seasonalContract.update({ where: { id: s.contratto.id },
      data: { tokenRevokedAt: new Date() } })
    const e = await contestoDaToken(s.token)
    expect(e).toEqual({ ok: false, motivo: 'REVOCATO' })
  })

  it('T-64 · a stagione chiusa il link si spegne da solo', async () => {
    const s = await conContratto('ml-closed')
    await prisma.season.update({ where: { id: s.season.id }, data: { status: 'CLOSED' } })
    const e = await contestoDaToken(s.token)
    expect(e).toEqual({ ok: false, motivo: 'STAGIONE_CHIUSA' })
  })

  it('un contratto annullato spegne il link', async () => {
    const s = await conContratto('ml-cancelled')
    await prisma.seasonalContract.update({ where: { id: s.contratto.id },
      data: { status: 'CANCELLED' } })
    expect((await contestoDaToken(s.token)).ok).toBe(false)
  })

  it('un token inventato non apre nulla', async () => {
    expect(await contestoDaToken('questo-token-non-esiste-ma-e-lungo-abbastanza'))
      .toEqual({ ok: false, motivo: 'NON_VALIDO' })
  })

  it('un token corto viene respinto senza nemmeno interrogare il database', async () => {
    expect(await contestoDaToken('x')).toEqual({ ok: false, motivo: 'NON_VALIDO' })
    expect(await contestoDaToken('')).toEqual({ ok: false, motivo: 'NON_VALIDO' })
  })
})

describe('T-19 / T-62 · la superficie che il link apre', () => {
  it('il cliente può dichiarare SOLO la propria assenza', async () => {
    const a = await conContratto('ml-own-a')
    const b = await conContratto('ml-own-b')
    const ea = await contestoDaToken(a.token)
    expect(ea.ok).toBe(true)
    if (!ea.ok) return

    // Passa il contratto di B, ma il contesto è quello di A: il contractId
    // del client viene ignorato per i clienti (docs/04 §3.2).
    await declareAbsence(ea.ctx, {
      contractId: b.contratto.id, from: fraGiorni(1), to: fraGiorni(1),
    })
    expect(await prisma.seasonalAbsence.count({
      where: { seasonalContractId: b.contratto.id } })).toBe(0)
    expect(await prisma.seasonalAbsence.count({
      where: { seasonalContractId: a.contratto.id } })).toBe(1)
  })

  it('T-62 · il cliente non raggiunge nessuna azione dello staff', async () => {
    const s = await conContratto('ml-staff')
    const e = await contestoDaToken(s.token)
    if (!e.ok) throw new Error('atteso ok')

    const { createReservation } = await import('@/server/use-cases/reservations')
    await expect(createReservation(e.ctx, {
      umbrellaIds: [s.umbrella.id], customerId: s.customer.id,
      from: fraGiorni(1), to: fraGiorni(1),
    })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
