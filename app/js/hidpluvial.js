/* =====================================================================
 * hidpluvial.js — PLUVIAL COMPLETO ATÉ A RUA (motor PURO, ES5, Node-testável). Frente F2 da Casa 487, 27/10/2026.
 *
 * Pedido do Rogério (27/10/2026): "a calha só com a BOCA de saída; o resto em tubo de PVC, paramétrico, EMBUTIDO na parede e
 * dimensionado até a rua. Se não couber na parede, criar SHAFT do lado de fora e descer por ele. Esconder." e "drenagem pluvial
 * completa: ralos no chão, ralo próximo da piscina, captar a água pluvial e jogar na rua. Sem interferência com a rede de esgoto".
 *
 *   HidPluvial.planejar(estado, o) → { ok, ops, descidas[], caixas[], ralos[], redes[], saida, avisos[], pendencias[], premissas[], decisoes[] }
 *       estado = o estado do BimEdit (paredes, telhados, calhas, condutores, instalações, terreno);
 *       o = { avaliarFam?, parametros?, areasExternas?:[{id,nome,contorno:[{x,z}]}], piscinas?:[{id,x,z,L,W,rotY}], calcada?:m }
 *   HidPluvial.verificar(estado, o)   → o auditor INDEPENDENTE do traçado: o pluvial nunca se liga ao esgoto, cruzamentos com cota,
 *       afastamento em planta, tudo chega à saída.
 *
 * COMO PLANEJA (cada passo escreve a premissa/decisão que tomou):
 *  1. DESCIDAS — de cada bocal de calha (estado.condutores) o condutor vira tubo PVC série R: um DESVIO curto sob a calha até a
 *     parede mais perto, o vertical EMBUTIDO no eixo dessa parede (cobertura da altura toda, longe de porta/janela, parede que
 *     comporta o DE + cobrimento dos dois lados — HidEmbutido.encaixe); não comportando ou sem parede ao alcance, SHAFT de
 *     drywall do lado de FORA (HidEmbutido.enchimento/opsEnchimento) e o vertical desce nele. Nunca aparente.
 *  2. PÉ — cada descida termina numa CAIXA de inspeção pluvial (caixa de alvenaria 0,60 m, tampa no terreno) do lado de fora, com o
 *     tubo saindo da parede por BAIXO do baldrame (mesma regra do esgoto: HidRede.baldrames/cruzamentos).
 *  3. RALOS — um por área externa descoberta contínua (garagem, passagem lateral, deck) e um próximo da borda da PISCINA.
 *  4. REDE — do pé de cada descida e de cada ralo até a SAÍDA na rua (lado da frente do lote), pela ÁREA EXTERNA; só passa sob a casa
 *     quando não há caminho de fora (avisa e dá o comprimento). Menor custo numa malha, com penalidade para cômodo, parede, perto do esgoto.
 *     Caixa de inspeção em toda origem, mudança de direção, junção, saída e a cada distância máxima da norma (HidNormas).
 *  5. COTAS — de montante para jusante, declividade acima da mínima da norma; saída na divisa com a ESPERA até a sarjeta.
 *  6. NOMES — as caixas pluviais recebem CP-01, CP-02… de montante para jusante (propriedade `nome` da peça; renomeável).
 *
 * ⚠ Nenhum número de norma aqui: declividade mínima, distância entre inspeções e DN vêm do HidNormas / BimInst; o que é geometria ou
 *   critério de projeto está em GEO_PLUV (hid:ok), trocável em parametros e declarado como premissa.
 * ⚠ SEM invenção de cota da rede pública: a saída é uma ESPERA na divisa/guia; cota e posição da sarjeta ficam em pendência.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function HEm() { return dep("HidEmbutido", "./biminstembutido.js"); }
  function HIm() { return dep("HidImplantacao", "./hidimplantacao.js"); }
  function HRo() { return dep("HidRota", "./hidrota.js"); }
  function HRd() { return dep("HidRede", "./hidrede.js"); }
  function NNo() { return dep("HidNormas", "./hidnormas.js"); }
  function GGe() { return dep("HidGeo", "./biminstgeo.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  var EPS = 1e-6;       // hid:ok tolerância numérica
  var CASAS = 10000;    // hid:ok 4 casas do biminst
  var METADE = 0.5;     // hid:ok metade
  function r4(v) { return Math.round(v * CASAS) / CASAS; }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  function d2(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
  function chave(i, j) { return i + "," + j; }

  /* ⚠ GEOMETRIA / CRITÉRIO DE PROJETO (não é norma) — trocável em parametros.pluvial, declarado nas premissas */
  var GEO_PLUV = {
    desvioMax: 1.0,          // hid:ok o desvio horizontal sob a calha até a parede: no máximo 1,0 m (o mesmo corte do hidap.js: acima disso é condutor horizontal)
    margemParede: 0.15,      // hid:ok o vertical a pelo menos 15 cm da ponta da parede (canto/pilar)
    folgaAbertura: 0.10,     // hid:ok o vertical a pelo menos 10 cm do vão de porta/janela
    passoBusca: 0.10,        // hid:ok passo da busca do ponto na parede e da amostragem da altura coberta
    toleranciaTopo: 0.30,    // hid:ok a parede pode ficar até 30 cm abaixo do bocal (o desvio da calha cobre o resto)
    larguraShaft: 0.30,      // hid:ok largura do shaft de drywall do lado de fora (paralela à parede)
    profPe: 0.30,            // hid:ok o eixo do tubo da rede no pé: 30 cm abaixo do terreno (cobrimento do tubo enterrado — critério)
    afastCaixa: 0.40,        // hid:ok o centro da caixa de inspeção do pé a 40 cm da face externa da parede (raio 0,30 + folga)
    raioCaixa: 0.30,         // hid:ok caixa de alvenaria de 0,60 m
    folgaBaldrame: 0.05,     // hid:ok folga do topo do tubo ao fundo do baldrame
    afastEsgoto: 0.50,       // hid:ok afastamento mínimo em planta entre o pluvial e o esgoto (critério; cruzamento só em cotas diferentes)
    folgaCruzamento: 0.20,   // hid:ok folga vertical entre as geratrizes no cruzamento com o esgoto
    margemDecl: 1.1,         // hid:ok declividade adotada = mínima da norma × 1,1 (absorve o arredondamento das cotas)
    passoMalha: 0.30,        // hid:ok malha de busca do caminho da rede
    margemLote: 0.20,        // hid:ok o tubo a pelo menos 20 cm da divisa (muro)
    caixaPeDentro: 0,        // hid:ok 1 = o pé que cai em ambiente fechado leva a caixa de inspeção JUNTO dele (a ≤ afastCaixa da parede, tampa reforçada), sem a saída reta até o lado de fora: lote sem faixa externa (F6, Casa 487)
    buscaPeRaio: 1.2,        // hid:ok o ponto livre da caixa do pé (caixaPeDentro) a no máximo isto do pé (m) — dentro do horizontal curto de desvioMax
    buscaPePasso: 0.05,      // hid:ok passo da varredura quadrada desse ponto
    buscaPeMin: 0.3,         // hid:ok a caixa de 0,60 m não encosta no eixo da descida
    custoInterior: 6,        // hid:ok pena por passo sob a edificação (prefere a área externa)
    custoParede: 4,          // hid:ok pena por travessia de parede
    custoEmParede: 10,       // hid:ok pena por passo DENTRO do corpo de uma parede (o tubo só a atravessa)
    custoEsgoto: 8,          // hid:ok pena por passo a menos de afastEsgoto do esgoto
    custoCurva: 0.5,         // hid:ok pena por curva (m equivalentes)
    distCaixas: 0.60,        // hid:ok duas caixas a menos disto viram uma só
    folgaRalo: 1.5,          // hid:ok o ralo a 1,5 × o diâmetro da caixa de qualquer caixa (fora da captura dela)
    esperaSaida: 0.60,       // hid:ok a espera depois da divisa quando a largura do passeio não é informada
    saidaParede: 0.20,       // hid:ok o ralo: o eixo do tubo 20 cm abaixo da tampa
    afastBordaPiscina: 0.45, // hid:ok o ralo da piscina a 45 cm da borda (fora do tanque)
    insetRalo: 0.40,         // hid:ok o ralo da área a 40 cm da borda do lado da rua
    profMaxRede: 1.2         // hid:ok profundidade do eixo acima da qual a rede pede revisão (aviso)
  };
  function geo(par, k) { var p = par && par.pluvial; if (p && p[k] != null && isFinite(Number(p[k]))) return Number(p[k]); if (par && par[k] != null && isFinite(Number(par[k]))) return Number(par[k]); return GEO_PLUV[k]; }

  /* ---------------------------------------------------------------- CONTEXTO */
  function paredesVivas(estado) {
    var HE = HEm(), dem = {};
    arr(estado && estado.caixas).forEach(function (c) { if (c && c.tipo === "parede" && c.faseDemolida && c.faseDemolida !== "Nenhum") dem[String(c.id)] = 1; });
    return (HE ? HE.paredes(estado) : []).filter(function (w) { return !dem[w.id]; });
  }
  function dentroPoli(p, poli) {
    var dentro = false;
    for (var i = 0, j = poli.length - 1; i < poli.length; j = i++) {
      var a = poli[i], b = poli[j];
      if (((a.z > p.z) !== (b.z > p.z)) && (p.x < (b.x - a.x) * (p.z - a.z) / ((b.z - a.z) || EPS) + a.x)) dentro = !dentro;
    }
    return dentro;
  }
  function distSeg(p, a, b) { var dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz, t = L2 > 0 ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2 : 0; t = Math.max(0, Math.min(1, t)); return Math.sqrt(Math.pow(p.x - (a.x + dx * t), 2) + Math.pow(p.z - (a.z + dz * t), 2)); }
  function distBorda(p, poli) { var m = Infinity; for (var i = 0; i < poli.length; i++) m = Math.min(m, distSeg(p, poli[i], poli[(i + 1) % poli.length])); return m; }
  function cruzaSeg(p1, p2, q1, q2) {
    var d1x = p2.x - p1.x, d1z = p2.z - p1.z, d2x = q2.x - q1.x, d2z = q2.z - q1.z, den = d1x * d2z - d1z * d2x;
    if (Math.abs(den) < EPS) return null;
    var t = ((q1.x - p1.x) * d2z - (q1.z - p1.z) * d2x) / den, u = ((q1.x - p1.x) * d1z - (q1.z - p1.z) * d1x) / den;
    if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
    return { t: t, u: u, x: p1.x + d1x * t, z: p1.z + d1z * t };
  }
  function bbox(P) { var x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; P.forEach(function (q) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }); return { x0: x0, x1: x1, z0: z0, z1: z1 }; }

  function contexto(estado, o) {
    o = o || {};
    var C = { estado: estado, o: o, par: o.parametros || {}, aval: o.avaliarFam || null, avisos: [], pend: [], premissas: [], decisoes: [], ops: [] };
    C.aviso = function (t, els) { C.avisos.push({ texto: t, elementos: arr(els) }); };
    C.pendencia = function (ch, motivo, els) { C.pend.push({ chave: ch, motivo: motivo, texto: motivo, elementos: arr(els) }); };
    C.premissa = function (item, valor) { if (!C.premissas.some(function (p) { return p.item === item; })) C.premissas.push({ item: item, valor: valor, origem: "pluvial" }); };
    C.decide = function (id, t) { C.decisoes.push({ id: id, texto: t }); };
    C.HE = HEm(); C.HI = HIm(); C.HR = HRo(); C.HRd = HRd(); C.NR = NNo(); C.B = BI();
    C.Ws = paredesVivas(estado);
    C.wsHI = C.Ws.map(function (w) { return { id: w.id, p1: w.p1, p2: w.p2, esp: w.esp, base: w.base, altura: w.topo - w.base }; });
    try { C.obst = C.HR ? C.HR.obstaculosDoBim(estado, C.aval) : { aberturas: [], familias: [], pilares: [], divisas: [] }; } catch (e) { C.obst = { aberturas: [], familias: [], pilares: [], divisas: [] }; }
    C.lote = C.HI ? C.HI.lote(estado) : null;
    /* "DENTRO" para o pluvial = dentro do corpo de uma parede ou de um ambiente FECHADO. Não vale o "cercado por paredes" do esgoto:
       a passagem lateral e o deck são áreas externas mesmo cercadas por muro/parede. A área externa informada (piso externo, deck) vence o polígono
       de ambiente (a SUÍTE do modelo engloba o deck e a piscina). */
    var EXT_NOME = /garagem|varanda|quintal|p[aá]tio|deck|jardim|passagem|[aá]rea externa|piscina|calçada|calcada|passeio/i;
    var ambs = arr(estado && estado.ambientes).filter(function (a) { return a && a.calc && arr(a.calc.contorno).length >= 3 && !EXT_NOME.test(txt(a.nome)); }).map(function (a) { return a.calc.contorno.map(function (q) { return { x: num(q.x, 0), z: num(q.z, 0) }; }); });   // hid:ok polígono tem 3+ vértices
    var extPolis = null;
    C.dentro = function (p) {
      if (extPolis == null) { extPolis = []; regioesExternas(C).forEach(function (g) { g.polis.forEach(function (pl) { extPolis.push(pl); }); }); }
      if (extPolis.some(function (pl) { return dentroPoli(p, pl); })) return false;
      if (C.Ws.some(function (w) { return distSeg(p, w.p1, w.p2) < w.hw - EPS; })) return true;
      return ambs.some(function (pl) { return dentroPoli(p, pl); });
    };
    var T = null; try { T = C.HRd ? C.HRd.terrenoDe(estado, C.par) : null; } catch (e2) { T = null; }
    C.Ty = T && isFinite(Number(T.y)) ? Number(T.y) : num(C.par.cotaTerreno, 0);
    if (!T) C.premissa("cota do terreno", "sem referência no modelo: adotado " + f2(C.Ty) + " m (piso do térreo)");
    var ctx = C.NR ? C.NR.contexto() : null; C.ctxN = ctx;
    var dm = ctx ? ctx.consulta("ap.condutor_horizontal.declividade_minima", null, "valor", "pluvial: declividade mínima do condutor horizontal") : { ok: false };
    C.decMin = dm.ok ? num(dm.valor, null) : null;
    if (C.decMin == null) { C.pendencia("ap.condutor_horizontal.declividade_minima", "declividade mínima do condutor horizontal sem tabela: a rede horizontal não foi cotada"); }
    C.decAdot = C.decMin != null ? C.decMin * geo(C.par, "margemDecl") : null;
    var di = ctx ? ctx.consulta("ap.inspecao.distancia_max_m", null, "valor", "pluvial: distância entre inspeções") : { ok: false };
    C.distInsp = di.ok ? num(di.valor, null) : null;
    if (C.distInsp == null) C.pendencia("ap.inspecao.distancia_max_m", "distância máxima entre inspeções do pluvial sem tabela: nenhuma caixa intercalada");
    C.dnH = num(C.par.dnPluvial, (C.B && C.B.MATERIAIS && C.B.MATERIAIS.pvc_serie_r) ? C.B.MATERIAIS.pvc_serie_r.dn : null);
    return C;
  }
  function deDoDn(dn) { var G = GGe(), c = null; try { c = G && G.cotasTubo ? G.cotasTubo("pvc_serie_r", dn) : null; } catch (e) { c = null; } return c && c.de > 0 ? c.de / 1000 : dn / 1000; }

  /* ---------------------------------------------------------------- A RUA (lado da frente do lote) */
  function ruaDe(C, pontos) {
    var par = C.par, lote = C.lote, Cn = C.HI ? C.HI.contorno(C.estado, { paredes: C.wsHI }) : null, lado = par.ladoSaida && ["z0", "x1", "z1", "x0"].indexOf(par.ladoSaida) >= 0 ? par.ladoSaida : null, origem = "parâmetro ladoSaida";
    if (!lado && Cn && C.HI) { var F = C.HI._int.ladoFrente(C.estado, Cn, pontos, { parametros: par, paredes: C.wsHI }); lado = F.lado; origem = F.origem; if (F.pendente) C.pendencia("pluvial.rua", "lado da rua: " + F.origem + " — informe parametros.ladoSaida (z0, x1, z1 ou x0)"); }
    if (!lado) { lado = "z1"; origem = "sem paredes: adotado z1"; C.pendencia("pluvial.rua", "lado da rua não identificado: informe parametros.ladoSaida"); }
    var P = lote ? lote.contorno : (Cn ? [{ x: Cn.x0, z: Cn.z0 }, { x: Cn.x1, z: Cn.z0 }, { x: Cn.x1, z: Cn.z1 }, { x: Cn.x0, z: Cn.z1 }] : []);
    var B = bbox(P), eixo = lado.charAt(0), alto = lado.charAt(1) === "1";
    var borda = eixo === "z" ? (alto ? B.z1 : B.z0) : (alto ? B.x1 : B.x0), sinal = alto ? 1 : -1;
    return { lado: lado, eixo: eixo, borda: borda, sinal: sinal, origem: origem, bbox: B, poli: P, comLote: !!lote };
  }
  function pontoNaRua(R, along, fora) { return R.eixo === "z" ? { x: along, z: R.borda + R.sinal * fora } : { x: R.borda + R.sinal * fora, z: along }; }

  /* ---------------------------------------------------------------- 1) DESCIDAS EMBUTIDAS / SHAFT */
  function aberturasDe(C) { return arr(C.obst.aberturas); }
  function ladoExterno(C, w, s) {
    /* a normal (unitária) do lado de FORA da parede w na posição s: o lado cuja sonda não cai em ambiente fechado */
    var pe = { x: w.p1.x + w.u.x * s, z: w.p1.z + w.u.z * s }, nw = { x: -w.u.z, z: w.u.x }, sd = w.hw + geo(C.par, "afastCaixa"), cand = [];
    [1, -1].forEach(function (k) {
      var q = { x: pe.x + nw.x * k * sd, z: pe.z + nw.z * k * sd }, dentro = C.dentro(q);
      cand.push({ n: { x: nw.x * k, z: nw.z * k }, dentro: dentro, q: q });
    });
    var fora = cand.filter(function (c) { return !c.dentro; });
    return { n: (fora[0] || cand[0]).n, ambos: fora.length === 2, nenhum: fora.length === 0 };
  }
  /* o vertical em P (x,z) de yBase a yTopo cabe DENTRO de paredes empilhadas? (cada y numa parede que comporta o DE + cobrimento) */
  function cobertoPorParedes(C, P, yBase, yTopo, de) {
    var HE = C.HE, passo = geo(C.par, "passoBusca"), tolTopo = geo(C.par, "toleranciaTopo"), y = yBase, ok = true, usadas = {};
    while (y <= yTopo - tolTopo + EPS) {
      var achou = null;
      for (var i = 0; i < C.Ws.length && !achou; i++) {
        var w = C.Ws[i]; if (y < w.base - EPS || y > w.topo + EPS) continue;
        var dx = P.x - w.p1.x, dz = P.z - w.p1.z, s = dx * w.u.x + dz * w.u.z, v = -dx * w.u.z + dz * w.u.x;
        if (s < geo(C.par, "margemParede") - EPS || s > w.L - geo(C.par, "margemParede") + EPS) continue;
        var E = HE.encaixe(w.esp, de, {}); if (!E.cabe) continue;
        if (Math.abs(v) > (w.esp - E.precisa) * METADE + EPS) continue;
        achou = w;
      }
      if (!achou) { ok = false; break; }
      usadas[achou.id] = 1;
      y += passo;
    }
    return { ok: ok, paredes: Object.keys(usadas) };
  }
  function foraDeVao(C, P, w) {
    var fa = geo(C.par, "folgaAbertura"), r = true;
    aberturasDe(C).forEach(function (a) { if (distSeg(P, a.p1, a.p2) < fa + num(a.espessura, 0) * METADE + EPS && distSeg(P, w.p1, w.p2) < num(a.espessura, 0) + w.hw + EPS) r = false; });
    return r;
  }
  function acharPontoNaParede(C, S, yTopo, yBase, de) {
    var mx = geo(C.par, "desvioMax"), passo = geo(C.par, "passoBusca"), melhor = null;
    C.Ws.forEach(function (w) {
      var dxs = S.x - w.p1.x, dzs = S.z - w.p1.z, s0 = dxs * w.u.x + dzs * w.u.z, v0 = -dxs * w.u.z + dzs * w.u.x;
      if (Math.abs(v0) - w.hw > mx + EPS) return;
      var mg = geo(C.par, "margemParede");
      for (var k = 0; k <= Math.ceil(w.L / passo); k++) {
        var s = s0 + (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * passo;
        if (s < mg - EPS || s > w.L - mg + EPS) continue;
        var P = { x: w.p1.x + w.u.x * s, z: w.p1.z + w.u.z * s }, dist = d2(S, P);
        if (dist > mx + EPS) continue;
        if (melhor && dist >= melhor.dist - EPS) continue;
        if (!foraDeVao(C, P, w)) continue;
        var cob = cobertoPorParedes(C, P, yBase, yTopo, de);
        if (!cob.ok) continue;
        melhor = { P: P, w: w, s: s, dist: dist, paredes: cob.paredes };
        break;   /* para esta parede o ponto mais perto (k crescente = mais longe de s0) */
      }
    });
    return melhor;
  }
  function viaShaft(C, S, yTopo, yBase, de, idBase) {
    /* a parede mais perto de S (qualquer espessura) e o shaft de drywall na face de FORA dela */
    var HE = C.HE, melhor = null;
    C.Ws.forEach(function (w) {
      if (yBase > w.topo || yTopo < w.base) return;
      var dxs = S.x - w.p1.x, dzs = S.z - w.p1.z, s = Math.max(geo(C.par, "margemParede"), Math.min(w.L - geo(C.par, "margemParede"), dxs * w.u.x + dzs * w.u.z));
      var P = { x: w.p1.x + w.u.x * s, z: w.p1.z + w.u.z * s }, dist = d2(S, P) - w.hw;
      if (!melhor || dist < melhor.dist - EPS) melhor = { w: w, s: s, P: P, dist: Math.max(0, dist) };
    });
    if (!melhor) return null;
    var w = melhor.w, lf = ladoExterno(C, w, melhor.s), n = lf.n;
    var sol = HE.enchimento({ id: w.id, esp: 0 }, de, {});
    var e = sol.precisa ? sol.espessura : HE.encaixe(0, de, {}).precisa, larg = Math.max(geo(C.par, "larguraShaft"), de + 2 * geo(C.par, "folgaAbertura"));
    var sA = Math.max(0, melhor.s - larg * METADE), sB = Math.min(w.L, melhor.s + larg * METADE);
    var fA = { x: r4(w.p1.x + w.u.x * sA + n.x * w.hw), z: r4(w.p1.z + w.u.z * sA + n.z * w.hw) }, fB = { x: r4(w.p1.x + w.u.x * sB + n.x * w.hw), z: r4(w.p1.z + w.u.z * sB + n.z * w.hw) };
    var eixoV = { x: r4((fA.x + fB.x) * METADE + n.x * e * METADE), z: r4((fA.z + fB.z) * METADE + n.z * e * METADE) };
    var nIn = { x: -n.x, z: -n.z };
    var topo = r4(yTopo + geo(C.par, "passoBusca") * METADE), base = r4(yBase);
    var marcas = { pluvial: idBase };
    var ops = HE.opsEnchimento("ap-shaft-" + idBase, { id: w.id }, fA, fB, nIn, base, topo, { precisa: true, solucao: "shaft", espessura: r4(e), falta: r4(e), sinapi: sol.sinapi || (HE.enchimento({ id: w.id, esp: 0 }, de, {}).sinapi) }, marcas);
    return { P: eixoV, w: w, parede: w.id, ops: ops, esp: r4(e), largura: r4(sB - sA), dist: d2(S, eixoV), ambosLados: lf.ambos, nenhumFora: lf.nenhum };
  }

  /* ---------------------------------------------------------------- baldrame no pé */
  function profPeCom(C, Pv, Q, yPe, raio) {
    /* o tubo do pé (do eixo da parede até a caixa) passa por BAIXO do baldrame (mesma regra do esgoto) */
    var Hr = C.HRd; if (!Hr || !Hr.baldrames) return { y: yPe, cruza: [] };
    if (C._BL == null) { try { C._BL = Hr.baldrames(C.estado, C.par); } catch (e) { C._BL = { lista: [] }; } if (!C._BL.lista.length) C.pendencia("pluvial.baldrame", "nenhuma viga baldrame no modelo nem parâmetro (altura, largura e topo): a travessia do pé do condutor pela fundação não foi verificada"); }
    var cr = []; try { cr = Hr.cruzamentos({ x: Pv.x, y: yPe, z: Pv.z }, { x: Q.x, y: yPe, z: Q.z }, raio, C._BL.lista); } catch (e2) { cr = []; }
    var y = yPe;
    cr.forEach(function (q) { var req = q.b.yBase - geo(C.par, "folgaBaldrame") - raio; if (y > req + EPS) y = req; });
    return { y: r4(y), cruza: cr.map(function (q) { return q.b.id; }) };
  }

  /* o pé cai em ambiente fechado (ou em lugar ocupado): sai em LINHA RETA, por baixo do piso, até o primeiro ponto livre do lado de fora */
  function saidaReta(C, Pv, nPref, bl) {
    var D45 = 0.7071;   // hid:ok cos 45° (as diagonais da saída reta)
    var dirs = [nPref, { x: -nPref.x, z: -nPref.z }, { x: -nPref.z, z: nPref.x }, { x: nPref.z, z: -nPref.x }].concat([[1, 1], [1, -1], [-1, 1], [-1, -1]].map(function (q) { return { x: q[0] * D45, z: q[1] * D45 }; })), melhor = null,   /* F6: também as 4 diagonais — a saída reta mais curta até o lado de fora (sem elas a cozinha ia 16,8 m até a frente quando a passagem lateral estava a 6 m na diagonal) */ passo = geo(C.par, "passoBusca"), rc = geo(C.par, "raioCaixa") + geo(C.par, "folgaAbertura");
    dirs.forEach(function (d, k) {
      for (var t = passo; t <= 25; t += passo) {   // hid:ok até 25 m de busca
        var p = { x: Pv.x + d.x * t, z: Pv.z + d.z * t };
        if (C.dentro(p) || bl(p)) continue;
        if (C.Ws.some(function (w) { return distSeg(p, w.p1, w.p2) < w.hw + rc; })) continue;
        if (!melhor || t < melhor.t - EPS) melhor = { Q: { x: r4(p.x), z: r4(p.z) }, t: t, k: k };
        break;
      }
    });
    return melhor;
  }
  function descidas(C, R) {
    var HE = C.HE, out = [], porId = {}, ordem = arr(C.estado.condutores).filter(function (c) { return c && c.ok && num(c.alturaM, 0) > geo(C.par, "passoBusca") * METADE; });
    ordem.sort(function (a, b) { return String(a.id) < String(b.id) ? -1 : 1; });
    arr(C.estado.condutores).forEach(function (c) { if (c && !c.ok) C.aviso("O condutor " + c.id + " não tem calha válida (calha órfã ou sem comprimento): ficou de fora do pluvial.", [c.id]); });
    ordem.forEach(function (c, i) {
      var id = "d" + (i + 1), S = { x: c.x, z: c.z }, yTopo = c.yTopo, yBase = c.yBase, dn = num(c.dnEf, C.dnH), de = deDoDn(dn), dec = C.decAdot != null ? C.decAdot : 0;
      var P = acharPontoNaParede(C, S, yTopo, yBase, de), item = { id: id, condutor: c.id, trechoAntigo: c.trecho || null, calha: c.calha, bocal: { x: r4(S.x), y: r4(yTopo), z: r4(S.z) }, dn: dn, ops: [], via: null };
      if (c.dnEf == null) C.premissa("DN do condutor " + c.id, "DN " + dn + " (o DN final vem do dimensionamento da NBR 10844 — ábaco; autocorreção do dimensionamento)");
      var Pv;
      if (P) {
        item.via = "embutido"; item.parede = P.w.id; item.paredes = P.paredes; Pv = P.P; item.dist = r4(P.dist);
        item.nota = "embutido no eixo da parede " + P.w.id + (P.paredes.length > 1 ? " e nas que a empilham (" + P.paredes.join(", ") + ")" : "");
      } else {
        var sh = viaShaft(C, S, yTopo, yBase, de, id);
        if (!sh) { C.pendencia("pluvial.descida." + c.id, "o condutor " + c.id + " não tem parede ao alcance nem onde apoiar um shaft: sem desenho embutido", [c.id]); item.via = "pendente"; out.push(item); return; }
        item.via = "shaft"; item.parede = sh.parede; Pv = sh.P; item.dist = r4(sh.dist); item.shaft = { parede: sh.parede, esp: sh.esp, largura: sh.largura };
        sh.ops.forEach(function (o) { item.ops.push(o); });
        item.nota = "SHAFT de drywall (" + f2(sh.esp * 100) + " cm × " + f2(sh.largura * 100) + " cm) na face de fora da parede " + sh.parede + ": a parede não comporta o DE " + f2(de * 1000) + " mm com cobrimento ou não cobre a altura toda";
        if (sh.nenhumFora) C.aviso("Shaft do condutor " + c.id + ": os dois lados da parede " + sh.parede + " são ambiente fechado — confirmar o lado do shaft.", [c.id]);
        if (sh.dist > geo(C.par, "desvioMax") + EPS) C.aviso("Shaft do condutor " + c.id + " a " + f2(sh.dist) + " m do bocal (mais que o desvio de " + f2(geo(C.par, "desvioMax")) + " m): o desvio da calha vira condutor horizontal — conferir.", [c.id]);
      }
      item.Pv = { x: r4(Pv.x), z: r4(Pv.z) };
      /* o lado de fora, a posição da caixa do pé e a cota */
      var wP = (C.Ws.filter(function (w) { return w.id === item.parede; })[0]) || null, nOut, sAlong = 0;
      if (wP) { sAlong = (Pv.x - wP.p1.x) * wP.u.x + (Pv.z - wP.p1.z) * wP.u.z; nOut = ladoExterno(C, wP, Math.max(0, Math.min(wP.L, sAlong))).n; }
      else nOut = { x: 0, z: 1 };
      var espFace = item.via === "shaft" ? (item.shaft.esp + wP.hw) : (wP ? wP.hw : 0);
      var Q = { x: r4(Pv.x + nOut.x * (espFace + geo(C.par, "afastCaixa"))), z: r4(Pv.z + nOut.z * (espFace + geo(C.par, "afastCaixa"))) };
      var bl = bloqueioDe(C, R);
      if (geo(C.par, "caixaPeDentro") && bl(Q)) {
        /* F6: o ponto padrão (a afastCaixa da parede) está ocupado (família, pilar, vão, muro): a caixa do pé vai ao ponto LIVRE mais perto do pé, até 1,2 m
           (o horizontal do pé de até desvioMax a uma caixa é a inspeção do pé — NBR 10844 5.7.5 pela leitura do hidap.js) */
        var rcL = geo(C.par, "raioCaixa") + geo(C.par, "folgaAbertura"), melhorL = null;
        var rBp = geo(C.par, "buscaPeRaio"), pBp = geo(C.par, "buscaPePasso"), mBp = geo(C.par, "buscaPeMin");
        for (var gx = -rBp; gx <= rBp + EPS; gx = r4(gx + pBp)) {
          for (var gz = -rBp; gz <= rBp + EPS; gz = r4(gz + pBp)) {
            var pL = { x: r4(Pv.x + gx), z: r4(Pv.z + gz) }, dL = Math.sqrt(gx * gx + gz * gz);
            if (dL > rBp + EPS || dL < mBp - EPS || (melhorL && dL >= melhorL.d - EPS)) continue;
            if (bl(pL) || C.Ws.some(function (w) { return distSeg(pL, w.p1, w.p2) < w.hw + rcL; })) continue;
            melhorL = { x: pL.x, z: pL.z, d: dL };
          }
        }
        if (melhorL) { Q = { x: melhorL.x, z: melhorL.z }; C.aviso("A descida " + c.id + ": o ponto padrão da caixa do pé está ocupado; a caixa CP fica em (" + f2(Q.x) + "; " + f2(Q.z) + "), a " + f2(d2(Pv, Q)) + " m do pé (premissa do lote sem faixa externa).", [c.id]); }
      }
      if (geo(C.par, "caixaPeDentro") && C.dentro(Q) && !bl(Q)) {
        /* F6 (Casa 487): a caixa de inspeção do pé fica JUNTO do pé, sob o piso do ambiente (tampa de ferro reforçada, lote sem faixa externa); a rede segue por malha, com a pena de interior */
        item.caixaDentro = true;
        C.aviso("A descida " + c.id + " termina em ambiente fechado: a caixa de inspeção CP do pé fica a " + f2(geo(C.par, "afastCaixa")) + " m da parede, sob o piso (tampa de ferro fundido reforçada — premissa do lote sem faixa externa); a rede segue daí.", [c.id]);
      } else if (C.dentro(Q) || bl(Q)) {
        var QS = saidaReta(C, Pv, nOut, bl);
        if (QS) { Q = QS.Q; item.sobPiso_m = r4(QS.t); C.aviso("A descida " + c.id + " termina no lado de dentro: o tubo sai em linha reta por BAIXO do piso (" + f2(QS.t) + " m) até a caixa CP do lado de fora — conferir os baldrames no caminho com o estrutural.", [c.id]); }
        else { C.pendencia("pluvial.pe." + c.id, "o pé da descida " + c.id + " não tem saída livre até o lado de fora em 25 m", [c.id]); item.via = "pendente"; out.push(item); return; }
      }
      item.n = nOut; item.Q = Q;
      var yPe0 = r4(C.Ty - geo(C.par, "profPe")), bal = profPeCom(C, Pv, Q, yPe0, de * METADE);
      item.yPe = bal.y; item.baldrames = bal.cruza; item.de = de;
      if (bal.cruza.length) C.decide("pluvial.pe.baldrame", "Pé do condutor " + c.id + ": sai da parede POR BAIXO do baldrame " + bal.cruza.join(", ") + " (" + f2(geo(C.par, "folgaBaldrame")) + " m de folga) — mesma regra do esgoto.");
      out.push(item); porId[c.id] = item;
    });
    return out;
  }

  /* ---------------------------------------------------------------- 3) RALOS */
  function poligonoDoVolume(v) {
    var rc = v && v.receita; if (!rc || rc.forma !== "extrusao" || arr(rc.contorno).length < 3) return null;   // hid:ok polígono tem 3+ vértices
    var pl = rc.plano || { o: [0, 0, 0], u: [1, 0, 0], v: [0, 0, 1] }, O = pl.o || [0, 0, 0], U = pl.u || [1, 0, 0], V = pl.v || [0, 0, 1];
    return rc.contorno.map(function (q) { return { x: O[0] + U[0] * q[0] + V[0] * q[1], z: O[2] + U[2] * q[0] + V[2] * q[1] }; });
  }
  function regioesExternas(C) {
    var o = C.o, regs = [];
    arr(o.areasExternas).forEach(function (a, k) { if (arr(a.contorno).length >= 3) regs.push({ id: txt(a.id) || "area" + (k + 1), nome: txt(a.nome) || txt(a.id), poli: a.contorno.map(function (q) { return { x: num(q.x, 0), z: num(q.z, 0) }; }), origem: "informada" }); });   // hid:ok polígono tem 3+ vértices
    if (!regs.length && o.areasExternas !== false) {
      arr(C.estado.volumes).forEach(function (v) {
        var nome = txt(v.nome);
        if (!(/^piso externo:/i.test(nome) || /deck/i.test(nome))) return;
        if (/jardim|paisag|passeio|grama|calcada|calçada/i.test(nome)) return;
        var P = poligonoDoVolume(v); if (!P) return;
        regs.push({ id: txt(v.id), nome: nome, poli: P, origem: "volume do modelo" });
      });
    }
    /* junta as peças coladas (deck em 6 partes = 1 região): caixas envolventes que se tocam (a menos de 5 cm) */
    var grupos = regs.map(function (r) { return { ids: [r.id], nomes: [r.nome], polis: [r.poli], b: bbox(r.poli), origem: r.origem }; });
    var mudou = true, tol = 0.05;   // hid:ok 5 cm: peças coladas
    while (mudou) {
      mudou = false;
      for (var i = 0; i < grupos.length && !mudou; i++) for (var j = i + 1; j < grupos.length && !mudou; j++) {
        var a = grupos[i].b, b = grupos[j].b;
        if (a.x0 <= b.x1 + tol && b.x0 <= a.x1 + tol && a.z0 <= b.z1 + tol && b.z0 <= a.z1 + tol) {
          grupos[i] = { ids: grupos[i].ids.concat(grupos[j].ids), nomes: grupos[i].nomes.concat(grupos[j].nomes), polis: grupos[i].polis.concat(grupos[j].polis), b: { x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), z0: Math.min(a.z0, b.z0), z1: Math.max(a.z1, b.z1) }, origem: grupos[i].origem };
          grupos.splice(j, 1); mudou = true;
        }
      }
    }
    return grupos;
  }
  function piscinasDe(C) {
    var out = [];
    arr(C.o.piscinas).forEach(function (p) { out.push({ id: txt(p.id) || "piscina", x: num(p.x, 0), z: num(p.z, 0), L: num(p.L, 0), W: num(p.W, 0), rotY: num(p.rotY, 0) }); });
    if (!out.length) arr(C.estado.familias).forEach(function (f) {
      if (!/piscina/i.test(txt(f.famId)) || /maquina|máquina/i.test(txt(f.famId))) return;
      var av = null; try { av = C.aval ? C.aval(f.famId, f.tipoId, f.inst || {}) : null; } catch (e) { av = null; }
      var cx = av && av.caixa; if (!cx) { C.pendencia("pluvial.piscina." + f.id, "a piscina " + f.id + " não tem dimensões avaliáveis: informe o.piscinas para o ralo da borda", [f.id]); return; }
      out.push({ id: f.id, x: num(f.x, 0), z: num(f.z, 0), L: num(cx.x1, 0) - num(cx.x0, 0), W: num(cx.z1, 0) - num(cx.z0, 0), rotY: num(f.rotY, 0) });
    });
    return out;
  }
  function ralos(C, R) {
    var out = [], reg = regioesExternas(C), pisc = piscinasDe(C), n = 0, sy = C.Ty - geo(C.par, "saidaParede");
    function livre(p) { return !C.dentro(p); }
    function novo(tipo, nome, p, extra) { n++; var r = { id: "ralo" + n, tipo: tipo, nome: nome, x: r4(p.x), z: r4(p.z), yTampa: r4(C.Ty), yEixo: r4(sy) }; Object.keys(extra || {}).forEach(function (k) { r[k] = extra[k]; }); out.push(r); return r; }
    var comPiscina = {};
    pisc.forEach(function (p) {
      var cs = Math.cos(p.rotY), sn = Math.sin(p.rotY), eu = { x: cs, z: -sn }, ev = { x: sn, z: cs }, hl = p.L * METADE, hw = p.W * METADE, afs = geo(C.par, "afastBordaPiscina");
      /* o ralo no lado do tanque que olha para a RUA (a água corre para lá), no meio da borda, a afs da borda */
      var lados = [{ n: eu, h: hl }, { n: { x: -eu.x, z: -eu.z }, h: hl }, { n: ev, h: hw }, { n: { x: -ev.x, z: -ev.z }, h: hw }], melhor = null;
      lados.forEach(function (ld) {
        var q = { x: p.x + ld.n.x * (ld.h + afs), z: p.z + ld.n.z * (ld.h + afs) }, dr = (R.eixo === "z" ? q.z : q.x) * R.sinal;
        if (!livre(q) || (C.lote && !dentroPoli(q, C.lote.contorno))) return;
        if (!melhor || dr > melhor.dr + EPS) melhor = { q: q, dr: dr };
      });
      if (!melhor) { C.pendencia("pluvial.ralo.piscina." + p.id, "não achei lugar livre para o ralo ao lado da piscina " + p.id, [p.id]); return; }
      var r = novo("piscina", "ralo da piscina " + p.id, melhor.q, { piscina: p.id });
      r.nota = "a " + f2(afs) + " m da borda do tanque, no lado da rua";
      grupos: for (var g = 0; g < reg.length; g++) { if (reg[g].polis.some(function (pl) { return dentroPoli(melhor.q, pl); })) { comPiscina[g] = 1; break grupos; } }
    });
    reg.forEach(function (g, gi) {
      if (comPiscina[gi]) return;
      var b = g.b, alto = R.sinal > 0, inset = geo(C.par, "insetRalo");
      var ax = (b.x0 + b.x1) * METADE, az = (b.z0 + b.z1) * METADE, q = R.eixo === "z" ? { x: ax, z: alto ? b.z1 - inset : b.z0 + inset } : { x: alto ? b.x1 - inset : b.x0 + inset, z: az };
      /* garante dentro de uma das peças da região; senão o centro de uma peça */
      if (!g.polis.some(function (pl) { return dentroPoli(q, pl); })) q = { x: (bbox(g.polis[0]).x0 + bbox(g.polis[0]).x1) * METADE, z: (bbox(g.polis[0]).z0 + bbox(g.polis[0]).z1) * METADE };
      if (!livre(q)) { C.pendencia("pluvial.ralo." + g.ids[0], "o ponto do ralo da área " + g.nomes[0] + " cai em ambiente fechado: informe o lugar", [g.ids[0]]); return; }
      var r = novo("area", "ralo da área " + g.nomes[0].replace(/^piso externo:\s*/i, ""), q, { area: g.ids });
      r.nota = "um ralo para a área externa contínua (" + g.ids.length + " peça(s)), no lado da rua";
    });
    if (out.length) C.premissa("ralos pluviais", "um ralo por área externa descoberta contínua e um ao lado da piscina; a norma de cálculo do acervo (NBR 10844) dá a área de contribuição para o dimensionamento do condutor, não o número de ralos — sem regra de espaçamento no acervo: adotado 1 ralo por área impermeável contínua (premissa; conferir a declividade do piso na obra)");
    return out;
  }

  /* ---------------------------------------------------------------- 4) A REDE (caminho pela malha) */
  /* o ponto p é inaproveitável para tubo/caixa: fora do lote, no corpo de parede, em família (louça, casa de máquinas), pilar, piscina ou perto de caixa de esgoto */
  function bloqueioDe(C, R, soCorpo) {
    var mg = geo(C.par, "margemLote"), fams = arr(C.obst.familias), pil = arr(C.obst.pilares), pisc = piscinasDe(C), caixasEsg = [];
    arr(C.estado.instalacoes && C.estado.instalacoes.pecas).forEach(function (k) { if (k.sistema === "pluvial" && /^ap-/.test(txt(k.id))) return; if (k.sistema === "esgoto" || k.peca === "caixa_inspecao" || k.peca === "caixa_gordura") caixasEsg.push({ x: k.x, z: k.z }); });
    arr(C.estado.familias).forEach(function (f) { if (/caixa-(inspecao|gordura|areia)/.test(txt(f.famId))) caixasEsg.push({ x: f.x, z: f.z }); });
    return function (p) {
      if (R && R.comLote && (!dentroPoli(p, R.poli) || distBorda(p, R.poli) < mg - EPS)) return true;
      if (!soCorpo && C.Ws.some(function (w) { return distSeg(p, w.p1, w.p2) < w.hw + mg * METADE - EPS; })) return true;
      if (fams.some(function (v) { var dx = p.x - v.cx, dz = p.z - v.cz, u = dx * v.ux + dz * v.uz, w = -dx * v.uz + dz * v.ux; return Math.abs(u) <= v.hl + mg * METADE && Math.abs(w) <= v.hw + mg * METADE && v.y0 < C.Ty + 1 && v.y1 > C.Ty - 1; })) return true;   // hid:ok 1 m: família que toca o piso
      if (pil.some(function (q) { return Math.abs(p.x - q.x) <= q.largura * METADE + mg * METADE && Math.abs(p.z - q.z) <= q.profundidade * METADE + mg * METADE; })) return true;
      if (pisc.some(function (q) { var cs = Math.cos(q.rotY), sn = Math.sin(q.rotY), dx = p.x - q.x, dz = p.z - q.z, u = dx * cs - dz * sn, w = dx * sn + dz * cs; return Math.abs(u) <= q.L * METADE + mg && Math.abs(w) <= q.W * METADE + mg; })) return true;
      if (caixasEsg.some(function (q) { return d2(p, q) < geo(C.par, "raioCaixa") + mg; })) return true;
      return false;
    };
  }
  function montarMalha(C, R, esgotoSegs) {
    var h = geo(C.par, "passoMalha"), B = R.bbox, cells = {}, nx = Math.floor((B.x1 - B.x0) / h), nz = Math.floor((B.z1 - B.z0) / h), ca = geo(C.par, "afastEsgoto"), bl = bloqueioDe(C, R, true), rcx = geo(C.par, "raioCaixa") + geo(C.par, "folgaAbertura");
    var G = { h: h, x0: B.x0 + (B.x1 - B.x0 - nx * h) * METADE + h * METADE, z0: B.z0 + (B.z1 - B.z0 - nz * h) * METADE + h * METADE, nx: nx, nz: nz, cel: {}, R: R };
    for (var i = 0; i < nx; i++) for (var j = 0; j < nz; j++) {
      var p = { x: G.x0 + i * h, z: G.z0 + j * h }, c = { p: p, bloq: bl(p), dentro: false, esg: false, emParede: C.Ws.some(function (w) { return distSeg(p, w.p1, w.p2) < w.hw; }), perto: C.Ws.some(function (w) { return distSeg(p, w.p1, w.p2) < w.hw + rcx; }) };
      if (!c.bloq) {
        c.dentro = C.dentro(p);
        c.esg = esgotoSegs.some(function (s) { return distSeg(p, s.a, s.b) < ca; });
      }
      G.cel[chave(i, j)] = c;
    }
    return G;
  }
  function celulaMaisPerto(G, p) {
    var melhor = null;
    for (var i = 0; i < G.nx; i++) for (var j = 0; j < G.nz; j++) {
      var c = G.cel[chave(i, j)]; if (c.bloq) continue;
      var d = d2(c.p, p); if (!melhor || d < melhor.d) melhor = { i: i, j: j, d: d };
    }
    return melhor;
  }
  function cruzaParedeMov(C, a, b) { var n = 0; C.Ws.forEach(function (w) { if (cruzaSeg(a, b, w.p1, w.p2)) n++; }); return n; }
  /* menor custo de um conjunto de partidas a um conjunto de destinos (Dijkstra com estado de direção, para a pena de curva) */
  function menorCaminho(C, G, de, destinos, evitar) {
    var h = G.h, DIR = [[1, 0], [-1, 0], [0, 1], [0, -1]], dist = {}, ant = {}, heap = [];
    function push(k, d) { heap.push({ k: k, d: d }); var i = heap.length - 1; while (i > 0) { var p = (i - 1) >> 1; if (heap[p].d <= heap[i].d) break; var t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; } }   // hid:ok heap binário (índice do pai)
    function pop() { var top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; var i = 0; for (;;) { var l = 2 * i + 1, r = l + 1, m = i; if (l < heap.length && heap[l].d < heap[m].d) m = l; if (r < heap.length && heap[r].d < heap[m].d) m = r; if (m === i) break; var t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m; } } return top; }   // hid:ok heap binário (filhos)
    var alvo = {}; destinos.forEach(function (d) { alvo[chave(d.i, d.j)] = 1; });
    var ini = chave(de.i, de.j) + ",-1"; dist[ini] = 0; push(ini, 0);
    var fim = null;
    while (heap.length) {
      var u = pop(); if (u.d > (dist[u.k] == null ? Infinity : dist[u.k]) + EPS) continue;
      var pt = u.k.split(","), ci = Number(pt[0]), cj = Number(pt[1]), cd = Number(pt[2]);
      if (alvo[chave(ci, cj)]) { fim = u.k; break; }
      var cA = G.cel[chave(ci, cj)];
      for (var d = 0; d < DIR.length; d++) {
        var ni = ci + DIR[d][0], nj = cj + DIR[d][1], cB = G.cel[chave(ni, nj)]; if (!cB || cB.bloq) continue;
        var custo = h * (1 + (evitar && evitar[chave(ni, nj)] ? C_EVITAR : 0) + (cB.dentro ? geo(C.par, "custoInterior") : 0) + (cB.esg ? geo(C.par, "custoEsgoto") : 0) + (cB.emParede ? geo(C.par, "custoEmParede") : 0));
        if (cA.dentro !== cB.dentro) custo += 0;
        custo += cruzaParedeMov(C, cA.p, cB.p) * geo(C.par, "custoParede");
        if (cd >= 0 && cd !== d) custo += geo(C.par, "custoCurva") + (cB.perto ? geo(C.par, "custoParede") : 0);   /* curva/junção encostada em parede: a caixa de 0,60 m não cabe */
        if (cB.perto) custo += h * METADE;
        var k2 = chave(ni, nj) + "," + d, nd = u.d + custo;
        if (dist[k2] == null || nd < dist[k2] - EPS) { dist[k2] = nd; ant[k2] = u.k; push(k2, nd); }
      }
    }
    if (!fim) return null;
    var cam = [], k = fim;
    while (k) { var q = k.split(","); cam.push({ i: Number(q[0]), j: Number(q[1]) }); k = ant[k]; }
    cam.reverse();
    return cam.filter(function (c, idx) { return idx === 0 || c.i !== cam[idx - 1].i || c.j !== cam[idx - 1].j; });
  }

  var C_EVITAR = 50;   // hid:ok pena por passar em cima da célula de um ralo (o ralo é ponta, não passagem)
  function redeHorizontal(C, R, fontes, esgotoSegs, saidaX) {
    /* fontes: [{ id, p:{x,z}, tipo:"pe"|"ralo", ref }]  → { nos, arestas, raiz, G } */
    var G = montarMalha(C, R, esgotoSegs), rede = { adj: {}, fontes: [], falhas: [] }, h = G.h;
    function liga(a, b) { var ka = chave(a.i, a.j), kb = chave(b.i, b.j); (rede.adj[ka] = rede.adj[ka] || {})[kb] = 1; (rede.adj[kb] = rede.adj[kb] || {})[ka] = 1; }
    var cs = fontes.map(function (f) { var c = celulaMaisPerto(G, f.p); return { f: f, c: c, d: c ? (R.eixo === "z" ? (G.cel[chave(c.i, c.j)].p.z - R.borda) * -R.sinal : (G.cel[chave(c.i, c.j)].p.x - R.borda) * -R.sinal) : 0 }; });
    /* primeiro os pés dos condutores (a mais longe da rua primeiro), depois os ralos: o ralo é PONTA da rede, nunca passagem */
    cs.sort(function (a, b) { var ra = a.f.tipo === "ralo" ? 1 : 0, rb = b.f.tipo === "ralo" ? 1 : 0; return ra - rb || b.d - a.d; });
    var evitar = {}; cs.forEach(function (it) { if (it.f.tipo === "ralo" && it.c) evitar[chave(it.c.i, it.c.j)] = 1; });
    /* destinos da 1ª fonte: a fileira de células mais perto da rua */
    var fila = []; for (var i = 0; i < G.nx; i++) for (var j = 0; j < G.nz; j++) { var c0 = G.cel[chave(i, j)]; if (c0.bloq) continue; fila.push({ i: i, j: j, e: R.eixo === "z" ? c0.p.z * R.sinal : c0.p.x * R.sinal }); }
    var emax = -Infinity; fila.forEach(function (c) { if (c.e > emax) emax = c.e; });
    var destRua = fila.filter(function (c) { return c.e >= emax - EPS; });
    if (saidaX != null) { var alvo = destRua.slice().sort(function (a, b) { return Math.abs((R.eixo === "z" ? G.cel[chave(a.i, a.j)].p.x : G.cel[chave(a.i, a.j)].p.z) - saidaX) - Math.abs((R.eixo === "z" ? G.cel[chave(b.i, b.j)].p.x : G.cel[chave(b.i, b.j)].p.z) - saidaX); }); destRua = alvo.slice(0, 1); }
    var rede_i = null;
    cs.forEach(function (it, idx) {
      if (!it.c) { rede.falhas.push(it.f.id); return; }
      var destinos = idx === 0 || !Object.keys(rede.adj).length ? destRua : Object.keys(rede.adj).map(function (k) { var q = k.split(","); return { i: Number(q[0]), j: Number(q[1]) }; });
      var cam = menorCaminho(C, G, it.c, destinos, evitar);
      if (!cam) { rede.falhas.push(it.f.id); return; }
      if (idx === 0 || rede_i == null) rede_i = cam[cam.length - 1];
      if (cam.length === 1) { var k0 = chave(cam[0].i, cam[0].j); rede.adj[k0] = rede.adj[k0] || {}; }
      for (var q = 1; q < cam.length; q++) liga(cam[q - 1], cam[q]);
      rede.fontes.push({ f: it.f, key: chave(it.c.i, it.c.j) });
    });
    rede.G = G; rede.raiz = rede_i ? chave(rede_i.i, rede_i.j) : null; rede.h = h;
    return rede;
  }

  /* a árvore da malha → nós (origens, curvas, junções, saída) e arestas retas; raiz = a saída */
  function arvore(C, R, rede) {
    var G = rede.G, adj = rede.adj, raiz = rede.raiz; if (!raiz) return null;
    var pos = function (k) { var q = k.split(","); return G.cel[chave(Number(q[0]), Number(q[1]))].p; };
    var origem = {}; rede.fontes.forEach(function (s) { origem[s.key] = s.f; });
    var pai = {}, ordem = [], fila = [raiz]; pai[raiz] = null;
    while (fila.length) { var u = fila.shift(); ordem.push(u); Object.keys(adj[u] || {}).forEach(function (v) { if (!(v in pai)) { pai[v] = u; fila.push(v); } }); }
    var filhos = {}; ordem.forEach(function (k) { filhos[k] = []; });
    ordem.forEach(function (k) { if (pai[k]) filhos[pai[k]].push(k); });
    function eNo(k) {
      if (k === raiz || origem[k]) return true;
      if (filhos[k].length !== 1 || !pai[k]) return true;   /* folha (sem origem) ou junção */
      var a = pos(pai[k]), b = pos(k), c = pos(filhos[k][0]);
      return Math.abs((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x)) > EPS;   /* curva */
    }
    var nos = {}, lista = [];
    ordem.forEach(function (k) { if (eNo(k)) { var p = pos(k); nos[k] = { key: k, x: r4(p.x), z: r4(p.z), origem: origem[k] || null, tipo: k === raiz ? "saida" : (origem[k] ? (origem[k].tipo === "ralo" ? "ralo" : "origem") : (filhos[k].length > 1 ? "juncao" : "curva")), pai: null, L: 0 }; lista.push(nos[k]); } });
    lista.forEach(function (n) {
      if (n.key === raiz) return;
      var k = pai[n.key], L = d2(pos(n.key), pos(k));
      while (!nos[k]) { var k2 = pai[k]; L += d2(pos(k), pos(k2)); k = k2; }
      n.pai = k; n.L = L;
    });
    /* funde caixas a menos de distCaixas ao longo do tubo (a caixa de 0,60 m não cabe duas vezes): curva/junção encosta na origem ou na caixa vizinha */
    var minD = geo(C.par, "distCaixas"), mudou = true, guarda = 0;
    function acabou(n) { delete nos[n.key]; lista.splice(lista.indexOf(n), 1); }
    while (mudou && guarda++ < 500) {   // hid:ok limite de laços
      mudou = false;
      for (var i = 0; i < lista.length && !mudou; i++) {
        var n = lista[i]; if (n.pai == null) continue;
        var pn = nos[n.pai]; if (!pn || n.L >= minD - EPS) continue;
        if (n.tipo === "curva" || n.tipo === "juncao") {
          lista.forEach(function (m) { if (m.pai === n.key) { m.pai = pn.key; m.L = d2(m, pn); } });
          acabou(n); mudou = true;
        } else if (n.tipo === "origem" && pn.tipo === "origem") {
          /* duas origens coladas (duas descidas na mesma parede): UMA caixa recebe os dois tubos */
          pn.extras = (pn.extras || []).concat([n.origem]).concat(n.extras || []);
          lista.forEach(function (m) { if (m !== n && m.pai === n.key) { m.pai = pn.key; m.L = d2(m, pn); } });
          acabou(n); mudou = true;
        } else if (n.tipo === "origem" && (pn.tipo === "curva" || pn.tipo === "juncao")) {
          lista.forEach(function (m) { if (m !== n && m.pai === pn.key) { m.pai = n.key; m.L = d2(m, n); } });
          n.pai = pn.pai; n.L = pn.pai != null ? d2(n, nos[pn.pai]) : 0;
          acabou(pn); mudou = true;
        }
      }
    }
    lista.forEach(function (n) { if (n.pai != null && n.L < minD - EPS) C.aviso("As caixas " + (n.origem ? n.origem.id : n.tipo) + " e a vizinha ficam a " + f2(n.L) + " m (menos que o diâmetro da caixa de " + f2(minD) + " m): ajustar à mão.", []); });
    return { nos: nos, lista: lista, raizKey: raiz };
  }

  /* ---------------------------------------------------------------- 5) cotas, ops e nomes */
  function montarSaida(C, R, desc, ral, arv, esgotoSegs, saidaInfo) {
    var out = { ops: [], caixas: [], tubos: [], redes: [] };
    var dec = C.decAdot, matS = "pvc_serie_r", dn = C.dnH, rC = geo(C.par, "raioCaixa");
    var nos = arv.nos, lista = arv.lista;
    /* profundidade do eixo na origem: pé de condutor = a do pé (baldrame); ralo = a do ralo; senão profPe */
    var yEixoOrigem = {};
    lista.forEach(function (n) {
      if (!n.origem) return;
      var ys0 = [n.origem].concat(arr(n.extras)).map(function (f) { return f.tipo === "pe" ? f.yPe : r4(C.Ty - geo(C.par, "profPe")); });
      yEixoOrigem[n.key] = Math.min.apply(null, ys0);
    });
    /* de montante para jusante: invert de cada nó = o MAIS BAIXO que chega (ou o da origem) */
    var filhosDe = {}; lista.forEach(function (n) { filhosDe[n.key] = []; });
    lista.forEach(function (n) { if (n.pai != null) filhosDe[n.pai].push(n); });
    var inv = {}, entrada = {};
    function calc(n) {
      var ys = []; if (yEixoOrigem[n.key] != null) ys.push(yEixoOrigem[n.key]);
      filhosDe[n.key].forEach(function (f) { calc(f); entrada[f.key] = r4(inv[f.key] - dec * f.L / 100); ys.push(entrada[f.key]); });   // hid:ok % → fração
      inv[n.key] = ys.length ? Math.min.apply(null, ys) : r4(C.Ty - geo(C.par, "profPe"));
    }
    if (dec != null && nos[arv.raizKey]) calc(nos[arv.raizKey]);
    return { inv: inv, entrada: entrada, filhosDe: filhosDe };
  }

  /* ---------------------------------------------------------------- PLANEJAR */
  function esgotoDoEstado(estado) {
    var segs = [];
    arr(estado && estado.instalacoes && estado.instalacoes.trechos).forEach(function (t) {
      if (t.sistema !== "esgoto" && t.sistema !== "ventilacao") return;
      if (Math.abs(t.p2.y - t.p1.y) > d2({ x: t.p1.x, z: t.p1.z }, { x: t.p2.x, z: t.p2.z }) * 2 && d2({ x: t.p1.x, z: t.p1.z }, { x: t.p2.x, z: t.p2.z }) < 0.05) return;   // hid:ok vertical (queda): não ocupa planta
      segs.push({ id: t.id, a: { x: t.p1.x, z: t.p1.z }, b: { x: t.p2.x, z: t.p2.z }, ya: t.p1.y, yb: t.p2.y, dn: t.dn, sistema: t.sistema });
    });
    return segs;
  }

  function planejar(estado, o) {
    var C = contexto(estado, o), res = { ok: false, ops: [], descidas: [], caixas: [], ralos: [], redes: [], saida: null, avisos: C.avisos, pendencias: C.pend, premissas: C.premissas, decisoes: C.decisoes, normas: [] };
    if (!C.B || !C.HE || !C.HI) { C.pendencia("pluvial.motores", "os motores do biminst/embutido/implantação não carregaram"); return res; }
    var cond = arr(estado.condutores).filter(function (c) { return c && c.ok; });
    var esgoto = esgotoDoEstado(estado);
    /* 1) as descidas */
    var R = ruaDe(C, cond.length ? cond.map(function (c) { return { x: c.x, z: c.z }; }) : [{ x: 0, z: 0 }]);
    var D = descidas(C, R);
    C.premissa("rua", "lado " + R.lado + " do lote (" + R.origem + "), divisa em " + (R.eixo === "z" ? "z" : "x") + " = " + f2(R.borda) + " m");
    var ral = ralos(C, R);
    /* 2) a rede */
    var fontes = [];
    D.forEach(function (d) { if (d.Q && d.yPe != null) fontes.push({ id: "pe-" + d.id, tipo: "pe", p: d.Q, yPe: d.yPe, ref: d }); });
    ral.forEach(function (r) { fontes.push({ id: r.id, tipo: "ralo", p: { x: r.x, z: r.z }, ref: r }); });
    var rede = null, arv = null;
    if (fontes.length && C.decAdot != null) {
      rede = redeHorizontal(C, R, fontes, esgoto.filter(function (s) { return true; }), o && o.saidaAlong != null ? o.saidaAlong : (C.par.saidaAlong != null ? C.par.saidaAlong : null));
      rede.falhas.forEach(function (id) { C.pendencia("pluvial.rede." + id, "sem caminho livre da origem " + id + " até a rua: traçar à mão", [id]); });
      arv = arvore(C, R, rede);
    }
    if (arv) esquema(C, R, D, ral, arv, esgoto, res);
    else if (fontes.length && C.decAdot != null) C.pendencia("pluvial.rede", "não consegui traçar a rede até a rua");
    res.descidas = D.map(function (d) { return { id: d.id, condutor: d.condutor, calha: d.calha, via: d.via, parede: d.parede || null, dist: d.dist, nota: d.nota || null, shaft: d.shaft || null, dn: d.dn, de: d.de, bocal: d.bocal, Pv: d.Pv || null, Q: d.Q || null, yPe: d.yPe == null ? null : d.yPe, baldrames: d.baldrames || [] }; });
    res.ralos = ral; res.rua = { lado: R.lado, borda: R.borda, origem: R.origem };
    res.normas = C.ctxN ? C.ctxN.normas() : [];
    if (C.ctxN) C.ctxN.pendencias().forEach(function (p) { C.pendencia(p.chave, p.motivo, []); });
    res.ok = res.ops.length > 0 && D.every(function (d) { return d.via !== "pendente"; });
    return res;
  }

  function donoDe(n, id) { return (n.origem && n.origem.id === id) || arr(n.extras).some(function (x) { return x && x.id === id; }); }
  /* nomes CP-nn de montante para jusante (profundidade na árvore: mais longe da raiz primeiro) e as ops finais */
  function esquema(C, R, D, ral, arv, esgoto, res) {
    var nos = arv.nos, lista = arv.lista, dec = C.decAdot, dn = C.dnH, rC = geo(C.par, "raioCaixa");
    var S = montarSaida(C, R, D, ral, arv, esgoto);
    var inv = S.inv, entrada = S.entrada, filhosDe = S.filhosDe;
    /* ordem montante → jusante: pela distância ao longo do tubo até a saída, decrescente */
    var dsaida = {};
    function dist(n) { if (dsaida[n.key] != null) return dsaida[n.key]; var d = n.pai == null ? 0 : n.L + dist(nos[n.pai]); dsaida[n.key] = d; return d; }
    lista.forEach(dist);
    var ordemN = lista.slice().sort(function (a, b) { return dsaida[b.key] - dsaida[a.key] || (a.x - b.x) || (a.z - b.z); });
    /* o RALO não é caixa: é a origem do tubo. Nenhuma caixa pode ficar na captura dele (o ralo e a caixa viram o mesmo nó do grafo): o ralo
       sai do lugar até folgaRalo de TODAS as caixas (e do pai dele, ao longo do tubo que o liga) */
    var minD = geo(C.par, "distCaixas"), bl = bloqueioDe(C, R), folga = minD * geo(C.par, "folgaRalo");
    lista.forEach(function (n) {
      if (n.tipo !== "ralo" || n.pai == null) return;
      var pn = nos[n.pai], outros = lista.filter(function (m) { return m.tipo !== "ralo"; });
      function ok(q) { return !C.dentro(q) && !bl(q) && outros.every(function (m) { return d2(q, m) >= folga - EPS; }); }
      if (ok(n)) return;
      var perto = outros.slice().sort(function (a1, b1) { return d2(n, a1) - d2(n, b1); })[0] || pn, d = d2(n, perto);
      var base = d > EPS ? { x: (n.x - perto.x) / d, z: (n.z - perto.z) / d } : { x: 0, z: 1 }, achou = null;
      var dirs = [base, { x: -base.z, z: base.x }, { x: base.z, z: -base.x }, { x: -base.x, z: -base.z }];
      for (var k = 1; k <= 8 && !achou; k++) {   // hid:ok até 8 passos de busca
        var alvo = folga + k * geo(C.par, "passoBusca");
        dirs.forEach(function (u) { if (achou) return; var q = { x: r4(perto.x + u.x * alvo), z: r4(perto.z + u.z * alvo) }; if (ok(q)) achou = q; });
      }
      if (achou) { n.x = achou.x; n.z = achou.z; n.L = d2(n, pn); C.aviso("O ralo " + (n.origem && n.origem.id) + " foi afastado das caixas (mínimo " + f2(folga) + " m): o ralo não pode cair na captura da caixa.", []); }
      else C.pendencia("pluvial.ralo.perto." + (n.origem && n.origem.id), "o ralo está a menos de " + f2(folga) + " m de uma caixa e não achei lugar livre para afastá-lo", []);
    });
    var caixasN = ordemN.filter(function (n) { return n.tipo !== "ralo"; });
    caixasN.forEach(function (n, i) { n.idx = i + 1; n.nome = "CP-" + (i + 1 < 10 ? "0" : "") + (i + 1); n.id = "ap-cx" + (i + 1); });   // hid:ok numeração com 2 dígitos
    var ops = [], shaftOps = [];
    D.forEach(function (d) { arr(d.ops).forEach(function (op) { ops.push(op); }); });
    /* ids dos trechos de cada descida e o vínculo do condutor */
    var yTampa = r4(C.Ty), raio = deDoDn(dn) * METADE;
    /* as caixas */
    lista.forEach(function (n) {
      if (n.tipo === "ralo") return;
      var ys = [inv[n.key]]; (filhosDe[n.key] || []).forEach(function (f) { ys.push(entrada[f.key]); });
      var yMin = Math.min.apply(null, ys), prof = r4(yTampa - yMin + raio + geo(C.par, "folgaBaldrame") * 2);   // hid:ok fundo da caixa: 5 cm abaixo da geratriz de baixo, 2 × a folga do baldrame
      [n.origem].concat(arr(n.extras)).forEach(function (f0) { if (f0 && f0.tipo === "pe") prof = Math.max(prof, r4(yTampa - f0.yPe + raio + geo(C.par, "folgaBaldrame") * 2)); });
      var pecaOp = { op: "peca", id: n.id, peca: "caixa_inspecao", sistema: "pluvial", x: n.x, y: yTampa, z: n.z, prof: prof, tipoCaixa: C.par.tipoCaixa || "alvenaria", tampa: C.par.tampa === "ferro" ? "ferro" : "concreto", nome: n.nome };
      ops.push(pecaOp);
      res.caixas.push({ id: n.id, nome: n.nome, tipo: n.tipo, x: n.x, z: n.z, yTampa: yTampa, prof: prof, invert: inv[n.key], origem: n.origem ? [n.origem.id].concat(arr(n.extras).map(function (x) { return x.id; })) : null });
    });
    /* tubos horizontais entre os nós */
    var nT = 0;
    lista.forEach(function (n) {
      if (n.pai == null) return;
      var p = nos[n.pai], yA = inv[n.key], yB = r4(yA - dec * n.L / 100);   // hid:ok % → fração
      var tid = "ap-r" + (++nT);
      ops.push({ op: "trecho", id: tid, sistema: "pluvial", material: "pvc_serie_r", dn: dn, p1: { x: n.x, y: yA, z: n.z }, p2: { x: p.x, y: yB, z: p.z } });
      res.redes.push({ id: tid, de: n.nome || ("ralo " + (n.origem && n.origem.id)), para: p.nome, comprimento: r4(d2(n, p)), dn: dn, declividade_pct: r4(dec), y1: yA, y2: yB });
    });
    /* a SAÍDA: da última caixa até a divisa e a espera sob o passeio */
    var raiz = nos[arv.raizKey], yR = inv[raiz.key];
    var cal = C.o.calcada != null ? num(C.o.calcada, null) : (C.par.calcada != null ? num(C.par.calcada, null) : null), exLen = cal != null ? cal : geo(C.par, "esperaSaida");
    var ptDiv = R.eixo === "z" ? { x: raiz.x, z: R.borda } : { x: R.borda, z: raiz.z }, ptFim = R.eixo === "z" ? { x: raiz.x, z: R.borda + R.sinal * exLen } : { x: R.borda + R.sinal * exLen, z: raiz.z };
    var ls = d2(raiz, ptFim), yS = r4(yR - dec * ls / 100);   // hid:ok % → fração
    ops.push({ op: "trecho", id: "ap-saida", sistema: "pluvial", material: "pvc_serie_r", dn: dn, p1: { x: raiz.x, y: yR, z: raiz.z }, p2: { x: r4(ptFim.x), y: yS, z: r4(ptFim.z) }, continua: "p2" });
    res.saida = { caixa: raiz.nome, x: r4(ptFim.x), z: r4(ptFim.z), y: yS, divisa: { x: r4(ptDiv.x), z: r4(ptDiv.z) }, espera_m: r4(ls), profundidade: r4(C.Ty - yS), lado: R.lado, calcada_informada: cal != null };
    C.pendencia("pluvial.saida", "ESPERA na " + (cal != null ? "guia (largura do passeio informada: " + f2(cal) + " m)" : "divisa + " + f2(exLen) + " m (largura do passeio NÃO informada)") + " em (" + f2(ptFim.x) + "; " + f2(ptFim.z) + "), cota do eixo " + f2(yS) + " m: a posição e a cota da sarjeta/boca de lobo da rua não estão no modelo — confirmar por levantamento antes de executar", [raiz.nome]);
    if (C.Ty - yS > geo(C.par, "profMaxRede") + EPS) C.aviso("A rede chega à saída com o eixo a " + f2(C.Ty - yS) + " m abaixo do terreno (acima de " + f2(geo(C.par, "profMaxRede")) + " m): rever o traçado ou rebaixar a rua.", [raiz.nome]);
    /* a descida: desvio + vertical + saída da parede até a caixa do pé */
    D.forEach(function (d) {
      if (d.via === "pendente" || !d.Q) return;
      var no = lista.filter(function (n) { return donoDe(n, "pe-" + d.id); })[0]; if (!no) return;
      var yNo = inv[no.key], Pv = d.Pv, S0 = d.bocal, dec2 = dec, LH = d2(Pv, no), yPeIn = r4(yNo + dec2 * LH / 100);   // hid:ok % → fração
      /* o pé desce até yPeIn no eixo da descida; dali sai horizontal até a caixa (LH) já com a declividade */
      var yTopoV = S0.y, dj = d2(S0, Pv), drop = dj > geo(C.par, "passoBusca") * METADE ? r4(dec2 * dj / 100) : 0;   // hid:ok % → fração
      var ids = { jog: "ap-" + d.id + "-jog", v: "ap-" + d.id + "-v", s: "ap-" + d.id + "-s" }, primeiro = null;
      if (drop > 0) { ops.push({ op: "trecho", id: ids.jog, sistema: "pluvial", material: "pvc_serie_r", dn: d.dn, p1: { x: S0.x, y: S0.y, z: S0.z }, p2: { x: Pv.x, y: r4(S0.y - drop), z: Pv.z }, continua: "p1" }); primeiro = ids.jog; }
      var yTopoReal = drop > 0 ? r4(S0.y - drop) : S0.y;
      ops.push({ op: "trecho", id: ids.v, sistema: "pluvial", material: "pvc_serie_r", dn: d.dn, p1: { x: Pv.x, y: yTopoReal, z: Pv.z }, p2: { x: Pv.x, y: yPeIn, z: Pv.z }, continua: drop > 0 ? undefined : "p1" });
      if (!primeiro) primeiro = ids.v;
      ops.push({ op: "trecho", id: ids.s, sistema: "pluvial", material: "pvc_serie_r", dn: d.dn, p1: { x: Pv.x, y: yPeIn, z: Pv.z }, p2: { x: no.x, y: yNo, z: no.z } });
      ops.push({ op: "condutor", id: d.condutor, trecho: primeiro });
      d.trechos = [drop > 0 ? ids.jog : null, ids.v, ids.s].filter(Boolean);
      d.caixa = no.nome;
      res.redes.push({ id: ids.s, de: "descida " + d.id, para: no.nome, comprimento: r4(LH), dn: d.dn, declividade_pct: r4(dec2), y1: yPeIn, y2: yNo });
    });
    /* os ralos: a peça fica no nó de origem (o tubo dele sai por ap-rN, acima); a posição é a do nó (ajustada) */
    ral.forEach(function (r) {
      var no = lista.filter(function (n) { return donoDe(n, r.id); })[0]; if (!no) return;
      r.x = no.x; r.z = no.z; r.caixa = nos[no.pai] ? nos[no.pai].nome : null; r.yEixo = inv[no.key];
      ops.push({ op: "peca", id: "ap-" + r.id, peca: "ralo_sifonado", sistema: "pluvial", x: r.x, y: r.yTampa, z: r.z, nome: r.nome });
    });
    /* limpa o que uma rodada anterior deixou e a vertical solta que o "Rufos, calhas e descidas" criou (tel-calha-ap-*) */
    var novos = {}; ops.forEach(function (op) { novos[op.id] = 1; });
    /* o tubo vertical solto que o "Rufos, calhas e descidas" deixou (tel-calha-ap-*) só sai das descidas que ESTE planejamento refez — a que ficou pendente mantém o dela */
    var velhosDosTratados = {}; D.forEach(function (d) { if (d.via !== "pendente" && d.Q && d.trechoAntigo) velhosDosTratados[txt(d.trechoAntigo)] = 1; });
    var antigos = [];
    arr(C.estado.instalacoes && C.estado.instalacoes.trechos).concat(arr(C.estado.instalacoes && C.estado.instalacoes.pecas)).forEach(function (t) {
      if (t.sistema !== "pluvial") return;
      if (/^ap-/.test(txt(t.id)) || velhosDosTratados[txt(t.id)]) antigos.push(t.id);
    });
    var apaga = antigos.filter(function (id) { return !novos[id]; }).map(function (id) { return { op: "apagar", id: id }; });
    /* um id que já existe vira "apagar" antes de recriar (idempotência: rodar de novo devolve o mesmo) */
    var recria = antigos.filter(function (id) { return novos[id]; }).map(function (id) { return { op: "apagar", id: id }; });
    res.ops = apaga.concat(recria).concat(ops);
    C.decide("pluvial.rede", res.caixas.length + " caixa(s) pluvial(is) CP-01…CP-" + (res.caixas.length < 10 ? "0" : "") + res.caixas.length + " de montante para jusante; " + res.redes.length + " trecho(s); saída no lado " + R.lado + ".");   // hid:ok numeração com 2 dígitos
    C.premissa("declividade da rede", f2(dec) + " % (mínima da NBR 10844 × " + f2(geo(C.par, "margemDecl")) + " para absorver o arredondamento); DN inicial " + dn + " — o dimensionamento (NBR 10844) corrige o DN");
    C.premissa("cobrimento", "eixo do tubo a " + f2(geo(C.par, "profPe")) + " m do terreno na origem (critério de projeto; sem valor de norma no acervo)");
    C.premissa("afastamento do esgoto", "mínimo " + f2(geo(C.par, "afastEsgoto")) + " m em planta e " + f2(geo(C.par, "folgaCruzamento")) + " m na vertical (critério; cruzamento só em cotas diferentes)");
    C.premissa("pluvial nunca ligado ao esgoto", "rede própria, caixas próprias (CP), saída própria");
    /* sob a casa */
    var sob = 0;
    lista.forEach(function (n) { if (n.pai == null) return; var p = nos[n.pai], m = Math.max(1, Math.ceil(d2(n, p) / 0.10)); for (var k = 0; k < m; k++) { var q = { x: n.x + (p.x - n.x) * (k + METADE) / m, z: n.z + (p.z - n.z) * (k + METADE) / m }; if (C.dentro(q)) sob += d2(n, p) / m; } });   // hid:ok amostragem de 10 cm
    if (sob > EPS) { res.sobCasa_m = r4(sob); C.aviso("A rede passa SOB a edificação em " + f2(sob) + " m: não achei caminho todo pela área externa. Verificar o cruzamento com baldrames/fundação e manter as caixas de inspeção do lado de fora.", []); }
    /* cruzamentos com o esgoto */
    res.cruzamentos = cruzamentosComEsgoto(C, res, esgoto);
    res.cruzamentos.forEach(function (x) { if (!x.ok) C.aviso("Cruzamento pluvial " + x.pluvial + " × esgoto " + x.esgoto + ": separação vertical de " + f2(x.dy) + " m (mínimo " + f2(x.min) + " m) — mudar a cota ou o traçado.", [x.pluvial, x.esgoto]); });
  }

  function cruzamentosComEsgoto(C, res, esgoto) {
    var tubos = res.ops.filter(function (o) { return o.op === "trecho" && o.sistema === "pluvial"; }), out = [];
    tubos.forEach(function (t) {
      var a = { x: t.p1.x, z: t.p1.z }, b = { x: t.p2.x, z: t.p2.z };
      if (d2(a, b) < geo(C.par, "passoBusca") * METADE) return;
      esgoto.forEach(function (e) {
        var x = cruzaSeg(a, b, e.a, e.b); if (!x) return;
        var yp = t.p1.y + (t.p2.y - t.p1.y) * x.t, ye = e.ya + (e.yb - e.ya) * x.u, dy = Math.abs(yp - ye) - (deDoDn(t.dn || 100) + deDoDn(num(e.dn, 100))) * METADE, min = geo(C.par, "folgaCruzamento");
        out.push({ pluvial: t.id, esgoto: e.id, x: r4(x.x), z: r4(x.z), yPluvial: r4(yp), yEsgoto: r4(ye), dy: r4(dy), min: min, ok: dy >= min - EPS });
      });
    });
    return out;
  }

  /* ---------------------------------------------------------------- VERIFICAR (independente do traçado) */
  function verificar(estado, o) {
    o = o || {};
    var par = o.parametros || {}, R = { ok: true, achados: [], pluvial: 0, cruzamentos: [], ligadoAoEsgoto: [], perto: [], semSaida: [] };
    var ins = estado && estado.instalacoes || {}, pl = arr(ins.trechos).filter(function (t) { return t.sistema === "pluvial" && txt(t.id).indexOf("ap-") === 0; });
    var eg = esgotoDoEstado(estado);
    R.pluvial = pl.length;
    var capt = 0.30;   // hid:ok raio de captura da caixa/ralo para considerar "ligado"
    var pecasEs = arr(ins.pecas).filter(function (k) { return k.sistema === "esgoto" || k.peca === "caixa_gordura"; });
    pl.forEach(function (t) {
      [t.p1, t.p2].forEach(function (p) {
        eg.forEach(function (e) { [e.a, e.b].forEach(function (q) { if (d2({ x: p.x, z: p.z }, q) < EPS * 100 && Math.abs(p.y - (q === e.a ? e.ya : e.yb)) < capt) R.ligadoAoEsgoto.push(t.id + " × " + e.id); }); });   // hid:ok ponta com ponta (10 µm)
        pecasEs.forEach(function (k) { if (d2({ x: p.x, z: p.z }, k) < capt && Math.abs(p.y - k.y) < num(k.prof, 0.6) + 0.1) R.ligadoAoEsgoto.push(t.id + " × peça " + k.id); });   // hid:ok folga vertical da captura
      });
      var a = { x: t.p1.x, z: t.p1.z }, b = { x: t.p2.x, z: t.p2.z };
      if (d2(a, b) < EPS * 100) return;   // hid:ok vertical
      eg.forEach(function (e) {
        var x = cruzaSeg(a, b, e.a, e.b);
        if (x) {
          var yp = t.p1.y + (t.p2.y - t.p1.y) * x.t, ye = e.ya + (e.yb - e.ya) * x.u, dy = Math.abs(yp - ye) - (deDoDn(t.dn || 100) + deDoDn(num(e.dn, 100))) * METADE, min = geo(par, "folgaCruzamento");
          R.cruzamentos.push({ pluvial: t.id, esgoto: e.id, dy: r4(dy), ok: dy >= min - EPS });
        } else {
          var dm = Math.min(distSeg(a, e.a, e.b), distSeg(b, e.a, e.b), distSeg(e.a, a, b), distSeg(e.b, a, b));
          if (dm < geo(par, "afastEsgoto") - EPS) R.perto.push({ pluvial: t.id, esgoto: e.id, dist: r4(dm) });
        }
      });
    });
    /* cada tubo pluvial horizontal escoa até a saída: o grafo de p2 ligado a p1 de outro, terminando em "continua" */
    var porP1 = {}; pl.forEach(function (t) { var k = r4(t.p1.x) + "," + r4(t.p1.z); (porP1[k] = porP1[k] || []).push(t); });
    pl.forEach(function (t) {
      if (Math.abs(t.p2.y - t.p1.y) > 0 && d2({ x: t.p1.x, z: t.p1.z }, { x: t.p2.x, z: t.p2.z }) < EPS * 100) return;   // hid:ok vertical
      var seen = {}, cur = t, ok = false, n = 0;
      while (cur && n++ < 400) {   // hid:ok limite de laços
        if (cur.continua === "p2") { ok = true; break; }
        if (seen[cur.id]) break; seen[cur.id] = 1;
        var k = r4(cur.p2.x) + "," + r4(cur.p2.z), nx = (porP1[k] || []).filter(function (u) { return u.id !== cur.id && Math.abs(u.p1.y - cur.p2.y) < 0.6 && d2({ x: u.p1.x, z: u.p1.z }, { x: cur.p2.x, z: cur.p2.z }) < EPS * 100; })[0];   // hid:ok folga vertical da caixa / ponta
        cur = nx;
      }
      if (!ok) R.semSaida.push(t.id);
    });
    if (R.ligadoAoEsgoto.length) R.achados.push("pluvial ligado ao esgoto: " + R.ligadoAoEsgoto.join("; "));
    R.cruzamentos.filter(function (c) { return !c.ok; }).forEach(function (c) { R.achados.push("cruzamento sem afastamento vertical: " + c.pluvial + " × " + c.esgoto + " (" + f2(c.dy) + " m)"); });
    if (R.perto.length) R.achados.push(R.perto.length + " trecho(s) a menos de " + f2(geo(par, "afastEsgoto")) + " m do esgoto em planta");
    if (R.semSaida.length) R.achados.push("trechos que não chegam à saída: " + R.semSaida.join(", "));
    R.ok = R.achados.length === 0;
    return R;
  }

  var HidPluvial = { VERSAO: 1, GEO_PLUV: GEO_PLUV, planejar: planejar, verificar: verificar,
    _int: { paredesVivas: paredesVivas, acharPontoNaParede: acharPontoNaParede, viaShaft: viaShaft, contexto: contexto, ruaDe: ruaDe, cruzamentosComEsgoto: cruzamentosComEsgoto, esgotoDoEstado: esgotoDoEstado, poligonoDoVolume: poligonoDoVolume, regioesExternas: regioesExternas } };
  global.HidPluvial = HidPluvial;
  if (typeof module !== "undefined" && module.exports) module.exports = HidPluvial;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
