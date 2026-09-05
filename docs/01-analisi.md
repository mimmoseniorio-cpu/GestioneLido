# 01 — Analisi del problema e criticità

**Fase:** F1 · **Stato:** completo

---

## 1. Che problema stiamo risolvendo davvero

Il brief descrive un gestionale. Ma il problema vero non è "mancanza di
software": è che **l'informazione sullo stato dello stabilimento vive nella
testa del gestore**. Il quaderno è solo un promemoria parziale di quella
conoscenza.

Questo produce tre costi concreti:

| Costo | Come si manifesta |
|---|---|
| **Posti invenduti** | Lo stagionale non viene, nessuno lo sa, l'ombrellone resta vuoto tutto il giorno. È ricavo perso ogni singolo giorno di alta stagione. |
| **Errori davanti al cliente** | Doppia assegnazione, prezzo sbagliato, "avevo detto il 63 non il 36". Costano credibilità, non solo soldi. |
| **Dipendenza da una persona** | Se il gestore non c'è, nessun altro può rispondere al telefono con sicurezza. Lo stabilimento non scala oltre di lui. |

Il prodotto vince se attacca il primo costo, perché è l'unico che genera
**ricavo aggiuntivo** invece di limitarsi a togliere fastidi. La rivendita del
posto stagionale assente è la funzione che paga il prodotto. Tutto il resto è
condizione necessaria perché quella funzione sia usabile.

### Conseguenza sulla priorità

L'ordine di valore non è quello dell'elenco MVP. È:

1. Il gestore vede **cosa può vendere oggi** (mappa + assenze).
2. Lo stagionale riesce a dire **"non vengo"** senza attrito.
3. Il gestore **rivende** in pochi secondi.
4. Tutto il resto.

Se i punti 1–3 non sono eccellenti, gli altri 13 requisiti dell'MVP non salvano
il prodotto.

---

## 2. Chi userà il software, realmente

Vale la pena essere espliciti, perché condiziona ogni scelta di UI.

**Il gestore/bagnino non è un impiegato alla scrivania.** È in piedi, spesso al
sole diretto, con le mani sporche di sabbia o bagnate, spesso con qualcuno che
gli parla contemporaneamente, e in alta stagione fa questa operazione decine di
volte al giorno. Non leggerà mai un manuale. Non tollererà un flusso a 5 step.

Implicazioni progettuali non negoziabili:
- Testo grande, contrasto alto (schermo sotto il sole).
- Target touch grandi: dita bagnate e imprecise.
- Nessuna conferma superflua, ma **annullamento sempre disponibile** — è più
  veloce sbagliare e annullare che confermare ogni volta.
- Nessun campo obbligatorio non essenziale: se per assegnare un ombrellone
  servono 6 campi, l'operatore userà il quaderno.

**Lo stagionale è spesso una persona anziana.** L'area cliente deve funzionare
per chi non installa app, non ricorda password, e usa il telefono con caratteri
grandi. Questo giustifica da solo la scelta del magic link (`D-05`).

---

## 3. Criticità individuate

Ordinate per gravità. Quelle marcate **DECISIONE RICHIESTA** sono in
`DECISIONS.md` e bloccano l'implementazione.

### C-01 — Manca l'entità "Stagione" nel modello dati proposto
**Gravità: alta. Non prevista dal brief.**

Il brief elenca 15 entità ma non include `Season`. Senza di essa:
- un `SeasonalContract` non ha un contenitore temporale a cui appartenere;
- il listino non sa distinguere il 2027 dal 2026;
- il rinnovo annuale ("rifammi gli stessi stagionali dell'anno scorso") diventa
  una migrazione manuale;
- lo storico si mescola tra anni e le statistiche future sono inutilizzabili.

Aggiungerla dopo significa toccare quasi tutte le tabelle. Aggiungerla ora costa
una colonna. → **`D-11`**

### C-02 — L'assenza dichiarata tardi non è vendibile
**Gravità: alta. Non prevista dal brief.**

Il brief tratta l'assenza come sempre utile. Nella realtà, uno stagionale che
alle 11:30 di ferragosto dichiara "oggi non vengo" libera un posto che nessuno
comprerà più: i clienti sono arrivati alle 9. Peggio: se il sistema gli
accredita comunque un credito, lo stabilimento paga per nulla.

