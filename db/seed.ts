/**
 * Seed demo — docs/03 §8
 *
 * Uno stabilimento realistico da 96 ombrelloni. Una demo da 5 ombrelloni non
 * dice nulla su UX e performance: e' vietata dal brief.
 *
 * Deterministico: stesso seed → stessi dati. La stagione e' ancorata all'anno
 * corrente perche' una demo con la stagione finita non permette di valutare
 * nulla; tutto il resto (clienti, assegnazioni, offset) e' fisso.
 */
import { PrismaClient, Role, SeasonStatus, ReservationSource, ReservationStatus,
         PaymentStatus, PaymentMethod, MapFeatureKind, DeclaredBy, AbsenceStatus,
         CreditKind, ContractStatus } from '@prisma/client'
import { makeRandom } from './prng'
import { generaToken } from '../server/auth/magic-link'
import { day, addDays, nightsInclusive, fmt, overlaps } from './dates'

const prisma = new PrismaClient()
const rnd = makeRandom(20260906)

const NOMI = ['Mario','Luigi','Anna','Giulia','Marco','Francesca','Paolo','Elena','Roberto','Chiara',
  'Andrea','Silvia','Davide','Laura','Stefano','Martina','Alessandro','Valentina','Luca','Sara',
  'Matteo','Federica','Giuseppe','Alessia','Antonio','Beatrice','Simone','Ilaria','Fabio','Serena']
const COGNOMI = ['Rossi','Bianchi','Verdi','Ferrari','Esposito','Russo','Romano','Colombo','Ricci','Marino',
  'Greco','Bruno','Gallo','Conti','De Luca','Costa','Giordano','Mancini','Rizzo','Lombardi',
  'Moretti','Barbieri','Fontana','Santoro','Mariani','Rinaldi','Caruso','Ferrara','Galli','Martini']

