/* =====================================================================
 * cplprofluxo.js — CPLPRO, leva B: o FLUXO do processo na camada da tela,
 * mas PURO (sem DOM, sem Store, sem rede). Roda no gate em Node.
 *
 * O motor das regras é js/cplpro.js (leva A). Aqui moram as decisões que a
 * tela toma em cima dele e que precisam ser testáveis sem navegador:
 *   - papel da pessoa e trava de RBAC por ação (sempre via Cplpro.exigir);
 *   - passo que a pessoa "conferiu", assinatura do conteúdo, histórico;
 *   - autorizar e publicar (status, datas, referência congelada);
 *   - leitura de planilha de proposta (matriz → linhas) e análise;
 *   - painel da CPL (modo TV) com LISTA BRANCA de campos.
 *
 * REGRAS QUE NÃO CEDEM
 *  - Nada aqui reescreve regra do motor: prazo, pesquisa, parecer, sigilo e
 *    análise vêm de Cplpro.*. Este arquivo só encadeia.
 *  - O painel só mostra o que está na lista branca (CAMPOS_PAINEL). Valor
 *    estimado de processo sigiloso, valor de proposta de licitante, CPF e CNPJ
 *    NUNCA entram — nem no painel, nem por engano de quem acrescentar campo.
 *  - Dinheiro em centavos inteiros na comparação; nenhum valor padrão escondido.
 * ES5 puro.
 * ===================================================================== */
