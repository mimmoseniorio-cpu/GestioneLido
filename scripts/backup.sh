#!/usr/bin/env bash
#
# F4-10 · Copia di sicurezza del database.
#
# Va eseguita da una macchina che raggiunge il database — il proprio computer,
# o un runner di GitHub Actions. Usa DIRECT_DATABASE_URL, non quella con il
# pool: `pg_dump` apre una sessione lunga, e l'intermediario la interrompe.
#
#   npm run backup                    → ./backup/gestionelido-<data>.sql.gz
#   DESTINAZIONE=/altro npm run backup
#
# Il file contiene TUTTI i dati dei clienti: nomi, telefoni, pagamenti. Va
# trattato come tale — non su una cartella condivisa, non in allegato.
set -euo pipefail

# Prisma e Next leggono `.env` da soli; uno script di shell no, e chi lancia
# `npm run backup` non ha motivo di aspettarsi la differenza. Si legge la
# singola riga che serve, invece di eseguire il file: un `source` su un .env
# con spazi o apici fa cose che nessuno ha chiesto.
leggi_env() {
  [ -f .env ] || return 0
  sed -n "s/^$1=//p" .env | head -1 | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

URL="${DIRECT_DATABASE_URL:-${DATABASE_URL:-}}"
[ -z "$URL" ] && URL=$(leggi_env DIRECT_DATABASE_URL)
[ -z "$URL" ] && URL=$(leggi_env DATABASE_URL)
if [ -z "$URL" ]; then
  echo "✗ Manca DIRECT_DATABASE_URL (o DATABASE_URL). Vedi .env.example." >&2
  exit 1
fi
if ! command -v pg_dump > /dev/null; then
  echo "✗ pg_dump non è installato. Su Debian/Ubuntu: apt install postgresql-client" >&2
  exit 1
fi

# `schema` e `pgbouncer` li capisce Prisma, non pg_dump: lasciati nell'indirizzo
# fanno fallire il comando con «invalid URI query parameter», che non spiega
# nulla a chi sta solo cercando di salvare i propri dati.
URL=$(printf '%s' "$URL" | sed -E 's/([?&])(schema|pgbouncer|connection_limit|pool_timeout)=[^&]*//g; s/\?&/?/; s/[?&]$//')

DEST="${DESTINAZIONE:-./backup}"
mkdir -p "$DEST"
FILE="$DEST/gestionelido-$(date +%Y%m%d-%H%M%S).sql.gz"

# --no-owner e --no-acl: il ripristino deve funzionare su un database nuovo,
# con un utente diverso da quello di partenza. Senza, fallisce a metà.
pg_dump --no-owner --no-acl --format=plain "$URL" | gzip > "$FILE"

BYTE=$(wc -c < "$FILE")
# Un dump vuoto pesa comunque un paio di KB: senza questo controllo, una copia
# fallita sembrerebbe riuscita finché non serve davvero.
if [ "$BYTE" -lt 2000 ]; then
  echo "✗ La copia pesa $BYTE byte: troppo poco per essere vera. Non fidartene." >&2
  exit 1
fi

echo "✓ $FILE ($(du -h "$FILE" | cut -f1))"
echo
echo "  Per ripristinare su un database VUOTO:"
echo "    gunzip -c $FILE | psql \"\$DIRECT_DATABASE_URL\""
echo
echo "  Una copia mai ripristinata non è una copia: provala almeno una volta"
echo "  su un database di prova, prima di averne bisogno."
