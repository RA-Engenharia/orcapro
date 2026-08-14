/* Service Worker do OrçaPRO IA (app instalável). Network-first com cache de fallback:
 * - servidor local rodando -> sempre a versão mais nova (e cacheia tudo);
 * - servidor parado / offline -> abre do cache (dá pra usar sem rodar o Iniciar-OrcaPRO).
 * Só cacheia o MESMO domínio (IA, servidor de licença e fontes externas vão direto pra rede). */
/* IMPORTANTE: o nome do cache carrega a versão. A cada release o 'activate' abaixo apaga
 * os caches de versões antigas -> força buscar o código novo (evita app rodando JS velho após update). */
/* ⚠ ESTE NÚMERO TEM QUE SER O MESMO DE js/config.js.
 * Ele ficou parado na 1.1.146 enquanto o app ia para a 1.1.148 — duas releases
 * sem purgar o cache do PWA. Como o fetch é network-first, quem estava online
 * não viu problema; quem abriu offline seguiu com arquivo velho, sem erro em
 * lugar nenhum. Passo manual em release é passo que uma hora não acontece:
 * agora o packer REPROVA o pacote se os dois números divergirem
 * (tools/check-versao.js, chamado no empacotar-cliente.ps1). */
var CACHE = 'orcapro-app-v1.1.228';

self.addEventListener('install', function (e) {
  self.skipWaiting();
  // Pré-cacheia o leitor de .xls (SheetJS): é lazy-load — não é baixado no boot normal do app,
  // então sem isto o import de .xls quebraria offline após instalar. Falha silenciosa (não trava o install).
  // Idem para o leitor de PDF (pdf.js): nota fiscal em PDF e volumetria de planta
  // carregam o módulo sob demanda — sem pré-cache, a primeira tentativa offline falha.
  // E idem para o GERADOR de planilha (ExcelJS), vendorizado na v1.1.142: antes vinha
  // de CDN e nunca passava por aqui; agora é arquivo nosso, lazy como os outros dois —
  // sem esta linha, exportar Excel offline falharia justamente em quem instalou o app.
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all([
      c.add('./js/vendor/xlsx.full.min.js').catch(function () {}),
      c.add('./js/vendor/exceljs.min.js').catch(function () {}),
      c.add('./js/vendor/pdfjs/pdf.min.mjs').catch(function () {}),
      c.add('./js/vendor/pdfjs/pdf.worker.min.mjs').catch(function () {})
    ]);
  }));
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
  if (url.origin !== self.location.origin) return; // IA (:3041), licença (VPS), SDK do Firebase: rede direto
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
