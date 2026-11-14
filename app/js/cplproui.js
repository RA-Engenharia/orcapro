/* =====================================================================
 * cplproui.js — CPLPRO: a TELA (leva B). Licitação de obra do órgão público.
 *
 * O motor das regras é js/cplpro.js (dados em js/cplproregras.js). Decisões de fluxo
 * testáveis (RBAC, publicar, painel) moram em js/cplprofluxo.js; os documentos em
 * js/cplprodocs.js. Aqui há SÓ tela e gravação — nenhuma regra é reescrita.
 *
 * Módulo SOB DEMANDA (js/perfis.js SOB_DEMANDA): só aparece para o perfil que o NOMEIA
 * (perfil "orgao_publico"). Não entra no perfil completo de quem compra o OrçaPRO.
 *
 * Entidades (sincronizam pela nuvem, js/nuvem.js):
 *   cplpro_processos  um registro por processo; carrega obraId; imune à exclusão da obra
 *                     (é peça de processo administrativo: a obra some, o processo não)
 *   cplpro_papeis     o papel de cada pessoa no órgão (um registro por pessoa)
 *   cplpro_modelos    a ficha do modelo de documento do ÓRGÃO (edital, TR, contrato, ETP, DFD), um registro por tipo;
 *                     o js/cplprotpl.js troca os {{campos}} dentro do .docx do órgão (a procuradoria define as minutas)
 *
 * ⚠ RBAC NA FUNÇÃO: toda ação que grava chama Fluxo.exigir → Cplpro.exigir ANTES de gravar.
 *   Esconder ou desabilitar o botão é conforto; a trava é a função.
 * ⚠ NADA AQUI DECIDE POR O SERVIDOR: o sistema sugere (aceitar/trocar) e a pessoa clica.
 * ⚠ ARQUIVO DO ACERVO: os bytes ficam no IndexedDB do aparelho (como o arquivo de documentos
 *   da obra) e sobem para a nuvem pelo ArquivosNuvem, quando ele está ligado. O processo
 *   guarda só ficha + SHA-256.
 * ===================================================================== */
