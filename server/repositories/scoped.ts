/**
 * Repository layer con scoping forzato (F4-02).
 *
 * Non esiste una funzione di dominio che accetti una query senza contesto.
 * L'isolamento tenant non e' affidato alla disciplina di chi scrive le query:
 * chi usa questo modulo NON PUO' dimenticare il filtro, perche' e' iniettato
 * qui e la firma non permette di ometterlo.
 *
 * Seconda linea di difesa (D-14): le chiavi esterne composte nel database
 * rifiutano comunque righe di tenant diversi. Questo modulo evita che
 * l'errore arrivi fin li'.
 */
import { PrismaClient, type Prisma } from '@prisma/client'
import type { Ctx } from '@/server/context'
import { DomainError } from '@/domain/errors'

export const prisma = new PrismaClient()

export type Tx = Prisma.TransactionClient

/** Modelli su cui il filtro tenant e' obbligatorio. */
const TENANT_MODELS = [
  'season', 'user', 'beachMap', 'zone', 'mapFeature', 'umbrella', 'customer',
  'customerPreference', 'seasonalContract', 'seasonalAbsence', 'reservation',
  'reservationItem', 'priceRule', 'payment', 'creditTransaction', 'auditLog',
] as const

export type TenantModel = (typeof TENANT_MODELS)[number]

/**
 * Restituisce un client su cui ogni where e' gia' ristretto al tenant e ogni
 * create ha gia' il beachClubId corretto.
 */
export function scoped(ctx: Ctx, tx: Tx | PrismaClient = prisma) {
  const clubId = ctx.beachClubId

  const withTenant = <W extends object>(where?: W) =>
    ({ ...(where ?? {}), beachClubId: clubId }) as W & { beachClubId: string }

  const withTenantData = <D extends object>(data: D) =>
    ({ ...data, beachClubId: clubId }) as D & { beachClubId: string }

  const model = <M extends TenantModel>(name: M) => {
    const delegate = (tx as unknown as Record<string, any>)[name]
    return {
      findMany:  (args: any = {}) => delegate.findMany({ ...args, where: withTenant(args.where) }),
      findFirst: (args: any = {}) => delegate.findFirst({ ...args, where: withTenant(args.where) }),
      count:     (args: any = {}) => delegate.count({ ...args, where: withTenant(args.where) }),
      create:    (args: any)      => delegate.create({ ...args, data: withTenantData(args.data) }),
      createMany:(args: any)      => delegate.createMany({
        ...args, data: (args.data as any[]).map(withTenantData) }),
      updateMany:(args: any)      => delegate.updateMany({ ...args, where: withTenant(args.where) }),
      deleteMany:(args: any = {}) => delegate.deleteMany({ ...args, where: withTenant(args.where) }),

      /**
       * Per id: la risorsa di un altro stabilimento risponde NOT_FOUND, mai
       * FORBIDDEN. Un 403 confermerebbe che quella risorsa esiste (docs/04 §3.1).
       */
      async byId(id: string) {
        return delegate.findFirst({ where: { id, beachClubId: clubId } })
      },
      async byIdOrFail(id: string) {
        const row = await delegate.findFirst({ where: { id, beachClubId: clubId } })
        if (!row) throw new DomainError('NOT_FOUND', 'Risorsa non trovata.', { model: name, id })
        return row
      },
      async updateById(id: string, data: any) {
        const res = await delegate.updateMany({ where: { id, beachClubId: clubId }, data })
        if (res.count === 0) throw new DomainError('NOT_FOUND', 'Risorsa non trovata.', { model: name, id })
        return this.byIdOrFail(id)
      },
    }
  }

  return {
    clubId,
    season:            model('season'),
    user:              model('user'),
    beachMap:          model('beachMap'),
    zone:              model('zone'),
    mapFeature:        model('mapFeature'),
    umbrella:          model('umbrella'),
    customer:          model('customer'),
    customerPreference:model('customerPreference'),
    seasonalContract:  model('seasonalContract'),
    seasonalAbsence:   model('seasonalAbsence'),
    reservation:       model('reservation'),
    reservationItem:   model('reservationItem'),
    priceRule:         model('priceRule'),
    payment:           model('payment'),
    creditTransaction: model('creditTransaction'),
    auditLog:          model('auditLog'),
  }
}

export type ScopedDb = ReturnType<typeof scoped>
