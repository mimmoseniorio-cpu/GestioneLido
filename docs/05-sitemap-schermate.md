# 05 — Sitemap e schermate

**Fase:** F1 · **Stato:** completo

---

## 1. Principio di navigazione

L'applicazione ha **una schermata principale, la mappa**, e tutto il resto è
raggiungibile da lì. Non esiste un menu che precede il lavoro: il gestore apre
l'app e vede lo stabilimento.

```
                    ┌──────────────┐
                    │    MAPPA     │  ← si apre qui, sempre
                    └──────┬───────┘
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
  Pannello           Ricerca            Azioni rapide
  ombrellone         globale            (5 pulsanti)
```

Le altre sezioni (clienti, calendario, dashboard, configurazione) sono
raggiungibili ma **non sono il percorso normale**. Un operatore può lavorare
un'intera giornata senza uscire dalla mappa.

---

## 2. Sitemap

```
/                             → redirect a /map
/login                          Accesso staff
/map                          ★ MAPPA — schermata principale
    ?date=YYYY-MM-DD              selettore data
    #umbrella/:id                 pannello rapido (overlay, non cambia pagina)
/availability                 ★ Ricerca disponibilità
/customers                      Elenco e ricerca clienti
    /customers/:id                Scheda cliente
    /customers/new                Nuovo cliente
/reservations/:id               Dettaglio prenotazione
/calendar                       Vista calendario (griglia ombrelloni × giorni)
/dashboard                      Dashboard giornaliera
/seasonal                       Elenco contratti stagionali
    /seasonal/:id                 Dettaglio contratto (assenze, credito, link)
/settings                       Configurazione — solo ADMIN
    /settings/club                Dati e policy dello stabilimento
    /settings/season              Stagioni
    /settings/map                 Editor mappa
    /settings/pricing             Listino
    /settings/users               Utenti
    /settings/audit               Registro operazioni

── Area cliente stagionale (magic link, dominio applicativo separato) ──
/s/:token                     ★ La mia postazione
/s/:token/absence               Dichiara assenza
/s/:token/credit                I miei crediti
```

★ = schermata critica per il successo del prodotto.

---

## 3. Elenco completo delle schermate

### 3.1 Staff — operatività quotidiana

| # | Schermata | Rotta | Scopo | Priorità |
|---|---|---|---|---|
| S-01 | **Mappa** | `/map` | Stato dello stabilimento a colpo d'occhio per una data | **Critica** |
| S-02 | **Pannello ombrellone** | overlay | Tutte le informazioni e le azioni su un ombrellone | **Critica** |
| S-03 | **Ricerca disponibilità** | `/availability` | Rispondere a "avete posto dal … al …" | **Critica** |
| S-04 | Nuova prenotazione | overlay | Creare una prenotazione in pochi campi | Alta |
| S-05 | Dettaglio prenotazione | `/reservations/:id` | Vedere e modificare una prenotazione | Alta |
| S-06 | Ricerca globale | overlay | Trovare cliente, telefono, ombrellone, prenotazione | Alta |
| S-07 | Registra pagamento | overlay | Incassare in pochi tap | Alta |
| S-08 | Elenco clienti | `/customers` | Trovare e gestire i clienti | Media |
| S-09 | Scheda cliente | `/customers/:id` | Storico, preferenze, contatti, contratto | Alta |
| S-10 | Nuovo/modifica cliente | overlay | Anagrafica minima | Media |
| S-11 | Calendario | `/calendar` | Occupazione su più giorni | Media |
| S-12 | Dashboard | `/dashboard` | Numeri del giorno | Media |
| S-13 | Elenco stagionali | `/seasonal` | Chi è stagionale, chi è assente oggi | Alta |
| S-14 | Dettaglio contratto stagionale | `/seasonal/:id` | Assenze, credito, magic link | Alta |
| S-15 | Login | `/login` | Accesso staff | Alta |
| S-16 | Blocco schermo | overlay | PIN per il tablet lasciato incustodito | Bassa |

