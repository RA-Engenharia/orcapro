/* =====================================================================
 * madauditor.js — PENTE-FINO antes de entregar um projeto de madeira (motor PURO, ES5, sem DOM, Node-testável).
 * As regras saem da revisão adversarial da Casa Mar (REVISAO_CALCULO.md, 23/10/2026): cada uma é um erro que um modelo "feliz" deixou passar.
 * Cada achado = { regra, peca, mensagem, correcao, gravidade }.
 *
 *   MadAuditor.auditar({ pecas (a FONTE: madtipologias), ligacoes (madligacoes.pacoteT1), params (T1), terreno (function(x,y) → cota),
 *                        modelo + analisar (opcional: teste de mecanismo) }, opcoes) → { achados[], porRegra{}, ok }
 *
 * REGRAS:
 *   peca-sem-apoio          peça com menos de 2 apoios (contatos com peças do mesmo nível ou abaixo; pilar: base externa + topo)
 *   balanco-barrote         balanço de barrote além do limite (padrão 1,0 m; R: 1,9 m deu η ≈ 2,1)
 *   pilarete-sem-travamento pilarete rotulado (sem engaste) mais alto que 0,40 m sem mão-francesa
 *   esbeltez                λ > 140 em peça comprimida (L0 da peça; verga sem pendural: L0 = vão)
 *   topo-vidro-sem-peca     fachada de vidro sem a verga do topo (leva o vento ao pilar)
 *   pendural-sem-apoio      pendural cujo topo não encosta numa travessa/terça, ou cuja base não encosta na verga
 *   mecanismo               a análise global não fecha (estrutura instável) — só com `modelo` + `analisar`
 *   ligacao-sem-aco         ligação sem verificação do aço (chapa/Mpl, placa de base, chumbadores) ou com η > 1
 *   reforco-ft90-ausente    tração normal à fibra na V sem o reforço (parafusos de rosca total) na lista de peças
 *   peca-abaixo-do-terreno  peça inteira abaixo da cota do terreno (se o terreno for dado)
 *   cadeia-de-apoio         (C4) peça cuja cadeia de contatos não chega a um apoio EXTERNO (pilar com base, bloco, terra): V e verga que só se apóiam entre si não valem
 *   peca-duplicada          (C4) duas peças com o mesmo eixo e a mesma seção (volume contado em dobro)
 *   ligacao-ausente         (C4) contato estrutural (terça×V, pilar×V, verga×V, base, escora, bloqueador) sem o item de ligação na lista de peças
 *   dimensionamento         (C4) o laço de dimensionamento não fechou (semSolucao) ou algum grupo ficou com η/flecha > 1 — precisa de E.dim = { semSolucao, pior }
 * CONTROLE NEGATIVO: tools/test-mad-eng-auditor.js e test-mad-eng-casamar.js tiram a verga, o pendural, o reforço e põem balanço de 1,9 m.
 * Teste: node tools/test-mad-eng-auditor.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var PADRAO = { limiteBalancoBarrote: 1.0, alturaMaoFrancesa: 0.40, esbeltezMax: 140, tolContato: 0.05, apoiosMin: 2, tolTerreno: 0.02 };

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  /** distância mínima entre dois segmentos 3D (Ericson) e parâmetros do ponto mais próximo no primeiro */
  function distSeg(p1, q1, p2, q2) {
    var d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2), a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r), s, t, c, b, den;
    if (a < 1e-12 && e < 1e-12) return { d: len(r), s: 0 };
    if (a < 1e-12) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
    else {
      c = dot(d1, r);
      if (e < 1e-12) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
      else {
        b = dot(d1, d2); den = a * e - b * b;
        s = den > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
      }
    }
    var c1 = [p1[0] + d1[0] * s, p1[1] + d1[1] * s, p1[2] + d1[2] * s], c2 = [p2[0] + d2[0] * t, p2[1] + d2[1] * t, p2[2] + d2[2] * t];
    return { d: len(sub(c1, c2)), s: s, t: t };
  }
  function dimMax(p) { var s = p.secao; return s ? (s.tipo === "circ" ? s.d : Math.max(s.b || 0, s.h || 0)) : 0; }
  function dimMin(p) { var s = p.secao; return s ? (s.tipo === "circ" ? s.d : Math.min(s.b || 0, s.h || 0)) : 0; }
  function eixo(p) { return p.eixo || [p.p0, p.p1]; }
  function ehLinear(p) { return p.secao && p.p0 && p.p1; }
  /** nível estrutural: 0 pilar, 1 viga/verga, 2 terça/barrote/travamentos */
  function nivel(p) {
    if (p.nivel != null) return p.nivel;
    if (/pilar|pilarete/i.test(p.grupo || "") && !/espa/.test(p.id)) return 0;
    if (/^V\d|^VG|-V\d|vigas/i.test(p.id) || /vigas|vergas do vidro/i.test(p.grupo || "") && /^VG/.test(p.id)) return 1;
    return 2;
  }
  function eSecundaria(p) { return /contraventamento/i.test(p.grupo || "") || /-esp$/.test(p.id) || /^FX/.test(p.id); }

  function achado(regra, peca, mensagem, correcao, gravidade) { return { regra: regra, peca: peca, mensagem: mensagem, correcao: correcao, gravidade: gravidade || "alta" }; }

  /* ------------------------------------------------------------ contatos */
  function contatos(pecas, tol) {
    var lin = pecas.filter(function (p) { return ehLinear(p) && !eSecundaria(p); }), mapa = {}, i, j;
    lin.forEach(function (p) { mapa[p.id] = []; });
    for (i = 0; i < lin.length; i++) {
      for (j = i + 1; j < lin.length; j++) {
        var a = lin[i], b = lin[j], ea = eixo(a), eb = eixo(b), lim = dimMax(a) / 2 + dimMax(b) / 2 + tol;
        var r = distSeg(ea[0], ea[1], eb[0], eb[1]);
        if (r.d <= lim) { mapa[a.id].push({ outro: b, s: r.s, t: r.t }); mapa[b.id].push({ outro: a, s: r.t, t: r.s }); }
      }
    }
    return { mapa: mapa, lin: lin };
  }

  function regraSemApoio(E, op, C) {
    var out = [];
    C.lin.forEach(function (p) {
      var n = nivel(p), ap = 0, ids = {};
      C.mapa[p.id].forEach(function (c) {
        var no = nivel(c.outro);
        if (n === 0 || no <= n) { if (!ids[c.outro.id]) { ids[c.outro.id] = 1; ap++; } }
      });
      if (p.apoio_externo) ap++;
      if (p.apoios_externos && p.apoios_externos.length) ap += p.apoios_externos.length;
      if (ap < op.apoiosMin) out.push(achado("peca-sem-apoio", p.id, "Peça " + p.id + " (" + (p.grupo || "") + ") com " + ap + " apoio(s): menos que " + op.apoiosMin + " — não fica em equilíbrio / vira mecanismo.", "Apoiar em pelo menos 2 pontos (pilar, viga, bloco ou terra) ou prender a uma peça estável e verificar a ligação."));
    });
    return out;
  }
  function regraBalanco(E, op, C) {
    var out = [];
    C.lin.filter(function (p) { return /barrote/i.test(p.grupo || ""); }).forEach(function (p) {
      var L = p.comprimento_m || len(sub(p.p1, p.p0)), ts = [];
      C.mapa[p.id].forEach(function (c) { if (nivel(c.outro) < nivel(p) || /viga/i.test(c.outro.grupo || "")) ts.push(c.s); });
      if (!ts.length) return;
      var bal = Math.max(Math.min.apply(null, ts) * L, (1 - Math.max.apply(null, ts)) * L);
      if (bal > op.limiteBalancoBarrote + 1e-9) out.push(achado("balanco-barrote", p.id, "Barrote " + p.id + " com balanço de " + bal.toFixed(2).replace(".", ",") + " m (limite " + op.limiteBalancoBarrote.toFixed(2).replace(".", ",") + " m) além da última viga.", "Pôr a viga de borda a no máximo " + (op.limiteBalancoBarrote * 0.4).toFixed(2).replace(".", ",") + " m da ponta do barrote, ou reduzir o balanço."));
    });
    return out;
  }
  function regraPilarete(E, op) {
    var out = [], ids = {};
    E.pecas.forEach(function (p) { ids[p.id] = p; });
    E.pecas.filter(function (p) { return p.pilarete; }).forEach(function (p) {
      if (p.engastado || p.h_livre == null || p.h_livre <= op.alturaMaoFrancesa) return;
      var mf = p.id.replace(/-P(\d+)$/, "-MF$1");
      if (!ids[mf]) out.push(achado("pilarete-sem-travamento", p.id, "Pilarete " + p.id + " de " + p.h_livre.toFixed(2).replace(".", ",") + " m rotulado nas duas pontas, sem mão-francesa nem base engastada.", "Pôr mão-francesa nas duas direções (peça " + mf + ") ou engastar a base."));
    });
    return out;
  }
  function regraEsbeltez(E, op, C) {
    var out = [], vgs = {};
    E.pecas.forEach(function (p) { if (/^PD\d/.test(p.id)) vgs[p.id.replace("PD", "VG")] = true; });
    C.lin.forEach(function (p) {
      var comprimida = /pilar|pilarete|travamentos/i.test(p.grupo || "") || /^PD/.test(p.id) || /^VG/.test(p.id);
      if (!comprimida) return;
      var L = p.comprimento_m || len(sub(p.p1, p.p0)), L0 = p.L0 || L;
      if (/^VG/.test(p.id) && !p.L0) L0 = vgs[p.id] ? L / 2 : L;                 // pendural no meio do vão trava o eixo fraco
      var i = p.secao.tipo === "circ" ? p.secao.d / 4 : dimMin(p) / Math.sqrt(12), lam = L0 / i;
      if (lam > op.esbeltezMax) out.push(achado("esbeltez", p.id, "Peça " + p.id + ": λ = " + lam.toFixed(0) + " > " + op.esbeltezMax + " (L0 = " + L0.toFixed(2).replace(".", ",") + " m, i = " + (i * 100).toFixed(1).replace(".", ",") + " cm)" + (/^VG/.test(p.id) && !vgs[p.id] ? " — verga sem pendural: o eixo fraco trabalha no vão inteiro" : "") + ".", "Travar a peça (pendural, escora, bloqueador) ou aumentar a seção."));
    });
    return out;
  }
  function regraTopoVidro(E, op) {
    var out = [], P = E.params;
    if (!P || P.vidroTopo == null || P.semVidro) return out;
    var vg = E.pecas.filter(function (p) { return p.vitrine_topo; });
    (P.pilares.y).forEach(function (y, ip) {
      var vao = P.pilares.x[1] - P.pilares.x[0];
      var tem = vg.some(function (p) { return Math.abs(p.p0[1] - y) < 0.3 && Math.abs(p.p1[1] - y) < 0.3 && Math.abs(p.p1[0] - p.p0[0]) >= 0.9 * vao; });
      if (!tem) out.push(achado("topo-vidro-sem-peca", "fachada " + (ip === 0 ? "frente" : "fundos"), "A fachada de vidro " + (ip === 0 ? "da frente" : "dos fundos") + " (y = " + y.toFixed(2).replace(".", ",") + " m) não tem a verga do topo: o vento da fachada cairia numa terça 0,3 a 0,8 m acima do vidro.", "Pôr a verga deitada entre os pilares na cota do topo do vidro (e o pendural/travessa) — revisão C2."));
    });
    return out;
  }
  function regraPendural(E, op) {
    var out = [];
    E.pecas.filter(function (p) { return /^PD\d/.test(p.id); }).forEach(function (p) {
      var topo = [p.p1[0], p.p1[1], p.p1[2]], base = p.p0, ok1 = false, ok2 = false;
      var ip = p.id.replace("PD", "");
      E.pecas.forEach(function (q) {
        if (!ehLinear(q) || q === p) return;
        var dt = distSeg(topo, topo, q.p0, q.p1).d, db = distSeg(base, base, q.p0, q.p1).d;
        if (/^TR/.test(q.id) && dt <= dimMax(q) / 2 + dimMax(p) / 2 + 0.15) ok1 = true;
        if (/^VG/.test(q.id) && db <= dimMax(q) / 2 + dimMax(p) / 2 + 0.15) ok2 = true;
      });
      if (!ok1) out.push(achado("pendural-sem-apoio", p.id, "O pendural " + p.id + " sobe até uma cota onde não há travessa nem terça: não leva carga nenhuma (revisão N1).", "Pôr a travessa entre as terças vizinhas e apoiar o pendural nela."));
      if (!ok2) out.push(achado("pendural-sem-apoio", p.id, "O pendural " + p.id + " não encosta na verga.", "Prender o pendural ao meio da verga."));
    });
    return out;
  }
  function regraLigacao(E, op) {
    var out = [], L = E.ligacoes;
    if (!L) return out;
    if (!L.base || !L.base.chapa || L.base.chapa.eta == null) out.push(achado("ligacao-sem-aco", "base do pilar", "A ligação da base só verificou os pinos: falta a chapa de aço (Mpl,Rd).", "Verificar a chapa (t·h²/4·fy/γa1), a solda, a placa de base e os chumbadores (NBR 8800)."));
    if (!L.placaBase || !L.placaBase.chumbadores) out.push(achado("ligacao-sem-aco", "placa de base", "Placa de base e chumbadores não dimensionados.", "Dimensionar a placa e os chumbadores com as reações do pilar e mandá-las à fundação."));
    (L.verificacoes || []).forEach(function (v) { if (!v.ok || v.eta > 1 + 1e-9) out.push(achado("ligacao-sem-aco", v.nome, "Ligação '" + v.nome + "' com η = " + v.eta.toFixed(2).replace(".", ",") + " (> 1).", /^base-cruz$/.test(v.nome) ? "Usar base em garfo ou aumentar o lado/diâmetro do pilar (afastamento do pino à fenda) e calcular de novo." : /^placa-solda$/.test(v.nome) ? "Solda chapa-placa reprovada: usar base em garfo, aumentar o diâmetro/lado do pilar (chapa mais larga) ou a espessura da chapa e calcular de novo." : /^placa-/.test(v.nome) ? "Aumentar a espessura da placa de base, o diâmetro ou o número dos chumbadores e calcular de novo." : "Aumentar o nº de pinos/parafusos ou a chapa e verificar de novo.")); });
    return out;
  }
  function regraReforco(E, op) {
    var out = [], L = E.ligacoes;
    if (!L || !L.reforcoV || !(L.esforcos && L.esforcos.topo && L.esforcos.topo.Ntracao > 0)) return out;
    var item = E.pecas.filter(function (p) { return p.id === "WT-RV" && (p.qtd || 0) >= (E.params && E.params.pilares ? 4 : 1) * L.reforcoV.parafusos; })[0];
    if (!item) out.push(achado("reforco-ft90-ausente", "viga V sobre o pilar", "O pilar puxa a V para baixo (T = " + L.esforcos.topo.Ntracao.toFixed(1).replace(".", ",") + " kN, Ft,90 = " + L.reforcoV.Ft90_d.toFixed(1).replace(".", ",") + " kN) e a lista de peças não traz o reforço à tração normal (" + L.reforcoV.parafusos + " parafusos de rosca total por pilar).", "Incluir os parafusos de reforço (WT-T verticais) com he/h do detalhe — revisão A2."));
    return out;
  }
  function regraTerreno(E, op) {
    var out = [];
    if (typeof E.terreno !== "function") return out;
    E.pecas.filter(ehLinear).forEach(function (p) {
      if (p.secao.tipo === "perfil") return;
      var zt0 = E.terreno(p.p0[0], p.p0[1]), zt1 = E.terreno(p.p1[0], p.p1[1]);
      if (p.p0[2] < zt0 - op.tolTerreno && p.p1[2] < zt1 - op.tolTerreno) out.push(achado("peca-abaixo-do-terreno", p.id, "A peça " + p.id + " fica toda abaixo do terreno do modelo (cota " + Math.max(p.p0[2], p.p1[2]).toFixed(2).replace(".", ",") + " m contra terreno " + Math.min(zt0, zt1).toFixed(2).replace(".", ",") + " m).", "Conferir o terreno/aterro; trocar por apoio em mureta ou bloco; madeira em contato com o solo pede categoria de uso 4 e drenagem."));
    });
    return out;
  }
  function regraMecanismo(E) {
    var out = [];
    if (!E.modelo || !E.analisar) return out;
    try {
      var r = E.analisar(E.modelo, { combinacoes: [{ id: "g", fatores: { G1: 1 } }], estacoes: 2 });
      if (!r.ok) out.push(achado("mecanismo", "modelo", "A análise global não fecha: " + (r.motivo || "estrutura instável") + ".", "Prender o grau de liberdade solto (escora, contraventamento, engaste) — revisão A4."));
    } catch (e) { out.push(achado("mecanismo", "modelo", "A análise global falhou: " + e.message, "Prender o grau de liberdade solto (escora, contraventamento, engaste) — revisão A4.")); }
    return out;
  }

  /* C4 — a "cadeia de apoio" parte dos apoios externos e propaga pelos contatos: o que não é alcançado não está ligado ao chão */
  function regraCadeia(E, op, C) {
    var out = [], ok = {}, fila = [];
    C.lin.forEach(function (p) { if (p.apoio_externo || (p.apoios_externos && p.apoios_externos.length)) { ok[p.id] = 1; fila.push(p); } });
    while (fila.length) { var q = fila.pop(); C.mapa[q.id].forEach(function (c) { if (!ok[c.outro.id]) { ok[c.outro.id] = 1; fila.push(c.outro); } }); }
    C.lin.forEach(function (p) { if (!ok[p.id]) out.push(achado("cadeia-de-apoio", p.id, "Peça " + p.id + " (" + (p.grupo || "") + "): a cadeia de apoios NÃO chega a um apoio externo (pilar com base, bloco ou terra) — a estrutura está solta no ar.", "Conferir os pilares/apoios externos do modelo e se a peça encosta numa peça que desce até o chão.", "critica")); });
    return out;
  }
  function regraDuplicada(E, op, C) {
    var out = [], i, j, tol = 0.02;
    for (i = 0; i < C.lin.length; i++) for (j = i + 1; j < C.lin.length; j++) {
      var a = C.lin[i], b = C.lin[j], sa = a.secao, sb = b.secao;
      if (sa.tipo !== sb.tipo || Math.abs((sa.b || 0) - (sb.b || 0)) > 1e-6 || Math.abs((sa.h || 0) - (sb.h || 0)) > 1e-6 || Math.abs((sa.d || 0) - (sb.d || 0)) > 1e-6) continue;
      var ea = eixo(a), eb = eixo(b), d1 = Math.max(len(sub(ea[0], eb[0])), len(sub(ea[1], eb[1]))), d2 = Math.max(len(sub(ea[0], eb[1])), len(sub(ea[1], eb[0])));
      if (Math.min(d1, d2) <= tol) out.push(achado("peca-duplicada", b.id, "As peças " + a.id + " e " + b.id + " têm o mesmo eixo e a mesma seção: peça duplicada (volume e custo em dobro).", "Apagar uma das duas.", "alta"));
    }
    return out;
  }
  /** contato (regex da peça A, regex da B) → item de ligação exigido na lista de peças */
  var LIGACOES_EXIGIDAS = [[/^T\d+$/, /^V\d+$/, "WT-TV", "terça × viga V"], [/^P\d+[ab]?$/, /^V\d+$/, "LIG-TOPO", "topo do pilar × viga V"], [/^VG\d+$/, /^V\d+$/, "LIG-VG", "verga × viga V"],
    [/^ES\d+-/, /^T\d+$/, "ESC-LIG", "escora × terça"], [/^BL\d+-/, /^T\d+$/, "WT-190", "bloqueador × terça"]];
  function regraLigacaoAusente(E, op, C) {
    var out = [], ids = {}, pedidos = {};
    E.pecas.forEach(function (p) { ids[p.id] = 1; });
    C.lin.forEach(function (a) {
      if (/^P\d+[ab]?$/.test(a.id) && a.apoio_externo) pedidos["LIG-BASE"] = "base do pilar " + a.id;
      C.mapa[a.id].forEach(function (c) {
        LIGACOES_EXIGIDAS.forEach(function (r) { if (r[0].test(a.id) && r[1].test(c.outro.id)) pedidos[r[2]] = pedidos[r[2]] || r[3] + " (" + a.id + " × " + c.outro.id + ")"; });
      });
    });
    Object.keys(pedidos).forEach(function (id) { if (!ids[id]) out.push(achado("ligacao-ausente", id, "Há contato estrutural " + pedidos[id] + " mas a lista de peças não traz o item de ligação " + id + ".", "Incluir a ligação " + id + " (verificada) na lista de peças e na cotação.", "critica")); });
    return out;
  }
  function regraDimensionamento(E) {
    var out = [], d = E.dim;
    if (!d) return out;
    if (d.semSolucao) out.push(achado("dimensionamento", "modelo", "O laço de dimensionamento NÃO fechou (semSolucao): alguma seção chegou ao limite e ainda reprova.", "Aumentar os limites de seção, reduzir vãos/cargas ou trocar o material/classe.", "critica"));
    Object.keys(d.pior || {}).forEach(function (k) { if (d.pior[k] > 1 + 1e-9) out.push(achado("dimensionamento", k, "Grupo " + k + " com η ou flecha = " + d.pior[k].toFixed(2).replace(".", ",") + " > 1.", "Aumentar a seção do grupo " + k + " (ou apoiar/travar) e recalcular.", "critica")); });
    return out;
  }

  var REGRAS = {
    "peca-sem-apoio": regraSemApoio, "balanco-barrote": regraBalanco, "pilarete-sem-travamento": regraPilarete, "esbeltez": regraEsbeltez,
    "topo-vidro-sem-peca": regraTopoVidro, "pendural-sem-apoio": regraPendural, "ligacao-sem-aco": regraLigacao, "reforco-ft90-ausente": regraReforco,
    "peca-abaixo-do-terreno": regraTerreno, "mecanismo": regraMecanismo,
    "cadeia-de-apoio": regraCadeia, "peca-duplicada": regraDuplicada, "ligacao-ausente": regraLigacaoAusente, "dimensionamento": regraDimensionamento
  };

  /** E = { pecas, ligacoes, params, terreno, modelo, analisar }. opcoes sobrescreve PADRAO; opcoes.regras = lista de regras a rodar */
  function auditar(E, opcoes) {
    var op = {}, k; for (k in PADRAO) op[k] = (opcoes && opcoes[k] != null) ? opcoes[k] : PADRAO[k];
    if (!E.analisar && E.analise && typeof require === "function") { try { E.analisar = (global.AcoAnalise || require("./acoanalise.js")).analisar; } catch (e) { E.analisar = null; } }
    var C = contatos(E.pecas, op.tolContato), achados = [];
    var lista = ((opcoes && opcoes.regras) || Object.keys(REGRAS)).filter(function (nome) { return nome !== "mecanismo" || (opcoes && opcoes.verificarMecanismo); });
    lista.forEach(function (nome) {
      achados = achados.concat(REGRAS[nome](E, op, C));
    });
    var porRegra = {}; achados.forEach(function (a) { porRegra[a.regra] = (porRegra[a.regra] || 0) + 1; });
    return { achados: achados, porRegra: porRegra, ok: achados.length === 0, regras: lista };
  }

  var MadAuditor = { auditar: auditar, REGRAS: Object.keys(REGRAS), PADRAO: PADRAO, distSeg: distSeg };
  if (typeof module !== "undefined" && module.exports) module.exports = MadAuditor;
  else global.MadAuditor = MadAuditor;
})(typeof window !== "undefined" ? window : this);
