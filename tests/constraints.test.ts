/**
 * Gate F3 — le garanzie che il codice applicativo non puo' dare.
 *
 * Questi test non verificano il codice: verificano che il DATABASE rifiuti
 * ciò che non deve mai accadere. Se falliscono, ogni riga scritta sopra e'
 * costruita su una fondazione che cede sotto concorrenza.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testDb, makeClub, makeReservation, day, isExclusionViolation } from './helpers'

const db = testDb()
beforeAll(async () => { await db.$connect() })
afterAll(async () => { await db.$disconnect() })

describe('RD-02 · nessuna sovrapposizione di prenotazioni (T-08)', () => {
  it('rifiuta due prenotazioni che si sovrappongono sullo stesso ombrellone', async () => {
    const ctx = await makeClub(db, 'overlap')
    await makeReservation(db, ctx, day(2030, 8, 10), day(2030, 8, 15))
    await expect(
      makeReservation(db, ctx, day(2030, 8, 12), day(2030, 8, 14)),
    ).rejects.toSatisfy(isExclusionViolation)
  })

  it('tratta gli intervalli come INCLUSIVI: il 10-15 occupa anche il 15', async () => {
    const ctx = await makeClub(db, 'inclusive')
    await makeReservation(db, ctx, day(2030, 8, 10), day(2030, 8, 15))
    // Se l'intervallo fosse esclusivo a destra, questa passerebbe — ed e'
    // esattamente il bug che assegna due clienti allo stesso ombrellone.
    await expect(
      makeReservation(db, ctx, day(2030, 8, 15), day(2030, 8, 18)),
    ).rejects.toSatisfy(isExclusionViolation)
  })

  it('ammette una prenotazione che inizia il giorno dopo la fine', async () => {
    const ctx = await makeClub(db, 'adjacent')
    await makeReservation(db, ctx, day(2030, 8, 10), day(2030, 8, 15))
    await expect(
      makeReservation(db, ctx, day(2030, 8, 16), day(2030, 8, 18)),
    ).resolves.toBeDefined()
  })

  it('non lascia che una prenotazione annullata blocchi il posto', async () => {
    const ctx = await makeClub(db, 'cancelled')
    await makeReservation(db, ctx, day(2030, 8, 10), day(2030, 8, 15), 'CANCELLED')
    await expect(
      makeReservation(db, ctx, day(2030, 8, 10), day(2030, 8, 15)),
    ).resolves.toBeDefined()
  })

  it('T-08 · sotto concorrenza reale una sola richiesta riesce', async () => {
    const ctx = await makeClub(db, 'concurrent')
    const from = day(2030, 8, 10), to = day(2030, 8, 15)

    // Il controllo applicativo "SELECT poi INSERT" verrebbe attraversato da
    // entrambe: leggerebbero "libero" e scriverebbero. Solo il vincolo del
    // database decide un vincitore.
    const esiti = await Promise.allSettled([
      makeReservation(db, ctx, from, to),
      makeReservation(db, ctx, from, to),
    ])

    const riuscite = esiti.filter(e => e.status === 'fulfilled')
    const fallite  = esiti.filter(e => e.status === 'rejected')
    expect(riuscite).toHaveLength(1)
    expect(fallite).toHaveLength(1)
    expect(isExclusionViolation((fallite[0] as PromiseRejectedResult).reason)).toBe(true)
  })

  it('ombrelloni diversi nello stesso periodo non si disturbano', async () => {
    const ctx = await makeClub(db, 'distinct')
    const altro = await db.umbrella.create({
      data: { beachClubId: ctx.club.id, beachMapId: ctx.map.id, visibleNumber: '64',
              rowLabel: 'A', posX: 2, posY: 1 },
    })
    await makeReservation(db, ctx, day(2030, 8, 10), day(2030, 8, 15))
    await expect(
      makeReservation(db, ctx, day(2030, 8, 10), day(2030, 8, 15), 'CONFIRMED', altro.id),
    ).resolves.toBeDefined()
  })
})

describe('T-03 · nessuna assenza sovrapposta sullo stesso contratto', () => {
  const contratto = async (label: string) => {
    const ctx = await makeClub(db, label)
    const c = await db.seasonalContract.create({
      data: { beachClubId: ctx.club.id, seasonId: ctx.season.id, customerId: ctx.customer.id,
              umbrellaId: ctx.umbrella.id, startDate: day(2030, 5, 1), endDate: day(2030, 9, 30),
              priceCents: 180000, accessTokenHash: 'h' },
    })
    return { ctx, c }
  }

  it('rifiuta la seconda assenza sovrapposta: e il doppio tap del cliente', async () => {
    const { ctx, c } = await contratto('abs-overlap')
    await db.seasonalAbsence.create({
      data: { beachClubId: ctx.club.id, seasonalContractId: c.id,
              startDate: day(2030, 8, 10), endDate: day(2030, 8, 15), declaredBy: 'CUSTOMER' },
    })
    await expect(db.seasonalAbsence.create({
      data: { beachClubId: ctx.club.id, seasonalContractId: c.id,
              startDate: day(2030, 8, 14), endDate: day(2030, 8, 18), declaredBy: 'CUSTOMER' },
    })).rejects.toSatisfy(isExclusionViolation)
  })

  it('ammette una nuova assenza dopo che la precedente e stata annullata', async () => {
    const { ctx, c } = await contratto('abs-cancelled')
    const a = await db.seasonalAbsence.create({
      data: { beachClubId: ctx.club.id, seasonalContractId: c.id,
              startDate: day(2030, 8, 10), endDate: day(2030, 8, 15), declaredBy: 'CUSTOMER' },
    })
    await db.seasonalAbsence.update({ where: { id: a.id }, data: { status: 'CANCELLED' } })
    await expect(db.seasonalAbsence.create({
      data: { beachClubId: ctx.club.id, seasonalContractId: c.id,
              startDate: day(2030, 8, 12), endDate: day(2030, 8, 13), declaredBy: 'CUSTOMER' },
    })).resolves.toBeDefined()
  })
})

describe('T-27 · nessun contratto stagionale sovrapposto sullo stesso ombrellone', () => {
  it('rifiuta due contratti attivi sullo stesso ombrellone', async () => {
    const ctx = await makeClub(db, 'sc-overlap')
    const altroCliente = await db.customer.create({
      data: { beachClubId: ctx.club.id, firstName: 'Altro', lastName: 'Cliente' },
    })
    await db.seasonalContract.create({
      data: { beachClubId: ctx.club.id, seasonId: ctx.season.id, customerId: ctx.customer.id,
              umbrellaId: ctx.umbrella.id, startDate: day(2030, 5, 1), endDate: day(2030, 9, 30),
              priceCents: 180000, accessTokenHash: 'h1' },
    })
    await expect(db.seasonalContract.create({
      data: { beachClubId: ctx.club.id, seasonId: ctx.season.id, customerId: altroCliente.id,
              umbrellaId: ctx.umbrella.id, startDate: day(2030, 7, 1), endDate: day(2030, 8, 31),
              priceCents: 90000, accessTokenHash: 'h2' },
    })).rejects.toSatisfy(isExclusionViolation)
  })
})

describe('D-14 · isolamento multi-tenant garantito dal database', () => {
  it('rifiuta un item che collega una prenotazione a un ombrellone di un altro stabilimento', async () => {
    const a = await makeClub(db, 'tenant-a')
    const b = await makeClub(db, 'tenant-b')
    const res = await db.reservation.create({
      data: { beachClubId: a.club.id, seasonId: a.season.id, customerId: a.customer.id, totalCents: 0 },
    })
    // L'ombrellone appartiene al club B: la FK composta lo rende impossibile,
    // indipendentemente da cosa faccia il codice applicativo.
    await expect(db.reservationItem.create({
      data: { beachClubId: a.club.id, reservationId: res.id, umbrellaId: b.umbrella.id,
              startDate: day(2030, 8, 1), endDate: day(2030, 8, 2), priceCents: 1000 },
    })).rejects.toThrow()
  })

  it('rifiuta un contratto stagionale con cliente di un altro stabilimento', async () => {
    const a = await makeClub(db, 'tenant-c')
    const b = await makeClub(db, 'tenant-d')
    await expect(db.seasonalContract.create({
      data: { beachClubId: a.club.id, seasonId: a.season.id, customerId: b.customer.id,
              umbrellaId: a.umbrella.id, startDate: day(2030, 5, 1), endDate: day(2030, 9, 30),
              priceCents: 1, accessTokenHash: 'h' },
    })).rejects.toThrow()
  })
})

describe('vincoli di coerenza', () => {
  it('rifiuta un intervallo con fine prima dell inizio', async () => {
    const ctx = await makeClub(db, 'range')
    await expect(
      makeReservation(db, ctx, day(2030, 8, 15), day(2030, 8, 10)),
    ).rejects.toThrow()
  })

  it('rifiuta due ombrelloni con lo stesso numero visibile nello stesso stabilimento', async () => {
    const ctx = await makeClub(db, 'dup-number')
    await expect(db.umbrella.create({
      data: { beachClubId: ctx.club.id, beachMapId: ctx.map.id, visibleNumber: '63',
              rowLabel: 'B', posX: 5, posY: 5 },
    })).rejects.toThrow()
  })

  it('ammette 63 e 63A come ombrelloni distinti (C-86, D-15)', async () => {
    const ctx = await makeClub(db, 'bis')
    await expect(db.umbrella.create({
      data: { beachClubId: ctx.club.id, beachMapId: ctx.map.id, visibleNumber: '63A',
              rowLabel: 'A', posX: 2, posY: 1 },
    })).resolves.toBeDefined()
  })

  it('ammette una sola stagione ACTIVE per stabilimento', async () => {
    const ctx = await makeClub(db, 'season')
    await db.season.update({ where: { id: ctx.season.id }, data: { status: 'ACTIVE' } })
    await expect(db.season.create({
      data: { beachClubId: ctx.club.id, year: ctx.season.year + 1, startDate: day(2031, 5, 1),
              endDate: day(2031, 9, 30), status: 'ACTIVE' },
    })).rejects.toThrow()
  })
})

describe('audit log append-only', () => {
  it('rifiuta UPDATE e DELETE sulle righe di audit', async () => {
    const ctx = await makeClub(db, 'audit')
    const row = await db.auditLog.create({
      data: { beachClubId: ctx.club.id, actorType: 'USER', action: 'reservation.create',
              entityType: 'reservation', entityId: ctx.umbrella.id },
    })
    await expect(db.auditLog.update({ where: { id: row.id }, data: { action: 'x' } })).rejects.toThrow()
    await expect(db.auditLog.delete({ where: { id: row.id } })).rejects.toThrow()
  })
})

describe('lo stato dell item segue la testata', () => {
  it('annullare la prenotazione libera il posto senza toccare gli item a mano', async () => {
    const ctx = await makeClub(db, 'sync')
    const item = await makeReservation(db, ctx, day(2030, 8, 10), day(2030, 8, 15))
    await db.reservation.update({ where: { id: item.reservationId }, data: { status: 'CANCELLED' } })

    const aggiornato = await db.reservationItem.findUniqueOrThrow({ where: { id: item.id } })
    expect(aggiornato.status).toBe('CANCELLED')

    // e il posto e' di nuovo vendibile
    await expect(
      makeReservation(db, ctx, day(2030, 8, 10), day(2030, 8, 15)),
    ).resolves.toBeDefined()
  })
})
