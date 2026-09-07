/**
 * I messaggi che il cliente legge davvero (RF-SYS-03, F6-28).
 *
 * Si provano come si prova un calcolo: un messaggio che dimentica il numero
 * dell'ombrellone manda una famiglia a cercare il proprio posto al cancello,
 * con le valigie in mano.
 */
import { describe, it, expect } from 'vitest'
import { messaggioLinkStagionale, messaggioConferma, linkWhatsApp }
  from '@/domain/messaging/whatsapp'

const base = {
  nome: 'Luigi', club: 'Lido Adriano', ombrelloni: ['63'],
  dal: '2026-08-10', al: '2026-08-10', totaleCents: 2500, pagato: false,
}

describe('link personale dello stagionale', () => {
  it('contiene nome, ombrellone e link', () => {
    const m = messaggioLinkStagionale('Luigi', '51', 'https://lido.example/s/abc', 'Lido Adriano')
    expect(m).toContain('Luigi')
    expect(m).toContain('ombrellone 51')
    expect(m).toContain('https://lido.example/s/abc')
  })

  it('promette che il posto resta suo: è ciò che convince a comunicare l’assenza', () => {
    const m = messaggioLinkStagionale('Anna', '7', 'https://x/s/y', 'Lido')
    expect(m).toContain('il posto resta suo')
  })
})

describe('conferma di prenotazione', () => {
  it('dice ombrellone, giorno e prezzo', () => {
    const m = messaggioConferma(base)
    expect(m).toContain('Luigi')
    expect(m).toContain("l'ombrellone 63")
    expect(m).toContain('lunedì 10 agosto')
    expect(m).toContain('25,00')
  })

  it('un solo giorno si dice «per», più giorni «da … a …»', () => {
    expect(messaggioConferma(base)).toContain('per lunedì 10 agosto')
    const lungo = messaggioConferma({ ...base, al: '2026-08-14' })
    expect(lungo).toContain('da lunedì 10 agosto a venerdì 14 agosto')
  })

  it('più ombrelloni si elencano in italiano, non con le virgole fino in fondo', () => {
    expect(messaggioConferma({ ...base, ombrelloni: ['63', '64'] }))
      .toContain('gli ombrelloni 63 e 64')
    expect(messaggioConferma({ ...base, ombrelloni: ['63', '64', '65'] }))
      .toContain('gli ombrelloni 63, 64 e 65')
  })

  it('distingue «già saldato» da «da pagare all’arrivo»', () => {
    expect(messaggioConferma({ ...base, pagato: true })).toContain('già saldato')
    expect(messaggioConferma(base)).toContain("da pagare all'arrivo")
  })

  it('invita a farsi vivo se cambia programma: è come il gestore libera il posto', () => {
    expect(messaggioConferma(base)).toContain('cambia programma')
  })

  it('resta corto: su WhatsApp un muro di testo non si legge', () => {
    const m = messaggioConferma({ ...base, ombrelloni: ['63', '64'], al: '2026-08-17' })
    expect(m.length).toBeLessThan(320)
  })
})

describe('linkWhatsApp', () => {
  it('tiene solo le cifre e mette il testo già scritto', () => {
    const l = linkWhatsApp('+39 333 123 4567', 'ciao come va')!
    expect(l).toContain('https://wa.me/393331234567')
    expect(l).toContain('ciao%20come%20va')
  })

  it('senza numero non inventa un link', () => {
    expect(linkWhatsApp('', 'x')).toBeNull()
    expect(linkWhatsApp('non è un numero', 'x')).toBeNull()
  })
})
