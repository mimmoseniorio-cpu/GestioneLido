'use client'

/**
 * F6-17 · Il listino, con il simulatore accanto.
 *
 * Una lista di regole con priorità è comprensibile solo se il gestore può
 * verificare l'effetto: «l'ombrellone 63 il 12 agosto quanto costa, e per
 * quale regola?». Senza il simulatore, le priorità restano un'astrazione e il
 * gestore userà sempre lo sconto manuale.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Regola = {
  id: string; name: string; priority: number; priceCents: number
  zoneId: string | null; rowLabel: string | null
  dateFrom: string | null; dateTo: string | null
  weekdays: number[]; minDays: number | null; maxDays: number | null
  active: boolean
}

const euro = (c: number) => (c / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
const GIORNI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']
const dataBreve = (s: string) =>
  new Date(s).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** Le condizioni della regola, in italiano: è ciò che rende leggibile la lista. */
function condizioni(r: Regola, zone: { id: string; name: string }[]): string {
  const parti: string[] = []
  const zona = zone.find(z => z.id === r.zoneId)
  if (zona) parti.push(zona.name.toLowerCase())
  if (r.rowLabel) parti.push(`fila ${r.rowLabel}`)
  if (r.dateFrom || r.dateTo)
    parti.push(`${r.dateFrom ? dataBreve(r.dateFrom) : '…'} – ${r.dateTo ? dataBreve(r.dateTo) : '…'}`)
  if (r.weekdays?.length) parti.push(r.weekdays.map(g => GIORNI[g - 1]).join(', '))
  if (r.minDays) parti.push(`da ${r.minDays} giorni in su`)
  if (r.maxDays) parti.push(`fino a ${r.maxDays} giorni`)
  return parti.length ? parti.join(' · ') : 'sempre, per tutti'
}

