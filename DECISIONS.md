# Registro delle decisioni

Stati: `APERTA` · `DECISA` · `SUPERATA`.
Le decisioni marcate **DECISIONE RICHIESTA** bloccano il lavoro e richiedono una
risposta dell'utente.

Le decisioni `DECISA` in FASE 1 sono state prese secondo `AGENT_PROTOCOL.md` §11:
scelta la soluzione più sensata, motivata, e segnalata. Restano contestabili —
cambiarle ora costa poco, dopo F3 costa una migrazione.

| ID | Argomento | Stato |
|---|---|---|
| `D-01` | Conflitto assenza già rivenduta | DECISA |
| `D-02` | Granularità della prenotazione | DECISA |
| `D-03` | Unità del credito | DECISA |
| `D-04` | Identificativo cliente | DECISA |
| `D-05` | Auth area stagionale | DECISA |
| `D-06` | Enforcement no-overlap | DECISA |
| `D-07` | Monolite vs backend separato | DECISA |
| `D-08` | Strategia multi-tenant | DECISA |
| `D-09` | Hosting e database | DECISA in parte — fornitore da scegliere in F4 |
| `D-10` | Stato ombrellone derivato | DECISA |
| `D-11` | Entità `Season` | DECISA |
| `D-12` | Cutoff per le assenze | DECISA — default da confermare |
| `D-13` | Tetto al credito stagionale | DECISA — default da confermare |
| `D-14` | Chiavi esterne composte | DECISA |
| `D-15` | `visible_number` testuale | DECISA |
| `D-16` | Dove vivono i vincoli: schema Prisma vs SQL grezzo | DECISA |
| `D-17` | Regola di dipendenza verificata da test invece che da lint | DECISA |
| `D-18` | Entità `Session` per le sessioni staff revocabili | DECISA |

---

### D-01 — Stagionale che annulla un'assenza il cui giorno è già stato rivenduto
**Stato:** DECISA (2026-09-06) · confermata dall'utente: «chi ha pagato tiene il posto»

Lo stagionale dichiara "il 12 agosto non vengo". Il gestore vende il posto. Il
10 agosto lo stagionale cambia idea. Due clienti, un ombrellone.

**Scelta: `IRREVOCABLE` come default, configurabile per stabilimento.**
Chi ha pagato tiene il posto; lo stagionale conserva il credito e riceve, se
disponibile, un ombrellone alternativo per quel giorno.

**Motivo.** Non è una questione di equità astratta ma del comportamento del
gestore: se sa di poter essere costretto a disdire a un cliente che ha già
pagato ed è magari già arrivato, non rivenderà mai il posto — e l'unica funzione
che genera ricavo aggiuntivo smette di esistere. Alternative disponibili come
configurazione: `SEASONAL_PRIORITY` e `MANUAL`, mai automatiche.

**Confermato contestualmente** il principio di maturazione del credito già
previsto in `RF-CRD-01` e `docs/08` §5.2: il credito matura **solo se il gestore
riesce effettivamente a rivendere** il posto liberato. Se l'ombrellone resta
vuoto, nessun credito. Vincolo K-04 (`docs/08` §7.2): il credito si calcola sui
giorni realmente rivenduti, mai sull'intervallo dichiarato.

Analisi completa in `docs/08` §8.

---

### D-02 — Granularità della prenotazione
**Stato:** DECISA (2026-09-05)

Giornata intera. Intervalli inclusivi `[start_date, end_date]`: il 10–12 agosto
sono tre giorni, come dice il gestore. Il modello resta compatibile con una
colonna `slot` (default `FULL_DAY`) per le mezze giornate future (`R5`).

### D-03 — Unità del credito stagionale
**Stato:** DECISA (2026-09-05)

**Euro**, non punti. Default: 30% dell'incasso della rivendita, configurabile.
I punti richiedono un tasso di conversione che nessuno ha definito e complicano
la conversazione con il cliente. `CreditTransaction` memorizza `amount` + `unit`,
quindi passare a punti resta un cambio di configurazione, non di schema.

