/* =====================================================================
 * licitacaodocs.js — PACOTE DE DOCUMENTOS DA PROPOSTA DE LICITAÇÃO
 *
 * O órgão entrega a planilha dele; o licitante aplica o desconto (js/licitacao.js)
 * e precisa sair com a PROPOSTA completa no timbrado da empresa: carta, resumo,
 * planilha, analítico, composições, quantitativos, curva ABC, cronograma, BDI e
 * encargos. Este módulo monta esse pacote a partir do orçamento (já com desconto)
 * + dados da empresa + a leitura do PDF do órgão (`config.licitacao.leitura`).
 *
 * ⚠ UMA FONTE DE VALORES. Todo número de dinheiro deste documento sai de
 *   `Orcamento.calcular(orc).linhas` (preço e custo de cada item) e o total é
 *   `Licitacao.totalProposta(orc)`. A carta, o resumo, a planilha, a curva ABC e o
 *   cronograma batem com ele ao centavo — se não baterem, `montar` RECUSA com o
 *   motivo (proposta com dois valores diferentes é causa de desclassificação). Os
 *   insumos já vêm reescalados pelo desconto (js/licitacao.js, `_escalarInsumos`):
 *   NUNCA reescalar de novo aqui.
 *
 * ⚠ NADA É INVENTADO. Dado da empresa que falta sai como `[PREENCHER: ...]` em
 *   vermelho; encargo, cronograma ou BDI que o pacote não trouxe viram
 *   "PENDÊNCIA: ..."; composição auxiliar que a base não tem entra como "sem
 *   detalhamento na base". A leitura do PDF por OCR perde acento e espaço: a
 *   descrição só é trocada pela da base quando o CÓDIGO existe nela e o texto lido é
 *   o mesmo (sem acento/espaço) ou muito parecido — nunca por outro texto.
 *
 * Módulo PURO até a paginação: `montar`/`html` não tocam o DOM. `paginar` é a
 * única função que usa o DOM (mede a página real e quebra tabela em linhas), e só
 * é chamada por quem mostra o documento (tela do app ou o navegador sem tela da
 * simulação). ES5 de propósito (ver CLAUDE.md).
 * ===================================================================== */
