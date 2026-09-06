/**
 * F6-19 · Incassi e rimborsi — `C-45`, `C-46`, `C-48` di `docs/09`.
 *
 * Il rimborso è la prima operazione del prodotto che fa USCIRE soldi. Se
 * sbaglia, non se ne accorge nessuno finché non si chiude la cassa la sera, e
 * a quel punto non si sa nemmeno da dove ripartire. Per questo il segno è nel
 * dato, il motivo è obbligatorio e la soglia dipende dal ruolo.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createReservation } from '@/server/use-cases/reservations'
import { registraIncasso, registraRimborso, statoDa } from '@/server/use-cases/payments'
import { cancelReservation } from '@/server/use-cases/reservations'
import { dashboard } from '@/server/queries/dashboard'
import { prisma, scoped } from '@/server/repositories/scoped'
import { DEFAULT_SETTINGS, type Ctx } from '@/server/context'
import { makeClub, day } from './helpers'

const ctxDi = (beachClubId: string, userId: string,
               actor: 'ADMIN' | 'OPERATOR' = 'ADMIN'): Ctx => ({
  kind: 'STAFF', beachClubId, userId, actor,
  timezone: 'Europe/Rome', settings: DEFAULT_SETTINGS,
})

async function scenario(label: string) {
  const c = await makeClub(prisma, label)
  await prisma.season.update({ where: { id: c.season.id }, data: { status: 'ACTIVE' } })
  await prisma.priceRule.create({
    data: { beachClubId: c.club.id, seasonId: c.season.id, name: 'Base',
            priority: 0, priceCents: 2500 },
  })
  const ctx = ctxDi(c.club.id, c.user.id)
  const prenotazione = await createReservation(ctx, {
    umbrellaIds: [c.umbrella.id], cliente: { lastName: label },
    from: day(2030, 8, 10), to: day(2030, 8, 12),      // 3 giorni · 25 € = 75 €
  })
  return { ...c, ctx, operatore: ctxDi(c.club.id, c.user.id, 'OPERATOR'),
           prenotazione, db: scoped(ctx) }
}

const stato = (id: string) =>
  prisma.reservation.findUniqueOrThrow({ where: { id } }).then(r => r.paymentStatus)

beforeAll(async () => { await prisma.$connect() })
afterAll(async () => { await prisma.$disconnect() })

// ─────────────────────────────────────────────────────────────────────────
describe('statoDa · lo stato si ricalcola, non si incrementa', () => {
  it('l’ordine dei movimenti non cambia il risultato', () => {
    const movimenti = [{ amountCents: 5000 }, { amountCents: -2000 }, { amountCents: 2500 }]
    const dritto = statoDa(movimenti, 7500)
    const rovescio = statoDa([...movimenti].reverse(), 7500)
    expect(dritto).toBe(rovescio)
    expect(dritto).toBe('PARTIAL')     // 55 € su 75
  })

  it('rimborsato per intero è REFUNDED, non UNPAID', () => {
    // La differenza conta: «mai pagato» e «pagato e restituito» sono due
    // giornate diverse, e a fine stagione si leggono in modo diverso.
    expect(statoDa([{ amountCents: 7500 }, { amountCents: -7500 }], 7500)).toBe('REFUNDED')
    expect(statoDa([], 7500)).toBe('UNPAID')
  })

  it('pagato oltre il dovuto resta PAID', () => {
    expect(statoDa([{ amountCents: 8000 }], 7500)).toBe('PAID')
  })
})

// ─────────────────────────────────────────────────────────────────────────
describe('C-45 · pagamento superiore al totale', () => {
  it('non blocca l’incasso, ma segnala l’eccedenza', async () => {
    const s = await scenario('c45')
    const r = await registraIncasso(s.db, s.ctx, {
      reservationId: s.prenotazione.id, amountCents: 8000,
    })
    // Rifiutare i soldi già in mano perché sono dieci euro in più è assurdo
    // al banco; segnalarli serve a restituire il resto.
    expect(r.stato).toBe('PAID')
    expect(r.eccedenzaCents).toBe(8000 - s.prenotazione.totalCents)
  })

  it('un incasso a zero o negativo è rifiutato: quello sarebbe un rimborso', async () => {
    const s = await scenario('c45b')
    await expect(registraIncasso(s.db, s.ctx, {
      reservationId: s.prenotazione.id, amountCents: -1000,
    })).rejects.toMatchObject({ code: 'INVALID_RANGE' })
  })
})

// ─────────────────────────────────────────────────────────────────────────
describe('C-46 · rimborso su prenotazione non pagata', () => {
  it('è rifiutato: non si restituisce ciò che non è mai entrato', async () => {
    const s = await scenario('c46')
    await expect(registraRimborso(s.db, s.ctx, {
      reservationId: s.prenotazione.id, amountCents: 1000, motivo: 'ci ha ripensato',
    })).rejects.toMatchObject({ code: 'REFUND_ABOVE_LIMIT' })
    expect(await prisma.payment.count({ where: { reservationId: s.prenotazione.id } })).toBe(0)
  })

  it('non si può rimborsare più di quanto incassato', async () => {
    const s = await scenario('c46b')
    await registraIncasso(s.db, s.ctx, { reservationId: s.prenotazione.id, amountCents: 3000 })
    const errore = await registraRimborso(s.db, s.ctx, {
      reservationId: s.prenotazione.id, amountCents: 5000, motivo: 'disdetta',
    }).catch(e => e)
    expect(errore.code).toBe('REFUND_ABOVE_LIMIT')
    expect(errore.details.incassatoCents).toBe(3000)
  })
})

// ─────────────────────────────────────────────────────────────────────────
describe('il rimborso', () => {
  it('è un movimento negativo, non una riga cancellata', async () => {
    const s = await scenario('segno')
    await registraIncasso(s.db, s.ctx, { reservationId: s.prenotazione.id, amountCents: 7500 })
    const r = await registraRimborso(s.db, s.ctx, {
      reservationId: s.prenotazione.id, amountCents: 2500,
      motivo: 'un giorno di pioggia', method: 'CASH',
    })
    expect(r).toEqual({ rimborsatoCents: 2500, pagatoCents: 5000, stato: 'PARTIAL' })

    // La cassa della sera deve poter ricostruire entrate e uscite: due righe,
    // non una riga corretta.
    const movimenti = await prisma.payment.findMany({
      where: { reservationId: s.prenotazione.id }, orderBy: { amountCents: 'desc' } })
    expect(movimenti.map(m => m.amountCents)).toEqual([7500, -2500])
    expect(movimenti[1]!.notes).toBe('un giorno di pioggia')
    expect(movimenti[1]!.collectedById).toBe(s.user.id)
  })

  it('rimborsato tutto, lo stato diventa REFUNDED', async () => {
    const s = await scenario('tutto')
    await registraIncasso(s.db, s.ctx, { reservationId: s.prenotazione.id, amountCents: 7500 })
    const r = await registraRimborso(s.db, s.ctx, {
      reservationId: s.prenotazione.id, amountCents: 7500, motivo: 'disdetta',
    })
    expect(r.stato).toBe('REFUNDED')
    expect(await stato(s.prenotazione.id)).toBe('REFUNDED')
  })

  it('senza motivo è rifiutato: è ciò che spiega la cassa a fine giornata', async () => {
    const s = await scenario('motivo')
    await registraIncasso(s.db, s.ctx, { reservationId: s.prenotazione.id, amountCents: 7500 })
    await expect(registraRimborso(s.db, s.ctx, {
      reservationId: s.prenotazione.id, amountCents: 1000, motivo: '   ',
    })).rejects.toMatchObject({ code: 'INVALID_RANGE' })
  })

  it('tiene traccia del metodo: contanti usciti e carta stornata non sono la stessa cosa', async () => {
    const s = await scenario('metodo')
    await registraIncasso(s.db, s.ctx, {
      reservationId: s.prenotazione.id, amountCents: 7500, method: 'CARD' })
    await registraRimborso(s.db, s.ctx, {
      reservationId: s.prenotazione.id, amountCents: 7500, method: 'CARD', motivo: 'storno' })
    const movimenti = await prisma.payment.findMany({
      where: { reservationId: s.prenotazione.id } })
    expect(movimenti.every(m => m.method === 'CARD')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────
describe('▲³ · la soglia dipende dal ruolo', () => {
  it('l’operatore rimborsa fino al proprio limite', async () => {
    const s = await scenario('soglia')
    await registraIncasso(s.db, s.ctx, { reservationId: s.prenotazione.id, amountCents: 7500 })
    const limite = DEFAULT_SETTINGS.operatorMaxRefundCents
    const dbOperatore = scoped(s.operatore)

    const r = await registraRimborso(dbOperatore, s.operatore, {
      reservationId: s.prenotazione.id, amountCents: limite, motivo: 'entro soglia' })
    expect(r.rimborsatoCents).toBe(limite)
  })

  it('oltre il limite serve un amministratore, e lo dice', async () => {
    const s = await scenario('soglia2')
    await registraIncasso(s.db, s.ctx, { reservationId: s.prenotazione.id, amountCents: 7500 })
    const limite = DEFAULT_SETTINGS.operatorMaxRefundCents
    const errore = await registraRimborso(scoped(s.operatore), s.operatore, {
      reservationId: s.prenotazione.id, amountCents: limite + 1, motivo: 'oltre',
    }).catch(e => e)
    expect(errore.code).toBe('REFUND_ABOVE_LIMIT')
    expect(errore.message).toMatch(/amministratore/)
    expect(errore.details.limiteCents).toBe(limite)

    // E l'admin lo stesso importo lo passa.
    await expect(registraRimborso(s.db, s.ctx, {
      reservationId: s.prenotazione.id, amountCents: limite + 1, motivo: 'autorizzato',
    })).resolves.toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────
describe('C-48 · annullare una prenotazione già pagata', () => {
  it('non rimborsa da sola: i soldi escono quando qualcuno li tira fuori', async () => {
    const s = await scenario('c48')
    await registraIncasso(s.db, s.ctx, { reservationId: s.prenotazione.id, amountCents: 7500 })
    await cancelReservation(s.ctx, { reservationId: s.prenotazione.id, reason: 'disdetta' })

    const pren = await prisma.reservation.findUniqueOrThrow({ where: { id: s.prenotazione.id } })
    expect(pren.status).toBe('CANCELLED')
    // Ancora PAID: quei soldi sono in cassa finché non li si restituisce.
    // Uno stato REFUNDED automatico farebbe quadrare i conti sulla carta e
    // non nel cassetto.
    expect(pren.paymentStatus).toBe('PAID')

    const dopo = await registraRimborso(s.db, s.ctx, {
      reservationId: s.prenotazione.id, amountCents: 7500, motivo: 'disdetta cliente' })
    expect(dopo.stato).toBe('REFUNDED')
  })
})

// ─────────────────────────────────────────────────────────────────────────
describe('tenant', () => {
  it('non si rimborsa la prenotazione di un altro stabilimento', async () => {
    const a = await scenario('t-a')
    const b = await scenario('t-b')
    await registraIncasso(a.db, a.ctx, { reservationId: a.prenotazione.id, amountCents: 7500 })
    await expect(registraRimborso(b.db, b.ctx, {
      reservationId: a.prenotazione.id, amountCents: 1000, motivo: 'furbata',
    })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

// ─────────────────────────────────────────────────────────────────────────
describe('la dashboard non deve far sembrare un rimborso un ammanco', () => {
  it('«incassato oggi» è netto, e i rimborsi si vedono a parte', async () => {
    const s = await scenario('cruscotto')
    await registraIncasso(s.db, s.ctx, { reservationId: s.prenotazione.id, amountCents: 7500 })
    await registraRimborso(s.db, s.ctx, {
      reservationId: s.prenotazione.id, amountCents: 2500, motivo: 'pioggia' })

    const d = await dashboard(s.ctx)
    expect(d.incassi.incassatoOggiCents).toBe(5000)   // 75 − 25
    expect(d.incassi.rimborsatoOggiCents).toBe(2500)  // in positivo, per leggerlo
  })
})
