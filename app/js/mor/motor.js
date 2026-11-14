/* =====================================================================
 * mor/motor.js — O MOTOR: parâmetros da obra + respostas → linhas de orçamento
 *
 * Junta as três peças puras: geometria.js (parâmetros → grandezas), regras.js
 * (texto → número) e catalogo.js (o que existe em cada etapa). Não toca DOM, Store
 * nem base de preço: devolve LINHAS (etapa, código, descrição, unidade, quantidade,
 * a conta escrita e o carimbo `mor`). Quem casa preço é o Orçamentista; quem insere
 * no orçamento é a fiação (js/mor/ui.js).
 *
 * DOIS MODOS, MESMA ENGRENAGEM
 *   gerar(entrada)       "legado": reproduz o orçamento paramétrico antigo (OrcParam.gerar),
 *                        linha a linha — a paridade é cobrada por tools/test-orcparam.js.
 *   previaEtapa(...)     "manual": uma etapa, com as perguntas dela (padrões à vista) e a
 *                        prévia dos itens. Nada entra no orçamento aqui.
 * ⚠ Item cuja fórmula quebra NÃO some e NÃO vira zero: sai com `erro` e confiança
 *   "pendente" — quem orça vê o motivo. Quantidade `null` (depende de projeto) também.
 * Determinístico: mesma entrada + mesmo catálogo = mesmas linhas.
 * ===================================================================== */
