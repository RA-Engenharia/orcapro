/* =====================================================================
 * climcalcui.js — a TELA da climatização (frente C1b, 17/10/2026)
 *
 * Painel "Climatização" dentro da aba Instalações do BIM (js/biminstui.js chama
 * ClimCalcUI.montar(corpo) logo depois do painel hidrossanitário; SÓ com a prévia
 * ?previa=hidro — BimPrevia.hidro(), decisão do gerente de 17/10/2026 até o Rogério decidir
 * produto e preço; este arquivo faz parte do grupo "hidro" do index.html, que só baixa
 * ao abrir o painel Instalações com a prévia ligada, ver js/carregar.js). O cálculo é do ClimDimensionar (contrato em
 * docs/hidro/CONTRATO-CLIMA.md): aqui só se monta a ENTRADA a partir do modelo,
 * se mostra o RESULTADO e se APLICA no modelo.
 *
 *   a) lê os ambientes do modelo (lerModelo) e deixa marcar "climatizar", pessoas e aparelhos;
 *   b) Calcular → por ambiente: carga (com a fonte, ou a PENDÊNCIA dizendo o que falta), as
 *      até 3 soluções com a justificativa, e as soluções centrais (multi-split/VRF);
 *   c) "Aplicar esta solução": evaporadora (na parede, no forro ou no plenum conforme o tipo),
 *      condensadora no local sugerido, linhas frigorígenas e dreno como trechos, ponto de força
 *      — tudo num LOTE só (uma entrada de desfazer; há também o botão "Desfazer a aplicação");
 *   d) avisos com Corrigir e Mostrar no 3D (ProblemaCard) e as pendências em texto;
 *   e) Memorial: o ClimMemorial, quando existir; enquanto não, um HTML simples do resultado,
 *      dito assim na própria tela.
 *
 * ⚠ Pendência nunca aparece como "atendido": "não verificado: falta X".
 * ⚠ Nenhum valor de norma ou de fabricante aqui (test-clim-sem-numero-magico varre este
 *   arquivo): só apresentação, marcada clim:ok.
 * ES5, IIFE.
 * ===================================================================== */
