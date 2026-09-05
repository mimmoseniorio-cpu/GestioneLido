# 03 — Modello dati

**Fase:** F1 · **Stato:** completo · **Criticità:** massima

> Questo documento e `docs/08` sono i due su cui il prodotto vale o non vale
> niente. Ogni scelta qui è motivata; le motivazioni non sono decorative, sono
> il vincolo che impedisce a un'implementazione futura di "semplificare".

---

## 1. Principi

1. **Nessuno stato persistito che possa disallinearsi.** Lo stato di un
   ombrellone non è una colonna: è una funzione di contratti, assenze e
   prenotazioni (`RD-01`, `D-10`).
2. **I vincoli stanno nel database, non nelle intenzioni.** Se una regola deve
   valere sempre, è un constraint. Il codice applicativo fornisce messaggi
   comprensibili, non la garanzia.
3. **Ogni tabella di dominio ha `beach_club_id`.** Nessuna eccezione, nessuna
   tabella "globale" che possa far filtrare dati tra stabilimenti.
4. **Le date di soggiorno sono `DATE`.** Mai `TIMESTAMP`. Un soggiorno non ha
   fuso orario; introdurne uno crea bug all'ora legale e alla mezzanotte.
5. **Il denaro è in centesimi interi.** Mai `float`. `amount_cents INTEGER`.
6. **Gli intervalli sono inclusivi**: `[start_date, end_date]`. Il 10–12 agosto
   sono tre giorni. È come parla il gestore, ed è come devono comportarsi i dati.

---

## 2. Diagramma delle relazioni

```
BeachClub ─┬─ User
           ├─ Season ─────────┬─ PriceRule
           │                  ├─ SeasonalContract ─┬─ SeasonalAbsence
           │                  │                    └─ CreditTransaction
           │                  └─ Reservation ─── ReservationItem
           ├─ BeachMap ─┬─ Zone ─── Umbrella ──────────┘   │
           │            └─ MapFeature                       │
           ├─ Customer ─┬─ CustomerPreference               │
           │            ├─ SeasonalContract ────────────────┘
           │            └─ Reservation
           ├─ Payment ─── Reservation
           ├─ AuditLog
           └─ IdempotencyKey
```

Legenda delle cardinalità principali:
- `Umbrella` 1 ─ N `ReservationItem` (nel tempo, mai sovrapposti)
- `Umbrella` 1 ─ N `SeasonalContract` (uno per stagione)
- `SeasonalContract` 1 ─ N `SeasonalAbsence`
- `Reservation` 1 ─ N `ReservationItem` (più ombrelloni nella stessa prenotazione)
- `Reservation` 1 ─ N `Payment` (acconto + saldo)

---

## 3. Entità

### 3.1 `BeachClub` — il tenant
| Campo | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | |
| `slug` | text | unique globale, per URL futuri |
| `timezone` | text | default `Europe/Rome`, usato per "oggi" e per il cutoff |
| `settings` | jsonb | policy configurabili: cutoff assenze, % credito, tetto credito, policy `D-01` |
| `created_at` | timestamptz | |

`settings` come `jsonb` è deliberato: le policy per-stabilimento cresceranno
(`D-01`, `D-12`, `D-13`) e non meritano una colonna ciascuna. Sono lette
attraverso uno schema tipizzato con default, mai grezze.

### 3.2 `Season` — **nuova entità, vedi `C-01` / `D-11`**
| Campo | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `beach_club_id` | uuid FK | |
| `year` | int | |
| `start_date`, `end_date` | date | estremi della stagione |
| `status` | enum | `PLANNING` · `ACTIVE` · `CLOSED` |
| `created_at` | timestamptz | |

- unique `(beach_club_id, year)`
- Vincolo: al massimo una stagione `ACTIVE` per stabilimento.

**Perché esiste.** Senza `Season`, un contratto stagionale non ha contenitore
temporale, il listino non distingue gli anni, e "rinnova gli stagionali
dell'anno scorso" diventa una migrazione manuale. Aggiungerla dopo tocca quasi
ogni tabella; aggiungerla ora costa una colonna.

