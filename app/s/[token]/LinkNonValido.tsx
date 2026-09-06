/** C-64 · Un link scaduto non deve dare un errore tecnico: deve spiegare e
 *  dare il modo di risolvere. Chi lo apre è un cliente, non un tecnico. */
export default function LinkNonValido({ motivo }: { motivo: string }) {
  const testo = motivo === 'STAGIONE_CHIUSA'
    ? 'La stagione è terminata, quindi questo link non è più attivo.'
    : motivo === 'REVOCATO'
      ? 'Questo link non è più attivo.'
      : 'Questo link non è valido.'

  return (
    <main className="cliente">
      <div className="scheda">
        <h1>Link non attivo</h1>
        <p className="calmo">{testo}</p>
        <p className="calmo">
          Se le serve un link nuovo, lo chieda allo stabilimento: glielo rimandano
          su WhatsApp in un attimo.
        </p>
      </div>
    </main>
  )
}
