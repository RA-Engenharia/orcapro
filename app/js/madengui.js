/* =====================================================================
 * madengui.js — a TELA "ESTRUTURAS DE MADEIRA" (E2 do módulo de madeira engenharada; prévia `?previa=madeng` + modelador).
 * Aba Carpintaria & Marcenaria › grupo "Estruturas de madeira" do BIM. Padrão único de tela (ROTEIRO-MODULO.md, js/modulo.js): cabeçalho → aviso →
 * indicadores → abas (os 5 passos) → conteúdo. Fina: quem calcula é o js/madengworker.js (Web Worker), quem traduz o estado é o
 * js/madengentrada.js, quem escreve as saídas é o js/madengsaidas.js e quem monta o orçamento é o js/madorcamento.js.
 *   1 Obra e local · 2 Tipologia (T1 cobertura de uma água, T7 deck) com desenho ao vivo · 3 Materiais e ligações por opção (A, B, C) ·
 *   4 Calcular (barra de progresso; η por grupo; achados do auditor com "o que é + Corrigir + Mostrar no 3D") · 5 Saídas.
 * Opções A/B/C em abas, com a tabela comparativa. Salvo na obra: localStorage `orcapro:madeira:eng:v1:<obra>` ({ v, estado, resumos }).
 * ⚠ O resultado COMPLETO (peças, ligações) fica só na memória da sessão (~200 KB por opção, teto do localStorage); o que se salva é o estado
 *   digitado e o RESUMO de cada opção. Depois de reabrir, o resumo aparece e as saídas pedem "Calcular" de novo.
 * ⚠ O deck (T7) entra com lista de peças, auditoria e orçamento — a VERIFICAÇÃO ESTRUTURAL do deck é da E4 e a tela diz isso.
 * ⚠ Sem backdrop-filter (a janela fica por cima do BIM, z 49; backdrop-filter quebra position:fixed dos filhos).
 * ===================================================================== */