### 3.3 `User` — staff
| Campo | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `beach_club_id` | uuid FK | |
| `email` | citext | unique `(beach_club_id, email)` |
| `password_hash` | text | Argon2id |
| `name` | text | |
| `role` | enum | `ADMIN` · `OPERATOR` |
| `active` | bool | disattivazione invece di cancellazione: l'audit deve restare leggibile |
| `last_login_at` | timestamptz | |

### 3.4 `BeachMap`, `Zone`, `MapFeature`
`BeachMap`: una mappa per stabilimento nell'MVP, ma modellata come entità
perché la riconfigurazione tra stagioni è normale (`(beach_club_id, season_id)`).

| `BeachMap` | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `beach_club_id` | uuid FK | |
| `season_id` | uuid FK nullable | null = mappa valida per tutte le stagioni |
| `width`, `height` | int | dimensioni della griglia logica |

`Zone`: raggruppamento tariffario e logico (prima fila, zona verde, area famiglie).
| Campo | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `beach_club_id`, `beach_map_id` | uuid FK | |
| `name` | text | |
| `color` | text | solo etichetta visiva, mai portatore di significato |
| `sort_order` | int | |

`MapFeature`: tutto ciò che non è un ombrellone ma sta sulla mappa —
corridoi, passerelle, ingressi, bagni, bar, aree non prenotabili.
| Campo | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `beach_club_id`, `beach_map_id` | uuid FK | |
| `kind` | enum | `WALKWAY` · `CORRIDOR` · `ENTRANCE` · `SERVICE` · `BLOCKED_AREA` |
| `label` | text nullable | |
| `pos_x`, `pos_y`, `width`, `height` | int | rettangolo sulla griglia |

Le `MapFeature` di tipo `WALKWAY` e `CORRIDOR` **non sono decorazione**: entrano
nel calcolo dell'adiacenza (`C-04`, §7).

### 3.5 `Umbrella`
| Campo | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `beach_club_id`, `beach_map_id` | uuid FK | |
| `zone_id` | uuid FK nullable | |
| `visible_number` | **text** | vedi nota |
| `row_label` | text | etichetta fila (`A`, `1`, `Prima fila`) |
| `pos_x`, `pos_y` | int | posizione sulla griglia |
| `category` | text nullable | es. `standard`, `prima fila`, `gazebo` |
| `base_price_cents` | int nullable | fallback se nessuna `PriceRule` corrisponde |
| `capacity` | int | default 4, numero massimo di persone |
| `blocked` | bool | **unico stato persistito ammesso** |
| `blocked_reason` | text nullable | |
| `notes` | text nullable | |

- unique `(beach_club_id, visible_number)`
- index `(beach_club_id, beach_map_id)`
- index `(beach_club_id, row_label)`

**`visible_number` è testo, non intero** (`C-07`): esistono ombrelloni `63A`,
`12bis`, numerazioni con lettere per fila. La ricerca globale (`RF-SYS-01`) fa
prefix match su questo campo.

**`blocked` è l'unico stato memorizzato**: non è derivabile da nulla, è una
decisione umana ("ombrellone rotto"). Tutti gli altri stati si calcolano (§6).

### 3.6 `Customer`
| Campo | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `beach_club_id` | uuid FK | |
| `first_name`, `last_name` | text | |
| `phone_raw` | text | come digitato dall'operatore |
| `phone_normalized` | text | E.164, generato |
| `email` | citext nullable | |
| `notes` | text nullable | |
| `is_seasonal` | bool | **derivato e denormalizzato** per la ricerca; ricalcolato a ogni variazione di contratto |
| `anonymized_at` | timestamptz nullable | GDPR |
| `created_at` | timestamptz | |

- unique `(beach_club_id, phone_normalized)` where `phone_normalized is not null`
- index trigram su `last_name`, `first_name` per la ricerca mentre si digita
- index `(beach_club_id, phone_normalized)`

