'use client'

/**
 * F5-03 · Mappa SVG · F5-05 contatori · F5-06 pannello rapido
 * F5-09 selettore data · F5-10 aggiornamento ottimistico
 *
 * MAPPA FIRST: si apre qui, e da qui si fa tutto. Nessun menu prima del lavoro.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MapDay, MapUmbrella } from '@/server/queries/map'
import { STATES, euro, dataLunga, dataBreve, spostaGiorni, oggiIso } from './states'

const CELLA = 46          // ≥ 44 px: target touch con dita bagnate
const PADDING = 10

type Sync = 'ok' | 'pending' | 'error'

export default function MapClient({ iniziale, clubName }:
  { iniziale: MapDay; clubName: string }) {

  const [mappa, setMappa] = useState<MapDay>(iniziale)
  const [data, setData] = useState(iniziale.date)
  const [scelto, setScelto] = useState<string | null>(null)
  const [sync, setSync] = useState<Sync>('ok')
  const [errore, setErrore] = useState<string | null>(null)
  const cache = useRef<Map<string, MapDay>>(new Map([[iniziale.date, iniziale]]))

  const carica = useCallback(async (giorno: string, mostraAttesa = true) => {
    const salvata = cache.current.get(giorno)
    if (salvata) { setMappa(salvata); return salvata }
    if (mostraAttesa) setSync('pending')
    try {
      const r = await fetch(`/api/v1/map?date=${giorno}`)
      if (!r.ok) throw new Error(String(r.status))
      const dati: MapDay = await r.json()
      cache.current.set(giorno, dati)
      if (mostraAttesa) { setMappa(dati); setSync('ok') }
      return dati
    } catch {
      if (mostraAttesa) setSync('error')
      return null
    }
  }, [])

  // Precarica ieri e domani: scorrere tra i giorni deve essere istantaneo.
  useEffect(() => {
    void carica(spostaGiorni(data, 1), false)
    void carica(spostaGiorni(data, -1), false)
  }, [data, carica])

  const vaiA = (giorno: string) => { setData(giorno); setScelto(null); void carica(giorno) }

  /** Ricarica dal server scartando la cache del giorno toccato. */
  const rinfresca = useCallback(async (giorno = data) => {
    cache.current.delete(giorno)
    const dati = await carica(giorno)
    if (dati) setMappa(dati)
  }, [carica, data])

  const larghezza = useMemo(() =>
    (Math.max(0, ...mappa.umbrellas.map(u => u.posX),
                 ...mappa.features.map(f => f.posX + f.width - 1)) + 1) * CELLA + PADDING * 2,
    [mappa])
  const altezza = useMemo(() =>
    (Math.max(0, ...mappa.umbrellas.map(u => u.posY),
                 ...mappa.features.map(f => f.posY + f.height - 1)) + 1) * CELLA + PADDING * 2,
    [mappa])

  const selezionato = mappa.umbrellas.find(u => u.id === scelto) ?? null
  const c = mappa.counters

  return (
    <>
      <header className="topbar">
        <span className="brand">{clubName}</span>
        <span className="grow" />
        <span className="sync" aria-live="polite">
          <span className={`dot ${sync === 'ok' ? '' : sync}`} />
          {sync === 'ok' ? 'sincronizzato' : sync === 'pending' ? 'in corso…' : 'non salvato'}
        </span>
      </header>

      <div className="datebar">
        <button onClick={() => vaiA(spostaGiorni(data, -1))} aria-label="Giorno precedente">◀</button>
        <span className="day">{dataLunga(data)}</span>
        <button onClick={() => vaiA(spostaGiorni(data, 1))} aria-label="Giorno successivo">▶</button>
        <button onClick={() => vaiA(oggiIso())} disabled={data === oggiIso()}>Oggi</button>
      </div>

      {/* Scenario F: la risposta è già qui, senza toccare nulla. */}
      <div className="counters">
        <span className="chip"><b>{c.occupied}</b> occupati</span>
        <span className="chip"><b>{c.free}</b> liberi</span>
        {c.seasonalAbsent > 0 && (
          <span className="chip hi">☆ <b>{c.seasonalAbsent}</b> stagionali assenti</span>
        )}
        <span className="chip hi"><b>{c.sellable}</b> vendibili ora</span>
        <span className="chip"><b>{c.seasonalPresent}</b> stagionali</span>
        {c.booked > 0 && <span className="chip"><b>{c.booked}</b> prenotati</span>}
        {c.blocked > 0 && <span className="chip">⊘ <b>{c.blocked}</b> bloccati</span>}
        <span className="chip">{c.occupancyPercent}% su {c.total}</span>
      </div>

      <div className="legend legend-top">
        {(['LIBERO','OCCUPATO','PRENOTATO','STAGIONALE_PRESENTE','STAGIONALE_ASSENTE','BLOCCATO'] as const)
          .map(s => (
            <span key={s}>
              <i className="key" style={{ background: STATES[s].fill, borderColor: STATES[s].line,
                   borderStyle: STATES[s].border === 'dashed' ? 'dashed' : 'solid' }} />
              {STATES[s].symbol} {STATES[s].short}
            </span>
          ))}
      </div>

      <div className="mapwrap">
        <div className="mapcard">
          <div className="sea">～ ～ ～ mare ～ ～ ～</div>
          <svg className="map" viewBox={`0 0 ${larghezza} ${altezza}`} role="img"
               aria-label={`Mappa dello stabilimento, ${dataLunga(data)}`}>
            <defs>
              <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse"
                       patternTransform="rotate(45)">
                <rect width="7" height="7" fill="var(--s-blocked-fill)" />
                <line x1="0" y1="0" x2="0" y2="7" stroke="var(--s-blocked-line)" strokeWidth="2.5" />
              </pattern>
            </defs>

            {/* Due passaggi: prima tutti i rettangoli, poi tutte le etichette.
                Altrimenti un corridoio disegnato dopo copre il nome della
                passerella disegnata prima. */}
            {mappa.features.map(f => (
              <rect key={f.id} x={PADDING + f.posX * CELLA} y={PADDING + f.posY * CELLA}
                    width={f.width * CELLA - 4} height={f.height * CELLA - 4} rx="6"
                    fill={f.kind === 'WALKWAY' || f.kind === 'CORRIDOR' ? '#eef2f7' : '#e8f0ec'}
                    stroke="#cbd5e1" strokeDasharray="4 3" />
            ))}
            {mappa.features.filter(f => f.label).map(f => (
              <text key={`l-${f.id}`}
                    x={PADDING + f.posX * CELLA + (f.width * CELLA - 4) / 2}
                    y={PADDING + f.posY * CELLA + (f.height * CELLA) / 2}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize="12" fill="#475569">{f.label}</text>
            ))}

            {mappa.umbrellas.map(u => (
              <Ombrellone key={u.id} u={u} onClick={() => setScelto(u.id)} />
            ))}
          </svg>

        </div>
      </div>

      <div className="actions">
        <button onClick={() => vaiA(oggiIso())}>Oggi</button>
        <button onClick={() => void rinfresca()}>Aggiorna</button>
      </div>

      {selezionato && (
        <>
          <div className="scrim" onClick={() => { setScelto(null); setErrore(null) }} />
          <Pannello
            u={selezionato} data={data} errore={errore}
            onChiudi={() => { setScelto(null); setErrore(null) }}
            onErrore={setErrore}
            onSync={setSync}
            onCambiato={async () => { await rinfresca(); setScelto(null) }}
            /* F5-10: la UI si muove subito, il server riconcilia dopo. */
            onOttimistico={(patch) => setMappa(m => ({
              ...m,
              umbrellas: m.umbrellas.map(x => x.id === selezionato.id ? { ...x, ...patch } : x),
            }))}
          />
        </>
      )}
    </>
  )
}

