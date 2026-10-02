/* =====================================================================
 * catalogoforn.js — CATÁLOGO DO FORNECEDOR (motor puro)
 *
 * O catálogo de um fornecedor vira INSUMO PRÓPRIO do banco da conta
 * (fonte PROPRIA), com preço, data e `fornecedorRef {id, nome}` apontando o
 * cadastro do fornecedor pelo ID. É esse carimbo que faz a requisição achar
 * o item, a cotação sugerir quem cotar e o pedido sair para o fornecedor
 * certo. Especificação: ESPEC-CATALOGO-FORNECEDOR.md.
 *
 * Este arquivo não toca em DOM, Store nem rede: recebe dados, devolve dados.
 * A tela (js/gestao.js, "Catálogo do fornecedor") só orquestra.
 *
 * ⚠ SEM PREÇO NÃO SE INVENTA ZERO. Linha que a leitura não conseguiu
 *   precificar fica PENDENTE e não vai ao banco. Um insumo a R$ 0,00 numa
 *   requisição derruba o total de aprovação por valor (ver a nota do total
 *   parcial em formRequisicoes) — e ninguém confere o que parece certo.
 * ⚠ PREÇO LIDO DE IMAGEM ERRA DÍGITO. As conferências daqui são as que
 *   pegaram erro de verdade na 1ª carga feita à mão (catálogo de madeireira
 *   lido no WhatsApp, 02/10/2026): R$/un = largura × comprimento × R$/m²
 *   quando o catálogo traz o m², e o mesmo R$/m numa família de comprimentos.
 *   Alerta não bloqueia — quem decide é a pessoa, na revisão.
 * ⚠ VERSÃO NOVA NÃO APAGA ITEM. O que sumiu do catálogo é MARCADO
 *   (`foraDoCatalogoDesde`), nunca removido: composição, orçamento e
 *   requisição antigos podem apontar o código.
 * ⚠ CÓDIGO REPETIDO SUBSTITUI O ITEM DO CLIENTE (`_propriaGravarVarios`
 *   troca por código). Em 28/09/2026 uma carga sobrescreveu 14 insumos de
 *   um cliente assim. O plano nunca reaproveita código de outro dono.
 * ===================================================================== */
