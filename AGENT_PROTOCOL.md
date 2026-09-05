# Protocollo operativo per il coding agent

> Regole di lavoro. Valgono per qualunque agente o sessione, dalla prima
> all'ultima. Sono più importanti del codice: garantiscono che il lavoro non si
> perda e che i crediti non si brucino a rifare le stesse cose.

---

## 1. Regola zero: il lavoro non si perde mai

Le sessioni remote girano in container effimeri e il contesto viene riassunto
quando la conversazione si allunga. Di conseguenza:

> **Nessun turno finisce senza un commit pushato e `STATUS.md` aggiornato.**

Se il lavoro è a metà, si committa comunque come `wip:` scrivendo in `STATUS.md`
esattamente cosa manca. Un WIP documentato costa pochi secondi; ricostruire due
ore di ragionamento perso costa molto di più.

---

## 2. Come si apre una sessione

Nell'ordine, senza deviazioni:

1. Leggi `STATUS.md`. Solo quello.
2. Leggi `DECISIONS.md` se il task tocca una decisione aperta.
3. Leggi la sezione di `PROJECT_BRIEF.md` che riguarda il task (non tutto).
4. Apri **solo** i file elencati in `STATUS.md → File chiave del task corrente`.
5. Esegui il task. Non riesplorare il repository "per capire il contesto":
   se `STATUS.md` non basta, il problema è `STATUS.md` — sistemalo, non aggirarlo.

**Vietato** all'apertura: `find` ricorsivi sull'intero repo, leggere l'intero
`PROJECT_BRIEF.md`, rileggere file già descritti in `STATUS.md`.

---

## 3. Come si chiude una sessione

1. Test rilevanti eseguiti e verdi (o il fallimento è scritto in `STATUS.md`).
2. `STATUS.md` aggiornato: fatto, in corso, prossimi 3 task, blocchi.
3. Commit atomico con l'ID del task.
4. `git push -u origin <branch>`.
5. Una riga all'utente: cosa è stato fatto, cosa serve da lui, qual è il prossimo passo.

---

## 4. Unità di lavoro

Un task = una voce del `BACKLOG.md` con ID nella forma `F3-02` (fase, progressivo).

Un task ben dimensionato:
- si completa in una sessione;
- tocca al massimo 5–6 file;
- ha un criterio di "fatto" verificabile;
- produce un commit solo.

Se un task non ci sta in una sessione, va spezzato **prima** di iniziarlo, non a metà.

---

## 5. Git

**Branch**
```
main                 sempre verde, buildabile
feat/<id>-<slug>     es. feat/f3-02-schema-prenotazioni
fix/<id>-<slug>
```
Non si lavora mai direttamente su `main`.

**Commit** — convenzione Conventional Commits con ID task:
```
feat(F3-02): schema Reservation con vincolo di esclusione overlap
fix(F5-04): il pannello rapido non si chiudeva su tablet
wip(F6-11): motore prezzi, mancano le regole per giorno settimana
docs(F1-03): modello dati e diagramma relazioni
test(F3-05): overlap concorrenti su stesso ombrellone
chore: aggiornamento dipendenze
```

**Checkpoint**
Un checkpoint è un commit su cui il progetto è coerente e ripartibile.
Se ne fa uno:
- alla fine di ogni task;
- alla fine di ogni fase (taggato: `git tag f3-complete`);
- prima di qualunque refactor esteso;
- prima di chiudere il turno, sempre.

**Pull Request**
Si apre solo su richiesta esplicita dell'utente.

---

## 6. `STATUS.md` — il file più importante del repository

Va aggiornato a ogni checkpoint. È il punto di ripresa dell'intero progetto.
Struttura fissa, non improvvisare sezioni:

```markdown
# STATUS

Aggiornato: <data>  ·  Ultimo checkpoint: <sha breve>  ·  Branch: <branch>

## Fase corrente
F3 — Data model  (gate: migrazione applicata + test overlap verdi)

## Fatto
- [F3-01] Setup Prisma + connessione Postgres — commit a1b2c3d
- [F3-02] Entità BeachClub/User/Umbrella — commit d4e5f6a

## In corso
[F3-03] Vincolo EXCLUDE su reservation_item
Manca esattamente: la migrazione grezza non passa perché btree_gist non è
abilitato; serve `CREATE EXTENSION btree_gist` come prima migrazione.
File toccati: db/migrations/003_overlap.sql, db/schema.prisma

## Prossimi 3
1. [F3-04] Seed demo 90 ombrelloni deterministico
2. [F3-05] Test overlap concorrenti
3. [F3-06] Indici multi-tenant

## Blocchi e decisioni aperte
- D-01 policy conflitto assenza già rivenduta — serve risposta dell'utente

## Come far girare il progetto
<comandi esatti: install, db, migrate, seed, dev, test>

## File chiave
<mappa breve: percorso → a cosa serve>
```

Regola: chi legge `STATUS.md` deve poter riprendere il lavoro **senza fare
domande e senza esplorare il repo**.

---

## 7. `DECISIONS.md`

Ogni scelta non ovvia viene registrata. Formato:

```markdown
### D-07 — Monolite Next.js invece di backend separato
Stato: DECISA (2026-09-05)
Contesto: ...
Opzioni: A) ... B) ...
Scelta: A
Motivo: ...
Conseguenze: ...
```

