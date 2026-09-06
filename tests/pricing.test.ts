/**
 * F6-16 · Motore dei prezzi (T-40…T-44, C-43, C-44).
 *
 * Funzione pura. Il criterio non è la flessibilità ma la PREVEDIBILITÀ: il
 * gestore deve poter guardare il listino e capire perché un prezzo è quello.
 */
import { describe, it, expect } from 'vitest'
import { calcolaPrezzo, regolaPerGiorno, verificaOverride, giornoSettimana,
         type RegolaPrezzo, type OmbrelloneTariffabile } from '@/domain/pricing/engine'
import { DomainError } from '@/domain/errors'

const d = (n: number) => new Date(Date.UTC(2027, 7, n))   // agosto 2027

const omb = (over: Partial<OmbrelloneTariffabile> = {}): OmbrelloneTariffabile => ({
  id: 'u1', visibleNumber: '63', zoneId: 'prima', rowLabel: 'A',
  category: 'prima fila', basePriceCents: 2500, ...over,
})

const regola = (over: Partial<RegolaPrezzo> = {}): RegolaPrezzo => ({
  id: 'r1', name: 'Regola', priority: 10,
  zoneId: null, rowLabel: null, category: null,
  dateFrom: null, dateTo: null, weekdays: [], minDays: null, maxDays: null,
  customerType: null, priceCents: 3000, active: true, ...over,
})

describe('base', () => {
  it('senza regole usa la tariffa dell’ombrellone', () => {
    const p = calcolaPrezzo({ ombrellone: omb(), dal: d(10), al: d(12), regole: [] })
    expect(p.totaleCents).toBe(7500)          // 3 giorni × 25 €
    expect(p.righe).toHaveLength(1)
    expect(p.righe[0]).toMatchObject({ giorni: 3, tariffaGiornoCents: 2500, regola: 'Tariffa base' })
  })

  it('un solo giorno è un giorno, non zero', () => {
    expect(calcolaPrezzo({ ombrellone: omb(), dal: d(10), al: d(10), regole: [] }).totaleCents)
      .toBe(2500)
  })

  it('C-43 · senza regole e senza tariffa base solleva errore, MAI zero', () => {
    // Un prezzo a zero passa inosservato per settimane e si scopre a bilancio.
    try {
      calcolaPrezzo({ ombrellone: omb({ basePriceCents: null }), dal: d(10), al: d(10), regole: [] })
      expect.unreachable('doveva sollevare')
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError)
      expect((e as DomainError).code).toBe('PRICE_RULE_MISSING')
    }
  })

  it('rifiuta un intervallo rovesciato', () => {
    expect(() => calcolaPrezzo({ ombrellone: omb(), dal: d(12), al: d(10), regole: [] }))
      .toThrow(DomainError)
  })
})

describe('criteri delle regole', () => {
  it('la zona seleziona', () => {
    const regole = [regola({ zoneId: 'prima', priceCents: 4500 }),
                    regola({ id: 'r2', zoneId: 'retro', priceCents: 1800 })]
    expect(calcolaPrezzo({ ombrellone: omb(), dal: d(10), al: d(10), regole }).totaleCents)
      .toBe(4500)
  })

  it('la fila seleziona', () => {
    const regole = [regola({ rowLabel: 'F', priceCents: 1800 })]
    // l'ombrellone è in fila A: la regola non si applica, si usa la base
    expect(calcolaPrezzo({ ombrellone: omb(), dal: d(10), al: d(10), regole }).totaleCents)
      .toBe(2500)
  })

  it('il periodo seleziona, e cambia DENTRO il soggiorno', () => {
    const regole = [regola({ name: 'Alta', priority: 100, priceCents: 4500,
                             dateFrom: d(12), dateTo: d(20) })]
    const p = calcolaPrezzo({ ombrellone: omb(), dal: d(10), al: d(13), regole })
    // 10, 11 a 25 € · 12, 13 a 45 €
    expect(p.totaleCents).toBe(2500 * 2 + 4500 * 2)
    expect(p.righe.map(r => [r.giorni, r.tariffaGiornoCents]))
      .toEqual([[2, 2500], [2, 4500]])
    expect(p.righe[1]!.regola).toBe('Alta')
  })

  it('i giorni della settimana selezionano', () => {
    // agosto 2027: il 14 è sabato, il 15 domenica
    expect(giornoSettimana(d(14))).toBe(6)
    expect(giornoSettimana(d(15))).toBe(7)
    const regole = [regola({ name: 'Weekend', priority: 50, weekdays: [6, 7], priceCents: 3500 })]
    const p = calcolaPrezzo({ ombrellone: omb(), dal: d(13), al: d(16), regole })
    // ven 25 € · sab 35 € · dom 35 € · lun 25 €
    expect(p.totaleCents).toBe(2500 + 3500 + 3500 + 2500)
    expect(p.righe).toHaveLength(3)
  })

  it('lo sconto durata si applica all’intero soggiorno', () => {
    const regole = [regola({ name: 'Sconto 7+', priority: 50, minDays: 7, priceCents: 2000 })]
    const corto = calcolaPrezzo({ ombrellone: omb(), dal: d(10), al: d(13), regole })
    const lungo = calcolaPrezzo({ ombrellone: omb(), dal: d(10), al: d(16), regole })
    expect(corto.righe[0]!.tariffaGiornoCents).toBe(2500)   // 4 giorni: niente sconto
    expect(lungo.righe[0]!.tariffaGiornoCents).toBe(2000)   // 7 giorni: sconto
    expect(lungo.totaleCents).toBe(14000)
  })

  it('il tipo cliente seleziona', () => {
    const regole = [regola({ customerType: 'SEASONAL', priceCents: 1000 })]
    expect(calcolaPrezzo({ ombrellone: omb(), dal: d(10), al: d(10), regole }).totaleCents)
      .toBe(2500)
    expect(calcolaPrezzo({ ombrellone: omb(), dal: d(10), al: d(10), regole,
                           tipoCliente: 'SEASONAL' }).totaleCents).toBe(1000)
  })

  it('una regola disattivata non si applica', () => {
    const regole = [regola({ priceCents: 9900, active: false })]
    expect(calcolaPrezzo({ ombrellone: omb(), dal: d(10), al: d(10), regole }).totaleCents)
      .toBe(2500)
  })
})

