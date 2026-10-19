/* =====================================================================
 * biminstjanela.js — SELEÇÃO POR JANELA → "3D DO AMBIENTE" (item 8 das pendências do hidrossanitário, 18/10/2026).
 *
 * Com a prévia ?previa=hidro, a seleção por JANELA (arrastar o retângulo no 3D, na planta ou no corte) que pega peças
 * das instalações (tubo, conexão, caixa, ralo, registro) OFERECE abrir o "3D do ambiente" — a vista 3D recortada que o
 * js/hidpranchasui.js abre para um cômodo (caixa de corte justa + vista Instalações + câmera isométrica) — com a caixa
 * de corte AJUSTADA AO QUE FOI SELECIONADO. A oferta é um aviso pequeno com o botão "Abrir 3D do ambiente" (some
 * sozinho, ou no ×); nada muda na vista sem o clique.
 *
 * Reusa: BIM.caixaUids (a caixa das malhas selecionadas, a mesma da Caixa de seleção BX), BIM.caixaCorteEm (a do 3D do
 * ambiente) e BIM.vistaInstalacoes. Sem a prévia hidro: nada (a janela do master).
 *
 * PURO (Node, tools/test-hid-janela.js): idsInst, caixaInst, caixaCorte.
 * TELA: aposJanela(uids, origem) — o gancho no fim da janela do 3D (js/bim.js) e da planta/corte (js/bimselecao.js);
 *   abrir(uids) — a vista.
 * ===================================================================== */
