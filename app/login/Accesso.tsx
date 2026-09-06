'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Accesso() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [attesa, setAttesa] = useState(false)

  async function entra(e: React.FormEvent) {
    e.preventDefault()
    setAttesa(true); setErrore(null)
    try {
      const r = await fetch('/api/v1/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!r.ok) throw await r.json()
      router.push('/map')
      router.refresh()
    } catch (e: any) {
      setErrore(e?.message ?? 'Accesso non riuscito.')
      setAttesa(false)
    }
  }

  return (
    <main className="accesso">
      <form className="riquadro" onSubmit={entra}>
        <h1>GestioneLido</h1>
        <p className="nota">Entra per vedere la mappa dello stabilimento.</p>
        {errore && <div className="err">{errore}</div>}
        <label>Email
          <input type="email" value={email} autoComplete="username" autoFocus required
                 onChange={e => setEmail(e.target.value)} />
        </label>
        <label>Password
          <input type="password" value={password} autoComplete="current-password" required
                 onChange={e => setPassword(e.target.value)} />
        </label>
        <button className="primary" type="submit" disabled={attesa}>
          {attesa ? 'Entro…' : 'ENTRA'}
        </button>
      </form>
    </main>
  )
}
