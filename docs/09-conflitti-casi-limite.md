# 09 — Conflitti e casi limite

**Fase:** F1 · **Stato:** completo · **Criticità:** massima

> Ogni riga di questo documento è un test da scrivere. La colonna "Test" rimanda
> agli identificativi usati in `docs/08` §10 e in `docs/10` §5.

---

## 1. Principio: dove vive la garanzia

| Tipo di garanzia | Dove sta | Perché |
|---|---|---|
| "Non può mai accadere" | **Vincolo del database** | Regge la concorrenza; il codice no |
| "Non deve accadere in questo flusso" | Caso d'uso in transazione | Dipende dal contesto |
| "L'utente non deve poterlo chiedere" | Validazione + UI | Cortesia, mai sicurezza |

Il divieto di doppia prenotazione appartiene alla prima riga. Un controllo
applicativo `SELECT` seguito da `INSERT` viene attraversato da due richieste
simultanee: entrambe leggono "libero", entrambe scrivono. Il vincolo `EXCLUDE`
fa fallire la seconda a livello di database, sempre, qualunque sia il codice.

---

## 2. Conflitti di prenotazione

| # | Caso | Comportamento atteso | Garanzia | Test |
|---|---|---|---|---|
| C-01 | Due operatori prenotano lo stesso ombrellone nello stesso istante | Uno riesce; l'altro riceve `UMBRELLA_NOT_AVAILABLE` con il nome di chi ha prenotato e l'ora | Vincolo `EXCLUDE` | T-08 |
| C-02 | Doppio tap su "Conferma" con rete lenta | Una sola prenotazione; la seconda richiesta restituisce la stessa risposta | `Idempotency-Key` | T-21 |
| C-03 | Modifica del periodo che crea sovrapposizione | Rifiutata, con l'indicazione dei giorni in conflitto | Vincolo `EXCLUDE` | T-22 |
| C-04 | Prenotazione su ombrellone `blocked` | Rifiutata: `blocked` batte tutto (`docs/03` §6) | Caso d'uso | T-23 |
| C-05 | Prenotazione a cavallo della fine del contratto stagionale | Ammessa solo sui giorni fuori dal contratto; i giorni interni richiedono un'assenza | Caso d'uso | T-24 |
| C-06 | Annullamento della rivendita su giorno liberato | Credito `REVERSED`; il giorno torna vendibile, l'assenza resta attiva | Transazione | T-14 |
| C-07 | Spostamento del cliente su un altro ombrellone | **Un solo `UPDATE`** dell'item, mai delete+insert | Transazione | T-25 |

### C-07, perché non "cancella e ricrea"
Cancellare l'item e ricrearlo apre una finestra — anche di pochi millisecondi —
in cui l'ombrellone di origine risulta libero e un'altra transazione può
venderlo. Lo spostamento è un aggiornamento di `umbrella_id` sulla stessa riga,
dentro la stessa transazione, protetto dallo stesso vincolo.

---

## 3. Conflitti su stagionali e assenze

| # | Caso | Comportamento atteso | Test |
|---|---|---|---|
| C-10 | Stagionale annulla, nessun giorno venduto | Assenza `CANCELLED`, ombrellone di nuovo riservato | T-11 |
| C-11 | Stagionale annulla, alcuni giorni venduti | Intervallo spezzato; i venduti restano; credito confermato | T-12 |
| C-12 | Stagionale annulla, tutti i giorni venduti | `ABSENCE_FULLY_SOLD`; nulla cambia; messaggio con contatto | T-13 |
| C-13 | Ritorno anticipato: si presenta su un giorno venduto | Vale `D-01`: `IRREVOCABLE` di default. Il gestore vede l'alternativa proposta | T-26 |
| C-14 | Assenza su un giorno con prenotazione dello stagionale stesso | Rifiutata: prima va annullata quella prenotazione | T-17 |
| C-15 | Due assenze sovrapposte (doppio tap) | La seconda è rifiutata dal vincolo `EXCLUDE` | T-03 |
| C-16 | Nuovo contratto stagionale su ombrellone con prenotazioni future | Rifiutato, con l'elenco delle prenotazioni in conflitto e la proposta di spostarle | T-27 |
| C-17 | Contratto stagionale annullato a metà stagione | Le prenotazioni temporanee già vendute restano valide; i giorni futuri tornano `LIBERO` | T-28 |
| C-18 | Assenza che scavalca la fine del contratto | Troncata al `end_date` del contratto, con avviso | T-04 |

