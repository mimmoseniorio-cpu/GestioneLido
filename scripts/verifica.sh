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
