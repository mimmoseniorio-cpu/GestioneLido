/**
 * F6-01 / F6-02 · Adiacenza e ricerca disponibilità (T-30…T-35).
 *
 * Funzioni pure: nessun database, nessuna casualità. Se un giorno la ricerca
 * proponesse due soluzioni diverse per la stessa domanda, l'operatore
 * smetterebbe di fidarsi — quindi anche l'ORDINE è sotto test.
 */
import { describe, it, expect } from 'vitest'
import { punteggioProssimita, punteggioGruppo, sonoAffiancati, segmentoAttraversa,
         PESI_DEFAULT } from '@/domain/availability/proximity'
import { cercaDisponibilita, type Candidato } from '@/domain/availability/search'

const p = (posX: number, posY: number, rowLabel = 'A') => ({ posX, posY, rowLabel })

const omb = (n: string, posX: number, posY: number, rowLabel: string,
             over: Partial<Candidato> = {}): Candidato => ({
  id: `u-${n}`, visibleNumber: n, posX, posY, rowLabel,
  zoneId: 'z1', prezzoGiornoCents: 2500, temporaneo: false,
  daGiorno: 0, aGiorno: 5, ...over,
})

describe('punteggio di prossimità', () => {
  it('un ombrellone con sé stesso vale zero', () => {
    expect(punteggioProssimita(p(3, 1), p(3, 1))).toBe(0)
  })

  it('affiancati sulla stessa fila sono la distanza minima', () => {
    expect(punteggioProssimita(p(3, 1), p(4, 1))).toBe(1)
  })

  it('cambiare fila costa: il 12 e il 13 di file diverse NON sono vicini come quelli della stessa fila', () => {
    const stessaFila = punteggioProssimita(p(3, 1, 'A'), p(4, 1, 'A'))
    const filaDiversa = punteggioProssimita(p(3, 1, 'A'), p(3, 2, 'B'))
    expect(filaDiversa).toBeGreaterThan(stessaFila)
    expect(filaDiversa).toBe(1 + PESI_DEFAULT.rowChangePenalty)
  })

  it('attraversare un corridoio costa', () => {
    const corridoio = [{ kind: 'CORRIDOR', posX: 4, posY: 0, width: 1, height: 5 }]
    const senza = punteggioProssimita(p(3, 1), p(5, 1))
    const con = punteggioProssimita(p(3, 1), p(5, 1), corridoio)
    expect(con).toBe(senza + PESI_DEFAULT.corridorPenalty)
  })

  it('un corridoio che non sta in mezzo non costa nulla', () => {
    const corridoio = [{ kind: 'CORRIDOR', posX: 9, posY: 0, width: 1, height: 5 }]
    expect(punteggioProssimita(p(3, 1), p(4, 1), corridoio)).toBe(1)
  })

  it('le penalità sono configurabili: in certi stabilimenti la passerella non separa', () => {
    const passerella = [{ kind: 'WALKWAY', posX: 0, posY: 2, width: 10, height: 1 }]
    const pesi = { rowChangePenalty: 0, corridorPenalty: 0 }
    expect(punteggioProssimita(p(3, 1, 'A'), p(3, 3, 'B'), passerella, pesi)).toBe(2)
  })

  it('affiancati: solo stessa fila e colonne consecutive', () => {
    expect(sonoAffiancati(p(3, 1, 'A'), p(4, 1, 'A'))).toBe(true)
    expect(sonoAffiancati(p(3, 1, 'A'), p(5, 1, 'A'))).toBe(false)
    expect(sonoAffiancati(p(3, 1, 'A'), p(4, 2, 'B'))).toBe(false)
  })

  it('il punteggio di gruppo somma le distanze a coppie', () => {
    const g = [p(1, 0), p(2, 0), p(3, 0)]
    expect(punteggioGruppo(g)).toBe(1 + 2 + 1)   // 1-2, 1-3, 2-3
  })

  it('segmento e rettangolo: attraversa solo quando passa davvero in mezzo', () => {
    const r = { x: 4, y: 0, w: 1, h: 5 }
    expect(segmentoAttraversa({ x: 3, y: 1 }, { x: 6, y: 1 }, r)).toBe(true)
    expect(segmentoAttraversa({ x: 1, y: 1 }, { x: 3, y: 1 }, r)).toBe(false)
    expect(segmentoAttraversa({ x: 3, y: 9 }, { x: 6, y: 9 }, r)).toBe(false)
  })
})

