'use client'

/**
 * F6-26 · «6 file da 16» e la mappa esiste.
 *
 * Il gestore non posizionerà 96 ombrelloni a mano: se configurare richiede
 * un'ora, il prodotto non viene adottato (C-08). Pochi campi, anteprima
 * sempre visibile, e la conferma scrive esattamente ciò che si vede.
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { generaGriglia, type Numerazione } from '@/domain/map/grid'

const CELLA = 22

export default function Generatore({ ombrelloniEsistenti, bloccato, prenotazioni }:
  { ombrelloniEsistenti: number; bloccato: boolean; prenotazioni: number }) {

  const router = useRouter()
  const [file, setFile] = useState(6)
  const [perFila, setPerFila] = useState(16)
  const [numerazione, setNumerazione] = useState<Numerazione>('PROGRESSIVA')
  const [passerella, setPasserella] = useState(3)
  const [corridoio, setCorridoio] = useState(8)
  const [attesa, setAttesa] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  // L'anteprima usa la STESSA funzione che genererà la mappa: ciò che il
  // gestore vede è ciò che verrà scritto.
  const griglia = useMemo(() => generaGriglia({
    file, perFila, numerazione,
    passerellaDopoFila: passerella, corridoioOgni: corridoio,
  }), [file, perFila, numerazione, passerella, corridoio])

  async function genera() {
    setAttesa(true); setErrore(null)
    try {
      const r = await fetch('/api/v1/map/generate', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          file, perFila, numerazione,
          passerellaDopoFila: passerella, corridoioOgni: corridoio,
          creaZone: true,
          prezziPerZonaCents: [3500, 2500, 1800],
        }),
      })
      if (!r.ok) throw await r.json()
      router.push('/map')
    } catch (e: any) {
      setErrore(e?.message ?? 'Non è stato possibile creare la mappa.')
    } finally { setAttesa(false) }
  }

  return (
    <main className="configura">
      <div className="riquadro">
        <h1>Iniziamo velocemente</h1>
        <p className="nota">
          Descrivi lo stabilimento a grandi linee: gli ombrelloni si creano tutti
          insieme. Dopo potrai rinumerarli, spostarli e bloccarli uno a uno.
        </p>

        {bloccato && (
          <div className="err">
            Questo stabilimento ha già {prenotazioni} prenotazioni: la mappa non può
            essere rigenerata, perché cancellarla cancellerebbe lo storico. Puoi
            aggiungere o bloccare i singoli ombrelloni.
          </div>
        )}
        {!bloccato && ombrelloniEsistenti > 0 && (
          <div className="avviso-box">
            Ci sono già {ombrelloniEsistenti} ombrelloni senza prenotazioni:
            generando la mappa verranno sostituiti.
          </div>
        )}

        <div className="campi">
          <label>Quante file?
            <input type="number" min={1} max={60} value={file}
                   onChange={e => setFile(Number(e.target.value) || 1)} />
          </label>
          <label>Ombrelloni per fila
            <input type="number" min={1} max={120} value={perFila}
                   onChange={e => setPerFila(Number(e.target.value) || 1)} />
          </label>
        </div>

        <fieldset className="scelte">
          <legend>Numerazione</legend>
          <label>
            <input type="radio" checked={numerazione === 'PROGRESSIVA'}
                   onChange={() => setNumerazione('PROGRESSIVA')} />
            1, 2, 3 … progressiva su tutto lo stabilimento
          </label>
          <label>
            <input type="radio" checked={numerazione === 'LETTERA_FILA'}
                   onChange={() => setNumerazione('LETTERA_FILA')} />
            A1, A2 … B1, B2 … per fila
          </label>
        </fieldset>

        <div className="campi">
          <label>Passerella dopo la fila
            <input type="number" min={0} max={file} value={passerella}
                   onChange={e => setPasserella(Number(e.target.value) || 0)} />
            <span className="minuto">0 = nessuna</span>
          </label>
          <label>Corridoio ogni
            <input type="number" min={0} max={perFila} value={corridoio}
                   onChange={e => setCorridoio(Number(e.target.value) || 0)} />
            <span className="minuto">0 = nessuno</span>
          </label>
        </div>
      </div>

      <div className="riquadro">
        <div className="etichetta">Anteprima</div>
        {griglia.errori.length > 0
          ? <div className="err">{griglia.errori[0]}</div>
          : (
            <>
              <div className="riepilogo">
                <b>{griglia.ombrelloni.length}</b> ombrelloni · file{' '}
                {griglia.ombrelloni[0]?.rowLabel}–
                {griglia.ombrelloni[griglia.ombrelloni.length - 1]?.rowLabel}
                {' · '}zone: prima fila, centrale, retro
              </div>
              <div className="anteprima">
                <div className="sea">～ mare ～</div>
                <svg viewBox={`0 0 ${griglia.larghezza * CELLA + 8} ${griglia.altezza * CELLA + 8}`}
                     role="img" aria-label="Anteprima della mappa">
                  {griglia.features.map((f, i) => (
                    <rect key={i} x={4 + f.posX * CELLA} y={4 + f.posY * CELLA}
                          width={f.width * CELLA - 2} height={f.height * CELLA - 2} rx="3"
                          fill="#eef2f7" stroke="#cbd5e1" strokeDasharray="3 2" />
                  ))}
                  {griglia.ombrelloni.map(o => (
                    <g key={o.visibleNumber}>
                      <rect x={4 + o.posX * CELLA} y={4 + o.posY * CELLA}
                            width={CELLA - 3} height={CELLA - 3} rx="4"
                            fill={o.indiceFila === 0 ? '#e0f2fe' : '#ffffff'}
                            stroke="#16a34a" strokeWidth="1.5" />
                      <text x={4 + o.posX * CELLA + (CELLA - 3) / 2}
                            y={4 + o.posY * CELLA + (CELLA - 3) / 2 + 1}
                            textAnchor="middle" dominantBaseline="middle"
                            fontSize="8" fill="#111827">{o.visibleNumber}</text>
                    </g>
                  ))}
                </svg>
              </div>
            </>
          )}
      </div>

      {errore && <div className="err">{errore}</div>}

      <button className="azione-primaria come-bottone"
              onClick={() => void genera()}
              disabled={attesa || bloccato || griglia.errori.length > 0}>
        {attesa ? 'Creo la mappa…' : `CREA ${griglia.ombrelloni.length} OMBRELLONI`}
      </button>
    </main>
  )
}
