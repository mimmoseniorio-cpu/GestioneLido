'use client'

/**
 * F6-31 · Coda di scritture con ritentativo — NF-02, criterio 10.
 *
 * Requisito: con rete instabile nessuna operazione deve risultare persa o
 * ambigua. Il caso concreto non è «la reception resta senza rete per un'ora»,
 * è «il wifi salta per tre secondi mentre l'operatore conferma».
 *
 * Perciò: la scrittura non si perde, si ritenta da sola con attese crescenti,
 * e nel frattempo lo stato è VISIBILE. Se dopo i tentativi non passa, resta in
 * coda con un pulsante «riprova» — mai un fallimento silenzioso.
 *
 * Ogni operazione porta la propria chiave di idempotenza, generata una volta
 * sola: ritentare non può quindi produrre due prenotazioni o due incassi.
 */

export type StatoCoda = 'ok' | 'in-corso' | 'da-riprovare'

export type OperazioneInCoda = {
  id: string
  descrizione: string
  tentativi: number
  ultimoErrore: string | null
}

type Richiesta = {
  url: string
  metodo: 'POST' | 'PATCH' | 'DELETE'
  corpo?: unknown
  descrizione: string
}

const ATTESE_MS = [0, 1_000, 3_000, 8_000]   // quattro tentativi, poi tocca all'utente

export class CodaScritture {
  private inCoda = new Map<string, { richiesta: Richiesta; chiave: string; op: OperazioneInCoda }>()
  private ascoltatori = new Set<() => void>()

  sottoscrivi(f: () => void) { this.ascoltatori.add(f); return () => { this.ascoltatori.delete(f) } }
  private avvisa() { for (const f of this.ascoltatori) f() }

  get operazioni(): OperazioneInCoda[] {
    return [...this.inCoda.values()].map(x => x.op)
  }

  get stato(): StatoCoda {
    if (this.inCoda.size === 0) return 'ok'
    return this.operazioni.some(o => o.tentativi >= ATTESE_MS.length) ? 'da-riprovare' : 'in-corso'
  }

  /**
   * Esegue la richiesta ritentando. Risolve con la risposta, oppure rifiuta
   * lasciando l'operazione in coda perché l'utente possa riprovare.
   */
  async esegui<T>(richiesta: Richiesta): Promise<T> {
    const id = crypto.randomUUID()
    const chiave = crypto.randomUUID()   // una sola volta: i ritentativi la riusano
    const op: OperazioneInCoda = { id, descrizione: richiesta.descrizione, tentativi: 0, ultimoErrore: null }
    this.inCoda.set(id, { richiesta, chiave, op })
    this.avvisa()
    return this.tenta<T>(id)
  }

  /** Riprova un'operazione rimasta in coda, su richiesta dell'utente. */
  async riprova<T>(id: string): Promise<T> {
    const voce = this.inCoda.get(id)
    if (!voce) throw new Error('Operazione non più in coda.')
    voce.op.tentativi = 0
    this.avvisa()
    return this.tenta<T>(id)
  }

  scarta(id: string) { this.inCoda.delete(id); this.avvisa() }

  private async tenta<T>(id: string): Promise<T> {
    const voce = this.inCoda.get(id)
    if (!voce) throw new Error('Operazione non più in coda.')

    for (let i = voce.op.tentativi; i < ATTESE_MS.length; i++) {
      if (ATTESE_MS[i]! > 0) await new Promise(r => setTimeout(r, ATTESE_MS[i]!))
      voce.op.tentativi = i + 1
      this.avvisa()
      try {
        const r = await fetch(voce.richiesta.url, {
          method: voce.richiesta.metodo,
          headers: { 'content-type': 'application/json', 'idempotency-key': voce.chiave },
          body: voce.richiesta.corpo === undefined ? undefined : JSON.stringify(voce.richiesta.corpo),
        })
        const dati = await r.json().catch(() => ({}))

        if (r.ok) { this.inCoda.delete(id); this.avvisa(); return dati as T }

        // Un rifiuto del server (posto occupato, sconto oltre soglia) NON è un
        // problema di rete: ritentarlo darebbe lo stesso esito e nasconderebbe
        // il motivo vero. Esce subito e toglie l'operazione dalla coda.
        if (r.status < 500) {
          this.inCoda.delete(id); this.avvisa()
          throw Object.assign(new Error(dati.message ?? 'Operazione rifiutata.'), { dominio: dati })
        }
        voce.op.ultimoErrore = dati.message ?? `Errore ${r.status}`
      } catch (e: any) {
        if (e?.dominio) throw e                      // rifiuto di dominio: risale
        voce.op.ultimoErrore = 'Connessione assente'
      }
      this.avvisa()
    }

    // Esauriti i tentativi resta in coda: l'operatore vede cosa non è passato
    // e può riprovare. Mai un fallimento silenzioso.
    throw Object.assign(new Error(voce.op.ultimoErrore ?? 'Non salvato'), { inCoda: id })
  }
}

export const coda = new CodaScritture()
