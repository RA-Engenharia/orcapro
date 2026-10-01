/* =====================================================================
 * bimmesa.js — MODO MESA: as ferramentas principais numa barra ao lado do
 * modelo, e a TRAVA da câmera.
 *
 * O pedido (30/09/2026): «quando projetar o projeto na mesa, ter a opção de
 * aparecer as ferramentas principais do lado onde estaríamos vendo a
 * modelagem, uma barra lateral com as principais ferramentas que já temos;
 * e o botão de trava na mesa, para que na hora que estiver passando a mão
 * não dê zoom etc. — só se tiver destravado».
 *
 * A cena é um tablet deitado na mesa de reunião (ou uma tela de toque), com
 * várias pessoas apontando com a mão. Duas consequências:
 *   · as ferramentas têm de estar AO LADO, grandes, sem abrir a fita — quem
 *     aponta não é quem opera o sistema todo dia;
 *   · a câmera tem de ficar PARADA enquanto ninguém pedir: a mão que aponta
 *     encosta na tela e girava ou dava zoom no modelo.
 *
 * A barra NÃO duplica ferramenta nenhuma: cada botão aciona o botão que já
 * existe no viewer (`BIM.botao`), e o "ligado" é lido dele (`BIM.botaoAtivo`)
 * — um estado paralelo aqui divergiria do de lá na primeira vez que a
 * ferramenta fosse ligada pela fita.
 *
 * Padrão da casa: o MOTOR (lista, estado, persistência) é puro e testável
 * em Node (tools/test-bimmesa.js); a tela só orquestra.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* as ferramentas da barra, na ordem em que aparecem. `k` é a chave do botão
     do viewer (data-b). Só entra o que existir naquele viewer.
     `acao` = o que é DA MESA (não um botão do viewer): o corte vira o controle
     de dedo e o girar/virar roda a vista para quem está do outro lado; cada uma
     pede uma função do viewer (`requer`) e some sem ela. */
  var FERRAMENTAS = [
    { k: "medir", rot: "Trena", ico: "medir" },
    { k: "rabisco", rot: "Rabiscar", ico: "pincel", acao: "rabisco", requer: "desenharMarcasEm" },
    { k: "area", rot: "Área", ico: "area" },
    { k: "angulo", rot: "Ângulo", ico: "angulo" },
    { k: "corte", rot: "Corte", ico: "corte", acao: "corte", requer: "corteHorizontal" },
    { k: "planta", rot: "Planta", ico: "planta" },
    { k: "pav", rot: "Pavimentos", ico: "niveis" },
    { k: "vis", rot: "Visibilidade", ico: "olho" },
    { k: "sistema", rot: "Cores", ico: "paleta" },
    { k: "girar", rot: "Girar 90°", ico: "ciclo", acao: "girar", requer: "girarVista" },
    { k: "virar", rot: "Virar 180°", ico: "voltar", acao: "virar", requer: "girarVista" },
    { k: "fit", rot: "Enquadrar", ico: "expandir" },
    { k: "limpar-medidas", rot: "Limpar medidas", ico: "lixeira" }
  ];
  var CHAVE = "orcapro:bim:mesa";
  var PADRAO = { on: false, lado: "dir", trava: true };

  /* ---------------- MOTOR (puro) ---------------- */
  function disponiveis(temBotao, temFuncao) {
    var out = [];
    for (var i = 0; i < FERRAMENTAS.length; i++) {
      var f = FERRAMENTAS[i];
      if (f.requer) { if (temFuncao && temFuncao(f.requer)) out.push(f); }
      else if (temBotao(f.k)) out.push(f);
    }
    return out;
  }
  /* ▲/▼ pavimento: o próximo corte acima/abaixo do atual (lista ordenada por y) */
  function pavVizinho(lista, yAtual, dir) {
    var ord = (lista || []).slice().sort(function (a, b) { return a.y - b.y; }), i;
    if (dir > 0) { for (i = 0; i < ord.length; i++) if (ord[i].y > yAtual + 0.01) return ord[i]; }
    else { for (i = ord.length - 1; i >= 0; i--) if (ord[i].y < yAtual - 0.01) return ord[i]; }
    return null;
  }
  /* ⚠ o que se lê do armazenamento é validado campo a campo: um valor torto
     ali (outra versão, alguém mexendo) não pode deixar a barra num lado que
     não existe nem a trava num estado que não é booleano */
  function lerEstado(armazem) {
    var e = { on: PADRAO.on, lado: PADRAO.lado, trava: PADRAO.trava };
    try {
      var bruto = armazem && armazem.getItem(CHAVE);
      if (!bruto) return e;
      var o = JSON.parse(bruto);
      if (o && typeof o === "object") {
        if (typeof o.on === "boolean") e.on = o.on;
        if (o.lado === "esq" || o.lado === "dir") e.lado = o.lado;
        if (typeof o.trava === "boolean") e.trava = o.trava;
      }
    } catch (x) {}
    return e;
  }
  function gravarEstado(armazem, e) {
    try { if (armazem) armazem.setItem(CHAVE, JSON.stringify({ on: !!e.on, lado: e.lado === "esq" ? "esq" : "dir", trava: !!e.trava })); return true; } catch (x) { return false; }
  }
  function trocarLado(lado) { return lado === "esq" ? "dir" : "esq"; }

  /* ---------------- TELA (fiação fina) ---------------- */
  var st = { el: null, host: null, timer: 0, estado: null };
  function armazem() { try { return global.localStorage; } catch (x) { return null; } }
  function B() { return global.BIM; }
  function I(n, s) { return (global.Icones && global.Icones.get) ? global.Icones.get(n, s || 22) : ""; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function estilo() {
    if (global.document.getElementById("bim-mesa-css")) return;
    var s = global.document.createElement("style");
    s.id = "bim-mesa-css";
    /* ⚠ ONDE A BARRA MORA, medido numa captura de tablet (1024×768) em
       30/09/2026: centralizada na altura, ela passava por cima do "Sair do
       foco" e do cubo de vistas (em cima, à direita) e do contador de
       elementos (embaixo), e o "Sair da mesa" nem cabia na tela. Começa abaixo
       do cubo, termina acima do contador, e rola se a tela for baixa. */
    s.textContent =
      "#bim-mesa{position:absolute;top:124px;z-index:20;display:flex;flex-direction:column;gap:4px;padding:6px 5px;" +
      "max-height:calc(100% - 184px);overflow:hidden;background:rgba(11,26,43,.86);border:1px solid rgba(148,163,184,.25);border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.35);-webkit-user-select:none;user-select:none}" +
      "#bim-mesa[data-lado=dir]{right:10px}#bim-mesa[data-lado=esq]{left:10px}" +
      "#bim-mesa button{width:64px;min-height:46px;border:0;border-radius:10px;background:transparent;color:#dbe8f5;font:600 10px/1.15 Inter,system-ui,sans-serif;" +
      "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;cursor:pointer;padding:4px 2px;touch-action:manipulation;flex:none}" +
      /* ⚠ só a LISTA rola: a trava (em cima) e o rodapé com o "Sair" (embaixo)
         ficam sempre à vista — no tablet a lista inteira não cabia e o "Sair"
         sumia debaixo da dobra (captura de 30/09/2026) */
      "#bim-mesa .ferr{display:flex;flex-direction:column;gap:3px;overflow-y:auto;min-height:0;flex:1 1 auto}" +
      "#bim-mesa .rodape{display:flex;gap:4px;flex:none}#bim-mesa .rodape button{width:30px;min-height:34px}" +
      /* na mesa, a barrinha de ícones do 3D (a mesma coisa, em pequeno) e o
         aviso do canto saem: a barra da mesa já tem as ferramentas E a trava */
      "[data-mesa='1'] > [data-bim-barra],[data-mesa='1'] > [data-bim-barra-toggle],[data-mesa='1'] > [data-bim='trava']{display:none!important}" +
      "#bim-mesa button:hover{background:rgba(148,163,184,.14)}#bim-mesa button:focus-visible{outline:2px solid #38bdf8;outline-offset:1px}" +
      "#bim-mesa button.on{background:#2563eb;color:#fff}" +
      "#bim-mesa button[data-mesa=trava]{background:#15803d;color:#fff}#bim-mesa button[data-mesa=trava].livre{background:#b45309}" +
      "#bim-mesa hr{border:0;border-top:1px solid rgba(148,163,184,.25);margin:2px 4px;width:auto}" +
      "#bim-mesa svg{width:20px;height:20px}" +
      /* o painel do CORTE COM O DEDO mora ao lado da barra, do lado de dentro */
      "#bim-mesa-corte{position:absolute;top:124px;z-index:20;width:96px;display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px 6px;" +
      "background:rgba(11,26,43,.86);border:1px solid rgba(148,163,184,.25);border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.35);color:#dbe8f5;font:600 11px/1.2 Inter,system-ui,sans-serif;-webkit-user-select:none;user-select:none}" +
      "#bim-mesa-corte[data-lado=dir]{right:96px}#bim-mesa-corte[data-lado=esq]{left:96px}" +
      "#bim-mesa-corte b{font-size:15px;color:#fff}#bim-mesa-corte .pav{font-size:10px;color:#9fb2c8;text-align:center;min-height:12px}" +
      "#bim-mesa-corte button{width:84px;min-height:38px;border:0;border-radius:10px;background:rgba(148,163,184,.16);color:#dbe8f5;font:600 11px Inter,system-ui,sans-serif;cursor:pointer;touch-action:manipulation}" +
      "#bim-mesa-corte button:disabled{opacity:.35;cursor:default}" +
      "#bim-mesa-corte .trilho{position:relative;width:46px;height:220px;border-radius:23px;background:linear-gradient(#1e3a5f,#0f2238);touch-action:none;cursor:ns-resize}" +
      "#bim-mesa-corte .preenche{position:absolute;left:0;right:0;bottom:0;border-radius:0 0 23px 23px;background:rgba(37,99,235,.45)}" +
      "#bim-mesa-corte .polegar{position:absolute;left:3px;width:40px;height:40px;margin-top:-20px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4)}" +
      "[data-mesa='1'] > [data-bim='corteL']{display:none!important}" +
      /* RABISCO: a barra de cores/ações no alto, ao centro (o cubo fica à direita) */
      "#bim-mesa-rabisco-bar{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:21;display:flex;align-items:center;gap:6px;padding:6px 8px;" +
      "background:rgba(11,26,43,.9);border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.35);color:#dbe8f5;font:600 12px Inter,system-ui,sans-serif;-webkit-user-select:none;user-select:none}" +
      "#bim-mesa-rabisco-bar button{border:0;border-radius:10px;min-height:38px;padding:0 12px;background:rgba(148,163,184,.16);color:#dbe8f5;font:600 12px Inter,system-ui,sans-serif;cursor:pointer;touch-action:manipulation}" +
      "#bim-mesa-rabisco-bar button.cor{width:36px;padding:0;border:3px solid transparent}#bim-mesa-rabisco-bar button.cor.on{border-color:#fff}" +
      "#bim-mesa-rabisco-bar button.pri{background:#2563eb;color:#fff}#bim-mesa-rabisco-bar button:disabled{opacity:.4;cursor:default}" +
      "#bim-mesa-rabisco-bar .n{color:#9fb2c8;padding:0 4px;white-space:nowrap}";
    global.document.head.appendChild(s);
  }

  function desenhar() {
    var b = B(), el = st.el; if (!b || !el) return;
    var fs = disponiveis(function (k) { return b.temBotao ? b.temBotao(k) : false; }, function (fn) { return typeof b[fn] === "function"; });
    var trava = b.travado ? b.travado() : false;
    el.setAttribute("data-lado", st.estado.lado);
    el.innerHTML =
      '<button data-mesa="trava" class="' + (trava ? "" : "livre") + '" title="' + (trava ? "Câmera travada: encostar a mão não gira nem dá zoom. Toque para destravar." : "Câmera livre: toque para travar.") + '">' +
        I(trava ? "cadeado" : "destravado") + (trava ? "Travado" : "Livre") + "</button><hr>" +
      '<div class="ferr">' + fs.map(function (f) { return '<button data-mesa="' + (f.acao ? "acao" : "f") + '" data-k="' + esc(f.k) + '"' + (f.acao ? ' data-acao="' + f.acao + '"' : "") + ' title="' + esc(f.rot) + '">' + I(f.ico) + esc(f.rot) + "</button>"; }).join("") + "</div>" +
      '<hr><div class="rodape"><button data-mesa="lado" title="Passar a barra para o outro lado" aria-label="Trocar lado">' + I("avancar", 16) + "</button>" +
      '<button data-mesa="sair" title="Sair do modo mesa" aria-label="Sair da mesa">' + I("fechar", 16) + "</button></div>";
    pintarAtivos();
  }
  function pintarAtivos() {
    var b = B(), el = st.el; if (!b || !el) return;
    var bs = el.querySelectorAll('[data-mesa="f"]');
    for (var i = 0; i < bs.length; i++) {
      var on = b.botaoAtivo ? !!b.botaoAtivo(bs[i].getAttribute("data-k")) : false;
      if (bs[i].classList.contains("on") !== on) bs[i].classList.toggle("on", on);
    }
    var br = el.querySelector('[data-acao="rabisco"]');
    if (br && br.classList.contains("on") !== !!st.rab) br.classList.toggle("on", !!st.rab);
    var bc = el.querySelector('[data-acao="corte"]');
    if (bc) { var ce = b.corteEstado ? b.corteEstado() : null, onC = !!(ce && ce.on); if (bc.classList.contains("on") !== onC) bc.classList.toggle("on", onC); }
    if (st.corteEl) pintarCorte();
    var bt = el.querySelector('[data-mesa="trava"]'), trava = b.travado ? b.travado() : false;
    if (bt && bt.classList.contains("livre") === trava) desenhar();
  }

  /* ---------------- CORTE COM O DEDO ----------------
     Um trilho grande na vertical: em cima corta alto, embaixo corta baixo.
     O viewer recebe a altura em metros (BIM.corteHorizontal). Nada de painel
     de computador com deslizador fino: na mesa a mão é grande e a pessoa está
     falando enquanto mexe. */
  function fmtM(m) { return (Math.round(m * 100) / 100).toFixed(2).replace(".", ",") + " m"; }
  function pintarCorte() {
    var b = B(), el = st.corteEl; if (!b || !el) return;
    var ce = b.corteEstado ? b.corteEstado() : null;
    if (!ce || ce.yMax == null) return;
    var frac = ce.on ? ce.frac : 1, tr = el.querySelector(".trilho"), H = tr.clientHeight || 220;
    el.querySelector(".polegar").style.top = Math.round((1 - frac) * H) + "px";
    el.querySelector(".preenche").style.height = Math.round(frac * H) + "px";
    el.querySelector("b").textContent = ce.on ? fmtM(ce.y - ce.yMin) : "sem corte";
    var lista = b.pavimentosCorte ? b.pavimentosCorte() : [], y = ce.on ? ce.y : ce.yMax;
    var acima = pavVizinho(lista, y, 1), abaixo = pavVizinho(lista, ce.on ? y : ce.yMax + 1, -1);
    el.querySelector('[data-c="sobe"]').disabled = !acima;
    el.querySelector('[data-c="desce"]').disabled = !abaixo;
    var perto = null; lista.forEach(function (pv) { if (ce.on && Math.abs(pv.y - ce.y) < 0.05) perto = pv; });
    el.querySelector(".pav").textContent = perto ? perto.nome : "";
  }
  function corteNaFracao(frac) {
    var b = B(), ce = b && b.corteEstado ? b.corteEstado() : null; if (!ce || ce.yMax == null) return;
    frac = Math.max(0, Math.min(1, frac));
    b.corteHorizontal(ce.yMin + (ce.yMax - ce.yMin) * frac);
    pintarCorte();
  }
  function abrirCorte() {
    var b = B(); if (!st.host || !b || !b.corteHorizontal) return;
    fecharCorte();
    var el = global.document.createElement("div");
    el.id = "bim-mesa-corte"; el.setAttribute("data-lado", st.estado.lado);
    el.innerHTML = "<span>Corte</span><b>sem corte</b><div class=\"pav\"></div>" +
      '<button data-c="sobe">▲ pavimento</button>' +
      '<div class="trilho" role="slider" aria-label="Altura do corte"><div class="preenche"></div><div class="polegar"></div></div>' +
      '<button data-c="desce">▼ pavimento</button><button data-c="sem">Sem corte</button>';
    ["pointerdown", "pointermove", "wheel", "touchstart"].forEach(function (ev) { el.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: true }); });
    var tr = el.querySelector(".trilho"), arrastando = false;
    function daAltura(e) { var r = tr.getBoundingClientRect(); corteNaFracao(1 - (e.clientY - r.top) / r.height); }
    tr.addEventListener("pointerdown", function (e) { arrastando = true; try { tr.setPointerCapture(e.pointerId); } catch (x) {} daAltura(e); });
    tr.addEventListener("pointermove", function (e) { if (arrastando) daAltura(e); });
    tr.addEventListener("pointerup", function (e) { arrastando = false; try { tr.releasePointerCapture(e.pointerId); } catch (x) {} });
    tr.addEventListener("pointercancel", function () { arrastando = false; });
    el.addEventListener("click", function (e) {
      var bt = e.target.closest ? e.target.closest("[data-c]") : null; if (!bt) return;
      var bb = B(), ce = bb.corteEstado(), lista = bb.pavimentosCorte ? bb.pavimentosCorte() : [], k = bt.getAttribute("data-c");
      if (k === "sem") { bb.corteHorizontal(null); fecharCorte(); pintarAtivos(); return; }
      var alvo = k === "sobe" ? pavVizinho(lista, ce.on ? ce.y : ce.yMax, 1) : pavVizinho(lista, ce.on ? ce.y : ce.yMax + 1, -1);
      if (alvo) { bb.corteHorizontal(alvo.y); pintarCorte(); }
    });
    st.host.appendChild(el); st.corteEl = el;
    /* abre já cortando no primeiro pavimento (a planta do térreo), ou no meio */
    var ce0 = b.corteEstado();
    if (ce0 && !ce0.on) { var l0 = b.pavimentosCorte ? b.pavimentosCorte() : []; if (l0.length) b.corteHorizontal(pavVizinho(l0, -Infinity, 1).y); else corteNaFracao(0.5); }
    pintarCorte();
  }
  function fecharCorte() { if (st.corteEl && st.corteEl.parentNode) st.corteEl.parentNode.removeChild(st.corteEl); st.corteEl = null; }

  /* ---------------- RABISCAR COM O DEDO ----------------
     ⚠ O traço é 2D e vale para ESTA câmera — por isso a câmera fica travada
     enquanto se desenha, e o rabisco vira PONTO DE VISTA (câmera + cena +
     traços): reabrir a vista traz o mesmo enquadramento e o desenho junto.
     O formato é o das marcações da vista (`livre`, 0..1 da tela), e quem
     desenha na tela é o próprio viewer (`BIM.desenharMarcasEm`) — o que se
     vê aqui é exatamente o que a vista vai mostrar depois. */
  var CORES_RABISCO = ["#e11d48", "#facc15", "#2563eb"];
  function abrirRabisco() {
    var b = B(); if (!st.host || !b || !b.canvasRect || !b.desenharMarcasEm) return;
    fecharCorte(); fecharRabisco();
    if (b.travar && !(b.travado && b.travado())) b.travar(true);
    var rc = b.canvasRect(), hr = st.host.getBoundingClientRect();
    var cap = global.document.createElement("div");
    cap.id = "bim-mesa-rabisco";
    cap.style.cssText = "position:absolute;left:" + (rc.left - hr.left) + "px;top:" + (rc.top - hr.top) + "px;width:" + rc.width + "px;height:" + rc.height + "px;z-index:19;touch-action:none;cursor:crosshair";
    var svg = global.document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none";
    cap.appendChild(svg);
    var bar = global.document.createElement("div");
    bar.id = "bim-mesa-rabisco-bar"; bar.setAttribute("role", "toolbar"); bar.setAttribute("aria-label", "Rabisco");
    ["pointerdown", "pointermove", "wheel", "touchstart"].forEach(function (ev) { bar.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: true }); });
    st.host.appendChild(cap); st.host.appendChild(bar);
    st.rab = { cap: cap, svg: svg, bar: bar, tracos: [], cor: CORES_RABISCO[0], atual: null, w: rc.width, h: rc.height };
    function pt(e) { var r = cap.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; }
    cap.addEventListener("pointerdown", function (e) {
      e.stopPropagation(); if (!st.rab) return;
      try { cap.setPointerCapture(e.pointerId); } catch (x) {}
      st.rab.atual = { tipo: "livre", cor: st.rab.cor, pts: [pt(e)] }; st.rab.tracos.push(st.rab.atual); redesenharRabisco();
    });
    cap.addEventListener("pointermove", function (e) {
      if (!st.rab || !st.rab.atual) return;
      var q = pt(e), u = st.rab.atual.pts[st.rab.atual.pts.length - 1];
      if (Math.abs(q[0] - u[0]) * st.rab.w + Math.abs(q[1] - u[1]) * st.rab.h < 2) return;   /* 2 px: o traço não vira mil pontos parados */
      st.rab.atual.pts.push(q); redesenharRabisco();
    });
    function terminar() { if (!st.rab || !st.rab.atual) return; if (st.rab.atual.pts.length < 2) st.rab.tracos.pop(); st.rab.atual = null; redesenharRabisco(); }
    cap.addEventListener("pointerup", terminar); cap.addEventListener("pointercancel", terminar);
    bar.addEventListener("click", function (e) {
      var bt = e.target.closest ? e.target.closest("[data-r]") : null; if (!bt || !st.rab) return;
      var k = bt.getAttribute("data-r");
      if (k === "cor") { st.rab.cor = bt.getAttribute("data-cor"); pintarBarraRabisco(); return; }
      if (k === "desfazer") { st.rab.tracos.pop(); redesenharRabisco(); return; }
      if (k === "limpar") { st.rab.tracos = []; redesenharRabisco(); return; }
      if (k === "cancelar") { fecharRabisco(); pintarAtivos(); return; }
      if (k === "salvar") {
        if (!st.rab.tracos.length) return;
        if (typeof BimMesa.aoSalvarRabisco !== "function") return;
        var tracos = st.rab.tracos.map(function (x) { return { tipo: "livre", cor: x.cor, pts: x.pts.slice() }; });
        var r = BimMesa.aoSalvarRabisco(tracos);
        if (r && r.ok) {
          fecharRabisco(); pintarAtivos();
          var bb = B(); if (bb && bb.marcacoesMostrar) bb.marcacoesMostrar(tracos, bb.cameraAtual ? bb.cameraAtual() : null);
        }
      }
    });
    redesenharRabisco();
  }
  function redesenharRabisco() { var b = B(); if (!st.rab || !b) return; b.desenharMarcasEm(st.rab.svg, st.rab.tracos, st.rab.w, st.rab.h); pintarBarraRabisco(); }
  function pintarBarraRabisco() {
    if (!st.rab) return;
    var n = st.rab.tracos.length, podeSalvar = n > 0 && typeof BimMesa.aoSalvarRabisco === "function";
    st.rab.bar.innerHTML = CORES_RABISCO.map(function (c) { return '<button class="cor' + (st.rab.cor === c ? " on" : "") + '" data-r="cor" data-cor="' + c + '" style="background:' + c + '" aria-label="Cor"></button>'; }).join("") +
      '<span class="n">' + n + (n === 1 ? " traço" : " traços") + "</span>" +
      '<button data-r="desfazer"' + (n ? "" : " disabled") + ">↶ Desfazer</button>" +
      '<button data-r="limpar"' + (n ? "" : " disabled") + ">Limpar</button>" +
      '<button class="pri" data-r="salvar"' + (podeSalvar ? "" : " disabled") + ' title="' + (typeof BimMesa.aoSalvarRabisco === "function" ? "Grava a câmera, a cena e o rabisco como ponto de vista da obra" : "Salvar o rabisco precisa de uma obra aberta no OrçaPRO") + '">Salvar como ponto de vista</button>' +
      '<button data-r="cancelar">Cancelar</button>';
  }
  function fecharRabisco() {
    if (!st.rab) return;
    [st.rab.cap, st.rab.bar].forEach(function (e) { if (e && e.parentNode) e.parentNode.removeChild(e); });
    st.rab = null;
  }

  function aoClicar(e) {
    var t = e.target.closest ? e.target.closest("[data-mesa]") : null; if (!t) return;
    var b = B(), a = t.getAttribute("data-mesa");
    /* acende JÁ (o botão do viewer muda na hora); o repasse de 60 ms pega
       quem muda de estado no quadro seguinte. Só o atrasado, num tablet
       ocupado, deixava o botão apagado mais de 300 ms depois do toque */
    if (a === "f") { if (b && b.botao) b.botao(t.getAttribute("data-k")); pintarAtivos(); setTimeout(pintarAtivos, 60); return; }
    if (a === "acao") {
      var ac = t.getAttribute("data-acao");
      if (ac === "girar" && b.girarVista) b.girarVista(90);
      else if (ac === "virar" && b.girarVista) b.girarVista(180);
      else if (ac === "corte") { if (st.corteEl) fecharCorte(); else abrirCorte(); }
      else if (ac === "rabisco") { if (st.rab) fecharRabisco(); else abrirRabisco(); }
      pintarAtivos(); setTimeout(pintarAtivos, 60); return;   /* idem: acende já */
    }
    if (a === "trava") { var nv = !(b && b.travado && b.travado()); if (b && b.travar) b.travar(nv); st.estado.trava = nv; gravarEstado(armazem(), st.estado); desenhar(); return; }
    if (a === "lado") { st.estado.lado = trocarLado(st.estado.lado); gravarEstado(armazem(), st.estado); desenhar(); if (st.corteEl) st.corteEl.setAttribute("data-lado", st.estado.lado); return; }
    if (a === "sair") { ligar(false); }
  }

  /* monta a barra no palco do viewer (o mesmo host do canvas) */
  function montar(host) {
    desmontar();
    if (!host) return false;
    estilo();
    var el = global.document.createElement("div");
    el.id = "bim-mesa"; el.setAttribute("role", "toolbar"); el.setAttribute("aria-label", "Ferramentas do modo mesa");
    el.addEventListener("click", aoClicar);
    /* ⚠ toque na barra não pode virar gesto no 3D embaixo dela */
    ["pointerdown", "pointermove", "wheel", "touchstart"].forEach(function (ev) { el.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: true }); });
    host.appendChild(el); host.setAttribute("data-mesa", "1");
    st.el = el; st.host = host;
    desenhar();
    /* o "ligado" das ferramentas muda também pela fita e pelo teclado: lê do
       viewer a cada 400 ms (dez consultas de classe; nada pesado) */
    st.timer = global.setInterval(function () {
      if (!st.el || !st.el.isConnected) { desmontar(); return; }
      pintarAtivos();
    }, 400);
    return true;
  }
  function desmontar() {
    fecharCorte(); fecharRabisco();
    if (st.timer) { global.clearInterval(st.timer); st.timer = 0; }
    if (st.el && st.el.parentNode) st.el.parentNode.removeChild(st.el);
    if (st.host) st.host.removeAttribute("data-mesa");
    st.el = null; st.host = null;
  }

  /* liga/desliga o modo mesa: a barra e a trava andam juntas — entrar na mesa
     trava a câmera (o pedido é "só se tiver destravado") */
  function ligar(on) {
    st.estado = st.estado || lerEstado(armazem());
    var b = B();
    st.estado.on = !!on;
    if (on) {
      var host = b && b.host ? b.host() : null;
      if (!host) return false;
      montar(host);
      if (b && b.travar) b.travar(st.estado.trava);
      desenhar();
    } else {
      desmontar();
      if (b && b.travar) b.travar(false);
    }
    gravarEstado(armazem(), st.estado);
    /* quem mostra a tela (foco, fita acesa) fica sabendo por aqui — inclusive
       quando a saída é o "Sair da mesa" desta barra */
    if (typeof BimMesa.aoMudar === "function") { try { BimMesa.aoMudar(!!on); } catch (x) {} }
    return true;
  }
  function ligado() { return !!(st.estado && st.estado.on && st.el); }
  /* o viewer chama ao (re)montar: quem saiu da tela com a mesa ligada volta com ela */
  function aoMontar() {
    st.estado = lerEstado(armazem());
    var b = B();
    if (!st.estado.on || (b && b.ehVisitante && b.ehVisitante())) return;
    ligar(true);
  }

  var BimMesa = {
    FERRAMENTAS: FERRAMENTAS, CHAVE: CHAVE,
    disponiveis: disponiveis, lerEstado: lerEstado, gravarEstado: gravarEstado, trocarLado: trocarLado, pavVizinho: pavVizinho,
    ligar: ligar, ligado: ligado, aoMontar: aoMontar, alternar: function () { return ligar(!ligado()); },
    _estado: function () { return st; }
  };
  global.BimMesa = BimMesa;
  if (typeof module !== "undefined" && module.exports) module.exports = BimMesa;
})(typeof window !== "undefined" ? window : this);
