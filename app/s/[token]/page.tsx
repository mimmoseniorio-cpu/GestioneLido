import { contestoDaToken } from '@/server/customer-session'
import { areaCliente } from '@/server/queries/customer-area'
import ClienteClient from './ClienteClient'
import LinkNonValido from './LinkNonValido'

export const dynamic = 'force-dynamic'

export default async function AreaStagionale({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const esito = await contestoDaToken(token)
  if (!esito.ok) return <LinkNonValido motivo={esito.motivo} />
  const dati = await areaCliente(esito.ctx.seasonalContractId)
  return <ClienteClient dati={dati} token={token} />
}
