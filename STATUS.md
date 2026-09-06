# STATUS

Aggiornato: 2026-09-06 · Branch: `main` · Repository: `mimmoseniorio-cpu/GestioneLido`

## Fase corrente
**F6 — MVP: in corso.** Il ciclo che vale il prodotto è **completo**:
link su WhatsApp → assenza in 3 tap dal telefono → il posto compare fra i
vendibili → il gestore lo rivende vedendo quanto gli costa → **il credito
matura allo stagionale** → i contatori di capacità recuperata si muovono.
237 test verdi, fra cui `T-12`, `T-14`, `T-15`, `T-16`, `T-40`, `T-44`, `T-81`,
`T-83` e il criterio 9 (la dashboard quadra con le prenotazioni).

Aggiornato: 2026-09-06 · dopo il riscontro dell'utente sulla demo

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
- [F6-01] `punteggioProssimita()` — cosa vuol dire "vicini" (C-04) → `domain/availability/proximity.ts`
- [F6-02] `cercaDisponibilita()` deterministica, con soluzioni parziali (C-20) → `domain/availability/search.ts`
- [F6-03/F6-04] "Trova il posto migliore": query + schermata, 3 interazioni alle proposte
- [F6-19 parziale] Incasso dal pannello e alla conferma → `app/api/v1/payments`
- [F6-23 parziale] Ricerca istantanea su nome, telefono, numero — client-side, zero latenza
- [riscontro] Tesi di prodotto precisata nel brief: **capacità vendibile**, non prenotazione
- [riscontro] `RF-DSH-05` capacità recuperata: posti e incasso, oggi e in stagione
- [riscontro] Terminologia: "Vendibile" → **"Liberato da stagionale"**, "Bloccato" → "Fuori servizio"
- [riscontro] Contatori a caselle grandi al posto di "10% su 96"
- [riscontro] Bersagli da 46 a 56 px; avviso arancione quando la data non è oggi
- [riscontro] Form di prenotazione con dal/al, preventivo immediato e "incassato subito"
- [F6-07] `declareAbsence()` con cutoff nel fuso dello stabilimento → `server/use-cases/absences.ts`
- [F6-08] `cancelAbsence()` con giorni già venduti — **T-12 verde**
- [F6-07 dominio] `domain/seasonal/cutoff.ts` e `domain/seasonal/intervals.ts`, funzioni pure
- [F6-06] Magic link: generazione, hash, revoca, rigenerazione + messaggio WhatsApp
- [F6-09] Area cliente `/s/[token]`: ombrellone, assenze, credito
- [F6-10] "Non sarò presente" in **3 tap**, verificato nel browser
- [F6-28 parziale] WhatsApp con messaggio pronto per il link stagionale
- [F6-12] Credito maturato alla rivendita, nella stessa transazione → `domain/seasonal/credit.ts`
- [F6-13] Il costo in credito visibile nel pannello **prima** di vendere
- [F6-14] Storno del credito se la rivendita viene annullata (T-14), tetto stagionale (T-15)
- [F6-15] Credito e storico visibili nell'area cliente
- [F6-16] Motore prezzi: regole con priorità, valutate giorno per giorno → `domain/pricing/engine.ts`
- [F6-18] Scostamento manuale con soglia per ruolo e traccia nell'audit
- [F6-16 extra] `GET /api/v1/quote`: preventivo dal server, stesso motore della conferma
- [F6-20] Normalizzazione telefono E.164 con regole italiane → `domain/customers/phone.ts`
- [F6-21] Preferenze cliente mostrate (non applicate: è `R4`)
- [F6-22] Scheda cliente con storico, ombrelloni ricorrenti, saldi — **scenario E in 3 interazioni**
- [F6-23] Ricerca globale completa: mappa (istantanea) + anagrafica (server)
- [F6-24] Dashboard: occupazione, incassi, capacità recuperata, prossimi 7 giorni
- [F6-26] **Generatore di griglia**: «6 file da 16» crea 96 ombrelloni, zone e passerelle
- [F6-27 parziale] Rinumerazione con traccia; lo spostamento manuale manca

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
1. [F6-17] Editor del listino — senza, il gestore non può cambiare i propri prezzi
2. [F6-30] PWA installabile (`MVP-16`, criterio 7 di accettazione)
3. [F6-31] Coda di retry e stato di sincronizzazione (criterio 10)

**Nota su F6-26**: una mappa generata senza tariffe non può vendere, e il
motore lo dice invece di registrare zero (`C-43`). Il generatore assegna già
prezzi predefiniti per zona; l'editor del listino (`F6-17`) serve a cambiarli.

**Nota su F6-17**: il motore prezzi funziona e le regole sono nel database, ma
**non c'è ancora una schermata per modificarle**: oggi arrivano dal seed. Finché
manca, un gestore non può cambiare i propri prezzi da solo.

**Nota su F6-23**: la ricerca è istantanea perché lavora sul giorno già
caricato in memoria. Trova chi è sulla mappa oggi, non tutti i clienti dello
storico: quella è la seconda metà del task e richiede l'endpoint già scritto
(`GET /api/v1/customers?q=`), non ancora collegato alla UI.

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
npm test                          # 237 test
npm run dev                       # mappa su http://localhost:3000/map
npm run e2e                       # scenario A, conta le interazioni
# `npm run seed` stampa in fondo un link stagionale pronto da aprire
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
| `domain/availability/` | Adiacenza e ricerca: pure, deterministiche, senza database |
| `domain/seasonal/` | Cutoff, intervalli e calcolo del credito: pure |
| `domain/pricing/engine.ts` | Listino: regole con priorità, mai un prezzo a zero |
| `domain/map/grid.ts` | Generatore di griglia: l'anteprima è ciò che verrà scritto |
| `server/use-cases/absences.ts` | Assenze: contiene una **correzione a `docs/08` §6.2** |
| `server/auth/magic-link.ts` | Token stagionale: generato, hashato, revocabile |
| `app/s/[token]/` | Area cliente: 3 tap, nessuna password |
| `app/map/MapClient.tsx` | La schermata principale del prodotto |
| `server/dev-session.ts` | **Ponte temporaneo**: sparisce con `F4-01` |
