// GFD offline support. Network first, so an online visit always gets the latest
// version; the cached copy is only used when the network fails (offline, flaky gym wifi).
// Supabase calls are never cached: sync and sign-in always go to the server.
const CACHE = 'gfd-v1';
const SHELL = [
  './', 'index.html', 'roadmap.html', 'privacy.html', 'terms.html', 'delete-account.html', 'manifest.webmanifest', 'src/styles.css',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'vendor/supabase.js',
  'src/js/platform.js', 'src/js/rules.js', 'src/js/syncmap.js', 'src/js/diagrams.js', 'src/js/gfd-exercise-art.js', 'src/js/exart.js', 'src/js/library.js',
  'src/js/state.js', 'src/js/numpad.js', 'src/js/events.js', 'src/js/day.js', 'src/js/plans.js', 'src/js/onboarding.js', 'src/js/signin.js', 'src/js/store.js', 'src/js/access.js', 'src/js/consent.js', 'src/js/health.js', 'src/js/account.js',
  'src/js/history.js', 'src/js/records.js', 'src/js/feedback.js', 'src/js/backup.js', 'src/js/coles.js', 'src/js/builder.js', 'src/js/swaps.js',
  'src/js/equipment.js', 'src/js/catalog.js', 'src/js/profile.js', 'src/js/finish.js', 'src/js/stats.js',
  'src/js/measure.js', 'src/js/wide.js', 'src/js/tabs.js', 'src/js/main.js',
  'src/js/gfd-exercise-art-gym.js', 'src/js/gfd-body-fig.js'
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  // Cache what we can; one missing file must not block install.
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !FONT_HOSTS.includes(url.hostname)) return; // Supabase and everything else: straight to the network
  e.respondWith(
    fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: sameOrigin }).then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
