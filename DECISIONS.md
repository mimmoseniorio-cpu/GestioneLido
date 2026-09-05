# Registro delle decisioni

Stati: `APERTA` · `DECISA` · `SUPERATA`.
Le decisioni marcate **DECISIONE RICHIESTA** bloccano il lavoro e richiedono
una risposta dell'utente. Per ognuna c'è già una proposta: basta approvarla.

---

### D-01 — Stagionale che annulla un'assenza il cui giorno è già stato rivenduto
**Stato:** APERTA · **DECISIONE RICHIESTA** · blocca `RF-SEA-05`, `RD-03`

**Contesto.** Lo stagionale dichiara "il 12 agosto non vengo". Il gestore vende
il posto a un giornaliero. Il 10 agosto lo stagionale cambia idea. Due clienti,
un ombrellone. Qualcuno resta scontento: la policy decide chi.

**Opzioni**
- **A — Assenza irrevocabile una volta venduta.** Chi ha pagato tiene il posto.
  Lo stagionale riceve il credito maturato, eventualmente maggiorato, e la
  proposta di un ombrellone alternativo equivalente se disponibile.
- **B — Priorità allo stagionale.** Il giornaliero viene ricollocato o rimborsato.
- **C — Configurabile per stabilimento**, con default A.

**Proposta: C con default A.** L'irrevocabilità è l'unica regola che rende
l'assenza vendibile con serenità: se il gestore teme di dover disdire a un
cliente pagante, non rivenderà mai il posto e la funzione più distintiva del
prodotto muore. Il credito maggiorato compensa lo stagionale. La configurabilità
costa poco ora e molto dopo.

---

### D-02 — Granularità della prenotazione
**Stato:** APERTA · proposta pronta

**Proposta:** giornata intera nell'MVP. Intervalli inclusivi `[start_date, end_date]`.
Il modello dati resta compatibile con l'aggiunta futura di fasce (mattina/pomeriggio)
tramite una colonna `slot` con default `FULL_DAY`.

---

### D-03 — Unità del credito stagionale
**Stato:** APERTA · proposta pronta

**Proposta:** **euro**, non punti. Il calcolo di default è una percentuale
configurabile dell'incasso della rivendita (default suggerito: 30%). I punti
richiedono un tasso di conversione che nessuno ha ancora definito e complicano
la conversazione con il cliente. `CreditTransaction` memorizza comunque
`amount` + `unit`, quindi passare a punti in futuro non è un cambio strutturale.

---

### D-04 — Identificativo operativo del cliente
**Stato:** APERTA · proposta pronta

**Proposta:** telefono normalizzato in formato E.164, con unique
`(beach_club_id, phone_normalized)`. È il dato che il gestore ha sempre e con
cui cerca al telefono. Email opzionale. Duplicati bloccati con proposta di
merge invece che errore secco.

---

### D-05 — Autenticazione dell'area stagionale
**Stato:** APERTA · proposta pronta

**Proposta:** magic link senza password. Token lungo, legato al contratto
stagionale, valido per la stagione, revocabile dal gestore. Il link si manda
via WhatsApp. Nessuna password da ricordare per un cliente che usa il servizio
tre volte in un'estate.

---

### D-06 — Come si impedisce l'overlap
**Stato:** APERTA · proposta pronta

**Proposta:** vincolo di esclusione PostgreSQL (`btree_gist` + `EXCLUDE`), come
in `RD-02` del brief, **oltre** ai controlli applicativi. Il solo controllo
applicativo lascia passare due richieste concorrenti. Questa scelta vincola a
PostgreSQL: è accettabile e già nelle preferenze.

---

### D-07 — Monolite Next.js vs backend separato
**Stato:** APERTA · proposta pronta

**Proposta:** applicazione Next.js unica con API routes versionate sotto
`/api/v1`, e logica di dominio in un livello `domain/` completamente isolato
dal framework. Un backend separato aggiunge deploy, autenticazione fra servizi
e latenza senza portare nulla a uno stabilimento con qualche decina di utenti.
L'isolamento del livello `domain/` rende comunque possibile estrarre un
servizio in futuro senza riscrivere le regole.

---

### D-08 — Strategia multi-tenant
**Stato:** APERTA · proposta pronta

**Proposta:** database unico, colonna `beach_club_id` su ogni tabella di
dominio, scoping forzato in un repository layer che rende impossibile scrivere
una query non filtrata, più test automatici di isolamento. Row Level Security
di Postgres come rinforzo successivo, non come unica difesa nell'MVP.

---

### D-09 — Hosting e database
**Stato:** APERTA · proposta pronta

**Proposta:** deploy su piattaforma serverless per il frontend/API e Postgres
gestito, con tre ambienti separati (development, staging, production) e backup
automatici. Scelta del fornitore da confermare in F4 in base a costi e a dove
l'utente ha già account. Vincolo: il fornitore deve supportare estensioni
Postgres (`btree_gist`), altrimenti `D-06` non è applicabile.

---

### D-10 — Lo stato dell'ombrellone è derivato, non persistito
**Stato:** DECISA (2026-09-05)

**Motivo.** Uno stato persistito si disallinea al primo caso limite (modifica
periodo, annullamento, ritorno anticipato dello stagionale) e il disallineamento
si manifesta come doppia vendita davanti al cliente. La derivazione ha un costo
di calcolo trascurabile su 100 ombrelloni e si può memoizzare per giornata.

**Conseguenze.** Nessuna colonna `status` su `Umbrella` se non `blocked`.
La funzione `statoOmbrellone(umbrellaId, data)` di `RD-01` è il punto unico di
verità ed è coperta da test esaustivi.
