import { redirect } from 'next/navigation'
import { contestoCorrente } from '@/server/current-user'
import Accesso from './Accesso'

export const dynamic = 'force-dynamic'

export default async function PaginaLogin() {
  if (await contestoCorrente()) redirect('/map')
  return <Accesso />
}
