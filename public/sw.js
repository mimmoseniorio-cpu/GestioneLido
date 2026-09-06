/**
 * Service worker — MVP-16.
 *
 * Mette in cache SOLO il guscio dell'applicazione: HTML di navigazione, CSS,
 * JS, icone. MAI le disponibilità.
 *
 * Il motivo è di prodotto, non tecnico: dati di occupazione serviti da cache
 * sono peggio di nessun dato, perché porterebbero a vendere un posto già
 * venduto. Meglio una schermata che dice «non riesco a leggere» che una mappa
 * che mente (docs/02 §7).
 */
const VERSIONE = 'lido-v1'
const GUSCIO = ['/map', '/manifest.webmanifest', '/icon-192.png']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSIONE).then(c => c.addAll(GUSCIO)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(chiavi => Promise.all(chiavi.filter(k => k !== VERSIONE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  // Le API non si mettono mai in cache: né le letture né tantomeno le scritture.
  if (url.pathname.startsWith('/api/')) return
  if (e.request.method !== 'GET') return
  if (url.origin !== self.location.origin) return

  // Rete prima, cache come rete di salvataggio: se il server risponde, la sua
  // risposta è sempre più fresca.
  e.respondWith(
    fetch(e.request)
      .then(risposta => {
        if (risposta.ok && risposta.type === 'basic') {
          const copia = risposta.clone()
          caches.open(VERSIONE).then(c => c.put(e.request, copia))
        }
        return risposta
      })
      .catch(() => caches.match(e.request).then(c => c ?? caches.match('/map'))),
  )
})
