/* =====================================================================
 * madt4saidas.js — T4 (telhado sextavado/oitavado): rodar no worker (projeto completo + orçamento), ORÇAMENTO (conta TODOS os grupos de pinos de cada nó PELA GEOMETRIA: nó × barras, uma chapa por nó),
 * peças POR MEMBRO (IFC/SketchUp), MEMORIAL e MANUAL DE MONTAGEM. Motor PURO, ES5, Node-testável. Arquivo novo: não altera madorcamento/madengsaidas/madengt2doc.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } } return null; }
  var T4 = null, T3S = null, br = function (x, n) { return (n == null ? Number(x || 0).toFixed(2) : Number(x || 0).toFixed(n)).replace(".", ","); }, copia = function (x) { return JSON.parse(JSON.stringify(x)); }, norm = function (a, b) { return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2)); };
  function pronto() { if (!T4) { T4 = dep("MadT4", "./madt4.js"); T3S = dep("MadT3Saidas", "./madt3saidas.js"); } return T4; }      /* carga preguiçosa: na página este arquivo carrega ANTES dos motores do worker */
  function arr(v) { return Array.isArray(v) ? v : []; }
  function r(x, n) { var p = Math.pow(10, n); return Math.round(x * p + (x >= 0 ? 1e-9 : -1e-9)) / p; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  var EXIGENCIA = "Exigência de projeto: terças contínuas sobre o caibro de meio de água, ou emenda rígida; emenda articulada sobre o caibro não é permitida sem novo cálculo. A telha apoia nas terças; caibros secundários e ripas não estão no modelo. O cubo do ápice (tubo + chapas radiais) é peça de oficina: solda e detalhe do fabricante/RT.";
  var FAIXA = "Documento gerado pelo sistema — emissão somente após conferência e ART do responsável técnico";
  var NOME_G = { P: "Pilares do perímetro", PC: "Pilar central", FR: "Frechal em anel", E: "Espigões", T: "Terças", CB: "Caibros de meio de água", DX: "Diagonais de contraventamento (águas)", DP: "Diagonais de contraventamento (paredes)" };

  /* ---------------------------------------------------------------- peças POR MEMBRO (posição real; aparadas) */
  function pecasMembros(res) {
    pronto(); var out = [], fonte = arr(res && res.fonte && res.fonte.pecas), mat = (fonte.filter(function (x) { return /MLC/.test(x.material || ""); })[0] || {}).material || "MLC GL24h (EN 14080)";
    if (!res || !res.t4) return out;
    arr(res.t4.membros).forEach(function (m) {
      var s = res.secoes && res.secoes[m.g]; if (!NOME_G[m.g] || !s || !s.b || !s.h) return;
      var L = norm(m.p0, m.p1), up = T4.upDe(m); out.push({ id: m.id, g: m.g, marca: m.g, grupo: "T4 — " + NOME_G[m.g], descricao: NOME_G[m.g], material: mat, especificacao: "MLC " + r(s.b * 100, 0) + "×" + r(s.h * 100, 0) + " cm", secao: { tipo: "ret", b: s.b, h: s.h }, p0: m.p0, p1: m.p1, up: up, qtd: 1, comprimento_m: L, volume_m3: s.b * s.h * L, unidade: "peça", agua: m.agua, bisel: m.bisel });
    });
    return out;
  }

  /* ---------------------------------------------------------------- MULTIPLICIDADE pela GEOMETRIA (nó × barras) */
  /** índice de nós por posição (extremidades e nós de apoio de cada membro); cada ligação = pontas de barra que chegam a um nó com a peça hospedeira. Cada conexão chapa-a-chapa tem um grupo de pinos em cada peça de madeira: nas hospedeiras de aço (cubo) só o da peça. */
  function multGeo(M4, I) {
    var mp = {}; function key(P) { return Math.round(P[0] * 1000) + "," + Math.round(P[1] * 1000) + "," + Math.round(P[2] * 1000); }
    function add(P, m) { var k = key(P); (mp[k] = mp[k] || []).push(m); }
    M4.forEach(function (m) { add(m.eixo0 || m.p0, m); add(m.eixo1 || m.p1, m); (m.nos || []).forEach(function (P) { add(P, m); }); });
    function hosp(P, m, gs) { return (mp[key(P)] || []).filter(function (o) { return o !== m && gs.indexOf(o.g) >= 0; }).length > 0; }
    function fins(m) { return [m.eixo0 || m.p0, m.eixo1 || m.p1]; }
    function pontas(gs, hs) { var n = 0; M4.forEach(function (m) { if (gs.indexOf(m.g) < 0) return; fins(m).forEach(function (P) { if (hosp(P, m, hs)) n++; }); }); return n; }
    var apice = [I.cx, I.cz, I.Hap], nApE = 0, nApCB = 0, canto = 0, cantosFR = {}, nCruz = 0, nPC = 0, ptsHub = 0;
    M4.forEach(function (m) { var e1 = m.eixo1 || m.p1; if (Math.abs(e1[0] - apice[0]) < 1e-3 && Math.abs(e1[1] - apice[1]) < 1e-3 && Math.abs(e1[2] - apice[2]) < 1e-3) { if (m.g === "E") nApE++; else if (m.g === "CB") nApCB++; else if (m.g === "PC") nPC++; } });
    M4.forEach(function (m) { if (m.g === "E") (m.nos || []).forEach(function (P) { if (hosp(P, m, ["FR"])) canto++; }); if (m.g === "FR") fins(m).forEach(function (P) { var k = key(P); cantosFR[k] = (cantosFR[k] || 0) + 1; }); if (m.g === "T" && (m.nos || []).length) nCruz += m.nos.length; });
    var corners = Object.keys(cantosFR).filter(function (k) { return cantosFR[k] >= 2; }).length, pesCB = 0; M4.forEach(function (m) { if (m.g === "CB" && m.pe && hosp(m.pe, m, ["FR", "P"])) pesCB++; });
    return { espigaoApice: nApE, caibroApice: nApCB, pilarCentralTopo: nPC, espigaoCanto: 2 * canto, cintaCanto: 2 * corners, tercaEspigaoAxial: 2 * pontas(["T"], ["E"]), caibroPe: 2 * pesCB, tercaEspigao: pontas(["T"], ["E"]) / 2, tercaCaibro: nCruz, contravDiagonal: 2 * pontas(["DX"], ["E"]), contravParede: 2 * pontas(["DP"], ["P", "FR"]), cuboApice: 1 };
  }

  /** soma, de uma ligação, os pinos de TODOS os grupos (o da peça e, se houver, os do banzo) */
  function gruposDe(l) { return T3S ? T3S.gruposDe(l) : []; }

  /* ---------------------------------------------------------------- ORÇAMENTO */
  function orcarT4(e) {
    pronto(); e = e || {};
    var MO = dep("MadOrcamento", "./madorcamento.js"), pc = e.pecas || [], X = e.extras || {}, sub = e.precos || {}, bdi = e.bdi == null ? MO.BDI_PADRAO : e.bdi, P = e.params || {}, LB = e.ligacoes || {}, L4 = (e.ligacoesT4 && e.ligacoesT4.ligacoes) || {}, M4 = (e.membros || []), I = e.info || {};
    var inc = P.incl || 0.3, sc = Math.sqrt(1 + inc * inc), be = P.beiral || 0, preco = MO.preco, n = P.n || I.n || 6, ap = I.apotema || (P.R * Math.cos(Math.PI / n)), tgb = Math.tan(Math.PI / n);
    var vMlc = 0, aVerniz = 0; pc.forEach(function (p) { if (/MLC/.test(String(p.material || "")) && p.volume_m3) { vMlc += p.volume_m3; aVerniz += MO.areaFaces(p); } });
    function nm(g) { return M4.filter(function (m) { return m.g === g; }).length; }
    var nPil = nm("P") + nm("PC"), pb = LB.placaBase || { dimensoes_mm: [0, 0], chumbadores: { total: 0 } }, lp = pb.dimensoes_mm[0] / 1000, tpb = (pb.espessura_mm || 25) / 1000, base = LB.base || { n: 0, comprimento: 0, chapa: { largura_mm: 0 } };
    var kgBase = nPil * (lp * lp * tpb * 7850 + 2 * ((base.chapa && base.chapa.largura_mm) || 0) / 1000 * ((base.comprimento || 0) + 0.10) * 0.016 * 7850), nChumb = nPil * ((pb.chumbadores && pb.chumbadores.total) || 0);
    var mult = multGeo(M4, I), nPinos = 0, kgChapa = 0, nWT = 0, porLig = {}, CUBO = T4.CUBO;
    Object.keys(L4).forEach(function (k) {
      var l = L4[k], m = mult[k] || 0, gs = gruposDe(l), nn = 0, comp = 0.2, larg = Math.max(0.03, l.chapa ? l.chapa.largura_mm / 1000 : 0.1);
      gs.forEach(function (g) { nn += g.n; comp = Math.max(comp, (g.pn && g.pn.comprimento) || 0.2); if (g.pn && g.pn.nc > 1 && g.pn.centroGrupo) larg = Math.max(larg, 2 * g.pn.centroGrupo.a + 4 * g.pn.d); });
      nPinos += m * nn; if (k !== "cuboApice") kgChapa += m * 0.008 * larg * (comp + 0.05) * 7850; porLig[k] = { mult: m, grupos: gs.map(function (g) { return { nome: g.nome, n: g.n }; }), pinosPorInstancia: nn, total: m * nn };
    });
    if (L4.tercaEspigao) nWT += (mult.tercaEspigao || 0) * 2 * L4.tercaEspigao.porApoio;
    if (L4.tercaCaibro) nWT += (mult.tercaCaibro || 0) * L4.tercaCaibro.porApoio;
    var nRad = nm("E") + nm("CB"), larE = L4.espigaoApice && L4.espigaoApice.chapa ? L4.espigaoApice.chapa.largura_mm / 1000 : 0.15, compE = L4.espigaoApice && L4.espigaoApice.pinos ? (L4.espigaoApice.pinos.comprimento || 0.2) : 0.2, aparo = (e.aparo && e.aparo.cubo) ? 0.1 : 0.1;
    var kgCubo = (CUBO.desce + CUBO.sobe) * CUBO.kgm + nRad * 0.008 * larE * (compE + 0.20) * 7850 + 0.15 * 0.15 * 0.012 * 7850, mE = 0, mCB = 0; M4.forEach(function (m) { if (m.g === "E") mE += norm(m.eixo0 || m.p0, m.eixo1 || m.p1); if (m.g === "CB") mCB += norm(m.eixo0 || m.p0, m.eixo1 || m.p1); });
    var aInc = n * Math.pow(ap + be, 2) * tgb * sc, per = n * 2 * (ap + be) * tgb, perPl = n * (P.lado || 2 * P.R * Math.sin(Math.PI / n));
    var prazo = (X.prazoSemanas != null ? Number(X.prazoSemanas) : 5), hEnc = X.horasEncarregado != null ? Number(X.horasEncarregado) : prazo * 44, hEng = X.horasEngenheiro != null ? Number(X.horasEngenheiro) : Math.round(0.2 * prazo * 44), areaAnd = X.areaAndaime != null ? Number(X.areaAndaime) : r(perPl * (X.alturaAndaime || 4.5), 0), mesesAnd = X.mesesAndaime != null ? Number(X.mesesAndaime) : 2;
    var itens = [], etapa;
    function L(cod, desc, q, chave, obs) { var pr = preco(chave, sub), qq = r(q, 3); itens.push({ etapa: etapa, codigo: cod, descricao: desc, un: pr.un, qtd: qq, pu: pr.pu, total: r(qq * pr.pu, 2), fonte: pr.fonte, chave: chave, adotado: pr.adotado, editado: pr.editado, obs: obs || "" }); }
    etapa = "01 ESTRUTURA DE MADEIRA (MLC)";
    L("01.01", "Fornecimento de MLC GL24h aplainada — pilares, frechal em anel, espigões, terças" + (nm("CB") ? ", caibros de meio" : "") + (nm("PC") ? " e pilar central" : ""), vMlc, "mlc");
    L("01.02", "Frete da madeira até a obra", vMlc, "frete"); L("01.03", "Montagem da estrutura", vMlc, "montagem");
    L("01.04", "Caminhão guindauto para içamento (" + (X.diariasMunck != null ? X.diariasMunck : 2) + " diárias de 8 h)", X.horasMunck != null ? Number(X.horasMunck) : (X.diariasMunck != null ? Number(X.diariasMunck) : 2) * 8, "munck_h");
    L("01.05", "Proteção da madeira aparente: stain/verniz marítimo 3 demãos", aVerniz, "verniz");
    etapa = "02 LIGAÇÕES E FERRAGENS";
    L("02.01", "Peças de aço galvanizado a fogo — bases engastadas dos pilares (placa + chapas em cruz); as selas e cintas do canto entram pelas chapas dimensionadas de cada ligação (02.04)", kgBase, "aco_galv");
    L("02.02", "Chumbadores M20 inox A4-70 com ancoragem química", nChumb, "chumb20");
    L("02.03", "Pinos inox dos nós (TODOS os grupos de pinos de cada nó, contados pela geometria: cubo do ápice, sela e cinta do canto, estribos das terças, caibros, contraventamento); os de Ø10 e Ø12 orçados ao preço do Ø16", nPinos + nPil * (2 * (base.n || 0)), "pino16");
    L("02.04", "Chapas internas de aço inox 8 mm dos nós (inclui selas, cintas do canto e estribos, pela chapa dimensionada de cada ligação)", kgChapa, "inox_kg");
    L("02.05", "Cubo de aço do ápice: tubo Ø114,3×6,3 (" + br(CUBO.desce + CUBO.sobe) + " m) + " + nRad + " chapas radiais t = 8 mm + chapa de topo 150×150×12, galvanizado a fogo", kgCubo, "aco_galv");
    L("02.06", "Parafusos SFS WT-T 8,2×300 (terça × espigão" + (nm("CB") ? ", terça × caibro" : "") + ")", nWT, "wt300");
    etapa = "03 COBERTURA";
    L("03.01", "Telha cerâmica sobre ripas, fornecida e instalada (área inclinada das " + n + " águas)", aInc, "telha_cer");
    L("03.02", "Rufos dos espigões (" + n + " espigões " + br(mE) + " m) e do ápice", mE, "rufo");
    L("03.03", "Calhas dos beirais (" + n + " lados)", per, "calha"); L("03.04", "Condutores pluviais", X.condutoresM != null ? Number(X.condutoresM) : 12, "condutor");
    etapa = "04 SERVIÇOS GERAIS E ADMINISTRAÇÃO LOCAL";
    L("04.01", "Andaime (" + mesesAnd + " meses)", areaAnd * mesesAnd, "andaime_m2mes"); L("04.02", "Montagem e desmontagem do andaime", areaAnd, "andaime_mont");
    L("04.03", "Encarregado de carpintaria (" + prazo + " semanas)", hEnc, "encarregado_h"); L("04.04", "Acompanhamento técnico do engenheiro (20 % do prazo)", hEng, "engenheiro_h");
    L("04.05", "Mobilização, desmobilização e canteiro", 1, "mobilizacao"); L("04.06", "ART de execução", 1, "art");
    var cd = r(itens.reduce(function (s, x) { return s + x.total; }, 0), 2), etapas = {}; itens.forEach(function (x) { etapas[x.etapa] = r((etapas[x.etapa] || 0) + x.total, 2); });
    return { opcao: e.opcao || "T4", nome: e.nome || "", itens: itens, etapas: etapas, custo_direto: cd, bdi: bdi, preco: r(cd * (1 + bdi), 2), volumes: { mlc: r(vMlc, 3) }, area_verniz: r(aVerniz, 1), area_telhado_m2: r(aInc, 2), pinos: { total: nPinos, porLigacao: porLig, base: nPil * (2 * (base.n || 0)) }, kgChapa: r(kgChapa, 1), kgCubo: r(kgCubo, 1), nWT: nWT, multiplicidade: mult,
      adotados: itens.filter(function (x) { return x.adotado; }).length,
      pendencias: ["Preço da telha cerâmica = o da telha PIR do banco (o mais alto; sem referência cerâmica publicada nesta base) — substituir pelo da obra.", "Ripas, caibrinhos e rufos cerâmicos dentro do preço da telha; caibros secundários não modelados.", "Cubo do ápice: peso estimado do tubo + chapas radiais; orçar com o fabricante (solda e galvanização).", "Fundação e vedações fora do escopo da madeira."] };
  }

  /* ---------------------------------------------------------------- RODAR (worker) */
  function rodar(sol, proj, avisa, t0, MO) {
    pronto();
    var Lg = dep("MadT4Lig", "./madt4lig.js"), itAtual = 0;
    avisa("dimensionar", { it: 0 });
    var out = Lg.projetar(proj, sol.partida, { voltasBase: 2, aoIterar: function (it, sec, pior) { itAtual = it + 1; avisa("dimensionar", { it: itAtual, pior: pior, sec: sec }); } });
    avisa("auditoria");
    var rr = out.resultado, q = proj._pad4 || {};
    avisa("orcamento");
    var orc = orcarT4({ opcao: sol.opcao, nome: sol.nomeOpcao, pecas: out.fonte.pecas, params: q.params, secoes: out.secoes, ligacoes: out.ligacoes, ligacoesT4: out.ligacoesT4, membros: out.t4.membros, info: out.t4.info, aparo: out.aparo, extras: sol.extras, precos: sol.precos, bdi: sol.bdi });
    var vento = q._vento || proj._vento || {}, avisos = (rr.avisos || []).slice();
    var ligs = copia(out.ligacoes); ligs.verificacoes = (ligs.verificacoes || []).concat(out.ligacoesT4.verificacoes.map(function (v) { return { nome: "T4 · " + v.nome, eta: v.eta, ok: v.ok }; })); if (out.ligacoesT4.ok === false) ligs.ok = false;
    var res = {
      ok: !out.semSolucao && (!ligs || ligs.ok !== false) && out.ligacoesT4.ok !== false && !(out.auditoria && out.auditoria.achados.length), semSolucao: !!out.semSolucao, tipologia: "T4", sistema: "poligonal",
      opcao: sol.opcao, nomeOpcao: sol.nomeOpcao, secoes: out.secoes, iteracoes: out.historico.length, pior: out.pior, grupos: rr.grupos, flechas: rr.flechas, flechasMm: rr.flechasMm || null, reacoes: rr.reacoes,
      combinacoes: rr.combinacoes, avisos: avisos, avisosAnalise: rr.avisosAnalise || [], v0: vento.v0 != null ? vento.v0 : (vento.entrada && vento.entrada.v0) || null, cargasTotais: rr.cargasTotais || null, QCOB: rr.QCOB || null,
      ligacoes: ligs, ligacoesT4: out.ligacoesT4, ligacoesT2: out.ligacoesT4, rigidezBase: out.rigidezBase, fonte: out.fonte, auditoria: out.auditoria || { achados: [], porRegra: {}, ok: true }, orcamento: orc, t7: null, t4: out.t4, aparo: out.aparo,
      espigao: rr.espigao, espigaoViga: rr.espigaoViga || null, semCinta: out.semCinta || null, detalheSela: rr.detalheSela, cubo: rr.cubo || null, slipC: rr.slipC || null, cinta: rr.cinta, caibro: rr.caibro, pilarCentral: rr.pilarCentral, topo: rr.topo, creditoTopo: rr.creditoTopo, porModelo: rr.porModelo || null, modelos: rr.modelos, slipT: rr.slipT || null, torcaoFR: rr.torcaoFR || null, esf: rr.esf, compressaoE: rr.compressaoE || null, ms: Date.now() - t0 };
    res.memoria = { vento: vento.ok ? { memoria: vento.memoria, avisos: vento.avisos, v0: vento.v0, s1: vento.s1, s2: vento.s2, s3: vento.s3, vk: vento.vk, q: vento.q, cpi: vento.cpi, excentricidade: vento.excentricidade, casos: (vento.casos || []).map(function (c) { return { id: c.id, nome: c.nome, direcao: c.direcao, cpi: c.cpi, cpiMotivo: c.cpiMotivo, q: c.q }; }), geometria: vento.geometria, norma: vento.norma, edicao: vento.edicao } : null,
      cargas: { telha: q.params && q.params.telha && q.params.telha.peso }, pesoMLC: q.pesoMLC, classe: q.classe, umidade: q.umidade, limVao: q.limVao, limBalanco: q.limBalanco, vento_entrada: proj.vento ? { local: proj.vento.local, s1: proj.vento.s1, categoria: proj.vento.categoria, grupoS3: proj.vento.grupoS3 } : null };
    return res;
  }

  /* ---------------------------------------------------------------- MEMORIAL e MANUAL (HTML) */
  var CSS = "body{font:11pt/1.45 'Segoe UI',Arial,sans-serif;color:#222;margin:24mm 20mm}h1{font-size:19pt;margin:0 0 4px}h2{font-size:13pt;border-bottom:2px solid #1f4e79;color:#1f4e79;margin-top:22px}table{border-collapse:collapse;width:100%;margin:8px 0;font-size:10pt}th,td{border:1px solid #999;padding:3px 6px;text-align:left}th{background:#e8eef5}.ok{color:#0a6b2d}.nok{color:#b00020;font-weight:700}.faixa{border:2px solid #b00020;color:#b00020;padding:6px 10px;margin:10px 0;font-weight:700}.nota{font-size:9.5pt;color:#555}@page{size:A4;margin:12mm}";
  function memorial(res, op) {
    pronto(); op = op || {}; var SA = dep("MadEngSaidas", "./madengsaidas.js"), pre = SA ? SA.preliminar(res) : { preliminar: false, rotulo: "PRELIMINAR — NÃO ATENDE", motivos: [] }, o = op.obra || {}, d = op.documento || {}, Q = res.t4 || {}, I = Q.info || {}, P = Q.params || {}, h = [], secoes = [], avisos = [];
    if (!res || res.tipologia !== "T4" || !res.t4) return { ok: false, motivo: "Resultado sem a T4 (res.t4).", html: "" };
    function H2(t) { secoes.push(t); h.push("<h2>" + esc(t) + "</h2>"); }
    var nome = I.n === 8 ? "oitavado" : "sextavado";
    h.push("<!doctype html><html><head><meta charset='utf-8'><title>Memorial de cálculo — telhado " + nome + "</title><style>" + CSS + "</style></head><body>");
    if (pre.preliminar) h.push("<div class='faixa'>" + esc(pre.rotulo) + " — a estrutura NÃO atende em todos os itens; nada deste documento vale para execução.<br>" + arr(pre.motivos).map(esc).join("<br>") + "</div>");
    h.push("<h1>Memorial de cálculo — telhado " + nome + " em MLC (T4)</h1><p>" + esc(o.nome || P.nome || "") + (o.cidade ? " — " + esc(o.cidade) : "") + " · " + esc(d.numero || "EST-MAD-T4-MEM") + " · rev. " + esc(d.revisao || "R00") + " · " + esc(d.data || "") + (res.nomeOpcao ? " · opção " + esc(res.opcao) + ": " + esc(res.nomeOpcao) : "") + "</p><div class='faixa'>" + esc(FAIXA) + "</div>");
    H2("1. Objeto e geometria");
    h.push("<p>Estrutura de madeira laminada colada (MLC) de cobertura em <b>" + I.n + " águas</b> sobre planta " + (I.n === 8 ? "octogonal" : "hexagonal") + " regular: raio " + br(I.R) + " m (lado " + br(I.lado) + " m, apótema " + br(I.apotema) + " m), pé-direito " + br(P.peDireito) + " m, inclinação " + br(I.incl * 100, 0) + " %, beiral " + br(I.beiral) + " m, ápice a " + br(I.Hap) + " m; " + I.n + " espigões radiais" + (I.caibro ? ", " + I.n + " caibros de meio de água" : "") + (I.pilarCentral ? ", pilar central" : ", sem pilar central") + ".</p>");
    h.push("<table><tr><th>Elemento</th><th>Papel</th></tr><tr><td>Espigões (" + I.n + ")</td><td>Vigas inclinadas do canto ao ápice; recebem as pontas das terças das duas águas vizinhas e concorrem no cubo central.</td></tr><tr><td>Cubo do ápice</td><td>Nó de " + (I.n + (I.caibro ? I.n : 0)) + " barras: tubo de aço central com chapas radiais soldadas, cada barra com a sua chapa em fenda e folga ≥ 10 mm das vizinhas (decisão e justificativa em T4-REFERENCIA.md §3).</td></tr><tr><td>Terças</td><td>Anéis poligonais por água, de espigão a espigão" + (I.caibro ? ", contínuas sobre o caibro de meio" : "") + ".</td></tr><tr><td>Frechal em anel</td><td>Viga de respaldo sobre os pilares; a tração do anel é a CINTA que resolve o empuxo horizontal do espigão no canto.</td></tr></table>");
    H2("2. Normas e premissas");
    h.push("<p>NBR 7190-1:2022 (critérios; texto transcrito na biblioteca da RA), NBR 6120:2019 (ações), NBR 6123:2023 (vento), NBR 8681 (combinações), NBR 8800 (chapas, cubo e chumbadores). A MLC segue a EN 14080 (classe GL24h; fonte secundária declarada).</p><ul>" + arr(res.avisos).filter(function (a) { return /PREMISSA|não modelad|T4:/.test(a); }).slice(0, 8).map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>");
    h.push("<div class='faixa'>" + esc(EXIGENCIA) + "</div>");
    H2("3. Ações");
    var cT = res.cargasTotais || {};
    h.push("<table><tr><th>Ação</th><th>Valor</th></tr><tr><td>Peso próprio MLC (γ = " + br(res.memoria && res.memoria.pesoMLC || 5, 1) + " kN/m³) — resultante vertical</td><td>" + br(Math.abs((cT.G1 || [0, 0, 0])[1])) + " kN</td></tr><tr><td>G2 — telha + ripas (" + br(P.telha && P.telha.peso) + " kN/m² inclinado), área " + br(res.orcamento && res.orcamento.area_telhado_m2) + " m²</td><td>" + br(Math.abs((cT.G2 || [0, 0, 0])[1])) + " kN</td></tr><tr><td>Q — sobrecarga de cobertura (NBR 6120, por m² de planta)</td><td>" + br(Math.abs((cT.Q || [0, 0, 0])[1])) + " kN</td></tr><tr><td>Vento — V0</td><td>" + (res.v0 != null ? br(res.v0, 1) + " m/s" : "—") + "</td></tr></table>");
    h.push("<p class='nota'>Vento: a NBR 6123:2023 não traz coeficientes para telhado poligonal; PREMISSA CONSERVADORA DECLARADA: campo de pressões da Tabela 5 (duas águas) do retângulo circunscrito ao polígono projetado sobre as " + I.n + " águas, normal a cada uma, com o beiral a barlavento, azimutes 0° e 90° (e giro de 22,5° no octógono); a confirmar pelo RT (ou ensaio em túnel de vento). Combinações ELU/ELS pela NBR 8681 + 2ª ordem + abertura dominante excepcional; " + res.combinacoes + " combinações ELU.</p>");
    H2("4. Resultados por grupo (NBR 7190-1:2022)");
    var gs = Object.keys(res.secoes || {}).filter(function (g) { return NOME_G[g] && res.grupos[g]; });
    h.push("<table><tr><th>Grupo</th><th>Seção (cm)</th><th>η máx.</th><th>Governa</th></tr>" + gs.map(function (g) { var s = res.secoes[g], e = res.grupos[g]; return "<tr><td>" + esc(NOME_G[g]) + "</td><td>" + r(s.b * 100, 0) + " × " + r(s.h * 100, 0) + "</td><td class='" + (e.eta <= 1 ? "ok" : "nok") + "'>" + br(e.eta, 3) + "</td><td>" + esc(e.governa || "") + "</td></tr>"; }).join("") + "</table>");
    H2("5. Espigões, cubo do ápice e cinta do canto");
    var E = res.espigao || {}, C = res.cinta || {}, PM = res.porModelo || {}, sT = res.slipT;
    h.push("<p>Comprimento de flambagem do espigão: L0 = " + (res.compressaoE ? br(res.compressaoE.L0y) + " m (canto → cubo, sem crédito das terças)" : "—") + "; λ máx. = " + (res.compressaoE ? br(res.compressaoE.lambdaMax, 1) + " (limite 140)" : "—") + ". Flexão OBLÍQUA com compressão: My e Mz do pórtico 3D, interação 7190-1. Momento de projeto: o MAIOR entre a envolvente dos modelos e a viga bi-apoiada canto–ápice com as forças verticais reais das terças" + (res.espigaoViga ? " (viga " + br(res.espigaoViga.M) + " kN·m × modelo " + br(res.espigaoViga.Mmodelo) + " kN·m na pior combinação)" : "") + ".</p><table><tr><th>Esforço de extremidade do espigão (ELU, kN)</th><th>N</th><th>Cortante</th><th>H (empuxo)</th><th>V</th></tr><tr><td>Canto</td><td>" + br(E.heel && E.heel.N) + "</td><td>" + br(E.heel && E.heel.S) + "</td><td>" + br(E.heel && E.heel.H) + "</td><td>" + br(E.heel && E.heel.V) + "</td></tr><tr><td>Cubo do ápice</td><td>" + br(E.apice && E.apice.N) + "</td><td>" + br(E.apice && E.apice.S) + "</td><td>" + br(E.apice && E.apice.H) + "</td><td>" + br(E.apice && E.apice.V) + "</td></tr></table><p>Tração máxima do anel de frechal: " + br(C.N) + " kN; força de EXTREMIDADE do frechal no canto (a que a cinta transmite): " + br(C.fim && C.fim.N) + " kN; equilíbrio do nó: N_anel = H/(2·sen β) = " + br(E.heel ? E.heel.H / (2 * Math.sin(I.beta)) : 0) + " kN.</p>");
    h.push("<p><b>Envolvente de modelos (o comportamento depende da ligação: arco com tirante × viga apoiada).</b> " + esc(res.modelos || "") + ". O modelo (c), sem o pilar central, trata o cubo como NÃO apoiado: os espigões trabalham em arco e o anel de frechal é o tirante; η do espigão " + ["a", "b", "c"].filter(function (t) { return PM[t] && PM[t].E; }).map(function (t) { return "(" + t + ") " + br(PM[t].E.eta, 3); }).join(" · ") + (sT ? "; estribo da terça com deslizamento: " + sT.n + " pinos Ø" + Math.round(sT.d * 1000) + " por ponta, Ku = " + Math.round(sT.Ku) + " kN/m por pino (NBR 7190-1:2022, 7.1.12)" : "") + ".</p>");
    h.push("<p><b>Cinta do canto.</b> Dimensionada por MAX(N do modelo da envolvente a/b/d; H/(2·sen β)). Detalhe padrão: sela + cinta numa CHAPA ÚNICA (a mesma chapa em fenda no espigão e nos dois frechais, pinos da cinta no eixo do frechal), verificada por M = H·e_v no plano; a madeira do frechal fica sem torção" + (res.detalheSela === "torcao" ? " — NESTA emissão foi escolhido o detalhe ALTERNATIVO (sela só sobre o frechal) com a torção T = H·δ/(2·cos β) verificada na madeira (o b cresce primeiro)" : "") + ". " + esc(res.semCinta ? res.semCinta.motivo : "") + ".</p>");
    if (res.creditoTopo) h.push("<p>Travamento do topo dos pilares: " + esc(res.creditoTopo.motivo) + ".</p>");
    H2("6. Ligações");
    var Lg = (res.ligacoesT4 && res.ligacoesT4.ligacoes) || {};
    h.push("<table><tr><th>Ligação</th><th>Pinos (n × Ø)</th><th>η</th></tr>" + Object.keys(Lg).map(function (k) { var l = Lg[k]; return "<tr><td>" + esc(k) + "</td><td>" + (l.pinos && l.pinos.n ? l.pinos.n + " × Ø" + Math.round((l.pinos.d || 0) * 1000) : (l.porApoio ? l.porApoio + " parafusos WT" : "—")) + "</td><td class='" + (l.eta <= 1 ? "ok" : "nok") + "'>" + br(l.eta, 3) + "</td></tr>"; }).join("") + "</table>");
    h.push("<p class='nota'>Cubo do ápice: tubo de aço Ø114,3 × 6,3 mm com chapas radiais t = 8 mm; cada espigão/caibro entra com a sua chapa em fenda, a ≥ 10 mm do tubo e dos vizinhos. Sela do espigão no canto: momento N·δ (δ = h_FR/2) no grupo de pinos (momento polar); cinta pela força de extremidade do frechal, chapa verificada pela seção bruta, líquida (fu/γa2, γa2 = 1,35) e esmagamento dos furos (NBR 8800); torção nas pontas do frechal com H·cos β (7190-1). Vento local de aresta (cpe −1,2 em faixa de " + br(res.ligacoesT4 && res.ligacoesT4.ventoLocal ? res.ligacoesT4.ventoLocal.wf_m : 0, 2) + " m ao longo do espigão; EN 1991-1-4, Tab. 7.5 — fonte SECUNDÁRIA, a confirmar pelo RT) nas ligações terça × espigão e sela.</p><h3>Folga construtiva (encontros)</h3><p>As pontas da peça comprimida (espigão e caibro no cubo, frechal nos cantos, terça junto ao espigão) são aparadas com folga ≥ 10 mm das faces vizinhas; a carga passa SÓ pelas chapas internas e pinos (sem contato madeira–madeira). Folga mínima medida: <b>" + br(res.aparo && res.aparo.resumo ? res.aparo.resumo.minimo_mm : 0, 1) + " mm</b> em " + (res.aparo && res.aparo.resumo ? res.aparo.resumo.n : 0) + " pontas.</p>");
    H2("7. Verificações de serviço");
    var fl = res.flechas || {};
    h.push("<table><tr><th>Grupo</th><th>η flecha (L/" + (res.memoria && res.memoria.limVao || 300) + ")</th></tr>" + Object.keys(fl).map(function (g) { return "<tr><td>" + esc(NOME_G[g] || g) + "</td><td>" + br(fl[g], 3) + "</td></tr>"; }).join("") + "</table><p class='nota'>K_br,1 (NBR 7190-1:2022, 6.6.2) não se aplica: a T4 não tem banzo de tesoura; o espigão é verificado com L0 = comprimento total, sem travamento lateral.</p>");
    H2("8. Orçamento (resumo)");
    var O = res.orcamento || {}; h.push("<p>Custo direto R$ " + br(O.custo_direto, 2) + " · preço com BDI " + br((O.bdi || 0) * 100, 2) + " % = R$ " + br(O.preco, 2) + " · MLC " + br(O.volumes && O.volumes.mlc, 3) + " m³ · pinos (todos os grupos de cada nó, pela geometria): " + (O.pinos ? O.pinos.total + O.pinos.base : 0) + " un.</p>");
    H2("9. Pendências e não modelado");
    h.push("<ul><li>" + esc(EXIGENCIA) + "</li><li>Torção por excentricidade do vento (6.6) e vento em outros azimutes: não modelados.</li><li>Caibros secundários e ripas: não modelados (dentro do preço da telha).</li><li>Vento em telhado poligonal: premissa conservadora (Tabela 5 do retângulo circunscrito) — confirmar com o RT/ensaio. O cpe local −1,2 nas arestas (EN 1991-1-4, Tab. 7.5 — fonte SECUNDÁRIA) é premissa a confirmar pelo RT.</li><li>Solda e detalhe do cubo do ápice, sela do canto e chapa de topo do pilar central: do fabricante/RT.</li><li>Valores da NBR 7190-1:2022 conferidos na transcrição da biblioteca; MLC pela EN 14080 (fonte secundária).</li></ul>" + (arr(res.auditoria && res.auditoria.achados).length ? "<h3>Achados do auditor</h3><ul>" + res.auditoria.achados.map(function (a) { return "<li class='nok'>" + esc(a.mensagem) + "</li>"; }).join("") + "</ul>" : "<p class='ok'>Auditor: nenhum achado.</p>"));
    h.push("<p class='nota'>" + esc(FAIXA) + "</p></body></html>");
    return { ok: true, html: h.join(""), titulo: "Memorial de cálculo — telhado " + nome, secoes: secoes, avisos: avisos, situacao: pre };
  }
  function manual(res, op) {
    pronto(); op = op || {}; if (!res || res.tipologia !== "T4" || !res.t4) return { ok: false, html: "", avisos: ["Resultado sem a T4."], paginas: 0 };
    var SA = dep("MadEngSaidas", "./madengsaidas.js"), pre = SA ? SA.preliminar(res) : { preliminar: false, rotulo: "PRELIMINAR — NÃO ATENDE" }, I = res.t4.info, mem = res.t4.membros, f = res.fonte.pecas, h = [], n = 0;
    function cont(g) { return mem.filter(function (m) { return m.g === g; }).length; }
    var etapas = [["Pilares e frechal em anel", "Montar os " + cont("P") + " pilares do perímetro" + (cont("PC") ? " e o pilar central" : "") + " sobre as bases engastadas; assentar o frechal em anel (" + I.n + " lados). Os dois frechais de cada canto ficam a ≥ 10 mm do espigão: o anel fecha pela CINTA de aço (chapa interna + pinos) em cada canto."],
      ["Cubo do ápice", "Posicionar o cubo de aço (tubo central com " + (cont("E") + cont("CB")) + " chapas radiais) no centro" + (cont("PC") ? ", com o tubo descendo " + (res.aparo && res.aparo.cubo ? Math.round(res.aparo.cubo.desce * 100) : 40) + " cm dentro do pilar central (fenda + pinos)" : ", escorado provisoriamente até fechar o anel de terças") + "; conferir prumo e nível."],
      ["Espigões", "Instalar os " + cont("E") + " espigões do canto ao cubo: sela de aço sobre o frechal no canto e chapa interna em fenda + pinos no cubo; a ponta fica a ≥ 10 mm do tubo e dos vizinhos (folga cotada na folha E04)."],
      ["Caibros de meio de água", cont("CB") ? "Instalar os " + cont("CB") + " caibros de meio sobre o pilar do meio do lado, com a ponta no cubo (folga ≥ 10 mm)." : "Esta geometria não leva caibro de meio de água (lado ≤ 4,5 m): etapa suprimida."],
      ["Terças", "Instalar as terças das " + I.n + " águas, de espigão a espigão; as pontas têm bisel em planta e assentam em estribo de aço (chapa interna + pinos), com folga ≥ 10 mm da madeira do espigão; fixar com parafusos de rosca total a 45°. " + (I.caibro ? "As terças são contínuas sobre o caibro." : "")],
      ["Contraventamento e conferência", "Instalar as diagonais de madeira em X (águas e painéis das paredes). Conferir: nenhuma peça sem folga na ponta aparada; torque dos pinos; cinta dos " + I.n + " cantos."]];
    h.push("<!doctype html><html><head><meta charset='utf-8'><title>Manual de montagem — telhado " + (I.n === 8 ? "oitavado" : "sextavado") + "</title><style>" + CSS + "@page{size:A3 landscape;margin:12mm}.pg{page-break-after:always;min-height:240mm}</style></head><body>");
    h.push("<div class='pg'><h1>Manual de montagem — telhado " + (I.n === 8 ? "oitavado" : "sextavado") + "</h1><div class='faixa'>" + esc(EXIGENCIA) + "</div>" + (pre.preliminar ? "<div class='faixa'>" + esc(pre.rotulo) + "</div>" : "") + "<p>" + esc((op.obra && op.obra.nome) || "") + " — " + f.length + " marcas de peça; " + mem.length + " peças individuais.</p><div class='faixa'>" + esc(FAIXA) + "</div><table><tr><th>Etapa</th><th>O que se monta</th></tr>" + etapas.map(function (e, i) { return "<tr><td>" + (i + 1) + ". " + esc(e[0]) + "</td><td>" + esc(e[1]) + "</td></tr>"; }).join("") + "</table></div>"); n++;
    etapas.forEach(function (e, i) { h.push("<div class='pg'><h2>Etapa " + (i + 1) + " — " + esc(e[0]) + "</h2><p>" + esc(e[1]) + "</p><table><tr><th>Marca</th><th>Descrição</th><th>Seção</th><th>Qtd.</th></tr>" + f.filter(function (p) { return p.marca; }).slice(0, 80).filter(function (p) { var g = p.marca; return (i === 0 && /^(P|PC|FR)$/.test(g)) || (i === 2 && g === "E") || (i === 3 && g === "CB") || (i === 4 && g === "T") || (i === 5 && /^(DX|DP)$/.test(g)); }).map(function (p) { return "<tr><td>" + esc(p.id) + "</td><td>" + esc(p.descricao) + "</td><td>" + esc(p.especificacao) + "</td><td>" + p.qtd + "</td></tr>"; }).join("") + "</table></div>"); n++; });
    h.push("</body></html>");
    return { ok: true, html: h.join(""), paginas: n, etapas: etapas.length, avisos: [] };
  }
  function ifc(res, opts) { var SA = dep("MadEngSaidas", "./madengsaidas.js"); return SA.gerarIfc(pecasMembros(res), { projeto: (opts && opts.projeto) || "Telhado poligonal", opcao: res.opcao, semente: (opts && opts.semente) || "t4:" + res.opcao, agora: opts && opts.agora }); }
  function dae(res, opts) { var EX = dep("MadEngExport", "./madengexport.js"); return EX.gerarDae(pecasMembros(res), { projeto: (opts && opts.projeto) || "Telhado poligonal" }); }

  var MadT4Saidas = { EXIGENCIA: EXIGENCIA, pecasMembros: pecasMembros, multGeo: multGeo, orcar: orcarT4, rodar: rodar, memorial: memorial, manual: manual, ifc: ifc, dae: dae, FAIXA: FAIXA, NOME_G: NOME_G };
  if (typeof module !== "undefined" && module.exports) module.exports = MadT4Saidas;
  else global.MadT4Saidas = MadT4Saidas;
})(typeof window !== "undefined" ? window : this);
