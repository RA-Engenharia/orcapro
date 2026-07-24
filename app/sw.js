/* Service Worker do OrçaPRO IA (app instalável). Network-first com cache de fallback:
 * - servidor local rodando -> sempre a versão mais nova (e cacheia tudo);
 * - servidor parado / offline -> abre do cache (dá pra usar sem rodar o Iniciar-OrcaPRO).
 * Só cacheia o MESMO domínio (IA, servidor de licença e fontes externas vão direto pra rede). */
/* IMPORTANTE: o nome do cache carrega a versão. A cada release o 'activate' abaixo apaga
 * os caches de versões antigas -> força buscar o código novo (evita app rodando JS velho após update). */
var CACHE = 'orcapro-app-v1.1.119';

self.addEventListener('install', function (e) {
  self.skipWaiting();
  // Pré-cacheia o leitor de .xls (SheetJS): é lazy-load — não é baixado no boot normal do app,
  // então sem isto o import de .xls quebraria offline após instalar. Falha silenciosa (não trava o install).
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.add('./js/vendor/xlsx.full.min.js').catch(function () {}); }));
});
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
