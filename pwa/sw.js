const CACHE = 'chore-quest-v56';

const LOCAL_ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Domains that must NEVER be intercepted by the SW.
// Firebase uses long-polling POST streams — intercepting them delays
// Firestore keepalives and causes onSnapshot bursts that block touch on Android.
const PASSTHROUGH_HOSTS = [
  'firestore.googleapis.com',
  'firebase.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'www.googleapis.com',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(LOCAL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // ── Never intercept Firebase / Google API requests ──────────────────
  // These use POST long-polling streams. Wrapping them in SW fetch breaks
  // the persistent connection and causes touch-blocking onSnapshot bursts.
  if (PASSTHROUGH_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) {
    return; // Let browser handle directly — no e.respondWith()
  }

  // ── Only cache GET requests — POST/PUT cannot be cached ─────────────
  if (e.request.method !== 'GET') return;

  const isLocal = url.origin === self.location.origin;
  const isHTML  = e.request.destination === 'document'
                || url.pathname.endsWith('.html')
                || url.pathname === '/';

  if (isHTML) {
    // Network-first: always serve freshest HTML; fall back to cache offline
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );

  } else if (isLocal) {
    // Local assets (icons, manifest): cache-first
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }))
    );

  } else {
    // External CDN (fonts, chart.js): network-first, cache for offline fallback
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  }
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SHOW_NOTIF') {
    const { title, body, tag, icon } = e.data;
    e.waitUntil(
      self.registration.showNotification(title, {
        body, tag: tag || 'chore-quest',
        icon: icon || './icon-192.png', badge: './icon-192.png',
        vibrate: [200, 100, 200],
        data: { url: self.registration.scope }
      })
    );
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});