(function (global) {
  "use strict";

  var CatalogoForn = {};
  var LEMBRETE_DIAS_PADRAO = 15, LEMBRETE_MIN = 7, LEMBRETE_MAX = 90;
  CatalogoForn.LEMBRETE_DIAS_PADRAO = LEMBRETE_DIAS_PADRAO;

  function txt(v) { return v == null ? "" : String(v); }
  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function semAcento(s) {
    s = txt(s);
    try { return s.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) { return s; }
  }
  function norm(s) { return semAcento(s).toLowerCase().replace(/[^a-z0-9,.%/]+/g, " ").replace(/\s+/g, " ").trim(); }
  function r2(n) { return Math.round(n * 100) / 100; }
  function br(n, c) { return Number(n).toFixed(c == null ? 2 : c).replace(".", ","); }
  CatalogoForn.norm = norm;

  /* ------------------------------------------------------------------
   * PREÇO EM GRAFIA BR
   * "R$ 1.234,56" → 1234.56 · "21,42" → 21.42 · "1.234" → 1234 (milhar)
   * "12.5" → 12.5 (ponto decimal só quando NÃO é milhar). Inválido → null.
   * ------------------------------------------------------------------ */
  CatalogoForn.lerPreco = function (v) {
    if (typeof v === "number") return isFinite(v) && v >= 0 ? r2(v) : null;
    var s = txt(v).replace(/R\$/gi, "").replace(/\s+/g, "");
    if (!s) return null;
    if (!/^\d[\d.,]*$/.test(s)) return null;
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    var n = parseFloat(s);
    return isFinite(n) && n >= 0 ? r2(n) : null;
  };

  /* ------------------------------------------------------------------
   * UNIDADE — o vocabulário curto do banco (UN, M, M2, M3, KG, L, CX, PC…)
   * ------------------------------------------------------------------ */
  var UNID = { "UN": "UN", "UND": "UN", "UNID": "UN", "UNIDADE": "UN", "PC": "UN", "PÇ": "UN", "PCA": "UN", "PECA": "UN", "PÇA": "UN",
    "M": "M", "ML": "M", "MT": "M", "METRO": "M", "M2": "M2", "M²": "M2", "M3": "M3", "M³": "M3", "KG": "KG", "L": "L", "LT": "L",
    "CX": "CX", "CAIXA": "CX", "PCT": "PCT", "PACOTE": "PCT", "SC": "SC", "SACO": "SC", "DZ": "DZ", "CJ": "CJ", "JG": "CJ", "TON": "T", "T": "T" };
  CatalogoForn.unidade = function (u) {
    var k = semAcento(txt(u)).toUpperCase().replace(/[^A-Z0-9²³Ç]/g, "");
    k = k.replace("²", "2").replace("³", "3");
    return UNID[k] || (k && k.length <= 5 ? k : "UN");
  };

  /* ------------------------------------------------------------------
   * MEDIDAS NA DESCRIÇÃO — "CAIBRO 6X12X3,00", "6 × 12 CM × 3,00 M"
   * → { larg, esp, comp } (cm, cm, m). Sem as três medidas → null.
   * O último número é o comprimento em metros quando ≤ 12 (peça de madeira
   * serrada); os dois primeiros são a seção em centímetros.
   * ------------------------------------------------------------------ */
  CatalogoForn.medidas = function (descricao) {
    var s = semAcento(txt(descricao)).toUpperCase().replace(/×/g, "X");
    var m = /(\d+(?:[.,]\d+)?)\s*(?:CM)?\s*X\s*(\d+(?:[.,]\d+)?)\s*(?:CM)?\s*X\s*(\d+(?:[.,]\d+)?)\s*(?:M\b)?/.exec(s);
    if (!m) return null;
    var a = parseFloat(m[1].replace(",", ".")), b = parseFloat(m[2].replace(",", ".")), c = parseFloat(m[3].replace(",", "."));
    if (!(a > 0 && b > 0 && c > 0) || c > 12) return null;
    return { larg: a, esp: b, comp: c };
  };

  /* ------------------------------------------------------------------
   * TEXTO (PDF) → ITENS
   * Uma linha com preço vira item. A descrição é a própria linha sem o preço
   * e sem a unidade; linha só com preço herda a descrição da linha de cima
   * (catálogo em arte: "ASSOALHO 10,5X2X3,00" numa linha, "R$21,42 UN" na
   * outra). Segundo preço seguido de M²/M2 é o preço por m² (conferência).
   * ------------------------------------------------------------------ */
  /* ⚠ fim da unidade por lookahead, não por \b: "²" não é caractere de
     palavra, e com \b o "M²" casava como "M" — o preço por m² sumia */
  var RE_PRECO = /(R\$\s*)?(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})(?:\s*(?:\/\s*)?(UN|UND|UNID|PC|PÇ|M²|M2|M³|M3|ML|M|KG|L|CX|PCT|SC|CJ)(?![A-Za-z0-9²³]))?/gi;
  CatalogoForn.extrairDeTexto = function (texto) {
    var linhas = txt(texto).split(/\r?\n/), itens = [], ultimaSemPreco = "", ignoradas = 0;
    linhas.forEach(function (bruta) {
      var l = bruta.replace(/\s+/g, " ").trim();
      if (!l) return;
      RE_PRECO.lastIndex = 0;
      var achados = [], m;
      while ((m = RE_PRECO.exec(l)) !== null) achados.push({ txt: m[0], valor: m[2], un: m[3] || "", temRS: !!m[1], ini: m.index });
      /* número com vírgula sem "R$" e sem unidade dentro de uma medida
         ("10,5X2X3,00") não é preço: só conta o que tem R$ ou unidade, ou o
         ÚLTIMO número da linha quando nenhum tem */
      var precos = achados.filter(function (a) { return a.temRS || a.un; });
      if (!precos.length && achados.length) {
        var ult = achados[achados.length - 1];
        var depois = l.slice(ult.ini + ult.txt.length);
        if (!/^\s*[xX×]/.test(depois) && !/[xX×]\s*$/.test(l.slice(0, ult.ini))) precos = [ult];
      }
      if (!precos.length) { ultimaSemPreco = l; ignoradas++; return; }
      var p = precos[0], pm2 = null;
      precos.slice(1).forEach(function (q) { if (/M[²2]/i.test(q.un) && pm2 === null) pm2 = CatalogoForn.lerPreco(q.valor); });
      if (/M[²2]/i.test(p.un) && precos.length > 1) { pm2 = CatalogoForn.lerPreco(p.valor); p = precos[1]; }
      var desc = l;
      precos.forEach(function (q) { desc = desc.replace(q.txt, " "); });
      desc = desc.replace(/R\$/gi, " ").replace(/\s+/g, " ").replace(/^[\s\-–—:|]+|[\s\-–—:|]+$/g, "").trim();
      if (desc.length < 3 && ultimaSemPreco) desc = ultimaSemPreco;
      if (desc.length < 3) { ignoradas++; return; }
      var it = { descricao: desc, unidade: CatalogoForn.unidade(p.un || "UN"), preco: CatalogoForn.lerPreco(p.valor), linha: l };
      if (pm2 !== null) it.precoM2 = pm2;
      itens.push(it);
      ultimaSemPreco = "";
    });
    return { itens: itens, ignoradas: ignoradas };
  };

  /* ------------------------------------------------------------------
   * RESPOSTA DA IA → ITENS
   * Aceita o formato do leitor de catálogo (`itens[{descricao, unidade,
   * preco, precoPor, precoM2}]`) e o do leitor de NOTA, que é o que o
   * servidor antigo devolve (`itens[{descricao, unidade, valorUnitario}]`).
   * ------------------------------------------------------------------ */
  CatalogoForn.deIA = function (dados) {
    var lista = arr(dados && dados.itens);
    return lista.map(function (x) {
      x = x || {};
      var desc = txt(x.descricao || x.produto || x.nome).replace(/\s+/g, " ").trim();
      if (x.medidas && desc.indexOf(txt(x.medidas)) < 0) desc = (desc + " " + txt(x.medidas)).trim();
      var preco = CatalogoForn.lerPreco(x.preco != null && x.preco !== "" ? x.preco : (x.valorUnitario != null && x.valorUnitario !== "" ? x.valorUnitario : x.valor));
      if (preco === 0) preco = null;          // "0" da IA é campo vazio, não preço
      var it = { descricao: desc, unidade: CatalogoForn.unidade(x.unidade || "UN"), preco: preco };
      var pm2 = CatalogoForn.lerPreco(x.precoM2);
      if (pm2) it.precoM2 = pm2;
      if (x.observacao) it.observacao = txt(x.observacao).slice(0, 200);
      return it;
    }).filter(function (it) { return it.descricao.length >= 3; });
  };

  /* ------------------------------------------------------------------
   * CONFERÊNCIA — devolve cópias com `alertas: [texto]` e `pendente`
   * ------------------------------------------------------------------ */
  CatalogoForn.conferir = function (itens) {
    var out = arr(itens).map(function (it) {
      var c = {}; for (var k in it) if (Object.prototype.hasOwnProperty.call(it, k)) c[k] = it[k];
      c.alertas = [];
      c.pendente = !(c.preco > 0);
      if (c.pendente) c.alertas.push("sem preço — não vai ao banco até ser preenchido");
      return c;
    });
    // R$/m² declarado
    out.forEach(function (c) {
      if (!(c.preco > 0) || !(c.precoM2 > 0)) return;
      var md = CatalogoForn.medidas(c.descricao);
      if (!md) return;
      var calc = r2(md.larg / 100 * md.comp * c.precoM2);
      if (Math.abs(calc - c.preco) > 0.02) c.alertas.push("não bate com o R$/m² do catálogo (" + String(md.larg).replace(".", ",") + " cm × " + br(md.comp) + " m × R$ " + br(c.precoM2) + " = R$ " + br(calc) + ")");
    });
    // família: mesma seção, comprimentos diferentes → R$/m parecido
    var fam = {};
    out.forEach(function (c, i) {
      if (!(c.preco > 0)) return;
      var md = CatalogoForn.medidas(c.descricao);
      if (!md) return;
      /* o nome da peça é o que vem ANTES da primeira medida ("caibro",
         "pinus tratado em autoclave sarrafo") — a 1ª palavra juntaria
         peças diferentes da mesma linha de produtos */
      var nome = norm(c.descricao).split(/\d/)[0].trim();
      var k = nome + "|" + md.larg + "x" + md.esp;
      (fam[k] = fam[k] || []).push({ i: i, pm: c.preco / md.comp });
    });
    Object.keys(fam).forEach(function (k) {
      var g = fam[k];
      if (g.length < 3) return;                    // com 2 não dá para saber qual dos dois destoa
      var v = g.map(function (x) { return x.pm; }).sort(function (a, b) { return a - b; });
      var med = v[Math.floor(v.length / 2)];
      g.forEach(function (x) {
        if (Math.abs(x.pm - med) / med > 0.25) out[x.i].alertas.push("preço por metro destoa dos outros comprimentos da mesma peça (R$ " + br(x.pm) + "/m × mediana R$ " + br(med) + "/m) — confira o dígito");
      });
    });
    // repetido
    var vistos = {};
    out.forEach(function (c) {
      var k = norm(c.descricao) + "|" + c.unidade;
      if (vistos[k]) c.alertas.push("item repetido na lista");
      vistos[k] = 1;
    });
    return out;
  };

  /* ------------------------------------------------------------------
   * SIGLA DO FORNECEDOR (código PROP-<SIGLA>-NNN)
   * Primeira letra da primeira palavra significativa + as duas ÚLTIMAS
   * consoantes dela ("Tratamix" → TMX). Ocupada por outro fornecedor → as
   * outras combinações; esgotou → letra + letra + dígito.
   * ------------------------------------------------------------------ */
  var PARADAS = { LTDA: 1, ME: 1, EPP: 1, EIRELI: 1, SA: 1, S: 1, A: 1, DE: 1, DA: 1, DO: 1, DAS: 1, DOS: 1, E: 1, COMERCIO: 1, COM: 1, IND: 1, INDUSTRIA: 1 };
  CatalogoForn.sigla = function (nome, emUso) {
    emUso = emUso || {};
    var pal = semAcento(txt(nome)).toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(function (p) { return p && !PARADAS[p]; });
    var w = pal[0] || "FORNECEDOR";
    if (w.length < 3) w = (w + (pal[1] || "XX")).replace(/\s/g, "");
    var cons = w.slice(1).replace(/[^BCDFGHJKLMNPQRSTVWXYZ]/g, "").split("");
    var cand = [];
    if (cons.length >= 2) cand.push(w[0] + cons[cons.length - 2] + cons[cons.length - 1]);
    if (cons.length >= 2) cand.push(w[0] + cons[0] + cons[1]);
    cand.push(w.slice(0, 3));
    for (var i = 0; i < cons.length; i++) for (var j = i + 1; j < cons.length; j++) cand.push(w[0] + cons[i] + cons[j]);
    for (var d = 2; d <= 9; d++) cand.push(w.slice(0, 2) + d);
    for (var k = 0; k < cand.length; k++) if (/^[A-Z][A-Z0-9]{2}$/.test(cand[k]) && !emUso[cand[k]]) return cand[k];
    return w[0] + "X" + String(Math.floor(Math.random() * 9) + 1);
  };

  /* as siglas que JÁ são de outro fornecedor no banco (PROP-XXX-NNN com
     fornecedorRef de outro id) — e a deste, se ele já tem itens */
  CatalogoForn.siglasDoBanco = function (base, fornecedorId) {
    var deOutros = {}, minha = "";
    arr(base).forEach(function (d) {
      var m = /^PROP-([A-Z][A-Z0-9]{2})-\d{3}$/.exec(txt(d && d.codigo));
      if (!m) return;
      var dono = d.fornecedorRef && d.fornecedorRef.id ? String(d.fornecedorRef.id) : "";
      if (dono && dono === String(fornecedorId)) { if (!minha) minha = m[1]; }
      else deOutros[m[1]] = 1;
    });
    return { deOutros: deOutros, minha: minha };
  };

  /* ------------------------------------------------------------------
   * PLANO DE APLICAÇÃO — o que gravar no banco próprio
   * opts: { itens (revisados), fornecedor {id,nome}, base (dados da PROPRIA),
   *         sigla, grupo, data 'AAAA-MM-DD', versao, autor, agora (ISO), origem }
   * → { criar, atualizar, sumidos, colisoes, pendentes, gravar }
   * ------------------------------------------------------------------ */
  CatalogoForn.planoAplicar = function (opts) {
    opts = opts || {};
    var F = opts.fornecedor || {}, fid = txt(F.id), fnome = txt(F.nome).trim();
    if (!fid) throw new Error("planoAplicar: fornecedor sem id");
    var base = arr(opts.base), sigla = txt(opts.sigla).toUpperCase();
    if (!/^[A-Z][A-Z0-9]{2}$/.test(sigla)) throw new Error("planoAplicar: sigla inválida (" + sigla + ")");
    var agora = txt(opts.agora), data = txt(opts.data), grupo = txt(opts.grupo) || "MATERIAL";
    var sufixo = fnome ? " (" + semAcento(fnome).toUpperCase() + ")" : "";
    var porCodigo = {}, meus = [], porDescOutro = {};
    base.forEach(function (d) {
      if (!d || !d.codigo) return;
      porCodigo[txt(d.codigo).toLowerCase()] = d;
      var dono = d.fornecedorRef && d.fornecedorRef.id ? String(d.fornecedorRef.id) : "";
      if (dono === fid && txt(d.tipoItem || "insumo") === "insumo") meus.push(d);
      else if (txt(d.tipoItem) === "insumo" || !d.tipoItem) porDescOutro[norm(d.descricao) + "|" + CatalogoForn.unidade(d.unidade)] = d;
    });
    var meusPorDesc = {};
    meus.forEach(function (d) { meusPorDesc[norm(d.descricao) + "|" + CatalogoForn.unidade(d.unidade)] = d; });
    var prox = 0, prefixo = "PROP-" + sigla + "-";
    base.forEach(function (d) {
      var c = txt(d && d.codigo);
      if (c.indexOf(prefixo) === 0) { var n = parseInt(c.slice(prefixo.length), 10); if (n > prox) prox = n; }
    });
    function novoCodigo() {
      for (var t = 0; t < 1000; t++) {
        prox++;
        var c = prefixo + ("00" + prox).slice(-3);
        if (!porCodigo[c.toLowerCase()]) { porCodigo[c.toLowerCase()] = { codigo: c, _reservado: true }; return c; }
      }
      throw new Error("planoAplicar: sem código livre para " + prefixo);
    }
    function descFinal(d) {
      var s = semAcento(txt(d)).toUpperCase().replace(/\s+/g, " ").trim();
      if (sufixo && s.indexOf(sufixo.trim()) < 0) s += sufixo;
      return s.slice(0, 200);
    }
    var res = { criar: [], atualizar: [], sumidos: [], colisoes: [], pendentes: [] }, presentes = {};
    arr(opts.itens).forEach(function (it) {
      if (!it || it.incluir === false) return;
      var desc = descFinal(it.descricao), un = CatalogoForn.unidade(it.unidade);
      if (!(it.preco > 0)) { res.pendentes.push({ descricao: desc, unidade: un }); return; }
      var k = norm(desc) + "|" + un;
      if (presentes[k]) return;                    // repetido na mesma lista: o primeiro vale
      presentes[k] = 1;
      var obs = "Fornecedor: " + fnome + " | preço do catálogo em " + data.split("-").reverse().join("/") + (opts.origem ? " (" + txt(opts.origem) + ")" : "") + (it.precoM2 ? " | R$ " + br(it.precoM2) + "/m²" : "");
      var ja = meusPorDesc[k];
      if (ja) {
        var a = {}; for (var p in ja) if (Object.prototype.hasOwnProperty.call(ja, p)) a[p] = ja[p];
        a.custoUnitario = it.preco; a.custoMAT = it.preco; a.custoMO = 0; a.custoEQ = 0;
        a.precoData = data; a.catalogoVersao = opts.versao || 1; a.atualizadoEm = agora; a.observacao = obs;
        a.fornecedorRef = { id: fid, nome: fnome };
        delete a.foraDoCatalogoDesde;
        res.atualizar.push(a);
        return;
      }
      var outro = porDescOutro[k];
      if (outro) { res.colisoes.push({ descricao: desc, unidade: un, codigoExistente: outro.codigo }); return; }
      res.criar.push({ codigo: novoCodigo(), descricao: desc, unidade: un, custoUnitario: it.preco, custoMO: 0, custoMAT: it.preco, custoEQ: 0,
        tipoItem: "insumo", origem: "PROPRIA", categoria: "MAT", grupo: grupo, grupoCompra: grupo,
        fornecedorRef: { id: fid, nome: fnome }, precoData: data, catalogoVersao: opts.versao || 1, observacao: obs,
        criadoEm: agora, atualizadoEm: agora, criadoPor: txt(opts.autor) });
    });
    if (opts.marcarSumidos !== false) {
      meus.forEach(function (d) {
        var k = norm(d.descricao) + "|" + CatalogoForn.unidade(d.unidade);
        if (presentes[k] || d.foraDoCatalogoDesde) return;
        var s = {}; for (var p in d) if (Object.prototype.hasOwnProperty.call(d, p)) s[p] = d[p];
        s.foraDoCatalogoDesde = data; s.atualizadoEm = agora;
        res.sumidos.push(s);
      });
    }
    res.gravar = res.criar.concat(res.atualizar, res.sumidos);
    return res;
  };

  /* ------------------------------------------------------------------
   * LEMBRETE DE ATUALIZAÇÃO (decisão do gestor em 02/10/2026: parâmetro por
   * fornecedor, 15 dias, canais e-mail e WhatsApp; o fornecedor pode parar)
   * fornecedor.catalogo = { lembrete:{ativo, dias, email, whatsapp, desde},
   *                         ultimaVersaoEm, ultimoPedidoEm, parado }
   * ------------------------------------------------------------------ */
  CatalogoForn.lembretePadrao = function (hojeISO) {
    return { ativo: true, dias: LEMBRETE_DIAS_PADRAO, email: true, whatsapp: true, desde: txt(hojeISO).slice(0, 10) };
  };
  CatalogoForn.diasLembrete = function (d) {
    var n = parseInt(d, 10);
    if (!isFinite(n)) return LEMBRETE_DIAS_PADRAO;
    return Math.max(LEMBRETE_MIN, Math.min(LEMBRETE_MAX, n));
  };
  function diaMs(iso) { var t = Date.parse(txt(iso).slice(0, 10) + "T12:00:00Z"); return isFinite(t) ? t : NaN; }
  CatalogoForn.lembretesDevidos = function (fornecedores, hojeISO) {
    var hoje = diaMs(hojeISO), out = [];
    if (!isFinite(hoje)) return out;
    arr(fornecedores).forEach(function (f) {
      var c = f && f.catalogo, l = c && c.lembrete;
      if (!l || !l.ativo || c.parado) return;
      var temEmail = !!(l.email && /@/.test(txt(f.email)));
      var temZap = !!(l.whatsapp && txt(f.whatsapp || f.telefone).replace(/\D/g, "").length >= 10);
      if (!temEmail && !temZap) return;
      var refs = [c.ultimaVersaoEm, c.ultimoPedidoEm, l.desde].map(diaMs).filter(isFinite);
      if (!refs.length) return;
      var ref = Math.max.apply(null, refs);
      var dias = CatalogoForn.diasLembrete(l.dias);
      var passados = Math.floor((hoje - ref) / 86400000);
      if (passados >= dias) out.push({ id: f.id, nome: txt(f.nome), passados: passados, dias: dias, email: temEmail, whatsapp: temZap });
    });
    return out;
  };
  CatalogoForn.mensagemLembrete = function (f, empresa, link) {
    var quem = txt(f && (f.contato || f.nome)).split("(")[0].trim();
    return "Olá" + (quem ? ", " + quem : "") + "! Aqui é a " + (txt(empresa) || "nossa empresa") + ". " +
      "Seus preços ou produtos mudaram nos últimos dias? Se sim, mande o catálogo atualizado (PDF, foto ou link)" +
      (link ? " neste link: " + link : " respondendo esta mensagem") + ". Se não mudou nada, é só ignorar. Obrigado!";
  };

  global.CatalogoForn = CatalogoForn;
  if (typeof module !== "undefined" && module.exports) module.exports = CatalogoForn;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
