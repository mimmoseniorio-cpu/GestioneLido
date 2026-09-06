import Link from 'next/link'
import { scoped } from '@/server/repositories/scoped'
import { devContext } from '@/server/dev-session'
import Listino from './Listino'

export const dynamic = 'force-dynamic'

export default async function PaginaListino() {
  const ctx = await devContext()
  const db = scoped(ctx)
  const stagione = await db.season.findFirst({ where: { status: 'ACTIVE' } })
  const [regole, zone, ombrelloni] = await Promise.all([
    stagione ? db.priceRule.findMany({
      where: { seasonId: (stagione as any).id },
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
    }) : Promise.resolve([]),
    db.zone.findMany({ orderBy: { sortOrder: 'asc' } }),
    db.umbrella.findMany({ orderBy: { rowLabel: 'asc' }, take: 400 }),
  ])

  return (
    <>
      <header className="topbar">
        <Link href="/map" className="indietro">← Mappa</Link>
        <span className="brand">Listino</span>
      </header>
      <Listino
        regole={JSON.parse(JSON.stringify(regole))}
        zone={(zone as any[]).map(z => ({ id: z.id, name: z.name }))}
        ombrelloni={(ombrelloni as any[]).map(u => ({ id: u.id, numero: u.visibleNumber }))}
      />
    </>
  )
}
