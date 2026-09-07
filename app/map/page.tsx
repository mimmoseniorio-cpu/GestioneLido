import { getMapForDate } from '@/server/queries/map'
import { novita } from '@/server/queries/novita'
import { richiediStaff } from '@/server/current-user'
import { prisma } from '@/server/repositories/scoped'
import MapClient from './MapClient'

export const dynamic = 'force-dynamic'

export default async function MapPage() {
  const ctx = await richiediStaff()
  const oggi = new Date()
  const date = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), oggi.getUTCDate()))
  // Il nome era fisso a «Stabilimento»: si notava appena in cima alla pagina,
  // ma da F6-28 finisce dentro i messaggi che i clienti ricevono su WhatsApp.
  const [iniziale, club, nuove] = await Promise.all([
    getMapForDate(ctx, date),
    prisma.beachClub.findUnique({ where: { id: ctx.beachClubId }, select: { name: true } }),
    novita(ctx),
  ])
  // F6-32 · minuti di inattività dopo i quali il tablet si blocca da solo.
  // Zero se questo utente non ha un PIN: bloccarlo lo chiuderebbe fuori.
  const utente = await prisma.user.findUnique({
    where: { id: ctx.userId }, select: { pinHash: true } })
  return <MapClient iniziale={iniziale} clubName={club?.name ?? 'Stabilimento'}
                    novita={nuove}
                    minutiBlocco={utente?.pinHash ? ctx.settings.screenLockMinutes : 0}
                    ruolo={ctx.actor} />
}
