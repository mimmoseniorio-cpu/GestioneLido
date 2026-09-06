/** F6-26 · Generatore di griglia (C-08): l'anteprima è ciò che verrà scritto. */
import { describe, it, expect } from 'vitest'
import { generaGriglia, zonePredefinite, etichettaFila } from '@/domain/map/grid'

describe('generazione', () => {
  it('«6 file da 16» produce 96 ombrelloni numerati di seguito', () => {
    const g = generaGriglia({ file: 6, perFila: 16, numerazione: 'PROGRESSIVA' })
    expect(g.errori).toEqual([])
    expect(g.ombrelloni).toHaveLength(96)
    expect(g.ombrelloni[0]!.visibleNumber).toBe('1')
    expect(g.ombrelloni[95]!.visibleNumber).toBe('96')
    expect(g.ombrelloni[0]!.rowLabel).toBe('A')
    expect(g.ombrelloni[95]!.rowLabel).toBe('F')
  })

  it('i numeri visibili sono tutti diversi', () => {
    const g = generaGriglia({ file: 6, perFila: 16, numerazione: 'PROGRESSIVA' })
    expect(new Set(g.ombrelloni.map(o => o.visibleNumber)).size).toBe(96)
  })

  it('la numerazione per lettera di fila produce A1…F16', () => {
    const g = generaGriglia({ file: 3, perFila: 4, numerazione: 'LETTERA_FILA' })
    expect(g.ombrelloni.map(o => o.visibleNumber).slice(0, 5))
      .toEqual(['A1', 'A2', 'A3', 'A4', 'B1'])
    expect(new Set(g.ombrelloni.map(o => o.visibleNumber)).size).toBe(12)
  })

  it('si può partire da un numero diverso da 1', () => {
    const g = generaGriglia({ file: 2, perFila: 3, numerazione: 'PROGRESSIVA', inizioDa: 101 })
    expect(g.ombrelloni.map(o => o.visibleNumber)).toEqual(['101','102','103','104','105','106'])
  })

  it('rifiuta la numerazione che ripartirebbe da 1 a ogni fila', () => {
    // Produrrebbe numeri duplicati, e il vincolo unique li respingerebbe a
    // metà creazione lasciando la mappa a pezzi.
    const g = generaGriglia({ file: 3, perFila: 4, numerazione: 'PER_FILA' })
    expect(g.errori[0]).toContain('duplicati')
    expect(g.ombrelloni).toEqual([])
  })

  it('rifiuta parametri impossibili', () => {
    expect(generaGriglia({ file: 0, perFila: 10, numerazione: 'PROGRESSIVA' }).errori.length)
      .toBeGreaterThan(0)
    expect(generaGriglia({ file: 100, perFila: 100, numerazione: 'PROGRESSIVA' }).errori[0])
      .toContain('1000')
  })
})

describe('passerelle e corridoi', () => {
  it('la passerella occupa una riga e le file dopo scalano', () => {
    const g = generaGriglia({ file: 4, perFila: 3, numerazione: 'PROGRESSIVA',
                             passerellaDopoFila: 2 })
    const righe = [...new Set(g.ombrelloni.map(o => o.posY))].sort((a, b) => a - b)
    expect(righe).toEqual([0, 1, 3, 4])          // la 2 è la passerella
    const passerella = g.features.find(f => f.kind === 'WALKWAY')!
    expect(passerella.posY).toBe(2)
    expect(passerella.width).toBe(g.larghezza)
  })

  it('i corridoi occupano una colonna e gli ombrelloni scalano', () => {
    const g = generaGriglia({ file: 1, perFila: 8, numerazione: 'PROGRESSIVA',
                             corridoioOgni: 4 })
    expect(g.ombrelloni.map(o => o.posX)).toEqual([0, 1, 2, 3, 5, 6, 7, 8])
    expect(g.features.filter(f => f.kind === 'CORRIDOR')).toHaveLength(1)
    expect(g.features.find(f => f.kind === 'CORRIDOR')!.posX).toBe(4)
  })

  it('nessun ombrellone finisce sopra un corridoio o una passerella', () => {
    const g = generaGriglia({ file: 6, perFila: 16, numerazione: 'PROGRESSIVA',
                             passerellaDopoFila: 3, corridoioOgni: 8 })
    for (const f of g.features) {
      for (const o of g.ombrelloni) {
        const dentro = o.posX >= f.posX && o.posX < f.posX + f.width
                    && o.posY >= f.posY && o.posY < f.posY + f.height
        expect(dentro).toBe(false)
      }
    }
  })
})

describe('zone predefinite', () => {
  it('prima fila, centrale, retro', () => {
    expect(zonePredefinite(6)).toEqual([
      { nome: 'Prima fila', dalla: 0, alla: 0 },
      { nome: 'Centrale', dalla: 1, alla: 4 },
      { nome: 'Retro', dalla: 5, alla: 5 },
    ])
  })

  it('con poche file non inventa zone che non esistono', () => {
    expect(zonePredefinite(1)).toHaveLength(1)
    expect(zonePredefinite(2)).toHaveLength(2)
  })

  it('le etichette di fila si possono personalizzare', () => {
    expect(etichettaFila(0)).toBe('A')
    expect(etichettaFila(0, ['Mare', 'Pineta'])).toBe('Mare')
    expect(etichettaFila(30)).toBe('F31')       // oltre l'alfabeto
  })
})
