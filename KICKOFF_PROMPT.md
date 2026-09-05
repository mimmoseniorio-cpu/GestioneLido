# Prompt di avvio — FASE 1

> Da incollare in una sessione nuova per far partire la FASE 1.
> Modello consigliato: **Opus** (è la fase dove sbagliare costa di più).

---

Stai lavorando al progetto **OmbrelloneOS**, gestionale per stabilimenti balneari.

Prima di qualsiasi cosa, leggi nell'ordine:
1. `STATUS.md` — dove siamo
2. `AGENT_PROTOCOL.md` — come si lavora qui
3. `PROJECT_BRIEF.md` — cosa costruiamo
4. `DECISIONS.md` — cosa è già deciso e cosa è aperto

Il tuo compito è la **FASE 1 — Specification**. Non scrivere codice
applicativo: nessun file in `app/`, `domain/` o `db/`. Il gate della fase è
documentale.

Produci in `docs/`, un file per punto:

| File | Contenuto |
|---|---|
| `docs/01-analisi.md` | Comprensione del problema e criticità individuate, incluse quelle che il brief non ha previsto |
| `docs/02-architettura.md` | Architettura proposta e stack con motivazioni; conferma o contesta `D-07`, `D-08`, `D-09` |
| `docs/03-modello-dati.md` | Entità, relazioni, constraint, indici, unique, gestione intervalli temporali, diagramma testuale |
| `docs/04-ruoli-permessi.md` | Matrice ruolo × azione × risorsa |
| `docs/05-sitemap-schermate.md` | Sitemap e elenco completo delle schermate con scopo di ciascuna |
| `docs/06-wireframe.md` | Wireframe descrittivi delle schermate principali, con varianti desktop / tablet / mobile |
| `docs/07-flussi-scenari.md` | I 6 scenari A–F passo per passo, con numero di interazioni contate |
| `docs/08-logica-stagionali.md` | Logica esatta stagionale → assenza → disponibilità → rivendita → credito → rientro, con macchina a stati e pseudocodice |
| `docs/09-conflitti-casi-limite.md` | Gestione conflitti, tutti i casi di `RD-04` più quelli che trovi tu, con comportamento atteso |
| `docs/10-mvp-roadmap.md` | Struttura dell'MVP, roadmap successiva, criteri di accettazione verificabili |
| `BACKLOG.md` | Task con ID `F2-01`, `F3-01`… derivati dai documenti sopra, ordinati e dimensionati per stare in una sessione |

Regole per questa fase:

- **Non inventare funzionalità** non presenti nel brief. Se ne individui una
  necessaria, aprila come decisione in `DECISIONS.md`, non implementarla.
- Ogni decisione di prodotto rilevante che incontri va scritta in
  `DECISIONS.md`. Se blocca il lavoro, marcala **DECISIONE RICHIESTA** e
  proponi già la soluzione che ritieni migliore, con il motivo in due righe.
- Le decisioni `D-01` … `D-10` esistono già: confermale, contestale con
  argomenti, o segnalale come ancora aperte. Non ignorarle.
- Dedica la cura maggiore a `docs/08` e `docs/09`. Sono il punto in cui il
  prodotto vale o non vale niente.
- Fai un commit per documento, con messaggio `docs(F1-0x): ...`.
- Alla fine aggiorna `STATUS.md` e fai push.

Chiudi il turno con: cosa hai prodotto, quali decisioni richiedono una risposta
dell'utente, e qual è il primo task di F2.
