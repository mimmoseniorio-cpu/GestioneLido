/**
 * F5-01 · Copertura esaustiva di `umbrellaState`.
 *
 * È la funzione da cui dipende ogni schermata e ogni vendita: qui la copertura
 * al 100% dei rami non è un obiettivo di stile, è il motivo per cui possiamo
 * non memorizzare lo stato.
 */
import { describe, it, expect } from 'vitest'
import { umbrellaState, umbrellaViewState, isSellable, covers } from '@/domain/umbrella/state'

const d = (n: number) => new Date(Date.UTC(2027, 7, n))   // agosto 2027
const OGGI = d(12)
const libero = { blocked: false }

const stato = (over: Parameters<typeof umbrellaState>[0] extends infer T ? Partial<T> : never) =>
  umbrellaState({ umbrella: libero, date: OGGI, today: OGGI, ...(over as object) } as never)

describe('nessun contratto, nessuna prenotazione', () => {
  it('è libero', () => {
    expect(stato({})).toBe('LIBERO')
  })
})

describe('blocco (ha la precedenza su tutto)', () => {
  it('un ombrellone bloccato è BLOCCATO anche se prenotato', () => {
    expect(stato({
      umbrella: { blocked: true },
      item: { id: 'r', startDate: d(10), endDate: d(15), status: 'CONFIRMED' },
    })).toBe('BLOCCATO')
  })

  it('un ombrellone bloccato è BLOCCATO anche se stagionale', () => {
    expect(stato({
      umbrella: { blocked: true },
      contract: { id: 'c', startDate: d(1), endDate: d(31) },
    })).toBe('BLOCCATO')
  })

  it('un blocco a termine scaduto non blocca più', () => {
    expect(stato({ umbrella: { blocked: true, blockedUntil: d(10) } })).toBe('LIBERO')
  })

  it('un blocco a termine ancora valido blocca, estremo incluso', () => {
    expect(stato({ umbrella: { blocked: true, blockedUntil: d(12) } })).toBe('BLOCCATO')
  })
})

describe('prenotazioni', () => {
  const item = (from: number, to: number, status: 'CONFIRMED' | 'CHECKED_IN' = 'CONFIRMED') =>
    ({ id: 'r', startDate: d(from), endDate: d(to), status })

  it('un periodo che include oggi è OCCUPATO', () => {
    expect(stato({ item: item(10, 15) })).toBe('OCCUPATO')
  })

  it('un periodo futuro è PRENOTATO', () => {
    expect(stato({ date: d(20), item: item(18, 22) })).toBe('PRENOTATO')
  })

  it('un periodo passato è OCCUPATO', () => {
    expect(stato({ date: d(5), item: item(3, 6) })).toBe('OCCUPATO')
  })

  it('il primo giorno del periodo è già occupato', () => {
    expect(stato({ date: d(10), item: item(10, 15) })).toBe('OCCUPATO')
  })

  it("l'ULTIMO giorno del periodo NON è libero", () => {
    // Il punto non è quale etichetta esce, ma che non sia LIBERO: se
    // l'intervallo fosse esclusivo a destra, il 15 risulterebbe vendibile e
    // due clienti finirebbero sullo stesso ombrellone.
    const s = stato({ date: d(15), item: item(10, 15) })
    expect(s).not.toBe('LIBERO')
    expect(isSellable(s)).toBe(false)
    // Visto da oggi (12), il 15 è un giorno futuro: PRENOTATO.
    expect(s).toBe('PRENOTATO')
  })

  it("l'ultimo giorno, guardato quel giorno stesso, è OCCUPATO", () => {
    expect(stato({ date: d(15), today: d(15), item: item(10, 15) })).toBe('OCCUPATO')
  })

  it('il giorno dopo la fine è libero', () => {
    expect(stato({ date: d(16), item: item(10, 15) })).toBe('LIBERO')
  })

  it('il giorno prima dell inizio è libero', () => {
    expect(stato({ date: d(9), item: item(10, 15) })).toBe('LIBERO')
  })

  it('una prenotazione che non copre la data non conta', () => {
    expect(stato({ date: d(20), item: item(10, 15) })).toBe('LIBERO')
  })
})

