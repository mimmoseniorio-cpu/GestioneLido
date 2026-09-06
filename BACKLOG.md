# Backlog

Task derivati dai documenti di FASE 1. Ogni task ha un ID, sta in una sessione,
tocca al massimo 5–6 file e ha un criterio di "fatto" verificabile.

**Legenda modello** (`AGENT_PROTOCOL.md` §8.1):
🔴 Opus — sbagliare costa · 🟡 Sonnet — implementazione su spec · 🟢 Haiku — meccanico

---

## F3 — Fondamenta
*Gate: migrazione applicata e T-08, T-03, T-27 verdi.*

| ID | Task | Modello | Fatto quando |
|---|---|---|---|
| ✅ F3-01 | Setup progetto Next.js + TypeScript + Prisma + Postgres locale | 🟡 | `npm run dev` parte, `prisma migrate` gira |
| ✅ F3-02 | Migrazione `CREATE EXTENSION btree_gist` | 🟢 | Prima migrazione, applicata |
| ✅ F3-03 | Schema: `BeachClub`, `Season`, `User` | 🟡 | Migrato, unique `(club, year)` attiva |
| ✅ F3-04 | Schema: `BeachMap`, `Zone`, `MapFeature`, `Umbrella` | 🟡 | Migrato, unique `(club, visible_number)` attiva |
| ✅ F3-05 | Schema: `Customer`, `CustomerPreference` | 🟡 | Migrato, unique telefono normalizzato attiva |
| ✅ F3-06 | Schema: `Reservation`, `ReservationItem` | 🔴 | Migrato |
| ✅ F3-07 | **Vincolo `EXCLUDE` su `reservation_item`** | 🔴 | T-08 verde: due insert concorrenti, uno solo passa |
| ✅ F3-08 | Schema: `SeasonalContract`, `SeasonalAbsence` + i due `EXCLUDE` | 🔴 | T-03 e T-27 verdi |
| ✅ F3-09 | Schema: `PriceRule`, `Payment`, `CreditTransaction` | 🟡 | Migrato |
| ✅ F3-10 | Schema: `AuditLog` (append-only con trigger) + `IdempotencyKey` | 🟡 | `UPDATE`/`DELETE` su audit rifiutati dal database |
| ✅ F3-11 | Chiavi esterne composte per l'integrità tenant (`docs/03` §5.7) | 🔴 | Impossibile collegare righe di tenant diversi |
| ✅ F3-12 | Indici di `docs/03` §5.8 | 🟢 | Creati |
| ✅ F3-13 | **Seed demo deterministico**: 96 ombrelloni, 28 stagionali, 12 assenze | 🟡 | `npm run seed` due volte produce dati identici |

## F4 — Impalcatura
*Gate: build verde, T-60 e T-61 verdi, audit funzionante.*

| ID | Task | Modello | Fatto quando |
|---|---|---|---|
| ✅ F4-01 | Autenticazione staff con sessioni revocabili | 🔴 | Login e logout funzionano, sessione revocabile |
| ✅ F4-02 | `TenantContext` + repository layer con scoping forzato | 🔴 | Nessuna query di dominio senza `beach_club_id` |
| ✅ F4-03 | Lint rule: `prisma` non importabile fuori da `db/` e `server/repositories/` | 🟢 | La violazione fa fallire il lint |
| ✅ F4-04 | Autorizzazione: permessi e `useCase()` (`docs/04` §4) | 🔴 | Matrice ruoli applicata |
| ✅ F4-05 | Test di isolamento multi-tenant generati sulla matrice | 🔴 | T-60, T-61 verdi su ogni endpoint |
| ✅ F4-06 | Errori di dominio tipizzati + mappatura HTTP | 🟡 | Violazione `EXCLUDE` → `UMBRELLA_NOT_AVAILABLE` |
| ✅ F4-07 | Middleware idempotenza (`Idempotency-Key`) | 🔴 | T-21 verde |
| ✅ F4-08 | Servizio audit log (before/after, solo campi cambiati) | 🟡 | Ogni operazione critica lascia traccia |
| ✅ F4-09 | CI: typecheck, lint, unit, integration su Postgres effimero | 🟡 | Pipeline verde su push |
| 🟡 F4-10 | Tre ambienti + backup automatici (`D-09`) — **parziale**: produzione su Vercel + Neon online; mancano ambienti separati e backup | 🟡 | Deploy su staging funzionante |

