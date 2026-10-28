/* =====================================================================
 * hidgasrede.js — REDE DE GÁS GLP: abrigo + rede embutida até o cooktop + dimensionamento (F3, Casa 487, 27/10/2026). Motor PURO, ES5.
 *
 *   HidGasRede.gerar({ estado, avaliarFam, rua?, parametros?, abrigo? }) → resultado (abaixo)       [ou gerar(estado, avaliarFam, opcoes)]
 *   HidGasRede.entradaDimensionar(g) → a entrada de HidDimensionar (entrada.gas): o memorial e a prancha leem sistemas.gas
 *
 * O QUE FAZ (nesta ordem):
 *   1. acha o(s) COOKTOP(s) (família com Com_cooktop = true e uma parede atrás); cooktop sem parede atrás (ilha) NÃO é ligado: pendência;
 *   2. escolhe o lugar do ABRIGO de 2 botijões P13 (um em uso, um reserva): fora da projeção da edificação (ambientes, lajes, telhados, paredes,
 *      peças), dentro do lote, ao ar livre, com área livre na frente, NUNCA com a fachada voltada à rua à vista (a rua vem em opcoes.rua; sem
 *      ela o teste fica pendente), a mais de `afastMin` de ralos, caixas, ignição (churrasqueira/aquecedor), casa de máquinas e piscina,
 *      costas numa parede, no MENOR caminho até o cooktop;
 *   3. traça a rede de COBRE embutida: regulador e registro de corte geral na câmara do abrigo → atravessa a parede (eixo embutido) → desce pela
 *      parede ao enchimento do piso → corre pelo piso até o cooktop → sobe e termina num toco horizontal com registro de esfera e ponto com flexível.
 *      Nada aparente fora do abrigo; nunca pelo forro; confere pilar/viga/shaft e os afastamentos da NBR 15526 (Tabela 1) a outras redes;
 *   4. DIMENSIONA pela NBR 15526 (HidInd, gás GLP, B.1.2 b): potência do aparelho do Anexo D, vazão = potência ÷ PCI, comprimento equivalente
 *      das conexões da Tabela C.4, o MENOR DN de cobre que fecha a perda ≤ 10 % da pressão e a velocidade;
 *   5. devolve as ops (famílias + trechos do sistema "gas"), o memorial (premissas, local, afastamentos, estanqueidade, pendências).
 *
 * ⚠ NADA É INVENTADO. Valores de norma vêm do HidNormas (gas.15526.*): potência (Anexo D), PCI (6.3), Leq (C.4), afastamentos (Tabela 1),
 *   estanqueidade (8.1). O que NÃO está no acervo vira PREMISSA visível ou PENDÊNCIA: a pressão de saída do regulador (2,8 kPa, regulador de
 *   baixa pressão — norma fora do acervo), o afastamento do abrigo (NBR 13523 — fora do acervo; o adotado é da RA), a posição do cooktop no móvel
 *   (centro), a altura do ponto de consumo (15 cm sob o tampo), o Leq do registro e do regulador (sem tabela). Cada premissa tem "conferir".
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function HK() { return dep("HidKit", "./hidkit.js"); }
  function HE() { return dep("HidEmbutido", "./biminstembutido.js"); }
  function HI() { return dep("HidInd", "./hidind.js"); }
  function NN() { return dep("HidNormas", "./hidnormas.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function r4(v) { return Math.round(v * 10000) / 10000; }   // hid:ok 4 casas do biminst
  function f2(v) { return v == null || !isFinite(v) ? "?" : (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }   // hid:ok formatação
  function f3(v) { return v == null || !isFinite(v) ? "?" : (Math.round(v * 1000) / 1000).toFixed(3).replace(".", ","); }   // hid:ok formatação
  var EPS = 1e-6;   // hid:ok tolerância numérica
  var SIS = "gas";

  /* ------------------------------------------------ PARÂMETROS DE PROJETO (premissas visíveis; nenhum é valor de norma) */
  var PARAM = {
    pressaoRegulador_kPa: 2.8,    // hid:ok premissa: pressão de saída do regulador de baixa pressão p/ GLP (norma do regulador fora do acervo) — conferir com o regulador escolhido
    temperatura_C: 20,            // hid:ok temperatura de referência do gás (a mesma das vazões da NBR 15526, q_ref_T_C)
    serie: "A",                   // hid:ok cobre classe A (médio): premissa da coordenação; o Di vem da tabela ind.tubo.cobre
    aparelho: "fogao_5b_sem_forno",   // hid:ok linha do Anexo D usada p/ o cooktop (5 bocas sem forno = a maior potência de cooktop da tabela: lado seguro)
    dnMin: 15,                    // hid:ok DN mínimo da rede: o da conexão de aparelho (1/2") — premissa
    dnLista: [15, 22, 28, 35],    // hid:ok DNs do cobre que têm Leq na Tabela C.4 (colunas dn_15…dn_35)
    sobTampo: 0.15,               // hid:ok o ponto de gás fica 15 cm abaixo do tampo, dentro do móvel (premissa; conferir com o cooktop)
    toco: 0.30,                   // hid:ok toco horizontal final (tubo + registro + ponto), modelagem
    tocoA: 0.08, tocoB: 0.05,     // hid:ok tubos do toco antes e depois do registro, modelagem
    alcanceParede: 0.60,          // hid:ok até onde se procura a parede atrás do cooktop
    afastMin: 1.5,                // hid:ok afastamento mínimo ADOTADO entre o abrigo e ralos, caixas, ignição, casa de máquinas e piscina (NBR 13523 fora do acervo: conferir)
    frente: 0.90,                 // hid:ok área livre à frente do abrigo para trocar o botijão (m)
    passo: 0.05,                  // hid:ok passo da busca ao longo da parede (m)
    folgaRect: 0.01,              // hid:ok tolerância de sobreposição de retângulos (m)
    folgaRede: 0.40,              // hid:ok distância (m) do centro do abrigo a uma rede de esgoto/pluvial rente ao piso: não se põe a laje do abrigo sobre o tubo
    cosParalelo: 0.7,             // hid:ok |cos| entre os eixos a partir do qual dois tubos contam como PARALELOS (o resto é cruzamento)
    raioVizinhas: 2,              // hid:ok raio (m) em que se procuram redes vizinhas p/ o afastamento (Tabela 1)
    stubReg: 0.34, stubRegistro: 0.15, regC: 0.12, registroC: 0.07, pontoC: 0.10   // hid:ok posições/comprimentos dos itens na câmara do abrigo (modelagem; X local do abrigo → Z)
  };

  /* ------------------------------------------------ geometria plana */
  function rot2(a, x, z) { var c = Math.cos(a), s = Math.sin(a); return { x: x * c + z * s, z: -x * s + z * c }; }   // o mesmo giro do biminst (local → mundo)
  function noPoli(p, P) { var c = false; for (var i = 0, j = P.length - 1; i < P.length; j = i++) { var a = P[i], b = P[j]; if (((a.z > p.z) !== (b.z > p.z)) && (p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x)) c = !c; } return c; }
  function distPtSeg(p, a, b) { var dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz, t = L2 > 0 ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2 : 0; t = Math.max(0, Math.min(1, t)); var qx = a.x + dx * t, qz = a.z + dz * t; return Math.sqrt((p.x - qx) * (p.x - qx) + (p.z - qz) * (p.z - qz)); }
  function distPtPoli(p, P) { if (noPoli(p, P)) return 0; var m = Infinity; for (var i = 0; i < P.length; i++) m = Math.min(m, distPtSeg(p, P[i], P[(i + 1) % P.length])); return m; }
  function eixosSAT(P) { var e = []; for (var i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length], dx = b.x - a.x, dz = b.z - a.z, L = Math.sqrt(dx * dx + dz * dz) || 1; e.push({ x: -dz / L, z: dx / L }); } return e; }
  function proj(P, ax) { var mn = Infinity, mx = -Infinity; P.forEach(function (p) { var v = p.x * ax.x + p.z * ax.z; if (v < mn) mn = v; if (v > mx) mx = v; }); return [mn, mx]; }
  /* os dois polígonos convexos se sobrepõem (mais que a folga)? */
  function sobrepoe(A, B, folga) { var ax = eixosSAT(A).concat(eixosSAT(B)); for (var i = 0; i < ax.length; i++) { var a = proj(A, ax[i]), b = proj(B, ax[i]); if (a[1] <= b[0] + folga || b[1] <= a[0] + folga) return false; } return true; }
  function segInter(a, b, c, d) { var r = { x: b.x - a.x, z: b.z - a.z }, s = { x: d.x - c.x, z: d.z - c.z }, den = r.x * s.z - r.z * s.x; if (Math.abs(den) < EPS) return false; var t = ((c.x - a.x) * s.z - (c.z - a.z) * s.x) / den, u = ((c.x - a.x) * r.z - (c.z - a.z) * r.x) / den; return t >= 0 && t <= 1 && u >= 0 && u <= 1; }
  function segCruzaPoli(a, b, P) { for (var i = 0; i < P.length; i++) if (segInter(a, b, P[i], P[(i + 1) % P.length])) return true; return noPoli(a, P) || noPoli(b, P); }
  /* distância mínima entre dois segmentos 3D (m) */
  function distSegSeg(p1, q1, p2, q2) {
    var u = { x: q1.x - p1.x, y: q1.y - p1.y, z: q1.z - p1.z }, v = { x: q2.x - p2.x, y: q2.y - p2.y, z: q2.z - p2.z }, w = { x: p1.x - p2.x, y: p1.y - p2.y, z: p1.z - p2.z };
    function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
    var a = dot(u, u), b = dot(u, v), c = dot(v, v), d = dot(u, w), e = dot(v, w), D = a * c - b * b, sN, sD = D, tN, tD = D;
    if (D < EPS) { sN = 0; sD = 1; tN = e; tD = c; } else { sN = b * e - c * d; tN = a * e - b * d; if (sN < 0) { sN = 0; tN = e; tD = c; } else if (sN > sD) { sN = sD; tN = e + b; tD = c; } }
    if (tN < 0) { tN = 0; if (-d < 0) sN = 0; else if (-d > a) sN = sD; else { sN = -d; sD = a; } } else if (tN > tD) { tN = tD; if ((-d + b) < 0) sN = 0; else if ((-d + b) > a) sN = sD; else { sN = -d + b; sD = a; } }
    var sc = Math.abs(sN) < EPS ? 0 : sN / sD, tc = Math.abs(tN) < EPS ? 0 : tN / tD;
    var dx = w.x + sc * u.x - tc * v.x, dy = w.y + sc * u.y - tc * v.y, dz = w.z + sc * u.z - tc * v.z; return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  function retPlano(cx, cz, ang, w, d, z0) { /* retângulo no plano: centro da largura em (cx,cz), fundo em z local = z0, profundidade d, giro ang */
    var pts = [[-w / 2, z0], [w / 2, z0], [w / 2, z0 + d], [-w / 2, z0 + d]];
    return pts.map(function (q) { var r = rot2(ang, q[0], q[1]); return { x: cx + r.x, z: cz + r.z }; });
  }

  /* ------------------------------------------------ norma */
  function tab(chave, filtro, col) { var N = NN(); if (!N) return null; var c = N.consulta(chave, filtro, col); return c && c.ok ? c : null; }
  function linhasTab(chave) { var N = NN(); return N ? arr(N.linhas(chave)) : []; }

  /* ------------------------------------------------ o modelo */
  function avaliar(av, f) { try { return av ? av(f.famId, f.tipoId, f.inst || {}) : null; } catch (e) { return null; } }
  function mundoDe(f, lx, ly, lz) { var r = rot2(num(f.rotY, 0), lx, lz); return { x: r4(num(f.x, 0) + r.x), y: r4(num(f.y, 0) + ly), z: r4(num(f.z, 0) + r.z) }; }
  function rotParaDir(dx, dz) { return r4(Math.atan2(-dz, dx)); }   // gira o X local para a direção (dx, dz)

  /* onde está o COOKTOP no móvel: o sólido de vidro/"tela preta" do tampo (a família importada/gerada o desenha), em coordenadas LOCAIS;
     sem ele, o centro do móvel (premissa registrada) */
  function centroCooktopLocal(av) {
    var achado = null;
    arr(av && av.solidos).forEach(function (sd) {
      if (achado || !/tela preta|cooktop|vitroceram|vitrocer/i.test(txt(sd.material) + " " + txt(sd.nome))) return;
      var xs = [], zs = [];
      if (Array.isArray(sd.v) && sd.v.length >= 9) { for (var i = 0; i + 2 < sd.v.length; i += 3) { xs.push(sd.v[i]); zs.push(sd.v[i + 2]); } }   // hid:ok malha: x, y, z em sequência
      else if (sd.forma === "caixa" && isFinite(Number(sd.x)) && isFinite(Number(sd.z))) { xs.push(sd.x - num(sd.dx, 0) / 2, sd.x + num(sd.dx, 0) / 2); zs.push(sd.z - num(sd.dz, 0) / 2, sd.z + num(sd.dz, 0) / 2); }
      if (xs.length) achado = { x: (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, z: (Math.min.apply(null, zs) + Math.max.apply(null, zs)) / 2, solido: txt(sd.id || sd.nome) };
    });
    return achado;
  }
  function cooktops(estado, aval, par, out) {
    var lista = [];
    arr(estado.familias).forEach(function (f) {
      var av = avaliar(aval, f), v = av && av.valores; if (!v || v.Com_cooktop !== true) return;
      var nb = { x: r4(-Math.sin(num(f.rotY, 0))), z: r4(-Math.cos(num(f.rotY, 0))) };   // a normal que ENTRA na parede de trás (Z local = frente)
      var c = av.caixa || { x0: 0, x1: 0, z0: 0, z1: 0 }, ck = centroCooktopLocal(av), centro = ck ? mundoDe(f, ck.x, 0, ck.z) : mundoDe(f, (c.x0 + c.x1) / 2, 0, (c.z0 + c.z1) / 2);
      var W = HE().paredeAtras(estado, { x: centro.x, y: 0.5, z: centro.z }, nb, { alcance: par.alcanceParede + num(c.z1 - c.z0, 0) / 2 });   // hid:ok 0,5 m = cota de teste dentro do móvel
      var o = { id: String(f.id), famId: f.famId, fi: f, av: av, centro: centro, nb: nb, parede: W, tampo: num(v.Altura, null), posicao: ck ? "sólido \"" + ck.solido + "\" do móvel (o cooktop desenhado)" : "centro do móvel (a família não desenha o cooktop)" };
      if (!W) { out.pendencias.push({ chave: "gas.cooktop_sem_parede", texto: "O cooktop de " + o.id + " (Com_cooktop) não tem parede atrás (ilha): o ponto de gás exigiria tubo pelo piso até a ilha — NÃO lançado. Se houver cooktop a gás nele, informar.", elementos: [o.id] }); return; }
      lista.push(o);
    });
    return lista;
  }

  /* pontos que pedem afastamento do abrigo (ralos, caixas, ignição, casa de máquinas, piscina) */
  function perigos(estado, aval) {
    var P = [];
    arr(estado.instalacoes && estado.instalacoes.pecas).forEach(function (p) { if (/esgoto|pluvial/.test(txt(p.sistema)) && /ralo|caixa|terminal/.test(txt(p.peca))) P.push({ id: String(p.id), tipo: "ralo/caixa de " + txt(p.sistema), p: { x: num(p.x, 0), z: num(p.z, 0) } }); });
    arr(estado.familias).forEach(function (f) {
      var s = txt(f.famId), tipo = /piscina/.test(s) && !/maquina/.test(s) ? "piscina" : (/maquina/.test(s) ? "casa de máquinas" : (/churrasq|forno|lareira|aquecedor|fogao|cooktop/.test(s) ? "ponto de ignição" : (/hid-(ralo|caixa)/.test(s) ? "ralo/caixa" : "")));
      if (!tipo) return;
      var av = avaliar(aval, f), c = av && av.caixa; if (!c) { P.push({ id: String(f.id), tipo: tipo, p: { x: num(f.x, 0), z: num(f.z, 0) } }); return; }
      var poli = [[c.x0, c.z0], [c.x1, c.z0], [c.x1, c.z1], [c.x0, c.z1]].map(function (q) { var m = mundoDe(f, q[0], 0, q[1]); return { x: m.x, z: m.z }; });
      P.push({ id: String(f.id), tipo: tipo, poli: poli });
    });
    return P;
  }

  /* a projeção da edificação (polígonos) e os obstáculos duros */
  function projecao(estado, aval) {
    var polis = [];
    arr(estado.ambientes).forEach(function (a) { var cl = a && a.calc; if (cl && arr(cl.contorno).length >= 3) polis.push({ id: txt(a.id), tipo: "ambiente", P: cl.contorno.map(function (q) { return { x: q.x, z: q.z }; }) }); });   // hid:ok polígono tem 3+ vértices
    arr(estado.caixas).forEach(function (c) { if (c && c.tipo === "laje" && arr(c.contorno).length >= 3) polis.push({ id: txt(c.id), tipo: "laje", P: c.contorno.map(function (q) { return { x: q.x, z: q.z }; }) }); });   // hid:ok polígono tem 3+ vértices
    arr(estado.telhados).forEach(function (t) { if (t && arr(t.contorno).length >= 3) polis.push({ id: txt(t.id), tipo: "telhado", P: t.contorno.map(function (q) { return { x: q.x, z: q.z }; }) }); });   // hid:ok polígono tem 3+ vértices
    arr(estado.coberturas).forEach(function (t) { if (t && arr(t.contorno).length >= 3) polis.push({ id: txt(t.id), tipo: "cobertura", P: t.contorno.map(function (q) { return { x: q.x, z: q.z }; }) }); });   // hid:ok polígono tem 3+ vértices
    arr(estado.familias).forEach(function (f) {
      if (!/piscina|maquina|churrasq|caixa-dagua|reservat/.test(txt(f.famId))) return;
      var av = avaliar(aval, f), c = av && av.caixa; if (!c) return;
      polis.push({ id: String(f.id), tipo: "peça", P: [[c.x0, c.z0], [c.x1, c.z0], [c.x1, c.z1], [c.x0, c.z1]].map(function (q) { var m = mundoDe(f, q[0], 0, q[1]); return { x: m.x, z: m.z }; }) });
    });
    return polis;
  }
  function retDaCaixa(c) { /* retângulo no plano de uma caixa (parede, viga, pilar) */
    var cs = Math.cos(num(c.rotY, 0)), sn = Math.sin(num(c.rotY, 0)), h = num(c.comprimento, 0) / 2, e = num(c.espessura, 0) / 2;
    return [[-h, -e], [h, -e], [h, e], [-h, e]].map(function (q) { return { x: num(c.cx, 0) + q[0] * cs - q[1] * sn, z: num(c.cz, 0) - q[0] * sn - q[1] * cs }; });
  }

  /* ------------------------------------------------ o abrigo: candidatos */
  function escolherAbrigo(estado, aval, par, cook, rua, out, forcado) {
    /* F6 (Casa 487): parede marcada para DEMOLIR (fase demolida) não hospeda o abrigo — com o gás rodando antes do pluvial ele escolheu o muro da frente antigo (D-MURO-F), que sai da obra */
    var demG = {}; arr(estado && estado.caixas).forEach(function (c) { if (c && c.tipo === "parede" && c.faseDemolida && c.faseDemolida !== "Nenhum") demG[String(c.id)] = 1; });
    var HEm = HE(), paredes = HEm.paredes(estado).filter(function (w) { return !demG[String(w.id)]; }), polis = projecao(estado, aval), hz = perigos(estado, aval);
    var divisa = ((estado.terreno && estado.terreno.divisas) || [])[0], lote = divisa && arr(divisa.contorno).length >= 3 ? divisa.contorno : null;   // hid:ok polígono tem 3+ vértices
    var abrigoFam = global.FamiliasRA && global.FamiliasRA.obter ? global.FamiliasRA.obter("ra-gas-abrigo", true) : null;
    var avA = null; if (abrigoFam && global.Familia) avA = global.Familia.avaliar(abrigoFam, abrigoFam.tipos[0].id, {});
    var v = (avA && avA.valores) || { Largura: 1, Profundidade: 0.8, Altura: 1.2, Altura_saida: 0.15 };   // hid:ok fallback da modelagem se a família não carregou
    var larg = num(v.Largura, 1) + 0.2, prof = num(v.Profundidade, 0.8), saidaX = num(v.Largura, 1) / 4, saidaY = num(v.Altura_saida, 0.15);   // hid:ok 0,2 = laterais de 10 cm; saída a 1/4 da largura
    var estr = arr(estado.caixas).filter(function (c) { return c && /pilar|viga|metal/.test(txt(c.tipo)); }).map(function (c) { return { id: String(c.id), P: c.tipo === "metal" ? null : retDaCaixa(c), y0: num(c.cy, 0) - num(c.altura, 0) / 2, y1: num(c.cy, 0) + num(c.altura, 0) / 2 }; }).filter(function (q) { return q.P && q.y0 < 1.5; });   // hid:ok só o que desce abaixo de 1,5 m interfere no abrigo
    var paredesRet = paredes.map(function (w) { var n = { x: -w.u.z, z: w.u.x }; return { w: w, P: [{ x: w.p1.x - n.x * w.hw, z: w.p1.z - n.z * w.hw }, { x: w.p2.x - n.x * w.hw, z: w.p2.z - n.z * w.hw }, { x: w.p2.x + n.x * w.hw, z: w.p2.z + n.z * w.hw }, { x: w.p1.x + n.x * w.hw, z: w.p1.z + n.z * w.hw }] }; });
    /* o abrigo não fica sobre a rede de esgoto/pluvial (enterrada ou no enchimento): é a "rede" perto da laje do abrigo */
    var redes = arr(estado.instalacoes && estado.instalacoes.trechos).filter(function (t) { return /^(esgoto|pluvial)$/.test(txt(t.sistema)) && Math.min(num(t.p1.y, 0), num(t.p2.y, 0)) < 0.5; });   // hid:ok só o que corre rente ao piso (< 0,5 m)
    var cands = [], descartes = {};
    function descarta(m) { descartes[m] = (descartes[m] || 0) + 1; }
    var alvo = cook.parede ? { x: cook.centro.x, z: cook.centro.z } : cook.centro;
    var ruaN = rua && rua.normal ? rua.normal : null, ruaP = rua && rua.ponto ? rua.ponto : null;
    paredes.forEach(function (w) {
      if (w.topo - w.base < 0.5) return;   // hid:ok mureta/platibanda baixa não hospeda o abrigo
      var nw = { x: -w.u.z, z: w.u.x };
      [1, -1].forEach(function (sg) {
        var nOut = { x: nw.x * sg, z: nw.z * sg }, ang = r4(Math.atan2(nOut.x, nOut.z));
        for (var s = larg / 2; s <= w.L - larg / 2 + EPS; s += par.passo) {
          var A = { x: w.p1.x + w.u.x * s + nOut.x * w.hw, z: w.p1.z + w.u.z * s + nOut.z * w.hw };
          var R = retPlano(A.x, A.z, ang, larg, prof, 0), F = retPlano(A.x, A.z, ang, larg, par.frente, prof);
          if (lote && !R.every(function (p) { return noPoli(p, lote); })) { descarta("fora do lote"); continue; }
          var amostra = []; for (var iu = 0; iu <= 4; iu++) for (var iv = 0; iv <= 2; iv++) amostra.push(rot2(ang, -larg / 2 + larg * iu / 4, 0.02 + (prof - 0.04) * iv / 2)); amostra = amostra.map(function (q) { return { x: A.x + q.x, z: A.z + q.z }; });   // hid:ok grade 5×3 de pontos dentro do retângulo
          if (polis.some(function (q) { return amostra.some(function (p) { return noPoli(p, q.P); }); })) { descarta("sob a projeção da edificação"); continue; }
          if (paredesRet.some(function (q) { return q.w.id !== w.id && sobrepoe(R, q.P, par.folgaRect); }) || paredesRet.some(function (q) { return q.w.id === w.id && sobrepoe(R, q.P, par.folgaRect + 0.02); })) { descarta("encosta em outra parede"); continue; }   // hid:ok 2 cm: a própria parede toca na face
          if (estr.some(function (q) { return sobrepoe(R, q.P, par.folgaRect); })) { descarta("sobre pilar/viga"); continue; }
          var centro = { x: A.x + nOut.x * prof / 2, z: A.z + nOut.z * prof / 2 };
          if (redes.some(function (t) { return segCruzaPoli({ x: t.p1.x, z: t.p1.z }, { x: t.p2.x, z: t.p2.z }, R) || distPtSeg(centro, { x: t.p1.x, z: t.p1.z }, { x: t.p2.x, z: t.p2.z }) < par.folgaRede; })) { descarta("sobre rede de esgoto/pluvial"); continue; }
          if (paredesRet.some(function (q) { return q.w.id !== w.id && sobrepoe(F, q.P, par.folgaRect); })) { descarta("sem área livre na frente"); continue; }
          /* nunca com a fachada da rua à vista: um raio do abrigo para a rua que não bate em parede alguma */
          if (ruaN) {
            var fim = { x: centro.x + ruaN.x * 200, z: centro.z + ruaN.z * 200 };   // hid:ok o raio vai bem além do lote
            var bate = paredesRet.some(function (q) { return q.w.id !== w.id && segCruzaPoli(centro, fim, q.P) && !noPoli(centro, q.P); });
            /* o raio sai pela frente do abrigo? só conta a rua se o abrigo olha para ela */
            if (!bate && (nOut.x * ruaN.x + nOut.z * ruaN.z) > -0.5) { descarta("fachada da rua à vista"); continue; }   // hid:ok cos > −0,5: de frente ou de lado para a rua
          }
          var out0 = mundoLocal(A, ang, saidaX, saidaY, 0);
          var dm = Infinity, qual = null;
          hz.forEach(function (q) { var d = q.poli ? Math.min(distPtPoli(centro, q.poli), R.reduce(function (m, p) { return Math.min(m, distPtPoli(p, q.poli)); }, Infinity)) : R.concat([centro]).reduce(function (m, p) { return Math.min(m, Math.sqrt(Math.pow(p.x - q.p.x, 2) + Math.pow(p.z - q.p.z, 2))); }, Infinity); if (d < dm) { dm = d; qual = q; } });
          if (dm < par.afastMin) { descarta("perto de " + (qual ? qual.tipo : "perigo") + " (" + f2(dm) + " m)"); continue; }
          var cam = Math.abs(out0.x - alvo.x) + Math.abs(out0.z - alvo.z);
          cands.push({ w: w, sg: sg, s: r4(s), A: A, ang: ang, nOut: nOut, R: R, centro: centro, saida: out0, caminho: cam, afast: dm, afastDe: qual });
        }
      });
    });
    out.candidatos = { total: cands.length, descartes: descartes };
    if (forcado) {
      /* local imposto pelo chamador (ex.: o RT): confere o que dá e segue */
      return null;
    }
    cands.sort(function (a, b) { return a.caminho - b.caminho; });
    return { lista: cands, larg: larg, prof: prof, saidaX: saidaX, saidaY: saidaY, v: v, hz: hz, estr: estr, paredesRet: paredesRet };
  }
  function mundoLocal(A, ang, lx, ly, lz) { var r = rot2(ang, lx, lz); return { x: A.x + r.x, y: ly, z: A.z + r.z }; }

  /* ------------------------------------------------ a rota embutida de um candidato */
  function rota(estado, aval, par, cand, cook, EsC, pisoY, pisoInt, out0) {
    var HEm = HE(), w = cand.w, nIn = { x: -cand.nOut.x, z: -cand.nOut.z }, geo = HEm.GEO || {}, e0 = num(HEm.GEO && HEm.GEO.embutir != null ? HEm.GEO.embutir : (HK()._int.geo(null, "embutir")), 0.05);   // hid:ok 5 cm: embutir da casa se o motor não expõe
    var enc = num(HK()._int.geo(null, "alturaEnchimento"), 0.10);   // hid:ok enchimento do piso (a casa)
    var yf = r4(pisoInt - enc / 2), O = { x: cand.saida.x, y: r4(pisoY + cand.saida.y), z: cand.saida.z };
    var esp = w.esp, enco = HEm.encaixe(esp, 22, {});   // hid:ok DN de referência p/ conferir a parede
    var P1 = { x: r4(O.x + nIn.x * (esp - e0)), y: O.y, z: r4(O.z + nIn.z * (esp - e0)) };
    var P2 = { x: P1.x, y: yf, z: P1.z };
    var P3 = { x: r4(P2.x + nIn.x * (e0 + 0.05)), y: yf, z: r4(P2.z + nIn.z * (e0 + 0.05)) };   // hid:ok 5 cm além da face interna
    var C = cook.centro, nb = cook.nb;
    /* o toco final vai do ponto de subida R para trás (nb), 30 cm */
    var R = { x: r4(C.x), z: r4(C.z) }, yP = r4(pisoInt + (cook.tampo != null ? cook.tampo : 0.90) - par.sobTampo);   // hid:ok tampo 0,90 se a família não diz
    var Rtop = { x: R.x, y: yP, z: R.z }, Rbase = { x: R.x, y: yf, z: R.z };
    var Pfim = { x: r4(R.x + nb.x * par.toco), y: yP, z: r4(R.z + nb.z * par.toco) };
    /* percurso plano P3 → R: (A) ao longo da direção de entrada e depois lateral; (B) o contrário */
    function lPlano(primeiroAlong) {
      var d = { x: R.x - P3.x, z: R.z - P3.z }, along = d.x * nIn.x + d.z * nIn.z, lado = { x: d.x - along * nIn.x, z: d.z - along * nIn.z };
      var M = primeiroAlong ? { x: r4(P3.x + nIn.x * along), z: r4(P3.z + nIn.z * along) } : { x: r4(P3.x + lado.x), z: r4(P3.z + lado.z) };
      return [P3, { x: M.x, y: yf, z: M.z }, Rbase];
    }
    var variantes = [lPlano(true), lPlano(false)];
    return { O: O, P1: P1, P2: P2, P3: P3, Rbase: Rbase, Rtop: Rtop, Pfim: Pfim, variantes: variantes, yf: yf, e0: e0, esp: esp, cabe: enco.cabe, encaixe: enco, nIn: nIn };
  }

  /* trechos (pontos) a partir da rota + variante; já com as peças em linha */
  function montarPolilinha(rt, variante) {
    var pts = [rt.O, rt.P1, rt.P2];
    variante.forEach(function (p, i) { if (i === 0) { pts.push({ x: p.x, y: p.y, z: p.z }); return; } pts.push({ x: p.x, y: p.y, z: p.z }); });
    pts.push(rt.Rtop); pts.push(rt.Pfim);
    /* tira pontos repetidos e colineares */
    var o = [pts[0]];
    for (var i = 1; i < pts.length; i++) { var a = o[o.length - 1], b = pts[i]; if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) < 1e-4) continue; o.push(b); }   // hid:ok 0,1 mm
    var r = [o[0]];
    for (var k = 1; k < o.length - 1; k++) { var p0 = r[r.length - 1], p1 = o[k], p2 = o[k + 1], u = { x: p1.x - p0.x, y: p1.y - p0.y, z: p1.z - p0.z }, v = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z }, cr = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x }; if (Math.abs(cr.x) + Math.abs(cr.y) + Math.abs(cr.z) > 1e-6) r.push(p1); }   // hid:ok produto vetorial ~ 0 = colinear
    r.push(o[o.length - 1]);
    return r;
  }
  function comp(a, b) { return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2) + Math.pow(a.z - b.z, 2)); }

  /* confere a polilinha contra pilar/viga, shaft, outras redes e as paredes (só a hospedeira pode ser atravessada) */
  function conferirRota(estado, pts, cand, rt, par, S, out) {
    var falhas = [], R = 0.016;   // hid:ok raio do tubo DN 15–22 (16 mm) p/ o afastamento entre superfícies
    var HEm = HE(), paredes = HEm.paredes(estado);
    var estr = arr(estado.caixas).filter(function (c) { return c && /pilar|viga|metal/.test(txt(c.tipo)) && c.tipo !== "metal"; }).map(function (c) { return { id: String(c.id), tipo: c.tipo, P: retDaCaixa(c), y0: num(c.cy, 0) - num(c.altura, 0) / 2, y1: num(c.cy, 0) + num(c.altura, 0) / 2 }; });
    var shafts = arr(estado.caixas).filter(function (c) { return c && c.tipo === "parede" && c.shaft; }).map(function (c) { return { id: String(c.id), P: retDaCaixa(c) }; });
    for (var i = 0; i + 1 < pts.length; i++) {
      var a = pts[i], b = pts[i + 1], n = Math.max(2, Math.ceil(comp(a, b) / 0.05));   // hid:ok amostragem de 5 cm
      for (var k = 0; k <= n; k++) {
        var t = k / n, p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
        estr.forEach(function (q) { if (p.y >= q.y0 - EPS && p.y <= q.y1 + EPS && noPoli(p, q.P)) falhas.push({ regra: "elemento estrutural", texto: "o tubo passa por dentro de " + q.tipo + " " + q.id, el: q.id }); });
        shafts.forEach(function (q) { if (noPoli(p, q.P)) falhas.push({ regra: "shaft", texto: "o tubo passa por shaft " + q.id, el: q.id }); });
        paredes.forEach(function (w) {
          if (w.id === cand.w.id) return;
          var l = HEm._int.local(w, p); if (l.s >= -EPS && l.s <= w.L + EPS && Math.abs(l.v) <= w.hw && p.y >= w.base - EPS && p.y <= w.topo + EPS) falhas.push({ regra: "atravessa outra parede", texto: "o tubo corre por dentro da parede " + w.id + " (só a parede do abrigo pode ser atravessada)", el: w.id });
        });
      }
    }
    /* outras redes: Tabela 1 da NBR 15526 (paralelo = o maior; cruzamento = o do cruzamento) */
    var tabAf = linhasTab("gas.15526.afastamentos");
    function afast(sis) { var m = { agua_fria: "agua", agua_quente: "agua", esgoto: "esgoto_pluvial", pluvial: "esgoto_pluvial", ventilacao: "esgoto_pluvial", eletrica: "eletrica_eletroduto_nao_metalico", incendio: "vapor", industrial: "vapor" }[sis]; var l = tabAf.filter(function (x) { return x.elemento === m; })[0]; return l ? { par: num(l.paralelo_mm, 0) / 1000, cruz: num(l.cruzamento_mm, null) != null ? num(l.cruzamento_mm, 0) / 1000 : num(l.paralelo_mm, 0) / 1000 } : null; }   // hid:ok mm → m
    var minimos = [];
    arr(estado.instalacoes && estado.instalacoes.trechos).forEach(function (t) {
      if (t.sistema === SIS) return;
      var A = afast(t.sistema), dn = num(t.dn, 50) / 1000, pior = null, menor = Infinity;   // hid:ok DN 50 se o trecho não diz
      var ut = { x: t.p2.x - t.p1.x, y: t.p2.y - t.p1.y, z: t.p2.z - t.p1.z }, lt = Math.sqrt(ut.x * ut.x + ut.y * ut.y + ut.z * ut.z) || 1;
      for (var i2 = 0; i2 + 1 < pts.length; i2++) {
        var dd = distSegSeg(pts[i2], pts[i2 + 1], t.p1, t.p2); menor = Math.min(menor, dd);
        var ug = { x: pts[i2 + 1].x - pts[i2].x, y: pts[i2 + 1].y - pts[i2].y, z: pts[i2 + 1].z - pts[i2].z }, lg = Math.sqrt(ug.x * ug.x + ug.y * ug.y + ug.z * ug.z) || 1;
        var paralelo = Math.abs((ug.x * ut.x + ug.y * ut.y + ug.z * ut.z) / (lg * lt)) >= par.cosParalelo, livre2 = dd - R - dn / 2;   // distância entre as superfícies
        if (!A) continue;
        var req = paralelo ? A.par : A.cruz, marg = livre2 - req;
        if (!pior || marg < pior.marg) pior = { marg: marg, livre: livre2, situacao: paralelo ? "paralelo" : "cruzamento", req: req };
      }
      if (A && pior && pior.marg < -EPS) falhas.push({ regra: "afastamento NBR 15526 Tabela 1", texto: "a " + f2(pior.livre * 1000) + " mm de " + t.sistema + " " + t.id + " (mínimo " + f2(pior.req * 1000) + " mm em " + pior.situacao + ")", el: String(t.id) });   // hid:ok m → mm
      if (menor < par.raioVizinhas && pior) minimos.push({ trecho: String(t.id), sistema: t.sistema, livre_mm: Math.round(pior.livre * 1000), situacao: pior.situacao });   // hid:ok m → mm
    });
    S.vizinhos = minimos;
    return falhas;
  }

  /* ------------------------------------------------ dimensionamento (NBR 15526) pelo HidInd */
  function leqDe(dn, nCot) { var l = linhasTab("gas.15526.leq_cobre").filter(function (x) { return x.conexao === "cotovelo_90"; })[0]; var v = l ? num(l["dn_" + dn], null) : null; return v == null ? null : r4(v * nCot); }
  function cotovelos(pts) { var n = 0; for (var i = 1; i + 1 < pts.length; i++) { var u = { x: pts[i].x - pts[i - 1].x, y: pts[i].y - pts[i - 1].y, z: pts[i].z - pts[i - 1].z }, v = { x: pts[i + 1].x - pts[i].x, y: pts[i + 1].y - pts[i].y, z: pts[i + 1].z - pts[i].z }; n++; } return n; }
  /* tabela 1 (afastamentos): o elemento da NBR 15526 a que cada sistema do modelo corresponde */
  var ELEM_TAB = { agua_fria: "agua", agua_quente: "agua", esgoto: "esgoto_pluvial", pluvial: "esgoto_pluvial", ventilacao: "esgoto_pluvial", eletrica: "eletrica_eletroduto_nao_metalico" };
  function vizinhasDe(viz, raio) {
    /* o mais perto de cada elemento da Tabela 1; sem vizinha na categoria = "pelo menos o raio de busca" (nada mais perto que isso) */
    var por = {}, todos = {};
    arr(viz).forEach(function (z) { var el = ELEM_TAB[z.sistema]; if (!el) return; todos[el] = 1; if (!por[el] || z.livre_mm < por[el].livre_mm) por[el] = z; });
    var out = [];
    Object.keys(por).forEach(function (el) { out.push({ trecho: "gás × " + por[el].sistema + " " + por[el].trecho, elemento: el, situacao: por[el].situacao || "paralelo", distancia_mm: Math.max(0, por[el].livre_mm) }); });
    ["agua", "esgoto_pluvial", "eletrica_eletroduto_nao_metalico"].forEach(function (el) { if (!por[el]) out.push({ trecho: "gás × " + el + " (nenhum no raio de busca)", elemento: el, situacao: "paralelo", distancia_mm: Math.round(raio * 1000) }); });   // hid:ok m → mm
    return out;
  }
  /* a cadeia hidráulica = os trechos do MODELO, um a um (mesmos ids: a planta e o memorial acham o cálculo de cada tubo); o registro e o regulador
     entre dois trechos não têm comprimento equivalente na tabela (pendência no memorial) */
  function montarEntrada(par, segs, dn, vazao, consumidorId, pOper, viz) {
    var nos = {}, trechos = [];
    nos.N0 = { cota: segs[0].p1.y, x: segs[0].p1.x, y: segs[0].p1.y, z: segs[0].p1.z };
    function dirDe(g) { var L = comp(g.p1, g.p2) || 1; return { x: (g.p2.x - g.p1.x) / L, y: (g.p2.y - g.p1.y) / L, z: (g.p2.z - g.p1.z) / L }; }
    for (var i = 0; i < segs.length; i++) {
      var g = segs[i], prox = segs[i + 1], cot = 0;
      if (prox) { var a = dirDe(g), b = dirDe(prox); if (a.x * b.x + a.y * b.y + a.z * b.z < 1 - 1e-6) cot = leqDe(dn, 1); }   // hid:ok colinear = sem cotovelo (cos do ângulo)
      nos["N" + (i + 1)] = { cota: g.p2.y, x: g.p2.x, y: g.p2.y, z: g.p2.z };
      trechos.push({ id: g.id, de: "N" + i, para: "N" + (i + 1), comprimento_m: r4(comp(g.p1, g.p2)), dn: String(dn), travado: true, conexoes: [{ leq_m: cot }], atravessa: [] });
    }
    return { fluido: { tipo: "glp", nome: "GLP", temperatura_C: par.temperatura_C, pressao_kPa: pOper }, material: "cobre", serie: par.serie, servico: "gas_residencial", projeto: { pressao_kPa: pOper },
             dilatacao: { temperaturaInstalacao_C: par.temperatura_C },
             gas: { tipoInstalacao: "unidade_unica", dentroUnidade: true, vizinhas: vizinhasDe(viz, par.raioVizinhas) },
             rede: { origem: "N0", nos: nos, trechos: trechos, consumidores: [{ id: consumidorId, no: "N" + trechos.length, vazao_m3_h: vazao, valvulaBloqueio: true }] } };
  }

  /* ================================================================ GERAR */
  function gerar(a, b, c) {
    var e = a && a.estado ? a : { estado: a, avaliarFam: b, rua: c && c.rua, parametros: c && c.parametros, abrigo: c && c.abrigo };
    var estado = e.estado || {}, aval = e.avaliarFam, par = {}, k;
    for (k in PARAM) if (Object.prototype.hasOwnProperty.call(PARAM, k)) par[k] = PARAM[k];
    for (k in (e.parametros || {})) if (Object.prototype.hasOwnProperty.call(e.parametros, k)) par[k] = e.parametros[k];
    var out = { ok: false, sistema: SIS, ops: [], lote: null, premissas: [], pendencias: [], avisos: [], verificacoes: [], consumidores: [], abrigo: null, rede: null, entrada: null, resultado: null, memorial: null, candidatos: null };
    var N = NN(), HIn = HI(), BIm = BI(), HKm = HK();
    if (!N || !HIn || !BIm || !HKm || !HE()) { out.pendencias.push({ chave: "gas.motores", texto: "motores do gás (HidNormas, HidInd, BimInst, HidKit, HidEmbutido) não carregaram", elementos: [] }); return out; }
    var famAbrigo = global.FamiliasRA && global.FamiliasRA.obter ? global.FamiliasRA.obter("ra-gas-abrigo", true) : null;
    if (!famAbrigo) { out.pendencias.push({ chave: "gas.familias", texto: "as famílias do gás (js/hidgasfam.js) não carregaram", elementos: [] }); return out; }
    var pot = tab("gas.15526.potencias", { aparelho: par.aparelho }, "kcal_h"), pci = tab("gas.15526.parametros", { gas: "glp" }, "pci_kcal_m3");
    if (!pot || !pci) { out.pendencias.push({ chave: "gas.15526.potencias", texto: "potência do aparelho (Anexo D) ou PCI do GLP (6.3) sem tabela: não dá para dimensionar", elementos: [] }); return out; }
    var lista = cooktops(estado, aval, par, out);
    if (!lista.length) { out.pendencias.push({ chave: "gas.sem_consumidor", texto: "nenhum cooktop a gás com parede atrás no modelo: nada a ligar", elementos: [] }); return out; }
    var cook = lista[0];
    if (lista.length > 1) out.pendencias.push({ chave: "gas.varios_cooktops", texto: "há " + lista.length + " cooktops com parede atrás; esta versão liga o primeiro (" + cook.id + ") — os demais precisam de ramal à mão", elementos: lista.map(function (x) { return x.id; }) });
    out.consumidores = [{ id: cook.id, x: cook.centro.x, z: cook.centro.z, aparelho: par.aparelho, kcal_h: pot.valor, kW: tab("gas.15526.potencias", { aparelho: par.aparelho }, "kW").valor }];
    /* o piso: externo e interno */
    var pisoInt = 0; try { var Pi = HKm._int.pisoDe(estado, aval, cook.fi, null); if (Pi && Pi.ok) pisoInt = Pi.y; } catch (ePi) { pisoInt = 0; }
    var pisoExt = pisoInt;   // premissa: o piso externo do abrigo na mesma cota do interno (degrau não modelado) — conferir

    var S = escolherAbrigo(estado, aval, par, cook, e.rua, out, false);
    out.premissas = out.premissas.concat(premissas(par, pot, pci, cook, e.rua));
    if (!S.lista.length) { out.pendencias.push({ chave: "gas.abrigo_local", texto: "nenhum lugar atende o abrigo (fora da projeção, ao ar livre, sem fachada da rua à vista, afastado " + f2(par.afastMin) + " m de ralos/caixas/ignição/casa de máquinas). Descartes: " + JSON.stringify(out.candidatos.descartes), elementos: [] }); return out; }

    /* o primeiro candidato (menor caminho) cuja rota passa na conferência */
    var escolhido = null, tent = [];
    for (var i = 0; i < Math.min(S.lista.length, 400) && !escolhido; i++) {   // hid:ok até 400 candidatos
      var cd = S.lista[i], rt = rota(estado, aval, par, cd, cook, null, pisoExt, pisoInt, null);
      for (var vv = 0; vv < rt.variantes.length && !escolhido; vv++) {
        var pts = montarPolilinha(rt, rt.variantes[vv]), falhas = conferirRota(estado, pts, cd, rt, par, S, out);
        if (!falhas.length) escolhido = { cd: cd, rt: rt, pts: pts, variante: vv, falhas: falhas };
        else if (tent.length < 3) tent.push({ s: cd.s, parede: cd.w.id, falhas: falhas.slice(0, 2) });   // hid:ok guarda 3 tentativas p/ o memorial
      }
    }
    if (!escolhido) { out.pendencias.push({ chave: "gas.rota", texto: "nenhuma rota embutida passou na conferência (pilar/viga/shaft/outras redes/paredes). Tentativas: " + JSON.stringify(tent), elementos: [] }); return out; }
    var cd = escolhido.cd, rt = escolhido.rt, pts = escolhido.pts;

    /* ---- a geometria dos trechos (sem DN): câmara do abrigo, rede embutida e toco do ponto */
    var pref = "gas-", ang = cd.ang, segs = [];
    function noEixo(zLoc) { var m = mundoLocal(cd.A, ang, S.saidaX, rt.O.y, zLoc); return { x: r4(m.x), y: r4(rt.O.y), z: r4(m.z) }; }
    function seg(p1, p2, extra) { segs.push({ id: pref + "t" + (segs.length + 1), p1: p1, p2: p2, aplicacao: extra && extra.aplicacao || "linha", parte: extra && extra.parte || "rede", aparente: !!(extra && extra.aparente) }); }
    var rOut = noEixo(par.stubReg - par.regC / 2), gIn = noEixo(par.stubRegistro + par.registroC / 2), gOut = noEixo(par.stubRegistro - par.registroC / 2);
    seg(rOut, gIn, { parte: "abrigo", aparente: true });
    seg(gOut, pts[0], { parte: "abrigo", aparente: true });
    var nPts = pts.length;
    for (var q = 0; q + 1 < nPts - 1; q++) seg(pts[q], pts[q + 1], { aplicacao: pts[q].y !== pts[q + 1].y ? "ramal" : "linha" });
    var tp0 = pts[nPts - 2], tp1 = pts[nPts - 1], dirT = { x: tp1.x - tp0.x, z: tp1.z - tp0.z }, LT = Math.sqrt(dirT.x * dirT.x + dirT.z * dirT.z), uT = { x: dirT.x / LT, z: dirT.z / LT };
    if (Math.abs(tp1.y - tp0.y) > EPS || LT < par.toco - EPS) out.pendencias.push({ chave: "gas.toco", texto: "o último segmento da rede não ficou horizontal com " + f2(par.toco * 100) + " cm: registro/ponto lançados a mão", elementos: [] });
    function sobT(d) { return { x: r4(tp0.x + uT.x * d), y: tp0.y, z: r4(tp0.z + uT.z * d) }; }
    seg(tp0, sobT(par.tocoA), { aplicacao: "ramal", parte: "toco" });
    seg(sobT(par.tocoA + par.registroC), sobT(par.tocoA + par.registroC + par.tocoB), { aplicacao: "ramal", parte: "toco" });

    /* ---- dimensionamento: o menor DN de cobre que fecha a perda e a velocidade (pela cadeia dos trechos do modelo) */
    var vazao = r4(pot.valor / pci.valor), dnEsc = null, res = null, ent = null;
    var dns = par.dnLista.filter(function (d) { return d >= par.dnMin; });
    for (var di = 0; di < dns.length; di++) {
      var ent0 = montarEntrada(par, segs, dns[di], vazao, cook.id, par.pressaoRegulador_kPa, S.vizinhos);
      if (ent0.rede.trechos.some(function (t) { return t.conexoes.some(function (x) { return x.leq_m == null; }); })) { out.pendencias.push({ chave: "gas.15526.leq_cobre", texto: "sem comprimento equivalente (Tabela C.4) para DN " + dns[di], elementos: [] }); continue; }
      var r0 = HIn.calcular(ent0, N.contexto());
      var vp = arr(r0.verificacoes).filter(function (v) { return /^perda total/.test(txt(v.nome)); })[0];
      res = r0; ent = ent0;
      if (vp && vp.ok === true && r0.problemas.length === 0 && arr(r0.verificacoes).every(function (v) { return v.status !== "reprovado"; })) { dnEsc = dns[di]; break; }
    }
    if (dnEsc == null) { out.pendencias.push({ chave: "gas.dimensionamento", texto: "nenhum DN de cobre da lista fechou o dimensionamento (último status: " + (res && res.status) + "): revisar com o RT", elementos: [] }); out.resultado = res; out.entrada = ent; return out; }

    /* a parede comporta o tubo embutido? (DE do cobre = DN em mm) */
    rt.encaixe = HE().encaixe(rt.esp, dnEsc / 1000, {}); rt.cabe = rt.encaixe.cabe;   // hid:ok mm → m
    if (!rt.cabe) out.avisos.push({ chave: "gas.parede_fina", texto: "a parede " + cd.w.id + " (" + f2(rt.esp * 100) + " cm) é fina para o tubo embutido (precisa " + f2(rt.encaixe.precisa * 100) + " cm): enchimento/shaft de acabamento", elementos: [cd.w.id] });   // hid:ok m → cm
    out.pendencias.push({ chave: "gas.baldrame", texto: "A descida do tubo pela parede ao enchimento do piso (cota " + f2(rt.yf) + " m) passa pela base da parede: o baldrame/fundação não está modelado — conferir que o tubo não atinge elemento estrutural (usar camisa/desvio se atingir).", elementos: [cd.w.id] });

    /* ---- as ops */
    var ops = [], dnStr = dnEsc, dirIn = { x: -cd.nOut.x, z: -cd.nOut.z }, rotLin = rotParaDir(dirIn.x, dirIn.z), rotT = rotParaDir(uT.x, uT.z);
    var pReg = noEixo(par.stubReg), pRegistro = noEixo(par.stubRegistro);
    ops.push({ op: "familia", id: pref + "abrigo", famId: "ra-gas-abrigo", tipoId: famAbrigo.tipos[0].id, x: r4(cd.A.x), y: r4(pisoExt), z: r4(cd.A.z), rotY: r4(ang), inst: {}, kit: "gas", kitParte: "abrigo" });
    ops.push({ op: "familia", id: pref + "regulador", famId: "ra-gas-regulador", tipoId: "padrao", x: pReg.x, y: pReg.y, z: pReg.z, rotY: rotLin, inst: { DN: dnStr }, kit: "gas", kitParte: "regulador" });
    ops.push({ op: "familia", id: pref + "registro-geral", famId: "ra-gas-registro", tipoId: "padrao", x: pRegistro.x, y: pRegistro.y, z: pRegistro.z, rotY: rotLin, inst: { DN: dnStr }, kit: "gas", kitParte: "registro geral" });
    var tr = [];
    segs.forEach(function (g) {
      var o = { op: "trecho", id: g.id, sistema: SIS, material: "cobre", classe: par.serie, dn: dnEsc, p1: { x: r4(g.p1.x), y: r4(g.p1.y), z: r4(g.p1.z) }, p2: { x: r4(g.p2.x), y: r4(g.p2.y), z: r4(g.p2.z) }, aplicacao: g.aplicacao, kit: "gas", kitParte: g.parte };
      if (g.aparente) o.aparente = true;
      ops.push(o); tr.push(o);
    });
    var dRg = par.tocoA + par.registroC / 2, dPt = par.tocoA + par.registroC + par.tocoB + par.pontoC / 2;
    ops.push({ op: "familia", id: pref + "registro-ponto", famId: "ra-gas-registro", tipoId: "padrao", x: sobT(dRg).x, y: tp0.y, z: sobT(dRg).z, rotY: rotT, inst: { DN: dnStr }, kit: "gas", kitParte: "registro do ponto" });
    ops.push({ op: "familia", id: pref + "ponto", famId: "ra-gas-ponto", tipoId: "padrao", x: sobT(dPt).x, y: tp0.y, z: sobT(dPt).z, rotY: rotT, inst: { DN: dnStr }, kit: "gas", kitParte: "ponto de consumo" });
    out.ops = ops;
    out.lote = { op: "lote", id: "c487-gas", origem: "hidgas", pedido: "Rede de gás GLP: abrigo, rede embutida e ponto do cooktop", ops: ops };

    /* ---- memorial */
    var Ltot = 0; segs.forEach(function (g) { Ltot += comp(g.p1, g.p2); });
    var est1 = linhasTab("gas.15526.estanqueidade"), pTrab = par.pressaoRegulador_kPa;
    var e1 = est1.filter(function (x) { return num(x.etapa, 0) === 1; })[0], e2 = est1.filter(function (x) { return num(x.etapa, 0) === 2; })[0];
    var pEns = e1 ? Math.max(num(e1.fator_pressao_trabalho, 0) * pTrab, num(e1.pressao_min_kpa, 0)) : null;
    out.abrigo = { id: pref + "abrigo", x: r4(cd.A.x), z: r4(cd.A.z), rotY: r4(ang), parede: cd.w.id, s: cd.s, saida: { x: rt.O.x, y: rt.O.y, z: rt.O.z }, caminho_m: r4(Ltot), afastamento_m: r4(cd.afast), afastDe: cd.afastDe ? (cd.afastDe.tipo + " " + cd.afastDe.id) : "—", poligono: cd.R, areaLivreFrente: retPlano(cd.A.x, cd.A.z, cd.ang, S.larg, par.frente, S.prof), candidatos: out.candidatos };
    out.rede = { pontos: pts, comprimento_m: r4(Ltot), dn: dnEsc, serie: par.serie, material: "cobre", maiorReto_m: r4(Math.max.apply(null, segs.map(function (g) { return comp(g.p1, g.p2); }))), cotovelos: ent.rede.trechos.filter(function (t) { return t.conexoes[0].leq_m > 0; }).length, trechos: tr.length, variante: escolhido.variante, vizinhos: S.vizinhos || [], parede: { id: cd.w.id, esp_m: rt.esp, cabe: rt.cabe }, yPiso: rt.yf, yPonto: rt.Rtop.y };
    out.entrada = ent; out.resultado = res;
    out.memorial = memorial(out, par, pot, pci, vazao, pEns, e1, e2, cook, cd);
    out.verificacoes = verificacoes(out, par, cd, rt, e, S);
    out.pendencias = out.pendencias.concat(out.memorial.pendencias);
    out.ok = true;
    return out;
  }

  function premissas(par, pot, pci, cook, rua) {
    var P = [];
    P.push({ item: "gás", valor: "GLP em botijões P13 (2: um em uso, um reserva)", origem: "coordenação", conferir: "se houver rede de gás natural na rua, trocar o abrigo pelo medidor da concessionária e redimensionar (GN)" });
    P.push({ item: "pressão de saída do regulador", valor: f2(par.pressaoRegulador_kPa) + " kPa (baixa pressão, GLP)", origem: "premissa da RA", conferir: "valor do regulador escolhido; a norma do regulador não está no acervo" });
    P.push({ item: "aparelho", valor: "cooktop " + par.aparelho.replace(/_/g, " ") + " = " + f2(pot.valor) + " kcal/h", origem: "NBR 15526 Anexo D (gas.15526.potencias)", conferir: "potência do cooktop escolhido (catálogo do fabricante): a tabela do Anexo D é a de um fogão de 5 bocas sem forno" });
    P.push({ item: "PCI do GLP", valor: f2(pci.valor) + " kcal/m³", origem: "NBR 15526 6.3", conferir: "" });
    P.push({ item: "tubo", valor: "cobre classe " + par.serie + " (NBR 13206), embutido", origem: "premissa da coordenação", conferir: "multicamada para gás, se a base de preço tiver, é alternativa" });
    P.push({ item: "posição do cooktop no móvel", valor: cook.posicao, origem: cook.posicao.indexOf("sólido") === 0 ? "geometria do modelo" : "premissa da RA", conferir: "ajustar o ponto ao cooktop escolhido" });
    P.push({ item: "altura do ponto de consumo", valor: f2(par.sobTampo * 100) + " cm abaixo do tampo, dentro do móvel (registro de esfera + flexível metálico)", origem: "premissa da RA", conferir: "altura de instalação do cooktop" });
    P.push({ item: "afastamento do abrigo", valor: "≥ " + f2(par.afastMin) + " m de ralos, caixas, ignição, casa de máquinas e piscina", origem: "adotado pela RA", conferir: "NBR 13523 (afastamentos do abrigo) NÃO está no acervo: conferir no exemplar" });
    P.push({ item: "piso do abrigo", valor: "na cota do piso interno (degrau externo não modelado)", origem: "premissa da RA", conferir: "cota do piso externo" });
    P.push({ item: "rua", valor: rua ? "informada no projeto" : "NÃO informada: o teste de fachada da rua ficou pendente", origem: rua ? "projeto" : "pendente", conferir: "" });
    return P;
  }

  function verificacoes(out, par, cd, rt, e, S) {
    var V = [];
    function v(nome, ok, texto) { V.push({ nome: nome, ok: ok, status: ok === null ? "pendente" : (ok ? "ok" : "reprovado"), texto: texto }); }
    /* o LOCAL do cooktop pela classificação do ambiente da NBR 13103 (js/hidgas.js): cozinha/serviço é liberado; banheiro, dormitório, kitnet e escada não */
    var HGm = dep("HidGas", "./hidgas.js"), cookAmb = null, estadoA = e.estado || {};
    arr(estadoA.ambientes).forEach(function (am) { var cl = am && am.calc; if (!cookAmb && cl && arr(cl.contorno).length >= 3 && noPoli({ x: out.consumidores[0].x, z: out.consumidores[0].z }, cl.contorno)) cookAmb = am; });   // hid:ok polígono tem 3+ vértices
    if (HGm && HGm.classe && cookAmb) { var clAm = HGm.classe(cookAmb.nome, cookAmb.ocupacao), proib = /^(sanitario|dormitorio|multiuso_com_leito|escada_rota_fuga)$/.test(txt(clAm)); v("local do cooktop (NBR 13103, classe do ambiente)", !proib, "ambiente \"" + txt(cookAmb.nome) + "\" = " + txt(clAm) + (proib ? " — PROIBIDO para aparelho a gás de queima aberta" : " — liberado para o cooktop; ventilação permanente da cozinha a conferir (pendência)")); }
    else v("local do cooktop (NBR 13103, classe do ambiente)", null, "cooktop fora de ambiente delimitado: sem classe, não verificado");
    v("abrigo fora da projeção da edificação", true, "o retângulo do abrigo e a área à frente não tocam ambiente, laje, telhado, parede ou peça do modelo");
    v("abrigo ao ar livre", true, "fora de qualquer ambiente fechado e de laje/telhado (ventilação natural pelas grelhas das portas)");
    v("abrigo fora da fachada da rua", e.rua ? true : null, e.rua ? "nenhuma linha reta do abrigo à rua sem parede no caminho" : "rua não informada: teste não feito");
    v("afastamento a ralos/caixas/ignição/casa de máquinas/piscina", cd.afast >= par.afastMin, "o mais próximo: " + (cd.afastDe ? cd.afastDe.tipo + " " + cd.afastDe.id : "—") + " a " + f2(cd.afast) + " m (adotado ≥ " + f2(par.afastMin) + " m; NBR 13523 fora do acervo: conferir)");
    v("rede embutida (parede e piso), nada aparente fora do abrigo", out.ops.filter(function (o) { return o.op === "trecho" && o.aparente; }).every(function (o) { return o.kitParte === "abrigo"; }), "só os 2 trechos curtos da câmara do abrigo são aparentes (regulador e registro de corte)");
    v("tubo fora de pilar, viga, shaft e forro", true, "conferido ponto a ponto (amostra de 5 cm); a rede corre na parede e no enchimento do piso");
    v("afastamento às outras redes (NBR 15526 Tabela 1)", true, "conferido contra " + arr(S.vizinhos).length + " rede(s) vizinha(s) do modelo no momento da geração");
    return V;
  }

  function memorial(out, par, pot, pci, vazao, pEns, e1, e2, cook, cd) {
    var M = { titulo: "Gás combustível (GLP) — NBR 15526", pendencias: [], premissas: out.premissas, secoes: [] };
    M.pendencias.push({ chave: "gas.15526.exemplar", texto: "Os valores da NBR 15526 usados no cálculo do gás devem ser conferidos na edição vigente da norma antes da execução. Instalação não residencial segue a NBR 15358 (fora do escopo).", elementos: [] });
    M.pendencias.push({ chave: "gas.13523", texto: "Afastamentos do abrigo de GLP (NBR 13523) não estão no acervo: o afastamento adotado (" + f2(par.afastMin) + " m a ralos, caixas, ignição, casa de máquinas e piscina) é da RA — conferir no exemplar.", elementos: [out.abrigo ? out.abrigo.id : ""] });
    M.pendencias.push({ chave: "gas.regulador", texto: "Regulador de pressão e registro: pressão de saída (" + f2(par.pressaoRegulador_kPa) + " kPa), vazão e perda de carga dependem da ficha do regulador/registro escolhido (fora do acervo). O comprimento equivalente do registro e do regulador não tem tabela: não entrou no cálculo.", elementos: [] });
    M.pendencias.push({ chave: "gas.cooktop", texto: "Potência do cooktop = Anexo D (fogão de 5 bocas sem forno, " + f2(pot.valor) + " kcal/h); conferir com o cooktop escolhido. O ponto de consumo está sob o cooktop (" + cook.posicao + "), a " + f2(par.sobTampo * 100) + " cm sob o tampo.", elementos: [cook.id] });
    M.pendencias.push({ chave: "gas.dilatacao", texto: "Dilatação térmica do cobre: a distância máxima entre pontos fixos do cobre NÃO tem fonte no acervo (ind.dilatacao.pontos_fixos) — por isso o cálculo do HidInd fica PENDENTE só neste item. A rede é embutida (parede e enchimento do piso) e de trechos retos curtos (o maior tem " + f2(out.rede.maiorReto_m) + " m); conferir com o RT.", elementos: [] });
    M.pendencias.push({ chave: "gas.ventilacao_cozinha", texto: "Ventilação permanente da cozinha para o cooktop (NBR 13103): a família do móvel não traz o tipo do aparelho — conferir a abertura permanente exigida e a coifa/exaustão.", elementos: [cook.id] });
    M.pendencias.push({ chave: "gas.preco", texto: "Quantitativo: tubo de cobre classe A para gás, conexões, abrigo, regulador e registros sem composição SINAPI mapeada — orçar com o fornecedor (nunca a composição parecida).", elementos: [] });
    M.pendencias.push({ chave: "gas.concessionaria", texto: "Projeto de GLP residencial: conferir exigências do Corpo de Bombeiros do local e do distribuidor de GLP (fora do acervo).", elementos: [] });
    M.estanqueidade = { etapa1: e1 ? { pressao_kPa: pEns, tempo_min: num(e1.tempo_min, null), estabilizacao_min: num(e1.estabilizacao_min, null), base: txt(e1.base), regra: "≥ " + f2(num(e1.fator_pressao_trabalho, 0)) + " × a pressão de trabalho máxima e ≥ " + f2(num(e1.pressao_min_kpa, 0)) + " kPa, por " + num(e1.tempo_min, 0) + " min (+ " + num(e1.estabilizacao_min, 0) + " min de estabilização)" } : null,
                        etapa2: e2 ? { tempo_min: num(e2.tempo_min, null), base: txt(e2.base), regra: "na pressão de operação por " + num(e2.tempo_min, 0) + " min (+ " + num(e2.estabilizacao_min, 0) + " min de estabilização)" } : null, fonte: "NBR 15526 8.1 (gas.15526.estanqueidade)" };
    M.vazao_m3_h = vazao; M.potencia_kcal_h = pot.valor; M.pci = pci.valor;
    return M;
  }

  /* a entrada do HidDimensionar: o resultado do gás já calculado entra como sistemas.gas (HidDimensionar chama o HidInd de novo com esta entrada) */
  function entradaDimensionar(g) { return g && g.entrada ? JSON.parse(JSON.stringify(g.entrada)) : null; }

  /* anexa ao resultado do HidDimensionar (R.sistemas.gas) o projeto do gás — o que o memorial e a prancha mostram além do cálculo */
  function anexar(R, g) {
    if (!R || !R.sistemas || !R.sistemas.gas || !g || !g.ok) return false;
    R.sistemas.gas.serie = R.sistemas.gas.serie || (g.entrada && g.entrada.serie);
    R.sistemas.gas.projetoGas = { premissas: g.premissas, consumidores: g.consumidores, abrigo: g.abrigo, rede: g.rede, verificacoes: g.verificacoes, memorial: g.memorial, pendencias: g.memorial ? g.memorial.pendencias.concat(g.pendencias.filter(function (p) { return !g.memorial.pendencias.some(function (q) { return q.chave === p.chave; }); })) : g.pendencias, avisos: g.avisos };
    return true;
  }

  var HidGasRede = { LOTE_ID: "c487-gas", gerar: gerar, anexar: anexar, entradaDimensionar: entradaDimensionar, PARAM: PARAM, SIS: SIS };
  global.HidGasRede = HidGasRede;
  if (typeof module !== "undefined" && module.exports) module.exports = HidGasRede;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
