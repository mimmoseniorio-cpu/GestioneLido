/**
 * Dati dell'area cliente stagionale (C-01).
 *
 * Superficie minima per scelta (C-06): il proprio ombrellone, il calendario
 * delle assenze e il credito. Nessuna anagrafica, nessun pagamento, nessun
 * dato di altri clienti — il link finirà inoltrato su WhatsApp.
 */
import { prisma } from '@/server/repositories/scoped'
import { giorniVenduti } from '@/domain/seasonal/intervals'

const iso = (d: Date) => d.toISOString().slice(0, 10)

export type AssenzaVista = {
  id: string
  dal: string
  al: string
  giorni: number
  tardiva: boolean
  /** giorni già assegnati ad altri: non più annullabili (D-01) */
  giorniVenduti: string[]
  annullabile: boolean
}

export type AreaCliente = {
  clubName: string
  clubPhone: string | null
  nome: string
  numeroOmbrellone: string
  fila: string
  dal: string
  al: string
  creditoCents: number
  assenze: AssenzaVista[]
  crediti: { data: string; descrizione: string; importoCents: number }[]
}

export async function areaCliente(contractId: string): Promise<AreaCliente> {
  const contratto = await prisma.seasonalContract.findUniqueOrThrow({
    where: { id: contractId },
    include: { customer: true, umbrella: true },
  })
  const club = await prisma.beachClub.findUniqueOrThrow({ where: { id: contratto.beachClubId } })

  const assenze = await prisma.seasonalAbsence.findMany({
    where: { seasonalContractId: contratto.id, status: 'ACTIVE' },
    orderBy: { startDate: 'asc' },
  })

  const vendite = await prisma.reservationItem.findMany({
    where: { seasonalAbsenceId: { in: assenze.map(a => a.id) },
             status: { in: ['CONFIRMED', 'CHECKED_IN'] } },
  })

  const crediti = await prisma.creditTransaction.findMany({
    where: { seasonalContractId: contratto.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })

  return {
    clubName: club.name,
    clubPhone: (club.settings as any)?.phone ?? null,
    nome: contratto.customer.firstName,
    numeroOmbrellone: contratto.umbrella.visibleNumber,
    fila: contratto.umbrella.rowLabel,
    dal: iso(contratto.startDate),
    al: iso(contratto.endDate),
    creditoCents: contratto.creditBalanceCents,
    assenze: assenze.map(a => {
      const venduti = giorniVenduti(
        { da: a.startDate, a: a.endDate },
        vendite.filter(v => v.seasonalAbsenceId === a.id)
               .map(v => ({ da: v.startDate, a: v.endDate })),
      ).map(iso)
      const giorni = Math.round((a.endDate.getTime() - a.startDate.getTime()) / 86_400_000) + 1
      return {
        id: a.id, dal: iso(a.startDate), al: iso(a.endDate), giorni,
        tardiva: a.isLate, giorniVenduti: venduti,
        annullabile: venduti.length < giorni,
      }
    }),
    crediti: crediti.map(c => ({
      data: iso(c.createdAt), descrizione: c.description, importoCents: c.amountCents,
    })),
  }
}
