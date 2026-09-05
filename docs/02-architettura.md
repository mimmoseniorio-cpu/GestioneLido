# 02 — Architettura e stack

**Fase:** F1 · **Stato:** completo

---

## 1. Forma dell'applicazione

**Applicazione Next.js unica** (App Router, TypeScript), con la logica di
dominio isolata in un livello che non conosce né il framework né il database.

```
┌─────────────────────────────────────────────────────┐
│  app/            React Server Components + client   │
│                  Nessuna regola di business          │
├─────────────────────────────────────────────────────┤
│  server/         API /api/v1, autenticazione,        │
│                  autorizzazione, transazioni, audit  │
├─────────────────────────────────────────────────────┤
│  domain/         Regole pure. Nessun import di       │
│                  Prisma, React, o oggetti HTTP.      │
│                  availability · pricing ·            │
│                  reservation · seasonal · credit     │
├─────────────────────────────────────────────────────┤
│  db/             Prisma schema, migrazioni, seed     │
└─────────────────────────────────────────────────────┘
```

**Regola di dipendenza:** le frecce puntano solo verso il basso, e `domain/` non
punta a nulla. Un test di `domain/` gira in millisecondi senza database.

Questa è l'unica decisione architetturale che conta davvero: rende le regole di
`RD-01`…`RD-04` testabili in modo esaustivo e permette, in futuro, di esporre le
disponibilità come API pubbliche (`R7`) senza toccare la logica.

### Perché non un backend separato → `D-07`

Un servizio backend distinto aggiunge un deploy, autenticazione fra servizi,
latenza di rete interna e un contratto da mantenere. In cambio darebbe
scalabilità indipendente e riuso da più client — cose di cui uno stabilimento
con 2 operatori non ha bisogno, e che il livello `domain/` isolato permette
comunque di ottenere dopo, estraendolo, senza riscrivere le regole.

Il monolite non è una scorciatoia: è la scelta corretta a questa scala.

---

## 2. Database

**PostgreSQL.** Non è una preferenza: è un vincolo derivato da `RD-02`.
Il divieto di sovrapposizione richiede il vincolo di esclusione
`EXCLUDE USING gist` con l'estensione `btree_gist`, che MySQL e SQLite non hanno.

Senza quel vincolo il divieto di doppia prenotazione vive solo nel codice
applicativo, e due richieste concorrenti lo attraversano entrambe. Questa è
esattamente la classe di bug che si manifesta davanti al cliente, in agosto,
alle 10 del mattino.

**ORM: Prisma**, con SQL grezzo nelle migrazioni dove serve (`CREATE EXTENSION`,
`EXCLUDE`, indici GiST) — cose che Prisma non modella nativamente ma che
convivono benissimo con esso.

### Conseguenza sull'hosting → `D-09`
Il fornitore del database deve permettere `CREATE EXTENSION btree_gist`. Va
verificato **prima** di scegliere, non dopo. Se un fornitore non lo consente, è
escluso: non si negozia su `RD-02`.

---

## 3. Multi-tenancy → `D-08`

Database unico, colonna `beach_club_id` su ogni tabella di dominio.

L'isolamento non è affidato alla disciplina di chi scrive le query. Tutte le
letture e scritture passano da un **repository layer** che riceve il contesto
tenant e lo applica:

```ts
// server/context.ts — il tenant arriva dalla sessione, mai dal client
type TenantContext = { beachClubId: string; userId: string; role: Role }

// Nessuna funzione del repository accetta una query senza contesto.
findUmbrellas(ctx, filter)   // ✅  filtra sempre per ctx.beachClubId
prisma.umbrella.findMany()   // ❌  vietato fuori dal repository layer
```

Rinforzi:
- lint rule che vieta l'import di `prisma` fuori da `db/` e `server/repositories/`;
- test di isolamento automatici (`NF-04`): un utente del club A che tenta ogni
  endpoint con id del club B riceve 404, mai 403 — non deve nemmeno poter
  dedurre l'esistenza della risorsa;
- Row Level Security PostgreSQL come rinforzo successivo, non come unica difesa.

Il `beach_club_id` **non arriva mai dal client**: si deriva dalla sessione.

---

## 4. Autenticazione e autorizzazione

Due percorsi distinti, con superfici diverse.

