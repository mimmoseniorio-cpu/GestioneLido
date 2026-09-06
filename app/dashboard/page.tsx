import Link from 'next/link'
import { dashboard } from '@/server/queries/dashboard'
import { richiediStaff } from '@/server/current-user'

export const dynamic = 'force-dynamic'

const euro = (c: number) => (c / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
const giornoBreve = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('it-IT',
    { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

export default async function PaginaDashboard() {
  const d = await dashboard(await richiediStaff())
  const o = d.occupazione

  return (
    <>
      <header className="topbar">
        <Link href="/map" className="indietro">← Mappa</Link>
        <span className="brand">Oggi</span>
      </header>

      <main className="cruscotto">
        {/* Prima ciò su cui si può agire: una dashboard che informa senza
            permettere di agire fa perdere tempo. */}
        {d.daFare.length > 0 && (
          <section className="da-fare">
            <div className="etichetta">Da fare</div>
            <div className="voci">
              {d.daFare.map((v, i) => (
                <Link key={i} href={v.azione} className="voce-da-fare">
                  <b>{v.valore}</b><span>{v.etichetta}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="colonne">
          <div className="riquadro">
            <div className="etichetta">Occupazione</div>
            <div className="cifrone">{o.occupati} <span>su {o.totali}</span></div>
            <div className="barra" role="img"
                 aria-label={`Occupazione ${o.percentuale} per cento`}>
              <span style={{ width: `${o.percentuale}%` }} />
            </div>
            <ul className="elenco">
              <li><b>{o.vendibili}</b> disponibili da vendere</li>
              <li><b>{o.stagionali}</b> {o.stagionali === 1 ? 'stagionale presente' : 'stagionali presenti'}</li>
              {o.assenti > 0 && (
                <li><b>{o.assenti}</b> {o.assenti === 1 ? 'stagionale assente' : 'stagionali assenti'}</li>
              )}
              {o.fuoriServizio > 0 && (
                <li><b>{o.fuoriServizio}</b> fuori servizio</li>
              )}
            </ul>
          </div>

          <div className="riquadro">
            <div className="etichetta">Incassi</div>
            <ul className="elenco largo">
              <li><span>Previsto oggi</span><b>{euro(d.incassi.previstoOggiCents)}</b></li>
              <li><span>Incassato oggi</span><b>{euro(d.incassi.incassatoOggiCents)}</b></li>
              <li className={d.incassi.daIncassareCents > 0 ? 'aperto' : ''}>
                <span>Ancora da incassare</span><b>{euro(d.incassi.daIncassareCents)}</b>
              </li>
            </ul>
            <p className="nota">
              «Previsto» è la quota di oggi di ciò che è occupato; «incassato» sono i
              pagamenti registrati oggi, anche su altri periodi.
            </p>
          </div>

          {/* La metrica che risponde a "quanto mi ha reso", non a "quanto mi costa". */}
          <div className="riquadro recuperato">
            <div className="etichetta">Capacità recuperata</div>
            <div className="cifrone">
              {d.recupero.stagione} <span>{d.recupero.stagione === 1 ? 'posto in stagione' : 'posti in stagione'}</span>
            </div>
            <div className="soldi">{euro(d.recupero.stagioneCents)}</div>
            <p className="nota">
              Posti di stagionali assenti che sarebbero rimasti vuoti e che invece
              hai venduto.{d.recupero.oggi > 0 && ` Oggi: ${d.recupero.oggi} · ${euro(d.recupero.oggiCents)}.`}
            </p>
          </div>
        </section>

        <section className="riquadro">
          <div className="etichetta">Prossimi sette giorni</div>
          <div className="settimana">
            {d.prossimiGiorni.map(g => (
              <div key={g.data} className="giorno">
                <div className="nome">{giornoBreve(g.data)}</div>
                <div className="colonna-barra">
                  <span style={{ height: `${Math.max(3, g.percentuale)}%` }} />
                </div>
                <div className="perc">{g.percentuale}%</div>
                <div className="disp">{g.vendibili} liberi</div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  )
}