export default function Listino({ regole: iniziali, zone, ombrelloni }: {
  regole: Regola[]
  zone: { id: string; name: string }[]
  ombrelloni: { id: string; numero: string }[]
}) {
  const router = useRouter()
  const [regole, setRegole] = useState(iniziali)
  const [errore, setErrore] = useState<string | null>(null)
  const [attesa, setAttesa] = useState(false)
  const [nuova, setNuova] = useState(false)
  const [nome, setNome] = useState('')
  const [prezzo, setPrezzo] = useState('25,00')
  const [priorita, setPriorita] = useState(50)
  const [zonaId, setZonaId] = useState('')

  const oggi = new Date().toISOString().slice(0, 10)
  const [simOmb, setSimOmb] = useState(ombrelloni[0]?.id ?? '')
  const [simDal, setSimDal] = useState(oggi)
  const [simAl, setSimAl] = useState(oggi)
  const [simEsito, setSimEsito] = useState<any>(null)

  const centesimi = (s: string) => Math.round(parseFloat(s.replace(',', '.')) * 100)

  async function crea() {
    if (!nome.trim()) { setErrore('Dai un nome alla regola.'); return }
    const c = centesimi(prezzo)
    if (!Number.isFinite(c) || c < 0) { setErrore('Prezzo non valido.'); return }
    setAttesa(true); setErrore(null)
    try {
      const r = await fetch('/api/v1/price-rules', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: nome.trim(), priority: priorita, priceCents: c,
                               zoneId: zonaId || null }),
      })
      if (!r.ok) throw await r.json()
      setNuova(false); setNome(''); router.refresh()
      const lista = await (await fetch('/api/v1/price-rules')).json()
      setRegole(lista)
    } catch (e: any) { setErrore(e?.message ?? 'Non è stato possibile creare la regola.') }
    finally { setAttesa(false) }
  }

  async function cambia(id: string, campi: Record<string, unknown>) {
    setAttesa(true); setErrore(null)
    try {
      const r = await fetch(`/api/v1/price-rules/${id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(campi),
      })
      if (!r.ok) throw await r.json()
      setRegole(rs => rs.map(x => x.id === id ? { ...x, ...campi } as Regola : x))
    } catch (e: any) { setErrore(e?.message ?? 'Modifica non riuscita.') }
    finally { setAttesa(false) }
  }

  async function simula() {
    setSimEsito(null); setErrore(null)
    try {
      const r = await fetch(`/api/v1/quote?umbrellaId=${simOmb}&from=${simDal}&to=${simAl}`)
      const dati = await r.json()
      if (!r.ok) throw dati
      setSimEsito(dati)
    } catch (e: any) { setErrore(e?.message ?? 'Simulazione non riuscita.') }
  }

  return (
    <main className="configura">
      {errore && <div className="err">{errore}</div>}

      <div className="riquadro">
        <div className="etichetta">Regole · vince quella con priorità più alta</div>
        {regole.length === 0 && <p className="nota">Nessuna regola: vale la tariffa base degli ombrelloni.</p>}
        <div className="tabella">
          <table>
            <thead>
              <tr><th>Priorità</th><th>Regola</th><th>Quando</th><th className="num">Prezzo</th><th></th></tr>
            </thead>
            <tbody>
              {regole.map(r => (
                <tr key={r.id} className={r.active ? '' : 'annullata'}>
                  <td>
                    <input className="mini" type="number" min={0} max={1000} value={r.priority}
                           onChange={e => void cambia(r.id, { priority: Number(e.target.value) })} />
                  </td>
                  <td><b>{r.name}</b></td>
                  <td className="minuto">{condizioni(r, zone)}</td>
                  <td className="num">
                    <input className="mini" type="text" defaultValue={(r.priceCents / 100).toFixed(2)}
                           onBlur={e => {
                             const c = Math.round(parseFloat(e.target.value.replace(',', '.')) * 100)
                             if (Number.isFinite(c) && c !== r.priceCents) void cambia(r.id, { priceCents: c })
                           }} />
                  </td>
                  <td>
                    <button onClick={() => void cambia(r.id, { active: !r.active })} disabled={attesa}>
                      {r.active ? 'Disattiva' : 'Riattiva'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!nuova
          ? <button onClick={() => setNuova(true)}>+ Nuova regola</button>
          : (
            <div className="box form">
              <input placeholder="Nome (es. Alta stagione prima fila)" value={nome} autoFocus
                     onChange={e => setNome(e.target.value)} />
              <div className="campi">
                <label>Prezzo al giorno
                  <input value={prezzo} onChange={e => setPrezzo(e.target.value)} inputMode="decimal" />
                </label>
                <label>Priorità
                  <input type="number" min={0} max={1000} value={priorita}
                         onChange={e => setPriorita(Number(e.target.value))} />
                </label>
                <label>Zona
                  <select value={zonaId} onChange={e => setZonaId(e.target.value)}>
                    <option value="">tutte</option>
                    {zone.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                  </select>
                </label>
              </div>
              <button className="primary" onClick={() => void crea()} disabled={attesa}>CREA REGOLA</button>
              <button onClick={() => setNuova(false)}>Annulla</button>
            </div>
          )}
      </div>

      {/* Senza il simulatore le priorità restano un'astrazione. */}
      <div className="riquadro">
        <div className="etichetta">Prova il listino</div>
        <div className="campi">
          <label>Ombrellone
            <select value={simOmb} onChange={e => setSimOmb(e.target.value)}>
              {ombrelloni.map(u => <option key={u.id} value={u.id}>{u.numero}</option>)}
            </select>
          </label>
          <label>Dal<input type="date" value={simDal} onChange={e => setSimDal(e.target.value)} /></label>
          <label>Al<input type="date" value={simAl} min={simDal} onChange={e => setSimAl(e.target.value)} /></label>
        </div>
        <button onClick={() => void simula()}>Calcola</button>
        {simEsito && (
          <div className="preventivo">
            <div className="voci">
              {simEsito.righe.map((r: any, i: number) => (
                <div key={i} className="voce">
                  <span>{r.giorni} {r.giorni === 1 ? 'giorno' : 'giorni'} · {r.regola}</span>
                  <span>{euro(r.importoCents)}</span>
                </div>
              ))}
            </div>
            <b>{euro(simEsito.totaleCents)}</b>
          </div>
        )}
      </div>
    </main>
  )
}
