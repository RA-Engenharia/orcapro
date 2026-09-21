/* =====================================================================
 * orcamentista.js — AGENTE ORÇAMENTISTA (motor PURO, Node-testável).
 *
 * O QUE ELE FAZ (v1.2.83). Recebe os itens que o Importador tirou de uma
 * planilha orçamentária (código cru, fonte declarada, descrição, unidade,
 * quantidade) e, para CADA item, decide como precificar — na ordem que um
 * orçamentista experiente seguiria:
 *
 *   1. CÓDIGO NA BASE DECLARADA   — a planilha diz "SINAPI 101567": busca
 *                                   exatamente ali. Casou = 100%.
 *   2. CÓDIGO NAS BASES ESCOLHIDAS — sem fonte declarada, o formato do código
 *                                   dá a pista (02.06.020 é CPOS/CDHU) e a
 *                                   varredura segue a ORDEM que o usuário
 *                                   escolheu. A descrição da planilha tem de
 *                                   parecer com a da base — número igual em
 *                                   base diferente não é o mesmo serviço.
 *   3. DESCRIÇÃO IDÊNTICA           — código errado/truncado ("9845" no lugar
 *                                   de 91845) mas descrição literal da base.
 *   4. DESCRIÇÃO PARECIDA           — busca por termos + similaridade; acima
 *                                   do limiar aplica, na faixa média pede
 *                                   revisão com até 3 candidatos e a razão.
 *   5. COMPOSIÇÃO PRÓPRIA           — nada casou: o criador de composições
 *                                   (js/composicaopropria.js) monta a
 *                                   composição por ANALOGIA com a base
 *                                   analítica — insumos, coeficientes e preço
 *                                   reais, unidade da planilha — para o
 *                                   analítico existir desde o primeiro dia.
 *   6. PENDENTE                     — sem análoga: a composição nasce como
 *                                   casca (descrição + unidade), sem insumo
 *                                   inventado, e o item fica marcado.
 *
 * DOUTRINA (a mesma do Escopo e do criador): NUNCA inventa código, coeficiente
 * ou preço. Toda decisão sai com `via`, `confianca`, `motivo` e `rastreio`.
 * A IA (servidor) só entra no RESÍDUO e só escolhe entre o que o motor achou
 * — ver `refinarComIA` no app e `validarComposicaoIA` aqui.
 *
 * Não toca DOM, Store nem rede: tudo o que precisa das bases entra por `ctx`:
 *   ctx.fontes        ["SINAPI","CPOS","SBC",…] ordem de varredura (obrigatório)
 *   ctx.obter(f, cod) item da base f pelo código (ou null)
 *   ctx.buscar(txt, {fontes,max}) [{item,fonte}] busca por termos
 *   ctx.itensDe(f)    (opcional) lista completa da base f — índice por descrição
 *   ctx.elaborar(desc, {unidade}) (opcional) ComposicaoPropria.elaborar já
 *                     amarrado ao analítico; devolve {ok,comp,custo,referencia,confianca,aviso}
 *   ctx.normalizar(s), ctx.unidadeChave(u) (opcionais; há fallback)
 *   ctx.limiares      { auto:0.78, revisar:0.42 } (opcional)
 * ===================================================================== */
