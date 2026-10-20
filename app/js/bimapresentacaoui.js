/* =====================================================================
 * bimapresentacaoui.js — a TELA do ANTES / DEPOIS e da APRESENTAÇÃO DA REFORMA.
 *
 * O que decide é o motor puro js/bimapresentacao.js; as fases e o filtro de fase são os do
 * js/bimfases.js + js/bimp10ui.js (BimP10UI.definirModo/definirVista) — aqui não há um segundo jeito de
 * filtrar. Este arquivo só faz a fiação e a cena:
 *
 *  1. CONTROLE ANTES · OBRA · DEPOIS · COMPARAR na barra da vista (a mesma barra da {3D} e das plantas 2D),
 *     com atalho Alt+1…4. Só aparece quando o modelo tem fases. COMPARAR = a CORTINA: metade da tela o ANTES,
 *     metade o DEPOIS, com a divisória arrastável (a cena é desenhada duas vezes, cada uma com o seu
 *     recorte — o renderer do BIM ganha um desenho duplo enquanto a cortina estiver ligada).
 *  2. APRESENTAÇÃO DA REFORMA: tela cheia sem a interface, câmera em órbita, legendas e contadores,
 *     a planta no chão, as paredes que sobem, a demolição, a construção, os acabamentos e o antes × depois.
 *     Tudo é função do tempo t (arrastar a barra de tempo funciona em qualquer ponto). Sai restaurando a
 *     cena EXATAMENTE como estava (visibilidade, matrizes, materiais, câmera, estilo, vista de fase).
 *  3. EXPORTAR VÍDEO: 1920×1080, WebM (ou MP4 se o navegador gravar), quadro a quadro com tempo fixo.
 *
 * ⚠ AS PEÇAS DO EDITOR SÓ APARECEM NA TELA PELA MALHA MESCLADA (js/bimagreg.js, vértices com a matriz assada):
 *   mexer na matriz ou na visibilidade da peça não muda nada ali. Quem anima (cortina e apresentação) marca a
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

  /* ================================================================== A CORTINA (comparar) E O DESENHO DUPLO */
  var Duplo = {
    on: false, frac: 0.5, _orig: null, _r: null, lado: null, _dx: 0,
    /* lado(l) põe a cena como o lado l ("a" = antes, "d" = depois) a vê; antes(): guarda; depois(): devolve */
    ligar: function (c, lado, aposPasse) {
      if (!c || !lado) return false;
      this.desligar();
      var self = this, r = c.renderer, THREE = THR();
      this._r = r; this._orig = r.render; this.lado = lado; this.on = true;
      var v2 = new THREE.Vector2();
      r.render = function (scene, camera) {
        if (!self.on) return self._orig.call(r, scene, camera);
        r.getSize(v2);
        var w = v2.x, h = v2.y, x = Math.round(clamp(self.frac, 0.0, 1.0) * w);
        var prevTest = r.getScissorTest();
        r.setScissorTest(true);
        try {
          if (x > 0) { r.setScissor(0, 0, x, h); self.lado.entrar("a"); self._orig.call(r, scene, camera); }
          if (x < w) { r.setScissor(x, 0, w - x, h); self.lado.entrar("d"); self._orig.call(r, scene, camera); }
        } finally { self.lado.sair(); r.setScissorTest(prevTest); }
      };
      return true;
    },
    desligar: function () {
      /* ⚠ no three r150 o `render` é propriedade PRÓPRIA do renderer (criada no construtor), não do protótipo: devolve-se a função guardada */
      if (this._r && this._orig) this._r.render = this._orig;
      this._r = null; this._orig = null; this.on = false; this.lado = null;
    }
  };

  /* a cortina do modo COMPARAR: as marcas { a, d } de cada peça vêm do BimP10UI (userData._p10lado) */
  var Cortina = {
    el: null, mo: null,
    ligada: function () { return Duplo.on && Duplo.lado && Duplo.lado.id === "cortina"; },
    ligar: function () {
      var c = cena(), mo = modeloEditor(c); if (!c || !mo) return false;
      this.desligar();
      var self = this, THREE = THR(), scene = c.scene;
      this.mo = mo;
      var pisos = scene.getObjectByName("acab-pisos"), pint = scene.getObjectByName("p4-pinturas");
      var porId = {};
      function reunir() {
        var l = Assumir.pegar(mo), vis = {};
        porId = {}; l.forEach(function (m) { porId[String(m.userData.expressID)] = m; });
        return l;
      }
      var meshes = reunir();
      var lado = {
        id: "cortina",
        entrar: function (k) {
          meshes.forEach(function (m) { var ld = m.userData._p10lado; if (ld && !m.userData._p10oculta) { m.visible = !!ld[k]; m.layers.enable(0); } });
          if (pint) pint.children.forEach(function (f) { var b = porId[String(f.userData.p4Pintura)]; var ld = b && b.userData._p10lado; f.visible = ld ? !!ld[k] : (b ? b.visible !== false : true); });
          if (pisos) pisos.children.forEach(function (f) { f.visible = k === "d"; });
        },
        sair: function () {
          meshes.forEach(function (m) { if (m.userData._p10lado && !m.userData._p10oculta) m.visible = true; });
          if (pint) pint.children.forEach(function (f) { f.visible = true; });
          if (pisos) pisos.children.forEach(function (f) { f.visible = true; });
        },
        reunir: function () { meshes = reunir(); }
      };
      this._lado = lado;
      Duplo.ligar(c, lado);
      this._montarDivisoria(c);
      return true;
    },
    /* o modelo foi refeito (op, Ctrl+Z): as malhas novas entram na cortina */
    reaplicar: function () {
      if (!this.ligada()) return;
      var c = cena(), mo = modeloEditor(c); if (!c || !mo) return;
      Assumir.soltar(this.mo); this.mo = mo;
      this._lado.reunir();
    },
    desligar: function () {
      if (Duplo.on && Duplo.lado && Duplo.lado.id === "cortina") Duplo.desligar();
      if (this.mo) Assumir.soltar(this.mo);
      this.mo = null; this._lado = null;
      if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
      this.el = null;
      if (this._h) { try { global.removeEventListener("resize", this._h); } catch (e) {} this._h = null; }
    },
    _montarDivisoria: function (c) {
      var host = c.renderer.domElement.parentNode, self = this;
      if (!host) return;
      var el = document.createElement("div");
      el.setAttribute("data-ap-cortina", "1");
      el.style.cssText = "position:absolute;top:0;bottom:0;width:30px;margin-left:-15px;z-index:7;cursor:ew-resize;touch-action:none;";
      el.innerHTML = '<div style="position:absolute;left:14px;top:0;bottom:0;width:2px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.35)"></div>' +
        '<div style="position:absolute;left:3px;top:50%;margin-top:-12px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.45);font:700 13px/24px Segoe UI,Arial;text-align:center;color:#25324a">⇔</div>' +
        '<div style="position:absolute;top:10px;right:20px;white-space:nowrap;background:rgba(20,30,50,.72);color:#fff;font:600 12px Segoe UI,Arial;padding:3px 8px;border-radius:4px">ANTES</div>' +
        '<div style="position:absolute;top:10px;left:20px;white-space:nowrap;background:rgba(20,30,50,.72);color:#fff;font:600 12px Segoe UI,Arial;padding:3px 8px;border-radius:4px">DEPOIS</div>';
      host.appendChild(el); this.el = el;
      function posicionar() { var rc = c.renderer.domElement.getBoundingClientRect(), hr = host.getBoundingClientRect(); el.style.left = (rc.left - hr.left + Duplo.frac * rc.width) + "px"; el.style.top = (rc.top - hr.top) + "px"; el.style.height = rc.height + "px"; }
      this._pos = posicionar; posicionar();
      this._h = posicionar; global.addEventListener("resize", this._h);
      var arrastando = false;
      el.addEventListener("pointerdown", function (e) { arrastando = true; try { el.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault(); e.stopPropagation(); });
      el.addEventListener("pointermove", function (e) {
        if (!arrastando) return;
        var rc = c.renderer.domElement.getBoundingClientRect();
        Duplo.frac = clamp((e.clientX - rc.left) / rc.width, 0.02, 0.98); posicionar(); e.preventDefault();
      });
      function solta(e) { arrastando = false; try { el.releasePointerCapture(e.pointerId); } catch (x) {} }
      el.addEventListener("pointerup", solta); el.addEventListener("pointercancel", solta);
      /* o desenho duplo só roda quando o 3D desenha: a divisória fica junto da vista */
      var obs = global.setInterval(function () { if (!self.el) { global.clearInterval(obs); return; } posicionar(); }, 700);
    },
    posicao: function (f) { if (f != null) { Duplo.frac = clamp(+f, 0.02, 0.98); if (this._pos) this._pos(); } return Duplo.frac; }
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
    Duplo: Duplo, Cortina: Cortina, Assumir: Assumir,
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
      ap.type = "button"; ap.setAttribute("data-ad", "apresentar"); ap.title = "Apresentação da reforma: a planta, a demolição e a construção em animação, para o cliente (tela cheia, exporta vídeo)";
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
      if (Cortina.ligada()) { Cortina.reaplicar(); }
      else if (this.modo() === "comparar" && this.temFases()) this._sincronizarCortina();
    },
    /* a vista de fase mudou (qualquer caminho): liga/desliga a cortina e repinta o controle */
    aoVista: function () {
      this.atualizar();
      this._sincronizarCortina();
    },
    _sincronizarCortina: function () {
      var comparar = this.modo() === "comparar" && this.temFases() && !Apres.ativa;
      if (comparar && !Cortina.ligada()) { if (Cortina.ligar()) status("Comparar: arraste a divisória — à esquerda o ANTES, à direita o DEPOIS."); }
      else if (!comparar && Cortina.ligada()) Cortina.desligar();
    },
    definirModo: function (modo) {
      var p = P10();
      if (!p) return null;
      if (Apres.ativa) return null;
      if (!this.temFases()) { toast(AP() ? AP().MENSAGEM_SEM_FASES : "Sem fases.", "aviso"); return null; }
      var atual = this.modo();
      /* a cortina é do 3D: com uma planta na frente, o Comparar leva à {3D} primeiro */
      if (modo === "comparar" && atual !== "comparar") { try { var G = this._G || global.Gestao, at = G && G._bimVxEst ? G._bimVxEst().ativa : "3d"; if (at && at !== "3d" && G._bimVxAtivar) G._bimVxAtivar("3d"); } catch (eV) {} }
      var r = p.definirModo(modo === atual && modo === "comparar" ? "depois" : modo);   /* clicar de novo em Comparar sai da cortina */
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
        { id: "apresentar-reforma", rotulo: "Apresentação\nda reforma", icone: "apresentar", grande: true, dica: "Apresentação da reforma para o cliente: a planta baixa do existente no chão, as paredes subindo, o que sai (demolição) e o que entra (construção) em animação, os acabamentos e o antes × depois — tela cheia, com legendas e contadores de m². Exporta vídeo 1920×1080. Precisa de um modelo com fases (Existente / Construção nova)." }
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
  var COR = { planta: "#2d7ff9", existente: "#8aa0b8", demolicao: "#ff3b30", construcao: "#2fbf71", acabamentos: "#ffb020", final: "#ffffff" };
  var MARCA = "OrçaPRO";

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
      Cortina.desligar();
      this.ativa = true; this.c = c; this.mo = mo; this.linha = linha; this.t = 0; this.tocando = false; this.vel = 1; this.info = info; this.opcoes = opts;
      this._salvar(c, mo);
      this._preparar(c, mo, info, linha);
      this._montarUi();
      var self = this;
      this._pronto = false;
      /* o estilo Realista (a casa pronta com material de verdade): carrega as texturas antes de começar */
      var pEst = null;
      try { if (opts.estilo !== false && global.BIM && global.BIM.estiloVisual) pEst = global.BIM.estiloVisual("realista", { naoGravar: true }); } catch (eE) { pEst = null; }
      this._mostrarAviso("Preparando a apresentação…");
      var comecar = function () {
        if (!self.ativa) return;
        self._pronto = true; self._mostrarAviso(null);
        self._registrarTick();
        self.t = opts.inicio != null ? clamp(+opts.inicio, 0, linha.total) : 0;
        self.tocando = opts.tocar !== false;
        self._ultimo = 0;
        self._pintarUi();
      };
      if (pEst && pEst.then) pEst.then(function () { global.setTimeout(comecar, 200); }, function () { comecar(); }); else comecar();
      return { ok: true, linha: linha };
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
      this.sv = sv;
    },

    /* ------------------------------------------------------------- preparar a cena */
    _preparar: function (c, mo, info, linha) {
      var THREE = THR(), p = P10(), self = this;
      /* 2) as peças desenhadas por si */
      var meshes = Assumir.pegar(mo);
      c.modelRoot.updateMatrixWorld(true);
      var ctx = { meshes: meshes, porId: info.porId, films: [], mat: {}, estado: {}, particulas: null, plano: null };
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
      var orig = m.userData._apMat || m.material, cl = orig.clone();
      o = ctx.mat[m.uuid] = { orig: orig, cl: cl, cor: orig.color ? orig.color.clone() : null, emi: orig.emissive ? orig.emissive.clone() : null, emiI: orig.emissiveIntensity, op: orig.opacity, tr: orig.transparent, dw: orig.depthWrite };
      m.userData._apMat = orig;
      return o;
    },
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
      var o = this.ctx.mat[m.uuid]; if (!o) return;
      if (m.material !== o.orig) m.material = o.orig;
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
      this._aplicarLados(t);
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

    /* ------------------------------------------------------------- o antes × depois do final (cortina na apresentação) */
    _aplicarLados: function (t) {
      var L = this.linha, ctx = this.ctx, comparar = t >= L.final.comparar.t0;
      ctx.comparar = comparar;
      if (!comparar) { if (Duplo.on && Duplo.lado && Duplo.lado.id === "apresentacao") Duplo.desligar(); return; }
      var self = this;
      if (!ctx.lados) { var a = AP(), p = P10(); ctx.lados = a.lados(p.estado(), p.deps()); }
      if (!Duplo.on) {
        var lado = {
          id: "apresentacao",
          entrar: function (k) {
            var ids = ctx.porId, ld = ctx.lados.porId;
            Object.keys(ids).forEach(function (id) {
              var l = ld[id], vis = l ? !!l[k] : true;
              ids[id].meshes.forEach(function (m) { m.visible = vis; if (vis) m.layers.enable(0); });
            });
            ctx.films.forEach(function (f) { var l = f.base ? ld[f.base] : null; f.m.visible = f.tipo === "piso" ? k === "d" : (l ? !!l[k] : true); });
          },
          sair: function () {
            Object.keys(ctx.porId).forEach(function (id) { var l = ctx.lados.porId[id], vis = l ? (l.d) : true; ctx.porId[id].meshes.forEach(function (m) { m.visible = vis; }); });
          }
        };
        Duplo.ligar(this.c, lado);
      }
      /* a divisória passeia de leve em volta do centro da casa na tela (onde o antes e o depois se encontram) */
      var u = clamp((t - L.final.comparar.t0) / L.final.comparar.dur, 0, 1), cam = this.c.camera, pc = this.centro.clone().project(cam);
      var meio = clamp((pc.x + 1) / 2, 0.35, 0.65);
      Duplo.frac = clamp(meio + 0.07 * Math.sin(u * Math.PI * 2), 0.2, 0.8);
      ctx.fracCompara = Duplo.frac;
    },

    /* ------------------------------------------------------------- a câmera */
    _camera: function (t) {
      var a = AP(), THREE = THR(), c = this.c, k = a.camera(this.linha, t), cam = c.camera;
      var fov = 38, asp = cam.aspect || 1.6, vfov = fov * Math.PI / 180, hfov = 2 * Math.atan(Math.tan(vfov / 2) * asp);
      var d0 = this.raio / Math.sin(Math.min(vfov, hfov) / 2) * 0.92, d = d0 * k.d, el = k.el * Math.PI / 180;
      cam.fov = fov; cam.near = 0.2; cam.far = 800; cam.up.set(0, 1, 0);
      cam.position.set(this.centro.x + d * Math.sin(k.az) * Math.cos(el), this.centro.y + d * Math.sin(el), this.centro.z + d * Math.cos(k.az) * Math.cos(el));
      cam.lookAt(this.centro);
      if (c.orbit) c.orbit.target.copy(this.centro);
      cam.updateProjectionMatrix();
    },

    /* ------------------------------------------------------------- um quadro: estado + câmera + desenho */
    quadro: function (t, W, H, alvo2d) {
      var c = this.c, r = c.renderer, cam = c.camera;
      if (!this.ctx) return false;
      var sz = r.getSize(new (THR()).Vector2());
      if (Math.round(sz.x) !== W || Math.round(sz.y) !== H) { r.setPixelRatio(1); r.setSize(W, H, false); }
      if (Math.abs(cam.aspect - W / H) > 1e-4) { cam.aspect = W / H; cam.updateProjectionMatrix(); }
      this._camera(t);
      this.aplicar(t);
      if (this.ctx.particulas) this.ctx.particulas.mat.uniforms.uEscala.value = H * 0.62;   /* a poeira tem o mesmo tamanho na tela e no vídeo 1920×1080 */
      c.scene.updateMatrixWorld(true);
      r.render(c.scene, cam);
      if (alvo2d) {
        var g = alvo2d.getContext("2d");
        /* o céu: o renderer é transparente (o BIM põe o fundo por trás do canvas) — aqui o fundo entra no quadro */
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
      var pos = function () { };
      this._tickFn = fn;
    },
    _erro: function (e) { if (global.console && console.error) console.error("[apresentacao]", e); this._mostrarAviso("Erro na apresentação: " + (e && e.message ? e.message : e)); this.tocando = false; },
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
      var tela = this.ui && this.ui.tela;
      if (!tela) return;
      var W = tela.width, H = tela.height;
      this.quadro(this.t, W, H, tela);
      this._atualizarBarra();
    },

    /* ------------------------------------------------------------- a interface (tela cheia) */
    _montarUi: function () {
      var self = this, c = this.c, L = this.linha;
      var raiz = document.createElement("div");
      raiz.setAttribute("data-ap-raiz", "1");
      raiz.style.cssText = "position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483000;background:#000;color:#fff;font-family:'Segoe UI',Arial,sans-serif;overflow:hidden;user-select:none";
      var tela = document.createElement("canvas");
      tela.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;display:block";
      var W = Math.max(640, global.innerWidth || 1280), H = Math.max(360, global.innerHeight || 720);
      tela.width = W; tela.height = H;
      raiz.appendChild(tela);
      var aviso = document.createElement("div");
      aviso.style.cssText = "position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);padding:14px 22px;background:rgba(10,18,32,.78);border-radius:10px;font-size:20px;display:none";
      raiz.appendChild(aviso);
      var barra = document.createElement("div");
      barra.setAttribute("data-ap-barra", "1");
      barra.style.cssText = "position:absolute;left:0;right:0;bottom:0;padding:10px 18px 14px;background:linear-gradient(0deg,rgba(0,0,0,.72),rgba(0,0,0,0));display:flex;align-items:center;gap:10px;transition:opacity .35s;font-size:14px";
      function btn(id, rot, tit) { var b = document.createElement("button"); b.type = "button"; b.setAttribute("data-ap", id); b.textContent = rot; b.title = tit || ""; b.style.cssText = "background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.3);border-radius:7px;padding:5px 11px;font:inherit;cursor:pointer;min-width:34px"; return b; }
      var bAnt = btn("anterior", "⏮", "Etapa anterior (←)"), bPlay = btn("play", "⏸", "Reproduzir / pausar (Espaço)"), bProx = btn("proxima", "⏭", "Próxima etapa (→)");
      var bVel = btn("vel", "1×", "Velocidade: 0,5× · 1× · 2× (V)");
      var tempo = document.createElement("input"); tempo.type = "range"; tempo.min = "0"; tempo.max = String(Math.round(L.total * 100)); tempo.value = "0"; tempo.setAttribute("data-ap", "tempo"); tempo.style.cssText = "flex:1;accent-color:#ff9f1c;cursor:pointer"; tempo.title = "Arraste para ir a qualquer ponto";
      var rotT = document.createElement("span"); rotT.setAttribute("data-ap", "rotulo"); rotT.style.cssText = "min-width:86px;text-align:right;opacity:.85;font-variant-numeric:tabular-nums";
      var bVid = btn("video", "⬇ Exportar vídeo", "Grava a apresentação em 1920×1080 (WebM ou MP4) e baixa o arquivo");
      var bSair = btn("sair", "✕ Sair", "Sair da apresentação (Esc)");
      [bAnt, bPlay, bProx, bVel, tempo, rotT, bVid, bSair].forEach(function (e) { barra.appendChild(e); });
      raiz.appendChild(barra);
      document.body.appendChild(raiz);
      this.ui = { raiz: raiz, tela: tela, barra: barra, aviso: aviso, bPlay: bPlay, tempo: tempo, rotT: rotT, bVel: bVel, ultimoMov: Date.now() };
      /* eventos */
      bPlay.onclick = function () { self.alternar(); };
      bAnt.onclick = function () { self.irEtapa(-1); };
      bProx.onclick = function () { self.irEtapa(1); };
      bVel.onclick = function () { self.velocidade(self.vel === 1 ? 2 : (self.vel === 2 ? 0.5 : 1)); };
      bSair.onclick = function () { self.parar(); };
      bVid.onclick = function () { self.exportarVideo(); };
      tempo.oninput = function () { self.irPara(+tempo.value / 100); };
      this._moveu = function () { self.ui.ultimoMov = Date.now(); barra.style.opacity = "1"; raiz.style.cursor = "default"; };
      raiz.addEventListener("mousemove", this._moveu);
      this._esconder = global.setInterval(function () { if (!self.ui) return; if (Date.now() - self.ui.ultimoMov > 3200 && self.tocando && !self.gravando) { barra.style.opacity = "0"; raiz.style.cursor = "none"; } }, 600);
      this._teclas = function (ev) {
        if (!self.ativa) return;
        var k = ev.key;
        if (k === "Escape") { if (self.gravando) { self._cancelarVideo = true; } else self.parar(); ev.preventDefault(); ev.stopPropagation(); }
        else if (self.gravando) { return; }
        else if (k === " ") { self.alternar(); ev.preventDefault(); ev.stopPropagation(); }
        else if (k === "ArrowRight") { self.irEtapa(1); ev.preventDefault(); ev.stopPropagation(); }
        else if (k === "ArrowLeft") { self.irEtapa(-1); ev.preventDefault(); ev.stopPropagation(); }
        else if (k === "v" || k === "V") { bVel.onclick(); ev.preventDefault(); ev.stopPropagation(); }
        else if (k === "Home") { self.irPara(0); ev.preventDefault(); ev.stopPropagation(); }
      };
      global.addEventListener("keydown", this._teclas, true);
      this._redim = function () {
        if (!self.ui || self.gravando) return;
        var w = Math.max(640, global.innerWidth), h = Math.max(360, global.innerHeight);
        self.ui.tela.width = w; self.ui.tela.height = h;
      };
      global.addEventListener("resize", this._redim);
      try { var fs = raiz.requestFullscreen ? raiz.requestFullscreen() : null; if (fs && fs.catch) fs.catch(function () {}); } catch (eF) {}
      this._fsh = function () { if (!document.fullscreenElement && self.ativa && !self.gravando && self._entrouFs) { self.parar(); } if (document.fullscreenElement) self._entrouFs = true; };
      document.addEventListener("fullscreenchange", this._fsh);
    },
    _mostrarAviso: function (txt) { var u = this.ui; if (!u) return; u.aviso.style.display = txt ? "block" : "none"; if (txt) u.aviso.textContent = txt; },
    _pintarUi: function () { var u = this.ui; if (!u) return; u.bPlay.textContent = this.tocando ? "⏸" : "▶"; u.bVel.textContent = (this.vel === 0.5 ? "0,5" : this.vel) + "×"; this._atualizarBarra(); },
    _atualizarBarra: function () {
      var u = this.ui; if (!u) return;
      if (!u.tempo.matches || !u.tempo.matches(":active")) u.tempo.value = String(Math.round(this.t * 100));
      function mmss(s) { s = Math.max(0, Math.round(s)); return (s < 600 ? "0" : "") + Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60); }
      u.rotT.textContent = mmss(this.t) + " / " + mmss(this.linha.total);
    },
    alternar: function () { if (this.t >= this.linha.total - 0.01) this.t = 0; this.tocando = !this.tocando; this._ultimo = 0; this._pintarUi(); return this.tocando; },
    velocidade: function (v) { this.vel = v; this._pintarUi(); return v; },
    irPara: function (t) { this.t = clamp(+t || 0, 0, this.linha.total); this._ultimo = 0; if (!this.tocando) this._pintarUi(); return this.t; },
    /* passa para o início da etapa seguinte / anterior (volta ao início da atual se já passou de 1,5 s dela) */
    irEtapa: function (d) {
      var L = this.linha, a = AP(), e = a.etapaEm(L, this.t), i = L.etapas.indexOf(e);
      if (d < 0) i = (this.t - e.t0 > 1.5) ? i : i - 1; else i = i + 1;
      i = clamp(i, 0, L.etapas.length - 1);
      return this.irPara(i === L.etapas.length - 1 && d > 0 && e === L.etapas[L.etapas.length - 1] ? L.total : L.etapas[i].t0 + 0.01);
    },

    /* ------------------------------------------------------------- sair, restaurando tudo */
    parar: function () {
      if (!this.ativa) return false;
      var c = this.c, sv = this.sv, ctx = this.ctx, self = this;
      this.ativa = false; this.tocando = false; this._pronto = false;
      try { Duplo.desligar(); } catch (e) {}
      /* o tick: sai da lista */
      try { var i = c.tickExtra.indexOf(this._tickFn); if (i >= 0) c.tickExtra.splice(i, 1); c._apTick = null; } catch (e2) {}
      try { global.clearInterval(this._esconder); } catch (e3) {}
      try { global.removeEventListener("keydown", this._teclas, true); global.removeEventListener("resize", this._redim); document.removeEventListener("fullscreenchange", this._fsh); } catch (e4) {}
      try { if (document.fullscreenElement && document.exitFullscreen) { var pr = document.exitFullscreen(); if (pr && pr.catch) pr.catch(function () {}); } } catch (e5) {}
      if (this.ui && this.ui.raiz && this.ui.raiz.parentNode) this.ui.raiz.parentNode.removeChild(this.ui.raiz);
      this.ui = null;
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
      try { c.renderer.setPixelRatio(sv.tam.pr); } catch (e7) {}
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
      var pre = u && u.tela ? u.tela.getContext("2d") : null;
      return new Promise(function (resolve) {
        var terminado = false, i = 0, t0Real = Date.now(), intervalo = 1000 / fps;
        rec.onstop = function () {
          terminado = true;
          try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
          /* devolve a cena à tela */
          try { r.setPixelRatio(prAntes); r.setSize(szAntes.x, szAntes.y, false); c.camera.aspect = aspAntes; c.camera.updateProjectionMatrix(); } catch (e4) {}
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
            if (pre && u && u.tela) {   /* o que a tela mostra enquanto grava: o quadro, reduzido, com o progresso */
              var tw = u.tela.width, th = u.tela.height, esc2 = Math.min(tw / W, th / H);
              pre.fillStyle = "#000"; pre.fillRect(0, 0, tw, th); pre.drawImage(cnv, (tw - W * esc2) / 2, (th - H * esc2) / 2, W * esc2, H * esc2);
              pre.fillStyle = "rgba(0,0,0,.65)"; pre.fillRect(0, th - 46, tw, 46);
              pre.fillStyle = "#ff9f1c"; pre.fillRect(0, th - 46, tw * (i / N), 4);
              pre.fillStyle = "#fff"; pre.font = "600 16px Segoe UI, Arial"; pre.fillText("Gravando " + Math.round(i / N * 100) + "% — " + (de + i / fps).toFixed(1).replace(".", ",") + " s de " + ate.toFixed(0) + " s · Esc cancela", 16, th - 18);
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

  /* ================================================================== O HUD (desenhado no quadro — vai para o vídeo) */
  var Hud = {
    desenhar: function (g, W, H, ap) {
      var a = AP(), L = ap.linha, t = ap.t, s = H / 1080, info = a.legendaEm(L, t), cor = COR[info.etapa] || "#fff", e = L.porEtapa[info.etapa], tEt = t - e.t0;
      g.save();
      g.textBaseline = "alphabetic";
      /* o antes × depois: os rótulos de cada lado e a divisória */
      if (info.comparar && Duplo.on) {
        var x = Math.round(Duplo.frac * W);
        g.fillStyle = "#fff"; g.fillRect(x - 2 * s, 0, 4 * s, H);
        g.beginPath(); g.arc(x, H * 0.46, 22 * s, 0, Math.PI * 2); g.fillStyle = "#fff"; g.fill();
        g.fillStyle = "#25324a"; g.font = "700 " + Math.round(20 * s) + "px Segoe UI, Arial"; g.textAlign = "center"; g.fillText("⇔", x, H * 0.46 + 7 * s);
        function rotulo(txt, xx, al, bg) { g.font = "700 " + Math.round(34 * s) + "px Segoe UI, Arial"; var w = g.measureText(txt).width + 36 * s; g.fillStyle = bg; var x0 = al === "left" ? xx : xx - w; g.fillRect(x0, 54 * s, w, 56 * s); g.fillStyle = "#fff"; g.textAlign = "left"; g.fillText(txt, x0 + 18 * s, 94 * s); }
        rotulo("ANTES", 40 * s, "left", "rgba(60,72,92,.88)"); rotulo("DEPOIS", W - 40 * s, "right", "rgba(46,158,91,.92)");
        g.textAlign = "left";
      }
      /* o título da obra (alto, à esquerda) e as etapas (à direita) */
      var gt = g.createLinearGradient(0, 0, 0, 190 * s); gt.addColorStop(0, "rgba(6,12,24,.62)"); gt.addColorStop(1, "rgba(6,12,24,0)"); g.fillStyle = gt; g.fillRect(0, 0, W, 190 * s);
      g.shadowColor = "rgba(0,0,0,.55)"; g.shadowBlur = 8 * s;
      g.fillStyle = "#fff"; g.font = "600 " + Math.round(22 * s) + "px Segoe UI, Arial"; g.textAlign = "left";
      var rotTop = String(L.titulo || "").toUpperCase();
      if (!info.comparar) {
        g.fillText("APRESENTAÇÃO DA OBRA", 40 * s, 62 * s);
        g.font = "700 " + Math.round(34 * s) + "px Segoe UI, Arial"; g.fillText(rotTop.length > 46 ? rotTop.slice(0, 45) + "…" : rotTop, 40 * s, 104 * s);
        g.fillStyle = cor; g.fillRect(40 * s, 118 * s, 96 * s, 4 * s);
      }
      g.shadowBlur = 0;
      var nE = L.etapas.length, xr = W - 40 * s;
      g.font = "600 " + Math.round(17 * s) + "px Segoe UI, Arial"; g.textAlign = "right";
      for (var i = nE - 1; i >= 0; i--) {
        var et = L.etapas[i], ativa = et.id === info.etapa, txt = et.n + "  " + (et.id === "final" ? "Final" : et.titulo.split(" ")[0]);
        var w = g.measureText(txt).width;
        if (!info.comparar) { g.fillStyle = ativa ? COR[et.id] : "rgba(255,255,255,.5)"; g.fillText(txt, xr, 56 * s); }
        xr -= w + 22 * s;
      }
      /* a faixa de baixo: título da etapa, legenda e contadores */
      var alt = 200 * s, y0 = H - alt;
      var gr = g.createLinearGradient(0, y0 - 40 * s, 0, H); gr.addColorStop(0, "rgba(6,12,24,0)"); gr.addColorStop(0.35, "rgba(6,12,24,.62)"); gr.addColorStop(1, "rgba(6,12,24,.86)");
      g.fillStyle = gr; g.fillRect(0, y0 - 40 * s, W, alt + 40 * s);
      var entra = suave(tEt / 0.7), px = 40 * s + (1 - entra) * -50 * s;
      g.globalAlpha = entra;
      g.fillStyle = cor; g.fillRect(px, y0 + 24 * s, 8 * s, 92 * s);
      g.fillStyle = "#fff"; g.font = "700 " + Math.round(62 * s) + "px Segoe UI, Arial"; g.textAlign = "left";
      g.fillText(info.titulo, px + 26 * s, y0 + 78 * s);
      g.fillStyle = "rgba(255,255,255,.86)"; g.font = "400 " + Math.round(27 * s) + "px Segoe UI, Arial";
      g.fillText(info.legenda, px + 28 * s, y0 + 116 * s);
      g.globalAlpha = 1;
      /* os contadores */
      var cn = info.contadores, tot = info.totais, x2 = W - 40 * s;
      function bloco(rot, m2, pecas, corB, yy) {
        g.textAlign = "right"; g.fillStyle = corB; g.font = "700 " + Math.round(46 * s) + "px Segoe UI, Arial";
        g.fillText(num1(m2) + " m²", x2, yy);
        g.fillStyle = "rgba(255,255,255,.88)"; g.font = "600 " + Math.round(20 * s) + "px Segoe UI, Arial";
        g.fillText(rot + " · " + inteiro(pecas) + (pecas === 1 ? " peça" : " peças"), x2, yy + 28 * s);
      }
      var mostraD = ["demolicao", "construcao", "acabamentos", "final"].indexOf(info.etapa) >= 0 && tot.demolidoPecas > 0, mostraC = ["construcao", "acabamentos", "final"].indexOf(info.etapa) >= 0 && tot.construidoPecas > 0;
      if (info.etapa === "existente" && tot.existentePecas) { g.textAlign = "right"; g.fillStyle = "#cfe0f5"; g.font = "700 " + Math.round(46 * s) + "px Segoe UI, Arial"; g.fillText(inteiro(tot.existentePecas) + " peças", x2, y0 + 66 * s); g.fillStyle = "rgba(255,255,255,.88)"; g.font = "600 " + Math.round(20 * s) + "px Segoe UI, Arial"; g.fillText("existentes no lote", x2, y0 + 94 * s); }
      if (info.comparar) { mostraD = false; mostraC = false; }
      if (mostraD && mostraC) { bloco("DEMOLIDO", cn.demolidoM2, cn.demolidoPecas, "#ff6b60", y0 + 28 * s); bloco("CONSTRUÍDO", cn.construidoM2, cn.construidoPecas, "#56e09a", y0 + 108 * s); }
      else if (mostraD) bloco("DEMOLIDO", cn.demolidoM2, cn.demolidoPecas, "#ff6b60", y0 + 70 * s);
      else if (mostraC) bloco("CONSTRUÍDO", cn.construidoM2, cn.construidoPecas, "#56e09a", y0 + 70 * s);
      /* o cartão de entrada da etapa: título grande no centro por ~2 s */
      var cartao = clamp(1 - Math.abs(tEt - 1.1) / 1.1, 0, 1);
      if (tEt < 2.2 && info.etapa !== "final" || (info.etapa === "final" && !info.comparar && tEt < 2.2)) {
        var al = suave(Math.min(1, tEt / 0.45)) * (1 - suave((tEt - 1.5) / 0.7));
        g.globalAlpha = al * 0.95;
        var gv = g.createRadialGradient(W / 2, H * 0.42, H * 0.1, W / 2, H * 0.42, H * 0.7); gv.addColorStop(0, "rgba(0,0,0,0)"); gv.addColorStop(1, "rgba(0,0,0,.4)");
        g.fillStyle = gv; g.fillRect(0, 0, W, H);
        g.textAlign = "center"; g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 20 * s;
        g.fillStyle = "#fff"; g.font = "800 " + Math.round(110 * s) + "px Segoe UI, Arial"; g.fillText(info.titulo.toUpperCase(), W / 2, H * 0.44 + (1 - al) * 18 * s);
        g.shadowBlur = 0; g.fillStyle = cor; g.fillRect(W / 2 - 120 * s * al, H * 0.44 + 22 * s, 240 * s * al, 7 * s);
        g.fillStyle = "rgba(255,255,255,.9)"; g.font = "500 " + Math.round(34 * s) + "px Segoe UI, Arial"; g.fillText("Etapa " + info.n + " de " + info.de, W / 2, H * 0.44 + 78 * s);
        g.globalAlpha = 1;
      }
      /* a marca e o progresso */
      g.shadowBlur = 0; g.textAlign = "right"; g.fillStyle = "rgba(255,255,255,.55)"; g.font = "600 " + Math.round(16 * s) + "px Segoe UI, Arial"; g.fillText(MARCA, W - 40 * s, H - 14 * s);
      g.fillStyle = "rgba(255,255,255,.2)"; g.fillRect(0, H - 5 * s, W, 5 * s);
      g.fillStyle = cor; g.fillRect(0, H - 5 * s, W * clamp(t / L.total, 0, 1), 5 * s);
      g.restore();
    }
  };

  Ui.Hud = Hud;
  Ui.Apres = Apres;   /* o estado da apresentação (js/bimabrirui.js liga o modo Abrir portas enquanto ela roda) */
  global.BimApresentacaoUI = Ui;
  if (typeof module !== "undefined" && module.exports) module.exports = Ui;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