(function (global) {
  "use strict";

  var Cplpro = global.Cplpro, R = global.CplproRegras;
  if (typeof require === "function" && typeof module !== "undefined") {
    if (!R) R = require("./cplproregras.js");
    if (!Cplpro) Cplpro = require("./cplpro.js");
  }

  function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function vazio(v) { return v === null || v === undefined || (typeof v === "string" && v.replace(/\s/g, "") === ""); }
  function dd(n) { return (n < 10 ? "0" : "") + n; }
  function dataISO(d) { return d.getFullYear() + "-" + dd(d.getMonth() + 1) + "-" + dd(d.getDate()); }
  function hojeISO() { return dataISO(new Date()); }
  function agoraISO() { var d = new Date(); return dataISO(d) + "T" + dd(d.getHours()) + ":" + dd(d.getMinutes()) + ":" + dd(d.getSeconds()); }
  function lerData(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s === null || s === undefined ? "" : s));
    if (!m) return null;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
    return dataISO(d) === m[1] + "-" + m[2] + "-" + m[3] ? d : null;
  }
  function norm(s) {
    return String(s === null || s === undefined ? "" : s).toLowerCase()
      .replace(/[áàâãä]/g, "a").replace(/[éèêë]/g, "e").replace(/[íìîï]/g, "i")
      .replace(/[óòôõö]/g, "o").replace(/[úùûü]/g, "u").replace(/ç/g, "c").replace(/ñ/g, "n");
  }
  function cent(v) { var n = typeof v === "number" ? v : Number(v); return isFinite(n) ? Math.round(Number(n.toPrecision(15)) * 100) : null; }
  function hash(s) {
    /* djb2 + sdbm: duas contas de 32 bits. É detecção de mudança, não segurança. */
    var h1 = 5381, h2 = 0, i, str = String(s);
    for (i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      h1 = ((h1 << 5) + h1 + c) % 4294967296;
      h2 = (c + (h2 << 6) + (h2 << 16) - h2) % 4294967296;
      if (h2 < 0) h2 += 4294967296;
    }
    function hx(x) { var t = (x >>> 0).toString(16); while (t.length < 8) t = "0" + t; return t; }
    return hx(h1) + hx(h2);
  }

  /* qual ação do papel manda em cada passo (para "Conferi" e para travar o botão) */
  var ACAO_DO_PASSO = {
    demanda: "editar_dfd", acervo: "editar_acervo", quantitativos: "editar_quantitativos", etp: "editar_etp",
    riscos: "editar_riscos", orcamento: "editar_orcamento", tr: "editar_tr", parametros: "editar_parametros",
    minuta: "gerar_minuta", conformidade: "enviar_juridico"
  };
  /* quem responde pelas pendências de cada passo (o painel agrupa por papel, nunca por pessoa) */
  var PAPEL_DO_PASSO = {
    demanda: "requisitante", acervo: "requisitante", quantitativos: "engenharia", etp: "engenharia", riscos: "engenharia",
    orcamento: "engenharia", tr: "engenharia", parametros: "cpl", minuta: "cpl", conformidade: "cpl"
  };

  /* ------------------------------------------------------------------ *
   * Papéis e RBAC na função
   * ------------------------------------------------------------------ */
  var Fluxo = { ACAO_DO_PASSO: ACAO_DO_PASSO, PAPEL_DO_PASSO: PAPEL_DO_PASSO };

  /* registros = entidade cplpro_papeis: { id, usuarioId, nome, papeis:[...] }.
   * `u` = { id, nome, gestor }. Sem registro, o gestor da conta é admin_orgao (só gerencia logins e lê);
   * quem não é gestor e não tem registro NÃO tem papel — e o motor recusa qualquer ação. */
  Fluxo.papeisDe = function (u, registros) {
    if (!u) return [];
    var reg = arr(registros).filter(function (r) { return r && (r.usuarioId === u.id || r.id === u.id); })[0];
    var l = reg ? arr(reg.papeis).filter(function (p) { return !!R.PAPEIS[p]; }) : [];
    /* ⚠ o gestor da conta NUNCA perde o admin_orgao: sem ele, ao tirar o próprio perfil, ninguém mais gerenciaria os logins */
    if (u.gestor && l.indexOf("admin_orgao") < 0) l.push("admin_orgao");
    return l;
  };
  /* o primeiro papel da pessoa que PODE a ação; null se nenhum */
  Fluxo.papelPara = function (papeis, acao) {
    var l = arr(papeis);
    for (var i = 0; i < l.length; i++) if (Cplpro.pode(l[i], acao)) return l[i];
    return null;
  };
  Fluxo.pode = function (papeis, acao) { return Fluxo.papelPara(papeis, acao) !== null; };
  /* Trava de RBAC: é o Cplpro.exigir que lança (com a mensagem do motor). Devolve o papel usado. */
  Fluxo.exigir = function (papeis, acao) {
    var p = Fluxo.papelPara(papeis, acao);
    if (p) { Cplpro.exigir(p, acao); return p; }
    var l = arr(papeis);
    if (!l.length) throw new Error("Você ainda não tem perfil no CPLPRO. Peça ao administrador do órgão para definir o seu em «Pessoas e papéis».");
    Cplpro.exigir(l[0], acao);                      // lança a mensagem padrão do motor
    return l[0];
  };
  /* texto do botão desabilitado ("sem permissão porque …") */
  Fluxo.motivoSemPermissao = function (papeis, acao) {
    try { Fluxo.exigir(papeis, acao); return ""; } catch (e) { return String(e.message || e); }
  };
  Fluxo.quem = function (nome, papel) { return { nome: nome, papel: papel }; };

  /* ------------------------------------------------------------------ *
   * Edição travada
   * ------------------------------------------------------------------ */
  Fluxo.editavel = function (p) {
    if (!p) return false;
    if (p.status === "publicado") return false;     // edital publicado não se reescreve: a próxima etapa são as propostas
    return Cplpro.editavel(p);
  };
  Fluxo.motivoTravado = function (p) {
    if (!p) return "Sem processo.";
    if (p.status === "em_analise_juridica") return "Em análise jurídica (art. 53): as peças ficam trancadas até o parecer.";
    if (p.status === "publicado") return "Edital publicado: as peças não mudam mais.";
    return "";
  };

  /* ------------------------------------------------------------------ *
   * Assinatura do conteúdo: se mudou depois do parecer ou da minuta, a prova não vale mais
   * ------------------------------------------------------------------ */
  Fluxo.assinaturaConteudo = function (p) {
    if (!p) return "";
    var par = {};
    Object.keys(p.parametros || {}).forEach(function (k) { par[k] = p.parametros[k] ? p.parametros[k].valor : null; });
    var docs = arr(p.documentos).map(function (d) { return [d.id, d.tipo, d.sha, d.superadoPor]; });
    var base = [p.tipoObjeto, p.secretaria, p.objeto, p.justificativa, p.pca, p.recursoFederal, p.sigiloso, p.regulamentoId,
      p.dataPrevistaEdital, p.cronograma, p.orcamentoId, p.orcamentoRef, p.tr, p.edital, p.requisitante, p.prazoDesejado, p.etp, p.riscos, p.quantitativos, p.pesquisa, par, docs];
    /* leva F: o cronograma físico lido da pasta só entra na assinatura quando existe (processo antigo mantém a assinatura) */
    if (p.cronogramaFisico) base.push(p.cronogramaFisico);
    return hash(JSON.stringify(base));
  };

  Fluxo.pacoteValido = function (p) {
    return !!(p && p.pacote && p.pacote.geradoEm && p.pacote.assinatura === Fluxo.assinaturaConteudo(p));
  };
  /* Chamar antes de gravar: a minuta gerada sobre conteúdo antigo deixa de contar. */
  Fluxo.normalizar = function (p) {
    if (p && p.pacote && p.pacote.geradoEm && p.pacote.assinatura !== Fluxo.assinaturaConteudo(p)) {
      p.pacote = { geradoEm: null, invalidadoEm: agoraISO(), motivo: "o conteúdo mudou depois de a minuta ser gerada" };
    }
    return p;
  };

  /* ------------------------------------------------------------------ *
   * Histórico (quem, quando, o quê, antes/depois) — o mesmo formato do motor
   * ------------------------------------------------------------------ */
  function curto(v) {
    var s = typeof v === "string" ? v : JSON.stringify(v);
    if (s === undefined) s = "";
    return s.length > 300 ? s.substring(0, 300) + "…" : s;
  }
  Fluxo.registrar = function (p, acao, antes, depois, quem, agora) {
    p.historico = arr(p.historico).concat([{ em: vazio(agora) ? agoraISO() : agora, quem: quem && typeof quem === "object" ? quem.nome : quem, acao: acao, antes: curto(antes), depois: curto(depois) }]);
    p.atualizadoEm = vazio(agora) ? agoraISO() : agora;
    return p;
  };
  /* diferença campo a campo entre dois objetos rasos (só os campos pedidos) */
  Fluxo.diferencas = function (antes, depois, campos) {
    var a = {}, d = {}, mudou = false;
    arr(campos).forEach(function (c) {
      var x = antes ? antes[c] : undefined, y = depois ? depois[c] : undefined;
      if (JSON.stringify(x) !== JSON.stringify(y)) { a[c] = x === undefined ? null : x; d[c] = y === undefined ? null : y; mudou = true; }
    });
    return mudou ? { antes: a, depois: d } : null;
  };

  /* ------------------------------------------------------------------ *
   * "Conferi" por passo
   * ------------------------------------------------------------------ */
  Fluxo.conferirPasso = function (p, passoId, papeis, quem, agora) {
    var acao = ACAO_DO_PASSO[passoId];
    if (!acao) throw new Error("Passo «" + passoId + "» não existe.");
    var papel = Fluxo.exigir(papeis, acao);
    if (!Fluxo.editavel(p)) throw new Error(Fluxo.motivoTravado(p));
    var pr = Cplpro.progresso(p).passos[passoId];
    if (pr.pct < 100) throw new Error("O passo ainda tem " + pr.pendencias.length + " pendência(s). Corrija-as antes de conferir.");
    var q = clone(p), antes = q.passos[passoId].conferido === true;
    if (antes) return q;                              // idempotente
    q.passos[passoId].conferido = true;
    q.passos[passoId].conferidoPor = quem && quem.nome !== undefined ? quem.nome : quem;
    q.passos[passoId].conferidoEm = vazio(agora) ? agoraISO() : agora;
    Fluxo.registrar(q, "conferir:" + passoId, false, true, { nome: quem && quem.nome !== undefined ? quem.nome : quem, papel: papel }, agora);
    return q;
  };
  Fluxo.desconferirPasso = function (p, passoId, papeis, quem, agora) {
    var acao = ACAO_DO_PASSO[passoId];
    if (!acao) throw new Error("Passo «" + passoId + "» não existe.");
    Fluxo.exigir(papeis, acao);
    if (!Fluxo.editavel(p)) throw new Error(Fluxo.motivoTravado(p));
    var q = clone(p);
    if (!q.passos[passoId].conferido) return q;
    q.passos[passoId].conferido = false;
    Fluxo.registrar(q, "desconferir:" + passoId, true, false, quem, agora);
    return q;
  };
  /* editar um passo tira o "Conferi" dele: o que foi conferido não é mais o que está na tela */
  Fluxo.soltarConferencia = function (p, passoId) {
    if (p && p.passos && p.passos[passoId] && p.passos[passoId].conferido) { p.passos[passoId].conferido = false; return true; }
    return false;
  };

  /* o passo em que a pessoa "está": o primeiro que ainda não está pronto */
  Fluxo.passoAtual = function (p) {
    var pr = Cplpro.progresso(p);
    for (var i = 0; i < Cplpro.PASSOS.length; i++) {
      var id = Cplpro.PASSOS[i].id, x = pr.passos[id];
      if (x.pct < 100 || !x.conferido) return { id: id, ordem: i + 1, nome: Cplpro.PASSOS[i].nome, pct: x.pct };
    }
    var ult = Cplpro.PASSOS[Cplpro.PASSOS.length - 1];
    return { id: ult.id, ordem: Cplpro.PASSOS.length, nome: ult.nome, pct: 100 };
  };

  /* ------------------------------------------------------------------ *
   * Natureza, critério e datas (insumos do prazo do art. 55)
   * ------------------------------------------------------------------ */
  Fluxo.natureza = function (p) {
    var t = p && R.TIPOS_OBJETO[p.tipoObjeto];
    return t ? (t.servicoComumEngenharia ? "comum" : "especial") : null;
  };
  Fluxo.valorParametro = function (p, id) {
    var x = p && p.parametros ? p.parametros[id] : null;
    var v = x ? x.valor : null;
    if (id === "sigiloso" && vazio(v) && p) v = p.sigiloso;
    return vazio(v) ? null : v;
  };
  Fluxo.prazo = function (p) {
    var cron = (p && p.cronograma) || {};
    var res = Cplpro.prazoPublicacao(p ? p.dataPrevistaEdital : null, Fluxo.valorParametro(p, "criterio_julgamento"),
      Fluxo.valorParametro(p, "regime_execucao"), Fluxo.natureza(p), p ? p.feriadosLocais : []);
    res.dataAbertura = vazio(cron.dataAbertura) ? null : cron.dataAbertura;
    res.aberturaOk = res.dataMinimaAbertura && res.dataAbertura ? res.dataAbertura >= res.dataMinimaAbertura : null;
    return res;
  };

  /* ------------------------------------------------------------------ *
   * Autorização e publicação
   * ------------------------------------------------------------------ */
  Fluxo.autorizar = function (p, papeis, quem, agora) {
    var papel = Fluxo.exigir(papeis, "autorizar_abertura");
    if (p.status === "publicado") return clone(p);
    if (!Cplpro.fluxoJuridico.podePublicar(p)) throw new Error("A autorização só vem depois do parecer jurídico favorável (ou das ressalvas respondidas e com ciência).");
    if (p.autorizacao && p.autorizacao.assinatura === Fluxo.assinaturaConteudo(p)) return clone(p);
    var q = clone(p);
    q.autorizacao = { por: quem && quem.nome !== undefined ? quem.nome : quem, papel: papel, em: vazio(agora) ? agoraISO() : agora, assinatura: Fluxo.assinaturaConteudo(q) };
    Fluxo.registrar(q, "autorizar_abertura", null, "autorizada", { nome: q.autorizacao.por, papel: papel }, agora);
    return q;
  };

  /* Por que NÃO pode publicar (lista de motivos; vazia = pode). A tela mostra o primeiro como motivo do botão. */
  Fluxo.bloqueiosPublicacao = function (p) {
    var m = [];
    if (!p) return ["Sem processo."];
    if (p.status === "publicado") return ["Já publicado."];
    var pa = p.parecer;
    if (!pa) m.push("Falta o parecer jurídico (art. 53).");
    else if (pa.resultado === "desfavoravel") m.push("O parecer jurídico foi desfavorável: ajuste o processo e envie de novo.");
    else if (!Cplpro.fluxoJuridico.podePublicar(p)) {
      var abertas = arr(pa.ressalvas).filter(function (r) { return !r.respondida; }).length;
      m.push(abertas ? abertas + " ressalva(s) do jurídico sem resposta." : "Falta a ciência do jurídico sobre as respostas às ressalvas.");
    }
    if (Fluxo.mudouDepoisDoParecer(p)) m.push("O processo mudou depois do envio (ou da ciência) do jurídico: envie de novo para o parecer cobrir o texto atual (art. 53).");
    if (!p.autorizacao) m.push("Falta a autorização da autoridade competente para a abertura.");
    else if (p.autorizacao.assinatura !== Fluxo.assinaturaConteudo(p)) m.push("O processo mudou depois da autorização: a autoridade precisa autorizar de novo.");
    if (!Fluxo.pacoteValido(p)) m.push("Gere a minuta e os anexos (sem nenhum campo [PREENCHER]) sobre o conteúdo atual.");
    if (!lerData(p.dataPrevistaEdital)) m.push("Informe a data de publicação do edital (passo 8).");
    var pz = Fluxo.prazo(p);
    if (pz.aberturaOk === false) m.push("A data de abertura está antes do mínimo do art. 55 (" + pz.dataMinimaAbertura + ").");
    else if (lerData(p.dataPrevistaEdital) && !pz.dataAbertura) m.push("Informe a data de abertura das propostas (passo 8).");
    return m;
  };
  Fluxo.podePublicar = function (p) { return Fluxo.bloqueiosPublicacao(p).length === 0; };

  /* ref = { total, linhas } — o orçamento de referência CONGELADO na publicação (as propostas são comparadas com ele). */
  Fluxo.publicar = function (p, papeis, quem, agora, ref) {
    var papel = Fluxo.exigir(papeis, "publicar");
    if (p.status === "publicado") return clone(p);    // idempotente
    var bl = Fluxo.bloqueiosPublicacao(p);
    if (bl.length) throw new Error("Publicação trancada: " + bl[0] + (bl.length > 1 ? " (e mais " + (bl.length - 1) + ")" : ""));
    if (!ref || typeof ref.total !== "number" || !arr(ref.linhas).length) throw new Error("Sem o orçamento de referência não dá para congelar o valor da publicação.");
    var q = clone(p), antes = q.status;
    q.status = "publicado";
    q.publicacao = { dataPublicacao: q.dataPrevistaEdital, dataAbertura: (q.cronograma || {}).dataAbertura || null, publicadoPor: quem && quem.nome !== undefined ? quem.nome : quem,
      publicadoEm: vazio(agora) ? agoraISO() : agora, autorizadoPor: q.autorizacao.por, sigiloso: q.sigiloso !== false };
    q.referenciaPublicada = { total: ref.total, linhas: clone(ref.linhas), congeladoEm: q.publicacao.publicadoEm };
    Fluxo.registrar(q, "publicar", antes, q.status, { nome: q.publicacao.publicadoPor, papel: papel }, agora);
    return q;
  };

  /* ------------------------------------------------------------------ *
   * Propostas (pós-publicação)
   * ------------------------------------------------------------------ */
  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : null;
    if (v === null || v === undefined) return null;
    var s = String(v).replace(/R\$/gi, "").replace(/\s/g, "");
    if (!s) return null;
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    var n = Number(s);
    return isFinite(n) ? n : null;
  }
  var COLUNAS = [
    { chave: "item", nomes: ["item", "n item", "no item", "n", "numero", "num", "nº", "n°"] },
    { chave: "descricao", nomes: ["descricao", "discriminacao", "servico", "servicos", "especificacao", "descricao do servico", "descricao dos servicos"] },
    { chave: "un", nomes: ["un", "und", "unid", "unidade", "un."] },
    { chave: "qtd", nomes: ["qtd", "quant", "quantidade", "qtde", "quant."] },
    { chave: "unitario", nomes: ["preco unitario", "valor unitario", "p unitario", "pu", "unitario", "preco unit", "valor unit", "p. unit", "preco unitario com bdi", "unitario com bdi", "valor unitario com bdi", "pu com bdi"] },
    { chave: "total", nomes: ["total", "preco total", "valor total", "total item", "total do item", "total com bdi", "valor total com bdi"] }
  ];
  function achaCabecalho(row) {
    var mapa = {}, achados = 0;
    arr(row).forEach(function (cel, i) {
      var t = norm(cel).replace(/[().:]/g, " ").replace(/\s+/g, " ").replace(/^ | $/g, "");
      if (!t) return;
      COLUNAS.forEach(function (c) {
        if (mapa[c.chave] !== undefined) return;
        if (c.nomes.indexOf(t) >= 0 || (c.chave === "unitario" && /unit/.test(t) && !/total/.test(t)) || (c.chave === "total" && /^(valor |preco )?total/.test(t))) { mapa[c.chave] = i; achados++; }
      });
    });
    return achados >= 4 && mapa.item !== undefined && mapa.qtd !== undefined && mapa.unitario !== undefined ? mapa : null;
  }
  var ROT_COL = { item: "Item", descricao: "Descrição", un: "Unidade", qtd: "Quantidade", unitario: "Preço unitário", total: "Total" };
  function letraCol(i) { var s = "", n = i + 1; while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }
  /* matriz (linhas de células, como App._lerPlanilha devolve) → { linhas, totalDeclarado, colunas } ou { erro } */
  Fluxo.proposta = {
    ler: function (matriz) {
      var m = arr(matriz), hi = -1, col = null, i;
      for (i = 0; i < m.length && i < 60; i++) { col = achaCabecalho(m[i]); if (col) { hi = i; break; } }
      if (!col) return { erro: "Não achei o cabeçalho da planilha. Procurei as colunas Item, Descrição, Unidade, Quantidade, Preço unitário e Total na parte de cima da planilha." };
      var linhas = [], totalDeclarado = null, brancos = 0;
      for (i = hi + 1; i < m.length; i++) {
        var r = arr(m[i]);
        var item = r[col.item] === undefined || r[col.item] === null ? "" : String(r[col.item]).replace(/^\s+|\s+$/g, "");
        var resto = r.map(function (c) { return norm(c); }).join(" ");
        if (!item) {
          if (/\btotal\b|valor global|preco global/.test(resto) && col.total !== undefined && num(r[col.total]) !== null) totalDeclarado = num(r[col.total]);
          if (!r.some(function (c) { return !vazio(c); })) brancos++;
          continue;
        }
        if (/^total/.test(norm(item))) { if (col.total !== undefined && num(r[col.total]) !== null) totalDeclarado = num(r[col.total]); continue; }
        var qtd = num(r[col.qtd]), unit = num(r[col.unitario]), tot = col.total !== undefined ? num(r[col.total]) : null;
        /* linha de grupo (etapa): tem item mas não tem quantidade nem unitário — não é linha de preço */
        if (qtd === null && unit === null) continue;
        linhas.push({ item: item, descricao: col.descricao !== undefined && r[col.descricao] !== undefined ? String(r[col.descricao]) : "",
          un: col.un !== undefined && r[col.un] !== undefined ? String(r[col.un]) : "", qtd: qtd, unitario: unit, total: tot });
      }
      if (!linhas.length) return { erro: "O cabeçalho foi achado, mas não há linha de preço abaixo dele." };
      return { linhas: linhas, totalDeclarado: totalDeclarado, colunas: "colunas lidas: " + COLUNAS.filter(function (c) { return col[c.chave] !== undefined; }).map(function (c) { return ROT_COL[c.chave] + " (" + letraCol(col[c.chave]) + ")"; }).join(", ") };
    }
  };
  Fluxo.analisarProposta = function (p, prop, modoArredondamento) {
    var ref = p && p.referenciaPublicada;
    if (!ref) throw new Error("O edital ainda não foi publicado: não há referência congelada para comparar.");
    var refLinhas = arr(ref.linhas).map(function (l) { return { item: l.item, descricao: l.descricao, un: l.un, qtd: l.qtd, unitario: l.unitario, total: l.total }; });
    return Cplpro.analisarProposta(refLinhas, prop.linhas, { totalProposta: prop.totalDeclarado, totalReferencia: ref.total, modoArredondamento: modoArredondamento });
  };
  /* Nenhum resultado muda sem o clique do servidor: gravar a decisão exige `analisar_propostas`. */
  Fluxo.decidirProposta = function (p, propostaId, decisao, papeis, quem, agora) {
    var papel = Fluxo.exigir(papeis, "analisar_propostas");
    var DEC = ["classificar", "diligencia", "desclassificar"];
    if (DEC.indexOf(decisao.acao) < 0) throw new Error("Decisão inválida: use classificar, diligencia ou desclassificar.");
    if (decisao.acao !== "classificar" && vazio(decisao.motivo)) throw new Error("Escreva o motivo da decisão: ele vai no documento enviado ao licitante.");
    var q = clone(p), pr = arr(q.propostas).filter(function (x) { return x.id === propostaId; })[0];
    if (!pr) throw new Error("Proposta não encontrada.");
    var antes = pr.decisao ? pr.decisao.acao : null;
    pr.decisao = { acao: decisao.acao, motivo: vazio(decisao.motivo) ? null : decisao.motivo, itens: arr(decisao.itens), por: quem && quem.nome !== undefined ? quem.nome : quem, papel: papel, em: vazio(agora) ? agoraISO() : agora };
    Fluxo.registrar(q, "proposta:" + decisao.acao + ":" + pr.id, antes, decisao.acao, { nome: pr.decisao.por, papel: papel }, agora);
    return q;
  };

  /* ------------------------------------------------------------------ *
   * Pesquisa de preços: avalia item a item e monta o mapa (centavos da régua Arred)
   * ------------------------------------------------------------------ */
  var BASES_OFICIAIS = /^(SINAPI|SICRO|SIURB)/i;
  Fluxo.itemTemBase = function (linha) {
    var bf = String((linha && (linha.baseFonte || (linha.item && linha.item.baseFonte))) || "");
    return !!(linha && !vazio(linha.codigo) && BASES_OFICIAIS.test(bf));
  };
  Fluxo.pesquisar = function (p, linhas, modoArredondamento) {
    var reg = Cplpro.pesquisaPrecos.regulamentoEfetivo(p), pesq = p.pesquisa || {}, itens = pesq.itens || {};
    var ctx = { dataPrevistaEdital: p.dataPrevistaEdital, dataPesquisa: pesq.dataPesquisa, metodo: pesq.metodo, regraDescarte: pesq.regraDescarte, modoArredondamento: modoArredondamento };
    var avals = [], itensMapa = [];
    arr(linhas).forEach(function (l) {
      itensMapa.push({ item: l.numero, descricao: l.descricao, un: l.unidade, qtd: l.quantidade });
      if (Fluxo.itemTemBase(l)) {
        avals.push({ item: l.numero, valor: l.custoUnitario, metodo: "base_oficial", situacao: "ok", comBase: true, regulamentoId: reg ? reg.id : null });
        return;
      }
      var cfg = itens[l.numero] || {};
      var av = Cplpro.pesquisaPrecos.avaliarItem({ item: l.numero, codigo: l.codigo }, arr(cfg.fontes), reg, ctx);
      av.justificativa = vazio(cfg.justificativa) ? null : cfg.justificativa;
      /* menos de 3 preços com justificativa escrita deixa de ser pendência bloqueante, mas continua marcado */
      if (av.justificativaObrigatoria && av.justificativa) av.situacao = av.valor !== null ? "ok_justificado" : av.situacao;
      avals.push(av);
    });
    var mapa = Cplpro.pesquisaPrecos.mapa(itensMapa, avals, { modoArredondamento: modoArredondamento });
    return { avaliacoes: avals, mapa: mapa, regulamento: reg, semBase: avals.filter(function (a) { return !a.comBase; }).length };
  };

  /* ------------------------------------------------------------------ *
   * PACOTE DO ORÇAMENTO DE REFERÊNCIA (passo 6) — opções de OrcamentoReferencia.baixar/montar (js/orcref.js)
   * montadas do que o PROCESSO já sabe. Puro: sem DOM, sem Store. Nada é inventado: o que o processo não tem
   * (ART/RRT, tipo de obra do BDI, cronograma que não bate com as etapas) fica de fora e o pacote o marca como pendência.
   *   p      processo           c   resultado de Orcamento.calcular(orc)      orc  orçamento do processo
   *   ctx    { orgaoNome, empresa, bases, hoje }  (a tela entrega; vazio em teste)
   * A pesquisa é a MESMA que o passo 6 mostra (Fluxo.pesquisar): avaliações + fontes brutas por item + regulamento.
   * ------------------------------------------------------------------ */
  function cronogramaDoProcesso(p, orc) {
    var cf = p && p.cronogramaFisico, ets = arr(cf && cf.etapas), oe = arr(orc && orc.etapas);
    if (!ets.length || ets.length !== oe.length) return null;
    function nm(x) { return String(x == null ? "" : x).replace(/\s+/g, " ").trim().toLowerCase(); }
    var i, meses = Number(cf.meses) || 0, saida = [], rot = [];
    for (i = 0; i < ets.length; i++) {
      if (nm(ets[i].nome) !== nm(oe[i].nome)) return null;   // etapa em outra ordem/nome: não adivinho o casamento
      if (arr(ets[i].pct).length < meses || !meses) return null;
      saida.push({ meses: arr(ets[i].pct).slice(0, meses).map(function (v) { return Number(v) || 0; }) });
    }
    for (i = 1; i <= meses; i++) rot.push(i + "º mês");
    return { meses: meses, etapas: saida, rotulos: rot };
  }
  Fluxo.cronogramaParaPacote = cronogramaDoProcesso;
  Fluxo.opcoesPacoteReferencia = function (p, orc, c, ctx) {
    ctx = ctx || {}; p = p || {};
    var pq = Fluxo.pesquisar(p, arr(c && c.linhas), c && c.modo ? c.modo : undefined);
    var itensCfg = (p.pesquisa || {}).itens || {}, fontes = {};
    Object.keys(itensCfg).forEach(function (k) { fontes[k] = arr(itensCfg[k] && itensCfg[k].fontes); });
    var ref = p.orcamentoRef || {}, op = {
      pesquisa: { avaliacoes: pq.avaliacoes, fontes: fontes, regulamento: pq.regulamento },
      recursoFederal: p.recursoFederal === true,
      totalEsperado: c ? c.precoVenda : undefined,
      orgao: { nome: ctx.orgaoNome || "" },
      objeto: p.objeto || "", processo: codigoDe(p), data: ctx.hoje || "",
      empresa: ctx.empresa || {}, bases: arr(ctx.bases)
    };
    if (!vazio(ref.competencia)) op.dataBase = (vazio(ref.base) ? "" : ref.base + " — ") + ref.competencia;
    var cr = cronogramaDoProcesso(p, orc);
    if (cr) op.cronograma = cr;
    return op;
  };

  /* ------------------------------------------------------------------ *
   * PAINEL DA CPL (modo TV) — LISTA BRANCA
   *
   * ⚠ O link público do Mirante do CertamePRO vazou dado entre clientes. Aqui
   *   não há link: o painel só existe dentro do app logado. E, mesmo dentro, só
   *   sai o que está nestas listas. Campo novo no processo NÃO aparece no painel
   *   até alguém acrescentá-lo aqui de propósito (e o teste confere as chaves).
   * ⚠ Sem dinheiro NENHUM: nem valor estimado (sigiloso ou não), nem valor de
   *   proposta. Sem CPF/CNPJ/nome de licitante.
   * ------------------------------------------------------------------ */
  var CAMPOS_PAINEL = {
    processo: ["codigo", "objeto", "secretaria", "passo", "passoNome", "pct", "status", "statusRotulo"],
    prazo: ["codigo", "objeto", "tipo", "tipoRotulo", "data", "dias"],
    pendenciaPapel: ["papel", "papelNome", "total"],
    publicado: ["codigo", "objeto", "dataPublicacao"]
  };
  Fluxo.CAMPOS_PAINEL = CAMPOS_PAINEL;
  var STATUS_ROTULO = { rascunho: "Em preparo", em_analise_juridica: "No jurídico", com_ressalvas: "Com ressalvas", parecer_favoravel: "Parecer favorável", devolvido: "Devolvido pelo jurídico", publicado: "Publicado" };
  Fluxo.STATUS_ROTULO = STATUS_ROTULO;

  function aSomenteLista(obj, campos) {
    var o = {};
    campos.forEach(function (c) { if (obj[c] !== undefined) o[c] = obj[c]; });
    return o;
  }
  function codigoDe(p) { return String(p.id || "").replace(/^prc-/, "").substring(0, 6).toUpperCase(); }
  function objCurto(p) {
    var s = String(p.objeto || "").replace(/\s+/g, " ");
    return s.length > 90 ? s.substring(0, 87) + "…" : s;
  }
  function difDias(aISO, bISO) {
    var a = lerData(aISO), b = lerData(bISO);
    return a && b ? Math.round((b.getTime() - a.getTime()) / 86400000) : null;
  }
  function somaMesesISO(iso, n) {
    var d = lerData(iso); if (!d) return null;
    var alvo = new Date(d.getFullYear(), d.getMonth() + n, 1, 12, 0, 0), ult = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0, 12, 0, 0).getDate();
    return dataISO(new Date(alvo.getFullYear(), alvo.getMonth(), Math.min(d.getDate(), ult), 12, 0, 0));
  }
  Fluxo.fimPrazoRecurso = function (p) {
    if (!p || vazio(p.resultadoEm)) return null;
    var dias = Fluxo.valorParametro(p, "recurso_prazo");
    var n = dias && typeof dias === "object" && typeof dias.diasUteis === "number" ? dias.diasUteis : 3;   // 3 dias úteis: art. 165 (sugestão do motor)
    return Cplpro.diasUteisDepois(p.resultadoEm, n, p.feriadosLocais);
  };
  Fluxo.cotacaoVence = function (p) {
    /* menor data de validade entre as cotações do processo, pela regra do regulamento (6 meses até o edital) */
    var reg = Cplpro.pesquisaPrecos.regulamentoEfetivo(p), regra = null;
    if (!reg) return null;
    reg.ordem.forEach(function (o) { if (o.tipo === "cotacao" && o.validade) regra = o; });
    if (!regra) return null;
    var menor = null;
    var itens = (p.pesquisa && p.pesquisa.itens) || {};
    Object.keys(itens).forEach(function (k) {
      arr(itens[k].fontes).forEach(function (f) {
        if (f.tipo !== "cotacao" || !lerData(f.dataColeta)) return;
        var v = somaMesesISO(f.dataColeta, regra.validade.meses);
        if (v && (!menor || v < menor)) menor = v;
      });
    });
    return menor;
  };

  Fluxo.painel = function (processos, hoje) {
    var lista = arr(processos), h = hoje || hojeISO();
    var abertos = lista.filter(function (p) { return p.status !== "publicado"; });
    var porPasso = {}, procs = [], prazos = [], pend = {}, publicados = [];
    Cplpro.PASSOS.forEach(function (ps) { porPasso[ps.id] = { passo: ps.id, ordem: ps.ordem, passoNome: ps.nome, total: 0, processos: [] }; });
    abertos.forEach(function (p) {
      var at = Fluxo.passoAtual(p), cod = codigoDe(p);
      porPasso[at.id].total++;
      var item = aSomenteLista({ codigo: cod, objeto: objCurto(p), secretaria: p.secretaria || "", passo: at.ordem, passoNome: at.nome, pct: Cplpro.progresso(p).geral, status: p.status, statusRotulo: STATUS_ROTULO[p.status] || p.status }, CAMPOS_PAINEL.processo);
      porPasso[at.id].processos.push(item); procs.push(item);
      var pr = Cplpro.progresso(p);
      pr.pendencias.forEach(function (x) { var pap = PAPEL_DO_PASSO[x.passo] || "cpl"; pend[pap] = (pend[pap] || 0) + 1; });
      var cv = Fluxo.cotacaoVence(p);
      if (cv) prazos.push(aSomenteLista({ codigo: cod, objeto: objCurto(p), tipo: "cotacao", tipoRotulo: "Cotação vence", data: cv, dias: difDias(h, cv) }, CAMPOS_PAINEL.prazo));
      if (p.parecer && p.parecer.resultado === "com_ressalvas") {
        var ab = arr(p.parecer.ressalvas).filter(function (r) { return !r.respondida; }).length;
        if (ab) prazos.push(aSomenteLista({ codigo: cod, objeto: objCurto(p), tipo: "ressalva", tipoRotulo: ab + " ressalva(s) do jurídico em aberto", data: p.parecer.emitidoEm ? String(p.parecer.emitidoEm).substring(0, 10) : null, dias: null }, CAMPOS_PAINEL.prazo));
      }
    });
    lista.forEach(function (p) {
      var cod = codigoDe(p);
      if (p.status === "publicado" && p.publicacao) {
        publicados.push({ p: p, d: p.publicacao.dataPublicacao || "" });
        var ab = (p.publicacao && p.publicacao.dataAbertura) || (p.cronograma && p.cronograma.dataAbertura);
        if (ab && ab >= h) prazos.push(aSomenteLista({ codigo: cod, objeto: objCurto(p), tipo: "abertura", tipoRotulo: "Abertura das propostas", data: ab, dias: difDias(h, ab) }, CAMPOS_PAINEL.prazo));
        var fr = Fluxo.fimPrazoRecurso(p);
        if (fr && fr >= h) prazos.push(aSomenteLista({ codigo: cod, objeto: objCurto(p), tipo: "recurso", tipoRotulo: "Fim do prazo de recurso", data: fr, dias: difDias(h, fr) }, CAMPOS_PAINEL.prazo));
      } else if (p.status !== "publicado" && p.cronograma && p.cronograma.dataAbertura && p.cronograma.dataAbertura >= h) {
        prazos.push(aSomenteLista({ codigo: cod, objeto: objCurto(p), tipo: "abertura", tipoRotulo: "Abertura prevista", data: p.cronograma.dataAbertura, dias: difDias(h, p.cronograma.dataAbertura) }, CAMPOS_PAINEL.prazo));
      }
    });
    prazos = prazos.filter(function (x) { return x.dias === null || x.dias >= 0; }).sort(function (a, b) { return String(a.data || "9999") < String(b.data || "9999") ? -1 : 1; });
    var mes = h.substring(0, 7);
    var doMes = publicados.filter(function (x) { return String(x.d).substring(0, 7) === mes; }).map(function (x) {
      return aSomenteLista({ codigo: codigoDe(x.p), objeto: objCurto(x.p), dataPublicacao: x.d }, CAMPOS_PAINEL.publicado);
    });
    var pendList = Object.keys(pend).map(function (k) { return aSomenteLista({ papel: k, papelNome: R.PAPEIS[k] ? R.PAPEIS[k].nome : k, total: pend[k] }, CAMPOS_PAINEL.pendenciaPapel); })
      .sort(function (a, b) { return b.total - a.total; });
    return {
      geradoEm: h,
      quadros: [
        { id: "passos", titulo: "Processos por passo", itens: Cplpro.PASSOS.map(function (ps) { return { passo: porPasso[ps.id].ordem, passoNome: ps.nome, total: porPasso[ps.id].total }; }), processos: procs },
        { id: "prazos", titulo: "Próximos prazos", itens: prazos },
        { id: "pendencias", titulo: "Pendências por responsável", itens: pendList },
        { id: "publicados", titulo: "Publicados no mês", itens: doMes, total: doMes.length }
      ]
    };
  };

  /* ------------------------------------------------------------------ *
   * Conformidade (passo 10): lista de verificação com o artigo de cada item
   * ------------------------------------------------------------------ */
  Fluxo.conformidade = function (p, ctx) {
    var c = ctx || {}, pr = Cplpro.progresso(p), it = [];
    function add(id, texto, artigo, ok, detalhe, passo) { it.push({ id: id, texto: texto, artigo: artigo, ok: !!ok, detalhe: detalhe || "", passo: passo || null }); }
    var etpOk = pr.passos.etp.pct === 100;
    add("demanda", "Demanda formalizada, com justificativa e previsão no plano de contratações", "Lei 14.133/2021, art. 18, caput", pr.passos.demanda.pct === 100, pr.passos.demanda.pendencias.length ? pr.passos.demanda.pendencias[0].msg : "", "demanda");
    add("etp", "Estudo técnico preliminar com os elementos obrigatórios", "Lei 14.133/2021, art. 18, §§1º e 2º", etpOk, etpOk ? "" : pr.passos.etp.pendencias[0].msg, "etp");
    add("riscos", "Riscos avaliados e alocados (matriz de riscos)", "Lei 14.133/2021, art. 22", pr.passos.riscos.pct === 100, pr.passos.riscos.pendencias.length ? pr.passos.riscos.pendencias[0].msg : "", "riscos");
    var pq = c.pesquisa;
    var okPesq = !!pq && pq.avaliacoes.every(function (a) { return a.comBase || a.situacao === "ok" || a.situacao === "ok_justificado"; });
    add("pesquisa", "Pesquisa de preços pelas fontes do regulamento, com mínimo de preços ou justificativa", "Lei 14.133/2021, art. 23", okPesq, !pq ? "Orçamento de referência não vinculado." : (okPesq ? "" : "Há item sem preço de referência fechado."), "orcamento");
    add("orcamento", "Orçamento de referência vinculado, com base e competência declaradas", "Lei 14.133/2021, art. 23, §§1º e 2º", pr.passos.orcamento.pct === 100, pr.passos.orcamento.pendencias.length ? pr.passos.orcamento.pendencias[0].msg : "", "orcamento");
    add("tr", "Termo de referência / projeto básico com objeto, medição e recebimento", "Lei 14.133/2021, art. 6º, XXIII e XXV", pr.passos.tr.pct === 100, pr.passos.tr.pendencias.length ? pr.passos.tr.pendencias[0].msg : "", "tr");
    add("sigilo", "Sigilo do orçamento decidido de forma explícita", "Lei 14.133/2021, art. 24", p.sigiloso === true || p.sigiloso === false, p.sigiloso === null || p.sigiloso === undefined ? "Responda sim ou não no passo 8." : "", "parametros");
    var pz = Fluxo.prazo(p);
    add("prazo", "Abertura respeita o prazo mínimo desde a publicação", "Lei 14.133/2021, art. 55", pz.aberturaOk === true, pz.aberturaOk === false ? "Mínimo: " + pz.dataMinimaAbertura : (pz.pendencias[0] || "Informe a data de abertura."), "parametros");
    add("pacote", "Minuta do edital e anexos gerados sem campo [PREENCHER]", "Lei 14.133/2021, art. 25 e art. 18", Fluxo.pacoteValido(p), Fluxo.pacoteValido(p) ? "" : "Gere os documentos no passo 9.", "minuta");
    var pa = p.parecer;
    add("parecer", "Parecer jurídico favorável (ou ressalvas respondidas e com ciência)", "Lei 14.133/2021, art. 53", Cplpro.fluxoJuridico.podePublicar(p), pa ? "Resultado: " + ({ favoravel: "favorável", com_ressalvas: "favorável com ressalvas", desfavoravel: "desfavorável" }[pa.resultado] || pa.resultado) : "Ainda não enviado/emitido.", "conformidade");
    return it;
  };
  /* envio ao jurídico: só com os passos 1 a 9 prontos (o parecer cobre o processo inteiro) */
  Fluxo.bloqueiosEnvio = function (p) {
    var pr = Cplpro.progresso(p), m = [];
    Cplpro.PASSOS.forEach(function (ps) {
      if (ps.id === "conformidade") return;
      var x = pr.passos[ps.id];
      if (x.pct < 100) m.push("Passo " + ps.ordem + " (" + ps.nome + ") tem " + x.pendencias.length + " pendência(s).");
      else if (!x.conferido) m.push("Passo " + ps.ordem + " (" + ps.nome + ") ainda não foi conferido.");
    });
    if (!Fluxo.pacoteValido(p)) m.unshift("A minuta e os anexos precisam estar gerados sobre o conteúdo atual (passo 9).");
    return m;
  };
  /* o que o jurídico viu (no envio ou na ciência) × o que está no processo agora */
  Fluxo.mudouDepoisDoParecer = function (p) { return !!(p && p.assinaturaEnviada && p.assinaturaEnviada !== Fluxo.assinaturaConteudo(p)); };
  /* Pode (re)enviar: rascunho/devolvido; ou parecer favorável/com ressalvas SE o processo mudou depois do que o jurídico viu
   * (sem esta porta, quem corrige o texto depois do parecer ficaria sem caminho: o motor só aceita envio de rascunho/devolvido). */
  Fluxo.podeReenviar = function (p) {
    return !!p && (p.status === "rascunho" || p.status === "devolvido" || ((p.status === "parecer_favoravel" || p.status === "com_ressalvas") && Fluxo.mudouDepoisDoParecer(p)));
  };
  Fluxo.enviarJuridico = function (p, papeis, quem, agora) {
    var papel = Fluxo.exigir(papeis, "enviar_juridico");
    if (p.status === "em_analise_juridica") return clone(p);       // idempotente
    if (!Fluxo.podeReenviar(p)) throw new Error("O processo está «" + (STATUS_ROTULO[p.status] || p.status) + "» e não pode ser enviado ao jurídico agora.");
    var bl = Fluxo.bloqueiosEnvio(p);
    if (bl.length) throw new Error("Não dá para enviar ainda: " + bl[0]);
    var base = p;
    if (p.status === "parecer_favoravel" || p.status === "com_ressalvas") {
      base = clone(p); base.status = "devolvido";                  // o parecer anterior vai para `pareceresAnteriores` (o motor faz isso no envio)
      Fluxo.registrar(base, "reenvio_por_alteracao", p.status, "devolvido", { nome: quem && quem.nome !== undefined ? quem.nome : quem, papel: papel }, agora);
    }
    var q = Cplpro.fluxoJuridico.enviar(base, { nome: quem && quem.nome !== undefined ? quem.nome : quem, papel: papel }, vazio(agora) ? agoraISO() : agora);
    q.assinaturaEnviada = Fluxo.assinaturaConteudo(q);
    q.autorizacao = null;                             // novo envio, nova autorização
    return q;
  };

  /* A ciência do jurídico cobre as respostas da CPL — inclusive o texto que ela ajustou para respondê-las. Por isso a
   * "assinatura do que o jurídico viu" é renovada aqui; mudança DEPOIS da ciência volta a trancar a publicação. */
  Fluxo.darCiencia = function (p, papeis, quem, agora) {
    var papel = Fluxo.exigir(papeis, "emitir_parecer");
    var q = Cplpro.fluxoJuridico.darCiencia(p, { nome: quem && quem.nome !== undefined ? quem.nome : quem, papel: papel }, vazio(agora) ? agoraISO() : agora);
    if (q.parecer && q.parecer.ciencia && (!p.parecer || !p.parecer.ciencia)) { q.assinaturaEnviada = Fluxo.assinaturaConteudo(q); q.autorizacao = null; }
    return q;
  };

  /* ------------------------------------------------------------------ *
   * DEMONSTRAÇÃO EM UM CLIQUE (10/11/2026): ?demo=1&perfil=orgao_publico  e  ?demo=1&view=cplpro
   *
   * ⚠ SÓ NA VITRINE. Aplicar o perfil do órgão sozinho mexe nos módulos que a empresa inteira enxerga; numa conta REAL isso
   *   esconderia o sistema do cliente por causa de um link. Por isso a decisão é daqui e exige as DUAS coisas: a sessão é a
   *   vitrine (`demo === true`) E a empresa é «demo». Em conta real o parâmetro só REVELA o perfil (js/perfis.js), nunca aplica.
   * ⚠ A VITRINE PÚBLICA NÃO PODE FICAR PRESA NO PERFIL DO ÓRGÃO: o perfil grava na empresa «demo», que persiste no navegador.
   *   Quem abriu a demonstração do CPLPRO e depois abre ?demo=1 comum voltaria a ver só os módulos do órgão. `restaurar`
   *   devolve o perfil Completo quando o pedido NÃO é do CPLPRO.
   * ------------------------------------------------------------------ */
  Fluxo.planoDemo = function (o) {
    o = o || {};
    var qs = String(o.qs === undefined || o.qs === null ? "" : o.qs);
    var pedido = /[?&]perfil=orgao_publico(&|$)/i.test(qs) || /[?&]view=cplpro(&|$)/i.test(qs);
    var vitrine = o.demo === true && o.empresaId === "demo";
    return { pedido: pedido, vitrine: vitrine, aplicar: pedido && vitrine, semear: pedido && vitrine, restaurar: !pedido && vitrine && o.perfilAtual === "orgao_publico" };
  };
  var DEMO_PROC_ID = "prc-demo-creche";
  Fluxo.DEMO_PROC_ID = DEMO_PROC_ID;
  /* processo FICTÍCIO, com os passos 1 a 3 preenchidos, para quem abre a vitrine ver o fluxo. Dados inventados, sem cliente. */
  Fluxo.processoExemplo = function (agora) {
    var ag = vazio(agora) ? agoraISO() : agora;
    var p = Cplpro.novoProcesso({ id: DEMO_PROC_ID, objeto: "Construção de uma creche municipal com 6 salas de aula, refeitório e área de serviço (exemplo)", secretaria: "Secretaria Municipal de Educação (exemplo)", tipoObjeto: "obra_nova",
      sigiloso: true, recursoFederal: false, dataPrevistaEdital: null }, "Demonstração", ag);
    p.justificativa = "Atender à demanda por vagas em educação infantil no bairro, hoje sem creche pública a menos de 3 km. (Texto de exemplo.)";
    p.pca = "Item 12 do Plano de Contratações Anual (exemplo)";
    p.requisitante = "Maria Souza (exemplo)";
    p.prazoDesejado = "2027-03-01";
    var arqs = ["Arquitetura planta baixa R01.pdf", "Projeto estrutural formas e armacao.pdf", "Projeto de fundacao estacas.pdf", "Projeto hidrossanitario.pdf", "Projeto eletrico.pdf", "Memorial descritivo.pdf", "Sondagem SPT.pdf", "Levantamento topografico.pdf", "ART projetos.pdf"];
    p = Cplpro.adicionarDocumentos(p, arqs.map(function (nm, i) { return { nome: nm, sha: ("de" + i + "0000000000000000").substring(0, 16) + i }; }));
    p.quantitativos = [
      { item: "1.1", itemRef: "1.1", descricao: "Escavação mecanizada de valas", un: "m3", qtd: 180, origem: { arquivo: "Projeto de fundacao estacas.pdf", pagina: "2" } },
      { item: "2.1", itemRef: "2.1", descricao: "Concreto estrutural fck 30 MPa", un: "m3", qtd: 95, origem: { arquivo: "Projeto estrutural formas e armacao.pdf", pagina: "4" } },
      { item: "3.1", itemRef: "3.1", descricao: "Alvenaria de vedação em bloco cerâmico", un: "m2", qtd: 640, origem: { arquivo: "Arquitetura planta baixa R01.pdf", pagina: "1" } }
    ];
    return p;
  };
  /* na vitrine, quem abre o CPLPRO precisa poder AGIR: o registro de papéis dá ao visitante os perfis de quem prepara o processo */
  Fluxo.papeisDemo = function (usuarioId) {
    return { id: "pap-demo", usuarioId: usuarioId, nome: "Visitante da demonstração", papeis: Object.keys(R.PAPEIS) };
  };

  Fluxo.hash = hash; Fluxo.num = num; Fluxo.codigoDe = codigoDe;
  global.CplproFluxo = Fluxo;
  if (typeof module !== "undefined" && module.exports) module.exports = Fluxo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
