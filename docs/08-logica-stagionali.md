# 08 — Logica stagionale → assenza → disponibilità → rivendita → credito

**Fase:** F1 · **Stato:** completo · **Criticità:** massima

> È la funzione che distingue il prodotto e l'unica che genera ricavo
> aggiuntivo invece di limitarsi a risparmiare tempo. Se qui c'è un errore, il
> gestore smette di fidarsi e la funzione muore.
>
> Da leggere insieme a `docs/03` (modello dati) e `docs/09` (casi limite).

---

## 1. Il meccanismo in una frase

Un posto stagionale che resta vuoto è ricavo perso ogni giorno di alta stagione.
Se lo stagionale dichiara che non verrà, lo stabilimento può rivendere quel
giorno; se ci riesce, lo stagionale riceve un credito. Nessuno perde: lo
stagionale guadagna un rimborso su giorni che non avrebbe usato, lo stabilimento
guadagna un incasso che non avrebbe avuto.

Perché funzioni servono tre garanzie, ed è tutto ciò che questo documento
protegge:

1. **Il posto torna sempre allo stagionale**, automaticamente, senza che debba
   chiederlo. Se ha il dubbio di perderlo, non dichiarerà mai un'assenza.
2. **Non si vende due volte lo stesso giorno.** Mai, in nessuna condizione di
   concorrenza.
3. **Il credito matura solo su ciò che è stato davvero venduto.** Altrimenti lo
   stabilimento paga per posti rimasti vuoti.

---

## 2. Concetti e stati

**Un'assenza è un intervallo, non un insieme di giorni.** Questa è la scelta
strutturale portante: rende il modello compatto, ma richiede che
l'annullamento parziale sia gestito **spezzando l'intervallo** (§6).

Lo stato di un singolo giorno di assenza è **derivato**, non memorizzato:

| Stato del giorno | Condizione |
|---|---|
| `LIBERATO` | l'assenza copre il giorno, nessuna prenotazione su di esso |
| `RIVENDUTO` | esiste un `ReservationItem` confermato su quel giorno con `seasonal_absence_id` valorizzato |
| `RIENTRATO` | l'assenza è stata annullata per quel giorno |
| `SCADUTO` | il giorno è passato senza rivendita |

Non esiste una tabella `absence_day`. Lo stato si calcola dalle prenotazioni,
esattamente come `RD-01` fa per gli ombrelloni. Il motivo è lo stesso: qualunque
stato duplicato si disallinea e produce doppie vendite.

---

## 3. Macchina a stati dell'assenza

```
                    ┌──────────────────┐
                    │   (inesistente)  │
                    └────────┬─────────┘
                             │ dichiara(contratto, d1..d2)
                             │ ── verifica cutoff  → is_late
                             ▼
                    ┌──────────────────┐
              ┌─────│      ACTIVE      │─────┐
              │     └────────┬─────────┘     │
              │              │               │
   annulla    │              │ vendita di    │  passa end_date
   (nessun    │              │ un giorno d   │
   giorno     │              ▼               ▼
   venduto)   │     ┌──────────────────┐   ┌──────────────────┐
              │     │ ACTIVE           │   │ ACTIVE           │
              │     │ + giorno d       │   │ (storica)        │
              │     │   RIVENDUTO      │   │ i giorni non     │
              │     │ + credito        │   │ venduti scadono  │
              │     │   maturato       │   └──────────────────┘
              │     │ ⚠ d irrevocabile │
              │     └────────┬─────────┘
              │              │ annulla i soli giorni liberi
              │              ▼
              │     ┌──────────────────┐
              │     │ CANCELLED        │
              │     │ + nuove assenze  │  ← intervallo spezzato (§6)
              │     │   per i giorni   │
              │     │   ancora liberi  │
              │     └──────────────────┘
              ▼
     ┌──────────────────┐
     │    CANCELLED     │  l'ombrellone torna STAGIONALE_PRESENTE
     └──────────────────┘
```

**L'assenza non ha uno stato `SFRUTTATA`.** Sarebbe uno stato derivabile, e
`D-10` vieta gli stati derivabili persistiti: lo sfruttamento è la presenza di
prenotazioni collegate.

---

## 4. Dichiarazione dell'assenza

