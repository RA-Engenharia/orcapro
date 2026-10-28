/* =====================================================================
 * biminstcolocar.js — COLOCAÇÃO DE PEÇAS no BIM de instalações (18/10/2026).
 *
 * Pedido do Rogério:
 *  1) "O modo mais fácil possível de colocar conexões em tubos que já estão no projeto. Quero colocar um registro de
 *     gaveta: aponto o cursor em cima do tubo e ele já identifica, acha certinho e coloca."
 *  2) "Sempre que eu clicar numa peça e apertar Espaço, ele rotaciona a peça. Serve para caixa sifonada, vaso etc."
 *  3) "Quando eu estiver colocando a peça, no 3D ou na planta, antes de clicar, com o mouse andando, ele já mostra a
 *     volumetria da peça, para eu posicionar certinho. Hoje só depois que eu clico ela aparece."
 *
 * O QUE FAZ
 *  · PRÉVIA ("fantasma"): com a ferramenta de família (louça, equipamento, família importada, seletor de tipos), de peça
 *    (caixa sifonada, ralo, caixa) ou de acessório/conexão no tubo armada, a MESMA malha da peça, translúcida, segue o
 *    cursor no 3D; na planta e no corte, o contorno dela. Encaixes: a louça encosta na FACE da parede pelo lado do
 *    cursor (de costas para a parede — Z local para fora, a convenção do js/familia.js); a caixa e o ralo vão para o
 *    PISO ACABADO pela regra do nível automático (js/hidnivel.js, HidNivel.em — se carregado); o acessório vai para o
 *    EIXO do tubo. Cota temporária do eixo da peça até a parede mais próxima. O clique confirma; Esc cancela.
 *  · INSERIR NO TUBO: acessório (registro de gaveta, de pressão, de esfera, válvula de retenção — op `acessorio`, que
 *    divide o tubo) ou conexão (luva, redução, tê, junção — o tubo é DIVIDIDO no ponto e a conexão sai da rede, como em
 *    qualquer nó; o tê/junção ganha um RAMAL na direção do cursor). O tubo sob o cursor é realçado; a prévia se alinha
 *    ao eixo no DN do tubo; a ficha da peça (js/hidpecas.js) é procurada nesse DN — sem ficha, o tipo que tem e o aviso.
 *    União e tê de inspeção NÃO estão no catálogo de conexões do motor: a ferramenta diz "pendente" e não inventa peça.
 *  · ESPAÇO GIRA: durante a colocação gira a prévia 90° (Shift+Espaço, no sentido contrário); no tubo, gira em torno do
 *    EIXO do tubo (o volante do registro para o lado/para cima; o ramal do tê para o lado/para cima). Com UMA peça
 *    colocada e selecionada (sem ferramenta), Espaço a gira no lugar: louça/equipamento 90° (a louça ENCOSTADA na parede
 *    passa para o outro lado dela), caixa/ralo 90°, acessório em torno do tubo. Os tubos que chegavam nos pontos de
 *    ligação da família vão junto (a ponta acompanha o ponto); o kit do aparelho se refaz sozinho (js/hidkitui.js lê a
 *    pose). Uma op (ou um lote) por giro: UM Ctrl+Z desfaz.
 *
 * PURO (Node, tools/test-hid-colocar.js): tuboSob, inserir, girar, poseFamilia, cotaParede, frenteAcessorio.
 * TELA: montar3d (gancho do js/bim.js: S._colocar), a planta/corte (embrulha BimPlantaModelar.mover2d) e os cliques
 *   (embrulha BimInstUI.clique/cliqueAcessorio e a Propriedades do acessório). Ganchos pequenos no js/bim.js
 *   (pointermove, fantasma e clique da família) e no js/biminstui.js (o volante gira com o `giro` do acessório).
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(n, arq) { if (global[n]) return global[n]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function HP() { return dep("HidPecas", "./hidpecas.js"); }
  function HN() { return global.HidNivel || null; }
  function B() { return global.BIM || null; }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function fmt(v, c) { var p = Math.pow(10, c == null ? 2 : c); return (Math.round(v * p) / p).toFixed(c == null ? 2 : c).replace(".", ","); }
  function un3(v) { var L = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1; return { x: v.x / L, y: v.y / L, z: v.z / L }; }
  function dot3(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function cross3(a, b) { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
  function add3(a, b, s) { return { x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s }; }
  var TAU = Math.PI * 2;
  function normAng(a) { a = a % TAU; if (a < 0) a += TAU; return r4(a > TAU - 1e-4 ? 0 : a); }
  /* gira v em torno do eixo unitário k por th (Rodrigues) */
  function girarEm(v, k, th) {
    var c = Math.cos(th), s = Math.sin(th), kv = cross3(k, v), kd = dot3(k, v);
    return { x: v.x * c + kv.x * s + k.x * kd * (1 - c), y: v.y * c + kv.y * s + k.y * kd * (1 - c), z: v.z * c + kv.z * s + k.z * kd * (1 - c) };
  }

  /* folgas de TELA e de desenho (não é norma) */
  var GEO = {
    pxTubo: 10,          // hid:ok até isto (px) do eixo do tubo na tela, o cursor "está no tubo"
    encaixeParede: 0.80, // hid:ok a louça encosta na parede quando o cursor está a menos disto da face
    encostada: 0.03,     // hid:ok a louça já colocada está "encostada" quando a face de trás está a menos disto da face da parede
    cotaMax: 4.0,        // hid:ok a cota temporária procura parede até esta distância
    ramal: 0.30,         // hid:ok comprimento do ramal que nasce do tê/junção inserido (estica-se depois com a ferramenta Tubo)
    margemPonta: 0.05    // hid:ok a conexão não entra a menos disto das pontas do tubo
  };

  /* ================================================================ PURO */
  /* o que entra no tubo além dos acessórios do motor (BimInst.ACESSORIOS): as conexões que a REDE já sabe fazer num nó */
  var CONEXOES = {
    "cx:luva":        { tipo: "luva", nome: "Luva" },
    "cx:reducao":     { tipo: "reducao", nome: "Redução" },
    "cx:te":          { tipo: "te", nome: "Tê", ramal: 90 },
    "cx:juncao":      { tipo: "juncao", nome: "Junção", ramal: 45, so: ["esgoto", "pluvial", "ventilacao"] },
    /* PENDÊNCIAS FINAIS (18/10/2026): a UNIÃO (água) e o TÊ DE INSPEÇÃO (esgoto/pluvial/ventilação) são peças em linha do motor
       (BimInst.PECAS_LINHA): o tubo se divide e o nó do meio vira a peça (pecaFim no trecho de montante) — ficha, geometria e SINAPI */
    "cx:uniao":       { tipo: "uniao", nome: "União", so: ["agua_fria", "agua_quente"], pecaLinha: "uniao" },
    "cx:te_inspecao": { tipo: "te_inspecao", nome: "Tê de inspeção", so: ["esgoto", "pluvial", "ventilacao"], pecaLinha: "te_inspecao" }
  };
  var ORDEM_INLINE = ["ra-registro-gaveta", "ra-registro-pressao", "ra-registro-esfera", "ra-valvula-retencao", "cx:luva", "cx:reducao", "cx:te", "cx:juncao", "cx:uniao", "cx:te_inspecao"];
  function oQue(famId) { var I = BI(); if (I && I.ACESSORIO_DA_FAM && I.ACESSORIO_DA_FAM[famId]) return "acessorio"; if (CONEXOES[famId]) return "conexao"; return null; }
  function nomeInline(famId) { var I = BI(); if (oQue(famId) === "acessorio") return I.ACESSORIOS[I.ACESSORIO_DA_FAM[famId]].nome; return CONEXOES[famId] ? CONEXOES[famId].nome : famId; }

  /* a lista de ops achatada (lotes abertos) e os ids já usados (estado + ops) */
  function achatar(ops) { var out = []; (function rec(l) { arr(l).forEach(function (o) { if (!o) return; if (o.op === "lote") rec(o.ops); else out.push(o); }); })(ops); return out; }
  function idsUsados(estado, ops) {
    var u = {}, ins = (estado && estado.instalacoes) || {};
    arr(ins.trechos).concat(arr(ins.pecas), arr(ins.acessorios), arr(estado && estado.familias)).forEach(function (x) { if (x && x.id != null) u[String(x.id)] = 1; });
    (function rec(l) { arr(l).forEach(function (o) { if (!o) return; if (o.id != null) u[String(o.id)] = 1; if (o.novoId != null) u[String(o.novoId)] = 1; if (o.op === "lote") rec(o.ops); }); })(ops);
    return u;
  }
  function novoId(pref, usados) { for (var i = 1; i < 100000; i++) { var id = pref + i; if (!usados[id]) { usados[id] = 1; return id; } } return pref + Date.now(); }
  /* as MARCAS da op original do trecho (kit, amb, rede, kitParte…): o trecho regravado continua sendo do mesmo dono */
  var CAMPOS_GEO = { op: 1, id: 1, p1: 1, p2: 1, sistema: 1, material: 1, dn: 1, continua: 1 };
  function marcasDe(ops, id) {
    var o = null; achatar(ops).forEach(function (x) { if (x.op === "trecho" && String(x.id) === String(id)) o = x; });
    var m = {}; if (o) Object.keys(o).forEach(function (k) { if (!CAMPOS_GEO[k] && o[k] !== undefined) m[k] = JSON.parse(JSON.stringify(o[k])); });
    return m;
  }
  function trechoDe(estado, id) { return arr(estado && estado.instalacoes && estado.instalacoes.trechos).filter(function (t) { return String(t.id) === String(id); })[0] || null; }

  /* o TUBO sob o ponto. o.proj(p3) → {x,y} (tela ou desenho); sem proj, a planta (x, z). tol na mesma unidade.
     o.filtro(t) escolhe os sistemas. Devolve { trecho, s (0..1), q (ponto no eixo), u (direção p1→p2), d } */
  /* a fração s ∈ [0,1] do tubo t cuja PROJEÇÃO fica mais perto do ponto de tela `alvo` (amostra + seção áurea) */
  var AMOSTRAS_TELA = 32, PASSOS_REFINO = 24;
  function refinarNaTela(t, proj, alvo) {
    function ptS(s) { return { x: t.p1.x + (t.p2.x - t.p1.x) * s, y: t.p1.y + (t.p2.y - t.p1.y) * s, z: t.p1.z + (t.p2.z - t.p1.z) * s }; }
    function dist(s) { var q = proj(ptS(s)); return q ? Math.sqrt(Math.pow(alvo.x - q.x, 2) + Math.pow(alvo.y - q.y, 2)) : Infinity; }
    var mi = -1, md = Infinity, k;
    for (k = 0; k <= AMOSTRAS_TELA; k++) { var dk = dist(k / AMOSTRAS_TELA); if (dk < md) { md = dk; mi = k; } }
    if (mi < 0 || !isFinite(md)) return null;
    var lo = Math.max(0, (mi - 1) / AMOSTRAS_TELA), hi = Math.min(1, (mi + 1) / AMOSTRAS_TELA), g = (Math.sqrt(5) - 1) / 2;
    var c = hi - g * (hi - lo), e = lo + g * (hi - lo), fc = dist(c), fe = dist(e);
    for (k = 0; k < PASSOS_REFINO; k++) {
      if (fc < fe) { hi = e; e = c; fe = fc; c = hi - g * (hi - lo); fc = dist(c); }
      else { lo = c; c = e; fc = fe; e = lo + g * (hi - lo); fe = dist(e); }
    }
    var s = (lo + hi) / 2, ds = dist(s);
    return isFinite(ds) ? { s: s, d: ds } : null;
  }
  function tuboSob(estado, p, o) {
    o = o || {};
    var proj = o.proj || function (q) { return { x: q.x, y: q.z }; }, alvo = o.proj ? p : { x: p.x, y: p.z }, tol = num(o.tol, 0.25), melhor = null;
    arr(estado && estado.instalacoes && estado.instalacoes.trechos).forEach(function (t) {
      if (o.filtro && !o.filtro(t)) return;
      var a = proj(t.p1), b = proj(t.p2); if (!a || !b) return;
      var dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, s, d;
      if (L2 < 1e-10) { s = o.yTrab != null ? Math.max(0, Math.min(1, (o.yTrab - t.p1.y) / ((t.p2.y - t.p1.y) || 1))) : 0.5; d = Math.sqrt(Math.pow(alvo.x - a.x, 2) + Math.pow(alvo.y - a.y, 2)); }
      else { s = Math.max(0, Math.min(1, ((alvo.x - a.x) * dx + (alvo.y - a.y) * dy) / L2)); d = Math.sqrt(Math.pow(alvo.x - (a.x + dx * s), 2) + Math.pow(alvo.y - (a.y + dy * s), 2)); }
      /* JUNÇÃO 18/10/2026: no 3D a tela é PERSPECTIVA — a fração linear na tela não é a fração no tubo (o registro caía
         0,4 m antes do cursor num tubo de 4 m em perspectiva; e2e-bim-p12). Refina a fração no ESPAÇO: o ponto do tubo
         cuja projeção é a mais perto do cursor. */
      if (o.proj && L2 >= 1e-10) { var rf = refinarNaTela(t, proj, alvo); if (rf) { s = rf.s; d = rf.d; } }
      if (d <= tol && (!melhor || d < melhor.d)) melhor = { trecho: t, s: s, d: d };
    });
    if (!melhor) return null;
    var t0 = melhor.trecho, u = un3({ x: t0.p2.x - t0.p1.x, y: t0.p2.y - t0.p1.y, z: t0.p2.z - t0.p1.z });
    melhor.q = { x: r4(t0.p1.x + (t0.p2.x - t0.p1.x) * melhor.s), y: r4(t0.p1.y + (t0.p2.y - t0.p1.y) * melhor.s), z: r4(t0.p1.z + (t0.p2.z - t0.p1.z) * melhor.s) };
    melhor.u = u;
    return melhor;
  }

  /* face a face do acessório = a distância entre os dois conectores da família avaliada no DN do tubo (o mesmo do biminstui) */
  function comprimentoAc(famAval, famId, tipoId, dn) {
    var I = BI(), av = typeof famAval === "function" ? famAval(famId, tipoId, { DN: dn }) : null;
    if (!av || !av.conectores || av.conectores.length < 2) return I.ACESSORIO_PADRAO;
    var a = av.conectores[0], b = av.conectores[1], L = Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2) + Math.pow(a.z - b.z, 2));
    return r4(Math.min(I.ACESSORIO_MAX, Math.max(I.ACESSORIO_MIN, L)));
  }
  /* o lado HORIZONTAL do tubo (para o volante e para o ramal): perpendicular ao eixo; tubo vertical → +X */
  function ladoBase(u) { var n = { x: u.z, y: 0, z: -u.x }, L = Math.sqrt(n.x * n.x + n.z * n.z); return L < 1e-6 ? { x: 1, y: 0, z: 0 } : { x: n.x / L, y: 0, z: n.z / L }; }
  /* a FRENTE do registro (para onde o castelo e o volante apontam) pelo giro do acessório; giro 0 → null (o padrão do HidGeo) */
  function frenteAcessorio(a) {
    var g = num(a && a.giro, 0); if (!a || !a.dir || Math.abs(g % 360) < 1e-6) return null;
    var d = un3(a.dir), f0 = Math.abs(d.y) > 0.9 ? { x: 0, y: 0, z: 1 } : ladoBase(d), f = girarEm(f0, d, g * Math.PI / 180);
    return [r4(f.x), r4(f.y), r4(f.z)];
  }
  /* FRENTE B (19/10/2026, D-01): o inverso de frenteAcessorio — o GIRO (graus, em torno do eixo `dir` do tubo, no mesmo sentido
     do girarEm) que leva a frente padrão do registro até `frente` (a direção para DENTRO do cômodo que ele serve: pedido do
     Rogério, "sempre para o sentido onde está o ambiente"). 0 = a frente padrão já serve. `frente` paralela ao eixo → 0. */
  function giroPara(dir, frente) {
    if (!dir || !frente) return 0;
    var d = un3(dir), f0 = Math.abs(d.y) > 0.9 ? { x: 0, y: 0, z: 1 } : ladoBase(d), fr = { x: num(frente.x, 0), y: num(frente.y, 0), z: num(frente.z, 0) };
    var k = dot3(fr, d), fp = { x: fr.x - d.x * k, y: fr.y - d.y * k, z: fr.z - d.z * k };
    if (Math.sqrt(dot3(fp, fp)) < 1e-6) return 0;
    fp = un3(fp);
    var g = Math.atan2(dot3(d, cross3(f0, fp)), dot3(f0, fp)) * 180 / Math.PI, gr = Math.round(((g % 360) + 360) % 360 * 100) / 100;   /* 0,01° basta */
    return gr >= 360 - 1e-9 ? 0 : gr;
  }

  /* FRENTE B (19/10/2026, D-01): para que lado da parede fica o CÔMODO do ponto `p` embutido nela — a normal (planta) da parede que o
     contém, virada para o ambiente delimitado com aparelho sanitário (sonda a SONDA_COMODO da face); sem ambiente, o lado do aparelho
     sanitário mais perto. null = o ponto não está numa parede (tubo aparente: fica a frente padrão). */
  var SONDA_COMODO = 0.40;   // m: sonda à frente da face da parede (a mesma do auditor do TA)
  function dentroPol(p, pol) { var c = false; for (var i = 0, j = pol.length - 1; i < pol.length; j = i++) { var a = pol[i], b = pol[j]; if (((a.z > p.z) !== (b.z > p.z)) && (p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x)) c = !c; } return c; }
  /* ⚠ REVISÃO ADVERSARIAL (20/10/2026): só PONTO DE ÁGUA diz qual cômodo o registro serve. Com "toda família hid-" contavam o
     ralo, as caixas (inspeção, gordura, sifonada), o extintor, o sprinkler e o hidrante: o registro do banheiro virava para o
     corredor do extintor, para a área de serviço do ralo e para o quintal da caixa de inspeção. Família importada (fora do
     catálogo hid-/ra-) vale pelo conector de água da própria família avaliada. */
  var PONTO_AGUA = /^hid-(bacia|lavatorio|cuba|chuveiro|pia|tanque-lavar|mictorio|torneira|misturador|ducha|valvula-descarga|caixa-descarga|bebedouro)|^ra-(bacia|lavatorio|chuveiro|tanque)/;
  function pontoDeAgua(f, famAval) {
    var id = String(f && f.famId);
    if (/registro|porta|janela/.test(id)) return false;
    if (PONTO_AGUA.test(id)) return true;
    if (/^hid-|^ra-/.test(id) || typeof famAval !== "function") return false;
    try { var av = famAval(f.famId, f.tipoId, f.inst || {}); return arr(av && av.conectores).some(function (c) { return c && (c.sistema === "agua_fria" || c.sistema === "agua_quente"); }); } catch (e) { return false; }
  }
  /* a parede (caixa do BimEdit) que CONTÉM o ponto p em planta — a de eixo mais perto; null = fora de parede (tubo aparente) */
  function paredeQueContem(estado, p) {
    var w = null;
    paredes(estado).forEach(function (c) {
      var E = eixoParede(c), dx = p.x - c.cx, dz = p.z - c.cz, uu = dx * E.a.x + dz * E.a.z, ww = dx * E.n.x + dz * E.n.z;
      if (Math.abs(uu) > c.comprimento / 2 + 1e-6 || Math.abs(ww) > num(c.espessura, 0) / 2 + 1e-6) return;
      if (!w || Math.abs(ww) < w.ww) w = { c: c, E: E, ww: Math.abs(ww) };
    });
    return w;
  }
  function ladoComodo(estado, p, famAval) {
    var w = paredeQueContem(estado, p);
    if (!w) return null;
    var san = arr(estado.familias).filter(function (f) { return pontoDeAgua(f, famAval); });
    var ambs = arr(estado.ambientes).filter(function (A) { return A && A.calc && arr(A.calc.contorno).length >= 3 && san.some(function (f) { return dentroPol(f, A.calc.contorno); }); });
    var off = num(w.c.espessura, 0) / 2 + SONDA_COMODO, lados = [1, -1].map(function (sg) { var q = { x: p.x + w.E.n.x * sg * off, z: p.z + w.E.n.z * sg * off }; return { sg: sg, amb: ambs.some(function (A) { return dentroPol(q, A.calc.contorno); }) }; });
    var sg = lados[0].amb !== lados[1].amb ? (lados[0].amb ? 1 : -1) : 0;
    if (!sg) { var best = null; san.forEach(function (f) { var d = Math.hypot(f.x - p.x, f.z - p.z), v = (f.x - p.x) * w.E.n.x + (f.z - p.z) * w.E.n.z; if (Math.abs(v) > 1e-6 && (!best || d < best.d)) best = { d: d, s: v > 0 ? 1 : -1 }; }); sg = best ? best.s : 0; }
    return sg ? { x: w.E.n.x * sg, y: 0, z: w.E.n.z * sg } : null;
  }

  /* FRENTE H2 (20/10/2026): o lado do volante do registro posto à mão é o do PONTO QUE ELE ALIMENTA. Antes o cômodo delimitado
     com ponto de água ganhava sempre: o registro da TORNEIRA DE JARDIM, na face externa da parede da cozinha, virava o volante
     para a cozinha (quem fecha a torneira do quintal entra na casa). Regra (critério RA, PADROES-PROJETO-RA R-C3/R-C9): segue
     o tubo A JUSANTE do registro até o(s) ponto(s) de utilização e vira para o lado deles (cômodo ou área externa); sem tubo a
     jusante que chegue a um ponto, o cômodo vizinho (ladoComodo). Jusante = o lado SEM a alimentação (espera "continua" de água
     ou saída de reservatório/cavalete); sem alimentação achada (ou nos dois lados), o lado da ponta p2 (o traçado desenha a
     água de p1 para p2); se só um lado chega a ponto, é ele. Grafo: HidGrafo.montar sobre BimInst.rede (o mesmo do cálculo). */
  var FONTE_AGUA = /caixa-dagua|reservatorio|cisterna|cavalete|hidrometro/;
  /* REVISÃO ADVERSARIAL H2 (20/10/2026): na ÁGUA QUENTE a alimentação é o AQUECEDOR (a saída "aq" dele). Sem isto a rede quente
     nunca tinha fonte e caía no sentido do desenho: ramal quente desenhado do lavatório para o aquecedor, com outro ponto do
     lado do aquecedor, virava o volante para fora (o master acertava pelo cômodo). Na água FRIA o aquecedor é consumidor. */
  var FONTE_AQ = /aquecedor|boiler|acumulador|coletor-solar/;
  var _grafoCache = { est: null, nOps: -1, aval: null, sis: null, val: null };
  function grafoAgua(estado, famAval, sis, nOps) {
    var C0 = _grafoCache;
    if (C0.est === estado && C0.nOps === nOps && C0.aval === famAval && C0.sis === sis) return C0.val;
    var I = BI(), Gr = dep("HidGrafo", "./hidgrafo.js"), val = null;
    if (I && Gr && I.rede && Gr.montar) {
      try { var R = I.rede(estado, famAval); val = { R: R, G: Gr.montar(R, estado, [sis]) }; } catch (eG) { val = null; }
    }
    _grafoCache = { est: estado, nOps: nOps, aval: famAval, sis: sis, val: val };
    return val;
  }
  function ladoJusante(estado, famAval, t, q, nOps) {
    if (!t || !q) return null;
    var w = paredeQueContem(estado, q); if (!w) return null;
    var I = BI(), RG = grafoAgua(estado, famAval, t.sistema, nOps); if (!I || !RG || !RG.G) return null;
    var G = RG.G, TOLr = I.TOL;
    /* a aresta do trecho em que o registro cai (o trecho pode estar partido por derivações) */
    var eSel = null, dSel = Infinity;
    arr(G.partes && G.partes[t.id]).forEach(function (eid) {
      var e = G.arestas[eid], ab = { x: e.pb.x - e.pa.x, y: e.pb.y - e.pa.y, z: e.pb.z - e.pa.z }, L2 = dot3(ab, ab); if (!(L2 > 0)) return;
      var s = Math.max(0, Math.min(1, dot3({ x: q.x - e.pa.x, y: q.y - e.pa.y, z: q.z - e.pa.z }, ab) / L2)), pp = add3(e.pa, ab, s);
      var d = Math.sqrt(Math.pow(pp.x - q.x, 2) + Math.pow(pp.y - q.y, 2) + Math.pow(pp.z - q.z, 2));
      if (d < dSel) { dSel = d; eSel = e; }
    });
    if (!eSel) return null;
    var famDe = {}; arr(estado.familias).forEach(function (f) { famDe[String(f.id)] = f; });
    var fonteNo = {};
    arr(RG.R && RG.R.continuacoes).forEach(function (c) {
      var tc = trechoDe(estado, c.trecho); if (!tc || tc.sistema !== t.sistema) return;
      G.ordemN.forEach(function (nid) { var n = G.nos[nid]; if (Math.sqrt(Math.pow(n.x - c.x, 2) + Math.pow(n.y - c.y, 2) + Math.pow(n.z - c.z, 2)) <= TOLr) fonteNo[nid] = 1; });
    });
    /* a busca de um lado do registro, sem atravessar a aresta onde ele está */
    function lado(no0) {
      var vis = {}, fila = [no0], out = { pontos: [], fonte: false }; vis[no0] = 1;
      while (fila.length) {
        var nid = fila.shift(), n = G.nos[nid];
        if (fonteNo[nid]) out.fonte = true;
        if (n.aparelho) {
          var f = famDe[String(n.aparelho.famInst)];
          if (f && (FONTE_AGUA.test(String(f.famId)) || (t.sistema === "agua_quente" && FONTE_AQ.test(String(f.famId))))) out.fonte = true;
          else if (f && pontoDeAgua(f, famAval)) out.pontos.push({ f: f, no: n });
        }
        arr(n.arestas).forEach(function (eid) { if (eid === eSel.id) return; var e = G.arestas[eid], o = G.outro(e, nid); if (!vis[o]) { vis[o] = 1; fila.push(o); } });
      }
      return out;
    }
    var A = lado(eSel.a), Bl = lado(eSel.b), jus = null;   /* eSel.a fica do lado de p1 do trecho, eSel.b do lado de p2 */
    if (A.fonte !== Bl.fonte) jus = A.fonte ? Bl : A;
    else jus = Bl.pontos.length || !A.pontos.length ? Bl : A;
    if (!jus.pontos.length) return null;
    /* o ponto a jusante mais perto do registro manda; o lado = a posição da família em relação ao eixo da parede (a louça e a
       torneira encostam na FACE dela); família no próprio eixo → a frente dela (Z local, convenção do js/familia.js) */
    var best = null;
    jus.pontos.forEach(function (P0) {
      var f = P0.f, v = (num(f.x, 0) - w.c.cx) * w.E.n.x + (num(f.z, 0) - w.c.cz) * w.E.n.z;
      if (Math.abs(v) < 1e-3) { var r = num(f.rotY, 0); v = Math.sin(r) * w.E.n.x + Math.cos(r) * w.E.n.z; }
      if (Math.abs(v) < 1e-6) return;
      var d = Math.sqrt(Math.pow(P0.no.x - q.x, 2) + Math.pow(P0.no.y - q.y, 2) + Math.pow(P0.no.z - q.z, 2));
      if (!best || d < best.d) best = { d: d, s: v > 0 ? 1 : -1 };
    });
    return best ? { x: w.E.n.x * best.s, y: 0, z: w.E.n.z * best.s } : null;
  }

  /* INSERIR NO TUBO: a op (ou o lote) que põe o acessório/conexão `cfg.famId` no ponto do trecho mais perto de alvo.q.
     cfg: { famId, tipoId, giro (graus, em torno do eixo), dnNovo (redução), dnRamal, ramal (m), cursor {x,y,z} (o lado do ramal) } */
  function inserir(estado, famAval, ops, alvo, cfg) {
    var I = BI(); cfg = cfg || {};
    function falha(m) { return { ok: false, motivo: m }; }
    if (!I) return falha("O motor de instalações não carregou.");
    var k = oQue(cfg.famId); if (!k) return falha("Escolha um acessório (registro, válvula) ou uma conexão (luva, redução, tê, junção).");
    var t = alvo && alvo.trecho ? (typeof alvo.trecho === "object" ? alvo.trecho : trechoDe(estado, alvo.trecho)) : null;
    if (!t) return falha("Passe o mouse EM CIMA de um tubo.");
    t = trechoDe(estado, t.id) || t;
    var M = I.MATERIAIS[t.material] || {};
    if (M.secao || M.flexivel) return falha("O trecho " + t.id + " é " + (M.secao ? "de seção retangular" : "flexível") + ": não leva acessório nem conexão no meio.");
    var u = un3({ x: t.p2.x - t.p1.x, y: t.p2.y - t.p1.y, z: t.p2.z - t.p1.z }), Lt = Math.sqrt(Math.pow(t.p2.x - t.p1.x, 2) + Math.pow(t.p2.y - t.p1.y, 2) + Math.pow(t.p2.z - t.p1.z, 2));
    var q0 = alvo.q || { x: (t.p1.x + t.p2.x) / 2, y: (t.p1.y + t.p2.y) / 2, z: (t.p1.z + t.p2.z) / 2 };
    var s = dot3({ x: q0.x - t.p1.x, y: q0.y - t.p1.y, z: q0.z - t.p1.z }, u);
    var usados = idsUsados(estado, ops), avisos = [], giro = num(cfg.giro, 0) % 360, Hp = HP();
    function ponto(sv) { return { x: r4(t.p1.x + u.x * sv), y: r4(t.p1.y + u.y * sv), z: r4(t.p1.z + u.z * sv) }; }
    if (k === "acessorio") {
      var chave = I.ACESSORIO_DA_FAM[cfg.famId], A = I.ACESSORIOS[chave];
      if (A.sistemas.indexOf(t.sistema) < 0) return falha(A.nome + " é de tubo de água (fria ou quente): o trecho " + t.id + " é de " + I.SISTEMAS[t.sistema].nome.toLowerCase() + ".");
      /* PENDÊNCIAS FINAIS (18/10/2026): sem tipo escolhido, o do LUGAR — embutido (ramal) = base de latão com acabamento;
         aparente = o bruto/PVC soldável (BimInst.varianteAuto) */
      var vars = Object.keys(A.variantes), tipo = cfg.tipoId && A.variantes[cfg.tipoId] ? cfg.tipoId : (I.varianteAuto ? I.varianteAuto(chave, t) : vars[0]);
      /* o TAMANHO pelo DN do tubo: a ficha do tipo nesse DN; sem ela, o 1º tipo da família que tem; sem nenhum, pendente */
      var fichaAc = null;
      if (Hp && Hp.acessorio) {
        try { fichaAc = Hp.acessorio(chave, tipo, t.dn); } catch (eF) { fichaAc = null; }
        if (!fichaAc) {
          var alt = vars.filter(function (v) { try { return !!Hp.acessorio(chave, v, t.dn); } catch (e2) { return false; } })[0];
          if (alt) { avisos.push(A.nome + " " + A.variantes[tipo].rot + " não tem DN " + t.dn + " no catálogo: usei " + A.variantes[alt].rot + "."); tipo = alt; fichaAc = Hp.acessorio(chave, alt, t.dn); }
          else avisos.push(A.nome + ": nenhum tipo do catálogo tem DN " + t.dn + " — a peça entra PENDENTE (sem ficha).");
        }
      }
      var Lff = comprimentoAc(famAval, cfg.famId, tipo, t.dn), folga = Lff / 2 + I.TOL + 0.005;
      if (Lt < 2 * folga) return falha("O trecho " + t.id + " (" + fmt(Lt, 3) + " m) é curto demais para o " + A.nome.toLowerCase() + " (" + fmt(Lff, 3) + " m de face a face).");
      s = Math.max(folga, Math.min(Lt - folga, s));
      var q = ponto(s);
      var op = { op: "acessorio", id: novoId("ac", usados), famId: cfg.famId, tipoId: tipo, trecho: t.id, novoId: novoId("t", usados), x: q.x, y: q.y, z: q.z, comprimento: Lff };
      if (cfg.tipoId && !A.variantes[cfg.tipoId]) op.produto = String(cfg.tipoId);   /* tipo do catálogo (hid-registro-*): identificação do produto */
      /* FRENTE B (19/10/2026, D-01): o REGISTRO posto à mão num tubo embutido nasce com o volante para o lado do cômodo (o giro do
         Espaço soma por cima). Pedido do Rogério: "sempre para o sentido onde está o ambiente" (critério RA, R-C9). */
      /* FRENTE H2 (20/10/2026): o lado do PONTO a jusante manda; sem tubo a jusante até um ponto, o cômodo vizinho */
      if (/registro/.test(String(chave))) { var fC = ladoJusante(estado, famAval, t, q, arr(ops).length) || ladoComodo(estado, q, famAval); if (fC) giro = ((giroPara(u, fC) + giro) % 360 + 360) % 360; }
      if (giro) op.giro = giro;
      return { ok: true, oQue: k, nome: A.nome, op: op, trecho: t.id, dn: t.dn, tipoId: tipo, ficha: fichaAc ? fichaAc.id : null, avisos: avisos, q: q, u: u,
               previa: { centro: q, dir: u, comprimento: Lff, dn: t.dn, material: t.material, sistema: t.sistema, acessorio: chave, variante: tipo, giro: giro } };
    }
    /* CONEXÃO: divide o tubo; a rede põe a conexão do nó (luva, redução, tê, junção) */
    var C = CONEXOES[cfg.famId];
    if (C.pendente) return falha(C.nome + ": " + C.pendente + ".");
    if (C.so && C.so.indexOf(t.sistema) < 0) return falha(C.nome + " é de " + C.so.join("/") + ": o trecho " + t.id + " é de " + I.SISTEMAS[t.sistema].nome.toLowerCase() + " (use o tê).");
    var mg = GEO.margemPonta + I.TOL;
    if (Lt < 2 * mg) return falha("O trecho " + t.id + " (" + fmt(Lt, 3) + " m) é curto demais para dividir.");
    s = Math.max(mg, Math.min(Lt - mg, s));
    var J = ponto(s), par = I.dividirTrecho(estado, t.id, J);
    if (par.length !== 2) return falha("Não consegui dividir o trecho " + t.id + " nesse ponto.");
    var marcas = marcasDe(ops, t.id), o1 = par[0], o2 = par[1];
    Object.keys(marcas).forEach(function (kk) { if (o1[kk] === undefined) o1[kk] = marcas[kk]; if (o2[kk] === undefined) o2[kk] = JSON.parse(JSON.stringify(marcas[kk])); });
    o2.id = novoId("t", usados);
    /* a peça em linha do nó NOVO (união / tê de inspeção): na ponta de chegada do trecho de montante; as das pontas de origem ficam */
    delete o1.pecaFim; delete o2.pecaIni;
    if (C.pecaLinha) o1.pecaFim = C.pecaLinha;
    var lote = [o1, o2], tipoFicha = C.tipo, dnFicha = t.dn, dnsM = arr(M.dns).map(Number), ramalOp = null, ramalDir = null;
    if (C.tipo === "reducao") {
      var dnN = num(cfg.dnNovo, NaN);
      if (!(dnsM.indexOf(dnN) >= 0) || dnN === t.dn) dnN = dnsM.filter(function (d) { return d < t.dn; }).pop();
      if (!(dnN > 0)) return falha("Redução: o " + (M.nome || t.material) + " não tem DN menor que " + t.dn + ".");
      o2.dn = dnN;   /* a jusante (p1 → p2) sai no DN novo */
      delete o2.aplicacao;
    }
    if (C.ramal) {
      var dnR = num(cfg.dnRamal, t.dn);
      if (dnsM.indexOf(dnR) < 0 || dnR > t.dn) { if (dnR > t.dn) avisos.push("ramal maior que o tubo: ficou no DN " + t.dn + "."); dnR = t.dn; }
      var n = ladoBase(u);
      if (cfg.cursor) { var w0 = { x: cfg.cursor.x - J.x, y: 0, z: cfg.cursor.z - J.z }; if (dot3(w0, n) < 0) n = { x: -n.x, y: 0, z: -n.z }; }
      if (giro) n = girarEm(n, u, giro * Math.PI / 180);
      var w = C.ramal === 45 ? un3(add3({ x: -u.x * Math.SQRT1_2, y: -u.y * Math.SQRT1_2, z: -u.z * Math.SQRT1_2 }, n, Math.SQRT1_2)) : n;
      var Lr = num(cfg.ramal, GEO.ramal), fim = add3(J, w, Lr), grav = !!(I.SISTEMAS[t.sistema] && I.SISTEMAS[t.sistema].gravidade);
      if (grav && Math.abs(w.y) < 0.5) { var h = Math.sqrt(Math.pow(fim.x - J.x, 2) + Math.pow(fim.z - J.z, 2)); fim.y = J.y + h * I.inclinacaoMinima(t.sistema, dnR) / 100; }
      fim = { x: r4(fim.x), y: r4(fim.y), z: r4(fim.z) };
      ramalOp = { op: "trecho", id: novoId("t", usados), sistema: t.sistema, material: t.material, dn: dnR, p1: grav ? fim : J, p2: grav ? J : fim };
      lote.push(ramalOp); ramalDir = w;
      if (C.tipo === "te" && dnR < t.dn) tipoFicha = "te_reducao";
    }
    var fichaCx = null;
    if (Hp && Hp.conexao) { try { fichaCx = Hp.conexao(tipoFicha, t.material, dnFicha); } catch (eC) { fichaCx = null; } if (!fichaCx) avisos.push(C.nome + " DN " + dnFicha + " de " + (M.nome || t.material) + " não está no catálogo: entra PENDENTE (sem ficha)."); }
    /* a peça em linha que NÃO EXISTE nesse DN/material (o tê de inspeção de esgoto só vem em 75, 100 e 150; a união, em PVC/CPVC
       soldável): recusa — nada de peça que não se compra (pendências finais) */
    if (C.pecaLinha && Hp && Hp.conexao && !fichaCx) return falha(C.nome + " DN " + dnFicha + " de " + (M.nome || t.material) + " não existe no catálogo (ficha da peça): escolha outro DN ou outra peça.");
    return { ok: true, oQue: k, nome: C.nome, op: { op: "lote", id: novoId("ins", usados), ops: lote }, trecho: t.id, novoTrecho: o2.id, ramal: ramalOp ? ramalOp.id : null, dn: t.dn, avisos: avisos, q: J, u: u,
             ficha: fichaCx ? fichaCx.id : null, previa: { conexao: C.tipo, centro: J, dir: u, ramal: ramalDir, ramalL: ramalOp ? num(cfg.ramal, GEO.ramal) : 0, dn: t.dn, sistema: t.sistema, material: t.material, ops: lote } };
  }

  /* ENCAIXE NA GRADE (item 8 das pendências, 18/10/2026): com o snap de grade do BIM ligado (o estado único da barra de
     baixo, js/bimbarraopcoes.js: snap, grade, tipos.grade, passo), o ponto de inserção da peça cai no passo da grade no
     plano de trabalho — a mesma regra do js/bimprecisao.js (snap "grade": origem 0, arredonda x e z ao passo). Sem a
     grade (ou com o snap desligado), null: o ponto fica onde o cursor está. */
  function encaixeGrade(p, prec) {
    if (!p || !prec || prec.snap === false || !prec.grade || (prec.tipos && prec.tipos.grade === false)) return null;
    var g = num(prec.passo, 0); if (!(g > 0) || !isFinite(num(p.x, NaN)) || !isFinite(num(p.z, NaN))) return null;
    return { x: r4(Math.round(p.x / g) * g), z: r4(Math.round(p.z / g) * g), passo: g };
  }

  /* paredes modeladas (caixas do BimEdit) */
  function paredes(estado) { return arr(estado && estado.caixas).filter(function (c) { return c && c.tipo === "parede" && num(c.comprimento, 0) > 0; }); }
  function eixoParede(c) { var r = num(c.rotY, 0); return { a: { x: Math.cos(r), z: -Math.sin(r) }, n: { x: Math.sin(r), z: Math.cos(r) } }; }
  /* a cota temporária: do ponto à FACE da parede mais próxima (perpendicular, dentro do comprimento dela) */
  function cotaParede(estado, p, excluir) {
    var melhor = null;
    paredes(estado).forEach(function (c) {
      if (excluir != null && String(c.id) === String(excluir)) return;
      var E = eixoParede(c), dx = p.x - c.cx, dz = p.z - c.cz, uu = dx * E.a.x + dz * E.a.z, ww = dx * E.n.x + dz * E.n.z;
      if (Math.abs(uu) > c.comprimento / 2 + 1e-6) return;
      var d = Math.abs(ww) - c.espessura / 2; if (!(d > 0.005) || d > GEO.cotaMax) return;
      var sg = ww >= 0 ? 1 : -1, b = { x: r4(c.cx + E.a.x * uu + E.n.x * sg * c.espessura / 2), z: r4(c.cz + E.a.z * uu + E.n.z * sg * c.espessura / 2) };
      if (!melhor || d < melhor.d) melhor = { a: { x: p.x, z: p.z }, b: b, d: r4(d), parede: c.id };
    });
    return melhor;
  }
  /* POSE da família sob o cursor: piso acabado (caixa/ralo), encosto na parede (louça), giro da Espaço por cima.
     cx = av.caixa (local); o: { base, rot (rad), louca, nivel, par } */
  function poseFamilia(estado, cx, p, o) {
    o = o || {};
    var pose = { x: r4(p.x), y: num(o.base, 0), z: r4(p.z), rotY: normAng(num(o.rot, 0)), encaixe: null };
    var H = HN();
    if (o.nivel && H && H.em) { try { var nv = H.em(estado, { x: p.x, z: p.z }, num(o.base, 0), o.par || H.parametros || {}); if (nv && isFinite(nv.y)) { pose.y = r4(nv.y); pose.encaixe = "piso"; pose.nivel = nv.origem || nv.fonte; } } catch (eN) {} }
    /* ALTURA PADRÃO DE INSTALAÇÃO (19/10/2026): lavatório de bancada, pia, mictório, chuveiro, registro, torneira e misturador entram
       JÁ na altura de instalação (HidKit.alturaInstalacao, dados em alturas-instalacao.json), sobre o piso acabado do ponto;
       depois a pessoa muda em Propriedades (Elevação da base). Bacia, ralo e louça de coluna ficam no piso. */
    var AL = o.altura;
    if (AL && AL.ok && !AL.piso && AL.valor > 0) {
      var piso0 = num(o.base, 0);
      if (H && H.em && o.pisoNivel) { try { var nv0 = H.em(estado, { x: p.x, z: p.z }, piso0, o.par || H.parametros || {}); if (nv0 && isFinite(nv0.y)) piso0 = nv0.y; } catch (eA) {} }
      pose.y = r4(piso0 + AL.valor); pose.alturaPadrao = { valor: AL.valor, origem: AL.origem, fonte: AL.fonte, texto: AL.texto };
    }
    if (o.louca && cx && isFinite(cx.z0)) {
      var melhor = null;
      paredes(estado).forEach(function (c) {
        var E = eixoParede(c), dx = p.x - c.cx, dz = p.z - c.cz, uu = dx * E.a.x + dz * E.a.z, ww = dx * E.n.x + dz * E.n.z;
        if (Math.abs(uu) > c.comprimento / 2 + 1e-6) return;
        var d = Math.max(0, Math.abs(ww) - c.espessura / 2); if (d > GEO.encaixeParede) return;
        if (!melhor || d < melhor.d) melhor = { c: c, E: E, uu: uu, sg: ww >= 0 ? 1 : -1, d: d };
      });
      if (melhor) {
        var c = melhor.c, E = melhor.E, nO = { x: E.n.x * melhor.sg, z: E.n.z * melhor.sg }, rot = normAng(Math.atan2(nO.x, nO.z) + num(o.rot, 0));
        var co = Math.cos(rot), si = Math.sin(rot), dmin = Infinity;
        [[cx.x0, cx.z0], [cx.x1, cx.z0], [cx.x0, cx.z1], [cx.x1, cx.z1]].forEach(function (k) { var wx = k[0] * co + k[1] * si, wz = -k[0] * si + k[1] * co, pr = wx * nO.x + wz * nO.z; if (pr < dmin) dmin = pr; });
        var off = c.espessura / 2 - dmin;
        pose.x = r4(c.cx + E.a.x * melhor.uu + nO.x * off); pose.z = r4(c.cz + E.a.z * melhor.uu + nO.z * off); pose.rotY = rot;
        pose.encaixe = pose.encaixe === "piso" ? "piso+parede" : "parede"; pose.parede = c.id;
      }
    }
    pose.cota = cotaParede(estado, pose, pose.parede);
    return pose;
  }
  /* a louça JÁ COLOCADA está de costas para a face de uma parede? */
  function paredeAtras(estado, fi, av) {
    var cx = av && (av.caixaObstaculo || av.caixa); if (!cx || !isFinite(cx.z0)) return null;   /* revisão H5: sem as peças rentes à parede */
    var r = num(fi.rotY, 0), co = Math.cos(r), si = Math.sin(r), mx = (cx.x0 + cx.x1) / 2;
    var Bk = { x: fi.x + mx * co + cx.z0 * si, z: fi.z - mx * si + cx.z0 * co }, nO = { x: si, z: co }, achou = null;
    paredes(estado).forEach(function (c) {
      var E = eixoParede(c), dx = Bk.x - c.cx, dz = Bk.z - c.cz, uu = dx * E.a.x + dz * E.a.z, ww = dx * E.n.x + dz * E.n.z;
      if (Math.abs(uu) > c.comprimento / 2 + 1e-6 || Math.abs(Math.abs(ww) - c.espessura / 2) > GEO.encostada) return;
      var sg = ww >= 0 ? 1 : -1; if (E.n.x * sg * nO.x + E.n.z * sg * nO.z < 0.9) return;
      achou = { parede: c, E: E, sg: sg };
    });
    return achou;
  }
  /* GIRAR a peça colocada (Espaço; sentido = -1 com Shift). Devolve { ok, op (op ou lote), tipo, motivo } */
  function girar(estado, famAval, uid, sentido, o) {
    o = o || {}; var I = BI(), id = String(uid || "").replace(/^edit:/, ""), sg = sentido < 0 ? -1 : 1;
    function falha(m) { return { ok: false, motivo: m }; }
    var ins = (estado && estado.instalacoes) || {}, usados = idsUsados(estado, o.ops);
    var fi = arr(estado && estado.familias).filter(function (f) { return String(f.id) === id; })[0];
    if (fi) {
      if (fi.host) return falha("Peça hospedada na parede (porta, janela): vire pelas setas.");
      var av = typeof famAval === "function" ? famAval(fi.famId, fi.tipoId, fi.inst || {}) : null;
      var louca = typeof o.categoria === "function" && o.categoria(fi.famId) === "loucas", atras = louca ? paredeAtras(estado, fi, av) : null;
      var fi2 = { id: fi.id, famId: fi.famId, tipoId: fi.tipoId, inst: fi.inst, x: fi.x, y: fi.y, z: fi.z, rotY: normAng(num(fi.rotY, 0) + sg * Math.PI / 2) }, modo = "90";
      if (atras) {   /* encostada: passa para o OUTRO LADO da parede (espelho no plano médio dela, de costas para a outra face) */
        var c = atras.parede, E = atras.E, ww = (fi.x - c.cx) * E.n.x + (fi.z - c.cz) * E.n.z;
        fi2.x = r4(fi.x - 2 * ww * E.n.x); fi2.z = r4(fi.z - 2 * ww * E.n.z); fi2.rotY = normAng(num(fi.rotY, 0) + Math.PI); modo = "lado";
      }
      var ops = [];
      if (fi2.x !== fi.x || fi2.z !== fi.z) ops.push({ op: "mover", id: fi.id, cx: fi2.x, cz: fi2.z });
      ops.push({ op: "instancia", id: fi.id, rotY: fi2.rotY });
      /* os tubos que chegavam nos pontos de ligação vão junto (a ponta segue o ponto) */
      var nTubos = 0;
      if (av && arr(av.conectores).length && I) {
        var k0 = I.conectoresDe(av, fi), k1 = I.conectoresDe(av, fi2), tol = I.TOL_CONECTOR || 0.03;
        arr(ins.trechos).forEach(function (t) {
          var mud = null;
          ["p1", "p2"].forEach(function (pp) {
            k0.forEach(function (k, i) { var P = t[pp]; if (k1[i] && Math.abs(P.x - k.x) <= tol && Math.abs(P.y - k.y) <= tol && Math.abs(P.z - k.z) <= tol) { mud = mud || I.opDoTrecho(t); mud[pp] = { x: r4(k1[i].x), y: r4(k1[i].y), z: r4(k1[i].z) }; } });
          });
          if (mud) { var mk = marcasDe(o.ops, t.id); Object.keys(mk).forEach(function (kk) { if (mud[kk] === undefined) mud[kk] = mk[kk]; }); ops.push(mud); nTubos++; }
        });
      }
      return { ok: true, tipo: "familia", modo: modo, tubos: nTubos, de: { x: fi.x, z: fi.z, rotY: num(fi.rotY, 0) }, para: { x: fi2.x, z: fi2.z, rotY: fi2.rotY },
               op: ops.length === 1 ? ops[0] : { op: "lote", id: novoId("giro", usados), ops: ops } };
    }
    var k = arr(ins.pecas).filter(function (x) { return String(x.id) === id; })[0];
    if (k) { var rN = normAng(num(k.rotY, 0) + sg * Math.PI / 2); return { ok: true, tipo: "peca", de: { rotY: num(k.rotY, 0) }, para: { rotY: rN }, op: { op: "instAlterar", id: k.id, rotY: rN } }; }
    var a = arr(ins.acessorios).filter(function (x) { return String(x.id) === id; })[0];
    if (a) { var g = ((num(a.giro, 0) + sg * 90) % 360 + 360) % 360; return { ok: true, tipo: "acessorio", de: { giro: num(a.giro, 0) }, para: { giro: g }, op: { op: "instAlterar", id: a.id, giro: g } }; }
    if (trechoDe(estado, id)) return falha("Tubo não gira: arraste a ponta ou use Mover.");
    return falha("Selecione UMA peça de instalação (louça, equipamento, caixa, ralo, registro) para girar.");
  }

  /* ================================================================ TELA */
  var T = {
    ctx: null, grupo: null, cota: null, realce: null, hover: null, rot: 0, giro: 0, _cache: {}, _t: 0, _mat: null, _matErro: null,
    /* P8 (junção 18/10/2026): a colocação com prévia, o Espaço e a grade só com a prévia ?previa=hidro — sem ela, o
       comportamento do master (o js/bim.js e o js/biminstui.js seguem o caminho de antes) */
    ativo: function () { var U = global.BimInstUI; return !(U && U._previaHidro && !U._previaHidro()); },
    /* a precisão do BIM (snap e grade): o estado único da barra de baixo */
    precisao: function () { var b = global.BimBarraOpcoes; try { return b && typeof b.precisao === "function" ? b.precisao() : null; } catch (e) { return null; } },
    naGrade: function (p) { var g = encaixeGrade(p, T.precisao()); return g ? { x: g.x, y: p.y, z: g.z, grade: g.passo } : p; },
    /* o modo de colocação armado agora: familia | peca | tubo | null */
    modo: function () {
      var c = T.ctx, ed = c && c.edit; if (!ed || !ed.on || !ed.sub || !T.ativo()) return null;
      if (ed.sub === "familia") { var fs = ed.famSel, f = fs && c.familia ? c.familia(fs.famId) : null; return f && f.hospedagem !== "parede" ? "familia" : null; }
      if (ed.sub === "inst") { var U = global.BimInstUI, cf = U && U.cfg; if (!cf) return null; if (cf.ferramenta === "peca") return "peca"; if (cf.ferramenta === "acessorio") return "tubo"; }
      return null;
    },
    estado: function () { var ed = T.ctx && T.ctx.edit; return (ed && ed.estado) || { instalacoes: { trechos: [], pecas: [] }, familias: [], caixas: [] }; },
    ops: function () { var ed = T.ctx && T.ctx.edit; return (ed && ed.ops) || []; },
    base: function () { var ed = T.ctx && T.ctx.edit; return ed && isFinite(ed.base) ? ed.base : 0; },
    categoria: function (famId) { var f = T.ctx && T.ctx.familia ? T.ctx.familia(famId) : null; return f ? f.categoria : null; },
    /* a altura padrão de instalação da família na colocação (só as hid-*; sem o motor carregado, no piso como sempre) */
    alturaPadrao: function (famId, av) {
      var K = global.HidKit; if (!K || !K.alturaInstalacao || !/^hid-/.test(String(famId))) return null;
      try { return K.alturaInstalacao(famId, av && av.tipo ? av.tipo.nome : ""); } catch (e) { return null; }
    },
    ehNivel: function (famId) { var H = HN(); return !!(H && H.FAMILIAS_NIVEL && H.FAMILIAS_NIVEL[famId]); },
    /* a pose da família armada no ponto p (o mesmo cálculo para a prévia e para o clique, no 3D e na planta) */
    poseFamiliaEm: function (p) {
      var ed = T.ctx.edit, fs = ed.famSel; if (!fs || !p) return null;
      var av = T.ctx.famAval(fs.famId, fs.tipoId, fs.inst || {}); if (!av) return null;
      p = T.naGrade(p);   /* item 8: o ponto de inserção no passo da grade */
      return poseFamilia(T.estado(), av.caixaObstaculo || av.caixa, p, { base: T.base(), rot: num(ed.famRot, 0), louca: T.categoria(fs.famId) === "loucas", nivel: T.ehNivel(fs.famId), pisoNivel: true, altura: T.alturaPadrao(fs.famId, av) });
    },
    posePecaEm: function (p) {
      var U = global.BimInstUI, cf = U && U.cfg, I = BI(); if (!cf || !p || !I) return null;
      p = T.naGrade(p);   /* item 8: o ponto de inserção no passo da grade */
      var P = I.PECAS[cf.peca], H = HN(), y = T.base();
      if (P && P.sistemas[0] === "eletrica") y = cf.peca === "caixa_octogonal" ? T.base() + num(cf.cota, 2.75) : T.base() + num(cf.alturaPiso, 0.30);
      var pose = { x: r4(p.x), y: r4(y), z: r4(p.z), rotY: normAng(T.rot * Math.PI / 180), encaixe: null };
      if (H && H.PECAS_NIVEL && H.PECAS_NIVEL[cf.peca] && H.em) { try { var nv = H.em(T.estado(), p, T.base(), H.parametros || {}); if (nv && isFinite(nv.y)) { pose.y = r4(nv.y); pose.encaixe = "piso"; } } catch (e) {} }
      pose.cota = cotaParede(T.estado(), pose, null);
      return pose;
    },
    cfgTubo: function (cursor) { var U = global.BimInstUI, cf = (U && U.cfg) || {}; return { famId: cf.famId, tipoId: cf.tipoId, giro: T.giro, dnNovo: cf.dnNovo, dnRamal: cf.dnRamal, cursor: cursor || null }; },
    filtroTubo: function (famId) { var I = BI(), k = oQue(famId); return function (t) { var S = I.SISTEMAS[t.sistema]; if (!S) return false; return k === "acessorio" ? S.grupo === "agua" : (S.grupo !== "eletrica" && S.grupo !== "bandeja" && S.grupo !== "ar"); }; },

    /* ------------------------------------------------ 3D */
    matFantasma: function (erro) {
      var THREE = T.ctx.THREE;
      if (!T._mat) T._mat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0b5d80, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
      if (!T._matErro) T._matErro = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x7f1d1d, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
      return erro ? T._matErro : T._mat;
    },
    _limparGrupo: function () { if (T.grupo) { T.ctx.scene.remove(T.grupo); T.grupo = null; } T._chave = null; },
    limpar: function () {
      if (!T.ctx) return;
      T._limparGrupo();
      if (T.cota) { T.ctx.scene.remove(T.cota); T.cota = null; }
      if (T.realce) T.realce.visible = false;
      T.hover = null; T._fam = null;
      T._limpar2d();
    },
    /* as malhas da peça na pose ZERO (cache por chave); o grupo leva a pose */
    _malhasFamilia: function (fs) {
      var av = T.ctx.famAval(fs.famId, fs.tipoId, fs.inst || {}); if (!av || !av.solidos || !av.solidos.length || !T.ctx.famMalhas) return [];
      return T.ctx.famMalhas(av, { x: 0, y: 0, z: 0, rotY: 0 }, T.matFantasma(false));
    },
    /* as malhas que o biminstui faria para estas ops (estado mínimo, fora do replay: sem kit, sem tocar a rede da cena) */
    _malhasInst: function (ops, so) {
      var U = global.BimInstUI, BE = global.BimEdit, THREE = T.ctx.THREE; if (!U || !BE || !U.malhas) return [];
      var K = global.HidKitUI, fK = K ? K.aoReconstruir : null, sv = { r: U._ultimaRede, c: U._corVerif, n: U._nivelFeito, s: U._segsDe }, out = [];
      try {
        if (K) K.aoReconstruir = function () {};
        U._corVerif = null;
        var st = BE.aplicar(ops);
        U.malhas(st, T.ctx.famAval, THREE).forEach(function (el) { if (el.marcador || (so && !so[el.id] && !/^c/.test(String(el.id)))) return; el.malhas.forEach(function (m) { out.push(m); }); });
      } catch (e) { out = []; }
      finally { if (K) K.aoReconstruir = fK; U._ultimaRede = sv.r; U._corVerif = sv.c; U._nivelFeito = sv.n; U._segsDe = sv.s; }
      return out;
    },
    _grupoCom: function (chave, fazer) {
      if (T.grupo && T._chave === chave) return T.grupo;
      T._limparGrupo();
      var THREE = T.ctx.THREE, g = new THREE.Group(), mat = T.matFantasma(false);
      fazer().forEach(function (m) { m.material = mat; m.renderOrder = 997; g.add(m); });
      g.userData.colocarFantasma = true; g.name = "inst-colocar-fantasma";
      T.ctx.scene.add(g); T.grupo = g; T._chave = chave;
      return g;
    },
    _pintarErro: function (erro) { if (!T.grupo) return; var m = T.matFantasma(!!erro); T.grupo.traverse(function (o) { if (o.isMesh) o.material = m; }); },
    _cota3d: function (cota, y) {
      var THREE = T.ctx.THREE;
      if (T.cota) { T.ctx.scene.remove(T.cota); T.cota = null; }
      if (!cota) return;
      var g = new THREE.Group(), yy = y + 0.02;
      var geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(cota.a.x, yy, cota.a.z), new THREE.Vector3(cota.b.x, yy, cota.b.z)]);
      var ln = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0xf59e0b, dashSize: 0.05, gapSize: 0.03, depthTest: false })); ln.computeLineDistances(); ln.renderOrder = 999; g.add(ln);
      if (typeof document !== "undefined") {
        var cv = document.createElement("canvas"); cv.width = 160; cv.height = 48; var c2 = cv.getContext("2d");
        c2.fillStyle = "rgba(255,255,255,.92)"; c2.fillRect(0, 0, 160, 48); c2.strokeStyle = "#f59e0b"; c2.lineWidth = 3; c2.strokeRect(1.5, 1.5, 157, 45);
        c2.fillStyle = "#92400e"; c2.font = "bold 28px sans-serif"; c2.textAlign = "center"; c2.textBaseline = "middle"; c2.fillText(fmt(cota.d, 2) + " m", 80, 25);
        var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true }));
        sp.position.set((cota.a.x + cota.b.x) / 2, yy + 0.08, (cota.a.z + cota.b.z) / 2); sp.scale.set(0.32, 0.096, 1); sp.renderOrder = 1000; g.add(sp);
      }
      g.userData.colocarCota = true; T.ctx.scene.add(g); T.cota = g;
    },
    _realce3d: function (t) {
      var THREE = T.ctx.THREE;
      if (!t) { if (T.realce) T.realce.visible = false; return; }
      if (!T.realce) {
        T.realce = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.45, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
        T.realce.renderOrder = 996; T.realce.userData.colocarRealce = true; T.ctx.scene.add(T.realce);
      }
      var a = new THREE.Vector3(t.p1.x, t.p1.y, t.p1.z), b = new THREE.Vector3(t.p2.x, t.p2.y, t.p2.z), L = a.distanceTo(b), r = Math.max(0.012, (num(t.dn, 25) / 1000) * 0.75);
      T.realce.scale.set(r, L, r); T.realce.position.copy(a).add(b).multiplyScalar(0.5);
      T.realce.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      T.realce.visible = true; T.realce.userData.trecho = t.id;
    },
    /* o ponto do cursor no plano horizontal da cota y (o lado do ramal) */
    _planoY: function (e, y) {
      var THREE = T.ctx.THREE, cam = T.ctx.camera ? T.ctx.camera() : null, cv = T.ctx.canvas; if (!cam || !cv) return null;
      var r = cv.getBoundingClientRect(), v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), rc = new THREE.Raycaster();
      rc.setFromCamera(v, cam); var P = new THREE.Vector3(); return rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), P) ? { x: P.x, y: y, z: P.z } : null;
    },
    /* o pointermove do 3D (gancho no js/bim.js, antes de todos) */
    mover: function (e) {
      var md = T.modo();
      if (!md) { if (T.grupo || T.cota || (T.realce && T.realce.visible)) T.limpar(); return false; }
      /* JUNÇÃO 18/10/2026: o ÚLTIMO movimento antes de parar caía no limitador de 30 ms e a prévia ficava onde o mouse
         passou antes — o clique rápido punha o registro LONGE do cursor (e2e-bim-p12: 2,22 m em vez de 2,50 m). A posição
         é guardada sempre e o movimento descartado é refeito no fim do intervalo. */
      T._ev = { x: e.clientX, y: e.clientY, shift: !!e.shiftKey };
      var agora = Date.now();
      if (agora - T._t < 30) { if (!T._rastro) T._rastro = setTimeout(function () { T._rastro = null; var u = T._ev; if (u && T.modo()) T.mover({ clientX: u.x, clientY: u.y, shiftKey: u.shift }); }, 32); return false; }   // hid:ok intervalo do limitador (ms)
      T._t = agora;
      if (md === "tubo") return T._moverTubo3d(e);
      var p = T.ctx.planoPonto ? T.ctx.planoPonto(e.clientX, e.clientY) : null;
      if (!p) { if (T.grupo) T.grupo.visible = false; return false; }
      T._mostrarPose(md, p);
      return false;
    },
    _mostrarPose: function (md, p) {
      var pose, g;
      if (md === "familia") {
        var fs = T.ctx.edit.famSel; pose = T.poseFamiliaEm(p); if (!pose) return null;
        g = T._grupoCom("f|" + fs.famId + "|" + fs.tipoId + "|" + JSON.stringify(fs.inst || {}), function () { return T._malhasFamilia(fs); });
      } else {
        var cf = global.BimInstUI.cfg; pose = T.posePecaEm(p); if (!pose) return null;
        var op0 = { op: "peca", id: "__colocar", peca: cf.peca, sistema: (BI().PECAS[cf.peca].sistemas.indexOf(cf.sistema) >= 0 ? cf.sistema : BI().PECAS[cf.peca].sistemas[0]), x: 0, y: 0, z: 0, rotY: 0 };
        if (cf.pecaDn) op0.dn = cf.pecaDn; if (BI().PECAS[cf.peca].materiais) op0.material = cf.pecaMat;
        g = T._grupoCom("k|" + JSON.stringify(op0), function () { return T._malhasInst([op0], { __colocar: 1 }); });
      }
      g.position.set(pose.x, pose.y, pose.z); g.rotation.set(0, pose.rotY, 0); g.visible = true;
      T._pose = pose; T._cota3d(pose.cota, pose.y);
      if (pose.alturaPadrao) T._status("Entra a " + String(Math.round(pose.alturaPadrao.valor * 100) / 100).replace(".", ",") + " m do piso (altura padrão de instalação: " + pose.alturaPadrao.texto + "). Mude em Propriedades › Elevação.");
      return pose;
    },
    _moverTubo3d: function (e) {
      var b = B(), U = global.BimInstUI, cf = U && U.cfg; if (!b || !b.telaDe || !cf) return false;
      var est = T.estado(), al = tuboSob(est, { x: e.clientX, y: e.clientY }, { proj: function (q) { var s = b.telaDe(q.x, q.y, q.z); return s && !s.atras ? s : null; }, tol: GEO.pxTubo, filtro: T.filtroTubo(cf.famId) });
      return T._mostrarTubo(al, function (q) { return T._planoY(e, q.y); }, "3d");
    },
    /* realce + prévia do acessório/conexão no tubo (3D); guarda o alvo para o clique (3D, planta ou corte) */
    _mostrarTubo: function (al, cursorDe, vista) {
      var U = global.BimInstUI, cf = U && U.cfg;
      if (!al) { T.hover = null; if (T.grupo) T.grupo.visible = false; T._realce3d(null); if (T.cota) { T.ctx.scene.remove(T.cota); T.cota = null; } T._status("Passe o mouse EM CIMA de um tubo: ele realça e a peça aparece no eixo, no DN dele. Espaço gira em torno do tubo; Esc encerra."); return false; }
      var cur = cursorDe ? cursorDe(al.q) : null, r = inserir(T.estado(), T.ctx.famAval, T.ops(), { trecho: al.trecho.id, q: al.q }, T.cfgTubo(cur));
      T.hover = { t: Date.now(), trecho: al.trecho.id, q: al.q, res: r, vista: vista, cursor: cur };
      T._realce3d(al.trecho);
      if (!r.ok) { if (T.grupo) T.grupo.visible = false; T._status(r.motivo); return false; }
      var P = r.previa, chave = "t|" + cf.famId + "|" + JSON.stringify(P);
      if (r.oQue === "acessorio") {
        T._grupoCom(chave, function () {
          var G = global.HidGeo, I = BI(), THREE = T.ctx.THREE; if (!G || !U._malhaG) return [];
          var V0 = I.ACESSORIOS[P.acessorio].variantes[P.variante] || {}, rg = G.registro({ centro: P.centro, dir: P.dir, comprimento: P.comprimento, dn: P.dn, material: P.material, variante: P.variante, acessorio: P.acessorio, varMaterial: V0.material }, { lod: "perto", frente: frenteAcessorio(P) });
          return rg.partes.map(function (pt) { return U._malhaG(THREE, pt.malha, T.matFantasma(false)); });
        });
      } else T._grupoCom(chave, function () { return T._malhasInst(P.ops, null); });
      T.grupo.position.set(0, 0, 0); T.grupo.rotation.set(0, 0, 0); T.grupo.visible = true; T._pintarErro(false);
      T._status(r.nome + " no trecho " + r.trecho + " · DN " + r.dn + (r.avisos.length ? " — " + r.avisos.join(" ") : "") + ". Clique para colocar (o tubo é dividido); Espaço gira em torno do tubo; Esc encerra.");
      return true;
    },
    _status: function (t) { if (t === T._ultStatus) return; T._ultStatus = t; try { if (global.BimShell && BimShell.status) BimShell.status(t); } catch (e) {} },

    /* ------------------------------------------------ PLANTA e CORTE (SVG) */
    _limpar2d: function () { if (typeof document === "undefined" || !T._tem2d) return; T._tem2d = false; Array.prototype.forEach.call(document.querySelectorAll("g.ic-cam"), function (g) { g.parentNode.removeChild(g); }); },
    mover2d: function (id, ev, p) {
      var md = T.ctx ? T.modo() : null, D = global.Bim2D, K = global.BimInstCon, c = D && D._cache ? D._cache[id] : null;
      if (!md || !c || !c.svg || !p || !K) { if (!md) T._limpar2d(); return; }
      var def = D.def ? D.def(id) : null; if (!def) return;
      var planta = def.tipo === "planta", w = planta ? { x: p[0], y: T.base(), z: p[1] } : K.doDesenho(def, { x: p[0], y: p[1] });
      if (!w) return;
      var ctm = c.svg.getScreenCTM(), esc = ctm ? Math.abs(ctm.a) || 1 : 1;
      var proj = function (q) { return K.noDesenho(def, q); }, NS = "http://www.w3.org/2000/svg";
      var g = c.svg.querySelector("g.ic-cam");
      if (!g) { g = document.createElementNS(NS, "g"); g.setAttribute("class", "ic-cam"); g.setAttribute("pointer-events", "none"); g.setAttribute("data-colocar", "1"); }
      if (g.parentNode !== c.svg || c.svg.lastChild !== g) c.svg.appendChild(g);
      while (g.firstChild) g.removeChild(g.firstChild);
      T._tem2d = true;
      function el(tag, at) { var e = document.createElementNS(NS, tag); Object.keys(at).forEach(function (k) { e.setAttribute(k, at[k]); }); if (tag !== "text") e.setAttribute("vector-effect", "non-scaling-stroke"); g.appendChild(e); return e; }
      function poli(pts, at) { var d = ""; pts.forEach(function (q, i) { var s = proj(q); if (s) d += (i ? "L" : "M") + r4(s.x) + " " + r4(s.y); }); return d ? el("path", Object.assign({ d: d }, at)) : null; }
      var ESTILO = { fill: "rgba(56,189,248,.28)", stroke: "#0284c7", "stroke-width": "1.6" };
      if (md === "tubo") {
        var cf = global.BimInstUI.cfg, wP = planta ? null : w;
        var al = tuboSob(T.estado(), { x: p[0], y: p[1] }, { proj: proj, tol: GEO.pxTubo / esc, filtro: T.filtroTubo(cf.famId), yTrab: wP ? wP.y : null });
        T._mostrarTubo(al, function () { return planta ? { x: p[0], y: 0, z: p[1] } : w; }, id);
        if (!al) return;
        poli([al.trecho.p1, al.trecho.p2], { stroke: "#facc15", "stroke-width": "9", "stroke-opacity": ".55", fill: "none", "stroke-linecap": "round", "data-colocar-realce": al.trecho.id });
        var r = T.hover && T.hover.res;
        if (r && r.ok) {
          var P = r.previa, de = Math.max(0.02, P.dn / 1000);
          if (r.oQue === "acessorio") {
            var h = P.comprimento / 2, n = ladoBase(P.dir), f = frenteAcessorio(P), fr = f ? { x: f[0], y: f[1], z: f[2] } : n;
            var c0 = P.centro, a1 = add3(c0, P.dir, -h), a2 = add3(c0, P.dir, h), lw = de * 0.9;
            poli([add3(a1, n, lw), add3(a2, n, lw), add3(a2, n, -lw), add3(a1, n, -lw), add3(a1, n, lw)], ESTILO);
            poli([c0, add3(c0, fr, de * 2.4)], { stroke: "#0284c7", "stroke-width": "2", fill: "none" });
          } else {
            var s0 = proj(P.centro); if (s0) el("circle", { cx: r4(s0.x), cy: r4(s0.y), r: r4(6 / esc), fill: "rgba(56,189,248,.5)", stroke: "#0284c7", "stroke-width": "1.6" });
            if (P.ramal) poli([P.centro, add3(P.centro, P.ramal, P.ramalL)], { stroke: "#0284c7", "stroke-width": "4", "stroke-opacity": ".7", fill: "none" });
          }
        } else if (r && !r.ok) { var sx = proj(al.q); if (sx) el("circle", { cx: r4(sx.x), cy: r4(sx.y), r: r4(7 / esc), fill: "rgba(239,68,68,.4)", stroke: "#dc2626" }); }
        return;
      }
      var pose = md === "familia" ? T.poseFamiliaEm({ x: w.x, z: w.z }) : T.posePecaEm({ x: w.x, z: w.z });
      if (!pose) return;
      T._pose = pose;
      if (T.ctx.scene && md) T._mostrarPose(md, { x: w.x, z: w.z });   /* o 3D lado a lado acompanha */
      var co = Math.cos(pose.rotY), si = Math.sin(pose.rotY);
      function W(lx, ly, lz) { return { x: pose.x + lx * co + lz * si, y: pose.y + ly, z: pose.z - lx * si + lz * co }; }
      if (md === "familia") {
        var fs = T.ctx.edit.famSel, av = T.ctx.famAval(fs.famId, fs.tipoId, fs.inst || {}), b = av && (av.caixaObstaculo || av.caixa);
        if (b) {
          if (planta) poli([W(b.x0, 0, b.z0), W(b.x1, 0, b.z0), W(b.x1, 0, b.z1), W(b.x0, 0, b.z1), W(b.x0, 0, b.z0)], ESTILO);
          else { var cs = [], xs = [], ys = []; [b.x0, b.x1].forEach(function (x) { [b.y0, b.y1].forEach(function (yv) { [b.z0, b.z1].forEach(function (z) { var s = proj(W(x, yv, z)); if (s) { xs.push(s.x); ys.push(s.y); } }); }); }); if (xs.length) el("rect", Object.assign({ x: r4(Math.min.apply(null, xs)), y: r4(Math.min.apply(null, ys)), width: r4(Math.max.apply(null, xs) - Math.min.apply(null, xs)), height: r4(Math.max.apply(null, ys) - Math.min.apply(null, ys)) }, ESTILO)); }
          if (planta && T.categoria(fs.famId) === "loucas") { var pts = []; for (var i = 0; i <= 24; i++) { var tt = TAU * i / 24; pts.push(W((b.x0 + b.x1) / 2 + (b.x1 - b.x0) * 0.36 * Math.cos(tt), b.y1, (b.z0 + b.z1) / 2 + (b.z1 - b.z0) * 0.36 * Math.sin(tt))); } poli(pts, { fill: "none", stroke: "#0284c7", "stroke-width": "1.2" }); }
          poli([W(0, 0, 0), W(0, 0, Math.max(b.z1, 0.15))], { stroke: "#0284c7", "stroke-width": "1.2", "stroke-dasharray": "4 3", fill: "none" });   /* a frente */
        }
      } else {
        var Pk = BI().PECAS[global.BimInstUI.cfg.peca] || {};
        if (Pk.forma === "cil") { var cpt = []; for (var j = 0; j <= 24; j++) { var t2 = TAU * j / 24; cpt.push(W(Pk.r * Math.cos(t2), 0, Pk.r * Math.sin(t2))); } poli(cpt, ESTILO); }
        else { var hw = num(Pk.w, 0.15) / 2, hd = num(Pk.d, Pk.w || 0.15) / 2; poli([W(-hw, 0, -hd), W(hw, 0, -hd), W(hw, 0, hd), W(-hw, 0, hd), W(-hw, 0, -hd)], ESTILO); poli([W(0, 0, 0), W(0, 0, hd * 1.6)], { stroke: "#0284c7", "stroke-width": "1.2", "stroke-dasharray": "4 3", fill: "none" }); }
      }
      if (planta && pose.cota) {
        var A = proj({ x: pose.cota.a.x, y: pose.y, z: pose.cota.a.z }), Bq = proj({ x: pose.cota.b.x, y: pose.y, z: pose.cota.b.z });
        if (A && Bq) { el("line", { x1: r4(A.x), y1: r4(A.y), x2: r4(Bq.x), y2: r4(Bq.y), stroke: "#d97706", "stroke-width": "1.2", "stroke-dasharray": "5 3", "data-colocar-cota": "1" });
          var tx = el("text", { x: r4((A.x + Bq.x) / 2), y: r4((A.y + Bq.y) / 2 - 4 / esc), "font-size": r4(12 / esc), fill: "#92400e", "text-anchor": "middle", "paint-order": "stroke", stroke: "#fff", "stroke-width": r4(3 / esc), "letter-spacing": "0", style: "letter-spacing:0;word-spacing:0" }); tx.textContent = fmt(pose.cota.d, 2) + " m"; }
      }
    },

    /* ------------------------------------------------ CLIQUES */
    /* o clique da família (gancho no editColocarFamilia do js/bim.js): a mesma pose da prévia */
    pose: function (p) { if (!T.ctx || T.modo() !== "familia" || !p) return null; return T.poseFamiliaEm({ x: p.x, z: p.z }); },
    /* acessório/conexão: o alvo é o da PRÉVIA (o que a pessoa via); sem prévia recente, o tubo mais perto do clique em planta */
    cliqueTubo: function (ctx, p) {
      var U = global.BimInstUI, cf = U && U.cfg, ed = ctx.edit, est = ed.estado, ops = ed.ops || [];
      /* JUNÇÃO 18/10/2026: no 3D a prévia é refeita na posição ATUAL do cursor antes de valer (o clique nunca usa uma
         prévia atrasada do limitador de movimento) */
      if (T.hover && T.hover.vista === "3d" && T._ev && T.modo() === "tubo") { try { T._moverTubo3d({ clientX: T._ev.x, clientY: T._ev.y }); } catch (eR) {} }
      var h = T.hover && Date.now() - T.hover.t < 4000 ? T.hover : null, al = null;
      if (h) { var t0 = trechoDe(est, h.trecho); if (t0) al = { trecho: t0, q: h.q }; }
      if (!al && p) al = tuboSob(est, p, { tol: 0.25, filtro: T.filtroTubo(cf.famId) });
      if (!al) { ctx.hint("Passe o mouse EM CIMA de um tubo (ele fica realçado) e clique."); return true; }
      var r = inserir(est, ctx.famAval, ops, { trecho: al.trecho.id, q: al.q }, T.cfgTubo(h ? h.cursor : (p ? { x: p.x, y: p.y, z: p.z } : null)));
      if (!r.ok) { ctx.hint(r.motivo); return true; }
      if (r.op.op === "lote") { var b = B(); if (!b || !b.editarLote || !b.editarLote(r.op)) { ctx.hint("Não consegui gravar a " + r.nome.toLowerCase() + "."); return true; } }
      else ctx.op(r.op);
      T.hover = null;
      ctx.hint(r.nome + " no trecho " + r.trecho + " (DN " + r.dn + "): o tubo foi dividido" + (r.oQue === "acessorio" ? " e o acessório entrou ligado nos dois lados" : (r.ramal ? ", com o ramal " + r.ramal : "")) + (r.avisos.length ? " — " + r.avisos.join(" ") : "") + ". Clique em outro tubo, ou Esc.");
      ctx.marcar();
      return true;
    },

    /* ------------------------------------------------ ESPAÇO */
    tecla: function (ev) {
      if (!ev || (ev.key !== " " && ev.code !== "Space") || ev.ctrlKey || ev.metaKey || ev.altKey || !T.ativo()) return;
      var t = ev.target || {}; if (/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName || "") || t.isContentEditable) return;
      if (!T.ctx || !T.ctx.S || !T.ctx.S.alive) return;
      var sg = ev.shiftKey ? -1 : 1, md = T.modo();
      if (md === "familia") {
        var ed = T.ctx.edit; ed.famRot = normAng(num(ed.famRot, 0) + sg * Math.PI / 2);
        T._status("Giro " + Math.round(ed.famRot * 180 / Math.PI) + "° — Espaço gira 90°, Shift+Espaço volta.");
      } else if (md === "peca") { T.rot = ((T.rot + sg * 90) % 360 + 360) % 360; T._status("Giro " + T.rot + "° — Espaço gira 90°, Shift+Espaço volta."); }
      else if (md === "tubo") { T.giro = ((T.giro + sg * 90) % 360 + 360) % 360; T._status("Giro em torno do tubo: " + T.giro + "°."); }
      else if (!md && !(T.ctx.edit && T.ctx.edit.on && T.ctx.edit.sub)) { if (!T.girarSelecionada(sg)) return; }
      else return;
      ev.preventDefault(); ev.stopImmediatePropagation();
      T._repintar();
    },
    _repintar: function () {
      var md = T.modo(), e = T._ev; T._t = 0;
      if (md === "tubo" && T.hover && T.hover.vista === "3d" && e) T._moverTubo3d({ clientX: e.x, clientY: e.y });
      else if ((md === "familia" || md === "peca") && T._pose) T._mostrarPose(md, { x: T._pose.x, z: T._pose.z });
      var D = global.Bim2D, PM = global.BimPlantaModelar; if (T._ult2d && D && PM) T.mover2d(T._ult2d.id, null, T._ult2d.p);
    },
    girarSelecionada: function (sg) {
      var b = B(); if (!b || !b.selecao || !b.editarEstado) return false;
      var u = (b.selecao().uids || []).filter(function (x) { return /^edit:/.test(x); }); if (u.length !== 1) return false;
      var est = b.editarEstado(); if (!est || !est.estado) return false;
      var r = girar(est.estado, function (f, t, i) { return b.familiaAvaliar(f, t, i); }, u[0], sg, { ops: b.editarOps ? b.editarOps() : [], categoria: T.categoria });
      if (!r.ok) { if (/^Tubo/.test(r.motivo)) { T._status(r.motivo); return true; } return false; }
      if (r.op.op === "lote") b.editarLote(r.op); else b.instOp(r.op);
      try { b.selecionar([u[0]], "trocar"); } catch (e) {}
      T._status(r.tipo === "familia" ? (r.modo === "lado" ? "Passou para o outro lado da parede" : "Girada " + (sg > 0 ? "90°" : "−90°")) + (r.tubos ? "; " + r.tubos + " tubo(s) acompanharam" : "") + ". Ctrl+Z desfaz." :
        (r.tipo === "peca" ? "Girada para " + Math.round(r.para.rotY * 180 / Math.PI) + "°. Ctrl+Z desfaz." : "Girado em torno do tubo: " + r.para.giro + "°. Ctrl+Z desfaz."));
      T._ultimoGiro = r;
      return true;
    },

    /* ------------------------------------------------ montagem */
    montar3d: function (ctx) {
      T.ctx = ctx; T.instalar();
      return { mover: T.mover, pose: T.pose, familia: function () { return !!T.modo(); }, limpar: T.limpar };
    },
    instalar: function () {
      if (T._instalado || typeof document === "undefined") return;
      var U = global.BimInstUI, PM = global.BimPlantaModelar; if (!U) return;
      T._instalado = true;
      document.addEventListener("keydown", T.tecla, true);
      document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") setTimeout(function () { if (!T.modo()) T.limpar(); }, 0); }, false);
      /* o clique do acessório (3D, planta, corte) passa pela prévia */
      var cAc = U.cliqueAcessorio;
      U.cliqueAcessorio = function (ctx, p) { if (T.ctx && T.ativo() && T.cliqueTubo(ctx, p)) return; return cAc.apply(this, arguments); };
      /* a peça (caixa, ralo): a pose da prévia (giro, piso acabado) vai no clique */
      var cq = U.clique;
      U.clique = function (ctx, p, ev) {
        if (T.ctx && T.ativo() && this.cfg && this.cfg.ferramenta === "peca" && ctx && p) {
          var pose = T.posePecaEm(p), op0 = ctx.op;
          /* item 8: o x/z da pose (no passo da grade, se ligada) — o mesmo lugar da prévia */
          ctx = Object.assign({}, ctx, { op: function (o) { if (o && o.op === "peca" && pose) { o.rotY = pose.rotY; o.x = pose.x; o.z = pose.z; if (pose.encaixe === "piso") o.y = pose.y; } return op0(o); } });
        }
        return cq.call(this, ctx, p, ev);
      };
      /* Propriedades do acessório: as conexões que entram no tubo também */
      var esq = U.esquemaAcessorio;
      U.esquemaAcessorio = function () {
        var e = esq.apply(this, arguments), I = BI(), c = U.cfg || {};
        if (!T.ativo()) return e;   /* P8: sem a prévia hidro, as Propriedades do acessório do master */
        try {
          var sec = e.secoes[0], pf = sec.params.filter(function (x) { return x.id === "i:famId"; })[0];
          if (pf) pf.opcoes = ORDEM_INLINE.map(function (id) { return { id: id, rotulo: nomeInline(id) + (CONEXOES[id] && CONEXOES[id].pendente ? " (pendente)" : "") }; });
          if (oQue(c.famId) === "conexao") {
            sec.params = sec.params.filter(function (x) { return x.id !== "i:tipoId"; });
            var dns = (I.MATERIAIS.pvc_soldavel.dns || []).concat(I.MATERIAIS.pvc_esgoto.dns || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
            if (c.famId === "cx:reducao") sec.params.push({ id: "i:dnNovo", rotulo: "DN de saída (jusante)", tipo: "lista", valor: String(c.dnNovo || ""), opcoes: [{ id: "", rotulo: "o DN abaixo do tubo" }].concat(dns.map(function (d) { return { id: String(d), rotulo: "DN " + d }; })) });
            if (CONEXOES[c.famId] && CONEXOES[c.famId].ramal) sec.params.push({ id: "i:dnRamal", rotulo: "DN do ramal", tipo: "lista", valor: String(c.dnRamal || ""), opcoes: [{ id: "", rotulo: "o DN do tubo" }].concat(dns.map(function (d) { return { id: String(d), rotulo: "DN " + d }; })) });
            e.titulo = "Conexão no tubo";
          }
        } catch (eE) {}
        var on = e.onMudar;
        e.onMudar = function (id, valor) { if (id === "i:dnNovo" || id === "i:dnRamal") { U.cfg[id.slice(2)] = valor === "" ? null : +valor; return U.esquemaFerramenta(); } return on.apply(this, arguments); };
        return e;
      };
      var dc = U.dicaAcessorio;
      U.dicaAcessorio = function () { var c = U.cfg || {}; if (!T.ativo()) return dc.apply(this, arguments); if (oQue(c.famId) === "conexao") return nomeInline(c.famId) + ": passe o mouse EM CIMA do tubo e clique — ele é dividido e a conexão sai da rede no DN dele" + (CONEXOES[c.famId].ramal ? " (o ramal vai para o lado do cursor)" : "") + ". Espaço gira; Esc encerra."; return dc.apply(this, arguments).replace("clique EM CIMA de um tubo de água", "passe o mouse EM CIMA de um tubo de água (ele realça e o registro aparece no eixo) e clique") + " Espaço gira o volante em torno do tubo."; };
      /* a planta e o corte: a prévia por cima do desenho */
      if (PM && PM.mover2d && !PM._colocarEmb) {
        var m2 = PM.mover2d; PM._colocarEmb = true;
        PM.mover2d = function (id, ev, p) { var r = m2.apply(this, arguments); try { if (T.ctx && T.modo()) { T._ult2d = { id: id, p: p }; T.mover2d(id, ev, p); } else T._limpar2d(); } catch (e2) {} return r; };
      }
    }
  };

  var BimInstColocar = {
    VERSAO: 1, GEO: GEO, CONEXOES: CONEXOES, ORDEM_INLINE: ORDEM_INLINE,
    oQue: oQue, nomeInline: nomeInline, tuboSob: tuboSob, encaixeGrade: encaixeGrade, inserir: inserir, girar: girar, poseFamilia: poseFamilia, cotaParede: cotaParede,
    paredeAtras: paredeAtras, frenteAcessorio: frenteAcessorio, giroPara: giroPara, ladoComodo: ladoComodo, ladoJusante: ladoJusante, idsUsados: idsUsados, novoId: novoId,
    montar3d: T.montar3d, tela: T
  };
  global.BimInstColocar = BimInstColocar;
  if (typeof module !== "undefined" && module.exports) module.exports = BimInstColocar;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