(function (global) {
  "use strict";

  /* Formatos de código que dão a pista da base. `fonte` é a base provável;
     `certeza` diz o quanto o formato sozinho prova alguma coisa (numérico
     puro é ambíguo: SINAPI, SBC e várias tabelas municipais usam número). */
  var PADROES = [
    { id: "CPOS", re: /^\d{2}\.\d{2}\.\d{3}$/, fonte: "CPOS", aliases: ["CDHU"], certeza: 0.9, rotulo: "CPOS/CDHU-SP (NN.NN.NNN)" },
    { id: "SICRO", re: /^\d{7}$/, fonte: "SICRO", aliases: [], certeza: 0.5, rotulo: "SICRO (7 dígitos)" },
    { id: "SINAPI", re: /^\d{3,6}$/, fonte: "SINAPI", aliases: [], certeza: 0.6, rotulo: "SINAPI (numérico)" },
    { id: "ALFA", re: /^[A-Z]\.\d{2}\.\d{3}\.\d{6}$/i, fonte: null, aliases: [], certeza: 0, rotulo: "tabela estadual (L.NN.NNN.NNNNNN) — informe a base" },
    { id: "OUTRO", re: /./, fonte: null, aliases: [], certeza: 0, rotulo: "formato não reconhecido" }
  ];
  var ALIAS_FONTE = { CDHU: "CPOS", "CPOS/CDHU": "CPOS", "SINAPI DESONERADA": "SINAPI", "SINAPI_DES": "SINAPI", PROPRIO: "PROPRIA", "COMPOSICAO PROPRIA": "PROPRIA", COTACAO: "PROPRIA", MERCADO: "PROPRIA" };

  var STOP = { de: 1, da: 1, do: 1, das: 1, dos: 1, em: 1, e: 1, ou: 1, a: 1, o: 1, as: 1, os: 1, para: 1, com: 1, sem: 1, por: 1, no: 1, na: 1, nos: 1, nas: 1, um: 1, uma: 1, ate: 1, tipo: 1, inclusive: 1, ref: 1, af: 1, "-": 1, fornecimento: 1, instalacao: 1, execucao: 1, ou_equivalente: 1 };

  function normFallback(s) {
    s = String(s == null ? "" : s).toLowerCase();
    try { s = s.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
    return s.replace(/[^a-z0-9%\/,.]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function unidFallback(u) {
    var k = normFallback(String(u == null ? "" : u).replace(/²/g, "2").replace(/³/g, "3")).replace(/\s+/g, "");
    var map = { m2: "m2", "m²": "m2", m3: "m3", "m³": "m3", und: "un", unid: "un", unidade: "un", pc: "un", peca: "un", ml: "m", metro: "m", kg: "kg", h: "h", hora: "h", mes: "mes", "un/mes": "mes", cj: "cj", conjunto: "cj", vb: "vb", verba: "vb", l: "l", t: "t", dia: "dia", km: "km", par: "par", cx: "cx" };
    return map[k] || k;
  }

  var Orcamentista = {
    VERSAO: "1.0",
    PADROES: PADROES,
    LIMIARES: { auto: 0.78, revisar: 0.42, codigoDescricao: 0.22 },

    normalizarFonte: function (f) {
      var s = String(f == null ? "" : f).trim().toUpperCase().replace(/\s+/g, " ");
      if (!s) return "";
      if (ALIAS_FONTE[s]) return ALIAS_FONTE[s];
      s = s.replace(/[^A-Z0-9_]/g, "");
      return ALIAS_FONTE[s] || s;
    },

    /* Reconhece o código cru: formato, base provável e certeza. */
    reconhecer: function (codigo, fonteDeclarada) {
      var cod = String(codigo == null ? "" : codigo).trim();
      var fd = this.normalizarFonte(fonteDeclarada);
      var out = { codigo: cod, fonteDeclarada: fd, fonteProvavel: fd || null, padrao: null, certeza: fd ? 1 : 0, rotulo: "" };
      if (!cod) return out;
      for (var i = 0; i < PADROES.length; i++) {
        if (PADROES[i].re.test(cod)) {
          out.padrao = PADROES[i].id; out.rotulo = PADROES[i].rotulo;
          if (!fd) { out.fonteProvavel = PADROES[i].fonte; out.certeza = PADROES[i].certeza; }
          break;
        }
      }
      return out;
    },

    /* Variantes do mesmo código que uma planilha costuma estragar: zero à
       esquerda perdido pelo Excel ("003247" → "3247"), ".0" de célula
       numérica, espaços. Nunca acrescenta dígito diferente de zero. */
    variantes: function (codigo) {
      var cod = String(codigo == null ? "" : codigo).trim().replace(/\s+/g, ""), out = [];
      var add = function (c) { if (c && out.indexOf(c) < 0) out.push(c); };
      add(cod);
      if (/^\d+\.0+$/.test(cod)) add(cod.replace(/\.0+$/, ""));
      if (/^0+\d+$/.test(cod)) add(cod.replace(/^0+/, ""));
      if (/^\d{1,5}$/.test(cod)) { add(("000000" + cod).slice(-6)); add(("00000" + cod).slice(-5)); }
      return out;
    },

    tokens: function (s, norm) {
      var n = (norm || normFallback)(s).replace(/[\/,.]+/g, " ");
      var out = [], seen = {};
      n.split(" ").forEach(function (t) {
        if (!t || t.length < 2 || STOP[t]) return;
        if (/^af_?\d/.test(t)) return;           // AF_03/2023 (carimbo da CAIXA)
        if (seen[t]) return; seen[t] = 1; out.push(t);
      });
      return out;
    },

    /* Similaridade 0..1 entre a descrição da planilha (a) e a da base (b).
       Cobertura dos termos de A em B pesa mais (o que a pessoa pediu tem de
       estar lá); números (25 mm, fck 25, 3/4) são obrigatórios — descrição
       que perde o número muda o serviço. Unidade igual dá bônus. */
    similaridade: function (a, b, unA, unB, ctx) {
      var norm = (ctx && ctx.normalizar) || normFallback, uk = (ctx && ctx.unidadeChave) || unidFallback;
      var ta = this.tokens(a, norm), tb = this.tokens(b, norm);
      if (!ta.length || !tb.length) return 0;
      var setB = {}, setA = {}; tb.forEach(function (t) { setB[t] = 1; }); ta.forEach(function (t) { setA[t] = 1; });
      var emB = 0, numA = 0, numOk = 0;
      ta.forEach(function (t) {
        var hit = !!setB[t] || (t.length >= 5 && tb.some(function (x) { return x.indexOf(t) === 0 || t.indexOf(x) === 0 && x.length >= 5; }));
        if (hit) emB++;
        if (/\d/.test(t)) { numA++; if (hit) numOk++; }
      });
      var emA = 0; tb.forEach(function (t) { if (setA[t]) emA++; });
      var cobA = emB / ta.length, cobB = emA / tb.length;
      var score = cobA * 0.6 + cobB * 0.3;
      if (unA && unB) { if (uk(unA) === uk(unB)) score += 0.1; else score *= 0.75; }
      if (numA && numOk < numA) score *= 0.7;
      /* CABEÇA DO OBJETO: "Placa cerâmica…" não é "Rodapé em placa cerâmica…"
         mesmo que todas as palavras de uma estejam na outra. A primeira
         palavra de cada descrição é o objeto; objeto de um lado ausente do
         outro derruba a nota (não descarta — a base raramente usa a mesma
         palavra que o engenheiro). */
      if (!setB[ta[0]]) score *= 0.85;
      if (!setA[tb[0]]) score *= 0.85;
      return Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));
    },

    /* Termos de busca: os mais específicos primeiro (mais longos, com número). */
    termosDeBusca: function (desc, norm) {
      var ts = this.tokens(desc, norm).slice();
      /* palavras primeiro (as mais longas são as mais específicas); número
         entra só como refinamento — "500 50 fyk" não acha armadura nenhuma */
      ts.sort(function (x, y) { var nx = /\d/.test(x) ? 1 : 0, ny = /\d/.test(y) ? 1 : 0; if (nx !== ny) return nx - ny; return y.length - x.length; });
      return ts;
    },

    /* Índice descrição normalizada → [{item,fonte}] (montado uma vez por ctx). */
    _indiceDescricao: function (ctx) {
      if (ctx._idxDesc) return ctx._idxDesc;
      var norm = ctx.normalizar || normFallback, idx = {};
      if (typeof ctx.itensDe === "function") {
        (ctx.fontes || []).forEach(function (f) {
          var lista = ctx.itensDe(f) || [];
          for (var i = 0; i < lista.length; i++) {
            var k = norm(lista[i].descricao || "").replace(/\s+/g, " ");
            if (!k) continue;
            (idx[k] = idx[k] || []).push({ item: lista[i], fonte: f });
          }
        });
      }
      ctx._idxDesc = idx;
      return idx;
    },

    _linha: function (it, etapaIdx, i) {
      return {
        i: i, etapaIdx: etapaIdx, item: it,
        codigoLido: String(it.codigo || ""), fonteLida: this.normalizarFonte(it.fonte),
        status: "pendente", via: "nenhum", fonte: "", codigo: "", descricaoBase: "", unidadeBase: "",
        custoUnitario: 0, custoMO: 0, custoMAT: 0, custoEQ: 0, confianca: 0, motivo: "",
        candidatos: [], escolhido: -1, comp: null, referencia: null, avisos: [], rastreio: []
      };
    },

    /* ⚠ O APELIDO INTERPRETA A PLANILHA; NÃO RENOMEIA A BASE DO CLIENTE
       (21/09/2026). Aqui o `normalizarFonte` passava por TODAS as fontes,
       inclusive pelos nomes das bases carregadas (`ctx.fontes`). "CDHU" é
       apelido de "CPOS" — e também é um rótulo REAL da lista de bases
       (js/bases.js: "CDHU-SP"), o nome que o boletim tem hoje. Quem importava
       o boletim dele como CDHU-SP tinha a base procurada sob o nome "CPOS",
       que não existia: `ctx.obter("CPOS", cod)` → null em todo item, e a
       planilha inteira saía PENDENTE, 0%, com a base certa carregada. Medido
       nas seis combinações (base CPOS|CDHU × planilha CPOS|CDHU|nada): as três
       com a base como CDHU davam pendente.
       Agora: nome de base carregada entra COMO ESTÁ (é o que o `ctx.obter`
       conhece); a fonte declarada e a provável puxam primeiro as bases
       carregadas da MESMA família, pelo nome real, e depois o nome canônico. */
    _fontesParaVarrer: function (rec, ctx) {
      var self = this, ordem = [], add = function (f) { if (f && ordem.indexOf(f) < 0) ordem.push(f); };
      var carregadas = this._nomesDeBase(ctx.fontes);
      [rec.fonteDeclarada, rec.fonteProvavel].forEach(function (alvo) {
        if (!alvo) return;
        carregadas.forEach(function (f) { if (self.normalizarFonte(f) === alvo) add(f); });
        add(alvo);
      });
      carregadas.forEach(add);
      return ordem;
    },
    /* ⚠ NOME DE BASE CARREGADA NÃO PASSA PELO APELIDO. O `planejar` e o
       `planejarAsync` faziam `ctx.fontes.map(normalizarFonte)` na entrada: a
       base "CDHU" virava "CPOS" para o motor INTEIRO — código, índice por
       descrição e busca por termos procuravam numa base que não existia. O
       nome vale como veio: é a chave que o `ctx.obter`/`ctx.buscar` conhecem. */
    _nomesDeBase: function (fontes) {
      var out = [];
      (fontes || []).forEach(function (f) { f = String(f == null ? "" : f).trim(); if (f && out.indexOf(f) < 0) out.push(f); });
      return out;
    },
    /* a MESMA base com dois nomes (CPOS e CDHU): "declarada" se decide pela família */
    _mesmaFonte: function (a, b) { return !!a && !!b && this.normalizarFonte(a) === this.normalizarFonte(b); },

    /* Aplica um candidato à linha (usado pelo motor e pela UI quando a pessoa troca). */
    aplicarCandidato: function (linha, idx, via, ctx) {
      var c = linha.candidatos[idx]; if (!c) return linha;
      var uk = (ctx && ctx.unidadeChave) || unidFallback;
      linha.escolhido = idx; linha.fonte = c.fonte; linha.codigo = String(c.item.codigo);
      linha.descricaoBase = c.item.descricao || ""; linha.unidadeBase = c.item.unidade || "";
      linha.custoUnitario = Number(c.item.custoUnitario) || 0;
      linha.custoMO = Number(c.item.custoMO) || 0; linha.custoMAT = Number(c.item.custoMAT) || 0; linha.custoEQ = Number(c.item.custoEQ) || 0;
      linha.confianca = Math.round(c.score * 100); linha.motivo = c.motivo; linha.via = via || c.via || linha.via;
      linha.comp = null; linha.referencia = null;
      linha.status = "casado";
      linha.avisos = linha.avisos.filter(function (a) { return a.indexOf("Unidade") !== 0 && a.indexOf("Sem preço") !== 0; });
      var uP = linha.item.unidade, uB = c.item.unidade;
      if (uP && uB && uk(uP) !== uk(uB)) { linha.avisos.push("Unidade da planilha (" + uP + ") difere da base (" + uB + ") — confira a quantidade."); linha.status = "revisar"; }
      if (!(linha.custoUnitario > 0)) { linha.avisos.push("Sem preço na base para este código — informe a cotação."); linha.status = "revisar"; }
      if (c.item.bdiIncluso > 0) linha.avisos.push("Preço da tabela " + c.fonte + " publicado COM BDI de " + c.item.bdiIncluso + "% — usado o custo direto (sem BDI) para o seu BDI não dobrar.");
      return linha;
    },

    /* Um item. Devolve a linha decidida. */
    decidir: function (it, etapaIdx, i, ctx) {
      var self = this, L = this._linha(it, etapaIdx, i), lim = ctx.limiares || this.LIMIARES;
      var norm = ctx.normalizar || normFallback;
      var rec = this.reconhecer(L.codigoLido, L.fonteLida);
      L.reconhecimento = rec;
      var desc = String(it.descricao || "").trim();
      var trace = function (s) { L.rastreio.push(s); };

      // ---- 1/2. CÓDIGO ----
      if (rec.codigo && typeof ctx.obter === "function") {
        var fontes = this._fontesParaVarrer(rec, ctx), vars = this.variantes(rec.codigo), achou = [];
        trace("código " + rec.codigo + (rec.fonteDeclarada ? " (fonte declarada " + rec.fonteDeclarada + ")" : (rec.fonteProvavel ? " (formato sugere " + rec.fonteProvavel + ")" : "")) + " — varrendo " + fontes.join(" › "));
        for (var f = 0; f < fontes.length; f++) {
          for (var v = 0; v < vars.length; v++) {
            var item = ctx.obter(fontes[f], vars[v]);
            if (item) { achou.push({ fonte: fontes[f], item: item, variante: vars[v] }); break; }
          }
          if (achou.length && self._mesmaFonte(rec.fonteDeclarada, fontes[f])) break; // declarada (pela família) e achou: não procura mais
        }
        if (achou.length) {
          achou.forEach(function (a) {
            var sim = desc ? self.similaridade(desc, a.item.descricao, it.unidade, a.item.unidade, ctx) : 1;
            var declarada = self._mesmaFonte(rec.fonteDeclarada, a.fonte), bate = sim >= lim.codigoDescricao || !desc;
            var score = declarada ? (bate ? 1 : 0.5) : (bate ? 0.95 : 0.35);
            var motivo = declarada ? (bate ? "código informado na base declarada (" + a.fonte + ")" : "código " + rec.codigo + " existe na base " + a.fonte + " mas descreve OUTRO serviço — confira") :
              (bate ? "código encontrado na base " + a.fonte + " (descrição compatível)" : "código existe em " + a.fonte + " mas descreve outro serviço");
            if (a.variante !== rec.codigo) motivo += " · lido como " + a.variante;
            L.candidatos.push({ fonte: a.fonte, item: a.item, score: score, sim: sim, motivo: motivo, via: declarada ? "codigo" : "codigo-inferido" });
          });
          L.candidatos.sort(function (x, y) { return y.score - x.score; });
          var best = L.candidatos[0];
          if (best.score >= 0.9) { this.aplicarCandidato(L, 0, best.via, ctx); trace("casou: " + best.motivo); return L; }
          /* declarada, achou, mas a descrição é OUTRA (ex.: planilha diz
             "SINAPI 101567 entrada de energia" e a 101567 da competência é cabo
             de cobre): código digitado errado ou composição renumerada. Não
             aceita calado — vira revisão com o candidato do código E os da
             descrição, para a pessoa decidir. */
          if (best.via === "codigo") { best.score = 0.5; best.motivo = "código " + rec.codigo + " existe na base " + best.fonte + " mas descreve OUTRO serviço — confira"; }
          trace("código achado em " + best.fonte + " mas a descrição não bate (sim " + best.sim + ") — segue pela descrição");
        } else trace("código não existe em nenhuma das bases escolhidas");
      }

      // ---- 3. DESCRIÇÃO IDÊNTICA ----
      if (desc) {
        var idx = this._indiceDescricao(ctx), k = norm(desc).replace(/\s+/g, " ");
        var exatos = idx[k] || [];
        if (exatos.length) {
          var ex = exatos[0];
          for (var e2 = 0; e2 < exatos.length; e2++) if ((ctx.fontes || []).indexOf(exatos[e2].fonte) < (ctx.fontes || []).indexOf(ex.fonte)) ex = exatos[e2];
          L.candidatos.unshift({ fonte: ex.fonte, item: ex.item, score: 0.98, sim: 1, motivo: "descrição idêntica à da base " + ex.fonte + (L.codigoLido ? " (código " + L.codigoLido + " da planilha não confere — corrigido para " + ex.item.codigo + ")" : ""), via: "descricao-exata" });
          this.aplicarCandidato(L, 0, "descricao-exata", ctx);
          if (L.codigoLido && String(ex.item.codigo) !== L.codigoLido) L.avisos.push("Código da planilha (" + L.codigoLido + ") substituído por " + ex.item.codigo + " — descrição idêntica na base " + ex.fonte + ".");
          trace("descrição idêntica em " + ex.fonte + " → " + ex.item.codigo);
          return L;
        }
      }

      // ---- 4. DESCRIÇÃO PARECIDA ----
      if (desc && typeof ctx.buscar === "function") {
        var termos = this.termosDeBusca(desc, norm), vistos = {}, cands = [];
        var consultas = [], nums = termos.filter(function (t) { return /\d/.test(t); }), pal = termos.filter(function (t) { return !/\d/.test(t); });
        if (pal.length >= 3) consultas.push(pal.slice(0, 3).join(" "));
        if (pal.length >= 2) { consultas.push(pal.slice(0, 2).join(" ")); consultas.push(pal[0] + " " + pal[pal.length - 1]); }
        if (pal.length >= 3) consultas.push(pal[1] + " " + pal[2]);
        if (pal.length && nums.length) consultas.push(pal[0] + " " + nums[0]);
        if (pal.length) consultas.push(pal[0]);
        if (!pal.length && termos.length) consultas.push(termos[0]);
        /* dicionário do Escopo (ctx.sinonimos: termo → termo da base): "armadura"
           → "armacao", "azulejo" → "ceramico". Só acrescenta consultas; a nota
           continua sendo a similaridade com a descrição ORIGINAL. */
        if (ctx.sinonimos) {
          var trad = pal.map(function (t) { var v = ctx.sinonimos[t]; return v ? String(v).split(/\s+/)[0] : t; });
          if (trad.join(" ") !== pal.join(" ")) { if (trad.length >= 2) consultas.push(trad.slice(0, 2).join(" ")); consultas.push(trad[0]); }
        }
        consultas.forEach(function (q) {
          if (cands.length >= 240) return;
          (ctx.buscar(q, { fontes: ctx.fontes, max: q.indexOf(" ") < 0 ? 200 : 120 }) || []).forEach(function (r) {
            var key = r.fonte + ":" + r.item.codigo; if (vistos[key]) return; vistos[key] = 1;
            var sim = self.similaridade(desc, r.item.descricao, it.unidade, r.item.unidade, ctx);
            cands.push({ fonte: r.fonte, item: r.item, score: sim, sim: sim, motivo: "busca por descrição (similaridade " + Math.round(sim * 100) + "%)", via: "descricao" });
          });
        });
        cands.sort(function (x, y) { return y.score - x.score; });
        var top = cands.slice(0, 3);
        // candidatos vindos do código (descrição incompatível) ficam depois dos da descrição
        L.candidatos = top.concat(L.candidatos.filter(function (c) { return !vistos[c.fonte + ":" + c.item.codigo]; })).slice(0, 4);
        var codDivergente = L.candidatos.some(function (c) { return c.via === "codigo" && c.score === 0.5; });
        if (top.length && top[0].score >= lim.auto && !codDivergente) {
          this.aplicarCandidato(L, 0, "descricao", ctx); trace("descrição parecida (" + Math.round(top[0].score * 100) + "%) → " + top[0].fonte + " " + top[0].item.codigo);
          return L;
        }
        if (codDivergente) {
          this.aplicarCandidato(L, 0, L.candidatos[0].via === "codigo" ? "codigo" : "descricao", ctx);
          L.status = "revisar";
          L.avisos.push("O código " + rec.codigo + " existe na base " + rec.fonteDeclarada + " mas descreve outro serviço — escolha entre o código e a descrição.");
          trace("código divergente da descrição — revisar");
          return L;
        }
        if (top.length && top[0].score >= lim.revisar) {
          this.aplicarCandidato(L, 0, "descricao", ctx);
          L.status = "revisar";
          L.avisos.push("Semelhança média (" + Math.round(top[0].score * 100) + "%) — confira o candidato ou escolha outro.");
          trace("candidato médio (" + Math.round(top[0].score * 100) + "%) — revisar");
          return L;
        }
        trace(top.length ? "melhor candidato fraco (" + Math.round(top[0].score * 100) + "%)" : "busca por descrição sem resultado");
      }

      // ---- 5. COMPOSIÇÃO PRÓPRIA POR ANALOGIA ----
      if (desc && typeof ctx.elaborar === "function") {
        var uk = ctx.unidadeChave || unidFallback;
        ctx._compCache = ctx._compCache || {}; ctx.codigosGerados = ctx.codigosGerados || [];
        var chave = norm(desc) + "|" + uk(it.unidade || "");
        var cached = ctx._compCache[chave];
        if (cached) {
          /* a MESMA descrição repetida na planilha (Emboço comum em 3 etapas)
             é UMA composição, não três clones */
          L.status = "propria"; L.via = "analogia"; L.fonte = "PROPRIA"; L.comp = cached.comp; L.referencia = cached.referencia;
          L.codigo = cached.comp.codigo; L.descricaoBase = cached.comp.descricao; L.unidadeBase = cached.comp.unidade;
          L.custoUnitario = cached.custoUnitario; L.custoMO = cached.custoMO; L.custoMAT = cached.custoMAT; L.custoEQ = cached.custoEQ;
          L.confianca = cached.confianca; L.motivo = cached.motivo + " (mesma composição do item " + cached.i + ")"; L.avisos = cached.avisos.slice(); L.compartilhada = true;
          trace("reusa a composição própria do item " + cached.i);
          return L;
        }
        var r = null;
        try { r = ctx.elaborar(desc, { unidade: it.unidade || "", codigosExistentes: ctx.codigosGerados.slice() }); } catch (eEl) { r = { ok: false, erro: String(eEl && eEl.message || eEl) }; }
        if (r && r.ok && r.comp && (r.comp.insumos || []).length) {
          var ref = r.referencia || {}, refUnid = ref.unidade || "", unidOk = !it.unidade || !refUnid || uk(refUnid) === uk(it.unidade);
          var refScore = Number(ref.score) || 0;
          if (!unidOk) {
            /* coeficiente é POR UNIDADE da referência: análoga em UN não serve
               para item em kg. Fica como sugestão fraca, e o item vai a pendente. */
            L.candidatos.push({ fonte: "SINAPI", item: { codigo: ref.codigo, descricao: ref.descricao, unidade: refUnid, custoUnitario: (r.rota && r.rota.preco) || 0 }, score: Math.round(refScore * 50) / 100, sim: refScore, motivo: "análoga mais próxima, mas a unidade difere (" + refUnid + " × " + it.unidade + ") — coeficientes não se transferem", via: "descricao" });
            L.avisos.push("A análoga " + ref.codigo + " é por " + refUnid + " e o item é por " + it.unidade + " — não dá para copiar os coeficientes.");
            trace("análoga " + ref.codigo + " com unidade diferente — pendente");
          } else if (r.rota && r.rota.tipo === "oficial" && r.rota.preco > 0 && r.rota.codigo) {
            /* a base JÁ precifica a referência: o certo é o código oficial,
               não um clone PROP-xxxx congelado na competência de hoje */
            L.candidatos.unshift({ fonte: "SINAPI", item: { codigo: r.rota.codigo, descricao: r.rota.descricao || ref.descricao, unidade: r.rota.unidade || refUnid, custoUnitario: r.rota.preco, custoMO: 0, custoMAT: 0, custoEQ: 0 }, score: Math.max(0.42, Math.min(0.77, refScore)), sim: refScore, motivo: "análoga oficial já precificada na base (semelhança " + Math.round(refScore * 100) + "%)", via: "analogia-oficial" });
            this.aplicarCandidato(L, 0, "analogia-oficial", ctx);
            L.status = "revisar";
            L.avisos.push("Sugerida a composição oficial " + r.rota.codigo + " por analogia — confira se é o mesmo serviço; se não for, use 'Elaborar composição'.");
            trace("análoga oficial precificada " + r.rota.codigo + " → revisar");
            return L;
          } else {
            L.status = "propria"; L.via = "analogia"; L.fonte = "PROPRIA";
            L.comp = r.comp; L.referencia = { codigo: ref.codigo, descricao: ref.descricao, unidade: refUnid, score: refScore };
            L.codigo = r.comp.codigo; L.descricaoBase = r.comp.descricao; L.unidadeBase = r.comp.unidade || it.unidade || "";
            L.custoUnitario = (r.custo && r.custo.total) || 0; L.custoMO = (r.custo && r.custo.mo) || 0; L.custoMAT = (r.custo && r.custo.mat) || 0; L.custoEQ = (r.custo && r.custo.eq) || 0;
            L.confianca = r.confianca === "alta" ? 75 : (r.confianca === "media" ? 55 : 35);
            L.motivo = "composição própria elaborada por analogia com " + ref.codigo + " (coeficientes oficiais" + (r.rota && r.rota.tipo === "cotar" ? "; faltam preços de insumo — cotar" : "") + ")";
            if (r.aviso) L.avisos.push(r.aviso);
            /* rota "cotar": a composição É própria e tem os coeficientes; o que
               falta é preço de insumo nesta UF — aviso, não rebaixamento */
            if (r.rota && r.rota.tipo === "cotar") { L.avisos.push("Insumo(s) sem preço nesta UF: " + (r.rota.faltam || []).map(function (f) { return f.codigo; }).join(", ") + " — informe a cotação para o custo fechar."); }
            ctx.codigosGerados.push(r.comp.codigo);
            ctx._compCache[chave] = { i: i, comp: r.comp, referencia: L.referencia, custoUnitario: L.custoUnitario, custoMO: L.custoMO, custoMAT: L.custoMAT, custoEQ: L.custoEQ, confianca: L.confianca, motivo: L.motivo, avisos: L.avisos.slice() };
            trace("composição própria por analogia com " + ref.codigo + " (" + r.confianca + ")");
            return L;
          }
        } else trace("sem análoga na base analítica" + (r && r.erro ? ": " + String(r.erro).slice(0, 80) : ""));
      }

      // ---- 6. PENDENTE (casca) ----
      L.status = "pendente"; L.via = "nenhum"; L.fonte = "PROPRIA";
      L.comp = { codigo: "", descricao: desc || "(sem descrição)", unidade: String(it.unidade || "un"), insumos: [], observacao: "Casca criada pelo Orçamentista: nenhuma base escolhida tem este serviço e não houve análoga. Informe os insumos e coeficientes." };
      L.motivo = "sem correspondência nas bases escolhidas e sem análoga para elaborar";
      L.confianca = 0;
      trace("pendente");
      return L;
    },

    /* Planeja todos os itens. `etapas` no formato do Importador. */
    planejar: function (etapas, ctx) {
      ctx = ctx || {}; ctx.fontes = this._nomesDeBase(ctx.fontes);
      var self = this, plano = [], n = 0;
      (etapas || []).forEach(function (et, ei) {
        (et.itens || []).forEach(function (it) { plano.push(self.decidir(it, ei, n++, ctx)); });
      });
      return { plano: plano, resumo: this.resumo(plano), fontes: ctx.fontes.slice() };
    },

    /* O mesmo planejar, em fatias — a analogia custa ~80 ms por item e 200
       itens travariam a tela. `aoProgredir(feitos, total)` a cada fatia. */
    planejarAsync: function (etapas, ctx, aoProgredir) {
      var self = this;
      ctx = ctx || {}; ctx.fontes = this._nomesDeBase(ctx.fontes);
      var fila = [];
      (etapas || []).forEach(function (et, ei) { (et.itens || []).forEach(function (it) { fila.push({ it: it, ei: ei }); }); });
      var plano = [], pos = 0, FATIA = 8;
      return new Promise(function (resolve, reject) {
        var passo = function () {
          try {
            var fim = Math.min(fila.length, pos + FATIA);
            for (; pos < fim; pos++) plano.push(self.decidir(fila[pos].it, fila[pos].ei, pos, ctx));
            if (aoProgredir) { try { aoProgredir(pos, fila.length); } catch (e) {} }
            if (pos < fila.length) setTimeout(passo, 0);
            else resolve({ plano: plano, resumo: self.resumo(plano), fontes: ctx.fontes.slice() });
          } catch (e) { reject(e); }
        };
        passo();
      });
    },

    resumo: function (plano) {
      var r = { total: plano.length, casado: 0, revisar: 0, propria: 0, pendente: 0, porVia: {}, custoDireto: 0, semPreco: 0 };
      plano.forEach(function (L) {
        r[L.status] = (r[L.status] || 0) + 1;
        r.porVia[L.via] = (r.porVia[L.via] || 0) + 1;
        var q = Number(L.item && L.item.quantidade) || 0, c = self_custo(L);
        if (c > 0) r.custoDireto += q * c; else r.semPreco++;
      });
      r.custoDireto = Math.round(r.custoDireto * 100) / 100;
      return r;
    },

    /* Item pronto para Orcamento.addItem — sem inventar nada além do que a linha decidiu. */
    itemParaOrcamento: function (L) {
      var it = L.item, planilhaTemPreco = Number(it.custoUnitario) > 0;
      if (L.status === "casado" || L.status === "revisar") {
        var baseUnit = Number(L.custoUnitario) || 0, usar = planilhaTemPreco ? Number(it.custoUnitario) : baseUnit;
        var fator = (baseUnit > 0 && usar > 0) ? usar / baseUnit : 1;
        return {
          codigo: L.codigo, baseFonte: L.fonte === "SINAPI" ? null : L.fonte,
          descricao: it.descricao || L.descricaoBase, unidade: it.unidade || L.unidadeBase,
          custoUnitario: usar, custoMO: (Number(L.custoMO) || 0) * fator, custoMAT: (Number(L.custoMAT) || 0) * fator, custoEQ: (Number(L.custoEQ) || 0) * fator,
          orcamentista: { status: L.status, via: L.via, confianca: L.confianca, motivo: L.motivo, codigoLido: L.codigoLido, fonteLida: L.fonteLida }
        };
      }
      if (L.status === "propria" && L.comp) {
        return {
          codigo: L.comp.codigo, baseFonte: "PROPRIA", descricao: L.comp.descricao || it.descricao, unidade: L.comp.unidade || it.unidade || "un",
          custoUnitario: planilhaTemPreco ? Number(it.custoUnitario) : (Number(L.custoUnitario) || 0), custoMO: Number(L.custoMO) || 0, custoMAT: Number(L.custoMAT) || 0, custoEQ: Number(L.custoEQ) || 0,
          orcamentista: { status: "propria", via: L.via, confianca: L.confianca, motivo: L.motivo, referencia: L.referencia && L.referencia.codigo, codigoLido: L.codigoLido, fonteLida: L.fonteLida }
        };
      }
      return {
        codigo: (L.comp && L.comp.codigo) || "", baseFonte: (L.comp && L.comp.codigo) ? "PROPRIA" : null, descricao: it.descricao, unidade: it.unidade || "un",
        custoUnitario: planilhaTemPreco ? Number(it.custoUnitario) : 0,
        orcamentista: { status: "pendente", via: "nenhum", confianca: 0, motivo: L.motivo, codigoLido: L.codigoLido, fonteLida: L.fonteLida }
      };
    },

    /* ==================================================================
     * IA NO RESÍDUO — contrato do endpoint POST <iaBackend>/ia/compor
     * (servidor: server/ia-compor.js + a rota em server/orcapro-ia.js, desde 21/09/2026;
     * guardado por tools/test-ia-compor-srv.js, que passa a resposta de lá por ESTE validador).
     *   pedido:   { itens:[{ i, descricao, unidade }] }
     *   resposta: { ok:true, composicoes:[{ i, unidade, insumos:[{ descricao,
     *               unidade, coeficiente, categoria:"MO"|"MAT"|"EQ", memoria }] }] }
     * O que a IA devolve é PROPOSTA: cada insumo é procurado nas bases
     * escolhidas (descrição parecida ≥ 0,6); o que casa ganha código e preço
     * reais, o que não casa vira insumo próprio A COTAR (preço 0) — nunca
     * um preço inventado. A composição sai com confiança BAIXA e aviso.
     * ================================================================== */
    validarComposicaoIA: function (L, resposta, ctx) {
      if (!L || !resposta || !Array.isArray(resposta.insumos) || !resposta.insumos.length) return null;
      var self = this, insumos = [], aCotar = 0;
      resposta.insumos.forEach(function (x, k) {
        var d = String(x && x.descricao || "").trim(), coef = Number(x && x.coeficiente) || 0;
        if (!d || !(coef > 0) || coef > 10000) return;
        var cat = String(x.categoria || "").toUpperCase(); cat = cat === "MO" || cat === "EQ" ? cat : "MAT";
        var melhor = null;
        if (typeof ctx.buscar === "function") {
          var q = self.termosDeBusca(d, ctx.normalizar).slice(0, 3).join(" ");
          (ctx.buscar(q, { fontes: ctx.fontes, max: 30, tipo: "insumo" }) || []).forEach(function (r) {
            var s = self.similaridade(d, r.item.descricao, x.unidade, r.item.unidade, ctx);
            if (!melhor || s > melhor.s) melhor = { s: s, r: r };
          });
        }
        if (melhor && melhor.s >= 0.6 && Number(melhor.r.item.custoUnitario) > 0) {
          insumos.push({ codigo: String(melhor.r.item.codigo), descricao: melhor.r.item.descricao, unidade: melhor.r.item.unidade || x.unidade || "", coeficiente: coef, custoUnitario: Number(melhor.r.item.custoUnitario), categoria: cat, tipo: "insumo", fonte: melhor.r.fonte, memoria: String(x.memoria || "coeficiente proposto pela IA — confira") });
        } else {
          aCotar++;
          insumos.push({ codigo: "COT-" + (k + 1), descricao: d, unidade: String(x.unidade || ""), coeficiente: coef, custoUnitario: 0, categoria: cat, tipo: "insumo", fonte: "PROPRIA", memoria: "insumo proposto pela IA sem correspondência nas bases — cotar" });
        }
      });
      if (!insumos.length) return null;
      var custo = { total: 0, mo: 0, mat: 0, eq: 0 };
      insumos.forEach(function (i) { var v = Math.round(i.coeficiente * i.custoUnitario * 100) / 100; custo.total += v; if (i.categoria === "MO") custo.mo += v; else if (i.categoria === "EQ") custo.eq += v; else custo.mat += v; });
      return { insumos: insumos, custo: custo, aCotar: aCotar, unidade: String(resposta.unidade || L.item.unidade || "un"), aviso: "Estrutura proposta pela IA (confiança baixa): " + insumos.length + " insumo(s), " + aCotar + " a cotar. Confira coeficiente por coeficiente." };
    }
  };

  function self_custo(L) {
    if (Number(L.item && L.item.custoUnitario) > 0) return Number(L.item.custoUnitario);
    return Number(L.custoUnitario) || 0;
  }

  global.Orcamentista = Orcamentista;
  if (typeof module !== "undefined" && module.exports) module.exports = Orcamentista;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
