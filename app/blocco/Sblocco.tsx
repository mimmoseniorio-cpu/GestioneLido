'use client'

/**
 * Tastierino del blocco schermo.
 *
 * Numerico e grande: chi lo usa ha le mani bagnate, il sole in faccia e spesso
 * una mano sola libera. La tastiera di sistema su un campo di testo coprirebbe
 * metà schermo e comparirebbe in una lingua qualunque.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const TASTI = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

export default function Sblocco({ nome, club }: { nome: string; club: string }) {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [attesa, setAttesa] = useState(false)

  const premi = (c: string) => {
    if (attesa || pin.length >= 8) return
    setErrore(null)
    const nuovo = pin + c
    setPin(nuovo)
    // A quattro cifre si prova da solo: il PIN più comune ne ha quattro, e
    // chiedere un tocco in più a ogni sblocco della giornata è troppo.
    if (nuovo.length === 4) void apri(nuovo)
  }

  async function apri(valore = pin) {
    setAttesa(true); setErrore(null)
    try {
      const r = await fetch('/api/v1/auth/unlock', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pin: valore }),
      })
      if (!r.ok) {
        const dati = await r.json().catch(() => ({}))
        // Sessione chiusa per troppi tentativi: si rientra con la password.
        if (r.status === 401) { router.push('/login'); return }
        setPin('')
        setErrore(dati.message ?? 'PIN errato.')
        return
      }
      router.push('/map')
      router.refresh()
    } catch {
      setErrore('Connessione assente. Riprova fra un momento.')
    } finally { setAttesa(false) }
  }

  return (
    <main className="blocco">
      <div className="riquadro">
        <div className="chi">
          <h1>{club}</h1>
          <p className="nota">{nome ? `${nome}, inserisci il PIN` : 'Inserisci il PIN'}</p>
        </div>

        <div className="pallini" aria-label={`${pin.length} cifre inserite`}>
          {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
            <span key={i} className={i < pin.length ? 'pieno' : ''} />
          ))}
        </div>

        {errore && <div className="err" role="alert">{errore}</div>}

        <div className="tastierino">
          {TASTI.map(c => (
            <button key={c} onClick={() => premi(c)} disabled={attesa}>{c}</button>
          ))}
          <button className="chiaro" onClick={() => { setPin(''); setErrore(null) }}
                  disabled={attesa} aria-label="Cancella">✕</button>
          <button onClick={() => premi('0')} disabled={attesa}>0</button>
          <button className="chiaro" onClick={() => void apri()}
                  disabled={attesa || pin.length < 4} aria-label="Conferma">→</button>
        </div>

        {/* Chi ha dimenticato il PIN non deve restare fuori dal proprio
            stabilimento: la password vale sempre. */}
        <a className="nota" href="/api/v1/auth/logout-e-login">Ho dimenticato il PIN</a>
      </div>
    </main>
  )
}
