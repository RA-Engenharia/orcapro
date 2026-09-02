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

  /* Chave de agregação: o mesmo insumo em serviços diferentes é UM insumo.
     Pelo código quando existe; pela descrição+unidade quando não — porque
     insumo de composição própria pode não ter código. */
  function chave(ins) {
    var c = texto(ins.codigo);
    if (c) return "c:" + c;
    return "d:" + texto(ins.descricao).toLowerCase() + "|" + texto(ins.unidade).toLowerCase();
  }

  /* --------------------------------------------------------------------
   * consolidar(linhas, obter, opc)
   *   linhas — o que Orcamento.linhas(orc) devolve
   *   obter  — function(codigo) -> composicao analitica ou null
   * ------------------------------------------------------------------ */
  function consolidar(linhas, obter, opc) {
    linhas = linhas || []; opc = opc || {};
    var porInsumo = {}, ordem = [];
    var custoTotal = 0, custoAberto = 0, custoFechado = 0;
    var naoDetalhado = [];

    linhas.forEach(function (L) {
      if (!L) return;
      var q = num(L.quantidade), ct = num(L.custoTotal);
      custoTotal += ct;
      var comp = (typeof obter === "function") ? obter(texto(L.codigo)) : null;
      var ins = comp && comp.insumos && comp.insumos.length ? comp.insumos : null;
      if (!ins || q <= 0) {
        /* ⚠ não some: entra no balde com o motivo, para a tela poder dizer
           POR QUE aquela parte do orçamento não virou lista de compras */
        custoFechado += ct;
        naoDetalhado.push({
          codigo: texto(L.codigo), descricao: texto(L.descricao),
          unidade: texto(L.unidade), quantidade: q, custoTotal: ct,
          motivo: !comp ? "sem composição na base" : (q <= 0 ? "quantidade zerada" : "composição sem insumos")
        });
        return;
      }
      custoAberto += ct;
      ins.forEach(function (i) {
        var k = chave(i);
        var alvo = porInsumo[k];
        if (!alvo) {
          alvo = porInsumo[k] = {
            codigo: texto(i.codigo), descricao: texto(i.descricao),
            unidade: texto(i.unidade), categoria: texto(i.categoria) || "MAT",
            tipoInsumo: texto(i.tipoInsumo),
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

    return {
      insumos: lista,
      naoDetalhado: naoDetalhado,
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
  function filtrar(insumos, busca, categoria) {
    var b = texto(busca).toLowerCase();
    var cat = texto(categoria).toUpperCase();
    return (insumos || []).filter(function (x) {
      if (cat && cat !== "TODAS" && texto(x.categoria).toUpperCase() !== cat) return false;
      if (!b) return true;
      return (x.descricao + " " + x.codigo).toLowerCase().indexOf(b) > -1;
    });
  }

  var InsumosOrc = { consolidar: consolidar, resumoABC: resumoABC, filtrar: filtrar, _chave: chave };
  global.InsumosOrc = InsumosOrc;
  if (typeof module !== "undefined" && module.exports) module.exports = InsumosOrc;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
