/**
 * F6-06 · Magic link per l'area stagionale (D-05).
 *
 * Niente password: il cliente usa il servizio tre volte in un'estate e spesso
 * è una persona anziana. Il link si manda su WhatsApp e resta lì.
 *
 * Conseguenza da tenere presente (C-06): quel link verrà inoltrato, salvato
 * nella chat di famiglia, letto da chiunque abbia il telefono in mano. Per
 * questo il token è lungo, memorizzato **hashato**, revocabile, e la superficie
 * che apre è deliberatamente minima — solo il proprio ombrellone e la propria
 * assenza, mai l'anagrafica o i pagamenti.
 */
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'

const BYTE_TOKEN = 32

/** Genera un token nuovo. Il valore in chiaro esiste solo qui e nel link. */
export function generaToken(): { token: string; hash: string } {
  const token = randomBytes(BYTE_TOKEN).toString('base64url')
  return { token, hash: hashToken(token) }
}

export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex')

/** Confronto a tempo costante: un confronto normale perde informazione. */
export function tokenCorrisponde(token: string, hashAtteso: string): boolean {
  const a = Buffer.from(hashToken(token), 'hex')
  const b = Buffer.from(hashAtteso, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

/** L'indirizzo da mandare al cliente. */
export const urlPersonale = (base: string, token: string) =>
  `${base.replace(/\/$/, '')}/s/${token}`

/** Messaggio WhatsApp precompilato, modificabile prima dell'invio (RF-SYS-03). */
export function messaggioWhatsApp(nome: string, numero: string, link: string, club: string) {
  const testo =
    `Buongiorno ${nome}, questo è il suo link personale di ${club} per l'ombrellone ${numero}.\n\n` +
    `Se un giorno non viene, lo comunichi da qui: il posto resta suo, ma noi possiamo ` +
    `assegnarlo a qualcun altro solo per quel giorno.\n\n${link}`
  return testo
}
