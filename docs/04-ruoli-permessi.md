# 04 — Ruoli e permessi

**Fase:** F1 · **Stato:** completo

---

## 1. I tre soggetti

| Soggetto | Autenticazione | Superficie |
|---|---|---|
| `ADMIN` | email + password | tutto lo stabilimento |
| `OPERATOR` | email + password | operatività quotidiana, non configurazione |
| `SEASONAL_CUSTOMER` | magic link | il proprio contratto, in sola lettura tranne le assenze |

Non esiste un ruolo "cliente giornaliero": nell'MVP il giornaliero non accede al
sistema, è gestito interamente dall'operatore.

---

## 2. Matrice dei permessi

`✓` consentito · `–` negato · `▲` consentito con vincolo (nota sotto)

| Azione | ADMIN | OPERATOR | STAGIONALE |
|---|:--:|:--:|:--:|
| **Stabilimento e stagione** ||||
| Modificare dati e impostazioni dello stabilimento | ✓ | – | – |
| Creare, aprire, chiudere una stagione | ✓ | – | – |
| Modificare le policy (cutoff, credito, conflitti) | ✓ | – | – |
| **Utenti** ||||
| Creare, modificare, disattivare utenti | ✓ | – | – |
| Cambiare la propria password | ✓ | ✓ | – |
| **Mappa** ||||
| Creare e modificare la mappa, generare la griglia | ✓ | – | – |
| Aggiungere, spostare, rinumerare ombrelloni | ✓ | – | – |
| Bloccare/sbloccare un ombrellone | ✓ | ▲¹ | – |
| Visualizzare la mappa | ✓ | ✓ | – |
| **Clienti** ||||
| Creare e modificare un cliente | ✓ | ✓ | – |
| Vedere lo storico e le preferenze | ✓ | ✓ | – |
| Anonimizzare un cliente (GDPR) | ✓ | – | – |
| Esportare i dati di un cliente | ✓ | – | – |
| Unire due clienti duplicati | ✓ | ▲² | – |
| **Prenotazioni** ||||
| Creare una prenotazione | ✓ | ✓ | – |
| Modificare periodo o ombrellone | ✓ | ✓ | – |
| Annullare una prenotazione | ✓ | ✓ | – |
| Applicare un override di prezzo | ✓ | ▲³ | – |
| Vedere il calendario e le disponibilità | ✓ | ✓ | – |
| **Stagionali** ||||
| Creare o modificare un contratto stagionale | ✓ | – | – |
| Generare o revocare il magic link | ✓ | ▲⁴ | – |
| Dichiarare un'assenza per conto del cliente | ✓ | ✓ | – |
| Dichiarare la **propria** assenza | – | – | ✓ |
| Annullare un'assenza | ✓ | ✓ | ▲⁵ |
| Vedere il **proprio** contratto e calendario | – | – | ✓ |
| **Crediti** ||||
| Vedere il credito di un contratto | ✓ | ✓ | ▲⁶ |
| Registrare l'utilizzo di un credito | ✓ | ✓ | – |
| Rettificare manualmente un credito | ✓ | – | – |
| **Pagamenti** ||||
| Registrare un pagamento | ✓ | ✓ | – |
| Registrare un rimborso | ✓ | ▲³ | – |
| Vedere l'incassato dell'intera giornata | ✓ | ✓ | – |
| **Listino** ||||
| Creare e modificare le regole di prezzo | ✓ | – | – |
| Vedere il listino | ✓ | ✓ | – |
| **Dashboard e audit** ||||
| Vedere la dashboard giornaliera | ✓ | ✓ | – |
| Consultare l'audit log | ✓ | ▲⁷ | – |

### Vincoli
1. **▲¹** L'operatore può bloccare un ombrellone per un guasto del giorno, ma
   solo per una durata limitata (default 7 giorni). Un blocco permanente è
   configurazione, quindi da admin.
2. **▲²** L'operatore può proporre l'unione di due clienti duplicati; l'unione
   effettiva richiede conferma di un admin. L'operazione è irreversibile e
   tocca lo storico.