describe('C-44 · ordinamento deterministico', () => {
  it('la priorità più alta vince', () => {
    const regole = [regola({ id: 'a', priority: 10, priceCents: 1000 }),
                    regola({ id: 'b', priority: 90, priceCents: 4000 })]
    expect(calcolaPrezzo({ ombrellone: omb(), dal: d(10), al: d(10), regole }).totaleCents)
      .toBe(4000)
  })

  it('a parità di priorità vince la più specifica', () => {
    const generica = regola({ id: 'a', priority: 50, priceCents: 1000 })
    const specifica = regola({ id: 'b', priority: 50, zoneId: 'prima', priceCents: 4000 })
    expect(calcolaPrezzo({ ombrellone: omb(), dal: d(10), al: d(10),
                           regole: [generica, specifica] }).totaleCents).toBe(4000)
    // e l'ordine in cui arrivano non conta
    expect(calcolaPrezzo({ ombrellone: omb(), dal: d(10), al: d(10),
                           regole: [specifica, generica] }).totaleCents).toBe(4000)
  })

  it('a parità piena l’esito è comunque stabile', () => {
    const a = regola({ id: 'aaa', priority: 50, priceCents: 1000 })
    const b = regola({ id: 'bbb', priority: 50, priceCents: 2000 })
    const uno = calcolaPrezzo({ ombrellone: omb(), dal: d(10), al: d(10), regole: [a, b] })
    const due = calcolaPrezzo({ ombrellone: omb(), dal: d(10), al: d(10), regole: [b, a] })
    expect(uno.totaleCents).toBe(due.totaleCents)
  })

  it('regolaPerGiorno restituisce la regola che spiega il prezzo', () => {
    const r = regolaPerGiorno([regola({ name: 'Alta stagione', priority: 100 })],
                              omb(), d(10), 1, 'DAILY')
    expect(r?.name).toBe('Alta stagione')
  })
})

describe('il breakdown giustifica il prezzo al cliente', () => {
  it('raggruppa i giorni con la stessa tariffa e le righe sommano al totale', () => {
    const regole = [regola({ name: 'Alta', priority: 100, priceCents: 4500,
                             dateFrom: d(12), dateTo: d(31) }),
                    regola({ id: 'r2', name: 'Weekend', priority: 120,
                             weekdays: [6, 7], priceCents: 5000 })]
    const p = calcolaPrezzo({ ombrellone: omb(), dal: d(10), al: d(16), regole })
    expect(p.righe.reduce((s, r) => s + r.importoCents, 0)).toBe(p.totaleCents)
    expect(p.righe.reduce((s, r) => s + r.giorni, 0)).toBe(7)
    for (const r of p.righe) expect(r.importoCents).toBe(r.tariffaGiornoCents * r.giorni)
  })
})

describe('F6-18 · scostamento dal listino', () => {
  const base = { prezzoListinoCents: 10_000, ruolo: 'OPERATOR' as const, scontoMassimoPercento: 20 }

  it('l’operatore può scontare entro la soglia', () => {
    expect(verificaOverride({ ...base, prezzoApplicatoCents: 8_000 })).toEqual({ ammesso: true })
  })

  it('oltre la soglia serve un admin', () => {
    expect(verificaOverride({ ...base, prezzoApplicatoCents: 5_000 }))
      .toEqual({ ammesso: false, limiteCents: 8_000 })
  })

  it('l’admin non ha soglia', () => {
    expect(verificaOverride({ ...base, ruolo: 'ADMIN', prezzoApplicatoCents: 100 }))
      .toEqual({ ammesso: true })
  })

  it('applicare di più del listino è sempre ammesso', () => {
    expect(verificaOverride({ ...base, prezzoApplicatoCents: 20_000 })).toEqual({ ammesso: true })
  })

  it('un prezzo negativo non passa mai', () => {
    expect(verificaOverride({ ...base, ruolo: 'ADMIN', prezzoApplicatoCents: -1 }).ammesso)
      .toBe(false)
  })
})
