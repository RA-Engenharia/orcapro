/* =====================================================================
 * bimelo.js — O ELO PEÇA ↔ TAREFA DO PLANO ↔ PRAZO ↔ CUSTO (motor PURO)
 *
 * O QUE FALTAVA. O 4D ligava a peça do modelo à ETAPA (carimbo
 * `OrcaPRO_Etapa`) e parava ali. Só que o plano executivo da obra não é
 * feito de etapas: é feito de TAREFAS — as subetapas ("2.2 Pilares",
 * "2.3 Lajes") com datas, folga, caminho crítico, avanço lançado e valor
 * de venda próprios. Com o elo na etapa, a laje subia no 3D junto com os
 * pilares (a janela da etapa inteira), o avanço lançado nos pilares não
 * pintava pilar nenhum, e a pergunta "quanto vale o que está pronto neste
 * pavimento?" não tinha resposta peça a peça.
 *
 * Aqui a peça ganha UM elo, que carrega as três coisas de uma vez:
 *   PRAZO  — as datas da tarefa no plano (e as da linha de base);
 *   CUSTO  — o valor de venda da tarefa (`Orcamento.valoresEAP`) e o custo
 *            direto dela (os itens do orçamento);
 *   PLANO  — o nó da EAP executiva, com o avanço real que foi lançado nele.
 *
 * DE ONDE VEM O ELO, em ordem de prioridade (o primeiro que casar vale):
 *   1. `OrcaPRO_Tarefa` — parâmetro do plugin Revit: "3.2 Pilares", "3.2"
 *      ou o nome da tarefa (se for único). É o parâmetro que liga tudo.
 *   2. `OrcaPRO_CodOrc` — o código do serviço (SINAPI/próprio). Liga à
 *      tarefa que contém aquele serviço — SÓ quando o código está numa
 *      tarefa só (dentro da etapa carimbada, se houver).
 *   3. `OrcaPRO_Etapa`  — o de sempre (casado pelo `BIM4D.planejar`).
 *      Etapa sem subetapas É a tarefa; etapa com subetapas fica "só pela
 *      etapa" e a peça sobe na janela dela inteira.
 *   4. categoria / tipo IFC — estimado, como hoje.
 *
 * ⚠ NUNCA POR SEMELHANÇA (a regra de ouro do js/bimorc.js). O carimbo casa
 *   por IDENTIDADE: id do nó, número exato da EAP, código exato do serviço
 *   ou nome IGUAL (normalizado só em caixa e espaço). "Alvenaria térreo" não
 *   casa com "Alvenaria do térreo". O que não casa sai LISTADO com o motivo,
 *   e a peça cai para o próximo carimbo — nunca para um palpite.
 *
 * ⚠ NÚMERO E NOME TÊM DE CONCORDAR. O número da EAP muda quando alguém
 *   insere uma subetapa no meio: "3.2 Pilares" gravado no Revit passa a
 *   apontar para "3.2 Fôrmas". Casar só pelo número poria os pilares na data
 *   das fôrmas, calado. Quando o carimbo traz os dois e eles discordam, vale
 *   o NOME se ele for único (com o aviso "o plano foi renumerado") — senão a
 *   peça não liga e o motivo diz para recarimbar.
 *
 * ⚠ CÓDIGO REPETIDO NÃO ESCOLHE. O mesmo código SINAPI aparece em várias
 *   tarefas (concreto dos pilares e concreto da laje). Escolher a primeira é
 *   ligar por sorte; o elo sai "em N tarefas — carimbe OrcaPRO_Tarefa".
 *
 * ⚠ SEM R$ POR PEÇA. O valor sai POR TAREFA, com o número de peças dela no
 *   modelo ao lado. Dividir o valor pela contagem daria à conexão de 2 cm o
 *   mesmo preço da parede (o ⚠ "CONTAR PEÇA NÃO É MEDIR OBRA" do bim4d.js).
 *
 * ⚠ AS DUAS RÉGUAS DE DINHEIRO NÃO SE MISTURAM (skill `dinheiro`): `venda`
 *   é o preço de venda (BDI dentro — a régua do cronograma e da proposta);
 *   `custo` é o custo direto dos itens (a régua do Financeiro). Saem em
 *   campos separados e a tela rotula cada um.
 *
 * Node-testável: tools/test-bimelo.js (com controles negativos executados).
 * ES5: o produto roda em WebView de instalador antigo.
 * ===================================================================== */
