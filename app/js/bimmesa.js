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
     do viewer (data-b). Só entra o que existir naquele viewer. */
  var FERRAMENTAS = [
    { k: "medir", rot: "Trena", ico: "medir" },
    { k: "area", rot: "Área", ico: "area" },
    { k: "angulo", rot: "Ângulo", ico: "angulo" },
    { k: "corte", rot: "Corte", ico: "corte" },
    { k: "planta", rot: "Planta", ico: "planta" },
    { k: "pav", rot: "Pavimentos", ico: "niveis" },
    { k: "vis", rot: "Visibilidade", ico: "olho" },
    { k: "sistema", rot: "Cores", ico: "paleta" },
    { k: "fit", rot: "Enquadrar", ico: "expandir" },
    { k: "limpar-medidas", rot: "Limpar medidas", ico: "lixeira" }
  ];
  var CHAVE = "orcapro:bim:mesa";
  var PADRAO = { on: false, lado: "dir", trava: true };

  /* ---------------- MOTOR (puro) ---------------- */
  function disponiveis(temBotao) {
    var out = [];
    for (var i = 0; i < FERRAMENTAS.length; i++) if (temBotao(FERRAMENTAS[i].k)) out.push(FERRAMENTAS[i]);
    return out;
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
      "#bim-mesa svg{width:20px;height:20px}";
    global.document.head.appendChild(s);
  }

  function desenhar() {
    var b = B(), el = st.el; if (!b || !el) return;
    var fs = disponiveis(function (k) { return b.temBotao ? b.temBotao(k) : false; });
    var trava = b.travado ? b.travado() : false;
    el.setAttribute("data-lado", st.estado.lado);
    el.innerHTML =
      '<button data-mesa="trava" class="' + (trava ? "" : "livre") + '" title="' + (trava ? "Câmera travada: encostar a mão não gira nem dá zoom. Toque para destravar." : "Câmera livre: toque para travar.") + '">' +
        I(trava ? "cadeado" : "destravado") + (trava ? "Travado" : "Livre") + "</button><hr>" +
      '<div class="ferr">' + fs.map(function (f) { return '<button data-mesa="f" data-k="' + esc(f.k) + '" title="' + esc(f.rot) + '">' + I(f.ico) + esc(f.rot) + "</button>"; }).join("") + "</div>" +
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
    var bt = el.querySelector('[data-mesa="trava"]'), trava = b.travado ? b.travado() : false;
    if (bt && bt.classList.contains("livre") === trava) desenhar();
  }

  function aoClicar(e) {
    var t = e.target.closest ? e.target.closest("[data-mesa]") : null; if (!t) return;
    var b = B(), a = t.getAttribute("data-mesa");
    if (a === "f") { if (b && b.botao) b.botao(t.getAttribute("data-k")); setTimeout(pintarAtivos, 60); return; }
    if (a === "trava") { var nv = !(b && b.travado && b.travado()); if (b && b.travar) b.travar(nv); st.estado.trava = nv; gravarEstado(armazem(), st.estado); desenhar(); return; }
    if (a === "lado") { st.estado.lado = trocarLado(st.estado.lado); gravarEstado(armazem(), st.estado); desenhar(); return; }
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
    disponiveis: disponiveis, lerEstado: lerEstado, gravarEstado: gravarEstado, trocarLado: trocarLado,
    ligar: ligar, ligado: ligado, aoMontar: aoMontar, alternar: function () { return ligar(!ligado()); },
    _estado: function () { return st; }
  };
  global.BimMesa = BimMesa;
  if (typeof module !== "undefined" && module.exports) module.exports = BimMesa;
})(typeof window !== "undefined" ? window : this);
