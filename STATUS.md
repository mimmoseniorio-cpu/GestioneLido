# STATUS

Aggiornato: 2026-09-06 · Branch: `main` · Repository: `mimmoseniorio-cpu/GestioneLido`

## Fase corrente
**F3 — Fondamenta: COMPLETA, gate superato.**
Migrazione applicata, 17 test verdi (T-08, T-03, T-27 inclusi), seed demo
funzionante. Prossima: F4 — Impalcatura.

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

## In corso
Nessun task in corso.

## Prossimi 3
1. [F4-01] Autenticazione staff (Argon2id, sessioni cookie)
2. [F4-02] `TenantContext` + repository layer con scoping forzato
3. [F4-06] Errori di dominio tipizzati + mappatura HTTP

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
npm test                          # 17 test sui vincoli
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
