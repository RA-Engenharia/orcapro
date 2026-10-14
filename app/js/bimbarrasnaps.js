/* =====================================================================
 * bimbarrasnaps.js — a PRECISÃO na BARRA DE BAIXO do BIM (14/10/2026).
 *
 * Pedido do Rogério: "aqueles botões de snap devem ficar lá embaixo, na
 * barra lá embaixo do sistema, com a opção de poder selecionar eles lá
 * embaixo; e aquele que, quando você está criando uma linha, faz ela ficar
 * na horizontal/vertical também tem que ser selecionado lá embaixo — para
 * qualquer coisa que for criar tem que ter essas opções."
 *
 * O QUE MORA AQUI: só a TELA. O estado é UM só e mora no motor da barra de
 * opções (js/bimbarraopcoes.js: `precisao()`, `precisaoMudar()`,
 * `alternar()`, `assinar()`, `travar()`), gravado por usuário. Este arquivo:
 *   · o grupo PRECISÃO à direita da barra de controle da vista (`.rv-vistabar`
 *     do js/bimshell.js) — fora do palco, nunca por cima do desenho:
 *       Snap (liga/desliga geral, F3) + ▾ com cada tipo (caixas de seleção) e
 *       o passo da grade; Orto (horizontal/vertical e incrementos, F8) + ▾
 *       com os incrementos de ângulo (15°, 30°, 45°, 90°, 180°);
 *   · aceso/apagado sempre à vista (luz + aria-pressed) e dica no mouse;
 *   · F3 e F8 com o BIM na tela (o Shift continua: inverte a trava enquanto
 *     está apertado — com o Orto apagado, é o orto temporário).
 * Quem LÊ o estado (toda ferramenta de criar, 2D e 3D): parede, viga, laje,
 * eixo, guarda-corpo, escada (js/bim.js editAjustarPonto e a planta,
 * js/bimplantamodelar.js), peças metálicas (js/metalcriarui.js), peça pronta
 * e tanque (js/metalprontasui.js, js/metaltanqueui.js), telhado/radier/
 * baldrame (js/bimp3ui.js), cota (js/bimcotasui.js, js/bimanot2dui.js),
 * linha/região/nuvem 2D (js/bimanot2dui.js) e mover/copiar/espelhar/girar/
 * matriz/cota de precisão (js/bimprecisaoui.js).
 * Só com o modelador (BimPrevia.modelador()) e a casca montada. Cores pelos
 * tokens da casca (--rv-*): o tema escuro vem junto (css/bimbarraopcoes.css).
 * ===================================================================== */
