/* =====================================================================
 * biminstembutido.js — TUBO EMBUTIDO, NUNCA APARENTE SEM MOTIVO (N23, 26/10/2026). Motor PURO, ES5, Node-testável.
 *
 * Pedido do Rogério (26/10/2026, print do banheiro): "Sempre entra na parede o tubo de esgoto que sai da pia, pois na realidade da
 * construção sempre embutimos nas paredes ou shafts." No print o esgoto da cuba descia APARENTE do sifão até o piso, solto no ar.
 * A causa: o ponto de esgoto da cuba de apoio fica no EIXO da cuba (a saída da válvula/sifão), não na face de trás — o traçado só
 * embutia ponto "de parede" (na face do corpo, js/biminst.js conectoresDe) — e com a louça a poucos cm da parede o eixo "embutido"
 * ficava no ar, atrás dela (o esgoto não tinha a procura da parede de verdade que a água fria já tinha, FRENTE H1).
 *
 * Este arquivo é o lugar ÚNICO da régua (o traçado, o kit, o auditor e o Corrigir usam a mesma conta):
 *   HidEmbutido.paredes(estado)                        → as paredes do modelo (eixo, espessura, faixa de cota, drywall)
 *   HidEmbutido.paredeAtras(estado, p, n, opcoes)      → a parede atrás do ponto p no sentido n (a face, o eixo, a espessura)
 *   HidEmbutido.encaixe(esp, de, opcoes)               → onde o eixo do tubo fica na parede e se cabe (DE + cobrimento dos dois lados)
 *   HidEmbutido.enchimento(w, de, opcoes)              → a solução quando não cabe: enchimento de alvenaria (bloco de 9 cm) ou shaft
 *                                                         de drywall (face simples), com a espessura calculada e a composição SINAPI
 *   HidEmbutido.opsEnchimento(...)                     → as ops (parede + orçamento) do enchimento — o Corrigir do cartão
 *   HidEmbutido.classificar(estado, avaliarFam, op?)   → por trecho, onde ele corre: parede, piso, forro, volume, ligação ou AR
 *   HidEmbutido.aparentes(estado, avaliarFam, op?)     → os trechos com pedaço no AR (dentro do cômodo, fora de parede/piso/forro),
 *                                                         sem a opção "instalação aparente" — o achado do auditor
 *   HidEmbutido.correcaoEmbutir(estado, avaliarFam, t) → as ops que embutem aquele trecho (vertical: vai ao eixo da parede atrás)
 *   HidEmbutido.rasgos(estado, avaliarFam)             → o rasgo e o chumbamento de cada trecho embutido em alvenaria (orçamento)
 *   HidEmbutido.aparente(fi)                           → a opção do aparelho ("Instalacao_aparente" na instância: área técnica, reforma)
 *
 * ⚠ NÚMEROS. Nenhum valor de norma aqui: a NBR 8160/5626 não dão o cobrimento do tubo embutido (sem texto na biblioteca: pendência
 *   declarada no memorial "conferir"). O cobrimento é o do critério de projetista (js/hidcriterios.js GEO.cobrimentoParede, a mesma
 *   régua do alerta "Parede fina"); o eixo embutido é o do traçado (js/hidrota.js GEO.embutir); a procura da parede atrás, a do
 *   js/hidambiente.js (paredeAtrasMax). Os códigos SINAPI foram conferidos na base local data/sinapi-SP-2026-06.json (descrição
 *   inteira em SINAPI_EMB) — tools/test-hid-n23-embutido.js confere código, unidade e descrição na base.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function HR() { return dep("HidRota", "./hidrota.js"); }
  function HC() { return dep("HidCriterios", "./hidcriterios.js"); }
  function HK() { return dep("HidKit", "./hidkit.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  var EPS = 1e-6;              // hid:ok tolerância numérica
  var CASAS = 10000;           // hid:ok o biminst grava 4 casas (0,1 mm)
  function r4(v) { return Math.round(v * CASAS) / CASAS; }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  function fcm(v) { return String(Math.round(v * 100)); }
  function cmAcima(v) { return Math.ceil(v * 100 - EPS) / 100; }

  /* ⚠ GEOMETRIA E CRITÉRIO DE PROJETO (não é norma) — o que não vier de outro motor fica aqui, trocável em `opcoes` */
  var GEO = {
    amostra: 0.05,       // hid:ok passo da amostragem ao longo do tubo (m)
    tolFace: 0.005,      // hid:ok 5 mm: o eixo do tubo "na face" ainda conta como dentro da parede
    alcanceCasa: 15,     // hid:ok raio de procura das paredes em volta (o tubo está DENTRO da casa quando há parede em 3 dos 4 lados)
    ladosCasa: 3,        // hid:ok quantos dos 4 lados (±x, ±z) precisam de parede para o ponto estar dentro da casa
    tolPonto: 0.02,      // hid:ok 2 cm: a ponta do tubo no ponto de ligação do aparelho
    inclLigacao: 0.15,   // hid:ok |Δy|/L até isto = a ligação horizontal (o toco do sifão/engate até a parede)
    blocoEnchimento: 0.09,   // hid:ok o bloco cerâmico de vedação de 9 cm (o menor da SINAPI 103329) — o enchimento de alvenaria
    folgaEnchimento: 0.10,   // hid:ok o enchimento passa 10 cm de cada lado do aparelho e 10 cm acima do ponto mais alto
    cosTravessia: 0.70,      // hid:ok o tubo com mais de 70 % da direção na normal da parede ATRAVESSA (furo), não corre nela (rasgo)
    ligacaoEquip: 0.50,      // hid:ok a ligação do EQUIPAMENTO de parede (aquecedor, bomba): os tubos encadeados a partir do ponto dele até 50 cm (registro + flexível sob o aparelho) — aparente por natureza
    ligacaoCurta: 0.30,      // hid:ok o toco de até 30 cm no ponto de um aparelho/equipamento é a ligação dele (o engate, a entrada do aquecedor)
    cavidadeDrywall: 0.09    // hid:ok o montante de 90 mm (SINAPI 39423) — a maior cavidade do shaft de face simples
  };
  function g(op, k) {
    if (op && op[k] != null && isFinite(Number(op[k]))) return Number(op[k]);
    if (k === "cobrimento") { var C = HC(); return C && C.GEO && C.GEO.cobrimentoParede != null ? C.GEO.cobrimentoParede : 0.015; }   // hid:ok reserva = a do critério
    if (k === "embutir") { var R = HR(); return R && R.GEO && R.GEO.embutir != null ? R.GEO.embutir : 0.05; }   // hid:ok reserva = a do traçado
    if (k === "alcance") { var A = dep("HidAmbiente", "./hidambiente.js"); return A && A.GEO_AMB && A.GEO_AMB.paredeAtrasMax != null ? A.GEO_AMB.paredeAtrasMax : 0.60; }   // hid:ok reserva = a do ambiente
    if (k === "alturaForro") { var C2 = HC(); return C2 && C2.GEO && C2.GEO.alturaForro != null ? C2.GEO.alturaForro : 2.0; }   // hid:ok reserva = a do critério
    return GEO[k];
  }

  /* ------------------------------------------------------------ SINAPI (conferido na base local, 06/2026) */
  var SINAPI_EMB = {
    rasgo40: ["90443", "M", "RASGO LINEAR MANUAL EM ALVENARIA, PARA RAMAIS/ DISTRIBUIÇÃO DE INSTALAÇÕES HIDRÁULICAS, DIÂMETROS MENORES OU IGUAIS A 40 MM. AF_09/2023"],
    rasgo75: ["91222", "M", "RASGO LINEAR MANUAL EM ALVENARIA, PARA RAMAIS/ DISTRIBUIÇÃO DE INSTALAÇÕES HIDRÁULICAS, DIÂMETROS MAIORES QUE 40 MM E MENORES OU IGUAIS A 75 MM. AF_09/2023"],
    /* > 75 mm em alvenaria: a SINAPI 06/2026 não tem rasgo nem chumbamento — PROVISÓRIO pela de MAIOR custo entre as linhas de rasgo
       e de chumbamento linear para o diâmetro (base SP 06/2026: rasgo em contrapiso > 75 ≤ 100 R$ 33,23 × em concreto R$ 16,04;
       chumbamento em alvenaria até 75 R$ 32,14 × em contrapiso > 75 R$ 19,61) — regra RA: na dúvida, o preço mais alto; a observação
       vai junto no orçamento (revisão adversarial, 26/10/2026) */
    rasgo100: ["90446", "M", "RASGO LINEAR MECANIZADO EM CONTRAPISO, PARA RAMAIS/ DISTRIBUIÇÃO DE INSTALAÇÕES HIDRÁULICAS, DIÂMETROS MAIORES QUE 75 MM E MENORES OU IGUAIS A 100 MM. AF_09/2023_PS"],
    chumb40: ["90466", "M", "CHUMBAMENTO LINEAR EM ALVENARIA PARA RAMAIS/DISTRIBUIÇÃO DE INSTALAÇÕES HIDRÁULICAS COM DIÂMETROS MENORES OU IGUAIS A 40 MM. AF_09/2023"],
    chumb75: ["90467", "M", "CHUMBAMENTO LINEAR EM ALVENARIA PARA RAMAIS/DISTRIBUIÇÃO DE INSTALAÇÕES HIDRÁULICAS COM DIÂMETROS MAIORES QUE 40 MM E MENORES OU IGUAIS A 75 MM. AF_09/2023"],
    alvenaria9: ["103329", "M2", "ALVENARIA DE VEDAÇÃO DE BLOCOS CERÂMICOS FURADOS NA HORIZONTAL DE 9X19X19 CM (ESPESSURA 9 CM) E ARGAMASSA DE ASSENTAMENTO COM PREPARO MANUAL. AF_12/2021"],
    drywallFace: ["96370", "M2", "PAREDE COM SISTEMA EM CHAPAS DE GESSO PARA DRYWALL, USO INTERNO, COM UMA FACE SIMPLES E ESTRUTURA METÁLICA COM GUIAS SIMPLES, SEM VÃOS. AF_07/2023_PS"]
  };   // hid:ok códigos e descrições da SINAPI conferidos (fonte acima)
  var DN_RASGO = [40, 75, 100];   // hid:ok as faixas de diâmetro das composições (≤ 40, > 40 ≤ 75, > 75 ≤ 100 mm), da descrição da SINAPI
  function linhaSinapi(k, extra) { var s = SINAPI_EMB[k], o = { status: "ok", chave: "embutido|" + k, codigo: s[0], unidade: s[1], descricao: s[2], rotulo: s[2].split(",")[0].replace(/\. AF_.*$/, "").toLowerCase(), alternativas: 0 }; Object.keys(extra || {}).forEach(function (x) { o[x] = extra[x]; }); return o; }
  /* o rasgo e o chumbamento pelo DN do tubo (a SINAPI designa pelo diâmetro nominal) */
  function rasgoDe(dn) {
    var d = num(dn, 0);
    if (d <= DN_RASGO[0] + EPS) return [linhaSinapi("rasgo40"), linhaSinapi("chumb40")];
    if (d <= DN_RASGO[1] + EPS) return [linhaSinapi("rasgo75"), linhaSinapi("chumb75")];
    var obs = "PROVISÓRIO: a SINAPI 06/2026 não tem rasgo/chumbamento em alvenaria para DN " + d + " — adotada a de maior custo entre as linhas de rasgo/chumbamento desse diâmetro na base SP 06/2026 (conferir; troque por composição própria)";
    if (d <= DN_RASGO[2] + EPS) return [linhaSinapi("rasgo100", { provisorio: true, observacao: obs }), linhaSinapi("chumb75", { provisorio: true, observacao: obs })];
    return [{ status: "pendente", chave: "embutido|rasgo|" + d, rotulo: "Rasgo e chumbamento em alvenaria DN " + d, motivo: "DN " + d + " embutido em alvenaria: a SINAPI 06/2026 não tem composição acima de 100 mm (tubo desse DN vai em shaft, não em rasgo)" }];
  }

  /* ------------------------------------------------------------ PAREDES */
  function ehDrywall(c) {
    var tp = c && c.tipoParede, nuc = tp && arr(tp.camadas).filter(function (k) { return k && k.face === "nucleo"; })[0];
    return !!(c && c.drywall) || /drywall|gesso acartonado|steel ?frame/i.test(txt(tp && tp.rotulo) + " " + txt(nuc && (nuc.material + " " + nuc.rotulo)));
  }
  function paredes(estado) {
    return arr(estado && estado.caixas).filter(function (c) { return c && c.tipo === "parede"; }).map(function (c) {
      var cs = Math.cos(num(c.rotY, 0)), sn = Math.sin(num(c.rotY, 0)), h = num(c.comprimento, 0) / 2, alt = num(c.altura, 0);
      var p1 = { x: num(c.cx, 0) - h * cs, z: num(c.cz, 0) + h * sn }, p2 = { x: num(c.cx, 0) + h * cs, z: num(c.cz, 0) - h * sn };
      var L = 2 * h; if (!(L > EPS)) return null;
      return { id: String(c.id), p1: p1, p2: p2, u: { x: (p2.x - p1.x) / L, z: (p2.z - p1.z) / L }, L: L, esp: num(c.espessura, 0), hw: num(c.espessura, 0) / 2,
               base: num(c.cy, 0) - alt / 2, topo: num(c.cy, 0) + alt / 2, drywall: ehDrywall(c), enchimento: !!c.enchimento };
    }).filter(Boolean);
  }
  /* o ponto em coordenadas da parede: s ao longo do eixo (0..L), v perpendicular (com sinal) */
  function local(w, p) { var dx = p.x - w.p1.x, dz = p.z - w.p1.z; return { s: dx * w.u.x + dz * w.u.z, v: -dx * w.u.z + dz * w.u.x }; }
  function dentroDe(w, p, folga) { var l = local(w, p); return l.s >= -EPS && l.s <= w.L + EPS && Math.abs(l.v) <= w.hw + num(folga, 0) + EPS && p.y >= w.base - EPS && p.y <= w.topo + EPS; }
  /* a PAREDE ATRÁS do ponto p no sentido n (normal horizontal que entra na parede): a face mais perto à frente, até o alcance, numa
     parede de frente para n (cos ≥ 0,9) que tem a cota do ponto. → { w, face (m do ponto até a face), eixo (até o eixo), esp } | null */
  function paredeAtras(estado, p, n, opcoes) {
    opcoes = opcoes || {};
    var nx = num(n && n.x, 0), nz = num(n && n.z, 0), Ln = Math.sqrt(nx * nx + nz * nz); if (!(Ln > EPS)) return null;
    nx /= Ln; nz /= Ln;
    var alc = g(opcoes, "alcance"), melhor = null, Ws = opcoes.paredes || paredes(estado), y = num(p.y, 0);
    Ws.forEach(function (w) {
      if (y < w.base - EPS || y > w.topo + EPS) return;
      var nw = { x: -w.u.z, z: w.u.x }, dn = nx * nw.x + nz * nw.z; if (Math.abs(dn) < 0.9) return;   // hid:ok a parede de frente para a normal (cos ≥ 0,9)
      var l = local(w, p), t = -l.v / dn, face = t - w.hw / Math.abs(dn);   /* t: até o eixo da parede pelo raio */
      if (face < -w.hw - EPS || t < -EPS || face > alc + EPS) return;   /* parede atrás de quem está à frente, ou longe demais */
      var sAt = l.s + t * (nx * w.u.x + nz * w.u.z); if (sAt < -EPS || sAt > w.L + EPS) return;   /* o raio passa fora do vão dela */
      var f0 = Math.max(0, face);
      if (!melhor || f0 < melhor.face - EPS) melhor = { w: w, face: r4(f0), eixo: r4(Math.max(0, t)), esp: w.esp, n: { x: r4(nx), z: r4(nz) } };
    });
    /* o ENCHIMENTO já lançado na face (revisão 26/10): a espessura que recebe o tubo é a dele + a da parede encostada atrás */
    if (melhor && melhor.w.enchimento && !opcoes._semSoma) {
      var tras = { x: p.x + nx * (melhor.face + melhor.esp + 0.005), y: y, z: p.z + nz * (melhor.face + melhor.esp + 0.005) };   // hid:ok 5 mm além da face de trás do enchimento
      var W2 = paredeAtras(estado, tras, { x: nx, z: nz }, { paredes: Ws, alcance: 0.01, _semSoma: true });   // hid:ok encostada (1 cm)
      if (W2 && W2.w.id !== melhor.w.id) melhor.esp = r4(melhor.esp + W2.esp + W2.face);
    }
    return melhor;
  }
  /* ONDE O EIXO DO TUBO FICA NA PAREDE (da face): o eixo embutido do traçado, mas nunca com menos que o cobrimento + o raio de
     cada lado. Cabe = a espessura comporta DE + cobrimento × 2 (a mesma régua do alerta "Parede fina" do critério de projetista). */
  function encaixe(esp, de, opcoes) {
    var c = g(opcoes, "cobrimento"), e = g(opcoes, "embutir"), r = num(de, 0) / 2, E = num(esp, 0), precisa = r4(2 * r + 2 * c);
    var cabe = E + EPS >= precisa, prof = cabe ? Math.min(Math.max(e, c + r), E - c - r) : E / 2;
    return { cabe: cabe, profundidade: r4(prof), precisa: precisa, esp: r4(E), falta: cabe ? 0 : r4(cmAcima(precisa - E)), cobrimento: c };
  }
  /* A SOLUÇÃO QUANDO NÃO CABE: até 9 cm a mais, enchimento de alvenaria com o bloco cerâmico de 9 cm na face da parede (SINAPI
     103329); acima, shaft de drywall de face simples (SINAPI 96370) com a cavidade que o tubo pede (montante até 90 mm). */
  function enchimento(w, de, opcoes) {
    var E = encaixe(w ? w.esp : 0, de, opcoes); if (E.cabe) return { precisa: false, encaixe: E };
    /* shaft: a cavidade é a que falta (o montante de 90 mm cobre até 9 cm; acima, o shaft cresce — conferir o montante) */
    var Y = E.falta, alv = Y <= g(opcoes, "blocoEnchimento") + EPS, esp = alv ? g(opcoes, "blocoEnchimento") : Y;
    var s = alv ? SINAPI_EMB.alvenaria9 : SINAPI_EMB.drywallFace;
    return { precisa: true, encaixe: E, falta: Y, espessura: r4(esp), solucao: alv ? "enchimento" : "shaft",
             rotulo: alv ? "enchimento de alvenaria (bloco cerâmico de 9 cm)" : "shaft de drywall (face simples)", sinapi: { codigo: s[0], unidade: s[1], descricao: s[2] } };
  }
  /* as ops do enchimento: a parede nova encostada na face (de `a` a `b`, em planta, já na face), da base até `topo`, com o
     orçamento (op "orcar" — a área da face pela composição da solução). `marcas` = as marcas do projeto inteligente (amb/ambParte) */
  function opsEnchimento(id, w, faceA, faceB, n, base, topo, sol, marcas) {
    var BE = dep("BimEdit", "./bimedit.js"); if (!BE || !BE.parede || !sol || !sol.precisa) return [];
    var e = sol.espessura, nx = num(n.x, 0), nz = num(n.z, 0);
    /* o eixo do enchimento: meia espessura para FORA da face (contra a normal que entra na parede) */
    var a = { x: r4(faceA.x - nx * e / 2), z: r4(faceA.z - nz * e / 2) }, b = { x: r4(faceB.x - nx * e / 2), z: r4(faceB.z - nz * e / 2) };
    var cx = BE.parede(a, b, e, r4(topo - base), base); if (!cx) return [];
    cx.enchimento = { de: w ? w.id : null, solucao: sol.solucao, falta: sol.falta };
    /* o shaft de drywall: a face da frente + os dois retornos laterais (a espessura × a altura de cada lado); o enchimento de alvenaria: a face */
    var Lf = Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.z - a.z, 2)), fator = sol.solucao === "shaft" && Lf > EPS ? r4((Lf + 2 * e) / Lf) : 1;
    if (sol.solucao === "shaft") cx.drywall = true;
    var o1 = { op: "criar", id: id, caixa: cx }, o2 = { op: "orcar", id: id, servicos: [{ codigo: sol.sinapi.codigo, medida: "area", fator: fator, rotulo: (sol.solucao === "shaft" ? "Shaft de drywall" : "Enchimento hidráulico") + " (" + fcm(e) + " cm)" }] };
    Object.keys(marcas || {}).forEach(function (k) { o1[k] = marcas[k]; o2[k] = marcas[k]; });
    return [o1, o2];
  }

  /* ------------------------------------------------------------ A OPÇÃO "INSTALAÇÃO APARENTE" */
  /* Por APARELHO (o parâmetro da instância — o "Instalação aparente" do painel do aparelho; o do ambiente marca todos os dele): o
     traçado não embute os pontos dele e os tubos que saem dele levam a marca `aparente` (o auditor não acusa). */
  var CHAVE_APARENTE = "Instalacao_aparente";
  function aparente(fi) { var v = fi && fi.inst ? fi.inst[CHAVE_APARENTE] : null; return v === true || v === 1 || v === "1" || v === "sim"; }

  /* ------------------------------------------------------------ CLASSIFICAR (onde cada pedaço do tubo corre) */
  var SISTEMAS_EMB = { esgoto: 1, ventilacao: 1, agua_fria: 1, agua_quente: 1 };
  function contexto(estado, avaliarFam, opcoes) {
    var B = BI(), Ws = paredes(estado), vols = [], pts = [];
    try { vols = B && B.volumesFamilias ? B.volumesFamilias(estado, avaliarFam) : []; } catch (e) { vols = []; }
    try { if (B && typeof avaliarFam === "function") B.conectoresDoEstado(estado, avaliarFam).forEach(function (k) { pts.push({ x: k.x, y: k.y, z: k.z, famInst: String(k.famInst), sistema: k.sistema }); }); } catch (e2) {}
    var famPor = {}; arr(estado && estado.familias).forEach(function (f) { famPor[String(f.id)] = f; });
    /* as peças do kit (válvula, torneira) também são pontos do aparelho */
    var lajes = []; try { var O = HR() && HR().obstaculosDoBim ? HR().obstaculosDoBim(estado, avaliarFam) : null; lajes = O ? arr(O.lajes) : []; } catch (e3) {}
    return { Ws: Ws, vols: vols, pts: pts, famPor: famPor, lajes: lajes, opcoes: opcoes || {} };
  }
  function noVolume(v, p, r) {
    var dx = p.x - num(v.cx, 0), dz = p.z - num(v.cz, 0), u = dx * num(v.ux, 1) + dz * num(v.uz, 0), w = -dx * num(v.uz, 0) + dz * num(v.ux, 1);
    return Math.abs(u) <= num(v.hl, 0) - r + EPS && Math.abs(w) <= num(v.hw, 0) - r + EPS && p.y >= num(v.y0, 0) + r - EPS && p.y <= num(v.y1, 0) - r + EPS;
  }
  /* o ponto está DENTRO da casa: parede (na cota dele) em 3 dos 4 lados; devolve o piso do pavimento = a base mais alta das que cercam */
  function cercado(C, p) {
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]], lados = 0, piso = -Infinity, alc = g(C.opcoes, "alcanceCasa");
    dirs.forEach(function (d) {
      var melhor = null;
      C.Ws.forEach(function (w) {
        if (p.y < w.base - EPS || p.y > w.topo + EPS) return;
        var ex = w.p2.x - w.p1.x, ez = w.p2.z - w.p1.z, den = d[0] * ez - d[1] * ex; if (Math.abs(den) < EPS) return;
        var qx = w.p1.x - p.x, qz = w.p1.z - p.z, t = (qx * ez - qz * ex) / den, s = (qx * d[1] - qz * d[0]) / den;
        if (t < -EPS || t > alc || s < -EPS || s > 1 + EPS) return;
        if (!melhor || t < melhor.t) melhor = { t: t, w: w };
      });
      if (melhor) { lados++; piso = Math.max(piso, melhor.w.base); }
    });
    return { dentro: lados >= g(C.opcoes, "ladosCasa"), piso: piso };
  }
  function pontoDeAparelho(C, q) { return C.pts.filter(function (k) { return Math.abs(k.x - q.x) <= g(C.opcoes, "tolPonto") && Math.abs(k.z - q.z) <= g(C.opcoes, "tolPonto") && Math.abs(k.y - q.y) <= g(C.opcoes, "tolPonto"); })[0] || null; }
  function deTubo(t) {
    var Gm = dep("HidGeo", "./biminstgeo.js");
    try { var c = Gm && Gm.cotasTubo ? Gm.cotasTubo(t.material, t.dn) : null; if (c && c.de > 0) return c.de / 1000; } catch (e) {}
    return num(t.dn, 0) / 1000;
  }
  /* um trecho → { id, sistema, dn, L, partes: { parede, piso, forro, volume, ligacao, fora, ar }, ar: [pontos], paredes: { id: m }, aparente } */
  function classificarTrecho(C, t) {
    var p1 = t.p1, p2 = t.p2, dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z, L = Math.sqrt(dx * dx + dy * dy + dz * dz), Lh = Math.sqrt(dx * dx + dz * dz);
    var out = { id: String(t.id), sistema: t.sistema, dn: t.dn, material: t.material, L: r4(L), partes: { parede: 0, piso: 0, forro: 0, volume: 0, ligacao: 0, fora: 0, ar: 0 }, ar: [], paredes: {}, alvenaria: {}, aparente: t.aparente === true };
    if (!(L > EPS)) return out;
    var r = deTubo(t) / 2, N = Math.max(1, Math.ceil(L / g(C.opcoes, "amostra"))), dL = L / N;
    /* a LIGAÇÃO do aparelho (o toco do sifão/engate da louça até a parede): horizontal, com uma ponta no ponto de um aparelho */
    var noPonto = pontoDeAparelho(C, p1) || pontoDeAparelho(C, p2);
    var ligacao = !!noPonto && ((Lh > EPS && Math.abs(dy) <= g(C.opcoes, "inclLigacao") * Lh + EPS && Lh <= g(C.opcoes, "alcance") + 0.30) ||   // hid:ok + a espessura de uma parede (30 cm) além do alcance
      L <= g(C.opcoes, "ligacaoCurta"));   /* o toco curto no ponto do equipamento (a entrada do aquecedor de parede, o engate) */
    for (var i = 0; i < N; i++) {
      var s = (i + 0.5) / N, p = { x: p1.x + dx * s, y: p1.y + dy * s, z: p1.z + dz * s }, onde = null;   // hid:ok o meio de cada passo da amostra
      var w = C.Ws.filter(function (x) { return dentroDe(x, p, g(C.opcoes, "tolFace")); })[0];
      if (w) {
        onde = "parede"; out.paredes[w.id] = r4((out.paredes[w.id] || 0) + dL);
        /* o rasgo é do que CORRE dentro da parede (vertical, ou ao longo da face); o que só a atravessa (o toco do ponto até o eixo, o
           ramal que passa de um cômodo ao outro) é furo/passagem — a componente do tubo na normal da parede manda (revisão 26/10) */
        var atravessa = L > EPS && Math.abs((dx * -w.u.z + dz * w.u.x) / L) > g(C.opcoes, "cosTravessia");
        if (!w.drywall && !atravessa) out.alvenaria[w.id] = r4((out.alvenaria[w.id] || 0) + dL);
      }
      else if (C.vols.some(function (v) { return noVolume(v, p, 0); })) onde = "volume";
      else if (ligacao) onde = "ligacao";
      else {
        var cc = cercado(C, p);
        if (!cc.dentro) onde = p.y < 0 ? "piso" : "fora";
        else if (p.y + r <= cc.piso + EPS) onde = "piso";
        else if (p.y - r >= cc.piso + g(C.opcoes, "alturaForro") - EPS) onde = "forro";
        else if (C.lajes.some(function (l) { var tp = num(l.topo, NaN), e = num(l.espessura, 0); return isFinite(tp) && p.x >= Math.min(l.x0, l.x1) - EPS && p.x <= Math.max(l.x0, l.x1) + EPS && p.z >= Math.min(l.z0, l.z1) - EPS && p.z <= Math.max(l.z0, l.z1) + EPS && p.y <= tp + EPS && p.y >= tp - e - EPS; })) onde = "piso";   /* dentro da laje (rebaixo/enchimento) */
        else onde = "ar";
      }
      out.partes[onde] = r4(out.partes[onde] + dL);
      if (onde === "ar") out.ar.push({ x: r4(p.x), y: r4(p.y), z: r4(p.z) });
    }
    return out;
  }
  function trechosDe(estado, opcoes) {
    var ids = opcoes && opcoes.ids ? {} : null; if (ids) arr(opcoes.ids).forEach(function (id) { ids[String(id)] = 1; });
    return arr(estado && estado.instalacoes && estado.instalacoes.trechos).filter(function (t) { return t && t.p1 && t.p2 && (!ids || ids[String(t.id)]); });
  }
  function classificar(estado, avaliarFam, opcoes) {
    var C = contexto(estado, avaliarFam, opcoes);
    return trechosDe(estado, opcoes).map(function (t) { return classificarTrecho(C, t); });
  }
  /* OS APARENTES SEM MOTIVO: sistemas de água e esgoto, pedaço no AR maior que a amostra, sem a marca `aparente` (a opção do
     aparelho/ambiente) — cada um com o ponto do meio do pedaço no ar e a correção (embutir o vertical; o resto pelo Traçar) */
  /* a LIGAÇÃO DO EQUIPAMENTO (categoria "equipamento" do catálogo: o aquecedor de parede, a bomba): os trechos encadeados a partir do
     ponto dele, do mesmo sistema, até ligacaoEquip de comprimento somado — o registro e o flexível sob o aparelho ficam à vista na obra */
  function ligacoesEquip(C, trs) {
    var HF = dep("HidFamilias", "./hidfamilias.js"), lim = g(C.opcoes, "ligacaoEquip"), tol = g(C.opcoes, "tolPonto"), out = {};
    function perto(a, b) { return Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.z - b.z) <= tol; }
    function Lt(t) { return Math.sqrt(Math.pow(t.p2.x - t.p1.x, 2) + Math.pow(t.p2.y - t.p1.y, 2) + Math.pow(t.p2.z - t.p1.z, 2)); }
    C.pts.forEach(function (k) {
      var fi = C.famPor[k.famInst], F = fi && HF && HF.porId ? HF.porId(fi.famId) : null; if (!F || F.categoria !== "equipamento") return;
      var fila = [{ p: k, L: 0 }], vistos = {};
      while (fila.length) {
        var q = fila.shift();
        trs.forEach(function (t) {
          if (vistos[t.id] || t.sistema !== k.sistema) return;
          var lado = perto(t.p1, q.p) ? t.p2 : (perto(t.p2, q.p) ? t.p1 : null); if (!lado) return;
          var L = q.L + Lt(t); if (L > lim + EPS) return;
          vistos[t.id] = 1; out[String(t.id)] = 1; fila.push({ p: lado, L: L });
          /* o registro posto no trecho o divide em "X" e "Xb" (o corpo do registro entre os dois): a ligação segue pela outra metade */
          var par2 = /b$/.test(String(t.id)) ? String(t.id).slice(0, -1) : String(t.id) + "b", tb = trs.filter(function (x) { return String(x.id) === par2; })[0];
          if (tb && !vistos[tb.id]) { var Lb2 = L + Lt(tb); if (Lb2 <= lim + EPS) { vistos[tb.id] = 1; out[String(tb.id)] = 1; [tb.p1, tb.p2].forEach(function (pp) { fila.push({ p: pp, L: Lb2 }); }); } }
        });
      }
    });
    return out;
  }
  function aparentes(estado, avaliarFam, opcoes) {
    var C = contexto(estado, avaliarFam, opcoes), out = [];
    var apar = {}; arr(estado && estado.familias).forEach(function (f) { if (aparente(f)) apar[String(f.id)] = 1; });
    var equip = ligacoesEquip(C, trechosDe(estado, {}));
    trechosDe(estado, opcoes).forEach(function (t) {
      if (!SISTEMAS_EMB[t.sistema] || t.aparente === true || equip[String(t.id)]) return;
      /* o tubo que sai de um aparelho com a opção aparente */
      if ([t.p1, t.p2].some(function (q) { var k = pontoDeAparelho(C, q); return k && apar[k.famInst]; })) return;
      var c = classificarTrecho(C, t);
      if (!(c.partes.ar > g(C.opcoes, "amostra") + EPS)) return;
      var meio = c.ar[Math.floor(c.ar.length / 2)];
      out.push({ id: c.id, sistema: c.sistema, dn: c.dn, comprimento: c.partes.ar, L: c.L, ponto: meio, vertical: Math.abs(t.p2.y - t.p1.y) >= 0.95 * c.L });   // hid:ok |Δy| ≥ 0,95 L = vertical
    });
    return out;
  }

  /* ------------------------------------------------------------ O CORRIGIR (embutir aquele trecho) */
  /* O VERTICAL NO AR: vai para o eixo embutido da parede mais perto (a procura em volta, até o alcance), com um toco horizontal em cada
     ponta até onde ele estava (as pontas e o que liga nelas ficam). Esgoto: os tocos com a declividade mínima do DN (o de cima desce
     para a parede, o de baixo desce para fora). O que não é vertical (ou sem parede perto) não se corrige aqui: volta null + o motivo. */
  function correcaoEmbutir(estado, avaliarFam, t, opcoes) {
    opcoes = opcoes || {};
    var B = BI(); if (!t || !t.p1 || !t.p2) return { ok: false, motivo: "trecho não encontrado" };
    var L = Math.sqrt(Math.pow(t.p2.x - t.p1.x, 2) + Math.pow(t.p2.y - t.p1.y, 2) + Math.pow(t.p2.z - t.p1.z, 2));
    if (t.sistema === "ventilacao") return { ok: false, motivo: "a ventilação " + t.id + " sobe no ar: refaça pelo Traçar automaticamente (o ramal de ventilação tem o aclive da NBR 8160, não a descida do esgoto)" };
    if (!(Math.abs(t.p2.y - t.p1.y) >= 0.95 * L)) return { ok: false, motivo: "o trecho " + t.id + " não é vertical: refaça pelo Traçar automaticamente (o traçado do aparelho é refeito embutido)" };   // hid:ok vertical
    var Ws = paredes(estado), cima = t.p1.y >= t.p2.y ? t.p1 : t.p2, baixo = cima === t.p1 ? t.p2 : t.p1, meio = { x: (t.p1.x + t.p2.x) / 2, y: (t.p1.y + t.p2.y) / 2, z: (t.p1.z + t.p2.z) / 2 };
    var melhor = null;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].concat(Ws.map(function (w) { return [-w.u.z, w.u.x]; }), Ws.map(function (w) { return [w.u.z, -w.u.x]; })).forEach(function (d) {
      var P = paredeAtras(estado, meio, { x: d[0], z: d[1] }, { paredes: Ws, alcance: g(opcoes, "alcance") });
      if (P && (!melhor || P.face < melhor.face)) melhor = P;
    });
    if (!melhor) return { ok: false, motivo: "nenhuma parede a até " + fcm(g(opcoes, "alcance")) + " cm do trecho " + t.id + ": leve o tubo à parede (ou faça um shaft) e trace de novo" };
    var de = deTubo(t), E = encaixe(melhor.esp, de, opcoes), prof = melhor.face + E.profundidade;
    var ax = r4(meio.x + melhor.n.x * prof), az = r4(meio.z + melhor.n.z * prof), i = t.sistema === "esgoto" && B && B.declMinDn ? B.declMinDn("esgoto", t.dn) / 100 : 0;
    var yTop = Math.floor((cima.y - i * prof) * CASAS - EPS) / CASAS, yBot = Math.ceil((baixo.y + i * prof) * CASAS + EPS) / CASAS;
    if (!(yTop > yBot + EPS)) return { ok: false, motivo: "o trecho " + t.id + " é curto demais para ir à parede com a declividade" };
    var base = null; (function rec(Lo) { arr(Lo).forEach(function (o) { if (!o) return; if (o.op === "lote") rec(o.ops); else if (o.op === "trecho" && String(o.id) === String(t.id)) base = o; }); })(opcoes.ops);
    function op(id, a, b, eh) {
      var o = base ? JSON.parse(JSON.stringify(base)) : (B && B.opDoTrecho ? B.opDoTrecho(t) : { op: "trecho", sistema: t.sistema, material: t.material, dn: t.dn });
      ["kit", "kitParte", "kitAss", "kitTipo", "amb", "ambInfo", "passantes"].forEach(function (k) { delete o[k]; });
      if (!eh) delete o.continua;
      o.op = "trecho"; o.id = id; o.p1 = { x: r4(a.x), y: r4(a.y), z: r4(a.z) }; o.p2 = { x: r4(b.x), y: r4(b.y), z: r4(b.z) }; return o;
    }
    var A1 = { x: ax, y: yTop, z: az }, A2 = { x: ax, y: yBot, z: az }, desceP1 = t.p1 === cima, ops;
    /* o sentido do desenho é o do trecho original (p1 → p2): o escoamento do esgoto e o da água seguem os mesmos */
    if (desceP1) ops = [op(t.id + "-e1", cima, A1), op(t.id, A1, A2, true), op(t.id + "-e2", A2, baixo)];
    else ops = [op(t.id + "-e1", baixo, A2), op(t.id, A2, A1, true), op(t.id + "-e2", A1, cima)];
    var cont = base && base.continua; if (cont) { ops[1].continua = undefined; delete ops[1].continua; if (cont === "p1" || cont === "ambos") ops[0].continua = "p1"; if (cont === "p2" || cont === "ambos") ops[2].continua = "p2"; }
    return { ok: true, ops: ops, parede: melhor.w.id, texto: "o trecho " + t.id + " (" + fcm(L) + " cm) vai para dentro da parede " + melhor.w.id + " (eixo a " + fcm(E.profundidade) + " cm da face), com um toco em cada ponta até onde ele ligava" + (E.cabe ? "" : " — a parede tem " + fcm(melhor.esp) + " cm e o tubo pede " + fcm(E.precisa) + ": veja o enchimento") };
  }

  /* ------------------------------------------------------------ ORÇAMENTO: rasgo + chumbamento do trecho embutido em ALVENARIA */
  function rasgos(estado, avaliarFam) {
    var C = contexto(estado, avaliarFam, {}), out = [];
    trechosDe(estado, {}).forEach(function (t) {
      if (!SISTEMAS_EMB[t.sistema] && t.sistema !== "pluvial") return;
      var c = classificarTrecho(C, t), m = 0;
      Object.keys(c.alvenaria).forEach(function (k) {
        var w = C.Ws.filter(function (x) { return x.id === k; })[0];
        /* o enchimento hidráulico é levantado em volta do tubo (não se rasga) */
        if (w && w.enchimento) return;
        m += c.alvenaria[k];
      });
      if (!(m > g({}, "amostra") + EPS)) return;   /* menos que uma amostra: arredondamento (a travessia já ficou de fora acima) */
      out.push({ id: c.id, sistema: t.sistema, material: t.material, dn: t.dn, metros: r4(m), linhas: rasgoDe(t.dn) });
    });
    return out;
  }

  var HidEmbutido = {
    VERSAO: 1, GEO: GEO, SINAPI: SINAPI_EMB, CHAVE_APARENTE: CHAVE_APARENTE,
    paredes: paredes, paredeAtras: paredeAtras, encaixe: encaixe, enchimento: enchimento, opsEnchimento: opsEnchimento,
    classificar: classificar, aparentes: aparentes, correcaoEmbutir: correcaoEmbutir, rasgos: rasgos, rasgoDe: rasgoDe, aparente: aparente,
    _int: { cercado: cercado, contexto: contexto, classificarTrecho: classificarTrecho, local: local, g: g }
  };
  global.HidEmbutido = HidEmbutido;
  if (typeof module !== "undefined" && module.exports) module.exports = HidEmbutido;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