### 4.1 Regole
| # | Regola | Motivo |
|---|---|---|
| A-01 | Solo su un `SeasonalContract` con `status = ACTIVE` | — |
| A-02 | L'intervallo deve stare dentro `[contract.start_date, contract.end_date]` | Non si dichiara assenza fuori dal proprio contratto |
| A-03 | Non può sovrapporsi a un'altra assenza attiva | Vincolo di esclusione DB (`docs/03` §5.3); previene il doppio tap |
| A-04 | Non può iniziare prima di oggi | Non si dichiara un'assenza retroattiva |
| A-05 | Se dichiarata dopo il **cutoff** del primo giorno → `is_late = true` | `C-02` / `D-12` |
| A-06 | Un'assenza `is_late` **è comunque registrata** ma non matura credito | Informazione utile al gestore, ma lo stabilimento non paga per un posto invendibile |
| A-07 | Se il giorno ha già una prenotazione dello stagionale stesso, quella prenotazione va annullata prima | Coerenza (`docs/09` C-14) |

### 4.2 Il cutoff — `D-12`
Configurabile in `BeachClub.settings`, proposta di default:

```
cutoff = 10:00 del PRIMO GIORNO di assenza   (D-12 rivista il 2026-09-07;
                                             prima: 20:00 del giorno precedente)
```

Calcolato nel fuso dello stabilimento (`BeachClub.timezone`), mai in UTC:
"entro le 10:00" deve significare le 10:00 sull'orologio del gestore, anche
all'ora legale.

Dopo il cutoff l'assenza si registra ancora — al gestore serve saperlo — ma con
`is_late = true` e senza maturazione di credito. La UI lo dice prima della
conferma, mai dopo:

> "Segnalazione fuori tempo: l'ombrellone risulterà libero, ma per oggi non
> matura credito."

### 4.3 Pseudocodice

```ts
async function declareAbsence(ctx, input: {
  contractId: string; from: LocalDate; to: LocalDate; declaredBy: 'CUSTOMER'|'STAFF'
}) {
  return db.transaction(async tx => {
    const contract = await tx.seasonalContract.findActive(ctx, input.contractId)
    if (!contract) throw DomainError('CONTRACT_NOT_FOUND')

    if (input.from > input.to)            throw DomainError('INVALID_RANGE')       // A-02
    if (input.from < today(ctx.timezone)) throw DomainError('ABSENCE_IN_THE_PAST') // A-04
    if (input.from < contract.startDate || input.to > contract.endDate)
                                          throw DomainError('OUTSIDE_CONTRACT')    // A-02

    const isLate = isAfterCutoff(now(), input.from, ctx.settings.absenceCutoff)     // A-05

    try {
      const absence = await tx.seasonalAbsence.create({
        beachClubId: ctx.beachClubId,
        seasonalContractId: contract.id,
        startDate: input.from, endDate: input.to,
        declaredAt: now(), declaredBy: input.declaredBy,
        isLate, status: 'ACTIVE',
      })
      await audit(tx, ctx, 'absence.declare', absence)
      return absence
    } catch (e) {
      if (isExclusionViolation(e)) throw DomainError('ABSENCE_OVERLAP')             // A-03
      throw e
    }
  })
}
```

Il vincolo di esclusione del database — non un controllo preventivo — è ciò che
regge A-03 sotto concorrenza. Il controllo applicativo servirebbe solo a dare un
messaggio più bello, e lo diamo intercettando l'eccezione.

---

## 5. Rivendita del posto liberato

### 5.1 Cosa deve accadere, tutto insieme
La vendita di un posto stagionale è **una sola transazione**. Se una qualunque
parte fallisce, non deve restare traccia di nessuna delle altre.

