/* =====================================================================
 * madorcamento.js — FONTE de peças da madeira engenharada → ITENS DO ORÇAMENTO (motor PURO, ES5, sem DOM, Node-testável).
 * Generaliza o orcamento_casamar.py (Casa Mar R02, out/2026): madeira por m³ e material, ligações (kg/un), cobertura, forro, deck, guarda-corpo,
 * portas, montagem, içamento, frete, administração. A Casa Mar é um CASO (tools/test-mad-eng-orcamento.js reproduz o orcamento_A.json).
 *
 * REGRAS RA (não negociáveis):
 *  - "orçamento sem A COTAR": todo item tem preço. Preço sem fonte publicada entra como ADOÇÃO (campo `adotado: true`, "ADOT" na fonte)
 *    e o mais alto vence na dúvida. O usuário troca o preço (`precos[chave] = { pu, fonte }`) e a fonte passa a ser a dele.
 *  - dinheiro em centavos por linha (round 2) e soma das linhas arredondadas — nunca acumular float sem arredondar a linha.
 *  - o motor NÃO decide engenharia: traduz peças e ligações já calculadas (maddimensionar2 + madligacoes) em quantidades.
 * Entrada de orcar(e):
 *   { opcao, nome, pecas (fonte), ligacoes (madligacoes.pacoteT1), secoes ({P:{forma,h}}), teto ({x0,x1,y0,y1}),
 *     extras { porta138, porta108, portao, ripado (m²), condutoresM, areaAndaime, mesesAndaime, prazoSemanas, horasEncarregado, horasEngenheiro,
 *              horasMunck, rufoM, calhaM }, precos (substituições), bdi (0,2624) }
 * Saída: { opcao, nome, itens[], etapas{}, custo_direto, bdi, preco, volumes{}, area_verniz }
 * ===================================================================== */
