# Istruzioni per Claude Code su questo progetto

Prima di qualunque lavoro leggi **`STATUS.md`** e **`AGENT_PROTOCOL.md`**.
`AGENT_PROTOCOL.md` contiene regole vincolanti su git, checkpoint, aggiornamento
dello stato e uso dei modelli: rispettale.

Sintesi delle regole che si violano più spesso:

- Nessun turno finisce senza commit pushato e `STATUS.md` aggiornato.
- Non riesplorare il repository all'apertura: `STATUS.md` è il punto di ripresa.
- Un task = un ID del `BACKLOG.md` = un commit.
- Modello giusto per il lavoro giusto: Opus per il dominio e l'architettura,
  Sonnet per l'implementazione su spec, Haiku per boilerplate, seed e test ripetitivi.
- Ogni query di dominio è filtrata per `beach_club_id`.
- Lo stato dell'ombrellone non si memorizza, si deriva.
- Non si costruisce nulla che non abbia un ID di requisito in `PROJECT_BRIEF.md`.
