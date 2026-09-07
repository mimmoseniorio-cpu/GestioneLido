#!/usr/bin/env bash
#
# F4-10 · Provare una copia di sicurezza, invece di sperarci.
#
# Prende l'ultima copia, la ripristina su un database usa-e-getta e controlla
# che ci sia tutto ciò che conta. Non basta che le TABELLE tornino: se si
# perdessero i vincoli EXCLUDE, il database ripristinato accetterebbe di
# vendere due volte lo stesso ombrellone, e nessuno se ne accorgerebbe finché
# non succede.
#
#   npm run backup && npm run backup:verifica
#
# Serve un PostgreSQL locale su cui creare il database di prova.
set -euo pipefail

FILE="${1:-$(ls -t ./backup/*.sql.gz 2>/dev/null | head -1 || true)}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "✗ Nessuna copia da provare. Prima: npm run backup" >&2
  exit 1
fi

PROVA="${DB_PROVA:-gestionelido_verifica_backup}"
# Stesso indirizzo del database di sviluppo, con un nome diverso: chi ha
# `.env` configurato non deve passare nulla a mano.
BASE=$(sed -n 's/^DATABASE_URL=//p' .env 2>/dev/null | head -1 | tr -d '"'"'"'')
BASE="${BASE%%\?*}"
URL_PROVA="${URL_DB_PROVA:-${BASE:+${BASE%/*}/$PROVA}}"
URL_PROVA="${URL_PROVA:-postgresql://lido:lido@127.0.0.1:5432/$PROVA}"

echo "· provo $FILE su $PROVA"
psql "${URL_PROVA%/*}/postgres" -q -c "DROP DATABASE IF EXISTS $PROVA;" \
                                 -c "CREATE DATABASE $PROVA;" > /dev/null
gunzip -c "$FILE" | psql -q "$URL_PROVA" > /tmp/verifica-backup.log 2>&1 || {
  echo "✗ Il ripristino è fallito. Dettagli in /tmp/verifica-backup.log" >&2
  exit 1
}

conta() { psql -tA "$URL_PROVA" -c "$1"; }
esito=0
attesa() { # nome, valore, minimo
  if [ "$2" -ge "$3" ]; then echo "  ✓ $1: $2"
  else echo "  ✗ $1: $2 (atteso almeno $3)"; esito=1; fi
}

attesa "ombrelloni"   "$(conta 'select count(*) from umbrella;')" 1
attesa "clienti"      "$(conta 'select count(*) from customer;')" 1
attesa "prenotazioni" "$(conta 'select count(*) from reservation;')" 1

# Le garanzie, non i dati: sono la parte che si perde in silenzio.
attesa "vincoli EXCLUDE" \
  "$(conta "select count(*) from pg_constraint where contype='x';")" 3
attesa "trigger (audit non modificabile, stato item)" \
  "$(conta 'select count(*) from pg_trigger where not tgisinternal;')" 3
attesa "estensione btree_gist" \
  "$(conta "select count(*) from pg_extension where extname='btree_gist';")" 1

psql "${URL_PROVA%/*}/postgres" -q -c "DROP DATABASE $PROVA;" > /dev/null

if [ "$esito" -eq 0 ]; then
  echo "✓ La copia è ripristinabile, con vincoli e trigger al loro posto."
else
  echo "✗ La copia NON è affidabile: vedi sopra." >&2
fi
exit "$esito"
