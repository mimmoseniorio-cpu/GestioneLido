# 07 — Flussi dei sei scenari

**Fase:** F1 · **Stato:** completo

> Ogni scenario è contato in **interazioni** (tap, click, digitazioni distinte).
> I numeri sono criteri di accettazione, non stime: se l'implementazione li
> supera, è un difetto da correggere prima del rilascio.

---

## Scenario A — "Avete un ombrellone libero oggi?"

Il cliente è davanti al banco. L'operatore deve rispondere mentre lo guarda.

| # | Chi | Azione | Schermata |
|---|---|---|---|
| 0 | — | L'app è già aperta sulla mappa di oggi | S-01 |

**Interazioni richieste: 0.**

La risposta è già sullo schermo: la riga dei contatori dice `24 liberi`, e i
simboli `●` sulla mappa dicono dove. L'operatore risponde senza toccare nulla.

Se il cliente accetta:

| # | Chi | Azione | Schermata |
|---|---|---|---|
| 1 | Operatore | Tap sull'ombrellone scelto | S-01 → S-02 |
| 2 | Operatore | Tap su **PRENOTA** | S-02 → S-04 |
| 3 | Operatore | Digita il telefono; se il cliente esiste si completa da solo | S-04 |
| 4 | Operatore | Tap su **CONFERMA** | S-04 |

**Totale fino alla prenotazione: 4 interazioni.**

Se il cliente è nuovo, l'operatore digita anche il nome: 5 interazioni. Nessun
altro campo è obbligatorio — le persone, le note e la fonte hanno valori
predefiniti modificabili dopo.

> **Criterio di accettazione:** rispondere = 0 interazioni; prenotare un cliente
> esistente ≤ 4; prenotare un cliente nuovo ≤ 5.

---

## Scenario B — "Due ombrelloni vicini dal 10 al 15 agosto"

Il cliente è al telefono. L'operatore non può farlo aspettare.

| # | Chi | Azione | Schermata |
|---|---|---|---|
| 1 | Operatore | Tap su **🔎 Disponibilità** (azione rapida) | S-01 → S-03 |
| 2 | Operatore | Imposta il periodo 10 → 15 agosto | S-03 |
| 3 | Operatore | Imposta quantità = 2 (default "vicini tra loro" già attivo) | S-03 |
| 4 | Operatore | Tap su **CERCA** | S-03 |
| — | Sistema | Mostra le soluzioni ordinate per adiacenza e prezzo | S-03 |
| 5 | Operatore | Tap su **[Vedi]** per descrivere la posizione al cliente | S-03 + S-01 |
| 6 | Operatore | Tap su **PRENOTA** sulla soluzione scelta | S-03 → S-04 |
| 7 | Operatore | Digita il telefono del cliente | S-04 |
| 8 | Operatore | Tap su **CONFERMA** | S-04 |

**Totale: 8 interazioni**, di cui 4 fino a vedere le disponibilità.

> **Criterio di accettazione:** dalla mappa alle proposte di coppie adiacenti in
> **≤ 4 interazioni**; prenotazione completa ≤ 8.

**Comportamento richiesto quando non c'è la soluzione perfetta** (`docs/06` §9):
il sistema non dice "nessun risultato". Propone soluzioni parziali — due vicini
per 4 giorni su 6, due non adiacenti per tutto il periodo — perché è ciò che
permette all'operatore di negoziare al telefono invece di riattaccare.

---

## Scenario C — Lo stagionale: "domani non vengo"

Il cliente è a casa, sul divano, con il telefono. Spesso è anziano.

| # | Chi | Azione | Schermata |
|---|---|---|---|
| 0 | Cliente | Apre il link personale salvato su WhatsApp | C-01 |
| 1 | Cliente | Tap su **NON SARÒ PRESENTE** | C-01 → C-02 |
| 2 | Cliente | Tap su **DOMANI** | C-02 |
| 3 | Cliente | Tap su **CONFERMA** | C-02 → conferma |

**Totale: 3 tap.** Nessuna digitazione, nessun login, nessuna password.

Per un intervallo di date: tap su "SCEGLI LE DATE", selezione sul calendario,
avanti, conferma → **5 tap**.

Effetti immediati lato gestore:
- l'ombrellone passa a `☆ VENDIBILE` sulla mappa del giorno interessato;
- il contatore "stagionali assenti" si incrementa;
- l'ombrellone entra nella ricerca disponibilità, marcato come temporaneo.

> **Criterio di accettazione:** ≤ 3 tap per il giorno singolo, ≤ 5 per
> l'intervallo; nessun login; conferma visibile che rassicura sul rientro.

### Variante: lo comunica al telefono
Molti stagionali telefoneranno invece di usare il link. L'operatore deve poterlo
registrare al posto loro:

| # | Chi | Azione | Schermata |
|---|---|---|---|
| 1 | Operatore | Tap su **🏖 Assenza** (azione rapida) | S-01 |
| 2 | Operatore | Digita il nome o il numero dell'ombrellone | overlay |
| 3 | Operatore | Seleziona le date (default: domani) | overlay |
| 4 | Operatore | Tap su **CONFERMA** | overlay |

**4 interazioni.** L'assenza viene registrata con `declared_by = STAFF`.

---

## Scenario D — Un giornaliero prenota il posto dello stagionale assente

È lo scenario che genera il ricavo aggiuntivo. Deve essere il più fluido di tutti.

