import Link from 'next/link'
import { scoped } from '@/server/repositories/scoped'
import { richiediStaff } from '@/server/current-user'
import Generatore from './Generatore'

export const dynamic = 'force-dynamic'

export default async function ConfiguraMappa() {
  const ctx = await richiediStaff()
  const db = scoped(ctx)
  const [ombrelloni, prenotazioni, contratti] = await Promise.all([
    db.umbrella.count(), db.reservationItem.count(), db.seasonalContract.count(),
  ])
  return (
    <>
      <header className="topbar">
        <Link href="/map" className="indietro">← Mappa</Link>
        <span className="brand">Configura la mappa</span>
      </header>
      <Generatore
        ombrelloniEsistenti={ombrelloni}
        bloccato={prenotazioni > 0 || contratti > 0}
        prenotazioni={prenotazioni}
      />
    </>
  )
}
