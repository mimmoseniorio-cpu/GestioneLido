/**
 * Idempotenza (F4-07) — risolve C-05.
 *
 * Lo scenario reale: l'operatore tocca "Conferma", la rete e' lenta, non
 * succede niente per due secondi, tocca di nuovo. Sul vincolo di
 * sovrapposizione la seconda prenotazione viene comunque respinta, ma su
 * "registra pagamento" produrrebbe due incassi.
 *
 * Costa poco ora ed e' un incubo da aggiungere dopo.
 */
import { createHash } from 'node:crypto'
import { prisma } from '@/server/repositories/scoped'
import { DomainError } from '@/domain/errors'

const RETENTION_HOURS = 24

const hashBody = (body: unknown) =>
  createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex')

export type IdempotentResult<T> = { replayed: boolean; status: number; body: T }

export async function withIdempotency<T>(
  args: { key: string | undefined; beachClubId: string; endpoint: string; body: unknown },
  run: () => Promise<{ status: number; body: T }>,
): Promise<IdempotentResult<T>> {
  if (!args.key) {
    const fresh = await run()
    return { replayed: false, ...fresh }
  }

  const requestHash = hashBody(args.body)
  const existing = await prisma.idempotencyKey.findUnique({ where: { key: args.key } })

  if (existing) {
    // Stessa chiave con corpo diverso: e' un errore del client, non un retry.
    // Restituire la vecchia risposta nasconderebbe un bug reale.
    if (existing.requestHash !== requestHash) {
      throw new DomainError('IDEMPOTENCY_MISMATCH',
        'La stessa chiave di idempotenza e stata usata per una richiesta diversa.')
    }
    return { replayed: true, status: existing.responseStatus, body: existing.responseBody as T }
  }

  const fresh = await run()
  await prisma.idempotencyKey.create({
    data: {
      key: args.key, beachClubId: args.beachClubId, endpoint: args.endpoint,
      requestHash, responseStatus: fresh.status, responseBody: fresh.body as never,
    },
  })
  return { replayed: false, ...fresh }
}

/** Pulizia periodica: le chiavi valgono 24 ore, poi sono rumore. */
export async function purgeIdempotencyKeys(now = new Date()) {
  const cutoff = new Date(now.getTime() - RETENTION_HOURS * 3_600_000)
  const { count } = await prisma.idempotencyKey.deleteMany({ where: { createdAt: { lt: cutoff } } })
  return count
}