```ts
async function sellTemporarySlot(ctx, input: {
  umbrellaId: string; customerId: string; from: LocalDate; to: LocalDate
}) {
  return db.transaction(async tx => {
    // 1 — verifica che ogni giorno sia davvero coperto da un'assenza attiva
    const absence = await tx.seasonalAbsence.findCovering(ctx, input.umbrellaId, input.from, input.to)
    if (!absence) throw DomainError('NO_ACTIVE_ABSENCE')

    // 2 — prezzo, congelato ora
    const price = computePrice(ctx, { umbrellaId: input.umbrellaId, from: input.from, to: input.to })

    // 3 — prenotazione. Il vincolo EXCLUDE decide chi vince sotto concorrenza
    const reservation = await tx.reservation.create({ /* … */ })
    let item
    try {
      item = await tx.reservationItem.create({
        reservationId: reservation.id, umbrellaId: input.umbrellaId,
        startDate: input.from, endDate: input.to,
        status: 'CONFIRMED', priceCents: price.total, priceBreakdown: price.breakdown,
        isTemporarySlot: true,
        seasonalAbsenceId: absence.id,          // ← il collegamento che genera il credito
      })
    } catch (e) {
      if (isExclusionViolation(e)) throw DomainError('UMBRELLA_NOT_AVAILABLE')
      throw e
    }

    // 4 — credito, solo se dovuto
    if (!absence.isLate) {
      const amount = creditFor(ctx, price.total, absence, contract)     // §7
      if (amount > 0) {
        await tx.creditTransaction.create({
          seasonalContractId: absence.seasonalContractId,
          amountCents: amount, unit: 'EUR', kind: 'EARNED',
          absenceDate: input.from, sourceReservationId: reservation.id,
          seasonalAbsenceId: absence.id,
          description: `Posto liberato ${fmt(input.from)}–${fmt(input.to)} e riassegnato`,
        })
        await tx.seasonalContract.incrementCredit(absence.seasonalContractId, amount)
      }
    }

    await audit(tx, ctx, 'reservation.create.temporary', { reservation, item, absence })
    return reservation
  })
}
```

### 5.2 Perché il credito matura alla vendita e non alla dichiarazione
Se maturasse alla dichiarazione, lo stabilimento pagherebbe anche per i posti
rimasti vuoti — cioè per nulla — e ogni stagionale avrebbe interesse a
dichiarare assenze anche quando è incerto (`C-03`). Maturando alla vendita,
l'incentivo è allineato: il credito è una quota del ricavo effettivo.

### 5.3 Rientro automatico
Non esiste alcun processo pianificato, nessun cron, nessun job notturno.

Il giorno dopo la fine dell'assenza, `umbrellaState()` (`docs/03` §6) non trova
più un'assenza che copre la data e restituisce `STAGIONALE_PRESENTE`. Il rientro
è una conseguenza della derivazione, non un'operazione.

Questo è il motivo per cui `D-10` non è negoziabile: con uno stato persistito
servirebbe un processo che aggiorna 96 righe ogni notte, e la prima notte in cui
non gira, lo stabilimento vende un posto occupato.

---

## 6. Annullamento dell'assenza

### 6.1 La regola
Lo stagionale può annullare l'assenza sui giorni **non ancora rivenduti**. Sui
giorni rivenduti si applica `D-01`.

### 6.2 Annullamento con giorni già venduti

> **Correzione (F6-08).** Questa sezione prescriveva di annullare l'assenza e
> **ricreare come attivi** i frammenti non venduti. Era sbagliato, e il test
> T-12 lo ha dimostrato: un'assenza attiva significa «posto vendibile», quindi
> ricreare i frammenti lascerebbe liberati proprio i giorni che il cliente sta
> chiedendo di riprendersi. Il testo si contraddiceva da solo, perché il
> risultato atteso diceva «10, 11, 13, 14, 15 → torna suo».

Assenza `[10–15]`, il giorno 12 è stato venduto. Lo stagionale annulla.

```
PRIMA
  SeasonalAbsence #1  [10 ─────────────── 15]  ACTIVE
  ReservationItem     [      12      ]          venduto, is_temporary_slot

DOPO
  SeasonalAbsence #1  [10 ─────────────── 15]  CANCELLED   ← storico preservato
  ReservationItem     [      12      ]          intatto

Risultato per il cliente:
  10, 11, 13, 14, 15 → torna suo
  12                 → resta venduto, credito già maturato, confermato
```

**Perché basta annullare per intero.** La vendita del 12 regge da sé: la
funzione di stato guarda prima le prenotazioni e poi il contratto stagionale
(`RD-01`), quindi quel giorno resta occupato qualunque sia lo stato
dell'assenza. Gli altri giorni tornano `STAGIONALE_PRESENTE` perché non li
copre più nessuna assenza attiva. Il credito già maturato resta, perché la
vendita è davvero avvenuta (`K-05`).

Lo spezzamento dell'intervallo (`sottraiGiorni`, in `domain/seasonal/intervals.ts`)
resta implementato e testato, ma serve a un'operazione diversa: il cliente che
vuole annullare **solo una parte** dell'assenza. Non è nell'MVP.

