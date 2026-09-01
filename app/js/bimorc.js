/* =====================================================================
 * bimorc.js — O ELO ENTRE O MODELO E O ORÇAMENTO (motor PURO)
 *
 * O QUE FALTAVA. O `bimqto.js` mede o modelo e o botão "Lançar no orçamento"
 * cria um orçamento NOVO com aquelas quantidades. Uma vez. Depois disso os
 * dois seguem vidas separadas: ninguém sabe que o item "Alvenaria" daquele
 * orçamento veio da categoria "Paredes" daquele modelo.
 *
 * A consequência prática é a pergunta que o engenheiro não consegue fazer:
 * "o que eu orcei bate com o que está desenhado?". Ele orça 420 m² de parede,
 * o arquiteto reexporta o IFC com 480, e ninguém percebe até a obra.
 *
 * Aqui o elo passa a ser CADASTRO: item orçado ↔ categoria medida no modelo.
 * Com ele, "conferir" vira um botão, e a versão nova do IFC (B7) passa a
 * mexer no orçamento em vez de morrer no visualizador.
 *
 * ---------------------------------------------------------------------
 * AS QUATRO REGRAS QUE MANDAM AQUI
 * ---------------------------------------------------------------------
 *
 * 1. ⚠ NUNCA VINCULAR SOZINHO POR SEMELHANÇA. `sugerir` propõe e devolve
 *    confiança; quem confirma é gente. Casar "Revestimento" com "Revestimento
 *    cerâmico" por parecença já custou caro nesta base — a busca por análogas
 *    orçou limpeza a R$ 3,01 no lugar de revestimento a R$ 1.335. Um vínculo
 *    errado aqui é pior: ele não erra o preço, erra a CONFERÊNCIA, e passa a
 *    dizer que está tudo certo.
 *
 * 2. ⚠ UNIDADE DIFERENTE NÃO SE COMPARA, E NÃO SE CONVERTE. m² com m³ não é
 *    conversão, é outro serviço. O elo é RECUSADO com o motivo na tela — e
 *    não "convertido" com um fator inventado.
 *
 * 3. ⚠ QUANTIDADE ESTIMADA NÃO VALE O MESMO QUE MEDIDA. O `bimqto` já
 *    distingue: `ifc` saiu do BaseQuantities do arquivo; `estimado` saiu da
 *    caixa envolvente da peça. Conferir um orçamento contra uma caixa
 *    envolvente e dizer "diverge 18%" é acusar o orçamento de um erro que é
 *    da medição. A conferência carrega a fonte, e a tela mostra.
 *
 * 4. ⚠ O ELO NÃO MEXE NO ORÇAMENTO SOZINHO. Ele mostra a diferença; aplicar
 *    é ato separado, item a item. Orçamento é dinheiro, e número que muda
 *    sozinho é a coisa que ninguém perdoa.
 * ===================================================================== */