function Ombrellone({ u, onClick }: { u: MapUmbrella; onClick: () => void }) {
  const s = STATES[u.state]
  const x = PADDING + u.posX * CELLA
  const y = PADDING + u.posY * CELLA
  const lato = CELLA - 5

  return (
    <g className="umb" onClick={onClick} role="button" tabIndex={0}
       onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick() }}
       aria-label={`Ombrellone ${u.visibleNumber}, ${s.label}`}>
      <rect className="body" x={x} y={y} width={lato} height={lato} rx="8"
            fill={s.border === 'hatch' ? 'url(#hatch)' : s.fill}
            stroke={s.line} strokeWidth={s.border === 'double' ? 3 : 2}
            strokeDasharray={s.border === 'dashed' ? '5 3' : undefined} />
      {/* terzo segnale: il bordo doppio dei posti vendibili */}
      {s.border === 'double' && (
        <rect x={x + 4} y={y + 4} width={lato - 8} height={lato - 8} rx="5"
              fill="none" stroke={s.line} strokeWidth="1.5" />
      )}
      <text x={x + lato / 2} y={y + lato / 2 + 1} textAnchor="middle" dominantBaseline="middle"
            fontSize="14" fontWeight="700" fill={s.ink}>{u.visibleNumber}</text>
      <text x={x + lato - 6} y={y + 12} textAnchor="end" fontSize="11" fill={s.ink}>{s.symbol}</text>
    </g>
  )
}