Serve un **orario di taglio configurabile** (proposta: entro le 20:00 del giorno
precedente, oppure entro le 09:00 dello stesso giorno). Dopo il taglio l'assenza
si può comunque dichiarare — è un'informazione utile al gestore — ma **non
matura credito** e viene marcata come "tardiva". → **`D-12`**

### C-03 — Il credito crea un incentivo da controllare
**Gravità: media-alta. Non prevista dal brief.**

Se il credito è generoso, uno stagionale razionale dichiara assenze anche quando
è incerto, "tanto se poi vengo annullo". Questo genera:
- posti mostrati come vendibili e poi ritirati;
- rumore nella pianificazione del gestore;
- nel caso peggiore, il conflitto di `D-01` ripetuto ogni settimana.

Contromisure previste nel modello: credito che matura **solo a rivendita
avvenuta** (già nel brief, `RF-CRD-01` — corretto), tetto stagionale
configurabile al credito maturabile, e conteggio delle assenze annullate visibile
al gestore. → **`D-13`**

### C-04 — "Ombrelloni vicini" non è definito
**Gravità: media. Ambiguità del brief.**

`RF-AVL-02` chiede ombrelloni adiacenti, ma "vicino" non è una proprietà del
dato: va derivata dalla geometria. Domande a cui l'algoritmo deve rispondere:
- Due ombrelloni separati da un corridoio sono adiacenti?
- Il 12 e il 13 di file diverse sono vicini quanto il 12 e il 13 della stessa fila?
- Se non esistono due adiacenti, si propongono due vicini "abbastanza"?

Proposta: adiacenza calcolata su **distanza euclidea nella griglia**, con
penalità configurabile per il cambio fila e per l'attraversamento di un
corridoio. L'algoritmo restituisce sempre un punteggio, mai un booleano, così può
proporre il "meglio disponibile" quando l'ideale non c'è. Definito in
`docs/03` e `docs/09`.

### C-05 — Il doppio tap su rete lenta crea doppie prenotazioni
**Gravità: media-alta. Non prevista dal brief.**

`NF-02` chiede di gestire la rete instabile, ma il caso concreto più probabile è
questo: l'operatore tocca "Conferma", non succede niente per due secondi, tocca
di nuovo. Il vincolo di `RD-02` blocca la seconda prenotazione **sullo stesso
ombrellone** — bene — ma su operazioni come "registra pagamento" produrrebbe due
incassi.

Serve una **chiave di idempotenza** generata dal client su ogni operazione di
scrittura. Costa poco ora, è un incubo da aggiungere dopo. → definito in `docs/02`.

### C-06 — Il magic link condiviso è un problema GDPR
**Gravità: media.**

Il link personale dello stagionale verrà inoltrato su WhatsApp, salvato nella
chat di famiglia, letto da chiunque abbia il telefono in mano. Chi ha il link
vede nome, telefono e storico del cliente.

Mitigazione proposta: l'area stagionale mostra **solo il minimo indispensabile**
(numero ombrellone, calendario, assenze, credito), mai il telefono o l'anagrafica
completa; token revocabile dal gestore; scadenza a fine stagione; nessuna azione
distruttiva accessibile dal link.

### C-07 — Le mappe reali non sono griglie regolari
**Gravità: media. Ambiguità del brief.**

Il brief assume file e numerazione ordinate. Gli stabilimenti reali hanno:
numeri saltati, ombrelloni "bis" (63, 63A), file di lunghezza diversa, gruppi
ruotati, prime file con passo diverso, aree non rettangolari.

Il modello deve quindi memorizzare **coordinate esplicite** (`pos_x`, `pos_y`)
e trattare la fila come un'etichetta, non come una coordinata calcolata. Il
numero visibile deve essere una **stringa**, non un intero.

### C-08 — La configurazione iniziale è il vero ostacolo all'adozione
**Gravità: media. Non prevista dal brief.**

Nessun gestore posizionerà 90 ombrelloni uno a uno con il mouse a stagione
iniziata. Se la configurazione richiede un'ora, il prodotto non viene mai
adottato.

Serve un **generatore di griglia**: "5 file da 18 ombrelloni, numerazione da 1,
progressiva per fila" crea la mappa in un colpo, poi si aggiusta. È un requisito
di adozione, non una comodità. → aggiunto come `MVP-03b` in `docs/10`.

