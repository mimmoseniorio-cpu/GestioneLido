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
import Link from 'next/link'
import type { MapDay, MapUmbrella } from '@/server/queries/map'
import type { ClienteTrovato } from '@/server/queries/customers'
import type { Novita } from '@/server/queries/novita'
import { coda, type OperazioneInCoda } from '@/app/lib/coda'
import { messaggioConferma, linkWhatsApp } from '@/domain/messaging/whatsapp'
import { STATES, euro, dataLunga, dataBreve, dataChiara, spostaGiorni, oggiIso } from './states'

const CELLA = 56          // bersagli generosi: sole, mani bagnate, una mano sola
const PADDING = 10

type Sync = 'ok' | 'pending' | 'error'

const giorniTra = (a: string, b: string) =>
  Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86_400_000) + 1

const soloCifre = (s: string) => s.replace(/\D/g, '')

export default function MapClient({ iniziale, clubName, novita }:
  { iniziale: MapDay; clubName: string; novita: Novita }) {

  const [mappa, setMappa] = useState<MapDay>(iniziale)
  const [data, setData] = useState(iniziale.date)
  const [scelto, setScelto] = useState<string | null>(null)
  const [sync, setSync] = useState<Sync>('ok')
  const [errore, setErrore] = useState<string | null>(null)
  const [cerca, setCerca] = useState('')
  const [inCoda, setInCoda] = useState<OperazioneInCoda[]>([])
  // F6-34 · su schermo piccolo la mappa da 96 ombrelloni è illeggibile: la
  // risposta è un elenco ordinato per ciò su cui si può agire, non una mappa
  // rimpicciolita (docs/06 §2.1).
  const [modo, setModo] = useState<'mappa' | 'elenco'>('mappa')
  // Arrivando dalla scheda cliente il pannello di ricerca si apre da solo.
  const [trovaAperto, setTrovaAperto] = useState(false)
  const [clienti, setClienti] = useState<ClienteTrovato[]>([])
  const [evidenziati, setEvidenziati] = useState<Set<string> | null>(null)
  /** `docs/07` §F, sesta domanda: «chi deve ancora pagarmi?», in un tocco. */
  const [soloDaIncassare, setSoloDaIncassare] = useState(false)
  /** F6-29 · si chiude per la sessione: riaprendo domani torna, se c'è di nuovo. */
  const [novitaChiuse, setNovitaChiuse] = useState(false)
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

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('trova') === '1') setTrovaAperto(true)
    if (window.matchMedia('(max-width: 700px)').matches) setModo('elenco')
  }, [])

  // NF-02 · lo stato della coda è sempre visibile: l'operatore non deve mai
  // restare nel dubbio se un'operazione sia stata salvata.
  useEffect(() => coda.sottoscrivi(() => {
    setInCoda(coda.operazioni)
    setSync(coda.stato === 'ok' ? 'ok' : coda.stato === 'in-corso' ? 'pending' : 'error')
  }), [])

  const vaiA = (giorno: string) => { setData(giorno); setScelto(null); void carica(giorno) }

  // Scenario E · la ricerca sulla mappa trova chi c'è OGGI; per il cliente che
  // telefona serve tutta l'anagrafica, quindi si interroga anche il server.
  useEffect(() => {
    const q = cerca.trim()
    if (q.length < 2) { setClienti([]); return }
    let annullato = false
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/v1/customers?q=${encodeURIComponent(q)}`)
        if (!r.ok) return
        const dati = await r.json()
        if (!annullato) setClienti(dati)
      } catch { /* la ricerca sulla mappa funziona comunque */ }
    }, 180)
    return () => { annullato = true; clearTimeout(t) }
  }, [cerca])

  const rinfresca = useCallback(async (giorno = data) => {
    cache.current.delete(giorno)
    const dati = await carica(giorno)
    if (dati) setMappa(dati)
  }, [carica, data])

  /** Chi deve ancora pagare, sul giorno caricato. Serve anche al contatore. */
  const daIncassare = useMemo(
    () => mappa.umbrellas.filter(u => (u.amountDueCents ?? 0) > 0), [mappa])

  // ── ricerca istantanea, sul giorno già caricato: nessuna latenza ─────────
  const trovati = useMemo(() => {
    const q = cerca.trim().toLowerCase()
    // Il filtro passa dalla stessa selezione della ricerca: mappa ed elenco
    // la rispettano già entrambi, e due meccanismi paralleli divergerebbero.
    if (soloDaIncassare && q.length < 1) return new Set(daIncassare.map(u => u.id))
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
  }, [cerca, mappa, evidenziati, soloDaIncassare, daIncassare])

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
        {/* F6-32 · va accanto a «Esci» perché è il gesto che lo sostituisce:
            chi si allontana dal bancone non deve chiudere la sessione e
            perdere la coda delle scritture, gli basta bloccare. */}
        <button className="blocca" onClick={async () => {
          await fetch('/api/v1/auth/lock', { method: 'POST' })
          window.location.href = '/blocco'
        }}>Blocca</button>
        <button className="esci" onClick={async () => {
          await fetch('/api/v1/auth/logout', { method: 'POST' })
          window.location.href = '/login'
        }}>Esci</button>
        <span className="sync" aria-live="polite">
          <span className={`dot ${sync === 'ok' ? '' : sync}`} />
          {sync === 'ok' ? 'sincronizzato' : sync === 'pending' ? 'salvo…' : 'non salvato'}
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

      {/* Criterio 10 · ciò che non è passato resta visibile e riprovabile. */}
      {inCoda.length > 0 && (
        <div className="coda">
          {inCoda.map(o => (
            <div key={o.id} className="voce-coda">
              <span>
                <b>{o.descrizione}</b>
                {o.ultimoErrore ? ` — ${o.ultimoErrore}` : ' — salvataggio in corso…'}
                {o.tentativi > 1 && ` (tentativo ${o.tentativi})`}
              </span>
              {o.tentativi >= 4 && (
                <span className="azioni-coda">
                  <button onClick={() => coda.riprova(o.id).then(() => void rinfresca()).catch(() => {})}>
                    Riprova
                  </button>
                  <button onClick={() => coda.scarta(o.id)}>Scarta</button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* F6-29 · Un'assenza comunicata dal telefono di un cliente alle undici
          di sera è capacità vendibile domani. Se nessuno la nota, il posto
          resta vuoto e lo stagionale non matura credito: il meccanismo che
          vale il prodotto gira a vuoto. */}
      {!novitaChiuse && novita.assenze.length > 0 && (
        <div className="novita">
          <div className="grow">
            <b>{novita.assenze.length === 1
              ? 'Un cliente ha comunicato un’assenza'
              : `${novita.assenze.length} clienti hanno comunicato un’assenza`}</b>
            <ul>
              {novita.assenze.slice(0, 3).map(a => (
                <li key={a.id}>
                  Ombrellone <b>{a.ombrellone}</b> · {a.cliente} ·{' '}
                  {a.dal === a.al
                    ? dataBreve(a.dal)
                    : <>{dataBreve(a.dal)} – {dataBreve(a.al)}</>}
                  {a.tardiva && ' · fuori tempo, nessun credito'}
                </li>
              ))}
              {novita.assenze.length > 3 && (
                <li>e altre {novita.assenze.length - 3}</li>
              )}
            </ul>
          </div>
          <Link href="/seasonal" className="bottone-link">Vedi</Link>
          <button onClick={() => setNovitaChiuse(true)} aria-label="Chiudi">✕</button>
        </div>
      )}

      {/* A pannello chiuso l'errore non ha più dove comparire: senza questa
          fascia, una prenotazione rifiutata sparirebbe in silenzio. */}
      {errore && !scelto && (
        <div className="err fascia" role="alert">
          <span className="grow">{errore}</span>
          <button onClick={() => setErrore(null)} aria-label="Chiudi">✕</button>
        </div>
      )}

      {trovati && (
        <div className="risultati">
          {cerca
            ? (trovati.size === 0
                ? <>Nessun risultato per <b>«{cerca}»</b> in questo giorno</>
                : <>{trovati.size} {trovati.size === 1 ? 'risultato' : 'risultati'} per <b>«{cerca}»</b></>)
            : soloDaIncassare
              ? <>Da incassare: <b>{trovati.size} {trovati.size === 1 ? 'ombrellone' : 'ombrelloni'}</b>
                  {' · '}<b>{euro(daIncassare.reduce((t, u) => t + (u.amountDueCents ?? 0), 0))}</b></>
              : <>Proposta evidenziata sulla mappa: <b>{trovati.size} ombrelloni</b></>}
          <button onClick={() => { setCerca(''); setEvidenziati(null); setSoloDaIncassare(false) }}>
            Mostra tutti
          </button>
        </div>
      )}

      {cerca.trim().length >= 2 && clienti.length > 0 && (
        <div className="clienti-trovati">
          {clienti.map(c => (
            <Link key={c.id} href={`/customers/${c.id}`}>
              <span className="chi">
                {c.nome}{c.stagionale && ' ★'}
                {c.telefono && <span className="dove"> · {c.telefono}</span>}
              </span>
              <span className="dove">
                {c.ultimoOmbrellone ? `ultimo: ombrellone ${c.ultimoOmbrellone}` : 'apri scheda'}
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Scenario F: la risposta è già qui, senza toccare nulla. */}
      <section className="oggi" aria-label="Situazione del giorno">
        <div className="oggi-testata">{oggi ? 'Oggi' : dataBreve(data)}</div>
        {mappa.fuoriStagione && (
          <div className="chiuso-avviso">
            Fuori stagione: lo stabilimento è chiuso in questa data, non c&apos;è nulla da vendere.
          </div>
        )}
        <div className="tiles">
          <div className={`tile ${mappa.fuoriStagione ? '' : 'forte'}`}>
            <b>{mappa.fuoriStagione ? '—' : c.sellable}</b><span>disponibili<br />da vendere</span>
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

      <div className="commuta">
        <button className={modo === 'mappa' ? 'attivo' : ''} onClick={() => setModo('mappa')}>Mappa</button>
        <button className={modo === 'elenco' ? 'attivo' : ''} onClick={() => setModo('elenco')}>Elenco</button>
      </div>

      {modo === 'elenco' && (
        <Elenco umbrellas={trovati ? mappa.umbrellas.filter(u => trovati.has(u.id)) : mappa.umbrellas}
                onScegli={setScelto} />
      )}

      <div className="mapwrap" hidden={modo !== 'mappa'}>
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
        {/* Un tocco. Il numero è già sul pulsante: chi chiede «chi deve
            ancora pagarmi?» ha metà risposta senza premere nulla. */}
        {daIncassare.length > 0 && (
          <button className={soloDaIncassare ? 'attivo' : ''}
                  aria-pressed={soloDaIncassare}
                  onClick={() => { setSoloDaIncassare(v => !v); setCerca('') }}>
            Da incassare ({daIncassare.length})
          </button>
        )}
        <Link href="/dashboard" className="bottone-link">Oggi in numeri</Link>
        <Link href="/seasonal" className="bottone-link">Stagionali</Link>
        <Link href="/calendar" className="bottone-link">Calendario</Link>
        <Link href="/settings/pricing" className="bottone-link">Listino</Link>
        <Link href="/settings/blocco" className="bottone-link">Blocco schermo</Link>
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
            u={selezionato} data={data} clubName={clubName} errore={errore}
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

/**
 * F6-34 · L'elenco per lo smartphone.
 *
 * L'ordine non è per numero ma per URGENZA: prima ciò che si può vendere, poi
 * ciò da incassare, poi il resto. Su uno schermo piccolo si vedono sei righe
 * per volta: devono essere le sei che contano.
 */
function Elenco({ umbrellas, onScegli }:
  { umbrellas: MapUmbrella[]; onScegli: (id: string) => void }) {

  const peso = (u: MapUmbrella) => {
    if (u.state === 'STAGIONALE_ASSENTE') return 0        // vendibile e frutta credito
    if (u.state === 'LIBERO') return 1
    if ((u.amountDueCents ?? 0) > 0) return 2             // da incassare
    if (u.state === 'BLOCCATO') return 5
    return 3
  }
  const ordinati = [...umbrellas].sort((a, b) =>
    peso(a) - peso(b) ||
    a.visibleNumber.localeCompare(b.visibleNumber, 'it', { numeric: true }))

  return (
    <div className="elenco-ombrelloni">
      {ordinati.map(u => {
        const s = STATES[u.state]
        const daPagare = (u.amountDueCents ?? 0) > 0
        return (
          <button key={u.id} className="riga-ombrellone" onClick={() => onScegli(u.id)}>
            <span className="segno" style={{ background: s.fill, borderColor: s.line }}>
              {s.symbol}
            </span>
            <span className="corpo">
              <span className="numero">{u.visibleNumber}</span>
              <span className="stato" style={{ color: s.line }}>{s.short}</span>
              {/* Su un posto liberato il nome è già nella riga dell'assenza:
                  ripeterlo ruba la riga a un'informazione utile. */}
              {u.absence
                ? <span className="chi">
                    {u.absence.seasonalName}, assente fino al {dataBreve(u.absence.to)}
                  </span>
                : u.customerName && <span className="chi">{u.customerName}</span>}
            </span>
            {daPagare && <span className="dovuto">{euro(u.amountDueCents)}</span>}
          </button>
        )
      })}
    </div>
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

function Pannello({ u, data, clubName, errore, onChiudi, onErrore, onSync, onCambiato,
                   onOttimistico }: {
  u: MapUmbrella
  data: string
  /** serve al messaggio di conferma: il cliente deve leggere il nome vero */
  clubName: string
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
  // Il metodo serve alla cassa della sera: contanti e carta non stanno nello
  // stesso cassetto, e un rimborso in contanti non storna un pagamento POS.
  //
  // Parte da come il cliente ha già pagato, quando risulta: riaprendo il
  // pannello ripartiva da «Contanti», e un rimborso su una carta finiva
  // registrato come contante senza che nessuno se ne accorgesse.
  const [metodo, setMetodo] = useState<'CASH' | 'CARD' | 'TRANSFER'>(
    u.ultimoMetodo === 'CARD' || u.ultimoMetodo === 'TRANSFER' ? u.ultimoMetodo : 'CASH')
  const [rimborso, setRimborso] = useState(false)
  const [importoRimborso, setImportoRimborso] = useState('')
  const [motivoRimborso, setMotivoRimborso] = useState('')
  const [attesa, setAttesa] = useState(false)
  const [link, setLink] = useState<{ link: string; whatsapp: string | null } | null>(null)

  // Preventivo dal SERVER, con lo stesso motore che userà la conferma: se il
  // client stimasse a occhio, il numero detto al telefono non coinciderebbe
  // con quello incassato.
  const giorni = Math.max(1, giorniTra(dal, al))
  const [preventivo, setPreventivo] = useState<{ totaleCents: number; righe: any[] } | null>(null)

  useEffect(() => {
    if (!form) return
    let annullato = false
    void (async () => {
      try {
        const r = await fetch(`/api/v1/quote?umbrellaId=${u.id}&from=${dal}&to=${al}`)
        if (!r.ok) return
        const p = await r.json()
        if (!annullato) setPreventivo(p)
      } catch { /* il preventivo è un aiuto, non blocca la prenotazione */ }
    })()
    return () => { annullato = true }
  }, [form, u.id, dal, al])

  const stima = preventivo?.totaleCents ?? (u.basePriceCents ?? 0) * giorni
  const oltreAssenza = u.absence && (dal < u.absence.from || al > u.absence.to)

  async function prenota() {
    if (!cognome.trim()) { onErrore('Serve almeno il cognome.'); return }
    if (al < dal) { onErrore('La data di fine precede quella di inizio.'); return }
    setAttesa(true); onErrore(null); onSync('pending')
    onOttimistico({ state: 'OCCUPATO', customerName: `${nome} ${cognome}`.trim() })
    // Il pannello si chiude QUI, non alla fine (F5-10: azione riflessa subito).
    // Le tre chiamate proseguono da sole: chi ha un cliente davanti ha già
    // finito, e non deve guardare un pulsante grigio mentre la rete lavora.
    // Se qualcosa fallisce lo dice la fascia rossa sopra la mappa, e la
    // scrittura resta in coda con Riprova/Scarta.
    onChiudi()
    try {
      // Una chiamata sola, non tre: cliente, prenotazione e incasso stanno
      // nella stessa transazione. Non è solo velocità — con tre andate e
      // ritorni, un guasto in mezzo lasciava un cliente senza prenotazione
      // o una prenotazione senza l'incasso che l'operatore aveva già preso.
      await coda.esegui({
        url: '/api/v1/reservations', metodo: 'POST',
        corpo: {
          umbrellaIds: [u.id],
          cliente: { firstName: nome || undefined, lastName: cognome, phone: tel || undefined },
          from: dal, to: al, peopleCount: persone, source: 'RECEPTION',
          ...(pagato ? { incassa: { method: metodo } } : {}),
        },
        descrizione: `Ombrellone ${u.visibleNumber} a ${cognome}`,
      })
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
      await coda.esegui({
        url: '/api/v1/payments', metodo: 'POST',
        corpo: { reservationId: u.reservationId, amountCents: u.amountDueCents, method: metodo },
        descrizione: `Incasso ombrellone ${u.visibleNumber}`,
      })
      onSync('ok'); await onCambiato()
    } catch (e: any) {
      onSync('error'); onErrore(e?.message ?? 'Operazione non riuscita.'); await onCambiato()
    } finally { setAttesa(false) }
  }

  /**
   * F6-19 · Rimborsare.
   *
   * Non passa dall'aggiornamento ottimistico come le altre azioni: qui escono
   * soldi veri dalla cassa, e mostrare l'esito prima che il server l'abbia
   * accettato significherebbe far contare all'operatore un rimborso che
   * potrebbe essere stato rifiutato per la soglia del suo ruolo.
   */
  async function rimborsa() {
    if (!u.reservationId) return
    const centesimi = Math.round(parseFloat(importoRimborso.replace(',', '.')) * 100)
    if (!Number.isFinite(centesimi) || centesimi <= 0) {
      onErrore('Importo del rimborso non valido.'); return
    }
    if (!motivoRimborso.trim()) {
      onErrore('Serve il motivo: è ciò che spiega la cassa a fine giornata.'); return
    }
    setAttesa(true); onErrore(null); onSync('pending')
    try {
      await coda.esegui({
        url: '/api/v1/payments/refund', metodo: 'POST',
        corpo: { reservationId: u.reservationId, amountCents: centesimi,
                 method: metodo, motivo: motivoRimborso.trim() },
        descrizione: `Rimborso ombrellone ${u.visibleNumber}`,
      })
      setRimborso(false); setImportoRimborso(''); setMotivoRimborso('')
      onSync('ok'); await onCambiato()
    } catch (e: any) {
      onSync('error'); onErrore(e?.message ?? 'Rimborso non riuscito.')
    } finally { setAttesa(false) }
  }

  async function libera() {
    if (!u.reservationId) return
    setAttesa(true); onErrore(null); onSync('pending')
    onOttimistico({ state: 'LIBERO', customerName: null, period: null, amountDueCents: null })
    try {
      await coda.esegui({
        url: `/api/v1/reservations/${u.reservationId}/cancel`, metodo: 'POST',
        descrizione: `Libera ombrellone ${u.visibleNumber}`,
      })
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
              <a href={linkWhatsApp(u.customerPhone, '') ?? '#'}
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

      {/* Il metodo vale sia per l'incasso sia per il rimborso: chi restituisce
          contanti e chi storna una carta fanno due gesti diversi in cassa. */}
      {(daIncassare || (u.pagatoCents ?? 0) > 0) && (
        <div className="metodi" role="group" aria-label="Metodo di pagamento">
          {([['CASH', 'Contanti'], ['CARD', 'Carta'], ['TRANSFER', 'Bonifico']] as const)
            .map(([v, etichetta]) => (
              <button key={v} className={metodo === v ? 'attivo' : ''}
                      onClick={() => setMetodo(v)} disabled={attesa}>{etichetta}</button>
            ))}
        </div>
      )}

      {daIncassare && (
        <button className="primary" onClick={() => void incassa()} disabled={attesa}>
          INCASSA {euro(u.amountDueCents)}
        </button>
      )}

      {/* F6-19 · si rimborsa solo ciò che è entrato (C-46), quindi il pulsante
          esiste solo se qualcosa è stato incassato. */}
      {/* F6-28 · La conferma parte da qui, già scritta, e il gestore la può
          correggere prima di premere invio. Il prodotto non manda niente da
          solo: un messaggio partito a nome suo senza che l'abbia letto
          sarebbe un'altra cosa, e non l'abbiamo scelta. */}
      {u.customerPhone && u.period && u.customerName && (() => {
        const testo = messaggioConferma({
          // Il nome di battesimo, non il cognome: «Buongiorno Antonio» è come
          // si parla in uno stabilimento, «Buongiorno Ferrari» è una banca.
          nome: u.customerName.split(' ')[0] ?? u.customerName,
          club: clubName,
          ombrelloni: [u.visibleNumber],
          dal: u.period.from, al: u.period.to,
          totaleCents: (u.pagatoCents ?? 0) + (u.amountDueCents ?? 0),
          pagato: (u.amountDueCents ?? 0) === 0,
        })
        const link = linkWhatsApp(u.customerPhone, testo)
        return link ? (
          <a className="bottone-link" href={link} target="_blank" rel="noreferrer">
            Manda la conferma su WhatsApp
          </a>
        ) : null
      })()}

      {(u.pagatoCents ?? 0) > 0 && !rimborso && (
        <button onClick={() => { setRimborso(true); setImportoRimborso(
                  ((u.pagatoCents ?? 0) / 100).toFixed(2).replace('.', ',')) }}
                disabled={attesa}>
          Rimborsa…
        </button>
      )}

      {rimborso && (
        <div className="box form">
          <div className="row"><span className="k">Incassato</span>
            <b>{euro(u.pagatoCents)}</b></div>
          <label>Quanto rimborsare
            <input value={importoRimborso} inputMode="decimal"
                   onChange={e => setImportoRimborso(e.target.value)} />
          </label>
          <label>Perché
            <input value={motivoRimborso} placeholder="Es. disdetta, giornata di pioggia"
                   onChange={e => setMotivoRimborso(e.target.value)} />
          </label>
          <button className="danger" onClick={() => void rimborsa()} disabled={attesa}>
            {attesa ? 'Registro…' : 'REGISTRA RIMBORSO'}
          </button>
          <button onClick={() => setRimborso(false)} disabled={attesa}>Annulla</button>
        </div>
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
            <label>Dal
              <input type="date" value={dal} onChange={e => setDal(e.target.value)} />
              <span className="data-chiara">{dataChiara(dal)}</span>
            </label>
            <label>Al
              <input type="date" value={al} min={dal} onChange={e => setAl(e.target.value)} />
              <span className="data-chiara">{dataChiara(al)}</span>
            </label>
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
            <div className="voci">
              {preventivo
                ? preventivo.righe.map((r: any, i: number) => (
                    <div key={i} className="voce">
                      <span>{r.giorni} {r.giorni === 1 ? 'giorno' : 'giorni'} · {r.regola}</span>
                      <span>{euro(r.importoCents)}</span>
                    </div>
                  ))
                : <div className="voce"><span>{giorni} {giorni === 1 ? 'giorno' : 'giorni'}</span></div>}
            </div>
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
      await coda.esegui({
        url: '/api/v1/reservations', metodo: 'POST',
        corpo: { umbrellaIds: sol.ombrelloni.map((o: any) => o.id),
                 cliente: { lastName: cognome, phone: tel || undefined },
                 from: sol.dal, to: sol.al,
                 peopleCount: quanti * 2, source: 'PHONE' },
        descrizione: `${sol.ombrelloni.map((o: any) => o.visibleNumber).join(' + ')} a ${cognome}`,
      })
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
          <label>Dal
            <input type="date" value={dal}
                   onChange={e => { setDal(e.target.value); if (al < e.target.value) setAl(e.target.value) }} />
            <span className="data-chiara">{dataChiara(dal)}</span>
          </label>
          <label>Al
            <input type="date" value={al} min={dal} onChange={e => setAl(e.target.value)} />
            <span className="data-chiara">{dataChiara(al)}</span>
          </label>
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
