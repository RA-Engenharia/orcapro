/* =====================================================================
 * hidpecas.js — FICHA TÉCNICA DA PEÇA (motor PURO, ES5, Node-testável). Frente PEÇA COMPLETA, 17/10/2026.
 *
 * Cada tubo, conexão, acessório, peça de esgoto, louça, metal e equipamento do hidrossanitário tem UMA ficha
 * (docs/hidro/CONTRATO.md §7) gerada por tools/gerar-hid-pecas.js em js/hidpecasdados.js:
 *   hidraulica    K / comprimento equivalente, Di, pressão de serviço, vazão e peso (AF/AQ), UHC, DN mínimo —
 *                 cada um com a REFERÊNCIA à tabela do HidNormas ({chave, filtro, coluna}) e a fonte;
 *   comercial     fabricante (código do catálogo), SINAPI (pela regra do Orçamento do modelo), preço com data-base;
 *   identificacao descrição padronizada, material, norma do produto, unidade; ícone renderizado.
 *
 * ⚠ O CÁLCULO LÊ A PEÇA PELA REFERÊNCIA, NÃO PELO NÚMERO GUARDADO. js/hidperda.js pergunta coefLocal() e consulta
 *   a tabela pela referência da ficha: a ficha decide QUAL linha é a da peça real (joelho 90 de PVC soldável DE 25,
 *   válvula de PÉ com crivo e não a de retenção comum…), a tabela carregada (real ou de teste) decide QUANTO vale.
 *   Assim o resultado com as tabelas reais não muda e o teste com fixture continua valendo. O valor guardado na
 *   ficha é o retrato do dia da geração — vai para o memorial e a lista, e tools/test-hid-pecas.js confere que bate.
 * ⚠ Sem ficha (peça fora do catálogo nativo) → null: o motor segue o caminho antigo (tabela direta), que registra
 *   a mesma pendência de sempre. Recado que mente é pior que recado nenhum: ficha nunca inventa coeficiente.
 * ⚠ Família IMPORTADA (biblioteca do escritório, .rfa): mapear(famImportada, idNativo) devolve a ficha do tipo
 *   nativo com origem "importada" — o coeficiente continua o do tipo nativo, e a lista diz que é mapeamento.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arquivo); } catch (e) {} }
    return null;
  }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  /* hid:fisica-inicio — APRESENTAÇÃO, não física: os números deste bloco são casas decimais e tamanhos de ícone */
  var TAMANHOS = [256, 512], LADO = 64;
  function br(v, c) { if (typeof v !== "number" || !isFinite(v)) return "—"; var p = Math.pow(10, c == null ? 2 : c); var s = (Math.round(v * p) / p).toFixed(c == null ? 2 : c).split("."); s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, "."); return s.join(","); }
  /* hid:fisica-fim */
  var PASTA = "img/hid-pecas/";

  /* ------------------------------------------------------------------ DADOS */
  var BASE = null;
  function reidratar(d) {
    var com = arr(d && d.comuns), sin = (d && d.sinapi) || {}, Cg = dep("HidCatalogo", "./hidcatalogo.js");
    function exp(o) {
      if (Array.isArray(o)) return o.map(exp);
      if (!o || typeof o !== "object") return o;
      if (o.$ != null && Object.keys(o).length === 1) return exp(copia(com[o.$]));
      var r = {}; Object.keys(o).forEach(function (k) { r[k] = exp(o[k]); }); return r;
    }
    var out = { meta: (d && d.meta) || {}, fontes: (d && d.fontes) || {}, sinapi: sin, roscaPonto: (d && d.roscaPonto) || null, fichas: [], porId: {} };
    arr(d && d.fichas).forEach(function (f0) {
      var f = exp(f0), cm = f.comercial || {};
      /* fabricante [fab, código, página, fonte] → objeto (a descrição volta do catálogo pelo código) */
      if (Array.isArray(cm.fabricante)) cm.fabricante = cm.fabricante.map(function (x) {
        if (!Array.isArray(x)) return x;
        var it = Cg && Cg.porCodigo ? Cg.porCodigo(x[0], x[1]) : null;
        return { fabricante: x[0], codigo: x[1], pagina: x[2], fonte: x[3], descricao: it ? it.descricao : "" };   // hid:ok índices da forma curta / dígitos da data (não é norma)
      });
      /* SINAPI "sistema|aplicação|código[|dn2]" → objeto com descrição e preço do dicionário */
      if (cm.sinapi && Array.isArray(cm.sinapi.porAplicacao)) cm.sinapi.porAplicacao = cm.sinapi.porAplicacao.map(function (l) {
        if (typeof l !== "string") return l;
        var p = l.split("|"), s = sin[p[2]] || {}, o = { sistema: p[0], aplicacao: p[1], codigo: p[2], unidade: s.unidade || "", descricao: s.descricao || "", preco: s.preco == null ? null : { valor: s.preco, unidade: s.unidade, data: s.data } };
        if (p[3] != null) o.dn2 = Number(p[3]);   // hid:ok índices da forma curta / dígitos da data (não é norma)
        return o;
      });
      out.fichas.push(f); out.porId[f.id] = f;
    });
    return out;
  }
  function base() {
    if (BASE) return BASE;
    BASE = reidratar(dep("HidPecasDados", "./hidpecasdados.js"));
    return BASE;
  }
  /* testes trocam o conjunto (null = sem fichas: o cálculo volta ao caminho da tabela direta) */
  function carregar(d) { BASE = d === null ? reidratar(null) : reidratar(d); return BASE; }
  function reiniciar() { BASE = null; }

  function ficha(id) { return base().porId[id] || null; }
  function todas(filtro) {
    var f = filtro || {};
    return base().fichas.filter(function (x) { return Object.keys(f).every(function (k) { return x[k] === f[k]; }); });
  }
  function resumo(fc) { return fc ? { id: fc.id, descricao: fc.identificacao.descricao, icone: fc.icone, classe: fc.classe, origem: fc.origem || "nativa", mapeadaDe: fc.mapeadaDe || null } : null; }

  /* ------------------------------------------------------------------ IDENTIFICAÇÃO pelo que o modelo tem */
  function idConexao(tipo, material, dn) { return ["cx", material, tipo, dn].join("."); }
  function conexao(tipo, material, dn) { return ficha(idConexao(tipo, material, dn)); }
  function tubo(material, dn) { return ficha(["tb", material, dn].join(".")); }
  function acessorio(ac, variante, dn) {
    if (variante) return ficha(["ac", ac, variante, dn].join("."));
    return todas({ classe: "acessorio", tipo: ac, dn: dn })[0] || null;
  }
  function peca(p, dn) { return ficha(["pc", p, dn].join(".")); }
  function familia(famId) { return ficha("fam." + famId); }

  /* a singularidade da TABELA DE PERDAS (nome que o js/hidaf.js deduz no nó) → a ficha da PEÇA REAL */
  var TE = { te_passagem_direta: 1, te_saida_lateral: 1, te_saida_bilateral: 1 };
  var SING = { entrada_normal: 1, saida_canalizacao: 1 };
  var ACESS = { registro_gaveta: 1, registro_pressao: 1, registro_esfera: 1, valvula_retencao: 1 };
  function fichaDaSingularidade(conexao0, material, dn, variante) {
    if (TE[conexao0]) return conexao("te", material, dn);
    if (SING[conexao0]) return ficha(["sg", material, conexao0, dn].join("."));
    if (ACESS[conexao0]) return acessorio(conexao0, variante, dn);
    if (conexao0 === "valvula_pe_crivo") return acessorio("valvula_retencao", "pe_crivo", dn);
    return conexao(conexao0, material, dn);
  }
  /* o coeficiente de perda localizada da peça: { peca, uso, ref, grandeza, valorFicha, fonte } · { peca, semValorTabelado } · null */
  function coefLocal(conexao0, material, dn, variante) {
    var fc = fichaDaSingularidade(conexao0, material, dn, variante); if (!fc) return null;
    var pl = (fc.hidraulica || {}).perdaLocal || {};
    if (pl.semValorTabelado) return { peca: resumo(fc), semValorTabelado: true, premissa: pl.premissa };
    var us = pl.usos || {}, chave = us[conexao0] ? conexao0 : null;
    /* D6 (27/10/2026): o joelho com bucha de latão usa a linha do joelho 90° (a ficha traz só `joelho90` e a premissa) */
    if (!chave && fc.classe === "conexao" && Object.keys(us).length === 1 && pl.premissa) chave = Object.keys(us)[0];
    /* acessório: a ficha da variante diz qual singularidade ela é (pé com crivo ≠ retenção comum) */
    if (!chave && fc.classe === "acessorio") chave = Object.keys(us)[0] || null;
    if (!chave || !us[chave] || !us[chave].ref) return { peca: resumo(fc), pendente: pl.pendente ? pl : null };
    var u = us[chave];
    return { peca: resumo(fc), uso: chave, ref: u.ref, grandeza: u.grandeza || "leq", valorFicha: u.valor, fonte: fonteDe(u.fonte) };
  }
  /* UHC da família no ponto de esgoto — só quando a ficha é do MESMO aparelho de norma que o motor escolheu
     (uso geral, mictório por tipo de descarga e aparelho forçado na entrada seguem a tabela direta) */
  function uhcDaFamilia(famId, aparelho) {
    var fc = familia(famId); if (!fc) return null;
    var H = fc.hidraulica || {};
    if (H.aparelho !== aparelho || !H.uhc || !H.uhc.ref) return null;
    return { peca: resumo(fc), uhc: { ref: H.uhc.ref, valorFicha: H.uhc.valor }, dnMin: H.dnMinRamalDescarga && H.dnMinRamalDescarga.ref ? { ref: H.dnMinRamalDescarga.ref, valorFicha: H.dnMinRamalDescarga.valor } : null };
  }
  function fonteDe(k) { var F = base().fontes[k]; return F ? copia(F) : (k ? { doc: k } : null); }
  function fonteCurta(k) {
    var F = base().fontes[k]; if (!F) return txt(k);
    /* curta de verdade (vai em célula de memorial e de planilha): o documento sem o subtítulo e sem o parêntese, a
       página quando há, e o tipo — o texto inteiro da fonte fica na seção de normas do memorial */
    var d = txt(F.doc).split(" (")[0].split(" — ")[0].split(" / ")[0].replace(/^Tigre - Manual T[ée]cnico.*$/, "Tigre, Manual Técnico " + (/(\d{4})/.exec(txt(F.doc)) || ["", ""])[1]).trim();   // hid:ok ano (4 dígitos) do título do manual
    if (d.length > LADO) d = d.slice(0, d.lastIndexOf(" ", LADO)) + "…";   /* TCC/tese: autor e começo do título (a referência inteira está na seção de normas) */
    var pg = F.pagina ? String(F.pagina).replace(/^PDF\s*/i, "") : "";
    return d + (pg ? ", " + pg : "") + (F.tipo === "secundaria" ? " · secundária" : (F.tipo === "primaria" ? " · primária" : (F.tipo ? " · " + F.tipo : "")));
  }

  /* ------------------------------------------------------------------ FAMÍLIA IMPORTADA → TIPO NATIVO */
  function mapear(famImportada, idNativo, nome) {
    var fc = ficha(idNativo); if (!fc) return null;
    var o = copia(fc);
    o.origem = "importada"; o.mapeadaDe = { familia: txt(famImportada), nome: txt(nome) };
    o.identificacao.descricao = (nome ? txt(nome) + " — " : "") + fc.identificacao.descricao + " (mapeada para o tipo nativo)";
    return o;
  }

  /* ------------------------------------------------------------------ ÍCONE */
  function icone(fc, tam) {
    var f = typeof fc === "string" ? ficha(fc) : fc, t = TAMANHOS.indexOf(tam) >= 0 ? tam : TAMANHOS[0];
    return f && f.icone ? PASTA + f.icone + "-" + t + ".png" : null;
  }
  function icones() { var s = {}; base().fichas.forEach(function (f) { if (f.icone) s[f.icone] = 1; }); return Object.keys(s).sort(); }
  /* carrega os PNG como data URL (memorial e planilha saem com a imagem dentro). buscar(url) → Promise<data URL>;
     sem buscar, usa fetch + FileReader do navegador. Ícone que falta não derruba: fica fora do mapa. */
  var CACHE = {};
  function carregarIcones(nomes, tam, buscar) {
    var t = TAMANHOS.indexOf(tam) >= 0 ? tam : TAMANHOS[0], out = {};
    var b = buscar || function (url) {
      return global.fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); }).then(function (bl) {
        return new Promise(function (res, rej) { var fr = new global.FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = rej; fr.readAsDataURL(bl); });
      });
    };
    var lista = arr(nomes).filter(function (n, i, a) { return n && a.indexOf(n) === i; });
    return Promise.all(lista.map(function (n) {
      var k = n + "-" + t;
      if (CACHE[k]) { out[n] = CACHE[k]; return null; }
      return Promise.resolve().then(function () { return b(PASTA + n + "-" + t + ".png"); }).then(function (d) { if (d) { CACHE[k] = d; out[n] = d; } }, function () {});
    })).then(function () { return out; });
  }
  function iconesEmCache(tam) { var t = TAMANHOS.indexOf(tam) >= 0 ? tam : TAMANHOS[0], o = {}; Object.keys(CACHE).forEach(function (k) { var m = /^(.*)-(\d+)$/.exec(k); if (m && Number(m[2]) === t) o[m[1]] = CACHE[k]; }); return o; }

  /* ------------------------------------------------------------------ PREÇO pela aplicação do trecho */
  function precoPara(fc, aplicacao, sistema, dn2) {
    if (!fc) return null;
    var cm = fc.comercial || {}, s = cm.sinapi || {}, ls = arr(s.porAplicacao);
    var l = ls.filter(function (x) { return (!aplicacao || x.aplicacao === aplicacao) && (!sistema || x.sistema === sistema || (sistema === "ventilacao" && x.sistema === "esgoto") || (sistema === "agua_quente" && x.sistema === "agua_fria")) && (dn2 == null || x.dn2 == null || Number(x.dn2) === Number(dn2)); })[0];
    if (l && l.preco) return { codigo: l.codigo, descricao: l.descricao, unidade: l.unidade, valor: l.preco.valor, data: l.preco.data, criterio: "composição da aplicação (" + l.aplicacao + ")", estimativa: false };
    var p = cm.preco || {};
    if (p.pendente || p.naoSeAplica) return { codigo: null, valor: null, data: null, pendente: true, criterio: p.motivo || "", fonteNecessaria: p.fonteNecessaria || "" };
    var sd = p.codigo ? base().sinapi[p.codigo] : null;
    return { codigo: p.estimativa ? null : (p.codigo || s.adotado || null), codigoReferencia: p.codigoReferencia || null, descricao: sd ? sd.descricao : (p.codigoReferencia && base().sinapi[p.codigoReferencia] ? base().sinapi[p.codigoReferencia].descricao : ""),
             unidade: p.unidade || "", valor: p.valor, data: p.data, criterio: p.criterio || "", estimativa: !!p.estimativa,
             /* pendências finais (18/10/2026): o preço público de varejo do produto sem SINAPI (o maior de 3 lojas, com data e URL) */
             referenciaMercado: !!p.referenciaMercado, loja: p.loja || null, url: p.url || null };
  }
  function dataTxt(d) { var m = /^(\d{4})-(\d{2})$/.exec(txt(d)); return m ? m[2] + "/" + m[1] : txt(d); }   // hid:ok índices da forma curta / dígitos da data (não é norma)

  /* ------------------------------------------------------------------ LISTA DE MATERIAL
   * qto = BimInst.qto(estado, avaliarFam) (tubos, conexoes, pecas, acessorios); familias = estado.familias
   * ([{ famId, tipoId }]). Cada linha: ficha + quantidade + preço da aplicação + o coeficiente que o cálculo usa. */
  function linha(fc, extra) {
    var o = { ficha: fc ? fc.id : null, classe: fc ? fc.classe : (extra.classe || ""), icone: fc ? fc.icone : null, descricao: fc ? fc.identificacao.descricao : extra.descricao,
              material: fc ? fc.identificacao.material : "", unidade: extra.unidade || (fc ? fc.identificacao.unidade : "un"), dn: extra.dn == null ? (fc ? fc.dn : null) : extra.dn,
              quantidade: extra.quantidade, sistema: extra.sistema || "", norma: "", normaPendente: false, fabricante: [], coeficientes: [], semFicha: !fc };
    if (fc) {
      var n = fc.identificacao.norma || {};
      o.norma = n.texto || ""; o.normaPendente = !!n.pendente; o.normaFonte = n.fonte ? fonteCurta(n.fonte) : (n.fonteNecessaria || "");
      o.fabricante = arr((fc.comercial || {}).fabricante).map(function (x) { return x.fabricante + " " + x.codigo; });
      o.coeficientes = coeficientes(fc);
      o.origem = fc.origem || "nativa";
    }
    o.preco = fc ? precoPara(fc, extra.aplicacao, extra.sistema, extra.dn2) : { pendente: true, valor: null, criterio: "peça sem ficha técnica no catálogo nativo" };
    if (extra.produto) { o.fabricante = [extra.produto[1] + " " + extra.produto[2]]; o.produto = extra.produto[3]; if (extra.produto[4] && base().sinapi[extra.produto[4]]) { var sd = base().sinapi[extra.produto[4]]; o.preco = { codigo: extra.produto[4], descricao: sd.descricao, unidade: sd.unidade, valor: sd.preco, data: sd.data, criterio: "regra do produto", estimativa: false }; }   // hid:ok índices da forma curta do produto (não é norma)
      /* FRENTE H6: o preço de MERCADO do produto escolhido (o volume do boiler, a potência do elétrico): produto[5] */
      var pm5 = extra.produto[5]; if (pm5 && typeof pm5.valor === "number") o.preco = { codigo: null, valor: pm5.valor, unidade: pm5.unidade || "UN", data: pm5.data, criterio: pm5.criterio, estimativa: false, referenciaMercado: true, provisorio: !!pm5.provisorio }; }   // hid:ok índices da forma curta / dígitos da data (não é norma)
    o.total = o.preco && typeof o.preco.valor === "number" && typeof o.quantidade === "number" ? Math.round(o.preco.valor * o.quantidade * 100) / 100 : null;
    return o;
  }
  /* os coeficientes de cálculo da ficha, em texto curto com a fonte (memorial e lista) */
  function coeficientes(fc) {
    var H = fc.hidraulica || {}, out = [];
    function v(rot, x, un) { if (!x) return; if (x.pendente) out.push({ rotulo: rot, texto: "pendente — falta " + (x.fonteNecessaria || x.motivo), pendente: true }); else if (x.valor != null) out.push({ rotulo: rot, valor: x.valor, unidade: un != null ? un : (x.unidade || ""), texto: br(Number(x.valor), 2) + (un != null ? un : (x.unidade ? " " + x.unidade : "")), fonte: fonteCurta(x.fonte), ref: x.ref }); }
    var pl = H.perdaLocal || {};
    Object.keys(pl.usos || {}).forEach(function (u) { var x = pl.usos[u]; if (x) v((x.grandeza === "k" ? "K " : "Leq ") + u.replace(/_/g, " "), x, x.grandeza === "k" ? "" : " m"); });
    if (pl.semValorTabelado) out.push({ rotulo: "perda localizada", texto: "desprezada (premissa declarada: sem valor tabelado)" });
    else if (pl.premissa) out.push({ rotulo: "premissa", texto: pl.premissa });
    if (pl.pendente) out.push({ rotulo: "perda localizada", texto: "pendente — falta " + pl.fonteNecessaria, pendente: true });
    v("Di", H.diametroInterno, " mm");
    if (H.pressaoServico && H.pressaoServico.max) v("pressão máx. de serviço", H.pressaoServico.max, " kPa");
    v("vazão AF", H.vazaoAF, " L/s"); v("peso AF", H.pesoAF, ""); v("vazão AQ", H.vazaoAQ && !H.vazaoAQ.naoSeAplica ? H.vazaoAQ : null, " L/s"); v("peso AQ", H.pesoAQ && !H.pesoAQ.naoSeAplica ? H.pesoAQ : null, "");
    v("UHC", H.uhc && !H.uhc.naoSeAplica && !H.uhc.verPeca ? H.uhc : null, ""); v("DN mín. ramal de descarga", H.dnMinRamalDescarga, " mm"); v("DN mín. sub-ramal", H.dnMinSubRamal, " mm");
    if (H.pressaoMin && H.pressaoMin.valor != null) v("pressão mín.", H.pressaoMin, " kPa");
    if (H.pressaoMax) v("pressão estática máx.", H.pressaoMax, " kPa");
    return out;
  }
  /* Casa 487 (F9): nome legível na lista de material para a peça sem ficha (o id interno da família nunca vai ao cliente). Nomes = os das famílias (js/hidpiscinafam.js). */
  var NOME_LEGIVEL = {
    "hid-pisc-casa-maquinas": "Casa de máquinas da piscina", "hid-pisc-bomba": "Motobomba autoescorvante com pré-filtro (modelo a definir pelo fornecedor da piscina)",
    "hid-pisc-filtro": "Filtro da piscina (modelo a definir pelo fornecedor da piscina)", "hid-pisc-quadro": "Quadro de comando da piscina", "hid-pisc-skimmer": "Coadeira (skimmer)",
    "hid-pisc-aspiracao": "Dispositivo de aspiração", "hid-pisc-retorno": "Dispositivo de retorno", "hid-pisc-ralo": "Ralo de fundo antiaprisionamento",
    "hid-pisc-emergencia": "Botão de parada de emergência", "hid-pisc-registro": "Registro de esfera (piscina)", "hid-pisc-reposicao": "Ponto de reposição de água (bica de descarga livre)",
    "hid-pisc-bomba-hidro": "Motobomba da hidromassagem", "hid-pisc-hidro": "Bocal de hidromassagem", "hid-pisc-succao-hidro": "Sucção de parede da hidromassagem (grelha antiaprisionamento)",
    "hid-pisc-refletor": "Refletor subaquático (LED)", "hid-pisc-poco-drenagem": "Poço de drenagem da casa de máquinas (bomba submersível)", "hid-pisc-derivacao": "Derivação do aquecimento (tê com registro)",
    "ra-cat-tanque-lavanderia-gabinete": "tanque da lavanderia", "c487-coz-ilha": "ilha da cozinha", "c487-banho-bancada": "bancada do banheiro", "c487-banho-hidromassagem": "hidromassagem da suíte"
  };
  /* a linha do tubo sem ficha no catálogo (ex.: o coletor pluvial enterrado) não leva a chave de código do material */
  var NOME_MATERIAL = { pvc_esgoto_enterrado: "PVC ocre para coletor enterrado (NBR 7362, junta elástica)", pvc_soldavel: "PVC soldável", pvc_roscavel: "PVC roscável", pvc_esgoto: "PVC esgoto série normal", pvc_serie_r: "PVC série reforçada" };
  function nomeMaterial(m) { return Object.prototype.hasOwnProperty.call(NOME_MATERIAL, m) ? NOME_MATERIAL[m] : String(m == null ? "" : m).replace(/_/g, " "); }
  function nomeLegivel(id) { return Object.prototype.hasOwnProperty.call(NOME_LEGIVEL, id) ? NOME_LEGIVEL[id] : id; }
  function listaMaterial(q, familias, opcoes) {
    var out = [], op = opcoes || {};
    q = q || {};
    arr(q.tubos).forEach(function (g) { out.push(linha(tubo(g.material, g.dn), { classe: "tubo", descricao: "Tubo " + nomeMaterial(g.material) + " DN " + g.dn, unidade: g.unidade || "m", dn: g.dn, quantidade: g.quantidade, sistema: g.sistema, aplicacao: g.aplicacao })); });
    /* peça de rosca/composta (ponto de água "25 × 1/2\"", adaptador do registro): a ficha é da chave "DNxROSCA"; a premissa da dedução (a rosca adotada) vai na linha */
    arr(q.conexoes).forEach(function (g) {
      var chaveF = typeof g.dn2 === "string" && g.dn2 !== "" ? g.dn + "x" + g.dn2 : g.dn, fcx = conexao(g.tipo, g.material, g.chave || chaveF);
      var l = linha(fcx, { classe: "conexao", descricao: g.nome || g.tipo, unidade: "un", dn: g.dn, dn2: g.dn2, quantidade: g.n, sistema: g.sistema, aplicacao: g.aplicacao });
      if (g.premissa) l.premissas = [g.premissa];
      if (g.incluso) { l.incluso = g.incluso; l.total = null; l.preco = { pendente: false, valor: null, incluso: true, criterio: g.incluso }; }
      out.push(l);
    });
    /* M3 (frente 1c): o ponto de água sem rosca padrão aparece na lista como PENDÊNCIA (peça de ligação a definir) — não some do levantamento */
    arr(q.pontosSemRosca).forEach(function (p) {
      var l = linha(null, { classe: "pendencia", descricao: "Peça de ligação do ponto de água (" + nomeLegivel(p.famId || "aparelho") + ")", unidade: "un", quantidade: 1, sistema: "agua_fria" });
      l.premissas = [p.texto || "ponto de água sem rosca padrão — peça de ligação a definir"]; l.preco = { pendente: true, valor: null, criterio: l.premissas[0] }; l.pendencia = true;
      out.push(l);
    });
    arr(q.acessorios).forEach(function (g) { out.push(linha(acessorio(g.acessorio || g.peca, g.variante, g.dnTubo || g.dn), { classe: "acessorio", descricao: g.nome || g.acessorio, unidade: "un", quantidade: g.n, sistema: g.sistema })); });
    arr(q.pecas).forEach(function (g) { out.push(linha(peca(g.peca, g.dn), { classe: "peca", descricao: g.nome || g.peca, unidade: "un", dn: g.dn, quantidade: g.n, sistema: g.sistema, aplicacao: g.sistema === "pluvial" ? "pluvial" : "esgoto" })); });
    /* louças, metais e equipamentos: uma linha por família × produto (o código do fabricante é do tipo escolhido) */
    var grupos = {}, ordem = [];
    arr(familias).forEach(function (f) {
      if (!f || !f.famId) return;
      var fc = familia(f.famId) || (op.mapeamentos && op.mapeamentos[f.famId] ? mapear(f.famId, op.mapeamentos[f.famId], f.nome) : null);
      if (!fc && !/^(hid|ra-clim)-/.test(f.famId)) return;
      /* Casa 487 R05 (HID-12): equipamento lançado só como RESERVA DE ESPAÇO (ex.: condensadora a definir no projeto de climatização) não é material
         do hidro — linha própria, marcada, fora da compra (mesmo padrão do "incluso": total nulo) */
      var reserva = /\breserva\b/i.test(txt(f.comentarios) + " " + txt(f.inst && (f.inst.Nome || f.inst.nome)));
      var k = f.famId + "|" + (f.tipoId || "") + (reserva ? "|reserva" : "");
      if (!grupos[k]) { grupos[k] = { fc: fc, famId: f.famId, tipoId: f.tipoId, n: 0, reserva: reserva }; ordem.push(k); }
      grupos[k].n++;
    });
    ordem.forEach(function (k) {
      var g = grupos[k], prod = g.fc ? arr((g.fc.comercial || {}).produtos).filter(function (p) { return p[0] === g.tipoId; })[0] : null;
      var lf = linha(g.fc, { classe: "louca", descricao: nomeLegivel(g.famId), unidade: "un", quantidade: g.n, produto: prod || null });
      if (g.reserva) { lf.descricao = txt(lf.descricao) + " - RESERVA DE ESPAÇO (não compra no hidro)"; var crit = "reserva de espaço: equipamento a definir em projeto próprio (climatização) — não entra na compra do hidrossanitário"; lf.reserva = true; lf.incluso = crit; lf.total = null; lf.preco = { pendente: false, valor: null, incluso: true, criterio: crit }; }
      out.push(lf);
    });
    return out;
  }
  /* as peças que o CÁLCULO usou (conexões dos trechos de AF/AQ com a ficha e o ponto de esgoto com o UHC da ficha) */
  function doResultado(r) {
    var vistos = {}, out = [];
    function add(p, coef, onde) {
      if (!p || !p.id) return;
      if (!vistos[p.id]) { vistos[p.id] = { ficha: p.id, descricao: p.descricao, icone: p.icone, usos: [], trechos: [] }; out.push(vistos[p.id]); }
      var v = vistos[p.id]; if (coef && v.usos.indexOf(coef) < 0) v.usos.push(coef); if (onde && v.trechos.indexOf(onde) < 0) v.trechos.push(onde);
    }
    var S = (r && r.sistemas) || {};
    ["agua_fria", "agua_quente"].forEach(function (s) {
      arr(S[s] && S[s].trechos).forEach(function (t) { arr(t.conexoes).forEach(function (c) { if (c.peca) add(c.peca, c.tipo + (c.leq_m != null ? ": Leq " + br(c.leq_m, 2) + " m" : (c.k != null ? ": K " + br(c.k, 2) : ": sem valor tabelado")), t.aresta || t.id); }); });
    });
    arr(S.esgoto && S.esgoto.pontos).forEach(function (p) { if (p.peca && typeof p.peca === "object") add(p.peca, "UHC " + br(p.uhc, 0), p.famInst || p.no); if (p.ficha) add(p.ficha, "UHC " + br(p.uhc, 0), p.famInst || p.no); });
    out.forEach(function (x) { var fc = ficha(x.ficha); x.coeficientes = fc ? coeficientes(fc) : []; x.norma = fc ? (fc.identificacao.norma || {}).texto || "" : ""; });
    return out;
  }

  /* ------------------------------------------------------------------ HTML de catálogo (memorial e manual) */
  function htmlCatalogo(linhas, icones, opcoes) {
    var op = opcoes || {}, ic = icones || {}, h = '<table class="' + esc(op.classe || "catalogo") + '" style="width:100%;border-collapse:collapse"><thead><tr>' +
      ["Peça", "Descrição", "Qtd.", "Fabricante", "SINAPI", "Norma do produto", "Coeficientes de cálculo (fonte)"].map(function (c) { return '<th style="text-align:left">' + c + "</th>"; }).join("") + "</tr></thead><tbody>";
    arr(linhas).forEach(function (l) {
      var src = l.icone ? (ic[l.icone] || (op.base ? op.base + PASTA + l.icone + "-" + TAMANHOS[TAMANHOS.length - 1] + ".png" : "")) : "";
      var img = src ? '<img class="peca-ico" src="' + esc(src) + '" alt="' + esc(l.descricao) + '" width="' + (op.lado || LADO) + '" height="' + (op.lado || LADO) + '">' : '<span class="peca-ico vazio">sem ícone</span>';
      var pr = l.preco || {}, sin = pr.codigo ? esc(pr.codigo) + (pr.data ? " (" + esc(dataTxt(pr.data)) + ")" : "") : (pr.estimativa ? "estimativa ref. " + esc(pr.codigoReferencia || "") : '<span class="pend">pendente</span>');
      h += "<tr><td class=\"ico\">" + img + "</td><td><b>" + esc(l.descricao) + "</b>" + (l.produto ? "<br><small>" + esc(l.produto) + "</small>" : "") + (l.origem === "importada" ? "<br><small>família importada mapeada</small>" : "") + "</td>" +
        "<td>" + (typeof l.quantidade === "number" ? br(l.quantidade, l.unidade === "m" ? 2 : 0) + " " + esc(l.unidade) : "—") + "</td>" +
        "<td>" + (arr(l.fabricante).length ? arr(l.fabricante).map(esc).join("<br>") : "—") + "</td><td>" + sin + "</td>" +
        "<td>" + (l.norma ? esc(l.norma) : (l.normaPendente ? '<span class="pend">não consta no catálogo</span>' : "—")) + "</td>" +
        "<td>" + (arr(l.coeficientes).length ? arr(l.coeficientes).map(function (c) { return esc(c.rotulo) + ": " + (c.pendente ? '<span class="pend">' + esc(c.texto) + "</span>" : "<b>" + esc(c.texto) + "</b>" + (c.fonte ? ' <small>(' + esc(c.fonte) + ")</small>" : "")); }).join("<br>") : "—") +
        (arr(l.premissas).length ? "<br><small><b>Premissa:</b> " + arr(l.premissas).map(esc).join("<br>") + "</small>" : "") + "</td></tr>";
    });
    return h + "</tbody></table>";
  }

  var HidPecas = {
    VERSAO: 1, PASTA: PASTA, TAMANHOS: TAMANHOS,
    carregar: carregar, reiniciar: reiniciar, ficha: ficha, todas: todas, resumo: resumo,
    idConexao: idConexao, conexao: conexao, tubo: tubo, acessorio: acessorio, peca: peca, familia: familia,
    fichaDaSingularidade: fichaDaSingularidade, coefLocal: coefLocal, uhcDaFamilia: uhcDaFamilia, mapear: mapear,
    icone: icone, icones: icones, carregarIcones: carregarIcones, iconesEmCache: iconesEmCache,
    precoPara: precoPara, coeficientes: coeficientes, listaMaterial: listaMaterial, doResultado: doResultado, htmlCatalogo: htmlCatalogo,
    fonte: fonteDe, fonteCurta: fonteCurta, dataTxt: dataTxt,
    roscaPonto: function () { return base().roscaPonto; },   /* tabela RA de rosca do ponto de água (dados-fonte/hidro/pecas/rosca-ponto.json) */
    meta: function () { return base().meta; }, sinapi: function (cod) { return base().sinapi[cod] || null; }
  };
  global.HidPecas = HidPecas;
  if (typeof module !== "undefined" && module.exports) module.exports = HidPecas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
