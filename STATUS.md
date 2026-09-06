# STATUS

Aggiornato: 2026-09-06 · Branch: `main` · Repository: `mimmoseniorio-cpu/GestioneLido`

## Fase corrente
**F5 — Prototipo: la mappa funziona.** 89 test verdi, typecheck pulito, build
Next.js pulita. Scenario A verificato nel browser in **4 interazioni**,
scenario F leggibile senza toccare nulla. Prossima: F6 — MVP.

Aggiornato: 2026-09-06

## Fatto
- [F0] Brief, protocollo, registro decisioni, prompt di avvio, repository
- [F1-01] Analisi del problema e 13 criticità → `docs/01-analisi.md`
- [F1-02] Architettura, stack motivato, sicurezza, GDPR → `docs/02-architettura.md`
- [F1-03] Modello dati, vincoli, indici, funzione di stato → `docs/03-modello-dati.md`
- [F1-04] Matrice ruoli e permessi → `docs/04-ruoli-permessi.md`
- [F1-05] Sitemap e 23 schermate → `docs/05-sitemap-schermate.md`
- [F1-06] Wireframe delle schermate critiche → `docs/06-wireframe.md`
- [F1-07] Flussi dei 6 scenari con criteri numerici → `docs/07-flussi-scenari.md`
- [F1-08] Logica stagionali, assenze, rivendita, crediti → `docs/08-logica-stagionali.md`
- [F1-09] Conflitti e casi limite → `docs/09-conflitti-casi-limite.md`
- [F1-10] MVP, criteri di accettazione, roadmap, rischi → `docs/10-mvp-roadmap.md`
- [F1-11] Backlog di 79 task con instradamento per modello → `BACKLOG.md`
- [F3-01] Setup Next.js + TypeScript + Prisma + Postgres locale
- [F3-02] Estensioni `btree_gist` e `pg_trgm` nella prima migrazione
- [F3-03..F3-10] Schema completo: 18 modelli, migrazione unica applicata
- [F3-07] **Vincolo EXCLUDE su `reservation_item`** — T-08 verde
- [F3-08] Vincoli EXCLUDE su assenze e contratti — T-03 e T-27 verdi
- [F3-11] Chiavi esterne composte per l'isolamento tenant (D-14) — 9 vincoli attivi
- [F3-12] Indici di `docs/03` §5.8
- [F3-13] Seed demo deterministico: 96 ombrelloni, 28 stagionali, 12 assenze
- [F4-02] `TenantContext` + repository layer con scoping forzato → `server/repositories/scoped.ts`
- [F4-03] Regola di dipendenza verificata da test (D-17) → `tests/architecture.test.ts`
- [F4-04] Permessi tipizzati + `useCase()` → `domain/auth/permissions.ts`, `server/use-case.ts`
- [F4-05] Test di isolamento multi-tenant — T-60 e T-61 verdi
- [F4-06] Errori di dominio tipizzati + traduzione dei vincoli → `domain/errors.ts`
- [F4-07] Idempotenza — T-21 verde → `server/idempotency.ts`
- [F4-08] Servizio audit con diff dei soli campi cambiati → `server/audit.ts`
- [F4-09] CI su PostgreSQL 16 reale → `.github/workflows/ci.yml`
- [F4-01] **parziale**: hash Argon2id fatto, sessioni da fare
- [F5-01] `umbrellaState()` puro, 30 test → `domain/umbrella/state.ts`
- [F5-02] `getMapForDate()` con numero di query costante → `server/queries/map.ts`
- [F5-03] Mappa SVG 96 ombrelloni, entra in un tablet senza zoom
- [F5-04] Stati a tre segnali: colore + simbolo + trattamento del bordo
- [F5-05] Riga contatori sopra la mappa (scenario F)
- [F5-06] Pannello rapido con azione primaria variabile per stato
- [F5-07] `createReservation` in transazione → `server/use-cases/reservations.ts`
- [F5-08] `cancelReservation`, `moveReservationItem`, `blockUmbrella`
- [F5-09] Selettore data con precaricamento di ieri e domani
- [F5-10] Aggiornamento ottimistico + riconciliazione dal server
- [F5 extra] API `/api/v1/map`, `/reservations`, `/customers` + script E2E scenario A

