# OmbrelloneOS — Project Brief

> Documento sorgente di verità del prodotto. Ogni implementazione deve essere
> tracciabile a un requisito qui dentro. Se una feature non ha un ID qui, non si
> costruisce: prima si aggiorna questo file.

**Versione brief:** 1.0
**Stato:** FASE 1 non ancora avviata

---

## 0. Come si usa questo documento

| File | Ruolo |
|---|---|
| `PROJECT_BRIEF.md` | Cosa costruiamo e perché. Cambia raramente. |
| `AGENT_PROTOCOL.md` | Come si lavora. Regole operative per l'agente. |
| `STATUS.md` | Dove siamo adesso. Si aggiorna a ogni checkpoint. |
| `DECISIONS.md` | Decisioni di prodotto/architettura prese e aperte. |
| `BACKLOG.md` | Task con ID, generato alla fine della FASE 1. |

Un agente che riprende il lavoro legge **solo** `STATUS.md` → `DECISIONS.md` →
il task assegnato. Non ri-esplora il repository da zero.

---

## 1. Il problema

Uno stabilimento balneare gestisce oggi gli ombrelloni con carta, penna, Excel,
telefonate, WhatsApp e memoria del gestore. Nelle ore di punta questo produce:
doppie assegnazioni, posti stagionali che restano vuoti e invenduti, prezzi
applicati a memoria, incassi non tracciati, discussioni con i clienti.

**Non stiamo costruendo un portale di prenotazione spiagge.** Stiamo costruendo
lo strumento operativo interno del gestore.

### Metrica di successo del prodotto
Il gestore, a stagione iniziata, smette di usare il quaderno. Se continua a
tenere il quaderno accanto al tablet, abbiamo fallito.

---

## 2. Utenti