async function main() {
  console.log('· azzeramento (TRUNCATE: DELETE su audit_log e vietato dal trigger)')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "beach_club" RESTART IDENTITY CASCADE')

  const year = new Date().getUTCFullYear()

  // ── stabilimento ──────────────────────────────────────────────────────────
  const club = await prisma.beachClub.create({
    data: {
      name: 'Lido Adriano', slug: 'lido-adriano', timezone: 'Europe/Rome',
      settings: {
        absenceCutoffHour: 20,          // D-12: entro le 20:00 del giorno prima
        absenceCutoffDaysBefore: 1,
        creditPercent: 30,              // D-03: 30% dell'incasso della rivendita
        creditCapCentsPerSeason: 30000, // D-13: tetto stagionale, 300 €
        absenceConflictPolicy: 'IRREVOCABLE', // D-01: chi ha pagato tiene il posto
        rowChangePenalty: 1.5,          // docs/03 §7
        corridorPenalty: 2.0,
        operatorDiscountPercent: 20,
        operatorMaxRefundCents: 5000,
      },
    },
  })

  const season = await prisma.season.create({
    data: { beachClubId: club.id, year, startDate: day(year, 5, 15),
            endDate: day(year, 9, 15), status: SeasonStatus.ACTIVE },
  })

  await prisma.user.createMany({
    data: [
      { beachClubId: club.id, email: 'admin@lidoadriano.it', name: 'Titolare',
        role: Role.ADMIN, passwordHash: 'placeholder-argon2id-F4-01' },
      { beachClubId: club.id, email: 'reception@lidoadriano.it', name: 'Reception',
        role: Role.OPERATOR, passwordHash: 'placeholder-argon2id-F4-01' },
    ],
  })
  const admin = await prisma.user.findFirstOrThrow({ where: { role: Role.ADMIN } })

  // ── mappa ─────────────────────────────────────────────────────────────────
  const map = await prisma.beachMap.create({
    data: { beachClubId: club.id, seasonId: season.id, width: 18, height: 8 },
  })

  const zPrima = await prisma.zone.create({ data: { beachClubId: club.id, beachMapId: map.id, name: 'Prima fila', color: '#0ea5e9', sortOrder: 1 } })
  const zCentro = await prisma.zone.create({ data: { beachClubId: club.id, beachMapId: map.id, name: 'Centrale', color: '#22c55e', sortOrder: 2 } })
  const zRetro = await prisma.zone.create({ data: { beachClubId: club.id, beachMapId: map.id, name: 'Retro', color: '#a3a3a3', sortOrder: 3 } })

  await prisma.mapFeature.createMany({
    data: [
      { beachClubId: club.id, beachMapId: map.id, kind: MapFeatureKind.WALKWAY,  label: 'Passerella centrale', posX: 0, posY: 4, width: 18, height: 1 },
      { beachClubId: club.id, beachMapId: map.id, kind: MapFeatureKind.CORRIDOR, label: null, posX: 8, posY: 0, width: 1, height: 7 },
      { beachClubId: club.id, beachMapId: map.id, kind: MapFeatureKind.CORRIDOR, label: null, posX: 14, posY: 0, width: 1, height: 7 },
      { beachClubId: club.id, beachMapId: map.id, kind: MapFeatureKind.ENTRANCE, label: 'Ingresso', posX: 8, posY: 7, width: 2, height: 1 },
      { beachClubId: club.id, beachMapId: map.id, kind: MapFeatureKind.SERVICE,  label: 'Bagni', posX: 1, posY: 7, width: 2, height: 1 },
      { beachClubId: club.id, beachMapId: map.id, kind: MapFeatureKind.SERVICE,  label: 'Bar', posX: 12, posY: 7, width: 2, height: 1 },
      { beachClubId: club.id, beachMapId: map.id, kind: MapFeatureKind.BLOCKED_AREA, label: 'Giochi', posX: 4, posY: 7, width: 2, height: 1 },
    ],
  })

  // ── 96 ombrelloni: 6 file da 16. Il mare e' in alto (fila A). ─────────────
  const FILE = ['A','B','C','D','E','F']
  const PER_FILA = 16
  const zoneDiFila = (i: number) => (i === 0 ? zPrima.id : i <= 3 ? zCentro.id : zRetro.id)
  const prezzoBase = (i: number) => (i === 0 ? 3500 : i <= 3 ? 2500 : 1800)

  const umbrellas: { id: string; visibleNumber: string; rowLabel: string; posX: number; posY: number }[] = []
  let n = 1
  for (let f = 0; f < FILE.length; f++) {
    for (let c = 0; c < PER_FILA; c++) {
      // due "bis" per esercitare visibleNumber come testo (D-15, caso C-86)
      const numero = n === 34 ? '33A' : n === 73 ? '72A' : String(n)
      const u = await prisma.umbrella.create({
        data: {
          beachClubId: club.id, beachMapId: map.id, zoneId: zoneDiFila(f),
          visibleNumber: numero, rowLabel: FILE[f]!,
          posX: c + (c >= 8 ? 1 : 0), posY: f + (f >= 4 ? 1 : 0),
          category: f === 0 ? 'prima fila' : 'standard',
          basePriceCents: prezzoBase(f), capacity: f === 0 ? 5 : 4,
        },
      })
      umbrellas.push({ id: u.id, visibleNumber: u.visibleNumber, rowLabel: u.rowLabel, posX: u.posX, posY: u.posY })
      n++
    }
  }

  // tre ombrelloni fuori uso
  for (const num of ['7', '58', '91']) {
    await prisma.umbrella.updateMany({
      where: { beachClubId: club.id, visibleNumber: num },
      data: { blocked: true, blockedReason: 'Palo danneggiato' },
    })
  }
  const blockedIds = new Set(
    (await prisma.umbrella.findMany({ where: { blocked: true }, select: { id: true } })).map(u => u.id))

  // ── listino ───────────────────────────────────────────────────────────────
  await prisma.priceRule.createMany({
    data: [
      { beachClubId: club.id, seasonId: season.id, name: 'Alta stagione prima fila', priority: 100, zoneId: zPrima.id, dateFrom: day(year,8,1), dateTo: day(year,8,31), priceCents: 4500 },
      { beachClubId: club.id, seasonId: season.id, name: 'Alta stagione centrale',   priority: 90,  zoneId: zCentro.id, dateFrom: day(year,8,1), dateTo: day(year,8,31), priceCents: 3200 },
      { beachClubId: club.id, seasonId: season.id, name: 'Alta stagione retro',      priority: 90,  zoneId: zRetro.id,  dateFrom: day(year,8,1), dateTo: day(year,8,31), priceCents: 2400 },
      { beachClubId: club.id, seasonId: season.id, name: 'Weekend luglio',           priority: 70,  dateFrom: day(year,7,1), dateTo: day(year,7,31), weekdays: [6,7], priceCents: 3000 },
      { beachClubId: club.id, seasonId: season.id, name: 'Luglio feriale',           priority: 60,  dateFrom: day(year,7,1), dateTo: day(year,7,31), priceCents: 2600 },
      { beachClubId: club.id, seasonId: season.id, name: 'Sconto 7+ giorni',         priority: 50,  minDays: 7, priceCents: 2000 },
      { beachClubId: club.id, seasonId: season.id, name: 'Bassa stagione prima fila',priority: 20,  zoneId: zPrima.id, priceCents: 2800 },
      { beachClubId: club.id, seasonId: season.id, name: 'Bassa stagione',           priority: 10,  priceCents: 1900 },
    ],
  })

  // ── clienti ───────────────────────────────────────────────────────────────
  const customers: { id: string; isSeasonal: boolean }[] = []
  const telefoniUsati = new Set<string>()
  for (let i = 0; i < 120; i++) {
    let phone: string
    do { phone = '+3934' + String(rnd.int(10000000, 99999999)) } while (telefoniUsati.has(phone))
    telefoniUsati.add(phone)
    const c = await prisma.customer.create({
      data: {
        beachClubId: club.id,
        firstName: rnd.pick(NOMI), lastName: rnd.pick(COGNOMI),
        phoneRaw: phone, phoneNormalized: phone,
        email: rnd.chance(0.4) ? `cliente${i}@example.it` : null,
        notes: rnd.chance(0.15) ? 'Cliente storico' : null,
      },
    })
    customers.push({ id: c.id, isSeasonal: false })
  }

  // ── preferenze: senza, la scheda cliente non dimostra nulla ──────────────
  // Nell'MVP si mostrano all'operatore, non si applicano da sole (R4).
  const zone = [zPrima.id, zCentro.id, zRetro.id]
  for (let i = 0; i < 24; i++) {
    const cust = customers[i * 3]!
    await prisma.customerPreference.create({
      data: {
        beachClubId: club.id, customerId: cust.id,
        preferredRow: rnd.chance(0.7) ? rnd.pick(FILE) : null,
        preferredZoneId: rnd.chance(0.4) ? rnd.pick(zone) : null,
        seaProximity: rnd.pick(['NEAR', 'FAR', 'INDIFFERENT'] as const),
        side: rnd.chance(0.5) ? rnd.pick(['LEFT', 'RIGHT', 'CENTER'] as const) : null,
        freeNotes: rnd.chance(0.3)
          ? rnd.pick(['Arriva sempre dopo le 10', 'Ombrellone lontano dagli altoparlanti',
                      'Due lettini in più', 'Preferisce non stare vicino al bar'])
          : null,
      },
    })
  }

  // ── 28 contratti stagionali (~29% degli ombrelloni) ───────────────────────
  const liberi = umbrellas.filter(u => !blockedIds.has(u.id))
  const stagionaliUmb = liberi.filter((_, i) => i % 3 === 1).slice(0, 28)
  const contracts: { id: string; umbrellaId: string; customerId: string }[] = []
  let linkDiProva = ''

  for (let i = 0; i < stagionaliUmb.length; i++) {
    const u = stagionaliUmb[i]!
    const cust = customers[i]!
    const token = generaToken()
    const ct = await prisma.seasonalContract.create({
      data: {
        beachClubId: club.id, seasonId: season.id, customerId: cust.id, umbrellaId: u.id,
        startDate: season.startDate, endDate: season.endDate,
        priceCents: 180000 + rnd.int(0, 8) * 5000,
        status: ContractStatus.ACTIVE,
        accessTokenHash: token.hash,
      },
    })
    contracts.push({ id: ct.id, umbrellaId: u.id, customerId: cust.id })
    if (i === 0) linkDiProva = `/s/${token.token}`
    await prisma.customer.update({ where: { id: cust.id }, data: { isSeasonal: true } })
    cust.isSeasonal = true
  }

  // ── occupazione, per non violare il vincolo di sovrapposizione ────────────
  const occupato = new Map<string, { from: Date; to: Date }[]>()
  const libero = (umbrellaId: string, from: Date, to: Date) =>
    !(occupato.get(umbrellaId) ?? []).some(r => overlaps(from, to, r.from, r.to))
  const segna = (umbrellaId: string, from: Date, to: Date) => {
    const xs = occupato.get(umbrellaId) ?? []
    xs.push({ from, to }); occupato.set(umbrellaId, xs)
  }

  const oggi = day(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, new Date().getUTCDate())
  const clamp = (d: Date) => (d < season.startDate ? season.startDate : d > season.endDate ? season.endDate : d)

  // ── 12 assenze stagionali: passate e rivendute, attive oggi, future ───────
  const assenze: { id: string; contractId: string; umbrellaId: string; from: Date; to: Date; isLate: boolean }[] = []
  const offsets = [-21, -14, -9, -5, -2, 0, 0, 1, 3, 6, 10, 15]
  for (let i = 0; i < offsets.length; i++) {
    const ct = contracts[i * 2]!
    const from = clamp(addDays(oggi, offsets[i]!))
    const to = clamp(addDays(from, rnd.int(0, 2)))
    const isLate = i === 4 // una dichiarata fuori tempo: non matura credito (D-12)
    const a = await prisma.seasonalAbsence.create({
      data: {
        beachClubId: club.id, seasonalContractId: ct.id,
        startDate: from, endDate: to,
        declaredAt: new Date(), declaredBy: rnd.chance(0.7) ? DeclaredBy.CUSTOMER : DeclaredBy.STAFF,
        isLate, status: AbsenceStatus.ACTIVE,
      },
    })
    assenze.push({ id: a.id, contractId: ct.id, umbrellaId: ct.umbrellaId, from, to, isLate })
  }

  // ── prenotazioni giornaliere sugli ombrelloni non stagionali ──────────────
  const stagionaliIds = new Set(contracts.map(c => c.umbrellaId))
  const vendibili = liberi.filter(u => !stagionaliIds.has(u.id))
  const clientiGiornalieri = customers.filter(c => !c.isSeasonal)
  let prenotazioni = 0

  for (const u of vendibili) {
    for (let k = 0; k < rnd.int(1, 4); k++) {
      const from = clamp(addDays(oggi, rnd.int(-25, 25)))
      const to = clamp(addDays(from, rnd.int(0, 6)))
      if (!libero(u.id, from, to)) continue
      const cust = rnd.pick(clientiGiornalieri)
      const giorni = nightsInclusive(from, to)
      const prezzo = giorni * rnd.pick([1900, 2400, 2600, 3200, 4500])
      const passata = to < oggi
      const res = await prisma.reservation.create({
        data: {
          beachClubId: club.id, seasonId: season.id, customerId: cust.id,
          peopleCount: rnd.int(1, 4),
          source: rnd.pick([ReservationSource.PHONE, ReservationSource.WHATSAPP,
                            ReservationSource.RECEPTION, ReservationSource.RECEPTION]),
          status: from <= oggi && to >= oggi ? ReservationStatus.CHECKED_IN : ReservationStatus.CONFIRMED,
          totalCents: prezzo, createdById: admin.id,
        },
      })
      // Gli item si creano separatamente: beachClubId fa parte della relazione
      // composta verso reservation (D-14) e Prisma lo esclude dal create annidato.
      await prisma.reservationItem.create({
        data: {
          beachClubId: club.id, reservationId: res.id, umbrellaId: u.id,
          startDate: from, endDate: to,
          status: from <= oggi && to >= oggi ? ReservationStatus.CHECKED_IN : ReservationStatus.CONFIRMED,
          priceCents: prezzo, priceBreakdown: [{ giorni, tariffa: prezzo / giorni }],
        },
      })
      segna(u.id, from, to); prenotazioni++

      // pagamenti in tutti e quattro gli stati
      const dado = rnd.next()
      if (passata || dado < 0.55) {
        await prisma.payment.create({ data: { beachClubId: club.id, reservationId: res.id,
          amountCents: prezzo, method: rnd.pick([PaymentMethod.CASH, PaymentMethod.CARD]),
          collectedById: admin.id } })
        await prisma.reservation.update({ where: { id: res.id }, data: { paymentStatus: PaymentStatus.PAID } })
      } else if (dado < 0.75) {
        const acconto = Math.round(prezzo / 2)
        await prisma.payment.create({ data: { beachClubId: club.id, reservationId: res.id,
          amountCents: acconto, method: PaymentMethod.CASH, collectedById: admin.id } })
        await prisma.reservation.update({ where: { id: res.id }, data: { paymentStatus: PaymentStatus.PARTIAL } })
      }
    }
  }

  // ── rivendite dei posti liberati + crediti (il cuore del prodotto) ────────
  let rivendite = 0, creditiTotali = 0
  for (const a of assenze) {
    if (a.from > oggi) continue          // non si vende il futuro nel seed
    if (!rnd.chance(0.7)) continue       // non tutte le assenze si rivendono
    if (!libero(a.umbrellaId, a.from, a.to)) continue

    const cust = rnd.pick(clientiGiornalieri)
    const giorni = nightsInclusive(a.from, a.to)
    const prezzo = giorni * 2500
    const res = await prisma.reservation.create({
      data: {
        beachClubId: club.id, seasonId: season.id, customerId: cust.id, peopleCount: rnd.int(2, 4),
        source: ReservationSource.RECEPTION,
        status: a.to < oggi ? ReservationStatus.CHECKED_IN : ReservationStatus.CONFIRMED,
        totalCents: prezzo, paymentStatus: PaymentStatus.PAID, createdById: admin.id,
      },
    })
    await prisma.reservationItem.create({
      data: {
        beachClubId: club.id, reservationId: res.id, umbrellaId: a.umbrellaId,
        startDate: a.from, endDate: a.to,
        status: a.to < oggi ? ReservationStatus.CHECKED_IN : ReservationStatus.CONFIRMED,
        priceCents: prezzo, isTemporarySlot: true, seasonalAbsenceId: a.id,
      },
    })
    await prisma.payment.create({ data: { beachClubId: club.id, reservationId: res.id,
      amountCents: prezzo, method: PaymentMethod.CASH, collectedById: admin.id } })
    segna(a.umbrellaId, a.from, a.to); rivendite++

    // K-01: nessun credito se l'assenza e' tardiva. Il credito matura solo
    // perche' il posto e' stato effettivamente rivenduto (RF-CRD-01).
    if (!a.isLate) {
      const credito = Math.round(prezzo * 0.30)
      await prisma.creditTransaction.create({
        data: {
          beachClubId: club.id, seasonalContractId: a.contractId,
          amountCents: credito, kind: CreditKind.EARNED,
          absenceDate: a.from, sourceReservationId: res.id, seasonalAbsenceId: a.id,
          description: `Posto liberato ${fmt(a.from)}–${fmt(a.to)} e riassegnato`,
        },
      })
      await prisma.seasonalContract.update({
        where: { id: a.contractId },
        data: { creditBalanceCents: { increment: credito } },
      })
      creditiTotali += credito
    }
  }

  console.log(`✓ ${club.name} — stagione ${year}`)
  console.log(`  96 ombrelloni (3 bloccati) · 28 stagionali · 120 clienti`)
  console.log(`  ${prenotazioni} prenotazioni · ${assenze.length} assenze · ${rivendite} rivendite`)
  console.log(`  crediti maturati: ${(creditiTotali / 100).toFixed(2)} €`)
  console.log(`\n  area cliente stagionale, da provare:\n  http://localhost:3000${linkDiProva}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
