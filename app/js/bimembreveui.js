/* =====================================================================
 * bimembreveui.js — a TELA dos três comandos que saíram do "em breve" da
 * fita do BIM (prévia do modelador, `?previa=modelador`), 09/10/2026:
 *
 *   Igualar tipo (`combinar`, Arquitetura › Tipo) — arma a ferramenta
 *     "corresp-tipo" do desenho de precisão (js/bimprecisaoui.js): origem,
 *     depois cada alvo; só a mesma categoria; um Ctrl+Z por aplicação; Esc
 *     encerra. Com uma peça do editor já selecionada, ela é a origem.
 *   Plano de trabalho (`plano-trabalho`, Arquitetura › Referência) — a
 *     janela que define o plano (js/bimplano.js): nível + deslocamento, face
 *     plana clicada, eixo/linha de referência (vertical), plano de uma peça;
 *     mostra/oculta a grade; o plano ativo vai para a barra de status.
 *   Graute e armadura (`graute`, Alvenaria › Paginação) — a janela da
 *     alvenaria estrutural (js/bimgraute.js): marcar as paredes, os
 *     parâmetros do projeto (com o que é "conferir NBR 16868-1"), os pontos,
 *     m³ e kg, e o desenho (planta e elevação com os furos hachurados e as
 *     barras).
 *
 * Quem faz a conta: js/bimplano.js e js/bimgraute.js (puros). Aqui só tela,
 * clique e desenho. No 3D (js/bim.js, ganchos "EMBREVE"/"PLANO"): a grade do
 * plano, as barras de armadura e os cliques "pegar face/peça/linha".
 * Sem a prévia do modelador nada daqui aparece: a fita mostra os três como
 * "em breve" e o editor fica como estava.
 * ===================================================================== */
