/* =====================================================================
 * planilhacompleta.js — A PLANILHA ORÇAMENTÁRIA COMPLETA DE OUTRO PROGRAMA VIRA
 *                ORÇAMENTO DE VERDADE, e as composições próprias dela
 *                podem entrar no banco do sistema
 *
 * Motor PURO (sem DOM), testado em tools/test-planilha-completa.js. A tela só
 * orquestra (App._abrirImportPlanilhaCompleta / App.criarOrcamentoDaPlanilhaCompleta).
 *
 * O QUE O ARQUIVO TRAZ, e de onde cada coisa sai:
 *   linhas 1-2 de toda aba ........... obra, banco/competência/estado, BDI e
 *                                      regime de encargos
 *   "Sintético" ...................... a árvore 1 › 1.1 › 1.1.1, o código, o
 *                                      BANCO de cada item, a quantidade e o
 *                                      custo unitário sem BDI
 *   "Sintético c MO MAT EQ" .......... a divisão MO/MAT/EQ de cada item
 *   "CPUs" / "Orçamento Analítico" ... a estrutura de cada composição:
 *                                      insumos, coeficientes e preços
 *
 * As abas são achadas pelo CABEÇALHO, não pelo nome — quem exporta só
 * algumas abas, ou renomeia, continua sendo lido. O nome só desempata.
 *
 * ⚠ O CÓDIGO PRÓPRIO DO ARQUIVO NÃO É CHAVE SOZINHO. Ele numera composição
 *   e insumo em sequências SEPARADAS: no primeiro arquivo real, 00000004 era
 *   a composição de um piso E o insumo de uma sondagem; 00000005 era uma
 *   fossa E um combustível. Casar só pelo código gravaria um por cima do
 *   outro, calado. A chave aqui é TIPO + código, e o código gravado no
 *   sistema carrega o tipo: COMP- (composição) e INS- (insumo).
 *
 * ⚠ O CÓDIGO SINAPI DE INSUMO VEM COM ZEROS À ESQUERDA (00004083); a base do
 *   app guarda 4083. Sem tirar os zeros, nenhum insumo SINAPI de composição
 *   própria seria achado na base, e o detalhamento oficial do item nunca
 *   abriria. Só o SINAPI perde os zeros: de outro banco não se sabe se o
 *   zero é significativo, e na dúvida o código fica como veio.
 *
 * ⚠ O ARREDONDAMENTO É O DO ARQUIVO. O programa de origem arredonda
 *   (103,44 × 1,15 = 118,956 → 118,96); o padrão do app é truncar (TCU), que
 *   daria 118,95 — e o total importado sairia centavos abaixo do que o
 *   cliente já recebeu. O orçamento importado nasce em "arred2", e a tela
 *   confere o total contra o do arquivo ANTES de gravar.
 *
 * ⚠ NUNCA INVENTA. Banco que o app não conhece fica com o nome que veio;
 *   composição sem estrutura no arquivo vira insumo de preço fechado (e diz
 *   isso); regime de encargos que o cabeçalho não declara fica sem marca.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ⚠ UM LUGAR SÓ para o nome do formato: é o que a tela mostra e o que
     fica gravado no rastro do orçamento e de cada composição importada. */
  /* ⚠ NOME NEUTRO, DE PROPÓSITO. O arquivo não diz qual programa o gerou
     (medido em 11/09/2026: nenhuma parte do .xlsx cita o software, e o autor
     gravado não é nome de programa). Marca de terceiro na tela — e gravada
     no rastro de cada orçamento e composição — seria um recado que pode
     mentir, e ainda é marca dos outros dentro do produto. O formato é
     reconhecido pelo LAYOUT, e o nome diz o que ele é. */
  var NOME_FORMATO = "Planilha orçamentária completa";
  var METODO = "arred2";
  var PREFIXO = { composicao: "COMP-", insumo: "INS-" };

  function U() { return global.Util; }

  /* ---------- célula → texto / número ----------
     A matriz vem do ExcelJS (fórmula = {formula, result}, texto rico =
     {richText}) ou do SheetJS/CSV (primitivos). O número em si é do
     Util.num — o parser da casa; réplica local de parser apodrece. */
  function txt(v) {
    if (v == null) return "";
    if (typeof v === "object") {
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      if (v.result != null) return typeof v.result === "object" ? "" : String(v.result);
      if (v.richText) return v.richText.map(function (t) { return t.text; }).join("");
      if (v.text != null) return String(v.text);
      return "";
    }
    return String(v);
  }
  function num(v) {
    if (v && typeof v === "object") v = (v.result != null && typeof v.result !== "object") ? v.result : txt(v);
    return U().num(v);
  }
  function limpa(v) { return txt(v).replace(/\s+/g, " ").trim(); }
  function norm(s) {
    s = String(s == null ? "" : s).toLowerCase();
    try { s = s.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
    return s.replace(/[.\-_\/:]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function ehNumeroItem(s) { return /^\d+(\.\d+)*$/.test(s); }
  function chaveUn(u) {
    var Ut = U();
    return (Ut && Ut.unidadeChave) ? Ut.unidadeChave(u) : norm(u).replace(/[^a-z0-9]/g, "");
  }

  /* ---------- cabeçalho de tabela ---------- */
  var CAB = {
    item: ["item"],
    codigo: ["codigo"],
    banco: ["banco"],
    descricao: ["descricao"],
    tipo: ["tipo"],
    unidade: ["und", "unid", "unidade"],
    quantidade: ["quant", "quantidade", "qtd", "qtde"],
    valorUnit: ["valor unit", "valor unitario", "custo unit", "custo unitario"],
    total: ["total"]
  };
  function mapaCabecalho(linha) {
    var m = {};
    (linha || []).forEach(function (c, i) {
      var n = norm(txt(c));
      if (!n) return;
      for (var k in CAB) {
        /* ⚠ PRIMEIRA OCORRÊNCIA VENCE: célula mesclada chega repetida em
           cada coluna da mescla ("Tipo" em E e em F, "Total" de L a O). */
        if (CAB.hasOwnProperty(k) && m[k] == null && CAB[k].indexOf(n) >= 0) { m[k] = i; break; }
      }
    });
    return m;
  }
  function acharTabela(matriz) {
    var lim = Math.min((matriz || []).length, 20);
    for (var r = 0; r < lim; r++) {
      var m = mapaCabecalho(matriz[r]);
      if (m.item != null && m.codigo != null && m.banco != null && m.descricao != null &&
          m.quantidade != null && m.valorUnit != null) return { linha: r, col: m };
    }
    return null;
  }

  /* ---------- banco, estado, competência ---------- */
  var ESTADOS = {
    "acre": "AC", "alagoas": "AL", "amapa": "AP", "amazonas": "AM", "bahia": "BA", "ceara": "CE",
    "distrito federal": "DF", "espirito santo": "ES", "goias": "GO", "maranhao": "MA",
    "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", "para": "PA",
    "paraiba": "PB", "parana": "PR", "pernambuco": "PE", "piaui": "PI", "rio de janeiro": "RJ",
    "rio grande do norte": "RN", "rio grande do sul": "RS", "rondonia": "RO", "roraima": "RR",
    "santa catarina": "SC", "sao paulo": "SP", "sergipe": "SE", "tocantins": "TO"
  };
  /* "Próprio" → PROPRIA; "SINAPI" → SINAPI; "SEINFRA-CE" → SEINFRA. Banco
     desconhecido fica com o próprio nome: é o rótulo honesto na planilha. */
  function fonteDoBanco(banco) {
    var n = norm(banco).toUpperCase();
    if (!n) return "";
    if (/^PROPRI/.test(n)) return "PROPRIA";
    if (/^SINAPI/.test(n)) return "SINAPI";
    if (/^SICRO/.test(n)) return "SICRO";
    var chave = n.split(" ")[0].replace(/[^A-Z0-9]/g, "");
    return chave || n;
  }
  function codigoDaBase(fonte, codigo) {
    var c = String(codigo == null ? "" : codigo).replace(/\s+/g, "");
    if (fonte === "SINAPI" && /^\d+$/.test(c)) c = c.replace(/^0+(?=\d)/, "");
    return c;
  }
  /* "SINAPI - 07/2026 - Bahia" (uma linha por banco, quando há vários) */
  function lerBancos(texto) {
    return String(texto || "").split(/[\n;]+/).map(function (p) { return p.trim(); }).filter(Boolean).map(function (p) {
      var m = p.match(/^(.+?)\s*-\s*(\d{1,2})\s*\/\s*(\d{4})\s*(?:-\s*(.+))?$/);
      if (!m) return { nome: p, fonte: fonteDoBanco(p), competencia: "", estado: "", uf: "" };
      var est = String(m[4] || "").trim();
      var uf = ESTADOS[norm(est)] || (/^[A-Z]{2}$/.test(est) ? est : "");
      var mes = m[2].length === 1 ? "0" + m[2] : m[2];
      return { nome: m[1].trim(), fonte: fonteDoBanco(m[1]), competencia: m[3] + "-" + mes, estado: est, uf: uf };
    });
  }
  function lerCabecalho(matriz) {
    var cab = { obra: "", bancosTexto: "", bancos: [], bdi: null, encargosTexto: "", desonerado: null, uf: "", competencia: "" };
    for (var r = 0; r < Math.min(4, (matriz || []).length - 1); r++) {
      var L = matriz[r] || [], P = matriz[r + 1] || [];
      for (var c = 0; c < L.length; c++) {
        var n = norm(txt(L[c])), v = P[c];
        if (n === "obra" && !cab.obra) cab.obra = limpa(v);
        else if (n === "bancos" && !cab.bancosTexto) cab.bancosTexto = txt(v).trim();
        else if ((n === "b d i" || n === "bdi") && cab.bdi == null && limpa(v)) cab.bdi = num(v);
        else if (n === "encargos sociais" && !cab.encargosTexto) cab.encargosTexto = limpa(v);
      }
    }
    cab.bancos = lerBancos(cab.bancosTexto);
    var principal = cab.bancos.filter(function (b) { return b.fonte === "SINAPI"; })[0] || cab.bancos[0];
    if (principal) { cab.uf = principal.uf; cab.competencia = principal.competencia; }
    /* ⚠ A ORDEM IMPORTA: "Não Desonerado" contém "desonerado". */
    var ne = norm(cab.encargosTexto);
    if (/^nao desonerad/.test(ne)) cab.desonerado = false;
    else if (/^desonerad/.test(ne)) cab.desonerado = true;
    return cab;
  }

  /* ---------- Sintético: a árvore e os itens ---------- */
  function lerSintetico(matriz, tab) {
    var col = tab.col, linhas = [], totais = {};
    for (var r = tab.linha + 1; r < matriz.length; r++) {
      var L = matriz[r] || [];
      /* rodapé: "Total sem BDI" / "Total do BDI" / "Total Geral" — o valor é a
         primeira célula à direita que não repete o rótulo (mescla repete) */
      for (var c = 0; c < L.length; c++) {
        var n = norm(txt(L[c]));
        if (n === "total sem bdi" || n === "total do bdi" || n === "total geral") {
          for (var d = c + 1; d < L.length; d++) {
            var t = limpa(L[d]);
            if (t && norm(t) !== n) {
              totais[n === "total sem bdi" ? "semBdi" : (n === "total do bdi" ? "bdi" : "geral")] = num(L[d]);
              break;
            }
          }
        }
      }
      var numero = limpa(L[col.item]).replace(/\.$/, "");
      if (!ehNumeroItem(numero)) continue;
      var codigo = limpa(L[col.codigo]), banco = limpa(L[col.banco]);
      var desc = limpa(L[col.descricao]);
      var nivel = numero.split(".").length;
      if (!codigo && !banco) { linhas.push({ tipo: "grupo", numero: numero, nome: desc, nivel: nivel }); continue; }
      var fonte = fonteDoBanco(banco);
      linhas.push({
        tipo: "item", numero: numero, nivel: nivel, linha: r + 1,
        codigoOrigem: codigo, banco: banco, fonte: fonte,
        codigo: fonte === "PROPRIA" ? "" : codigoDaBase(fonte, codigo),
        descricao: desc, unidade: limpa(L[col.unidade]),
        quantidade: num(L[col.quantidade]), valorUnit: num(L[col.valorUnit])
      });
    }
    return { linhas: linhas, totais: totais };
  }

  /* ---------- Sintético c MO MAT EQ: a divisão por item ----------
     Duas linhas de cabeçalho: a de cima diz "Valor Unit com BDI" / "Total"
     (mesclados), a de baixo "M. O. | EQ. | MAT. | Total". O primeiro quarteto
     à direita do "Valor Unit" é o UNITÁRIO com BDI. */
  function subcabecalhoMoMatEq(matriz, tab) {
    var sub = matriz[tab.linha + 1] || [], ix = { mo: -1, eq: -1, mat: -1, total: -1 };
    for (var c = tab.col.valorUnit + 1; c < sub.length; c++) {
      var n = norm(txt(sub[c]));
      if (n === "m o" && ix.mo < 0) ix.mo = c;
      else if (ix.mo >= 0 && n === "eq" && ix.eq < 0) ix.eq = c;
      else if (ix.mo >= 0 && n === "mat" && ix.mat < 0) ix.mat = c;
      else if (ix.mo >= 0 && n === "total" && ix.total < 0) { ix.total = c; break; }
    }
    return (ix.mo >= 0 && ix.eq >= 0 && ix.mat >= 0 && ix.total >= 0) ? ix : null;
  }
  function lerMoMatEq(matriz, tab) {
    var ix = subcabecalhoMoMatEq(matriz, tab);
    if (!ix) return null;
    var out = {};
    for (var r = tab.linha + 2; r < matriz.length; r++) {
      var L = matriz[r] || [];
      var numero = limpa(L[tab.col.item]).replace(/\.$/, "");
      if (!ehNumeroItem(numero) || !limpa(L[tab.col.codigo])) continue;
      out[numero] = { mo: num(L[ix.mo]), eq: num(L[ix.eq]), mat: num(L[ix.mat]), total: num(L[ix.total]) };
    }
    return out;
  }

  /* ---------- CPUs / Analítico: os blocos de composição ---------- */
  var TIPO_LINHA = { "composicao": "composicao", "composicao auxiliar": "auxiliar", "insumo": "insumo" };
  function ehAbaDeComposicoes(matriz) {
    for (var r = 0; r < (matriz || []).length; r++) {
      if (TIPO_LINHA[norm(txt((matriz[r] || [])[0]))]) return true;
    }
    return false;
  }
  function lerBlocos(matriz) {
    var blocos = [], atual = null, col = null, secao = "";
    for (var r = 0; r < matriz.length; r++) {
      var L = matriz[r] || [];
      var a = norm(txt(L[0]));
      if (a === "composicoes principais") { secao = "principal"; continue; }
      if (a === "composicoes auxiliares") { secao = "auxiliar"; continue; }
      var m = mapaCabecalho(L);
      if (m.codigo != null && m.banco != null && m.descricao != null && m.quantidade != null) {
        col = m;
        var numero = limpa(L[0]);
        atual = { numero: ehNumeroItem(numero) ? numero : "", secao: secao, principal: null, filhos: [], linha: r + 1 };
        blocos.push(atual);
        continue;
      }
      if (!atual || !col) continue;
      var tl = TIPO_LINHA[a];
      if (!tl) continue;
      var reg = {
        tipoLinha: tl, codigoOrigem: limpa(L[col.codigo]), banco: limpa(L[col.banco]),
        descricao: limpa(L[col.descricao]), tipo: col.tipo != null ? limpa(L[col.tipo]) : "",
        unidade: limpa(L[col.unidade]), coeficiente: num(L[col.quantidade]),
        valorUnit: num(L[col.valorUnit]), total: col.total != null ? num(L[col.total]) : 0
      };
      reg.fonte = fonteDoBanco(reg.banco);
      if (!atual.principal) atual.principal = reg; else atual.filhos.push(reg);
    }
    return blocos.filter(function (b) { return !!b.principal; });
  }

  /* Categoria do insumo dentro da composição própria — os mesmos rótulos que
     o criador grava (MAO DE OBRA / EQUIPAMENTO / MATERIAL / COMPOSICAO
     AUXILIAR), que é o que o ComposicaoPropria.catDe sabe ler.
     ⚠ A composição auxiliar de mão de obra do SINAPI ("SERVENTE COM
     ENCARGOS COMPLEMENTARES") não traz categoria: é a mesma convenção do
     criador (app.js, cpAdd) que decide — senão MO vira material na curva. */
  var RE_MO = / COM ENCARGOS COMPLEMENTARES| COM ENCARGOS SOCIAIS|\(HORISTA\)|\(MENSALISTA\)/;
  function categoriaDe(reg) {
    var t = norm(reg.tipo);
    if (reg.tipoLinha === "insumo") {
      if (/^mao de obra/.test(t) || /encargos complementares/.test(t)) return "MAO DE OBRA";
      if (/^equipamento/.test(t)) return "EQUIPAMENTO";
      return "MATERIAL";
    }
    var d = String(reg.descricao || "").toUpperCase(), u = norm(reg.unidade);
    if (RE_MO.test(d)) return "MAO DE OBRA";
    if (u === "chp" || u === "chi" || /custos horarios/.test(t)) return "EQUIPAMENTO";
    return "COMPOSICAO AUXILIAR";
  }
  function catCurta(cat) {
    var CP = global.ComposicaoPropria;
    if (CP && CP.catDe) return CP.catDe(cat);
    var s = String(cat || "").toUpperCase();
    return /MAO|ENCARGO/.test(s) ? "MO" : (/EQUIP/.test(s) ? "EQ" : "MAT");
  }
  function custoDosInsumos(insumos) {
    var CP = global.ComposicaoPropria;
    if (CP && CP.custo) return CP.custo(insumos, METODO);
    /* sem o motor do criador (não acontece no app): soma simples, arredondada */
    var t = { total: 0, mo: 0, mat: 0, eq: 0 };
    (insumos || []).forEach(function (i) {
      var l = r2(Number(i.coeficiente) * Number(i.custoUnitario)), c = catCurta(i.categoria);
      t.total += l; if (c === "MO") t.mo += l; else if (c === "EQ") t.eq += l; else t.mat += l;
    });
    return { total: r2(t.total), mo: r2(t.mo), mat: r2(t.mat), eq: r2(t.eq) };
  }
  /* "PARE - PAREDES/PAINEIS" → "PAREDES/PAINEIS" → um dos 18 grupos do criador */
  function grupoDe(tipoOrigem) {
    var g = String(tipoOrigem || "").replace(/^\s*[A-Z]{2,6}\s*-\s*/, "").trim();
    var CP = global.ComposicaoPropria;
    return (CP && CP.grupoDoCriador) ? CP.grupoDoCriador(g) : "OUTROS";
  }
  function chaveProp(tipo, codigoOrigem) { return (tipo === "composicao" ? "C:" : "I:") + String(codigoOrigem || "").replace(/\s+/g, ""); }

  /* ---------- a árvore do orçamento ----------
     O app tem etapa › sub etapa › item. O arquivo pode ser mais fundo: todo
     grupo abaixo do 1º nível vira sub etapa, com o caminho no nome
     ("INFRAESTRUTURA › FUNDAÇÃO"), e o item vai para o grupo imediato. */
  function montarArvore(linhas, avisos) {
    var etapas = [], etapaAtual = null, grupos = {};
    function etapaAvulsa() {
      if (!etapaAtual) { etapaAtual = { numero: "", nome: "Serviços", subetapas: [], itens: [] }; etapas.push(etapaAtual); }
      return etapaAtual;
    }
    linhas.forEach(function (l) {
      var pai = l.numero.split(".").slice(0, -1).join(".");
      if (l.tipo === "grupo") {
        if (l.nivel === 1) {
          etapaAtual = { numero: l.numero, nome: l.nome, subetapas: [], itens: [] };
          etapas.push(etapaAtual);
          grupos[l.numero] = { etapa: etapaAtual, sub: null, caminho: [] };
          return;
        }
        var gp = grupos[pai] || { etapa: etapaAvulsa(), sub: null, caminho: [] };
        var caminho = gp.caminho.concat([l.nome]);
        var sub = { numero: l.numero, nome: caminho.join(" › "), nItens: 0 };
        gp.etapa.subetapas.push(sub);
        grupos[l.numero] = { etapa: gp.etapa, sub: sub, caminho: caminho };
        return;
      }
      var g = grupos[pai] || { etapa: etapaAvulsa(), sub: null };
      l.subNumero = g.sub ? g.sub.numero : "";
      if (g.sub) g.sub.nItens++;
      g.etapa.itens.push(l);
    });
    /* ⚠ O APP NUMERA OS ITENS SOLTOS ANTES DAS SUB ETAPAS (orcamento.js,
       calcular). No arquivo, "1.2 SONDAGEM" vem DEPOIS da sub etapa "1.1
       PROJETOS"; aqui ela passa a ser 1.1. O conteúdo e o total não mudam —
       mas quem confere item a item contra o PDF de origem precisa saber. */
    etapas.forEach(function (e) {
      var comSub = e.subetapas.some(function (s) { return s.nItens > 0; });
      var soltos = e.itens.filter(function (i) { return !i.subNumero; });
      if (comSub && soltos.length) {
        avisos.push("Na etapa " + (e.numero || "") + " " + e.nome + ", " + soltos.length +
          " item(ns) fora de sub etapa (" + soltos.slice(0, 3).map(function (i) { return i.numero; }).join(", ") +
          ") ganham numeração nova: o OrçaPRO numera os itens soltos antes das sub etapas. O número do arquivo fica guardado no item.");
      }
    });
    return etapas;
  }

  /* ---------- comparação com o que já está no banco ---------- */
  function assinatura(insumos, doArquivo) {
    return (insumos || []).map(function (i) {
      var f = String(i.fonte || "").toUpperCase();
      var prop = doArquivo ? !!i.chaveProprio : (f === "PROPRIA" || f === "PROPRIO");
      var id = prop ? ("P|" + norm(i.descricao)) : (f + "|" + String(i.codigo));
      return id + "|" + (Math.round(Number(i.coeficiente) * 1e6) / 1e6) + "|" + r2(i.custoUnitario);
    }).sort().join("#");
  }
  function tipoGravacao(p) { return (p.tipo === "composicao" && p.insumos && p.insumos.length) ? "composicao" : "insumo"; }
  function mesmoConteudo(p, ex) {
    if (Math.abs(r2(p.custo.total) - r2(ex.custoUnitario)) >= 0.005) return false;
    if (norm(p.descricao) !== norm(ex.descricao) || chaveUn(p.unidade) !== chaveUn(ex.unidade)) return false;
    if (tipoGravacao(p) === "composicao") return assinatura(p.insumos, true) === assinatura(ex.insumos, false);
    return true;
  }
  var OPCOES = {
    nova: ["salvar", "naoSalvar"],
    identica: ["manter", "copia"],
    diferente: ["sobrescrever", "copia", "naoSalvar"],
    mesmaDescricao: ["manter", "sobrescrever", "copia", "naoSalvar"]
  };
  /* ⚠ "diferente" e "mesmaDescricao" NÃO TÊM PADRÃO. O pedido é que o sistema
     PERGUNTE; um padrão pré-marcado é o sistema decidindo pela pessoa — e
     gravar por cima de uma composição que ela já usa em outros orçamentos é
     justamente o que não se faz sem ela ver. A importação fica travada até
     cada uma dessas ter resposta. */
  var PADRAO = { nova: "salvar", identica: "manter", diferente: "", mesmaDescricao: "" };

  var PlanilhaCompleta = {
    NOME: NOME_FORMATO,
    METODO: METODO,
    PREFIXO: PREFIXO,
    OPCOES: OPCOES,

    /* A planilha tem a tabela de orçamento com a coluna BANCO e ao menos um
       item com banco preenchido? Planilha comum não tem essa coluna. */
    detectar: function (abas) {
      var achou = "";
      (abas || []).forEach(function (a) {
        if (achou || !a || !a.matriz) return;
        var tab = acharTabela(a.matriz);
        if (!tab) return;
        for (var r = tab.linha + 1; r < a.matriz.length; r++) {
          var L = a.matriz[r] || [];
          if (ehNumeroItem(limpa(L[tab.col.item]).replace(/\.$/, "")) && limpa(L[tab.col.banco]) && limpa(L[tab.col.codigo])) { achou = String(a.nome || "planilha"); break; }
        }
      });
      return { ok: !!achou, aba: achou };
    },

    analisar: function (abas, opts) {
      opts = opts || {};
      var avisos = [];
      abas = (abas || []).filter(function (a) { return a && a.matriz && a.matriz.length; });
      var sint = null, mme = null, abasComp = [];
      abas.forEach(function (a) {
        var n = norm(a.nome);
        if (ehAbaDeComposicoes(a.matriz)) { abasComp.push(a); return; }
        var tab = acharTabela(a.matriz);
        if (!tab) return;
        if (subcabecalhoMoMatEq(a.matriz, tab)) {
          if (!mme || /mo mat eq/.test(n)) mme = { aba: a, tab: tab };
          return;
        }
        if (!sint || (n === "sintetico" && norm(sint.aba.nome) !== "sintetico")) sint = { aba: a, tab: tab };
      });
      if (!sint && mme) sint = mme; // a aba MO/MAT/EQ tem as mesmas colunas de item
      if (!sint) return { ok: false, erro: "Não achei a tabela do orçamento (colunas Item, Código, Banco, Descrição, Quant. e Valor Unit)." };

      var cab = lerCabecalho(sint.aba.matriz);
      var sin = lerSintetico(sint.aba.matriz, sint.tab);
      var divisao = mme ? lerMoMatEq(mme.aba.matriz, mme.tab) : null;
      var itens = sin.linhas.filter(function (l) { return l.tipo === "item"; });
      if (!itens.length) return { ok: false, erro: "A tabela do orçamento foi achada, mas não tem nenhum item com código e banco." };

      /* blocos de composição: CPUs e Analítico repetem o mesmo bloco — fica
         o de estrutura mais completa */
      var blocos = [];
      abasComp.forEach(function (a) { blocos = blocos.concat(lerBlocos(a.matriz)); });
      var porPrincipal = {};
      blocos.forEach(function (b) {
        var p = b.principal;
        var k = p.fonte + "|" + p.codigoOrigem.replace(/\s+/g, "") + "|" + norm(p.descricao);
        var ant = porPrincipal[k];
        if (!ant || b.filhos.length > ant.filhos.length) porPrincipal[k] = b;
      });

      var proprias = {}, ordem = [];
      function registrar(tipo, reg) {
        var ch = chaveProp(tipo, reg.codigoOrigem);
        var p = proprias[ch];
        if (!p) {
          p = proprias[ch] = {
            chave: ch, tipo: tipo, codigoOrigem: String(reg.codigoOrigem || "").replace(/\s+/g, ""),
            descricao: reg.descricao, unidade: reg.unidade, custoUnitario: reg.valorUnit,
            categoria: reg.tipoLinha === "insumo" ? categoriaDe(reg) : "", tipoOrigem: reg.tipo || "",
            insumos: [], usadaEm: [], usadaEmComposicao: [], avisos: []
          };
          ordem.push(ch);
        } else if (reg.valorUnit > 0 && p.custoUnitario > 0 && Math.abs(reg.valorUnit - p.custoUnitario) >= 0.005) {
          p.avisos.push("Aparece com dois preços no arquivo (" + p.custoUnitario + " e " + reg.valorUnit + "); ficou o primeiro.");
        }
        if (!p.tipoOrigem && reg.tipo) p.tipoOrigem = reg.tipo;
        if (!p.categoria && reg.tipoLinha === "insumo") p.categoria = categoriaDe(reg);
        return p;
      }
      function paraInsumo(f, pai) {
        var tipoF = f.tipoLinha === "auxiliar" ? "composicao" : "insumo";
        var ins = {
          codigo: "", fonte: f.fonte, descricao: f.descricao, unidade: f.unidade,
          coeficiente: f.coeficiente, custoUnitario: f.valorUnit, categoria: categoriaDe(f),
          tipo: tipoF, codigoOrigem: f.codigoOrigem.replace(/\s+/g, ""), tipoOrigem: f.tipo
        };
        if (f.fonte === "PROPRIA") {
          var dep = registrar(tipoF, f);
          if (dep.usadaEmComposicao.indexOf(pai.chave) < 0) dep.usadaEmComposicao.push(pai.chave);
          ins.chaveProprio = dep.chave;
        } else {
          ins.codigo = codigoDaBase(f.fonte, f.codigoOrigem);
        }
        return ins;
      }

      /* 1) os itens do orçamento: qual própria é composição e qual é insumo
            decide o bloco do Analítico (mesmo código + mesma descrição) */
      var semEstrutura = 0;
      itens.forEach(function (it) {
        if (it.fonte !== "PROPRIA") return;
        var b = porPrincipal["PROPRIA|" + it.codigoOrigem.replace(/\s+/g, "") + "|" + norm(it.descricao)];
        var tipo = (b && b.principal.tipoLinha === "insumo") ? "insumo" : "composicao";
        if (!b) semEstrutura++;
        var p = registrar(tipo, b ? b.principal : { codigoOrigem: it.codigoOrigem, descricao: it.descricao, unidade: it.unidade, valorUnit: it.valorUnit, tipoLinha: "composicao", tipo: "" });
        if (p.usadaEm.indexOf(it.numero) < 0) p.usadaEm.push(it.numero);
        it.chaveProprio = p.chave;
      });
      /* 2) toda composição própria com bloco — inclusive as auxiliares, que
            não aparecem no Sintético — e os insumos próprios dentro delas */
      blocos.forEach(function (b) {
        var pr = b.principal;
        if (pr.fonte !== "PROPRIA" || pr.tipoLinha === "insumo") return;
        var k = "PROPRIA|" + pr.codigoOrigem.replace(/\s+/g, "") + "|" + norm(pr.descricao);
        if (porPrincipal[k] !== b) return; // bloco repetido (CPUs × Analítico)
        var p = registrar("composicao", pr);
        if (b.filhos.length > p.insumos.length) p.insumos = b.filhos.map(function (f) { return paraInsumo(f, p); });
      });
      /* 3) custo, grupo e sanidade de cada própria */
      ordem.forEach(function (ch) {
        var p = proprias[ch];
        if (p.tipo === "composicao" && p.insumos.length) {
          p.custo = custoDosInsumos(p.insumos);
          p.grupo = grupoDe(p.tipoOrigem);
          p.maoDeObra = p.insumos.some(function (i) { return catCurta(i.categoria) === "MO"; });
          if (p.custoUnitario > 0 && Math.abs(p.custo.total - p.custoUnitario) >= 0.01) {
            p.avisos.push("O custo refeito pelos insumos (" + p.custo.total.toFixed(2) + ") difere do custo da planilha (" +
              Number(p.custoUnitario).toFixed(2) + "); o orçamento usa o da planilha, a composição gravada usa o dos insumos.");
          }
        } else {
          if (p.tipo === "composicao") {
            p.semEstrutura = true;
            p.avisos.push("A estrutura desta composição não veio no arquivo (faltam as abas CPUs/Analítico, ou ela não está lá): só dá para guardar como insumo de preço fechado.");
          }
          var cat = catCurta(p.categoria || "MATERIAL"), v = Number(p.custoUnitario) || 0;
          p.custo = { total: v, mo: cat === "MO" ? v : 0, mat: cat === "MAT" ? v : 0, eq: cat === "EQ" ? v : 0 };
        }
      });
      if (semEstrutura) {
        avisos.push(semEstrutura + " item(ns) próprio(s) do orçamento não têm a composição no arquivo — entram com o preço fechado da planilha.");
      }

      /* 4) MO/MAT/EQ de cada item: a aba de divisão traz o UNITÁRIO COM BDI;
            o fator devolve a proporção ao custo sem BDI */
      var semDivisao = 0;
      itens.forEach(function (it) {
        var d = divisao && divisao[it.numero];
        /* ⚠ O FATOR É SOBRE A SOMA DAS TRÊS, NÃO SOBRE O "Total" DA ABA. O
           arquivo arredonda cada parcela sozinha (EQ 21,1255 com total 21,13),
           e o fator pelo total deixava MO+MAT+EQ até R$ 0,004 fora do custo do
           item no arquivo real — a curva e o relatório SINAPI desbatem disso. */
        var soma = d ? (d.mo + d.eq + d.mat) : 0;
        if (d && soma > 0) {
          var f = it.valorUnit / soma;
          it.custoMO = d.mo * f; it.custoMAT = d.mat * f; it.custoEQ = d.eq * f;
        } else if (it.chaveProprio && proprias[it.chaveProprio].custo && proprias[it.chaveProprio].custo.total > 0) {
          var c = proprias[it.chaveProprio].custo, f2 = it.valorUnit / c.total;
          it.custoMO = c.mo * f2; it.custoMAT = c.mat * f2; it.custoEQ = c.eq * f2;
        } else { it.custoMO = 0; it.custoMAT = 0; it.custoEQ = 0; semDivisao++; }
      });
      if (!divisao) avisos.push("A aba \"Sintético c MO MAT EQ\" não veio: a divisão mão de obra/material/equipamento dos itens de banco oficial fica zerada (o custo total não muda).");

      var etapas = montarArvore(sin.linhas, avisos);
      var porFonte = {};
      itens.forEach(function (it) { var f = it.fonte || "?"; porFonte[f] = (porFonte[f] || 0) + 1; });
      var lista = ordem.map(function (ch) { return proprias[ch]; }).sort(function (a, b) {
        if (a.tipo !== b.tipo) return a.tipo === "composicao" ? -1 : 1;
        return a.codigoOrigem < b.codigoOrigem ? -1 : (a.codigoOrigem > b.codigoOrigem ? 1 : 0);
      });
      return {
        ok: true, formato: NOME_FORMATO, arquivo: String(opts.arquivo || ""),
        cabecalho: cab, etapas: etapas, itens: itens, proprias: lista, totais: sin.totais,
        abas: { sintetico: sint.aba.nome, divisao: mme ? mme.aba.nome : "", composicoes: abasComp.map(function (a) { return a.nome; }) },
        contagem: {
          etapas: etapas.length,
          subetapas: etapas.reduce(function (s, e) { return s + e.subetapas.filter(function (x) { return x.nItens > 0; }).length; }, 0),
          itens: itens.length, porFonte: porFonte,
          composicoesProprias: lista.filter(function (p) { return p.tipo === "composicao"; }).length,
          insumosProprios: lista.filter(function (p) { return p.tipo === "insumo"; }).length
        },
        avisos: avisos
      };
    },

    /* O que cada própria do arquivo é diante do banco do usuário.
       ctx.todos = registros da base PROPRIA (lidos do disco, por quem chama). */
    classificar: function (plano, ctx) {
      ctx = ctx || {};
      var todos = U().arr(ctx.todos), porCodigo = {};
      todos.forEach(function (d) { if (d && d.codigo != null) porCodigo[String(d.codigo).trim().toLowerCase()] = d; });
      var reservados = {};
      function resumo(d) {
        return { codigo: String(d.codigo), descricao: d.descricao || "", unidade: d.unidade || "",
          custoUnitario: Number(d.custoUnitario) || 0, criadoPor: d.criadoPor || "", criadoEm: d.criadoEm || "",
          tipoItem: String(d.tipoItem || "composicao") };
      }
      U().arr(plano && plano.proprias).forEach(function (p) {
        var tg = tipoGravacao(p);
        p.alvo = PREFIXO[p.tipo] + p.codigoOrigem;
        p.existente = null; p.status = "nova"; p.mesmoCodigo = false;
        var ex = porCodigo[p.alvo.toLowerCase()];
        if (ex) {
          p.existente = resumo(ex); p.mesmoCodigo = true;
          p.status = mesmoConteudo(p, ex) ? "identica" : "diferente";
        } else {
          var par = todos.filter(function (d) {
            var t = String(d.tipoItem || "composicao") === "insumo" ? "insumo" : "composicao";
            return d && t === tg && norm(d.descricao) === norm(p.descricao) && chaveUn(d.unidade) === chaveUn(p.unidade);
          })[0];
          if (par) { p.existente = resumo(par); p.status = mesmoConteudo(p, par) ? "identica" : "mesmaDescricao"; }
        }
        /* a cópia de quem colide no código ganha prefixo 2-, 3-…; a de quem só
           se parece na descrição usa o próprio código do arquivo, que está livre */
        if (p.mesmoCodigo) {
          var n = 2, c;
          do { c = n + "-" + p.alvo; n++; } while ((porCodigo[c.toLowerCase()] || reservados[c.toLowerCase()]) && n < 1000);
          p.codigoCopia = c;
        } else p.codigoCopia = p.alvo;
        reservados[p.codigoCopia.toLowerCase()] = 1;
        p.opcoes = OPCOES[p.status].slice();
        p.padrao = PADRAO[p.status];
      });
      return plano;
    },

    rotuloAcao: function (p, acao) {
      /* ⚠ CURTO DE PROPÓSITO: o rótulo mora num <select> estreito, e a parte
         que importa é o CÓDIGO — "Salvar no meu banco como COMP-000…" saía
         cortado bem nele (visto na foto da e2e). */
      if (acao === "salvar") return "Salvar como " + p.alvo;
      if (acao === "naoSalvar") return "Não salvar (fica só neste orçamento)";
      if (acao === "manter") return "Usar a que já existe (" + (p.existente ? p.existente.codigo : "") + ")";
      if (acao === "sobrescrever") return "Gravar por cima de " + (p.existente ? p.existente.codigo : "");
      if (acao === "copia") return "Salvar como cópia: " + p.codigoCopia;
      return acao;
    },
    rotuloStatus: function (p) {
      if (p.status === "nova") return "Nova — não está no seu banco";
      if (p.status === "identica") return "Já salva, igual (" + p.existente.codigo + ")";
      if (p.status === "diferente") return "Já salva com OUTRO conteúdo (" + p.existente.codigo + ")";
      if (p.status === "mesmaDescricao") return "Parecida: mesma descrição em " + p.existente.codigo;
      return p.status;
    },

    /* Decisões → o que gravar e com que código cada item do orçamento fica.
       decisoes: { chave: acao }. meta: { agora, autor, arquivo }. */
    planejarGravacao: function (plano, decisoes, meta) {
      meta = meta || {}; decisoes = decisoes || {};
      var lista = U().arr(plano && plano.proprias), porChave = {}, acao = {}, pendentes = [], avisos = [];
      lista.forEach(function (p) {
        porChave[p.chave] = p;
        var a = Object.prototype.hasOwnProperty.call(decisoes, p.chave) ? decisoes[p.chave] : p.padrao;
        if (!a || U().arr(p.opcoes).indexOf(a) < 0) { pendentes.push(p); a = ""; }
        acao[p.chave] = a;
      });
      if (pendentes.length) {
        return { ok: false, pendentes: pendentes,
          erro: "Falta decidir " + pendentes.length + " item(ns) próprio(s) que já existem no seu banco: " +
            pendentes.slice(0, 4).map(function (p) { return p.alvo; }).join(", ") + (pendentes.length > 4 ? "…" : "") + "." };
      }
      /* ⚠ COMPOSIÇÃO GRAVADA PUXA O QUE ELA USA. Composição salva apontando
         para insumo próprio que não foi salvo é composição que não abre para
         edição ("código não existe nas bases ativas") e não reprecifica.
         Em vez de recusar, o insumo entra — e a pessoa fica sabendo. */
      function grava(a) { return a === "salvar" || a === "sobrescrever" || a === "copia"; }
      var mudou = true, voltas = 0;
      while (mudou && voltas++ < 50) {
        mudou = false;
        lista.forEach(function (p) {
          if (!grava(acao[p.chave]) || tipoGravacao(p) !== "composicao") return;
          p.insumos.forEach(function (i) {
            var d = i.chaveProprio && porChave[i.chaveProprio];
            if (!d || acao[d.chave] !== "naoSalvar") return;
            acao[d.chave] = d.status === "nova" ? "salvar" : (d.status === "identica" ? "manter" : "copia");
            avisos.push(d.alvo + " (" + d.descricao + ") entrou mesmo desmarcado: a composição " + p.alvo + " usa este item e não se sustenta sem ele.");
            mudou = true;
          });
        });
      }
      var cod = {};
      lista.forEach(function (p) {
        var a = acao[p.chave];
        cod[p.chave] = a === "salvar" ? p.alvo
          : ((a === "manter" || a === "sobrescrever") ? (p.existente ? p.existente.codigo : p.alvo)
          : (a === "copia" ? p.codigoCopia : null));
      });
      var agora = meta.agora || new Date().toISOString();
      var gravar = [], resumo = { novas: 0, sobrescritas: 0, copias: 0, mantidas: 0, ignoradas: 0 };
      lista.forEach(function (p) {
        var a = acao[p.chave];
        if (a === "manter") { resumo.mantidas++; return; }
        if (a === "naoSalvar") { resumo.ignoradas++; return; }
        /* ⚠ POR CIMA PRESERVA O AUTOR E A DATA DE CRIAÇÃO. O merge da nuvem
           (propriasync.js) lê "autores diferentes + conteúdo diferente" como
           colisão e exila a versão nova num código novo — foi assim que
           nasceram os 65 clones de uma mesma composição. */
        var ex = a === "sobrescrever" ? p.existente : null;
        var rec = {
          codigo: cod[p.chave], codigoSecundario: p.codigoOrigem, descricao: p.descricao, unidade: p.unidade,
          origem: "PROPRIA",
          criadoEm: (ex && ex.criadoEm) || agora, atualizadoEm: agora,
          criadoPor: (ex && ex.criadoPor) || meta.autor || "",
          importadoDe: { formato: NOME_FORMATO, arquivo: meta.arquivo || plano.arquivo || "", codigo: p.codigoOrigem, em: agora }
        };
        if (tipoGravacao(p) === "insumo") {
          var cat = catCurta(p.categoria || "MATERIAL"), v = Number(p.custo.total) || 0;
          if (p.semEstrutura && (p.custo.mo || p.custo.eq)) cat = p.custo.mo >= p.custo.eq ? "MO" : "EQ";
          rec.tipoItem = "insumo"; rec.categoria = cat; rec.custoUnitario = v;
          rec.custoMO = cat === "MO" ? v : 0; rec.custoMAT = cat === "MAT" ? v : 0; rec.custoEQ = cat === "EQ" ? v : 0;
        } else {
          rec.tipoItem = "composicao"; rec.grupo = p.grupo || "OUTROS"; rec.metodo = METODO; rec.modeloRef = "SINAPI";
          rec.maoDeObra = !!p.maoDeObra; rec.referenciaCodigo = "";
          rec.observacao = "Importada de uma " + NOME_FORMATO.toLowerCase() + " (código " + p.codigoOrigem + " no arquivo).";
          rec.custoUnitario = p.custo.total; rec.custoMO = p.custo.mo; rec.custoMAT = p.custo.mat; rec.custoEQ = p.custo.eq;
          rec.insumos = p.insumos.map(function (i) {
            return { codigo: i.chaveProprio ? cod[i.chaveProprio] : i.codigo,
              fonte: i.chaveProprio ? "PROPRIA" : i.fonte, descricao: i.descricao, unidade: i.unidade,
              coeficiente: i.coeficiente, custoUnitario: i.custoUnitario, categoria: i.categoria, tipo: i.tipo };
          });
        }
        gravar.push(rec);
        resumo[a === "salvar" ? "novas" : (a === "sobrescrever" ? "sobrescritas" : "copias")]++;
      });
      return { ok: true, gravar: gravar, codigoPorChave: cod, acao: acao, avisos: avisos, resumo: resumo };
    },

    /* O orçamento, pelo MESMO motor dos outros (Orcamento.novo/addEtapa/
       addSubEtapa/addItem). opts: { codigoPorChave, nome, cliente, obra, arquivo } */
    montarOrcamento: function (plano, opts) {
      opts = opts || {};
      var O = global.Orcamento, B = global.Bdi, cab = plano.cabecalho || {}, cod = opts.codigoPorChave || {};
      var orc = O.novo({ nome: opts.nome || cab.obra || "Orçamento importado", cliente: opts.cliente || "", obra: opts.obra != null ? opts.obra : (cab.obra || "") });
      if (cab.uf) orc.uf = cab.uf;
      if (cab.competencia) orc.competenciaSinapi = cab.competencia;
      O.garantirConfig(orc);
      if (typeof cab.desonerado === "boolean") {
        orc.desonerado = cab.desonerado;
        orc.config.encargos.tipo = cab.desonerado ? "desonerado" : "nao_desonerado";
      }
      orc.config.arredondamento = METODO;
      orc.config.bdiIncidencia = "unitario";
      if (cab.bdi != null && isFinite(cab.bdi)) {
        /* só o percentual vem no arquivo: os campos da aba BDI são os que o
           PRODUZEM (paramsParaPercentual), senão a aba mostraria 27,03 % por
           baixo de um orçamento de 15 % */
        var params = (B && B.paramsParaPercentual) ? B.paramsParaPercentual(cab.bdi) : null;
        orc.bdi = { modeloId: "custom", params: params, percentual: cab.bdi };
      }
      U().arr(plano.etapas).forEach(function (et) {
        O.addEtapa(orc, et.nome || "Etapa");
        var e = orc.etapas[orc.etapas.length - 1], subId = {}, vistos = {};
        et.subetapas.forEach(function (s) {
          if (!s.nItens) return; // grupo que só contém grupos não vira linha
          var sub = O.addSubEtapa(orc, e.id, s.nome, false);
          if (sub) subId[s.numero] = sub.id;
        });
        et.itens.forEach(function (it) {
          var codigo, bf;
          if (it.fonte === "PROPRIA") {
            var cf = cod[it.chaveProprio];
            /* salva no banco → aponta para ela; não salva → item próprio solto,
               com o código do arquivo (rastreável, mas sem estrutura aqui) */
            if (cf) { codigo = cf; bf = "PROPRIA"; } else { codigo = it.codigoOrigem; bf = "PROPRIO"; }
          } else { codigo = it.codigo; bf = it.fonte || null; }
          var item = { codigo: codigo, baseFonte: bf, descricao: it.descricao, unidade: it.unidade,
            custoUnitario: it.valorUnit, custoMO: it.custoMO, custoMAT: it.custoMAT, custoEQ: it.custoEQ };
          if (typeof cab.desonerado === "boolean" && it.fonte === "SINAPI") item.desonerado = cab.desonerado;
          e.itens.forEach(function (x) { vistos[x.id] = 1; });
          O.addItem(orc, e.id, item, it.quantidade, subId[it.subNumero] || "");
          /* o número do arquivo viaja com o item: a numeração do app pode ser
             outra (ver montarArvore), e conferir contra o PDF de origem exige ele */
          e.itens.forEach(function (x) { if (!vistos[x.id]) { x.numeroOrigem = it.numero; vistos[x.id] = 1; } });
        });
      });
      orc.importacao = {
        formato: NOME_FORMATO, arquivo: opts.arquivo || plano.arquivo || "", em: new Date().toISOString(),
        bancos: cab.bancosTexto || "", encargos: cab.encargosTexto || "", totaisArquivo: plano.totais || {}
      };
      return orc;
    },

    /* O total que o app calcula bate com o que o arquivo diz? */
    conferirTotais: function (orc, plano) {
      var r = global.Orcamento.calcular(orc), t = (plano && plano.totais) || {};
      var out = { custoDireto: r.custoDireto, precoVenda: r.precoVenda, arquivo: t, difCusto: null, difVenda: null };
      if (t.semBdi != null) out.difCusto = r2(r.custoDireto - t.semBdi);
      if (t.geral != null) out.difVenda = r2(r.precoVenda - t.geral);
      out.bate = out.difVenda === 0 && (out.difCusto == null || out.difCusto === 0);
      out.conferivel = t.geral != null;
      return out;
    },

    // internos expostos para o teste
    _txt: txt, _norm: norm, _codigoDaBase: codigoDaBase, _fonteDoBanco: fonteDoBanco,
    _lerBancos: lerBancos, _categoriaDe: categoriaDe
  };

  global.PlanilhaCompleta = PlanilhaCompleta;
  if (typeof module !== "undefined" && module.exports) module.exports = PlanilhaCompleta;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
