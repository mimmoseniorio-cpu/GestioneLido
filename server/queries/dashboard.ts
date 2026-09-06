/**
 * F6-24 · Dashboard giornaliera (RF-DSH).
 *
 * Non sostituisce la mappa e non è un cruscotto di grafici: ogni numero deve
 * guidare un'azione, e ogni numero della colonna «da fare» è cliccabile.
 * Una dashboard che informa senza permettere di agire fa perdere tempo.
 *
 * Le tre voci di incasso sono definite in modo diverso, e la differenza conta:
 *  · previsto   = quota giornaliera di ciò che è occupato oggi
 *  · incassato  = pagamenti registrati oggi, a qualunque prenotazione
 *  · da incassare = saldi ancora aperti sulle prenotazioni attive oggi
 */
import type { Ctx } from '@/server/context'
import { scoped } from '@/server/repositories/scoped'
import { umbrellaState, isSellable } from '@/domain/umbrella/state'

const GIORNO = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
const soloGiorno = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

export type Dashboard = {
  data: string
  occupazione: {
    totali: number; occupati: number; liberi: number; vendibili: number
    stagionali: number; assenti: number; fuoriServizio: number; percentuale: number
  }
  incassi: {
    previstoOggiCents: number
    incassatoOggiCents: number
    daIncassareCents: number
    quantiDaIncassare: number
  }
  recupero: { oggi: number; oggiCents: number; stagione: number; stagioneCents: number }
  daFare: { etichetta: string; valore: string; azione: string }[]
  prossimiGiorni: { data: string; percentuale: number; vendibili: number }[]
}

