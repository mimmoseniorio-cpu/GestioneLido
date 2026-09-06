/**
 * F6-26 · Creare la mappa dello stabilimento in un colpo.
 *
 * Il gestore configura una volta all'anno, spesso a stagione già iniziata.
 * Perciò: pochi campi, anteprima prima di confermare, e la garanzia di non
 * distruggere nulla di esistente.
 */
import { useCase } from '@/server/use-case'
import { P } from '@/domain/auth/permissions'
import { DomainError } from '@/domain/errors'
import { audit } from '@/server/audit'
import { generaGriglia, zonePredefinite, type ParametriGriglia } from '@/domain/map/grid'

export type EsitoGenerazione = {
  beachMapId: string
  ombrelloni: number
  zone: number
  features: number
}

export const generaMappa = useCase<
  ParametriGriglia & { creaZone?: boolean; prezziPerZonaCents?: number[] },
  EsitoGenerazione
>({
  permission: P.MAP_EDIT,
  async run({ db, tx, ctx }, input) {
    const griglia = generaGriglia(input)
    if (griglia.errori.length > 0)
      throw new DomainError('INVALID_RANGE', griglia.errori[0]!, { errori: griglia.errori })

    // C-84/C-85 · non si distrugge una mappa che ha già prenotazioni: si può
    // solo aggiungere o bloccare. Rigenerarla cancellerebbe lo storico.
    const esistenti = await db.umbrella.count()
    if (esistenti > 0) {
      const conPrenotazioni = await db.reservationItem.count()
      const conContratti = await db.seasonalContract.count()
      if (conPrenotazioni > 0 || conContratti > 0)
        throw new DomainError('FORBIDDEN',
          'Questo stabilimento ha già prenotazioni o contratti: la mappa non può essere rigenerata. Aggiungi o blocca i singoli ombrelloni.',
          { ombrelloni: esistenti, prenotazioni: conPrenotazioni })
      await db.umbrella.deleteMany({})
      await db.mapFeature.deleteMany({})
      await db.zone.deleteMany({})
    }

    const mappaEsistente = await db.beachMap.findFirst({})
    const mappa = mappaEsistente ?? await db.beachMap.create({
      data: { width: griglia.larghezza, height: griglia.altezza },
    })
    if (mappaEsistente)
      await db.beachMap.updateById(mappa.id,
        { width: griglia.larghezza, height: griglia.altezza })

    // ── zone tariffarie: senza, il listino non ha su cosa appoggiarsi ──────
    const zonePerFila = new Map<number, string>()
    let zoneCreate = 0
    if (input.creaZone !== false) {
      const definizioni = zonePredefinite(input.file)
      for (let z = 0; z < definizioni.length; z++) {
        const def = definizioni[z]!
        const zona = await db.zone.create({
          data: { beachMapId: mappa.id, name: def.nome, sortOrder: z,
                  color: ['#0ea5e9', '#22c55e', '#a3a3a3'][z] ?? '#888888' },
        })
        for (let f = def.dalla; f <= def.alla; f++) zonePerFila.set(f, zona.id)
        zoneCreate++
      }
    }

    for (const o of griglia.ombrelloni) {
      const prezzo = input.prezziPerZonaCents?.[
        zonePredefinite(input.file).findIndex(d => o.indiceFila >= d.dalla && o.indiceFila <= d.alla)
      ] ?? null
      await db.umbrella.create({
        data: {
          beachMapId: mappa.id,
          zoneId: zonePerFila.get(o.indiceFila) ?? null,
          visibleNumber: o.visibleNumber, rowLabel: o.rowLabel,
          posX: o.posX, posY: o.posY,
          category: o.indiceFila === 0 ? 'prima fila' : 'standard',
          basePriceCents: prezzo,
        },
      })
    }

    for (const f of griglia.features) {
      await db.mapFeature.create({
        data: { beachMapId: mappa.id, kind: f.kind, label: f.label,
                posX: f.posX, posY: f.posY, width: f.width, height: f.height },
      })
    }

    await audit(tx, ctx, 'map.generate',
      { type: 'beach_map', id: mappa.id },
      { after: { file: input.file, perFila: input.perFila,
                 ombrelloni: griglia.ombrelloni.length } })

    return {
      beachMapId: mappa.id,
      ombrelloni: griglia.ombrelloni.length,
      zone: zoneCreate,
      features: griglia.features.length,
    }
  },
})

/** C-83 · rinumerare è ammesso anche con prenotazioni attive: cambia
 *  `visibleNumber`, non l'identità dell'ombrellone. */
export const rinumeraOmbrellone = useCase<{ umbrellaId: string; nuovoNumero: string }, void>({
  permission: P.MAP_EDIT,
  async run({ db, tx, ctx }, input) {
    const u = await db.umbrella.byIdOrFail(input.umbrellaId)
    const numero = input.nuovoNumero.trim()
    if (!numero) throw new DomainError('INVALID_RANGE', 'Il numero non può essere vuoto.')

    const occupato = await db.umbrella.findFirst({ where: { visibleNumber: numero } })
    if (occupato && occupato.id !== u.id)
      throw new DomainError('DUPLICATE_PHONE',
        `Il numero ${numero} è già usato da un altro ombrellone.`)

    await db.umbrella.updateById(u.id, { visibleNumber: numero })
    await audit(tx, ctx, 'umbrella.renumber',
      { type: 'umbrella', id: u.id },
      { before: { visibleNumber: u.visibleNumber }, after: { visibleNumber: numero } })
  },
})

/**
 * F6-27 · Spostare un ombrellone.
 *
 * Come rinumerare (`C-83`), lo spostamento NON tocca l'identità: cambia dove
 * l'ombrellone è disegnato, non quale sia. Le prenotazioni e i contratti
 * restano attaccati, e questo è il punto — un gestore che rifà la disposizione
 * a metà stagione non deve perdere nulla.
 */
export const spostaOmbrellone = useCase<{
  umbrellaId: string
  posX: number
  posY: number
  /** la fila si aggiorna solo se richiesto: cambia anche il listino */
  rowLabel?: string
}, { visibleNumber: string; posX: number; posY: number; rowLabel: string }>({
  permission: P.MAP_EDIT,
  async run({ db, tx, ctx }, input) {
    const u = await db.umbrella.byIdOrFail(input.umbrellaId)

    if (!Number.isInteger(input.posX) || !Number.isInteger(input.posY) ||
        input.posX < 0 || input.posY < 0)
      throw new DomainError('INVALID_RANGE', 'Posizione non valida.')

    // Chi occupa la casella si dice per NUMERO, non per identificativo: il
    // gestore guarda la mappa, non il database.
    const occupante = await db.umbrella.findFirst({
      where: { beachMapId: u.beachMapId, posX: input.posX, posY: input.posY },
    })
    if (occupante && occupante.id !== u.id)
      throw new DomainError('UMBRELLA_NOT_AVAILABLE',
        `Lì c'è già l'ombrellone ${occupante.visibleNumber}. Spostalo prima, o scegli un'altra casella.`,
        { occupante: occupante.visibleNumber })

    const fila = input.rowLabel?.trim() || u.rowLabel
    await db.umbrella.updateById(u.id, { posX: input.posX, posY: input.posY, rowLabel: fila })

    await audit(tx, ctx, 'umbrella.move',
      { type: 'umbrella', id: u.id },
      { before: { posX: u.posX, posY: u.posY, rowLabel: u.rowLabel },
        after: { posX: input.posX, posY: input.posY, rowLabel: fila } })

    return { visibleNumber: u.visibleNumber, posX: input.posX, posY: input.posY, rowLabel: fila }
  },
})