```ts
async function cancelAbsence(ctx, absenceId: string, actor: 'CUSTOMER'|'STAFF') {
  return db.transaction(async tx => {
    const absence = await tx.seasonalAbsence.findActive(ctx, absenceId)
    if (!absence) throw DomainError('ABSENCE_NOT_FOUND')

    const soldDays = await tx.reservationItem.findDaysCoveredByAbsence(ctx, absence)

    if (soldDays.length === 0) {                       // caso semplice
      await tx.seasonalAbsence.cancel(absence.id)
      await audit(tx, ctx, 'absence.cancel.full', { absence })
      return { cancelled: 'FULL' }
    }

    if (actor === 'CUSTOMER' && ctx.settings.absenceConflictPolicy === 'IRREVOCABLE') {
      const free = subtractDays(rangeOf(absence), soldDays)
      if (free.length === 0) throw DomainError('ABSENCE_FULLY_SOLD')   // niente da annullare

      await tx.seasonalAbsence.cancel(absence.id)
      for (const r of free) {
        await tx.seasonalAbsence.create({
          ...absence, startDate: r.from, endDate: r.to,
          status: 'ACTIVE',
          declaredAt: absence.declaredAt,        // ← non si rigenera
          isLate:    absence.isLate,             // ← non si rigenera
        })
      }
      await audit(tx, ctx, 'absence.cancel.partial', { absence, soldDays, kept: free })
      return { cancelled: 'PARTIAL', soldDays }
    }

    // STAFF con policy diversa → vedi §8 (ricollocazione o annullamento della vendita)
    return handleConflictPolicy(tx, ctx, absence, soldDays)
  })
}
```

### 6.3 Cosa vede il cliente
Mai un errore secco. La schermata dice esattamente cosa è stato ripristinato e
cosa no:

```
   Abbiamo ripristinato il tuo ombrellone per:
   10, 11, 13, 14, 15 agosto

   Il 12 agosto è già stato assegnato e non è
   più disponibile. Per quel giorno hai
   ricevuto un credito di 7,50 €.

   Per parlarne:  📞 0544 123456
```

---

## 7. Calcolo del credito

### 7.1 Formula
```
credito = prezzo_incassato_della_rivendita × percentuale_configurata
```
Default proposto: **30%**, configurabile per stabilimento (`D-03`).

Non si usa il prezzo del contratto stagionale diviso per i giorni: sarebbe più
"giusto" in astratto, ma incomprensibile per il cliente e slegato dal ricavo
reale. Una percentuale dell'incasso è spiegabile in una frase.

### 7.2 Vincoli
| # | Regola | Motivo |
|---|---|---|
| K-01 | Nessun credito se `absence.is_late` | Il posto non era realisticamente vendibile (`D-12`) |
| K-02 | Nessun credito se la prenotazione viene annullata → riga `REVERSED` | Non è stato incassato nulla |
| K-03 | Tetto stagionale configurabile al credito maturabile | Limita l'incentivo alle assenze speculative (`C-03`, `D-13`) |
| K-04 | Credito solo su giorni effettivamente rivenduti, mai sull'intervallo | Coerenza con §5.2 |
| K-05 | Il registro è append-only: si storna, non si cancella | Ricostruibilità delle contestazioni |

### 7.3 Storno
Se la rivendita viene annullata (il cliente giornaliero disdice), il credito già
maturato va stornato:

```ts
await tx.creditTransaction.create({
  seasonalContractId, amountCents: -original.amountCents,
  kind: 'REVERSED', sourceReservationId: cancelledReservation.id,
  description: `Storno: la prenotazione del ${fmt(day)} è stata annullata`,
})
```
E il giorno torna `LIBERATO`: l'assenza è ancora attiva, il posto torna
vendibile. Se nel frattempo lo stagionale aveva annullato l'assenza per gli
altri giorni, il giorno stornato **non** rientra automaticamente
nell'annullamento — resta liberato secondo l'ultima volontà espressa. Vedi
`docs/09` C-06.

---

## 8. `D-01` — Il conflitto, e perché la policy proposta è quella

**Situazione.** Lo stagionale annulla, il giorno è già venduto. Due clienti, un
ombrellone.

**Proposta: `IRREVOCABLE` come default, configurabile.**
Chi ha pagato tiene il posto. Lo stagionale conserva il credito maturato e, se
disponibile, gli viene proposto un ombrellone equivalente per quel giorno.

