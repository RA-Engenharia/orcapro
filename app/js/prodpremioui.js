/* =====================================================================
 * prodpremioui.js — A TELA de "Produtividade e prêmio"
 *
 * O motor está em js/prodpremio.js; aqui só há tela e gravação.
 * Módulo SOB DEMANDA (js/perfis.js SOB_DEMANDA): só aparece para o perfil que
 * o NOMEIA — não entra no perfil completo de todo cliente.
 *
 * ⚠ O PRÊMIO É DA PESSOA NO MÊS, NÃO DA OBRA: a conta junta todos os dias dela
 *   em todas as obras (cada obra com a sua fonte) e a obra só recebe a parte
 *   proporcional aos dias que a pessoa trabalhou nela.
 * ⚠ MÊS HOMOLOGADO TRAVA a obra naquele mês (lançamento, aprovação, ocorrência
 *   e fonte). A porta é "Reabrir" no Fechamento, só da gestão, com histórico.
 *
 * Entidades (sincronizam; imunes à exclusão da obra, porque são prova de
 * pagamento a pessoa física — a obra some, o registro do prêmio não):
 *   pp_config  um registro só: parâmetros, funções, equipes, metas, vínculos
 *   pp_lanc    lançamento diário de equipe (rascunho → encarregado → gestão)
 *   pp_oc      ocorrência do dia (falta, presença, apoio, retrabalho, EPI, sem frente)
 *   pp_fech    fechamento homologado do mês (id determinístico obra × mês)
 *
 * ⚠ NADA AQUI LANÇA NO FINANCEIRO. A saída é o ARQUIVO para a folha. Lançar
 *   dinheiro exigiria o carimbo docTipo/docId e as portas de baixa da skill
 *   `dinheiro` — isso é outra entrega, e meia integração de dinheiro é pior
 *   que nenhuma.
 * ===================================================================== */
