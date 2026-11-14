/* =====================================================================
 * cplpropreparo.js — CPLPRO, leva F: «MONTAR O PROCESSO A PARTIR DA PASTA» (motor PURO).
 *
 * Pedido do Rogério (10/11/2026): «deixa uma pasta com os documentos; quando subir a pasta no sistema, ele reconhece
 * tudo, pega as informações e vai preenchendo até o último passo; o usuário coloca pouquinha coisa».
 *
 * PURO: sem DOM, sem Store, sem rede, sem localStorage. A tela (js/cplproui.js) lê os arquivos (SHA-256, texto do .docx,
 * matriz do .xlsx), cria o orçamento no OrçaPRO e chama este motor; aqui só mora o que é DECISÃO testável em Node.
 * Duas fases: `analisar(entrada)` lê o que a pasta diz; `aplicar(p, analise, ctx)` grava no processo.
 *
 * REGRAS QUE NÃO CEDEM
 *  - NUNCA MARCA «CONFERI». O «Conferi» é da pessoa (js/cplprofluxo.js). Este motor só PREENCHE, com o selo
 *    «sugerido pelo sistema — confira». Se mudar algo de um passo que a pessoa já conferiu, solta o «Conferi» daquele passo
 *    (o que foi conferido deixou de ser o que está na tela) — o mesmo que a tela faz ao editar.
 *  - NADA DO QUE A PESSOA EDITOU É SOBRESCRITO. Cada campo que o sistema escreve é gravado em `p.preparo.campos[caminho]`
 *    com o valor escrito. Na próxima rodada: campo vazio ou ainda IGUAL ao que o sistema escreveu → pode atualizar (veio do
 *    arquivo); diferente → a pessoa mexeu → fica como está («mantido»). Sistema × pessoa se decide por essa igualdade, sem
 *    depender de a tela lembrar de marcar cada edição.
 *  - IDEMPOTENTE. Rodar 2x com a mesma pasta = o mesmo processo (a marca de data só anda quando algo mudou).
 *  - O QUE A LEI RESERVA AO ÓRGÃO NÃO É ACEITO SOZINHO: sigiloso, modalidade, critério, regime, garantia, visita, consórcio,
 *    subcontratação, amostra, ME/EPP e o índice do reajuste ficam SEM valor, com a sugestão pré-marcada e o «Por quê?».
 *    Só o que é CONTA entra com valor: parcelas de relevância (4% do total), exequibilidade, data-base do reajuste, teto de
 *    aditivos e prazo de recurso — e mesmo esses com o selo.
 *  - NUNCA INVENTA: sem o dado no arquivo, o campo fica vazio (lacuna) e entra na lista «faltam K decisões suas».
 * ES5 puro.
 * ===================================================================== */
