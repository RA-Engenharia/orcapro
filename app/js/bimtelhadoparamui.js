/* =====================================================================
 * bimtelhadoparamui.js — TELHADO PARAMÉTRICO (o conjunto): a fiação da tela.
 * Frente telhado-param (09/11/2026). O motor puro é o js/bimtelhadoparam.js; o desenho (retângulo, contorno, paredes, edificação,
 * selecionar linhas) e a prévia em tracejado vêm da ferramenta de Telhado de sempre (js/bimp3ui.js, com `cfg.telhado.conjunto`).
 *
 *   Fita › Arquitetura › Telhado › "Telhado paramétrico" (id telhado-param)
 *     1) abre a PLANTA DE COBERTURA do nível mais alto (js/bim2dui.js criarPlantaCobertura);
 *     2) arma a ferramenta de Telhado no modo conjunto (1 água, telha sanduíche do catálogo);
 *     3) o usuário desenha/puxa o contorno; a ferramenta pergunta a ARESTA DA QUEDA (clique, com a seta ao vivo; Enter aceita a sugerida);
 *     4) o lote nasce (um Ctrl+Z desfaz tudo) e abre o RESUMO com as pendências — cada uma com a leitura da obra e as saídas.
 *
 * Sem a prévia do modelador NADA daqui roda: `registrar` sai na hora.
 * ===================================================================== */
