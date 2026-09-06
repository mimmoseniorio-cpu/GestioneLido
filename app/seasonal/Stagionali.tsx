'use client'

/**
 * F6-05 / F6-11 · I contratti stagionali e le loro assenze.
 *
 * L'ordine mette in cima chi è assente OGGI: è il posto che il gestore può
 * vendere adesso, cioè la ragione per cui questa pagina esiste.
 *
 * E c'è la registrazione dell'assenza per conto del cliente: molti stagionali
 * telefoneranno invece di usare il link, e se l'operatore non può registrarla
 * al posto loro l'informazione si perde (docs/07, variante dello scenario C).
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { RigaStagionale } from '@/server/queries/seasonal'
import type { ClienteTrovato } from '@/server/queries/customers'

const euro = (c: number) => (c / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
const breve = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const oggiIso = () => new Date().toISOString().slice(0, 10)
const domaniIso = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

export default function Stagionali({ righe, ombrelloni, stagione, puoGestire }: {
  righe: RigaStagionale[]
  ombrelloni: { id: string; numero: string; fila: string }[]
  stagione: { dal: string; al: string } | null
  puoGestire: boolean
}) {
  const router = useRouter()
  const [errore, setErrore] = useState<string | null>(null)
  const [attesa, setAttesa] = useState(false)
  const [linkNuovo, setLinkNuovo] = useState<string | null>(null)

  // ── nuovo contratto ──────────────────────────────────────────────────────
  const [apri, setApri] = useState(false)
  const [q, setQ] = useState('')
  const [clienti, setClienti] = useState<ClienteTrovato[]>([])
  const [cliente, setCliente] = useState<ClienteTrovato | null>(null)
  const [umbrellaId, setUmbrellaId] = useState(ombrelloni[0]?.id ?? '')
  const [dal, setDal] = useState(stagione?.dal ?? oggiIso())
  const [al, setAl] = useState(stagione?.al ?? oggiIso())
  const [prezzo, setPrezzo] = useState('1800,00')

  // ── assenza per conto del cliente ────────────────────────────────────────
  const [assenzaPer, setAssenzaPer] = useState<RigaStagionale | null>(null)
  const [aDal, setADal] = useState(domaniIso())
  const [aAl, setAAl] = useState(domaniIso())

  async function cerca(testo: string) {
    setQ(testo); setCliente(null)
    if (testo.trim().length < 2) { setClienti([]); return }
    try {
      const r = await fetch(`/api/v1/customers?q=${encodeURIComponent(testo)}`)
      if (r.ok) setClienti(await r.json())
    } catch { /* la ricerca è un aiuto, non blocca */ }
  }

  async function crea() {
    if (!cliente) { setErrore('Scegli il cliente.'); return }
    const c = Math.round(parseFloat(prezzo.replace(',', '.')) * 100)
    if (!Number.isFinite(c)) { setErrore('Prezzo non valido.'); return }
    setAttesa(true); setErrore(null)
    try {
      const r = await fetch('/api/v1/contracts', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customerId: cliente.id, umbrellaId, dal, al, prezzoCents: c }),
      })
      const dati = await r.json()
      if (!r.ok) throw dati
      setLinkNuovo(dati.link); setApri(false); setCliente(null); setQ('')
      router.refresh()
    } catch (e: any) {
      // C-16 · dire quali prenotazioni sono in conflitto, non solo che c'è
      const conflitti = e?.details?.prenotazioni
      setErrore(conflitti
        ? `${e.message} — ${conflitti.map((x: any) => `${x.cliente} ${breve(x.dal)}–${breve(x.al)}`).join('; ')}`
        : e?.message ?? 'Non è stato possibile creare il contratto.')
    } finally { setAttesa(false) }
  }

  /**
   * Le date arrivano per argomento, non dallo stato: la scorciatoia DOMANI le
   * imposta e registra nello stesso gesto, e `setState` non è ancora
   * applicato quando la funzione parte — leggerle dallo stato manderebbe le
   * date precedenti.
   */
  async function registraAssenza(da = aDal, a = aAl) {
    if (!assenzaPer) return
    setAttesa(true); setErrore(null)
    try {
      const r = await fetch('/api/v1/absences', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contractId: assenzaPer.id, from: da, to: a }),
      })
      const dati = await r.json()
      if (!r.ok) throw dati
      setAssenzaPer(null)
      if (dati.isLate) setErrore('Registrata, ma fuori tempo: per questi giorni non matura credito.')
      router.refresh()
    } catch (e: any) { setErrore(e?.message ?? 'Non è stato possibile registrare l’assenza.') }
    finally { setAttesa(false) }
  }

  async function annulla(id: string) {
    setAttesa(true); setErrore(null)
    try {
      const r = await fetch(`/api/v1/contracts/${id}`, { method: 'DELETE' })
      if (!r.ok) throw await r.json()
      router.refresh()
    } catch (e: any) { setErrore(e?.message ?? 'Operazione non riuscita.') }
    finally { setAttesa(false) }
  }

  return (
    <main className="configura">
      {errore && <div className="err">{errore}</div>}
      {linkNuovo && (
        <div className="riquadro">
          <div className="etichetta">Contratto creato · link personale</div>
          <code className="link-personale">{linkNuovo}</code>
          <div className="nota">Mandalo al cliente: da lì comunicherà le assenze.</div>
        </div>
      )}

      <div className="riquadro">
        <div className="etichetta">
          {righe.length} {righe.length === 1 ? 'contratto attivo' : 'contratti attivi'}
          {righe.some(r => r.assenteOggi) && ' · in cima chi è assente oggi'}
        </div>

        <div className="tabella">
          <table>
            <thead>
              <tr>
                <th>Omb.</th><th>Cliente</th><th>Periodo</th>
                <th className="num">Credito</th><th>Assenze</th><th></th>
              </tr>
            </thead>
            <tbody>
              {righe.map(r => (
                <tr key={r.id} className={r.assenteOggi ? 'assente-oggi' : ''}>
                  <td><b>{r.ombrellone}</b><div className="minuto">fila {r.fila}</div></td>
                  <td>{r.cliente}<div className="minuto">{r.telefono ?? '—'}</div></td>
                  <td className="minuto">{breve(r.dal)} – {breve(r.al)}</td>
                  <td className="num">{r.creditoCents > 0 ? euro(r.creditoCents) : '—'}</td>
                  <td>
                    {r.assenteOggi
                      ? <span className="pastiglia-assente">
                          ☆ assente fino al {breve(r.assenteOggi.al)}
                        </span>
                      : r.assenzeFuture > 0
                        ? <span className="minuto">{r.assenzeFuture} future</span>
                        : <span className="minuto">—</span>}
                  </td>
                  <td>
                    <div className="azioni-riga">
                      <button onClick={() => { setAssenzaPer(r); setADal(domaniIso()); setAAl(domaniIso()) }}
                              disabled={attesa}>
                        Registra assenza
                      </button>
                      {puoGestire && (
                        <button className="danger" onClick={() => void annulla(r.id)} disabled={attesa}>
                          Chiudi
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {puoGestire && !apri && (
          <button onClick={() => setApri(true)}>+ Nuovo contratto stagionale</button>
        )}

        {apri && (
          <div className="box form">
            <input placeholder="Cerca il cliente per cognome o telefono" value={q}
                   onChange={e => void cerca(e.target.value)} autoFocus />
            {!cliente && clienti.length > 0 && (
              <div className="clienti-trovati">
                {clienti.map(c => (
                  <button key={c.id} onClick={() => { setCliente(c); setQ(c.nome); setClienti([]) }}>
                    <span className="chi">{c.nome}</span>
                    <span className="dove">{c.telefono ?? ''}</span>
                  </button>
                ))}
              </div>
            )}
            {cliente && <div className="nota">Cliente scelto: <b>{cliente.nome}</b></div>}

            <div className="campi">
              <label>Ombrellone
                <select value={umbrellaId} onChange={e => setUmbrellaId(e.target.value)}>
                  {ombrelloni.map(u => (
                    <option key={u.id} value={u.id}>{u.numero} · fila {u.fila}</option>
                  ))}
                </select>
              </label>
              <label>Dal<input type="date" value={dal} onChange={e => setDal(e.target.value)} /></label>
              <label>Al<input type="date" value={al} min={dal} onChange={e => setAl(e.target.value)} /></label>
              <label>Prezzo stagione
                <input value={prezzo} inputMode="decimal" onChange={e => setPrezzo(e.target.value)} />
              </label>
            </div>
            <button className="primary" onClick={() => void crea()} disabled={attesa}>
              {attesa ? 'Creo…' : 'CREA CONTRATTO'}
            </button>
            <button onClick={() => setApri(false)}>Annulla</button>
          </div>
        )}
      </div>

      {/* F6-11 · lo stagionale che telefona invece di usare il link */}
      {assenzaPer && (
        <>
          <div className="scrim" onClick={() => setAssenzaPer(null)} />
          <aside className="panel" role="dialog" aria-label="Registra assenza">
            <div className="head">
              <div className="grow">
                <h2>Ombrellone {assenzaPer.ombrellone}</h2>
                <div className="sub">{assenzaPer.cliente}</div>
              </div>
              <button onClick={() => setAssenzaPer(null)} aria-label="Chiudi">✕</button>
            </div>
            <p>Non sarà presente:</p>
            <div className="box form">
              <button className="primary"
                      onClick={() => { setADal(domaniIso()); setAAl(domaniIso())
                                       void registraAssenza(domaniIso(), domaniIso()) }}
                      disabled={attesa}>
                DOMANI
              </button>
              <div className="due-campi">
                <label>Dal<input type="date" value={aDal} min={oggiIso()}
                       onChange={e => { setADal(e.target.value); if (aAl < e.target.value) setAAl(e.target.value) }} /></label>
                <label>Al<input type="date" value={aAl} min={aDal}
                       onChange={e => setAAl(e.target.value)} /></label>
              </div>
              <button className="primary" onClick={() => void registraAssenza()} disabled={attesa}>
                {attesa ? 'Registro…' : 'REGISTRA'}
              </button>
            </div>
          </aside>
        </>
      )}
    </main>
  )
}