**Perché.** La decisione non riguarda l'equità astratta ma il comportamento del
gestore. Se il gestore sa di poter essere costretto a disdire a un cliente che
ha già pagato ed è magari già arrivato, **non rivenderà mai il posto**. E se non
rivende, l'intera funzione — la sola che genera ricavo aggiuntivo — smette di
esistere. La certezza per l'acquirente è la condizione perché il meccanismo
venga usato.

Il costo per lo stagionale è contenuto: ha dichiarato lui l'assenza, riceve il
credito, e ha eventualmente un posto alternativo.

**Configurabilità.** `BeachClub.settings.absenceConflictPolicy`:

| Valore | Comportamento |
|---|---|
| `IRREVOCABLE` *(default)* | Chi ha comprato tiene. Credito confermato, alternativa proposta. |
| `SEASONAL_PRIORITY` | Il giornaliero viene ricollocato o rimborsato; il credito viene stornato. Solo staff, mai automatico. |
| `MANUAL` | Il sistema non decide: apre un'attività per il gestore. |

Con `SEASONAL_PRIORITY` e `MANUAL` l'operazione **non è mai automatica**: il
sistema propone, un umano conferma. Annullare la prenotazione di un cliente
pagante non è una decisione che un software debba prendere da solo.

---

## 9. Effetti sulla ricerca disponibilità

Un posto in assenza entra nella ricerca (`RF-AVL-04`) con tre differenze
obbligatorie:

1. **Sempre etichettato**: `☆ posto stagionale temporaneamente disponibile`.
   L'operatore deve sapere cosa vende.
2. **Limitato alla finestra di assenza.** Se il cliente cerca 10–15 agosto e
   l'assenza copre 12–14, la soluzione è parziale e va mostrata come tale
   (`docs/06` §4), mai come copertura completa.
3. **In coda a parità di punteggio.** A parità di adiacenza e prezzo, un
   ombrellone realmente libero viene proposto prima: costa meno (nessun credito)
   e non ha implicazioni relazionali.

---

## 10. Test obbligatori

Nessuna di queste righe è opzionale: sono i criteri di accettazione 4 e 5 di
`PROJECT_BRIEF.md` §13.

| # | Test | Atteso |
|---|---|---|
| T-01 | Dichiarazione assenza singolo giorno | Stato del giorno → `TEMP_DISPONIBILE` |
| T-02 | Dichiarazione su intervallo | Tutti i giorni vendibili |
| T-03 | Assenza sovrapposta a un'altra | Rifiutata dal vincolo DB |
| T-04 | Assenza fuori dal contratto | Rifiutata |
| T-05 | Assenza retroattiva | Rifiutata |
| T-06 | Assenza dopo il cutoff | Creata con `is_late`, nessun credito |
| T-07 | Vendita su giorno liberato | Prenotazione + credito `EARNED` |
| T-08 | **Due vendite concorrenti sullo stesso giorno** | Una sola riesce |
| T-09 | Vendita su giorno non coperto da assenza | Rifiutata |
| T-10 | Fine finestra di assenza | Stato → `STAGIONALE_PRESENTE` senza intervento |
| T-11 | Annullamento con zero giorni venduti | Assenza `CANCELLED`, posto riservato |
| T-12 | **Annullamento parziale con un giorno venduto** | Intervallo spezzato, vendita intatta, credito confermato |
| T-13 | Annullamento con tutti i giorni venduti | `ABSENCE_FULLY_SOLD`, nulla cambia |
| T-14 | Annullamento della rivendita | Credito `REVERSED`, giorno di nuovo vendibile |
| T-15 | Tetto stagionale al credito raggiunto | Nessun credito ulteriore |
| T-16 | Saldo del contratto vs somma delle transazioni | Coincidono sempre |
| T-17 | Assenza su giorno con prenotazione dello stagionale stesso | Rifiutata con messaggio esplicito |
| T-18 | Cutoff attorno al cambio di ora legale | Valutato nel fuso dello stabilimento |
| T-19 | Magic link di un contratto su un altro contratto | 404 |
| T-20 | Ciclo completo end-to-end | Dichiara → vende → credito → rientro automatico |

`T-08` e `T-12` sono i due che dimostrano che il prodotto funziona davvero.
Se falliscono, non si rilascia.
