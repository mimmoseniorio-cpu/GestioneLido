/**
 * PONTE TEMPORANEO fino a `F4-01`.
 *
 * L'autenticazione staff non è finita: manca la tabella `Session` (`D-18`).
 * Finché non c'è, il prototipo risolve il contesto prendendo il primo admin
 * del primo stabilimento.
 *
 * NON è un fallback da lasciare: è una funzione che dovrà sparire, e finché
 * esiste il prototipo non va esposto a nessuno.
 */
import { prisma } from '@/server/repositories/scoped'
import { readSettings, type Ctx } from '@/server/context'

export async function devContext(): Promise<Ctx> {
  const club = await prisma.beachClub.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!club) throw new Error('Nessuno stabilimento: esegui `npm run seed`.')
  const user = await prisma.user.findFirst({
    where: { beachClubId: club.id, role: 'ADMIN' }, orderBy: { createdAt: 'asc' },
  })
  if (!user) throw new Error('Nessun admin: esegui `npm run seed`.')
  return {
    kind: 'STAFF', beachClubId: club.id, userId: user.id, actor: 'ADMIN',
    timezone: club.timezone, settings: readSettings(club.settings),
  }
}
