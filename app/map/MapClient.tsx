'use client'

/**
 * La schermata principale del prodotto.
 *
 * Tesi (PROJECT_BRIEF §1): non è la prenotazione, è sapere in ogni momento
 * quale capacità può essere venduta. Per questo i contatori vengono prima
 * della mappa, e la capacità recuperata dagli stagionali assenti ha una riga
 * tutta sua.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MapDay, MapUmbrella } from '@/server/queries/map'
import { STATES, euro, dataLunga, dataBreve, spostaGiorni, oggiIso } from './states'

const CELLA = 56          // bersagli generosi: sole, mani bagnate, una mano sola
const PADDING = 10

type Sync = 'ok' | 'pending' | 'error'

const giorniTra = (a: string, b: string) =>
  Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86_400_000) + 1

const soloCifre = (s: string) => s.replace(/\D/g, '')

export default function MapClient({ iniziale, clubName }:
  { iniziale: MapDay; clubName: string }) {

  const [mappa, setMappa] = useState<MapDay>(iniziale)
  const [data, setData] = useState(iniziale.date)
  const [scelto, setScelto] = useState<string | null>(null)
  const [sync, setSync] = useState<Sync>('ok')
  const [errore, setErrore] = useState<string | null>(null)
  const [cerca, setCerca] = useState('')
  const [trovaAperto, setTrovaAperto] = useState(false)
  const [evidenziati, setEvidenziati] = useState<Set<string> | null>(null)
  const cache = useRef<Map<string, MapDay>>(new Map([[iniziale.date, iniziale]]))

  const carica = useCallback(async (giorno: string, mostra = true) => {
    const salvata = cache.current.get(giorno)
    if (salvata) { if (mostra) setMappa(salvata); return salvata }
    if (mostra) setSync('pending')
    try {
      const r = await fetch(`/api/v1/map?date=${giorno}`)
      if (!r.ok) throw new Error(String(r.status))
      const dati: MapDay = await r.json()
      cache.current.set(giorno, dati)
      if (mostra) { setMappa(dati); setSync('ok') }
      return dati
    } catch { if (mostra) setSync('error'); return null }
  }, [])

  useEffect(() => {
    void carica(spostaGiorni(data, 1), false)
    void carica(spostaGiorni(data, -1), false)
  }, [data, carica])

  const vaiA = (giorno: string) => { setData(giorno); setScelto(null); void carica(giorno) }

  const rinfresca = useCallback(async (giorno = data) => {
    cache.current.delete(giorno)
    const dati = await carica(giorno)
    if (dati) setMappa(dati)
  }, [carica, data])

  // ── ricerca istantanea, sul giorno già caricato: nessuna latenza ─────────
  const trovati = useMemo(() => {
    const q = cerca.trim().toLowerCase()
    if (q.length < 1) return evidenziati
    const cifre = soloCifre(q)
    const ids = new Set<string>()
    for (const u of mappa.umbrellas) {
      const numero = u.visibleNumber.toLowerCase()
      if (numero === q || numero.startsWith(q)) { ids.add(u.id); continue }
      if (u.customerName?.toLowerCase().includes(q)) { ids.add(u.id); continue }
      if (u.absence?.seasonalName.toLowerCase().includes(q)) { ids.add(u.id); continue }
      if (cifre.length >= 3 && u.customerPhone && soloCifre(u.customerPhone).includes(cifre)) ids.add(u.id)
    }
    return ids
  }, [cerca, mappa, evidenziati])

  const larghezza = useMemo(() =>
    (Math.max(0, ...mappa.umbrellas.map(u => u.posX),
                 ...mappa.features.map(f => f.posX + f.width - 1)) + 1) * CELLA + PADDING * 2, [mappa])
  const altezza = useMemo(() =>
    (Math.max(0, ...mappa.umbrellas.map(u => u.posY),
                 ...mappa.features.map(f => f.posY + f.height - 1)) + 1) * CELLA + PADDING * 2, [mappa])

  const selezionato = mappa.umbrellas.find(u => u.id === scelto) ?? null
  const c = mappa.counters
  const oggi = data === oggiIso()

  return (
    <>
      <header className="topbar">
        <span className="brand">{clubName}</span>
        <div className="search">
          <input value={cerca} onChange={e => setCerca(e.target.value)}
                 placeholder="Cerca cliente, telefono o numero ombrellone"
                 aria-label="Cerca" inputMode="search" />
          {cerca && <button className="clear" onClick={() => setCerca('')} aria-label="Pulisci">✕</button>}
        </div>
        <span className="sync" aria-live="polite">
          <span className={`dot ${sync === 'ok' ? '' : sync}`} />
          {sync === 'ok' ? 'sincronizzato' : sync === 'pending' ? 'in corso…' : 'non salvato'}
        </span>
      </header>

      {/* Il rischio operativo peggiore è prenotare credendo di guardare oggi. */}
      <div className={`datebar ${oggi ? '' : 'altro-giorno'}`}>
        <button onClick={() => vaiA(spostaGiorni(data, -1))} aria-label="Giorno precedente">◀</button>
        <span className="day">
          {oggi ? 'Oggi · ' : ''}{dataLunga(data)}
        </span>
        <button onClick={() => vaiA(spostaGiorni(data, 1))} aria-label="Giorno successivo">▶</button>
        {oggi
          ? <button disabled>Oggi</button>
          : <button className="torna-oggi" onClick={() => vaiA(oggiIso())}>← Torna a oggi</button>}
        {!oggi && <span className="avviso-giorno">Non stai guardando oggi</span>}
      </div>

      {trovati && (
        <div className="risultati">
          {cerca
            ? (trovati.size === 0
                ? <>Nessun risultato per <b>«{cerca}»</b> in questo giorno</>
                : <>{trovati.size} {trovati.size === 1 ? 'risultato' : 'risultati'} per <b>«{cerca}»</b></>)
            : <>Proposta evidenziata sulla mappa: <b>{trovati.size} ombrelloni</b></>}
          <button onClick={() => { setCerca(''); setEvidenziati(null) }}>Mostra tutti</button>
        </div>
      )}

      {/* Scenario F: la risposta è già qui, senza toccare nulla. */}
      <section className="oggi" aria-label="Situazione del giorno">
        <div className="oggi-testata">{oggi ? 'Oggi' : dataBreve(data)}</div>
        <div className="tiles">
          <div className="tile forte">
            <b>{c.sellable}</b><span>disponibili<br />da vendere</span>
          </div>
          <div className="tile"><b>{c.occupied}</b><span>occupati</span></div>
          {/* Una casella a zero è rumore: si mostra solo se dice qualcosa. */}
          {c.booked > 0 && <div className="tile"><b>{c.booked}</b><span>prenotati</span></div>}
          <div className="tile"><b>{c.seasonalPresent}</b><span>stagionali</span></div>
          {c.seasonalAbsent > 0 &&
            <div className="tile ambra"><b>{c.seasonalAbsent}</b><span>stagionali<br />assenti</span></div>}
          {c.blocked > 0 && <div className="tile"><b>{c.blocked}</b><span>fuori servizio</span></div>}
        </div>

        {/* La metrica che vende il prodotto: non "quanto costa" ma "quanto ha reso". */}
        {(c.recoveredToday > 0 || c.recoveredSeason > 0) && <div className="recupero">
          <div>
            <b>{c.recoveredToday}</b> {c.recoveredToday === 1 ? 'posto recuperato' : 'posti recuperati'} dagli
            stagionali assenti{c.recoveredTodayCents > 0 && <> · <b>{euro(c.recoveredTodayCents)}</b> oggi</>}
          </div>
          {c.recoveredSeason > 0 && (
            <div className="stagione">
              In stagione: {c.recoveredSeason} posti recuperati, <b>{euro(c.recoveredSeasonCents)}</b> che
              sarebbero rimasti sotto l&apos;ombrellone vuoto
            </div>
          )}
        </div>}
      </section>

      <div className="legend">
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
              <Ombrellone key={u.id} u={u} onClick={() => setScelto(u.id)}
                          evidenziato={trovati ? trovati.has(u.id) : null} />
            ))}
          </svg>
        </div>
      </div>

      <div className="actions">
        <button className="trova" onClick={() => setTrovaAperto(true)}>🔎 Trova il posto migliore</button>
        <button onClick={() => vaiA(oggiIso())} disabled={oggi}>Oggi</button>
        <button onClick={() => void rinfresca()}>Aggiorna</button>
        {evidenziati && <button onClick={() => setEvidenziati(null)}>Togli evidenza</button>}
      </div>

      {trovaAperto && (
        <>
          <div className="scrim" onClick={() => setTrovaAperto(false)} />
          <TrovaPosti
            data={data}
            onChiudi={() => setTrovaAperto(false)}
            onMostra={(ids) => { setEvidenziati(new Set(ids)); setCerca(''); setTrovaAperto(false) }}
            onPrenotato={async () => { setTrovaAperto(false); await rinfresca() }}
            onSync={setSync}
          />
        </>
      )}

      {selezionato && (
        <>
          <div className="scrim" onClick={() => { setScelto(null); setErrore(null) }} />
          <Pannello
            u={selezionato} data={data} errore={errore}
            onChiudi={() => { setScelto(null); setErrore(null) }}
            onErrore={setErrore} onSync={setSync}
            onCambiato={async () => { await rinfresca(); setScelto(null) }}
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

function Ombrellone({ u, onClick, evidenziato }:
  { u: MapUmbrella; onClick: () => void; evidenziato: boolean | null }) {
  const s = STATES[u.state]
  const x = PADDING + u.posX * CELLA
  const y = PADDING + u.posY * CELLA
  const lato = CELLA - 6
  const spento = evidenziato === false

  return (
    <g className={`umb ${spento ? 'spento' : ''} ${evidenziato ? 'trovato' : ''}`}
       onClick={onClick} role="button" tabIndex={0}
       onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
       aria-label={`Ombrellone ${u.visibleNumber}, ${s.label}${u.customerName ? `, ${u.customerName}` : ''}`}>
      {evidenziato && (
        <rect x={x - 3} y={y - 3} width={lato + 6} height={lato + 6} rx="11"
              fill="none" stroke="var(--accent)" strokeWidth="3" />
      )}
      <rect className="body" x={x} y={y} width={lato} height={lato} rx="9"
            fill={s.border === 'hatch' ? 'url(#hatch)' : s.fill}
            stroke={s.line} strokeWidth={s.border === 'double' ? 3 : 2}
            strokeDasharray={s.border === 'dashed' ? '5 3' : undefined} />
      {s.border === 'double' && (
        <rect x={x + 4} y={y + 4} width={lato - 8} height={lato - 8} rx="6"
              fill="none" stroke={s.line} strokeWidth="1.5" />
      )}
      <text x={x + lato / 2} y={y + lato / 2 + 2} textAnchor="middle" dominantBaseline="middle"
            fontSize="16" fontWeight="700" fill={s.ink}>{u.visibleNumber}</text>
      <text x={x + lato - 6} y={y + 14} textAnchor="end" fontSize="12" fill={s.ink}>{s.symbol}</text>
    </g>
  )
}

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
  const [dal, setDal] = useState(data)
  const [al, setAl] = useState(data)
  const [persone, setPersone] = useState(2)
  const [pagato, setPagato] = useState(false)
  const [attesa, setAttesa] = useState(false)
  const [link, setLink] = useState<{ link: string; whatsapp: string | null } | null>(null)

  // Preventivo immediato: l'operatore deve poter dire il prezzo al telefono
  // mentre compila. Il server ricalcola e resta l'unica verità.
  const giorni = Math.max(1, giorniTra(dal, al))
  const stima = (u.basePriceCents ?? 0) * giorni
  const oltreAssenza = u.absence && (dal < u.absence.from || al > u.absence.to)

  async function prenota() {
    if (!cognome.trim()) { onErrore('Serve almeno il cognome.'); return }
    if (al < dal) { onErrore('La data di fine precede quella di inizio.'); return }
    setAttesa(true); onErrore(null); onSync('pending')
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
                               from: dal, to: al, peopleCount: persone, source: 'RECEPTION' }),
      })
      if (!rr.ok) throw await rr.json()
      const prenotazione = await rr.json()

      if (pagato) {
        await fetch('/api/v1/payments', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
          body: JSON.stringify({ reservationId: prenotazione.id,
                                 amountCents: prenotazione.totalCents, method: 'CASH' }),
        })
      }
      onSync('ok'); await onCambiato()
    } catch (e: any) {
      onSync('error'); onErrore(e?.message ?? 'Operazione non riuscita. Riprova.')
      await onCambiato()
    } finally { setAttesa(false) }
  }

  async function incassa() {
    if (!u.reservationId || !u.amountDueCents) return
    setAttesa(true); onErrore(null); onSync('pending')
    onOttimistico({ amountDueCents: 0 })
    try {
      const r = await fetch('/api/v1/payments', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ reservationId: u.reservationId,
                               amountCents: u.amountDueCents, method: 'CASH' }),
      })
      if (!r.ok) throw await r.json()
      onSync('ok'); await onCambiato()
    } catch (e: any) {
      onSync('error'); onErrore(e?.message ?? 'Operazione non riuscita.'); await onCambiato()
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

  async function mandaLink() {
    if (!u.seasonalContractId) return
    setAttesa(true); onErrore(null)
    try {
      const r = await fetch(`/api/v1/contracts/${u.seasonalContractId}/token`, { method: 'POST' })
      if (!r.ok) throw await r.json()
      setLink(await r.json())
    } catch (e: any) { onErrore(e?.message ?? 'Non è stato possibile generare il link.') }
    finally { setAttesa(false) }
  }

  const daIncassare = (u.amountDueCents ?? 0) > 0

  return (
    <aside className="panel" role="dialog" aria-label={`Ombrellone ${u.visibleNumber}`}>
      <div className="head">
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
              <span>posto liberato da uno stagionale</span></div>
          )}
        </div>
      )}

      {u.absence && (
        <div className="box warn">
          <div className="row"><span className="k">Stagionale</span><b>{u.absence.seasonalName}</b></div>
          <div className="row"><span className="k">Assente</span>
            <span>{dataBreve(u.absence.from)} – {dataBreve(u.absence.to)}</span></div>

          {/* Il costo della vendita, visibile MENTRE si decide. È anche ciò che
              fa capire il meccanismo senza che nessuno lo spieghi. */}
          <div className="row">
            <span className="k">Credito a {u.absence.seasonalName.split(' ')[0]}</span>
            {u.absence.creditoGiornoCents > 0
              ? <b>{euro(u.absence.creditoGiornoCents)} al giorno</b>
              : <span>{u.absence.creditoMotivo === 'ASSENZA_TARDIVA'
                  ? 'nessuno — comunicata fuori tempo'
                  : 'nessuno — ha raggiunto il massimo stagionale'}</span>}
          </div>

          <div style={{ marginTop: 8 }}>
            Torna riservato il <b>{dataBreve(spostaGiorni(u.absence.to, 1))}</b>.
          </div>
        </div>
      )}

      {daIncassare && (
        <button className="primary" onClick={() => void incassa()} disabled={attesa}>
          INCASSA {euro(u.amountDueCents)}
        </button>
      )}

      {!form && u.sellable && (
        <button className="primary" onClick={() => setForm(true)} disabled={attesa}>
          {u.absence ? 'VENDI QUESTO POSTO' : 'PRENOTA'}
        </button>
      )}

      {form && (
        <div className="box form">
          <input placeholder="Cognome" value={cognome} autoFocus
                 onChange={e => setCognome(e.target.value)} />
          <input placeholder="Nome (facoltativo)" value={nome}
                 onChange={e => setNome(e.target.value)} />
          <input placeholder="Telefono (facoltativo)" inputMode="tel" value={tel}
                 onChange={e => setTel(e.target.value)} />

          <div className="due-campi">
            <label>Dal<input type="date" value={dal} onChange={e => setDal(e.target.value)} /></label>
            <label>Al<input type="date" value={al} min={dal} onChange={e => setAl(e.target.value)} /></label>
          </div>
          <label className="persone">Persone
            <input type="number" min={1} max={u.capacity} value={persone}
                   onChange={e => setPersone(Number(e.target.value))} />
          </label>

          {oltreAssenza && (
            <div className="err">
              Lo stagionale è assente solo dal {dataBreve(u.absence!.from)} al {dataBreve(u.absence!.to)}:
              fuori da quelle date il posto resta suo.
            </div>
          )}

          <div className="preventivo">
            <span>{giorni} {giorni === 1 ? 'giorno' : 'giorni'} × {euro(u.basePriceCents)}</span>
            <b>{euro(stima)}</b>
          </div>

          <label className="pagato">
            <input type="checkbox" checked={pagato} onChange={e => setPagato(e.target.checked)} />
            Incassato subito ({euro(stima)})
          </label>

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

      {/* Il cliente non installa nulla: riceve il suo link su WhatsApp e da lì
          comunica le assenze. Rigenerarlo invalida il precedente (C-06). */}
      {u.seasonalContractId && !link && (
        <button onClick={() => void mandaLink()} disabled={attesa}>
          Manda il link personale allo stagionale
        </button>
      )}
      {link && (
        <div className="box">
          <div className="row"><span className="k">Link personale</span></div>
          <code className="link-personale">{link.link}</code>
          {link.whatsapp
            ? <a className="wa" href={link.whatsapp} target="_blank" rel="noreferrer">
                Apri WhatsApp con il messaggio pronto
              </a>
            : <div className="k">Nessun telefono in anagrafica: copia il link e mandaglielo.</div>}
          <div className="k" style={{ marginTop: 8 }}>Il link precedente non funziona più.</div>
        </div>
      )}
    </aside>
  )
}


