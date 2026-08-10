/* =====================================================================
 * ajustes.js — O QUE O USUÁRIO MUDOU EM CIMA DO PREÇO DA BASE
 *
 * POR QUE EXISTE: um item de orçamento nasce com o preço de uma base oficial
 * (SINAPI, SICRO, ORSE, IOPES, GOINFRA) ou de uma composição própria. O
 * usuário pode e deve poder mexer — a cotação local diverge, o insumo subiu,
 * a produtividade da equipe dele é outra. O que NÃO pode é essa mudança
 * sumir. Um orçamento com 300 itens onde 12 foram mexidos à mão, sem sinal
 * nenhum na tela, é um orçamento que ninguém consegue revisar: nem o autor
 * três meses depois, nem o cliente, nem o órgão que recebe a proposta.
 *
 * E tem peso legal. Na Lei 14.133/2021 o preço da base é a referência; preço
 * ACIMA dela pede justificativa, e o TCU pede a memória de como se chegou
 * nele (Acórdão 2.622/2013 e seguintes). Guardar "de quanto para quanto,
 * quando, por quem e por quê" é o que transforma uma planilha editada numa
 * planilha defensável.
 *
 * ------------------------------------------------------------------
 * AS SETE REGRAS QUE NÃO PODEM CAIR
 *
 * 1) A BASE NUNCA É TOCADA. Mexer no coeficiente da SINAPI 87879 dentro do
 *    orçamento A não pode mudar o orçamento B, nem os já aprovados e
 *    impressos. O ajuste mora NO ITEM do orçamento, como um "por cima" da
 *    base. A base é acervo compartilhado e referência legal — é só leitura.
 *
 * 2) O VALOR DA BASE CONGELA NA PRIMEIRA ALTERAÇÃO. Se cada edição
 *    regravasse a referência, na segunda mexida o "valor da base" já seria a
 *    mexida anterior — e o selo passaria a comparar o usuário com ele mesmo.
 *    A referência é a da base, sempre.
 *
 * 3) VOLTAR NO VALOR APAGA O SELO. Quem digita 26, se arrepende e digita 25
 *    de novo não tem item alterado — tem item igual à base. Deixar o selo
 *    aceso seria mentir na revisão. Com tolerância de centavo, porque
 *    25,00 e 24,999 são o mesmo preço depois do arredondamento.
 *
 * 4) RESTAURAR VOLTA PARA A BASE, NÃO PARA A EDIÇÃO ANTERIOR. São coisas
 *    diferentes: "desfazer o que acabei de digitar" e "voltar para o que a
 *    SINAPI diz". Aqui é sempre a segunda.
 *
 * 5) BASE ZERADA NÃO TEM PERCENTUAL. Insumo que a base não coletou na UF
 *    entra com 0. Sair de 0 para 40 não é "+∞%" nem "+4000%": é preço que
 *    NÃO EXISTIA na base. Aparece assim, escrito.
 *
 * 6) ITEM DIGITADO À MÃO NÃO É "ALTERADO". Sem código de base não houve
 *    desvio de referência nenhum — só um preço próprio. Selo aceso aí seria
 *    ruído em cima de quem mais precisa enxergar os 12 desvios reais.
 *
 * 7) SE A BASE SE MOVER, O DESVIO ACOMPANHA. A SINAPI muda de competência
 *    todo mês. Um item editado em maio, com a base de junho por cima, tem
 *    que passar a comparar com junho — senão o percentual mostrado é uma
 *    conta contra um preço que não existe mais. O valor antigo continua
 *    guardado para a auditoria (`baseMudou`), mas quem manda na comparação
 *    e no restaurar é a referência de hoje.
 *
 * ------------------------------------------------------------------
 * ONDE O AJUSTE MORA (no item do orçamento)
 *
 *   it.ajustes = {
 *     "custoUnitario": { base, de, em, por, motivo, fonte, competencia, uf,
 *                        baseMudou: {de, para, em} | null },
 *     "coef:88316":    { base, de, em, por, motivo, ... }
 *   }
 *
 * A mesma estrutura serve para o preço do item e para o coeficiente de cada
 * insumo da composição — quem lê a planilha não quer duas mecânicas
 * diferentes para a mesma pergunta ("isso aqui foi mexido?").
 * ===================================================================== */
