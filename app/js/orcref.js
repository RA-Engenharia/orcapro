/* =====================================================================
 * orcref.js — PACOTE DO ORÇAMENTO DE REFERÊNCIA NO PADRÃO DA PREFEITURA (leva G2, 10/11/2026)
 *
 * É o mesmo conjunto de peças que o licitante entrega (js/licitacaodocs.js), visto do outro lado: o ÓRGÃO que
 * orça. Sintética, analítica, composição do BDI, encargos, curva ABC de serviços e de insumos, cronograma
 * físico-financeiro, memória de cálculo, mapa de cotação, padrão CAIXA (repasse federal) e declarações.
 * Saída em PDF (A4, timbrado da conta) e XLSX com fórmulas vivas (js/orcrefxls.js).
 *
 * ⚠ UMA FONTE DE VALORES. Todo número de dinheiro sai de `Orcamento.calcular(orc)`. O módulo refaz a conta de
 *   cada linha pela MESMA régua (`Arred`) que as fórmulas do XLSX usam e COMPARA com o motor; se o total do
 *   pacote não for o total do orçamento ao centavo, `montar` RECUSA com o motivo. Pacote com dois totais é
 *   o defeito que gera impugnação.
 * ⚠ NADA É INVENTADO. Composição que a base não detalha vira aviso; cronograma que não existe vira pendência
 *   (a distribuição "proporcional" do motor NÃO é cronograma); BDI manual (sem parcelas) não é decomposto;
 *   encargo sem tabela oficial da base não é estimado; campo do responsável sem dado sai [PREENCHER: ...].
 * ⚠ Sem nome de programa de mercado em lugar nenhum (pedido do Rogério, 10/11/2026).
 *
 * Módulo PURO até `paginar` (usa o DOM, reaproveitando LicitacaoDocs.paginar). ES5 de propósito (CLAUDE.md).
 * ===================================================================== */
