/* =====================================================================
 * arqpranchasui.js — "GERAR PRANCHAS DE ARQUITETURA": a tela de configuração e a saída (fiação fina sobre js/arqpranchas.js).
 *
 *   ArqPranchasUI.abrir(ctx?)        a tela: folha (automática, A0–A3), escala da planta, prefixo e revisão, limites do município
 *                                    (padrão VAZIO = "informe os limites"; o exemplo de Uberlândia vem marcado "conferir na lei"),
 *                                    nome da rua, o que gerar (situação, existente, demolir/construir, layout, cobertura, forro,
 *                                    cortes, fachadas, piso, quadros, humanizada) e a saída (PDF, DXF, abas de folha do BIM).
 *                                    A configuração fica MEMORIZADA por obra (localStorage orcapro:arq:pranchas:<obra>).
 *   ArqPranchasUI.gerar(ctx, cfg, saida)  gera, baixa o PDF vetorial e o DXF e abre as folhas nas ABAS DE FOLHA do BIM
 *                                    (registro "Pranchas de arquitetura", origem "arq"; gerar de novo SUBSTITUI as folhas).
 *   ctx = { modelo: { estado, ops, avaliarFam }, pavimentos, empresa, obra, logo, obraKey, obraId }
 * Sem DOM nos cálculos (configDaTela, opcoesDe, registroFolhas): testados em Node.
 * Teste: tools/ (pranchas de arquitetura) · e2e: e2e: tools/ (pranchas de arquitetura)
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function AQ() { return dep("ArqPranchas", "./arqpranchas.js"); }
  function AC() { return dep("ArqCaderno", "./arqcaderno.js"); }
  function IX() { return dep("ArqIndices", "./arqindices.js"); }
  function INT() { return dep("ArqInteriores", "./arqinteriores.js"); }
  function MD() { return dep("ArqModelo", "./arqmodelo.js"); }
  function PRN() { return dep("Prancha", "./prancha.js"); }
  function FEUI() { return dep("FolhasEditorUI", "./folhaseditorui.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  var CHAVE = "orcapro:arq:pranchas:";
  var ULTIMO = { r: null, ctx: null, cfg: null };

  /* ------------------------------------------------------------ puro */
  function chave(obraKey) { return CHAVE + (txt(obraKey) || "geral"); }
  function lerMemoria(obraKey, ls) {
    var L = ls || (global.localStorage || null), v = null;
    try { v = L ? JSON.parse(L.getItem(chave(obraKey)) || "null") : null; } catch (e) { v = null; }
    return AQ().normalizarConfig(v || AQ().configPadrao());   /* obra sem memória começa no PADRÃO (com a capa ligada), não no normalizarConfig({}) */
  }
  function gravarMemoria(obraKey, cfg, ls) {
    var L = ls || (global.localStorage || null);
    try { if (L) L.setItem(chave(obraKey), JSON.stringify(AQ().normalizarConfig(cfg))); return true; } catch (e) { return false; }
  }
  /* o objeto de opções do ArqPranchas.gerar: a configuração + o CARIMBO (empresa, RT, obra) */
  function opcoesDe(ctx, cfg) {
    var em = (ctx && ctx.empresa) || {}, ob = (ctx && ctx.obra) || {}, c = AQ().normalizarConfig(cfg);
    var o = { jogo: c.jogo, pavimentos: arr(ctx && ctx.pavimentos), formato: c.formato, escala: c.escala, prefixo: c.prefixo, revisao: c.revisao, descricaoRevisao: c.descricaoRevisao, conjuntos: c.conjuntos,
      arranjo: c.arranjo, fixos: c.fixos, arranjoFormato: c.arranjoFormato, formatosFolha: c.formatosFolha, interiores: c.interiores, municipio: c.municipio, limites: c.limites, rua: c.rua, cotasInternas: c.cotasInternas, beiralNaProjecao: c.beiralNaProjecao, fatores: c.fatores,
      empresa: em.nome ? em : "", responsavel: txt(em.responsavel), registro: txt(em.crea), tituloProfissional: txt(em.titulo),
      obra: txt(ob.nome), proprietario: txt(ob.clienteNome), contratante: txt(ob.clienteNome), local: txt(ob.local || ob.endereco), logo: (ctx && ctx.logo) || null };
    if (ctx && ctx.contornoLote) o.contornoLote = ctx.contornoLote;
    /* F1: a folha de renders é a FOTO da cena 3D (BIM.fotoIso), como no hidro; sem o 3D aberto a folha não sai (o gerador avisa) */
    var f3 = (ctx && typeof ctx.foto3d === "function") ? ctx.foto3d : (global.BIM && global.BIM.fotoIso ? function (x) { return global.BIM.fotoIso(x); } : null);
    if (f3) o.foto3d = f3;
    if (ctx && ctx.extras && typeof ctx.extras === "object") Object.keys(ctx.extras).forEach(function (k) { if (o[k] == null) o[k] = ctx.extras[k]; });   /* R02: opções do projeto (cores da fachada, rampa, caixa d'água…) */
    if (ctx && ctx.cortes) o.cortes = ctx.cortes;   /* a linha dos cortes AA (z) e BB (x) escolhida por quem projeta (o exemplo: pela escada e pela caixa d'água) */
    return o;
  }
  /* o registro das folhas no BIM (Store bim_pranchas): cada folha pronta entra como IMAGEM INTEIRA (a folha gerada fora, com carimbo) */
  function registroFolhas(r, existente, obraId) {
    var folhas = r.folhas.map(function (f, i) { return { id: "arq-" + f.id, n: i + 1, conteudo: f.numero + " - " + f.titulo, escala: f.escala, blocos: [], imagemInteira: "arqsvg:" + f.id }; });
    var reg = { nome: "Pranchas de arquitetura", origem: "arq", formato: r.folhas[0] ? r.folhas[0].formato : "A1", orientacao: "paisagem", carimbo: { modelo: "RA" }, folhas: folhas };
    if (existente && existente.id) { reg.id = existente.id; reg.criadoEm = existente.criadoEm; }
    reg.obraId = txt(obraId);
    return reg;
  }
  function dataUrlSvg(svg) { return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); }

  /* ------------------------------------------------------------ tela */
  function marcado(v) { return v ? " checked" : ""; }
  /* a lista de ambientes do caderno de interiores (checkboxes); sem modelo ou sem o motor, uma frase */
  function ambientesInt(ctx, cfg) {
    var lista = [], sel = cfg.interiores && Array.isArray(cfg.interiores.ambientes) ? cfg.interiores.ambientes.map(String) : null, erro = "";
    /* ⚠ a MESMA lista do gerador (situação de DEPOIS): ArqPranchas.ambientesInteriores. Antes saía do modelo inteiro e o ambiente unido por demolição aparecia marcado sem gerar */
    try { if (AQ() && AQ().ambientesInteriores && ctx && ctx.modelo) lista = AQ().ambientesInteriores(ctx.modelo, { pavimentos: ctx.pavimentos }).lista; } catch (e) { lista = []; erro = e && e.message ? e.message : String(e); }
    if (!lista.length) return '<span class="muted" style="font-size:12px">' + (erro ? "Não consegui ler os ambientes do modelo: " + esc(erro) : "O modelo não tem ambiente delimitado na situação proposta: crie os ambientes (sala, quarto…) no BIM para gerar o caderno.") + "</span>";
    var h = '<div data-arq="int-ambientes" style="max-height:260px;overflow:auto;columns:2 200px;column-gap:16px">';
    h += lista.map(function (a) {
      var on = sel ? sel.indexOf(String(a.id)) >= 0 : a.padrao, vazio = !a.nMoveis;
      return '<label style="display:block;break-inside:avoid"><input type="checkbox" data-arq-int-amb="' + esc(a.id) + '"' + marcado(on) + "> " + esc(a.nome) + ' <span class="muted">(' + (vazio ? "sem mobiliário: sai a planta e as vistas das paredes" : a.nMoveis + " móvel(is), " + a.nMarcenaria + " de marcenaria") + ")</span></label>";
    }).join("");
    return h + "</div>";
  }
  var ROTULO_FOLHA = { planta: "Planta de móveis (marcadores de vista e de corte)", vistas: "Vistas dos móveis 1:25 (notas de material)", cortes: "Cortes 1:20 da marcenaria", eletrico: "Elétrico (planta e vistas com a altura dos pontos)",
    luminotecnico: "Luminotécnico (planta, legenda e o detalhe 1:10 da sanca, se houver)", pedras: "Pedras (folha geral: bancadas)", imagens: "00 Imagens ilustrativas (espaço para os renders)" };
  function folhasInt(cfg) {
    var I = INT(), fl = I && I.flagsDe ? I.flagsDe(cfg.interiores) : {};
    return Object.keys(ROTULO_FOLHA).map(function (k) { return '<label style="display:block;margin-left:12px"><input type="checkbox" data-arq-int-f="' + k + '"' + marcado(fl[k]) + "> " + esc(ROTULO_FOLHA[k]) + "</label>"; }).join("");
  }
  function html(ctx, cfg) {
    var A = AQ(), em = ctx.empresa || {}, ob = ctx.obra || {}, L = cfg.limites || {}, mun = IX().MUNICIPIOS;
    var h = '<div data-arq="tela" data-modal-largo="1" style="max-height:72vh;overflow:auto;padding-right:4px;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;font-size:13px">';
    h += '<fieldset style="border:1px solid var(--linha);border-radius:var(--raio-sm);padding:8px"><legend><b>Folha e escala</b></legend>' +
      '<label>Jogo <select data-arq="jogo"><option value="executivo"' + (cfg.jogo !== "legal" ? " selected" : "") + '>Executivo (layout, forro, piso, esquadrias, humanizada…)</option><option value="legal"' + (cfg.jogo === "legal" ? " selected" : "") + '>Legal / prefeitura (situação, demolir/construir, planta, cortes, fachadas)</option></select></label><br>' +
      '<label>Folha <select data-arq="formato">' + A.FORMATOS.map(function (f) { return '<option value="' + f + '"' + (cfg.formato === f ? " selected" : "") + ">" + (f === "AUTO" ? "Automática (menos folhas, ocupação ≥ 55 %)" : f) + "</option>"; }).join("") + "</select></label><br>" +
      '<label>Escala da planta <select data-arq="escala">' + ["auto", "50", "75", "100"].map(function (e) { return '<option value="' + e + '"' + (String(cfg.escala) === e ? " selected" : "") + ">" + (e === "auto" ? "Automática (1:50 se couber)" : "1:" + e) + "</option>"; }).join("") + "</select></label><br>" +
      '<label><input type="checkbox" data-arq="cotasint"' + marcado(cfg.cotasInternas) + "> Cotas internas dos ambientes</label></fieldset>";
    h += '<fieldset style="border:1px solid var(--linha);border-radius:var(--raio-sm);padding:8px"><legend><b>Numeração e revisão</b></legend>' +
      '<label>Prefixo <input data-arq="prefixo" value="' + esc(cfg.prefixo) + '" size="6"></label> <span class="muted">→ ' + esc(cfg.prefixo) + "-01, " + esc(cfg.prefixo) + "-02…</span><br>" +
      '<label>Revisão <input data-arq="revisao" value="' + esc(cfg.revisao) + '" size="4"></label><br>' +
      '<label>Descrição <input data-arq="descrev" value="' + esc(cfg.descricaoRevisao) + '" style="width:100%"></label></fieldset>';
    h += '<fieldset style="border:1px solid var(--linha);border-radius:var(--raio-sm);padding:8px"><legend><b>Índices urbanísticos</b></legend>' +
      '<label>Limites do município <select data-arq="municipio"><option value="">(informe os limites)</option>' +
      Object.keys(mun).map(function (k) { return '<option value="' + k + '"' + (cfg.municipio === k ? " selected" : "") + ">" + esc(mun[k].nome) + "</option>"; }).join("") + "</select></label><br>" +
      '<span class="muted" style="font-size:12px">O exemplo traz ocupação ≤ 60 % e permeabilidade ≥ 20 %: <b>conferir na lei</b> e no zoneamento do lote.</span><br>' +
      '<label>Ocupação máx. (%) <input data-arq="ocup" value="' + esc(L.ocupacaoMax == null ? "" : L.ocupacaoMax) + '" size="5"></label> ' +
      '<label>Permeável mín. (%) <input data-arq="perm" value="' + esc(L.permeavelMin == null ? "" : L.permeavelMin) + '" size="5"></label><br>' +
      '<label>Aproveitamento máx. <input data-arq="ca" value="' + esc(L.aproveitamentoMax == null ? "" : L.aproveitamentoMax) + '" size="5"></label><br>' +
      '<label><input type="checkbox" data-arq="beiral"' + marcado(cfg.beiralNaProjecao) + "> Contar o beiral na projeção (ocupação)</label><br>" +
      '<label>Nome da rua <input data-arq="rua" value="' + esc(cfg.rua) + '" style="width:100%" placeholder="vazio = marcado em vermelho"></label></fieldset>';
    h += '<fieldset style="border:1px solid var(--linha);border-radius:var(--raio-sm);padding:8px"><legend><b>O que gerar</b></legend>' +
      '<label style="display:block"><input type="checkbox" data-arq-cj="capa"' + marcado(cfg.conjuntos.capa === true) + "> Capa com o índice de todas as folhas (ARQ-00)</label>" +
      A.CONJUNTOS.map(function (k) { return '<label style="display:block"><input type="checkbox" data-arq-cj="' + k + '"' + marcado(cfg.conjuntos[k] !== false) + "> " + esc(A.ROTULO_CONJUNTO[k]) + "</label>"; }).join("") +
      /* a FOLHA EXECUTIVA DE CORTES (js/arqexecutiva.js): desmarcada por padrão; no jogo legal fica desmarcada e travada (o jogo legal nunca a leva) */
      '<label style="display:block"><input type="checkbox" data-arq-cj="executiva"' + marcado(cfg.conjuntos.executiva === true && cfg.jogo !== "legal") + (cfg.jogo === "legal" ? " disabled" : "") + "> " + esc(A.ROTULO_CONJUNTO.executiva) + "</label></fieldset>";
    h += '<fieldset style="border:1px solid var(--linha);border-radius:var(--raio-sm);padding:8px"><legend><b>Carimbo e saída</b></legend>' +
      '<div class="muted" style="font-size:12px">Carimbo RA com o cadastro da empresa e da obra:<br>' + esc(em.nome || "(empresa sem nome no cadastro)") + " · RT " + esc(em.responsavel || "—") + " " + esc(em.crea || "") + "<br>Obra: " + esc(ob.nome || "(sem obra selecionada)") + "</div>" +
      '<label style="display:block"><input type="checkbox" data-arq-out="pdf" checked> PDF vetorial</label><label style="display:block"><input type="checkbox" data-arq-out="dxf" checked> DXF com carimbo</label><label style="display:block"><input type="checkbox" data-arq-out="cad"> Arquivo CAD único (ZIP: DXF com um layout por folha + CTB das penas)</label>' +
      '<label style="display:block"><input type="checkbox" data-arq-out="dwg" disabled> <span data-arq="dwg-rotulo">DWG (ZIP: DWG R2000 com um layout por folha + CTB + LEIA-ME)</span></label><div class="muted" data-arq="dwg-aviso" style="font-size:12px;margin:0 0 4px 22px">Verificando se este computador gera DWG…</div>' +
      '<div style="margin:2px 0 6px 0"><button type="button" class="btn ghost" data-arq="instalar-ctb">Instalar penas RA no AutoCAD</button> <span class="muted" data-arq="ctb-msg" style="font-size:12px">O AutoCAD só acha o .ctb na pasta Plot Styles dele (sem isso: \"RA_Arquitetura.ctb (missing)\").</span></div>' +
      '<label style="display:block"><input type="checkbox" data-arq-out="zip"> ZIP com um PDF por folha (PE_&lt;CLIENTE&gt;_&lt;PRANCHA&gt;_RXX)</label><label style="display:block"><input type="checkbox" data-arq-out="pdfFolhas"> Baixar os PDFs por folha soltos (um download por folha)</label>' +
      '<label style="display:block"><input type="checkbox" data-arq-out="abas" checked> Abrir nas abas de folha do BIM</label></fieldset>';
    /* ocupa a LARGURA TODA da grade (grid-column:1/-1) e põe ambientes e folhas lado a lado: preso numa coluna só deixava um vazio enorme à direita */
    h += '<fieldset style="grid-column:1/-1;border:1px solid var(--linha);border-radius:var(--raio-sm);padding:8px"><legend><b>Caderno de interiores</b></legend>' +
      '<label style="display:block"><input type="checkbox" data-arq-int="ativo"' + marcado(cfg.interiores && cfg.interiores.ativo) + "> Gerar o caderno de interiores (planta de móveis + vistas por ambiente, folhas A3)</label>" +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;margin-top:4px">' +
      '<div><div class="muted" style="font-size:12px;margin:0 0 4px">Ambientes (já marcados: os que têm mobiliário ou marcenaria; marque outros e sai a planta e as vistas das paredes, com aviso):</div>' + ambientesInt(ctx, cfg) + "</div>" +
      '<div><div class="muted" style="font-size:12px;margin:0 0 4px">Folhas de cada ambiente:</div>' + folhasInt(cfg) + "</div></div></fieldset>";
    return h + '</div><div data-arq="msg" class="muted" style="margin-top:8px;font-size:12.5px"></div>';
  }
  /* lê a tela → configuração (puro sobre um "leitor" de elementos; no navegador é o document) */
  function configDaTela(raiz, base) {
    var c = clone(base), q = function (s) { return raiz.querySelector(s); }, qa = function (s) { return Array.prototype.slice.call(raiz.querySelectorAll(s)); };
    function v(k) { var e = q('[data-arq="' + k + '"]'); return e ? e.value : null; }
    if (v("jogo") != null) c.jogo = v("jogo");
    if (v("formato") != null) c.formato = v("formato");
    if (v("escala") != null) c.escala = v("escala") === "auto" ? "auto" : +v("escala");
    if (v("prefixo") != null) c.prefixo = v("prefixo");
    if (v("revisao") != null) c.revisao = v("revisao");
    if (v("descrev") != null) c.descricaoRevisao = v("descrev");
    if (v("municipio") != null) c.municipio = v("municipio");
    if (v("rua") != null) c.rua = v("rua");
    var cb = q('[data-arq="cotasint"]'); if (cb) c.cotasInternas = !!cb.checked;
    var bb = q('[data-arq="beiral"]'); if (bb) c.beiralNaProjecao = !!bb.checked;
    var l = { nome: "", ocupacaoMax: v("ocup"), permeavelMin: v("perm"), aproveitamentoMax: v("ca"), conferir: false };
    ["ocupacaoMax", "permeavelMin", "aproveitamentoMax"].forEach(function (k) { l[k] = l[k] == null || String(l[k]).trim() === "" ? null : +String(l[k]).replace(",", "."); });
    c.limites = l;
    var ci = q('[data-arq-int="ativo"]'), ams = qa("[data-arq-int-amb]");
    var fls = {}; qa("[data-arq-int-f]").forEach(function (e) { fls[e.getAttribute("data-arq-int-f")] = !!e.checked; });
    if (ci) { c.interiores = { folhas: fls, ativo: !!ci.checked, ambientes: ams.length ? ams.filter(function (e) { return e.checked; }).map(function (e) { return e.getAttribute("data-arq-int-amb"); }) : null, prefixo: (base && base.interiores && base.interiores.prefixo) || "INT" }; }
    c.conjuntos = c.conjuntos || {}; qa("[data-arq-cj]").forEach(function (e) { c.conjuntos[e.getAttribute("data-arq-cj")] = !!e.checked; });
    if (c.jogo === "legal") c.conjuntos.executiva = false;   /* o jogo legal nunca leva a folha executiva, mesmo com a caixa marcada antes de trocar o jogo */
    return AQ().normalizarConfig(c);
  }
  /* trocou o jogo na tela: no legal a caixa da folha executiva fica desmarcada e travada; no executivo volta a poder ser marcada */
  function sincronizarExecutiva(raiz) {
    var j = raiz.querySelector('[data-arq="jogo"]'), cb = raiz.querySelector('[data-arq-cj="executiva"]');
    if (!j || !cb) return false;
    var legal = j.value === "legal"; if (legal) cb.checked = false; cb.disabled = legal;
    return legal;
  }
  function baixar(nome, dados, mime) {
    /* teste de 1 hora (js/testemodulo.js): entregável em teste sai com a marca; módulo vencido não sai */
    if (global.TesteModulo && TesteModulo.marcarArquivo) { var wT = TesteModulo.marcarArquivo(nome, dados, mime, ""); if (!wT) return false; nome = wT.nome; dados = wT.dados; }
    var d = global.document; if (!d) return false;
    try { var bl = new Blob([dados], { type: mime }), u = URL.createObjectURL(bl), a = d.createElement("a"); a.href = u; a.download = nome; d.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 5000); return true; } catch (e) { return false; }
  }
  function toast(t, k) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info"); } catch (e) { /* sem toast */ } }

  /* ------------------------------------------------------------ DWG (só no app instalado: o servidor local roda o dxf2dwg do LibreDWG; server/dwg.js) */
  var DWG_SO_NO_APP = "DWG só no app instalado; o DXF abre no AutoCAD (Salvar como → DWG).";
  function buscar() { return typeof global.fetch === "function" ? global.fetch.bind(global) : null; }
  /* TODA chamada ao servidor local tem prazo (AbortController): servidor travado não prende a tela. A geração tem 260 s (o servidor encerra em 240 s); status/preparar, 15 s. */
  function comPrazo(f, url, init, ms) {
    init = init || {};
    if (typeof global.AbortController !== "function") return f(url, init);
    var ac = new global.AbortController(), t = setTimeout(function () { try { ac.abort(); } catch (e) { /* já encerrada */ } }, ms);
    init.signal = ac.signal;
    return f(url, init).then(function (r) { clearTimeout(t); return r; }, function (e) { clearTimeout(t); throw e; });
  }
  /* o servidor local gera DWG? → Promise({ disponivel, motivo }). Navegador puro/PWA (sem /__dwg/gerar-status) → indisponível, nunca erro. */
  function sondarDwg(opc) {
    var f = (opc && opc.buscar) || buscar();
    if (!f) return Promise.resolve({ disponivel: false, motivo: DWG_SO_NO_APP });
    return comPrazo(f, "/__dwg/gerar-status", { cache: "no-store" }, 15000).then(function (r) { return r && r.ok ? r.json() : null; }).then(function (j) {
      if (j && j.disponivel === true) return { disponivel: true, conversor: j.conversor || "LibreDWG" };
      if (j && j.preparar === true) return { disponivel: true, preparar: true, conversor: "LibreDWG" };   /* ainda não baixado: baixa na 1ª vez, ao gerar */
      return { disponivel: false, motivo: DWG_SO_NO_APP, detalhe: j && j.motivo ? String(j.motivo) : "" };
    }, function () { return { disponivel: false, motivo: DWG_SO_NO_APP }; });
  }
  /* 1ª vez: o conversor ainda não foi baixado → pede ao servidor local (POST /__dwg/preparar) e espera ficar pronto, acompanhando /__dwg/gerar-status.
     opc.buscar / opc.espera / opc.limite (testes). → Promise({ ok:true } | { ok:false, erro }) */
  var DWG_PREPARANDO = "Preparando o conversor DWG (só na primeira vez, ~12 MB)…";
  function prepararDwg(opc) {
    opc = opc || {};
    var f = opc.buscar || buscar(); if (!f) return Promise.resolve({ ok: false, erro: DWG_SO_NO_APP });
    var espera = opc.espera === undefined ? 1500 : opc.espera, limite = opc.limite || 200;
    function status() { return comPrazo(f, "/__dwg/gerar-status", { cache: "no-store" }, 15000).then(function (r) { return r && r.ok ? r.json() : null; }); }
    function falha(j) { return { ok: false, erro: (j && j.motivo ? String(j.motivo) : "O conversor DWG não ficou pronto.") + " O DXF continua disponível e abre no AutoCAD." }; }
    return status().then(function (j) {
      if (j && j.disponivel === true) return { ok: true };
      if (!j || (!j.preparar && j.estado !== "baixando")) return falha(j);
      toast(DWG_PREPARANDO, "info");
      var inicio = j.estado === "baixando" ? Promise.resolve() : comPrazo(f, "/__dwg/preparar", { method: "POST" }, 15000);
      return inicio.then(function () {
        var n = 0;
        function volta() {
          return new Promise(function (r) { setTimeout(r, espera); }).then(status).then(function (s) {
            if (s && s.disponivel === true) return { ok: true };
            if (s && s.estado === "baixando" && ++n < limite) return volta();
            return falha(s);
          });
        }
        return volta();
      });
    }).then(null, function () { return { ok: false, erro: "Sem conexão com o servidor local para preparar o DWG. O DXF continua disponível e abre no AutoCAD." }; });
  }
  /* gera o DWG de r (o resultado de ArqPranchas.gerar): monta o DXF, manda ao servidor local, volta o ZIP com DWG + CTB + LEIA-ME.
     → Promise({ ok, zip (Uint8Array), nome, avisos } | { ok:false, erro }). opc.postar(dxfTexto) → Promise({ ok, bytes (Uint8Array) | erro }) troca o envio (testes). */
  function gerarDwg(r, opc) {
    opc = opc || {};
    var CD = dep("ArqCad", "./arqcad.js"), A = AQ();
    if (!CD || !A || !r || !r.ok) return Promise.resolve({ ok: false, erro: "Sem pranchas geradas para converter em DWG." });
    var base = A.nomeArquivo(r.cliente, r.jogo === "legal" ? "JOGO-LEGAL" : "JOGO-EXECUTIVO", r.revisao), o = null;
    try { o = CD.paraCad(r, { dxfNome: base + ".dxf", dwgNome: base + ".dwg" }); } catch (e) { return Promise.resolve({ ok: false, erro: "O arquivo CAD não montou: " + (e && e.message ? e.message : e) }); }
    if (!o) return Promise.resolve({ ok: false, erro: "O arquivo CAD não montou." });
    var postar = opc.postar || function (dxf) {
      var f = buscar(); if (!f) return Promise.resolve({ ok: false, erro: DWG_SO_NO_APP });
      return prepararDwg({ buscar: f }).then(function (pr) { return pr.ok ? enviarDxf(f, dxf) : pr; });
    };
    function enviarDxf(f, dxf) {
      return comPrazo(f, "/__dwg/gerar", { method: "POST", headers: { "Content-Type": "application/dxf" }, body: dxf }, 260000).then(function (resp) {
        if (!resp.ok) return resp.json().then(function (j) { return { ok: false, erro: (j && j.erro) || ("o conversor respondeu " + resp.status) }; }, function () { return { ok: false, erro: DWG_SO_NO_APP }; });
        return resp.arrayBuffer().then(function (ab) { return { ok: true, bytes: new Uint8Array(ab), avisos: +resp.headers.get("X-Avisos") || 0 }; });
      }, function () { return { ok: false, erro: DWG_SO_NO_APP }; });
    }
    return postar(o.dxfDwg || o.dxf).then(function (p) {
      if (!p || !p.ok || !p.bytes) return { ok: false, erro: (p && p.erro) || "O conversor não devolveu o DWG." };
      var b = p.bytes;
      if (b.length < 256 || String.fromCharCode(b[0], b[1], b[2], b[3], b[4], b[5]) !== "AC1015") return { ok: false, erro: "O conversor devolveu um arquivo que não é DWG." };
      var z = CD.zipDwg(o, b);
      return z ? { ok: true, zip: z, nome: base + "-DWG.zip", avisos: p.avisos || 0, dwg: b } : { ok: false, erro: "O ZIP do DWG não montou." };
    }, function (e) { return { ok: false, erro: "Falha ao converter em DWG: " + (e && e.message ? e.message : e) }; });
  }
  /* PENAS RA NO AUTOCAD: o AutoCAD procura o CTB na pasta Plot Styles do usuário, não ao lado do DWG. O servidor local (app instalado) copia para todas as versões; PWA/navegador: indisponível.
     → Promise({ ok, mensagem, instalados }). opc.postar(bytes, nome) → Promise({ ok, status, json }) troca o envio (testes). */
  var CTB_SO_NO_APP = "Instalar as penas no AutoCAD só funciona no app instalado; copie o .ctb do ZIP para a pasta Plot Styles (comando STYLESMANAGER no AutoCAD).";
  function instalarCtbNoAutoCad(r, opc) {
    opc = opc || {};
    var CD = dep("ArqCad", "./arqcad.js");
    if (!CD || !r || !r.ok) return Promise.resolve({ ok: false, mensagem: "Gere as pranchas uma vez antes (as penas saem dessa geração)." });
    var o = null; try { o = CD.paraCad(r, { dxfNome: "x.dxf" }); } catch (e) { o = null; }
    if (!o || !o.ctb) return Promise.resolve({ ok: false, mensagem: "O plot style (CTB) não montou." });
    var postar = opc.postar || function (bytes, nome) {
      var f = buscar(); if (!f) return Promise.resolve({ ok: false, status: 0, json: null });
      return comPrazo(f, "/__dwg/instalar-ctb", { method: "POST", headers: { "Content-Type": "application/octet-stream", "X-Ctb-Nome": encodeURIComponent(nome) }, body: bytes }, 20000)
        .then(function (resp) { return resp.json().then(function (j) { return { ok: resp.ok, status: resp.status, json: j }; }, function () { return { ok: false, status: resp.status, json: null }; }); }, function () { return { ok: false, status: 0, json: null }; });
    };
    return postar(o.ctb, o.ctbNome).then(function (p) {
      var j = p && p.json;
      if (!j) return { ok: false, mensagem: CTB_SO_NO_APP };
      if (!j.ok) return { ok: false, mensagem: String(j.erro || CTB_SO_NO_APP) };
      var rot = { novo: "instalado", igual: "já estava", atualizado: "atualizado (o seu estava diferente: ficou cópia .bak)", erro: "falhou" };
      var lista = (j.instalados || []).map(function (i) { return i.versao + " — " + (rot[i.acao] || i.acao); });
      return { ok: true, instalados: j.instalados || [], mensagem: "Penas RA (" + o.ctbNome + "): " + lista.join("; ") + ". Feche e abra o DWG de novo." };
    });
  }
  /* liga a opção DWG da tela: habilita só se o servidor local gera DWG; senão desabilita e explica */
  function ligarDwgNaTela(raiz) {
    if (!raiz || !raiz.querySelector) return Promise.resolve(null);
    var cb = raiz.querySelector('[data-arq-out="dwg"]'), av = raiz.querySelector('[data-arq="dwg-aviso"]');
    return sondarDwg().then(function (s) {
      if (cb) { cb.disabled = !s.disponivel; cb.checked = false; }
      if (av) av.textContent = s.disponivel && s.preparar ? "Na primeira vez o OrcaPRO baixa o conversor DWG (~12 MB, uma só vez) e depois gera. Sem internet, use o DXF." : s.disponivel ? "Gera o DWG neste computador (" + s.conversor + "). Leva alguns segundos." : s.motivo;
      return s;
    });
  }

  /* ------------------------------------------------------------ gerar */
  /* o nome do PDF/DXF ÚNICO (o de sempre); os por folha e o ZIP levam PE_<CLIENTE>_<PRANCHA>_RXX */
  function nomeUnico(r) { return (r.prefixo || "ARQ") + "-" + (r.revisao || "R00") + (r.jogo === "legal" ? " projeto legal" : " projeto de arquitetura"); }
  function gerar(ctx, cfg, saida) {
    var A = AQ(); saida = saida || { pdf: true, dxf: true, abas: true };
    if (!A) return { ok: false, avisos: ["js/arqpranchas.js não carregou."] };
    if (!ctx || !ctx.modelo || !ctx.modelo.estado) return { ok: false, avisos: ["Abra o modelo da obra no BIM: sem modelo não há o que apresentar."] };
    var c = A.normalizarConfig(cfg), r = A.gerar(ctx.modelo, opcoesDe(ctx, c));
    ULTIMO.r = r; ULTIMO.ctx = ctx; ULTIMO.cfg = c;
    if (!r || !r.ok) return r || { ok: false, avisos: [] };
    gravarMemoria(ctx.obraKey, c);
    var nome = nomeUnico(r);
    r.arquivos = [];
    if (saida.pdf) { var pdf = A.exportar(r, "pdf"); if (pdf && baixar(nome + ".pdf", pdf, "application/pdf")) r.arquivos.push(nome + ".pdf"); }
    if (saida.dxf) { var dxf = A.exportar(r, "dxf"); if (dxf && baixar(nome + ".dxf", dxf, "application/dxf")) r.arquivos.push(nome + ".dxf"); }
    if (saida.cad) { var cad = A.exportar(r, "cad"), nc = A.nomeArquivo(r.cliente, r.jogo === "legal" ? "JOGO-LEGAL" : "JOGO-EXECUTIVO", r.revisao) + "-CAD.zip"; if (cad && baixar(nc, cad, "application/zip")) r.arquivos.push(nc); }
    if (saida.dwg) {   /* assíncrono: o servidor local converte; a promessa fica em r.dwgPromessa (o r volta já com o resto) */
      r.dwgPromessa = gerarDwg(r, { postar: saida.dwgPostar }).then(function (d) {
        if (d.ok && baixar(d.nome, d.zip, "application/zip")) { r.arquivos.push(d.nome); toast("DWG gerado: " + d.nome + (d.avisos ? " · " + d.avisos + " aviso(s) do conversor" : ""), d.avisos ? "aviso" : "ok"); }
        else toast("DWG não saiu: " + (d.erro || "falha ao baixar") + (/DWG só no app/.test(d.erro || "") ? "" : " O DXF continua disponível e abre no AutoCAD."), "aviso");
        return d;
      });
    }
    /* um PDF por folha e o ZIP delas: PE_<CLIENTE>_<PRANCHA>_RXX (cliente do cadastro da obra; revisão da obra, R00 se não houver) */
    if (saida.pdfFolhas) A.arquivosPorFolha(r).forEach(function (a) { if (baixar(a.nome, a.dados, "application/pdf")) r.arquivos.push(a.nome); });
    if (saida.zip) { var zip = A.zipDasFolhas(r), nz = A.nomeArquivo(r.cliente, r.jogo === "legal" ? "JOGO-LEGAL" : "JOGO-EXECUTIVO", r.revisao) + ".zip"; if (zip && baixar(nz, zip, "application/zip")) r.arquivos.push(nz); }
    if (saida.abas) r.abas = abrirNasAbas(r, ctx);
    return r;
  }
  /* CADERNO EXECUTIVO (A3, uma página por assunto — js/arqcaderno.js): gera e baixa o PDF; o nome é PE_<CLIENTE>_<CONTEÚDO>_R<nn> */
  function gerarCaderno(ctx, cfg, versao) {
    var C = AC(); if (!C) return { ok: false, avisos: ["js/arqcaderno.js não carregou."] };
    if (!ctx || !ctx.modelo || !ctx.modelo.estado) return { ok: false, avisos: ["Abra o modelo da obra no BIM: sem modelo não há o que apresentar."] };
    var c = AQ().normalizarConfig(cfg), o = opcoesDe(ctx, c);
    if (ctx.obra && ctx.obra.paleta && typeof ctx.obra.paleta === "object") o.paleta = ctx.obra.paleta;   /* a cor do template é a PALETA DA OBRA (cadastro) */
    o.versao = versao === "cliente" ? "cliente" : "completa";
    var r = C.gerar(ctx.modelo, o);
    if (!r || !r.ok) return r || { ok: false, avisos: [] };
    r.arquivos = [];
    var pdf = C.exportar(r, "pdf"); if (pdf && baixar(r.nomeArquivo + ".pdf", pdf, "application/pdf")) r.arquivos.push(r.nomeArquivo + ".pdf");
    ULTIMO.caderno = r;
    return r;
  }
  /* o que o caderno de interiores fez, em uma frase (nunca silencioso: desligado, sem folha e o porquê, ou N folhas) */
  function resumoInteriores(r, c) {
    var fl = arr(r && r.folhas).filter(function (f) { return /^int-/.test(String(f.tipo || "")); }), av = arr(r && r.avisos).filter(function (a) { return /^Caderno de interiores/.test(String(a)); });
    if (!(c && c.interiores && c.interiores.ativo)) return "Caderno de interiores DESLIGADO (marque \"Gerar o caderno de interiores\") · ";
    if (!fl.length) return "Caderno de interiores SEM FOLHA: " + (av[0] || "veja os avisos") + " · ";
    return "Caderno de interiores: " + fl.length + " folha(s)" + (av.length ? " (" + av.length + " ambiente(s) com aviso)" : "") + " · ";
  }
  /* as folhas nas ABAS DE FOLHA do BIM: um registro só por obra (o Gerar de novo SUBSTITUI as folhas — idempotente) */
  function abrirNasAbas(r, ctx) {
    var BF = global.BimFolhaUI; if (!BF || !BF.salvarRegistro || !global.Store) return null;
    var regs = []; try { regs = arr(BF.registros()); } catch (e) { regs = []; }
    var exist = regs.filter(function (x) { return x && x.origem === "arq" && String(x.obraId || "") === String((ctx && ctx.obraId) || ""); })[0] || null;
    var salvo = BF.salvarRegistro(registroFolhas(r, exist, ctx && ctx.obraId != null ? ctx.obraId : (ctx && ctx.obraKey)));
    if (!salvo) return null;
    BF._imagensExternas = BF._imagensExternas || {};
    r.folhas.forEach(function (f) { BF._imagensExternas["arqsvg:" + f.id] = dataUrlSvg(f.svg); });
    var id = BF.idFolha(salvo.id, "arq-" + r.folhas[0].id);
    try { if (BF.ativo && BF.ativo()) BF.abrir(id); } catch (e) { /* sem a casca do BIM: fica no registro */ }
    return { registro: salvo.id, primeira: id, folhas: r.folhas.length };
  }

  /* ------------------------------------------------------------ ARRANJO: mover bloco, soltar, reorganizar (js/arqdiagrama.js) */
  /* o usuário move um bloco de folha ou de posição (x, y em mm da área útil): ele fica FIXADO e o resto é re-empacotado em volta */
  function moverBloco(ctx, cfg, id, destino, saida) {
    var c = AQ().normalizarConfig(cfg), r0 = ULTIMO.r;
    c.fixos = c.fixos || {};
    c.fixos[id] = { folha: Math.max(1, Math.round(+destino.folha || 1)), x: +destino.x || 0, y: +destino.y || 0 };
    if (r0 && r0.diagrama && r0.diagrama.formato) c.arranjoFormato = r0.diagrama.formato;
    return gerar(ctx, c, saida || { pdf: false, dxf: false, abas: true });
  }
  function soltarBloco(ctx, cfg, id, saida) { var c = AQ().normalizarConfig(cfg); delete c.fixos[id]; return gerar(ctx, c, saida || { pdf: false, dxf: false, abas: true }); }
  /* "Reorganizar": solta tudo e refaz o arranjo automático */
  function reorganizar(ctx, cfg, saida) { var c = AQ().normalizarConfig(cfg); c.fixos = {}; c.arranjoFormato = null; return gerar(ctx, c, saida || { pdf: false, dxf: false, abas: true }); }
  function htmlArranjo(r, cfg) {
    var d = r && r.diagrama, h = '<div data-arq="arranjo" style="font-size:12.5px"><div class="muted">Formato ' + esc(d ? d.formato : "") + " · ocupação média " + (d ? Math.round(d.ocupacaoMedia * 100) : 0) + ' % · x e y em mm a partir do canto da área útil da folha. Bloco marcado "fixar" fica onde você pôs; o resto se re-organiza.</div><table style="width:100%;margin-top:6px"><tr><th align="left">Desenho</th><th>Folha</th><th>X</th><th>Y</th><th>Fixar</th></tr>';
    arr(d && d.folhas).forEach(function (f, i) {
      arr(f.blocos).forEach(function (b) {
        h += '<tr data-arq-bloco="' + esc(b.id) + '"><td>' + esc(b.titulo || b.id) + ' <span class="muted">(' + esc(f.numero) + ")</span></td>" +
          '<td><input data-k="folha" value="' + (i + 1) + '" size="3"></td><td><input data-k="x" value="' + Math.round(b.x) + '" size="5"></td><td><input data-k="y" value="' + Math.round(b.y) + '" size="5"></td>' +
          '<td><input type="checkbox" data-k="fixo"' + (b.fixo || (cfg.fixos && cfg.fixos[b.id]) ? " checked" : "") + "></td></tr>";
      });
    });
    return h + "</table></div>";
  }
  function fixosDaTela(raiz) {
    var f = {};
    Array.prototype.forEach.call(raiz.querySelectorAll("[data-arq-bloco]"), function (tr) {
      var v = function (k) { return tr.querySelector('[data-k="' + k + '"]'); };
      if (v("fixo") && v("fixo").checked) f[tr.getAttribute("data-arq-bloco")] = { folha: +v("folha").value, x: +v("x").value, y: +v("y").value };
    });
    return f;
  }
  /* a tela "Arranjo das folhas": move blocos de folha/posição e reorganiza (também aberta pelo menu da folha do BIM) */
  /* ------------------------------------------------------------ O EDITOR DE FOLHAS (js/folhaseditor.js + js/folhaseditorui.js) ligado à arquitetura */
  /* o conjunto do editor = o diagrama da geração (folhas da série ARQ com formato e blocos). id da folha = o número dela (ARQ-01…); o do bloco = o do gerador */
  function conjuntoDoDiagrama(r) {
    var d = r && r.diagrama, out = { versao: 1, folhas: [] }, cont = {};
    arr(d && d.folhas).forEach(function (f) { arr(f.blocos).forEach(function (b) { var t = b.titulo || b.id; cont[t] = (cont[t] || 0) + 1; }); });
    arr(d && d.folhas).forEach(function (f, i) {
      var fo = arr(r.folhas).filter(function (x) { return x.numero === f.numero; })[0] || {};
      out.folhas.push({ id: f.numero, titulo: fo.titulo || "", formato: f.formato || (d && d.formato) || "A1", orientacao: "paisagem",
        blocos: arr(f.blocos).map(function (b) { return { id: b.id, desenho: cont[b.titulo || b.id] > 1 ? (b.titulo || b.id) + " (" + (String(b.id).indexOf(":") >= 0 ? String(b.id).split(":").slice(1).join(":") : String(b.id)) + ")" : (b.titulo || b.id), x: b.x, y: b.y, w: b.w, h: b.h, escala: "", fixo: !!b.fixo }; }) });
    });
    return out;
  }
  /* a geometria do carimbo RA: área útil, papel e o retângulo do carimbo (para a tela desenhar o papel e para o motor saber onde o carimbo está) */
  function areaDeFormato(fmt, ori) {
    var P = PRN(), g = P && P.geometria ? P.geometria(fmt, ori === "retrato" ? "retrato" : "paisagem", "RA") : null;
    if (!g) return { w: 300, h: 200 };
    return { w: g.area.w, h: g.area.h, papel: { w: g.papel.w, h: g.papel.h, x: g.area.x, y: g.area.y }, carimboPapel: g.carimbo ? { x: g.carimbo.x, y: g.carimbo.y, w: g.carimbo.w, h: g.carimbo.h } : null };
  }
  function miniaturasDe(r) { var m = {}; arr(r && r.folhas).forEach(function (f) { if (f.svg) m[f.numero] = dataUrlSvg(f.svg); }); return m; }
  /* o que o editor devolve vira configuração da obra (fixos, formatosFolha, arranjoFormato) e é respeitado na geração seguinte. Os fixos do caderno de interiores (int:…) não são do editor: ficam */
  function aplicarConfigDoEditor(cfg, conf) {
    var c = AQ().normalizarConfig(cfg), novos = {};
    Object.keys(c.fixos || {}).forEach(function (k) { if (/^int:/.test(k)) novos[k] = c.fixos[k]; });
    Object.keys(conf.fixos || {}).forEach(function (k) { novos[k] = conf.fixos[k]; });
    c.fixos = novos; c.formatosFolha = conf.formatosFolha || {}; c.arranjoFormato = conf.arranjoFormato || null;
    return AQ().normalizarConfig(c);
  }
  /* salvar = gravar a configuração da obra e REGERAR (a tela passa a mostrar o que o gerador de fato fez: idempotente) */
  function salvarDoEditor(ctx, resEd, saida) {
    var c = aplicarConfigDoEditor(ULTIMO.cfg || lerMemoria(ctx.obraKey), resEd.config);
    var r2 = gerar(ctx, c, saida || { pdf: false, dxf: false, abas: true });
    if (!r2 || !r2.ok) { toast("Não regerei as folhas: " + arr(r2 && r2.avisos).join(" "), "aviso"); return false; }
    return { conjunto: conjuntoDoDiagrama(r2), miniaturas: miniaturasDe(r2), r: r2 };
  }
  function abrirEditor(ctx) {
    var FU = FEUI(), r0 = ULTIMO.r;
    ctx = ctx || ULTIMO.ctx || ctxAtual();
    if (!FU || !FU.abrir) return false;
    if (!ctx || !ctx.modelo) { toast("Abra o modelo da obra no BIM antes de editar as folhas.", "aviso"); return false; }
    if (!r0 || !r0.diagrama) { r0 = gerar(ctx, lerMemoria(ctx.obraKey), { pdf: false, dxf: false, abas: false }); }
    if (!r0 || !r0.ok || !r0.diagrama) { toast("Não consegui gerar as pranchas para abrir o editor: " + arr(r0 && r0.avisos).join(" "), "aviso"); return false; }
    var cfg = ULTIMO.cfg || lerMemoria(ctx.obraKey);
    var ctrl = FU.abrir({
      titulo: "Editor de folhas — arquitetura", conjunto: conjuntoDoDiagrama(r0), areaDe: areaDeFormato, formatoBase: (r0.diagrama && r0.diagrama.formato) || "A1", miniaturas: miniaturasDe(r0),
      onSalvar: function (res) { return salvarDoEditor(ctx, res); },
      onPDF: function (res) {
        var s = salvarDoEditor(ctx, res, { pdf: false, dxf: false, abas: true }); if (!s) return;
        var pdf = AQ().exportar(s.r, "pdf"), nome = (s.r.prefixo || "ARQ") + "-" + (s.r.revisao || "R00") + " projeto de arquitetura";
        if (pdf && baixar(nome + ".pdf", pdf, "application/pdf")) toast("PDF gerado com o arranjo salvo: " + nome + ".pdf", "ok"); else toast("O PDF não saiu.", "aviso");
      },
      onReorganizar: function () { var c = AQ().normalizarConfig(ULTIMO.cfg || cfg); c.fixos = {}; c.formatosFolha = {}; c.arranjoFormato = null; var r2 = gerar(ctx, c, { pdf: false, dxf: false, abas: false }); return r2 && r2.ok ? conjuntoDoDiagrama(r2) : null; }
    });
    return !!ctrl;
  }
  function abrirArranjo(ctx) {
    if (FEUI() && FEUI().abrir) return abrirEditor(ctx);
    return abrirArranjoTabela(ctx);
  }
  /* o arranjo antigo (tabela de números): plano B se o editor não carregou */
  function abrirArranjoTabela(ctx) {
    var U = global.UI; if (!U || !U.modal) return false;
    ctx = ctx || ULTIMO.ctx || ctxAtual();
    var r = ULTIMO.r; if (!r || !r.diagrama) { toast("Gere as pranchas de arquitetura primeiro: o arranjo sai delas.", "aviso"); return false; }
    var cfg = ULTIMO.cfg || lerMemoria(ctx.obraKey);
    U.modal("Arranjo das folhas de arquitetura", htmlArranjo(r, cfg), [
      { texto: "Fechar", classe: "ghost", onClick: function () { U.fecharModal(); } },
      { texto: "Reorganizar", onClick: function () { var r2 = reorganizar(ctx, cfg); U.fecharModal(); toast("Arranjo refeito: " + (r2 && r2.folhas ? r2.folhas.length : 0) + " folha(s).", "ok"); } },
      { texto: "Aplicar", classe: "primary", onClick: function () {
        var raiz = global.document.querySelector('[data-arq="arranjo"]').parentNode, c = AQ().normalizarConfig(cfg); c.fixos = fixosDaTela(raiz); c.arranjoFormato = r.diagrama.formato;
        var r2 = gerar(ctx, c, { pdf: false, dxf: false, abas: true }); U.fecharModal(); toast("Arranjo aplicado: " + (r2 && r2.folhas ? r2.folhas.length : 0) + " folha(s).", "ok");
      } }
    ]);
    return true;
  }
  /* o contexto da tela a partir do que está aberto */
  function ctxAtual() {
    var B = global.BIM, st = null; try { st = B && B.editarEstado ? B.editarEstado() : null; } catch (e) { st = null; }
    var em = {}, ob = {}, logo = null, G = global.Gestao, pavs = [];
    try { if (global.Empresa && global.Empresa.dados) em = global.Empresa.dados() || {}; if (global.Empresa && global.Empresa.logo) logo = global.Empresa.logo(); } catch (e1) { /* sem empresa */ }
    try { if (G && G._bimSel && global.Store && global.Auth) ob = global.Store.obter(global.Auth.empresaId(), "obras", G._bimSel) || {}; } catch (e2) { /* sem obra */ }
    try { arr(global.BimEdit && global.BimEdit.niveisAtuais ? global.BimEdit.niveisAtuais() : []).forEach(function (n) { if (n && isFinite(n.elevacao) && !/terreno|funda|sondag|cobertura|telhado/i.test(n.nome || "")) pavs.push({ nome: n.nome || "Nível", cota: n.elevacao }); }); } catch (e3) { /* sem níveis */ }
    return { modelo: st ? { estado: st.estado, ops: (B.editarOps ? B.editarOps() : null), avaliarFam: function (f, t, i) { return B.familiaAvaliar(f, t, i); } } : null, pavimentos: pavs, empresa: em, obra: ob, logo: logo,
             obraKey: String((G && G._bimSel) || "geral"), obraId: String((G && G._bimSel) || "") };
  }
  function abrir(ctx) {
    var U = global.UI; if (!U || !U.modal) return false;
    ctx = ctx || ctxAtual();
    if (!ctx.modelo) { toast("Abra o modelo da obra no BIM antes de gerar as pranchas de arquitetura.", "aviso"); return false; }
    var cfg = lerMemoria(ctx.obraKey);
    U.modal("Gerar pranchas de arquitetura — reforma e ampliação", html(ctx, cfg), [
      { texto: "Cancelar", classe: "ghost", onClick: function () { U.fecharModal(); } },
      { texto: "Arranjo…", classe: "ghost", onClick: function () { U.fecharModal(); abrirArranjo(ctx); } },
      { texto: "Caderno executivo (A3)", classe: "ghost", onClick: function () {
        var raiz = global.document.querySelector('[data-arq="tela"]').parentNode, c = configDaTela(raiz, cfg), msg = raiz.querySelector('[data-arq="msg"]'), r = null;
        try { r = gerarCaderno(ctx, c, "completa"); } catch (e) { r = { ok: false, avisos: [e && e.message ? e.message : String(e)] }; }
        if (!r || !r.ok) { if (msg) msg.textContent = "O caderno não saiu: " + arr(r && r.avisos).join(" "); return; }
        U.fecharModal(); var v = r.verificacao || {};
        toast("Caderno executivo: " + r.paginas.length + " página(s) A3 · " + (r.arquivos[0] || "PDF não baixado") + " · sobreposição " + v.total + (arr(r.avisos).length ? " · " + r.avisos.length + " aviso(s)" : ""), v.total ? "aviso" : "ok");
      } },
      { texto: "Padrão", onClick: function () { gravarMemoria(ctx.obraKey, AQ().configPadrao()); U.fecharModal(); abrir(ctx); } },
      { texto: "Gerar pranchas", classe: "primary", onClick: function () {
        var raiz = global.document.querySelector('[data-arq="tela"]').parentNode, c = configDaTela(raiz, cfg), msg = raiz.querySelector('[data-arq="msg"]');
        var sa = {}; Array.prototype.forEach.call(raiz.querySelectorAll("[data-arq-out]"), function (e) { sa[e.getAttribute("data-arq-out")] = !!e.checked; });
        var r = null; try { r = gerar(ctx, c, sa); } catch (e) { r = { ok: false, avisos: [e && e.message ? e.message : String(e)] }; }
        if (!r || !r.ok) { if (msg) msg.textContent = "Não gerou: " + arr(r && r.avisos).join(" "); return; }
        U.fecharModal();
        var v = r.verificacao || {};
        if (r.diagrama && FEUI() && FEUI().abrir) setTimeout(function () { abrirEditor(ctx); }, 0);   /* o fim de "Gerar pranchas" abre o editor com o resultado (a tela do toast continua) */
        toast(resumoInteriores(r, c) + r.folhas.length + " folha(s) de arquitetura · sobreposição: texto×texto " + v.textoTexto + ", texto×linha " + v.textoLinha + ", fora da moldura " + v.foraJanela + (arr(r.avisos).length ? " · " + r.avisos.length + " aviso(s)" : ""), v.total ? "aviso" : "ok");
      } }
    ]);
    /* a opção DWG só liga se o servidor local do app instalado gera DWG (navegador puro/PWA: desabilitada, com o motivo) */
    try { var rzD = global.document.querySelector('[data-arq="tela"]'); ligarDwgNaTela(rzD && rzD.parentNode); } catch (eD) { /* sem DOM */ }
    try {
      var rzJ = global.document.querySelector('[data-arq="tela"]'), sj = rzJ && rzJ.parentNode && rzJ.parentNode.querySelector('[data-arq="jogo"]');
      if (sj) sj.addEventListener('change', function () { sincronizarExecutiva(rzJ.parentNode); });
    } catch (eJ) { /* sem DOM */ }
    try {
      var rzC = global.document.querySelector('[data-arq="tela"]'), bC = rzC && rzC.parentNode && rzC.parentNode.querySelector('[data-arq="instalar-ctb"]'), mC = rzC && rzC.parentNode && rzC.parentNode.querySelector('[data-arq="ctb-msg"]');
      if (bC) bC.addEventListener('click', function () { bC.disabled = true; instalarCtbNoAutoCad(ULTIMO.r).then(function (x) { bC.disabled = false; if (mC) mC.textContent = x.mensagem; toast(x.mensagem, x.ok ? 'ok' : 'aviso'); }); });
    } catch (eC) { /* sem DOM */ }
    return true;
  }

  var ArqPranchasUI = { abrir: abrir, gerar: gerar, gerarDwg: gerarDwg, sondarDwg: sondarDwg, prepararDwg: prepararDwg, instalarCtbNoAutoCad: instalarCtbNoAutoCad, DWG_SO_NO_APP: DWG_SO_NO_APP, gerarCaderno: gerarCaderno, abrirArranjo: abrirArranjo, abrirEditor: abrirEditor, abrirArranjoTabela: abrirArranjoTabela, moverBloco: moverBloco, soltarBloco: soltarBloco, reorganizar: reorganizar, ultimo: function () { return ULTIMO; },
    _int: { html: html, sincronizarExecutiva: sincronizarExecutiva, ligarDwgNaTela: ligarDwgNaTela,  conjuntoDoDiagrama: conjuntoDoDiagrama, areaDeFormato: areaDeFormato, aplicarConfigDoEditor: aplicarConfigDoEditor, salvarDoEditor: salvarDoEditor, resumoInteriores: resumoInteriores, chave: chave, lerMemoria: lerMemoria, gravarMemoria: gravarMemoria, opcoesDe: opcoesDe, registroFolhas: registroFolhas, configDaTela: configDaTela, html: html, ctxAtual: ctxAtual, abrirNasAbas: abrirNasAbas } };
  global.ArqPranchasUI = ArqPranchasUI;
  if (typeof module !== "undefined" && module.exports) module.exports = ArqPranchasUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