(function (global) {
  "use strict";

  var R = global.MorRegras || (typeof require === "function" ? require("./regras.js") : null);
  var G = global.MorGeometria || (typeof require === "function" ? require("./geometria.js") : null);
  var C = global.MorCatalogo || (typeof require === "function" ? require("./catalogo.js") : null);

  var r2 = function (x) { return Math.round((Number(x) || 0) * 100) / 100; };
  function tem(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function vazio(v) { return v === undefined || v === null || v === ""; }

  function fmt(v) {
    if (typeof v === "number") return Math.floor(v) === v ? String(v) : String(r2(v)).replace(".", ",");
    return String(v);
  }
  function interpolar(txt, ctx) {
    return String(txt).replace(/\{([A-Za-z_][A-Za-z0-9_.]*)\}/g, function (m, n) { return tem(ctx, n) ? fmt(ctx[n]) : m; });
  }

  /* Resposta → valor do tipo certo, ou `undefined` se não serve (então vale o padrão). */
  function coagir(q, v) {
    if (q.bool) {
      if (v === true || v === "true" || v === "sim" || v === 1 || v === "1") return true;
      if (v === false || v === "false" || v === "nao" || v === "não" || v === 0 || v === "0") return false;
      return undefined;
    }
    if (q.num) {
      var n = G.num(v, null);
      if (n === null) return undefined;
      if ((q.min != null && n < q.min) || (q.max != null && n > q.max)) return undefined;
      return n;
    }
    if (q.op) return q.op.indexOf(v) > -1 ? v : undefined;
    return undefined;
  }

  /* Preenche `ctx` com o valor de CADA pergunta do catálogo (na ordem em que um
     padrão pode depender do anterior): a resposta dada, ou o padrão. Devolve
     { origem:{id:"resposta"|"padrao"}, avisos:[texto] }. */
  function resolver(ctx, respostas) {
    var origem = {}, avisos = [];
    C.ordemPerguntas().forEach(function (id) {
      var q = C.pergunta(id), v;
      if (respostas && tem(respostas, id) && !vazio(respostas[id])) {
        v = coagir(q, respostas[id]);
        if (v === undefined) avisos.push("A resposta «" + respostas[id] + "» para «" + q.txt + "» não vale (fora da lista ou da faixa); usei o padrão.");
        else { ctx[id] = v; origem[id] = "resposta"; return; }
      }
      if (q.padraoExpr) {
        var t = R.tentar(q.padraoExpr, ctx);
        if (t.ok) v = t.valor; else { avisos.push("Padrão de «" + q.txt + "» com erro: " + t.erro); return; }
      } else if (q.padraoDe) {
        v = q.mapa[ctx[q.padraoDe]];
        if (v === undefined) { avisos.push("Sem padrão de «" + q.txt + "» para «" + ctx[q.padraoDe] + "»."); return; }
      } else v = q.padrao;
      ctx[id] = v; origem[id] = "padrao";
    });
    return { origem: origem, avisos: avisos };
  }

  function codigoDe(it) { return it.codigos && it.codigos.length ? it.codigos[0] : ""; }

  /* os NÚMEROS de uma fórmula (F7, «Por quê?»): cada variável que a expressão usa e o valor que ela tinha */
  function variaveisDe(expr, ctx, defs) {
    var out = {}, fila = [], vistos = {}, porNome = {};
    (defs || []).forEach(function (d) { porNome[d[0]] = d[1]; });
    if (expr === null || expr === undefined) return out;
    fila.push(String(expr));
    while (fila.length) {
      (fila.shift().match(/[A-Za-z_][A-Za-z0-9_.]*/g) || []).forEach(function (nome) {
        if (vistos[nome]) return; vistos[nome] = 1;
        if (tem(ctx, nome) && (typeof ctx[nome] === "number" || typeof ctx[nome] === "boolean" || typeof ctx[nome] === "string")) out[nome] = typeof ctx[nome] === "number" ? r2(ctx[nome]) : ctx[nome];
        if (tem(porNome, nome)) fila.push(String(porNome[nome]));   /* a variável da etapa (Aalv = … − Avaos) também mostra as suas parcelas */
      });
    }
    return out;
  }

  /* Avalia UMA etapa. `base` = { ctx, p, g }. opts.pendentes: manter itens de
     quantidade `null` (manual) ou descartá-los (legado). */
  function avaliarEtapa(etapa, base, opts) {
    opts = opts || {};
    var ctx = {}, k, erros = [], linhas = [], itens = [];
    for (k in base.ctx) if (tem(base.ctx, k)) ctx[k] = base.ctx[k];
    if (etapa.geometria === "cobertura") {
      var cb = G.cobertura(base.g, base.p, ctx["cob.inclinacao"], ctx["cob.beiral"]);
      for (k in cb) if (tem(cb, k)) ctx[k] = cb[k];
    }
    etapa.vars.forEach(function (v) {
      var t = R.tentar(v[1], ctx);
      if (t.ok) ctx[v[0]] = t.valor; else erros.push(etapa.id + "." + v[0] + ": " + t.erro);
    });
    var premissas = [];
    etapa.premissas.forEach(function (p) {
      if (p.quando) { var q = R.tentar(p.quando, ctx); if (!q.ok || !q.valor) return; }
      premissas.push(interpolar(p.texto, ctx));
    });
    etapa.itens.forEach(function (it) {
      var regra = etapa.id + "." + it.chave, quando = true, tq;
      if (it.quando) {
        tq = R.tentar(it.quando, ctx);
        if (!tq.ok) { erros.push(regra + ": " + tq.erro); itens.push(item(it, regra, 0, tq.erro, premissas, "erro")); return; }
        quando = !!tq.valor;
      }
      if (!quando) return;
      if (it.qtd === null) { itens.push(item(it, regra, 0, "", premissas, "qtdpendente")); return; }
      var t = R.tentar(it.qtd, ctx);
      if (!t.ok) { erros.push(regra + ": " + t.erro); itens.push(item(it, regra, 0, t.erro, premissas, "erro")); return; }
      var q = r2(t.valor);
      if (!(q > 0)) return;     /* mesma regra do orçamento antigo: quantidade zero não gera linha */
      itens.push(item(it, regra, q, "", premissas, "ok"));
    });
    function item(it, regra, q, erro, prem, estado) {
      var cod = codigoDe(it);
      return {
        etapa: etapa.etapa,
        codigo: cod,
        fonte: cod ? "SINAPI" : "",
        descricao: it.desc,
        unidade: it.un,
        quantidade: q,
        formula: it.formula,
        parametrico: true,
        estado: estado,
        erro: erro,
        mor: {
          regra: regra, formula: it.qtd === null ? "" : it.qtd, premissas: prem.slice(), origem: "catalogo",
          qtdOrigem: it.sugestao ? "sugerido" : (it.implicito ? "implicito" : "estimado"),
          porque: it.porque ? interpolar(it.porque, ctx) : "",
          confianca: (cod && estado === "ok") ? "alta" : "pendente",
          codigos: it.codigos.slice(), intencao: it.intencao,
          vars: variaveisDe(it.qtd, ctx, etapa.vars)
        }
      };
    }
    itens.forEach(function (l) {
      if (l.estado === "qtdpendente" && !opts.pendentes) return;
      linhas.push(l);
    });
    return { etapa: etapa, linhas: linhas, erros: erros, premissas: premissas, ctx: ctx };
  }

  /* Normaliza parâmetros da obra e monta o contexto base. */
  function preparar(entrada, respostas, modo) {
    var n = G.normalizar(entrada);
    if (!n.ok) return { ok: false, erros: n.erros, premissas: n.premissas };
    var geo = G.derivar(n.p);
    var ctx = G.contexto(n.p, geo.g);
    ctx.modo = modo;
    var res = resolver(ctx, respostas);
    return { ok: true, erros: [], p: n.p, g: geo.g, ctx: ctx, premissas: n.premissas.concat(geo.premissas), origem: res.origem, avisos: res.avisos };
  }


  /* =====================================================================
   * F4 — RESOLVER PENDENTES: o item SEM código tenta, nesta ordem,
   *   1. o CASADOR (casador.js): código que já existe na base, com mesma unidade/medidas/objeto;
   *   2. o COMPOSITOR (compositor.js): composição própria por FAMÍLIA, a partir de uma irmã da SINAPI;
   *   3. continua PENDENTE, com o motivo de cada tentativa e o que faltou.
   * Nada é gravado aqui: a linha ganha `mor.origem` ("casador"|"composta"), `mor.casamento` /
   * `mor.composicao` e, se compôs, `compPropria` (o objeto PROP-AUTO-xxxx para QUEM CHAMA gravar —
   * só depois de o orçamentista aceitar). Idempotente: linha que já tem código é pulada.
   * ctx = o do Orçamentista (+ `analitico`, `resolve`, `codigosExistentes`) — ver js/mor/casador.js.
   * ===================================================================== */
  function mod(g, nome, caminho) {
    if (global[g]) return global[g];
    if (typeof require === "function") { try { return require(caminho); } catch (e) { return null; } }
    return null;
  }

  function resolverUm(it, ctx, opts) {
    opts = opts || {};
    var CAS = mod("MorCasador", "MorCasador", "./casador.js"), CMP = mod("MorCompositor", "MorCompositor", "./compositor.js");
    var out = { estado: "pendente", codigo: "", fonte: "", confianca: 0, motivo: "", casador: null, compositor: null, composicao: null };
    if (!CAS || !ctx) { out.motivo = "casador indisponível"; return out; }
    /* MEMÓRIA (F6): o que a empresa já decidiu para esta intenção vale antes de qualquer busca. A CORREÇÃO do usuário
       vence sempre; o código só vale se ainda existe na base, com preço e na mesma unidade. */
    var MEM = opts.memoria ? mod("MorMemoria", "MorMemoria", "./memoria.js") : null, memSug = [];
    if (MEM) {
      /* a chave é a DESCRIÇÃO COM AS MEDIDAS + a UNIDADE (revisão adversária): «porcelanato 60x60» ≠ «porcelanato 90x90» */
      var chaveM = it.descricao;
      var h = it.unidade ? MEM.consultarCasamento(opts.memoria, chaveM, it.unidade) : null;
      if (h && typeof ctx.obter === "function") {
        var bm = ctx.obter(h.fonte, h.codigo);
        var conf = bm ? CAS.medidasEUnidade({ descricao: it.descricao, unidade: it.unidade }, bm, ctx) : { ok: false, motivo: "o código não existe mais na base" };
        if (bm && Number(bm.custoUnitario) > 0 && conf.ok) {
          out.estado = "casado"; out.codigo = h.codigo; out.fonte = h.fonte; out.confianca = 1; out.confiancaTexto = "memória"; out.via = "memoria"; out.memoria = h;
          out.motivo = "decidido igual nas vezes anteriores (" + h.usos + " uso(s)" + (h.corrigido ? ", corrigido por você" : "") + "; mesma descrição, medidas e unidade) — confiança: memória";
          out.casador = { ok: true, sugestoes: [], via: "memoria" };
          return out;
        }
      }
      /* a memória NÃO aplicou: mas pode SUGERIR o que foi usado para o mesmo objeto (outra medida) — no topo, rotulado «memória» */
      memSug = [];
      if (it.unidade && typeof ctx.obter === "function") MEM.sugerirCasamentos(opts.memoria, chaveM, it.unidade).forEach(function (g) {
        var bg = ctx.obter(g.fonte, g.codigo);
        var ukS = ctx.unidadeChave || function (u) { return String(u || "").toLowerCase(); };
        if (bg && Number(bg.custoUnitario) > 0 && ukS(bg.unidade) === ukS(it.unidade)) memSug.push({ codigo: String(g.codigo), fonte: g.fonte, descricao: bg.descricao, unidade: bg.unidade, custoUnitario: bg.custoUnitario, confianca: 0.95, memoria: true, aviso: "memória: usado antes para «" + String(g.intencao).slice(0, 50) + "» — confira a medida" });
      });
      var cm = it.unidade ? MEM.composicaoDaMemoria(opts.memoria, chaveM, it.unidade) : null;
      if (cm) {
        var og = cm.origem || {};
        out.estado = "composto"; out.codigo = cm.comp.codigo; out.fonte = "PROPRIA"; out.confianca = 0.9; out.confiancaTexto = "memória"; out.via = "memoria";
        out.composicao = { ok: true, comp: cm.comp, familia: og.familia || "", referencia: og.referencia || {}, regras: og.regras || [], premissas: [], confianca: "alta", daMemoria: true };
        out.motivo = "composição aceita antes (" + cm.usos + " uso(s)) — confiança: memória";
        return out;
      }
    }
    var c = CAS.casar({ descricao: it.descricao, unidade: it.unidade, intencao: it.intencao }, ctx, opts.casador);
    if (!c.ok && memSug.length) c.sugestoes = memSug.concat((c.sugestoes || []).filter(function (g) { return !memSug.some(function (m2) { return String(m2.codigo) === String(g.codigo); }); })).slice(0, 3);
    out.casador = c;
    if (c.ok) {
      out.estado = "casado"; out.codigo = c.codigo; out.fonte = c.fonte; out.confianca = c.confianca; out.motivo = c.motivo;
      return out;
    }
    if (CMP && ctx.analitico && ctx.analitico.length) {
      ctx._morComp = ctx._morComp || {};
      var chave = String(it.descricao).replace(/\s+/g, " ").toUpperCase() + "|" + String(it.unidade || "").toLowerCase();
      var k = ctx._morComp[chave];
      if (!k) { k = CMP.compor(it.descricao, it.unidade, ctx, opts.compositor); ctx._morComp[chave] = k; if (k.ok) { ctx.codigosExistentes = (ctx.codigosExistentes || []).concat([k.comp.codigo]); } }
      out.compositor = k;
      if (k.ok) {
        out.estado = "composto"; out.codigo = k.comp.codigo; out.fonte = "PROPRIA"; out.confianca = k.confianca === "alta" ? 0.9 : 0.6; out.composicao = k;
        out.motivo = "composição própria " + k.comp.codigo + " (família " + k.familia + ", referência SINAPI " + k.referencia.codigo + ")";
        return out;
      }
    }
    out.motivo = "casador: " + c.motivo + (out.compositor ? " · compositor: " + out.compositor.motivo : "");
    return out;
  }

  var Mor = {
    r2: r2, interpolar: interpolar,

    /* Orçamento paramétrico no formato de OrcParam.gerar (paridade). */
    gerar: function (entrada) {
      var n = G.normalizar(entrada);
      if (!n.ok) return { ok: false, erros: n.erros, linhas: [], premissas: n.premissas };
      var pr = preparar(entrada, G.respostasLegado(n.p), "legado");
      var linhas = [], erros = [], prem = pr.premissas.slice();
      C.etapas().forEach(function (e) {
        if (e.novo) return;   /* etapa criada na F3: não existe no orçamento antigo (a paridade é só das 13 de lá) */
        var r = avaliarEtapa(e, pr, { pendentes: false });
        r.linhas.forEach(function (l) { linhas.push(l); });
        r.erros.forEach(function (x) { erros.push(x); });
        r.premissas.forEach(function (x) { if (prem.indexOf(x) < 0 && /^(Elétrica|Hidráulica):/.test(x)) prem.push(x); });
      });
      return { ok: true, erros: [], p: pr.p, g: pr.g, linhas: linhas, premissas: prem, pendencias: erros };
    },

    resolverUm: resolverUm,

    /* Aplica resolverUm às linhas SEM código de uma prévia/geração. Devolve o relatório
       { total, casados, compostos, pendentes, itens:[{regra, descricao, estado, codigo, motivo}] }. */
    resolverPendentes: function (linhas, ctx, opts) {
      var rel = { total: 0, casados: 0, compostos: 0, pendentes: 0, itens: [] };
      (linhas || []).forEach(function (l) {
        if (l.codigo || l.estado === "erro") return;
        rel.total++;
        var r = resolverUm({ descricao: l.descricao, unidade: l.unidade, intencao: l.mor && l.mor.intencao }, ctx, opts);
        l.mor = l.mor || {};
        if (r.estado === "casado") {
          l.codigo = r.codigo; l.fonte = r.fonte; l.mor.origem = "casador";
          l.mor.confianca = (l.estado === "ok" && r.confianca >= 0.9) ? "alta" : (l.estado === "ok" ? "media" : "pendente");
          l.mor.casamento = { confianca: r.confianca, motivo: r.motivo, sugestoes: r.casador.sugestoes || [] };
          rel.casados++;
        } else if (r.estado === "composto") {
          l.codigo = r.codigo; l.fonte = "PROPRIA"; l.mor.origem = "composta";
          l.mor.confianca = l.estado === "ok" ? "media" : "pendente";
          l.mor.composicao = { codigo: r.codigo, familia: r.composicao.familia, referencia: r.composicao.referencia, regras: r.composicao.regras, premissas: r.composicao.premissas, confianca: r.composicao.confianca };
          l.compPropria = r.composicao.comp;
          if (r.composicao.conferir) { l.mor.conferirMotivo = "custo total da família divergiu até " + r.composicao.erroCustoMedido + "% da SINAPI nos ensaios"; l.mor.confianca = "media"; }
          rel.compostos++;
        } else {
          l.mor.pendencia = {
            casador: r.casador ? r.casador.motivo : "", sugestoes: r.casador ? (r.casador.sugestoes || []) : [],
            compositor: r.compositor ? r.compositor.motivo : "", faltou: r.compositor ? (r.compositor.faltou || []) : []
          };
          rel.pendentes++;
        }
        rel.itens.push({ regra: l.mor.regra || "", descricao: l.descricao, estado: r.estado, codigo: r.codigo, confianca: r.confianca, motivo: r.motivo });
      });
      return rel;
    },

    /* O mesmo, sobre os itens SEM código do CATÁLOGO (independente de obra/quantidade). */
    resolverCatalogo: function (ctx, opts) {
      var linhas = [];
      C.etapas().forEach(function (e) {
        e.itens.forEach(function (it) {
          if (it.codigos && it.codigos.length) return;
          linhas.push({ etapa: e.etapa, codigo: "", fonte: "", descricao: it.desc, unidade: it.un, estado: "ok", mor: { regra: e.id + "." + it.chave, intencao: it.intencao, confianca: "pendente" } });
        });
      });
      var rel = Mor.resolverPendentes(linhas, ctx, opts);
      rel.linhas = linhas;
      return rel;
    },

    /* Prévia de UMA etapa no Manual acelerado.
       obra = parâmetros da obra (os mesmos de OrcParam: area, pavimentos, peDireito,
       padrao, banheiros, quartos, perimetro, tipo[geometria]); respostas = { idPergunta: valor }.
       Devolve { ok, erros, perguntas:[{id,txt,tipo,op,rotulos,valor,padrao,respondida,min,max}],
                 itens:[linha], pendencias:[texto], premissas:[texto] }. */
    previaEtapa: function (etapaId, obra, respostas) {
      var e = C.etapa(etapaId);
      if (!e) return { ok: false, erros: ["Etapa «" + etapaId + "» não existe no catálogo."], perguntas: [], itens: [] };
      var pr = preparar(obra, respostas || {}, "manual");
      if (!pr.ok) return { ok: false, erros: pr.erros, perguntas: [], itens: [], precisaObra: true };
      var r = avaliarEtapa(e, pr, { pendentes: true });
      var ids = e.perguntas.map(function (q) { return q.id; });
      e.usa.forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
      var perguntas = [];
      ids.forEach(function (id) {
        var q = C.pergunta(id); if (!q) return;
        if (q.quando) { var t = R.tentar(q.quando, pr.ctx); if (t.ok && !t.valor) return; }
        perguntas.push({
          id: id, txt: q.txt, tipo: q.op ? "op" : (q.num ? "num" : "bool"), op: q.op || null, rotulos: q.rotulos || null,
          valor: pr.ctx[id], respondida: pr.origem[id] === "resposta", min: q.min, max: q.max
        });
      });
      return { ok: true, erros: [], perguntas: perguntas, itens: r.linhas, pendencias: r.erros, premissas: pr.premissas.concat(r.premissas), avisos: pr.avisos, p: pr.p, g: pr.g };
    }
  };

  Mor._interno = { resolver: resolver, avaliarEtapa: avaliarEtapa, preparar: preparar, coagir: coagir };
  if (typeof module !== "undefined" && module.exports) module.exports = Mor;
  global.Mor = Mor;
})(typeof window !== "undefined" ? window : globalThis);
