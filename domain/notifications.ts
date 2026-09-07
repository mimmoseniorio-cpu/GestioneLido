/**
 * F6-29 · Gli eventi di cui vale la pena avvisare qualcuno.
 *
 * Puri: descrivono cosa è successo, non come lo si comunica. Il canale —
 * registro, avviso in pagina, un giorno una notifica sul telefono — è una
 * scelta separata, e deve poter cambiare senza toccare il dominio.
 */
export type Evento =
  | {
      tipo: 'ASSENZA_DICHIARATA'
      beachClubId: string
      seasonalContractId: string
      /** chi non verrà, come lo chiamerebbe il gestore */
      cliente: string
      ombrellone: string
      dal: string
      al: string
      /** fuori tempo massimo: il posto è vendibile ma non matura credito */
      tardiva: boolean
    }
  | {
      tipo: 'ASSENZA_ANNULLATA'
      beachClubId: string
      seasonalContractId: string
      cliente: string
      ombrellone: string
      dal: string
      al: string
    }

/**
 * La riga che una persona leggerà. Sta qui e non nell'adattatore perché il
 * testo è la parte che conta: un avviso che non si capisce a colpo d'occhio
 * è rumore, e il gestore smette di guardarlo dopo due giorni.
 */
export function descrizione(e: Evento): string {
  const quando = e.dal === e.al ? `il ${e.dal}` : `dal ${e.dal} al ${e.al}`
  switch (e.tipo) {
    case 'ASSENZA_DICHIARATA':
      return `${e.cliente} non verrà ${quando}: ombrellone ${e.ombrellone} vendibile` +
             (e.tardiva ? ' (comunicata fuori tempo: nessun credito)' : '')
    case 'ASSENZA_ANNULLATA':
      return `${e.cliente} ha annullato l'assenza ${quando}: ombrellone ${e.ombrellone} torna suo`
  }
}
