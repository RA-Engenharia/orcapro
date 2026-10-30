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
    if (!m) return t;
    var n = parseInt(m[1], 10), u = U(), ext = u && u.valorExtenso ? u.valorExtenso(n).replace(/ (reais|real)$/, "") : "";
    if (!ext) return t;
    var un = m[2].toLowerCase(); if (un === "mes") un = "mês";
    return (n < 10 ? "0" + n : String(n)) + " (" + ext + ") " + un + m[3];
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
      blo.linhas.push({ codigo: cod, descricao: desc, horista: h, mensalista: m });
    }
    if (blo.linhas.length || blo.nTot) blocos.push(blo);
    if (!blocos.length) return { ok: false, motivo: "encargos não informados" };

    /* escolha do bloco: o do regime do orçamento. Na tabela DESONERADA o INSS patronal (A1) é zero. */
    var regimeLido = leitura && leitura.tabelas ? leitura.tabelas.desonerado : null;
    var regimeSabido = regimeLido === true || regimeLido === false;
    var desonerado = regimeLido === true;
    function inss(b) {
      for (var k = 0; k < b.linhas.length; k++) if (b.linhas[k].codigo === "A1") return b.linhas[k].horista;
      return null;
    }
    var esc = null, k2;
    for (k2 = 0; regimeSabido && k2 < blocos.length; k2++) {
      var v = inss(blocos[k2]);
      if (v == null) continue;
      if (desonerado ? v === 0 : v > 0) { esc = blocos[k2]; break; }
    }
    var avisos = [];
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
      out.push({ codigo: cod, grupo: cod ? cod.charAt(0) : "", descricao: nome, horista: l.horista, mensalista: l.mensalista });
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
    return { ok: true, grupos: grupos, total: tot || somaGrupos, avisos: avisos, desonerado: desonerado, regimeSabido: regimeSabido && !!esc };
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
    return { ok: true, grupos: grupos, impresso: impresso, conta: b.conta != null ? nm(b.conta) : null, avisos: avisos };
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
      faltando: faltando
    };
    return r;
  }

  function cidadeDe(orc, lic, opcoes) {
    var c = s(opcoes && opcoes.cidade) || s(orc && orc.obra && orc.obra.local) || "";
    return c.replace(/\s*\/\s*/g, "-").toUpperCase();
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
    var pend = { preencher: [], conferencia: [], dados: [] };

    var valor = arr(Lic.totalProposta(orc), 2);
    var calc = Orc.calcular(orc);
    var linhas = (calc.linhas || []).filter(function (x) { return !x.opcional; });
    if (!linhas.length) return { ok: false, erro: "O orçamento não tem itens." };
    var bdiPct = orc.bdi ? nm(orc.bdi.percentual) : 0;

    /* ---- base de referência: só vale se for a MESMA tabela do projeto ---- */
    var base = opcoes.base || null;
    var tab = leitura && leitura.tabelas ? leitura.tabelas : {};
    var tabelaRef = s(tab.seinfra) ? ("SEINFRA " + s(tab.seinfra)) : (s(tab.sinapi) ? ("SINAPI " + s(tab.sinapi)) : "");
    var baseOk = null;
    if (base) {
      if (s(tab.seinfra) && norm(base.mes) !== norm(tab.seinfra)) {
        pend.dados.push("A base de referência carregada é a tabela " + base.mes + ", e o projeto usa a SEINFRA " + s(tab.seinfra) + ": descrições e composições auxiliares da base NÃO foram usadas.");
      } else baseOk = base;
    } else {
      pend.dados.push("Base de referência (composições auxiliares) não carregada: as composições auxiliares saem sem detalhamento e as descrições ficam como lidas.");
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
      var fonteRaw = s(it.baseFonte || it.origem || "");
      var ehSeinfra = /SEINFRA/i.test(fonteRaw);
      var propria = !!(it.composicaoOrgao && it.composicaoOrgao.propria) || /PROPRI/i.test(fonteRaw);
      var ins = (Array.isArray(it.insumos) ? it.insumos : []).map(function (x) {
        var cod = s(x.codigo), cat = catDe(x), eh = String(x.tipo || "").toUpperCase() !== "COMPOSICAO";
        var d = (/SEINFRA/i.test(s(x.fonte)) || ehSeinfra) ? descPelaBase(cod, x.descricao, eh) : s(x.descricao);
        var un = s(x.unidade);
        if (!un && baseOk) { var rg = eh ? baseOk.insumo(cod) : (baseOk.obter(cod) || baseOk.insumo(cod)); if (rg && parecido(d, rg.descricao) >= LIM_PARECIDO) un = s(rg.unidade); }
        var co = nm(x.coeficiente), cu = nm(x.custoUnitario);
        return { codigo: cod, descricao: d, unidade: un, fonte: s(x.fonte), coef: co, cu: cu, ct: co * cu, cat: cat, composicao: !eh };
      });
      var cats = { MO: 0, MAT: 0, EQ: 0, OUTROS: 0 };
      if (ins.length) {
        ins.forEach(function (x) { cats[x.cat] += Ln.quantidade * x.ct; });
        /* O custo unitário do item vem arredondado (1,38) e a composição soma 1,3845: em 25 mil m² isso é dinheiro.
           As categorias repartem o custo da PLANILHA, na proporção da composição, para o resumo fechar com ela. */
        var somaI = cats.MO + cats.MAT + cats.EQ + cats.OUTROS;
        if (somaI > 0) CATS.forEach(function (c) { cats[c] = cats[c] * Ln.custoTotal / somaI; });
      } else {
        /* sem composição: a parcela do próprio item (MO/MAT/EQ), se ele tiver; senão tudo em OUTROS, marcado */
        var rep = Orc.repartirCusto ? Orc.repartirCusto(it, Ln.custoTotal) : null;
        if (rep && (nm(rep.mo) + nm(rep.mat) + nm(rep.eq)) > 0) { cats.MO += nm(rep.mo); cats.MAT += nm(rep.mat); cats.EQ += nm(rep.eq); }
        else { cats.OUTROS += Ln.custoTotal; pend.dados.push("Item " + Ln.numero + " (" + Ln.codigo + ") sem composição analítica: custo no resumo foi para OUTROS."); }
      }
      var linhaI = {
        numero: Ln.numero, etapaIdx: Ln.etapaIdx, codigo: s(Ln.codigo),
        descricao: ehSeinfra ? descPelaBase(Ln.codigo, Ln.descricao, false) : s(Ln.descricao),
        descricaoLida: s(Ln.descricao),
        unidade: s(Ln.unidade), fonte: propria ? "PRÓPRIA" : fonteRaw.toUpperCase(),
        quantidade: Ln.quantidade, cu: Ln.custoUnitario, pu: Ln.precoUnit, ct: Ln.custoTotal, pt: Ln.precoTotal,
        insumos: ins, cats: cats, propria: propria, id: Ln.itemId
      };
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
    tot.semBdi = arr(tot.semBdi, 2); tot.comBdi = arr(tot.comBdi, 2);
    tot.cat = { MO: 0, MAT: 0, EQ: 0, OUTROS: 0 };
    porEtapa.forEach(function (E) {
      E.semBdi = arr(E.semBdi, 2); E.comBdi = arr(E.comBdi, 2);
      /* centavo do arredondamento vai para a maior categoria da etapa: a linha fecha com o custo dela */
      var maior = "MO", soma = 0;
      CATS.forEach(function (c) { E.cat[c] = arr(E.cat[c], 2); soma += E.cat[c]; if (E.cat[c] > E.cat[maior]) maior = c; });
      E.cat[maior] = arr(E.cat[maior] + (E.semBdi - soma), 2);
      CATS.forEach(function (c) { tot.cat[c] = arr(tot.cat[c] + E.cat[c], 2); });
    });
    var somaCats = arr(tot.cat.MO + tot.cat.MAT + tot.cat.EQ + tot.cat.OUTROS, 2);
    var difCats = arr(tot.semBdi - somaCats, 2);

    if (descSemBase.length) pend.dados.push("Descrição lida difere da base e foi mantida como lida: " + descSemBase.slice(0, 6).join("; ") + (descSemBase.length > 6 ? " e mais " + (descSemBase.length - 6) : "") + ".");

    /* ---- cabeçalho ---- */
    var emp = empresaResolvida(empresa);
    var tipoLic = s(lic.tipo), proc = s(lic.processo) || s(lic.certame);
    var edital = (opcoes.edital ? s(opcoes.edital) : (tipoLic ? tipoLic.toUpperCase() : "LICITAÇÃO") + (proc ? " Nº " + proc : ""));
    var objeto = s(opcoes.objeto) || s(orc.obra && orc.obra.nome) || s(orc.nome);
    var cab = {
      edital: edital, objeto: objeto, cidade: cidadeDe(orc, lic, opcoes), orgao: s(lic.orgao && lic.orgao.nome),
      data: dataExtensoUpper(opcoes.data), prazo: prazoExt(s(opcoes.prazo) || s(orc.comercial && orc.comercial.prazoExecucao)),
      validade: s(opcoes.validade) || validadeExt(orc.comercial && orc.comercial.validadeDias),
      prazoInicio: s(opcoes.prazoInicio) || "5 (CINCO)"
    };
    if (!cab.prazo) pend.preencher.push("prazo de execução (comercial do orçamento)");
    if (!cab.validade) pend.preencher.push("validade da proposta (comercial do orçamento)");
    emp.faltando.forEach(function (f) { pend.preencher.push(f); });

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
    var crono = null, cr = leitura && leitura.cronograma;
    if (cr && Array.isArray(cr.etapas) && cr.etapas.length) {
      var nMeses = 0, linhasC = [], okC = true;
      cr.etapas.forEach(function (e) { Object.keys(e.meses || {}).forEach(function (k) { nMeses = Math.max(nMeses, parseInt(k, 10) || 0); }); });
      nMeses = Math.max(nMeses, parseInt(cr.meses, 10) || 0);
      porEtapa.forEach(function (E) {
        var ce = null;
        cr.etapas.forEach(function (c) { if (s(c.etapa) === E.codigo || (!E.codigo && Number(c.etapa) === E.idx + 1)) ce = c; });
        if (!ce) { okC = false; pend.dados.push("Cronograma: sem percentuais lidos para a etapa " + E.codigo + " (" + E.nome + ")."); return; }
        if (s(ce.descricao) && parecido(ce.descricao, E.nome) < 0.5) pend.dados.push("Cronograma: a linha lida \"" + ce.descricao + "\" não parece ser a etapa " + E.codigo + " (" + E.nome + "). Conferir os percentuais.");
        var ms = [], soma = 0, ultimo = -1, m;
        for (m = 1; m <= nMeses; m++) {
          var pc = ce.meses && ce.meses[String(m)] ? nm(ce.meses[String(m)].pct) : 0;
          ms.push({ pct: pc, valor: 0 }); soma += pc;
          if (pc > 0) ultimo = m - 1;
        }
        if (Math.abs(soma - 100) > 0.1) { okC = false; pend.dados.push("Cronograma: os percentuais da etapa " + E.codigo + " somam " + fmt(soma, 2) + "%, não 100%."); }
        var acm = 0;
        ms.forEach(function (x, ix) {
          if (ix === ultimo) x.valor = arr(E.comBdi - acm, 2);
          else { x.valor = arr(E.comBdi * x.pct / 100, 2); acm = arr(acm + x.valor, 2); }
        });
        linhasC.push({ codigo: E.codigo, nome: E.nome, valor: E.comBdi, pct: tot.comBdi > 0 ? E.comBdi / tot.comBdi * 100 : 0, meses: ms });
      });
      if (okC && linhasC.length) {
        var tm = [], ac2 = 0, ix2;
        for (ix2 = 0; ix2 < nMeses; ix2++) {
          var sv = 0; linhasC.forEach(function (l) { sv += l.meses[ix2].valor; });
          sv = arr(sv, 2); ac2 = arr(ac2 + sv, 2);
          tm.push({ valor: sv, pct: tot.comBdi > 0 ? sv / tot.comBdi * 100 : 0, acumValor: ac2, acumPct: tot.comBdi > 0 ? ac2 / tot.comBdi * 100 : 0 });
        }
        crono = { nMeses: nMeses, linhas: linhasC, totais: tm, total: arr(ac2, 2) };
      }
    } else {
      pend.dados.push("Cronograma físico-financeiro não informado no pacote: a seção sai como PENDÊNCIA.");
    }

    var bdi = parseBdi(leitura, bdiPct);
    if (!bdi.ok) pend.dados.push("BDI: " + bdi.motivo + ".");
    else bdi.avisos.forEach(function (a) { pend.dados.push("BDI: " + a + "."); });
    var enc = parseEncargos(leitura);
    if (!enc.ok) pend.dados.push("Encargos sociais: " + enc.motivo + ".");
    else enc.avisos.forEach(function (a) { pend.dados.push("Encargos: " + a + "."); });

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
    if (auxSem.length) pend.dados.push(auxSem.length + " composição(ões) auxiliar(es) sem detalhamento na base: " + auxSem.map(function (a) { return a.codigo; }).join(", ") + ".");
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
      etapas: porEtapa, itens: itens, tot: tot, somaCats: somaCats, difCats: difCats,
      aux: aux, quant: qLista, curva: curva, crono: crono, bdi: bdi, enc: enc,
      pend: pend, descTrocadas: descTrocadas,
      desconto: lic.descontoLinear || lic.descontoItens || null
    };

    /* ---- UM valor só ---- */
    /* Analítico e planilha têm de dizer o mesmo, e preço zero ou negativo não sai em proposta. */
    var ruins = [];
    itens.forEach(function (x) {
      if (!(x.pu > 0)) ruins.push("item " + x.numero + " com preço " + R(x.pu));
      if (x.insumos.length) {
        var so = 0; x.insumos.forEach(function (i) { so += i.ct; });
        if (Math.abs(so - x.cu) > Math.max(0.02, x.cu * 0.01)) ruins.push("item " + x.numero + " (" + x.codigo + "): a composição soma " + R(so) + " e o custo na planilha é " + R(x.cu));
      }
    });
    if (ruins.length) return { ok: false, erro: "O pacote não pode sair assim: " + ruins.slice(0, 5).join("; ") + (ruins.length > 5 ? " e mais " + (ruins.length - 5) : "") + ". Use o desconto por item ou desfaça a alteração manual do preço.", divergencias: ruins };
    var div = conferirValores(dados);
    if (div.length) return { ok: false, erro: "A proposta teria valores diferentes: " + div.join("; ") + ". Corrija o orçamento antes de gerar o pacote.", divergencias: div, dados: dados };
    return { ok: true, dados: dados, pendencias: pend };
  }

  /* soma de cada seção contra `totalProposta` — nenhuma pode divergir de um centavo */
  function conferirValores(d) {
    var dv = [], v = d.valor;
    function conf(rot, x) { if (Math.abs(arr(x, 2) - v) > 0.005) dv.push(rot + " " + R(x) + " ≠ total da proposta " + R(v)); }
    conf("soma dos itens da planilha", d.tot.comBdi);
    var sE = 0; d.etapas.forEach(function (E) { sE += E.comBdi; }); conf("soma das etapas", sE);
    var sC = 0; d.curva.forEach(function (c) { sC += c.pt; }); conf("curva ABC", sC);
    if (d.crono) conf("cronograma", d.crono.total);
    return dv;
  }

  /* pendências ANTES de gerar (para o aviso do botão) */
  function pendencias(orc, empresa, opcoes) {
    var r = montar(orc, empresa, opcoes);
    if (!r.ok) return { ok: false, erro: r.erro, preencher: [], conferencia: [], dados: [] };
    return { ok: true, preencher: r.pendencias.preencher, conferencia: r.pendencias.conferencia, dados: r.pendencias.dados,
      total: r.pendencias.preencher.length + r.pendencias.conferencia.length + r.pendencias.dados.length };
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
    ".ld-hd{position:absolute;left:12mm;right:12mm;top:8mm;height:26mm;display:flex;align-items:center;justify-content:space-between;z-index:2;overflow:hidden}",
    ".ld-id{font-size:7.4pt;line-height:1.3;max-width:132mm}.ld-id b{font-weight:700}",
    ".ld-logo{max-height:23mm;max-width:46mm;object-fit:contain}",
    ".ld-hd.big{top:6mm;height:38mm;justify-content:center}.ld-hd.big .ld-logo{max-height:36mm;max-width:70mm}",
    ".ld-corpo{position:absolute;left:12mm;right:12mm;top:36mm;bottom:38mm;overflow:hidden;z-index:2}",
    ".ld-pg[data-t=cartaA] .ld-corpo{top:46mm;bottom:22mm}",
    ".ld-pg[data-t=cartaB] .ld-corpo{top:14mm;bottom:22mm}",
    ".ld-ass{position:absolute;left:12mm;right:12mm;bottom:15mm;height:22mm;display:flex;gap:14mm;align-items:flex-end;justify-content:center;z-index:2;font-size:7.4pt;text-align:center}",
    ".ld-ass div{flex:1;border-top:.7pt solid #222;padding-top:1mm}",
    ".ld-ass b{display:block}",
    ".ld-pg[data-t=cartaA] .ld-ass,.ld-pg[data-t=cartaB] .ld-ass{display:none}",
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

  function subst(texto, vars) {
    return texto.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
  }

  function tdN(v) { return '<td class="n">' + v + '</td>'; }
  function tdC(v) { return '<td class="c">' + v + '</td>'; }
  function td(v) { return '<td>' + v + '</td>'; }

  function secCarta(d) {
    var e = d.emp, cb = d.cab, h = "";
    var vars = {
      cidade: esc(cb.cidade), edital: esc(cb.edital), objeto: esc(cb.objeto),
      valor: '<b>' + esc(R(d.valor)) + ' (' + esc(d.valorExtenso) + ')</b>',
      valorExtenso: esc(d.valorExtenso), prazo: cb.prazo ? esc(cb.prazo) : '<span class="ld-p0">[PREENCHER: prazo de execução]</span>',
      validade: cb.validade ? esc(cb.validade) : '<span class="ld-p0">[PREENCHER: validade da proposta]</span>',
      inicio: esc(cb.prazoInicio)
    };
    h += '<p class="ld-p" style="margin-bottom:1mm"><b>À<br>Comissão Permanente de Licitação<br>' + vars.cidade + '<br>REF.: ' + vars.edital + '<br>Objeto: ' + vars.objeto + '</b></p>';
    h += '<p class="ld-p">Prezados Senhores,</p>';
    h += '<p class="ld-p">' + subst('Apresentamos a V. Sas. Nossa proposta para execução dos serviços objeto do Edital do certame em epígrafe, pelo valor global de {valor}, com prazo de execução de {prazo}, contados a partir da "Ordem de Início das Obras", expedida pela CONTRATANTE.', vars) + '</p>';
    h += '<p class="ld-p">Concordamos integralmente e sem qualquer restrição com as condições desta licitação em referência, bem assim com as condições de contratação, estabelecidas na minuta do contrato que nos foi fornecida com o edital, e que nos submetemos às disposições regulamentares e legais sobre esta licitação, especialmente a Lei Federal nº 14.133 de 2021 e suas posteriores alterações.</p>';
    h += '<p class="ld-p">Comprometemo-nos a nos manifestarmos acerca da concordância da prorrogação e revalidação da proposta, caso seja necessário, antes de 10 (dez) dias do vencimento da mesma, por igual e sucessivo período, cientes que a falta de manifestação nos libera, excluindo-nos deste certame licitatório.</p>';
    h += '<p class="ld-p">' + subst('Informamos que o prazo de validade da nossa proposta é de {validade}, a contar da data de sua entrega.', vars) + '</p>';
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
    h += '<p class="ld-p" style="margin-top:2.5mm">' + subst('Finalizando, declaramos que assumimos inteira responsabilidade pela execução dos serviços objeto deste Edital e que serão executados conforme exigência editalícia e contratual, e que serão iniciados dentro do prazo de até {inicio} dias consecutivos, contados a partir da data de recebimento da Ordem de Serviço.', vars) + '</p>';
    h += '<div style="display:flex;gap:14mm;margin-top:9mm;text-align:center;font-size:8.4pt">' +
      '<div style="flex:1;border-top:.7pt solid #222;padding-top:1mm"><b>' + campo(e.nome, "razão social") + '</b><br>' + campo(e.socioNome, "nome do sócio administrador") + '<br>' + campo(e.socioCargo, "cargo do sócio") + '</div>' +
      '<div style="flex:1;border-top:.7pt solid #222;padding-top:1mm"><b>' + campo(e.rtNome, "nome do responsável técnico") + '</b><br>Responsável Técnico<br>CREA: ' + campo(e.rtCrea, "CREA do responsável técnico") + '</div></div>';
    return '<section class="ld-sec" data-tipo="carta" data-titulo="Carta proposta">' + h + '</section>';
  }

  function secResumo(d) {
    var h = '<div class="ld-tit">Resumo do Orçamento</div>';
    var t = '<table class="ld-t ld-split"><colgroup><col style="width:7mm"><col style="width:42mm"><col style="width:21mm"><col style="width:21mm"><col style="width:16mm"><col style="width:16mm"><col style="width:23mm"><col style="width:12mm"></colgroup>' +
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
    var nota = "Custo direto da planilha repartido por categoria, na proporção de cada composição. O preço total é o da planilha (custo direto + BDI de " + P(d.bdiPct) + ").";
    h += '<p class="ld-nota">' + esc(nota) + '</p>';
    return '<section class="ld-sec" data-tipo="corpo" data-titulo="Resumo por etapa">' + h + '</section>';
  }

  function secSintetico(d) {
    var h = '<div class="ld-tit">Planilha Orçamentária</div>';
    var t = '<table class="ld-t ld-split"><colgroup><col style="width:9mm"><col style="width:13mm"><col style="width:42mm"><col style="width:14mm"><col style="width:9mm"><col style="width:16mm"><col style="width:17mm"><col style="width:17mm"><col style="width:19mm"><col style="width:20mm"></colgroup>' +
      '<thead><tr><th rowspan="2">ITEM</th><th rowspan="2">CÓDIGO</th><th rowspan="2">DESCRIÇÃO</th><th rowspan="2">FONTE</th><th rowspan="2">UNID.</th><th rowspan="2">QTD.</th><th colspan="2">VALOR UNITÁRIO R$</th><th colspan="2">PREÇO TOTAL R$</th></tr>' +
      '<tr><th>SEM BDI</th><th>COM BDI</th><th>SEM BDI</th><th>COM BDI</th></tr></thead><tbody>';
    d.etapas.forEach(function (E) {
      t += '<tr class="et kn"><td>' + esc(E.codigo) + '</td><td colspan="5">' + esc(E.nome) + '</td><td></td><td></td>' + tdN(R(E.semBdi)) + tdN(R(E.comBdi)) + '</tr>';
      E.itens.forEach(function (I) {
        t += '<tr>' + td(esc(I.numero)) + td(esc(I.codigo)) + td(esc(I.descricao)) + tdC(esc(I.fonte)) + tdC(esc(I.unidade)) + tdN(fmt(I.quantidade, 2)) +
          tdN(R(I.cu)) + tdN(R(I.pu)) + tdN(R(I.ct)) + tdN(R(I.pt)) + '</tr>';
      });
    });
    t += '<tr class="tt"><td colspan="8">VALOR TOTAL:</td>' + tdN(R(d.tot.semBdi)) + tdN(R(d.tot.comBdi)) + '</tr></tbody></table>';
    h += t + '<p class="ld-ext">' + esc(cap(d.valorExtenso)) + '</p>';
    return '<section class="ld-sec" data-tipo="corpo" data-titulo="Planilha orçamentária">' + h + '</section>';
  }

  /* bloco analítico de UMA composição */
  function blocoComposicao(tit, insumos, valor, bdiPct, pu, qtdRot, qtd, nota) {
    var h = '<div class="ld-it"><div class="ld-itt">' + esc(tit) + '</div>';
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
          sm += x.ct;
          h += '<tr>' + td(esc((x.codigo ? x.codigo + "  " : "") + x.descricao)) + tdC(esc(x.fonte)) + tdC(esc(x.unidade)) + tdN(C8(x.coef)) + tdN(R4(x.cu)) + tdN(R4(x.ct)) + '</tr>';
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
      h += blocoComposicao(I.numero + ". " + I.codigo + " " + I.descricao + " (" + I.unidade + ")", I.insumos, I.cu, d.bdiPct, I.pu, I.unidade, I.quantidade);
    });
    return '<section class="ld-sec" data-tipo="corpo" data-titulo="Relatório analítico">' + h + '</section>';
  }

  function secProprias(d) {
    var h = '<div class="ld-tit">Composições Próprias</div><p class="ld-sub">Composições elaboradas pela proponente, fora da tabela oficial de referência (preços e origem informados na licitação).</p>';
    var lst = d.itens.filter(function (I) { return I.propria; });
    if (!lst.length) h += '<p class="ld-p">Nenhuma composição própria nesta proposta.</p>';
    lst.forEach(function (I) { h += blocoComposicao(I.codigo + " " + I.descricao + " (" + I.unidade + ")", I.insumos, I.cu, d.bdiPct, I.pu, null, null); });
    return '<section class="ld-sec" data-tipo="corpo" data-titulo="Composições próprias">' + h + '</section>';
  }

  function secAuxiliares(d) {
    var ref = d.base ? (s(d.base.tabela) + " " + s(d.base.mes) + (d.base.uf ? "/" + d.base.uf : "") + (d.base.desonerado === true ? " (desonerada)" : (d.base.desonerado === false ? " (não desonerada)" : ""))) : d.tabelaRef;
    var h = '<div class="ld-tit">Relatório Analítico - Composições Auxiliares</div>';
    var dl = d.desconto, comDesc = d.aux.some(function (a) { return a.descontada; });
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
      if (a.insumos) h += blocoComposicao(tit, a.insumos, a.valor, d.bdiPct, arr(a.valor * (1 + d.bdiPct / 100), 2), a.unidade, a.quantidade, nota);
      else h += '<div class="ld-it"><div class="ld-itt">' + esc(tit) + '</div><div class="ld-nota">Sem detalhamento na base de referência' + (d.tabelaRef ? " (" + esc(d.tabelaRef) + ")" : "") + '. Usada em: ' + esc(a.usadoEm.join(", ")) + '.</div></div>';
    });
    return '<section class="ld-sec" data-tipo="corpo" data-titulo="Composições auxiliares">' + h + '</section>';
  }

  function secQuantitativos(d) {
    var h = '<div class="ld-tit">Detalhamento dos Quantitativos</div>';
    h += '<p class="ld-sub">Quantidades dos serviços conforme memória de cálculo do projeto básico do órgão. O consumo de cada insumo é a quantidade do serviço multiplicada pelo coeficiente da composição.</p>';
    var t = '<table class="ld-t ld-split"><colgroup><col style="width:10mm"><col style="width:15mm"><col style="width:86mm"><col style="width:12mm"><col style="width:26mm"><col style="width:26mm"></colgroup>' +
      '<thead><tr><th>ITEM</th><th>CÓDIGO</th><th>DESCRIÇÃO</th><th>UNID</th><th>QUANTIDADE DO SERVIÇO</th><th></th></tr></thead><tbody>';
    d.itens.forEach(function (I) {
      t += '<tr>' + td(esc(I.numero)) + td(esc(I.codigo)) + td(esc(I.descricao)) + tdC(esc(I.unidade)) + tdN(fmt(I.quantidade, 2)) + td("") + '</tr>';
    });
    t += '</tbody></table>';
    h += t;
    var q = '<div class="ld-tit" style="font-size:10.5pt;margin-top:5mm">Consumo de insumos por serviço</div>' +
      '<table class="ld-t ld-split"><colgroup><col style="width:10mm"><col style="width:15mm"><col style="width:68mm"><col style="width:12mm"><col style="width:26mm"><col style="width:20mm"><col style="width:26mm"></colgroup>' +
      '<thead><tr><th>ITEM</th><th>CÓDIGO</th><th>DESCRIÇÃO</th><th>UNID</th><th>QUANTIDADE DO SERVIÇO</th><th>COEFICIENTE DO INSUMO</th><th>QUANTIDADE TOTAL</th></tr></thead><tbody>';
    d.quant.forEach(function (g) {
      q += '<tr class="gr kn"><td colspan="7">[ ' + esc(CAT_ROT_Q[g.cat]) + ' ] ' + esc(g.codigo) + ' — ' + esc(g.descricao) + (g.unidade ? ' (' + esc(g.unidade) + ')' : '') + '</td></tr>';
      g.usos.forEach(function (u) {
        q += '<tr>' + td(esc(u.numero)) + td(esc(u.codigo)) + td(esc(u.descricao)) + tdC(esc(u.unidade)) + tdN(fmt(u.quantidade, 2)) + tdN(C8(u.coef)) + tdN(C8(u.total)) + '</tr>';
      });
      q += '<tr class="tt"><td colspan="6" style="text-align:right">TOTAL:</td>' + tdN(C8(g.total)) + '</tr>';
    });
    q += '</tbody></table>';
    h += q;
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
      h += '<div class="ld-pend">PENDÊNCIA: cronograma físico-financeiro não informado (ou incompleto) no pacote do órgão. Preencher antes de entregar a proposta.</div>';
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
    h += '<p class="ld-nota">Em cada mês: percentual da etapa e valor em R$. Percentuais mensais conforme o cronograma do órgão; valores calculados sobre o total de cada etapa já com o desconto da proposta. A diferença de centavos fica no último mês de cada etapa.</p>';
    return '<section class="ld-sec" data-tipo="corpo" data-titulo="Cronograma">' + h + '</section>';
  }

  function secBdi(d) {
    var h = '<div class="ld-tit">Composição do BDI</div>';
    if (!d.bdi.ok) {
      h += '<div class="ld-pend">PENDÊNCIA: composição do BDI não informada no pacote do órgão. BDI usado na proposta: ' + esc(P(d.bdiPct)) + '.</div>';
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
      h += '<div class="ld-pend">PENDÊNCIA: encargos não informados no pacote do órgão. Nenhum valor foi estimado.</div>';
      return '<section class="ld-sec" data-tipo="corpo" data-titulo="Encargos sociais">' + h + '</section>';
    }
    var t = '<table class="ld-t ld-split" style="width:150mm;margin:0 auto"><colgroup><col style="width:14mm"><col style="width:96mm"><col style="width:20mm"><col style="width:20mm"></colgroup><thead><tr><th>COD</th><th>DESCRIÇÃO</th><th>HORISTA %</th><th>MENSALISTA %</th></tr></thead><tbody>';
    d.enc.grupos.forEach(function (g) {
      t += '<tr class="et kn"><td colspan="4">GRUPO ' + g.grupo + '</td></tr>';
      g.linhas.forEach(function (l) { t += '<tr' + (l.diferenca ? ' style="color:#c00000"' : '') + '>' + td(esc(l.codigo)) + td(esc(l.descricao)) + tdN(P(l.horista)) + tdN(P(l.mensalista)) + '</tr>'; });
      t += '<tr class="gr"><td></td><td>TOTAL GRUPO ' + g.grupo + '</td>' + tdN(P(g.horista)) + tdN(P(g.mensalista)) + '</tr>';
    });
    t += '</tbody></table>';
    h += t + '<p class="ld-ext" style="font-style:normal"><b>A + B + C + D = ' + esc(P(d.enc.total.horista)) + ' (horista)  /  ' + esc(P(d.enc.total.mensalista)) + ' (mensalista)</b></p>';
    h += '<p class="ld-nota">Regime ' + (d.enc.desonerado ? "desonerado" : "não desonerado") + ', conforme a tabela do órgão.</p>';
    return '<section class="ld-sec" data-tipo="corpo" data-titulo="Encargos sociais">' + h + '</section>';
  }

  function tplTimbrado(d) {
    var e = d.emp, cb = d.cab;
    var logo = e.timbradoTopo ? '<img class="ld-logo" src="' + esc(e.timbradoTopo) + '" alt="">' : '<span class="ld-p0">[PREENCHER: timbrado (logo)]</span>';
    var id = '<div class="ld-id"><b>OBRA:</b> ' + esc(cb.objeto) + '<br><b>REF:</b> ' + esc(cb.edital) + '.<br><b>CIDADE:</b> ' + esc(cb.cidade) + '<br><b>DATA:</b> ' + esc(cb.data) + '</div>';
    var ass = '<div><b>' + campo(e.nome, "razão social") + '</b>' + campo(e.socioNome, "nome do sócio administrador") + '<br>' + campo(e.socioCargo, "cargo do sócio") + '</div>' +
      '<div><b>' + campo(e.rtNome, "nome do responsável técnico") + '</b>Responsável Técnico<br>CREA: ' + campo(e.rtCrea, "CREA do responsável técnico") + '</div>';
    var rod = '<div>' + campo(e.nome, "razão social") + ' CNPJ ' + campo(e.cnpj, "CNPJ") + '<br>' + campo(e.endereco, "endereço") + '<br>Fone: ' + campo(e.telefone, "telefone") + ' / E-mail: ' + campo(e.email, "e-mail") + '</div><div class="pag">Página: {{pag}}</div>';
    return '<template class="ld-tpl" data-n="hd-big"><div class="ld-hd big">' + logo + '</div></template>' +
      '<template class="ld-tpl" data-n="hd-std"><div class="ld-hd">' + id + logo + '</div></template>' +
      '<template class="ld-tpl" data-n="ass"><div class="ld-ass">' + ass + '</div></template>' +
      '<template class="ld-tpl" data-n="rod"><div class="ld-rod">' + rod + '</div></template>' +
      '<template class="ld-tpl" data-n="wm">' + (e.timbradoFundo ? '<img class="ld-wm" src="' + esc(e.timbradoFundo) + '" alt="">' : '') + '</template>';
  }

  /* html(dados): raiz com as seções em ordem + os modelos de cabeçalho/rodapé. Ainda NÃO paginado. */
  function html(d) {
    var corpo = secCarta(d) + secResumo(d) + secSintetico(d) + secAnalitico(d) + secProprias(d) + secAuxiliares(d) +
      secQuantitativos(d) + secCurva(d) + secCronograma(d) + secBdi(d) + secEncargos(d);
    return '<div class="ld-raiz rel-doc"><style>' + CSS + '</style><div class="ld-fonte">' + corpo + '</div>' + tplTimbrado(d) + '<div class="ld-paginas"></div></div>';
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

    function nova(tipo, idx) {
      n++;
      var pg = doc.createElement("div");
      var t = tipo === "carta" ? (idx === 0 ? "cartaA" : "cartaB") : "corpo";
      pg.className = "ld-pg"; pg.setAttribute("data-t", t);
      var cab = (t === "cartaA") ? tpl["hd-big"] : (t === "cartaB" ? "" : tpl["hd-std"]);
      pg.innerHTML = (tpl.wm || "") + (cab || "") + '<div class="ld-corpo"></div>' + (tpl.ass || "") + (tpl.rod || "").replace("{{pag}}", String(n));
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

    [].slice.call(fonte.children).forEach(function (sec) {
      var tipo = sec.getAttribute("data-tipo"), idx = 0, P1 = nova(tipo, idx++);
      var corpo = P1.corpo;
      function proxima() { var q = nova(tipo, idx++); corpo = q.corpo; return q; }
      /* leva junto os blocos "kn" (título) que ficaram no fim da página */
      function carregaKn() {
        var acc = [];
        while (corpo.lastElementChild && corpo.lastElementChild.getAttribute("data-kn") === "1" && corpo.children.length > 1) {
          acc.unshift(corpo.lastElementChild); corpo.removeChild(corpo.lastElementChild);
        }
        return acc;
      }
      [].slice.call(sec.children).forEach(function (b) {
        if (b.classList.contains("ld-tit") || b.classList.contains("ld-sub")) b.setAttribute("data-kn", "1");
        var ehTab = b.tagName === "TABLE" && b.classList.contains("ld-split");
        if (!ehTab) {
          corpo.appendChild(b);
          if (!cabe(corpo) && corpo.children.length > 1) {
            corpo.removeChild(b);
            var junto = carregaKn();
            proxima();
            junto.forEach(function (x) { corpo.appendChild(x); });
            corpo.appendChild(b);
          }
          return;
        }
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
            /* já era uma página nova e a linha sozinha não cabe: aceita (nada melhor a fazer) */
            corpo.appendChild(cur); mover.forEach(function (x) { tb.appendChild(x); });
            return;
          }
          proxima();
          junto.forEach(function (x) { corpo.appendChild(x); });
          cur = vazia(b); tb = cur.tBodies[0]; corpo.appendChild(cur);
          mover.forEach(function (x) { tb.appendChild(x); });
        });
        if (b.parentNode === sec) sec.removeChild(b);
      });
    });
    raiz.removeChild(fonte);
    [].slice.call(raiz.querySelectorAll("template.ld-tpl")).forEach(function (t) { t.parentNode.removeChild(t); });
    return n;
  }

  /* página HTML completa (navegador sem tela / janela própria) */
  function documento(htmlRaiz, titulo) {
    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + esc(titulo || "Proposta") + '</title>' +
      '<style>html,body{margin:0;padding:0;background:#fff}@media screen{body{background:#5b6b7b;padding:10px 0}}</style></head><body>' + htmlRaiz + '</body></html>';
  }

  var LicitacaoDocs = {
    montar: montar, html: html, gerar: gerar, pendencias: pendencias, paginar: paginar, documento: documento,
    baseDe: baseDe, parseEncargos: parseEncargos, parseBdi: parseBdi, conferirValores: conferirValores,
    css: CSS,
    _util: { fmt: fmt, R: R, norm: norm, parecido: parecido, arr: arr, prazoExt: prazoExt, dataExtensoUpper: dataExtensoUpper }
  };
  global.LicitacaoDocs = LicitacaoDocs;
  if (typeof module !== "undefined" && module.exports) module.exports = LicitacaoDocs;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