## F5 — Prototipo
*Gate: scenari A e F dimostrabili su tablet reale.*

| ID | Task | Modello | Fatto quando |
|---|---|---|---|
| ✅ F5-01 | **`umbrellaState()` puro + test esaustivi** (`docs/03` §6) | 🔴 | 100% dei rami coperti |
| ✅ F5-02 | `GET /api/v1/map?date=` in tre query | 🔴 | Nessuna query in ciclo, < 100 ms su 96 ombrelloni |
| ✅ F5-03 | Mappa SVG con pan/zoom | 🟡 | 96 ombrelloni entrano in un tablet senza zoom |
| ✅ F5-04 | Codifica degli stati a tre segnali (colore + icona + bordo) | 🟡 | Leggibile in simulazione daltonismo |
| ✅ F5-05 | Riga contatori sopra la mappa | 🟢 | Scenario F: 6 domande in 5 s |
| ✅ F5-06 | Pannello rapido con azione primaria variabile per stato | 🔴 | `docs/06` §3 rispettato |
| ✅ F5-07 | Caso d'uso `createReservation` in transazione | 🔴 | T-01, T-23 verdi |
| ✅ F5-08 | Caso d'uso `releaseUmbrella` | 🟡 | Torna `LIBERO` |
| ✅ F5-09 | Selettore data con precaricamento dei giorni adiacenti | 🟡 | Cambio giorno percepito istantaneo |
| ✅ F5-10 | Aggiornamento ottimistico + riconciliazione | 🔴 | Azione riflessa < 100 ms |
| ⏸ F5-11 | **Prova su tablet reale con una persona** — non eseguibile da un agente | 🔴 | Gate F5 superato |

## F6 — MVP

| ID | Task | Modello | Fatto quando |
|---|---|---|---|
| ✅ F6-01 | `proximityScore()` + test (`docs/03` §7) | 🔴 | Casi di corridoio e cambio fila coperti |
| ✅ F6-02 | Algoritmo disponibilità (`docs/09` §4) | 🔴 | T-30…T-35 verdi |
| ✅ F6-03 | Schermata ricerca disponibilità (S-03) | 🟡 | Scenario B ≤ 4 interazioni |
| ✅ F6-04 | Soluzioni parziali quando non c'è copertura completa | 🔴 | T-30 verde, mai "nessun risultato" |
| ✅ F6-05 | CRUD contratti stagionali | 🟡 | T-27, T-28 verdi · C-16: il conflitto dice QUALI prenotazioni |
| ✅ F6-06 | Magic link: generazione, hash, revoca, scadenza | 🔴 | T-19, T-62, T-63 verdi |
| ✅ F6-07 | **`declareAbsence()`** con cutoff (`docs/08` §4) | 🔴 | T-01…T-06, T-17 verdi |
| ✅ F6-08 | **`cancelAbsence()`** con spezzatura dell'intervallo | 🔴 | **T-12** verde |
| ✅ F6-09 | Area cliente C-01: la mia postazione | 🟡 | Leggibile senza istruzioni |
| ✅ F6-10 | Area cliente C-02: assenza in 3 tap | 🔴 | Scenario C ≤ 3 tap |
| ✅ F6-11 | Registrazione assenza da parte dell'operatore | 🟡 | 2 interazioni con la scorciatoia DOMANI |
| ✅ F6-12 | **`sellTemporarySlot()`** con credito in transazione | 🔴 | T-07, **T-08**, T-09 verdi |
| ✅ F6-13 | Pannello stagionale assente con credito visibile prima della vendita | 🟡 | `docs/06` §3.3 |
| ✅ F6-14 | Registro crediti + storno (`docs/08` §7) | 🔴 | T-14, T-15, **T-16** verdi |
| ✅ F6-15 | Area cliente C-03: i miei crediti | 🟢 | Storico leggibile |
| ✅ F6-16 | Motore prezzi `computePrice()` puro | 🔴 | T-40…T-44 verdi, mai zero |
| ✅ F6-17 | Editor listino (S-24) | 🟡 | Regole con priorità, ordine visibile |
| ✅ F6-18 | Override prezzo con soglia per ruolo | 🟡 | T-65 verde |
| 🟡 F6-19 | Pagamenti — **parziale**: incasso e stato fatti; mancano rimborsi e metodi | 🟡 | T-45…T-48 verdi |
| ✅ F6-20 | Anagrafica clienti + normalizzazione telefono E.164 | 🟡 | T-80, T-81 verdi |
| ✅ F6-21 | Preferenze cliente (mostrate, non applicate) | 🟢 | Visibili in scheda e in prenotazione |
| ✅ F6-22 | Scheda cliente con storico (S-09) | 🟡 | Scenario E ≤ 3 interazioni |
| 🟡 F6-23 | Ricerca globale — **parziale**: istantanea sul giorno caricato; manca la ricerca su tutti i clienti | 🟡 | `63` trova l'ombrellone, T-86 verde |
| ✅ F6-24 | Dashboard giornaliera (S-12) | 🟡 | Criterio 9: i numeri quadrano |
| ✅ F6-25 | Calendario: griglia ombrelloni × giorni | 🟡 | Sostituisce le tre viste |
| ✅ F6-26 | **Generatore di griglia** (S-23) | 🔴 | 96 ombrelloni configurati in < 2 minuti |
| 🟡 F6-27 | Editor mappa — **parziale**: rinumerazione e blocco fatti; manca lo spostamento | 🟡 | T-83, T-84, T-85 verdi |
| 🟡 F6-28 | Pulsante WhatsApp — **parziale**: fatto per il link stagionale; manca per la conferma prenotazione | 🟢 | `RF-SYS-03` |
| F6-29 | `NotificationPort` con implementazione a log | 🟢 | Astrazione pronta per `R2` |
| ✅ F6-30 | PWA: manifest, service worker (shell, **non** dati) | 🟡 | Installabile, criterio 7 |
| ✅ F6-31 | Stato di sincronizzazione + coda retry | 🔴 | T-70, T-71 verdi, criterio 10 |
| ✅ F6-32 | Blocco schermo con PIN (S-16) | 🟢 | Il tablet incustodito non espone i clienti |
| ✅ F6-33 | GDPR: anonimizzazione ed export cliente | 🟡 | T-82 verde |
| ✅ F6-34 | Layout responsive: tre varianti reali (`docs/06` §8) | 🟡 | Modalità elenco su smartphone |
| ✅ F6-35 | Ripresa dell'operazione dopo sessione scaduta | 🟡 | T-73 verde, nessun dato perso |