**Il telefono normalizzato è l'identificativo operativo** (`D-04`): è il dato che
il gestore ha sempre. La normalizzazione avviene a livello applicativo prima
della scrittura; i duplicati non danno errore secco ma proposta di unione.

### 3.7 `CustomerPreference`
| Campo | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `beach_club_id`, `customer_id` | uuid FK | |
| `preferred_row` | text nullable | |
| `preferred_zone_id` | uuid FK nullable | |
| `preferred_umbrella_id` | uuid FK nullable | |
| `near_customer_ids` | uuid[] | vicino a questi clienti |
| `sea_proximity` | enum nullable | `NEAR` · `FAR` · `INDIFFERENT` |
| `side` | enum nullable | `LEFT` · `RIGHT` · `CENTER` |
| `free_notes` | text nullable | |

Nell'MVP queste preferenze si **mostrano**, non si applicano automaticamente
(`C-04` del doc 01, requisito ridimensionato). L'applicazione automatica è `R4`.

### 3.8 `SeasonalContract`
| Campo | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `beach_club_id`, `season_id` | uuid FK | |
| `customer_id`, `umbrella_id` | uuid FK | |
| `start_date`, `end_date` | date | può essere più corto della stagione |
| `price_cents` | int | prezzo pattuito del contratto |
| `status` | enum | `ACTIVE` · `CANCELLED` |
| `access_token_hash` | text | magic link, hashato |
| `token_revoked_at` | timestamptz nullable | |
| `credit_balance_cents` | int | saldo, mantenuto dalle `CreditTransaction` |
| `created_at` | timestamptz | |

- **Vincolo di esclusione**: nessun contratto attivo sovrapposto sullo stesso
  ombrellone (§5.2).
- index `(beach_club_id, season_id, umbrella_id)`

`credit_balance_cents` è una denormalizzazione: la verità è la somma delle
`CreditTransaction`. Un test di consistenza verifica che coincidano.

### 3.9 `SeasonalAbsence`
| Campo | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `beach_club_id`, `seasonal_contract_id` | uuid FK | |
| `start_date`, `end_date` | date | inclusivi |
| `declared_at` | timestamptz | quando è stata comunicata |
| `declared_by` | enum | `CUSTOMER` · `STAFF` |
| `is_late` | bool | dichiarata dopo il cutoff → non matura credito (`D-12`) |
| `status` | enum | `ACTIVE` · `CANCELLED` |
| `cancelled_at` | timestamptz nullable | |
| `notes` | text nullable | |

- **Vincolo di esclusione**: nessuna assenza attiva sovrapposta per lo stesso
  contratto (§5.3).
- index `(beach_club_id, seasonal_contract_id, start_date, end_date)`

**Nota sul modello a intervalli.** Un'assenza è un intervallo, non un insieme di
giorni. L'annullamento parziale (`RD-03`) si realizza **spezzando l'intervallo**
in due, non cancellando giorni: se `[10–15]` e il 12 è venduto, annullare
produce `[10–11]` e `[13–15]` come nuove righe, e la riga originale passa a
`CANCELLED`. Questo mantiene lo storico leggibile e l'audit ricostruibile.

### 3.10 `Reservation` e `ReservationItem`

La separazione esiste perché una prenotazione può coprire **più ombrelloni**
(scenario B: "due ombrelloni vicini"). Un solo pagamento, un solo cliente, due
posti.

`Reservation` — la testata:
| Campo | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `beach_club_id`, `season_id` | uuid FK | |
| `customer_id` | uuid FK | |
| `people_count` | int | |
| `source` | enum | `PHONE` · `WHATSAPP` · `RECEPTION` · `WEB` · `OTHER` |
| `status` | enum | `CONFIRMED` · `CHECKED_IN` · `CANCELLED` · `NO_SHOW` |
| `total_cents` | int | somma congelata degli item |
| `payment_status` | enum | `UNPAID` · `PARTIAL` · `PAID` · `REFUNDED` |
| `notes` | text nullable | |
| `created_by` | uuid FK User | |
| `created_at`, `cancelled_at` | timestamptz | |

