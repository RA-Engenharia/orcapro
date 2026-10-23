/* =====================================================================
 * bimapresentacaoui.js — a TELA do ANTES / DEPOIS e da APRESENTAÇÃO DA REFORMA.
 *
 * O que decide é o motor puro js/bimapresentacao.js; as fases e o filtro de fase são os do
 * js/bimfases.js + js/bimp10ui.js (BimP10UI.definirModo/definirVista) — aqui não há um segundo jeito de
 * filtrar. Este arquivo só faz a fiação e a cena:
 *
 *  1. CONTROLE ANTES · OBRA · DEPOIS · COMPARAR na barra da vista (a mesma barra da {3D} e das plantas 2D),
 *     com atalho Alt+1…4. Só aparece quando o modelo tem fases. COMPARAR = a RÉGUA antes × depois da apresentação (item 2,
 *     o "comparar livre"): a apresentação abre direto no fim, parada; arrasta-se a alça ⇔ e gira-se a vista. É um componente
 *     só (21/10/2026) — a cortina antiga, em tela, com desenho duplo, saiu.
 *  2. APRESENTAÇÃO DA REFORMA — DENTRO DA VISTA 3D (20/10/2026: "não precisa abrir uma nova tela"): a interface recolhe
 *     (Recolher), a câmera faz um percurso suave com enquadramento por capítulo, legendas no terço inferior e contadores;
 *     a planta no chão, as paredes que sobem, a demolição, a construção, os acabamentos e o FECHO: a casa pronta em órbita,
 *     o DISSOLVE para o antes, a CORTINA 3D (plano de recorte que atravessa o modelo com uma linha luminosa) e o COMPARAR,
 *     em que o usuário arrasta a linha e gira a vista.
 *     Tudo é função do tempo t (arrastar a barra de tempo funciona em qualquer ponto). Sai restaurando a
 *     cena EXATAMENTE como estava (visibilidade, matrizes, materiais, câmera, estilo, vista de fase).
 *  3. EXPORTAR VÍDEO: 1920×1080, WebM (ou MP4 se o navegador gravar), quadro a quadro com tempo fixo.
 *
 * ⚠ AS PEÇAS DO EDITOR SÓ APARECEM NA TELA PELA MALHA MESCLADA (js/bimagreg.js, vértices com a matriz assada):
 *   mexer na matriz ou na visibilidade da peça não muda nada ali. Quem anima (a apresentação) marca a
 *   peça com userData._solta — o mesmo marcador da folha de porta aberta —, e ela passa a ser desenhada POR SI,
 *   fora do mesclado. Ao sair, o marcador sai e o mesclado volta sozinho.
 * ===================================================================== */
