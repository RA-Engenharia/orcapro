/* =====================================================================
 * tour.js — Tour guiado de primeira entrada ("produtivo nos primeiros
 * 60 segundos"). Overlay com spotlight (furo recortando o elemento real
 * da tela via box-shadow gigante) + card com título/texto e navegação
 * Anterior/Próximo/Pular. Roda UMA vez na primeira entrada (flag
 * localStorage "orcapro:tour:v1") e pode ser reaberto com Tour.iniciar(true).
 *
 * ZERO dependências de outros módulos do app: só DOM + localStorage
 * (ambos guardados — em Node os métodos retornam false sem quebrar).
 * Visual 100% em tokens do design system (var(--surface)/--texto/...),
 * então funciona no claro e nos 5 temas escuros sem hardcode.
 *
 * API: Tour.PASSOS · Tour.iniciar(forcar) · Tour.proximo() ·
 *      Tour.anterior() · Tour.fechar() · Tour._proximoVisivel(idx, dir, existeFn)
 * Node-testável: node tools/test-tour.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var FLAG = "orcapro:tour:v1";

  // Passos na ordem da jornada. posicao "baixo" força o card abaixo do alvo
  // (bom p/ itens da topbar); sem posicao, tenta à direita e cai p/ baixo.
  var PASSOS = [
    { seletor: ".sidebar",
      titulo: "Jornada da obra",
      texto: "O menu segue a ordem real de uma obra: orçar, fechar o contrato, tocar o canteiro e acompanhar o dinheiro. De cima para baixo, do estudo à entrega." },
    { seletor: '[data-acao="novo-orcamento"], [data-view="orcamentos"]',
      titulo: "Comece pelo orçamento",
      texto: "Tudo nasce aqui: monte o orçamento com as bases de preços oficiais, aplique o BDI e gere a proposta comercial em minutos." },
    { seletor: ".topbar [data-busca-abrir]", posicao: "baixo",
      titulo: "Busca universal",
      texto: "Aperte Ctrl+K em qualquer tela e pule direto para qualquer obra, orçamento ou ação do sistema." },
    { seletor: ".topbar [data-avisos-abrir]", posicao: "baixo",
      titulo: "Central de avisos",
      texto: "Medições a aprovar, tarefas atrasadas e restrições da semana — tudo num sino só, para nada passar despercebido." },
    { seletor: '[data-view="bim"]',
      titulo: "BIM 3D ao 7D",
      texto: "Arraste seus arquivos IFC e coordene a obra em 3D: cronograma 4D, custo 5D, ciclo de vida 6D/7D, trena, planta baixa, corte livre e vista de corte técnica — tudo ligado ao orçamento." },
    { seletor: '[data-view="ajuda"]',
      titulo: "Ajuda sempre à mão",
      texto: "FAQ com as dúvidas mais comuns — e é por aqui que você revê este tour quando quiser." }
  ];

  var estado = {
    aberto: false, idx: -1,
    overlay: null, furo: null, card: null,
    contador: null, titulo: null, texto: null, btnAnt: null, btnProx: null
  };

  // objetos de options reutilizados: add/remove precisam receber O MESMO capture
  var OPT_PASSIVO = { passive: true };
  var OPT_PASSIVO_CAPTURA = { passive: true, capture: true }; // scroll de containers internos também reposiciona

  function temDom() { return typeof document !== "undefined" && !!document.body; }

  function existeNoDom(seletor) {
    if (typeof document === "undefined") return false;
    try { return !!document.querySelector(seletor); } catch (e) { return false; }
  }

  function flagGravada() {
    try { return typeof localStorage !== "undefined" && !!localStorage.getItem(FLAG); } catch (e) { return false; }
  }
  function gravarFlag() {
    try { if (typeof localStorage !== "undefined") localStorage.setItem(FLAG, String(new Date().getTime())); } catch (e) {}
  }

  function clamp(v, lo, hi) { if (hi < lo) hi = lo; return v < lo ? lo : (v > hi ? hi : v); }

  /* ---------- CSS (injetado uma vez; só tokens do design system) ---------- */
  function injetarCss() {
    if (document.getElementById("tour-css")) return;
    var css = [
      "#tour-overlay{position:fixed;left:0;top:0;right:0;bottom:0;z-index:99990;overflow:hidden;font-family:var(--fonte);}",
      /* o escurecimento vem da sombra gigante do furo — o alvo fica \"aceso\" */
      ".tour-furo{position:absolute;border-radius:10px;box-shadow:0 0 0 9999px rgba(8,18,30,.62);pointer-events:none;transition:left .18s ease,top .18s ease,width .18s ease,height .18s ease;}",
      ".tour-card{position:absolute;width:320px;max-width:calc(100vw - 24px);background:var(--surface);color:var(--texto);border:1px solid var(--linha);border-radius:var(--raio,13px);box-shadow:var(--sombra-lg);padding:16px 18px 14px;transition:left .18s ease,top .18s ease;}",
      ".tour-contador{font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--aco-claro);margin:0 0 6px;}",
      ".tour-titulo{margin:0 0 6px;font-size:15.5px;font-weight:700;color:var(--texto);}",
      ".tour-texto{margin:0 0 14px;font-size:13px;line-height:1.55;color:var(--texto-fraco);}",
      ".tour-acoes{display:flex;align-items:center;gap:8px;}",
      ".tour-vao{flex:1;}",
      ".tour-btn{display:inline-block;border:1px solid var(--linha-forte);background:var(--surface-2);color:var(--texto);border-radius:var(--raio-sm,9px);padding:7px 13px;font:inherit;font-size:13px;font-weight:600;line-height:1.2;cursor:pointer;}",
      ".tour-btn:hover{background:var(--surface-3);}",
      ".tour-btn:focus-visible{outline:2px solid var(--aco-claro);outline-offset:2px;}",
      ".tour-btn[disabled]{opacity:.45;cursor:default;}",
      /* --aco é constante em todos os temas (aço #2e6f9e) → rótulo claro fixo é seguro */
      ".tour-btn--primario{background:var(--aco);border-color:var(--aco);color:#fff;}",
      ".tour-btn--primario:hover{background:var(--aco-claro);border-color:var(--aco-claro);}",
      ".tour-btn--link{background:transparent;border-color:transparent;color:var(--texto-fraco);font-weight:500;padding:7px 4px;}",
      ".tour-btn--link:hover{background:transparent;color:var(--texto);text-decoration:underline;}",
      "@media (prefers-reduced-motion: reduce){.tour-furo,.tour-card{transition:none;}}"
    ].join("\n");
    var st = document.createElement("style");
    st.id = "tour-css";
    st.type = "text/css";
    if (st.styleSheet) st.styleSheet.cssText = css; else st.appendChild(document.createTextNode(css));
    (document.head || document.getElementsByTagName("head")[0] || document.body).appendChild(st);
  }

  /* ---------- montagem / eventos ---------- */
  function aoTecla(ev) {
    var k = ev.key || ev.keyCode;
    if (k === "Escape" || k === "Esc" || k === 27) fecharTour();
  }
  function aoReposicionar() { reposicionar(); }

  function montarOverlay() {
    var ov = document.createElement("div");
    ov.id = "tour-overlay";

    var furo = document.createElement("div");
    furo.className = "tour-furo";

    var card = document.createElement("div");
    card.className = "tour-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-label", "Tour guiado do OrçaPRO");

    var contador = document.createElement("div"); contador.className = "tour-contador";
    var titulo = document.createElement("h3"); titulo.className = "tour-titulo";
    var texto = document.createElement("p"); texto.className = "tour-texto";

    var acoes = document.createElement("div"); acoes.className = "tour-acoes";
    var btnPular = document.createElement("button");
    btnPular.type = "button"; btnPular.className = "tour-btn tour-btn--link";
    btnPular.appendChild(document.createTextNode("Pular tour"));
    var vao = document.createElement("span"); vao.className = "tour-vao";
    var btnAnt = document.createElement("button");
    btnAnt.type = "button"; btnAnt.className = "tour-btn";
    btnAnt.appendChild(document.createTextNode("Anterior"));
    var btnProx = document.createElement("button");
    btnProx.type = "button"; btnProx.className = "tour-btn tour-btn--primario";

    btnPular.onclick = function () { fecharTour(); };
    btnAnt.onclick = function () { anteriorTour(); };
    btnProx.onclick = function () { proximoTour(); };

    acoes.appendChild(btnPular); acoes.appendChild(vao);
    acoes.appendChild(btnAnt); acoes.appendChild(btnProx);
    card.appendChild(contador); card.appendChild(titulo);
    card.appendChild(texto); card.appendChild(acoes);
    ov.appendChild(furo); ov.appendChild(card);
    document.body.appendChild(ov);

    estado.overlay = ov; estado.furo = furo; estado.card = card;
    estado.contador = contador; estado.titulo = titulo; estado.texto = texto;
    estado.btnAnt = btnAnt; estado.btnProx = btnProx;

    global.addEventListener("resize", aoReposicionar, OPT_PASSIVO);
    global.addEventListener("scroll", aoReposicionar, OPT_PASSIVO_CAPTURA);
    document.addEventListener("keydown", aoTecla, true);
  }

  /* ---------- navegação ---------- */
  function irPara(i) {
    estado.idx = i;
    var passo = PASSOS[i];
    estado.contador.textContent = (i + 1) + " de " + PASSOS.length;
    estado.titulo.textContent = passo.titulo;
    estado.texto.textContent = passo.texto;
    var temAnt = Tour._proximoVisivel(i, -1, existeNoDom) >= 0;
    var temProx = Tour._proximoVisivel(i, 1, existeNoDom) >= 0;
    estado.btnAnt.disabled = !temAnt;
    estado.btnProx.textContent = temProx ? "Próximo" : "Concluir";
    try {
      var alvo = document.querySelector(passo.seletor);
      if (alvo && alvo.scrollIntoView) alvo.scrollIntoView({ block: "nearest", inline: "nearest" });
    } catch (e) {}
    reposicionar();
    try { estado.btnProx.focus(); } catch (e2) {}
  }

  function reposicionar() {
    if (!estado.aberto || !estado.overlay) return;
    var passo = PASSOS[estado.idx];
    var alvo = null;
    try { alvo = document.querySelector(passo.seletor); } catch (e) {}
    if (!alvo) { // alvo sumiu do DOM no meio do tour → pula p/ vizinho visível
      var i = Tour._proximoVisivel(estado.idx, 1, existeNoDom);
      if (i < 0) i = Tour._proximoVisivel(estado.idx, -1, existeNoDom);
      if (i < 0) { fecharTour(); return; }
      irPara(i); return;
    }
    var r = alvo.getBoundingClientRect();
    var pad = 6, margem = 14, borda = 12;
    estado.furo.style.left = (r.left - pad) + "px";
    estado.furo.style.top = (r.top - pad) + "px";
    estado.furo.style.width = (r.width + pad * 2) + "px";
    estado.furo.style.height = (r.height + pad * 2) + "px";

    var vw = global.innerWidth || document.documentElement.clientWidth || 0;
    var vh = global.innerHeight || document.documentElement.clientHeight || 0;
    var cw = estado.card.offsetWidth || 320;
    var ch = estado.card.offsetHeight || 180;
    var x, y;
    var cabeDireita = passo.posicao !== "baixo" && (r.right + margem + cw <= vw - borda);
    if (cabeDireita) { // à direita do alvo, alinhado ao topo dele (clamp na viewport)
      x = r.right + margem;
      y = clamp(r.top, borda, vh - ch - borda);
    } else {           // abaixo do alvo (clamp na viewport)
      x = clamp(r.left, borda, vw - cw - borda);
      y = r.bottom + margem;
      if (y + ch > vh - borda) y = Math.max(borda, vh - ch - borda);
    }
    estado.card.style.left = x + "px";
    estado.card.style.top = y + "px";
  }

  function iniciarTour(forcar) {
    if (!temDom()) return false;                      // Node / DOM ainda não pronto
    if (!forcar && flagGravada()) return false;       // já viu o tour
    if (estado.aberto) fecharTour();                  // reabrir limpo
    var primeiro = Tour._proximoVisivel(-1, 1, existeNoDom);
    if (primeiro < 0) return false;                   // nenhum alvo na tela
    gravarFlag();                                     // grava AO ABRIR: não repete nem se fechar no meio
    injetarCss();
    montarOverlay();
    estado.aberto = true;
    irPara(primeiro);
    return true;
  }

  function proximoTour() {
    if (!estado.aberto) return false;
    var i = Tour._proximoVisivel(estado.idx, 1, existeNoDom);
    if (i < 0) { fecharTour(); return true; }         // "Concluir" no último passo
    irPara(i);
    return true;
  }

  function anteriorTour() {
    if (!estado.aberto) return false;
    var i = Tour._proximoVisivel(estado.idx, -1, existeNoDom);
    if (i < 0) return false;
    irPara(i);
    return true;
  }

  function fecharTour() {
    if (!estado.aberto && !estado.overlay) return false;
    estado.aberto = false;
    try {
      global.removeEventListener("resize", aoReposicionar, OPT_PASSIVO);
      global.removeEventListener("scroll", aoReposicionar, OPT_PASSIVO_CAPTURA);
      document.removeEventListener("keydown", aoTecla, true);
    } catch (e) {}
    if (estado.overlay && estado.overlay.parentNode) estado.overlay.parentNode.removeChild(estado.overlay);
    estado.overlay = estado.furo = estado.card = null;
    estado.contador = estado.titulo = estado.texto = estado.btnAnt = estado.btnProx = null;
    estado.idx = -1;
    return true;
  }

  /* ---------- API pública ---------- */
  var Tour = {
    PASSOS: PASSOS,
    _flagKey: FLAG,

    // PURO (testável): próximo índice visível a partir de idx, andando dir
    // (+1 frente / -1 trás), segundo existeFn(seletor)->bool. -1 se não há.
    _proximoVisivel: function (idx, dir, existeFn) {
      var passo = dir < 0 ? -1 : 1;
      if (typeof existeFn !== "function") existeFn = existeNoDom;
      for (var i = idx + passo; i >= 0 && i < PASSOS.length; i += passo) {
        if (existeFn(PASSOS[i].seletor)) return i;
      }
      return -1;
    },

    iniciar: iniciarTour,
    proximo: proximoTour,
    anterior: anteriorTour,
    fechar: fecharTour
  };

  global.Tour = Tour;
  if (typeof module !== "undefined" && module.exports) module.exports = Tour;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
