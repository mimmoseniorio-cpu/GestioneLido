/**
 * F6-31 · Coda di scritture (criterio 10: nessuna operazione persa o ambigua).
 *
 * Il caso reale non è «la reception resta senza rete per un'ora», è «il wifi
 * salta per tre secondi mentre l'operatore conferma».
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { CodaScritture } from '@/app/lib/coda'

const risposta = (status: number, body: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response

let coda: CodaScritture
beforeEach(() => { coda = new CodaScritture(); vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

/** Fa scorrere i timer finché la promessa non si risolve. */
async function scorri<T>(p: Promise<T>): Promise<T> {
  const esito = p.then(v => ({ ok: true as const, v }), e => ({ ok: false as const, e }))
  for (let i = 0; i < 12; i++) { await vi.advanceTimersByTimeAsync(10_000) }
  const r = await esito
  if (r.ok) return r.v
  throw r.e
}

const richiesta = { url: '/api/v1/reservations', metodo: 'POST' as const,
                    corpo: { x: 1 }, descrizione: 'Ombrellone 63 a Bianchi' }

describe('percorso normale', () => {
  it('al primo colpo la coda resta vuota', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => risposta(201, { id: 'r1' })))
    const esito = await scorri(coda.esegui<{ id: string }>(richiesta))
    expect(esito.id).toBe('r1')
    expect(coda.operazioni).toHaveLength(0)
    expect(coda.stato).toBe('ok')
  })
})

describe('rete che salta', () => {
  it('ritenta da solo e alla fine passa', async () => {
    let chiamate = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      chiamate++
      if (chiamate < 3) throw new Error('rete assente')
      return risposta(201, { id: 'r2' })
    }))
    const esito = await scorri(coda.esegui<{ id: string }>(richiesta))
    expect(esito.id).toBe('r2')
    expect(chiamate).toBe(3)
    expect(coda.operazioni).toHaveLength(0)
  })

  it('usa SEMPRE la stessa chiave di idempotenza nei ritentativi', async () => {
    // È ciò che impedisce che un ritentativo produca due prenotazioni.
    const chiavi: string[] = []
    let chiamate = 0
    vi.stubGlobal('fetch', vi.fn(async (_u: string, opz: any) => {
      chiavi.push(opz.headers['idempotency-key'])
      chiamate++
      if (chiamate < 3) throw new Error('rete assente')
      return risposta(201, {})
    }))
    await scorri(coda.esegui(richiesta))
    expect(new Set(chiavi).size).toBe(1)
  })

  it('operazioni diverse hanno chiavi diverse', async () => {
    const chiavi: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_u: string, opz: any) => {
      chiavi.push(opz.headers['idempotency-key'])
      return risposta(201, {})
    }))
    await scorri(coda.esegui(richiesta))
    await scorri(coda.esegui(richiesta))
    expect(new Set(chiavi).size).toBe(2)
  })

  it('se non passa mai, RESTA in coda con il motivo — mai un fallimento silenzioso', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('rete assente') }))
    await expect(scorri(coda.esegui(richiesta))).rejects.toThrow()

    expect(coda.operazioni).toHaveLength(1)
    expect(coda.operazioni[0]!.descrizione).toBe('Ombrellone 63 a Bianchi')
    expect(coda.operazioni[0]!.ultimoErrore).toBe('Connessione assente')
    expect(coda.stato).toBe('da-riprovare')
  })

  it('l’operatore può riprovare, e stavolta passa', async () => {
    let permetti = false
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (!permetti) throw new Error('rete assente')
      return risposta(201, { id: 'r3' })
    }))
    await expect(scorri(coda.esegui(richiesta))).rejects.toThrow()
    const id = coda.operazioni[0]!.id

    permetti = true
    const esito = await scorri(coda.riprova<{ id: string }>(id))
    expect(esito.id).toBe('r3')
    expect(coda.operazioni).toHaveLength(0)
    expect(coda.stato).toBe('ok')
  })

  it('l’operatore può scartare ciò che non vuole più', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('rete assente') }))
    await expect(scorri(coda.esegui(richiesta))).rejects.toThrow()
    coda.scarta(coda.operazioni[0]!.id)
    expect(coda.operazioni).toHaveLength(0)
    expect(coda.stato).toBe('ok')
  })
})

describe('rifiuti del server', () => {
  it('un posto già occupato NON si ritenta: il motivo risale subito', async () => {
    // Ritentare darebbe lo stesso esito e nasconderebbe il motivo vero.
    const chiamate = vi.fn(async () => risposta(409, {
      error: 'UMBRELLA_NOT_AVAILABLE', message: "L'ombrellone è già prenotato." }))
    vi.stubGlobal('fetch', chiamate)

    await expect(scorri(coda.esegui(richiesta)))
      .rejects.toThrow("L'ombrellone è già prenotato.")
    expect(chiamate).toHaveBeenCalledTimes(1)
    expect(coda.operazioni).toHaveLength(0)   // non resta appesa: non è un problema di rete
  })

  it('un errore del server (500) invece si ritenta', async () => {
    let chiamate = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      chiamate++
      return chiamate < 2 ? risposta(500, { message: 'Errore interno' }) : risposta(201, {})
    }))
    await scorri(coda.esegui(richiesta))
    expect(chiamate).toBe(2)
  })
})

describe('lo stato è sempre visibile', () => {
  it('avvisa chi ascolta a ogni cambiamento', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => risposta(201, {})))
    const avvisi = vi.fn()
    const disiscrivi = coda.sottoscrivi(avvisi)
    await scorri(coda.esegui(richiesta))
    expect(avvisi.mock.calls.length).toBeGreaterThan(1)
    disiscrivi()
  })

  it('mentre ritenta lo stato è «in corso», non «ok»', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('rete assente') }))
    const p = coda.esegui(richiesta).catch(() => {})
    await vi.advanceTimersByTimeAsync(500)
    expect(coda.stato).toBe('in-corso')
    await scorri(p)
  })
})