(function (global) {
  "use strict";

  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function B() { return global.BIM || null; }
  function P() { return global.BimPlano || null; }
  function Gr() { return global.BimGraute || null; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmt(v, c) { var n = Number(v); if (!isFinite(n)) return "—"; c = c == null ? 2 : c; return n.toFixed(c).replace(".", ","); }
  function lerNum(s) { var t = String(s == null ? "" : s).trim().replace(/\s/g, ""); if (!t) return null; t = t.replace(",", "."); var n = Number(t); return isFinite(n) ? n : NaN; }
  function toast(t, k) { try { if (global.UI && UI.toast) UI.toast(t, k || "info"); } catch (e) {} }
  function status(t) { try { if (global.BimShell && BimShell.status) BimShell.status(t); } catch (e) {} }
  function estado() { var b = B(), s = b && b.editarEstado ? b.editarEstado() : null; return s ? s.estado : { caixas: [] }; }
  function vaosDe(st) { var b = B(); try { return global.BimEdit && b && b.familiaAvaliar ? BimEdit.vaosDasParedes(st, function (f, t, i) { return b.familiaAvaliar(f, t, i); }) : {}; } catch (e) { return {}; } }
  /* uma op → b2Op; várias → um lote (um Ctrl+Z desfaz tudo) */
  function enviar(ops, rotulo) {
    var b = B(); if (!b || !ops.length) return false;
    if (ops.length === 1) return b.b2Op ? b.b2Op(ops[0]) : false;
    return b.editarLote ? b.editarLote({ op: "lote", id: "emb-" + Date.now().toString(36), origem: "graute", pedido: String(rotulo || "").slice(0, 300), ops: ops }) : false;
  }

  /* =============================================== barra de status: o plano */
  function pintarStatusPlano() {
    try {
      var S = global.BimShell, raiz = S && S.raiz ? S.raiz() : null; if (!raiz) return;
      var dir = raiz.querySelector(".rv-status-dir"); if (!dir) return;
      var sp = dir.querySelector('[data-rv-st="plano"]');
      if (!previa()) { if (sp) sp.remove(); return; }
      if (!sp) { sp = document.createElement("span"); sp.setAttribute("data-rv-st", "plano"); dir.insertBefore(sp, dir.firstChild); }
      sp.textContent = P() ? P().rotulo() : "";
    } catch (e) {}
  }

  /* ======================================================= desenho (SVG) */
  var HACH = '<defs><pattern id="emb-hach" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="currentColor" stroke-width="1.1"/></pattern></defs>';
  function svgPlanta(d) {
    if (!d || !d.planta) return "";
    var pts = d.planta.parede.slice(); d.planta.furos.forEach(function (f) { pts = pts.concat(f.pts); });
    var x0 = Math.min.apply(null, pts.map(function (p) { return p.x; })), x1 = Math.max.apply(null, pts.map(function (p) { return p.x; }));
    var z0 = Math.min.apply(null, pts.map(function (p) { return p.z; })), z1 = Math.max.apply(null, pts.map(function (p) { return p.z; }));
    var W = 560, mg = 14, esc1 = Math.min((W - 2 * mg) / Math.max(x1 - x0, 0.01), 140 / Math.max(z1 - z0, 0.01)), Hh = Math.max(40, (z1 - z0) * esc1 + 2 * mg);
    function poly(l) { return l.map(function (p) { return (mg + (p.x - x0) * esc1).toFixed(1) + "," + (mg + (p.z - z0) * esc1).toFixed(1); }).join(" "); }
    return '<svg data-emb="planta" viewBox="0 0 ' + W + " " + Hh.toFixed(0) + '" width="100%" style="max-width:' + W + 'px;color:var(--texto,#222);background:var(--card,#fff)" role="img" aria-label="Planta da parede com os furos grauteados">' + HACH +
      '<polygon points="' + poly(d.planta.parede) + '" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
      d.planta.furos.map(function (f) { return '<polygon points="' + poly(f.pts) + '" fill="url(#emb-hach)" stroke="currentColor" stroke-width="0.8"' + (f.compartilhado ? ' stroke-dasharray="2 2" opacity="0.6"' : "") + '/>'; }).join("") + "</svg>";
  }
  function svgElevacao(d) {
    if (!d || !d.elevacao) return "";
    var e = d.elevacao, W = 560, mg = 16, topo = Math.max(e.H, Math.max.apply(null, e.barras.map(function (b) { return b.y1; }).concat([e.H])));
    var k = Math.min((W - 2 * mg) / Math.max(e.L, 0.01), 220 / Math.max(topo, 0.01)), Hh = topo * k + 2 * mg + 14;
    function X(s) { return (mg + s * k).toFixed(1); } function Y(y) { return (mg + (topo - y) * k).toFixed(1); }
    var h = '<svg data-emb="elevacao" viewBox="0 0 ' + W + " " + Hh.toFixed(0) + '" width="100%" style="max-width:' + W + 'px;color:var(--texto,#222);background:var(--card,#fff)" role="img" aria-label="Elevação da parede com o graute e as barras">' + HACH;
    h += '<rect x="' + X(0) + '" y="' + Y(e.H) + '" width="' + (e.L * k).toFixed(1) + '" height="' + (e.H * k).toFixed(1) + '" fill="none" stroke="currentColor" stroke-width="1.6"/>';
    e.faixas.forEach(function (f) { h += '<rect x="' + X(f.s0) + '" y="' + Y(e.H) + '" width="' + ((f.s1 - f.s0) * k).toFixed(1) + '" height="' + (e.H * k).toFixed(1) + '" fill="url(#emb-hach)" stroke="currentColor" stroke-width="0.6"' + (f.compartilhado ? ' opacity="0.45"' : "") + "/>"; });
    e.vaos.forEach(function (v) { h += '<rect x="' + X(v.s0) + '" y="' + Y(v.y1) + '" width="' + ((v.s1 - v.s0) * k).toFixed(1) + '" height="' + ((v.y1 - v.y0) * k).toFixed(1) + '" fill="var(--card,#fff)" stroke="currentColor" stroke-width="1.2"/>'; });
    e.barras.forEach(function (b) {
      h += '<line x1="' + X(b.s) + '" y1="' + Y(0) + '" x2="' + X(b.s) + '" y2="' + Y(e.H) + '" stroke="var(--vermelho,#c0392b)" stroke-width="1.8"/>';
      if (b.y1 > e.H + 1e-6) h += '<line x1="' + X(b.s) + '" y1="' + Y(e.H) + '" x2="' + X(b.s) + '" y2="' + Y(b.y1) + '" stroke="var(--vermelho,#c0392b)" stroke-width="1.4" stroke-dasharray="4 3"/>';
    });
    h += '<text x="' + X(0) + '" y="' + (Hh - 4).toFixed(0) + '" font-size="11" fill="currentColor">0</text><text x="' + X(e.L) + '" y="' + (Hh - 4).toFixed(0) + '" font-size="11" text-anchor="end" fill="currentColor">' + fmt(e.L) + ' m</text>';
    return h + "</svg>";
  }

  var BimEmBreveUI = {
    svgPlanta: svgPlanta, svgElevacao: svgElevacao,

    /* ------------------------------------------- os comandos da fita */
    registrar: function (reg, G) {
      var self = this;
      this._G = G || null;
      reg.combinar = function () {
        var b = B(); if (!b || !b.editarArmar) return false;
        if (!previa()) { toast("Igualar tipo está na prévia do modelador (?previa=modelador).", "aviso"); return true; }
        /* a peça do editor que estava selecionada é a ORIGEM */
        var sel = G && G._bimSelecao && /^edit:/.test(String(G._bimSelecao.uid || "")) ? String(G._bimSelecao.uid).slice(5) : null;
        b.editarArmar("corresp-tipo", {});
        var pz = b.precisao && b.precisao();
        if (pz && sel) { try { pz.selecionar([sel]); } catch (e) {} }
        status(sel ? "Igualar tipo: a peça selecionada é a origem — clique cada peça que passa a ser do tipo dela. Esc encerra." : "Igualar tipo: clique a peça de ORIGEM e depois cada peça que passa a ser do tipo dela (mesma categoria). Esc encerra.");
        return true;
      };
      reg["plano-trabalho"] = function () {
        if (!previa()) { toast("O plano de trabalho está na prévia do modelador (?previa=modelador).", "aviso"); return true; }
        self.abrirPlano(); return true;
      };
      reg.graute = function () {
        if (!previa()) { toast("Graute e armadura está na prévia do modelador (?previa=modelador).", "aviso"); return true; }
        self.abrirGraute(); return true;
      };
      if (P() && !this._ouvindoStatus) { this._ouvindoStatus = true; P().ouvir(pintarStatusPlano); }
      setTimeout(pintarStatusPlano, 0);
    },

    /* ------------------------------------------- PLANO DE TRABALHO */
    _niveis: function () {
      try {
        if (global.BimArqUI && BimArqUI.niveis) { var L = BimArqUI.niveis(); if (L && L.length) return L; }
        var G = this._G; return G && G._nivLer && global.Niveis ? Niveis.listar(G._nivLer()) : [];
      } catch (e) { return []; }
    },
    abrirPlano: function () {
      var self = this, Pl = P(); if (!Pl || !global.UI) return false;
      var L = this._niveis(), st = estado(), eixos = (st.eixos || []).filter(function (x) { return x && x.x0 != null; });
      var at = Pl.ativo();
      var h = '<div data-emb="plano">' +
        '<p class="muted" style="margin:0 0 10px">O plano de trabalho é onde o próximo elemento é desenhado (parede, laje, volume, família, linhas). Agora: <b data-emb="plano-atual">' + esc(Pl.rotulo()) + "</b>.</p>" +
        '<fieldset style="border:1px solid var(--borda,#ccd);border-radius:8px;padding:8px 10px;margin:0 0 10px"><legend>Por nível</legend>' +
        (L.length ? '<label>Nível <select data-emb="nivel" class="inp">' + L.map(function (n) { return '<option value="' + esc(n.id) + '"' + (at && at.nivelId === String(n.id) ? " selected" : "") + ">" + esc(n.nome) + " (" + fmt(n.elevacao) + " m)</option>"; }).join("") + "</select></label> " +
          '<label>Deslocamento <input data-emb="desloc" class="inp" inputmode="decimal" style="width:70px" value="' + (at && at.tipo === "nivel" ? fmt(at.desloc) : "0,00") + '"> m</label> ' +
          '<button type="button" class="btn sm" data-emb="usar-nivel">Usar este nível</button>'
          : '<span class="muted">Esta obra ainda não tem níveis (Arquitetura › Níveis).</span>') + "</fieldset>" +
        '<fieldset style="border:1px solid var(--borda,#ccd);border-radius:8px;padding:8px 10px;margin:0 0 10px"><legend>Pela geometria</legend>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
        '<button type="button" class="btn sm" data-emb="pegar-face">Face de uma peça (clique no 3D)</button>' +
        '<button type="button" class="btn sm" data-emb="pegar-peca">Pegar o plano de uma peça</button>' +
        '<button type="button" class="btn sm" data-emb="pegar-linha">Linha de referência (dois cliques)</button></div>' +
        (eixos.length ? '<div style="margin-top:8px"><label>Eixo <select data-emb="eixo" class="inp">' + eixos.map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.nome || x.id) + "</option>"; }).join("") + '</select></label> <button type="button" class="btn sm" data-emb="usar-eixo">Plano vertical pelo eixo</button></div>' : "") +
        "</fieldset>" +
        '<label><input type="checkbox" data-emb="grade"' + (Pl.grade() ? " checked" : "") + "> Mostrar a grade do plano</label>" +
        '<p class="muted" data-emb="plano-erro" style="color:var(--vermelho,#c0392b);min-height:1.2em;margin:8px 0 0"></p></div>';
      UI.modal("Plano de trabalho", h, [
        { texto: "Voltar ao nível ativo", classe: "ghost", onClick: function () { Pl.limpar(); UI.fecharModal(); status("Plano de trabalho: o nível ativo."); } },
        { texto: "Fechar", classe: "primary", onClick: function () { UI.fecharModal(); } }
      ]);
      var raiz = document.querySelector('[data-emb="plano"]'); if (!raiz) return true;
      function erro(t) { var e = raiz.querySelector('[data-emb="plano-erro"]'); if (e) e.textContent = t || ""; }
      function feito(r) { if (!r.ok) { erro(r.erro); return; } UI.fecharModal(); status(Pl.rotulo() + "."); }
      function armar(sub, txt) { var b = B(); if (!b || !b.editarArmar) return; UI.fecharModal(); b.editarArmar(sub, {}); status(txt); }
      raiz.addEventListener("click", function (ev) {
        var a = ev.target && ev.target.closest ? ev.target.closest("[data-emb]") : null; if (!a) return;
        var k = a.getAttribute("data-emb");
        if (k === "usar-nivel") {
          var id = raiz.querySelector('[data-emb="nivel"]').value, n = L.filter(function (x) { return String(x.id) === String(id); })[0];
          var d = lerNum(raiz.querySelector('[data-emb="desloc"]').value);
          if (d == null) d = 0; if (!isFinite(d)) { erro("Deslocamento inválido."); return; }
          feito(Pl.definir({ tipo: "nivel", nivel: n, desloc: d }));
        } else if (k === "usar-eixo") {
          var ide = raiz.querySelector('[data-emb="eixo"]').value, ex = eixos.filter(function (x) { return String(x.id) === String(ide); })[0];
          if (!ex) { erro("Escolha um eixo."); return; }
          var b0 = B(), yb = b0 && b0.editarBase ? b0.editarBase() : 0;
          feito(Pl.definir({ tipo: "linha", a: [ex.x0, ex.z0], b: [ex.x1, ex.z1], y: yb, rotulo: "eixo " + (ex.nome || ex.id) }));
        } else if (k === "pegar-face") armar("plano-face", "Plano de trabalho: clique numa FACE plana (topo da laje, face da parede, face de um volume).");
        else if (k === "pegar-peca") armar("plano-pegar", "Plano de trabalho: clique numa peça criada aqui — laje, pilar e viga dão o topo; parede, o plano do eixo; volume, o plano do contorno.");
        else if (k === "pegar-linha") armar("plano-linha", "Plano de trabalho: clique os dois pontos da linha de referência — o plano é vertical, por ela.");
      });
      raiz.addEventListener("change", function (ev) { if (ev.target && ev.target.getAttribute("data-emb") === "grade") Pl.grade(!!ev.target.checked); });
      return true;
    },

    /* ------------------------------------------- GRAUTE E ARMADURA */
    _grSel: null,
    abrirGraute: function () {
      if (!global.UI) return false;
      UI.modal("Graute e armadura — alvenaria estrutural", '<div data-emb="graute" data-modal-largo="1"></div>', [
        { texto: "Orçamento do modelo", classe: "ghost", onClick: function () { UI.fecharModal(); try { BimShell.executar("orc-modelo"); } catch (e) {} } },
        { texto: "Fechar", classe: "primary", onClick: function () { UI.fecharModal(); } }
      ]);
      this.pintarGraute();
      var self = this, raiz = document.querySelector('[data-emb="graute"]');
      if (raiz) {
        raiz.addEventListener("change", function (ev) {
          var t = ev.target; if (!t || !t.getAttribute) return;
          if (t.getAttribute("data-emb") === "estrutural") {
            var ok = enviar([{ op: "graute", id: t.getAttribute("data-id"), campos: { ativo: !!t.checked } }], "Alvenaria estrutural");
            if (!ok) toast("Não consegui marcar a parede.", "erro");
            self._grSel = t.getAttribute("data-id");
            setTimeout(function () { self.pintarGraute(); }, 60);
          }
        });
        raiz.addEventListener("click", function (ev) {
          var a = ev.target && ev.target.closest ? ev.target.closest("[data-emb]") : null; if (!a) return;
          var k = a.getAttribute("data-emb");
          if (k === "ver") { self._grSel = a.getAttribute("data-id"); self.pintarGraute(); }
          else if (k === "aplicar") self.aplicarParametros();
          else if (k === "todas") {
            var st = estado(), ops = (st.caixas || []).filter(function (c) { return c.tipo === "parede" && !(c.graute && c.graute.ativo); }).map(function (c) { return { op: "graute", id: c.id, campos: { ativo: true } }; });
            if (!ops.length) { toast("Todas as paredes já estão marcadas.", "info"); return; }
            enviar(ops, "Todas as paredes como alvenaria estrutural"); setTimeout(function () { self.pintarGraute(); }, 60);
          }
        });
      }
      return true;
    },
    pintarGraute: function () {
      var raiz = document.querySelector('[data-emb="graute"]'), BG = Gr(); if (!raiz || !BG) return;
      var st = estado(), vaos = vaosDe(st), R = BG.calcular(st, vaos), par = (st.caixas || []).filter(function (c) { return c.tipo === "parede"; });
      var sel = this._grSel && par.some(function (c) { return String(c.id) === String(this._grSel); }, this) ? this._grSel : (par.filter(function (c) { return c.graute && c.graute.ativo; })[0] || par[0] || {}).id;
      this._grSel = sel;
      var cSel = par.filter(function (c) { return String(c.id) === String(sel); })[0], cfg = cSel ? BG.config(cSel) : BG.config(null);
      var N = BG.NORMA;
      var h = '<p class="muted" style="margin:0 0 8px">Marque as paredes de <b>alvenaria estrutural</b>: o graute vai nos furos dos cantos, encontros, bordas de vão e bordas livres, e a cada espaçamento máximo do projeto, com a armadura vertical. ' +
        "O volume (m³) e o aço (kg) entram no Orçamento do modelo.</p>" +
        '<p data-emb="norma" style="margin:0 0 10px;padding:6px 8px;border-left:3px solid var(--amarelo,#d99a1e);background:var(--fundo-2,rgba(0,0,0,.03))"><b>Conferir ' + esc(N.referencia) + "</b> — " + esc(N.situacao) + ". Parâmetros do projeto com padrão a conferir: " + N.itens.map(function (i) { return esc(i.rotulo.toLowerCase()); }).join(", ") + ".</p>";
      if (!par.length) { raiz.innerHTML = h + '<p>Nenhuma parede criada aqui. Desenhe as paredes (Arquitetura › Parede) e volte.</p>'; return; }
      h += '<table class="tbl" data-emb="tabela" style="width:100%"><thead><tr><th>Parede</th><th>Estrutural</th><th style="text-align:right">Comprimento</th><th style="text-align:right">Pontos</th><th style="text-align:right">Graute (m³)</th><th style="text-align:right">Aço (kg)</th><th></th></tr></thead><tbody>' +
        par.map(function (c) {
          var r = R.paredes[c.id], on = !!(c.graute && c.graute.ativo);
          return '<tr data-emb-linha="' + esc(c.id) + '"' + (String(c.id) === String(sel) ? ' style="background:var(--fundo-2,rgba(0,0,0,.04))"' : "") + "><td>" + esc(c.id) + '</td><td><input type="checkbox" data-emb="estrutural" data-id="' + esc(c.id) + '"' + (on ? " checked" : "") + ' aria-label="Parede ' + esc(c.id) + ' é de alvenaria estrutural"></td>' +
            '<td style="text-align:right">' + fmt(c.comprimento) + ' m</td><td style="text-align:right" data-emb="n">' + (r ? r.n : "—") + '</td><td style="text-align:right" data-emb="vol">' + (r ? fmt(r.volume, 4) : "—") + '</td><td style="text-align:right" data-emb="kg">' + (r ? fmt(r.acoKg, 2) : "—") + "</td>" +
            '<td><button type="button" class="btn sm ghost" data-emb="ver" data-id="' + esc(c.id) + '">Ver desenho</button></td></tr>';
        }).join("") +
        '</tbody><tfoot><tr><td colspan="3"><b>Total</b></td><td style="text-align:right" data-emb="tot-n">' + R.total.n + '</td><td style="text-align:right" data-emb="tot-vol">' + fmt(R.total.volume, 4) + '</td><td style="text-align:right" data-emb="tot-kg">' + fmt(R.total.acoKg, 2) + "</td><td></td></tr></tfoot></table>" +
        '<div style="margin:6px 0 12px"><button type="button" class="btn sm" data-emb="todas">Marcar todas as paredes</button></div>';
      /* os parâmetros da parede escolhida (vazio = padrão) */
      var g = (cSel && cSel.graute) || {};
      function campo(k, rot, un, val, pad, nota) {
        return '<label style="display:inline-flex;gap:4px;align-items:center;margin:0 10px 6px 0">' + esc(rot) + ' <input class="inp" data-emb-par="' + k + '" inputmode="decimal" style="width:74px" value="' + (val == null ? "" : esc(String(val).replace(".", ","))) + '" placeholder="' + esc(pad) + '">' + (un ? " " + esc(un) : "") + (nota ? ' <span title="' + esc(nota) + '" style="color:var(--amarelo,#d99a1e)">(conferir)</span>' : "") + "</label>";
      }
      function lista(k, rot, ops, val) { return '<label style="display:inline-flex;gap:4px;align-items:center;margin:0 10px 6px 0">' + esc(rot) + ' <select class="inp" data-emb-par="' + k + '">' + ops.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(val) === String(o[0]) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select></label>"; }
      if (cSel) {
        h += '<fieldset style="border:1px solid var(--borda,#ccd);border-radius:8px;padding:8px 10px;margin:0 0 10px"><legend>Parâmetros da parede ' + esc(cSel.id) + "</legend>" +
          lista("familia", "Família do bloco", BG.FAMILIAS.map(function (f) { return [f, f]; }), cfg.familia) +
          campo("espacamento", "Espaçamento máximo", "m", g.espacamento, fmt(BG.PADRAO.espacamento), "padrão do projeto — conferir NBR 16868-1") +
          lista("bitola", "Bitola", BG.BITOLAS.map(function (b) { return [String(b), fmt(b, 1) + " mm"]; }), cfg.bitola) +
          campo("barras", "Barras por ponto", "", g.barras, String(BG.PADRAO.barras), "dimensionamento do projeto — conferir NBR 16868-1") +
          lista("fgk", "fgk do graute", BG.FGKS.map(function (f) { return [String(f), f + " MPa"]; }), cfg.fgk) +
          campo("transpasse", "Transpasse", "× φ", g.transpasse, cfg.transpasse != null ? fmt(cfg.transpasse, 1) : "", "padrão ABCP pelo fgk — conferir NBR 16868-1") +
          campo("areaFuro", "Área do furo", "m²", g.areaFuro, cfg.areaFuro != null ? fmt(cfg.areaFuro, 4) : "", "derivada da ABCP — vale a ficha do fornecedor") +
          '<div style="margin-top:4px"><label><input type="checkbox" data-emb-par="cantos"' + (cfg.cantos ? " checked" : "") + "> cantos</label> " +
          '<label><input type="checkbox" data-emb-par="encontros"' + (cfg.encontros ? " checked" : "") + "> encontros (T e X)</label> " +
          '<label><input type="checkbox" data-emb-par="bordasVao"' + (cfg.bordasVao ? " checked" : "") + "> bordas de vão</label> " +
          '<label><input type="checkbox" data-emb-par="bordasLivres"' + (cfg.bordasLivres ? " checked" : "") + "> bordas livres</label></div>" +
          '<div style="margin-top:6px"><button type="button" class="btn sm primary" data-emb="aplicar">Aplicar à parede ' + esc(cSel.id) + "</button> " +
          '<span class="muted">Vazio = o padrão (marcado "conferir"). Um Ctrl+Z desfaz.</span></div></fieldset>';
        var r = R.paredes[cSel.id];
        if (r) {
          var cg = BG.composicao("graute", r.cfg), ca = BG.composicao("aco", r.cfg);
          h += '<p data-emb="resumo" style="margin:0 0 6px"><b>Parede ' + esc(cSel.id) + ":</b> " + esc(BG.resumoTexto(r)) + " — módulo " + fmt((r.modulo || 0) * 100, 0) + " cm, barra de " + fmt(r.comprimentoBarra) + " m (altura " + fmt(r.altura) + " m + transpasse " + fmt(r.transpasseM || 0) + " m).</p>" +
            '<p class="muted" style="margin:0 0 6px">Composições: graute ' + (cg.codigo ? esc(cg.codigo) + (cg.descricao ? " — " + esc(cg.descricao) : "") : '<b style="color:var(--vermelho,#c0392b)">pendente</b> (' + esc(cg.motivo) + ")") +
            "; aço " + (ca.codigo ? esc(ca.codigo) + (ca.descricao ? " — " + esc(ca.descricao) : "") : '<b style="color:var(--vermelho,#c0392b)">pendente</b> (' + esc(ca.motivo) + ")") + ".</p>" +
            (r.avisos.length ? '<p style="color:var(--amarelo,#d99a1e);margin:0 0 6px">' + esc(r.avisos.join(" · ")) + "</p>" : "");
          var d = BG.desenho(st, vaos, cSel.id);
          h += '<div style="display:grid;gap:10px"><div><b>Planta</b> (furos grauteados hachurados)' + svgPlanta(d) + "</div><div><b>Elevação</b> (graute hachurado, barras em vermelho, transpasse tracejado)" + svgElevacao(d) + "</div></div>";
        } else h += '<p class="muted">Parede ' + esc(cSel.id) + " não está marcada como alvenaria estrutural.</p>";
      }
      raiz.innerHTML = h;
    },
    aplicarParametros: function () {
      var raiz = document.querySelector('[data-emb="graute"]'), BG = Gr(), id = this._grSel; if (!raiz || !BG || id == null) return false;
      var campos = {}, erro = null;
      raiz.querySelectorAll("[data-emb-par]").forEach(function (el) {
        var k = el.getAttribute("data-emb-par"), v;
        if (el.type === "checkbox") v = !!el.checked;
        else if (el.tagName === "SELECT") v = el.value;
        else { var n = lerNum(el.value); if (n == null) { campos[k] = null; return; } if (!isFinite(n)) { erro = "Número inválido em " + k + "."; return; } v = n; }
        var nv = BG.normalizar(k, v);
        if (nv === undefined) { erro = erro || "Valor fora da faixa em \"" + k + "\"."; return; }
        campos[k] = nv;
      });
      if (erro) { toast(erro, "erro"); return false; }
      var ok = enviar([{ op: "graute", id: id, campos: campos }], "Parâmetros do graute");
      if (!ok) { toast("Não consegui aplicar os parâmetros.", "erro"); return false; }
      var self = this; setTimeout(function () { self.pintarGraute(); }, 60);
      return true;
    },

    /* ================================================ GANCHOS DO 3D (js/bim.js)
     * api: { THREE, S, edit, scene, hits(), hint(t), fechou(), desarmar(),
     *        baseNivel(), vaos(st), alvo() } */
    montar3d: function (api) {
      if (!api || !api.THREE || !api.scene) return null;
      var THREE = api.THREE, edit = api.edit, grade = null, barras = new THREE.Group(), linhaA = null;
      barras.name = "graute-barras"; barras.renderOrder = 996; api.scene.add(barras);
      var matBarra = new THREE.LineBasicMaterial({ color: 0xc0392b, depthTest: false, transparent: true, opacity: 0.95 });
      var matGraute = new THREE.LineBasicMaterial({ color: 0x7f8c8d, depthTest: false, transparent: true, opacity: 0.8 });
      function hint(t) { if (api.hint) api.hint(t); }
      function tirarGrade() { if (grade) { api.scene.remove(grade); if (grade.geometry) grade.geometry.dispose(); if (grade.material) grade.material.dispose(); grade = null; } }
      function desenharGrade() {
        tirarGrade();
        var Pl = P(), p = Pl && Pl.ativo();
        if (!p || !previa() || !Pl.grade()) return;
        var g = new THREE.GridHelper(24, 48, 0x1f6fb2, 0x7fa7c9);
        g.material.transparent = true; g.material.opacity = 0.35; g.material.depthWrite = false;
        g.name = "plano-trabalho-grade"; g.renderOrder = 1;
        var n = new THREE.Vector3(p.n[0], p.n[1], p.n[2]).normalize();
        g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
        var alvo = api.alvo ? api.alvo() : null, o = new THREE.Vector3(p.o[0], p.o[1], p.o[2]);
        if (alvo) { var d = new THREE.Vector3().subVectors(alvo, o); o.add(d.sub(n.clone().multiplyScalar(d.dot(n)))); }
        g.position.copy(o);
        api.scene.add(g); grade = g;
      }
      /* o plano mudou: a base do editor (horizontal) ou o nível ativo de volta, a grade e a barra de status */
      if (P()) P().ouvir(function (p) {
        try { if (p && p.horizontal) edit.base = p.o[1]; else if (!p && api.baseNivel) edit.base = api.baseNivel(); } catch (e) {}
        desenharGrade(); pintarStatusPlano();
      });
      function desenharBarras(st) {
        barras.children.slice().forEach(function (o) { barras.remove(o); if (o.geometry) o.geometry.dispose(); });
        var BG = Gr(); if (!BG || !previa()) return;
        if (!(st.caixas || []).some(function (c) { return c.graute && c.graute.ativo; })) return;
        var R = BG.calcular(st, api.vaos ? api.vaos(st) : {}), pb = [], pg = [];
        (st.caixas || []).forEach(function (c) {
          var r = R.paredes[c.id]; if (!r) return;
          var y0 = (+c.cy || 0) - (+c.altura || 0) / 2, H = +c.altura || 0, t = (r.modulo || 0.2) * 0.35, co = Math.cos(+c.rotY || 0), si = Math.sin(+c.rotY || 0);
          r.pontos.forEach(function (p) {
            if (!p.compartilhado) pb.push(p.x, y0, p.z, p.x, y0 + H + (r.transpasseM || 0), p.z);
            /* o graute: o contorno do furo no pé e no topo */
            [y0 + 0.02, y0 + H - 0.02].forEach(function (y) {
              var q = [[-t, -t], [t, -t], [t, t], [-t, t]].map(function (k) { return [p.x + k[0] * co + k[1] * si, p.z - k[0] * si + k[1] * co]; });
              for (var i = 0; i < 4; i++) { var a = q[i], b = q[(i + 1) % 4]; pg.push(a[0], y, a[1], b[0], y, b[1]); }
            });
          });
        });
        function seg(arr, mat) { if (!arr.length) return; var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3)); var l = new THREE.LineSegments(g, mat); l.renderOrder = 996; l.raycast = function () {}; barras.add(l); }
        seg(pb, matBarra); seg(pg, matGraute);
      }
      return {
        clique: function (sub, e, hit, p) {
          var Pl = P(); if (!Pl) return false;
          if (sub === "plano-face" || sub === "plano-pegar") {
            var h = api.hits && api.hits()[0];
            if (!h || !h.point) { hint("Clique em cima de uma peça."); return true; }
            var ud = h.object && h.object.userData || {}, r;
            if (sub === "plano-face") {
              if (!h.face) { hint("Não achei a face clicada: clique numa face plana."); return true; }
              var n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
              r = Pl.definir({ tipo: "face", ponto: [h.point.x, h.point.y, h.point.z], normal: [n.x, n.y, n.z], elementoId: ud.mid === "edit" ? ud.expressID : null,
                               rotulo: (Math.abs(n.y) > 0.98 ? "face horizontal" : "face vertical") + (ud.mid === "edit" ? " da peça " + ud.expressID : " do modelo") });
            } else {
              if (ud.mid !== "edit") { hint("Peça do IFC importado: use \"Face de uma peça\"."); return true; }
              var st = edit.estado || { caixas: [] }, id = ud.expressID;
              var c = (st.caixas || []).concat(st.volumes || []).filter(function (x) { return String(x.id) === String(id); })[0];
              r = Pl.definir({ tipo: "elemento", caixa: c });
            }
            if (!r.ok) { hint(r.erro); return true; }
            if (api.desarmar) api.desarmar();
            hint(Pl.rotulo() + ". As ferramentas de desenho usam este plano; \"Voltar ao nível ativo\" em Plano de trabalho.");
            if (api.fechou) api.fechou();
            return true;
          }
          if (sub === "plano-linha") {
            if (!p) { hint("Não achei o ponto."); return true; }
            if (!linhaA) { linhaA = [p.x, p.z]; hint("Agora o segundo ponto da linha de referência."); return true; }
            var r2 = Pl.definir({ tipo: "linha", a: linhaA, b: [p.x, p.z], y: edit.base, rotulo: "linha de referência" });
            linhaA = null;
            if (!r2.ok) { hint(r2.erro); return true; }
            if (api.desarmar) api.desarmar();
            hint(Pl.rotulo() + "."); if (api.fechou) api.fechou();
            return true;
          }
          return false;
        },
        aoSub: function () { linhaA = null; },
        dica: function (sub) {
          return { "plano-face": "Plano de trabalho: clique numa FACE plana (topo da laje, face da parede, face de um volume).",
                   "plano-pegar": "Plano de trabalho: clique na peça cujo plano você quer usar.",
                   "plano-linha": "Plano de trabalho: clique os dois pontos da linha de referência (plano vertical)." }[sub] || "";
        },
        aposRebuild: function (st) { try { desenharBarras(st || { caixas: [] }); } catch (e) {} },
        grade: desenharGrade,
        _estado: function () { return { grade: !!grade, barras: barras.children.length, linhaA: linhaA }; }
      };
    }
  };

  global.BimEmBreveUI = BimEmBreveUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimEmBreveUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