(function (global) {
  "use strict";
  var doc = global.document;

  /* ================================================================ UTIL */
  function EN() { return global.MadEngEntrada; }
  function SA() { return global.MadEngSaidas; }
  function MO() { return global.MadOrcamento; }
  function WK() { return global.MadEngWorker; }
  function M() { return global.Modulo || null; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v, d) { return EN().num(v, d); }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function fmt(v, c) {
    if (v == null || !isFinite(v)) return "—";
    c = c == null ? 2 : c; var s = Math.abs(v).toFixed(c).split(".");
    return (v < 0 && Number(s.join(".")) !== 0 ? "−" : "") + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (c ? "," + s[1] : "");
  }
  function brl(v) { return v == null || !isFinite(v) ? "—" : "R$ " + fmt(v, 2); }
  function toast(t, tipo, ms) { try { if (global.UI && UI.toast) UI.toast(t, tipo || "ok", ms || 6000); } catch (e) {} }
  function ico(nome, t) { try { if (global.Icones && Icones.get) return Icones.get(nome, t || 16) || ""; } catch (e) {} return ""; }
  function Ges() { return global.Gestao; }
  function obraId() { var g = Ges(); return String((g && g._bimSel) || "geral"); }
  function obraApp() { var g = Ges(), o = null; try { if (g && g._bimSel && global.Store && global.Auth) o = Store.obter(Auth.empresaId(), "obras", g._bimSel); } catch (e) {} return o; }
  function versao() { try { return (global.CONFIG && CONFIG.versao) || ""; } catch (e) { return ""; } }
  function nomeSeguro(s) { var t = String(s || "obra"); return global.OpFormato && OpFormato.nomeSeguro ? OpFormato.nomeSeguro(t) : t.replace(/[^\w.-]+/g, "-"); }
  function chave() { return "orcapro:madeira:eng:v1:" + obraId(); }
  function lic(acao) { var L = global.LicencaFuncao; return L && L.guarda ? L.guarda("marcenaria", acao) : true; }
  function baixar(nome, dados, mime) {
    if (global.TesteModulo && TesteModulo.marcarArquivo) { var wT = TesteModulo.marcarArquivo(nome, dados, mime, "modela:marcenaria"); if (!wT) return false; nome = wT.nome; dados = wT.dados; }
    UIE.baixados.push(nome);
    if (global.BimMetalUI && BimMetalUI.baixar) return BimMetalUI.baixar(nome, dados, mime, "modela:marcenaria");
    try { var bl = new Blob([dados], { type: mime || "application/octet-stream" }), u = URL.createObjectURL(bl), a = doc.createElement("a"); a.href = u; a.download = nome; doc.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 60000); return true; } catch (e) { return false; }
  }
  function pil(t, tom) { var Mo = M(); return Mo ? Mo.pilula(t, tom) : esc(t); }
  function sec(o) { var Mo = M(); if (Mo) return Mo.secao(o); return "<section><h2>" + esc(o.titulo) + "</h2>" + (o.corpoHtml || "") + "</section>"; }
  function bt(acao, texto, o) {
    o = o || {};
    return '<button type="button" class="btn' + (o.pri ? " primary" : "") + (o.sm ? " sm" : "") + '" data-meg-acao="' + acao + '"' + (o.v != null ? ' data-meg-v="' + esc(o.v) + '"' : "") + (o.dis ? " disabled" : "") + (o.dica ? ' title="' + esc(o.dica) + '"' : "") + (o.id ? ' id="' + o.id + '"' : "") + ">" + (o.ico ? ico(o.ico, 15) + " " : "") + esc(texto) + "</button>";
  }

  /* ================================================================ ESTADO */
  var UIE = { est: null, passo: 1, porTip: {}, tipRes: null, res: {}, resumos: {}, calc: null, worker: null, obra: null, erro: null, baixados: [], saidas: {}, busca: null, buscando: false, desatualizado: {}, orcMostra: "A" };
  var GRUPO_NOME = { T: "Terças", V: "Vigas principais (V)", P: "Pilares", VG: "Vergas do vidro", TR: "Travessas", PD: "Pendurais", ES: "Escoras", BL: "Bloqueadores",
    PO: "Pilares de oitão", PC: "Pilares de cumeeira", FR: "Frechais", BS: "Banzos superiores", BI: "Banzos inferiores", DG: "Diagonais", CM: "Cumeeira", CB: "Caibros", TI: "Fita metálica (tirante)" };
  var FLECHA_NOME = { tercaVao: "Terça no vão", tercaBalanco: "Terça em balanço", vigaV: "Viga V", vigaVBalanco: "Viga V, balanço", topoPilarVentoFreq_H300: "Topo do pilar, vento (H/300)", vergaVentoFreq_L300: "Verga, vento (L/300)", vergaVertical_20mm: "Verga, vertical (20 mm)" };
  var PASSOS = [{ id: 1, nome: "Obra e local" }, { id: 2, nome: "Tipologia" }, { id: 3, nome: "Materiais e ligações" }, { id: 4, nome: "Calcular" }, { id: 5, nome: "Saídas" }];
  function est() { return UIE.est; }
  function opc() { return EN().opcaoDe(UIE.est, UIE.est.ativa); }
  function resAtiva() { return UIE.res[UIE.est.ativa] || null; }
  function resumoAtivo() { return UIE.resumos[UIE.est.ativa] || null; }

  function conferirObra() {
    if (UIE.obra === obraId() && UIE.est) return;
    UIE.obra = obraId(); UIE.res = {}; UIE.resumos = {}; UIE.saidas = {}; UIE.desatualizado = {}; UIE.erro = null; UIE.porTip = {}; UIE.tipRes = null; UIE.ultimoOrc = null;
    var s = null; try { var t = global.localStorage.getItem(chave()); s = t ? JSON.parse(t) : null; } catch (e) { s = null; }
    UIE.est = EN().migrar(s && s.estado);
    /* E4 r5: resultados e opção ativa POR TIPOLOGIA (a T1 e a T2 não dividem a opção A em memória). Salvo antigo (v1): os resumos eram da tipologia ativa. */
    if (s && s.porTip && typeof s.porTip === "object") Object.keys(s.porTip).forEach(function (k) { var b = s.porTip[k] || {}; UIE.porTip[k] = { res: {}, resumos: (b.resumos && typeof b.resumos === "object") ? b.resumos : {}, desatualizado: {}, saidas: {}, ativa: b.ativa || null }; });
    else if (s && s.resumos && typeof s.resumos === "object") UIE.porTip[UIE.est.tip] = { res: {}, resumos: s.resumos, desatualizado: {}, saidas: {}, ativa: null };
    trazerTip(UIE.est.tip);
    if (!UIE.est.obra.nome) { var o = obraApp(); if (o && o.nome) UIE.est.obra.nome = o.nome; }
    if (UIE.worker && !(UIE.calc && UIE.calc.rodando)) { try { UIE.worker.terminate(); } catch (e) {} UIE.worker = null; }
  }
  /* ESTADO POR TIPOLOGIA (E4 r5): UIE.res/resumos/desatualizado/saidas/ultimoOrc e a opção ativa são os da tipologia que está na tela (UIE.tipRes); as outras ficam em UIE.porTip.
     Trocar T1 ↔ T2 guarda uma e traz a outra: nada se perde e nada vaza (antes a T2 enxergava a opção A calculada da T1). */
  function guardarTip() { if (!UIE.est) return; var t = UIE.tipRes || UIE.est.tip; UIE.porTip[t] = { res: UIE.res, resumos: UIE.resumos, desatualizado: UIE.desatualizado, saidas: UIE.saidas, ultimoOrc: UIE.ultimoOrc || null, ativa: UIE.est.ativa }; }
  function trazerTip(t) {
    var b = UIE.porTip[t] || {}, e = UIE.est;
    UIE.res = b.res || {}; UIE.resumos = b.resumos || {}; UIE.desatualizado = b.desatualizado || {}; UIE.saidas = b.saidas || {}; UIE.ultimoOrc = b.ultimoOrc || null; UIE.comparar = false; UIE.erro = null; UIE.tipRes = t;
    if (b.ativa && e.opcoes.some(function (o) { return o.id === b.ativa; })) e.ativa = b.ativa;
    UIE.porTip[t] = { res: UIE.res, resumos: UIE.resumos, desatualizado: UIE.desatualizado, saidas: UIE.saidas, ultimoOrc: UIE.ultimoOrc, ativa: e.ativa };
  }
  function zerarRes() { UIE.porTip = {}; UIE.res = {}; UIE.resumos = {}; UIE.desatualizado = {}; UIE.saidas = {}; UIE.ultimoOrc = null; UIE.tipRes = UIE.est ? UIE.est.tip : null; }
  function trocarTip(val) { var e = est(), tinha = !!UIE.porTip[val]; guardarTip(); e.tip = val; if (val === "T7") e.t7.ativo = true; trazerTip(val); if (!tinha) e.ativa = e.opcoes[0].id; salvar(); }
  function salvar() {
    try {
      guardarTip(); var pt = {}; Object.keys(UIE.porTip).forEach(function (k) { pt[k] = { resumos: UIE.porTip[k].resumos, ativa: UIE.porTip[k].ativa }; });
      global.localStorage.setItem(chave(), JSON.stringify({ v: 2, estado: UIE.est, resumos: UIE.resumos, porTip: pt, em: Date.now() })); return true;
    } catch (e) { return false; }
  }

  /* resumo compacto de um resultado (o que vai para o localStorage) e linha do comparativo */
  function ferragens(O) {
    var it = {}; arr(O && O.itens).forEach(function (x) { it[x.codigo] = x.qtd; });
    return { acoKg: it["02.01"] || 0, pinos: (it["02.02"] || 0) + (it["02.03"] || 0), parafusos: (it["02.05"] || 0) + (it["02.06"] || 0) };
  }
  function etaMax(r) { var m = 0; Object.keys(r.pior || {}).forEach(function (k) { var v = r.pior[k]; m = Math.max(m, v == null ? 99 : v); }); return m; }
  function compactar(r) {
    var vol = 0; Object.keys((r.fonte && r.fonte.volume_por_material_m3) || {}).forEach(function (k) { vol += r.fonte.volume_por_material_m3[k]; });
    var O = r.orcamento || {}, f = ferragens(O);
    return { opcao: r.opcao, nomeOpcao: r.nomeOpcao, ok: r.ok, semSolucao: r.semSolucao, soDeck: !!r.soDeck, secoes: r.secoes, pior: r.pior, grupos: r.grupos, flechas: r.flechas, reacoes: r.reacoes, iteracoes: r.iteracoes,
      achados: arr(r.auditoria && r.auditoria.achados), situacao: SA().situacao ? SA().situacao(r) : null, ligOk: r.ligacoes ? r.ligacoes.ok !== false : null, avisosAnalise: arr(r.avisosAnalise).slice(0, 8), ms: r.ms, em: Date.now(),
      cmp: { volume: Math.round(vol * 100) / 100, pecas: arr(r.fonte && r.fonte.pecas).length, acoKg: f.acoKg, pinos: f.pinos, parafusos: f.parafusos, etaMax: etaMax(r), custo: O.custo_direto, preco: O.preco, adotados: O.adotados },
      orc: { custo_direto: O.custo_direto, preco: O.preco, bdi: O.bdi, etapas: O.etapas, volumes: O.volumes, adotados: O.adotados } };
  }

  /* ================================================================ ESTILO */
  function estilo() {
    if (!doc || doc.getElementById("meg-estilo")) return;
    var st = doc.createElement("style"); st.id = "meg-estilo";
    st.textContent = [
      ".meg-veu{position:fixed;inset:0;z-index:49;background:var(--bg);color:var(--texto);display:flex;flex-direction:column}",
      ".meg-jan{position:relative;flex:1;overflow:auto;padding:18px 24px 40px;outline:none}",
      ".meg-in{max-width:1320px;margin:0 auto;display:flex;flex-direction:column;gap:16px}",
      ".meg-fechar{position:absolute;top:14px;right:16px;z-index:2}",
      ".meg-in .mod-cab{padding-right:48px}",
      ".meg-grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px 16px}",
      ".meg-campo{display:flex;flex-direction:column;gap:4px;font-size:var(--t-peq);color:var(--texto-fraco)}",
      ".meg-campo input,.meg-campo select,.meg-campo textarea{font-size:var(--t-base);color:var(--texto);width:100%;box-sizing:border-box}",
      ".meg-campo textarea{min-height:92px;font-family:inherit}",
      ".meg-2col{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,420px);gap:16px;align-items:start}",
      ".meg-sub{margin:14px 0 6px;font-size:var(--t-base);font-weight:var(--p-forte)} .meg-fraco,.meg-nota{color:var(--texto-fraco);font-size:var(--t-peq)}",
      ".meg-nota{margin:6px 0 0}",
      ".meg-desenho{border:1px solid var(--linha);border-radius:var(--raio);background:var(--surface);padding:8px}",
      ".meg-desenho svg{width:100%;height:auto;display:block} .meg-desenho .t{font-size:11px;fill:var(--texto-fraco)}",
      ".meg-linha{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}",
      ".meg-barra{height:8px;border-radius:var(--raio-sm);background:var(--surface-2);overflow:hidden;margin:14px 0}",
      ".meg-barra i{display:block;height:100%;background:var(--aco);transition:width .4s var(--ease)}",
      ".meg-prog{max-width:640px;margin:24px auto;text-align:center}",
      ".meg-etapas{list-style:none;margin:12px auto 0;padding:0;text-align:left;max-width:560px}",
      ".meg-etapas li{padding:5px 0 5px 22px;position:relative;color:var(--texto-fraco)}",
      ".meg-etapas li::before{content:'';position:absolute;left:4px;top:11px;width:8px;height:8px;border-radius:50%;background:var(--linha-forte)}",
      ".meg-etapas li.feito{color:var(--texto)} .meg-etapas li.feito::before{background:var(--verde)}",
      ".meg-etapas li.agora{color:var(--aco);font-weight:var(--p-forte)} .meg-etapas li.agora::before{background:var(--aco)}",
      ".meg-eta{display:flex;align-items:center;gap:8px;justify-content:flex-end}",
      ".meg-eta i{display:block;width:72px;height:6px;border-radius:var(--raio-sm);background:var(--surface-2);overflow:hidden;position:relative}",
      ".meg-eta i b{position:absolute;left:0;top:0;bottom:0;background:var(--verde)} .meg-eta i b.al{background:var(--amarelo)} .meg-eta i b.er{background:var(--vermelho)}",
      ".meg-achado{border:1px solid var(--linha);border-radius:var(--raio);padding:12px 14px;margin:8px 0;background:var(--surface)}",
      ".meg-achado b{font-weight:var(--p-forte)} .meg-achado p{margin:4px 0}",
      ".meg-docs{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}",
      ".meg-doc{border:1px solid var(--linha);border-radius:var(--raio);padding:14px;display:flex;flex-direction:column;gap:8px;background:var(--surface)}",
      ".meg-doc b{font-weight:var(--p-forte)} .meg-doc p{margin:0;color:var(--texto-fraco);font-size:var(--t-peq)} .meg-doc .btn{align-self:flex-start}",
      ".meg-rola{overflow-x:auto} table.tbl.meg-t th,table.tbl.meg-t td{padding:7px 10px} .meg-t input{width:100%;min-width:90px}",
      ".meg-deck{border:1px solid var(--linha);border-radius:var(--raio);padding:12px 14px;margin:10px 0}",
      ".meg-texto{width:100%;min-height:150px;font-family:ui-monospace,Consolas,monospace;font-size:var(--t-peq)}",
      "@media (max-width:900px){.meg-2col{grid-template-columns:1fr}.meg-jan{padding:12px 12px 32px}}"
    ].join("\n");
    (doc.head || doc.documentElement).appendChild(st);
  }

  /* ================================================================ CAMPOS */
  function getPath(path) {
    var t = path.split("."), o = t[0] === "opc" ? opc() : UIE.est, i = t[0] === "opc" ? 1 : 0;
    for (; i < t.length; i++) { if (o == null) return undefined; o = o[t[i]]; }
    return o;
  }
  function setPath(path, v) {
    var t = path.split("."), o = t[0] === "opc" ? opc() : UIE.est, i = t[0] === "opc" ? 1 : 0;
    for (; i < t.length - 1; i++) { if (o[t[i]] == null || typeof o[t[i]] !== "object") o[t[i]] = {}; o = o[t[i]]; }
    o[t[t.length - 1]] = v;
  }
  function campo(rotulo, path, o) {
    o = o || {}; var v = getPath(path), tipo = o.tipo || "num", at = ' data-meg-campo="' + path + '" data-meg-tipo="' + tipo + '"';
    var h = '<label class="meg-campo"' + (o.dica ? ' title="' + esc(o.dica) + '"' : "") + "><span>" + esc(rotulo) + (o.un ? " (" + esc(o.un) + ")" : "") + "</span>";
    if (tipo === "sel") h += "<select" + at + ">" + o.opcoes.map(function (op) { return '<option value="' + esc(op[0]) + '"' + (String(v) === String(op[0]) ? " selected" : "") + ">" + esc(op[1]) + "</option>"; }).join("") + "</select>";
    else if (tipo === "area") h += "<textarea" + at + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : "") + ">" + esc(v == null ? "" : v) + "</textarea>";
    else if (tipo === "chk") h = '<label class="meg-campo" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox"' + at + (v ? " checked" : "") + "> <span>" + esc(rotulo) + "</span>";
    else h += '<input type="' + (tipo === "txt" ? "text" : "text") + '" inputmode="' + (tipo === "txt" ? "text" : "decimal") + '"' + at + ' value="' + esc(v == null ? "" : (tipo === "num" ? String(v).replace(".", ",") : v)) + '"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : "") + ">";
    return h + "</label>";
  }

  /* ================================================================ DESENHO AO VIVO (planta + corte) */
  function desenhoHtml() {
    var E = EN(), p, t7 = null;
    try { p = E.t1Params(est()); t7 = est().t7.ativo ? E.toProj(est(), est().ativa).t7 : null; } catch (e) { return ""; }
    var T = p.teto, rects = [];
    if (t7) t7.decks.forEach(function (d) { if (d.modo === "retangulo") rects.push([d.x0, d.x1, d.y0, d.y1]); else d.rects.forEach(function (q) { rects.push(q); }); });
    var x0 = T.x0, x1 = T.x1, y0 = T.y0, y1 = T.y1;
    rects.forEach(function (q) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[1]); y0 = Math.min(y0, q[2]); y1 = Math.max(y1, q[3]); });
    var W0 = 380, mg = 14, s = (W0 - 2 * mg) / Math.max(x1 - x0, 0.5), Hh = Math.max(60, (y1 - y0) * s + 2 * mg);
    function X(x) { return (mg + (x - x0) * s).toFixed(1); } function Y(y) { return (Hh - mg - (y - y0) * s).toFixed(1); }
    var sv = '<svg viewBox="0 0 ' + W0 + " " + Hh.toFixed(0) + '" role="img" aria-label="Planta da estrutura">';
    rects.forEach(function (q) { sv += '<rect x="' + X(q[0]) + '" y="' + Y(q[3]) + '" width="' + ((q[1] - q[0]) * s).toFixed(1) + '" height="' + ((q[3] - q[2]) * s).toFixed(1) + '" fill="var(--surface-2)" stroke="var(--linha-forte)" stroke-width="0.6"/>'; });
    sv += '<rect x="' + X(T.x0) + '" y="' + Y(T.y1) + '" width="' + ((T.x1 - T.x0) * s).toFixed(1) + '" height="' + ((T.y1 - T.y0) * s).toFixed(1) + '" fill="none" stroke="var(--aco)" stroke-width="1" stroke-dasharray="4 3"/>';
    var P = p.parede; sv += '<rect x="' + X(P.x0) + '" y="' + Y(P.y1) + '" width="' + ((P.x1 - P.x0) * s).toFixed(1) + '" height="' + ((P.y1 - P.y0) * s).toFixed(1) + '" fill="none" stroke="var(--texto-fraco)" stroke-width="1"/>';
    var nT = Math.max(1, Math.ceil((T.y1 - T.y0) / p.cobertura.sTercaMax));
    for (var k = 0; k <= nT; k++) { var yy = T.y0 + k * (T.y1 - T.y0) / nT; sv += '<line x1="' + X(T.x0) + '" x2="' + X(T.x1) + '" y1="' + Y(yy) + '" y2="' + Y(yy) + '" stroke="var(--linha-forte)" stroke-width="0.7"/>'; }
    p.pilares.x.forEach(function (x) { sv += '<line x1="' + X(x) + '" x2="' + X(x) + '" y1="' + Y(T.y0) + '" y2="' + Y(T.y1) + '" stroke="var(--aco)" stroke-width="2"/>'; p.pilares.y.forEach(function (y) { sv += '<circle cx="' + X(x) + '" cy="' + Y(y) + '" r="4" fill="var(--texto)"/>'; }); });
    sv += '<text class="t" x="' + mg + '" y="11">Planta: vigas V (azul), terças, pilares, vidro e deck</text></svg>';
    /* corte ao longo de y */
    var zt = function (y) { return p.zTelhaRef + p.cobertura.incl * (p.yRef - y); }, zmax = zt(T.y0) + 0.2, zmin = p.baseZ - 0.3, W1 = 380, H1 = 150, s1 = Math.min((W1 - 2 * mg) / Math.max(T.y1 - T.y0, 0.5), (H1 - 2 * mg) / Math.max(zmax - zmin, 0.5));
    function Y1(y) { return (mg + (y - T.y0) * s1).toFixed(1); } function Z1(z) { return (H1 - mg - (z - zmin) * s1).toFixed(1); }
    var c = '<svg viewBox="0 0 ' + W1 + " " + H1 + '" role="img" aria-label="Corte da cobertura">';
    c += '<line x1="' + Y1(T.y0) + '" x2="' + Y1(T.y1) + '" y1="' + Z1(p.baseZ) + '" y2="' + Z1(p.baseZ) + '" stroke="var(--texto-fraco)" stroke-width="1"/>';
    c += '<line x1="' + Y1(T.y0) + '" y1="' + Z1(zt(T.y0)) + '" x2="' + Y1(T.y1) + '" y2="' + Z1(zt(T.y1)) + '" stroke="var(--aco)" stroke-width="2.5"/>';
    c += '<line x1="' + Y1(p.parede.y0) + '" x2="' + Y1(p.parede.y1) + '" y1="' + Z1(p.vidroTopo) + '" y2="' + Z1(p.vidroTopo) + '" stroke="var(--texto-fraco)" stroke-dasharray="3 3"/>';
    p.pilares.y.forEach(function (y) { c += '<line x1="' + Y1(y) + '" x2="' + Y1(y) + '" y1="' + Z1(p.baseZ) + '" y2="' + Z1(p.vidroTopo) + '" stroke="var(--texto)" stroke-width="3"/>'; });
    c += '<text class="t" x="' + mg + '" y="11">Corte: telha (inclinação ' + fmt(num(est().t1.incl, 0), 1) + " %), topo do vidro e pilares</text></svg>";
    return '<div class="meg-desenho" data-meg="desenho">' + sv + c + "</div>";
  }

  /* ================================================================ CABEÇALHO / AVISO / KPIs / ABAS */
  function cabecalho() {
    var Mo = M(), e = est(), nome = e.obra.nome || (obraApp() || {}).nome || "";
    var sub = (nome ? nome + " · " : "") + "NBR 7190-1:2022 · NBR 6123 · NBR 6120 · NBR 8681 · MLC EN 14080 (fonte secundária)";
    var acoes = [bt("exemplo", "Carregar exemplo Casa Mar", { ico: "camadas", dica: "Preenche a tela com a obra de regressão do módulo: casa de uma água e dois decks em Balneário Camboriú" }), bt("novo", "Começar do zero", { ico: "livro" })];
    var cal = UIE.calc && UIE.calc.rodando;
    var pri = '<button type="button" class="btn primary" data-meg-acao="calcular" id="meg-calcular"' + (cal ? " disabled" : "") + ' title="Calcula a opção ativa em paralelo; a tela continua livre">' + ico("raio", 15) + " Calcular</button>";
    return Mo.cab({ iconeHtml: ico("estrutura", 22), titulo: "Estruturas de madeira", sub: sub, acoes: acoes, primariaHtml: pri }).replace("<h1>", '<h1 id="meg-tit">');
  }
  function avisoTopo() {
    var Mo = M(), r = resumoAtivo(); if (!Mo) return "";
    if (UIE.erro) return Mo.aviso({ tom: "erro", titulo: "O cálculo não terminou", texto: UIE.erro });
    if (UIE.calc && UIE.calc.modo === "pagina" && UIE.calc.rodando) return Mo.aviso({ tom: "alerta", titulo: "Calculando na própria página", texto: "O navegador não abriu o processo paralelo: a tela fica parada até terminar." });
    if (r && UIE.desatualizado[est().ativa]) return Mo.aviso({ tom: "alerta", titulo: "Resultado desatualizado", texto: "Você mudou algum dado depois do último cálculo. Calcule de novo para as saídas refletirem a mudança." });
    if (r && r.semSolucao) return Mo.aviso({ tom: "erro", titulo: "Sem solução dentro dos limites de altura", texto: "Alguma peça não passa na maior seção permitida. Aumente os limites no passo 3 ou mude a geometria." });
    if (r && arr(r.achados).length) return Mo.aviso({ tom: "alerta", titulo: arr(r.achados).length + " achado(s) do pente-fino", texto: "Cada um vem com o que é, como corrigir e o botão para ver no 3D (passo 4)." });
    return "";
  }

  /* SITUAÇÃO (E3): nunca "Atende" com ligação reprovada, achado aberto ou aviso do motor */
  var FAIXA_DOC = "Documento gerado pelo sistema — emissão somente após conferência e ART do responsável técnico";
  function sitDe(r) {
    if (!r) return { atende: false, itens: [] };
    if (r.situacao) return r.situacao;
    var it = []; arr(r.achados).forEach(function (a) { it.push({ tipo: "achado", texto: a.mensagem, peca: a.peca, correcao: a.correcao, regra: a.regra }); });
    if (r.ligOk === false) it.push({ tipo: "ligacao", texto: "Ligação reprovada no cálculo.", correcao: "Aumentar fixadores, chapa ou seção e recalcular." });
    if (r.semSolucao) it.push({ tipo: "recusa", texto: "O dimensionamento não encontrou solução." });
    var pr = [];
    arr(r.avisosAnalise).forEach(function (a) { var tx = typeof a === "string" ? a : JSON.stringify(a), cl = SA().classeAviso ? SA().classeAviso(tx) : { classe: "bloqueante" }; if (cl.classe === "informativo") pr.push({ tipo: "premissa", cod: cl.cod, texto: tx, porque: cl.porque }); else it.push({ tipo: "aviso", texto: tx }); });
    return { atende: !it.length, itens: it, premissas: pr };
  }
  function sitRotulo(r) { var s0 = sitDe(r); return r.semSolucao ? "Sem solução" : (s0.atende ? "Atende" : "Com pendências (" + s0.itens.length + ")"); }
  var PECA_DE_LIG = { base: "P1", placa: "P1", chumbadores: "P1", solda: "P1", topo: "P1", topoV: "P1", reforcoV: "V1", apoioV: "P1", tercaV: "T01", verga: "VG1", escora: "ES1-03a", bloqueador: "BL01-1", fita: "FX011a" };
  function pecaDoItem(x, r) {
    if (x.peca) return x.peca;
    var t = String(x.texto || ""), k = Object.keys(PECA_DE_LIG).filter(function (n) { return new RegExp("\\b" + n + "\\b", "i").test(t); })[0];
    var pc = r && r.fonte && r.fonte.pecas || [], alvo = k ? PECA_DE_LIG[k] : null;
    if (alvo && (!pc.length || pc.some(function (p) { return p.id === alvo; }))) return alvo;
    var g = /Grupo (\w+) reprovado/.exec(t); if (g) { var m = { T: "T01", V: "V1", P: "P1", ES: "ES1-03a", BL: "BL01-1", VG: "VG1", TR: "TR1a", PD: "PD1" }[g[1]]; if (m) return m; }
    return pc.length ? pc[0].id : null;
  }
  /* PREMISSAS ADOTADAS (E4 r5): avisos informativos (nota de norma, Kθ calculado, M4/M13...) — num bloco neutro, nunca em vermelho; a classificação mora em MadEngSaidas.PREMISSAS */
  function premissasHtml(s0) {
    var pr = arr(s0 && s0.premissas); if (!pr.length) return "";
    return '<details class="meg-prem" data-meg="premissas" data-n="' + pr.length + '" style="border:1px solid #c9ced6;background:#f6f7f9;padding:8px 12px;margin:0 0 12px;border-radius:6px"><summary><b>Premissas adotadas</b> (' + pr.length + ') — informativas, não impedem a emissão</summary>' +
      pr.map(function (x, i) { return '<div data-meg-prem="' + i + '" style="margin:6px 0 0"><b>' + esc(x.cod || "") + "</b> — " + esc(x.texto) + (x.porque ? '<div style="opacity:.75;font-size:.92em">' + esc(x.porque) + "</div>" : "") + "</div>"; }).join("") + "</details>";
  }
  function situacaoHtml(r) {
    var s0 = sitDe(r), Mo = M(); if (!r || !Mo) return "";
    if (s0.atende) return '<div class="meg-sit ok" data-meg="situacao" data-atende="1"><b>Situação: atende</b> — todas as verificações atendem; sem achado, ligação reprovada nem pendência bloqueante.</div>' + premissasHtml(s0);
    var h = '<div class="meg-sit" data-meg="situacao" data-atende="0" style="border:2px solid #a3352b;background:#fbf1ef;padding:10px 12px;margin:0 0 12px;border-radius:6px"><b style="color:#a3352b">Situação: NÃO ATENDE — ' + s0.itens.length + " item(ns) bloqueante(s). Resolva antes de emitir qualquer documento.</b>";
    s0.itens.forEach(function (x, i) {
      h += '<div class="meg-achado" data-meg-sit="' + i + '" data-tipo="' + esc(x.tipo) + '"><div>' + pil(x.tipo === "ligacao" || x.tipo === "recusa" || x.tipo === "grupo" ? "Reprovado" : (x.tipo === "achado" ? "Achado" : "Aviso bloqueante"), "erro") + (x.peca ? " <b>" + esc(x.peca) + "</b>" : "") + "</div><p><b>O que é:</b> " + esc(x.texto) + "</p>" +
        (x.correcao ? "<p><b>Como corrigir:</b> " + esc(x.correcao) + "</p>" : "") + '<div class="meg-linha">' + bt("sit-corrigir", "Corrigir", { sm: 1, v: i, pri: 1 }) + bt("sit-3d", "Mostrar no 3D", { sm: 1, v: i, dis: !UIE.res[r.opcao] }) + "</div></div>";
    });
    return h + "</div>" + premissasHtml(s0);
  }
  function faixaHtml() { return '<div class="meg-faixa" data-meg="faixa" style="border:1px solid #a3352b;color:#a3352b;text-align:center;font-weight:600;padding:6px;margin:0 0 10px;border-radius:4px">' + esc(FAIXA_DOC) + "</div>"; }
  function kpis() {
    var Mo = M(), r = resumoAtivo(); if (!Mo || !r) return "";
    var c = r.cmp || {}, op = EN().opcaoDe(est(), r.opcao);
    return Mo.kpis([
      { rotulo: "Situação", valor: sitRotulo(r), sub: "opção " + r.opcao + (r.soDeck ? " · deck calculado (T7)" : ""), tom: r.semSolucao ? "neg" : (sitDe(r).atende ? "pos" : "alerta"), id: "meg-k-sit" },
      { rotulo: "Aproveitamento", valor: r.soDeck && !r.deck ? "—" : fmt(r.soDeck ? r.deck.etaMax : c.etaMax, 2), sub: r.soDeck && !r.deck ? "deck sem verificação estrutural" : (r.soDeck ? "η máximo do deck (tábua, barrote, viga, pilarete, guarda-corpo)" : "η máximo entre os grupos"), tom: c.etaMax > 1 ? "neg" : (c.etaMax > 0.9 ? "alerta" : ""), id: "meg-k-eta" },
      { rotulo: "Madeira", valor: fmt(c.volume, 2) + " m³", sub: c.pecas + " peças", id: "meg-k-vol" },
      { rotulo: "Ferragens", valor: fmt(c.acoKg, 0) + " kg", sub: fmt(c.pinos, 0) + " pinos/parafusos Ø16", id: "meg-k-fer" },
      { rotulo: "Preço com BDI", valor: brl(c.preco), sub: "custo direto " + brl(c.custo) + (c.adotados ? " · " + c.adotados + " adoções" : ""), id: "meg-k-preco" }
    ]);
  }
  function abasPassos() {
    var Mo = M();
    return Mo.abas(PASSOS.map(function (p) { return { rotulo: p.id + ". " + p.nome, ativa: UIE.passo === p.id, attrs: 'data-meg-acao="passo" data-meg-v="' + p.id + '"' }; }), { id: "meg-passos" });
  }
  function abasOpcoes() {
    var Mo = M(), e = est();
    var L = e.opcoes.map(function (o) { return { rotulo: "Opção " + o.id + (UIE.res[o.id] || UIE.resumos[o.id] ? "" : "  (sem cálculo)"), ativa: UIE.passo !== 6 && e.ativa === o.id, attrs: 'data-meg-acao="opcao" data-meg-v="' + o.id + '"' }; });
    L.push({ rotulo: "Comparar A, B e C", ativa: UIE.comparar === true, attrs: 'data-meg-acao="comparar"' });
    return Mo.abas(L, { id: "meg-opcoes" });
  }

  /* ================================================================ PASSO 1 — OBRA E LOCAL */
  function v0Info() {
    var e = est(), I = global.AcoIsopletas; if (!I || e.obra.lat == null || e.obra.lon == null) return null;
    try { var r = I.v0(e.obra.lat, e.obra.lon); return r && !r.erro ? r : null; } catch (er) { return null; }
  }
  function passo1() {
    var e = est(), o = e.obra, v = v0Info(), h = "";
    h += sec({ titulo: "Onde é a obra", sub: "A cidade dá o V0 no mapa de isopletas da NBR 6123. Endereço com cidade e estado, link do mapa ou coordenadas (ex.: −26,99 −48,635).", corpoHtml:
      '<div class="meg-grade">' + campo("Nome da obra", "obra.nome", { tipo: "txt" }) + campo("Cidade, endereço ou coordenadas", "obra.local", { tipo: "txt", ph: "Balneário Camboriú/SC" }) + "</div>" +
      '<div class="meg-linha">' + bt("localizar", UIE.buscando ? "Procurando…" : "Localizar", { sm: 1, dis: UIE.buscando }) + "</div>" + buscaHtml() +
      '<div class="meg-grade">' + campo("Latitude", "obra.lat", { un: "graus" }) + campo("Longitude", "obra.lon", { un: "graus" }) + "</div>" +
      (v ? '<p class="meg-nota" data-meg="v0"><b>V0 = ' + fmt(v.v0Adotado, 0) + " m/s</b> — " + esc(String(v.texto || "").slice(0, 260)) + "</p>" : '<p class="meg-nota" data-meg="v0">Informe a cidade ou as coordenadas para achar o V0.</p>') });
    h += sec({ titulo: "Vento e terreno", sub: "S1 (topografia), categoria de rugosidade e grupo do fator estatístico S3.", corpoHtml: '<div class="meg-grade">' +
      campo("Terreno (S1)", "obra.s1tipo", { tipo: "sel", opcoes: [["plano", "Plano ou fracamente acidentado"], ["talude", "Talude"], ["morro", "Morro"], ["vale", "Vale profundo"]] }) +
      campo("Valor de S1", "obra.s1", { dica: "Plano 1,0; talude ou morro: valor do estudo; vale 0,9" }) +
      campo("Categoria de rugosidade", "obra.categoria", { tipo: "sel", opcoes: [["I", "I — mar aberto, lagos"], ["II", "II — campo aberto, poucos obstáculos"], ["III", "III — subúrbios, casas baixas"], ["IV", "IV — cidade, prédios até 25 m"], ["V", "V — grande cidade"]] }) +
      campo("Grupo S3", "obra.grupoS3", { tipo: "sel", opcoes: [["1", "1 — edificação essencial"], ["2", "2 — residencial, comercial"], ["3", "3 — galpões, fácil abandono"], ["4", "4 — vedação"], ["5", "5 — temporária"]] }) + "</div>" });
    h += sec({ titulo: "Madeira: umidade e uso", sub: "Entram no kmod, na fluência (φ) e no tratamento.", corpoHtml: '<div class="meg-grade">' +
      campo("Classe de umidade", "obra.umidade", { tipo: "sel", opcoes: [["1", "1 — interna, seca"], ["2", "2 — coberta, ventilada"], ["3", "3 — exposta ao tempo (litoral)"], ["4", "4 — imersa ou em contato com a água"]] }) +
      campo("Categoria de uso (NBR 16143)", "obra.usoCat", { tipo: "sel", opcoes: [["1", "1 — interno seco"], ["2", "2 — interno úmido"], ["3", "3 — externo, sem contato com o solo"], ["4", "4 — contato com solo ou água doce"], ["5", "5 — água salgada"]] }) + "</div>" });
    h += sec({ titulo: "Vento avançado", sub: "Deixe em branco para o sistema tirar da geometria da cobertura. Desde a R04 o cálculo SEMPRE usa a geometria da cobertura (telha + testeira); se o valor digitado aqui divergir, vale o da geometria e o bloco de situação traz o aviso M1.", corpoHtml: '<div class="meg-grade">' + campo("Altura da parede (h)", "obra.ventoH", { un: "m", dica: "Do piso ao beiral baixo; branco = calculado" }) + campo("Altura da cumeeira", "obra.ventoHCumeeira", { un: "m", dica: "Do piso ao ponto mais alto da cobertura; branco = calculado" }) + "</div>" });
    var F = o.faces;
    h += sec({ titulo: "Fechamento das quatro fachadas", sub: "Aberta com vão grande vira abertura dominante (combinação excepcional).", corpoHtml: '<div class="meg-grade">' +
      [["frente", "Frente"], ["fundo", "Fundos"], ["esquerda", "Lado esquerdo"], ["direita", "Lado direito"]].map(function (f) {
        return campo(f[1], "obra.faces." + f[0] + ".vedacao", { tipo: "sel", opcoes: [["misto", "Vidro ou misto (permeável)"], ["telha", "Fechada, sem abertura"], ["alvenaria", "Alvenaria"], ["aberta", "Aberta"]] });
      }).join("") + "</div>" });
    return h;
  }
  function buscaHtml() {
    var b = UIE.busca; if (!b) return "";
    if (b.erro) return '<p class="meg-nota" role="alert">' + esc(b.erro) + "</p>";
    return '<ul class="meg-lista">' + arr(b.lista).map(function (x, i) { return "<li>" + esc(x.nome || "") + " " + bt("usar-local", "Usar este", { sm: 1, v: i }) + "</li>"; }).join("") + "</ul>";
  }

  /* ================================================================ PASSO 2 — TIPOLOGIA */
  function passo2() {
    var e = est(), t = e.t1, h = "";
    h += sec({ titulo: "Tipologia", corpoHtml: '<div class="meg-linha" role="radiogroup" aria-label="Tipologia">' +
      bt("tip", "T1 — Cobertura de uma água (casa, pavilhão)", { sm: 1, v: "T1", pri: e.tip === "T1" }) + bt("tip", "T2 — Casa de duas águas (tesoura ou cumeeira portante)", { sm: 1, v: "T2", pri: e.tip === "T2" }) + bt("tip", "T7 — Somente deck elevado", { sm: 1, v: "T7", pri: e.tip === "T7" }) + "</div>" +
      '<p class="meg-nota">T1 calcula pilares, vigas V, terças, vergas e ligações. O deck (T7) pode acompanhar a T1 ou ficar sozinho; as outras tipologias entram na próxima entrega.</p>' });
    if (e.tip === "T1") {
      var inputs = '<div class="meg-grade">' +
        campo("Pilar 1: X", "t1.p1x", { un: "m" }) + campo("Pilar 1: Y", "t1.p1y", { un: "m" }) + campo("Vão entre as vigas V", "t1.vao", { un: "m", dica: "Distância entre os eixos dos pilares na direção das terças" }) +
        campo("Comprimento das vigas V", "t1.comp", { un: "m", dica: "Distância entre os eixos dos pilares na direção da viga" }) + campo("Cota do piso (base dos pilares)", "t1.cotaPiso", { un: "m" }) +
        campo("Pé-direito (piso ao topo do vidro)", "t1.peDireito", { un: "m" }) + campo("Altura disponível sob a telha", "t1.altDisp", { un: "m", dica: "Do topo do vidro à face de cima da telha, no lado baixo: é onde cabem verga, viga V e terça" }) +
        campo("Inclinação da telha", "t1.incl", { un: "%" }) + campo("Beiral esquerdo", "t1.beiral.esq", { un: "m" }) + campo("Beiral direito", "t1.beiral.dir", { un: "m" }) + campo("Beiral frente", "t1.beiral.frente", { un: "m" }) + campo("Beiral fundos", "t1.beiral.fundo", { un: "m" }) +
        campo("Afastamento do vidro: esquerda", "t1.afast.esq", { un: "m" }) + campo("Afastamento do vidro: direita", "t1.afast.dir", { un: "m" }) + campo("Afastamento do vidro: frente", "t1.afast.frente", { un: "m" }) + campo("Afastamento do vidro: fundos", "t1.afast.fundo", { un: "m" }) +
        campo("Viga V de altura variável", "t1.vAltVar", { tipo: "sel", opcoes: [["true", "Sim (pontas afinadas)"], ["false", "Não (fundo reto)"]] }) + campo("Altura da viga V na ponta", "t1.hPonta", { un: "m" }) + campo("Altura MÁXIMA da V na ponta (atrás da testeira)", "t1.hPontaMax", { un: "m" }) + "</div>" +
        '<p class="meg-nota">A verga do topo do vidro entra nas duas fachadas (frente e fundos), com travessa e pendural. O vento (altura da parede e da cumeeira) se calcula da geometria; ajuste em "Vento avançado" no passo 1 se precisar.</p>';
      h += '<div class="meg-2col">' + sec({ titulo: "Cobertura de uma água (T1)", corpoHtml: inputs }) + desenhoHtml() + "</div>";
    }
    if (e.tip === "T2") {
      var in2 = '<div class="meg-grade">' +
        campo("Vão (largura entre eixos dos pilares)", "t2.vao", { un: "m" }) + campo("Comprimento (direção da cumeeira)", "t2.comp", { un: "m", dica: "A cumeeira corre pela maior dimensão: comprimento ≥ vão (gire a planta)" }) + campo("Pé-direito", "t2.peDireito", { un: "m" }) +
        campo("Inclinação das águas", "t2.incl", { un: "%", dica: "Mínimo 5 % para telha" }) + campo("Cota do piso (base dos pilares)", "t2.cotaPiso", { un: "m" }) +
        campo("Beiral esquerdo", "t2.beiral.esq", { un: "m" }) + campo("Beiral direito", "t2.beiral.dir", { un: "m" }) + campo("Beiral frente", "t2.beiral.frente", { un: "m" }) + campo("Beiral fundos", "t2.beiral.fundo", { un: "m" }) +
        campo("Sistema da cobertura", "t2.sistema", { tipo: "sel", opcoes: [["tesoura", "Tesouras (Howe) com terças"], ["cumeeira", "Cumeeira portante com caibros"]] }) +
        campo("Espaçamento das tesouras", "t2.sTes", { un: "m", dica: "Sistema tesoura: também define os pilares do perímetro (vão máximo = este valor)" }) + campo("Espaçamento dos caibros", "t2.sCaibro", { un: "m", dica: "Sistema cumeeira portante" }) +
        campo("Vão máximo da viga de cumeeira", "t2.vMaxCumeeira", { un: "m", dica: "Entre pilares de cumeeira (e entre pilares do perímetro)" }) + campo("Espaçamento máximo das terças", "t2.sTercaMax", { un: "m" }) +
        campo("Peso da telha com ripas", "t2.telhaPeso", { un: "kN/m²", dica: "Cerâmica ≈ 0,55; a telha da obra manda" }) + campo("Assento do caibro no frechal", "t2.assento", { tipo: "sel", opcoes: [["deslizante", "Deslizante (sem empuxo)"], ["fixo", "Fixo (liga tirante de aço)"]] }) +
        campo("Vergas de vidro", "t2.vergasVidro", { tipo: "sel", opcoes: [["false", "Não"], ["true", "Sim (NÃO modelado: pendência)"]] }) + "</div>" +
        '<p class="meg-nota">Opções A, B e C (passo 3): A = pilar de partida de 28 cm no sistema escolhido; B = pilar de 32 cm; C = o outro sistema. Vergas de vidro, caibros secundários e a torção por excentricidade do vento não são modelados (o resultado avisa).</p>';
      h += '<div class="meg-2col">' + sec({ titulo: "Casa de duas águas (T2)", corpoHtml: in2 }) + desenhoT2Html() + "</div>";
    }
    h += e.tip === "T2" ? "" : deckHtml();
    return h;
  }
  /** desenho ao vivo da T2: planta (beirais, eixos das tesouras ou caibros e cumeeira) e corte transversal com as duas águas */
  function desenhoT2Html() {
    var u = est().t2, a = Math.max(num(u.comp, 12), 1), b = Math.max(num(u.vao, 8), 1), i = num(u.incl, 30) / 100, H = num(u.peDireito, 3), be = u.beiral || {}, bE = num(be.esq, 0), bD = num(be.dir, 0), bF = num(be.frente, 0), bB = num(be.fundo, 0), sis = u.sistema === "cumeeira";
    var W = 360, s = Math.min((W - 40) / (a + bE + bD), 130 / (b + bF + bB)), x0 = 20, y0 = 14, f = function (x, y) { return [x0 + (x + bE) * s, y0 + (b + bB - y) * s]; };
    var A = f(-bE, b + bB), B = f(a + bD, -bF), P0 = f(0, 0), P1 = f(a, b), svg = '<svg viewBox="0 0 ' + W + ' 330" class="meg-svg" role="img" aria-label="Desenho da casa de duas águas: planta e corte transversal">';
    svg += '<text x="' + x0 + '" y="10" font-size="9" fill="currentColor">PLANTA — ' + (sis ? "cumeeira e caibros" : "tesouras") + '</text><rect x="' + A[0] + '" y="' + A[1] + '" width="' + (B[0] - A[0]) + '" height="' + (B[1] - A[1]) + '" fill="none" stroke="currentColor" stroke-dasharray="3 2"/><rect x="' + P0[0] + '" y="' + P1[1] + '" width="' + (P1[0] - P0[0]) + '" height="' + (P0[1] - P1[1]) + '" fill="none" stroke="currentColor" stroke-width="1.4"/>';
    var yc = f(0, b / 2)[1]; svg += '<line x1="' + A[0] + '" y1="' + yc + '" x2="' + B[0] + '" y2="' + yc + '" stroke="currentColor" stroke-width="2"/>';
    var passo = Math.max(0.5, sis ? num(u.sCaibro, 1) : num(u.sTes, 4)), n = Math.max(1, Math.ceil(a / passo - 1e-9)), k;
    for (k = 0; k <= n; k++) { var xx = f(a * k / n, 0)[0]; svg += '<line x1="' + xx + '" y1="' + P1[1] + '" x2="' + xx + '" y2="' + P0[1] + '" stroke="currentColor" stroke-width="' + (sis ? 0.6 : 1.2) + '"/>'; }
    var yb = y0 + (b + bB + bF) * s + 34, sc = Math.min((W - 40) / (b + bF + bB), 110 / Math.max(H + i * (b / 2) + 0.5, 1)), xc = function (y) { return x0 + (y + bF) * sc; }, zc = function (z) { return yb + 110 - z * sc; };
    var zR = H + i * b / 2, zE1 = H - i * bF, zE2 = H - i * bB;
    svg += '<text x="' + x0 + '" y="' + (yb - 8) + '" font-size="9" fill="currentColor">CORTE TRANSVERSAL — i = ' + num(u.incl, 30) + ' %</text><polyline fill="none" stroke="currentColor" stroke-width="1.6" points="' + xc(-bF) + "," + zc(zE1) + " " + xc(b / 2) + "," + zc(zR) + " " + xc(b + bB) + "," + zc(zE2) + '"/>';
    svg += '<line x1="' + xc(0) + '" y1="' + zc(0) + '" x2="' + xc(0) + '" y2="' + zc(H) + '" stroke="currentColor" stroke-width="3"/><line x1="' + xc(b) + '" y1="' + zc(0) + '" x2="' + xc(b) + '" y2="' + zc(H) + '" stroke="currentColor" stroke-width="3"/><line x1="' + (x0 - 6) + '" y1="' + zc(0) + '" x2="' + (W - 14) + '" y2="' + zc(0) + '" stroke="currentColor" stroke-width="0.6"/>';
    if (sis) svg += '<line x1="' + xc(b / 2) + '" y1="' + zc(0) + '" x2="' + xc(b / 2) + '" y2="' + zc(zR) + '" stroke="currentColor" stroke-width="3"/>'; else svg += '<line x1="' + xc(0) + '" y1="' + zc(H) + '" x2="' + xc(b) + '" y2="' + zc(H) + '" stroke="currentColor" stroke-width="1.2"/>';
    return '<div class="meg-desenho">' + svg + '</svg><p class="meg-nota">Desenho esquemático ao vivo (sem escala exata): cumeeira a ' + (Math.round(zR * 100) / 100) + ' m do piso.</p></div>';
  }
  /** E4 r8: desenho ao vivo do DECK no passo 2 — planta (contorno, vigas e pilaretes previstos, escada) e corte lateral com as alturas; as peças previstas vêm do mesmo gerador do cálculo (madtipologias, carregado sob demanda) */
  function mtCarregar() {
    if (global.MadTipologias) return true;
    if (!UIE._mtCarregando) { UIE._mtCarregando = true; var sc = global.document.createElement("script"); sc.src = "js/madtipologias.js"; sc.onload = function () { UIE._mtCarregando = false; try { render(); } catch (er) { /* tela fechada */ } }; sc.onerror = function () { UIE._mtCarregando = "erro"; }; global.document.head.appendChild(sc); }
    return false;
  }
  function desenhoDeckHtml() {
    var E = EN(), e = est(), t7 = null, F = null, pec, W0 = 380, mg = 14, i;
    function cx(h) { return '<div class="meg-desenho" data-meg="desenho-deck"><p class="meg-nota">' + h + "</p></div>"; }
    try { t7 = E.toProj(e, e.ativa).t7; } catch (er) { return cx("O desenho aparece quando os dados do deck estiverem completos."); }
    if (!t7 || !t7.decks || !t7.decks.length) return cx("Acrescente ao menos um deck para ver a planta e o corte.");
    if (!mtCarregar()) return cx(UIE._mtCarregando === "erro" ? "Não foi possível carregar o gerador de peças do deck." : "Carregando o desenho do deck…");
    try { var par = {}; Object.keys(t7).forEach(function (k) { par[k] = t7[k]; }); par.classe = "mlc:GL24h"; F = global.MadTipologias.T7.fonte(par); } catch (er2) { return cx("Não foi possível prever as peças: " + esc(er2.message)); }
    pec = (F && F.pecas) || [];
    var xs = [], ys = [], zs = [], vig = [], pil = [], esc2 = [];
    pec.forEach(function (p) { if (!p.p0 || !p.p1) return; [p.p0, p.p1].forEach(function (q) { xs.push(q[0]); ys.push(q[1]); zs.push(q[2]); }); if (/-V\d+$/.test(p.id)) vig.push(p); else if (/-P\d+$/.test(p.id)) pil.push(p); else if (/^ESC-L/.test(p.id)) esc2.push(p); });
    t7.decks.forEach(function (d) { (d.modo === "retangulo" ? [[d.x0, d.x1, d.y0, d.y1]] : d.rects || []).forEach(function (q) { xs.push(q[0], q[1]); ys.push(q[2], q[3]); }); });
    if (!xs.length) return cx("Sem peças para desenhar: confira o contorno do deck.");
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys), s = (W0 - 2 * mg) / Math.max(x1 - x0, 0.5), Hh = Math.max(80, (y1 - y0) * s + 2 * mg + 14);
    if (Hh > 330) { s = s * 330 / Hh; Hh = 330; }
    function X(x) { return (mg + (x - x0) * s).toFixed(1); } function Y(y) { return (Hh - mg - (y - y0) * s).toFixed(1); }
    var sv = '<svg viewBox="0 0 ' + W0 + " " + Hh.toFixed(0) + '" role="img" aria-label="Planta do deck">';
    t7.decks.forEach(function (d) {
      (d.modo === "retangulo" ? [[d.x0, d.x1, d.y0, d.y1]] : d.rects || []).forEach(function (q) { sv += '<rect x="' + X(q[0]) + '" y="' + Y(q[3]) + '" width="' + ((q[1] - q[0]) * s).toFixed(1) + '" height="' + ((q[3] - q[2]) * s).toFixed(1) + '" fill="var(--surface-2)" stroke="var(--linha-forte)" stroke-width="0.8"/>'; });
      (d.recortes || []).forEach(function (q) { sv += '<rect x="' + X(q[0]) + '" y="' + Y(q[3]) + '" width="' + ((q[1] - q[0]) * s).toFixed(1) + '" height="' + ((q[3] - q[2]) * s).toFixed(1) + '" fill="var(--surface)" stroke="var(--linha-forte)" stroke-dasharray="3 2" stroke-width="0.6"/>'; });
    });
    vig.forEach(function (p) { sv += '<line x1="' + X(p.p0[0]) + '" y1="' + Y(p.p0[1]) + '" x2="' + X(p.p1[0]) + '" y2="' + Y(p.p1[1]) + '" stroke="var(--aco)" stroke-width="2.2"/>'; });
    esc2.forEach(function (p) { sv += '<line x1="' + X(p.p0[0]) + '" y1="' + Y(p.p0[1]) + '" x2="' + X(p.p1[0]) + '" y2="' + Y(p.p1[1]) + '" stroke="#b45309" stroke-width="2.2"/>'; });
    pil.forEach(function (p) { sv += '<circle cx="' + X(p.p0[0]) + '" cy="' + Y(p.p0[1]) + '" r="2.8" fill="var(--texto)"/>'; });
    sv += '<text class="t" x="' + mg + '" y="11">Planta: contorno, vigas (azul), pilaretes (' + pil.length + ') e escada (laranja) previstos</text></svg>';
    /* corte lateral ao longo de Y: pisos nas cotas, pilaretes, terreno, escada e topo do guarda-corpo */
    var zmin = Math.min.apply(null, zs), zmax = Math.max.apply(null, zs) + 1.3, xm = (x0 + x1) / 2, W1 = 380, H1 = 170, zb = Math.min(zmin - 0.2, zmax - 1), sy = Math.min((W1 - 2 * mg) / Math.max(y1 - y0, 0.5), (H1 - 2 * mg - 14) / Math.max(zmax - zb, 0.5));
    function Yc(y) { return (mg + (y - y0) * sy).toFixed(1); } function Zc(z) { return (H1 - mg - (z - zb) * sy).toFixed(1); }
    var c = '<svg viewBox="0 0 ' + W1 + " " + H1 + '" role="img" aria-label="Corte lateral do deck">', gcH = num(e.deck && e.deck.guardaCorpo && e.deck.guardaCorpo.h, 1.1), t0 = t7.decks[0].terreno, pts = [];
    if (typeof t0 === "function") { for (i = 0; i <= 24; i++) { var yy = y0 + (y1 - y0) * i / 24, zt = t0(xm, yy); if (isFinite(zt)) pts.push(Yc(yy) + "," + Zc(zt)); } if (pts.length > 1) c += '<polyline points="' + pts.join(" ") + '" fill="none" stroke="var(--texto-fraco)" stroke-width="1.2" stroke-dasharray="4 2"/>'; }
    pil.forEach(function (p) { c += '<line x1="' + Yc(p.p0[1]) + '" y1="' + Zc(p.p0[2]) + '" x2="' + Yc(p.p0[1]) + '" y2="' + Zc(p.p1[2]) + '" stroke="var(--texto)" stroke-width="2"/>'; });
    t7.decks.forEach(function (d) {
      var rs = d.modo === "retangulo" ? [[d.x0, d.x1, d.y0, d.y1]] : d.rects || [], a = Math.min.apply(null, rs.map(function (q) { return q[2]; })), b = Math.max.apply(null, rs.map(function (q) { return q[3]; }));
      c += '<line x1="' + Yc(a) + '" y1="' + Zc(d.cota) + '" x2="' + Yc(b) + '" y2="' + Zc(d.cota) + '" stroke="var(--aco)" stroke-width="3.2"/><line x1="' + Yc(a) + '" y1="' + Zc(d.cota + gcH) + '" x2="' + Yc(b) + '" y2="' + Zc(d.cota + gcH) + '" stroke="var(--texto-fraco)" stroke-width="0.8" stroke-dasharray="2 2"/><text class="t" x="' + (+Yc(a) + 2) + '" y="' + (+Zc(d.cota) - 4) + '">' + esc(d.nome || d.id) + " · piso a " + fmt(d.cota, 2) + " m</text>";
    });
    var ee = t7.escada && t7.escada.vao; if (ee && Math.abs(ee.y1 - ee.y0) > 0.1) c += '<line x1="' + Yc(ee.y0) + '" y1="' + Zc(ee.z0) + '" x2="' + Yc(ee.y1) + '" y2="' + Zc(ee.z1) + '" stroke="#b45309" stroke-width="2.4"/>';
    var hMax = pil.reduce(function (m, p) { return Math.max(m, Math.abs(p.p1[2] - p.p0[2])); }, 0);
    c += '<text class="t" x="' + mg + '" y="11">Corte lateral (ao longo de Y): pisos, pilaretes' + (hMax ? " (até " + fmt(hMax, 2) + " m)" : "") + ", terreno tracejado, escada e topo do guarda-corpo</text></svg>";
    return '<div class="meg-desenho" data-meg="desenho-deck">' + sv + c + '<p class="meg-nota">Desenho esquemático ao vivo, das peças que o cálculo vai verificar: a posição final dos pilaretes e as seções saem do cálculo (passo 4).</p></div>';
  }
  function deckHtml() {
    var e = est(), t7 = e.t7, h = "";
    var corpo = campo("Incluir deck elevado", "t7.ativo", { tipo: "chk" });
    if (t7.ativo) {
      corpo += '<div class="meg-grade">' + campo("Cota do terreno (constante)", "t7.terrenoConst", { un: "m" }) + "</div>" +
        '<div class="meg-grade">' + campo("Pontos do terreno (opcional): x y cota, um por linha", "t7.terrenoPts", { tipo: "area", ph: "118.2 99.5 5.40\n121.0 99.5 5.55" }) + "</div>" +
        '<p class="meg-nota">Com pontos, a cota do terreno em cada pilarete é a do ponto mais próximo; sem pontos vale a cota constante.</p>';
      arr(t7.decks).forEach(function (d, i) { corpo += deckForm(d, i); });
      corpo += '<div class="meg-linha">' + bt("add-deck-m", "Acrescentar deck sobre o terreno (pilaretes)", { sm: 1 }) + bt("add-deck-r", "Acrescentar deck retangular (pilares roliços)", { sm: 1 }) + "</div>";
      var es = t7.escada;
      if (t7.escadaMat == null || t7.escadaMat === "") t7.escadaMat = es ? (String(es.xs || "").trim() ? "madeira" : "outro") : "nenhuma";          /* estado antigo: deduz uma vez; daí em diante vale a escolha */
      var mat = t7.escadaMat;
      corpo += '<h3 class="meg-sub">Escada</h3><div class="meg-grade">' + campo("Escada", "t7.escadaMat", { tipo: "sel", opcoes: [["madeira", "De madeira (longarinas de MLC calculadas)"], ["outro", "De outro material (concreto, alvenaria): só os degraus de cumaru"], ["nenhuma", "Não há escada"]], dica: "Escolha explícita: o cálculo não deduz mais pelas longarinas vazias." }) + "</div>";
      if (mat !== "nenhuma" && es) corpo += '<div class="meg-grade">' + (mat === "madeira" ? campo("X das longarinas (separe por espaço)", "t7.escada.xs", { tipo: "txt" }) : "") + campo("Y inicial", "t7.escada.y0", { un: "m" }) + campo("Y final", "t7.escada.y1", { un: "m" }) + campo("Cota inicial", "t7.escada.z0", { un: "m" }) + campo("Cota final", "t7.escada.z1", { un: "m" }) +
        (mat === "madeira" ? campo("Longarina b", "t7.escada.b", { un: "m" }) + campo("Longarina h", "t7.escada.h", { un: "m" }) : "") + campo("Degraus", "t7.escada.degraus", {}) + "</div>";
      corpo += '<h3 class="meg-sub">Guarda-corpo</h3><div class="meg-grade">' + campo("Um trecho por linha: onde ; comprimento (m)", "t7.guardaCorpo", { tipo: "area", ph: "deck superior frente; 8,0" }) + "</div>" +
        '<h3 class="meg-sub">Cálculo do deck (NBR 7190-1:2022, 6120:2019, 14718:2019)</h3><div class="meg-grade">' +
        campo("Região do país (NBR 10821-2) para o guarda-corpo", "deck.guardaCorpo.regiao", { tipo: "sel", opcoes: [["", "Não informada (adota V, a mais severa)"], ["I", "I"], ["II", "II"], ["III", "III"], ["IV", "IV"], ["V", "V"]], dica: "Define a carga do guarda-corpo (NBR 14718, Tab. 1). Sem a região, o cálculo usa a V e avisa." }) +
        campo("Altura do guarda-corpo", "deck.guardaCorpo.h", { un: "m", dica: "Mínimo 1,10 m (NBR 14718, 4.4.1.1)" }) +
        campo("Estabilidade lateral dos pilaretes", "deck.estab", { tipo: "sel", opcoes: [["", "Como está desenhado (mão-francesa no deck superior, base engastada no inferior)"], ["mf", "Mãos-francesas"], ["base", "Base engastada (topo livre)"], ["amarracao", "Amarração à edificação"]], dica: "Sem nenhuma das três o auditor bloqueia o deck." }) +
        campo("Sobrecarga de uso", "deck.cargas.sobrecarga", { un: "kN/m²", dica: "NBR 6120:2019, Tab. 10: balcões, sacadas e varandas residenciais = 2,5 kN/m²" }) +
        campo("Pressão do vento informada à mão (opcional)", "deck.lateral.vento", { un: "kN/m²", dica: "O motor calcula q pela NBR 6123 (V0 do local do passo 1, categoria, S3 da obra, S2 na cota do topo do guarda-corpo, Ca = 1,0). Este campo só vale se a obra não tiver localização." }) +
        campo("Topo dos pilares travado", "deck.lateral.topoTravado", { tipo: "chk" }) + "</div>" +
        '<p class="meg-nota">O cálculo do deck (tábuas, barrotes, vigas, pilaretes, estabilidade, guarda-corpo com chapa de apoio, escada, ligações e amarração) roda no passo 4. Escada de outro material (concreto): deixe a escada sem longarinas; só os degraus entram no orçamento. <b>Adotado, a confirmar pelo RT:</b> carga concentrada de 1,0 kN na tábua (por analogia, a Tab. 10 não traz), região V quando não informada, classe D40 do roliço e D60 do cumaru sem laudo, fu = 500 MPa do parafuso, pressão do vento informada.</p>';
    }
    var secDeck = sec({ titulo: "Deck elevado, escada e guarda-corpo (T7)", corpoHtml: corpo });
    return e.tip === "T7" && t7.ativo ? '<div class="meg-2col">' + secDeck + desenhoDeckHtml() + "</div>" : secDeck;
  }
  function deckForm(d, i) {
    var p = "t7.decks." + i + ".", h = '<div class="meg-deck" data-meg-deck="' + i + '"><div class="meg-linha"><b>' + esc(d.nome) + "</b>" + bt("rem-deck", "Tirar este deck", { sm: 1, v: i }) + "</div>";
    h += '<div class="meg-grade">' + campo("Nome", p + "nome", { tipo: "txt" }) + campo("Cota da face de cima das tábuas", p + "cota", { un: "m" }) + campo("Espessura da tábua", p + "tabua", { un: "m" });
    if (d.modo === "retangulo") {
      h += campo("X inicial", p + "x0", { un: "m" }) + campo("X final", p + "x1", { un: "m" }) + campo("Y inicial", p + "y0", { un: "m" }) + campo("Y final", p + "y1", { un: "m" }) + campo("Y das vigas (espaço)", p + "vigasYs", { tipo: "txt" }) +
        campo("Viga b", p + "vigaB", { un: "m" }) + campo("Viga h", p + "vigaH", { un: "m" }) + campo("Barrote b", p + "barrote.b", { un: "m" }) + campo("Barrote h", p + "barrote.h", { un: "m" }) + campo("Passo dos barrotes", p + "barrote.passo", { un: "m" }) +
        campo("Diâmetro do pilar roliço", p + "pilarD", { un: "m" }) + campo("Contraventamento do pilar alto (> 3 m)", p + "contrav", { tipo: "sel", opcoes: [["auto", "automático (X de madeira se o pilar passar de 3 m)"], ["madeira", "X de diagonais de MLC (padrão)"], ["tirante", "X de tirantes inox com esticador"], ["nenhum", "nenhum (o auditor bloqueia pilar alto)"]], dica: "Pilar acima de 3 m sem contraventamento em X entre pilares nas duas direções trabalha em balanço de 2·h: o auditor bloqueia a emissão. Mão-francesa só vale para pilaretes baixos." }) + campo("Cota da base do pilar", p + "zBase", { un: "m" }) + "</div>" +
        '<div class="meg-grade">' + campo("Pilares: x y, um por linha", p + "pilares", { tipo: "area", ph: "117.2 92.3" }) + "</div>";
    } else {
      h += campo("Barrote b", p + "barrote.b", { un: "m" }) + campo("Barrote h", p + "barrote.h", { un: "m" }) + campo("Passo dos barrotes", p + "barrote.passo", { un: "m" }) + campo("Viga b", p + "viga.b", { un: "m" }) + campo("Viga h", p + "viga.h", { un: "m" }) + campo("Espaçamento das vigas", p + "viga.espacamento", { un: "m" }) + "</div>" +
        '<div class="meg-grade">' + campo("Contorno (polígono com lados a 0° e 90°): x y, um por linha", p + "contorno", { tipo: "area", ph: "0 0\n8 0\n8 5\n0 5" }) +
        campo("ou retângulos: x0 x1 y0 y1, um por linha", p + "rects", { tipo: "area" }) + campo("Recortes (a casa, por exemplo): x0 x1 y0 y1", p + "recortes", { tipo: "area" }) + campo("Linhas extras de viga (X, espaço)", p + "linhasExtras", { tipo: "txt" }) + campo("Não usar mureta (R35): manter as vigas mesmo a menos de 15 cm do terreno", p + "semMureta", { tipo: "chk", dica: "Por padrão, com o terreno informado, a viga cuja face inferior fica a menos de 15 cm do terreno vira apoio direto em mureta da fundação (outra empresa) e o cálculo avisa quais trechos. Marque para manter a viga." }) + "</div>";
    }
    return h + "</div>";
  }

  /* ================================================================ PASSO 3 — MATERIAIS E LIGAÇÕES */
  function classesMLC() {
    var M0 = global.MadMateriais, out = [];
    if (M0 && M0.CLASSES_2022) Object.keys(M0.CLASSES_2022).forEach(function (k) { var c = M0.CLASSES_2022[k]; if (/^mlc:/.test(k) && !c.incompleta) out.push([k, c.nome + (c.conferir ? " — valores a conferir no PDF" : "")]); });
    if (!out.length) out.push(["mlc:GL24h", "MLC GL24h (EN 14080)"]);
    return out;
  }
  function passo3() {
    var e = est(), o = opc(), h = abasOpcoes();
    if (UIE.comparar) return h + comparar();
    h += sec({ titulo: "Opção " + o.id, sub: "Cada opção é uma cópia dos parâmetros com pilar e base diferentes. Calcule as três para comparar.", acoesHtml: bt("dup-opcao", "Copiar a opção ativa para as outras", { sm: 1 }),
      corpoHtml: '<div class="meg-grade">' + campo("Nome da opção", "opc.nome", { tipo: "txt" }) + campo("Classe do MLC (casa)", "opc.classe", { tipo: "sel", opcoes: classesMLC(), dica: "O motor calcula a casa com uma classe só. Serrada, roliça e CLT entram na próxima entrega" }) + "</div>" });
    h += sec({ titulo: "Pilar da casa", corpoHtml: '<div class="meg-grade">' + campo("Seção do pilar", "opc.pilar.forma", { tipo: "sel", opcoes: [["quadrado", "Quadrado"], ["retangular", "Retangular"], ["duplo", "Duplo (a viga V passa entre as peças)"], ["circular", "Circular (torneado)"]] }) +
      (o.pilar.forma === "circular" ? campo("Diâmetro inicial", "opc.pilar.d", { un: "m" }) : campo("Largura inicial b", "opc.pilar.b", { un: "m" }) + (o.pilar.forma === "quadrado" ? "" : campo("Altura inicial h", "opc.pilar.h", { un: "m" }))) + "</div>" +
      '<p class="meg-nota">O laço de dimensionamento cresce a seção no passo do fabricante (' + fmt(est().passo.largura * 100, 0) + " cm na largura, " + fmt(est().passo.altura * 100, 0) + " cm na altura) até passar, dentro dos limites abaixo.</p>" });
    h += sec({ titulo: "Seções iniciais e limites de altura", corpoHtml: '<div class="meg-grade">' + campo("Terça b", "opc.T.b", { un: "m" }) + campo("Terça h", "opc.T.h", { un: "m" }) + campo("Viga V largura b", "opc.V.b", { un: "m" }) + campo("Verga b", "opc.VG.b", { un: "m" }) + campo("Verga h", "opc.VG.h", { un: "m" }) +
      campo("Limite: terça h máx.", "opc.limites.T.hMax", { un: "m" }) + campo("Limite: terça b máx.", "opc.limites.T.bMax", { un: "m" }) + campo("Limite: viga V b máx.", "opc.limites.V.bMax", { un: "m" }) + campo("Limite: verga h máx.", "opc.limites.VG.hMax", { un: "m" }) + "</div>" });
    h += sec({ titulo: "Base e ligações", corpoHtml: '<div class="meg-grade">' +
      campo("Pilaretes e base do deck", "opc.base", { tipo: "sel", opcoes: [["oculta", "Chapa em cruz oculta"], ["garfo", "Garfo aparente"]] }) +
      campo("Viga b do deck de máscara (vazio = a do deck)", "opc.deckVigaB", { un: "m" }) + campo("Forma do pilarete do deck", "opc.deckPilarete.forma", { tipo: "sel", opcoes: [["ret", "Quadrado"], ["circ", "Circular"]] }) +
      (o.deckPilarete.forma === "circ" ? campo("Diâmetro do pilarete", "opc.deckPilarete.d", { un: "m" }) : campo("Lado do pilarete", "opc.deckPilarete.b", { un: "m" })) +
      campo("Rigidez da base (opcional)", "opc.krBaseManual", { un: "kN·m/rad", dica: "Deixe em branco: o cálculo obtém a rigidez da base pela ligação dimensionada (pinos, Kser da NBR 7190-1:2022, 7.1.12) e itera com a análise. Preencha só para impor um valor." }) + "</div>" +
      '<p class="meg-nota">A ligação da base e do topo da casa segue a forma do pilar: chapa em cruz para quadrado, retangular e circular; garfo para o duplo. O cálculo verifica pinos (Johansen, n_ef), chapa de aço, placa de base e chumbadores, e o reforço da viga V à tração normal.</p>' });
    h += sec({ titulo: "Cobertura", corpoHtml: '<div class="meg-grade">' +
      campo("Telha", "t1.telhaPeso", { tipo: "sel", opcoes: [["0.12", "Termoacústica PIR 30 mm (0,12 kN/m²)"], ["0.05", "Metálica simples (0,05 kN/m²)"], ["0.20", "Fibrocimento (0,20 kN/m²)"], ["0.50", "Cerâmica (0,50 kN/m²)"]] }) +
      campo("Peso do lambri", "t1.lambriPeso", { un: "kN/m³", dica: "Forro de pinus ou cumaru sobre as terças" }) + campo("Espessura do lambri", "t1.lambri", { un: "m" }) + campo("Espaçamento máximo das terças", "t1.sTerca", { un: "m" }) + "</div>" });
    h += sec({ titulo: "Itens do orçamento que a geometria não dá", sub: "Entram com a quantidade que você informar; zero tira o item.", corpoHtml: '<div class="meg-grade">' +
      campo("Porta maciça 1,38×2,47", "extras.porta138", { un: "un" }) + campo("Porta maciça 1,08×2,26", "extras.porta108", { un: "un" }) + campo("Portão de 2 folhas", "extras.portao", { un: "un" }) + campo("Ripado de fachada", "extras.ripado", { un: "m²" }) +
      campo("Prazo da carpintaria", "extras.prazoSemanas", { un: "semanas" }) + campo("Diárias do caminhão guindauto", "extras.diariasMunck", {}) + campo("BDI", "bdi", { dica: "0,2624 = 26,24 % (padrão RA)" }) + "</div>" });
    return h;
  }

  /* ================================================================ PASSO 4 — CALCULAR */
  function etaCelula(v) {
    if (v == null) return '<div class="meg-eta">sem solução</div>';
    var cl = v > 1 ? "er" : (v > 0.9 ? "al" : "");
    return '<div class="meg-eta"><span>' + fmt(v, 2) + '</span><i><b class="' + cl + '" style="width:' + Math.min(100, v * 100).toFixed(0) + '%"></b></i></div>';
  }
  function progressoHtml() {
    var c = UIE.calc; if (!c) return "";
    var ordem = WK().ETAPAS, agora = ordem.indexOf(c.etapa), el = Math.round((Date.now() - c.t0) / 1000);
    var pc = Math.min(97, Math.round(((agora < 0 ? 0 : agora) + (c.etapa === "dimensionar" ? Math.min(0.9, (c.it || 0) / 6) : 0)) / ordem.length * 100));
    return '<div class="meg-prog" data-meg="progresso"><h2>Calculando a opção ' + esc(c.opcao) + "</h2><p class=\"meg-fraco\">" + (c.seq && c.seq.length ? "Depois: " + esc(c.seq.join(", ")) + ". " : "") + el + ' s</p><div class="meg-barra"><i style="width:' + pc + '%"></i></div><ul class="meg-etapas">' +
      ordem.map(function (k, i) { return '<li class="' + (i < agora ? "feito" : (i === agora ? "agora" : "")) + '">' + esc(WK().NOME_ETAPA[k]) + (k === "dimensionar" && i === agora && c.it ? " — rodada " + c.it + (c.pior ? ", pior η " + fmt(Math.max.apply(null, Object.keys(c.pior).map(function (g) { return c.pior[g] || 0; })), 2) : "") : "") + "</li>"; }).join("") +
      "</ul>" + bt("cancelar", "Cancelar", { sm: 1 }) + "</div>";
  }
  function passo4() {
    var e = est(), h = abasOpcoes();
    if (UIE.comparar) return h + comparar();
    if (UIE.calc && UIE.calc.rodando) return h + progressoHtml();
    var r = resumoAtivo();
    if (!r) {
      var v = EN().validar(e);
      return h + (M() ? M().vazio({ icone: "raio", titulo: "Opção " + e.ativa + " ainda sem cálculo", texto: v.ok ? "Calcule: o motor monta o modelo, dimensiona as seções no catálogo e confere as ligações." : "Falta: " + v.falta[0].texto,
        acaoHtml: v.ok ? bt("calcular", "Calcular a opção " + e.ativa, { pri: 1 }) + " " + bt("calcular-todas", "Calcular A, B e C", { sm: 1 }) : bt("passo", "Ir ao passo " + v.falta[0].passo, { pri: 1, v: v.falta[0].passo }) }) : "");
    }
    h += situacaoHtml(r);
    if (r.soDeck) h += sec({ titulo: "Deck elevado", corpoHtml: "<p>Deck calculado pela NBR 7190-1:2022, NBR 6120:2019 e NBR 14718:2019: tábuas, barrotes, vigas, pilaretes, estabilidade lateral, guarda-corpo (com a fixação do montante) e escada. " + (r.deck ? "η máximo " + fmt(r.deck.etaMax, 2) + "; classe de umidade " + r.deck.umidade + ". O memorial do T7 traz cada conta." : "Sem resultado do cálculo do deck neste cálculo.") + "</p>" });
    else {
      h += sec({ titulo: "Aproveitamento por grupo de peças", sub: "η = esforço de cálculo ÷ resistência. Até 1,00 passa; acima de 0,90 já pede atenção.", corpoHtml: '<div class="meg-rola"><table class="tbl meg-t" data-meg="grupos"><thead><tr><th>Grupo</th><th class="num">Aproveitamento</th><th>Onde governa</th><th>Combinação</th></tr></thead><tbody>' +
        Object.keys(r.pior || {}).map(function (k) { var g = (r.grupos || {})[k] || {}; return "<tr data-meg-grupo=\"" + k + "\"><td>" + esc(GRUPO_NOME[k] || k) + '</td><td class="num">' + etaCelula(r.pior[k]) + "</td><td>" + esc((g.governa || "") + (g.onde ? " em " + g.onde : "")) + "</td><td>" + esc(g.comb || "") + "</td></tr>"; }).join("") + "</tbody></table></div>" +
        '<p class="meg-nota">O aproveitamento do grupo é o maior entre a resistência e a flecha. Seções finais: ' + secoesTxt(r.secoes) + ". " + r.iteracoes + " rodada(s) de dimensionamento.</p>" });
      h += sec({ titulo: "Flechas e deslocamentos", sub: "Valor ÷ limite: até 1,00 passa.", corpoHtml: '<div class="meg-rola"><table class="tbl meg-t"><thead><tr><th>Verificação</th><th class="num">Razão ao limite</th></tr></thead><tbody>' +
        Object.keys(r.flechas || {}).map(function (k) { return "<tr><td>" + esc(FLECHA_NOME[k] || k) + '</td><td class="num">' + etaCelula(r.flechas[k]) + "</td></tr>"; }).join("") + "</tbody></table></div>" });
      h += sec({ titulo: "Reações para a fundação", sub: "Valores de cálculo na base de cada pilar (N em kN; positivo = compressão).", acoesHtml: bt("passo", "Ver nas saídas", { sm: 1, v: 5 }), corpoHtml: reacoesTabela(r) });
    }
    h += achadosHtml(r);
    return h;
  }
  function secoesTxt(s) {
    if (!s) return "—";
    if (!(s.T && s.V && s.VG && s.P)) {          /* E4 r4: T2 (sem V nem verga): lista cada grupo com a sua seção; antes só havia o texto da T1 e a tela do passo 4 da T2 quebrava ("reading 'b'") */
      var ordemT2 = ["P", "PO", "PC", "FR", "BS", "BI", "PD", "DG", "T", "CM", "CB", "TI"];
      return ordemT2.filter(function (g) { return s[g]; }).map(function (g) { var q = s[g]; return g + " " + (q.d != null && q.b == null ? "Ø" + fmt(q.d * 1000, 0) + " mm" : fmt(q.b * 100, 0) + "×" + fmt(q.h * 100, 0) + " cm"); }).join(" · ");
    }
    return "terça " + fmt(s.T.b * 100, 0) + "×" + fmt(s.T.h * 100, 0) + " cm · viga V largura " + fmt(s.V.b * 100, 0) + " cm · verga " + fmt(s.VG.b * 100, 0) + "×" + fmt(s.VG.h * 100, 0) + " cm · pilar " +
      (s.P.forma === "circular" ? "Ø" + fmt(s.P.d * 100, 0) : fmt(s.P.b * 100, 0) + "×" + fmt(s.P.h * 100, 0)) + " cm (" + s.P.forma + ")";
  }
  function reacoesTabela(r) {
    var rf = SA().reacoesFundacao(r.reacoes);
    if (!rf.linhas.length) return '<p class="meg-nota">Sem reações (somente deck).</p>';
    return '<div class="meg-rola"><table class="tbl meg-t" data-meg="reacoes"><thead><tr><th>Pilar</th><th class="num">N máx</th><th class="num">N mín</th><th class="num">H máx</th><th class="num">M máx (kN·m)</th></tr></thead><tbody>' +
      rf.linhas.map(function (l) { return "<tr><td>" + esc(l.no) + '</td><td class="num">' + fmt(l.Nmax, 1) + '</td><td class="num">' + fmt(l.Nmin, 1) + '</td><td class="num">' + fmt(l.Hmax, 1) + '</td><td class="num">' + fmt(l.Mmax, 1) + "</td></tr>"; }).join("") + "</tbody></table></div>";
  }
  var CORRIGE_TXT = { esbeltez: "Aumentar a seção da peça", "peca-abaixo-do-terreno": "Conferir o terreno do deck", "peca-sem-apoio": "Revisar o apoio no deck", "balanco-barrote": "Revisar o contorno ou as vigas do deck", "pilarete-sem-travamento": "Revisar a base do deck",
    "topo-vidro-sem-peca": "Ver as ligações e a verga", "pendural-sem-apoio": "Ver as ligações e a verga", "reforco-ft90-ausente": "Ver as ligações", "ligacao-sem-aco": "Ver as ligações", mecanismo: "Revisar o travamento" };
  function achadosHtml(r) {
    var a = arr(r.achados);
    if (!a.length) return sec({ titulo: "Pente-fino do projeto", corpoHtml: '<p data-meg="sem-achados">Nenhum achado: todas as peças têm apoio, esbeltez dentro do limite, verga, pendural e reforço de tração normal.</p>' });
    return sec({ titulo: "Pente-fino do projeto: " + a.length + " achado(s)", sub: "Cada um diz o que é, como corrigir e onde está no 3D.", corpoHtml: a.map(function (x, i) {
      return '<div class="meg-achado" data-meg-achado="' + i + '" data-regra="' + esc(x.regra) + '"><div>' + pil(x.gravidade === "alta" ? "Alta" : "Média", x.gravidade === "alta" ? "erro" : "alerta") + " <b>" + esc(x.regra) + " — " + esc(x.peca) + "</b></div>" +
        "<p><b>O que é:</b> " + esc(x.mensagem) + "</p><p><b>Como corrigir:</b> " + esc(x.correcao) + '</p><div class="meg-linha">' + bt("corrigir", CORRIGE_TXT[x.regra] || "Corrigir", { sm: 1, v: i, pri: 1 }) + bt("mostrar3d", "Mostrar no 3D", { sm: 1, v: i, dis: !UIE.res[r.opcao] }) + "</div></div>";
    }).join("") });
  }

  /* ================================================================ COMPARAÇÃO A/B/C */
  function comparar() {
    var e = est(), L = e.opcoes.map(function (o) { var r = UIE.res[o.id] ? compactar(UIE.res[o.id]) : UIE.resumos[o.id]; return { o: o, r: r }; });
    if (!L.some(function (x) { return x.r; })) return M().vazio({ icone: "grafico", titulo: "Nada para comparar", texto: "Calcule ao menos uma opção.", acaoHtml: bt("calcular-todas", "Calcular A, B e C", { pri: 1 }) });
    var menor = null; L.forEach(function (x) { if (x.r && x.r.cmp && x.r.cmp.preco && (menor == null || x.r.cmp.preco < menor)) menor = x.r.cmp.preco; });
    return sec({ titulo: "Comparação das opções", sub: "Mesmos dados da obra; muda o pilar e a base. O menor preço aparece em destaque.", acoesHtml: bt("calcular-todas", "Calcular as que faltam", { sm: 1 }), corpoHtml: '<div class="meg-rola"><table class="tbl meg-t" data-meg="comparativo"><thead><tr><th>Item</th>' +
      L.map(function (x) { return "<th>Opção " + x.o.id + "<br><small>" + esc(x.o.nome) + "</small></th>"; }).join("") + "</tr></thead><tbody>" + [
        ["Situação", function (c, r) { return sitRotulo(r); }],
        ["η máximo", function (c) { return fmt(c.etaMax, 2); }], ["Madeira (m³)", function (c) { return fmt(c.volume, 2); }], ["Peças", function (c) { return fmt(c.pecas, 0); }],
        ["Aço das ligações (kg)", function (c) { return fmt(c.acoKg, 0); }], ["Pinos e parafusos Ø16 (un)", function (c) { return fmt(c.pinos, 0); }], ["Parafusos de rosca total (un)", function (c) { return fmt(c.parafusos, 0); }],
        ["Custo direto", function (c) { return brl(c.custo); }], ["Preço com BDI", function (c) { return (c.preco === menor ? "<b>" + brl(c.preco) + "</b>" : brl(c.preco)); }, true]
      ].map(function (ln) { return "<tr><td>" + ln[0] + "</td>" + L.map(function (x) { return '<td class="num">' + (x.r && x.r.cmp ? (ln[2] ? ln[1](x.r.cmp, x.r) : esc(ln[1](x.r.cmp, x.r))) : "—") + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>" });
  }

  /* ================================================================ PASSO 5 — SAÍDAS */
  function passo5() {
    var h = abasOpcoes(); if (UIE.comparar) return h + comparar();
    var r = resAtiva(), rs = resumoAtivo();
    if (!rs) return h + M().vazio({ icone: "relatorio", titulo: "As saídas saem do cálculo", texto: "Calcule a opção primeiro: lista de peças, cotação, IFC, modelo no BIM, reações e orçamento saem do resultado.", acaoHtml: bt("passo", "Ir ao passo 4", { pri: 1, v: 4 }) });
    if (!r) h += M().aviso({ tom: "info", titulo: "Resumo salvo", texto: "Este é o resumo do último cálculo. Para baixar arquivos e lançar o orçamento, calcule de novo (leva cerca de um minuto)." });
    var ok = !!r, s = UIE.saidas;
    h += faixaHtml() + situacaoHtml(rs);
    function card(acao, titulo, txt, rot, feito) { return '<div class="meg-doc" data-meg-doc="' + acao + '"><b>' + esc(titulo) + "</b><p>" + esc(txt) + "</p>" + (feito ? "<p data-meg-feito=\"" + acao + '">' + pil(feito, "ok") + "</p>" : "") + bt(acao, rot, { dis: !ok, pri: acao === "xlsx", ico: acao === "xlsx" ? "planilha" : (acao === "orc-lancar" ? "camadas" : "exportar") }) + "</div>"; }
    h += sec({ titulo: "Saídas da opção " + est().ativa, corpoHtml: '<div class="meg-docs">' +
      card("xlsx", "Cotação de madeira (.xlsx)", "Lista de peças, resumo por material e seção, cobertura e deck, ferragens e ligações: o pacote para pedir preço ao fornecedor.", "Baixar planilha", s.xlsx ? "baixada" : "") +
      card("ifc", "Modelo em IFC4", "Cada peça com corpo vira uma extrusão exata, com id, grupo, material, especificação, comprimento e volume.", "Baixar IFC", s.ifc ? "baixado" : "") +
      card("bim-enviar", "Modelo no BIM do sistema", "Leva as peças ao modelador como volumes. Reenviar substitui as mesmas peças, sem duplicar.", "Enviar ao BIM", s.bim ? "enviado" : "") +
      card("reacoes-copiar", "Reações para a fundação", "Tabela e texto pronto para colar no projeto da fundação.", "Copiar o texto", s.reacoes ? "copiado" : "") +
      card("pranchas-pdf", "Pranchas (PDF)", "Projeto executivo no Padrão RA de detalhamento (madeira engenharada): locação e reações, decks, cobertura, viga V de altura variável, ligações com a1-a4, contraventamento e tabelas.", "Baixar pranchas (PDF)", s.pranchas ? "baixadas" : "") +
      card("memorial-pdf", "Memorial de cálculo (PDF)", "Cargas, vento (oblíquo, beiral, abertura dominante), combinações, análise, verificações, flechas, ligações e reações, passo a passo.", "Abrir memorial (PDF)", s.memorial ? "aberto" : "") +
      card("manual-pdf", "Manual de montagem (PDF)", "Uma etapa por página, mesma câmera, 3 a 5 frases por etapa: bases, pilares, vigas V, vergas, terças, travamentos, fita, cobertura, deck e guarda-corpo.", "Abrir manual (PDF)", s.manual ? "aberto" : "") +
      card("skp", "SketchUp (.dae)", "Modelo em COLLADA, com um grupo por família de peças: o SketchUp importa direto (Arquivo → Importar).", "Baixar para SketchUp", s.skp ? "baixado" : "") +
      card("cype", "CYPE 3D (.zip)", "Geometria por etiqueta (nós e barras, latin-1), séries/materiais e roteiro com as reações para conferência.", "Baixar pacote CYPE", s.cype ? "baixado" : "") +
      card("lista-xlsx", "Lista de peças", "A mesma lista de peças em planilha única, só madeira com seção, comprimento e volume.", "Baixar lista de peças", s.lista ? "baixada" : "") +
      "</div>" });
    if (ok || rs.orc) h += orcamentoSecao(r, rs);
    if (ok) h += sec({ titulo: "Reações para a fundação (texto)", corpoHtml: reacoesTabela(rs) + '<textarea class="meg-texto" readonly data-meg="reacoes-texto">' + esc(SA().reacoesFundacao(rs.reacoes, est().obra.nome, est().ativa).texto) + "</textarea>" });
    return h;
  }
  function orcamentoSecao(r, rs) {
    var O = r ? r.orcamento : null;
    if (!O) return sec({ titulo: "Orçamento", corpoHtml: '<p>Custo direto ' + brl(rs.orc.custo_direto) + ", preço com BDI " + brl(rs.orc.preco) + ". Calcule de novo para editar os preços.</p>" });
    var linhas = O.itens.filter(function (x) { return x.qtd > 0; }), etapa = null, tr = "";
    linhas.forEach(function (x) {
      if (x.etapa !== etapa) { etapa = x.etapa; tr += '<tr><td colspan="7"><b>' + esc(etapa) + "</b> — " + brl(O.etapas[etapa]) + "</td></tr>"; }
      tr += '<tr data-meg-item="' + x.chave + '"><td>' + esc(x.codigo) + "</td><td>" + esc(x.descricao) + "</td><td>" + esc(x.un) + '</td><td class="num">' + fmt(x.qtd, 3) + '</td><td><input type="text" inputmode="decimal" data-meg-preco="' + x.chave + '" value="' + esc(String(x.pu).replace(".", ",")) + '" aria-label="Preço unitário"></td>' +
        '<td class="num">' + brl(x.total) + "</td><td><input type=\"text\" data-meg-fonte=\"" + x.chave + '" value="' + esc(x.fonte) + '" aria-label="Fonte do preço">' + (x.adotado ? " " + pil("adoção", "alerta") : "") + "</td></tr>";
    });
    return sec({ titulo: "Orçamento da opção " + O.opcao, sub: "Preço editável, sempre com fonte. Sem fonte publicada o item entra como adoção marcada (regra RA: nada fica \"a cotar\"; na dúvida, o maior).",
      acoesHtml: bt("orc-lancar", "Lançar no módulo Orçamentos", { sm: 1, pri: 1, ico: "camadas" }), corpoHtml:
      '<div class="mod-kpis" data-n="3"><div class="mod-kpi"><span class="mod-kpi-r">Custo direto</span><b class="mod-kpi-v" id="meg-orc-cd">' + brl(O.custo_direto) + '</b></div><div class="mod-kpi"><span class="mod-kpi-r">BDI ' + fmt(O.bdi * 100, 2) + ' %</span><b class="mod-kpi-v">' + brl(O.preco - O.custo_direto) + '</b></div><div class="mod-kpi"><span class="mod-kpi-r">Preço</span><b class="mod-kpi-v" id="meg-orc-preco">' + brl(O.preco) + "</b></div></div>" +
      '<div class="meg-rola"><table class="tbl meg-t" data-meg="orcamento"><thead><tr><th>Item</th><th>Descrição</th><th>Un.</th><th class="num">Qtd.</th><th>Preço unit. (R$)</th><th class="num">Total</th><th>Fonte</th></tr></thead><tbody>' + tr + "</tbody></table></div>" });
  }

  /* ================================================================ RENDER */
  function raiz() { return doc ? doc.getElementById("meg-veu") : null; }
  function garantir() {
    estilo(); conferirObra();
    var v = raiz(); if (v) return v;
    v = doc.createElement("div"); v.id = "meg-veu"; v.className = "meg-veu";
    v.innerHTML = '<div class="meg-jan" role="dialog" aria-modal="true" aria-labelledby="meg-tit" tabindex="-1"></div>';
    doc.body.appendChild(v); ligar(v);
    setTimeout(function () { var j = v.querySelector(".meg-jan"); if (j && raiz() === v && !v.contains(doc.activeElement)) try { j.focus({ preventScroll: true }); } catch (e) {} }, 0);
    if (!garantir.escDoc) {
      garantir.escDoc = true;
      doc.addEventListener("keydown", function (ev) { var r = raiz(); if (!r || ev.key !== "Escape" || r.contains(ev.target) || doc.querySelector(".modal-bg, .mod-mais-menu:not([hidden])")) return; fechar(); });
    }
    return v;
  }
  function fechar() {
    var v = raiz(); if (!v) return;
    if (UIE.calc && UIE.calc.rodando && !global.confirm("O cálculo está rodando. Fechar e cancelar?")) return;
    if (UIE.calc && UIE.calc.rodando) cancelar(true);
    salvar(); v.remove();
  }
  function render() {
    var v = garantir(), jan = v.querySelector(".meg-jan"), top = jan.scrollTop, corpo = "";
    if (UIE.passo === 1) corpo = passo1(); else if (UIE.passo === 2) corpo = passo2(); else if (UIE.passo === 3) corpo = passo3(); else if (UIE.passo === 4) corpo = passo4(); else corpo = passo5();
    var nav = '<div class="meg-linha">' + (UIE.passo > 1 ? bt("passo", "Voltar", { sm: 1, v: UIE.passo - 1 }) : "") + (UIE.passo < 5 ? bt("passo", "Próximo passo", { sm: 1, pri: 1, v: UIE.passo + 1 }) : "") + "</div>";
    jan.innerHTML = '<button type="button" class="btn sm icone meg-fechar" data-meg-acao="fechar" aria-label="Fechar" title="Fechar (Esc): os dados ficam salvos na obra">' + (ico("fechar", 16) || "×") + "</button>" +
      '<div class="meg-in">' + cabecalho() + avisoTopo() + kpis() + abasPassos() + '<div data-meg="corpo" data-meg-passo="' + UIE.passo + '">' + corpo + "</div>" + nav + "</div>";
    jan.setAttribute("data-meg-passo", UIE.passo);
    if (UIE.manterRolagem) jan.scrollTop = top; UIE.manterRolagem = false;
    if (!v.contains(doc.activeElement)) { try { jan.focus({ preventScroll: true }); } catch (e) { try { jan.focus(); } catch (e2) {} } }
  }
  function ir(passo) { UIE.passo = passo; if (passo !== 3 && passo !== 4 && passo !== 5) UIE.comparar = false; UIE.manterRolagem = false; render(); var j = raiz() && raiz().querySelector(".meg-jan"); if (j) j.scrollTop = 0; }

  /* ================================================================ CÁLCULO */
  /* cp = caminho do campo editado: t1.* só invalida a T1 (e o deck que a acompanha), t2.* só a T2; o resto (obra, vento, preços) invalida todas as tipologias com resultado */
  function marcarDesatualizado(cp) {
    var alvo = cp && /^t([12])\./.test(cp) ? "T" + RegExp.$1 : null;
    guardarTip();
    Object.keys(UIE.porTip).forEach(function (k) { if (alvo && k !== alvo && !(alvo === "T1" && k === "T7")) return; var b = UIE.porTip[k]; Object.keys(b.res || {}).concat(Object.keys(b.resumos || {})).forEach(function (o) { b.desatualizado[o] = true; }); });
  }
  function calcular(opcaoId, seq) {
    if (!lic("calcular a estrutura")) return false;
    garantir(); if (!WK() || !EN()) { toast("Os motores da madeira engenharada não carregaram.", "erro"); return false; }
    if (UIE.calc && UIE.calc.rodando) return false;
    opcaoId = opcaoId || est().ativa;
    var val = EN().validar(est());
    if (!val.ok) { ir(val.falta[0].passo); toast(val.falta[0].texto, "aviso", 7000); return false; }
    salvar(); var sol;
    try { sol = WK().solicitacao(est(), opcaoId); } catch (e) { UIE.erro = e.message; render(); return false; }
    var id = "e" + Date.now(); UIE.erro = null; UIE.passo = 4; est().ativa = opcaoId; UIE.comparar = false;
    UIE.calc = { rodando: true, id: id, t0: Date.now(), etapa: "preparar", it: 0, opcao: opcaoId, seq: seq || [], modo: null };
    render();
    var relogio = setInterval(function () { if (!UIE.calc || UIE.calc.id !== id) { clearInterval(relogio); return; } var el = doc.querySelector("[data-meg='progresso']"); if (el) { var t = doc.createElement("div"); t.innerHTML = progressoHtml(); el.parentNode.replaceChild(t.firstChild, el); } }, 700);
    var wk = null;
    try { wk = new global.Worker("js/madengworker.js" + (versao() ? "?v=" + encodeURIComponent(versao()) : "")); } catch (eW) { wk = null; }
    if (!wk) { naPagina(sol, id, "o navegador não abriu o processo paralelo"); return true; }
    UIE.worker = wk; UIE.calc.modo = "worker";
    wk.onmessage = function (ev) {
      var m = ev.data || {}; if (!UIE.calc || m.id !== UIE.calc.id) return;
      if (m.tipo === "progresso") { UIE.calc.etapa = m.etapa; if (m.it != null) UIE.calc.it = m.it; if (m.pior) UIE.calc.pior = m.pior; }
      else if (m.tipo === "fim") { var r = null; try { r = JSON.parse(m.texto); } catch (eP) { falhou("resultado ilegível: " + eP.message); return; } terminar(r); }
      else if (m.tipo === "erro") { if (/Não carregou/.test(m.mensagem || "")) { try { wk.terminate(); } catch (e) {} UIE.worker = null; naPagina(sol, id, m.mensagem); } else falhou(m.mensagem); }
    };
    wk.onerror = function (ev) { if (!UIE.calc || UIE.calc.id !== id) return; if (ev && ev.preventDefault) ev.preventDefault(); try { wk.terminate(); } catch (e) {} UIE.worker = null; naPagina(sol, id, "o processo paralelo falhou"); };
    wk.postMessage({ tipo: "calcular", id: id, sol: sol });
    return true;
  }
  var motoresPagina = null;
  function carregarMotoresPagina() {
    if (motoresPagina) return motoresPagina;
    var lista = WK().MOTORES.filter(function (a) { return !global[WK().GLOBAL_DE[a]] || /^mad(dimensionar2|auditor|ligacoes|tipologias)/.test(a); });
    motoresPagina = new Promise(function (ok, erro) {
      var i = 0;
      (function prox() {
        if (i >= lista.length) { ok(true); return; }
        var arq = lista[i++], s = doc.createElement("script");
        s.src = "js/" + arq + (versao() ? "?v=" + encodeURIComponent(versao()) : ""); s.async = false; s.onload = prox; s.onerror = function () { motoresPagina = null; erro(new Error("não carregou js/" + arq)); };
        (doc.head || doc.documentElement).appendChild(s);
      })();
    });
    return motoresPagina;
  }
  function naPagina(sol, id, motivo) {
    if (!UIE.calc || UIE.calc.id !== id) return;
    UIE.calc.modo = "pagina"; UIE.calc.motivo = motivo; render();
    carregarMotoresPagina().then(function () {
      setTimeout(function () {
        try { var r = JSON.parse(JSON.stringify(WK().rodar(sol, null))); terminar(r); } catch (e) { falhou(e && e.message ? e.message : String(e)); }
      }, 60);
    }, function (e) { falhou(e.message); });
  }
  function terminar(r) {
    var c = UIE.calc, op = r.opcao; UIE.res[op] = r; UIE.resumos[op] = compactar(r); UIE.desatualizado[op] = false; UIE.saidas = {};
    var seq = (c && c.seq) || []; UIE.calc = null;
    if (UIE.worker) { try { UIE.worker.terminate(); } catch (e) {} UIE.worker = null; }
    salvar();
    if (seq.length) { var prox = seq[0]; render(); setTimeout(function () { calcular(prox, seq.slice(1)); }, 50); return; }
    if (raiz()) render();
    toast("Opção " + op + " calculada em " + Math.round((r.ms || 0) / 1000) + " s.", "ok", 5000);
  }
  function falhou(msg) { UIE.calc = null; UIE.erro = msg; if (UIE.worker) { try { UIE.worker.terminate(); } catch (e) {} UIE.worker = null; } if (raiz()) render(); toast("Cálculo: " + msg, "erro", 9000); }
  function cancelar(silencioso) { if (UIE.worker) { try { UIE.worker.terminate(); } catch (e) {} UIE.worker = null; } UIE.calc = null; if (!silencioso && raiz()) { render(); toast("Cálculo cancelado.", "aviso", 3000); } }

  /* ================================================================ SAÍDAS */
  function base() { return nomeSeguro((est().obra.nome || "obra") + "-" + est().ativa); }
  function comExcel(fn) {
    if (global.ExcelJS) { fn(global.ExcelJS); return; }
    if (global.ExcelOrc && ExcelOrc.ensureExcelJS) ExcelOrc.ensureExcelJS(function () { fn(global.ExcelJS); }); else toast("O gerador de Excel não carregou.", "erro");
  }
  function semResultado() { if (resAtiva()) return false; toast("Calcule primeiro: as saídas saem do resultado do cálculo desta sessão.", "aviso", 6000); return true; }
  function saidaXlsx(soLista) {
    if (!lic("baixar a planilha de cotação") || semResultado()) return Promise.resolve(false);
    var r = resAtiva(); return new Promise(function (ok) {
      comExcel(function (EJ) {
        var wb = SA().xlsxCotacao(EJ, { obra: est().obra.nome, opcao: r.opcao, nome: r.nomeOpcao, pecas: soLista ? r.fonte.pecas.filter(function (p) { return p.secao && p.p0 && !/^Ligações|contraventamento/.test(p.grupo); }) : r.fonte.pecas });
        wb.xlsx.writeBuffer().then(function (buf) {
          baixar(base() + (soLista ? "-lista-de-pecas.xlsx" : "-cotacao-madeira.xlsx"), buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
          UIE.saidas[soLista ? "lista" : "xlsx"] = true; toast(soLista ? "Lista de peças baixada." : "Cotação baixada (.xlsx).", "ok", 6000); if (raiz()) { UIE.manterRolagem = true; render(); } ok(true);
        }, function (e) { toast("Planilha: " + e.message, "erro", 9000); ok(false); });
      });
    });
  }
  function saidaIfc() {
    if (!lic("exportar o IFC") || semResultado()) return false;
    var r = resAtiva(), x = (r.tipologia === "T2" && global.MadEngT2Doc) ? global.MadEngT2Doc.ifc(r, { projeto: est().obra.nome || "Casa de duas águas" }) : SA().gerarIfc(r.fonte.pecas, { projeto: est().obra.nome || "Estrutura de madeira", opcao: r.opcao });
    if (!x.ok) { toast("IFC: " + x.erro, "erro", 8000); return false; }
    baixar(base() + ".ifc", x.texto, "application/x-step"); UIE.saidas.ifc = true; UIE.ifcN = x.n; toast("IFC4 com " + x.n + " peças baixado.", "ok", 6000); if (raiz()) { UIE.manterRolagem = true; render(); } return true;
  }
  function enviarBim(quieto) {
    if (!lic("levar o modelo ao BIM") || semResultado()) return false;
    var B = global.BIM; if (!B || !B.editarLote) { toast("Abra o BIM primeiro: o modelo vai para o modelador.", "aviso", 6000); return false; }
    var ops = SA().opsBim(resAtiva().fonte.pecas);
    var ok = B.editarLote({ op: "lote", id: "madeng-" + est().ativa, ops: ops });
    if (!ok) { toast("O BIM não aceitou o lote de peças.", "erro", 7000); return false; }
    UIE.saidas.bim = true; if (!quieto) { toast(ops.length + " peças enviadas ao BIM.", "ok", 6000); if (raiz()) { UIE.manterRolagem = true; render(); } } return true;
  }
  function mostrar3d(i) { var r = resAtiva(); if (!r) return; var a = arr(r.auditoria.achados)[i]; if (!a) return; mostrar3dPeca(a.peca); }
  function mostrar3dPeca(id) {
    var r = resAtiva(); if (!r || !id) return;
    if (!enviarBim(true)) return;
    var uid = "edit:mad-" + id, B = global.BIM, tent = 0; UIE.m3d = { peca: id, ok: false, tent: 0 }; fechar();
    /* o BIM refaz as malhas dos volumes depois do lote (286 peças levam alguns segundos): tenta até a peça existir na cena.
       BIM.selecionar devolve só os uids que existem na cena — é o critério de sucesso */
    (function tenta() {
      var ap = []; try { if (B.selecionar) ap = B.selecionar([uid], "trocar") || []; if (ap.length && B.enquadrarAgora) B.enquadrarAgora(); } catch (e) { ap = []; }
      UIE.m3d.tent = tent;
      if (ap.indexOf(uid) >= 0) { UIE.m3d.ok = true; toast("Peça " + id + " no 3D.", "ok", 5000); return; }
      if (++tent > 40) { toast("A peça " + id + " está no BIM, mas a cena ainda não terminou de montar: selecione-a pela lista de elementos.", "aviso", 8000); return; }
      setTimeout(tenta, 700);
    })();
  }
  function copiarReacoes() {
    var rs = resumoAtivo(); if (!rs) return false;
    var t = SA().reacoesFundacao(rs.reacoes, est().obra.nome, est().ativa).texto, ok = false;
    try { if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t); ok = true; } } catch (e) {}
    if (!ok) { var ta = doc.querySelector("[data-meg='reacoes-texto']"); if (ta) { ta.focus(); ta.select(); try { ok = doc.execCommand("copy"); } catch (e2) {} } }
    UIE.saidas.reacoes = true; toast(ok ? "Texto das reações copiado." : "Selecione o texto e copie (Ctrl+C).", ok ? "ok" : "aviso", 5000); if (raiz()) { UIE.manterRolagem = true; render(); } return ok;
  }
  /* o orçamento recalcula com os preços do estado (a tela edita o preço, a fonte e o total saem do motor) */
  function reorcar() {
    var r = resAtiva(); if (!r) return;
    var tp = EN().toProj(est(), r.opcao), pr = tp.proj.params;
    r.orcamento = MO().orcar({ opcao: r.opcao, nome: r.nomeOpcao, pecas: r.fonte.pecas, ligacoes: r.ligacoes, secoes: r.secoes, teto: pr.teto, extras: est().extras, precos: est().precos, bdi: est().bdi });
    UIE.resumos[r.opcao] = compactar(r); UIE.desatualizado[r.opcao] = false; salvar();
  }
  function lancarOrcamento() {
    if (!lic("lançar no módulo Orçamentos") || semResultado()) return false;
    var Orc = global.Orcamento, St = global.Store, Au = global.Auth;
    if (!Orc || !St || !Au) { toast("O módulo Orçamentos não está disponível nesta tela.", "aviso", 6000); return false; }
    var O = resAtiva().orcamento, seed = MO().paraOrcamento(O);
    try {
      var orc = Orc.novo({ nome: seed.nome, obra: est().obra.nome });
      if (global.Bdi && Orc.aplicarBdi) Orc.aplicarBdi(orc, "custom", Bdi.paramsParaPercentual(Math.round(seed.bdi * 10000) / 100, Bdi.paramsDoModelo("padrao")));
      seed.etapas.forEach(function (et) {
        Orc.addEtapa(orc, et.nome); var eid = orc.etapas[orc.etapas.length - 1].id;
        et.itens.forEach(function (it) { Orc.addItem(orc, eid, { codigo: "", descricao: it.descricao + " — preço: " + it.fonte, unidade: it.unidade, custoUnitario: it.custoUnitario }, it.quantidade); });
      });
      St.salvarOrcamento(Au.empresaId(), orc);
      UIE.saidas.orc = orc.id; UIE.ultimoOrc = orc.id;
      toast("Orçamento criado: " + seed.etapas.length + " etapas, " + seed.etapas.reduce(function (s, e) { return s + e.itens.length; }, 0) + " itens, " + O.adotados + " com preço adotado (marcados).", "ok", 9000);
      if (raiz()) { UIE.manterRolagem = true; render(); } return true;
    } catch (e) { toast("Orçamento: " + e.message, "erro", 9000); return false; }
  }

  /* ================================================================ CORREÇÕES */

  /* ================================================================ E3: PRANCHAS, MEMORIAL, MANUAL, SKETCHUP, CYPE */
  function opcoesDoc() {
    var e = est(), o = e.obra || {}, cod = nomeSeguro(o.nome || "obra").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "OBRA";
    return { obra: o.nome || "", local: o.cidade || o.local || "", proprietario: o.cliente || o.proprietario || "", codigo: cod + "-EST", revisao: "R00", empresa: "RA Engenharia", nomeOpcao: resAtiva() ? resAtiva().nomeOpcao : "" };
  }
  function saidaPranchas() {
    if (!lic("baixar as pranchas") || semResultado()) return false;
    var rA = resAtiva(), MPE = (rA.tipologia === "T2" && global.MadEngT2) ? global.MadEngT2 : (rA.soDeck && global.MadEngDeck ? global.MadEngDeck : global.MadEngPranchas), PDF = global.SvgPdf; if (!MPE || !PDF) { toast("O gerador de pranchas ou de PDF não carregou.", "erro"); return false; }
    var x = MPE.gerar(rA, opcoesDoc()); if (!x.ok) { toast("Pranchas: " + (x.avisos[0] || "falhou"), "erro", 9000); return false; }
    /* E4 r7: o deck calculado junto com a T1 leva também o caderno do deck (D01-D06) depois das folhas da casa */
    if (!rA.soDeck && rA.deck && global.MadEngDeck) { var xd = global.MadEngDeck.gerar(rA, opcoesDoc()); if (xd.ok) { x.folhas = x.folhas.concat(xd.folhas); x.avisos = x.avisos.concat(xd.avisos); } else x.avisos.push("Caderno do deck: " + (xd.avisos[0] || "não gerado")); }
    baixar(base() + "-pranchas-madeira-engenharada.pdf", PDF.pdf(x.folhas.map(function (f) { return f.svg; }), { titulo: "Pranchas — estrutura de madeira engenharada" }), "application/pdf");
    UIE.saidas.pranchas = x.folhas.length; toast(x.folhas.length + " pranchas em PDF vetorial (A1)." + (x.avisos.length ? " " + x.avisos.length + " aviso(s)." : ""), "ok", 8000); if (raiz()) { UIE.manterRolagem = true; render(); } return true;
  }
  function abrirHtmlImprimir(html, nome) {
    var w = null; try { w = global.open("", "_blank"); } catch (e) { w = null; }
    if (w && w.document) { w.document.open(); w.document.write(html + "<script>setTimeout(function(){try{window.print()}catch(e){}},700)<\/script>"); w.document.close(); return "aba"; }
    baixar(nome, html, "text/html"); return "arquivo";
  }
  function saidaMemorial() {
    if (!lic("gerar o memorial") || semResultado()) return false;
    var MEM = (resAtiva().tipologia === "T2" && global.MadEngT2Doc) ? { gerar: global.MadEngT2Doc.memorial } : global.MadEngMemorial; if (!MEM) { toast("O gerador do memorial não carregou.", "erro"); return false; }
    var o = opcoesDoc(), x = MEM.gerar(resAtiva(), { obra: { nome: o.obra, cidade: o.local }, documento: { numero: o.codigo + "-MEM", revisao: "R00", data: new Date().toISOString().slice(0, 10) }, responsavel: {}, nomeOpcao: o.nomeOpcao });
    if (!x.ok) { toast("Memorial: " + (x.motivo || "falhou"), "erro", 9000); return false; }
    var onde = abrirHtmlImprimir(x.html, base() + "-memorial-madeira-engenharada.html"); UIE.saidas.memorial = x.secoes.length;
    toast(onde === "aba" ? "Memorial aberto: salve em PDF na janela de impressão." : "Memorial baixado (.html): abra e imprima em PDF.", "ok", 8000); if (raiz()) { UIE.manterRolagem = true; render(); } return true;
  }
  function saidaManual() {
    if (!lic("gerar o manual de montagem") || semResultado()) return false;
    var MAN = (resAtiva().tipologia === "T2" && global.MadEngT2Doc) ? { gerar: global.MadEngT2Doc.manual } : global.MadEngManual; if (!MAN) { toast("O gerador do manual não carregou.", "erro"); return false; }
    var o = opcoesDoc(), x = MAN.gerar(resAtiva(), { obra: { nome: o.obra }, documento: { revisao: "R00" } });
    if (!x.ok) { toast("Manual: " + (x.avisos[0] || "falhou"), "erro", 9000); return false; }
    var onde = abrirHtmlImprimir(x.html, base() + "-manual-montagem-madeira.html"); UIE.saidas.manual = x.paginas;
    toast(onde === "aba" ? "Manual aberto (A3 paisagem): salve em PDF na janela de impressão." : "Manual baixado (.html).", "ok", 8000); if (raiz()) { UIE.manterRolagem = true; render(); } return true;
  }
  function saidaSkp() {
    if (!lic("exportar para o SketchUp") || semResultado()) return false;
    var X = global.MadEngExport; if (!X) { toast("O exportador não carregou.", "erro"); return false; }
    var x = (resAtiva().tipologia === "T2" && global.MadEngT2Doc) ? global.MadEngT2Doc.dae(resAtiva(), { projeto: est().obra.nome || "Casa de duas águas" }) : X.gerarDae(resAtiva().fonte.pecas, { projeto: est().obra.nome || "Estrutura de madeira" }); if (!x.ok) { toast("SketchUp: " + x.erro, "erro", 8000); return false; }
    baixar(base() + "-sketchup.dae", x.texto, "model/vnd.collada+xml"); UIE.saidas.skp = x.grupos; toast("Modelo COLLADA com " + x.grupos + " grupos baixado: no SketchUp, Arquivo → Importar.", "ok", 8000); if (raiz()) { UIE.manterRolagem = true; render(); } return true;
  }
  function saidaCype() {
    if (!lic("exportar para o CYPE 3D") || semResultado()) return false;
    var X = global.MadEngExport; if (!X || !global.BimBcf || !BimBcf.zipEscrever) { toast("O exportador ou o gerador de .zip não carregou.", "erro"); return false; }
    var x = (resAtiva().tipologia === "T2" && global.MadEngT2Doc) ? global.MadEngT2Doc.cype(resAtiva(), { obra: { nome: est().obra.nome } }) : X.pacoteCype(resAtiva(), { obra: { nome: est().obra.nome } }); if (!x.ok) { toast("CYPE: " + x.erro, "erro", 8000); return false; }
    var arq = {}; Object.keys(x.arquivos).forEach(function (k) { var a = x.arquivos[k]; if (a.latin1) { var b = new Uint8Array(a.texto.length); for (var i = 0; i < a.texto.length; i++) b[i] = a.texto.charCodeAt(i) & 255; arq[k] = b; } else arq[k] = a.texto; });
    baixar(base() + "-cype3d-madeira.zip", BimBcf.zipEscrever(arq), "application/zip"); UIE.saidas.cype = Object.keys(arq).length; toast("Pacote para o CYPE 3D baixado (" + Object.keys(arq).length + " arquivos).", "ok", 8000); if (raiz()) { UIE.manterRolagem = true; render(); } return true;
  }
  function sitCorrigir(i) {
    var rs = resumoAtivo(); if (!rs) return; var x = sitDe(rs).itens[i]; if (!x) return;
    if (x.tipo === "achado") { var k = arr(rs.achados).findIndex(function (a) { return a.peca === x.peca && a.regra === x.regra; }); if (k >= 0) { corrigir(k); return; } }
    ir(3); toast(x.correcao || x.texto, "aviso", 9000);
  }
  function corrigir(i) {
    var rs = resumoAtivo(); if (!rs) return; var a = arr(rs.achados)[i]; if (!a) return;
    var o = opc(), st = est().passo, id = String(a.peca || "");
    if (a.regra === "esbeltez") {
      if (/^VG/.test(id)) o.VG.h = EN().r(num(o.VG.h, 0.36) + st.altura, 3);
      else if (/^P\d/.test(id)) { if (o.pilar.forma === "circular") o.pilar.d = EN().r(num(o.pilar.d, 0.3) + st.largura, 3); else o.pilar.b = EN().r(num(o.pilar.b, 0.28) + st.largura, 3); }
      else o.T.h = EN().r(num(o.T.h, 0.36) + st.altura, 3);
      marcarDesatualizado(); salvar(); toast("Seção da peça " + id + " aumentada na partida: calcule de novo.", "ok", 7000); ir(3); return;
    }
    if (/deck|apoio|barrote|pilarete|terreno/.test(a.regra + " " + id) || /^D[SI]-/.test(id)) { ir(2); toast(a.correcao, "aviso", 9000); return; }
    ir(3); toast(a.correcao, "aviso", 9000);
  }

  /* ================================================================ EVENTOS */
  function lerValor(el) {
    var t = el.getAttribute("data-meg-tipo");
    if (t === "chk") return !!el.checked;
    if (t === "num") { var n = num(el.value, null); return n; }
    if (t === "sel") { var v = el.value; if (v === "true") return true; if (v === "false") return false; return /^-?\d+([.,]\d+)?$/.test(v) && el.getAttribute("data-meg-campo").indexOf("categoria") < 0 && el.getAttribute("data-meg-campo").indexOf("s1tipo") < 0 ? Number(v.replace(",", ".")) : v; }
    return el.value;
  }
  function localizar() {
    var e = est(), txt = String(e.obra.local || "").replace(/[−–]/g, "-").trim(), G0 = global.IcarGeo, c = null;
    if (G0 && G0.lerCoordenada) { try { c = G0.lerCoordenada(txt); } catch (er) { c = null; } }
    if (!c) { var m = /^\s*(-?\d+(?:[.,]\d+)?)\s*[;,\s]\s*(-?\d+(?:[.,]\d+)?)\s*$/.exec(txt); if (m) c = { lat: num(m[1], 0), lon: num(m[2], 0) }; }
    if (c) { e.obra.lat = Math.round(c.lat * 1e6) / 1e6; e.obra.lon = Math.round(c.lon * 1e6) / 1e6; UIE.busca = null; salvar(); marcarDesatualizado(); render(); return; }
    var g = Ges();
    if (txt.length < 4) { UIE.busca = { erro: "Escreva o endereço (cidade e estado), cole o link do mapa ou digite as coordenadas." }; render(); return; }
    if (!g || !g._icarGeoPost) { UIE.busca = { erro: "A busca de endereço não está disponível: digite as coordenadas." }; render(); return; }
    UIE.buscando = true; UIE.busca = null; render();
    g._icarGeoPost("/ia/geo/busca", { q: txt }).then(function (x) {
      UIE.buscando = false;
      if (!x || x.s !== 200 || !x.j || !x.j.ok) UIE.busca = { erro: "A busca não respondeu. Digite as coordenadas ou cole o link do mapa." };
      else { var L = arr(x.j.resultados).slice(0, 5); if (!L.length) UIE.busca = { erro: "Não achei esse endereço. Tente com cidade e estado." }; else if (L.length === 1) { usarLocal(L[0]); return; } else UIE.busca = { lista: L }; }
      if (raiz()) render();
    }, function () { UIE.buscando = false; UIE.busca = { erro: "Sem conexão com a busca de endereço: digite as coordenadas." }; if (raiz()) render(); });
  }
  function usarLocal(x) { var o = est().obra; o.lat = Math.round(+x.lat * 1e6) / 1e6; o.lon = Math.round(+x.lon * 1e6) / 1e6; if (x.nome) o.local = String(x.nome).slice(0, 120); UIE.busca = null; salvar(); marcarDesatualizado(); if (raiz()) render(); }

  function ligar(v) {
    v.addEventListener("click", function (ev) {
      var el = ev.target && ev.target.closest ? ev.target.closest("[data-meg-acao]") : null;
      if (!el || !v.contains(el) || el.disabled) return;
      var a = el.getAttribute("data-meg-acao"), val = el.getAttribute("data-meg-v"), e = est();
      if (a === "fechar") fechar();
      else if (a === "passo") ir(+val);
      else if (a === "opcao") { e.ativa = val; UIE.comparar = false; salvar(); render(); }
      else if (a === "comparar") { UIE.comparar = true; render(); }
      else if (a === "calcular") calcular(null);
      else if (a === "calcular-todas") { var ids = e.opcoes.map(function (o) { return o.id; }).filter(function (k) { return !UIE.res[k]; }); if (!ids.length) ids = e.opcoes.map(function (o) { return o.id; }); calcular(ids[0], ids.slice(1)); }
      else if (a === "cancelar") cancelar();
      else if (a === "exemplo") exemplo();
      else if (a === "novo") { if (!global.confirm("Começar do zero? Os dados digitados desta obra serão apagados da tela.")) return; UIE.est = EN().estadoPadrao(); zerarRes(); var o = obraApp(); if (o && o.nome) UIE.est.obra.nome = o.nome; salvar(); ir(1); }
      else if (a === "tip") { if (val !== e.tip) { if (UIE.calc && UIE.calc.rodando) { toast("Aguarde o cálculo terminar para trocar de tipologia.", "aviso", 5000); return; } trocarTip(val); } render(); }
      else if (a === "localizar") localizar();
      else if (a === "usar-local") usarLocal(arr(UIE.busca && UIE.busca.lista)[+val]);
      else if (a === "add-deck-m" || a === "add-deck-r") { var d = a === "add-deck-m" ? EN().deckSuperiorPadrao() : EN().deckRetanguloPadrao(); d.id = "D" + (arr(e.t7.decks).length + 1) + (a === "add-deck-m" ? "S" : "I"); d.nome = "Deck " + (arr(e.t7.decks).length + 1); e.t7.decks.push(d); marcarDesatualizado(); salvar(); UIE.manterRolagem = true; render(); }
      else if (a === "rem-deck") { e.t7.decks.splice(+val, 1); marcarDesatualizado(); salvar(); UIE.manterRolagem = true; render(); }
      else if (a === "escada-add") { e.t7.escada = { xs: "", y0: 0, y1: 3, z0: 0, z1: 1.5, b: 0.06, h: 0.28, degraus: 9 }; salvar(); UIE.manterRolagem = true; render(); }
      else if (a === "escada-rem") { e.t7.escada = null; salvar(); UIE.manterRolagem = true; render(); }
      else if (a === "dup-opcao") { var o0 = EN().copia(opc()); e.opcoes.forEach(function (o, i) { if (o.id !== e.ativa) { var id0 = o.id, nm = o.nome; e.opcoes[i] = EN().copia(o0); e.opcoes[i].id = id0; e.opcoes[i].nome = nm; } }); marcarDesatualizado(); salvar(); toast("Parâmetros copiados para as outras opções; mude o pilar e a base de cada uma.", "ok", 6000); render(); }
      else if (a === "xlsx") saidaXlsx(false);
      else if (a === "lista-xlsx") saidaXlsx(true);
      else if (a === "ifc") saidaIfc();
      else if (a === "bim-enviar") enviarBim(false);
      else if (a === "reacoes-copiar") copiarReacoes();
      else if (a === "orc-lancar") lancarOrcamento();
      else if (a === "corrigir") corrigir(+val);
      else if (a === "mostrar3d") mostrar3d(+val);
      else if (a === "sit-corrigir") sitCorrigir(+val);
      else if (a === "sit-3d") { var rr = resAtiva(), it3 = sitDe(resumoAtivo()).itens[+val]; if (rr && it3) mostrar3dPeca(pecaDoItem(it3, rr)); }
      else if (a === "pranchas-pdf") saidaPranchas();
      else if (a === "memorial-pdf") saidaMemorial();
      else if (a === "manual-pdf") saidaManual();
      else if (a === "skp") saidaSkp();
      else if (a === "cype") saidaCype();
    });
    v.addEventListener("change", function (ev) {
      var el = ev.target; if (!el || !el.getAttribute) return;
      var cp = el.getAttribute("data-meg-campo");
      if (cp) {
        var x = lerValor(el); if (el.getAttribute("data-meg-tipo") === "num" && x == null && String(el.value).trim() !== "") { toast("Valor inválido: use números (ex.: 7,5).", "aviso", 4000); return; }
        setPath(cp, x); if (cp === "t7.escadaMat" && x !== "nenhuma" && !est().t7.escada) est().t7.escada = { xs: "", y0: 0, y1: 3, z0: 0, z1: 1.5, b: 0.06, h: 0.28, degraus: 9 }; if (/.vedacao$/.test(cp)) setPath(cp.replace(/vedacao$/, "fechada"), x !== "aberta"); marcarDesatualizado(cp); salvar();
        /* mudar a forma do pilar ou do deck, o tipo de deck ou o vento reorganiza os campos */
        UIE.manterRolagem = true; render(); return;
      }
      var pk = el.getAttribute("data-meg-preco"), fk = el.getAttribute("data-meg-fonte");
      if (pk || fk) {
        var k = pk || fk, e = est(), atual = e.precos[k] || {}, tabela = MO().PRECOS[k];
        if (pk) { var n = num(el.value, null); if (n == null || n < 0) { toast("Preço inválido.", "aviso", 4000); return; } atual.pu = n; if (!atual.fonte) atual.fonte = ""; }
        if (fk) { atual.fonte = String(el.value).trim(); if (atual.pu == null) atual.pu = tabela[0]; }
        e.precos[k] = atual; reorcar(); UIE.manterRolagem = true; render();
      }
    });
  }
  function exemplo() {
    garantir(); UIE.est = EN().exemploCasaMar(); zerarRes(); UIE.erro = null; UIE.comparar = false;
    salvar(); ir(1); toast("Exemplo Casa Mar carregado: casa de uma água e dois decks em Balneário Camboriú. Vá ao passo 4 e calcule.", "ok", 8000);
    return true;
  }

  /* ================================================================ FITA (aba Carpintaria & Marcenaria) */
  function previaLigada() { try { return !!global.localStorage.getItem("orcapro:tela:madeng:v1"); } catch (e) { return false; } }
  function previa() { var P = global.BimPrevia; if (!previaLigada() || !P || !P.modelador || !P.modelador()) return false; if (P.disciplina) { try { return P.disciplina("marcenaria") !== false; } catch (e) { return true; } } return true; }
  var COMANDOS = [
    { id: "mad-eng-abrir", rotulo: "Estruturas de\nmadeira", icone: "estrutura", grande: true, dica: "Projeto de estruturas de madeira engenharada em 5 passos: obra e local, tipologia (cobertura de uma água, deck), materiais e ligações, cálculo e saídas (cotação, IFC, BIM, orçamento)." },
    { id: "mad-eng-exemplo", rotulo: "Exemplo\nCasa Mar", icone: "camadas", grande: true, dica: "Preenche a tela com a Casa Mar: casa de uma água e dois decks, com as três opções de pilar." },
    { id: "mad-eng-calcular", rotulo: "Calcular", icone: "raio", grande: true, dica: "Calcula a opção ativa em paralelo (cerca de um minuto)." }
  ];
  function registrar(reg) {
    var R = global.BimRibbon;
    if (!previa() || !R || !reg || !WK() || !EN()) return false;
    R.acrescentar("marcenaria", "Carpintaria & Marcenaria", "Estruturas de madeira", COMANDOS);
    var ids = COMANDOS.map(function (c) { return c.id; });
    if (global.BimDisciplinas && typeof global.BimDisciplinas.declarar === "function") { try { global.BimDisciplinas.declarar(ids, "marcenaria"); } catch (e) {} }
    ids.forEach(function (k) { if (R._EXCLUSIVOS && R._EXCLUSIVOS.indexOf(k) < 0) R._EXCLUSIVOS.push(k); });
    var h = { "mad-eng-abrir": function () { API.abrir(); }, "mad-eng-exemplo": function () { API.exemplo(); }, "mad-eng-calcular": function () { API.abrir(); API.calcular(); } };
    Object.keys(h).forEach(function (k) { reg[k] = function () { try { h[k](); } catch (e) { toast("Estruturas de madeira: " + (e && e.message ? e.message : e), "erro", 8000); } return true; }; });
    setTimeout(function () { try { var sh = global.BimShell; if (sh && sh._raiz && typeof sh._sincAbas === "function") sh._sincAbas(); } catch (e) {} }, 0);
    return true;
  }

  /* ================================================================ API */
  var API = {
    COMANDOS: COMANDOS, registrar: registrar,
    abrir: function () { garantir(); render(); return true; },
    exemplo: exemplo,
    calcular: function (op) { return calcular(op || null); },
    fechar: fechar, passo: function (n) { garantir(); ir(n); return true; },
    estado: function () {
      var e = UIE.est;
      return { aberta: !!raiz(), passo: UIE.passo, ativa: e && e.ativa, calculando: !!(UIE.calc && UIE.calc.rodando), etapa: UIE.calc ? UIE.calc.etapa : null, modo: UIE.calc ? UIE.calc.modo : null, erro: UIE.erro,
        calculadas: Object.keys(UIE.res), resumos: Object.keys(UIE.resumos), baixados: UIE.baixados.slice(), saidas: JSON.parse(JSON.stringify(UIE.saidas)), ultimoOrc: UIE.ultimoOrc || null, m3d: UIE.m3d || null,
        eta: UIE.res[e && e.ativa] ? UIE.res[e.ativa].grupos && Object.keys(UIE.res[e.ativa].grupos).reduce(function (o, k) { o[k] = UIE.res[e.ativa].grupos[k].eta; return o; }, {}) : null,
        secoes: UIE.res[e && e.ativa] ? UIE.res[e.ativa].secoes : null, pecas: UIE.res[e && e.ativa] ? UIE.res[e.ativa].fonte.pecas.length : null, achados: UIE.res[e && e.ativa] ? UIE.res[e.ativa].auditoria.achados.length : null,
        orcamento: UIE.res[e && e.ativa] ? { custo: UIE.res[e.ativa].orcamento.custo_direto, preco: UIE.res[e.ativa].orcamento.preco, itens: UIE.res[e.ativa].orcamento.itens.length } : null };
    },
    estadoProjeto: function () { return UIE.est; },
    resultado: function (op) { return UIE.res[op || (UIE.est && UIE.est.ativa)] || null; }
  };
  global.MadEngUI = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : this);