(function (global) {
  "use strict";

  /* chave: [preço unitário (R$), unidade, fonte]. "ADOT" = adoção conservadora RA sem fonte publicada (marcada na planilha). Data-base out/2026. */
  var PRECOS = {
    mlc: [14000.00, "m³", "MLC GL24h aplainada — maior referência (varejo Deck Deck); CYPE R$ 2.734 e R$ 5.717 — PRECOS_REFERENCIA"],
    mlc_trat: [16100.00, "m³", "MLC GL24h tratada autoclave — MLC + 15 % de tratamento (ADOT; sem sobretaxa publicada)"],
    mlc_torn: [18200.00, "m³", "MLC torneada Ø32 — MLC + 30 % de usinagem (ADOT)"],
    rolico: [336.54, "m", "Eucalipto roliço Ø30 autoclavado cat. 5 — SINAPI SC 2788 (06/2026) R$ 280,45/m + 20 % pela retenção de CCA de água salgada (ADOT)"],
    frete: [600.00, "m³", "Frete da madeira (fábrica PR/SC → obra) — ADOT (sem referência publicada)"],
    montagem: [1095.36, "m³", "Montagem de estrutura de MLC — horas/m³ (CYPE) × carpinteiro 88262 + ajudante 88239 SINAPI SC"],
    munck_h: [365.65, "h", "Caminhão guindauto 14,3 t — SINAPI 106251"],
    aco_galv: [49.74, "kg", "Aço carbono fabricado e galvanizado — SINAPI 104468 (maior referência)"],
    inox_kg: [150.00, "kg", "Peça de aço inox 316 fabricada — ADOT (3× o aço galvanizado)"],
    pino16: [60.00, "un", "Pino liso inox 316 Ø16 × 260–300 mm cortado — ADOT (~0,45 kg × R$ 80/kg + corte/chanfro)"],
    paraf16: [75.00, "un", "Parafuso sextavado inox A4 Ø16 com porca e arruelas — ADOT (3× SINAPI 4344 zincado R$ 24,83)"],
    paraf12: [50.00, "un", "Parafuso inox A4 Ø12 com porca e arruelas — ADOT"],
    chumb20: [180.00, "un", "Barra roscada inox A4-70 M20 + ancoragem química instalada — ADOT (cartucho R$ 79,90 + barra inox + MO)"],
    wt300: [35.00, "un", "Parafuso estrutural rosca total SFS WT-T 8,2×300 (ou VGZ/ASSY equivalente) — ADOT (sem preço BR publicado)"],
    wt190: [22.00, "un", "Parafuso estrutural rosca total SFS WT-T 8,2×190 — ADOT"],
    fita_m: [11.66, "m", "Fita perfurada 60×2 galvanizada — 0,942 kg/m × SICRO R$ 12,38/kg"],
    fita_paraf: [0.80, "un", "Parafuso 5×50 para fita — ADOT"],
    tensor: [25.00, "un", "Tensor da fita — ADOT"],
    lig_escora: [250.00, "cj", "Ligação da escora: 2 chapas inox 4 mm + 2 parafusos Ø16 inox — ADOT"],
    lig_verga: [650.00, "cj", "Ligação da verga na V: chapa em T inox 8 mm + pinos Ø12 + parafusos Ø16 — ADOT"],
    apoio_deck: [180.00, "un", "Apoio da viga do deck em bloco: chapa inox U 6 mm + 2 chumbadores M12 + neoprene — ADOT"],
    mao_francesa: [304.00, "un", "Mão-francesa MLC tratada 6×12×0,9 m + 4 parafusos Ø12 inox — derivado (MLC trat + paraf12)"],
    telha_cer: [306.50, "m²", "Telha cerâmica sobre ripas, fornecida e instalada — ADOT: adotado o preço da telha PIR do banco (o mais alto); sem referência cerâmica publicada nesta base — substituir pelo da obra"],
    telha: [306.50, "m²", "Telha termoacústica PIR 30 mm fornecida e instalada — ORSE-12730 (maior; SINAPI 94216 R$ 246,97)"],
    rufo: [76.39, "m", "Rufo 33 cm — SINAPI 100327 R$ 58,76 + 30 % pré-pintado (ADOT)"],
    calha: [119.61, "m", "Calha 50 cm — SINAPI 94228 R$ 92,01 + 30 % pré-pintado (ADOT)"],
    condutor: [39.70, "m", "Condutor PVC DN100 — SINAPI 89578"],
    lambri: [148.35, "m²", "Lambri pinus 25 mm tratado — material (SINAPI 3283 ×2,5) R$ 64,57 + instalação (96112) R$ 83,78"],
    verniz: [111.08, "m²", "Verniz/stain marítimo 3 demãos aplicado — derivado (galão R$ 479,90, 17 m²/demão) + MO SINAPI 102223"],
    faixa: [250.16, "m²", "Faixa superior: painel de madeira (lambri) R$ 148,35 + subestrutura R$ 40,00 (ADOT) + pintura preta R$ 61,81 (SINAPI 100758)"],
    testeira: [165.00, "m", "Testeira 32×250 tratada pintada — derivado (MLC trat × 0,008 m³ + MO + pintura)"],
    deck_m2: [665.18, "m²", "Deck de cumaru 21×145: material R$ 566,00 (SINAPI nacional 6180 09/2026 — maior; SC 06/2026 R$ 199,50) + instalação R$ 39,18 (105090) + fixação oculta inox R$ 60,00 (ADOT)"],
    degrau: [246.00, "un", "Degrau de cumaru 1,03×0,29×0,04 + MO + verniz — derivado (cumaru R$ 10.552/m³ SINAPI 6186)"],
    gc_m: [904.00, "m", "Guarda-corpo de cumaru h 1,10 (montantes 9×9 a 1,20 + corrimão + réguas 4×4 + suporte inox em U + MO + verniz) — derivado"],
    porta138: [5555.60, "un", "Porta maciça 1,38×2,47 completa — derivado SINAPI R$ 3.703,73 × 1,5 (cumaru + ferragens inox, ADOT)"],
    porta108: [4328.97, "un", "Porta maciça 1,08×2,26 completa — derivado SINAPI R$ 2.885,98 × 1,5 (ADOT)"],
    portao: [2414.21, "un", "Portão de madeira 2 folhas 0,87×2,22 — derivado SINAPI 4998 × área × 1,5 (ADOT)"],
    ripado: [232.77, "m²", "Ripado de cumaru instalado — ORSE-1943"],
    andaime_m2mes: [39.76, "m²·mês", "Andaime — ORSE-13311"],
    andaime_mont: [25.06, "m²", "Montagem/desmontagem de andaime — SINAPI 97063"],
    encarregado_h: [55.00, "h", "Encarregado de carpintaria — ADOT (SINAPI encarregado geral ~)"],
    engenheiro_h: [150.00, "h", "Engenheiro civil (acompanhamento técnico) — ADOT"],
    mobilizacao: [5000.00, "vb", "Mobilização/desmobilização e canteiro de carpintaria — ADOT"],
    art: [262.55, "un", "ART de execução (CREA) — ADOT"]
  };
  var BDI_PADRAO = 0.2624;   /* padrão RA (TCU Acórdão 2622/2013 + ISS 5 %); confirmar o ISS do município */
  var CASA_GRUPOS = ["Cobertura — terças", "Cobertura — vigas", "Casa — pilares", "Cobertura — travamentos", "Casa — vergas"];

  function r(x, n) { var p = Math.pow(10, n); return Math.round(x * p + (x >= 0 ? 1e-9 : -1e-9)) / p; }
  function num(v, d) { var n = Number(v); return v == null || v === "" || !isFinite(n) ? d : n; }
  function comeca(s, pref) { return String(s || "").indexOf(pref) === 0; }
  function comecaAlgum(s, lista) { for (var i = 0; i < lista.length; i++) if (comeca(s, lista[i])) return true; return false; }
  function ehAdocao(fonte) { return /ADOT|derivado/i.test(String(fonte || "")); }

  /** preço da tabela com a substituição do usuário (precos[chave] = { pu, fonte }) */
  function preco(chave, sub) {
    var b = PRECOS[chave]; if (!b) throw new Error("madorcamento: preço desconhecido " + chave);
    var s = sub && sub[chave];
    if (s && isFinite(Number(s.pu)) && Number(s.pu) >= 0) return { pu: r(Number(s.pu), 2), un: b[1], fonte: s.fonte ? String(s.fonte) : "Preço informado pelo usuário (sem fonte)", adotado: !s.fonte, editado: true };
    return { pu: b[0], un: b[1], fonte: b[2], adotado: ehAdocao(b[2]), editado: false };
  }

  /** área de verniz de uma peça (a mesma conta do orcamento_casamar.py) */
  function areaFaces(p) {
    var s = p.secao || {}, L = p.comprimento_m || 0, q = p.qtd == null ? 1 : p.qtd;
    if (s.tipo === "ret") return 2 * (s.b + s.h) * L * q;
    if (s.tipo === "circ") return Math.PI * s.d * L * q;
    if (s.tipo === "perfil") return 2 * (s.b + 0.55) * L * q + 2 * s.area_media / s.b * L;   /* faces laterais ~ área do perfil */
    return 0;
  }

  function orcar(e) {
    e = e || {};
    var pc = e.pecas || [], LG = e.ligacoes || {}, X = e.extras || {}, sub = e.precos || {}, bdi = e.bdi == null ? BDI_PADRAO : e.bdi;
    var P = (e.secoes && e.secoes.P) || {}, T = e.teto || null;
    function qtd(id) { var s = 0; pc.forEach(function (p) { if (p.id === id) s += p.qtd == null ? 1 : p.qtd; }); return s; }
    function qtdPref(pref) { var s = 0; pc.forEach(function (p) { if (comeca(p.id, pref)) s += p.qtd == null ? 1 : p.qtd; }); return s; }
    function vol(p) { return p.volume_m3 || 0; }

    var vMlc = 0, vTorn = 0, vTrat = 0, vRol = 0, mRol = 0, mRolEq = 0, aVerniz = 0, dRol = {};
    pc.forEach(function (p) {
      var mat = String(p.material || ""), casa = comecaAlgum(p.grupo, CASA_GRUPOS);
      if (casa && mat.indexOf("torneada") < 0) vMlc += vol(p);
      if (mat.indexOf("torneada") >= 0) vTorn += vol(p);
      if (comecaAlgum(p.grupo, ["Deck", "Escada"]) && mat.indexOf("MLC") >= 0) vTrat += vol(p);
      if (/^Eucalipto roli/.test(mat) && p.secao) { vRol += vol(p); var mm = (p.comprimento_m || 0) * (p.qtd == null ? 1 : p.qtd), dd = p.secao.tipo === "circ" && p.secao.d > 0 ? p.secao.d : 0.30; mRol += mm; mRolEq += mm * Math.pow(dd / 0.30, 2); dRol[Math.round(dd * 100)] = (dRol[Math.round(dd * 100)] || 0) + mm; }
      if (casa) aVerniz += areaFaces(p);
    });
    var pil = 4, pb = LG.placaBase || { dimensoes_mm: [0, 0], chumbadores: { total: 0 } }, lp = pb.dimensoes_mm[0] / 1000, tpb = (pb.espessura_mm || 25) / 1000;   /* R04: a placa sai do cálculo com 32 mm na Casa Mar (flexão, M12) — o peso usa a espessura real */
    var base = LG.base || { n: 0, comprimento: 0, chapa: { largura_mm: 0 } }, topo = LG.topo || { n: 0 }, topoV = LG.topoV || { n: 0 };
    var duplo = P.forma === "duplo", kgBase, kgTopo, nPinos, nP16;
    if (!duplo) {
      kgBase = pil * (lp * lp * tpb * 7850 + 2 * (base.chapa.largura_mm / 1000) * (base.comprimento + 0.10) * 0.016 * 7850);
      kgTopo = pil * ((0.20 * 0.40 * 0.016 * 2 + 0.30 * 0.30 * 0.016) * 7850);
      nPinos = pil * (2 * base.n + topo.n + topoV.n); nP16 = 0;
    } else {
      kgBase = pil * (lp * lp * tpb * 7850 + 4 * num(P.h, 0) * (base.comprimento + 0.10) * 0.012 * 7850);
      kgTopo = 0; nPinos = 0; nP16 = pil * (2 * base.n + topo.n);
    }
    var nChumb = pil * (pb.chumbadores ? pb.chumbadores.total : 0);
    var nDiag = 0, mFita = 0; pc.forEach(function (p) { if (comeca(p.id, "FX")) { nDiag++; mFita += p.comprimento_m || 0; } });
    var fitaPar = (LG.fita && LG.fita.parafusosPorPonta) || 0;
    var dx = T ? T.x1 - T.x0 : 0, dy = T ? T.y1 - T.y0 : 0;
    var prazo = num(X.prazoSemanas, 8), hEnc = num(X.horasEncarregado, prazo * 44), hEng = num(X.horasEngenheiro, Math.round(0.2 * prazo * 44));
    var areaAnd = num(X.areaAndaime, T ? r(2 * (dx + dy) * num(X.alturaAndaime, 3.65), 0) : 0), mesesAnd = num(X.mesesAndaime, 2);
    var rufoM = num(X.rufoM, T ? 2 * dy + dx : 0), calhaM = num(X.calhaM, dx);

    var itens = [], etapa;
    function L(cod, desc, q, chave, obs, fator) {
      var pr = preco(chave, sub), qq = r(q, 3), pu = fator && !pr.editado ? r(pr.pu * fator, 2) : pr.pu, fonteP = fator && !pr.editado && Math.abs(fator - 1) > 1e-9 ? pr.fonte + " — ADOÇÃO: preço do roliço proporcional à ÁREA da seção em relação ao Ø30 da referência (fator " + String(r(fator, 3)).replace(".", ",") + " sobre o metro adotado)" : pr.fonte;
      itens.push({ etapa: etapa, codigo: cod, descricao: desc, un: pr.un, qtd: qq, pu: pu, total: r(qq * pu, 2), fonte: fonteP, chave: chave, adotado: pr.adotado, editado: pr.editado, obs: obs || "" });
    }
    etapa = "01 ESTRUTURA DE MADEIRA DA CASA (MLC)";
    L("01.01", "Fornecimento de MLC GL24h aplainada — terças, vigas V de altura variável, pilares, vergas, travessas, bloqueadores e escoras (lista de peças)", vMlc, "mlc");
    if (vTorn) L("01.02", "Fornecimento de pilares de MLC torneados", vTorn, "mlc_torn");
    L("01.03", "Frete da madeira até a obra (casa + decks)", vMlc + vTorn + vTrat, "frete");
    L("01.04", "Montagem da estrutura (casa)", vMlc + vTorn, "montagem");
    L("01.05", "Caminhão guindauto para içamento (" + num(X.diariasMunck, 4) + " diárias de 8 h)", num(X.horasMunck, num(X.diariasMunck, 4) * 8), "munck_h");
    L("01.06", "Proteção da madeira aparente: stain/verniz marítimo 3 demãos", aVerniz, "verniz");
    etapa = "02 LIGAÇÕES E FERRAGENS";
    L("02.01", "Peças de aço galvanizado a fogo fabricadas — bases engastadas (" + (duplo ? "garfo" : "chapa em cruz") + ") e topo dos pilares", kgBase + kgTopo, "aco_galv");
    var d12Base = !duplo && base.d && base.d < 0.0155;       // M6: base em cruz com pinos Ø12 (menores que o pino16 do preço) — orçados AO PREÇO DO Ø16 (sem preço próprio do Ø12: a favor da segurança do orçamento)
    if (nPinos) L("02.02", "Pinos lisos inox 316 Ø16" + (d12Base ? " (topos; bases em cruz com Ø12 orçados ao preço do Ø16)" : " (bases e topos)"), nPinos, "pino16");
    if (nP16) L("02.03", "Parafusos passantes inox A4 Ø16 ajustados (bases e topos)", nP16, "paraf16");
    L("02.04", "Chumbadores M20 inox A4-70 com ancoragem química", nChumb, "chumb20");
    L("02.05", "Parafusos SFS WT-T 8,2×300 (terça→V e reforço da V)", qtd("WT-TV") + qtd("WT-RV"), "wt300");
    L("02.06", "Parafusos SFS WT-T 8,2×190 (bloqueadores)", qtd("WT-190"), "wt190");
    L("02.07", "Fita perfurada 60×2 do contraventamento", mFita, "fita_m");
    L("02.08", "Parafusos da fita", nDiag * 2 * fitaPar, "fita_paraf");
    L("02.09", "Tensores da fita", nDiag, "tensor");
    L("02.10", "Ligações das escoras", qtd("ESC-LIG"), "lig_escora");
    L("02.11", "Ligações das vergas na viga V", qtd("LIG-VG"), "lig_verga");
    etapa = "03 COBERTURA E FORRO";
    L("03.01", "Telha termoacústica PIR 30 mm, fornecida e instalada, fixação inox em terça de madeira", qtd("TL"), "telha");
    L("03.02", "Rufos laterais e frontal pré-pintados", rufoM, "rufo");
    L("03.03", "Calha posterior pré-pintada", calhaM, "calha");
    L("03.04", "Condutores pluviais", num(X.condutoresM, 8), "condutor");
    L("03.05", "Forro aparente: lambri pinus 25 mm macho-fêmea sobre as terças", qtd("LB"), "lambri");
    L("03.06", "Verniz marítimo no lambri (face aparente)", qtd("LB"), "verniz");
    L("03.07", "Fechamento da faixa superior (preta)", qtd("FXS"), "faixa");
    L("03.08", "Testeira do beiral", qtd("TE"), "testeira");
    etapa = "04 DECKS E ESCADA";
    L("04.01", "Fornecimento de MLC GL24h tratada em autoclave — vigas, barrotes, pilaretes, longarinas", vTrat, "mlc_trat");
    L("04.02", "Pilares roliços do deck: eucalipto autoclavado, categoria 5" + (mRol > 0 && Math.abs(mRolEq / mRol - 1) > 1e-9 ? " (" + Object.keys(dRol).map(function (k) { return "Ø" + k + " " + String(r(dRol[k], 2)).replace(".", ",") + " m"; }).join(" + ") + ")" : ""), mRol, "rolico", "", mRol > 0 ? mRolEq / mRol : 1);
    L("04.03", "Montagem da estrutura dos decks e escada", vTrat + vRol, "montagem");
    var nMf = 0, nAp = 0, tabs = []; pc.forEach(function (p) {
      if (/-MF\d+$/.test(p.id)) nMf += p.qtd == null ? 1 : p.qtd;
      if (/-APOIO$/.test(p.id)) nAp += p.qtd == null ? 1 : p.qtd;
      if (/-TAB$/.test(p.id)) tabs.push(p);
    });
    L("04.04", "Mãos-francesas dos pilaretes", nMf, "mao_francesa");
    L("04.05", "Apoios das vigas em bloco/mureta", nAp, "apoio_deck");
    tabs.forEach(function (p, i) { L("04." + (6 + i < 10 ? "0" : "") + (6 + i), "Deck de cumaru 21×145 com fixação oculta inox — " + String(p.grupo || "").replace(/ — tábuas$/, "").toLowerCase(), p.qtd, "deck_m2"); });
    var cod = 6 + tabs.length;
    L("04." + (cod < 10 ? "0" : "") + cod, "Degraus de cumaru da escada", qtd("ESC-D"), "degrau");
    etapa = "05 GUARDA-CORPO, PORTAS E RIPADO";
    L("05.01", "Guarda-corpo de cumaru h 1,10 m com suporte inox", qtdPref("GC"), "gc_m");
    L("05.02", "Porta de madeira maciça 1,38×2,47 m completa", num(X.porta138, 0), "porta138");
    L("05.03", "Porta de madeira maciça 1,08×2,26 m completa", num(X.porta108, 0), "porta108");
    L("05.04", "Portão de madeira 2 folhas 0,87×2,22 m", num(X.portao, 0), "portao");
    L("05.05", "Ripado vertical de cumaru da fachada", num(X.ripado, 0), "ripado");
    var DK = e.deck || null, nx = 5; function cx() { nx++; return "05." + (nx < 10 ? "0" : "") + nx; }
    if (DK && DK.chapaApoio) { L(cx(), "Chapa de apoio inox 316 " + Math.round(DK.chapaApoio.ladoM * 1000) + "×" + Math.round(DK.chapaApoio.ladoM * 1000) + "×8 mm do lado oposto da viga de borda, uma por montante (" + DK.chapaApoio.n + " un, calculada no T7)", DK.chapaApoio.n * DK.chapaApoio.kgUn, "inox_kg"); L(cx(), "Parafusos passantes inox A4 Ø12 da fixação dos montantes (2 por montante)", DK.chapaApoio.n * 2, "paraf12"); }
    if (DK && DK.bloqueio) { L(cx(), "Bloqueios de MLC tratada entre barrotes na linha dos montantes (" + DK.bloqueio.n + " un)", DK.bloqueio.n * DK.bloqueio.vUnM3, "mlc_trat"); L(cx(), "Parafusos de rosca total WT-T 8,2×190 dos bloqueios (" + DK.bloqueio.parafusosPorUn + " por bloqueio)", DK.bloqueio.n * DK.bloqueio.parafusosPorUn, "wt190"); }
    (DK && DK.bases || []).forEach(function (b) { L(cx(), "Chumbadores M" + Math.round(b.d * 1000) + " inox A4-70 das bases dos pilares do deck " + b.deck + " (" + b.nPorPilar + " por pilar, " + b.nPilares + " pilares; " + (b.d <= 0.0125 ? "preço do parafuso inox Ø12 com porca e arruelas" : "preço do M20, a favor") + ")", b.n, b.d <= 0.0125 ? "paraf12" : "chumb20"); });
    (DK && DK.cv || []).forEach(function (c) {      /* E4 r11 (R34): contraventamento em X do deck (a MLC das diagonais já entra no volume tratado 04.01; aqui, o aço e os pinos) */
      if (c.tipo === "tirante") { L(cx(), "Tirantes inox A4-70 Ø" + Math.round(c.d * 1000) + " mm do contraventamento em X do deck " + c.deck + " (" + c.nDiag + " tirantes, " + String(r(c.compM, 1)).replace(".", ",") + " m; massa = π·d²/4·7.900 kg/m³)", c.compM * Math.PI * c.d * c.d / 4 * 7900, "inox_kg"); L(cx(), "Esticadores (terminais de aperto) e olhais dos tirantes do deck " + c.deck + " (preço do M20, a favor)", c.esticadores * 3, "chumb20"); }
      else { L(cx(), "Chapas internas de aço inox 316 t = 8 mm das " + c.nPontas + " pontas das diagonais do deck " + c.deck, c.nPontas * c.kgChapaDiagUn, "inox_kg"); L(cx(), "Pinos inox Ø" + Math.round(c.dPinoDiag * 1000) + " mm das pontas das diagonais do deck " + c.deck + " (" + c.pinosDiag + " un; preço do M20, a favor)", c.pinosDiag, "chumb20"); }
      L(cx(), "Chapas/olhais inox 316 t = 8 mm de ligação ao pilar do deck " + c.deck + " (" + c.nPontas + " un)", c.nPontas * c.kgChapaPilarUn, "inox_kg"); L(cx(), "Parafusos passantes inox da ligação ao pilar do deck " + c.deck + " (" + c.parafPilar + " un; preço do M20, a favor)", c.parafPilar, "chumb20");
    });
    (DK && DK.amarracao || []).forEach(function (a) { L(cx(), "Amarração do deck " + a.deck + " à edificação: chumbadores/parafusos Ø" + Math.round(a.d * 1000) + " inox com ancoragem química (preço do M20, a favor)", a.n, "chumb20"); L(cx(), "Chapas de apoio inox " + Math.round(a.ladoM * 1000) + "×" + Math.round(a.ladoM * 1000) + "×8 mm da amarração do deck " + a.deck, a.n * a.kgUn, "inox_kg"); });
    etapa = "06 SERVIÇOS GERAIS E ADMINISTRAÇÃO LOCAL";
    L("06.01", "Andaime (" + mesesAnd + " meses)", areaAnd * mesesAnd, "andaime_m2mes");
    L("06.02", "Montagem e desmontagem do andaime", areaAnd, "andaime_mont");
    L("06.03", "Encarregado de carpintaria (" + prazo + " semanas)", hEnc, "encarregado_h");
    L("06.04", "Acompanhamento técnico do engenheiro (20 % do prazo)", hEng, "engenheiro_h");
    L("06.05", "Mobilização, desmobilização e canteiro", 1, "mobilizacao");
    L("06.06", "ART de execução", 1, "art");

    var cd = r(itens.reduce(function (s, x) { return s + x.total; }, 0), 2), etapas = {};
    itens.forEach(function (x) { etapas[x.etapa] = r((etapas[x.etapa] || 0) + x.total, 2); });
    return { opcao: e.opcao || "A", nome: e.nome || "", itens: itens, etapas: etapas, custo_direto: cd, bdi: bdi, preco: r(cd * (1 + bdi), 2),
      volumes: { mlc: r(vMlc, 3), mlc_torneada: r(vTorn, 3), mlc_tratada: r(vTrat, 3), rolico: r(vRol, 3) }, area_verniz: r(aVerniz, 1),
      adotados: itens.filter(function (x) { return x.adotado; }).length };
  }

  /** ORÇAMENTO DA T2 (casa de duas águas; E4 r2): peças da fonte (madtipologias.T2.fonte) + ligações (madligacoes.pacoteT2 e a base do pacoteT1) → itens. Mesmas regras: todo item com preço, adoção marcada, soma das linhas arredondadas.
   * e = { nome, pecas, params (T2), secoes, ligacoes (base: pacoteT1), ligacoesT2, extras { condutoresM, diariasMunck, prazoSemanas, mesesAndaime }, precos, bdi } */
  function orcarT2(e) {
    e = e || {};
    var pc = e.pecas || [], X = e.extras || {}, sub = e.precos || {}, bdi = e.bdi == null ? BDI_PADRAO : e.bdi, P = e.params || {}, S = e.secoes || {}, LB = e.ligacoes || {}, L2 = (e.ligacoesT2 && e.ligacoesT2.ligacoes) || {};
    var a = P.a || 0, b = P.b || 0, inc = P.incl || 0.3, sc = Math.sqrt(1 + inc * inc), bf = (P.beiral && P.beiral.frente) || 0, bb = (P.beiral && P.beiral.fundo) || 0, be = (P.beiral && P.beiral.esq) || 0, bd = (P.beiral && P.beiral.dir) || 0;
    var nH = Math.max(1, Math.ceil((b / 2) * sc / ((P.cobertura && P.cobertura.sTercaMax) || 1.4) - 1e-9));
    function qm(marca) { var s = 0; pc.forEach(function (p) { if (p.marca === marca) s += p.qtd == null ? 1 : p.qtd; }); return s; }
    function qtd(id) { var s = 0; pc.forEach(function (p) { if (p.id === id) s += p.qtd == null ? 1 : p.qtd; }); return s; }
    var vMlc = 0, aVerniz = 0; pc.forEach(function (p) { if (/MLC/.test(String(p.material || "")) && p.volume_m3) { vMlc += p.volume_m3; aVerniz += areaFaces(p); } });
    var nPil = qm("P") + qm("PO") + qm("PC"), pb = LB.placaBase || { dimensoes_mm: [0, 0], chumbadores: { total: 0 } }, lp = pb.dimensoes_mm[0] / 1000, tpb = (pb.espessura_mm || 25) / 1000, base = LB.base || { n: 0, comprimento: 0, chapa: { largura_mm: 0 } };
    var kgBase = nPil * (lp * lp * tpb * 7850 + 2 * ((base.chapa && base.chapa.largura_mm) || 0) / 1000 * ((base.comprimento || 0) + 0.10) * 0.016 * 7850), nChumb = nPil * ((pb.chumbadores && pb.chumbadores.total) || 0);
    /* multiplicidade de cada ligação (conexões por extremidade de barra) e peso da chapa interna */
    var nTes = qm("BI"), mult = { noBanzoSuperior: nTes * 2, noBanzoInferior: nTes * 4, noPendural: qm("PD") * 4, noDiagonal: qm("DG") * 4, contravDiagonal: (qm("DX") + qm("DV")) * 4, contravParede: qm("DP") * 4, contravLB: qm("LB") * Math.max(0, nTes - 2) * 2, tesouraPilar: nTes * 4, cumeeiraPilar: qm("PC") * 2, frechalPilar: (qm("P") + qm("PO")) * 2 };   /* cada extremidade de barra = grupo de pinos na barra + grupo na peça em que ela se prende; banzos contínuos não têm emenda */
    var nPinos = 0, kgChapa = 0, nWT = 0, nAssento = 0, kgAssento = 0, cintaParaf = 0;
    Object.keys(L2).forEach(function (k) {
      var l = L2[k], m = mult[k] || 0;
      if (l.pinos && l.pinos.ok) { nPinos += m * l.pinos.n; kgChapa += m * 0.008 * Math.max(0.03, (l.chapa ? l.chapa.largura_mm / 1000 : 0.1)) * ((l.pinos.comprimento || 0.2) + 0.05) * 7850; }
      if (l.f90 && l.f90.reforco && m) nWT += m * l.f90.reforco.parafusos;      /* M5 (r14): parafusos de rosca total de reforço ⊥ às fibras contra o fendilhamento (F90) entram no orçamento — antes só terça e caibro */
      if (k === "tercaTesoura") nWT += qm("T") * 4 * l.porApoio + qm("CM") * 4 * l.porApoio;
      if (k === "caibroCumeeira") nWT += qm("CB") * l.porApoio;
      if (k === "caibroFrechal") { nAssento = qm("CB"); kgAssento = nAssento * 0.008 * 0.20 * 0.30 * 7850; cintaParaf = nAssento * l.cinta.parafusos; }
    });
    var mFitaA = 0, mFitaP = 0, nDiag = 0; pc.forEach(function (p) { if (p.id === "FX" || p.id === "FV") { mFitaA += p.qtd || 0; } if (p.id === "FP") { mFitaP += p.qtd || 0; } });
    nDiag = Math.ceil((mFitaA + mFitaP) / (Math.sqrt(Math.pow(Math.max(a / Math.max(1, Math.ceil(a / 4)), 1), 2) + 9) || 4));
    var fitaPar = (L2.fita && L2.fita.parafusosPorPonta) || 8;
    var tir = qm("TI") || 0, ti = pc.filter(function (p) { return p.id === "TI"; })[0];
    var aInc = (a + be + bd) * (((b / 2) + bf) + ((b / 2) + bb)) * sc;
    var prazo = num(X.prazoSemanas, 6), hEnc = num(X.horasEncarregado, prazo * 44), hEng = num(X.horasEngenheiro, Math.round(0.2 * prazo * 44)), areaAnd = num(X.areaAndaime, r(2 * (a + b) * num(X.alturaAndaime, 4.5), 0)), mesesAnd = num(X.mesesAndaime, 2);
    var itens = [], etapa;
    function L(cod, desc, q, chave, obs) { var pr = preco(chave, sub), qq = r(q, 3); itens.push({ etapa: etapa, codigo: cod, descricao: desc, un: pr.un, qtd: qq, pu: pr.pu, total: r(qq * pr.pu, 2), fonte: pr.fonte, chave: chave, adotado: pr.adotado, editado: pr.editado, obs: obs || "" }); }
    etapa = "01 ESTRUTURA DE MADEIRA (MLC)";
    L("01.01", "Fornecimento de MLC GL24h aplainada — pilares, frechais, " + (P.sistema === "cumeeira" ? "viga de cumeeira e caibros" : "tesouras e terças"), vMlc, "mlc");
    L("01.02", "Frete da madeira até a obra", vMlc, "frete");
    L("01.03", "Montagem da estrutura", vMlc, "montagem");
    L("01.04", "Caminhão guindauto para içamento (" + num(X.diariasMunck, 3) + " diárias de 8 h)", num(X.horasMunck, num(X.diariasMunck, 3) * 8), "munck_h");
    L("01.05", "Proteção da madeira aparente: stain/verniz marítimo 3 demãos", aVerniz, "verniz");
    etapa = "02 LIGAÇÕES E FERRAGENS";
    L("02.01", "Peças de aço galvanizado a fogo — bases engastadas dos pilares (placa + chapas em cruz)", kgBase, "aco_galv");
    L("02.02", "Chumbadores M20 inox A4-70 com ancoragem química", nChumb, "chumb20");
    L("02.03", "Pinos inox Ø10–16 dos nós (tesoura / cumeeira / apoio dos pilares); os de Ø10 e Ø12 orçados ao preço do Ø16", nPinos + nPil * (2 * (base.n || 0)), "pino16");
    L("02.04", "Chapas internas de aço inox 8 mm dos nós", kgChapa + kgAssento, "inox_kg");
    L("02.05", "Parafusos SFS WT-T 8,2×300 (terça/caibro nos apoios) e cintas do assento deslizante", nWT + cintaParaf, "wt300");
    var fitaRazao = S.FT ? (S.FT.b * S.FT.e) / (0.06 * 0.002) : 1;      /* a fita é dimensionada pela rigidez K_br,1 (6.6.2): orçada em metros EQUIVALENTES de 60×2 (preço por kg) */
    if ((mFitaA + mFitaP) > 0) {
    L("02.06", (S.FT ? "Fita/chapa de aço do contraventamento (águas, planos verticais e paredes)" : "Fita de aço do contraventamento das paredes (as águas e os planos verticais são de MLC: item 01.01)") + (S.FT ? " " + Math.round(S.FT.b * 1000) + "×" + String(S.FT.e * 1000).replace(".", ",") + " mm, orçada em m equivalentes de 60×2" : " 60×2"), (mFitaA + mFitaP) * fitaRazao, "fita_m");
    L("02.07", "Parafusos da fita", nDiag * 2 * fitaPar, "fita_paraf");
    L("02.08", "Tensores da fita", nDiag, "tensor");
    }      /* E4 r10: sem fita (águas, verticais e paredes em madeira) as linhas 02.06–02.08 não existem */
    if (tir) L("02.09", "Tirantes de aço (barra roscada) no nível do frechal", tir * Math.PI * Math.pow(((S.TI && S.TI.d) || 0.016), 2) / 4 * 7850 * b, "inox_kg");
    etapa = "03 COBERTURA";
    L("03.01", "Telha cerâmica sobre ripas, fornecida e instalada (área inclinada)", aInc, "telha_cer");
    L("03.02", "Rufos laterais dos oitões", 2 * ((b / 2 + bf) + (b / 2 + bb)) * sc, "rufo");
    L("03.03", "Calhas dos beirais (duas águas)", 2 * (a + be + bd), "calha");
    L("03.04", "Condutores pluviais", num(X.condutoresM, 12), "condutor");
    etapa = "04 SERVIÇOS GERAIS E ADMINISTRAÇÃO LOCAL";
    L("04.01", "Andaime (" + mesesAnd + " meses)", areaAnd * mesesAnd, "andaime_m2mes");
    L("04.02", "Montagem e desmontagem do andaime", areaAnd, "andaime_mont");
    L("04.03", "Encarregado de carpintaria (" + prazo + " semanas)", hEnc, "encarregado_h");
    L("04.04", "Acompanhamento técnico do engenheiro (20 % do prazo)", hEng, "engenheiro_h");
    L("04.05", "Mobilização, desmobilização e canteiro", 1, "mobilizacao");
    L("04.06", "ART de execução", 1, "art");
    var cd = r(itens.reduce(function (s, x) { return s + x.total; }, 0), 2), etapas = {};
    itens.forEach(function (x) { etapas[x.etapa] = r((etapas[x.etapa] || 0) + x.total, 2); });
    return { opcao: e.opcao || "T2", nome: e.nome || "", itens: itens, etapas: etapas, custo_direto: cd, bdi: bdi, preco: r(cd * (1 + bdi), 2), volumes: { mlc: r(vMlc, 3) }, area_verniz: r(aVerniz, 1), area_telhado_m2: r(aInc, 2),
      adotados: itens.filter(function (x) { return x.adotado; }).length,
      pendencias: ["Preço da telha cerâmica = o da telha PIR do banco (o mais alto; sem referência cerâmica publicada nesta base) — substituir pelo da obra.", "Ripas, caibrinhos e cumeeira cerâmica dentro do preço da telha; caibros secundários não modelados.", "Fundação e vedações fora do escopo da madeira."] };
  }

  /** semente para o módulo Orçamentos: etapas e itens com preço e fonte (a tela faz Orcamento.novo/addEtapa/addItem) */
  function paraOrcamento(O) {
    var porEtapa = {}, ordem = [];
    O.itens.forEach(function (x) {
      if (!porEtapa[x.etapa]) { porEtapa[x.etapa] = []; ordem.push(x.etapa); }
      if (x.qtd > 0) porEtapa[x.etapa].push({ codigo: "", descricao: x.descricao + (x.adotado ? " [adoção RA — confirmar]" : ""), unidade: x.un, quantidade: x.qtd, custoUnitario: x.pu, fonte: x.fonte, adotado: x.adotado });
    });
    return { nome: "Estrutura de madeira" + (O.nome ? " — " + O.nome : "") + " (opção " + O.opcao + ")", bdi: O.bdi, etapas: ordem.map(function (n) { return { nome: n, itens: porEtapa[n] }; }).filter(function (et) { return et.itens.length; }) };
  }

  var MadOrcamento = { PRECOS: PRECOS, BDI_PADRAO: BDI_PADRAO, orcar: orcar, orcarT2: orcarT2, paraOrcamento: paraOrcamento, preco: preco, areaFaces: areaFaces };
  if (typeof module !== "undefined" && module.exports) module.exports = MadOrcamento;
  else global.MadOrcamento = MadOrcamento;
})(typeof window !== "undefined" ? window : this);