(function (global) {
  "use strict";

  if (typeof global.Gestao === "undefined") return;

  var G = global.Gestao, K = G.ui, PP = global.ProdPremio, M = global.Modulo;
  /* uma constante por linha, terminando em `;` — é o formato que o
     tools/test-v12-escopo.js reconhece como USO da entidade (senão ele acusa
     a chave de morta no mapa de escopo por obra) */
  var ENT_CFG = "pp_config";
  var ENT_LANC = "pp_lanc";
  var ENT_OC = "pp_oc";
  var ENT_FECH = "pp_fech";
  var ID_CFG = "pp-config";
  var MODULO = "prodpremio";

  function eid() { return (typeof Auth !== "undefined" && Auth.empresaId) ? Auth.empresaId() : "default"; }
  function esc(s) { return Util.esc(s == null ? "" : String(s)); }
  function moeda(v) { return v == null ? "—" : Util.fmtMoeda(v); }
  function n(v, c) { return v == null ? "—" : Util.fmtNum(v, c == null ? 2 : c); }
  function pct(v) { return v == null ? "—" : Util.fmtNum(v, 1) + " %"; }
  function arr(x) { return Array.isArray(x) ? x : []; }
  /* ⚠ DATA E MÊS LOCAIS, nunca `toISOString()`: das 21h à meia-noite o ISO
     já está em amanhã (mesma nota do js/remunvarui.js). */
  function hoje() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function compHoje() { return hoje().slice(0, 7); }

  function cfg() { var l = K.lista(ENT_CFG); return l.length ? l[0] : null; }
  function ehGestor() { return typeof Auth === "undefined" || !Auth.papel || Auth.papel() !== "usuario"; }
  function ehAprovador() {
    if (ehGestor()) return true;
    var u = (typeof Auth !== "undefined" && Auth.usuario && Auth.usuario()) || null;
    return !!(u && (u.aprovador === true || u._aprovador === true));
  }
  function exigir(cond, msg) { if (!cond) { UI.toast(msg, "erro"); return false; } return true; }
  function quem() {
    var u = (typeof Auth !== "undefined" && Auth.usuario && Auth.usuario()) || {};
    return (typeof Auth !== "undefined" && Auth.nome && Auth.nome()) || u.email || u.usuarioId || "";
  }
  function travado(obraId, comp) { return PP.mesHomologado(K.lista(ENT_FECH), obraId, comp); }
  /* ⚠ GUARDA EM FUNÇÃO: mês homologado não aceita lançamento, aprovação,
     ocorrência nem troca de fonte da obra. A porta é reabrir (só gestão). */
  function exigirAberto(obraId, data) {
    if (travado(obraId, String(data || "").slice(0, 7))) { UI.toast(PP.MSG_MES_TRAVADO, "erro"); return false; }
    return true;
  }

  G._ppAba = G._ppAba || "painel";
  G._ppObra = G._ppObra || "";
  G._ppComp = G._ppComp || "";
  G._ppEq = G._ppEq || "";
  G._ppEdit = null;

  function fonteDaObra(c, obraId) {
    var o = arr(c && c.obras).filter(function (x) { return x && x.id === obraId; })[0];
    return o && o.fonte === "rdo" ? "rdo" : "lancamento";
  }
  /* pessoa do módulo = cadastro de Colaboradores (nome) + função/equipe deste módulo */
  function colaboradores(c) {
    var map = {}; arr(c && c.colaboradores).forEach(function (x) { if (x && x.id) map[x.id] = x; });
    var out = [];
    K.lista("colaboradores").forEach(function (cb) {
      var m = map[cb.id] || {};
      out.push({ id: cb.id, nome: cb.nome || cb.id, funcaoId: m.funcaoId || "", equipeId: m.equipeId || "" });
      delete map[cb.id];
    });
    Object.keys(map).forEach(function (k) { out.push({ id: k, nome: map[k].nome || k, funcaoId: map[k].funcaoId || "", equipeId: map[k].equipeId || "", semCadastro: true }); });
    return out;
  }

  function estado() {
    if (!G._ppComp) G._ppComp = compHoje();
    var c = cfg(), per = PP.periodoDe(G._ppComp), obra = G._ppObra;
    if (!c) return { cfg: null, per: per };
    /* ⚠ A CONTA É DA PESSOA NO MÊS: junta as TODAS as obras (cada uma com a
       sua fonte) e só depois recorta a obra escolhida. Olhar uma obra de cada
       vez pagaria o prêmio máximo da pessoa uma vez por obra. */
    var todasLancs = K.lista(ENT_LANC).filter(function (l) { return l.data >= per.de && l.data <= per.ate; });
    var todasOcs = K.lista(ENT_OC).filter(function (o) { return o.data >= per.de && o.data <= per.ate; });
    var rdos = K.lista("rdo"), ids = {};
    K.lista("obras").forEach(function (o) { if (o && o.id) ids[o.id] = 1; });
    todasLancs.forEach(function (l) { if (l.obraId) ids[l.obraId] = 1; });
    todasOcs.forEach(function (o) { if (o.obraId) ids[o.obraId] = 1; });
    rdos.forEach(function (rd) { if (rd && rd.obraId && rd.data >= per.de && rd.data <= per.ate) ids[rd.obraId] = 1; });
    if (obra) ids[obra] = 1;
    /* ocorrência não aprovada pela gestão NÃO entra na conta */
    var ocsOk = PP.ocorrenciasAprovadas(todasOcs);
    var ocsDia = ocsOk.filter(function (o) { return o.tipo !== "sem_frente"; });
    var semFrente = ocsOk.filter(function (o) { return o.tipo === "sem_frente"; });
    var aps = [], pendRdo = [], semV = {}, fontes = {};
    Object.keys(ids).forEach(function (oid) {
      var fonte = fontes[oid] = fonteDaObra(c, oid);
      if (fonte === "rdo") {
        var rr = PP.apontamentosDoRdo(rdos, c.vinculos || {}, { obraId: oid, de: per.de, ate: per.ate, parametros: c.parametros });
        aps = aps.concat(rr.apontamentos);
        if (!obra || obra === oid) {
          pendRdo = pendRdo.concat(rr.pendentes);
          rr.semVinculo.forEach(function (sv) {
            var x = semV[sv.identidade] || (semV[sv.identidade] = { identidade: sv.identidade, servico: sv.servico, unidade: sv.unidade, qtd: 0 });
            x.qtd += sv.qtd;
          });
        }
      } else {
        todasLancs.filter(function (l) { return l.obraId === oid && PP.ESTADOS[l.estado] && PP.ESTADOS[l.estado].conta; })
          .forEach(function (l) { aps = aps.concat(PP.apontamentosDoLancamento(l, c.parametros, ocsDia)); });
      }
    });
    var lancs = todasLancs.filter(function (l) { return !obra || l.obraId === obra; });
    var ocs = todasOcs.filter(function (o) { return !obra || o.obraId === obra; });
    aps = PP.aplicarOcorrencias(aps, ocsDia);
    var colabs = colaboradores(c);
    var conf = {}; for (var k in c) if (Object.prototype.hasOwnProperty.call(c, k)) conf[k] = c[k];
    conf.colaboradores = colabs;
    var res = PP.apurar({ config: conf, apontamentos: aps, diasSemFrente: semFrente, obraId: obra || undefined, de: per.de, ate: per.ate });
    return { cfg: c, conf: conf, per: per, fonte: obra ? fonteDaObra(c, obra) : "", lancs: lancs, ocs: ocs, res: res, colabs: colabs, pendRdo: pendRdo,
      semVinculo: Object.keys(semV).map(function (x) { return semV[x]; }),
      naoAprovados: lancs.filter(function (l) { return fontes[l.obraId] !== "rdo" && !(PP.ESTADOS[l.estado] && PP.ESTADOS[l.estado].conta); }).length,
      ocsPendentes: ocs.filter(function (o) { return !PP.ocorrenciaAprovada(o); }).length };
  }

  /* ================================================================ TELA */
  G.renderProdPremio = function () {
    /* Fechamento, CSV da folha e configuração exportada são da gestão: o
       encarregado não vê o dinheiro de ninguém (a guarda também está nas funções) */
    var gest = ehGestor();
    var abas = [["painel", "Painel"], ["lancar", "Lançar o dia"], ["metas", "Metas"], ["equipe", "Equipe e custos"]];
    if (gest) abas.push(["fechamento", "Fechamento"]);
    if (G._ppAba === "fechamento" && !gest) G._ppAba = "painel";
    var obras = K.lista("obras");
    var c = cfg();
    var html = M.cab({ iconeHtml: K.svg("prodpremio", 22), titulo: "Produtividade e prêmio",
      sub: "Meta por serviço, medição diária e prêmio do mês",
      obraHtml: '<select id="pp-obra" data-gacao="pp-obra" aria-label="Obra">' + K.optsRec(obras, "nome", G._ppObra, "Todas as obras") + "</select>",
      acoes: [gest ? '<button class="btn" data-gacao="pp-importar">Importar configuração</button>' : "",
              c && gest ? '<button class="btn" data-gacao="pp-exportar-cfg">Exportar configuração</button>' : ""],
      primariaHtml: c ? '<button class="btn primary" data-gacao="pp-aba" data-aba="lancar">+ Lançar o dia</button>' : "" });
    html += '<input type="file" id="pp-arq" accept=".json,application/json" hidden>';
    if (!c) {
      return html + M.secao({ corpoHtml: M.vazio({ icone: "grafico", titulo: "Nenhuma configuração de produtividade",
        texto: "Importe o arquivo de configuração (funções, equipes, metas por serviço e regra do prêmio). Depois vincule os colaboradores às equipes.",
        acaoHtml: '<button class="btn primary" data-gacao="pp-importar">Importar configuração</button>' }) });
    }
    html += M.abas(abas.map(function (a) { return { id: a[0], rotulo: a[1], ativa: a[0] === G._ppAba, attrs: 'data-gacao="pp-aba"' }; }));
    var st = estado();
    if (G._ppAba === "lancar") return html + _lancar(st);
    if (G._ppAba === "metas") return html + _metas(st);
    if (G._ppAba === "equipe") return html + _equipe(st);
    if (G._ppAba === "fechamento") return html + _fechamento(st);
    return html + _painel(st);
  };

  function barra(p) {
    var v = Math.max(0, Math.min(100, p || 0));
    return '<div style="height:8px;border-radius:4px;background:var(--linha);min-width:80px"><div style="height:8px;border-radius:4px;width:' + v + '%;background:' + (v >= 100 ? "var(--verde)" : "var(--aco)") + '"></div></div>';
  }
  function filtroMes(st) {
    return M.filtros([K.campo("Mês", '<input id="pp-comp" type="month" value="' + esc(G._ppComp) + '">'),
      K.campo("Período", '<div style="padding-top:9px" class="muted">' + esc(Util.fmtDia(st.per.de)) + " a " + esc(Util.fmtDia(st.per.ate)) + "</div>")]);
  }
  function avisoTopo(st) {
    var r = st.res, itens = r.pendencias.slice();
    if (st.semVinculo.length) itens.push(st.semVinculo.length + " serviço(s) do diário sem vínculo com meta — veja a aba Metas.");
    if (st.pendRdo.length) itens.push(st.pendRdo.length + " lançamento(s) de diário ainda não aprovado(s) — não entram até o encarregado aprovar.");
    if (st.ocsPendentes) itens.push(st.ocsPendentes + " ocorrência(s) aguardando aprovação da gestão — não entram na conta.");
    if (st.naoAprovados) itens.push(st.naoAprovados + " lançamento(s) do mês ainda sem aprovação da gestão — não entram na conta.");
    var rv = K.lista("remun_param")[0];
    if (rv && rv.porM2 != null && rv.porM2 !== "") itens.push("A Remuneração variável por m² também está configurada. Se as duas valerem, o mesmo m² paga duas vezes — confirme qual regra vale.");
    if (!itens.length) return "";
    return M.aviso({ tom: "alerta", titulo: "Antes de fechar o mês", textoHtml: '<ul style="margin:4px 0 0 18px">' + itens.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" });
  }

  /* ---------- PAINEL ---------- */
  function _painel(st) {
    var r = st.res, html = avisoTopo(st) + filtroMes(st);
    var melhor = r.ranking[0], seq = r.pessoas.reduce(function (m, p) { return Math.max(m, p.sequencia || 0); }, 0);
    html += M.kpis([
      { rotulo: "Atingimento da obra", valor: pct(r.atingimentoObraPct), tom: r.atingimentoObraPct >= 100 ? "pos" : (r.atingimentoObraPct != null && r.atingimentoObraPct < r.parametros.gatilhoPct ? "alerta" : "info"), sub: "meta = 100 %" },
      { rotulo: "Melhor equipe", valor: melhor ? melhor.nome : "—", sub: melhor ? pct(melhor.atingimentoPct) : "sem lançamento" },
      { rotulo: "Maior sequência", valor: seq + " dia(s)", sub: "seguidos com nota ≥ 100 %" },
      { rotulo: "Prêmio projetado", valor: ehGestor() ? moeda(r.totalPremio) : "—", sub: ehGestor() ? "se o mês fechasse hoje" : "visível só para a gestão" }
    ]);
    var rk = r.ranking.length ? '<table class="tbl"><thead><tr><th>#</th><th>EQUIPE</th><th class="num">PESSOAS</th><th>ATINGIMENTO</th><th class="num">%</th><th>SELO</th></tr></thead><tbody>' +
      r.ranking.map(function (q, i) {
        return "<tr><td>" + (i + 1) + "</td><td><b>" + esc(q.nome) + '</b></td><td class="num">' + q.pessoas + "</td><td>" + barra(q.atingimentoPct) + '</td><td class="num">' + pct(q.atingimentoPct) + "</td><td>" +
          (q.semPortao ? M.pilula("Mês sem retrabalho", "ok") : M.pilula("Teve portão", "neutro")) + "</td></tr>";
      }).join("") + "</tbody></table>"
      : M.vazio({ icone: "grafico", titulo: "Ainda sem produção aprovada neste mês", texto: "O ranking aparece quando o primeiro lançamento é aprovado pela gestão." });
    html += M.secao({ titulo: "Ranking das equipes", sub: "Por equipe, nunca por pessoa: a meta é coletiva.", corpoHtml: rk });
    var metas = r.metas, servs = arr(st.cfg.servicos);
    var prog = r.progresso.length ? '<table class="tbl"><thead><tr><th>SERVIÇO</th><th class="num">FEITO</th><th class="num">TOTAL</th><th>PROGRESSO</th></tr></thead><tbody>' +
      r.progresso.map(function (g) { return "<tr><td>" + esc(g.nome) + '</td><td class="num">' + n(g.feito) + " " + esc(g.unidade) + '</td><td class="num">' + (g.total ? n(g.total) + " " + esc(g.unidade) : "—") + "</td><td>" + (g.pct != null ? barra(g.pct) : "") + "</td></tr>"; }).join("") + "</tbody></table>"
      : '<p class="muted" style="margin:0">Nenhum serviço medido no mês.</p>';
    html += M.secao({ titulo: "Progresso da obra no mês", corpoHtml: prog });
    html += M.secao({ titulo: "Meta do dia por serviço", sub: "Para a equipe padrão completa, em 8,8 h.",
      corpoHtml: '<table class="tbl"><thead><tr><th>SERVIÇO</th><th>EQUIPE</th><th class="num">META / DIA</th></tr></thead><tbody>' +
        servs.map(function (s) { var m = metas[s.id] || {}, q = arr(st.cfg.equipes).filter(function (x) { return x.id === s.equipePadrao; })[0]; return "<tr><td>" + esc(s.nome) + "</td><td>" + esc((q && q.nome) || s.equipePadrao) + '</td><td class="num"><b>' + (m.metaDia ? n(m.metaDia) + " " + esc(s.unidade) : M.pilula("sem meta", "alerta")) + "</b></td></tr>"; }).join("") + "</tbody></table>" });
    if (ehGestor()) html += M.secao({ titulo: "Prêmio projetado por pessoa", sub: "Só a gestão vê esta lista. O portal do cliente nunca recebe nome nem metragem." + (G._ppObra ? " O teto é da pessoa no mês: o prêmio dela se divide entre as obras pelos dias trabalhados em cada uma." : ""), corpoHtml: _tabelaPessoas(r.pessoas) });
    return html;
  }
  function _tabelaPessoas(pessoas) {
    if (!pessoas.length) return '<p class="muted" style="margin:0">Ninguém com dia apurado no mês.</p>';
    return '<table class="tbl"><thead><tr><th>COLABORADOR</th><th>FUNÇÃO</th><th class="num">DIAS</th><th class="num">ATINGIMENTO</th><th class="num">FRAÇÃO</th><th class="num">PRÊMIO</th><th></th></tr></thead><tbody>' +
      pessoas.map(function (P) {
        return "<tr><td><b>" + esc(P.nome) + "</b></td><td>" + esc(P.funcaoNome || P.funcaoId || "—") + '</td><td class="num">' + P.diasQueContam + '</td><td class="num">' + pct(P.atingimentoPct) +
          '</td><td class="num">' + pct(100 * P.fracaoMes) + '</td><td class="num"><b>' + (P.premio == null ? M.pilula("pendente", "alerta") : moeda(P.premio)) + "</b></td><td>" + (P.pendencia ? esc(P.pendencia) : "") + "</td></tr>";
      }).join("") + "</tbody></table>";
  }

  /* ---------- LANÇAR ---------- */
  function _lancar(st) {
    var c = st.cfg, html = filtroMes(st);
    if (!G._ppObra) return html + M.secao({ corpoHtml: M.vazio({ icone: "obra", titulo: "Escolha a obra no alto da tela", texto: "O lançamento é sempre de uma obra." }) });
    if (st.fonte === "rdo") html += M.aviso({ tom: "info", titulo: "Nesta obra a produção vem do Diário (RDO).", texto: "Lance a produção no diário; aqui ficam só as ocorrências (falta, retrabalho, EPI, chuva). Para lançar por aqui, troque a fonte na aba Metas." });
    if (travado(G._ppObra, G._ppComp)) html += M.aviso({ tom: "alerta", titulo: "Mês homologado.", texto: PP.MSG_MES_TRAVADO });
    var ed = G._ppEdit ? Store.obter(eid(), ENT_LANC, G._ppEdit) : null;
    if (st.fonte === "lancamento") {
      var eqs = arr(c.equipes), eqSel = (ed && ed.equipeId) || G._ppEq || (eqs[0] && eqs[0].id) || "";
      var membros = st.colabs.filter(function (x) { return x.equipeId === eqSel; });
      var mEd = {}; arr(ed && ed.membros).forEach(function (m) { mEd[m.colaboradorId] = m; });
      var epiEd = {}; arr(ed && ed.semEpi).forEach(function (id) { epiEd[id] = 1; });
      var corpo = '<div class="flex" style="gap:12px;flex-wrap:wrap">' +
        K.campo("Data *", '<input id="pp-l-data" type="date" value="' + esc((ed && ed.data) || hoje()) + '">') +
        K.campo("Equipe *", '<select id="pp-l-eq" data-gacao="pp-l-eq" style="min-width:220px">' + eqs.map(function (q) { return '<option value="' + esc(q.id) + '"' + (q.id === eqSel ? " selected" : "") + ">" + esc(q.nome || q.id) + "</option>"; }).join("") + "</select>") + "</div>";
      corpo += membros.length ? '<table class="tbl" style="margin-top:8px"><thead><tr><th>ESTAVA</th><th>COLABORADOR</th><th class="num">HORAS</th><th class="num">APOIO (H)</th><th>FALTA</th><th>SEM EPI</th></tr></thead><tbody>' +
        membros.map(function (x) {
          var m = mEd[x.id], estava = !ed || !!m;
          return '<tr><td><input type="checkbox" id="pp-m-' + esc(x.id) + '"' + (estava ? " checked" : "") + "></td><td>" + esc(x.nome) + "</td>" +
            '<td class="num"><input id="pp-h-' + esc(x.id) + '" inputmode="decimal" style="width:70px" value="' + esc(m && m.horas != null ? Util.fmtNum(m.horas, 1) : Util.fmtNum(PP.parametros(c.parametros).horasDia, 1)) + '"></td>' +
            '<td class="num"><input id="pp-a-' + esc(x.id) + '" inputmode="decimal" style="width:70px" value="' + esc(m && m.apoio ? Util.fmtNum(m.apoio, 1) : "") + '"></td>' +
            '<td><select id="pp-f-' + esc(x.id) + '"><option value="">—</option><option value="injustificada"' + (m && m.falta === "injustificada" ? " selected" : "") + '>Injustificada</option><option value="justificada"' + (m && m.falta === "justificada" ? " selected" : "") + ">Justificada</option></select></td>" +
            '<td><input type="checkbox" id="pp-e-' + esc(x.id) + '"' + (epiEd[x.id] ? " checked" : "") + "></td></tr>";
        }).join("") + "</tbody></table>"
        : '<p class="muted">Ninguém vinculado a esta equipe. Vincule os colaboradores na aba "Equipe e custos".</p>';
      var itEd = arr(ed && ed.itens);
      corpo += '<table class="tbl" style="margin-top:8px"><thead><tr><th>SERVIÇO PRODUZIDO</th><th class="num">QUANTIDADE</th></tr></thead><tbody>';
      for (var i = 0; i < 4; i++) {
        var it = itEd[i] || {};
        corpo += '<tr><td><select id="pp-s-' + i + '" style="min-width:320px"><option value="">—</option>' + arr(c.servicos).map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === it.servicoId ? " selected" : "") + ">" + esc(s.nome) + " (" + esc(s.unidade) + ")</option>"; }).join("") + "</select></td>" +
          '<td class="num"><input id="pp-q-' + i + '" inputmode="decimal" style="width:100px" value="' + esc(it.qtd ? Util.fmtNum(it.qtd, 2) : "") + '"></td></tr>';
      }
      corpo += "</tbody></table>";
      corpo += '<label style="display:inline-flex;gap:6px;align-items:center;margin-top:8px"><input type="checkbox" id="pp-l-ret"' + (ed && ed.retrabalho ? " checked" : "") + "> Houve retrabalho apontado pelo encarregado (o dia vale zero para a equipe)</label>";
      corpo += '<div class="flex mt" style="gap:8px"><button class="btn" data-gacao="pp-l-salvar">' + (ed ? "Salvar correção" : "Salvar rascunho") + '</button><button class="btn primary" data-gacao="pp-l-salvar" data-enviar="1">Salvar e enviar ao encarregado</button>' +
        (ed ? '<button class="btn ghost" data-gacao="pp-l-cancelar">Cancelar edição</button>' : "") + "</div>";
      html += M.secao({ titulo: ed ? "Corrigir lançamento" : "Produção do dia por equipe", sub: "A produção da equipe se divide pelas horas de quem estava. Só conta depois do encarregado e da gestão.", corpoHtml: corpo });
      html += M.secao({ titulo: "Lançamentos do mês", corpoHtml: _tabelaLancs(st) });
    }
    html += M.secao({ titulo: "Ocorrências do dia", sub: "Falta, presença do encarregado, horas de apoio, retrabalho, EPI e dia sem frente (chuva).", corpoHtml: _ocorrencias(st) });
    return html;
  }
  function _atingLanc(l, c) {
    var aps = PP.apontamentosDoLancamento(l, c.parametros), metas = PP.metas(c), g = 0, t = 0, p = PP.parametros(c.parametros);
    aps.forEach(function (a) {
      if (a.falta) return;
      t += Math.max(0, a.horas - (a.apoio || 0)) / p.horasDia;
      arr(a.itens).forEach(function (it) { var m = metas[it.servicoId]; if (m && m.metaDia && m.pessoasPadrao) g += it.qtd * m.pessoasPadrao / m.metaDia; });
    });
    return t > 0 ? 100 * g / t : null;
  }
  function _tabelaLancs(st) {
    var c = st.cfg, servs = {}; arr(c.servicos).forEach(function (s) { servs[s.id] = s; });
    var eqs = {}; arr(c.equipes).forEach(function (q) { eqs[q.id] = q; });
    var l = st.lancs.slice().sort(function (a, b) { return a.data < b.data ? 1 : -1; });
    if (!l.length) return '<p class="muted" style="margin:0">Nenhum lançamento neste mês.</p>';
    var tom = { rascunho: "neutro", enviado: "alerta", aprovado_encarregado: "info", aprovado: "ok", devolvido: "erro" };
    return '<table class="tbl"><thead><tr><th>DATA</th><th>EQUIPE</th><th>PRODUÇÃO</th><th class="num">ATINGIMENTO</th><th>SITUAÇÃO</th><th></th></tr></thead><tbody>' +
      l.map(function (x) {
        var e = x.estado || "rascunho", bt = [];
        if (e === "rascunho" || e === "devolvido") { bt.push('<button class="btn sm" data-gacao="pp-l-editar" data-id="' + esc(x.id) + '">Corrigir</button>'); bt.push('<button class="btn sm" data-gacao="pp-l-mover" data-acao="enviar" data-id="' + esc(x.id) + '">Enviar</button>'); }
        if (e === "enviado" || e === "aprovado_encarregado") { bt.push('<button class="btn sm" data-gacao="pp-l-mover" data-acao="aprovar" data-id="' + esc(x.id) + '">Aprovar</button>'); bt.push('<button class="btn sm" data-gacao="pp-l-mover" data-acao="devolver" data-id="' + esc(x.id) + '">Devolver</button>'); }
        if (e === "rascunho") bt.push('<button class="btn sm ghost" data-gacao="pp-l-excluir" data-id="' + esc(x.id) + '">Excluir</button>');
        if (e === "aprovado" && ehGestor() && !travado(x.obraId, String(x.data || "").slice(0, 7))) bt.push('<button class="btn sm ghost" data-gacao="pp-l-mover" data-acao="reabrir" data-id="' + esc(x.id) + '">Reabrir lançamento</button>');
        return "<tr><td>" + esc(Util.fmtDia(x.data)) + "</td><td>" + esc((eqs[x.equipeId] || {}).nome || x.equipeId) + "</td><td>" +
          arr(x.itens).map(function (it) { var s = servs[it.servicoId] || {}; return esc(n(it.qtd)) + " " + esc(s.unidade || "") + " " + esc(s.nome || it.servicoId); }).join("<br>") +
          (x.retrabalho ? "<br>" + M.pilula("retrabalho", "erro") : "") + '</td><td class="num">' + pct(_atingLanc(x, c)) + "</td><td>" + M.pilula((PP.ESTADOS[e] || {}).rotulo || e, tom[e] || "neutro") + "</td><td>" + bt.join(" ") + "</td></tr>";
      }).join("") + "</tbody></table>";
  }
  var TIPOS_OC = [["falta_injustificada", "Falta injustificada (conta zero)"], ["falta_justificada", "Falta justificada (fora da conta)"], ["presenca", "Presença sem produção (encarregado)"],
    ["apoio", "Horas de apoio (saem da conta)"], ["retrabalho", "Retrabalho (portão)"], ["sem_epi", "Sem EPI (portão)"], ["sem_frente", "Dia sem frente / chuva (obra toda)"]];
  function _ocorrencias(st) {
    var rot = {}; TIPOS_OC.forEach(function (t) { rot[t[0]] = t[1]; });
    var nomes = {}; st.colabs.forEach(function (x) { nomes[x.id] = x.nome; });
    var h = G._ppObra ? '<div class="flex" style="gap:12px;flex-wrap:wrap;align-items:flex-end">' +
      K.campo("Data", '<input id="pp-o-data" type="date" value="' + esc(hoje()) + '">') +
      K.campo("Tipo", '<select id="pp-o-tipo">' + TIPOS_OC.map(function (t) { return '<option value="' + t[0] + '">' + esc(t[1]) + "</option>"; }).join("") + "</select>") +
      K.campo("Colaborador", '<select id="pp-o-col"><option value="">— (obra toda)</option>' + st.colabs.map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.nome) + "</option>"; }).join("") + "</select>") +
      K.campo("Horas (apoio)", '<input id="pp-o-h" inputmode="decimal" style="width:80px">') +
      '<button class="btn" data-gacao="pp-o-salvar">Registrar</button></div>' : "";
    var l = st.ocs.slice().sort(function (a, b) { return a.data < b.data ? 1 : -1; });
    h += l.length ? '<table class="tbl" style="margin-top:8px"><thead><tr><th>DATA</th><th>TIPO</th><th>COLABORADOR</th><th class="num">HORAS</th><th>SITUAÇÃO</th><th></th></tr></thead><tbody>' +
      l.map(function (o) {
        var ok = PP.ocorrenciaAprovada(o), bt = [];
        if (!ok && ehGestor()) bt.push('<button class="btn sm" data-gacao="pp-o-aprovar" data-id="' + esc(o.id) + '">Aprovar</button>');
        bt.push('<button class="btn sm ghost" data-gacao="pp-o-excluir" data-id="' + esc(o.id) + '">Excluir</button>');
        return "<tr><td>" + esc(Util.fmtDia(o.data)) + "</td><td>" + esc(rot[o.tipo] || o.tipo) + "</td><td>" + esc(o.colaboradorId ? (nomes[o.colaboradorId] || o.colaboradorId) : "obra toda") + '</td><td class="num">' + (o.horas ? n(o.horas, 1) : "") + "</td><td>" +
          (ok ? M.pilula("aprovada por " + o.aprovadoPor, "ok") : M.pilula("aguardando gestão", "alerta")) + (o.autorNome ? '<div class="muted" style="font-size:var(--t-mini)">registrada por ' + esc(o.autorNome) + "</div>" : "") + "</td><td>" + bt.join(" ") + "</td></tr>";
      }).join("") + "</tbody></table>"
      : '<p class="muted" style="margin:8px 0 0">Nenhuma ocorrência no mês.</p>';
    return h;
  }

  /* ---------- METAS ---------- */
  function _metas(st) {
    var c = st.cfg, metas = PP.metas(c), p = PP.parametros(c.parametros), html = "";
    if (G._ppObra) {
      html += M.secao({ titulo: "De onde vem a produção desta obra",
        sub: "Uma fonte só por obra: se o diário e esta tela contassem juntos, o mesmo m² entraria duas vezes.",
        corpoHtml: '<select id="pp-fonte" data-gacao="pp-fonte"><option value="lancamento"' + (st.fonte === "lancamento" ? " selected" : "") + '>Lançamento de equipe nesta tela</option><option value="rdo"' + (st.fonte === "rdo" ? " selected" : "") + ">Diário de obra (RDO) aprovado</option></select>" });
    }
    html += M.secao({ titulo: "Metas por serviço", sub: "Meta = referência da fonte × " + Util.fmtNum(p.fatorMeta, 2) + ". O gatilho de " + n(p.gatilhoPct, 0) + " % da meta é a produtividade de referência.",
      acoesHtml: '<button class="btn sm" data-gacao="pp-metas-salvar">Salvar metas manuais</button>',
      corpoHtml: '<table class="tbl"><thead><tr><th>SERVIÇO</th><th>UN</th><th>EQUIPE</th><th class="num">REFERÊNCIA / DIA</th><th class="num">META / DIA</th><th class="num">META MANUAL</th><th class="num">QTD DA OBRA</th><th>FONTE</th></tr></thead><tbody>' +
        arr(c.servicos).map(function (s) {
          var m = metas[s.id] || {};
          return "<tr><td><b>" + esc(s.nome) + "</b>" + (s.observacao ? '<div class="muted" style="font-size:var(--t-mini)">' + esc(s.observacao) + "</div>" : "") + "</td><td>" + esc(s.unidade) + "</td><td>" + esc(s.equipePadrao) +
            '</td><td class="num">' + n(m.referenciaDia, 3) + '</td><td class="num"><b>' + (m.metaDia ? n(m.metaDia, 3) : M.pilula("sem meta", "alerta")) + "</b></td>" +
            '<td class="num"><input id="pp-mm-' + esc(s.id) + '" inputmode="decimal" style="width:80px" value="' + esc(s.metaDiaManual ? Util.fmtNum(s.metaDiaManual, 3) : "") + '"></td>' +
            '<td class="num">' + (s.qtdObra ? n(s.qtdObra, 3) : "—") + "</td><td>" + (s.tipoFonte === "adocao" ? M.pilula("adoção", "alerta") + " " : "") + esc(s.fonte || "") + "</td></tr>";
        }).join("") + "</tbody></table>" });
    if (st.fonte === "rdo") {
      var vinc = c.vinculos || {};
      var sem = st.semVinculo;
      html += M.secao({ titulo: "Serviços do diário sem meta", sub: "Vínculo explícito, um a um. O sistema nunca liga por semelhança de descrição.",
        corpoHtml: sem.length ? '<table class="tbl"><thead><tr><th>SERVIÇO NO DIÁRIO</th><th>UN</th><th class="num">QTD NO MÊS</th><th>META</th></tr></thead><tbody>' +
          sem.map(function (x, i) {
            return "<tr><td>" + esc(x.servico) + "</td><td>" + esc(x.unidade) + '</td><td class="num">' + n(x.qtd) + '</td><td><select data-gacao="pp-vinc"><option value="">— vincular a —</option>' +
              /* ⚠ o <select> com data-gacao entrega SÓ `{value}` ao despachante
                 (js/app.js, evento change) — a identidade do serviço do diário
                 viaja dentro do valor, junto com a meta escolhida */
              arr(c.servicos).map(function (s) { return '<option value="' + esc(x.identidade + "||" + s.id) + '">' + esc(s.nome) + "</option>"; }).join("") + "</select></td></tr>";
          }).join("") + "</tbody></table>" : '<p class="muted" style="margin:0">Todos os serviços do diário deste mês estão vinculados.' + (Object.keys(vinc).length ? " (" + Object.keys(vinc).length + " vínculo(s) gravado(s))" : "") + "</p>" });
    }
    return html;
  }

  /* ---------- EQUIPE E CUSTOS ---------- */
  function _equipe(st) {
    var c = st.cfg, p = PP.parametros(c.parametros), cs = PP.custosDaEquipe(c), H = PP.horasProdutivas(p), e = PP.encargosAtivos(p);
    var html = M.kpis([
      { rotulo: "Encargos sociais", valor: e ? Util.fmtNum(e.mensalista, 2) + " %" : "—", sub: e ? "mensalista · " + (p.regimeEncargos === "com_desoneracao" ? "com" : "sem") + " desoneração" : "sem fonte: pendente", tom: e ? "" : "alerta" },
      { rotulo: "Horas produtivas / mês", valor: H ? Util.fmtNum(H, 2) : "—", sub: "220 × (1+ES mens.) ÷ (1+ES hor.)" },
      { rotulo: "Regra do prêmio", valor: (PP.MODOS[p.modo] || p.modo), sub: "gatilho " + n(p.gatilhoPct, 0) + " % · teto " + n(p.tetoPct, 0) + " %" },
      { rotulo: "Equipe / obra", valor: n(p.pesoIndividualPct, 0) + " / " + n(p.pesoObraPct, 0), sub: "peso individual / obra (%)" }
    ]);
    html += M.secao({ titulo: "Custo por função", sub: (c.parametros && c.parametros.fonteEncargos) ? "Encargos: " + c.parametros.fonteEncargos : "",
      corpoHtml: '<table class="tbl"><thead><tr><th>FUNÇÃO</th><th class="num">CARTEIRA</th><th class="num">PRÊMIO MÁX.</th><th class="num">MÊS NA META</th><th class="num">R$/H NA META</th><th class="num">R$/H ESPERADO</th><th>SITUAÇÃO</th></tr></thead><tbody>' +
        cs.map(function (x, i) {
          var f = arr(c.funcoes)[i] || {};
          return "<tr><td><b>" + esc(x.nome || x.id) + '</b></td><td class="num">' + moeda(f.salarioCarteira) + '</td><td class="num">' + moeda(f.premioMax) + '</td><td class="num">' + (x.meta.ok ? moeda(x.meta.mes) : "—") +
            '</td><td class="num"><b>' + (x.meta.ok ? moeda(x.meta.hora) : "—") + '</b></td><td class="num">' + (x.esperado.ok ? moeda(x.esperado.hora) : "—") + "</td><td>" + (x.meta.ok ? (f.status && /ADOC/i.test(f.status) ? M.pilula("adoção, a confirmar", "alerta") : M.pilula("ok", "ok")) : esc(x.meta.pendencias.join("; "))) + "</td></tr>";
        }).join("") + "</tbody></table>" });
    var fOpts = arr(c.funcoes), qOpts = arr(c.equipes);
    html += M.secao({ titulo: "Colaboradores no módulo", sub: "Cada pessoa do cadastro recebe uma função (define o prêmio máximo) e uma equipe (define o ranking).",
      acoesHtml: '<button class="btn sm primary" data-gacao="pp-colab-salvar">Salvar vínculos</button>',
      corpoHtml: st.colabs.length ? '<table class="tbl"><thead><tr><th>COLABORADOR</th><th>FUNÇÃO</th><th>EQUIPE</th></tr></thead><tbody>' +
        st.colabs.map(function (x) {
          return "<tr><td>" + esc(x.nome) + (x.semCadastro ? " " + M.pilula("fora do cadastro", "alerta") : "") + '</td><td><select id="pp-cf-' + esc(x.id) + '"><option value="">—</option>' + fOpts.map(function (f) { return '<option value="' + esc(f.id) + '"' + (f.id === x.funcaoId ? " selected" : "") + ">" + esc(f.nome || f.id) + "</option>"; }).join("") + "</select></td>" +
            '<td><select id="pp-ce-' + esc(x.id) + '"><option value="">—</option>' + qOpts.map(function (q) { return '<option value="' + esc(q.id) + '"' + (q.id === x.equipeId ? " selected" : "") + ">" + esc(q.nome || q.id) + "</option>"; }).join("") + "</select></td></tr>";
        }).join("") + "</tbody></table>" : '<p class="muted" style="margin:0">Nenhum colaborador cadastrado. Cadastre a equipe em Colaboradores.</p>' });
    return html;
  }

  /* ---------- FECHAMENTO ---------- */
  function _historico(f) {
    var h = arr(f && f.historico);
    if (!h.length) return "";
    var rot = { homologar: "Homologado", reabrir: "Reaberto" };
    return M.secao({ titulo: "Histórico do fechamento", sub: "Nada é apagado: cada homologação e cada reabertura fica registrada.",
      corpoHtml: '<table class="tbl" id="pp-historico"><thead><tr><th>AÇÃO</th><th>POR</th><th>QUANDO</th><th class="num">PESSOAS</th><th class="num">TOTAL</th></tr></thead><tbody>' +
        h.slice().reverse().map(function (x) { return "<tr><td>" + esc(rot[x.acao] || x.acao) + "</td><td>" + esc(x.por || "—") + "</td><td>" + esc(Util.fmtData(x.em) || "—") + '</td><td class="num">' + esc(x.pessoas == null ? "" : x.pessoas) + '</td><td class="num">' + moeda((x.totalCent || 0) / 100) + "</td></tr>"; }).join("") + "</tbody></table>" });
  }
  function _fechamento(st) {
    var html = filtroMes(st);
    if (!ehGestor()) return html + M.aviso({ tom: "alerta", titulo: "O fechamento é da gestão.", texto: "O encarregado lança e aprova o dia; o prêmio do mês só a gestão vê." });
    var r = st.res, idF = PP.idFechamento(G._ppObra, G._ppComp), f = Store.obter(eid(), ENT_FECH, idF);
    if (!G._ppObra) return html + M.secao({ corpoHtml: M.vazio({ icone: "obra", titulo: "Escolha a obra no alto da tela", texto: "O fechamento é por obra e por mês." }) });
    if (f && f.estado === "homologado") {
      html += M.aviso({ tom: "ok", titulo: "Mês homologado.", texto: "Por " + (f.homologadoPor || "—") + " em " + (Util.fmtData(f.homologadoEm) || "—") + ". Os valores abaixo estão congelados: lançamento novo neste mês não muda este fechamento, e a obra fica travada neste mês até a gestão reabrir." });
      html += M.secao({ titulo: "Prêmio do mês (congelado)", acoesHtml: '<button class="btn sm" data-gacao="pp-csv" data-congelado="1">Exportar para a folha (CSV)</button> <button class="btn sm ghost" data-gacao="pp-reabrir">Reabrir</button>',
        corpoHtml: _tabelaFolha(f.linhas, f.totalCent) });
      return html + _historico(f);
    }
    if (f && f.estado === "reaberto") html += M.aviso({ tom: "info", titulo: "Mês reaberto.", texto: "Reaberto por " + (f.reabertoPor || "—") + " em " + (Util.fmtData(f.reabertoEm) || "—") + ". Ajuste o que for preciso e homologue de novo; o histórico guarda as duas homologações." });
    html += avisoTopo(st);
    html += M.kpis([{ rotulo: "Pessoas", valor: String(r.pessoas.length) }, { rotulo: "Prêmio do mês", valor: moeda(r.totalPremio), tom: "info", sub: "soma dos arredondados" },
      { rotulo: "Atingimento da obra", valor: pct(r.atingimentoObraPct) }, { rotulo: "Pendências", valor: String(r.pendencias.length), tom: r.pendencias.length ? "alerta" : "" }]);
    html += M.secao({ titulo: "Prêmio do mês (não homologado)", sub: "Exportar gera o arquivo para a folha. Nada é lançado no Financeiro.",
      acoesHtml: '<button class="btn sm" data-gacao="pp-csv">Exportar (CSV)</button> <button class="btn sm primary" data-gacao="pp-homologar">Homologar mês</button>',
      corpoHtml: _tabelaFolha(PP.linhasFolha(r), r.totalPremioCent) });
    return html + _historico(f);
  }
  function _tabelaFolha(linhas, totCent) {
    linhas = arr(linhas);
    if (!linhas.length) return M.vazio({ icone: "grafico", titulo: "Nada a fechar neste mês", texto: "Só entra produção aprovada pela gestão (ou diário aprovado, se a obra usa o RDO)." });
    return '<table class="tbl"><thead><tr><th>COLABORADOR</th><th>FUNÇÃO</th><th class="num">CARTEIRA</th><th class="num">DIAS</th><th class="num">ATINGIMENTO</th><th class="num">FRAÇÃO</th><th class="num">PRÊMIO</th><th>PENDÊNCIA</th></tr></thead><tbody>' +
      linhas.map(function (x) {
        return "<tr><td><b>" + esc(x.nome) + "</b></td><td>" + esc(x.funcao) + '</td><td class="num">' + moeda(x.salarioCarteira) + '</td><td class="num">' + x.diasQueContam + '</td><td class="num">' + pct(x.atingimentoPct) +
          '</td><td class="num">' + pct(x.fracaoPct) + '</td><td class="num"><b>' + (x.premio == null ? M.pilula("pendente", "alerta") : moeda(x.premio)) + "</b></td><td>" + esc(x.pendencia || "") + "</td></tr>";
      }).join("") + '<tr><td colspan="6"><b>Total</b></td><td class="num"><b>' + moeda((totCent || 0) / 100) + "</b></td><td></td></tr></tbody></table>";
  }

  /* ================================================================ AÇÕES */
  function salvarCfg(c) { c.id = ID_CFG; return Store.salvar(eid(), ENT_CFG, c); }
  function lerNum(id) { var t = K.v(id); return t === "" ? null : Util.num(t); }

  G.registrarAcoes(MODULO, {
    "pp-aba": function (ds) { G._ppAba = ds.aba || "painel"; App.render(); },
    "pp-obra": function (ds) { G._ppObra = ds && ds.value != null ? String(ds.value) : ""; G._ppEdit = null; App.render(); },
    "pp-l-eq": function (ds) { G._ppEq = ds && ds.value != null ? String(ds.value) : ""; App.render(); },
    "pp-importar": function () {
      if (!exigir(ehGestor(), "Só a gestão importa a configuração do prêmio.")) return;
      var el = document.getElementById("pp-arq"); if (el) el.click();
    },
    "pp-exportar-cfg": function () {
      if (!exigir(ehGestor(), "Só a gestão exporta a configuração (ela traz salário e prêmio de cada função).")) return;
      var c = cfg(); if (!c) return;
      Util.baixar("produtividade-config.json", JSON.stringify(c, null, 2), "application/json;charset=utf-8");
    },
    "pp-fonte": function (ds) {
      if (!exigir(ehGestor(), "Só a gestão troca a fonte da produção.")) return;
      var c = cfg(); if (!c || !G._ppObra) return;
      if (!exigirAberto(G._ppObra, G._ppComp)) return;
      var v = ds && ds.value === "rdo" ? "rdo" : "lancamento";
      c.obras = arr(c.obras).filter(function (o) { return o && o.id !== G._ppObra; });
      c.obras.push({ id: G._ppObra, fonte: v });
      salvarCfg(c); UI.toast(v === "rdo" ? "A produção desta obra passa a vir do Diário aprovado." : "A produção desta obra passa a vir do lançamento de equipe.", "ok"); App.render();
    },
    "pp-vinc": function (ds) {
      if (!exigir(ehAprovador(), "Só a gestão ou o aprovador vincula serviço a meta.")) return;
      /* o id da meta nunca tem "||"; a identidade do diário pode ter qualquer coisa — corta pelo ÚLTIMO */
      var c = cfg(), vv = String((ds && ds.value) || ""), corte = vv.lastIndexOf("||"), partes = corte > 0 ? [vv.slice(0, corte), vv.slice(corte + 2)] : [];
      if (!c || partes.length !== 2 || !partes[0] || !partes[1]) return;
      c.vinculos = c.vinculos || {}; c.vinculos[partes[0]] = partes[1];
      salvarCfg(c); UI.toast("Serviço vinculado à meta.", "ok"); App.render();
    },
    "pp-metas-salvar": function () {
      if (!exigir(ehGestor(), "Só a gestão muda meta — meta é dinheiro de prêmio.")) return;
      var c = cfg(); if (!c) return;
      arr(c.servicos).forEach(function (s) { var v = lerNum("pp-mm-" + s.id); if (v != null && v > 0) s.metaDiaManual = v; else delete s.metaDiaManual; });
      salvarCfg(c); UI.toast("Metas salvas.", "ok"); App.render();
    },
    "pp-colab-salvar": function () {
      if (!exigir(ehGestor(), "Só a gestão vincula função e equipe (a função define o prêmio máximo).")) return;
      var c = cfg(); if (!c) return;
      c.colaboradores = colaboradores(c).map(function (x) { return { id: x.id, nome: x.nome, funcaoId: K.v("pp-cf-" + x.id), equipeId: K.v("pp-ce-" + x.id) }; })
        .filter(function (x) { return x.funcaoId || x.equipeId; });
      salvarCfg(c); UI.toast("Vínculos salvos.", "ok"); App.render();
    },
    "pp-l-salvar": function (ds) {
      var c = cfg(); if (!c || !G._ppObra) return;
      var data = K.v("pp-l-data"), eq = K.v("pp-l-eq");
      if (!exigir(/^\d{4}-\d{2}-\d{2}$/.test(data), "Informe a data do lançamento.")) return;
      if (!exigir(!!eq, "Escolha a equipe.")) return;
      if (!exigirAberto(G._ppObra, data)) return;
      var membros = [], semEpi = [], horasRuins = [];
      colaboradores(c).filter(function (x) { return x.equipeId === eq; }).forEach(function (x) {
        var ck = document.getElementById("pp-m-" + x.id); if (!ck || !ck.checked) return;
        var h = lerNum("pp-h-" + x.id), ap = lerNum("pp-a-" + x.id), ft = K.v("pp-f-" + x.id);
        /* ⚠ horas fora de 0–24 são RECUSADAS com aviso. Antes viravam o padrão
           (8,8 h) calado: quem digitou 80 em vez de 8 levava o dia de 8,8 h sem saber. */
        if (!PP.horasValidas(h)) horasRuins.push(x.nome + " (" + Util.fmtNum(h, 1) + " h)");
        membros.push({ colaboradorId: x.id, nome: x.nome, horas: h, apoio: ap || 0, falta: ft || null });
        var epi = document.getElementById("pp-e-" + x.id); if (epi && epi.checked) semEpi.push(x.id);
      });
      if (!exigir(!horasRuins.length, "Horas fora de 0 a 24: " + horasRuins.join(", ") + ". Corrija antes de salvar.")) return;
      if (!exigir(membros.length > 0, "Marque quem estava na equipe.")) return;
      var itens = [];
      for (var i = 0; i < 4; i++) { var s = K.v("pp-s-" + i), q = lerNum("pp-q-" + i); if (s && q != null && q > 0) itens.push({ servicoId: s, qtd: q }); }
      var todosFaltaram = membros.every(function (m) { return !!m.falta; });
      if (!exigir(itens.length > 0 || todosFaltaram, "Informe o que a equipe produziu (serviço e quantidade).")) return;
      var ant = G._ppEdit ? Store.obter(eid(), ENT_LANC, G._ppEdit) : null;
      /* ⚠ lançamento já aprovado não se corrige por aqui: o valor dele pode
         estar num fechamento. Reabrir é ação da gestão, com estado próprio. */
      if (ant && !exigir(ant.estado === "rascunho" || ant.estado === "devolvido", "Este lançamento já saiu do rascunho; peça para devolverem antes de corrigir.")) return;
      /* ⚠ UM LANÇAMENTO ATIVO POR OBRA + EQUIPE + DATA: dois somariam a mesma
         produção duas vezes. Corrija ou exclua o que já existe. */
      var dup = PP.lancamentoDuplicado(K.lista(ENT_LANC), { id: ant && ant.id, obraId: G._ppObra, equipeId: eq, data: data });
      if (!exigir(!dup, "Já existe um lançamento desta equipe nesta obra em " + Util.fmtDia(data) + " (" + ((PP.ESTADOS[dup && dup.estado] || {}).rotulo || "rascunho").toLowerCase() + "). Corrija esse ou, se for rascunho, exclua antes de lançar outro.")) return;
      var u = (typeof Auth !== "undefined" && Auth.usuario && Auth.usuario()) || {};
      var l = ant || { obraId: G._ppObra, autorId: u.usuarioId || u.email || "", autorNome: (typeof Auth !== "undefined" && Auth.nome) ? Auth.nome() : "" };
      l.data = data; l.equipeId = eq; l.membros = membros; l.semEpi = semEpi; l.itens = itens; l.retrabalho = !!(document.getElementById("pp-l-ret") || {}).checked;
      l.estado = ds && ds.enviar ? "enviado" : (l.estado || "rascunho");
      if (l.estado === "devolvido" && ds && ds.enviar) l.estado = "enviado";
      if (!Store.salvar(eid(), ENT_LANC, l)) { UI.toast("Não consegui gravar o lançamento.", "erro"); return; }
      G._ppEdit = null; G._ppEq = eq;
      UI.toast(l.estado === "enviado" ? "Lançamento enviado ao encarregado." : "Rascunho salvo.", "ok"); App.render();
    },
    "pp-l-editar": function (ds) { G._ppEdit = ds.id; App.render(); },
    "pp-l-cancelar": function () { G._ppEdit = null; App.render(); },
    "pp-l-excluir": function (ds) {
      var l = Store.obter(eid(), ENT_LANC, ds.id); if (!l) return;
      if (!exigirAberto(l.obraId, l.data)) return;
      if (!exigir(l.estado === "rascunho" || !l.estado, "Só rascunho pode ser excluído.")) return;
      Store.excluir(eid(), ENT_LANC, ds.id); UI.toast("Rascunho excluído.", "ok"); App.render();
    },
    "pp-l-mover": function (ds) {
      var l = Store.obter(eid(), ENT_LANC, ds.id); if (!l) return;
      if (!exigirAberto(l.obraId, l.data)) return;
      var de = l.estado || "rascunho", acao = ds.acao;
      if (acao === "reabrir" && !exigir(ehGestor(), "Só a gestão reabre um lançamento aprovado.")) return;
      /* ⚠ GUARDA EM FUNÇÃO (o dispatcher é global): o 1º nível é do
         encarregado/aprovador; o 2º, que faz o lançamento contar, só da gestão */
      if (acao === "aprovar" || acao === "devolver") {
        if (de === "aprovado_encarregado" && !exigir(ehGestor(), "A segunda aprovação é da gestão.")) return;
        if (!exigir(ehAprovador(), "Só o encarregado nomeado aprovador ou a gestão aprova lançamento.")) return;
        var u = (typeof Auth !== "undefined" && Auth.usuario && Auth.usuario()) || {}, eu = u.usuarioId || u.email || "";
        if (de === "enviado" && l.autorId && eu && l.autorId === eu && !ehGestor() && !exigir(false, "Quem lançou não aprova o próprio lançamento.")) return;
      }
      var t = PP.transicao(de, acao); if (!exigir(t.ok, t.erro || "Ação inválida.")) return;
      l.estado = t.estado;
      l.historico = arr(l.historico).concat([{ acao: acao, de: de, para: t.estado, em: Util.agoraISO(), por: quem() }]);
      if (!Store.salvar(eid(), ENT_LANC, l)) { UI.toast("Não consegui gravar a mudança do lançamento.", "erro"); return; }
      UI.toast("Lançamento: " + PP.ESTADOS[t.estado].rotulo.toLowerCase() + ".", "ok"); App.render();
    },
    "pp-o-salvar": function () {
      if (!G._ppObra) return;
      var data = K.v("pp-o-data"), tipo = K.v("pp-o-tipo"), col = K.v("pp-o-col"), h = lerNum("pp-o-h");
      if (!exigir(/^\d{4}-\d{2}-\d{2}$/.test(data), "Informe a data.")) return;
      if (!exigir(tipo === "sem_frente" || !!col, "Escolha o colaborador.")) return;
      if (!exigir(tipo !== "apoio" || (h != null && h > 0), "Informe as horas de apoio.")) return;
      if (tipo === "sem_frente" && !exigir(ehAprovador(), "Dia sem frente é registrado pelo encarregado ou pela gestão.")) return;
      if (!exigirAberto(G._ppObra, data)) return;
      /* ⚠ OCORRÊNCIA SÓ VALE COM APROVADOR DA GESTÃO, EM TODOS OS TIPOS. Grava
         quem registrou e quando; a gestão registrando já aprova (aprovador é
         ela mesma, e fica escrito). O resto fica "aguardando" e fora da conta. */
      var u = (typeof Auth !== "undefined" && Auth.usuario && Auth.usuario()) || {}, agora = Util.agoraISO(), eu = quem();
      var oc = { obraId: G._ppObra, data: data, tipo: tipo, colaboradorId: tipo === "sem_frente" ? "" : col, horas: h || 0,
        autorId: u.usuarioId || u.email || "", autorNome: eu, autorEm: agora };
      if (ehGestor()) { oc.aprovadoPor = eu || "gestão"; oc.aprovadoEm = agora; }
      if (!Store.salvar(eid(), ENT_OC, oc)) { UI.toast("Não consegui gravar a ocorrência.", "erro"); return; }
      UI.toast(ehGestor() ? "Ocorrência registrada e aprovada." : "Ocorrência registrada. Só entra na conta depois que a gestão aprovar.", "ok"); App.render();
    },
    "pp-o-aprovar": function (ds) {
      if (!exigir(ehGestor(), "Só a gestão aprova ocorrência.")) return;
      var o = Store.obter(eid(), ENT_OC, ds.id); if (!o || PP.ocorrenciaAprovada(o)) return;
      if (!exigirAberto(o.obraId, o.data)) return;
      o.aprovadoPor = quem() || "gestão"; o.aprovadoEm = Util.agoraISO();
      if (!Store.salvar(eid(), ENT_OC, o)) { UI.toast("Não consegui gravar a aprovação.", "erro"); return; }
      UI.toast("Ocorrência aprovada.", "ok"); App.render();
    },
    "pp-o-excluir": function (ds) {
      if (!exigir(ehAprovador(), "Só o encarregado aprovador ou a gestão exclui ocorrência.")) return;
      var o = Store.obter(eid(), ENT_OC, ds.id); if (!o) return;
      if (!exigirAberto(o.obraId, o.data)) return;
      if (PP.ocorrenciaAprovada(o) && !exigir(ehGestor(), "Ocorrência já aprovada: só a gestão exclui.")) return;
      Store.excluir(eid(), ENT_OC, ds.id); App.render();
    },
    "pp-csv": function (ds) {
      if (!exigir(ehGestor(), "Só a gestão exporta o arquivo da folha.")) return;
      var st = estado(), obra = Store.obter(eid(), "obras", G._ppObra) || {}, csv;
      if (ds && ds.congelado) {
        /* congelado: as linhas vêm do fechamento, não da conta de hoje */
        var f = Store.obter(eid(), ENT_FECH, PP.idFechamento(G._ppObra, G._ppComp)); if (!f) return;
        csv = PP.csvLinhas(f.linhas, f.totalCent, { competencia: G._ppComp, obra: obra.nome || G._ppObra });
      } else {
        csv = PP.csvFolha(st.res, { competencia: G._ppComp + " (não homologado)", obra: obra.nome || G._ppObra });
      }
      Util.baixar("premio-" + G._ppComp + ".csv", csv, "text/csv;charset=utf-8");
    },
    "pp-homologar": function () {
      if (!exigir(ehGestor(), "Só a gestão homologa o mês.")) return;
      var idF = PP.idFechamento(G._ppObra, G._ppComp);
      var jaFeito = Store.obter(eid(), ENT_FECH, idF);
      if (!exigir(!(jaFeito && jaFeito.estado === "homologado"), "Este mês já está homologado. Atualize a tela; para alterar, reabra o mês.")) return;
      /* o fechamento junta a conta de hoje com o que a mesma pessoa já tem
         HOMOLOGADO em outras obras no mesmo mês: soma ≤ prêmio máximo */
      function preparar() {
        var st = estado(), r = st.res;
        var outros = K.lista(ENT_FECH).filter(function (x) { return x.competencia === G._ppComp && x.obraId !== G._ppObra; });
        return { st: st, r: r, lim: PP.limitarAoTeto(PP.linhasFolha(r), outros) };
      }
      var pr = preparar(), r = pr.r, st = pr.st;
      if (!exigir(r.pessoas.length > 0, "Não há produção aprovada neste mês para homologar.")) return;
      var travas = r.pessoas.filter(function (P) { return P.premio == null; });
      if (!exigir(!travas.length, travas.length + " pessoa(s) com prêmio pendente (sem função ou sem prêmio máximo). Resolva antes de homologar.")) return;
      UI.modal("Homologar o prêmio de " + esc(G._ppComp) + "?",
        "<p>Isto congela os valores do mês: <b>" + r.pessoas.length + " pessoa(s)</b>, total de <b>" + moeda(pr.lim.totalCent / 100) + "</b>. Depois disso a obra fica travada neste mês até a gestão reabrir.</p>" +
        (pr.lim.cortes.length ? "<p><b>" + pr.lim.cortes.length + " pessoa(s) passariam do prêmio máximo do mês somando as outras obras já homologadas</b> e foram cortadas no que sobrou (o motivo fica na linha): " + pr.lim.cortes.map(function (x) { return esc(x.nome); }).join(", ") + ".</p>" : "") +
        (st.naoAprovados ? "<p><b>" + st.naoAprovados + " lançamento(s) do mês ainda não foram aprovados</b> e ficam de fora deste fechamento.</p>" : "") +
        (st.ocsPendentes ? "<p><b>" + st.ocsPendentes + " ocorrência(s) aguardando a gestão</b> ficam de fora deste fechamento.</p>" : "") +
        "<p>Nada é lançado no Financeiro: a saída é o arquivo para a folha.</p>",
        [{ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
         { texto: "Homologar", classe: "primary", onClick: function () {
           /* relê tudo na hora do clique: outro aparelho pode ter homologado,
              e a conta pode ter mudado com o modal aberto */
           var p2 = preparar(), atual = Store.obter(eid(), ENT_FECH, idF);
           var h = PP.homologarFechamento(atual, { obraId: G._ppObra, competencia: G._ppComp, linhas: p2.lim.linhas, totalCent: p2.lim.totalCent,
             parametros: { modo: p2.r.parametros.modo, gatilhoPct: p2.r.parametros.gatilhoPct, tetoPct: p2.r.parametros.tetoPct, pesoIndividualPct: p2.r.parametros.pesoIndividualPct },
             por: quem(), em: Util.agoraISO() });
           UI.fecharModal();
           if (!h.ok) { UI.toast(h.erro, "erro"); App.render(); return; }
           /* "homologado" só aparece DEPOIS que a gravação confirmar */
           if (!Store.salvar(eid(), ENT_FECH, h.f)) { UI.toast("Não consegui gravar o fechamento: nada foi homologado.", "erro"); App.render(); return; }
           UI.toast("Mês homologado.", "ok"); App.render();
         } }]);
    },
    "pp-reabrir": function () {
      if (!exigir(ehGestor(), "Só a gestão reabre o mês.")) return;
      var idF = PP.idFechamento(G._ppObra, G._ppComp);
      var f = Store.obter(eid(), ENT_FECH, idF); if (!f) return;
      if (!exigir(f.estado === "homologado", "Este mês não está homologado.")) return;
      UI.modal("Reabrir o fechamento de " + esc(G._ppComp) + "?",
        "<p>O fechamento homologado soma <b>" + moeda(f.totalCent / 100) + "</b> (homologado em " + esc(Util.fmtData(f.homologadoEm) || "—") + "). Se esse valor já foi para a folha, reabrir não desfaz o pagamento. Nada é apagado: o fechamento e o histórico ficam guardados.</p>",
        [{ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
         { texto: "Reabrir", classe: "primary", onClick: function () {
           var rr = PP.reabrirFechamento(Store.obter(eid(), ENT_FECH, idF), quem(), Util.agoraISO());
           UI.fecharModal();
           if (!rr.ok) { UI.toast(rr.erro, "erro"); App.render(); return; }
           if (!Store.salvar(eid(), ENT_FECH, rr.f)) { UI.toast("Não consegui gravar: o mês continua homologado.", "erro"); App.render(); return; }
           UI.toast("Mês reaberto.", "ok"); App.render();
         } }]);
    }
  });

  /* campos que não podem ter data-gacao (mês e arquivo): ligam aqui, depois
     do DOM existir — ver a nota do `registrarWire` no gestao.js */
  G.registrarWire(MODULO, function () {
    var mes = document.getElementById("pp-comp");
    if (mes) mes.onchange = function () { if (!this.value) return; G._ppComp = this.value; App.render(); };
    var arq = document.getElementById("pp-arq");
    if (arq) arq.onchange = function () {
      var f = this.files && this.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var dado = null;
        try { dado = JSON.parse(String(rd.result || "")); } catch (e) { UI.toast("O arquivo não é um JSON válido.", "erro"); return; }
        /* o arquivo vem de fora: só entram os campos do formato */
        dado = PP.filtrarConfig(dado);
        var v = PP.validarConfig(dado);
        if (!v.ok) { UI.toast("Configuração recusada: " + v.erros.join(" "), "erro"); return; }
        var atual = cfg();
        /* reimportar não apaga o que a tela já decidiu: vínculos de
           colaborador, fonte por obra e vínculos do diário ficam */
        if (atual) {
          if (!arr(dado.colaboradores).length && arr(atual.colaboradores).length) dado.colaboradores = atual.colaboradores;
          if (atual.vinculos && !dado.vinculos) dado.vinculos = atual.vinculos;
          var porId = {}; arr(dado.obras).forEach(function (o) { porId[o.id] = o; }); arr(atual.obras).forEach(function (o) { porId[o.id] = o; });
          dado.obras = Object.keys(porId).map(function (k) { return porId[k]; });
        }
        dado.importadoEm = Util.agoraISO();
        salvarCfg(dado);
        UI.toast("Configuração importada." + (v.avisos.length ? " " + v.avisos.length + " aviso(s): " + v.avisos.slice(0, 2).join(" ") : ""), v.avisos.length ? "aviso" : "ok");
        App.render();
      };
      rd.readAsText(f);
    };
  });

})(typeof window !== "undefined" ? window : this);
