# 06 — Wireframe descrittivi

**Fase:** F1 · **Stato:** completo

> Wireframe testuali, non definitivi nel dettaglio grafico. Definiscono
> **gerarchia, densità e numero di interazioni**. Il layout è vincolante; colori
> e spaziature no.

---

## 1. Vincoli che determinano tutti i layout

Derivano da `docs/01` §2 — chi usa davvero il software.

| Vincolo | Conseguenza |
|---|---|
| Schermo al sole | Contrasto alto, niente grigio su grigio, testo ≥ 16 px |
| Mani bagnate, sabbia | Target ≥ 44 px, spaziatura generosa fra azioni distruttive e non |
| Cliente che parla mentre si opera | Nessun passo obbligato, si può interrompere e riprendere |
| Tablet in mano | Azioni frequenti nella metà **bassa** dello schermo, raggiungibili col pollice |
| Nessun manuale | Etichette in parole, mai icone sole per azioni importanti |

---

## 2. S-01 — Mappa (tablet, orizzontale) ★ schermata principale

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ☰   [🔍 Cerca cliente, telefono, ombrellone…]           ● sync    👤    │
├─────────────────────────────────────────────────────────────────────────┤
│  ◀  mer 12 agosto 2027  ▶     [Oggi]        Filtri: [Tutti ▾]           │
├─────────────────────────────────────────────────────────────────────────┤
│  96 ombrelloni · 58 occupati · 24 liberi · 9 stagionali assenti          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                          ~ ~ ~  M A R E  ~ ~ ~                    │  │
│  │  A  ①  ②  ③  ④  ⑤  ⑥  ⑦  ⑧ ┊ ⑨  ⑩  ⑪  ⑫  ⑬  ⑭  ⑮  ⑯          │  │
│  │  B  ⓵  ⓶  ⊘  ⓸  ⓹  ⓺  ⓻  ⓼ ┊ ⓽  ⓾  ㉑  ㉒  ㉓  ㉔  ㉕  ㉖          │  │
│  │ ═══════════════ p a s s e r e l l a ═══════════════════════════   │  │
│  │  C  ㉗  ㉘  ㉙  ㉚  ㉛  ㉜  ㉝ ┊ ㉞  ㉟  ㊱  ㊲  ㊳  ㊴  ㊵  ㊶          │  │
│  │  D  …                                                             │  │
│  │                        [ 🚻 ]      [ 🍹 bar ]                     │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│  Legenda: ● libero  ■ occupato  ◐ prenotato  ★ stagionale               │
│           ☆ stagionale assente — VENDIBILE   ⊘ bloccato                 │
├─────────────────────────────────────────────────────────────────────────┤
│ [+ Prenotazione] [+ Cliente] [🔎 Disponibilità] [🏖 Assenza] [€ Incasso]│
└─────────────────────────────────────────────────────────────────────────┘
```

**Decisioni di progettazione**

- **La riga dei contatori sopra la mappa risponde allo scenario F senza un
  click.** "9 stagionali assenti" è il numero che genera ricavo: è scritto in
  chiaro, non nascosto in una dashboard.
- **Il mare è in alto**, sempre. È l'orientamento mentale del gestore, e rende
  la mappa leggibile a chiunque senza spiegazioni.
- **Tre segnali per stato, mai solo il colore** (`NF-06`): forma del simbolo,
  colore di riempimento, trattamento del bordo. `☆` (stagionale assente,
  vendibile) è il più visibile di tutti — è ciò che il gestore deve notare.
- **La barra azioni sta in basso**: raggiungibile col pollice reggendo il tablet.
- **Le passerelle e i corridoi sono disegnati**, non impliciti: servono a
  orientarsi e sono gli stessi che entrano nel calcolo dell'adiacenza (`docs/03` §7).
- Il **filtro** riduce la mappa a una categoria (`Solo vendibili`, `Solo da
  incassare`, `Solo stagionali assenti`) senza cambiare schermata.

### 2.1 Variante smartphone

Non è la versione desktop rimpicciolita: cambia la modalità di lettura.

```
┌───────────────────────────┐
│ ☰  [🔍]        ● sync  👤 │
├───────────────────────────┤
│  ◀ mer 12 ago ▶   [Oggi]  │
├───────────────────────────┤
│ 58 occ · 24 lib · 9 ☆     │
├───────────────────────────┤
│  [ Mappa ] [ Elenco ]     │  ← due modalità
│                           │
│  ~ ~ ~ MARE ~ ~ ~         │
│   ① ② ③ ④ ⑤ ⑥            │
│   ⑦ ⑧ ⑨ ⑩ ⑪ ⑫            │  pinch-zoom
│   …                       │  scroll verticale
│                           │
├───────────────────────────┤
│           ( + )           │  ← azioni rapide
└───────────────────────────┘
```

**Modalità Elenco** — la vera aggiunta per il telefono. Su schermo piccolo
scorrere una mappa da 96 elementi è peggio di una lista ordinata:

```
│ ☆ 34  VENDIBILE OGGI      │
│    Rossi assente 12–14 ago│
│ ☆ 51  VENDIBILE OGGI      │
│ ● 12  Libero              │
│ ■ 63  Bianchi · 10–15 ago │
│    ⚠ da incassare 120 €   │
```

Ordinamento predefinito: prima i vendibili, poi i liberi, poi i da incassare.
Cioè: **prima ciò su cui si può agire**.

---

## 3. S-02 — Pannello ombrellone ★

Overlay laterale su tablet e desktop, foglio dal basso su smartphone. Non è una
pagina: la mappa resta visibile dietro, e si chiude con un tap fuori.

### 3.1 Ombrellone libero — 1 tap per prenotare

```
┌──────────────────────────────┐
│  Ombrellone 34          ✕    │
│  Fila C · Zona centrale      │
├──────────────────────────────┤
│  ● LIBERO                    │
│  mer 12 agosto 2027          │
│                              │
│  Tariffa oggi      25,00 €   │
│  Capienza          4 persone │
├──────────────────────────────┤
│  ┌────────────────────────┐  │
│  │   PRENOTA              │  │  ← azione primaria, larga
│  └────────────────────────┘  │
│  [ Blocca ]     [ Nota ]     │
└──────────────────────────────┘
```

### 3.2 Ombrellone occupato — l'informazione prima delle azioni

```
┌──────────────────────────────┐
│  Ombrellone 63          ✕    │
│  Fila A · Prima fila         │
├──────────────────────────────┤
│  ■ OCCUPATO                  │
│                              │
│  Mario Bianchi               │
│  📞 348 1234567    [WhatsApp]│
│  10 – 15 agosto (6 giorni)   │
│  4 persone · da reception    │
│                              │
│  Totale        180,00 €      │
│  Pagato         50,00 €      │
│  ⚠ Da incassare 130,00 €     │
│                              │
│  📝 "Arriva dopo le 10"      │
├──────────────────────────────┤
│  ┌────────────────────────┐  │
│  │   REGISTRA PAGAMENTO   │  │  ← l'azione più probabile qui
│  └────────────────────────┘  │
│  [ Modifica ] [ Sposta ]     │
│  [ Libera ]   [ Nota ]       │
└──────────────────────────────┘
```

L'azione primaria **cambia in base allo stato**: su un occupato con saldo aperto
è incassare, non modificare. Questo è ciò che rende il pannello veloce: l'80%
delle volte il pulsante grande è già quello giusto.

### 3.3 Stagionale assente — il pannello che genera ricavo

```
┌──────────────────────────────┐
│  Ombrellone 51          ✕    │
│  Fila B · Zona centrale      │
├──────────────────────────────┤
│  ☆ VENDIBILE OGGI            │
│                              │
│  Stagionale: Luigi Verdi     │
│  📞 335 9876543              │
│  Assente 12 – 14 agosto      │
│  comunicato lun 10 alle 18:４２│
│                              │
│  Tariffa oggi      25,00 €   │
│  Credito a Verdi    7,50 €   │  ← trasparente, se si vende
│                              │
│  ⓘ Torna riservato il 15 ago │
├──────────────────────────────┤
│  ┌────────────────────────┐  │
│  │   VENDI PER OGGI       │  │
│  └────────────────────────┘  │
│  [ Vendi 12–14 ]  [ Dettagli]│
└──────────────────────────────┘
```

**Perché il credito è mostrato prima della vendita.** Il gestore deve sapere
quanto gli costa quella vendita mentre decide, non scoprirlo a fine mese. È
anche ciò che gli fa capire il meccanismo senza che nessuno glielo spieghi.

La frase "Torna riservato il 15 ago" elimina la paura principale del gestore —
"e poi il posto lo perdo?" — nel momento in cui la proverebbe.

---

## 4. S-03 — Ricerca disponibilità ★ (scenario B)

```
┌─────────────────────────────────────────────────────────────┐
│  Cerca disponibilità                                   ✕    │
├─────────────────────────────────────────────────────────────┤
│  Dal [10 ago 2027]  al [15 ago 2027]      Quanti? [ 2 ] ▲▼  │
│                                                             │
│  Preferenze (facoltative)                                   │
│  [ Vicini tra loro ✓ ]  [ Fila ▾ ]  [ Zona ▾ ]  [ Max € ▾ ] │
│                                                             │
│            ┌───────────────────────────┐                    │
│            │        CERCA              │                    │
│            └───────────────────────────┘                    │
├─────────────────────────────────────────────────────────────┤
│  4 soluzioni trovate                                        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ★ 62 + 63    Fila A · affiancati · prima fila       │    │
│  │   360,00 €   (180 + 180)                            │    │
│  │                              [Vedi] [PRENOTA]       │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │   34 + 35    Fila C · affiancati                    │    │
│  │   300,00 €   (150 + 150)                            │    │
│  │                              [Vedi] [PRENOTA]       │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │   51 + 52    Fila B · affiancati                    │    │
│  │   ☆ il 51 è di uno stagionale assente 12–14         │    │
│  │   ⚠ disponibile solo 12–14, non tutto il periodo    │    │
│  │                              [Vedi] [Prenota 12–14] │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

