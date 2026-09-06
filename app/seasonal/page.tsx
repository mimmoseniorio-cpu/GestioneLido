import Link from 'next/link'
import { elencoStagionali } from '@/server/queries/seasonal'
import { scoped } from '@/server/repositories/scoped'
import { richiediStaff } from '@/server/current-user'
import Stagionali from './Stagionali'

export const dynamic = 'force-dynamic'

export default async function PaginaStagionali() {
  const ctx = await richiediStaff()
  const db = scoped(ctx)
  const [righe, ombrelloni, stagione] = await Promise.all([
    elencoStagionali(ctx),
    db.umbrella.findMany({ where: { blocked: false }, orderBy: { rowLabel: 'asc' } }),
    db.season.findFirst({ where: { status: 'ACTIVE' } }),
  ])

  return (
    <>
      <header className="topbar">
        <Link href="/map" className="indietro">← Mappa</Link>
        <span className="brand">Stagionali</span>
      </header>
      <Stagionali
        righe={righe}
        ombrelloni={(ombrelloni as any[]).map(u => ({ id: u.id, numero: u.visibleNumber, fila: u.rowLabel }))}
        stagione={stagione ? { dal: (stagione as any).startDate.toISOString().slice(0, 10),
                               al: (stagione as any).endDate.toISOString().slice(0, 10) } : null}
        puoGestire={ctx.actor === 'ADMIN'}
      />
    </>
  )
}