| Ruolo | Chi è | Dispositivo primario | Job principale |
|---|---|---|---|
| ADMIN | Titolare / responsabile | Desktop + tablet | Configura stabilimento, mappa, listino, utenti |
| OPERATORE | Bagnino / reception | **Tablet** | Assegna, prenota, incassa, libera |
| STAGIONALE | Cliente con contratto stagione | Smartphone (web, no app) | Comunica "oggi/dal-al non vengo" |
| GIORNALIERO | Cliente occasionale | — (gestito dall'operatore) | Nessun accesso nell'MVP |

Il cliente **non installa nulla**. Lo stagionale accede via link personale.

---

## 3. Principi non negoziabili

1. **MAPPA FIRST.** L'app si apre sulla mappa dello stabilimento, non su un menu.
   Nessun flusso principale deve passare da `Menu → Clienti → Cerca → Dettaglio`.
2. **Stato leggibile senza colore.** Ogni stato ombrellone ha colore **+** icona
   **+** trattamento del bordo. Deve funzionare per un daltonico e sotto il sole.
3. **Poche azioni, grosse.** Target touch minimo 44×44 px. Le 5 azioni frequenti
   sono raggiungibili in ≤ 2 tap dalla mappa.
4. **Lo stato dell'ombrellone è derivato, non memorizzato.** Vedi RD-01.
5. **Niente feature creep.** Test di ammissione di ogni feature: *"riduce i
   secondi che il gestore impiega a gestire un ombrellone?"* Se no, fuori dall'MVP.

---

## 4. Scope

### 4.1 Dentro l'MVP
`MVP-01` Login gestore + gestione utenti dello stabilimento
`MVP-02` Creazione e configurazione stabilimento (multi-tenant fin da subito)
`MVP-03` Editor mappa (file, ombrelloni, zone, corridoi, aree non prenotabili)
`MVP-04` Mappa operativa con stati e pannello rapido
`MVP-05` Anagrafica clienti + ricerca rapida
`MVP-06` Prenotazioni (giorno singolo, intervallo, stagionale)
`MVP-07` Ricerca disponibilità con criteri (adiacenza, fila, zona, prezzo)
`MVP-08` Contratti stagionali
`MVP-09` Assenze stagionali comunicate dal cliente (area cliente)
`MVP-10` Disponibilità temporanea e rivendita del posto stagionale
`MVP-11` Listino prezzi configurabile + override manuale
`MVP-12` Stato pagamenti (no gateway)
`MVP-13` Ricerca globale (cliente / telefono / numero ombrellone)
`MVP-14` Dashboard giornaliera essenziale
`MVP-15` Audit log delle operazioni critiche
`MVP-16` Responsive reale desktop / tablet / smartphone + PWA installabile
`MVP-17` Credito stagionale (modello dati completo, UI minima)

### 4.2 Fuori dall'MVP — da non iniziare
Marketplace pubblico · AI · chatbot · app native iOS/Android · integrazioni POS ·
loyalty avanzata · CRM marketing · fatturazione elettronica · contabilità ·
ristorante/bar · lettini separati · gestione personale · tavoli · e-commerce ·
funzioni social · gateway di pagamento online.

### 4.3 Fuori dall'MVP ma da non rendere impossibile
- **API pubbliche di disponibilità** (futuro marketplace multi-stabilimento):
  il dominio espone `availability` come servizio, non come query dentro un componente React.
- **Notifiche** (email / WhatsApp / push / SMS): esiste un `NotificationPort`
  con una sola implementazione (log) nell'MVP.
- **Pagamenti online**: `Payment` ha già `method` e `provider_ref` nullable.
- **Mezza giornata**: gli intervalli sono modellati per poter diventare più granulari.

---

## 5. Requisiti funzionali

### 5.1 Mappa (`RF-MAP`)
- `RF-MAP-01` La mappa è configurabile per stabilimento: file, numerazione,
  posizione, corridoi, passerelle, zone, ingressi, servizi, aree non prenotabili.
- `RF-MAP-02` Ogni ombrellone ha: id interno, numero visibile, fila, zona,
  coordinate, categoria, tariffa base, contratto stagionale eventuale.
- `RF-MAP-03` Stati visualizzati: `LIBERO`, `OCCUPATO`, `PRENOTATO`,
  `STAGIONALE_PRESENTE`, `STAGIONALE_ASSENTE`, `TEMP_DISPONIBILE`, `BLOCCATO`.
- `RF-MAP-04` La mappa ha un selettore di data. Default: oggi.
- `RF-MAP-05` Tap su ombrellone → pannello rapido con numero, stato, cliente,
  periodo, telefono, note, pagamento, azioni.
- `RF-MAP-06` Azioni del pannello: prenota · assegna cliente · libera ·
  registra assenza · modifica · registra pagamento · blocca · aggiungi nota.
- `RF-MAP-07` Funziona su desktop, tablet e smartphone. Il tablet è il caso primario.

### 5.2 Prenotazioni (`RF-RES`)
- `RF-RES-01` Tipi: giorno singolo, giorni consecutivi, intervallo, stagionale.
- `RF-RES-02` Campi minimi: cliente, ombrellone, data inizio, data fine,
  n. persone, prezzo, stato pagamento, origine, note.
- `RF-RES-03` Origine: `TELEFONO` · `WHATSAPP` · `RECEPTION` · `WEB` · `ALTRO`.
- `RF-RES-04` Il prezzo applicato è congelato sulla prenotazione: modifiche
  successive al listino non lo alterano.
- `RF-RES-05` Doppie prenotazioni sovrapposte sullo stesso ombrellone sono
  **impossibili**, garantite a livello di database (vedi RD-02).

### 5.3 Disponibilità (`RF-AVL`)
- `RF-AVL-01` Input: periodo + quantità + preferenze. Output: migliori
  combinazioni disponibili, ordinate.
- `RF-AVL-02` Criteri supportati: adiacenza tra ombrelloni, fila, zona, prezzo,
  vicinanza passerella, vicinanza a un altro cliente, ombrellone specifico.
- `RF-AVL-03` Algoritmo **deterministico**, nessuna AI. Deve essere testabile
  con input/output fissi.
- `RF-AVL-04` La ricerca include i posti stagionali in stato `TEMP_DISPONIBILE`,
  chiaramente marcati come tali.

### 5.4 Stagionali e assenze (`RF-SEA`) — cuore del prodotto
- `RF-SEA-01` Un `SeasonalContract` lega cliente + ombrellone + periodo stagione.
- `RF-SEA-02` Lo stagionale comunica un'assenza per un giorno o un intervallo.
- `RF-SEA-03` Nei giorni di assenza l'ombrellone diventa `TEMP_DISPONIBILE` e
  rientra nella ricerca disponibilità.
- `RF-SEA-04` Alla fine della finestra, l'ombrellone torna automaticamente
  riservato allo stagionale. Nessuna azione manuale richiesta.
- `RF-SEA-05` Lo stagionale può annullare l'assenza **solo se** il giorno non è
  già stato rivenduto. Altrimenti si applica la policy `D-01`.
- `RF-SEA-06` Il flusso "non sarò presente" è: seleziona data/intervallo →
  conferma → fine. Massimo 3 tap.

### 5.5 Crediti stagionali (`RF-CRD`)
- `RF-CRD-01` Quando un giorno liberato viene effettivamente rivenduto, allo
  stagionale matura un credito.
- `RF-CRD-02` Lo storico mostra: giorno liberato · nuova prenotazione ·
  credito maturato · credito utilizzato.
- `RF-CRD-03` Il calcolo è configurabile per stabilimento (default: percentuale
  dell'incasso della rivendita). Vedi `D-03`.
- `RF-CRD-04` MVP: si matura e si visualizza. L'utilizzo può essere una
  registrazione manuale del gestore.

### 5.6 Clienti (`RF-CUS`)
- `RF-CUS-01` Campi: nome, cognome, telefono, email opzionale, note, preferenze,
  storico, flag stagionale.
- `RF-CUS-02` Ricerca per nome, cognome, telefono. Risultati mentre si digita.
- `RF-CUS-03` Il telefono normalizzato è l'identificativo operativo (vedi `D-04`).
- `RF-CUS-04` Preferenze: fila, zona, ombrellone preferito, vicinanza ad altri
  clienti, vicino/lontano dal mare, lato, note libere. Nell'MVP sono manuali e
  vengono **mostrate** in fase di prenotazione, non applicate automaticamente.

### 5.7 Prezzi (`RF-PRC`)
- `RF-PRC-01` Listino configurabile per: fila, zona, periodo, alta/bassa
  stagione, giorno della settimana, durata, tipo cliente.
- `RF-PRC-02` Override manuale sempre possibile, con motivo e tracciamento audit.
- `RF-PRC-03` Il motore di prezzo è una funzione pura testabile:
  `price(umbrella, dateRange, customer, rules) → { total, breakdown[] }`.

### 5.8 Pagamenti (`RF-PAY`)
- `RF-PAY-01` Stati: `DA_PAGARE` · `PARZIALE` · `PAGATO` · `RIMBORSATO`.
- `RF-PAY-02` Registra: totale, pagato, metodo, data, note.
- `RF-PAY-03` Metodi: contanti, carta, bonifico, online, altro.

### 5.9 Dashboard e calendario (`RF-DSH`)
- `RF-DSH-01` Oggi: totali, occupati, liberi, stagionali assenti, temp.
  disponibili, prenotazioni del giorno, incasso previsto, incassato, da incassare.
- `RF-DSH-02` Percentuale occupazione e disponibilità dei prossimi 7 giorni.
- `RF-DSH-03` Nessun grafico che non guidi una decisione operativa.
- `RF-DSH-04` Vista calendario giorno / settimana / mese con occupazione,
  prenotazioni, assenze stagionali.

### 5.10 Trasversali (`RF-SYS`)
- `RF-SYS-01` Ricerca globale: cliente, telefono, numero ombrellone, prenotazione.
  Digitando `63` si arriva all'ombrellone 63.
- `RF-SYS-02` Azioni rapide sempre accessibili: nuova prenotazione · nuovo
  cliente · cerca disponibilità · registra assenza · registra pagamento.
- `RF-SYS-03` Pulsante "Apri WhatsApp": genera un messaggio precompilato
  modificabile e apre `https://wa.me/<telefono>?text=...`. Nessuna integrazione API.
- `RF-SYS-04` Audit log su: creazione/modifica/cancellazione prenotazione, cambio
  prezzo, pagamento, cambio ombrellone, assenza stagionale. Registra utente,
  timestamp, operazione, stato precedente, stato successivo.
- `RF-SYS-05` Ruoli `ADMIN` e `OPERATORE`, estendibili.
- `RF-SYS-06` Multi-tenant: isolamento completo dei dati per stabilimento.
  Nessun dato hardcoded su un singolo stabilimento.

---

## 6. Regole di dominio critiche

Queste sono le regole che, se sbagliate, rendono il prodotto inutilizzabile.
Vanno implementate per prime e coperte da test prima di scrivere UI.

### `RD-01` — Lo stato di un ombrellone è derivato
Non esiste una colonna `status` persistita e aggiornata a mano. Lo stato è una
funzione pura:

```
statoOmbrellone(umbrellaId, data) =
  se umbrella.blocked                                  → BLOCCATO
  se esiste Reservation attiva che copre data          → OCCUPATO | PRENOTATO
  se esiste SeasonalContract che copre data:
      se esiste SeasonalAbsence che copre data:
          se esiste Reservation su quel giorno         → OCCUPATO (rivenduto)
          altrimenti                                   → TEMP_DISPONIBILE
      altrimenti                                       → STAGIONALE_PRESENTE
  altrimenti                                           → LIBERO
```

`OCCUPATO` vs `PRENOTATO`: `OCCUPATO` = il periodo include oggi ed è confermato/
check-in fatto; `PRENOTATO` = periodo futuro. `STAGIONALE_ASSENTE` è la
proiezione UI di `TEMP_DISPONIBILE` quando il gestore filtra per assenze.

Motivo: qualunque stato persistito si disallinea al primo caso limite (modifica
periodo, annullamento, ritorno anticipato) e produce doppie vendite.

### `RD-02` — Impossibilità di overlap, garantita dal database
Il divieto di doppia prenotazione non può stare solo nel codice applicativo:
due richieste concorrenti passerebbero entrambe il controllo.

Vincolo a livello PostgreSQL (`btree_gist` + `EXCLUDE`):

```sql
ALTER TABLE reservation_item ADD CONSTRAINT no_overlap
  EXCLUDE USING gist (
    umbrella_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  ) WHERE (status IN ('CONFIRMED','CHECKED_IN'));
```

Ogni operazione che tocca prenotazioni gira dentro una transazione. La violazione
del vincolo viene tradotta in un errore di dominio leggibile, non in un 500.

### `RD-03` — Ciclo di vita assenza stagionale
```
[nessuna assenza]
      │ lo stagionale dichiara assenza per [d1..d2]
      ▼
ASSENZA_DICHIARATA         → i giorni diventano TEMP_DISPONIBILE
      │
      ├── il gestore vende un giorno d ∈ [d1..d2]
      │        ▼
      │   ASSENZA_SFRUTTATA (per quel giorno)
      │        → matura CreditTransaction per lo stagionale
      │        → l'assenza su quel giorno è IRREVOCABILE
      │
      ├── lo stagionale annulla, nessun giorno venduto
      │        ▼
      │   ASSENZA_ANNULLATA → i giorni tornano STAGIONALE_PRESENTE
      │
      └── passa la data di fine
               ▼
          ASSENZA_CHIUSA → l'ombrellone torna automaticamente allo stagionale
```
L'annullamento parziale è ammesso: se in `[10–15]` è stato venduto solo il 12,
lo stagionale può annullare `[10–11]` e `[13–15]`, non il 12.

### `RD-04` — Casi limite da coprire con test
1. Modifica del periodo di una prenotazione esistente che crea overlap → rifiuto.
2. Annullamento prenotazione su giorno di assenza stagionale → il giorno torna
   `TEMP_DISPONIBILE`, il credito maturato viene stornato.
3. Ritorno anticipato dello stagionale su giorno già rivenduto → policy `D-01`.
4. Due operatori che prenotano lo stesso ombrellone nello stesso istante →
   uno solo vince, l'altro riceve un errore comprensibile.
5. Spostamento di un cliente su un altro ombrellone → transazione unica, non
   "cancella + ricrea" (che lascerebbe una finestra vendibile).
6. Assenza dichiarata su un giorno già occupato da una prenotazione dello
   stagionale stesso → coerenza.
7. Contratto stagionale che inizia a stagione già avviata su ombrellone con
   prenotazioni giornaliere future → rifiuto o segnalazione esplicita.
8. Cambio fuso/ora legale: le date sono `DATE`, mai `TIMESTAMP`, per i periodi
   di soggiorno.

---

## 7. Modello dati (entità richieste)

`BeachClub` · `User` · `BeachMap` · `Zone` · `Umbrella` · `Customer` ·
`SeasonalContract` · `SeasonalAbsence` · `Reservation` · `ReservationItem` ·
`PriceRule` · `Payment` · `CustomerPreference` · `CreditTransaction` · `AuditLog`

Vincoli obbligatori:
- Ogni tabella di dominio ha `beach_club_id` non nullo e indicizzato.
- `Umbrella`: unique `(beach_club_id, visible_number)`.
- `Customer`: unique `(beach_club_id, phone_normalized)`.
- `ReservationItem`: vincolo di esclusione di `RD-02`.
- `SeasonalAbsence`: nessun overlap per lo stesso contratto.
- `AuditLog`: append-only, mai aggiornato o cancellato.
- Date di soggiorno come `DATE`, timestamp di sistema come `TIMESTAMPTZ`.

---

## 8. Stack tecnologico

Preferenza indicata, non vincolo assoluto. Ogni scostamento va motivato in
`DECISIONS.md`.

- **Frontend:** Next.js (App Router) + TypeScript + PWA installabile
- **Backend:** TypeScript, dominio isolato dalla UI, API REST versionate `/api/v1`
- **Database:** PostgreSQL (i vincoli di `RD-02` richiedono Postgres)
- **ORM:** Prisma, con SQL grezzo dove serve per `EXCLUDE`/`gist`
- **Auth:** soluzione moderna e sicura; magic link per l'area stagionale
- **Deploy:** cloud, ambienti separati development / staging / production

Struttura a strati obbligatoria:
```
app/          UI (Next.js) — nessuna logica di dominio
domain/       regole pure, testabili senza database
  availability/  pricing/  reservation/  seasonal/
server/       API, transazioni, autorizzazione, audit
db/           Prisma schema, migrazioni, seed
```
Il livello `domain/` non importa mai Prisma né React.

---

## 9. Requisiti non funzionali

- `NF-01` Azioni principali percepite sotto i **500 ms**. La mappa non fa un
  refresh completo dopo un'operazione: aggiornamento ottimistico + riconciliazione.
- `NF-02` Rete instabile: nessuna perdita dati, stato di sincronizzazione
  visibile, retry disponibile, mai ambiguità sul fatto che un'operazione sia
  stata salvata. Offline-first completo **non** è richiesto nell'MVP.
- `NF-03` Sicurezza: protezione accessi, gestione sessioni, rate limiting,
  validazione input lato server su ogni endpoint, logging errori, backup DB.
- `NF-04` Isolamento multi-tenant verificato da test automatici dedicati.
- `NF-05` GDPR: dati minimi, cancellazione/anonimizzazione cliente, export dati,
  registrazione consensi dove richiesti.
- `NF-06` Accessibilità: contrasto AA, stato mai comunicato dal solo colore,
  target touch ≥ 44 px, navigabilità da tastiera sul desktop.

---

## 10. Scenari da ottimizzare (criteri misurabili)

| # | Scenario | Criterio di accettazione |
|---|---|---|
| A | "Avete un ombrellone libero oggi?" | Risposta visibile all'apertura dell'app, 0 click |
| B | "Due ombrelloni vicini dal 10 al 15 agosto" | Dalla home alla proposta di coppie adiacenti in ≤ 4 interazioni |
| C | Stagionale: "domani non vengo" | ≤ 3 tap dall'area cliente, conferma immediata |
| D | Giornaliero prenota il posto dello stagionale assente | Il posto compare in ricerca marcato "temporaneo"; il diritto dello stagionale sugli altri giorni resta intatto |
| E | Cliente abituale telefona | Digitando telefono o nome: storico, preferenze, ultimi ombrelloni in una schermata |
| F | Il gestore guarda la mappa alle 09:30 | Libero / occupato / stagionale assente / vendibile distinguibili in ≤ 5 secondi, senza click |

---

## 11. Dati demo

Stabilimento demo realistico: **80–100 ombrelloni** su più file, con zone,
passerelle e aree non prenotabili. Popolato con clienti stagionali, giornalieri,
prenotazioni passate e future, assenze dichiarate e disponibilità temporanee
attive. Il seed è deterministico (seed fissa) per rendere i test riproducibili.

Una demo con 5 ombrelloni non dice nulla su UX e performance: è vietata.

---

## 12. Fasi di lavoro e gate

Ogni fase si chiude con un **gate**: finché il gate non è superato, non si passa
alla fase successiva.

| Fase | Contenuto | Gate di uscita |
|---|---|---|
| **F1 — Specification** | Analisi, criticità, architettura, stack motivato, modello dati, ruoli/permessi, sitemap, elenco schermate, wireframe descrittivi, flussi dei 6 scenari, logica stagionale→assenza→rivendita, gestione conflitti, struttura MVP, roadmap, criteri di accettazione | Documenti in `docs/` completi e `DECISIONS.md` senza decisioni bloccanti aperte |
| **F2 — UX** | Schermate e flussi principali, layout desktop/tablet/mobile | Ogni scenario A–F percorribile su carta |
| **F3 — Data model** | Schema Prisma, migrazioni, vincoli `RD-02`, seed demo | Migrazione applicata + test che dimostrano l'impossibilità di overlap |
| **F4 — Architecture** | Struttura a strati, auth, autorizzazione, audit, deploy | Skeleton che builda, CI verde, ambienti configurati |
| **F5 — Prototype** | Mappa funzionante + prenota/libera/assegna su dati demo | Scenario A e F dimostrabili |
| **F6 — MVP** | Tutti gli `MVP-xx` | Criteri di accettazione sotto |
| **F7 — Test** | Unit, integration, E2E, test reali dei flussi | Suite verde in CI |

**La FASE 1 non produce codice applicativo.** Nessun file in `app/` o `domain/`
prima che il gate F1 sia superato.

---

## 13. Criteri di accettazione dell'MVP

L'MVP è accettato quando, su dati demo da 80–100 ombrelloni:

1. Un operatore mai formato prima assegna un ombrellone libero a un cliente
   nuovo in meno di 60 secondi, senza istruzioni.
2. Lo scenario B produce proposte di ombrelloni adiacenti corrette e verificabili.
3. Una doppia prenotazione concorrente sullo stesso ombrellone è impossibile,
   dimostrato da un test automatico che spara richieste in parallelo.
4. Il ciclo completo stagionale → assenza → rivendita → credito → rientro
   automatico funziona end-to-end e ha test per ogni transizione di `RD-03`.
5. Tutti i casi limite di `RD-04` hanno un test che passa.
6. L'isolamento multi-tenant è dimostrato: un utente del club A non raggiunge
   nessun dato del club B, verificato a livello di API.
7. L'app è installabile come PWA e usabile su tablet in verticale e orizzontale.
8. Ogni operazione critica compare nell'audit log con stato prima/dopo.
9. La dashboard giornaliera quadra con la somma delle prenotazioni del giorno.
10. Con rete simulata instabile nessuna operazione risulta persa o ambigua.

---

## 14. Roadmap post-MVP (non iniziare)

`R1` Offline-first PWA con coda di sincronizzazione
`R2` Notifiche reali (email → WhatsApp Business → push)
`R3` Pagamenti online (Stripe / Nexi)
`R4` Applicazione automatica delle preferenze cliente nella ricerca
`R5` Mezza giornata e fasce orarie
`R6` Statistiche stagionali e previsione occupazione
`R7` API pubbliche di disponibilità → marketplace multi-stabilimento
`R8` Lettini, sdraio, servizi accessori
