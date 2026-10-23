/* =====================================================================
 * hidpiscinaui.js — PISCINA na tela (fiação FINA do js/hidpiscina.js, js/hidpiscinarede.js e js/hidpiscinadoc.js).
 * Frente PISCINA, 18/10/2026.
 *
 *  · bloco "Piscina" no painel Instalações (js/hidcalcui.js chama html/clique/campo — prefixo "pisc-"/"pisc:");
 *  · RECONHECER: a piscina do modelo (volume "Piscina", recorte, laje/IFC com o nome) vira a op hidPiscina com um clique;
 *    sem elemento, "Desenhar contorno" usa o traço/volume selecionado ou o retângulo informado;
 *  · LANÇAR: dimensiona e lança tudo num LOTE (um Ctrl+Z): casa de máquinas, equipamentos, dispositivos e tubos;
 *  · ASSOCIATIVO: arrastar a CASA DE MÁQUINAS (ou mudar a piscina no modelo) refaz todas as tubulações e confere de novo a
 *    sucção (NPSH, autoescorva, bomba na curva); não atendeu → aviso com "Corrigir". O lote automático se ENCADEIA com o
 *    movimento da pessoa: um Ctrl+Z desfaz os dois (o js/biminstui.js chama HidPiscinaUI.aoReconstruir a cada replay);
 *  · DOCUMENTOS: memorial, manual, planilha e pranchas da piscina; e o "Gerar documentos"/"Gerar pranchas" das outras
 *    frentes recebe as seções/folhas da piscina pelos GANCHOS instalados abaixo (envolvem HidDocumentos.gerar e
 *    HidPranchas.gerar sem mexer neles).
 * ⚠ DESFAZER: depois de um Ctrl+Z a casa e os tubos podem ficar desencontrados de propósito — o estado vira "aceito" e só
 *   um NOVO movimento da casa refaz (senão o lote voltava sozinho e o Ctrl+Z nunca desfazia).
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(n) { return global[n] || null; }
  function B() { return global.BIM || null; }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function f2(v) { return v == null || !isFinite(v) ? "—" : (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  function status(t) { try { if (global.BimShell && BimShell.status) BimShell.status(t); } catch (e) {} }
  var LS = "orcapro:hidpiscina:params";
  /* parâmetros de partida (o usuário troca no bloco; ficam por navegador) — critério de tela, não norma */
  var PADRAO = { uso: "residencial_privativa", construcao: "alvenaria", succao: "dois_drenos", cmNivel: "afogada", descarte: "pluvial",
                 hidro: { ativo: false, bocais: 6 }, aquecimento: { tipo: "nenhum", clima: "medio" }, iluminacao: { ativo: true }, tratamento: "clorador" };   // hid:ok padrão da tela
  function lerParams() { try { var p = JSON.parse(localStorage.getItem(LS) || "null"); return p && typeof p === "object" ? p : JSON.parse(JSON.stringify(PADRAO)); } catch (e) { return JSON.parse(JSON.stringify(PADRAO)); } }

  var U = {
    VERSAO: 1, ultimo: null, _ocupado: false, _agendado: false, _len: null, _lote: null, _aceito: {}, params: lerParams(),
    _ctx: function (st) {
      var b = B(); if (!b || !b.editarOps) return null;
      var estado = st || null;
      if (!estado) { var e = b.editarEstado ? b.editarEstado() : null; if (!e || !e.estado) return null; estado = e.estado; }
      return { b: b, estado: estado, ops: b.editarOps(), avaliarFam: function (f, t, i) { return b.familiaAvaliar(f, t, i); } };
    },
    _salvarParams: function () { try { localStorage.setItem(LS, JSON.stringify(U.params)); } catch (e) {} },
    _redesenhar: function () { try { var H = dep("HidCalcUI"); if (H && H.redesenhar) H.redesenhar(); } catch (e) {} },
    _elementosIfc: function () {
      /* IFC importado: os elementos com nome de piscina (a caixa envolvente); sem a API, nenhum */
      var b = B(), out = [];
      try { if (b && b.ifcElementos) arr(b.ifcElementos(/piscin|pool/i)).forEach(function (x) { out.push(x); }); } catch (e) {}
      return out;
    },
    reconhecer: function () { var c = U._ctx(), HP = dep("HidPiscina"); if (!c || !HP) return { piscinas: [], candidatos: [] }; return HP.reconhecer(c.estado, { elementosIfc: U._elementosIfc() }); },

    /* ---------------- grava um lote (encadear = o lote automático depois do movimento da pessoa: um Ctrl+Z desfaz os dois) */
    _gravar: function (c, ops, prefixo, encadear) {
      if (!ops.length) return false;
      U._ocupado = true; var ok = false;
      try { ok = c.b.editarLote({ op: "lote", id: prefixo + "-" + String(new Date().getTime()), origem: "hidpiscina", ops: JSON.parse(JSON.stringify(ops)) }); } finally { U._ocupado = false; }
      var c2 = U._ctx(); if (c2) { U._len = c2.ops.length; U._lote = { len: U._len, encadear: !!encadear }; }
      return ok;
    },
    /* a op da piscina + o lançamento (rede) num lote só */
    _lancar: function (c, opsAntes, pid, encadear, prefixo) {
      var Rd = dep("HidPiscinaRede"), BE = dep("BimEdit"); if (!Rd || !BE) return null;
      var todos = c.ops.concat([{ op: "lote", id: "previa", ops: opsAntes }]), est = BE.aplicar(todos);
      var R = Rd.gerar({ estado: est, avaliarFam: c.avaliarFam, ops: todos, piscina: pid, opcoes: { elementosIfc: U._elementosIfc() } });
      if (!R.ok) { U.ultimo = { ok: false, rede: R, erro: (R.pendencias[0] || {}).motivo || "não foi possível lançar a piscina" }; U._redesenhar(); return U.ultimo; }
      var ops = opsAntes.concat(R.ops), o1 = ops.filter(function (o) { return o.op === "familia" && /-cm$/.test(o.id); })[0];
      /* o resumo vai na op da casa de máquinas (o sanear guarda o campo): o memorial e o "aceito" leem dela */
      if (o1) o1.piscInfo = { id: pid, cm: { x: o1.x, z: o1.z }, status: R.dim && R.dim.status, avisos: R.avisos.length, pendencias: R.pendencias.length };
      var ok = U._gravar(c, ops, prefixo || "hidpisc", encadear);
      U.ultimo = { ok: ok, rede: R, quando: new Date().getTime() };
      U._aceito[pid] = o1 ? { x: o1.x, z: o1.z } : null;
      status(ok ? "Piscina lançada: casa de máquinas, " + R.dispositivos.length + " dispositivos e " + R.linhas.length + " linhas" + (R.avisos.length ? " — " + R.avisos.length + " aviso(s)" : "") + ". Ctrl+Z desfaz." : "O editor recusou o lançamento da piscina.");
      U._redesenhar();
      return U.ultimo;
    },
    /* ---------------- ações */
    usarCandidato: function (i) {
      var c = U._ctx(), rec = U.reconhecer(), cand = rec.candidatos[Number(i) || 0]; if (!c || !cand) return null;
      var pid = "pisc" + (arr(c.estado.hidPiscinas).length + 1);
      var op = { op: "hidPiscina", id: pid, nome: cand.nome || "Piscina", ref: cand.ref, params: JSON.parse(JSON.stringify(U.params)) };
      return U._lancar(c, [op], pid, false, "hidpisc");
    },
    desenhar: function (contorno, opcoes) {
      opcoes = opcoes || {};
      var c = U._ctx(); if (!c || arr(contorno).length < 3) return null;   // hid:ok polígono mínimo
      var pid = opcoes.id || ("pisc" + (arr(c.estado.hidPiscinas).length + 1));
      var op = { op: "hidPiscina", id: pid, nome: opcoes.nome || "Piscina", contorno: contorno.map(function (p) { return { x: Number(p.x), z: Number(p.z) }; }), yBorda: num(opcoes.yBorda, 0),
                 profRasa: num(opcoes.profRasa, null), profFunda: num(opcoes.profFunda, null), params: JSON.parse(JSON.stringify(U.params)) };
      if (opcoes.cm) op.cm = opcoes.cm;
      return U._lancar(c, [op], pid, false, "hidpisc");
    },
    relancar: function (pid, extra) {
      var c = U._ctx(); if (!c) return null;
      var p = arr(c.estado.hidPiscinas).filter(function (x) { return !pid || x.id === pid; })[0]; if (!p) return null;
      var op = { op: "hidPiscina", id: p.id, params: JSON.parse(JSON.stringify(U.params)) };
      Object.keys(extra || {}).forEach(function (k) { op[k] = extra[k]; });
      return U._lancar(c, [op], p.id, false, "hidpisc");
    },
    /* PROJETO DA PISCINA EM UM CLIQUE (frente C, 19/10/2026): reconhece (o volume "Piscina" vira a op), lança tudo (casa de
       máquinas, dispositivos, sucção, retorno, descarte na caixa receptora, drenagem, reposição) e abre o documento único
       (memorial + lista de material + pranchas) */
    umClique: function () {
      var c = U._ctx(); if (!c) return null;
      var r = arr(c.estado.hidPiscinas).length ? U.relancar(null) : (U.reconhecer().candidatos.length ? U.usarCandidato(0) : null);
      if (!r) { U.ultimo = { ok: false, erro: "Nenhuma piscina no modelo: modele o volume da piscina (nome \"Piscina\") e clique de novo." }; U._redesenhar(); return U.ultimo; }
      if (r.ok) U.documentos();
      return r;
    },
    /* o documento único da piscina (memorial + lista de material + pranchas) */
    documentos: function () {
      var D = dep("HidPiscinaDoc"), R = U._rede(), c = U._ctx(); if (!D || !R || !c || !D.pacote) return null;
      var g = D.pacote(c.estado, c.avaliarFam, R, U._info());
      if (g && g.ok) { U.docHtml = g.html; U.ultimoPacote = g; U._abrir(g.html); status("Projeto da piscina: memorial, lista de material e pranchas abertos numa aba."); }
      return g;
    },
    /* depois do "Traçar automaticamente" com a piscina no lote: este bloco mostra o lançamento, a casa de máquinas fica aceita
       onde o plano pôs (não relança sozinho) e o documento único abre junto */
    aposTracar: function (lista) {
      var ult = null;
      arr(lista).forEach(function (p) { if (!p || !p.rede) return; ult = p; U._aceito[p.id] = p.cm || null; });
      if (!ult) return null;
      var c = U._ctx(); if (c) { U._len = c.ops.length; U._lote = null; }
      U.ultimo = { ok: true, rede: ult.rede, quando: new Date().getTime() };
      U._redesenhar();
      return U.documentos();
    },
    /* Corrigir de um aviso: mover a casa para o melhor lugar, ou trocar um parâmetro */
    corrigir: function (i, j) {
      var u = U.ultimo, a = u && u.rede && u.rede.avisos[Number(i)], ac = a && (arr(a.acoes)[Number(j) || 0] || a.acao); if (!ac) return null;
      var pid = u.rede.geometria && u.rede.geometria.id;
      if (ac.tipo === "moverCM" && isFinite(Number(ac.x))) return U.relancar(pid, { cm: { x: Number(ac.x), z: Number(ac.z) } });
      if (ac.tipo === "param") {
        /* campo com ponto ("aquecimento.temperatura") = parâmetro dentro do grupo */
        var ks = String(ac.campo).split("."), alvo = U.params;
        for (var q = 0; q < ks.length - 1; q++) { if (!alvo[ks[q]] || typeof alvo[ks[q]] !== "object") alvo[ks[q]] = {}; alvo = alvo[ks[q]]; }
        alvo[ks[ks.length - 1]] = ac.valor; U._salvarParams(); return U.relancar(pid);
      }
      return null;
    },
    /* ---------------- ASSOCIATIVO: o replay viu a casa de máquinas noutro lugar → refaz (fora do replay) */
    aoReconstruir: function (st) {
      U._st = st || null;
      if (U._agendado || U._ocupado) return;
      U._agendado = true;
      setTimeout(function () { U._agendado = false; var s0 = U._st; U._st = null; try { U.processar(s0); } catch (e) { try { console.warn("HidPiscinaUI", e); } catch (e2) {} } }, 0);
    },
    processar: function (st) {
      var c = U._ctx(st); if (!c || !arr(c.estado.hidPiscinas).length) { if (c) U._len = c.ops.length; return null; }
      var len = c.ops.length;
      if (U._len == null) { U._len = len; U._marcarAceitos(c); return null; }
      if (len < U._len) {
        /* ⚠ Ctrl+Z: o lote AUTOMÁTICO saiu → sai junto o movimento da pessoa que o disparou (um Ctrl+Z desfaz a ação inteira) */
        if (U._lote && U._lote.encadear && U._len === U._lote.len && len === U._lote.len - 1 && c.b.desfazer) { U._lote = null; U._ocupado = true; try { c.b.desfazer(); } finally { U._ocupado = false; } var c3 = U._ctx(); if (c3) { c = c3; len = c.ops.length; } }
        U._lote = null; U._len = len; U._marcarAceitos(c); return null;
      }
      if (len > U._len + 1) { U._len = len; U._marcarAceitos(c); return null; }   /* replay grande (abriu outra obra, importou): vira a base */
      U._len = len;
      var feito = null;
      arr(c.estado.hidPiscinas).forEach(function (p) {
        if (feito) return;
        var f = arr(c.estado.familias).filter(function (x) { return String(x.id) === p.id + "-cm"; })[0], ac = U._aceito[p.id];
        if (!f || !ac) return;
        if (Math.abs(f.x - ac.x) > 0.01 || Math.abs(f.z - ac.z) > 0.01) {   // hid:ok 1 cm: a casa andou
          status("Casa de máquinas movida: refazendo as tubulações da piscina…");
          feito = U._lancar(c, [{ op: "hidPiscina", id: p.id, cm: { x: f.x, z: f.z } }], p.id, true, "hidpisc-cm");
        }
      });
      return feito;
    },
    _marcarAceitos: function (c) { arr(c.estado.hidPiscinas).forEach(function (p) { var f = arr(c.estado.familias).filter(function (x) { return String(x.id) === p.id + "-cm"; })[0]; U._aceito[p.id] = f ? { x: f.x, z: f.z } : null; }); },

    /* ---------------- documentos */
    _info: function () {
      var d = {}, o = {};
      try { if (global.Empresa && Empresa.dados) d = Empresa.dados() || {}; } catch (e) {}
      try { var g = global.Gestao; if (g && g._bimSel && global.Store && global.Auth) o = Store.obter(Auth.empresaId(), "obras", g._bimSel) || {}; } catch (e2) {}
      return { obra: { nome: o.nome || "", endereco: o.local || "", cliente: o.clienteNome || "" }, empresa: { nome: d.nome || "" }, responsavel: { nome: d.responsavel || "", crea: d.crea || "" } };
    },
    _abrir: function (html) {
      /* teste de 1 hora (js/testemodulo.js, revisão R7): o documento da janela nova leva a marca; vencido não abre */
      if (global.TesteModulo && TesteModulo.marcarHtml) { html = TesteModulo.marcarHtml(html, "modela:hidraulica"); if (html == null) return null; }
      try { var bl = new Blob([html], { type: "text/html;charset=utf-8" }); return global.open ? global.open(URL.createObjectURL(bl), "_blank") : null; } catch (e) { return null; } },
    _baixar: function (nome, dados, mime) {
      /* teste de 1 hora (js/testemodulo.js): entregável em teste sai com a marca; módulo vencido não sai */
      if (global.TesteModulo && TesteModulo.marcarArquivo) { var wT = TesteModulo.marcarArquivo(nome, dados, mime, "modela:hidraulica"); if (!wT) return false; nome = wT.nome; dados = wT.dados; } try { var bl = new Blob([dados], { type: mime }), u = URL.createObjectURL(bl), a = document.createElement("a"); a.href = u; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 5000); return true; } catch (e) { return false; } },   // hid:ok tempo de limpeza do link (ms)
    /* o resultado vigente: o do último lançamento; sem ele, refaz (só leitura) para o documento */
    _rede: function () {
      var u = U.ultimo; if (u && u.ok && u.rede) return u.rede;
      var c = U._ctx(), Rd = dep("HidPiscinaRede"); if (!c || !Rd) return null;
      var p = arr(c.estado.hidPiscinas)[0]; if (!p) return null;
      /* ⚠ refaz a CONFERÊNCIA sem gravar: o estado já tem o lançamento — o gerar limpa e refaz no papel */
      var R = Rd.gerar({ estado: c.estado, avaliarFam: c.avaliarFam, ops: c.ops, piscina: p.id, opcoes: { elementosIfc: U._elementosIfc() } });
      return R.ok ? R : null;
    },
    documento: function (tipo) {
      var D = dep("HidPiscinaDoc"), R = U._rede(); if (!D || !R) { U.ultimo = U.ultimo || {}; U.ultimo.erro = "Lance o projeto da piscina primeiro."; U._redesenhar(); return null; }
      var g = tipo === "manual" ? D.manual(R, U._info()) : D.memorial(R, U._info());
      if (g && g.ok) { U.docHtml = g.html; U._abrir(g.html); }
      return g;
    },
    planilha: function () {
      var D = dep("HidPiscinaDoc"), R = U._rede(), c = U._ctx(), X = typeof ExcelOrc !== "undefined" ? ExcelOrc : dep("ExcelOrc"); if (!D || !R || !c) return null;
      var q = D.quantitativo(c.estado, c.avaliarFam, R);
      U.quant = q;
      if (!X || !X.ensureExcelJS) { status("Planilha: o gerador (ExcelJS) não está disponível."); return q; }
      X.ensureExcelJS(function () { D.planilha(R, q, global.ExcelJS).then(function (buf) { U._baixar("piscina-dimensionamento-e-quantitativo.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); status("Planilha da piscina gerada."); }, function (e) { status("A planilha da piscina falhou: " + (e && e.message ? e.message : e)); }); });
      return q;
    },
    pranchas: function () {
      var D = dep("HidPiscinaDoc"), R = U._rede(), c = U._ctx(); if (!D || !R || !c) return null;
      var info = U._info(), r = D.pranchas(c.estado, R, { obra: info.obra.nome, responsavel: info.responsavel.nome, registro: info.responsavel.crea, empresa: info.empresa.nome });
      U.ultimasPranchas = r;
      if (r.ok) U._abrir("<!doctype html><html><head><meta charset=\"utf-8\"><title>Pranchas da piscina</title><style>body{margin:0;background:#888}svg{display:block;margin:10px auto;background:#fff;width:96vw;height:auto}</style></head><body>" + r.folhas.map(function (f) { return f.svg; }).join("") + "</body></html>");
      return r;
    },

    /* ---------------- o bloco no painel Instalações */
    html: function () {
      var c = U._ctx(), rec = c ? U.reconhecer() : { piscinas: [], candidatos: [] }, p = U.params, u = U.ultimo;
      function sel(nome, val, opcoes) { return '<select class="inp" data-hid-campo="pisc:' + nome + '">' + opcoes.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(val) === String(o[0]) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>"; }
      function lab(t, h) { return '<label style="display:flex;flex-direction:column;gap:2px;font-size:12px;min-width:140px;flex:1"><span>' + esc(t) + "</span>" + h + "</label>"; }
      var h = '<div data-hid="pisc" style="margin-top:12px;border-top:1px solid rgba(127,127,127,.25);padding-top:8px"><b>Piscina</b>';
      h += '<p class="muted" style="font-size:11.5px;margin:2px 0 6px">A piscina vem do projeto arquitetônico (volume "Piscina", recorte, laje ou IFC com o nome). O OrçaPRO dimensiona pela NBR 10339 e pelos catálogos (com página) e lança tudo: casa de máquinas com filtro, bomba, barrilete e registros, dispositivos (coadeira, aspiração, retornos, 2 ralos de fundo antiaprisionamento, hidro, refletores) e os tubos enterrados. Arraste a casa de máquinas: os tubos se refazem e a sucção é conferida de novo.</p>';
      if (rec.piscinas.length) h += '<div data-hid="pisc-lista" style="font-size:12px;margin:4px 0">' + rec.piscinas.map(function (g) { return "<div>• <b>" + esc(g.nome || g.id) + "</b> " + (g.ok ? f2(g.area) + " m², " + f2(g.volume) + " m³ (" + esc(g.origem) + ")" : '<span class="hid-pend">' + esc(arr(g.erros).join("; ")) + "</span>") + "</div>"; }).join("") + "</div>";
      else if (rec.candidatos.length) h += '<div data-hid="pisc-cands" style="font-size:12px;margin:4px 0">' + rec.candidatos.map(function (g, i) { return '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">Achei no modelo: <b>' + esc(g.nome) + "</b> " + f2(g.area) + " m², " + f2(g.volume) + " m³ <span class=\"muted\">(" + esc(g.motivo) + ')</span> <button class="btn sm" data-hid="pisc-usar" data-i="' + i + '">Usar como piscina e lançar</button></div>'; }).join("") + "</div>";
      else h += '<p class="muted" style="font-size:12px" data-hid="pisc-nada">Nenhuma piscina no modelo: modele o volume da piscina (nome "Piscina") ou selecione o contorno desenhado.</p>';
      h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0">' +
        lab("Uso (NBR 10339)", sel("uso", p.uso, [["residencial_privativa", "Residencial privativa"], ["residencial_coletiva", "Residencial coletiva"], ["coletiva", "Coletiva (clube, escola)"], ["publica", "Pública"], ["hospedaria", "Hospedaria (hotel)"], ["terapeutica", "Terapêutica"]])) +
        lab("Sucção segura", sel("succao", p.succao, [["dois_drenos", "2 ralos de fundo interligados"], ["coadeiras", "Só coadeiras (mín. 2)"], ["grelha_nao_bloqueavel", "1 ralo com grelha não bloqueável"], ["tanque_intermediario", "Tanque intermediário"]])) +
        lab("Casa de máquinas", sel("cmNivel", p.cmNivel, [["afogada", "Enterrada (bomba afogada)"], ["superficie", "Na superfície"]])) +
        lab("Descarte do filtro e drenagem", sel("descarte", p.descarte || "pluvial", [["pluvial", "Rede pluvial (padrão)"], ["esgoto", "Rede de esgoto (se a prefeitura pedir)"]])) + "</div>";
      h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0">' +
        lab("Hidromassagem", '<span><input type="checkbox" data-hid-campo="pisc:hidro.ativo"' + (p.hidro && p.hidro.ativo ? " checked" : "") + '> com <input class="inp" style="width:56px" data-hid-campo="pisc:hidro.bocais" value="' + esc(p.hidro ? p.hidro.bocais : "") + '"> bocais</span>') +
        lab("Aquecimento", sel("aquecimento.tipo", p.aquecimento ? p.aquecimento.tipo : "nenhum", [["nenhum", "Sem aquecimento"], ["solar", "Solar (placas)"], ["bomba_calor", "Bomba de calor"]])) +
        lab("Iluminação", '<span><input type="checkbox" data-hid-campo="pisc:iluminacao.ativo"' + (p.iluminacao && p.iluminacao.ativo ? " checked" : "") + '> refletores LED</span>') +
        lab("Tratamento", sel("tratamento", p.tratamento, [["clorador", "Clorador"], ["gerador_sal", "Gerador de cloro (sal)"], ["manual", "Manual"], ["ozonio", "Ozônio"], ["uv", "Ultravioleta"]])) + "</div>";
      h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0">' +
        lab("Vento predominante vem de (graus, opcional)", '<input class="inp" data-hid-campo="pisc:vento" value="' + esc(p.vento == null ? "" : p.vento) + '">') +
        lab("Altitude do local (m)", '<input class="inp" data-hid-campo="pisc:altitude_m" value="' + esc(p.altitude_m == null ? "" : p.altitude_m) + '">') +
        lab("Temp. média anual (°C, solar)", '<input class="inp" data-hid-campo="pisc:aquecimento.tMediaAnual" value="' + esc(p.aquecimento && p.aquecimento.tMediaAnual != null ? p.aquecimento.tMediaAnual : "") + '">') + "</div>";
      h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0">' + (rec.piscinas.length || rec.candidatos.length ? '<button class="btn sm primary" data-hid="pisc-um-clique" title="Reconhece a piscina, lança casa de máquinas, dispositivos, sucção, retorno, descarte, drenagem e reposição e abre memorial, lista de material e pranchas">Projeto da piscina em um clique</button>' : "") +
        (rec.piscinas.length ? '<button class="btn sm" data-hid="pisc-lancar">Lançar / refazer o projeto da piscina</button><button class="btn sm ghost" data-hid="pisc-documentos">Documentos (memorial + lista + pranchas)</button>' : "") +
        '<button class="btn sm ghost" data-hid="pisc-memorial"' + (rec.piscinas.length ? "" : " disabled") + '>Memorial</button><button class="btn sm ghost" data-hid="pisc-manual"' + (rec.piscinas.length ? "" : " disabled") + '>Manual de operação</button>' +
        '<button class="btn sm ghost" data-hid="pisc-planilha"' + (rec.piscinas.length ? "" : " disabled") + '>Planilha (.xlsx)</button><button class="btn sm ghost" data-hid="pisc-pranchas"' + (rec.piscinas.length ? "" : " disabled") + ">Pranchas</button></div>";
      if (u) {
        if (u.erro && !u.ok) h += '<p class="hid-pend" style="font-size:12px" data-hid="pisc-msg">' + esc(u.erro) + "</p>";
        var R = u.rede;
        if (R && R.ok) {
          var d = R.dim || {}, eq = d.equipamentos || {};
          h += '<div data-hid="pisc-res" style="font-size:12px;border:1px solid rgba(127,127,127,.3);border-radius:8px;padding:6px 8px;margin:6px 0">' +
            "<div>Situação: <b data-hid=\"pisc-status\" class=\"" + (d.status === "atende" ? "" : "hid-pend") + "\">" + esc(d.status === "atende" ? "atende" : (d.status === "nao_atende" ? "NÃO ATENDE" : "pendente")) + "</b> · Q = " + f2(d.vazao && d.vazao.Q_m3h) + " m³/h · filtro " + esc(eq.filtro ? eq.filtro.fabricante + " " + eq.filtro.codigo : "—") + " · bomba " + esc(eq.bomba ? eq.bomba.fabricante + " " + eq.bomba.codigo : "—") + " · H = " + f2(d.estimativa && d.estimativa.amt) + " mca · NPSH disp. " + f2(d.npsh && d.npsh.disp) + " m</div>" +
            "<div>Casa de máquinas " + f2(R.casa.C) + " × " + f2(R.casa.L) + " m, " + (R.casa.nivel === "afogada" ? "enterrada (bomba afogada)" : "na superfície") + "; " + R.dispositivos.length + " dispositivos; " + R.linhas.length + " linhas.</div>";
          R.avisos.slice(0, 6).forEach(function (a, i) {   // hid:ok apresentação (índice de coluna, fatia de lista)
            h += '<div class="hid-pend" data-hid="pisc-aviso">⚠ ' + esc(a.texto) + arr(a.acoes && a.acoes.length ? a.acoes : (a.acao ? [a.acao] : [])).map(function (ac, j) { return ac && ac.texto ? ' <button class="btn sm" data-hid="pisc-corrigir" data-i="' + i + '" data-j="' + j + '">Corrigir: ' + esc(ac.texto) + "</button>" : ""; }).join("") + "</div>";
          });
          h += '<details><summary>' + R.verificacoes.length + " verificação(ões), " + R.pendencias.length + " pendência(s), " + R.decisoes.length + " decisão(ões)</summary><ul>" +
            R.verificacoes.map(function (v) { return '<li class="' + (v.status === "atende" ? "" : "hid-pend") + '">' + esc(v.nome) + ": " + esc(v.valor) + " (" + esc(v.limite) + " " + esc(v.unidade) + ") — " + esc(v.status) + "</li>"; }).join("") +
            R.pendencias.map(function (q) { return '<li class="hid-pend">pendente: ' + esc(q.motivo) + "</li>"; }).join("") + R.decisoes.map(function (q) { return "<li>" + esc(q.texto) + "</li>"; }).join("") + "</ul></details></div>";
        }
      }
      return h + "</div>";
    },
    clique: function (a, el) {
      if (a === "pisc-usar") { U.usarCandidato(el && el.getAttribute("data-i")); return true; }
      if (a === "pisc-lancar") { U.relancar(null); return true; }
      if (a === "pisc-um-clique") { U.umClique(); return true; }
      if (a === "pisc-documentos") { U.documentos(); return true; }
      if (a === "pisc-corrigir") { U.corrigir(el && el.getAttribute("data-i"), el && el.getAttribute("data-j")); return true; }
      if (a === "pisc-memorial") { U.documento("memorial"); return true; }
      if (a === "pisc-manual") { U.documento("manual"); return true; }
      if (a === "pisc-planilha") { U.planilha(); return true; }
      if (a === "pisc-pranchas") { U.pranchas(); return true; }
      return false;
    },
    campo: function (n, v) {
      var m = /^pisc:(.+)$/.exec(n); if (!m) return false;
      var k = m[1].split("."), alvo = U.params;
      for (var i = 0; i < k.length - 1; i++) { if (!alvo[k[i]] || typeof alvo[k[i]] !== "object") alvo[k[i]] = {}; alvo = alvo[k[i]]; }
      var ult = k[k.length - 1];
      if (typeof v === "boolean") alvo[ult] = v;
      else if (/^(bocais|vento|altitude_m|tMediaAnual)$/.test(ult)) { var x = num(v, null); if (x == null) delete alvo[ult]; else alvo[ult] = x; }
      else alvo[ult] = v;
      U._salvarParams();
      return true;
    }
  };

  /* ---------------- GANCHOS nos geradores das outras frentes (envolvem sem mexer no código delas) */
  function ganchos() {
    var HD = global.HidDocumentos;
    if (HD && HD.gerar && !HD.gerar._piscina) {
      var g0 = HD.gerar;
      HD.gerar = function () {
        var out = g0.apply(this, arguments);
        try {
          var R = U._rede(), D = dep("HidPiscinaDoc");
          if (out && out.ok && R && D) {
            var s = D.secoes(R, U._info());
            if (s.memorial && out.memorial && out.memorial.html) out.memorial.html = out.memorial.html.replace(/<\/body>/i, s.memorial + "</body>");
            if (s.manual && out.manual && out.manual.html) out.manual.html = out.manual.html.replace(/<\/body>/i, s.manual + "</body>");
            out.piscina = { ok: s.ok };
          }
        } catch (e) { if (out && out.avisos) out.avisos.push("piscina: " + (e && e.message ? e.message : e)); }
        return out;
      };
      HD.gerar._piscina = true;
    }
    var HPr = global.HidPranchas;
    if (HPr && HPr.gerar && !HPr.gerar._piscina) {
      var p0 = HPr.gerar;
      HPr.gerar = function (resultado, modelo, opcoes) {
        var out = p0.apply(this, arguments);
        try {
          var R = U._rede(), D = dep("HidPiscinaDoc");
          if (out && out.ok && R && D && modelo && modelo.estado) {
            var o = opcoes || {}, r = D.pranchas(modelo.estado, R, { obra: o.obra, responsavel: o.responsavel, registro: o.registro, empresa: o.empresa, logo: o.logo, revisao: out.revisao, formato: out.folhas[0] && out.folhas[0].formato });
            if (r.ok) { out.folhas = out.folhas.concat(r.folhas); out.avisos = arr(out.avisos).concat(r.avisos); }
          }
        } catch (e) { if (out && out.avisos) out.avisos.push("piscina: " + (e && e.message ? e.message : e)); }
        return out;
      };
      HPr.gerar._piscina = true;
    }
  }
  ganchos();
  U._ganchos = ganchos;
  global.HidPiscinaUI = U;
  if (typeof module !== "undefined" && module.exports) module.exports = U;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
