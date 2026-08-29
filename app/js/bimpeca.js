/* =====================================================================
 * bimpeca.js — DO ELEMENTO DO MODELO PARA A PEÇA QUE SE COMPRA.
 *
 * O QUE ESTE ARQUIVO RESOLVE
 * O IFC exportado do Revit já traz, em cada peça, o nome da FAMÍLIA que o
 * projetista usou: "ESG_Serie Normal_Joelho 45_90:Standard",
 * "UT_Bacia com caixa acoplada", "VLV_Registro de gaveta:3/4"".
 * O banco de insumos fala outra língua: "JOELHO 45 GRAUS, PVC, SOLDÁVEL,
 * DN 20 MM", "BACIA SANITARIA (VASO) COM CAIXA ACOPLADA...". Este módulo é a
 * tradução entre os dois — e, principalmente, é onde ele se RECUSA a traduzir
 * quando não tem certeza.
 *
 * ⚠ POR QUE ELE É PURO (sem DOM, sem Store, sem web-ifc)
 * O `js/bim.js` é módulo ES que o Node não consegue exigir, então nada dentro
 * dele entra no gate. Um casador que decide o que o cliente vai COMPRAR não
 * pode ser código sem teste. Aqui a lista de candidatos chega por parâmetro e
 * o arquivo roda em Node — é o mesmo padrão de `js/bimtubo.js`.
 *
 * ⚠ A ARMADILHA CENTRAL, MEDIDA E NÃO SUPOSTA
 * Casar por sobreposição de palavras ACHA A FAMÍLIA E ERRA A PEÇA. Medido na
 * base MG contra o nome real do Revit:
 *
 *     "Tubo PVC Soldavel Agua Fria DN 25"
 *        → TUBO PVC SOLDAVEL DE 20 MM   R$  4,16   \
 *        → TUBO PVC SOLDAVEL DE 25 MM   R$  4,69    |  MESMO score.
 *        → TUBO PVC SOLDAVEL DE 32 MM   R$ 10,12    |  4,2x de preço
 *        → TUBO PVC SOLDAVEL DE 50 MM   R$ 17,43   /   entre eles.
 *
 * O token que decide — "25" — é justamente o que os casadores desta casa
 * descartam por ter menos de 3 letras. Então aqui a BITOLA NÃO É PONTO: é
 * VETO. Divergiu, o candidato cai e o veredito nunca é "ok".
 * É a lição de [[analogas-acerta-o-alvo-errado]]: a doutrina de nunca inventar
 * código protege contra invenção, e NÃO protege contra acertar o alvo errado.
 *
 * ⚠ O QUE ESTE MÓDULO NUNCA FAZ
 *   · não escolhe sozinho quando há empate — devolve a lista e o motivo;
 *   · não inventa código, preço nem unidade;
 *   · não transforma peça sem família em item "ok" (o `e.nome` do app é um
 *     rótulo genérico — "Louça/terminal" — igual para dezenas de peças
 *     diferentes; casar por ele é casar por nada).
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ---------------------------------------------------------------
   * 1. LIMPEZA DO NOME DA FAMÍLIA
   * ------------------------------------------------------------- */

  /* Prefixos de disciplina que o projetista usa como convenção de nome.
     Não são vocabulário — são etiqueta de pasta. Entram na DISCIPLINA e saem
     dos termos, senão "AF" e "ESG" viram palavra buscada na base. */
  var PREFIXO_DISC = {
    ESG: 'esgoto', AF: 'agua-fria', AQ: 'agua-quente', PLUV: 'pluvial',
    AN: 'esgoto', UT: 'louca-metal', USO: 'louca-metal', RES: 'reservatorio',
    VLV: 'registro', INC: 'incendio', GAS: 'gas', DRE: 'drenagem', HID: 'hidraulica'
  };

  /* Palavras que o Revit acrescenta e não descrevem a peça. "Standard" é o
     nome do tipo quando o projetista não deu nome; "Var." idem. */
  var RUIDO = {
    standard: 1, 'var': 1, padrao: 1, default: 1, tipo: 1, tipos: 1, generico: 1,
    generica: 1, mep: 1, shared: 1, num: 1, novo: 1, nova: 1, m: 1, basic: 1,
    wall: 1, floor: 1, roof: 1, family: 1, type: 1, sem: 1, com: 1, de: 1, da: 1,
    do: 1, para: 1, e: 1, ou: 1, no: 1, na: 1, em: 1, a: 1, o: 1, as: 1, os: 1
  };

  function semAcento(s) {
    return String(s == null ? '' : s)
      .replace(/[àáâãäå]/gi, 'a').replace(/[èéêë]/gi, 'e').replace(/[ìíîï]/gi, 'i')
      .replace(/[òóôõö]/gi, 'o').replace(/[ùúûü]/gi, 'u').replace(/[ç]/gi, 'c')
      .replace(/[ñ]/gi, 'n');
  }
  function norm(s) { return semAcento(s).toLowerCase().replace(/\s+/g, ' ').trim(); }

  /* "ESG_Serie Normal_Joelho 45_90:Standard" -> { esquerda, direita, prefixo } */
  function partir(familia) {
    var t = String(familia == null ? '' : familia).trim();
    var i = t.indexOf(':');
    var esq = i >= 0 ? t.slice(0, i) : t;
    var dir = i >= 0 ? t.slice(i + 1) : '';
    /* ⚠ quando as duas metades são iguais, o Revit só repetiu o nome da
       família no tipo. Contar duas vezes inflaria o score de qualquer termo. */
    if (norm(dir) === norm(esq)) dir = '';
    var pre = '';
    var m = /^([A-Za-z]{2,5})_/.exec(esq);
    if (m && PREFIXO_DISC[m[1].toUpperCase()]) pre = m[1].toUpperCase();
    return { esquerda: esq, direita: dir, prefixo: pre };
  }

  /* ---------------------------------------------------------------
   * 2. DIMENSÃO — o veto
   * ------------------------------------------------------------- */

  /* ⚠ ORDEM IMPORTA. "150x150x50" tem de ser lido como um trio ANTES de o
     leitor de milímetros achar três números soltos; e `Ø3/4" (25mm)` traz a
     mesma bitola escrita duas vezes, em unidades diferentes — ler as duas e
     tratá-las como equivalentes é o que faz o veto não reprovar o candidato
     certo. */
  function dimsDe(texto) {
    var t = ' ' + semAcento(String(texto == null ? '' : texto)).toLowerCase()
      .replace(/[Øø]/g, ' ') + ' ';
    var d = { dn: [], pol: [], mm: [], trio: [], graus: [], litros: [] };

    /* ⚠ CADA REGRA CONSOME O QUE LEU. `String.replace` devolve string nova e
       NÃO altera a original — a primeira versão deste bloco descartava o
       retorno, então toda regra lia o texto inteiro de novo. Efeito medido:
       `Ø3/4" (25mm)` saía com polegada [0,75 e 4] (o "4" do denominador,
       relido pela regra de polegada inteira) e `1 1/2"` saía [0,5; 1,5; 2].
       Bitola INVENTADA é pior que bitola faltando: ela VETA o candidato
       certo, e o sintoma seria "não achei" num item que estava lá. */
    function comer(re, fn) { t = t.replace(re, function () { fn.apply(null, arguments); return ' '; }); }

    /* ⚠ "DN 100 X 50 MM" É UMA REDUÇÃO, e as bitolas dela são 100 e 50 —
       não um trio de medidas de caixa. Sem esta separação, o
       `JOELHO PVC COM VISITA, 90 GRAUS, DN 100 X 50 MM` aparecia em 1º lugar,
       com 100% e sem divergência declarada, numa busca por joelho DN 50: a
       regra do trio comia os dois números antes de a regra de bitola vê-los,
       o veto não tinha o que comparar e a peça errada subia com cara de
       conferida. Reduções são justamente as peças em que errar custa mais. */
    comer(/\bdn\s*(\d+)\s*x\s*(\d+)(?:\s*x\s*(\d+))?\s*mm\b/g, function (m, a, b, c) {
      [a, b, c].filter(Boolean).forEach(function (x) { d.dn.push(parseInt(x, 10)); });
      d.reducaoTexto = true;
    });
    /* e "100 X 50 MM" sem o DN na frente é o mesmo caso */
    comer(/(\d+)\s*x\s*(\d+)(?:\s*x\s*(\d+))?\s*mm\b/g, function (m, a, b, c) {
      [a, b, c].filter(Boolean).forEach(function (x) { d.mm.push(parseInt(x, 10)); });
      d.reducaoTexto = true;
    });

    /* trio 150x150x50 / 90x90 / 0.80 x 2.10 — ANTES dos leitores de número
       solto, senão 150x150x50 viraria três milimetragens */
    comer(/(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)(?:\s*x\s*(\d+(?:[.,]\d+)?))?/g, function (m, a, b, c) {
      var v = [a, b, c].filter(Boolean).map(function (x) { return parseFloat(String(x).replace(',', '.')); });
      d.trio.push(v.join('x'));
    });

    /* polegada, da forma mais específica para a mais geral */
    comer(/(\d+)\s+(\d+)\s*\/\s*(\d+)\s*"/g, function (m, i, nn, dd) { d.pol.push(parseInt(i, 10) + parseInt(nn, 10) / parseInt(dd, 10)); });
    comer(/(\d+)\s*\/\s*(\d+)\s*"/g, function (m, nn, dd) { d.pol.push(parseInt(nn, 10) / parseInt(dd, 10)); });
    comer(/(\d+)\s*"/g, function (m, nn) { d.pol.push(parseInt(nn, 10)); });

    comer(/\bdn\s*(\d+)/g, function (m, nn) { d.dn.push(parseInt(nn, 10)); });
    comer(/(\d+(?:[.,]\d+)?)\s*mm\b/g, function (m, nn) { d.mm.push(Math.round(parseFloat(String(nn).replace(',', '.')))); });
    comer(/(\d+)\s*(?:graus|grau|°)/g, function (m, nn) { d.graus.push(parseInt(nn, 10)); });
    comer(/(\d+(?:[.,]\d+)?)\s*(?:l|litros?)\b/g, function (m, nn) { d.litros.push(Math.round(parseFloat(String(nn).replace(',', '.')))); });

    /* DN e mm são a mesma grandeza no vocabulário de tubo: unificar evita que
       "DN 100" e "100 MM" sejam lidos como bitolas diferentes e vetem um ao
       outro. Polegada fica separada porque a conversão é aproximada e virar
       número quebrado aqui produziria falso "diverge". */
    var bit = {};
    d.dn.concat(d.mm).forEach(function (v) { if (v > 0) bit[v] = 1; });
    d.bitola = Object.keys(bit).map(Number).sort(function (a, b) { return a - b; });
    d.pol = d.pol.filter(function (v) { return v > 0 && v <= 24; })
      .sort(function (a, b) { return a - b; });
    d.trio = d.trio.filter(function (v, i, arr) { return arr.indexOf(v) === i; });
    d.graus = d.graus.filter(function (v, i, arr) { return arr.indexOf(v) === i; }).sort();
    d.litros = d.litros.filter(function (v, i, arr) { return arr.indexOf(v) === i; }).sort();
    d.vazio = !d.bitola.length && !d.pol.length && !d.trio.length && !d.graus.length && !d.litros.length;
    return d;
  }

  /* Compara a dimensão do modelo com a do insumo.
     'confere'  — falam da mesma medida
     'diverge'  — falam de medidas diferentes  -> VETO
     'muda'     — um dos dois não declara medida -> não veta, mas não confirma */
  function compararDims(a, b) {
    if (!a || !b || a.vazio || b.vazio) return 'muda';
    /* ⚠ PEÇA RETA NÃO É REDUÇÃO, mesmo compartilhando uma das bitolas.
       `JOELHO ... DN 100 X 50 MM` tem 50 entre as suas medidas e, sem esta
       regra, "confere" com um joelho reto DN 50 — e é outra peça, outro
       preço, outra função. O contrário também vale: pedir uma redução e
       receber uma peça reta. */
    var aRed = !!a.reducaoTexto || (a.bitola || []).length > 1;
    var bRed = !!b.reducaoTexto || (b.bitola || []).length > 1;
    if (aRed !== bRed) return 'diverge';
    /* ⚠ CADA GRANDEZA DECIDE SOZINHA. A primeira versão acumulava
       `houveIgual` GLOBALMENTE sobre as cinco grandezas: bastava UMA concordar
       para o veredito ser "confere", mesmo com a bitola declarada nos dois
       lados e DIVERGENTE.
       Reproduzido com a família real do modelo: `ESG_Serie Normal_Curva 90°
       Curta` com bitola 50 (medida na geometria) contra
       `CURVA 90 GRAUS, PVC, SERIE NORMAL, ESGOTO, DN 100 MM` devolvia
       "confere" → status "ok" → o painel PRÉ-MARCAVA a curva DN 100
       (R$ 29,35) numa rede DN 50 (R$ 9,68). O grau 90 casou e mascarou
       50 × 100. Trinta e sete peças, três vezes o preço — exatamente o
       defeito que o cabeçalho deste arquivo diz existir para não cometer.
       Agora: uma grandeza que os DOIS lados declaram e que diverge REPROVA,
       não importa quantas outras concordem. */
    var grandezas = ['bitola', 'pol', 'trio', 'graus', 'litros'];
    var houveComum = false, todasIguais = true;
    for (var i = 0; i < grandezas.length; i++) {
      var g = grandezas[i], A = a[g] || [], B = b[g] || [];
      if (!A.length || !B.length) continue;
      houveComum = true;
      var igualNesta = false;
      for (var x = 0; x < A.length; x++) {
        for (var y = 0; y < B.length; y++) {
          if (g === 'pol') { if (Math.abs(A[x] - B[y]) < 0.01) igualNesta = true; }
          else if (String(A[x]) === String(B[y])) igualNesta = true;
        }
      }
      if (!igualNesta) todasIguais = false;
    }
    if (!houveComum) return 'muda';
    return todasIguais ? 'confere' : 'diverge';
  }

  /* ---------------------------------------------------------------
   * 2b. UNIDADE — o outro veto, e o que faltava
   *
   * ⚠ O ANEL DE BORRACHA NO LUGAR DO TUBO.
   * Medido no modelo real contra a base real: das 23 linhas que o painel
   * pré-marcava, CINCO apontavam para a junta em vez da peça —
   * `Tipos de tubos:PLUV_Tubo Serie Reforcada` (80 peças, 80 m) ficava com
   * `ANEL BORRACHA, DN 100 MM, PARA TUBO SERIE REFORCADA` [UN, R$ 3,52],
   * enquanto o tubo certo (`TUBO PVC SERIE R DN 100 MM` [M, R$ 31,52]) caía
   * para terceiro. O anel ganha porque a descrição dele CONTÉM o nome do tubo.
   * A bitola confere nos dois — o veto de medida não tem como pegar.
   *
   * O que separa os dois é a UNIDADE: o modelo mediu METRO, o anel se vende
   * por UNIDADE. Pedir 80 m de anel de borracha é um pedido que ninguém
   * consegue atender, e o preço sai 9x errado para baixo.
   * ------------------------------------------------------------- */
  var GRANDEZA_UN = {
    m: 'comprimento', ml: 'comprimento', cm: 'comprimento', mm: 'comprimento',
    m2: 'area', 'm²': 'area', m3: 'volume', 'm³': 'volume',
    un: 'contagem', und: 'contagem', 'un.': 'contagem', pc: 'contagem', pç: 'contagem',
    cj: 'contagem', par: 'contagem', kg: 'massa', t: 'massa', l: 'volume', h: 'tempo'
  };
  function grandezaDaUnidade(u) {
    var k = norm(u).replace(/[.\s]/g, '');
    return GRANDEZA_UN[k] || GRANDEZA_UN[k.replace('2', '²').replace('3', '³')] || '';
  }
  /* 'confere' | 'diverge' | 'muda' (um dos lados não declara) */
  /* tubo/duto se compra por METRO; conexao, louca e registro por UNIDADE.
     E do produto, nao do arquivo — vale mesmo quando o IFC nao mediu. */
  function ehSegmento(tipo) {
    return /^IFC(PIPESEGMENT|DUCTSEGMENT|FLOWSEGMENT|CABLESEGMENT|CABLECARRIERSEGMENT)/.test(String(tipo || '').toUpperCase());
  }
  function compararUnidade(uPeca, uItem) {
    var a = grandezaDaUnidade(uPeca), b = grandezaDaUnidade(uItem);
    if (!a || !b) return 'muda';
    return a === b ? 'confere' : 'diverge';
  }

  /* ---------------------------------------------------------------
   * 3. TERMOS
   * ------------------------------------------------------------- */
  function termosDe(familia, extra) {
    var p = partir(familia);
    var bruto = (p.esquerda + ' ' + p.direita + ' ' + (extra || ''));
    /* tira o prefixo de disciplina do texto — ele já virou disciplina */
    if (p.prefixo) bruto = bruto.replace(new RegExp('\\b' + p.prefixo + '_', 'gi'), ' ');
    bruto = bruto.replace(/\bAN_/gi, ' ');
    var toks = norm(bruto).replace(/[_\-.,;:/()\[\]"]/g, ' ').split(/\s+/);
    var vistos = {}, out = [];
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (!t || t.length < 3) continue;      // "45", "90", "dn" saem daqui: são DIMENSÃO
      /* ⚠ MEDIDA COMPOSTA NAO E PALAVRA. O filtro abaixo so descartava numero
         PURO, entao "150x150x50", "4x2" e "300mm" viravam termo de busca — e
         a base escreve "150 X 150 X 50", com espaco, entao o token nunca casa.
         Medido: 176 de 435 familias das tres fixtures tinham termo com digito.
         A `CAIXA SIFONADA ... DN 150 X 150 X 50 MM` existia na base e a peca
         saia pendente. Medida ja e lida por `dimsDe`; aqui ela so atrapalha. */
      if (/\d/.test(t) && /^[\d.,x]+(mm|cm|m)?$/i.test(t)) continue;
      if (RUIDO[t]) continue;
      if (/^\d+$/.test(t)) continue;         // número puro é medida, não palavra
      if (vistos[t]) continue;
      vistos[t] = 1; out.push(t);
    }
    return out;
  }

  /* ---------------------------------------------------------------
   * 4. DISCIPLINA — três sinais, em ordem de autoridade
   * ------------------------------------------------------------- */
  var POR_CLASSE = {
    IFCPIPESEGMENT: 'hidraulica', IFCPIPEFITTING: 'hidraulica', IFCFLOWSEGMENT: 'hidraulica',
    IFCFLOWFITTING: 'hidraulica', IFCFLOWTERMINAL: 'hidraulica', IFCFLOWCONTROLLER: 'hidraulica',
    IFCSANITARYTERMINAL: 'hidraulica', IFCVALVE: 'hidraulica',
    IFCCABLECARRIERSEGMENT: 'eletrica', IFCCABLESEGMENT: 'eletrica', IFCLIGHTFIXTURE: 'eletrica',
    IFCOUTLET: 'eletrica', IFCSWITCHINGDEVICE: 'eletrica', IFCELECTRICDISTRIBUTIONPOINT: 'eletrica',
    IFCJUNCTIONBOX: 'eletrica', IFCPROTECTIVEDEVICE: 'eletrica',
    IFCWALL: 'arquitetura', IFCWALLSTANDARDCASE: 'arquitetura', IFCSLAB: 'arquitetura',
    IFCDOOR: 'arquitetura', IFCWINDOW: 'arquitetura', IFCCOVERING: 'arquitetura',
    IFCRAILING: 'arquitetura', IFCSTAIR: 'arquitetura', IFCROOF: 'arquitetura',
    IFCPLATE: 'arquitetura', IFCFURNISHINGELEMENT: 'arquitetura',
    IFCBEAM: 'estrutura', IFCCOLUMN: 'estrutura', IFCFOOTING: 'estrutura',
    IFCPILE: 'estrutura', IFCMEMBER: 'estrutura', IFCREINFORCINGBAR: 'estrutura'
  };

  /* ⚠ O SISTEMA É O SINAL MAIS FORTE, e não a heurística sobre o nome.
     Num projeto hidrossanitário real o projetista já escreveu, no IfcSystem,
     "Esgoto - Geral", "Água fria - Distribuição", "Esgoto - Gordura",
     "Esgoto - Ventilação". Isso é classificação de quem desenhou; qualquer
     regra nossa sobre o nome da família é palpite ao lado disso. */
  function subsistemaDe(sistemaIfc) {
    var s = norm(sistemaIfc);
    if (!s) return '';
    if (/agua\s*fria|af\b/.test(s)) return 'agua-fria';
    if (/agua\s*quente/.test(s)) return 'agua-quente';
    if (/gordura/.test(s)) return 'esgoto-gordura';
    if (/ventila/.test(s)) return 'esgoto-ventilacao';
    if (/sabao|secundari/.test(s)) return 'esgoto-secundario';
    if (/esgoto|sanitar/.test(s)) return 'esgoto';
    if (/pluvial|chuva|drenagem/.test(s)) return 'pluvial';
    if (/incendio|hidrante|sprinkler/.test(s)) return 'incendio';
    if (/gas\b/.test(s)) return 'gas';
    if (/eletric|energia|iluminac|tomada/.test(s)) return 'eletrica';
    return '';
  }

  function disciplinaDe(el) {
    var sub = subsistemaDe(el.sistemaIfc);
    if (sub) return { disciplina: sub === 'eletrica' ? 'eletrica' : 'hidraulica', subsistema: sub, origem: 'sistema-do-projeto' };
    var pre = partir(el.familia).prefixo;
    if (pre && PREFIXO_DISC[pre]) {
      var d = PREFIXO_DISC[pre];
      var disc = (d === 'eletrica') ? 'eletrica' : 'hidraulica';
      return { disciplina: disc, subsistema: d, origem: 'prefixo-da-familia' };
    }
    var porCls = POR_CLASSE[String(el.tipo || '').toUpperCase()];
    if (porCls) return { disciplina: porCls, subsistema: '', origem: 'classe-ifc' };
    return { disciplina: '', subsistema: '', origem: 'nao-classificado' };
  }

  /* ---------------------------------------------------------------
   * 5. LEVANTAR — agrupa os elementos em peças compráveis
   * ------------------------------------------------------------- */
  function levantar(elementos, opc) {
    opc = opc || {};
    var porChave = {}, ordem = [];
    var semFamilia = 0, total = 0;

    (elementos || []).forEach(function (e) {
      if (!e) return;
      var n = e.n || 1;
      total += n;
      var fam = String(e.familia || '').trim();
      var temFamilia = !!fam;
      if (!temFamilia) { semFamilia += n; }
      var disc = disciplinaDe(e);
      if (opc.disciplina && disc.disciplina !== opc.disciplina) return;
      if (opc.subsistema && disc.subsistema !== opc.subsistema) return;

      /* ⚠ a chave inclui o SISTEMA: o mesmo joelho em água fria e em esgoto
         são compras diferentes (soldável x série normal), e juntá-los
         entregaria uma linha só que não dá para comprar. */
      /* ⚠ a bitola entra na CHAVE junto com o sistema: luva DN 50 e luva
         DN 100 sao compras diferentes, e a mesma conexao em agua fria
         (soldavel) e em esgoto (serie normal) tambem. Juntar qualquer um dos
         dois pares daria uma linha de requisicao que ninguem consegue pedir. */
      var par = (e.bitolaPar && e.bitolaPar.length) ? e.bitolaPar.join('x') : '';
      var chave = String(e.tipo || '?') + '|' + (fam || '(sem familia)') + '|' + (e.sistemaIfc || '') +
                  (e.bitolaMm > 0 ? '|DN' + e.bitolaMm : '') + (par ? '|RED' + par : '');
      var p = porChave[chave];
      if (!p) {
        var pt = partir(fam);
        /* ⚠ A BITOLA MEDIDA NA GEOMETRIA VALE MAIS QUE O NOME.
         * Medido no modelo hidrossanitario real: 106 de 119 familias ficavam
         * ambiguas so porque o Revit escreve "Luva Simples serie normal" sem
         * dizer o DN — e a base tem a mesma luva em 40/50/75/100/150 mm, com
         * 5x de diferenca de preco entre elas. O raio do IfcCircleProfileDef
         * traz exatamente os DN comerciais. Sem isto o casador acerta a
         * familia e erra a peca, que e o defeito que este modulo existe para
         * nao cometer. Ela ENTRA nas dims, e o veto passa a morder. */
        var dims = dimsDe(fam);
        if (e.bitolaMm > 0) {
          if (dims.bitola.indexOf(e.bitolaMm) < 0) dims.bitola.push(e.bitolaMm);
          dims.bitola.sort(function (a, b) { return a - b; });
          dims.vazio = false;
          dims.bitolaMedida = e.bitolaMm;
        }
        p = porChave[chave] = {
          chave: chave, familia: fam, temFamilia: temFamilia,
          tipo: String(e.tipo || ''), rotulo: String(e.nome || ''),
          sistemaIfc: String(e.sistemaIfc || ''),
          disciplina: disc.disciplina, subsistema: disc.subsistema, origemDisciplina: disc.origem,
          termos: termosDe(fam), dims: dims, bitolaMm: e.bitolaMm || 0,
          /* ⚠ o PAR da reducao viaja separado da bitola unica, e nunca entra
             no veto: comparar "reducao 100x50" como se fosse DN 100 poria a
             peca errada de volta pela porta dos fundos. */
          bitolaPar: par ? e.bitolaPar.slice() : null,
          fonteBitola: e.fonteBitola || (e.bitolaMm > 0 ? 'geometria' : ''),
          nomeCurto: pt.esquerda, variante: pt.direita,
          n: 0, quantidade: 0, unidade: '', fonteQtd: 'contagem', uids: []
        };
        ordem.push(chave);
      }
      p.n += n;
      /* ⚠ SOMA PARCIAL ROTULADA COMO MEDIDA E PIOR QUE SEM MEDIDA.
         Isto acumulava so quem trouxe quantidade e carimbava o total como
         "medido no IFC". Dez tubos de 3 m com sete medidos davam
         "10 pc · 21,00 m medidos no IFC" — são 30 m, pede-se 21, e a linha
         e internamente contraditoria (dez pecas, vinte e um metros) sem que o
         comprador tenha por que desconfiar. Mistura de medido e nao-medido na
         mesma familia e o caso NORMAL: o comprimento mora ora em
         BaseQuantities, ora no pset. Agora contamos os dois lados e a
         procedencia diz a verdade. */
      if (e.quantidade > 0 && e.unidade) {
        p.quantidade += e.quantidade; p.unidade = e.unidade;
        p.nMedidos = (p.nMedidos || 0) + n;
        if (p.fonteQtd !== 'parcial') p.fonteQtd = e.fonteQtd || 'ifc';
      } else {
        p.nSemMedida = (p.nSemMedida || 0) + n;
      }
      if (e.uid && p.uids.length < 200) p.uids.push(e.uid);
    });

    var pecas = ordem.map(function (k) {
      var p = porChave[k];
      /* sem medida do IFC, a quantidade é a CONTAGEM — e isso vai dito, não
         suposto: peça contada e peça medida não valem o mesmo numa compra */
      if (!(p.quantidade > 0)) { p.quantidade = p.n; p.unidade = p.unidade || 'un'; p.fonteQtd = 'contagem'; }
      else if (p.nSemMedida > 0) {
        /* ⚠ PARTE MEDIDA, PARTE NAO. Nao da para somar contagem com metro, e
           nao da para chamar o total de "medido": ele esta INCOMPLETO, e o
           pedido sairia curto. A peca declara isso e quem consome decide —
           a tela mostra o aviso, e o status nunca vira "ok". */
        p.fonteQtd = 'parcial';
        p.faltamMedida = p.nSemMedida;
      }
      return p;
    }).sort(function (a, b) { return b.n - a.n || a.familia.localeCompare(b.familia); });

    return {
      pecas: pecas,
      resumo: {
        elementos: total, pecas: pecas.length, semFamilia: semFamilia,
        porContagem: pecas.filter(function (p) { return p.fonteQtd === 'contagem'; }).length,
        semDisciplina: pecas.filter(function (p) { return !p.disciplina; }).length
      }
    };
  }

  /* ---------------------------------------------------------------
   * 6. CASAR — e, principalmente, recusar
   * ------------------------------------------------------------- */
  var MIN_CONF = 30;

  /* ⚠ TERMO RARO VALE MAIS QUE TERMO COMUM, e a diferença não é teórica:
     na base de MG "pvc" aparece em 19,3% dos insumos e "joelho" em 1,9%.
     Contando os dois igual, um CAP e um TUBO empatavam com um JOELHO por
     compartilharem "serie" e "normal" — seis insumos diferentes, todos a 67%,
     e a peça certa perdida no meio. O peso vem de FORA (quem tem a base
     calcula uma vez, com `pesosDe`); sem ele tudo pesa 1 e o comportamento é
     o de antes, o que mantém o motor utilizável sem base carregada. */
  function pesoDeTermo(peso, t) {
    if (!peso) return 1;
    var df = peso[t];
    if (!(df > 0)) return 1.6;             // termo que nem existe na base: distintivo
    var p = Math.log((peso._n || 1000) / df);
    return p < 0.2 ? 0.2 : (p > 3 ? 3 : p);
  }

  function pontuar(peca, item, sinonimos, peso) {
    var descr = String(item.descricao || '');
    var alvo = norm(descr).replace(/[_\-.,;:/()\[\]"]/g, ' ');
    var toksAlvo = {};
    alvo.split(/\s+/).forEach(function (t) { if (t.length >= 3) toksAlvo[t] = 1; });

    function pesoDe(t) { return pesoDeTermo(peso, t); }
    var achou = 0, tot = 0, viaSinonimo = 0;
    peca.termos.forEach(function (t) { tot += pesoDe(t); });
    if (!tot) tot = 1;
    peca.termos.forEach(function (t) {
      if (toksAlvo[t]) { achou += pesoDe(t); return; }
      /* ⚠ SINÔNIMO É SEGUNDA TENTATIVA, nunca substituição — e por PALAVRA
         INTEIRA. Trocar antes de tentar o termo original foi o que já fez
         "vaso" virar outra coisa nesta base. */
      var sin = sinonimos && sinonimos[t];
      if (!sin) return;
      var arr = Array.isArray(sin) ? sin : [sin];
      for (var i = 0; i < arr.length; i++) {
        var s = norm(arr[i]);
        if (toksAlvo[s] || new RegExp('\\b' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(alvo)) { achou += pesoDe(t); viaSinonimo++; return; }
      }
    });

    var conf = Math.round((achou / tot) * 100);
    var dimAlvo = dimsDe(descr);
    var dim = compararDims(peca.dims, dimAlvo);
    /* a dimensão não SOMA ponto; ela só reprova. Somar faria o candidato
       errado subir por ter mais números na descrição. */
    if (dim === 'diverge') conf = Math.max(0, conf - 60);
    /* ⚠ E A UNIDADE REPROVA MAIS FORTE QUE A MEDIDA. Tubo medido em METRO
       contra anel vendido por UNIDADE não é um candidato pior — é outra
       coisa. O desconto é maior que o da medida porque aqui não há dúvida:
       a grandeza é incompatível, não apenas diferente. */
    /* ⚠ SÓ VETA QUANDO A UNIDADE FOI MEDIDA, NÃO QUANDO NÓS A INVENTAMOS.
       Sem medida no IFC, `levantar` usa a CONTAGEM e carimba 'un' — que é um
       preenchimento nosso, não um fato do modelo. Vetar por ele reprovava o
       candidato CERTO: um tubo sem `Length` no arquivo virava 'un' e o
       `TUBO PVC ... [M]` da base era eliminado, deixando a peça pendente com
       o item exato disponível. Medido: o placar caiu de 1.161 para 175 peças
       casadas até esta guarda entrar. */
    /* ⚠ E QUANDO A QUANTIDADE É CONTAGEM, A GRANDEZA VEM DO TIPO.
       Um tubo sem `Length` no IFC cai na contagem e ganha 'un' de
       preenchimento; sem esta linha o veto desligava e o ANEL DE BORRACHA
       [UN] voltava a ganhar do TUBO [M] — o defeito exato que este bloco
       existe para fechar, só que reaparecendo pela porta dos fundos num
       arquivo mal exportado. Tubo se compra por METRO sempre, tenha o
       arquivo medido ou não: isso é do produto, não do IFC. */
    var uPeca = peca.unidade;
    if (peca.fonteQtd === 'contagem' && ehSegmento(peca.tipo)) uPeca = 'm';
    var uni = (peca.fonteQtd === 'contagem' && !ehSegmento(peca.tipo))
      ? 'muda' : compararUnidade(uPeca, item.unidade);
    if (uni === 'diverge') conf = Math.max(0, conf - 80);
    return { conf: conf, achou: achou, tot: tot, viaSinonimo: viaSinonimo, dim: dim, uni: uni, dimAlvo: dimAlvo };
  }

  /* ⚠ "TEM ALGUMA MEDIDA" NAO E "TEM A BITOLA".
     `dims.vazio` era falso para uma peca que so trouxe o ANGULO no nome
     ("Curva 90°"), e o guarda deixava passar: bitola nenhuma dos dois lados,
     graca ao grau que casou, e o veredito saia "ok". Numa peca de rede a
     bitola e a medida que decide a compra; sem ela nao ha confirmacao
     possivel. Para peca que NAO e de rede (porta, piso, louca) a bitola nao e
     o discriminante, e ai vale a medida que houver. */
  function ehDeRede(tipo) { return /^IFC(PIPE|FLOW|DUCT|VALVE)/.test(String(tipo || '').toUpperCase()); }
  function semBitolaUtil(peca) {
    var d = peca.dims || {};
    if (peca.bitolaPar && peca.bitolaPar.length > 1) return false;   // reducao tem o par
    if (ehDeRede(peca.tipo)) return !((d.bitola || []).length || (d.pol || []).length);
    return !!d.vazio;
  }

  function casar(peca, candidatos, opc) {
    opc = opc || {};
    var sin = opc.sinonimos || null;
    var lista = (candidatos || []).map(function (c) {
      var item = c.item || c;
      var p = pontuar(peca, item, sin, opc.peso || null);
      return {
        item: item, fonte: c.fonte || item.fonte || '',
        conf: p.conf, dim: p.dim, uni: p.uni, achou: p.achou, de: p.tot, viaSinonimo: p.viaSinonimo
      };
    }).filter(function (c) { return c.conf > 0; })
      .sort(function (a, b) {
        if (b.conf !== a.conf) return b.conf - a.conf;
        /* empate no score: quem CONFERE a dimensão passa na frente de quem
           não declara — e quem diverge fica por último */
        var ord = { confere: 0, muda: 1, diverge: 2 };
        /* unidade decide antes da medida: e ela que separa o anel [UN] do tubo [M] */
        if (ord[a.uni] !== ord[b.uni]) return ord[a.uni] - ord[b.uni];
        return (ord[a.dim] - ord[b.dim]);
      });

    var acima = lista.filter(function (c) { return c.conf >= MIN_CONF; });
    var status = 'pendente', porque = '';

    if (!peca.temFamilia) {
      status = 'pendente';
      porque = 'a peça não traz nome de família no modelo — só o rótulo genérico do tipo, que é igual para dezenas de peças diferentes';
    } else if (!acima.length) {
      status = 'pendente';
      porque = 'nenhum insumo da base ficou acima do mínimo de confiança';
    } else {
      var topo = acima[0];
      var empatados = acima.filter(function (c) { return c.conf === topo.conf; });
      if (topo.uni === 'diverge') {
        /* ⚠ UNIDADE INCOMPATÍVEL VEM ANTES DE TUDO. É o caso do anel de
           borracha [UN] no lugar do tubo [M], em que a bitola confere nos dois
           e só a grandeza denuncia — medido no modelo real, cinco das 23
           linhas pré-marcadas apontavam para a junta e não para a peça. */
        status = 'ambiguo';
        porque = 'o melhor candidato é vendido em ' + (topo.item.unidade || '?') +
                 ' e o modelo mediu em ' + (peca.unidade || '?') + ' — são coisas diferentes';
      } else if (topo.dim === 'diverge') {
        status = 'ambiguo';
        porque = 'o melhor candidato tem outra bitola/medida — a do modelo é ' + resumoDim(peca.dims, peca.bitolaPar);
      } else if (empatados.length > 1) {
        status = 'ambiguo';
        porque = empatados.length + ' insumos empatam em ' + topo.conf + '%' +
          (empatados.some(function (c) { return c.dim === 'muda'; }) ? ' e nenhum declara a medida que decidiria' : '');
      } else if (semBitolaUtil(peca)) {
        /* o modelo não disse a medida. Um único candidato forte ainda é uma
           escolha honesta, mas ela não pode passar como confirmada. */
        status = 'ambiguo';
        porque = 'não dá para confirmar a bitola: o modelo não a traz para esta peça';
      } else if (topo.dim === 'muda') {
        status = 'ambiguo';
        porque = 'o insumo não declara a medida que o modelo traz (' + resumoDim(peca.dims, peca.bitolaPar) + ')';
      } else {
        status = 'ok';
        porque = 'nome e medida conferem (' + resumoDim(peca.dims, peca.bitolaPar) + ')';
      }
    }
    return { candidatos: lista.slice(0, opc.max || 8), status: status, porque: porque, empate: acima.length ? acima.filter(function (c) { return c.conf === acima[0].conf; }).length : 0 };
  }

  function resumoDim(d, par) {
    if (par && par.length > 1) return 'reducao ' + par.join(' x ') + ' mm';
    if (!d || d.vazio) return 'sem medida';
    var p = [];
    if (d.bitola.length) p.push('DN ' + d.bitola.join('/'));
    if (d.pol.length) p.push(d.pol.map(function (v) { return polTexto(v); }).join('/') + '"');
    if (d.trio.length) p.push(d.trio.join(' '));
    if (d.graus.length) p.push(d.graus.join('/') + '°');
    if (d.litros.length) p.push(d.litros.join('/') + ' L');
    return p.join(' · ');
  }
  function polTexto(v) {
    var i = Math.floor(v), f = v - i;
    var fr = { 0.25: '1/4', 0.5: '1/2', 0.75: '3/4', 0.125: '1/8', 0.375: '3/8', 0.625: '5/8' };
    var k = null;
    for (var kk in fr) if (Math.abs(f - parseFloat(kk)) < 0.01) k = fr[kk];
    if (!k) return String(Math.round(v * 100) / 100);
    return (i ? i + ' ' : '') + k;
  }

  /* ---------------------------------------------------------------
   * 6b. BITOLA DAS CONEXÕES, PELA TOPOLOGIA DA REDE
   *
   * A bitola do TUBO vem da geometria (o raio do perfil circular). A da
   * CONEXÃO não vem: o Revit exporta joelho, luva e tê como malha facetada,
   * sem perfil. Medido no projeto hidrossanitário real: 1.725 tubos com
   * bitola, 4.201 conexões sem — e sem bitola a conexão fica ambígua contra
   * a base, porque a mesma luva existe em 40/50/75/100/150 mm.
   *
   * MAS A REDE SABE. Um fato do arquivo real, já medido quando se fez a
   * numeração dos ramais: TUBO NUNCA É VIZINHO DE TUBO — entre dois tubos há
   * sempre uma conexão. Então a conexão está, por construção, encostada em
   * tubos cuja bitola nós conhecemos.
   *
   * ⚠ E AQUI MORA O PERIGO DESTE ARQUIVO INTEIRO: REDUÇÃO.
   * Bucha de redução, tê de redução e redução excêntrica ligam bitolas
   * DIFERENTES — é a função delas. Dar um DN único a uma redução é pedir a
   * peça errada na loja, e ela chegaria com cara de conferida. Por isso:
   *   · vizinhança com UM valor  -> bitola resolvida;
   *   · vizinhança com DOIS ou mais -> é transição: guarda o PAR e NUNCA
   *     vira bitola única;
   *   · e o par NÃO se propaga adiante — quem está depois da redução tem a
   *     bitola do lado dele, não a mistura dos dois.
   *
   * ⚠ E A PROCEDÊNCIA VIAJA. Bitola medida na geometria e bitola deduzida da
   * vizinhança não valem o mesmo, e quem compra precisa saber de qual das
   * duas veio o número. `fonteBitola` diz: 'geometria' | 'topologia' | ''.
   * ------------------------------------------------------------- */
  var SALTOS_MAX = 4;   /* teto de propagação: rede real tem ciclo, e um laço
                           sem freio andaria para sempre. Quatro saltos já
                           alcançam a conexão mais distante de um tubo nos
                           arranjos que aparecem no arquivo real. */

  /* ⚠ A PEÇA QUE DIZ, NO NOME, QUE MUDA DE BITOLA — NUNCA RECEBE DN ÚNICO.
   *
   * Esta lista não é enfeite: ela veio de uma medição que reprovou a primeira
   * versão deste algoritmo. Rodando no projeto hidrossanitário real, 111
   * reduções ganharam DN ÚNICO — `AF_Soldavel_Te_Reducao` (59 peças) saiu como
   * "DN 25", `Reducao Excentrica` (19) como "DN 50", buchas de redução (33)
   * como "DN 40". Cada uma dessas compraria a peça errada, com cara de
   * conferida.
   *
   * A CAUSA: a propagação decidia "valor único" pelo que já era conhecido
   * NAQUELA onda. Uma redução com um lado ainda desconhecido parece
   * inequívoca — e é justamente a peça em que os dois lados diferem por
   * definição. Vizinhança incompleta não é vizinhança concordante.
   *
   * O nome que o projetista escreveu é evidência tão boa quanto a rede, e
   * chega antes dela. */
  var DIZ_TRANSICAO = /reduc|reduç|bucha\s*de\s*red|adaptador|te[_\s-]*reduc|luva\s*de\s*red/i;

  /* ⚠ E TERMINAL NÃO TEM BITOLA DE COMPRA. Uma bacia sanitária se compra pelo
   * modelo, não por DN; a caixa d'água, por litro. A rede acusou a bacia como
   * "25x100" (água fria de um lado, esgoto do outro) e a caixa como
   * "25x32x50x60" — verdade sobre as ligações, e irrelevante para o pedido.
   * Deixar isso virar bitola só põe ruído no casamento. */
  function ehTerminal(tipo) { return /TERMINAL$/.test(String(tipo || '').toUpperCase()); }

  function bitolasPorTopologia(elementos, topo) {
    topo = topo || {};
    var portaDe = topo.portaDe || {}, ligacao = topo.ligacao || {}, portasDe = topo.portasDe || {};
    var porUid = {}, semTopo = 0;

    (elementos || []).forEach(function (e) {
      if (!e || !e.uid) return;
      porUid[e.uid] = {
        uid: e.uid, tipo: e.tipo || '', familia: e.familia || '',
        mm: e.bitolaMm > 0 ? [e.bitolaMm] : [],
        fonte: e.bitolaMm > 0 ? 'geometria' : '',
        saltos: e.bitolaMm > 0 ? 0 : -1,
        reducao: false,
        parcial: false,
        declaraTransicao: DIZ_TRANSICAO.test(e.familia || ''),
        /* terminal fica de fora da propagação: bacia se compra por modelo,
           caixa d'água por litro — bitola ali é ruído no casamento */
        foraDaBitola: ehTerminal(e.tipo)
      };
      if (!portasDe[e.uid]) semTopo++;
    });

    function vizinhos(uid) {
      var ps = portasDe[uid] || [], out = [];
      for (var i = 0; i < ps.length; i++) {
        var outra = ligacao[ps[i]];
        if (outra == null) continue;
        var alvo = portaDe[outra];
        if (alvo && alvo !== uid) out.push(alvo);
      }
      return out;
    }

    /* ondas: na 1ª só quem tem bitola de GEOMETRIA semeia; nas seguintes,
       quem já resolveu na onda anterior. Reduções não semeiam nunca. */
    var mudou = true, onda = 0;
    while (mudou && onda < SALTOS_MAX) {
      mudou = false; onda++;
      Object.keys(porUid).forEach(function (uid) {
        var r = porUid[uid];
        if (r.foraDaBitola) return;                // terminal nao entra
        /* ⚠ A TRANSIÇÃO CONTINUA COLETANDO ATÉ ESTABILIZAR.
           Ela congelava na primeira onda: uma bucha entre um tubo já medido e
           um joelho que só resolveria na onda seguinte saía como
           "redução 50" em vez de "redução 100 x 50". Ficava segura — nunca
           virava DN único — mas a linha da requisição dizia menos do que a
           rede sabia, e é justamente na redução que o comprador precisa dos
           dois lados para pedir a peça certa. */
        if (r.fonte && !(r.reducao && r.parcial)) return;
        var vals = {};
        vizinhos(uid).forEach(function (v) {
          var n = porUid[v];
          /* ⚠ só herda de vizinho com bitola ÚNICA e de onda anterior.
             Herdar de uma redução espalharia a mistura 100/50 rede afora. */
          if (!n || !n.fonte || n.reducao || n.mm.length !== 1) return;
          if (n.saltos >= onda) return;
          vals[n.mm[0]] = 1;
        });
        var lista = Object.keys(vals).map(Number).sort(function (a, b) { return a - b; });
        if (!lista.length) return;
        /* quando ja e transicao parcial, so muda se a rede acrescentou lado */
        if (r.reducao && r.parcial) {
          var novos = {};
          r.mm.concat(lista).forEach(function (x) { novos[x] = 1; });
          var uniao = Object.keys(novos).map(Number).sort(function (a, b) { return a - b; });
          if (uniao.length > r.mm.length) {
            r.mm = uniao; r.saltos = onda; mudou = true;
            if (uniao.length > 1) r.parcial = false;   // achou o outro lado
          }
          return;
        }
        if (lista.length > 1) {
          /* transição medida: guarda o par e PARA. Não é bitola única, e não
             semeia — quem está depois da redução tem a bitola do lado dele,
             não a mistura dos dois. */
          r.mm = lista; r.fonte = 'topologia'; r.reducao = true; r.saltos = onda; mudou = true;
          return;
        }
        /* ⚠ UM VALOR SÓ NÃO BASTA quando a peça declara que muda de bitola.
           Ver DIZ_TRANSICAO: 111 reduções saíram com DN único na primeira
           versão porque o outro lado ainda não tinha resolvido. */
        if (r.declaraTransicao) {
          r.mm = lista; r.fonte = 'topologia'; r.reducao = true; r.parcial = true;
          r.saltos = onda; mudou = true;
          return;
        }
        r.mm = lista; r.fonte = 'topologia'; r.saltos = onda; mudou = true;
      });
    }

    var res = { geometria: 0, topologia: 0, reducao: 0, reducaoParcial: 0, terminal: 0, semBitola: 0, semTopologia: semTopo, ondas: onda };
    Object.keys(porUid).forEach(function (u) {
      var r = porUid[u];
      if (r.fonte === 'geometria') res.geometria++;
      else if (r.reducao) { res.topologia++; res.reducao++; if (r.parcial) res.reducaoParcial++; }
      else if (r.fonte === 'topologia') res.topologia++;
      else if (r.foraDaBitola) res.terminal++;
      else res.semBitola++;
    });
    return { porUid: porUid, resumo: res };
  }

  /* Aplica o resultado da topologia sobre a lista de elementos, para o
     `levantar` receber a bitola já resolvida.
     ⚠ A REDUÇÃO NÃO GANHA `bitolaMm`: ela ganha `bitolaPar`, que entra na
     chave de agrupamento e na descrição, e NUNCA no veto de bitola única —
     senão "redução 100x50" seria comparada como se fosse uma peça DN 100. */
  function aplicarTopologia(elementos, mapa) {
    (elementos || []).forEach(function (e) {
      var r = mapa && mapa.porUid && mapa.porUid[e.uid];
      if (!r || !r.fonte) return;
      e.fonteBitola = r.fonte;
      if (r.reducao) { e.bitolaPar = r.mm.slice(); e.bitolaMm = 0; }
      else if (!(e.bitolaMm > 0)) e.bitolaMm = r.mm[0];
    });
    return elementos;
  }

  /* ---------------------------------------------------------------
   * 7. ADAPTADOR PARA A REQUISIÇÃO
   * ------------------------------------------------------------- */

  /* ⚠ TEXTO DO IFC VIRANDO FÓRMULA. A descrição sai do nome que o projetista
     digitou no Revit e pode começar com `=`, `+`, `-` ou `@` — no Excel isso
     vira fórmula, e o item chega ao fornecedor como #NOME?. Mesmo cuidado que
     `js/bimtuboxls.js` já toma na planilha de tubos. */
  function seguro(t) {
    var s = String(t == null ? '' : t).replace(/[\r\n\t]+/g, ' ').trim();
    return /^[=+\-@]/.test(s) ? "'" + s : s;
  }

  /* `escolhas` = { <chave da peça>: item escolhido (ou null para pendente) }.
     Quem escolhe é a pessoa na tela; este adaptador só formata. */
  function paraRequisicao(pecas, escolhas) {
    escolhas = escolhas || {};
    var itens = [], pendentes = 0;
    (pecas || []).forEach(function (p) {
      var it = escolhas[p.chave];
      var temItem = !!(it && it.codigo);
      if (!temItem) pendentes++;
      var descr = temItem ? it.descricao : (p.familia || p.rotulo || 'peça do modelo');
      /* ⚠ O PAR DA REDUCAO TEM DE VIR JUNTO. Esta linha chamava `resumoDim`
         SEM o segundo argumento — e a reducao guarda o par FORA de `dims`, de
         proposito. Resultado: o painel mostrava "reducao 25 x 32 mm" e a linha
         que o comprador le saia como "AF_Soldavel_Bucha de Reducao Longa",
         pelada. Trinta e tres buchas para pedir sem saber de qual para qual —
         na peca que este arquivo declara ser a mais cara de errar. */
      var medida = resumoDim(p.dims, p.bitolaPar);
      itens.push({
        codigo: temItem ? String(it.codigo) : '',
        /* a medida entra na descrição da linha pendente: sem ela, "Luva
           Simples" no papel do comprador não diz qual comprar */
        descricao: seguro(descr + (!temItem && medida !== 'sem medida' ? ' — ' + medida : '')),
        unidade: (temItem && it.unidade) || p.unidade || 'un',
        quantidade: p.quantidade,
        /* ⚠ SEM PREÇO CHUTADO. A pendente vai com 0 e o consumidor tem de
           dizer que o total é PARCIAL — requisição dispara aprovação por
           VALOR, e um total subestimado pode passar por baixo do limite de
           quem precisava aprovar. */
        precoRef: temItem ? (Number(it.custoUnitario) || 0) : 0,
        categoria: 'MAT',
        fonte: temItem ? (it.fonte || '') : '',
        pendente: !temItem,
        origemBim: {
          chave: p.chave, familia: p.familia, tipo: p.tipo,
          sistema: p.sistemaIfc || '', subsistema: p.subsistema || '',
          bitolaMm: p.bitolaMm || 0, bitolaPar: p.bitolaPar || null,
          fonteBitola: p.fonteBitola || '', fonteQtd: p.fonteQtd,
          faltamMedida: p.faltamMedida || 0, pecas: p.n
        }
      });
    });
    return {
      itens: itens,
      pendentes: pendentes,
      /* o valor que a tela mostra tem de vir com esta ressalva junto */
      totalParcial: pendentes > 0
    };
  }

  /* Pré-preenche o formulário de insumo próprio a partir da peça.
     ⚠ NÃO inventa preço: o campo vai vazio e quem digita é o usuário. */
  function paraInsumoProprio(peca) {
    var medida = resumoDim(peca.dims, peca.bitolaPar);
    return {
      descricao: seguro(peca.familia + (medida !== 'sem medida' ? ' — ' + medida : '')),
      unidade: peca.unidade || 'un',
      categoria: 'MAT',
      preco: 0,
      origemBim: { chave: peca.chave, familia: peca.familia, tipo: peca.tipo, bitolaMm: peca.bitolaMm || 0 }
    };
  }

  /* Frequencia de cada termo na base. Quem tem a lista calcula UMA vez e
     passa em `opc.peso` — fica aqui para nao existirem duas contagens
     diferentes dando pesos diferentes ao mesmo termo. */
  function pesosDe(itens) {
    var df = { _n: (itens || []).length || 1 };
    (itens || []).forEach(function (x) {
      var it = x.item || x, vis = {};
      norm(String(it.descricao || '')).replace(/[^a-z0-9]+/g, ' ').split(' ').forEach(function (t) {
        if (t.length < 3 || vis[t]) return;
        vis[t] = 1; df[t] = (df[t] || 0) + 1;
      });
    });
    return df;
  }

  var BimPeca = {
    levantar: levantar,
    casar: casar,
    paraRequisicao: paraRequisicao,
    paraInsumoProprio: paraInsumoProprio,
    bitolasPorTopologia: bitolasPorTopologia,
    aplicarTopologia: aplicarTopologia,
    seguro: seguro,
    dimsDe: dimsDe,
    pesosDe: pesosDe,
    termosDe: termosDe,
    compararDims: compararDims,
    compararUnidade: compararUnidade,
    grandezaDaUnidade: grandezaDaUnidade,
    disciplinaDe: disciplinaDe,
    subsistemaDe: subsistemaDe,
    partir: partir,
    resumoDim: resumoDim,
    MIN_CONF: MIN_CONF
  };

  global.BimPeca = BimPeca;
  if (typeof module !== "undefined" && module.exports) module.exports = BimPeca;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
