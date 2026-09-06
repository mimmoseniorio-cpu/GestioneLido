'use client'

/**
 * F6-09 / F6-10 · Area del cliente stagionale — scenario C.
 *
 * Chi la usa è spesso una persona anziana, sul telefono, senza istruzioni e
 * senza password. Una sola azione possibile, grande. Il caso di gran lunga più
 * frequente — «domani non vengo» — costa DUE tocchi dopo l'apertura: la
 * scorciatoia DOMANI esiste per quello, il calendario serve solo a chi parte
 * per una settimana.
 */
import { useState } from 'react'
import type { AreaCliente } from '@/server/queries/customer-area'

const GIORNO = 86_400_000
const oggiIso = () => new Date().toISOString().slice(0, 10)
const domaniIso = () => new Date(Date.now() + GIORNO).toISOString().slice(0, 10)

const dataLunga = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('it-IT',
    { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const dataBreve = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('it-IT',
    { day: 'numeric', month: 'short', timeZone: 'UTC' })
const euro = (c: number) =>
  (c / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
const piuUno = (iso: string) =>
  new Date(new Date(iso + 'T00:00:00Z').getTime() + GIORNO).toISOString().slice(0, 10)

/** Elisione italiana: «dall'8 settembre», non «dal 8 settembre».
 *  Vale per i giorni che iniziano per vocale: 1 (uno), 8 (otto), 11 (undici). */
const VOCALE = new Set([1, 8, 11])
const dalGiorno = (iso: string) =>
  VOCALE.has(new Date(iso + 'T00:00:00Z').getUTCDate()) ? "dall'" : 'dal '

type Fase = 'riposo' | 'quando' | 'date' | 'conferma' | 'fatto'

export default function ClienteClient({ dati, token }: { dati: AreaCliente; token: string }) {
  const [fase, setFase] = useState<Fase>('riposo')
  const [dal, setDal] = useState(domaniIso())
  const [al, setAl] = useState(domaniIso())
  const [attesa, setAttesa] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [assenze, setAssenze] = useState(dati.assenze)

  async function conferma() {
    setAttesa(true); setErrore(null)
    try {
      const r = await fetch(`/api/v1/s/${token}/absences`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ from: dal, to: al }),
      })
      if (!r.ok) throw await r.json()
      const nuova = await r.json()
      setAssenze(a => [...a, {
        id: nuova.id, dal, al, giorni: nuova.giorni, tardiva: nuova.isLate,
        giorniVenduti: [], annullabile: true,
      }])
      setFase('fatto')
    } catch (e: any) {
      setErrore(e?.message ?? 'Non è stato possibile registrare. Riprovi fra un momento.')
      setFase('riposo')
    } finally { setAttesa(false) }
  }

  async function annulla(id: string) {
    setAttesa(true); setErrore(null)
    try {
      const r = await fetch(`/api/v1/s/${token}/absences/${id}`, { method: 'DELETE' })
      if (!r.ok) throw await r.json()
      const esito = await r.json()
      if (esito.esito === 'PARZIALE') {
        setErrore(`Abbiamo ripristinato il suo ombrellone per ${esito.giorniRipristinati.map(dataBreve).join(', ')}. ` +
                  `${esito.giorniVenduti.map(dataBreve).join(', ')} risulta già assegnato e non è più disponibile.`)
      }
      setAssenze(a => a.filter(x => x.id !== id))
    } catch (e: any) {
      setErrore(e?.message ?? 'Non è stato possibile annullare.')
    } finally { setAttesa(false) }
  }

  // ── Tocco 3: conferma ────────────────────────────────────────────────────
  if (fase === 'fatto') {
    return (
      <main className="cliente">
        <div className="scheda esito">
          <div className="spunta" aria-hidden>✓</div>
          <h1>Registrato</h1>
          <p className="grande">
            {dal === al
              ? <>Non sarà presente <b>{dataLunga(dal)}</b>.</>
              : <>Non sarà presente dal <b>{dataBreve(dal)}</b> al <b>{dataBreve(al)}</b>.</>}
          </p>
          {/* La frase che toglie la paura, nel momento in cui la proverebbe. */}
          <p className="rassicura">
            Il suo ombrellone torna suo {dalGiorno(piuUno(al))}<b>{dataBreve(piuUno(al))}</b>.
          </p>
          <p className="calmo">
            Se lo stabilimento riesce ad assegnarlo, riceverà un credito.
          </p>
          <button className="grandissimo secondario" onClick={() => setFase('riposo')}>
            Ho capito
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="cliente">
      <div className="intestazione">{dati.clubName}</div>

      {fase === 'riposo' && (
        <>
          <p className="saluto">Buongiorno {dati.nome}</p>

          <div className="scheda ombrellone">
            <div className="etichetta">Il suo ombrellone</div>
            <div className="numerone">{dati.numeroOmbrellone}</div>
            <div className="calmo">Fila {dati.fila}</div>
            <div className="calmo">{dataBreve(dati.dal)} – {dataBreve(dati.al)}</div>
          </div>

          {errore && <div className="avviso">{errore}</div>}

          <button className="grandissimo" onClick={() => setFase('quando')} disabled={attesa}>
            NON SARÒ PRESENTE
          </button>

          {assenze.length > 0 && (
            <div className="scheda">
              <div className="etichetta">Assenze comunicate</div>
              <ul className="assenze">
                {assenze.map(a => (
                  <li key={a.id}>
                    <div>
                      <b>{a.dal === a.al ? dataBreve(a.dal) : `${dataBreve(a.dal)} – ${dataBreve(a.al)}`}</b>
                      {a.giorniVenduti.length > 0 && (
                        <div className="calmo">
                          {a.giorniVenduti.length === a.giorni
                            ? 'assegnato ad altri'
                            : `${a.giorniVenduti.length} ${a.giorniVenduti.length === 1 ? 'giorno assegnato' : 'giorni assegnati'} ad altri`}
                        </div>
                      )}
                      {a.tardiva && <div className="calmo">comunicata fuori tempo</div>}
                    </div>
                    {a.annullabile && (
                      <button onClick={() => void annulla(a.id)} disabled={attesa}>Annulla</button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(dati.creditoCents > 0 || dati.crediti.length > 0) && (
            <div className="scheda credito">
              <div className="etichetta">Il suo credito</div>
              <div className="importone">{euro(dati.creditoCents)}</div>
              {dati.crediti.slice(0, 4).map((c, i) => (
                <div key={i} className="riga-credito">
                  <span>{c.descrizione}</span><b>{euro(c.importoCents)}</b>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Tocco 1: quando ──────────────────────────────────────────────── */}
      {fase === 'quando' && (
        <div className="scheda">
          <h1>Quando non ci sarà?</h1>
          <button className="grandissimo"
                  onClick={() => { setDal(domaniIso()); setAl(domaniIso()); setFase('conferma') }}>
            DOMANI
          </button>
          <button className="grandissimo secondario" onClick={() => setFase('date')}>
            SCEGLI LE DATE
          </button>
          <button className="testuale" onClick={() => setFase('riposo')}>Torna indietro</button>
        </div>
      )}

      {fase === 'date' && (
        <div className="scheda">
          <h1>Da quando a quando?</h1>
          <label>Dal
            <input type="date" value={dal} min={oggiIso()}
                   onChange={e => { setDal(e.target.value); if (al < e.target.value) setAl(e.target.value) }} />
          </label>
          <label>Al
            <input type="date" value={al} min={dal} onChange={e => setAl(e.target.value)} />
          </label>
          <button className="grandissimo" onClick={() => setFase('conferma')}>AVANTI</button>
          <button className="testuale" onClick={() => setFase('quando')}>Torna indietro</button>
        </div>
      )}

      {/* ── Tocco 2: conferma ────────────────────────────────────────────── */}
      {fase === 'conferma' && (
        <div className="scheda">
          <h1>Confermiamo?</h1>
          <p className="grande">
            {dal === al
              ? <>Non sarà presente <b>{dataLunga(dal)}</b>.</>
              : <>Non sarà presente dal <b>{dataBreve(dal)}</b> al <b>{dataBreve(al)}</b>.</>}
          </p>
          <p className="rassicura">
            Il suo ombrellone torna suo {dalGiorno(piuUno(al))}<b>{dataBreve(piuUno(al))}</b>.
          </p>
          <button className="grandissimo" onClick={() => void conferma()} disabled={attesa}>
            {attesa ? 'Un momento…' : 'CONFERMA'}
          </button>
          <button className="testuale" onClick={() => setFase('riposo')}>Annulla</button>
        </div>
      )}
    </main>
  )
}
