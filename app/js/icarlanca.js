/* =====================================================================
 * icarlanca.js — LANÇAR O PLANO DE IÇAMENTO NO SISTEMA (ESPEC-ICAMENTO-CENARIO.md §II.13).
 * Motor PURO (ES5, testável em Node): recebe o plano já avaliado e o que JÁ EXISTE na obra (tarefas 4D e requisições) e
 * devolve as LINHAS da conferência — o que vai ser criado, atualizado, mantido ou está bloqueado, com o registro pronto.
 * A tela (gestao.js) mostra a conferência, grava só o que ficou marcado, numera a requisição pelo app e carimba a aprovação.
 *
 * REGRAS DE DINHEIRO (skill `dinheiro`):
 *  - nada se liga por semelhança: o que foi gerado leva `origemIcamento.chave` e relançar procura PELA CHAVE — nunca por nome,
 *    descrição, valor ou data;
 *  - requisição NÃO lança dinheiro: a despesa nasce depois, no caminho que o app já tem (requisição → pedido de compra (PC) →
 *    financeiro). Este motor NUNCA monta lançamento financeiro — contaria a locação duas vezes;
 *  - documento que já andou (requisição aprovada/em cotação/comprada, tarefa executada) NÃO é alterado: a linha sai "bloqueada"
 *    ou "mantida" dizendo por quê, e a pessoa decide à mão;
 *  - carimbo repetido (dois registros com a mesma chave) = bloqueado, nunca "escolho um".
 * ⚠ A peça içada FICA na obra: a tarefa 4D é "construir" (aparece e fica). "Temporário" a apagaria do 4D no fim do içamento.
 * ⚠ As peças no 4D vão pela chave estável `modeloId::globalId` (js/bimid.js) — o uid de sessão (`mid:expressID`) muda a cada abertura.
 * ===================================================================== */
