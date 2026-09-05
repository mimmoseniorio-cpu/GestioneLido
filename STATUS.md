# STATUS

Aggiornato: 2026-09-05 · Branch: `main` · Repository: `mimmoseniorio-cpu/GestioneLido`

## Fase corrente
**F1 — Specification: COMPLETA.** Gate superato tranne `D-01`, che richiede una
risposta dell'utente prima di implementare `F6-08`.

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

## In corso
Nessun task in corso.

## Prossimi 3
1. **`D-01`** — conferma della policy sul conflitto assenza/rivendita (utente)
2. [F3-01] Setup Next.js + TypeScript + Prisma + Postgres locale
3. [F3-02] Migrazione `CREATE EXTENSION btree_gist`

## Blocchi e decisioni aperte
- `D-01` policy conflitto assenza già rivenduta → **DECISIONE RICHIESTA**.
  Proposta: `IRREVOCABLE` di default, configurabile. Motivazione in `docs/08` §8.
  Blocca solo `F6-08`: F3 e F4 possono partire subito.
- `D-12` cutoff assenze (default 20:00 del giorno prima) — confermabile o modificabile
- `D-13` tetto al credito stagionale — confermabile o modificabile
- `D-09` scelta del fornitore di hosting — si chiude in F4. **Vincolo:** deve
  permettere `CREATE EXTENSION btree_gist`, altrimenti è escluso.

## Come far girare il progetto
Non applicabile: non esiste ancora codice. Il primo comando eseguibile arriva
con `F3-01`.

## File chiave
| File | Contenuto |
|---|---|
| `PROJECT_BRIEF.md` | Requisiti con ID, regole di dominio, fasi, accettazione |
| `AGENT_PROTOCOL.md` | Git, checkpoint, ripresa, instradamento modelli |
| `BACKLOG.md` | 79 task con ID, modello consigliato, criterio di "fatto" |
| `DECISIONS.md` | 15 decisioni, 1 aperta |
| `docs/03` e `docs/08` | I due documenti da rileggere prima di toccare il dominio |
| `docs/09` §10 | I sei test che decidono il rilascio |
