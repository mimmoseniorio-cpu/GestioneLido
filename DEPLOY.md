# Metterlo online — Vercel + Neon

Serve perché tu possa **provarlo dal telefono**, senza installare niente sul
PC. Da qui io non posso creare account al posto tuo: quelli li fai tu, sono
gratis, e il resto lo faccio io.

Tempo: **una quindicina di minuti**, quasi tutti di attesa.

---

## Cosa sono i due servizi

| | A cosa serve | Costo |
|---|---|---|
| **Neon** | Il database: ombrelloni, clienti, contratti, assenze | Gratis fino a 0,5 GB — a te bastano anni |
| **Vercel** | L'applicazione: le pagine che apri dal telefono | Gratis per uso personale |

Li tengo separati perché il database deve sopravvivere a ogni rilascio: se un
giorno cambiamo hosting, i dati restano dove sono.

---

## Passo 1 · Neon (il database)

1. Vai su **neon.com** → *Sign up* → entra con GitHub (hai già l'account).
2. *Create project*. Nome: `gestionelido`. Regione: **Europe (Frankfurt)** —
   più vicina è, più la mappa risponde in fretta.
3. A progetto creato vedi un riquadro **Connection string**. Ti servono
   **due** indirizzi, e sono diversi:
   - quello con scritto **Pooled connection** (contiene `-pooler`)
   - quello **Direct connection** (senza `-pooler`)

   Se vedi un interruttore *Pooled connection*, copia la stringa con
   l'interruttore acceso, poi spegnilo e copia di nuovo.

4. **Incollamele qui in chat, tutte e due.** Sono credenziali del tuo
   database di prova: se in futuro vuoi cambiarle, da Neon si rigenerano in
   un clic (*Reset password*).

> Perché due indirizzi: il primo passa da un intermediario che regge tante
> connessioni insieme, ed è quello giusto per l'applicazione. Le migrazioni
> del database però hanno bisogno di parlare direttamente col server, altrimenti
> falliscono in modo intermittente e senza spiegazione.

### Due ritocchi alla stringa che Neon ti dà

Neon la scrive per il suo driver, non per il nostro. Prima di incollarla:

1. **Togli `&channel_binding=require`.** È un'estensione dell'autenticazione
   che il driver di Prisma non usa; lasciata lì può far fallire la connessione
   con un errore che non nomina se stesso. La cifratura resta, ed è
   `sslmode=require` a garantirla.
2. **Sull'indirizzo *Pooled*, aggiungi `&pgbouncer=true`.** L'intermediario
   riusa la stessa connessione per richieste di clienti diversi; senza questo,
   Prisma prepara istruzioni che si aspetta di ritrovare e non ritrova più.
   Sull'indirizzo *Direct* non va messo.

Risultato:

```
DATABASE_URL         …-pooler.<regione>.aws.neon.tech/neondb?sslmode=require&pgbouncer=true
DIRECT_DATABASE_URL  …<regione>.aws.neon.tech/neondb?sslmode=require
```

---

## Passo 2 · Vercel (l'applicazione)

1. Vai su **vercel.com** → *Sign up* → **Continue with GitHub**.
2. *Add New…* → *Project* → nell'elenco compare **GestioneLido** → *Import*.
3. **Non premere ancora Deploy.** Apri prima *Environment Variables* e
   aggiungi queste quattro righe:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | l'indirizzo **Pooled** di Neon |
   | `DIRECT_DATABASE_URL` | l'indirizzo **Direct** di Neon |
   | `APP_URL` | lascialo vuoto per ora — lo mettiamo dopo il primo rilascio |
   | `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` | `1` |

4. Ora *Deploy*. Ci mette 2–3 minuti.
5. Ti dà un indirizzo tipo `gestionelido-xxxx.vercel.app`. **Mandamelo.**

Se preferisci, salta il passo 2 e dammi solo gli indirizzi di Neon: posso
guidarti clic per clic mentre lo fai, oppure farlo io se mi dai accesso al
progetto Vercel.

---

## Passo 3 · L'ultima variabile (importante)

Torna su Vercel → *Settings* → *Environment Variables* → `APP_URL` →
scrivici l'indirizzo del punto 5, per esteso:

```
https://gestionelido-xxxx.vercel.app
```

Poi *Deployments* → sull'ultimo, i tre puntini → *Redeploy*.

**Non è un dettaglio.** `APP_URL` è l'indirizzo che finisce dentro i link
personali che mandi agli stagionali su WhatsApp. Se è sbagliato, il cliente
riceve un link che non apre niente — e non ha nessun modo di accorgersene o
di rimediare da solo.

---

## Cosa trovi appena entri

Al primo rilascio il database è vuoto, quindi si popola da solo con lo
stabilimento dimostrativo: **96 ombrelloni, 28 stagionali, 120 clienti**,
prenotazioni e assenze già in corso.

Succede durante la build, non dopo: `prisma migrate deploy` crea le tabelle e
i vincoli (fra cui `btree_gist`, quello che impedisce di vendere due volte lo
stesso ombrellone), poi il caricamento dei dati parte **solo se non trova già
uno stabilimento**. Se il rilascio arriva in fondo, quei vincoli esistono
davvero: è la prova che il fornitore li supporta.

```
https://<il tuo indirizzo>/login

   admin@lidoadriano.it / lido2026          titolare
   reception@lidoadriano.it / lido2026      operatore (permessi ridotti)
```

Da provare, nell'ordine:

1. **`/map`** — la risposta a «avete un ombrellone libero?» è già sullo
   schermo, senza toccare nulla.
2. **`/seasonal`** — in cima chi è assente oggi: sono i posti che puoi
   vendere adesso. Premi *Registra assenza* → **DOMANI** su uno qualsiasi.
3. Torna sulla mappa, freccia **▶** per andare a domani: quel posto è
   diventato *Liberato da stagionale*, e il contatore l'ha già contato.
4. Vendilo. Prima di confermare vedi **quanto credito** ti costa.
5. **`/dashboard`** — «capacità recuperata»: posti e incasso che senza
   questo meccanismo sarebbero rimasti sotto un ombrellone vuoto.

Aprilo **dal telefono**, non dal PC: sotto i 700 px la mappa diventa un
elenco ordinato per urgenza, ed è lì che si vede se funziona davvero.

---

## Da sapere

- **I dati dimostrativi si caricano una sola volta.** A ogni rilascio
  successivo il database viene lasciato in pace: se ci metti dati veri, non
  te li cancello. Per ricominciare da zero, si svuota il database da Neon e
  il rilascio successivo lo ripopola.
- **È una prova, non un impianto di produzione.** Mancano ancora i backup
  automatici e gli ambienti separati (`F4-10` completo). Non ci metterei
  ancora i clienti veri di uno stabilimento vero.
- **Ogni `git push` rilascia in automatico.** Quando aggiungo qualcosa, la
  trovi online in un paio di minuti senza fare nulla.
- **Il database dimostrativo è pubblico a chi ha il link.** Le password sono
  quelle scritte qui sopra. Va bene per provarlo; prima di mostrarlo a un
  gestore vero le cambiamo.

---

## Se qualcosa non va

Mandami quello che vedi — il messaggio di errore o lo schermo — e lo sistemo.
Le due cose che possono andare storte al primo colpo:

- **Il rilascio fallisce durante la build.** Quasi sempre è un indirizzo del
  database copiato a metà: sono lunghi e l'ultima parte si perde facilmente.
- **`Can't reach database server`.** Il progetto Neon si mette in pausa da
  solo dopo qualche minuto di inattività (è così nel piano gratuito) e si
  risveglia da sé alla richiesta successiva. Se càpita, ricarica la pagina.