**Decisioni**

- Due campi obbligatori soli: periodo e quantità. Le preferenze sono opzionali e
  non bloccano la ricerca.
- **[Vedi]** evidenzia la soluzione sulla mappa senza chiudere il pannello: il
  gestore descrive al telefono dove si trova il posto.
- Le soluzioni **parziali si mostrano lo stesso**, marcate. Il gestore preferisce
  vedere "posso darti 3 giorni su 6" piuttosto che "nessun risultato" — è ciò
  che gli permette di negoziare.
- I posti da assenza stagionale sono **sempre etichettati**: il gestore deve
  sapere cosa sta vendendo.

---

## 5. C-01 / C-02 — Area cliente stagionale ★

Progettata per una persona anziana, sul telefono, senza istruzioni. Una sola
azione possibile.

```
┌───────────────────────────┐
│  Lido Adriano             │
│                           │
│  Buongiorno Luigi         │
│                           │
│  ┌─────────────────────┐  │
│  │   Il tuo ombrellone │  │
│  │                     │  │
│  │        5 1          │  │  ← numero enorme
│  │                     │  │
│  │   Fila B · centrale │  │
│  │   1 giu – 15 set    │  │
│  └─────────────────────┘  │
│                           │
│  ┌─────────────────────┐  │
│  │                     │  │
│  │  NON SARÒ PRESENTE  │  │  ← unica azione, gigante
│  │                     │  │
│  └─────────────────────┘  │
│                           │
│  Assenze comunicate       │
│  • 12–14 ago   ✓ attiva   │
│  • 3 ago       venduto    │
│                           │
│  Il tuo credito  22,50 €  │
│  [ Vedi dettaglio ]       │
└───────────────────────────┘
```

