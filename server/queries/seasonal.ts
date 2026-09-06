/** Elenco dei contratti stagionali con ciò che serve a gestirli. */
import type { Ctx } from '@/server/context'
import { scoped } from '@/server/repositories/scoped'

const iso = (d: Date) => d.toISOString().slice(0, 10)

export type RigaStagionale = {
  id: string
  cliente: string
  telefono: string | null
  ombrellone: string
  fila: string
  dal: string
  al: string
  prezzoCents: number
  creditoCents: number
  /** assenza attiva che copre oggi: è ciò che il gestore può vendere adesso */
  assenteOggi: { dal: string; al: string } | null
  assenzeFuture: number
}

export async function elencoStagionali(ctx: Ctx, oggi = new Date()): Promise<RigaStagionale[]> {
  const db = scoped(ctx)
  const g = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), oggi.getUTCDate()))

  const contratti = await db.seasonalContract.findMany({
    where: { status: 'ACTIVE' },
    include: { customer: true, umbrella: true },
    orderBy: { startDate: 'asc' },
  })
  if ((contratti as any[]).length === 0) return []

  const assenze = await db.seasonalAbsence.findMany({
    where: { status: 'ACTIVE', seasonalContractId: { in: (contratti as any[]).map(c => c.id) },
             endDate: { gte: g } },
  })

  return (contratti as any[])
    .map(c => {
      const sue = (assenze as any[]).filter(a => a.seasonalContractId === c.id)
      const oggiAssente = sue.find(a => a.startDate <= g && a.endDate >= g) ?? null
      return {
        id: c.id,
        cliente: `${c.customer.firstName} ${c.customer.lastName}`,
        telefono: c.customer.phoneNormalized ?? c.customer.phoneRaw,
        ombrellone: c.umbrella.visibleNumber,
        fila: c.umbrella.rowLabel,
        dal: iso(c.startDate), al: iso(c.endDate),
        prezzoCents: c.priceCents,
        creditoCents: c.creditBalanceCents,
        assenteOggi: oggiAssente ? { dal: iso(oggiAssente.startDate), al: iso(oggiAssente.endDate) } : null,
        assenzeFuture: sue.filter(a => a.startDate > g).length,
      }
    })
    // Prima chi è assente oggi: è il posto che il gestore può vendere adesso.
    .sort((a, b) =>
      Number(!!b.assenteOggi) - Number(!!a.assenteOggi) ||
      a.ombrellone.localeCompare(b.ombrellone, 'it', { numeric: true }))
}