`ReservationItem` — la riga, **è qui che vive il vincolo di non sovrapposizione**:
| Campo | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `beach_club_id`, `reservation_id` | uuid FK | |
| `umbrella_id` | uuid FK | |
| `start_date`, `end_date` | date | inclusivi |
| `status` | enum | copia denormalizzata dello stato della testata |
| `price_cents` | int | **prezzo congelato** (`RF-RES-04`) |
| `price_breakdown` | jsonb | righe di calcolo, per giustificare il prezzo al cliente |
| `is_temporary_slot` | bool | true se venduto su un giorno di assenza stagionale |
| `seasonal_absence_id` | uuid FK nullable | l'assenza che ha reso possibile la vendita |

**Perché `status` è duplicato sull'item.** Il vincolo `EXCLUDE` di PostgreSQL
può filtrare solo su colonne della stessa riga: per escludere le prenotazioni
annullate dal controllo di sovrapposizione, lo stato deve stare sull'item. La
denormalizzazione è mantenuta da un trigger, non dal codice applicativo.

`seasonal_absence_id` è il collegamento che rende possibile il credito
(`docs/08`): dice quale assenza ha generato quella vendita.

### 3.11 `PriceRule`
| Campo | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `beach_club_id`, `season_id` | uuid FK | |
| `name` | text | leggibile: "Alta stagione prima fila" |
| `priority` | int | **più alto vince**, prima corrispondenza |
| `zone_id`, `row_label`, `category` | nullable | criteri, null = qualunque |
| `date_from`, `date_to` | date nullable | periodo di validità |
| `weekdays` | int[] nullable | 1–7, null = tutti |
| `min_days`, `max_days` | int nullable | sconto durata |
| `customer_type` | enum nullable | `DAILY` · `SEASONAL` |
| `price_cents` | int | prezzo giornaliero |
| `active` | bool | |

Motore: si valutano le regole applicabili ordinate per `priority` decrescente,
**vince la prima**. Non è un sistema generico di regole: sono 5–10 righe per
stabilimento, e la prevedibilità vale più della flessibilità. Il gestore deve
poter guardare la lista e capire perché un prezzo è quello.

Se nessuna regola corrisponde → `Umbrella.base_price_cents` → errore esplicito.

### 3.12 `Payment`
| Campo | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `beach_club_id`, `reservation_id` | uuid FK | |
| `amount_cents` | int | può essere negativo per i rimborsi |
| `method` | enum | `CASH` · `CARD` · `TRANSFER` · `ONLINE` · `OTHER` |
| `paid_at` | timestamptz | |
| `collected_by` | uuid FK User | **chi ha incassato** (`C-12`) |
| `provider_ref` | text nullable | predisposizione gateway (`R3`) |
| `notes` | text nullable | |

`Reservation.payment_status` è derivato dalla somma dei pagamenti, ricalcolato
in transazione a ogni scrittura.

### 3.13 `CreditTransaction`
| Campo | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `beach_club_id`, `seasonal_contract_id` | uuid FK | |
| `amount_cents` | int | positivo = maturato, negativo = utilizzato/stornato |
| `unit` | enum | `EUR` · `POINTS` — default `EUR` (`D-03`) |
| `kind` | enum | `EARNED` · `USED` · `REVERSED` · `ADJUSTMENT` |
| `absence_date` | date nullable | il giorno liberato |
| `source_reservation_id` | uuid FK nullable | la rivendita che l'ha generato |
| `seasonal_absence_id` | uuid FK nullable | |
| `description` | text | leggibile dal cliente |
| `created_by` | uuid FK User nullable | null se automatico |
| `created_at` | timestamptz | |

Registro append-only: un credito sbagliato si storna con una riga `REVERSED`,
non si cancella. È l'unico modo per ricostruire una contestazione.