### 3.2 Staff — configurazione (ADMIN)

| # | Schermata | Rotta | Scopo | Priorità |
|---|---|---|---|---|
| S-20 | Dati stabilimento | `/settings/club` | Nome, fuso, policy (cutoff, credito, `D-01`) | Alta |
| S-21 | Stagioni | `/settings/season` | Creare, attivare, chiudere una stagione | Alta |
| S-22 | **Editor mappa** | `/settings/map` | Disegnare lo stabilimento | **Critica** |
| S-23 | Generatore griglia | overlay | "6 file da 16" crea la mappa in un colpo (`C-08`) | **Critica** |
| S-24 | Listino | `/settings/pricing` | Regole di prezzo con priorità | Alta |
| S-25 | Utenti | `/settings/users` | Staff e ruoli | Media |
| S-26 | Audit | `/settings/audit` | Registro operazioni, filtrabile | Bassa |

### 3.3 Cliente stagionale (magic link)

| # | Schermata | Rotta | Scopo | Priorità |
|---|---|---|---|---|
| C-01 | **La mia postazione** | `/s/:token` | Ombrellone, periodo, calendario, credito | **Critica** |
| C-02 | **Dichiara assenza** | `/s/:token/absence` | "Non sarò presente" in 3 tap | **Critica** |
| C-03 | I miei crediti | `/s/:token/credit` | Storico crediti maturati e usati | Media |
| C-04 | Link non valido | `/s/invalid` | Messaggio chiaro + contatto dello stabilimento | Bassa |

**23 schermate in totale**, di cui 6 critiche. Le 6 critiche assorbono la maggior
parte del valore: S-01, S-02, S-03, S-22, C-01, C-02.

---

## 4. Elementi presenti su ogni schermata staff

Una barra superiore persistente, mai nascosta:

```
┌────────────────────────────────────────────────────────────────┐
│ ☰   [🔍 Cerca cliente, telefono, ombrellone…]      ● sync   👤 │
└────────────────────────────────────────────────────────────────┘
```

- **Ricerca globale** (`RF-SYS-01`): sempre raggiungibile, anche da tastiera
  (`/` per aprirla sul desktop).
- **Indicatore di sincronizzazione** (`NF-02`): tre stati, sempre visibile.
- **Azioni rapide** (`RF-SYS-02`): su desktop e tablet una barra fissa in basso;
  su smartphone un pulsante flottante che apre le cinque azioni.

```
[+ Prenotazione] [+ Cliente] [🔎 Disponibilità] [🏖 Assenza] [€ Pagamento]
```

---

## 5. Percorsi verso le schermate critiche

Ogni schermata critica deve essere raggiungibile in **al massimo un'azione**
dalla mappa:

| Da | A | Come |
|---|---|---|
| Mappa | Pannello ombrellone | tap sull'ombrellone |
| Mappa | Ricerca disponibilità | azione rapida |
| Mappa | Scheda cliente | ricerca globale |
| Mappa | Nuova prenotazione | azione rapida, oppure dal pannello |
| Mappa | Registra pagamento | dal pannello dell'ombrellone |
| Mappa | Dichiara assenza | dal pannello di un ombrellone stagionale |
| Mappa | Mappa di un altro giorno | selettore data, senza ricaricare |

Se durante l'implementazione un percorso richiede più di un'azione, è un difetto
di progettazione, non un dettaglio.

---

## 6. Cosa NON esiste come schermata

Deliberatamente assenti, per non ricreare il gestionale che il brief rifiuta:

- Nessuna homepage o cruscotto di benvenuto prima della mappa.
- Nessun elenco generico di prenotazioni: si arriva a una prenotazione da un
  ombrellone o da un cliente, mai da una tabella di tutte le prenotazioni.
- Nessuna procedura guidata a più passi per creare una prenotazione: è un solo
  pannello.
- Nessuna sezione "report" o "statistiche" nell'MVP.
- Nessun menu ad albero: la navigazione è piatta.
