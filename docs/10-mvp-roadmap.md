# 10 — Struttura MVP, roadmap e criteri di accettazione

**Fase:** F1 · **Stato:** completo

---

## 1. Che cos'è l'MVP di questo prodotto

Non "la versione ridotta". È **la versione minima che il gestore può usare al
posto del quaderno per un'intera stagione**. Se durante agosto deve tenere il
quaderno accanto al tablet, l'MVP non è finito, per quante funzioni abbia.

Il criterio è binario: il quaderno sparisce, oppure no.

---

## 2. Ordine di costruzione

L'ordine non segue l'elenco `MVP-01…17` del brief: segue le **dipendenze** e il
principio che le regole di dominio vanno costruite e testate prima della UI.

```
F3  Fondamenta            schema, vincoli, seed demo
     └─ F4  Impalcatura   auth, tenancy, audit, CI, deploy
          └─ F5 Prototipo mappa + prenota/libera  ← primo momento in cui si vede qualcosa
               └─ F6 MVP  tutto il resto
                    └─ F7 Test e prova sul campo
```

**Perché la mappa arriva prima delle anagrafiche.** Il rischio maggiore del
progetto non è tecnico: è che la mappa non sia leggibile con 96 ombrelloni su un
tablet. Va scoperto alla settimana 3, non alla settimana 10. Il prototipo di F5
esiste per questo.

---

## 3. Le fasi in dettaglio

### F3 — Fondamenta
Schema Prisma completo, migrazioni, **i tre vincoli di esclusione**, indici,
seed demo deterministico da 96 ombrelloni.

*Gate:* la migrazione si applica su un database vuoto **e** i test T-08, T-03,
T-27 passano — cioè il database rifiuta davvero le sovrapposizioni.

Non si prosegue senza questo gate. È la fondazione: costruire sopra un vincolo
mancante significa riscrivere tutto dopo.

### F4 — Impalcatura
Autenticazione staff, contesto tenant, repository layer con scoping forzato,
audit log, gestione errori di dominio, idempotenza, CI, tre ambienti.

*Gate:* build verde, T-60 e T-61 passano (isolamento multi-tenant), un'operazione
scrive nell'audit log.

### F5 — Prototipo
Mappa SVG con stati derivati, pannello rapido, prenota / libera / assegna.
Solo questo. Nessuna dashboard, nessun listino, nessuna area cliente.

*Gate:* scenari A e F dimostrabili su dati demo, su un tablet vero.

**Questo gate va superato con una persona reale davanti al tablet**, non con uno
screenshot. È il primo punto in cui si può scoprire che la mappa non funziona, e
correggere costa ancora poco.

### F6 — MVP
Nell'ordine: ricerca disponibilità → stagionali e assenze → area cliente →
rivendita e crediti → listino → pagamenti → clienti e preferenze → ricerca
globale → dashboard → calendario → editor mappa → PWA.

*Gate:* i 10 criteri del §4.

### F7 — Test e prova sul campo
Suite completa, E2E dei sei scenari con conteggio delle interazioni, prova su
rete degradata, e **una mezza giornata di uso reale con il gestore**.

*Gate:* i sei test critici di `docs/09` §10 verdi, e il gestore completa le
operazioni della mattina senza aprire il quaderno.

---

## 4. Criteri di accettazione dell'MVP

Sostituiscono e precisano quelli di `PROJECT_BRIEF.md` §13. Tutti su dati demo
realistici (96 ombrelloni, 28 stagionali).

| # | Criterio | Come si verifica |
|---|---|---|
| 1 | Un operatore mai formato assegna un ombrellone libero a un cliente nuovo in **< 60 s**, senza istruzioni | Prova con una persona reale, cronometrata |
| 2 | I nove criteri di interazione di `docs/07` §Riepilogo sono rispettati | Test E2E che contano le interazioni |
| 3 | Due prenotazioni concorrenti sullo stesso ombrellone: una sola riesce | T-08, richieste parallele reali |
| 4 | Ciclo completo dichiara → vende → credito → rientro automatico | T-20 end-to-end |
| 5 | Tutti i casi limite di `docs/09` hanno un test che passa | Suite completa |
| 6 | Nessun dato attraversa il confine tra stabilimenti | T-60, T-61 su ogni endpoint |
| 7 | Installabile come PWA, usabile su tablet in verticale e orizzontale | Prova su dispositivo reale |
| 8 | Ogni operazione critica è nell'audit con stato prima/dopo | Ispezione dopo un giro di operazioni |
| 9 | La dashboard quadra con la somma delle prenotazioni del giorno | Test di consistenza sui dati demo |
| 10 | Con rete instabile nessuna operazione risulta persa o ambigua | Prova con rete degradata simulata |
| 11 | **Il gestore completa una mattina di lavoro senza il quaderno** | Prova sul campo |

