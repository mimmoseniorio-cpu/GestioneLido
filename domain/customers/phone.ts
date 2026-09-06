/**
 * D-04 · Il telefono è l'identificativo operativo del cliente.
 *
 * È il dato che il gestore ha sempre e con cui cerca mentre è al telefono. Ma
 * lo stesso numero viene digitato in cinque modi diversi — «348 1234567»,
 * «+39 348 1234567», «0039 348…», «348-123-4567» — e se non li riconosciamo
 * come la stessa persona l'anagrafica si riempie di doppioni e lo storico si
 * spezza (C-81).
 *
 * Funzione pura. Prefisso predefinito configurabile: uno stabilimento di
 * confine ha clienti austriaci e sloveni.
 */

export type EsitoNormalizzazione =
  | { ok: true; e164: string }
  | { ok: false; motivo: 'TROPPO_CORTO' | 'NON_RICONOSCIUTO' }

const soloCifre = (s: string) => s.replace(/\D/g, '')

export function normalizzaTelefono(grezzo: string, prefissoPaese = '39'): EsitoNormalizzazione {
  const pulito = (grezzo ?? '').trim()
  if (!pulito) return { ok: false, motivo: 'TROPPO_CORTO' }

  // Il + va conservato prima di buttare via i separatori.
  const haPiu = pulito.startsWith('+')
  let cifre = soloCifre(pulito)

  if (!haPiu && cifre.startsWith('00')) cifre = cifre.slice(2)          // 0039…
  else if (haPiu) { /* già internazionale */ }
  else if (cifre.startsWith(prefissoPaese) && cifre.length >= 11) {
    // «393481234567» senza + : è internazionale senza il segno
  } else if (prefissoPaese === '39') {
    // Dell'Italia conosciamo le regole: i fissi iniziano per 0, i cellulari
    // per 3. Rifiutare il resto evita di trasformare un numero digitato male
    // in un cliente nuovo che duplica quello vero.
    if (!cifre.startsWith('0') && !cifre.startsWith('3'))
      return { ok: false, motivo: 'NON_RICONOSCIUTO' }
    cifre = prefissoPaese + cifre
  } else {
    // Degli altri paesi non conosciamo le regole: meglio accettare un numero
    // strano che bloccare l'operatore mentre ha un cliente davanti.
    if (cifre.length < 6) return { ok: false, motivo: 'TROPPO_CORTO' }
    cifre = prefissoPaese + cifre
  }

  if (cifre.length < 8) return { ok: false, motivo: 'TROPPO_CORTO' }
  if (cifre.length > 15) return { ok: false, motivo: 'NON_RICONOSCIUTO' }   // E.164 max
  return { ok: true, e164: '+' + cifre }
}

/** Come lo legge il gestore: «+39 348 1234567». */
export function formattaTelefono(e164: string): string {
  const m = /^\+39(3\d{2})(\d{6,7})$/.exec(e164)
  if (m) return `+39 ${m[1]} ${m[2]}`
  const l = /^\+39(0\d{1,3})(\d{5,8})$/.exec(e164)
  if (l) return `+39 ${l[1]} ${l[2]}`
  return e164
}

/** Le ultime cifre, che è come il gestore cerca davvero. */
export const coda = (e164: string, quante = 4) => soloCifre(e164).slice(-quante)