(function (global) {
  "use strict";

  function _dep(nome) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") {
      try { var m = require("./" + nome.toLowerCase() + ".js"); if (m) return m; } catch (e) {}
    }
    return null;
  }
  function U() { return _dep("Util"); }
  function O() { return _dep("Orcamento"); }
  function L() { return _dep("Licitacao"); }
  function s(v) { return String(v == null ? "" : v).trim(); }
  function nm(v) { var u = U(); return u ? u.num(v) : (Number(v) || 0); }
  function esc(v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ---------------- números no padrão da proposta ---------------- */
  function arr(x, c) {
    var f = Math.pow(10, c), sg = x < 0 ? -1 : 1;
    return sg * Math.round(Math.abs(x) * f + 1e-9) / f;
  }
  function fmt(n, c) {
    n = Number(n) || 0;
    var t = arr(n, c).toFixed(c), neg = t.charAt(0) === "-";
    if (neg) t = t.slice(1);
    var p = t.split(".");
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (neg ? "-" : "") + p.join(",");
  }
  function R(n) { return "R$ " + fmt(n, 2); }          // R$ 1.234,56
  function R4(n) { return "R$ " + fmt(n, 4); }         // custo com 4 casas, como no modelo
  function P(n) { return fmt(n, 2) + "%"; }
  function C8(n) { return fmt(n, 8); }                  // coeficiente com 8 casas
  function cap(t) { t = s(t); return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }

  /* ---------------- texto: sem acento, sem espaço, parecença ---------------- */
  function norm(t) {
    var x = String(t == null ? "" : t).toUpperCase();
    try { x = x.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
    return x.replace(/[^A-Z0-9]/g, "");
  }
  function lev(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur[0] = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      }
      var t = prev; prev = cur; cur = t;
    }
    return prev[b.length];
  }
  /* 0..1 sobre os textos normalizados */
  function parecido(a, b) {
    var x = norm(a), y = norm(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    return 1 - lev(x, y) / Math.max(x.length, y.length);
  }
  var LIM_PARECIDO = 0.8;

  /* ---------------- categorias ---------------- */
  var CAT_ROT = { MO: "Mão de Obra", MAT: "Material", EQ: "Equipamento Custo Horário", OUTROS: "Serviços" };
  var CAT_ROT_Q = { MO: "Mão de Obra", MAT: "Material", EQ: "Equipamento", OUTROS: "Serviço" };
  var CATS = ["MO", "MAT", "EQ", "OUTROS"];
  /* categoria de exibição do insumo: composição auxiliar é "OUTROS" (serviço), em qualquer base */
  function catDe(i) {
    if (i && String(i.tipo || "").toUpperCase() === "COMPOSICAO") return "OUTROS";
    var c = String((i && i.categoria) || "").toUpperCase();
    return (c === "MO" || c === "MAT" || c === "EQ") ? c : "OUTROS";
  }

  /* ---------------- datas e prazos por extenso ---------------- */
  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  function dataExtensoUpper(d) {
    d = (d instanceof Date) ? d : new Date(d || Date.now());
    if (isNaN(d.getTime())) d = new Date();
    return (d.getDate() + " de " + MESES[d.getMonth()] + " de " + d.getFullYear()).toUpperCase();
  }
  /* "6 meses" → "06 (seis) meses". Texto que não segue esse jeito sai como veio. */
  function prazoExt(txt) {
    var t = s(txt), m = t.match(/^(\d{1,3})\s*(mes|meses|mês|dia|dias|semana|semanas|ano|anos)\b(.*)$/i);
    /* número puro ("90", como o CertamePRO grava comercial.prazoExecucao) = dias */
    if (!m && /^\d{1,3}$/.test(t)) m = [t, t, "dias", ""];
    if (!m) return t;
    var n = parseInt(m[1], 10), u = U(), ext = u && u.valorExtenso ? u.valorExtenso(n).replace(/ (reais|real)$/, "") : "";
    if (!ext) return t;
    var un = m[2].toLowerCase(); if (un === "mes") un = "mês";
    return (n < 10 ? "0" + n : String(n)) + " (" + ext + ") " + un + m[3];
  }
  /* "6 meses" / "06 (seis) meses" / "120 dias" / "2 semanas" -> dias (mês = 30 dias, a mesma conta do cronograma). Texto que não
     segue esse jeito (ex.: "seis meses", "a combinar") -> null: quem chama trata como divergência, nunca como igual. */
  function diasDoTexto(txt) {
    var x = String(txt == null ? "" : txt).toLowerCase();
    try { x = x.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
    /* Não ancora no início ("até 120 dias", "prazo de 120 dias"), mas só lê número COLADO a uma unidade de tempo e fora de
       outro número ("1.200 dias" não é 200): "item 120" não é prazo. Mais de uma leitura e elas discordam
       ("6 meses e 10 dias") -> null: quem chama trata como divergência, nunca escolhe uma. */
    var re = /(^|[^\d.,])(\d{1,4})\s*(?:\([^)]*\)\s*)?(dias?|meses|mes|semanas?|anos?)\b/g, m, achados = [];
    while ((m = re.exec(x)) !== null) {
      var n = parseInt(m[2], 10), u = m[3];
      achados.push(/^dia/.test(u) ? n : (/^mes/.test(u) ? n * 30 : (/^semana/.test(u) ? n * 7 : n * 360)));
      re.lastIndex = m.index + m[0].length;
    }
    if (!achados.length) return /^\s*\d{1,4}\s*$/.test(x) ? parseInt(x, 10) : null;   // número puro = dias
    for (var k = 1; k < achados.length; k++) if (achados[k] !== achados[0]) return null;
    return achados[0];
  }
  /* texto comparável: sem acento, sem caixa, só letras e números separados por um espaço */
  function normObj(t) { return semAcento(t).replace(/[^a-z0-9]+/g, " ").replace(/^ | $/g, ""); }
  /* OBJETO da carta. Ordem: opcoes.objeto -> lic.objeto (lido do edital) -> obra.nome -> orc.nome. O nome do orçamento costuma
     ser o do órgão ("MUNICIPIO DE ..."): resultado igual ao nome do órgão/cliente, ou só "MUNICIPIO/PREFEITURA DE X", não é
     objeto e a carta sai com [PREENCHER: objeto] (nunca o nome do órgão no lugar do que se contrata). */
  function objetoDaCarta(orc, lic, opcoes) {
    var cand = [["opcoes", s(opcoes.objeto)], ["edital", s(lic.objeto)], ["obra", s(orc.obra && orc.obra.nome)], ["orcamento", s(orc.nome)]];
    var esc0 = null, k;
    for (k = 0; k < cand.length; k++) if (cand[k][1]) { esc0 = cand[k]; break; }
    var nomes = [s(lic.orgao && lic.orgao.nome), s(orc.cliente && typeof orc.cliente === "object" ? orc.cliente.nome : orc.cliente)].filter(Boolean);
    if (!esc0) return { texto: "", origem: "", invalido: true, motivo: "o orçamento não tem objeto nem nome de obra", comparou: nomes.length > 0 };
    var n = normObj(esc0[1]), motivo = "";
    nomes.forEach(function (x) { if (!motivo && normObj(x) === n) motivo = "o texto é o nome do órgão/cliente (\"" + esc0[1] + "\")"; });
    if (!motivo && /^(municipio|prefeitura( municipal)?|camara( municipal)?|governo) (de|do|da|dos|das) [a-z0-9]+( [a-z0-9]+){0,3}$/.test(n)) motivo = "o texto é só o nome do município (\"" + esc0[1] + "\")";
    return { texto: motivo ? "" : esc0[1], origem: esc0[0], invalido: !!motivo, motivo: motivo, comparou: nomes.length > 0 };
  }
  /* Início da validade como vem do edital. "da data de abertura" sozinho deixa a frase da carta manca
     ("é de 90 dias, da data de abertura"): começo em da/de/do ganha "contados". "a contar", "contados" e "a partir" ficam como estão. */
  function contagemValidade(inicio) {
    var x = s(inicio).replace(/[\s.]+$/, "");
    return /^d[aeo]s?\s/i.test(x) ? "contados " + x.charAt(0).toLowerCase() + x.slice(1) : x;
  }
  function validadeExt(dias) {
    var n = parseInt(dias, 10);
    if (!(n > 0)) return "";
    var u = U(), ext = u && u.valorExtenso ? u.valorExtenso(n).replace(/ (reais|real)$/, "") : "";
    return n + (ext ? " (" + ext + ")" : "") + " dias";
  }

  /* =====================================================================
   * BASE DE REFERÊNCIA (SEINFRA etc.) — para descrição pelo código e composições auxiliares
   * `baseDe(pacote)`: pacote = { tabela, mes, uf, desonerado, fonte, dados:[composições] }
   * ===================================================================== */
  function baseDe(pacote) {
    if (!pacote) return null;
    var dados = Array.isArray(pacote.dados) ? pacote.dados : (Array.isArray(pacote) ? pacote : []);
    var comp = {}, ins = {}, i, j;
    for (i = 0; i < dados.length; i++) {
      var c = dados[i];
      if (!c || c.codigo == null) continue;
      comp[String(c.codigo)] = c;
      var lst = Array.isArray(c.insumos) ? c.insumos : [];
      for (j = 0; j < lst.length; j++) {
        var x = lst[j];
        if (x && x.codigo != null && !ins[String(x.codigo)]) ins[String(x.codigo)] = x;
      }
    }
    return {
      tabela: s(pacote.tabela), mes: s(pacote.mes), uf: s(pacote.uf), desonerado: pacote.desonerado,
      fonte: s(pacote.fonte),
      obter: function (cod) { return comp[String(cod)] || null; },
      insumo: function (cod) { return ins[String(cod)] || null; },
      total: dados.length
    };
  }

  /* =====================================================================
   * ENCARGOS SOCIAIS lidos do PDF — parse em blocos A/B/C/D
   * O PDF do órgão traz DUAS tabelas (desonerada e não desonerada) e as linhas de
   * total vêm sem código. Aqui: separa os blocos, ordena as linhas por grupo, une
   * os totais lidos e escolhe a tabela do regime do orçamento.
   * ===================================================================== */
  var ENC_NOMES = {
    A1: "INSS", A2: "SESI", A3: "SENAI", A4: "INCRA", A5: "SEBRAE", A6: "Salário Educação",
    A7: "Seguro Contra Acidentes de Trabalho", A8: "FGTS", A9: "SECONCI",
    B1: "Repouso Semanal Remunerado", B2: "Feriados", B3: "Auxílio - Enfermidade", B4: "13º Salário",
    B5: "Licença Paternidade", B6: "Faltas Justificadas", B7: "Dias de Chuvas", B8: "Auxílio Acidente de Trabalho",
    B9: "Férias Gozadas", B10: "Salário Maternidade",
    C1: "Aviso Prévio Indenizado", C2: "Aviso Prévio Trabalhado", C3: "Férias Indenizadas",
    C4: "Depósito Rescisão Sem Justa Causa", C5: "Indenização Adicional",
    D1: "Reincidência de Grupo A sobre Grupo B",
    D2: "Reincidência de Grupo A sobre Aviso Prévio Trabalhado e Reincidência do FGTS sobre Aviso Prévio Indenizado"
  };
  var ENC_ORDEM = (function () {
    var o = [], g = { A: 9, B: 10, C: 5, D: 2 }, k, n;
    for (k in g) for (n = 1; n <= g[k]; n++) o.push(k + n);
    return o;
  })();

  /* "01/2026" ou "2026-01" -> "2026-01"; outra coisa volta como veio */
  function vigAAAAMM(v) {
    v = s(v);
    var m = /^(\d{1,2})\/(\d{4})$/.exec(v);
    if (m) return m[2] + "-" + (m[1].length < 2 ? "0" + m[1] : m[1]);
    return v;
  }

  function parseEncargos(leitura) {
    var linhas = leitura && leitura.encargos && Array.isArray(leitura.encargos.linhas) ? leitura.encargos.linhas : [];
    if (!linhas.length) return { ok: false, motivo: "encargos não informados" };
    var blocos = [], blo = null, ordemG = ["A", "B", "C", "D"], i;
    function novoBloco() { return { linhas: [], totais: [], geral: null, nTot: 0 }; }
    blo = novoBloco();
    for (i = 0; i < linhas.length; i++) {
      var l = linhas[i] || {}, cod = s(l.codigo), desc = s(l.descricao);
      var h = nm(l.horista), m = nm(l.mensalista);
      if (!cod && !desc) {                      // linha de TOTAL lida: vale o grupo que veio nela (a posição só em leitura antiga)
        var qual = s(l.total) || (blo.nTot < 4 ? ordemG[blo.nTot] : "GERAL");
        if (qual === "GERAL") { blo.geral = { horista: h, mensalista: m }; blocos.push(blo); blo = novoBloco(); continue; }
        blo.totais.push({ grupo: qual, horista: h, mensalista: m });
        blo.nTot++;
        continue;
      }
      /* Valor nulo NÃO é "Não incide" por si só: só B1, B2 e B7 do mensalista não incidem (tabela oficial). O resto vira
         "valor não lido" (decidido abaixo, com o código já recuperado). Soma como zero. O CertamePRO troca None por 0:
         B1/B2/B7 mensalista zero em tabela de fonte oficial também é "Não incide". */
      blo.linhas.push({ codigo: cod, descricao: desc, horista: h, mensalista: m, mNulo: l.mensalista == null, mZero: l.mensalista != null && m === 0, hNulo: l.horista == null });
    }
    if (blo.linhas.length || blo.nTot) blocos.push(blo);
    if (!blocos.length) return { ok: false, motivo: "encargos não informados" };

    /* escolha do bloco: o do regime do orçamento. Na tabela DESONERADA o INSS patronal (A1) é zero. */
    /* Regime: a tabela que o CertamePRO manda (leitura.encargos, com `fonte` e `desonerado`) diz o próprio regime e vale
       primeiro; senão, o regime das tabelas do edital (leitura.tabelas). */
    var encObj = leitura && leitura.encargos ? leitura.encargos : null;
    var encReg = encObj && (encObj.desonerado === true || encObj.desonerado === false) ? encObj.desonerado : null;
    var tabReg = leitura && leitura.tabelas ? leitura.tabelas.desonerado : null;
    var regimeLido = encReg != null ? encReg : tabReg;
    var regimeSabido = regimeLido === true || regimeLido === false;
    var desonerado = regimeLido === true;
    var fonteOficial = !!(leitura && leitura.regimeConfirmado) || !!(encObj && s(encObj.fonte) && /oficial|sinapi/i.test(s(encObj.fonte)));
    var tabelaDeFonte = !!(encObj && s(encObj.fonte) && encReg != null);
    var avisosRegime = [];
    if (encReg != null && (tabReg === true || tabReg === false) && tabReg !== encReg) avisosRegime.push("o regime da tabela de encargos (" + (encReg ? "desonerado" : "não desonerado") + ") difere do regime das tabelas do edital (" + (tabReg ? "desonerado" : "não desonerado") + "); vale o da tabela de encargos");
    function inss(b) {
      for (var k = 0; k < b.linhas.length; k++) if (b.linhas[k].codigo === "A1") return b.linhas[k].horista;
      return null;
    }
    /* A1 (INSS patronal) na tabela oficial atual: desonerado de 0 a 10% (reoneração gradual, Lei 14.973/2024), não desonerado 20%.
       Com regime conhecido e UM bloco, ele serve se o A1 não contradiz o regime (desonerado com A1 de 0 a 10; não desonerado com
       A1 maior que zero). */
    function a1Combina(v) { return v != null && (desonerado ? (v >= 0 && v <= 10) : v > 0); }
    /* ESCOLHA PELO INSS (A1). Com mais de um bloco com A1: não desonerado = o de MAIOR A1, desonerado = o de MENOR
       (A1 igual = não confirma). Bloco sem A1 é ignorado (o primeiro lido pode vir sem A1 e não pode derrubar a escolha).
       Com um bloco só com A1 (ou um só no total), vale o A1 contra o regime. Tabela vinda da base (EncargosTab) ou do
       CertamePRO (fonte + desonerado) já traz o regime: confirmada. */
    var esc = null, porRegra = false;
    if (leitura && leitura.regimeConfirmado && blocos.length === 1) { esc = blocos[0]; porRegra = true; }
    else if (tabelaDeFonte && blocos.length === 1) { esc = blocos[0]; porRegra = true; }
    else if (regimeSabido && blocos.length > 1) {
      var comA1 = blocos.filter(function (b2) { return inss(b2) != null; });
      if (comA1.length >= 2) {
        var mx = comA1[0], mn = comA1[0];
        comA1.forEach(function (b2) { if (inss(b2) > inss(mx)) mx = b2; if (inss(b2) < inss(mn)) mn = b2; });
        if (inss(mx) > inss(mn)) { esc = desonerado ? mn : mx; porRegra = true; }
      } else if (comA1.length === 1 && a1Combina(inss(comA1[0]))) { esc = comA1[0]; porRegra = true; }
    } else if (regimeSabido && blocos.length === 1) {
      if (a1Combina(inss(blocos[0]))) { esc = blocos[0]; porRegra = true; }
    }
    var avisos = avisosRegime.slice();
    if (!esc) { esc = blocos[0]; avisos.push("não foi possível confirmar qual tabela de encargos é a do regime do orçamento; usada a primeira lida. Conferir."); }
    else if (blocos.length > 1) avisos.push("o PDF traz " + blocos.length + " tabelas de encargos; usada a do regime " + (desonerado ? "desonerado" : "não desonerado"));

    /* códigos: o OCR perde alguns (B5 virou "85"); recupera pelo texto, dentro do mesmo grupo */
    var usados = {}, grupoAtual = "A", out = [];
    esc.linhas.forEach(function (l) { if (ENC_NOMES[l.codigo]) usados[l.codigo] = true; });
    esc.linhas.forEach(function (l) {
      var cod = ENC_NOMES[l.codigo] ? l.codigo : "";
      if (!cod) {
        var melhor = "", mp = 0.5;
        ENC_ORDEM.forEach(function (c2) {
          if (usados[c2] || c2.charAt(0) < grupoAtual) return;
          var p = parecido(l.descricao, ENC_NOMES[c2]);
          if (p > mp) { mp = p; melhor = c2; }
        });
        if (melhor) { cod = melhor; usados[cod] = true; avisos.push("código " + melhor + " recuperado pelo texto lido (\"" + l.descricao + "\")"); }
      }
      if (cod) grupoAtual = cod.charAt(0);
      var nome = l.descricao;
      if (cod && ENC_NOMES[cod] && parecido(l.descricao, ENC_NOMES[cod]) >= 0.4) nome = ENC_NOMES[cod];
      var ehNI = cod === "B1" || cod === "B2" || cod === "B7", ni = false, mNL = false;
      if (l.mNulo) { if (ehNI) ni = true; else mNL = true; }
      else if (l.mZero && ehNI && fonteOficial) ni = true;
      if (mNL || l.hNulo) avisos.push("valor não lido na linha " + (cod || "sem código") + " (" + nome + "): " + (l.hNulo ? "horista" : "mensalista") + "; a linha sai como PENDÊNCIA");
      out.push({ codigo: cod, grupo: cod ? cod.charAt(0) : "", descricao: nome, horista: l.horista, mensalista: l.mensalista, mensalistaNI: ni, mensalistaNL: mNL, horistaNL: !!l.hNulo });
    });
    /* grupos */
    var grupos = [], gi;
    for (gi = 0; gi < 4; gi++) {
      var g = ordemG[gi];
      var ls = out.filter(function (x) { return x.grupo === g; });
      var lido = null;
      esc.totais.forEach(function (t) { if (t.grupo === g) lido = t; });
      var sh = 0, sm = 0;
      ls.forEach(function (x) { sh += x.horista; sm += x.mensalista; });
      sh = arr(sh, 2); sm = arr(sm, 2);
      var linhasG = ls.slice();
      /* total lido maior que a soma das linhas: falta linha na leitura. A diferença entra COMO
         diferença, marcada — nunca como um item com código/nome inventado. */
      if (lido && (Math.abs(lido.horista - sh) > 0.005 || Math.abs(lido.mensalista - sm) > 0.005)) {
        var dh = arr(lido.horista - sh, 2), dm = arr(lido.mensalista - sm, 2);
        if (dh >= -0.005 && dm >= -0.005) {
          linhasG.push({ codigo: "", grupo: g, descricao: "(linha não lida do PDF do órgão: diferença para o total do grupo)", horista: dh, mensalista: dm, diferenca: true });
          avisos.push("grupo " + g + ": " + (dh ? fmt(dh, 2) + "%" : "") + " / " + fmt(dm, 2) + "% não lidos como linha; entram como diferença para o total lido");
        } else {
          avisos.push("grupo " + g + ": a soma das linhas lidas (" + fmt(sh, 2) + "% / " + fmt(sm, 2) + "%) passa do total lido (" + fmt(lido.horista, 2) + "% / " + fmt(lido.mensalista, 2) + "%)");
        }
      }
      grupos.push({ grupo: g, linhas: linhasG, horista: lido ? lido.horista : sh, mensalista: lido ? lido.mensalista : sm, lido: !!lido, somaLinhas: { horista: sh, mensalista: sm } });
    }
    var tot = esc.geral;
    var somaGrupos = { horista: 0, mensalista: 0 };
    grupos.forEach(function (g2) { somaGrupos.horista += g2.horista; somaGrupos.mensalista += g2.mensalista; });
    somaGrupos.horista = arr(somaGrupos.horista, 2); somaGrupos.mensalista = arr(somaGrupos.mensalista, 2);
    if (tot && (Math.abs(tot.horista - somaGrupos.horista) > 0.015 || Math.abs(tot.mensalista - somaGrupos.mensalista) > 0.015)) {
      avisos.push("A+B+C+D lido (" + fmt(tot.horista, 2) + "% / " + fmt(tot.mensalista, 2) + "%) difere da soma dos grupos (" + fmt(somaGrupos.horista, 2) + "% / " + fmt(somaGrupos.mensalista, 2) + "%)");
    }
    if (!tot) avisos.push("total A+B+C+D não lido; mostrada a soma dos grupos");
    var tabelaFonte = null;
    if (tabelaDeFonte) tabelaFonte = { fonte: s(encObj.fonte), uf: s(encObj.uf).toUpperCase(), vigencia: vigAAAAMM(encObj.vigencia), oficial: fonteOficial };
    return { ok: true, grupos: grupos, total: tot || somaGrupos, avisos: avisos, desonerado: desonerado, regimeSabido: (regimeSabido || !!(leitura && leitura.regimeConfirmado)) && porRegra, tabelaFonte: tabelaFonte };
  }

  /* =====================================================================
   * BDI lido do PDF — grupos Despesas Indiretas / Benefício / Impostos
   * ===================================================================== */
  var BDI_NOMES = {
    AC: "Administração central", DF: "Despesas financeiras", R: "Riscos", SG: "Garantia/seguros",
    L: "Lucro", COFINS: "COFINS", ISS: "ISS", PIS: "PIS", CPRB: "CPRB (desoneração da folha)"
  };
  var BDI_COD = { SG: "S+G" };
  function parseBdi(leitura, pctOrc) {
    var b = leitura && leitura.bdi;
    var linhas = b && Array.isArray(b.linhas) ? b.linhas : [];
    if (!linhas.length) return { ok: false, motivo: "composição do BDI não informada" };
    var nomesGrupo = ["Despesas Indiretas", "Benefício", "Impostos"], grupos = [], cur = { nome: nomesGrupo[0], itens: [], totalLido: null }, avisos = [];
    linhas.forEach(function (l) {
      var sg = s(l.sigla).toUpperCase();
      if (sg === "TOTAL") {
        cur.totalLido = nm(l.pct); grupos.push(cur);
        cur = { nome: nomesGrupo[grupos.length] || ("Grupo " + (grupos.length + 1)), itens: [], totalLido: null };
        return;
      }
      var nome = BDI_NOMES[sg] || s(l.descricao);
      cur.itens.push({ sigla: BDI_COD[sg] || sg, descricao: nome, pct: nm(l.pct) });
    });
    if (cur.itens.length) { cur.nome = cur.nome + " (sem total lido)"; grupos.push(cur); avisos.push("grupo sem linha de total na leitura"); }
    /* BDI em mais de 3 grupos (ex.: A a F, um por parcela, e os impostos juntos no último): o nome padrão por
       posição não vale. Grupo só de impostos = "Impostos"; grupo de uma parcela = o nome dela. */
    if (grupos.length > 3) grupos.forEach(function (g, gi) {
      if (/sem total lido/.test(g.nome)) return;
      var imp = g.itens.length > 0 && g.itens.every(function (i) { return /^(ISS|COFINS|PIS|CPRB)$/.test(String(i.sigla).toUpperCase()); });
      g.nome = imp ? "Impostos" : (g.itens.length === 1 ? g.itens[0].descricao : "Grupo " + (gi + 1));
    });
    grupos.forEach(function (g) {
      var sm = 0; g.itens.forEach(function (i) { sm += i.pct; });
      g.soma = arr(sm, 2);
      if (g.totalLido != null && Math.abs(g.totalLido - g.soma) > 0.015) avisos.push(g.nome + ": total lido " + fmt(g.totalLido, 2) + "% difere da soma das linhas " + fmt(g.soma, 2) + "%");
    });
    var impresso = b.impresso != null ? nm(b.impresso) : null;
    if (impresso != null && pctOrc != null && Math.abs(impresso - pctOrc) > 0.005) {
      avisos.push("BDI impresso no PDF do órgão (" + fmt(impresso, 2) + "%) difere do BDI do orçamento (" + fmt(pctOrc, 2) + "%)");
    }
    var corrigidas = linhas.filter(function (l) { return l && l.corrigido_de != null; });
    corrigidas.forEach(function (l) { avisos.push("linha " + s(l.sigla) + ": valor lido " + fmt(nm(l.corrigido_de), 2) + "% corrigido para " + fmt(nm(l.pct), 2) + "% na leitura"); });
    /* BDI da composição IMPRESSA: a fórmula do acórdão 2622/2013 sobre as linhas lidas
       [ (1 + AC + S + R + G) x (1 + DF) x (1 + L) / (1 - I) ] - 1. Sigla fora desse conjunto = não calcula (usa o "conta" da leitura). */
    var pc = {}, desconhecida = false;
    grupos.forEach(function (g) { g.itens.forEach(function (i) {
      var k = String(i.sigla).toUpperCase();
      if (!/^(AC|S|G|R|SG|S\+G|DF|L|ISS|COFINS|PIS|CPRB)$/.test(k)) desconhecida = true;
      pc[k] = (pc[k] || 0) + i.pct;
    }); });
    var calculado = null;
    if (!desconhecida) {
      var f = function (k) { return (pc[k] || 0) / 100; };
      var imp = f("ISS") + f("COFINS") + f("PIS") + f("CPRB");
      if (imp < 1) calculado = ((1 + f("AC") + f("S") + f("G") + f("R") + f("SG") + f("S+G")) * (1 + f("DF")) * (1 + f("L")) / (1 - imp) - 1) * 100;
    }
    if (calculado == null && b.conta != null) calculado = nm(b.conta);
    /* Incoerente = a proposta difere do BDI calculado pela fórmula E TAMBÉM do impresso pelo órgão (0,01). Linhas impressas com
       2 casas podem dar 21,17% onde o órgão imprime 21,15%: igual ao impresso é arredondamento, não erro. Sem impresso vale o
       calculado, com tolerância de 0,05. */
    var difCalc = (calculado != null && pctOrc != null) ? Math.abs(calculado - pctOrc) : 0;
    var incoerente = false;
    if (calculado != null && pctOrc != null) {
      if (impresso != null) incoerente = difCalc > 0.01 && Math.abs(impresso - pctOrc) > 0.01;
      else incoerente = difCalc > 0.05;
      if (!incoerente && impresso != null && difCalc > 0.01) avisos.push("as linhas impressas dão " + fmt(calculado, 2) + "% pela fórmula, o órgão imprime " + fmt(impresso, 2) + "% e a proposta usa " + fmt(pctOrc, 2) + "% (diferença de arredondamento das linhas)");
    }
    var msg = incoerente ? ("Composição do órgão dá " + fmt(calculado, 2) + "%" + (impresso != null ? " (impresso " + fmt(impresso, 2) + "%)" : "") + ", a proposta usa " + fmt(pctOrc, 2) + "%. Reduza por desconto nos preços, que mantém o BDI, ou ajuste a composição no documento antes de enviar.") : "";
    return { ok: true, grupos: grupos, impresso: impresso, conta: b.conta != null ? nm(b.conta) : null, avisos: avisos, calculado: calculado, incoerente: incoerente, msgIncoerente: msg };
  }

  /* =====================================================================
   * MONTAR — todos os dados do pacote (sem HTML)
   * `opcoes`: { base (baseDe), objeto, data, prazo, validade, prazoInicio, cidade }
   * ===================================================================== */
  function empresaResolvida(emp) {
    emp = emp || {};
    var faltando = [];
    function pega(chave, rotulo, alt) {
      var v = s(emp[chave]) || s(alt);
      if (!v) faltando.push(rotulo);
      return v;
    }
    var r = {
      nome: pega("nome", "razão social"),
      cnpj: pega("cnpj", "CNPJ"),
      inscricaoMunicipal: pega("inscricaoMunicipal", "inscrição municipal"),
      endereco: pega("endereco", "endereço"),
      telefone: pega("telefone", "telefone", emp.contato),
      email: pega("email", "e-mail"),
      banco: pega("banco", "banco"),
      agencia: pega("agencia", "agência"),
      conta: pega("conta", "conta corrente"),
      socioNome: pega("socioNome", "nome do sócio administrador"),
      socioCargo: pega("socioCargo", "cargo do sócio", ""),
      rtNome: pega("rtNome", "nome do responsável técnico", emp.responsavel),
      rtCrea: pega("rtCrea", "CREA do responsável técnico", emp.crea),
      timbradoTopo: s(emp.timbradoTopo) || s(emp.logo),
      timbradoFundo: s(emp.timbradoFundo),
      timbradoPagina: s(emp.timbradoPagina),
      timbradoMargens: emp.timbradoMargens || null,
      certame: emp._certame === true,
      faltando: faltando
    };
    return r;
  }

  /* EMPRESA DO CERTAME. Com `lic.licitante` (pacote do CertamePRO), os documentos usam SÓ ele: campo vazio
     fica vazio (vira [PREENCHER: ...]) e NUNCA é completado com a empresa da conta. O timbrado vem do
     guardado por CNPJ (Licitacao.guardarTimbrado), não de config.licitacao. Sem licitante, devolve
     `empConta` como veio. */
  var CAMPOS_EMP = ["nome", "cnpj", "inscricaoMunicipal", "endereco", "telefone", "email", "banco", "agencia", "conta",
    "socioNome", "socioCargo", "rtNome", "rtCrea"];
  function temLicitante(lic) { var Lc = L(); return !!(Lc && Lc.temLicitante && Lc.temLicitante(lic)); }
  function empresaDoCertame(lic, empConta) {
    if (!temLicitante(lic)) return empConta || {};
    var l = lic.licitante, o = { _certame: true }, Lc = L();
    CAMPOS_EMP.forEach(function (k) { o[k] = s(l[k]); });
    var tb = Lc.timbradoDe ? Lc.timbradoDe(l.cnpj) : { topo: "", fundo: "" };
    o.timbradoTopo = tb.topo; o.timbradoFundo = tb.fundo;
    /* papel timbrado de página inteira (A4 com logo e rodapé): fundo de cada folha, com as margens que ele deixa livres */
    o.timbradoPagina = s(tb.pagina); o.timbradoMargens = tb.pagina ? (tb.margens || null) : null;
    return o;
  }

  function cidadeDe(orc, lic, opcoes) {
    var c = s(opcoes && opcoes.cidade) || s(orc && orc.obra && orc.obra.local) || "";
    return c.replace(/\s*\/\s*/g, "-").toUpperCase();
  }

  /* =====================================================================
   * CRONOGRAMA ELABORADO (quando o pacote não traz o do órgão)
   * Devolve o MESMO formato da leitura ({meses, etapas:[{etapa, descricao, meses:{"1":{pct}}}]}), para
   * reaproveitar a conta de valores ao centavo. Critério pelo NOME da etapa (sem acento):
   *   fim (testado primeiro): desmobilização, limpeza final/geral, recebimento -> 100% no último mês
   *   contínua: administração local, manutenção do canteiro -> igual em todos os meses
   *   início: mobilização, serviços preliminares, canteiro, instalações provisórias -> 100% no mês 1
   *   demais: em sequência, na ordem da planilha; o custo acumulado mapeia uma janela [a,b] em [0,nMeses]
   *           e o % de cada mês é a sobreposição da janela com o mês.
   * Etapa de valor zero: 100% no mês 1. nMeses = 1: tudo no mês 1. % com 2 casas; o último mês com
   * valor absorve o resto (soma exatamente 100,00).
   * ===================================================================== */
  var CRONO_CRITERIO = "Critério: mobilização e serviços preliminares no 1º mês; administração local distribuída por igual em todos os meses; demais serviços em sequência, na ordem da planilha e proporcionais ao custo; desmobilização e limpeza final no último mês.";
  function semAcento(t) {
    var x = String(t == null ? "" : t).toLowerCase();
    try { x = x.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
    return x;
  }
  function classeEtapa(nome) {
    var n = semAcento(nome);
    /* Ancorado de propósito: "LIMPEZA GERAL DO TERRENO", "RECEBIMENTO E ESTOCAGEM" e "CANTEIROS AJARDINADOS" são
       serviços do meio da obra, não o fim nem o começo. */
    if (/desmobiliza|limpeza final|limpeza geral da obra|recebimento (provis|definit)/.test(n)) return "fim";
    if (/administracao|adm\.? local|manutencao do canteiro/.test(n)) return "cont";
    if (/mobiliza|servicos? preliminar|(instala|implanta)cao do canteiro|canteiro de obras?|instalacoes? provis/.test(n)) return "ini";
    return "seq";
  }
  function elaborarCronograma(porEtapa, nMeses) {
    nMeses = Math.max(1, parseInt(nMeses, 10) || 1);
    var lista = (porEtapa || []).map(function (E) {
      return { E: E, valor: Number(E.comBdi) || 0, cls: classeEtapa(E.nome), p: [] };
    }), m, i;
    function zera(o) { o.p = []; for (m = 0; m < nMeses; m++) o.p.push(0); }
    var seq = lista.filter(function (o) { return o.cls === "seq" && o.valor > 0; });
    var totSeq = 0; seq.forEach(function (o) { totSeq += o.valor; });
    var cum = 0;
    lista.forEach(function (o) {
      zera(o);
      if (nMeses === 1 || !(o.valor > 0)) { o.p[0] = 100; return; }
      if (o.cls === "fim") { o.p[nMeses - 1] = 100; return; }
      if (o.cls === "cont") { for (m = 0; m < nMeses; m++) o.p[m] = 100 / nMeses; return; }
      if (o.cls === "ini") { o.p[0] = 100; return; }
      var a = cum / totSeq * nMeses, b = (cum + o.valor) / totSeq * nMeses;
      cum += o.valor;
      for (m = 0; m < nMeses; m++) {
        var ov = Math.min(b, m + 1) - Math.max(a, m);
        o.p[m] = ov > 1e-9 ? ov / (b - a) * 100 : 0;
      }
    });
    var etapas = lista.map(function (o) {
      var r = o.p.map(function (x) { return arr(x, 2); }), soma = 0, ult = -1, maior = 0;
      for (i = 0; i < r.length; i++) { soma += r[i]; if (o.p[i] > 1e-9) ult = i; if (o.p[i] > o.p[maior]) maior = i; }
      if (ult < 0) ult = 0;
      /* O resto (centavo do arredondamento) vai para o último mês com valor. Se isso o deixasse NEGATIVO (muitos meses
         arredondados para cima), vai para o mês de maior valor: o mês que ficasse negativo era descartado e a soma passava de 100,00. */
      var resto = arr(100 - arr(soma, 2), 2);
      if (r[ult] + resto < -1e-9) ult = maior;
      r[ult] = arr(r[ult] + resto, 2);
      var ms = {};
      r.forEach(function (x, k) { if (x > 0) ms[String(k + 1)] = { pct: x }; });
      return { etapa: s(o.E.codigo) || String((o.E.idx || 0) + 1), descricao: s(o.E.nome), meses: ms };
    });
    return { meses: nMeses, etapas: etapas, elaborado: true };
  }

  function montar(orc, empresa, opcoes) {
    opcoes = opcoes || {};
    var Orc = O(), Lic = L(), Ut = U();
    if (!orc || !Orc || !Lic) return { ok: false, erro: "Orçamento ou módulo de licitação indisponível." };
    var lic = Lic.cfg(orc);
    if (!lic || !lic.ativo) return { ok: false, erro: "O orçamento não está em modo licitação." };
    /* Em "BDI sobre o preço final" a planilha não tem preço unitário com BDI: a proposta no modelo do órgão não fecha. */
    if (Orc.garantirConfig(orc).bdiIncidencia === "final") return { ok: false, erro: "O pacote da proposta usa o BDI no preço unitário. Em Parâmetros do orçamento, troque a incidência do BDI para \"preço unitário\" e gere de novo." };
    var leitura = (lic.leitura && typeof lic.leitura === "object") ? lic.leitura : null;
    var pend = { preencher: [], conferencia: [], dados: [], licitante: [] };

    var valor = arr(Lic.totalProposta(orc), 2);
    var calc = Orc.calcular(orc);
    var linhas = (calc.linhas || []).filter(function (x) { return !x.opcional; });
    if (!linhas.length) return { ok: false, erro: "O orçamento não tem itens." };
    var bdiPct = orc.bdi ? nm(orc.bdi.percentual) : 0;
    /* prazo de execução lido do edital (dias): manda na carta e no cronograma */
    var prazoDias = (lic.prazoExecucaoDias > 0) ? Math.floor(lic.prazoExecucaoDias) : 0;
    /* número do documento = o do órgão. Item acrescentado pela pessoa nunca pode sair com número que o órgão já usa. */
    var numOrg = {}, dupOrg = {}, colidiu = [];
    linhas.forEach(function (Ln) {
      var k = s(Ln.item && Ln.item.numeroOrigem);
      if (!k) return;
      if (numOrg[k]) dupOrg[k] = true;
      numOrg[k] = true;
    });
    Object.keys(dupOrg).forEach(function (k) { pend.dados.push("Número " + k + " repetido na planilha do órgão (mais de um item). Conferir a numeração."); });

    /* ---- base de referência: só vale se for a MESMA tabela do projeto ---- */
    var base = opcoes.base || null;
    var tab = leitura && leitura.tabelas ? leitura.tabelas : {};
    var tabelaRef = s(tab.seinfra) ? ("SEINFRA " + s(tab.seinfra)) : (s(tab.sinapi) ? ("SINAPI " + s(tab.sinapi)) : "");
    var baseOk = null;
    /* O edital CE 012 (p. 13) exige "inclusive as composições de preços unitários auxiliares": a exigência vem das bases exigidas que citam a
       SEINFRA OU da tabela SEINFRA que o projeto usa (`tabelas.seinfra`). Sem nenhuma das duas (Sangão, 7.20), as auxiliares não são exigidas. */
    var baseExigida = !!s(tab.seinfra) || (Array.isArray(lic.basesExigidas) ? lic.basesExigidas : []).some(function (b) { return /SEINFRA/i.test(s(b && b.fonte)); });
    if (base) {
      if (s(tab.seinfra) && norm(base.mes) !== norm(tab.seinfra)) {
        pend.dados.push("A base de referência carregada é a tabela " + base.mes + ", e o projeto usa a SEINFRA " + s(tab.seinfra) + ": descrições e composições auxiliares da base NÃO foram usadas.");
      } else baseOk = base;
    } else if (baseExigida) {
      /* O item 7.20 do edital NÃO pede a abertura das auxiliares: este aviso só existe quando o edital/licitação EXIGE a base de
         referência (SEINFRA) para abri-las. Sem exigência, ficar sem ela não é pendência. */
      pend.dados.push("Base de referência (composições auxiliares) não carregada: as composições auxiliares saem sem detalhamento e as descrições ficam como lidas.");
    }

    /* Item sem composição e sem parcelas próprias: a base do MESMO tipo (SINAPI) só empresta a PROPORÇÃO
       material/mão de obra/equipamento do mesmo código. O custo, o preço e a composição do item não mudam. */
    var porProporcao = 0, fonteProporcao = "", porModoMO = 0, semUfBase = [], fontesProp = {};
    var ufOrcamento = s(orc.uf).toUpperCase();
    /* competência (AAAA-MM) que o órgão usa: a SINAPI exigida no edital; sem ela, a do orçamento */
    function compAAAAMM(v) {
      var t = s(v), m = /(\d{4})\D+(\d{1,2})/.exec(t);
      if (m) return m[1] + "-" + ("0" + m[2]).slice(-2);
      m = /(\d{1,2})\D+(\d{4})/.exec(t); if (m) return m[2] + "-" + ("0" + m[1]).slice(-2);
      m = /^(\d{4})(\d{2})$/.exec(t); return m ? m[1] + "-" + m[2] : "";
    }
    var compOrgao = "";
    (Array.isArray(lic.basesExigidas) ? lic.basesExigidas : []).forEach(function (b) { if (!compOrgao && /SINAPI/i.test(s(b && b.fonte))) compOrgao = compAAAAMM(b.competencia); });
    if (!compOrgao) compOrgao = compAAAAMM(orc.competenciaSinapi);
    var compDif = { n: 0, base: "", orgao: compOrgao };
    function proporcaoDaBase(it, fonteRaw) {
      var Orc2 = O(), Ut2 = U();
      if (!Orc2 || !(Orc2.ehSinapi(it.origem) || Orc2.ehSinapi(it.baseFonte) || /^SINAPI/i.test(fonteRaw))) return null;
      var cod = s(it.codigo);
      if (!cod) return null;
      var uk = function (u) { return (Ut2 && Ut2.unidadeChave) ? Ut2.unidadeChave(u) : s(u).toLowerCase(); };
      /* Duas leituras da MESMA SINAPI, como o resto do app: a base de preços (Sinapi) e o analítico (Analitico, onde a
         composição traz custoMO/custoMAT/custoEQ; o pacote de preços da CAIXA em data/ não traz as parcelas). Vale a
         primeira que tenha o código, a mesma unidade e MO+MAT+EQ maior que zero. */
      var fontes = [_dep("Sinapi"), _dep("Analitico")], recusou = false;
      for (var k = 0; k < fontes.length; k++) {
        var B = fontes[k];
        if (!B || !B.carregado || typeof B.obter !== "function") continue;
        var reg = B.obter(cod);
        if (!reg || uk(reg.unidade) !== uk(it.unidade)) continue;
        var mo = nm(reg.custoMO), mat = nm(reg.custoMAT), eq = nm(reg.custoEQ), soma2 = mo + mat + eq;
        if (!(mo >= 0 && mat >= 0 && eq >= 0 && soma2 > 0)) continue;
        /* A proporção só vale se a base é a DA UF do orçamento: o mesmo código tem outra composição em outro estado. */
        var ufB = s(B.uf).toUpperCase();
        if (!ufOrcamento || !ufB || ufB !== ufOrcamento) { recusou = true; continue; }
        /* modo de custo do item: só as parcelas ativas dividem o custo */
        if (it.modoCusto === "matEq") { var s2 = mat + eq; if (!(s2 > 0)) continue; mo = 0; soma2 = s2; }
        fontesProp["SINAPI" + (s(B.competencia) ? " " + s(B.competencia) : "") + ", UF " + ufB] = true;
        fonteProporcao = Object.keys(fontesProp).join(" e ");
        var cB = compAAAAMM(B.competencia), difC = !!(cB && compOrgao && cB !== compOrgao);
        if (difC) compDif.base = cB;
        return { mo: mo / soma2, mat: mat / soma2, eq: eq / soma2, compDif: difC };
      }
      if (recusou) semUfBase.push(cod);
      return null;
    }

    var descTrocadas = 0, descSemBase = [];
    function descPelaBase(cod, lida, ehInsumo) {
      var t = s(lida);
      if (!baseOk || !cod) return t;
      var reg = ehInsumo ? baseOk.insumo(cod) : (baseOk.obter(cod) || baseOk.insumo(cod));
      if (!reg || !s(reg.descricao)) return t;
      var p = parecido(t, reg.descricao);
      if (p >= LIM_PARECIDO) { if (s(reg.descricao) !== t) descTrocadas++; return s(reg.descricao); }
      if (p < LIM_PARECIDO && !t) return s(reg.descricao);
      descSemBase.push(cod + " (\"" + t + "\" x \"" + s(reg.descricao) + "\")");
      return t;
    }

    /* ---- itens ---- */
    var itens = [], porEtapa = [], eIdx = {};
    var tot = { semBdi: 0, comBdi: 0, cat: { MO: 0, MAT: 0, EQ: 0, OUTROS: 0 } };
    linhas.forEach(function (Ln) {
      var it = Ln.item || {};
      /* o documento vai ao órgão, que confere pela numeração DELE; a sequência interna fica em `seq` */
      var numeroDoc = s(it.numeroOrigem);
      if (!numeroDoc) {
        numeroDoc = s(Ln.numero);
        if (numOrg[numeroDoc]) { colidiu.push(numeroDoc); numeroDoc = "A." + numeroDoc; }
      }
      var fonteRaw = s(it.baseFonte || it.origem || "");
      var ehSeinfra = /SEINFRA/i.test(fonteRaw);
      /* custo editado à mão (ou por Fechar valor / orçar sozinho) deixa de ser o do órgão: nem o total impresso por ele nem a nota "já na planilha do
         órgão" valem mais (revisão de 09/11/2026, M5). O custo do órgão: it.orgao.custo ou o preço de referência sem BDI do pacote. */
      var orgCusto = (it.orgao && typeof it.orgao === "object" && it.orgao.custo != null) ? nm(it.orgao.custo) : (nm(it.precoReferenciaSemBdi) > 0 ? nm(it.precoReferenciaSemBdi) : null);
      var custoIgualOrgao = orgCusto === null || Math.abs(nm(Ln.custoUnitario) - orgCusto) <= 0.011;
      var propriaOrgao = !!(it.composicaoOrgao && it.composicaoOrgao.propria);
      var propria = propriaOrgao || /PROPRI/i.test(fonteRaw);
      var ins = (Array.isArray(it.insumos) ? it.insumos : []).map(function (x) {
        var cod = s(x.codigo), cat = catDe(x), eh = String(x.tipo || "").toUpperCase() !== "COMPOSICAO";
        var d = (/SEINFRA/i.test(s(x.fonte)) || ehSeinfra) ? descPelaBase(cod, x.descricao, eh) : s(x.descricao);
        var un = s(x.unidade);
        if (!un && baseOk) { var rg = eh ? baseOk.insumo(cod) : (baseOk.obter(cod) || baseOk.insumo(cod)); if (rg && parecido(d, rg.descricao) >= LIM_PARECIDO) un = s(rg.unidade); }
        var co = nm(x.coeficiente), cu = nm(x.custoUnitario);
        /* total impresso pelo órgão nesta linha (ele trunca cada linha): só vale se veio no pacote como número */
        var cto = (x.custoTotalOrgao !== undefined && x.custoTotalOrgao !== null && x.custoTotalOrgao !== "" && isFinite(Number(x.custoTotalOrgao))) ? Number(x.custoTotalOrgao) : null;
        return { codigo: cod, descricao: d, unidade: un, fonte: s(x.fonte), coef: co, cu: cu, ct: co * cu, ctOrg: cto, cat: cat, composicao: !eh };
      });
      var cats = { MO: 0, MAT: 0, EQ: 0, OUTROS: 0 }, auxRaw = 0;
      if (ins.length) {
        ins.forEach(function (x) {
          var val = Ln.quantidade * x.ct;
          if (x.composicao && x.cat === "OUTROS") {
            /* composição AUXILIAR (SINAPI) dentro da composição do órgão: se o analítico carregado é o da mesma UF, competência e
               regime, reparte MO/MAT/EQ pela proporção da própria auxiliar (mesma regra dos itens sem composição); senão fica em
               "outros", identificada (o detalhe da conferência diz quanto). */
            var pa = proporcaoDaBase({ origem: x.fonte || "SINAPI", baseFonte: x.fonte, codigo: x.codigo, unidade: x.unidade }, x.fonte);
            if (pa) { cats.MO += val * pa.mo; cats.MAT += val * pa.mat; cats.EQ += val * pa.eq; if (pa.compDif) compDif.n++; return; }
            auxRaw += val;
          }
          cats[x.cat] += val;
        });
        /* O custo unitário do item vem arredondado (1,38) e a composição soma 1,3845: em 25 mil m² isso é dinheiro.
           As categorias repartem o custo da PLANILHA, na proporção da composição, para o resumo fechar com ela. */
        var somaI = cats.MO + cats.MAT + cats.EQ + cats.OUTROS;
        if (somaI > 0) { CATS.forEach(function (c) { cats[c] = cats[c] * Ln.custoTotal / somaI; }); auxRaw = auxRaw * Ln.custoTotal / somaI; }
      } else {
        /* sem composição: a parcela do próprio item (MO/MAT/EQ), se ele tiver; senão tudo em OUTROS, marcado */
        var rep = Orc.repartirCusto ? Orc.repartirCusto(it, Ln.custoTotal) : null;
        if (rep && (nm(rep.mo) + nm(rep.mat) + nm(rep.eq)) > 0) { cats.MO += nm(rep.mo); cats.MAT += nm(rep.mat); cats.EQ += nm(rep.eq); }
        else if (it.modoCusto === "mo") { cats.MO += Ln.custoTotal; porModoMO++; }   // item só mão de obra: tudo MO
        else {
          var prop = proporcaoDaBase(it, fonteRaw);
          if (prop) { cats.MO += Ln.custoTotal * prop.mo; cats.MAT += Ln.custoTotal * prop.mat; cats.EQ += Ln.custoTotal * prop.eq; porProporcao++; if (prop.compDif) compDif.n++; }
          else { cats.OUTROS += Ln.custoTotal; pend.dados.push("Item " + numeroDoc + " (" + Ln.codigo + ") sem composição no pacote: custo no resumo foi para OUTROS."); }
        }
      }
      var linhaI = {
        numero: numeroDoc, seq: s(Ln.numero), etapaIdx: Ln.etapaIdx, codigo: s(Ln.codigo),
        descricao: ehSeinfra ? descPelaBase(Ln.codigo, Ln.descricao, false) : s(Ln.descricao),
        descricaoLida: s(Ln.descricao),
        unidade: s(Ln.unidade), fonte: propriaOrgao ? "PRÓPRIO" : (propria ? "PRÓPRIA" : fonteRaw.toUpperCase()),
        quantidade: Ln.quantidade, cu: Ln.custoUnitario, pu: Ln.precoUnit, ct: Ln.custoTotal, pt: Ln.precoTotal,
        insumos: ins, cats: cats, propria: propria, propriaOrgao: propriaOrgao, doOrgao: !!it.composicaoOrgao, custoIgualOrgao: custoIgualOrgao, auxOutros: auxRaw, id: Ln.itemId, refMax: null
      };
      try { var rf = Lic.refDoItem ? Lic.refDoItem(orc, it) : null; if (rf && rf.comBdi > 0) linhaI.refMax = rf.comBdi; } catch (eRf) {}
      itens.push(linhaI);
      if (!eIdx[Ln.etapaIdx]) {
        eIdx[Ln.etapaIdx] = { idx: Ln.etapaIdx, codigo: s(Ln.etapaCodigo), nome: s(Ln.etapaNome).replace(/^[^A-Za-z0-9À-ÿ]+/, ""), itens: [], semBdi: 0, comBdi: 0, cat: { MO: 0, MAT: 0, EQ: 0, OUTROS: 0 } };
        porEtapa.push(eIdx[Ln.etapaIdx]);
      }
      var E = eIdx[Ln.etapaIdx];
      E.itens.push(linhaI); E.semBdi += Ln.custoTotal; E.comBdi += Ln.precoTotal;
      CATS.forEach(function (c) { E.cat[c] += cats[c]; });
      tot.semBdi += Ln.custoTotal; tot.comBdi += Ln.precoTotal;
    });
    if (colidiu.length) pend.dados.push("Item(ns) acrescentado(s) por você com número igual ao do órgão (" + colidiu.slice(0, 8).join(", ") + (colidiu.length > 8 ? " e mais" : "") + "): saem com o número A.<nº> para não se confundir com a planilha do órgão.");
    if (porProporcao) pend.dados.push(porProporcao + " item(ns) com material, mão de obra e equipamento repartidos pela proporção da base " + fonteProporcao + " do mesmo código; o preço é o da proposta.");
    if (compDif.n) pend.dados.push(compDif.n + " item(ns) sem composição no pacote repartidos pela proporção da SINAPI " + compDif.base + "; o órgão usa " + compDif.orgao + ". A proporção pode diferir da do órgão: conferir.");
    if (porModoMO) pend.dados.push(porModoMO + " item(ns) \"só mão de obra\" sem parcelas: custo inteiro em mão de obra.");
    if (semUfBase.length) {
      var bAtual = _dep("Sinapi"), bAna = _dep("Analitico");
      pend.dados.push(semUfBase.length + " item(ns) NÃO repartidos pela proporção da base: a UF do orçamento (" + (ufOrcamento || "não informada") + ") não é a da base carregada (" +
        [bAna && bAna.carregado ? "analítico " + s(bAna.uf) + " " + s(bAna.competencia) : "", bAtual && bAtual.carregado ? "preços " + s(bAtual.uf) + " " + s(bAtual.competencia) : ""].filter(Boolean).join("; ") + "). O custo desses itens ficou em OUTROS.");
    }
    tot.semBdi = arr(tot.semBdi, 2); tot.comBdi = arr(tot.comBdi, 2);

    /* ---- CENTAVOS: uma regra só para todas as tabelas ----
       O total da proposta (Licitacao.totalProposta) soma os valores SEM arredondar e arredonda no fim; as linhas do
       documento são mostradas ao centavo. Em modo sem arredondamento por item ("nenhum") ou depois de um desconto, a soma
       das linhas arredondadas pode passar ou faltar um centavo. O centavo é absorvido pelas linhas de MAIOR resto (método
       do maior resto), primeiro entre as etapas e depois entre os itens de cada etapa, até a soma fechar com o total. Em
       modo que já arredonda por item o resto é zero e nada muda. Se a diferença for maior que o número de linhas, NÃO se
       mexe (é divergência de verdade, e conferirValores recusa o pacote). Não se alinha ao total da proposta de propósito:
       alinhar esconderia a divergência entre a planilha e o total. */
    function alocarCentavos(raws, alvo) {
      var n = raws.length, base = [], soma = 0, i;
      for (i = 0; i < n; i++) { base.push(Math.round(Math.abs(raws[i]) * 100 + 1e-9) * (raws[i] < 0 ? -1 : 1)); soma += base[i]; }
      var dif = Math.round(alvo * 100 + (alvo < 0 ? -1e-9 : 1e-9)) - soma;
      if (dif !== 0 && Math.abs(dif) <= n) {
        var ord = raws.map(function (x, k) { return { k: k, r: x * 100 - base[k] }; });
        ord.sort(function (a, b) { return dif > 0 ? (b.r - a.r) : (a.r - b.r); });
        for (i = 0; i < Math.abs(dif); i++) base[ord[i].k] += dif > 0 ? 1 : -1;
      }
      return base.map(function (c) { return c / 100; });
    }
    var ePt = alocarCentavos(porEtapa.map(function (E) { return E.comBdi; }), tot.comBdi);
    var eCt = alocarCentavos(porEtapa.map(function (E) { return E.semBdi; }), tot.semBdi);
    porEtapa.forEach(function (E, k) {
      var iPt = alocarCentavos(E.itens.map(function (I) { return I.pt; }), ePt[k]);
      var iCt = alocarCentavos(E.itens.map(function (I) { return I.ct; }), eCt[k]);
      E.itens.forEach(function (I, j) { I.pt = iPt[j]; I.ct = iCt[j]; });
      E.comBdi = ePt[k]; E.semBdi = eCt[k];
    });

    /* ---- CUSTOS POR ITEM: material, mão de obra e equipamento (item 7.20 do edital) ----
       Cada coluna é arredondada ao centavo; o centavo que sobrar para fechar com o custo direto do item
       fica na MAIOR categoria do item. O Resumo por etapa SOMA estas mesmas categorias (item a item), então as duas
       tabelas fecham por categoria, e as colunas somam o custo direto e o preço total da proposta — se não somarem,
       conferirValores recusa o pacote. */
    var custoItens = { linhas: [], semComposicao: 0, porProporcao: porProporcao, fonteProporcao: fonteProporcao, compDif: compDif, todosOutros: itens.length > 0, tot: { MAT: 0, MO: 0, EQ: 0, OUTROS: 0, ct: 0, bdi: 0, pt: 0 } };
    itens.forEach(function (I) {
      var ctI = arr(I.ct, 2), ptI = arr(I.pt, 2), cc = {}, maiorC = "MAT", somaC = 0;
      ["MAT", "MO", "EQ", "OUTROS"].forEach(function (c) { cc[c] = arr(I.cats[c], 2); somaC += cc[c]; if (cc[c] > cc[maiorC]) maiorC = c; });
      cc[maiorC] = arr(cc[maiorC] + (ctI - arr(somaC, 2)), 2);
      I.cc = cc;
      var semComp = !I.insumos.length && I.cats.OUTROS > 0;
      if (semComp) custoItens.semComposicao++;
      if (!(cc.OUTROS >= ctI - 0.005 && cc.MAT === 0 && cc.MO === 0 && cc.EQ === 0)) custoItens.todosOutros = false;
      var L = { numero: I.numero, fonte: I.fonte, etapaIdx: I.etapaIdx, codigo: I.codigo, descricao: I.descricao, MAT: cc.MAT, MO: cc.MO, EQ: cc.EQ, OUTROS: cc.OUTROS, ct: ctI, bdi: arr(ptI - ctI, 2), pt: ptI, semComposicao: semComp, doOrgao: !!I.doOrgao, auxOutros: arr(Math.min(Math.max(I.auxOutros || 0, 0), cc.OUTROS), 2) };
      custoItens.linhas.push(L);
      ["MAT", "MO", "EQ", "OUTROS", "ct", "bdi", "pt"].forEach(function (c) { custoItens.tot[c] = arr(custoItens.tot[c] + L[c], 2); });
    });

    /* Resumo por etapa: categoria da etapa = soma das categorias dos itens dela (as mesmas de "Custos por item") */
    tot.cat = { MO: 0, MAT: 0, EQ: 0, OUTROS: 0 };
    porEtapa.forEach(function (E) {
      E.cat = { MO: 0, MAT: 0, EQ: 0, OUTROS: 0 };
      E.itens.forEach(function (I) { CATS.forEach(function (c) { E.cat[c] = arr(E.cat[c] + I.cc[c], 2); }); });
      CATS.forEach(function (c) { tot.cat[c] = arr(tot.cat[c] + E.cat[c], 2); });
    });
    var somaCats = arr(tot.cat.MO + tot.cat.MAT + tot.cat.EQ + tot.cat.OUTROS, 2);
    var difCats = arr(tot.semBdi - somaCats, 2);

    if (descSemBase.length) pend.dados.push("Descrição lida difere da base e foi mantida como lida: " + descSemBase.slice(0, 6).join("; ") + (descSemBase.length > 6 ? " e mais " + (descSemBase.length - 6) : "") + ".");

    /* ---- cabeçalho ---- */
    var emp = empresaResolvida(empresa);
    var tipoLic = s(lic.tipo), proc = s(lic.processo) || s(lic.certame);
    var edital = (opcoes.edital ? s(opcoes.edital) : (tipoLic ? tipoLic.toUpperCase() : "LICITAÇÃO") + (proc ? " Nº " + proc : ""));
    var objInfo = objetoDaCarta(orc, lic, opcoes);
    /* VALIDADE: a do edital (lic.validadeDiasEdital) manda na carta; sem ela, opcoes.validade ou a do comercial do orçamento.
       validadeDias nulo não é dado da empresa; 15 digitado é 15. (O 15 que versões antigas gravavam sozinho é desfeito pela migração.) */
    try { if (Orc.migrarValidadeCertame) Orc.migrarValidadeCertame(orc); } catch (eMig) {}
    var vEd = (lic.validadeDiasEdital > 0) ? Math.floor(lic.validadeDiasEdital) : 0;
    var vCom = parseInt(orc.comercial && orc.comercial.validadeDias, 10);
    if (!(vCom > 0)) vCom = 0;
    var vTxt = s(opcoes.validade);
    var cab = {
      edital: edital, objeto: objInfo.texto, cidade: cidadeDe(orc, lic, opcoes), orgao: s(lic.orgao && lic.orgao.nome),
      data: dataExtensoUpper(opcoes.data), prazo: "",
      validade: vEd ? validadeExt(vEd) : (vTxt || validadeExt(vCom)),
      validadeInicio: contagemValidade(lic.validadeInicio),
      prazoInicio: s(opcoes.prazoInicio)   // sem valor padrão escondido: sem opcoes.prazoInicio a frase de início não existe
    };
    /* CARTA DO EDITAL: se o pacote traz `carta_do_edital` ({nome, pagina}), a carta de apresentação é a do modelo do edital, preenchida no
       CertamePRO, e o documento NÃO sai com a carta do OrçaPRO (começa no Resumo). Os dados que só a carta usa deixam de ser pendência. */
    var cartaEd = (lic.cartaDoEdital && typeof lic.cartaDoEdital === "object" && s(lic.cartaDoEdital.nome)) ? { nome: s(lic.cartaDoEdital.nome), pagina: lic.cartaDoEdital.pagina || null } : null;
    if (cartaEd) pend.dados.push("A carta de apresentação é a do modelo do edital (" + cartaEd.nome + "), preenchida no CertamePRO.");
    var rotCarta = cartaEd ? "o orçamento" : "a carta";
    /* PRAZO DA CARTA. Com o prazo em dias lido do edital, a carta usa ELE ("120 (cento e vinte) dias"); o texto do comercial do
       orçamento não manda sobre ele. Se o texto existir e divergir (ou não der para converter em dias), avisa com os dois e a
       conferência do prazo reprova. Sem prazo em dias: o texto, como sempre, e a conferência fica "não conferido". */
    var txtPrazo = s(opcoes.prazo) || s(orc.comercial && orc.comercial.prazoExecucao), prazoDiverge = false, diasTxt = diasDoTexto(txtPrazo);
    if (prazoDias) {
      cab.prazo = prazoExt(prazoDias + " dias");
      if (txtPrazo && diasTxt !== prazoDias) {
        prazoDiverge = true;
        pend.dados.push("Prazo de execução: " + rotCarta + " usa " + cab.prazo + " (lido do edital), e o prazo do orçamento diz \"" + txtPrazo + "\"" + (diasTxt != null ? " (" + diasTxt + " dias)" : " (não consegui converter em dias)") + ". Conferir qual vale.");
      }
    } else cab.prazo = prazoExt(txtPrazo);
    if (!cab.prazo && !cartaEd) pend.preencher.push("prazo de execução (comercial do orçamento)");
    if (!cab.validade && !cartaEd) pend.preencher.push("validade da proposta (o pacote não trouxe a validade do edital e o orçamento não tem validade em dias)");
    if (vEd) {
      var outrosV = [];
      if (vCom && vCom !== vEd) outrosV.push("o orçamento diz " + vCom + " dias");
      if (vTxt && diasDoTexto(vTxt) !== vEd) outrosV.push("o texto informado diz \"" + vTxt + "\"");
      if (outrosV.length) pend.dados.push("Validade da proposta: " + rotCarta + " usa " + cab.validade + " (lido do edital), e " + outrosV.join("; ") + ". " + (cartaEd ? "Vale o edital" : "A carta segue o edital") + "; conferir.");
    }
    if (objInfo.invalido) pend.preencher.push("objeto da licitação (" + objInfo.motivo + "; o pacote não trouxe o objeto do edital)");
    emp.faltando.forEach(function (f) { if (cartaEd && /^(inscrição municipal|banco|agência|conta corrente)$/i.test(f)) return; pend.preencher.push(f); });
    /* o que o CertamePRO avisou sobre o cadastro da empresa do certame (campo, texto, link) */
    (Array.isArray(lic.licitantePendencias) ? lic.licitantePendencias : []).forEach(function (p) {
      if (!p || typeof p !== "object") return;
      var t = (s(p.campo) ? s(p.campo) + ": " : "") + s(p.texto);
      if (s(p.link) && /^https?:\/\//i.test(s(p.link))) t += " (" + s(p.link) + ")";
      if (t) pend.licitante.push(t);
    });
    /* O que aconteceu com o timbrado na importação (Licitacao.guardarTimbrado): sem aviso, ele sumiria do documento sem explicação */
    var tbs = lic.licitanteTimbrado;
    if (emp.certame && tbs && tbs.guardou === false) pend.preencher.push("timbrado: o navegador não conseguiu guardar a imagem (armazenamento cheio). Ela vale só até fechar esta página; importe o pacote de novo antes de gerar o documento.");
    if (emp.certame && tbs && tbs.descartados > 0) pend.dados.push("Timbrado: para guardar o desta empresa, " + tbs.descartados + " timbrado(s) de outra(s) empresa(s) mais antigo(s) foi(ram) removido(s) deste navegador. Importe o pacote da outra empresa de novo se for usá-la.");
    if (emp.certame && !emp.timbradoTopo && !emp.timbradoPagina) {
      /* três causas diferentes, três avisos: despejado do navegador depois (a importação o guardou), recusado por tamanho, ou nunca veio */
      var motTb = (tbs && tbs.topo === true) ? "foi removido deste navegador por falta de espaço; importe o pacote de novo"
        : ((tbs && tbs.recusadas > 0) ? "passou do limite de tamanho e não foi guardado" : "não veio no pacote");
      pend.preencher.push("timbrado (logo) da empresa do certame: " + motTb + ". O documento sai sem timbrado.");
    }

    var extenso = Ut && Ut.valorExtenso ? Ut.valorExtenso(valor) : "";

    /* ---- composições auxiliares (recursivas, sem repetir) e quantidade total de cada uma ---- */
    /* Desconto concentrado (Licitacao.aplicarDescontoIncidencia) que abriu as auxiliares: a versão
       DESCONTADA mora no item (`auxiliaresDesconto`) e é ela que se imprime, senão a auxiliar sairia
       com a areia a 83,58 ao lado de uma planilha que a usou com o fator. */
    var auxDesc = {};
    linhas.forEach(function (Ln) {
      var m = Ln.item && Ln.item.auxiliaresDesconto;
      if (!m || typeof m !== "object") return;
      Object.keys(m).forEach(function (k) { if (!auxDesc[k] && m[k] && Array.isArray(m[k].insumos) && m[k].insumos.length) auxDesc[k] = m[k]; });
    });
    var aux = [], auxIdx = {};
    function auxEntra(cod, descLida, un) {
      if (!auxIdx[cod]) {
        var dsc = auxDesc[cod] || null;
        var reg = dsc || (baseOk ? baseOk.obter(cod) : null);
        auxIdx[cod] = { codigo: cod, descLida: s(descLida), unidade: s(un), reg: reg, quantidade: 0, usadoEm: {},
          descontada: !!(dsc && Math.abs(nm(dsc.custoBase) - nm(dsc.custoUnitario)) > 0.00005), custoTabela: dsc ? nm(dsc.custoBase) : null };
        aux.push(auxIdx[cod]);
      }
      return auxIdx[cod];
    }
    function visita(lstIns, mult, trilha, origem) {
      (lstIns || []).forEach(function (x) {
        if (!x) return;
        var isComp = (x.composicao === true) || String(x.tipo || "").toUpperCase() === "COMPOSICAO";
        if (!isComp) return;
        var cod = s(x.codigo);
        if (!cod || trilha[cod]) return;
        var a = auxEntra(cod, x.descricao, x.unidade);
        var coef = (x.coef != null) ? x.coef : nm(x.coeficiente);
        a.quantidade += mult * coef;
        a.usadoEm[origem] = true;
        if (a.reg) {
          trilha[cod] = true;
          visita(a.reg.insumos, mult * coef, trilha, origem);
          delete trilha[cod];
        }
      });
    }
    itens.forEach(function (I) { visita(I.insumos, I.quantidade, {}, I.numero); });
    aux.forEach(function (a) {
      if (a.reg) {
        a.descricao = s(a.reg.descricao);
        a.unidade = s(a.reg.unidade) || a.unidade;
        a.insumos = (a.reg.insumos || []).map(function (x) {
          var co = nm(x.coeficiente), cu = nm(x.custoUnitario);
          return { codigo: s(x.codigo), descricao: s(x.descricao), unidade: s(x.unidade), fonte: s(x.fonte) || (baseOk ? s(baseOk.tabela) : ""), coef: co, cu: cu, ct: co * cu, cat: catDe(x), composicao: String(x.tipo || "").toUpperCase() === "COMPOSICAO" };
        });
        a.valor = nm(a.reg.custoUnitario);
      } else {
        a.descricao = a.descLida; a.insumos = null; a.valor = null;
      }
      a.usadoEm = Object.keys(a.usadoEm);
    });

    /* ---- detalhamento dos quantitativos: insumo → serviços que o usam ---- */
    var qMap = {}, qLista = [];
    itens.forEach(function (I) {
      I.insumos.forEach(function (x) {
        var chave = x.cat + "|" + x.codigo;
        if (!qMap[chave]) { qMap[chave] = { cat: x.cat, codigo: x.codigo, descricao: x.descricao, unidade: x.unidade, usos: [], total: 0 }; qLista.push(qMap[chave]); }
        var q = qMap[chave], t = I.quantidade * x.coef;
        q.usos.push({ numero: I.numero, codigo: I.codigo, descricao: I.descricao, unidade: I.unidade, quantidade: I.quantidade, coef: x.coef, total: t });
        q.total += t;
      });
    });
    qLista.sort(function (a, b) { var x = norm(a.descricao), y = norm(b.descricao); return x < y ? -1 : (x > y ? 1 : 0); });

    /* ---- curva ABC (sobre o preço com BDI e com desconto) ---- */
    var ord = itens.map(function (I, k) { return { I: I, k: k }; });
    ord.sort(function (a, b) { return (b.I.pt - a.I.pt) || (a.k - b.k); });
    var acum = 0, curva = ord.map(function (o) {
      var p = tot.comBdi > 0 ? o.I.pt / tot.comBdi * 100 : 0;
      acum += o.I.pt;
      var ac = tot.comBdi > 0 ? acum / tot.comBdi * 100 : 0;
      return { numero: o.I.numero, codigo: o.I.codigo, descricao: o.I.descricao, fonte: o.I.fonte, unidade: o.I.unidade, quantidade: o.I.quantidade,
        pu: o.I.pu, pt: o.I.pt, pct: p, acum: ac, classe: ac <= 50.0001 ? "A" : (ac <= 80.0001 ? "B" : "C") };
    });

    /* ---- cronograma físico-financeiro ---- */
    var crono = null, cr = leitura && leitura.cronograma, elaborado = false, cronoSemPrazo = false;
    var temCr = !!(cr && Array.isArray(cr.etapas) && cr.etapas.length);
    if (!temCr && prazoDias) {
      cr = elaborarCronograma(porEtapa, Math.max(1, Math.ceil(prazoDias / 30)));
      elaborado = true; temCr = true;
      pend.dados.push("Cronograma elaborado pelo sistema a partir do prazo de " + prazoDias + " dias, conferir.");
    }
    if (temCr) {
      var nMeses = 0, linhasC = [], okC = true;
      cr.etapas.forEach(function (e) { Object.keys(e.meses || {}).forEach(function (k) { nMeses = Math.max(nMeses, parseInt(k, 10) || 0); }); });
      nMeses = Math.max(nMeses, parseInt(cr.meses, 10) || 0);
      if (!elaborado && prazoDias && nMeses * 30 !== prazoDias) {
        pend.dados.push("Cronograma do órgão: " + nMeses + " mês(es) (" + (nMeses * 30) + " dias), e o prazo do edital é de " + prazoDias + " dias. Conferir.");
      }
      /* casamento de etapas: código normalizado (sem espaço e sem ponto final); exato primeiro, senão sobe
         de pai em pai (3.2.1 -> 3.2 -> 3). Linha do órgão só agrupadora (tem filhas e nenhuma etapa própria
         na planilha) não serve de herança: é a soma das filhas. */
      var codN = function (c) { return s(c).replace(/\s+/g, "").replace(/\.+$/, ""); };
      var porCod = {}, codsE = {}, herancas = {}, herOrdem = [];
      cr.etapas.forEach(function (c) { var k = codN(c.etapa); if (k) porCod[k] = c; });
      porEtapa.forEach(function (E) { var k = codN(E.codigo); if (k) codsE[k] = true; });
      var agrupadora = function (k) {
        if (codsE[k]) return false;
        return cr.etapas.some(function (c) { return codN(c.etapa).indexOf(k + ".") === 0; });
      };
      porEtapa.forEach(function (E) {
        var ek = codN(E.codigo), ce = null, mae = "";
        if (ek) {
          if (porCod[ek]) ce = porCod[ek];
          else {
            var kk = ek;
            while (kk.indexOf(".") > 0) {
              kk = kk.slice(0, kk.lastIndexOf("."));
              if (porCod[kk] && !agrupadora(kk)) { ce = porCod[kk]; mae = kk; break; }
            }
          }
        } else {
          cr.etapas.forEach(function (c) { if (Number(c.etapa) === E.idx + 1) ce = c; });
        }
        if (!ce) { okC = false; pend.dados.push("Cronograma: sem percentuais lidos para a etapa " + E.codigo + " (" + E.nome + ")."); return; }
        if (mae) { if (!herancas[mae]) { herancas[mae] = []; herOrdem.push(mae); } herancas[mae].push(ek); }
        else if (s(ce.descricao) && parecido(ce.descricao, E.nome) < 0.5) pend.dados.push("Cronograma: a linha lida \"" + ce.descricao + "\" não parece ser a etapa " + E.codigo + " (" + E.nome + "). Conferir os percentuais.");
        var ms = [], soma = 0, ultimo = -1, m, somaR = 0, ceValor = nm(ce.valor);
        for (m = 1; m <= nMeses; m++) {
          var cm = ce.meses && ce.meses[String(m)];
          var pc = cm ? nm(cm.pct) : 0;
          ms.push({ pct: pc, valor: 0, rs: cm ? nm(cm.valor) : 0 }); soma += pc; somaR += cm ? nm(cm.valor) : 0;
          if (pc > 0) ultimo = m - 1;
        }
        if (Math.abs(soma - 100) > 0.1) { okC = false; pend.dados.push("Cronograma: os percentuais da etapa " + E.codigo + " somam " + fmt(soma, 2) + "%, não 100%."); }
        /* O órgão imprime o % com 2 casas (14,78%) mas calcula com o R$ (12.922,51 de 87.410,63). Quando os R$ da linha lida fecham
           com o valor dela, a parte de cada mês sai do R$: sem desconto o mês bate ao centavo com o do órgão (pelo % arredondado dava
           R$ 2,65 de diferença num mês); com desconto, a mesma proporção sobre o valor ofertado, e o último mês fecha a etapa. Sem R$
           lidos, ou se não fecham com o valor da linha: pelo %, como sempre foi. */
        /* O R$ só vale se for coerente mês a mês: em TODOS os meses |R$/valor x 100 - %| <= 0,01 (mês de % zero tem R$ zero; se
           algum mês sair negativo, por R$ negativo ou acima do valor da etapa, volta tudo ao %) E os R$ somam o valor da etapa. R$ que fecha na soma mas contradiz o % de algum
           mês ("27,55% : 7.057,00") não é lido: usa o %. */
        var porRs = ceValor > 0 && somaR > 0 && Math.abs(somaR - ceValor) <= Math.max(0.05, ceValor * 0.001);
        if (porRs) ms.forEach(function (x) {
          if ((x.pct <= 0 && x.rs > 0) || Math.abs(x.rs / ceValor * 100 - x.pct) > 0.01) porRs = false;
        });
        var repartir = function (usaRs) {
          var acm = 0;
          ms.forEach(function (x, ix) {
            if (ix === ultimo) x.valor = arr(E.comBdi - acm, 2);
            else { x.valor = arr(E.comBdi * (usaRs ? x.rs / ceValor : x.pct / 100), 2); acm = arr(acm + x.valor, 2); }
          });
        };
        repartir(porRs);
        if (porRs && ms.some(function (x) { return x.valor < 0; })) repartir(false);
        linhasC.push({ codigo: E.codigo, nome: E.nome, valor: E.comBdi, pct: tot.comBdi > 0 ? E.comBdi / tot.comBdi * 100 : 0, meses: ms });
      });
      herOrdem.forEach(function (mae) {
        var fl = herancas[mae];
        pend.dados.push("Cronograma: " + (fl.length > 1 ? "etapas " + fl.join(", ") + " usam" : "etapa " + fl[0] + " usa") + " os percentuais da " + mae + ".");
      });
      if (okC && linhasC.length) {
        var tm = [], ac2 = 0, ix2;
        for (ix2 = 0; ix2 < nMeses; ix2++) {
          var sv = 0; linhasC.forEach(function (l) { sv += l.meses[ix2].valor; });
          sv = arr(sv, 2); ac2 = arr(ac2 + sv, 2);
          tm.push({ valor: sv, pct: tot.comBdi > 0 ? sv / tot.comBdi * 100 : 0, acumValor: ac2, acumPct: tot.comBdi > 0 ? ac2 / tot.comBdi * 100 : 0 });
        }
        crono = { nMeses: nMeses, linhas: linhasC, totais: tm, total: arr(ac2, 2), elaborado: elaborado, prazoDias: prazoDias, criterio: elaborado ? CRONO_CRITERIO : "" };
      }
    } else {
      cronoSemPrazo = true;
      pend.dados.push("Cronograma físico-financeiro não informado no pacote e sem o prazo de execução do edital para elaborá-lo: a seção sai como PENDÊNCIA. Falta o prazo de execução.");
    }

    var bdi = parseBdi(leitura, bdiPct);
    if (!bdi.ok) pend.dados.push("BDI: " + bdi.motivo + ".");
    else {
      bdi.avisos.forEach(function (a) { pend.dados.push("BDI: " + a + "."); });
      if (bdi.incoerente) pend.dados.push("BDI: " + bdi.msgIncoerente);
    }
    /* ENCARGOS: a tabela lida do órgão tem preferência. Se o órgão publicou só os totais (lic.encargosTotais),
       tenta a tabela da base (EncargosTab) cujos totais batem; sem ela, PENDÊNCIA. Nada é estimado. */
    var leituraEnc = leitura, encFalta = "", encOrigem = null;
    var temLinhasEnc = !!(leitura && leitura.encargos && Array.isArray(leitura.encargos.linhas) && leitura.encargos.linhas.length);
    var etot = lic.encargosTotais;
    if (!temLinhasEnc && etot && etot.horista > 0) {
      /* UF: 1º a que o órgão disse junto dos totais; 2º a das bases exigidas; senão, sem UF (só vale se UMA tabela fechar) */
      var ET = _dep("EncargosTab"), ufs = [], tabE = null, semUf = false;
      var ufDoOrgao = s(etot.uf).toUpperCase();
      if (ufDoOrgao) ufs.push(ufDoOrgao);
      else (Array.isArray(lic.basesExigidas) ? lic.basesExigidas : []).forEach(function (b) {
        var u = s(b && b.uf).toUpperCase(); if (u && ufs.indexOf(u) < 0) ufs.push(u);
      });
      if (!ufs.length) { ufs.push(null); semUf = true; }
      if (ET && ET.achar) ufs.forEach(function (u) { if (!tabE) tabE = ET.achar(u, s(etot.regime), etot.horista, etot.mensalista); });
      if (tabE) {
        leituraEnc = { encargos: { linhas: tabE.linhas }, tabelas: { desonerado: tabE.regime === "desonerado" }, regimeConfirmado: true };
        encOrigem = { uf: s(tabE.uf), competencia: s(tabE.competencia), fonte: s(tabE.fonte), rotulo: s(tabE.rotulo), regime: s(tabE.regime), horista: etot.horista, mensalista: etot.mensalista, semUf: semUf };
        pend.dados.push("Encargos: tabela por grupo tirada da base (" + (tabE.nomeUf || encOrigem.uf) + ", " + (encOrigem.regime === "desonerado" ? "desonerado" : "não desonerado") + ", vigência " + (ET.vigenciaTexto ? ET.vigenciaTexto(encOrigem.competencia) : encOrigem.competencia) + "), conferida com os totais publicados pelo órgão" + (semUf ? "; o órgão não disse a UF e esta é a única tabela da base que fecha com os dois totais" : "") + ". Os totais do órgão não foram alterados.");
        /* vigência da tabela x competência do orçamento: avisa, não bloqueia */
        var compOrc = "";
        (Array.isArray(lic.basesExigidas) ? lic.basesExigidas : []).forEach(function (b) { if (!compOrc && /^\d{4}-\d{2}$/.test(s(b && b.competencia))) compOrc = s(b.competencia); });
        if (!compOrc && /^\d{4}-\d{2}$/.test(s(orc.competenciaSinapi))) compOrc = s(orc.competenciaSinapi);
        if (compOrc && compOrc !== encOrigem.competencia) pend.dados.push("Encargos: a tabela da base tem vigência " + (ET.vigenciaTexto ? ET.vigenciaTexto(encOrigem.competencia) : encOrigem.competencia) + " e a competência do orçamento é " + (ET.vigenciaTexto ? ET.vigenciaTexto(compOrc) : compOrc) + ". Os totais conferem com os do órgão; conferir a vigência.");
      } else {
        var porque = semUf ? "nenhuma tabela da base, ou mais de uma, fecha com eles sem a UF" : "a base não tem a tabela por grupo que feche com eles" + (ufDoOrgao ? " em " + ufDoOrgao : "");
        encFalta = "O órgão publicou só os totais (horista " + fmt(etot.horista, 2) + "%, mensalista " + fmt(etot.mensalista, 2) + "%, fonte " + (s(etot.fonte) || "não informada") + ") e " + (semUf ? porque : porque) + ". Nenhum valor foi estimado.";
      }
    }
    var enc = parseEncargos(leituraEnc);
    if (enc.ok && etot && etot.horista > 0 && etot.mensalista > 0) {
      enc.totaisOrgao = { horista: etot.horista, mensalista: etot.mensalista, fonte: s(etot.fonte) };
      if (!encOrigem && (Math.abs(enc.total.horista - etot.horista) > 0.015 || Math.abs(enc.total.mensalista - etot.mensalista) > 0.015)) {
        enc.totaisOrgao.diverge = true;
        pend.dados.push("Encargos: os totais publicados pelo órgão (horista " + fmt(etot.horista, 2) + "%, mensalista " + fmt(etot.mensalista, 2) + "%) diferem da tabela usada (" + fmt(enc.total.horista, 2) + "% / " + fmt(enc.total.mensalista, 2) + "%). Conferir.");
      }
    }
    if (!enc.ok) { if (encFalta) { enc.pendTexto = encFalta; pend.dados.push("Encargos sociais: " + encFalta); } else pend.dados.push("Encargos sociais: " + enc.motivo + "."); }
    else { enc.avisos.forEach(function (a) { pend.dados.push("Encargos: " + a + "."); }); if (encOrigem) enc.origem = encOrigem; }

    /* o que a leitura do PDF já apontou como pendente de conferência */
    var conf = leitura && leitura.conferencia && Array.isArray(leitura.conferencia.pendencias) ? leitura.conferencia.pendencias : [];
    conf.forEach(function (p) {
      if (typeof p === "string") { pend.conferencia.push(p); return; }
      if (p && p.o_que) {  /* pendência da leitura do PDF do órgão: {onde, item, pagina, o_que} -> "Composição, item 2.2 (p. 21): insumo I2445: ..." */
        var onde = s(p.onde || ""), cabeca = (onde ? onde.charAt(0).toUpperCase() + onde.slice(1) : "Leitura") + (p.item ? ", item " + s(p.item) : "") + (p.pagina ? " (p. " + s(p.pagina) + ")" : "");
        pend.conferencia.push(cabeca + ": " + s(p.o_que));
        return;
      }
      pend.conferencia.push((p && (p.texto || p.mensagem || p.descricao)) ? s(p.texto || p.mensagem || p.descricao) : JSON.stringify(p));
    });

    var auxSem = aux.filter(function (a) { return !a.reg; });
    /* mesma regra do aviso de "base não carregada": o edital 7.20 não pede a abertura das auxiliares, então a lista só é pendência quando a base é exigida */
    if (auxSem.length && baseExigida) pend.dados.push(auxSem.length + " composição(ões) auxiliar(es) sem detalhamento na base: " + auxSem.map(function (a) { return a.codigo; }).join(", ") + ".");
    var dl = lic.descontoLinear;
    if (dl && dl.incidencia) {
      var rotInc = dl.incidencia === "MAT" ? "no material" : (dl.incidencia === "MO" ? "na mão de obra" : "no equipamento");
      if (dl.baseRecusada) pend.dados.push("Desconto só " + rotInc + ": a base carregada era a " + dl.baseRecusada + ", diferente da tabela do projeto, e as composições auxiliares NÃO receberam o desconto.");
      if (dl.auxSemComposicao && dl.auxSemComposicao.length) pend.dados.push("Desconto só " + rotInc + ": " + dl.auxSemComposicao.length + " composição(ões) auxiliar(es) sem composição conhecida ficaram sem desconto: " + dl.auxSemComposicao.join(", ") + ".");
      if (dl.auxDivergentes && dl.auxDivergentes.length) pend.dados.push("Desconto só " + rotInc + ": a composição da base não explica o preço usado no item para " + dl.auxDivergentes.join(", ") + " (outra tabela?); essa(s) auxiliar(es) ficaram sem desconto.");
      if (dl.auxCiclo && dl.auxCiclo.length) pend.dados.push("Desconto só " + rotInc + ": a base traz " + dl.auxCiclo.join(", ") + " dentro de si mesma; a repetição interna ficou sem desconto. Conferir a composição.");
    }

    var dados = {
      valor: valor, valorExtenso: extenso, cab: cab, emp: emp, bdiPct: bdiPct, tabelaRef: tabelaRef,
      base: baseOk ? { tabela: baseOk.tabela, mes: baseOk.mes, uf: baseOk.uf, desonerado: baseOk.desonerado, fonte: baseOk.fonte } : null,
      etapas: porEtapa, itens: itens, tot: tot, somaCats: somaCats, difCats: difCats, custoItens: custoItens,
      baseExigida: baseExigida,
      consumoNoAnalitico: !!(leitura && leitura.composicoes_orgao && itens.length && itens.every(function (I) { return I.doOrgao; })),
      aux: aux, quant: qLista, curva: curva, crono: crono, bdi: bdi, enc: enc, prazoDias: prazoDias, cronoSemPrazo: cronoSemPrazo, valorMaximo: num0(lic.valorEstimado),
      objetoInfo: objInfo, validadeDias: vEd || vCom || 0, validadeEdital: !!vEd,
      pend: pend, descTrocadas: descTrocadas, prazoTexto: txtPrazo, prazoDiverge: prazoDiverge, prazoDiasTexto: diasTxt,
      desconto: lic.descontoLinear || lic.descontoItens || null, cartaDoEdital: cartaEd
    };

    /* ---- UM valor só ---- */
    /* Analítico e planilha têm de dizer o mesmo, e preço zero ou negativo não sai em proposta. */
    var ruins = [];
    itens.forEach(function (x) {
      if (!(x.pu > 0)) ruins.push("item " + x.numero + " com preço " + R(x.pu));
      if (x.insumos.length) {
        var so = 0; x.insumos.forEach(function (i) { so += i.ct; });
        /* Composição lida da planilha analítica do órgão: ele trunca cada linha ao centavo, e coeficiente x valor pode passar da tolerância com a
           conta dele certa (Sangão 2.1.1: 1,9705 x 1,95). O excesso aceito é só o que o truncamento explica: até R$ 0,01 por linha, nunca para menos. */
        var porTrunc = x.doOrgao && so >= x.cu && (so - x.cu) <= 0.01 * x.insumos.length + 1e-9;
        if (!porTrunc && Math.abs(so - x.cu) > Math.max(0.02, x.cu * 0.01)) ruins.push("item " + x.numero + " (" + x.codigo + "): a composição soma " + R(so) + " e o custo na planilha é " + R(x.cu));
      }
    });
    if (ruins.length) return { ok: false, erro: "O pacote não pode sair assim: " + ruins.slice(0, 5).join("; ") + (ruins.length > 5 ? " e mais " + (ruins.length - 5) : "") + ". Use o desconto por item ou desfaça a alteração manual do preço.", divergencias: ruins };
    var div = conferirValores(dados);
    if (div.length) return { ok: false, erro: "A proposta teria valores diferentes: " + div.join("; ") + ". Corrija o orçamento antes de gerar o pacote.", divergencias: div, dados: dados };
    return { ok: true, dados: dados, pendencias: pend };
  }

  function num0(v) { var x = nm(v); return x > 0 ? x : 0; }

  /* =====================================================================
   * CONFERÊNCIA CONTRA O ITEM 7.20 do edital — só na TELA, nunca no documento.
   * Pura: recebe os `dados` de montar() e o `lic`. Devolve [{item, ok, detalhe}].
   * ===================================================================== */
  function conferirEdital(d, lic) {
    var out = [], tot = d.tot;
    /* estado: "ok" (verificado de fato) | "nao_conferido" (não deu para verificar: NUNCA aparece como verde) | "reprovado".
       `ok` (boolean) continua, só true quando o estado é "ok". */
    function add(item, estado, detalhe) { out.push({ item: item, estado: estado, ok: estado === "ok", detalhe: detalhe }); }
    function lista(a, n) { return a.slice(0, n || 10).join("; ") + (a.length > (n || 10) ? " e mais " + (a.length - (n || 10)) : ""); }

    var falta = [];
    d.itens.forEach(function (I) {
      var f = [];
      if (!s(I.descricao)) f.push("descrição");
      if (!s(I.unidade)) f.push("unidade");
      if (!(I.quantidade > 0)) f.push("quantidade");
      if (!(I.pu > 0)) f.push("preço unitário");
      if (!(I.pt > 0)) f.push("total");
      if (f.length) falta.push("item " + I.numero + " sem " + f.join(", "));
    });
    add("Planilha com descrição, unidade, quantidade, preço unitário e total", falta.length ? "reprovado" : "ok",
      falta.length ? lista(falta) : d.itens.length + " itens completos.");

    /* MO/MAT/EQ: só "ok" se NENHUM item ficou em OUTROS. Sobra = não conferido (diz quantos itens e que % do custo); tudo em OUTROS = reprova. */
    var ci = d.custoItens, cT = ci ? ci.tot : null;
    if (!ci) add("Custos de material, mão de obra e equipamento", "reprovado", "Seção de custos por item ausente.");
    else {
      var fecha = Math.abs(arr(cT.MAT + cT.MO + cT.EQ + cT.OUTROS, 2) - arr(tot.semBdi, 2)) < 0.005 && Math.abs(cT.pt - arr(d.valor, 2)) < 0.005;
      var emOutros = ci.linhas.filter(function (L) { return L.OUTROS > 0.005; });
      var pctOutros = tot.semBdi > 0 ? cT.OUTROS / tot.semBdi * 100 : 0;
      /* "ok" quando TODOS os itens têm composição e as colunas fecham, MESMO com parcela em "outros" de serviço (ex.: limpeza de fossa) ou
         de composição auxiliar sem repartição: o detalhe diz quanto e por quê. Item sem composição continua "não conferido". */
      var semCompL = ci.linhas.filter(function (L) { return L.semComposicao; });
      var auxOut = 0, servOut = 0, nAuxOut = 0, nServOut = 0;
      emOutros.forEach(function (L) {
        if (L.semComposicao || !L.doOrgao) return;
        var a = Math.min(L.auxOutros || 0, L.OUTROS), sv = arr(L.OUTROS - a, 2);
        if (a > 0.005) { auxOut += a; nAuxOut++; }
        if (sv > 0.005) { servOut += sv; nServOut++; }
      });
      /* O VERDE tem condição dupla (revisão de 09/11/2026): TODOS os itens são composição do ÓRGÃO (composicaoOrgao) e o que ficou em "outros"
         (serviço + auxiliar sem repartição) é no máximo 2% do custo direto. Item com composição própria (sem composicaoOrgao) e custo em "outros"
         nunca é verde: nada garante que "outros" seja serviço que o órgão publica como um valor só. */
      var todosOrgao = ci.linhas.length > 0 && ci.linhas.every(function (L) { return L.doOrgao; });
      var outrosTot = arr(auxOut + servOut, 2), pctOut = tot.semBdi > 0 ? outrosTot / tot.semBdi * 100 : 0;
      var foraOrgaoOutros = ci.linhas.filter(function (L) { return !L.doOrgao && L.OUTROS > 0.005 && !L.semComposicao; });
      var estCat = (!fecha || ci.todosOutros) ? "reprovado"
        : ((semCompL.length || (ci.compDif && ci.compDif.n)) ? "nao_conferido"
          : (!emOutros.length ? "ok" : ((todosOrgao && pctOut <= 2 + 1e-9) ? "ok" : "nao_conferido")));
      add("Custos de material, mão de obra e equipamento", estCat,
        "Seção \"Custos por item\": material " + R(cT.MAT) + "; mão de obra " + R(cT.MO) + "; equipamento " + R(cT.EQ) + "; outros " + R(cT.OUTROS) +
          (ci.porProporcao ? ". " + ci.porProporcao + " de " + ci.linhas.length + " item(ns) sem composição no pacote repartidos pela proporção da base " + ci.fonteProporcao + " do mesmo código" : "") +
          (ci.compDif && ci.compDif.n ? ". " + ci.compDif.n + " deles pela SINAPI " + ci.compDif.base + ", e o órgão usa " + ci.compDif.orgao + ": a proporção pode diferir, conferir" : "") +
          (ci.semComposicao ? ". " + ci.semComposicao + " de " + ci.linhas.length + " item(ns) sem composição no pacote (custo inteiro em \"outros\")" : "") +
          (ci.todosOutros ? ". Todos os itens caíram em \"outros\": não há custo por categoria" : "") +
          (estCat !== "reprovado" && (nAuxOut || nServOut) ? ". Nos itens COM composição, o que ficou em \"outros\" (" + R(arr(auxOut + servOut, 2)) + "): " +
            (nServOut ? R(arr(servOut, 2)) + " de serviço contratado (" + nServOut + " item(ns), a composição do órgão traz o serviço como um valor só)" : "") +
            (nServOut && nAuxOut ? " e " : "") +
            (nAuxOut ? R(arr(auxOut, 2)) + " de composição auxiliar sem repartição (" + nAuxOut + " item(ns); sem o analítico da MESMA UF carregado. Competência diferente é apontada, e o regime (onerado ou não) não é conferido)" : "") +
            (nServOut || nAuxOut ? "; " + P(pctOut) + " do custo direto, e o verde vale até 2%" : "") : "") +
          (foraOrgaoOutros.length ? ". " + foraOrgaoOutros.length + " item(ns) com composição própria (sem composição do órgão) têm custo em \"outros\": nada garante que seja serviço publicado como valor único" : "") +
          (!todosOrgao && ci.linhas.length ? ". Nem todos os itens vêm da composição do órgão" : "") +
          (estCat === "nao_conferido" ? ". " + emOutros.length + " de " + ci.linhas.length + " item(ns) ficaram com custo em \"outros\" (" + P(pctOutros) + " do custo direto): conferir a composição desses itens. Itens em outros (número, código, fonte, valor): " + lista(emOutros.map(function (L) { return L.numero + ", " + (L.codigo || "sem código") + ", " + (L.fonte || "sem fonte") + ", " + R(L.OUTROS); }), 30) : "") +
          (!fecha ? ". As colunas não fecham com o custo direto e o preço da proposta" : "") + ".");
    }

    var indiretos = arr(tot.comBdi - tot.semBdi, 2);
    add("Custos diretos, indiretos e BDI", (tot.semBdi > 0 && tot.comBdi >= tot.semBdi) ? "ok" : "reprovado",
      "Direto " + R(tot.semBdi) + "; indiretos (BDI) " + R(indiretos) + "; BDI do orçamento " + P(d.bdiPct) + ".");

    add("Soma dos itens igual ao preço global da proposta", Math.abs(arr(tot.comBdi, 2) - arr(d.valor, 2)) < 0.005 ? "ok" : "reprovado",
      "Itens " + R(tot.comBdi) + "; proposta " + R(d.valor) + ".");

    var acima = [], comRef = 0;
    d.itens.forEach(function (I) { if (I.refMax > 0) { comRef++; if (I.pu > I.refMax + 0.005) acima.push("item " + I.numero + " (" + R(I.pu) + " > " + R(I.refMax) + ")"); } });
    if (!comRef) add("Nenhum item acima do preço unitário máximo do órgão", "nao_conferido", "Nenhum item tem preço unitário de referência do órgão: não há com o que comparar.");
    else add("Nenhum item acima do preço unitário máximo do órgão", acima.length ? "reprovado" : "ok",
      acima.length ? acima.length + " item(ns) acima: " + lista(acima, 10) : comRef + " de " + d.itens.length + " itens conferidos contra o máximo do órgão; nenhum acima (os " + (d.itens.length - comRef) + " sem referência não entram).");

    var vm = lic && lic.valorEstimado > 0 ? lic.valorEstimado : (d.valorMaximo || 0);
    if (vm > 0) add("Total não acima do máximo global", d.valor <= vm + 0.005 ? "ok" : "reprovado", "Proposta " + R(d.valor) + "; máximo " + R(vm) + ".");
    else add("Total não acima do máximo global", "nao_conferido", "O pacote não informa máximo global: não há com o que comparar.");

    if (!(d.bdi && d.bdi.ok)) add("Composição do BDI", "reprovado", "Composição do BDI não informada.");
    else if (d.bdi.incoerente) add("Composição do BDI", "reprovado", d.bdi.msgIncoerente);
    else if (d.bdi.calculado == null) add("Composição do BDI", "nao_conferido", "Composição presente (" + d.bdi.grupos.length + " grupos), mas não consegui recalcular o BDI a partir das linhas para comparar com " + P(d.bdiPct) + ".");
    else add("Composição do BDI", "ok", "Composição presente (" + d.bdi.grupos.length + " grupos); dá " + P(d.bdi.calculado) + (d.bdi.impresso != null && Math.abs(d.bdi.impresso - d.bdi.calculado) > 0.005 ? " (o órgão imprime " + P(d.bdi.impresso) + ")" : "") + ", a proposta usa " + P(d.bdiPct) + ".");

    var en = d.enc;
    if (!(en && en.ok)) add("Composição dos encargos sociais", "reprovado", en && en.pendTexto ? en.pendTexto : "Encargos não informados.");
    else {
      var nNL = 0; en.grupos.forEach(function (g) { g.linhas.forEach(function (l) { if (l.mensalistaNL || l.horistaNL) nNL++; }); });
      if (en.totaisOrgao && en.totaisOrgao.diverge) add("Composição dos encargos sociais", "reprovado", "Os totais publicados pelo órgão diferem da tabela usada.");
      else if (!en.regimeSabido) add("Composição dos encargos sociais", "nao_conferido", "Tabela por grupo presente, mas o regime (desonerado ou não) não foi confirmado: conferir qual tabela vale.");
      else if (nNL) add("Composição dos encargos sociais", "nao_conferido", "Tabela por grupo presente; " + nNL + " linha(s) com valor não lido (saem como PENDÊNCIA).");
      else add("Composição dos encargos sociais", "ok", "Tabela por grupo presente, regime " + (en.desonerado ? "desonerado" : "não desonerado") + " confirmado.");
    }

    var oi = d.objetoInfo;
    if (oi) {
      if (oi.invalido) add("Objeto", "reprovado", "O objeto ficou [PREENCHER: objeto]" + (d.cartaDoEdital ? " no cabeçalho dos documentos" : " na carta") + ": " + oi.motivo + ". O pacote não trouxe o objeto do edital.");
      else if (oi.origem === "edital" || oi.origem === "opcoes") add("Objeto", "ok", "Objeto " + (oi.origem === "edital" ? "lido do edital" : "informado") + ": " + oi.texto.slice(0, 160) + (oi.texto.length > 160 ? "…" : ""));
      else add("Objeto", "nao_conferido", "O pacote não trouxe o objeto do edital; " + (d.cartaDoEdital ? "o cabeçalho dos documentos usa o nome " : "a carta usa o nome ") + (oi.origem === "obra" ? "da obra" : "") + " do orçamento (" + oi.texto.slice(0, 120) + "). " + (oi.comparou ? "Não é o nome do órgão, mas confira com o edital." : "Sem o nome do órgão para comparar: confira com o edital."));
    }
    if (d.validadeEdital) add("Validade", "ok", (d.cartaDoEdital ? "O orçamento usa " : "A carta usa ") + d.cab.validade + ", a validade exigida no edital" + (d.cab.validadeInicio ? " (" + d.cab.validadeInicio + ")" : "") + ".");
    else add("Validade", "nao_conferido", "Validade do edital não conferida: o pacote não trouxe a validade exigida no edital; confira. " + (d.cab && d.cab.validade ? (d.cartaDoEdital ? "O orçamento usa " : "A carta usa ") + d.cab.validade + " (do orçamento)." : (d.cartaDoEdital ? "A validade não está no orçamento." : "A carta sai com [PREENCHER: validade da proposta].")));

    /* prazo: a carta usa o prazo em dias lido do edital; o texto do orçamento não manda */
    if (!d.prazoDias) add("Prazo de execução da carta", "nao_conferido", "O edital não trouxe o prazo em dias; " + (d.cartaDoEdital ? "vale o texto do orçamento (" : "a carta usa o texto do orçamento (") + (d.cab && d.cab.prazo ? d.cab.prazo : "sem prazo") + ").");
    else if (d.prazoDiverge) add("Prazo de execução da carta", "reprovado", (d.cartaDoEdital ? "O orçamento usa " : "A carta usa ") + d.cab.prazo + " (edital), e o orçamento diz \"" + d.prazoTexto + "\"" + (d.prazoDiasTexto != null ? " (" + d.prazoDiasTexto + " dias)" : " (não convertido em dias)") + ".");
    else add("Prazo de execução da carta", "ok", (d.cartaDoEdital ? "O orçamento usa " : "A carta usa ") + d.cab.prazo + ", o prazo lido do edital" + (d.prazoTexto ? " (o texto do orçamento concorda)" : "") + ".");

    var cr = d.crono;
    if (!cr) add("Cronograma compatível com o prazo", "reprovado", d.cronoSemPrazo ? "Sem cronograma e sem o prazo de execução." : "Cronograma ausente ou incompleto.");
    else {
      var esperado = d.prazoDias ? Math.ceil(d.prazoDias / 30) : 0;
      var okc = Math.abs(cr.total - d.valor) < 0.005 && (!esperado || cr.nMeses === esperado);
      add("Cronograma compatível com o prazo", !okc ? "reprovado" : (esperado ? "ok" : "nao_conferido"), cr.nMeses + " mês(es)" + (d.prazoDias ? " para o prazo de " + d.prazoDias + " dias" : " (prazo do edital não informado: não deu para conferir o número de meses)") +
        "; total " + R(cr.total) + (cr.elaborado ? "; elaborado pelo sistema, conferir." : "."));
    }
    return out;
  }

  /* soma de cada seção contra `totalProposta` — nenhuma pode divergir de um centavo */
  function conferirValores(d) {
    var dv = [], v = d.valor;
    function conf(rot, x) { if (Math.abs(arr(x, 2) - v) > 0.005) dv.push(rot + " " + R(x) + " ≠ total da proposta " + R(v)); }
    conf("soma dos itens da planilha", d.tot.comBdi);
    var sE = 0; d.etapas.forEach(function (E) { sE += E.comBdi; }); conf("soma das etapas", sE);
    var sC = 0; d.curva.forEach(function (c) { sC += c.pt; }); conf("curva ABC", sC);
    if (d.crono) conf("cronograma", d.crono.total);
    if (d.custoItens) {
      conf("preço total na seção de custos por item", d.custoItens.tot.pt);
      if (Math.abs(d.custoItens.tot.ct - arr(d.tot.semBdi, 2)) > 0.005) dv.push("custo direto na seção de custos por item " + R(d.custoItens.tot.ct) + " ≠ custo direto da planilha " + R(d.tot.semBdi));
      var sc4 = arr(d.custoItens.tot.MAT + d.custoItens.tot.MO + d.custoItens.tot.EQ + d.custoItens.tot.OUTROS, 2);
      if (Math.abs(sc4 - d.custoItens.tot.ct) > 0.005) dv.push("material + mão de obra + equipamento + outros " + R(sc4) + " ≠ custo direto " + R(d.custoItens.tot.ct));
      /* o Resumo por etapa e a seção de custos por item têm de fechar CATEGORIA por categoria */
      var rotCat = { MO: "mão de obra", MAT: "material", EQ: "equipamento", OUTROS: "outros" };
      CATS.forEach(function (c) {
        var sEt = 0; d.etapas.forEach(function (E) { sEt += E.cat[c]; });
        if (Math.abs(arr(sEt, 2) - d.custoItens.tot[c]) > 0.005) dv.push("Resumo por etapa (" + rotCat[c] + ") " + R(sEt) + " ≠ custos por item (" + rotCat[c] + ") " + R(d.custoItens.tot[c]));
        if (Math.abs(d.tot.cat[c] - d.custoItens.tot[c]) > 0.005) dv.push("total do Resumo (" + rotCat[c] + ") " + R(d.tot.cat[c]) + " ≠ custos por item (" + rotCat[c] + ") " + R(d.custoItens.tot[c]));
      });
    }
    return dv;
  }

  /* pendências ANTES de gerar (para o aviso do botão) */
  function pendencias(orc, empresa, opcoes) {
    var r = montar(orc, empresa, opcoes);
    if (!r.ok) return { ok: false, erro: r.erro, preencher: [], conferencia: [], dados: [] };
    return { ok: true, dados_: r.dados, preencher: r.pendencias.preencher, conferencia: r.pendencias.conferencia, dados: r.pendencias.dados, licitante: r.pendencias.licitante || [],
      total: r.pendencias.preencher.length + r.pendencias.conferencia.length + r.pendencias.dados.length + (r.pendencias.licitante || []).length };
  }

  /* =====================================================================
   * HTML
   * ===================================================================== */
  var CSS = [
    "@page ld{size:A4;margin:0}",
    ".ld-raiz{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:8.5pt;line-height:1.28;-webkit-print-color-adjust:exact;print-color-adjust:exact}",
    ".ld-raiz.rel-doc{width:auto;max-width:none;padding:0;box-shadow:none;background:transparent;margin:0;font-size:8.5pt}",
    ".ld-raiz *{box-sizing:border-box}",
    ".ld-fonte{display:none}",
    ".ld-pg{page:ld;position:relative;width:210mm;height:297mm;overflow:hidden;background:#fff;margin:0 auto 10px;page-break-after:always;break-after:page;box-shadow:0 2px 14px rgba(0,0,0,.35)}",
    ".ld-pg:last-child{page-break-after:auto;break-after:auto}",
    ".ld-wm{position:absolute;left:50%;top:50%;width:115mm;height:115mm;margin:-57mm 0 0 -57mm;object-fit:contain;opacity:.07;z-index:0}",
    /* ⚠ O CABEÇALHO NUNCA CORTA. Antes a altura era fixa (26 mm) com overflow:hidden: objeto longo perdia OBRA:/DATA: pela metade.
       paginar() mede o .ld-id de verdade e grava --ld-hd-h / --ld-corpo-top na raiz; todas as páginas usam a mesma altura. */
    ".ld-hd{position:absolute;left:12mm;right:12mm;top:var(--ld-hd-top,8mm);height:var(--ld-hd-h,26mm);display:flex;align-items:center;justify-content:space-between;z-index:2}",
    ".ld-id{font-size:7.4pt;line-height:1.3;max-width:132mm}.ld-id b{font-weight:700}",
    ".ld-id-peq .ld-id{font-size:7pt}",
    ".ld-logo{max-height:23mm;max-width:46mm;object-fit:contain}",
    ".ld-logo-bg{width:46mm;height:23mm;background-repeat:no-repeat;background-size:contain;background-position:right center}",
    ".ld-hd.big .ld-logo-bg{width:70mm;height:36mm;background-position:center}",
    ".ld-wm-bg{background-repeat:no-repeat;background-size:contain;background-position:center}",
    ".ld-hd.big{top:6mm;height:38mm;justify-content:center}.ld-hd.big .ld-logo{max-height:36mm;max-width:70mm}",
    ".ld-corpo{position:absolute;left:12mm;right:12mm;top:var(--ld-corpo-top,36mm);bottom:38mm;overflow:hidden;z-index:2}",
    ".ld-pg[data-t=cartaA] .ld-corpo{top:46mm;bottom:22mm}",
    ".ld-pg[data-t=cartaB] .ld-corpo{top:14mm;bottom:22mm}",
    ".ld-ass{position:absolute;left:12mm;right:12mm;bottom:15mm;height:22mm;display:flex;gap:14mm;align-items:flex-end;justify-content:center;z-index:2;font-size:7.4pt;text-align:center}",
    ".ld-ass div{flex:1;border-top:.7pt solid #222;padding-top:1mm}",
    ".ld-ass b{display:block}",
    ".ld-pg[data-t=cartaA] .ld-ass,.ld-pg[data-t=cartaB] .ld-ass{display:none}",
    /* PAPEL TIMBRADO DE PÁGINA INTEIRA (.ld-tp na raiz): a imagem é o fundo de cada folha; sem marca d'água, logo nem cabeçalho grande.
       --tp-top / --tp-base (mm) = o que o papel ocupa em cima e embaixo; --ld-id-w = largura da identificação à esquerda da logo. */
    ".ld-tp .ld-tpbg{position:absolute;left:0;top:0;right:0;bottom:0;background-repeat:no-repeat;background-size:100% 100%;z-index:0}",
    ".ld-tp .ld-hd{right:auto;width:var(--ld-id-w,186mm);display:block}",
    ".ld-tp .ld-id{max-width:none;width:100%}",
    ".ld-tp .ld-corpo{bottom:calc(var(--tp-base,27mm) + 31mm)}",
    ".ld-tp .ld-pg[data-t=cartaA] .ld-corpo,.ld-tp .ld-pg[data-t=cartaB] .ld-corpo{top:calc(var(--tp-top,36mm) + 4mm);bottom:calc(var(--tp-base,27mm) + 9mm)}",
    ".ld-tp .ld-ass{bottom:calc(var(--tp-base,27mm) + 7mm);height:22mm}",
    ".ld-tp .ld-rod{bottom:calc(var(--tp-base,27mm) + 1.5mm);height:5mm;border-top:0;padding-top:0;justify-content:flex-end}",
    ".ld-rod{position:absolute;left:12mm;right:12mm;bottom:5mm;height:9mm;display:flex;justify-content:space-between;align-items:flex-end;font-size:6.4pt;line-height:1.3;z-index:2;border-top:.5pt solid #bbb;padding-top:1mm}",
    ".ld-rod .pag{white-space:nowrap;font-size:7pt}",
    ".ld-tit{font-size:12.5pt;font-weight:700;text-align:center;margin:2mm 0 3mm;text-transform:uppercase}",
    ".ld-sub{font-size:8pt;margin:0 0 2.5mm;text-align:justify}",
    ".ld-p{margin:0 0 2.4mm;text-align:justify;font-size:9pt;line-height:1.32}",
    ".ld-d{margin:0 0 1.2mm 5mm;text-indent:-5mm;padding-left:5mm;text-align:justify;font-size:9pt;line-height:1.3}",
    ".ld-dados{font-size:8.6pt;margin:0 0 1.2mm;line-height:1.32}",
    ".ld-t{width:100%;border-collapse:collapse;font-size:7.3pt;table-layout:fixed}",
    ".ld-t th{background:#d9d9d9;border:.5pt solid #777;padding:1mm 1mm;font-weight:700;text-align:center}",
    ".ld-t td{border:.5pt solid #888;padding:.7mm 1.1mm;vertical-align:middle;word-wrap:break-word;overflow-wrap:anywhere}",
    ".ld-t td.n{text-align:right;white-space:nowrap}.ld-t td.c{text-align:center}",
    ".ld-t tr.et td{background:#ececec;font-weight:700}",
    ".ld-t tr.tt td{background:#d9d9d9;font-weight:700}",
    ".ld-t tr.gr td{background:#f0f0f0;font-weight:700}",
    ".ld-ext{text-align:center;font-style:italic;margin:3mm 0;font-size:8.5pt}",
    ".ld-it{margin:0 0 4mm;page-break-inside:avoid}",
    ".ld-itt{font-weight:700;font-size:8.2pt;margin:0 0 1mm}",
    ".ld-itv{font-size:7.6pt;margin:0 0 0;text-align:right}.ld-itv b{display:inline-block;min-width:34mm;text-align:right}",
    ".ld-p0{color:#c00000;font-weight:700}",
    ".ld-pend{border:1px solid #c00000;color:#c00000;padding:3mm;font-weight:700;font-size:9pt;margin:3mm 0}",
    ".ld-nota{font-size:7.2pt;color:#444;margin:1.5mm 0}",
    ".ld-cab-q{font-weight:700;background:#ececec}",
    "@media print{.ld-pg{box-shadow:none;margin:0}.ld-raiz.rel-doc{margin:0}}"
  ].join("\n");

  /* campo que falta: vermelho. Campo presente: texto. */
  function campo(v, rotulo) {
    v = s(v);
    return v ? esc(v) : '<span class="ld-p0">[PREENCHER: ' + esc(rotulo) + ']</span>';
  }

  /* Registro do responsável técnico. Na empresa DO CERTAME imprime o que o cadastro trouxe, como veio (sem "CREA:" fixo: pode ser
     CAU ou outro conselho); se o texto não diz CREA nem CAU, sai como "Registro: ...". Fora do certame, como sempre foi. */
  function rtRegistro(e) {
    if (!e.certame) return 'CREA: ' + campo(e.rtCrea, "CREA do responsável técnico");
    var v = s(e.rtCrea);
    if (!v) return '<span class="ld-p0">[PREENCHER: registro (CREA/CAU) do responsável técnico]</span>';
    return /(^|[^A-Za-z])(CREA|CAU)([^A-Za-z]|$)/i.test(v) ? esc(v) : 'Registro: ' + esc(v);
  }

  function subst(texto, vars) {
    return texto.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
  }

  function tdN(v) { return '<td class="n">' + v + '</td>'; }
  function tdC(v) { return '<td class="c">' + v + '</td>'; }
  function td(v) { return '<td>' + v + '</td>'; }
  /* número do item (3.8.2.16) NUNCA quebra: partido em duas linhas ("3.7.1" / "0") cria um item que não existe */
  function tdI(v) { return '<td style="white-space:nowrap">' + v + '</td>'; }

  function secCarta(d) {
    var e = d.emp, cb = d.cab, h = "";
    var vars = {
      cidade: esc(cb.cidade), edital: esc(cb.edital), objeto: cb.objeto ? esc(cb.objeto) : '<span class="ld-p0">[PREENCHER: objeto]</span>',
      contagem: cb.validadeInicio ? esc(cb.validadeInicio) : "a contar da data de sua entrega",
      valor: '<b>' + esc(R(d.valor)) + ' (' + esc(d.valorExtenso) + ')</b>',
      valorExtenso: esc(d.valorExtenso), prazo: cb.prazo ? esc(cb.prazo) : '<span class="ld-p0">[PREENCHER: prazo de execução]</span>',
      validade: cb.validade ? esc(cb.validade) : '<span class="ld-p0">[PREENCHER: validade da proposta]</span>',
      inicio: esc(cb.prazoInicio)
    };
    h += '<p class="ld-p" style="margin-bottom:1mm"><b>À<br>Comissão Permanente de Licitação<br>' + vars.cidade + '<br>REF.: ' + vars.edital + '<br>Objeto: ' + vars.objeto + '</b></p>';
    h += '<p class="ld-p">Prezados Senhores,</p>';
    h += '<p class="ld-p">' + subst('Apresentamos a V. Sas. Nossa proposta para execução dos serviços objeto do Edital do certame em epígrafe, pelo valor global de {valor}, com prazo de execução de {prazo}, contados a partir da emissão da Ordem de Serviço pela CONTRATANTE.', vars) + '</p>';
    h += '<p class="ld-p">Concordamos integralmente e sem qualquer restrição com as condições desta licitação em referência, bem assim com as condições de contratação, estabelecidas na minuta do contrato que nos foi fornecida com o edital, e que nos submetemos às disposições regulamentares e legais sobre esta licitação, especialmente a Lei Federal nº 14.133 de 2021 e suas posteriores alterações.</p>';
    h += '<p class="ld-p">Comprometemo-nos a nos manifestarmos acerca da concordância da prorrogação e revalidação da proposta, caso seja necessário, antes de 10 (dez) dias do vencimento da mesma, por igual e sucessivo período, cientes que a falta de manifestação nos libera, excluindo-nos deste certame licitatório.</p>';
    h += '<p class="ld-p">' + subst('Informamos que o prazo de validade da nossa proposta é de {validade}, {contagem}.', vars) + '</p>';
    h += '<p class="ld-p">Declaramos que:</p>';
    var decl = [
      "Temos conhecimento dos locais e das condições de execução da obra.",
      "Nos preços contidos na proposta escrita e naqueles que, porventura, vierem a ser ofertados por meios de lances verbais estão incluídos todos os custos e despesas, tais como: impostos, taxas, fretes e outros.",
      "Estamos de pleno acordo com todas as condições estabelecidas no Edital da Licitação e seus anexos.",
      "Na execução da obra observaremos, rigorosamente, as especificações das normas técnicas brasileiras, bem assim as recomendações e instruções da fiscalização do órgão promotor desta licitação, assumindo, desde já, a integral e exclusiva responsabilidade pela perfeita realização dos trabalhos.",
      "Estão contidas todas as despesas necessárias para a execução dos serviços, tais como:" +
        '<ul style="margin:.8mm 0 .8mm 6mm;padding:0"><li>Materiais, equipamentos e mão de obra;</li><li>Carga, transporte, descarga e montagem;</li><li>Salários, encargos sociais, trabalhistas, previdenciários e outros;</li><li>Tributos, taxas e tarifas, emolumentos, licenças, alvarás, multas e/ou quaisquer infrações;</li><li>Seguros em geral, bem como encargos decorrentes de fenômenos da natureza, da infortunística e de responsabilidade civil para quaisquer danos e prejuízos causados a Contratante e/ou a terceiros, gerados direta ou indiretamente pela execução das obras e/ou serviços.</li></ul>',
      "Nossas propostas econômicas compreendem a integralidade dos custos para atendimento dos direitos trabalhistas assegurados na Constituição Federal, nas leis trabalhistas, nas normas infralegais, nas convenções coletivas de trabalho e nos termos de ajustamento de conduta vigentes na data de entrega das propostas.",
      "Não empregamos menor de 18 (dezoito) anos em trabalho noturno, perigoso ou insalubre, nem menor de 16 (dezesseis) anos, salvo na condição de aprendiz, a partir dos 14 (quatorze) anos.",
      "Não possuímos em nossa cadeia produtiva empregados executando trabalho degradante ou forçado.",
      "Cumprimos a reserva de cargos para pessoa com deficiência e para reabilitado da Previdência Social, prevista no art. 93 da Lei nº 8.213/1991."
    ];
    decl.forEach(function (t, k) { h += '<p class="ld-d">' + String.fromCharCode(97 + k) + ")&nbsp;&nbsp;" + t + '</p>'; });
    h += '<p class="ld-dados" style="margin-top:2.5mm"><b>Razão social:</b> ' + campo(e.nome, "razão social") + '</p>';
    h += '<p class="ld-dados"><b>CNPJ Nº:</b> ' + campo(e.cnpj, "CNPJ") + '</p>';
    h += '<p class="ld-dados"><b>Inscrição municipal:</b> ' + campo(e.inscricaoMunicipal, "inscrição municipal") + '</p>';
    h += '<p class="ld-dados"><b>Endereço:</b> ' + campo(e.endereco, "endereço") + '</p>';
    h += '<p class="ld-dados"><b>Fone:</b> ' + campo(e.telefone, "telefone") + ' . <b>E-mail:</b> ' + campo(e.email, "e-mail") + '</p>';
    h += '<p class="ld-dados"><b>Dados Bancários:</b> Banco ' + campo(e.banco, "banco") + ', Agência nº ' + campo(e.agencia, "agência") +
      ', Conta Corrente nº ' + campo(e.conta, "conta corrente") + ', em nome de ' + campo(e.nome, "razão social") + ', CNPJ nº ' + campo(e.cnpj, "CNPJ") + '</p>';
    h += '<p class="ld-p" style="margin-top:2.5mm">' + subst('Finalizando, declaramos que assumimos inteira responsabilidade pela execução dos serviços objeto deste Edital e que serão executados conforme exigência editalícia e contratual' + (cb.prazoInicio ? ', e que serão iniciados dentro do prazo de até {inicio} dias consecutivos, contados a partir da data de recebimento da Ordem de Serviço' : '') + '.', vars) + '</p>';
    h += '<div style="display:flex;gap:14mm;margin-top:9mm;text-align:center;font-size:8.4pt">' +
      '<div style="flex:1;border-top:.7pt solid #222;padding-top:1mm"><b>' + campo(e.nome, "razão social") + '</b><br>' + campo(e.socioNome, "nome do sócio administrador") + '<br>' + campo(e.socioCargo, "cargo do sócio") + '</div>' +
      '<div style="flex:1;border-top:.7pt solid #222;padding-top:1mm"><b>' + campo(e.rtNome, "nome do responsável técnico") + '</b><br>Responsável Técnico<br>' + rtRegistro(e) + '</div></div>';
    return '<section class="ld-sec" data-tipo="carta" data-titulo="Carta proposta">' + h + '</section>';
  }

  function secResumo(d) {
    var h = '<div class="ld-tit">Resumo do Orçamento</div>';
    var t = '<table class="ld-t ld-split"><colgroup><col style="width:7mm"><col style="width:36mm"><col style="width:21mm"><col style="width:21mm"><col style="width:22mm"><col style="width:16mm"><col style="width:23mm"><col style="width:12mm"></colgroup>' +
      '<thead><tr><th rowspan="2">ITEM</th><th rowspan="2">DESCRIÇÃO</th><th colspan="4">CUSTO DIRETO (R$)</th><th rowspan="2">PREÇO TOTAL (R$)</th><th rowspan="2">%</th></tr>' +
      '<tr><th>MÃO DE OBRA</th><th>MATERIAL</th><th>EQUIPAMENTO</th><th>OUTROS</th></tr></thead><tbody>';
    d.etapas.forEach(function (E) {
      t += '<tr>' + tdC(esc(E.codigo)) + td(esc(E.nome)) + tdN(R(E.cat.MO)) + tdN(R(E.cat.MAT)) + tdN(R(E.cat.EQ)) + tdN(R(E.cat.OUTROS)) + tdN(R(E.comBdi)) +
        tdN(P(d.tot.comBdi > 0 ? E.comBdi / d.tot.comBdi * 100 : 0)) + '</tr>';
    });
    t += '<tr class="tt"><td></td><td>TOTAL:</td>' + tdN(R(d.tot.cat.MO)) + tdN(R(d.tot.cat.MAT)) + tdN(R(d.tot.cat.EQ)) + tdN(R(d.tot.cat.OUTROS)) + tdN(R(d.tot.comBdi)) + tdN("100,00%") + '</tr></tbody></table>';
    h += t;
    h += '<p class="ld-p" style="margin-top:3mm;text-align:right"><b>VALOR TOTAL: ' + esc(R(d.valor)) + '</b></p>';
    h += '<p class="ld-ext">' + esc(cap(d.valorExtenso)) + '</p>';
    var ciR = d.custoItens || {}, nPropR = ciR.porProporcao || 0, nDifR = (ciR.compDif && ciR.compDif.n) || 0;
    var nota = "Custo direto da planilha repartido por categoria, na proporção de cada composição" +
      (nPropR ? "; nos " + nPropR + " item(ns) sem composição no pacote, na proporção da composição do mesmo código na " + s(ciR.fonteProporcao) + (nDifR ? " (competência diferente da usada pelo órgão, " + s(ciR.compDif.orgao) + ")" : "") : "") +
      ". O preço total é o da planilha (custo direto + BDI de " + P(d.bdiPct) + ").";
    h += '<p class="ld-nota">' + esc(nota) + '</p>';
    return '<section class="ld-sec" data-tipo="corpo" data-titulo="Resumo por etapa">' + h + '</section>';
  }

  function secSintetico(d) {
    var h = '<div class="ld-tit">Planilha Orçamentária</div>';
    var t = '<table class="ld-t ld-split"><colgroup><col style="width:13mm"><col style="width:13mm"><col style="width:38mm"><col style="width:14mm"><col style="width:9mm"><col style="width:16mm"><col style="width:17mm"><col style="width:17mm"><col style="width:19mm"><col style="width:20mm"></colgroup>' +
      '<thead><tr><th rowspan="2">ITEM</th><th rowspan="2">CÓDIGO</th><th rowspan="2">DESCRIÇÃO</th><th rowspan="2">FONTE</th><th rowspan="2">UNID.</th><th rowspan="2">QTD.</th><th colspan="2">VALOR UNITÁRIO R$</th><th colspan="2">PREÇO TOTAL R$</th></tr>' +
      '<tr><th>SEM BDI</th><th>COM BDI</th><th>SEM BDI</th><th>COM BDI</th></tr></thead><tbody>';
    d.etapas.forEach(function (E) {
      t += '<tr class="et kn"><td>' + esc(E.codigo) + '</td><td colspan="5">' + esc(E.nome) + '</td><td></td><td></td>' + tdN(R(E.semBdi)) + tdN(R(E.comBdi)) + '</tr>';
      E.itens.forEach(function (I) {
        t += '<tr>' + tdI(esc(I.numero)) + td(esc(I.codigo)) + td(esc(I.descricao)) + tdC(esc(I.fonte)) + tdC(esc(I.unidade)) + tdN(fmt(I.quantidade, 2)) +
          tdN(R(I.cu)) + tdN(R(I.pu)) + tdN(R(I.ct)) + tdN(R(I.pt)) + '</tr>';
      });
    });
    t += '<tr class="tt"><td colspan="8">VALOR TOTAL:</td>' + tdN(R(d.tot.semBdi)) + tdN(R(d.tot.comBdi)) + '</tr></tbody></table>';
    h += t + '<p class="ld-ext">' + esc(cap(d.valorExtenso)) + '</p>';
    return '<section class="ld-sec" data-tipo="corpo" data-titulo="Planilha orçamentária">' + h + '</section>';
  }

  /* bloco analítico de UMA composição */
  function secCustosItem(d) {
    var h = '<div class="ld-tit">Custos por item: material, mão de obra e equipamento</div>';
    var t = '<table class="ld-t ld-split"><colgroup><col style="width:13mm"><col style="width:46mm"><col style="width:17mm"><col style="width:17mm"><col style="width:22mm"><col style="width:16mm"><col style="width:18mm"><col style="width:16mm"><col style="width:19mm"></colgroup>' +
      '<thead><tr><th>ITEM</th><th>DESCRIÇÃO</th><th>MATERIAL</th><th>MÃO DE OBRA</th><th>EQUIPAMENTO</th><th>OUTROS</th><th>CUSTO DIRETO</th><th>BDI</th><th>PREÇO TOTAL</th></tr></thead><tbody>';
    var porIdx = {};
    d.custoItens.linhas.forEach(function (L) { (porIdx[L.etapaIdx] = porIdx[L.etapaIdx] || []).push(L); });
    d.etapas.forEach(function (E) {
      t += '<tr class="et kn"><td>' + esc(E.codigo) + '</td><td colspan="8">' + esc(E.nome) + '</td></tr>';
      (porIdx[E.idx] || []).forEach(function (L) {
        t += '<tr>' + tdI(esc(L.numero)) + td(esc(L.descricao)) + tdN(fmt(L.MAT, 2)) + tdN(fmt(L.MO, 2)) + tdN(fmt(L.EQ, 2)) + tdN(fmt(L.OUTROS, 2)) + tdN(fmt(L.ct, 2)) + tdN(fmt(L.bdi, 2)) + tdN(fmt(L.pt, 2)) + '</tr>';
      });
    });
    var T = d.custoItens.tot;
    t += '<tr class="tt"><td colspan="2">TOTAL (R$):</td>' + tdN(fmt(T.MAT, 2)) + tdN(fmt(T.MO, 2)) + tdN(fmt(T.EQ, 2)) + tdN(fmt(T.OUTROS, 2)) + tdN(fmt(T.ct, 2)) + tdN(fmt(T.bdi, 2)) + tdN(fmt(T.pt, 2)) + '</tr></tbody></table>';
    var ciN = d.custoItens, nProp = ciN.porProporcao || 0, nDif = (ciN.compDif && ciN.compDif.n) || 0;
    h += t + '<p class="ld-nota">Custo direto de cada item repartido por categoria, na proporção da respectiva composição' +
      (nProp ? '; nos ' + nProp + ' item(ns) sem composição no pacote, na proporção da composição do mesmo código na ' + esc(ciN.fonteProporcao) + (nDif ? ' (' + nDif + ' deles de competência diferente da usada pelo órgão, ' + esc(ciN.compDif.orgao) + ')' : '') : '') +
      '; "Outros" reúne o que não é material, mão de obra nem equipamento (serviços e itens sem composição no pacote). BDI = preço total menos custo direto. As colunas somam o custo direto e o preço total da proposta.</p>';
    return '<section class="ld-sec" data-tipo="corpo" data-titulo="Custos por item">' + h + '</section>';
  }

  function usaTotalOrgao(d, I) {
    return !d.desconto && I.custoIgualOrgao !== false && !!(I.insumos && I.insumos.length) && I.insumos.every(function (x) { return x.ctOrg !== null && x.ctOrg !== undefined; });
  }
  function blocoComposicao(tit, insumos, valor, bdiPct, pu, qtdRot, qtd, nota, usaOrg, contRot) {
    var h = '<div class="ld-it"' + (contRot ? ' data-cont="' + esc(contRot) + '"' : '') + '><div class="ld-itt">' + esc(tit) + '</div>';
    if (!insumos || !insumos.length) {
      h += '<div class="ld-nota">Sem detalhamento na base de referência.</div>';
    } else {
      var ordem = [], seen = {};
      insumos.forEach(function (x) { if (!seen[x.cat]) { seen[x.cat] = []; ordem.push(x.cat); } seen[x.cat].push(x); });
      ordem.forEach(function (c) {
        h += '<table class="ld-t"><colgroup><col style="width:64mm"><col style="width:20mm"><col style="width:12mm"><col style="width:26mm"><col style="width:30mm"><col style="width:34mm"></colgroup>' +
          '<thead><tr><th style="text-align:left">' + esc(CAT_ROT[c]) + '</th><th>FONTE</th><th>UNID</th><th>COEFICIENTE</th><th>CUSTO UNITÁRIO</th><th>CUSTO TOTAL</th></tr></thead><tbody>';
        var sm = 0;
        seen[c].forEach(function (x) {
          var vl = usaOrg ? x.ctOrg : x.ct;
          sm += vl;
          h += '<tr>' + td(esc((x.codigo ? x.codigo + "  " : "") + x.descricao)) + tdC(esc(x.fonte)) + tdC(esc(x.unidade)) + tdN(C8(x.coef)) + tdN(R4(x.cu)) + tdN(R4(vl)) + '</tr>';
        });
        h += '<tr class="gr"><td colspan="5" style="text-align:right">TOTAL ' + esc(CAT_ROT[c]) + ':</td>' + tdN(R(sm)) + '</tr></tbody></table>';
      });
    }
    if (valor != null) {
      h += '<div class="ld-itv">VALOR: <b>' + esc(R(valor)) + '</b></div>' +
        '<div class="ld-itv">VALOR BDI (' + esc(P(bdiPct)) + '): <b>' + esc(R(pu - valor)) + '</b></div>' +
        '<div class="ld-itv">VALOR COM BDI: <b>' + esc(R(pu)) + '</b></div>';
    }
    if (qtd != null) h += '<div class="ld-itv">QUANTIDADE (' + esc(qtdRot) + '): <b>' + esc(fmt(qtd, 2)) + '</b></div>';
    if (nota) h += '<div class="ld-nota">' + esc(nota) + '</div>';
    return h + '</div>';
  }

  function secAnalitico(d) {
    var h = '<div class="ld-tit">Relatório Analítico - Composições de Custos</div>';
    var n = 0;
    d.itens.forEach(function (I) {
      n++;
      /* Sem desconto, a linha imprime o TOTAL QUE O ÓRGÃO IMPRIMIU (ele trunca cada linha), e os totais de categoria somam esses valores. Com desconto
         (ou sem o total do órgão no pacote) imprime coeficiente x unitário. A nota só sai quando os totais IMPRESSOS não fecham com o valor do item
         já na planilha do órgão (Sangão: só o 3.4.1); com desconto não há nota, o valor impresso já não é o do órgão. */
      var usaOrg = usaTotalOrgao(d, I), somaI = 0; I.insumos.forEach(function (x) { somaI += usaOrg ? x.ctOrg : x.ct; });
      /* sem o total do órgão no pacote (pacote antigo), coeficiente x unitário passa do valor por até R$ 0,01 por linha (o órgão trunca): isso não é divergência dele */
      var limNota = usaOrg ? 0.005 : 0.01 * I.insumos.length + 0.005;
      var notaI = (!d.desconto && I.doOrgao && I.custoIgualOrgao !== false && Math.abs(somaI - I.cu) >= limNota) ? "A soma das linhas (" + R(somaI) + ") difere do valor do item (" + R(I.cu) + ") já na planilha do órgão. Vale o valor da planilha." : "";
      h += blocoComposicao(I.numero + ". " + I.codigo + " " + I.descricao + " (" + I.unidade + ")", I.insumos, I.cu, d.bdiPct, I.pu, I.unidade, I.quantidade, notaI, usaOrg, I.numero + ". " + I.codigo);
    });
    return '<section class="ld-sec" data-tipo="corpo" data-titulo="Relatório analítico">' + h + '</section>';
  }

  function secProprias(d) {
    var lst = d.itens.filter(function (I) { return I.propria; });
    /* ⚠ composição PRÓPRIA DO ÓRGÃO (banco "Próprio" da planilha analítica dele) não é "elaborada pela proponente": o texto antigo seria falso. */
    var doOrgao = lst.filter(function (I) { return I.propriaOrgao; }), daProp = lst.filter(function (I) { return !I.propriaOrgao; });
    var h = '<div class="ld-tit">' + (doOrgao.length && !daProp.length ? 'Composições Próprias do Orçamento do Órgão' : 'Composições Próprias') + '</div>';
    if (!lst.length) h += '<p class="ld-sub">Composições elaboradas pela proponente, fora da tabela oficial de referência (preços e origem informados na licitação).</p><p class="ld-p">Nenhuma composição própria nesta proposta.</p>';
    function grupo(arrI, sub) {
      if (!arrI.length) return;
      h += '<p class="ld-sub">' + sub + '</p>';
      arrI.forEach(function (I) { h += blocoComposicao(I.codigo + " " + I.descricao + " (" + I.unidade + ")", I.insumos, I.cu, d.bdiPct, I.pu, null, null, "", usaTotalOrgao(d, I), I.codigo); });
    }
    grupo(doOrgao, 'Composições próprias que integram o orçamento do órgão (planilha analítica do edital), fora das tabelas oficiais de referência. Preços e coeficientes como publicados pelo órgão.');
    grupo(daProp, 'Composições elaboradas pela proponente, fora da tabela oficial de referência (preços e origem informados na licitação).');
    return '<section class="ld-sec" data-tipo="corpo" data-titulo="Composições próprias">' + h + '</section>';
  }

  function secAuxiliares(d) {
    var ref = d.base ? (s(d.base.tabela) + " " + s(d.base.mes) + (d.base.uf ? "/" + d.base.uf : "") + (d.base.desonerado === true ? " (desonerada)" : (d.base.desonerado === false ? " (não desonerada)" : ""))) : d.tabelaRef;
    /* Sem exigência de base e sem nenhum detalhe, a seção NÃO sai (e nunca "Sem detalhamento" em lista). Com exigência (CE 012, p. 13), sai
       sempre: o que a base não tem aparece como "sem detalhamento", para o órgão ver que foi citada. */
    var abertas = d.aux.filter(function (a) { return a.insumos; });
    if (!abertas.length && !d.baseExigida) return '';
    var h = '<div class="ld-tit">Relatório Analítico - Composições Auxiliares</div>';
    var dl = d.desconto, comDesc = abertas.some(function (a) { return a.descontada; });
    var rotInc = dl && dl.incidencia === "MO" ? "de mão de obra" : (dl && dl.incidencia === "EQ" ? "de equipamento" : "de material");
    h += '<p class="ld-sub">Composições auxiliares citadas nas composições dos serviços, abertas conforme a tabela de referência ' + esc(ref || "do projeto") + '. ' +
      (comDesc
        ? 'O desconto da proposta foi aplicado também aqui: cada insumo ' + esc(rotInc) + ' recebe o mesmo fator dos serviços da planilha (' + esc(fmt(dl.fator, 6)) + '), e o custo da auxiliar é o que entra na composição do serviço. As demais parcelas saem como na tabela.'
        : 'Valores da tabela, sem o desconto da proposta (o desconto está nos serviços da planilha).') +
      ' A quantidade é o consumo total no orçamento.</p>';
    if (!d.aux.length) h += '<p class="ld-p">Nenhuma composição auxiliar citada.</p>';
    d.aux.forEach(function (a) {
      var tit = a.codigo + " " + a.descricao + (a.unidade ? " (" + a.unidade + ")" : "");
      var nota = a.descontada ? "Com o desconto da proposta. Custo na tabela de referência: " + R(a.custoTabela) + "." : "";
      if (a.insumos) h += blocoComposicao(tit, a.insumos, a.valor, d.bdiPct, arr(a.valor * (1 + d.bdiPct / 100), 2), a.unidade, a.quantidade, nota, false, a.codigo);
      else if (d.baseExigida) h += '<div class="ld-it"><div class="ld-itt">' + esc(tit) + '</div><div class="ld-nota">Sem detalhamento na base de referência' + (d.tabelaRef ? " (" + esc(d.tabelaRef) + ")" : "") + '. Usada em: ' + esc(a.usadoEm.join(", ")) + '.</div></div>';
    });
    return '<section class="ld-sec" data-tipo="corpo" data-titulo="Composições auxiliares">' + h + '</section>';
  }

  function secQuantitativos(d) {
    var h = '<div class="ld-tit">Detalhamento dos Quantitativos</div>';
    h += '<p class="ld-sub">Quantidades dos serviços conforme memória de cálculo do projeto básico do órgão. ' + (d.consumoNoAnalitico ? 'Os coeficientes de cada insumo estão no relatório analítico.' : 'O consumo de cada insumo é a quantidade do serviço multiplicada pelo coeficiente da composição.') + '</p>';
    var t = '<table class="ld-t ld-split"><colgroup><col style="width:14mm"><col style="width:15mm"><col style="width:82mm"><col style="width:12mm"><col style="width:26mm"><col style="width:26mm"></colgroup>' +
      '<thead><tr><th>ITEM</th><th>CÓDIGO</th><th>DESCRIÇÃO</th><th>UNID</th><th>QUANTIDADE DO SERVIÇO</th><th></th></tr></thead><tbody>';
    d.itens.forEach(function (I) {
      t += '<tr>' + tdI(esc(I.numero)) + td(esc(I.codigo)) + td(esc(I.descricao)) + tdC(esc(I.unidade)) + tdN(fmt(I.quantidade, 2)) + td("") + '</tr>';
    });
    t += '</tbody></table>';
    h += t;
    var q = '<div class="ld-tit" style="font-size:10.5pt;margin-top:5mm">Consumo de insumos por serviço</div>' +
      '<table class="ld-t ld-split"><colgroup><col style="width:14mm"><col style="width:15mm"><col style="width:64mm"><col style="width:12mm"><col style="width:26mm"><col style="width:20mm"><col style="width:26mm"></colgroup>' +
      '<thead><tr><th>ITEM</th><th>CÓDIGO</th><th>DESCRIÇÃO</th><th>UNID</th><th>QUANTIDADE DO SERVIÇO</th><th>COEFICIENTE DO INSUMO</th><th>QUANTIDADE TOTAL</th></tr></thead><tbody>';
    d.quant.forEach(function (g) {
      q += '<tr class="gr kn"><td colspan="7">[ ' + esc(CAT_ROT_Q[g.cat]) + ' ] ' + esc(g.codigo) + ' — ' + esc(g.descricao) + (g.unidade ? ' (' + esc(g.unidade) + ')' : '') + '</td></tr>';
      g.usos.forEach(function (u) {
        q += '<tr>' + tdI(esc(u.numero)) + td(esc(u.codigo)) + td(esc(u.descricao)) + tdC(esc(u.unidade)) + tdN(fmt(u.quantidade, 2)) + tdN(C8(u.coef)) + tdN(C8(u.total)) + '</tr>';
      });
      q += '<tr class="tt"><td colspan="6" style="text-align:right">TOTAL:</td>' + tdN(C8(g.total)) + '</tr>';
    });
    q += '</tbody></table>';
    /* Toda composição veio da planilha analítica do órgão: o consumo por serviço só repetiria, em 60 folhas (Sangão), os coeficientes que o relatório analítico já traz. */
    if (!d.consumoNoAnalitico) h += q;
    return '<section class="ld-sec" data-tipo="corpo" data-titulo="Detalhamento dos quantitativos">' + h + '</section>';
  }

  function secCurva(d) {
    var h = '<div class="ld-tit">Orçamento - Curva ABC de Serviços</div>';
    var t = '<table class="ld-t ld-split"><colgroup><col style="width:15mm"><col style="width:52mm"><col style="width:15mm"><col style="width:10mm"><col style="width:18mm"><col style="width:17mm"><col style="width:23mm"><col style="width:13mm"><col style="width:14mm"><col style="width:8mm"></colgroup>' +
      '<thead><tr><th>CÓDIGO</th><th>DESCRIÇÃO</th><th>FONTE</th><th>UNID.</th><th>QUANTIDADE</th><th>PREÇO UNITÁRIO</th><th>PREÇO TOTAL</th><th>%</th><th>ACUMUL. %</th><th>CL</th></tr></thead><tbody>';
    d.curva.forEach(function (c) {
      t += '<tr>' + td(esc(c.codigo)) + td(esc(c.descricao)) + tdC(esc(c.fonte)) + tdC(esc(c.unidade)) + tdN(fmt(c.quantidade, 2)) + tdN(R(c.pu)) + tdN(R(c.pt)) + tdN(P(c.pct)) + tdN(P(c.acum)) + tdC(c.classe) + '</tr>';
    });
    t += '<tr class="tt"><td colspan="6" style="text-align:right">Subtotal até 100,00%:</td>' + tdN(R(d.tot.comBdi)) + '<td colspan="3"></td></tr>' +
      '<tr class="gr"><td colspan="6" style="text-align:right">Outros:</td>' + tdN(R(0)) + '<td colspan="3"></td></tr>' +
      '<tr class="tt"><td colspan="6" style="text-align:right">Valor total do Orçamento:</td>' + tdN(R(d.valor)) + '<td colspan="3"></td></tr></tbody></table>';
    h += t + '<p class="ld-nota">Classe A: até 50% do valor acumulado; B: de 50% a 80%; C: acima de 80%. Valores com BDI e com o desconto da proposta.</p>';
    return '<section class="ld-sec" data-tipo="corpo" data-titulo="Curva ABC">' + h + '</section>';
  }

  function secCronograma(d) {
    var h = '<div class="ld-tit">Cronograma Físico-Financeiro</div>';
    if (!d.crono) {
      h += '<div class="ld-pend">PENDÊNCIA: cronograma físico-financeiro não informado (ou incompleto) no pacote do órgão.' + (d.cronoSemPrazo ? ' Falta o prazo de execução do edital para elaborá-lo.' : '') + ' Preencher antes de entregar a proposta.</div>';
      return '<section class="ld-sec" data-tipo="corpo" data-titulo="Cronograma">' + h + '</section>';
    }
    var c = d.crono, POR_BLOCO = 6, blocos = [], k;
    for (k = 0; k < c.nMeses; k += POR_BLOCO) blocos.push([k, Math.min(c.nMeses, k + POR_BLOCO)]);
    function cel(m) { return '<td class="n" style="font-size:6.4pt">' + fmt(m.pct, 2) + '<br>' + fmt(m.valor, 2) + '</td>'; }
    blocos.forEach(function (bl, bi) {
      var ultimo = bi === blocos.length - 1, nm2 = bl[1] - bl[0], wMes = ultimo ? 15.5 : 24, i;
      var t = '<table class="ld-t ld-split" style="font-size:6.8pt"><colgroup><col style="width:7mm"><col style="width:' + (ultimo ? 27 : 40) + 'mm"><col style="width:10mm"><col style="width:19mm">';
      for (i = 0; i < nm2; i++) t += '<col style="width:' + wMes + 'mm">';
      if (ultimo) t += '<col style="width:9mm"><col style="width:19mm">';
      t += '</colgroup><thead><tr><th rowspan="2">ITEM</th><th rowspan="2">DESCRIÇÃO</th><th rowspan="2">%</th><th rowspan="2">VALOR (R$)</th>';
      for (i = bl[0] + 1; i <= bl[1]; i++) t += '<th>' + i + 'º MÊS</th>';
      if (ultimo) t += '<th colspan="2">Total parcela</th>';
      t += '</tr><tr>';
      for (i = 0; i < nm2; i++) t += '<th>% / R$</th>';
      if (ultimo) t += '<th>%</th><th>R$</th>';
      t += '</tr></thead><tbody>';
      c.linhas.forEach(function (l) {
        t += '<tr>' + tdC(esc(l.codigo)) + td(esc(l.nome)) + tdN(P(l.pct)) + tdN(R(l.valor));
        l.meses.slice(bl[0], bl[1]).forEach(function (m) { t += cel(m); });
        if (ultimo) t += tdN("100,00") + tdN(fmt(l.valor, 2));
        t += '</tr>';
      });
      t += '<tr class="tt"><td></td><td>TOTAL</td><td></td>' + tdN(R(c.total));
      c.totais.slice(bl[0], bl[1]).forEach(function (m) { t += cel(m); });
      if (ultimo) t += tdN("100,00") + tdN(fmt(c.total, 2));
      t += '</tr><tr class="gr"><td></td><td>Acumulado</td><td></td><td></td>';
      c.totais.slice(bl[0], bl[1]).forEach(function (m) { t += '<td class="n" style="font-size:6.4pt">' + fmt(m.acumPct, 2) + '<br>' + fmt(m.acumValor, 2) + '</td>'; });
      if (ultimo) t += '<td></td><td></td>';
      t += '</tr></tbody></table>';
      h += t + (ultimo ? "" : '<div style="height:4mm"></div>');
    });
    h += '<p class="ld-nota">Em cada mês: percentual da etapa e valor em R$. ' + (c.elaborado ? 'Cronograma elaborado pela proponente. ' + esc(c.criterio) + ' ' : 'Percentuais mensais conforme o cronograma do órgão; ') + 'Valores calculados sobre o total de cada etapa' + (d.desconto ? ' já com o desconto da proposta' : '') + '. A diferença de centavos fica no último mês de cada etapa.</p>';
    return '<section class="ld-sec" data-tipo="corpo" data-titulo="Cronograma">' + h + '</section>';
  }

  function secBdi(d) {
    var h = '<div class="ld-tit">Composição do BDI</div>';
    if (!d.bdi.ok) {
      h += '<div class="ld-pend">PENDÊNCIA: composição do BDI não informada no pacote do órgão. BDI usado na proposta: ' + esc(P(d.bdiPct)) + '.</div>';
      return '<section class="ld-sec" data-tipo="corpo" data-titulo="BDI">' + h + '</section>';
    }
    /* depois de um lance/fechamento que mexeu no BDI, a composição do órgão já não explica o BDI da proposta: imprimir as duas
       coisas lado a lado seria um documento incoerente. Nunca se recalcula os grupos sozinho. */
    if (d.bdi.incoerente) {
      h += '<div class="ld-pend">PENDÊNCIA: ' + esc(d.bdi.msgIncoerente) + ' BDI usado na proposta: ' + esc(P(d.bdiPct)) + '.</div>';
      return '<section class="ld-sec" data-tipo="corpo" data-titulo="BDI">' + h + '</section>';
    }
    var t = '<table class="ld-t" style="width:120mm;margin:0 auto"><colgroup><col style="width:22mm"><col style="width:74mm"><col style="width:24mm"></colgroup><thead><tr><th>COD</th><th>DESCRIÇÃO</th><th>%</th></tr></thead><tbody>';
    d.bdi.grupos.forEach(function (g) {
      t += '<tr class="et"><td colspan="3">' + esc(g.nome) + '</td></tr>';
      g.itens.forEach(function (i) { t += '<tr>' + td(esc(i.sigla)) + td(esc(i.descricao)) + tdN(P(i.pct)) + '</tr>'; });
      t += '<tr class="gr"><td></td><td>TOTAL</td>' + tdN(P(g.totalLido != null ? g.totalLido : g.soma)) + '</tr>';
    });
    t += '<tr class="tt"><td colspan="2">BDI</td>' + tdN(P(d.bdiPct)) + '</tr></tbody></table>';
    h += t + '<p class="ld-ext" style="font-style:normal">BDI = [ (1 + AC + S + R + G) × (1 + DF) × (1 + L) / (1 − I) ] − 1</p>';
    return '<section class="ld-sec" data-tipo="corpo" data-titulo="BDI">' + h + '</section>';
  }

  function secEncargos(d) {
    var h = '<div class="ld-tit">Tabela de Encargos Sociais</div>';
    if (!d.enc.ok) {
      h += '<div class="ld-pend">PENDÊNCIA: ' + (d.enc.pendTexto ? esc(d.enc.pendTexto) : 'encargos não informados no pacote do órgão. Nenhum valor foi estimado.') + '</div>';
      return '<section class="ld-sec" data-tipo="corpo" data-titulo="Encargos sociais">' + h + '</section>';
    }
    var t = '<table class="ld-t ld-split" style="width:150mm;margin:0 auto"><colgroup><col style="width:14mm"><col style="width:96mm"><col style="width:20mm"><col style="width:20mm"></colgroup><thead><tr><th>COD</th><th>DESCRIÇÃO</th><th>HORISTA %</th><th>MENSALISTA %</th></tr></thead><tbody>';
    d.enc.grupos.forEach(function (g) {
      t += '<tr class="et kn"><td colspan="4">GRUPO ' + g.grupo + '</td></tr>';
      g.linhas.forEach(function (l) {
        var pendC = '<span class="ld-p0">PENDÊNCIA</span>';
        t += '<tr' + (l.diferenca ? ' style="color:#c00000"' : '') + '>' + td(esc(l.codigo)) + td(esc(l.descricao)) +
          tdN(l.horistaNL ? pendC : P(l.horista)) + tdN(l.mensalistaNI ? 'Não incide' : (l.mensalistaNL ? pendC : P(l.mensalista))) + '</tr>';
      });
      t += '<tr class="gr"><td></td><td>TOTAL GRUPO ' + g.grupo + '</td>' + tdN(P(g.horista)) + tdN(P(g.mensalista)) + '</tr>';
    });
    t += '</tbody></table>';
    h += t + '<p class="ld-ext" style="font-style:normal"><b>A + B + C + D = ' + esc(P(d.enc.total.horista)) + ' (horista)  /  ' + esc(P(d.enc.total.mensalista)) + ' (mensalista)</b></p>';
    h += '<p class="ld-nota">' + notaEncargos(d.enc) + '</p>';
    return '<section class="ld-sec" data-tipo="corpo" data-titulo="Encargos sociais">' + h + '</section>';
  }

  /* Nota da seção de encargos. NUNCA diz "conforme a tabela do órgão" quando a tabela não veio do órgão: tabela SINAPI da
     base ou do CertamePRO sai com UF, regime, vigência e fonte, e diz se os totais conferem com os publicados pelo órgão. */
  function notaEncargos(enc) {
    var regime = enc.regimeSabido ? (enc.desonerado ? "desonerado" : "não desonerado") : null;
    var o = enc.origem, t = enc.tabelaFonte, to = enc.totaisOrgao, txt;
    var qual = o ? { uf: o.uf, vig: o.competencia, fonte: o.fonte, regime: o.regime === "desonerado" ? "desonerado" : "não desonerado" }
      : (t ? { uf: t.uf, vig: t.vigencia, fonte: t.fonte, regime: regime } : null);
    if (!qual) return (regime ? 'Regime ' + regime + ', conforme a tabela do órgão.' : 'Regime de desoneração não confirmado, conforme a tabela do órgão.');
    txt = 'Tabela SINAPI' + (qual.uf ? ' – ' + esc(qual.uf) : '') + ', ' + (qual.regime || 'regime não confirmado') + (qual.vig ? ', vigência ' + esc(vigAAAAMM(qual.vig)) : '') + (qual.fonte ? ' (' + esc(qual.fonte) + ')' : '');
    if (to && to.diverge) txt += '; ATENÇÃO: os totais publicados pelo órgão (horista ' + esc(P(to.horista)) + ', mensalista ' + esc(P(to.mensalista)) + ') diferem desta tabela';
    else if (to) txt += '; os totais conferem com os publicados pelo órgão: horista ' + esc(P(to.horista)) + ', mensalista ' + esc(P(to.mensalista));
    else txt += '; totais da tabela: horista ' + esc(P(enc.total.horista)) + ', mensalista ' + esc(P(enc.total.mensalista));
    return txt + '.';
  }

  /* data URL de imagem que pode ir dentro de url("...") do CSS sem escapar nada; qualquer outra coisa volta vazia */
  function urlCss(v) {
    v = s(v);
    return /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(v) ? v : "";
  }
  /* A imagem do timbrado é grande (até ~560 mil caracteres). Repetida em <img> em cada página, 200 páginas dariam 100 MB de HTML.
     Por isso vai uma vez só, numa regra de CSS compartilhada (background); as páginas só trazem <div class="ld-logo">. Imagem
     que não é data URL simples volta ao <img> de antes (caso raro: logo da conta por endereço). */
  function cssTimbrado(d) {
    var e = d.emp, a = urlCss(e.timbradoTopo), b = urlCss(e.timbradoFundo), c = "";
    if (a) c += '.ld-bg-topo{background-image:url("' + a + '")}';
    if (b) c += '.ld-bg-fundo{background-image:url("' + b + '")}';
    if (modoPagina(d)) c += '.ld-bg-pagina{background-image:url("' + urlCss(e.timbradoPagina) + '")}';
    return c;
  }
  /* papel timbrado de página inteira? (imagem em data URL simples + margens válidas) */
  function modoPagina(d) {
    var e = d && d.emp, m = e && e.timbradoMargens;
    return !!(e && urlCss(e.timbradoPagina) && m && isFinite(Number(m.topo_cm)) && isFinite(Number(m.base_cm)));
  }

  function tplTimbrado(d) {
    var e = d.emp, cb = d.cab;
    var logo = !e.timbradoTopo ? '<span class="ld-p0">[PREENCHER: timbrado (logo)]</span>'
      : (urlCss(e.timbradoTopo) ? '<div class="ld-logo ld-logo-bg ld-bg-topo"></div>' : '<img class="ld-logo" src="' + esc(e.timbradoTopo) + '" alt="">');
    var wm = !e.timbradoFundo ? '' : (urlCss(e.timbradoFundo) ? '<div class="ld-wm ld-wm-bg ld-bg-fundo"></div>' : '<img class="ld-wm" src="' + esc(e.timbradoFundo) + '" alt="">');
    var id = '<div class="ld-id"><b>OBRA:</b> ' + campo(cb.objeto, "objeto") + '<br><b>REF:</b> ' + esc(cb.edital) + '.<br><b>CIDADE:</b> ' + esc(cb.cidade) + '<br><b>DATA:</b> ' + esc(cb.data) + '</div>';
    var ass = '<div><b>' + campo(e.nome, "razão social") + '</b>' + campo(e.socioNome, "nome do sócio administrador") + '<br>' + campo(e.socioCargo, "cargo do sócio") + '</div>' +
      '<div><b>' + campo(e.rtNome, "nome do responsável técnico") + '</b>Responsável Técnico<br>' + rtRegistro(e) + '</div>';
    var rod = '<div>' + campo(e.nome, "razão social") + ' CNPJ ' + campo(e.cnpj, "CNPJ") + '<br>' + campo(e.endereco, "endereço") + '<br>Fone: ' + campo(e.telefone, "telefone") + ' / E-mail: ' + campo(e.email, "e-mail") + '</div><div class="pag">Página: {{pag}}</div>';
    if (modoPagina(d)) {
      /* razão social, endereço e fone já estão impressos no papel: o rodapé só numera */
      return '<template class="ld-tpl" data-n="tpbg"><div class="ld-tpbg ld-bg-pagina"></div></template>' +
        '<template class="ld-tpl" data-n="hd-std"><div class="ld-hd">' + id + '</div></template>' +
        '<template class="ld-tpl" data-n="ass"><div class="ld-ass">' + ass + '</div></template>' +
        '<template class="ld-tpl" data-n="rod"><div class="ld-rod"><div class="pag">Página: {{pag}}</div></div></template>';
    }
    return '<template class="ld-tpl" data-n="hd-big"><div class="ld-hd big">' + logo + '</div></template>' +
      '<template class="ld-tpl" data-n="hd-std"><div class="ld-hd">' + id + logo + '</div></template>' +
      '<template class="ld-tpl" data-n="ass"><div class="ld-ass">' + ass + '</div></template>' +
      '<template class="ld-tpl" data-n="rod"><div class="ld-rod">' + rod + '</div></template>' +
      '<template class="ld-tpl" data-n="wm">' + wm + '</template>';
  }

  /* html(dados): raiz com as seções em ordem + os modelos de cabeçalho/rodapé. Ainda NÃO paginado. */
  function html(d) {
    var corpo = (d.cartaDoEdital ? "" : secCarta(d)) + secResumo(d) + secSintetico(d) + secCustosItem(d) + secAnalitico(d) + secProprias(d) + secAuxiliares(d) +
      secQuantitativos(d) + secCurva(d) + secCronograma(d) + secBdi(d) + secEncargos(d);
    var tpAttr = '';
    if (modoPagina(d)) {
      var mmDe = function (cm) { return String(+(Number(cm) * 10).toFixed(2)); };   // 3,6 cm -> "36" (e não 36.00000000000001)
      var mg = d.emp.timbradoMargens, lv = (mg.livre_ate_cm === null || mg.livre_ate_cm === undefined || mg.livre_ate_cm === "") ? "" : mmDe(mg.livre_ate_cm);
      tpAttr = ' data-tp-top="' + mmDe(mg.topo_cm) + '" data-tp-base="' + mmDe(mg.base_cm) + '" data-tp-livre="' + lv + '"';
    }
    return '<div class="ld-raiz rel-doc' + (tpAttr ? ' ld-tp' : '') + '"' + tpAttr + '><style>' + CSS + cssTimbrado(d) + '</style><div class="ld-fonte">' + corpo + '</div>' + tplTimbrado(d) + '<div class="ld-paginas"></div></div>';
  }

  /* gerar: tudo de uma vez → { ok, erro, html, dados, pendencias } */
  function gerar(orc, empresa, opcoes) {
    var r = montar(orc, empresa, opcoes);
    if (!r.ok) return r;
    return { ok: true, html: html(r.dados), dados: r.dados, pendencias: r.pendencias };
  }

  /* =====================================================================
   * PAGINAÇÃO (única parte que usa o DOM)
   * Mede a página de verdade: tabela que não cabe é partida em linhas (o
   * cabeçalho repete), bloco que não cabe vai inteiro para a página seguinte, e
   * título nunca fica sozinho no pé da página. Cada seção abre em página nova.
   * ===================================================================== */
  function paginar(raiz) {
    var doc = raiz.ownerDocument;
    var fonte = raiz.querySelector(".ld-fonte"), saida = raiz.querySelector(".ld-paginas");
    if (!fonte || !saida) return 0;
    var tpl = {};
    [].slice.call(raiz.querySelectorAll("template.ld-tpl")).forEach(function (t) { tpl[t.getAttribute("data-n")] = t.innerHTML; });
    var n = 0;
    var tp = raiz.classList.contains("ld-tp");

    /* CABEÇALHO MEDIDO (vale para todos os modelos): uma página de prova mede a altura real da identificação da obra e grava
       --ld-hd-top / --ld-hd-h / --ld-corpo-top (e, no papel timbrado, --ld-id-w) na raiz. Fonte cai de 7,4 para 7 pt se o objeto é longo. */
    function medirCabecalho() {
      var mm = function (px) { return px * 25.4 / 96; };
      var topoPapel = tp ? Number(raiz.getAttribute("data-tp-top")) || 36 : 0;
      var basePapel = tp ? Number(raiz.getAttribute("data-tp-base")) || 27 : 0;
      var livre = tp ? Number(raiz.getAttribute("data-tp-livre")) : 0;
      var temLivre = tp && isFinite(livre) && livre > 0 && raiz.getAttribute("data-tp-livre") !== "";
      var st = raiz.style;
      if (tp) { st.setProperty("--tp-top", topoPapel + "mm"); st.setProperty("--tp-base", basePapel + "mm"); }
      var hdTop = tp ? (temLivre ? 9 : topoPapel + 1) : 8;
      st.setProperty("--ld-hd-top", hdTop + "mm");
      if (tp) st.setProperty("--ld-id-w", (temLivre ? Math.max(40, livre - 12 - 4) : 186) + "mm");
      var pg = doc.createElement("div");
      pg.className = "ld-pg"; pg.setAttribute("data-t", "corpo"); pg.innerHTML = tpl["hd-std"] || "";
      saida.appendChild(pg);
      try {
        var id = pg.querySelector(".ld-id");
        if (!id) return;
        var h = mm(id.getBoundingClientRect().height);
        var lim = tp ? 24 : 26;
        if (h > lim) { raiz.classList.add("ld-id-peq"); h = mm(id.getBoundingClientRect().height); }
        var hdH = tp ? h : Math.max(26, h);
        st.setProperty("--ld-hd-h", Math.ceil(hdH * 10) / 10 + "mm");
        var base = tp ? (temLivre ? Math.max(topoPapel + 2, hdTop + hdH + 3) : hdTop + hdH + 3) : Math.max(36, hdTop + hdH + 2);
        st.setProperty("--ld-corpo-top", Math.ceil(base * 10) / 10 + "mm");
      } finally { saida.removeChild(pg); }
    }
    try { medirCabecalho(); } catch (eMed) {}

    function nova(tipo, idx) {
      n++;
      var pg = doc.createElement("div");
      var t = tipo === "carta" ? (idx === 0 ? "cartaA" : "cartaB") : "corpo";
      pg.className = "ld-pg"; pg.setAttribute("data-t", t);
      var cab = (t === "cartaA") ? (tp ? "" : tpl["hd-big"]) : (t === "cartaB" ? "" : tpl["hd-std"]);
      pg.innerHTML = (tp ? (tpl.tpbg || "") : (tpl.wm || "")) + (cab || "") + '<div class="ld-corpo"></div>' + (tpl.ass || "") + (tpl.rod || "").replace("{{pag}}", String(n));
      saida.appendChild(pg);
      return { pg: pg, corpo: pg.querySelector(".ld-corpo") };
    }
    function cabe(corpo) { return corpo.scrollHeight <= corpo.clientHeight + 1; }
    function vazia(t) {
      var c = t.cloneNode(false);
      var cg = t.querySelector("colgroup"), th = t.tHead;
      if (cg) c.appendChild(cg.cloneNode(true));
      if (th) c.appendChild(th.cloneNode(true));
      c.appendChild(doc.createElement("tbody"));
      return c;
    }

    var erros = [];
    [].slice.call(fonte.children).forEach(function (sec) {
      var tipo = sec.getAttribute("data-tipo"), idx = 0, P1 = nova(tipo, idx++);
      var corpo = P1.corpo;
      var contRot = "";   // item cuja composição continua na folha nova ("<número> <código> (continuação)")
      function proxima() { var q = nova(tipo, idx++); corpo = q.corpo; return q; }
      /* folha nova no meio de uma composição: repete o item no alto (a menos que o próprio título tenha vindo junto) */
      function novaFolha(junto) {
        proxima();
        if (contRot && !junto.some(function (x) { return x.getAttribute && x.getAttribute("data-itt") === "1"; })) {
          var cEl = doc.createElement("div");
          cEl.className = "ld-itt"; cEl.setAttribute("data-kn", "1");
          cEl.textContent = contRot + " (continuação)";
          corpo.appendChild(cEl);
        }
        junto.forEach(function (x) { corpo.appendChild(x); });
      }
      /* leva junto os blocos "kn" (título) que ficaram no fim da página */
      function carregaKn() {
        var acc = [];
        while (corpo.lastElementChild && corpo.lastElementChild.getAttribute("data-kn") === "1" && corpo.children.length > 1) {
          acc.unshift(corpo.lastElementChild); corpo.removeChild(corpo.lastElementChild);
        }
        return acc;
      }
      function colocaTabela(b) {
        var rows = [].slice.call(b.tBodies[0].rows), cur = vazia(b), tb = cur.tBodies[0];
        corpo.appendChild(cur);
        rows.forEach(function (r) {
          tb.appendChild(r);
          if (cabe(corpo)) return;
          var mover = [r];
          tb.removeChild(r);
          while (tb.rows.length && tb.rows[tb.rows.length - 1].classList.contains("kn")) {
            mover.unshift(tb.rows[tb.rows.length - 1]); tb.removeChild(tb.rows[tb.rows.length - 1]);
          }
          var tabVazia = !tb.rows.length, junto = [];
          if (tabVazia) { corpo.removeChild(cur); junto = carregaKn(); }
          if (tabVazia && !corpo.children.length && !junto.length) {
            /* já era uma página nova e a linha sozinha não cabe: nada melhor a fazer, mas NUNCA em silêncio (a linha seria cortada) */
            corpo.appendChild(cur); mover.forEach(function (x) { tb.appendChild(x); });
            erros.push("uma linha de tabela (" + String(r.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60) + ") é mais alta que a folha");
            return;
          }
          novaFolha(junto);
          cur = vazia(b); tb = cur.tBodies[0]; corpo.appendChild(cur);
          mover.forEach(function (x) { tb.appendChild(x); });
        });
        if (b.parentNode === sec) sec.removeChild(b);
      }
      /* ⚠ BLOCO ALTO NUNCA É CORTADO (revisão de 09/11/2026: 4 composições saíam sem linhas e sem o VALOR COM BDI). Bloco `.ld-it` que não cabe
         nem numa folha vazia é desmontado: o título fica na folha, cada tabela de categoria vira tabela partida por linha (cabeçalho repetido) e
         os totais (VALOR, BDI, VALOR COM BDI) vão como blocos próprios, nunca perdidos. */
      function colocaBloco(b) {
        if (b.classList.contains("ld-tit") || b.classList.contains("ld-sub")) b.setAttribute("data-kn", "1");
        if (b.tagName === "TABLE" && b.classList.contains("ld-split")) { colocaTabela(b); return; }
        corpo.appendChild(b);
        if (cabe(corpo)) return;
        if (corpo.children.length > 1) {
          corpo.removeChild(b);
          var junto = carregaKn();
          novaFolha(junto);
          corpo.appendChild(b);
          if (cabe(corpo)) return;
        }
        if (b.classList.contains("ld-it") && b.children.length > 1) {
          corpo.removeChild(b);
          var filhos = [].slice.call(b.children);
          contRot = b.getAttribute("data-cont") || String((b.firstElementChild && b.firstElementChild.textContent) || "").split(/\s+/).slice(0, 2).join(" ");
          /* VALOR, BDI, VALOR COM BDI e QUANTIDADE do mesmo bloco não se separam entre folhas: viram um bloco só */
          var itvs = filhos.filter(function (c) { return c.classList && c.classList.contains("ld-itv"); });
          if (itvs.length > 1) {
            var grp = doc.createElement("div"); grp.className = "ld-itvs";
            b.insertBefore(grp, itvs[0]);
            itvs.forEach(function (x) { grp.appendChild(x); });
            filhos = [].slice.call(b.children);
          }
          filhos.forEach(function (c, i) {
            if (c.tagName === "TABLE" && c.classList.contains("ld-t")) {
              c.classList.add("ld-split");
              /* a última linha de dados fica junto da linha de TOTAL (que não pode ficar sozinha no alto da folha seguinte) */
              var rr = c.tBodies[0] ? c.tBodies[0].rows : [];
              if (rr.length > 1) rr[rr.length - 2].classList.add("kn");
            }
            if (i === 0) { c.setAttribute("data-kn", "1"); c.setAttribute("data-itt", "1"); }
            colocaBloco(c);
          });
          contRot = "";
          return;
        }
        erros.push("um bloco (" + String(b.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60) + ") é mais alto que a folha");
      }
      [].slice.call(sec.children).forEach(colocaBloco);
    });
    raiz.removeChild(fonte);
    [].slice.call(raiz.querySelectorAll("template.ld-tpl")).forEach(function (t) { t.parentNode.removeChild(t); });
    /* NUNCA corpo cortado: depois de paginar, toda `.ld-corpo` tem de caber. Se alguma não couber, o gerador acusa (a página e o que sobrou),
       em vez de entregar um documento ao órgão com linha ou total faltando. */
    [].slice.call(saida.querySelectorAll(".ld-corpo")).forEach(function (c, k) {
      if (c.scrollHeight > c.clientHeight + 1) erros.push("a folha " + (k + 1) + " tem conteúdo que não cabe (" + (c.scrollHeight - c.clientHeight) + " px a mais)");
    });
    if (erros.length) throw new Error("O documento sairia cortado: " + erros.slice(0, 3).join("; ") + (erros.length > 3 ? " e mais " + (erros.length - 3) : "") + ".");
    return n;
  }

  /* página HTML completa (navegador sem tela / janela própria) */
  function documento(htmlRaiz, titulo) {
    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + esc(titulo || "Proposta") + '</title>' +
      '<style>html,body{margin:0;padding:0;background:#fff}@media screen{body{background:#5b6b7b;padding:10px 0}}</style></head><body>' + htmlRaiz + '</body></html>';
  }

  var LicitacaoDocs = {
    montar: montar, html: html, gerar: gerar, pendencias: pendencias, paginar: paginar, documento: documento,
    elaborarCronograma: elaborarCronograma, empresaDoCertame: empresaDoCertame, temLicitante: temLicitante, conferirEdital: conferirEdital,
    baseDe: baseDe, parseEncargos: parseEncargos, parseBdi: parseBdi, conferirValores: conferirValores,
    css: CSS,
    _util: { fmt: fmt, R: R, norm: norm, parecido: parecido, arr: arr, prazoExt: prazoExt, diasDoTexto: diasDoTexto, objetoDaCarta: objetoDaCarta, dataExtensoUpper: dataExtensoUpper }
  };
  global.LicitacaoDocs = LicitacaoDocs;
  if (typeof module !== "undefined" && module.exports) module.exports = LicitacaoDocs;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