(function (global) {
  "use strict";

  if (typeof global.Gestao === "undefined") return;

  var G = global.Gestao, K = G.ui, M = global.Modulo, C = global.Cplpro, R = global.CplproRegras, F = global.CplproFluxo, D = global.CplproDocs, T = global.CplproTpl, H = global.CplproHab, Pr = global.CplproPreparo, Org = global.CplproOrgao;
  var ENT_PROC = "cplpro_processos";
  var ENT_PAP = "cplpro_papeis";
  var ENT_MOD = "cplpro_modelos";   /* ficha do modelo de documento do ÓRGÃO; os bytes do .docx ficam no IndexedDB do aparelho */
  var ENT_ORG = "cplpro_orgao";     /* o cadastro do ÓRGÃO: um registro por conta (id "orgao"); sincroniza como as demais entidades do CPLPRO */
  var MODULO = "cplpro";
  var MAX_BYTES = 60 * 1024 * 1024;
  var MODALIDADES = ["concorrência", "pregão", "concurso", "leilão", "diálogo competitivo"];   /* Lei 14.133/2021, art. 28 */

  function eid() { return (typeof Auth !== "undefined" && Auth.empresaId) ? Auth.empresaId() : "default"; }
  function esc(s) { return Util.esc(s == null ? "" : String(s)); }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function vazio(v) { return v === null || v === undefined || (typeof v === "string" && v.replace(/\s/g, "") === ""); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function dd(n) { return (n < 10 ? "0" : "") + n; }
  /* ⚠ datas LOCAIS, nunca toISOString (das 21h à meia-noite o ISO já é amanhã) */
  function hoje() { var d = new Date(); return d.getFullYear() + "-" + dd(d.getMonth() + 1) + "-" + dd(d.getDate()); }
  function agoraLocal() { var d = new Date(); return hoje() + "T" + dd(d.getHours()) + ":" + dd(d.getMinutes()) + ":" + dd(d.getSeconds()); }
  function dataBR(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? m[3] + "/" + m[2] + "/" + m[1] : "—"; }
  function dataHoraBR(iso) { var s = String(iso || ""); return dataBR(s) + (s.length > 10 ? " " + s.substring(11, 16) : ""); }
  function moeda(v) { return typeof v === "number" ? Util.fmtMoeda(v) : "—"; }
  function numBR(v, c) { return typeof v === "number" ? Util.fmtNum(v, c == null ? 2 : c) : "—"; }
  function lerNum(id) { var el = document.getElementById(id); if (!el || String(el.value).replace(/\s/g, "") === "") return null; var n = F.num(el.value); return n; }
  /* ------------------------------------------------------------------ *
   * RETORNO JUNTO DO BOTÃO (pedido do Rogério, 13/11/2026)
   * Desde a 1.2.279 o toast fica escondido no sino: ele clicou «Salvar dados da minuta» e «Gerar
   * documentos» e não soube se funcionou. Toda ação do CPLPRO mostra a resposta AO LADO do botão:
   * «✔ Salvo às 14:03» ou «✖ motivo» + «Corrigir» (leva ao passo/campo). O sino continua recebendo
   * o histórico. Um ponto só: o `toast` local alimenta o retorno; as ações são embrulhadas em
   * `acoesTela` (no fim do arquivo) para saber QUAL botão foi clicado. Sucesso some em ~8 s; erro
   * fica até a pessoa clicar de novo no mesmo botão. Reaparece depois do App.render().
   * ------------------------------------------------------------------ */
  var RETORNO_MS = 8000;
  var retornos = {}, acaoAtiva = null, ultimoClique = null;
  var CHAVES_DS = ["id", "doc", "passo", "i", "tipo", "acao", "pessoa", "lic"];   /* o que distingue um botão de outro igual (data-*) */
  function copiaDs(ds) { var o = {}; ds = ds || {}; CHAVES_DS.forEach(function (k) { o[k] = ds[k]; }); return o; }
  function hhmm() { var d = new Date(); return dd(d.getHours()) + ":" + dd(d.getMinutes()); }
  function chaveRetorno(nome, ds) {
    var p = null; try { p = procAtual(); } catch (e) { p = null; }
    var s = ds ? CHAVES_DS.map(function (k) { return ds[k]; }).filter(function (x) { return x !== undefined && x !== null && x !== ""; }).join(",") : "";
    return nome + "|" + s + "|" + (p ? p.id : "");
  }
  function tirarRetorno(botao, chave) {
    var n = botao && botao.nextSibling;
    while (n && n.getAttribute && n.getAttribute("data-cpl-retorno") === chave) { var seg = n.nextSibling; if (n.parentNode) n.parentNode.removeChild(n); n = seg; }
  }
  /* Desenha o retorno logo depois do botão. r = { ok: true|false|null, msg, corrigir: {passo, campo, item}, hora, t } */
  function desenharRetorno(botao, r, chave) {
    if (!botao || !botao.parentNode || typeof document === "undefined") return null;
    tirarRetorno(botao, chave);
    var tipo = r.ok === true ? "ok" : (r.ok === false ? "erro" : "info");
    var el = document.createElement("span");
    el.className = "cpl-retorno cpl-retorno-" + tipo;
    el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite");
    el.setAttribute("data-cpl-retorno", chave || "");
    var msg = String(r.msg === null || r.msg === undefined ? "" : r.msg).replace(/\s+$/, "").replace(/\.$/, "");
    var ic = document.createElement("span"); ic.className = "cpl-retorno-ic"; ic.setAttribute("aria-hidden", "true");
    ic.textContent = tipo === "ok" ? "\u2714" : (tipo === "erro" ? "\u2716" : "\u2139");
    var tx = document.createElement("span"); tx.className = "cpl-retorno-txt";
    tx.textContent = msg + (tipo === "ok" ? " às " + (r.hora || hhmm()) : "");
    el.appendChild(ic); el.appendChild(document.createTextNode(" ")); el.appendChild(tx);
    if (r.corrigir && r.corrigir.passo) {
      var a = document.createElement("button"); a.type = "button"; a.className = "btn sm cpl-retorno-corrigir";
      a.setAttribute("data-gacao", "cpl-corrigir"); a.setAttribute("data-passo", r.corrigir.passo);
      a.setAttribute("data-campo", r.corrigir.campo || ""); a.setAttribute("data-item", r.corrigir.item === undefined || r.corrigir.item === null ? "" : r.corrigir.item);
      a.textContent = "Corrigir";
      el.appendChild(document.createTextNode(" ")); el.appendChild(a);
    }
    botao.parentNode.insertBefore(el, botao.nextSibling);
    if (tipo !== "erro") {   /* só o sucesso some sozinho (~8 s desde o clique); o erro fica */
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
        if (retornos[chave] && retornos[chave].el === el) delete retornos[chave];
      }, Math.max(0, RETORNO_MS - (Date.now() - (r.t || Date.now()))));
    }
    return el;
  }
  /* API: CplproUI.retorno(botao, {ok, msg, corrigir}) — mostra a confirmação ao lado do botão dado */
  function retorno(botao, o) {
    o = o || {};
    var ds = botao && botao.dataset ? botao.dataset : {}, nome = botao && botao.getAttribute ? (botao.getAttribute("data-gacao") || "") : "";
    var chave = chaveRetorno(nome, ds), p = null;
    try { p = procAtual(); } catch (e) { p = null; }
    var r = { nome: nome, ds: copiaDs(ds), ok: o.ok === true ? true : (o.ok === false ? false : null), msg: o.msg, corrigir: o.corrigir || null, hora: hhmm(), t: Date.now(), procId: p ? p.id : null };
    retornos[chave] = r;
    r.el = desenharRetorno(botao, r, chave);
    return r.el;
  }
  function registrarRetorno(m, t, corrigir) {
    if (!acaoAtiva) return;
    var chave = acaoAtiva.chave, ok = t === "ok" ? true : ((t === "erro" || t === "aviso") ? false : null);
    var r = { nome: acaoAtiva.nome, ds: acaoAtiva.ds, ok: ok, msg: m, corrigir: corrigir || null, hora: hhmm(), t: Date.now(), procId: acaoAtiva.procId };
    retornos[chave] = r;
    if (acaoAtiva.botao && document.body.contains(acaoAtiva.botao)) r.el = desenharRetorno(acaoAtiva.botao, r, chave);
  }
  /* depois de cada render a tela é nova: recoloca o retorno ao lado do botão (sucesso ainda dentro dos ~8 s; erro sempre) */
  function reanexarRetornos() {
    var p = null; try { p = procAtual(); } catch (e) { p = null; }
    Object.keys(retornos).forEach(function (chave) {
      var r = retornos[chave];
      if (r.ok !== false && Date.now() - r.t > RETORNO_MS) { delete retornos[chave]; return; }
      if (r.procId && (!p || p.id !== r.procId)) return;
      var bs = document.querySelectorAll('[data-gacao="' + r.nome + '"]'), alvo = null, i;
      for (i = 0; i < bs.length && !alvo; i++) {
        var b = bs[i], d = b.dataset || {}, bate = true;
        CHAVES_DS.forEach(function (k) { if ((r.ds[k] || "") !== (d[k] || "")) bate = false; });
        if (bate && b.tagName === "BUTTON" && !/cpl-retorno-corrigir/.test(b.className || "")) alvo = b;
      }
      if (!alvo) return;
      var n = alvo.nextSibling;
      if (n && n.getAttribute && n.getAttribute("data-cpl-retorno") === chave) return;
      r.el = desenharRetorno(alvo, r, chave);
    });
  }
  /* navegação pura: não é «ação com resposta» e não troca o botão de uma ação ainda em curso (importação assíncrona) */
  var NAVEGACAO = { "cpl-obra": 1, "cpl-aba-lista": 1, "cpl-aba-papeis": 1, "cpl-aba-modelos": 1, "cpl-aba-orgao": 1, "cpl-voltar": 1, "cpl-abrir": 1, "cpl-aba": 1, "cpl-passo": 1, "cpl-ir-atual": 1, "cpl-corrigir": 1, "cpl-porque": 1, "cpl-painel": 1, "cpl-ir-usuarios": 1, "cpl-doc-previa": 1 };
  function iniciarAcao(nome, ds) {
    if (NAVEGACAO[nome]) return;
    ds = ds || {};
    var b = ultimoClique && ultimoClique.gacao === nome && Date.now() - ultimoClique.t < 1500 ? ultimoClique.el : null;
    if (b && b.tagName !== "BUTTON") b = null;
    var p = null; try { p = procAtual(); } catch (e) { p = null; }
    var chave = chaveRetorno(nome, ds);
    acaoAtiva = { nome: nome, ds: copiaDs(ds), botao: b, chave: chave, procId: p ? p.id : null };
    delete retornos[chave]; if (b) tirarRetorno(b, chave);   /* clicou de novo: o erro antigo sai */
  }
  if (typeof document !== "undefined" && !G._cplRetornoLig) {
    G._cplRetornoLig = true;
    document.addEventListener("click", function (e) {
      var t = e.target && e.target.closest ? e.target.closest("[data-gacao]") : null;
      if (t) ultimoClique = { gacao: t.getAttribute("data-gacao"), el: t, t: Date.now() };
    }, true);
  }
  /* o aviso do sino (UI.toast) continua; o retorno ao lado do botão é novo. `corrigir` = {passo, campo, item} */
  function toast(m, t, corrigir) {
    if (typeof UI !== "undefined") UI.toast(m, t || "ok");
    try { registrarRetorno(m, t || "ok", corrigir); } catch (eR) {}
  }

  /* ------------------------------------------------------------------ *
   * Estado da tela
   * ------------------------------------------------------------------ */
  G._cplView = G._cplView || "lista";
  G._cplId = G._cplId || "";
  G._cplPasso = G._cplPasso || "demanda";
  G._cplAba = G._cplAba || "passos";
  G._cplObra = G._cplObra || "";
  G._cplFoco = null;
  G._cplFonteTipo = G._cplFonteTipo || {};

  /* ------------------------------------------------------------------ *
   * Dados
   * ------------------------------------------------------------------ */
  function listaProc() { return arr(K.lista(ENT_PROC)); }
  function procPorId(id) { return id ? Store.obter(eid(), ENT_PROC, id) : null; }
  function procAtual() { return procPorId(G._cplId); }
  function usuario() {
    var u = (typeof Auth !== "undefined" && Auth.usuario && Auth.usuario()) || {};
    return { id: u.usuarioId || u.id || u.email || "conta", nome: (typeof Auth !== "undefined" && Auth.nome && Auth.nome()) || u.nome || u.email || "", gestor: typeof Auth === "undefined" || !Auth.papel || Auth.papel() !== "usuario" };
  }
  function papeis() { return F.papeisDe(usuario(), K.lista(ENT_PAP)); }
  function nomeAtual() { return usuario().nome; }
  function quemAtual(papel) { return { nome: nomeAtual(), papel: papel }; }
  function obraPorId(id) { return arr(K.lista("obras")).filter(function (o) { return o.id === id; })[0] || null; }
  function modoArred() { return null; }   /* a régua é a do orçamento (Cplpro lê orc.config); aqui só o padrão */

  /* orçamento do processo e o cálculo OFICIAL do OrçaPRO: nunca há soma própria nesta tela */
  function orcDoProc(p) {
    if (!p || !p.orcamentoId) return null;
    var l = []; try { l = Store.listarOrcamentos(eid()); } catch (e) { l = []; }
    return arr(l).filter(function (o) { return o.id === p.orcamentoId; })[0] || null;
  }
  function calc(orc) {
    if (!orc) return null;
    try { return Orcamento.calcular(orc); } catch (e) { return null; }
  }
  function modoDoOrc(c) { return c && c.modo ? c.modo : undefined; }
  function refDoCalc(c) {
    if (!c) return null;
    return { total: c.precoVenda, linhas: c.linhas.map(function (l) { return { item: l.numero, descricao: l.descricao, un: l.unidade, qtd: l.quantidade, unitario: l.precoUnit, total: l.precoTotal }; }) };
  }
  function ctxDocs(p) {
    var orc = orcDoProc(p), c = calc(orc), pq = c ? F.pesquisar(p, c.linhas, modoDoOrc(c)) : null;
    var emp = (typeof Empresa !== "undefined") ? Empresa : null, logo = null;
    try { logo = emp && emp.logo ? emp.logo() : null; } catch (e) { logo = null; }
    try { var cadT = orgaoCad(); if (cadT.timbrado && Org.timbradoOk(cadT.timbrado)) logo = cadT.timbrado; } catch (eT) {}   /* o timbrado do cadastro do órgão tem prioridade */
    return { orgao: { nome: emp && emp.nomeDoc ? emp.nomeDoc() : "", logoHtml: logo ? '<img src="' + logo + '" alt="logo" style="max-height:70px">' : "" },
      orc: c ? { total: c.precoVenda, custoDireto: c.custoDireto } : null, pesquisa: pq, prazo: F.prazo(p), hoje: hoje() };
  }

  /* ------------------------------------------------------------------ *
   * RBAC na função + gravação
   * ------------------------------------------------------------------ */
  function podeAcao(acao) { return F.pode(papeis(), acao); }
  function motivoAcao(acao) { return F.motivoSemPermissao(papeis(), acao); }
  /* trava de função: devolve o papel usado ou null (e avisa o motivo) */
  function exigir(acao) {
    try { return F.exigir(papeis(), acao); } catch (e) { toast(e.message || String(e), "erro"); return null; }
  }
  function exigirEditavel(p, acao) {
    var papel = exigir(acao); if (!papel) return null;
    if (!F.editavel(p)) { toast(F.motivoTravado(p), "erro"); return null; }
    return papel;
  }
  function salvarProc(q) {
    F.normalizar(q);
    var r = Store.salvar(eid(), ENT_PROC, q);
    if (!r) { toast("Não consegui gravar o processo. Nada foi alterado.", "erro"); return null; }
    return r;
  }
  /* `aplicar(q)` muda a cópia e devolve {antes, depois} (ou null se nada mudou) */
  function gravar(passoId, aplicar, acao) {
    var p = procAtual(); if (!p) return false;
    var papel = exigirEditavel(p, acao || F.ACAO_DO_PASSO[passoId]); if (!papel) return false;
    var q = clone(p), dif;
    try { dif = aplicar(q); } catch (e) { toast(e.message || String(e), "erro", { passo: passoId, campo: e && e.campo ? e.campo : "" }); return false; }
    if (!dif) { toast("Nada mudou.", "info"); return false; }
    F.soltarConferencia(q, passoId);
    F.registrar(q, "editar:" + passoId, dif.antes, dif.depois, quemAtual(papel), agoraLocal());
    return !!salvarProc(q);
  }
  /* a primeira pendência (fora do passo da minuta) para o «Corrigir» de quem gerou com campo em branco */
  function primeiraPendencia(q) {
    var pr = null; try { pr = C.progresso(q); } catch (e) { pr = null; }
    var ach = null;
    if (pr) C.PASSOS.forEach(function (ps) { var x = pr.passos[ps.id]; if (!ach && ps.id !== "minuta" && ps.id !== "conformidade" && x && x.pendencias && x.pendencias.length && x.pendencias[0].corrigir) ach = x.pendencias[0].corrigir; });
    return ach || { passo: "minuta", campo: "" };
  }
  /* o «Corrigir» de quem gerou com campo em branco: a 1ª pendência dos passos anteriores (como sempre); se todos os anteriores estão
     completos e só falta dado do ÓRGÃO, leva ao Cadastro do órgão */
  function corrigirDaMinuta(q, faltaOrg) {
    var pp = primeiraPendencia(q);
    return (pp.passo === "minuta" && faltaOrg.length) ? { passo: "orgao", campo: faltaOrg[0].cadastroId } : pp;
  }
  function setFoco(passo, campo) { G._cplPasso = passo; G._cplAba = "passos"; G._cplView = "proc"; G._cplFoco = campo || null; }

  /* ------------------------------------------------------------------ *
   * Peças de HTML
   * ------------------------------------------------------------------ */
  function porque(regra, fonte, conferir, rotulo) {
    var h = conferir ? ' <span class="cpl-conf" title="Esta regra ainda precisa ser conferida pelo jurídico do órgão">conferir</span>' : "";
    h += ' <button type="button" class="btn sm ghost cpl-pq" data-gacao="cpl-porque" data-regra="' + esc(regra || "") + '" data-fonte="' + esc(fonte || "") + '" data-conferir="' + (conferir ? "1" : "") + '" data-titulo="' + esc(rotulo || "") + '">Por quê?</button>';
    return h;
  }
  function campo(label, inner, foco) { return '<div class="field"' + (foco ? ' data-foco-bloco="' + esc(foco) + '"' : "") + "><label>" + label + "</label>" + inner + "</div>"; }
  /* selo «sugerido pelo sistema — confira» (leva F): só aparece enquanto o campo continua como o sistema escreveu */
  function selo(p, caminho) {
    var x = Pr && p ? Pr.seloSistema(p, caminho) : null;
    if (!x) return "";
    var tip = "Preenchido pelo sistema" + (x.arquivo ? " a partir de «" + x.arquivo + "»" : "") + (x.regra ? ". " + x.regra : "") + ". Se você editar, o selo sai.";
    return ' <span class="cpl-selo-sist" title="' + esc(tip) + '">sugerido pelo sistema — confira</span>';
  }
  function dis(ok, motivo) { return ok ? "" : ' disabled title="' + esc(motivo || "") + '"'; }
  function btn(rotulo, gacao, extra, cls) { return '<button type="button" class="btn ' + (cls || "") + '" data-gacao="' + gacao + '"' + (extra || "") + ">" + rotulo + "</button>"; }
  function selOpts(lista, atual, vazioRot) {
    return (vazioRot === null ? "" : '<option value="">' + esc(vazioRot || "—") + "</option>") + lista.map(function (o) {
      var v = Array.isArray(o) ? o[0] : o, r = Array.isArray(o) ? o[1] : o;
      return '<option value="' + esc(v) + '"' + (String(v) === String(atual) ? " selected" : "") + ">" + esc(r) + "</option>";
    }).join("");
  }
  /* ⚠ <select data-gacao> só entrega `value` ao dispatcher (js/app.js): o contexto (id do documento, número do item)
     viaja DENTRO do valor da opção, «contexto||valor», como o pp-vinc do prodpremioui. */
  function selOptsCtx(lista, atual, ctx) {
    return lista.map(function (o) {
      var v = Array.isArray(o) ? o[0] : o, r = Array.isArray(o) ? o[1] : o;
      return '<option value="' + esc(ctx + "||" + v) + '"' + (String(v) === String(atual) ? " selected" : "") + ">" + esc(r) + "</option>";
    }).join("");
  }
  function cortaCtx(valor) { var s = String(valor == null ? "" : valor), i = s.indexOf("||"); return i < 0 ? { ctx: "", v: s } : { ctx: s.slice(0, i), v: s.slice(i + 2) }; }
  function sn3(v) { return v === true ? "sim" : (v === false ? "nao" : ""); }
  function deSn3(s) { return s === "sim" ? true : (s === "nao" ? false : null); }
  function selSn(id, v, foco, desab) {
    return '<select id="' + id + '" data-foco="' + esc(foco || id) + '"' + (desab || "") + '><option value="">— escolha —</option><option value="sim"' + (v === true ? " selected" : "") + '>Sim</option><option value="nao"' + (v === false ? " selected" : "") + ">Não</option></select>";
  }
  function pendCartoes(pend) {
    if (!pend.length) return "";
    return '<div class="cpl-pends" role="list">' + pend.map(function (x, i) {
      return '<div class="cpl-pend" role="listitem"><span>' + esc(x.msg) + "</span>" +
        '<button type="button" class="btn sm" data-gacao="cpl-corrigir" data-passo="' + esc(x.corrigir.passo) + '" data-campo="' + esc(x.corrigir.campo) + '" data-item="' + esc(x.corrigir.item === undefined ? "" : x.corrigir.item) + '">Corrigir</button></div>';
    }).join("") + "</div>";
  }
  function barra(pct) {
    var v = Math.max(0, Math.min(100, pct || 0));
    return '<div class="cpl-barra" role="progressbar" aria-valuenow="' + v + '" aria-valuemin="0" aria-valuemax="100"><div style="width:' + v + '%"></div></div>';
  }
  function pilStatus(s) {
    var tom = { rascunho: "neutro", devolvido: "erro", em_analise_juridica: "info", com_ressalvas: "alerta", parecer_favoravel: "ok", publicado: "ok" };
    return M.pilula(F.STATUS_ROTULO[s] || s, tom[s] || "neutro");
  }

  /* ================================================================== *
   * TELA — entrada
   * ================================================================== */
  G.renderCplpro = function () {
    if (!C || !R || !F || !D) return G._moduloNaoCarregado("CPLPRO — Licitação do órgão", "js/cplpro.js");
    var obras = K.lista("obras");
    var html;
    if (G._cplView === "proc" && procAtual()) html = _renderProc(procAtual());
    else {
      if (G._cplView === "proc") { G._cplView = "lista"; G._cplId = ""; }
      html = G._cplView === "papeis" ? _renderPapeis(obras) : (G._cplView === "modelos" ? _renderModelos(obras) : (G._cplView === "orgao" ? _renderOrgao(obras) : _renderLista(obras)));
    }
    return html;
  };

  /* «Modelos do órgão» só aparece para quem pode importá-los (administrador do órgão); a trava de verdade é a função */
  function abasTopo(ativa) {
    var abas = [{ id: "lista", rotulo: "Processos", attrs: 'data-gacao="cpl-aba-lista"' }, { id: "papeis", rotulo: "Pessoas e papéis", attrs: 'data-gacao="cpl-aba-papeis"' }, { id: "orgao", rotulo: "Órgão", attrs: 'data-gacao="cpl-aba-orgao"' }];
    if (podeAcao("gerenciar_modelos")) abas.push({ id: "modelos", rotulo: "Modelos do órgão", attrs: 'data-gacao="cpl-aba-modelos"' });
    return M.abas(abas.map(function (a) { return { id: a.id, rotulo: a.rotulo, ativa: a.id === ativa, attrs: a.attrs }; }));
  }

  function cabLista(obras, sub, ativo) {
    return M.cab({
      iconeHtml: K.svg("cplpro", 22), titulo: "CPLPRO — Licitação do órgão", sub: sub,
      obraHtml: '<select id="cpl-obra" data-gacao="cpl-obra" aria-label="Obra">' + K.optsRec(obras, "nome", G._cplObra, "Todas as obras") + "</select>",
      acoes: [btn("Painel da CPL", "cpl-painel")],
      primariaHtml: podeAcao("criar_processo") ? btn("+ Novo processo", "cpl-novo", "", "primary") : '<button type="button" class="btn primary" data-gacao="cpl-novo" disabled title="' + esc(motivoAcao("criar_processo")) + '">+ Novo processo</button>'
    });
  }

  /* ---------- LISTA ---------- */
  function _renderLista(obras) {
    var todos = listaProc().filter(function (p) { return !G._cplObra || p.obraId === G._cplObra; });
    var sig = todos.filter(function (p) { return p.sigiloso !== false; }).length;
    var prep = todos.filter(function (p) { return ["rascunho", "devolvido", "parecer_favoravel", "com_ressalvas"].indexOf(p.status) >= 0; }).length;
    var jur = todos.filter(function (p) { return p.status === "em_analise_juridica"; }).length;
    var pub = todos.filter(function (p) { return p.status === "publicado"; }).length;
    var comPend = todos.filter(function (p) { return p.status !== "publicado" && C.progresso(p).pendencias.length > 0; }).length;
    var soma = 0, nSoma = 0;
    todos.forEach(function (p) {
      if (p.sigiloso === false) { var c = calc(orcDoProc(p)); if (c) { soma += c.precoVenda; nSoma++; } }
    });
    var html = cabLista(obras, todos.length + " processo(s)" + (G._cplObra ? " nesta obra" : " · todas as obras"));
    var pap = papeis();
    html += abasTopo("lista");
    if (!pap.length) html += M.aviso({ tom: "alerta", titulo: "Você ainda não tem perfil no CPLPRO.", texto: "Peça ao administrador do órgão para definir o seu em «Pessoas e papéis». Sem perfil, nenhuma ação é liberada." });
    html += M.kpis([
      { rotulo: "Em preparo", valor: prep, sub: "ainda não foram ao jurídico", tom: "info" },
      { rotulo: "No jurídico", valor: jur, sub: "aguardando parecer (art. 53)", tom: jur ? "alerta" : "" },
      { rotulo: "Publicados", valor: pub, tom: "pos" },
      { rotulo: "Com pendência", valor: comPend, sub: "falta algo para avançar", tom: comPend ? "alerta" : "" },
      { rotulo: "Valor estimado", valor: nSoma ? moeda(soma) : "—", sub: sig ? "só processos não sigilosos (" + sig + " sigiloso(s) fora da soma)" : (nSoma ? "soma dos orçamentos de referência" : "sem processo com orçamento"), id: "cpl-kpi-valor" }
    ]);
    if (!todos.length) {
      return html + M.secao({ corpoHtml: M.vazio({ icone: "documentos", titulo: "Nenhum processo de licitação ainda", texto: "O processo guia os 10 passos da fase preparatória, da demanda à publicação do edital.",
        acaoHtml: podeAcao("criar_processo") ? btn("Novo processo", "cpl-novo", "", "primary") : '<span class="muted">Seu perfil não cria processos.</span>' }) });
    }
    todos.sort(function (a, b) { return String(b.atualizadoEm || "") < String(a.atualizadoEm || "") ? -1 : 1; });
    var tb = '<table class="tbl" id="cpl-tab-proc"><thead><tr><th>CÓDIGO</th><th>OBJETO</th><th>SECRETARIA</th><th>PASSO</th><th>SITUAÇÃO</th><th class="num">VALOR ESTIMADO</th><th></th></tr></thead><tbody>' +
      todos.map(function (p) {
        var at = F.passoAtual(p), pr = C.progresso(p), v;
        if (p.sigiloso !== false) v = M.pilula("sigiloso", "neutro");
        else { var c = calc(orcDoProc(p)); v = c ? moeda(c.precoVenda) : "—"; }
        return "<tr><td><b>" + esc(F.codigoDe(p)) + "</b></td><td>" + esc(String(p.objeto || "(sem objeto)").substring(0, 110)) + "</td><td>" + esc(p.secretaria || "—") + "</td><td>" +
          (p.status === "publicado" ? "Publicado" : "<b>" + at.ordem + ".</b> " + esc(at.nome)) + barra(pr.geral) + "</td><td>" + pilStatus(p.status) +
          (p.status !== "publicado" && pr.pendencias.length ? " " + M.pilula(pr.pendencias.length + " pendência(s)", "alerta") : "") + '</td><td class="num">' + v + '</td><td>' +
          btn("Abrir", "cpl-abrir", ' data-id="' + esc(p.id) + '"', "sm") + "</td></tr>";
      }).join("") + "</tbody></table>";
    return html + M.secao({ titulo: "Processos", corpoHtml: tb });
  }

  /* ---------- PESSOAS E PAPÉIS ---------- */
  function _renderPapeis(obras) {
    var html = cabLista(obras, "Pessoas e papéis");
    html += abasTopo("papeis");
    if (!podeAcao("gerenciar_logins")) {
      return html + M.secao({ corpoHtml: M.vazio({ icone: "usuarios", titulo: "Só o administrador do órgão define os papéis", texto: motivoAcao("gerenciar_logins") }) });
    }
    var u = usuario(), equipe = arr(K.lista("equipe")).filter(function (e) { return e.ativo !== false; });
    var pessoas = [{ id: u.id, nome: u.nome || "Titular da conta", titular: true }];
    equipe.forEach(function (e) { if (e.id !== u.id) pessoas.push({ id: e.id, nome: e.nome || e.email || e.id, email: e.email || e.login || "" }); });
    var regs = K.lista(ENT_PAP);
    var corpo = '<p class="mod-sub" style="margin:0 0 12px">Os logins são criados no módulo Usuários; aqui você diz o que cada pessoa faz no processo. A mesma pessoa pode ter mais de um perfil. ' +
      btn("Abrir Usuários", "cpl-ir-usuarios", "", "sm") + "</p>";
    corpo += '<table class="tbl" id="cpl-tab-papeis"><thead><tr><th>PESSOA</th>' + Object.keys(R.PAPEIS).map(function (k) { return '<th class="num" title="' + esc(R.PAPEIS[k].nome) + '">' + esc(R.PAPEIS[k].nome) + "</th>"; }).join("") + "<th></th></tr></thead><tbody>" +
      pessoas.map(function (pe) {
        var atual = F.papeisDe({ id: pe.id, gestor: !!pe.titular }, regs);
        return "<tr><td><b>" + esc(pe.nome) + "</b>" + (pe.titular ? ' <span class="muted">(titular)</span>' : (pe.email ? '<div class="muted">' + esc(pe.email) + "</div>" : "")) + "</td>" +
          Object.keys(R.PAPEIS).map(function (k) {
            var forcado = pe.titular && k === "admin_orgao";
            return '<td class="num"><input type="checkbox" data-pap-pessoa="' + esc(pe.id) + '" data-pap="' + k + '" aria-label="' + esc(R.PAPEIS[k].nome) + '"' + (atual.indexOf(k) >= 0 ? " checked" : "") + (forcado ? ' disabled title="O titular sempre administra os logins do órgão"' : "") + "></td>";
          }).join("") + "<td>" + btn("Salvar", "cpl-pap-salvar", ' data-pessoa="' + esc(pe.id) + '" data-nome="' + esc(pe.nome) + '"', "sm") + "</td></tr>";
      }).join("") + "</tbody></table>";
    corpo += '<p class="muted" style="margin:12px 0 0">' + Object.keys(R.PAPEIS).map(function (k) { return "<b>" + esc(R.PAPEIS[k].nome) + ":</b> " + esc(R.PAPEIS[k].acoes.map(function (a) { return R.ACOES_ROTULO[a] || a; }).join(", ")); }).join(" · ") + "</p>";
    return html + M.secao({ titulo: "Quem faz o quê", corpoHtml: corpo });
  }

  /* ---------- CADASTRO DO ÓRGÃO (uma vez por conta; entra em todo processo com o selo «sugerido — confira») ---------- */
  function orgaoCad() { var o = null; try { o = Store.obter(eid(), ENT_ORG, Org.ID); } catch (e) { o = null; } return o ? Org.novo(o) : Org.novo(); }
  /* contexto dos padrões: o cadastro + todos os processos da conta (a numeração do edital é sequencial por órgão, ano e modalidade) */
  function ctxPadroes() { return { orgao: orgaoCad(), processos: listaProc(), agora: agoraLocal() }; }
  /* campos do edital que o CADASTRO alimenta e que continuam em branco porque o cadastro também está em branco: [{ id, cadastroId, rotulo }] */
  function faltaDoOrgao(p) {
    var cad = orgaoCad(), pe = Org.paraEdital(cad), e = (p && p.edital) || {}, out = [];
    Object.keys(Org.ORIGEM_NO_CADASTRO).forEach(function (id) {
      if (id === "cadastroProprio" && !(e.cadastro === "proprio" || cad.cadastro === "proprio")) return;
      if (!D.campoAplica(id, p || {})) return;
      var rot = ""; D.CAMPOS.forEach(function (c) { if (c.id === id) rot = c.rotulo; });
      if (rot && vazio(e[id]) && vazio(pe[id])) out.push({ id: id, cadastroId: Org.ORIGEM_NO_CADASTRO[id], rotulo: rot });
    });
    return out;
  }
  /* o órgão editou o cadastro: atualiza os processos em andamento (só o que o sistema escreveu ou está em branco) — SEM numerar editais */
  function propagarOrgao() {
    var todos = listaProc(), n = 0;
    todos.forEach(function (p, i) {
      if (!F.editavel(p)) return;
      var r = Pr.aplicarPadroes(p, { orgao: orgaoCad(), processos: todos, agora: agoraLocal(), semNumero: true });
      if (!r.mudou) return;
      F.registrar(r.p, "padroes_orgao", null, "cadastro do órgão atualizado: " + (r.preenchidos + r.atualizados) + " campo(s)", { nome: nomeAtual(), papel: "admin_orgao" }, agoraLocal());
      var s = salvarProc(r.p); if (s) { todos[i] = s; n++; }
    });
    return n;
  }
  function _renderOrgao(obras) {
    var html = cabLista(obras, "Cadastro do órgão") + abasTopo("orgao");
    var o = orgaoCad(), pode = podeAcao("gerenciar_orgao"), d = pode ? "" : " disabled", falta = Org.faltantes(o);
    var corpo = '<p class="mod-sub" style="margin:0 0 12px">Cadastre <b>uma vez</b> os dados administrativos do órgão. Eles entram em <b>todo processo</b> (edital, TR e contrato) com o selo <span class="cpl-selo-sist">sugerido — confira</span>; o que a pessoa editar num processo o sistema não sobrescreve.</p>';
    if (!pode) corpo += M.aviso({ tom: "info", titulo: "Só leitura.", texto: motivoAcao("gerenciar_orgao") });
    corpo += falta.length
      ? M.aviso({ tom: "alerta", titulo: falta.length + " dado(s) do órgão ainda em branco", texto: falta.map(function (x) { return x.rotulo; }).join("; ") + ". Enquanto faltarem, as minutas saem com [PREENCHER]." })
      : M.aviso({ tom: "ok", titulo: "Cadastro do órgão completo.", texto: "Todo documento usa estes dados." });
    var grupos = [], por = {};
    Org.CAMPOS.forEach(function (c) { if (!por[c.grupo]) { por[c.grupo] = []; grupos.push(c.grupo); } por[c.grupo].push(c); });
    corpo += '<div class="cpl-form" id="cpl-f-orgao">' + grupos.map(function (g) {
      return "<h4>" + esc(g) + "</h4>" + por[g].map(function (c) {
        var v = o[c.id] == null ? "" : o[c.id], ctrl;
        if (c.tipo === "select") ctrl = '<select id="cpl-org-' + c.id + '"' + d + ">" + selOpts(c.opcoes, v, "— escolha —") + "</select>";
        else ctrl = '<input id="cpl-org-' + c.id + '" value="' + esc(v) + '"' + (c.dica ? ' placeholder="' + esc(c.dica) + '"' : "") + d + ">";
        return campo(esc(c.rotulo) + (c.obrig ? " *" : ""), ctrl, c.id);
      }).join("");
    }).join("") + "</div>";
    corpo += "<h4>Timbrado</h4>" + (o.timbrado ? '<p><img id="cpl-org-timbrado-img" src="' + esc(o.timbrado) + '" alt="timbrado do órgão" style="max-height:90px;max-width:100%"></p>' : '<p class="muted" id="cpl-org-timbrado-vazio">Sem timbrado: os documentos saem com o logo da Empresa (Configurações), se houver.</p>') +
      '<input type="file" id="cpl-org-timbrado-arq" accept="image/png,image/jpeg,image/webp" hidden>' +
      '<div class="cpl-acoes">' + btn(o.timbrado ? "Trocar o timbrado" : "Escolher imagem do timbrado", "cpl-org-timbrado", d, "") + (o.timbrado ? " " + btn("Remover o timbrado", "cpl-org-timbrado-remover", d, "") : "") + "</div>";
    corpo += '<div class="cpl-acoes">' + btn("Salvar cadastro do órgão", "cpl-org-salvar", d, "primary") + "</div>";
    return html + M.secao({ titulo: "Cadastro do órgão", corpoHtml: corpo });
  }
  /* reduz a imagem (largura máx. 1100 px) antes de gravar: o timbrado vai para o armazenamento e para a nuvem junto com o cadastro */
  function reduzirImagem(file, cb) {
    var fr = new FileReader();
    fr.onerror = function () { cb(null); };
    fr.onload = function () {
      var img = new Image();
      img.onerror = function () { cb(null); };
      img.onload = function () {
        var tentativas = [[1100, 0.88], [800, 0.75], [600, 0.6]], i, out = null;
        for (i = 0; i < tentativas.length && !out; i++) {
          var w = Math.min(img.width, tentativas[i][0]), h = Math.round(img.height * (w / img.width));
          var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
          var cx = cv.getContext("2d"); cx.drawImage(img, 0, 0, w, h);
          var u = file.type === "image/png" ? cv.toDataURL("image/png") : cv.toDataURL("image/jpeg", tentativas[i][1]);
          if (u.length <= 600000) out = u;
        }
        cb(out);
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  }
  function importarTimbrado(f) {
    if (!exigir("gerenciar_orgao")) return;
    if (!/^image\//.test(f.type || "")) { toast("O timbrado precisa ser uma imagem (PNG ou JPEG).", "erro"); return; }
    reduzirImagem(f, function (u) {
      if (!u || !Org.timbradoOk(u)) { toast("Não consegui usar essa imagem como timbrado. Tente um PNG ou JPEG menor.", "erro"); return; }
      var o = orgaoCad(); o.timbrado = u; o.atualizadoEm = agoraLocal();
      if (!Store.salvar(eid(), ENT_ORG, o)) { toast("Não consegui gravar o timbrado.", "erro"); return; }
      toast("Timbrado do órgão salvo.", "ok"); App.render();
    });
  }

  /* ---------- MODELOS DO ÓRGÃO (Decreto SP 62.100, art. 16: a procuradoria define as minutas) ---------- */
  function modeloDoTipo(tipo) { return arr(K.lista(ENT_MOD)).filter(function (m) { return m.id === tipo; })[0] || null; }
  function _renderModelos(obras) {
    var html = cabLista(obras, "Modelos do órgão");
    html += abasTopo("modelos");
    if (!podeAcao("gerenciar_modelos")) {
      return html + M.secao({ corpoHtml: M.vazio({ icone: "documentos", titulo: "Só o administrador do órgão importa os modelos", texto: motivoAcao("gerenciar_modelos") }) });
    }
    var corpo = '<input type="file" id="cpl-mod-arq" accept=".docx" hidden>';
    corpo += '<p class="mod-sub" style="margin:0 0 12px">O texto das minutas é da procuradoria do órgão. Importe o seu modelo em Word (.docx) e escreva, onde o sistema deve entrar com o dado do processo, o campo entre chaves duplas, por exemplo <code>{{objeto}}</code>. Ao gerar, o sistema troca os campos <b>dentro do seu arquivo</b>, sem mexer na formatação. Tipo sem modelo do órgão usa o modelo padrão da casa.</p>';
    corpo += '<table class="tbl" id="cpl-tab-modelos"><thead><tr><th>DOCUMENTO</th><th>MODELO EM USO</th><th>CAMPOS</th><th></th></tr></thead><tbody>' + T.TIPOS_ORDEM.map(function (tp) {
      var m = modeloDoTipo(tp), nome = T.TIPOS[tp].nome;
      var uso = m ? M.pilula("do órgão", "ok") + ' <span class="muted">' + esc(m.nome) + " · " + esc(dataBR(m.importadoEm)) + (m.importadoPor ? " · " + esc(m.importadoPor) : "") + "</span>" : M.pilula("padrão da casa", "neutro");
      var campos = m ? esc(arr(m.campos).length) + " campo(s)" + (arr(m.desconhecidos).length ? " " + M.pilula(arr(m.desconhecidos).length + " desconhecido(s): " + arr(m.desconhecidos).join(", "), "alerta") : "") : "—";
      return '<tr data-tipo="' + tp + '"><td><b>' + esc(nome) + "</b></td><td>" + uso + "</td><td>" + campos + "</td><td>" +
        btn(m ? "Trocar o modelo" : "Importar modelo (.docx)", "cpl-mod-escolher", ' data-tipo="' + tp + '"', "sm") + " " + btn("Baixar exemplo", "cpl-mod-exemplo", ' data-tipo="' + tp + '"', "sm") +
        (m ? " " + btn("Baixar o do órgão", "cpl-mod-baixar", ' data-tipo="' + tp + '"', "sm") + " " + btn("Remover", "cpl-mod-remover", ' data-tipo="' + tp + '"', "sm") : "") + "</td></tr>";
    }).join("") + "</tbody></table>";
    corpo += '<h3 style="margin-top:16px">Campos disponíveis</h3><table class="tbl" id="cpl-tab-campos"><thead><tr><th>CAMPO</th><th>O QUE ENTRA</th><th>EXEMPLO</th></tr></thead><tbody>' +
      D.CAMPOS_MODELO.map(function (c) { return "<tr><td><code>{{" + esc(c.id) + "}}</code></td><td>" + esc(c.rotulo) + "</td><td>" + esc(c.exemplo) + "</td></tr>"; }).join("") + "</tbody></table>";
    corpo += '<p class="muted" style="margin:12px 0 0">Campo sem valor no processo sai como <b>[PREENCHER: …]</b> em vermelho. Campo que o sistema não conhece sai como <b>[CAMPO DESCONHECIDO: …]</b>. O valor estimado só entra depois do julgamento, quando o orçamento é sigiloso (art. 24). O arquivo fica neste aparelho; a ficha do modelo sincroniza com a conta.</p>';
    return html + M.secao({ titulo: "Modelos de documento do órgão", corpoHtml: corpo });
  }

  /* ================================================================== *
   * TELA — processo
   * ================================================================== */
  function _renderProc(p) {
    var obras = K.lista("obras"), ob = obraPorId(p.obraId), pr = C.progresso(p), at = F.passoAtual(p), ed = F.editavel(p);
    var abasLista = [{ id: "passos", rotulo: "Passos" }];
    if (p.status === "publicado") abasLista.push({ id: "propostas", rotulo: "Propostas" });
    abasLista.push({ id: "historico", rotulo: "Histórico" });
    if (G._cplAba === "propostas" && p.status !== "publicado") G._cplAba = "passos";
    var html = M.cab({
      iconeHtml: K.svg("cplpro", 22), titulo: "Processo " + F.codigoDe(p), sub: (p.objeto ? String(p.objeto).substring(0, 90) : "(sem objeto)") + " · " + (p.secretaria || "sem secretaria"),
      obraHtml: '<span class="cpl-obra-fixa" id="cpl-obra-fixa">' + esc(ob ? ob.nome : "Sem obra vinculada") + "</span>",
      acoes: [btn("Voltar aos processos", "cpl-voltar"), p.status !== "publicado" ? btn("Ir ao passo " + at.ordem, "cpl-ir-atual") : ""],
      primariaHtml: pilStatus(p.status)
    });
    if (!C.fluxoJuridico.podePublicar(p)) {
      html += '<div class="cpl-faixa" id="cpl-faixa-minuta" role="status"><b>Minuta — sujeita a parecer jurídico (art. 53 da Lei 14.133).</b> Esta faixa sai quando houver parecer favorável.</div>';
    }
    if (!ed) html += M.aviso({ tom: "info", titulo: F.motivoTravado(p) });
    if (p.preparo && p.preparo.resumo && G._cplAba === "passos") html += _painelPreparo(p);
    html += M.abas(abasLista.map(function (a) { return { id: a.id, rotulo: a.rotulo, ativa: a.id === G._cplAba, attrs: 'data-gacao="cpl-aba" data-aba="' + a.id + '"' }; }));
    if (G._cplAba === "historico") return html + _histProc(p);
    if (G._cplAba === "propostas") return html + _propostas(p);
    /* passos: trilho à esquerda, passo à direita */
    var trilho = '<nav class="cpl-trilho" aria-label="Passos do processo"><div class="cpl-onde" id="cpl-onde">Você está no passo <b>' + at.ordem + "</b> de 10</div><ol>" + C.PASSOS.map(function (ps) {
      var x = pr.passos[ps.id], ativo = ps.id === G._cplPasso;
      return '<li class="cpl-tr' + (ativo ? " ativo" : "") + (x.conferido ? " feito" : "") + '"><button type="button" data-gacao="cpl-passo" data-passo="' + ps.id + '"' + (ativo ? ' aria-current="step"' : "") + ">" +
        '<span class="cpl-n">' + ps.ordem + '</span><span class="cpl-t">' + esc(ps.nome) + '</span><span class="cpl-p">' + x.pct + "%" + (x.conferido ? " conferido" : "") + "</span></button></li>";
    }).join("") + "</ol></nav>";
    var passo = G._cplPasso, x = pr.passos[passo];
    var corpo = '<div class="cpl-passo" id="cpl-passo" data-passo="' + passo + '">' + '<h2>' + (C.PASSOS.filter(function (s) { return s.id === passo; })[0].ordem) + ". " + esc(C.PASSOS.filter(function (s) { return s.id === passo; })[0].nome) + "</h2>";
    corpo += pendCartoes(x.pendencias);
    var fn = { demanda: _pDemanda, acervo: _pAcervo, quantitativos: _pQuant, etp: _pEtp, riscos: _pRiscos, orcamento: _pOrcamento, tr: _pTr, parametros: _pParametros, minuta: _pMinuta, conformidade: _pConformidade }[passo];
    corpo += fn(p, x, ed);
    corpo += _rodapeConferi(p, passo, x, ed);
    corpo += "</div>";
    return html + '<div class="cpl-layout">' + trilho + corpo + "</div>";
  }

  function _rodapeConferi(p, passo, x, ed) {
    var acao = F.ACAO_DO_PASSO[passo], ok = podeAcao(acao), motivo = !ok ? motivoAcao(acao) : (!ed ? F.motivoTravado(p) : (x.pct < 100 ? "Ainda há " + x.pendencias.length + " pendência(s)." : ""));
    if (x.conferido) {
      var ps = p.passos[passo];
      return '<div class="cpl-conferi ok"><span>Conferido' + (ps.conferidoPor ? " por " + esc(ps.conferidoPor) : "") + (ps.conferidoEm ? " em " + esc(dataHoraBR(ps.conferidoEm)) : "") + ".</span> " + btn("Desfazer conferência", "cpl-desconferir", ' data-passo="' + passo + '"' + dis(ok && ed, ok ? F.motivoTravado(p) : motivoAcao(acao)), "sm") + "</div>";
    }
    var pode = ok && ed && x.pct >= 100;
    return '<div class="cpl-conferi"><span>' + (x.pct >= 100 ? "Tudo preenchido neste passo." : "Faltam itens neste passo.") + "</span> " + btn("Conferi este passo", "cpl-conferir", ' data-passo="' + passo + '"' + dis(pode, motivo), "primary") + "</div>";
  }

  /* ---------- 1. DEMANDA (DFD) ---------- */
  function _pDemanda(p, x, ed) {
    var d = ed && podeAcao("editar_dfd") ? "" : " disabled";
    var tipos = Object.keys(R.TIPOS_OBJETO).map(function (k) { return [k, R.TIPOS_OBJETO[k].nome]; });
    var sug = C.sugerirTipoObjeto(p.objeto || "");
    var obras = K.lista("obras");
    var h = '<div class="cpl-form" id="cpl-f-demanda">';
    h += campo("Secretaria requisitante *" + selo(p, "secretaria"), '<input id="cpl-secretaria" data-foco="secretaria" value="' + esc(p.secretaria || "") + '"' + d + ">", "secretaria");
    h += campo("Responsável pela demanda", '<input id="cpl-requisitante" value="' + esc(p.requisitante || "") + '"' + d + ">");
    h += campo("Objeto (descreva por inteiro) *" + selo(p, "objeto"), '<textarea id="cpl-objeto" rows="4" data-foco="objeto"' + d + ">" + esc(p.objeto || "") + "</textarea>", "objeto");
    h += campo("Tipo de objeto *" + selo(p, "tipoObjeto"), '<select id="cpl-tipo" data-foco="tipoObjeto"' + d + ">" + selOpts(tipos, p.tipoObjeto, "— escolha —") + "</select>" +
      (sug.length && sug[0].tipo !== p.tipoObjeto ? '<div class="cpl-sug">Sugestão pelo texto: <b>' + esc(R.TIPOS_OBJETO[sug[0].tipo].nome) + "</b> " + btn("Aceitar", "cpl-aceitar-tipo", ' data-tipo="' + sug[0].tipo + '"' + d, "sm") +
        porque("O texto do objeto contém: «" + sug[0].termos.join("», «") + "».", "Biblioteca RA de tipos de objeto (palavras-chave) — o sistema sugere e a pessoa confirma.", false, "Tipo de objeto") + "</div>" : ""), "tipoObjeto");
    h += campo("Justificativa da necessidade (interesse público) *" + selo(p, "justificativa"), '<textarea id="cpl-justificativa" rows="4" data-foco="justificativa"' + d + ">" + esc(p.justificativa || "") + "</textarea>", "justificativa");
    h += campo("Previsão no plano de contratações anual (PCA) *", '<input id="cpl-pca" data-foco="pca" placeholder="Ex.: item 12 do PCA 2027, ou a justificativa da ausência" value="' + esc(p.pca || "") + '"' + d + ">" +
      porque("A fase preparatória deve se compatibilizar com o plano de contratações anual, sempre que elaborado.", "Lei 14.133/2021, art. 18, caput (e art. 12, VII)", false, "PCA"), "pca");
    h += campo("Prazo desejado", '<input id="cpl-prazoDesejado" type="date" value="' + esc(p.prazoDesejado || "") + '"' + d + ">");
    h += campo("Há recurso federal? *", selSn("cpl-recursoFederal", p.recursoFederal, "recursoFederal", d) +
      porque("Com recursos da União valem as regras federais de pesquisa de preços.", "Lei 14.133/2021, art. 23, §2º (regulamento federal); Decreto Municipal SP 62.100/2022, art. 28, §2º", true, "Recurso federal"), "recursoFederal");
    h += campo("O orçamento será sigiloso? *", selSn("cpl-sigiloso", p.sigiloso, "sigiloso", d) + porque("Escolha explícita, sem padrão. Sim liga a trava de vazamento do valor estimado nos documentos públicos.", "Lei 14.133/2021, art. 24", true, "Sigilo do orçamento"), "sigiloso");
    h += campo("Obra", '<select id="cpl-obraProc" data-foco="obraId"' + d + ">" + K.optsRec(obras, "nome", p.obraId, "— sem obra —") + "</select> " + btn("Criar obra", "cpl-criar-obra", d, "sm"), "obraId");
    h += '</div><div class="cpl-acoes">' + btn("Salvar demanda", "cpl-salvar-demanda", d, "primary") + "</div>";
    return h;
  }

  /* ---------- 2. ACERVO ---------- */
  function _pAcervo(p, x, ed) {
    var d = ed && podeAcao("editar_acervo") ? "" : " disabled";
    var docs = arr(p.documentos), vig = docs.filter(function (z) { return !z.superadoPor; }), sup = docs.filter(function (z) { return z.superadoPor; });
    var tipos = Object.keys(R.ACERVO_TIPOS).map(function (k) { return [k, R.ACERVO_TIPOS[k].nome]; });
    var h = '<input type="file" id="cpl-arq" multiple hidden><input type="file" id="cpl-pasta" webkitdirectory multiple hidden>';
    h += '<input type="file" id="cpl-preparo-pasta" webkitdirectory multiple hidden>';
    h += '<div class="cpl-acoes">' + btn("Montar tudo a partir da pasta", "cpl-preparo-escolher", d, "primary") + btn("Escolher arquivos", "cpl-add-arq", d) + btn("Escolher uma pasta", "cpl-add-pasta", d) + '<span class="muted" id="cpl-acervo-status"></span></div>' +
      '<p class="muted">«Montar tudo» lê a pasta inteira (memorial, planilha, cronograma, projetos), preenche os passos que dá para deduzir e marca cada campo como <b>sugerido pelo sistema — confira</b>. Nada fica «conferido» sem você, e o que você editar o sistema não sobrescreve.</p>';
    var chk = C.checklistAcervo(p);
    if (!p.tipoObjeto) h += M.aviso({ tom: "alerta", titulo: "Escolha o tipo de objeto no passo 1 para ver o que o acervo precisa ter." });
    else {
      h += "<h3>O que o processo precisa × o que já tem</h3>" + '<table class="tbl" id="cpl-chk-acervo"><thead><tr><th>EXIGÊNCIA</th><th>PARA QUÊ</th><th>TEM</th><th></th></tr></thead><tbody>' +
        chk.map(function (c) {
          return '<tr data-foco="' + esc(c.exigencia) + '"><td><b>' + esc(c.nome) + "</b></td><td>" + esc(c.porque) + "</td><td>" + (c.tem.length ? c.tem.map(function (id) { var dc = docs.filter(function (z) { return z.id === id; })[0]; return esc(dc ? dc.nome : id); }).join("<br>") : "—") + "</td><td>" +
            (c.situacao === "ok" ? M.pilula("tem", "ok") : M.pilula("falta", "alerta")) + "</td></tr>";
        }).join("") + "</tbody></table>";
    }
    h += "<h3>Documentos do acervo (" + vig.length + " vigentes)</h3>";
    if (!docs.length) h += M.vazio({ icone: "documentos", titulo: "Nenhum arquivo no acervo", texto: "Escolha os arquivos ou a pasta do projeto: o sistema calcula o SHA-256 de cada um e sugere o tipo pelo nome." });
    else {
      h += '<table class="tbl" id="cpl-tab-acervo"><thead><tr><th>ARQUIVO</th><th>TIPO</th><th>REV.</th><th>CONFIANÇA</th><th>SHA-256</th><th></th></tr></thead><tbody>' + vig.map(function (z) {
        return "<tr><td>" + esc(z.nome) + (z.origem ? '<div class="muted">' + esc(z.origem) + "</div>" : "") + '</td><td><select data-gacao="cpl-doc-tipo" aria-label="Tipo do arquivo"' + d + ">" + selOptsCtx(tipos, z.tipo, z.id) + "</select>" +
          (z.porConteudo ? ' <span class="pill info cpl-conteudo" title="O nome do arquivo não bastou: o sistema leu as páginas 1 e 2 do PDF">pelo conteúdo</span>' : "") +
          porque(z.motivo, z.porConteudo ? "Classificado pelo texto das páginas 1 e 2 do PDF (frases do carimbo, regras da casa); a pessoa confirma ou troca." : "Classificação pelo nome do arquivo (regras da casa); a pessoa pode trocar.", false, "Tipo do arquivo") + "</td><td>" + esc(z.revisao || "—") + "</td><td>" + M.pilula(z.confianca === "alta" ? "alta" : (z.confianca === "media" ? "média" : (z.confianca === "manual" ? "manual" : "baixa")), z.confianca === "alta" || z.confianca === "manual" ? "ok" : "alerta") +
          '</td><td><code title="' + esc(z.sha || "") + '">' + esc((z.sha || "—").substring(0, 12)) + "</code></td><td>" + btn("Abrir", "cpl-doc-abrir", ' data-id="' + esc(z.id) + '"', "sm") + "</td></tr>";
      }).join("") + "</tbody></table>";
      if (sup.length) {
        h += "<h3>Repetidos e superados (nunca são apagados)</h3>" + '<table class="tbl" id="cpl-tab-superados"><thead><tr><th>ARQUIVO</th><th>MOTIVO</th><th>SUBSTITUÍDO POR</th></tr></thead><tbody>' + sup.map(function (z) {
          var por = docs.filter(function (w) { return w.id === z.superadoPor; })[0];
          return "<tr><td>" + esc(z.nome) + "</td><td>" + (z.superadoMotivo === "repetido" ? "mesmo conteúdo (SHA-256 igual)" : "revisão mais nova") + "</td><td>" + esc(por ? por.nome : z.superadoPor) + "</td></tr>";
        }).join("") + "</tbody></table>";
      }
    }
    return h;
  }

  /* ---------- 3. QUANTITATIVOS ---------- */
  function _selOrc(p, d) {
    var orcs = arr((function () { try { return Store.listarOrcamentos(eid()); } catch (e) { return []; } })());
    var obra = obraPorId(p.obraId), sel = p.orcamentoId || (obra && obra.orcamentoId) || "";
    var opts = orcs.map(function (o) { return { id: o.id, rot: G._orcRotulo ? G._orcRotulo(o) : (o.nome || o.id) }; });
    return '<select id="cpl-orcamentoId" data-foco="orcamentoId"' + (d || "") + ">" + K.optsRec(opts, "rot", sel, "— escolha o orçamento —") + "</select>";
  }
  function _pQuant(p, x, ed) {
    var d = ed && podeAcao("editar_quantitativos") ? "" : " disabled";
    var orc = orcDoProc(p), c = calc(orc), qs = arr(p.quantitativos);
    var h = campo("Orçamento da obra", _selOrc(p, d) + " " + btn("Trazer os itens do orçamento", "cpl-q-trazer", d, "sm"), "orcamentoId");
    var acervo = arr(p.documentos).filter(function (z) { return !z.superadoPor; });
    if (c && qs.length) {
      var dif = qs.filter(function (q) { var l = c.linhas.filter(function (z) { return z.numero === q.item; })[0]; return !l || Math.abs(l.quantidade - q.qtd) > 1e-9; }).length +
        c.linhas.filter(function (l) { return !qs.some(function (q) { return q.item === l.numero; }); }).length;
      if (dif) h += M.aviso({ tom: "alerta", titulo: dif + " item(ns) diferem do orçamento atual.", texto: "Use «Trazer os itens do orçamento» para atualizar; as origens já informadas são mantidas." });
    }
    if (!qs.length) return h + M.vazio({ icone: "orcamentos", titulo: "Nenhum quantitativo lançado", texto: "Escolha o orçamento e traga os itens. Cada quantidade precisa de origem: arquivo do acervo e página." });
    h += '<table class="tbl" id="cpl-tab-quant"><thead><tr><th>ITEM</th><th>DESCRIÇÃO</th><th>UN.</th><th class="num">QTD.</th><th>ORIGEM — ARQUIVO</th><th>PÁGINA</th></tr></thead><tbody>' + qs.map(function (q, i) {
      var o = q.origem || {}, sem = vazio(o.arquivo) || (vazio(o.pagina) && vazio(o.linha));
      var nomes = acervo.map(function (z) { return z.nome; });
      if (o.arquivo && nomes.indexOf(o.arquivo) < 0) nomes.push(o.arquivo);
      return '<tr data-foco="origem:' + esc(q.item) + '" class="' + (sem ? "cpl-sem" : "") + '"><td>' + esc(q.item) + "</td><td>" + esc(q.descricao) + "</td><td>" + esc(q.un) + '</td><td class="num">' + numBR(q.qtd, 2) + '</td><td><select id="cpl-qa-' + i + '"' + d + ">" + selOpts(nomes, o.arquivo, "— arquivo —") + '</select></td><td><input id="cpl-qp-' + i + '" style="width:80px" value="' + esc(o.pagina == null ? "" : o.pagina) + '"' + d + ">" + (o.linha ? '<div class="muted">linha ' + esc(o.linha) + " da planilha</div>" : "") + selo(p, "quantitativos#" + q.item) + "</td></tr>";
    }).join("") + "</tbody></table>";
    return h + '<div class="cpl-acoes">' + btn("Salvar origens", "cpl-q-salvar", d, "primary") + '<span class="muted">Sem origem o item não entra no ETP nem no TR (art. 18, §1º, IV).</span></div>';
  }

  /* ---------- 4. ETP ---------- */
  function _textoSugestaoEtp(id, v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v;
    if (id === "IV") return "Quantidades estimadas por memória de cálculo: " + v.comOrigem + " item(ns) com origem documental (arquivo e página), listados no quadro de quantitativos." + (v.semOrigem ? " Atenção: " + v.semOrigem + " item(ns) sem origem ficaram de fora." : "");
    if (id === "VI") return "Valor estimado da contratação: " + moeda(v.total) + (v.base ? ", base " + v.base : "") + (v.competencia ? ", competência " + v.competencia : "") + ". Totais do orçamento de referência do processo.";
    return JSON.stringify(v);
  }
  function _pEtp(p, x, ed) {
    var d = ed && podeAcao("editar_etp") ? "" : " disabled";
    var c = calc(orcDoProc(p));
    var et = C.etpCampos(p, { orcamento: c ? { total: c.precoVenda, base: p.orcamentoRef && p.orcamentoRef.base, competencia: p.orcamentoRef && p.orcamentoRef.competencia } : null });
    var man = (p.etp && p.etp.campos) || {}, just = (p.etp && p.etp.justificativas) || {};
    var h = '<p class="muted">13 elementos do art. 18, §1º. Obrigatórios (§2º): <b>I, IV, VI, VIII e XIII</b>. O sistema pré-preenche o que sabe — confira, edite e salve.' + porque("Elementos do ETP e quais são obrigatórios.", R.ETP_FONTE, false, "ETP") + "</p>";
    h += '<div class="cpl-form" id="cpl-f-etp">' + R.ETP_ELEMENTOS.map(function (el) {
      var salvo = !vazio(man[el.id]), sugt = _textoSugestaoEtp(el.id, et.campos[el.id]), valor = salvo ? man[el.id] : sugt;
      var vermelho = vazio(valor) && el.obrigatorio;
      return '<div class="field' + (vermelho ? " cpl-obrig-vazio" : "") + '" data-foco-bloco="' + el.id + '"><label>' + esc(el.id) + " — " + esc(el.nome) + (el.obrigatorio ? ' <span class="cpl-obrig">obrigatório</span>' : "") + (!salvo && sugt ? ' <span class="cpl-sugerido">sugestão do sistema — confira e salve</span>' : "") + (salvo ? selo(p, "etp.campos." + el.id) : "") + "</label>" +
        '<textarea id="cpl-etp-' + el.id + '" rows="3" data-foco="' + el.id + '"' + d + ">" + esc(valor || "") + "</textarea>" +
        (!el.obrigatorio ? '<input id="cpl-etpj-' + el.id + '" placeholder="Se não se aplica, justifique aqui" value="' + esc(just[el.id] || "") + '"' + d + ">" : "") + "</div>";
    }).join("") + '</div><div class="cpl-acoes">' + btn("Salvar ETP", "cpl-salvar-etp", d, "primary") + "</div>";
    return h;
  }

  /* ---------- 5. RISCOS ---------- */
  function _pRiscos(p, x, ed) {
    var d = ed && podeAcao("editar_riscos") ? "" : " disabled";
    var rs = arr(p.riscos), sug = C.riscosSugeridos(p.tipoObjeto);
    var h = '<div class="cpl-acoes">' + btn("Trazer os riscos sugeridos do tipo de objeto", "cpl-r-sugeridos", d + (p.tipoObjeto ? "" : ' disabled title="Escolha o tipo de objeto no passo 1"')) +
      porque("Riscos usuais do tipo de objeto, da biblioteca da casa. Prob. e impacto são sugestões da casa; o órgão ajusta.", sug.length ? sug[0].fonte : "Biblioteca RA de riscos (texto sugerido — conferir); matriz de riscos: Lei 14.133/2021, art. 22", true, "Riscos sugeridos") + "</div>";
    if (!rs.length) return h + M.vazio({ icone: "alerta", titulo: "Nenhum risco avaliado", texto: "Traga os sugeridos do tipo de objeto e ajuste probabilidade, impacto e quem assume cada risco." });
    var niv = { baixo: "ok", medio: "info", alto: "alerta", critico: "erro" };
    var cinco = [1, 2, 3, 4, 5].map(function (n) { return [n, String(n)]; });
    h += '<table class="tbl" id="cpl-tab-riscos"><thead><tr><th>RISCO</th><th>PROB.</th><th>IMPACTO</th><th>NÍVEL</th><th>ALOCAÇÃO</th><th>MITIGAÇÃO</th><th></th></tr></thead><tbody>' + rs.map(function (r, i) {
      var n = C.nivelRisco(r.prob, r.impacto);
      return '<tr data-foco="riscos.' + i + '"><td>' + esc(r.descricao) + '<div class="muted">' + esc(r.categoria || "") + (r.sugerido ? " · sugerido" : "") + selo(p, "riscos#" + r.id) + (r.ajusteSistema ? " · " + esc(r.ajusteSistema) : "") + '</div></td><td><select id="cpl-rp-' + i + '"' + d + ">" + selOpts(cinco, r.prob, "—") + '</select></td><td><select id="cpl-ri-' + i + '"' + d + ">" + selOpts(cinco, r.impacto, "—") + "</select></td><td>" +
        (n ? M.pilula({ baixo: "Baixo", medio: "Médio", alto: "Alto", critico: "Crítico" }[n.nivel] + " (" + n.valor + ")", niv[n.nivel]) : M.pilula("sem nível", "alerta")) + '</td><td><select id="cpl-ra-' + i + '"' + d + ">" + selOpts([["contratante", "Contratante (órgão)"], ["contratada", "Contratada"], ["compartilhado", "Compartilhado"]], r.alocacao, "—") + '</select></td><td><input id="cpl-rm-' + i + '" value="' + esc(r.mitigacao || "") + '" style="min-width:220px"' + d + "></td><td>" + btn("Remover", "cpl-r-remover", ' data-i="' + i + '"' + d, "sm ghost") + "</td></tr>";
    }).join("") + "</tbody></table>";
    return h + '<div class="cpl-acoes">' + btn("Salvar riscos", "cpl-r-salvar", d, "primary") + "</div>";
  }

  /* ---------- 6. ORÇAMENTO DE REFERÊNCIA + PESQUISA DE PREÇOS ---------- */
  function _pOrcamento(p, x, ed) {
    var d = ed && podeAcao("editar_orcamento") ? "" : " disabled";
    var orc = orcDoProc(p), c = calc(orc), ref = p.orcamentoRef || {};
    var tp = R.TIPOS_OBJETO[p.tipoObjeto];
    var h = '<div class="cpl-form" id="cpl-f-orc">' + campo("Orçamento de referência *", _selOrc(p, d) + (orc ? " " + btn("Abrir no orçamento", "cpl-orc-abrir", "", "sm") : ""), "orcamentoId");
    var sugBase = orc ? (orc.competenciaSinapi ? "SINAPI" + (orc.uf ? "/" + orc.uf : "") + (orc.desonerado ? " desonerado" : " não desonerado") : "") : "";
    h += campo("Base de preços *" + selo(p, "orcamentoRef.base"), '<input id="cpl-oBase" data-foco="base" value="' + esc(ref.base || "") + '" placeholder="Ex.: SINAPI/SP não desonerado"' + d + ">" +
      (!ref.base && sugBase ? '<div class="cpl-sug">Do orçamento: <b>' + esc(sugBase) + "</b> " + btn("Usar", "cpl-orc-usar", ' data-base="' + esc(sugBase) + '" data-comp="' + esc(orc.competenciaSinapi || "") + '"' + d, "sm") + "</div>" : "") +
      (tp ? '<div class="cpl-sug">Base usual para ' + esc(tp.nome) + ": <b>" + esc(tp.base) + "</b>" + (tp.baseConferir ? porque(tp.baseNota || "", "Biblioteca RA de tipos de objeto", true, "Base de preços") : "") + "</div>" : ""), "base");
    h += campo("Competência (data-base) *" + selo(p, "orcamentoRef.competencia"), '<input id="cpl-oComp" data-foco="competencia" value="' + esc(ref.competencia || "") + '" placeholder="AAAA-MM"' + d + ">", "competencia");
    h += "</div>";
    /* leva L: o que o «Montar a partir da pasta» deixou para conferir/decidir neste passo */
    var po = p.preparo && p.preparo.orcamento ? p.preparo.orcamento : null;
    if (po && po.leituraPdf && po.leituraPdf.ok !== true && po.leituraPdf.conferida !== true) {
      h += M.aviso({ tom: "alerta", titulo: "Conferir a leitura do PDF (nota " + po.leituraPdf.nota + ").", texto: (po.leituraPdf.motivos || []).join("; ") || "A conferência automática da leitura não passou.",
        acaoHtml: btn("Conferi a leitura do PDF", "cpl-pdf-conferida", d, "sm") });
    }
    if (p.preparo && p.preparo.oferta && p.preparo.oferta.escopo && !p.orcamentoId) {
      h += M.aviso({ tom: "alerta", titulo: "A pasta não tem planilha orçamentária.", texto: "Dá para orçar pelo escopo: o sistema abre o Escopo Inteligente com o texto do memorial. A cobrança por uso (2 orçamentos grátis por mês, depois o preço mostrado) é confirmada antes de qualquer IA.",
        acaoHtml: btn("Orçar pelo escopo (IA)", "cpl-orc-escopo", d, "primary") });
    }
    if (po && po.baseExigida && po.baseExigida.length) {
      h += '<p class="muted" id="cpl-base-exigida">Base de preços escolhida sozinha pelo regulamento: ' + po.baseExigida.map(function (b) { return "<b>" + esc(b.catId.replace(/_DES$/, "") + (b.uf ? "-" + b.uf : "") + (b.competencia ? " " + b.competencia : "")) + "</b>" + (b.precificou ? " (" + b.precificou + " itens)" : ""); }).join(" · ") + ".</p>";
    }
    h += '<div class="cpl-acoes">' + btn("Salvar orçamento de referência", "cpl-orc-salvar", d, "primary") + "</div>";
    if (!c) return h + M.aviso({ tom: "alerta", titulo: "Escolha o orçamento para ver os totais e a pesquisa de preços." });
    h += M.kpis([
      { rotulo: "Preço de venda", valor: moeda(c.precoVenda), sub: "total oficial do orçamento (com BDI)", id: "cpl-orc-total" },
      { rotulo: "Custo direto", valor: moeda(c.custoDireto) }, { rotulo: "BDI", valor: numBR(c.pct, 2) + " %" }, { rotulo: "Itens", valor: c.linhas.length }
    ]);
    h += _blocoPacoteReferencia(p);
    h += _painelPesquisa(p, c, ed);
    return h;
  }

  /* Pacote do orçamento de referência (PDF + Excel no padrão do órgão): js/orcref.js. Só LÊ o processo; não grava nada. */
  function _blocoPacoteReferencia(p) {
    var pode = podeAcao("gerar_minuta") || podeAcao("ler_tudo");
    var h = '<div id="cpl-pacote-ref"><h3>Pacote do orçamento de referência</h3>';
    if (p.sigiloso !== false) h += M.aviso({ tom: "alerta", titulo: "Documento interno: não anexar ao edital enquanto o orçamento for sigiloso.", texto: "O pacote traz o orçamento por inteiro (valores, composições, curva ABC e mapa de cotação). Ele serve ao controle interno do órgão; o valor estimado só pode ser divulgado nos termos do art. 24 da Lei 14.133/2021." });
    h += '<p class="muted">Sintética, analítica, BDI, encargos, curva ABC, cronograma, memória de cálculo, mapa de cotação e declarações. A pesquisa de preços abaixo entra no mapa de cotação; item sem base oficial e sem pesquisa fica <b>pendente</b> no pacote, e ART/RRT não informada também.</p>';
    return h + '<div class="cpl-acoes">' + btn("Pacote do orçamento de referência (PDF + Excel)", "cpl-orc-pacote", pode ? "" : ' disabled title="Seu perfil não baixa documentos do processo."', "primary") + "</div></div>";
  }

  function _painelPesquisa(p, c, ed) {
    var d = ed && podeAcao("editar_pesquisa") ? "" : " disabled";
    var pq = F.pesquisar(p, c.linhas, modoDoOrc(c)), pesq = p.pesquisa || {}, reg = pq.regulamento, rd = pesq.regraDescarte || {};
    var h = "<h3>Pesquisa de preços</h3>";
    if (!reg) h += M.aviso({ tom: "alerta", titulo: "Regulamento de pesquisa de preços não definido.", acaoHtml: '<button type="button" class="btn sm" data-gacao="cpl-corrigir" data-passo="parametros" data-campo="regulamentoId">Escolher no passo 8</button>' });
    else h += '<p class="muted">Regulamento: <b>' + esc(reg.nome) + "</b>" + (p.recursoFederal === true ? " (recurso federal: vale o regulamento federal)" : "") + porque(reg.fonte, reg.fonte, reg.conferir === true, "Regulamento") + "</p>";
    h += '<div class="cpl-form" id="cpl-f-pesq">' + campo("Data da pesquisa", '<input id="cpl-pDataPesq" type="date" value="' + esc(pesq.dataPesquisa || "") + '"' + d + ">") +
      campo("Data prevista do edital", '<input id="cpl-pDataEdital" type="date" value="' + esc(p.dataPrevistaEdital || "") + '"' + d + ">") +
      campo("Método de cálculo", '<select id="cpl-pMetodo"' + d + ">" + selOpts([["media", "Média"], ["mediana", "Mediana"], ["menor", "Menor valor"]], pesq.metodo, "— escolha —") + "</select>" + porque("Média, mediana ou menor valor; sem escolha não há preço de referência.", reg ? reg.calculo.fonte : "", reg ? reg.calculo.conferir === true : true, "Método de cálculo")) +
      campo("Descartar abaixo de (% da mediana)", '<input id="cpl-pDescAbaixo" inputmode="decimal" style="width:90px" value="' + esc(rd.abaixoPct == null ? "" : rd.abaixoPct) + '"' + d + ">") +
      campo("Descartar acima de (% da mediana)", '<input id="cpl-pDescAcima" inputmode="decimal" style="width:90px" value="' + esc(rd.acimaPct == null ? "" : rd.acimaPct) + '"' + d + ">") + "</div>" +
      '<div class="cpl-acoes">' + btn("Salvar parâmetros da pesquisa", "cpl-pesq-salvar", d) + '<span class="muted">Sem regra de descarte, nenhum preço é descartado por discrepância — e o mapa diz isso.</span></div>';
    var semBase = [], comBase = 0;
    c.linhas.forEach(function (l, i) { if (pq.avaliacoes[i].comBase) comBase++; else semBase.push({ l: l, a: pq.avaliacoes[i] }); });
    h += "<p>" + comBase + " item(ns) com base oficial (SINAPI/SICRO/SIURB) — o próprio orçamento é a fonte. <b>" + semBase.length + "</b> item(ns) sem base pedem pesquisa.</p>";
    semBase.forEach(function (z) { h += _cartaoItemPesquisa(p, z.l, z.a, reg, d, ed); });
    var difMapa = pq.mapa.total - c.custoDireto;
    h += M.kpis([
      { rotulo: "Mapa da pesquisa", valor: moeda(pq.mapa.total), sub: "sem BDI; " + (pq.mapa.semPreco ? pq.mapa.semPreco + " item(ns) sem preço" : "todos os itens com preço"), id: "cpl-pq-total" },
      { rotulo: "Custo direto do orçamento", valor: moeda(c.custoDireto), sub: Math.abs(difMapa) < 0.005 ? "fecha com o mapa" : "difere do mapa em " + moeda(Math.abs(difMapa)), tom: Math.abs(difMapa) < 0.005 ? "pos" : "alerta" }
    ]);
    return h;
  }

  function _cartaoItemPesquisa(p, l, a, reg, d, ed) {
    var cfg = ((p.pesquisa || {}).itens || {})[l.numero] || {}, fontes = arr(cfg.fontes);
    var tipos = reg ? reg.ordem.map(function (o) { return [o.tipo, o.nome]; }) : [];
    var sit = { ok: ["ok", "ok"], ok_justificado: ["ok com justificativa", "ok"], justificativa: ["justificativa pendente", "alerta"], sem_fonte: ["sem fonte válida", "erro"], pendente: ["pendente", "alerta"] }[a.situacao] || [a.situacao, "neutro"];
    var h = '<details class="cpl-item" data-foco="pesq:' + esc(l.numero) + '"' + (a.situacao !== "ok" && a.situacao !== "ok_justificado" ? " open" : "") + "><summary><b>" + esc(l.numero) + "</b> " + esc(l.descricao) + " <span class=\"muted\">" + esc(l.unidade) + " · qtd " + numBR(l.quantidade, 2) + " · no orçamento " + moeda(l.custoUnitario) + "</span> " + M.pilula(sit[0], sit[1]) +
      (a.valor != null ? " <b>" + moeda(a.valor) + "</b>" + (Math.abs(a.valor - l.custoUnitario) > 0.005 ? " " + M.pilula("diverge do orçamento", "alerta") : "") : "") + "</summary>";
    if (fontes.length) {
      h += '<table class="tbl"><thead><tr><th>#</th><th>TIPO</th><th>FONTE</th><th class="num">VALOR</th><th>DATA</th><th>SITUAÇÃO</th><th></th></tr></thead><tbody>' + fontes.map(function (f, i) {
        var usada = arr(a.fontesUsadas).filter(function (u) { return u.indice === i; })[0], desc = arr(a.descartadas).filter(function (u) { return u.indice === i; })[0], nao = arr(a.naoUsadas).filter(function (u) { return u.indice === i; })[0];
        return "<tr><td>" + (i + 1) + "</td><td>" + esc(f.tipo) + "</td><td>" + esc([f.base, f.fornecedor, f.link].filter(Boolean).join(" · ")) + '</td><td class="num">' + numBR(F.num(f.valor), 2) + "</td><td>" + esc(dataBR(f.dataAcesso || f.dataColeta || f.dataConclusao)) + (f.horaAcesso ? " " + esc(f.horaAcesso) : "") + "</td><td>" +
          (usada ? M.pilula("usada", "ok") + porque(usada.regra, usada.regra, false, "Fonte usada") : (desc ? M.pilula("descartada", "erro") + " " + esc(desc.motivo) + porque(desc.motivo, desc.regra, false, "Fonte descartada") : (nao ? M.pilula("não usada", "neutro") + " " + esc(nao.motivo) : ""))) + "</td><td>" +
          btn("Remover", "cpl-f-remover", ' data-item="' + esc(l.numero) + '" data-i="' + i + '"' + d, "sm ghost") + "</td></tr>";
      }).join("") + "</tbody></table>";
    }
    if (a.avisoDescarte) h += '<p class="muted">' + esc(a.avisoDescarte) + "</p>";
    arr(a.pendencias).forEach(function (m) { h += '<p class="cpl-alerta">' + esc(m) + "</p>"; });
    if (a.justificativaObrigatoria) h += campo("Justificativa (menos preços que o mínimo — aprovada pela autoridade)", '<textarea id="cpl-pj-' + esc(l.numero) + '" rows="2"' + d + ">" + esc(cfg.justificativa || "") + "</textarea> " + btn("Salvar justificativa", "cpl-f-just", ' data-item="' + esc(l.numero) + '"' + d, "sm"));
    /* adicionar fonte */
    var tipoSel = G._cplFonteTipo[l.numero] || (tipos[0] ? tipos[0][0] : "");
    if (reg) {
      var oficial = tipoSel === "sistema_oficial";
      h += '<div class="cpl-novafonte"><b>Adicionar fonte</b> <select data-gacao="cpl-f-tipo" aria-label="Tipo da fonte"' + d + ">" + selOptsCtx(tipos, tipoSel, l.numero) + "</select>" +
        (oficial ? ' <select id="cpl-fb-' + esc(l.numero) + '"' + d + '><option>SINAPI</option><option>SICRO</option><option>SIURB</option><option>SIURB_INFRA</option></select>' : "") +
        ' <input id="cpl-fv-' + esc(l.numero) + '" inputmode="decimal" placeholder="Valor unitário" style="width:120px"' + d + ">" +
        ' <input id="cpl-ff-' + esc(l.numero) + '" placeholder="Fornecedor / órgão / site" style="min-width:180px"' + d + ">" +
        (tipoSel === "midia" || tipoSel === "outro_sistema" || tipoSel === "nota_fiscal" ? ' <input id="cpl-fl-' + esc(l.numero) + '" placeholder="Link" style="min-width:160px"' + d + ">" : "") +
        (tipoSel === "midia" ? ' <label>Acesso <input id="cpl-fda-' + esc(l.numero) + '" type="date"' + d + '></label> <input id="cpl-fha-' + esc(l.numero) + '" type="time" aria-label="Hora do acesso"' + d + ">" : "") +
        (tipoSel === "cotacao" ? ' <label>Coleta <input id="cpl-fdc-' + esc(l.numero) + '" type="date"' + d + "></label>" : "") +
        (tipoSel === "contratacao_similar" ? ' <label>Conclusão <input id="cpl-fdq-' + esc(l.numero) + '" type="date"' + d + '></label> <label><input type="checkbox" id="cpl-fex-' + esc(l.numero) + '"' + d + '> em execução</label> <input id="cpl-fat-' + esc(l.numero) + '" inputmode="decimal" placeholder="Índice de atualização (ex.: 1,042)" style="width:170px"' + d + ">" : "") +
        " " + btn("Adicionar", "cpl-f-add", ' data-item="' + esc(l.numero) + '"' + d, "sm primary") + "</div>";
    }
    return h + "</details>";
  }

  /* Campos que o modelo oficial (AGU/SEGES) deixa para o órgão (D.CAMPOS): a lista é uma só e os formulários saem dela.
     id do input: cpl-cf-<campo>. Campo cujo bloco "OU" os parâmetros não escolheram nem aparece. */
  function htmlCampos(p, onde, d) {
    var grupos = [], porGrupo = {}, o = (onde === "tr" ? p.tr : p.edital) || {};
    D.CAMPOS.forEach(function (c) {
      if (c.onde !== onde || !D.campoAplica(c.id, p)) return;
      if (!porGrupo[c.grupo]) { porGrupo[c.grupo] = []; grupos.push(c.grupo); }
      porGrupo[c.grupo].push(c);
    });
    return grupos.map(function (g) {
      return "<h4>" + esc(g) + "</h4>" + porGrupo[g].map(function (c) {
        var v = o[c.id] == null ? "" : o[c.id], ctrl;
        if (c.tipo === "select") ctrl = '<select id="cpl-cf-' + c.id + '"' + d + ">" + selOpts(c.opcoes, v, "— escolha —") + "</select>";
        else ctrl = '<input id="cpl-cf-' + c.id + '" value="' + esc(v) + '"' + (c.dica ? ' placeholder="' + esc(c.dica) + '"' : "") + d + ">";
        var dicaOrg = "";
        if (vazio(v) && Pr.PORQUE_CAMPO[c.id]) dicaOrg += ' <span class="muted cpl-porque-campo">Por quê? ' + esc(Pr.PORQUE_CAMPO[c.id]) + '</span>';
        if (Org.ORIGEM_NO_CADASTRO[c.id] && vazio(v) && vazio(Org.paraEdital(orgaoCad())[c.id])) dicaOrg = ' <button type="button" class="btn sm" data-gacao="cpl-corrigir" data-passo="orgao" data-campo="' + esc(Org.ORIGEM_NO_CADASTRO[c.id]) + '">Preencher no Cadastro do órgão</button>';
        return campo(esc(c.rotulo.charAt(0).toUpperCase() + c.rotulo.slice(1)) + " *" + selo(p, (onde === "tr" ? "tr." : "edital.") + c.id), ctrl + dicaOrg, c.id);
      }).join("");
    }).join("");
  }
  /* lê os inputs de volta para o objeto; devolve o próprio objeto */
  function lerCampos(obj, p, onde) {
    D.CAMPOS.forEach(function (c) {
      if (c.onde !== onde || !D.campoAplica(c.id, p)) return;
      if (!document.getElementById("cpl-cf-" + c.id)) return;
      obj[c.id] = emBranco(lerCampo("cpl-cf-" + c.id));
    });
    return obj;
  }
  /* ⚠ campo de um bloco que os parâmetros não escolhem (ex.: limite da subcontratação) não está na tela:
     o que já estava gravado fica. Sem isto, salvar a tela apagaria o dado em silêncio. */
  function preservarFora(novo, antesJson) {
    var antes = {}; try { antes = JSON.parse(antesJson) || {}; } catch (e) { antes = {}; }
    Object.keys(antes).forEach(function (k) { if (!(k in novo)) novo[k] = antes[k]; });
    return novo;
  }

  /* ---------- 7. TR / PROJETO BÁSICO ---------- */
  function _pTr(p, x, ed) {
    var d = ed && podeAcao("editar_tr") ? "" : " disabled";
    var t = p.tr || {};
    var h = '<p class="muted">O termo de referência (art. 6º, XXIII) e o projeto básico (art. 6º, XXV) saem do que já está no processo; aqui você completa o que não se deduz.</p>';
    if (p.cronogramaFisico && arr(p.cronogramaFisico.etapas).length) {
      var cf = p.cronogramaFisico, cabM = "";
      for (var mi = 1; mi <= cf.meses; mi++) cabM += '<th class="num">MÊS ' + mi + "</th>";
      h += "<h3>Cronograma físico (lido da pasta)" + selo(p, "cronogramaFisico") + '</h3><table class="tbl" id="cpl-tab-crono"><thead><tr><th>ETAPA</th>' + cabM + "</tr></thead><tbody>" + cf.etapas.map(function (e) {
        return "<tr><td>" + esc(e.nome) + "</td>" + e.pct.map(function (v) { return '<td class="num">' + (v ? numBR(v, 0) + "%" : "—") + "</td>"; }).join("") + "</tr>";
      }).join("") + "</tbody></table>";
    }
    h += '<div class="cpl-form" id="cpl-f-tr">' +
      campo("Descrição do objeto *" + selo(p, "tr.objeto"), '<textarea id="cpl-tr-objeto" rows="3" data-foco="objeto"' + d + ">" + esc(t.objeto != null ? t.objeto : (p.objeto || "")) + "</textarea>" + (vazio(t.objeto) && p.objeto ? '<div class="cpl-sugerido">pré-preenchido com o objeto do passo 1 — confira e salve</div>' : ""), "objeto") +
      campo("Critério de medição *" + selo(p, "tr.medicao"), '<textarea id="cpl-tr-medicao" rows="3" data-foco="medicao"' + d + ">" + esc(t.medicao || "") + "</textarea>", "medicao") +
      campo("Critério de recebimento (provisório e definitivo) *" + selo(p, "tr.recebimento"), '<textarea id="cpl-tr-recebimento" rows="3" data-foco="recebimento"' + d + ">" + esc(t.recebimento || "") + "</textarea>", "recebimento") +
      campo("Pagamento (condições e prazo)", '<textarea id="cpl-tr-pagamento" rows="2"' + d + ">" + esc(t.pagamento || "") + "</textarea>") +
      campo("Gestão e fiscalização do contrato", '<textarea id="cpl-tr-gestao" rows="2"' + d + ">" + esc(t.gestao || "") + "</textarea>") +
      campo("Adequação orçamentária (dotação)", '<input id="cpl-tr-dotacao" value="' + esc(t.dotacao || "") + '"' + d + ">") +
      '<p class="muted">Os campos abaixo o modelo oficial (AGU/SEGES) deixa em branco para o órgão. Sem eles, o termo de referência sai com «[PREENCHER: …]» e o passo «Minuta e anexos» não fecha.</p>' + htmlCampos(p, "tr", d) + "</div>" +
      '<div class="cpl-acoes">' + btn("Salvar TR", "cpl-salvar-tr", d, "primary") + btn("Ver prévia do documento", "cpl-doc-previa", ' data-doc="tr"') + "</div>";
    return h;
  }

  /* ---------- 8. PARÂMETROS ---------- */
  function _pParametros(p, x, ed) {
    var d = ed && podeAcao("editar_parametros") ? "" : " disabled";
    var c = calc(orcDoProc(p));
    var linhas = c ? c.linhas.map(function (l) { return { item: l.numero, descricao: l.descricao, total: l.precoTotal, qtd: l.quantidade, un: l.unidade }; }) : [];
    var sug = C.parametros.sugerir(p, { totalEstimado: c ? c.precoVenda : undefined, linhas: linhas });
    var h = '<p class="muted">Cada linha traz a sugestão do sistema, o porquê e o artigo. Aceite a sugestão ou troque o valor.</p>';
    h += '<table class="tbl" id="cpl-tab-param"><thead><tr><th>PARÂMETRO</th><th>SUGESTÃO</th><th>VALOR</th><th></th></tr></thead><tbody>' + R.PARAMETROS_ORDEM.map(function (id) {
      var def = R.PARAMETROS[id], s = sug[id], v = (p.parametros[id] || {}).valor;
      if ((s.sugerido === null || s.sugerido === undefined) && p.parametros[id] && p.parametros[id].sugerido !== null && p.parametros[id].sugerido !== undefined) { s = { id: id, valor: s.valor, sugerido: p.parametros[id].sugerido, regra: p.parametros[id].regra || s.regra, fonte: s.fonte, conferir: s.conferir, pendencias: s.pendencias }; }
      if (id === "sigiloso" && vazio(v)) v = p.sigiloso;
      var sugTxt = s.sugerido === null || s.sugerido === undefined ? "—" : (typeof s.sugerido === "object" ? _descObj(id, s.sugerido) : (typeof s.sugerido === "boolean" ? (s.sugerido ? "Sim" : "Não") : String(s.sugerido)));
      var ctrl = _ctrlParam(id, def, v, s, d);
      return '<tr data-foco="' + id + '"><td><b>' + esc(def.nome) + "</b>" + selo(p, "parametros." + id + ".valor") + porque(s.regra + " " + (def.como || ""), s.fonte, s.conferir, def.nome) + (s.pendencias.length ? '<div class="cpl-alerta">' + esc(s.pendencias[0]) + "</div>" : "") + "</td><td>" + esc(sugTxt) + "</td><td>" + ctrl + "</td><td>" +
        (s.sugerido !== null && s.sugerido !== undefined && !(id === "reajuste" && vazio(s.sugerido.indice)) ? btn("Aceitar sugestão", "cpl-par-aceitar", ' data-id="' + id + '"' + d, "sm") : "") + "</td></tr>";
    }).join("") + "</tbody></table>";
    /* regulamento + datas */
    var regs = Object.keys(R.REGULAMENTOS).map(function (k) { return [k, R.REGULAMENTOS[k].nome]; });
    var efet = C.pesquisaPrecos.regulamentoEfetivo(p), cron = p.cronograma || {};
    h += '<div class="cpl-form" id="cpl-f-prazos"><h3>Regulamento, publicação e abertura</h3>' +
      campo("Regulamento de pesquisa de preços" + selo(p, "regulamentoId"), '<select id="cpl-regulamento" data-foco="regulamentoId"' + (p.recursoFederal === true ? " disabled" : d) + ">" + selOpts(regs, p.recursoFederal === true ? "federal-14133" : p.regulamentoId, "— escolha —") + "</select>" +
        (p.recursoFederal === true ? '<div class="cpl-sug">Há recurso federal: vale o regulamento federal.</div>' : "") + (efet ? porque(efet.fonte, efet.fonte, efet.conferir === true, "Regulamento efetivo") : ""), "regulamentoId") +
      campo("Data de publicação do edital *", '<input id="cpl-dataEdital" type="date" data-foco="dataPrevistaEdital" value="' + esc(p.dataPrevistaEdital || "") + '"' + d + ">", "dataPrevistaEdital") +
      campo("Data de abertura das propostas", '<input id="cpl-dataAbertura" type="date" data-foco="dataAbertura" value="' + esc(cron.dataAbertura || "") + '"' + d + ">", "dataAbertura") +
      campo("Feriados locais (um por linha, AAAA-MM-DD)", '<textarea id="cpl-feriados" rows="2"' + d + ">" + esc(arr(p.feriadosLocais).join("\n")) + "</textarea>") +
      _campoNatureza(p, d) + "</div>";
    var pz = F.prazo(p);
    h += '<div class="cpl-prazo" id="cpl-prazo">';
    if (pz.diasUteis) {
      h += "<p><b>Prazo mínimo:</b> " + pz.diasUteis + " dias úteis desde a publicação" + (pz.natureza && pz.regra && /menor_preco/.test(pz.regra.id) ? " (" + (pz.natureza === "comum" ? "obra ou serviço comum" : "obra ou serviço especial") + (pz.naturezaMarcadaEspecial ? ", marcado como especial" : ", padrão do tipo de objeto") + ")" : "") + (pz.dataMinimaAbertura ? " → <b>abertura a partir de " + esc(dataBR(pz.dataMinimaAbertura)) + "</b>" : "") + "." +
        porque((pz.regra ? pz.regra.descricao + ". " : "") + pz.contagem, pz.fonte, pz.regra && pz.regra.conferir === false ? false : pz.conferir, "Prazo mínimo") + "</p>";
      if (pz.aberturaOk === false) h += '<p class="cpl-alerta">A data de abertura informada está antes do mínimo legal.</p>';
    }
    arr(pz.pendencias).forEach(function (m) { h += '<p class="cpl-alerta">' + esc(m) + "</p>"; });
    h += "</div>";
    return h + '<div class="cpl-acoes">' + btn("Salvar datas e regulamento", "cpl-par-datas", d, "primary") + "</div>";
  }
  /* natureza para o prazo do art. 55, II: padrão pelo tipo de objeto; «especial» só marcado, com justificativa */
  function _campoNatureza(p, d) {
    var ni = F.naturezaInfo(p), ne = p.naturezaEspecial || {};
    if (!ni.padrao) return "";
    return campo("Natureza do objeto para o prazo do art. 55" + porque("O prazo mínimo de menor preço/maior desconto é de 10 dias úteis para obra e serviço COMUM de engenharia (alínea a) e de 25 dias úteis para obra e serviço ESPECIAL (alínea b). O sistema trata como comum: obra nova, reforma, ampliação, pavimentação, drenagem, saneamento, manutenção e serviço comum. Marque «especial» só com justificativa técnica.", "Lei 14.133/2021, art. 55, II, alíneas a e b", true, "Natureza do objeto"),
      '<label class="cpl-nat"><input type="checkbox" id="cpl-nat-esp"' + (ni.marcada || ne.ativo === true ? " checked" : "") + d + '> Tratar como obra/serviço <b>especial</b> de engenharia (25 dias úteis)</label>' +
      '<textarea id="cpl-nat-just" rows="2" placeholder="Justificativa técnica da natureza especial (obrigatória)" data-foco="naturezaEspecial"' + d + ">" + esc(ne.justificativa || "") + "</textarea>" +
      '<div class="cpl-sug">Padrão do tipo de objeto: <b>' + (ni.padrao === "comum" ? "comum" : "especial") + "</b>.</div>", "naturezaEspecial");
  }
  function _descObj(id, v) {
    if (id === "parcelas_relevancia") return arr(v).length + " parcela(s)";
    if (id === "garantia_contrato") return "até " + v.pctMax + "% (até " + v.pctMaxComJustificativa + "% com justificativa)" + (v.grandeVulto ? "; seguro-garantia com retomada até " + v.seguroGarantiaRetomadaPctMax + "%" : "");
    if (id === "exequibilidade") return "inexequível abaixo de " + v.inexequivelAbaixoPct + "%; garantia adicional abaixo de " + v.garantiaAdicionalAbaixoPct + "%";
    if (id === "aditivo_teto") return "acréscimo até " + v.acrescimoPct + "%, supressão até " + v.supressaoPct + "%";
    if (id === "recurso_prazo") return v.diasUteis + " dias úteis";
    if (id === "reajuste") return (v.indice ? "índice " + v.indice : "índice a escolher") + "; data-base " + (v.dataBase ? dataBR(v.dataBase) : "—");
    return JSON.stringify(v);
  }
  function _ctrlParam(id, def, v, s, d) {
    if (def.resposta === "bool") return selSn("cpl-par-" + id, v === true || v === false ? v : null, id, d);
    if (def.resposta === "texto") {
      /* modalidades do art. 28 da Lei 14.133 (o motor não traz lista para este parâmetro) */
      var ops = (def.opcoes || (id === "modalidade" ? MODALIDADES : [])).slice();
      if (v && ops.indexOf(v) < 0) ops.push(v);
      return '<select id="cpl-par-' + id + '" data-foco="' + id + '"' + d + ">" + selOpts(ops, v, "— escolha —") + "</select>";
    }
    if (id === "garantia_contrato") return '<input id="cpl-par-' + id + '" data-foco="' + id + '" inputmode="decimal" style="width:90px" placeholder="% exigido" value="' + esc(v && v.pct != null ? v.pct : "") + '"' + d + "> % " + (v && v.pct != null ? "" : "");
    if (id === "reajuste") return '<input id="cpl-par-reaj-i" data-foco="reajuste" placeholder="Índice (ex.: INCC-DI)" value="' + esc(v && v.indice ? v.indice : "") + '"' + d + '> <input id="cpl-par-reaj-d" type="date" aria-label="Data-base" value="' + esc(v && v.dataBase ? v.dataBase : (s.sugerido && s.sugerido.dataBase) || "") + '"' + d + ">";
    if (v !== null && v !== undefined && v !== "") return esc(_descObj(id, v));
    return '<span class="muted">sem valor</span>';
  }

  /* ---------- 9. DOCUMENTOS ---------- */
  function _pMinuta(p, x, ed) {
    var d = ed && podeAcao("gerar_minuta") ? "" : " disabled";
    var g = D.gerar(p, ctxDocs(p)), val_ = F.pacoteValido(p), pdoc = p.pacote || {};
    var h = '<p class="muted">O nome e o logo do órgão vêm de Empresa (Configurações). Os documentos saem do que está no processo. Campo em branco vira <b class="cpl-pre-ex">[PREENCHER: …]</b> em vermelho; o passo só fica pronto com <b>nenhum</b> campo desses.</p>';
    h += '<table class="tbl" id="cpl-tab-docs"><thead><tr><th>DOCUMENTO</th><th>USO</th><th>MODELO</th><th class="num">CAMPOS EM BRANCO</th><th></th></tr></thead><tbody>' + g.docs.map(function (doc) {
      return "<tr><td><b>" + esc(doc.nome) + "</b></td><td>" + (doc.publico ? M.pilula("público", "info") : M.pilula("interno", "neutro")) + "</td><td>" + (modeloDoTipo(doc.id) ? M.pilula("do órgão", "ok") : M.pilula("padrão da casa", "neutro")) + '</td><td class="num">' + (doc.pendentes ? M.pilula(String(doc.pendentes), "alerta") : M.pilula("0", "ok")) + "</td><td>" +
        btn("Prévia", "cpl-doc-previa", ' data-doc="' + doc.id + '"', "sm") + " " + btn("Baixar .docx", "cpl-doc-baixar", ' data-doc="' + doc.id + '"' + dis(podeAcao("gerar_minuta") || podeAcao("ler_tudo"), "Seu perfil não baixa documentos do processo."), "sm") +
        (modeloDoTipo(doc.id) ? " " + btn("Baixar no padrão da casa", "cpl-doc-baixar-padrao", ' data-doc="' + doc.id + '"' + dis(podeAcao("gerar_minuta") || podeAcao("ler_tudo"), "Seu perfil não baixa documentos do processo."), "sm") : "") + "</td></tr>";
    }).join("") + "</tbody></table>";
    h += "<p>" + (val_ ? M.pilula("Documentos gerados em " + dataHoraBR(pdoc.geradoEm), "ok") : (g.pendentes ? M.pilula(g.pendentes + " campo(s) em branco no total", "alerta") : M.pilula("ainda não gerados", "neutro"))) + "</p>";
    if (!val_ && pdoc.invalidadoEm) h += '<p class="cpl-alerta">A minuta gerada deixou de valer: ' + esc(pdoc.motivo || "o processo mudou") + ". Gere de novo.</p>";
    var e = p.edital || {}, dm = ed && podeAcao("gerar_minuta") ? "" : " disabled";
    var fOrg = faltaDoOrgao(p);
    if (fOrg.length) h += M.aviso({ tom: "alerta", titulo: fOrg.length + " dado(s) do órgão sem cadastro", texto: fOrg.map(function (x) { return x.rotulo; }).join("; ") + ".", acaoHtml: '<button type="button" class="btn sm" id="cpl-ir-orgao" data-gacao="cpl-corrigir" data-passo="orgao" data-campo="' + esc(fOrg[0].cadastroId) + '">Abrir o Cadastro do órgão</button>' });
    h += '<div class="cpl-acoes">' + btn("Aplicar padrões do órgão e de rotina", "cpl-padroes", dm, "") + ' <span class="muted">Preenche, com o selo «sugerido — confira», só o que está em branco ou foi escrito pelo sistema.</span></div>';
    h += '<h3>Dados que completam a minuta</h3><div class="cpl-form" id="cpl-f-edital">' +
      campo("Número do edital" + selo(p, "edital.numero"), '<input id="cpl-ed-numero" value="' + esc(e.numero || "") + '"' + dm + ">") +
      campo("Documentos de habilitação exigidos" + selo(p, "edital.habilitacao"), '<textarea id="cpl-ed-habilitacao" rows="3"' + dm + ">" + esc(e.habilitacao || "") + "</textarea>") +
      campo("Complemento do regime de sanções do edital (opcional)", '<textarea id="cpl-ed-sancoes" rows="2"' + dm + ">" + esc(e.sancoes || "") + "</textarea>") +
      campo("Vigência e prazo de execução do contrato" + selo(p, "edital.vigencia"), '<input id="cpl-ed-vigencia" value="' + esc(e.vigencia || "") + '"' + dm + ">") +
      campo("Complemento do contrato: extinção e sanções contratuais (opcional)", '<textarea id="cpl-ed-rescisao" rows="2"' + dm + ">" + esc(e.rescisaoForo || "") + "</textarea>") +
      '<p class="muted">Os campos abaixo o modelo oficial (AGU/SEGES) deixa em branco para o órgão. Cada um entra no edital ou no contrato no lugar do «XXXX» do modelo; sem eles o texto sai com «[PREENCHER: …]».</p>' + htmlCampos(p, "edital", dm) + "</div>" +
      '<div class="cpl-acoes">' + btn("Salvar dados da minuta", "cpl-salvar-edital", dm, "") + "</div>";
    h += '<div class="cpl-acoes">' + btn("Gerar documentos", "cpl-gerar", dis(ed && podeAcao("gerar_minuta"), !podeAcao("gerar_minuta") ? motivoAcao("gerar_minuta") : F.motivoTravado(p)), "primary") + (g.pendentes ? '<span class="muted">Com campos em branco os documentos podem ser baixados como rascunho, mas o passo não fica pronto.</span>' : "") + "</div>";
    return h;
  }

  /* ---------- 10. CONFORMIDADE E PUBLICAÇÃO ---------- */
  function _pConformidade(p, x, ed) {
    var c = calc(orcDoProc(p)), pq = c ? F.pesquisar(p, c.linhas, modoDoOrc(c)) : null;
    var lista = F.conformidade(p, { pesquisa: pq });
    var h = '<table class="tbl" id="cpl-tab-conf"><thead><tr><th>VERIFICAÇÃO</th><th>ARTIGO</th><th>SITUAÇÃO</th><th></th></tr></thead><tbody>' + lista.map(function (it) {
      return "<tr><td>" + esc(it.texto) + (it.detalhe && !it.ok ? '<div class="muted">' + esc(it.detalhe) + "</div>" : "") + "</td><td>" + esc(it.artigo) + "</td><td>" + (it.ok ? M.pilula("ok", "ok") : M.pilula("pendente", "alerta")) + "</td><td>" +
        (!it.ok && it.passo && it.passo !== "conformidade" ? btn("Corrigir", "cpl-corrigir", ' data-passo="' + it.passo + '" data-campo=""', "sm") : "") + "</td></tr>";
    }).join("") + "</tbody></table>";
    var st = p.status, pa = p.parecer;
    /* --- envio ao jurídico --- */
    h += "<h3>Jurídico (art. 53)</h3>";
    var blEnvio = F.bloqueiosEnvio(p), reenvio = st !== "rascunho" && st !== "devolvido", podeEnv = podeAcao("enviar_juridico") && F.podeReenviar(p) && !blEnvio.length;
    var motEnv = !podeAcao("enviar_juridico") ? motivoAcao("enviar_juridico") : (!F.podeReenviar(p) ? "O processo está «" + (F.STATUS_ROTULO[st] || st) + "»." : (blEnvio[0] || ""));
    if (F.podeReenviar(p)) h += '<div class="cpl-acoes">' + btn(reenvio ? "Enviar de novo ao jurídico (o processo mudou)" : "Enviar ao jurídico", "cpl-enviar-jur", dis(podeEnv, motEnv), "primary") + (blEnvio.length ? '<span class="muted">' + esc(blEnvio[0]) + "</span>" : "") + "</div>";
    if (st === "em_analise_juridica") {
      h += M.aviso({ tom: "info", titulo: "Aguardando parecer do jurídico.", texto: "As peças ficam trancadas até o parecer." });
      var podeEmitir = podeAcao("emitir_parecer");
      h += '<div class="cpl-form" id="cpl-f-parecer"><h4>Parecer do jurídico</h4>' + campo("Resultado", '<select id="cpl-par-res"' + dis(podeEmitir, motivoAcao("emitir_parecer")) + ">" + selOpts([["favoravel", "Favorável"], ["com_ressalvas", "Favorável com ressalvas"], ["desfavoravel", "Desfavorável"]], "", "— escolha —") + "</select>") +
        campo("Texto do parecer", '<textarea id="cpl-par-txt" rows="4"' + dis(podeEmitir, motivoAcao("emitir_parecer")) + "></textarea>") +
        campo("Ressalvas (uma por linha — só no parecer com ressalvas)", '<textarea id="cpl-par-ress" rows="3"' + dis(podeEmitir, motivoAcao("emitir_parecer")) + "></textarea>") +
        "</div>" + '<div class="cpl-acoes">' + btn("Emitir parecer", "cpl-emitir-parecer", dis(podeEmitir, motivoAcao("emitir_parecer")), "primary") + "</div>";
    }
    if (pa) {
      h += '<div class="cpl-parecer" id="cpl-parecer"><p><b>Parecer:</b> ' + esc({ favoravel: "favorável", com_ressalvas: "favorável com ressalvas", desfavoravel: "desfavorável" }[pa.resultado] || pa.resultado) + " · " + esc(pa.emitidoPor || "") + " em " + esc(dataHoraBR(pa.emitidoEm)) + "</p><p>" + esc(pa.texto) + "</p>";
      if (arr(pa.ressalvas).length) {
        h += '<table class="tbl" id="cpl-tab-ress"><thead><tr><th>#</th><th>RESSALVA</th><th>RESPOSTA</th><th></th></tr></thead><tbody>' + pa.ressalvas.map(function (r) {
          var pode = podeAcao("responder_ressalva") && !r.respondida && st === "com_ressalvas";
          return "<tr><td>" + (r.idx + 1) + "</td><td>" + esc(r.texto) + "</td><td>" + (r.respondida ? esc(r.resposta) + '<div class="muted">por ' + esc(r.respondidoPor || "") + "</div>" : '<input id="cpl-rr-' + r.idx + '" style="min-width:240px" placeholder="Resposta da CPL"' + dis(pode, !podeAcao("responder_ressalva") ? motivoAcao("responder_ressalva") : "") + ">") + "</td><td>" +
            (r.respondida ? M.pilula("respondida", "ok") : btn("Responder", "cpl-resp-ress", ' data-i="' + r.idx + '"' + dis(pode, !podeAcao("responder_ressalva") ? motivoAcao("responder_ressalva") : "Só com o parecer com ressalvas."), "sm")) + "</td></tr>";
        }).join("") + "</tbody></table>";
        if (st === "com_ressalvas") {
          var todas = pa.ressalvas.every(function (r) { return r.respondida; });
          h += '<div class="cpl-acoes">' + btn("Dar ciência às respostas (jurídico)", "cpl-ciencia", dis(podeAcao("emitir_parecer") && todas, !podeAcao("emitir_parecer") ? motivoAcao("emitir_parecer") : "Ainda há ressalva sem resposta."), "") + "</div>";
        }
      }
      if (pa.ciencia) h += "<p>Ciência do jurídico: " + esc(pa.ciencia.por || "") + " em " + esc(dataHoraBR(pa.ciencia.em)) + ".</p>";
      h += "</div>";
    }
    /* --- autorização e publicação --- */
    h += "<h3>Autorização e publicação</h3>";
    var bl = F.bloqueiosPublicacao(p), podeAutorizar = podeAcao("autorizar_abertura") && C.fluxoJuridico.podePublicar(p) && st !== "publicado";
    if (st === "publicado") {
      var pb = p.publicacao || {};
      h += M.aviso({ tom: "ok", titulo: "Edital publicado.", texto: "Publicado em " + dataHoraBR(pb.publicadoEm) + " por " + (pb.publicadoPor || "—") + ", autorizado por " + (pb.autorizadoPor || "—") + ". Abertura: " + dataBR(pb.dataAbertura) + "." });
    } else {
      h += "<p>" + (p.autorizacao && p.autorizacao.assinatura === F.assinaturaConteudo(p) ? M.pilula("Abertura autorizada por " + (p.autorizacao.por || "") + " em " + dataHoraBR(p.autorizacao.em), "ok") : M.pilula("sem autorização válida", "alerta")) + "</p>";
      var motAut = !podeAcao("autorizar_abertura") ? motivoAcao("autorizar_abertura") : (!C.fluxoJuridico.podePublicar(p) ? "A autorização vem depois do parecer favorável." : "");
      var podePub = podeAcao("publicar") && !bl.length, motPub = !podeAcao("publicar") ? motivoAcao("publicar") : (bl[0] || "");
      h += '<div class="cpl-acoes">' + btn("Autorizar a abertura (autoridade)", "cpl-autorizar", dis(podeAutorizar, motAut)) + btn("Publicar o edital", "cpl-publicar", dis(podePub, motPub), "primary") + "</div>";
      if (bl.length) h += '<ul class="cpl-bloqueios" id="cpl-bloqueios">' + bl.map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("") + "</ul>";
    }
    return h;
  }

  /* ---------- PROPOSTAS ---------- */
  function _propostas(p) {
    var pode = podeAcao("analisar_propostas"), d = pode ? "" : " disabled";
    var props = arr(p.propostas), ref = p.referenciaPublicada;
    var h = '<input type="file" id="cpl-arq-prop" accept=".xlsx,.xls,.xlsm" hidden>';
    h += _habilitacao(p);
    h += "<h3>Propostas de preço</h3>";
    h += '<div class="cpl-acoes">' + campo("Nome do licitante", '<input id="cpl-lic-nome" placeholder="Razão social"' + d + ">") + btn("Importar planilha da proposta (.xlsx)", "cpl-prop-importar", dis(pode, motivoAcao("analisar_propostas")), "primary") +
      '<span class="muted">Aceita o .xlsx de proposta do OrçaPRO / CertamePRO.</span></div>';
    var blocoResultado = '<div class="cpl-form"><h3>Resultado</h3>' + campo("Resultado divulgado em", '<input id="cpl-resultadoEm" type="date" value="' + esc(p.resultadoEm || "") + '"' + d + ">") + btn("Salvar data", "cpl-resultado-data", d, "sm") +
      (p.resultadoEm ? "<p>Fim do prazo de recurso: <b>" + esc(dataBR(F.fimPrazoRecurso(p))) + "</b></p>" : "") + "</div>";
    if (!props.length) return h + M.vazio({ icone: "documentos", titulo: "Nenhuma proposta importada", texto: "Importe a planilha de cada licitante. O sistema compara com a referência e sugere; a decisão é sempre do servidor." }) + blocoResultado;
    h += blocoResultado;
    props.forEach(function (pr) { h += _cartaoProposta(p, pr, pode, d); });
    h += _quadroComparativo(p, props, ref);
    return h;
  }
  function _cartaoProposta(p, pr, pode, d) {
    var an = pr.analise || { achados: [], sugestao: "ok" };
    var tom = { ok: "ok", diligencia: "alerta", desclassificar: "erro" }[an.sugestao] || "neutro", rot = { ok: "sem achado que exija providência", diligencia: "sugere diligência", desclassificar: "sugere desclassificar" }[an.sugestao];
    var dec = pr.decisao;
    var h = '<section class="cpl-prop" data-id="' + esc(pr.id) + '"><h3>' + esc(pr.licitante || "(sem nome)") + " " + M.pilula(rot, tom) + (dec ? " " + M.pilula("decisão: " + dec.acao, dec.acao === "desclassificar" ? "erro" : "ok") : "") + "</h3>";
    h += '<p class="muted">' + esc(pr.arquivo || "") + " · " + pr.linhas.length + " item(ns) · total da proposta " + moeda(an.resumo ? an.resumo.totalProposta : null) + " · " + esc(pr.colunas || "") + "</p>";
    if (an.achados.length) {
      h += '<table class="tbl"><thead><tr><th>ITEM</th><th>ACHADO</th><th>ESPERADO</th><th>ENCONTRADO</th><th>SUGESTÃO</th></tr></thead><tbody>' + an.achados.map(function (a) {
        return "<tr><td>" + esc(a.item) + "</td><td>" + esc(a.tipo.replace(/_/g, " ")) + "</td><td>" + esc(a.esperado) + "</td><td>" + esc(a.encontrado) + "</td><td>" + esc({ ok: "ok", diligencia: "diligência", desclassificar: "desclassificar" }[a.sugestao] || a.sugestao) + porque("Fundamento do achado: " + a.fonte + ". A sugestão é da casa; só o texto da lei manda desclassificar.", a.fonte, true, "Achado da proposta") + "</td></tr>";
      }).join("") + "</tbody></table>";
    } else h += '<p class="muted">Nenhum achado: a planilha bate com a referência.</p>';
    h += '<div class="cpl-acoes">' + btn("Classificar", "cpl-prop-decidir", ' data-id="' + esc(pr.id) + '" data-acao="classificar"' + d, "sm") + btn("Pedir diligência", "cpl-prop-decidir", ' data-id="' + esc(pr.id) + '" data-acao="diligencia"' + d, "sm") + btn("Desclassificar", "cpl-prop-decidir", ' data-id="' + esc(pr.id) + '" data-acao="desclassificar"' + d, "sm") +
      btn("Parecer de análise (.docx)", "cpl-prop-doc", ' data-id="' + esc(pr.id) + '" data-tipo="parecer"', "sm ghost") + btn("Termo de diligência (.docx)", "cpl-prop-doc", ' data-id="' + esc(pr.id) + '" data-tipo="diligencia"' + dis(!!(dec && dec.acao === "diligencia"), "Disponível depois que o servidor decidir pela diligência."), "sm ghost") +
      btn("Comunicado de desclassificação (.docx)", "cpl-prop-doc", ' data-id="' + esc(pr.id) + '" data-tipo="desclassificacao"' + dis(!!(dec && dec.acao === "desclassificar"), "Disponível depois que o servidor decidir desclassificar."), "sm ghost") + "</div></section>";
    return h;
  }
  function _quadroComparativo(p, props, ref) {
    if (!ref) return "";
    var cols = props.map(function (pr) { return pr; });
    var h = "<h3>Quadro comparativo</h3>" + '<table class="tbl" id="cpl-quadro"><thead><tr><th>ITEM</th><th>DESCRIÇÃO</th><th class="num">REFERÊNCIA (unit.)</th>' + cols.map(function (pr) { return '<th class="num">' + esc(pr.licitante || "—") + "</th>"; }).join("") + "</tr></thead><tbody>" + ref.linhas.map(function (l) {
      var vals = cols.map(function (pr) { var q = pr.linhas.filter(function (z) { return String(z.item).trim() === String(l.item).trim(); })[0]; return q && typeof q.unitario === "number" ? q.unitario : null; });
      var menor = null; vals.forEach(function (v) { if (v !== null && (menor === null || v < menor)) menor = v; });
      return "<tr><td>" + esc(l.item) + "</td><td>" + esc(l.descricao) + '</td><td class="num">' + numBR(l.unitario, 2) + "</td>" + vals.map(function (v) { return '<td class="num' + (v !== null && v === menor && cols.length > 1 ? " cpl-menor" : "") + '">' + (v === null ? "—" : numBR(v, 2)) + "</td>"; }).join("") + "</tr>";
    }).join("") + '</tbody><tfoot><tr><th colspan="2">TOTAL</th><th class="num">' + numBR(ref.total, 2) + "</th>" + cols.map(function (pr) { return '<th class="num">' + (pr.analise && pr.analise.resumo ? numBR(pr.analise.resumo.totalProposta, 2) : "—") + "</th>"; }).join("") + "</tr></tfoot></table>";
    return h;
  }

  /* ---------- HABILITAÇÃO DOS LICITANTES (leva E1) ----------
   * Lê os documentos do licitante pelo serviço do CertamePRO (js/cplprohab.js) e organiza a decisão do servidor.
   * ⚠ O serviço só sugere, com prova. Nada muda sozinho: cada exigência pede o clique de quem tem o papel de CPL.
   * ⚠ O token do pareamento mora SÓ no localStorage deste aparelho (Hab.lerPareamento) — nunca no processo, nunca na nuvem. */
  var habArquivos = [];          /* File[] escolhidos (ficam na memória, não na tela: re-render não perde) */
  var habOcupado = false;
  function storageLocal() { try { return global.localStorage; } catch (e) { return null; } }
  /* o serviço é o oficial; para teste local, só um endereço de loopback guardado neste aparelho (Hab.destino recusa qualquer outro host) */
  function servicoAtual() {
    var s = storageLocal(), alt = "";
    try { alt = s ? s.getItem("orcapro:cplpro:servico") || "" : ""; } catch (e) { alt = ""; }
    var d = alt ? H.destino(alt) : null;
    return d && d.ok ? d.url : H.SERVICO_OFICIAL;
  }
  function pareamento() { var s = storageLocal(); return s ? H.lerPareamento(s, eid()) : null; }
  function cfgServico() {
    var par = pareamento();
    return { fetch: function (u, o) { return global.fetch(u, o); }, FormData: global.FormData, servico: servicoAtual(), token: par ? par.token : "" };
  }
  function msgErroHab(e) { return e && e.mensagem ? e.mensagem : (e && e.message ? e.message : "Não consegui concluir. Nada foi gravado no processo."); }
  function tomSit(s) { return (H.SITUACOES[s] || {}).tom || "neutro"; }

  function _habPareamento(p) {
    var st = storageLocal() ? H.estadoPareamento(storageLocal(), eid()) : { pareado: false };
    var h = '<div class="cpl-hab-par" id="cpl-hab-par">';
    if (st.pareado) {
      h += M.pilula("conectado ao CertamePRO", "ok") + ' <span class="muted">Conta ' + esc(st.usuario || "—") + " · desde " + esc(dataHoraBR(st.pareadoEm)) + ". O acesso fica só neste aparelho.</span>";
      h += '<div class="cpl-acoes">' + btn("Desligar este aparelho", "cpl-hab-desligar", dis(podeAcao("gerenciar_logins"), motivoAcao("gerenciar_logins")), "sm ghost") + "</div>";
      if (G._cplHabRepar) h += M.aviso({ tom: "erro", titulo: "O CertamePRO recusou esta conexão.", texto: "Desligue e conecte de novo com um código novo (gerado pelo administrador do CertamePRO)." });
    } else {
      var pode = podeAcao("gerenciar_logins");
      h += M.aviso({ tom: "info", titulo: "Conecte o CPLPRO ao CertamePRO para ler a habilitação automaticamente.",
        texto: "O administrador do órgão gera um código de pareamento no CertamePRO (tipo «órgão») e o digita aqui, uma vez por aparelho. Sem a conexão, a habilitação continua sendo conferida à mão pela comissão." });
      h += '<div class="cpl-acoes">' + campo("Código de pareamento do CertamePRO", '<input id="cpl-hab-codigo" autocomplete="off" spellcheck="false" placeholder="Cole o código aqui"' + (pode ? "" : " disabled") + ">") +
        btn("Conectar", "cpl-hab-parear", dis(pode, motivoAcao("gerenciar_logins")), "primary") + "</div>";
    }
    return h + "</div>";
  }
  function _habForm(p, pode) {
    var par = !!pareamento(), d = pode ? "" : " disabled", aviso = H.exigenciasDoProcesso(p).avisos;
    var ds = H.dataSessaoDoProcesso(p) || "";
    var h = '<div class="cpl-form" id="cpl-hab-form"><h3>Analisar um licitante</h3>';
    h += '<div class="cpl-acoes">' + campo("CNPJ do licitante *", '<input id="cpl-hab-cnpj" placeholder="00.000.000/0000-00"' + d + ">") + campo("Razão social", '<input id="cpl-hab-razao" placeholder="Razão social"' + d + ">") +
      campo("Data da sessão *", '<input id="cpl-hab-sessao" type="date" value="' + esc(ds) + '"' + d + ">") + "</div>";
    h += '<p class="muted">A validade das certidões é conferida na <b>data da sessão</b>, não na de hoje.</p>';
    h += '<input type="file" id="cpl-hab-arq" accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,.bmp,.gif,.webp,.docx,.xlsx,.zip" multiple hidden>' +
      '<input type="file" id="cpl-hab-pasta" webkitdirectory multiple hidden>';
    h += '<div class="cpl-acoes">' + btn("Escolher arquivos", "cpl-hab-arquivos", dis(pode, motivoAcao("analisar_propostas")), "sm") + btn("Escolher a pasta do licitante", "cpl-hab-pasta", dis(pode, motivoAcao("analisar_propostas")), "sm") +
      btn("Limpar escolha", "cpl-hab-limpar", "", "sm ghost") + '<span class="muted" id="cpl-hab-sel">' + (habArquivos.length ? habArquivos.length + " arquivo(s) escolhido(s)" : "nenhum arquivo escolhido") + "</span></div>";
    h += '<div class="cpl-acoes">' + btn("Analisar habilitação", "cpl-hab-analisar", dis(pode && par, !pode ? motivoAcao("analisar_propostas") : "Conecte o CPLPRO ao CertamePRO primeiro (acima)."), "primary") +
      '<span class="muted" id="cpl-hab-status" role="status"></span></div>';
    if (aviso.length) h += '<ul class="cpl-bloqueios" id="cpl-hab-avisos">' + aviso.map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("") + "</ul>";
    h += '<p class="muted">Os arquivos vão ao serviço só para esta análise e são apagados de lá ao fim. O sistema compara com a ficha de exigências deste processo e <b>apenas sugere</b>; a decisão é sua, exigência por exigência.</p>';
    return h + "</div>";
  }
  function _habLinhaExigencia(p, lic, r, pode) {
    var e = arr(lic.exigencias).filter(function (x) { return x.id === r.id; })[0] || { descricao: r.id, grupo: "" }, d = lic.decisoes[r.id];
    var sug = { atende: "atende", nao_atende: "nao_atende", diligencia: "diligencia" }[r.situacao] || "", atual = d ? d.situacao : sug;
    var provas = arr(r.provas).map(function (x) { return esc(x.arquivo) + (x.pagina ? ", p. " + esc(x.pagina) : "") + (x.trecho ? ' — «' + esc(x.trecho) + "»" : ""); });
    var h = '<tr data-ex="' + esc(r.id) + '"><td><b>' + esc(r.id) + "</b><br>" + esc(e.descricao) + "</td>";
    h += "<td>" + M.pilula((H.SITUACOES[r.situacao] || {}).nome || r.situacao, tomSit(r.situacao)) + '<br><span class="muted">' + esc(r.motivo) + "</span>" +
      (r.regra ? porque("Regra aplicada pelo serviço: " + r.regra, "contrato de análise de habilitação", false, "Regra") : "") + "</td>";
    h += "<td>" + (provas.length ? provas.join("<br>") : '<span class="muted">sem prova</span>') + "</td>";
    var opts = '<option value="">— escolha —</option>' + H.DECISAO_ORDEM.map(function (k) { return '<option value="' + k + '"' + (k === atual ? " selected" : "") + ">" + esc(H.DECISOES[k].nome) + "</option>"; }).join("");
    h += "<td>" + (d ? M.pilula((d.origem === "confirmado" ? "confirmado: " : "alterado: ") + H.DECISOES[d.situacao].curto, ABR_INAB(d.situacao) ? "erro" : (d.situacao === "diligencia" ? "alerta" : "ok")) + '<br><span class="muted">' + esc(d.por || "") + " · " + esc(dataBR(d.em)) + (d.motivo ? " · " + esc(d.motivo) : "") + "</span><br>" : M.pilula("pendente de decisão", "alerta") + "<br>");
    h += '<select class="cpl-hab-sel" aria-label="Decisão da exigência ' + esc(r.id) + '"' + (pode ? "" : " disabled") + ">" + opts + "</select> " +
      '<input class="cpl-hab-mot" placeholder="Motivo (obrigatório ao alterar)" aria-label="Motivo da decisão ' + esc(r.id) + '"' + (pode ? "" : " disabled") + "> " +
      btn(d ? "Alterar" : "Registrar", "cpl-hab-decidir", ' data-lic="' + esc(lic.id) + '" data-ex="' + esc(r.id) + '"' + (pode ? "" : " disabled"), "sm") + "</td></tr>";
    return h;
  }
  function ABR_INAB(s) { return s === "nao_atende" || s === "nao_apresentou"; }
  function _habCartao(p, lic, pode) {
    var c = H.consolidar(lic), n = H.ordem(p, lic.id), pgs = H.podeGerar;
    var tom = { habilitado: "ok", inabilitado: "erro", em_diligencia: "alerta", pendente: "alerta", sem_analise: "neutro" }[c.status];
    var h = '<section class="cpl-prop cpl-hab-lic" data-lic="' + esc(lic.id) + '"><h3>Licitante ' + n + " — " + esc(lic.razaoSocial || "(sem razão social)") + " " + M.pilula(H.STATUS_ROTULO[c.status], tom) + "</h3>";
    h += '<p class="muted">CNPJ ' + esc(H.mascaraCnpj(lic.cnpj)) + " · sessão " + esc(dataBR(lic.dataSessao)) + " · " + arr(lic.resultados).length + " exigência(s): " + c.atendidas.length + " atendida(s), " + c.diligencia.length + " em diligência, " + c.inabilita.length + " inabilitante(s), " + c.pendentes.length + " pendente(s)</p>";
    var ll = lic.licitanteLido || {};
    if (ll.confere === false) h += M.aviso({ tom: "alerta", titulo: "O CNPJ lido nos documentos (" + esc(H.mascaraCnpj(ll.cnpjLido || "")) + ") não confere com o informado.", texto: "Confira se os arquivos são mesmo deste licitante." });
    if (ll.sancoes && ll.sancoes.situacao) h += '<p class="muted">Sanções (CEIS/CNEP): ' + esc(ll.sancoes.situacao) + (ll.sancoes.texto ? " — " + esc(ll.sancoes.texto) : "") + "</p>";
    arr(lic.avisos).forEach(function (a) { h += '<p class="muted">Aviso do serviço: ' + esc(a) + "</p>"; });
    var porGrupo = {};
    arr(lic.resultados).forEach(function (r) { var e = arr(lic.exigencias).filter(function (x) { return x.id === r.id; })[0] || {}; (porGrupo[e.grupo || "outros"] = porGrupo[e.grupo || "outros"] || []).push(r); });
    H.GRUPOS.concat([{ id: "outros", nome: "Outras" }]).forEach(function (g) {
      if (!porGrupo[g.id]) return;
      h += "<details open><summary><b>" + esc(g.nome) + "</b> (" + porGrupo[g.id].length + ")</summary>" +
        '<table class="tbl cpl-hab-tab"><thead><tr><th>EXIGÊNCIA</th><th>RESULTADO DO SERVIÇO</th><th>PROVA</th><th>SUA DECISÃO</th></tr></thead><tbody>' +
        porGrupo[g.id].map(function (r) { return _habLinhaExigencia(p, lic, r, pode); }).join("") + "</tbody></table></details>";
    });
    if (c.diligencia.length) {
      h += '<div class="cpl-acoes"><label>Prazo da resposta do licitante (escolha da comissão) ' + '<input type="date" class="cpl-hab-prazo" value="' + esc((lic.diligencia && lic.diligencia.prazo) || "") + '"' + (pode ? "" : " disabled") + "></label>" +
        btn("Salvar prazo", "cpl-hab-prazo", ' data-lic="' + esc(lic.id) + '"' + (pode ? "" : " disabled"), "sm") + "</div>";
    }
    function docBtn(tipo, rot) {
      var g = pgs(tipo, p, lic.id, papeis());
      return btn(rot, "cpl-hab-doc", ' data-lic="' + esc(lic.id) + '" data-tipo="' + tipo + '"' + dis(g.ok, g.motivo), "sm ghost");
    }
    h += '<div class="cpl-acoes">' + docBtn("relatorio", "Relatório de habilitação (.docx)") + docBtn("diligencia", "Termo de diligência (.docx)") + docBtn("inabilitacao", "Comunicado de inabilitação (.docx)") +
      btn("Recurso: alegações e conclusão", "cpl-hab-recurso", ' data-lic="' + esc(lic.id) + '"' + dis(pode, motivoAcao("analisar_propostas")), "sm ghost") + docBtn("recurso", "Quadro do recurso (.docx)") + "</div>";
    return h + "</section>";
  }
  function _habilitacao(p) {
    var pode = podeAcao("analisar_propostas"), ls = arr(p.habilitacao && p.habilitacao.licitantes);
    var h = '<section id="cpl-hab"><h3>Habilitação dos licitantes</h3>' + _habPareamento(p) + _habForm(p, pode);
    if (!ls.length) h += M.vazio({ icone: "documentos", titulo: "Nenhum licitante analisado", texto: "Escolha os arquivos do licitante, informe o CNPJ e a data da sessão e clique em «Analisar habilitação»." });
    ls.forEach(function (l) { h += _habCartao(p, l, pode); });
    if (ls.length) {
      var gAta = H.podeGerar("ata", p, null, papeis()), gAdj = H.podeGerar("adjudicacao", p, null, papeis()), gHom = H.podeGerar("homologacao", p, null, papeis());
      var habilitados = ls.filter(function (l) { return H.consolidar(l).status === "habilitado"; });
      var adjId = p.habilitacao && p.habilitacao.adjudicatarioId;
      h += '<div class="cpl-form" id="cpl-hab-fim"><h3>Resultado, adjudicação e homologação</h3>' +
        '<div class="cpl-acoes">' + btn("Ata de julgamento e habilitação (.docx)", "cpl-hab-doc", ' data-tipo="ata"' + dis(gAta.ok, gAta.motivo), "sm") + "</div>" +
        '<div class="cpl-acoes">' + campo("Licitante a adjudicar (só habilitado)", '<select id="cpl-hab-adj"' + (podeAcao("adjudicar") ? "" : " disabled") + '><option value="">— escolha —</option>' + habilitados.map(function (l) { return '<option value="' + esc(l.id) + '"' + (l.id === adjId ? " selected" : "") + ">Licitante " + H.ordem(p, l.id) + " — " + esc(l.razaoSocial || H.mascaraCnpj(l.cnpj)) + "</option>"; }).join("") + "</select>") +
        btn("Escolher", "cpl-hab-adjudicatario", dis(podeAcao("adjudicar"), motivoAcao("adjudicar")), "sm") + "</div>" +
        '<div class="cpl-acoes">' + btn("Minuta de adjudicação (.docx)", "cpl-hab-doc", ' data-tipo="adjudicacao"' + dis(gAdj.ok, gAdj.motivo), "sm") + btn("Minuta de homologação (.docx)", "cpl-hab-doc", ' data-tipo="homologacao"' + dis(gHom.ok, gHom.motivo), "sm") + "</div>" +
        '<p class="muted">As minutas só saem sem nenhuma exigência pendente ou em diligência, com o licitante escolhido habilitado. Quem adjudica e homologa é a autoridade competente.</p></div>';
    }
    return h + "</section>";
  }
  function habLerForm() {
    return { cnpj: lerCampo("cpl-hab-cnpj"), razao: lerCampo("cpl-hab-razao"), sessao: lerCampo("cpl-hab-sessao") };
  }
  function habEscolher(files, pasta) {
    var lista = Array.prototype.slice.call(files || []), vistos = {};
    habArquivos.forEach(function (f) { vistos[f.name] = (vistos[f.name] || 0) + 1; });
    lista.forEach(function (f) {
      var n = f.name;
      if (vistos[n]) { vistos[n]++; var ponto = n.lastIndexOf("."); var novo = (ponto > 0 ? n.slice(0, ponto) : n) + " (" + vistos[n] + ")" + (ponto > 0 ? n.slice(ponto) : ""); try { f = new global.File([f], novo, { type: f.type }); } catch (e) {} }
      else vistos[n] = 1;
      habArquivos.push(f);
    });
    var el = document.getElementById("cpl-hab-sel");
    if (el) el.textContent = habArquivos.length + " arquivo(s) escolhido(s)";
  }

  /* ---------- HISTÓRICO (só leitura) ---------- */
  function _histProc(p) {
    var h = arr(p.historico).slice().reverse();
    if (!h.length) return M.secao({ corpoHtml: M.vazio({ icone: "documentos", titulo: "Sem histórico ainda", texto: "Cada mudança do processo é registrada com quem fez, quando e o antes/depois." }) });
    return M.secao({ titulo: "Histórico do processo", sub: "Somente leitura.", corpoHtml: '<table class="tbl" id="cpl-tab-hist"><thead><tr><th>QUANDO</th><th>QUEM</th><th>O QUÊ</th><th>ANTES</th><th>DEPOIS</th></tr></thead><tbody>' + h.map(function (e) {
      return "<tr><td>" + esc(dataHoraBR(e.em)) + "</td><td>" + esc(e.quem || "—") + "</td><td>" + esc(e.acao) + "</td><td>" + esc(e.antes == null ? "" : e.antes) + "</td><td>" + esc(e.depois == null ? "" : e.depois) + "</td></tr>";
    }).join("") + "</tbody></table>" });
  }

  /* ================================================================== *
   * ARQUIVOS (acervo)
   * ================================================================== */
  function chaveArq(sha) { return "cplpro:" + eid() + ":" + sha; }
  function sha256(bytes) {
    if (typeof crypto === "undefined" || !crypto.subtle) return Promise.reject(new Error("este navegador não calcula SHA-256 (use https ou localhost)"));
    return crypto.subtle.digest("SHA-256", bytes).then(function (ab) {
      var u = new Uint8Array(ab), s = "", i; for (i = 0; i < u.length; i++) s += (u[i] < 16 ? "0" : "") + u[i].toString(16);
      return s;
    });
  }
  function lerArquivo(f) {
    return new Promise(function (ok, falha) {
      var fr = new FileReader(); fr.onload = function () { ok(new Uint8Array(fr.result)); }; fr.onerror = function () { falha(fr.error || new Error("não consegui ler " + f.name)); }; fr.readAsArrayBuffer(f);
    });
  }
  /* PDF cujo nome não classifica: lê o texto das 2 primeiras páginas com o leitor local de PDF (js/vendor/pdfjs, o mesmo da
     nota fiscal). Falha de leitura NUNCA trava a entrada do arquivo: ele segue sem texto, classificado só pelo nome. */
  function textoParaClassificar(file, ent) {
    return new Promise(function (ok) {
      if (!/.pdf$/i.test(ent.nome) || C.classificarArquivo({ nome: ent.nome, ext: ent.ext }).confianca !== "baixa" || !G._pdfTexto) { ok(); return; }
      var feito = false, fim = function (txt) { if (feito) return; feito = true; if (txt && String(txt).replace(/s/g, "")) ent.texto = String(txt); ok(); };
      setTimeout(function () { fim(""); }, 20000);
      try { G._pdfTexto(file, fim, { paginas: 2 }); } catch (e) { fim(""); }
    });
  }
  function adicionarArquivos(files) {
    var p = procAtual(); if (!p) return;
    var papel = exigirEditavel(p, "editar_acervo"); if (!papel) return;
    var lista = Array.prototype.slice.call(files || []);
    if (!lista.length) return;
    var st = document.getElementById("cpl-acervo-status"); if (st) st.textContent = "Lendo " + lista.length + " arquivo(s)…";
    var novos = [], guardados = 0, grandes = [];
    var seq = Promise.resolve();
    lista.forEach(function (f) {
      seq = seq.then(function () {
        return lerArquivo(f).then(function (bytes) {
          return sha256(bytes).then(function (sha) {
            var ext = (/\.([A-Za-z0-9]+)$/.exec(f.name) || [])[1] || "";
            var ent = { nome: f.name, sha: sha, ext: ext, origem: f.webkitRelativePath || null, data: f.lastModified ? hoje() : null };
            novos.push(ent);
            /* o nome não bastou (confiança baixa) e é PDF: lê o texto das páginas 1 e 2 e classifica pelo carimbo (o texto não é gravado) */
            return textoParaClassificar(f, ent).then(function () {
            if (bytes.length <= MAX_BYTES && typeof Idb !== "undefined") {
              var copia = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
              return Idb.set(chaveArq(sha), { nome: f.name, tipo: f.type || "application/octet-stream", dados: copia }).then(function () {
                guardados++;
                try { if (p.obraId && typeof ArquivosNuvem !== "undefined") ArquivosNuvem.subir(chaveArq(sha), { obraId: p.obraId, pasta: "documentos", nome: f.name, tipo: f.type || "application/octet-stream" }, bytes); } catch (eN) {}
              }, function () { grandes.push(f.name); });
            }
            grandes.push(f.name);
            });
          });
        });
      });
    });
    seq.then(function () {
      var atual = procAtual(); if (!atual) return;
      var q = C.adicionarDocumentos(atual, novos);
      var nNovos = q.documentos.length - arr(atual.documentos).length;
      F.soltarConferencia(q, "acervo");
      F.registrar(q, "acervo:adicionar", arr(atual.documentos).length + " arquivo(s)", q.documentos.length + " arquivo(s) (+" + nNovos + ")", quemAtual(papel), agoraLocal());
      if (salvarProc(q)) {
        toast(nNovos + " arquivo(s) novo(s) no acervo" + (novos.length - nNovos ? " (" + (novos.length - nNovos) + " já estavam)" : "") + "." + (grandes.length ? " " + grandes.length + " ficou(aram) só como registro com SHA-256 (maior que 60 MB ou sem armazenamento neste navegador)." : ""), "ok");
        App.render();
      }
    }, function (e) { toast("Não consegui ler os arquivos: " + (e && e.message ? e.message : e), "erro"); if (st) st.textContent = ""; });
  }
  function abrirArquivoDoc(doc) {
    if (!doc || !doc.sha || typeof Idb === "undefined") { toast("Este arquivo só existe como registro (sem os bytes neste aparelho).", "info"); return; }
    Idb.get(chaveArq(doc.sha)).then(function (v) {
      if (!v || !v.dados) { toast("O arquivo não está neste computador — foi adicionado em outro aparelho ou era grande demais.", "info"); return; }
      var url = URL.createObjectURL(new Blob([new Uint8Array(v.dados)], { type: v.tipo || "application/octet-stream" }));
      var w = global.open(url, "_blank");
      if (!w) { var a = document.createElement("a"); a.href = url; a.download = doc.nome; document.body.appendChild(a); a.click(); a.remove(); }
      setTimeout(function () { URL.revokeObjectURL(url); }, 120000);
    }, function () { toast("Não consegui abrir o arquivo.", "erro"); });
  }

  /* ================================================================== *
   * MONTAR O PROCESSO A PARTIR DA PASTA (leva F)
   * O motor é js/cplpropreparo.js (puro). Aqui: ler os arquivos (SHA-256, texto do .docx/PDF, matriz do .xlsx), criar o orçamento
   * no OrçaPRO com o importador de planilha que já existe, chamar o motor e gravar. RBAC na função: cada passo só é preenchido
   * se o papel da pessoa pode editá-lo (F.ACAO_DO_PASSO); o «Conferi» nunca é marcado.
   * ================================================================== */
  function lerPdfTexto(file, paginas) {
    return new Promise(function (ok) {
      if (!G._pdfTexto) { ok(""); return; }
      var feito = false, fim = function (t) { if (feito) return; feito = true; ok(t ? String(t) : ""); };
      setTimeout(function () { fim(""); }, 30000);
      try { G._pdfTexto(file, fim, { paginas: paginas }); } catch (e) { fim(""); }
    });
  }
  function lerMatriz(file) {
    return new Promise(function (ok) {
      if (typeof App === "undefined" || !App._lerPlanilha) { ok(null); return; }
      var feito = false, fim = function (m) { if (feito) return; feito = true; ok(m); };
      setTimeout(function () { fim(null); }, 30000);
      try { App._lerPlanilha(file, function (matriz, erro) { fim(erro || !matriz || !matriz.length ? null : matriz); }); } catch (e) { fim(null); }
    });
  }
  function guardarBytes(p, f, bytes, sha) {
    if (bytes.length > MAX_BYTES || typeof Idb === "undefined") return Promise.resolve();
    var copia = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return Idb.set(chaveArq(sha), { nome: f.name, tipo: f.type || "application/octet-stream", dados: copia }).then(function () {
      try { if (p.obraId && typeof ArquivosNuvem !== "undefined") ArquivosNuvem.subir(chaveArq(sha), { obraId: p.obraId, pasta: "documentos", nome: f.name, tipo: f.type || "application/octet-stream" }, bytes); } catch (eN) {}
    }, function () {});
  }
  /* lê a pasta inteira: → Promise { ents, erros } (arquivo ilegível vira aviso, nunca derruba a montagem) */
  function lerParaPreparo(p, files) {
    var ents = [], erros = [], seq = Promise.resolve();
    files.forEach(function (f) {
      seq = seq.then(function () {
        return lerArquivo(f).then(function (bytes) {
          return sha256(bytes).then(function (sha) {
            var ext = ((/\.([A-Za-z0-9]+)$/.exec(f.name) || [])[1] || "").toLowerCase();
            var ent = { nome: f.name, sha: sha, ext: ext, origem: f.webkitRelativePath || null, data: hoje() };
            var cl = C.classificarArquivo({ nome: f.name, ext: ext }), passo = Promise.resolve();
            if (ext === "docx") passo = T.textoDocx(bytes, inflarFn()).then(function (r) { if (r.ok) ent.texto = r.texto; else erros.push("«" + f.name + "»: " + r.erro); });
            else if (ext === "pdf" && cl.tipo === "orcamento_planilha" && typeof PlanilhaPDF !== "undefined" && PlanilhaPDF && typeof PlanilhaPDF.ler === "function") {
              /* planilha só em PDF (leva L+M): o módulo de leitura devolve itens com página/linha e a nota da conferência */
              var bufPdf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
              passo = Promise.resolve().then(function () { return PlanilhaPDF.ler(bufPdf, { nome: f.name }); }).then(function (r) { if (r && r.itens && r.itens.length) ent.planilhaPdf = r; else erros.push("«" + f.name + "»: a leitura do PDF não achou itens de planilha."); },
                function (e) { erros.push("«" + f.name + "»: não consegui ler a planilha do PDF (" + (e && e.message ? e.message : e) + ")."); });
            }
            else if (ext === "pdf" && cl.tipo === "art_rrt") passo = lerPdfTexto(f, 2).then(function (t) { if (t) ent.texto = t; });
            else if (ext === "pdf" && cl.tipo === "memorial_descritivo") passo = lerPdfTexto(f, 40).then(function (t) { if (t) ent.texto = t; else erros.push("«" + f.name + "»: não consegui ler o texto do PDF (imagem escaneada?)."); });
            else if (ext === "pdf" && cl.confianca === "baixa") passo = lerPdfTexto(f, 2).then(function (t) { if (t) ent.texto = t; });
            else if ((ext === "xlsx" || ext === "xls" || ext === "csv") && bytes.length <= 25 * 1024 * 1024) passo = lerMatriz(f).then(function (m) { if (m) ent.matriz = m; else erros.push("«" + f.name + "»: não consegui ler a planilha."); });
            return passo.then(function () { ents.push(ent); return guardarBytes(p, f, bytes, sha); });
          });
        }, function () { erros.push("«" + f.name + "»: não consegui ler o arquivo."); });
      });
    });
    return seq.then(function () { return { ents: ents, erros: erros }; });
  }

  /* cria (ou reaproveita) o orçamento do OrçaPRO a partir da planilha da pasta, com a(s) base(s) de preço EXIGIDA(S) (leva L:
     BaseExigida decide e instala sozinha — a pessoa não abre Tabelas). Quem precifica é o sistema; o que não casa na base fica
     SEM preço e entra em `semBase` (pesquisa de preços no passo 6). */
  function achaNaBase(catId, codigo) {
    try {
      if (catId === "SINAPI") return (typeof Sinapi !== "undefined" && Sinapi.carregado === true) ? Sinapi.obter(codigo) : null;
      return (typeof Bases !== "undefined" && Bases.obter) ? Bases.obter(catId, codigo) : null;
    } catch (e) { return null; }
  }
  function preencherOrc(orc, plano, lista) {
    orc.etapas = []; var casados = 0, semBase = [], porBase = {};
    plano.etapas.forEach(function (et) {
      Orcamento.addEtapa(orc, et.nome);
      var etapaId = orc.etapas[orc.etapas.length - 1].id;
      et.itens.forEach(function (it) {
        var base = null, catId = null, si, k;
        if (it.codigo) for (k = 0; k < lista.length && !base; k++) { base = achaNaBase(lista[k].catId, it.codigo); if (base) catId = lista[k].catId; }
        if (base) {
          casados++; porBase[catId] = (porBase[catId] || 0) + 1;
          si = { codigo: base.codigo, baseFonte: catId === "SINAPI_DES" ? "SINAPI" : catId, descricao: it.descricao || base.descricao, unidade: it.unidade || base.unidade, custoUnitario: Util.num(base.custoUnitario),
            custoMO: Util.num(base.custoMO), custoMAT: Util.num(base.custoMAT), custoEQ: Util.num(base.custoEQ) };
        } else {
          semBase.push(it.codigo ? it.codigo : it.descricao);
          si = { codigo: it.codigo || "", descricao: it.descricao, unidade: it.unidade || "un", custoUnitario: Util.num(it.custoUnitario) };
        }
        Orcamento.addItem(orc, etapaId, si, it.quantidade);
      });
    });
    /* a base exigida fica MARCADA no orçamento: a mesma que acabou de precificar */
    if (typeof BaseExigida !== "undefined") BaseExigida.marcar(orc, lista);
    return { casados: casados, semBase: semBase, porBase: porBase };
  }
  function rotuloBaseDoOrc(orc, lista, porBase) {
    var primeira = lista.filter(function (b) { return porBase && porBase[b.catId] > 0; })[0];
    if (!primeira) return { base: "", competencia: "" };
    if (primeira.catId === "SINAPI" || primeira.catId === "SINAPI_DES") {
      var des = primeira.catId === "SINAPI_DES" || orc.desonerado;
      return { base: "SINAPI/" + (orc.uf || primeira.uf || "") + (des ? " desonerado" : " não desonerado"), competencia: primeira.competencia || orc.competenciaSinapi || "" };
    }
    return { base: primeira.base + "/" + (primeira.uf || "") + (primeira.regime === "desonerado" ? " desonerado" : (primeira.regime === "onerado" ? " não desonerado" : "")), competencia: primeira.competencia || "" };
  }
  function infoDoOrc(orc, casados, semBase, lista, porBase, origem) {
    var c = calc(orc); if (!c) return null;
    var rb = casados > 0 ? rotuloBaseDoOrc(orc, lista || [], porBase) : { base: "", competencia: "" };
    if (casados > 0 && !rb.base) rb = { base: "SINAPI/" + (orc.uf || "") + (orc.desonerado ? " desonerado" : " não desonerado"), competencia: orc.competenciaSinapi || "" };
    return { id: orc.id, base: rb.base, competencia: rb.competencia, total: c.precoVenda, origem: origem || null,
      baseExigida: (lista || []).map(function (b) { return { catId: b.catId, uf: b.uf, competencia: b.competencia, regime: b.regime, motivo: b.motivo, precificou: (porBase && porBase[b.catId]) || 0 }; }),
      linhas: c.linhas.map(function (l) { return { numero: l.numero, codigo: l.codigo || "", descricao: l.descricao, unidade: l.unidade, quantidade: l.quantidade, precoTotal: l.precoTotal }; }),
      assinatura: Pr.assinaturaOrc(orc), casados: casados, semBase: semBase };
  }
  function orcamentoDoPreparo(p, plano, avisos, prep) {
    var orcs = []; try { orcs = arr(Store.listarOrcamentos(eid())); } catch (e) { orcs = []; }
    var rec = p.preparo && p.preparo.orcamento ? p.preparo.orcamento : null;
    var existente = rec ? orcs.filter(function (o) { return o.id === rec.id; })[0] : null;
    var lista = prep && prep.usadas ? prep.usadas : [];
    if (!lista.length && !existente) avisos.push("Nenhuma base de preços ficou instalada neste aparelho: os itens entraram sem preço. Use «Tentar de novo» (ou monte outra vez) com a internet ligada.");
    var origem = plano.deOnde === "pdf" ? "planilha em PDF" : "planilha";
    var pbPrev = {}; if (rec) arr(rec.baseExigida).forEach(function (b) { pbPrev[b.catId] = b.precificou || 0; });   // quando nada é refeito, o que cada base precificou fica como estava
    if (existente) {
      /* a montagem anterior ficou SEM base (sem internet) e o orçamento não foi mexido por ninguém: agora que a base está aí, repreça */
      var semPrecoAntes = lista.length > 0 && (rec.casados || 0) === 0 && arr(rec.semBase).length > 0 && Pr.assinaturaOrc(existente) === rec.assinatura;
      if (rec.sha === plano.sha && !semPrecoAntes) return infoDoOrc(existente, rec.casados || 0, arr(rec.semBase), lista, pbPrev, rec.origem || origem);
      if (Pr.assinaturaOrc(existente) === rec.assinatura) {
        var rr = preencherOrc(existente, plano, lista);
        if (!Store.salvarOrcamento(eid(), existente)) throw new Error("não consegui gravar o orçamento atualizado");
        return infoDoOrc(existente, rr.casados, rr.semBase, lista, rr.porBase, origem);
      }
      avisos.push("A planilha da pasta mudou, mas o orçamento já tem edições suas: ele NÃO foi alterado. Confira as diferenças antes de seguir.");
      return infoDoOrc(existente, rec.casados || 0, arr(rec.semBase), lista, pbPrev, rec.origem || origem);
    }
    if (p.orcamentoId) { avisos.push("O processo já usa um orçamento escolhido por você: a planilha da pasta não criou outro."); return null; }
    var ob = obraPorId(p.obraId) || (prep && prep.obraInfo ? obraPorId(prep.obraInfo.id) : null);
    var orc = Orcamento.novo({ nome: "Orçamento de referência — " + (ob ? ob.nome : (p.objeto ? String(p.objeto).substring(0, 50) : plano.arquivo)), obra: ob ? ob.nome : "" });
    var r2 = preencherOrc(orc, plano, lista);
    if (!Store.salvarOrcamento(eid(), orc)) throw new Error("não consegui gravar o orçamento");
    return infoDoOrc(orc, r2.casados, r2.semBase, lista, r2.porBase, origem);
  }

  /* leva L — antes de precificar: (1) a OBRA que os documentos descrevem (cria sozinha, idempotente) e (2) a BASE exigida
     (instala sozinha o que falta). Devolve { obraInfo, baseCtx, lista, usadas, resultado } — nunca rejeita: o que falhar vira aviso. */
  function prepararObraEBases(atual, an, plano, permitidos, avisos) {
    var prep = { obraInfo: null, baseCtx: null, lista: [], usadas: [], resultado: null };
    /* 1) obra: pelo mesmo caminho da tela de Obras (Store.salvar na entidade "obras"); nunca grava fora dele */
    if (permitidos.demanda !== false) {
      try {
        var dec = Pr.decidirObra(atual, an, arr(K.lista("obras")), agoraLocal());
        if (dec.acao === "criar" || dec.acao === "atualizar") {
          var ob = Store.salvar(eid(), "obras", dec.obra);
          if (ob) prep.obraInfo = { id: ob.id, criada: dec.criada, assinatura: dec.assinatura, arquivo: dec.arquivo, nome: ob.nome };
          else avisos.push("Não consegui gravar a obra deduzida dos documentos (" + dec.obra.nome + ").");
        } else if (dec.acao === "nenhuma" && dec.obra && dec.obra.origemPreparo) {
          prep.obraInfo = { id: dec.obraId, criada: false, assinatura: dec.obra.origemPreparo.assinatura, nome: dec.obra.nome };
        }
      } catch (eO) { avisos.push("Não consegui preparar a obra: " + (eO && eO.message ? eO.message : eO)); }
    }
    /* 2) base de preços exigida */
    if (!plano || typeof BaseExigida === "undefined") return Promise.resolve(prep);
    var mem = an.memorial || {}, bd = an.baseDeclarada || {};
    var tipo = atual.tipoObjeto;
    if (!tipo && mem.objeto) { var sg = C.sugerirTipoObjeto(mem.objeto); if (sg.length && (sg.length === 1 || sg[0].pontos > sg[1].pontos)) tipo = sg[0].tipo; }
    var uf = mem.uf || bd.uf || "";
    if (!uf) { avisos.push("Não achei a UF da obra nos documentos (memorial ou cabeçalho da planilha): a base de preços não foi escolhida sozinha. Informe a UF no orçamento."); return Promise.resolve(prep); }
    prep.baseCtx = { uf: uf, municipio: mem.municipio || "", regulamentoId: atual.regulamentoId || "", recursoFederal: atual.recursoFederal === true, tipoObjeto: tipo || "",
      competencia: bd.competencia || "", regime: bd.regime || "" };
    prep.lista = BaseExigida.resolver(prep.baseCtx);
    var lista = function () { try { return Bases.lista(); } catch (e) { return []; } };
    return BaseExigida.garantir(prep.lista, { instalar: BaseExigida.instaladorPadrao(), instaladas: lista,
      onProgresso: function (msg) { andamento("Montando o processo a partir da pasta — " + msg); } }).then(function (res) {
      prep.resultado = res; prep.usadas = BaseExigida.usadas(prep.lista, lista());
      res.avisos.forEach(function (a) { avisos.push(a); });
      res.falhou.forEach(function (f) { avisos.push(f.motivo); });
      res.precisaImportar.forEach(function (f) { avisos.push(f.motivo); });
      prep.usadas.forEach(function (u) { if (u.divergeDoPedido) avisos.push("Usando " + u.base + " " + u.uf + " de " + BaseExigida.fmtComp(u.competencia) + " — a planilha pede " + BaseExigida.fmtComp(prep.baseCtx.competencia) + ". Confira antes de usar em edital."); });
      return prep;
    }, function (e) { avisos.push("Não consegui preparar a base de preços: " + (e && e.message ? e.message : e)); return prep; });
  }
  /* o que o «Montar» não resolveu sozinho: modal com a saída (nunca só um toast que some) */
  function avisoDeBases(prep, refazer) {
    var rs = prep && prep.resultado; if (!rs || rs.ok) return;
    var corpo = "", botoes = [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }];
    rs.falhou.forEach(function (f) { corpo += "<p>" + esc(f.motivo) + "</p>"; });
    rs.precisaImportar.forEach(function (f) { corpo += "<p>" + esc(f.motivo) + "</p>"; });
    if (rs.tentarDeNovo && refazer) botoes.push({ texto: "Tentar de novo", classe: "primary", onClick: function () { UI.fecharModal(); refazer(); } });
    if (rs.precisaImportar.length) botoes.push({ texto: "Importar meu arquivo", classe: "primary", onClick: function () { UI.fecharModal(); if (App.abrirTabelas) App.abrirTabelas(); } });
    UI.modal("A base de preços não ficou pronta", corpo + '<p class="muted">Os itens que dependem dela entraram sem preço e estão marcados como pendência no passo 6. Nada foi inventado.</p>', botoes);
  }

  function montarDaPasta(files, opcoes) {
    var p = procAtual(); if (!p) return Promise.resolve(null);
    var papel = exigirEditavel(p, "editar_acervo"); if (!papel) return Promise.resolve(null);
    var permitidos = {}; C.PASSOS.forEach(function (ps) { permitidos[ps.id] = podeAcao(F.ACAO_DO_PASSO[ps.id]); });
    var st = document.getElementById("cpl-acervo-status");
    var msg = "Montando o processo a partir da pasta (" + files.length + " arquivo(s))…";
    if (st) st.textContent = msg;
    G._cplMontando = true; toast(msg, "info"); andamento(msg);
    var t0 = Date.now(), prepGuardado = null;
    return lerParaPreparo(p, files).then(function (lido) {
      var atual = procAtual(); if (!atual) return null;
      var an = Pr.analisar({ arquivos: lido.ents }), plano = Pr.planoOrcamento(an), oi = null, avisosExtra = lido.erros.slice();
      return prepararObraEBases(atual, an, plano, permitidos, avisosExtra).then(function (prep) {
        prepGuardado = prep;
        if (plano && permitidos.orcamento && permitidos.quantitativos) { try { oi = orcamentoDoPreparo(atual, plano, avisosExtra, prep); } catch (e) { avisosExtra.push("Não consegui criar o orçamento: " + (e && e.message ? e.message : e)); } }
        else if (plano) avisosExtra.push("Seu perfil não edita orçamento e quantitativos: a planilha foi lida, mas o orçamento não foi criado.");
        var r = Pr.aplicar(atual, an, { agora: agoraLocal(), permitidos: permitidos, orcInfo: oi, obraInfo: prep.obraInfo, baseCtx: prep.baseCtx, padroes: true, orgao: orgaoCad(), processos: listaProc() });
        G._cplMontando = false;
        if (!r.mudou) { toast("Nada novo: o processo já estava montado com esta pasta (rodar de novo não duplica nada).", "info"); App.render(); avisoDeBases(prep, function () { montarDaPasta(files, opcoes); }); return r; }
        var q = r.p;
        avisosExtra.forEach(function (a) { q.preparo.resumo.avisos.push(a); });
        F.registrar(q, "preparo:pasta", lido.ents.length + " arquivo(s) na pasta", "o sistema preencheu " + q.preparo.resumo.preencheu + " campo(s) em " + q.preparo.resumo.passosTocados + " passo(s)", quemAtual(papel), agoraLocal());
        if (!salvarProc(q)) return null;
        G._cplPasso = "demanda"; G._cplAba = "passos"; G._cplView = "proc";
        var sit = Pr.situacao(q);
        toast("O sistema preencheu " + q.preparo.resumo.preencheu + " campos em " + q.preparo.resumo.passosTocados + " passos; faltam " + sit.faltamTotal + " decisões suas. (" + Math.max(1, Math.round((Date.now() - t0) / 1000)) + " s)", "ok");
        App.render();
        avisoDeBases(prep, function () { montarDaPasta(files, opcoes); });
        return r;
      });
    }, function (e) { G._cplMontando = false; toast("Não consegui montar o processo: " + (e && e.message ? e.message : e), "erro"); return null; })
      .then(function (r) { andamento(null); return r; }, function (e) { andamento(null); throw e; });
  }

  /* faixa «Montando…» enquanto o sistema lê a pasta (some sozinha ao terminar, com sucesso ou erro) */
  function andamento(msg) {
    var el = document.getElementById("cpl-preparo-andamento");
    if (msg === null) { if (el && el.parentNode) el.parentNode.removeChild(el); return; }
    if (!el) { el = document.createElement("div"); el.id = "cpl-preparo-andamento"; el.className = "cpl-andamento"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite"); document.body.appendChild(el); }
    el.innerHTML = '<span class="cpl-gira" aria-hidden="true"></span><span><b>Montando o processo…</b> ' + esc(String(msg).replace(/^Montando o processo a partir da pasta/, "lendo a pasta")) + "</span>";
  }

  function _sugTxt(id, v) {
    if (v === null || v === undefined) return "—";
    if (typeof v === "boolean") return v ? "Sim" : "Não";
    if (typeof v === "object") return _descObj(id, v);
    return String(v);
  }
  /* painel «Montagem automática»: a frase, as 10 decisões da lei e o que só o órgão tem — tudo com «Corrigir» */
  function _painelPreparo(p) {
    var rs = p.preparo.resumo, sit = Pr.situacao(p);
    var dados = sit.faltam.filter(function (x) { return x.tipo === "dado"; });
    var h = '<div class="cpl-preparo" id="cpl-preparo-resumo" role="region" aria-label="Montagem automática a partir da pasta">';
    h += "<h3>Montagem automática a partir da pasta</h3>";
    h += '<p class="cpl-preparo-frase" id="cpl-preparo-frase">O sistema preencheu <b>' + rs.preencheu + "</b> campos em <b>" + rs.passosTocados + "</b> passos; faltam <b>" + sit.faltamTotal + "</b> decisões suas.</p>";
    var gd = null; try { gd = D.gerar(p, ctxDocs(p)); } catch (eG) { gd = null; }
    if (gd) h += '<p class="muted" id="cpl-preparo-docs">Documentos do processo: ' + (gd.pendentes ? "<b>" + gd.pendentes + "</b> campo(s) ainda em branco (dados do órgão, método de cálculo da pesquisa e origem de quantidades — veja o passo 9)." : "nenhum campo em branco.") + "</p>";
    h += '<p class="muted">Tudo o que o sistema preencheu leva o selo <span class="cpl-selo-sist">sugerido pelo sistema — confira</span>. Nenhum passo foi dado como conferido: o «Conferi» é seu. O que você editar, o sistema não sobrescreve.</p>';
    if (sit.decisoes.length) {
      h += '<details open id="cpl-preparo-decisoes"><summary><b>Decisões que a lei reserva ao órgão (' + sit.decisoes.length + ')</b></summary><div class="cpl-pends">' + sit.decisoes.map(function (d) {
        return '<div class="cpl-pend" role="listitem"><span><b>' + esc(d.nome) + "</b> — sugestão pré-marcada: <b>" + esc(_sugTxt(d.id, d.sugerido)) + "</b>" + porque(d.regra || "", d.fonte, d.conferir, d.nome) + "</span>" +
          '<button type="button" class="btn sm" data-gacao="cpl-corrigir" data-passo="parametros" data-campo="' + esc(d.id) + '" data-item="">Corrigir</button></div>';
      }).join("") + "</div></details>";
    }
    var dadosOrg = faltaDoOrgao(p).map(function (x) { return { msg: "Dado do órgão sem cadastro: " + x.rotulo + ".", corrigir: { passo: "orgao", campo: x.cadastroId } }; });
    var dadosTodos = dados.map(function (x) { return { msg: x.msg, corrigir: { passo: x.passo, campo: x.campo, item: x.item === null ? undefined : x.item } }; }).concat(dadosOrg);
    if (dadosTodos.length) h += '<details id="cpl-preparo-dados"><summary><b>Dados que só o órgão tem (' + dadosTodos.length + ")</b></summary>" + pendCartoes(dadosTodos) + "</details>";
    var avisos = arr(rs.avisos).concat(arr(rs.lacunas));
    if (avisos.length || arr(rs.mantidos).length) {
      h += '<details id="cpl-preparo-avisos"><summary><b>Avisos</b></summary><ul>' + avisos.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") +
        (arr(rs.mantidos).length ? "<li>" + rs.mantidos.length + " campo(s) que você editou foram mantidos: o sistema não sobrescreve o que a pessoa escreveu.</li>" : "") + "</ul></details>";
    }
    return h + "</div>";
  }

  /* ================================================================== *
   * DOCUMENTOS (.docx)
   * ================================================================== */
  function baixarDocx(html, titulo) {
    if (typeof Docx === "undefined") { toast("A saída em Word não está disponível nesta versão.", "erro"); return false; }
    var op = { titulo: titulo, data: Util.agoraISO(), aplicativo: (typeof CONFIG !== "undefined" && CONFIG.marca && CONFIG.marca.nome) || "OrçaPRO" };
    try { op.criador = (typeof Empresa !== "undefined" && Empresa.excelCreator) ? Empresa.excelCreator() : ""; } catch (e) { op.criador = ""; }
    var r;
    try { r = Docx.deHtml(html, op); } catch (e2) { toast("Não consegui montar o Word: " + (e2 && e2.message ? e2.message : e2), "erro"); return false; }
    Util.baixar(Docx.nomeArquivo(titulo), r.bytes, Docx.MIME);
    toast("Word baixado: " + Docx.nomeArquivo(titulo) + ".", "ok");
    return true;
  }
  function docPorId(p, id) {
    var g = D.gerar(p, ctxDocs(p));
    return { doc: g.docs.filter(function (z) { return z.id === id; })[0], todos: g };
  }

  /* ---------- modelos do órgão: importar, usar, exemplo ---------- */
  function chaveMod(sha) { return "cplpro-modelo:" + eid() + ":" + sha; }
  /* .docx é ZIP com entradas comprimidas (deflate): o navegador descomprime com DecompressionStream */
  function inflarFn() {
    if (typeof DecompressionStream === "undefined" || typeof Response === "undefined") return null;
    return function (b) { var ds = new DecompressionStream("deflate-raw"); return new Response(new Blob([b]).stream().pipeThrough(ds)).arrayBuffer().then(function (ab) { return new Uint8Array(ab); }); };
  }
  function rotulosModelo() { var o = {}; D.CAMPOS_MODELO.forEach(function (c) { o[c.id] = c.rotulo; }); return o; }
  function baixarBytes(nome, bytes) {
    Util.baixar(nome, bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  }
  function importarModelo(file, tipo) {
    var papel = exigir("gerenciar_modelos"); if (!papel) return;
    if (!T.TIPOS[tipo]) { toast("Escolha o tipo de documento do modelo.", "erro"); return; }
    if (!/\.docx$/i.test(file.name)) { toast("O modelo precisa ser um arquivo Word (.docx). Salve o seu documento nesse formato e tente de novo.", "erro"); return; }
    if (typeof Idb === "undefined") { toast("Este navegador não guarda arquivos (IndexedDB indisponível); o modelo não pode ser importado aqui.", "erro"); return; }
    var ids = D.CAMPOS_MODELO.map(function (c) { return c.id; });
    lerArquivo(file).then(function (bytes) {
      return T.analisar(bytes, ids, inflarFn()).then(function (a) {
        if (!a.ok) { toast("Não importei «" + file.name + "»: " + a.erro, "erro"); return; }
        return sha256(bytes).then(function (sha) {
          var copia = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
          return Idb.set(chaveMod(sha), { nome: file.name, tipo: "docx", dados: copia }).then(function () {
            var reg = { id: tipo, tipo: tipo, nome: file.name, sha: sha, bytes: bytes.length, campos: a.campos, desconhecidos: a.desconhecidos, importadoEm: hoje(), importadoPor: nomeAtual(), atualizadoEm: agoraLocal() };
            if (!Store.salvar(eid(), ENT_MOD, reg)) { toast("Não consegui gravar a ficha do modelo.", "erro"); return; }
            toast("Modelo de «" + T.TIPOS[tipo].nome + "» importado: " + a.campos.length + " campo(s) reconhecido(s)." + (a.desconhecidos.length ? " Atenção: " + a.desconhecidos.length + " campo(s) que o sistema não conhece (" + a.desconhecidos.join(", ") + ") sairão como [CAMPO DESCONHECIDO]." : ""), a.desconhecidos.length ? "aviso" : "ok");
            App.render();
          }, function () { toast("Não consegui guardar o arquivo neste aparelho.", "erro"); });
        });
      });
    }, function (e) { toast("Não consegui ler o arquivo: " + (e && e.message ? e.message : e), "erro"); });
  }
  /* preenche o .docx do órgão com os dados do processo e baixa. Falhou = nada é baixado e a mensagem diz por quê:
     entregar o modelo PADRÃO no lugar, calado, faria o órgão assinar um texto que não é o da sua procuradoria. */
  function baixarDoModeloDoOrgao(p, doc) {
    var reg = modeloDoTipo(doc.id); if (!reg) return;
    if (typeof Idb === "undefined") { toast("Este navegador não guarda arquivos; use «Baixar no padrão da casa».", "erro"); return; }
    Idb.get(chaveMod(reg.sha)).then(function (v) {
      if (!v || !v.dados) { toast("O modelo do órgão para «" + doc.nome + "» foi importado em outro aparelho e não está neste. Importe-o de novo em «Modelos do órgão» ou use «Baixar no padrão da casa».", "erro"); return; }
      return T.preencher(new Uint8Array(v.dados), D.valoresModelo(p, ctxDocs(p)), rotulosModelo(), inflarFn()).then(function (r) {
        if (!r.ok) { toast("O modelo do órgão não pôde ser usado: " + r.erro + " Nada foi baixado.", "erro"); return; }
        baixarBytes(Docx.nomeArquivo(D.nomeArquivo({ arquivo: doc.arquivo }, p)), r.bytes);
        toast("Word baixado no modelo do órgão." + (r.pendentes ? " Atenção: " + r.pendentes + " campo(s) saíram em vermelho ([PREENCHER] ou campo desconhecido)." : ""), r.pendentes ? "aviso" : "ok");
      });
    }, function () { toast("Não consegui abrir o modelo do órgão neste aparelho.", "erro"); });
  }
  /* o modelo de exemplo sai do padrão: as seções são as do documento padrão do processo (ou de um processo em branco) */
  function secoesDoPadrao(tipo) {
    var p = procAtual() || listaProc()[0] || C.novoProcesso({}, "", agoraLocal());
    var doc = D.gerar(p, ctxDocs(p)).docs.filter(function (z) { return z.id === tipo; })[0], out = [];
    if (!doc) return out;
    doc.html.replace(/<h2>([\s\S]*?)<\/h2>/g, function (m, t) { out.push(t.replace(/<[^>]+>/g, "").replace(/^\d+\.\s*/, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')); return m; });
    return out;
  }

  /* ================================================================== *
   * PAINEL DA CPL (modo TV)
   * ================================================================== */
  var tvTimer = null;
  function fecharPainel() {
    if (tvTimer) { clearInterval(tvTimer); tvTimer = null; }
    var el = document.getElementById("cpl-tv"); if (el) el.remove();
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (e) {}
    document.removeEventListener("fullscreenchange", aoMudarTela);
    document.removeEventListener("keydown", aoTeclar);
  }
  function aoMudarTela() { if (!document.fullscreenElement) fecharPainel(); }
  function aoTeclar(e) { if (e.key === "Escape") fecharPainel(); }
  function htmlQuadro(q) {
    var h = '<h2 class="cpl-tv-tit">' + esc(q.titulo) + "</h2>";
    if (q.id === "passos") {
      h += '<div class="cpl-tv-grade">' + q.itens.map(function (i) { return '<div class="cpl-tv-cel"><b>' + i.total + "</b><span>" + i.passo + ". " + esc(i.passoNome) + "</span></div>"; }).join("") + "</div>";
    } else if (q.id === "prazos") {
      h += q.itens.length ? '<ul class="cpl-tv-lista">' + q.itens.map(function (i) { return "<li><b>" + esc(i.tipoRotulo) + "</b> — " + esc(i.codigo) + " · " + esc(i.objeto) + (i.data ? " · " + esc(dataBR(i.data)) : "") + (i.dias !== null && i.dias !== undefined ? " (" + (i.dias === 0 ? "hoje" : "em " + i.dias + " dia(s)") + ")" : "") + "</li>"; }).join("") + "</ul>" : '<p class="cpl-tv-vazio">Nenhum prazo próximo.</p>';
    } else if (q.id === "pendencias") {
      h += q.itens.length ? '<ul class="cpl-tv-lista">' + q.itens.map(function (i) { return "<li><b>" + i.total + "</b> pendência(s) — " + esc(i.papelNome) + "</li>"; }).join("") + "</ul>" : '<p class="cpl-tv-vazio">Nenhuma pendência.</p>';
    } else {
      h += '<p class="cpl-tv-num">' + q.total + "</p>" + (q.itens.length ? '<ul class="cpl-tv-lista">' + q.itens.map(function (i) { return "<li>" + esc(i.codigo) + " · " + esc(i.objeto) + " · " + esc(dataBR(i.dataPublicacao)) + "</li>"; }).join("") + "</ul>" : '<p class="cpl-tv-vazio">Nenhum edital publicado neste mês.</p>');
    }
    return h;
  }
  function abrirPainel() {
    fecharPainel();
    var dados = F.painel(listaProc().filter(function (p) { return !G._cplObra || p.obraId === G._cplObra; }), hoje());
    var el = document.createElement("div");
    el.id = "cpl-tv"; el.className = "cpl-tv"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Painel da CPL");
    el.innerHTML = '<button type="button" class="cpl-tv-fechar" id="cpl-tv-fechar" aria-label="Sair do painel (Esc)">Sair (Esc)</button><div class="cpl-tv-corpo" id="cpl-tv-corpo"></div><div class="cpl-tv-pontos" id="cpl-tv-pontos"></div>';
    document.body.appendChild(el);
    var i = 0, corpo = document.getElementById("cpl-tv-corpo"), pontos = document.getElementById("cpl-tv-pontos");
    function mostrar(n) {
      i = n % dados.quadros.length;
      corpo.innerHTML = htmlQuadro(dados.quadros[i]);
      pontos.innerHTML = dados.quadros.map(function (q, k) { return '<span class="' + (k === i ? "ativo" : "") + '"></span>'; }).join("");
      el.setAttribute("data-quadro", dados.quadros[i].id);
    }
    mostrar(0);
    tvTimer = setInterval(function () { mostrar(i + 1); }, 15000);
    document.getElementById("cpl-tv-fechar").onclick = fecharPainel;
    document.addEventListener("keydown", aoTeclar);
    try { if (el.requestFullscreen) { el.requestFullscreen().then(function () { document.addEventListener("fullscreenchange", aoMudarTela); }, function () {}); } } catch (e) {}
  }
  G.cplproPainelDados = function () { return F.painel(listaProc(), hoje()); };

  /* ================================================================== *
   * AÇÕES
   * ================================================================== */
  function lerCampo(id) { var el = document.getElementById(id); return el ? String(el.value).replace(/^\s+|\s+$/g, "") : ""; }
  function emBranco(v) { return v === "" ? null : v; }

  /* ================================================================== *
   * LEVA L — passo 6: a base exigida fica instalada ao ESCOLHER/ABRIR o orçamento de referência, e «Orçar pelo escopo (IA)»
   * quando a pasta não trouxe planilha. Nada aqui chama IA sem passar pela cobrança por uso do OrçaPRO.
   * ================================================================== */
  var salvandoComBase = false;
  function garantirBaseDoOrc(p, orc) {
    var vazioRes = Promise.resolve({ usadas: [], resultado: null });
    if (!p || !orc || typeof BaseExigida === "undefined") return vazioRes;
    var base = p.preparo && p.preparo.baseCtx ? JSON.parse(JSON.stringify(p.preparo.baseCtx)) : null;
    var ctx = base || { uf: orc.uf || "", regulamentoId: p.regulamentoId || "", recursoFederal: p.recursoFederal === true, tipoObjeto: p.tipoObjeto || "",
      competencia: (p.orcamentoRef && p.orcamentoRef.competencia) || orc.competenciaSinapi || "", regime: orc.desonerado ? "desonerado" : "onerado" };
    if (!ctx.uf) return vazioRes;
    var lista = BaseExigida.resolver(ctx), inst = function () { try { return Bases.lista(); } catch (e) { return []; } };
    return BaseExigida.garantir(lista, { instalar: BaseExigida.instaladorPadrao(), instaladas: inst, onProgresso: function (m) { toast(m, "info"); } }).then(function (res) {
      var usadas = BaseExigida.usadas(lista, inst());
      res.falhou.concat(res.precisaImportar).forEach(function (f) { toast(f.motivo, "erro"); });
      /* marca no orçamento SÓ se foi o sistema que o criou desta pasta e ele ainda não está aprovado */
      try {
        var criadoAqui = p.preparo && p.preparo.orcamento && p.preparo.orcamento.id === orc.id;
        var travado = typeof Orcamento !== "undefined" && Orcamento.travadoPorAprovacao && Orcamento.travadoPorAprovacao(orc);
        if (criadoAqui && !travado && usadas.length) { BaseExigida.marcar(orc, usadas); Store.salvarOrcamento(eid(), orc); }
      } catch (eM) {}
      return { usadas: usadas, resultado: res };
    }, function () { return { usadas: [], resultado: null }; });
  }
  /* «Orçar pelo escopo (IA)»: cria o orçamento VAZIO do processo e abre o Escopo do OrçaPRO com o texto do memorial. A geração e a
     cobrança (2 grátis/mês, depois o preço confirmado) são do fluxo que já existe (App._escopoComPagamento): daqui não sai nenhuma chamada de IA. */
  function orcarPeloEscopo() {
    var p = procAtual(); if (!p || !exigirEditavel(p, "editar_orcamento")) return;
    var of = p.preparo && p.preparo.oferta; if (!of || !of.escopo) { toast("Esta pasta tem planilha: não há o que orçar pelo escopo.", "erro"); return; }
    if (p.orcamentoId) { toast("O processo já tem orçamento de referência.", "erro"); return; }
    var ob = obraPorId(p.obraId);
    var orc = Orcamento.novo({ nome: "Orçamento pelo escopo — " + (ob ? ob.nome : (p.objeto ? String(p.objeto).substring(0, 50) : "processo")), obra: ob ? ob.nome : "" });
    orc.etapas = [];
    if (!Store.salvarOrcamento(eid(), orc)) { toast("Não consegui criar o orçamento.", "erro"); return; }
    var ok = gravar("orcamento", function (q) {
      q.orcamentoId = orc.id;
      if (q.preparo) { q.preparo.orcamento = { id: orc.id, sha: null, assinatura: null, casados: 0, semBase: [], origem: "orçamento pelo escopo", baseExigida: null, leituraPdf: null }; q.preparo.oferta = null; }
      return { antes: { orcamentoId: null }, depois: { orcamentoId: orc.id } };
    });
    if (!ok) return;
    var ctxB = p.preparo && p.preparo.baseCtx; if (ctxB && typeof BaseExigida !== "undefined") { try { garantirBaseDoOrc(procAtual(), orc); } catch (eB) {} }
    var texto = of.memorial ? String(of.memorial) + (of.area ? "\nÁrea construída: " + String(of.area).replace(".", ",") + " m²." : "") : [p.objeto || of.texto || "", p.tr && p.tr.objeto && p.tr.objeto !== p.objeto ? p.tr.objeto : "", of.area ? "Área construída: " + String(of.area).replace(".", ",") + " m²." : ""].filter(Boolean).join("\n");
    if (App.tela === "gestao" && App.irPara && App.irPara("orcamentos") === false) return;
    App.abrirOrcamento(orc.id);
    if (typeof App.abrirEscopo === "function") {
      App.abrirEscopo();
      var cx = document.getElementById("esc-txt"); if (cx) cx.value = texto;
    }
    toast("Escopo aberto com o texto do memorial. Ao gerar, a cobrança por uso é confirmada antes de qualquer IA.", "info");
  }

  var acoes = {
    "cpl-obra": function (ds) { G._cplObra = ds && ds.value != null ? String(ds.value) : ""; App.render(); },
    "cpl-aba-lista": function () { G._cplView = "lista"; App.render(); },
    "cpl-aba-papeis": function () { G._cplView = "papeis"; App.render(); },
    "cpl-aba-orgao": function () { G._cplView = "orgao"; App.render(); },
    "cpl-org-salvar": function () {
      if (!exigir("gerenciar_orgao")) return;
      var o = orgaoCad();
      Org.CAMPOS.forEach(function (c) { var el = document.getElementById("cpl-org-" + c.id); if (el) o[c.id] = String(el.value || "").replace(/^\s+|\s+$/g, ""); });
      var er = Org.validar(o);
      if (er.length) { toast(er[0].msg, "erro"); var ef = document.getElementById("cpl-org-" + er[0].id); if (ef && ef.focus) ef.focus(); return; }
      o.atualizadoEm = agoraLocal();
      if (!Store.salvar(eid(), ENT_ORG, o)) { toast("Não consegui gravar o cadastro do órgão. Nada foi alterado.", "erro"); return; }
      var n = propagarOrgao();
      toast("Cadastro do órgão salvo." + (n ? " Atualizei " + n + " processo(s) em andamento (só o que o sistema tinha escrito ou estava em branco)." : ""), "ok");
      App.render();
    },
    "cpl-org-timbrado": function () { var el = document.getElementById("cpl-org-timbrado-arq"); if (el) el.click(); },
    "cpl-org-timbrado-remover": function () {
      if (!exigir("gerenciar_orgao")) return;
      var o = orgaoCad(); o.timbrado = null; o.atualizadoEm = agoraLocal();
      if (!Store.salvar(eid(), ENT_ORG, o)) { toast("Não consegui gravar.", "erro"); return; }
      toast("Timbrado removido.", "ok"); App.render();
    },
    "cpl-padroes": function () {
      var p = procAtual(); if (!p) return;
      if (!F.editavel(p)) { toast(F.motivoTravado(p), "erro"); return; }
      var permitidos = {}; C.PASSOS.forEach(function (ps) { permitidos[ps.id] = podeAcao(F.ACAO_DO_PASSO[ps.id]); });
      if (permitidos.minuta === false) { toast("Seu perfil não edita a minuta.", "erro"); return; }
      var cx = ctxPadroes(); cx.permitidos = permitidos;
      var r = Pr.aplicarPadroes(p, cx);
      if (!r.mudou) { toast("Nada a aplicar: os campos já estão preenchidos" + (r.mantidos.length ? " (" + r.mantidos.length + " editado(s) por você foram mantidos)." : "."), "info"); return; }
      F.registrar(r.p, "padroes_orgao", null, "padrões do órgão e de rotina: " + (r.preenchidos + r.atualizados) + " campo(s)", quemAtual("cpl"), agoraLocal());
      if (salvarProc(r.p)) { toast("Aplicados " + (r.preenchidos + r.atualizados) + " padrão(ões) do órgão e de rotina, com o selo «sugerido — confira». Confira cada um.", "ok"); App.render(); }
    },
    "cpl-aba-modelos": function () { if (!exigir("gerenciar_modelos")) return; G._cplView = "modelos"; App.render(); },
    /* ---------- modelos do órgão (só o administrador do órgão) ---------- */
    "cpl-mod-escolher": function (ds) {
      if (!exigir("gerenciar_modelos")) return;
      G._cplModTipo = ds.tipo;
      var el = document.getElementById("cpl-mod-arq"); if (el) el.click();
    },
    "cpl-mod-exemplo": function (ds) {
      if (!exigir("gerenciar_modelos")) return;
      if (typeof Docx === "undefined") { toast("A saída em Word não está disponível nesta versão.", "erro"); return; }
      var tp = ds.tipo, html = T.exemploHtml(tp, D.CAMPOS_MODELO, secoesDoPadrao(tp), ctxDocs(procAtual() || C.novoProcesso({}, "", agoraLocal())).orgao.nome || "");
      var r; try { r = Docx.deHtml(html, { titulo: "Modelo de exemplo - " + T.TIPOS[tp].nome, data: Util.agoraISO(), aplicativo: "OrçaPRO" }); } catch (e) { toast("Não consegui montar o exemplo: " + (e && e.message ? e.message : e), "erro"); return; }
      baixarBytes(Docx.nomeArquivo("Modelo de exemplo - " + T.TIPOS[tp].nome), r.bytes);
      toast("Exemplo baixado. Edite com o texto da procuradoria, mantenha os campos {{...}} e importe de volta.", "ok");
    },
    "cpl-mod-baixar": function (ds) {
      if (!exigir("gerenciar_modelos")) return;
      var reg = modeloDoTipo(ds.tipo); if (!reg) return;
      if (typeof Idb === "undefined") { toast("Este navegador não guarda arquivos.", "erro"); return; }
      Idb.get(chaveMod(reg.sha)).then(function (v) {
        if (!v || !v.dados) { toast("O arquivo deste modelo foi importado em outro aparelho e não está neste. Importe-o de novo.", "info"); return; }
        baixarBytes(reg.nome, new Uint8Array(v.dados));
      }, function () { toast("Não consegui abrir o arquivo.", "erro"); });
    },
    "cpl-mod-remover": function (ds) {
      if (!exigir("gerenciar_modelos")) return;
      var reg = modeloDoTipo(ds.tipo); if (!reg) return;
      UI.modal("Remover o modelo do órgão", "<p>O modelo «" + esc(reg.nome) + "» de <b>" + esc(T.TIPOS[ds.tipo].nome) + "</b> deixa de ser usado; os próximos documentos voltam ao padrão da casa. Os documentos já baixados não mudam.</p>", [
        { texto: "Remover", classe: "primary", onClick: function () {
          try { if (typeof Idb !== "undefined" && Idb.del) Idb.del(chaveMod(reg.sha)); } catch (e) {}
          Store.excluir(eid(), ENT_MOD, reg.id); UI.fecharModal(); toast("Modelo removido.", "ok"); App.render();
        } },
        { texto: "Cancelar", onClick: function () { UI.fecharModal(); } }]);
    },
    "cpl-voltar": function () { G._cplView = "lista"; G._cplId = ""; App.render(); },
    "cpl-abrir": function (ds) { var p = procPorId(ds.id); if (!p) return; G._cplId = p.id; G._cplView = "proc"; G._cplAba = "passos"; G._cplPasso = F.passoAtual(p).id; App.render(); },
    "cpl-aba": function (ds) { G._cplAba = ds.aba || "passos"; App.render(); },
    "cpl-passo": function (ds) { G._cplPasso = ds.passo; G._cplFoco = null; App.render(); },
    "cpl-ir-atual": function () { var p = procAtual(); if (!p) return; G._cplPasso = F.passoAtual(p).id; G._cplFoco = null; G._cplAba = "passos"; App.render(); },
    "cpl-corrigir": function (ds) {
      if (ds.passo === "orgao") { G._cplView = "orgao"; G._cplFoco = ds.campo || null; App.render(); return; }   /* pendência de dado do ÓRGÃO: leva ao Cadastro do órgão */
      setFoco(ds.passo, ds.item ? ds.campo + ":" + ds.item : ds.campo); App.render();
    },
    "cpl-ir-usuarios": function () { if (typeof App !== "undefined" && App.irPara) App.irPara("usuarios"); },
    "cpl-porque": function (ds) {
      var corpo = "<p>" + Util.esc(ds.regra || "") + "</p><p><b>Fonte:</b> " + Util.esc(ds.fonte || "") + "</p>" +
        (ds.conferir ? '<p class="muted"><span class="cpl-conf">conferir</span> Esta regra ainda precisa da conferência do jurídico do órgão antes de ser tomada como definitiva.</p>' : "");
      UI.modal("Por quê? " + (ds.titulo ? "— " + ds.titulo : ""), corpo, [{ texto: "Fechar", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
    },

    /* ---------- processo ---------- */
    "cpl-novo": function () {
      if (!exigir("criar_processo")) return;
      var obras = K.lista("obras");
      var corpoPasta = '<div class="field cpl-montar-destaque" id="cpl-n-destaque" style="padding:14px 16px;border:2px solid var(--primaria,#1d4f8c);border-radius:10px;margin-bottom:14px"><input type="file" id="cpl-n-pasta" webkitdirectory multiple hidden>' +
        '<button type="button" class="btn primary" id="cpl-n-montar" style="width:100%;font-size:1.05em;padding:12px 16px">Montar tudo a partir da pasta</button>' +
        '<div class="cpl-sug" id="cpl-n-montar-txt" style="margin-top:8px">Suba a pasta do projeto: o sistema lê o memorial, a planilha orçamentária e o cronograma, cria o processo e preenche os 10 passos o quanto os documentos permitirem. É o caminho mais rápido.</div></div>' +
        '<p class="muted" style="margin:0 0 6px"><b>Ou</b> crie o processo em branco, informando só o essencial:</p>';
      var corpo = corpoPasta + campo("Secretaria requisitante *", '<input id="cpl-n-sec">') + campo("Objeto *", '<textarea id="cpl-n-obj" rows="3"></textarea>') + campo("Obra", '<select id="cpl-n-obra">' + K.optsRec(obras, "nome", G._cplObra, "— sem obra —") + "</select>");
      UI.modal("Novo processo de licitação", corpo, [
        { texto: "Criar processo em branco", classe: "", onClick: function () {
          var papel = exigir("criar_processo"); if (!papel) return;
          var sec = lerCampo("cpl-n-sec"), obj = lerCampo("cpl-n-obj"), obra = lerCampo("cpl-n-obra");
          if (!sec || !obj) { toast("Informe a secretaria e o objeto.", "erro"); return; }
          var q = C.novoProcesso({ secretaria: sec, objeto: obj, obraId: obra || null }, quemAtual(papel), agoraLocal());
          F.registrar(q, "criar_processo", null, "criado", quemAtual(papel), agoraLocal());
          try { var rpN = Pr.aplicarPadroes(q, ctxPadroes()); if (rpN.mudou) q = rpN.p; } catch (ePad) {}   /* cadastro do órgão + padrões de rotina, com selo */
          var r = salvarProc(q); if (!r) return;
          UI.fecharModal(); G._cplId = r.id; G._cplView = "proc"; G._cplAba = "passos"; G._cplPasso = "demanda"; App.render();
        } },
        { texto: "Cancelar", onClick: function () { UI.fecharModal(); } }]);
      /* leva F: «Montar tudo a partir da pasta» já na criação — cria o processo e deixa o sistema preencher */
      var bm = document.getElementById("cpl-n-montar"), pa = document.getElementById("cpl-n-pasta");
      if (bm && pa) {
        bm.onclick = function () { pa.click(); };
        pa.onchange = function () {
          var fs_ = Array.prototype.slice.call(this.files || []); if (!fs_.length) return;
          var papel = exigir("criar_processo"); if (!papel) return;
          var sec = lerCampo("cpl-n-sec"), obj = lerCampo("cpl-n-obj"), obra = lerCampo("cpl-n-obra");
          var q = C.novoProcesso({ secretaria: sec || null, objeto: obj || null, obraId: obra || null }, quemAtual(papel), agoraLocal());
          F.registrar(q, "criar_processo", null, "criado a partir da pasta", quemAtual(papel), agoraLocal());
          var r = salvarProc(q); if (!r) return;
          UI.fecharModal(); G._cplId = r.id; G._cplView = "proc"; G._cplAba = "passos"; G._cplPasso = "demanda"; App.render();
          montarDaPasta(fs_, null);
        };
      }
    },
    "cpl-criar-obra": function () {
      var p = procAtual(); if (!p || !exigirEditavel(p, "editar_dfd")) return;
      UI.modal("Criar obra", campo("Nome da obra *", '<input id="cpl-co-nome">') + '<p class="muted">Os demais dados da obra se completam no módulo Obras.</p>', [
        { texto: "Criar e vincular", classe: "primary", onClick: function () {
          var nome = lerCampo("cpl-co-nome"); if (!nome) { toast("Dê um nome à obra.", "erro"); return; }
          var ob = Store.salvar(eid(), "obras", { nome: nome });
          if (!ob) { toast("Não consegui criar a obra.", "erro"); return; }
          UI.fecharModal();
          gravar("demanda", function (q) { var antes = q.obraId; q.obraId = ob.id; return { antes: { obraId: antes }, depois: { obraId: ob.id } }; });
          App.render();
        } },
        { texto: "Cancelar", onClick: function () { UI.fecharModal(); } }]);
    },
    "cpl-aceitar-tipo": function (ds) {
      var ok = gravar("demanda", function (q) { var a = q.tipoObjeto; q.tipoObjeto = ds.tipo; return { antes: { tipoObjeto: a }, depois: { tipoObjeto: ds.tipo } }; });
      if (ok) { toast("Tipo de objeto confirmado.", "ok"); App.render(); }
    },
    "cpl-salvar-demanda": function () {
      var ok = gravar("demanda", function (q) {
        var antes = { secretaria: q.secretaria, requisitante: q.requisitante, objeto: q.objeto, tipoObjeto: q.tipoObjeto, justificativa: q.justificativa, pca: q.pca, prazoDesejado: q.prazoDesejado, recursoFederal: q.recursoFederal, sigiloso: q.sigiloso, obraId: q.obraId };
        q.secretaria = emBranco(lerCampo("cpl-secretaria")); q.requisitante = emBranco(lerCampo("cpl-requisitante")); q.objeto = emBranco(lerCampo("cpl-objeto"));
        q.tipoObjeto = emBranco(lerCampo("cpl-tipo")); q.justificativa = emBranco(lerCampo("cpl-justificativa")); q.pca = emBranco(lerCampo("cpl-pca")); q.prazoDesejado = emBranco(lerCampo("cpl-prazoDesejado"));
        q.recursoFederal = deSn3(lerCampo("cpl-recursoFederal")); q.sigiloso = deSn3(lerCampo("cpl-sigiloso")); q.obraId = emBranco(lerCampo("cpl-obraProc"));
        if (q.sigiloso !== null) q.parametros.sigiloso.valor = q.sigiloso;
        var dep = { secretaria: q.secretaria, requisitante: q.requisitante, objeto: q.objeto, tipoObjeto: q.tipoObjeto, justificativa: q.justificativa, pca: q.pca, prazoDesejado: q.prazoDesejado, recursoFederal: q.recursoFederal, sigiloso: q.sigiloso, obraId: q.obraId };
        return F.diferencas(antes, dep, Object.keys(dep));
      });
      if (ok) { toast("Demanda salva.", "ok"); App.render(); }
    },

    /* ---------- conferi ---------- */
    "cpl-conferir": function (ds) {
      var p = procAtual(); if (!p) return;
      try { var q = F.conferirPasso(p, ds.passo, papeis(), nomeAtual(), agoraLocal()); if (salvarProc(q)) { toast("Passo conferido.", "ok"); var prox = F.passoAtual(q); G._cplPasso = prox.id !== ds.passo ? prox.id : ds.passo; App.render(); } }
      catch (e) { toast(e.message || String(e), "erro"); }
    },
    "cpl-desconferir": function (ds) {
      var p = procAtual(); if (!p) return;
      try { var q = F.desconferirPasso(p, ds.passo, papeis(), quemAtual(null), agoraLocal()); if (salvarProc(q)) { toast("Conferência desfeita.", "ok"); App.render(); } }
      catch (e) { toast(e.message || String(e), "erro"); }
    },

    /* ---------- acervo ---------- */
    "cpl-add-arq": function () { var el = document.getElementById("cpl-arq"); if (el) el.click(); },
    "cpl-add-pasta": function () { var el = document.getElementById("cpl-pasta"); if (el) el.click(); },
    "cpl-preparo-escolher": function () {
      var p = procAtual(); if (!p || !exigirEditavel(p, "editar_acervo")) return;
      var el = document.getElementById("cpl-preparo-pasta"); if (el) el.click();
    },
    "cpl-doc-tipo": function (ds) {
      var c = cortaCtx(ds.value), tipo = c.v, docId = c.ctx;
      var ok = gravar("acervo", function (q) {
        var dc = q.documentos.filter(function (z) { return z.id === docId; })[0];
        if (!dc || !R.ACERVO_TIPOS[tipo] || dc.tipo === tipo) return null;
        var antes = dc.tipo; dc.tipo = tipo; dc.disciplina = R.ACERVO_TIPOS[tipo].disciplina; dc.confianca = "manual"; dc.motivo = "tipo escolhido por " + nomeAtual();
        var r = C.adicionarDocumentos(q, []);      // recalcula superados/repetidos com o tipo novo
        q.documentos = r.documentos;
        return { antes: { arquivo: dc.nome, tipo: antes }, depois: { arquivo: dc.nome, tipo: tipo } };
      });
      if (ok) App.render();
    },
    "cpl-doc-abrir": function (ds) { var p = procAtual(); if (!p) return; abrirArquivoDoc(arr(p.documentos).filter(function (z) { return z.id === ds.id; })[0]); },

    /* ---------- quantitativos ---------- */
    "cpl-q-trazer": function () {
      var sel = lerCampo("cpl-orcamentoId");
      if (!sel) { toast("Escolha o orçamento primeiro.", "erro"); return; }
      var ok = gravar("quantitativos", function (q) {
        var orcs = Store.listarOrcamentos(eid()), orc = orcs.filter(function (o) { return o.id === sel; })[0];
        var c = calc(orc); if (!c) throw new Error("Não consegui calcular o orçamento escolhido.");
        var antigos = {}; arr(q.quantitativos).forEach(function (z) { antigos[z.item] = z; });
        var antes = { orcamentoId: q.orcamentoId, itens: arr(q.quantitativos).length };
        q.orcamentoId = sel;
        q.quantitativos = c.linhas.map(function (l) { var a = antigos[l.numero]; return { item: l.numero, itemRef: l.numero, codigo: l.codigo || "", descricao: l.descricao, un: l.unidade, qtd: l.quantidade, origem: a && a.origem ? a.origem : { arquivo: null, pagina: null } }; });
        return { antes: antes, depois: { orcamentoId: sel, itens: q.quantitativos.length } };
      });
      if (ok) { toast("Itens trazidos do orçamento.", "ok"); App.render(); }
    },
    "cpl-q-salvar": function () {
      var ok = gravar("quantitativos", function (q) {
        var antes = JSON.stringify(q.quantitativos.map(function (z) { return z.origem; })), sel = lerCampo("cpl-orcamentoId");
        q.quantitativos.forEach(function (z, i) {
          var a = lerCampo("cpl-qa-" + i), pg = lerCampo("cpl-qp-" + i);
          /* leva F: a LINHA da planilha de onde o sistema leu a quantidade não se perde ao salvar a origem */
          var oAnt = z.origem || {}, o2 = { arquivo: a || null, pagina: pg || null };
          if (oAnt.linha && oAnt.arquivo === o2.arquivo) o2.linha = oAnt.linha;
          z.origem = o2;
        });
        if (sel && q.orcamentoId !== sel) q.orcamentoId = sel;
        var depois = JSON.stringify(q.quantitativos.map(function (z) { return z.origem; }));
        return antes === depois ? null : { antes: antes, depois: depois };
      });
      if (ok) { toast("Origens salvas.", "ok"); App.render(); }
    },

    /* ---------- ETP ---------- */
    "cpl-salvar-etp": function () {
      var ok = gravar("etp", function (q) {
        var antes = JSON.stringify({ c: q.etp.campos, j: q.etp.justificativas });
        q.etp = q.etp || { campos: {}, justificativas: {}, lacunas: [] }; q.etp.campos = {}; q.etp.justificativas = {};
        R.ETP_ELEMENTOS.forEach(function (el) {
          var v = lerCampo("cpl-etp-" + el.id); if (v) q.etp.campos[el.id] = v;
          var j = lerCampo("cpl-etpj-" + el.id); if (j) q.etp.justificativas[el.id] = j;
        });
        var depois = JSON.stringify({ c: q.etp.campos, j: q.etp.justificativas });
        return antes === depois ? null : { antes: antes, depois: depois };
      });
      if (ok) { toast("ETP salvo.", "ok"); App.render(); }
    },

    /* ---------- riscos ---------- */
    "cpl-r-sugeridos": function () {
      var ok = gravar("riscos", function (q) {
        var sug = C.riscosSugeridos(q.tipoObjeto), ja = {}; arr(q.riscos).forEach(function (r) { ja[r.id] = 1; });
        var novos = sug.filter(function (r) { return !ja[r.id]; });
        if (!novos.length) return null;
        var antes = arr(q.riscos).length; q.riscos = arr(q.riscos).concat(novos);
        return { antes: antes + " risco(s)", depois: q.riscos.length + " risco(s)" };
      });
      if (ok) { toast("Riscos sugeridos incluídos. Ajuste e salve.", "ok"); App.render(); }
    },
    "cpl-r-remover": function (ds) {
      var ok = gravar("riscos", function (q) { var r = q.riscos.splice(Number(ds.i), 1)[0]; return r ? { antes: r.descricao, depois: "removido" } : null; });
      if (ok) App.render();
    },
    "cpl-r-salvar": function () {
      var ok = gravar("riscos", function (q) {
        var antes = JSON.stringify(q.riscos);
        q.riscos.forEach(function (r, i) {
          var pb = lerCampo("cpl-rp-" + i), im = lerCampo("cpl-ri-" + i);
          r.prob = pb ? Number(pb) : null; r.impacto = im ? Number(im) : null; r.alocacao = emBranco(lerCampo("cpl-ra-" + i)); r.mitigacao = lerCampo("cpl-rm-" + i); r.sugerido = false;
        });
        var depois = JSON.stringify(q.riscos);
        return antes === depois ? null : { antes: "riscos", depois: "riscos ajustados" };
      });
      if (ok) { toast("Riscos salvos.", "ok"); App.render(); }
    },

    /* ---------- orçamento de referência ---------- */
    "cpl-orc-abrir": function () {
      var p = procAtual(); if (!p || !p.orcamentoId) return;
      if (App.tela === "gestao" && App.irPara && App.irPara("orcamentos") === false) return;
      /* leva L: a base exigida já tem de estar instalada ao abrir (senão o orçamento abre com «A base SINAPI não está carregada») */
      garantirBaseDoOrc(p, orcDoProc(p)).then(function () { App.abrirOrcamento(p.orcamentoId); });
    },
    "cpl-orc-escopo": function () { orcarPeloEscopo(); },
    "cpl-pdf-conferida": function () {
      var ok = gravar("orcamento", function (q) {
        var o = q.preparo && q.preparo.orcamento; if (!o || !o.leituraPdf) return null;
        var antes = { leituraPdfConferida: o.leituraPdf.conferida === true }; o.leituraPdf.conferida = true;
        return { antes: antes, depois: { leituraPdfConferida: true } };
      });
      if (ok) { toast("Leitura do PDF marcada como conferida por você.", "ok"); App.render(); }
    },
    "cpl-importar-meu-arquivo": function () { if (App.abrirTabelas) App.abrirTabelas(); },
    "cpl-orc-usar": function (ds) { var b = document.getElementById("cpl-oBase"), c = document.getElementById("cpl-oComp"); if (b) b.value = ds.base || ""; if (c && !c.value) c.value = ds.comp || ""; },
    "cpl-orc-salvar": function () {
      var pOrc = procAtual(), selOrc = lerCampo("cpl-orcamentoId");
      /* leva L: escolher o orçamento instala (e preenche) a base exigida sozinha — sem a pessoa abrir Tabelas */
      var orcEsc = null; try { orcEsc = selOrc ? arr(Store.listarOrcamentos(eid())).filter(function (o) { return o.id === selOrc; })[0] : null; } catch (eL) { orcEsc = null; }
      if (pOrc && orcEsc && !salvandoComBase) {
        garantirBaseDoOrc(pOrc, orcEsc).then(function (r) {
          var u = r && r.usadas && r.usadas[0], b = document.getElementById("cpl-oBase"), c = document.getElementById("cpl-oComp");
          if (u) {
            if (b && !b.value) b.value = u.catId === "SINAPI" || u.catId === "SINAPI_DES" ? "SINAPI/" + u.uf + (u.regime === "desonerado" ? " desonerado" : " não desonerado") : u.base + "/" + u.uf;
            if (c && !c.value) c.value = u.competencia || "";
          }
          salvandoComBase = true; try { acoes["cpl-orc-salvar"](); } finally { salvandoComBase = false; }
        });
        return;
      }
      var ok = gravar("orcamento", function (q) {
        var sel = lerCampo("cpl-orcamentoId"), antes = { orcamentoId: q.orcamentoId, base: q.orcamentoRef.base, competencia: q.orcamentoRef.competencia };
        q.orcamentoId = emBranco(sel); q.orcamentoRef = { base: emBranco(lerCampo("cpl-oBase")), competencia: emBranco(lerCampo("cpl-oComp")) };
        var dep = { orcamentoId: q.orcamentoId, base: q.orcamentoRef.base, competencia: q.orcamentoRef.competencia };
        return F.diferencas(antes, dep, Object.keys(dep));
      });
      if (ok) { toast("Orçamento de referência salvo.", "ok"); App.render(); }
    },
    "cpl-orc-pacote": function () {
      var p = procAtual(); if (!p) return;
      if (!exigir(podeAcao("gerar_minuta") ? "gerar_minuta" : "ler_tudo")) return;
      var orc = orcDoProc(p), c = calc(orc);
      if (!orc || !c) { toast("Escolha o orçamento de referência do processo antes de gerar o pacote.", "erro"); return; }
      if (typeof OrcamentoReferencia === "undefined") { toast("O gerador do pacote do orçamento de referência não carregou.", "erro"); return; }
      var cx = ctxDocs(p), bases = []; try { bases = (typeof Bases !== "undefined" && Bases.lista) ? Bases.lista() : []; } catch (e0) { bases = []; }
      var emp = {}; try { emp = (typeof Empresa !== "undefined" && Empresa.dados) ? Empresa.dados() : {}; } catch (e1) { emp = {}; }
      var op = F.opcoesPacoteReferencia(p, orc, c, { orgaoNome: cx.orgao.nome, empresa: emp, bases: bases, hoje: hoje() });
      toast("Gerando o pacote do orçamento de referência…", "info");
      OrcamentoReferencia.baixar(orc, op).then(function (r) {
        var nb = r.pendencias && r.pendencias.bloqueios ? r.pendencias.bloqueios.length : 0;
        toast(nb ? "Pacote gerado COM PENDÊNCIAS (" + nb + ") — não publicar; veja a página de pendências." : "Pacote do orçamento de referência gerado.", nb ? "info" : "ok");
      }, function (e) { toast("Não gerei o pacote: " + (e && e.message ? e.message : e), "erro"); });
    },
    "cpl-pesq-salvar": function () {
      var ok = gravar("orcamento", function (q) {
        q.pesquisa = q.pesquisa || { itens: {} };
        var antes = JSON.stringify({ a: q.pesquisa.dataPesquisa, m: q.pesquisa.metodo, r: q.pesquisa.regraDescarte, e: q.dataPrevistaEdital });
        q.pesquisa.dataPesquisa = emBranco(lerCampo("cpl-pDataPesq")); q.pesquisa.metodo = emBranco(lerCampo("cpl-pMetodo"));
        var ab = lerNum("cpl-pDescAbaixo"), ac = lerNum("cpl-pDescAcima");
        q.pesquisa.regraDescarte = (ab !== null || ac !== null) ? { abaixoPct: ab, acimaPct: ac } : null;
        q.dataPrevistaEdital = emBranco(lerCampo("cpl-pDataEdital"));
        var depois = JSON.stringify({ a: q.pesquisa.dataPesquisa, m: q.pesquisa.metodo, r: q.pesquisa.regraDescarte, e: q.dataPrevistaEdital });
        return antes === depois ? null : { antes: antes, depois: depois };
      }, "editar_pesquisa");
      if (ok) { toast("Parâmetros da pesquisa salvos.", "ok"); App.render(); }
    },
    "cpl-f-tipo": function (ds) { var c = cortaCtx(ds.value); G._cplFonteTipo[c.ctx] = c.v; setFoco("orcamento", "pesq:" + c.ctx); App.render(); },
    "cpl-f-add": function (ds) {
      var it = ds.item, tipo = G._cplFonteTipo[it];
      var p0 = procAtual(), reg = p0 ? C.pesquisaPrecos.regulamentoEfetivo(p0) : null;
      if (!tipo && reg && reg.ordem[0]) tipo = reg.ordem[0].tipo;
      var valor = lerNum("cpl-fv-" + it);
      if (valor === null || valor <= 0) { toast("Informe o valor unitário da fonte.", "erro"); return; }
      var f = { tipo: tipo, valor: valor, fornecedor: emBranco(lerCampo("cpl-ff-" + it)) };
      if (document.getElementById("cpl-fb-" + it)) f.base = lerCampo("cpl-fb-" + it);
      if (document.getElementById("cpl-fl-" + it)) f.link = emBranco(lerCampo("cpl-fl-" + it));
      if (document.getElementById("cpl-fda-" + it)) { f.dataAcesso = emBranco(lerCampo("cpl-fda-" + it)); f.horaAcesso = emBranco(lerCampo("cpl-fha-" + it)); }
      if (document.getElementById("cpl-fdc-" + it)) f.dataColeta = emBranco(lerCampo("cpl-fdc-" + it));
      if (document.getElementById("cpl-fdq-" + it)) { f.dataConclusao = emBranco(lerCampo("cpl-fdq-" + it)); f.emExecucao = !!document.getElementById("cpl-fex-" + it).checked; f.fatorAtualizacao = lerNum("cpl-fat-" + it); }
      var ok = gravar("orcamento", function (q) {
        q.pesquisa = q.pesquisa || { itens: {} }; q.pesquisa.itens = q.pesquisa.itens || {};
        var cfg = q.pesquisa.itens[it] = q.pesquisa.itens[it] || { fontes: [], justificativa: null };
        cfg.fontes = arr(cfg.fontes).concat([f]);
        return { antes: "item " + it + ": " + (cfg.fontes.length - 1) + " fonte(s)", depois: "item " + it + ": " + cfg.fontes.length + " fonte(s)" };
      }, "editar_pesquisa");
      if (ok) { setFoco("orcamento", "pesq:" + it); toast("Fonte adicionada.", "ok"); App.render(); }
    },
    "cpl-f-remover": function (ds) {
      var ok = gravar("orcamento", function (q) {
        var cfg = q.pesquisa && q.pesquisa.itens ? q.pesquisa.itens[ds.item] : null; if (!cfg) return null;
        var r = cfg.fontes.splice(Number(ds.i), 1)[0]; return r ? { antes: "item " + ds.item + ": fonte " + (Number(ds.i) + 1), depois: "removida" } : null;
      }, "editar_pesquisa");
      if (ok) { setFoco("orcamento", "pesq:" + ds.item); App.render(); }
    },
    "cpl-f-just": function (ds) {
      var ok = gravar("orcamento", function (q) {
        q.pesquisa = q.pesquisa || { itens: {} }; q.pesquisa.itens = q.pesquisa.itens || {};
        var cfg = q.pesquisa.itens[ds.item] = q.pesquisa.itens[ds.item] || { fontes: [], justificativa: null }, ant = cfg.justificativa;
        cfg.justificativa = emBranco(lerCampo("cpl-pj-" + ds.item));
        return ant === cfg.justificativa ? null : { antes: ant, depois: cfg.justificativa };
      }, "editar_pesquisa");
      if (ok) { setFoco("orcamento", "pesq:" + ds.item); toast("Justificativa salva.", "ok"); App.render(); }
    },

    /* ---------- TR ---------- */
    "cpl-salvar-tr": function () {
      var ok = gravar("tr", function (q) {
        var antes = JSON.stringify(q.tr);
        q.tr = preservarFora(lerCampos({ objeto: emBranco(lerCampo("cpl-tr-objeto")), medicao: emBranco(lerCampo("cpl-tr-medicao")), recebimento: emBranco(lerCampo("cpl-tr-recebimento")), pagamento: emBranco(lerCampo("cpl-tr-pagamento")), gestao: emBranco(lerCampo("cpl-tr-gestao")), dotacao: emBranco(lerCampo("cpl-tr-dotacao")) }, q, "tr"), antes);
        var depois = JSON.stringify(q.tr);
        return antes === depois ? null : { antes: antes, depois: depois };
      });
      if (ok) { toast("TR salvo.", "ok"); App.render(); }
    },

    /* ---------- parâmetros ---------- */
    "cpl-par-aceitar": function (ds) {
      var id = ds.id;
      var ok = gravar("parametros", function (q) {
        var c = calc(orcDoProc(q)), linhas = c ? c.linhas.map(function (l) { return { item: l.numero, descricao: l.descricao, total: l.precoTotal, qtd: l.quantidade, un: l.unidade }; }) : [];
        var s = C.parametros.sugerir(q, { totalEstimado: c ? c.precoVenda : undefined, linhas: linhas })[id];
        if (s && (s.sugerido === null || s.sugerido === undefined) && q.parametros[id] && q.parametros[id].sugerido !== null && q.parametros[id].sugerido !== undefined) { s = { sugerido: q.parametros[id].sugerido, regra: q.parametros[id].regra || s.regra, fonte: s.fonte, pendencias: s.pendencias }; }
        if (!s || s.sugerido === null || s.sugerido === undefined) throw new Error("O sistema ainda não tem sugestão para este parâmetro: " + (s && s.pendencias[0] ? s.pendencias[0] : "complete os passos anteriores") + ".");
        if (typeof s.sugerido === "string" && / ou /.test(s.sugerido)) throw new Error("O sistema aponta duas modalidades possíveis («" + s.sugerido + "»). Escolha uma na lista: a decisão é do órgão.");
        var antes = q.parametros[id].valor, v = s.sugerido;
        if (id === "garantia_contrato") v = { pct: s.sugerido.pctMax, seguroRetomada: s.sugerido.grandeVulto === true };
        q.parametros[id].valor = v; q.parametros[id].sugerido = s.sugerido; q.parametros[id].regra = s.regra; q.parametros[id].fonte = s.fonte; q.parametros[id].conferido = true;
        if (id === "sigiloso") q.sigiloso = v;
        return { antes: antes, depois: v };
      });
      if (ok) { toast("Sugestão aceita.", "ok"); App.render(); }
    },
    "cpl-par-datas": function () {
      var ok = gravar("parametros", function (q) {
        var antes = JSON.stringify({ r: q.regulamentoId, e: q.dataPrevistaEdital, a: q.cronograma, f: q.feriadosLocais, n: q.naturezaEspecial || null, par: q.parametros });
        /* parâmetros preenchidos por controle (select/campo) */
        R.PARAMETROS_ORDEM.forEach(function (id) {
          var def = R.PARAMETROS[id], el = document.getElementById("cpl-par-" + id), v;
          if (id === "reajuste") {
            var ind = lerCampo("cpl-par-reaj-i"), db = lerCampo("cpl-par-reaj-d");
            if (ind || db) q.parametros[id].valor = { indice: emBranco(ind), dataBase: emBranco(db) }; return;
          }
          if (!el) return;
          if (def.resposta === "bool") { v = deSn3(el.value); if (v !== null) { q.parametros[id].valor = v; if (id === "sigiloso") q.sigiloso = v; } return; }
          if (def.resposta === "texto") { if (el.value) q.parametros[id].valor = el.value; return; }
          if (id === "garantia_contrato") {
            var pct = lerNum("cpl-par-" + id);
            if (pct !== null) { if (pct < 0 || pct > 10) throw new Error("A garantia vai de 0 a 10% (acima de 5% só com justificativa de complexidade e risco)."); q.parametros[id].valor = { pct: pct, seguroRetomada: !!(q.parametros[id].valor && q.parametros[id].valor.seguroRetomada) }; }
          }
        });
        if (q.recursoFederal !== true) q.regulamentoId = emBranco(lerCampo("cpl-regulamento")); else q.regulamentoId = "federal-14133";
        q.dataPrevistaEdital = emBranco(lerCampo("cpl-dataEdital"));
        q.cronograma = { dataAbertura: emBranco(lerCampo("cpl-dataAbertura")) };
        var chk = document.getElementById("cpl-nat-esp");
        if (chk) {
          if (chk.checked) {
            var jn = emBranco(lerCampo("cpl-nat-just"));
            if (!jn) { var en = new Error("Para tratar como obra/serviço especial (25 dias úteis), escreva a justificativa técnica."); en.campo = "naturezaEspecial"; throw en; }
            q.naturezaEspecial = { ativo: true, justificativa: jn };
          } else delete q.naturezaEspecial;
        }
        q.feriadosLocais = lerCampo("cpl-feriados").split(/[\s,;]+/).filter(function (s) { return /^\d{4}-\d{2}-\d{2}$/.test(s); });
        var depois = JSON.stringify({ r: q.regulamentoId, e: q.dataPrevistaEdital, a: q.cronograma, f: q.feriadosLocais, n: q.naturezaEspecial || null, par: q.parametros });
        return antes === depois ? null : { antes: "parâmetros e datas", depois: "parâmetros e datas atualizados" };
      });
      if (ok) { toast("Parâmetros e datas salvos.", "ok"); App.render(); }
    },

    /* ---------- documentos ---------- */
    "cpl-doc-previa": function (ds) {
      var p = procAtual(); if (!p) return;
      if (!(podeAcao("gerar_minuta") || podeAcao("ler_tudo") || podeAcao("editar_tr"))) { toast("Seu perfil não vê a prévia dos documentos do processo.", "erro"); return; }
      var r = docPorId(p, ds.doc); if (!r.doc) return;
      var aviso = modeloDoTipo(r.doc.id) ? '<p class="muted" id="cpl-previa-aviso">Prévia do texto do modelo <b>padrão da casa</b>. O Word baixado sai no <b>modelo do órgão</b> importado.</p>' : "";
      UI.modal(r.doc.nome, aviso + '<div class="cpl-previa" id="cpl-previa">' + r.doc.html + "</div>", [{ texto: "Fechar", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
    },
    "cpl-doc-baixar": function (ds) {
      var p = procAtual(); if (!p) return;
      if (!(podeAcao("gerar_minuta") || podeAcao("ler_tudo"))) { toast("Seu perfil não baixa documentos do processo.", "erro"); return; }
      var r = docPorId(p, ds.doc); if (!r.doc) return;
      /* o modelo do ÓRGÃO tem prioridade; o padrão da casa é a reserva (tipo sem modelo importado) */
      if (modeloDoTipo(r.doc.id)) { baixarDoModeloDoOrgao(p, r.doc); return; }
      baixarDocx(r.doc.html, D.nomeArquivo({ arquivo: r.doc.arquivo }, p));
    },
    "cpl-doc-baixar-padrao": function (ds) {
      var p = procAtual(); if (!p) return;
      if (!(podeAcao("gerar_minuta") || podeAcao("ler_tudo"))) { toast("Seu perfil não baixa documentos do processo.", "erro"); return; }
      var r = docPorId(p, ds.doc); if (!r.doc) return;
      baixarDocx(r.doc.html, D.nomeArquivo({ arquivo: r.doc.arquivo }, p));
    },
    "cpl-salvar-edital": function () {
      var ok = gravar("minuta", function (q) {
        var antes = JSON.stringify(q.edital || {});
        q.edital = preservarFora(lerCampos({ numero: emBranco(lerCampo("cpl-ed-numero")), habilitacao: emBranco(lerCampo("cpl-ed-habilitacao")), sancoes: emBranco(lerCampo("cpl-ed-sancoes")), vigencia: emBranco(lerCampo("cpl-ed-vigencia")), rescisaoForo: emBranco(lerCampo("cpl-ed-rescisao")) }, q, "edital"), antes);
        var depois = JSON.stringify(q.edital);
        return antes === depois ? null : { antes: antes, depois: depois };
      });
      if (ok) { toast("Dados da minuta salvos.", "ok"); App.render(); }
    },
    "cpl-gerar": function () {
      var p = procAtual(); if (!p) return;
      var papel = exigirEditavel(p, "gerar_minuta"); if (!papel) return;
      var g = D.gerar(p, ctxDocs(p)), q = clone(p);
      q.pacote = g.pendentes === 0
        ? { geradoEm: agoraLocal(), assinatura: F.assinaturaConteudo(q), docs: g.docs.map(function (z) { return { id: z.id, nome: z.nome, publico: z.publico, pendentes: 0 }; }), geradoPor: nomeAtual() }
        : { geradoEm: null, tentativaEm: agoraLocal(), pendentes: g.pendentes, docs: g.docs.map(function (z) { return { id: z.id, nome: z.nome, pendentes: z.pendentes }; }) };
      F.registrar(q, "gerar_documentos", null, g.pendentes === 0 ? "gerados sem campo em branco" : g.pendentes + " campo(s) [PREENCHER]", quemAtual(papel), agoraLocal());
      q.passos.minuta.conferido = false;
      var r = Store.salvar(eid(), ENT_PROC, q);        // sem normalizar: acabamos de fixar a assinatura certa
      if (!r) { toast("Não consegui gravar o processo.", "erro"); return; }
      var fOrgG = g.pendentes === 0 ? [] : faltaDoOrgao(q);
      toast(g.pendentes === 0 ? g.docs.length + " documentos gerados" : "Há " + g.pendentes + " campo(s) em branco: o passo não fica pronto. Baixe como rascunho ou complete os passos." + (fOrgG.length ? " Faltam dados no Cadastro do órgão: " + fOrgG.map(function (x) { return x.rotulo; }).join("; ") + "." : ""), g.pendentes === 0 ? "ok" : "aviso", g.pendentes === 0 ? null : corrigirDaMinuta(q, fOrgG));
      App.render();
    },

    /* ---------- jurídico ---------- */
    "cpl-enviar-jur": function () {
      var p = procAtual(); if (!p) return;
      try { var q = F.enviarJuridico(p, papeis(), nomeAtual(), agoraLocal()); if (salvarProc(q)) { toast("Processo enviado ao jurídico.", "ok"); App.render(); } }
      catch (e) { toast(e.message || String(e), "erro", { passo: "conformidade", campo: "" }); }
    },
    "cpl-emitir-parecer": function () {
      var p = procAtual(); if (!p) return;
      var papel = exigir("emitir_parecer"); if (!papel) return;
      var ress = lerCampo("cpl-par-ress").split(/\r?\n/).map(function (s) { return s.replace(/^\s+|\s+$/g, ""); }).filter(Boolean);
      try {
        var q = C.fluxoJuridico.emitirParecer(p, { resultado: lerCampo("cpl-par-res"), texto: lerCampo("cpl-par-txt"), ressalvas: ress }, { nome: nomeAtual(), papel: papel }, agoraLocal());
        if (salvarProc(q)) { toast("Parecer registrado.", "ok"); App.render(); }
      } catch (e) { toast(e.message || String(e), "erro"); }
    },
    "cpl-resp-ress": function (ds) {
      var p = procAtual(); if (!p) return;
      var papel = exigir("responder_ressalva"); if (!papel) return;
      try {
        var q = C.fluxoJuridico.responderRessalva(p, Number(ds.i), lerCampo("cpl-rr-" + ds.i), { nome: nomeAtual(), papel: papel }, agoraLocal());
        if (salvarProc(q)) { toast("Resposta registrada.", "ok"); App.render(); }
      } catch (e) { toast(e.message || String(e), "erro"); }
    },
    "cpl-ciencia": function () {
      var p = procAtual(); if (!p) return;
      try { var q = F.darCiencia(p, papeis(), nomeAtual(), agoraLocal()); if (salvarProc(q)) { toast("Ciência registrada.", "ok"); App.render(); } }
      catch (e) { toast(e.message || String(e), "erro"); }
    },
    "cpl-autorizar": function () {
      var p = procAtual(); if (!p) return;
      try { var q = F.autorizar(p, papeis(), nomeAtual(), agoraLocal()); if (salvarProc(q)) { toast("Abertura autorizada.", "ok"); App.render(); } }
      catch (e) { toast(e.message || String(e), "erro", { passo: "conformidade", campo: "" }); }
    },
    "cpl-publicar": function () {
      var p = procAtual(); if (!p) return;
      var c = calc(orcDoProc(p));
      try {
        var q = F.publicar(p, papeis(), nomeAtual(), agoraLocal(), refDoCalc(c));
        if (salvarProc(q)) { toast("Edital publicado. A referência de preços foi congelada para a análise das propostas.", "ok"); G._cplAba = "propostas"; App.render(); }
      } catch (e) { toast(e.message || String(e), "erro", { passo: "conformidade", campo: "" }); }
    },

    /* ---------- propostas ---------- */
    "cpl-prop-importar": function () {
      var p = procAtual(); if (!p) return;
      if (!exigir("analisar_propostas")) return;
      if (!lerCampo("cpl-lic-nome")) { toast("Informe o nome do licitante antes de escolher a planilha.", "erro"); return; }
      var el = document.getElementById("cpl-arq-prop"); if (el) el.click();
    },
    "cpl-resultado-data": function () {
      var p = procAtual(); if (!p) return;
      var papel = exigir("analisar_propostas"); if (!papel) return;
      var q = clone(p), ant = q.resultadoEm; q.resultadoEm = emBranco(lerCampo("cpl-resultadoEm"));
      if (ant === q.resultadoEm) { toast("Nada mudou.", "info"); return; }
      F.registrar(q, "resultado_divulgado", ant, q.resultadoEm, quemAtual(papel), agoraLocal());
      if (salvarProc(q)) { toast("Data do resultado salva.", "ok"); App.render(); }
    },
    "cpl-prop-decidir": function (ds) {
      var p = procAtual(); if (!p) return;
      if (!exigir("analisar_propostas")) return;
      var acao = ds.acao, rot = { classificar: "Classificar a proposta", diligencia: "Pedir diligência", desclassificar: "Desclassificar a proposta" }[acao];
      var corpo = campo(acao === "classificar" ? "Observação (opcional)" : "Motivo (vai no documento ao licitante) *", '<textarea id="cpl-dec-motivo" rows="3"></textarea>') + (acao === "diligencia" ? campo("Prazo para resposta", '<input id="cpl-dec-prazo" type="date">') : "") +
        '<p class="muted">O sistema apenas sugeriu. Esta decisão é sua e fica registrada com seu nome e a hora.</p>';
      UI.modal(rot, corpo, [
        { texto: "Confirmar", classe: "primary", onClick: function () {
          var atual = procAtual(); if (!atual) return;
          try {
            var q = F.decidirProposta(atual, ds.id, { acao: acao, motivo: lerCampo("cpl-dec-motivo") }, papeis(), nomeAtual(), agoraLocal());
            if (acao === "diligencia") { var pr = q.propostas.filter(function (z) { return z.id === ds.id; })[0]; pr.decisao.prazo = emBranco(lerCampo("cpl-dec-prazo")); }
            if (salvarProc(q)) { UI.fecharModal(); toast("Decisão registrada.", "ok"); App.render(); }
          } catch (e) { toast(e.message || String(e), "erro"); }
        } },
        { texto: "Cancelar", onClick: function () { UI.fecharModal(); } }]);
    },
    "cpl-prop-doc": function (ds) {
      var p = procAtual(); if (!p) return;
      if (!(podeAcao("analisar_propostas") || podeAcao("ler_tudo"))) { toast("Seu perfil não gera estes documentos.", "erro"); return; }
      var pr = arr(p.propostas).filter(function (z) { return z.id === ds.id; })[0]; if (!pr) return;
      var tipo = ds.tipo === "desclassificacao" ? "desclassificacao" : ds.tipo;
      var html = D.gerarProposta(tipo, p, pr, ctxDocs(p));
      var nome = { parecer: "Parecer de analise da proposta", diligencia: "Termo de diligencia", desclassificacao: "Comunicado de desclassificacao" }[tipo];
      baixarDocx(html, nome + " - " + F.codigoDe(p));
    },

    /* ---------- habilitação dos licitantes (leva E1) ---------- */
    "cpl-hab-parear": function () {
      if (!exigir("gerenciar_logins")) return;
      var cod = lerCampo("cpl-hab-codigo"), st = storageLocal();
      if (!st) { toast("Este navegador não guarda a conexão. Use outro navegador ou o app instalado.", "erro"); return; }
      var cfg = cfgServico();
      H.previaPareamento(cfg, cod).then(function (pv) {
        var corpo = "<p>O CertamePRO vai conectar este aparelho à conta abaixo. Confira antes de confirmar.</p><ul>" +
          "<li>Conta: <b>" + esc(pv.conta) + "</b> (" + esc(pv.papel || "—") + ")</li>" +
          (pv.empresas.length ? "<li>Órgão(s): " + pv.empresas.map(function (e) { return esc(e.nome); }).join(", ") + "</li>" : "") + "</ul>" +
          '<p class="muted">O acesso fica guardado só neste aparelho e pode ser desligado a qualquer hora.</p>';
        UI.modal("Conectar ao CertamePRO", corpo, [
          { texto: "Confirmar a conexão", classe: "primary", onClick: function () {
            H.parear(cfg, cod, "CPLPRO " + (usuario().nome || "")).then(function (r) {
              var ok = H.gravarPareamento(st, eid(), { token: r.token, usuario: r.usuario, aparelhoId: r.aparelhoId, escopo: r.escopo, pareadoEm: r.pareadoEm, servico: cfg.servico });
              UI.fecharModal();
              if (!ok) { toast("Não consegui guardar a conexão neste aparelho.", "erro"); return; }
              var pp = procAtual(); if (pp) { var q = clone(pp); F.registrar(q, "habilitacao:parear", null, "aparelho conectado", quemAtual("admin_orgao"), agoraLocal()); salvarProc(q); }
              G._cplHabRepar = false; toast("Conectado ao CertamePRO.", "ok"); App.render();
            }, function (e) { toast(msgErroHab(e), "erro"); });
          } },
          { texto: "Cancelar", onClick: function () { UI.fecharModal(); } }]);
      }, function (e) { toast(msgErroHab(e), "erro"); });
    },
    "cpl-hab-desligar": function () {
      if (!exigir("gerenciar_logins")) return;
      var st = storageLocal(); if (!st) return;
      H.desligar(st, eid()); G._cplHabRepar = false;
      var pd = procAtual(), q = pd ? clone(pd) : null; if (q) { F.registrar(q, "habilitacao:desligar", "aparelho conectado", null, quemAtual("admin_orgao"), agoraLocal()); salvarProc(q); }
      toast("Este aparelho foi desligado do CertamePRO. O acesso foi apagado daqui.", "ok"); App.render();
    },
    "cpl-hab-arquivos": function () { if (!exigir("analisar_propostas")) return; var el = document.getElementById("cpl-hab-arq"); if (el) el.click(); },
    "cpl-hab-pasta": function () { if (!exigir("analisar_propostas")) return; var el = document.getElementById("cpl-hab-pasta"); if (el) el.click(); },
    "cpl-hab-limpar": function () { habArquivos = []; var el = document.getElementById("cpl-hab-sel"); if (el) el.textContent = "nenhum arquivo escolhido"; },
    "cpl-hab-analisar": function () {
      var p = procAtual(); if (!p || habOcupado) return;
      var papel = exigir("analisar_propostas"); if (!papel) return;
      var par = pareamento();
      if (!par) { toast("Conecte o CPLPRO ao CertamePRO primeiro (caixa «Habilitação dos licitantes»).", "erro"); return; }
      var f = habLerForm(), ficha;
      try { ficha = H.montarFicha(p, { cnpj: f.cnpj, razaoSocial: f.razao }, f.sessao); } catch (e) { toast(e.message || String(e), "erro"); return; }
      if (!habArquivos.length) { toast("Escolha os arquivos (ou a pasta) do licitante antes de analisar.", "erro"); return; }
      habOcupado = true;
      var st = document.getElementById("cpl-hab-status"); if (st) st.textContent = "Analisando " + habArquivos.length + " arquivo(s)… isto pode levar alguns minutos.";
      H.analisar(cfgServico(), ficha, habArquivos).then(function (resposta) {
        habOcupado = false;
        var atual = procAtual(); if (!atual) return;
        try {
          var q = H.registrarAnalise(atual, papeis(), { cnpj: f.cnpj, razaoSocial: f.razao, dataSessao: f.sessao || H.dataSessaoDoProcesso(atual), ficha: ficha, resposta: resposta }, quemAtual(papel), agoraLocal());
          if (salvarProc(q)) { habArquivos = []; G._cplHabRepar = false; toast("Análise recebida: " + resposta.resultados.length + " exigência(s). Nenhuma foi decidida — a decisão é sua.", "ok"); App.render(); }
        } catch (e2) { toast(e2.message || String(e2), "erro"); }
      }, function (e) {
        habOcupado = false;
        if (e && e.reparear) { G._cplHabRepar = true; App.render(); }
        var st2 = document.getElementById("cpl-hab-status"); if (st2) st2.textContent = "";
        toast(msgErroHab(e), "erro");
      });
    },
    "cpl-hab-decidir": function (ds) {
      var p = procAtual(); if (!p) return;
      var linha = document.querySelector('.cpl-hab-lic[data-lic="' + ds.lic + '"] tr[data-ex="' + ds.ex + '"]'); if (!linha) return;
      var sel = linha.querySelector(".cpl-hab-sel"), mot = linha.querySelector(".cpl-hab-mot");
      try {
        var q = H.decidir(p, papeis(), ds.lic, ds.ex, { situacao: sel ? sel.value : "", motivo: mot ? mot.value : "" }, quemAtual(F.papelPara(papeis(), "analisar_propostas")), agoraLocal());
        if (salvarProc(q)) { toast("Decisão registrada com o seu nome e a hora.", "ok"); App.render(); }
      } catch (e) { toast(e.message || String(e), "erro"); }
    },
    "cpl-hab-prazo": function (ds) {
      var p = procAtual(); if (!p) return;
      var el = document.querySelector('.cpl-hab-lic[data-lic="' + ds.lic + '"] .cpl-hab-prazo');
      try {
        var q = H.definirPrazoDiligencia(p, papeis(), ds.lic, el ? el.value : "", quemAtual(F.papelPara(papeis(), "analisar_propostas")), agoraLocal());
        if (salvarProc(q)) { toast("Prazo da diligência salvo.", "ok"); App.render(); }
      } catch (e) { toast(e.message || String(e), "erro"); }
    },
    "cpl-hab-adjudicatario": function () {
      var p = procAtual(); if (!p) return;
      var el = document.getElementById("cpl-hab-adj");
      try {
        var q = H.escolherAdjudicatario(p, papeis(), el ? el.value : "", quemAtual(F.papelPara(papeis(), "adjudicar")), agoraLocal());
        if (salvarProc(q)) { toast("Licitante a adjudicar registrado.", "ok"); App.render(); }
      } catch (e) { toast(e.message || String(e), "erro"); }
    },
    "cpl-hab-recurso": function (ds) {
      var p = procAtual(); if (!p) return;
      if (!exigir("analisar_propostas")) return;
      var lic = H.licPorId(p, ds.lic); if (!lic) return;
      var rc = lic.recurso || { itens: [], conclusao: "", intencaoEm: "" };
      var pz = H.prazosRecurso(p);
      var corpo = '<p class="muted">Prazos do art. 165 (dias úteis): ' + (pz ? "razões até <b>" + esc(dataBR(pz.razoesAte)) + "</b>, contrarrazões até <b>" + esc(dataBR(pz.contrarrazoesAte)) + "</b>." : "informe a data do resultado na aba Propostas.") + "</p>" +
        (arr(rc.itens).length ? "<p>" + arr(rc.itens).length + " alegação(ões) já registrada(s).</p>" : "") +
        campo("Intenção de recorrer manifestada em", '<input id="cpl-rec-intencao" type="date" value="' + esc(rc.intencaoEm || "") + '">') +
        campo("Nova alegação do recorrente", '<textarea id="cpl-rec-alegacao" rows="3"></textarea>') +
        campo("Exigência relacionada (opcional)", '<select id="cpl-rec-exig"><option value="">—</option>' + arr(lic.resultados).map(function (r) { return '<option value="' + esc(r.id) + '">' + esc(r.id) + "</option>"; }).join("") + "</select>") +
        campo("Documento (arquivo e página; opcional)", '<input id="cpl-rec-doc">') +
        campo("Resposta à alegação (texto do servidor)", '<textarea id="cpl-rec-resp" rows="2"></textarea>') +
        campo("Conclusão (texto do servidor)", '<textarea id="cpl-rec-concl" rows="3">' + esc(rc.conclusao || "") + "</textarea>") +
        '<p class="muted">O sistema só organiza os fatos: a conclusão e as respostas são escritas por você.</p>';
      UI.modal("Recurso — Licitante " + H.ordem(p, lic.id), corpo, [
        { texto: "Salvar", classe: "primary", onClick: function () {
          var atual = procAtual(); if (!atual) return;
          var dados = { conclusao: lerCampo("cpl-rec-concl"), intencaoEm: lerCampo("cpl-rec-intencao") };
          if (lerCampo("cpl-rec-alegacao")) { dados.alegacao = lerCampo("cpl-rec-alegacao"); dados.exigenciaId = lerCampo("cpl-rec-exig"); dados.documento = lerCampo("cpl-rec-doc"); dados.resposta = lerCampo("cpl-rec-resp"); }
          try {
            var q = H.registrarRecurso(atual, papeis(), ds.lic, dados, quemAtual(F.papelPara(papeis(), "analisar_propostas")), agoraLocal());
            if (salvarProc(q)) { UI.fecharModal(); toast("Recurso registrado.", "ok"); App.render(); }
          } catch (e) { toast(e.message || String(e), "erro"); }
        } },
        { texto: "Cancelar", onClick: function () { UI.fecharModal(); } }]);
    },
    "cpl-hab-doc": function (ds) {
      var p = procAtual(); if (!p) return;
      var g = H.podeGerar(ds.tipo, p, ds.lic || null, papeis());
      if (!g.ok) { toast(g.motivo, "erro"); return; }
      var html;
      try { html = D.gerarHabilitacao(ds.tipo, p, ds.lic || null, ctxDocs(p)); } catch (e) { toast(e.message || String(e), "erro"); return; }
      baixarDocx(html, D.nomeArquivoHab(ds.tipo, p, ds.lic || null));
    },

    /* ---------- pessoas e papéis ---------- */
    "cpl-pap-salvar": function (ds) {
      var papel = exigir("gerenciar_logins"); if (!papel) return;
      var marcados = [];
      Array.prototype.forEach.call(document.querySelectorAll("input[data-pap-pessoa]"), function (el) { if (el.getAttribute("data-pap-pessoa") === ds.pessoa && el.checked) marcados.push(el.getAttribute("data-pap")); });
      var reg = arr(K.lista(ENT_PAP)).filter(function (r) { return r.usuarioId === ds.pessoa; })[0] || { usuarioId: ds.pessoa, id: "pap-" + F.hash(String(ds.pessoa)) };
      var antes = arr(reg.papeis).join(",");
      reg.nome = ds.nome; reg.papeis = marcados;
      if (Store.salvar(eid(), ENT_PAP, reg)) { toast("Papéis de " + ds.nome + " salvos (" + (marcados.join(", ") || "nenhum") + ").", "ok"); if (antes !== marcados.join(",")) App.render(); }
      else toast("Não consegui gravar os papéis.", "erro");
    },

    /* ---------- painel ---------- */
    "cpl-painel": function () { abrirPainel(); }
  };
  /* cada ação passa por `iniciarAcao` (sabe qual botão foi clicado, para o retorno ao lado dele). As chamadas internas
     `acoes[...]()` seguem na cópia crua. */
  var acoesTela = {};
  Object.keys(acoes).forEach(function (k) { var fn = acoes[k]; acoesTela[k] = function (ds) { iniciarAcao(k, ds); return fn.apply(this, arguments); }; });
  G.registrarAcoes(MODULO, acoesTela);

  /* campos que não podem ter data-gacao (arquivo): ligam aqui, depois do DOM existir */
  G.registrarWire(MODULO, function () {
    try { reanexarRetornos(); } catch (eRt) {}
    var a = document.getElementById("cpl-arq"), pa = document.getElementById("cpl-pasta");
    if (a) a.onchange = function () { adicionarArquivos(this.files); this.value = ""; };
    if (pa) pa.onchange = function () { adicionarArquivos(this.files); this.value = ""; };
    var pp = document.getElementById("cpl-preparo-pasta");
    if (pp) pp.onchange = function () { var fs_ = Array.prototype.slice.call(this.files || []); this.value = ""; if (fs_.length) montarDaPasta(fs_, null); };
    var ot = document.getElementById("cpl-org-timbrado-arq");
    if (ot) ot.onchange = function () { var f = this.files && this.files[0]; this.value = ""; if (f) importarTimbrado(f); };
    if (G._cplView === "orgao" && G._cplFoco) { var fo = document.getElementById("cpl-org-" + G._cplFoco); G._cplFoco = null; if (fo && fo.focus) { try { fo.scrollIntoView({ block: "center" }); } catch (eS) {} fo.focus(); } }
    var am = document.getElementById("cpl-mod-arq");
    if (am) am.onchange = function () { var f = this.files && this.files[0]; this.value = ""; if (f) importarModelo(f, G._cplModTipo); };
    var ha = document.getElementById("cpl-hab-arq"), hp = document.getElementById("cpl-hab-pasta");
    if (ha) ha.onchange = function () { habEscolher(this.files, false); this.value = ""; };
    if (hp) hp.onchange = function () { habEscolher(this.files, true); this.value = ""; };
    var ap = document.getElementById("cpl-arq-prop");
    if (ap) ap.onchange = function () { var f = this.files && this.files[0]; this.value = ""; if (f) importarProposta(f); };
    /* "Corrigir" leva ao campo */
    var foco = G._cplFoco;
    if (foco) {
      G._cplFoco = null;
      var el = document.querySelector('#cpl-passo [data-foco="' + foco + '"]') || document.querySelector('#cpl-passo [data-foco-bloco="' + foco + '"]');
      if (!el && foco.indexOf(":") > 0) el = document.querySelector('#cpl-passo [data-foco="' + foco.split(":")[0] + '"]');
      if (el) {
        try { el.scrollIntoView({ block: "center" }); } catch (e1) {}
        var alvo = el.matches && el.matches("input,select,textarea,button") ? el : el.querySelector("input,select,textarea,button");
        if (alvo) { try { alvo.focus(); } catch (e2) {} }
        el.classList.add("cpl-foco");
        setTimeout(function () { el.classList.remove("cpl-foco"); }, 2500);
        if (el.tagName === "DETAILS") el.open = true;
      }
    }
  });

  function importarProposta(file) {
    var p = procAtual(); if (!p) return;
    var papel = exigir("analisar_propostas"); if (!papel) return;
    var nome = lerCampo("cpl-lic-nome");
    App._lerPlanilha(file, function (matriz, erro) {
      if (erro || !matriz) { toast(erro || "Não consegui ler a planilha.", "erro"); return; }
      var lido = F.proposta.ler(matriz);
      if (lido.erro) { toast(lido.erro, "erro"); return; }
      var atual = procAtual(); if (!atual) return;
      var q = clone(atual), c = calc(orcDoProc(atual));
      var prop = { id: "prp-" + F.hash(nome + "|" + file.name + "|" + agoraLocal()).substring(0, 10), licitante: nome, arquivo: file.name, importadoEm: hoje(), importadoPor: nomeAtual(), linhas: lido.linhas, totalDeclarado: lido.totalDeclarado, colunas: lido.colunas, decisao: null };
      try { prop.analise = F.analisarProposta(q, prop, modoDoOrc(c)); } catch (e) { toast(e.message || String(e), "erro"); return; }
      q.propostas = arr(q.propostas).concat([prop]);
      F.registrar(q, "proposta:importar", null, nome + " (" + lido.linhas.length + " itens)", quemAtual(papel), agoraLocal());
      if (salvarProc(q)) { toast("Proposta importada e comparada com a referência (" + prop.analise.achados.length + " achado(s)). Nenhuma decisão foi tomada.", "ok"); App.render(); }
    });
  }

  /* DEMONSTRAÇÃO EM UM CLIQUE (chamada por App._iniciarDemo): a decisão é do Fluxo.planoDemo — só a vitrine (empresa «demo») aplica
     o perfil do órgão e semeia o processo de exemplo; conta real nunca é tocada. Idempotente: abrir de novo não duplica nada. */
  function demonstracao(qs) {
    var emp = eid(), perfilAtual = "completo";
    try { if (typeof Perfis !== "undefined" && Perfis.idAtual) perfilAtual = Perfis.idAtual(); } catch (e0) {}
    var plano = F.planoDemo({ qs: qs, demo: !!(typeof App !== "undefined" && App._demo), empresaId: emp, perfilAtual: perfilAtual });
    try {
      if (plano.restaurar && typeof Perfis !== "undefined") Perfis.aplicar("completo");
      if (!plano.aplicar) return plano;
      if (typeof Perfis !== "undefined" && perfilAtual !== "orgao_publico") { var r = Perfis.aplicar("orgao_publico"); if (!r || !r.ok) plano.erro = (r && r.erro) || "não consegui aplicar o perfil do órgão"; }
      if (plano.semear) {
        if (!arr(Store.listar(emp, ENT_PROC)).some(function (x) { return x.id === F.DEMO_PROC_ID; })) Store.salvar(emp, ENT_PROC, F.processoExemplo(agoraLocal()));
        var uid = usuario().id;
        if (!arr(Store.listar(emp, ENT_PAP)).some(function (x) { return x.usuarioId === uid; })) Store.salvar(emp, ENT_PAP, F.papeisDemo(uid));
      }
    } catch (e) { plano.erro = e && e.message ? e.message : String(e); }
    return plano;
  }

  global.CplproUI = { fecharPainel: fecharPainel, demonstracao: demonstracao, retorno: retorno };
})(typeof window !== "undefined" ? window : this);