describe('scenario B · due ombrelloni vicini', () => {
  const fila = [
    omb('1', 0, 0, 'A'), omb('2', 1, 0, 'A'), omb('3', 2, 0, 'A'),
    omb('4', 3, 0, 'A'), omb('5', 4, 0, 'A'),
  ]

  it('propone per primi due affiancati', () => {
    const { soluzioni } = cercaDisponibilita(fila, { giorniRichiesti: 6, quantita: 2 })
    expect(soluzioni.length).toBeGreaterThan(0)
    const primi = soluzioni[0]!.ombrelloni.map(o => o.visibleNumber)
    expect(Math.abs(Number(primi[0]) - Number(primi[1]))).toBe(1)
    expect(soluzioni[0]!.completa).toBe(true)
  })

  it('il prezzo è per tutti gli ombrelloni e per tutti i giorni', () => {
    const { soluzioni } = cercaDisponibilita(fila, { giorniRichiesti: 6, quantita: 2 })
    expect(soluzioni[0]!.prezzoTotaleCents).toBe(2500 * 6 * 2)
  })

  it('è deterministico: due ricerche identiche danno lo stesso ordine', () => {
    const a = cercaDisponibilita(fila, { giorniRichiesti: 6, quantita: 2 })
    const b = cercaDisponibilita(fila, { giorniRichiesti: 6, quantita: 2 })
    expect(a.soluzioni.map(s => s.ombrelloni.map(o => o.id).join()))
      .toEqual(b.soluzioni.map(s => s.ombrelloni.map(o => o.id).join()))
  })

  it('T-32 · se non ci sono adiacenti li propone comunque, ordinati per vicinanza', () => {
    const sparsi = [omb('1', 0, 0, 'A'), omb('20', 9, 0, 'A'), omb('40', 3, 3, 'D')]
    const { soluzioni } = cercaDisponibilita(sparsi, { giorniRichiesti: 3, quantita: 2 })
    expect(soluzioni.length).toBeGreaterThan(0)
    expect(soluzioni[0]!.completa).toBe(true)
  })

  it('T-35 · più ombrelloni di quanti ne esistano: nessuna soluzione, senza errori', () => {
    const { soluzioni } = cercaDisponibilita(fila, { giorniRichiesti: 3, quantita: 9 })
    expect(soluzioni).toEqual([])
  })
})

describe('C-20 · mai "nessun risultato"', () => {
  it('propone la copertura parziale quando nessuno copre tutto il periodo', () => {
    // Il cliente ne vuole 6, ma questi si liberano solo per 3.
    const parziali = [
      omb('10', 0, 0, 'A', { daGiorno: 0, aGiorno: 2 }),
      omb('11', 1, 0, 'A', { daGiorno: 0, aGiorno: 2 }),
    ]
    const { soluzioni, completeTrovate } = cercaDisponibilita(parziali,
      { giorniRichiesti: 6, quantita: 2 })

    expect(completeTrovate).toBe(0)
    expect(soluzioni).toHaveLength(1)
    expect(soluzioni[0]!.completa).toBe(false)
    expect(soluzioni[0]!.giorniCoperti).toBe(3)
    // È l'informazione che permette all'operatore di negoziare invece di
    // riattaccare: "posso darti dal 10 al 12".
    expect(soluzioni[0]!.daGiorno).toBe(0)
    expect(soluzioni[0]!.aGiorno).toBe(2)
  })

  it('una soluzione completa batte sempre una parziale, anche se più lontana', () => {
    const misti = [
      omb('1', 0, 0, 'A', { daGiorno: 0, aGiorno: 1 }),   // vicini ma parziali
      omb('2', 1, 0, 'A', { daGiorno: 0, aGiorno: 1 }),
      omb('50', 0, 5, 'F', { daGiorno: 0, aGiorno: 5 }),  // lontani ma completi
      omb('51', 1, 5, 'F', { daGiorno: 0, aGiorno: 5 }),
    ]
    const { soluzioni } = cercaDisponibilita(misti, { giorniRichiesti: 6, quantita: 2 })
    expect(soluzioni[0]!.completa).toBe(true)
    expect(soluzioni[0]!.ombrelloni.map(o => o.visibleNumber)).toEqual(['50', '51'])
  })

  it('il prezzo di una parziale è sui giorni davvero coperti', () => {
    const parziali = [omb('10', 0, 0, 'A', { daGiorno: 2, aGiorno: 4 })]
    const { soluzioni } = cercaDisponibilita(parziali, { giorniRichiesti: 6, quantita: 1 })
    expect(soluzioni[0]!.prezzoTotaleCents).toBe(2500 * 3)
  })

  it('gruppi senza giorni in comune non vengono proposti', () => {
    const disgiunti = [
      omb('1', 0, 0, 'A', { daGiorno: 0, aGiorno: 1 }),
      omb('2', 1, 0, 'A', { daGiorno: 4, aGiorno: 5 }),
    ]
    const { soluzioni } = cercaDisponibilita(disgiunti, { giorniRichiesti: 6, quantita: 2 })
    expect(soluzioni).toEqual([])
  })
})