3. **▲³** L'operatore può scostarsi dal listino entro una soglia configurabile
   (default ±20%) e può rimborsare fino a un importo massimo (default 50 €).
   Oltre, serve un admin. Ogni override finisce nell'audit log con il motivo.
4. **▲⁴** L'operatore può **rigenerare** un link per un cliente che l'ha perso.
   Non può revocarlo definitivamente.
5. **▲⁵** Il cliente stagionale può annullare la propria assenza **solo** se
   nessun giorno dell'intervallo è stato rivenduto. Se lo è, si applica `D-01` e
   l'annullamento parziale (`docs/08`).
6. **▲⁶** Il cliente vede solo il proprio saldo e il proprio storico crediti.
7. **▲⁷** L'operatore vede l'audit delle entità su cui sta lavorando (lo storico
   di una prenotazione), non il registro completo dello stabilimento.

---

## 3. Regole trasversali

Valgono su **ogni** azione, senza eccezioni.

1. **Isolamento tenant prima del permesso.** Prima si verifica che la risorsa
   appartenga al `beach_club_id` della sessione, poi il ruolo. Una risorsa di un
   altro stabilimento risponde **404**, mai 403: un 403 confermerebbe che quella
   risorsa esiste.
2. **Il tenant non arriva mai dal client.** Si deriva dalla sessione. Un
   `beachClubId` nel corpo di una richiesta viene ignorato.
3. **Il permesso si verifica nel caso d'uso**, non nella rotta. Una funzione
   richiamata da due punti diversi resta protetta.
4. **La UI nasconde, il server nega.** Nascondere un pulsante è cortesia, non
   sicurezza: ogni endpoint verifica comunque.
5. **Ogni azione con `▲` genera una riga di audit** con il motivo, quando
   previsto.
6. **Il magic link è di sola lettura, con una sola eccezione**: dichiarare o
   annullare la propria assenza. Nessun altro `POST` gli è raggiungibile.

---

## 4. Implementazione

Permessi come costanti tipizzate, non stringhe sparse:

```ts
// domain/auth/permissions.ts
export const P = {
  RESERVATION_CREATE:  'reservation:create',
  RESERVATION_CANCEL:  'reservation:cancel',
  PRICE_OVERRIDE:      'price:override',
  SEASON_MANAGE:       'season:manage',
  MAP_EDIT:            'map:edit',
  CUSTOMER_ANONYMIZE:  'customer:anonymize',
  // …
} as const

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN:    Object.values(P),          // tutto
  OPERATOR: [P.RESERVATION_CREATE, P.RESERVATION_CANCEL, /* … */],
}
```

Ogni caso d'uso dichiara ciò che richiede:

```ts
export const cancelReservation = useCase({
  permission: P.RESERVATION_CANCEL,
  async run(ctx, input) { /* ctx è già verificato */ }
})
```

I vincoli `▲` (soglie di sconto, durata del blocco, tetto rimborso) non sono
permessi booleani: sono **limiti** letti da `BeachClub.settings` e verificati
dentro il caso d'uso, perché variano da stabilimento a stabilimento.

### Test obbligatori (`NF-04`)
Per ogni endpoint, generati automaticamente dalla matrice:
- ogni ruolo su ogni azione → risultato atteso della tabella;
- utente del club A su ogni risorsa del club B → **404**;
- magic link su ogni endpoint diverso dalle assenze → **403**;
- magic link di un contratto su risorse di un altro contratto → **404**.

---

## 5. Ruoli futuri (non nell'MVP)

Da non implementare ora, ma la struttura a permessi li rende additivi:

| Ruolo | Quando servirà |
|---|---|
| `CASHIER` | Solo incassi, nessuna modifica alle prenotazioni |
| `READONLY` | Titolare che vuole guardare i numeri senza toccare nulla |
| `CHAIN_MANAGER` | Più stabilimenti, quando esisterà il secondo cliente |