(function (global) {
  "use strict";

  var PARAM = "OrcaPRO_Tarefa";
  var FONTE = { tarefa: "OrcaPRO_Tarefa", codOrc: "OrcaPRO_CodOrc", etapa: "OrcaPRO_Etapa", categoria: "categoria", tipo: "tipo IFC" };
  var NIVEL_ROT = {
    tarefa: "Pela tarefa do plano",
    etapa: "Só pela etapa (a etapa tem tarefas; a peça sobe na janela dela inteira)",
    categoria: "Pela categoria (estimado)",
    tipo: "Pelo tipo de peça (estimado)",
    existente: "Existente (reforma) — não é obra"
  };

  function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function arr(a) { return (a && typeof a.length === "number") ? a : []; }
  function num(v) { var n = +v; return isFinite(n) ? n : 0; }
  function txt(v) { return String(v == null ? "" : v).trim(); }
  /* nome: só caixa e espaço — nada de tirar acento ou palavra (isso já é
     semelhança, e semelhança não liga nada aqui) */
  function norm(s) { return txt(s).toLowerCase().replace(/\s+/g, " "); }
  /* código de serviço: caixa e espaços fora ("SINAPI 87489" ≠ "87489" de
     propósito — o prefixo é parte do que foi digitado no orçamento) */
  function normCod(s) { return txt(s).toUpperCase().replace(/\s+/g, ""); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(d) {
    if (!d) return "";
    if (typeof d === "string") { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d); return m ? m[1] + "-" + m[2] + "-" + m[3] : ""; }
    if (typeof d.getFullYear !== "function" || !isFinite(d.getTime())) return "";
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function modCrono(C) {
    if (C) return C;
    if (global.Cronograma) return global.Cronograma;
    if (typeof require !== "undefined") { try { return require("./cronograma.js"); } catch (e) {} }
    return null;
  }

  /* ---------------------------------------------------------------------
     O ÍNDICE DA ÁRVORE — `r.atividades` do `Cronograma.estimar(orc, _,
     {eap: true, valores, calc})`. Sem a árvore (estimar sem `eap`), o índice
     sai vazio e o elo fica no nível da etapa, como antes.
     ------------------------------------------------------------------- */
  function indice(r) {
    var I = { ok: false, porId: {}, porNumero: {}, nomeFolha: {}, nomeEtapa: {}, servPorCod: {}, folhas: [], etapas: [], filhos: {} };
    var nos = arr(r && r.atividades);
    if (!nos.length) return I;
    I.ok = true;
    nos.forEach(function (n) {
      if (!n || n.id == null) return;
      var id = String(n.id);
      I.porId[id] = n;
      if (n.numero != null && txt(n.numero) && !own(I.porNumero, txt(n.numero))) I.porNumero[txt(n.numero)] = id;
      if (n.tipo === "etapa") {
        I.etapas.push(id);
        var ke = norm(n.nome); if (ke) (I.nomeEtapa[ke] = I.nomeEtapa[ke] || []).push(id);
      }
      if (n.papel === "folha") {
        I.folhas.push(id);
        var kf = norm(n.nome); if (kf) (I.nomeFolha[kf] = I.nomeFolha[kf] || []).push(id);
        if (n.tipo !== "etapa" && n.paiId != null) (I.filhos[String(n.paiId)] = I.filhos[String(n.paiId)] || []).push(id);
      }
      if (n.tipo === "servico") {
        var kc = normCod(n.codigo); if (kc) (I.servPorCod[kc] = I.servPorCod[kc] || []).push(id);
      }
    });
    return I;
  }
  /* a TAREFA (nó folha) de um nó: o próprio, se for folha; o pai, se for
     serviço (serviço pendura numa folha: subetapa, grupo de soltos ou a
     etapa sem subetapas) */
  function folhaDe(I, id) {
    var n = I.porId[String(id)], g = 0;
    while (n && n.papel !== "folha" && n.paiId != null && g++ < 6) n = I.porId[String(n.paiId)];
    return (n && n.papel === "folha") ? String(n.id) : null;
  }
  function etapaDe(I, id) {
    var n = I.porId[String(id)];
    return n ? String(n.etapaId != null ? n.etapaId : n.id) : null;
  }

  /* ---------------------------------------------------------------------
     O CARIMBO DE TAREFA → nó. Devolve {no, servicoId, aviso} ou {erro}.
     ------------------------------------------------------------------- */
  var RE_NUM = /^\s*(\d+(?:\.(?:\d+|g))*)(?:\s*[-–—·:|]\s*|\s+|$)(.*)$/i;
  function lerCarimbo(s) {
    var t = txt(s), m = RE_NUM.exec(t);
    if (m) return { numero: m[1].toLowerCase(), nome: txt(m[2]) };
    return { numero: "", nome: t };
  }
  function porNome(I, nome) {
    var k = norm(nome), f = I.nomeFolha[k] || [];
    if (f.length === 1) return { id: f[0] };
    if (f.length > 1) return { erro: "há " + f.length + " tarefas com o nome “" + txt(nome) + "” (" + f.map(function (id) { return I.porId[id].numero; }).join(", ") + ") — use o número da tarefa no carimbo" };
    var e = I.nomeEtapa[k] || [];
    if (e.length === 1) return { id: e[0] };
    if (e.length > 1) return { erro: "há " + e.length + " etapas com o nome “" + txt(nome) + "” — use o número no carimbo" };
    return null;
  }
  function casaTarefa(I, valor) {
    var t = txt(valor);
    if (!t) return null;
    if (own(I.porId, t)) return alvo(I, t, "");
    var c = lerCarimbo(t);
    if (c.numero) {
      var id = own(I.porNumero, c.numero) ? I.porNumero[c.numero] : null;
      if (id && (!c.nome || norm(c.nome) === norm(I.porId[id].nome))) return alvo(I, id, "");
      /* o texto INTEIRO pode ser o nome ("2 Pavimento superior" é nome de
         subetapa, não "nº 2 + Pavimento superior") — igual e único, vale */
      var inteiro = porNome(I, t);
      if (inteiro && inteiro.id) return alvo(I, inteiro.id, "");
      if (c.nome) {
        var pn = porNome(I, c.nome);
        if (pn && pn.id) {
          return alvo(I, pn.id, id
            ? "o carimbo diz “" + t + "”, mas o nº " + c.numero + " agora é “" + I.porId[id].nome + "”: liguei pelo nome, à tarefa " + I.porId[pn.id].numero + " (o plano foi renumerado — recarimbe pelo plugin)"
            : "o nº " + c.numero + " não existe mais neste plano: liguei pelo nome, à tarefa " + I.porId[pn.id].numero + " (recarimbe pelo plugin)");
        }
        if (pn && pn.erro) return { erro: pn.erro };
        return { erro: id
          ? "o nº " + c.numero + " é “" + I.porId[id].nome + "” e o carimbo diz “" + c.nome + "”; nenhuma tarefa tem esse nome — o plano foi renumerado? Recarimbe pelo plugin"
          : "não há tarefa nº " + c.numero + " nem com o nome “" + c.nome + "” neste plano" };
      }
      return { erro: "não há tarefa nº " + c.numero + " neste plano" };
    }
    var p = porNome(I, c.nome);
    if (p && p.id) return alvo(I, p.id, "");
    if (p && p.erro) return { erro: p.erro };
    return { erro: "nenhuma tarefa nem etapa se chama “" + t + "” neste plano (o nome tem de ser igual — use o número, ex.: 3.2)" };
  }
  function alvo(I, id, aviso) {
    var n = I.porId[id];
    if (n.tipo === "servico") { var f = folhaDe(I, id); return f ? { no: f, servicoId: id, aviso: aviso } : { erro: "o serviço " + n.numero + " não está em nenhuma tarefa" }; }
    return { no: id, servicoId: null, aviso: aviso };
  }
  /* o CÓDIGO do serviço → a tarefa. `etapaId` restringe à etapa carimbada. */
  function casaCodigo(I, cod, etapaId) {
    var k = normCod(cod); if (!k) return null;
    var servs = I.servPorCod[k] || [];
    if (!servs.length) return { erro: "o código " + txt(cod) + " não está em nenhum serviço deste orçamento" };
    if (etapaId != null) {
      var so = servs.filter(function (id) { return etapaDe(I, id) === String(etapaId); });
      if (!so.length) return { erro: "o código " + txt(cod) + " não está na etapa carimbada (" + (I.porId[String(etapaId)] ? I.porId[String(etapaId)].nome : etapaId) + ")" };
      servs = so;
    }
    var fs = {}, lista = [];
    servs.forEach(function (id) { var f = folhaDe(I, id); if (f && !own(fs, f)) { fs[f] = true; lista.push(f); } });
    if (lista.length === 1) return { no: lista[0], servicoId: servs.length === 1 ? servs[0] : null, aviso: "" };
    return { erro: "o código " + txt(cod) + " está em " + lista.length + " tarefas (" + lista.map(function (f) { return I.porId[f].numero; }).join(", ") + ") — carimbe OrcaPRO_Tarefa para dizer qual" };
  }

  /* ---------------------------------------------------------------------
     RESOLVER — o elo de cada peça.
     elementos: [{id, tipo, etapa?, codOrc?, tarefa?, fase?}]
     r:         `Cronograma.estimar(orc, _, {eap:true, valores, calc})`
     opts.plano: `BIM4D.planejar(elementos, r.etapas)` — de onde vem o casamento
                da ETAPA (a regra de sempre, sem cópia aqui)
     → { porEl: {id: elo}, n: {nivel: qtd}, semPar: [{campo, valor, n, motivo}],
         conflitos: [{campo, valor, etapaCarimbo, tarefa, n}], avisos: [{msg, n}] }
     elo = { nivel, fonte, noId, etapaId, servicoId, numero, nome, aviso }
     ------------------------------------------------------------------- */
  function resolver(elementos, r, opts) {
    opts = opts || {};
    var I = indice(r);
    var pl = {};
    arr(opts.plano && opts.plano.elementos).forEach(function (p) { if (p && p.id != null) pl[String(p.id)] = p; });
    var porEl = {}, n = { tarefa: 0, etapa: 0, categoria: 0, tipo: 0, existente: 0, total: 0 };
    var semPar = {}, conflitos = {}, avisos = {};
    function soma(mapa, chave, obj) { if (!own(mapa, chave)) { obj.n = 0; mapa[chave] = obj; } mapa[chave].n++; }
    arr(elementos).forEach(function (el) {
      if (!el || el.id == null) return;
      var id = String(el.id), p = pl[id] || null;
      n.total++;
      var fase = String(el.fase || (p && p.fase) || "").toLowerCase();
      if (fase === "existente") { porEl[id] = { nivel: "existente", fonte: "OrcaPRO_Fase", noId: null, etapaId: null, servicoId: null, numero: "", nome: "", aviso: "" }; n.existente++; return; }
      var etCar = (p && p.etapaId != null) ? String(p.etapaId) : null;
      var m = null, fonte = "";
      if (I.ok && txt(el.tarefa)) {
        m = casaTarefa(I, el.tarefa); fonte = FONTE.tarefa;
        if (m && m.erro) { soma(semPar, "t|" + txt(el.tarefa), { campo: FONTE.tarefa, valor: txt(el.tarefa), motivo: m.erro }); m = null; }
      }
      if (!m && I.ok && txt(el.codOrc)) {
        var mc = casaCodigo(I, el.codOrc, etCar); fonte = FONTE.codOrc;
        if (mc && mc.erro) soma(semPar, "c|" + normCod(el.codOrc) + "|" + (etCar || ""), { campo: FONTE.codOrc, valor: txt(el.codOrc), motivo: mc.erro });
        else m = mc;
      }
      var elo;
      if (m && m.no) {
        var no = I.porId[m.no], et = etapaDe(I, m.no);
        elo = { nivel: "tarefa", fonte: fonte, noId: m.no, etapaId: et, servicoId: m.servicoId || null,
          numero: txt(no.numero), nome: txt(no.nome), aviso: m.aviso || "" };
        if (m.aviso) soma(avisos, m.aviso, { msg: m.aviso });
        /* ⚠ a tarefa é mais específica que a etapa e vale — mas a discordância
           é dita: um dos dois carimbos está errado no modelo */
        if (etCar && et && etCar !== et) {
          soma(conflitos, fonte + "|" + m.no + "|" + etCar, { campo: fonte, valor: txt(fonte === FONTE.tarefa ? el.tarefa : el.codOrc),
            tarefa: elo.numero + " " + elo.nome, etapaCarimbo: (I.porId[etCar] && I.porId[etCar].nome) || txt(el.etapa) });
        }
      } else if (etCar) {
        var ne = I.porId[etCar];
        /* sem a árvore não se sabe se a etapa tem tarefas: fica "etapa" */
        var ehFolha = !!(I.ok && ne && ne.papel === "folha");
        elo = { nivel: ehFolha ? "tarefa" : "etapa", fonte: FONTE.etapa, noId: etCar, etapaId: etCar, servicoId: null,
          numero: ne ? txt(ne.numero) : "", nome: ne ? txt(ne.nome) : txt(el.etapa), aviso: "" };
      } else if (p && p.exato) {
        elo = { nivel: "categoria", fonte: FONTE.categoria, noId: null, etapaId: null, servicoId: null, numero: "", nome: String(p.cat || ""), aviso: "" };
      } else {
        elo = { nivel: "tipo", fonte: FONTE.tipo, noId: null, etapaId: null, servicoId: null, numero: "", nome: String((p && p.cat) || ""), aviso: "" };
      }
      porEl[id] = elo;
      n[elo.nivel]++;
    });
    function lista(mp) { return Object.keys(mp).map(function (k) { return mp[k]; }).sort(function (a, b) { return b.n - a.n; }); }
    return { porEl: porEl, n: n, semPar: lista(semPar), conflitos: lista(conflitos), avisos: lista(avisos), temArvore: I.ok, _I: I };
  }

  /* ---------------------------------------------------------------------
     CUSTO DIRETO POR NÓ — dos ITENS do orçamento (quantidade × custo
     unitário, a mesma conta do `custo` da etapa no `estimar`), somado do
     serviço para a tarefa e para a etapa. A VENDA é o `valor` do nó
     (`Orcamento.valoresEAP`, entregue pelo `estimar` com `ctx.valores`).
     ------------------------------------------------------------------- */
  function custos(orc, r) {
    var I = indice(r), out = {};
    function add(id, v) { if (id == null) return; out[String(id)] = (out[String(id)] || 0) + v; }
    Object.keys(I.porId).forEach(function (id) {
      var n = I.porId[id];
      if (n.tipo !== "servico") return;
      var et = arr(orc && orc.etapas)[n.etapaIdx], it = et ? arr(et.itens)[n.itemIdx] : null;
      var v = it ? num(it.quantidade) * num(it.custoUnitario) : 0;
      add(id, v);
      var f = folhaDe(I, id); if (f && f !== id) add(f, v);
      var e = etapaDe(I, id); if (e && e !== f) add(e, v);
    });
    return out;
  }

  /* ---------------------------------------------------------------------
     CONFERIR — a cobertura do elo: quanto do plano (em tarefas e em valor
     de venda) tem peça no modelo, e o que ficou de fora.
     → { tarefas:[{id, numero, nome, etapaId, venda, nPecas}], semPeca:[…],
         vendaTotal, vendaComPeca, pctVenda (null sem valores), n, semPar,
         conflitos, avisos }
     ------------------------------------------------------------------- */
  function conferir(res, r) {
    var I = (res && res._I) || indice(r);
    var cont = {};
    Object.keys((res && res.porEl) || {}).forEach(function (k) {
      var e = res.porEl[k];
      if (e && e.noId != null) cont[e.noId] = (cont[e.noId] || 0) + 1;
    });
    var temValor = false, vendaTotal = 0, vendaCom = 0, tarefas = [];
    I.folhas.forEach(function (id) {
      var n = I.porId[id], v = (n.valor == null) ? null : num(n.valor);
      if (v != null) temValor = true;
      var np = cont[id] || 0;
      /* a peça ligada só pela ETAPA (que tem tarefas) cobre a etapa, não a
         tarefa: não entra aqui como "com peça" */
      if (v != null) { vendaTotal += v; if (np) vendaCom += v; }
      tarefas.push({ id: id, numero: txt(n.numero), nome: txt(n.nome), etapaId: etapaDe(I, id), venda: v, nPecas: np, marco: !!n.marco });
    });
    var soEtapa = {};
    Object.keys((res && res.porEl) || {}).forEach(function (k) { var e = res.porEl[k]; if (e && e.nivel === "etapa") soEtapa[e.noId] = (soEtapa[e.noId] || 0) + 1; });
    var semPeca = tarefas.filter(function (t) { return !t.nPecas && !t.marco; }).sort(function (a, b) { return num(b.venda) - num(a.venda); });
    return {
      tarefas: tarefas, semPeca: semPeca, soEtapa: Object.keys(soEtapa).map(function (id) { var n = I.porId[id]; return { id: id, numero: n ? txt(n.numero) : "", nome: n ? txt(n.nome) : id, nPecas: soEtapa[id], nTarefas: (I.filhos[id] || []).length }; }),
      vendaTotal: temValor ? vendaTotal : null, vendaComPeca: temValor ? vendaCom : null,
      pctVenda: temValor && vendaTotal > 0 ? vendaCom / vendaTotal : null,
      n: (res && res.n) || null, semPar: (res && res.semPar) || [], conflitos: (res && res.conflitos) || [], avisos: (res && res.avisos) || [],
      temArvore: I.ok
    };
  }

  /* ---------------------------------------------------------------------
     A FICHA DE UMA PEÇA — o que o clique no 3D mostra: de onde veio a
     informação, a tarefa, o prazo, o dinheiro (as duas réguas) e o avanço.
     ------------------------------------------------------------------- */
  function ficha(elId, res, r, extras) {
    extras = extras || {};
    var e = res && res.porEl ? res.porEl[String(elId)] : null;
    if (!e) return null;
    var I = (res && res._I) || indice(r);
    var out = { nivel: e.nivel, nivelRot: NIVEL_ROT[e.nivel] || e.nivel, fonte: e.fonte, aviso: e.aviso || "", numero: e.numero, nome: e.nome, etapa: null, servico: null,
      inicio: "", termino: "", critica: false, folga: null, venda: null, custo: null, nPecas: 0, avanco: null };
    if (e.noId == null) return out;
    var n = I.porId[String(e.noId)];
    var et = e.etapaId != null ? I.porId[String(e.etapaId)] : null;
    if (et && et !== n) out.etapa = { numero: txt(et.numero), nome: txt(et.nome) };
    if (e.servicoId && I.porId[e.servicoId]) { var s = I.porId[e.servicoId]; out.servico = { numero: txt(s.numero), nome: txt(s.nome), codigo: txt(s.codigo), unidade: txt(s.unidade) }; }
    if (n) {
      out.inicio = ymd(n.dataInicio);
      out.termino = terminoIncl(r, n, extras.Cronograma);
      out.critica = !!n.critico; out.folga = n.folga == null ? null : num(n.folga);
      out.venda = n.valor == null ? null : num(n.valor);
      if (extras.custos && own(extras.custos, String(e.noId))) out.custo = num(extras.custos[String(e.noId)]);
      if (n.avanco) out.avanco = { estado: n.avanco.estado, pct: num(n.avanco.pct), iniReal: n.avanco.iniReal || null, fimReal: n.avanco.fimReal || null };
    }
    Object.keys(res.porEl).forEach(function (k) { if (res.porEl[k] && res.porEl[k].noId === e.noId) out.nPecas++; });
    return out;
  }
  /* o ÚLTIMO dia de trabalho de um nó (o `dataFim` do motor é exclusivo),
     pelo calendário do próprio resultado — nunca um calendário paralelo */
  function terminoIncl(r, n, C) {
    if (!n || !n.dataInicio) return "";
    if (n.marco || !(num(n.fim) > num(n.inicio))) return ymd(n.dataInicio);
    var Cr = modCrono(C);
    try { if (Cr && typeof Cr.calendario === "function") return ymd(Cr.calendario(r).dia(num(n.fim) - 1)); } catch (e) {}
    return ymd(n.dataFim);
  }

  /* ---------------------------------------------------------------------
     A LISTA DE TAREFAS PARA O REVIT — o campo ADITIVO `tarefas` do
     revit/obra-ativa.json (formato 1). `carimbo` é o texto EXATO que o
     botão "Carimbar Tarefa" do plugin grava em OrcaPRO_Tarefa.
     ------------------------------------------------------------------- */
  function tarefasRevit(r, C) {
    var I = indice(r), out = [];
    if (!I.ok) return out;
    arr(r.atividades).forEach(function (n) {
      if (!n || n.papel !== "folha") return;
      var et = n.tipo === "etapa" ? n : I.porId[String(n.etapaId)];
      out.push({ numero: txt(n.numero), nome: txt(n.nome), etapa: et ? txt(et.nome) : "", etapaNumero: et ? txt(et.numero) : "",
        tipo: n.tipo === "etapa" ? "etapa" : (n.tipo === "soltos" ? "soltos" : "subetapa"),
        inicio: ymd(n.dataInicio), fim: terminoIncl(r, n, C), critica: !!n.critico, marco: !!n.marco,
        carimbo: txt(n.numero) + " " + txt(n.nome) });
    });
    return out;
  }

  var BIMElo = {
    PARAM: PARAM, FONTE: FONTE, NIVEL_ROT: NIVEL_ROT,
    indice: indice, lerCarimbo: lerCarimbo, casaTarefa: casaTarefa, casaCodigo: casaCodigo,
    resolver: resolver, custos: custos, conferir: conferir, ficha: ficha, tarefasRevit: tarefasRevit,
    folhaDe: folhaDe, terminoIncl: terminoIncl
  };
  global.BIMElo = BIMElo;
  if (typeof module !== "undefined" && module.exports) module.exports = BIMElo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