### D-04 — Identificativo operativo del cliente
**Stato:** DECISA (2026-09-05)

Telefono normalizzato E.164, unique `(beach_club_id, phone_normalized)`. È il
dato che il gestore ha sempre e con cui cerca mentre è al telefono. I duplicati
non danno errore secco: propongono l'unione.

### D-05 — Autenticazione dell'area stagionale
**Stato:** DECISA (2026-09-05)

Magic link senza password: token ≥ 32 byte, memorizzato hashato, legato al
contratto, valido per la stagione, revocabile. Superficie minima (`docs/02` §4.2)
per contenere il rischio del link inoltrato su WhatsApp (`C-06`).

### D-06 — Come si impedisce l'overlap
**Stato:** DECISA (2026-09-05)

Vincolo di esclusione PostgreSQL (`btree_gist` + `EXCLUDE`) **oltre** ai
controlli applicativi. Il solo controllo applicativo lascia passare due richieste
concorrenti. Vincola a PostgreSQL: accettato, ed è già la preferenza del brief.

### D-07 — Monolite Next.js vs backend separato
**Stato:** DECISA (2026-09-05)

Applicazione Next.js unica, API sotto `/api/v1`, logica in un livello `domain/`
isolato da framework e ORM. Un backend separato aggiungerebbe deploy,
autenticazione fra servizi e latenza senza benefici a questa scala; l'isolamento
del dominio consente comunque di estrarlo in futuro senza riscrivere le regole.

### D-08 — Strategia multi-tenant
**Stato:** DECISA (2026-09-05)

Database unico, `beach_club_id` ovunque, scoping forzato dal repository layer,
lint rule contro l'uso diretto di Prisma, test di isolamento automatici. Le
risorse di altri tenant rispondono 404, mai 403. RLS come rinforzo successivo.

### D-09 — Hosting e database
**Stato:** DECISA in parte (2026-09-05)

Deciso: PostgreSQL gestito con estensioni abilitate (`btree_gist` è vincolante),
tre ambienti separati, backup automatici con ripristino a un punto nel tempo.
Da decidere in F4: il fornitore, in base ai costi e a dove l'utente ha già
account. L'applicazione non dipende da servizi proprietari.

### D-10 — Lo stato dell'ombrellone è derivato, non persistito
**Stato:** DECISA (2026-09-05)

Uno stato persistito si disallinea al primo caso limite e il disallineamento si
manifesta come doppia vendita davanti al cliente. La derivazione costa
microsecondi su 96 ombrelloni ed elimina la necessità di un processo notturno
per il rientro degli stagionali (`docs/08` §5.3). Unico stato memorizzato:
`Umbrella.blocked`, che non è derivabile da nulla.

### D-11 — Introdurre l'entità `Season`
**Stato:** DECISA (2026-09-05) · nata dall'analisi, non prevista dal brief

Senza `Season` un contratto stagionale non ha contenitore temporale, il listino
non distingue gli anni, lo storico si mescola e il rinnovo annuale (`R9`) diventa
una migrazione manuale. Aggiungerla dopo tocca quasi tutte le tabelle;
aggiungerla ora costa una colonna. Vedi `C-01` e `docs/03` §3.2.

### D-12 — Orario di taglio per le assenze
**Stato:** DECISA (2026-09-05) · **default da confermare**

Un'assenza dichiarata alle 11:30 di ferragosto libera un posto che nessuno
comprerà più: i clienti sono arrivati alle 9. Se il sistema accredita comunque
un credito, lo stabilimento paga per nulla.

**Default proposto:** entro le 20:00 del giorno precedente, nel fuso dello
stabilimento. Dopo il taglio l'assenza si registra comunque — al gestore serve
saperlo — ma con `is_late = true` e senza maturazione di credito, e la UI lo dice
**prima** della conferma. Configurabile. Vedi `C-02` e `docs/08` §4.2.

