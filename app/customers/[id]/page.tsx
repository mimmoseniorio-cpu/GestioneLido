import Link from 'next/link'
import { notFound } from 'next/navigation'
import { schedaCliente } from '@/server/queries/customers'
import { devContext } from '@/server/dev-session'
import { DomainError } from '@/domain/errors'
import Scheda from './Scheda'

export const dynamic = 'force-dynamic'

export default async function PaginaCliente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const dati = await schedaCliente(await devContext(), id)
    return (
      <>
        <header className="topbar">
          <Link href="/map" className="indietro">← Mappa</Link>
          <span className="brand">Scheda cliente</span>
        </header>
        <Scheda dati={dati} />
      </>
    )
  } catch (e) {
    if (e instanceof DomainError && e.code === 'NOT_FOUND') notFound()
    throw e
  }
}
