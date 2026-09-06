import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'

export const testDb = () =>
  new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL! } } })

export const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

/** Uno stabilimento completo e isolato per ogni test: niente stato condiviso,
 *  niente test che passano solo se eseguiti nell'ordine giusto. */
export async function makeClub(db: PrismaClient, label = 'test') {
  const slug = `${label}-${randomUUID()}`
  const club = await db.beachClub.create({ data: { name: label, slug } })
  const season = await db.season.create({
    data: { beachClubId: club.id, year: 2030 + Math.floor(Math.random() * 1000),
            startDate: day(2030, 5, 1), endDate: day(2030, 9, 30), status: 'PLANNING' },
  })
  const map = await db.beachMap.create({ data: { beachClubId: club.id } })
  const customer = await db.customer.create({
    data: { beachClubId: club.id, firstName: 'Test', lastName: 'Cliente' },
  })
  // Un utente vero: `createdById` ha una chiave esterna, e un id inventato la
  // violerebbe — come deve essere.
  const user = await db.user.create({
    data: { beachClubId: club.id, email: `staff-${slug}@test.it`, name: 'Staff',
            role: 'ADMIN', passwordHash: 'x' },
  })
  const umbrella = await db.umbrella.create({
    data: { beachClubId: club.id, beachMapId: map.id, visibleNumber: '63',
            rowLabel: 'A', posX: 1, posY: 1, basePriceCents: 2500 },
  })
  return { club, season, map, customer, umbrella, user }
}

export async function makeReservation(
  db: PrismaClient,
  ctx: Awaited<ReturnType<typeof makeClub>>,
  from: Date, to: Date,
  status: 'CONFIRMED' | 'CANCELLED' | 'CHECKED_IN' | 'NO_SHOW' = 'CONFIRMED',
  umbrellaId = ctx.umbrella.id,
) {
  const res = await db.reservation.create({
    data: { beachClubId: ctx.club.id, seasonId: ctx.season.id,
            customerId: ctx.customer.id, status, totalCents: 1000 },
  })
  return db.reservationItem.create({
    data: { beachClubId: ctx.club.id, reservationId: res.id, umbrellaId,
            startDate: from, endDate: to, status, priceCents: 1000 },
  })
}

export const isExclusionViolation = (e: unknown) =>
  String(e).includes('exclusion constraint') || String(e).includes('P2010') ||
  String(e).includes('23P01')