`amount_cents` + `unit` insieme rendono il passaggio euro → punti un cambio di
configurazione, non di schema (`D-03`).

### 3.14 `AuditLog`
| Campo | Tipo | Note |
|---|---|---|
| `id` | bigserial PK | |
| `beach_club_id` | uuid FK | |
| `actor_type` | enum | `USER` · `CUSTOMER` · `SYSTEM` |
| `actor_id` | uuid nullable | |
| `action` | text | `reservation.create`, `absence.declare`, `price.override`… |
| `entity_type`, `entity_id` | text / uuid | |
| `before`, `after` | jsonb nullable | stato precedente e successivo |
| `ip`, `user_agent` | text nullable | |
| `created_at` | timestamptz | |

Append-only: nessun `UPDATE`, nessun `DELETE`, garantito da permessi e da un
trigger che li rifiuta. `before`/`after` contengono **solo i campi cambiati**,
per non gonfiare la tabella e non duplicare dati personali (`NF-05`).

index `(beach_club_id, entity_type, entity_id, created_at desc)`.

### 3.15 `IdempotencyKey` — risolve `C-05`
| Campo | Tipo | Note |
|---|---|---|
| `key` | text PK | generata dal client |
| `beach_club_id` | uuid FK | |
| `endpoint` | text | |
| `request_hash` | text | rifiuta la stessa chiave con corpo diverso |
| `response_status`, `response_body` | int / jsonb | risposta memorizzata |
| `created_at` | timestamptz | pulizia dopo 24 h |

---

## 4. Enumerazioni

```
Role              ADMIN · OPERATOR
SeasonStatus      PLANNING · ACTIVE · CLOSED
UmbrellaState     LIBERO · OCCUPATO · PRENOTATO · STAGIONALE_PRESENTE ·
                  STAGIONALE_ASSENTE · TEMP_DISPONIBILE · BLOCCATO   ← calcolata, non in tabella
ReservationStatus CONFIRMED · CHECKED_IN · CANCELLED · NO_SHOW
PaymentStatus     UNPAID · PARTIAL · PAID · REFUNDED
PaymentMethod     CASH · CARD · TRANSFER · ONLINE · OTHER
ReservationSource PHONE · WHATSAPP · RECEPTION · WEB · OTHER
AbsenceStatus     ACTIVE · CANCELLED
CreditKind        EARNED · USED · REVERSED · ADJUSTMENT
MapFeatureKind    WALKWAY · CORRIDOR · ENTRANCE · SERVICE · BLOCKED_AREA
```

`UmbrellaState` **non esiste come colonna**. È un tipo del livello `domain/`,
prodotto dalla funzione del §6.

---

## 5. Vincoli critici

### 5.1 Estensione richiesta
```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
```
Prima migrazione in assoluto. Se il fornitore del database non la consente, il
fornitore è inadatto (`docs/02` §2).

### 5.2 Nessuna sovrapposizione di prenotazioni — `RD-02`
```sql
ALTER TABLE reservation_item
  ADD CONSTRAINT reservation_item_no_overlap
  EXCLUDE USING gist (
    umbrella_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  )
  WHERE (status IN ('CONFIRMED', 'CHECKED_IN'));
```
`'[]'` rende l'intervallo inclusivo su entrambi gli estremi: il 10–12 occupa
anche il 12. La clausola `WHERE` esclude annullate e no-show, che devono poter
restare nello storico senza bloccare il posto.

### 5.3 Nessuna sovrapposizione di assenze sullo stesso contratto
```sql
ALTER TABLE seasonal_absence
  ADD CONSTRAINT seasonal_absence_no_overlap
  EXCLUDE USING gist (
    seasonal_contract_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  )
  WHERE (status = 'ACTIVE');
```
Senza questo, un cliente che tocca due volte il pulsante crea due assenze
sovrapposte e il calcolo del credito raddoppia.

