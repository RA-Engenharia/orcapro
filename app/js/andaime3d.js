/* =====================================================================
 * andaime3d.js — AS PEÇAS DO ANDAIME NO 3D, UM InstancedMesh POR TIPO DE PEÇA (E7, 27/10/2026)
 *
 * POR QUE EXISTE. Um andaime de 30 m × 20 m tem ~3 000 conexões; como família comum cada uma vira 2 a 6 malhas (uma por material), cada
 * malha com a geometria PRÓPRIA — dezenas de milhares de malhas e de geometrias, e o teto de 1 500 conexões do E2 só existia por isso.
 * Aqui as instâncias de MESMA peça (mesma família, mesmo tipo, mesmos parâmetros) dividem UMA geometria por material e um InstancedMesh
 * (64 bytes por peça: a matriz) — o molde de js/alvassentamento3d.js (a parede crua, 20/10/2026, o defeito do Out of Memory).
 *
 * MOTOR PURO + FIAÇÃO FINA:
 *   agrupar(itens, avaliar)          lista de instâncias → grupos por tipo de peça (puro; Node-testável; é o que conta chamadas de desenho)
 *   montar(THREE, grupos, opc)       grupos → InstancedMesh (um por tipo de peça e material) + a malha-carregadora do símbolo de planta
 *   montar3d(api)                    o gancho do js/bim.js: S._andaime3d.ini / coletar / fim / refazer
 *
 * ⚠ O QUE NÃO MUDA: cada instância continua sendo um elemento da lista do modelo (uid, quantitativo, massa, nome) — só não tem malha própria.
 *   Por isso o clique no 3D acerta o conjunto e não a braçadeira solta (limite dito; a seleção por peça é da E5).
 * ⚠ ADAPTAÇÃO À CARGA: se o total de triângulos do Alto passa de TETO.triangulos, o andaime inteiro cai para o Médio (anel + bloco) e o
 *   resumo diz. Escolha de engenharia de desempenho: quem precisa do Alto aproxima a vista de um trecho (o nível da vista é do usuário).
 * ES5, IIFE. Teste: node tools/test-familiasandaime.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function num(v, d) { return typeof v === "number" && isFinite(v) ? v : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  var TETO = { triangulos: 2000000 };
  /* parâmetros que NÃO mudam a forma (marca, massa, conjunto de origem): ficam fora da chave do grupo */
  var SEM_FORMA = { andaime: 1, Massa_kg: 1, pronta: 1, Inclinacao_rad: 1 };   /* Inclinacao_rad (escada de mão inclinada) é só da matriz da instância */

  function formaDe(it) { var o = {}; Object.keys(it.inst || {}).forEach(function (k) { if (!SEM_FORMA[k]) o[k] = it.inst[k]; }); return o; }
  function chaveDe(it, nivel) {
    var ks = Object.keys(it.inst || {}).filter(function (k) { return !SEM_FORMA[k]; }).sort();
    return it.famId + "|" + (it.tipoId || "") + "|" + nivel + "|" + ks.map(function (k) { return k + "=" + JSON.stringify(it.inst[k]); }).join(",");
  }
  /* agrupar(itens, avaliar, nivel): itens = [{ id, famId, tipoId, inst, x, y, z, rotY }]; avaliar(famId, tipoId, inst) → saída do js/familia.js
     (solidos, simboloPlanta, caixa). Devolve { grupos, nTri, nMalhas, nInstancias, semForma } — nMalhas = chamadas de desenho do 3D. */
  function agrupar(itens, avaliar, nivel) {
    var gs = {}, ordem = [], nTri = 0, nMalhas = 0, sem = [];
    arr(itens).forEach(function (it) {
      var k = chaveDe(it, nivel), g = gs[k];
      if (!g) {
        var inst = {}; Object.keys(it.inst || {}).forEach(function (kk) { if (!SEM_FORMA[kk]) inst[kk] = it.inst[kk]; });
        inst.Nivel_detalhe = nivel;
        var av = avaliar(it.famId, it.tipoId, inst);
        if (!(av && av.ok && arr(av.solidos).length)) { sem.push(it.id); return; }
        g = gs[k] = { chave: k, famId: it.famId, tipoId: it.tipoId, av: av, itens: [], tri: 0 };
        g.tri = av.solidos.reduce(function (a, s) { return a + arr(s.f).length / 3; }, 0); ordem.push(k);
      }
      g.itens.push(it);
    });
    var grupos = ordem.map(function (k) { var g = gs[k]; nTri += g.tri * g.itens.length; nMalhas += g.av.solidos.length; return g; });
    return { grupos: grupos, nTri: Math.round(nTri), nMalhas: nMalhas, nInstancias: arr(itens).length - sem.length, semForma: sem };
  }

  /* montar(THREE, agr, opc): opc = { mat(nome) → material, planta(simboloPlanta) → segmentos [x1,z1,x2,z2…] locais, uv?(nomeMaterial) → função(posições) → uv | null }.
     Devolve { objetos: [Object3D], malhas, instancias, triangulos }. As malhas levam sem2d (a vista 2D não lê a geometria-base) e
     instFam (a troca de nível as descarta); a malha-carregadora leva o símbolo de planta no mundo (mobPlanta) como as famílias de mobiliário. */
  function montar(THREE, agr, opc) {
    opc = opc || {};
    var objetos = [], malhas = 0, tri = 0, q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0), p = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1), M = new THREE.Matrix4();
    agr.grupos.forEach(function (g) {
      var n = g.itens.length, mats = [];
      g.av.solidos.forEach(function (s) {
        var geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(s.v, 3)); geo.setIndex(s.f); geo.computeVertexNormals();
        var uvf = opc.uv ? opc.uv(s.material) : null; if (uvf) geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvf(s.v), 2));   /* M2: o piso furado por textura de recorte precisa de UV plano (o motor devolve u, v por vértice) */
        var im = new THREE.InstancedMesh(geo, opc.mat ? opc.mat(s.material) : new THREE.MeshStandardMaterial(), n);
        g.itens.forEach(function (it, i) { e.set(num(it.inst && it.inst.Inclinacao_rad, 0), num(it.rotY, 0), 0, "YXZ"); q.setFromEuler(e); p.set(num(it.x, 0), num(it.y, 0), num(it.z, 0)); M.compose(p, q, s1); im.setMatrixAt(i, M); });
        im.instanceMatrix.needsUpdate = true; im.frustumCulled = false;   /* a esfera de limite é a da geometria-base (na origem), não a das instâncias */
        im.userData.instForma = g.itens.length ? formaDe(g.itens[0]) : {}; im.userData.instIds = g.itens.map(function (it) { return it.id; });   /* diagnóstico: a forma do grupo e quem está em cada índice da matriz (a e2e de encaixe confere o mundo) */
        im.userData.andaime3d = true; im.userData.sem2d = true; im.userData.instFam = true; im.userData.famId = g.famId;
        objetos.push(im); malhas++; tri += (s.f.length / 3) * n; mats.push(im);
      });
      /* o símbolo de PLANTA de cada instância, no mundo, numa malha-carregadora de 1 triângulo degenerado (invisível): é por ela que a vista 2D
         (js/bim.js vista2d, ramo `mobSem2d`) acha o desenho do tubo/braçadeira/madeira em vez da geometria-base instanciada */
      if (g.av.simboloPlanta && opc.planta) {
        var lp = opc.planta(g.av.simboloPlanta), w = [], yMin = Infinity, yMax = -Infinity;
        g.itens.forEach(function (it) {
          var c = Math.cos(num(it.rotY, 0)), s = Math.sin(num(it.rotY, 0));
          for (var i = 0; i + 3 < lp.length; i += 4) w.push(it.x + lp[i] * c + lp[i + 1] * s, it.z - lp[i] * s + lp[i + 1] * c, it.x + lp[i + 2] * c + lp[i + 3] * s, it.z - lp[i + 2] * s + lp[i + 3] * c);
          var cx = g.av.caixa; yMin = Math.min(yMin, it.y + (cx ? cx.y0 : 0)); yMax = Math.max(yMax, it.y + (cx ? cx.y1 : 1));
        });
        var gg = new THREE.BufferGeometry(); gg.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
        var car = new THREE.Mesh(gg, new THREE.MeshBasicMaterial()); car.visible = false; car.frustumCulled = false;
        car.userData.mobSem2d = true; car.userData.mobPlanta = w; car.userData.mobFaixaY = [yMin, yMax]; car.userData.andaime3d = true; car.userData.instFam = true; car.userData.tipo = "IFCBUILDINGELEMENTPROXY";
        objetos.push(car);
      }
    });
    return { objetos: objetos, malhas: malhas, instancias: agr.nInstancias, triangulos: Math.round(tri) };
  }

  /* o gancho do js/bim.js. api = { THREE, S, famAval(famId, tipoId, inst), famMat(nome), nivel(fam), planta(simbolo), registrar(objeto) }.
     ini() zera a coleta; coletar(fi, av, fam) guarda a instância e devolve true (o bim.js não cria malha); fim(mo) monta e põe em mo.grupo. */
  function montar3d(api) {
    var itens = [], ultimo = null;
    function nivelAtual(fam) { try { return api.nivel ? api.nivel(fam) : "alto"; } catch (e) { return "alto"; } }
    function ini() { itens = []; }
    function coletar(fi, av, fam) {
      if (!fi || !av) return false;
      itens.push({ id: fi.id, famId: fi.famId, tipoId: fi.tipoId, inst: fi.inst || {}, x: fi.x, y: fi.y, z: fi.z, rotY: fi.rotY || 0, fam: fam });
      return true;
    }
    function fim(mo) {
      if (!itens.length) { ultimo = null; return null; }
      var nv = nivelAtual(itens[0].fam), agr = agrupar(itens, api.famAval, nv), adaptou = false;
      if (nv === "alto" && agr.nTri > TETO.triangulos) { agr = agrupar(itens, api.famAval, "medio"); adaptou = true; nv = "medio"; }
      var r = montar(api.THREE, agr, { mat: api.famMat, planta: api.planta, uv: api.uv });
      r.objetos.forEach(function (o) { o.userData.instNivel = nv; if (api.registrar) api.registrar(o, mo); else mo.grupo.add(o); });
      ultimo = { nivel: nv, adaptouAoTeto: adaptou, tipos: agr.grupos.length, malhas: r.malhas, instancias: r.instancias, triangulos: r.triangulos, semForma: agr.semForma.length };
      itens = [];
      return ultimo;
    }
    return { ini: ini, coletar: coletar, fim: fim, resumo: function () { return ultimo; } };
  }

  var Andaime3D = { TETO: TETO, agrupar: agrupar, montar: montar, montar3d: montar3d, chaveDe: chaveDe };
  global.Andaime3D = Andaime3D;
  if (typeof module !== "undefined" && module.exports) module.exports = Andaime3D;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
