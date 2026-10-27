/* =====================================================================
 * incauto.js — "LANÇAR EXTINTORES, PLACAS E LUMINÁRIAS DE EMERGÊNCIA" (um clique, 21/10/2026). Motor PURO, ES5, Node-testável.
 *
 * Pela classificação da edificação (js/incregras.js: divisão, altura, área, carga de incêndio → risco) e pela REDE DE CAMINHAMENTO do
 * pavimento (js/incgeo.js), lança na face das paredes:
 *   EXTINTOR (IT 16)   1 a ≤ 10 m (percurso) de cada entrada do pavimento (5.2.2.9); depois o que falta para TODO ponto do pavimento
 *                      ficar a ≤ distância máxima da Tabela 4 (classe A pelo risco) — 5 da Tabela 5 (classe B) em garagem; pó ABC
 *                      (6.2.1, 6.2.1.2), capacidade pelo risco (2-A baixo; 3-A médio/alto); alça a 1,50 m (≤ 1,60, critério RA), base ≥ 0,20;
 *                      nunca em escada (5.2.2.3); placa E5 com a base a 1,80 m logo acima (IT 15 6.1.4); E12 no piso em garagem (6.1.4 d).
 *   PLACA DE SAÍDA     S12 acima de cada porta de saída, a base a 0,05 m da verga (≤ 0,10 m, IT 15 6.1.3 a); tamanho pela distância de
 *                      leitura (A ≥ L²/2000, Anexo A).
 *   ORIENTAÇÃO         S1/S2 a 1,80 m nas paredes da ROTA (circulação e o ambiente da saída) até todo ponto da rota ficar a ≤ 15 m de percurso
 *                      de uma placa (6.1.3 b) — salvo a isenção do térreo com percurso < 15 m (6.1.3.5: "saída visível" a conferir).
 *   LUMINÁRIA          na rota e nos ambientes de permanência (fora sanitário, depósito e técnico): até todo ponto ficar a ≤ 7,5 m de uma
 *                      luminária (critério RA de lançamento: garante os "15 m ponto a ponto" da IT 13 5.4 também nas rotas) e uma junto de cada porta de saída (NBR 10898:2023 5.1.2 a —
 *                      cópia não licenciada); a 2,30 m (critério RA), 30 V (IT 13 5.5). Lux e autonomia: PENDENTES (NBR 10898).
 * IDEMPOTENTE: o que já existe (de qualquer origem: extintor do Hidro, peça "extintor", placa/luminária posta à mão) conta para a cobertura;
 *   rodar de novo não duplica. UM lote (um Ctrl+Z). Nunca na varredura de porta nem no vão.
 *   IncAuto.gerar({ estado, avaliarFam, dados, so: ["extintor","saida","orientacao","luminaria"] | null, pav }) → { ok, lote, ops, itens[], avisos[], pendencias[], classe }
 *   IncAuto.leitura(estado, avaliarFam, dados) → o modelo lido (pavimentos, redes, saídas, equipamentos existentes) — o auditor usa a MESMA
 * Teste: node tools/test-inc-acs.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function RG() { return dep("IncRegras", "./incregras.js"); }
  function GEO() { return dep("IncGeo", "./incgeo.js"); }
  function EA() { return dep("EsqAuto", "./esqauto.js"); }
  function ER() { return dep("EsqRegras", "./esqregras.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return v != null && v !== "" && typeof v !== "boolean" && isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  function dist(a, b) { var dx = a[0] - b[0], dz = a[1] - b[1]; return Math.sqrt(dx * dx + dz * dz); }
  function add(a, b, k) { return [a[0] + b[0] * k, a[1] + b[1] * k]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }

  /* critérios RA (editáveis; nunca são da norma) */
  var CRIT = {
    alcaExtintor: { valor: 1.50, nivel: "C", rotulo: "Altura da alça do extintor", fonte: "critério RA (a IT 16 5.2.2.2 limita a 1,60 m)" },
    folgaVao: { valor: 0.15, nivel: "C", rotulo: "Folga da peça até o vão de porta/janela", fonte: "critério RA" },
    passoParede: { valor: 0.50, nivel: "C", rotulo: "Passo dos candidatos na parede", fonte: "critério RA (posições testadas)" },
    alturaLuminaria: { valor: 2.30, nivel: "C", rotulo: "Altura da luminária de emergência", fonte: "critério RA (abaixo de 2,5 m: 30 V, IT 13 5.5)" },
    raioLuminaria: { valor: 7.5, nivel: "C", rotulo: "Lançamento: todo ponto a até 7,5 m de uma luminária", fonte: "critério RA de LANÇAMENTO (a IT 13 5.4 limita a 15 m o espaçamento entre pontos; cobrir a 7,5 m garante os 15 m também ao longo das rotas). O auditor confere o texto: 15 m entre vizinhas" },
    folgaVerga: { valor: 0.05, nivel: "C", rotulo: "Base da placa de saída acima da verga", fonte: "critério RA (a IT 15 6.1.3 a pede no máximo 0,10 m)" },
    pertoPorta: { valor: 1.50, nivel: "C", rotulo: "Luminária \"junto\" da porta de saída", fonte: "critério RA (NBR 10898:2023 5.1.2 a não dá a distância)" }
  };
  /* tipos de ambiente (js/esqregras.js) */
  var ROTA = { circulacao: 1, escada: 1 };
  var SEM_LUZ = { banheiro: 1, lavabo: 1, despensa: 1, tecnico: 1, poco: 1 };
  var MAX_CAND = 300;   /* teto de candidatos por cobertura (tempo de cálculo; não é norma) */
  var RISCO_ESPECIAL = /(casa de (maquinas|bombas|forca|caldeira)|gerador|subestacao|transformador|quadro de (forca|energia|baixa tensao)|sala eletrica|sala de quadros|telefonia|cabine)/;

  function ehExtintor(fid, peca) { return /extintor/i.test(txt(fid)) || peca === "extintor"; }

  /* ---------------------------------------------------------------- LEITURA (lançador e auditor) */
  function leitura(estado, avaliarFam, dados) {
    var E = EA(), G = GEO(), R = RG(), ESQ = ER(), L = E.leitura(estado, avaliarFam);
    function aval(f) { try { return typeof avaliarFam === "function" ? avaliarFam(f.famId, f.tipoId, f.inst) : null; } catch (e) { return null; } }
    var pavs = arr(L.pavimentos).length ? L.pavimentos : [{ nome: "Térreo", cota: 0 }];
    var chao = num(pavs[0].cota, 0);
    function pavDe(y) { var k = 0; pavs.forEach(function (p, i) { if (y >= num(p.cota, 0) - 0.3) k = i; }); return k; }
    function ambDe(p, pav) { for (var i = 0; i < L.ambientes.length; i++) { var b = L.ambientes[i]; if (b.pav === pav && E.dentro(p, b.pts)) return b; } return null; }
    L.ambDe = ambDe; L.pavDe = pavDe;
    L.ambientes.forEach(function (a) { a.norm = ESQ ? ESQ.normalizar(a.nome) : txt(a.nome).toLowerCase(); a.especial = RISCO_ESPECIAL.test(a.norm); a.acessivel = /\b(pne|pcd|acessivel)\b/.test(a.norm); });
    /* equipamentos que já existem */
    L.extintores = []; L.placas = []; L.luminariasEm = [];
    arr(estado && estado.familias).forEach(function (f) {
      if (!f || f.id == null) return;
      var fid = txt(f.famId), av = aval(f), va = (av && av.valores) || {}, p = [num(f.x, 0), num(f.z, 0)], y = num(f.y, 0), pav = pavDe(y), rot = num(f.rotY, 0), fr = [Math.sin(rot), Math.cos(rot)];
      var base = { id: String(f.id), famId: fid, tipoId: txt(f.tipoId), p: p, y: y, pav: pav, rotY: rot, dir: fr, va: va, inst: f.inst || {}, auto: /^inc-/.test(String(f.id)) };
      var amb = ambDe(add(p, fr, 0.15), pav) || ambDe(p, pav);
      base.amb = amb ? amb.id : null;
      if (ehExtintor(fid)) { base.alca = num(va.Altura_alca, null); base.baseExt = num(va.Base, null); base.cap = txt(va.Capacidade_extintora); base.agente = txt(va.Agente); base.classe = txt(va.Classe); L.extintores.push(base); }
      else if (fid === "inc-placa") { base.funcao = txt(va.Funcao); base.cod = txt(va.Codigo_simbolo); base.baseH = num(va.Altura_base, 1.8); base.larg = num(va.Largura, 0); base.alt = num(va.Altura, 0); base.leitura = num(va.Distancia_leitura, 4); base.areaMin = num(va.Area_minima, 0); L.placas.push(base); }
      else if (fid === "inc-luminaria" || /emergencia|emergência/i.test(fid)) { base.h = num(va.Altura_montagem, 2.3); base.tensao = num(va.Tensao_V, null); base.fluxo = num(va.Fluxo_lm, 0); L.luminariasEm.push(base); }
    });
    arr(estado && estado.instalacoes && estado.instalacoes.pecas).forEach(function (k) {
      if (!k || !ehExtintor("", k.peca)) return;
      var p = [num(k.x, 0), num(k.z, 0)], pav = pavDe(num(k.y, 0)), amb = ambDe(p, pav);
      L.extintores.push({ id: String(k.id), famId: "peca:extintor", p: p, y: num(k.y, 0), pav: pav, rotY: num(k.rotY, 0), dir: [Math.sin(num(k.rotY, 0)), Math.cos(num(k.rotY, 0))], va: {}, amb: amb ? amb.id : null, alca: null, baseExt: num(k.alturaPiso, null),
        /* extintor lancado pelo Hidro: po ABC com a capacidade que o Hidro calculou e gravou na peca. Projeto ANTIGO (sem o campo): conta pela distancia como po ABC
           da menor capacidade da IT 16 Tabela 1 e o auditor avisa com Corrigir "trocar pela familia inc-extintor" (revisao 27/10/2026) */
        cap: txt(k.capacidade) || R.capacidadeMinimaABC(), agente: "Pó ABC", classe: "ABC", peca: true, legado: !txt(k.capacidade) });
    });
    /* SAÍDAS de cada pavimento: no mais baixo, as portas em parede EXTERNA (saída para o exterior); nos de cima, a escada */
    L.saidas = {}; L.redes = {};
    pavs.forEach(function (pv, ip) {
      var s = [];
      L.vaos.forEach(function (v) {
        if (v.tipo !== "porta" || v.pav !== ip) return;
        var w = L.porParede[v.parede]; if (!w) return;
        var dono = null, tr0 = null;
        L.ambientes.forEach(function (a) { a.trechos.forEach(function (tr) { if (!dono && tr.paredeId === v.parede && tr.vizinho == null && v.t >= tr.t0 - 0.05 && v.t <= tr.t1 + 0.05) { dono = a; tr0 = tr; } }); });
        if (!dono) return;
        var n = E.eixoN(w.rotY), dentroDir = [n[0] * tr0.lado, n[1] * tr0.lado], c = E.ptParede(w, v.t, 0);
        s.push({ id: v.id, v: v, w: w, amb: dono, lado: tr0.lado, dirIn: dentroDir, centro: c, interno: add(c, dentroDir, w.espessura / 2 + 0.25), final: ip === 0 });
      });
      if (ip > 0) {
        L.ambientes.forEach(function (a) { if (a.pav === ip && a.tipo.id === "escada") s.push({ id: "escada:" + a.id, amb: a, interno: [a.cx, a.cz], escada: true, final: false }); });
        arr(estado && estado.caixas).forEach(function (c) {
          if (!c || c.tipo !== "escada" || !c.escada) return;
          var b = num(c.escada.par && c.escada.par.base, num(c.cy, 0) - num(c.altura, 0) / 2), d = num(c.escada.par && c.escada.par.desnivel, num(c.altura, 0));
          if (Math.abs(b + d - num(pv.cota, 0)) < 0.35 || Math.abs(b - num(pv.cota, 0)) < 0.35) s.push({ id: "escada:" + c.id, interno: [num(c.cx, 0), num(c.cz, 0)], escada: true, final: false, caixa: c.id });
        });
      }
      L.saidas[ip] = s;
    });
    L.pavs = pavs; L.chao = chao;
    L.rede = function (ip) { if (!L.redes[ip]) L.redes[ip] = G.rede(L, ip) || false; return L.redes[ip] || null; };
    return L;
  }

  /* o modelo medido para a classificação: altura (IT 01 E.4), área e população (IT 08 Tabela 4) */
  function medidasDoModelo(L, div) {
    var R = RG(), pavsCom = {}, area = 0, pop = 0, popPend = false, porAmb = {}, usadas = {}, areaPar = 0;
    L.ambientes.forEach(function (a) { pavsCom[a.pav] = 1; area += num(a.area, 0); arr(a.trechos).forEach(function (tr) { usadas[tr.paredeId] = 1; }); });
    /* ÁREA TOTAL (IT 01 E.5 = área CONSTRUÍDA): a soma dos ambientes é a área ÚTIL — 6 a 10 % menor. Perto dos limites (200 m² da isenção
       da iluminação, A.4.5; 200/930 m² do nível de risco) a útil isentava o que a construída exige (revisão 21/10/2026). Soma-se a projeção
       das paredes que fecham os ambientes (comprimento × espessura; o canto conta duas vezes — lado seguro). */
    arr(L.paredes).forEach(function (w) { if (usadas[w.id] && pavsCom[w.pav]) areaPar += num(w.comprimento, 0) * num(w.espessura, 0); });
    var areaUtil = area; area += areaPar;
    var ks = Object.keys(pavsCom).map(Number).sort(function (a, b) { return a - b; }), top = ks.length ? ks[ks.length - 1] : 0;
    var H = ks.length ? num(L.pavs[top].cota, 0) - num(L.pavs[ks[0]].cota, 0) : 0;
    if (div) L.ambientes.forEach(function (a) { var q = R.populacao(div, { tipoId: a.tipo.id, area: a.area, nome: a.nome }); porAmb[a.id] = q; if (q.p == null) popPend = true; else pop += q.p; });
    return { altura: H, area: area, areaUtil: areaUtil, areaParedes: areaPar, terrea: ks.length <= 1, populacao: div && !popPend ? pop : null, populacaoPend: popPend, porAmb: porAmb, pavimentos: ks };
  }

  /* ---------------------------------------------------------------- CANDIDATOS na face das paredes */
  /* h, h1: a FAIXA de altura que a peça ocupa na parede (revisão 21/10/2026). Antes era um ponto só (o extintor testava 1,00 m): a janela
     alta de peitoril 1,30 não barrava e o cilindro (0,95–1,50) e a placa E5 (1,80–2,00) iam para cima do vidro. Sem h1 = o ponto h. */
  function candidatos(L, estado, avaliarFam, ip, filtroAmb, h, h1) {
    var E = EA(), out = [], passo = CRIT.passoParede.valor, folga = CRIT.folgaVao.valor, hT = h1 == null ? h : h1;
    L.ambientes.forEach(function (a) {
      if (a.pav !== ip || (filtroAmb && !filtroAmb(a))) return;
      a.trechos.forEach(function (tr) {
        var w = L.porParede[tr.paredeId]; if (!w) return;
        var n = E.eixoN(w.rotY), dirIn = [n[0] * tr.lado, n[1] * tr.lado], rotY = Math.atan2(dirIn[0], dirIn[1]);
        var a0 = tr.t0 + 0.25, b0 = tr.t1 - 0.25; if (b0 < a0) return;
        var nP = Math.max(1, Math.round((b0 - a0) / passo));
        for (var k = 0; k <= nP; k++) {
          var t = a0 + (b0 - a0) * k / nP, P = E.ptParede(w, t, tr.lado * w.espessura / 2);
          if (L.vaos.some(function (v) { return v.parede === w.id && Math.abs(t - v.t) < v.largura / 2 + folga && (h == null || (hT >= v.peitoril - folga && h <= v.peitoril + v.altura + folga) || v.tipo === "porta"); })) continue;
          if (naVarredura(L, P, ip)) continue;
          out.push({ amb: a, tr: tr, w: w, t: r4(t), P: P, dir: dirIn, rotY: r4(rotY), dentro: add(P, dirIn, 0.15) });
        }
      });
    });
    return out;
  }
  /* o ponto está na varredura (quarto de círculo) de alguma porta de giro? */
  function naVarredura(L, P, ip) {
    var E = EA();
    for (var i = 0; i < L.vaos.length; i++) {
      var d = L.vaos[i]; if (d.tipo !== "porta" || d.correr || d.pav !== ip) continue;
      var wd = L.porParede[d.parede]; if (!wd) continue;
      var u = E.eixoU(wd.rotY), n = E.eixoN(wd.rotY), sH = d.maoDireita ? 1 : -1, lado = d.abreFora ? 1 : -1;
      var H = E.ptParede(wd, d.t + sH * d.folha / 2, lado * wd.espessura / 2), dF = [-sH * u[0], -sH * u[1]], dA = [lado * n[0], lado * n[1]];
      var q = sub(P, H), x = dot(q, dF), y = dot(q, dA);
      if (x >= -0.12 && y >= -0.05 && x * x + y * y <= (d.folha + 0.1) * (d.folha + 0.1) && x <= d.folha + 0.1) return true;
      /* ATRÁS DA FOLHA ABERTA (revisão 21/10/2026): aberta até encostar na parede, a folha cobre a face do lado da dobradiça por um
         comprimento de folha — o extintor ou a placa ali some atrás da porta. Faixa da face (|y| ≤ 0,30) até folha + 0,10 m. */
      if (x < 0 && x >= -(d.folha + 0.1) && y >= -0.05 && y <= 0.30) return true;
    }
    return false;
  }

  /* ---------------------------------------------------------------- COBERTURA GULOSA */
  /* alvo = lista de células; existentes = [[x,z]…]; cands = candidatos; raio = alcance pelo percurso. Devolve os candidatos escolhidos. */
  function cobrir(Rd, alvo, existentes, cands, raio, opc) {
    var G = GEO(), cont = {}, i, k; opc = opc || {};
    /* prédio grande: no máximo MAX_CAND candidatos (amostra a passo fixo na ordem das paredes) — cada um custa um Dijkstra */
    if (cands.length > MAX_CAND) { var pc = Math.ceil(cands.length / MAX_CAND); cands = cands.filter(function (c0, j) { return j % pc === 0; }); }
    alvo.forEach(function (c) { cont[c] = 0; });
    /* existente = [x, z] (alcança o raio) ou { p, r } (alcance próprio: a placa só orienta até onde é legível) */
    existentes.forEach(function (q) { var p = q && q.p ? q.p : q, r = q && q.r != null ? Math.min(raio, q.r) : raio, d = G.distancias(Rd, [p], r); alvo.forEach(function (c) { if (d[c] <= r) cont[c]++; }); });
    var D = cands.map(function (c) { var cel = G.celula(Rd, c.dentro, 0.6); return cel ? G.distancias(Rd, [cel], raio) : null; });
    var esc = [], usados = {};
    for (var volta = 0; volta < cands.length; volta++) {
      var falta = alvo.filter(function (c) { return !cont[c]; }); if (!falta.length) break;
      var mk = -1, mg = 0;
      for (k = 0; k < cands.length; k++) {
        if (usados[k] || !D[k]) continue;
        var g = 0; for (i = 0; i < falta.length; i++) if (D[k][falta[i]] <= raio) g++;
        if (opc.peso) g = g * opc.peso(cands[k]);
        if (g > mg + 1e-9) { mg = g; mk = k; }
      }
      if (mk < 0) break;
      usados[mk] = 1; esc.push(cands[mk]);
      alvo.forEach(function (c) { if (D[mk][c] <= raio) cont[c]++; });
    }
    return { escolhidos: esc, descobertas: alvo.filter(function (c) { return !cont[c]; }) };
  }

  /* ---------------------------------------------------------------- SUGERIR A DIVISÃO (casa não pode virar "prédio") */
  /* Sem a divisão o auditor não audita nada — e o erro tem de ter saída. Lê os TIPOS DOS AMBIENTES do modelo (js/esqregras.js) e propõe,
     com a confiança, a divisão do Decreto 47.998/2020 (Anexo): só ambientes domésticos, com dormitório e UMA cozinha → A-1 (residência
     unifamiliar, isenta — CBMMG IT 01 A.4.1); duas ou mais cozinhas com dormitórios → pode ser multifamiliar (A-2). Qualquer ambiente de
     outro uso (escritório isolado, comércio, "sem tipo") → nenhuma sugestão: a divisão é decisão do RT. NUNCA grava sozinho: a sugestão
     chega como "Corrigir" (dados.divisao) e o usuário clica; desfazer = voltar em Dados da edificação. Fonte do que cada tipo é: o nome
     do ambiente (sinônimos do js/esqregras.js), não a forma da planta. */
  var DOMESTICO = { sala_estar: 1, sala_jantar: 1, cozinha: 1, area_servico: 1, suite: 1, dormitorio: 1, escritorio: 1, area_gourmet: 1, despensa: 1, banheiro: 1, lavabo: 1, circulacao: 1, escada: 1, varanda: 1, garagem: 1, tecnico: 1, poco: 1 };
  function sugerirDivisao(L) {
    var amb = arr(L && L.ambientes), cont = {}, fora = [];
    if (!amb.length) return { sugestoes: [], motivo: "Não há ambiente delimitado no modelo." };
    amb.forEach(function (a) { var t = a.tipo && a.tipo.id; cont[t] = (cont[t] || 0) + 1; if (!DOMESTICO[t]) fora.push(a.nome || t); });
    var dorm = (cont.dormitorio || 0) + (cont.suite || 0), coz = cont.cozinha || 0, pav = {}; amb.forEach(function (a) { pav[a.pav] = 1; });
    var npav = Object.keys(pav).length, terrea = npav <= 1;
    if (fora.length) return { sugestoes: [], motivo: "Há ambiente que não é de uso doméstico (" + fora.slice(0, 4).join(", ") + "): a divisão é decisão do RT." };
    if (!dorm) return { sugestoes: [], motivo: "Sem dormitório no modelo: não dá para presumir moradia." };
    var out = [];
    if (coz <= 1) out.push({ divisao: "A-1", confianca: coz === 1 ? "alta" : "média", motivo: dorm + " dormitório(s), " + coz + " cozinha, só ambientes domésticos, " + (terrea ? "térrea" : npav + " pavimentos") + " — residência unifamiliar" + (cont.area_gourmet ? " (a área gourmet: confirme que não é salão de festas de condomínio, IT 01 A.4.1.1)" : "") });
    else out.push({ divisao: "A-2", confianca: "média", motivo: coz + " cozinhas e " + dorm + " dormitórios: pode ser habitação multifamiliar; se for uma casa só, mude para A-1" });
    return { sugestoes: out, motivo: "" };
  }
  /* aplica uma solução de DADOS (Corrigir que não mexe no modelo, só em Dados da edificação): devolve os dados novos, sem mutar. Mudar a divisão
     apaga a atividade (a lista de atividades da IT 09 é por divisão) — o mesmo que a tela faz ao trocar o campo. */
  function aplicarDados(dados, sol) {
    var out = {}, k; dados = dados || {};
    for (k in dados) if (Object.prototype.hasOwnProperty.call(dados, k)) out[k] = dados[k];
    var d = sol && sol.dados ? sol.dados : {};
    for (k in d) if (Object.prototype.hasOwnProperty.call(d, k)) out[k] = d[k];
    if (d.divisao != null && d.divisao !== dados.divisao && d.atividade == null) delete out.atividade;
    return out;
  }

  /* ---------------------------------------------------------------- GERAR */
  function gerar(o) {
    o = o || {};
    var R = RG(), G = GEO(), est = o.estado, aval = o.avaliarFam, dados = o.dados || {};
    var L = o.L || leitura(est, aval, dados), med = medidasDoModelo(L, txt(dados.divisao).toUpperCase());
    var K = R.classificar(dados, med), so = o.so ? o.so : null;
    function quer(x) { return !so || so.indexOf(x) >= 0; }
    var ops = [], itens = [], avisos = [], pend = K.pendencias.slice(), usados = {};
    arr(est && est.familias).forEach(function (f) { if (f) usados[String(f.id)] = 1; });
    arr(est && est.caixas).forEach(function (c) { if (c) usados[String(c.id)] = 1; });
    arr(est && est.instalacoes && est.instalacoes.pecas).forEach(function (k) { if (k) usados[String(k.id)] = 1; });
    function novoId(pref) { var k = 1, id = pref + "-1"; while (usados[id]) id = pref + "-" + (++k); usados[id] = 1; return id; }
    if (!L.ambientes.length) return { ok: false, motivo: "Não há ambiente delimitado no modelo: lance os ambientes (Arquitetura › Ambiente) e rode de novo.", ops: [], itens: [], avisos: [], pendencias: pend, classe: K };
    /* SEM A DIVISÃO NÃO LANÇA (revisão 21/10/2026): o "lado seguro" punha extintor, placas e luminária numa CASA (A-1 é isenta, IT 01 A.4.1)
       e o orçamento cobrava. Sem a divisão não se sabe o que a IT 01 exige — o usuário informa e roda de novo. */
    if (!K.divisao) return { ok: false, motivo: "Informe a divisão de ocupação em Dados da edificação (Decreto 47.998/2020, Anexo): sem ela não se sabe o que a IT 01 exige (residência unifamiliar, A-1, é isenta — IT 01 A.4.1). Nada lançado.", ops: [], itens: [], avisos: [], pendencias: pend, classe: K };
    if (K.isentaA1) return { ok: true, lote: null, ops: [], itens: [], avisos: ["Residência unifamiliar (A-1): isenta das medidas de segurança contra incêndio (CBMMG IT 01 A.4.1) — não depende de área nem de altura. Nada lançado."], pendencias: pend, classe: K, medidas: med, criterios: CRIT, resumo: { extintores: 0, placas: 0, luminarias: 0 } };   /* resumo: a tela (js/incacsui.js) lê z.extintores — sem ele, "Lançar" numa casa quebrava com TypeError */
    var pavsAlvo = o.pav != null ? [Number(o.pav)] : med.pavimentos;
    var rk = K.risco.risco, extA = R.extintor(rk, "A"), extB = R.extintor(rk === "alto" ? "alto" : rk, "B");
    var tipoExt = rk === "baixo" ? "abc4" : "abc6-3a";
    /* capacidade do rótulo: A ("2-A", "3-A") e B ("40-B"). CO2/pó BC não têm A (0); sem rótulo = desconhecida (null) — nenhum dos dois cobre a classe A (IT 16 Tabela 4; revisão 27/10/2026) */
    function capAx(e) { var m = /(\d+)\s*-\s*A/i.exec(txt(e.cap)); return m ? Number(m[1]) : null; }
    function capBx(e) { var m = /(\d+)\s*-\s*B/i.exec(txt(e.cap)); return m ? Number(m[1]) : null; }
    var capBmin = Number((/(\d+)/.exec(extB.capacidade) || [0, 0])[1]);
    var entradaMax = R.EXT.entrada().valor, alca = CRIT.alcaExtintor.valor;
    /* a faixa da parede que o extintor ocupa: do pé do cilindro (alça − 0,55 m, altura de desenho da família) ao topo da placa E5 (1,80 + 0,20) */
    var faixaExt = [alca - 0.55, R.SIN.equipamento().valor + 0.20];

    function placaPara(L0) { var A = R.placaAreaMinima(L0).area; return A <= 0.26 * 0.13 + 1e-9 ? "26x13" : "40x20"; }
    function opPlaca(c, tipo, hBase, leituraL, extra, regra) {
      var id = novoId("inc-pl"), pt = add(c.P, c.dir, 0.005);
      var inst = { Altura_base: r4(hBase), Distancia_leitura: r4(Math.max(4, leituraL)) }; Object.keys(extra || {}).forEach(function (k) { inst[k] = extra[k]; });
      ops.push({ op: "familia", id: id, famId: "inc-placa", tipoId: tipo, x: r4(pt[0]), y: r4(c.amb.base), z: r4(pt[1]), rotY: c.rotY, inst: inst });
      itens.push({ id: id, tipo: "placa", tipoId: tipo, ambiente: c.amb.id, ambienteNome: c.amb.nome, altura: r4(hBase), regras: [regra] });
      return id;
    }
    function leituraDe(p, amb) { var m = 0; arr(amb && amb.pts).forEach(function (q) { m = Math.max(m, dist(p, q)); }); return Math.min(30, m); }

    pavsAlvo.forEach(function (ip) {
      var Rd = L.rede(ip); if (!Rd) { pend.push({ codigo: "INC_REDE", texto: "Pavimento " + (L.pavs[ip] ? L.pavs[ip].nome : ip) + " sem ambiente delimitado: nada lançado.", fonte: "" }); return; }
      var sai = arr(L.saidas[ip]), nomePav = L.pavs[ip] ? L.pavs[ip].nome : "pavimento " + (ip + 1);
      var ambPor = {}; L.ambientes.forEach(function (a) { ambPor[a.id] = a; });
      var celAmb = Rd.lista.filter(function (c) { var a = ambPor[Rd.amb[c]]; return !!a; });

      /* ---------- EXTINTORES */
      if (quer("extintor") && K.exige.extintores.exige) {
        var exTodos = L.extintores.filter(function (e) { return e.pav === ip; });
        var ex = exTodos.map(function (e) { return add(e.p, e.dir, 0.15); });
        var naoEscada = function (a) { return a.tipo.id !== "escada" && a.tipo.id !== "banheiro" && a.tipo.id !== "lavabo" && !a.especial; };
        var cands = candidatos(L, est, aval, ip, naoEscada, faixaExt[0], faixaExt[1]);
        var pesoCirc = function (c) { return c.amb.tipo.id === "circulacao" ? 1.25 : 1; };
        var novos = [];
        /* 1) a ≤ 10 m de cada entrada do pavimento (IT 16 5.2.2.9) */
        sai.forEach(function (s) {
          if (!s.interno) return;
          var dS = G.distancias(Rd, [s.interno], entradaMax);
          var tem = ex.concat(novos.map(function (c) { return c.dentro; })).some(function (p) { var cl = G.celula(Rd, p, 0.6); return cl && dS[cl.i] <= entradaMax; });
          if (tem) return;
          var best = null, bd = Infinity;
          cands.forEach(function (c) { var cl = G.celula(Rd, c.dentro, 0.6); if (!cl) return; var d = dS[cl.i]; if (d <= entradaMax && d < bd) { bd = d; best = c; } });
          if (best) novos.push(best); else avisos.push("Sem parede livre a ≤ " + entradaMax + " m da entrada " + s.id + " para o extintor (" + nomePav + ").");
        });
        /* 2) cobertura: todo ponto a ≤ distância máxima (classe A pelo risco; B em garagem) */
        var temGaragem = celAmb.some(function (c) { return ambPor[Rd.amb[c]].tipo.id === "garagem"; }), exigeB = temGaragem && rk !== "baixo", raio = temGaragem ? Math.min(extA.distancia, extB.distancia) : extA.distancia;
        /* a cobertura de classe A só conta extintor com "n-A" no rótulo (CO2/BC e sem rótulo não contam) e, com garagem em risco médio/alto, com classe B ≥ a da Tabela 5 */
        var exCob = exTodos.filter(function (e) { var ca = capAx(e); return ca != null && ca > 0 && (!exigeB || (capBx(e) || 0) >= capBmin); }).map(function (e) { return add(e.p, e.dir, 0.15); });
        var cob = cobrir(Rd, celAmb, exCob.concat(novos.map(function (c) { return c.dentro; })), cands, raio, { peso: pesoCirc });
        novos = novos.concat(cob.escolhidos);
        if (!ex.length && !novos.length && cands.length) novos.push(cands[0]);   /* 6.2.1: ≥ 1 por pavimento */
        if (cob.descobertas.length) avisos.push(nomePav + ": " + cob.descobertas.length + " célula(s) sem extintor a ≤ " + raio + " m de percurso mesmo depois do lançamento (sem parede livre perto) — confira no auditor.");
        novos.forEach(function (c) {
          var id = novoId("inc-ext"), pt = add(c.P, c.dir, 0.005);
          var tipoN = exigeB ? "abc-40b" : tipoExt;   /* garagem em risco médio/alto: classe B ≥ 40-B (IT 16 Tabela 5, PDF p.7) — o tipo leva a exigência, fabricante a especificar */
          ops.push({ op: "familia", id: id, famId: "inc-extintor", tipoId: tipoN, x: r4(pt[0]), y: r4(c.amb.base), z: r4(pt[1]), rotY: c.rotY, inst: { Altura_alca: alca } });
          itens.push({ id: id, tipo: "extintor", tipoId: tipoN, ambiente: c.amb.id, ambienteNome: c.amb.nome, altura: alca, regras: ["IT 16 Tabela " + (temGaragem ? "4/5" : "4") + ": risco " + K.risco.rotulo.toLowerCase() + " → " + (tipoExt === "abc4" ? "2-A" : "3-A") + (exigeB ? " e classe B ≥ " + extB.capacidade + " (garagem; especificar o fabricante)" : "") + ", ≤ " + raio + " m de percurso", "IT 16 6.2.1: pó ABC por pavimento", "alça " + f2(alca) + " m (≤ 1,60, IT 16 5.2.2.2; critério RA)"] });
          if (K.exige.sinalizacao.exige) opPlaca(c, "extintor-20x20", R.SIN.equipamento().valor, 4, {}, "IT 15 6.1.4: placa E5 com a base a 1,80 m acima do extintor");
          if (c.amb.tipo.id === "garagem") {
            var idp = novoId("inc-pl"), pp = add(c.P, c.dir, 0.02);
            ops.push({ op: "familia", id: idp, famId: "inc-placa", tipoId: "piso-E12", x: r4(pp[0]), y: r4(c.amb.base), z: r4(pp[1]), rotY: c.rotY, inst: { Altura_base: 0, Distancia_leitura: 4 } });
            itens.push({ id: idp, tipo: "placa", tipoId: "piso-E12", ambiente: c.amb.id, ambienteNome: c.amb.nome, altura: 0, regras: ["IT 15 6.1.4 d): sinalização de piso E12 (1,00 × 1,00 m) em garagem"] });
          }
        });
        /* risco especial: extintor do lado de FORA, junto da porta (IT 16 5.2.2.10) */
        L.ambientes.filter(function (a) { return a.pav === ip && a.especial; }).forEach(function (a) {
          var portaA = L.vaos.filter(function (v) { return v.tipo === "porta" && a.trechos.some(function (tr) { return tr.paredeId === v.parede && v.t >= tr.t0 - 0.05 && v.t <= tr.t1 + 0.05; }); })[0];
          if (!portaA) { avisos.push("\"" + a.nome + "\" (risco especial) sem porta modelada: extintor externo não lançado."); return; }
          var w = L.porParede[portaA.parede], E = EA(), perto = L.extintores.concat([]).some(function (e) { return e.pav === ip && dist(e.p, E.ptParede(w, portaA.t, 0)) <= R.EXT.riscoEspecial().valor; });
          if (perto) return;
          var cs = candidatos(L, est, aval, ip, function (b) { return b.id !== a.id && !b.especial && b.tipo.id !== "escada"; }, faixaExt[0], faixaExt[1]).filter(function (c) { return c.w.id === w.id || dist(c.P, E.ptParede(w, portaA.t, 0)) <= R.EXT.riscoEspecial().valor; });
          cs.sort(function (x, y) { return dist(x.P, E.ptParede(w, portaA.t, 0)) - dist(y.P, E.ptParede(w, portaA.t, 0)); });
          if (!cs.length) { avisos.push("\"" + a.nome + "\": sem parede livre do lado de fora da porta para o extintor de risco especial."); return; }
          var c = cs[0], id = novoId("inc-ext"), pt = add(c.P, c.dir, 0.005);
          ops.push({ op: "familia", id: id, famId: "inc-extintor", tipoId: "co2-6", x: r4(pt[0]), y: r4(c.amb.base), z: r4(pt[1]), rotY: c.rotY, inst: { Altura_alca: alca } });
          itens.push({ id: id, tipo: "extintor", tipoId: "co2-6", ambiente: c.amb.id, ambienteNome: c.amb.nome, altura: alca, regras: ["IT 16 5.2.2.10/5.2.2.11: risco especial (\"" + a.nome + "\") com extintor do lado de fora, junto da porta (classe C não condutor, Tabela 6) — o agente é decisão do RT"] });
        });
      }

      /* ---------- PLACAS DE SAÍDA (acima de cada porta de saída) */
      var placasPav = L.placas.filter(function (p) { return p.pav === ip; });
      var sinaisRota = placasPav.filter(function (p) { return p.funcao === "saida" || p.funcao === "orientacao"; }).map(function (p) { return { p: add(p.p, p.dir, 0.15), r: Math.sqrt(2000 * p.larg * p.alt) }; });
      if (quer("saida") && K.exige.sinalizacao.exige) {
        sai.filter(function (s) { return s.v; }).forEach(function (s) {
          var c0 = s.centro, temSinal = placasPav.some(function (p) { return p.funcao === "saida" && dist(p.p, c0) <= s.v.largura / 2 + 0.4; });
          if (temSinal) return;
          var verga = s.v.peitoril + s.v.altura, hB = verga + CRIT.folgaVerga.valor, P = add(c0, s.dirIn, s.w.espessura / 2);
          var Lr = leituraDe(P, s.amb), tipo = "saida-" + placaPara(Lr);
          var c = { P: P, dir: s.dirIn, rotY: r4(Math.atan2(s.dirIn[0], s.dirIn[1])), amb: s.amb };
          opPlaca(c, tipo, hB, Lr, {}, "IT 15 6.1.3 a): S12 acima da porta de saída, base a " + f2(CRIT.folgaVerga.valor) + " m da verga (≤ 0,10 m); A ≥ L²/2000 com L = " + f2(Math.max(4, Lr)) + " m (Anexo A)");
          sinaisRota.push({ p: add(P, s.dirIn, 0.15), r: tipo === "saida-26x13" ? Math.sqrt(2000 * 0.26 * 0.13) : Math.sqrt(2000 * 0.40 * 0.20) });
          if (R.placaAreaMinima(Lr).area > 0.40 * 0.20 + 1e-9) avisos.push("Porta " + s.id + ": a distância de leitura (" + f2(Lr) + " m) pede placa maior que 0,40 × 0,20 m (A ≥ " + f2(R.placaAreaMinima(Lr).area) + " m²) — sem item nas bases lidas: especificar e cotar.");
        });
      }
      /* ---------- ORIENTAÇÃO DA ROTA */
      var rotaCel = Rd.lista.filter(function (c) { var a = ambPor[Rd.amb[c]]; return a && (ROTA[a.tipo.id] || sai.some(function (s) { return s.amb && s.amb.id === a.id; })); });
      if (quer("orientacao") && K.exige.sinalizacao.exige && sai.length) {
        var dSai = G.distancias(Rd, sai.map(function (s) { return s.interno; }).filter(Boolean)), mx = 0;
        Rd.lista.forEach(function (c) { if (ambPor[Rd.amb[c]] && isFinite(dSai[c])) mx = Math.max(mx, dSai[c]); });
        var isen = R.SIN.isencao();
        if (ip === 0 && mx < isen.valor) avisos.push(nomePav + ": percurso máximo até a saída " + f2(mx) + " m < " + isen.valor + " m — isenção da sinalização de orientação no térreo (" + isen.fonte + "), se a saída for VISÍVEL de todos os pontos (confira).");
        else if (rotaCel.length) {
          var raioO = Math.min(R.SIN.orientacao().valor, Math.sqrt(2000 * 0.40 * 0.20));   /* a placa de 0,40 × 0,20 m é legível até √(2000·A) = 12,6 m (IT 15 Anexo A): o espaçamento segue a legibilidade */
          var candsO = candidatos(L, est, aval, ip, function (a) { return ROTA[a.tipo.id] || sai.some(function (s) { return s.amb && s.amb.id === a.id; }); }, R.SIN.altura().valor, R.SIN.altura().valor + 0.20);
          var cobO = cobrir(Rd, rotaCel, sinaisRota, candsO, raioO);
          cobO.escolhidos.forEach(function (c) {
            var cl = G.celula(Rd, c.dentro, 0.6), seta = "";
            if (cl) { var cam = G.caminho(Rd, dSai, cl.i, 40), ult = cam[Math.min(cam.length - 1, 15)], dv = sub(ult, cam[0]), dirR = [c.dir[1], -c.dir[0]]; seta = dot(dv, dirR) >= 0 ? "direita" : "esquerda"; }
            opPlaca(c, "rota-40x20", R.SIN.altura().valor, raioO, { Seta: seta }, "IT 15 6.1.3 b): orientação S1/S2 a 1,80 m, todo ponto da rota a ≤ " + raioO + " m de percurso de uma placa (seta " + (seta || "a conferir") + ")");
          });
          if (cobO.descobertas.length) avisos.push(nomePav + ": " + cobO.descobertas.length + " célula(s) da rota sem placa de orientação a ≤ " + raioO + " m (sem parede livre) — confira no auditor.");
        }
      }
      /* ---------- LUMINÁRIAS DE EMERGÊNCIA */
      if (quer("luminaria") && K.exige.iluminacao.exige && !K.iluminacaoIsenta) {
        var lumEx = L.luminariasEm.filter(function (l) { return l.pav === ip; }).map(function (l) { return add(l.p, l.dir, 0.15); });
        var alvoL = Rd.lista.filter(function (c) { var a = ambPor[Rd.amb[c]]; return a && !SEM_LUZ[a.tipo.id]; });
        var hL = CRIT.alturaLuminaria.valor, candsL = candidatos(L, est, aval, ip, function (a) { return !SEM_LUZ[a.tipo.id]; }, hL - 0.10, hL + 0.05), novasL = [];
        /* 1) junto de cada porta de saída */
        sai.filter(function (s) { return s.v; }).forEach(function (s) {
          var tem = lumEx.concat(novasL.map(function (c) { return c.dentro; })).some(function (p) { return dist(p, s.interno) <= CRIT.pertoPorta.valor + 0.4; });
          if (tem) return;
          var best = null, bd = Infinity; candsL.forEach(function (c) { var d = dist(c.P, s.centro); if (c.amb.id === s.amb.id && d < bd) { bd = d; best = c; } });
          if (best && bd <= CRIT.pertoPorta.valor + 0.6) novasL.push(best);
        });
        var cobL = cobrir(Rd, alvoL, lumEx.concat(novasL.map(function (c) { return c.dentro; })), candsL, CRIT.raioLuminaria.valor);
        novasL = novasL.concat(cobL.escolhidos);
        novasL.forEach(function (c) {
          var id = novoId("inc-lum"), pt = add(c.P, c.dir, 0.005), hM = Math.min(hL, num(c.amb.pe, 2.6) - 0.15);
          ops.push({ op: "familia", id: id, famId: "inc-luminaria", tipoId: "led30-2w", x: r4(pt[0]), y: r4(c.amb.base), z: r4(pt[1]), rotY: c.rotY, inst: { Altura_montagem: r4(hM) } });
          itens.push({ id: id, tipo: "luminaria", tipoId: "led30-2w", ambiente: c.amb.id, ambienteNome: c.amb.nome, altura: r4(hM), regras: ["IT 13 5.4: até 15 m entre pontos (lançado com todo ponto a ≤ " + f2(CRIT.raioLuminaria.valor) + " m — critério RA de lançamento)", "IT 13 5.5: abaixo de 2,5 m, 30 V", "NBR 10898:2023 5.1.2 a): junto de cada porta de saída (cópia não licenciada — conferir)"] });
        });
        if (cobL.descobertas.length) avisos.push(nomePav + ": " + cobL.descobertas.length + " célula(s) sem luminária a ≤ " + f2(CRIT.raioLuminaria.valor) + " m — confira no auditor.");
        if (novasL.length || lumEx.length) {
          var N10 = R.ILUM.nbr10898;
          pend.push({ codigo: "INC_ILUM_NBR10898", texto: "Iluminância (3 lx plano / 5 lx escada e desnível), autonomia (≥ " + N10.autonomiaMin_h.valor + " h), fluxo do bloco (≥ " + N10.fluxoBlocoMin_lm.valor + " lm) e comutação: NBR 10898 — a IT 13 da biblioteca (1ª ed., Portaria 5/2005) cita a NBR 10898/1999; edição adotada em MG: conferir; os números são da 2023 em cópia não licenciada: conferir no exemplar antes de afirmar \"atende\".", fonte: "CBMMG IT 13 (1ª ed., Portaria 5/2005); " + N10.norma + " " + N10.autonomiaMin_h.item + ", " + N10.iluminanciaPlano_lx.item + ", " + N10.fluxoBlocoMin_lm.item });
        }
      }
    });
    if (K.iluminacaoIsenta) avisos.push("Iluminação de emergência ISENTA: " + K.iluminacaoIsenta.texto + " (" + K.iluminacaoIsenta.fonte + ").");
    var lote = ops.length ? { op: "lote", id: "inc-" + (o.loteId || Date.now().toString(36)), origem: "inc-auto", pedido: "Lançar extintores, placas e luminárias de emergência", ops: ops } : null;
    return { ok: true, lote: lote, ops: ops, itens: itens, avisos: avisos, pendencias: pend, classe: K, medidas: med, criterios: CRIT,
      resumo: { extintores: itens.filter(function (i) { return i.tipo === "extintor"; }).length, placas: itens.filter(function (i) { return i.tipo === "placa"; }).length, luminarias: itens.filter(function (i) { return i.tipo === "luminaria"; }).length } };
  }

  var IncAuto = { leitura: leitura, sugerirDivisao: sugerirDivisao, aplicarDados: aplicarDados, medidasDoModelo: medidasDoModelo, candidatos: candidatos, naVarredura: naVarredura, cobrir: cobrir, gerar: gerar, CRIT: CRIT, ROTA: ROTA, SEM_LUZ: SEM_LUZ };
  global.IncAuto = IncAuto;
  if (typeof module !== "undefined" && module.exports) module.exports = IncAuto;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