### 5.4 Nessuna sovrapposizione di contratti stagionali sullo stesso ombrellone
```sql
ALTER TABLE seasonal_contract
  ADD CONSTRAINT seasonal_contract_no_overlap
  EXCLUDE USING gist (
    umbrella_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  )
  WHERE (status = 'ACTIVE');
```

### 5.5 Coerenza degli intervalli
```sql
ALTER TABLE reservation_item  ADD CONSTRAINT ri_dates_valid  CHECK (start_date <= end_date);
ALTER TABLE seasonal_absence  ADD CONSTRAINT sa_dates_valid  CHECK (start_date <= end_date);
ALTER TABLE seasonal_contract ADD CONSTRAINT sc_dates_valid  CHECK (start_date <= end_date);
ALTER TABLE season            ADD CONSTRAINT se_dates_valid  CHECK (start_date <= end_date);
```

### 5.6 Unicità
```sql
ALTER TABLE umbrella ADD CONSTRAINT umbrella_number_unique
  UNIQUE (beach_club_id, visible_number);

CREATE UNIQUE INDEX customer_phone_unique
  ON customer (beach_club_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL AND anonymized_at IS NULL;

ALTER TABLE season ADD CONSTRAINT season_year_unique
  UNIQUE (beach_club_id, year);
```

### 5.7 Integrità multi-tenant
Ogni chiave esterna che attraversa entità è **composta**, così il database
stesso impedisce di collegare righe di tenant diversi:
```sql
ALTER TABLE reservation_item
  ADD CONSTRAINT ri_umbrella_same_tenant
  FOREIGN KEY (beach_club_id, umbrella_id)
  REFERENCES umbrella (beach_club_id, id);
```
Richiede una unique `(beach_club_id, id)` su ogni tabella referenziata. È
ridondante rispetto alla PK, costa un indice, e rende **strutturalmente
impossibile** l'errore più grave del sistema.

### 5.8 Indici principali
```sql
CREATE INDEX ri_lookup ON reservation_item
  USING gist (umbrella_id, daterange(start_date, end_date, '[]'))
  WHERE status IN ('CONFIRMED','CHECKED_IN');

CREATE INDEX ri_club_dates  ON reservation_item (beach_club_id, start_date, end_date);
CREATE INDEX sa_lookup      ON seasonal_absence (beach_club_id, start_date, end_date) WHERE status = 'ACTIVE';
CREATE INDEX sc_lookup      ON seasonal_contract (beach_club_id, season_id, umbrella_id) WHERE status = 'ACTIVE';
CREATE INDEX cust_name_trgm ON customer USING gin ((first_name || ' ' || last_name) gin_trgm_ops);
CREATE INDEX audit_entity   ON audit_log (beach_club_id, entity_type, entity_id, created_at DESC);
```

---

## 6. La funzione di stato — `RD-01`

Punto unico di verità. Vive in `domain/umbrella/state.ts`, è pura, non tocca il
database (riceve i dati già caricati), ed è coperta da test esaustivi.

```ts
type StateInput = {
  umbrella:  { blocked: boolean }
  date:      LocalDate
  contract:  SeasonalContract | null   // attivo che copre `date`
  absence:   SeasonalAbsence   | null  // attiva che copre `date`
  item:      ReservationItem   | null  // confermato che copre `date`
  today:     LocalDate
}

function umbrellaState(i: StateInput): UmbrellaState {
  if (i.umbrella.blocked) return 'BLOCCATO'

  if (i.item) {
    return i.date <= i.today && i.item.status === 'CHECKED_IN'
      ? 'OCCUPATO'
      : i.date <= i.today ? 'OCCUPATO' : 'PRENOTATO'
  }

  if (i.contract) {
    if (i.absence) return 'TEMP_DISPONIBILE'   // libero e vendibile
    return 'STAGIONALE_PRESENTE'
  }

  return 'LIBERO'
}
```

Note che valgono quanto il codice:

