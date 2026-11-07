/* =====================================================================
 * elememorial.js — MEMORIAL DE CÁLCULO E DESCRITIVO da instalação elétrica de baixa tensão (Elétrica v2, lote L5, 06/11/2026).
 * Motor PURO, ES5, sem DOM, Node-testável. Molde: js/hidmemorial.js (capa, seções numeradas, termo do RT).
 *
 *   EleMemorial.gerar(analise, opcoes) → { ok, titulo, secoes: [{ id, titulo, itens[], blocos[] }], html, texto, pendencias[], situacao, indefinidos }
 *       analise = EleCircuitos.analisar(...)  (a MESMA que alimenta as pranchas — um cálculo, um número)
 *       opcoes  = { obra, proprietario, contratante, local, empresa (texto ou objeto { nome, cnpj }), responsavel, tituloProfissional,
 *                   registro (CREA/CAU), revisao, data, numero, logo (data URL), esquemaAterramento, estado (para ler a Origem do ponto),
 *                   materiais (linhas já calculadas por ElePlanilhas.materiais), servicos / qto / avaliarFam (para a lista de materiais) }
 *   EleMemorial.pendencias(analise, opcoes) → [{ nivel: "vermelho" | "amarelo", texto, secao }]
 *   ElePranchas.memorial (js/elepranchas.js) delega a este módulo.
 *
 * SEÇÕES: 1 Identificação · 2 Normas e referências (com a ressalva e o nível de cada fonte) · 3 Fornecimento e padrão de entrada ·
 * 4 Levantamento de cargas por ambiente (a conta aparece: "12 m² → 100 + 60 = 160 VA") · 5 Divisão de circuitos · 6 Demanda (conta
 * passo a passo) · 7 Dimensionamento por circuito (tabelas + memória de cálculo explícita) · 8 Eletrodutos · 9 Quadro · 10 Aterramento
 * e equipotencialização · 11 NR-10 10.4.9 a–f · 12 Lista de materiais (resumo) · 13 Pendências e itens sem fonte · 14 Termo do RT.
 *
 * ⚠ NENHUM VALOR DE NORMA AQUI. Todo número vem do cálculo (analise), de js/eletabelas.js (com item e fonte) ou de js/eleregras.js
 *   (com item e nível). As fórmulas são o ENUNCIADO do cálculo; os coeficientes entram pelas tabelas. test-ele-memorial varre este arquivo.
 * ⚠ A CAPA NUNCA DIZ "ATENDE" COM PENDÊNCIA. A NBR 5410:2004 é cópia não licenciada, sem a Errata 1/2008: a ressalva sai em toda emissão.
 * Teste: node tools/test-ele-memorial.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function TB() { return dep("EleTabelas", "./eletabelas.js"); }
  function RG() { return dep("EleRegras", "./eleregras.js"); }
  function PL() { return dep("ElePlanilhas", "./eleplanilhas.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function br(v, c) { if (!fin(v)) return "-"; c = c == null ? 2 : c; var k = Math.pow(10, c), s = (Math.round(v * k) / k).toFixed(c).replace(".", ","); var pb = s.split(","); pb[0] = pb[0].replace(/\B(?=(\d{3})+(?!\d))/g, "."); return pb.join(",");   /* B1 (revisão): o separador de milhar só na parte inteira */ }
  function sec(S) { return fin(S) ? String(S).replace(".", ",") : "-"; }
  function dois(k) { return ("0" + k).slice(-2); }
  function hoje() { var d = new Date(); return dois(d.getDate()) + "/" + dois(d.getMonth() + 1) + "/" + d.getFullYear(); }
  function listaPt(l) { l = arr(l); return l.length > 1 ? l.slice(0, -1).join(", ") + " e " + l[l.length - 1] : (l[0] || ""); }
  var RE_INDEF = /\b(undefined|NaN|null|Infinity)\b/;

  /* ------------------------------------------------------------------ REFERÊNCIAS (citação + situação + nível; sem valor de norma) */
  /* nível: N norma lida (cópia não licenciada) · A fonte primária lida · C critério RA · X sem fonte lida. As situações abaixo vêm de
     docs/eletrica/PADRAO-PRANCHA-ELETRICA.md e docs/eletrica/pesquisa/ (CIRCUITOS-QUADRO.md §8 e RESUMO.md). */
  function referencias() {
    var T = TB(), N = T.NORMA, Cm = T.CEMIG;
    return [
      ["ABNT NBR 5410:2004 — Instalações elétricas de baixa tensão", "dimensionamento, divisão de circuitos, proteções, quadro (itens citados um a um)",
        "cópia de consulta NÃO licenciada à RA, edição original (" + N.edicaoLida + "); vigente: " + N.vigente + ". Só o valor com o item foi usado; o PDF não é arquivado", "N"],
      ["ABNT NBR 5444:1989 — Símbolos gráficos para instalações elétricas prediais", "simbologia das pranchas",
        "CANCELADA em 11/2014, sem norma substituta (a ABNT remete à IEC 60617, não lida). Os símbolos são os de uso corrente e TODOS levam texto", "X"],
      [Cm.fonte, "tipo de fornecimento, padrão de entrada e cálculo da demanda (" + Cm.demanda.item + ")",
        "PDF público da CEMIG, fonte primária lida: Tabelas 1, 2, 3, 10, 12 e 13 e os itens 4.5.1 e 8.2.3. NÃO lidos: capítulo 7 (caixa de medição, poste, afastamentos), Tabelas 4, 5, 14, 15 e 18 a 20", "A"],
      ["NR-10 — Segurança em instalações e serviços em eletricidade (texto de 2026, Portaria MTE 737/2026)", "itens do memorial (10.4.9 a–f) e responsabilidade do projeto (10.4.8)",
        "fonte primária lida; vigência do texto atual: 01/06/2027. Prontuário das instalações elétricas e demais capítulos: não lidos", "A"],
      ["ABNT NBR 9050:2020 — Acessibilidade", "altura do interruptor (4.6.9)", "fonte primária lida", "A"],
      [T.FONTES.SINAPI, "códigos de composição na lista de materiais", "base pública lida; item sem composição sai \"pendente\" ou \"provisório — cotar\"", "A"],
      ["Fabricantes: " + [T.FONTES.SIL, T.FONTES.PLASTUBOS, T.FONTES.LAPP].join("; "), "diâmetro do cabo, DN do eletroduto pelo número de condutores, resistência do condutor", "catálogos públicos lidos na imagem", "A"],
      ["Critério RA", "limites por circuito, posição do quadro, comprimento provisório do alimentador, esquema de aterramento adotado", "decisão de projeto, editável, a validar com o RT", "C"]
    ];
  }

  /* ------------------------------------------------------------------ O QUE O RT PRECISA CONFERIR (texto fixo, sem número de norma) */
  var NR10 = [
    ["a", "proteção contra choques elétricos e queimaduras", "10.4.9 a)"],
    ["b", "identificação dos circuitos elétricos", "10.4.9 b)"],
    ["c", "restrições e impedimentos de acesso", "10.4.9 c)"],
    ["d", "influências externas", "10.4.9 d)"],
    ["e", "princípio funcional dos dispositivos de proteção", "10.4.9 e)"],
    ["f", "compatibilidade dos dispositivos de proteção com a instalação", "10.4.9 f)"]
  ];

  /* ------------------------------------------------------------------ BLOCOS */
  function Sec(id, titulo) { this.id = id; this.titulo = titulo; this.blocos = []; }
  Sec.prototype.p = function (t) { this.blocos.push({ t: "p", x: t }); return this; };
  Sec.prototype.li = function (t) { this.blocos.push({ t: "li", x: t }); return this; };
  Sec.prototype.alerta = function (t) { this.blocos.push({ t: "alerta", x: t }); return this; };
  Sec.prototype.sub = function (t) { this.blocos.push({ t: "sub", x: t }); return this; };
  Sec.prototype.tab = function (titulo, cab, linhas, alin) { this.blocos.push({ t: "tab", titulo: titulo, cab: cab, linhas: linhas, alin: alin || [] }); return this; };
  Sec.prototype.calc = function (titulo, linhas) { this.blocos.push({ t: "calc", titulo: titulo, linhas: linhas }); return this; };
  function itensDe(s) {
    var o = [];
    s.blocos.forEach(function (b) {
      if (b.t === "p" || b.t === "li" || b.t === "alerta") o.push(b.x);
      else if (b.t === "sub") o.push(b.x);
      else if (b.t === "tab") { o.push(b.titulo); b.linhas.forEach(function (l) { o.push(l.join(" | ")); }); }
      else if (b.t === "calc") { o.push(b.titulo); b.linhas.forEach(function (l) { o.push(l); }); }
      else if (b.t === "assin") { o.push(b.rt + " — " + b.titulo + " — " + b.reg + " — " + b.empresa); o.push("Contratante: " + b.contratante); o.push(b.local + ", " + b.data); }
    });
    return o;
  }

  /* ------------------------------------------------------------------ CÁLCULOS (o enunciado; os coeficientes vêm das tabelas) */
  /* queda de tensão percentual do circuito terminal: 200 · R70(S) · L · IB / V  (a mesma fórmula do js/elecircuitos.js, refeita aqui) */
  function quedaTerminal(S, L, ib, V) { var r = TB().r70(S); return r == null ? null : 200 * (r / 1000) * L * ib / V; }
  /* a sensibilidade do DR vem do próprio cálculo (A.drs), nunca digitada aqui */
  function sens(A) { return A.drs && A.drs.length && fin(A.drs[0].sensibilidade_mA) ? A.drs[0].sensibilidade_mA + " mA" : "sensibilidade a definir"; }
  /* a fronteira da coluna da Tabela 12 (kW) é lida do texto da própria tabela em js/eletabelas.js */
  function limiteB3() { var m = /até\s*([0-9]+(?:[.,][0-9]+)?)\s*kW/i.exec(TB().CEMIG.tabela12.nota); return m ? parseFloat(m[1].replace(",", ".")) : null; }
  function menorIn(ib) { var L = TB().DISJUNTORES_A; for (var k = 0; k < L.length; k++) if (L[k] >= ib - 1e-9) return L[k]; return null; }
  function secaoCapacidade(ref, In, ft, fa) {
    var T = TB(), S = T.T36.secoes;
    for (var i = 0; i < S.length; i++) { var iz0 = T.iz(ref, 2, S[i]); if (iz0 != null && iz0 * ft * fa >= In - 1e-9) return S[i]; }
    return null;
  }
  function secaoQueda(L, ib, V, lim) {
    var T = TB(), S = T.T36.secoes;
    for (var i = 0; i < S.length; i++) { var q = quedaTerminal(S[i], L, ib, V); if (q != null && q <= lim + 1e-9) return S[i]; }
    return null;
  }
  /* o circuito em linhas de memória de cálculo */
  function memoriaCircuito(c, A) {
    var T = TB(), C = A.criterios, d = c.dim, V = d.V, ib = d.va / V, L = fin(c.Lmax) ? c.Lmax : d.L, o = [];
    var cap = secaoCapacidade(d.metodo.ref, d.In, d.ft, d.fa), qS = secaoQueda(L, ib, V, d.limiteQueda), r70 = T.r70(d.secao);
    var inMin = menorIn(ib), qd = quedaTerminal(d.secao, L, ib, V);
    o.push("1) Corrente de projeto: IB = P / V = " + br(d.va, 0) + " VA / " + V + " V = " + br(ib, 2) + " A");
    o.push("2) Método de instalação (pior aplicação do percurso — " + T.n5410("6.2.5.8") + "): " + d.metodo.apl + " → " + T.T33.item + ", método " + d.metodo.metodo + " (referência " + d.metodo.ref + ")" + (d.metodo.estimado ? " — ESTIMADO (sem eletroduto traçado)" : ""));
    o.push("3) Fator de correção de temperatura: FCT = " + br(d.ft, 2) + " (" + T.T40.item + ", " + C.tempAmbiente.valor + " °C)");
    o.push("4) Fator de agrupamento: " + d.nAgrup + " circuito(s) no eletroduto mais cheio → FCA = " + br(d.fa, 2) + " (" + T.T42.item + ")" + (d.desprezado ? "; este circuito é desprezado no agrupamento dos outros (" + T.n5410("6.2.5.5.2") + ")" : ""));
    o.push("5) Disjuntor: menor corrente nominal normalizada com In ≥ IB = " + (inMin != null ? inMin + " A" : "acima da série") + " (série " + T.DISJUNTORES_A.join(", ") + " A)" + (inMin != null && inMin !== d.In ? "; no projeto está " + d.In + " A (valor gravado mantido)" : ""));
    o.push("6) Seção pelo critério da capacidade de condução (" + T.T36.item + ", " + d.metodo.ref + ", 2 condutores carregados — " + T.T46.item + "): Iz corrigida = Iz(tabela) × FCT × FCA ≥ In = " + d.In + " A");
    var S = T.T36.secoes;
    for (var i = 0; i < S.length; i++) {
      var iz0 = T.iz(d.metodo.ref, 2, S[i]), izc = iz0 * d.ft * d.fa, bom = izc >= d.In - 1e-9;
      o.push("      " + sec(S[i]) + " mm²: " + br(iz0, 1) + " A × " + br(d.ft, 2) + " × " + br(d.fa, 2) + " = " + br(izc, 1) + " A " + (bom ? "≥" : "<") + " " + d.In + " A" + (bom ? " → atende" : ""));
      if (bom) break;
    }
    o.push("7) Seção mínima (" + T.T47.item + ", " + (c.tipo === "luz" ? "iluminação" : "força") + "): " + sec(d.secMin) + " mm²");
    o.push("8) Queda de tensão (" + T.QUEDA.item + ", calculada com a corrente de projeto): ΔV% = 200 × R70 × L × IB / V; R70(" + sec(d.secao) + " mm²) = " + br(T.RESISTENCIA.r20[d.secao], 3) + " × (1 + " + br(T.RESISTENCIA.alfa.valor, 5) + " × (" + T.RESISTENCIA.tCondutor + " − 20)) = " + br(r70, 3) + " Ω/km");
    o.push("      ΔV% = 200 × " + br(r70, 3) + " / 1000 × " + br(L, 2) + " m × " + br(ib, 2) + " A / " + V + " V = " + br(qd, 2) + " %  (limite " + br(d.limiteQueda, 2) + " % = o menor entre " + br(T.QUEDA.terminal_pct, 0) + " % no terminal e " + br(T.QUEDA.entregaSecundaria_pct, 0) + " % do ponto de entrega menos a queda do alimentador)" + (qd != null && qd <= d.limiteQueda + 1e-9 ? " → atende" : " → NÃO ATENDE") + (d.estimado ? "; comprimento ESTIMADO" : ""));
    o.push("9) Seção adotada = maior entre capacidade (" + sec(cap) + " mm²), mínima (" + sec(d.secMin) + " mm²) e queda de tensão (" + sec(qS) + " mm²) = " + sec(d.secao) + " mm²" + (d.mantido ? " (valor gravado no projeto, ainda atende)" : ""));
    o.push("10) Condutor de proteção (PE): " + T.T58.item + " → " + sec(d.pe) + " mm²");
    o.push("11) Coordenação (" + T.COORD.item + "): IB ≤ In ≤ Iz → " + br(ib, 2) + " ≤ " + d.In + " ≤ " + br(d.izc, 1) + (ib <= d.In + 1e-9 && fin(d.izc) && d.In <= d.izc + 1e-9 ? " → atende" : " → NÃO ATENDE") + ". " + T.COORD.i2.fonte + ".");
    o.push("12) DR " + sens(A) + ": " + (c.dr && c.dr.length ? "exigido (" + T.DR.item + " " + c.dr.map(function (k) { return k + ")"; }).join(", ") + ") — grupo " + (c.drId || "?") : "não exigido pelos casos da " + T.DR.item) + "; disjuntor " + c.polos + (c.polos === 1 ? " polo" : " polos") + (c.polos === 2 ? " (secciona todas as fases — " + T.DIVISAO.multipolar.split(" — ")[0] + ")" : ""));
    return o;
  }
  /* o alimentador medidor → quadro */
  function memoriaAlimentador(A) {
    var T = TB(), C = A.criterios, al = A.alimentador, g = A.geral, o = [], fs = {};
    A.fases.fases.forEach(function (f) { fs[f] = 0; });
    A.circuitos.forEach(function (c) { if (c.fases) c.fases.split("").forEach(function (f) { fs[f] += c.dim.va / c.dim.V; }); });
    var cargaTxt = A.fases.fases.map(function (f) { return f + " = " + br(fs[f], 2) + " A"; }).join("; "), mx = 0;
    Object.keys(fs).forEach(function (f) { mx = Math.max(mx, fs[f]); });
    var k = A.demanda.cargaInstalada_kW > 0 ? Math.min(1, A.demanda.demanda_kVA / (A.pontos.reduce(function (s, p) { return s + (p.va || 0); }, 0) / 1000)) : 1;
    o.push("1) Corrente de projeto por fase (soma das IB dos circuitos de cada fase): " + cargaTxt);
    o.push("2) Fator de demanda do conjunto: k = demanda da ND-5.1 / carga instalada = " + br(A.demanda.demanda_kVA, 2) + " kVA / " + br(A.pontos.reduce(function (s, p) { return s + (p.va || 0); }, 0) / 1000, 2) + " kVA = " + br(k, 2) + " (no máximo 1)");
    o.push("3) Corrente de demanda da fase mais carregada: Ig = " + br(mx, 2) + " A × " + br(k, 2) + " = " + br(mx * k, 2) + " A");
    var inG = null; T.GERAL_A.forEach(function (x) { if (inG == null && x >= mx * k - 1e-9) inG = x; });
    o.push("4) Disjuntor geral: menor valor da série (" + T.GERAL_A.join(", ") + " A) com In ≥ Ig = " + (inG != null ? inG + " A" : "acima da série") + ", " + g.polos + (g.polos === 1 ? " polo" : " polos") + (A.demanda.entrada ? "; limitado pelo disjuntor da entrada da ND-5.1 (" + A.demanda.entrada.disjuntor_A + " A, faixa " + A.demanda.entrada.faixa + ")" : ""));
    o.push("5) Seção pelo critério da capacidade (" + T.T36.item + ", " + al.ref + ", " + al.nCarr + " condutores carregados — " + T.T46.item + "; FCT = " + br(T.fatorTemperatura(C.tempAmbiente.valor), 2) + "): Iz(tabela) × FCT ≥ In do geral = " + g.In + " A");
    var S = T.T36.secoes, ftA = T.fatorTemperatura(C.tempAmbiente.valor);
    for (var i = 0; i < S.length; i++) {
      var iz0 = T.iz(al.ref, al.nCarr, S[i]), izc = iz0 * ftA, bom = g.In != null && izc >= g.In - 1e-9;
      o.push("      " + sec(S[i]) + " mm²: " + br(iz0, 1) + " A × " + br(ftA, 2) + " = " + br(izc, 1) + " A " + (bom ? "≥" : "<") + " " + g.In + " A" + (bom ? " → atende" : ""));
      if (bom) break;
    }
    o.push("6) Queda de tensão do alimentador (parcela reservada: " + br(C.quedaAlimentadorMax.valor, 2) + " % — " + C.quedaAlimentadorMax.fonte + "): ΔV% = K × R70 × L × Ig / V, com K = " + br(al.kQueda, 2) + " (" + (A.fases.fases.length === 1 ? "1 fase: 200" : "100 × (1 + I_neutro / I_fase); I_neutro = soma vetorial das correntes fase-neutro = " + br(al.iNeutro, 2) + " A, limite superior conservador") + ")");
    var r70 = al.secao != null ? T.r70(al.secao) : null, dv = r70 != null ? al.kQueda * (r70 / 1000) * al.comprimento * g.ib / C.tensaoFN.valor : null;
    o.push("      ΔV% = " + br(al.kQueda, 2) + " × " + br(r70, 3) + " / 1000 × " + br(al.comprimento, 1) + " m × " + br(g.ib, 2) + " A / " + C.tensaoFN.valor + " V = " + br(dv, 2) + " %" + (al.provisorio ? " — comprimento PROVISÓRIO (critério RA)" : ""));
    /* M3 (revisão 07/11/2026): a queda por seção candidata — de quem passa na capacidade até a adotada — para o RT auditar por que a seção subiu */
    if (al.secao != null && g.ib != null) {
      var i0 = -1; for (var ic = 0; ic < S.length && i0 < 0; ic++) if (g.In != null && T.iz(al.ref, al.nCarr, S[ic]) * ftA >= g.In - 1e-9) i0 = ic;
      if (i0 >= 0) {
        o.push("      Queda por seção candidata (da menor que passa na capacidade até a adotada), limite da parcela = " + br(C.quedaAlimentadorMax.valor, 2) + " %:");
        for (var iq = i0; iq < S.length; iq++) {
          var dq = al.kQueda * (T.r70(S[iq]) / 1000) * al.comprimento * g.ib / C.tensaoFN.valor, okq = dq <= C.quedaAlimentadorMax.valor + 1e-9;
          o.push("      " + sec(S[iq]) + " mm²: ΔV% = " + br(dq, 2) + " % " + (okq ? "≤" : ">") + " " + br(C.quedaAlimentadorMax.valor, 2) + " %" + (okq ? " → atende" : " → não atende"));
          if (S[iq] >= al.secao - 1e-9) break;
        }
        o.push("      O limite de " + br(C.quedaAlimentadorMax.valor, 2) + " % do alimentador é critério RA (nível " + C.quedaAlimentadorMax.nivel + "), não é da norma: a norma limita a queda TOTAL do ponto de entrega ao ponto mais distante (o circuito terminal leva o restante); se a soma da queda do terminal mais carregado com a do alimentador couber no limite da norma, uma seção menor que a adotada pode ser aceita pelo RT (a seção maior custa mais ao cliente).");
      }
    }
    o.push("7) Seção adotada (fases e neutro) = " + sec(al.secao) + " mm²; PE (" + T.T58.item + ") = " + sec(al.pe) + " mm²" + (A.demanda.entrada ? "; mínimo da ND-5.1 para a faixa " + A.demanda.entrada.faixa + ": " + sec(A.demanda.entrada.condutor_mm2) + " mm² — " + (al.secao != null && al.secao >= A.demanda.entrada.condutor_mm2 ? "atende" : "NÃO ATENDE") : ""));
    return o;
  }

  /* ------------------------------------------------------------------ DEMANDA (a conta da ND-5.1, refeita para o texto) */
  var GRUPOS_DEM = [["b1", "chuveiros, torneiras e cafeteiras elétricas", true], ["b3", "fornos, fogões e grill", false], ["b4", "lavar e secar roupa, lava-louças e ferro", false], ["b5", "demais aparelhos", false], ["c", "condicionadores de ar", false], ["d", "motores", false]];
  function contaDemanda(A) {
    var T = TB(), C = A.criterios, fp = C.fpNaoAquecimento.valor, grupos = { b1: [], b3: [], b4: [], b5: [], c: [], d: [] }, vaLT = 0;
    A.pontos.forEach(function (p) {
      if (p.kind === "luz" || p.kind === "tug") vaLT += p.va;
      if (p.kind === "tue") grupos[p.cemig || "b5"].push(p);
    });
    var lim35 = limiteB3(), ciA = vaLT / 1000, fd = T.fdTabela10(ciA), a = ciA * fd / fp, lin = [], v = { a: a, b1: 0, b3: 0, b4: 0, b5: 0, c: 0, d: 0 }, linhas = [], tab = [];
    lin.push("a) Iluminação e tomadas: Σ VA = " + br(vaLT, 0) + " VA = " + br(ciA, 2) + " kW; fator da " + T.CEMIG.tabela10.item + " = " + br(fd, 2) + "; kVA = kW / " + br(fp, 2) + " → a = " + br(ciA, 2) + " × " + br(fd, 2) + " / " + br(fp, 2) + " = " + br(a, 2) + " kVA");
    tab.push(["a", "iluminação e tomadas", String(A.pontos.filter(function (p) { return p.kind === "luz" || p.kind === "tug"; }).length) + " pontos", br(ciA, 2) + " kW", br(fd, 2), br(a, 2)]);
    GRUPOS_DEM.forEach(function (gd) {
      var L = grupos[gd[0]]; if (!L.length) return;
      var kw = L.reduce(function (s, p) { return s + p.w / 1000; }, 0), nome = gd[0], f, val, desc;
      if (nome === "b1") { f = T.fdTabela13(L.length); val = kw * f; desc = kw; lin.push("b1) " + gd[1] + ": " + L.length + " aparelho(s), Σ = " + br(kw, 2) + " kW (aquecimento: kW = kVA); fator da " + T.CEMIG.tabela13.item + " para " + L.length + " = " + br(f, 2) + " → b1 = " + br(kw, 2) + " × " + br(f, 2) + " = " + br(val, 2) + " kVA"); }
      else if (nome === "b3") {
        var ate = L.filter(function (p) { return lim35 == null || p.w <= lim35 * 1000; }), ac = L.filter(function (p) { return lim35 != null && p.w > lim35 * 1000; }), s1 = ate.reduce(function (s, p) { return s + p.w / 1000; }, 0), s2 = ac.reduce(function (s, p) { return s + p.w / 1000; }, 0);
        val = (ate.length ? s1 * T.fdTabela12(ate.length, false) : 0) + (ac.length ? s2 * T.fdTabela12(ac.length, true) : 0); f = kw > 0 ? val / kw : 0; desc = kw;
        lin.push("b3) " + gd[1] + ": " + (ate.length ? ate.length + " até " + br(lim35, 1) + " kW (Σ " + br(s1, 2) + " kW × " + br(T.fdTabela12(ate.length, false), 2) + ")" : "") + (ate.length && ac.length ? " + " : "") + (ac.length ? ac.length + " acima de " + br(lim35, 1) + " kW (Σ " + br(s2, 2) + " kW × " + br(T.fdTabela12(ac.length, true), 2) + ")" : "") + " (" + T.CEMIG.tabela12.item + "; kW = kVA) → b3 = " + br(val, 2) + " kVA");
      } else if (nome === "c") { var kva = L.reduce(function (s, p) { return s + p.va / 1000; }, 0); f = T.fdTabela13(L.length); val = kva * f; desc = kva; lin.push("c) " + gd[1] + ": " + L.length + " aparelho(s), Σ = " + br(kva, 2) + " kVA; fator da " + T.CEMIG.tabela13.item + " para " + L.length + " = " + br(f, 2) + " → c = " + br(kva, 2) + " × " + br(f, 2) + " = " + br(val, 2) + " kVA"); }
      else if (nome === "d") { f = 1; val = kw / fp; desc = kw; lin.push("d) " + gd[1] + ": " + L.length + " aparelho(s), Σ = " + br(kw, 2) + " kW; as Tabelas 14 e 15 da ND-5.1 não foram transcritas — 100 % da potência, kVA = kW / " + br(fp, 2) + " → d = " + br(val, 2) + " kVA (conservador)"); }
      else { f = T.fdTabela13(L.length); val = kw * f / fp; desc = kw; lin.push(nome + ") " + gd[1] + ": " + L.length + " aparelho(s), Σ = " + br(kw, 2) + " kW; fator da " + T.CEMIG.tabela13.item + " para " + L.length + " = " + br(f, 2) + "; kVA = kW / " + br(fp, 2) + " → " + nome + " = " + br(kw, 2) + " × " + br(f, 2) + " / " + br(fp, 2) + " = " + br(val, 2) + " kVA"); }
      v[nome] = val; tab.push([nome, gd[1], L.length + " aparelho(s)", br(desc, 2) + (nome === "c" ? " kVA" : " kW"), br(f, 2), br(val, 2)]);
    });
    var D = v.a + v.b1 + v.b3 + v.b4 + v.b5 + v.c + v.d;
    lin.push("D = " + T.CEMIG.demanda.formula.replace(/^D = /, "") + " = " + br(v.a, 2) + " + " + br(v.b1, 2) + " + " + br(v.b3, 2) + " + " + br(v.b4, 2) + " + " + br(v.b5, 2) + " + " + br(v.c, 2) + " + " + br(v.d, 2) + " = " + br(D, 2) + " kVA");
    void linhas;
    return { v: v, D: D, linhas: lin, tab: tab, grupos: grupos, ciA: ciA };
  }

  /* ------------------------------------------------------------------ PENDÊNCIAS E ITENS SEM FONTE */
  function pendencias(A, opc) {
    opc = opc || {}; var T = TB(), R = RG(), out = [], vistos = {};
    function add(nivel, texto, secao) { texto = txt(texto).trim(); if (!texto || vistos[nivel + texto]) return; vistos[nivel + texto] = 1; out.push({ nivel: nivel, texto: texto, secao: secao || "" }); }
    if (!A || !A.ok) return out;
    arr(A.pendencias).forEach(function (p) { add("vermelho", p.texto, "7"); });
    A.circuitos.forEach(function (c) {
      if (!c.dim.ok) add("vermelho", c.id + " (" + c.nome + "): NÃO ATENDE — " + (c.dim.motivos.join("; ") || "dimensionamento sem solução") + ".", "7");
      if (!c.fases) add("vermelho", c.id + " (" + c.nome + "): sem fase definida (aparelho em 220 V num fornecimento de 1 fase).", "5");
    });
    A.pontos.forEach(function (p) {
      if (p.potPendente) add("vermelho", "Ponto " + p.id + " (" + p.aparelhoNome + "): potência da placa do aparelho pendente — informe a potência.", "4");
      /* A2 (revisão 07/11/2026): potência sem fonte (nível X) ou com aviso "confirme a placa" — a que o RT assina sem saber */
      else if (p.kind === "tue" && !p.placa && (p.potNivel === "X" || p.potConfirmar)) add("vermelho", "Ponto " + p.id + " (" + p.aparelhoNome + "): " + p.w + " W " + (p.potNivel === "X" ? "sem fonte lida (nível X)" : "a confirmar") + (p.potConfirmar ? " — " + p.potConfirmar : " — confirme a potência da placa do aparelho") + ".", "4");
    });
    Object.keys(A.eletrodutos).forEach(function (t) { var e = A.eletrodutos[t]; if (e.lotado) add("vermelho", "Eletroduto " + t + ": " + e.condutores + " condutores de até " + sec(e.secaoMaior) + " mm² " + (e.dnMinimo == null ? "não cabem num DN 32 pela ficha do fabricante" : "pedem DN " + e.dnMinimo + " e o modelo tem DN " + e.dn) + " — divida o ramal ou troque o DN.", "8"); });
    arr(A.avisos).forEach(function (t) { add("amarelo", t, "13"); });
    if (A.demanda && A.demanda.cargaInstaladaTexto) add("amarelo", "Carga instalada: " + A.demanda.cargaInstaladaTexto + " — o enquadramento do fornecimento (tipo A/B/C) usa essa soma; se o RT aplicar o fator de potência, o tipo pode mudar.", "3");
    /* itens sem fonte lida (nível X) — vermelho */
    if (T.COORD.i2.nivel === "X") add("vermelho", "Sem fonte lida: " + T.COORD.i2.fonte + ".", "7");
    if (T.RESISTENCIA.alfa.nivel === "X") add("vermelho", "Sem fonte lida: " + T.RESISTENCIA.alfa.fonte + ".", "7");
    Object.keys(A.criterios).forEach(function (k) { var q = A.criterios[k]; if (q.nivel === "X") add("vermelho", "Sem fonte lida: " + q.rotulo + " — " + q.fonte + ".", "13"); });
    var C1 = R && R.criterios ? R.criterios() : {};
    Object.keys(C1).forEach(function (k) { var q = C1[k]; if (q && q.nivel === "X") add("vermelho", "Sem fonte lida: " + q.rotulo + " — " + q.fonte + ".", "4"); });
    /* critérios RA em uso, a validar com o RT */
    var cra = []; Object.keys(A.criterios).forEach(function (k) { if (A.criterios[k].nivel === "C") cra.push(A.criterios[k].rotulo); });
    if (cra.length) add("amarelo", cra.length + " critério(s) RA em uso (decisão de projeto, não é norma): " + cra.join("; ") + ". Validar com o RT.", "2");
    if (A.criterios.dpsAQ2 && A.criterios.dpsAQ2.valor >= 1) add("amarelo", "DPS adotado por região AQ2 (critério RA conservador): o índice de trovoadas do local não foi lido — conferir se o DPS é obrigatório ou opcional.", "7");
    add("amarelo", "Temperatura de referência " + A.criterios.tempAmbiente.valor + " °C (Tabela 40): no entreforro sob telhado sem ventilação a temperatura pode passar disso — conferir e, se passar, ajustar nos critérios.", "7");
    add("amarelo", "Caixa de medição, poste e afastamentos: capítulo 7 e desenhos da ND-5.1 não transcritos — conferir com a CEMIG.", "3");
    add("amarelo", "Simbologia: a NBR 5444:1989 está cancelada sem norma substituta; os símbolos das pranchas são os de uso corrente e todos levam texto.", "2");
    /* o que só o RT define */
    if (!opc.esquemaAterramento) add("vermelho", "Esquema de aterramento: o cálculo do DPS e do PE parte do TN-S (premissa de fábrica); a definição formal (NR-10 10.4.4) e a interligação neutro/PE são do RT — a definir pelo RT.", "10");
    add("vermelho", "Equipotencialização: ligação equipotencial principal e suplementar (banheiros) a detalhar pelo RT — o item da norma não foi transcrito.", "10");
    add("vermelho", "NBR 5410:2004 lida em cópia NÃO licenciada à RA e sem a Errata 1/2008: conferir cada valor no exemplar licenciado da edição vigente antes de assinar.", "2");
    /* dados do RT e da obra */
    if (!txt(opc.responsavel)) add("vermelho", "Responsável técnico não informado: nome, título e registro no conselho (placeholders no memorial).", "1");
    else if (!txt(opc.registro)) add("vermelho", "Registro do responsável técnico (CREA/CAU) não informado.", "1");
    if (!txt(opc.obra)) add("vermelho", "Nome da obra não informado.", "1");
    /* lista de materiais */
    arr(opc.materiais).forEach(function (m) {
      if (m.situacao === "pendente") add("vermelho", "Material sem código SINAPI (pendente): " + m.item + (m.motivo ? " — " + m.motivo : "") + ".", "12");
      else if (m.situacao === "provisório") add("amarelo", "Material provisório — cotar com o fornecedor: " + m.item + ".", "12");
    });
    var ord = { vermelho: 0, amarelo: 1 };
    return out.map(function (p, i) { p.i = i; return p; }).sort(function (a, b) { return ord[a.nivel] - ord[b.nivel] || a.i - b.i; }).map(function (p) { delete p.i; return p; });
  }

  /* ------------------------------------------------------------------ SEÇÕES */
  function origemDe(p, opc) {
    var f = opc && opc.estado ? arr(opc.estado.familias).filter(function (x) { return x && String(x.id) === String(p.id); })[0] : null;
    return f && f.inst && f.inst.Origem ? txt(f.inst.Origem) : "";
  }
  function sIdent(A, opc, pend) {
    var s = new Sec("identificacao", "1. Identificação"), emp = opc.empresa, nomeEmp = emp && typeof emp === "object" ? txt(emp.nome) : txt(emp), cnpj = emp && typeof emp === "object" ? txt(emp.cnpj) : "";
    var rt = txt(opc.responsavel), reg = txt(opc.registro);
    s.tab("Dados do projeto", ["Campo", "Informação"], [
      ["Obra", txt(opc.obra) || "[OBRA]"], ["Local", txt(opc.local) || "[ENDEREÇO DA OBRA]"], ["Proprietário / contratante", txt(opc.proprietario || opc.contratante) || "[PROPRIETÁRIO]"],
      ["Responsável técnico", rt ? rt + (txt(opc.tituloProfissional) ? " — " + txt(opc.tituloProfissional) : "") : "[NOME DO RESPONSÁVEL TÉCNICO]"],
      ["Registro", reg || "[Nº DO REGISTRO NO CREA/CAU]"], ["Empresa", (nomeEmp || "RA Engenharia") + (cnpj ? " — CNPJ " + cnpj : "")],
      ["Documento", (txt(opc.numero) || "[Nº DO DOCUMENTO]") + " " + (txt(opc.revisao) || "R00")], ["Data", txt(opc.data) || hoje()]]);
    s.p("Objeto: memorial descritivo e de cálculo da instalação elétrica de baixa tensão (" + A.criterios.tensaoFN.valor + "/" + A.criterios.tensaoFF.valor + " V), com " + A.pontos.filter(function (p) { return p.kind !== "interruptor"; }).length + " pontos de utilização em " + A.circuitos.length + " circuito(s), do padrão de entrada ao quadro de distribuição. Gerado do modelo 3D e do cálculo atual: o que está nas pranchas é o que está aqui.");
    void pend; return s;
  }
  function sNormas(A) {
    var T = TB(), R = RG(), s = new Sec("normas", "2. Normas e referências"), niv = R && R.NIVEIS ? R.NIVEIS : {};
    s.alerta(T.NORMA.ressalva);
    s.tab("Referências, situação e nível da fonte", ["Referência", "Uso neste projeto", "Situação da fonte", "Nível"], referencias().map(function (r) { return [r[0], r[1], r[2], r[3]]; }));
    s.p("Níveis: N = " + (niv.N || "norma lida (cópia não licenciada)") + " · A = " + (niv.A || "fonte primária lida") + " · C = " + (niv.C || "critério RA") + " · X = " + (niv.X || "sem fonte lida — conferir") + ".");
    s.p("Todo valor de tabela da NBR 5410 sai citado como \"" + T.CIT + "\", com o item ou a tabela. Páginas lidas e como foram conferidas: cabeçalho de js/eletabelas.js.");
    void A; return s;
  }
  function sFornecimento(A) {
    var T = TB(), C = A.criterios, dm = A.demanda, en = dm.entrada, s = new Sec("fornecimento", "3. Fornecimento e padrão de entrada");
    s.p("Tensão " + C.tensaoFN.valor + "/" + C.tensaoFF.valor + " V, " + C.tensaoFN.fonte + ".");
    s.p("Carga instalada: " + br(dm.cargaInstalada_kW, 2) + " kW (iluminação e tomadas " + br(dm.luzTomadas_kW, 2) + " kW, mais os aparelhos de uso específico). Demanda provável: " + br(dm.demanda_kVA, 2) + " kVA (seção 6).");
    s.p(dm.tipo ? "Tipo de fornecimento " + dm.tipo + ": " + dm.motivoTipo + "." : "Fornecimento: " + dm.motivoTipo + ".");
    if (en) s.tab("Padrão de entrada — valores mínimos da " + en.tabela + ", faixa " + en.faixa, ["Item", "Valor"], [
      ["Fios / fases", en.fios + " fios, " + en.fases + (en.fases === 1 ? " fase" : " fases")], ["Disjuntor termomagnético pós-medidor", en.disjuntor_A + " A"], ["Condutor (cobre)", sec(en.condutor_mm2) + " mm²"],
      ["Eletroduto PVC / aço", en.eletrodutoPVC_mm + " mm / " + en.eletrodutoAco_mm + " mm"], ["Aterramento (cobre nu)", sec(en.aterramento_mm2) + " mm²"], ["Hastes", String(en.hastes)], ["Condutor de proteção", sec(en.pe_mm2) + " mm²"]]);
    else s.alerta("Padrão de entrada não verificado: " + dm.motivoTipo);
    s.p("Fonte: " + dm.fonte + ". Caixa de medição, poste e afastamentos: capítulo 7 e desenhos da ND-5.1 — não transcritos, conferir com a CEMIG.");
    void T; return s;
  }
  function sCargas(A, opc) {
    var T = TB(), R = RG(), RC = R && R.criterios ? R.criterios() : null, s = new Sec("cargas", "4. Levantamento de cargas por ambiente"), linhas = [], tot = 0, contas = [];
    s.p("Iluminação: carga mínima pela " + T.n5410("9.5.2.1.2") + " (ou a soma das lâmpadas, se maior). Tomadas de uso geral (TUG): potência atribuída pela " + T.n5410("9.5.2.2.2") + ". Tomadas de uso específico (TUE) e ligações diretas: potência do aparelho (CEMIG ND-5.1, Tabelas 8A/8B e 9), kVA = kW / " + br(A.criterios.fpNaoAquecimento.valor, 2) + " nos que não são de aquecimento.");
    arr(A.leitura.ambientes).forEach(function (a) {
      var ps = A.pontos.filter(function (p) { return p.amb === a.id; }), luz = ps.filter(function (p) { return p.kind === "luz"; }), tug = ps.filter(function (p) { return p.kind === "tug"; }), tue = ps.filter(function (p) { return p.kind === "tue"; });
      var vaL = luz.reduce(function (x, p) { return x + p.va; }, 0), vaT = tug.reduce(function (x, p) { return x + p.va; }, 0), vaE = tue.reduce(function (x, p) { return x + p.va; }, 0);
      if (!ps.length) return;
      var circs = []; A.circuitos.forEach(function (c) { if (c.pontos.some(function (id) { return A.existe[id] && A.existe[id].amb === a.id; })) circs.push(c.id); });
      linhas.push([a.nome, br(a.area, 2), br(vaL, 0), String(tug.length), br(vaT, 0), br(vaE, 0), br(vaL + vaT + vaE, 0), circs.join(", ")]); tot += vaL + vaT + vaE;
      /* a conta de cada ambiente */
      if (luz.length) {
        var vaN = R.vaIluminacao(a.area, RC), base = RC.luzAreaBase.valor, passo = RC.luzAreaPasso.valor, k = Math.round((vaN - RC.luzVaBase.valor) / RC.luzVaPasso.valor), soma = /^soma/.test(txt(luz[0].vaRegra));
        contas.push(a.nome + " — iluminação: " + br(a.area, 2) + " m² " + (a.area <= base + 1e-9 ? "≤ " + base + " m² → " + RC.luzVaBase.valor + " VA" : "→ " + RC.luzVaBase.valor + " VA nos primeiros " + base + " m² + " + RC.luzVaPasso.valor + " VA × " + k + " (a cada " + passo + " m² inteiros além de " + base + " m²) = " + RC.luzVaBase.valor + " + " + (RC.luzVaPasso.valor * k) + " = " + vaN + " VA") + (soma ? "; a soma das lâmpadas é maior: " + br(vaL, 0) + " VA" : "; " + luz.length + " ponto(s) de luz de " + br(luz[0].va, 2) + " VA cada → " + br(vaL, 0) + " VA") + " (" + T.n5410("9.5.2.1.2") + ").");
      }
      if (tug.length) {
        var molh = a.cls && (a.cls.grupo === "cozinha_servico" || a.cls.grupo === "banheiro"), n = tug.length, q = Math.min(n, RC.qtdTugMolhada.valor);
        contas.push(a.nome + " — TUG: " + n + " ponto(s)" + (molh ? "; " + q + " × " + RC.vaTugMolhada.valor + " VA + " + (n - q) + " × " + RC.vaTugDemais.valor + " VA = " + (q * RC.vaTugMolhada.valor) + " + " + ((n - q) * RC.vaTugDemais.valor) + " = " + br(vaT, 0) + " VA" : "; " + n + " × " + RC.vaTugDemais.valor + " VA = " + br(vaT, 0) + " VA") + " (" + T.n5410("9.5.2.2.2") + (molh ? " a)" : " b)") + ").");
      }
      tue.forEach(function (p) {
        var og = origemDe(p, opc);
        contas.push(a.nome + " — TUE " + p.aparelhoNome + (p.direta ? " (ligação direta)" : "") + ": " + p.vaRegra + (p.potPendente ? "" : " = " + br(p.va, 0) + " VA em " + p.tensao + " V") + (og ? "; Origem: " + og : "") + ".");
      });
    });
    linhas.push(["TOTAL", "", "", "", "", "", br(tot, 0), ""]);
    s.tab("Cargas por ambiente (VA)", ["Ambiente", "Área (m²)", "Iluminação", "TUG (pontos)", "TUG", "TUE", "Total", "Circuitos"], linhas, ["", "r", "r", "r", "r", "r", "r", ""]);
    s.sub("A conta de cada ambiente");
    contas.forEach(function (t) { s.li(t); });
    return s;
  }
  function sDivisao(A) {
    var T = TB(), C = A.criterios, R = RG(), RC = R && R.criterios ? R.criterios() : null, s = new Sec("divisao", "5. Divisão de circuitos"), D = T.DIVISAO;
    s.p("Critérios: " + D.luzTomadaSeparados + "; " + D.exclusivo10A + "; " + D.cozinhaServico + ". " + D.excecaoHabitacao + ". Limites por circuito (critério RA, a norma não fixa): iluminação IB ≤ " + C.luzIbMax.valor + " A e até " + C.luzPontosMax.valor + " pontos de luz; tomadas IB ≤ " + C.tugIbMax.valor + " A e até " + C.tugPontosMax.valor + " pontos.");
    var li = A.circuitos.map(function (ci) {
      var d = ci.dim, motivo;
      if (ci.tipo === "luz") motivo = "iluminação separada das tomadas (" + D.luzTomadaSeparados.split(" — ")[0] + "); IB " + br(d.ib, 2) + " A ≤ " + C.luzIbMax.valor + " A";
      else if (ci.tipo === "tug") motivo = /^tug-amb-/.test(ci.chave) ? "tomadas de cozinha/serviço só delas (" + D.cozinhaServico.split(" — ")[0] + ")" : "tomadas de uso geral (" + D.luzTomadaSeparados.split(" — ")[0] + "); IB " + br(d.ib, 2) + " A ≤ " + C.tugIbMax.valor + " A, " + ci.pontos.length + " ponto(s)";
      else motivo = RC && d.ib > RC.correnteExclusivo.valor + 1e-9 ? "aparelho de " + br(d.ib, 2) + " A > " + RC.correnteExclusivo.valor + " A: circuito independente (" + D.exclusivo10A.split(" — ")[0] + ")" : "ponto dedicado ao aparelho (decisão RA)";
      return ci.id + " — " + ci.nome + ": " + br(d.va, 0) + " VA em " + ci.tensao + " V (" + (ci.fases || "fase não definida") + "), IB = " + br(d.ib, 2) + " A, " + ci.pontos.filter(function (id) { return A.existe[id] && A.existe[id].kind !== "interruptor"; }).length + " ponto(s); " + motivo + ".";
    });
    li.forEach(function (t) { s.li(t); });
    var fc = A.fases.carga, fases = A.fases.fases, soma = 0; fases.forEach(function (f) { soma += fc[f]; });
    s.p("Equilíbrio entre as fases (" + D.equilibrio.split(" — ")[0] + "): " + fases.map(function (f) { return "fase " + f + " = " + br(fc[f], 0) + " VA (" + br(soma > 0 ? fc[f] / soma * 100 : 0, 0) + " %)"; }).join("; ") + ".");
    s.p("Circuito de duas fases: o dispositivo de proteção secciona todas as fases (" + D.multipolar.split(" — ")[0] + "). Cores: " + D.cores + " — fases e retorno: critério RA (preto, vermelho, branco; retorno cinza).");
    return s;
  }
  function sDemanda(A) {
    var T = TB(), dm = A.demanda, s = new Sec("demanda", "6. Demanda"), c = contaDemanda(A), div = [];
    s.p("Demanda provável pela CEMIG ND-5.1, " + T.CEMIG.demanda.item + ": " + T.CEMIG.demanda.formula + ". Termos: " + T.CEMIG.demanda.termos + ".");
    s.calc("Conta passo a passo", c.linhas);
    s.tab("Resumo da demanda", ["Termo", "Grupo", "Aparelhos", "Soma", "Fator", "Demanda (kVA)"], c.tab.concat([["D", "demanda provável", "", "", "", br(c.D, 2)]]), ["", "", "", "r", "r", "r"]);
    ["a", "b1", "b3", "b4", "b5", "c", "d"].forEach(function (k) { if (Math.abs(c.v[k] - dm[k]) > 0.011) div.push(k + ": " + br(c.v[k], 2) + " × " + br(dm[k], 2)); });
    if (Math.abs(c.D - dm.demanda_kVA) > 0.011) div.push("D: " + br(c.D, 2) + " × " + br(dm.demanda_kVA, 2));
    if (div.length) s.alerta("Divergência entre a conta do memorial e o cálculo do motor (" + div.join("; ") + "): vale o do motor (" + br(dm.demanda_kVA, 2) + " kVA) — conferir antes de assinar.");
    s.p("Resultado do cálculo do projeto: D = " + br(dm.demanda_kVA, 2) + " kVA; carga instalada " + br(dm.cargaInstalada_kW, 2) + " kVA (somada como kW; fator de potência não aplicado). " + (dm.tipo ? "Tipo " + dm.tipo + ": " + dm.motivoTipo + "." : dm.motivoTipo + "."));
    if (dm.entrada) s.p("Faixa " + dm.entrada.faixa + " (" + dm.entrada.tabela + ", pela " + (dm.tipo === "C" ? "demanda provável" : "carga instalada") + "): disjuntor da entrada " + dm.entrada.disjuntor_A + " A, condutor " + sec(dm.entrada.condutor_mm2) + " mm².");
    arr(dm.pendencias).forEach(function (t) { s.alerta(t); });
    return s;
  }
  function sDimensionamento(A) {
    var T = TB(), s = new Sec("dimensionamento", "7. Dimensionamento por circuito"), L1 = [], L2 = [], vistos = {};
    s.p("Método (" + T.COORD.item + " e " + T.n5410("6.2.5") + "): IB = P/V; método de instalação pela " + T.T33.item + "; Iz = Iz(" + T.T36.item + ") × FCT (" + T.T40.item + ") × FCA (" + T.T42.item + "); seção = a maior entre a capacidade de condução, a mínima (" + T.T47.item + ") e a que mantém a queda de tensão (" + T.QUEDA.item + "); disjuntor com IB ≤ In ≤ Iz; PE pela " + T.T58.item + ".");
    A.circuitos.forEach(function (c) {
      var d = c.dim, cap = secaoCapacidade(d.metodo.ref, d.In, d.ft, d.fa), L = fin(c.Lmax) ? c.Lmax : d.L, qS = secaoQueda(L, d.va / d.V, d.V, d.limiteQueda);
      L1.push([c.id, c.nome, br(d.va, 0), d.V + " V " + (c.fases || "?"), br(d.ib, 2), d.metodo.ref + " (nº " + d.metodo.metodo + ", " + d.metodo.apl + ")", br(d.ft, 2), String(d.nAgrup), br(d.fa, 2)]);
      L2.push([c.id, sec(cap), sec(d.secMin), sec(qS), sec(d.secao), sec(d.pe), fin(d.iz) ? br(d.iz, 1) : "-", br(d.izc, 1), d.In + " A " + c.polos + "P", c.drId || "-", br(L, 1) + (d.estimado ? "*" : ""), br(d.dv, 2) + " (≤ " + br(d.limiteQueda, 2) + ")", d.ok ? "atende" : "NÃO ATENDE"]);
    });
    s.tab("7.1 Corrente de projeto, método e fatores", ["Circ.", "Descrição", "VA", "Tensão / fases", "IB (A)", "Método (Tab. 33)", "FCT", "Circ. no eletroduto", "FCA"], L1, ["", "", "r", "", "r", "", "r", "r", "r"]);
    s.tab("7.2 Seção, proteção e queda de tensão", ["Circ.", "S capacidade", "S mínima", "S queda", "S adotada (mm²)", "PE (mm²)", "Iz tab. (A)", "Iz corrigida (A)", "Disjuntor", "DR", "L (m)", "Queda % (limite)", "Situação"], L2, ["", "r", "r", "r", "r", "r", "r", "r", "", "", "r", "r", ""]);
    if (A.circuitos.some(function (c) { return c.dim.estimado; })) s.p("* comprimento ESTIMADO (ponto sem eletroduto traçado até o quadro).");
    s.sub("7.3 Memória de cálculo");
    var ordem = A.circuitos.slice().sort(function (x, y) { return y.dim.ib - x.dim.ib; }), escolhidos = [];
    if (ordem[0]) escolhidos.push([ordem[0], "circuito mais carregado"]);
    ["luz", "tug", "tue"].forEach(function (tp) { var c = ordem.filter(function (x) { return x.tipo === tp; })[0]; if (c && !vistos[c.id] && escolhidos.every(function (e) { return e[0].id !== c.id; })) escolhidos.push([c, "circuito de " + (tp === "luz" ? "iluminação" : tp === "tug" ? "tomadas" : "uso específico") + " mais carregado"]); });
    escolhidos.forEach(function (e) { s.calc(e[0].id + " — " + e[0].nome + " (" + e[1] + ")", memoriaCircuito(e[0], A)); });
    s.calc("Alimentador medidor → quadro e disjuntor geral", memoriaAlimentador(A));
    s.sub("7.4 DR, DPS e disjuntor geral");
    s.tab("Dispositivos DR (" + sens(A) + ")", ["DR", "Fases", "Polos", "Circuitos", "Σ IB (A)", "Σ In dos disjuntores (A)", "In do DR (A)"], A.drs.map(function (g) { return [g.id, g.fases, String(g.polos), g.circuitos.join(", "), br(g.somaIb, 2), br(g.somaIn, 0), g.In == null ? "não cabe" : String(g.In)]; }), ["", "", "r", "", "r", "r", "r"]);
    s.p("DR: " + T.DR.item + " — casos: " + ["a", "b", "c", "d"].map(function (k) { return k + ") " + T.DR.casos[k]; }).join("; ") + ". O DR não protege contra sobrecarga: a corrente nominal dele cobre a soma dos disjuntores a jusante, limitada à do geral (" + T.n5410("6.3.6.2.2 a)") + "; critério RA conservador). Grupos de até " + A.criterios.drCircuitosMax.valor + " circuitos.");
    s.p("DPS: " + (A.dps.exigido ? A.dps.regra + "." : "não adotado (" + A.criterios.dpsAQ2.fonte + ")."));
    s.p("Disjuntor geral: " + (A.geral.In ? A.geral.In + " A, " + A.geral.polos + (A.geral.polos === 1 ? " polo" : " polos") : "não verificado") + " (Ig = " + br(A.geral.ib, 2) + " A). Alimentador: " + (A.alimentador.secao ? sec(A.alimentador.secao) + " mm² + PE " + sec(A.alimentador.pe) + " mm², " + br(A.alimentador.comprimento, 1) + " m" + (A.alimentador.provisorio ? " (PROVISÓRIO)" : "") + ", queda " + br(A.alimentador.dv, 2) + " %" : "não verificado") + ".");
    return s;
  }
  function sEletrodutos(A) {
    var T = TB(), s = new Sec("eletrodutos", "8. Eletrodutos"), grupos = {}, ordem = [], porDn = {}, tr = A.grafo && A.grafo.trechos ? A.grafo.trechos : {};
    s.p("DN pelo número de condutores da mesma seção (" + T.OCUPACAO.fonte + "); com seções diferentes no mesmo eletroduto, todos contados como a maior (" + T.OCUPACAO.regra + "). A ficha não traz o diâmetro interno: a taxa de ocupação da " + T.n5410("6.2.11.1.6 a)") + " fica com o fabricante. Caixas e trechos: " + T.ELETRODUTO.texto + ".");
    s.p("Cada ramal do quadro leva no máximo " + A.criterios.circuitosPorEletroduto.valor + " circuito(s) (" + A.criterios.circuitosPorEletroduto.fonte + "); o aparelho de mais de " + A.criterios.pesadoIb.valor + " A vai em eletroduto só dele.");
    Object.keys(A.eletrodutos).forEach(function (t) {
      var e = A.eletrodutos[t], k = [e.circuitos.join(","), e.condutores, e.secaoMaior, e.dnMinimo, e.dn, e.lotado ? 1 : 0].join("|"), g = grupos[k];
      if (!g) { g = grupos[k] = { e: e, n: 0, m: 0, ids: [] }; ordem.push(k); }
      g.n++; g.ids.push(t); g.m += tr[t] ? tr[t].comprimento : 0;
      var dn = e.dn == null ? "?" : String(e.dn); porDn[dn] = (porDn[dn] || 0) + (tr[t] ? tr[t].comprimento : 0);
    });
    s.tab("Eletrodutos agrupados (trechos iguais juntos)", ["Circuitos", "Trechos", "Metros", "Condutores", "Seção maior (mm²)", "DN mínimo (ficha)", "DN no modelo", "Situação"],
      ordem.map(function (k) { var g = grupos[k], e = g.e; return [e.circuitos.join(", "), String(g.n), br(g.m, 2), String(e.condutores), sec(e.secaoMaior), e.dnMinimo == null ? "não cabe em DN 32" : String(e.dnMinimo), e.dn == null ? "-" : String(e.dn), e.lotado ? "LOTADO" : "atende"]; }), ["", "r", "r", "r", "r", "r", "r", ""]);
    s.p("Metros de eletroduto por DN (do modelo): " + Object.keys(porDn).sort(function (a, b) { return a - b; }).map(function (dn) { return "DN " + dn + " = " + br(porDn[dn], 2) + " m"; }).join("; ") + ". Total de trechos: " + Object.keys(A.eletrodutos).length + ".");
    return s;
  }
  function sQuadro(A) {
    var T = TB(), q = A.quadro, mod = A.modulos, nC = A.circuitos.length, s = new Sec("quadro", "9. Quadro de distribuição"), pol = A.circuitos.reduce(function (x, c) { return x + c.polos; }, 0);
    s.p((q && q.regra ? "Posição: " + q.regra + "." : "Posição: a do modelo" + (q && q.ambNome ? " (" + q.ambNome + ")" : "") + ".") + " Local de fácil acesso, identificado (" + T.n5410("6.5.4.8 e 6.5.4.9") + ").");
    s.tab("Espaços (módulos DIN)", ["Item", "Quantidade", "Módulos"], [
      ["Disjuntores dos circuitos (Σ polos)", String(nC) + " circuito(s)", String(pol)], ["Dispositivos DR (2 módulos cada)", String(A.drs.length), String(A.drs.length * 2)],
      ["DPS", A.dps.exigido ? String(A.dps.quantidade) : "0", String(A.dps.exigido ? A.dps.quantidade : 0)], ["Disjuntor geral", A.geral.polos + " polo(s)", String(A.geral.polos)],
      ["Reserva (" + T.T59.item + ")", String(A.reserva), String(A.reserva)], ["TOTAL", "", String(mod)]], ["", "r", "r"]);
    s.p(A.quadroModelo ? "Quadro escolhido: " + A.quadroModelo.espacos + " espaços, " + (A.quadroModelo.material === "pvc" ? "PVC" : "aço") + ", " + A.quadroModelo.instalacao + (A.quadroModelo.corrente ? ", barramento " + A.quadroModelo.corrente : "") + " (SINAPI " + A.quadroModelo.codigo + ")." : "Quadro: nenhum da SINAPI comporta " + mod + " espaços — dividir em dois quadros.");
    return s;
  }
  function sAterramento(A, opc) {
    var C = A.criterios, en = A.demanda.entrada, s = new Sec("aterramento", "10. Aterramento e equipotencialização");
    s.p("Esquema de aterramento considerado no cálculo: " + (opc.esquemaAterramento ? txt(opc.esquemaAterramento) + " (informado pelo usuário)" : "TN-S a partir do quadro (premissa de fábrica do dimensionamento do DPS e do PE, critério RA) — a definir pelo RT com a CEMIG") + ". Tensão fase-neutro de referência " + C.tensaoFN.valor + " V.");
    s.p(en ? "Entrada (" + en.tabela + ", faixa " + en.faixa + "): aterramento em cobre nu " + sec(en.aterramento_mm2) + " mm², " + en.hastes + " haste(s), condutor de proteção " + sec(en.pe_mm2) + " mm². Valores mínimos da CEMIG." : "Entrada: padrão não verificado.");
    s.p("Condutor de proteção (PE) de cada circuito: seção pela " + TB().T58.item + " (seção 7). Todo circuito leva PE e as tomadas e luminárias são ligadas a ele.");
    s.alerta("Esquema de aterramento (NR-10 10.4.4), interligação neutro/PE e equipotencialização principal e suplementar (banheiros): a definir e detalhar pelo RT. Os itens da norma correspondentes não foram transcritos neste sistema.");
    return s;
  }
  function sNr10(A) {
    var T = TB(), s = new Sec("nr10", "11. NR-10 — itens de segurança do memorial (10.4.9 a–f)"), nDR = A.drs.length, q = A.quadro;
    var conteudo = {
      a: "Proteção contra choques: PE em todos os circuitos (" + T.T58.item + "); DR de " + sens(A) + " em " + A.circuitos.filter(function (c) { return c.dr && c.dr.length; }).length + " circuito(s), agrupados em " + nDR + " dispositivo(s) (" + T.DR.item + "); " + (A.dps && A.dps.exigido ? "DPS no quadro" : "sem DPS (não adotado)") + "; quadro com tampa e advertência. Queimaduras: seção e disjuntor coordenados (" + T.COORD.item + ").",
      b: "Identificação: circuitos " + A.circuitos.map(function (c) { return c.id; }).join(", ") + " identificados no quadro e nos pontos (ver quadro de cargas ELE-01); luz, tomadas e aparelhos em circuitos distintos e separados (NR-10 10.4.3.1; " + T.DIVISAO.luzTomadaSeparados.split(" — ")[0] + ").",
      c: "Restrições de acesso: quadro de distribuição" + (q && q.ambNome ? " em " + q.ambNome : "") + ", centro a " + br(q && q.hm, 2) + " m do piso, de fácil acesso; restrição a pessoas qualificadas e sinalização de impedimento de reenergização: a definir pelo RT.",
      d: "Influências externas: temperatura ambiente de referência " + A.criterios.tempAmbiente.valor + " °C; banheiros, cozinha, área de serviço e externa tratados como locais molhados (DR); classificação das influências (água, corpos sólidos, corrosão) do local: a definir pelo RT.",
      e: "Princípio funcional: disjuntor termomagnético (sobrecarga e curto-circuito), DR de " + sens(A) + " (corrente diferencial-residual), DPS classe " + A.dps.classe + " (sobretensão transitória) e disjuntor geral seccionando a instalação.",
      f: "Compatibilidade: IB ≤ In ≤ Iz em todos os circuitos (" + (A.circuitos.every(function (c) { return c.dim.ok; }) ? "atendido" : "NÃO atendido em " + A.circuitos.filter(function (c) { return !c.dim.ok; }).map(function (c) { return c.id; }).join(", ")) + "); DR com In ≥ soma dos disjuntores a jusante, limitada ao geral; DPS com Uc " + A.dps.uc_V + " V e In " + A.dps.in_kA + " kA."
    };
    NR10.forEach(function (n) { s.li("NR-10 " + n[2] + " — " + n[1] + ": " + conteudo[n[0]]); });
    s.p("Demais itens aplicáveis ao projeto (NR-10 2026, vigência 01/06/2027): 10.4.1 dispositivos de desligamento com impedimento de reenergização e sinalização; 10.4.2 seccionamento de ação simultânea; 10.4.4 esquema de aterramento definido; 10.4.8 projeto sob responsabilidade de profissional legalmente habilitado; 10.4.13 projeto atualizado como executado.");
    return s;
  }
  function sMateriais(A, opc, mats) {
    var s = new Sec("materiais", "12. Lista de materiais (resumo)"), P = PL();
    if (!mats || !mats.length) { s.p("Lista de materiais: veja a planilha (.xlsx) deste projeto."); return s; }
    s.tab("Materiais por item", ["Item", "Un.", "Quantidade", "Código SINAPI", "Situação"], mats.map(function (m) { return [m.item, m.unidade, br(m.quantidade, 2), m.codigo || "pendente", m.situacao]; }), ["", "", "r", "", ""]);
    s.p("Quantidades do cálculo (cabo por seção e cor, disjuntores, DR, DPS) e do modelo 3D (eletrodutos, caixas, dispositivos). Detalhe, origem e fonte do preço: planilha .xlsx, aba \"Lista de materiais\". Nada é cobrado duas vezes: o cabo é do projeto de circuitos; o eletroduto, a caixa e o quadro, do modelo.");
    void P; return s;
  }
  function sPendencias(pend) {
    var s = new Sec("pendencias", "13. Pendências e itens sem fonte");
    if (!pend.length) { s.p("Nenhuma pendência registrada."); return s; }
    s.p("Vermelho = sem fonte lida ou a decidir pelo RT; amarelo = aviso ou critério RA a validar. O memorial não diz \"atende\" enquanto houver item vermelho.");
    pend.forEach(function (p) { s.blocos.push({ t: p.nivel === "vermelho" ? "alerta" : "li", x: (p.nivel === "vermelho" ? "[VERMELHO] " : "[AMARELO] ") + p.texto }); });
    return s;
  }
  function situacao(pend) {
    var v = pend.filter(function (p) { return p.nivel === "vermelho"; }).length, a = pend.length - v;
    return { vermelhos: v, amarelos: a, ok: v === 0, texto: v ? "EMITIDO COM " + v + " ITEM(NS) EM VERMELHO — não atende para assinatura até o RT resolver as pendências da seção 13" : "Sem item em vermelho; conferir os " + a + " aviso(s) da seção 13" };
  }
  function sTermo(A, opc, pend) {
    var s = new Sec("termo", "14. Termo do responsável técnico"), sit = situacao(pend), rt = txt(opc.responsavel), reg = txt(opc.registro), emp = opc.empresa, nomeEmp = emp && typeof emp === "object" ? txt(emp.nome) : txt(emp);
    s.p("O responsável técnico declara que o cálculo acima segue os métodos e as fontes indicados, com a ressalva da NBR 5410:2004 em cópia não licenciada e sem a Errata 1/2008 (seção 2). Situação nesta emissão: " + sit.texto + ".");
    s.blocos.push({ t: "assin", rt: rt || "[NOME DO RESPONSÁVEL TÉCNICO]", titulo: txt(opc.tituloProfissional) || "[TÍTULO]", reg: reg || "[Nº DO REGISTRO NO CREA/CAU]", empresa: nomeEmp || "RA Engenharia", contratante: txt(opc.contratante || opc.proprietario) || "[NOME DO CONTRATANTE]", local: txt(opc.local) || "[LOCAL]", data: txt(opc.data) || hoje() });
    return s;
  }

  /* ------------------------------------------------------------------ SAÍDA */
  var CSS = "body{font:10.5pt/1.5 'Segoe UI',Helvetica,Arial,sans-serif;max-width:980px;margin:24px auto;padding:0 18px;color:#1d2733}" +
    "h1{font-size:19pt;margin:0 0 4px;color:#0F2740}h2{font-size:13.5pt;margin:26px 0 8px;color:#0F2740;border-bottom:2px solid #A89868;padding-bottom:3px}h3{font-size:11pt;margin:14px 0 4px;color:#0F2740}" +
    "table{border-collapse:collapse;width:100%;margin:8px 0 12px;font-size:9pt}th{background:#0F2740;color:#fff;padding:4px 6px;text-align:left}td{border:1px solid #cbd5e1;padding:3px 6px;vertical-align:top}" +
    "td.r,th.r{text-align:right}tr:nth-child(even) td{background:#f4f6f9}.cap{font-size:9.5pt;color:#475569;margin:10px 0 0;font-weight:600}" +
    "pre.calc{background:#f4f6f9;border-left:3px solid #A89868;padding:8px 10px;font:9pt/1.4 Consolas,'Courier New',monospace;white-space:pre-wrap;margin:4px 0 12px}" +
    ".alerta{background:#fbefed;border-left:4px solid #a3352b;color:#7a1f18;padding:7px 10px;border-radius:4px;margin:8px 0}.aviso{background:#fff3cd;padding:8px 10px;border-radius:4px}" +
    "li.v{color:#7a1f18}.sit{font-weight:700}.assin{display:flex;gap:40px;margin-top:40px}.assin div{flex:1;border-top:1px solid #1d2733;padding-top:4px;font-size:9.5pt}" +
    ".capa{border-bottom:3px solid #0F2740;padding-bottom:10px;margin-bottom:10px}nav ol{columns:2;font-size:9.5pt}@media print{h2{page-break-after:avoid}table{page-break-inside:auto}tr{page-break-inside:avoid}body{margin:0 auto}}";
  function htmlBloco(b) {
    if (b.t === "p") return "<p>" + esc(b.x) + "</p>";
    if (b.t === "li") return "<ul><li>" + esc(b.x) + "</li></ul>";
    if (b.t === "alerta") return "<div class=\"alerta\">" + esc(b.x) + "</div>";
    if (b.t === "sub") return "<h3>" + esc(b.x) + "</h3>";
    if (b.t === "tab") return "<div class=\"cap\">" + esc(b.titulo) + "</div><table><thead><tr>" + b.cab.map(function (h, i) { return "<th" + (b.alin[i] === "r" ? " class=\"r\"" : "") + ">" + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      b.linhas.map(function (l) { return "<tr>" + l.map(function (c, i) { return "<td" + (b.alin[i] === "r" ? " class=\"r\"" : "") + ">" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>";
    if (b.t === "calc") return "<div class=\"cap\">" + esc(b.titulo) + "</div><pre class=\"calc\">" + esc(b.linhas.join("\n")) + "</pre>";
    if (b.t === "assin") return "<div class=\"assin\"><div><b>" + esc(b.rt) + "</b><br>" + esc(b.titulo) + " — " + esc(b.reg) + "<br>" + esc(b.empresa) + "</div><div><b>" + esc(b.contratante) + "</b><br>Contratante</div></div><p>" + esc(b.local) + ", " + esc(b.data) + ".</p>";
    return "";
  }
  function textoBloco(b) {
    if (b.t === "p" || b.t === "alerta") return b.x;
    if (b.t === "li") return "- " + b.x;
    if (b.t === "sub") return "\n" + b.x;
    if (b.t === "tab") return b.titulo + "\n" + b.cab.join(" | ") + "\n" + b.linhas.map(function (l) { return l.join(" | "); }).join("\n");
    if (b.t === "calc") return b.titulo + "\n" + b.linhas.join("\n");
    if (b.t === "assin") return b.rt + " — " + b.titulo + " — " + b.reg + " — " + b.empresa + "\nContratante: " + b.contratante + "\n" + b.local + ", " + b.data + ".";
    return "";
  }
  function gerar(A, opc) {
    opc = opc || {};
    var T = TB(), titulo0 = "Memorial descritivo e de cálculo — instalações elétricas";
    if (!A || !A.ok || !arr(A.circuitos).length) return { ok: false, motivo: A && A.motivo ? A.motivo : "Sem circuitos analisados: rode \"Circuitos e quadro\" antes do memorial.", titulo: titulo0, secoes: [], html: "", texto: "", pendencias: [], indefinidos: 0 };
    var P = PL(), mats = opc.materiais || null;
    if (!mats && P && P.materiais) { try { mats = P.materiais(A, opc); } catch (e) { mats = null; } }
    var o2 = {}; Object.keys(opc).forEach(function (k) { o2[k] = opc[k]; }); o2.materiais = mats || [];
    var pend = pendencias(A, o2), sit = situacao(pend), data = txt(opc.data) || hoje();
    var secs = [sIdent(A, o2, pend), sNormas(A), sFornecimento(A), sCargas(A, o2), sDivisao(A), sDemanda(A), sDimensionamento(A), sEletrodutos(A), sQuadro(A), sAterramento(A, o2), sNr10(A), sMateriais(A, o2, mats), sPendencias(pend), sTermo(A, o2, pend)];
    var titulo = titulo0 + (opc.obra ? " — " + txt(opc.obra) : "");
    var indef = 0;
    function limpa(s) { s = txt(s); if (RE_INDEF.test(s)) { indef++; return s.replace(/\b(undefined|NaN|null|Infinity)\b/g, "[valor indefinido]"); } return s; }
    /* limpeza dos textos (nunca "undefined"/"NaN" no documento) */
    secs.forEach(function (s) {
      s.blocos.forEach(function (b) {
        if (b.x != null) b.x = limpa(b.x);
        if (b.titulo != null) b.titulo = limpa(b.titulo);
        if (b.linhas) b.linhas = b.linhas.map(function (l) { return Array.isArray(l) ? l.map(limpa) : limpa(l); });
        if (b.cab) b.cab = b.cab.map(limpa);
      });
      s.itens = itensDe(s);
    });
    var cap = "<div class=\"capa\">" + (opc.logo ? "<img src=\"" + esc(opc.logo) + "\" alt=\"\" style=\"max-height:56px;float:right\">" : "") + "<h1>" + esc(titulo) + "</h1><div>" + esc((txt(opc.numero) ? opc.numero + " " : "") + (txt(opc.revisao) || "R00") + " — " + data) + "</div>" +
      "<p class=\"sit\" style=\"color:" + (sit.ok ? "#1b6e3c" : "#a3352b") + "\">" + esc(sit.texto) + "</p></div>";
    var nav = "<nav><ol>" + secs.map(function (s) { return "<li><a href=\"#s-" + s.id + "\">" + esc(s.titulo.replace(/^\d+\.\s*/, "")) + "</a></li>"; }).join("") + "</ol></nav>";
    var corpo = secs.map(function (s) { return "<h2 id=\"s-" + s.id + "\">" + esc(s.titulo) + "</h2>" + s.blocos.map(htmlBloco).join(""); }).join("");
    var html = "<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><title>" + esc(titulo) + "</title><style>" + CSS + "</style></head><body>" + cap +
      "<p class=\"aviso\">" + esc(T.NORMA.ressalva) + "</p>" + nav + corpo + "</body></html>";
    var texto = titulo + "\n" + (txt(opc.numero) ? opc.numero + " " : "") + (txt(opc.revisao) || "R00") + " — " + data + "\n" + sit.texto + "\n\n" + secs.map(function (s) { return s.titulo + "\n" + s.blocos.map(textoBloco).join("\n"); }).join("\n\n");
    return { ok: true, titulo: titulo, secoes: secs.map(function (s) { return { id: s.id, titulo: s.titulo, itens: s.itens, blocos: s.blocos }; }), html: html, texto: texto, pendencias: pend, situacao: sit, indefinidos: indef, materiais: mats || [] };
  }

  var EleMemorial = { VERSAO: 1, gerar: gerar, pendencias: pendencias, referencias: referencias, memoriaCircuito: memoriaCircuito, memoriaAlimentador: memoriaAlimentador, contaDemanda: contaDemanda,
    quedaTerminal: quedaTerminal, secaoCapacidade: secaoCapacidade, secaoQueda: secaoQueda, situacao: situacao };
  global.EleMemorial = EleMemorial;
  if (typeof module !== "undefined" && module.exports) module.exports = EleMemorial;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
