/* =====================================================================
 * madt3saidas.js — T3 (telhado de 4 águas): rodar no worker (projeto completo + orçamento), ORÇAMENTO (conta TODOS os grupos de pinos de cada nó), peças POR MEMBRO (IFC/SketchUp),
 * MEMORIAL e MANUAL DE MONTAGEM. Motor PURO, ES5, Node-testável. Arquivo novo: não altera madorcamento/madengsaidas/madengt2doc.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } } return null; }
  var T3 = null, U = null, br = function (x, n) { return (n == null ? Number(x || 0).toFixed(2) : Number(x || 0).toFixed(n)).replace(".", ","); }, copia = function (x) { return JSON.parse(JSON.stringify(x)); }, norm = function (a, b) { return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2)); };
  function pronto() { if (!T3) { T3 = dep("MadT3", "./madt3.js"); U = T3 && T3._util; } return T3; }      /* carga preguiçosa: na página este arquivo carrega ANTES dos motores do worker */
  function arr(v) { return Array.isArray(v) ? v : []; }
  function r(x, n) { var p = Math.pow(10, n); return Math.round(x * p + (x >= 0 ? 1e-9 : -1e-9)) / p; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  var EXIGENCIA = "Exigência de projeto: terças contínuas sobre a tesoura/meia-tesoura, ou emenda rígida; emenda articulada sobre a tesoura não é permitida sem novo cálculo. A telha apoia nas terças; caibros sobre o espigão não estão no modelo.";
  var FAIXA = "Documento gerado pelo sistema — emissão somente após conferência e ART do responsável técnico";

  /* ---------------------------------------------------------------- peças POR MEMBRO (posição real; aparadas) */
  function pecasMembros(res) {
    pronto(); var out = [], fonte = arr(res && res.fonte && res.fonte.pecas), mat = (fonte.filter(function (x) { return /MLC/.test(x.material || ""); })[0] || {}).material || "MLC GL24h (EN 14080)", nome = (T3 && T3._nomes) || {};
    if (!res || !res.t3) return out;
    var nomes = { P: "Pilar do perímetro", PO: "Pilar de cabeceira", FR: "Frechal", BS: "Banzo superior da tesoura", BI: "Banzo inferior da tesoura", PD: "Montante da tesoura", DG: "Diagonal da tesoura", MS: "Banzo superior da meia-tesoura", MI: "Banzo inferior da meia-tesoura", MP: "Montante da meia-tesoura", MG: "Diagonal da meia-tesoura", E: "Espigão", T: "Terça", CM: "Cumeeira", LB: "Linha do banzo inferior", DX: "Diagonal de contraventamento (águas)", DV: "Diagonal de contraventamento (vertical)", DP: "Diagonal de contraventamento (parede)" };
    arr(res.t3.membros).forEach(function (m) {
      var s = res.secoes && res.secoes[m.g === "DV" ? "DX" : m.g]; if (!nomes[m.g] || !s || !s.b || !s.h) return;
      var L = norm(m.p0, m.p1), up = T3.upDe(m); out.push({ id: m.id, g: m.g, marca: m.g, grupo: "T3 — " + nomes[m.g], descricao: nomes[m.g], material: mat, especificacao: "MLC " + r(s.b * 100, 0) + "×" + r(s.h * 100, 0) + " cm", secao: { tipo: "ret", b: s.b, h: s.h }, p0: m.p0, p1: m.p1, up: up, qtd: 1, comprimento_m: L, volume_m3: s.b * s.h * L, unidade: "peça", tes: m.tes, agua: m.agua, bisel: m.bisel });
    });
    return out;
  }

  /* ---------------------------------------------------------------- ORÇAMENTO */
  /** soma, de uma ligação, os pinos de TODOS os grupos (o da peça, os da diagonal Howe no banzo superior e inferior, etc.) */
  function gruposDe(l) {
    var g = [];
    if (l && l.pinos && l.pinos.ok !== false && l.pinos.n) g.push({ nome: "peça", n: l.pinos.n, pn: l.pinos });
    if (l && l.banzo) Object.keys(l.banzo).forEach(function (k) { if (l.banzo[k] && l.banzo[k].pinos && l.banzo[k].pinos.n) g.push({ nome: "banzo " + k, n: l.banzo[k].pinos.n, pn: l.banzo[k].pinos }); });
    return g;
  }
  /** MULTIPLICIDADE de cada ligação pela GEOMETRIA (revisão do RT: nada de tabela copiada): índice de nós por posição (extremidades e nós de apoio de cada membro) e, para cada ligação, as pontas de barra que chegam a um nó com a peça hospedeira.
   *  Cada conexão chapa-a-chapa tem DOIS grupos de pinos (um em cada peça) — por isso "2 ×" nas conexões em que só o grupo da peça A está na ligação (o da hospedeira tem o mesmo arranjo). */
  function multGeo(M3, howe) {
    var mp = {}, any = ["BS", "BI", "MS", "MI", "T", "CM", "FR", "P", "PO", "E", "PD", "MP"];
    function key(P) { return Math.round(P[0] * 1000) + "," + Math.round(P[1] * 1000) + "," + Math.round(P[2] * 1000); }
    function add(P, m) { var k = key(P); (mp[k] = mp[k] || []).push(m); }
    M3.forEach(function (m) { add(m.eixo0 || m.p0, m); add(m.eixo1 || m.p1, m); (m.nos || []).forEach(function (P) { add(P, m); }); });
    function hosp(P, m, gs) { return (mp[key(P)] || []).filter(function (o) { return o !== m && gs.indexOf(o.g) >= 0; }).length > 0; }
    function fins(m) { return [m.eixo0 || m.p0, m.eixo1 || m.p1]; }
    function pontas(gs, hs) { var n = 0; M3.forEach(function (m) { if (gs.indexOf(m.g) < 0) return; fins(m).forEach(function (P) { if (hosp(P, m, hs)) n++; }); }); return n; }
    var canto = 0, cantosFR = {}, lb = 0;
    M3.forEach(function (m) { if (m.g === "E") (m.nos || []).forEach(function (P) { if (hosp(P, m, ["FR"])) canto++; }); if (m.g === "FR") fins(m).forEach(function (P) { var k = key(P); cantosFR[k] = (cantosFR[k] || 0) + 1; }); });
    M3.forEach(function (m) { if (m.g !== "LB") return; var vistos = {}, pts = fins(m).concat(m.nos || []); pts.forEach(function (P) { var k = key(P); if (!vistos[k] && hosp(P, m, any)) { vistos[k] = 1; lb++; } }); });
    var corners = Object.keys(cantosFR).filter(function (k) { return cantosFR[k] >= 2; }).length;
    return { noPendural: pontas(["PD"], ["BS", "BI"]) / 2, noDiagonal: pontas(["DG"], ["BS", "BI"]) / 2, noBanzoSuperior: pontas(howe ? ["PD"] : ["PD", "DG"], ["BS"]), noBanzoInferior: pontas(howe ? ["PD"] : ["PD", "DG"], ["BI"]),
      noMP: pontas(["MP"], ["MS", "MI"]) / 2, noMG: pontas(["MG"], ["MS", "MI"]) / 2, noMS: pontas(["MP", "MG"], ["MS"]), noMI: pontas(["MP", "MG"], ["MI"]),
      espigaoCumeeira: 2 * pontas(["E"], ["CM", "BS", "MS"]), espigaoCanto: 2 * canto, cintaCanto: 2 * corners, meiaTesoura: 2 * pontas(["MS"], ["BS"]), pontaMI: pontas(["MI"], ["BI"]), tercaEspigaoAxial: 2 * pontas(["T"], ["E"]),
      contravDiagonal: 2 * pontas(["DX", "DV"], any), contravParede: 2 * pontas(["DP"], any), contravLB: 2 * lb, tesouraPilar: 2 * pontas(["BI", "MI"], ["P", "PO"]) };
  }
  function orcarT3(e) {
    pronto(); e = e || {};
    var MO = dep("MadOrcamento", "./madorcamento.js"), pc = e.pecas || [], X = e.extras || {}, sub = e.precos || {}, bdi = e.bdi == null ? MO.BDI_PADRAO : e.bdi, P = e.params || {}, S = e.secoes || {}, LB = e.ligacoes || {}, L3 = (e.ligacoesT3 && e.ligacoesT3.ligacoes) || {}, M3 = (e.membros || []);
    var a = P.a || 0, b = P.b || 0, inc = P.incl || 0.3, sc = Math.sqrt(1 + inc * inc), be = P.beiral || 0, preco = MO.preco;
    function qm(marca) { var s = 0; pc.forEach(function (p) { if (p.marca === marca) s += p.qtd == null ? 1 : p.qtd; }); return s; }
    function nm(g) { return M3.filter(function (m) { return m.g === g; }).length; }
    var vMlc = 0, aVerniz = 0; pc.forEach(function (p) { if (/MLC/.test(String(p.material || "")) && p.volume_m3) { vMlc += p.volume_m3; aVerniz += MO.areaFaces(p); } });
    var nPil = nm("P") + nm("PO"), pb = LB.placaBase || { dimensoes_mm: [0, 0], chumbadores: { total: 0 } }, lp = pb.dimensoes_mm[0] / 1000, tpb = (pb.espessura_mm || 25) / 1000, base = LB.base || { n: 0, comprimento: 0, chapa: { largura_mm: 0 } };
    var kgBase = nPil * (lp * lp * tpb * 7850 + 2 * ((base.chapa && base.chapa.largura_mm) || 0) / 1000 * ((base.comprimento || 0) + 0.10) * 0.016 * 7850), nChumb = nPil * ((pb.chumbadores && pb.chumbadores.total) || 0);
    /* multiplicidade: cada extremidade de barra = grupo de pinos na barra + grupo na peça em que ela se prende */
    var nTes = nm("BI"), nMt = nm("MI"), nTer = nm("T"), howe = P.tesoura && P.tesoura.tipo === "howe";
    /* REGRA DE CONTAGEM (uma instância = uma conexão chapa-a-chapa): multGeo conta, pela geometria dos membros, as pontas de barra que chegam a cada nó com a peça hospedeira (alma = 2 pontas × grupo da alma + 1 grupo em cada banzo). */
    var mult = multGeo(M3, !!howe);
    var nPinos = 0, kgChapa = 0, nWT = 0, porLig = {}, ALMAS = { noPendural: 1, noDiagonal: 1, noMP: 1, noMG: 1 };
    Object.keys(L3).forEach(function (k) {
      var l = L3[k], m = mult[k] || 0, gs = gruposDe(l), n = 0, comp = 0.2, larg = Math.max(0.03, l.chapa ? l.chapa.largura_mm / 1000 : 0.1);
      if (ALMAS[k] && l.pinos && l.pinos.n) gs = gs.map(function (g) { return g.nome === "peça" ? { nome: "alma (2 pontas)", n: 2 * g.n, pn: g.pn } : g; });
      gs.forEach(function (g) { n += g.n; comp = Math.max(comp, (g.pn && g.pn.comprimento) || 0.2); if (g.pn && g.pn.nc > 1 && g.pn.centroGrupo) larg = Math.max(larg, 2 * g.pn.centroGrupo.a + 4 * g.pn.d); });
      nPinos += m * n; kgChapa += m * 0.008 * larg * (comp + 0.05) * 7850; porLig[k] = { mult: m, grupos: gs.map(function (g) { return { nome: g.nome, n: g.n }; }), pinosPorInstancia: n, total: m * n };
      if (l.f90 && l.f90.reforco && m) nWT += m * l.f90.reforco.parafusos;
    });
    if (L3.tercaTesoura) { var cruz = 0; M3.forEach(function (m) { if (m.g === "T" || m.g === "CM") cruz += (m.nos || []).length; }); nWT += cruz * 4 * L3.tercaTesoura.porApoio; }
    if (L3.tercaEspigao) nWT += nTer * 2 * L3.tercaEspigao.porApoio;
    var mCM = 0, mE = 0; M3.forEach(function (m) { if (m.g === "CM") mCM += norm(m.p0, m.p1); if (m.g === "E") mE += norm(m.eixo0 || m.p0, m.eixo1 || m.p1); });
    var aInc = (a + 2 * be) * (b + 2 * be) * sc, per = 2 * (a + 2 * be) + 2 * (b + 2 * be);
    var prazo = (X.prazoSemanas != null ? Number(X.prazoSemanas) : 6), hEnc = X.horasEncarregado != null ? Number(X.horasEncarregado) : prazo * 44, hEng = X.horasEngenheiro != null ? Number(X.horasEngenheiro) : Math.round(0.2 * prazo * 44), areaAnd = X.areaAndaime != null ? Number(X.areaAndaime) : r(2 * (a + b) * (X.alturaAndaime || 4.5), 0), mesesAnd = X.mesesAndaime != null ? Number(X.mesesAndaime) : 2;
    var itens = [], etapa;
    function L(cod, desc, q, chave, obs) { var pr = preco(chave, sub), qq = r(q, 3); itens.push({ etapa: etapa, codigo: cod, descricao: desc, un: pr.un, qtd: qq, pu: pr.pu, total: r(qq * pr.pu, 2), fonte: pr.fonte, chave: chave, adotado: pr.adotado, editado: pr.editado, obs: obs || "" }); }
    etapa = "01 ESTRUTURA DE MADEIRA (MLC)";
    L("01.01", "Fornecimento de MLC GL24h aplainada — pilares, frechal em anel, tesouras, meias-tesouras, espigões, terças e cumeeira", vMlc, "mlc");
    L("01.02", "Frete da madeira até a obra", vMlc, "frete"); L("01.03", "Montagem da estrutura", vMlc, "montagem");
    L("01.04", "Caminhão guindauto para içamento (" + (X.diariasMunck != null ? X.diariasMunck : 3) + " diárias de 8 h)", X.horasMunck != null ? Number(X.horasMunck) : (X.diariasMunck != null ? Number(X.diariasMunck) : 3) * 8, "munck_h");
    L("01.05", "Proteção da madeira aparente: stain/verniz marítimo 3 demãos", aVerniz, "verniz");
    etapa = "02 LIGAÇÕES E FERRAGENS";
    L("02.01", "Peças de aço galvanizado a fogo — bases engastadas dos pilares (placa + chapas em cruz); as selas e cintas do canto entram pelas chapas dimensionadas de cada ligação (02.04)", kgBase, "aco_galv");
    L("02.02", "Chumbadores M20 inox A4-70 com ancoragem química", nChumb, "chumb20");
    L("02.03", "Pinos inox dos nós (TODOS os grupos de pinos de cada nó: tesouras, meias-tesouras, espigões, cinta, contraventamento); os de Ø10 e Ø12 orçados ao preço do Ø16", nPinos + nPil * (2 * (base.n || 0)), "pino16");
    L("02.04", "Chapas internas de aço inox 8 mm dos nós (inclui selas, cintas do canto e a ponta da MI, pela chapa dimensionada de cada ligação)", kgChapa, "inox_kg");
    L("02.05", "Parafusos SFS WT-T 8,2×300 (terça × tesoura, terça × espigão e reforço do fendilhamento)", nWT, "wt300");
    etapa = "03 COBERTURA";
    L("03.01", "Telha cerâmica sobre ripas, fornecida e instalada (área inclinada das 4 águas)", aInc, "telha_cer");
    L("03.02", "Rufos de cumeeira e dos espigões (cumeeira " + br(mCM) + " m + 4 espigões " + br(mE) + " m)", mCM + mE, "rufo");
    L("03.03", "Calhas dos beirais (4 lados)", per, "calha"); L("03.04", "Condutores pluviais", X.condutoresM != null ? Number(X.condutoresM) : 12, "condutor");
    etapa = "04 SERVIÇOS GERAIS E ADMINISTRAÇÃO LOCAL";
    L("04.01", "Andaime (" + mesesAnd + " meses)", areaAnd * mesesAnd, "andaime_m2mes"); L("04.02", "Montagem e desmontagem do andaime", areaAnd, "andaime_mont");
    L("04.03", "Encarregado de carpintaria (" + prazo + " semanas)", hEnc, "encarregado_h"); L("04.04", "Acompanhamento técnico do engenheiro (20 % do prazo)", hEng, "engenheiro_h");
    L("04.05", "Mobilização, desmobilização e canteiro", 1, "mobilizacao"); L("04.06", "ART de execução", 1, "art");
    var cd = r(itens.reduce(function (s, x) { return s + x.total; }, 0), 2), etapas = {}; itens.forEach(function (x) { etapas[x.etapa] = r((etapas[x.etapa] || 0) + x.total, 2); });
    return { opcao: e.opcao || "T3", nome: e.nome || "", itens: itens, etapas: etapas, custo_direto: cd, bdi: bdi, preco: r(cd * (1 + bdi), 2), volumes: { mlc: r(vMlc, 3) }, area_verniz: r(aVerniz, 1), area_telhado_m2: r(aInc, 2), pinos: { total: nPinos, porLigacao: porLig, base: nPil * (2 * (base.n || 0)) }, kgChapa: r(kgChapa, 1), nWT: nWT,
      adotados: itens.filter(function (x) { return x.adotado; }).length,
      pendencias: ["Preço da telha cerâmica = o da telha PIR do banco (o mais alto; sem referência cerâmica publicada nesta base) — substituir pelo da obra.", "Ripas, caibrinhos e cumeeira/espigões cerâmicos dentro do preço da telha; caibros secundários não modelados.", "Fundação e vedações fora do escopo da madeira."] };
  }

  /* ---------------------------------------------------------------- RODAR (worker) */
  function rodar(sol, proj, avisa, t0, MO) {
    pronto();
    var Lg = dep("MadT3Lig", "./madt3lig.js"), SA = dep("MadEngSaidas", "./madengsaidas.js"), itAtual = 0;
    avisa("dimensionar", { it: 0 });
    var out = Lg.projetar(proj, sol.partida, { voltasBase: 2, aoIterar: function (it, sec, pior) { itAtual = it + 1; avisa("dimensionar", { it: itAtual, pior: pior, sec: sec }); } });
    avisa("auditoria");
    var rr = out.resultado, q = proj._pad3 || {};
    avisa("orcamento");
    var orc = orcarT3({ opcao: sol.opcao, nome: sol.nomeOpcao, pecas: out.fonte.pecas, params: q.params, secoes: out.secoes, ligacoes: out.ligacoes, ligacoesT3: out.ligacoesT3, membros: out.t3.membros, info: out.t3.info, extras: sol.extras, precos: sol.precos, bdi: sol.bdi });
    var vento = q._vento || proj._vento || {}, avisos = (rr.avisos || []).slice();
    (out.ligacoesT3.avisos || []).forEach(function (a) { avisos.push(a); });
    /* as verificações das ligações da T3 entram nas da base: a situação (MadEngSaidas.situacao) lê res.ligacoes.verificacoes */
    var ligs = copia(out.ligacoes); ligs.verificacoes = (ligs.verificacoes || []).concat(out.ligacoesT3.verificacoes.map(function (v) { return { nome: "T3 · " + v.nome, eta: v.eta, ok: v.ok }; })); if (out.ligacoesT3.ok === false) ligs.ok = false;
    var res = {
      ok: !out.semSolucao && (!ligs || ligs.ok !== false) && out.ligacoesT3.ok !== false && !(out.auditoria && out.auditoria.achados.length), semSolucao: !!out.semSolucao, tipologia: "T3", sistema: "tesoura",
      opcao: sol.opcao, nomeOpcao: sol.nomeOpcao, secoes: out.secoes, iteracoes: out.historico.length, pior: out.pior, grupos: rr.grupos, flechas: rr.flechas, flechasMm: rr.flechasMm || null, reacoes: rr.reacoes,
      combinacoes: rr.combinacoes, avisos: avisos, avisosAnalise: rr.avisosAnalise || [], v0: vento.v0 != null ? vento.v0 : (vento.entrada && vento.entrada.v0) || null, cargasTotais: rr.cargasTotais || null, QCOB: rr.QCOB || null,
      ligacoes: ligs, ligacoesT3: out.ligacoesT3, ligacoesT2: out.ligacoesT3, rigidezBase: out.rigidezBase, fonte: out.fonte, auditoria: out.auditoria || { achados: [], porRegra: {}, ok: true }, orcamento: orc, t7: null, t3: out.t3, aparo: out.aparo,
      espigao: rr.espigao, cinta: rr.cinta, meia: rr.meia, porModelo: rr.porModelo || null, slipT: rr.slipT || null, pontaMI: rr.pontaMI || null, torcaoFR: rr.torcaoFR || null, contrav: rr.contrav || null, esf: rr.esf, compressaoE: rr.compressaoE || null, compressaoDG: rr.compressaoDG || null, compressaoMG: rr.compressaoMG || null, ms: Date.now() - t0 };
    res.memoria = { vento: vento.ok ? { memoria: vento.memoria, avisos: vento.avisos, v0: vento.v0, s1: vento.s1, s2: vento.s2, s3: vento.s3, vk: vento.vk, q: vento.q, cpi: vento.cpi, excentricidade: vento.excentricidade, casos: (vento.casos || []).map(function (c) { return { id: c.id, nome: c.nome, direcao: c.direcao, cpi: c.cpi, cpiMotivo: c.cpiMotivo, q: c.q }; }), geometria: vento.geometria, norma: vento.norma, edicao: vento.edicao } : null,
      cargas: { telha: q.params && q.params.telha && q.params.telha.peso }, pesoMLC: q.pesoMLC, classe: q.classe, umidade: q.umidade, limVao: q.limVao, limBalanco: q.limBalanco, vento_entrada: proj.vento ? { local: proj.vento.local, s1: proj.vento.s1, categoria: proj.vento.categoria, grupoS3: proj.vento.grupoS3 } : null };
    return res;
  }

  /* ---------------------------------------------------------------- MEMORIAL e MANUAL (HTML) */
  var NOME_G = { P: "Pilares do perímetro", PO: "Pilares de cabeceira", FR: "Frechal em anel", BS: "Banzos superiores da tesoura", BI: "Banzos inferiores da tesoura", PD: "Montantes da tesoura", DG: "Diagonais da tesoura", MS: "Banzos superiores da meia-tesoura", MI: "Banzos inferiores da meia-tesoura", MP: "Montantes da meia-tesoura", MG: "Diagonais da meia-tesoura", E: "Espigões", T: "Terças", CM: "Cumeeira", LB: "Linhas do banzo inferior", DX: "Diagonais de contraventamento (águas e verticais)", DP: "Diagonais de contraventamento (paredes)" };
  var CSS = "body{font:11pt/1.45 'Segoe UI',Arial,sans-serif;color:#222;margin:24mm 20mm}h1{font-size:19pt;margin:0 0 4px}h2{font-size:13pt;border-bottom:2px solid #1f4e79;color:#1f4e79;margin-top:22px}table{border-collapse:collapse;width:100%;margin:8px 0;font-size:10pt}th,td{border:1px solid #999;padding:3px 6px;text-align:left}th{background:#e8eef5}.ok{color:#0a6b2d}.nok{color:#b00020;font-weight:700}.faixa{border:2px solid #b00020;color:#b00020;padding:6px 10px;margin:10px 0;font-weight:700}.nota{font-size:9.5pt;color:#555}@page{size:A4;margin:12mm}";
  function memorial(res, op) {
    pronto(); op = op || {}; var SA = dep("MadEngSaidas", "./madengsaidas.js"), pre = SA ? SA.preliminar(res) : { preliminar: false, rotulo: "PRELIMINAR — NÃO ATENDE", motivos: [] }, o = op.obra || {}, d = op.documento || {}, Q = res.t3 || {}, I = Q.info || {}, P = Q.params || {}, h = [], secoes = [], avisos = [];
    if (!res || res.tipologia !== "T3" || !res.t3) return { ok: false, motivo: "Resultado sem a T3 (res.t3).", html: "" };
    function H2(t) { secoes.push(t); h.push("<h2>" + esc(t) + "</h2>"); }
    h.push("<!doctype html><html><head><meta charset='utf-8'><title>Memorial de cálculo — telhado de 4 águas</title><style>" + CSS + "</style></head><body>");
    if (pre.preliminar) h.push("<div class='faixa'>" + esc(pre.rotulo) + " — a estrutura NÃO atende em todos os itens; nada deste documento vale para execução.<br>" + arr(pre.motivos).map(esc).join("<br>") + "</div>");
    h.push("<h1>Memorial de cálculo — telhado de 4 águas em MLC (T3)</h1><p>" + esc(o.nome || P.nome || "") + (o.cidade ? " — " + esc(o.cidade) : "") + " · " + esc(d.numero || "EST-MAD-T3-MEM") + " · rev. " + esc(d.revisao || "R00") + " · " + esc(d.data || "") + (res.nomeOpcao ? " · opção " + esc(res.opcao) + ": " + esc(res.nomeOpcao) : "") + "</p><div class='faixa'>" + esc(FAIXA) + "</div>");
    H2("1. Objeto e geometria");
    h.push("<p>Estrutura de madeira laminada colada (MLC) de cobertura em <b>4 águas</b>: planta " + (I.pir ? "quadrada (pirâmide)" : "retangular") + " " + br(I.a) + " × " + br(I.b) + " m, pé-direito " + br(P.peDireito) + " m, inclinação " + br(I.incl * 100, 0) + " %, beiral " + br(I.beiral) + " m nos 4 lados, tesouras " + (I.tesouraTipo === "howe" ? "Howe" : "Pratt") + ", " + (I.xs || []).length + " tesoura(s) principal(is) a cada ≤ " + br(P.tesoura.sTes) + " m, 2 meias-tesouras nas cabeceiras, 4 espigões a 45° em planta" + (I.pir ? "" : ", cumeeira de " + br(I.La) + " m") + ".</p>");
    h.push("<table><tr><th>Elemento</th><th>Papel</th></tr><tr><td>Tesouras principais</td><td>Vencem o vão b = " + br(I.b) + " m e recebem as terças das águas laterais.</td></tr><tr><td>Meias-tesouras (cabeceiras)</td><td>Fazem o papel da cumeeira nas águas de cabeceira: do pilar da parede até a tesoura de extremidade.</td></tr><tr><td>Espigões</td><td>Vigas inclinadas nas arestas salientes (canto → ponta da cumeeira); recebem as pontas das terças das duas águas vizinhas, cortadas em bisel de 45° em planta.</td></tr><tr><td>Frechal em anel</td><td>Viga de respaldo sobre os pilares; a tração do anel é a CINTA que resolve o empuxo horizontal do espigão no canto.</td></tr><tr><td>Rincão</td><td>NÃO se aplica: planta retangular/quadrada não tem aresta reentrante (rincão fica para a planta em L — pendência).</td></tr></table>");
    H2("2. Normas e premissas");
    h.push("<p>NBR 7190-1:2022 (critérios; texto transcrito na biblioteca da RA), NBR 6120:2019 (ações), NBR 6123:2023 (vento), NBR 8681 (combinações), NBR 8800 (chapas e chumbadores). A MLC segue a EN 14080 (classe GL24h; fonte secundária declarada).</p><ul>" + arr(res.avisos).filter(function (a) { return /PREMISSA|não modelad|K_br|C3|T3:/.test(a); }).slice(0, 8).map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>");
    h.push("<div class='faixa'>" + esc(EXIGENCIA) + "</div>");
    H2("3. Ações");
    var cT = res.cargasTotais || {};
    h.push("<table><tr><th>Ação</th><th>Valor</th></tr><tr><td>Peso próprio MLC (γ = " + br(res.memoria && res.memoria.pesoMLC || 5, 1) + " kN/m³) — resultante vertical</td><td>" + br(Math.abs((cT.G1 || [0, 0, 0])[1])) + " kN</td></tr><tr><td>G2 — telha + ripas (" + br(P.telha && P.telha.peso) + " kN/m² inclinado), área " + br(res.orcamento && res.orcamento.area_telhado_m2) + " m²</td><td>" + br(Math.abs((cT.G2 || [0, 0, 0])[1])) + " kN</td></tr><tr><td>Q — sobrecarga de cobertura (NBR 6120, por m² de planta)</td><td>" + br(Math.abs((cT.Q || [0, 0, 0])[1])) + " kN</td></tr><tr><td>Vento — V0</td><td>" + (res.v0 != null ? br(res.v0, 1) + " m/s" : "—") + "</td></tr></table>");
    h.push("<p class='nota'>Vento: a NBR 6123:2023 não traz coeficientes para 4 águas; foi adotado o campo de pressões da Tabela 5 (duas águas) sobre as 4 águas, normal a cada uma, com o beiral a barlavento — PREMISSA DECLARADA a confirmar pelo RT (ou ensaio). Combinações ELU/ELS pela NBR 8681 + 2ª ordem + abertura dominante excepcional; " + res.combinacoes + " combinações ELU.</p>");
    H2("4. Resultados por grupo (NBR 7190-1:2022)");
    var gs = Object.keys(res.secoes || {}).filter(function (g) { return NOME_G[g] && res.grupos[g]; });
    h.push("<table><tr><th>Grupo</th><th>Seção (cm)</th><th>η máx.</th><th>Governa</th></tr>" + gs.map(function (g) { var s = res.secoes[g], e = res.grupos[g]; return "<tr><td>" + esc(NOME_G[g]) + "</td><td>" + r(s.b * 100, 0) + " × " + r(s.h * 100, 0) + "</td><td class='" + (e.eta <= 1 ? "ok" : "nok") + "'>" + br(e.eta, 3) + "</td><td>" + esc(e.governa || "") + "</td></tr>"; }).join("") + "</table>");
    H2("5. Espigões, cinta do canto e meia-tesoura");
    var E = res.espigao || {}, C = res.cinta || {}, ME = res.meia || {};
    h.push("<p>Comprimento de flambagem do espigão: L0 = " + (res.compressaoE ? br(res.compressaoE.L0y) + " m (canto → ponta da cumeeira, sem crédito das terças)" : "—") + "; λ máx. = " + (res.compressaoE ? br(res.compressaoE.lambdaMax, 1) + " (limite 140)" : "—") + ". Flexão OBLÍQUA com compressão: My e Mz do pórtico 3D, interação 7190-1. Momento de projeto: o MAIOR entre a envolvente dos modelos (a)/(b) e a viga bi-apoiada canto–ápice com as forças verticais reais das terças" + (res.espigaoViga ? " (viga " + br(res.espigaoViga.M) + " kN·m × modelo " + br(res.espigaoViga.Mmodelo) + " kN·m na pior combinação)" : "") + ".</p><table><tr><th>Esforço de extremidade do espigão (ELU, kN)</th><th>N</th><th>Cortante</th><th>H (empuxo)</th><th>V</th></tr><tr><td>Canto</td><td>" + br(E.heel && E.heel.N) + "</td><td>" + br(E.heel && E.heel.S) + "</td><td>" + br(E.heel && E.heel.H) + "</td><td>" + br(E.heel && E.heel.V) + "</td></tr><tr><td>Ponta da cumeeira</td><td>" + br(E.apice && E.apice.N) + "</td><td>" + br(E.apice && E.apice.S) + "</td><td>" + br(E.apice && E.apice.H) + "</td><td>" + br(E.apice && E.apice.V) + "</td></tr></table><p>Tração máxima do anel de frechal: " + br(C.N) + " kN; força de EXTREMIDADE do frechal no canto (a que a cinta transmite): " + br(C.fim && C.fim.N) + " kN. Reação da meia-tesoura na tesoura de extremidade: N = " + br(ME.N) + " kN, V = " + br(ME.V) + " kN.</p>");
    var PM = res.porModelo || {}, sT = res.slipT;
    h.push("<p><b>Espigão como arco com tirante — envolvente de 2 modelos.</b> O espigão, a ligação espigão × cumeeira e a tesoura de extremidade são dimensionados pela envolvente de (a) terças com rigidez axial cheia e (b) estribo da terça no espigão com deslizamento dos pinos (NBR 7190-1:2022, 7.1.12; Ku = 2/3·Kser)" + (sT ? ": " + sT.n + " pinos Ø" + Math.round(sT.d * 1000) + " por ponta, Ku = " + Math.round(sT.Ku) + " kN/m por pino" : "") + ". η do espigão: modelo (a) " + (PM.a && PM.a.E ? br(PM.a.E.eta, 3) : "—") + " · modelo (b) " + (PM.b && PM.b.E ? br(PM.b.E.eta, 3) : "—") + ".</p>");
    H2("6. Ligações");
    var Lg = (res.ligacoesT3 && res.ligacoesT3.ligacoes) || {};
    h.push("<table><tr><th>Ligação</th><th>Pinos (n × Ø)</th><th>η</th></tr>" + Object.keys(Lg).map(function (k) { var l = Lg[k]; return "<tr><td>" + esc(k) + "</td><td>" + (l.pinos && l.pinos.n ? l.pinos.n + " × Ø" + Math.round((l.pinos.d || 0) * 1000) : (l.porApoio ? l.porApoio + " parafusos WT" : "—")) + "</td><td class='" + (l.eta <= 1 ? "ok" : "nok") + "'>" + br(l.eta, 3) + "</td></tr>"; }).join("") + "</table>");
    h.push("<p class='nota'>Sela do espigão no canto: momento N·δ (δ = h_FR/2) no grupo de pinos (momento polar); cinta pela força de extremidade do frechal, chapa verificada pela seção bruta, líquida (fu/γa2, γa2 = 1,35) e esmagamento dos furos (NBR 8800); torção nas pontas do frechal (7190-1) no laço de crescimento do FR; ponta da MI no nó central do BI com a força real de extremidade e o montante do mesmo nó. Vento local de aresta (cpe −1,2 em faixa de " + br(res.ligacoesT3 && res.ligacoesT3.ventoLocal ? res.ligacoesT3.ventoLocal.wf_m : 0, 2) + " m ao longo do espigão; EN 1991-1-4, Tab. 7.5 — fonte SECUNDÁRIA, a confirmar pelo RT) nas ligações terça × espigão, sela e arrancamento das terças. Vento: adicionado à envolvente o caso de cpe +0,2 na água de cabeceira a barlavento (vento paralelo à cumeeira).</p><h3>Folga construtiva (encontros)</h3><p>As pontas da peça comprimida (diagonal Howe, espigão na cumeeira, frechal e terça junto ao espigão) são aparadas com folga ≥ 10 mm das faces vizinhas; a carga passa SÓ pelas chapas internas e pinos (sem contato madeira–madeira). Folga mínima medida: <b>" + br(res.aparo && res.aparo.resumo ? res.aparo.resumo.minimo_mm : 0, 1) + " mm</b> em " + (res.aparo && res.aparo.resumo ? res.aparo.resumo.n : 0) + " pontas.</p>");
    H2("7. Verificações de serviço e contraventamento");
    var fl = res.flechas || {};
    h.push("<table><tr><th>Grupo</th><th>η flecha (L/" + (res.memoria && res.memoria.limVao || 300) + ")</th></tr>" + Object.keys(fl).map(function (g) { return "<tr><td>" + esc(NOME_G[g] || g) + "</td><td>" + br(fl[g], 3) + "</td></tr>"; }).join("") + "</table><p>" + (res.contrav ? "Rigidez K_br,1 (6.6.2): banzo superior " + Math.round(res.contrav.BS.Kbr) + " × " + Math.round(res.contrav.BS.Kmin) + " kN/m; banzo inferior " + Math.round(res.contrav.BI.Kbr) + " × " + Math.round(res.contrav.BI.Kmin) + " kN/m — " + (res.contrav.ok ? "atende" : "NÃO atende") + "." : "") + "</p>");
    H2("8. Orçamento (resumo)");
    var O = res.orcamento || {}; h.push("<p>Custo direto R$ " + br(O.custo_direto, 2) + " · preço com BDI " + br((O.bdi || 0) * 100, 2) + " % = R$ " + br(O.preco, 2) + " · MLC " + br(O.volumes && O.volumes.mlc, 3) + " m³ · pinos (todos os grupos de cada nó): " + (O.pinos ? O.pinos.total + O.pinos.base : 0) + " un.</p>");
    H2("9. Pendências e não modelado");
    h.push("<ul><li>" + esc(EXIGENCIA) + "</li><li>Torção por excentricidade do vento (6.6) e vento oblíquo: não modelados.</li><li>Caibros e ripas secundários: não modelados (dentro do preço da telha).</li><li>Rincão (planta em L): fora desta entrega.</li><li>Vento em 4 águas: premissa da Tabela 5 (duas águas) — confirmar com o RT. O caso extra de cpe +0,2 na cabeceira a barlavento e o cpe local −1,2 nas arestas (EN 1991-1-4, Tab. 7.5 — fonte SECUNDÁRIA) são premissas a confirmar pelo RT.</li><li>Detalhe da chapa cruzada na ponta da MI sobre o BI (MI no plano X, BI no plano Z) e da sela do canto: do fabricante/RT.</li><li>Valores da NBR 7190-1:2022 conferidos na transcrição da biblioteca; MLC pela EN 14080 (fonte secundária).</li></ul>" + (arr(res.auditoria && res.auditoria.achados).length ? "<h3>Achados do auditor</h3><ul>" + res.auditoria.achados.map(function (a) { return "<li class='nok'>" + esc(a.mensagem) + "</li>"; }).join("") + "</ul>" : "<p class='ok'>Auditor: nenhum achado.</p>"));
    h.push("<p class='nota'>" + esc(FAIXA) + "</p></body></html>");
    return { ok: true, html: h.join(""), titulo: "Memorial de cálculo — telhado de 4 águas", secoes: secoes, avisos: avisos, situacao: pre };
  }
  function manual(res, op) {
    pronto(); op = op || {}; if (!res || res.tipologia !== "T3" || !res.t3) return { ok: false, html: "", avisos: ["Resultado sem a T3."], paginas: 0 };
    var SA = dep("MadEngSaidas", "./madengsaidas.js"), pre = SA ? SA.preliminar(res) : { preliminar: false, rotulo: "PRELIMINAR — NÃO ATENDE" }, I = res.t3.info, mem = res.t3.membros, f = res.fonte.pecas, h = [], n = 0;
    function cont(g) { return mem.filter(function (m) { return m.g === g; }).length; }
    var etapas = [["Pilares e frechal em anel", "Montar os " + (cont("P") + cont("PO")) + " pilares sobre as bases engastadas; assentar o frechal em anel (4 lados) com garfo no topo de cada pilar. Os dois frechais de cada canto ficam a ≥ 10 mm do espigão: o anel fecha pela CINTA de aço (chapa interna + pinos) em cada canto."],
      ["Tesouras principais", "Pré-montar no chão as " + cont("BI") + " tesoura(s) " + (I.tesouraTipo === "howe" ? "Howe" : "Pratt") + " com chapa interna e pinos inox; içar e apoiar em garfo nos pilares; travar com as linhas do banzo inferior e as diagonais de contraventamento dos vãos de extremidade."],
      ["Meias-tesouras das cabeceiras", "Montar as " + cont("MI") + " meias-tesouras (banzo inferior = tirante, do pilar da parede à tesoura de extremidade); a ponta do banzo superior entra na tesoura de extremidade com folga de 10 mm das faces, ligada só por chapa e pinos."],
      ["Cumeeira e espigões", (I.pir ? "Pirâmide: sem cumeeira." : "Instalar a cumeeira (" + (I.La != null ? I.La.toFixed(2).replace(".", ",") : "—") + " m) sobre as tesouras. ") + "Instalar os 4 espigões do canto à ponta da cumeeira: sela de aço sobre o frechal no canto e chapa interna + pinos na ponta (folga ≥ 10 mm)."],
      ["Terças", "Instalar as terças das 4 águas nas mesmas linhas; as pontas junto ao espigão têm bisel de 45° em planta e assentam em estribo de aço (chapa interna + pinos), com folga ≥ 10 mm da madeira do espigão; fixar sobre as tesouras com parafusos de rosca total a 45°."],
      ["Contraventamento e conferência", "Instalar as diagonais de madeira em X (águas dos vãos de extremidade, planos verticais entre tesouras e painéis das paredes). Conferir: nenhuma peça sem folga na ponta aparada; torque dos pinos; cinta dos 4 cantos."]];
    h.push("<!doctype html><html><head><meta charset='utf-8'><title>Manual de montagem — telhado de 4 águas</title><style>" + CSS + "@page{size:A3 landscape;margin:12mm}.pg{page-break-after:always;min-height:240mm}</style></head><body>");
    h.push("<div class='pg'><h1>Manual de montagem — telhado de 4 águas</h1><div class='faixa'>" + esc(EXIGENCIA) + "</div>" + (pre.preliminar ? "<div class='faixa'>" + esc(pre.rotulo) + "</div>" : "") + "<p>" + esc((op.obra && op.obra.nome) || "") + " — " + f.length + " marcas de peça; " + mem.length + " peças individuais.</p><div class='faixa'>" + esc(FAIXA) + "</div><table><tr><th>Etapa</th><th>O que se monta</th></tr>" + etapas.map(function (e, i) { return "<tr><td>" + (i + 1) + ". " + esc(e[0]) + "</td><td>" + esc(e[1]) + "</td></tr>"; }).join("") + "</table></div>"); n++;
    etapas.forEach(function (e, i) { h.push("<div class='pg'><h2>Etapa " + (i + 1) + " — " + esc(e[0]) + "</h2><p>" + esc(e[1]) + "</p><table><tr><th>Marca</th><th>Descrição</th><th>Seção</th><th>Qtd.</th></tr>" + f.filter(function (p) { return p.marca; }).slice(0, 80).filter(function (p) { var g = p.marca; return (i === 0 && /^(P|PO|FR)$/.test(g)) || (i === 1 && /^(BI|BS|PD|DG|LB)$/.test(g)) || (i === 2 && /^(MI|MS|MP|MG)$/.test(g)) || (i === 3 && /^(CM|E)$/.test(g)) || (i === 4 && g === "T") || (i === 5 && /^(DX|DV|DP)$/.test(g)); }).map(function (p) { return "<tr><td>" + esc(p.id) + "</td><td>" + esc(p.descricao) + "</td><td>" + esc(p.especificacao) + "</td><td>" + p.qtd + "</td></tr>"; }).join("") + "</table></div>"); n++; });
    h.push("</body></html>");
    return { ok: true, html: h.join(""), paginas: n, etapas: etapas.length, avisos: [] };
  }
  function ifc(res, opts) { var SA = dep("MadEngSaidas", "./madengsaidas.js"); return SA.gerarIfc(pecasMembros(res), { projeto: (opts && opts.projeto) || "Telhado de 4 águas", opcao: res.opcao, semente: (opts && opts.semente) || "t3:" + res.opcao, agora: opts && opts.agora }); }
  function dae(res, opts) { var EX = dep("MadEngExport", "./madengexport.js"); return EX.gerarDae(pecasMembros(res), { projeto: (opts && opts.projeto) || "Telhado de 4 águas" }); }

  var MadT3Saidas = { EXIGENCIA: EXIGENCIA, pecasMembros: pecasMembros, orcar: orcarT3, rodar: rodar, memorial: memorial, manual: manual, ifc: ifc, dae: dae, FAIXA: FAIXA, gruposDe: gruposDe };
  if (typeof module !== "undefined" && module.exports) module.exports = MadT3Saidas;
  else global.MadT3Saidas = MadT3Saidas;
})(typeof window !== "undefined" ? window : this);