(function (global) {
  "use strict";
  function arr(v) { return Array.isArray(v) ? v : []; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]; }); }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function PP() { return global.BimTelhadoParam || null; }
  function B() { return global.BIM || null; }
  function estado() { try { var b = B(); return b && b.editarEstado ? b.editarEstado().estado : null; } catch (e) { return null; } }
  function obraECliente() {
    var o = null, c = null;
    try {
      var G = global.Gestao, S = global.Store, A = global.Auth;
      if (G && G._bimSel && S && A) { o = S.obter(A.empresaId(), "obras", G._bimSel) || null; if (o && o.clienteId) c = S.obter(A.empresaId(), "clientes", o.clienteId) || null; }
    } catch (e) { /* sem obra aberta */ }
    return { obra: o, cliente: c };
  }
  function niveis() { try { var G = global.Gestao; return G && G._nivLer ? (global.Niveis && global.Niveis.listar ? global.Niveis.listar(G._nivLer()) : G._nivLer()) || [] : []; } catch (e) { return []; } }
  /* o nível mais alto da obra (a cobertura fica nele) */
  function nivelMaisAlto() {
    var L = arr(niveis()).filter(function (n) { return n && fin(Number(n.elevacao)); });
    L.sort(function (a, b) { return Number(b.elevacao) - Number(a.elevacao); });
    return L[0] || null;
  }
  function topoDoModelo(st) {
    var topo = -Infinity;
    arr(st && st.caixas).forEach(function (c) { var t = (+c.cy || 0) + (+c.altura || 0) / 2; if (t > topo) topo = t; });
    arr(st && st.telhados).forEach(function (t) { if (t && t.ok && fin(+t.cotaCumeeira)) topo = Math.max(topo, +t.cotaCumeeira); });
    return isFinite(topo) ? topo : null;
  }

  /* as saídas do cartão que têm ação de verdade (as demais viram nota de texto: botão que não faz nada é defeito) */
  var ACOES_PEND = { "refazer-verificacao": "Refazer a verificação das terças", "inverter-queda": "Inverter queda", "informar-v0": "Informar V0 (campo abaixo)" };
  var UI = {
    ativo: previa,
    /* o campo V0 das Propriedades do telhado (js/bimp3ui.js secoesTelhado → gestao aoMudarExtra) */
    mudar: function (uid, pid, valor) {
      var tid = String(uid || "").replace(/^edit:/, "");
      if (pid === "tpc:v0") return this.refazer(tid, valor);
      return false;
    },
    /* abre a planta de cobertura do nível mais alto (cria se não houver) e a mostra; devolve o nome ou null (sem planta 2D, fica no que está) */
    abrirPlantaCobertura: function () {
      var nv = nivelMaisAlto(), D = global.Bim2D, M = global.BimModeloVista;
      if (!nv || !D || !D.criarPlantaCobertura) return null;
      var est = M && M.estado ? M.estado() : null, existente = null;
      if (est && est.vistas) Object.keys(est.vistas).forEach(function (k) { var v = est.vistas[k]; if (v && v.modeloId === "ra-planta-cobertura" && String(v.nivelId) === String(nv.id)) existente = v; });
      try {
        if (existente && D._p6Depois) { D._p6Depois(existente, true, "Planta de cobertura aberta."); return existente.nome; }
        var v2 = D.criarPlantaCobertura(nv, topoDoModelo(estado()));
        return v2 && v2.nome ? v2.nome : "Planta de cobertura — " + nv.nome;
      } catch (e) { return null; }
    },
    iniciar: function (armar, e) {
      var P3 = global.BimP3UI;
      if (e && e.ligado === false) { if (P3 && P3.conjuntoLigar) P3.conjuntoLigar(false); var b = B(); if (b && b.editarArmar) b.editarArmar(null); return true; }
      if (!P3 || !P3.conjuntoLigar || !PP()) { status("O Telhado paramétrico não carregou."); return false; }
      var nome = this.abrirPlantaCobertura();
      P3.conjuntoLigar(true);
      var ok = armar ? armar("telhado")(e) : false;
      status("Telhado paramétrico" + (nome ? " — " + nome : "") + ": desenhe o contorno (retângulo, contorno, paredes, edificação ou linhas) e clique a aresta onde cai a água.");
      return ok !== false;
    },
    /* a fita (Arquitetura › Telhado) */
    registrar: function (reg, arqui, opts, armar) {
      var pv = opts && opts.previa != null ? !!opts.previa : previa();
      var R = global.BimRibbon;
      if (!pv || !R || !reg || !PP()) return false;
      R.acrescentar("arquitetura", "Arquitetura", "Telhado", [
        { id: "telhado-param", rotulo: "Telhado\nparamétrico", icone: "telhado", grande: true, tipo: "alterna",
          dica: "Telhado paramétrico (uma água, aço): abre a planta de cobertura, você desenha o contorno e clica a aresta onde cai a água. Sai o CONJUNTO vinculado — telhado sanduíche, forro, terças com X e correntes, rufos, calha (sem tubo de queda) e testeira — com a altura e a inclinação lidas da obra, num Ctrl+Z. Só a terça é verificada (NBR 14762); o resto fica a conferir pelo cálculo." }
      ]);
      if (R._EXCLUSIVOS && R._EXCLUSIVOS.indexOf("telhado-param") < 0) R._EXCLUSIVOS.push("telhado-param");
      var self = this;
      reg["telhado-param"] = function (e) { return self.iniciar(armar, e); };
      return true;
    },
    /* a entrada do motor a partir da ferramenta: o contorno, a telha, o forro, o V0, a inclinação digitada/seguida e a obra */
    entrada: function (c, conj, k, st, b) {
      var oc = obraECliente(), nv = conj.nivel || {}, ts = arr(st && st.telhados).filter(function (t) { return t && t.ok && !t.conjunto && fin(Number(t.inclinacao)); }).map(function (t) { return Number(t.inclinacao); }).sort(function (x, y) { return x - y; });
      var med = ts.length ? ts[Math.floor((ts.length - 1) / 2)] : null;
      var P3 = global.BimP3UI, e = {
        contorno: conj.contorno, arestaQueda: k, tipoId: c.tipoId, forroTipoId: c.forroTipoId, amostras: conj.amostras || [], nivel: { id: nv.id != null ? nv.id : null, elevacao: +nv.elevacao || +conj.base || 0, peDireito: +nv.peDireito > 0 ? +nv.peDireito : undefined },
        beiral: P3 && P3.beiralEf ? P3.beiralEf(c) : c.beiral, v0: c.v0, medianaTelhados: med, obra: oc.obra, cliente: oc.cliente, ops: b && b.editarOps ? b.editarOps() : []
      };
      /* a altura do vento é do CHÃO da obra: o nível mais baixo cadastrado (a ferramenta abre no nível mais alto) */
      var elevs = arr(niveis()).map(function (n) { return Number(n && n.elevacao); }).filter(fin);
      if (elevs.length) e.cotaBase = Math.min.apply(null, elevs);
      if (c.seguir && c.seguir.ok) e.inclinacaoPeca = c.seguir.inclinacao;
      if (c.inclMexida && fin(c.inclinacao) && c.inclinacao > 0) e.inclinacao = c.inclinacao;
      return e;
    },
    /* o RESUMO: o que foi lido da obra, o que saiu e cada pendência (com a saída que dá para aplicar) */
    html: function (r, k) {
      var cor = { alta: "#c0392b", aviso: "#b9770e", info: "#2471a3" };
      var h = '<div data-tp-resumo="1"><p style="margin:0 0 8px"><b>' + esc(r.resumo.titulo) + "</b> — " + esc(r.id) + ".</p>";
      h += '<ul style="margin:0 0 10px 18px;padding:0">' + r.resumo.linhas.map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + "</ul>";
      var lg = r.leitura || {};
      h += '<div style="font-size:12px;opacity:.85;margin-bottom:8px">Lido da obra — <b>altura necessária no pé da água: ' + esc(String(lg.alturaNecessaria).replace(".", ",")) + ' m</b> (' + esc(lg.fonteAltura) + "). Inclinação: <b>" + esc(String(lg.inclinacaoPct).replace(".", ",")) + " %</b> (" + esc(lg.fonteInclinacao) + "). Apoios: " + esc(lg.apoios) + " linha(s) (" + esc(lg.fonteApoios) + ").</div>";
      var pend = arr(r.pendencias).filter(function (p) { return p.gravidade !== "info"; }), info = arr(r.pendencias).filter(function (p) { return p.gravidade === "info"; });
      h += '<h4 style="margin:8px 0 4px">Pendências (' + pend.length + ')</h4>';
      if (!pend.length) h += "<p>Nenhuma.</p>";
      var PC = global.ProblemaCard;
      pend.forEach(function (p, i) {
        if (PC) {   /* o CARTÃO DE PROBLEMA da casa (js/problemacard.js): o que é, "Corrigir" com ação de verdade e "Mostrar no 3D" */
          var v0h = p.campo === "v0" ? '<div style="margin-top:4px"><label>V0 (m/s) <input data-tp-v0 inputmode="decimal" style="width:70px" placeholder="35"></label> <button type="button" data-tp-acao="v0">Refazer a verificação com este V0</button></div>' : "";
          h += PC.html({ tipo: p.tipo, titulo: p.titulo, texto: p.texto, gravidade: p.gravidade === "alta" ? "erro" : "aviso", pecas: [r.id], solucoes: arr(p.solucoes).map(function (s) { return { id: s.id, texto: s.texto, muda: s.muda }; }) },
            { attrs: 'data-tp-pend="' + esc(p.tipo) + '"', indice: i, acoes: ACOES_PEND, depois: function () { return v0h; } });
          return;
        }
        h += '<div data-tp-pend="' + esc(p.tipo) + '" style="border-left:4px solid ' + (cor[p.gravidade] || "#888") + ';padding:4px 8px;margin:6px 0;background:rgba(127,127,127,.08)"><b>' + esc(p.titulo) + "</b><br><span>" + esc(p.texto) + "</span>";
        if (p.campo === "v0") h += '<div style="margin-top:4px"><label>V0 (m/s) <input data-tp-v0 inputmode="decimal" style="width:70px" placeholder="35"></label> <button type="button" data-tp-acao="v0">Refazer a verificação com este V0</button></div>';
        arr(p.solucoes).forEach(function (s) { if (s.id === "inverter-queda") h += ' <button type="button" data-tp-acao="inverter">Inverter queda</button> <small>' + esc(s.muda) + "</small>"; else if (s.id !== "informar-v0") h += '<div style="font-size:12px;opacity:.85">› ' + esc(s.texto) + (s.muda ? " — " + esc(s.muda) : "") + "</div>"; });
        h += "</div>"; void i;
      });
      if (info.length) h += '<details style="margin-top:6px"><summary>Notas (' + info.length + ")</summary>" + info.map(function (p) { return "<p style=\"margin:4px 0\"><b>" + esc(p.titulo) + ":</b> " + esc(p.texto) + "</p>"; }).join("") + "</details>";
      return h + "</div>";
    },
    mostrarResumo: function (r, k) {
      var CU = global.BimCoberturaUI, html = this.html(r, k), self = this;
      self._ultimo = { r: r, k: k };
      if (typeof document === "undefined") return null;
      var ov = CU && CU.janela ? CU.janela("Telhado paramétrico — resumo", html) : null;
      if (!ov) { ov = document.createElement("div"); ov.id = "cob-modal"; ov.innerHTML = html; document.body.appendChild(ov); }
      if (global.ProblemaCard) global.ProblemaCard.ligar(ov, { corrigir: function (solId) {
        if (solId === "refazer-verificacao") { var i0 = ov.querySelector("[data-tp-v0]"); self.refazer(r.id, i0 ? i0.value : ""); }
        else if (solId === "inverter-queda") self.inverter(r.id);
        else if (solId === "informar-v0") { var i1 = ov.querySelector("[data-tp-v0]"); if (i1 && i1.focus) i1.focus(); }
      } });
      ov.addEventListener("click", function (ev) {
        var a = ev.target && ev.target.getAttribute ? ev.target.getAttribute("data-tp-acao") : null; if (!a) return;
        if (a === "v0") { var inp = ov.querySelector("[data-tp-v0]"); self.refazer(r.id, inp ? inp.value : ""); }
        if (a === "inverter") self.inverter(r.id);
      });
      return ov;
    },
    /* "Refazer a verificação": V0 novo (ou a geometria mudou) — grava conjunto.calc novo, num Ctrl+Z */
    refazer: function (idTelhado, v0txt) {
      var b = B(), st = estado(), P = PP(); if (!b || !st || !P) return false;
      var v = parseFloat(String(v0txt == null ? "" : v0txt).replace(",", "."));
      var r = P.refazerVerificacao(st, idTelhado, fin(v) && v > 0 ? { v0: v } : {});
      if (!r.op) { status(r.motivo || "Não deu para refazer a verificação."); return false; }
      var ok = !!b.editarLote({ op: "lote", id: "tp-verif-" + idTelhado + "-" + new Date().getTime(), origem: "telhado-param", ops: [r.op] });
      status((r.texto || "") + (ok ? "" : " (não gravou)"));
      var ov = typeof document !== "undefined" ? document.getElementById("cob-modal") : null; if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
      return ok;
    },
    inverter: function (idTelhado) {
      var T = global.BimTelhado, b = B(); if (!T || !T.inverterNoModelo || !b) return false;
      var r = T.inverterNoModelo(idTelhado);
      status(r.ok ? "Queda invertida: calha, rufo e testeira foram para a aresta " + (r.para + 1) + ". Refaça a verificação das terças." : (r.erro || "Não deu para inverter."));
      var ov = typeof document !== "undefined" ? document.getElementById("cob-modal") : null; if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
      return !!r.ok;
    }
  };
  global.BimTelhadoParamUI = UI;
  if (typeof module !== "undefined" && module.exports) module.exports = UI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
