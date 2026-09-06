/**
 * Trovare o creare il cliente (F6-20).
 *
 * Sta qui, e non dentro la rotta, perché serve in due punti: la creazione
 * esplicita da `POST /customers` e la prenotazione al banco, che deve poterlo
 * fare NELLA STESSA TRANSAZIONE della prenotazione. Un cliente creato e poi
 * rimasto senza prenotazione, perché la seconda chiamata è fallita, è
 * sporcizia in anagrafica che nessuno ripulirà mai.
 */
import type { ScopedDb } from '@/server/repositories/scoped'
import { normalizzaTelefono } from '@/domain/customers/phone'

export type ClienteInput = {
  firstName?: string
  lastName: string
  phone?: string
}

export async function trovaOCreaCliente(db: ScopedDb, input: ClienteInput) {
  const esito = input.phone ? normalizzaTelefono(input.phone) : null
  const phoneNormalized = esito?.ok ? esito.e164 : null

  // C-80 · un duplicato non è un errore secco: è il cliente che esiste già.
  // Al banco è la norma, non l'eccezione: la stessa famiglia torna ogni anno.
  if (phoneNormalized) {
    const esistente = await db.customer.findFirst({ where: { phoneNormalized } })
    if (esistente) return { cliente: esistente, creato: false }
  }

  const cliente = await db.customer.create({
    data: {
      firstName: input.firstName?.trim() || 'Cliente',
      lastName: input.lastName.trim(),
      phoneRaw: input.phone ?? null,
      phoneNormalized,
    },
  })
  return { cliente, creato: true }
}
