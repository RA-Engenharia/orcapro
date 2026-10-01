/* =====================================================================
 * insumosorc.js — OS INSUMOS DESTE ORÇAMENTO, E A CURVA ABC
 *
 * O QUE ESTA TELA RESPONDE
 * "Quanto de cimento eu vou precisar comprar nesta obra?" — e, ordenada por
 * dinheiro, "quais poucos insumos concentram o custo?". A planilha do
 * orçamento responde por SERVIÇO (alvenaria, reboco); aqui a mesma obra é
 * lida por MATERIAL, que é como se compra.
 *
 * Cada item do orçamento carrega um código de composição; a base analítica
 * traz os insumos daquela composição com o coeficiente por unidade. A conta
 * é: quantidade do item x coeficiente do insumo, somando o mesmo insumo que
 * aparece em serviços diferentes.
 *
 * ⚠ O QUE NÃO TEM COMPOSIÇÃO NÃO PODE SUMIR — E ESTA É A REGRA QUE FAZ A
 * TELA VALER ALGUMA COISA.
 * Item digitado à mão, composição própria sem analítico, código de outra
 * base: nada disso explode em insumo. Se essas linhas simplesmente não
 * aparecessem, a lista sairia curta e com cara de completa — e alguém
 * compraria material a menos numa obra inteira por causa de uma tela que
 * parecia certa. Elas vão para um balde "não detalhado", com o valor delas,
 * e a tela informa a COBERTURA: quanto do custo direto foi de fato aberto em
 * insumo. Lista de compras com 60% de cobertura é uma informação; lista
 * curta sem aviso é uma armadilha.
 *
 * ⚠ E AQUI É CUSTO DIRETO, SEM BDI. O total desta tela não bate com o total
 * do orçamento de propósito: insumo se compra pelo custo, e o BDI não é
 * material. Quem comparar os dois números tem de encontrar a explicação
 * escrita, senão vai procurar um erro que não existe.
 *
 * Motor puro: recebe as linhas já calculadas e uma função de lookup. Sem
 * DOM, sem rede, sem Analitico — testável em Node.
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function texto(s) { return String(s == null ? "" : s).trim(); }
  function semAcento(s) {
    return texto(s).replace(/[áàâãä]/gi, "a").replace(/[éèêë]/gi, "e").replace(/[íìîï]/gi, "i")
      .replace(/[óòôõö]/gi, "o").replace(/[úùûü]/gi, "u").replace(/ç/gi, "c");
  }

  /* ⚠ CATEGORIA SEMPRE EM MO / MAT / EQ — é o que o filtro da tela compara.
     O analítico SINAPI traz o código curto ("MO"), mas o insumo de composição
     própria guarda o rótulo longo ("MAO DE OBRA", "MATERIAL", "Equipamento").
     Sem normalizar, "Só mão de obra" comparava "MAO DE OBRA" com "MO" e
     devolvia lista vazia — com a mão de obra inteira lá dentro.
     Mesma regra de ComposicaoPropria.catDe (test-insumosorc confere as duas
     lado a lado); cópia aqui porque este motor roda em Node sem o resto. */
  function categoria(c) {
    var s = semAcento(c).toLowerCase().replace(/\s+/g, "");
    if (s === "mo" || /mao|m\.o|encargo/.test(s)) return "MO";
    if (s === "eq" || /equip/.test(s)) return "EQ";
    return "MAT";
  }

  /* Fonte do item, na mesma régua de ReqOrcamento.normFonte (a lista de
     compras): vazio e as variantes de SINAPI são SINAPI; PROPRIO é PROPRIA. */
  function normFonte(f) {
    var F = semAcento(f).toUpperCase().replace(/\s+/g, "");
    if (!F || F === "SINAPI" || F === "SINAPI_DES" || F === "SINAPI-DES" || F === "ISD" || F === "CSD") return "SINAPI";
    if (F === "PROPRIA" || F === "PROPRIO") return "PROPRIA";
    return F;
  }

  /* Chave de agregação: o mesmo insumo em serviços diferentes é UM insumo.
     Pelo código quando existe; pela descrição+unidade quando não — porque
     insumo de composição própria pode não ter código. */
  function chave(ins) {
    var c = texto(ins.codigo);
    if (c) return "c:" + c;
    return "d:" + texto(ins.descricao).toLowerCase() + "|" + texto(ins.unidade).toLowerCase();
  }

  /* --------------------------------------------------------------------
   * resolvedor(d) — ONDE CADA ITEM DO ORÇAMENTO ABRE EM INSUMOS
   *
   * ⚠ O DEFEITO QUE ISTO FECHA (01/10/2026). A tela chamava só
   * `Analitico.obter(codigo)`, que é a base SINAPI. Um orçamento feito
   * inteiro com composição própria (cada item com pedreiro, servente,
   * placa, parafuso e coeficientes preenchidos) aparecia com todos no balde
   * "sem composição na base" e cobertura 0% — enquanto o "Analítico do item"
   * e a aba Insumos do Excel abriam as mesmas composições sem problema. O
   * cliente achou que tinha montado as composições errado; o erro era da
   * tela, que nunca olhava a base própria.
   *
   * A precedência é a MESMA de `App.verInsumos` e de `_reqOrcResolver` (a
   * lista de compras), para as três telas não discordarem do mesmo item:
   *   PROPRIA (ou código PROP-…) → base própria;
   *   SINAPI → analítico; sem ele, a própria de código NÃO oficial;
   *   outra base → o registro daquela base, se trouxer insumos.
   * ⚠ Outra base NÃO cai no analítico SINAPI: SETOP 1379 e SINAPI 1379 são
   * coisas diferentes, e abrir uma pela outra inventa a lista de compras.
   *
   *   d.sinapi(cod)        -> composição do analítico | null (null se não carregado)
   *   d.base(fonte, cod)   -> registro de Bases | null
   *   d.oficial(cod)       -> true se o código existe no SINAPI ativo
   *   d.temAnalitico       -> o analítico está carregado
   * ------------------------------------------------------------------ */
  function comInsumos(r) { return !!(r && r.insumos && r.insumos.length); }

  /* registro de Bases -> mesma forma do analítico, com a categoria já em
     MO/MAT/EQ e a marca `propria` (o preço dele é o do cliente, e por isso a
     tela pode comparar com o preço do item) */
  function daBase(rec, propria) {
    return {
      codigo: texto(rec.codigo), descricao: texto(rec.descricao), unidade: texto(rec.unidade),
      custoUnitario: num(rec.custoUnitario), propria: !!propria,
      insumos: rec.insumos.map(function (i) {
        return {
          codigo: texto(i.codigo), descricao: texto(i.descricao), unidade: texto(i.unidade),
          coeficiente: num(i.coeficiente), custoUnitario: num(i.custoUnitario),
          categoria: categoria(i.categoria), tipoInsumo: texto(i.tipoInsumo),
          /* a própria guarda subcomposição de dois jeitos: tipo "composicao", ou
             tipo "insumo" com a categoria "COMPOSICAO AUXILIAR" (é assim que
             textura e fundo selador entram em composição de forro) */
          tipo: (/composi/i.test(texto(i.tipo)) || /composi/i.test(semAcento(i.categoria))) ? "COMPOSICAO" : "INSUMO",
          fonte: texto(i.fonte)
        };
      })
    };
  }

  function fonteDaLinha(L) {
    L = L || {};
    var it = L.item || {};
    var bf = normFonte(L.baseFonte != null ? L.baseFonte : it.baseFonte);
    var og = normFonte(L.origem != null ? L.origem : it.origem);
    /* basta UM dos dois dizer PROPRIA: há item antigo com só a origem gravada */
    if (bf === "PROPRIA" || og === "PROPRIA") return "PROPRIA";
    return texto(L.baseFonte != null ? L.baseFonte : it.baseFonte) ? bf : og;
  }

  function resolvedor(d) {
    d = d || {};
    var sinapi = typeof d.sinapi === "function" ? d.sinapi : function () { return null; };
    var base = typeof d.base === "function" ? d.base : function () { return null; };
    var oficial = typeof d.oficial === "function" ? d.oficial : function () { return false; };

    function obter(cod, L) {
      cod = texto(cod);
      if (!cod) return null;
      var F = fonteDaLinha(L);
      if (F === "PROPRIA" || /^PROP-/i.test(cod)) {
        var bp = base("PROPRIA", cod);
        return comInsumos(bp) ? daBase(bp, true) : null;
      }
      if (F === "SINAPI") {
        var a = sinapi(cod);
        if (a) return a;
        var bp2 = base("PROPRIA", cod);
        return (comInsumos(bp2) && !oficial(cod)) ? daBase(bp2, true) : null;
      }
      var x = base(F, cod);
      return comInsumos(x) ? daBase(x, false) : null;
    }

    /* o motivo do balde, dito pela fonte do item: "sem composição na base"
       para tudo fazia a pessoa procurar o defeito no lugar errado */
    function motivoSem(cod, L) {
      var F = fonteDaLinha(L);
      if (!texto(cod)) return "item digitado à mão, sem código";
      if (F === "PROPRIA" || /^PROP-/i.test(texto(cod))) return "composição própria sem insumos, ou que não está mais na base própria";
      if (F === "SINAPI") return d.temAnalitico ? "fora do detalhamento SINAPI carregado" : "detalhamento SINAPI não carregado";
      return "a base " + F + " não traz o detalhamento em insumos";
    }

    /* ⚠ só o SINAPI depende do analítico de 17 MB. Orçamento só de
       composição própria abre sem baixar nada — pedir o download para
       ele seria cobrar a franquia de quem não vai usar o arquivo. */
    function precisaAnalitico(linhas) {
      return (linhas || []).some(function (L) {
        if (!L || !texto(L.codigo)) return false;
        var F = fonteDaLinha(L);
        return F === "SINAPI" && !/^PROP-/i.test(texto(L.codigo));
      });
    }

    return { obter: obter, motivoSem: motivoSem, precisaAnalitico: precisaAnalitico };
  }

  /* --------------------------------------------------------------------
   * consolidar(linhas, obter, opc)
   *   linhas — o que Orcamento.linhas(orc) devolve
   *   obter  — function(codigo, linha) -> composicao analitica ou null
   *   opc.motivoSem(codigo, linha) -> texto do balde (opcional)
   * ------------------------------------------------------------------ */
  /* tolerância da divergência: o arredondamento por insumo (truncar em 2
     casas, padrão TCU) já dá alguns centavos de diferença em toda
     composição. Abaixo disto é conta, não divergência. */
  var DIVERGE_PCT = 1, DIVERGE_MIN = 0.05;

  function consolidar(linhas, obter, opc) {
    linhas = linhas || []; opc = opc || {};
    var porInsumo = {}, ordem = [];
    var custoTotal = 0, custoAberto = 0, custoFechado = 0;
    var naoDetalhado = [], divergentes = [];

    linhas.forEach(function (L) {
      if (!L) return;
      var q = num(L.quantidade), ct = num(L.custoTotal);
      custoTotal += ct;
      var comp = (typeof obter === "function") ? obter(texto(L.codigo), L) : null;
      var ins = comp && comp.insumos && comp.insumos.length ? comp.insumos : null;
      if (!ins || q <= 0) {
        /* ⚠ não some: entra no balde com o motivo, para a tela poder dizer
           POR QUE aquela parte do orçamento não virou lista de compras */
        custoFechado += ct;
        var mot = !comp ? ((typeof opc.motivoSem === "function" && opc.motivoSem(texto(L.codigo), L)) || "sem composição na base")
          : (q <= 0 ? "quantidade zerada" : "composição sem insumos");
        naoDetalhado.push({
          codigo: texto(L.codigo), descricao: texto(L.descricao),
          unidade: texto(L.unidade), quantidade: q, custoTotal: ct,
          motivo: mot
        });
        return;
      }
      custoAberto += ct;
      /* ⚠ COMPOSIÇÃO PRÓPRIA COM PREÇO DIFERENTE DO ITEM. A lista abaixo usa
         coeficiente x custo do insumo — nunca rateia o preço do item. Se o
         item foi editado na planilha (ou a composição mudou depois), a soma
         dos insumos não fecha com o custo do item, e a tela tem de dizer
         quanto e onde, senão "Custo direto aberto" parece conta errada.
         Só a própria: no SINAPI o analítico é de uma UF de referência e a
         diferença de preço é esperada, não sinal de nada. */
      /* ⚠ item "só MO" / "só MAT+EQ" fatura uma parcela da composição de
         propósito (o cliente fornece o resto): o preço menor ali é regra do
         item, não divergência — acusá-lo ensinaria a ignorar o cartão. */
      var modo = texto((L.item && L.item.modoCusto) || L.modoCusto);
      if (comp.propria && modo !== "mo" && modo !== "matEq") {
        var cuComp = 0;
        ins.forEach(function (i) { cuComp += num(i.coeficiente) * num(i.custoUnitario); });
        var cuItem = num(L.custoUnitario) || (q > 0 ? ct / q : 0);
        var dif = cuItem - cuComp;
        if (Math.abs(dif) > Math.max(DIVERGE_MIN, Math.abs(cuItem) * DIVERGE_PCT / 100)) {
          divergentes.push({
            codigo: texto(L.codigo), descricao: texto(L.descricao), unidade: texto(L.unidade),
            quantidade: q, custoItem: cuItem, custoComposicao: cuComp, diferencaTotal: q * dif
          });
        }
      }
      ins.forEach(function (i) {
        var k = chave(i);
        var alvo = porInsumo[k];
        if (!alvo) {
          alvo = porInsumo[k] = {
            codigo: texto(i.codigo), descricao: texto(i.descricao),
            unidade: texto(i.unidade), categoria: categoria(i.categoria),
            tipoInsumo: texto(i.tipoInsumo),
            /* ⚠ subcomposição NÃO é aberta aqui: ela entra como uma linha só,
               e o rótulo de MAT dela esconde a mão de obra que tem dentro. A
               tela diz isso na linha, para ninguém cotar "textura" como lata. */
            subcomposicao: /composi/i.test(texto(i.tipo)),
            custoUnitario: num(i.custoUnitario),
            quantidade: 0, custoTotal: 0, emServicos: 0
          };
          ordem.push(k);
        }
        var qi = q * num(i.coeficiente);
        alvo.quantidade += qi;
        /* ⚠ o custo do insumo vem do coeficiente x custo unitario DELE, e nao
           de uma fatia do custo do servico: o item pode ter preço editado à
           mão, e ratear esse preço pelos insumos inventaria um custo unitário
           que ninguém digitou. */
        alvo.custoTotal += qi * num(i.custoUnitario);
        alvo.emServicos++;
      });
    });

    var lista = ordem.map(function (k) { return porInsumo[k]; });
    /* ordem por dinheiro: e daqui que sai a curva ABC, sem tela extra */
    lista.sort(function (a, b) { return b.custoTotal - a.custoTotal; });

    var somaInsumos = 0;
    lista.forEach(function (x) { somaInsumos += x.custoTotal; });

    /* ⚠ ABC SOBRE O QUE FOI ABERTO, e a tela diz isso. Calcular a curva sobre
       o total do orçamento (com a parte não detalhada dentro) daria uma
       classe "A" menor do que a real, porque o denominador teria custo que
       nunca entra na lista. */
    var acum = 0;
    lista.forEach(function (x) {
      x.pct = somaInsumos > 0 ? (x.custoTotal / somaInsumos * 100) : 0;
      /* ⚠ A CLASSE OLHA O ACUMULADO ANTES DO ITEM, NAO DEPOIS — e isto nao e
         detalhe de arredondamento.
         Com a regra anterior (`acum <= 80` ja somando o proprio item), um
         insumo que sozinho leva 86% do orcamento caia na classe B, e a obra
         inteira ficava SEM classe A: exatamente o item que mais importa era
         o unico que o metodo nao apontava. Foi visto assim numa tela real —
         a mao de obra levava 86,8% e o selo dizia "B".
         O item que CRUZA a fronteira entra na classe: e a definicao usada em
         engenharia, e a unica que garante que o maior de todos e sempre A. */
      var antes = acum;
      acum += x.pct;
      x.pctAcum = acum;
      x.classe = antes < 80 ? "A" : (antes < 95 ? "B" : "C");
    });

    naoDetalhado.sort(function (a, b) { return b.custoTotal - a.custoTotal; });
    divergentes.sort(function (a, b) { return Math.abs(b.diferencaTotal) - Math.abs(a.diferencaTotal); });

    return {
      insumos: lista,
      naoDetalhado: naoDetalhado,
      divergentes: divergentes,
      somaInsumos: somaInsumos,
      custoTotal: custoTotal,
      custoAberto: custoAberto,
      custoFechado: custoFechado,
      /* a medida honesta: quanto do custo direto virou lista de compras */
      cobertura: custoTotal > 0 ? (custoAberto / custoTotal * 100) : 0,
      nInsumos: lista.length,
      nLinhas: linhas.length
    };
  }

  /* Quantos itens formam cada classe — o "poucos itens, muito dinheiro" em
     número, que é o que faz a curva ABC valer a leitura. */
  function resumoABC(res) {
    var r = { A: { n: 0, valor: 0 }, B: { n: 0, valor: 0 }, C: { n: 0, valor: 0 } };
    ((res && res.insumos) || []).forEach(function (x) {
      var c = r[x.classe]; if (!c) return;
      c.n++; c.valor += x.custoTotal;
    });
    return r;
  }

  /* Filtro da tela: busca por texto e recorte por categoria (MO/MAT/EQ).
     Não recalcula a curva — a classe de um insumo é do orçamento inteiro,
     não do recorte que está na tela; recalcular faria a mesma areia ser "A"
     num filtro e "B" no outro. */
  function filtrar(insumos, busca, catFiltro) {
    var b = texto(busca).toLowerCase();
    var cat = texto(catFiltro).toUpperCase();
    return (insumos || []).filter(function (x) {
      if (cat && cat !== "TODAS" && categoria(x.categoria) !== cat) return false;
      if (!b) return true;
      return (x.descricao + " " + x.codigo).toLowerCase().indexOf(b) > -1;
    });
  }

  var InsumosOrc = { consolidar: consolidar, resumoABC: resumoABC, filtrar: filtrar, resolvedor: resolvedor,
    categoria: categoria, _chave: chave, _normFonte: normFonte };
  global.InsumosOrc = InsumosOrc;
  if (typeof module !== "undefined" && module.exports) module.exports = InsumosOrc;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