(function (global) {
  "use strict";
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function dep(n, arq) { if (global[n]) return global[n]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function B() { return global.BIM || null; }

  /* folgas de DESENHO (não é norma): a caixa de corte em volta do que foi selecionado */
  var GEO = {
    folga: 0.30,      // hid:ok m de folga da caixa de corte em volta das peças (a louça e a parede de trás entram na vista)
    iso: [0.62, 0.48, 0.62],   // hid:ok direção da câmera isométrica (a mesma da Caixa de seleção BX, js/bimfita.js)
    oferta: 12000     // hid:ok ms que a oferta fica na tela
  };

  /* ================================================================ PURO */
  /* as peças de INSTALAÇÃO entre os uids ("edit:<id>"): trecho, peça, acessório e conexão deduzida da rede */
  function idsInst(estado, uids, rede) {
    var ins = (estado && estado.instalacoes) || {}, mapa = {};
    arr(ins.trechos).forEach(function (t) { mapa["edit:" + t.id] = { tipo: "trecho", el: t }; });
    arr(ins.pecas).forEach(function (k) { mapa["edit:" + k.id] = { tipo: "peca", el: k }; });
    arr(ins.acessorios).forEach(function (a) { mapa["edit:" + a.id] = { tipo: "acessorio", el: a }; });
    arr(rede && rede.conexoes).forEach(function (c) { mapa["edit:" + c.id] = { tipo: "conexao", el: c }; });
    var out = [], visto = {};
    arr(uids).forEach(function (u) { var s = String(u); if (mapa[s] && !visto[s]) { visto[s] = 1; out.push({ uid: s, tipo: mapa[s].tipo, el: mapa[s].el }); } });
    return out;
  }
  /* a caixa (m, mundo) das peças de instalação: o eixo do tubo com o raio, a peça pelo tamanho do catálogo, o acessório
     pelas faces, a conexão pelo nó. null = nenhuma peça de instalação na seleção */
  function caixaInst(estado, uids, rede) {
    var I = BI(), lista = idsInst(estado, uids, rede); if (!lista.length) return null;
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    /* r = folga em volta do ponto; ry (opcional) = a folga só na vertical (a peça vai do tampo ao fundo, sem raio em y) */
    function poe(x, y, z, r, ry) { r = r || 0; var p = [x, y, z]; for (var k = 0; k < 3; k++) { if (!isFinite(p[k])) return; var rk = k === 1 && ry != null ? ry : r; mn[k] = Math.min(mn[k], p[k] - rk); mx[k] = Math.max(mx[k], p[k] + rk); } }
    lista.forEach(function (it) {
      var e = it.el;
      if (it.tipo === "trecho") { var rt = num(e.dn, 0) / 2000 || Math.max(num(e.larg, 0), num(e.alt, 0)) / 2; poe(e.p1.x, e.p1.y, e.p1.z, rt); poe(e.p2.x, e.p2.y, e.p2.z, rt); }
      else if (it.tipo === "peca") {
        /* a mesma forma do desenho da peça: caixa centrada na cota (hh), cilindro do tampo para baixo (h; a caixa de
           inspeção, a profundidade da instância) */
        var P = (I && I.PECAS && I.PECAS[e.peca]) || {}, cx = P.forma === "caixa", rp = cx ? Math.max(num(P.w, 0.1), num(P.d, 0.1)) / 2 : num(P.r, 0.05);
        var y0 = cx ? e.y - num(P.hh, 0.1) / 2 : e.y - (P.profVariavel && num(e.prof, 0) > 0 ? num(e.prof, 0) : num(P.h, 0.1)), y1 = cx ? e.y + num(P.hh, 0.1) / 2 : e.y;
        poe(e.x, y1, e.z, rp, 0); poe(e.x, y0, e.z, rp, 0);
      } else if (it.tipo === "acessorio") { var ra = num(e.dn, 25) / 1000; if (e.a) poe(e.a.x, e.a.y, e.a.z, ra); if (e.b) poe(e.b.x, e.b.y, e.b.z, ra); if (!e.a && e.centro) poe(e.centro.x, e.centro.y, e.centro.z, ra); }
      else poe(e.x, e.y, e.z, num(e.dn, 40) / 2000);
    });
    if (!isFinite(mn[0]) || !isFinite(mx[0])) return null;
    return { min: mn.map(r4), max: mx.map(r4), n: lista.length, uids: lista.map(function (x) { return x.uid; }) };
  }
  /* a caixa de CORTE: a união das caixas (a das malhas, quando o 3D a dá, e a do modelo) com a folga */
  function caixaCorte(caixas, folga) {
    var f = folga == null ? GEO.folga : num(folga, GEO.folga), mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], tem = false;
    arr(caixas).forEach(function (c) {
      if (!c || !c.min || !c.max) return;
      for (var k = 0; k < 3; k++) { if (!isFinite(c.min[k]) || !isFinite(c.max[k])) return; }
      tem = true; for (var j = 0; j < 3; j++) { mn[j] = Math.min(mn[j], c.min[j]); mx[j] = Math.max(mx[j], c.max[j]); }
    });
    if (!tem) return null;
    return { min: mn.map(function (v) { return r4(v - f); }), max: mx.map(function (v) { return r4(v + f); }) };
  }

  /* ================================================================ TELA */
  var T = {
    _of: null, _tmr: null, ultima: null,
    ativo: function () { var U = global.BimInstUI; return !!(U && U._previaHidro && U._previaHidro()); },
    _estado: function () { var b = B(); try { var e = b && b.editarEstado ? b.editarEstado() : null; return e ? e.estado : null; } catch (x) { return null; } },
    _rede: function () { var U = global.BimInstUI; return U ? U._ultimaRede : null; },
    /* a seleção por janela terminou: com peça de instalação e a prévia hidro, a OFERTA do 3D do ambiente */
    aposJanela: function (uids, origem) {
      T.fecharOferta();
      if (!T.ativo()) return null;
      var cx = caixaInst(T._estado(), uids, T._rede()); if (!cx) return null;
      T.ultima = { uids: cx.uids, origem: origem || "3d", t: Date.now() };
      T._mostrarOferta(cx.n);
      return T.ultima;
    },
    _mostrarOferta: function (n) {
      if (typeof document === "undefined" || !document.body) return;
      var d = document.createElement("div");
      d.className = "inst-amb3d-oferta"; d.setAttribute("role", "status"); d.setAttribute("data-inst-amb3d", "oferta");
      d.style.cssText = "position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:10040;display:flex;gap:8px;align-items:center;background:var(--fundo-card,#fff);color:var(--texto,#1b1d20);border:1px solid var(--borda,#c9d1da);border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.18);padding:6px 8px 6px 12px;font-size:12.5px";
      var t = document.createElement("span"); t.textContent = n + (n === 1 ? " peça" : " peças") + " das instalações na janela.";
      var b = document.createElement("button"); b.type = "button"; b.className = "btn sm primary"; b.setAttribute("data-inst-amb3d", "abrir"); b.textContent = "Abrir 3D do ambiente";
      b.title = "Abre a vista 3D recortada só no que foi selecionado (caixa de corte justa, arquitetura translúcida)";
      b.onclick = function () { var u = T.ultima ? T.ultima.uids : []; T.fecharOferta(); T.abrir(u); };
      var x = document.createElement("button"); x.type = "button"; x.className = "btn sm ghost"; x.setAttribute("aria-label", "Fechar"); x.setAttribute("data-inst-amb3d", "fechar"); x.textContent = "×";
      x.onclick = function () { T.fecharOferta(); };
      d.appendChild(t); d.appendChild(b); d.appendChild(x);
      document.body.appendChild(d); T._of = d;
      T._tmr = setTimeout(function () { T.fecharOferta(); }, GEO.oferta);
    },
    fecharOferta: function () { if (T._tmr) { clearTimeout(T._tmr); T._tmr = null; } if (T._of && T._of.parentNode) T._of.parentNode.removeChild(T._of); T._of = null; },
    /* abre o 3D do ambiente na caixa da seleção: a vista 3D, a vista Instalações e a caixa de corte justa */
    abrir: function (uids) {
      var b = B(); if (!b || !b.caixaCorteEm) return { ok: false, motivo: "sem o visualizador 3D" };
      var ci = caixaInst(T._estado(), uids, T._rede());
      if (!ci) return { ok: false, motivo: "nenhuma peça das instalações na seleção" };
      var cm = null; try { cm = b.caixaUids ? b.caixaUids(ci.uids) : null; } catch (e) { cm = null; }
      var cc = caixaCorte([ci, cm]);
      var G = global.Gestao;
      try { if (G && G._bimVxAtivar && G._bimVxEst && G._bimVxEst().ativa !== "3d") G._bimVxAtivar("3d"); } catch (eA) {}
      try { if (b.vistaInstalacoes) b.vistaInstalacoes(true); } catch (eV) {}
      var ok = false; try { ok = !!b.caixaCorteEm(cc.min, cc.max, GEO.iso); } catch (eC) { ok = false; }
      try { var R = global.BimRibbon; if (R && ok && R.setAtivo) R.setAtivo("caixa-corte", true); } catch (eR) {}
      var msg = ok ? "3D do ambiente: " + ci.n + (ci.n === 1 ? " peça" : " peças") + " das instalações na caixa de corte (arquitetura translúcida). Desligue a Caixa de corte (tecla C) para ver tudo." : "Não consegui abrir o 3D do ambiente (a vista 3D ainda não abriu).";
      try { if (global.BimShell && BimShell.status) BimShell.status(msg); } catch (eS) {}
      T.ultimaVista = { ok: ok, min: cc.min, max: cc.max, n: ci.n };
      return T.ultimaVista;
    }
  };

  var BimInstJanela = { VERSAO: 1, GEO: GEO, idsInst: idsInst, caixaInst: caixaInst, caixaCorte: caixaCorte,
    aposJanela: T.aposJanela, abrir: T.abrir, fecharOferta: T.fecharOferta, tela: T };
  global.BimInstJanela = BimInstJanela;
  if (typeof module !== "undefined" && module.exports) module.exports = BimInstJanela;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
