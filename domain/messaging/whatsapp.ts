/**
 * I messaggi che il gestore manda ai clienti (RF-SYS-03).
 *
 * Stanno nel dominio, non nelle rotte: sono testo che il cliente leggerà
 * davvero, e vanno provati come si prova un calcolo. Nessuno di questi viene
 * inviato dal prodotto — si aprono in WhatsApp già scritti, e il gestore può
 * cambiarli prima di premere invio. Un messaggio spedito da solo, a nome suo,
 * senza che l'abbia letto, sarebbe una cosa diversa e non l'abbiamo scelta.
 */

const euro = (cents: number) =>
  (cents / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })

const giorno = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('it-IT',
    { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

/** Il link personale dello stagionale: lo riceve una volta e resta lì. */
export function messaggioLinkStagionale(
  nome: string, numero: string, link: string, club: string,
) {
  return (
    `Buongiorno ${nome}, questo è il suo link personale di ${club} per l'ombrellone ${numero}.\n\n` +
    `Se un giorno non viene, lo comunichi da qui: il posto resta suo, ma noi possiamo ` +
    `assegnarlo a qualcun altro solo per quel giorno.\n\n${link}`
  )
}

export type Conferma = {
  nome: string
  club: string
  ombrelloni: string[]
  dal: string
  al: string
  totaleCents: number
  pagato: boolean
}

/**
 * F6-28 · La conferma di una prenotazione.
 *
 * Contiene ciò che il cliente cercherà nella chat quando arriva in spiaggia:
 * quale ombrellone, che giorni, quanto. Il numero dell'ombrellone va per
 * primo — è la cosa che serve al cancello, con le valigie in mano.
 */
export function messaggioConferma(c: Conferma) {
  const quali = c.ombrelloni.length === 1
    ? `l'ombrellone ${c.ombrelloni[0]}`
    : `gli ombrelloni ${c.ombrelloni.slice(0, -1).join(', ')} e ${c.ombrelloni.at(-1)}`

  const quando = c.dal === c.al
    ? `per ${giorno(c.dal)}`
    : `da ${giorno(c.dal)} a ${giorno(c.al)}`

  const conti = c.pagato
    ? `Totale ${euro(c.totaleCents)}, già saldato.`
    : `Totale ${euro(c.totaleCents)}, da pagare all'arrivo.`

  return (
    `Buongiorno ${c.nome}, la sua prenotazione a ${c.club} è confermata:\n\n` +
    `📍 ${quali}\n📅 ${quando}\n💶 ${conti}\n\n` +
    `Se cambia programma ci avvisi pure, anche solo con un messaggio qui.`
  )
}

/**
 * L'indirizzo che apre WhatsApp, con il messaggio già scritto se c'è.
 *
 * Senza testo NON si aggiunge `?text=`: un parametro vuoto in fondo
 * all'indirizzo non fa danni, ma è la prima cosa che si nota aprendo il link,
 * e chi la vede pensa che il messaggio si sia perso per strada.
 */
export function linkWhatsApp(telefono: string, testo = '') {
  const numero = telefono.replace(/\D/g, '')
  if (!numero) return null
  const base = `https://wa.me/${numero}`
  return testo.trim() ? `${base}?text=${encodeURIComponent(testo)}` : base
}
