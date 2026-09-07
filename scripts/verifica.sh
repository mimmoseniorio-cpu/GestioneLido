#!/usr/bin/env bash
#
# Tutto ciò che la CI controlla, in un comando solo.
#
# Esiste per una ragione precisa: eseguendo i pezzi a mano se ne salta uno.
# È successo — un test aggiunto senza rilanciare `typecheck`, e la CI rossa
# per due giri senza che nessuno guardasse.
#
#   npm run verifica
set -euo pipefail

passo() { printf '\n\033[1m── %s\033[0m\n' "$1"; }

passo 'Tipi'
npm run typecheck

passo 'Test'
npm test

# La CI non ha `/opt/pw-browsers`, questo contenitore sì. Un test che si
# appoggia a un percorso presente solo qui passa in locale e fallisce là —
# è già successo. Se il percorso esiste, si rifà il giro senza.
if [ -d /opt/pw-browsers ]; then
  passo 'Test anche senza il browser locale (come nella CI)'
  PW_BROWSERS_NASCOSTI=1 sh -c 'mv /opt/pw-browsers /opt/pw-browsers.off; \
    npm test > /tmp/verifica-senza-browser.log 2>&1; esito=$?; \
    mv /opt/pw-browsers.off /opt/pw-browsers; exit $esito' \
    || { tail -30 /tmp/verifica-senza-browser.log; exit 1; }
  grep -E 'Tests ' /tmp/verifica-senza-browser.log
fi

passo 'Compilazione'
npm run build

passo 'Stabilimento dimostrativo'
npm run seed > /dev/null

passo 'Avvio'
# Un server rimasto acceso da prima servirebbe la versione vecchia.
ps aux | grep next-server | grep -v grep | awk '{print $2}' | xargs -r kill || true
sleep 1
npm start > /tmp/verifica-server.log 2>&1 &
SERVER=$!
trap 'kill "$SERVER" 2>/dev/null || true' EXIT
npx wait-on -t 60000 http://localhost:3000/login

passo 'Scenari e conteggio delle interazioni'
npm run e2e

passo 'Copia di sicurezza e prova di ripristino'
npm run backup
npm run backup:verifica

printf '\n\033[1m✓ Tutto verde. Si può spingere.\033[0m\n'
