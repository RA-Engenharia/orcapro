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
var CACHE = 'orcapro-app-v1.2.165';

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
    /* v1.1.234 — O SHELL TAMBÉM SE PRÉ-CACHEIA. Só os vendors entravam no
       install; index/css/js só caíam no cache quando uma página CONTROLADA os
       buscava. Depois de cada atualização (que apaga os caches e desregistra
       o SW), a primeira visita carrega SEM controlador — nada era cacheado e
       o PWA não abria offline até a SEGUNDA visita online. No canteiro sem
       sinal, isso é o app não abrir no dia seguinte ao update.
       A lista vem do próprio index.html em runtime (fetch + regex nos <script>
       e <link>): lista à mão aqui dessincronizaria na primeira release. */
    var fixos = ['./', './index.html', './manifest.webmanifest',
      /* pedido pelo index.html só depois do load, por script: a varredura
         abaixo (src="/href=") não o vê */
      './css/fontes-proposta.css',
      /* ⚠ OS import DO VISUALIZADOR (js/bim.js). Até 10/10/2026 eles vinham
         em toda abertura (o módulo estava no index.html) e o fetch abaixo os
         guardava; com o BIM sob demanda (js/carregar.js), quem nunca abriu o
         BIM com sinal não os teria no canteiro sem internet. */
      './bim/vendor/three.module.js', './bim/vendor/web-ifc-api.js', './bim/vendor/OrbitControls.js',
      './bim/vendor/Sky.js', './bim/cristal.js', './bim/vendor/RoomEnvironment.js', './bim/vendor/RoundedBoxGeometry.js',
      './js/vendor/xlsx.full.min.js', './js/vendor/exceljs.min.js',
      './js/vendor/pdfjs/pdf.min.mjs', './js/vendor/pdfjs/pdf.worker.min.mjs'];
    /* ⚠ NA PUBLICAÇÃO OS SCRIPTS SÃO PACOTES (tools/construir-pacotes-js.js,
       10/10/2026). O index.html é o mesmo do desenvolvimento e continua citando
       os ~300 arquivos (dentro de <template>); guardar todos eles aqui faria o
       celular baixar de novo, em segundo plano, tudo que os pacotes acabaram de
       evitar. A lista do que guardar vem então do js/pacotes/lista.json, que só
       existe na publicação; sem ele (desenvolvimento), vale a varredura do
       index.html de antes. O CSS sai do index.html nos dois casos. */
    var lista = fetch('./js/pacotes/lista.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    var indice = fetch('./index.html').then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; });
    return Promise.all([lista, indice])
      .then(function (rs) {
        var pac = rs[0] && rs[0].precache && rs[0].precache.length ? rs[0].precache : null, html = rs[1], extras = [];
        var re = /(?:src|href)="((?:js|css)\/[^"]+)"/g, m;
        while ((m = re.exec(html))) { if (!pac || m[1].indexOf('css/') === 0) extras.push('./' + m[1]); }
        if (pac) pac.forEach(function (u) { extras.push('./' + u); });
        return Promise.all(fixos.concat(extras).map(function (u) { return c.add(u).catch(function () {}); }));
      });
  }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(
    /* ⚠ o cache do LINK da RA/RV (orcapro-rv-*, js/rvvisor.js) não é da
       versão do app: guarda os modelos para abrir sem internet até o link
       vencer. Apagado aqui, toda atualização zerava o uso sem internet de
       quem já tinha aberto o link — e ninguém avisaria. */
    caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return (k === CACHE || k.indexOf('orcapro-rv-') === 0) ? null : caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
  );
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return; // IA (:3041), licença (VPS), SDK do Firebase: rede direto
  /* as rotas do link (/rv/t, /rv/f, /rv/notas…) são do js/rvvisor.js, que
     guarda o que precisa com validade própria; aqui o .ifc (até 80 MB) ficaria
     guardado DUAS vezes no celular */
  if (url.pathname.indexOf('/rv/') === 0) return;
  /* PACOTE COM CARIMBO DE CONTEÚDO (js/pacotes/bim.js?v=<hash>, gerado na
     publicação): o endereço muda quando o conteúdo muda, então o que está
     guardado nunca fica velho — sai do cache sem ir à rede. É o que deixa a
     segunda entrada no BIM instantânea no celular, com ou sem sinal. */
  if (/\.js$/.test(url.pathname) && /^\?v=[0-9a-f]{8,}$/.test(url.search)) {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (m) {
        return m || fetch(req).then(function (r) { if (r && r.ok) c.put(req, r.clone()); return r; });
      });
    }));
    return;
  }
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