(function (global) {
  "use strict";

  function _dep(nome) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") {
      var arq = { Orcamento: "orcamento", Arred: "arredondamento", Bdi: "bdi", Util: "util", EncargosTab: "encargostab", LicitacaoDocs: "licitacaodocs", Bases: "bases", Analitico: "analitico", Licitacao: "licitacao" }[nome];
      if (arq) { try { var m = require("./" + arq + ".js"); if (m) return m; } catch (e) {} }
    }
    return null;
  }
  function s(v) { return String(v == null ? "" : v).trim(); }
  function nm(v) { var u = _dep("Util"); return u && u.num ? u.num(v) : (Number(v) || 0); }
  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function arr(x, c) { var f = Math.pow(10, c), sg = x < 0 ? -1 : 1; return sg * Math.round(Math.abs(x) * f + 1e-9) / f; }
  function fmt(n, c) {
    n = Number(n) || 0;
    var t = arr(n, c).toFixed(c), neg = t.charAt(0) === "-";
    if (neg) t = t.slice(1);
    var p = t.split(".");
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (neg ? "-" : "") + p.join(",");
  }
  function R(n) { return "R$ " + fmt(n, 2); }
  function P(n) { return fmt(n, 2) + "%"; }
  function cent(x) { return Math.round(x * 100 + (x < 0 ? -1e-9 : 1e-9)); }
  function norm(t) {
    var x = String(t == null ? "" : t).toUpperCase();
    try { x = x.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
    return x.replace(/[^A-Z0-9]/g, "");
  }
  function lista(a) { return Array.isArray(a) ? a : []; }
  /* campo obrigatório que falta: nunca preenchido por palpite */
  function pr(rotulo) { return "[PREENCHER: " + rotulo + "]"; }
  function campo(v, rotulo) { return s(v) ? esc(v) : '<span class="ld-p0">' + esc(pr(rotulo)) + '</span>'; }

  var CATS = ["MO", "MAT", "EQ", "OUTROS"];
  var CAT_ROT = { MO: "Mão de obra", MAT: "Material", EQ: "Equipamento", OUTROS: "Serviço/auxiliar" };
  function catDe(i) {
    if (i && String(i.tipo || "").toUpperCase() === "COMPOSICAO") return "OUTROS";
    var c = String((i && i.categoria) || "").toUpperCase();
    return (c === "MO" || c === "MAT" || c === "EQ") ? c : "OUTROS";
  }

  var CLASSES = { A: 80, B: 95 };   // mesma régua de Orcamento.curvaABC: A até 80%, B até 95%, C o resto (80/15/5)

  /* ---------------------------------------------------------------- *
   * helpers de domínio
   * ---------------------------------------------------------------- */
  function fonteChave(it) {
    var f = s(it.baseFonte || it.origem).toUpperCase();
    return (!f || f === "PROPRIO" || f === "PROPRIA") ? "PROPRIA" : f;
  }
  function rotuloFonte(chave) {
    if (chave === "PROPRIA") return "Própria";
    var B = _dep("Bases");
    return (B && B.rotuloCurto) ? B.rotuloCurto(chave) : chave;
  }
  /* item com código de base OFICIAL do catálogo (SINAPI, SIURB, SEINFRA...). Outro caso = própria/cotação. */
  function temBaseOficial(it) {
    var chave = fonteChave(it), B = _dep("Bases");
    if (chave === "PROPRIA" || chave === "OUTRA" || !s(it.codigo)) return false;
    if (B && B.META) return !!B.META[chave];
    return /^(SINAPI|SICRO|SIURB|SEINFRA|SETOP|SUDECAP|ORSE|IOPES|AGESUL|DERPR|SEDOP|AGETOP|CDHU|CPOS|FDE|EMOP|DEINFRA|DER)/.test(chave);
  }
  function ehSinapi(chave) { return chave === "SINAPI" || chave === "SINAPI_DES"; }
  function compTexto(c) {
    var t = s(c), m = /^(\d{4})-(\d{2})/.exec(t);
    if (m) return m[2] + "/" + m[1];
    return t;
  }

  /* centavos pelo método do maior resto: reparte `alvo` entre as fatias sem perder nem criar centavo */
  function alocarCentavos(raws, alvo) {
    var n = raws.length, base = [], soma = 0, i;
    for (i = 0; i < n; i++) { base.push(cent(raws[i])); soma += base[i]; }
    var dif = cent(alvo) - soma;
    if (dif !== 0 && n) {
      var ord = raws.map(function (x, k) { return { k: k, r: x * 100 - base[k] }; });
      ord.sort(function (a, b) { return dif > 0 ? (b.r - a.r) : (a.r - b.r); });
      for (i = 0; i < Math.abs(dif); i++) base[ord[i % n].k] += dif > 0 ? 1 : -1;
    }
    return base.map(function (c) { return c / 100; });
  }

  /* ---------------------------------------------------------------- *
   * CURVA ABC (pura): itens [{valor, ...}] -> ordenados por valor desc (estável), % e acumulado, classe A/B/C.
   * O item cuja soma acumulada ainda cabe em 80% é A, até 95% é B, o resto C (a mesma regra de Orcamento.curvaABC).
   * ---------------------------------------------------------------- */
  function curvaABC(itens, total) {
    var lst = itens.map(function (x, k) { return { x: x, k: k }; });
    lst.sort(function (a, b) { return (b.x.valor - a.x.valor) || (a.k - b.k); });
    var t = total > 0 ? total : lst.reduce(function (a, o) { return a + o.x.valor; }, 0);
    var acum = 0, resumo = { A: { qtd: 0, valor: 0, pct: 0 }, B: { qtd: 0, valor: 0, pct: 0 }, C: { qtd: 0, valor: 0, pct: 0 } };
    var linhas = lst.map(function (o) {
      acum += o.x.valor;
      var pct = t > 0 ? o.x.valor / t * 100 : 0, ac = t > 0 ? acum / t * 100 : 0;
      var cl = ac <= CLASSES.A + 1e-9 ? "A" : (ac <= CLASSES.B + 1e-9 ? "B" : "C");
      resumo[cl].qtd++; resumo[cl].valor += o.x.valor;
      var r = {}; for (var k in o.x) r[k] = o.x[k];
      r.pct = pct; r.acum = ac; r.classe = cl;
      return r;
    });
    ["A", "B", "C"].forEach(function (c) { resumo[c].valor = arr(resumo[c].valor, 2); resumo[c].pct = t > 0 ? resumo[c].valor / t * 100 : 0; });
    return { linhas: linhas, total: arr(t, 2), resumo: resumo };
  }

  /* ---------------------------------------------------------------- *
   * COMPOSIÇÃO do item: do próprio item; senão, opcoes.composicoes (mapa código -> {insumos, fonte}); senão, a base
   * analítica SINAPI carregada, se for da UF do orçamento. Nunca inventa.
   * ---------------------------------------------------------------- */
  function composicaoDe(it, orc, opcoes) {
    var lst = null, origem = "";
    if (Array.isArray(it.insumos) && it.insumos.length) { lst = it.insumos; origem = "composição gravada no item"; }
    else if (opcoes.composicoes && opcoes.composicoes[String(it.codigo)] && Array.isArray(opcoes.composicoes[String(it.codigo)].insumos)) {
      lst = opcoes.composicoes[String(it.codigo)].insumos; origem = s(opcoes.composicoes[String(it.codigo)].fonte) || "composição informada";
    } else if (ehSinapi(fonteChave(it))) {
      var An = _dep("Analitico");
      if (An && An.carregado && typeof An.obter === "function" && s(An.uf).toUpperCase() === s(orc.uf).toUpperCase()) {
        var reg = An.obter(it.codigo);
        if (reg && Array.isArray(reg.insumos) && reg.insumos.length) { lst = reg.insumos; origem = "analítico SINAPI " + s(An.uf) + " " + compTexto(An.competencia); }
      }
    }
    if (!lst) return null;
    var ins = lst.map(function (x) {
      var co = nm(x.coeficiente), cu = nm(x.custoUnitario);
      return { codigo: s(x.codigo), descricao: s(x.descricao), unidade: s(x.unidade), fonte: s(x.fonte), coef: co, cu: cu, ct: co * cu, cat: catDe(x), auxiliar: String(x.tipo || "").toUpperCase() === "COMPOSICAO" };
    });
    return { insumos: ins, origem: origem };
  }

  /* ---------------------------------------------------------------- *
   * BDI: parcelas do orçamento (Acórdão TCU 2.622/2013). BDI manual (sem parcelas) NÃO é decomposto.
   * ---------------------------------------------------------------- */
  var BDI_PARCELAS = [["AC", "Administração central"], ["S", "Seguros"], ["R", "Riscos"], ["G", "Garantias"], ["DF", "Despesas financeiras"], ["L", "Lucro"], ["I", "Tributos sobre o faturamento (PIS, COFINS, ISS, CPRB)"]];
  function bdiQuadro(params, pctAplicado, tipoObra, tipoInformado) {
    var B = _dep("Bdi"), fx = B && B.FAIXAS_TCU ? B.FAIXAS_TCU[tipoObra] : null;
    var q = { pct: pctAplicado, tipoObra: tipoObra, tipoObraRotulo: fx ? fx.label : tipoObra, tipoInformado: !!tipoInformado, faixa: fx ? { min: fx.min, max: fx.max } : null,
      aviso: B && B.avisoFaixa ? B.avisoFaixa(pctAplicado, tipoObra) : null, parcelas: null, calculado: null, incoerente: false, formula: "BDI = [ (1 + AC + S + R + G) × (1 + DF) × (1 + L) / (1 − I) ] − 1" };
    if (params && typeof params === "object" && BDI_PARCELAS.some(function (p) { return nm(params[p[0]]) > 0; })) {
      q.parcelas = BDI_PARCELAS.map(function (p) { return { sigla: p[0], nome: p[1], pct: nm(params[p[0]]) }; });
      q.calculado = B.calcular(params);
      q.incoerente = Math.abs(q.calculado - pctAplicado) > 0.05;
    }
    return q;
  }

  /* ---------------------------------------------------------------- *
   * ENCARGOS: tabela da base oficial (CAIXA/SINAPI, por UF e regime). Fora da SINAPI não há tabela aqui: pendência.
   * ---------------------------------------------------------------- */
  function encargosDe(orc, cfg, usaSinapi, opcoes, pend) {
    var ET = _dep("EncargosTab"), LD = _dep("LicitacaoDocs");
    var tipo = s(cfg.encargos && cfg.encargos.tipo) === "nao_desonerado" ? "nao_desonerado" : "desonerado";
    if (typeof orc.desonerado === "boolean") tipo = orc.desonerado ? "desonerado" : "nao_desonerado";
    var out = { ok: false, regime: tipo, regimeRotulo: tipo === "desonerado" ? "desonerado" : "não desonerado", uf: s(orc.uf).toUpperCase(), declarado: null, avisos: [], outroRegime: null };
    var decH = nm(cfg.encargos && cfg.encargos.horista), decM = nm(cfg.encargos && cfg.encargos.mensalista);
    if (decH > 0 || decM > 0) out.declarado = { horista: decH, mensalista: decM };
    var tabela = opcoes.encargos || null;   // tabela oficial da base do órgão, no formato de EncargosTab
    if (!tabela && usaSinapi && ET && ET.todas) {
      var cand = ET.todas().filter(function (t) { return t && ET.regimeDe(t.regime) === tipo && s(t.uf).toUpperCase() === out.uf; });
      cand.sort(function (a, b) { return s(b.competencia) < s(a.competencia) ? -1 : (s(b.competencia) > s(a.competencia) ? 1 : 0); });
      tabela = cand[0] || null;
      var outro = ET.todas().filter(function (t) { return t && ET.regimeDe(t.regime) !== tipo && s(t.uf).toUpperCase() === out.uf; })[0];
      if (outro) { var ot = ET.totaisDe(outro); out.outroRegime = { regime: ET.regimeDe(outro.regime) === "desonerado" ? "desonerado" : "não desonerado", horista: ot.horista, mensalista: ot.mensalista }; }
    }
    if (!tabela || !LD || !LD.parseEncargos) {
      out.motivo = !usaSinapi && !opcoes.encargos
        ? "As bases usadas (fora da SINAPI) publicam encargos próprios que o OrçaPRO ainda não tem em tabela: informe a tabela oficial da base. Nenhum valor foi estimado."
        : "Não há tabela de encargos da base para a UF " + (out.uf || "(não informada)") + " no regime " + out.regimeRotulo + ". Nenhum valor foi estimado.";
      pend.bloqueios.push("Encargos sociais: " + out.motivo);
      return out;
    }
    var pe = LD.parseEncargos({ encargos: { linhas: tabela.linhas }, tabelas: { desonerado: ET.regimeDe(tabela.regime) === "desonerado" }, regimeConfirmado: true });
    if (!pe.ok) { out.motivo = pe.motivo; pend.bloqueios.push("Encargos sociais: " + pe.motivo); return out; }
    out.ok = true; out.grupos = pe.grupos; out.total = pe.total; out.avisos = pe.avisos || [];
    out.fonte = s(tabela.fonte); out.rotulo = s(tabela.rotulo); out.competencia = s(tabela.competencia); out.url = s(tabela.url);
    if (out.declarado && (Math.abs(out.declarado.horista - pe.total.horista) > 0.015 || Math.abs(out.declarado.mensalista - pe.total.mensalista) > 0.015)) {
      out.divergeDeclarado = true;
      pend.conferir.push("Encargos: o orçamento declara horista " + P(out.declarado.horista) + " / mensalista " + P(out.declarado.mensalista) + " e a tabela da base dá " + P(pe.total.horista) + " / " + P(pe.total.mensalista) + ". Conferir qual vale.");
    }
    return out;
  }

  /* ---------------------------------------------------------------- *
   * MONTAR
   * opcoes: { orgao:{nome,uf}, obra, local, objeto, processo, data (ISO), dataBase, tipoObra (chave de Bdi.FAIXAS_TCU),
   *   recursoFederal (bool), bases:[{fonte,uf,competencia,regime}], responsavel:{nome,titulo,registro}, art:{tipo,numero},
   *   composicoes:{cod:{insumos,fonte}}, encargos (tabela), bdiDiferenciado:{percentual,params}, cronograma (formato
   *   de Orcamento.cronograma), pesquisa:{avaliacoes,fontes,regulamento}, totalEsperado, empresa }
   * ---------------------------------------------------------------- */
  function montar(orc, opcoes) {
    opcoes = opcoes || {};
    var Orc = _dep("Orcamento"), A = _dep("Arred"), B = _dep("Bdi");
    if (!orc || !Orc || !A) return { ok: false, erro: "Orçamento ou módulos de cálculo indisponíveis." };
    var calc = Orc.calcular(orc), cfg = calc.cfg;
    var linhas = calc.linhas || [];
    if (!linhas.length) return { ok: false, erro: "O orçamento não tem itens." };
    var modo = calc.modo, pct = calc.pct, bdiNoPU = calc.bdiNoPU;
    var pend = { bloqueios: [], conferir: [], avisos: [] };
    var tolTot = modo === "nenhum" ? 1e-6 : 0.004;

    /* ---- itens: a conta de cada linha refeita pela régua das fórmulas do XLSX e comparada com o motor ---- */
    var itens = [], etapas = [], eIdx = {}, divergencias = [];
    linhas.forEach(function (Ln) {
      var it = Ln.item || {}, q = Ln.quantidade, raw = nm(it.custoUnitario);
      var cu = A.unitario(raw, modo), ct = A.valor(q * cu, modo);
      var pu = bdiNoPU ? A.unitario(raw * (1 + pct / 100), modo) : cu;
      var pt = A.valor(q * pu, modo);
      if (Math.abs(ct - Ln.custoTotal) > tolTot || Math.abs(pt - Ln.precoTotal) > tolTot || Math.abs(pu - Ln.precoUnit) > tolTot) {
        divergencias.push("item " + Ln.numero + ": o pacote calcularia custo " + R(ct) + " / preço " + R(pt) + " e o orçamento tem " + R(Ln.custoTotal) + " / " + R(Ln.precoTotal));
      }
      var chave = fonteChave(it), comBase = temBaseOficial(it);
      var comp = composicaoDe(it, orc, opcoes);
      var linhaI = {
        numero: Ln.numero, etapaIdx: Ln.etapaIdx, codigo: s(Ln.codigo), fonteChave: chave, fonte: rotuloFonte(chave), comBaseOficial: comBase,
        descricao: s(Ln.descricao), unidade: s(Ln.unidade), quantidade: q, custoBase: raw, cu: cu, bdiPct: bdiNoPU ? pct : 0, pu: pu, ct: ct, pt: pt,
        opcional: !!Ln.opcional, memoria: s(it.memoriaCalculo), composicao: comp, id: Ln.itemId
      };
      if (!(raw > 0)) pend.bloqueios.push("Item " + Ln.numero + " sem preço unitário.");
      if (!(q > 0)) pend.bloqueios.push("Item " + Ln.numero + " sem quantidade.");
      itens.push(linhaI);
      if (!eIdx[Ln.etapaIdx]) {
        eIdx[Ln.etapaIdx] = { idx: Ln.etapaIdx, codigo: s(Ln.etapaCodigo), numero: String(Ln.etapaIdx + 1), nome: s(Ln.etapaNome).replace(/^[^A-Za-z0-9À-ÿ]+/, ""), opcional: !!Ln.opcional, itens: [], custo: 0, total: 0, peso: 0 };
        etapas.push(eIdx[Ln.etapaIdx]);
      }
      var E = eIdx[Ln.etapaIdx]; E.itens.push(linhaI); E.custo += ct; E.total += pt;
    });

    /* ---- totais: do pacote × do orçamento ---- */
    var somaCt = 0, somaPt = 0;
    itens.forEach(function (I) { somaCt += I.ct; somaPt += I.pt; });
    var custoDireto = A.valor(somaCt, modo);
    var totalPacote = bdiNoPU ? A.valor(somaPt, modo) : A.valor(B.aplicar(custoDireto, pct), modo);
    if (Math.abs(custoDireto - calc.custoDireto) > tolTot) divergencias.push("o custo direto do pacote (" + R(custoDireto) + ") difere do do orçamento (" + R(calc.custoDireto) + ")");
    if (Math.abs(totalPacote - calc.precoVenda) > tolTot) divergencias.push("o total do pacote (" + R(totalPacote) + ") difere do total do orçamento (" + R(calc.precoVenda) + ")");
    if (opcoes.totalEsperado != null && Math.abs(totalPacote - nm(opcoes.totalEsperado)) > tolTot) divergencias.push("o total do pacote (" + R(totalPacote) + ") difere do total esperado pelo processo (" + R(nm(opcoes.totalEsperado)) + ")");
    if (divergencias.length) return { ok: false, erro: "O pacote teria valores diferentes do orçamento: " + divergencias.slice(0, 4).join("; ") + (divergencias.length > 4 ? " e mais " + (divergencias.length - 4) : "") + ". Corrija o orçamento antes de gerar o pacote.", divergencias: divergencias };

    var bdiValor = arr(totalPacote - custoDireto, 2);
    /* etapas: centavo a centavo, fechando com o total (na incidência "final" só o custo é por etapa) */
    var porEtapaPt = alocarCentavos(etapas.map(function (E) { return bdiNoPU ? E.total : E.custo; }), bdiNoPU ? totalPacote : custoDireto);
    etapas.forEach(function (E, k) {
      E.custo = bdiNoPU ? arr(E.custo, 2) : porEtapaPt[k]; E.total = bdiNoPU ? porEtapaPt[k] : E.custo;
      E.peso = (bdiNoPU ? totalPacote : custoDireto) > 0 ? E.total / (bdiNoPU ? totalPacote : custoDireto) * 100 : 0;
    });
    var baseTot = bdiNoPU ? totalPacote : custoDireto;
    itens.forEach(function (I) { I.peso = baseTot > 0 ? (bdiNoPU ? I.pt : I.ct) / baseTot * 100 : 0; });

    /* ---- cabeçalho ---- */
    var lic = (cfg && cfg.licitacao) || {}, org = (cfg && cfg.orgao && typeof cfg.orgao === "object") ? cfg.orgao : {};
    var clienteNome = s(orc.cliente && typeof orc.cliente === "object" ? orc.cliente.nome : orc.cliente);
    var cab = {
      orgao: s(opcoes.orgao && opcoes.orgao.nome) || s(org.nome) || s(lic.orgao && lic.orgao.nome) || clienteNome,
      obra: s(opcoes.obra) || s(orc.obra && orc.obra.nome) || s(orc.nome),
      objeto: s(opcoes.objeto) || s(lic.objeto) || s(orc.obra && orc.obra.nome),
      local: s(opcoes.local) || s(orc.obra && orc.obra.local),
      uf: s(orc.uf).toUpperCase(), numero: s(orc.numero), processo: s(opcoes.processo) || s(org.processoId) || s(lic.processo),
      data: s(opcoes.data) || s(orc.atualizadoEm) || s(orc.criadoEm),
      recursoFederal: opcoes.recursoFederal === true,
      arredondamento: A.rotulo ? A.rotulo(modo) : modo, incidencia: bdiNoPU ? "BDI no preço unitário" : "BDI sobre o preço final (parcela única)"
    };
    if (!cab.orgao) pend.conferir.push("Órgão contratante não informado: preencha o cliente do orçamento.");
    if (!cab.local) pend.conferir.push("Local da obra não informado.");

    /* ---- bases e competências ---- */
    var porBase = {}, ordemBases = [];
    itens.forEach(function (I) {
      if (!porBase[I.fonteChave]) { porBase[I.fonteChave] = { chave: I.fonteChave, rotulo: I.fonte, itens: 0, valor: 0 }; ordemBases.push(I.fonteChave); }
      porBase[I.fonteChave].itens++; porBase[I.fonteChave].valor += I.pt;
    });
    var Lc = _dep("Licitacao"), exig = [];
    try { exig = Lc && Lc.basesExigidas ? Lc.basesExigidas(orc) : []; } catch (eL) { exig = []; }
    var declaradas = lista(opcoes.bases).concat(exig);
    var bases = ordemBases.map(function (k) {
      var b = porBase[k], comp = "", uf = "", regime = "";
      if (ehSinapi(k)) { comp = compTexto(orc.competenciaSinapi); uf = cab.uf; regime = k === "SINAPI_DES" ? "desonerado" : ""; }
      else {
        var d0 = declaradas.filter(function (x) { return x && (s(x.fonte).toUpperCase() === k || s(x.catId).toUpperCase() === k); })[0];
        if (d0) { comp = compTexto(d0.competencia); uf = s(d0.uf).toUpperCase(); regime = s(d0.regime); }
      }
      if (k !== "PROPRIA" && k !== "OUTRA" && !comp) pend.conferir.push("Base " + b.rotulo + ": a competência não está registrada no orçamento; informe a data-base.");
      return { chave: k, rotulo: b.rotulo, itens: b.itens, valor: arr(b.valor, 2), competencia: comp, uf: uf, regime: regime, oficial: k !== "PROPRIA" && k !== "OUTRA" };
    });
    cab.bases = bases;
    cab.dataBase = s(opcoes.dataBase) || bases.filter(function (b) { return b.oficial && b.competencia; }).map(function (b) { return b.rotulo + " " + b.competencia; }).join(" · ");
    var usaSinapi = bases.some(function (b) { return ehSinapi(b.chave); });
    var encTipo = (typeof orc.desonerado === "boolean") ? (orc.desonerado ? "desonerado" : "nao_desonerado") : (s(cfg.encargos && cfg.encargos.tipo) === "nao_desonerado" ? "nao_desonerado" : "desonerado");
    cab.regime = encTipo === "desonerado" ? "desonerado" : "não desonerado";
    cab.bdiPct = pct;

    /* ---- BDI ---- */
    var tipoInf = s(opcoes.tipoObra) || s(org.tipoBdi);
    var bdi = bdiQuadro(orc.bdi && orc.bdi.params, pct, tipoInf || "edificacoes", !!tipoInf);
    if (!tipoInf) pend.conferir.push("Tipo de obra para a faixa do BDI não informado: foi usada a faixa de edificações do Acórdão TCU 2.622/2013. Informe o tipo de obra.");
    if (!bdi.parcelas) pend.bloqueios.push("Composição do BDI não informada (BDI digitado direto, " + P(pct) + "): o Acórdão TCU 2.622/2013 pede as parcelas. Nada foi decomposto.");
    if (bdi.incoerente) pend.conferir.push("BDI: as parcelas dão " + P(bdi.calculado) + " e o orçamento aplica " + P(pct) + ".");
    if (bdi.aviso) pend.conferir.push(bdi.aviso);
    bdi.diferenciado = null;
    if (opcoes.bdiDiferenciado && (nm(opcoes.bdiDiferenciado.percentual) > 0 || opcoes.bdiDiferenciado.params)) {
      var bd = opcoes.bdiDiferenciado, pctD = nm(bd.percentual) > 0 ? nm(bd.percentual) : B.calcular(bd.params);
      bdi.diferenciado = bdiQuadro(bd.params, pctD, "fornecimento", true);
      bdi.diferenciado.itens = lista(bd.itens);
      if (bdi.diferenciado.aviso) pend.conferir.push("BDI diferenciado: " + bdi.diferenciado.aviso);
    }

    /* ---- encargos ---- */
    var enc = encargosDe(orc, cfg, usaSinapi, opcoes, pend);
    cab.encargos = enc.ok ? { horista: enc.total.horista, mensalista: enc.total.mensalista } : (enc.declarado || null);

    /* ---- composições: o que a base detalha e o que não ---- */
    var semComp = itens.filter(function (I) { return !I.composicao; });
    if (semComp.length) pend.conferir.push(semComp.length + " item(ns) sem composição detalhada na base carregada (a analítica mostra o custo unitário, sem inventar insumos): " + semComp.slice(0, 8).map(function (I) { return I.numero; }).join(", ") + (semComp.length > 8 ? " e mais " + (semComp.length - 8) : "") + ".");
    itens.forEach(function (I) {
      if (!I.composicao) return;
      var so = 0; I.composicao.insumos.forEach(function (x) { so += x.ct; });
      I.composicao.soma = so;
      I.composicao.confere = Math.abs(so - I.cu) <= Math.max(0.02, I.cu * 0.01);
      if (!I.composicao.confere) pend.conferir.push("Item " + I.numero + " (" + I.codigo + "): a composição soma " + R(so) + " e o custo unitário é " + R(I.cu) + ".");
    });

    /* ---- curvas ABC ---- */
    var abcServ = curvaABC(itens.map(function (I) { return { numero: I.numero, codigo: I.codigo, descricao: I.descricao, fonte: I.fonte, unidade: I.unidade, quantidade: I.quantidade, pu: bdiNoPU ? I.pu : I.cu, valor: bdiNoPU ? I.pt : I.ct }; }), baseTot);
    var mIns = {}, lIns = [], detalhado = 0;
    itens.forEach(function (I) {
      if (!I.composicao) return;
      I.composicao.insumos.forEach(function (x) {
        var k = x.cat + "|" + (x.codigo || norm(x.descricao)) + "|" + norm(x.unidade);
        if (!mIns[k]) { mIns[k] = { codigo: x.codigo, descricao: x.descricao, unidade: x.unidade, cat: x.cat, auxiliar: x.auxiliar, quantidade: 0, valor: 0, cu: x.cu }; lIns.push(mIns[k]); }
        mIns[k].quantidade += I.quantidade * x.coef; mIns[k].valor += I.quantidade * x.coef * x.cu;
      });
    });
    lIns.forEach(function (x) { x.valor = arr(x.valor, 2); detalhado += x.valor; });
    detalhado = arr(detalhado, 2);
    var resto = arr(custoDireto - detalhado, 2);
    var linhasIns = lIns.slice();
    if (Math.abs(resto) >= 0.005) linhasIns.push({ codigo: "", descricao: "Itens sem composição na base e diferença de arredondamento dos coeficientes", unidade: "vb", cat: "OUTROS", auxiliar: false, quantidade: 1, valor: resto, cu: resto, residuo: true });
    var abcIns = curvaABC(linhasIns.filter(function (x) { return x.valor > 0; }), custoDireto);
    abcIns.detalhado = detalhado; abcIns.resto = resto; abcIns.semComposicao = semComp.length;
    if (semComp.length) pend.avisos.push("Curva ABC de insumos: " + semComp.length + " item(ns) sem composição entram na linha de resíduo (" + R(resto) + ").");

    /* ---- cronograma físico-financeiro ---- */
    var crono = null, cr = opcoes.cronograma || null, cronoMotivo = "";
    if (!cr) { try { cr = Orc.cronograma ? Orc.cronograma(orc) : null; } catch (eC) { cr = null; } }
    if (cr && (cr.base === "gantt" || opcoes.cronograma) && lista(cr.etapas).length === lista(orc.etapas).length) {
      var nM = cr.meses || (cr.etapas[0] && cr.etapas[0].meses ? cr.etapas[0].meses.length : 0);
      var linhasC = [], okC = true;
      etapas.forEach(function (E) {
        var ce = cr.etapas[E.idx] || {}, ms = lista(ce.meses).slice(0, nM);
        var soma = ms.reduce(function (a, v) { return a + (Number(v) || 0); }, 0);
        if (!(soma > 0) || !(E.total > 0)) { okC = false; return; }
        var pcts = ms.map(function (v) { return (Number(v) || 0) / soma; });
        /* meses 1..n-1 arredondados, o ÚLTIMO fecha a etapa: é a mesma fórmula do XLSX (ROUND nos primeiros, total menos a soma no último) */
        var vals = [], acE = 0;
        pcts.forEach(function (p, ix) { var v = ix === pcts.length - 1 ? arr(E.total - acE, 2) : arr(E.total * p, 2); vals.push(v); acE = arr(acE + v, 2); });
        linhasC.push({ numero: E.numero, nome: E.nome, total: E.total, pcts: pcts, valores: vals });
      });
      if (okC && linhasC.length === etapas.length) {
        var totM = [], ac = 0, mm;
        for (mm = 0; mm < nM; mm++) { var sv = 0; linhasC.forEach(function (l) { sv += l.valores[mm] || 0; }); sv = arr(sv, 2); ac = arr(ac + sv, 2); totM.push({ valor: sv, pct: baseTot > 0 ? sv / baseTot * 100 : 0, acumValor: ac, acumPct: baseTot > 0 ? ac / baseTot * 100 : 0 }); }
        if (Math.abs(ac - baseTot) > 0.005) return { ok: false, erro: "O cronograma físico-financeiro fecharia em " + R(ac) + " e o total do orçamento é " + R(baseTot) + ".", divergencias: ["cronograma"] };
        crono = { nMeses: nM, linhas: linhasC, totais: totM, total: ac, rotulos: lista(cr.rotulos), origem: opcoes.cronograma ? "informado pelo processo" : "Gantt do orçamento" };
      } else cronoMotivo = "Há etapa sem valor ou sem distribuição no cronograma.";
    } else {
      cronoMotivo = "O orçamento não tem cronograma elaborado (durações e dependências das etapas). A distribuição proporcional ao valor não é cronograma e não foi usada.";
    }
    if (!crono) pend.bloqueios.push("Cronograma físico-financeiro: " + cronoMotivo);

    /* ---- memória de cálculo ---- */
    var semMem = itens.filter(function (I) { return !I.memoria; });
    if (semMem.length) pend.conferir.push(semMem.length + " item(ns) sem memória de cálculo da quantidade (saem marcados na peça).");

    /* ---- mapa de cotação ---- */
    var cot = mapaCotacao(itens, opcoes.pesquisa, pend);

    /* ---- padrão Caixa (repasse federal) ---- */
    var caixa = null;
    if (cab.recursoFederal) {
      var foraSinapi = bases.filter(function (b) { return b.oficial && !ehSinapi(b.chave) && b.chave !== "SICRO"; });
      caixa = {
        aviso: "Aba montada pelos campos exigidos pelo Decreto 7.983/2013; arquivo-modelo oficial da CAIXA não localizado em fonte pública — conferir com o leiaute da CAIXA antes de enviar.",
        sinapiObrigatoria: true, foraSinapi: foraSinapi.map(function (b) { return b.rotulo; }), proprias: itens.filter(function (I) { return !I.comBaseOficial; }).length
      };
      if (foraSinapi.length) pend.bloqueios.push("Recurso federal: o Decreto 7.983/2013 (art. 3º) manda a SINAPI como referência (SICRO em infraestrutura de transportes, art. 4º). O orçamento usa também " + foraSinapi.map(function (b) { return b.rotulo; }).join(", ") + ": justifique pelo art. 6º ou troque a base.");
      if (!bases.some(function (b) { return ehSinapi(b.chave); }) && !bases.some(function (b) { return b.chave === "SICRO"; })) pend.bloqueios.push("Recurso federal sem SINAPI nem SICRO no orçamento (Decreto 7.983/2013, arts. 3º e 4º).");
      if (caixa.proprias) pend.conferir.push("Recurso federal: " + caixa.proprias + " item(ns) sem código de base oficial precisam de composição própria justificada (art. 8º) ou pesquisa de mercado (art. 6º).");
    }

    /* ---- responsável técnico, ART/RRT, declarações ---- */
    var emp = opcoes.empresa || {};
    var rt = {
      nome: s(opcoes.responsavel && opcoes.responsavel.nome) || s(emp.rtNome) || s(emp.responsavel),
      titulo: s(opcoes.responsavel && opcoes.responsavel.titulo) || s(emp.titulo),
      registro: s(opcoes.responsavel && opcoes.responsavel.registro) || s(emp.rtCrea) || s(emp.crea)
    };
    var art = { tipo: s(opcoes.art && opcoes.art.tipo) || "ART/RRT", numero: s(opcoes.art && opcoes.art.numero) };
    if (!rt.nome) pend.bloqueios.push("Responsável técnico pelo orçamento não informado.");
    if (!rt.registro) pend.bloqueios.push("Registro profissional (CREA/CAU) do responsável técnico não informado.");
    if (!art.numero) pend.bloqueios.push("Número da ART/RRT do orçamento não informado.");

    var d = {
      versao: 1, cab: cab, emp: emp, rt: rt, art: art,
      modo: modo, bdiNoPU: bdiNoPU, bdiPct: pct,
      etapas: etapas, itens: itens,
      tot: { custoDireto: custoDireto, bdi: bdiValor, precoVenda: totalPacote, qtdItens: itens.length, qtdEtapas: etapas.length },
      bdi: bdi, enc: enc, abcServ: abcServ, abcIns: abcIns, crono: crono, cronoMotivo: cronoMotivo, cot: cot, caixa: caixa,
      bases: bases, pend: pend, pronto: pend.bloqueios.length === 0,
      declaracoes: declaracoes(cab, rt, art, bases, pct, cot)
    };
    return { ok: true, dados: d, pendencias: pend };
  }

  /* ---------------------------------------------------------------- *
   * MAPA DE COTAÇÃO: itens sem base oficial. Só LÊ a pesquisa (resultado de Cplpro.pesquisaPrecos / Fluxo.pesquisar).
   * ---------------------------------------------------------------- */
  function mapaCotacao(itens, pesquisa, pend) {
    var sem = itens.filter(function (I) { return !I.comBaseOficial; });
    var av = lista(pesquisa && pesquisa.avaliacoes), fontesBrutas = (pesquisa && pesquisa.fontes) || {};
    var linhas = sem.map(function (I) {
      var a = av.filter(function (x) { return x && String(x.item) === String(I.numero); })[0] || null;
      var usadas = a ? lista(a.fontesUsadas) : [];
      var vals = usadas.map(function (f) { return nm(f.valor); }).filter(function (v) { return v > 0; });
      var srt = vals.slice().sort(function (x, y) { return x - y; });
      var med = srt.length ? (srt.length % 2 ? srt[(srt.length - 1) / 2] : (srt[srt.length / 2 - 1] + srt[srt.length / 2]) / 2) : null;
      var media = vals.length ? vals.reduce(function (x, y) { return x + y; }, 0) / vals.length : null;
      var brutas = lista(fontesBrutas[String(I.numero)]);
      var fontes = usadas.map(function (f) {
        var b = brutas[f.indice] || {};
        return { tipo: s(f.tipo), base: s(f.base || b.base), fornecedor: s(f.fornecedor || b.fornecedor), valor: nm(f.valor), data: s(b.dataColeta || b.dataAcesso || b.dataConclusao), hora: s(b.horaAcesso), link: s(f.link || b.link) };
      });
      var sit = !a ? "sem_pesquisa" : s(a.situacao);
      var l = { numero: I.numero, codigo: I.codigo, descricao: I.descricao, unidade: I.unidade, quantidade: I.quantidade, custoItem: I.cu, fontes: fontes,
        descartadas: a ? lista(a.descartadas).length : 0, media: media, mediana: med, menor: srt.length ? srt[0] : null, metodo: a ? s(a.metodo) : "", adotado: a && a.valor != null ? nm(a.valor) : null,
        situacao: sit, justificativa: a ? s(a.justificativa) : "", pendencias: a ? lista(a.pendencias) : ["Sem pesquisa de preços anexada para este item."] };
      l.diverge = l.adotado != null && Math.abs(l.adotado - I.cu) > 0.005;
      return l;
    });
    var semPesq = linhas.filter(function (l) { return l.adotado == null; }).length;
    if (linhas.length && semPesq) pend.bloqueios.push("Mapa de cotação: " + semPesq + " de " + linhas.length + " item(ns) sem base oficial ainda sem preço de referência pesquisado.");
    var divg = linhas.filter(function (l) { return l.diverge; });
    if (divg.length) pend.conferir.push("Mapa de cotação: o custo do orçamento difere do preço pesquisado nos itens " + divg.slice(0, 8).map(function (l) { return l.numero; }).join(", ") + ".");
    return { linhas: linhas, regulamento: pesquisa && pesquisa.regulamento ? s(pesquisa.regulamento.id) : "", semPesquisa: semPesq };
  }

  /* ---------------------------------------------------------------- *
   * DECLARAÇÕES do responsável (minuta curta; o que não há dado sai [PREENCHER])
   * ---------------------------------------------------------------- */
  function declaracoes(cab, rt, art, bases, pct, cot) {
    var bs = bases.filter(function (b) { return b.oficial; }).map(function (b) { return b.rotulo + (b.competencia ? " (" + b.competencia + ")" : ""); }).join(", ") || pr("bases de preços utilizadas");
    return [
      { id: "projeto", titulo: "Compatibilidade com o projeto", texto: "Declaro que as quantidades, os serviços e as especificações deste orçamento são compatíveis com o projeto " + pr("identificação do projeto básico/executivo e revisão") + ", relativo a " + (cab.obra || pr("obra")) + "." },
      { id: "bases", titulo: "Compatibilidade com as bases de preços", texto: "Declaro que os custos unitários foram obtidos das bases " + bs + ", no regime " + cab.regime + ", e que os itens sem código de base oficial tiveram o preço de referência pesquisado conforme o mapa de cotação anexo (" + cot.linhas.length + " item(ns))." },
      { id: "bdi", titulo: "BDI e encargos sociais", texto: "Declaro que o BDI de " + P(pct) + " foi composto conforme o Acórdão TCU 2.622/2013 e que os encargos sociais adotados são os da tabela oficial da base, conforme as peças anexas." },
      { id: "art", titulo: "Responsabilidade técnica", texto: "Responsável técnico: " + (rt.nome || pr("nome")) + (rt.registro ? ", registro " + rt.registro : ", " + pr("registro CREA/CAU")) + ". " + art.tipo + " nº " + (art.numero || pr("número da ART/RRT do orçamento")) + "." }
    ];
  }

  /* =====================================================================
   * HTML (reaproveita as classes e a paginação de LicitacaoDocs)
   * ===================================================================== */
  function td(v) { return '<td>' + v + '</td>'; }
  function tdN(v) { return '<td class="n">' + v + '</td>'; }
  function tdC(v) { return '<td class="c">' + v + '</td>'; }
  function sec(titulo, h) { return '<section class="ld-sec" data-tipo="corpo" data-titulo="' + esc(titulo) + '">' + h + '</section>'; }
  function col(ws) { return '<colgroup>' + ws.map(function (w) { return '<col style="width:' + w + 'mm">'; }).join("") + '</colgroup>'; }
  function pend0(t) { return '<div class="ld-pend">PENDÊNCIA: ' + esc(t) + '</div>'; }
  function faixaRascunho(d) {
    return d.pronto ? "" : '<div class="ld-pend" style="font-size:8pt;margin:0 0 3mm">COM PENDÊNCIAS — NÃO PUBLICAR. ' + esc(d.pend.bloqueios.length) + ' ponto(s) em aberto (listados na aba/folha de pendências do arquivo de trabalho).</div>';
  }

  function secSintetica(d) {
    var h = faixaRascunho(d) + '<div class="ld-tit">Planilha orçamentária sintética</div>';
    var t = '<table class="ld-t ld-split">' + col([11, 15, 14, 53, 8, 15, 16, 9, 16, 20, 9]) +
      '<thead><tr><th>ITEM</th><th>CÓDIGO</th><th>FONTE</th><th>DESCRIÇÃO</th><th>UN.</th><th>QUANT.</th><th>CUSTO UNIT. S/ BDI</th><th>BDI %</th><th>PREÇO UNIT. C/ BDI</th><th>TOTAL</th><th>PESO %</th></tr></thead><tbody>';
    d.etapas.forEach(function (E) {
      t += '<tr class="et kn"><td colspan="11">' + esc(E.numero) + '  ' + esc(E.nome) + (E.opcional ? ' (opcional)' : '') + '</td></tr>';
      E.itens.forEach(function (I) {
        t += '<tr>' + tdC(esc(I.numero)) + td(esc(I.codigo)) + tdC(esc(I.fonte)) + td(esc(I.descricao)) + tdC(esc(I.unidade)) + tdN(fmt(I.quantidade, 2)) + tdN(fmt(I.cu, 2)) +
          tdN(d.bdiNoPU ? fmt(I.bdiPct, 2) : "—") + tdN(fmt(I.pu, 2)) + tdN(fmt(d.bdiNoPU ? I.pt : I.ct, 2)) + tdN(fmt(I.peso, 2)) + '</tr>';
      });
      t += '<tr class="gr"><td colspan="9" style="text-align:right">Subtotal da etapa ' + esc(E.numero) + '</td>' + tdN(fmt(E.total, 2)) + tdN(fmt(E.peso, 2)) + '</tr>';
    });
    if (!d.bdiNoPU) {
      t += '<tr class="tt"><td colspan="9" style="text-align:right">Custo direto</td>' + tdN(fmt(d.tot.custoDireto, 2)) + tdN("") + '</tr>' +
        '<tr class="gr"><td colspan="9" style="text-align:right">BDI (' + esc(P(d.bdiPct)) + ') sobre o preço final</td>' + tdN(fmt(d.tot.bdi, 2)) + tdN("") + '</tr>';
    }
    t += '<tr class="tt"><td colspan="9" style="text-align:right">TOTAL GERAL</td>' + tdN(fmt(d.tot.precoVenda, 2)) + tdN("100,00") + '</tr></tbody></table>';
    h += t + '<p class="ld-nota">Custo direto ' + esc(R(d.tot.custoDireto)) + ' + BDI ' + esc(R(d.tot.bdi)) + ' = ' + esc(R(d.tot.precoVenda)) + '. Critério: ' + esc(d.cab.arredondamento) + '. ' + esc(d.cab.incidencia) + '.</p>';
    return sec("Sintética", h);
  }

  function secAnalitica(d) {
    var h = '<div class="ld-tit">Planilha orçamentária analítica (composições)</div>';
    d.itens.forEach(function (I) {
      var b = '<div class="ld-it" data-cont="' + esc(I.numero + " " + I.codigo) + '"><div class="ld-itt">' + esc(I.numero) + '  ' + esc(I.codigo) + '  [' + esc(I.fonte) + ']  ' + esc(I.descricao) + '  (' + esc(I.unidade) + ')</div>';
      if (I.composicao) {
        b += '<table class="ld-t">' + col([16, 16, 78, 9, 20, 22, 25]) + '<thead><tr><th>TIPO</th><th>CÓDIGO</th><th>DESCRIÇÃO</th><th>UN.</th><th>COEF.</th><th>PREÇO UNIT.</th><th>CUSTO</th></tr></thead><tbody>';
        I.composicao.insumos.forEach(function (x) {
          b += '<tr>' + tdC(esc(CAT_ROT[x.cat])) + td(esc(x.codigo)) + td(esc(x.descricao)) + tdC(esc(x.unidade)) + tdN(fmt(x.coef, 5)) + tdN(fmt(x.cu, 4)) + tdN(fmt(x.ct, 4)) + '</tr>';
        });
        b += '<tr class="tt"><td colspan="6" style="text-align:right">Custo unitário da composição (' + esc(I.composicao.origem) + ')</td>' + tdN(fmt(I.composicao.soma, 4)) + '</tr></tbody></table>';
        if (!I.composicao.confere) b += '<div class="ld-nota" style="color:#c00000">Conferir: a composição soma ' + esc(R(I.composicao.soma)) + ' e o custo unitário do orçamento é ' + esc(R(I.cu)) + '.</div>';
      } else {
        b += '<div class="ld-nota"><b>Composição sem detalhamento na base carregada</b>' + (I.comBaseOficial ? '' : ' (item sem base oficial: ver o mapa de cotação)') + '. O custo unitário do orçamento é ' + esc(R(I.cu)) + '; nenhum insumo foi inventado.</div>';
      }
      b += '<div class="ld-itv"><b>CUSTO UNITÁRIO</b> ' + esc(R(I.cu)) + '</div>';
      if (d.bdiNoPU) b += '<div class="ld-itv"><b>BDI ' + esc(P(I.bdiPct)) + '</b> ' + esc(R(I.pu - I.cu)) + '</div><div class="ld-itv"><b>PREÇO UNIT. C/ BDI</b> ' + esc(R(I.pu)) + '</div>';
      b += '</div>';
      h += b;
    });
    return sec("Analítica", h);
  }

  function secBdi(d) {
    var h = '<div class="ld-tit">Composição do BDI</div>';
    var q = d.bdi;
    function quadro(qq, titulo) {
      var o = '';
      if (titulo) o += '<div class="ld-sub"><b>' + esc(titulo) + '</b></div>';
      if (!qq.parcelas) return o + pend0("composição do BDI não informada (BDI de " + P(qq.pct) + " digitado direto). Nenhuma parcela foi inventada.");
      o += '<table class="ld-t" style="width:150mm;margin:0 auto">' + col([20, 100, 30]) + '<thead><tr><th>SIGLA</th><th>DESCRIÇÃO</th><th>%</th></tr></thead><tbody>';
      qq.parcelas.forEach(function (p) { o += '<tr>' + tdC(esc(p.sigla)) + td(esc(p.nome)) + tdN(fmt(p.pct, 2)) + '</tr>'; });
      o += '<tr class="tt"><td colspan="2">BDI calculado pela fórmula</td>' + tdN(P(qq.calculado)) + '</tr><tr class="gr"><td colspan="2">BDI aplicado no orçamento</td>' + tdN(P(qq.pct)) + '</tr></tbody></table>';
      o += '<p class="ld-ext" style="font-style:normal">' + esc(qq.formula) + '</p>';
      o += '<p class="ld-nota">Tipo de obra: ' + esc(qq.tipoObraRotulo) + (qq.tipoInformado ? '' : ' (assumido; conferir)') + (qq.faixa ? '. Faixa referencial do Acórdão TCU 2.622/2013 (1º e 3º quartis): ' + esc(P(qq.faixa.min)) + ' a ' + esc(P(qq.faixa.max)) + '.' : '.') + '</p>';
      if (qq.aviso) o += '<div class="ld-pend" style="font-size:8pt">' + esc(qq.aviso) + '</div>';
      if (qq.incoerente) o += '<div class="ld-pend" style="font-size:8pt">As parcelas dão ' + esc(P(qq.calculado)) + ' e o orçamento aplica ' + esc(P(qq.pct)) + '. Conferir.</div>';
      return o;
    }
    h += quadro(q, "");
    if (q.diferenciado) h += quadro(q.diferenciado, "BDI diferenciado — fornecimento de materiais e equipamentos" + (q.diferenciado.itens.length ? " (itens " + q.diferenciado.itens.join(", ") + ")" : ""));
    else h += '<p class="ld-nota">O orçamento aplica um único BDI a todos os itens; não há BDI diferenciado informado para fornecimento de materiais e equipamentos.</p>';
    return sec("BDI", h);
  }

  function secEncargos(d) {
    var e = d.enc, h = '<div class="ld-tit">Encargos sociais</div>';
    if (!e.ok) {
      h += pend0(e.motivo);
      if (e.declarado) h += '<p class="ld-nota">Declarado no orçamento (sem tabela da base para conferir): horista ' + esc(P(e.declarado.horista)) + ', mensalista ' + esc(P(e.declarado.mensalista)) + '.</p>';
      return sec("Encargos sociais", h);
    }
    var t = '<table class="ld-t ld-split" style="width:150mm;margin:0 auto">' + col([14, 96, 20, 20]) + '<thead><tr><th>COD</th><th>DESCRIÇÃO</th><th>HORISTA %</th><th>MENSALISTA %</th></tr></thead><tbody>';
    e.grupos.forEach(function (g) {
      t += '<tr class="et kn"><td colspan="4">GRUPO ' + g.grupo + '</td></tr>';
      g.linhas.forEach(function (l) { t += '<tr>' + td(esc(l.codigo)) + td(esc(l.descricao)) + tdN(P(l.horista)) + tdN(l.mensalistaNI ? "Não incide" : P(l.mensalista)) + '</tr>'; });
      t += '<tr class="gr"><td></td><td>TOTAL GRUPO ' + g.grupo + '</td>' + tdN(P(g.horista)) + tdN(P(g.mensalista)) + '</tr>';
    });
    t += '</tbody></table>';
    h += '<p class="ld-nota" style="text-align:center">Regime: <b>' + esc(e.regimeRotulo) + '</b> · UF ' + esc(e.uf) + '</p>' + t;
    h += '<p class="ld-ext" style="font-style:normal"><b>A + B + C + D = ' + esc(P(e.total.horista)) + ' (horista)  /  ' + esc(P(e.total.mensalista)) + ' (mensalista)</b></p>';
    if (e.outroRegime) h += '<p class="ld-nota" style="text-align:center">Para comparação, no regime ' + esc(e.outroRegime.regime) + ': horista ' + esc(P(e.outroRegime.horista)) + ', mensalista ' + esc(P(e.outroRegime.mensalista)) + '.</p>';
    h += '<p class="ld-nota">Fonte: ' + esc(e.rotulo || e.fonte) + '.' + (e.declarado ? ' Declarado no orçamento: horista ' + esc(P(e.declarado.horista)) + ', mensalista ' + esc(P(e.declarado.mensalista)) + (e.divergeDeclarado ? ' (DIVERGE da tabela; conferir)' : ' (confere)') + '.' : '') + '</p>';
    return sec("Encargos sociais", h);
  }

  function secAbc(d, tipo) {
    var ab = tipo === "serv" ? d.abcServ : d.abcIns;
    var h = '<div class="ld-tit">Curva ABC de ' + (tipo === "serv" ? "serviços" : "insumos") + '</div>';
    var t = '<table class="ld-t ld-split">' + (tipo === "serv"
      ? col([13, 17, 62, 9, 17, 22, 18, 14, 14]) + '<thead><tr><th>ITEM</th><th>CÓDIGO</th><th>DESCRIÇÃO</th><th>UN.</th><th>QUANT.</th><th>VALOR</th><th>%</th><th>ACUM. %</th><th>CL.</th></tr></thead>'
      : col([13, 17, 62, 9, 17, 22, 18, 14, 14]) + '<thead><tr><th>TIPO</th><th>CÓDIGO</th><th>DESCRIÇÃO</th><th>UN.</th><th>QUANT.</th><th>VALOR</th><th>%</th><th>ACUM. %</th><th>CL.</th></tr></thead>') + '<tbody>';
    ab.linhas.forEach(function (c) {
      t += '<tr>' + (tipo === "serv" ? tdC(esc(c.numero)) : tdC(esc(CAT_ROT[c.cat]))) + td(esc(c.codigo)) + td(esc(c.descricao)) + tdC(esc(c.unidade)) + tdN(fmt(c.quantidade, 2)) + tdN(fmt(c.valor, 2)) + tdN(fmt(c.pct, 2)) + tdN(fmt(c.acum, 2)) + tdC(c.classe) + '</tr>';
    });
    t += '<tr class="tt"><td colspan="5" style="text-align:right">TOTAL</td>' + tdN(fmt(ab.total, 2)) + '<td colspan="3"></td></tr></tbody></table>';
    h += t + '<table class="ld-t" style="width:110mm;margin:3mm auto 0">' + col([20, 25, 35, 30]) + '<thead><tr><th>CLASSE</th><th>ITENS</th><th>VALOR</th><th>%</th></tr></thead><tbody>' +
      ["A", "B", "C"].map(function (c) { return '<tr>' + tdC(c) + tdN(String(ab.resumo[c].qtd)) + tdN(fmt(ab.resumo[c].valor, 2)) + tdN(fmt(ab.resumo[c].pct, 2)) + '</tr>'; }).join("") + '</tbody></table>';
    h += '<p class="ld-nota">Classe A: até 80% do valor acumulado; B: de 80% a 95%; C: acima de 95%. ' + (tipo === "serv" ? 'Valores ' + (d.bdiNoPU ? 'com BDI.' : 'de custo direto.') : 'Valores de custo direto (coeficiente × quantidade × preço do insumo).' + (ab.resto ? ' Resíduo de itens sem composição/arredondamento: ' + esc(R(ab.resto)) + '.' : '')) + '</p>';
    return sec(tipo === "serv" ? "Curva ABC de serviços" : "Curva ABC de insumos", h);
  }

  function secCronograma(d) {
    var h = '<div class="ld-tit">Cronograma físico-financeiro</div>';
    if (!d.crono) return sec("Cronograma", h + pend0(d.cronoMotivo));
    var c = d.crono, POR = 6, k, blocos = [];
    for (k = 0; k < c.nMeses; k += POR) blocos.push([k, Math.min(c.nMeses, k + POR)]);
    function rot(i) { return c.rotulos[i] ? esc(c.rotulos[i]) : (i + 1) + 'º MÊS'; }
    blocos.forEach(function (bl, bi) {
      var ult = bi === blocos.length - 1, n2 = bl[1] - bl[0], wM = ult ? 19 : 26, i;
      var ws = [8, ult ? 36 : 44, 22]; for (i = 0; i < n2; i++) ws.push(wM); if (ult) ws.push(22);
      var t = '<table class="ld-t ld-split" style="font-size:6.6pt">' + col(ws) + '<thead><tr><th>ITEM</th><th>ETAPA</th><th>VALOR (R$)</th>';
      for (i = bl[0]; i < bl[1]; i++) t += '<th>' + rot(i) + '</th>';
      if (ult) t += '<th>TOTAL</th>';
      t += '</tr></thead><tbody>';
      c.linhas.forEach(function (l) {
        t += '<tr>' + tdC(esc(l.numero)) + td(esc(l.nome)) + tdN(fmt(l.total, 2));
        for (i = bl[0]; i < bl[1]; i++) t += '<td class="n" style="font-size:6.2pt">' + fmt(l.pcts[i] * 100, 2) + '%<br>' + fmt(l.valores[i], 2) + '</td>';
        if (ult) t += tdN(fmt(l.total, 2));
        t += '</tr>';
      });
      t += '<tr class="tt"><td></td><td>TOTAL</td>' + tdN(fmt(c.total, 2));
      for (i = bl[0]; i < bl[1]; i++) t += '<td class="n" style="font-size:6.2pt">' + fmt(c.totais[i].pct, 2) + '%<br>' + fmt(c.totais[i].valor, 2) + '</td>';
      if (ult) t += tdN(fmt(c.total, 2));
      t += '</tr><tr class="gr"><td></td><td>Acumulado</td><td></td>';
      for (i = bl[0]; i < bl[1]; i++) t += '<td class="n" style="font-size:6.2pt">' + fmt(c.totais[i].acumPct, 2) + '%<br>' + fmt(c.totais[i].acumValor, 2) + '</td>';
      if (ult) t += '<td></td>';
      t += '</tr></tbody></table>' + (ult ? '' : '<div style="height:4mm"></div>');
      h += t;
    });
    h += '<p class="ld-nota">Origem: ' + esc(c.origem) + '. Em cada mês: percentual físico da etapa e valor financeiro. A diferença de centavos fica no mês de maior resto de cada etapa; o total fecha com a sintética.</p>';
    return sec("Cronograma", h);
  }

  function secMemoria(d) {
    var h = '<div class="ld-tit">Memória de cálculo dos quantitativos</div>';
    var t = '<table class="ld-t ld-split">' + col([13, 17, 52, 9, 17, 78]) + '<thead><tr><th>ITEM</th><th>CÓDIGO</th><th>DESCRIÇÃO</th><th>UN.</th><th>QUANT.</th><th>MEMÓRIA DE CÁLCULO</th></tr></thead><tbody>';
    d.itens.forEach(function (I) {
      t += '<tr>' + tdC(esc(I.numero)) + td(esc(I.codigo)) + td(esc(I.descricao)) + tdC(esc(I.unidade)) + tdN(fmt(I.quantidade, 2)) +
        td(I.memoria ? esc(I.memoria).replace(/\n/g, "<br>") : '<span class="ld-p0">SEM MEMÓRIA DE CÁLCULO INFORMADA</span>') + '</tr>';
    });
    return sec("Memória de cálculo", h + t + '</tbody></table>');
  }

  function secCotacao(d) {
    var h = '<div class="ld-tit">Mapa de cotação — itens sem base oficial</div>', c = d.cot;
    if (!c.linhas.length) return sec("Mapa de cotação", h + '<p class="ld-nota">Todos os itens têm código de base oficial; não há composição própria nem item a cotar.</p>');
    var t = '<table class="ld-t ld-split">' + col([11, 50, 8, 14, 14, 14, 14, 14, 47]) + '<thead><tr><th>ITEM</th><th>DESCRIÇÃO / FONTES</th><th>UN.</th><th>MÉDIA</th><th>MEDIANA</th><th>MENOR</th><th>ADOTADO</th><th>CUSTO NO ORÇ.</th><th>SITUAÇÃO</th></tr></thead><tbody>';
    c.linhas.forEach(function (l) {
      var fs = l.fontes.map(function (f) { return esc((f.fornecedor || f.base || f.tipo) + ' — ' + R(f.valor) + (f.data ? ' em ' + f.data : '') + (f.hora ? ' ' + f.hora : '')); }).join("<br>");
      t += '<tr>' + tdC(esc(l.numero)) + td('<b>' + esc(l.descricao) + '</b>' + (fs ? '<br>' + fs : '')) + tdC(esc(l.unidade)) +
        tdN(l.media != null ? fmt(l.media, 2) : "—") + tdN(l.mediana != null ? fmt(l.mediana, 2) : "—") + tdN(l.menor != null ? fmt(l.menor, 2) : "—") +
        tdN(l.adotado != null ? fmt(l.adotado, 2) + (l.metodo ? '<br>(' + esc(l.metodo) + ')' : '') : '<span class="ld-p0">PENDENTE</span>') + tdN(fmt(l.custoItem, 2)) +
        td(esc(l.situacao) + (l.diverge ? '<br><span class="ld-p0">custo do orçamento ≠ adotado</span>' : '') + (l.pendencias.length ? '<br>' + esc(l.pendencias.join(" ")) : '') + (l.justificativa ? '<br>Justificativa: ' + esc(l.justificativa) : '')) + '</tr>';
    });
    return sec("Mapa de cotação", h + t + '</tbody></table><p class="ld-nota">Pesquisa lida do processo' + (c.regulamento ? ' (regulamento ' + esc(c.regulamento) + ')' : '') + '. Descartes e justificativas constam da pesquisa; nenhum preço foi criado aqui.</p>');
  }

  function secCaixa(d) {
    var c = d.caixa, h = '<div class="ld-tit">Padrão CAIXA — repasse federal</div>';
    h += '<div class="ld-pend" style="font-size:8pt">' + esc(c.aviso) + '</div>';
    h += '<table class="ld-t" style="width:170mm;margin:3mm auto">' + col([60, 110]) + '<tbody>' +
      [["Proponente / órgão", campo(d.cab.orgao, "órgão")], ["Objeto", campo(d.cab.objeto, "objeto")], ["Local / UF", campo(d.cab.local, "local") + ' / ' + esc(d.cab.uf)],
        ["Base de referência", esc(d.cab.dataBase || "—")], ["Regime de encargos", esc(d.cab.regime)], ["Custo direto", esc(R(d.tot.custoDireto))], ["BDI", esc(P(d.bdiPct)) + ' (' + esc(R(d.tot.bdi)) + ')'],
        ["Valor total do investimento (QCI)", '<b>' + esc(R(d.tot.precoVenda)) + '</b>'], ["Itens sem código de base oficial", String(c.proprias)]]
        .map(function (r) { return '<tr><td class="et"><b>' + r[0] + '</b></td>' + td(r[1]) + '</tr>'; }).join("") + '</tbody></table>';
    h += '<p class="ld-nota">Quadro de resumo por etapa (QCI/PO) — SINAPI como referência (Decreto 7.983/2013, art. 3º; SICRO em infraestrutura de transportes, art. 4º).</p>';
    h += '<table class="ld-t">' + col([14, 110, 28, 18]) + '<thead><tr><th>ITEM</th><th>ETAPA / SERVIÇO</th><th>VALOR</th><th>%</th></tr></thead><tbody>' +
      d.etapas.map(function (E) { return '<tr>' + tdC(esc(E.numero)) + td(esc(E.nome)) + tdN(fmt(E.total, 2)) + tdN(fmt(E.peso, 2)) + '</tr>'; }).join("") +
      '<tr class="tt"><td></td><td>TOTAL</td>' + tdN(fmt(baseTotal(d), 2)) + tdN("100,00") + '</tr></tbody></table>';
    if (c.foraSinapi.length) h += '<div class="ld-pend" style="font-size:8pt">Bases fora da SINAPI neste orçamento: ' + esc(c.foraSinapi.join(", ")) + '. Com recurso da União a SINAPI é a referência (art. 3º); justificar pelo art. 6º.</div>';
    return sec("Padrão CAIXA", h);
  }
  function baseTotal(d) { return d.bdiNoPU ? d.tot.precoVenda : d.tot.custoDireto; }

  function secDeclaracoes(d) {
    var h = '<div class="ld-tit">Declarações do responsável pelo orçamento</div>';
    d.declaracoes.forEach(function (x) {
      h += '<p class="ld-p"><b>' + esc(x.titulo) + '.</b> ' + esc(x.texto).replace(/\[PREENCHER: ([^\]]*)\]/g, '<span class="ld-p0">[PREENCHER: $1]</span>') + '</p>';
    });
    h += '<table class="ld-t" style="width:150mm;margin:5mm auto">' + col([50, 100]) + '<tbody>' +
      '<tr><td class="et"><b>Responsável técnico</b></td>' + td(campo(d.rt.nome, "nome")) + '</tr>' +
      '<tr><td class="et"><b>Registro (CREA/CAU)</b></td>' + td(campo(d.rt.registro, "registro")) + '</tr>' +
      '<tr><td class="et"><b>' + esc(d.art.tipo) + ' do orçamento</b></td>' + td(campo(d.art.numero, "número da ART/RRT")) + '</tr>' +
      '<tr><td class="et"><b>Data</b></td>' + td(campo(d.cab.data ? d.cab.data.slice(0, 10).split("-").reverse().join("/") : "", "data")) + '</tr></tbody></table>';
    h += '<p class="ld-nota">Texto-base da RA Engenharia, em minuta: revisar com o jurídico do órgão antes de assinar.</p>';
    return sec("Declarações", h);
  }

  function secPendencias(d) {
    if (d.pronto && !d.pend.conferir.length) return "";
    var h = '<div class="ld-tit">Pendências e pontos a conferir</div>';
    if (d.pend.bloqueios.length) h += '<div class="ld-sub"><b>Em aberto (impedem publicar)</b></div><ul class="ld-nota" style="font-size:8pt">' + d.pend.bloqueios.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join("") + '</ul>';
    if (d.pend.conferir.length) h += '<div class="ld-sub"><b>Conferir</b></div><ul class="ld-nota" style="font-size:8pt">' + d.pend.conferir.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join("") + '</ul>';
    return sec("Pendências", h);
  }

  function tplTimbrado(d) {
    var e = d.emp || {}, cb = d.cab;
    function urlCss(v) { v = s(v); return /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(v) ? v : ""; }
    var topo = s(e.timbradoTopo) || s(e.logo), fundo = s(e.timbradoFundo);
    var logo = !topo ? '' : (urlCss(topo) ? '<div class="ld-logo ld-logo-bg orcref-logo"></div>' : '<img class="ld-logo" src="' + esc(topo) + '" alt="">');
    var wm = !fundo ? '' : (urlCss(fundo) ? '<div class="ld-wm ld-wm-bg orcref-fundo"></div>' : '<img class="ld-wm" src="' + esc(fundo) + '" alt="">');
    var bs = cb.bases.filter(function (b) { return b.oficial; }).map(function (b) { return esc(b.rotulo) + (b.competencia ? ' ' + esc(b.competencia) : '') + (b.uf ? '-' + esc(b.uf) : ''); }).join(" · ") || "bases não informadas";
    var id = '<div class="ld-id"><b>ÓRGÃO:</b> ' + campo(cb.orgao, "órgão") + '<br><b>OBRA:</b> ' + campo(cb.obra, "obra") + '<br><b>LOCAL:</b> ' + campo(cb.local, "local") + (cb.uf ? ' / ' + esc(cb.uf) : '') +
      '<br><b>DATA-BASE / BASES:</b> ' + bs + '<br><b>REGIME:</b> ' + esc(cb.regime) + ' · <b>BDI:</b> ' + esc(P(cb.bdiPct)) +
      (cb.encargos && cb.encargos.horista != null ? ' · <b>ENCARGOS:</b> ' + esc(P(cb.encargos.horista)) + ' h / ' + esc(P(cb.encargos.mensalista)) + ' m' : ' · <b>ENCARGOS:</b> pendente') + '</div>';
    var rt = d.rt;
    var ass = '<div><b>' + campo(rt.nome, "responsável técnico") + '</b>Responsável pelo orçamento<br>' + campo(rt.registro, "registro") + ' · ' + esc(d.art.tipo) + ' ' + campo(d.art.numero, "nº") + '</div>';
    var rod = '<div>' + (s(e.nome) ? esc(e.nome) + (s(e.cnpj) ? ' · CNPJ ' + esc(e.cnpj) : '') + '<br>' : '') + 'Orçamento ' + esc(cb.numero) + ' · RT: ' + campo(rt.nome, "responsável técnico") + ' · ' + campo(rt.registro, "registro") +
      '</div><div class="pag">Página {{pag}} de <span class="orcref-tot">{{tot}}</span></div>';
    return '<template class="ld-tpl" data-n="hd-std"><div class="ld-hd">' + id + logo + '</div></template>' +
      '<template class="ld-tpl" data-n="ass"><div class="ld-ass">' + ass + '</div></template>' +
      '<template class="ld-tpl" data-n="rod"><div class="ld-rod">' + rod + '</div></template>' +
      '<template class="ld-tpl" data-n="wm">' + wm + '</template>';
  }
  function cssImagens(d) {
    var e = d.emp || {}, c = "";
    function u(v) { v = s(v); return /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(v) ? v : ""; }
    var a = u(e.timbradoTopo) || u(e.logo), b = u(e.timbradoFundo);
    if (a) c += '.orcref-logo{background-image:url("' + a + '")}';
    if (b) c += '.orcref-fundo{background-image:url("' + b + '")}';
    return c;
  }

  function html(d) {
    var LD = _dep("LicitacaoDocs");
    var corpo = secSintetica(d) + secAnalitica(d) + secBdi(d) + secEncargos(d) + secAbc(d, "serv") + secAbc(d, "ins") + secCronograma(d) + secMemoria(d) + secCotacao(d) +
      (d.caixa ? secCaixa(d) : "") + secDeclaracoes(d) + secPendencias(d);
    return '<div class="ld-raiz rel-doc orcref"><style>' + (LD ? LD.css : "") + cssImagens(d) + '</style><div class="ld-fonte">' + corpo + '</div>' + tplTimbrado(d) + '<div class="ld-paginas"></div></div>';
  }

  /* paginar: LicitacaoDocs.paginar mede a folha real; depois troca {{tot}} pelo total de folhas ("Página N de M") */
  function paginar(raiz) {
    var LD = _dep("LicitacaoDocs");
    if (!LD || !LD.paginar) throw new Error("O paginador de documentos não carregou.");
    var n = LD.paginar(raiz);
    [].slice.call(raiz.querySelectorAll(".orcref-tot")).forEach(function (el) { el.textContent = String(n); });
    return n;
  }

  /* PDF direto (browser): monta, pagina fora da tela, grava e devolve { blob, paginas } */
  function pdf(d) {
    var PD = global.PdfDireto, doc = global.document;
    if (!PD || !doc) return Promise.reject(new Error("O gerador de PDF não carregou nesta página."));
    var host = doc.createElement("div");
    host.setAttribute("style", "position:absolute;left:-99999px;top:0;width:210mm");
    host.innerHTML = html(d);
    doc.body.appendChild(host);
    var limpar = function () { try { doc.body.removeChild(host); } catch (e) {} };
    try { paginar(host.querySelector(".ld-raiz")); } catch (e) { limpar(); return Promise.reject(e); }
    var folhas = host.querySelectorAll(".ld-pg");
    return PD.gerar(folhas, { titulo: "Orçamento de referência — " + (d.cab.obra || d.cab.numero), produtor: "OrçaPRO" }).then(function (res) { limpar(); return res; }, function (e) { limpar(); throw e; });
  }

  /* baixar: PDF e/ou XLSX. opcoes.formatos = ["pdf","xlsx"] (padrão os dois); opcoes.aoBlob(blob, nome) em vez de baixar */
  function baixar(orc, opcoes) {
    opcoes = opcoes || {};
    var r = montar(orc, opcoes);
    if (!r.ok) return Promise.reject(new Error(r.erro));
    var d = r.dados, formatos = opcoes.formatos || ["pdf", "xlsx"], nome = "Orcamento_referencia_" + String(orc.numero || "orcamento").replace(/[^A-Za-z0-9._-]+/g, "_");
    function entrega(blob, arq) {
      if (typeof opcoes.aoBlob === "function") { opcoes.aoBlob(blob, arq); return; }
      var PD = global.PdfDireto;
      if (PD && PD.baixar) PD.baixar(blob, arq);
    }
    var tarefas = [];
    if (formatos.indexOf("pdf") >= 0) tarefas.push(pdf(d).then(function (res) { entrega(res.blob, nome + ".pdf"); return { formato: "pdf", paginas: res.paginas }; }));
    if (formatos.indexOf("xlsx") >= 0) {
      tarefas.push(new Promise(function (ok) {
        var X = global.OrcamentoReferenciaXls, Ex = global.ExcelOrc;
        if (!X || !Ex) throw new Error("O gerador de Excel não carregou.");
        Ex.ensureExcelJS(function () { ok(); });
      }).then(function () { return global.OrcamentoReferenciaXls.gerar(global.ExcelJS, d); }).then(function (blob) { entrega(blob, nome + ".xlsx"); return { formato: "xlsx" }; }));
    }
    return Promise.all(tarefas).then(function (saidas) { return { ok: true, dados: d, saidas: saidas, pendencias: r.pendencias }; });
  }

  var OrcamentoReferencia = {
    montar: montar, html: html, paginar: paginar, pdf: pdf, baixar: baixar,
    curvaABC: curvaABC, alocarCentavos: alocarCentavos, CLASSES: CLASSES,
    _util: { fmt: fmt, R: R, P: P, norm: norm, cent: cent }
  };
  global.OrcamentoReferencia = OrcamentoReferencia;
  if (typeof module !== "undefined" && module.exports) module.exports = OrcamentoReferencia;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