(function (global) {
  "use strict";

  function BO() { var b = global.BimBarraOpcoes; return b && typeof b.precisao === "function" ? b : null; }
  function Pr() { return global.BimPrecisao || null; }
  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function ico(nome, tam) { try { return global.Icones && global.Icones.get ? (global.Icones.get(nome, tam || 14) || "") : ""; } catch (e) { return ""; } }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function fmt(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  function num(v) { var n = Number(String(v == null ? "" : v).replace(",", ".")); return isFinite(n) ? n : NaN; }

  var ROT = { fim: "Extremidade (ponto final)", intersecao: "Interseção", meio: "Ponto médio", centro: "Centro", perpendicular: "Perpendicular",
              extensao: "Prolongamento (extensão)", proximo: "Sobre a peça (próximo)", grade: "Grade" };
  var COR = { fim: "var(--verde)", intersecao: "var(--vermelho)", meio: "var(--amarelo)", centro: "var(--aco)", perpendicular: "var(--aco)",
              extensao: "var(--amarelo)", proximo: "var(--texto-fraco)", grade: "var(--texto-fraco)" };
  var DICA_SNAP = "Snap: o ponto agarra na extremidade, no meio, na interseção, no centro, na perpendicular, no prolongamento, sobre a peça e na grade. Vale para tudo o que você cria (2D e 3D). F3 liga e desliga; a seta escolhe os tipos.";
  var DICA_ORTO = "Orto: o traço anda só na horizontal/vertical e nos ângulos marcados (45°, 90°…). Vale para parede, viga, peça metálica, linha, cota, contorno de laje/telhado/fundação, guarda-corpo… F8 liga e desliga; Shift inverte enquanto está apertado (com o Orto apagado, é o orto temporário).";

  var BimBarraSnaps = {
    _el: null, _menu: null, _pop: null, _ligado: false, _sairOuvinte: null,

    /* a barra de baixo da casca (ou null sem casca/sem modelador) */
    _vistabar: function () {
      if (!previa() || typeof document === "undefined") return null;
      var raiz = null; try { raiz = global.BimShell && global.BimShell.raiz ? global.BimShell.raiz() : null; } catch (e) { raiz = null; }
      if (!raiz || !document.body || !document.body.contains(raiz)) return null;
      return raiz.querySelector(".rv-vistabar");
    },
    /* monta (uma vez por casca) e devolve o grupo; null quando não há onde morar */
    garantir: function () {
      var vb = this._vistabar(); if (!vb || !BO()) return null;
      var g = this._el;
      if (!g || !vb.contains(g)) {
        g = document.createElement("div");
        g.className = "bbs"; g.setAttribute("data-bbs", "grupo"); g.setAttribute("role", "toolbar"); g.setAttribute("aria-label", "Precisão do desenho: snap e ortogonal");
        this._el = g; this._ligar(g);
        vb.appendChild(g);
      }
      this._ligarDoc();
      this.pintar();
      return g;
    },
    elemento: function () { return this._el && document.body.contains(this._el) ? this._el : null; },
    /* a barra está na tela? (o js/bimprecisaoui.js pergunta antes de atender o F3 sozinho) */
    atendeTeclas: function () { var g = this.elemento(); return !!(g && previa()); },

    pintar: function () {
      var g = this.elemento(), B = BO(); if (!g || !B) return false;
      var p = B.precisao(), T = (Pr() && Pr().TIPOS) || B.TIPOS_SNAP, nOn = T.filter(function (t) { return p.tipos[t] !== false; }).length;
      function liga(id, rot, on, dica, icone, extra) {
        return '<button type="button" class="rv-vb bbs-bt" data-bbs="' + id + '" aria-pressed="' + (on ? "true" : "false") + '" title="' + esc(dica) + '" aria-label="' + esc(rot + (on ? " ligado" : " desligado")) + '">' +
          '<span class="bbs-luz" aria-hidden="true"></span>' + (icone ? ico(icone, 14) : "") + '<span class="bbs-rot">' + esc(rot) + "</span>" + (extra || "") + "</button>";
      }
      function seta(id, dica, txt) {
        return '<button type="button" class="rv-vb bbs-seta" data-bbs="' + id + '" aria-haspopup="true" aria-expanded="' + (this._menu === id ? "true" : "false") + '" title="' + esc(dica) + '" aria-label="' + esc(dica) + '">' + (txt ? '<span class="bbs-txt">' + esc(txt) + "</span>" : "") + '<span class="bbs-v">▾</span></button>';
      }
      var h = '<span class="bbs-tit" aria-hidden="true">Precisão</span>';
      h += liga("snap", "Snap", p.snap, DICA_SNAP, "ima", nOn < T.length ? '<span class="bbs-n">' + nOn + "/" + T.length + "</span>" : "") +
           seta.call(this, "snapMenu", "Quais snaps (e o passo da grade)") +
           liga("orto", "Orto", p.orto, DICA_ORTO, "regua") +
           seta.call(this, "incMenu", "Incrementos de ângulo do Orto", B.textoInc(p.inc));
      g.innerHTML = h;
      g.setAttribute("data-bbs-snap", p.snap ? "1" : "0"); g.setAttribute("data-bbs-orto", p.orto ? "1" : "0");
      if (this._menu) this._abrir(this._menu, true);
      return true;
    },

    /* ---------------------------------------------------------------- menus */
    _fechar: function () {
      if (this._pop && this._pop.parentNode) this._pop.parentNode.removeChild(this._pop);
      this._pop = null; this._menu = null;
      var g = this.elemento(); if (g) Array.prototype.forEach.call(g.querySelectorAll("[aria-expanded]"), function (b) { b.setAttribute("aria-expanded", "false"); });
    },
    /* abre o menu de snaps ("snapMenu") ou de incrementos ("incMenu"); de novo no mesmo, fecha */
    _abrir: function (qual, repintar) {
      var g = this.elemento(), B = BO(); if (!g || !B) return false;
      var bt = g.querySelector('[data-bbs="' + qual + '"]'); if (!bt) return false;
      if (!repintar && this._menu === qual) { this._fechar(); return false; }
      if (this._pop && this._pop.parentNode) this._pop.parentNode.removeChild(this._pop);
      var p = B.precisao(), T = (Pr() && Pr().TIPOS) || B.TIPOS_SNAP, pop = document.createElement("div");
      pop.className = "bbs-pop"; pop.setAttribute("data-bbs-pop", qual); pop.setAttribute("role", "menu");
      if (qual === "snapMenu") {
        pop.innerHTML = '<div class="bbs-pop-tit">Snaps <span class="bbs-tecla">F3</span></div>' +
          '<label class="bbs-pop-item bbs-pop-geral"><input type="checkbox" data-bbs-geral="1"' + (p.snap ? " checked" : "") + "> Snap ligado</label>" +
          T.map(function (t) {
            var gl = Pr() && Pr().glifoSvg ? Pr().glifoSvg(t) : "";
            return '<label class="bbs-pop-item"><input type="checkbox" data-bbs-tipo="' + t + '"' + (p.tipos[t] !== false ? " checked" : "") + '><span class="bbs-glifo" style="color:' + COR[t] + '">' + gl + "</span> " + esc(ROT[t] || t) + "</label>";
          }).join("") +
          '<label class="bbs-pop-item bbs-pop-passo">Passo da grade <input data-bbs-passo="1" inputmode="decimal" autocomplete="off" value="' + esc(fmt(p.passo)) + '"> m</label>' +
          '<div class="bbs-pop-nota">Quando dois concorrem: ponto (extremidade, interseção, meio, centro) &gt; perpendicular &gt; prolongamento &gt; sobre a peça &gt; grade.</div>';
      } else {
        pop.innerHTML = '<div class="bbs-pop-tit">Incrementos do Orto <span class="bbs-tecla">F8</span></div>' +
          '<label class="bbs-pop-item bbs-pop-geral"><input type="checkbox" data-bbs-orto="1"' + (p.orto ? " checked" : "") + "> Orto ligado</label>" +
          B.INCREMENTOS.map(function (gr) { return '<label class="bbs-pop-item"><input type="checkbox" data-bbs-inc="' + gr + '"' + (p.inc.indexOf(gr) >= 0 ? " checked" : "") + "> " + gr + "°</label>"; }).join("") +
          '<div class="bbs-pop-nota">Orto ligado: o traço só anda nos múltiplos dos ângulos marcados. Desligado: ângulo livre, atraído a ±' + B.JANELA + "° deles. Shift inverte enquanto está apertado.</div>";
      }
      /* o menu sobe da barra (ela fica no rodapé) e mora na casca: o overflow da barra cortaria */
      var raiz = global.BimShell && global.BimShell.raiz ? global.BimShell.raiz() : document.body;
      raiz.appendChild(pop);
      var r = bt.getBoundingClientRect(), w = pop.offsetWidth || 220, vw = global.innerWidth || 1200;
      pop.style.left = Math.max(4, Math.min(vw - w - 4, r.right - w)) + "px";
      pop.style.bottom = Math.max(4, (global.innerHeight || 800) - r.top + 4) + "px";
      this._pop = pop; this._menu = qual;
      bt.setAttribute("aria-expanded", "true");
      this._ligarPop(pop);
      return true;
    },
    _ligarPop: function (pop) {
      var self = this;
      pop.addEventListener("change", function (e) {
        var t = e.target, B = BO(); if (!t || !B) return;
        if (t.hasAttribute("data-bbs-geral")) { B.precisaoMudar({ snap: !!t.checked }); self._avisar("snap"); return; }
        if (t.hasAttribute("data-bbs-orto")) { B.precisaoMudar({ orto: !!t.checked }); self._avisar("orto"); return; }
        var tp = t.getAttribute("data-bbs-tipo");
        if (tp) { var o = { tipos: {} }; o.tipos[tp] = !!t.checked; if (tp === "grade") o.grade = !!t.checked; B.precisaoMudar(o); status((ROT[tp] || tp) + (t.checked ? ": ligado." : ": desligado — não agarra mais.")); return; }
        var inc = t.getAttribute("data-bbs-inc");
        if (inc) { var g = +inc, L = B.precisao().inc.filter(function (x) { return x !== g; }); if (t.checked) L.push(g); B.precisaoMudar({ inc: L }); status("Incrementos do Orto: " + B.textoInc(B.precisao().inc) + "."); return; }
        if (t.hasAttribute("data-bbs-passo")) { var v = num(t.value); if (v > 0 && v <= 10) B.precisaoMudar({ passo: v }); t.value = fmt(B.precisao().passo); status("Passo da grade: " + fmt(B.precisao().passo) + " m."); }
      });
      pop.addEventListener("keydown", function (e) {
        e.stopPropagation();   /* digitar o passo não aciona atalho do visualizador (G da grade, WASD do voo) */
        if (e.key === "Enter" && e.target && e.target.tagName === "INPUT") { e.preventDefault(); e.target.blur(); }
        if (e.key === "Escape") { e.preventDefault(); self._fechar(); }
      });
    },
    abrirMenu: function (qual, on) {
      var id = qual === "orto" || qual === "incMenu" ? "incMenu" : "snapMenu";
      if (!this.garantir()) return false;
      if (on === false) { if (this._menu === id) this._fechar(); return false; }
      if (on === true && this._menu === id) return true;
      return this._abrir(id, false);
    },

    /* ---------------------------------------------------- GIRO COM ESPAÇO (14/10/2026)
     * Pedido do Rogério: "colocando uma viga, qualquer elemento, apertar o ESPAÇO e ele rotacionar 90°;
     * na planta, apertou o espaço, gira 90°; e as vigas: deixar de pé ou deitar, apertando o espaço."
     * Uma regra para as ferramentas de criar (2D e 3D), sempre na propriedade de giro que JÁ existe:
     *   · peça de CLIQUE (pilar de aço: "Giro" da ferramenta; pilar de concreto: "Giro" do pilar,
     *     giroPilar) → gira 90° no plano, acumulando (0, 90, 180, 270);
     *   · peça LINEAR (viga, terça e diagonal de aço: "Giro" da seção em volta do eixo) → de pé ↔
     *     deitada; viga de concreto por perfil retangular → troca largura × altura (é o giro de 90°
     *     da seção retangular);
     *   · família, peça pronta e tanque já giravam com o Espaço (js/bim.js, js/metalprontasui.js,
     *     js/metaltanqueui.js) — ficam com o deles; a família mostra o giro na barra de status também.
     * O giro atual sai na barra de status de baixo: "Giro 90° — Espaço gira". */
    GIRO_METAL: { "met-pilar": "pilar", "met-viga": "viga", "met-diagonal": "diagonal", "met-terca": "terca" },
    _armada: function () { try { var B = BO(); return B && B.ferramenta ? B.ferramenta() : null; } catch (e) { return null; } },
    _arqui: function () { var U = global.BimArqUI; try { return U && U.ativo && U.ativo() && U.cfg ? U : null; } catch (e) { return null; } },
    /* esta ferramenta gira com o Espaço AQUI? */
    gira: function (sub) {
      if (!sub) return false;
      if (this.GIRO_METAL[sub]) return !!(global.MetalCriarUI && global.MetalCriarUI.cfg);
      if (sub === "pilar" || sub === "viga") return !!this._arqui();
      return false;
    },
    girar: function (sub) {
      sub = sub || this._armada();
      var g, msg, MU = global.MetalCriarUI;
      if (this.GIRO_METAL[sub] && MU && MU.cfg && MU.mudarFerramenta) {
        var ferr = this.GIRO_METAL[sub], c = MU.cfg()[ferr] || {};
        MU.mudarFerramenta(ferr, "mcrf:giro", (Number(c.giro) || 0) + 90);   /* ela normaliza em −180…180 */
        try { if (global.BimShell && MU.esquemaFerramenta) global.BimShell.pintarProps(MU.esquemaFerramenta(ferr)); } catch (eP) {}
        try { var S3 = MU._3d; if (S3 && S3.redesenhar) S3.redesenhar(); } catch (eR) {}
        g = ((Math.round(Number(MU.cfg()[ferr].giro) || 0) % 360) + 360) % 360;
        msg = ferr === "pilar" ? "Giro " + g + "° — Espaço gira o pilar 90°." : "Giro da seção " + g + "° (" + (g % 180 === 0 ? "de pé" : "deitada") + ") — Espaço gira 90° em volta do eixo da peça.";
      } else if (sub === "pilar" && this._arqui()) {
        var U = this._arqui();
        g = ((Math.round(Number(U.cfg().giroPilar) || 0) + 90) % 360 + 360) % 360;
        U.mudarFerramenta("pilar", "b2f:giroPilar", g);
        try { if (U._repintar) U._repintar(); } catch (eU) {}
        msg = "Giro " + g + "° — Espaço gira o pilar 90°.";
      } else if (sub === "viga" && this._arqui()) {
        var U2 = this._arqui(), pv = U2.cfg().perfilViga || {};
        if (!(pv.b > 0 && pv.h > 0) || pv.cat) { status("Esta seção de viga não tem largura × altura para girar (perfil de catálogo: troque o perfil em Propriedades)."); return null; }
        var b = pv.b, h = pv.h;
        /* a medida "digitada" do perfil (b2f:pv:d:<campo>, em cm — js/bimarqui.js _mudarPerfil) */
        U2.mudarFerramenta("viga", "b2f:pv:d:b", String(Math.round(h * 10000) / 100)); U2.mudarFerramenta("viga", "b2f:pv:d:h", String(Math.round(b * 10000) / 100));
        try { if (U2._repintar) U2._repintar(); } catch (eV) {}
        var p2 = U2.cfg().perfilViga || {};
        g = p2.b > p2.h ? 90 : 0;
        msg = "Viga " + fmt(p2.b) + " × " + fmt(p2.h) + " m (" + (g ? "deitada" : "de pé") + ") — Espaço gira a seção 90°.";
      } else return null;
      try { var B = BO(); if (B && B.pintar) B.pintar(); } catch (eB) {}
      status(msg);
      return g;
    },

    /* ---------------------------------------------------------------- ações */
    alternar: function (campo) {
      var B = BO(); if (!B) return null;
      var v = B.alternar(campo);
      this._avisar(campo);
      return v;
    },
    _avisar: function (campo) {
      var B = BO(); if (!B) return;
      var p = B.precisao();
      if (campo === "snap") status(p.snap ? "Snap ligado (F3 desliga)." : "Snap desligado (F3 liga): o ponto fica onde o cursor está.");
      if (campo === "orto") status(p.orto ? "Orto ligado (F8 desliga): o traço anda na horizontal/vertical e em " + B.textoInc(p.inc) + "." : "Orto desligado (F8 liga): ângulo livre, atraído a ±" + B.JANELA + "° dos incrementos. Shift trava enquanto está apertado.");
    },
    _ligar: function (g) {
      var self = this;
      g.addEventListener("click", function (e) {
        var b = e.target && e.target.closest ? e.target.closest("[data-bbs]") : null; if (!b || !g.contains(b)) return;
        var k = b.getAttribute("data-bbs");
        if (k === "snap" || k === "orto") { self.alternar(k); return; }
        if (k === "snapMenu" || k === "incMenu") { self._abrir(k, false); }
      });
      /* Esc com o foco na barra fecha o menu aberto */
      g.addEventListener("keydown", function (e) { if (e.key === "Escape" && self._menu) { e.preventDefault(); self._fechar(); } });
    },
    /* ouvintes do documento: UMA vez (a casca remontada cria outro grupo, não outro par de ouvintes) */
    _ligarDoc: function () {
      if (this._ligado || typeof document === "undefined") return;
      this._ligado = true;
      var self = this;
      var B = BO(); if (B && B.assinar) this._sairOuvinte = B.assinar(function () { self.pintar(); });
      document.addEventListener("pointerdown", function (e) {
        if (!self._pop) return;
        if (self._pop.contains(e.target)) return;
        var g = self.elemento(); if (g && g.contains(e.target) && e.target.closest && e.target.closest(".bbs-seta")) return;   /* o clique na seta alterna o menu */
        self._fechar();
      }, true);
      /* ESPAÇO = gira 90° a peça da ferramenta de criar armada (ver `girar`). Só com uma ferramenta que
         gira armada: sem ela o Espaço segue para quem já o usava (simulação 4D, botão focado). */
      document.addEventListener("keydown", function (e) {
        if ((e.key !== " " && e.code !== "Space") || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
        var t = e.target || {}; if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || "") || t.isContentEditable) return;
        if (!self.atendeTeclas()) return;
        var sub = self._armada(); if (!self.gira(sub)) return;
        e.preventDefault(); e.stopImmediatePropagation();   /* ⚠ o preventDefault também impede o Espaço de "clicar" o botão da fita que ficou com o foco (desarmaria a ferramenta) */
        self.girar(sub);
      }, true);
      /* F3 = snap, F8 = orto, com o BIM na tela. Teclas de função não escrevem: valem mesmo com o
         foco na caixa de digitar o comprimento (é ali que a pessoa está no meio do traço). */
      document.addEventListener("keydown", function (e) {
        if (e.key !== "F3" && e.key !== "F8") return;
        if (e.ctrlKey || e.altKey || e.metaKey || !self.atendeTeclas()) return;
        e.preventDefault(); e.stopPropagation();
        self.alternar(e.key === "F3" ? "snap" : "orto");
      }, true);
    }
  };

  /* a casca já está montada quando este arquivo chega (o grupo "bim" carrega depois dela)? */
  try { if (typeof document !== "undefined" && document.readyState !== "loading") setTimeout(function () { try { BimBarraSnaps.garantir(); } catch (e) {} }, 0); } catch (e0) {}

  global.BimBarraSnaps = BimBarraSnaps;
  if (typeof module !== "undefined" && module.exports) module.exports = BimBarraSnaps;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