### 4.1 Staff (ADMIN, OPERATORE)
Email + password, sessione con cookie `httpOnly` `SameSite=Lax`, rotazione del
token, scadenza lunga (l'operatore non vuole rifare login ogni mattina) ma
revocabile dall'admin.

Il tablet della reception resta acceso tutto il giorno: prevedere un **blocco
schermo con PIN** a livello applicativo, così chiunque passi non accede
all'anagrafica clienti. Costo basso, valore reale.

### 4.2 Cliente stagionale → `D-05`
Magic link: token opaco lungo (≥ 32 byte casuali), memorizzato **hashato**,
legato al `SeasonalContract`, valido per la stagione, revocabile dal gestore.

Superficie deliberatamente minima (vedi `C-06`): l'area stagionale può leggere
solo il proprio ombrellone, calendario, assenze e credito, e può fare una sola
scrittura — dichiarare o annullare un'assenza. Non espone anagrafica, telefono,
storico pagamenti, né alcuna azione distruttiva.

### 4.3 Autorizzazione
Controllo a livello di **caso d'uso**, non di rotta: ogni funzione di `server/`
dichiara il permesso richiesto e lo verifica prima di eseguire. La matrice
completa è in `docs/04`.

---

## 5. API

REST versionate sotto `/api/v1`, orientate ai casi d'uso reali e non alle tabelle.

```
GET    /api/v1/map?date=2027-08-12          stato completo mappa per un giorno
GET    /api/v1/availability?from&to&qty&…   ricerca disponibilità
POST   /api/v1/reservations                 crea prenotazione
PATCH  /api/v1/reservations/:id             modifica (periodo, ombrellone, note)
DELETE /api/v1/reservations/:id             annulla
POST   /api/v1/seasonal-absences            dichiara assenza
DELETE /api/v1/seasonal-absences/:id        annulla assenza (se ammesso)
GET    /api/v1/umbrellas/:id/calendar       calendario di un ombrellone
GET    /api/v1/customers/search?q=          ricerca cliente
POST   /api/v1/payments                     registra pagamento
GET    /api/v1/dashboard?date=              contatori del giorno
GET    /api/v1/search?q=                    ricerca globale
```

Le API sono già pensate per il futuro marketplace (`R7`): `GET /availability`
non dipende dalla sessione staff e può diventare pubblica per un `beachClubId`
esplicito, con un rate limit diverso, senza riscrittura.

**Nessuna logica di dominio negli handler.** L'handler valida l'input, apre la
transazione, chiama il caso d'uso, mappa l'errore di dominio in HTTP.

### 5.1 Errori
Errori di dominio tipizzati, mai un 500 generico:

```json
{ "error": "UMBRELLA_NOT_AVAILABLE",
  "message": "L'ombrellone 63 è già prenotato dal 10 al 12 agosto.",
  "details": { "umbrellaId": "…", "conflictingDates": ["2027-08-10","2027-08-12"] } }
```

La violazione del vincolo PostgreSQL `no_overlap` viene intercettata e tradotta
in `UMBRELLA_NOT_AVAILABLE`. L'operatore deve leggere una frase comprensibile,
non un codice di errore del database.

### 5.2 Idempotenza → risolve `C-05`
Ogni `POST` e `PATCH` accetta un header `Idempotency-Key` generato dal client.
La chiave, con la risposta prodotta, viene memorizzata per 24 ore: una seconda
richiesta con la stessa chiave restituisce la stessa risposta senza rieseguire
l'operazione.

Questo elimina il doppio incasso e la doppia prenotazione da doppio tap su rete
lenta — lo scenario più probabile di `NF-02`.

---

## 6. Strategia rete instabile e percezione di velocità → `NF-01`, `NF-02`

Il target di 500 ms non si raggiunge rendendo il server più veloce, ma
**togliendo il server dal percorso percepito**.

1. **Mappa in un solo fetch.** `GET /map?date=` restituisce tutti gli ombrelloni
   con lo stato già derivato per quella data. Un round-trip, non uno per
   ombrellone. Payload stimato per 100 ombrelloni: ~30 KB, trascurabile.
2. **Aggiornamento ottimistico.** L'azione si riflette subito nella UI; la
   risposta del server riconcilia. In caso di errore, la UI torna indietro e
   mostra il motivo.
3. **Stato di sincronizzazione sempre visibile.** Tre soli stati, con icona
   persistente: `sincronizzato` · `in corso` · `non salvato`. Mai ambiguità
   sul fatto che un'operazione sia andata a buon fine (`NF-02`).
4. **Retry automatico** con backoff sulle scritture fallite per rete, protetto
   dall'idempotenza. Se dopo i tentativi non passa, l'operazione resta in una
   coda visibile con un pulsante "riprova".
5. **Cambio data senza ricaricare.** I giorni adiacenti a quello visualizzato
   vengono precaricati: scorrere tra ieri, oggi e domani è istantaneo.

Ciò che **non** facciamo nell'MVP: coda offline persistente e risoluzione dei
conflitti a riconnessione (`R1`). Sarebbe l'architettura più costosa del
progetto, per un caso — reception senza rete per minuti — che non è quello
dominante.

---

## 7. Frontend

- **Next.js App Router + TypeScript.** Server Components per le viste di lettura
  (dashboard, calendario, liste), client components dove serve interazione ricca
  (mappa, pannello rapido).
- **PWA installabile** (`MVP-16`): manifest, service worker per la shell
  applicativa e gli asset. Il service worker **non** fa caching delle
  disponibilità: dati di occupazione serviti da cache sono peggio di nessun dato,
  perché portano a vendere un posto già venduto.
- **Stato server** gestito con una libreria di data-fetching con cache e
  invalidazione (React Query o equivalente): risolve nativamente aggiornamento
  ottimistico, retry e riconciliazione del §6.
- **La mappa** è resa in **SVG**, non con div posizionati: pan e zoom nativi,
  scala su qualunque densità di schermo, un solo elemento DOM per ombrellone,
  fluida anche con 300 ombrelloni. Canvas darebbe più performance ma perderebbe
  accessibilità e gestione eventi gratuita; a queste dimensioni non serve.

### Accessibilità → `NF-06`
Ogni stato ombrellone è codificato da **tre** segnali simultanei: colore,
icona, trattamento del bordo (pieno / tratteggiato / doppio). Verificato con
simulazione di daltonismo e in condizioni di luce forte. Contrasto minimo AA.
Target touch ≥ 44 px effettivi anche quando lo zoom della mappa è ridotto.

---

## 8. Ambienti e deploy → `D-09`

Tre ambienti separati, con database distinti:

| Ambiente | Scopo | Dati |
|---|---|---|
| development | sviluppo locale | seed demo deterministico |
| staging | verifica pre-rilascio, prove del gestore | copia del seed demo |
| production | stabilimento reale | dati reali, backup automatici |

Requisiti del fornitore, in ordine di priorità:
1. PostgreSQL con estensioni (`btree_gist`) — vincolante;
2. backup automatici con ripristino a un punto nel tempo;
3. deploy per branch (anteprima delle pull request);
4. costo contenuto a questa scala.

La scelta puntuale del fornitore si chiude in F4, quando sappiamo dove l'utente
ha già account. L'applicazione non dipende da servizi proprietari: la
migrazione, se serve, è un cambio di stringa di connessione.

### CI
Su ogni push: typecheck, lint, unit test, integration test su un PostgreSQL
effimero, build. Nessun merge su `main` con la pipeline rossa.

---

## 9. Sicurezza → `NF-03`

| Area | Misura |
|---|---|
| Sessioni | Cookie `httpOnly`, `Secure`, `SameSite=Lax`; rotazione; revoca lato admin |
| Password staff | Hash Argon2id; requisiti minimi; nessun limite di lunghezza |
| Magic link | Token ≥ 32 byte, memorizzato hashato, scadenza a fine stagione, revocabile |
| Rate limiting | Per IP e per account su login, ricerca, magic link; più severo sugli endpoint pubblici |
| Validazione | Schema Zod su ogni input, lato server, sempre — anche dove la UI valida già |
| Autorizzazione | Verificata nel caso d'uso, non nella rotta |
| Isolamento tenant | Repository layer + test automatici; risorse di altri tenant restituiscono 404 |
| Segreti | Solo variabili d'ambiente; nel repo esiste unicamente `.env.example` |
| Log | Errori strutturati con id di correlazione; **mai** dati personali nei log |
| Backup | Automatici e con ripristino verificato almeno una volta prima del rilascio |

---

## 10. GDPR → `NF-05`

- **Minimizzazione.** Si raccolgono nome, cognome, telefono. Email e note sono
  opzionali. Nessuna data di nascita, nessun indirizzo, nessun documento.
- **Cancellazione e anonimizzazione.** Un cliente si anonimizza, non si cancella:
  i dati personali vengono sostituiti (`Cliente anonimizzato #1234`), le
  prenotazioni restano per la contabilità e le statistiche. La cancellazione
  fisica romperebbe lo storico e l'audit.
- **Export.** Endpoint che produce tutti i dati di un cliente in JSON.
- **Consensi.** Registrati con testo, versione e data, quando raccolti.
- **Audit log.** È un registro di operazioni, non un profilo comportamentale:
  contiene l'id dell'operatore, non dati del cliente oltre il riferimento.
- **Conservazione.** Politica di retention configurabile per stagione; i dati
  delle stagioni chiuse possono essere anonimizzati in blocco.

---

## 11. Test → `docs/10` per il dettaglio

| Livello | Cosa copre | Dove |
|---|---|---|
| Unit | Regole pure: `statoOmbrellone`, motore prezzi, punteggio adiacenza, macchina a stati assenze | `domain/` |
| Integration | Vincoli del database, transazioni, isolamento tenant, concorrenza reale | `server/` + Postgres effimero |
| E2E | I sei scenari A–F su dati demo realistici | Playwright |

Il test che conta più di tutti: **due richieste in parallelo sullo stesso
ombrellone per lo stesso periodo — una sola deve riuscire.** È il test che
dimostra che `RD-02` funziona davvero, ed è nei criteri di accettazione.

---

## 12. Scelte deliberatamente rimandate

| Cosa | Perché non ora |
|---|---|
| Coda offline persistente | Costo alto, caso d'uso non dominante → `R1` |
| Notifiche reali | Serve solo l'astrazione `NotificationPort` con implementazione a log → `R2` |
| Gateway di pagamento | `Payment` ha già `method` e `provider_ref` nullable → `R3` |
| Row Level Security | Il repository layer + i test coprono l'MVP; RLS è rinforzo successivo |
| Micro-servizi, code, cache distribuita | Nessun problema a questa scala li giustifica |