- **L'ordine è normativo.** `blocked` batte tutto: un ombrellone rotto non si
  vende neanche se qualcuno l'ha prenotato. La prenotazione batte il contratto
  stagionale, perché nei giorni di assenza è la prenotazione a dire la verità.
- `STAGIONALE_ASSENTE` **non è restituito da questa funzione.** È una
  proiezione di presentazione: la UI mostra `TEMP_DISPONIBILE` con
  l'etichetta "stagionale assente" quando `contract != null`. Un solo stato
  logico, due letture diverse per il gestore.
- Un item con `is_temporary_slot = true` su un ombrellone stagionale produce
  `OCCUPATO`: il posto è stato rivenduto, e il gestore lo deve vedere occupato.

### 6.1 Come si calcola per l'intera mappa
`GET /map?date=` fa **tre query**, non una per ombrellone:

```sql
-- 1. tutti gli ombrelloni della mappa (con zona)
-- 2. contratti attivi che coprono la data
-- 3. assenze attive + item confermati che coprono la data
```
Poi la funzione pura viene applicata in memoria a ciascun ombrellone. Per 100
ombrelloni sono microsecondi. Nessuna query in ciclo, mai.

---

## 7. Adiacenza e vicinanza — risolve `C-04`

L'adiacenza non è un dato, è un calcolo. Definita come punteggio, non booleano,
così l'algoritmo può sempre proporre il "meglio disponibile".

```ts
function proximityScore(a: Umbrella, b: Umbrella, features: MapFeature[]): number {
  const dx = Math.abs(a.pos_x - b.pos_x)
  const dy = Math.abs(a.pos_y - b.pos_y)
  let score = Math.hypot(dx, dy)                       // distanza euclidea

  if (a.row_label !== b.row_label)   score += ROW_CHANGE_PENALTY      // default 1.5
  if (crossesFeature(a, b, features, ['CORRIDOR','WALKWAY']))
                                     score += CORRIDOR_PENALTY        // default 2.0
  return score                                          // più basso = più vicino
}
```

Le due penalità sono in `BeachClub.settings`: in alcuni stabilimenti la
passerella separa davvero, in altri no. Un gruppo di N ombrelloni si valuta con
la somma delle distanze a coppie; la ricerca restituisce i gruppi ordinati per
punteggio crescente (`docs/09` §4 per l'algoritmo completo).

---

## 8. Dati demo — `RF` §11 del brief

Seed **deterministico** (seed fissa: stessi dati a ogni esecuzione, altrimenti
i test E2E non sono riproducibili).

- 1 `BeachClub`, 1 `Season` attiva, 2 `User` (admin + operatore)
- **96 ombrelloni**: 6 file da 16, numerazione `1`–`96`, con due `bis` (`33A`,
  `72A`) per esercitare `visible_number` come testo
- 3 `Zone`: prima fila (premium), centrale, retro
- `MapFeature`: 1 passerella centrale, 2 corridoi trasversali, ingresso, bagni, bar
- **28 contratti stagionali** (~29% degli ombrelloni, realistico)
- 120 clienti, di cui 28 stagionali
- ~200 prenotazioni distribuite su passato, presente e futuro
- **12 assenze stagionali**: alcune passate e già rivendute con credito maturato,
  alcune attive oggi, alcune future
- 3 ombrelloni `blocked`
- pagamenti in tutti e quattro gli stati
- listino con 8 `PriceRule` che coprono alta/bassa stagione, prima fila, weekend
  e sconto durata

Una demo da 5 ombrelloni non dice nulla su UX e performance: è vietata dal brief
e lo confermiamo.

---

## 9. Decisioni generate da questo documento

| ID | Contenuto | Stato |
|---|---|---|
| `D-11` | Introdurre l'entità `Season` | proposta: **sì**, vedi §3.2 |
| `D-14` | Chiavi esterne composte per l'integrità tenant (§5.7) | proposta: **sì**, costo un indice |
| `D-15` | `visible_number` come testo, non intero (§3.5) | proposta: **sì** |
