/**
 * F6-32 · Il tablet fermo si blocca da solo, anche a pagina già disegnata.
 *
 * Il blocco lo decide e lo applica il server — è quello che regge davvero, e
 * un timer nel browser da solo sarebbe teatro. Ma il server può accorgersene
 * solo alla richiesta successiva, e un tablet lasciato sul bancone non fa
 * richieste: la pagina resta lì com'era, con i nomi e i telefoni dei clienti
 * in chiaro, che è esattamente la cosa da cui il PIN doveva proteggere.
 *
 * Quindi: il browser conta i minuti di inattività VERA — dita e tasti, non
 * timer di sfondo — e a scadenza porta alla schermata del PIN. Il server, alla
 * prima richiesta, conferma. Chi disattivasse questo timer non guadagnerebbe
 * niente: le API risponderebbero comunque 423.
 */
/**
 * Cosa conta come «c'è qualcuno».
 *
 * `pointermove` sembra di troppo su un tablet — senza dita non si muove
 * niente — ma serve al banco, dove la reception ha spesso un mouse: con i soli
 * tocchi, chi stava guardando la mappa e muovendo il puntatore si vedeva
 * chiedere il PIN mentre lavorava. Un blocco che scatta addosso all'operatore
 * viene disattivato il primo giorno, e allora tanto vale non averlo.
 */
const EVENTI = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const

export function avviaBloccoPerInattivita(minuti: number, vaiAlBlocco: () => void) {
  if (!Number.isFinite(minuti) || minuti <= 0) return () => {}

  const soglia = minuti * 60_000
  let ultimo = Date.now()
  const tocco = () => { ultimo = Date.now() }

  for (const e of EVENTI) window.addEventListener(e, tocco, { passive: true })

  // Si controlla a intervalli invece di programmare un timer alla scadenza:
  // se il tablet va in sospensione, i timer lunghi non scattano puntuali, e
  // al risveglio il confronto sugli orologi dà comunque la risposta giusta.
  const battito = window.setInterval(() => {
    if (Date.now() - ultimo >= soglia) fine()
  }, 15_000)

  // Tornando da schermo spento o da un'altra scheda: si controlla subito,
  // senza aspettare il battito successivo.
  const alRitorno = () => {
    if (document.visibilityState === 'visible' && Date.now() - ultimo >= soglia) fine()
  }
  document.addEventListener('visibilitychange', alRitorno)

  function fine() {
    smetti()
    vaiAlBlocco()
  }
  function smetti() {
    window.clearInterval(battito)
    document.removeEventListener('visibilitychange', alRitorno)
    for (const e of EVENTI) window.removeEventListener(e, tocco)
  }
  return smetti
}