### D-13 — Tetto al credito stagionale
**Stato:** DECISA (2026-09-05) · **default da confermare**

Un credito senza limite incentiva le assenze speculative ("dichiaro, tanto se poi
vengo annullo"), che producono posti mostrati come vendibili e poi ritirati.

**Default proposto:** tetto stagionale configurabile al credito maturabile per
contratto, più il conteggio delle assenze annullate visibile al gestore. Il
credito matura comunque solo a rivendita avvenuta, che è già il freno principale.
Vedi `C-03` e `docs/08` §7.2.

### D-14 — Chiavi esterne composte per l'integrità tenant
**Stato:** DECISA (2026-09-05)

Ogni FK che attraversa entità include `beach_club_id`, così il database stesso
impedisce di collegare righe di tenant diversi. Costa un indice unique
`(beach_club_id, id)` per tabella e rende **strutturalmente impossibile** l'errore
più grave del sistema. Vedi `docs/03` §5.7.

### D-15 — `visible_number` è testo, non intero
**Stato:** DECISA (2026-09-05)

Esistono ombrelloni `63A`, `12bis`, numerazioni con lettera di fila. Un intero
renderebbe impossibile rappresentare mappe reali e costringerebbe a una
migrazione al primo stabilimento con numerazione irregolare. Vedi `C-07`.

### D-16 — I vincoli che Prisma conosce vanno nello schema, non nella migrazione
**Stato:** DECISA (2026-09-06) · scoperta durante F3

Le chiavi esterne composte di `D-14` erano state scritte come SQL grezzo in
coda alla migrazione. Prisma le ha rimosse al primo `migrate dev`: riconcilia
il database sullo schema, e ciò che non è nello schema sparisce.

Era un guasto silenzioso grave: la garanzia di isolamento tenant sarebbe
evaporata al primo cambio di schema fatto mesi dopo, senza alcun errore.

**Regola.** Ciò che Prisma modella (relazioni, unique, indici) sta nello
schema. Ciò che non modella (`EXCLUDE`, trigger, indici GiST parziali,
estensioni) resta in SQL in coda alla migrazione e sopravvive.

**Conseguenza pratica.** Gli item di prenotazione non si creano annidati sotto
`reservation`: `beachClubId` fa parte della relazione composta e Prisma lo
esclude dal create annidato. Si crea prima la testata, poi gli item. Vedi
`db/seed.ts`.

### D-17 — La regola di dipendenza è verificata da un test, non da una lint rule
**Stato:** DECISA (2026-09-06)

`docs/02` prevedeva una lint rule ESLint per impedire l'import di Prisma fuori
dal repository layer. Un test (`tests/architecture.test.ts`) dà la stessa
garanzia, gira nella stessa pipeline e non richiede di configurare e mantenere
un plugin ESLint dedicato. Se in futuro il progetto adotterà ESLint per altri
motivi, la regola potrà essere aggiunta lì senza rimuovere il test.

### D-18 — Entità `Session`
**Stato:** DECISA (2026-09-06) · implementata con `F4-01`

`docs/02` §4.1 richiede sessioni staff **revocabili dall'admin**. Una sessione
revocabile non può essere un token autoconsistente: serve una riga da
cancellare. Il modello dati di `docs/03` non prevede `Session`.

**Scelta:** tabella `Session` con `id`, `beachClubId`, `userId`, `tokenHash`,
`expiresAt`, `lastSeenAt`, `revokedAt`, `userAgent`, `ip`. Del token si
conserva solo l'hash, come per il magic link.

**Conseguenza pratica.** La scadenza è lunga (30 giorni) di proposito:
l'operatore non vuole rifare il login ogni mattina, e una sessione corta gli
farebbe perdere dati a metà prenotazione. La protezione contro il tablet
lasciato incustodito è il blocco con PIN (`F6-32`), non una sessione breve.
