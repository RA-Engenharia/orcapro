/* =====================================================================
 * marmprecos.js — TABELA DE PREÇOS DO MARMORISTA e o ORÇAMENTO da marmoraria (motor puro, Node-testável)
 *
 * Pedido do Rogério (20/10/2026): o módulo Marmoraria vendido à parte. Quem tem marmoraria desenha a bancada e
 * gera o PRÓPRIO orçamento na hora, com os PREÇOS DELE por m² de pedra, por metro de acabamento e por unidade de
 * furo e recorte. Este arquivo é a regra; a tela é o js/marmorariaui.js.
 *
 * A TABELA mora na entidade `marm_precos` da empresa (Store → nuvem), UM REGISTRO POR LINHA, tudo plano:
 *   { id: "pedra:<id da pedra>", tipo: "pedra", valor (R$/m², 20 mm), valor30 (R$/m², 30 mm), atualizadoEm }
 *   { id: "pedra-usr:<slug>",     tipo: "pedra", usuario: true, nome, tipoPedra, cor, chapaL, chapaP, valor, valor30 }
 *   { id: "<chave do serviço>",   tipo: "servico", valor, fora (true = "não fornecemos / não cobra") }
 *   { id: "_param",               tipo: "param", instalacaoModo, instalacaoValor, freteModo, freteValor, freteKm,
 *                                 perdaModo, perdaPct, descontoPct, bdiPct, pagamento, validadeDias, prazoDias, observacoes }
 * ⚠ POR QUE UM REGISTRO POR LINHA, E NÃO UM OBJETO COM AS LISTAS DENTRO: (1) o Firestore recusa lista dentro de lista
 *   (o modelo BIM ficou sem sincronizar de 15 a 20/10/2026 por isso — js/nuvem.js DOC_V2) e um registro só com
 *   `pedras: [...]` crescendo sem teto é o mesmo caminho; (2) o merge da nuvem é POR ID com `atualizadoEm`: o preço
 *   mudado no celular e o mudado no computador, em linhas diferentes, convivem. Um objeto só faria o último salvar
 *   apagar o outro. E NUNCA em `prefs`: lá o local vence campo a campo e o preço velho volta sozinho (nota do
 *   `carp_param` em js/nuvem.js).
 *
 * ⚠ NADA DE PREÇO DE FÁBRICA. A tabela nasce VAZIA: o que não foi preenchido sai no orçamento como pendência
 *   ("Preencha o preço de X"), nunca com um número inventado — o orçamento é DELE, para o cliente DELE.
 *
 *   tabelaDe(registros)              → { param, linhas:{id→registro}, pedrasUsuario:[...] }
 *   linhas(tabela)                   → as linhas da tela (pedras do catálogo + as dele + serviços), com o valor atual
 *   orcar(bancadas, tabela, opc)     → orçamento por bancada + frete, BDI, desconto, total e as pendências
 *   planilha(tabela) / daPlanilha(m) → matriz da .xlsx (exportar/importar) — a tela usa o ExcelJS/SheetJS do app
 *   validarRegistro(r)               → o registro está plano (sem lista dentro de lista, sem objeto aninhado)?
 * ES5, IIFE, sem DOM.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require("./" + arq); } catch (e) { return null; } }
    return null;
  }
  function MM() { return dep("Marmoraria", "marmoraria.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function txt(v) { return v == null ? "" : String(v); }
  /* número do usuário: "1.234,56", "1234.56", 1234.56. Vazio = null (não preenchido — diferente de 0). */
  function numU(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return isFinite(v) ? v : null;
    var s = txt(v).trim().replace(/^R\$\s*/i, "").replace(/%$/, "").trim();
    if (!s) return null;
    if (/,/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }
  function r2(v) { return Math.round(v * 100) / 100; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function norm(s) { s = txt(s).toLowerCase(); return s.normalize ? s.normalize("NFD").replace(/[̀-ͯ]/g, "") : s; }
  function slug(s) { return norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48); }
  function brl(v) { return "R$ " + (Math.round(v * 100) / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, "."); }

  var ENT = "marm_precos";
  var ENT_PROPOSTAS = "marm_propostas";
  var PARAM_ID = "_param";

  /* os SERVIÇOS que o marmorista precifica. A chave é a do Marmoraria.itensQuantitativo (estável), com o recorte
     separado por tipo de instalação (o preço do furo para sobrepor não é o do corte polido por baixo). */
  var SERVICOS = [
    { chave: "borda:reta", grupo: "Acabamento de borda", rotulo: "Borda reta polida", unidade: "m" },
    { chave: "borda:meia-cana", grupo: "Acabamento de borda", rotulo: "Borda meia-cana", unidade: "m" },
    { chave: "borda:boleado", grupo: "Acabamento de borda", rotulo: "Borda boleada", unidade: "m" },
    { chave: "borda:chanfro", grupo: "Acabamento de borda", rotulo: "Borda chanfrada", unidade: "m" },
    { chave: "meia-esquadria", grupo: "Acabamento de borda", rotulo: "Meia-esquadria (colagem da saia)", unidade: "m" },
    { chave: "polimento:reto", grupo: "Acabamento de borda", rotulo: "Polimento de topo (rodabanca e pontas)", unidade: "m" },
    { chave: "polimento:recorte", grupo: "Acabamento de borda", rotulo: "Polimento da borda do recorte (cuba por baixo e esculpida)", unidade: "m" },
    { chave: "furo", grupo: "Furos e recortes", rotulo: "Furo (torneira, válvula)", unidade: "un" },
    { chave: "recorte:sobrepor", grupo: "Furos e recortes", rotulo: "Recorte de cuba de sobrepor (e tanque)", unidade: "un" },
    { chave: "recorte:embutir", grupo: "Furos e recortes", rotulo: "Recorte de cuba de embutir", unidade: "un" },
    { chave: "recorte:semi-encaixe", grupo: "Furos e recortes", rotulo: "Entalhe de cuba semi-encaixe", unidade: "un" },
    { chave: "recorte:por-baixo", grupo: "Furos e recortes", rotulo: "Recorte de cuba por baixo", unidade: "un" },
    { chave: "recorte:esculpida", grupo: "Furos e recortes", rotulo: "Cuba esculpida na pedra", unidade: "un" },
    { chave: "cuba:*", grupo: "Fornecimento", rotulo: "Cuba fornecida pela marmoraria", unidade: "un", podeFora: true },
    { chave: "mao-francesa", grupo: "Fornecimento", rotulo: "Mão-francesa (instalada)", unidade: "un", podeFora: true },
    { chave: "torneira:*", grupo: "Metais (se a marmoraria fornece)", rotulo: "Torneira", unidade: "un", podeFora: true },
    { chave: "valvula:*", grupo: "Metais (se a marmoraria fornece)", rotulo: "Válvula de escoamento", unidade: "un", podeFora: true },
    { chave: "sifao", grupo: "Metais (se a marmoraria fornece)", rotulo: "Sifão", unidade: "un", podeFora: true },
    { chave: "flexivel", grupo: "Metais (se a marmoraria fornece)", rotulo: "Engate flexível", unidade: "un", podeFora: true }
  ];
  var SERV = {}; SERVICOS.forEach(function (s) { SERV[s.chave] = s; });

  /* os parâmetros (um registro `_param`). Vazio = o marmorista ainda não decidiu → pendência no orçamento. */
  var PARAM_PADRAO = { id: PARAM_ID, tipo: "param", instalacaoModo: "", instalacaoValor: null, freteModo: "", freteValor: null, freteKm: null,
    perdaModo: "pct", perdaPct: null, descontoPct: null, bdiPct: null, pagamento: "", validadeDias: null, prazoDias: null, observacoes: "" };
  var MODOS = {
    instalacao: { m2: "por m² de pedra", un: "por bancada", nao: "não cobra / não instala" },
    frete: { fixo: "valor fixo por orçamento", km: "por km rodado", nao: "não cobra" },
    /* ⚠ PERDA (revisão 21/10/2026): o PADRÃO da marmoraria é a área da peça × (1 + perda %) — a sobra da chapa vira
       outra bancada. Cobrar "pelo plano de chapa" = cobrar as CHAPAS INTEIRAS usadas: numa bancada pequena dá
       aproveitamento de ~12 % e o cliente pagaria ~8× a pedra da peça. Fica como opção EXPLÍCITA, com aviso. */
    perda: { pct: "% sobre a área da peça (padrão)", plano: "cobrar as chapas inteiras do plano de chapa", nao: "sem perda (já está no preço do m²)" }
  };

  /* ------------------------------------------------------------ TABELA */
  function tabelaDe(registros) {
    var t = { param: JSON.parse(JSON.stringify(PARAM_PADRAO)), linhas: {}, pedrasUsuario: [] };
    arr(registros).forEach(function (r) {
      if (!r || !r.id || r._excluido || r.excluido) return;
      if (r.id === PARAM_ID) { Object.keys(PARAM_PADRAO).forEach(function (k) { if (r[k] !== undefined) t.param[k] = r[k]; }); if (!MODOS.perda[t.param.perdaModo]) t.param.perdaModo = PARAM_PADRAO.perdaModo; return; }
      t.linhas[r.id] = r;
      if (r.usuario && /^pedra-usr:/.test(r.id)) t.pedrasUsuario.push(r);
    });
    return t;
  }
  /* as pedras do marmorista no formato do catálogo (para o Marmoraria.pedrasExtras e o 3D) */
  function pedrasDoUsuario(tabela) {
    return arr(tabela && tabela.pedrasUsuario).map(function (r) {
      var L = numU(r.chapaL), P = numU(r.chapaP);
      return { id: r.id, nome: txt(r.nome) || "Pedra sem nome", tipo: txt(r.tipoPedra) || "granito", usuario: true,
        render: { cor: /^#[0-9a-f]{6}$/i.test(txt(r.cor)) ? r.cor : "#8a8580", slug: "", rug: 0.2, obs: "cor informada pelo marmorista" },
        chapa_mm: L > 0 && P > 0 ? { L: L, P: P } : null, fonte: { url: "", trecho: "cadastrada pelo marmorista" } };
    });
  }
  function pedraRegistroId(pd) { return pd && pd.usuario ? pd.id : "pedra:" + (pd ? pd.id : ""); }
  /* registro novo de pedra do marmorista */
  function novaPedra(nome, extra) {
    extra = extra || {};
    var r = { id: "pedra-usr:" + (slug(nome) || "pedra"), tipo: "pedra", usuario: true, nome: txt(nome).trim(), tipoPedra: txt(extra.tipoPedra) || "granito",
      cor: txt(extra.cor) || "#8a8580", chapaL: numU(extra.chapaL), chapaP: numU(extra.chapaP), valor: numU(extra.valor), valor30: numU(extra.valor30) };
    return r;
  }

  /* as LINHAS da tela: tudo o que pode ter preço, com o valor de agora (null = vazio) */
  function linhas(tabela) {
    tabela = tabela || tabelaDe([]);
    var M = MM(), out = [];
    var cat = M && M.dados ? arr(M.dados().pedras) : [];
    cat.forEach(function (p) {
      var r = tabela.linhas["pedra:" + p.id] || {};
      out.push({ id: "pedra:" + p.id, tipo: "pedra", grupo: "Pedras (R$/m²)", rotulo: p.nome, sub: p.tipo, unidade: "m²", valor: numU(r.valor), valor30: numU(r.valor30) });
    });
    arr(tabela.pedrasUsuario).forEach(function (r) {
      out.push({ id: r.id, tipo: "pedra", usuario: true, grupo: "Pedras (R$/m²)", rotulo: txt(r.nome), sub: txt(r.tipoPedra) + " · cadastrada", unidade: "m²", valor: numU(r.valor), valor30: numU(r.valor30) });
    });
    SERVICOS.forEach(function (s) {
      var r = tabela.linhas[s.chave] || {};
      out.push({ id: s.chave, tipo: "servico", grupo: s.grupo, rotulo: s.rotulo, unidade: s.unidade, valor: numU(r.valor), fora: !!r.fora, podeFora: !!s.podeFora });
    });
    return out;
  }

  /* registro plano: só número, texto, booleano e null. Lista ou objeto dentro → recusado (a nuvem recusaria). */
  function validarRegistro(r) {
    if (!r || typeof r !== "object" || Array.isArray(r)) return { ok: false, motivo: "registro não é objeto" };
    var ruins = Object.keys(r).filter(function (k) { var v = r[k]; return v !== null && typeof v === "object"; });
    return ruins.length ? { ok: false, motivo: "campo(s) aninhado(s): " + ruins.join(", ") } : { ok: true };
  }

  /* ------------------------------------------------------------ ORÇAMENTO */
  /* o quantitativo da A3 com o recorte SEPARADO por tipo de cuba (a A3 junta sobrepor/embutir/semi-encaixe numa
     chave e por baixo/esculpida noutra) e sem as linhas que aqui são do orçamento inteiro (frete, instalação) */
  var REC_DE = { sobrepor: "recorte:sobrepor", tanque: "recorte:sobrepor", embutir: "recorte:embutir", semi_encaixe: "recorte:semi-encaixe", undermount: "recorte:por-baixo", esculpida: "recorte:esculpida" };
  function itensDaBancada(def) {
    var M = MM(), base = M.itensQuantitativo(def), out = [];
    base.forEach(function (o) {
      if (o.chave === "recorte:cuba" || o.chave === "recorte:por-baixo" || o.chave === "cuba-esculpida" || o.chave === "frete:bancada" || o.chave === "instalacao:bancada") return;
      out.push(o);
    });
    var cont = {};
    arr(def.cubas).forEach(function (c) { var k = REC_DE[c.instalacao]; if (k) cont[k] = (cont[k] || 0) + 1; });
    Object.keys(cont).forEach(function (k) { out.push({ chave: k, grupo: "Marmoraria", descricao: SERV[k].rotulo, unidade: "un", quantidade: cont[k] }); });
    return out;
  }
  function servicoDe(chave) {
    if (SERV[chave]) return SERV[chave];
    var m = /^([a-z]+):/.exec(chave);
    return m && SERV[m[1] + ":*"] ? SERV[m[1] + ":*"] : null;
  }
  /* o preço de uma chave: o registro exato, senão o curinga "prefixo:*" */
  function registroDe(tabela, chave) {
    if (tabela.linhas[chave]) return tabela.linhas[chave];
    var m = /^([a-z]+):/.exec(chave);
    return m ? tabela.linhas[m[1] + ":*"] || null : null;
  }

  /* bancadas = [{ rotulo, nome, id, def }] (o mesmo do MarmorariaUI.bancadas); opc = { km, plano } (plano = Marmoraria.planoChapa) */
  function orcar(bancadas, tabela, opc) {
    tabela = tabela || tabelaDe([]); opc = opc || {};
    var M = MM(), P = tabela.param, pend = [], naoInc = {}, avisos = [], res = { bancadas: [], pendencias: pend, naoIncluso: [], avisos: avisos };
    function pende(o) { var k = o.chave + "|" + (o.campo || ""); if (pend.some(function (x) { return x.chave + "|" + (x.campo || "") === k; })) { pend.forEach(function (x) { if (x.chave + "|" + (x.campo || "") === k && o.bancada && x.bancadas.indexOf(o.bancada) < 0) x.bancadas.push(o.bancada); }); return; } o.bancadas = o.bancada ? [o.bancada] : []; delete o.bancada; pend.push(o); }

    /* PERDA DA CHAPA: o fator sobre o m² da pedra, por pedra e espessura */
    var plano = null, fatorPlano = {};
    if (P.perdaModo === "plano") {
      plano = opc.plano || (M && M.planoChapa ? M.planoChapa(arr(bancadas).map(function (b) { var d = b.def; d.rotulo = b.rotulo; return d; })) : []);
      arr(plano).forEach(function (g) {
        var ap = Number(g.aproveitamento); if (ap > 1.5) ap = ap / 100;
        fatorPlano[norm(g.pedra) + "|" + g.espessura] = g.ok && ap > 0.05 ? { f: 1 / ap, ap: ap, nChapas: g.nChapas } : null;
        if (g.ok && ap > 0.05 && ap < 0.5) avisos.push("Perda cobrando as chapas inteiras: " + g.pedra + " " + g.espessura + " mm usa " + g.nChapas + " chapa(s) com aproveitamento de " + Math.round(ap * 100) + " % — o cliente paga " + (Math.round(10 / ap) / 10).toString().replace(".", ",") + "× a área das peças. Para cobrar só a peça + %, mude a perda para \"" + MODOS.perda.pct + "\" na Tabela de preços.");
      });
    }
    function fatorPerda(pd, e) {
      if (P.perdaModo === "pct") { var pc = numU(P.perdaPct); if (pc == null) { pende({ chave: "_param", campo: "perdaPct", texto: "Preencha a perda da chapa em % sobre a área da peça (0 se a perda já está no preço do m²)" }); return { f: 1, txt: "" }; } return { f: 1 + pc / 100, txt: pc ? "+" + String(pc).replace(".", ",") + " % de perda" : "" }; }
      if (P.perdaModo === "plano") {
        var g = fatorPlano[norm(pd.nome) + "|" + Math.round(e * 1000)];
        if (!g) { pende({ chave: "_param", campo: "perdaModo", texto: "O plano de chapa de " + pd.nome + " não fechou (chapa sem medida ou peça maior que a chapa): use a perda em % fixo" }); return { f: 1, txt: "" }; }
        return { f: g.f, txt: "chapa inteira: aproveitamento " + Math.round(g.ap * 100) + " %" };
      }
      if (P.perdaModo === "nao") return { f: 1, txt: "" };
      pende({ chave: "_param", campo: "perdaModo", texto: "Escolha como cobrar a perda da chapa: pelo plano de chapa ou por % fixo" });
      return { f: 1, txt: "" };
    }

    var subtotal = 0, m2Total = 0;
    arr(bancadas).forEach(function (b) {
      var def = b.def, itens = [], tot = 0, rot = b.rotulo || "";
      itensDaBancada(def).forEach(function (o) {
        var it = { chave: o.chave, grupo: o.grupo, descricao: o.descricao, unidade: o.unidade, quantidade: o.quantidade, quantidadeCobrada: o.quantidade, unitario: null, total: null, obs: "" };
        if (/^pedra:/.test(o.chave)) {
          var pd = def.pedra, reg = tabela.linhas[pedraRegistroId(pd)] || null, e = Math.round(def.e * 1000);
          var pu = reg ? (e === 30 ? numU(reg.valor30) : numU(reg.valor)) : null;
          m2Total += o.quantidade;
          if (pu == null) { pende({ chave: pedraRegistroId(pd), campo: e === 30 ? "valor30" : "valor", bancada: rot, texto: "Preencha o preço por m² da pedra " + pd.nome + " (" + e + " mm)" }); it.pendente = true; itens.push(it); return; }
          var fp = fatorPerda(pd, def.e);
          it.quantidadeCobrada = r4(o.quantidade * fp.f); it.unitario = pu; it.total = r2(it.quantidadeCobrada * pu); it.obs = fp.txt;
          tot += it.total; itens.push(it); return;
        }
        var reg2 = registroDe(tabela, o.chave), sv = servicoDe(o.chave);
        if (reg2 && reg2.fora) { naoInc[(sv ? sv.rotulo : o.descricao)] = 1; return; }
        var pu2 = reg2 ? numU(reg2.valor) : null;
        if (pu2 == null) { pende({ chave: sv ? sv.chave : o.chave, campo: "valor", bancada: rot, texto: "Preencha o preço de " + (sv ? sv.rotulo : o.descricao).toLowerCase() + " (R$/" + (o.unidade === "m2" ? "m²" : o.unidade) + ")" + (sv && sv.podeFora ? " ou marque \"não fornecemos\"" : "") }); it.pendente = true; itens.push(it); return; }
        it.unitario = pu2; it.total = r2(o.quantidade * pu2); tot += it.total; itens.push(it);
      });
      /* INSTALAÇÃO: por m² da pedra da bancada ou por bancada */
      var q = M.quantitativo(def), im = P.instalacaoModo, iv = numU(P.instalacaoValor);
      if (im === "nao") naoInc["Instalação"] = 1;
      else if (im !== "m2" && im !== "un") pende({ chave: "_param", campo: "instalacaoModo", texto: "Escolha como cobrar a instalação: por m² de pedra, por bancada ou não cobra" });
      else if (iv == null) pende({ chave: "_param", campo: "instalacaoValor", texto: "Preencha o preço da instalação (" + MODOS.instalacao[im] + ")" });
      else {
        var qi = im === "m2" ? q.m2 : 1, ti = r2(qi * iv);
        itens.push({ chave: "instalacao", grupo: "Serviços", descricao: "Instalação da bancada", unidade: im === "m2" ? "m2" : "un", quantidade: qi, quantidadeCobrada: qi, unitario: iv, total: ti, obs: "" });
        tot += ti;
      }
      tot = r2(tot); subtotal += tot;
      res.bancadas.push({ rotulo: rot, nome: b.nome || "", id: b.id || "", L: def.L, P: def.P, e: def.e, pedra: def.pedra.nome, borda: def.borda, superficie: def.superficie,
        cubas: arr(def.cubas).map(function (c) { return c.rotulo; }), m2: q.m2, itens: itens, total: tot, avisos: arr(def.avisos).concat(arr(def.pendencias)) });
    });
    subtotal = r2(subtotal);

    /* FRETE do orçamento inteiro */
    var frete = { modo: P.freteModo, valor: 0, km: null, texto: "" };
    if (P.freteModo === "fixo") { var fv = numU(P.freteValor); if (fv == null) pende({ chave: "_param", campo: "freteValor", texto: "Preencha o valor do frete" }); else { frete.valor = r2(fv); frete.texto = "Frete"; } }
    else if (P.freteModo === "km") {
      var pk = numU(P.freteValor), km = numU(opc.km != null ? opc.km : P.freteKm);
      if (pk == null) pende({ chave: "_param", campo: "freteValor", texto: "Preencha o preço do frete por km" });
      if (km == null) pende({ chave: "_param", campo: "freteKm", texto: "Informe a distância até a obra (km) para o frete" });
      if (pk != null && km != null) { frete.valor = r2(pk * km); frete.km = km; frete.texto = "Frete (" + String(km).replace(".", ",") + " km × " + brl(pk) + ")"; }
    } else if (P.freteModo === "nao") naoInc["Frete"] = 1;
    else pende({ chave: "_param", campo: "freteModo", texto: "Escolha o frete: valor fixo, por km ou não cobra" });

    /* BDI / MARGEM e DESCONTO */
    var bdi = numU(P.bdiPct), desc = numU(P.descontoPct) || 0;
    if (bdi == null) { pende({ chave: "_param", campo: "bdiPct", texto: "Preencha a margem/BDI em % (0 se a margem já está nos preços)" }); bdi = 0; }
    var base = r2(subtotal + frete.valor), bdiV = r2(base * bdi / 100), comBdi = r2(base + bdiV), descV = r2(comBdi * desc / 100);
    res.subtotal = subtotal; res.frete = frete; res.base = base; res.bdiPct = bdi; res.bdiValor = bdiV; res.descontoPct = desc; res.descontoValor = descV;
    res.total = r2(comBdi - descV); res.m2 = r4(m2Total);
    res.completo = pend.length === 0;
    res.naoIncluso = Object.keys(naoInc);
    res.plano = plano;
    res.param = P;
    return res;
  }

  /* ------------------------------------------------------------ PLANILHA (.xlsx) */
  var CAB = ["Código", "Grupo", "Item", "Unidade", "Preço (R$)", "Preço 30 mm (R$/m²)", "Não fornecemos (S/N)"];
  var CAB_PARAM = ["Parâmetro", "Valor", "Opções"];
  var PARAM_ROT = [
    ["instalacaoModo", "Instalação: como cobrar", "m2 | un | nao"], ["instalacaoValor", "Instalação: preço (R$)", ""],
    ["freteModo", "Frete: como cobrar", "fixo | km | nao"], ["freteValor", "Frete: valor fixo ou R$/km", ""], ["freteKm", "Frete: distância padrão (km)", ""],
    ["perdaModo", "Perda da chapa", "plano | pct | nao"], ["perdaPct", "Perda (%)", ""], ["bdiPct", "Margem/BDI (%)", ""], ["descontoPct", "Desconto (%)", ""],
    ["validadeDias", "Validade da proposta (dias)", ""], ["prazoDias", "Prazo de entrega (dias)", ""], ["pagamento", "Condições de pagamento", "texto"], ["observacoes", "Observações da proposta", "texto"]
  ];
  var NUM_PARAM = { instalacaoValor: 1, freteValor: 1, freteKm: 1, perdaPct: 1, bdiPct: 1, descontoPct: 1, validadeDias: 1, prazoDias: 1 };
  function planilha(tabela) {
    var L = linhas(tabela), precos = [CAB], P = (tabela || tabelaDe([])).param;
    L.forEach(function (l) { precos.push([l.id, l.grupo, l.rotulo, l.unidade, l.valor == null ? "" : l.valor, l.tipo === "pedra" ? (l.valor30 == null ? "" : l.valor30) : "", l.podeFora ? (l.fora ? "S" : "N") : ""]); });
    var par = [CAB_PARAM].concat(PARAM_ROT.map(function (p) { var v = P[p[0]]; return [p[1], v == null ? "" : v, p[2]]; }));
    var usr = [["Código", "Nome", "Tipo (granito, mármore, quartzo...)", "Cor (#rrggbb)", "Chapa comprimento (mm)", "Chapa largura (mm)"]].concat(
      arr(tabela && tabela.pedrasUsuario).map(function (r) { return [r.id, r.nome, r.tipoPedra, r.cor, r.chapaL == null ? "" : r.chapaL, r.chapaP == null ? "" : r.chapaP]; }));
    return { abas: [{ nome: "Preços", linhas: precos }, { nome: "Parâmetros", linhas: par }, { nome: "Pedras cadastradas", linhas: usr }] };
  }
  /* lê as abas de volta → { registros, avisos }. Só o que a planilha traz muda; código desconhecido vira aviso. */
  function daPlanilha(abas, tabelaAtual) {
    var regs = {}, avisos = [], atual = tabelaAtual || tabelaDe([]);
    function aba(nome) { return arr(abas).filter(function (a) { return norm(a.nome) === norm(nome); })[0]; }
    var conhecidos = {}; linhas(atual).forEach(function (l) { conhecidos[l.id] = l; });
    var usr = aba("Pedras cadastradas");
    if (usr) arr(usr.linhas).slice(1).forEach(function (r) {
      if (!r || !txt(r[1]).trim()) return;
      var nr = novaPedra(r[1], { tipoPedra: r[2], cor: r[3], chapaL: r[4], chapaP: r[5] });
      if (txt(r[0]).indexOf("pedra-usr:") === 0) nr.id = txt(r[0]).trim();
      var velho = atual.linhas[nr.id]; if (velho) { nr.valor = numU(velho.valor); nr.valor30 = numU(velho.valor30); }
      regs[nr.id] = nr; conhecidos[nr.id] = { id: nr.id, tipo: "pedra" };
    });
    var pr = aba("Preços");
    if (pr) arr(pr.linhas).slice(1).forEach(function (r, i) {
      var id = txt(r && r[0]).trim(); if (!id) return;
      var k = conhecidos[id]; if (!k) { avisos.push("linha " + (i + 2) + ": código \"" + id + "\" desconhecido — ignorada"); return; }
      var v = numU(r[4]), v30 = numU(r[5]), fora = /^s/i.test(txt(r[6]).trim());
      if (txt(r[4]).trim() && v == null) avisos.push("linha " + (i + 2) + " (" + txt(r[2]) + "): preço \"" + txt(r[4]) + "\" não é número — ficou vazio");
      if (v != null && v < 0) { avisos.push("linha " + (i + 2) + ": preço negativo recusado"); v = null; }
      var reg = regs[id] || JSON.parse(JSON.stringify(atual.linhas[id] || { id: id, tipo: k.tipo }));
      reg.valor = v; if (k.tipo === "pedra") reg.valor30 = v30; else if (SERV[id] && SERV[id].podeFora) reg.fora = fora;
      regs[id] = reg;
    });
    var pa = aba("Parâmetros");
    if (pa) {
      var p = JSON.parse(JSON.stringify(atual.param));
      arr(pa.linhas).slice(1).forEach(function (r) {
        var def = PARAM_ROT.filter(function (x) { return norm(x[1]) === norm(r && r[0]); })[0]; if (!def) return;
        var k = def[0], v = r[1];
        if (NUM_PARAM[k]) p[k] = numU(v);
        else if (/Modo$/.test(k)) { var s = norm(v).trim(); p[k] = s === "m2" || s === "un" || s === "fixo" || s === "km" || s === "plano" || s === "pct" || s === "nao" ? s : ""; }
        else p[k] = txt(v);
      });
      p.id = PARAM_ID; p.tipo = "param"; regs[PARAM_ID] = p;
    }
    return { registros: Object.keys(regs).map(function (k) { return regs[k]; }), avisos: avisos };
  }

  /* ------------------------------------------------------------ NÚMERO DA PROPOSTA (DDMMAA-NN, idempotente por obra) */
  function numeroProposta(existentes, obraId, agora) {
    /* ⚠ REVISÃO 21/10/2026 — NÚMERO REPETIDO: (1) sem obra, todas as propostas caíam no mesmo registro
       "mprop:sem-obra" e saíam com o MESMO número para clientes diferentes; agora sem obra é sempre número novo;
       (2) o sequencial era "quantas existem + 1": apagar a obra (a cascata apaga a proposta dela) fazia a próxima
       reusar um número já entregue a outro cliente; agora é o MAIOR do dia + 1. */
    var d = agora ? new Date(agora) : new Date(), ja = obraId ? arr(existentes).filter(function (p) { return p && p.obraId === obraId && !p._excluido; })[0] : null;
    if (ja && ja.numero) return { numero: ja.numero, id: ja.id, novo: false };
    var dd = ("0" + d.getDate()).slice(-2), mm = ("0" + (d.getMonth() + 1)).slice(-2), aa = String(d.getFullYear()).slice(-2), pre = dd + mm + aa + "-";
    var n = 1 + arr(existentes).reduce(function (mx, p) { var s = txt(p && p.numero); if (s.indexOf(pre) !== 0) return mx; var k = parseInt(s.slice(pre.length), 10); return isFinite(k) && k > mx ? k : mx; }, 0);
    var numero = pre + (n < 10 ? "0" + n : String(n));
    return { numero: numero, id: "mprop:" + (obraId || "sem-obra:" + numero), novo: true };
  }

  var MarmPrecos = {
    ENT: ENT, ENT_PROPOSTAS: ENT_PROPOSTAS, PARAM_ID: PARAM_ID, SERVICOS: SERVICOS, MODOS: MODOS, PARAM_PADRAO: PARAM_PADRAO, PARAM_ROT: PARAM_ROT,
    numU: numU, brl: brl, slug: slug,
    tabelaDe: tabelaDe, linhas: linhas, pedrasDoUsuario: pedrasDoUsuario, novaPedra: novaPedra, pedraRegistroId: pedraRegistroId,
    validarRegistro: validarRegistro, itensDaBancada: itensDaBancada, orcar: orcar, planilha: planilha, daPlanilha: daPlanilha, numeroProposta: numeroProposta,

    /* ---------------- o ambiente (navegador): a tabela da EMPRESA atual ---------------- */
    _eid: function () { try { return global.Auth && Auth.empresaId ? Auth.empresaId() : ""; } catch (e) { return ""; } },
    registros: function (eid) { try { return global.Store ? arr(Store.listar(eid || this._eid(), ENT)) : []; } catch (e) { return []; } },
    tabela: function (eid) { var t = tabelaDe(this.registros(eid)); this._pedrasNoCatalogo(t); return t; },
    /* grava um registro (idempotente: mesmo id = mesma linha; gravar o mesmo valor de novo não cria nada) */
    gravar: function (reg, eid) {
      var v = validarRegistro(reg); if (!v.ok) return { ok: false, motivo: v.motivo };
      if (!global.Store) return { ok: false, motivo: "armazenamento indisponível" };
      var e = eid || this._eid(), atual = null;
      try { atual = Store.obter(e, ENT, reg.id); } catch (e0) {}
      if (atual) { var igual = Object.keys(reg).every(function (k) { return k === "atualizadoEm" || JSON.stringify(atual[k]) === JSON.stringify(reg[k]); }); if (igual) return { ok: true, igual: true }; }
      try { Store.salvar(e, ENT, reg); } catch (e1) { return { ok: false, motivo: e1.message }; }
      return { ok: true };
    },
    excluir: function (id, eid) { try { Store.excluir(eid || this._eid(), ENT, id); return { ok: true }; } catch (e) { return { ok: false, motivo: e.message }; } },
    _pedrasNoCatalogo: function (t) { var M = MM(); try { if (M && M.pedrasExtras) M.pedrasExtras(pedrasDoUsuario(t)); } catch (e) {} }
  };
  global.MarmPrecos = MarmPrecos;
  if (typeof module !== "undefined" && module.exports) module.exports = MarmPrecos;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