### C-16, il caso della configurazione tardiva
Realistico: il gestore inserisce i contratti stagionali a stagione già iniziata,
quando esistono già prenotazioni giornaliere future su quegli ombrelloni.
Rifiutare senza spiegare bloccherebbe l'adozione. Il sistema deve dire *quali*
prenotazioni sono in conflitto e offrire di spostarle, altrimenti il gestore
torna al quaderno.

---

## 4. Ricerca disponibilità — casi limite

| # | Caso | Comportamento atteso | Test |
|---|---|---|---|
| C-20 | Nessuna soluzione completa | Mostra soluzioni **parziali** marcate, mai "nessun risultato" | T-30 |
| C-21 | Soluzioni che includono posti da assenza | Sempre etichettate; in coda a parità di punteggio | T-31 |
| C-22 | Richiesta di N ombrelloni adiacenti, ne esistono N ma sparsi | Proposti comunque, ordinati per punteggio di prossimità | T-32 |
| C-23 | Periodo che scavalca la fine della stagione | Troncato agli estremi della stagione, con avviso | T-33 |
| C-24 | Periodo di un solo giorno | Trattato come intervallo `[d, d]`, nessun percorso speciale | T-34 |
| C-25 | Quantità superiore agli ombrelloni esistenti | Errore immediato, senza interrogare il database | T-35 |

### L'algoritmo, in breve
```
1. Candidati = ombrelloni non bloccati, senza item confermati nel periodo,
   più quelli coperti da assenza attiva (marcati `temporary`)
2. Se qty = 1  → ordina per (preferenze, prezzo, prossimità al mare)
3. Se qty > 1  → genera i sottoinsiemi di dimensione qty limitando la
                 ricerca ai vicini geometrici (finestra scorrevole per fila,
                 non combinazioni esaustive)
4. Punteggio del gruppo = Σ proximityScore(coppie)  +  penalità preferenze
5. Ordina crescente, restituisci i primi 5
6. Se nessun gruppo copre tutto il periodo → ripeti sul sotto-periodo più
   lungo disponibile e marca il risultato come parziale  (C-20)
```
Con 96 ombrelloni e qty ≤ 4 lo spazio di ricerca è banale. La finestra
scorrevole evita l'esplosione combinatoria su stabilimenti da 300 posti.

---

## 5. Prezzi e pagamenti

| # | Caso | Comportamento atteso | Test |
|---|---|---|---|
| C-40 | Il listino cambia dopo la prenotazione | Il prezzo resta congelato (`RF-RES-04`) | T-40 |
| C-41 | **Estensione del periodo** | I giorni originali mantengono il prezzo; i nuovi si calcolano col listino vigente (`C-10` doc 01) | T-41 |
| C-42 | Riduzione del periodo | Ricalcolo proporzionale sui soli giorni rimasti; l'eventuale eccedenza diventa credito o rimborso | T-42 |
| C-43 | Nessuna `PriceRule` corrisponde | Ricade su `Umbrella.base_price_cents`; se assente, errore esplicito, mai prezzo zero | T-43 |
| C-44 | Due regole con la stessa priorità | Vince la più specifica (più criteri valorizzati); a parità, la più recente. Deterministico e testato | T-44 |
| C-45 | Pagamento superiore al totale | Ammesso: registra il pagato e segnala l'eccedenza; non blocca l'incasso | T-45 |
| C-46 | Rimborso su prenotazione non pagata | Rifiutato | T-46 |
| C-47 | Doppio invio del pagamento | Bloccato dall'idempotenza | T-21 |
| C-48 | Annullamento di prenotazione già pagata | Stato `CANCELLED` + `REFUNDED`; il rimborso è registrato, non automatico | T-47 |

**C-43 non deve mai produrre zero.** Un prezzo a zero per una regola mancante è
il tipo di errore che passa inosservato per settimane e si scopre a bilancio.

---

## 6. Date, fusi e confini temporali

| # | Caso | Comportamento atteso | Test |
|---|---|---|---|
| C-50 | Cambio di ora legale dentro un soggiorno | Nessun effetto: le date di soggiorno sono `DATE` | T-50 |
| C-51 | Operazione a cavallo di mezzanotte | "Oggi" si calcola nel fuso dello stabilimento, non del browser né in UTC | T-51 |
| C-52 | Cutoff assenza attorno al cambio d'ora | Valutato nel fuso dello stabilimento | T-18 |
| C-53 | Tablet con orologio sbagliato | Le date operative vengono dal server; il client non decide mai cos'è "oggi" | T-52 |
| C-54 | Anno bisestile, 29 febbraio | Nessun percorso speciale: aritmetica su date, mai su millisecondi | T-53 |

