import { redirect } from 'next/navigation'
import { contestoCorrente } from '@/server/current-user'
import { prisma } from '@/server/repositories/scoped'
import Sblocco from './Sblocco'

export const dynamic = 'force-dynamic'

/**
 * S-16 · Il tablet lasciato sul bancone.
 *
 * Questa pagina NON passa da `richiediStaff()`: sarebbe un rimando infinito,
 * perché è proprio dove `richiediStaff()` manda chi è bloccato.
 */
export default async function PaginaBlocco() {
  const ctx = await contestoCorrente()
  if (!ctx) redirect('/login')
  if (!ctx.bloccata) redirect('/map')

  const utente = await prisma.user.findUnique({ where: { id: ctx.userId } })
  const club = await prisma.beachClub.findUnique({ where: { id: ctx.beachClubId } })
  return <Sblocco nome={utente?.name ?? ''} club={club?.name ?? 'Stabilimento'} />
}
