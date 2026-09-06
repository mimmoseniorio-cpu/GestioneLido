/**
 * F6-32 · Regole del PIN del blocco schermo. Pure: nessun database, nessun hash.
 *
 * Il PIN non è una seconda password. Protegge un tablet appoggiato sul bancone
 * da chi passa, non da un attaccante: quattro cifre si indovinano in diecimila
 * tentativi, e quello che regge davvero il muro non è la lunghezza ma il fatto
 * che dopo pochi errori si torni a chiedere la password vera.
 */
export const CIFRE_MIN = 4
export const CIFRE_MAX = 8

/** Oltre questi errori di fila il blocco non si apre più con il PIN. */
export const TENTATIVI_MASSIMI = 5

export type EsitoPin =
  | { ok: true; pin: string }
  | { ok: false; motivo: string }

export function validaPin(grezzo: string): EsitoPin {
  const pin = grezzo.trim()
  if (!/^\d+$/.test(pin))
    return { ok: false, motivo: 'Il PIN è fatto solo di cifre.' }
  if (pin.length < CIFRE_MIN || pin.length > CIFRE_MAX)
    return { ok: false, motivo: `Servono da ${CIFRE_MIN} a ${CIFRE_MAX} cifre.` }

  // Un PIN che è tutto la stessa cifra, o una scaletta, non è un PIN: è il
  // primo tentativo di chiunque. Vale la pena rifiutarlo mentre lo si sceglie,
  // non spiegarlo dopo.
  if (new Set(pin).size === 1)
    return { ok: false, motivo: 'Tutte cifre uguali: è il primo che proverebbe chiunque.' }
  if (consecutivo(pin))
    return { ok: false, motivo: 'Cifre in fila: scegline altre.' }

  return { ok: true, pin }
}

const consecutivo = (pin: string) => {
  const passo = Number(pin[1]) - Number(pin[0]!)
  if (passo !== 1 && passo !== -1) return false
  return [...pin].every((c, i) => i === 0 || Number(c) - Number(pin[i - 1]!) === passo)
}

/**
 * Il tablet si blocca da solo dopo un po' che nessuno lo tocca.
 *
 * `minuti = 0` spegne il blocco automatico: resta solo quello a mano. Serve a
 * chi tiene il tablet in un ufficio chiuso e non vuole digitare il PIN venti
 * volte al giorno — il blocco deve poter essere scelto, o verrà aggirato
 * lasciando un post-it con il PIN attaccato allo schermo.
 */
export function daBloccare(
  ultimaAttivita: Date, adesso: Date, minuti: number, haPin: boolean,
): boolean {
  if (!haPin || minuti <= 0) return false
  return adesso.getTime() - ultimaAttivita.getTime() >= minuti * 60_000
}
