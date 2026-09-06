'use client'

/**
 * F6-27 · Spostare e rinumerare gli ombrelloni.
 *
 * Niente trascinamento: si tocca l'ombrellone, poi si tocca dove metterlo.
 * Il trascinamento su un tablet al sole, con le dita bagnate, sbaglia
 * bersaglio di continuo e non si può annullare a metà; due tocchi separati
 * si vedono, si correggono e funzionano anche con una mano sola.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Disposizione as Dati } from '@/server/queries/layout'

const CELLA = 40

export default function Disposizione({ dati }: { dati: Dati }) {
  const router = useRouter()
  const [scelto, setScelto] = useState<string | null>(null)
  const [numero, setNumero] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [attesa, setAttesa] = useState(false)

  const ombrellone = dati.ombrelloni.find(o => o.id === scelto) ?? null
  // Una colonna in più a destra e una riga sotto: senza, non ci sarebbe modo
  // di allargare la mappa oltre com'è stata generata.
  const larghezza = dati.larghezza + 1
  const altezza = dati.altezza + 1
  const occupata = new Map(dati.ombrelloni.map(o => [`${o.posX},${o.posY}`, o]))

  async function patch(corpo: Record<string, unknown>, dopo?: () => void) {
    if (!scelto) return
    setAttesa(true); setErrore(null)
    try {
      const r = await fetch(`/api/v1/umbrellas/${scelto}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
      })
      if (!r.ok) throw await r.json()
      dopo?.()
      router.refresh()
    } catch (e: any) {
      setErrore(e?.message ?? 'Non è stato possibile applicare la modifica.')
    } finally { setAttesa(false) }
  }

  const tocca = (x: number, y: number) => {
    const qui = occupata.get(`${x},${y}`)
    if (qui) { setScelto(qui.id === scelto ? null : qui.id); setNumero(qui.visibleNumber); return }
    if (!scelto) return
    // La fila segue lo spostamento solo se la riga di destinazione ne ha già
    // una: cambiare fila cambia anche quale regola di listino si applica.
    const filaVicina = dati.ombrelloni.find(o => o.posY === y && o.id !== scelto)?.rowLabel
    void patch({ posX: x, posY: y, ...(filaVicina ? { rowLabel: filaVicina } : {}) })
  }

  if (!dati.beachMapId || dati.ombrelloni.length === 0) return null

  return (
    <div className="riquadro">
      <div className="etichetta">Disposizione · {dati.ombrelloni.length} ombrelloni</div>
      <p className="nota">
        {scelto
          ? 'Ora tocca la casella dove spostarlo. Tocca di nuovo l’ombrellone per lasciar perdere.'
          : 'Tocca un ombrellone per spostarlo o rinumerarlo.'}
      </p>
      {errore && <div className="err">{errore}</div>}

      <div className="tavolo">
        <svg viewBox={`0 0 ${larghezza * CELLA} ${altezza * CELLA}`}
             className="disposizione" role="img" aria-label="Disposizione degli ombrelloni">
          {dati.features.map((f, i) => (
            <rect key={i} x={f.x * CELLA} y={f.y * CELLA}
                  width={f.w * CELLA} height={f.h * CELLA}
                  className={`feature ${f.kind.toLowerCase()}`} />
          ))}

          {/* Le caselle vuote sono bersagli veri, non spazio bianco. */}
          {Array.from({ length: altezza }, (_, y) =>
            Array.from({ length: larghezza }, (_, x) =>
              occupata.has(`${x},${y}`) ? null : (
                <rect key={`${x}-${y}`} x={x * CELLA + 2} y={y * CELLA + 2}
                      width={CELLA - 4} height={CELLA - 4} rx={6}
                      className={`vuota ${scelto ? 'attiva' : ''}`}
                      onClick={() => tocca(x, y)} />
              )))}

          {dati.ombrelloni.map(o => (
            <g key={o.id} className={`omb ${o.id === scelto ? 'scelto' : ''}`}
               onClick={() => tocca(o.posX, o.posY)}
               aria-label={`Ombrellone ${o.visibleNumber}, fila ${o.rowLabel}`}>
              <rect x={o.posX * CELLA + 2} y={o.posY * CELLA + 2}
                    width={CELLA - 4} height={CELLA - 4} rx={6} />
              <text x={o.posX * CELLA + CELLA / 2} y={o.posY * CELLA + CELLA / 2 + 4}
                    textAnchor="middle">{o.visibleNumber}</text>
            </g>
          ))}
        </svg>
      </div>

      {ombrellone && (
        <div className="box form">
          <div className="row"><span className="k">Ombrellone</span>
            <b>{ombrellone.visibleNumber}</b></div>
          <div className="row"><span className="k">Fila</span><span>{ombrellone.rowLabel}</span></div>
          {/* Spostare un ombrellone pieno è legittimo — l'identità non cambia,
              le prenotazioni restano — ma va detto prima, non scoperto dopo. */}
          {ombrellone.impegni > 0 && (
            <div className="nota">
              Ha {ombrellone.impegni} fra prenotazioni e contratti attivi. Si sposta
              lo stesso: cambia dove è disegnato, non quale ombrellone è.
            </div>
          )}
          <label>Numero visibile
            <input value={numero} onChange={e => setNumero(e.target.value)} maxLength={12} />
          </label>
          <button className="primary" disabled={attesa || numero === ombrellone.visibleNumber}
                  onClick={() => void patch({ visibleNumber: numero.trim() })}>
            {attesa ? 'Salvo…' : 'RINUMERA'}
          </button>
          <button onClick={() => setScelto(null)} disabled={attesa}>Chiudi</button>
        </div>
      )}
    </div>
  )
}