(function (global) {
  "use strict";
  var AP = function () { return global.BimApresentacao || null; };
  var P10 = function () { return global.BimP10UI || null; };
  function arr(v) { return Array.isArray(v) ? v : []; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function toast(t, k) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info", 7000); } catch (e) {} }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function suave(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
  function saidaCubica(x) { x = clamp(x, 0, 1); var u = 1 - x; return 1 - u * u * u; }
  function entradaCubica(x) { x = clamp(x, 0, 1); return x * x * x; }
  function saidaElastica(x) { x = clamp(x, 0, 1); var c1 = 1.70158, c3 = c1 + 1, u = x - 1; return 1 + c3 * u * u * u + c1 * u * u; }   /* easeOutBack: passa um pouco e volta */
  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function num1(v) { var n = Number(v); return isFinite(n) ? n.toFixed(1).replace(".", ",") : "—"; }
  function inteiro(v) { return String(Math.round(Number(v) || 0)); }

  /* o que o BIM entrega da cena (js/bim.js › cenaApresentacao) — inclusive o THREE (o BIM é módulo: o THREE não é global) */
  function cena() { try { return global.BIM && global.BIM.cenaApresentacao ? global.BIM.cenaApresentacao() : null; } catch (e) { return null; } }
  function THR() { var c = cena(); return c ? c.THREE : null; }
  function modeloEditor(c) { if (!c) return null; for (var i = 0; i < c.modelos.length; i++) if (c.modelos[i].editor) return c.modelos[i]; return null; }

  /* ================================================================== A CENA: peças desenhadas por si */
  var Assumir = {
    /* marca as malhas do modelo do editor como "soltas" (fora do mesclado) — idempotente; devolve a lista */
    _mo: null, _n: 0, _lista: [],
    pegar: function (mo) {
      var l = [];
      if (!mo || !mo.grupo) return l;
      mo.grupo.children.forEach(function (m) {
        if (!m.isMesh || m.userData.expressID == null) return;
        if (!m.userData._apSolta) { m.userData._apSolta = m.userData._solta ? 2 : 1; m.userData._solta = true; }
        m.layers.enable(0);
        l.push(m);
      });
      this._lista = l;
      return l;
    },
    soltar: function (mo) {
      if (!mo || !mo.grupo) return;
      mo.grupo.children.forEach(function (m) {
        if (!m.isMesh || !m.userData._apSolta) return;
        if (m.userData._apSolta === 1) delete m.userData._solta;
        delete m.userData._apSolta;
      });
      this._lista = [];
    }
  };

  /* ================================================================== O CONTROLE NA BARRA DA VISTA */
  var CSS_CTL =
    ".rv-ad{display:inline-flex;align-items:center;gap:2px;margin-left:10px;padding:0 4px 0 8px;border-left:1px solid rgba(127,127,127,.35)}" +
    ".rv-ad[hidden]{display:none!important}" +
    ".rv-ad .rv-ad-rot{font-size:11px;opacity:.7;margin-right:4px;white-space:nowrap}" +
    ".rv-ad button{border:1px solid transparent;background:transparent;color:inherit;font:inherit;font-size:12px;padding:1px 8px;border-radius:11px;cursor:pointer;white-space:nowrap}" +
    ".rv-ad button:hover{background:rgba(127,127,127,.18)}" +
    ".rv-ad button[aria-pressed=true]{background:#1a6cb5;color:#fff;border-color:#1a6cb5}" +
    ".rv-ad button[data-ad=obra][aria-pressed=true]{background:#d4342a;border-color:#d4342a}" +
    ".rv-ad button[data-ad=depois][aria-pressed=true]{background:#2e9e5b;border-color:#2e9e5b}" +
    ".rv-ad button[data-ad=apresentar]{font-weight:600}";
  function injetarCss() {
    if (document.getElementById("bim-ad-estilo")) return;
    var st = document.createElement("style"); st.id = "bim-ad-estilo"; st.textContent = CSS_CTL; document.head.appendChild(st);
  }

  var Ui = {
    _ctl: null, _G: null,
    Assumir: Assumir,
    ativo: previa,
    estado: function () { var p = P10(); return p ? p.estado() : null; },
    temFases: function () { var a = AP(), st = this.estado(); return !!(a && st && a.temFases(st)); },
    modo: function () { var p = P10(); return p ? p.modo() : null; },

    /* o botão da barra da vista (js/bimshell.js › _vistabar chama isto, como faz com as Cores) */
    botaoBarra: function (el, ico) {
      var self = this, a = AP(); if (!a) return null;
      injetarCss();
      var box = el("span", "rv-ad"); box.setAttribute("data-rv-ad", "1"); box.hidden = true;
      var rot = el("span", "rv-ad-rot", "Reforma"); box.appendChild(rot);
      a.MODOS.forEach(function (m) {
        var b = el("button", null, m.id === "comparar" ? "⇔ " + m.rotulo : m.rotulo);
        b.type = "button"; b.setAttribute("data-ad", m.id); b.title = m.dica; b.setAttribute("aria-label", m.rotulo + " — " + m.dica); b.setAttribute("aria-pressed", "false");
        b.onclick = function () { self.definirModo(m.id); };
        box.appendChild(b);
      });
      var ap = el("button", null, "▶ Apresentar");
      ap.type = "button"; ap.setAttribute("data-ad", "apresentar"); ap.title = "Apresentação da reforma: a planta, a demolição e a construção em animação, para o cliente, dentro da própria vista (exporta vídeo)";
      ap.onclick = function () { self.iniciar(); };
      box.appendChild(ap);
      this._ctl = box;
      this.atualizar();
      return box;
    },
    /* mostra o controle quando o modelo tem fases; marca o modo da vista */
    atualizar: function () {
      var box = this._ctl; if (!box) return;
      var tem = false; try { tem = this.temFases(); } catch (e) {}
      box.hidden = !tem;
      var m = tem ? this.modo() : null, a = AP(), st = this.estado(), rs = null;
      Array.prototype.forEach.call(box.querySelectorAll("[data-ad]"), function (b) { var k = b.getAttribute("data-ad"); if (k !== "apresentar") b.setAttribute("aria-pressed", k === m ? "true" : "false"); });
      if (tem && a) {
        try { var escR = null; try { escR = P10().vista().escolha || null; } catch (eV) {} rs = a.resumo(st, P10().deps(), escR); } catch (e2) { rs = null; }
        var bo = box.querySelector('[data-ad="obra"]');
        if (bo && rs) bo.title = "Obra: " + rs.demolir.n + " peça(s) a demolir (" + num1(rs.demolir.area) + " m²) em vermelho · " + rs.novas.n + " nova(s) (" + num1(rs.novas.area) + " m²) destacadas · " + rs.existentes.n + " que ficam em meio-tom. (Alt+2)";
      }
    },
    /* chamado pelo BimP10UI depois de cada reconstrução do modelo do editor */
    aoRebuild: function () {
      this.atualizar();
      this._sincronizarComparar();
    },
    /* a vista de fase mudou (qualquer caminho): repinta o controle */
    aoVista: function () {
      this.atualizar();
      this._sincronizarComparar();
    },
    /* COMPARAR é UM componente só (21/10/2026): a régua antes × depois da apresentação (plano de recorte no mundo, moldura,
       alça ⇔ com ANTES/DEPOIS, vista que gira). A cortina antiga (desenho duplo em tela) saiu. Uma vista de fase gravada no
       modo antigo "comparar" volta ao Depois e abre a régua nova. */
    _sincronizarComparar: function () {
      if (Apres.ativa || this.modo() !== "comparar" || !this.temFases()) return;
      var p = P10(); if (!p) return;
      p.definirModo("depois");
      this.comparar();
    },
    /* a régua antes × depois: a apresentação aberta direto no fim, parada (✕ Sair ou Esc devolvem a vista como estava) */
    comparar: function () {
      if (Apres.ativa) return null;
      if (!this.temFases()) { toast(AP() ? AP().MENSAGEM_SEM_FASES : "Sem fases.", "aviso"); return null; }
      /* a régua é do 3D: com uma planta na frente, leva à {3D} primeiro */
      try { var G = this._G || global.Gestao, at = G && G._bimVxEst ? G._bimVxEst().ativa : "3d"; if (at && at !== "3d" && G._bimVxAtivar) G._bimVxAtivar("3d"); } catch (eV) {}
      var r = Apres.iniciar({ comparar: true });
      if (r && r.ok) status("Antes × Depois: arraste a alça ⇔ para comparar (à esquerda o ANTES, à direita o DEPOIS) e gire a vista com o mouse. Esc sai.");
      return r;
    },
    definirModo: function (modo) {
      var p = P10();
      if (!p) return null;
      if (Apres.ativa) return null;
      if (!this.temFases()) { toast(AP() ? AP().MENSAGEM_SEM_FASES : "Sem fases.", "aviso"); return null; }
      if (modo === "comparar") return this.comparar();
      var r = p.definirModo(modo);
      this.aoVista();
      return r;
    },

    /* ----------------------------------------------------------- atalhos Alt+1..4 */
    instalar: function () {
      if (this._tecla) return;
      var self = this, MAP = { "1": "antes", "2": "obra", "3": "depois", "4": "comparar" };
      this._tecla = function (ev) {
        if (!ev.altKey || ev.ctrlKey || ev.metaKey) return;
        var k = ev.key, m = MAP[k];
        if (!m) return;
        var t = ev.target, tag = t && t.tagName ? String(t.tagName).toLowerCase() : "";
        if (tag === "input" || tag === "textarea" || tag === "select" || (t && t.isContentEditable)) return;
        if (!self.temFases() || !document.querySelector(".bim-revit")) return;
        ev.preventDefault();
        self.definirModo(m);
      };
      global.addEventListener("keydown", this._tecla, true);
    },

    /* ----------------------------------------------------------- a fita (Vista › Apresentação) */
    registrar: function (reg, G) {
      this._G = G || this._G;
      var R = global.BimRibbon, self = this;
      if (!R || !reg || !previa() || !AP()) return false;
      R.acrescentar("vista", "Vista", "Apresentação", [
        { id: "apresentar-reforma", rotulo: "Apresentação\nda reforma", icone: "apresentar", grande: true, dica: "Apresentação da reforma para o cliente: a planta baixa do existente no chão, as paredes subindo, o que sai (demolição) e o que entra (construção) em animação, os acabamentos, a cortina antes × depois e o comparar arrastando a linha — dentro da própria vista, com legendas e contadores de m². Exporta vídeo 1920×1080. Precisa de um modelo com fases (Existente / Construção nova)." }
      ]);
      reg["apresentar-reforma"] = function () { self.iniciar(); return true; };
      this.instalar();
      return true;
    },
    /* o clique direito na {3D} do Navegador de projeto: os modos e a apresentação (o menu é de quem tem o modelador ligado) */
    menuNo: function () {
      var self = this;
      if (!previa() || !AP()) return undefined;
      return [
        { id: "ap-iniciar", rotulo: "Apresentação da reforma…", fn: function () { self.iniciar(); } },
        { id: "ap-antes", rotulo: "Ver o Antes (Alt+1)", fn: function () { self.definirModo("antes"); } },
        { id: "ap-obra", rotulo: "Ver a Obra: o que sai e o que entra (Alt+2)", fn: function () { self.definirModo("obra"); } },
        { id: "ap-depois", rotulo: "Ver o Depois (Alt+3)", fn: function () { self.definirModo("depois"); } },
        { id: "ap-comparar", rotulo: "Comparar antes × depois (Alt+4)", fn: function () { self.definirModo("comparar"); } }
      ];
    },
    /* abre pelo menu de contexto / por código */
    iniciar: function (opts) { return Apres.iniciar(opts); },
    parar: function () { return Apres.parar(); },
    apresentacao: function () { return Apres; }
  };

  /* ================================================================== A APRESENTAÇÃO */
  var COR = { planta: "#2d7ff9", existente: "#8aa0b8", demolicao: "#ff3b30", construcao: "#2fbf71", acabamentos: "#ffb020", final: "#ffffff", transicao: "#8fd3ff", comparar: "#8fd3ff" };
  var MARCA = "RA · OrçaPRO";

  /* ------------------------------------------------------------------ a interface RECOLHE (a apresentação roda DENTRO da vista 3D)
   * Pedido do engenheiro (20/10/2026): "não precisa abrir uma nova tela: aqui dentro mesmo da área de trabalho".
   * A fita, as abas, a lateral, a barra da vista e o status somem com transição (opacidade) e depois saem do layout (a vista
   * cresce); os painéis do próprio 3D (barra, cubo, dicas) ficam transparentes. No fim tudo volta NA MESMA TAREFA do parar()
   * (o layout primeiro, a animação de volta depois) — assim o renderer volta ao tamanho exato que tinha. */
  var CSS_AP =
    /* tudo o que não é o palco da vista: o que vem antes do corpo (título, abas, fita, barras de contexto), as colunas ao lado e as barras debaixo da vista */
    ".bim-revit[data-ap-ui]>:not(.rv-corpo),.bim-revit[data-ap-ui] .rv-corpo>:not(.rv-area),.bim-revit[data-ap-ui] .rv-area>:not(.rv-palco),.bim-revit[data-ap-ui] .rv-disc-selo{transition:opacity .35s ease}" +
    ".bim-revit[data-ap-ui=saindo]>:not(.rv-corpo),.bim-revit[data-ap-ui=saindo] .rv-corpo>:not(.rv-area),.bim-revit[data-ap-ui=saindo] .rv-area>:not(.rv-palco),.bim-revit[data-ap-ui=saindo] .rv-disc-selo{opacity:0}" +
    ".bim-revit[data-ap-ui='1']>:not(.rv-corpo),.bim-revit[data-ap-ui='1'] .rv-corpo>:not(.rv-area),.bim-revit[data-ap-ui='1'] .rv-area>:not(.rv-palco),.bim-revit[data-ap-ui='1'] .rv-disc-selo{display:none!important}" +
    ".bim-revit[data-ap-ui='1'] .rv-corpo{padding:0}" +
    ".bim-revit[data-ap-ui=voltando]>:not(.rv-corpo),.bim-revit[data-ap-ui=voltando] .rv-corpo>:not(.rv-area),.bim-revit[data-ap-ui=voltando] .rv-area>:not(.rv-palco),.bim-revit[data-ap-ui=voltando] .rv-disc-selo{animation:apVolta .45s ease both}" +
    "@keyframes apVolta{from{opacity:0}to{opacity:1}}" +
    "[data-ap-oculto]{opacity:0!important;pointer-events:none!important;transition:opacity .3s ease}" +
    /* a camada da apresentação na vista */
    ".ap-vista{position:absolute;left:0;top:0;right:0;bottom:0;z-index:40;overflow:hidden;color:#fff;font-family:inherit;user-select:none;pointer-events:none;--ap-cor:#8fd3ff}" +
    ".ap-vista>*{transition:opacity .6s ease,transform .6s ease}" +
    ".ap-vista[data-entrando='1']>*:not(.ap-capa){opacity:0}" +
    ".ap-capa{position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:auto;cursor:default;touch-action:none}" +
    ".ap-vista[data-livre='1'] .ap-capa{cursor:grab}.ap-vista[data-livre='1'] .ap-capa:active{cursor:grabbing}" +
    ".ap-vinheta{position:absolute;left:0;top:0;right:0;bottom:0;background:radial-gradient(ellipse at 50% 46%,rgba(0,0,0,0) 58%,rgba(6,12,24,.30) 100%)}" +
    ".ap-sombra{position:absolute;left:0;right:0;bottom:0;height:190px;background:linear-gradient(0deg,rgba(6,12,24,.42),rgba(6,12,24,0))}" +
    ".ap-obra{position:absolute;left:26px;top:18px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;opacity:.88;text-shadow:0 1px 4px rgba(0,0,0,.55);max-width:60%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".ap-marca{position:absolute;right:22px;top:18px;font-size:11px;font-weight:600;letter-spacing:.14em;opacity:.72;text-shadow:0 1px 4px rgba(0,0,0,.55)}" +
    ".ap-terco{position:absolute;left:26px;bottom:78px;max-width:min(520px,58%);padding:12px 18px 13px 18px;background:rgba(12,20,34,.7);border-radius:10px;border-left:3px solid var(--ap-cor);box-shadow:0 6px 24px rgba(0,0,0,.18)}" +
    ".ap-terco.ap-troca{opacity:0;transform:translateY(10px)}" +
    ".ap-terco .ap-cap{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;opacity:.7}" +
    ".ap-terco .ap-tit{font-size:21px;font-weight:600;line-height:1.2;margin-top:3px}" +
    ".ap-terco .ap-leg{font-size:13px;line-height:1.45;opacity:.86;margin-top:4px}" +
    ".ap-cont{position:absolute;right:24px;bottom:78px;display:flex;gap:8px;align-items:flex-end}" +
    ".ap-pill{background:rgba(12,20,34,.7);border-radius:10px;padding:8px 13px 9px;text-align:right;min-width:104px;border-top:2px solid var(--ap-pc,#fff)}" +
    ".ap-pill[hidden]{display:none}" +
    ".ap-pill b{display:block;font-size:19px;font-weight:600;font-variant-numeric:tabular-nums;line-height:1.15}" +
    ".ap-pill span{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;opacity:.74;margin-top:2px;white-space:nowrap}" +
    ".ap-barra{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);display:flex;align-items:center;gap:4px;padding:5px 8px;background:rgba(12,20,34,.78);border-radius:999px;pointer-events:auto;font-size:12.5px;box-shadow:0 6px 22px rgba(0,0,0,.22);max-width:calc(100% - 32px)}" +
    ".ap-vista[data-oculta-barra='1'] .ap-barra{opacity:0;transform:translate(-50%,10px)}" +
    ".ap-barra button{min-width:32px;height:32px;border-radius:16px;border:0;background:transparent;color:#fff;cursor:pointer;font:inherit;font-size:14px;padding:0 8px;white-space:nowrap}" +
    ".ap-barra button:hover{background:rgba(255,255,255,.14)}.ap-barra button:focus-visible{outline:2px solid #8fd3ff;outline-offset:1px}" +
    ".ap-barra button[data-ap=play]{background:rgba(255,255,255,.16)}" +
    ".ap-barra .ap-capnome{min-width:170px;padding:0 8px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".ap-barra input[type=range]{width:160px;accent-color:#8fd3ff;cursor:pointer;margin:0 4px}" +
    ".ap-barra .ap-tempo{min-width:78px;text-align:center;opacity:.8;font-variant-numeric:tabular-nums}" +
    ".ap-barra .ap-sep{width:1px;height:18px;background:rgba(255,255,255,.22);margin:0 4px}" +
    ".ap-alca{position:absolute;left:0;top:0;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;background:#fff;color:#1d2b44;box-shadow:0 2px 14px rgba(0,0,0,.35),0 0 0 5px rgba(143,211,255,.38);pointer-events:auto;cursor:ew-resize;font-weight:700;font-size:15px;line-height:40px;text-align:center;touch-action:none;display:none}" +
    ".ap-alca .ap-rot{position:absolute;top:50%;margin-top:-11px;height:22px;line-height:22px;font-size:10.5px;letter-spacing:.16em;padding:0 9px;border-radius:5px;background:rgba(12,20,34,.72);color:#fff;font-weight:600;white-space:nowrap}" +
    ".ap-alca .ap-rot-a{right:52px}.ap-alca .ap-rot-d{left:52px;background:rgba(36,128,78,.86)}" +
    ".ap-aviso{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);padding:12px 20px;background:rgba(12,20,34,.72);border-radius:10px;font-size:15px;display:none}" +
    ".ap-grav{position:absolute;left:0;top:0;right:0;bottom:0;background:#0b1220;pointer-events:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px}" +
    ".ap-grav canvas{max-width:86%;max-height:72%;border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,.4)}" +
    ".ap-grav .ap-grav-txt{font-size:13px;opacity:.9}.ap-grav .ap-grav-trilho{width:min(520px,80%);height:4px;border-radius:2px;background:rgba(255,255,255,.18);overflow:hidden}.ap-grav .ap-grav-trilho i{display:block;height:100%;width:0;background:#8fd3ff}" +
    "@media (max-width:760px){.ap-cont{display:none}.ap-terco{left:12px;right:12px;max-width:none;bottom:70px}.ap-barra input[type=range]{width:90px}.ap-barra .ap-capnome{min-width:0;max-width:110px}.ap-obra{left:12px}.ap-marca{right:12px}}";
  function injetarCssAp() {
    if (document.getElementById("bim-ap-vista-estilo")) return;
    var st = document.createElement("style"); st.id = "bim-ap-vista-estilo"; st.textContent = CSS_AP; document.head.appendChild(st);
  }
  var Recolher = {
    raiz: null, ocultos: [], _t: null,
    ligar: function (c) {
      var sh = global.BimShell, self = this, raiz = (sh && sh._raiz && sh._raiz.isConnected) ? sh._raiz : (c.host && c.host.closest ? c.host.closest(".bim-revit") : null);
      var host = c.host, cv = c.renderer.domElement;
      this.ocultos = [];
      if (host) Array.prototype.forEach.call(host.children, function (el) {
        if (el === cv || el.hasAttribute("data-ap-vista") || el.hasAttribute("data-ap-oculto")) return;
        el.setAttribute("data-ap-oculto", "1"); self.ocultos.push(el);
      });
      this.raiz = raiz;
      if (!raiz) return;
      global.clearTimeout(this._t);
      raiz.setAttribute("data-ap-ui", "saindo");
      this._t = global.setTimeout(function () { if (self.raiz === raiz && raiz.getAttribute("data-ap-ui") === "saindo") { raiz.setAttribute("data-ap-ui", "1"); self._layout(c); } }, 380);
    },
    desligar: function (c) {
      global.clearTimeout(this._t);
      this.ocultos.forEach(function (el) { el.removeAttribute("data-ap-oculto"); });
      this.ocultos = [];
      var raiz = this.raiz; this.raiz = null;
      if (!raiz) return;
      raiz.setAttribute("data-ap-ui", "voltando");
      this._layout(c);
      this._t = global.setTimeout(function () { if (raiz.getAttribute("data-ap-ui") === "voltando") raiz.removeAttribute("data-ap-ui"); }, 520);
    },
    _layout: function (c) {
      try { var sh = global.BimShell; if (sh && sh._opts && typeof sh._opts.onLayout === "function") sh._opts.onLayout(); } catch (e) {}
      try { if (c && c.redimensionar) c.redimensionar(); } catch (e2) {}
    }
  };

  /* o estado de uma apresentação (nada fica pendurado fora daqui; parar() devolve tudo) */
  var Apres = {
    ativa: false, c: null, S: null,
    linha: null, t: 0, tocando: false, vel: 1, ctx: null, ui: null, gravando: false,

    /* ------------------------------------------------------------- começar */
    iniciar: function (opts) {
      opts = opts || {};
      var a = AP(), p = P10(), THREE = THR();
      if (this.ativa) return { ok: false, motivo: "A apresentação já está aberta." };
      if (!a || !p || !THREE) { toast("A apresentação da reforma precisa do modelador carregado.", "aviso"); return { ok: false, motivo: "módulos não carregados" }; }
      var c = cena(), mo = modeloEditor(c), st = p.estado();
      if (!c || !mo || !st) { toast("Abra a obra no BIM (com o modelo) para apresentar.", "aviso"); return { ok: false, motivo: "sem modelo" }; }
      var tit = opts.titulo || this._tituloObra();
      /* geometria das peças: caixa de cada uma (para a varredura, a câmera e as animações) */
      var info = this._medirPecas(c, mo);
      var pos = {}; Object.keys(info.porId).forEach(function (id) { var b = info.porId[id].box; pos[id] = [(b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2]; });
      /* opções de projeto: só a escolhida na vista entra (a não escolhida segue oculta e fora dos contadores) */
      var esc = null; try { esc = (p.vista && p.vista().escolha) || null; } catch (eE) {}
      var linha = a.linhaDoTempo(st, { deps: p.deps(), titulo: tit, posicoes: pos, duracao: opts.duracao, escolha: esc, extras: this._extras(info, st, p, esc) });
      if (!linha.ok) { toast(linha.motivo, "aviso"); status(linha.motivo); return { ok: false, motivo: linha.motivo }; }
      this.ativa = true; this.c = c; this.mo = mo; this.linha = linha; this.t = 0; this.tocando = false; this.vel = 1; this.info = info; this.opcoes = opts;
      this.escolha = esc; this.livre = null; this._posUsuario = null; this._blend = null;
      this._salvar(c, mo);
      this._preparar(c, mo, info, linha);
      this._quadros = this._medirQuadros(info, linha);
      this._montarUi();
      Recolher.ligar(c);
      /* a ENTRADA: a câmera sai de onde o usuário estava e voa para o começo do percurso (sem corte) */
      this._iniciarBlend(2.2);
      var self = this;
      this._pronto = false;
      /* o estilo Realista (a casa pronta com material de verdade): carrega as texturas antes de começar */
      var pEst = null;
      try { if (opts.estilo !== false && global.BIM && global.BIM.estiloVisual) pEst = global.BIM.estiloVisual("realista", { naoGravar: true }); } catch (eE) { pEst = null; }
      this._mostrarAviso("Preparando a apresentação…");
      var comecar = function () {
        if (!self.ativa) return;
        self._pronto = true; self._mostrarAviso(null);
        self._iniciarBlend(2.2);   /* a entrada começa quando o primeiro quadro sai (as texturas do Realista já carregaram) */
        self._registrarTick();
        var pi = self._pontoInicial(opts, linha);
        self.t = pi.t; self.tocando = pi.tocando;
        self._ultimo = 0;
        self._pintarUi();
      };
      if (pEst && pEst.then) pEst.then(function () { global.setTimeout(comecar, 200); }, function () { comecar(); }); else comecar();
      return { ok: true, linha: linha };
    },
    /* onde a apresentação começa: no 0 tocando (padrão); `inicio`/`tocar` informados; `comparar` = no FIM, parada — é onde a régua
       antes × depois (o comparar livre) mora */
    _pontoInicial: function (opts, linha) {
      opts = opts || {};
      if (opts.comparar) return { t: linha.total, tocando: false };
      return { t: opts.inicio != null ? clamp(+opts.inicio, 0, linha.total) : 0, tocando: opts.tocar !== false };
    },
    _tituloObra: function () {
      var G = global.Gestao, nome = "";
      try { var id = G && G._bimSel; var o = id && global.Store && global.Auth ? global.Store.obter(global.Auth.empresaId(), "obras", id) : null; nome = o && o.nome ? o.nome : ""; } catch (e) {}
      return nome || "Reforma";
    },

    /* peças do modelo que o BimFases não lista (calha e condutor da cobertura, carro…): a linha as põe pela família IFC — sem isso ficariam no ar desde o começo.
       A divisa do lote fica sempre (é o terreno). */
    _extras: function (info, st, p, esc) {
      var BF = global.BimFases, BO = global.BimOpcoes, conhecidos = {}, out = [];
      try { BF.pecas(st, p.deps()).forEach(function (q) { conhecidos[q.id] = 1; }); } catch (e) {}
      /* ⚠ peça de opção NÃO escolhida não vira "extra" (senão surgia na animação como peça nova) */
      try {
        if (BO && st && st.opcoes) ["caixas", "coberturas", "familias", "volumes", "forros"].forEach(function (k) {
          arr(st[k]).forEach(function (x) { if (x && x.id != null && !BO.visivel(x, st, esc || null)) conhecidos[String(x.id)] = 1; });
        });
      } catch (eO) {}
      Object.keys(info.porId).forEach(function (id) {
        if (conhecidos[id] || /divisa/i.test(id)) return;
        var ifc = String(info.porId[id].meshes[0].userData.tipo || ""), g = "movel";
        if (/^IFCPIPE|^IFCDUCT|^IFCFLOW/.test(ifc)) g = "cobertura";
        else if (/^IFCWALL|^IFCCOLUMN/.test(ifc)) g = "vertical";
        else if (/^IFCSLAB|^IFCBEAM|^IFCMEMBER/.test(ifc)) g = "horizontal";
        else if (/^IFCROOF/.test(ifc)) g = "cobertura";
        out.push({ id: id, grupo: g });   /* a mãe (telhado, calha) vem do estado: o motor sabe */
      });
      return out;
    },

    /* ------------------------------------------------------------- medir as peças */
    _medirPecas: function (c, mo) {
      var THREE = THR(), porId = {}, tudo = new THREE.Box3();
      c.modelRoot.updateMatrixWorld(true);
      mo.grupo.children.forEach(function (m) {
        if (!m.isMesh || m.userData.expressID == null) return;
        var id = String(m.userData.expressID), b = new THREE.Box3().setFromObject(m);
        if (b.isEmpty()) return;
        var o = porId[id] || (porId[id] = { box: new THREE.Box3(), meshes: [] });
        o.box.union(b); o.meshes.push(m);
      });
      Object.keys(porId).forEach(function (id) { tudo.union(porId[id].box); });
      return { porId: porId, tudo: tudo };
    },

    /* ------------------------------------------------------------- guardar o que há de restaurar */
    _salvar: function (c, mo) {
      var THREE = THR(), p = P10(), sv = { meshes: [], films: [], escondidos: [], cam: null, vista: null, estilo: null, orbit: null, renderer: null, principal: null };
      /* a vista de fase como está; depois, NEUTRA ("livre"): nenhuma peça some pelo filtro — quem manda é a linha do tempo.
         As peças são guardadas já neutras: o BimP10UI.definirVista do fim refaz o modo de antes (tinta, tracejado) do zero. */
      var vv = p.vista(); sv.vista = { fase: vv.fase, filtro: vv.filtro, modo: vv.modo, realce: vv.realce };
      p.definirVista({ modo: "livre", fase: vv.fase, filtro: vv.filtro, realce: false });
      mo.grupo.children.forEach(function (m) {
        if (!m.isMesh) return;
        sv.meshes.push({ m: m, visible: m.visible, matrix: m.matrix.clone(), auto: m.matrixAutoUpdate, material: m.material, layers: m.layers.mask, solta: m.userData._solta, apSolta: m.userData._apSolta, oculta: m.userData._p10oculta });
      });
      ["p4-pinturas", "acab-pisos"].forEach(function (nome) {
        var g = c.scene.getObjectByName(nome); if (!g) return;
        g.children.forEach(function (f) { if (f.isMesh) sv.films.push({ m: f, visible: f.visible, matrix: f.matrix.clone(), auto: f.matrixAutoUpdate, material: f.material }); });
      });
      /* a interface do 3D que não entra no filme (cotas, eixos, pré-visualizações, rótulos, marcadores) */
      c.scene.children.forEach(function (o) {
        if (o.isSprite || /^(precisao|cotas3d|p2d|p11|p3|metal|pag-|graute|marcador|agente|pinos|icamento)/.test(o.name || "") || (o.type === "Group" && !o.name && o.userData && o.userData.marcador)) sv.escondidos.push({ o: o, visible: o.visible });
      });
      c.scene.traverse(function (o) { if (o.isSprite && o.visible && !sv.escondidos.some(function (e) { return e.o === o; })) sv.escondidos.push({ o: o, visible: o.visible }); });
      sv.cam = { pos: c.camera.position.clone(), up: c.camera.up.clone(), quat: c.camera.quaternion.clone(), fov: c.camera.fov, near: c.camera.near, far: c.camera.far, aspect: c.camera.aspect, alvo: c.orbit ? c.orbit.target.clone() : null };
      sv.orbit = c.orbit ? { enabled: c.orbit.enabled } : null;
      try { var es = global.BimEstilo && global.BimEstilo.estado ? global.BimEstilo.estado() : null; sv.estilo = es ? es.modo : null; } catch (e) { sv.estilo = null; }
      sv.principal = c.principalOculta();
      sv.tam = { w: c.renderer.domElement.width, h: c.renderer.domElement.height, pr: c.renderer.getPixelRatio() };
      sv.clearColor = c.renderer.getClearColor(new THREE.Color()).getHex(); sv.clearAlpha = c.renderer.getClearAlpha();
      sv.fundo = c.scene.background;
      sv.clipLocal = c.renderer.localClippingEnabled;
      this.sv = sv;
    },

    /* ------------------------------------------------------------- preparar a cena */
    _preparar: function (c, mo, info, linha) {
      var THREE = THR(), p = P10(), self = this;
      /* 2) as peças desenhadas por si */
      var meshes = Assumir.pegar(mo);
      c.modelRoot.updateMatrixWorld(true);
      var ctx = { meshes: meshes, porId: info.porId, films: [], mat: {}, estado: {}, particulas: null, plano: null, cloneDe: {}, matLado: {} };
      ctx.I = new THREE.Matrix4();
      meshes.forEach(function (m) {
        m.matrixAutoUpdate = false; m.userData._apM0 = m.matrix.clone(); m.userData._apP = m.parent ? m.parent.matrixWorld.clone() : new THREE.Matrix4(); m.userData._apPi = m.userData._apP.clone().invert();
      });
      /* os pisos e as películas de pintura (malhas soltas na cena) */
      var pint = c.scene.getObjectByName("p4-pinturas"), pisos = c.scene.getObjectByName("acab-pisos");
      c.scene.updateMatrixWorld(true);
      function filme(f, base, tipo) {
        f.matrixAutoUpdate = false; f.userData._apM0 = f.matrix.clone(); f.userData._apP = f.parent ? f.parent.matrixWorld.clone() : new THREE.Matrix4(); f.userData._apPi = f.userData._apP.clone().invert();
        ctx.films.push({ m: f, base: base, tipo: tipo, orig: f.material, ordem: 0 });
      }
      if (pint) pint.children.forEach(function (f) { if (f.isMesh) filme(f, String(f.userData.p4Pintura), "pintura"); });
      if (pisos) pisos.children.forEach(function (f) { if (f.isMesh) filme(f, null, "piso"); });
      /* a ordem em que as películas "pintam": da rua para o fundo, pelo centro da peça de baixo (o piso: pela caixa dele) */
      var THREE2 = THREE;
      ctx.films.forEach(function (f) {
        var b = f.base && info.porId[f.base] ? info.porId[f.base].box : new THREE2.Box3().setFromObject(f.m), ce = b.getCenter(new THREE2.Vector3());
        f.pos = [ce.x, ce.z]; f.chave = -ce.z * 1000 + ce.x;
      });
      ctx.films.sort(function (a, b) { return a.chave - b.chave; }).forEach(function (f, i, l) { f.ordem = l.length > 1 ? i / (l.length - 1) : 0; });
      /* o que é novo? (as películas de peça nova só "pintam" na hora dos acabamentos) */
      ctx.nova = {}; linha.eventos.forEach(function (e) { if (e.tipo === "entrada" && e.etapa !== "existente") ctx.nova[e.id] = true; });
      /* a água da piscina: a malha translúcida azulada da família da piscina */
      ctx.agua = {};
      linha.eventos.forEach(function (e) {
        if (e.acao !== "piscina") return;
        var o = info.porId[e.id]; if (!o) return;
        o.meshes.forEach(function (m) { var mt = m.userData.matOrig || m.material; if (mt && mt.transparent && mt.opacity < 0.9) ctx.agua[m.uuid] = true; });
      });
      /* 3) o grupo da apresentação: o chão, a prancha, a planta, a poeira */
      this._centro(info);
      ctx.grupo = new THREE.Group(); ctx.grupo.name = "ra-apresentacao"; c.scene.add(ctx.grupo);
      this._chao(c, ctx, info);
      this._planta(c, ctx, info, linha);
      this._particulas(c, ctx, info, linha);
      this._prepararCortina(c, ctx, info);
      /* 4) o que não entra no filme */
      this.sv.escondidos.forEach(function (e) { e.o.visible = false; });
      var gr = c.scene.children.filter(function (o) { return o.type === "GridHelper"; }); gr.forEach(function (o) { self.sv.escondidos.push({ o: o, visible: o.visible }); o.visible = false; });
      /* 5) câmera e órbita */
      if (c.orbit) c.orbit.enabled = false;
      c.principalOculta(true);   /* quem desenha é este módulo (o BIM não desenha a vista principal por cima) */
      this.ctx = ctx;
    },
    _centro: function (info) {
      var THREE = THR(), b = info.tudo, ce = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3());
      var raio = Math.max(4, Math.sqrt(sz.x * sz.x + sz.z * sz.z) / 2 * 0.95 + sz.y * 0.1);
      this.centro = new THREE.Vector3(ce.x, Math.max(0.6, b.min.y + sz.y * 0.28), ce.z);
      this.raio = raio;
    },

    /* ------------------------------------------------------------- o chão: a base do lote (uma placa clara, como a maquete) — a casa não flutua no céu */
    _chao: function (c, ctx, info) {
      var THREE = THR(), b = info.tudo, ce = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3()), mg = 1.5, esp = 0.18;
      var mt = new THREE.MeshStandardMaterial({ color: 0xe3e6e2, roughness: 1, metalness: 0 });
      var m = new THREE.Mesh(new THREE.BoxGeometry(sz.x + mg * 2, esp, sz.z + mg * 2), mt);
      m.position.set(ce.x, b.min.y - esp / 2 - 0.03, ce.z); m.receiveShadow = true; m.castShadow = false; m.frustumCulled = false;
      ctx.grupo.add(m); ctx.chao = m;
    },

    /* ------------------------------------------------------------- a planta baixa no chão */
    _planta: function (c, ctx, info, linha) {
      var THREE = THR();
      function envoltoria(pts) {
        pts.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
        function cruz(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
        var lo = [], i, up = [];
        for (i = 0; i < pts.length; i++) { while (lo.length >= 2 && cruz(lo[lo.length - 2], lo[lo.length - 1], pts[i]) <= 1e-9) lo.pop(); lo.push(pts[i]); }
        for (i = pts.length - 1; i >= 0; i--) { while (up.length >= 2 && cruz(up[up.length - 2], up[up.length - 1], pts[i]) <= 1e-9) up.pop(); up.push(pts[i]); }
        lo.pop(); up.pop(); return lo.concat(up);
      }
      var V = new THREE.Vector3(), plantas = [];
      c.modelRoot.updateMatrixWorld(true);
      linha.plantaIds.forEach(function (id) {
        var o = info.porId[id]; if (!o) return;
        var pts = [], visto = {};
        o.meshes.forEach(function (m) {
          var pa = m.geometry && m.geometry.attributes && m.geometry.attributes.position; if (!pa) return;
          for (var i = 0; i < pa.count; i += 1) {
            V.fromBufferAttribute(pa, i).applyMatrix4(m.userData._apM0 ? new THREE.Matrix4().multiplyMatrices(m.userData._apP, m.userData._apM0) : m.matrixWorld);
            var k = Math.round(V.x * 200) + "|" + Math.round(V.z * 200); if (visto[k]) continue; visto[k] = 1;
            pts.push([V.x, V.z]);
          }
        });
        if (pts.length < 3) return;
        var h = envoltoria(pts); if (h.length < 3) return;
        plantas.push({ id: id, hull: h });
      });
      /* a prancha: um papel claro sob a planta (some quando as paredes começam a subir) */
      var b = info.tudo, ce = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3()), mg = 3;
      var papel = new THREE.Mesh(new THREE.PlaneGeometry(sz.x + mg * 2, sz.z + mg * 2), new THREE.MeshBasicMaterial({ color: 0xf7f9fc, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      papel.rotation.x = -Math.PI / 2; papel.position.set(ce.x, Math.max(0.01, b.min.y + 0.02), ce.z); papel.renderOrder = 1; ctx.grupo.add(papel);
      ctx.papel = papel;
      var yPl = papel.position.y + 0.015, larg = 0.07;
      ctx.plantas = {};
      plantas.forEach(function (pl) {
        var h = pl.hull, n = h.length, pos = [], idx = [], k;
        /* o contorno como faixa de 7 cm (quatro vértices por aresta, na ordem do desenho: o drawRange "desenha" a aresta aos poucos) */
        for (k = 0; k < n; k++) {
          var A = h[k], B = h[(k + 1) % n], dx = B[0] - A[0], dz = B[1] - A[1], L = Math.sqrt(dx * dx + dz * dz) || 1, nx = -dz / L * larg / 2, nz = dx / L * larg / 2;
          var o = pos.length / 3;
          pos.push(A[0] + nx, yPl, A[1] + nz, A[0] - nx, yPl, A[1] - nz, B[0] + nx, yPl, B[1] + nz, B[0] - nx, yPl, B[1] - nz);
          idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
        }
        var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
        var mat = new THREE.MeshBasicMaterial({ color: 0x1b4f9c, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
        var linhaM = new THREE.Mesh(g, mat); linhaM.renderOrder = 3; linhaM.frustumCulled = false;
        /* o enchimento (poché): triângulos em leque do centro; aparece depois que o contorno fecha */
        var cx = 0, cz = 0; h.forEach(function (q) { cx += q[0]; cz += q[1]; }); cx /= n; cz /= n;
        var fp = [cx, yPl - 0.004, cz], fi = [];
        h.forEach(function (q) { fp.push(q[0], yPl - 0.004, q[1]); });
        for (k = 0; k < n; k++) fi.push(0, 1 + k, 1 + ((k + 1) % n));
        var fg = new THREE.BufferGeometry(); fg.setAttribute("position", new THREE.Float32BufferAttribute(fp, 3)); fg.setIndex(fi);
        var fm = new THREE.MeshBasicMaterial({ color: 0x24324a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
        var fill = new THREE.Mesh(fg, fm); fill.renderOrder = 2; fill.frustumCulled = false;
        linhaM.visible = false; fill.visible = false;
        ctx.grupo.add(fill); ctx.grupo.add(linhaM);
        ctx.plantas[pl.id] = { linha: linhaM, fill: fill, total: idx.length, n: n };
      });
    },

    /* ------------------------------------------------------------- a poeira da demolição (função pura de t) */
    _particulas: function (c, ctx, info, linha) {
      var THREE = THR(), dados = [], total = 0;
      function rnd(id, k, j) { var s = 2166136261, str = id + "|" + k + "|" + j; for (var i = 0; i < str.length; i++) { s ^= str.charCodeAt(i); s = Math.imul(s, 16777619); } s ^= s >>> 13; s = Math.imul(s, 1274126177); s ^= s >>> 16; return (s >>> 0) / 4294967296; }
      linha.eventos.forEach(function (e) {
        if (e.tipo !== "saida") return;
        var o = info.porId[e.id]; if (!o) return;
        var b = o.box, sz = b.getSize(new THREE.Vector3()), n = clamp(Math.round(6 + Math.sqrt(Math.max(0, sz.x * sz.z + sz.x * sz.y + sz.y * sz.z)) * 3), 8, 34);
        for (var k = 0; k < n; k++) {
          dados.push({ ev: e, x0: lerp(b.min.x, b.max.x, rnd(e.id, k, 1)), y0: lerp(b.min.y, b.max.y, rnd(e.id, k, 2) * 0.6), z0: lerp(b.min.z, b.max.z, rnd(e.id, k, 3)),
            vx: (rnd(e.id, k, 4) - 0.5) * 1.6, vy: 0.5 + rnd(e.id, k, 5) * 1.6, vz: (rnd(e.id, k, 6) - 0.5) * 1.6, ts: e.t0 + e.dur * (0.3 + 0.6 * rnd(e.id, k, 7)), vida: 1.1 + rnd(e.id, k, 8) * 1.1, tam: 0.35 + rnd(e.id, k, 9) * 0.5 });
        }
      });
      total = dados.length;
      if (!total) { ctx.particulas = null; return; }
      var pos = new Float32Array(total * 3), alfa = new Float32Array(total), tam = new Float32Array(total);
      var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("aAlfa", new THREE.BufferAttribute(alfa, 1)); g.setAttribute("aTam", new THREE.BufferAttribute(tam, 1));
      var mt = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { uEscala: { value: 600 }, uCor: { value: new THREE.Color(0xb9a78d) } },
        vertexShader: "attribute float aAlfa; attribute float aTam; varying float vA; uniform float uEscala; void main(){ vA = aAlfa; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aTam * uEscala / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }",
        fragmentShader: "varying float vA; uniform vec3 uCor; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; float a = smoothstep(1.0, 0.2, r) * vA; if (a < 0.01) discard; gl_FragColor = vec4(uCor, a); }"
      });
      var pts = new THREE.Points(g, mt); pts.frustumCulled = false; pts.renderOrder = 6; ctx.grupo.add(pts);
      ctx.particulas = { dados: dados, pos: pos, alfa: alfa, tam: tam, geo: g, mat: mt, pontos: pts };
    },
    _atualizarParticulas: function (t) {
      var P = this.ctx && this.ctx.particulas; if (!P) return;
      var d = P.dados, i, g = 4.2, ativas = 0;
      for (i = 0; i < d.length; i++) {
        var q = d[i], age = t - q.ts;
        if (age < 0 || age > q.vida) { P.alfa[i] = 0; P.pos[i * 3] = 0; P.pos[i * 3 + 1] = -100; P.pos[i * 3 + 2] = 0; continue; }
        var u = age / q.vida;
        P.pos[i * 3] = q.x0 + q.vx * age; P.pos[i * 3 + 1] = Math.max(0.02, q.y0 + q.vy * age - 0.5 * g * age * age * 0.4); P.pos[i * 3 + 2] = q.z0 + q.vz * age;
        P.alfa[i] = 0.55 * (1 - u) * Math.min(1, age * 5); P.tam[i] = q.tam * (0.6 + 1.4 * u); ativas++;
      }
      P.geo.attributes.position.needsUpdate = true; P.geo.attributes.aAlfa.needsUpdate = true; P.geo.attributes.aTam.needsUpdate = true;
      P.pontos.visible = ativas > 0;
    },

    /* ------------------------------------------------------------- aplicar o instante t à cena */
    _clone: function (m) {
      var ctx = this.ctx, o = ctx.mat[m.uuid];
      if (o) return o;
      var orig = m.userData._apMat || this._base(m), cl = orig.clone();
      o = ctx.mat[m.uuid] = { orig: orig, cl: cl, cor: orig.color ? orig.color.clone() : null, emi: orig.emissive ? orig.emissive.clone() : null, emiI: orig.emissiveIntensity, op: orig.opacity, tr: orig.transparent, dw: orig.depthWrite };
      ctx.cloneDe[cl.uuid] = orig;
      m.userData._apMat = orig;
      return o;
    },
    /* o material "de verdade" da malha (o que ela tem fora dos clones desta apresentação) */
    _base: function (m) { var mt = m.material, ctx = this.ctx; return ctx && mt && ctx.cloneDe[mt.uuid] ? ctx.cloneDe[mt.uuid] : mt; },
    /* pinta o material da malha: cor (mistura com `tom`), brilho, opacidade */
    _pintar: function (m, tom, mist, emiCor, emiI, op) {
      var THREE = THR(), o = this._clone(m), cl = o.cl;
      if (cl !== m.material) m.material = cl;
      if (cl.color && o.cor) { cl.color.copy(o.cor); if (tom && mist > 0) cl.color.lerp(tom, mist); }
      if (cl.emissive && o.emi) { if (emiCor && emiI > 0) { cl.emissive.copy(emiCor); cl.emissiveIntensity = emiI; } else { cl.emissive.copy(o.emi); cl.emissiveIntensity = o.emiI; } }
      var opa = o.op * op;
      cl.opacity = opa; cl.transparent = op < 0.999 || o.tr; cl.depthWrite = op < 0.999 ? false : o.dw;
    },
    _devolver: function (m) {
      var o = this.ctx.mat[m.uuid], alvo = o ? o.orig : this._base(m);
      if (alvo && m.material !== alvo) m.material = alvo;
    },
    /* delta no MUNDO → matriz local da malha: Pi · Δ · P · M0 */
    _matriz: function (m, D) {
      var M = m.matrix; M.copy(m.userData._apPi).multiply(D).multiply(m.userData._apP).multiply(m.userData._apM0);
      m.matrixWorldNeedsUpdate = true;
    },
    _restaurarMatriz: function (m) { m.matrix.copy(m.userData._apM0); m.matrixWorldNeedsUpdate = true; },

    /* a transformação de uma peça animando: devolve { D (Matrix4 ou null), tom, mist, emiCor, emiI, op } por malha */
    _anim: function (st, box, m, t) {
      var THREE = THR(), D = this._D || (this._D = new THREE.Matrix4()), T = this._T || (this._T = new THREE.Matrix4()), S = this._Sx || (this._Sx = new THREE.Matrix4());
      var p = st.p, ac = st.acao, h = Math.max(0.05, box.max.y - box.min.y), res = { D: null, tom: null, mist: 0, emiCor: null, emiI: 0, op: 1 };
      var ctx = this.ctx, verde = this._verde || (this._verde = new THREE.Color(0x35d08a)), verm = this._verm || (this._verm = new THREE.Color(0xff3b30)), azul = this._azul || (this._azul = new THREE.Color(0x4aa3ff));
      var cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, minY = box.min.y, maxY = box.max.y;
      function escalaY(base, s) { T.makeTranslation(0, base, 0); S.makeScale(1, Math.max(0.0015, s), 1); D.multiplyMatrices(T, S); T.makeTranslation(0, -base, 0); D.multiply(T); }
      function escalaU(s) { T.makeTranslation(cx, minY, cz); S.makeScale(Math.max(0.0015, s), Math.max(0.0015, s), Math.max(0.0015, s)); D.multiplyMatrices(T, S); T.makeTranslation(-cx, -minY, -cz); D.multiply(T); }
      function desloca(x, y, z) { D.makeTranslation(x, y, z); }
      var q;
      if (!st.saindo) {
        var etapaNova = this._ehNova(st);
        if (ac === "subir") { q = suave(p); escalaY(minY, q); res.D = D; res.op = etapaNova ? 0.42 + 0.58 * suave((p - 0.5) / 0.5) : lerp(0.7, 1, p); if (etapaNova) { res.tom = verde; res.mist = 0.78 * (1 - suave((p - 0.45) / 0.55)); res.emiCor = verde; res.emiI = 0.35 * (1 - p); } }
        else if (ac === "descer") { q = saidaCubica(p); desloca(0, clamp(2 + 0.5 * Math.max(box.max.x - box.min.x, box.max.z - box.min.z), 2.5, 6.5) * (1 - q), 0); res.D = D; res.op = etapaNova ? 0.5 + 0.5 * suave((p - 0.4) / 0.6) : 1; if (etapaNova) { res.tom = azul; res.mist = 0.65 * (1 - suave((p - 0.5) / 0.5)); res.emiCor = azul; res.emiI = 0.3 * (1 - p); } }
        else if (ac === "aparecer") { q = saidaCubica(p); desloca(0, -0.5 * (1 - q), 0); res.D = D; res.op = 0.25 + 0.75 * suave(p); res.tom = azul; res.mist = 0.5 * (1 - p); }
        else if (ac === "encaixar") { q = saidaElastica(p); desloca(0, 1.6 * (1 - q), 0); res.D = D; res.op = 0.4 + 0.6 * suave(p / 0.6); res.tom = verde; res.mist = 0.6 * (1 - suave(p)); res.emiCor = verde; res.emiI = 0.3 * (1 - p); }
        else if (ac === "crescer") { q = st.grupo === "paisagismo" ? saidaCubica(p) : saidaElastica(p); escalaU(q); res.D = D; res.op = 0.5 + 0.5 * suave(p / 0.5); }
        else if (ac === "piscina") {
          var agua = ctx.agua[m.uuid];
          if (agua) { var qa = suave((p - 0.45) / 0.55); escalaY(minY, qa); res.D = D; res.op = qa > 0.001 ? 1 : 0; }
          else { var qc = suave(p / 0.45); escalaY(maxY, qc); res.D = D; res.tom = azul; res.mist = 0.45 * (1 - qc); }
        }
      } else {
        /* DEMOLIÇÃO: treme e brilha em vermelho (0–35 %), depois desaba/afunda e some */
        var tremer = clamp(p / 0.35, 0, 1), cair = clamp((p - 0.35) / 0.65, 0, 1), vermelho = Math.min(1, p * 3.2);
        res.tom = verm; res.mist = 0.82 * vermelho; res.emiCor = verm; res.emiI = 0.25 + 0.55 * Math.abs(Math.sin(p * 22));
        var jx = (1 - cair) * 0.05 * Math.sin(p * 90) * tremer, jz = (1 - cair) * 0.05 * Math.cos(p * 77) * tremer;
        if (cair <= 0) { desloca(jx, 0, jz); res.D = D; }
        else if (st.grupo === "cobertura" || st.grupo === "horizontal" || st.grupo === "forro") { q = entradaCubica(cair); escalaY(minY, 1 - 0.95 * q); T.makeTranslation(jx, -Math.min(minY, 3) * 0.7 * q, jz); D.premultiply(T); res.D = D; res.op = 1 - 0.85 * suave((cair - 0.3) / 0.7); }
        else if (st.grupo === "vertical" || st.grupo === "fundacao" || st.grupo === "volume") { q = entradaCubica(cair); escalaY(minY, 1 - 0.985 * q); res.D = D; res.op = 1 - 0.7 * suave((cair - 0.55) / 0.45); }
        else { q = entradaCubica(cair); escalaU(1 - 0.98 * q); res.D = D; res.op = 1 - 0.7 * suave((cair - 0.4) / 0.6); }
      }
      return res;
    },
    _ehNova: function (st) { return !!(this.linha && this.ctx && st.nova); },

    aplicar: function (t) {
      var a = AP(), THREE = THR(), ctx = this.ctx, L = this.linha, self = this, c = this.c;
      if (!ctx || !L) return;
      var IDX = L.porPeca, estados = {};
      /* as peças do modelo */
      var porId = ctx.porId;
      Object.keys(porId).forEach(function (id) {
        var o = porId[id], es = a.estadoPeca(L, id, t), ev = L.porPeca[id], emAnim = es.p != null;
        var chave = es.vis ? (emAnim ? "a" : "f") : "h";
        var nova = ev && ev.entrada && ev.entrada.etapa !== "existente";
        estados[id] = { vis: es.vis, anim: emAnim, nova: nova };
        o.meshes.forEach(function (m) {
          if (chave === "h") { if (m.visible) m.visible = false; if (ctx.estado[m.uuid] !== "h") { self._restaurarMatriz(m); self._devolver(m); ctx.estado[m.uuid] = "h"; } return; }
          if (!m.visible) m.visible = true;
          if (chave === "f") {
            if (ctx.estado[m.uuid] !== "f") { self._restaurarMatriz(m); self._devolver(m); ctx.estado[m.uuid] = "f"; }
            return;
          }
          var r = self._anim({ p: es.p, acao: es.acao, saindo: !!es.saindo, grupo: es.grupo, nova: nova }, o.box, m, t);
          if (r.D) self._matriz(m, r.D); else self._restaurarMatriz(m);
          self._pintar(m, r.tom, r.mist, r.emiCor, r.emiI, r.op);
          ctx.estado[m.uuid] = "a";
        });
      });
      /* as películas de pintura e os pisos */
      var pin = L.pintura;
      ctx.films.forEach(function (f) {
        var m = f.m, b = f.base ? estados[f.base] : null, vis, alfa = 1;
        if (f.tipo === "piso") { vis = pin ? t >= pin.t0 + f.ordem * Math.max(0.1, pin.dur - 1.2) : t >= L.total; alfa = pin ? suave((t - (pin.t0 + f.ordem * Math.max(0.1, pin.dur - 1.2))) / 1.1) : 1; }
        else if (b) {
          vis = b.vis;
          if (b.nova) { var t0 = pin ? pin.t0 + f.ordem * Math.max(0.1, pin.dur - 1.2) : 0; vis = b.vis && !b.anim && t >= t0; alfa = suave((t - t0) / 1.1); }
        } else vis = true;
        if (!vis || alfa <= 0.001) { if (m.visible) m.visible = false; return; }
        if (!m.visible) m.visible = true;
        /* a película acompanha a peça de baixo (a mesma transformação) e entra com a opacidade da pintura */
        var o = f.base ? porId[f.base] : null, es = f.base ? a.estadoPeca(L, f.base, t) : null, mult = 1;
        if (o && es && es.p != null) {
          var meshRef = o.meshes[0], r = self._anim({ p: es.p, acao: es.acao, saindo: !!es.saindo, grupo: es.grupo, nova: b && b.nova }, o.box, meshRef, t);
          if (r.D) self._matriz(m, r.D); else self._restaurarMatriz(m);
          mult = r.op;
        } else self._restaurarMatriz(m);
        var fo = ctx.mat[m.uuid] || (ctx.mat[m.uuid] = { orig: f.orig, cl: f.orig.clone(), op: f.orig.opacity, tr: f.orig.transparent, dw: f.orig.depthWrite });
        if (alfa < 0.999 || mult < 0.999) { m.material = fo.cl; fo.cl.transparent = true; fo.cl.opacity = fo.op * alfa * mult; fo.cl.depthWrite = false; }
        else if (m.material !== f.orig) m.material = f.orig;
      });
      /* a planta baixa e a prancha */
      this._aplicarPlanta(t);
      this._atualizarParticulas(t);
      this._aplicarFecho(t);
    },
    _aplicarPlanta: function (t) {
      var ctx = this.ctx, L = this.linha, ep = L.porEtapa.planta, ex = L.porEtapa.existente, self = this;
      if (!ctx.papel) return;
      var fimPlanta = ex ? ex.t0 : (ep ? ep.t1 : 0), saida = fimPlanta + 3.0;
      var visivel = !!ep && t >= ep.t0 && t < saida;
      var papelOp = !ep ? 0 : (t < ep.t0 ? 0 : (t < ep.t0 + 1.2 ? suave((t - ep.t0) / 1.2) : (t < fimPlanta ? 1 : 1 - suave((t - fimPlanta) / 3.0))));
      ctx.papel.visible = papelOp > 0.002; ctx.papel.material.opacity = 0.94 * papelOp;
      L.eventos.forEach(function (e) {
        if (e.tipo !== "planta") return;
        var pl = ctx.plantas[e.id]; if (!pl) return;
        var p = clamp((t - e.t0) / e.dur, 0, 1), sai = ex ? 1 - suave((t - fimPlanta) / 3.0) : 1;
        var on = visivel && t >= e.t0 && sai > 0.002;
        pl.linha.visible = on; pl.fill.visible = on && p > 0.55;
        if (!on) return;
        pl.linha.geometry.setDrawRange(0, Math.ceil(pl.total * Math.min(1, p / 0.8) / 6) * 6);
        pl.linha.material.opacity = sai;
        pl.fill.material.opacity = 0.9 * suave((p - 0.6) / 0.4) * sai;
      });
    },

    /* ------------------------------------------------------------- o FECHO: dissolve, cortina 3D e comparar
     * A cortina é um PLANO DE RECORTE vertical no mundo (renderer.localClippingEnabled): a peça só do ANTES (demolida) recebe um
     * clone do material com o plano que guarda o lado esquerdo; a só do DEPOIS (nova), o clone com o plano oposto; a existente que
     * fica não muda (aparece dos dois lados). Os clones são POR MATERIAL e por lado (poucos), feitos uma vez e liberados no parar().
     * As peças já estão fora do mesclado (Assumir) — por isso cada uma leva o seu material.
     * O plano tem a normal = a direita da tela (horizontal), recalculada a cada quadro: à esquerda da linha, sempre o antes. */
    _prepararCortina: function (c, ctx, info) {
      var THREE = THR(), a = AP(), p = P10(), self = this;
      var st = p.estado();
      try { st = a.soEscolhida(st, this.escolha); } catch (e) {}
      ctx.lados = a.lados(st, p.deps());
      ctx.plA = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1e6); ctx.plD = new THREE.Plane(new THREE.Vector3(1, 0, 0), 1e6);
      var b = info.tudo, mn = b.min, mx = b.max;
      ctx.caixaC = { min: [mn.x, mn.y, mn.z], max: [mx.x, mx.y, mx.z] };
      /* a LINHA LUMINOSA no corte: uma lâmina fina e clara (vista de lado, um traço; de frente, um véu) + um halo que se vê através das paredes */
      var fio = new THREE.Group(); fio.name = "ap-cortina-fio"; fio.visible = false; fio.renderOrder = 8;
      var esp = Math.max(0.035, this.raio * 0.0035);
      /* a moldura: quatro barras finas no contorno do plano (de lado, um traço fino; de frente, um quadro leve — nunca uma parede branca) */
      var geoB = new THREE.BoxGeometry(1, 1, 1);
      var matB = new THREE.MeshBasicMaterial({ color: 0xf2fbff, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
      var matH = new THREE.MeshBasicMaterial({ color: 0x8fd3ff, transparent: true, opacity: 0.14, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false });
      var barras = [], halos = [];
      for (var ib = 0; ib < 4; ib++) { var mb = new THREE.Mesh(geoB, matB), mh = new THREE.Mesh(geoB, matH); mb.renderOrder = 9; mh.renderOrder = 10; mb.frustumCulled = mh.frustumCulled = false; fio.add(mb); fio.add(mh); barras.push(mb); halos.push(mh); }
      var veu = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.045, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }));
      veu.rotation.y = Math.PI / 2;   /* o véu fica no plano local YZ (a normal do plano é o x local = o eixo da cortina) */
      veu.renderOrder = 8; veu.frustumCulled = false; fio.add(veu);
      ctx.grupo.add(fio);
      ctx.fio = { g: fio, barras: barras, halos: halos, matB: matB, matH: matH, veu: veu, esp: esp };
      ctx.pl = null;
    },
    /* o clone do material para um lado da cortina (um por material e por lado) */
    _matLado: function (orig, lado) {
      var ctx = this.ctx, k = orig.uuid + "|" + lado, o = ctx.matLado[k];
      if (o) return o;
      var THREE = THR(), cl = orig.clone();
      cl.clippingPlanes = [lado === "antes" ? ctx.plA : ctx.plD];
      cl.clipShadows = true;
      /* o miolo da peça cortada aparece (sem a "casca oca" do recorte) */
      if (!orig.transparent) cl.side = THREE.DoubleSide;
      o = ctx.matLado[k] = { cl: cl, op: orig.opacity, tr: orig.transparent, dw: orig.depthWrite };
      ctx.cloneDe[cl.uuid] = orig;
      return o;
    },
    _vestirLado: function (m, orig, lado, alfa) {
      var o = this._matLado(orig, lado), cl = o.cl;
      if (m.material !== cl) m.material = cl;
      var op = o.op * alfa;
      if (cl.opacity !== op) cl.opacity = op;
      cl.transparent = alfa < 0.999 || o.tr; cl.depthWrite = alfa < 0.999 ? false : o.dw;
    },
    /* o eixo da cortina: a direita da câmera, no plano do chão */
    _eixoCortina: function () {
      var cam = this.c.camera, e = cam.matrixWorld.elements, x = e[0], z = e[2], L = Math.sqrt(x * x + z * z);
      if (L < 1e-6) { var f = new (THR()).Vector3(); cam.getWorldDirection(f); x = -f.z; z = f.x; L = Math.sqrt(x * x + z * z) || 1; }
      return [x / L, z / L];
    },
    _aplicarFecho: function (t) {
      var a = AP(), L = this.linha, ctx = this.ctx, self = this, k = a.cortinaEm(L, t), fio = ctx.fio;
      if (!this.gravando && (this.livre || t >= L.total - 1e-6) && this._posUsuario != null) k = { fase: "comparar", mistura: 0, pos: this._posUsuario };
      ctx.fecho = k;
      if (!k.fase) { if (fio) fio.g.visible = false; ctx.pl = null; if (this.sv && this.c.renderer.localClippingEnabled !== !!this.sv.clipLocal) this.c.renderer.localClippingEnabled = !!this.sv.clipLocal; return; }
      var c = this.c, r = c.renderer;
      if (!r.localClippingEnabled) r.localClippingEnabled = true;
      var dissolve = k.fase === "dissolve";
      this.c.camera.updateMatrixWorld();
      var eixo = this._eixoCortina(), pl = a.planoCortina(ctx.caixaC, eixo, k.pos, -0.05);   /* folga NEGATIVA: de 0 a 1 a linha anda DENTRO da caixa — na borda, a moldura e a alça ficam no canto da casa */
      ctx.pl = pl; ctx.secao = a.secaoCortina(ctx.caixaC, pl);
      if (dissolve) { ctx.plA.normal.set(pl.antes.n[0], 0, pl.antes.n[2]); ctx.plA.constant = 1e6; ctx.plD.normal.set(pl.depois.n[0], 0, pl.depois.n[2]); ctx.plD.constant = 1e6; }
      else { ctx.plA.normal.set(pl.antes.n[0], 0, pl.antes.n[2]); ctx.plA.constant = pl.antes.c; ctx.plD.normal.set(pl.depois.n[0], 0, pl.depois.n[2]); ctx.plD.constant = pl.depois.c; }
      var ld = ctx.lados;
      Object.keys(ctx.porId).forEach(function (id) {
        var lado = a.ladoDe(ld, id);
        if (lado == null) return;    /* fora da conta (extra sem mãe): fica como o filme deixou */
        var alfa = dissolve ? a.opacidadeLado(lado, k.mistura) : (lado === "nenhum" ? 0 : 1);
        ctx.porId[id].meshes.forEach(function (m) {
          if (alfa <= 0.002) { if (m.visible) m.visible = false; ctx.estado[m.uuid] = "L"; return; }
          if (!m.visible) m.visible = true;
          if (ctx.estado[m.uuid] === "a") self._restaurarMatriz(m);
          var base = self._base(m);
          if (lado === "ambos") { if (m.material !== base) m.material = base; }
          else self._vestirLado(m, base, lado, alfa);
          ctx.estado[m.uuid] = "L";
        });
      });
      /* as películas (pintura e piso) seguem a peça de baixo; o piso novo é do DEPOIS */
      ctx.films.forEach(function (f) {
        var lado = f.tipo === "piso" ? "depois" : (f.base ? a.ladoDe(ld, f.base) : null);
        if (lado == null) return;
        var alfa = dissolve ? a.opacidadeLado(lado, k.mistura) : (lado === "nenhum" ? 0 : 1), m = f.m;
        if (alfa <= 0.002) { m.visible = false; return; }
        m.visible = true; self._restaurarMatriz(m);
        if (lado === "ambos") { if (m.material !== f.orig) m.material = f.orig; }
        else self._vestirLado(m, f.orig, lado, alfa);
      });
      /* a linha luminosa: no corte, do tamanho da caixa; entra com a cortina e fica no comparar */
      if (fio) {
        var sec = ctx.secao, on = !dissolve && !!sec && sec.comp > 0.05;
        fio.g.visible = on;
        if (on) {
          /* a moldura PRESA ao corte do modelo: o segmento em que o plano atravessa a caixa das peças, na altura dela */
          var cx = ctx.caixaC, comp = sec.comp + 0.2, alt = (cx.max[1] - cx.min[1]) + 0.3, y = (cx.min[1] + cx.max[1]) / 2 + 0.1;
          fio.g.position.set(sec.meio[0], y, sec.meio[1]);
          fio.g.rotation.set(0, Math.atan2(-eixo[1], eixo[0]), 0);
          var E = fio.esp, H2 = alt / 2, C2 = comp / 2;
          /* topo, base e os dois montantes (no plano local YZ) */
          [[0, H2, 0, E, E, comp], [0, -H2, 0, E, E, comp], [0, 0, -C2, E, alt, E], [0, 0, C2, E, alt, E]].forEach(function (q, iq) {
            fio.barras[iq].position.set(q[0], q[1], q[2]); fio.barras[iq].scale.set(q[3], q[4], q[5]);
            fio.halos[iq].position.set(q[0], q[1], q[2]); fio.halos[iq].scale.set(q[3] * 4, q[4] + (iq > 1 ? 0 : E * 3), q[5] + (iq > 1 ? E * 3 : 0));
          });
          fio.veu.scale.set(comp, alt, 1);
          var ent = k.fase === "cortina" ? suave((t - L.final.cortina.t0) / 0.5) : 1;
          fio.matB.opacity = 0.95 * ent; fio.matH.opacity = 0.14 * ent; fio.veu.material.opacity = 0.045 * ent;
        }
      }
    },
    /* a posição da linha na tela e o ponto da alça (o centro da caixa, no plano) — para a alça de arrastar e para o vídeo */
    _linhaNaTela: function (W, H) {
      var ctx = this.ctx, pl = ctx && ctx.pl; if (!pl) return null;
      var THREE = THR(), cx = ctx.caixaC, cam = this.c.camera, e = pl.eixo;
      /* a alça fica SEMPRE no plano, no meio do trecho em que ele corta a casa (na borda, fica na borda junto com a linha) */
      var sec = ctx.secao, y = this.centro ? this.centro.y : (cx.min[1] + cx.max[1]) / 2;
      var mx = sec ? sec.meio[0] : (cx.min[0] + cx.max[0]) / 2, mz = sec ? sec.meio[1] : (cx.min[2] + cx.max[2]) / 2;
      var off = pl.s - (e[0] * mx + e[2] * mz);
      function tela(s) { var v = new THREE.Vector3(mx + e[0] * (s - pl.s + off), y, mz + e[2] * (s - pl.s + off)).project(cam); return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, z: v.z }; }
      return { p: tela(pl.s), lo: tela(pl.lo), hi: tela(pl.hi) };
    },
    /* arrastar: a posição do mouse vira a fração da linha (projeção no segmento lo → hi da tela) */
    _posDoMouse: function (x, y, W, H) {
      /* o raio do mouse até o chão da obra (altura do centro): a linha passa por baixo do cursor; fora da casa, trava em 0 ou 1 */
      var pl = this.ctx && this.ctx.pl, THREE = THR(), cam = this.c.camera;
      if (pl && this.centro) {
        var o = cam.position, d = new THREE.Vector3((x / W) * 2 - 1, -(y / H) * 2 + 1, 0.5).unproject(cam).sub(o).normalize();
        if (Math.abs(d.y) > 1e-4) {
          var k = (this.centro.y - o.y) / d.y;
          if (k > 0) { var wx = o.x + d.x * k, wz = o.z + d.z * k; return clamp((pl.eixo[0] * wx + pl.eixo[2] * wz - pl.lo) / (pl.hi - pl.lo), 0, 1); }
        }
      }
      var ln = this._linhaNaTela(W, H); if (!ln) return null;
      var dx = ln.hi.x - ln.lo.x, dy = ln.hi.y - ln.lo.y, L2 = dx * dx + dy * dy;
      if (L2 < 1) return null;
      return clamp(((x - ln.lo.x) * dx + (y - ln.lo.y) * dy) / L2, 0, 1);
    },

    /* ------------------------------------------------------------- o enquadramento de cada capítulo (caixa das peças que ele anima) */
    _medirQuadros: function (info, linha) {
      var THREE = THR(), a = AP(), Q = {}, por = {}, self = this;
      Q._tudo = { c: [this.centro.x, this.centro.y, this.centro.z], r: this.raio };
      linha.eventos.forEach(function (ev) { var o = info.porId[ev.id]; if (!o) return; (por[ev.etapa] = por[ev.etapa] || new THREE.Box3()).union(o.box); });
      linha.etapas.forEach(function (e) {
        var b = por[e.id];
        if (!b || b.isEmpty() || (a.FECHO && a.FECHO[e.id])) { Q[e.id] = Q._tudo; return; }
        var ce = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3());
        var r = Math.max(3, Math.sqrt(sz.x * sz.x + sz.z * sz.z) / 2 * 0.95 + sz.y * 0.1), w = 0.55;
        var cy = Math.max(0.6, b.min.y + sz.y * 0.28);
        /* metade do caminho até as peças do capítulo: aproxima sem perder a casa de vista */
        Q[e.id] = { c: [lerp(Q._tudo.c[0], ce.x, w), lerp(Q._tudo.c[1], cy, w), lerp(Q._tudo.c[2], ce.z, w)], r: clamp(r * 1.2, self.raio * 0.62, self.raio) };
      });
      return Q;
    },
    /* a câmera sai da pose atual e chega ao percurso em `dur` segundos (entrada, troca de capítulo, fim do modo livre) */
    _iniciarBlend: function (dur) {
      var c = this.c; if (!c) return;
      var alvo = this._alvoAtual ? this._alvoAtual.clone() : (c.orbit ? c.orbit.target.clone() : c.camera.position.clone().add(c.camera.getWorldDirection(new (THR()).Vector3()).multiplyScalar(10)));
      this._blend = { pos: c.camera.position.clone(), alvo: alvo, fov: c.camera.fov, t0: (global.performance ? global.performance.now() : Date.now()), dur: (dur || 1) * 1000 };
    },
    _livreSync: function () {
      var deve = !this.gravando && !this.tocando && this.linha && this.t >= this.linha.total - 1e-6;
      if (deve && !this.livre) {
        var cam = this.c.camera, v = cam.position.clone().sub(this.centro), d = v.length() || 1;
        this.livre = { az: Math.atan2(v.x, v.z), el: Math.asin(clamp(v.y / d, -1, 1)), d: d };
      } else if (!deve && this.livre) { this.livre = null; this._iniciarBlend(1.0); }
      if (this.ui && this.ui.vista) this.ui.vista.setAttribute("data-livre", this.livre ? "1" : "0");
    },

    /* ------------------------------------------------------------- a câmera */
    _camera: function (t) {
      var a = AP(), THREE = THR(), c = this.c, cam = c.camera;
      var fov = 38, asp = cam.aspect || 1.6, vfov = fov * Math.PI / 180, hfov = 2 * Math.atan(Math.tan(vfov / 2) * asp);
      cam.fov = fov; cam.near = 0.2; cam.far = 800; cam.up.set(0, 1, 0);
      var P = this._camP || (this._camP = new THREE.Vector3()), C = this._camC || (this._camC = new THREE.Vector3());
      if (this.livre && !this.gravando) {
        /* o COMPARAR livre: o usuário gira (arrastando fora da alça) e aproxima (roda do mouse) em volta da obra */
        var lv = this.livre; C.copy(this.centro);
        P.set(C.x + lv.d * Math.sin(lv.az) * Math.cos(lv.el), C.y + lv.d * Math.sin(lv.el), C.z + lv.d * Math.cos(lv.az) * Math.cos(lv.el));
      } else {
        var k = a.camera(this.linha, t), q = this._quadros ? a.enquadramentoEm(this.linha, this._quadros, t) : null;
        if (q) C.set(q.c[0], q.c[1], q.c[2]); else C.copy(this.centro);
        var R = q ? q.r : this.raio, d = R / Math.sin(Math.min(vfov, hfov) / 2) * 0.92 * k.d, el = k.el * Math.PI / 180;
        P.set(C.x + d * Math.sin(k.az) * Math.cos(el), C.y + d * Math.sin(el), C.z + d * Math.cos(k.az) * Math.cos(el));
        var b = this._blend;
        if (b && !this.gravando) {
          var u = ((global.performance ? global.performance.now() : Date.now()) - b.t0) / b.dur;
          if (u >= 1) this._blend = null;
          else { var e = u * u * u * (u * (u * 6 - 15) + 10); P.lerpVectors(b.pos, P, e); C.lerpVectors(b.alvo, C, e); cam.fov = lerp(b.fov, fov, e); }
        }
      }
      cam.position.copy(P);
      cam.lookAt(C);
      this._alvoAtual = (this._alvoAtual || new THREE.Vector3()).copy(C);
      if (c.orbit) c.orbit.target.copy(C);
      cam.updateProjectionMatrix();
    },

    /* ------------------------------------------------------------- um quadro: estado + câmera + desenho */
    quadro: function (t, W, H, alvo2d) {
      var c = this.c, r = c.renderer, cam = c.camera;
      if (!this.ctx) return false;
      var sz = r.getSize(this._v2q || (this._v2q = new (THR()).Vector2()));
      if (Math.round(sz.x) !== W || Math.round(sz.y) !== H) { r.setPixelRatio(1); r.setSize(W, H, false); }
      if (Math.abs(cam.aspect - W / H) > 1e-4) { cam.aspect = W / H; cam.updateProjectionMatrix(); }
      this._camera(t);
      this.aplicar(t);
      if (this.ctx.particulas) this.ctx.particulas.mat.uniforms.uEscala.value = H * 0.62;   /* a poeira tem o mesmo tamanho na tela e no vídeo 1920×1080 */
      c.scene.updateMatrixWorld(true);
      r.render(c.scene, cam);
      if (alvo2d) {
        var g = alvo2d.getContext("2d");
        /* o céu: o renderer é transparente (o BIM põe o fundo por trás do canvas) — no vídeo o fundo entra no quadro */
        var fg = g.createLinearGradient(0, 0, 0, H); fg.addColorStop(0, "#6f9bc9"); fg.addColorStop(0.55, "#cfdeec"); fg.addColorStop(1, "#eef2f6");
        g.fillStyle = fg; g.fillRect(0, 0, W, H);
        g.drawImage(r.domElement, 0, 0, W, H);
        Hud.desenhar(g, W, H, this);
      }
      return true;
    },
    _registrarTick: function () {
      var c = this.c, self = this;
      if (c._apTick) return;
      var fn = function (dt) { try { self._tick(dt); } catch (e) { self._erro(e); } };
      c._apTick = fn; c.tickExtra.push(fn);
      this._tickFn = fn;
    },
    _erro: function (e) { if (global.console && console.error) console.error("[apresentacao]", e); this._mostrarAviso("Erro na apresentação: " + (e && e.message ? e.message : e)); this.tocando = false; },
    /* o quadro da VISTA: a cena desenhada no próprio canvas do 3D, no tamanho dele (nada de tela à parte) */
    _tick: function (dt) {
      if (!this.ativa || !this._pronto || this.gravando) return;
      var c = cena();
      if (!c || c.scene !== this.c.scene) { this.parar(); return; }
      var L = this.linha, agora = (global.performance ? global.performance.now() : Date.now());
      /* até 0,5 s por quadro: máquina lenta segue em tempo real; o teto só evita o salto de quem voltou de outra aba */
      var passo = this._ultimo ? Math.min(0.5, (agora - this._ultimo) / 1000) : 0;
      this._ultimo = agora;
      if (this.tocando) {
        this.t += passo * this.vel;
        if (this.t >= L.total) { this.t = L.total; this.tocando = false; this._pintarUi(); }
      }
      this._livreSync();
      var r = this.c.renderer, sz = r.getSize(this._v2t || (this._v2t = new (THR()).Vector2()));
      var W = Math.max(1, Math.round(sz.x)), H = Math.max(1, Math.round(sz.y));
      this.quadro(this.t, W, H, null);
      this._pintarHud(W, H);
      this._atualizarBarra();
    },

    /* ------------------------------------------------------------- a interface: uma camada DENTRO da vista 3D */
    _montarUi: function () {
      var self = this, c = this.c, L = this.linha, host = c.renderer.domElement.parentNode || c.host;
      injetarCssAp();
      var vista = document.createElement("div");
      vista.className = "ap-vista"; vista.setAttribute("data-ap-vista", "1"); vista.setAttribute("data-entrando", "1");
      vista.innerHTML =
        '<div class="ap-capa" data-ap="capa"></div><div class="ap-vinheta"></div><div class="ap-sombra"></div>' +
        '<div class="ap-obra"></div><div class="ap-marca">' + esc(MARCA) + '</div>' +
        '<div class="ap-terco"><div class="ap-cap"></div><div class="ap-tit"></div><div class="ap-leg"></div></div>' +
        '<div class="ap-cont"><div class="ap-pill" data-ap-pill="exi" style="--ap-pc:#cfe0f5"><b></b><span></span></div><div class="ap-pill" data-ap-pill="dem" style="--ap-pc:#ff6b60"><b></b><span>Demolido</span></div><div class="ap-pill" data-ap-pill="nov" style="--ap-pc:#56e09a"><b></b><span>Construído</span></div></div>' +
        '<div class="ap-alca" data-ap="alca" title="Arraste para comparar o antes e o depois">⇔<span class="ap-rot ap-rot-a">ANTES</span><span class="ap-rot ap-rot-d">DEPOIS</span></div>' +
        '<div class="ap-aviso"></div>' +
        '<div class="ap-barra" data-ap-barra="1"></div>';
      var barra = vista.querySelector(".ap-barra");
      function btn(id, rot, tit) { var b = document.createElement("button"); b.type = "button"; b.setAttribute("data-ap", id); b.textContent = rot; b.title = tit || ""; b.setAttribute("aria-label", tit || rot); barra.appendChild(b); return b; }
      function sep() { var s = document.createElement("span"); s.className = "ap-sep"; barra.appendChild(s); }
      var bAnt = btn("anterior", "⏮", "Capítulo anterior (←)"), bPlay = btn("play", "▶", "Reproduzir / pausar (Espaço)"), bProx = btn("proxima", "⏭", "Próximo capítulo (→)");
      var cap = document.createElement("span"); cap.className = "ap-capnome"; cap.setAttribute("data-ap", "capitulo"); barra.appendChild(cap);
      var tempo = document.createElement("input"); tempo.type = "range"; tempo.min = "0"; tempo.max = String(Math.round(L.total * 100)); tempo.value = "0"; tempo.setAttribute("data-ap", "tempo"); tempo.title = "Arraste para ir a qualquer ponto"; tempo.setAttribute("aria-label", "Posição na apresentação"); barra.appendChild(tempo);
      var rotT = document.createElement("span"); rotT.className = "ap-tempo"; rotT.setAttribute("data-ap", "rotulo"); barra.appendChild(rotT);
      sep();
      var bVel = btn("vel", "1×", "Velocidade: 0,5× · 1× · 2× (V)");
      var bVid = btn("video", "⬇ Vídeo", "Grava a apresentação em 1920×1080 (WebM ou MP4) e baixa o arquivo");
      var bSair = btn("sair", "✕ Sair", "Sair da apresentação (Esc) — a vista volta como estava");
      host.appendChild(vista);
      vista.querySelector(".ap-obra").textContent = String(L.titulo || "");
      this.ui = { vista: vista, barra: barra, aviso: vista.querySelector(".ap-aviso"), bPlay: bPlay, tempo: tempo, rotT: rotT, cap: cap, bVel: bVel, terco: vista.querySelector(".ap-terco"), alca: vista.querySelector(".ap-alca"), capa: vista.querySelector(".ap-capa"), pills: {}, ultimoMov: Date.now(), etapa: null, txt: {} };
      Array.prototype.forEach.call(vista.querySelectorAll("[data-ap-pill]"), function (p) { self.ui.pills[p.getAttribute("data-ap-pill")] = { el: p, b: p.querySelector("b"), s: p.querySelector("span") }; });
      global.setTimeout(function () { if (self.ui && self.ui.vista === vista) vista.removeAttribute("data-entrando"); }, 420);
      /* eventos */
      bPlay.onclick = function () { self.alternar(); };
      bAnt.onclick = function () { self.irEtapa(-1); };
      bProx.onclick = function () { self.irEtapa(1); };
      bVel.onclick = function () { self.velocidade(self.vel === 1 ? 2 : (self.vel === 2 ? 0.5 : 1)); };
      bSair.onclick = function () { self.parar(); };
      bVid.onclick = function () { self.exportarVideo(); };
      tempo.oninput = function () { self.irPara(+tempo.value / 100, true); };
      this._moveu = function () { if (!self.ui) return; self.ui.ultimoMov = Date.now(); vista.removeAttribute("data-oculta-barra"); };
      vista.addEventListener("pointermove", this._moveu, true);
      barra.addEventListener("pointerenter", this._moveu);
      this._esconder = global.setInterval(function () { if (!self.ui) return; if (Date.now() - self.ui.ultimoMov > 3200 && self.tocando && !self.gravando) vista.setAttribute("data-oculta-barra", "1"); }, 600);
      /* a ALÇA da cortina: arrastar move a linha (para o filme e entra no comparar livre) */
      var alca = this.ui.alca, arr = null;
      alca.addEventListener("pointerdown", function (e) {
        arr = e.pointerId; try { alca.setPointerCapture(e.pointerId); } catch (x) {}
        if (self.tocando || self.t < self.linha.total) { self.tocando = false; self.t = self.linha.total; self._pintarUi(); }
        e.preventDefault(); e.stopPropagation();
      });
      alca.addEventListener("pointermove", function (e) {
        if (arr == null) return;
        var rc = self.c.renderer.domElement.getBoundingClientRect(), f = self._posDoMouse(e.clientX - rc.left, e.clientY - rc.top, rc.width, rc.height);
        if (f != null) self._posUsuario = f;
        e.preventDefault(); e.stopPropagation();
      });
      function soltaA(e) { arr = null; try { alca.releasePointerCapture(e.pointerId); } catch (x) {} }
      alca.addEventListener("pointerup", soltaA); alca.addEventListener("pointercancel", soltaA);
      /* a CAPA cobre o canvas: o 3D não seleciona nada durante a apresentação; no comparar livre ela gira e aproxima a vista */
      var capa = this.ui.capa, gir = null;
      capa.addEventListener("pointerdown", function (e) { if (!self.livre) return; gir = { id: e.pointerId, x: e.clientX, y: e.clientY }; try { capa.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault(); });
      capa.addEventListener("pointermove", function (e) {
        if (!gir || !self.livre) return;
        var dx = e.clientX - gir.x, dy = e.clientY - gir.y; gir.x = e.clientX; gir.y = e.clientY;
        self.livre.az -= dx * 0.006; self.livre.el = clamp(self.livre.el + dy * 0.004, 0.06, 1.45);
        e.preventDefault();
      });
      function soltaG(e) { gir = null; try { capa.releasePointerCapture(e.pointerId); } catch (x) {} }
      capa.addEventListener("pointerup", soltaG); capa.addEventListener("pointercancel", soltaG);
      capa.addEventListener("wheel", function (e) { if (!self.livre) return; self.livre.d = clamp(self.livre.d * (e.deltaY > 0 ? 1.1 : 1 / 1.1), self.raio * 0.6, self.raio * 8); e.preventDefault(); }, { passive: false });
      capa.addEventListener("contextmenu", function (e) { e.preventDefault(); });
      this._teclas = function (ev) {
        if (!self.ativa) return;
        var k = ev.key, tg = ev.target, tag = tg && tg.tagName ? String(tg.tagName).toLowerCase() : "";
        if (tag === "input" && tg.type !== "range" || tag === "textarea" || (tg && tg.isContentEditable)) return;
        if (k === "Escape") { if (self.gravando) { self._cancelarVideo = true; } else self.parar(); ev.preventDefault(); ev.stopPropagation(); }
        else if (self.gravando) { return; }
        else if (k === " ") { self.alternar(); ev.preventDefault(); ev.stopPropagation(); }
        else if (k === "ArrowRight") { self.irEtapa(1); ev.preventDefault(); ev.stopPropagation(); }
        else if (k === "ArrowLeft") { self.irEtapa(-1); ev.preventDefault(); ev.stopPropagation(); }
        else if (k === "v" || k === "V") { bVel.onclick(); ev.preventDefault(); ev.stopPropagation(); }
        else if (k === "Home") { self.irPara(0); ev.preventDefault(); ev.stopPropagation(); }
      };
      global.addEventListener("keydown", this._teclas, true);
    },
    _mostrarAviso: function (txt) { var u = this.ui; if (!u) return; u.aviso.style.display = txt ? "block" : "none"; if (txt) u.aviso.textContent = txt; },
    _pintarUi: function () { var u = this.ui; if (!u) return; u.bPlay.textContent = this.tocando ? "⏸" : "▶"; u.bVel.textContent = (this.vel === 0.5 ? "0,5" : this.vel) + "×"; this._atualizarBarra(); },
    _atualizarBarra: function () {
      var u = this.ui; if (!u) return;
      if (!u.tempo.matches || !u.tempo.matches(":active")) u.tempo.value = String(Math.round(this.t * 100));
      function mmss(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60); }
      var txt = mmss(this.t) + " / " + mmss(this.linha.total);
      if (u.txt.t !== txt) { u.rotT.textContent = txt; u.txt.t = txt; }
    },
    /* o HUD da vista (DOM): o terço inferior com o capítulo, os contadores, a alça da cortina */
    _pintarHud: function (W, H) {
      var u = this.ui; if (!u) return;
      var a = AP(), L = this.linha, info = a.legendaEm(L, this.t), self = this;
      if (u.etapa !== info.etapa) {
        var primeira = u.etapa == null; u.etapa = info.etapa;
        var por = function () {
          if (!self.ui) return;
          u.terco.querySelector(".ap-cap").textContent = "Capítulo " + info.n + " de " + info.de;
          u.terco.querySelector(".ap-tit").textContent = info.titulo;
          u.terco.querySelector(".ap-leg").textContent = info.legenda;
          u.vista.style.setProperty("--ap-cor", COR[info.etapa] || "#8fd3ff");
          u.terco.classList.remove("ap-troca");
        };
        var capTxt = info.n + "/" + info.de + " · " + info.titulo;
        u.cap.textContent = capTxt; u.cap.title = capTxt;
        if (primeira) por(); else { u.terco.classList.add("ap-troca"); global.setTimeout(por, 320); }
      }
      /* os contadores: existente na subida do existente; demolido da demolição em diante; construído da construção em diante; no fecho, os totais */
      var cn = info.contadores, tot = info.totais, e = info.etapa, fecho = !!(a.FECHO && a.FECHO[e]);
      var mExi = e === "existente" || fecho, mDem = (["demolicao", "construcao", "acabamentos"].indexOf(e) >= 0 || fecho) && tot.demolidoPecas > 0, mNov = (["construcao", "acabamentos"].indexOf(e) >= 0 || fecho) && tot.construidoPecas > 0;
      function pill(k, on, b, s) { var p = u.pills[k]; if (p.el.hidden === on) p.el.hidden = !on; if (!on) return; if (u.txt[k] !== b) { p.b.textContent = b; u.txt[k] = b; } if (s != null && u.txt[k + "s"] !== s) { p.s.textContent = s; u.txt[k + "s"] = s; } }
      pill("exi", mExi, fecho && tot.existenteM2 ? num1(tot.existenteM2) + " m²" : inteiro(tot.existentePecas) + " peças", fecho ? "Existente mantido" : "Existentes no lote");
      pill("dem", mDem, num1(fecho ? tot.demolidoM2 : cn.demolidoM2) + " m²", null);
      pill("nov", mNov, num1(fecho ? tot.construidoM2 : cn.construidoM2) + " m²", null);
      /* a alça da cortina: no comparar, sobre a linha, no centro da obra */
      var ln = info.cortina && info.cortina.fase === "comparar" || this.livre ? this._linhaNaTela(W, H) : null;
      if (ln && ln.p.z < 1) {
        u.alca.style.display = "block";
        var rc = this.c.renderer.domElement.getBoundingClientRect(), hr = u.vista.getBoundingClientRect();
        u.alca.style.left = (rc.left - hr.left + ln.p.x * rc.width / W) + "px"; u.alca.style.top = (rc.top - hr.top + ln.p.y * rc.height / H) + "px";
      } else if (u.alca.style.display !== "none") u.alca.style.display = "none";
    },
    alternar: function () {
      if (this.t >= this.linha.total - 0.01) { this.t = 0; this._posUsuario = null; }
      this.tocando = !this.tocando; this._ultimo = 0; this._pintarUi(); return this.tocando;
    },
    velocidade: function (v) { this.vel = v; this._pintarUi(); return v; },
    /* ir a um instante: a câmera chega lá voando (sem corte seco), menos quando se arrasta a barra de tempo */
    irPara: function (t, arrastando) {
      var t2 = clamp(+t || 0, 0, this.linha.total);
      if (!arrastando && !this.gravando && Math.abs(t2 - this.t) > 0.5) this._iniciarBlend(0.9);
      this.t = t2; this._ultimo = 0;
      if (t2 < this.linha.final.comparar.t0) this._posUsuario = null;
      if (!this.tocando) this._pintarUi();
      return this.t;
    },
    /* passa para o início do capítulo seguinte / anterior (volta ao início do atual se já passou de 1,5 s dele) */
    irEtapa: function (d) {
      var L = this.linha, a = AP(), e = a.etapaEm(L, this.t), i = L.etapas.indexOf(e);
      if (d < 0) i = (this.t - e.t0 > 1.5) ? i : i - 1; else i = i + 1;
      i = clamp(i, 0, L.etapas.length - 1);
      return this.irPara(i === L.etapas.length - 1 && d > 0 && e === L.etapas[L.etapas.length - 1] ? L.total : L.etapas[i].t0 + 0.01);
    },
    /* a posição da linha da cortina no comparar (0 = esquerda, 1 = direita); sem argumento, só lê */
    posCortina: function (f) {
      if (f != null) { this.tocando = false; this.t = this.linha.total; this._posUsuario = clamp(+f, 0, 1); this._pintarUi(); }
      var k = this.ctx && this.ctx.fecho; return k ? k.pos : null;
    },

    /* ------------------------------------------------------------- sair, restaurando tudo */
    parar: function () {
      if (!this.ativa) return false;
      var c = this.c, sv = this.sv, ctx = this.ctx, self = this;
      this.ativa = false; this.tocando = false; this._pronto = false;
      /* o tick: sai da lista */
      try { var i = c.tickExtra.indexOf(this._tickFn); if (i >= 0) c.tickExtra.splice(i, 1); c._apTick = null; } catch (e2) {}
      try { global.clearInterval(this._esconder); } catch (e3) {}
      try { global.removeEventListener("keydown", this._teclas, true); } catch (e4) {}
      if (this.ui && this.ui.vista && this.ui.vista.parentNode) this.ui.vista.parentNode.removeChild(this.ui.vista);
      this.ui = null; this.livre = null; this._blend = null; this._posUsuario = null; this._alvoAtual = null;
      /* as peças: matriz, visibilidade, material, camadas */
      if (sv) {
        sv.meshes.forEach(function (s) {
          var m = s.m; m.matrix.copy(s.matrix); m.matrixAutoUpdate = s.auto; m.matrixWorldNeedsUpdate = true; m.visible = s.visible; m.material = s.material; m.layers.mask = s.layers;
          if (s.solta === undefined) delete m.userData._solta; else m.userData._solta = s.solta;
          if (s.apSolta === undefined) delete m.userData._apSolta; else m.userData._apSolta = s.apSolta;
          if (s.oculta === undefined) delete m.userData._p10oculta; else m.userData._p10oculta = s.oculta;
          delete m.userData._apM0; delete m.userData._apP; delete m.userData._apPi; delete m.userData._apMat;
        });
        sv.films.forEach(function (s) { var m = s.m; m.matrix.copy(s.matrix); m.matrixAutoUpdate = s.auto; m.matrixWorldNeedsUpdate = true; m.visible = s.visible; m.material = s.material; delete m.userData._apM0; delete m.userData._apP; delete m.userData._apPi; });
        sv.escondidos.forEach(function (e) { e.o.visible = e.visible; });
      }
      Assumir.soltar(this.mo);
      /* o que a apresentação criou */
      if (ctx) {
        Object.keys(ctx.mat).forEach(function (k) { try { ctx.mat[k].cl.dispose(); } catch (e) {} });
        Object.keys(ctx.matLado || {}).forEach(function (k) { try { ctx.matLado[k].cl.dispose(); } catch (e) {} });
        ctx.matLado = {}; ctx.cloneDe = {}; ctx.mat = {};
        if (ctx.grupo) { ctx.grupo.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); c.scene.remove(ctx.grupo); }
      }
      /* câmera, órbita, desenho */
      if (sv && sv.cam) {
        var cam = c.camera; cam.position.copy(sv.cam.pos); cam.up.copy(sv.cam.up); cam.fov = sv.cam.fov; cam.near = sv.cam.near; cam.far = sv.cam.far; cam.aspect = sv.cam.aspect;
        if (c.orbit && sv.cam.alvo) c.orbit.target.copy(sv.cam.alvo);
        cam.quaternion.copy(sv.cam.quat); cam.updateProjectionMatrix();
        if (c.orbit && sv.orbit) { c.orbit.enabled = sv.orbit.enabled; try { c.orbit.update(); } catch (eO) {} }
      }
      try { c.principalOculta(!!sv.principal); } catch (e6) {}
      try { if (sv) c.renderer.localClippingEnabled = !!sv.clipLocal; } catch (e6b) {}
      try { c.renderer.setPixelRatio(sv.tam.pr); } catch (e7) {}
      /* a interface volta (o layout na hora — o renderer mede o tamanho certo —, a animação de volta depois) */
      try { Recolher.desligar(c); } catch (e7b) {}
      try { if (c.redimensionar) c.redimensionar(); } catch (e8) {}
      /* a vista de fase como estava, e o estilo */
      try { var p = P10(); p.definirVista({ fase: sv.vista.fase, filtro: sv.vista.filtro, modo: sv.vista.modo || undefined, realce: sv.vista.realce }); } catch (e9) {}
      try { if (sv.estilo && global.BIM && global.BIM.estiloVisual) { var atual = global.BimEstilo && global.BimEstilo.estado ? global.BimEstilo.estado() : null; if (!atual || atual.modo !== sv.estilo) global.BIM.estiloVisual(sv.estilo, { naoGravar: true }); } } catch (e10) {}
      this.ctx = null; this.sv = null; this.c = null; this.mo = null;
      try { Ui.aoVista(); } catch (e11) {}
      status("Apresentação encerrada: a cena voltou como estava.");
      return true;
    },

    /* ------------------------------------------------------------- exportar o vídeo */
    /* opts: { largura:1920, altura:1080, fps:30, bitrate, de, ate (s), aoAndar(i,n), baixar:true } → Promise { ok, blob, bytes, ext, quadros, ... } */
    exportarVideo: function (opts) {
      opts = opts || {};
      var self = this, BV = global.BimVideo;
      if (!this.ativa || !this.ctx) return Promise.resolve({ ok: false, motivo: "A apresentação não está aberta." });
      if (this.gravando) return Promise.resolve({ ok: false, motivo: "Já está gravando." });
      var sup = BV && BV.suportado ? BV.suportado() : (typeof global.MediaRecorder !== "undefined" ? { ok: true, mime: "video/webm", ext: "webm", nome: "WebM" } : { ok: false, motivo: "Este navegador não sabe gravar vídeo (falta o MediaRecorder)." });
      if (!sup.ok) { toast(sup.motivo, "erro"); return Promise.resolve({ ok: false, motivo: sup.motivo }); }
      var W = opts.largura || 1920, H = opts.altura || 1080, fps = opts.fps || 30, L = this.linha;
      var de = clamp(opts.de != null ? +opts.de : 0, 0, L.total), ate = clamp(opts.ate != null ? +opts.ate : L.total, de + 0.1, L.total);
      var N = Math.max(2, Math.round((ate - de) * fps));
      var cnv = document.createElement("canvas"); cnv.width = W; cnv.height = H;
      var stream; try { stream = cnv.captureStream(0); } catch (e) { return Promise.resolve({ ok: false, motivo: "Este navegador não deixa gravar o conteúdo da tela." }); }
      var trilha = stream.getVideoTracks()[0];
      if (!trilha || typeof trilha.requestFrame !== "function") { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e1) {} return Promise.resolve({ ok: false, motivo: "Este navegador não deixa controlar os quadros da gravação — o vídeo sairia em branco." }); }
      var op = { videoBitsPerSecond: Math.round(opts.bitrate || 12000000) }; if (sup.mime) op.mimeType = sup.mime;
      var rec; try { rec = new global.MediaRecorder(stream, op); } catch (e2) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e3) {} return Promise.resolve({ ok: false, motivo: "Não consegui iniciar o gravador: " + e2.message }); }
      var pedacos = [];
      rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) pedacos.push(ev.data); };
      this.gravando = true; this._cancelarVideo = false;
      var tocava = this.tocando; this.tocando = false;
      var u = this.ui, tOrig = this.t, c = this.c, r = c.renderer, szAntes = r.getSize(new (THR()).Vector2()), prAntes = r.getPixelRatio(), aspAntes = c.camera.aspect;
      /* enquanto grava, a vista mostra o quadro do vídeo reduzido e o progresso (a cena está em 1920×1080 fora da tela) */
      var grav = null, pre = null;
      if (u && u.vista) { grav = document.createElement("div"); grav.className = "ap-grav"; grav.innerHTML = '<canvas></canvas><div class="ap-grav-trilho"><i></i></div><div class="ap-grav-txt"></div>'; u.vista.appendChild(grav); var pc = grav.querySelector("canvas"); pc.width = 960; pc.height = 540; pre = pc.getContext("2d"); }
      return new Promise(function (resolve) {
        var terminado = false, i = 0, t0Real = Date.now(), intervalo = 1000 / fps;
        rec.onstop = function () {
          terminado = true;
          try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
          /* devolve a cena à tela */
          try { r.setPixelRatio(prAntes); r.setSize(szAntes.x, szAntes.y, false); c.camera.aspect = aspAntes; c.camera.updateProjectionMatrix(); } catch (e4) {}
          try { if (grav && grav.parentNode) grav.parentNode.removeChild(grav); } catch (eG) {}
          self.gravando = false; self.t = tOrig; self.tocando = tocava; self._ultimo = 0; self._mostrarAviso(null); self._pintarUi();
          var blob = new global.Blob(pedacos, { type: sup.mime || "video/webm" });
          var res = { ok: !!blob.size && !self._cancelarVideo, cancelado: !!self._cancelarVideo, blob: blob, bytes: blob.size, ext: sup.ext || "webm", nome: sup.nome, mime: sup.mime, quadros: i, de: de, ate: ate, fps: fps, largura: W, altura: H, ms: Date.now() - t0Real };
          if (res.ok && opts.baixar !== false) self._baixar(blob, res.ext);
          if (res.cancelado) toast("Gravação cancelada.", "info"); else if (res.ok) toast("Vídeo pronto (" + (blob.size / 1048576).toFixed(1).replace(".", ",") + " MB): " + res.ext.toUpperCase() + " " + W + "×" + H + ".", "ok");
          resolve(res);
        };
        rec.start();
        var passo = function () {
          if (self._cancelarVideo || i >= N || !self.ativa) { try { rec.stop(); } catch (e) {} return; }
          var ini = Date.now();
          try {
            var t = de + i / fps;
            self.t = t; self.quadro(t, W, H, cnv);
            trilha.requestFrame();
            if (pre) {
              pre.drawImage(cnv, 0, 0, 960, 540);
              grav.querySelector("i").style.width = Math.round(i / N * 100) + "%";
              grav.querySelector(".ap-grav-txt").textContent = "Gravando o vídeo " + Math.round(i / N * 100) + "% — " + (de + i / fps).toFixed(1).replace(".", ",") + " s de " + ate.toFixed(0) + " s · Esc cancela";
            }
          } catch (e5) { if (global.console) console.error("[apresentacao/video]", e5); }
          i++;
          if (typeof opts.aoAndar === "function") { try { opts.aoAndar(i, N); } catch (e6) {} }
          /* ⚠ setTimeout (não requestAnimationFrame): a gravação anda com a aba escondida; e o intervalo mantém o vídeo em tempo real */
          global.setTimeout(passo, Math.max(0, intervalo - (Date.now() - ini)));
        };
        global.setTimeout(passo, 30);
      });
    },
    _baixar: function (blob, ext) {
      try {
        var url = global.URL.createObjectURL(blob), a = document.createElement("a");
        var nome = String(this.linha.titulo || "reforma").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "reforma";
        a.href = url; a.download = "Apresentacao-" + nome + "." + ext; a.style.display = "none"; document.body.appendChild(a); a.click();
        global.setTimeout(function () { try { document.body.removeChild(a); global.URL.revokeObjectURL(url); } catch (e) {} }, 4000);
      } catch (e) {}
    }
  };

  /* ================================================================== O HUD DO VÍDEO */
  /* o mesmo desenho do HUD da vista (terço inferior, contadores, marca, alça da cortina), em canvas — é o que vai para o vídeo */
  var Hud = {
    desenhar: function (g, W, H, ap) {
      var a = AP(), L = ap.linha, t = ap.t, s = H / 1080, info = a.legendaEm(L, t), cor = COR[info.etapa] || "#8fd3ff", e = L.porEtapa[info.etapa], tEt = t - e.t0;
      var F = "Segoe UI, Arial, sans-serif";
      function caixa(x, y, w, h, r, fill) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fillStyle = fill; g.fill(); }
      g.save();
      g.textBaseline = "alphabetic";
      /* vinheta e sombra de baixo (as mesmas da vista) */
      var gv = g.createRadialGradient(W / 2, H * 0.46, H * 0.35, W / 2, H * 0.46, H * 0.95); gv.addColorStop(0, "rgba(6,12,24,0)"); gv.addColorStop(1, "rgba(6,12,24,.30)"); g.fillStyle = gv; g.fillRect(0, 0, W, H);
      var gs = g.createLinearGradient(0, H - 300 * s, 0, H); gs.addColorStop(0, "rgba(6,12,24,0)"); gs.addColorStop(1, "rgba(6,12,24,.42)"); g.fillStyle = gs; g.fillRect(0, H - 300 * s, W, 300 * s);
      /* a obra (alto, à esquerda) e a marca (alto, à direita) */
      g.shadowColor = "rgba(0,0,0,.55)"; g.shadowBlur = 6 * s;
      g.fillStyle = "rgba(255,255,255,.9)"; g.font = "600 " + Math.round(19 * s) + "px " + F; g.textAlign = "left";
      var tit = String(L.titulo || "").toUpperCase(); g.fillText(tit.length > 60 ? tit.slice(0, 59) + "…" : tit, 44 * s, 52 * s);
      g.textAlign = "right"; g.fillStyle = "rgba(255,255,255,.75)"; g.font = "700 " + Math.round(18 * s) + "px " + F; g.fillText(MARCA, W - 40 * s, 52 * s);
      g.shadowBlur = 0;
      /* o terço inferior: capítulo, título, legenda */
      var entra = suave(tEt / 0.6), x0 = 44 * s, y1 = H - 64 * s, wT = Math.min(900 * s, W * 0.56), hT = 150 * s, y0 = y1 - hT;
      g.globalAlpha = entra;
      caixa(x0, y0 + (1 - entra) * 14 * s, wT, hT, 16 * s, "rgba(12,20,34,.62)");
      g.fillStyle = cor; g.fillRect(x0, y0 + (1 - entra) * 14 * s + 14 * s, 5 * s, hT - 28 * s);
      g.textAlign = "left"; g.fillStyle = "rgba(255,255,255,.72)"; g.font = "600 " + Math.round(17 * s) + "px " + F;
      g.fillText(("Capítulo " + info.n + " de " + info.de).toUpperCase(), x0 + 30 * s, y0 + 40 * s + (1 - entra) * 14 * s);
      g.fillStyle = "#fff"; g.font = "600 " + Math.round(38 * s) + "px " + F; g.fillText(info.titulo, x0 + 30 * s, y0 + 84 * s + (1 - entra) * 14 * s);
      g.fillStyle = "rgba(255,255,255,.86)"; g.font = "400 " + Math.round(22 * s) + "px " + F;
      var leg = info.legenda; while (leg.length > 8 && g.measureText(leg).width > wT - 60 * s) leg = leg.slice(0, -2);
      if (leg !== info.legenda) leg = leg.replace(/\s+\S*$/, "") + "…";
      g.fillText(leg, x0 + 30 * s, y0 + 122 * s + (1 - entra) * 14 * s);
      g.globalAlpha = 1;
      /* os contadores (as mesmas regras da vista) */
      var cn = info.contadores, tot = info.totais, et = info.etapa, fecho = !!(a.FECHO && a.FECHO[et]), pills = [];
      if (et === "existente" || fecho) pills.push([fecho && tot.existenteM2 ? num1(tot.existenteM2) + " m²" : inteiro(tot.existentePecas) + " peças", fecho ? "EXISTENTE MANTIDO" : "EXISTENTES NO LOTE", "#cfe0f5"]);
      if ((["demolicao", "construcao", "acabamentos"].indexOf(et) >= 0 || fecho) && tot.demolidoPecas > 0) pills.push([num1(fecho ? tot.demolidoM2 : cn.demolidoM2) + " m²", "DEMOLIDO", "#ff6b60"]);
      if ((["construcao", "acabamentos"].indexOf(et) >= 0 || fecho) && tot.construidoPecas > 0) pills.push([num1(fecho ? tot.construidoM2 : cn.construidoM2) + " m²", "CONSTRUÍDO", "#56e09a"]);
      var xr = W - 40 * s, wp = 190 * s, hp = 86 * s;
      for (var i = pills.length - 1; i >= 0; i--) {
        var px = xr - wp;
        caixa(px, y1 - hp, wp, hp, 14 * s, "rgba(12,20,34,.62)");
        g.fillStyle = pills[i][2]; g.fillRect(px + 14 * s, y1 - hp, wp - 28 * s, 3 * s);
        g.textAlign = "right"; g.fillStyle = "#fff"; g.font = "600 " + Math.round(32 * s) + "px " + F; g.fillText(pills[i][0], px + wp - 18 * s, y1 - hp + 46 * s);
        g.fillStyle = "rgba(255,255,255,.74)"; g.font = "600 " + Math.round(14 * s) + "px " + F; g.fillText(pills[i][1], px + wp - 18 * s, y1 - hp + 70 * s);
        xr = px - 12 * s;
      }
      /* a alça da cortina no comparar (o mesmo círculo da vista) */
      var k = info.cortina;
      if (k && k.fase === "comparar") {
        var ln = ap._linhaNaTela(W, H);
        if (ln && ln.p.z < 1) {
          var cx = ln.p.x, cy = ln.p.y, R = 22 * s;
          g.beginPath(); g.arc(cx, cy, R + 6 * s, 0, Math.PI * 2); g.fillStyle = "rgba(143,211,255,.38)"; g.fill();
          g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fillStyle = "#fff"; g.fill();
          g.fillStyle = "#1d2b44"; g.font = "700 " + Math.round(20 * s) + "px " + F; g.textAlign = "center"; g.fillText("⇔", cx, cy + 7 * s);
          g.font = "600 " + Math.round(15 * s) + "px " + F;
          var wa = g.measureText("ANTES").width + 22 * s, wd = g.measureText("DEPOIS").width + 22 * s;
          caixa(cx - R - 14 * s - wa, cy - 15 * s, wa, 30 * s, 6 * s, "rgba(12,20,34,.72)"); caixa(cx + R + 14 * s, cy - 15 * s, wd, 30 * s, 6 * s, "rgba(36,128,78,.86)");
          g.fillStyle = "#fff"; g.textAlign = "left"; g.fillText("ANTES", cx - R - 14 * s - wa + 11 * s, cy + 6 * s); g.fillText("DEPOIS", cx + R + 14 * s + 11 * s, cy + 6 * s);
        }
      }
      /* o progresso, fino, no pé do quadro */
      g.fillStyle = "rgba(255,255,255,.16)"; g.fillRect(0, H - 4 * s, W, 4 * s);
      g.fillStyle = cor; g.fillRect(0, H - 4 * s, W * clamp(t / L.total, 0, 1), 4 * s);
      g.restore();
    }
  };

  Ui.Hud = Hud;
  Ui.Apres = Apres;   /* o estado da apresentação (js/bimabrirui.js liga o modo Abrir portas enquanto ela roda) */
  global.BimApresentacaoUI = Ui;
  if (typeof module !== "undefined" && module.exports) module.exports = Ui;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
