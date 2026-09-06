'use client'


/**
 * Scenario E · Tutto sotto gli occhi mentre il cliente è al telefono:
 * preferenze, ombrelloni ricorrenti, storico. Senza scorrere, su tablet.
 *
 * Le preferenze si MOSTRANO, non si applicano da sole (`R4`): è il 90% del
 * valore al 10% del costo, e l'operatore le legge al cliente.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { SchedaCliente } from '@/server/queries/customers'

const euro = (c: number) =>
  (c / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
const data = (iso: string) =>
  iso ? new Date(iso + 'T00:00:00Z').toLocaleDateString('it-IT',
    { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—'

const MARE: Record<string, string> = {
  NEAR: 'vicino al mare', FAR: 'lontano dal mare', INDIFFERENT: 'indifferente',
}
const LATO: Record<string, string> = { LEFT: 'lato sinistro', RIGHT: 'lato destro', CENTER: 'centro' }
const ORIGINE: Record<string, string> = {
  PHONE: 'telefono', WHATSAPP: 'WhatsApp', RECEPTION: 'reception', WEB: 'web', OTHER: 'altro',
}

export default function Scheda({ dati }: { dati: SchedaCliente }) {
  const router = useRouter()
  const preferenze = dati.preferenze
  const haPreferenze = preferenze && Object.values(preferenze).some(Boolean)
  const [conferma, setConferma] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [attesa, setAttesa] = useState(false)

  async function anonimizza() {
    setAttesa(true); setErrore(null)
    try {
      const r = await fetch(`/api/v1/customers/${dati.id}/anonymize`, { method: 'POST' })
      if (!r.ok) throw await r.json()
      router.refresh()
    } catch (e: any) { setErrore(e?.message ?? 'Operazione non riuscita.') }
    finally { setAttesa(false); setConferma(false) }
  }

  return (
    <main className="scheda-cliente">
      <div className="testa">
        <div>
          <h1>{dati.nome} {dati.cognome}</h1>
          {dati.telefono && <div className="tel">{dati.telefono}</div>}
        </div>
        {dati.telefonoWhatsApp && (
          <a className="wa" href={`https://wa.me/${dati.telefonoWhatsApp}`}
             target="_blank" rel="noreferrer">WhatsApp</a>
        )}
      </div>

      {dati.contrattoStagionale && (
        <div className="riquadro stagionale">
          <div className="etichetta">Stagionale</div>
          <div className="grande">
            Ombrellone <b>{dati.contrattoStagionale.ombrellone}</b> · {data(dati.contrattoStagionale.dal)} – {data(dati.contrattoStagionale.al)}
          </div>
          {dati.contrattoStagionale.creditoCents > 0 && (
            <div className="credito">
              Credito maturato: <b>{euro(dati.contrattoStagionale.creditoCents)}</b>
            </div>
          )}
        </div>
      )}

      {haPreferenze && (
        <div className="riquadro preferenze">
          <div className="etichetta">⭐ Preferenze</div>
          <ul>
            {preferenze!.fila && <li>Fila <b>{preferenze!.fila}</b></li>}
            {preferenze!.zona && <li>Zona <b>{preferenze!.zona}</b></li>}
            {preferenze!.ombrellone && <li>Ombrellone preferito <b>{preferenze!.ombrellone}</b></li>}
            {preferenze!.vicinanzaMare && <li>{MARE[preferenze!.vicinanzaMare] ?? preferenze!.vicinanzaMare}</li>}
            {preferenze!.lato && <li>{LATO[preferenze!.lato] ?? preferenze!.lato}</li>}
            {preferenze!.note && <li>{preferenze!.note}</li>}
          </ul>
        </div>
      )}

      {dati.ombrelloniRicorrenti.length > 0 && (
        <div className="riquadro">
          <div className="etichetta">Ombrelloni che sceglie di solito</div>
          <div className="ricorrenti">
            {dati.ombrelloniRicorrenti.map(o => (
              <span key={o.numero} className="pastiglia">
                <b>{o.numero}</b>{o.volte > 1 && <span> ×{o.volte}</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {dati.note && (
        <div className="riquadro"><div className="etichetta">Note</div><p>{dati.note}</p></div>
      )}

      {/* Scenario E · dalla scheda si prenota: leggere lo storico senza poter
          agire farebbe perdere tempo invece di farne guadagnare. */}
      <Link className="azione-primaria" href="/map?trova=1">NUOVA PRENOTAZIONE</Link>

      {errore && <div className="err">{errore}</div>}

      <div className="riquadro">
        <div className="etichetta">Storico</div>
        {dati.storico.length === 0
          ? <p className="vuoto">Nessuna prenotazione registrata.</p>
          : (
            <div className="tabella">
              <table>
                <thead>
                  <tr><th>Periodo</th><th>Ombrelloni</th><th className="num">Totale</th><th>Stato</th></tr>
                </thead>
                <tbody>
                  {dati.storico.map(r => {
                    const daPagare = r.totaleCents - r.pagatoCents
                    return (
                      <tr key={r.id} className={r.stato === 'CANCELLED' ? 'annullata' : ''}>
                        <td>{data(r.dal)} – {data(r.al)}<div className="minuto">da {ORIGINE[r.origine] ?? r.origine}</div></td>
                        <td>{r.ombrelloni.join(', ') || '—'}</td>
                        <td className="num">{euro(r.totaleCents)}</td>
                        <td>
                          {r.stato === 'CANCELLED'
                            ? <span className="minuto">annullata</span>
                            : daPagare > 0
                              ? <span className="dovuto">deve {euro(daPagare)}</span>
                              : <span className="saldato">saldato</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {/* NF-05 · i due obblighi concreti: consegnare i dati e cancellarli. */}
      <div className="riquadro gdpr">
        <div className="etichetta">Dati personali</div>
        <div className="azioni-gdpr">
          <a className="bottone-link" href={`/api/v1/customers/${dati.id}/export`}>
            Scarica i suoi dati
          </a>
          {!conferma
            ? <button onClick={() => setConferma(true)} disabled={attesa}>Anonimizza</button>
            : (
              <span className="azioni-gdpr">
                <button className="danger" onClick={() => void anonimizza()} disabled={attesa}>
                  {attesa ? 'Anonimizzo…' : 'Confermo: togli i dati personali'}
                </button>
                <button onClick={() => setConferma(false)} disabled={attesa}>Annulla</button>
              </span>
            )}
        </div>
        <p className="nota">
          L&apos;anonimizzazione toglie nome, telefono, email, note e preferenze.
          Prenotazioni e pagamenti restano, senza più il nome: servono a bilancio
          e non si possono cancellare. L&apos;operazione non è reversibile.
        </p>
      </div>
    </main>
  )
}
