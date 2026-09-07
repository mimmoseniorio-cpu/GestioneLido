# STATUS

Aggiornato: 2026-09-06 · Branch: `main` · Repository: `mimmoseniorio-cpu/GestioneLido`

## Fase corrente
**F6 — MVP: in corso.** Il ciclo che vale il prodotto è **completo**:
link su WhatsApp → assenza in 3 tap dal telefono → il posto compare fra i
vendibili → il gestore lo rivende vedendo quanto gli costa → **il credito
matura allo stagionale** → i contatori di capacità recuperata si muovono.
408 test verdi, fra cui `T-12`, `T-14`, `T-15`, `T-16`, `T-27`, `T-28`, `T-40`,
`T-44`, `T-81`, `T-83` e il criterio 9 (la dashboard quadra con le prenotazioni).
Da questo checkpoint gli stagionali **non arrivano più solo dal seed**: il
gestore li crea, li chiude e registra le assenze di chi telefona.

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
- [F6-19] Incasso, **metodi** (contanti/carta/bonifico) e **rimborsi** con soglia per ruolo
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
- [F6-28] WhatsApp: link stagionale **e conferma di prenotazione**, già scritti e modificabili
- [CI] **Verde**: tipi, 408 test, i nove criteri di `docs/07` contati nel browser e la
  prova di ripristino della copia, tutto a ogni push (run 37)
- [F6-29] `NotificationPort` + la fascia sulla mappa: l'assenza comunicata di sera
  dal telefono di un cliente è capacità vendibile domani, e il gestore la vede senza cercarla
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
- [F6-27] Editor della disposizione: **tocca e posa**, rinumerazione, vincolo unico sulla casella
- [F6-23] Filtro **«Da incassare (N)»**: la sesta domanda dello scenario F, in un tocco
- [F7-01..F7-05, F7-07, F7-08] **Suite E2E sui sei scenari**: i nove criteri di `docs/07`
  misurati contando le interazioni, più il ciclo completo (T-20) e la rete degradata
- [F6-17] Editor del listino con **simulatore**: «questo ombrellone, questi giorni, quanto costa e per quale regola»
- [F6-30] PWA installabile: manifest, service worker, icone — **criterio 7**
- [F6-31] Coda di scritture con ritentativo e stato visibile — **criterio 10**
- [F6-33] GDPR: anonimizzazione (non cancellazione) ed export dei dati cliente
- [F6-25] Calendario: una griglia ombrelloni × giorni al posto delle tre viste
- [F6-34] Modalità elenco su smartphone, ordinata per urgenza — attiva da sola sotto i 700 px
- [correzione] I giorni fuori stagione non contano più come «vendibili»: mappa e calendario lo dicono
- [F4-01] **Autenticazione staff completa**: login, logout, sessioni revocabili (`D-18`)
- [F6-35] Sessione scaduta: l'operazione resta in coda e si ritenta dopo il rientro
- [F6-32] **Blocco schermo con PIN**, applicato dal server: pagine reindirizzate, API a 423
- [F6-19] Rimborsi: movimento negativo con motivo obbligatorio, soglia per ruolo (▲³),
  metodo che riparte da come il cliente ha pagato, dashboard che li mostra a parte
- [F4-10 parziale] Rilascio su Vercel + Neon, dati dimostrativi al primo avvio → `DEPLOY.md`
- [riscontro tel.] Il pannello di prenotazione si chiude in **66 ms**, non dopo la rete (era 8 s)
- [riscontro tel.] La data scritta a parole sotto il selettore: «09/06/2026» su un telefono
  inglese è il 6 settembre, e su quella schermata l'ambiguità costa soldi
- [riscontro tel.] Fascia d'errore sopra la mappa: a pannello chiuso il rifiuto non sparisce
- [riscontro tel.] **Prenotazione in una chiamata sola**: cliente, prenotazione e incasso
  nella stessa transazione. Non era solo lentezza: con tre chiamate, un guasto in mezzo
  lasciava un cliente orfano in anagrafica o un incasso già preso e mai registrato