(function (global) {
  "use strict";

  var Cplpro = global.Cplpro, R = global.CplproRegras, Fluxo = global.CplproFluxo, Docs = global.CplproDocs, Importador = global.Importador;
  if (typeof require === "function" && typeof module !== "undefined") {
    if (!R) R = require("./cplproregras.js");
    if (!Cplpro) Cplpro = require("./cplpro.js");
    if (!Fluxo) Fluxo = require("./cplprofluxo.js");
    if (!global.CplproOrgao) { try { global.CplproOrgao = require("./cplproorgao.js"); } catch (eO) {} }
    if (!Docs) { try { Docs = require("./cplprodocs.js"); } catch (e) { Docs = null; } }
    if (!Importador) { try { Importador = require("./importador.js"); } catch (e2) { Importador = null; } }
  }

  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function vazio(v) { return v === null || v === undefined || (typeof v === "string" && v.replace(/\s/g, "") === "") || (Object.prototype.toString.call(v) === "[object Array]" && v.length === 0); }
  function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
  function semValor(v) { return v === null || v === undefined || (typeof v === "string" && v.replace(/\s/g, "") === ""); }
  function igual(a, b) { return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b); }
  function trim(s) { return String(s === null || s === undefined ? "" : s).replace(/^\s+|\s+$/g, ""); }
  function norm(s) {
    return String(s === null || s === undefined ? "" : s).toLowerCase()
      .replace(/[áàâãä]/g, "a").replace(/[éèêë]/g, "e").replace(/[íìîï]/g, "i").replace(/[óòôõö]/g, "o").replace(/[úùûü]/g, "u").replace(/ç/g, "c")
      .replace(/\s+/g, " ").replace(/^ | $/g, "");
  }
  function numBR(n, c) {
    var s = Number(n).toFixed(c), p = s.split("."), i = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return i + (p[1] ? "," + p[1] : "");
  }
  function numCel(v) {
    if (typeof v === "number" && isFinite(v)) return v;
    if (v && typeof v === "object" && v.result !== undefined) return numCel(v.result);
    var s = trim(v).replace(/%$/, "").replace(/\s/g, "");
    if (!s) return null;
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(",", ".");
    var n = Number(s);
    return isFinite(n) ? n : null;
  }
  function textoCel(v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "object") {
      if (v.richText) return v.richText.map(function (x) { return x.text; }).join("");
      if (v.result !== undefined) return textoCel(v.result);
      if (v.text !== undefined) return String(v.text);
      return "";
    }
    return String(v);
  }

  /* ------------------------------------------------------------------ *
   * MEMORIAL DESCRITIVO → seções
   * Título de seção = linha curta TODA EM MAIÚSCULAS (numerada ou não). O texto vem do .docx (a tela extrai) ou do PDF.
   * ------------------------------------------------------------------ */
  function ehTitulo(l) {
    var t = trim(l);
    if (t.length < 4 || t.length > 90) return null;
    if (t !== t.toUpperCase() || !/[A-ZÀ-Ý]{3}/.test(t) || /[.;:]$/.test(t)) return null;
    return trim(t.replace(/^\d+(?:\.\d+)*[.)]?\s+/, ""));
  }
  var CHAVES_SECAO = [
    ["identificacao", "identificacao"], ["objeto", "objeto"], ["justificativa", "justificativa"], ["solucao", "solucao"],
    ["requisitos", "requisitos"], ["especificac", "especificacoes"], ["medicao", "medicaoRecebimento"], ["recebimento", "medicaoRecebimento"], ["prazo", "prazo"]
  ];
  function chaveDaSecao(tituloNorm) {
    for (var i = 0; i < CHAVES_SECAO.length; i++) if (tituloNorm.indexOf(CHAVES_SECAO[i][0]) >= 0) return CHAVES_SECAO[i][1];
    return null;
  }
  function lerMemorial(texto) {
    var linhas = String(texto === null || texto === undefined ? "" : texto).split(/\r?\n/).map(trim).filter(function (l) { return l !== ""; });
    var secoes = {}, atual = null, todas = [];
    linhas.forEach(function (l) {
      var t = ehTitulo(l);
      if (t) { var k = chaveDaSecao(norm(t)); atual = k && !secoes[k] ? (secoes[k] = []) : null; return; }
      todas.push(l);
      if (atual) atual.push(l);
    });
    function juntar(k) { return secoes[k] && secoes[k].length ? secoes[k].join("\n") : null; }
    var tudo = todas.join("\n"), m;
    var out = { objeto: juntar("objeto"), justificativa: juntar("justificativa"), solucao: juntar("solucao"), requisitos: juntar("requisitos"),
      especificacoes: juntar("especificacoes"), prazo: juntar("prazo"), identificacao: juntar("identificacao"), medicao: null, recebimento: null,
      secretaria: null, municipio: null, uf: null, secoesAchadas: Object.keys(secoes) };
    arr(secoes.medicaoRecebimento).forEach(function (l) {
      var a = /^medi[cç][aã]o\s*:\s*(.+)$/i.exec(l), b = /^recebimento\s*:\s*(.+)$/i.exec(l);
      if (a) out.medicao = a[1]; else if (b) out.recebimento = b[1];
    });
    if (out.medicao === null && out.recebimento === null && secoes.medicaoRecebimento) out.medicao = secoes.medicaoRecebimento.join("\n");
    m = /Secretaria requisitante\s*:\s*([^(.\n]+)/i.exec(tudo);
    if (m) out.secretaria = trim(m[1]);
    else {
      m = /Secretaria\s+(?:Municipal\s+)?d[aeo]s?\s+[A-Za-zÀ-ú]+(?:\s+(?:e\s+|de\s+)?[A-ZÀ-Ú][A-Za-zÀ-ú]+)*/.exec(tudo);
      if (m) out.secretaria = trim(m[0]);
    }
    m = /Munic[íi]pio(?:\s+de|\s*:)\s+([A-ZÀ-Ú][A-Za-zÀ-ú ]+?)\s*\/\s*([A-Z]{2})\b/.exec(tudo);
    if (m) { out.municipio = trim(m[1]); out.uf = m[2]; }
    /* leva L: o que a obra e o processo também pedem e o memorial costuma trazer */
    out.nomeObra = null; out.endereco = null; out.areaConstruida = null; out.areaTerreno = null; out.prazoMeses = null;
    out.recProvisorioDias = null; out.recDefinitivoDias = null; out.responsavelTecnico = null;
    m = /^Obra\s*:\s*(.+)$/im.exec(tudo);
    if (m) out.nomeObra = nomeLimpo(m[1]);
    m = /[Tt]erreno\s+de\s+([\d.]+(?:,\d+)?)\s*m[²2]/.exec(tudo);
    if (m) out.areaTerreno = numCel(m[1]);
    m = /[ÁA]rea\s+a\s+construir\s*:\s*([\d.]+(?:,\d+)?)\s*m[²2]/i.exec(tudo) || /([\d.]+(?:,\d+)?)\s*m[²2]\s+de\s+[áa]rea\s+constru[íi]da/i.exec(tudo);
    if (m) out.areaConstruida = numCel(m[1]);
    m = /\bna\s+((?:Rua|Avenida|Av\.|Travessa|Alameda|Estrada|Rodovia|Pra[çc]a|Via)\s[^()\n]*?)\s*(?:\(|\.\s|\.$|$)/m.exec(tudo);
    if (m) out.endereco = trim(m[1]);
    m = /Prazo\s+de\s+execu[çc][ãa]o\s*:\s*(\d+)/i.exec(tudo);
    if (m) out.prazoMeses = Number(m[1]);
    var recTxt = (out.recebimento || out.medicao || "");
    m = /provis[óo]rio[^.;]*?(\d+)\s*dias/i.exec(recTxt); if (m) out.recProvisorioDias = Number(m[1]);
    m = /definitivo[^.;]*?(\d+)\s*dias/i.exec(recTxt); if (m) out.recDefinitivoDias = Number(m[1]);
    m = /Respons[áa]vel\s+t[ée]cnico[^:\n]*:\s*([^.\n(]+)/i.exec(tudo);
    if (m) out.responsavelTecnico = trim(m[1]);
    out.frases = frasesDe(tudo);
    /* e-mail do órgão para impugnações: SÓ se o texto o liga a impugnação/esclarecimento na mesma frase (e-mail solto de projetista não é do órgão) */
    out.emailImpugnacao = null;
    arr(out.frases).forEach(function (f) { var em = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}/.exec(f); if (!out.emailImpugnacao && em && /impugna|esclarecimento/i.test(f)) out.emailImpugnacao = em[0]; });
    return out;
  }
  /* «Creche Municipal Tipo B — exemplo» → «Creche Municipal Tipo B»: o carimbo de demonstração não é parte do nome */
  function nomeLimpo(x) { return trim(String(x).replace(/\s*[—–-]\s*(?:exemplo|fict[íi]cio)\s*$/i, "").replace(/\s*\((?:fict[íi]cio|exemplo)\)\s*$/i, "")); }
  function frasesDe(txt) { return String(txt || "").split(/\n+|\.\s+/).map(trim).filter(function (f) { return f.length > 20; }); }
  function frasesQue(frases, re, max) { return arr(frases).filter(function (f) { return re.test(f); }).slice(0, max || 2); }
  function pontuar(f) { return /[.!?]$/.test(f) ? f : f + "."; }

  /* ------------------------------------------------------------------ *
   * BASE DE PREÇOS DECLARADA NA PLANILHA («Base de preços: SINAPI MG, competência 06/2026 (não desonerada)») — leva L
   * ------------------------------------------------------------------ */
  function lerBasePlanilha(matriz) {
    var m = arr(matriz), i, j, linha;
    for (i = 0; i < m.length && i < 15; i++) {
      linha = arr(m[i]).map(textoCel).join(" ");
      var b = /base\s+de\s+pre[çc]os?\s*:?\s*(SINAPI|SICRO|SIURB|SETOP|SUDECAP|ORSE|CPOS|SEINFRA|AGETOP|SCO)\b[^,;.\n]*/i.exec(linha);
      if (!b) continue;
      var uf = /\b(?:SINAPI|SICRO|SIURB|SETOP|SUDECAP|ORSE|CPOS|SEINFRA|AGETOP|SCO)[\s\-\/]+([A-Z]{2})\b/.exec(linha.replace(/\bde\b/gi, "").replace(/\s+/g, " "));
      var cp = /(\d{2})\s*\/\s*(\d{4})/.exec(linha);
      var rg = /n[ãa]o\s+desoner|\bonerad/i.test(linha) ? "onerado" : (/desoner/i.test(linha) ? "desonerado" : "");
      return { base: b[1].toUpperCase(), uf: uf ? uf[1] : null, competencia: cp ? cp[2] + "-" + cp[1] : null, regime: rg, linha: i + 1, texto: trim(linha) };
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * ART/RRT (texto do PDF) — número só entra se for um número de verdade (nunca o «[EXEMPLO — sem número real]»)
   * ------------------------------------------------------------------ */
  function lerArt(texto) {
    var t = String(texto || ""), out = { numero: null, profissional: null, registro: null, contratante: null, placeholder: false };
    function pega(re) { var r = re.exec(t); return r ? trim(r[1]) : null; }
    var num = pega(/N[º°o]\s*da\s*(?:ART|RRT|TRT)\s*\n?\s*([^\n]+)/i);
    if (num) { if (/[\[\]]|exemplo|sem n[úu]mero/i.test(num) || num.replace(/\D/g, "").length < 5) out.placeholder = true; else out.numero = num; }
    out.profissional = pega(/Profissional\s*\n\s*([^\n]+)/i);
    var reg = pega(/Registro\s+profissional\s*\n\s*([^\n]+)/i);
    out.registro = reg && !/[\[\]]|exemplo|n[ãa]o existe/i.test(reg) ? reg : null;
    out.contratante = pega(/Contratante\s*\n\s*([^\n]+)/i);
    return out;
  }

  /* ------------------------------------------------------------------ *
   * PLANILHA EM PDF (leva L + M) — o contrato de js/planilhapdf.js vira a MESMA estrutura da planilha .xlsx,
   * com origem {arquivo, pagina, linha}. Item sem etapa explícita cai na etapa cujo número é prefixo do dele.
   * ------------------------------------------------------------------ */
  function lerPlanilhaPdf(res) {
    if (!res || !arr(res.itens).length) return { erro: "A leitura do PDF não achou itens de planilha." };
    var etapasTit = arr(res.etapas), grupos = [], porNome = {}, itens = [];
    function grupoDe(it) {
      var nome = trim(it.etapa || "");
      if (!nome) {
        var num = trim(it.item), melhor = null;
        etapasTit.forEach(function (e) { var en = trim(e.item); if (en && (num === en || num.indexOf(en + ".") === 0) && (!melhor || en.length > trim(melhor.item).length)) melhor = e; });
        nome = melhor ? trim(melhor.titulo) : "Itens da planilha";
      }
      if (!porNome[nome]) { porNome[nome] = { nome: nome, itens: [] }; grupos.push(porNome[nome]); }
      return porNome[nome];
    }
    arr(res.itens).forEach(function (it) {
      var g = grupoDe(it), pu = (it.precoUnit === null || it.precoUnit === undefined) ? null : it.precoUnit;
      var linhaItem = { numero: it.item || null, codigo: trim(it.codigo), fonte: it.fonte || null, descricao: it.descricao, unidade: it.unidade, quantidade: it.quantidade, custoUnitario: pu };
      g.itens.push(linhaItem);
      itens.push({ numero: linhaItem.numero, codigo: linhaItem.codigo, descricao: it.descricao, unidade: it.unidade, quantidade: it.quantidade, custoUnitario: pu, etapa: g.nome,
        etapaIdx: grupos.indexOf(g), linha: it.linha || null, pagina: it.pagina || null });
    });
    var cf = res.conferencia || {};
    return { etapas: grupos, itens: itens, confianca: cf.ok === true ? "alta" : "baixa", avisos: [], resumo: null, deOnde: "pdf",
      leituraPdf: { nota: typeof cf.nota === "number" ? cf.nota : null, ok: cf.ok === true, motivos: arr(cf.motivos).slice(), totalImpresso: res.totalImpresso === undefined ? null : res.totalImpresso } };
  }

  /* ------------------------------------------------------------------ *
   * PLANILHA ORÇAMENTÁRIA → itens com origem {arquivo, linha}
   * O importador de planilha do OrçaPRO (js/importador.js) faz a leitura; aqui só se acha a LINHA de cada item.
   * ------------------------------------------------------------------ */
  function lerPlanilha(matriz) {
    if (!Importador) return { erro: "O importador de planilha não está carregado." };
    var res = Importador.analisar(matriz);
    if (!res || res.erro || !arr(res.etapas).length) return { erro: "Não reconheci uma planilha de orçamento neste arquivo (sem cabeçalho de itens)." };
    var m = arr(matriz), ptr = 0, itens = [];
    function linhaDoItem(it) {
      var d = norm(it.descricao).substring(0, 40), cod = trim(it.codigo), num = trim(it.numero);
      for (var i = ptr; i < m.length; i++) {
        var cels = arr(m[i]).map(function (c) { return norm(textoCel(c)); });
        var temDesc = d !== "" && cels.join(" | ").indexOf(d) >= 0;
        var temCod = cod !== "" && cels.indexOf(norm(cod)) >= 0;
        var temNum = num !== "" && cels.indexOf(norm(num)) >= 0;
        if (temDesc && (temCod || temNum || cod === "")) { ptr = i + 1; return i + 1; }
      }
      return null;
    }
    res.etapas.forEach(function (et, ei) {
      arr(et.itens).forEach(function (it) {
        itens.push({ numero: it.numero || null, codigo: trim(it.codigo), descricao: it.descricao, unidade: it.unidade, quantidade: it.quantidade,
          custoUnitario: it.custoUnitario, etapa: et.nome, etapaIdx: ei, linha: linhaDoItem(it) });
      });
    });
    return { etapas: res.etapas, itens: itens, confianca: res.confianca, avisos: arr(res.avisos), resumo: res.resumo };
  }

  /* ------------------------------------------------------------------ *
   * CRONOGRAMA → percentual por etapa e mês
   * ------------------------------------------------------------------ */
  function lerCronograma(matriz) {
    var m = arr(matriz), hi = -1, cols = [], i, j;
    for (i = 0; i < m.length && i < 40; i++) {
      var r = arr(m[i]), c = [];
      for (j = 0; j < r.length; j++) if (/^m[eê]s\s*\d+/i.test(trim(textoCel(r[j])))) c.push(j);
      if (c.length >= 2) { hi = i; cols = c; break; }
    }
    if (hi < 0) return { erro: "Não achei as colunas «Mês 1, Mês 2…» no cronograma." };
    var etapas = [], avisos = [];
    for (i = hi + 1; i < m.length; i++) {
      var row = arr(m[i]), nome = trim(textoCel(row[0]));
      if (!nome) { if (etapas.length) break; continue; }
      if (/^total/i.test(nome)) continue;
      var pct = cols.map(function (cj) { var n = numCel(row[cj]); return n === null ? 0 : n; });
      var soma = pct.reduce(function (a, b) { return a + b; }, 0);
      if (Math.abs(soma - 100) > 0.001) avisos.push("Etapa «" + nome + "»: os percentuais somam " + numBR(soma, 2) + "%, não 100%.");
      etapas.push({ nome: nome, pct: pct });
    }
    if (!etapas.length) return { erro: "O cronograma não tem nenhuma etapa abaixo do cabeçalho." };
    return { meses: cols.length, etapas: etapas, avisos: avisos };
  }

  /* ------------------------------------------------------------------ *
   * FASE 1 — analisar: o que a pasta diz (nada é gravado)
   * entrada.arquivos: [{ nome, sha, ext, origem, texto (docx/pdf), matriz (xlsx/csv) }]
   * ------------------------------------------------------------------ */
  function analisar(entrada) {
    var arqs = arr(entrada && entrada.arquivos).map(function (a) {
      var c = Cplpro.classificarArquivo({ nome: a.nome, ext: a.ext, texto: a.texto });
      return { nome: a.nome, sha: a.sha || null, ext: c.ext, tipo: c.tipo, origem: a.origem || null, data: a.data || null, texto: a.texto || null, matriz: a.matriz || null, planilhaPdf: a.planilhaPdf || null };
    });
    var an = { arquivos: arqs, memorial: null, planilha: null, cronograma: null, art: null, baseDeclarada: null, oferta: null, avisos: [], lacunas: [] };
    function primeiro(tipo, campo) { return arqs.filter(function (a) { return a.tipo === tipo && !vazio(a[campo]); })[0] || null; }
    var mem = primeiro("memorial_descritivo", "texto"), pla = primeiro("orcamento_planilha", "matriz"), cro = primeiro("cronograma", "matriz");
    if (mem) { an.memorial = lerMemorial(mem.texto); an.memorial.arquivo = mem.nome; an.memorial.sha = mem.sha; }
    else an.lacunas.push("Sem memorial descritivo legível: objeto, justificativa, solução e requisitos ficam para a pessoa.");
    var plaPdf = arqs.filter(function (a) { return a.tipo === "orcamento_planilha" && a.planilhaPdf; })[0] || null;
    if (pla) {
      var lp = lerPlanilha(pla.matriz);
      if (lp.erro) an.avisos.push("Planilha «" + pla.nome + "»: " + lp.erro);
      else { an.planilha = lp; lp.arquivo = pla.nome; lp.sha = pla.sha; an.baseDeclarada = lerBasePlanilha(pla.matriz); }
    } else if (plaPdf) {
      /* planilha só em PDF, lida pelo módulo de leitura de PDF (leva M): entra como a .xlsx, com origem arquivo/página/linha */
      var lq = lerPlanilhaPdf(plaPdf.planilhaPdf);
      if (lq.erro) an.avisos.push("Planilha «" + plaPdf.nome + "»: " + lq.erro);
      else {
        an.planilha = lq; lq.arquivo = plaPdf.nome; lq.sha = plaPdf.sha;
        if (!lq.leituraPdf.ok) an.avisos.push("Planilha «" + plaPdf.nome + "» lida do PDF com conferência reprovada (nota " + lq.leituraPdf.nota + "): confira a leitura no passo 6 — " + (lq.leituraPdf.motivos.join("; ") || "sem motivo informado") + ".");
      }
    } else if (arqs.some(function (a) { return a.tipo === "orcamento_planilha"; })) {
      an.avisos.push("Há uma planilha orçamentária, mas só em PDF ou sem texto legível: o sistema não converte PDF em orçamento. Salve a planilha em .xlsx e rode de novo.");
    } else {
      an.lacunas.push("Sem planilha orçamentária na pasta: o orçamento de referência e os quantitativos ficam para a pessoa.");
      /* sem planilha, mas com memorial e área/tipo: oferece orçar pelo escopo (IA, com a cobrança por uso do OrçaPRO) */
      if (an.memorial && (an.memorial.areaConstruida || Cplpro.sugerirTipoObjeto(an.memorial.objeto || "").length)) {
        an.oferta = { escopo: true, texto: an.memorial.objeto || "", memorial: mem.texto || null, area: an.memorial.areaConstruida || null, municipio: an.memorial.municipio || null, uf: an.memorial.uf || null };
      }
    }
    var artArq = arqs.filter(function (a) { return a.tipo === "art_rrt" && !vazio(a.texto); })[0];
    if (artArq) { an.art = lerArt(artArq.texto); an.art.arquivo = artArq.nome; }
    if (cro) {
      var lc = lerCronograma(cro.matriz);
      if (lc.erro) an.avisos.push("Cronograma «" + cro.nome + "»: " + lc.erro);
      else { an.cronograma = lc; lc.arquivo = cro.nome; lc.sha = cro.sha; arr(lc.avisos).forEach(function (a) { an.avisos.push(a); }); }
    }
    return an;
  }

  /* Plano do orçamento que a tela cria no OrçaPRO (sem preço: quem precifica é a base SINAPI do orçamento) */
  function planoOrcamento(an) {
    if (!an || !an.planilha) return null;
    var etapas = arr(an.planilha.etapas).map(function (et) {
      return { nome: et.nome, itens: arr(et.itens).map(function (it) { return { codigo: it.codigo, descricao: it.descricao, unidade: it.unidade, quantidade: it.quantidade, custoUnitario: it.custoUnitario, numero: it.numero || null }; }) };
    });
    return { etapas: etapas, itens: an.planilha.itens, arquivo: an.planilha.arquivo, sha: an.planilha.sha, deOnde: an.planilha.deOnde || "xlsx", leituraPdf: an.planilha.leituraPdf || null };
  }
  /* assinatura do orçamento: itens (código, quantidade, preço) — para saber se a pessoa mexeu nele depois do sistema */
  function assinaturaOrc(orc) {
    var s = [];
    arr(orc && orc.etapas).forEach(function (et) {
      s.push(et.nome);
      arr(et.itens).forEach(function (it) { s.push([it.codigo, it.quantidade, it.custoUnitario, it.descricao].join("|")); });
    });
    var h = 5381, str = s.join("\n"), i;
    for (i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) % 4294967296;
    return h.toString(16);
  }

  /* ------------------------------------------------------------------ *
   * FASE 2 — aplicar no processo
   * ------------------------------------------------------------------ */
  var DECISOES = ["sigiloso", "modalidade", "criterio_julgamento", "regime_execucao", "garantia_contrato", "visita_tecnica", "consorcio", "subcontratacao", "amostra", "me_epp"];
  var CONTAS = ["parcelas_relevancia", "exequibilidade", "reajuste", "aditivo_teto", "recurso_prazo"];
  var PASSO_DO_CAMPO = { secretaria: "demanda", objeto: "demanda", justificativa: "demanda", tipoObjeto: "demanda", regulamentoId: "parametros",
    orcamentoId: "orcamento", cronogramaFisico: "tr" };

  function pegar(o, caminho) {
    var ps = caminho.split("."), x = o, i;
    for (i = 0; i < ps.length; i++) { if (x === null || x === undefined) return undefined; x = x[ps[i]]; }
    return x;
  }
  function colocar(o, caminho, v) {
    var ps = caminho.split("."), x = o, i;
    for (i = 0; i < ps.length - 1; i++) { if (x[ps[i]] === null || x[ps[i]] === undefined || typeof x[ps[i]] !== "object") x[ps[i]] = {}; x = x[ps[i]]; }
    x[ps[ps.length - 1]] = v;
  }
  function passoDe(caminho) {
    if (PASSO_DO_CAMPO[caminho]) return PASSO_DO_CAMPO[caminho];
    var p0 = caminho.split(/[.#]/)[0];
    return { tr: "tr", etp: "etp", riscos: "riscos", quantitativos: "quantitativos", orcamentoRef: "orcamento", pesquisa: "orcamento", parametros: "parametros", documentos: "acervo", edital: "minuta" }[p0] || "demanda";
  }

  function moedaBR(n) { return "R$ " + numBR(n, 2); }
  function datasComp(comp) { return /^\d{4}-\d{2}$/.test(String(comp || "")) ? String(comp) + "-01" : null; }

  function aplicar(p, an, ctx) {
    var c = ctx || {}, agora = c.agora || null;
    var q = clone(p);
    var permitidos = c.permitidos || null;
    function pode(passo) { return !permitidos || permitidos[passo] !== false; }
    var prev = q.preparo && q.preparo.campos ? q.preparo : null;
    q.preparo = { versao: 1, campos: clone(prev ? prev.campos : {}), arquivos: [], resumo: null, atualizadoEm: prev ? prev.atualizadoEm : null, orcamento: prev ? clone(prev.orcamento) : null,
      baseCtx: c.baseCtx ? clone(c.baseCtx) : (prev && prev.baseCtx ? clone(prev.baseCtx) : null), obra: prev && prev.obra ? clone(prev.obra) : null, oferta: prev && prev.oferta ? clone(prev.oferta) : null };
    var rastro = q.preparo.campos;
    var E = { preenchidos: 0, atualizados: 0, mantidos: [], porPasso: {}, soltos: {}, semPermissao: {}, mudou: false };

    function marcar(passo, tipo) { E.porPasso[passo] = (E.porPasso[passo] || 0) + 1; if (E.soltos[passo] === undefined && Fluxo && Fluxo.soltarConferencia(q, passo)) E.soltos[passo] = true; E.mudou = true; return tipo; }

    /* escreve UM campo simples, respeitando o que a pessoa editou */
    function campo(caminho, valor, meta, passoForcado) {
      if (semValor(valor)) return "sem-dado";
      var passo = passoForcado || passoDe(caminho);
      if (!pode(passo)) { E.semPermissao[passo] = true; return "sem-permissao"; }
      var atual = pegar(q, caminho), rec = rastro[caminho];
      if (igual(atual, valor)) return "igual";
      if (semValor(atual) || (rec && igual(atual, rec.valor))) {
        colocar(q, caminho, clone(valor));
        rastro[caminho] = { valor: clone(valor), arquivo: meta.arquivo || null, regra: meta.regra || null, em: agora };
        if (rec) { E.atualizados++; return marcar(passo, "atualizado"); }
        E.preenchidos++; return marcar(passo, "preenchido");
      }
      E.mantidos.push({ caminho: caminho, passo: passo, motivo: "a pessoa editou" });
      return "mantido";
    }

    /* ---- 1. acervo ---- */
    var arqs = arr(an && an.arquivos);
    if (pode("acervo")) {
      var antesN = arr(q.documentos).length;
      var q2 = Cplpro.adicionarDocumentos(q, arqs.map(function (a) { return { nome: a.nome, sha: a.sha, ext: a.ext, texto: a.texto, origem: a.origem, data: a.data }; }));
      q.documentos = q2.documentos;
      if (q.documentos.length !== antesN) { E.preenchidos += q.documentos.length - antesN; marcar("acervo", "preenchido"); }
    } else E.semPermissao.acervo = true;
    q.preparo.arquivos = arqs.map(function (a) { return { nome: a.nome, sha: a.sha, tipo: a.tipo }; });

    var mem = an && an.memorial, ref = mem ? { arquivo: mem.arquivo } : {};

    /* ---- 2. demanda (DFD) ---- */
    if (mem) {
      campo("secretaria", mem.secretaria, { arquivo: mem.arquivo, regra: "Secretaria citada no memorial descritivo." });
      campo("objeto", mem.objeto, { arquivo: mem.arquivo, regra: "Seção «Objeto» do memorial descritivo." });
      campo("justificativa", mem.justificativa, { arquivo: mem.arquivo, regra: "Seção «Justificativa» do memorial descritivo." });
      /* tipo do objeto: só com resposta clara (o primeiro sozinho no topo); empate = deixa para a pessoa */
      var sug = Cplpro.sugerirTipoObjeto(mem.objeto || "");
      if (sug.length && (sug.length === 1 || sug[0].pontos > sug[1].pontos)) {
        campo("tipoObjeto", sug[0].tipo, { arquivo: mem.arquivo, regra: "Termos do objeto no memorial: " + sug[0].termos.join(", ") + "." });
      }
    }
    /* leva L: a obra (criada ou escolhida) e o nome do processo vêm dos documentos */
    if (c.obraInfo && c.obraInfo.id) {
      campo("obraId", c.obraInfo.id, { arquivo: c.obraInfo.arquivo || (mem && mem.arquivo) || null, regra: c.obraInfo.criada ? "Obra criada pelo sistema com o nome e os dados lidos dos documentos da pasta." : "Obra criada antes por esta mesma pasta." });
      q.preparo.obra = { id: c.obraInfo.id, assinatura: c.obraInfo.assinatura || null };
    } else if (prev && prev.obra) q.preparo.obra = clone(prev.obra);
    if (mem && mem.nomeObra) campo("nome", mem.nomeObra + (mem.municipio ? " — " + mem.municipio + "/" + mem.uf : ""), { arquivo: mem.arquivo, regra: "Nome da obra («Obra:» do memorial) e município." });
    /* regulamento de pesquisa de preços pelo município */
    var munic = mem && mem.municipio ? norm(mem.municipio) : null;
    if (munic) {
      var regId = (munic === "sao paulo" && mem.uf === "SP") ? "sp-capital-62100" : "federal-14133";
      campo("regulamentoId", regId, { arquivo: mem.arquivo, regra: regId === "sp-capital-62100" ? "Município de São Paulo (capital): Decreto Municipal 62.100/2022." : "Município sem decreto próprio cadastrado no sistema: vale o regulamento federal (Lei 14.133)." });
    }

    /* ---- 3. orçamento e quantitativos ---- */
    var oi = c.orcInfo || null, plano = an && an.planilha ? an.planilha : null;
    if (oi && oi.id) {
      campo("orcamentoId", oi.id, { arquivo: plano ? plano.arquivo : null, regra: oi.origem === "orçamento pelo escopo" ? "Orçamento pelo escopo (IA): gerado do memorial, com a cobrança por uso confirmada." : "Orçamento criado a partir da planilha orçamentária da pasta, com a base de preços exigida pelo regulamento." });
      if (oi.base) campo("orcamentoRef.base", oi.base, { arquivo: plano ? plano.arquivo : null, regra: "Base de preços do orçamento criado." }, "orcamento");
      if (oi.competencia) campo("orcamentoRef.competencia", oi.competencia, { arquivo: plano ? plano.arquivo : null, regra: "Competência da base de preços do orçamento criado." }, "orcamento");
      /* data da pesquisa de preços = o dia em que o sistema consultou a base oficial (SINAPI) para precificar; método de cálculo NÃO se deduz */
      if (oi.casados > 0 && agora) campo("pesquisa.dataPesquisa", String(agora).substring(0, 10), { arquivo: plano ? plano.arquivo : null, regra: "Dia em que o sistema consultou a base oficial de preços para precificar o orçamento." }, "orcamento");
      var lpdf = plano && plano.leituraPdf ? plano.leituraPdf : null, lpdfAnt = prev && prev.orcamento && prev.orcamento.leituraPdf ? prev.orcamento.leituraPdf : null;
      q.preparo.orcamento = { id: oi.id, sha: plano ? plano.sha : null, assinatura: oi.assinatura || null, casados: oi.casados, semBase: arr(oi.semBase),
        origem: oi.origem || (plano ? (plano.deOnde === "pdf" ? "planilha em PDF" : "planilha") : "escopo"),
        baseExigida: oi.baseExigida ? clone(oi.baseExigida) : null,
        leituraPdf: lpdf ? { nota: lpdf.nota, ok: lpdf.ok, motivos: lpdf.motivos.slice(), conferida: lpdfAnt && lpdfAnt.conferida === true && lpdfAnt.nota === lpdf.nota ? true : false } : null };
      if (pode("quantitativos")) {
        var linhasOrc = arr(oi.linhas), itensPl = plano ? arr(plano.itens) : [], nq = 0;
        linhasOrc.forEach(function (l, i) {
          var it = itensPl[i] && trim(itensPl[i].codigo) === trim(l.codigo) ? itensPl[i] : null;
          var chave = "quantitativos#" + l.numero, rec = rastro[chave];
          var novo = { item: l.numero, itemRef: l.numero, codigo: l.codigo || "", descricao: l.descricao, un: l.unidade, qtd: l.quantidade,
            origem: it && it.linha ? { arquivo: plano.arquivo, pagina: it.pagina || null, linha: it.linha } : { arquivo: null, pagina: null } };
          var idx = -1; arr(q.quantitativos).forEach(function (z, k) { if (z.item === l.numero) idx = k; });
          if (idx < 0) {
            if (rec) { E.mantidos.push({ caminho: chave, passo: "quantitativos", motivo: "a pessoa removeu" }); return; }
            q.quantitativos.push(novo); rastro[chave] = { valor: clone(novo), arquivo: plano ? plano.arquivo : null, regra: "Quantidade e linha de origem lidas da planilha orçamentária.", em: agora };
            E.preenchidos++; nq++; marcar("quantitativos", "preenchido"); return;
          }
          var cur = q.quantitativos[idx];
          if (igual(cur, novo)) return;
          if (rec && igual(cur, rec.valor)) {
            q.quantitativos[idx] = novo; rastro[chave] = { valor: clone(novo), arquivo: plano ? plano.arquivo : null, regra: rec.regra, em: agora };
            E.atualizados++; marcar("quantitativos", "atualizado"); return;
          }
          E.mantidos.push({ caminho: chave, passo: "quantitativos", motivo: "a pessoa editou" });
        });
      } else E.semPermissao.quantitativos = true;
    }

    /* sem planilha: a oferta «Orçar pelo escopo (IA)» fica registrada até o orçamento existir (o passo 6 mostra a pendência) */
    if (an && an.oferta && !(oi && oi.id) && !q.orcamentoId) q.preparo.oferta = { escopo: true, texto: an.oferta.texto, area: an.oferta.area, memorial: an.oferta.memorial || null };
    else if (prev && prev.oferta && !(oi && oi.id) && !q.orcamentoId) q.preparo.oferta = clone(prev.oferta);
    else q.preparo.oferta = null;

    /* ---- 4. ETP ---- */
    if (pode("etp")) {
      if (mem) {
        campo("etp.campos.I", mem.justificativa, { arquivo: mem.arquivo, regra: "Necessidade = a justificativa do memorial descritivo." }, "etp");
        campo("etp.campos.III", mem.requisitos, { arquivo: mem.arquivo, regra: "Seção «Requisitos da contratação» do memorial descritivo." }, "etp");
        campo("etp.campos.VII", mem.solucao || mem.objeto, { arquivo: mem.arquivo, regra: "Seção «Descrição da solução» do memorial descritivo." }, "etp");
      }
      if (mem) {
        var fr = arr(mem.frases);
        var f8 = frasesQue(fr, /(?:[uú]nico contrato|parcelamento|parcelad)/i, 2);
        if (f8.length) campo("etp.campos.VIII", f8.map(pontuar).join(" "), { arquivo: mem.arquivo, regra: "Frase do memorial que trata de contrato único ou parcelamento (transcrita)." }, "etp");
        var f5 = frasesQue(fr, /dispon[ií]ve(?:l|is)\s+na\s+regi[ãa]o|linha comercial|mercado local/i, 2);
        if (f5.length) campo("etp.campos.V", f5.map(pontuar).join(" "), { arquivo: mem.arquivo, regra: "Frase do memorial sobre a disponibilidade dos materiais no mercado (transcrita)." }, "etp");
        var f9 = frasesQue(arr(frasesDe(mem.justificativa)), /\b(?:reduz|atende|beneficia|elimina|amplia|garante)\b/i, 2);
        if (f9.length) campo("etp.campos.IX", f9.map(pontuar).join(" "), { arquivo: mem.arquivo, regra: "Frase da justificativa do memorial que diz o resultado pretendido (transcrita)." }, "etp");
      }
      var comOrig = arr(q.quantitativos).filter(function (z) { return z.origem && !vazio(z.origem.arquivo) && (!vazio(z.origem.pagina) || !vazio(z.origem.linha)); }).length;
      var semOrig = arr(q.quantitativos).length - comOrig;
      if (comOrig) campo("etp.campos.IV", "Quantidades estimadas por memória de cálculo: " + comOrig + " item(ns) com origem documental (arquivo e linha ou página), listados no quadro de quantitativos." + (semOrig ? " Atenção: " + semOrig + " item(ns) sem origem ficaram de fora." : ""), { arquivo: plano ? plano.arquivo : null, regra: "Contagem dos quantitativos com origem." }, "etp");
      if (oi && typeof oi.total === "number") campo("etp.campos.VI", "Valor estimado da contratação: " + moedaBR(oi.total) + (oi.base ? ", base " + oi.base : "") + (oi.competencia ? ", competência " + oi.competencia : "") + ". Totais do orçamento de referência do processo.", { arquivo: plano ? plano.arquivo : null, regra: "Total do orçamento criado a partir da planilha." }, "etp");
    } else E.semPermissao.etp = true;

    /* ---- 5. TR ---- */
    if (pode("tr")) {
      if (mem) {
        campo("tr.objeto", mem.objeto, { arquivo: mem.arquivo, regra: "Seção «Objeto» do memorial descritivo." });
        campo("tr.medicao", mem.medicao, { arquivo: mem.arquivo, regra: "Critério de medição escrito no memorial descritivo." });
        campo("tr.recebimento", mem.recebimento, { arquivo: mem.arquivo, regra: "Critério de recebimento escrito no memorial descritivo." });
      }
      if (mem) {
        if (mem.endereco) campo("tr.local", mem.endereco + (mem.municipio ? ", " + mem.municipio + "/" + mem.uf : ""), { arquivo: mem.arquivo, regra: "Endereço do terreno na seção «Identificação» do memorial descritivo." }, "tr");
        if (mem.recProvisorioDias) campo("tr.prazoRecProvisorio", String(mem.recProvisorioDias), { arquivo: mem.arquivo, regra: "Prazo do recebimento provisório escrito no critério de recebimento do memorial." }, "tr");
        if (mem.emailImpugnacao) campo("edital.emailImpugnacao", mem.emailImpugnacao, { arquivo: mem.arquivo, regra: "E-mail citado no memorial junto a impugnações/esclarecimentos (transcrito)." }, "minuta");
        if (mem.recDefinitivoDias) campo("tr.prazoRecDefinitivo", String(mem.recDefinitivoDias), { arquivo: mem.arquivo, regra: "Prazo do recebimento definitivo escrito no critério de recebimento do memorial." }, "tr");
      }
      if (an && an.cronograma) {
        campo("cronogramaFisico", { meses: an.cronograma.meses, etapas: an.cronograma.etapas, arquivo: an.cronograma.arquivo }, { arquivo: an.cronograma.arquivo, regra: "Percentual por etapa e mês lido da planilha de cronograma." });
      }
    } else E.semPermissao.tr = true;

    /* ---- 6. riscos: biblioteca do tipo, ajustada pelo que o acervo tem ---- */
    if (pode("riscos") && q.tipoObjeto && R.TIPOS_OBJETO[q.tipoObjeto]) {
      var chk = Cplpro.checklistAcervo(q), faltam = chk.filter(function (x) { return x.situacao !== "ok"; });
      var temSond = chk.some(function (x) { return x.exigencia === "sondagem"; }) ? chk.filter(function (x) { return x.exigencia === "sondagem"; })[0].situacao === "ok" : arr(q.documentos).some(function (d) { return d.tipo === "sondagem" && !d.superadoPor; });
      Cplpro.riscosSugeridos(q.tipoObjeto).forEach(function (r) {
        var ajuste = null;
        if (r.id === "solo_diferente") {
          if (temSond) { if (r.prob > 1) { r.prob -= 1; ajuste = "Sondagem presente no acervo: probabilidade reduzida em 1 ponto em relação à biblioteca."; } }
          else { r.prob = Math.min(5, r.prob + 1); ajuste = "Sem sondagem no acervo: probabilidade aumentada em 1 ponto — junte a sondagem (pendência do passo 2)."; }
        }
        if (r.id === "projeto_incompleto" && faltam.length) { r.prob = Math.min(5, r.prob + 1); ajuste = "Faltam " + faltam.length + " documento(s) exigidos no acervo: probabilidade aumentada em 1 ponto."; }
        if (ajuste) r.ajusteSistema = ajuste;
        delete r.sugerido; r.sugerido = true;
        var chave = "riscos#" + r.id, rec = rastro[chave], idx = -1;
        arr(q.riscos).forEach(function (z, k) { if (z.id === r.id) idx = k; });
        if (idx < 0) {
          if (rec) { E.mantidos.push({ caminho: chave, passo: "riscos", motivo: "a pessoa removeu" }); return; }
          q.riscos.push(r); rastro[chave] = { valor: clone(r), arquivo: null, regra: "Biblioteca de riscos do tipo de objeto, ajustada pelo acervo.", em: agora };
          E.preenchidos++; marcar("riscos", "preenchido"); return;
        }
        if (igual(q.riscos[idx], r)) return;
        if (rec && igual(q.riscos[idx], rec.valor)) { q.riscos[idx] = r; rastro[chave] = { valor: clone(r), arquivo: null, regra: rec.regra, em: agora }; E.atualizados++; marcar("riscos", "atualizado"); return; }
        E.mantidos.push({ caminho: chave, passo: "riscos", motivo: "a pessoa editou" });
      });
    } else if (!pode("riscos")) E.semPermissao.riscos = true;

    /* ---- 7. parâmetros: só a CONTA entra; a decisão do órgão fica com a sugestão pré-marcada ---- */
    if (pode("parametros")) {
      var linhasPar = oi ? arr(oi.linhas).map(function (l) { return { item: l.numero, descricao: l.descricao, total: l.precoTotal, qtd: l.quantidade, un: l.unidade }; }) : [];
      var sg = Cplpro.parametros.sugerir(q, { totalEstimado: oi && typeof oi.total === "number" ? oi.total : undefined, linhas: linhasPar, valorGrandeVulto: c.valorGrandeVulto, dataBaseOrcamento: oi ? datasComp(oi.competencia) : undefined });
      function escParam(id, valor, regra) {
        var r = campo("parametros." + id + ".valor", valor, { arquivo: oi && plano ? plano.arquivo : null, regra: regra }, "parametros");
        if (r === "preenchido" || r === "atualizado") { q.parametros[id].sugerido = clone(valor); q.parametros[id].regra = regra; q.parametros[id].fonte = R.PARAMETROS[id].fonte; q.parametros[id].conferido = false; }
      }
      if (oi && sg.parcelas_relevancia && sg.parcelas_relevancia.sugerido !== null) escParam("parcelas_relevancia", sg.parcelas_relevancia.sugerido, sg.parcelas_relevancia.regra);
      escParam("exequibilidade", sg.exequibilidade.sugerido, sg.exequibilidade.regra);
      escParam("aditivo_teto", sg.aditivo_teto.sugerido, sg.aditivo_teto.regra);
      escParam("recurso_prazo", sg.recurso_prazo.sugerido, sg.recurso_prazo.regra);
      var dbase = oi ? datasComp(oi.competencia) : null;
      if (dbase) {
        var rj = q.parametros.reajuste.valor, indiceAtual = rj && rj.indice ? rj.indice : null;
        /* leva B2: o índice sai sugerido pelo tipo de objeto (selo «sugerido pelo sistema — confira»). Índice que a pessoa
           escolheu ou editou fica como está; índice que o próprio sistema escreveu acompanha o tipo de objeto. */
        var sgI = Cplpro.indiceReajusteSugerido(q.tipoObjeto);
        var recR = q.preparo && q.preparo.campos ? q.preparo.campos["parametros.reajuste.valor"] : null;
        var indiceDoSistema = !!(recR && recR.valor && indiceAtual && recR.valor.indice === indiceAtual);
        var indiceNovo = indiceAtual && !indiceDoSistema ? indiceAtual : (sgI ? sgI.indice : indiceAtual);
        escParam("reajuste", { indice: indiceNovo, dataBase: dbase }, "Data-base = a data do orçamento estimado; " + (sgI && indiceNovo === sgI.indice ? "índice sugerido pelo tipo de objeto. " + sgI.regra : "o índice é escolha do órgão."));
      }
      /* decisões: sugestão pré-marcada, SEM valor */
      var PRE = {
        sigiloso: { v: false, regra: "O sistema pré-marca «não»: orçamento público é a regra e o sigilo é exceção que o órgão escolhe e justifica." },
        modalidade: { v: sg.modalidade.sugerido, regra: sg.modalidade.regra },
        criterio_julgamento: { v: sg.criterio_julgamento.sugerido, regra: sg.criterio_julgamento.regra },
        regime_execucao: { v: plano ? "empreitada por preço unitário" : null, regra: "Há planilha com quantidade por item e origem na planilha do órgão: o regime por preço unitário paga o que for medido. Sugestão do sistema; a decisão é do órgão." },
        garantia_contrato: { v: sg.garantia_contrato.sugerido, regra: sg.garantia_contrato.regra },
        visita_tecnica: { v: true, regra: "Sugestão: visita facultativa. Quem optar agenda a vistoria; quem não for assume o risco do que não viu." },
        consorcio: { v: false, regra: "Sugestão: sem consórcio, em obra de porte e complexidade comuns. Atenção: vedar o consórcio pede justificativa no processo." },
        subcontratacao: { v: true, regra: "Sugestão: subcontratação parcial admitida, com limite e parcelas fixados no edital." },
        amostra: { v: false, regra: "Sugestão: sem amostra nem prova de conceito em obra civil comum; o jurídico confirma." },
        me_epp: { v: true, regra: "Sugestão: aplicar o tratamento de ME/EPP (LC 123/2006). O jurídico confirma o enquadramento." }
      };
      DECISOES.forEach(function (id) {
        var pr = PRE[id], par = q.parametros[id];
        if (!pr || pr.v === null || pr.v === undefined || !par) return;
        if (vazio(par.valor) && !igual(par.sugerido, pr.v) ) {
          par.sugerido = clone(pr.v); par.regra = pr.regra; par.fonte = R.PARAMETROS[id].fonte; par.conferido = false;
          E.mudou = true;
        }
      });
    } else E.semPermissao.parametros = true;

    /* ---- 7b. cadastro do órgão + padrões de rotina (SÓ quando a tela pede: ctx.padroes) — cada um com o selo «sugerido — confira» ---- */
    if (c.padroes) escreverPadroes(q, rastro, E, agora, pode, c);

    /* leva L: orçamento repreçado, base escolhida, obra e oferta também contam como «mudou» (senão a rodada que só repreça não grava) */
    if (prev && (!igual(prev.orcamento, q.preparo.orcamento) || !igual(prev.baseCtx, q.preparo.baseCtx) || !igual(prev.obra, q.preparo.obra) || !igual(prev.oferta, q.preparo.oferta))) E.mudou = true;
    /* ---- 8. marca de data só anda quando algo mudou (idempotência) ---- */
    if (E.mudou || !prev) q.preparo.atualizadoEm = agora; else q.preparo.atualizadoEm = prev.atualizadoEm;
    q.preparo.resumo = resumo(q, E, an);
    var rodada = { preenchidos: E.preenchidos, atualizados: E.atualizados, mantidos: E.mantidos.length, passosSoltos: Object.keys(E.soltos) };
    if (!E.mudou && prev && igual(prev.resumo, q.preparo.resumo) && igual(prev.campos, q.preparo.campos) && igual(prev.arquivos, q.preparo.arquivos)) {
      /* nada mudou: devolve o processo como veio (idempotente de verdade, byte a byte) */
      return { p: clone(p), resumo: q.preparo.resumo, rodada: rodada, mudou: false };
    }
    return { p: q, resumo: q.preparo.resumo, rodada: rodada, mudou: E.mudou };
  }

  /* ------------------------------------------------------------------ *
   * CADASTRO DO ÓRGÃO + PADRÕES DE ROTINA (js/cplproorgao.js) — mesmo contrato do `campo` de `aplicar`:
   * campo vazio ou ainda igual ao que o sistema escreveu → escreve/atualiza (com rastro e selo); a pessoa editou → «mantido».
   * ⚠ O número do edital só nasce em campo VAZIO: renumerar um edital que já tem número, sozinho, seria trocar a identidade do ato.
   * ------------------------------------------------------------------ */
  function anoDe(agora) { var m = /^(\d{4})/.exec(String(agora || "")); return m ? Number(m[1]) : new Date().getFullYear(); }
  function escreverPadroes(q, rastro, E, agora, pode, c) {
    var Org = global.CplproOrgao;
    if (!Org) return;
    var lista = Org.padroes(q, { orgao: c.orgao || null, processos: c.processos || [], ano: anoDe(agora), semNumero: !!c.semNumero });
    lista.forEach(function (x) {
      var passo = passoDe(x.caminho);
      if (!pode(passo)) { E.semPermissao[passo] = true; return; }
      var atual = pegar(q, x.caminho), rec = rastro[x.caminho];
      if (x.caminho === "edital.numero" && !semValor(atual)) return;
      if (igual(atual, x.valor)) { if (!rec) return; if (rec && !igual(rec.valor, x.valor)) { rastro[x.caminho] = { valor: clone(x.valor), arquivo: null, regra: x.regra, em: agora }; E.mudou = true; } return; }
      if (semValor(atual) || (rec && igual(atual, rec.valor))) {
        colocar(q, x.caminho, clone(x.valor));
        rastro[x.caminho] = { valor: clone(x.valor), arquivo: null, regra: x.regra, em: agora };
        E.porPasso[passo] = (E.porPasso[passo] || 0) + 1;
        if (E.soltos[passo] === undefined && Fluxo && Fluxo.soltarConferencia(q, passo)) E.soltos[passo] = true;
        E.mudou = true;
        if (rec) E.atualizados++; else E.preenchidos++;
      } else E.mantidos.push({ caminho: x.caminho, passo: passo, motivo: "a pessoa editou" });
    });
  }
  /* uso fora da montagem (processo criado à mão; órgão que editou o cadastro): devolve { p, mudou, preenchidos, atualizados, mantidos } */
  function aplicarPadroes(p, ctx) {
    var c = ctx || {}, agora = c.agora || null, q = clone(p);
    var permitidos = c.permitidos || null;
    function pode(passo) { return !permitidos || permitidos[passo] !== false; }
    if (!q.preparo || !q.preparo.campos) q.preparo = { versao: 1, campos: {}, arquivos: [], resumo: null, atualizadoEm: null, orcamento: null, baseCtx: null, obra: null, oferta: null };
    var E = { preenchidos: 0, atualizados: 0, mantidos: [], porPasso: {}, soltos: {}, semPermissao: {}, mudou: false };
    escreverPadroes(q, q.preparo.campos, E, agora, pode, { orgao: c.orgao, processos: c.processos, semNumero: c.semNumero });
    if (!E.mudou) return { p: clone(p), mudou: false, preenchidos: 0, atualizados: 0, mantidos: E.mantidos };
    q.preparo.atualizadoEm = agora;
    return { p: q, mudou: true, preenchidos: E.preenchidos, atualizados: E.atualizados, mantidos: E.mantidos };
  }

  /* ------------------------------------------------------------------ *
   * Resumo: «o sistema preencheu N campos em P passos; faltam K decisões suas»
   * ------------------------------------------------------------------ */
  /* o que ainda falta, AO VIVO (a tela recalcula a cada desenho: quando a pessoa decide, a lista encolhe) */
  function situacao(q) {
    var pr = Cplpro.progresso(q), faltam = [];
    var NAO_CONTA = { minuta: true, conformidade: true };
    Cplpro.PASSOS.forEach(function (ps) {
      if (NAO_CONTA[ps.id]) return;
      arr(pr.passos[ps.id].pendencias).forEach(function (x) {
        faltam.push({ passo: ps.id, passoNome: ps.nome, campo: x.campo, msg: x.msg, item: x.item === undefined ? null : x.item,
          tipo: ps.id === "parametros" && DECISOES.indexOf(x.campo) >= 0 ? "decisao" : "dado" });
      });
    });
    var decisoes = DECISOES.filter(function (id) { var v = q.parametros[id] ? q.parametros[id].valor : null; if (id === "sigiloso" && vazio(v)) v = q.sigiloso; return vazio(v); }).map(function (id) {
      var par = q.parametros[id], def = R.PARAMETROS[id];
      return { id: id, nome: def.nome, sugerido: par ? par.sugerido : null, regra: par ? par.regra : null, fonte: def.fonte, conferir: def.conferir === true };
    });
    var rj = q.parametros.reajuste && q.parametros.reajuste.valor;
    return { faltam: faltam, faltamTotal: faltam.length, decisoes: decisoes, reajusteSemIndice: !!(rj && vazio(rj.indice)) };
  }

  function resumo(q, E, an) {
    var sit = situacao(q);
    /* passos que o sistema preencheu: derivado do que está gravado (não da rodada), para a segunda rodada dar o mesmo resumo */
    var tocados = {};
    Object.keys(q.preparo.campos).forEach(function (k) { tocados[passoDe(k)] = true; });
    if (arr(q.preparo.arquivos).length && arr(q.documentos).length) tocados.acervo = true;
    var passosTocados = Cplpro.PASSOS.map(function (ps) { return ps.id; }).filter(function (id) { return tocados[id]; });
    var campos = Object.keys(q.preparo.campos).filter(function (k) { return k.indexOf("#") < 0; }).length;
    var itens = Object.keys(q.preparo.campos).filter(function (k) { return k.indexOf("#") >= 0; }).length;
    return {
      preencheu: campos + itens, campos: campos, itens: itens, passosTocados: passosTocados.length, passos: passosTocados,
      mantidos: E.mantidos, semPermissao: Object.keys(E.semPermissao),
      decisoes: sit.decisoes, reajusteSemIndice: sit.reajusteSemIndice, faltam: sit.faltam, faltamTotal: sit.faltamTotal,
      avisos: arr(an && an.avisos), lacunas: arr(an && an.lacunas),
      documentos: arr(q.documentos).filter(function (d) { return !d.superadoPor; }).length
    };
  }

  /* selo: este campo foi escrito pelo sistema e continua como ele escreveu? (a tela mostra «sugerido pelo sistema — confira») */
  function seloSistema(p, caminho) {
    var rec = p && p.preparo && p.preparo.campos ? p.preparo.campos[caminho] : null;
    if (!rec) return null;
    var atual = caminho.indexOf("#") > 0 ? null : pegar(p, caminho);
    if (caminho.indexOf("#") > 0) {
      var k = caminho.split("#"), lista = k[0] === "riscos" ? arr(p.riscos) : arr(p.quantitativos), ch = k[0] === "riscos" ? "id" : "item", f = null;
      lista.forEach(function (z) { if (String(z[ch]) === k[1]) f = z; });
      atual = f;
    }
    return igual(atual, rec.valor) ? { arquivo: rec.arquivo, regra: rec.regra, em: rec.em } : null;
  }

  /* ------------------------------------------------------------------ *
   * A OBRA QUE OS DOCUMENTOS DESCREVEM (leva L) — «não tem que criar uma obra para isso; ele reconhece e cria um nome».
   * PURO: decide o que gravar; quem grava é a tela, pela MESMA porta da tela de Obras (Store.salvar(..., "obras", obj)).
   *  - sem obra no processo: CRIA (ou REAPROVEITA a que este mesmo preparo já criou: pela assinatura da pasta ou pelo nome+município);
   *  - obra criada por este preparo: atualiza SÓ o que ainda está como o sistema escreveu (a pessoa editou → fica);
   *  - obra escolhida pela pessoa: NÃO é tocada.
   * ------------------------------------------------------------------ */
  function assinaturaPasta(an) {
    var shas = arr(an && an.arquivos).map(function (a) { return a.sha || a.nome; }).sort(), h = 5381, str = shas.join("|"), i;
    for (i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) % 4294967296;
    return "pasta-" + h.toString(16);
  }
  function dadosObra(an) {
    var m = an && an.memorial, art = an && an.art, pl = an && an.planilha;
    if (!m || !m.nomeObra) return null;
    var orig = {}, c = {}, munUf = m.municipio ? (m.municipio + (m.uf ? "/" + m.uf : "")) : null;
    function pos(k, v, regra) { if (!semValor(v)) { c[k] = v; orig[k] = { arquivo: m.arquivo, regra: regra }; } }
    pos("nome", m.nomeObra + (munUf ? " — " + munUf : ""), "Linha «Obra:» do memorial descritivo, mais o município do memorial.");
    pos("local", m.endereco ? (m.endereco + (munUf ? ", " + munUf : "")) : null, "Endereço da seção «Identificação» do memorial, mais o município.");
    pos("areaConstruida", m.areaConstruida, "Área construída informada no memorial descritivo.");
    pos("areaTerreno", m.areaTerreno, "Área do terreno informada no memorial descritivo.");
    var obs = [];
    if (m.secretaria) obs.push("Secretaria requisitante: " + m.secretaria + " (memorial).");
    var contr = (art && art.contratante) || (m.municipio ? "Município de " + m.municipio + (m.uf ? "/" + m.uf : "") : null);
    if (contr) obs.push("Contratante (órgão): " + nomeLimpo(contr) + (art && art.contratante ? " (ART)." : " (memorial)."));
    if (m.responsavelTecnico) obs.push("Responsável técnico pelo projeto: " + m.responsavelTecnico + " (memorial).");
    else if (art && art.profissional) obs.push("Responsável técnico: " + art.profissional + (art.registro ? ", registro " + art.registro : "") + " (ART).");
    if (art && art.numero) obs.push("ART/RRT nº " + art.numero + " (" + art.arquivo + ").");
    if (m.prazoMeses) obs.push("Prazo de execução: " + m.prazoMeses + " meses (memorial).");
    if (an.baseDeclarada) obs.push("Base de preços da planilha: " + an.baseDeclarada.base + (an.baseDeclarada.uf ? "/" + an.baseDeclarada.uf : "") + (an.baseDeclarada.competencia ? ", competência " + an.baseDeclarada.competencia : "") + ".");
    if (obs.length) { c.obs = "Preenchido pelo sistema a partir da pasta de documentos — confira.\n" + obs.join("\n"); orig.obs = { arquivo: m.arquivo, regra: "Dados do memorial, da ART e da planilha." }; }
    return { campos: c, origem: orig, chave: norm(m.nomeObra) + "|" + norm(m.municipio) + "|" + (m.uf || "") };
  }
  /* obras = lista de obras da conta; devolve { acao: criar|atualizar|nenhuma, obra (objeto a gravar), campos, mantidos, motivo, criada } */
  function decidirObra(p, an, obras, agora) {
    var d = dadosObra(an), ass = assinaturaPasta(an);
    if (!d) return { acao: "nenhuma", motivo: "Nenhum documento da pasta traz o nome da obra (linha «Obra:» do memorial)." };
    var lista = arr(obras), atual = null, criada = false;
    if (p && p.obraId) {
      atual = lista.filter(function (o) { return o.id === p.obraId; })[0] || null;
      if (!atual || !atual.origemPreparo) return { acao: "nenhuma", motivo: "A obra foi escolhida por você: o sistema não alterou o cadastro dela.", obraId: p.obraId };
    } else {
      atual = lista.filter(function (o) { return o.origemPreparo && (o.origemPreparo.assinatura === ass || o.origemPreparo.chave === d.chave); })[0] || null;
    }
    var o2 = atual ? clone(atual) : { status: "planejamento" }, rastro, mant = [], mudou = false;
    if (!atual) criada = true;
    o2.origemPreparo = o2.origemPreparo || { assinatura: ass, chave: d.chave, em: agora || null, campos: {} };
    rastro = o2.origemPreparo.campos = o2.origemPreparo.campos || {};
    Object.keys(d.campos).forEach(function (k) {
      var v = d.campos[k], cur = o2[k], rec = rastro[k];
      if (igual(cur, v)) return;
      if (semValor(cur) || (rec && igual(cur, rec.valor))) {
        o2[k] = clone(v); rastro[k] = { valor: clone(v), arquivo: d.origem[k].arquivo, regra: d.origem[k].regra, em: agora || null }; mudou = true;
      } else mant.push(k);
    });
    o2.origemPreparo.assinatura = ass; o2.origemPreparo.chave = d.chave;
    if (!criada && !mudou) return { acao: "nenhuma", motivo: "A obra já estava como os documentos dizem.", obraId: atual.id, obra: atual, mantidos: mant };
    return { acao: criada ? "criar" : "atualizar", obra: o2, obraId: atual ? atual.id : null, criada: criada, mantidos: mant, assinatura: ass, arquivo: an.memorial.arquivo };
  }

  /* ------------------------------------------------------------------ *
   * INVENTÁRIO — todos os campos de preencher do processo, um por um: preenchido (pelo sistema / pela pessoa) ou em branco, e POR QUÊ.
   * É a régua do pedido «meça quantos campos foram preenchidos antes e depois».
   * ------------------------------------------------------------------ */
  var PORQUE_ORGAO = "Dado administrativo do órgão: nenhum documento da pasta traz.";
  /* os 5 campos do TR que ficam em branco de propósito: cada um diz O QUE o órgão decide */
  var PORQUE_CAMPO = {
    inicioExecucao: "Decisão do órgão: em quantos dias da assinatura do contrato ou da ordem de serviço a obra deve começar.",
    garantiaServicoMeses: "Decisão do órgão: meses de garantia complementar do serviço; 0 vale só a garantia legal (Código Civil e CDC).",
    prazoLiquidacao: "Decisão do órgão: em quantos dias úteis o setor financeiro liquida a despesa depois do ateste.",
    indiceAtraso: "Decisão do órgão: índice de correção monetária por atraso de pagamento (INCC, IPCA ou IGP-M).",
    qualificacaoEconomica: "Decisão do órgão: capital ou patrimônio líquido mínimo exigido, até o limite de 10% do valor estimado."
  };
  var PORQUE_LEI = "A lei reserva a decisão ao órgão (o sistema só sugere, com «Por quê?»).";
  function inventario(p) {
    var campos = [], q = p || {}, rastro = q.preparo && q.preparo.campos ? q.preparo.campos : {};
    function add(caminho, rotulo, passo, valor, porque, rastroChave) {
      var tem = !semValor(valor) && !(typeof valor === "object" && valor !== null && !arr(valor).length && !Object.keys(valor).length);
      var rec = rastro[rastroChave || caminho], doSist = !!(tem && rec && igual(valor, rec.valor));
      campos.push({ caminho: caminho, rotulo: rotulo, passo: passo, preenchido: tem, por: tem ? (doSist ? "sistema" : "pessoa") : null, porque: tem ? null : porque,
        origem: doSist ? { arquivo: rec.arquivo, regra: rec.regra } : null });
    }
    var D = Docs || global.CplproDocs;
    add("obraId", "Obra", "demanda", q.obraId, "Obra não vinculada.");
    add("secretaria", "Secretaria requisitante", "demanda", q.secretaria, "Não consta nos documentos.");
    add("requisitante", "Requisitante", "demanda", q.requisitante, "Pessoa responsável pelo pedido: nenhum documento da pasta a nomeia.");
    add("objeto", "Objeto", "demanda", q.objeto, "Não consta nos documentos.");
    add("tipoObjeto", "Tipo do objeto", "demanda", q.tipoObjeto, "O texto do objeto não aponta um único tipo.");
    add("justificativa", "Justificativa", "demanda", q.justificativa, "Não consta nos documentos.");
    add("pca", "Previsão no PCA", "demanda", q.pca, "O plano de contratações anual é do órgão: nenhum documento da pasta o traz.");
    add("prazoDesejado", "Prazo desejado", "demanda", q.prazoDesejado, "Data desejada pelo órgão para a contratação: não está nos documentos técnicos.");
    add("recursoFederal", "Recurso federal", "demanda", q.recursoFederal, "Origem do recurso é informação do órgão.");
    add("regulamentoId", "Regulamento da pesquisa de preços", "parametros", q.regulamentoId, "Município não consta nos documentos.");
    add("nome", "Nome do processo", "demanda", q.nome, "Nenhum documento traz o nome da obra.");
    R.ETP_ELEMENTOS.forEach(function (el) {
      var v = q.etp && q.etp.campos ? q.etp.campos[el.id] : null, j = q.etp && q.etp.justificativas ? q.etp.justificativas[el.id] : null;
      add("etp.campos." + el.id, "ETP " + el.id + " — " + el.nome, "etp", semValor(v) ? j : v,
        el.id === "II" ? "Previsão no PCA é do órgão." : (el.id === "XIII" ? "Conclusão sobre a adequação da contratação é decisão da autoridade." : "Nenhum documento da pasta trata deste elemento."));
    });
    add("tr.objeto", "TR — objeto", "tr", q.tr && q.tr.objeto, "Não consta nos documentos.");
    add("tr.medicao", "TR — medição", "tr", q.tr && q.tr.medicao, "Não consta nos documentos.");
    add("tr.recebimento", "TR — recebimento", "tr", q.tr && q.tr.recebimento, "Não consta nos documentos.");
    add("cronogramaFisico", "Cronograma físico", "tr", q.cronogramaFisico, "Sem planilha de cronograma na pasta.");
    add("orcamentoId", "Orçamento de referência", "orcamento", q.orcamentoId, "Sem planilha na pasta.");
    add("orcamentoRef.base", "Base de preços", "orcamento", q.orcamentoRef && q.orcamentoRef.base, "Nenhum item da planilha casou com base oficial.");
    add("orcamentoRef.competencia", "Competência (data-base)", "orcamento", q.orcamentoRef && q.orcamentoRef.competencia, "Nenhum item casou com base oficial.");
    add("pesquisa.dataPesquisa", "Data da pesquisa de preços", "orcamento", q.pesquisa && q.pesquisa.dataPesquisa, "Sem orçamento precificado.");
    R.PARAMETROS_ORDEM.forEach(function (id) {
      var par = q.parametros && q.parametros[id], v = par ? par.valor : null;
      if (id === "sigiloso" && semValor(v)) v = q.sigiloso;
      add("parametros." + id + ".valor", "Parâmetro — " + R.PARAMETROS[id].nome, "parametros", v, DECISOES.indexOf(id) >= 0 ? PORQUE_LEI : "O orçamento não permite a conta.");
    });
    var trCampos = [];
    if (D && D.CAMPOS) D.CAMPOS.forEach(function (c) { if (!D.campoAplica || D.campoAplica(c.id, q)) trCampos.push(c); });
    trCampos.forEach(function (c) {
      var o = c.onde === "tr" ? q.tr : q.edital, v = o ? o[c.id] : null;
      var porque = PORQUE_CAMPO[c.id] || PORQUE_ORGAO;
      if (c.id === "local") porque = "O endereço do terreno não consta nos documentos.";
      else if (c.id === "prazoRecProvisorio" || c.id === "prazoRecDefinitivo") porque = "O critério de recebimento do memorial não diz o prazo em dias.";
      add((c.onde === "tr" ? "tr." : "edital.") + c.id, "Passo 9 — " + c.rotulo, "minuta", v, porque);
    });
    var pre = campos.filter(function (c) { return c.preenchido; }), exSist = pre.filter(function (c) { return c.por === "sistema"; });
    return { total: campos.length, preenchidos: pre.length, doSistema: exSist.length, daPessoa: pre.length - exSist.length,
      brancos: campos.filter(function (c) { return !c.preenchido; }).map(function (c) { return { caminho: c.caminho, rotulo: c.rotulo, passo: c.passo, porque: c.porque }; }), campos: campos };
  }

  var CplproPreparo = {
    lerBasePlanilha: lerBasePlanilha, lerArt: lerArt, lerPlanilhaPdf: lerPlanilhaPdf, dadosObra: dadosObra, decidirObra: decidirObra, assinaturaPasta: assinaturaPasta, inventario: inventario, nomeLimpo: nomeLimpo,
    DECISOES: DECISOES, CONTAS: CONTAS, PORQUE_CAMPO: PORQUE_CAMPO,
    lerMemorial: lerMemorial, lerPlanilha: lerPlanilha, lerCronograma: lerCronograma,
    analisar: analisar, planoOrcamento: planoOrcamento, assinaturaOrc: assinaturaOrc,
    aplicar: aplicar, aplicarPadroes: aplicarPadroes, seloSistema: seloSistema, situacao: situacao
  };
  global.CplproPreparo = CplproPreparo;
  if (typeof module !== "undefined" && module.exports) module.exports = CplproPreparo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