/**
 * "Trova il posto migliore" — scenario B.
 *
 * Due campi obbligatori soli, periodo e quantità; le preferenze non bloccano
 * la ricerca. Se non esiste la soluzione perfetta si mostrano comunque le
 * parziali, marcate: è ciò che permette all'operatore di negoziare al telefono
 * invece di dire "no".
 */
function TrovaPosti({ data, onChiudi, onMostra, onPrenotato, onSync }: {
  data: string
  onChiudi: () => void
  onMostra: (ids: string[]) => void
  onPrenotato: () => Promise<void>
  onSync: (s: Sync) => void
}) {
  const [dal, setDal] = useState(data)
  const [al, setAl] = useState(data)
  const [quanti, setQuanti] = useState(2)
  const [mare, setMare] = useState(false)
  const [esito, setEsito] = useState<any>(null)
  const [attesa, setAttesa] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [prenotando, setPrenotando] = useState<number | null>(null)
  const [cognome, setCognome] = useState('')
  const [tel, setTel] = useState('')

  async function cerca() {
    setAttesa(true); setErrore(null)
    try {
      const p = new URLSearchParams({ from: dal, to: al, qty: String(quanti) })
      if (mare) p.set('sea', '1')
      const r = await fetch(`/api/v1/availability?${p}`)
      if (!r.ok) throw await r.json()
      setEsito(await r.json())
    } catch (e: any) { setErrore(e?.message ?? 'Ricerca non riuscita.') }
    finally { setAttesa(false) }
  }

  async function prenota(sol: any) {
    if (!cognome.trim()) { setErrore('Serve almeno il cognome.'); return }
    setAttesa(true); setErrore(null); onSync('pending')
    try {
      const rc = await fetch('/api/v1/customers', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ firstName: 'Cliente', lastName: cognome, phone: tel || undefined }),
      })
      if (!rc.ok) throw await rc.json()
      const cliente = await rc.json()
      const rr = await fetch('/api/v1/reservations', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ umbrellaIds: sol.ombrelloni.map((o: any) => o.id),
                               customerId: cliente.id, from: sol.dal, to: sol.al,
                               peopleCount: quanti * 2, source: 'PHONE' }),
      })
      if (!rr.ok) throw await rr.json()
      onSync('ok'); await onPrenotato()
    } catch (e: any) { onSync('error'); setErrore(e?.message ?? 'Prenotazione non riuscita.') }
    finally { setAttesa(false) }
  }

  return (
    <aside className="panel largo" role="dialog" aria-label="Trova il posto migliore">
      <div className="head">
        <div className="grow"><h2>Trova il posto migliore</h2>
          <div className="sub">Periodo e quantità bastano. Il resto è facoltativo.</div></div>
        <button onClick={onChiudi} aria-label="Chiudi">✕</button>
      </div>

      <div className="box form">
        <div className="due-campi">
          <label>Dal<input type="date" value={dal} onChange={e => { setDal(e.target.value); if (al < e.target.value) setAl(e.target.value) }} /></label>
          <label>Al<input type="date" value={al} min={dal} onChange={e => setAl(e.target.value)} /></label>
        </div>
        <label className="persone">Quanti ombrelloni
          <input type="number" min={1} max={8} value={quanti}
                 onChange={e => setQuanti(Number(e.target.value))} />
        </label>
        <label className="pagato">
          <input type="checkbox" checked={mare} onChange={e => setMare(e.target.checked)} />
          Il più vicino possibile al mare
        </label>
        <button className="primary" onClick={() => void cerca()} disabled={attesa}>
          {attesa ? 'Cerco…' : 'CERCA'}
        </button>
      </div>

      {errore && <div className="err">{errore}</div>}

      {esito && (
        <>
          <div className="esito-testata">
            {esito.soluzioni.length === 0
              ? 'Nessuna combinazione disponibile in quel periodo.'
              : esito.completeTrovate > 0
                ? `${esito.soluzioni.length} proposte`
                : 'Nessuna copertura completa. Ecco il meglio disponibile:'}
          </div>

          {esito.soluzioni.length > 0 && (
            <div className="box form">
              <input placeholder="Cognome del cliente" value={cognome}
                     onChange={e => setCognome(e.target.value)} />
              <input placeholder="Telefono (facoltativo)" inputMode="tel" value={tel}
                     onChange={e => setTel(e.target.value)} />
            </div>
          )}

          <div className="proposte">
            {esito.soluzioni.map((s: any, i: number) => (
              <div key={i} className={`proposta ${i === 0 ? 'prima' : ''}`}>
                <div className="numeri">
                  {i === 0 && <span className="stella" aria-label="migliore">★</span>}
                  {s.ombrelloni.map((o: any) => o.visibleNumber).join(' + ')}
                </div>
                <div className="dettagli">
                  Fila {[...new Set(s.ombrelloni.map((o: any) => o.rowLabel))].join(', ')}
                  {' · '}{s.giorniCoperti} {s.giorniCoperti === 1 ? 'giorno' : 'giorni'}
                  {' · '}<b>{euro(s.prezzoTotaleCents)}</b>
                </div>
                {!s.completa && (
                  <div className="parziale">
                    Disponibile solo dal {dataBreve(s.dal)} al {dataBreve(s.al)}, non tutto il periodo
                  </div>
                )}
                {s.contieneTemporanei && (
                  <div className="temporaneo">☆ Include un posto liberato da uno stagionale</div>
                )}
                <div className="azioni-proposta">
                  <button onClick={() => onMostra(s.ombrelloni.map((o: any) => o.id))}>
                    Vedi sulla mappa
                  </button>
                  {prenotando === i
                    ? <button className="primary" onClick={() => void prenota(s)} disabled={attesa}>
                        {attesa ? 'Registro…' : 'CONFERMA'}
                      </button>
                    : <button onClick={() => setPrenotando(i)}>Prenota</button>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </aside>
  )
}
