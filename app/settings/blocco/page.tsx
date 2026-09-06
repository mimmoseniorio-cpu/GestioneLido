import { prisma } from '@/server/repositories/scoped'
import { richiediStaff } from '@/server/current-user'
import ImpostaPin from './ImpostaPin'

export const dynamic = 'force-dynamic'

export default async function PaginaBlocco() {
  const ctx = await richiediStaff()
  const utente = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } })
  return (
    <ImpostaPin
      haPin={utente.pinHash !== null}
      nome={utente.name}
      minuti={ctx.settings.screenLockMinutes}
    />
  )
}
