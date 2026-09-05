# STATUS

Aggiornato: 2026-09-05 · Ultimo checkpoint: init · Branch: `main`
Repository: `mimmoseniorio-cpu/GestioneLido`

## Fase corrente
**F0 — Kickoff.** Documenti di progetto creati. La FASE 1 (Specification) non è ancora iniziata.

## Fatto
- [F0-01] Brief di prodotto riscritto in forma eseguibile → `PROJECT_BRIEF.md`
- [F0-02] Protocollo operativo dell'agente (git, checkpoint, stato, crediti) → `AGENT_PROTOCOL.md`
- [F0-03] Registro decisioni inizializzato con 10 decisioni aperte → `DECISIONS.md`
- [F0-04] Prompt di avvio per il coding agent → `KICKOFF_PROMPT.md`
- [F0-05] Repository dedicato creato e inizializzato

## In corso
Nessun task in corso.

## Prossimi 3
1. [F1-01] Rispondere alle decisioni bloccanti `D-01`, `D-03`, `D-07`, `D-09`.
2. [F1-02] Produrre i deliverable della FASE 1 in `docs/` (vedi `PROJECT_BRIEF.md` §12).
3. [F1-03] Generare `BACKLOG.md` con i task di F2 e F3.

## Blocchi e decisioni aperte
- `D-01` policy conflitto quando lo stagionale annulla un'assenza già rivenduta → **DECISIONE RICHIESTA**
- `D-03` unità del credito stagionale (euro vs punti) → proposta pronta
- `D-07` monolite Next.js vs backend separato → proposta pronta
- `D-09` hosting e database → proposta pronta

## Come far girare il progetto
Non applicabile: non esiste ancora codice. Sarà compilato al gate F4.

## File chiave
| File | Contenuto |
|---|---|
| `PROJECT_BRIEF.md` | Requisiti con ID, regole di dominio, fasi, criteri di accettazione |
| `AGENT_PROTOCOL.md` | Regole di lavoro: git, checkpoint, ripresa, instradamento modelli |
| `DECISIONS.md` | Decisioni prese e aperte |
| `KICKOFF_PROMPT.md` | Prompt da incollare per avviare la FASE 1 |
| `STATUS.md` | Questo file. Punto di ripresa del progetto. |