(function (global) {
  "use strict";
  var doc = typeof document !== "undefined" ? document : null;

  function B() { return global.BIM; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = parseFloat(String(v).replace(",", ".")); return v !== null && v !== "" && isFinite(n) ? n : d; }
  function dep(nome) { return global[nome] || null; }
  function fmt(n, c) {
    if (n == null || !isFinite(n)) return "—";
    var U = global.Util; if (U && U.fmtNum) return U.fmtNum(n, c == null ? 0 : c);
    var f = Math.pow(10, c == null ? 0 : c); return String(Math.round(n * f) / f).replace(".", ",");   // clim:ok potência de 10 para arredondar casas
  }
  var CHAVE_LS = "orcapro:clim:entrada", LIMITE_LISTA = 40, PREFIXO = "clim-";   // clim:ok tamanho da lista na tela (apresentação)
  var ESTACAO_PADRAO = "Belo Horizonte - Pampulha";   // sugestão inicial editável (o RT escolhe a mais próxima da obra); a tabela de condições externas é do HidNormas
  var CORES = { ok: "#2e9e5b", aviso: "#e0a100", falha: "#d33a2c" };

  var E = { conf: { confirmacoes: [], cfItem: "", cfJust: "", cfResp: "" }, amb: {}, estacao: "", central: "auto", escolhas: {}, resultado: null, opsNoCalculo: null, aplicado: null, msg: null, memorialHtml: null, _raiz: null };
  var lido = false;
  function salvarLS() { try { global.localStorage.setItem(CHAVE_LS, JSON.stringify({ amb: E.amb, estacao: E.estacao, central: E.central, conf: E.conf })); } catch (e) {} }
  function lerLS() {
    try {
      var o = JSON.parse(global.localStorage.getItem(CHAVE_LS) || "null"); if (!o) return;
      if (o.amb) E.amb = o.amb; if (o.estacao) E.estacao = o.estacao; if (o.central) E.central = o.central;
      if (o.conf && Array.isArray(o.conf.confirmacoes)) E.conf = { confirmacoes: o.conf.confirmacoes, cfItem: "", cfJust: "", cfResp: "" };
    } catch (e) {}
  }
  function toast(t, k) { try { if (global.UI && UI.toast) UI.toast(t, k || "info"); } catch (e) {} }

  /* ------------------------------------------------------------------ o modelo do BIM */
  function modelo() {
    var b = B(); if (!b || !b.editarEstado) return null;
    var est = b.editarEstado(); if (!est || !est.estado) return null;
    return { estado: est.estado, ops: est.ops, avaliarFam: function (f, t, i) { return b.familiaAvaliar(f, t, i); } };
  }
  function estacoes() {
    var NR = dep("HidNormas"), v = {}, out = [];
    try { arr(NR && NR.linhas ? NR.linhas("cl.condicoes_externas_mg_ashrae_tmyx") : []).forEach(function (l) { if (l.estacao && !v[l.estacao]) { v[l.estacao] = 1; out.push(l.estacao); } }); } catch (e) {}
    return out.sort();
  }
  function garantirPadroes() {
    if (!lido) { lido = true; lerLS(); }
    var es = estacoes();
    if (es.length && (!E.estacao || es.indexOf(E.estacao) < 0)) E.estacao = es.indexOf(ESTACAO_PADRAO) >= 0 ? ESTACAO_PADRAO : es[0];
  }
  function ambientesDoModelo(m) {
    var CD = dep("ClimDimensionar");
    if (!CD || !m) return [];
    try { return CD.lerModelo(m.estado, m.avaliarFam, {}); } catch (e) { return []; }
  }
  /* o que a pessoa digitou/marcou por ambiente → entrada.ambientes (só o que ela mexeu) */
  function ambientesEntrada() {
    var o = {};
    Object.keys(E.amb).forEach(function (id) {
      var a = E.amb[id], x = {};
      if (a.climatizar === false) x.climatizar = false; else if (a.climatizar === true) x.climatizar = true;
      if (a.pessoas !== "" && a.pessoas != null && num(a.pessoas, null) != null) x.pessoas = num(a.pessoas, 0);
      if (a.aparelhos !== "" && a.aparelhos != null && num(a.aparelhos, null) != null) x.aparelhos = num(a.aparelhos, 0);
      if (Object.keys(x).length) o[id] = x;
    });
    return o;
  }
  function entrada(m) {
    return { modelo: { estado: m.estado, avaliarFam: m.avaliarFam }, ambientes: ambientesEntrada(), local: { estacao: E.estacao },
             preferencias: { central: E.central }, escolhas: E.escolhas, confirmacoesRT: JSON.parse(JSON.stringify(E.conf.confirmacoes)) };
  }

  /* ------------------------------------------------------------------ ações */
  /* J1: ASSINATURA do modelo no instante do cálculo (hash do que o cálculo lê). Modelo diferente → saídas e Corrigir BLOQUEADOS. */
  function hashTxt(t) { var h = 5381, i; for (i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return String(h) + ":" + t.length; }   // clim:ok hash djb2 (identificação, não norma)
  function assinatura(m) {
    if (!m || !m.estado) return "";
    var est = m.estado;
    var o = { i: est.instalacoes, f: arr(est.familias).map(function (f) { return [f.id, f.famId, f.tipoId, f.x, f.y, f.z, f.rotY, f.inst]; }),
              a: arr(est.ambientes).map(function (a) { return [a.id, a.calc]; }), c: est.caixas, fo: est.forros, t: est.telhados, co: est.coberturas };
    try { return hashTxt(JSON.stringify(o)); } catch (e) { return String(m.ops); }
  }
  function modeloMudou() { var m = modelo(); return !!(E.resultado && m && E.opsNoCalculo != null && assinatura(m) !== E.opsNoCalculo); }
  function bloqueadoPorModelo() {
    if (!modeloMudou()) return false;
    E.msg = { k: "aviso", t: "O modelo mudou desde o cálculo — Calcular de novo. Memorial, pranchas e Corrigir ficam bloqueados até lá." };
    redesenhar();
    return true;
  }

  function calcular() {
    var m = modelo(), CD = dep("ClimDimensionar");
    if (!CD) { E.msg = { k: "erro", t: "Climatização: módulo não carregado (js/climdimensionar.js)." }; redesenhar(); return null; }
    if (!m) { E.msg = { k: "erro", t: "Abra o BIM para calcular a climatização." }; redesenhar(); return null; }
    var R = null;
    try { R = CD.calcular(entrada(m)); } catch (e) { E.msg = { k: "erro", t: "O cálculo falhou: " + (e && e.message ? e.message : e) }; redesenhar(); return null; }
    E.resultado = R; E.opsNoCalculo = assinatura(m); E.msg = null; E.memorialHtml = null;
    salvarLS(); redesenhar();
    return R;
  }
  function idsExistentes(m) {
    var v = {};
    if (!m) return v;
    arr(m.estado.familias).forEach(function (f) { v[f.id] = 1; });
    var ins = m.estado.instalacoes || {};
    arr(ins.trechos).forEach(function (t) { v[t.id] = 1; }); arr(ins.pecas).forEach(function (p) { v[p.id] = 1; });
    return v;
  }
  /* as ops de UM ambiente (ids clim-<amb>-…) ou todas (central) */
  function opsDe(R, ambId) {
    var pre = ambId == null ? PREFIXO : PREFIXO + ambId + "-";
    return arr(R && R.ops).filter(function (o) { return o && o.id != null && String(o.id).indexOf(pre) === 0; });
  }
  function aplicarOps(ops, rotulo) {
    var b = B();
    if (!b || !b.editarLote) { E.msg = { k: "erro", t: "O editor do BIM não está disponível para aplicar." }; redesenhar(); return false; }
    if (!ops.length) { E.msg = { k: "info", t: "Nada a aplicar." }; redesenhar(); return false; }
    var ids = ops.map(function (o) { return o.id; });
    var ok = b.editarLote({ op: "lote", id: "clim-" + String(new Date().getTime()), origem: "climatizacao", ops: JSON.parse(JSON.stringify(ops)) });   // um lote = uma entrada de desfazer
    if (!ok) { E.msg = { k: "erro", t: "O editor recusou as alterações." }; redesenhar(); return false; }
    var inv = []; for (var i = ids.length - 1; i >= 0; i--) inv.push({ op: "apagar", id: ids[i] });
    E.aplicado = { rotulo: rotulo, ids: ids, opsDesfazer: inv };
    E.msg = { k: "ok", t: rotulo + ": " + ops.length + " operação(ões) no modelo. Ctrl+Z (ou \"Desfazer a aplicação\") desfaz tudo de uma vez." };
    redesenhar();
    return true;
  }
  /* "Aplicar esta solução" de um ambiente: recalcula com a solução escolhida e aplica só as ops dele */
  function aplicarSolucao(ambId, tipo) {
    E.central = E.central === "sim" ? "auto" : E.central;
    E.escolhas[ambId] = tipo;
    var R = calcular(); if (!R) return false;
    var item = arr(R.ambientes).filter(function (a) { return a.id === ambId; })[0];
    if (!item || !item.escolha || item.escolha.tipo !== tipo) { E.msg = { k: "aviso", t: "Esta solução não pôde ser montada neste ambiente: veja os avisos." }; redesenhar(); return false; }
    var ops = opsDe(R, ambId);
    return aplicarOps(ops, "Climatização aplicada em " + item.nome + " (" + tipo + ")");
  }
  function aplicarCentral() {
    E.central = "sim"; E.escolhas = {};
    var R = calcular(); if (!R) return false;
    var c = arr(R.centrais)[0];
    return aplicarOps(opsDe(R, null), "Solução central aplicada" + (c ? " (" + c.tipo + ")" : ""));
  }
  function desfazerAplicacao() {
    var b = B(), A = E.aplicado;
    if (!A || !b || !b.editarLote) { E.msg = { k: "info", t: "Nada aplicado nesta tela para desfazer (use Ctrl+Z para o último lote)." }; redesenhar(); return false; }
    var ok = b.editarLote({ op: "lote", id: "clim-des-" + String(new Date().getTime()), origem: "climatizacao", ops: JSON.parse(JSON.stringify(A.opsDesfazer)) });
    if (!ok) { E.msg = { k: "erro", t: "O editor recusou o desfazer." }; redesenhar(); return false; }
    E.msg = { k: "ok", t: "Aplicação desfeita: " + A.ids.length + " elemento(s) removidos." }; E.aplicado = null;
    redesenhar();
    return true;
  }

  /* ------------------------------------------------------------------ avisos (Corrigir / Mostrar no 3D) */
  function problemas(R) {
    var out = [];
    arr(R && R.avisos).forEach(function (a, i) {
      if (a.gravidade === "info") return;
      var c = a.corrigir, tem = !!(c && arr(c.ops).length);
      out.push({ tipo: a.id || ("cl" + i), titulo: a.texto, gravidade: a.gravidade === "erro" ? "erro" : "aviso", pecas: arr(a.elementos),
                 solucoes: c && c.texto ? [{ id: "c" + i, texto: c.texto, pecas: [], temOps: tem, ops: c.ops }] : [] });
    });
    return out;
  }

  /* ------------------------------------------------------------------ memorial */
  function baixar(nome, dados, mime) {
    if (!doc) return false;
    try { var bl = new Blob([dados], { type: mime }), u = URL.createObjectURL(bl), a = doc.createElement("a"); a.href = u; a.download = nome; doc.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 5000); return true; } catch (e) { return false; }   // clim:ok 5 s até soltar a URL
  }
  /* HTML simples do resultado, com as pendências — enquanto o js/climmemorial.js não existe (dito no próprio documento) */
  function htmlSimples(R) {
    var h = "<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><title>Climatização — resumo do cálculo</title><style>body{font:14px/1.45 sans-serif;max-width:900px;margin:24px auto;padding:0 16px}table{border-collapse:collapse;width:100%;margin:8px 0}td,th{border:1px solid #999;padding:4px 8px;text-align:left;vertical-align:top}.p{color:#b00020;font-weight:600}</style></head><body>";
    h += "<h1>Climatização — resumo do cálculo</h1><p><b>Documento provisório:</b> o memorial completo da climatização falhou; este é o resumo do resultado do dimensionamento, com tudo o que ficou pendente.</p>";
    h += "<p>Situação: <b>" + (R.ok ? "completo" : "INCOMPLETO — há pendências ou erros") + "</b>" + (R.fixture ? " — <span class=\"p\">TABELAS DE TESTE, NÃO É NORMA</span>" : "") + "</p>";
    if (arr(R.premissas).length) h += "<h2>Premissas</h2><ul>" + R.premissas.map(function (p) { return "<li>" + esc(p.item) + ": " + esc(p.valor) + " <i>(" + esc(p.origem) + (p.fonte ? "; " + esc(p.fonte) : "") + ")</i></li>"; }).join("") + "</ul>";
    h += "<h2>Ambientes</h2><table><tr><th>Ambiente</th><th>Carga</th><th>Solução escolhida</th><th>Equipamento</th></tr>";
    arr(R.ambientes).forEach(function (a) {
      var c = a.carga, e = a.escolha;
      h += "<tr><td>" + esc(a.nome) + "<br><small>" + fmt(a.area_m2, 1) + " m²</small></td><td>" + (c ? (c.status === "ok" ? fmt(c.requerida_BTUh) + " BTU/h" : "<span class=\"p\">PENDENTE</span> " + (c.requerida_BTUh != null ? "(parcial/regra: " + fmt(c.requerida_BTUh) + " BTU/h)" : "")) : "—") + "</td>" +
        "<td>" + (e ? esc(e.tipo) : (a.climatizar ? "<span class=\"p\">sem solução</span>" : "não climatizado")) + "</td><td>" + (e && e.equipamento ? esc(e.equipamento.fabricante + " " + e.equipamento.evaporadora + " / " + e.equipamento.condensadora) : "<span class=\"p\">pendente</span>") + "</td></tr>";
    });
    h += "</table>";
    if (arr(R.verificacoes).length) h += "<h2>Verificações</h2><ul>" + R.verificacoes.map(function (v) { return "<li>" + esc(v.nome) + ": <b>" + (v.status === "ok" ? "atende" : (v.status === "reprovado" ? "não atende" : "não verificado")) + "</b></li>"; }).join("") + "</ul>";
    if (arr(R.avisos).length) h += "<h2>Avisos</h2><ul>" + R.avisos.map(function (a) { return "<li>[" + esc(a.gravidade) + "] " + esc(a.texto) + (a.corrigir && a.corrigir.texto ? " — <i>correção: " + esc(a.corrigir.texto) + "</i>" : "") + "</li>"; }).join("") + "</ul>";
    if (arr(R.pendencias).length) h += "<h2 class=\"p\">Não verificado: falta informação (" + R.pendencias.length + ")</h2><ul>" + R.pendencias.map(function (p) { return "<li><b>" + esc(p.chave) + "</b> — " + esc(p.motivo) + "</li>"; }).join("") + "</ul>";
    arr(R.normas).forEach(function (n, i) { if (!i) h += "<h2>Fontes</h2><ul>"; h += "<li>" + esc(typeof n === "string" ? n : (n.norma || n.titulo || JSON.stringify(n))) + "</li>"; if (i === R.normas.length - 1) h += "</ul>"; });
    return h + "</body></html>";
  }
  function memorial() {
    if (!E.resultado) { E.msg = { k: "aviso", t: "Calcule primeiro: sem resultado não há o que apresentar." }; redesenhar(); return null; }
    if (bloqueadoPorModelo()) return null;
    var M = dep("ClimMemorial"), html = null, proprio = false, falha = "";
    if (M && M.gerar) {
      /* J12: obra, responsável e empresa saem do mesmo lugar que no memorial do hidrossanitário */
      var em = empresaObra();
      try {
        var g = M.gerar(E.resultado, { obra: { nome: em.obra.nome || "", endereco: em.obra.local || "", cliente: em.obra.clienteNome || "" }, responsavel: { nome: em.d.responsavel || "", titulo: em.d.titulo || "", crea: em.d.crea || "" },
                                       empresa: { nome: em.d.nome || "", cnpj: em.d.cnpj || "" }, documento: { revisao: "R00", data: new Date() } });
        if (g && g.ok) { html = g.html; proprio = true; } else falha = (g && g.motivo) || "sem motivo informado";
      } catch (e) { html = null; falha = e && e.message ? e.message : String(e); }
    } else falha = "módulo não carregado (js/climmemorial.js)";
    if (!html) html = htmlSimples(E.resultado);
    E.memorialHtml = html;
    var aberto = null;
    try { var bl = new Blob([html], { type: "text/html;charset=utf-8" }); aberto = global.open ? global.open(URL.createObjectURL(bl), "_blank") : null; } catch (e2) { aberto = null; }
    if (!aberto) baixar("climatizacao-resumo.html", html, "text/html;charset=utf-8");
    E.msg = { k: proprio ? "ok" : "aviso", t: proprio ? "Memorial gerado." : "O memorial completo da climatização falhou (" + falha + "): gerei um RESUMO do resultado, com as pendências. " + (aberto ? "Aberto em outra janela." : "Baixado como HTML.") };
    redesenhar();
    return html;
  }

  /* ------------------------------------------------------------------ pranchas */
  function niveis() {
    var out = [];
    try { arr(global.BimEdit && BimEdit.niveisAtuais ? BimEdit.niveisAtuais() : []).forEach(function (n) { if (n && isFinite(n.elevacao) && !/terreno|funda|sondag|cobertura|telhado/i.test(n.nome || "")) out.push({ nome: n.nome || "Nível", cota: n.elevacao }); }); } catch (e) {}
    return out;
  }
  function empresaObra() {
    var d = {}, logo = null, o = null;
    try { if (global.Empresa && Empresa.dados) d = Empresa.dados() || {}; if (global.Empresa && Empresa.logo) logo = Empresa.logo(); } catch (e) {}
    try { var g = global.Gestao; if (g && g._bimSel && global.Store && global.Auth) o = Store.obter(Auth.empresaId(), "obras", g._bimSel); } catch (e2) {}
    return { d: d, logo: logo, obra: o || {} };
  }
  function pranchas() {
    if (!E.resultado) { E.msg = { k: "aviso", t: "Calcule primeiro: sem resultado não há o que desenhar." }; redesenhar(); return false; }
    if (bloqueadoPorModelo()) return false;
    var P = dep("ClimPranchas"), m = modelo();
    if (!P || !P.gerar) { E.msg = { k: "erro", t: "Pranchas: módulo não carregado (js/climpranchas.js)." }; redesenhar(); return false; }
    var em = empresaObra(), r, pdf, pv = niveis();
    try {
      r = P.gerar(E.resultado, m ? { estado: m.estado, avaliarFam: m.avaliarFam } : null, { pavimentos: pv, empresa: em.d && em.d.nome ? em.d : "", responsavel: em.d.responsavel || "", registro: em.d.crea || "", tituloProfissional: em.d.titulo || "",
        obra: em.obra.nome || "", proprietario: em.obra.clienteNome || "", contratante: em.obra.clienteNome || "", local: em.obra.local || "", logo: em.logo || null });
      pdf = r && r.ok ? P.exportar(r, "pdf") : null;
    } catch (e) { E.msg = { k: "erro", t: "As pranchas falharam: " + (e && e.message ? e.message : e) }; redesenhar(); return false; }
    if (!r || !r.ok) { E.msg = { k: "erro", t: "Pranchas: " + arr(r && r.avisos).join(" ") }; redesenhar(); return false; }
    if (!pdf) { E.msg = { k: "erro", t: "Pranchas geradas, mas o conversor para PDF (js/svgpdf.js) não está disponível." }; redesenhar(); return false; }
    baixar("projeto-climatizacao.pdf", pdf, "application/pdf");
    var sob = r.verificacao && r.verificacao.sobreposicoes ? r.verificacao.sobreposicoes : 0;
    E.pranchas = { folhas: r.folhas.length, avisos: arr(r.avisos).length, sobreposicoes: sob };
    E.msg = { k: arr(r.avisos).length || sob ? "aviso" : "ok", t: "Pranchas geradas: " + r.folhas.length + " folha(s) em PDF" + (arr(r.avisos).length ? " — " + r.avisos.length + " aviso(s) da emissão: conferir (" + arr(r.avisos).slice(0, 2).join("; ") + ")" : "") + (sob ? " — " + sob + " texto(s) sobreposto(s)" : "") + "." };
    redesenhar();
    return true;
  }

  /* ------------------------------------------------------------------ HTML */
  function css() {
    if (!doc || doc.getElementById("clim-calc-css")) return;
    var st = doc.createElement("style"); st.id = "clim-calc-css";
    st.textContent = "#clim-calc table.tbl td,#clim-calc table.tbl th{padding:5px 8px;vertical-align:top;font-size:12px} #clim-calc .clim-rola{overflow-x:auto;margin:4px 0 8px} #clim-calc .clim-sol{border:1px solid rgba(127,127,127,.35);border-radius:8px;padding:6px 10px;margin:4px 0}";
    doc.head.appendChild(st);
  }
  function pilula(txt, cor) { return '<span style="font-weight:600;color:' + cor + '">' + esc(txt) + "</span>"; }
  function htmlAmbientes(m) {
    var L = ambientesDoModelo(m);
    if (!L.length) return '<p class="muted" style="font-size:12px">Nenhum ambiente no modelo. Crie os ambientes (cômodos delimitados por paredes) na aba Ambientes: a climatização parte deles.</p>';
    var h = '<table class="tbl" data-clim="ambientes"><thead><tr><th>Ambiente</th><th>Área</th><th>Climatizar</th><th>Pessoas</th><th>Aparelhos</th></tr></thead><tbody>';
    L.forEach(function (a) {
      var v = E.amb[a.id] || {}, cl = v.climatizar == null ? a.climatizar !== false : v.climatizar;
      h += "<tr><td>" + esc(a.nome) + ' <span class="muted">(' + esc(a.uso) + ")</span></td><td>" + fmt(a.area_m2, 1) + " m²</td>" +
        '<td><input type="checkbox" data-clim-campo="a:' + esc(a.id) + ':climatizar"' + (cl ? " checked" : "") + "></td>" +
        '<td><input class="inp" style="width:70px" inputmode="decimal" data-clim-campo="a:' + esc(a.id) + ':pessoas" value="' + esc(v.pessoas != null ? v.pessoas : "") + '" placeholder="' + esc(a.pessoas != null ? a.pessoas : "auto") + '"></td>' +
        '<td><input class="inp" style="width:70px" inputmode="decimal" data-clim-campo="a:' + esc(a.id) + ':aparelhos" value="' + esc(v.aparelhos != null ? v.aparelhos : "") + '" placeholder="' + esc(a.aparelhos != null ? a.aparelhos : "auto") + '"></td></tr>';
    });
    return h + "</tbody></table>";
  }
  function htmlCarga(a) {
    var c = a.carga;
    if (!c) return '<span class="muted">não calculada</span>';
    var h = (c.status === "ok" ? pilula("atende o cálculo", CORES.ok) : pilula("não verificado: carga com pendência", CORES.aviso)) + " · requerida <b>" + fmt(c.requerida_BTUh) + " BTU/h</b>";
    h += ' <span class="muted">(base: ' + esc(String(c.base || "").replace(/_/g, " ")) + (c.sensivel_W != null ? "; componentes " + fmt(c.total_BTUh) + " BTU/h" : "") + ")</span>";
    var ra = c.rapida;
    if (ra && arr(ra.regras).length) h += '<div class="muted" style="font-size:11.5px">Regra de fabricante: ' + ra.regras.map(function (r) { return esc(r.fabricante) + " " + fmt(r.BTUh) + " BTU/h"; }).join("; ") + (ra.faixaAshrae ? "; faixa ASHRAE " + fmt(ra.faixaAshrae.BTUh_de) + " a " + fmt(ra.faixaAshrae.BTUh_a) + " BTU/h" : "") + (ra.divergencia_pct != null ? "; divergência " + fmt(ra.divergencia_pct, 0) + " %" : "") + "</div>";
    var pend = arr(c.componentes).filter(function (x) { return x.status !== "ok"; });
    if (pend.length) h += '<div style="font-size:11.5px;color:' + CORES.aviso + '">Componente sem coeficiente (não verificado): ' + pend.slice(0, LIMITE_LISTA).map(function (x) { return esc(x.tipo + (x.alvo ? " " + x.alvo : "")); }).join(", ") + "</div>";
    var fontes = arr(c.componentes).filter(function (x) { return x.fonte; }).map(function (x) { return x.fonte; }).filter(function (f, i, l) { return l.indexOf(f) === i; });
    if (fontes.length) h += '<div class="muted" style="font-size:11px">Fontes: ' + fontes.slice(0, 4).map(function (f) { return esc(typeof f === "string" ? f : (f.norma || f.texto || JSON.stringify(f))); }).join(" · ") + "</div>";   // clim:ok quatro fontes na tela
    return h;
  }
  function htmlSolucoes(a, m, R) {
    var ex = idsExistentes(m), h = "";
    var ja = opsDe(R, a.id).some(function (o) { return ex[o.id]; });
    arr(a.solucoes).forEach(function (s, i) {
      var viavel = s.viavel !== false, escolhida = a.escolha && a.escolha.tipo === s.tipo;
      h += '<div class="clim-sol" data-clim-sol="' + esc(a.id) + ":" + esc(s.tipo) + '"><b>' + (i + 1) + ". " + esc(s.nome) + "</b>" + (escolhida ? " " + pilula("1ª do cálculo", CORES.ok) : "") +
        '<ul style="margin:2px 0;padding-left:18px;font-size:12px">' + arr(s.justificativa).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" +
        (viavel ? '<button class="btn sm primary" data-clim="aplicar" data-amb="' + esc(a.id) + '" data-tipo="' + esc(s.tipo) + '"' + (ja ? " disabled" : "") + ' title="Coloca a evaporadora, a condensadora, a linha frigorígena, o dreno e o ponto de força num lote só (Ctrl+Z desfaz)">' + (ja ? "Já aplicado" : "Aplicar esta solução") + "</button>" : "") + "</div>";
    });
    return h || '<span class="muted">sem solução viável (veja os avisos)</span>';
  }
  function htmlResultado(m) {
    if (E.resultado && m && E.opsNoCalculo != null && assinatura(m) !== E.opsNoCalculo) return '<div data-clim="obsoleto" style="border:1px solid ' + CORES.aviso + ';border-radius:8px;padding:6px 10px;margin:6px 0;font-size:12px"><b>O modelo mudou desde o cálculo.</b> Os números não valem mais e as saídas estão bloqueadas: calcule de novo.</div>' + htmlResultadoCorpo(m);
    return htmlResultadoCorpo(m);
  }
  function htmlResultadoCorpo(m) {
    var R = E.resultado;
    if (!R) return '<p class="muted" style="font-size:12px">Calcule para ver a carga por ambiente e as soluções.</p>';
    var h = '<div data-clim="resultado">';
    var rs = R.resumo || {};
    h += '<p style="font-size:12px;margin:4px 0">' + (R.ok ? pilula("completo", CORES.ok) : pilula("incompleto: há pendências ou erros", CORES.aviso)) + " · " + fmt(rs.climatizados) + " de " + fmt(rs.ambientes) + " ambiente(s) climatizados · carga " + fmt(rs.carga_BTUh) + " BTU/h" +
      (R.fixture ? " · " + pilula("TABELAS DE TESTE — NÃO É NORMA", CORES.falha) : "") + "</p>";
    arr(R.ambientes).forEach(function (a) {
      if (!a.climatizar) { h += '<div class="clim-sol"><b>' + esc(a.nome) + '</b> <span class="muted">— não climatizado</span></div>'; return; }
      h += '<div class="clim-sol" data-clim-amb="' + esc(a.id) + '"><b>' + esc(a.nome) + "</b> · " + fmt(a.area_m2, 1) + " m²<div style=\"margin:3px 0\">" + htmlCarga(a) + "</div>" + htmlSolucoes(a, m, R) + "</div>";
    });
    if (arr(R.centrais).length) {
      var ex = idsExistentes(m), jaC = opsDe(R, null).some(function (o) { return ex[o.id]; }) && R.centrais.length > 0 && E.central === "sim";
      h += '<div class="clim-sol" data-clim="centrais"><b>Soluções centrais</b> (uma condensadora para vários ambientes)<ul style="margin:2px 0;padding-left:18px;font-size:12px">' + R.centrais.map(function (c) {
        return "<li><b>" + esc(c.tipo) + "</b> · " + fmt(c.carga_BTUh) + " BTU/h" + (c.fachadaEvitada != null ? " · " + fmt(c.fachadaEvitada) + " condensadora(s) a menos na fachada" : "") + (c.justificativa ? " — " + esc(c.justificativa) : "") +
          (arr(c.pendencias).length ? ' <span style="color:' + CORES.aviso + '">não verificado: ' + esc(arr(c.pendencias).map(function (p) { return p.chave || p; }).join(", ")) + "</span>" : "") + "</li>";
      }).join("") + '</ul><button class="btn sm" data-clim="central"' + (jaC ? " disabled" : "") + ' title="Recalcula com uma condensadora para todos os ambientes e aplica">' + (jaC ? "Já aplicado" : "Aplicar solução central") + "</button></div>";
    }
    var probs = problemas(R);
    if (probs.length && dep("ProblemaCard")) h += '<div data-clim="problemas">' + ProblemaCard.lista(probs, { titulo: "Avisos e correções (" + probs.length + ")", prefixoIndice: "", acoes: function (s) { return s.temOps ? s.texto : false; }, gravidade: "aviso" }) + "</div>";
    if (arr(R.pendencias).length) {
      h += '<div data-clim="pendencias" style="font-size:12px;margin:8px 0"><b>Não verificado: falta informação (' + R.pendencias.length + ')</b><ul style="margin:4px 0;padding-left:18px">' +
        R.pendencias.slice(0, LIMITE_LISTA).map(function (p) { return "<li><b>não verificado: falta " + esc(p.chave) + "</b> — " + esc(p.motivo) + (arr(p.usadoEm).length ? ' <span class="muted">(' + esc(arr(p.usadoEm).join("; ")) + ")</span>" : "") + "</li>"; }).join("") + "</ul></div>";
    }
    return h + "</div>";
  }
  function htmlTudo(m) {
    var h = '<details open data-clim="raiz" style="margin-top:14px;border-top:1px solid rgba(127,127,127,.35);padding-top:8px"><summary style="cursor:pointer;font-weight:600;font-size:13.5px">Climatização</summary>';
    if (!m) return h + '<p class="muted">Abra o BIM para calcular a climatização.</p></details>';
    var es = estacoes();
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0">' +
      '<label style="display:flex;flex-direction:column;gap:2px;font-size:12px;min-width:200px;flex:2"><span>Cidade / estação climática</span><select class="inp" data-clim-campo="estacao">' +
      (es.length ? es.map(function (e) { return '<option value="' + esc(e) + '"' + (e === E.estacao ? " selected" : "") + ">" + esc(e) + "</option>"; }).join("") : '<option value="">(tabela de condições externas indisponível)</option>') + "</select></label>" +
      '<label style="display:flex;flex-direction:column;gap:2px;font-size:12px;min-width:160px;flex:1"><span>Condensadora</span><select class="inp" data-clim-campo="central"><option value="auto"' + (E.central === "auto" ? " selected" : "") + '>Automática</option><option value="sim"' + (E.central === "sim" ? " selected" : "") + '>Uma para todos (central)</option><option value="nao"' + (E.central === "nao" ? " selected" : "") + ">Uma por ambiente</option></select></label></div>";
    h += htmlAmbientes(m);
    if (E.msg) h += '<div data-clim="msg" data-k="' + esc(E.msg.k) + '" style="border:1px solid ' + (E.msg.k === "erro" ? CORES.falha : (E.msg.k === "aviso" ? CORES.aviso : CORES.ok)) + ';border-radius:8px;padding:6px 10px;margin:8px 0;font-size:12.5px">' + esc(E.msg.t) + "</div>";
    h += htmlConf();
    var tem = !!E.resultado;
    h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0"><button class="btn sm primary" data-clim="calcular">Calcular</button>' +
      '<button class="btn sm" data-clim="desfazer"' + (E.aplicado ? "" : " disabled") + ' title="Remove o que a última aplicação colocou no modelo">Desfazer a aplicação</button>' +
      '<button class="btn sm" data-clim="memorial"' + (tem ? "" : " disabled") + ">Memorial</button>" +
      '<button class="btn sm" data-clim="pranchas"' + (tem ? "" : " disabled") + ' title="Planta por pavimento, esquema frigorígeno, dutos, detalhes e quadro de cargas (PDF)">Pranchas (PDF)</button>' +
      (tem ? '<button class="btn sm ghost" data-clim="limpar">Limpar</button>' : "") + "</div>";
    return h + htmlResultado(m) + "</details>";
  }

  /* "Confirmações do RT": o mesmo componente do incêndio (HidCalcUI.htmlConfirmacoes); sugere o item das divergências altas do resultado */
  function sugestoesConf() {
    var out = [];
    /* o aviso já confirmado pelo RT vira "info": não se sugere de novo o item que já está nas confirmações */
    arr(E.resultado && E.resultado.avisos).forEach(function (a) { if (a.gravidade !== "info" && /diverg[êe]ncia alta/i.test(a.texto || "") && arr(a.elementos)[0] != null) out.push("divergencia_carga:" + a.elementos[0]); });
    return out;
  }
  function htmlConf() {
    var H = global.HidCalcUI;
    if (!H || !H.htmlConfirmacoes) return "";
    return H.htmlConfirmacoes(E.conf, { raiz: 'data-clim="conf"', item: 'data-clim="conf-item"', add: 'data-clim="conf-add"', del: 'data-clim="conf-del"', campo: "data-clim-campo", pre: "cf:", sugestoes: sugestoesConf() });
  }
  function redesenhar() { if (E._raiz && E._raiz.parentNode) desenhar(E._raiz); }
  function desenhar(raiz) {
    var m = modelo();
    css(); garantirPadroes();
    raiz.innerHTML = htmlTudo(m).replace(/(<table class="tbl")/g, '<div class="clim-rola">$1').replace(/<\/table>/g, "</table></div>");
    if (dep("ProblemaCard")) {
      ProblemaCard.ligar(raiz, {
        corrigir: function (solId) {
          var i = Number(String(solId).replace(/^c/, "")), a = E.resultado && E.resultado.avisos[i];
          if (bloqueadoPorModelo()) return;
          if (a && a.corrigir && arr(a.corrigir.ops).length) aplicarOps(a.corrigir.ops, "Correção aplicada");
        }
      });
    }
  }
  function ligar(raiz) {
    raiz.onclick = function (ev) {
      var bt = ev.target && ev.target.closest ? ev.target.closest("[data-clim]") : null; if (!bt || bt.disabled) return;
      var a = bt.getAttribute("data-clim");
      if (a === "calcular") calcular();
      else if (a === "aplicar") aplicarSolucao(bt.getAttribute("data-amb"), bt.getAttribute("data-tipo"));
      else if (a === "central") aplicarCentral();
      else if (a === "desfazer") desfazerAplicacao();
      else if (a === "memorial") memorial();
      else if (a === "conf-add") { var er = global.HidCalcUI.confAdicionar(E.conf); if (er) E.msg = { k: "aviso", t: er }; else { E.msg = { k: "info", t: "Confirmação registrada: calcule de novo para ela valer." }; salvarLS(); } redesenhar(); }
      else if (a === "conf-del") { E.conf.confirmacoes.splice(Number(bt.getAttribute("data-i")), 1); salvarLS(); redesenhar(); }
      else if (a === "pranchas") pranchas();
      else if (a === "limpar") { E.resultado = null; E.opsNoCalculo = null; E.msg = null; E.escolhas = {}; redesenhar(); }
    };
    raiz.onchange = function (ev) {
      var el = ev.target, n = el && el.getAttribute ? el.getAttribute("data-clim-campo") : null; if (!n) return;
      var v = el.type === "checkbox" ? el.checked : el.value;
      if (n === "estacao") E.estacao = v;
      else if (n === "central") E.central = v;
      else if (n.indexOf("cf:") === 0) E.conf[n.split(":")[1]] = v;
      else if (n.indexOf("a:") === 0) {
        var p = n.split(":"), id = p.slice(1, p.length - 1).join(":"), campo = p[p.length - 1];
        E.amb[id] = E.amb[id] || {}; E.amb[id][campo] = v;
      }
      salvarLS();
    };
  }

  var ClimCalcUI = {
    VERSAO: 1, estado: E,
    /* o js/biminstui.js chama isto ao desenhar o painel Instalações (corpo = #bim-inst-corpo) */
    montar: function (corpo) {
      if (!corpo || !doc) return false;
      var raiz = doc.createElement("div"); raiz.id = "clim-calc"; corpo.appendChild(raiz);
      E._raiz = raiz; ligar(raiz); desenhar(raiz);
      return true;
    },
    calcular: calcular, aplicarSolucao: aplicarSolucao, aplicarCentral: aplicarCentral, desfazerAplicacao: desfazerAplicacao, memorial: memorial, pranchas: pranchas,
    entrada: function () { var m = modelo(); if (m) garantirPadroes(); return m ? entrada(m) : null; },
    problemas: problemas, htmlSimples: htmlSimples, opsDe: opsDe
  };
  global.ClimCalcUI = ClimCalcUI;
  if (typeof module !== "undefined" && module.exports) module.exports = ClimCalcUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