Stati ammessi: `APERTA` · `DECISA` · `SUPERATA`.

Una decisione con stato `APERTA` che blocca il lavoro va portata all'utente
marcata **DECISIONE RICHIESTA**, con una proposta motivata già pronta: l'utente
deve poter rispondere "ok" e basta.

---

## 8. Razionalizzazione dei crediti

I crediti si consumano soprattutto in tre modi: modelli potenti su lavori
banali, ri-esplorazione dello stesso codice, e lavoro rifatto perché perso.
Le regole sotto attaccano tutti e tre.

### 8.1 Instradamento per modello

| Tipo di attività | Modello | Perché |
|---|---|---|
| Analisi di dominio, modello dati, logica overlap/stagionali, architettura, scelte di stack, review di sicurezza, debug non banale | **Opus** | Errori qui costano più di quanto costi il modello |
| Implementazione di una spec già scritta, CRUD, endpoint, componenti UI, refactor guidati, correzione test rossi | **Sonnet** | Miglior rapporto qualità/costo, copre l'80% del lavoro |
| Boilerplate, seed data, test ripetitivi, rinomina, changelog, aggiornamento `STATUS.md`, formattazione, commit message, conversioni meccaniche | **Haiku** | Lavoro deterministico, non serve ragionamento |

In Claude Code si cambia con `/model`. Un agente delegato può ricevere un
modello diverso dal padre, quindi conviene delegare i lavori meccanici.

**Regola pratica:** l'unico lavoro che merita Opus è quello dove *sbagliare
costa*. Tutto il resto scende di livello.

Fasi e modelli:
- F1 (specification) e F3 (data model) → prevalentemente Opus.
- F2, F4 → Opus per le scelte, Sonnet per la stesura.
- F5, F6, F7 → prevalentemente Sonnet, Haiku per seed, boilerplate e test ripetitivi.

### 8.2 Non pagare due volte per lo stesso contesto

- `STATUS.md` sostituisce l'esplorazione del repo. Tenerlo accurato è la singola
  ottimizzazione di costo più efficace del progetto.
- Non incollare file interi quando basta una funzione. Usa ricerche mirate.
- Non rileggere un file appena modificato per "verificare": se la modifica fosse
  fallita, lo strumento avrebbe dato errore.
- Una sessione = una fase (o pochi task affini). Mescolare argomenti diversi
  gonfia il contesto e fa scattare i riassunti.

### 8.3 Non buttare lavoro

- Checkpoint frequenti (§5). Il lavoro perso si paga due volte.
- Prima di un refactor esteso: commit di checkpoint.
- Prima di scrivere codice su un requisito ambiguo: chiedi. Costa una domanda,
  non una riscrittura.

### 8.4 Non costruire ciò che non serve

Ogni feature passa il test del §3 di `PROJECT_BRIEF.md`. La lista §4.2 è una
lista di divieti, non di suggerimenti. Il codice non scritto è il più economico
da mantenere.

---

## 9. Qualità: cosa significa "fatto"

Un task è fatto quando:

- [ ] Il comportamento richiesto funziona sui dati demo realistici (80–100 ombrelloni).
- [ ] Ha test dove la logica è di dominio (regole `RD-01`…`RD-04` sempre testate).
- [ ] Typecheck e lint passano.
- [ ] Funziona su tablet, non solo su desktop.
- [ ] Le operazioni critiche scrivono nell'audit log.
- [ ] Lo scoping multi-tenant è presente in ogni query (nessuna query senza `beach_club_id`).
- [ ] `STATUS.md` è aggiornato e il commit è pushato.

Non è fatto se: "funziona ma i test non li ho scritti", "lo sistemo dopo",
"su mobile si vede male".

---

## 10. Vincoli tecnici sempre validi

1. Il livello `domain/` non importa mai Prisma, React o oggetti HTTP.
2. Ogni query di dominio è filtrata per `beach_club_id`. Nessuna eccezione.
3. Ogni operazione che tocca disponibilità o prenotazioni è dentro una transazione.
4. Le date di soggiorno sono `DATE`. Mai `TIMESTAMP` per l'inizio o la fine di
   un soggiorno.
5. Il prezzo applicato viene congelato sulla prenotazione.
6. Nessun segreto nel repository. Solo `.env.example` con i nomi delle variabili.
7. Nessuno stato ombrellone persistito: si deriva (`RD-01`).
8. Ogni endpoint valida l'input lato server, sempre, anche se la UI già valida.

---

## 11. Quando fermarsi e chiedere

Fermati e chiedi solo se procedere in un modo o nell'altro cambierebbe il
lavoro in modo sostanziale e irreversibile. In tutti gli altri casi: scegli
l'opzione più sensata, scrivila in `DECISIONS.md` come `DECISA`, vai avanti, e
segnala la scelta nel messaggio di chiusura.

Non fermarti per: nomi di variabili, dettagli di stile, quale libreria minore
usare, come strutturare una cartella.

Fermati per: policy di prodotto che coinvolgono soldi o diritti del cliente
(es. `D-01`), cambi di stack, tutto ciò che l'utente deve poter difendere
davanti al gestore dello stabilimento.