(function (global) {
  "use strict";

  var ENTIDADE = "bim_orc_vinculos";

  /* A régua de texto e a de unidade são as do resto do app (util.js). Réplica
     local existe só porque o motor roda em Node puro nos testes — e perde
     sempre que a de fora existir: duas implementações da mesma regra é o
     defeito que já custou caro nesta base. */
  function U() {
    if (global.Util) return global.Util;
    if (typeof require === "function") { try { return require("./util.js"); } catch (e) { /* Node sem util */ } }
    return null;
  }

  function txt(v) { return String(v == null ? "" : v).trim(); }
  function num(v) { var n = +v; return isFinite(n) ? n : 0; }
  function arr(v) { return Array.isArray(v) ? v : []; }

  /* ---------------------------------------------------------------------
   * A UNIDADE — comparada por CHAVE, nunca pela string crua
   *
   * ⚠ ISTO NÃO É DETALHE. No orçamento real do cliente os 37 itens de área
   *   estão escritos de três jeitos no MESMO documento: "m²" (14), "M2" (20)
   *   e "m2" (3) — porque uns vieram da SINAPI e outros foram digitados. E
   *   ainda há "M"/"m", "M3"/"m³"/"m3", "UN"/"un". Comparando string crua,
   *   147 dos 399 pares legítimos eram recusados por "unidade diferente" —
   *   com a tela dizendo, convicta, que não havia nada para ligar.
   * ------------------------------------------------------------------- */
  function unidadeChave(u) {
    var Ut = U();
    if (Ut && Ut.unidadeChave) return Ut.unidadeChave(u);
    return txt(u).toLowerCase().replace(/²/g, "2").replace(/³/g, "3").replace(/[^a-z0-9]/g, "");
  }
  function mesmaUnidade(a, b) { return unidadeChave(a) === unidadeChave(b); }

  /* ---------------------------------------------------------------------
   * NORMALIZAR TEXTO PARA COMPARAR
   *
   * Só para SUGERIR — nunca para decidir. Ver a regra 1.
   * ------------------------------------------------------------------- */
  function chaveTexto(s) {
    var Ut = U();
    var t = Ut && Ut.normalizar ? Ut.normalizar(s) : txt(s).toLowerCase();
    return t.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  /* palavras que não distinguem serviço nenhum e por isso não podem pesar
     numa sugestão: "de", "em", "para", e as unidades soltas */
  var VAZIAS = { de: 1, do: 1, da: 1, dos: 1, das: 1, em: 1, para: 1, com: 1, e: 1, a: 1, o: 1, no: 1, na: 1, um: 1, uma: 1, por: 1, m: 1, m2: 1, m3: 1, un: 1, kg: 1 };

  /* ⚠ PLURAL EM PORTUGUÊS ZERAVA A CONTA. As categorias do bimqto são plurais
     ("Vigas", "Lajes / Pisos", "Fundações") e as descrições do orçamento são
     singulares ("VIGA DE MADEIRA SERRADA…"). Sem esta redução, "Vigas" e
     "VIGA" são palavras diferentes e a semelhança dá ZERO — que foi
     exatamente o que aconteceu nas 26 categorias contra os 77 itens reais.
     Duas reduções, as duas seguras: o "s" final e o "-oes" para "-ao". */
  function raiz(p) {
    if (p.length > 4 && p.slice(-3) === "oes") return p.slice(0, -3) + "ao";
    if (p.length > 3 && p.slice(-1) === "s") return p.slice(0, -1);
    return p;
  }

  function palavras(s) {
    var vistas = {}, out = [];
    chaveTexto(s).split(" ").forEach(function (p) {
      if (!p || p.length <= 2 || VAZIAS[p]) return;
      /* número puro não descreve serviço: "AF_09/2023", "2,5 MM²" */
      if (/^[0-9]+$/.test(p)) return;
      var r = raiz(p);
      if (VAZIAS[r] || vistas[r]) return;
      vistas[r] = 1; out.push(r);
    });
    return out;
  }

  /* ---------------------------------------------------------------------
   * SEMELHANÇA — cobertura da CATEGORIA, não Jaccard
   *
   * ⚠ JACCARD NÃO SERVE AQUI, e isto foi MEDIDO: nas 26 categorias do bimqto
   *   contra os 77 itens do orçamento real do cliente, o MAIOR valor de
   *   Jaccard que existiu foi 0,167 — e era o casamento certo ("Paredes /
   *   Alvenaria" × "ALVENARIA TIJOLO FURADO, E = 10CM, A REVESTIR"). Nenhuma
   *   das 26 alcançava mínimo nenhum: o recurso nascia mudo.
   *
   *   A razão é estrutural, não de calibragem: a categoria tem 2 palavras e a
   *   descrição da SINAPI tem 15, então a UNIÃO cresce com o tamanho da
   *   descrição e afunda o índice justamente nos itens mais bem descritos.
   *
   *   A pergunta certa é outra: "quanto da CATEGORIA aparece no item?".
   *   As palavras a mais do item não são erro — são detalhe de especificação.
   *   Elas ainda pesam, mas de leve e com teto, para desempatar entre dois
   *   itens que cobrem a categoria igual.
   *
   * ⚠ E O NÚMERO NUNCA CHEGA A 100%. Confiança cheia num casamento por
   *   palavra convida a confirmar sem ler — que é o caminho para conferir o
   *   orçamento contra a categoria errada para sempre.
   * ------------------------------------------------------------------- */
  var CONF_MAX = 0.95;

  function detalhe(categoria, descricao) {
    var A = palavras(categoria), B = palavras(descricao);
    var vazio = { confianca: 0, cobertura: 0, comum: 0, deCategoria: A.length, extras: B.length, palavras: [] };
    if (!A.length || !B.length) return vazio;
    var setB = {}, comuns = [];
    B.forEach(function (p) { setB[p] = 1; });
    A.forEach(function (p) { if (setB[p]) comuns.push(p); });
    if (!comuns.length) return vazio;
    var setA = {};
    A.forEach(function (p) { setA[p] = 1; });
    var extras = B.filter(function (p) { return !setA[p]; }).length;
    var cobertura = comuns.length / A.length;
    var conf = cobertura * (1 - Math.min(0.3, extras * 0.04));
    return {
      confianca: Math.round(Math.min(CONF_MAX, conf) * 100) / 100,
      cobertura: Math.round(cobertura * 100) / 100,
      comum: comuns.length, deCategoria: A.length, extras: extras,
      /* ⚠ a tela mostra QUAIS palavras casaram: um número sozinho não se
         confere, e quem confirma precisa ver por que o app achou isso */
      palavras: comuns
    };
  }

  function semelhanca(a, b) { return detalhe(a, b).confianca; }

  /* ---------------------------------------------------------------------
   * O VÍNCULO
   * ------------------------------------------------------------------- */
  function vinculo(d) {
    d = d || {};
    var obraId = txt(d.obraId), orcamentoId = txt(d.orcamentoId), itemId = txt(d.itemId);
    var categoria = txt(d.categoria);
    if (!obraId || !orcamentoId || !itemId || !categoria) return null;
    return {
      id: txt(d.id) || (orcamentoId + ":" + itemId),
      obraId: obraId,
      orcamentoId: orcamentoId,
      etapaId: txt(d.etapaId),
      itemId: itemId,
      /* o que o item É no orçamento, congelado no momento do elo: serve para
         a tela dizer "este vínculo aponta para um item que mudou de descrição" */
      itemDescricao: txt(d.itemDescricao),
      itemUnidade: txt(d.itemUnidade),
      /* o que ele É no modelo */
      categoria: categoria,
      unidade: txt(d.unidade),
      /* a última conferência */
      qtdModelo: num(d.qtdModelo),
      qtdOrcada: num(d.qtdOrcada),
      fonte: txt(d.fonte),
      conferidoEm: txt(d.conferidoEm),
      criadoPor: txt(d.criadoPor)
    };
  }

  /* ---------------------------------------------------------------------
   * SUGERIR — propõe, não decide
   *
   * ⚠ A UNIDADE É ELIMINATÓRIA, não um critério a mais. Item em m³ e
   *   categoria em m² não são candidatos com confiança baixa: eles não são
   *   candidatos. Deixá-los na lista com 40% faria alguém confirmar no
   *   automático e passar a conferir volume contra área para sempre.
   *
   * ⚠ E NÃO EXISTE FILTRO ESPERTO DE VERBO. Foi tentado: derrubar a confiança
   *   de "DEMOLIÇÃO DE ALVENARIA" ou "REMOÇÃO DE TELHAS" por serem "outro
   *   serviço". É falso — demolir 480 m² de parede confere contra os mesmos
   *   480 m² do modelo, e esse elo é legítimo. O app não tem como saber, e
   *   por isso não chuta: mostra a descrição inteira e quem decide é gente.
   * ------------------------------------------------------------------- */
  function sugerir(levantamento, itens, opts) {
    var o = opts || {};
    var minimo = o.minimo === undefined ? 0.28 : num(o.minimo);
    var linhas = arr(levantamento && levantamento.linhas);
    var lista = arr(itens);
    var jaLigados = {};
    arr(o.jaVinculados).forEach(function (v) { if (v) jaLigados[txt(v.itemId)] = txt(v.categoria); });
    var out = [];

    linhas.forEach(function (l) {
      var un = txt(l.unidade);
      var naUnidade = 0, candidatos = [];
      lista.forEach(function (it) {
        if (!it) return;
        /* regra 2: unidade diferente elimina */
        if (!mesmaUnidade(it.unidade, un)) return;
        naUnidade++;
        /* ⚠ item já ligado a OUTRA categoria não é oferecido de novo: dois
           elos no mesmo item fariam duas conferências brigarem pela mesma
           quantidade, e a última a ser aplicada venceria em silêncio. */
        var preso = jaLigados[txt(it.id)];
        if (preso && preso !== txt(l.categoria)) return;
        var d = detalhe(l.categoria, it.descricao);
        if (d.confianca < minimo) return;
        candidatos.push({
          itemId: txt(it.id), etapaId: txt(it.etapaId),
          descricao: txt(it.descricao), unidade: txt(it.unidade),
          quantidade: num(it.quantidade), confianca: d.confianca,
          comum: d.comum, deCategoria: d.deCategoria, extras: d.extras, palavras: d.palavras,
          jaVinculado: preso === txt(l.categoria)
        });
      });
      candidatos.sort(function (a, b) {
        if (b.confianca !== a.confianca) return b.confianca - a.confianca;
        return a.extras - b.extras;           /* empate: o mais direto primeiro */
      });
      out.push({
        categoria: txt(l.categoria),
        unidade: un,
        qtdModelo: num(l.quantidade),
        fonte: txt(l.fonte),
        nElementos: num(l.nElementos),
        candidatos: candidatos.slice(0, 3),
        naUnidade: naUnidade,
        /* ⚠ nunca "escolhido": a tela apresenta e a pessoa confirma */
        motivo: candidatos.length ? "" : (
          naUnidade
            ? "Nenhum dos " + naUnidade + " itens em " + un + " tem nome parecido com esta categoria."
            : "Nenhum item do orçamento está em " + un + "."
        )
      });
    });
    return out;
  }

  /* ---------------------------------------------------------------------
   * ⚠ "NÃO VEIO DO IFC" NÃO É O MESMO QUE "ESTIMADO"
   *
   * O `bimqto` emite quatro fontes: `ifc` (do BaseQuantities do arquivo),
   * `contagem` (quantas peças existem), `estimado` (da caixa envolvente),
   * `misto` (parte de cada) e `sem-medida`. A primeira versão deste arquivo
   * marcava como confiável APENAS `ifc` — e com isso uma categoria de
   * CONTAGEM saía na tela com o selo "estimado" e o aviso "esta quantidade
   * foi ESTIMADA pela caixa envolvente das peças".
   *
   * Contar seis portas não é estimar: é contar, e o número é exato. Achado
   * ao pintar o modelo por divergência (B21), onde "Portas" com 0% de
   * diferença aparecia na faixa roxa de "divergência não confiável" — um
   * número exato apresentado como suspeito, que é tão ruim quanto o
   * contrário.
   * ------------------------------------------------------------------- */
  var EXATAS = { ifc: 1, contagem: 1 };

  /* ---------------------------------------------------------------------
   * CONFERIR — o orçado bate com o desenhado?
   *
   * ⚠ A TOLERÂNCIA É PERCENTUAL E TEM PISO ABSOLUTO. Só percentual faria
   *   0,2 m² de diferença em 1 m² virar "diverge 20%" — ruído tratado como
   *   problema. Só absoluto deixaria 30 m² passar num item de 3.000 m².
   * ------------------------------------------------------------------- */
  function conferir(vinculos, levantamento, itens, opts) {
    var o = opts || {};
    var tolPct = o.toleranciaPct === undefined ? 5 : num(o.toleranciaPct);
    var tolAbs = o.toleranciaAbs === undefined ? 0.5 : num(o.toleranciaAbs);

    var porCategoria = {};
    arr(levantamento && levantamento.linhas).forEach(function (l) { porCategoria[txt(l.categoria)] = l; });
    var porItem = {};
    arr(itens).forEach(function (it) { if (it && txt(it.id)) porItem[txt(it.id)] = it; });

    var linhas = [], orfaos = [], semMedida = [];
    arr(vinculos).forEach(function (v) {
      if (!v) return;
      var it = porItem[txt(v.itemId)];
      if (!it) {
        /* ⚠ item apagado do orçamento: o vínculo não pode simplesmente sumir
           nem ser aplicado a outro item. Ele vira órfão, com nome, para a
           pessoa decidir. */
        orfaos.push({ vinculo: v, motivo: 'O item "' + txt(v.itemDescricao) + '" não está mais neste orçamento.' });
        return;
      }
      var l = porCategoria[txt(v.categoria)];
      if (!l) {
        semMedida.push({ vinculo: v, item: it, motivo: 'O modelo aberto não tem mais a categoria "' + txt(v.categoria) + '".' });
        return;
      }
      /* a unidade pode ter mudado dos dois lados depois do elo */
      if (!mesmaUnidade(it.unidade, l.unidade)) {
        semMedida.push({
          vinculo: v, item: it,
          motivo: "Unidades deixaram de bater: o orçamento está em " + txt(it.unidade) + " e o modelo mede em " + txt(l.unidade) + ". Não dá para comparar — e converter seria inventar um fator."
        });
        return;
      }

      var qOrc = num(it.quantidade), qMod = num(l.quantidade);
      var dif = qMod - qOrc;
      var pct = qOrc > 0 ? (dif / qOrc) * 100 : (qMod > 0 ? 100 : 0);
      var diverge = Math.abs(dif) > tolAbs && Math.abs(pct) > tolPct;
      linhas.push({
        itemId: txt(it.id),
        descricao: txt(it.descricao),
        unidade: txt(it.unidade),
        categoria: txt(v.categoria),
        qtdOrcada: qOrc,
        qtdModelo: qMod,
        diferenca: Math.round(dif * 100) / 100,
        percentual: Math.round(pct * 10) / 10,
        diverge: diverge,
        /* regra 3: a fonte viaja junto — conferir contra caixa envolvente e
           acusar o orçamento é acusá-lo de um erro que é da medição */
        fonte: txt(l.fonte),
        confiavel: EXATAS[txt(l.fonte)] === 1,
        nElementos: num(l.nElementos)
      });
    });

    /* o que o modelo mede e ninguém orçou, e o que está orçado sem elo */
    var comElo = {};
    arr(vinculos).forEach(function (v) { if (v) { comElo["cat:" + txt(v.categoria)] = 1; comElo["itm:" + txt(v.itemId)] = 1; } });
    var semOrcamento = arr(levantamento && levantamento.linhas)
      .filter(function (l) { return !comElo["cat:" + txt(l.categoria)]; })
      .map(function (l) { return { categoria: txt(l.categoria), unidade: txt(l.unidade), quantidade: num(l.quantidade), fonte: txt(l.fonte) }; });

    linhas.sort(function (a, b) { return Math.abs(b.percentual) - Math.abs(a.percentual); });

    var divergentes = linhas.filter(function (x) { return x.diverge; });
    return {
      linhas: linhas,
      divergentes: divergentes,
      orfaos: orfaos,
      semMedida: semMedida,
      semOrcamento: semOrcamento,
      conferidos: linhas.length,
      tolerancia: { pct: tolPct, abs: tolAbs },
      /* quantos dos conferidos vieram de medida EXATA do IFC */
      medidosNoIfc: linhas.filter(function (x) { return x.confiavel; }).length
    };
  }

  function fraseConferencia(c) {
    if (!c) return "";
    if (!c.conferidos) return "Nenhum item do orçamento está ligado ao modelo ainda.";
    if (!c.divergentes.length) {
      return "Os " + c.conferidos + " itens ligados batem com o modelo, dentro de " +
        c.tolerancia.pct + "%." + (c.semOrcamento.length ? " Mas o modelo mede " + c.semOrcamento.length + " categoria(s) que ninguém orçou." : "");
    }
    var maior = c.divergentes[0];
    return c.divergentes.length + " de " + c.conferidos + " itens divergem do modelo. O maior: " +
      maior.descricao + " — orçado " + maior.qtdOrcada + " " + maior.unidade +
      ", o modelo mede " + maior.qtdModelo + " (" + (maior.percentual > 0 ? "+" : "") + maior.percentual + "%).";
  }

  /* ---------------------------------------------------------------------
   * APLICAR — a quantidade do modelo entra no item
   *
   * ⚠ UM DE CADA VEZ, E DEVOLVENDO O QUE MUDOU. Não existe "aplicar tudo"
   *   aqui de propósito: cada linha é uma decisão sobre dinheiro, e um botão
   *   que reescreve 40 quantidades de uma vez é o tipo de coisa que alguém
   *   clica sem ler e descobre no fechamento do mês.
   *
   * Devolve a INSTRUÇÃO, não o item alterado: quem grava é a tela, pelo
   * caminho normal do orçamento (que recalcula o total e o BDI).
   * ------------------------------------------------------------------- */
  function instrucaoAplicar(linha) {
    if (!linha) return null;
    if (!linha.confiavel) {
      /* não impede — avisa. A caixa envolvente às vezes é a única medida que
         existe, e o engenheiro pode aceitar sabendo o que aceita. */
      /* ⚠ O AVISO TEM DE DESCREVER A FONTE DE VERDADE. Dizer "caixa
         envolvente" sobre uma linha `sem-medida` manda o engenheiro conferir
         uma caixa que não existe. */
      var fo = txt(linha.fonte);
      var pq = fo === "misto" ? "Parte desta quantidade foi ESTIMADA pela caixa envolvente das peças e parte veio do IFC."
        : (fo === "sem-medida" ? "Estas peças não trouxeram geometria nem quantitativo: a quantidade é só a CONTAGEM delas."
          : "Esta quantidade foi ESTIMADA pela caixa envolvente das peças, não medida no IFC.");
      return { itemId: linha.itemId, quantidade: linha.qtdModelo, aviso: pq + " Confira antes de fechar o preço." };
    }
    return { itemId: linha.itemId, quantidade: linha.qtdModelo, aviso: "" };
  }

  /* =====================================================================
   * B21 — A DIVERGÊNCIA EM CIMA DA GEOMETRIA
   *
   * O B10 pinta o modelo pelo que foi MEDIDO. Mas a pergunta que fez o B8
   * existir é outra, e é a mais acionável das duas: onde o orçamento e o
   * desenho DISCORDAM? Ela vive numa tabela, e tabela de vinte linhas não
   * mostra que a discordância está toda na cobertura.
   *
   * ⚠ E AQUI A COR TEM UM PERIGO PRÓPRIO, DIFERENTE DO B10. Uma categoria
   *   medida por CAIXA ENVOLVENTE (`fonte !== "ifc"`) diverge do orçamento
   *   por culpa da MEDIÇÃO, não do orçamento — é a regra 3 deste arquivo.
   *   Pintá-la de vermelho ao lado de uma divergência medida do IFC seria
   *   acusar o orçamentista de um erro que é do arquivo, e as duas ficariam
   *   com a mesma cara. Ela ganha faixa PRÓPRIA, e a legenda diz por quê.
   * =================================================================== */
  var FAIXAS_DIV = [
    { id: "estimado", cor: "#a855f7", rotulo: "Diferença não conclusiva (quantidade não medida no IFC)" },
    { id: "ok",       cor: "#16a34a", rotulo: "Bate com o orçamento" },
    { id: "falta",    cor: "#ea580c", rotulo: "O modelo tem MAIS do que foi orçado" },
    { id: "sobra",    cor: "#0ea5e9", rotulo: "O modelo tem MENOS do que foi orçado" }
  ];

  function faixaDaDivergencia(linha) {
    if (!linha) return null;
    /* ⚠ a fonte manda ANTES do número: sem isso, a caixa envolvente entraria
       na mesma faixa de uma medida exata do IFC */
    if (!linha.confiavel) return FAIXAS_DIV[0];
    if (!linha.diverge) return FAIXAS_DIV[1];
    return num(linha.percentual) > 0 ? FAIXAS_DIV[2] : FAIXAS_DIV[3];
  }

  /* `linhasQto` é o levantamento do BIMQto rodado com `{ comChaves: true }`;
     `conferencia` é o que `conferir` devolveu. */
  function pinturaDeDivergencia(linhasQto, conferencia) {
    var porCat = {};
    arr(conferencia && conferencia.linhas).forEach(function (l) { porCat[txt(l.categoria)] = l; });

    var pinturas = {}, porFaixa = {}, semElo = [], semChaves = [], nPintadas = 0;
    arr(linhasQto).forEach(function (q) {
      if (!q) return;
      var cat = txt(q.categoria);
      var l = porCat[cat];
      if (!l) { semElo.push({ categoria: cat, nElementos: num(q.nElementos) }); return; }
      if (!arr(q.chaves).length) { semChaves.push(cat); return; }
      var f = faixaDaDivergencia(l);
      var acc = porFaixa[f.id] || (porFaixa[f.id] = { id: f.id, cor: f.cor, rotulo: f.rotulo, categorias: [], nPecas: 0 });
      acc.categorias.push({
        categoria: cat, percentual: num(l.percentual),
        qtdOrcada: num(l.qtdOrcada), qtdModelo: num(l.qtdModelo), unidade: txt(l.unidade),
        descricao: txt(l.descricao), fonte: txt(l.fonte)
      });
      arr(q.chaves).forEach(function (k) { if (k) { pinturas[k] = f.cor; acc.nPecas++; nPintadas++; } });
    });

    /* a maior divergência primeiro dentro de cada faixa: é por onde se olha */
    Object.keys(porFaixa).forEach(function (id) {
      porFaixa[id].categorias.sort(function (a, b) { return Math.abs(b.percentual) - Math.abs(a.percentual); });
    });
    var legenda = FAIXAS_DIV.map(function (f) { return porFaixa[f.id]; }).filter(Boolean);
    return { pinturas: pinturas, legenda: legenda, semElo: semElo, semChaves: semChaves, nPintadas: nPintadas };
  }

  function fraseDivergencia(p) {
    if (!p) return "";
    if (!p.nPintadas) {
      if (p.semChaves.length) return "O levantamento foi feito sem as chaves das peças — recarregue os quantitativos para pintar.";
      return "Nenhuma categoria do modelo está ligada ao orçamento ainda.";
    }
    var f = {};
    p.legenda.forEach(function (x) { f[x.id] = x; });
    var partes = [];
    if (f.falta) partes.push(f.falta.categorias.length + " com MAIS no modelo do que no orçamento");
    if (f.sobra) partes.push(f.sobra.categorias.length + " com MENOS");
    if (f.ok) partes.push(f.ok.categorias.length + " batendo");
    var s = p.nPintadas + " peça(s) pintadas: " + (partes.join(", ") || "—") + ".";
    /* ⚠ a faixa estimada é dita SEMPRE que existe: ela é a que não pode ser
       lida como erro de orçamento */
    if (f.estimado) {
      s += " " + f.estimado.categorias.length + " categoria(s) em roxo NÃO foram medidas no IFC (caixa envolvente, mistura ou sem medida) — "
        + "a diferença ali é da medição, não do orçamento, e não se conclui nada dela sem um IFC com quantitativos.";
    }
    if (p.semElo.length) s += " " + p.semElo.length + " categoria(s) sem elo ficaram com a cor original.";
    return s;
  }

  var BimOrc = {
    ENTIDADE: ENTIDADE,
    vinculo: vinculo,
    sugerir: sugerir,
    conferir: conferir,
    fraseConferencia: fraseConferencia,
    instrucaoAplicar: instrucaoAplicar,
    FAIXAS_DIV: FAIXAS_DIV,
    pinturaDeDivergencia: pinturaDeDivergencia,
    fraseDivergencia: fraseDivergencia,
    _faixaDaDivergencia: faixaDaDivergencia,
    _semelhanca: semelhanca,
    _detalhe: detalhe,
    _palavras: palavras,
    _mesmaUnidade: mesmaUnidade
  };

  global.BimOrc = BimOrc;
  if (typeof module !== "undefined" && module.exports) module.exports = BimOrc;
})(typeof window !== "undefined" ? window : this);