### C-09 — Il prestito informale del posto stagionale esiste
**Gravità: bassa nell'MVP, alta come aspettativa.**

Nella pratica lo stagionale presta il posto a parenti e amici. Il gestore lo sa e
lo tollera. Se il sistema tratta ogni presenza non prevista come anomalia, il
gestore smetterà di fidarsi dei dati.

Nell'MVP è sufficiente che l'assenza sia **facoltativa**: lo stagionale non è
obbligato a dichiarare nulla, e il posto non dichiarato resta suo. Da non
implementare ora: la registrazione dell'ospite.

### C-10 — Modifica del periodo e prezzo congelato sono in tensione
**Gravità: bassa. Ambiguità del brief.**

`RF-RES-04` congela il prezzo sulla prenotazione. Ma se il cliente estende da 5 a
8 giorni, il prezzo va ricalcolato — su quale listino, quello di oggi o quello
del momento della prenotazione?

Proposta: il prezzo si ricalcola **solo sui giorni aggiunti**, con il listino
vigente al momento della modifica; i giorni originali mantengono il prezzo
congelato. Ogni riga di prezzo resta tracciata nel `breakdown`. Registrato in
`docs/09`.

### C-11 — Multi-tenant senza un secondo cliente è un'astrazione non validata
**Gravità: bassa, ma da dichiarare.**

Il brief chiede multi-tenant dal giorno uno con un solo stabilimento reale. È la
scelta giusta — riadattare dopo costa moltissimo — ma va fatta nel modo più
economico: **una colonna `beach_club_id` ovunque + scoping forzato**, non
schemi separati o database per tenant. Nessun costo operativo aggiuntivo finché
i clienti sono pochi. → `D-08`.

### C-12 — Chi ha incassato i contanti
**Gravità: bassa, ma risolve discussioni reali.**

Con più operatori e pagamenti in contanti, la domanda "chi ha preso questi soldi"
si pone. `Payment` deve registrare l'operatore, non solo l'importo. Costa una
colonna e l'audit log lo prevede già (`RF-SYS-04`).

---

## 4. Cosa il brief chiede e che va ridimensionato

Tre requisiti, presi alla lettera, costerebbero molto e renderebbero poco.

| Requisito | Lettura letterale | Lettura proposta |
|---|---|---|
| `RF-CUS-04` preferenze cliente | Motore che applica automaticamente le preferenze nella ricerca | Nell'MVP le preferenze si **mostrano** al momento della prenotazione. L'applicazione automatica è `R4`, post-MVP. Il valore è già nel mostrarle. |
| `RF-DSH-04` calendario giorno/settimana/mese | Tre viste calendario complete | Nell'MVP **una** vista: griglia ombrelloni × giorni su un intervallo scorrevole. Copre tutti e tre i casi d'uso senza costruire tre componenti. |
| `RF-PRC-01` listino a 7 dimensioni | Motore di regole generico | Regole con **priorità e sovrapposizione**, valutate in ordine, prima corrispondenza vince. Non serve un motore generico: servono 5–10 regole per stabilimento. |

---

## 5. Cosa NON è un rischio, contrariamente all'apparenza

- **Performance.** 100 ombrelloni × 180 giorni = 18.000 combinazioni. Qualunque
  database gestisce questi numeri senza sforzo. Il rischio è nel numero di
  round-trip di rete, non nel volume dei dati.
- **Concorrenza.** Due operatori, non duemila. Il vincolo di esclusione
  PostgreSQL è più che sufficiente, non serve alcun sistema di lock distribuito.
- **Offline completo.** Il gestore è alla reception, con il wifi dello
  stabilimento. Serve robustezza alle micro-interruzioni, non un'architettura
  offline-first (che costerebbe quanto tutto il resto dell'MVP).

---

## 6. Riepilogo delle decisioni aperte generate da questa analisi

| ID | Argomento | Blocca |
|---|---|---|
| `D-01` | Conflitto assenza già rivenduta | `RF-SEA-05`, `RD-03` |
| `D-11` | Entità `Season` | Tutto il modello dati |
| `D-12` | Orario di taglio per l'assenza | Logica credito |
| `D-13` | Tetto al credito stagionale | Logica credito |

Le altre (`D-02` … `D-10`) sono già in `DECISIONS.md` con proposta.
