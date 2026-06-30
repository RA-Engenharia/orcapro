/* Service Worker do OrçaPRO IA (app instalável). Network-first com cache de fallback:
 * - servidor local rodando -> sempre a versão mais nova (e cacheia tudo);
 * - servidor parado / offline -> abre do cache (dá pra usar sem rodar o Iniciar-OrcaPRO).
 * Só cacheia o MESMO domínio (IA, servidor de licença e fontes externas vão direto pra rede). */
var CACHE = 'orcapro-app-v1';

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return k === CACHE ? null : caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
  );
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return; // IA (:3041), licença (VPS), Google Fonts: rede direto
  e.respondWith(
    fetch(req).then(function (r) {
      if (r && r.ok) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, cp); }); }
      return r;
    }).catch(function () {
      return caches.match(req).then(function (m) {
        return m || (req.mode === 'navigate' ? caches.match('./index.html') : undefined);
      });
    })
  );
});
