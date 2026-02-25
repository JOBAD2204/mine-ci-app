// ═══════════════════════════════════════════════════════
//  SERVICE WORKER — Cadastre Minier CI
//  Gère le cache hors-ligne et la synchronisation
// ═══════════════════════════════════════════════════════

const CACHE_NAME = 'cadastre-ci-v1';
const DATA_CACHE = 'cadastre-data-v1';

// Fichiers à mettre en cache pour le mode hors-ligne
const STATIC_FILES = [
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=Space+Mono:wght@400;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
];

// ── Installation ─────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Mise en cache des fichiers statiques');
      return cache.addAll(STATIC_FILES).catch(err => {
        console.warn('[SW] Certains fichiers non mis en cache :', err);
      });
    })
  );
  self.skipWaiting();
});

// ── Activation ───────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== DATA_CACHE)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Interception des requêtes ─────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Données JSON → Network First (puis cache si hors-ligne)
  if (url.pathname.includes('donnees_cadastre.json')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(DATA_CACHE).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Tuiles carte Leaflet → Cache First
  if (url.hostname.includes('tile') || url.pathname.includes('tiles')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
          return response;
        }).catch(() => new Response('', { status: 503 }));
      })
    );
    return;
  }

  // Reste → Cache First avec fallback réseau
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

// ── Notifications push (alertes zones illégales) ─────────
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || '⚠️ Alerte Cadastre Minier', {
      body: data.body || 'Nouvelle zone illégale détectée par GEE',
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: 'alerte-mine',
      data: { url: data.url || './index.html#alertes' },
      actions: [
        { action: 'voir', title: 'Voir sur la carte' },
        { action: 'ignorer', title: 'Ignorer' }
      ]
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'voir') {
    clients.openWindow(event.notification.data.url);
  }
});
