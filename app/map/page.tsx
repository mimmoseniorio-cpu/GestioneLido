import { getMapForDate } from '@/server/queries/map'
import { richiediStaff } from '@/server/current-user'
import MapClient from './MapClient'

export const dynamic = 'force-dynamic'

export default async function MapPage() {
  const ctx = await richiediStaff()
  const oggi = new Date()
  const date = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), oggi.getUTCDate()))
  const iniziale = await getMapForDate(ctx, date)
  const club = { name: 'Stabilimento' }
  return <MapClient iniziale={iniziale} clubName={club.name} />
}
