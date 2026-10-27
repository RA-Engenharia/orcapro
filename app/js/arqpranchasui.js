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
  function IX() { return dep("ArqIndices", "./arqindices.js"); }
  function INT() { return dep("ArqInteriores", "./arqinteriores.js"); }
  function MD() { return dep("ArqModelo", "./arqmodelo.js"); }
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
    return AQ().normalizarConfig(v || {});
  }
  function gravarMemoria(obraKey, cfg, ls) {
    var L = ls || (global.localStorage || null);
    try { if (L) L.setItem(chave(obraKey), JSON.stringify(AQ().normalizarConfig(cfg))); return true; } catch (e) { return false; }
  }
  /* o objeto de opções do ArqPranchas.gerar: a configuração + o CARIMBO (empresa, RT, obra) */
  function opcoesDe(ctx, cfg) {
    var em = (ctx && ctx.empresa) || {}, ob = (ctx && ctx.obra) || {}, c = AQ().normalizarConfig(cfg);
    var o = { pavimentos: arr(ctx && ctx.pavimentos), formato: c.formato, escala: c.escala, prefixo: c.prefixo, revisao: c.revisao, descricaoRevisao: c.descricaoRevisao, conjuntos: c.conjuntos,
      arranjo: c.arranjo, fixos: c.fixos, arranjoFormato: c.arranjoFormato, interiores: c.interiores, municipio: c.municipio, limites: c.limites, rua: c.rua, cotasInternas: c.cotasInternas, beiralNaProjecao: c.beiralNaProjecao, fatores: c.fatores,
      empresa: em.nome ? em : "", responsavel: txt(em.responsavel), registro: txt(em.crea), tituloProfissional: txt(em.titulo),
      obra: txt(ob.nome), proprietario: txt(ob.clienteNome), contratante: txt(ob.clienteNome), local: txt(ob.local || ob.endereco), logo: (ctx && ctx.logo) || null };
    if (ctx && ctx.contornoLote) o.contornoLote = ctx.contornoLote;
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
    var I = INT(), M = MD(), lista = [], sel = cfg.interiores && Array.isArray(cfg.interiores.ambientes) ? cfg.interiores.ambientes.map(String) : null;
    try { if (I && M && ctx && ctx.modelo) lista = I.listarAmbientes(M.extrair(ctx.modelo, { pavimentos: ctx.pavimentos })); } catch (e) { lista = []; }
    if (!lista.length) return '<span class="muted" style="font-size:12px">Nenhum ambiente com mobiliário ou marcenaria no modelo.</span>';
    return lista.map(function (a) {
      var on = sel ? sel.indexOf(String(a.id)) >= 0 : a.padrao;
      return '<label style="display:block"><input type="checkbox" data-arq-int-amb="' + esc(a.id) + '"' + marcado(on) + "> " + esc(a.nome) + ' <span class="muted">(' + a.nMoveis + " móvel(is), " + a.nMarcenaria + " de marcenaria)</span></label>";
    }).join("");
  }
  var ROTULO_FOLHA = { planta: "Planta de móveis (marcadores de vista e de corte)", vistas: "Vistas dos móveis 1:25 (notas de material)", cortes: "Cortes 1:20 da marcenaria", eletrico: "Elétrico (planta e vistas com a altura dos pontos)",
    luminotecnico: "Luminotécnico (planta, legenda e o detalhe 1:10 da sanca, se houver)", pedras: "Pedras (folha geral: bancadas)", imagens: "00 Imagens ilustrativas (espaço para os renders)" };
  function folhasInt(cfg) {
    var I = INT(), fl = I && I.flagsDe ? I.flagsDe(cfg.interiores) : {};
    return Object.keys(ROTULO_FOLHA).map(function (k) { return '<label style="display:block;margin-left:12px"><input type="checkbox" data-arq-int-f="' + k + '"' + marcado(fl[k]) + "> " + esc(ROTULO_FOLHA[k]) + "</label>"; }).join("");
  }
  function html(ctx, cfg) {
    var A = AQ(), em = ctx.empresa || {}, ob = ctx.obra || {}, L = cfg.limites || {}, mun = IX().MUNICIPIOS;
    var h = '<div data-arq="tela" data-modal-largo="1" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;font-size:13px">';
    h += '<fieldset style="border:1px solid var(--linha);border-radius:var(--raio-sm);padding:8px"><legend><b>Folha e escala</b></legend>' +
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
      A.CONJUNTOS.map(function (k) { return '<label style="display:block"><input type="checkbox" data-arq-cj="' + k + '"' + marcado(cfg.conjuntos[k] !== false) + "> " + esc(A.ROTULO_CONJUNTO[k]) + "</label>"; }).join("") + "</fieldset>";
    h += '<fieldset style="border:1px solid var(--linha);border-radius:var(--raio-sm);padding:8px"><legend><b>Carimbo e saída</b></legend>' +
      '<div class="muted" style="font-size:12px">Carimbo RA com o cadastro da empresa e da obra:<br>' + esc(em.nome || "(empresa sem nome no cadastro)") + " · RT " + esc(em.responsavel || "—") + " " + esc(em.crea || "") + "<br>Obra: " + esc(ob.nome || "(sem obra selecionada)") + "</div>" +
      '<label style="display:block"><input type="checkbox" data-arq-out="pdf" checked> PDF vetorial</label><label style="display:block"><input type="checkbox" data-arq-out="dxf" checked> DXF com carimbo</label>' +
      '<label style="display:block"><input type="checkbox" data-arq-out="abas" checked> Abrir nas abas de folha do BIM</label></fieldset>';
    h += '<fieldset style="border:1px solid var(--linha);border-radius:var(--raio-sm);padding:8px"><legend><b>Caderno de interiores</b></legend>' +
      '<label style="display:block"><input type="checkbox" data-arq-int="ativo"' + marcado(cfg.interiores && cfg.interiores.ativo) + "> Gerar o caderno de interiores (planta de móveis + vistas por ambiente, folhas A3)</label>" +
      '<div class="muted" style="font-size:12px;margin:4px 0">Ambientes (marcados: os que têm mobiliário ou marcenaria):</div>' + ambientesInt(ctx, cfg) +
      '<div class="muted" style="font-size:12px;margin:6px 0 2px">Folhas de cada ambiente:</div>' + folhasInt(cfg) + "</fieldset>";
    return h + '</div><div data-arq="msg" class="muted" style="margin-top:8px;font-size:12.5px"></div>';
  }
  /* lê a tela → configuração (puro sobre um "leitor" de elementos; no navegador é o document) */
  function configDaTela(raiz, base) {
    var c = clone(base), q = function (s) { return raiz.querySelector(s); }, qa = function (s) { return Array.prototype.slice.call(raiz.querySelectorAll(s)); };
    function v(k) { var e = q('[data-arq="' + k + '"]'); return e ? e.value : null; }
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
    return AQ().normalizarConfig(c);
  }
  function baixar(nome, dados, mime) {
    /* teste de 1 hora (js/testemodulo.js): entregável em teste sai com a marca; módulo vencido não sai */
    if (global.TesteModulo && TesteModulo.marcarArquivo) { var wT = TesteModulo.marcarArquivo(nome, dados, mime, ""); if (!wT) return false; nome = wT.nome; dados = wT.dados; }
    var d = global.document; if (!d) return false;
    try { var bl = new Blob([dados], { type: mime }), u = URL.createObjectURL(bl), a = d.createElement("a"); a.href = u; a.download = nome; d.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 5000); return true; } catch (e) { return false; }
  }
  function toast(t, k) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info"); } catch (e) { /* sem toast */ } }

  /* ------------------------------------------------------------ gerar */
  function gerar(ctx, cfg, saida) {
    var A = AQ(); saida = saida || { pdf: true, dxf: true, abas: true };
    if (!A) return { ok: false, avisos: ["js/arqpranchas.js não carregou."] };
    if (!ctx || !ctx.modelo || !ctx.modelo.estado) return { ok: false, avisos: ["Abra o modelo da obra no BIM: sem modelo não há o que apresentar."] };
    var c = A.normalizarConfig(cfg), r = A.gerar(ctx.modelo, opcoesDe(ctx, c));
    ULTIMO.r = r; ULTIMO.ctx = ctx; ULTIMO.cfg = c;
    if (!r || !r.ok) return r || { ok: false, avisos: [] };
    gravarMemoria(ctx.obraKey, c);
    var nome = (r.prefixo || "ARQ") + "-" + (r.revisao || "R00") + " projeto de arquitetura";
    r.arquivos = [];
    if (saida.pdf) { var pdf = A.exportar(r, "pdf"); if (pdf && baixar(nome + ".pdf", pdf, "application/pdf")) r.arquivos.push(nome + ".pdf"); }
    if (saida.dxf) { var dxf = A.exportar(r, "dxf"); if (dxf && baixar(nome + ".dxf", dxf, "application/dxf")) r.arquivos.push(nome + ".dxf"); }
    if (saida.abas) r.abas = abrirNasAbas(r, ctx);
    return r;
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
  function abrirArranjo(ctx) {
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
      { texto: "Padrão", onClick: function () { gravarMemoria(ctx.obraKey, AQ().configPadrao()); U.fecharModal(); abrir(ctx); } },
      { texto: "Gerar pranchas", classe: "primary", onClick: function () {
        var raiz = global.document.querySelector('[data-arq="tela"]').parentNode, c = configDaTela(raiz, cfg), msg = raiz.querySelector('[data-arq="msg"]');
        var sa = {}; Array.prototype.forEach.call(raiz.querySelectorAll("[data-arq-out]"), function (e) { sa[e.getAttribute("data-arq-out")] = !!e.checked; });
        var r = null; try { r = gerar(ctx, c, sa); } catch (e) { r = { ok: false, avisos: [e && e.message ? e.message : String(e)] }; }
        if (!r || !r.ok) { if (msg) msg.textContent = "Não gerou: " + arr(r && r.avisos).join(" "); return; }
        U.fecharModal();
        var v = r.verificacao || {};
        toast(r.folhas.length + " folha(s) de arquitetura · sobreposição: texto×texto " + v.textoTexto + ", texto×linha " + v.textoLinha + ", fora da moldura " + v.foraJanela + (arr(r.avisos).length ? " · " + r.avisos.length + " aviso(s)" : ""), v.total ? "aviso" : "ok");
      } }
    ]);
    return true;
  }

  var ArqPranchasUI = { abrir: abrir, gerar: gerar, abrirArranjo: abrirArranjo, moverBloco: moverBloco, soltarBloco: soltarBloco, reorganizar: reorganizar, ultimo: function () { return ULTIMO; },
    _int: { chave: chave, lerMemoria: lerMemoria, gravarMemoria: gravarMemoria, opcoesDe: opcoesDe, registroFolhas: registroFolhas, configDaTela: configDaTela, html: html, ctxAtual: ctxAtual, abrirNasAbas: abrirNasAbas } };
  global.ArqPranchasUI = ArqPranchasUI;
  if (typeof module !== "undefined" && module.exports) module.exports = ArqPranchasUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