**C-53 è più frequente di quanto sembri.** Un tablet da reception rimasto
spento per mesi può avere l'orologio fuori. Se il client decide cos'è "oggi", la
mappa mostra il giorno sbagliato e si vendono posti già venduti.

---

## 7. Multi-tenant e autorizzazione

| # | Caso | Comportamento atteso | Test |
|---|---|---|---|
| C-60 | Utente del club A richiede una risorsa del club B | **404**, mai 403 | T-60 |
| C-61 | `beachClubId` inviato nel corpo della richiesta | Ignorato; si usa quello della sessione | T-61 |
| C-62 | Magic link su un endpoint diverso dalle assenze | 403 | T-62 |
| C-63 | Magic link di un contratto su un altro contratto | 404 | T-19 |
| C-64 | Magic link revocato o di stagione chiusa | Pagina "link non valido" con il contatto dello stabilimento | T-63 |
| C-65 | Operatore che tenta un'azione da admin | 403 e riga di audit | T-64 |
| C-66 | Sconto dell'operatore oltre la soglia | Rifiutato, con indicazione del limite | T-65 |

---

## 8. Rete, concorrenza, integrità

| # | Caso | Comportamento atteso | Test |
|---|---|---|---|
| C-70 | Connessione persa a metà scrittura | Stato "non salvato" visibile; retry automatico con backoff; nessuna ambiguità | T-70 |
| C-71 | Retry che arriva dopo che la prima è riuscita | Idempotenza: stessa risposta, nessun effetto doppio | T-21 |
| C-72 | Due schede aperte sullo stesso ombrellone | La seconda riceve il conflitto e si riallinea | T-71 |
| C-73 | Transazione che fallisce a metà | Rollback totale: né prenotazione né credito né audit | T-72 |
| C-74 | Saldo credito diverso dalla somma delle transazioni | Test di consistenza rosso; il saldo si ricostruisce dal registro | T-16 |
| C-75 | Sessione scaduta durante la compilazione | Alla conferma: rilogin e ripresa dell'operazione senza perdere i dati inseriti | T-73 |

**C-75 è una questione di adozione, non di sicurezza.** Un operatore che perde
i dati di una prenotazione perché la sessione è scaduta non riproverà: tornerà
al quaderno.

---

## 9. Dati e configurazione

| # | Caso | Comportamento atteso | Test |
|---|---|---|---|
| C-80 | Due clienti con lo stesso telefono | Bloccato dalla unique; proposta di unione, mai errore secco | T-80 |
| C-81 | Telefono in formati diversi (`+39 348…`, `0039348…`, `348…`) | Normalizzati in E.164, riconosciuti come lo stesso cliente | T-81 |
| C-82 | Cliente anonimizzato (GDPR) | Prenotazioni e statistiche restano; i dati personali sono sostituiti | T-82 |
| C-83 | Rinumerazione di un ombrellone con prenotazioni attive | Ammessa: cambia `visible_number`, l'`id` resta. Riga di audit | T-83 |
| C-84 | Eliminazione di un ombrellone con prenotazioni | Rifiutata; si può solo bloccare | T-84 |
| C-85 | Cambio mappa a stagione in corso | Solo aggiunte e blocchi; la rimozione richiede che non ci siano prenotazioni | T-85 |
| C-86 | Ombrelloni `63` e `63A` | Entrambi validi; la ricerca `63` li mostra entrambi, con `63` esatto per primo | T-86 |
| C-87 | Chiusura della stagione con crediti residui | I crediti restano sul contratto; la policy di riporto all'anno successivo è configurabile | T-87 |

---

## 10. I sei test che decidono il rilascio

Se uno solo di questi fallisce, non si rilascia.

| Test | Cosa dimostra |
|---|---|
| **T-08** | Due vendite concorrenti sullo stesso posto: una sola riesce |
| **T-12** | Annullamento parziale con un giorno venduto: nessuno perde ciò che gli spetta |
| **T-10** | Il posto torna allo stagionale da solo, senza processi pianificati |
| **T-16** | Il credito quadra sempre con il registro |
| **T-60** | Nessun dato attraversa il confine tra stabilimenti |
| **T-21** | Il doppio tap non produce doppi incassi né doppie prenotazioni |