export async function dashboard(ctx: Ctx, giorno = new Date()): Promise<Dashboard> {
  const db = scoped(ctx)
  const oggi = soloGiorno(giorno)
  const fine = new Date(oggi.getTime() + 7 * GIORNO)

  const [umbrellas, contratti, assenze, itemsFinestra, pagamentiOggi, stagione] = await Promise.all([
    db.umbrella.findMany(),
    db.seasonalContract.findMany({
      where: { status: 'ACTIVE', startDate: { lte: fine }, endDate: { gte: oggi } },
    }),
    db.seasonalAbsence.findMany({
      where: { status: 'ACTIVE', startDate: { lte: fine }, endDate: { gte: oggi } },
    }),
    db.reservationItem.findMany({
      where: { status: { in: ['CONFIRMED', 'CHECKED_IN'] },
               startDate: { lte: fine }, endDate: { gte: oggi } },
      include: { reservation: { include: { payments: true } } },
    }),
    db.payment.findMany({
      where: { paidAt: { gte: oggi, lt: new Date(oggi.getTime() + GIORNO) } },
    }),
    db.season.findFirst({ where: { status: 'ACTIVE' } }),
  ])

  const copre = (r: { startDate: Date; endDate: Date }, d: Date) => d >= r.startDate && d <= r.endDate
  const assenzePerContratto = new Map<string, any[]>()
  for (const a of assenze as any[])
    assenzePerContratto.set(a.seasonalContractId, [...(assenzePerContratto.get(a.seasonalContractId) ?? []), a])

  /** Stato di tutti gli ombrelloni in un giorno: nessuna query, solo memoria. */
  const statiDelGiorno = (d: Date) => (umbrellas as any[]).map(u => {
    const contratto = (contratti as any[]).find(c => c.umbrellaId === u.id && copre(c, d)) ?? null
    const assenza = contratto
      ? (assenzePerContratto.get(contratto.id) ?? []).find(a => copre(a, d)) ?? null : null
    const item = (itemsFinestra as any[]).find(i => i.umbrellaId === u.id && copre(i, d)) ?? null
    return umbrellaState({
      umbrella: { blocked: u.blocked, blockedUntil: u.blockedUntil },
      date: d, today: oggi, contract: contratto, absence: assenza, item,
    })
  })

  const statiOggi = statiDelGiorno(oggi)
  const conta = (s: string) => statiOggi.filter(x => x === s).length
  const totali = statiOggi.length

  // Quota giornaliera: il prezzo copre l'intero periodo, ma qui interessa oggi.
  const itemsOggi = (itemsFinestra as any[]).filter(i => copre(i, oggi))
  const quotaGiorno = (i: any) =>
    Math.round(i.priceCents / (Math.round((i.endDate - i.startDate) / GIORNO) + 1))
  const previstoOggiCents = itemsOggi.reduce((s, i) => s + quotaGiorno(i), 0)

  const prenotazioniOggi = new Map<string, any>()
  for (const i of itemsOggi) prenotazioniOggi.set(i.reservationId, i.reservation)
  const saldi = [...prenotazioniOggi.values()].map(r =>
    r.totalCents - r.payments.reduce((s: number, p: any) => s + p.amountCents, 0))
  const daIncassareCents = saldi.filter(x => x > 0).reduce((s, x) => s + x, 0)

  const temporaneiOggi = itemsOggi.filter(i => i.isTemporarySlot)
  const recuperiStagione = stagione
    ? await db.reservationItem.findMany({
        where: { isTemporarySlot: true, status: { in: ['CONFIRMED', 'CHECKED_IN'] },
                 startDate: { gte: (stagione as any).startDate },
                 endDate: { lte: (stagione as any).endDate } },
      })
    : []

  const vendibiliOggi = statiOggi.filter(isSellable).length

  const prossimiGiorni = Array.from({ length: 7 }, (_, k) => {
    const d = new Date(oggi.getTime() + (k + 1) * GIORNO)
    const stati = statiDelGiorno(d)
    const occ = stati.filter(x => x === 'OCCUPATO' || x === 'PRENOTATO').length
    return {
      data: iso(d),
      percentuale: stati.length === 0 ? 0 : Math.round((occ / stati.length) * 100),
      vendibili: stati.filter(isSellable).length,
    }
  })

  const daFare: Dashboard['daFare'] = []
  if (saldi.filter(x => x > 0).length > 0)
    daFare.push({
      etichetta: 'prenotazioni da incassare',
      valore: `${saldi.filter(x => x > 0).length} · ` +
              (daIncassareCents / 100).toLocaleString('it-IT',
                { style: 'currency', currency: 'EUR' }),
      azione: '/map',
    })
  if (vendibiliOggi > 0)
    daFare.push({ etichetta: 'posti da vendere oggi', valore: String(vendibiliOggi), azione: '/map' })
  if (conta('BLOCCATO') > 0)
    daFare.push({ etichetta: 'ombrelloni fuori servizio', valore: String(conta('BLOCCATO')), azione: '/map' })

  return {
    data: iso(oggi),
    occupazione: {
      totali,
      occupati: conta('OCCUPATO'),
      liberi: conta('LIBERO'),
      vendibili: vendibiliOggi,
      stagionali: conta('STAGIONALE_PRESENTE'),
      assenti: conta('TEMP_DISPONIBILE'),
      fuoriServizio: conta('BLOCCATO'),
      percentuale: totali === 0 ? 0 : Math.round((conta('OCCUPATO') / totali) * 100),
    },
    incassi: {
      previstoOggiCents,
      incassatoOggiCents: (pagamentiOggi as any[]).reduce((s, p) => s + p.amountCents, 0),
      daIncassareCents,
      quantiDaIncassare: saldi.filter(x => x > 0).length,
    },
    recupero: {
      oggi: temporaneiOggi.length,
      oggiCents: temporaneiOggi.reduce((s, i) => s + quotaGiorno(i), 0),
      stagione: (recuperiStagione as any[]).length,
      stagioneCents: (recuperiStagione as any[]).reduce((s, i) => s + i.priceCents, 0),
    },
    daFare,
    prossimiGiorni,
  }
}