describe('T-31 · posti stagionali liberati', () => {
  it('un posto davvero libero viene prima di uno stagionale assente', () => {
    const misti = [
      omb('30', 0, 0, 'A', { temporaneo: true }),
      omb('31', 1, 0, 'A', { temporaneo: false }),
    ]
    const { soluzioni } = cercaDisponibilita(misti, { giorniRichiesti: 3, quantita: 1 })
    expect(soluzioni[0]!.ombrelloni[0]!.visibleNumber).toBe('31')
    expect(soluzioni[0]!.contieneTemporanei).toBe(false)
  })

  it('ma viene proposto, marcato, se serve', () => {
    const soloTemporanei = [omb('30', 0, 0, 'A', { temporaneo: true })]
    const { soluzioni } = cercaDisponibilita(soloTemporanei, { giorniRichiesti: 3, quantita: 1 })
    expect(soluzioni).toHaveLength(1)
    expect(soluzioni[0]!.contieneTemporanei).toBe(true)
  })
})

describe('preferenze del cliente', () => {
  const scelta = [
    omb('5', 0, 4, 'E', { zoneId: 'retro', prezzoGiornoCents: 1800 }),
    omb('63', 3, 0, 'A', { zoneId: 'prima', prezzoGiornoCents: 4500 }),
    omb('64', 4, 0, 'A', { zoneId: 'prima', prezzoGiornoCents: 4500 }),
  ]

  it('la fila preferita sale in cima', () => {
    const { soluzioni } = cercaDisponibilita(scelta,
      { giorniRichiesti: 3, quantita: 1, preferenze: { filaPreferita: 'A' } })
    expect(soluzioni[0]!.ombrelloni[0]!.rowLabel).toBe('A')
  })

  it('il tetto di prezzo penalizza ma non esclude', () => {
    const { soluzioni } = cercaDisponibilita(scelta,
      { giorniRichiesti: 3, quantita: 1, preferenze: { prezzoMassimoCents: 2000 } })
    expect(soluzioni[0]!.ombrelloni[0]!.visibleNumber).toBe('5')
    // Gli altri restano disponibili: il cliente potrebbe accettare di spendere di più.
    expect(soluzioni.length).toBeGreaterThan(1)
  })

  it('"vicino a un altro cliente" avvicina il risultato a quel posto', () => {
    const { soluzioni } = cercaDisponibilita(scelta,
      { giorniRichiesti: 3, quantita: 1, preferenze: { vicinoA: { posX: 4, posY: 0, rowLabel: 'A' } } })
    expect(soluzioni[0]!.ombrelloni[0]!.visibleNumber).toBe('64')
  })
})

describe('prestazioni', () => {
  it('96 ombrelloni e 4 posti si risolvono in fretta', () => {
    const grande: Candidato[] = []
    const file = ['A', 'B', 'C', 'D', 'E', 'F']
    let n = 1
    for (let f = 0; f < 6; f++)
      for (let c = 0; c < 16; c++) grande.push(omb(String(n++), c, f, file[f]!))

    const t0 = performance.now()
    const { soluzioni } = cercaDisponibilita(grande, { giorniRichiesti: 6, quantita: 4 })
    const ms = performance.now() - t0

    expect(soluzioni).toHaveLength(5)
    expect(soluzioni[0]!.completa).toBe(true)
    // Tutte le combinazioni sarebbero oltre 3 milioni: l'espansione ai vicini
    // ne genera 96 e trova comunque il gruppo compatto.
    expect(ms).toBeLessThan(300)
  })
})