/**
 * F5-06 · L'azione primaria CAMBIA in base allo stato.
 *
 * È ciò che rende veloce il pannello: nell'80% dei casi il pulsante grande è
 * già quello giusto. Su un occupato con saldo aperto è incassare, su un
 * vendibile è vendere, su un libero è prenotare.
 */
function Pannello({ u, data, errore, onChiudi, onErrore, onSync, onCambiato, onOttimistico }: {
  u: MapUmbrella
  data: string
  errore: string | null
  onChiudi: () => void
  onErrore: (m: string | null) => void
  onSync: (s: Sync) => void
  onCambiato: () => Promise<void>
  onOttimistico: (patch: Partial<MapUmbrella>) => void
}) {
  const s = STATES[u.state]
  const [form, setForm] = useState(false)
  const [nome, setNome] = useState('')
  const [cognome, setCognome] = useState('')
  const [tel, setTel] = useState('')
  const [attesa, setAttesa] = useState(false)

  async function prenota() {
    if (!cognome.trim()) { onErrore('Serve almeno il cognome.'); return }
    setAttesa(true); onErrore(null); onSync('pending')
    // Aggiornamento ottimistico: la mappa reagisce subito.
    onOttimistico({ state: 'OCCUPATO', customerName: `${nome} ${cognome}`.trim() })
    try {
      const rc = await fetch('/api/v1/customers', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ firstName: nome || 'Cliente', lastName: cognome, phone: tel || undefined }),
      })
      if (!rc.ok) throw await rc.json()
      const cliente = await rc.json()

      const rr = await fetch('/api/v1/reservations', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ umbrellaIds: [u.id], customerId: cliente.id,
                               from: data, to: data, source: 'RECEPTION' }),
      })
      if (!rr.ok) throw await rr.json()
      onSync('ok'); await onCambiato()
    } catch (e: any) {
      onSync('error')
      onErrore(e?.message ?? 'Operazione non riuscita. Riprova.')
      await onCambiato()          // riconciliazione: la verità è del server
    } finally { setAttesa(false) }
  }

  async function libera() {
    if (!u.reservationId) return
    setAttesa(true); onErrore(null); onSync('pending')
    onOttimistico({ state: 'LIBERO', customerName: null, period: null, amountDueCents: null })
    try {
      const r = await fetch(`/api/v1/reservations/${u.reservationId}/cancel`, { method: 'POST' })
      if (!r.ok) throw await r.json()
      onSync('ok'); await onCambiato()
    } catch (e: any) {
      onSync('error'); onErrore(e?.message ?? 'Operazione non riuscita.'); await onCambiato()
    } finally { setAttesa(false) }
  }

  const daIncassare = (u.amountDueCents ?? 0) > 0

  return (
    <aside className="panel" role="dialog" aria-label={`Ombrellone ${u.visibleNumber}`}>
      <div style={{ display: 'flex', alignItems: 'start', gap: 12 }}>
        <div className="grow">
          <h2>Ombrellone {u.visibleNumber}</h2>
          <div className="sub">Fila {u.rowLabel} · {u.capacity} posti</div>
        </div>
        <button onClick={onChiudi} aria-label="Chiudi">✕</button>
      </div>

      <div className="state-line" style={{ color: s.line }}>
        <span aria-hidden>{s.symbol}</span> {s.label}
      </div>

      {errore && <div className="err">{errore}</div>}

      {u.blockedReason && <div className="box">Motivo: {u.blockedReason}</div>}

      {u.customerName && (
        <div className="box">
          <div style={{ fontWeight: 600, fontSize: 18 }}>{u.customerName}</div>
          {u.customerPhone && (
            <div className="row">
              <span>{u.customerPhone}</span>
              <a href={`https://wa.me/${u.customerPhone.replace(/\D/g, '')}`}
                 target="_blank" rel="noreferrer">WhatsApp</a>
            </div>
          )}
          {u.period && (
            <div className="row"><span className="k">Periodo</span>
              <span>{dataBreve(u.period.from)} – {dataBreve(u.period.to)}</span></div>
          )}
          {u.amountDueCents != null && (
            <div className="row"><span className="k">Da incassare</span>
              <span className={daIncassare ? 'due' : ''}>{euro(u.amountDueCents)}</span></div>
          )}
          {u.isTemporarySlot && (
            <div className="row"><span className="k">Nota</span>
              <span>posto stagionale venduto temporaneamente</span></div>
          )}
        </div>
      )}

      {/* Il costo della vendita è visibile PRIMA di vendere, e la frase che
          toglie al gestore la paura di perdere il posto. */}
      {u.absence && (
        <div className="box warn">
          <div className="row"><span className="k">Stagionale</span><b>{u.absence.seasonalName}</b></div>
          <div className="row"><span className="k">Assente</span>
            <span>{dataBreve(u.absence.from)} – {dataBreve(u.absence.to)}</span></div>
          <div style={{ marginTop: 8 }}>
            Torna riservato il <b>{dataBreve(spostaGiorni(u.absence.to, 1))}</b>.
          </div>
        </div>
      )}

      {!form && u.sellable && (
        <button className="primary" onClick={() => setForm(true)} disabled={attesa}>
          {u.absence ? 'VENDI PER OGGI' : 'PRENOTA'}
        </button>
      )}

      {form && (
        <div className="box" style={{ display: 'grid', gap: 10 }}>
          <input placeholder="Cognome" value={cognome} autoFocus
                 onChange={e => setCognome(e.target.value)} />
          <input placeholder="Nome (facoltativo)" value={nome}
                 onChange={e => setNome(e.target.value)} />
          <input placeholder="Telefono (facoltativo)" inputMode="tel" value={tel}
                 onChange={e => setTel(e.target.value)} />
          <button className="primary" onClick={() => void prenota()} disabled={attesa}>
            {attesa ? 'Registro…' : 'CONFERMA'}
          </button>
          <button onClick={() => setForm(false)} disabled={attesa}>Annulla</button>
        </div>
      )}

      {u.reservationId && (
        <button className="danger" onClick={() => void libera()} disabled={attesa}>
          Libera ombrellone
        </button>
      )}
    </aside>
  )
}