### C-02 — Dichiarazione dell'assenza, 3 tap

```
Tap 1                    Tap 2                    Tap 3
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│ Quando non   │         │  agosto 2027 │         │  Confermi?   │
│ ci sarai?    │         │ L M M G V S D│         │              │
│              │         │        1  2  │         │ Non sarai    │
│ ┌──────────┐ │         │ 3 4 5 6 7 8 9│         │ presente     │
│ │  DOMANI  │ │  ───▶   │ … ▓▓ ▓▓ …    │  ───▶   │ 12–14 agosto │
│ └──────────┘ │         │              │         │              │
│ ┌──────────┐ │         │ 12–14 agosto │         │ ┌──────────┐ │
│ │ SCEGLI   │ │         │ (3 giorni)   │         │ │ CONFERMA │ │
│ │ LE DATE  │ │         │              │         │ └──────────┘ │
│ └──────────┘ │         │  [Avanti]    │         │  [ Annulla ] │
└──────────────┘         └──────────────┘         └──────────────┘
```

**"DOMANI" è una scorciatoia a 2 tap totali**, perché è il caso di gran lunga
più frequente (scenario C). Il calendario serve solo a chi parte per una
settimana.

Schermata finale, deliberatamente rassicurante:

```
│         ✓                 │
│  Registrato               │
│                           │
│  Non sarai presente       │
│  dal 12 al 14 agosto      │
│                           │
│  Il tuo ombrellone torna  │
│  tuo dal 15 agosto.       │  ← rimuove la paura
│                           │
│  Se lo stabilimento       │
│  riesce ad assegnarlo,    │
│  riceverai un credito.    │
│                           │
│  [ Ho capito ]            │
```

Non si promette il credito: si dice **"se"**. Promettere ciò che dipende dalla
domanda genera contestazioni.

---

## 6. S-22 / S-23 — Editor mappa e generatore griglia

Risolve `C-08`: se configurare richiede un'ora, il prodotto non viene adottato.

