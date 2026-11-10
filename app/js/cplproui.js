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

  var G = global.Gestao, K = G.ui, M = global.Modulo, C = global.Cplpro, R = global.CplproRegras, F = global.CplproFluxo, D = global.CplproDocs;
  var ENT_PROC = "cplpro_processos";
  var ENT_PAP = "cplpro_papeis";
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
  function toast(m, t) { if (typeof UI !== "undefined") UI.toast(m, t || "ok"); }

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
    try { dif = aplicar(q); } catch (e) { toast(e.message || String(e), "erro"); return false; }
    if (!dif) { toast("Nada mudou.", "info"); return false; }
    F.soltarConferencia(q, passoId);
    F.registrar(q, "editar:" + passoId, dif.antes, dif.depois, quemAtual(papel), agoraLocal());
    return !!salvarProc(q);
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
      html = G._cplView === "papeis" ? _renderPapeis(obras) : _renderLista(obras);
    }
    return html;
  };

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
    html += M.abas([{ id: "lista", rotulo: "Processos", ativa: true, attrs: 'data-gacao="cpl-aba-lista"' }, { id: "papeis", rotulo: "Pessoas e papéis", ativa: false, attrs: 'data-gacao="cpl-aba-papeis"' }]);
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
    html += M.abas([{ id: "lista", rotulo: "Processos", ativa: false, attrs: 'data-gacao="cpl-aba-lista"' }, { id: "papeis", rotulo: "Pessoas e papéis", ativa: true, attrs: 'data-gacao="cpl-aba-papeis"' }]);
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
    h += campo("Secretaria requisitante *", '<input id="cpl-secretaria" data-foco="secretaria" value="' + esc(p.secretaria || "") + '"' + d + ">", "secretaria");
    h += campo("Responsável pela demanda", '<input id="cpl-requisitante" value="' + esc(p.requisitante || "") + '"' + d + ">");
    h += campo("Objeto (descreva por inteiro) *", '<textarea id="cpl-objeto" rows="4" data-foco="objeto"' + d + ">" + esc(p.objeto || "") + "</textarea>", "objeto");
    h += campo("Tipo de objeto *", '<select id="cpl-tipo" data-foco="tipoObjeto"' + d + ">" + selOpts(tipos, p.tipoObjeto, "— escolha —") + "</select>" +
      (sug.length && sug[0].tipo !== p.tipoObjeto ? '<div class="cpl-sug">Sugestão pelo texto: <b>' + esc(R.TIPOS_OBJETO[sug[0].tipo].nome) + "</b> " + btn("Aceitar", "cpl-aceitar-tipo", ' data-tipo="' + sug[0].tipo + '"' + d, "sm") +
        porque("O texto do objeto contém: «" + sug[0].termos.join("», «") + "».", "Biblioteca RA de tipos de objeto (palavras-chave) — o sistema sugere e a pessoa confirma.", false, "Tipo de objeto") + "</div>" : ""), "tipoObjeto");
    h += campo("Justificativa da necessidade (interesse público) *", '<textarea id="cpl-justificativa" rows="4" data-foco="justificativa"' + d + ">" + esc(p.justificativa || "") + "</textarea>", "justificativa");
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
    h += '<div class="cpl-acoes">' + btn("Escolher arquivos", "cpl-add-arq", d) + btn("Escolher uma pasta", "cpl-add-pasta", d) + '<span class="muted" id="cpl-acervo-status"></span></div>';
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
          porque(z.motivo, "Classificação pelo nome do arquivo (regras da casa); a pessoa pode trocar.", false, "Tipo do arquivo") + "</td><td>" + esc(z.revisao || "—") + "</td><td>" + M.pilula(z.confianca === "alta" ? "alta" : (z.confianca === "media" ? "média" : (z.confianca === "manual" ? "manual" : "baixa")), z.confianca === "alta" || z.confianca === "manual" ? "ok" : "alerta") +
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
      var o = q.origem || {}, sem = vazio(o.arquivo) || vazio(o.pagina);
      var nomes = acervo.map(function (z) { return z.nome; });
      if (o.arquivo && nomes.indexOf(o.arquivo) < 0) nomes.push(o.arquivo);
      return '<tr data-foco="origem:' + esc(q.item) + '" class="' + (sem ? "cpl-sem" : "") + '"><td>' + esc(q.item) + "</td><td>" + esc(q.descricao) + "</td><td>" + esc(q.un) + '</td><td class="num">' + numBR(q.qtd, 2) + '</td><td><select id="cpl-qa-' + i + '"' + d + ">" + selOpts(nomes, o.arquivo, "— arquivo —") + '</select></td><td><input id="cpl-qp-' + i + '" style="width:80px" value="' + esc(o.pagina == null ? "" : o.pagina) + '"' + d + "></td></tr>";
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
      return '<div class="field' + (vermelho ? " cpl-obrig-vazio" : "") + '" data-foco-bloco="' + el.id + '"><label>' + esc(el.id) + " — " + esc(el.nome) + (el.obrigatorio ? ' <span class="cpl-obrig">obrigatório</span>' : "") + (!salvo && sugt ? ' <span class="cpl-sugerido">sugestão do sistema — confira e salve</span>' : "") + "</label>" +
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
      return '<tr data-foco="riscos.' + i + '"><td>' + esc(r.descricao) + '<div class="muted">' + esc(r.categoria || "") + (r.sugerido ? " · sugerido" : "") + '</div></td><td><select id="cpl-rp-' + i + '"' + d + ">" + selOpts(cinco, r.prob, "—") + '</select></td><td><select id="cpl-ri-' + i + '"' + d + ">" + selOpts(cinco, r.impacto, "—") + "</select></td><td>" +
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
    h += campo("Base de preços *", '<input id="cpl-oBase" data-foco="base" value="' + esc(ref.base || "") + '" placeholder="Ex.: SINAPI/SP não desonerado"' + d + ">" +
      (!ref.base && sugBase ? '<div class="cpl-sug">Do orçamento: <b>' + esc(sugBase) + "</b> " + btn("Usar", "cpl-orc-usar", ' data-base="' + esc(sugBase) + '" data-comp="' + esc(orc.competenciaSinapi || "") + '"' + d, "sm") + "</div>" : "") +
      (tp ? '<div class="cpl-sug">Base usual para ' + esc(tp.nome) + ": <b>" + esc(tp.base) + "</b>" + (tp.baseConferir ? porque(tp.baseNota || "", "Biblioteca RA de tipos de objeto", true, "Base de preços") : "") + "</div>" : ""), "base");
    h += campo("Competência (data-base) *", '<input id="cpl-oComp" data-foco="competencia" value="' + esc(ref.competencia || "") + '" placeholder="AAAA-MM"' + d + ">", "competencia");
    h += "</div>";
    h += '<div class="cpl-acoes">' + btn("Salvar orçamento de referência", "cpl-orc-salvar", d, "primary") + "</div>";
    if (!c) return h + M.aviso({ tom: "alerta", titulo: "Escolha o orçamento para ver os totais e a pesquisa de preços." });
    h += M.kpis([
      { rotulo: "Preço de venda", valor: moeda(c.precoVenda), sub: "total oficial do orçamento (com BDI)", id: "cpl-orc-total" },
      { rotulo: "Custo direto", valor: moeda(c.custoDireto) }, { rotulo: "BDI", valor: numBR(c.pct, 2) + " %" }, { rotulo: "Itens", valor: c.linhas.length }
    ]);
    h += _painelPesquisa(p, c, ed);
    return h;
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
        (oficial ? ' <select id="cpl-fb-' + esc(l.numero) + '"' + d + '><option>SINAPI</option><option>SICRO</option><option>SIURB</option></select>' : "") +
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

  /* ---------- 7. TR / PROJETO BÁSICO ---------- */
  function _pTr(p, x, ed) {
    var d = ed && podeAcao("editar_tr") ? "" : " disabled";
    var t = p.tr || {};
    var h = '<p class="muted">O termo de referência (art. 6º, XXIII) e o projeto básico (art. 6º, XXV) saem do que já está no processo; aqui você completa o que não se deduz.</p>';
    h += '<div class="cpl-form" id="cpl-f-tr">' +
      campo("Descrição do objeto *", '<textarea id="cpl-tr-objeto" rows="3" data-foco="objeto"' + d + ">" + esc(t.objeto != null ? t.objeto : (p.objeto || "")) + "</textarea>" + (vazio(t.objeto) && p.objeto ? '<div class="cpl-sugerido">pré-preenchido com o objeto do passo 1 — confira e salve</div>' : ""), "objeto") +
      campo("Critério de medição *", '<textarea id="cpl-tr-medicao" rows="3" data-foco="medicao"' + d + ">" + esc(t.medicao || "") + "</textarea>", "medicao") +
      campo("Critério de recebimento (provisório e definitivo) *", '<textarea id="cpl-tr-recebimento" rows="3" data-foco="recebimento"' + d + ">" + esc(t.recebimento || "") + "</textarea>", "recebimento") +
      campo("Pagamento (condições e prazo)", '<textarea id="cpl-tr-pagamento" rows="2"' + d + ">" + esc(t.pagamento || "") + "</textarea>") +
      campo("Gestão e fiscalização do contrato", '<textarea id="cpl-tr-gestao" rows="2"' + d + ">" + esc(t.gestao || "") + "</textarea>") +
      campo("Adequação orçamentária (dotação)", '<input id="cpl-tr-dotacao" value="' + esc(t.dotacao || "") + '"' + d + ">") + "</div>" +
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
      if (id === "sigiloso" && vazio(v)) v = p.sigiloso;
      var sugTxt = s.sugerido === null || s.sugerido === undefined ? "—" : (typeof s.sugerido === "object" ? _descObj(id, s.sugerido) : (typeof s.sugerido === "boolean" ? (s.sugerido ? "Sim" : "Não") : String(s.sugerido)));
      var ctrl = _ctrlParam(id, def, v, s, d);
      return '<tr data-foco="' + id + '"><td><b>' + esc(def.nome) + "</b>" + porque(s.regra + " " + (def.como || ""), s.fonte, s.conferir, def.nome) + (s.pendencias.length ? '<div class="cpl-alerta">' + esc(s.pendencias[0]) + "</div>" : "") + "</td><td>" + esc(sugTxt) + "</td><td>" + ctrl + "</td><td>" +
        (s.sugerido !== null && s.sugerido !== undefined && !(id === "reajuste") ? btn("Aceitar sugestão", "cpl-par-aceitar", ' data-id="' + id + '"' + d, "sm") : "") + "</td></tr>";
    }).join("") + "</tbody></table>";
    /* regulamento + datas */
    var regs = Object.keys(R.REGULAMENTOS).map(function (k) { return [k, R.REGULAMENTOS[k].nome]; });
    var efet = C.pesquisaPrecos.regulamentoEfetivo(p), cron = p.cronograma || {};
    h += '<div class="cpl-form" id="cpl-f-prazos"><h3>Regulamento, publicação e abertura</h3>' +
      campo("Regulamento de pesquisa de preços", '<select id="cpl-regulamento" data-foco="regulamentoId"' + (p.recursoFederal === true ? " disabled" : d) + ">" + selOpts(regs, p.recursoFederal === true ? "federal-14133" : p.regulamentoId, "— escolha —") + "</select>" +
        (p.recursoFederal === true ? '<div class="cpl-sug">Há recurso federal: vale o regulamento federal.</div>' : "") + (efet ? porque(efet.fonte, efet.fonte, efet.conferir === true, "Regulamento efetivo") : ""), "regulamentoId") +
      campo("Data de publicação do edital *", '<input id="cpl-dataEdital" type="date" data-foco="dataPrevistaEdital" value="' + esc(p.dataPrevistaEdital || "") + '"' + d + ">", "dataPrevistaEdital") +
      campo("Data de abertura das propostas", '<input id="cpl-dataAbertura" type="date" data-foco="dataAbertura" value="' + esc(cron.dataAbertura || "") + '"' + d + ">", "dataAbertura") +
      campo("Feriados locais (um por linha, AAAA-MM-DD)", '<textarea id="cpl-feriados" rows="2"' + d + ">" + esc(arr(p.feriadosLocais).join("\n")) + "</textarea>") + "</div>";
    var pz = F.prazo(p);
    h += '<div class="cpl-prazo" id="cpl-prazo">';
    if (pz.diasUteis) {
      h += "<p><b>Prazo mínimo:</b> " + pz.diasUteis + " dias úteis desde a publicação" + (pz.dataMinimaAbertura ? " → <b>abertura a partir de " + esc(dataBR(pz.dataMinimaAbertura)) + "</b>" : "") + "." +
        porque((pz.regra ? pz.regra.descricao + ". " : "") + pz.contagem, pz.fonte, pz.regra && pz.regra.conferir === false ? false : pz.conferir, "Prazo mínimo") + "</p>";
      if (pz.aberturaOk === false) h += '<p class="cpl-alerta">A data de abertura informada está antes do mínimo legal.</p>';
    }
    arr(pz.pendencias).forEach(function (m) { h += '<p class="cpl-alerta">' + esc(m) + "</p>"; });
    h += "</div>";
    return h + '<div class="cpl-acoes">' + btn("Salvar datas e regulamento", "cpl-par-datas", d, "primary") + "</div>";
  }
  function _descObj(id, v) {
    if (id === "parcelas_relevancia") return arr(v).length + " parcela(s)";
    if (id === "garantia_contrato") return "até " + v.pctMax + "% (até " + v.pctMaxComJustificativa + "% com justificativa)" + (v.grandeVulto ? "; seguro-garantia com retomada até " + v.seguroGarantiaRetomadaPctMax + "%" : "");
    if (id === "exequibilidade") return "inexequível abaixo de " + v.inexequivelAbaixoPct + "%; garantia adicional abaixo de " + v.garantiaAdicionalAbaixoPct + "%";
    if (id === "aditivo_teto") return "acréscimo até " + v.acrescimoPct + "%, supressão até " + v.supressaoPct + "%";
    if (id === "recurso_prazo") return v.diasUteis + " dias úteis";
    if (id === "reajuste") return "data-base " + (v.dataBase ? dataBR(v.dataBase) : "—") + "; índice a escolher";
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
    h += '<table class="tbl" id="cpl-tab-docs"><thead><tr><th>DOCUMENTO</th><th>USO</th><th class="num">CAMPOS EM BRANCO</th><th></th></tr></thead><tbody>' + g.docs.map(function (doc) {
      return "<tr><td><b>" + esc(doc.nome) + "</b></td><td>" + (doc.publico ? M.pilula("público", "info") : M.pilula("interno", "neutro")) + '</td><td class="num">' + (doc.pendentes ? M.pilula(String(doc.pendentes), "alerta") : M.pilula("0", "ok")) + "</td><td>" +
        btn("Prévia", "cpl-doc-previa", ' data-doc="' + doc.id + '"', "sm") + " " + btn("Baixar .docx", "cpl-doc-baixar", ' data-doc="' + doc.id + '"' + dis(podeAcao("gerar_minuta") || podeAcao("ler_tudo"), "Seu perfil não baixa documentos do processo."), "sm") + "</td></tr>";
    }).join("") + "</tbody></table>";
    h += "<p>" + (val_ ? M.pilula("Documentos gerados em " + dataHoraBR(pdoc.geradoEm), "ok") : (g.pendentes ? M.pilula(g.pendentes + " campo(s) em branco no total", "alerta") : M.pilula("ainda não gerados", "neutro"))) + "</p>";
    if (!val_ && pdoc.invalidadoEm) h += '<p class="cpl-alerta">A minuta gerada deixou de valer: ' + esc(pdoc.motivo || "o processo mudou") + ". Gere de novo.</p>";
    var e = p.edital || {}, dm = ed && podeAcao("gerar_minuta") ? "" : " disabled";
    h += '<h3>Dados que completam a minuta</h3><div class="cpl-form" id="cpl-f-edital">' +
      campo("Número do edital", '<input id="cpl-ed-numero" value="' + esc(e.numero || "") + '"' + dm + ">") +
      campo("Documentos de habilitação exigidos", '<textarea id="cpl-ed-habilitacao" rows="3"' + dm + ">" + esc(e.habilitacao || "") + "</textarea>") +
      campo("Regime de sanções aplicável", '<textarea id="cpl-ed-sancoes" rows="2"' + dm + ">" + esc(e.sancoes || "") + "</textarea>") +
      campo("Vigência e prazo de execução do contrato", '<input id="cpl-ed-vigencia" value="' + esc(e.vigencia || "") + '"' + dm + ">") +
      campo("Extinção do contrato, sanções contratuais e foro", '<textarea id="cpl-ed-rescisao" rows="2"' + dm + ">" + esc(e.rescisaoForo || "") + "</textarea>") + "</div>" +
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
    h += M.aviso({ tom: "info", titulo: "Habilitação: leitura automática na próxima versão.", texto: "Hoje o sistema compara só a planilha de preços com a referência congelada na publicação. A habilitação (documentos do licitante) continua sendo conferida pela comissão." });
    h += '<div class="cpl-acoes">' + campo("Nome do licitante", '<input id="cpl-lic-nome" placeholder="Razão social"' + d + ">") + btn("Importar planilha da proposta (.xlsx)", "cpl-prop-importar", dis(pode, motivoAcao("analisar_propostas")), "primary") +
      '<span class="muted">Aceita o .xlsx de proposta do OrçaPRO / CertamePRO.</span></div>';
    if (!props.length) return h + M.vazio({ icone: "documentos", titulo: "Nenhuma proposta importada", texto: "Importe a planilha de cada licitante. O sistema compara com a referência e sugere; a decisão é sempre do servidor." });
    h += '<div class="cpl-form"><h3>Resultado</h3>' + campo("Resultado divulgado em", '<input id="cpl-resultadoEm" type="date" value="' + esc(p.resultadoEm || "") + '"' + d + ">") + btn("Salvar data", "cpl-resultado-data", d, "sm") +
      (p.resultadoEm ? "<p>Fim do prazo de recurso: <b>" + esc(dataBR(F.fimPrazoRecurso(p))) + "</b></p>" : "") + "</div>";
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
            novos.push({ nome: f.name, sha: sha, ext: ext, origem: f.webkitRelativePath || null, data: f.lastModified ? hoje() : null });
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

  G.registrarAcoes(MODULO, {
    "cpl-obra": function (ds) { G._cplObra = ds && ds.value != null ? String(ds.value) : ""; App.render(); },
    "cpl-aba-lista": function () { G._cplView = "lista"; App.render(); },
    "cpl-aba-papeis": function () { G._cplView = "papeis"; App.render(); },
    "cpl-voltar": function () { G._cplView = "lista"; G._cplId = ""; App.render(); },
    "cpl-abrir": function (ds) { var p = procPorId(ds.id); if (!p) return; G._cplId = p.id; G._cplView = "proc"; G._cplAba = "passos"; G._cplPasso = F.passoAtual(p).id; App.render(); },
    "cpl-aba": function (ds) { G._cplAba = ds.aba || "passos"; App.render(); },
    "cpl-passo": function (ds) { G._cplPasso = ds.passo; G._cplFoco = null; App.render(); },
    "cpl-ir-atual": function () { var p = procAtual(); if (!p) return; G._cplPasso = F.passoAtual(p).id; G._cplFoco = null; G._cplAba = "passos"; App.render(); },
    "cpl-corrigir": function (ds) { setFoco(ds.passo, ds.item ? ds.campo + ":" + ds.item : ds.campo); App.render(); },
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
      var corpo = campo("Secretaria requisitante *", '<input id="cpl-n-sec">') + campo("Objeto *", '<textarea id="cpl-n-obj" rows="3"></textarea>') + campo("Obra", '<select id="cpl-n-obra">' + K.optsRec(obras, "nome", G._cplObra, "— sem obra —") + "</select>");
      UI.modal("Novo processo de licitação", corpo, [
        { texto: "Criar processo", classe: "primary", onClick: function () {
          var papel = exigir("criar_processo"); if (!papel) return;
          var sec = lerCampo("cpl-n-sec"), obj = lerCampo("cpl-n-obj"), obra = lerCampo("cpl-n-obra");
          if (!sec || !obj) { toast("Informe a secretaria e o objeto.", "erro"); return; }
          var q = C.novoProcesso({ secretaria: sec, objeto: obj, obraId: obra || null }, quemAtual(papel), agoraLocal());
          F.registrar(q, "criar_processo", null, "criado", quemAtual(papel), agoraLocal());
          var r = salvarProc(q); if (!r) return;
          UI.fecharModal(); G._cplId = r.id; G._cplView = "proc"; G._cplAba = "passos"; G._cplPasso = "demanda"; App.render();
        } },
        { texto: "Cancelar", onClick: function () { UI.fecharModal(); } }]);
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
          z.origem = { arquivo: a || null, pagina: pg || null };
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
      App.abrirOrcamento(p.orcamentoId);
    },
    "cpl-orc-usar": function (ds) { var b = document.getElementById("cpl-oBase"), c = document.getElementById("cpl-oComp"); if (b) b.value = ds.base || ""; if (c && !c.value) c.value = ds.comp || ""; },
    "cpl-orc-salvar": function () {
      var ok = gravar("orcamento", function (q) {
        var sel = lerCampo("cpl-orcamentoId"), antes = { orcamentoId: q.orcamentoId, base: q.orcamentoRef.base, competencia: q.orcamentoRef.competencia };
        q.orcamentoId = emBranco(sel); q.orcamentoRef = { base: emBranco(lerCampo("cpl-oBase")), competencia: emBranco(lerCampo("cpl-oComp")) };
        var dep = { orcamentoId: q.orcamentoId, base: q.orcamentoRef.base, competencia: q.orcamentoRef.competencia };
        return F.diferencas(antes, dep, Object.keys(dep));
      });
      if (ok) { toast("Orçamento de referência salvo.", "ok"); App.render(); }
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
        q.tr = { objeto: emBranco(lerCampo("cpl-tr-objeto")), medicao: emBranco(lerCampo("cpl-tr-medicao")), recebimento: emBranco(lerCampo("cpl-tr-recebimento")), pagamento: emBranco(lerCampo("cpl-tr-pagamento")), gestao: emBranco(lerCampo("cpl-tr-gestao")), dotacao: emBranco(lerCampo("cpl-tr-dotacao")) };
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
        var antes = JSON.stringify({ r: q.regulamentoId, e: q.dataPrevistaEdital, a: q.cronograma, f: q.feriadosLocais, par: q.parametros });
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
        q.feriadosLocais = lerCampo("cpl-feriados").split(/[\s,;]+/).filter(function (s) { return /^\d{4}-\d{2}-\d{2}$/.test(s); });
        var depois = JSON.stringify({ r: q.regulamentoId, e: q.dataPrevistaEdital, a: q.cronograma, f: q.feriadosLocais, par: q.parametros });
        return antes === depois ? null : { antes: "parâmetros e datas", depois: "parâmetros e datas atualizados" };
      });
      if (ok) { toast("Parâmetros e datas salvos.", "ok"); App.render(); }
    },

    /* ---------- documentos ---------- */
    "cpl-doc-previa": function (ds) {
      var p = procAtual(); if (!p) return;
      if (!(podeAcao("gerar_minuta") || podeAcao("ler_tudo") || podeAcao("editar_tr"))) { toast("Seu perfil não vê a prévia dos documentos do processo.", "erro"); return; }
      var r = docPorId(p, ds.doc); if (!r.doc) return;
      UI.modal(r.doc.nome, '<div class="cpl-previa" id="cpl-previa">' + r.doc.html + "</div>", [{ texto: "Fechar", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
    },
    "cpl-doc-baixar": function (ds) {
      var p = procAtual(); if (!p) return;
      if (!(podeAcao("gerar_minuta") || podeAcao("ler_tudo"))) { toast("Seu perfil não baixa documentos do processo.", "erro"); return; }
      var r = docPorId(p, ds.doc); if (!r.doc) return;
      baixarDocx(r.doc.html, D.nomeArquivo({ arquivo: r.doc.arquivo }, p));
    },
    "cpl-salvar-edital": function () {
      var ok = gravar("minuta", function (q) {
        var antes = JSON.stringify(q.edital || {});
        q.edital = { numero: emBranco(lerCampo("cpl-ed-numero")), habilitacao: emBranco(lerCampo("cpl-ed-habilitacao")), sancoes: emBranco(lerCampo("cpl-ed-sancoes")), vigencia: emBranco(lerCampo("cpl-ed-vigencia")), rescisaoForo: emBranco(lerCampo("cpl-ed-rescisao")) };
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
      toast(g.pendentes === 0 ? "Documentos gerados. Baixe cada um na lista." : "Há " + g.pendentes + " campo(s) em branco: o passo não fica pronto. Baixe como rascunho ou complete os passos.", g.pendentes === 0 ? "ok" : "aviso");
      App.render();
    },

    /* ---------- jurídico ---------- */
    "cpl-enviar-jur": function () {
      var p = procAtual(); if (!p) return;
      try { var q = F.enviarJuridico(p, papeis(), nomeAtual(), agoraLocal()); if (salvarProc(q)) { toast("Processo enviado ao jurídico.", "ok"); App.render(); } }
      catch (e) { toast(e.message || String(e), "erro"); }
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
      catch (e) { toast(e.message || String(e), "erro"); }
    },
    "cpl-publicar": function () {
      var p = procAtual(); if (!p) return;
      var c = calc(orcDoProc(p));
      try {
        var q = F.publicar(p, papeis(), nomeAtual(), agoraLocal(), refDoCalc(c));
        if (salvarProc(q)) { toast("Edital publicado. A referência de preços foi congelada para a análise das propostas.", "ok"); G._cplAba = "propostas"; App.render(); }
      } catch (e) { toast(e.message || String(e), "erro"); }
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
  });

  /* campos que não podem ter data-gacao (arquivo): ligam aqui, depois do DOM existir */
  G.registrarWire(MODULO, function () {
    var a = document.getElementById("cpl-arq"), pa = document.getElementById("cpl-pasta");
    if (a) a.onchange = function () { adicionarArquivos(this.files); this.value = ""; };
    if (pa) pa.onchange = function () { adicionarArquivos(this.files); this.value = ""; };
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

  global.CplproUI = { fecharPainel: fecharPainel };
})(typeof window !== "undefined" ? window : this);
