/** Hash password staff (F4-01). Argon2id: nessun limite di lunghezza,
 *  parametri di default della libreria, gia' resistenti a GPU. */
import { hash, verify } from '@node-rs/argon2'

export const hashPassword = (plain: string) => hash(plain)

export async function verifyPassword(stored: string, plain: string) {
  try {
    return await verify(stored, plain)
  } catch {
    // Hash malformato (es. il placeholder del seed): mai far passare il login.
    return false
  }
}
