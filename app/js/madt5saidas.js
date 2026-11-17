/* =====================================================================
 * madt5saidas.js — T5 (pergolado): rodar no worker (projeto completo + orçamento), ORÇAMENTO (todos os grupos de pinos de cada nó, contados pela geometria), peças POR MEMBRO (IFC/SketchUp),
 * MEMORIAL e MANUAL DE MONTAGEM. Motor PURO, ES5, Node-testável. Arquivo novo: não altera madorcamento/madengsaidas.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } } return null; }
  var T5 = null, br = function (x, n) { return (n == null ? Number(x || 0).toFixed(2) : Number(x || 0).toFixed(n)).replace(".", ","); }, copia = function (x) { return JSON.parse(JSON.stringify(x)); }, norm = function (a, b) { return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2)); };
  function pronto() { if (!T5) T5 = dep("MadT5", "./madt5.js"); return T5; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function r(x, n) { var p = Math.pow(10, n); return Math.round(x * p + (x >= 0 ? 1e-9 : -1e-9)) / p; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  var FAIXA = "Documento gerado pelo sistema — emissão somente após conferência e ART do responsável técnico";
  var EXIGENCIA = "Exigência de projeto: a parede/viga existente (pergolado encostado) e a fundação dos pilares NÃO fazem parte desta verificação — as reações das ligações são entregues ao responsável técnico. As placas de cobertura (policarbonato/vidro) têm vão e fixação do fabricante.";

  /* ---------------------------------------------------------------- peças POR MEMBRO (posição real; mãos-francesas aparadas; uma por ripa) */
  function pecasMembros(res) {
    pronto(); var out = [], mat = "MLC GL24h (EN 14080)", nomes = { P: "Pilar", VP: "Viga principal", VS: "Viga secundária (caibro)", MF: "Mão-francesa" }, I = res.t5.info;
    arr(res.t5.membros).forEach(function (m) {
      var s = res.secoes && res.secoes[m.g]; if (!nomes[m.g] || !s || !s.b || !s.h) return;
      var L = norm(m.p0, m.p1), up = T5.upDe(m);
      out.push({ id: m.id, g: m.g, marca: m.g, grupo: "T5 — " + nomes[m.g], descricao: nomes[m.g], material: mat, especificacao: "MLC " + r(s.b * 100, 0) + "×" + r(s.h * 100, 0) + " cm", secao: { tipo: "ret", b: s.b, h: s.h }, p0: m.p0, p1: m.p1, up: up, qtd: 1, comprimento_m: L, volume_m3: s.b * s.h * L, unidade: "peça", bisel: m.bisel });
    });
    if (I.ripa && res.secoes && res.secoes.RP) { var s2 = res.secoes.RP, y = I.Hh, k; I.ripa.xs.forEach(function (x, i) { var yy = (res.t5.info.Hh || 0) - (x * I.incl) + (res.secoes.VS ? res.secoes.VS.h / 2 + s2.h / 2 : 0); out.push({ id: "RP" + (i + 1), g: "RP", marca: "RP", grupo: "T5 — Ripado", descricao: "Ripa", material: mat, especificacao: "MLC " + r(s2.b * 100, 0) + "×" + r(s2.h * 100, 0) + " cm", secao: { tipo: "ret", b: s2.b, h: s2.h }, p0: [x, I.z0, yy], p1: [x, I.zN, yy], up: [0, 0, 1], qtd: 1, comprimento_m: I.zN - I.z0, volume_m3: s2.b * s2.h * (I.zN - I.z0), unidade: "peça" }); });
    }
    return out;
  }

  /* ---------------------------------------------------------------- ORÇAMENTO */
  function gruposDe(l) { var g = []; if (l && l.pinos && l.pinos.ok !== false && l.pinos.n && !l.pinosPilar) g.push({ nome: "peça", n: l.pinos.n, pn: l.pinos }); if (l && l.pinosPilar && l.pinosPilar.n) g.push({ nome: "pilar", n: l.pinosPilar.n, pn: l.pinosPilar }); if (l && l.pinosViga && l.pinosViga.n) g.push({ nome: "viga", n: l.pinosViga.n, pn: l.pinosViga }); return g; }
  function orcarT5(e) {
    pronto(); e = e || {};
    var MO = dep("MadOrcamento", "./madorcamento.js"), pc = e.pecas || [], X = e.extras || {}, sub = e.precos || {}, bdi = e.bdi == null ? MO.BDI_PADRAO : e.bdi, P = e.params || {}, S = e.secoes || {}, L5 = (e.ligacoesT5 && e.ligacoesT5.ligacoes) || {}, M5 = e.membros || [], mult = (e.ligacoesT5 && e.ligacoesT5.multiplicidade) || {}, I = e.info || {};
    var preco = MO.preco;
    var vMlc = 0, aVerniz = 0; pc.forEach(function (p) { if (/MLC/.test(String(p.material || "")) && p.volume_m3) { vMlc += p.volume_m3; aVerniz += MO.areaFaces(p); } });
    var nPil = M5.filter(function (m) { return m.g === "P"; }).length, nMF = M5.filter(function (m) { return m.g === "MF"; }).length, nVS = M5.filter(function (m) { return m.g === "VS"; }).length;
    var pb = (L5.base && L5.base.placaBase) || { dimensoes_mm: [0, 0], total: 0, espessura_mm: 25 }, lp = pb.dimensoes_mm[0] / 1000, tpb = (pb.espessura_mm || 25) / 1000;
    var kgBase = nPil * (lp * lp * tpb * 7850 + (lp - 0.10) * 0.15 * TCH() * 7850), nChumbBase = nPil * (pb.total || 0);
    var nPinos = 0, kgChapa = 0, porLig = {};
    function acum(chave, m, l, larg0) {
      var gs = gruposDe(l), n = 0, comp = 0.2, larg = Math.max(0.03, larg0 || 0.1);
      gs.forEach(function (g) { n += g.n; comp = Math.max(comp, (g.pn && g.pn.comprimento) || 0.2); if (g.pn && g.pn.nc > 1 && g.pn.centroGrupo) larg = Math.max(larg, 2 * g.pn.centroGrupo.a + 4 * g.pn.d); });
      nPinos += m * n; kgChapa += m * TCH() * larg * (comp + 0.05) * 7850; porLig[chave] = { mult: m, grupos: gs.map(function (g) { return { nome: g.nome, n: g.n }; }), pinosPorInstancia: n, total: m * n };
    }
    /* multiplicidade pela geometria (T5Lig.multGeo, recontada no teste): cada ponta de mão-francesa = 1 grupo na barra; cada nó do pilar = 1 chapa em cruz + 1 grupo no pilar; etc. */
    if (L5.mfPilarBarra) acum("mfPilarBarra", mult.pontasMF || 2 * nMF, L5.mfPilarBarra, S.MF && S.MF.h ? S.MF.h - 0.05 : 0.05);
    if (L5.mfPilarNo) acum("mfPilarNo", mult.nosMFPilar || 0, L5.mfPilarNo, S.P ? S.P.h - 0.05 : 0.1);
    if (L5.mfViga) acum("mfViga", mult.mfNaViga || 0, L5.mfViga, S.VP ? S.VP.h - 0.05 : 0.1);
    if (L5.mfCaibro) acum("mfCaibro", mult.mfNoCaibro || 0, L5.mfCaibro, S.VS ? S.VS.h - 0.05 : 0.1);
    if (L5.cabeca) { acum("cabeca", mult.cabecas || nPil, L5.cabeca, S.P ? S.P.h - 0.05 : 0.1); }
    if (L5.base) acum("base", mult.bases || nPil, L5.base, S.P ? S.P.h - 0.05 : 0.1);
    if (L5.parede) { acum("parede", mult.caibroParede || 0, L5.parede, S.VS ? S.VS.h - 0.05 : 0.1); }
    var nWT = L5.caibroVP ? (mult.caibroVP || 0) * L5.caibroVP.porApoio : 0, nChumbPar = L5.parede ? (mult.caibroParede || 0) * (L5.parede.chumbadores ? L5.parede.chumbadores.n : 0) : 0;
    var nRipaFix = I.ripa ? I.ripa.n * (I.nCaibros || 0) * 2 : 0, comCob = !!(P.comCob), aCob = I.areaCob || 0;
    var prazo = X.prazoSemanas != null ? Number(X.prazoSemanas) : 2, hEnc = X.horasEncarregado != null ? Number(X.horasEncarregado) : prazo * 44, hEng = X.horasEngenheiro != null ? Number(X.horasEngenheiro) : Math.round(0.2 * prazo * 44);
    var itens = [], etapa;
    function Lx(cod, desc, q, chave, obs) { var pr = preco(chave, sub), qq = r(q, 3); itens.push({ etapa: etapa, codigo: cod, descricao: desc, un: pr.un, qtd: qq, pu: pr.pu, total: r(qq * pr.pu, 2), fonte: pr.fonte, chave: chave, adotado: pr.adotado, editado: pr.editado, obs: obs || "" }); }
    etapa = "01 ESTRUTURA DE MADEIRA (MLC)";
    Lx("01.01", "Fornecimento de MLC GL24h aplainada — pilares, vigas principais, caibros, mãos-francesas" + (I.ripa ? " e ripado" : ""), vMlc, "mlc");
    Lx("01.02", "Frete da madeira até a obra", vMlc, "frete"); Lx("01.03", "Montagem da estrutura", vMlc, "montagem");
    Lx("01.04", "Caminhão guindauto para içamento (" + (X.diariasMunck != null ? X.diariasMunck : 1) + " diária de 8 h)", X.horasMunck != null ? Number(X.horasMunck) : (X.diariasMunck != null ? Number(X.diariasMunck) : 1) * 8, "munck_h");
    Lx("01.05", "Proteção da madeira aparente (uso externo): stain/verniz marítimo 3 demãos", aVerniz, "verniz");
    etapa = "02 LIGAÇÕES E FERRAGENS";
    Lx("02.01", "Peças de aço galvanizado a fogo — placa de base dos " + nPil + " pilares (a chapa interna entra nas chapas de cada ligação, 02.04)", kgBase, "aco_galv");
    Lx("02.02", "Chumbadores inox A4-70 com ancoragem química (base dos pilares" + (nChumbPar ? " e estribos da parede" : "") + ")", nChumbBase + nChumbPar, "chumb20", "diâmetro dimensionado por ligação; orçado ao preço do M20");
    Lx("02.03", "Pinos inox dos nós (TODOS os grupos de pinos de cada nó: mãos-francesas, cabeça e base dos pilares, parede); os de Ø10 e Ø12 orçados ao preço do Ø16", nPinos, "pino16");
    Lx("02.04", "Chapas internas de aço inox 8 mm (uma por nó)", kgChapa, "inox_kg");
    Lx("02.05", "Parafusos SFS WT-T 8,2×300 (caibro × viga principal, a 45°)" + (I.ripa ? "; parafusos de fixação das ripas (2 por cruzamento, adotados)" : ""), nWT, "wt300");
    if (nRipaFix) Lx("02.06", "Parafusos inox das ripas (2 por cruzamento ripa × caibro)", nRipaFix, "fita_paraf", "preço do parafuso 5×50 do banco (ADOTADO; sem referência de inox 4,5×60)");
    etapa = "03 COBERTURA";
    if (comCob) {
      var pcl = (sub && sub.cobertura_leve && isFinite(Number(sub.cobertura_leve.pu))) ? { pu: r(Number(sub.cobertura_leve.pu), 2), un: "m²", fonte: sub.cobertura_leve.fonte || "Preço informado pelo usuário (sem fonte)", adotado: !sub.cobertura_leve.fonte, editado: true } : preco("telha", sub);
      itens.push({ etapa: etapa, codigo: "03.01", descricao: "Cobertura leve (" + (T5.COBERTURAS[P.cobertura.tipo] || {}).rotulo + ") com perfis e vedação, fornecida e instalada (área inclinada)", un: pcl.un, qtd: r(aCob, 3), pu: pcl.pu, total: r(aCob * pcl.pu, 2), fonte: pcl.fonte, chave: sub && sub.cobertura_leve ? "cobertura_leve" : "telha", adotado: pcl.adotado || !(sub && sub.cobertura_leve), editado: pcl.editado, obs: sub && sub.cobertura_leve ? "" : "sem referência publicada para policarbonato/vidro nesta base: adotado o preço da telha termoacústica PIR (o mais alto); informar o do fornecedor em precos.cobertura_leve" });
    }
    etapa = "04 SERVIÇOS GERAIS E ADMINISTRAÇÃO LOCAL";
    Lx("04.01", "Encarregado de carpintaria (" + prazo + " semanas)", hEnc, "encarregado_h"); Lx("04.02", "Acompanhamento técnico do engenheiro (20 % do prazo)", hEng, "engenheiro_h");
    Lx("04.03", "Mobilização, desmobilização e canteiro", 1, "mobilizacao"); Lx("04.04", "ART de execução", 1, "art");
    var cd = r(itens.reduce(function (s, x) { return s + x.total; }, 0), 2), etapas = {}; itens.forEach(function (x) { etapas[x.etapa] = r((etapas[x.etapa] || 0) + x.total, 2); });
    return { opcao: e.opcao || "T5", nome: e.nome || "", itens: itens, etapas: etapas, custo_direto: cd, bdi: bdi, preco: r(cd * (1 + bdi), 2), volumes: { mlc: r(vMlc, 3) }, area_verniz: r(aVerniz, 1), area_cobertura_m2: r(aCob, 2), pinos: { total: nPinos, porLigacao: porLig, base: 0 }, kgChapa: r(kgChapa, 1), nWT: nWT, nChumbadores: nChumbBase + nChumbPar,
      adotados: itens.filter(function (x) { return x.adotado; }).length,
      pendencias: ["Fundação dos pilares e parede/viga existente: fora do escopo (reações entregues ao RT).", comCob ? "Preço da cobertura leve = o da telha PIR do banco (o mais alto) — substituir pelo do fornecedor." : "Sem cobertura: só sombreamento (ripado).", "Calhas, rufos e drenagem fora do escopo."] };
  }
  function TCH() { return 0.008; }

  /* ---------------------------------------------------------------- RODAR (worker) */
  function rodar(sol, proj, avisa, t0, MO) {
    pronto();
    var Lg = dep("MadT5Lig", "./madt5lig.js"), itAtual = 0;
    avisa("dimensionar", { it: 0 });
    var out = Lg.projetar(proj, sol.partida, { aoIterar: function (it, sec, pior) { itAtual = it + 1; avisa("dimensionar", { it: itAtual, pior: pior, sec: sec }); } });
    avisa("auditoria");
    var rr = out.resultado, q = proj._pad5 || {};
    var rip = rr.ripado || null;
    avisa("orcamento");
    var orc = orcarT5({ opcao: sol.opcao, nome: sol.nomeOpcao, pecas: out.fonte.pecas, params: q.params, secoes: out.secoes, ligacoesT5: out.ligacoesT5, membros: out.t5.membros, info: out.t5.info, extras: sol.extras, precos: sol.precos, bdi: sol.bdi });
    var vento = q._vento || proj._vento || {}, avisos = (rr.avisos || []).slice();
    (out.ligacoesT5.avisos || []).forEach(function (a) { avisos.push(a); });
    avisos.push("T5: ESTABILIDADE LATERAL por mão-francesa nas duas direções com base ROTULADA (decisão: a fundação recebe só força, sem momento; ver T5-REFERENCIA.md §3). A base engastada não foi implementada.");
    if (rr.ripado) rr.ripado.fonteVento = "NBR 6123:2023, 8.1 (Tabela 26, Tabela 28), 8.3 e 8.4 (Figura 14, leitura gráfica do patamar)";
    var ligs = copia(out.ligacoes); if (out.ligacoesT5.ok === false) ligs.ok = false;
    var res = {
      ok: !out.semSolucao && ligs.ok !== false && !(out.auditoria && out.auditoria.achados.length), semSolucao: !!out.semSolucao, tipologia: "T5", sistema: "pergolado",
      opcao: sol.opcao, nomeOpcao: sol.nomeOpcao, secoes: out.secoes, iteracoes: out.historico.length, pior: out.pior, grupos: rr.grupos, flechas: rr.flechas, flechasMm: rr.flechasMm || null, reacoes: rr.reacoes,
      combinacoes: rr.combinacoes, avisos: avisos, avisosAnalise: rr.avisosAnalise || [], v0: vento.v0 != null ? vento.v0 : null, cargasTotais: rr.cargasTotais || null, QCOB: rr.QCOB || null,
      ligacoes: ligs, ligacoesT5: out.ligacoesT5, ligacoesT2: out.ligacoesT5, fonte: out.fonte, auditoria: out.auditoria || { achados: [], porRegra: {}, ok: true }, orcamento: orc, t7: null, t5: out.t5, aparo: out.aparo,
      kmodRef: rr.kmodRef, kmod2Ref: rr.kmod2Ref, travamento: rr.travamento, vpTorcao: rr.vpTorcao, vsMom: rr.vsMom, nosForca: rr.nosForca, apoio90: rr.apoio90, concentrada: rr.concentrada, ripado: rr.ripado || null, esbeltez: rr.esbeltez, phi: rr.phi, ms: Date.now() - t0 };
    res.memoria = { vento: vento.ok ? { memoria: vento.memoria, avisos: vento.avisos, v0: vento.v0, s1: vento.s1, s2: vento.s2, s3: vento.s3, vk: vento.vk, q: vento.q, cpi: vento.cpi, casos: (vento.casos || []).map(function (c) { return { id: c.id, nome: c.nome, direcao: c.direcao, cpi: c.cpi, q: c.q }; }), geometria: vento.geometria, norma: vento.norma, edicao: vento.edicao } : null,
      cargas: { cobertura: q.params && q.params.cobPeso }, pesoMLC: q.pesoMLC, classe: q.classe, umidade: q.umidade, limVao: q.limVao, limBalanco: q.limBalanco, vento_entrada: proj.vento ? { local: proj.vento.local, s1: proj.vento.s1, categoria: proj.vento.categoria, grupoS3: proj.vento.grupoS3 } : null };
    return res;
  }

  /* ---------------------------------------------------------------- MEMORIAL e MANUAL (HTML) */
  var NOME_G = { P: "Pilares", VP: "Vigas principais", VS: "Vigas secundárias (caibros)", MF: "Mãos-francesas", RP: "Ripas" };
  var CSS = "body{font:11pt/1.45 'Segoe UI',Arial,sans-serif;color:#222;margin:24mm 20mm}h1{font-size:19pt;margin:0 0 4px}h2{font-size:13pt;border-bottom:2px solid #1f4e79;color:#1f4e79;margin-top:22px}table{border-collapse:collapse;width:100%;margin:8px 0;font-size:10pt}th,td{border:1px solid #999;padding:3px 6px;text-align:left}th{background:#e8eef5}.ok{color:#0a6b2d}.nok{color:#b00020;font-weight:bold}.faixa{border:2px solid #b00020;color:#b00020;padding:6px 10px;margin:8px 0;font-weight:bold}.nota{color:#555;font-size:9.5pt}";
  function memorial(res, op) {
    pronto(); op = op || {}; var SA = dep("MadEngSaidas", "./madengsaidas.js"), pre = SA ? SA.preliminar(res) : { preliminar: false, rotulo: "PRELIMINAR — NÃO ATENDE", motivos: [] }, o = op.obra || {}, d = op.documento || {}, Q = res.t5 || {}, I = Q.info || {}, P = Q.params || {}, h = [], secoes = [], avisos = [];
    if (!res || res.tipologia !== "T5" || !res.t5) return { ok: false, motivo: "Resultado sem a T5 (res.t5).", html: "" };
    function H2(t) { secoes.push(t); h.push("<h2>" + esc(t) + "</h2>"); }
    h.push("<!doctype html><html><head><meta charset='utf-8'><title>Memorial de cálculo — pergolado</title><style>" + CSS + "</style></head><body>");
    if (pre.preliminar) h.push("<div class='faixa'>" + esc(pre.rotulo) + " — a estrutura NÃO atende em todos os itens; nada deste documento vale para execução.<br>" + arr(pre.motivos).map(esc).join("<br>") + "</div>");
    h.push("<h1>Memorial de cálculo — pergolado em MLC (T5)</h1><p>" + esc(o.nome || P.nome || "") + (o.cidade ? " — " + esc(o.cidade) : "") + " · " + esc(d.numero || "EST-MAD-T5-MEM") + " · rev. " + esc(d.revisao || "R00") + " · " + esc(d.data || "") + (res.nomeOpcao ? " · opção " + esc(res.opcao) + ": " + esc(res.nomeOpcao) : "") + "</p><div class='faixa'>" + esc(FAIXA) + "</div>");
    H2("1. Objeto e geometria");
    h.push("<p>Pergolado " + (I.encostado ? "<b>encostado</b> numa parede/viga existente (lado " + (I.ladoEnc === "alto" ? "alto" : "baixo") + ", ligação por estribo e chumbadores)" : "<b>livre</b> (dois alinhamentos de pilares)") + ": vão entre alinhamentos " + br(I.vao) + " m (direção dos caibros), comprimento " + br(I.comp) + " m (vigas principais), pilares " + I.nPilares + ", caibros " + I.nCaibros + " a no máximo " + br(P.sCaibro * 100, 0) + " cm, balanço do caibro " + br(P.balCaibro) + " m e da viga " + br(P.balViga) + " m, pé-direito " + br(P.peDireito) + " m no lado alto (" + br(I.Hl) + " m no baixo)." + (I.ripa ? " Ripado " + br(I.ripa.b * 100, 0) + "×" + br(I.ripa.h * 100, 0) + " cm a " + br(I.ripa.s * 100, 0) + " cm (" + I.ripa.n + " ripas)." : "") + " Cobertura: " + esc((T5.COBERTURAS[(P.cobertura || {}).tipo] || {}).rotulo || "—") + (P.comCob ? ", inclinação " + br(P.incl * 100, 0) + " %, peso " + br(P.cobPeso, 3) + " kN/m² (" + esc((T5.COBERTURAS[P.cobertura.tipo] || {}).fonte) + ")" : "") + ".</p>");
    h.push("<p><b>Estabilidade lateral (decisão).</b> Mão-francesa de " + br(I.mfD) + " m nas duas direções (plano das vigas principais: pilar → viga; plano dos caibros: pilar → caibro que passa pelo eixo do pilar" + (I.encostado ? "; nesta opção a parede trava a direção dos caibros e só a primeira existe" : "") + ") com base ROTULADA. Motivo: as ações horizontais de um pergolado leve são pequenas; o pórtico com mãos-francesas leva a fundação a receber só força (bloco/sapata sem momento) e evita o pilar em balanço engastado, cuja flambagem (L0 = 2·L) e o momento na base exigiriam seção e chapa muito maiores. A base engastada não foi implementada.</p>");
    H2("2. Normas e premissas");
    h.push("<p>NBR 7190-1:2022 (kmod, ligações; classe de umidade " + (res.memoria && res.memoria.umidade || 3) + " — uso externo; kmod2 = " + br(res.kmod2Ref || 0.8, 2) + "), NBR 6120:2019 (ações), NBR 6123:2023 (vento), NBR 8681 (combinações), NBR 8800 (chapa, chumbadores). MLC pela EN 14080 (GL24h; fonte secundária). Conectores de aço inox AISI 316 / aço galvanizado a fogo.</p><ul>" + arr(res.avisos).filter(function (a) { return /PREMISSA|não modelad|T5:/.test(a); }).slice(0, 8).map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>");
    h.push("<div class='faixa'>" + esc(EXIGENCIA) + "</div>");
    H2("3. Ações e vento");
    var cT = res.cargasTotais || {};
    h.push("<table><tr><th>Ação</th><th>Valor</th></tr><tr><td>Peso próprio MLC (5,0 kN/m³) — resultante vertical</td><td>" + br(Math.abs((cT.G1 || [0, 0, 0])[1])) + " kN</td></tr><tr><td>G2 — cobertura + ripado + plantas, área " + br(I.areaCob) + " m²</td><td>" + br(Math.abs((cT.G2 || [0, 0, 0])[1])) + " kN</td></tr><tr><td>Q — " + esc(res.QCOB && res.QCOB.texto || "") + "</td><td>" + br(Math.abs((cT.Q || [0, 0, 0])[1])) + " kN</td></tr></table>");
    h.push("<p class='nota'>Vento: V0 = " + br(res.v0 || 0, 1) + " m/s; q = " + br((res.memoria && res.memoria.vento && res.memoria.vento.q) || 0, 3) + " kN/m². " + (P.comCob ? "COM cobertura: cobertura isolada (NBR 6123:2023, 7.2.1, Tabela 24 — uma água plana, vento perpendicular à geratriz, dois carregamentos independentes; 7.2.2 atrito no vento paralelo à geratriz: o texto da 2023 (p. 49 impressa / 61 do PDF) imprime exatamente «Ft = 0,5 q a b», que é ERRO TIPOGRÁFICO — a edição de 1988, 8.2.5, tem a frase idêntica com 0,05, e a própria 2023, 6.1.5, dá Ct de 0,01 a 0,04 por face (EN 1991-1-4: cfr 0,01 a 0,04); ADOTADO Ft = 0,05·q·a·b. PENDÊNCIA: conferir a errata da ABNT" + (I.encostado ? "; parede encostada = obstrução junto à cobertura: edificação fechada de mesma cobertura, cpi = +0,8 e −0,3" : "; se h < 0,5·l2 vale a mesma regra de obstrução") + ")." : "SEM cobertura: arrasto nas peças (NBR 6123:2023, 8.1: Cx da Tabela 26 = 2,4, o maior valor lido; K da Tabela 28; reticulados em série 8.3/8.4 com η da Figura 14 por leitura gráfica do patamar) — o ripado vira reticulado de n ripas.") + " Combinações ELU/ELS pela NBR 8681 + 2ª ordem; " + res.combinacoes + " combinações ELU. <b>Análise global de 2ª ordem (P-Δ e P-δ, matriz geométrica iterada, ativada em CADA combinação ELU) com imperfeição geométrica por forças nocionais de 0,3 % (NBR 8800, 4.9.7): o pilar é verificado com L0 = H (nó do topo e da mão-francesa contidos pelo pórtico contraventado; o deslocamento lateral já está no momento da análise).</b></p>");
    H2("4. Resultados por grupo (NBR 7190-1:2022)");
    var gs = Object.keys(res.secoes || {}).filter(function (g) { return NOME_G[g] && (res.grupos[g] || (g === "RP" && res.ripado)); });
    h.push("<table><tr><th>Grupo</th><th>Seção (cm)</th><th>η máx.</th><th>Governa</th></tr>" + gs.map(function (g) { var s = res.secoes[g], e = g === "RP" ? { eta: res.ripado.eta, governa: res.ripado.governa } : res.grupos[g]; return "<tr><td>" + esc(NOME_G[g]) + "</td><td>" + r(s.b * 100, 0) + " × " + r(s.h * 100, 0) + "</td><td class='" + (e.eta <= 1 ? "ok" : "nok") + "'>" + br(e.eta, 3) + "</td><td>" + esc(e.governa || "") + "</td></tr>"; }).join("") + "</table>");
    var vm = res.vsMom || {};
    h.push("<p>Momento de projeto = MAIOR entre o do pórtico 3D e o da viga bi-apoiada com as cargas reais da combinação: " + Object.keys(vm).map(function (g) { return NOME_G[g] + ": pórtico " + br(vm[g].Msolver) + " kN·m, bi-apoiada w·L²/8 = " + br(vm[g].Mbi) + " kN·m (w = " + br(vm[g].w, 3) + " kN/m, L = " + br(vm[g].L) + " m), projeto " + br(vm[g].Mproj) + " kN·m"; }).join("; ") + ". " + (res.concentrada ? "Caibro isolado com 1 kN concentrado no meio do vão (NBR 6120, 6.4): η = " + br(res.concentrada.eta, 3) + "." : "") + "</p>");
    if (res.apoio90) h.push("<p>Apoio ⊥ às fibras (7190-1, 6.3.3 / 6.2.4): viga principal sobre o pilar σ = " + br(res.apoio90.VP.sigma_MPa, 3) + " MPa ≤ " + br(res.apoio90.VP.fc90d_MPa, 3) + " (η " + br(res.apoio90.VP.eta, 3) + "); caibro sobre a viga σ = " + br(res.apoio90.VS.sigma_MPa, 3) + " ≤ " + br(res.apoio90.VS.fc90d_MPa, 3) + " (η " + br(res.apoio90.VS.eta, 3) + ").</p>");
    if (res.travamento) h.push("<p>Eixo fraco do caibro: " + (res.travamento.usado ? "DIAFRAGMA declarado — o ripado/a cobertura trava o caibro a ≤ 60 cm; força de travamento Fd = Nc,d/50 = " + br(res.travamento.Nc) + "/50 = " + br(res.travamento.Fb, 3) + " kN por ponto contra Rd lateral " + br(res.travamento.Rd_lateral) + " kN (2 parafusos 5 mm; EN 1995-1-1, 9.2.5.3 e 8.2.2, fonte secundária), η " + br(res.travamento.eta, 3) + "." : "SEM diafragma (padrão: cobertura leve não-diafragma e ripado sem cobertura não travam o caibro): L0z = vão entre apoios e a largura b do caibro resolve a esbeltez (λ ≤ 140).") + "</p>");
    if (res.vpTorcao) h.push("<p>Torque na viga principal (a força horizontal em X que o caibro leva à VP atua no topo da VP, braço e = hVP/2 = " + br(res.vpTorcao.e, 2) + " m): caibros ordinários t = H·e/s, T = t·L/2 = " + br(res.vpTorcao.T_ordinarios, 3) + " kN·m; caibro sobre o pilar T = H·e = " + br(res.vpTorcao.T_pilar, 3) + " kN·m; total T = " + br(res.vpTorcao.T, 3) + " kN·m com cortante " + br(res.vpTorcao.V) + " kN: η (cortante + torção) = " + br(res.vpTorcao.eta, 3) + ". No pórtico a rigidez de torção da VP é reduzida a 0,1 % (o caibro apoia centrado) e o torque é verificado à parte por esta conta.</p>");
    h.push("<p class='nota'>Deslocamento do topo do pilar sob vento (frequente): H/300 — critério ADOTADO (a NBR 7190-1 não fixa o limite de deslocamento horizontal para este caso; mesmo critério da T3). Seções: o laço cresce até passar (η ≤ 1) e depois tenta uma seção menor, um passo por vez; o alvo de η (0,95) só serve para REDUZIR a seção — o resultado final fica com η ≤ 1 em todas as verificações, e uma seção menor é aceita só se a peça ficar com η ≤ 0,95.</p>");
    if (res.ripado) h.push("<p>Ripado: " + esc((res.ripado.passos || [""])[0]) + " η = " + br(res.ripado.eta, 3) + " (pórtico " + br(res.ripado.etaPortico, 3) + "; bi-apoiada " + br(res.ripado.etaBiapoiada, 3) + ").</p>");
    if (res.ripado && res.ripado.levanta) { var lv = res.ripado.levanta; h.push("<p>Ripa sob vento que LEVANTA (0,9·G + 1,4·W para cima, p = 2,0·q de vedação = " + br(lv.pVed, 3) + " kN/m², NBR 6123:2023, 7.2.6; flexão vertical e horizontal juntas) e arrancamento dos parafusos 5×(h+35) mm (EN 1995-1-1, 8.7.2, fonte secundária; Rd = " + br(lv.parafuso.Rd, 3) + " kN): com a cobertura presa nos CAIBROS (padrão declarado) η = " + br(lv.comCoberturaNosCaibros.eta, 3) + " (flexão) e " + br(lv.comCoberturaNosCaibros.eta_parafuso, 3) + " (parafuso); presa nas ripas η = " + br(lv.comCoberturaNasRipas.eta, 3) + " e " + br(lv.comCoberturaNasRipas.eta_parafuso, 3) + ". Usado: " + esc(lv.usado) + ".</p>"); }
    H2("5. Ligações (uma chapa por nó; pinos contados pela geometria)");
    var Lg = (res.ligacoesT5 && res.ligacoesT5.ligacoes) || {};
    h.push("<table><tr><th>Ligação</th><th>Pinos (n × Ø)</th><th>η</th></tr>" + Object.keys(Lg).map(function (k) { var l = Lg[k], gs2 = gruposDe(l); return "<tr><td>" + esc(k) + "</td><td>" + (gs2.length ? gs2.map(function (g) { return g.nome + ": " + g.n + " × Ø" + Math.round((g.pn.d || 0) * 1000); }).join("; ") : (l.porApoio ? l.porApoio + " parafusos WT" : "—")) + "</td><td class='" + (l.eta <= 1 ? "ok" : "nok") + "'>" + br(l.eta, 3) + "</td></tr>"; }).join("") + "</table>");
    h.push("<p class='nota'>Mãos-francesas aparadas: a carga passa SÓ por chapa interna (t = 8 mm) e pinos inox; folga mínima medida " + (res.aparo && res.aparo.resumo && res.aparo.resumo.minimo_mm != null ? br(res.aparo.resumo.minimo_mm, 1) : "—") + " mm (≥ 10 mm). Chapa verificada pela seção bruta, LÍQUIDA (fu/γa2, γa2 = 1,35) e esmagamento dos furos (NBR 8800). Base: placa e chumbadores sem momento (rótula); a fundação recebe Nt = " + br(res.nosForca && res.nosForca.base.Nt) + " kN (arrancamento), Nc = " + br(res.nosForca && res.nosForca.base.Nc) + " kN e H = " + br(res.nosForca && res.nosForca.base.H) + " kN por pilar.</p>");
    if (Lg.parede) h.push("<p><b>Parede/viga existente:</b> reações por caibro Ry↓ " + br(Lg.parede.reacoes.Ry_kN) + " kN, Ry↑ " + br(Lg.parede.reacoes.RyUp_kN) + " kN, Rx " + br(Lg.parede.reacoes.Rx_kN) + " kN, Rz " + br(Lg.parede.reacoes.Rz_kN) + " kN; chumbadores M" + Math.round(Lg.parede.chumbadores.d * 1000) + " × " + Lg.parede.chumbadores.n + ". A capacidade da parede e do substrato é verificação do RT.</p>");
    H2("6. Verificações de serviço");
    var fm = res.flechasMm || {}; h.push("<table><tr><th>Elemento</th><th>flecha (mm)</th><th>limite (mm)</th><th>η</th></tr>" + Object.keys(fm).slice(0, 14).map(function (k) { return "<tr><td>" + esc(k) + "</td><td>" + br(fm[k].mm || 0, 1) + "</td><td>" + br(fm[k].limite_mm || 0, 1) + "</td><td>" + br(fm[k].eta, 3) + "</td></tr>"; }).join("") + "</table><p class='nota'>Flecha final = ELS-rara instantânea + φ·quase-permanente (φ = " + br(res.phi || 0, 2) + "), vão L/" + (res.memoria && res.memoria.limVao || 300) + " e balanço = comprimento do balanço/" + (res.memoria && res.memoria.limBalanco || 150) + ".</p>");
    H2("7. Orçamento (resumo)");
    var O = res.orcamento || {}; h.push("<p>Custo direto R$ " + br(O.custo_direto, 2) + " · preço com BDI " + br((O.bdi || 0) * 100, 2) + " % = R$ " + br(O.preco, 2) + " · MLC " + br(O.volumes && O.volumes.mlc, 3) + " m³ · pinos (todos os grupos de cada nó): " + (O.pinos ? O.pinos.total : 0) + " un.</p>");
    H2("8. Pendências e não modelado");
    h.push("<ul><li>" + esc(EXIGENCIA) + "</li><li>Vento oblíquo e torção por excentricidade do vento (6.6): não modelados. Vento vertical sobre o ripado (permeabilidade): não modelado.</li><li>Proteção mútua entre peças só pelo fator η da Figura 14 (leitura gráfica do patamar — conferir).</li><li>Eixos da viga principal e do caibro no mesmo nível no pórtico (a excentricidade h/2 é desprezada; a ligação é verificada à parte).</li><li>Pesos de policarbonato/vidro/telha leve: adotados — informar o do fabricante.</li><li>CYPE 3D da T5: não gerado (use o IFC).</li></ul>");
    h.push("<p class='nota'>" + esc(FAIXA) + "</p></body></html>");
    return { ok: true, html: h.join(""), titulo: "Memorial de cálculo — pergolado", secoes: secoes, avisos: avisos, situacao: pre };
  }
  function manual(res, op) {
    pronto(); op = op || {}; if (!res || res.tipologia !== "T5" || !res.t5) return { ok: false, html: "", avisos: ["Resultado sem a T5."], paginas: 0 };
    var SA = dep("MadEngSaidas", "./madengsaidas.js"), pre = SA ? SA.preliminar(res) : { preliminar: false, rotulo: "PRELIMINAR — NÃO ATENDE" }, I = res.t5.info, mem = res.t5.membros, f = res.fonte.pecas, h = [], n = 0;
    function cont(g) { return mem.filter(function (m) { return m.g === g; }).length; }
    var etapas = [["Fundação e bases", "Conferir a fundação (a RA entrega só as forças por pilar: arrancamento, compressão e cortante). Fixar as " + cont("P") + " placas de base com os chumbadores químicos; nivelar."],
      ["Pilares", "Montar os " + cont("P") + " pilares sobre as placas de base: chapa interna em fenda no pé do pilar e pinos inox. Prumar e escorar provisoriamente nas duas direções."],
      ["Vigas principais", "Assentar as " + cont("VP") + " vigas principais no topo dos pilares (apoio por contato) e fixar com a chapa interna e os pinos da cabeça do pilar."],
      ["Mãos-francesas", "Instalar as " + cont("MF") + " mãos-francesas: as pontas são aparadas e ficam a ≥ 10 mm do pilar e da viga/caibro — a carga passa SÓ pela chapa interna e pelos pinos. Em cada nó do pilar usar UMA chapa em cruz."],
      ["Caibros" + (I.encostado ? " e parede" : ""), "Assentar os " + cont("VS") + " caibros sobre as vigas principais; fixar com os parafusos de rosca total a 45° em pares cruzados." + (I.encostado ? " Na parede: estribo de aço com chumbadores químicos (a parede deve ser verificada pelo RT para as reações do memorial)." : "")],
      ["Ripado e cobertura", (I.ripa ? "Fixar as " + I.ripa.n + " ripas com 2 parafusos inox por cruzamento. " : "") + (res.t5.params.comCob ? "Instalar a cobertura leve conforme o fabricante (inclinação " + br(I.incl * 100, 0) + " %; vão e fixação do fabricante)." : "Sem cobertura: só sombreamento.") + " Conferir: folga nas pontas das mãos-francesas, torque dos pinos, estribos."]];
    h.push("<!doctype html><html><head><meta charset='utf-8'><title>Manual de montagem — pergolado</title><style>" + CSS + "@page{size:A3 landscape;margin:12mm}.pg{page-break-after:always;min-height:240mm}</style></head><body>");
    h.push("<div class='pg'><h1>Manual de montagem — pergolado</h1><div class='faixa'>" + esc(EXIGENCIA) + "</div>" + (pre.preliminar ? "<div class='faixa'>" + esc(pre.rotulo) + "</div>" : "") + "<p>" + esc((op.obra && op.obra.nome) || "") + " — " + f.length + " marcas de peça; " + mem.length + " peças individuais.</p><div class='faixa'>" + esc(FAIXA) + "</div></div>"); n++;
    etapas.forEach(function (e, i) { h.push("<div class='pg'><h2>Etapa " + (i + 1) + " — " + esc(e[0]) + "</h2><p>" + esc(e[1]) + "</p><table><tr><th>Marca</th><th>Descrição</th><th>Seção</th><th>Qtd.</th></tr>" + f.filter(function (p) { return p.marca; }).filter(function (p) { var g = p.marca; return (i === 1 && g === "P") || (i === 2 && g === "VP") || (i === 3 && g === "MF") || (i === 4 && g === "VS") || (i === 5 && g === "RP"); }).map(function (p) { return "<tr><td>" + esc(p.marca) + "</td><td>" + esc(p.descricao) + "</td><td>" + esc(p.especificacao) + "</td><td>" + p.qtd + "</td></tr>"; }).join("") + "</table></div>"); n++; });
    h.push("</body></html>");
    return { ok: true, html: h.join(""), paginas: n, etapas: etapas.length, avisos: [] };
  }
  function ifc(res, opts) { var SA = dep("MadEngSaidas", "./madengsaidas.js"); return SA.gerarIfc(pecasMembros(res), { projeto: (opts && opts.projeto) || "Pergolado", opcao: res.opcao, semente: (opts && opts.semente) || "t5:" + res.opcao, agora: opts && opts.agora }); }
  function dae(res, opts) { var EX = dep("MadEngExport", "./madengexport.js"); return EX.gerarDae(pecasMembros(res), { projeto: (opts && opts.projeto) || "Pergolado" }); }

  var MadT5Saidas = { EXIGENCIA: EXIGENCIA, pecasMembros: pecasMembros, orcar: orcarT5, rodar: rodar, memorial: memorial, manual: manual, ifc: ifc, dae: dae, FAIXA: FAIXA, gruposDe: gruposDe };
  if (typeof module !== "undefined" && module.exports) module.exports = MadT5Saidas;
  else global.MadT5Saidas = MadT5Saidas;
})(typeof window !== "undefined" ? window : this);