```
┌─────────────────────────────────────────────────────────────┐
│  Configura la mappa                                    ✕    │
├─────────────────────────────────────────────────────────────┤
│  Iniziamo velocemente                                       │
│                                                             │
│   Quante file?          [ 6 ]                               │
│   Ombrelloni per fila   [ 16 ]                              │
│   Numerazione           ( ) A1, A2, A3…                     │
│                         (•) 1, 2, 3… progressiva            │
│   Prima fila verso      (•) mare   ( ) ingresso             │
│                                                             │
│   Anteprima:  96 ombrelloni, file A–F                       │
│   ┌───────────────────────────────────────┐                 │
│   │ ~~~ MARE ~~~                          │                 │
│   │ A  1  2  3  4 …                       │                 │
│   │ B 17 18 19 20 …                       │                 │
│   └───────────────────────────────────────┘                 │
│                                                             │
│            [ GENERA MAPPA ]                                 │
│                                                             │
│  Poi potrai spostare, rinumerare, aggiungere passerelle.    │
└─────────────────────────────────────────────────────────────┘
```

Editor successivo: trascinamento degli ombrelloni, strumento rettangolo per
passerelle e corridoi, rinumerazione multipla, assegnazione zone per selezione.
Nell'MVP basta che sia **usabile una volta all'anno**, non che sia elegante.

---

## 7. S-12 — Dashboard

Numeri che guidano un'azione. Nessun grafico decorativo (`RF-DSH-03`).

```
┌─────────────────────────────────────────────────────────────┐
│  Oggi · mercoledì 12 agosto 2027                            │
├──────────────────┬──────────────────┬───────────────────────┤
│  OCCUPAZIONE     │  INCASSI         │  DA FARE              │
│                  │                  │                       │
│  58 / 96         │  Previsto        │  ⚠ 6 da incassare     │
│  60%             │  1.450,00 €      │     780,00 €          │
│                  │                  │     [Vedi]            │
│  24 liberi       │  Incassato       │                       │
│  ☆ 9 vendibili   │  670,00 €        │  ☆ 9 posti vendibili  │
│  ⊘ 3 bloccati    │                  │     oggi              │
│                  │  Da incassare    │     [Vedi sulla mappa]│
│  [Vedi mappa]    │  780,00 €        │                       │
├──────────────────┴──────────────────┴───────────────────────┤
│  Prossimi 7 giorni                                          │
│  gio 13 ▓▓▓▓▓▓▓░░ 72%    dom 16 ▓▓▓▓▓▓▓▓▓ 94%              │
│  ven 14 ▓▓▓▓▓▓▓▓░ 81%    lun 17 ▓▓▓▓▓░░░░ 55%              │
│  sab 15 ▓▓▓▓▓▓▓▓▓ 91%    …                                  │
└─────────────────────────────────────────────────────────────┘
```

Ogni numero della colonna "DA FARE" è **cliccabile e porta all'azione**. Una
dashboard che informa senza permettere di agire fa perdere tempo.

---

## 8. Comportamento responsive

| Elemento | Desktop | Tablet | Smartphone |
|---|---|---|---|
| Mappa | Intera, con zoom | Intera, pinch-zoom | Zoom + **modalità elenco** |
| Pannello ombrellone | Colonna laterale destra | Overlay laterale | Foglio dal basso |
| Azioni rapide | Barra in alto | **Barra in basso** | Pulsante flottante |
| Ricerca disponibilità | Due colonne | Modale a pieno schermo | Pagina intera |
| Calendario | Griglia completa | Griglia scorrevole | Un giorno per volta |
| Editor mappa | Completo | Completo | **Sola lettura** |

L'editor mappa non è utilizzabile da telefono: è configurazione, si fa una volta
all'anno, e forzarlo su schermo piccolo produrrebbe solo errori.

---

## 9. Stati vuoti, errori, attesa

Tre casi che decidono se il software sembra affidabile.

**Nessun risultato nella ricerca disponibilità** — mai un vicolo cieco:
```
   Nessun ombrellone libero per 2 persone dal 10 al 15 agosto.

   Però:
   • 62 + 63 sono liberi dal 10 al 13     [Vedi]
   • 34 è libero tutto il periodo (1 solo) [Vedi]
   • il 12 e 13 si liberano 2 posti stagionali [Vedi]
```

**Conflitto in scrittura** — linguaggio umano, non codice:
```
   ⚠ L'ombrellone 63 è stato appena prenotato
     da Marco alle 10:32.

     [ Cerca alternative ]   [ Vedi prenotazione ]
```

**Operazione non salvata** (`NF-02`) — mai ambigua:
```
   ● Non salvato — connessione assente
     La prenotazione di Bianchi non è stata registrata.
     [ Riprova ]      Riprovo automaticamente tra 8 s…
```
