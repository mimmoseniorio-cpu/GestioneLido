import Link from 'next/link'
import { calendario } from '@/server/queries/calendar'
import { richiediStaff } from '@/server/current-user'
import Griglia from './Griglia'

export const dynamic = 'force-dynamic'

export default async function PaginaCalendario({ searchParams }:
  { searchParams: Promise<{ dal?: string }> }) {
  const { dal } = await searchParams
  const o = new Date()
  const partenza = dal && /^\d{4}-\d{2}-\d{2}$/.test(dal)
    ? new Date(dal + 'T00:00:00Z')
    : new Date(Date.UTC(o.getUTCFullYear(), o.getUTCMonth(), o.getUTCDate()))

  const dati = await calendario(await richiediStaff(), partenza, 14)
  return (
    <>
      <header className="topbar">
        <Link href="/map" className="indietro">← Mappa</Link>
        <span className="brand">Calendario</span>
      </header>
      <Griglia dati={dati} />
    </>
  )
}