- [F6-05] **Contratti stagionali dalla UI** (`/seasonal`): creazione con link personale, chiusura
- [F6-05 · C-16] Il conflitto dice **quali** prenotazioni bloccano il contratto, con cliente e date
- [F6-11] L'operatore registra l'assenza di chi telefona: scorciatoia **DOMANI**, 2 interazioni
- [F6-05 extra] `elencoStagionali()` mette in cima **chi è assente oggi**: è il posto vendibile adesso
- [e2e] `npm run e2e:seasonal` — 14 verifiche nel browser, e ripulisce il contratto che crea

## In produzione
**È online e provabile dal telefono**: `https://gestione-lido.vercel.app`
(`APP_URL` impostata: i link personali degli stagionali restano validi fra un
rilascio e l'altro, qualunque indirizzo usi il gestore per entrare)
(`admin@lidoadriano.it` / `lido2026`). Vercel per l'applicazione, Neon per il
database, entrambi a costo zero — procedura in `DEPLOY.md`.

Il primo rilascio ha chiuso l'incognita che pesava di più: **Neon applica
`btree_gist`** e i tre vincoli EXCLUDE. La garanzia «non si vende due volte
lo stesso ombrellone» è attiva sul database vero, non solo in locale.

`F4-10` resta **parziale**, ma i due buchi peggiori sono chiusi:
- un rilascio di prova non tocca più il database vero (`db/prepara.ts`);
- `npm run backup` + `npm run backup:verifica`: la copia si fa **e si
  ripristina davvero**, controllando che vincoli, trigger e `btree_gist`
  siano ancora al loro posto.

Mancano la pianificazione automatica delle copie e un ambiente di collaudo
separato. Non ci metterei ancora i clienti veri di uno stabilimento vero.

## In corso
Nessun task in corso.

**`F5-11` e `F7-06` non posso farli io**: il gate previsto è una prova su un tablet vero
con una persona vera. Gli screenshot e lo script E2E dimostrano il flusso e
contano le interazioni, ma non dicono se un bagnino al sole capisce la mappa in
cinque secondi. Serve mezz'ora tua, o del gestore, prima di costruirci sopra F6.

`server/dev-session.ts` **non esiste più**: era un ponte temporaneo dichiarato
tale, e ora ogni pagina e ogni API passano dalla sessione reale.

## Prossimi 3
1. [F5-11 / F7-06] **Prova con una persona vera davanti al tablet** — tocca a te
2. [F4-10] Copie di sicurezza pianificate e ambiente di collaudo separato
3. [R1+] Quel che resta è fuori dall'MVP: vedi `BACKLOG.md`

**Il pezzo più grosso che manca non è codice**: è `F4-10`, il deploy, che
richiede la scelta del fornitore — con il vincolo che supporti `btree_gist`.
E `F5-11`, la prova con una persona vera davanti al tablet.

**Nota sul service worker**: mette in cache solo il guscio dell'applicazione,
**mai le disponibilità**. Dati di occupazione serviti da cache sono peggio di
nessun dato: porterebbero a vendere un posto già venduto.

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
npm test                          # 408 test
npm run dev                       # mappa su http://localhost:3000/map
npm run e2e                       # i sei scenari, con i nove criteri contati
npm run e2e:seasonal              # contratto → link → assenza → posto vendibile
npm run e2e:rapida                # telefono in inglese: date e chiusura del pannello
npm run e2e:blocco                # blocco schermo: il server risponde 423, non 200
npm run e2e:rimborso              # incasso con metodo, rimborso parziale, soglie
npm run e2e:disposizione          # sposta e rinumera, e la mappa di lavoro lo segue
# `npm run seed` stampa in fondo le credenziali e un link stagionale
#   admin@lidoadriano.it / lido2026
npm run typecheck
npm run verifica                  # TUTTO il cancello, in un comando: tipi,
                                  # test, build, scenari, copia e ripristino
npm run backup                    # solo la copia; poi backup:verifica
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
| `server/use-cases/contracts.ts` | Contratti stagionali; il conflitto dice quali prenotazioni |
| `server/use-cases/customers.ts` | Trova-o-crea il cliente: usato dalla rotta e dalla prenotazione |
| `server/use-cases/payments.ts` | Incasso e rimborso: lo stato si ricalcola dalla somma |
| `server/queries/layout.ts` | La disposizione per l'editor: dove stanno le cose, non lo stato del giorno |
| `app/seasonal/` | Elenco stagionali: in cima chi è assente oggi |
| `server/auth/session.ts` | Sessioni staff revocabili; `server/current-user.ts` le legge |
