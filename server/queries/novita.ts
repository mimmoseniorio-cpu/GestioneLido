/**
 * F6-29 · Cosa è successo mentre il gestore non guardava.
 *
 * Un'assenza dichiarata dal telefono di un cliente alle undici di sera è
 * capacità che si può vendere domani. Se nessuno la nota, il meccanismo che
 * vale il prodotto gira a vuoto: il posto resta vuoto e lo stagionale non
 * matura credito.
 *
 * Si guarda alle ultime 24 ore invece di tenere traccia di «ultima volta che
 * ha guardato»: uno stato di lettura per utente andrebbe azzerato, sincronizzato
 * fra i tablet e spiegato. La finestra fissa dice la stessa cosa e non ha
 * niente da mantenere.
 */
import type { Ctx } from '@/server/context'
import { scoped } from '@/server/repositories/scoped'

const iso = (d: Date) => d.toISOString().slice(0, 10)

export type Novita = {
  assenze: {
    id: string
    cliente: string
    ombrellone: string
    dal: string
    al: string
    tardiva: boolean
  }[]
}

export async function novita(ctx: Ctx, adesso = new Date()): Promise<Novita> {
  const db = scoped(ctx)
  const da = new Date(adesso.getTime() - 24 * 3_600_000)

  const assenze = await db.seasonalAbsence.findMany({
    where: {
      status: 'ACTIVE',
      // Solo quelle comunicate dal cliente: le altre le ha scritte lo staff.
      declaredBy: 'CUSTOMER',
      declaredAt: { gte: da },
      // Una già finita non è più capacità vendibile: sarebbe solo rumore.
      endDate: { gte: new Date(Date.UTC(
        adesso.getUTCFullYear(), adesso.getUTCMonth(), adesso.getUTCDate())) },
    },
    include: { contract: { include: { customer: true, umbrella: true } } },
    orderBy: { declaredAt: 'desc' },
  })

  return {
    assenze: (assenze as any[]).map(a => ({
      id: a.id,
      cliente: `${a.contract.customer.firstName} ${a.contract.customer.lastName}`.trim(),
      ombrellone: a.contract.umbrella.visibleNumber,
      dal: iso(a.startDate), al: iso(a.endDate),
      tardiva: a.isLate,
    })),
  }
}