## In corso
Nessun task in corso.

**`F5-11` non posso farlo io**: il gate previsto è una prova su un tablet vero
con una persona vera. Gli screenshot e lo script E2E dimostrano il flusso e
contano le interazioni, ma non dicono se un bagnino al sole capisce la mappa in
cinque secondi. Serve mezz'ora tua, o del gestore, prima di costruirci sopra F6.

`F4-01` è a metà: `server/auth/password.ts` fa hash e verifica con Argon2id.
Mancano le sessioni, che richiedono la tabella `Session` (`D-18`) e le rotte
Next.js. Si completa quando esiste l'app.

## Prossimi 3
1. [F6-01] `proximityScore()` — cosa vuol dire "ombrelloni vicini" (C-04)
2. [F6-02] Algoritmo di ricerca disponibilità (scenario B)
3. [F6-07] `declareAbsence()` con cutoff — l'inizio del cuore del prodotto

## Blocchi e decisioni aperte
- ~~`D-01`~~ CHIUSA il 2026-09-06: chi ha pagato tiene il posto. Credito solo a rivendita avvenuta.
  Proposta: `IRREVOCABLE` di default, configurabile. Motivazione in `docs/08` §8.
  Blocca solo `F6-08`: F3 e F4 possono partire subito.
- `D-12` cutoff assenze (default 20:00 del giorno prima) — confermabile o modificabile
- `D-13` tetto al credito stagionale — confermabile o modificabile
- `D-09` scelta del fornitore di hosting — si chiude in F4. **Vincolo:** deve
  permettere `CREATE EXTENSION btree_gist`, altrimenti è escluso.

## Come far girare il progetto
```bash
service postgresql start          # nel container di sviluppo
cp .env.example .env              # DATABASE_URL e TEST_DATABASE_URL
npm install
npm run db:deploy                 # applica le migrazioni
npm run seed                      # 96 ombrelloni, dati realistici
npm test                          # 89 test
npm run dev                       # mappa su http://localhost:3000/map
npm run e2e                       # scenario A, conta le interazioni
npm run typecheck
```
Il database di sviluppo e' usa-e-getta: `npm run db:reset` lo ricrea da zero.
I test girano su `gestionelido_test`, mai sul database di sviluppo.

## File chiave
| File | Contenuto |
|---|---|
| `PROJECT_BRIEF.md` | Requisiti con ID, regole di dominio, fasi, accettazione |
| `AGENT_PROTOCOL.md` | Git, checkpoint, ripresa, instradamento modelli |
| `BACKLOG.md` | 79 task con ID, modello consigliato, criterio di "fatto" |
| `DECISIONS.md` | 15 decisioni, 1 aperta |
| `docs/03` e `docs/08` | I due documenti da rileggere prima di toccare il dominio |
| `docs/09` §10 | I sei test che decidono il rilascio |
| `prisma/schema.prisma` | 18 modelli; le relazioni composte sono la garanzia D-14 |
| `prisma/migrations/*/migration.sql` | In coda: i tre vincoli EXCLUDE e i trigger |
| `db/seed.ts` | Stabilimento demo deterministico |
| `tests/constraints.test.ts` | Il gate F3: 17 test sulle garanzie del database |
| `server/repositories/scoped.ts` | Prima linea dell'isolamento tenant |
| `server/use-case.ts` | Come si scrive ogni operazione: permesso + transazione |
| `domain/errors.ts` | Traduzione dei vincoli in messaggi per l'operatore |
| `domain/umbrella/state.ts` | La funzione da cui dipende ogni schermata |
| `server/queries/map.ts` | La mappa di un giorno, query costanti |
| `app/map/MapClient.tsx` | La schermata principale del prodotto |
| `server/dev-session.ts` | **Ponte temporaneo**: sparisce con `F4-01` |