## F7 — Test e prova sul campo

| ID | Task | Modello | Fatto quando |
|---|---|---|---|
| F7-01 | E2E scenario A + conteggio interazioni | 🟡 | ≤ 4 |
| F7-02 | E2E scenario B | 🟡 | ≤ 4 alle proposte, ≤ 8 totali |
| F7-03 | E2E scenario C (cliente e operatore) | 🟡 | ≤ 3 tap / ≤ 4 |
| F7-04 | E2E scenario D | 🔴 | ≤ 4, credito corretto |
| F7-05 | E2E scenario E | 🟡 | ≤ 3 |
| F7-06 | Verifica scenario F con persona reale | 🔴 | 6 domande in 5 s |
| F7-07 | T-20: ciclo completo end-to-end | 🔴 | Verde |
| F7-08 | Prova con rete degradata | 🔴 | Criterio 10 |
| F7-09 | Prova di ripristino da backup | 🟡 | Ripristino verificato almeno una volta |
| F7-10 | **Mezza giornata reale con il gestore** | 🔴 | Criterio 11: quaderno chiuso |

---

## Riepilogo

| Fase | Task | 🔴 Opus | 🟡 Sonnet | 🟢 Haiku |
|---|---:|---:|---:|---:|
| F3 | 13 | 4 | 7 | 2 |
| F4 | 10 | 5 | 4 | 1 |
| F5 | 11 | 6 | 5 | 0 |
| F6 | 35 | 12 | 18 | 5 |
| F7 | 10 | 5 | 5 | 0 |
| **Totale** | **79** | **32** | **39** | **8** |

Circa il 40% dei task richiede Opus, e sono concentrati sulle regole di dominio,
i vincoli e la concorrenza — esattamente dove un errore costa una riscrittura.
Il resto scende di livello secondo `AGENT_PROTOCOL.md` §8.
