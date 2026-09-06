/**
 * F4-01 · Sessioni staff (D-18).
 *
 * Il token vive nel cookie; qui se ne conserva solo l'hash, come per il magic
 * link. La riga in tabella è ciò che rende la sessione REVOCABILE: un token
 * autoconsistente non si può spegnere prima della scadenza, e `docs/02` §4.1
 * chiede che l'admin possa farlo.
 *
 * Scadenza lunga di proposito: l'operatore non vuole rifare il login ogni
 * mattina. La protezione contro il tablet lasciato incustodito è il blocco con
 * PIN (`F6-32`), non una sessione che scade in fretta — una sessione corta
 * farebbe solo perdere dati a metà prenotazione.
 */
import { randomBytes, createHash } from 'node:crypto'
import { prisma } from '@/server/repositories/scoped'
import { verifyPassword } from '@/server/auth/password'
import { readSettings, type StaffContext } from '@/server/context'
import { DomainError } from '@/domain/errors'

export const NOME_COOKIE = 'lido_sess'
const DURATA_GIORNI = 30
const RINNOVA_DOPO_ORE = 12

const hash = (t: string) => createHash('sha256').update(t).digest('hex')

export type EsitoLogin = { token: string; scadenza: Date; nome: string; ruolo: string }

export async function accedi(input: {
  email: string; password: string; userAgent?: string | null; ip?: string | null
}): Promise<EsitoLogin> {
  const email = input.email.trim().toLowerCase()
  const utente = await prisma.user.findFirst({ where: { email, active: true } })

  // Stesso messaggio e stesso costo per utente inesistente e password
  // sbagliata: la differenza direbbe a un estraneo quali email esistono.
  const hashDiConfronto = utente?.passwordHash
    ?? '$argon2id$v=19$m=19456,t=2,p=1$aaaaaaaaaaaaaaaaaaaaaa$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  const valida = await verifyPassword(hashDiConfronto, input.password)
  if (!utente || !valida)
    throw new DomainError('FORBIDDEN', 'Email o password non corretti.')

  const token = randomBytes(32).toString('base64url')
  const scadenza = new Date(Date.now() + DURATA_GIORNI * 86_400_000)

  await prisma.session.create({
    data: {
      beachClubId: utente.beachClubId, userId: utente.id,
      tokenHash: hash(token), expiresAt: scadenza,
      userAgent: input.userAgent?.slice(0, 300) ?? null, ip: input.ip ?? null,
    },
  })
  await prisma.user.update({ where: { id: utente.id }, data: { lastLoginAt: new Date() } })

  return { token, scadenza, nome: utente.name, ruolo: utente.role }
}

export async function contestoDaSessione(token: string | undefined): Promise<StaffContext | null> {
  if (!token || token.length < 20) return null

  const sessione = await prisma.session.findUnique({
    where: { tokenHash: hash(token) },
    include: { user: true },
  })
  if (!sessione) return null
  if (sessione.revokedAt) return null
  if (sessione.expiresAt < new Date()) return null
  if (!sessione.user.active) return null

  // Si aggiorna solo ogni tanto: una scrittura a ogni richiesta trasformerebbe
  // ogni lettura della mappa in una scrittura.
  if (Date.now() - sessione.lastSeenAt.getTime() > RINNOVA_DOPO_ORE * 3_600_000) {
    await prisma.session.update({
      where: { id: sessione.id }, data: { lastSeenAt: new Date() },
    })
  }

  const club = await prisma.beachClub.findUnique({ where: { id: sessione.beachClubId } })
  if (!club) return null

  return {
    kind: 'STAFF',
    beachClubId: club.id,
    userId: sessione.userId,
    actor: sessione.user.role as 'ADMIN' | 'OPERATOR',
    timezone: club.timezone,
    settings: readSettings(club.settings),
  }
}

export async function esci(token: string | undefined) {
  if (!token) return
  await prisma.session.updateMany({
    where: { tokenHash: hash(token), revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

/** L'admin spegne tutte le sessioni di un utente: è il senso di D-18. */
export async function revocaSessioniDi(userId: string) {
  const { count } = await prisma.session.updateMany({
    where: { userId, revokedAt: null }, data: { revokedAt: new Date() },
  })
  return count
}

/** Pulizia: le sessioni scadute da oltre un mese sono solo rumore. */
export async function purgaSessioni(ora = new Date()) {
  const { count } = await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date(ora.getTime() - 30 * 86_400_000) } },
  })
  return count
}