(function (global) {
  "use strict";

  var PREMISSAS = {
    mobilizacao_h: 2,      // premissa: montar/desmontar e posicionar o equipamento, somada às horas dos içamentos (editável)
    arredonda_h: 0.5       // horas de locação arredondadas PARA CIMA de meia em meia hora
  };
  function prem(p) { var o = {}, k; for (k in PREMISSAS) o[k] = PREMISSAS[k]; if (p) for (k in p) if (p[k] != null && p[k] !== "" && isFinite(+p[k])) o[k] = +p[k]; return o; }
  function txt(v) { return v == null ? "" : String(v); }
  function br(v, c) { var x = +v; if (!isFinite(x)) return "—"; var f = Math.pow(10, c == null ? 2 : c), r = Math.round(x * f) / f; return String(r).replace(".", ","); }
  function dataBr(d) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(txt(d)); return m ? m[3] + "/" + m[2] + "/" + m[1] : txt(d); }
  function chaveTarefa(planoId, icId) { return "icamento:" + planoId + ":" + icId; }
  function chaveReq(planoId) { return "icamento:" + planoId + ":requisicao"; }
  function chaveLocacao(planoId) { return "icamento:" + planoId + ":locacao"; }
  function chaveAcessorio(planoId, a) { return "icamento:" + planoId + ":ac:" + a.tipo + ":" + Math.round(+a.cmt_kg || 0); }
  function comCarimbo(lista, chave) { return (lista || []).filter(function (x) { return x && x.origemIcamento && x.origemIcamento.chave === chave; }); }
  function mesmo(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  /* a véspera de um dia AAAA-MM-DD (calendário, sem fuso: meio-dia em UTC não vira o dia anterior em lugar nenhum) */
  function diaAntes(d) { var t = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), 12) - 86400000, x = new Date(t); return x.getUTCFullYear() + "-" + ("0" + (x.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + x.getUTCDate()).slice(-2); }
  var NOME_AC = { cinta: "Cinta de poliéster", cabo: "Laço de cabo de aço", corrente: "Corrente grau 8", manilha: "Manilha" };

  /* ctx = { plano: {id, nome, obraId}, hoje, agora, solicitante, gestao, uid: fn(prefixo),
             equipamento: { nome, tipo: "guindaste"|"munck" }, preco_h (null = sem preço),
             icamentos: [{ id, nome, data (AAAA-MM-DD), chaves: ["modeloId::globalId"], tempo_min, acessorios: [{tipo, cmt_kg, qtd}] }],
             documentos: [{ id, rotulo, ref, obrig, status }] (IcarPlano.DOCUMENTOS + p.docs), frota: { id, nome, placa, posse } | null,
             existentes: { tarefas: [bim_tarefas da obra], requisicoes: [requisições da obra], tarefasObra: [tarefas da obra] }, marcas: { linhaId: bool }, premissas }
     → { linhas: [{ id, grupo: "4d"|"requisicao"|"acessorio"|"tarefa", acao: "criar"|"atualizar"|"manter"|"bloqueado", marcada, rotulo, detalhe,
                    motivo, registro, existenteId }], horas, avisos } */
  function montar(ctx) {
    ctx = ctx || {};
    var pp = prem(ctx.premissas), pl = ctx.plano || {}, ex = ctx.existentes || {}, marcas = ctx.marcas || {}, linhas = [], avisos = [];
    var uid = typeof ctx.uid === "function" ? ctx.uid : function (p) { return p + Math.random().toString(36).slice(2, 10); };
    if (!pl.id || !pl.obraId) return { linhas: [], horas: 0, avisos: ["O plano precisa estar numa obra para lançar."] };
    function marcada(id, padrao) { return marcas[id] != null ? !!marcas[id] : padrao; }

    /* ---- 4D: uma tarefa por içamento ---- */
    (ctx.icamentos || []).forEach(function (ic, i) {
      var chave = chaveTarefa(pl.id, ic.id), id = "4d:" + ic.id, achadas = comCarimbo(ex.tarefas, chave);
      var nome = "Içamento " + (i + 1) + " — " + (txt(ic.nome) || "peças"), data = txt(ic.data);
      var L = { id: id, grupo: "4d", rotulo: "Tarefa 4D · " + nome, detalhe: (data ? dataBr(data) : "sem data") + " · " + (ic.chaves || []).length + " peça(s)", existenteId: null };
      var novo = { obraId: pl.obraId, nome: nome, wbs: "", tipoTarefa: "construir", alvo: { tipo: "elementos", ref: "", chaves: (ic.chaves || []).slice() },
        previstoInicio: data, previstoFim: data, realInicio: "", realFim: "", percentual: 0, dependeDe: [], etapaOrc: "", itemOrcId: "",
        origem: "icamento", origemIcamento: { planoId: pl.id, icamentoId: ic.id, chave: chave } };
      if (achadas.length > 1) { L.acao = "bloqueado"; L.motivo = achadas.length + " tarefas no 4D com o mesmo carimbo deste içamento — apague as repetidas no 4D antes."; }
      else if (!(ic.chaves || []).length) { L.acao = "bloqueado"; L.motivo = "as peças deste içamento não têm a chave estável do IFC (GlobalId): o 4D não as encontraria."; }
      else if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { L.acao = "bloqueado"; L.motivo = "informe o dia do içamento."; }
      else if (achadas.length === 1) {
        var t = achadas[0]; L.existenteId = t.id;
        if (txt(t.realFim) || +t.percentual >= 100) { L.acao = "manter"; L.motivo = "a tarefa já foi executada no 4D — não altero."; }
        else if (t.nome === novo.nome && t.previstoInicio === data && t.previstoFim === data && mesmo((t.alvo || {}).chaves || [], novo.alvo.chaves)) { L.acao = "manter"; L.motivo = "já está igual no 4D."; }
        else {
          L.acao = "atualizar"; L.motivo = "o plano mudou (nome, dia ou peças) — o resto da tarefa (avanço, dependências) fica.";
          var r = {}; for (var k in t) r[k] = t[k];
          r.nome = novo.nome; r.previstoInicio = data; r.previstoFim = data; r.alvo = novo.alvo; r.origem = "icamento"; r.origemIcamento = novo.origemIcamento;
          L.registro = r;
        }
      } else { L.acao = "criar"; L.registro = novo; }
      L.marcada = (L.acao === "criar" || L.acao === "atualizar") && marcada(id, true);
      linhas.push(L);
    });

    /* ---- acessórios agregados: a MESMA cinta serve a vários içamentos — a quantidade é o maior número de pernas pedido ---- */
    var acs = {};
    (ctx.icamentos || []).forEach(function (ic) {
      (ic.acessorios || []).forEach(function (a) {
        if (!a || !NOME_AC[a.tipo] || !(+a.cmt_kg > 0) || !(+a.qtd > 0)) return;
        var k = chaveAcessorio(pl.id, a); if (!acs[k] || +a.qtd > acs[k].qtd) acs[k] = { tipo: a.tipo, cmt_kg: +a.cmt_kg, qtd: +a.qtd, chave: k };
      });
    });
    var listaAc = Object.keys(acs).sort().map(function (k) { return acs[k]; });
    /* a requisição que já existe (pelo carimbo): o acessório que ELA tem nasce marcado — senão relançar "esquecia" a cinta
       marcada da vez anterior e a atualização a tirava da requisição (medido na e2e: [2] relançar → "atualizar" sem a cinta) */
    var reqAntes = comCarimbo(ex.requisicoes, chaveReq(pl.id)), jaTem = {};
    if (reqAntes.length === 1) (reqAntes[0].itens || []).forEach(function (it) { if (it && it.origemIcamento && it.origemIcamento.chave) jaTem[it.origemIcamento.chave] = true; });
    listaAc.forEach(function (a) {
      var id = "ac:" + a.tipo + ":" + Math.round(a.cmt_kg);
      /* ⚠ desmarcado por padrão: a obra costuma ter cinta e manilha — a pessoa marca o que precisa comprar/alugar (ESPEC §II.13.2) */
      linhas.push({ id: id, grupo: "acessorio", acao: "criar", marcada: marcada(id, !!jaTem[a.chave]), rotulo: NOME_AC[a.tipo] + " CMT " + br(a.cmt_kg / 1000, 2) + " t",
        detalhe: a.qtd + " un (o maior número de pernas entre os içamentos)", motivo: "marque se a obra não tem", ac: a });
    });

    /* ---- requisição de locação (uma por plano) ---- */
    var tMin = 0, ids = [];
    (ctx.icamentos || []).forEach(function (ic) { tMin += +ic.tempo_min || 0; ids.push(ic.id); });
    var passo = pp.arredonda_h > 0 ? pp.arredonda_h : 0.5, horas = Math.ceil((tMin / 60 + pp.mobilizacao_h) / passo - 1e-9) * passo;
    var chR = chaveReq(pl.id), reqs = comCarimbo(ex.requisicoes, chR), eqNome = txt((ctx.equipamento || {}).nome) || "equipamento de içamento";
    var tipoEq = (ctx.equipamento || {}).tipo === "munck" ? "munck" : "guindaste", preco = +ctx.preco_h > 0 ? +ctx.preco_h : 0;
    var R = { id: "req", grupo: "requisicao", rotulo: "Requisição de locação · " + eqNome, detalhe: br(horas, 1) + " h (" + br(tMin, 0) + " min de içamento + " + br(pp.mobilizacao_h, 1) + " h de mobilização, premissa)" + (preco ? " · " + br(preco, 2) + "/h" : " · sem preço (cotar)"), existenteId: null };
    var antes = reqs.length === 1 ? reqs[0] : null, idsAntes = {};
    ((antes && antes.itens) || []).forEach(function (it) { if (it && it.origemIcamento && it.origemIcamento.chave) idsAntes[it.origemIcamento.chave] = it.id; });
    /* ⚠ equipamento PRÓPRIO da frota (ESPEC §II.13.4): não há locação — o custo de uso já vai pelo movimento da frota (FRT);
       requisitar a locação seria pagar o próprio caminhão */
    var fr = ctx.frota || null, proprio = !!(fr && fr.posse === "proprio"), frTxt = fr ? txt(fr.nome) + (fr.placa ? " · " + txt(fr.placa) : "") : "";
    var itens = proprio ? [] : [{ id: idsAntes[chaveLocacao(pl.id)] || uid("rqi"), codigo: "", descricao: "Locação de " + tipoEq + " " + eqNome + (fr ? " (frota: " + frTxt + ")" : " (ou similar)") + " — " + br(horas, 1) + " h", unidade: "h", quantidade: horas,
      precoRef: preco, categoria: "EQ", fonte: "plano de içamento", pendente: !preco, origemIcamento: { planoId: pl.id, icamentoIds: ids, chave: chaveLocacao(pl.id) } }];
    if (proprio) R.detalhe = "equipamento PRÓPRIO da frota (" + frTxt + "): sem locação";
    listaAc.forEach(function (a) {
      var lid = "ac:" + a.tipo + ":" + Math.round(a.cmt_kg), L = linhas.filter(function (x) { return x.id === lid; })[0];
      if (!L || !L.marcada) return;
      itens.push({ id: idsAntes[a.chave] || uid("rqi"), codigo: "", descricao: NOME_AC[a.tipo] + " CMT " + br(a.cmt_kg / 1000, 2) + " t", unidade: "un", quantidade: a.qtd,
        precoRef: 0, categoria: "MAT", fonte: "plano de içamento", pendente: true, origemIcamento: { planoId: pl.id, icamentoIds: ids, chave: a.chave } });
    });
    var valor = 0; itens.forEach(function (it) { valor += (+it.quantidade || 0) * (+it.precoRef || 0); });
    var nadaReq = !itens.length;
    var obs = "Gerada pelo plano de içamento " + txt(pl.nome) + " — conferir com a locadora. Horas = soma dos tempos estimados dos içamentos + mobilização (premissa).";
    if (nadaReq && !antes && reqs.length <= 1) { R.acao = "manter"; R.motivo = "equipamento próprio: o custo de uso vai pelo movimento da frota — marque acessórios se precisar comprar."; }
    else if (nadaReq && antes && (txt(antes.status) || "aberta") === "aberta") { R.existenteId = antes.id; R.numero = antes.numero; R.acao = "bloqueado"; R.motivo = "a " + (antes.numero || "requisição") + " pede a locação, mas o equipamento agora é PRÓPRIO da frota — cancele-a à mão (não apago requisição)."; }
    else if (reqs.length > 1) { R.acao = "bloqueado"; R.motivo = reqs.length + " requisições com o mesmo carimbo deste plano (" + reqs.map(function (r) { return r.numero || r.id; }).join(", ") + ") — exclua a repetida antes."; }
    else if (antes) {
      R.existenteId = antes.id; R.numero = antes.numero;
      var st = txt(antes.status) || "aberta";
      if (st !== "aberta") { R.acao = "bloqueado"; R.motivo = "a " + (antes.numero || "requisição") + " já está " + st + " — não altero; se o plano mudou, ajuste a requisição à mão."; }
      else {
        var fA = (antes.itens || []).map(function (it) { return [it.descricao, +it.quantidade, it.origemIcamento && it.origemIcamento.chave]; }), fN = itens.map(function (it) { return [it.descricao, +it.quantidade, it.origemIcamento.chave]; });
        if (mesmo(fA, fN)) { R.acao = "manter"; R.motivo = "a " + (antes.numero || "requisição") + " já está igual."; }
        else {
          R.acao = "atualizar"; R.motivo = "a " + (antes.numero || "requisição") + " ainda está aberta: troco os itens pelo plano atual (número e aprovação ficam).";
          var r2 = {}; for (var k2 in antes) r2[k2] = antes[k2];
          r2.itens = itens; r2.valorEstimado = Math.round(valor * 100) / 100; r2.quantidade = itens[0].quantidade; r2.unidade = itens[0].unidade; r2.observacoes = obs;
          r2.origemIcamento = { planoId: pl.id, chave: chR, geradoEm: (antes.origemIcamento || {}).geradoEm || txt(ctx.agora), atualizadoEm: txt(ctx.agora) };
          R.registro = r2;
        }
      }
    } else {
      R.acao = "criar";
      R.registro = { data: txt(ctx.hoje), obraId: pl.obraId, solicitante: txt(ctx.solicitante), prioridade: "normal", status: "aberta",
        descricao: "Locação de " + tipoEq + " — plano de içamento " + txt(pl.nome), valorEstimado: Math.round(valor * 100) / 100,
        quantidade: itens[0].quantidade, unidade: itens[0].unidade, observacoes: obs, itens: itens,
        origemIcamento: { planoId: pl.id, chave: chR, geradoEm: txt(ctx.agora) } };
      if (txt(ctx.gestao)) R.registro.gestao = txt(ctx.gestao);
    }
    R.marcada = (R.acao === "criar" || R.acao === "atualizar") && marcada("req", true);
    linhas.push(R);

    /* ---- documentos NR-18 obrigatórios pendentes → tarefas da obra (ESPEC §II.13.6); documento que ficou OK conclui a tarefa ---- */
    var datas = (ctx.icamentos || []).map(function (ic) { return txt(ic.data); }).filter(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d); }).sort();
    var prazo = datas.length ? diaAntes(datas[0]) : "";
    (ctx.documentos || []).forEach(function (d) {
      if (!d || !d.obrig) return;
      var chave = "icamento:" + pl.id + ":doc:" + d.id, id = "doc:" + d.id, achadas = comCarimbo(ex.tarefasObra, chave), ok = d.status === "ok" || d.status === "na";
      var D = { id: id, grupo: "tarefa", rotulo: "Tarefa · " + d.rotulo, detalhe: txt(d.ref) + (prazo ? " · prazo " + dataBr(prazo) + " (véspera do 1º içamento)" : ""), existenteId: null };
      if (achadas.length > 1) { D.acao = "bloqueado"; D.motivo = achadas.length + " tarefas com o mesmo carimbo deste documento — apague as repetidas."; }
      else if (achadas.length === 1) {
        var t = achadas[0]; D.existenteId = t.id;
        if (ok && t.status !== "feita" && t.status !== "cancelada") { D.acao = "atualizar"; D.motivo = "o documento está OK no plano: concluo a tarefa."; var r3 = {}; for (var k3 in t) r3[k3] = t[k3]; r3.status = "feita"; r3.concluidaEm = txt(ctx.hoje); D.registro = r3; }
        else { D.acao = "manter"; D.motivo = "já está nas tarefas (" + (t.status || "a fazer") + ")."; }
      } else if (ok) return;   // documento em dia e sem tarefa: nada a fazer, nem linha
      else {
        D.acao = "criar";
        D.registro = { titulo: "Içamento — " + d.rotulo, obraId: pl.obraId, responsavelId: "", prazo: prazo, prioridade: "alta", status: "afazer",
          descricao: txt(d.ref) + " · documento obrigatório do plano de içamento " + txt(pl.nome) + " (NR-18).", origemIcamento: { planoId: pl.id, docId: d.id, chave: chave } };
      }
      D.marcada = (D.acao === "criar" || D.acao === "atualizar") && marcada(id, true);
      linhas.push(D);
    });
    if (!preco) avisos.push("Sem preço da hora: a requisição sai com o item pendente (valor estimado R$ 0) — a cotação da locadora preenche.");
    avisos.push("O financeiro NÃO recebe nada daqui: a despesa da locação nasce quando o pedido de compra for feito a partir desta requisição.");
    return { linhas: linhas, horas: horas, minutos: tMin, avisos: avisos, premissas: pp };
  }

  /* RDO DO DIA (ESPEC §II.13.5): as linhas que o formulário do RDO recebe quando a pessoa pede "trazer do plano de içamento".
     ⚠ O RDO NÃO é escrito por aqui: a tela põe as linhas nos buffers do formulário ABERTO e quem grava é o Salvar de sempre
       (estado, aprovação, Portal e sincronização intactos). Linha com o mesmo carimbo já no formulário não se repete.
     ctx = { plano: {id, nome}, data, icamentos: [{id, nome, data, tempo_min}], equipamento: {nome, tipo}, frota: {placa, posse} | null,
             liberacoes: [plano.liberacoes], existentes: { equip: [linhas do formulário], ocor: [linhas do formulário] } }
     → { equip, ocor, doDia, jaTinha, semTempo } */
  /* DEPOIS DO IÇAMENTO (ESPEC §II.14): quase-acidente, incidente, acidente e lição aprendida ligados ao plano.
     ⚠ Acidente com lesão: a CAT é obrigação legal (Lei 8.213/1991, art. 22 — até o 1º dia útil seguinte; morte, de imediato). */
  var TIPOS_REGISTRO = [
    { id: "quase-acidente", rotulo: "Quase-acidente" },
    { id: "incidente", rotulo: "Incidente (dano material, sem lesão)" },
    { id: "acidente", rotulo: "Acidente com lesão", aviso: "Emitir a CAT até o 1º dia útil seguinte (de imediato em caso de morte) — Lei 8.213/1991, art. 22." },
    { id: "licao", rotulo: "Lição aprendida" }
  ];
  function registro(r) {
    r = r || {};
    var tipo = TIPOS_REGISTRO.filter(function (t) { return t.id === r.tipo; })[0], data = txt(r.data), desc = txt(r.descricao);
    if (!tipo) return { ok: false, motivo: "escolha o tipo do registro" };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { ok: false, motivo: "informe a data" };
    if (desc.length < 10) return { ok: false, motivo: "descreva o que aconteceu (pelo menos uma frase)" };
    return { ok: true, aviso: tipo.aviso || "", registro: { id: txt(r.id) || ("oc" + Math.random().toString(36).slice(2, 10)), data: data, tipo: tipo.id, icamentoId: txt(r.icamentoId),
      descricao: desc.slice(0, 1000), causa: txt(r.causa).slice(0, 500), acao: txt(r.acao).slice(0, 500), responsavel: txt(r.responsavel).slice(0, 120), em: txt(r.em) } };
  }
  function rotuloRegistro(id) { var t = TIPOS_REGISTRO.filter(function (x) { return x.id === id; })[0]; return t ? t.rotulo : id; }

  function rdoItens(ctx) {
    ctx = ctx || {};
    var pl = ctx.plano || {}, data = txt(ctx.data), ex = ctx.existentes || {}, out = { equip: [], ocor: [], doDia: 0, jaTinha: 0, semTempo: false };
    var doDia = (ctx.icamentos || []).map(function (ic, i) { return { ic: ic, n: i + 1 }; }).filter(function (x) { return txt(x.ic.data) === data; });
    function tem(lista, chave) { return (lista || []).some(function (x) { return x && x.origemIcamento && x.origemIcamento.chave === chave; }); }
    /* os registros de segurança do dia vão ao RDO mesmo sem içamento marcado nele (o quase-acidente pode ser na mobilização) */
    var nIc = {}; (ctx.icamentos || []).forEach(function (ic, i) { nIc[ic.id] = { n: i + 1, nome: ic.nome }; });
    (ctx.registros || []).forEach(function (r) {
      if (!r || txt(r.data) !== data || !pl.id) return;
      var ch = "icamento:" + pl.id + ":rdo:oc:" + r.id;
      if (tem(ex.ocor, ch)) { out.jaTinha++; return; }
      var ic = nIc[r.icamentoId];
      out.ocor.push({ tipo: "seguranca", descricao: rotuloRegistro(r.tipo) + (ic ? " no içamento " + ic.n + " (" + (txt(ic.nome) || "peças") + ")" : " no plano de içamento") + ": " + txt(r.descricao).replace(/([^.!?])$/, "$1.") +
        (txt(r.causa) ? " Causa provável: " + txt(r.causa) + "." : "") + (txt(r.acao) ? " Ação: " + txt(r.acao) + "." : ""),
        responsavel: txt(r.responsavel), horasParadas: 0, prazoCorrecao: "", origemIcamento: { planoId: pl.id, registroId: r.id, chave: ch } });
    });
    out.doDia = doDia.length; if (!doDia.length || !pl.id) return out;
    var chE = "icamento:" + pl.id + ":rdo:" + data + ":equipamento", min = 0, ids = [];
    doDia.forEach(function (x) { ids.push(x.ic.id); if (+x.ic.tempo_min > 0) min += +x.ic.tempo_min; else out.semTempo = true; });
    if (tem(ex.equip, chE)) out.jaTinha++;
    else {
      var eq = ctx.equipamento || {}, fr = ctx.frota || null;
      out.equip.push({ tipo: (eq.tipo === "munck" ? "Munck" : "Guindaste") + (eq.nome ? " " + txt(eq.nome) : ""), prefixo: fr ? txt(fr.placa) : "", qtd: 1,
        hOperacao: out.semTempo ? 0 : Math.round(min / 60 * 10) / 10, hOciosa: 0, hManutencao: 0, alugado: fr ? fr.posse === "alugado" : true,
        origemIcamento: { planoId: pl.id, icamentoIds: ids, chave: chE } });
    }
    /* liberações FORA das condições que valem neste dia → ocorrência (tipo "equipamento", o mais próximo da lista fechada do RDO) */
    var anulados = {}, libs = ctx.liberacoes || [];
    libs.forEach(function (r) { if (r && r.tipo === "anula" && r.anula) anulados[r.anula] = true; });
    libs.forEach(function (r) {
      if (!r || r.tipo !== "fora" || anulados[r.id]) return;
      var x = doDia.filter(function (y) { return y.ic.id === r.icamentoId; })[0]; if (!x) return;
      var ch = "icamento:" + pl.id + ":rdo:lib:" + r.id;
      if (tem(ex.ocor, ch)) { out.jaTinha++; return; }
      var q = r.quem || {}, hora = /T(\d{2}:\d{2})/.exec(txt(r.em));
      out.ocor.push({ tipo: "equipamento", descricao: "Içamento " + x.n + " (" + (txt(x.ic.nome) || "peças") + ") liberado FORA das condições por " + txt(q.nome) + (q.funcao ? " (" + txt(q.funcao) + ")" : "") +
        (hora ? " às " + hora[1] : "") + " — motivo: " + txt(r.motivo) + ((r.motivosSistema || []).length ? ". O plano apontava: " + r.motivosSistema.slice(0, 2).join("; ") : "") + ".",
        responsavel: txt(q.nome), horasParadas: 0, prazoCorrecao: "", origemIcamento: { planoId: pl.id, liberacaoId: r.id, chave: ch } });
    });
    return out;
  }

  var IcarLanca = { PREMISSAS: PREMISSAS, montar: montar, rdoItens: rdoItens, chaveTarefa: chaveTarefa, chaveReq: chaveReq, TIPOS_REGISTRO: TIPOS_REGISTRO, registro: registro, rotuloRegistro: rotuloRegistro };
  global.IcarLanca = IcarLanca;
  if (typeof module !== "undefined" && module.exports) module.exports = IcarLanca;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