(function (global) {
  "use strict";

  /* centavo: abaixo disso é arredondamento, não alteração (regra 3) */
  var TOL_VALOR = 0.005;
  /* coeficiente SINAPI tem 4 casas decimais — a tolerância acompanha */
  var TOL_COEF = 0.00005;

  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    if (v == null) return 0;
    var s = String(v).trim();
    if (!s) return 0;
    /* aceita o formato BR (1.234,56) e o cru (1234.56) */
    if (s.indexOf(",") > -1) s = s.replace(/\./g, "").replace(",", ".");
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function texto(v) { return v == null ? "" : String(v); }
  function ehCoef(campo) { return texto(campo).indexOf("coef:") === 0; }
  function tol(campo) { return ehCoef(campo) ? TOL_COEF : TOL_VALOR; }
  function igual(a, b, campo) { return Math.abs(num(a) - num(b)) < tol(campo); }

  /* ---------------------------------------------------------------
   * REGRA 6 — só é "alterável com referência" o item que veio de uma base.
   * Composição própria conta: ela também é um cadastro que alguém aprovou e
   * do qual o orçamento derivou; mexer nela caso a caso merece o mesmo selo.
   * O que não conta é a linha digitada solta, sem código nenhum.
   * ------------------------------------------------------------- */
  function temBase(item) {
    if (!item || typeof item !== "object") return false;
    return !!texto(item.codigo).trim();
  }

  function mapa(item, criar) {
    if (!item || typeof item !== "object") return null;
    if (!item.ajustes && criar) item.ajustes = {};
    return item.ajustes || null;
  }

  /* ---------------------------------------------------------------
   * REGISTRAR — chamado a cada gravação de campo rastreado.
   *
   * `valorBase` é o valor que a base diz HOJE. Quem chama sabe disso (o item
   * guarda o código e a fonte); passar errado aqui contamina a referência,
   * então quando não vier nada usamos o valor que estava no campo antes da
   * edição — que é a melhor aproximação disponível na primeira mexida.
   * ------------------------------------------------------------- */
  function registrar(item, campo, valorAntes, valorDepois, ctx) {
    if (!item || !campo) return null;
    if (!temBase(item)) return null;                       /* regra 6 */
    var c = ctx || {};
    var m = mapa(item, true);
    var reg = m[campo];

    /* regra 2: a referência é a da BASE e congela na primeira alteração */
    var base = reg ? num(reg.base)
      : (c.valorBase != null ? num(c.valorBase) : num(valorAntes));

    /* regra 3: voltou para a base → não há alteração, o selo apaga */
    if (igual(valorDepois, base, campo)) {
      if (reg) delete m[campo];
      if (!Object.keys(m).length) delete item.ajustes;
      return null;
    }

    if (!reg) {
      reg = m[campo] = {
        base: base,
        de: num(valorAntes),          /* de onde saiu a 1ª edição (auditoria) */
        fonte: texto(c.fonte || item.fonte || item.origem || ""),
        competencia: texto(c.competencia || ""),
        uf: texto(c.uf || ""),
        baseMudou: null,
        criadoEm: texto(c.em || agora())
      };
    }
    reg.em = texto(c.em || agora());
    if (c.por != null) reg.por = texto(c.por);
    if (c.motivo != null) reg.motivo = texto(c.motivo);
    return reg;
  }

  function agora() {
    /* a data entra por quem chama nos testes; no app é o relógio do usuário */
    try { return new Date().toISOString(); } catch (e) { return ""; }
  }

  /* ---------------------------------------------------------------
   * REGRA 7 — a base se moveu (nova competência, composição própria
   * reprecificada). O desvio passa a ser contra o valor de hoje; o de ontem
   * fica guardado para quem for auditar.
   * ------------------------------------------------------------- */
  function moverBase(item, campo, valorBaseNovo, ctx) {
    var m = mapa(item, false);
    if (!m || !m[campo]) return null;
    var reg = m[campo], antigo = num(reg.base), novo = num(valorBaseNovo);
    if (igual(antigo, novo, campo)) return reg;
    reg.baseMudou = { de: antigo, para: novo, em: texto((ctx || {}).em || agora()) };
    reg.base = novo;
    if ((ctx || {}).competencia) reg.competencia = texto(ctx.competencia);
    return reg;
  }

  function tem(item, campo) {
    var m = mapa(item, false);
    return !!(m && m[campo]);
  }

  /* ---------------------------------------------------------------
   * DELTA — tudo que a tela precisa para mostrar o selo e o popover.
   * `atual` é o valor que está no campo agora (o item é a fonte da verdade
   * do valor; o registro guarda só a referência e a autoria).
   * ------------------------------------------------------------- */
  function delta(item, campo, atual) {
    var m = mapa(item, false);
    var reg = m && m[campo];
    if (!reg) return null;
    var base = num(reg.base), a = num(atual), dif = a - base;
    var coef = ehCoef(campo);
    /* regra 5: base zerada não vira percentual */
    var semBase = Math.abs(base) < tol(campo);
    var pct = semBase ? null : (dif / base) * 100;
    return {
      campo: campo,
      coeficiente: coef,
      base: base,
      atual: a,
      dif: dif,
      pct: pct,
      semBase: semBase,
      sentido: dif > 0 ? "aumento" : (dif < 0 ? "reducao" : "igual"),
      de: num(reg.de),
      em: texto(reg.em),
      por: texto(reg.por),
      motivo: texto(reg.motivo),
      fonte: texto(reg.fonte),
      competencia: texto(reg.competencia),
      uf: texto(reg.uf),
      baseMudou: reg.baseMudou || null
    };
  }

  /* RESTAURAR — regra 4: devolve o valor da BASE e apaga o registro. */
  function restaurar(item, campo) {
    var m = mapa(item, false);
    var reg = m && m[campo];
    if (!reg) return null;
    var base = num(reg.base);
    delete m[campo];
    if (!Object.keys(m).length) delete item.ajustes;
    return base;
  }

  function restaurarTudo(item) {
    var m = mapa(item, false);
    if (!m) return [];
    var out = Object.keys(m).map(function (k) { return { campo: k, base: num(m[k].base) }; });
    delete item.ajustes;
    return out;
  }

  function campos(item) {
    var m = mapa(item, false);
    return m ? Object.keys(m) : [];
  }

  /* valor atual do campo, lido do próprio item (o "coef:CODIGO" mora no
     mapa de coeficientes ajustados, que a composição consulta) */
  function valorAtual(item, campo) {
    if (!item) return 0;
    if (!ehCoef(campo)) return num(item[campo]);
    var cod = texto(campo).slice(5);
    var cs = item.coeficientes || {};
    return num(cs[cod]);
  }

  function doItem(item) {
    return campos(item).map(function (c) { return delta(item, c, valorAtual(item, c)); })
      .filter(function (d) { return !!d; });
  }

  /* ---------------------------------------------------------------
   * RESUMO DO ORÇAMENTO — o que a faixa no alto da planilha diz.
   *
   * O impacto em dinheiro é o que interessa a quem revisa: não é "12 itens
   * mexidos", é "12 itens mexidos que somam R$ 8.430 a mais". Só o preço
   * entra na conta de impacto — coeficiente mexido já chega aqui dentro do
   * preço da composição, e contar os dois seria contar duas vezes.
   * ------------------------------------------------------------- */
  function resumo(orc) {
    var itens = [], impacto = 0, totalBase = 0, totalAtual = 0, nCoef = 0, acima = 0, abaixo = 0;
    var etapas = (orc && Array.isArray(orc.etapas)) ? orc.etapas : [];
    etapas.forEach(function (e) {
      if (!e || !Array.isArray(e.itens)) return;
      e.itens.forEach(function (it) {
        var ds = doItem(it);
        if (!ds.length) return;
        var q = num(it.quantidade);
        var dPreco = null;
        ds.forEach(function (d) {
          if (d.coeficiente) { nCoef++; return; }
          if (d.campo === "custoUnitario") dPreco = d;
        });
        if (dPreco) {
          impacto += dPreco.dif * q;
          totalBase += dPreco.base * q;
          totalAtual += dPreco.atual * q;
          if (dPreco.dif > 0) acima++; else if (dPreco.dif < 0) abaixo++;
        }
        itens.push({
          etapaId: e.id, etapaNome: texto(e.nome), itemId: it.id,
          codigo: texto(it.codigo), descricao: texto(it.descricao),
          unidade: texto(it.unidade), quantidade: q,
          deltas: ds, preco: dPreco,
          impacto: dPreco ? dPreco.dif * q : 0
        });
      });
    });
    itens.sort(function (a, b) { return Math.abs(b.impacto) - Math.abs(a.impacto); });
    return {
      n: itens.length, itens: itens,
      nCoeficientes: nCoef, acimaDaBase: acima, abaixoDaBase: abaixo,
      impacto: impacto,
      totalBase: totalBase, totalAtual: totalAtual,
      /* percentual do desvio sobre o que os MESMOS itens custariam pela base
         — comparar com o total do orçamento diluiria o desvio em 300 itens
         intocados e faria 40% de erro num item parecer 0,3% */
      pct: Math.abs(totalBase) < TOL_VALOR ? null : (impacto / totalBase) * 100
    };
  }

  /* ---------------------------------------------------------------
   * PREÇO A PARTIR DOS COEFICIENTES — por DIFERENÇA, não por recálculo.
   *
   * A armadilha: recompor o preço somando `Σ coef × preço do insumo` parece
   * o certo, mas o SINAPI não coleta o preço de todo insumo em toda UF. Em
   * composição com insumo pendente a soma dos insumos fica ABAIXO do preço
   * oficial (a própria tela já avisa isso). Recompor do zero jogaria o item
   * para a soma parcial e DERRUBARIA o preço em silêncio — o usuário mexeu
   * num coeficiente e viu o item cair 30% sem entender.
   *
   * Então aplicamos só o que mudou: preço oficial + Σ(Δcoef × preço do
   * insumo). A parcela não coletada continua de pé, intocada.
   * ------------------------------------------------------------- */
  function precoComCoeficientes(precoOficial, insumos, coefAjustados) {
    var p = num(precoOficial), ajust = coefAjustados || {};
    (insumos || []).forEach(function (i) {
      if (!i) return;
      var cod = texto(i.codigo);
      if (!(cod in ajust)) return;
      var novo = num(ajust[cod]), velho = num(i.coeficiente);
      p += (novo - velho) * num(i.custoUnitario);
    });
    return Math.round(p * 100) / 100;
  }

  /* ---------------------------------------------------------------
   * TEXTO DO SELO — curto, porque mora dentro da célula da planilha.
   * ------------------------------------------------------------- */
  function fmtPct(p) {
    if (p == null) return "";
    var s = Math.abs(p) >= 100 ? p.toFixed(0) : p.toFixed(1);
    return (p > 0 ? "+" : "") + s.replace(".", ",") + "%";
  }
  function selo(d) {
    if (!d) return "";
    if (d.semBase) return "novo";
    return fmtPct(d.pct);
  }
  function rotulo(campo) {
    if (campo === "custoUnitario") return "Custo unitário";
    if (campo === "quantidade") return "Quantidade";
    if (ehCoef(campo)) return "Coeficiente de " + texto(campo).slice(5);
    return texto(campo);
  }
  /* frase inteira, para o popover e para o impresso */
  function frase(d) {
    if (!d) return "";
    if (d.semBase) return "Sem preço na base — valor informado por você.";
    var casas = d.coeficiente ? 4 : 2;
    /* o sinal já está em "acima"/"abaixo" — repetir o "+" viria "+4,0% acima" */
    var dir = d.dif > 0 ? "acima" : "abaixo";
    return "Você alterou de " + fmtN(d.base, casas) + " para " + fmtN(d.atual, casas) +
      " — " + fmtPct(Math.abs(d.pct)).replace("+", "") + " " + dir + " da base" +
      (d.fonte ? " (" + d.fonte + (d.competencia ? " " + d.competencia : "") + ")" : "") + ".";
  }
  function fmtN(v, casas) {
    var n = num(v), c = casas == null ? 2 : casas;
    var s = n.toFixed(c);
    var p = s.split(".");
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return p.join(",");
  }

  var Ajustes = {
    TOL_VALOR: TOL_VALOR, TOL_COEF: TOL_COEF,
    temBase: temBase, registrar: registrar, moverBase: moverBase,
    tem: tem, delta: delta, doItem: doItem, campos: campos, valorAtual: valorAtual,
    restaurar: restaurar, restaurarTudo: restaurarTudo,
    resumo: resumo, precoComCoeficientes: precoComCoeficientes,
    selo: selo, frase: frase, rotulo: rotulo, fmtPct: fmtPct, fmtN: fmtN,
    _num: num
  };
  global.Ajustes = Ajustes;
  if (typeof module !== "undefined" && module.exports) module.exports = Ajustes;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
