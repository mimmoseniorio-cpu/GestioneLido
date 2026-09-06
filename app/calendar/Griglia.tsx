'use client'

/**
 * Una sola griglia ombrelloni × giorni, invece delle tre viste
 * giorno/settimana/mese del brief: copre gli stessi casi d'uso ed è il modo in
 * cui il gestore guarda davvero il registro (`docs/01` §4).
 */
import { useRouter } from 'next/navigation'
import { STATES } from '@/app/map/states'
import type { Calendario } from '@/server/queries/calendar'

const GIORNO = 86_400_000
const sposta = (iso: string, n: number) =>
  new Date(new Date(iso + 'T00:00:00Z').getTime() + n * GIORNO).toISOString().slice(0, 10)

const numeroGiorno = (iso: string) => new Date(iso + 'T00:00:00Z').getUTCDate()
const nomeGiorno = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('it-IT', { weekday: 'narrow', timeZone: 'UTC' })
const mese = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export default function Griglia({ dati }: { dati: Calendario }) {
  const router = useRouter()
  const oggi = new Date().toISOString().slice(0, 10)
  const vaiA = (d: string) => router.push(`/calendar?dal=${d}`)

  return (
    <main className="calendario">
      <div className="barra-cal">
        <button onClick={() => vaiA(sposta(dati.dal, -14))}>◀ Prima</button>
        <span className="periodo">{mese(dati.dal)}</span>
        <button onClick={() => vaiA(sposta(dati.dal, 14))}>Dopo ▶</button>
        <button onClick={() => vaiA(oggi)} disabled={dati.dal === oggi}>Oggi</button>
      </div>

      <div className="griglia-scorrevole">
        <table className="griglia">
          <thead>
            <tr>
              <th className="ang">Omb.</th>
              {dati.giorni.map(g => (
                <th key={g.data} title={g.fuoriStagione ? 'Fuori stagione' : undefined}
                    className={`${g.feriale ? '' : 'festivo'} ${g.data === oggi ? 'oggi' : ''} ${g.fuoriStagione ? 'chiuso' : ''}`}>
                  <div className="gnome">{nomeGiorno(g.data)}</div>
                  <div className="gnum">{numeroGiorno(g.data)}</div>
                </th>
              ))}
            </tr>
            {/* Riepilogo in cima: quanti se ne possono vendere, giorno per giorno. */}
            <tr className="riepilogo">
              <th className="ang">liberi</th>
              {dati.riepilogo.map(r => (
                <th key={r.data} className={`${r.data === oggi ? 'oggi' : ''} ${r.fuoriStagione ? 'chiuso' : ''}`}>
                  {r.fuoriStagione ? '—' : r.vendibili}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dati.righe.map(r => (
              <tr key={r.umbrellaId}>
                <th className="numero-omb">{r.numero}</th>
                {r.celle.map((c, i) => {
                  const s = STATES[c.stato]
                  return (
                    <td key={i}
                        className={`${dati.giorni[i]!.data === oggi ? 'oggi' : ''} ${dati.giorni[i]!.fuoriStagione ? 'chiuso' : ''}`}
                        style={{ background: s.fill, borderColor: s.line, color: s.ink }}
                        title={`${r.numero} · ${dati.giorni[i]!.data} · ${s.label}${c.chi ? ` · ${c.chi}` : ''}`}>
                      <span aria-hidden>{s.symbol}</span>
                      <span className="sr">{s.label}</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dati.giorni.some(g => g.fuoriStagione) && (
        <p className="nota fuori-stagione">
          Le colonne in grigio sono fuori dalla stagione: lo stabilimento è chiuso,
          quindi non c&apos;è nulla da vendere.
        </p>
      )}

      <div className="legend">
        {(['LIBERO','OCCUPATO','PRENOTATO','STAGIONALE_PRESENTE','STAGIONALE_ASSENTE','BLOCCATO'] as const)
          .map(s => (
            <span key={s}>
              <i className="key" style={{ background: STATES[s].fill, borderColor: STATES[s].line }} />
              {STATES[s].symbol} {STATES[s].short}
            </span>
          ))}
      </div>
    </main>
  )
}
