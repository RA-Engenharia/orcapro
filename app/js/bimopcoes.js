/* =====================================================================
 * bimopcoes.js — OPÇÕES DE PROJETO (motor puro, ES5, Node-testável).
 *
 * Fase P10, Frente C do plano do BIM (Gerenciar › Opções de
 * projeto). O uso que paga a frente é o do orçamento: "piso de porcelanato
 * ou de vinílico?", "laje maciça ou treliçada?", "cozinha A ou B?" — o
 * cliente vê as duas alternativas com preço, lado a lado, sem duplicar o
 * modelo.
 *
 * COMO FUNCIONAM (convenção de mercado):
 *   · CONJUNTO DE OPÇÕES (ex.: "Cozinha") com duas ou mais OPÇÕES ("Opção A",
 *     "Opção B"); cada conjunto tem UMA opção PRINCIPAL (a primeira criada,
 *     trocável em "Tornar principal");
 *   · a peça está no MODELO PRINCIPAL (fora de opção) ou numa opção — o
 *     parâmetro "Opção de desenho" (DESIGN_OPTION_ID, js/bimparam.js);
 *   · a vista, a tabela e a exportação mostram o modelo principal + a opção
 *     principal de cada conjunto; "Aceitar principal" incorpora a principal
 *     ao modelo e apaga as outras; apagar uma opção apaga as peças dela.
 *
 * AS OPS (forma conferida em BimEdit.opP10Valida, gancho "P10"):
 *   {op:"opcoes", acao:"conjunto", id, nome}
 *   {op:"opcoes", acao:"opcao", id, conjunto, nome, principal?}
 *   {op:"opcoes", acao:"principal", id}          tornar principal
 *   {op:"opcoes", acao:"incluir", id, ids:[…]}    peças para a opção `id`
 *   {op:"opcoes", acao:"retirar", ids:[…]}        peças de volta ao modelo principal
 *   {op:"opcoes", acao:"apagar", id}              opção (e as peças dela) ou conjunto
 *   {op:"opcoes", acao:"aceitar", id}             aceitar a principal do conjunto `id`
 *
 * O ORÇAMENTO POR OPÇÃO: filtrar(estado, escolha) dá o estado com o modelo
 * principal e, em cada conjunto, a opção escolhida (padrão: a principal). O
 * js/orcmodelo.js (gancho "P10") orça o modelo principal; orcamento() e
 * comparar() orçam qualquer escolha e põem duas lado a lado.
 *
 * Teste: node tools/test-bimopcoes.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function r2(v) { return Math.round((Number(v) + 1e-9) * 100) / 100; }
  function r4(v) { return Math.round(Number(v) * 10000) / 10000; }

  var MAPAS = [["caixas", "ordem"], ["fams", "ordemF"], ["cobs", "ordemC"], ["vols", "ordemV"], ["forros", "ordemFo"]];
  function cadaPeca(ctx, fn) {
    MAPAS.forEach(function (mo) { var m = ctx[mo[0]] || {}; Object.keys(m).forEach(function (id) { if (m[id]) fn(m[id], id, mo); }); });
  }
  function acharNoCtx(ctx, id) {
    var s = String(id);
    for (var i = 0; i < MAPAS.length; i++) { var m = ctx[MAPAS[i][0]] || {}; if (m[s]) return m[s]; }
    return null;
  }
  function apagarNoCtx(ctx, id) {
    for (var i = 0; i < MAPAS.length; i++) {
      var m = ctx[MAPAS[i][0]] || {}; if (!m[id]) continue;
      delete m[id];
      if (MAPAS[i][1] && Array.isArray(ctx[MAPAS[i][1]])) { var ix = ctx[MAPAS[i][1]].indexOf(id); if (ix >= 0) ctx[MAPAS[i][1]].splice(ix, 1); }
      return true;
    }
    return false;
  }
  function estadoOpcoes(ctx) { return ctx.ext.opcoes || (ctx.ext.opcoes = { conjuntos: {}, ordemC: [], opcoes: {} }); }

  /* as peças do estado (para filtrar e contar) */
  var LISTAS = ["caixas", "coberturas", "familias", "volumes", "forros"];

  var BimOpcoes = {
    /* ---------------------------------------------- consulta */
    /* { conjuntoId: opçãoId } com a principal de cada conjunto */
    escolhaPadrao: function (estado) {
      var e = {};
      arr(estado && estado.opcoes && estado.opcoes.conjuntos).forEach(function (c) { if (c.principal) e[c.id] = c.principal; });
      return e;
    },
    conjuntoDe: function (estado, opcaoId) {
      var cs = arr(estado && estado.opcoes && estado.opcoes.conjuntos);
      for (var i = 0; i < cs.length; i++) if (arr(cs[i].opcoes).some(function (o) { return o.id === opcaoId; })) return cs[i];
      return null;
    },
    /* a peça aparece com a escolha dada? (fora de opção: sempre) */
    visivel: function (el, estado, escolha) {
      if (!el || !el.opcaoProjeto) return true;
      var c = BimOpcoes.conjuntoDe(estado, el.opcaoProjeto); if (!c) return true;
      var e = escolha && escolha[c.id] ? escolha[c.id] : c.principal;
      return e === el.opcaoProjeto;
    },
    /* o estado com o modelo principal + a opção escolhida de cada conjunto
       (padrão: a principal). A hospedada sai com a parede dela. */
    filtrar: function (estado, escolha) {
      if (!estado || !estado.opcoes || !arr(estado.opcoes.conjuntos).length) return estado;
      var esc = {}, pad = BimOpcoes.escolhaPadrao(estado);
      Object.keys(pad).forEach(function (k) { esc[k] = pad[k]; });
      if (escolha) Object.keys(escolha).forEach(function (k) { esc[k] = escolha[k]; });
      var out = {}, fora = {};
      Object.keys(estado).forEach(function (k) { out[k] = estado[k]; });
      LISTAS.forEach(function (k) {
        if (!Array.isArray(estado[k])) return;
        out[k] = estado[k].filter(function (x) { var ok = BimOpcoes.visivel(x, estado, esc); if (!ok && x && x.id != null) fora[String(x.id)] = 1; return ok; });
      });
      if (Array.isArray(out.familias)) out.familias = out.familias.filter(function (f) { return !(f && f.host && fora[String(f.host.id)]); });
      out.opcoesEscolha = esc;
      return out;
    },

    /* ---------------------------------------------- ops da tela */
    opConjunto: function (estado, nome) {
      if (!txt(nome).trim()) return { ok: false, motivo: "O conjunto precisa de nome." };
      var usados = {}; arr(estado && estado.opcoes && estado.opcoes.conjuntos).forEach(function (c) { usados[c.id] = 1; });
      var n = 1; while (usados["C" + n]) n++;
      var id = "C" + n;
      /* o conjunto já nasce com a "Opção 1" (principal) */
      return { ok: true, id: id, op: { op: "lote", id: "opc-" + id, origem: "opcoes", ops: [
        { op: "opcoes", acao: "conjunto", id: id, nome: txt(nome).trim().slice(0, 80) },
        { op: "opcoes", acao: "opcao", id: id + ".1", conjunto: id, nome: "Opção 1", principal: true }] } };
    },
    opOpcao: function (estado, conjuntoId, nome) {
      var c = arr(estado && estado.opcoes && estado.opcoes.conjuntos).filter(function (x) { return x.id === conjuntoId; })[0];
      if (!c) return { ok: false, motivo: "Conjunto não encontrado: " + conjuntoId + "." };
      var usados = {}; arr(c.opcoes).forEach(function (o) { usados[o.id] = 1; });
      var n = arr(c.opcoes).length + 1; while (usados[c.id + "." + n]) n++;
      return { ok: true, id: c.id + "." + n, op: { op: "opcoes", acao: "opcao", id: c.id + "." + n, conjunto: c.id, nome: txt(nome).trim().slice(0, 80) || ("Opção " + n) } };
    },
    opIncluir: function (estado, opcaoId, ids) {
      if (!BimOpcoes.conjuntoDe(estado, opcaoId)) return { ok: false, motivo: "Opção não encontrada: " + opcaoId + "." };
      var l = arr(ids).map(String).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
      if (!l.length) return { ok: false, motivo: "Selecione as peças que vão para a opção." };
      return { ok: true, op: { op: "opcoes", acao: "incluir", id: opcaoId, ids: l } };
    },

    /* ---------------------------------------------- orçamento por opção */
    /* o orçamento do modelo com a escolha dada (js/orcmodelo.js) */
    orcamento: function (estado, escolha, avaliarFam, base, opcoes) {
      var OM = dep("OrcModelo", "./orcmodelo.js"); if (!OM) return null;
      var o = {}; Object.keys(opcoes || {}).forEach(function (k) { o[k] = opcoes[k]; });
      o.escolhaOpcoes = escolha || {};
      return OM.doModelo(estado, avaliarFam, base, o);
    },
    /* COMPARAR DUAS OPÇÕES (do mesmo conjunto ou de conjuntos diferentes): o
       resto do modelo igual (principal), a opção A num, a B no outro.
       → { a:{opcao, nome, total, mo, mat, eq, horas}, b:{…}, diferenca,
           linhas:[{codigo, descricao, unidade, qa, qb, ta, tb, dif}] } */
    comparar: function (estado, opA, opB, avaliarFam, base, opcoes) {
      var cA = BimOpcoes.conjuntoDe(estado, opA), cB = BimOpcoes.conjuntoDe(estado, opB);
      if (!cA || !cB) return { ok: false, motivo: "Escolha duas opções do projeto." };
      if (opA === opB) return { ok: false, motivo: "Escolha duas opções diferentes." };
      var eA = {}, eB = {}; eA[cA.id] = opA; eB[cB.id] = opB;
      var mA = BimOpcoes.orcamento(estado, eA, avaliarFam, base, opcoes), mB = BimOpcoes.orcamento(estado, eB, avaliarFam, base, opcoes);
      if (!mA || !mB) return { ok: false, motivo: "O motor do orçamento (js/orcmodelo.js) não carregou." };
      function nomeOp(c, id) { var o = arr(c.opcoes).filter(function (x) { return x.id === id; })[0]; return c.nome + " : " + (o ? o.nome : id); }
      function lado(m, id, c) { var s = m.resumo; return { opcao: id, nome: nomeOp(c, id), total: s.custo.total, mo: s.custo.mo, mat: s.custo.mat, eq: s.custo.eq, horas: s.horasTotal, pendencias: m.pendencias.length }; }
      var linhas = {}, ordem = [];
      function somar(m, lado2) {
        m.porComposicao.forEach(function (g) {
          if (g.status !== "ok") return;
          var k = g.codigo + "|" + g.unidade, l = linhas[k];
          if (!l) { l = linhas[k] = { codigo: g.codigo, descricao: g.descricao, unidade: g.unidade, qa: 0, qb: 0, ta: 0, tb: 0 }; ordem.push(k); }
          l["q" + lado2] = r4(l["q" + lado2] + g.quantidade); l["t" + lado2] = r2(l["t" + lado2] + g.custo.total);
        });
      }
      somar(mA, "a"); somar(mB, "b");
      var L = ordem.map(function (k) { var l = linhas[k]; l.dif = r2(l.tb - l.ta); return l; }).filter(function (l) { return Math.abs(l.dif) > 0.004 || Math.abs(l.qa - l.qb) > 1e-6; });
      var a = lado(mA, opA, cA), b = lado(mB, opB, cB);
      return { ok: true, a: a, b: b, diferenca: r2(b.total - a.total), linhas: L };
    },

    /* ---------------------------------------------- replay (BimEdit.estender) */
    _aplicar: function (o, ctx) {
      if (!o || o.op !== "opcoes") return false;
      var E = dep("BimEdit", "./bimedit.js");
      if (E && E.opP10Valida && !E.opP10Valida(o)) return false;
      var S = estadoOpcoes(ctx), id = o.id != null ? String(o.id) : null;
      if (o.acao === "conjunto") {
        if (!S.conjuntos[id]) { S.conjuntos[id] = { id: id, nome: txt(o.nome).trim().slice(0, 80), opcoes: [], principal: null }; S.ordemC.push(id); }
        else S.conjuntos[id].nome = txt(o.nome).trim().slice(0, 80);
        return true;
      }
      if (o.acao === "opcao") {
        var c = S.conjuntos[String(o.conjunto)]; if (!c) return false;
        if (S.opcoes[id] && S.opcoes[id].conjunto !== c.id) return false;
        if (!S.opcoes[id]) { S.opcoes[id] = { id: id, conjunto: c.id, nome: "" }; c.opcoes.push(id); }
        S.opcoes[id].nome = txt(o.nome).trim().slice(0, 80);
        if (o.principal === true || !c.principal) c.principal = id;
        return true;
      }
      if (o.acao === "principal") { var op = S.opcoes[id]; if (!op) return false; S.conjuntos[op.conjunto].principal = id; return true; }
      if (o.acao === "incluir") {
        if (!S.opcoes[id]) return false;
        var algum = false;
        arr(o.ids).forEach(function (pid) { var el = acharNoCtx(ctx, pid); if (el) { el.opcaoProjeto = id; algum = true; } });
        return algum;
      }
      if (o.acao === "retirar") {
        arr(o.ids).forEach(function (pid) { var el = acharNoCtx(ctx, pid); if (el) delete el.opcaoProjeto; });
        return true;
      }
      if (o.acao === "apagar") {
        if (S.opcoes[id]) {
          /* apagar a opção apaga as peças dela */
          var oc = S.opcoes[id], cj = S.conjuntos[oc.conjunto], mortos = [];
          cadaPeca(ctx, function (el, pid) { if (el.opcaoProjeto === id) mortos.push(pid); });
          mortos.forEach(function (pid) { apagarNoCtx(ctx, pid); });
          delete S.opcoes[id]; cj.opcoes = cj.opcoes.filter(function (x) { return x !== id; });
          if (cj.principal === id) cj.principal = cj.opcoes[0] || null;
          return true;
        }
        if (S.conjuntos[id]) {
          var c2 = S.conjuntos[id], mortos2 = [];
          cadaPeca(ctx, function (el, pid) { if (c2.opcoes.indexOf(el.opcaoProjeto) >= 0) mortos2.push(pid); });
          mortos2.forEach(function (pid) { apagarNoCtx(ctx, pid); });
          c2.opcoes.forEach(function (x) { delete S.opcoes[x]; });
          delete S.conjuntos[id]; S.ordemC = S.ordemC.filter(function (x) { return x !== id; });
          return true;
        }
        return false;
      }
      if (o.acao === "aceitar") {
        /* ACEITAR PRINCIPAL: a principal vira modelo principal, as outras são apagadas */
        var c3 = S.conjuntos[id]; if (!c3 || !c3.principal) return false;
        var mortos3 = [];
        cadaPeca(ctx, function (el, pid) {
          if (el.opcaoProjeto === c3.principal) delete el.opcaoProjeto;
          else if (c3.opcoes.indexOf(el.opcaoProjeto) >= 0) mortos3.push(pid);
        });
        mortos3.forEach(function (pid) { apagarNoCtx(ctx, pid); });
        c3.opcoes.forEach(function (x) { delete S.opcoes[x]; });
        delete S.conjuntos[id]; S.ordemC = S.ordemC.filter(function (x) { return x !== id; });
        return true;
      }
      return false;
    },
    _fim: function (ctx, out) {
      var S = ctx.ext.opcoes; if (!S) return;
      var porOp = {};
      LISTAS.forEach(function (k) { arr(out[k]).forEach(function (el) { if (el && el.opcaoProjeto) (porOp[el.opcaoProjeto] = porOp[el.opcaoProjeto] || []).push(String(el.id)); }); });
      out.opcoes = { conjuntos: S.ordemC.map(function (cid) {
        var c = S.conjuntos[cid];
        return { id: cid, nome: c.nome, principal: c.principal, opcoes: c.opcoes.map(function (oid) { return { id: oid, nome: S.opcoes[oid].nome, principal: c.principal === oid, ids: (porOp[oid] || []).slice() }; }) };
      }) };
      /* "Opção de desenho" (registro): Conjunto : Opção (principal) */
      LISTAS.forEach(function (k) {
        arr(out[k]).forEach(function (el) {
          if (!el || !el.opcaoProjeto) return;
          var op = S.opcoes[el.opcaoProjeto];
          if (!op) { delete el.opcaoProjeto; return; }
          var c = S.conjuntos[op.conjunto];
          el._opcaoNome = c.nome + " : " + op.nome + (c.principal === op.id ? " (principal)" : "");
        });
      });
    }
  };

  var E0 = dep("BimEdit", "./bimedit.js");
  if (E0 && E0.estender) E0.estender({
    nome: "P10-opcoes",
    aplicar: function (o, ctx) { return BimOpcoes._aplicar(o, ctx); },
    fim: function (ctx, out) { BimOpcoes._fim(ctx, out); },
    valida: function (o) { if (!o || o.op !== "opcoes") return undefined; var E = dep("BimEdit", "./bimedit.js"); return E && E.opP10Valida ? E.opP10Valida(o) : true; }
  });

  global.BimOpcoes = BimOpcoes;
  if (typeof module !== "undefined" && module.exports) module.exports = BimOpcoes;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