describe('stagionali', () => {
  const contratto = { id: 'c', startDate: d(1), endDate: d(31) }

  it('contratto senza assenza: lo stagionale c è', () => {
    expect(stato({ contract: contratto })).toBe('STAGIONALE_PRESENTE')
  })

  it('contratto con assenza che copre oggi: vendibile', () => {
    expect(stato({ contract: contratto, absence: { id: 'a', startDate: d(12), endDate: d(14) } }))
      .toBe('TEMP_DISPONIBILE')
  })

  it("un'assenza che non copre la data non libera nulla", () => {
    expect(stato({ contract: contratto, absence: { id: 'a', startDate: d(20), endDate: d(22) } }))
      .toBe('STAGIONALE_PRESENTE')
  })

  it('fuori dal periodo del contratto è libero, non stagionale', () => {
    expect(stato({ date: d(1), contract: { id: 'c', startDate: d(5), endDate: d(31) } }))
      .toBe('LIBERO')
  })

  it('il posto rivenduto durante l assenza risulta OCCUPATO', () => {
    // Il gestore deve vederlo occupato: il posto è stato venduto davvero.
    expect(stato({
      contract: contratto,
      absence: { id: 'a', startDate: d(12), endDate: d(14) },
      item: { id: 'r', startDate: d(12), endDate: d(12), status: 'CONFIRMED', isTemporarySlot: true },
    })).toBe('OCCUPATO')
  })

  it('RIENTRO AUTOMATICO: finita l assenza, torna allo stagionale', () => {
    // Senza processi pianificati, senza job notturni, senza intervento umano:
    // è una conseguenza della derivazione (docs/08 §5.3).
    expect(stato({
      date: d(15),
      contract: contratto,
      absence: { id: 'a', startDate: d(12), endDate: d(14) },
    })).toBe('STAGIONALE_PRESENTE')
  })

  it('il giorno dopo la vendita temporanea il posto è di nuovo dello stagionale', () => {
    expect(stato({
      date: d(13),
      contract: contratto,
      absence: { id: 'a', startDate: d(12), endDate: d(12) },
      item: { id: 'r', startDate: d(12), endDate: d(12), status: 'CONFIRMED', isTemporarySlot: true },
    })).toBe('STAGIONALE_PRESENTE')
  })
})

describe('proiezione per la mappa', () => {
  it('un posto stagionale liberato si legge STAGIONALE_ASSENTE', () => {
    expect(umbrellaViewState({
      umbrella: libero, date: OGGI, today: OGGI,
      contract: { id: 'c', startDate: d(1), endDate: d(31) },
      absence: { id: 'a', startDate: d(12), endDate: d(14) },
    })).toBe('STAGIONALE_ASSENTE')
  })

  it('gli altri stati restano invariati', () => {
    expect(umbrellaViewState({ umbrella: libero, date: OGGI, today: OGGI })).toBe('LIBERO')
  })
})

describe('cosa si può vendere (scenario F)', () => {
  it('libero e temporaneamente disponibile sono vendibili', () => {
    expect(isSellable('LIBERO')).toBe(true)
    expect(isSellable('TEMP_DISPONIBILE')).toBe(true)
  })

  it('tutto il resto non lo è', () => {
    for (const s of ['OCCUPATO', 'PRENOTATO', 'STAGIONALE_PRESENTE', 'BLOCCATO'] as const) {
      expect(isSellable(s)).toBe(false)
    }
  })
})

describe('covers · intervalli inclusivi', () => {
  it('include entrambi gli estremi', () => {
    expect(covers(d(10), d(15), d(10))).toBe(true)
    expect(covers(d(10), d(15), d(15))).toBe(true)
    expect(covers(d(10), d(15), d(12))).toBe(true)
    expect(covers(d(10), d(15), d(9))).toBe(false)
    expect(covers(d(10), d(15), d(16))).toBe(false)
  })

  it('un intervallo di un solo giorno copre quel giorno', () => {
    expect(covers(d(12), d(12), d(12))).toBe(true)
  })
})
