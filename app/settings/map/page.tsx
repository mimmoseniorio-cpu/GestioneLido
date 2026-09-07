import Link from 'next/link'
import { scoped } from '@/server/repositories/scoped'
import { richiediStaffCon } from '@/server/current-user'
import { P } from '@/domain/auth/permissions'
import Generatore from './Generatore'
import Disposizione from './Disposizione'
import { disposizione } from '@/server/queries/layout'

export const dynamic = 'force-dynamic'

export default async function ConfiguraMappa() {
  const ctx = await richiediStaffCon(P.MAP_EDIT)
  const db = scoped(ctx)
  const [ombrelloni, prenotazioni, contratti, disposta] = await Promise.all([
    db.umbrella.count(), db.reservationItem.count(), db.seasonalContract.count(),
    disposizione(ctx),
  ])
  return (
    <>
      <header className="topbar">
        <Link href="/map" className="indietro">← Mappa</Link>
        <span className="brand">Configura la mappa</span>
      </header>
      <main className="configura">
        <Disposizione dati={disposta} />
      </main>
      <Generatore
        ombrelloniEsistenti={ombrelloni}
        bloccato={prenotazioni > 0 || contratti > 0}
        prenotazioni={prenotazioni}
      />
    </>
  )
}
