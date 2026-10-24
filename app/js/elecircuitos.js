/* =====================================================================
 * elecircuitos.js — CIRCUITOS, QUADRO, CONDUTORES E ELETRODUTOS (frente E2, 21/10/2026). Motor PURO, ES5, Node-testável.
 *
 * Sobre os PONTOS da frente E1 (js/eleauto.js: luz, TUG, TUE e interruptor por ambiente) este motor:
 *   1. DIVIDE em circuitos — iluminação separada de tomadas (4.2.5.5), aparelho > 10 A em circuito independente (9.5.3.1),
 *      tomadas de cozinha/copa/serviço em circuitos só delas (9.5.3.2); o motor NÃO usa a exceção da 9.5.3.3 (luz + tomada).
 *      Limite por circuito quando a norma não fixa = critério RA declarado (luz IB ≤ 10 A, TUG IB ≤ 16 A e ≤ 8 pontos).
 *   2. POSICIONA o quadro (regra RA declarada: térreo, fora de banheiro/serviço/área externa, perto do centro de carga, 1,50 m)
 *      e calcula a potência INSTALADA e a DEMANDADA (CEMIG ND-5.1 8.2.3, Tabelas 10, 12 e 13) e o PADRÃO DE ENTRADA
 *      (ND-5.1 4.5.1 e Tabelas 1/2).
 *   3. DIMENSIONA cada circuito: IB; método pela Tabela 33 (a pior aplicação do percurso — 6.2.5.8); Iz pela Tabela 36 com os
 *      fatores das Tabelas 40 (temperatura) e 42 (agrupamento, o eletroduto mais cheio do percurso); seção mínima (Tabela 47);
 *      queda de tensão (6.2.7: ≤ 4 % no terminal, ≤ 5 % do ponto de entrega); disjuntor com IB ≤ In ≤ Iz (5.3.4.1); DR 30 mA
 *      onde a 5.1.3.2.2 exige; DPS no quadro (5.4.2.1.1 + Tabela 49); PE pela Tabela 58; reserva do quadro (Tabela 59).
 *   4. TRAÇA os eletrodutos que faltam (js/eletracado.js) e escolhe o DN pelo número de condutores (fabricante).
 *   5. ORÇA cabo por seção e cor, disjuntores, DR e DPS (SINAPI MG 06/2026) — o eletroduto, a caixa de passagem e o QUADRO
 *      já são orçados pelas instalações (js/biminst.js), o dispositivo e a caixa do ponto pela E1: nada é cobrado duas vezes.
 *
 * O PROJETO fica gravado no QUADRO (família ra-quadro-distribuicao, parâmetro de instância Projeto_eletrico = JSON em texto —
 * o Firestore não aceita lista dentro de lista) e o circuito de cada ponto no parâmetro Circuito da família (o usuário troca
 * em Propriedades e o motor respeita). O auditor (js/elecircauditor.js) confere o que está GRAVADO contra a norma.
 *
 *   EleCircuitos.analisar({ estado, avaliarFam, criterios }) → { ok, motivo?, pontos[], circuitos[], quadro, fornecimento, demanda,
 *        alimentador, geral, drs[], dps, quadroModelo, eletrodutos{}, projeto, projetoGravado, pendencias[], avisos[], criterios }
 *   EleCircuitos.lancar({ estado, avaliarFam, criterios, loteId, tracar: true }) → { ok, lote (UM Ctrl+Z), ops, analise, resumo,
 *        avisos[], pendencias[] }   — idempotente: rodar de novo sem mudança = nenhuma op.
 *   EleCircuitos.servicosOrc(estado, avaliarFam) → linhas para o js/orcmodelo.js (cabos, disjuntores, DR, DPS)
 * NBR 5410:2004 lida numa cópia NÃO licenciada à RA (sem a Errata 1/2008 — conferir): só valores com o item (js/eletabelas.js).
 * Teste: node tools/test-ele-circuitos.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function TB() { return dep("EleTabelas", "./eletabelas.js"); }
  function RG() { return dep("EleRegras", "./eleregras.js"); }
  function EA() { return dep("EleAuto", "./eleauto.js"); }
  function ESA() { return dep("EsqAuto", "./esqauto.js"); }
  function TR() { return dep("EleTracado", "./eletracado.js"); }
  function EI() { return dep("EletIlum", "./eletilum.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return v != null && v !== "" && isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function r2(v) { return Math.round(v * 100) / 100; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  function f1(v) { return (Math.round(v * 10) / 10).toFixed(1).replace(".", ","); }
  function d2(a, b) { var x = a[0] - b[0], z = a[1] - b[1]; return Math.sqrt(x * x + z * z); }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  var FAM_QD = "ra-quadro-distribuicao";

  /* ------------------------------------------------------------------ CRITÉRIOS (C = critério RA, editável; A/N = fonte) */
  var CRITERIOS = {
    tensaoFN: { valor: 127, nivel: "A", rotulo: "Tensão fase-neutro (V)", fonte: "CEMIG ND-5.1 (rede secundária 127/220 V)" },
    tensaoFF: { valor: 220, nivel: "A", rotulo: "Tensão fase-fase (V)", fonte: "CEMIG ND-5.1 (rede secundária 127/220 V)" },
    tempAmbiente: { valor: 30, nivel: "C", rotulo: "Temperatura ambiente dos eletrodutos (°C)", fonte: "critério RA (30 °C = a referência da Tabela 40, fator 1,00; acima, a tabela reduz)" },
    luzIbMax: { valor: 10, nivel: "C", rotulo: "Circuito de iluminação: corrente de projeto máxima (A)", fonte: "critério RA (pesquisa 20/10/2026: 10 A = 1.270 VA em 127 V; a NBR 5410 não fixa)" },
    tugIbMax: { valor: 16, nivel: "C", rotulo: "Circuito de tomadas: corrente de projeto máxima (A)", fonte: "critério RA (16 A, coerente com o limite de 9.5.3.3 a; a NBR 5410 não fixa para circuito só de tomadas)" },
    tugPontosMax: { valor: 8, nivel: "C", rotulo: "Circuito de tomadas: pontos no máximo", fonte: "critério RA (manutenção e desligamento parcial — 4.2.5.2 a)" },
    luzPontosMax: { valor: 8, nivel: "C", rotulo: "Circuito de iluminação: pontos de luz no máximo", fonte: "critério RA (a casa não fica toda no escuro com um disjuntor — 4.2.5.2 a)" },
    fpNaoAquecimento: { valor: 0.92, nivel: "A", rotulo: "Aparelho que não é de aquecimento: kVA = kW / este fator", fonte: "CEMIG ND-5.1, Tabela 13 nota 2 e Tabela 10 (tomadas e lâmpadas de descarga)" },
    alimentadorComprimento: { valor: 15, nivel: "C", rotulo: "Alimentador medidor → quadro: comprimento (m)", fonte: "critério RA PROVISÓRIO: o padrão de entrada não está no modelo — informe a distância real (orçado como provisório)" },
    quadroAltura: { valor: 1.50, nivel: "C", rotulo: "Quadro: altura do centro (m do piso)", fonte: "critério RA (pesquisa 20/10/2026; a NBR 5410 só pede fácil acesso — 6.5.4.8)" },
    sobraPonto: { valor: 0.30, nivel: "C", rotulo: "Cabo: sobra em cada caixa de ponto, por condutor (m)", fonte: "critério RA (ligação do dispositivo)" },
    sobraQuadro: { valor: 0.50, nivel: "C", rotulo: "Cabo: sobra no quadro, por condutor (m)", fonte: "critério RA (pentear e ligar no disjuntor/barramento)" },
    drCircuitosMax: { valor: 4, nivel: "C", rotulo: "DR: circuitos no máximo por dispositivo", fonte: "critério RA (pesquisa 20/10/2026: evita desligar a casa toda)" },
    dpsAQ2: { valor: 1, nivel: "C", rotulo: "Considerar AQ2 (> 25 dias de trovoada/ano) com linha aérea: DPS obrigatório (1 = sim)", fonte: "critério RA conservador para MG: a ND-5.1 é de rede aérea; o índice de trovoadas do local não foi lido — conferir (5.4.2.1.1 a)" },
    circuitosPorEletroduto: { valor: 3, nivel: "C", rotulo: "Eletroduto: circuitos no máximo (o aparelho pesado ocupa o eletroduto sozinho)", fonte: "critério RA (pesquisa 20/10/2026: \"preferir um eletroduto por trecho com ≤ 3 circuitos\" — o agrupamento da Tabela 42 cai a 0,70 e o DN 32 comporta 9 condutores de 2,5 mm² pelo fabricante)" },
    pesoLuz: { valor: 1.5, nivel: "C", rotulo: "Circuito de iluminação: peso no eletroduto (conta o retorno)", fonte: "critério RA (F, N, PE e o retorno: 4 condutores ≈ 1,5 circuito de tomada)" },
    pesadoIb: { valor: 20, nivel: "C", rotulo: "Circuito acima desta corrente de projeto vai em eletroduto exclusivo (A)", fonte: "critério RA (chuveiro, forno: evita o fator de agrupamento no circuito mais carregado)" },
    quedaAlimentadorMax: { valor: 1, nivel: "C", rotulo: "Alimentador: parcela da queda de tensão reservada (%)", fonte: "critério RA (5 % do ponto de entrega − 4 % do terminal)" }
  };
  function criterios(sobre) {
    var out = copia(CRITERIOS);
    Object.keys(sobre || {}).forEach(function (k) {
      var v = Number(sobre[k]); if (!out[k] || !isFinite(v)) return;
      if (Math.abs(v - out[k].valor) > 1e-9) { out[k].valor = v; out[k].nivelOriginal = out[k].nivel; out[k].nivel = "C"; out[k].alterado = true; out[k].fonte = "alterado pelo usuário (era " + out[k].fonte + ")"; }
    });
    return out;
  }
  var CORES = { A: "preto", B: "vermelho", C: "branco", N: "azul-claro", PE: "verde-amarelo", R: "cinza",
    fonte: "6.1.5.3 (neutro azul-claro; PE verde-amarelo ou verde; fase qualquer outra cor) — as cores das fases e do retorno são critério RA" };

  /* ------------------------------------------------------------------ O CIRCUITO GRAVADO NO PONTO
     ⚠ CONTRATO com a ligação da iluminação (docs/eletrica/CONTRATO-ILUMINACAO.md, integração n23 de 23/10/2026): na LUMINÁRIA o
     `Circuito` é o legado do render (= o Comando, "cmd-<amb>-geral") e o circuito de proteção mora em `Circuito_quadro`. Antes os
     dois motores escreviam o mesmo campo: o "Circuitos e quadro" gravava "C3" no `Circuito` (o render passava a acender a casa
     inteira junto) e lia o "cmd-…" da ligação como circuito escolhido à mão (nascia um circuito chamado "cmd-A-SALA-geral"). O
     circuito PROVISÓRIO que a ligação propõe sem projeto (registro com circuitoOrigem ≠ "projeto") não é escolha do usuário. */
  function campoCircuito(kind) { return kind === "luz" ? "Circuito_quadro" : "Circuito"; }
  function circuitoManual(f, kind, regPorCmd) {
    var I = (f && f.inst) || {};
    if (kind !== "luz") return txt(I.Circuito);
    var cq = txt(I.Circuito_quadro);
    if (cq) { var rg = regPorCmd && regPorCmd[txt(I.Comando)]; if (!(rg && rg.circuitoOrigem !== "projeto" && txt(rg.circuito) === cq)) return cq; }
    var c0 = txt(I.Circuito);
    return c0 && !/^cmd-/.test(c0) && c0 !== txt(I.Comando) ? c0 : "";
  }

  /* ------------------------------------------------------------------ OS PONTOS COM CARGA */
  function potLuminaria(av) { var s = txt(av && av.valores && av.valores.Potencia_W), m = 0; s.split("/").forEach(function (q) { var n = parseFloat(String(q).replace(",", ".")); if (isFinite(n) && n > m) m = n; }); return m; }
  var AQUECIMENTO = /^(chuveiro|forno|fogao)/;
  var GRUPO_CEMIG = { chuveiro_220: "b1", forno_embutir: "b3", fogao_4_bocas: "b3", lava_roupas: "b4", geladeira_freezer: "b5", micro_ondas: "b5", ar_condicionado: "c", hidromassagem: "d", bomba_dagua: "d" };
  function lerPontos(estado, avaliarFam, L, C) {
    var R = RG(), EAl = EA(), C1 = R.criterios(), out = [], famPor = {}, porAmb = {};
    arr(estado && estado.familias).forEach(function (f) { if (f && f.id != null) famPor[String(f.id)] = f; });
    L.ambientes.forEach(function (a) { porAmb[a.id] = a; });
    function aval(f) { try { return typeof avaliarFam === "function" ? avaliarFam(f.famId, f.tipoId, f.inst) : null; } catch (e) { return null; } }
    var caixaPor = {}; L.caixas.forEach(function (k) { caixaPor[k.id] = k; });
    function cxP(k) { return k ? [k.p[0], k.y, k.p[1]] : null; }
    /* a TUE de cada aparelho (a mesma régua do js/eleauditor.js: a do lançador tem o id dele; senão a mais perto que serve) */
    var ehTue = {}, tuePor = {};
    L.aparelhos.forEach(function (ap) {
      if (ap.def.semParede) return;
      var pref = "elee-" + ap.chave, best = null, Q = R.tueDe(ap.def, num((ap.f.inst && ap.f.inst.Capacidade_BTUh), num(ap.va.Capacidade_BTUh, 0)), C1);
      L.pontos.filter(function (q) { return q.kind === "tomada" && q.pav === ap.pav && !ehTue[q.id] && !/^elet-/.test(q.id); }).concat(L.caixas.filter(function (k) { return !k.dono && k.pav === ap.pav && !ehTue[k.id]; })).forEach(function (q) {
        if (!EAl.serveTue(Q, q)) return;
        var d0 = d2(q.p, ap.p), d = q.id === pref ? -1 : d0;
        if (d0 <= C1.distTue.valor + 1e-6 && (!best || d < best.d)) best = { q: q, d: d };
      });
      if (best) { ehTue[best.q.id] = ap; tuePor[ap.chave] = { q: best.q, Q: Q }; }
    });
    var regPorCmd = {};
    arr(estado && estado.instalacoes && estado.instalacoes.ligacoes).forEach(function (r) { arr(r && r.comandos).forEach(function (k) { if (k && k.id) regPorCmd[k.id] = r; }); });
    function base(q, kind) {
      var a = porAmb[q.amb], f = famPor[q.id];
      return { id: q.id, kind: kind, amb: q.amb, ambNome: a ? a.nome : "", grupo: a ? a.cls.grupo : "demais", tipoAmb: a ? a.tipo.id : "generico", pav: q.pav,
        h: q.h, tipoId: q.tipoId || "", caixa: q.caixa || null, caixaP: q.caixa && caixaPor[q.caixa] ? cxP(caixaPor[q.caixa]) : [q.p[0], num(q.y, 0) + num(q.h, 0), q.p[1]],
        circManual: circuitoManual(f, kind, regPorCmd), va: 0, w: 0, tensao: C.tensaoFN.valor, aquecimento: false, familia: !!f, auto: !!q.auto };
    }
    /* luminárias e interruptores */
    L.pontos.forEach(function (q) {
      if (q.kind === "luminaria") { var p = base(q, "luz"); p.potLamp = potLuminaria(aval(famPor[q.id] || {})); out.push(p); }
      else if (q.kind === "interruptor") { var s = base(q, "interruptor"); s.paralelo = /^p/.test(q.tipoId || ""); out.push(s); }
    });
    /* a carga mínima de iluminação do ambiente (9.5.2.1.2) repartida pelas luminárias dele (ou a soma das lâmpadas, a maior) */
    L.ambientes.forEach(function (a) {
      var ls = out.filter(function (p) { return p.kind === "luz" && p.amb === a.id; }); if (!ls.length) return;
      var vaN = R.vaIluminacao(a.area), vaL = ls.reduce(function (s, p) { return s + p.potLamp / C.fpNaoAquecimento.valor; }, 0), va = Math.max(vaN, vaL);
      ls.forEach(function (p) { p.va = r2(va / ls.length); p.w = r2(p.va * C.fpNaoAquecimento.valor); p.vaRegra = vaN >= vaL ? "carga mínima de iluminação " + vaN + " VA do ambiente (NBR 5410 9.5.2.1.2)" : "soma das lâmpadas"; });
    });
    /* tomadas de uso geral: 600 VA nas 3 primeiras de cozinha/serviço/banheiro, 100 VA nas demais (9.5.2.2.2) */
    var tugAmb = {};
    L.pontos.forEach(function (q) { if (q.kind === "tomada" && !ehTue[q.id]) (tugAmb[q.amb || "-"] = tugAmb[q.amb || "-"] || []).push(q); });
    Object.keys(tugAmb).forEach(function (k) {
      var a = porAmb[k], g = a ? a.cls.grupo : "demais", L0 = tugAmb[k].slice().sort(function (x, y) { return x.id < y.id ? -1 : 1; });
      L0.forEach(function (q, i) {
        var p = base(q, "tug"), molh = g === "cozinha_servico" || g === "banheiro";
        p.va = molh && i < C1.qtdTugMolhada.valor ? C1.vaTugMolhada.valor : C1.vaTugDemais.valor; p.w = r2(p.va * C.fpNaoAquecimento.valor);
        p.vaRegra = (molh && i < C1.qtdTugMolhada.valor ? "600 VA" : "100 VA") + " (NBR 5410 9.5.2.2.2)";
        out.push(p);
      });
    });
    /* tomadas de uso específico e ligação direta */
    L.aparelhos.forEach(function (ap) {
      var t = tuePor[ap.chave]; if (!t) return;
      var q = t.q, Q = t.Q, ehCx = q.peca != null && q.kind == null;
      var p = ehCx ? { id: q.id, kind: "tue", amb: ap.amb || q.amb, pav: q.pav, h: q.h, tipoId: "", caixa: q.id, caixaP: cxP(q), circManual: "", familia: false, auto: !!q.auto } : base(q, "tue");
      var a = porAmb[p.amb]; p.ambNome = a ? a.nome : ""; p.grupo = a ? a.cls.grupo : "demais"; p.tipoAmb = a ? a.tipo.id : "generico";
      p.kind = "tue"; p.direta = ehCx; p.aparelho = ap.id; p.aparelhoNome = ap.def.rotulo; p.aparelhoDef = ap.def.id; p.tensao = ap.def.tensao || C.tensaoFN.valor;
      p.aquecimento = AQUECIMENTO.test(ap.def.id); p.cemig = GRUPO_CEMIG[ap.def.id] || "b5";
      p.w = Q.potW || 0;
      p.va = Q.pAr && Q.pAr.VA ? Q.pAr.VA : (p.aquecimento ? p.w : r2(p.w / C.fpNaoAquecimento.valor));
      p.potPendente = !Q.potW;
      p.vaRegra = Q.potW ? (Q.pAr ? Q.pAr.VA + " VA (CEMIG ND-5.1 Tabela 9, " + Q.pAr.btuTabela + " BTU/h)" : p.w + " W (CEMIG ND-5.1 " + (ap.def.cemig || "Tabelas 8A/8B") + ")" + (p.aquecimento ? ", aquecimento kVA = kW" : ", kVA = kW/0,92")) : "potência da placa pendente";
      out.push(p);
    });
    return out;
  }

  /* ------------------------------------------------------------------ O QUADRO (o que existe ou a posição proposta) */
  function quadroDe(estado, avaliarFam) {
    var f = arr(estado && estado.familias).filter(function (x) { return x && x.famId === FAM_QD; })[0];
    if (!f) return null;
    var av = null; try { av = typeof avaliarFam === "function" ? avaliarFam(f.famId, f.tipoId, f.inst) : null; } catch (e) { av = null; }
    var v = (av && av.valores) || {}, hm = num(f.inst && f.inst.Altura_montagem, num(v.Altura_montagem, 1.5)), alt = num(v.Altura, 0.25), lg = num(v.Largura, 0.2), pr = num(v.Profundidade, 0.09);
    var r = num(f.rotY, 0), dirF = [Math.sin(r), Math.cos(r)], c = [num(f.x, 0) + dirF[0] * pr / 2, num(f.y, 0) + hm, num(f.z, 0) + dirF[1] * pr / 2];
    var proj = null; try { proj = f.inst && f.inst.Projeto_eletrico ? JSON.parse(f.inst.Projeto_eletrico) : null; } catch (e2) { proj = null; }
    return { id: String(f.id), f: f, p: c, topo: [c[0], c[1] + alt / 2, c[2]], raio: Math.sqrt(lg * lg + alt * alt) / 2 + 0.15, u: [Math.cos(r), -Math.sin(r)], dir: dirF,
      y: num(f.y, 0), hm: hm, largura: lg, altura: alt, profundidade: pr, projeto: proj, existente: true, espacos: num(v.Disjuntores, null), material: txt(v.Material_quadro) };
  }
  var PREF_QD = { circulacao: 0, sala_estar: 1, sala_jantar: 1, cozinha: 2, escritorio: 3, despensa: 3, generico: 3, dormitorio: 4, suite: 4 };
  function proporQuadro(L, estado, avaliarFam, pontos, C) {
    var EAl = EA(), C1 = RG().criterios(), best = null, carga = 0, cx = 0, cz = 0;
    pontos.forEach(function (p) { var w = Math.max(1, p.va || 0); carga += w; cx += p.caixaP[0] * w; cz += p.caixaP[2] * w; });
    var cc = carga ? [cx / carga, cz / carga] : [0, 0], pav0 = 0;
    L.ambientes.forEach(function (a) {
      if (a.pav !== pav0 || PREF_QD[a.tipo.id] == null || a.cls.grupo === "externa" || a.cls.grupo === "varanda") return;
      var cands = EAl.candidatos(L, estado, avaliarFam, a, C1).map(function (c) { c.pav = a.pav; return c; });
      cands.forEach(function (c) {
        var h = C.quadroAltura.valor, okL = [0, -0.15, 0.15].every(function (dt) {
          var c2 = { w: c.w, t: c.t + dt, P: [c.P[0] + Math.cos(num(c.w.rotY, 0)) * dt, c.P[1] - Math.sin(num(c.w.rotY, 0)) * dt], dir: c.dir, pav: c.pav };
          return !EAl.verificar(L, C1, c2, h, {}) && !EAl.verificar(L, C1, c2, h + 0.15, {}) && !EAl.verificar(L, C1, c2, h - 0.15, {});
        });
        if (!okL) return;
        var sc = PREF_QD[a.tipo.id] * 3 + d2(c.P, cc);
        if (!best || sc < best.sc - 1e-9) best = { sc: sc, c: c, a: a };
      });
    });
    if (!best) return null;
    var c = best.c, a = best.a, pr = 0.12, alt = 0.50;
    return { id: null, novo: true, cand: c, amb: a.id, ambNome: a.nome, p: [c.P[0] - c.dir[0] * pr / 2, num(a.base, 0) + C.quadroAltura.valor, c.P[1] - c.dir[1] * pr / 2], topo: [c.P[0] - c.dir[0] * 0.03, num(a.base, 0) + C.quadroAltura.valor + alt / 2, c.P[1] - c.dir[1] * 0.03],
      raio: 0.5, u: [Math.cos(num(c.w.rotY, 0)), -Math.sin(num(c.w.rotY, 0))], dir: c.dir, rotY: c.rotY, y: num(a.base, 0), hm: C.quadroAltura.valor, largura: 0.40, altura: alt, profundidade: pr,
      regra: "térreo, no ambiente de menor restrição (circulação → sala → cozinha → demais → dormitório; nunca banheiro, área de serviço, varanda ou área externa), na parede livre (fora de vão, porta e móvel) mais perto do centro de carga, centro a " + f2(C.quadroAltura.valor) + " m (critério RA; 6.5.4.8 pede fácil acesso)" };
  }

  /* ------------------------------------------------------------------ DIVISÃO EM CIRCUITOS */
  function chaveTug(p) { return p.grupo === "cozinha_servico" ? "tug-amb-" + p.amb : (p.grupo === "banheiro" ? "tug-banho-" + p.pav : (p.grupo === "externa" || p.grupo === "varanda" ? "tug-ext-" + p.pav : "tug-geral-" + p.pav)); }
  function dividir(pontos, guardado, C, qd) {
    var circs = [], porId = {}, ondeEsta = {}, avisos = [];
    function novo(id, tipo, chave, nome) { var c = { id: id, tipo: tipo, chave: chave, nome: nome, pontos: [] }; circs.push(c); porId[id] = c; return c; }
    var maxN = 0; function prox() { maxN++; return "C" + maxN; }
    arr(guardado && guardado.circuitos).forEach(function (g) { var m = /^C(\d+)$/.exec(g.id || ""); if (m) maxN = Math.max(maxN, +m[1]); });
    pontos.forEach(function (p) { var m = /^C(\d+)$/.exec(p.circManual || ""); if (m) maxN = Math.max(maxN, +m[1]); });
    var existe = {}; pontos.forEach(function (p) { existe[p.id] = p; });
    /* 1) o que está GRAVADO (o projeto anterior) — só os pontos que ainda existem */
    arr(guardado && guardado.circuitos).forEach(function (g) {
      var c = novo(g.id, g.tipo, g.chave, g.nome); c.guardado = g;
      arr(g.pontos).forEach(function (id) { if (existe[id] && !ondeEsta[id]) { c.pontos.push(id); ondeEsta[id] = c.id; } });
    });
    /* 2) o parâmetro Circuito que o usuário pôs no ponto vence o gravado */
    pontos.forEach(function (p) {
      if (!p.circManual || ondeEsta[p.id] === p.circManual) return;
      if (ondeEsta[p.id]) { var v = porId[ondeEsta[p.id]]; v.pontos.splice(v.pontos.indexOf(p.id), 1); }
      var c = porId[p.circManual] || novo(p.circManual, p.kind === "tue" ? "tue" : (p.kind === "tug" ? "tug" : "luz"), p.kind === "tug" ? chaveTug(p) : (p.kind === "tue" ? "tue-" + p.id : "luz-" + p.pav), "");
      c.pontos.push(p.id); ondeEsta[p.id] = c.id; c.manual = true;
    });
    /* 3) os pontos sem circuito: TUE = um circuito cada; TUG pela chave (cozinha/serviço por ambiente — 9.5.3.2); luz por pavimento */
    var orig = qd && qd.p ? [qd.p[0], qd.p[2]] : [0, 0];
    function ordem(L) { return L.slice().sort(function (x, y) { return d2([x.caixaP[0], x.caixaP[2]], orig) - d2([y.caixaP[0], y.caixaP[2]], orig) || (x.id < y.id ? -1 : 1); }); }
    function cabe(c, p) {
      var va = c.pontos.reduce(function (s, id) { return s + (existe[id] ? existe[id].va : 0); }, 0) + p.va;
      if (c.tipo === "tug") return va / C.tensaoFN.valor <= C.tugIbMax.valor + 1e-9 && c.pontos.length + 1 <= C.tugPontosMax.valor;
      if (c.tipo === "luz") { var nl = c.pontos.filter(function (id) { return existe[id] && existe[id].kind === "luz"; }).length + (p.kind === "luz" ? 1 : 0); return va / C.tensaoFN.valor <= C.luzIbMax.valor + 1e-9 && nl <= C.luzPontosMax.valor; }
      return false;
    }
    var soltos = pontos.filter(function (p) { return !ondeEsta[p.id]; });
    ordem(soltos.filter(function (p) { return p.kind === "tue"; })).forEach(function (p) { var c = novo(prox(), "tue", "tue-" + p.id, ""); c.pontos.push(p.id); ondeEsta[p.id] = c.id; });
    /* tomadas e luz: o AMBIENTE inteiro num circuito quando cabe (primeiro no circuito que já tem o ambiente, depois num da mesma
       chave, senão um novo); o ambiente que sozinho passa do limite reparte os pontos dele */
    function cabeLista(c, L) {
      var va = c.pontos.reduce(function (s, id) { return s + (existe[id] ? existe[id].va : 0); }, 0) + L.reduce(function (s, p) { return s + p.va; }, 0);
      if (c.tipo === "tug") return va / C.tensaoFN.valor <= C.tugIbMax.valor + 1e-9 && c.pontos.length + L.length <= C.tugPontosMax.valor;
      var nl = c.pontos.filter(function (id) { return existe[id] && existe[id].kind === "luz"; }).length + L.filter(function (p) { return p.kind === "luz"; }).length;
      return va / C.tensaoFN.valor <= C.luzIbMax.valor + 1e-9 && nl <= C.luzPontosMax.valor;
    }
    function porAmbiente(L) { var m = {}, ord = []; L.forEach(function (p) { if (!m[p.amb]) { m[p.amb] = []; ord.push(p.amb); } m[p.amb].push(p); }); return ord.map(function (k) { return m[k]; }); }
    function alocar(tipo, chaveDe) {
      porAmbiente(ordem(soltos.filter(function (p) { return p.kind === (tipo === "luz" ? "luz" : "tug") && !ondeEsta[p.id]; }))).forEach(function (grupo) {
        var ch = chaveDe(grupo[0]), amb = grupo[0].amb;
        var alvo = circs.filter(function (c) { return c.tipo === tipo && c.chave === ch && c.pontos.some(function (id) { return existe[id] && existe[id].amb === amb && existe[id].kind !== "interruptor"; }) && cabeLista(c, grupo); })[0] ||
                   circs.filter(function (c) { return c.tipo === tipo && c.chave === ch && cabeLista(c, grupo); })[0];
        if (!alvo) { var n0 = novo(prox(), tipo, ch, ""); if (cabeLista(n0, grupo)) alvo = n0; else { /* o ambiente sozinho não cabe: ponto a ponto */
          var atual = n0; grupo.forEach(function (p) { if (!cabe(atual, p)) atual = novo(prox(), tipo, ch, ""); atual.pontos.push(p.id); ondeEsta[p.id] = atual.id; }); return; } }
        grupo.forEach(function (p) { alvo.pontos.push(p.id); ondeEsta[p.id] = alvo.id; });
      });
    }
    alocar("tug", chaveTug);
    alocar("luz", function (p) { return "luz-" + p.pav; });
    soltos.filter(function (p) { return p.kind === "interruptor" && !ondeEsta[p.id]; }).forEach(function (p) {
      var c = circs.filter(function (k) { return k.tipo === "luz" && k.pontos.some(function (id) { return existe[id] && existe[id].kind === "luz" && existe[id].amb === p.amb; }); })[0];
      if (!c) { avisos.push("Interruptor " + p.id + " sem luminária no ambiente: ficou fora dos circuitos."); return; }
      c.pontos.push(p.id); ondeEsta[p.id] = c.id;
    });
    circs = circs.filter(function (c) { return c.pontos.length; });
    /* o nome do circuito (o gravado vale) */
    circs.forEach(function (c) {
      var ps = c.pontos.map(function (id) { return existe[id]; }).filter(Boolean), ambs = [];
      ps.forEach(function (p) { if (p.ambNome && ambs.indexOf(p.ambNome) < 0) ambs.push(p.ambNome); });
      var auto = c.tipo === "tue" ? (ps[0].aparelhoNome || "Uso específico") + (ps[0].ambNome ? " — " + ps[0].ambNome : "") : (c.tipo === "luz" ? "Iluminação" : "Tomadas") + " — " + ambs.join(", ");
      if (!c.nome) c.nome = auto;
    });
    return { circuitos: circs, ondeEsta: ondeEsta, avisos: avisos };
  }

  /* ------------------------------------------------------------------ FORNECIMENTO E DEMANDA (CEMIG ND-5.1) */
  function demandaDe(pontos, C) {
    var T = TB(), F = T.CEMIG, luzTug = 0, grupos = { b1: [], b3: [], b4: [], b5: [], c: [], d: [] }, pend = [], tem220 = false;
    pontos.forEach(function (p) {
      if (p.kind === "luz" || p.kind === "tug") luzTug += p.va;
      if (p.kind === "tue") { grupos[p.cemig || "b5"].push(p); if (p.tensao > C.tensaoFN.valor + 1) tem220 = true; }
    });
    var ciA = luzTug / 1000, fd = T.fdTabela10(ciA), a = ciA * fd / C.fpNaoAquecimento.valor;
    function grupo(L, aquec) { if (!L.length) return 0; var kw = L.reduce(function (s, p) { return s + p.w / 1000; }, 0); return kw * T.fdTabela13(L.length) / (aquec ? 1 : C.fpNaoAquecimento.valor); }
    var b1 = grupo(grupos.b1, true), b4 = grupo(grupos.b4, false), b5 = grupo(grupos.b5, false);
    var ate = grupos.b3.filter(function (p) { return p.w <= 3500; }), acima = grupos.b3.filter(function (p) { return p.w > 3500; });
    var b3 = (ate.length ? ate.reduce(function (s, p) { return s + p.w / 1000; }, 0) * T.fdTabela12(ate.length, false) : 0) + (acima.length ? acima.reduce(function (s, p) { return s + p.w / 1000; }, 0) * T.fdTabela12(acima.length, true) : 0);
    var cAr = grupos.c.length ? grupos.c.reduce(function (s, p) { return s + p.va / 1000; }, 0) * T.fdTabela13(grupos.c.length) : 0;
    var dMot = grupos.d.reduce(function (s, p) { return s + p.w / 1000 / C.fpNaoAquecimento.valor; }, 0);
    if (grupos.d.length) pend.push("Motores (" + grupos.d.map(function (p) { return p.aparelhoNome; }).join(", ") + "): a demanda das Tabelas 14 e 15 da ND-5.1 não foi transcrita — entrou 100 % da potência (conservador) — conferir.");
    var ciTue = pontos.filter(function (p) { return p.kind === "tue"; }).reduce(function (s, p) { return s + p.w / 1000; }, 0);
    var ci = ciA + ciTue, D = a + b1 + b3 + b4 + b5 + cAr + dMot;
    /* o tipo de fornecimento (4.5.1) e a faixa (Tabelas 1 e 2) */
    var tipo, faixa = null, motivoTipo;
    if (ci <= F.tipos.A.ate_kW + 1e-9 && !tem220) { tipo = "A"; motivoTipo = "carga instalada " + f2(ci) + " kW ≤ 8 kW, sem aparelho em 220 V (" + F.tipos.A.item + ")"; }
    else if (ci <= F.tipos.B.ate_kW + 1e-9) { tipo = "B"; motivoTipo = "carga instalada " + f2(ci) + " kW ≤ 16 kW" + (tem220 && ci <= 8 ? " (aparelho em 220 V pede 2 fases)" : "") + " (" + F.tipos.B.item + ")"; }
    else if (ci <= F.tipos.C.ate_kW + 1e-9 && D <= F.tipos.C.demandaAte_kVA + 1e-9) { tipo = "C"; motivoTipo = "carga instalada " + f2(ci) + " kW entre 16,1 e 75 kW, demanda " + f2(D) + " kVA ≤ 75 kVA (" + F.tipos.C.item + ")"; }
    else { tipo = null; motivoTipo = "carga instalada " + f2(ci) + " kW / demanda " + f2(D) + " kVA acima do tipo C: medição indireta (ND-5.1 Tabela 4, não transcrita) — pendência"; pend.push("Fornecimento acima do tipo C da ND-5.1: " + motivoTipo + "."); }
    if (tipo === "A") faixa = F.tabela1.dados[0]; else if (tipo === "B") faixa = F.tabela1.dados[1];
    else if (tipo === "C") F.tabela2.dados.forEach(function (l) { if (!faixa && D <= l[2] + 1e-9) faixa = l; });
    var entrada = faixa ? { faixa: faixa[0], fios: faixa[3], fases: faixa[4], disjuntor_A: faixa[5], condutor_mm2: faixa[6], eletrodutoPVC_mm: faixa[7], eletrodutoAco_mm: faixa[8], aterramento_mm2: faixa[9], hastes: faixa[10], pe_mm2: faixa[11],
      tabela: tipo === "C" ? F.tabela2.item : F.tabela1.item } : null;
    return { cargaInstalada_kW: r2(ci), luzTomadas_kW: r2(ciA), fdLuzTomadas: fd, a: r2(a), b1: r2(b1), b3: r2(b3), b4: r2(b4), b5: r2(b5), c: r2(cAr), d: r2(dMot), demanda_kVA: r2(D),
      tipo: tipo, motivoTipo: motivoTipo, entrada: entrada, tem220: tem220, pendencias: pend,
      fonte: F.fonte + ", " + F.demanda.item + " (" + F.demanda.formula + "; " + F.tabela10.item + ", " + F.tabela12.item + ", " + F.tabela13.item + ")",
      grupos: { b1: grupos.b1.length, b3: grupos.b3.length, b4: grupos.b4.length, b5: grupos.b5.length, c: grupos.c.length, d: grupos.d.length } };
  }

  /* ------------------------------------------------------------------ FASES (4.2.5.6: o maior equilíbrio possível) */
  function distribuirFases(circs, existe, tipo, C) {
    var fases = tipo === "C" ? ["A", "B", "C"] : (tipo === "B" ? ["A", "B"] : ["A"]), carga = {}; fases.forEach(function (f) { carga[f] = 0; });
    function ok(s) { return s && s.split("").every(function (f) { return fases.indexOf(f) >= 0; }); }
    function va(c) { return c.pontos.reduce(function (s, id) { return s + (existe[id] ? existe[id].va : 0); }, 0); }
    var L = circs.slice().sort(function (x, y) { return va(y) - va(x) || (x.id < y.id ? -1 : 1); });
    /* o que está gravado e ainda vale fica */
    L.forEach(function (c) { var g = c.guardado; if (g && ok(g.fases) && (g.fases.length === 2) === (c.tensao > C.tensaoFN.valor + 1)) { c.fases = g.fases; c.fases.split("").forEach(function (f) { carga[f] += va(c) / c.fases.length; }); } });
    L.forEach(function (c) {
      if (c.fases) return;
      if (c.tensao > C.tensaoFN.valor + 1) {
        if (fases.length < 2) { c.fases = null; return; }
        var pares = fases.length === 3 ? ["AB", "BC", "CA"] : ["AB"], b = pares.sort(function (x, y) { return (carga[x[0]] + carga[x[1]]) - (carga[y[0]] + carga[y[1]]); })[0];
        c.fases = b; carga[b[0]] += va(c) / 2; carga[b[1]] += va(c) / 2;
      } else { var f = fases.slice().sort(function (x, y) { return carga[x] - carga[y]; })[0]; c.fases = f; carga[f] += va(c); }
    });
    return { fases: fases, carga: carga };
  }

  /* ------------------------------------------------------------------ CONDUTORES DE UM CIRCUITO EM CADA ELETRODUTO
     F, N e PE até os pontos; na descida do interruptor, F e retorno (paralelo: 3); entre luminárias do ambiente, mais o retorno */
  function condutoresPorTrecho(c, existe, rotas) {
    var porT = {};
    function soma(t, papel, n) { var o = porT[t] || (porT[t] = { F: 0, N: 0, PE: 0, R: 0 }); o[papel] = Math.max(o[papel], n); }
    var ps = c.pontos.map(function (id) { return existe[id]; }).filter(Boolean);
    if (c.tipo !== "luz") {
      ps.forEach(function (p) { var r = rotas[p.id]; if (!r) return; r.trechos.forEach(function (t) { soma(t, "F", c.fases && c.fases.length === 2 ? 2 : 1); if (!(c.fases && c.fases.length === 2)) soma(t, "N", 1); soma(t, "PE", 1); }); });
      return porT;
    }
    var noLuz = {}, noInt = {};
    ps.forEach(function (p) {
      var r = rotas[p.id]; if (!r) return;
      r.trechos.forEach(function (t) { if (p.kind === "luz") noLuz[t] = (noLuz[t] || []).concat([p]); else noInt[t] = (noInt[t] || []).concat([p]); });
    });
    Object.keys(noLuz).forEach(function (t) {
      soma(t, "F", 1); soma(t, "N", 1); soma(t, "PE", 1);
      /* retorno entre as luminárias do mesmo ambiente: o trecho que leva à luminária mas não ao interruptor dela */
      noLuz[t].forEach(function (p) {
        var ints = ps.filter(function (q) { return q.kind === "interruptor" && q.amb === p.amb; });
        if (ints.length && ints.every(function (q) { var rq = rotas[q.id]; return !rq || rq.trechos.indexOf(t) < 0; })) soma(t, "R", 1);
      });
    });
    Object.keys(noInt).forEach(function (t) {
      if (noLuz[t]) return;
      soma(t, "F", 1); soma(t, "R", noInt[t].some(function (q) { return q.paralelo; }) ? 2 : 1);
    });
    return porT;
  }
  function nCond(o) { return o.F + o.N + o.PE + o.R; }

  /* ------------------------------------------------------------------ DIMENSIONAR UM CIRCUITO */
  function dimensionar(c, existe, info, C, ref) {
    var T = TB(), V = c.tensao, ps = c.pontos.map(function (id) { return existe[id]; }).filter(Boolean);
    var va = ps.reduce(function (s, p) { return s + p.va; }, 0), ib = va / V;
    var secMin = c.tipo === "luz" ? T.T47.iluminacao : T.T47.forca, ft = T.fatorTemperatura(C.tempAmbiente.valor), fa = T.fatorAgrupamento(info.nAgrup);
    var limTerm = T.QUEDA.terminal_pct, limTotal = T.QUEDA.entregaSecundaria_pct - (ref && ref.dvAlim != null ? ref.dvAlim : C.quedaAlimentadorMax.valor), lim = Math.min(limTerm, limTotal);
    function dv(S) { var r = T.r70(S); return r == null ? Infinity : 200 * (r / 1000) * info.L * ib / V; }
    function inDe(i) { var L = T.DISJUNTORES_A; for (var k = 0; k < L.length; k++) if (L[k] >= i - 1e-9) return L[k]; return null; }
    var In = inDe(Math.max(ib, 0.01)), res = null, motivos = [];
    if (In == null) motivos.push("corrente de projeto " + f2(ib) + " A acima do maior disjuntor DIN da SINAPI (50 A)");
    /* o gravado (escolha anterior ou manual) fica se ainda atende tudo */
    var g = c.guardado;
    function confere(S, In0) {
      var iz0 = T.iz(info.metodo.ref, 2, S); if (iz0 == null || In0 == null) return null;
      var izc = iz0 * ft * fa, q = dv(S);
      return { S: S, In: In0, iz: iz0, izc: r2(izc), dv: r2(q), ok: S >= secMin - 1e-9 && ib <= In0 + 1e-9 && In0 <= izc + 1e-9 && q <= lim + 1e-9 };
    }
    if (g && g.secao && g.disjuntor) { var cg = confere(Number(g.secao), Number(g.disjuntor)); if (cg && cg.ok && (!In || cg.In >= In)) { res = cg; res.mantido = true; } }
    if (!res && In != null) T.SECOES.forEach(function (S) { if (res || S < secMin - 1e-9) return; var k = confere(S, In); if (k && k.ok) res = k; });
    if (!res) {
      var S16 = confere(16, In || 50); res = S16 || { S: 16, In: In || 50, iz: null, izc: null, dv: null };
      res.ok = false;
      if (In != null) motivos.push("nenhuma seção até 16 mm² atende Iz e a queda de tensão (" + (S16 ? "16 mm²: Iz corrigida " + f2(S16.izc) + " A, ΔV " + f2(S16.dv) + " %" : "") + ") — divida o circuito");
    }
    return { va: r2(va), ib: r2(ib), V: V, secMin: secMin, ft: ft, fa: fa, nAgrup: info.nAgrup, metodo: info.metodo, L: r2(info.L), estimado: !!info.estimado,
      secao: res.S, In: res.In, iz: res.iz, izc: res.izc, dv: res.dv, limiteQueda: lim, ok: !!res.ok, mantido: !!res.mantido, pe: T.secaoPE(res.S), motivos: motivos };
  }

  /* ------------------------------------------------------------------ DR (5.1.3.2.2) — que circuito exige, e os grupos */
  function exigeDR(c, existe, L) {
    var T = TB(), porAmb = {}; L.ambientes.forEach(function (a) { porAmb[a.id] = a; });
    var ps = c.pontos.map(function (id) { return existe[id]; }).filter(Boolean), why = [];
    ps.forEach(function (p) {
      if (p.kind === "interruptor") return;   /* interruptor não é ponto de utilização */
      /* a altura da LUMINÁRIA (Altura_montagem), limitada ao pé-direito — revisão 21/10/2026: usava só o pé-direito, e a arandela a
         1,80 m da área de serviço ficava sem DR (a nota 3 só dispensa o ponto de luz a 2,50 m ou mais) */
      var a = porAmb[p.amb], g = p.grupo, t = p.tipoAmb, pe = a ? num(a.pe, 2.6) : 2.6, h = p.kind === "luz" ? Math.min(num(p.h, pe), pe) : num(p.h, 0);
      if (g === "banheiro") { why.push("a"); return; }
      if ((g === "externa" || g === "varanda") && p.kind !== "luz") { why.push("b"); return; }
      if (g === "cozinha_servico" || t === "garagem") { if (p.kind === "luz" && h >= T.DR.nota3_luzAltura_m - 1e-9) return; why.push("d"); }
    });
    var u = []; why.forEach(function (w) { if (u.indexOf(w) < 0) u.push(w); });
    return u.sort();
  }
  /* ⚠ O DR NÃO tem proteção de sobrecarga (interruptor DR): pela 6.3.6.2.2 a) a sobrecorrente é dos disjuntores e o DR tem de
     suportar o que passa por ele. Critério RA conservador (integração n23, 23/10/2026): a corrente nominal do DR ≥ a soma das
     correntes nominais dos disjuntores a jusante, limitada à do disjuntor geral (que é o que de fato limita o conjunto) — antes só
     ≥ a soma das correntes de PROJETO, e um DR de 25 A ficava atrás de 16 + 16 A de cozinha. Sem DR em série no projeto (os DR
     de 30 mA saem do barramento, depois só do geral), a seletividade entre DR da 6.3.6.3 não se aplica. */
  function agruparDR(circs, C, inGeral) {
    var T = TB(), grupos = [], k = 0;
    var porFase = {};
    circs.filter(function (c) { return c.dr && c.dr.length; }).forEach(function (c) { (porFase[c.fases || "?"] = porFase[c.fases || "?"] || []).push(c); });
    function exigido(somaIb, somaIn, maxIn) { var lim = inGeral != null ? Math.min(somaIn, inGeral) : somaIn; return Math.max(somaIb, maxIn, lim); }
    Object.keys(porFase).sort().forEach(function (f) {
      var atual = null;
      porFase[f].forEach(function (c) {
        var ib = c.dim.ib, inC = num(c.dim.In, 0);
        function drIn(req) { var L = T.DR_A; for (var i = 0; i < L.length; i++) if (L[i] >= req - 1e-9) return L[i]; return null; }
        if (atual && atual.circuitos.length < C.drCircuitosMax.valor && drIn(exigido(atual.somaIb + ib, atual.somaIn + inC, Math.max(atual.maxIn, inC))) != null) {
          atual.circuitos.push(c.id); atual.somaIb += ib; atual.somaIn += inC; atual.maxIn = Math.max(atual.maxIn, inC); atual.In = drIn(exigido(atual.somaIb, atual.somaIn, atual.maxIn));
        } else {
          atual = { id: "DR" + (++k), fases: f, polos: 2, circuitos: [c.id], somaIb: ib, somaIn: inC, maxIn: inC, In: drIn(exigido(ib, inC, inC)) };
          grupos.push(atual);
        }
        c.drId = atual.id;
      });
    });
    grupos.forEach(function (g) { g.somaIb = r2(g.somaIb); g.sensibilidade_mA = 30; });
    return grupos;
  }

  /* ------------------------------------------------------------------ ANALISAR */
  function analisar(o) {
    o = o || {};
    var T = TB(), EAl = EA(), Tr = TR(), C = criterios(o.criterios), est = o.estado, aval = o.avaliarFam, avisos = [], pend = [];
    if (!T || !EAl || !Tr) return { ok: false, motivo: "Motores elétricos não carregados (eletabelas.js, eleauto.js, eletracado.js).", criterios: C };
    var L = EAl.leitura(est, aval);
    if (!L.ambientes.length) return { ok: false, motivo: "Não há ambiente delimitado no modelo: lance os ambientes e os pontos elétricos antes dos circuitos.", criterios: C };
    var pontos = lerPontos(est, aval, L, C), existe = {}; pontos.forEach(function (p) { existe[p.id] = p; });
    if (!pontos.some(function (p) { return p.kind !== "interruptor"; })) return { ok: false, motivo: "Não há pontos elétricos no modelo: rode \"Lançar pontos elétricos\" primeiro.", criterios: C, leitura: L, pontos: pontos };
    var qd = o.quadro || quadroDe(est, aval), guardado = qd && qd.projeto ? qd.projeto : (o.projetoBase || null);
    if (!qd) { qd = proporQuadro(L, est, aval, pontos, C); if (!qd) pend.push({ texto: "Não achei parede livre para o quadro (térreo, fora de banheiro/serviço/área externa): ponha o quadro à mão (Instalações › Quadro elétrico) e rode de novo." }); }
    if (qd && !qd.ambNome && qd.dir && L.ambDe) { var aq = L.ambDe([qd.p[0] + qd.dir[0] * 0.3, qd.p[2] + qd.dir[1] * 0.3], 0), aQ = L.ambientes.filter(function (x) { return x.id === aq; })[0]; if (aQ) { qd.amb = aQ.id; qd.ambNome = aQ.nome; } }
    var dv0 = dividir(pontos, guardado, C, qd), circs = dv0.circuitos; avisos = avisos.concat(dv0.avisos);
    circs.forEach(function (c) { var ps = c.pontos.map(function (id) { return existe[id]; }).filter(Boolean); c.tensao = c.tipo === "tue" && ps[0] ? ps[0].tensao : C.tensaoFN.valor; });
    var dem = demandaDe(pontos, C); dem.pendencias.forEach(function (t) { pend.push({ texto: t }); });
    var fs = distribuirFases(circs, existe, dem.tipo || "C", C);
    circs.forEach(function (c) { if (!c.fases) pend.push({ circuito: c.id, texto: c.id + " (" + c.nome + "): aparelho em 220 V num fornecimento de 1 fase — o tipo de fornecimento precisa de 2 fases." }); });
    /* as ROTAS: cada circuito anda só pelos eletrodutos DELE (o projeto grava a atribuição — senão o Dijkstra punha os fios de um
       circuito no eletroduto de outro e o agrupamento saía errado); o eletroduto feito à mão, sem registro, serve a qualquer um */
    var estG = o.estadoRede || est, atrib = {}, at0 = guardado && guardado.eletrodutos ? guardado.eletrodutos : {};
    Object.keys(at0).forEach(function (t) { atrib[t] = arr(at0[t]).slice(); });
    Object.keys(o.atribuicao || {}).forEach(function (t) { atrib[t] = arr(o.atribuicao[t]).slice(); });
    var nosPontos = pontos.map(function (p) { return { id: p.id, no: p.caixaP, caixa: p.caixa }; });
    var G = Tr.grafo(estG, qd && qd.p ? { id: qd.id || "QD", p: qd.p, raio: qd.raio, u: qd.u, dir: qd.dir, largura: qd.largura, altura: qd.altura } : null, nosPontos), rotas = {};
    Object.keys(atrib).forEach(function (t) { if (!G.trechos[t]) delete atrib[t]; });   /* eletroduto apagado sai do registro */
    /* circuito que saiu do projeto (redividido) sai do registro; o eletroduto que fica sem circuito volta a servir a qualquer um */
    var idsC = {}; circs.forEach(function (c) { idsC[c.id] = 1; });
    Object.keys(atrib).forEach(function (t) { atrib[t] = atrib[t].filter(function (id) { return idsC[id]; }); if (!atrib[t].length) delete atrib[t]; });
    var temAtrib = Object.keys(atrib).length > 0;
    circs.forEach(function (c) {
      /* o eletroduto do PRÓPRIO circuito primeiro; o sem registro (à mão, ou que ficou sem circuito) só se o caminho dele for bem mais curto */
      var R0 = Tr.rotas(G, { pontos: c.pontos, permitido: function (t) { var a = atrib[t]; return !a || a.indexOf(c.id) >= 0; }, peso: function (t) { return atrib[t] || !temAtrib ? 1 : 5; } });
      Object.keys(R0).forEach(function (pid) { rotas[pid] = R0[pid]; });
      /* o ponto que mudou de circuito (à mão ou ao redividir) e só chega pelo eletroduto de outro: usa esse caminho e o registro
         do eletroduto passa a ter os dois circuitos (o agrupamento conta) */
      var faltam = c.pontos.filter(function (id) { return !rotas[id]; });
      if (faltam.length) {
        var R1 = Tr.rotas(G, { pontos: faltam });
        Object.keys(R1).forEach(function (pid) { rotas[pid] = R1[pid]; R1[pid].trechos.forEach(function (t) { if (atrib[t] && atrib[t].indexOf(c.id) < 0) atrib[t].push(c.id); }); });
      }
    });
    /* circuitos por eletroduto (pelo uso real das rotas) */
    /* ⚠ FIAÇÃO DA LIGAÇÃO DA ILUMINAÇÃO (integração n23): no eletroduto que a ligação traçou, os condutores do circuito de luz da
       sala são os DELA (fase, neutro, terra, retorno e os retornos do paralelo/intermediário, um a um) — ela sabe o esquema; aqui
       só a seção vem do dimensionamento. Um circuito, uma contagem: o cabo não sai em dobro (o js/biminst.js deixa de somar a
       fiação da ligação quando há projeto — ver cuidaDoCabo). */
    var ligFio = {};
    arr(estG && estG.instalacoes && estG.instalacoes.ligacoes).forEach(function (r) {
      Object.keys((r && r.fiacao) || {}).forEach(function (t) {
        var o2 = { F: 0, N: 0, PE: 0, R: 0 };
        txt(r.fiacao[t].c).split(" ").forEach(function (k) { if (!k) return; if (k === "F") o2.F++; else if (k === "N") o2.N++; else if (k === "T") o2.PE++; else o2.R++; });
        ligFio[t] = { amb: r.amb, cond: o2 };
      });
    });
    var porTrecho = {}; circs.forEach(function (c) {
      c.cond = condutoresPorTrecho(c, existe, rotas);
      if (c.tipo === "luz") {
        var ambsLuz = {}; c.pontos.forEach(function (id) { var p0 = existe[id]; if (p0 && p0.kind === "luz") ambsLuz[p0.amb] = 1; });
        /* TODO eletroduto da ligação da sala leva os condutores dela, esteja ou não na rota mais curta do quadro a cada ponto (revisão
           adversarial n23: o tronco cruza por cima da descida do interruptor e a rota "pulava" os retornos do paralelo — eletroduto
           cobrado sem fio). O que a rota acrescenta fora dos tubos da ligação fica (lado conservador). */
        Object.keys(ligFio).forEach(function (t) { var lf = ligFio[t]; if (lf && ambsLuz[lf.amb] && G.trechos[t]) { c.cond[t] = copia(lf.cond); c.condLig = (c.condLig || 0) + 1; } });
      }
      Object.keys(c.cond).forEach(function (t) { (porTrecho[t] = porTrecho[t] || []).push(c.id); });
    });
    var porAmb = {}; L.ambientes.forEach(function (a) { porAmb[a.id] = a; });
    function aplDe(t) { var tt = G.trechos[t]; return tt ? (tt.aplicacao || (Math.abs(num(tt.p1.y, 0) - num(tt.p2.y, 0)) > 0.3 ? "parede" : "laje")) : "laje"; }
    circs.forEach(function (c) {
      var ps = c.pontos.map(function (id) { return existe[id]; }).filter(Boolean), Lmax = 0, piorRef = null, estimado = false, semRota = [], ts = {}, Lest = {};
      ps.forEach(function (p) {
        var r = rotas[p.id];
        if (!r) {
          estimado = true; semRota.push(p.id);
          if (qd && qd.p) { var a = porAmb[p.amb], teto = a ? num(a.base, 0) + num(a.pe, 2.6) : qd.topo[1] + 1.2, le = Math.abs(p.caixaP[0] - qd.p[0]) + Math.abs(p.caixaP[2] - qd.p[2]) + Math.abs(teto - qd.topo[1]) + Math.abs(teto - p.caixaP[1]); Lest[p.id] = r2(le); Lmax = Math.max(Lmax, le); }
          return;
        }
        Lmax = Math.max(Lmax, r.comprimento);
        r.trechos.forEach(function (t) { ts[t] = 1; var m = T.T33[aplDe(t)] || T.T33.laje; if (!piorRef || T.ORDEM_METODO.indexOf(m.ref) < T.ORDEM_METODO.indexOf(piorRef.ref)) piorRef = { ref: m.ref, metodo: m.metodo, apl: aplDe(t), nivel: m.nivel }; });
      });
      if (!piorRef) piorRef = { ref: T.T33.laje.ref, metodo: T.T33.laje.metodo, apl: "laje", nivel: "C", estimado: true };
      c.semRota = semRota; c.semRotaL = Lest; c.Lmax = Lmax; c.metodoRef = piorRef; c.estimado = estimado; c.trechosRota = Object.keys(ts);
      c.dr = exigeDR(c, existe, L);
      c.polos = c.fases && c.fases.length === 2 ? 2 : 1;
    });
    /* AGRUPAMENTO (Tabela 42, ref. 1: circuitos no mesmo eletroduto) com a 6.2.5.5.2 — o circuito cuja corrente de projeto não passa de
       30 % da capacidade dele (já com o fator) não conta para os outros. Iterado até parar de mudar (no máximo 5 voltas). */
    function contaAgrup(c, despr) { var n = 1; c.trechosRota.forEach(function (t) { var k = (porTrecho[t] || []).filter(function (id) { return id === c.id || !despr[id]; }).length; if (k > n) n = k; }); return n; }
    function dimTodos(dvAlim) {
      var despr = {};
      for (var it = 0; it < 5; it++) {
        circs.forEach(function (c) { c.dim = dimensionar(c, existe, { L: c.Lmax, nAgrup: contaAgrup(c, despr), metodo: c.metodoRef, estimado: c.estimado }, C, { dvAlim: dvAlim }); });
        var novo = {}, igual = true;
        circs.forEach(function (c) { if (c.dim.izc && c.dim.ib <= T.AGRUP30 * c.dim.izc + 1e-9) novo[c.id] = 1; });
        circs.forEach(function (c) { if (!!novo[c.id] !== !!despr[c.id]) igual = false; });
        if (igual) break;
        despr = novo;
      }
      circs.forEach(function (c) { c.dim.desprezado = !!despr[c.id]; });
    }
    dimTodos(null);
    /* geral, alimentador e queda do alimentador */
    var nF = fs.fases.length, iFase = {}; fs.fases.forEach(function (f) { iFase[f] = 0; });
    circs.forEach(function (c) { if (!c.fases) return; c.fases.split("").forEach(function (f) { iFase[f] += c.dim.ib; }); });
    var ciKVA = pontos.reduce(function (s, p) { return s + (p.va || 0) / 1000; }, 0), k = ciKVA > 0 ? Math.min(1, dem.demanda_kVA / ciKVA) : 1;
    var iMax = 0; Object.keys(iFase).forEach(function (f) { iMax = Math.max(iMax, iFase[f] * k); });
    /* revisão 21/10/2026: o geral ia só até 50 A (63 A no tripolar) — o SOBRADO de teste (70,6 A) saía SEM disjuntor geral e sem
       alimentador, no orçamento e no auditor, em silêncio. Agora a série usual até 250 A; acima do DIN da SINAPI o orçamento usa a
       composição pública de maior preço que cobre (provisório — js/eletabelas.js disjuntorCodigo) */
    var inG = null; T.GERAL_A.forEach(function (x) { if (inG == null && x >= iMax - 1e-9) inG = x; });
    var geral = { In: inG, polos: nF, ib: r2(iMax), fatorDemanda: r2(k), regra: "corrente de demanda da fase mais carregada = soma das correntes de projeto da fase × (demanda ND-5.1 ÷ carga instalada); o disjuntor geral não passa do disjuntor da entrada (critério RA, seletividade)" };
    if (inG == null) pend.push({ texto: "Disjuntor geral: " + f2(iMax) + " A por fase passa de 250 A — divida a instalação em mais de um quadro ou faça o projeto do quadro geral à parte." });
    if (dem.entrada && inG != null && inG > dem.entrada.disjuntor_A) pend.push({ texto: "Disjuntor geral de " + inG + " A acima do disjuntor da entrada CEMIG (" + dem.entrada.disjuntor_A + " A): reveja o fornecimento." });
    var alim = { comprimento: C.alimentadorComprimento.valor, provisorio: !C.alimentadorComprimento.alterado, nCarr: nF === 1 ? 2 : 3, ref: "B1" }, secA = null;
    /* ⚠ queda no alimentador (6.2.7), em % da tensão fase-neutro, na fase mais carregada: ΔV ≤ R·L·(I_fase + I_neutro), o neutro
       com a soma VETORIAL das correntes fase-neutro (fases a 120°; a carga entre fases não passa por ele) — limite superior,
       conservador: 1 fase = 200·R·L·I/V; 3 fases equilibradas = 100; 2 fases equilibradas = 200. Integração n23 (revisão
       adversarial): antes era sempre ÷2 com 2 ou 3 fases (100), e a queda do bifásico saía até 43 % menor — o alimentador podia sair
       uma seção abaixo. */
    var iFN = {}; fs.fases.forEach(function (f) { iFN[f] = 0; });
    circs.forEach(function (c) { if (c.fases && c.fases.length === 1) iFN[c.fases] += c.dim.ib * k; });
    var ANG = { A: 0, B: -2 * Math.PI / 3, C: 2 * Math.PI / 3 }, nRe = 0, nIm = 0;
    Object.keys(iFN).forEach(function (f) { nRe += iFN[f] * Math.cos(ANG[f] || 0); nIm += iFN[f] * Math.sin(ANG[f] || 0); });
    var iNeutro = Math.sqrt(nRe * nRe + nIm * nIm), kQueda = nF === 1 ? 200 : 100 * (1 + (iMax > 0 ? Math.min(1, iNeutro / iMax) : 0));
    alim.iNeutro = r2(iNeutro); alim.kQueda = r2(kQueda);
    T.T36.secoes.forEach(function (S) { if (secA != null || inG == null) return; var izA = T.iz("B1", alim.nCarr, S); var q = kQueda * (T.r70(S) / 1000) * alim.comprimento * iMax / C.tensaoFN.valor; if (izA != null && inG <= izA * T.fatorTemperatura(C.tempAmbiente.valor) + 1e-9 && q <= C.quedaAlimentadorMax.valor + 1e-9) { secA = S; alim.iz = izA; alim.dv = r2(q); } });
    alim.secao = secA; alim.pe = secA != null ? T.secaoPE(secA) : null;
    if (secA == null && inG != null) pend.push({ texto: "Alimentador: nenhuma seção até 95 mm² atende o disjuntor geral de " + inG + " A e a queda de " + f2(C.quedaAlimentadorMax.valor) + " % em " + f2(alim.comprimento) + " m — confira a distância (Critérios dos circuitos) ou ponha o quadro mais perto do medidor." });
    if (alim.provisorio) avisos.push("Alimentador medidor → quadro com " + f2(alim.comprimento) + " m PROVISÓRIOS (critério RA): informe a distância real em Critérios dos circuitos.");
    /* com a queda real do alimentador, o limite do terminal é min(4 %, 5 % − alimentador) — redimensiona */
    dimTodos(alim.dv != null ? alim.dv : C.quedaAlimentadorMax.valor);
    var drs = agruparDR(circs, C, geral.In);
    drs.forEach(function (g) { if (g.In == null) pend.push({ texto: g.id + ": a soma das correntes passa do maior DR bipolar da SINAPI (63 A) — divida o grupo." }); });
    /* DPS (5.4.2.1.1 a: linha aérea + AQ2) */
    var dps = { exigido: C.dpsAQ2.valor >= 1, quantidade: nF + 1, uc_V: 175, uo: C.tensaoFN.valor, ucMin_V: r2(T.DPS.ucTNS.fasePE * C.tensaoFN.valor), in_kA: 20, classe: "II",
      regra: "linha da CEMIG aérea (ND-5.1) + região AQ2 adotada (" + C.dpsAQ2.fonte + "): DPS no quadro, um por fase (F-PE) e um neutro-PE (critério RA para o esquema TN-S); Uc ≥ 1,1 Uo = " + f2(T.DPS.ucTNS.fasePE * C.tensaoFN.valor) + " V → 175 V (Tabela 49); In 20 kA ≥ 5 kA por modo e ≥ " + (nF === 3 ? "20" : "10") + " kA no N-PE (6.3.5.2.4 d)" };
    /* o quadro: módulos (disjuntores + DR + DPS + geral + reserva da Tabela 59) */
    var nCirc = circs.length, res = T.reserva(nCirc), mod = circs.reduce(function (s, c) { return s + c.polos; }, 0) + drs.length * 2 + (dps.exigido ? dps.quantidade : 0) + nF + res;
    var modelo = null; T.SINAPI.quadro.forEach(function (q) { if (!modelo && q[0] >= mod) modelo = { espacos: q[0], material: q[1], instalacao: q[2], corrente: q[3], codigo: q[4] }; });
    if (!modelo) pend.push({ texto: "O quadro precisaria de " + mod + " espaços: acima do maior da SINAPI (48) — divida em dois quadros." });
    /* DN de cada eletroduto (o que o modelo tem × o que os condutores pedem) */
    var eletrodutos = {};
    Object.keys(porTrecho).forEach(function (t) {
      var n = 0, smax = 0, cs = porTrecho[t];
      cs.forEach(function (id) { var c = circs.filter(function (x) { return x.id === id; })[0]; var o2 = c.cond[t]; n += nCond(o2); smax = Math.max(smax, c.dim.secao); });
      var need = T.dnMinimo(n, smax), tt = G.trechos[t];
      eletrodutos[t] = { circuitos: cs.slice(), condutores: n, secaoMaior: smax, dnMinimo: need, dn: tt ? num(tt.dn, 25) : null, lotado: need == null || (tt && num(tt.dn, 25) < need), auto: /^elec-/.test(t) };
    });
    /* o projeto que vai gravado no quadro */
    var projeto = { versao: 1, norma: T.NORMA.citar, tipoFornecimento: dem.tipo, faixa: dem.entrada ? dem.entrada.faixa : null,
      circuitos: circs.map(function (c) { return { id: c.id, nome: c.nome, tipo: c.tipo, chave: c.chave, tensao: c.tensao, fases: c.fases, pontos: c.pontos.slice(), secao: c.dim.secao, disjuntor: c.dim.In, polos: c.polos, dr: c.drId || null }; }),
      drs: drs.map(function (g) { return { id: g.id, In: g.In, polos: g.polos, fases: g.fases, circuitos: g.circuitos.slice() }; }),
      dps: dps.exigido ? { quantidade: dps.quantidade, uc_V: dps.uc_V, in_kA: dps.in_kA } : null,
      geral: { In: geral.In, polos: geral.polos }, alimentador: { secao: alim.secao, comprimento: alim.comprimento }, eletrodutos: atrib };
    circs.forEach(function (c) { if (c.dim.estimado) avisos.push(c.id + " (" + c.nome + "): " + c.semRota.length + " ponto(s) sem eletroduto até o quadro — comprimento e agrupamento ESTIMADOS (trace os eletrodutos)."); });
    return { ok: true, leitura: L, pontos: pontos, existe: existe, circuitos: circs, quadro: qd, fornecimento: dem, demanda: dem, fases: fs, geral: geral, alimentador: alim, drs: drs, dps: dps,
      quadroModelo: modelo, modulos: mod, reserva: res, eletrodutos: eletrodutos, atribuicao: atrib, porTrecho: porTrecho, rotas: rotas, grafo: G, projeto: projeto, projetoGravado: guardado, pendencias: pend, avisos: avisos, criterios: C };
  }

  /* ------------------------------------------------------------------ DERIVAÇÃO SEM CAIXA (6.2.11.1.9 a/b)
     ⚠ revisão adversarial n23 (23/10/2026): o grafo liga a ponta que cai no MEIO de outro eletroduto (o tê) e a rota dos condutores
     passava por ali — fio saindo de um eletroduto pelo lado de outro, ou o mesmo circuito se dividindo para dois pontos, num ponto SEM
     caixa. A NBR 5410 6.2.11.1.9 exige caixa "em todos os pontos da tubulação onde houver entrada ou saída de condutores" (a) e "em
     todos os pontos de emenda ou de derivação" (b). Na casa de teste: 10 a 14 nós assim, nenhuma caixa no orçamento.
     Derivação = nó de ponta (sem caixa, ponto nem quadro) em que um circuito (1) sai por dois ou mais caminhos, ou (2) troca de
     eletroduto entrando ou saindo PELO MEIO de um deles (o tê). A curva entre dois eletrodutos que só se encostam e o eletroduto
     partido que segue reto não contam. */
  function derivacoesSemCaixa(A) {
    var G = A && A.grafo; if (!G || G.noQD == null) return [];
    function temCaixa(k) { var nd = G.nos[k]; if (!nd || nd.tipo !== "ponta") return true; return G.adj[k].some(function (e) { return !e.trecho && G.nos[e.b] && G.nos[e.b].tipo !== "ponta"; }); }
    /* o eletroduto PASSA pelo nó (tem pedaço dos dois lados — o nó é um tê no meio dele) */
    function passa(k, t) { var n0 = 0; G.adj[k].forEach(function (e) { if (e.trecho === t) n0++; }); return n0 >= 2; }
    var achou = {};
    arr(A.circuitos).forEach(function (c) {
      var saidas = {};
      c.pontos.forEach(function (pid) {
        var r = A.rotas && A.rotas[pid]; if (!r || !r.passos) return;
        var ps = r.passos.filter(function (s) { return s.trecho; });
        ps.forEach(function (s, i) {
          (saidas[s.de] = saidas[s.de] || {})[s.trecho + "|" + s.para] = 1;
          var ant0 = ps[i - 1];
          /* entra num eletroduto PELO MEIO dele, ou sai de um pelo meio (a curva entre dois pedaços que só se encostam não conta) */
          if (ant0 && ant0.para === s.de && ant0.trecho !== s.trecho && (passa(s.de, ant0.trecho) || passa(s.de, s.trecho)) && !temCaixa(s.de)) (achou[s.de] = achou[s.de] || {})[c.id] = 1;
        });
      });
      Object.keys(saidas).forEach(function (k) { if (Object.keys(saidas[k]).length >= 2 && !temCaixa(Number(k))) (achou[k] = achou[k] || {})[c.id] = 1; });
    });
    return Object.keys(achou).map(function (k) {
      var nd = G.nos[Number(k)], vert = true, forro = false;
      G.adj[Number(k)].forEach(function (e) { if (!e.trecho) return; var t = G.trechos[e.trecho]; if (!t) return; if (Math.abs(num(t.p1.y, 0) - num(t.p2.y, 0)) < 0.3) vert = false; if (t.aplicacao === "forro") forro = true; });
      return { no: Number(k), p: nd.p, parede: vert, forro: forro, circuitos: Object.keys(achou[k]).sort() };
    });
  }

  /* ------------------------------------------------------------------ LANÇAR (um lote: quadro, eletrodutos, circuito dos pontos, projeto) */
  function lancar(o) {
    o = o || {};
    var Tr = TR(), est = o.estado, C = criterios(o.criterios), ops = [], avisos = [], pend = [];
    var A0 = analisar({ estado: est, avaliarFam: o.avaliarFam, criterios: o.criterios });
    if (!A0.ok) return { ok: false, motivo: A0.motivo, ops: [], avisos: [], pendencias: [], analise: A0 };
    var qd = A0.quadro;
    if (!qd) return { ok: false, motivo: A0.pendencias.map(function (p) { return p.texto; }).join(" "), ops: [], avisos: [], pendencias: A0.pendencias, analise: A0 };
    /* 1) o quadro novo */
    if (qd.novo) {
      var idQ = "eleq-QD1", k = 1; while (arr(est.familias).some(function (f) { return f && String(f.id) === idQ; })) idQ = "eleq-QD" + (++k);
      qd.id = idQ;
      var m = A0.quadroModelo || { espacos: 24, material: "aco", instalacao: "embutir", corrente: "100A" };
      ops.push({ op: "familia", id: idQ, famId: FAM_QD, tipoId: m.material === "pvc" ? "pvc6" : "aco24e", x: r4(qd.cand.P[0] - qd.cand.dir[0] * qd.profundidade), y: r4(qd.y), z: r4(qd.cand.P[1] - qd.cand.dir[1] * qd.profundidade), rotY: r4(qd.rotY),
        inst: { Altura_montagem: r4(qd.hm), $tipo: { Material_quadro: m.material, Instalacao: m.instalacao, Disjuntores: m.espacos, Corrente: m.corrente, Largura: 0.40, Altura: 0.50, Profundidade: 0.12 } } });
      avisos.push("Quadro " + idQ + " posto em \"" + qd.ambNome + "\": " + qd.regra + ".");
    }
    /* 1b) ⚠ FONTE ÚNICA (integração n23): a ligação da iluminação feita ANTES dos circuitos (em espera na porta, encadeada no ponto
       de luz vizinho ou direto no quadro) é RELIGADA só dentro da sala — o TRONCO do quadro às salas é daqui, com a capacidade de
       circuitos por eletroduto. Roteiro do defeito: a espera ficava no modelo, cobrada, e o traçado daqui puxava outro eletroduto do
       quadro até a mesma caixa; e a corrente encadeada da ligação virava o caminho das tomadas e dos aparelhos (o ar-condicionado
       da casa de teste a 22 m do quadro em vez de 10 m, cabo de 2,5 mm² na luz pela queda de tensão). */
    var estQ = ops.length ? baseMaisOps(est, ops) : est, ligOps = [], EIl = EI();
    if (EIl && EIl.ligar && o.religarIluminacao !== false) arr(estQ.instalacoes && estQ.instalacoes.ligacoes).forEach(function (r) {
      if (!r || !r.alimentacao || r.alimentacao.tipo === "projeto" || r.alimentacao.tipo === "existente") return;
      var cL = null; A0.circuitos.forEach(function (c0) { if (!cL && c0.tipo === "luz" && c0.pontos.some(function (id) { var p0 = A0.existe[id]; return p0 && p0.kind === "luz" && p0.amb === r.amb; })) cL = c0.id; });
      var rl = null; try { rl = EIl.ligar({ estado: estQ, avaliarFam: o.avaliarFam, ambiente: r.amb, config: { alimentacao: "projeto", circuito: cL } }); } catch (eL) { rl = null; }
      if (!rl || !rl.ok || !rl.registro) return;
      ligOps = ligOps.concat(rl.ops); estQ = baseMaisOps(estQ, rl.ops);
      /* ⚠ as pendências do religar não somem (revisão adversarial n23): a sala sem porta ficava com a luminária sem interruptor e o
         "Circuitos e quadro" respondia sem pendência nenhuma */
      arr(rl.pendencias).forEach(function (q) { if (q && /^(interruptor|luminarias|teto)/.test(String(q.chave || ""))) pend.push({ ambiente: r.amb, texto: "Ligação da iluminação de \"" + (r.nomeAmb || r.amb) + "\": " + q.motivo }); });
      avisos.push("Ligação da iluminação de \"" + (r.nomeAmb || r.amb) + "\": a " + (r.alimentacao.tipo === "espera" ? "espera da porta" : (r.alimentacao.tipo === "ligacao" ? "alimentação pelo ponto de luz vizinho" : "alimentação até o quadro")) + " saiu; o tronco do quadro até a sala é deste projeto.");
    });
    /* 2) os eletrodutos que faltam (o que existe não é tocado); cada eletroduto leva no máximo K "pesos" de circuito */
    var tr = { ops: [], trechos: [], caixas: [], avisos: [], pendencias: [], atribuicao: {} }, circDe = {}, pesos = {};
    A0.circuitos.forEach(function (c) { c.pontos.forEach(function (id) { circDe[id] = c.id; }); pesos[c.id] = c.dim && c.dim.ib > C.pesadoIb.valor + 1e-9 ? C.circuitosPorEletroduto.valor : (c.tipo === "luz" ? C.pesoLuz.valor : 1); });
    if (o.tracar !== false) {
      var Gx = Tr.grafo(estQ, { id: qd.id, p: qd.p, raio: qd.raio, u: qd.u, dir: qd.dir, largura: qd.largura, altura: qd.altura }, A0.pontos.map(function (p) { return { id: p.id, no: p.caixaP, caixa: p.caixa }; }));
      tr = Tr.tracar({ L: A0.leitura, quadro: qd, pontos: A0.pontos.map(function (p) { return { id: p.id, kind: p.kind, amb: p.amb, pav: p.pav, caixa: p.caixa, caixaP: p.caixaP, luminaria: p.kind === "luz", circ: circDe[p.id] }; }),
        pesos: pesos, K: C.circuitosPorEletroduto.valor, estado: estQ, grafoExistente: Gx, criterios: C });
      pend = pend.concat(tr.pendencias);
    }
    /* 3) de novo, com o quadro e os eletrodutos novos: as rotas reais (cada circuito no eletroduto dele), o agrupamento e o DN */
    var estN = est;
    if (ops.length || ligOps.length || tr.ops.length) estN = baseMaisOps(est, ops.concat(ligOps).concat(tr.ops));
    var A = analisar({ estado: estN, avaliarFam: o.avaliarFam, criterios: o.criterios, quadro: qdFinal(estN, o.avaliarFam, qd), atribuicao: tr.atribuicao, projetoBase: A0.projeto });
    if (!A.ok) A = A0;
    /* 3b) a CAIXA em cada derivação sem caixa (6.2.11.1.9 a/b — ver derivacoesSemCaixa), cobrada como peça; de novo a análise com
       ela (a caixa liga as pontas em volta) até não sobrar derivação sem caixa (no máximo 3 voltas) */
    var usadosD = {}; arr(estN.instalacoes && estN.instalacoes.pecas).forEach(function (k0) { if (k0) usadosD[String(k0.id)] = 1; });
    tr.ops.forEach(function (op) { if (op && op.id != null) usadosD[String(op.id)] = 1; });
    var caixasDer = [];
    for (var volta = 0; volta < 3 && A.ok; volta++) {
      var der = derivacoesSemCaixa(A); if (!der.length) break;
      der.forEach(function (d) {
        var nk = 1, idD = "elecp-d" + nk; while (usadosD[idD]) idD = "elecp-d" + (++nk); usadosD[idD] = 1;
        var amb0 = null; arr(A.leitura && A.leitura.ambientes).forEach(function (a) { if (!amb0 && A.leitura.ambDe && A.leitura.ambDe([d.p[0], d.p[2]], 0) === a.id) amb0 = a; });
        var opD = { op: "peca", id: idD, peca: d.parede ? "caixa_4x4" : "caixa_octogonal", sistema: "eletrica", material: "pvc", x: r4(d.p[0]), y: r4(d.p[1]), z: r4(d.p[2]), rotY: 0 };
        if (d.parede) opD.alturaPiso = r4(d.p[1] - (amb0 ? num(amb0.base, 0) : 0)); else if (d.forro) opD.aplicacao = "forro";
        tr.ops.push(opD); caixasDer.push({ id: idD, motivo: "derivação dos condutores de " + d.circuitos.join(", ") + " sem caixa — " + TB().n5410("6.2.11.1.9 b)") });
      });
      estN = baseMaisOps(est, ops.concat(ligOps).concat(tr.ops));
      var A2 = analisar({ estado: estN, avaliarFam: o.avaliarFam, criterios: o.criterios, quadro: qdFinal(estN, o.avaliarFam, qd), atribuicao: tr.atribuicao, projetoBase: A0.projeto });
      if (A2.ok) A = A2;
    }
    if (caixasDer.length) { tr.caixas = arr(tr.caixas).concat(caixasDer); avisos.push(caixasDer.length + " caixa(s) de derivação postas onde os condutores se dividem ou trocam de eletroduto (" + TB().n5410("6.2.11.1.9") + ")."); }
    /* o DN dos eletrodutos NOVOS pelo número de condutores (fabricante); o que não cabe num DN 32 fica DN 32 e vira pendência
       (o auditor acusa "eletroduto lotado" com a solução) */
    tr.trechos.forEach(function (t) {
      var e = A.eletrodutos[t.id]; if (!e) return;
      if (e.dnMinimo != null) t.op.dn = e.dnMinimo;
      else { t.op.dn = 32; pend.push({ texto: "Eletroduto " + t.id + ": " + e.condutores + " condutores de até " + String(e.secaoMaior).replace(".", ",") + " mm² não cabem num DN 32 (" + TB().OCUPACAO.fonte + ") — divida o ramal ou passe um eletroduto ao lado." }); }
    });
    /* o eletroduto do lançador (elec-) que ficou pequeno para os condutores de agora sobe de DN (o feito à mão não é tocado: o
       auditor acusa e oferece a troca) */
    var novosIds = {}; tr.trechos.forEach(function (t) { novosIds[t.id] = 1; });
    Object.keys(A.eletrodutos).forEach(function (t) {
      /* o da ligação da iluminação (lig-) também: ela guarda o DN subido no religar (js/eletilum.js) */
      var e = A.eletrodutos[t]; if (novosIds[t] || !/^(elec|lig)-/.test(t) || e.dnMinimo == null || !(e.dn < e.dnMinimo)) return;
      tr.ops.push({ op: "instAlterar", id: t, dn: e.dnMinimo }); avisos.push("Eletroduto " + t + ": DN " + e.dn + " → " + e.dnMinimo + " (" + e.condutores + " condutores).");
    });
    /* 4) o circuito de cada ponto (parâmetro Circuito da família) e o projeto no quadro */
    A.circuitos.forEach(function (c) {
      c.pontos.forEach(function (id) {
        var p = A.existe[id]; if (!p || !p.familia) return;
        var f = arr(estN.familias).filter(function (x) { return x && String(x.id) === id; })[0], campo = campoCircuito(p.kind), insC = {};
        insC[campo] = c.id;
        /* a luminária com Comando e o `Circuito` velho ("C3" de uma versão anterior): o legado do render volta a ser o Comando */
        var I0 = (f && f.inst) || {}, legado = p.kind === "luz" && txt(I0.Comando) && txt(I0.Circuito) !== txt(I0.Comando);
        if (legado) insC.Circuito = txt(I0.Comando);
        if (f && (txt(I0[campo]) !== c.id || legado)) ops.push({ op: "instancia", id: id, inst: insC });
      });
    });
    var js = JSON.stringify(A.projeto), qf = arr(estN.familias).filter(function (f) { return f && String(f.id) === String(qd.id); })[0];
    var instQ = { Projeto_eletrico: js };
    if (A.quadroModelo && qf) {
      var mt = A.quadroModelo, tp = (qf.inst && qf.inst.$tipo) || {};
      /* o quadro do lançador (eleq-) acompanha o projeto; o posto à mão só cresce quando não comporta (nunca diminui) */
      var nosso = /^eleq-/.test(String(qd.id)), qn = quadroDe(estN, o.avaliarFam), espAtual = qn ? qn.espacos : num(tp.Disjuntores, null);
      if (nosso ? (tp.Disjuntores !== mt.espacos || tp.Material_quadro !== mt.material) : (espAtual == null || espAtual < A.modulos)) instQ.$tipo = { Material_quadro: mt.material, Instalacao: mt.instalacao, Disjuntores: mt.espacos, Corrente: mt.corrente, Largura: mt.material === "pvc" ? 0.20 : 0.40, Altura: mt.material === "pvc" ? 0.25 : 0.50, Profundidade: mt.material === "pvc" ? 0.09 : 0.12 };
    }
    var mudou = !qf || txt(qf.inst && qf.inst.Projeto_eletrico) !== js || instQ.$tipo;
    var todas = ops.slice(0, qd.novo ? 1 : 0).concat(ligOps).concat(tr.ops).concat(ops.slice(qd.novo ? 1 : 0));
    if (mudou) todas.push({ op: "instancia", id: qd.id, inst: instQ });
    A.circuitos.forEach(function (c) { if (c.guardado && !c.dim.mantido && (Number(c.guardado.secao) !== c.dim.secao || Number(c.guardado.disjuntor) !== c.dim.In)) avisos.push(c.id + " redimensionado: " + c.guardado.secao + " mm²/" + c.guardado.disjuntor + " A → " + c.dim.secao + " mm²/" + c.dim.In + " A (o anterior não atendia mais)."); });
    var lote = todas.length ? { op: "lote", id: "elc-" + (o.loteId || Date.now().toString(36)), origem: "circuitos-eletricos", pedido: "Circuitos, quadro e eletrodutos", ops: todas } : null;
    var resumo = { circuitos: A.circuitos.length, luz: A.circuitos.filter(function (c) { return c.tipo === "luz"; }).length, tug: A.circuitos.filter(function (c) { return c.tipo === "tug"; }).length,
      tue: A.circuitos.filter(function (c) { return c.tipo === "tue"; }).length, drs: A.drs.length, eletrodutos: tr.trechos.length, caixasPassagem: tr.caixas.length, quadroNovo: !!qd.novo };
    return { ok: true, lote: lote, ops: todas, analise: A, resumo: resumo, avisos: avisos.concat(tr.avisos).concat(A.avisos), pendencias: pend.concat(A.pendencias), caixasPassagem: tr.caixas };
  }
  /* o estado com as ops novas por cima (o BimEdit refaz tudo a partir das ops do modelo: aqui o estado já aplicado + as ops) */
  /* ⚠ integração n23: também apagar, instância, a peça/o trecho com o MESMO id (a ligação da iluminação acerta a caixa que adota),
     instAlterar e o registro da ligação — o lote do "Circuitos e quadro" agora leva o religar da iluminação, e a análise do meio do
     lote precisa enxergar o modelo como ele fica (antes só somava família, trecho e peça novos: a espera apagada seguia "viva") */
  function baseMaisOps(est, ops) {
    var e = copia(est);
    e.instalacoes = e.instalacoes || { trechos: [], pecas: [] };
    var I = e.instalacoes;
    function semId(L, id) { return arr(L).filter(function (x) { return !x || String(x.id) !== String(id); }); }
    function comp(t) { return Math.sqrt(Math.pow(t.p2.x - t.p1.x, 2) + Math.pow(t.p2.y - t.p1.y, 2) + Math.pow(t.p2.z - t.p1.z, 2)); }
    arr(ops).forEach(function (op) {
      if (!op) return;
      if (op.op === "lote") { e = baseMaisOps(e, op.ops); I = e.instalacoes; return; }
      if (op.op === "familia") { e.familias = semId(e.familias, op.id).concat([{ id: op.id, famId: op.famId, tipoId: op.tipoId || "", x: op.x, y: op.y, z: op.z, rotY: op.rotY, inst: copia(op.inst || {}), host: op.host ? copia(op.host) : null }]); }
      else if (op.op === "instancia") {
        arr(e.familias).forEach(function (f) { if (!f || String(f.id) !== String(op.id)) return; if (op.tipoId != null) f.tipoId = String(op.tipoId); if (op.rotY != null) f.rotY = op.rotY; if (op.y != null) f.y = op.y; f.inst = f.inst || {}; Object.keys(op.inst || {}).forEach(function (k) { f.inst[k] = op.inst[k]; }); });
      }
      else if (op.op === "trecho") { var t0 = { id: op.id, sistema: op.sistema, material: op.material, dn: op.dn, p1: copia(op.p1), p2: copia(op.p2), aplicacao: op.aplicacao }; t0.comprimento = r4(comp(t0)); I.trechos = semId(I.trechos, op.id).concat([t0]); }
      else if (op.op === "peca") { var k0 = { id: op.id, peca: op.peca, sistema: op.sistema, material: op.material, x: op.x, y: op.y, z: op.z, rotY: op.rotY }; if (op.alturaPiso != null) k0.alturaPiso = op.alturaPiso; if (op.aplicacao) k0.aplicacao = op.aplicacao; I.pecas = semId(I.pecas, op.id).concat([k0]); }
      else if (op.op === "instAlterar") { arr(I.trechos).concat(arr(I.pecas)).forEach(function (x) { if (x && String(x.id) === String(op.id)) Object.keys(op).forEach(function (k) { if (k !== "op" && k !== "id") x[k] = op[k]; }); }); }
      else if (op.op === "ligEletrica") { var r0 = copia(op); delete r0.op; I.ligacoes = semId(I.ligacoes, op.id).concat([r0]); }
      else if (op.op === "apagar") { e.familias = semId(e.familias, op.id); I.trechos = semId(I.trechos, op.id); I.pecas = semId(I.pecas, op.id); if (I.ligacoes) I.ligacoes = semId(I.ligacoes, op.id); }
    });
    return e;
  }
  function qdFinal(estN, avaliarFam, qd) { var q = quadroDe(estN, avaliarFam); return q || qd; }

  /* ------------------------------------------------------------------ CABOS (metros por seção e cor) de um projeto analisado */
  function cabos(A) {
    var C = A.criterios, porChave = {};
    function soma(S, cor, m, circ, est) { var k = S + "|" + cor, o = porChave[k] || (porChave[k] = { secao: S, cor: cor, metros: 0, circuitos: [], estimado: 0 }); o.metros += m; if (est) o.estimado += m; if (circ && o.circuitos.indexOf(circ) < 0) o.circuitos.push(circ); }
    var porPedaco = {}; arr(A.grafo && A.grafo.pedacos).forEach(function (p) { porPedaco[p.trecho] = (porPedaco[p.trecho] || 0) + p.L; });
    A.circuitos.forEach(function (c) {
      var S = c.dim.secao, PE = c.dim.pe, fasesC = (c.fases || "A").split("");
      Object.keys(c.cond).forEach(function (t) {
        var o = c.cond[t], L = porPedaco[t] || 0;
        if (o.F) { if (o.F === 2) { soma(S, CORES[fasesC[0]], L, c.id); soma(S, CORES[fasesC[1] || "B"], L, c.id); } else soma(S, CORES[fasesC[0]], L * o.F, c.id); }
        if (o.N) soma(S, CORES.N, L * o.N, c.id);
        if (o.PE) soma(PE, CORES.PE, L * o.PE, c.id);
        if (o.R) soma(S, CORES.R, L * o.R, c.id);
      });
      /* revisão 21/10/2026: o ponto SEM eletroduto até o quadro não tinha cabo nenhum no orçamento (só a sobra) — entra o
         comprimento ESTIMADO (o mesmo da queda de tensão: em L pelo teto), marcado estimado na linha */
      arr(c.semRota).forEach(function (pid) {
        var p = A.existe && A.existe[pid], Le = c.semRotaL && c.semRotaL[pid]; if (!p || !(Le > 0)) return;
        var dois = c.fases && c.fases.length === 2;
        if (p.kind === "interruptor") { soma(S, CORES[fasesC[0]], Le, c.id, 1); soma(S, CORES.R, Le * (p.paralelo ? 2 : 1), c.id, 1); }
        else { soma(S, CORES[fasesC[0]], Le, c.id, 1); if (dois) soma(S, CORES[fasesC[1] || "B"], Le, c.id, 1); else soma(S, CORES.N, Le, c.id, 1); soma(PE, CORES.PE, Le, c.id, 1); }
      });
      /* sobras: em cada ponto e no quadro, por condutor */
      var nP = c.pontos.length, nQ = c.fases && c.fases.length === 2 ? 3 : 3;
      soma(S, CORES[fasesC[0]], (C.sobraPonto.valor * nP + C.sobraQuadro.valor), c.id);
      if (!(c.fases && c.fases.length === 2)) soma(S, CORES.N, (C.sobraPonto.valor * nP + C.sobraQuadro.valor), c.id); else soma(S, CORES[fasesC[1]], (C.sobraPonto.valor * nP + C.sobraQuadro.valor), c.id);
      soma(PE, CORES.PE, (C.sobraPonto.valor * nP + C.sobraQuadro.valor), c.id);
      void nQ;
    });
    var al = A.alimentador;
    if (al && al.secao) {
      A.fases.fases.forEach(function (f) { soma(al.secao, CORES[f], al.comprimento, "alimentador"); });
      soma(al.secao, CORES.N, al.comprimento, "alimentador"); soma(al.pe, CORES.PE, al.comprimento, "alimentador");
    }
    return Object.keys(porChave).map(function (k) { var o = porChave[k]; o.metros = r2(o.metros); o.estimado = r2(o.estimado); return o; }).sort(function (x, y) { return x.secao - y.secao || (x.cor < y.cor ? -1 : 1); });
  }

  /* ------------------------------------------------------------------ ORÇAMENTO (para o js/orcmodelo.js) — só o que ninguém mais orça */
  function servicosOrc(estado, avaliarFam, opc) {
    var T = TB(), out = [];
    var qd = quadroDe(estado, avaliarFam); if (!qd || !qd.projeto) return out;
    var A = analisar({ estado: estado, avaliarFam: avaliarFam, criterios: opc && opc.criterios }); if (!A.ok) return out;
    /* ⚠ ORÇAMENTO 100 % — R$ 0 PROIBIDO (revisão E2 + integração n23): o item que a SINAPI não tem na medida exata NÃO sai
       pendente (R$ 0, "fora do orçamento"); entra pela composição pública de MAIOR preço da mesma família (o maior disjuntor, o
       maior cabo, o maior eletroduto do alimentador), marcado "provisório — cotar", e o motivo segue na observação. `reserva`
       = [código, texto da fonte] usado só quando não há código exato. */
    function linha(id, rotulo, un, q, cod, motivo, obs, reserva) {
      var l = { id: id, rotulo: rotulo, unidade: un, quantidade: r4(q) };
      if (cod) { l.codigo = cod; if (obs) l.observacao = obs; }
      else if (reserva && reserva[0]) { l.codigo = reserva[0]; l.provisorio = true; l.observacao = "provisório — cotar com o fornecedor: " + motivo + "; orçado pela composição SINAPI MG 06/2026 de maior preço da família (" + reserva[0] + " " + reserva[1] + ")" + (obs ? "; " + obs : ""); }
      else { l.codigo = ""; l.motivo = motivo; }
      out.push(l);
    }
    var DMAX = T.DISJ_MAIOR[T.DISJ_MAIOR.length - 1], RES_DISJ = [DMAX[1], DMAX[2]], RES_CABO = [T.CABO_MAIOR[95], "cabo de cobre 0,6/1 kV 95 mm²"], RES_ELD = [T.ELETRODUTO_ALIM[75], "eletroduto PVC DN 75 mm"], RES_DR = [T.SINAPI.dr[2][63], "DR bipolar 63 A 30 mA"];
    /* cabos por seção (a SINAPI não muda de código pela cor; a cor vai no rótulo) */
    var porS = {};
    cabos(A).forEach(function (c) { var o = porS[c.secao] || (porS[c.secao] = { m: 0, cores: [], alim: 0, est: 0 }); o.m += c.metros; o.est += c.estimado || 0; o.cores.push(c.cor + " " + f1(c.metros) + " m"); if (c.circuitos.indexOf("alimentador") >= 0) o.alim = 1; });
    Object.keys(porS).sort(function (a, b) { return a - b; }).forEach(function (S) {
      var o = porS[S], cod = T.SINAPI.cabo[S], codM = cod ? null : T.CABO_MAIOR[S], obs = [];
      if (o.alim && A.alimentador.provisorio) obs.push("inclui o alimentador com comprimento PROVISÓRIO (" + f2(A.alimentador.comprimento) + " m) — confira");
      if (o.est > 0) obs.push("inclui " + f1(o.est) + " m ESTIMADOS de pontos sem eletroduto até o quadro (trace os eletrodutos: Circuitos e quadro)");
      if (codM) obs.push("provisório — cotar com o fornecedor: a SINAPI MG 06/2026 não tem o cabo 450/750 V de " + String(S).replace(".", ",") + " mm²; orçado pelo de maior preço da seção (" + codM + ", 0,6/1 kV)");
      linha("ele-cabo-" + S, "Cabo de cobre flexível " + (codM ? "0,6/1 kV " : "450/750 V ") + String(S).replace(".", ",") + " mm² (" + o.cores.join(" · ") + ")", "m", o.m, cod || codM, "cabo de " + S + " mm² sem composição SINAPI MG 06/2026",
        obs.length ? obs.join("; ") : null, RES_CABO);
    });
    /* disjuntores dos circuitos + o geral */
    var porD = {};
    A.circuitos.forEach(function (c) { var k = c.polos + "|" + c.dim.In; (porD[k] = porD[k] || []).push(c.id); });
    if (A.geral.In) { var kg = A.geral.polos + "|" + A.geral.In; (porD[kg] = porD[kg] || []).push("geral"); }
    Object.keys(porD).forEach(function (k) {
      var p = +k.split("|")[0], In = +k.split("|")[1], dc = T.disjuntorCodigo(p, In);
      linha("ele-disj-" + p + "p-" + In, "Disjuntor " + (p === 1 ? "monopolar" : p === 2 ? "bipolar" : "tripolar") + (In <= 63 ? " DIN " : " ") + In + " A (" + porD[k].join(", ") + ")", "un", porD[k].length, dc && dc.codigo, "disjuntor " + p + "P " + In + " A sem composição SINAPI MG 06/2026", dc && dc.provisorio ? dc.motivo : null, RES_DISJ);
    });
    /* o geral que não fecha (acima de 250 A) não some do orçamento nem sai R$ 0: o maior da SINAPI, provisório, e a pendência
       (projeto do quadro geral à parte) segue no auditor */
    if (!A.geral.In) linha("ele-disj-geral", "Disjuntor geral " + A.geral.polos + "P (" + f2(A.geral.ib) + " A por fase)", "un", 1, null, "disjuntor geral acima de 250 A — projeto do quadro geral à parte", null, RES_DISJ);
    /* o alimentador medidor → quadro: o eletroduto dele não está no modelo (DN da faixa da ND-5.1, provisório) */
    var al0 = A.alimentador, dnA = A.demanda && A.demanda.entrada ? A.demanda.entrada.eletrodutoPVC_mm : null;
    if (al0 && al0.comprimento > 0) {
      var codE = dnA != null ? T.ELETRODUTO_ALIM[dnA] : null;
      linha("ele-eletroduto-alim", "Eletroduto do alimentador medidor → quadro, PVC DN " + (dnA != null ? dnA : "?") + " mm", "m", al0.comprimento, codE,
        "eletroduto do alimentador sem DN pela ND-5.1 (fornecimento fora das Tabelas 1/2)", dnA != null ? "provisório — cotar com o fornecedor: DN " + dnA + " mm da " + (A.demanda.entrada ? A.demanda.entrada.tabela : "ND-5.1") + " (faixa " + (A.demanda.entrada ? A.demanda.entrada.faixa : "?") + ")" + (al0.provisorio ? ", comprimento PROVISÓRIO de " + f2(al0.comprimento) + " m" : "") : (al0.provisorio ? "comprimento PROVISÓRIO de " + f2(al0.comprimento) + " m" : null), RES_ELD);
    }
    if (al0 && al0.secao == null) linha("ele-cabo-alim", "Cabo do alimentador medidor → quadro (" + f2(al0.comprimento) + " m × " + (A.fases.fases.length + 2) + " condutores)", "m", al0.comprimento * (A.fases.fases.length + 2), null, "alimentador: nenhuma seção até 95 mm² atende o geral e a queda (confira a distância)", null, RES_CABO);
    var porR = {};
    A.drs.forEach(function (g) { var k = g.polos + "|" + g.In; (porR[k] = porR[k] || []).push(g.id); });
    Object.keys(porR).forEach(function (k) {
      var p = +k.split("|")[0], In = +k.split("|")[1], cod = (T.SINAPI.dr[p] || {})[In];
      linha("ele-dr-" + p + "p-" + In, "Dispositivo DR " + p + "P " + (In || "?") + " A, 30 mA (" + porR[k].join(", ") + ")", "un", porR[k].length, cod, "DR sem composição SINAPI MG 06/2026 nesta corrente", null, RES_DR);
    });
    if (A.dps.exigido) linha("ele-dps", "DPS classe II 20 kA 175 V (" + A.dps.quantidade + " = fases + neutro)", "un", A.dps.quantidade, T.SINAPI.dps, "");
    return out;
  }

  /* ⚠ O CABO tem UM dono (integração n23): com o projeto gravado no quadro, o cabo de TODA a instalação sai daqui (servicosOrc,
     por seção dimensionada — inclusive o da iluminação, com os condutores da ligação); o js/biminst.js então NÃO soma a fiação da
     ligação. Sem projeto, quem soma é o biminst (1,5 mm² da ligação). Antes os dois somavam o mesmo fio. */
  function cuidaDoCabo(estado, avaliarFam) { try { var q = quadroDe(estado, avaliarFam); return !!(q && q.projeto); } catch (e) { return false; } }

  var EleCircuitos = {
    cuidaDoCabo: cuidaDoCabo, campoCircuito: campoCircuito, circuitoManual: circuitoManual,
    CRITERIOS: CRITERIOS, CORES: CORES, FAM_QD: FAM_QD, criterios: criterios, lerPontos: lerPontos, quadroDe: quadroDe, proporQuadro: proporQuadro,
    dividir: dividir, demandaDe: demandaDe, distribuirFases: distribuirFases, dimensionar: dimensionar, exigeDR: exigeDR, agruparDR: agruparDR,
    condutoresPorTrecho: condutoresPorTrecho, nCond: nCond, derivacoesSemCaixa: derivacoesSemCaixa, analisar: analisar, lancar: lancar, cabos: cabos, servicosOrc: servicosOrc, _baseMaisOps: baseMaisOps
  };
  global.EleCircuitos = EleCircuitos;
  if (typeof module !== "undefined" && module.exports) module.exports = EleCircuitos;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
