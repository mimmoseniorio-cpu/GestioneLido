'use client'

/**
 * F6-32 · Scegliere il PIN del blocco schermo.
 *
 * Il PIN è personale, non dello stabilimento: sul registro resta chi ha fatto
 * cosa, e un PIN condiviso cancellerebbe quella traccia.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ImpostaPin(
  { haPin, nome, minuti }: { haPin: boolean; nome: string; minuti: number },
) {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [ripeti, setRipeti] = useState('')
  const [password, setPassword] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [fatto, setFatto] = useState<string | null>(null)
  const [attesa, setAttesa] = useState(false)

  async function salva(nuovo: string | null) {
    if (nuovo !== null && nuovo !== ripeti) {
      setErrore('I due PIN non coincidono.'); return
    }
    setAttesa(true); setErrore(null); setFatto(null)
    try {
      const r = await fetch('/api/v1/auth/pin', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password, pin: nuovo }),
      })
      const dati = await r.json().catch(() => ({}))
      if (!r.ok) throw dati
      setPin(''); setRipeti(''); setPassword('')
      setFatto(nuovo ? 'PIN impostato.' : 'PIN tolto: il blocco è disattivato.')
      router.refresh()
    } catch (e: any) {
      setErrore(e?.message ?? 'Operazione non riuscita.')
    } finally { setAttesa(false) }
  }

  return (
    <main className="configura">
      <div className="riquadro">
        <div className="etichetta">Blocco schermo · {nome}</div>
        <p className="nota">
          Il tablet della reception resta acceso tutto il giorno sul bancone.
          Con un PIN, chi passa non arriva ai nomi e ai telefoni dei clienti.
        </p>
        <p className="nota">
          {haPin
            ? `Il PIN è attivo. Il tablet si blocca da solo dopo ${minuti} minuti che nessuno lo tocca.`
            : 'Nessun PIN impostato: chiunque prenda il tablet vede tutto.'}
        </p>

        {errore && <div className="err">{errore}</div>}
        {fatto && <div className="riquadro-ok">{fatto}</div>}

        <div className="box form">
          <label>Nuovo PIN (da 4 a 8 cifre)
            <input value={pin} inputMode="numeric" autoComplete="off" maxLength={8}
                   onChange={e => setPin(e.target.value.replace(/\D/g, ''))} />
          </label>
          <label>Ripeti il PIN
            <input value={ripeti} inputMode="numeric" autoComplete="off" maxLength={8}
                   onChange={e => setRipeti(e.target.value.replace(/\D/g, ''))} />
          </label>
          {/* La password serve sempre: senza, chi trova il tablet già aperto
              potrebbe metterci un PIN suo e chiudere fuori il gestore. */}
          <label>La tua password
            <input type="password" value={password} autoComplete="current-password"
                   onChange={e => setPassword(e.target.value)} />
          </label>
          <button className="primary" disabled={attesa || pin.length < 4 || !password}
                  onClick={() => void salva(pin)}>
            {attesa ? 'Salvo…' : haPin ? 'CAMBIA PIN' : 'IMPOSTA PIN'}
          </button>
          {haPin && (
            <button className="danger" disabled={attesa || !password}
                    onClick={() => void salva(null)}>
              Togli il PIN
            </button>
          )}
        </div>

        <Link className="nota" href="/map">← Torna alla mappa</Link>
      </div>
    </main>
  )
}