| # | Chi | Azione | Schermata |
|---|---|---|---|
| 0 | — | La mappa mostra `☆` sull'ombrellone 51 | S-01 |
| 1 | Operatore | Tap sull'ombrellone 51 | S-01 → S-02 |
| — | Sistema | Mostra: stagionale Verdi, assente 12–14, tariffa 25 €, **credito a Verdi 7,50 €**, "torna riservato il 15" | S-02 |
| 2 | Operatore | Tap su **VENDI PER OGGI** | S-02 → S-04 |
| 3 | Operatore | Digita il telefono del cliente | S-04 |
| 4 | Operatore | Tap su **CONFERMA** | S-04 |

**Totale: 4 interazioni.**

Cosa accade nella stessa transazione (dettaglio in `docs/08`):

```
1. Crea Reservation + ReservationItem
     is_temporary_slot = true
     seasonal_absence_id = <assenza di Verdi>
2. Verifica il vincolo EXCLUDE                → nessuna doppia vendita
3. Crea CreditTransaction  kind=EARNED  7,50 €  per il contratto di Verdi
4. Aggiorna il saldo credito del contratto
5. Registra due righe di audit (vendita, credito)
6. Marca il giorno 12 dell'assenza come non più annullabile
```

Il diritto di Verdi sugli altri giorni resta intatto: il 15 agosto la mappa lo
mostra di nuovo `★ STAGIONALE PRESENTE`, **senza alcun intervento manuale**.

> **Criterio di accettazione:** ≤ 4 interazioni; il costo in credito visibile
> **prima** della conferma; rientro automatico verificato da test.

---

## Scenario E — Il cliente abituale telefona

| # | Chi | Azione | Schermata |
|---|---|---|---|
| 1 | Operatore | Tap sulla barra di ricerca (o `/` da tastiera) | S-01 |
| 2 | Operatore | Digita le ultime cifre del telefono, o il cognome | ricerca |
| — | Sistema | Risultati mentre si digita, da 3 caratteri | ricerca |
| 3 | Operatore | Tap sul cliente | S-09 |

**Totale: 3 interazioni** per avere davanti:

```
┌───────────────────────────────────────────────┐
│  Mario Bianchi          📞 348 1234567        │
│                              [WhatsApp]       │
│  ⭐ Preferenze                                │
│  Fila 5, lato destro. Se il 63 non è libero,  │
│  proporre 62 o 64.                            │
│                                               │
│  Ultimi ombrelloni:  63 (3×) · 62 · 64        │
│                                               │
│  Storico                                      │
│  2027  10–15 ago  omb. 63   180 €  pagato     │
│  2026  08–14 ago  omb. 63   170 €  pagato     │
│  2025  12–18 ago  omb. 62   165 €  pagato     │
│                                               │
│  [ NUOVA PRENOTAZIONE ]                       │
└───────────────────────────────────────────────┘
```

Le preferenze sono **mostrate**, non applicate automaticamente (`R4` post-MVP):
l'operatore le legge al cliente. È il 90% del valore al 10% del costo.

Da qui, "NUOVA PRENOTAZIONE" apre la ricerca disponibilità **precompilata con le
preferenze**: fila 5, e il 63 in cima ai risultati se libero.

> **Criterio di accettazione:** ≤ 3 interazioni da mappa a scheda cliente
> completa; ricerca reattiva da 3 caratteri; storico e preferenze nella stessa
> schermata, senza scorrimento su tablet.

---

## Scenario F — Il gestore guarda la mappa alle 09:30

Nessuna interazione. È un test di **leggibilità**, non di flusso.

In cinque secondi, senza toccare nulla, deve poter dire:

| Domanda | Dove sta la risposta |
|---|---|
| Quanto sono pieno? | Contatore in alto: `58 occupati / 96` |
| Cosa è libero? | Simboli `●` e contatore `24 liberi` |
| Quali stagionali mancano? | Simboli `☆`, contatore `9 stagionali assenti` |
| **Cosa posso vendere ora?** | `24 liberi + 9 vendibili = 33` |
| C'è qualcosa di rotto? | Simboli `⊘`, contatore `3 bloccati` |
| Chi deve ancora pagarmi? | Filtro `Solo da incassare`, 1 tap |

Perché funzioni:
- i contatori sono **testo**, non solo colori sulla mappa;
- `☆` (vendibile) è il simbolo più evidente della legenda: è l'informazione che
  vale di più e va notata per prima;
- la mappa entra **intera** nello schermo di un tablet senza zoom, a 96
  ombrelloni.

> **Criterio di accettazione:** un operatore mai formato risponde correttamente
> alle sei domande in ≤ 5 secondi, senza toccare lo schermo. Da verificare con
> una persona reale prima del rilascio, non solo con un test automatico.

---

## Riepilogo dei criteri

| Scenario | Criterio | Valore |
|---|---|---|
| A | Rispondere "c'è posto?" | **0** interazioni |
| A | Prenotare cliente esistente | ≤ **4** |
| B | Dalla mappa alle proposte | ≤ **4** |
| B | Prenotazione multipla completa | ≤ **8** |
| C | Assenza per domani (cliente) | ≤ **3** tap |
| C | Assenza registrata dall'operatore | ≤ **4** |
| D | Vendita del posto stagionale | ≤ **4** |
| E | Da mappa a scheda cliente | ≤ **3** |
| F | Leggere lo stato dello stabilimento | ≤ **5** secondi, 0 interazioni |

Questi nove numeri sono la definizione operativa di "semplice" per questo
prodotto. Ogni test E2E (`docs/10`) verifica il percorso **e** conta le
interazioni.