Il criterio 11 è quello che conta. Gli altri dieci esistono perché senza di essi
l'undicesimo non è raggiungibile.

---

## 5. Copertura di test richiesta

| Ambito | Livello | Copertura minima |
|---|---|---|
| `domain/` — regole pure | Unit | **100% dei rami** su `umbrellaState`, motore prezzi, punteggio prossimità, macchina a stati assenze |
| Vincoli del database | Integration | Ogni vincolo di esclusione ha un test che lo viola e verifica il rifiuto |
| Concorrenza | Integration | T-08 con richieste realmente parallele, non simulate |
| Multi-tenant | Integration | Ogni endpoint, entrambe le direzioni |
| Autorizzazione | Integration | Generati dalla matrice di `docs/04` |
| Scenari A–F | E2E | Percorso completo **con conteggio delle interazioni** |

Il 100% sul livello `domain/` è realistico proprio perché è codice puro senza
dipendenze: sono funzioni con input e output, e sono le uniche in cui un errore
produce una doppia vendita.

---

## 6. Roadmap post-MVP

Nulla di questo si inizia prima del criterio 11.

| ID | Cosa | Quando ha senso |
|---|---|---|
| `R1` | Offline-first PWA con coda di sincronizzazione | Se emerge che la rete dello stabilimento cade davvero |
| `R2` | Notifiche reali: email → WhatsApp Business → push | Dopo la prima stagione, con dati d'uso |
| `R3` | Pagamenti online (Stripe / Nexi) | Quando il gestore vuole acconti a distanza |
| `R4` | Applicazione automatica delle preferenze nella ricerca | Quando ci sono abbastanza preferenze inserite da renderla utile |
| `R5` | Mezza giornata e fasce orarie | Su richiesta reale, non prima |
| `R6` | Statistiche stagionali e previsione occupazione | Serve almeno una stagione completa di dati |
| `R7` | API pubbliche di disponibilità → marketplace | Quando esistono più stabilimenti |
| `R8` | Lettini, sdraio, servizi accessori | Estensione naturale di `Umbrella` |
| `R9` | Rinnovo stagionali da un anno all'altro | Prima della **seconda** stagione: allora diventa la funzione più richiesta |

`R9` non è nell'MVP perché il primo anno non c'è nulla da rinnovare. Ma è la
ragione per cui `Season` esiste da subito (`D-11`): senza, quel giorno arriva e
richiede una migrazione.

---

## 7. Rischi e mitigazioni

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| La mappa non è leggibile con 96 ombrelloni su tablet | Media | **Alto** | Gate F5 con dispositivo reale, prima di costruirci sopra |
| Il gestore non configura la mappa e abbandona | Media | **Alto** | Generatore di griglia (`C-08`), obbligatorio nell'MVP |
| Gli stagionali non usano il link e telefonano | **Alta** | Medio | L'operatore può registrare l'assenza per loro (`docs/07` scenario C variante) |
| Il conflitto `D-01` capita al primo cliente e incrina la fiducia | Media | Alto | Policy chiara, credito trasparente, messaggi che spiegano invece di negare |
| Sovrapposizione sfuggita al codice applicativo | Bassa | **Critico** | Vincolo nel database, non nel codice |
| Il prodotto si allarga a bar, lettini, personale | **Alta** | Alto | Lista dei divieti in `PROJECT_BRIEF.md` §4.2, da rileggere a ogni richiesta |
| Rete instabile in reception | Media | Medio | Idempotenza + stato di sincronizzazione visibile; `R1` se serve davvero |

Il rischio con probabilità più alta è l'allargamento dello scope. Il gestore
chiederà la gestione del bar entro la prima settimana. La risposta è nel brief.

---

## 8. Come si capisce che l'MVP è finito

Tre domande, tutte con risposta sì:

1. Il gestore ha smesso di usare il quaderno?
2. Ha rivenduto almeno un posto stagionale grazie a un'assenza dichiarata?
3. Un operatore diverso dal titolare ha lavorato una giornata senza chiedere aiuto?

La seconda è la più importante: dimostra che la funzione distintiva del prodotto
non solo esiste, ma viene usata.
