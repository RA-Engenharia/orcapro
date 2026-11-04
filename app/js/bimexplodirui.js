/* =====================================================================
 * bimexplodirui.js — a vista EXPLODIDA, as COTAS VIVAS e o FOCO NA PEÇA no 3D (03/11/2026). A fiação: o motor é o
 * js/bimexplodir.js (carimbos, deslocamento, animação) e o js/bimcotaviva.js (qual aresta cotar e onde pôr o texto).
 * Padrão de `BimControle.criar(S, THREE)`: empurra um tick em `S._tickExtra` e devolve a API que o js/bim.js põe em
 * `window.BIM` (explodirInfo, explodir, explodirMontar, explodirEstado, cotasVivas, focoPeca, focoSair, dadosPeca,
 * _cotasVivasDiag). Vale também para o visitante (link/placa).
 *
 * COMO AS PEÇAS ANDAM (decidido, não trocar por `_solta` em tudo): as peças ficam no MESCLADO.
 *   1. mesclado: cada parte tem `malha.geometry.attributes.position` e `faixas[{iniVert, nVert, ref}]` (js/bimagreg.js).
 *      Guarda-se uma cópia da base na 1ª vez e, a cada quadro, `pos = base + k·d(ref)`. Soma em float: a origem do
 *      mesclado já foi subtraída antes do float32, então o deslocamento (metros) não perde precisão.
 *   2. arestas da linha oculta (`S._arestasDoModelo(mid)`): a mesma conta, só se estiverem montadas.
 *   3. a malha REAL (o clique, o raio da trena, a RA, a caixa) ganha `userData._matFechada` (o mesclado reconstrói por
 *      ela) e a posição somada de k·d. Ao chegar em k = 0 a posição volta EXATA e o `_matFechada` que a explodida criou
 *      é apagado (o de porta que já existia NÃO se mexe).
 *   4. mesclado reconstruído (raio-X, troca de textura) com a explodida ligada: o buffer novo é detectado pela identidade
 *      do array e o deslocamento é reaplicado.
 *   5. modelo grande (> 400 mil vértices no conjunto): sem animação, vai direto ao fim em um passo.
 *   6. caches de encaixe/trena: NÃO precisam ser invalidados — `arestasDe(geo)` e `centrosCache` guardam coordenada LOCAL
 *      da geometria e a consulta aplica `obj.matrixWorld` na hora (que já leva a posição somada).
 * ⚠ O deslocamento vive no referencial do modelRoot (o mesmo da geometria); o mesclado e as peças reais andam pelo
 *   mesmo vetor, e o modelRoot (que o imersivo move e escala) leva os dois juntos.
 * ===================================================================== */
(function (global) {
  "use strict";

  var GRANDE = 400000;      /* vértices: acima disto não anima */
  var COTA_MS = 100;        /* no máximo 10 cálculos de cota por segundo */
  var TETO_TEX = 96;        /* texturas de texto guardadas */
  var MAX_ITENS = 72;

  function criar(S, THREE) {
    var E = global.BimExplodir, C = global.BimCotaViva;
    var est = E.novoEstado(), modoId = null, dMap = {}, gen = 0, tocadas = [], ativoAplicado = false;
    /* ⚠ O SEGUNDO CANAL (o GRUPO, 03/11/2026): pos = base + k · d(uid) + k2 · s(uid). `est2` é um estado próprio (mesma duração), `dMap2` o
       plano do grupo aberto (E.planoDoGrupo). Tudo que usava só `dMap` (mesclado, arestas, malha real, cota, foco, RA) usa o TOTAL. Montar
       zera os dois e a posição volta EXATA (k2 = 0 e k = 0 → base). */
    var est2 = E.novoEstado(), dMap2 = {}, grupo = null, grupoCfg = { cotasAuto: true, cartao: true, clique: true, base: 0, topo: null }, camGrp = null, camEnq2 = null, grupoEnqAoFim = false, grupoCotasNos = false, grupoOuvinte = null;
    var plano = null, sig = null, malhas = {}, grande = false;
    var cotas = { on: false, g: null, lin: null, linPos: null, sprites: [], tex: {}, nTex: 0, ordemTex: [], nDispose: 0, ultimo: 0, sigCam: null, k: -1, itens: [], marcas: [], seq: 0, foco: -1 };
    var foco = null;
    /* a câmera: `camGuardada` = a de antes de explodir; `camEnq` = onde o enquadramento da explodida a deixou (e quando) */
    var camGuardada = null, camEnq = null, movAntes = false, serialId = 0, listaUids = [];
    var _m4 = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

    function modelos() { return S.modelos || []; }
    function matriz() {
      var m = null;
      try { m = global.BIM && global.BIM._coordMatriz ? global.BIM._coordMatriz() : null; } catch (_) { m = null; }
      /* ⚠ o web-ifc devolve a IDENTIDADE (medido): a troca de eixo está na geometria, não numa matriz que dê para ler.
         Identidade ou ausente → a permutação padrão (x, z, −y) */
      return (m && m.length === 16 && !E.ehIdentidade(m)) ? m : null;
    }

    /* ---------------------------------------------------------------- o plano e os índices */
    /* ⚠ a identidade do grupo e da lista de elementos entra na assinatura (03/11/2026, revisão): o modelo do editor refeito com a
       MESMA contagem de peças dava a mesma assinatura, e o índice (malhas, caixas) ficava apontando para as malhas de antes */
    function idDe(o) {
      if (!o || typeof o !== "object") return 0;
      if (!o.__explId) { try { Object.defineProperty(o, "__explId", { value: ++serialId, enumerable: false }); } catch (_) { return 0; } }
      return o.__explId;
    }
    function assinatura() {
      var s = "";
      modelos().forEach(function (mo) { s += mo.mid + ":" + idDe(mo.grupo) + ":" + idDe(mo.elementos) + ":" + (mo.elementos ? mo.elementos.length : 0) + ":" + (mo.grupo ? mo.grupo.children.length : 0) + "|"; });
      return s;
    }
    function reindexar() {
      var s = assinatura();
      if (s === sig && plano) return plano;
      sig = s; malhas = {}; caixas = {}; listaUids = [];
      var pecas = [], nVol = 0, pavPorUid = {};
      modelos().forEach(function (mo) {
        var pvs = (mo.pavimentos || []).filter(function (p) { return p && p.eids; }).slice();
        pvs.sort(function (a, b) { return (a.y0 == null ? 1e9 : a.y0) - (b.y0 == null ? 1e9 : b.y0); });
        pvs.forEach(function (pv, i) {
          var prox = null; for (var j = i + 1; j < pvs.length; j++) if (pvs[j].y0 != null && pv.y0 != null && pvs[j].y0 > pv.y0 + 0.2) { prox = pvs[j].y0; break; }
          pv.eids.forEach(function (eid) { pavPorUid[mo.mid + ":" + eid] = { nome: pv.nome, y0: pv.y0, y1: prox }; });
        });
        if (mo.grupo) mo.grupo.children.forEach(function (m) {
          if (!m.isMesh || m.userData.expressID == null) return;
          var u = mo.mid + ":" + m.userData.expressID; if (!malhas[u]) listaUids.push(u); (malhas[u] = malhas[u] || []).push(m);
        });
      });
      modelos().forEach(function (mo) {
        (mo.elementos || []).forEach(function (e) {
          var pv = pavPorUid[e.uid] || {};
          if (e.vol) nVol++;
          pecas.push({ uid: e.uid, modulo: e.vol ? e.vol.modulo : null, carimbo: e.vol ? (e.vol.explodir || "") : "", pav: pv.nome, y0: pv.y0, y1: pv.y1 });
        });
      });
      plano = E.plano(pecas, { matriz: matriz() });
      plano.nVol = nVol; plano.nPecas = pecas.length;
      return plano;
    }
    var caixas = {};

    function elementoDe(uid) {
      var r = null;
      modelos().forEach(function (mo) { if (r) return; (mo.elementos || []).forEach(function (e) { if (!r && e.uid === uid) r = e; }); });
      return r;
    }
    function dadosPeca(uid) {
      var e = elementoDe(uid); if (!e || !e.vol) return null;
      var v = e.vol, fu = E.lerFuros(v.furos), lg = E.lerLigacoes(v.ligacoes), fi = E.lerFicha(v.ficha, global.location && global.location.origin);
      return { uid: uid, chave: e.chave, globalId: e.globalId, marca: v.marca || "", modulo: v.modulo || "", tipo: v.tipo || "", secao: v.secao || "",
        comprimento: v.comprimento || "", furos: fu, ligacoes: lg, ficha: fi, nFuros: fu.length, nome: e.nome || "" };
    }

    function info() {
      var p = reindexar();
      return { modos: p.modos.map(function (m) { return { id: m.id, nome: m.nome, n: m.n }; }), auto: !!p.auto, nPecas: p.nPecas, nVol: p.nVol,
        motivo: p.modos.length ? "" : (p.nPecas ? "Este modelo não traz peças com afastamento definido e tem um só pavimento: não há o que explodir." : "Nenhum modelo aberto.") };
    }

    /* ---------------------------------------------------------------- mover */
    function contarVertices() {
      var n = 0, temAg = false;
      modelos().forEach(function (mo) { if (mo._agreg) { temAg = true; mo._agreg.partes.forEach(function (p) { n += p.malha.geometry.attributes.position.count; }); } });
      if (!temAg) Object.keys(malhas).forEach(function (u) { malhas[u].forEach(function (m) { if (m.geometry && m.geometry.attributes.position) n += m.geometry.attributes.position.count; }); });
      return n;
    }
    function uidDe(ref) { return ref && ref.userData ? (ref.userData.mid + ":" + ref.userData.expressID) : null; }

    /* a conta sobre um buffer de posições com faixas {ini, n, ref}: pos = base + k·d */
    function moverBuffer(holder, attr, faixas, k, k2, iniKey, nKey) {
      var arr = attr.array, b = holder._explBase, refez = false;
      if (!b || b.arr !== arr) { b = holder._explBase = { arr: arr, base: new Float32Array(arr), gen: -1, lista: null }; }
      if (b.gen !== gen) {
        /* o modo mudou (ou o buffer é novo): o que estava deslocado volta à base antes de contar de novo */
        arr.set(b.base);
        b.lista = [];
        for (var i = 0; i < faixas.length; i++) {
          var f = faixas[i], u = uidDe(f.ref), d = u ? dMap[u] : null, s = u ? dMap2[u] : null;
          if (d || s) b.lista.push({ ini: f[iniKey], n: f[nKey], d: d, s: s });
        }
        b.gen = gen; refez = true;
      }
      var base = b.base, L = b.lista;
      for (var q = 0; q < L.length; q++) {
        var it = L[q], d0 = (it.d ? it.d[0] * k : 0) + (it.s ? it.s[0] * k2 : 0), d1 = (it.d ? it.d[1] * k : 0) + (it.s ? it.s[1] * k2 : 0), d2 = (it.d ? it.d[2] * k : 0) + (it.s ? it.s[2] * k2 : 0), o = it.ini * 3, fim = o + it.n * 3;
        for (; o < fim; o += 3) { arr[o] = base[o] + d0; arr[o + 1] = base[o + 1] + d1; arr[o + 2] = base[o + 2] + d2; }
      }
      /* ⚠ `refez` (03/11/2026, revisão): parte sem peça no plano de agora volta à base mas tem L vazio com k ≠ 0 — o buffer da GPU ficava com o deslocamento de antes */
      if (L.length || k === 0 || refez) attr.needsUpdate = true;
    }
    function soltarBase(holder, attr) {
      var b = holder._explBase; if (!b) return;
      if (b.arr === attr.array) { attr.array.set(b.base); attr.needsUpdate = true; }
      holder._explBase = null;
    }

    /* as peças que andam: as do modo (dMap) e as do grupo aberto (dMap2) */
    function movel() { var ks = Object.keys(dMap); Object.keys(dMap2).forEach(function (u) { if (!dMap[u]) ks.push(u); }); return ks; }
    function aplicar(k, k2) {
      if (k2 === undefined) k2 = est2.k;
      /* 1) as malhas reais */
      movel().forEach(function (u) {
        var d = dMap[u], s = dMap2[u], ms = malhas[u] || [];
        var tx = (d ? d[0] * k : 0) + (s ? s[0] * k2 : 0), ty = (d ? d[1] * k : 0) + (s ? s[1] * k2 : 0), tz = (d ? d[2] * k : 0) + (s ? s[2] * k2 : 0);
        for (var i = 0; i < ms.length; i++) {
          var m = ms[i], ud = m.userData;
          if (!ud._explPos0) {
            /* ⚠ a POSE inteira, não só a posição (03/11/2026, revisão): a porta que abria no meio da explodida girava a malha, e o
               Montar devolvia só a posição — a folha ficava na pose errada até recarregar */
            ud._explPos0 = m.position.clone(); ud._explQuat0 = m.quaternion.clone(); ud._explEsc0 = m.scale.clone();
            if (!ud._matFechada) { ud._matFechada = m.matrix.clone(); ud._explCriouMat = true; }
            tocadas.push(m);
          }
          m.position.set(ud._explPos0.x + tx, ud._explPos0.y + ty, ud._explPos0.z + tz);
          m.updateMatrix(); m.matrixWorldNeedsUpdate = true;
        }
      });
      /* 2) o mesclado e 3) as arestas */
      modelos().forEach(function (mo) {
        if (mo._agreg) mo._agreg.partes.forEach(function (pt) { moverBuffer(pt, pt.malha.geometry.attributes.position, pt.faixas, k, k2, "iniVert", "nVert"); });
        var ar = S._arestasDoModelo ? S._arestasDoModelo(mo.mid) : null;
        if (ar && ar.ls) moverBuffer(ar, ar.ls.geometry.attributes.position, ar.faixas, k, k2, "ini", "n");
      });
      ativoAplicado = true;
    }
    function finalizar() {
      /* k = 0: a posição volta EXATA, o _matFechada que a explodida criou some, as bases são largadas */
      tocadas.forEach(function (m) {
        var ud = m.userData;
        if (ud._explPos0) { m.position.copy(ud._explPos0); delete ud._explPos0; }
        if (ud._explQuat0) { m.quaternion.copy(ud._explQuat0); delete ud._explQuat0; }
        if (ud._explEsc0) { m.scale.copy(ud._explEsc0); delete ud._explEsc0; }
        if (ud._explCriouMat) { delete ud._matFechada; delete ud._explCriouMat; }
        m.updateMatrix(); m.matrixWorldNeedsUpdate = true;
      });
      tocadas = [];
      modelos().forEach(function (mo) {
        if (mo._agreg) mo._agreg.partes.forEach(function (pt) { soltarBase(pt, pt.malha.geometry.attributes.position); });
        var ar = S._arestasDoModelo ? S._arestasDoModelo(mo.mid) : null;
        if (ar && ar.ls) soltarBase(ar, ar.ls.geometry.attributes.position);
      });
      ativoAplicado = false;
    }
    /* buffer reconstruído com a explodida ligada (raio-X, troca de textura): a identidade do array muda */
    function precisaReaplicar() {
      var r = false;
      modelos().forEach(function (mo) {
        if (mo._agreg) mo._agreg.partes.forEach(function (pt) { var b = pt._explBase; if (!b || b.arr !== pt.malha.geometry.attributes.position.array) r = true; });
        var ar = S._arestasDoModelo ? S._arestasDoModelo(mo.mid) : null;
        if (ar && ar.ls) { var b2 = ar._explBase; if (!b2 || b2.arr !== ar.ls.geometry.attributes.position.array) r = true; }
      });
      movel().forEach(function (u) { (malhas[u] || []).forEach(function (m) { if (!m.userData._explPos0) r = true; }); });
      return r;
    }

    /* ⚠ A CÂMERA (03/11/2026, revisão + decisão do Rogério): o Explodir guarda a câmera de antes (posição e alvo) e, ao fim do movimento,
       enquadra o conjunto (a explodida ocupa várias vezes o modelo montado e ficava pequena, com as cotas amontoadas). O Montar NÃO
       enquadra: se a câmera ainda está onde o enquadramento a deixou, voa de volta para a guardada; se a pessoa a moveu nesse meio
       tempo, fica onde está. Trocar de modo com a explodida ligada mantém a guardada original e reenquadra. Com a peça em foco o
       conjunto não é enquadrado (o foco tem o enquadramento dele) e ao fim do movimento a PEÇA é reenquadrada. */
    var enquadrarAoFim = false;
    function agoraMs() { return (typeof performance !== "undefined") ? performance.now() : Date.now(); }
    /* câmera livre para voar: o imersivo, o caminhar, a planta, o corte livre e a trava mandam na câmera (js/bim.js proíbe voar neles) */
    function voavel() {
      if (!S.camera || !S.orbit || !S._voarCam) return false;
      if ((S.xr && S.xr.on) || (S.fly && S.fly.on) || (S.planta && S.planta.on) || (S.corteL && S.corteL.on) || (S.trava && S.trava.on)) return false;
      return true;
    }
    function enquadrarConjunto() {
      var cam = S.camera; if (!voavel()) return;
      var bb = new THREE.Box3().setFromObject(S.modelRoot); if (bb.isEmpty()) return;
      /* os cantos de cada PEÇA, não os da caixa do conjunto (ver voarParaCaber) */
      var cs = [], q = new THREE.Vector3(), nMalhas = 0;
      S.modelRoot.traverseVisible(function (m) { if (m.isMesh) nMalhas++; });
      if (nMalhas <= 20000) {
        S.modelRoot.updateMatrixWorld(true);
        S.modelRoot.traverseVisible(function (m) {
          if (!m.isMesh || !m.geometry) return;
          if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
          var g = m.geometry.boundingBox; if (!g) return;
          [g.min.x, g.max.x].forEach(function (x) { [g.min.y, g.max.y].forEach(function (y) { [g.min.z, g.max.z].forEach(function (z) { q.set(x, y, z).applyMatrix4(m.matrixWorld); cs.push([q.x, q.y, q.z]); }); }); });
        });
      }
      if (!cs.length) [bb.min.x, bb.max.x].forEach(function (x) { [bb.min.y, bb.max.y].forEach(function (y) { [bb.min.z, bb.max.z].forEach(function (z) { cs.push([x, y, z]); }); }); });
      camEnq = voarParaCaber(cs, bb);
    }
    /* a câmera voa até a distância em que TODOS os cantos (no mundo) cabem na tela, olhando para o centro do desenho. Devolve onde a deixou. */
    function voarParaCaber(cs, bb, livre) {
      var cam = S.camera;
      var c = bb.getCenter(new THREE.Vector3()), dir = cam.position.clone().sub(S.orbit.target);
      if (!(dir.lengthSq() > 1e-6)) dir.set(0.7, 0.55, 0.8);
      dir.normalize();
      var dd = new THREE.Vector3().crossVectors(cam.up, dir).normalize(), up = new THREE.Vector3().crossVectors(dir, dd).normalize();
      /* ⚠ são os cantos de cada PEÇA, não os da caixa do conjunto: na explodida o canto da caixa não existe, fica vazio, e em perspectiva
         ele sozinho afastava a câmera até o conjunto ocupar um terço da tela. Modelo enorme: a caixa mesmo (quem chama decide). */
      /* o centro é o do desenho na tela: o do conjunto em 3D deixava sobra de um lado só */
      var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      cs.forEach(function (p) { var rx = p[0] - c.x, ry = p[1] - c.y, rz = p[2] - c.z, px = rx * dd.x + ry * dd.y + rz * dd.z, py = rx * up.x + ry * up.y + rz * up.z; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; });
      c.addScaledVector(dd, (x0 + x1) / 2).addScaledVector(up, (y0 + y1) / 2);
      var d = E.distanciaParaCaber(cs, [c.x, c.y, c.z], [dir.x, dir.y, dir.z], [dd.x, dd.y, dd.z], [up.x, up.y, up.z], cam.fov, cam.aspect || 1, 1.06 / ((livre && livre.frac) || 1));
      /* o desenho sobe ou desce para o meio da parte livre da tela */
      if (livre && livre.desc) c.addScaledVector(up, -livre.desc * 2 * d * Math.tan(cam.fov * Math.PI / 360));
      var raio = bb.getSize(new THREE.Vector3()).length() / 2;
      if (cam.far < d + raio * 4) { cam.far = d + raio * 4; cam.updateProjectionMatrix(); }
      var destino = c.clone().add(dir.multiplyScalar(d));
      S._voarCam(destino, c, 0.55);
      return { p: destino.clone(), t: c.clone(), em: agoraMs() };
    }
    /* a câmera ainda está onde o enquadramento a deixou? (700 ms de voo contam como "ainda nossa") */
    function ehNossa(en) {
      var tol = Math.max(0.02, en.p.distanceTo(en.t) * 0.01);
      return (agoraMs() - en.em < 700) || (S.camera.position.distanceTo(en.p) <= tol && S.orbit.target.distanceTo(en.t) <= tol);
    }
    /* o Montar: de volta à câmera de antes, se a pessoa não a mexeu desde o enquadramento */
    function voltarCamera() {
      var g = camGuardada, en = camEnq; camGuardada = null; camEnq = null;
      if (!g || !en || !voavel()) return false;
      if (!ehNossa(en)) return false;
      S._voarCam(g.p, g.t, 0.55);
      return true;
    }
    /* o Agrupar: a mesma regra, com a câmera de antes de abrir o grupo */
    function mesmaCamera(a, b) { var tol = Math.max(0.02, b.p.distanceTo(b.t) * 0.01); return a.p.distanceTo(b.p) <= tol && a.t.distanceTo(b.t) <= tol; }
    function voltarCameraGrupo() {
      var g = camGrp, en = camEnq2; camGrp = null; camEnq2 = null; grupoEnqAoFim = false;
      if (!g || !en || !voavel()) return false;
      if (!ehNossa(en)) return false;
      S._voarCam(g.p, g.t, 0.55);
      return true;
    }
    /* o grupo aberto: a câmera enquadra as peças DO GRUPO nas posições de agora */
    function enquadrarGrupo() {
      if (!voavel()) return;
      var bb = new THREE.Box3(), cs = [], M = S.modelRoot.matrixWorld, q = new THREE.Vector3();
      S.modelRoot.updateMatrixWorld(true);
      Object.keys(dMap2).forEach(function (u) {
        var cx = caixaDe(u); if (!cx) return;
        E.cantos(E.desloca(cx, deslAtual(u))).forEach(function (p) { q.set(p[0], p[1], p[2]).applyMatrix4(M); cs.push([q.x, q.y, q.z]); bb.expandByPoint(q); });
      });
      if (!cs.length || bb.isEmpty()) return;
      camEnq2 = voarParaCaber(cs, bb, parteLivre());
    }
    /* ⚠ o cartão fica por cima do desenho (03/11/2026, modelo real: cobria o terço de baixo do painel aberto). frac = fração da altura que sobra;
       desc = quanto o meio da parte livre está acima (+) ou abaixo (−) do meio da tela, em fração da altura */
    function parteLivre() {
      var cv = S.renderer && S.renderer.domElement; if (!cv || !cartaoEl || cartaoEl.hidden || !cv.getBoundingClientRect) return null;
      var r = cartaoEl.getBoundingClientRect(), t = cv.getBoundingClientRect();
      if (!(t.height > 0) || r.left >= t.right || r.right <= t.left) return null;
      var meio = (r.top + r.bottom) / 2 > (t.top + t.bottom) / 2, cobre = meio ? t.bottom - r.top : r.bottom - t.top;
      cobre = Math.max(0, Math.min(t.height * 0.5, cobre)); if (!cobre) return null;
      return { frac: 1 - cobre / t.height, desc: (meio ? 1 : -1) * cobre / (2 * t.height) };
    }
    function ligada() { return est.alvo === 1 || est.k > 0 || !!est.movendo || ativoAplicado; }
    function temGrupoMovel() { return Object.keys(dMap2).length > 0; }
    /* ⚠ o contorno verde da seleção é uma cópia da matriz da peça no instante em que foi desenhado: ao fim do movimento ele ficava
       onde a peça estava (03/11/2026, revisão). A matrixWorld da peça é atualizada antes, senão a cópia sairia a de antes do passo */
    function contornoDeNovo() {
      var sel = S.selected; if (!sel || !S._contornoSelecao) return;
      try { sel.updateMatrixWorld(true); S._contornoSelecao(sel); } catch (_) {}
    }
    function enquadrarPecaFoco() {
      if (!foco) return;
      var cx = caixaDe(foco.uid); if (!cx) return;
      var c = E.desloca(cx, deslAtual(foco.uid)), cs = E.cantos(c), bb = new THREE.Box3();
      cs.forEach(function (p) { bb.expandByPoint(new THREE.Vector3(p[0], p[1], p[2])); });
      bb.applyMatrix4(S.modelRoot.matrixWorld);
      if (S._enquadrarObj) S._enquadrarObj(bb, 1.5);
    }
    function explodir(id) {
      var p = reindexar();
      if (!p.modos.length) return { ok: false, motivo: info().motivo };
      var ok = false; p.modos.forEach(function (m) { if (m.id === id) ok = true; });
      var alvo = ok ? id : (modoId && p.modos.some(function (m) { return m.id === modoId; }) ? modoId : p.modos[0].id);
      var jaLigada = ligada(), mudou = alvo !== modoId;
      /* ⚠ a porta aberta fecha NA HORA, sem animação, antes de a explodida guardar a pose das malhas (03/11/2026, revisão): aberta, a
         folha girava junto e o Montar a devolvia na pose errada. Com a explodida ligada a porta não abre (js/bim.js abrirFechar) */
      if (!ativoAplicado && S._fecharPortasAgora) { try { S._fecharPortasAgora(); } catch (_) {} }
      if (mudou) {
        grupoSnapFechar();   /* trocar de modo fecha o grupo (os vetores do grupo foram calculados sobre o modo de antes) */
        if (ativoAplicado) { est.t = 0; est.k = 0; est.movendo = false; aplicar(0, 0); finalizar(); }
        modoId = alvo; dMap = p.desl[alvo] || {}; gen++;
      }
      grande = contarVertices() > ((BimExplodirUI && BimExplodirUI.GRANDE) || GRANDE);   /* o teto se lê na hora (o teste o baixa para provar o caminho do modelo grande) */
      if (!jaLigada && !foco && voavel()) camGuardada = { p: S.camera.position.clone(), t: S.orbit.target.clone() };
      E.ir(est, 1);
      if (grande) { est.t = 1; est.k = 1; est.movendo = false; aplicar(1); contornoDeNovo(); }
      cotas.k = -1;
      /* ⚠ só LIGA, nunca desliga: o 2º pedido idêntico (jaLigada, sem mudar de modo) apagava o enquadramento que o 1º, no mesmo quadro, já pedira */
      if (foco) enquadrarAoFim = false; else if (voavel() && (!jaLigada || mudou)) enquadrarAoFim = true;
      if (foco) foco.reenq = true;
      return { ok: true, modo: alvo, n: Object.keys(dMap).length, grande: grande, auto: !!p.auto };
    }
    /* o = {semEnquadrar:true}: não volta a câmera (quem chama já devolve a dele, como a Prancha Viva ao sair do cenário); o = {agora:true}: monta na hora */
    function montar(o) {
      if (o && o.agora) { var f = montarAgora(); return { ok: true, desfeita: f }; }   /* sem animação nem câmera: a Prancha Viva e os desenhos */
      /* ⚠ Montar fecha o grupo junto: k2 e k voltam a zero (os dois animam juntos, na mesma duração) e a posição volta EXATA */
      E.ir(est, 0); E.ir(est2, 0);
      if (grande || !ativoAplicado) {
        est.t = 0; est.k = 0; est.movendo = false;
        est2.t = 0; est2.k = 0; est2.alvo = 0; est2.movendo = false; dMap2 = {}; gen++;
        if (ativoAplicado) { aplicar(0, 0); finalizar(); contornoDeNovo(); }
      }
      cotas.k = -1;
      enquadrarAoFim = false; grupoEnqAoFim = false;
      /* ⚠ com o grupo aberto a câmera está no enquadramento DO GRUPO: se a pessoa não a moveu, ela conta como "ainda nossa" para o Montar
         voltar à câmera de antes de explodir (e não ficar onde o grupo a deixou) */
      if (camEnq2 && !(o && o.semEnquadrar) && camEnq && voavel() && ehNossa(camEnq2)) camEnq = camEnq2;
      camGrp = null; camEnq2 = null;
      if (o && o.semEnquadrar) { camGuardada = null; camEnq = null; } else voltarCamera();
      grupoLimparTela();
      if (foco) foco.reenq = true;
      return { ok: true };
    }
    /* o desenho técnico, a planta, o corte e a vista 2D medem o modelo MONTADO: monta na hora, sem animação nem câmera */
    function montarAgora() {
      if (!ligada()) return false;
      est.t = 0; est.k = 0; est.alvo = 0; est.movendo = false;
      grupoSnapFechar();
      if (ativoAplicado) { aplicar(0, 0); finalizar(); }
      cotas.k = -1; enquadrarAoFim = false; camGuardada = null; camEnq = null; if (foco) foco.reenq = false;
      try { S.modelRoot.updateMatrixWorld(true); } catch (_) {}
      contornoDeNovo();
      return true;
    }
    /* a chave do arquivo da RA: o que a explodida muda no arquivo (modo, quanto abriu, as cotas) */
    function chaveRA() { return (ligada() ? (modoId || "-") + ":" + est.k.toFixed(3) + ":" + est2.k.toFixed(3) + (temGrupoMovel() ? ":" + (grupo ? grupo.modulo : "g") : "") : "-") + ":" + (cotas.on ? 1 : 0); }
    function estado() {
      return { ativo: est.k > 0 || est.movendo || est.alvo === 1, modo: modoId, k: est.k, t: est.t, alvo: est.alvo, movendo: est.movendo, auto: plano ? !!plano.auto : false,
        grande: grande, nMover: Object.keys(dMap).length, aplicado: ativoAplicado, cotas: cotas.on, foco: foco ? foco.uid : null,
        camGuardada: camGuardada ? [camGuardada.p.x, camGuardada.p.y, camGuardada.p.z] : null, camEnq: !!camEnq,
        camGrupo: camGrp ? [camGrp.p.x, camGrp.p.y, camGrp.p.z] : null, camEnqGrupo: !!camEnq2, k2: est2.k, grupo: grupoEstado(), gancho: S._aoClicarPeca === gancho };
    }

    /* ---------------------------------------------------------------- cotas: alvos */
    function caixaDe(uid) {
      if (caixas[uid] !== undefined) return caixas[uid];
      var e = elementoDe(uid), c = null;
      if (e && e.vol && e.vol.caixa) c = E.caixaDoCarimbo(e.vol.caixa, matriz(), true);
      caixas[uid] = c; return c;
    }
    /* o deslocamento TOTAL de agora: k · d (o modo) + k2 · s (o grupo aberto) */
    function deslAtual(uid) {
      var d = dMap[uid], s = dMap2[uid];
      return [(d ? d[0] * est.k : 0) + (s ? s[0] * est2.k : 0), (d ? d[1] * est.k : 0) + (s ? s[1] * est2.k : 0), (d ? d[2] * est.k : 0) + (s ? s[2] * est2.k : 0)];
    }

    /* ⚠ visível = a malha da peça e todos os pais visíveis (ocultar, isolar, disciplina desligada, 4D): cota de peça escondida mede o que a
       pessoa não vê (03/11/2026, revisão). Peça sem malha no índice conta como visível. */
    function malhaVisivel(m) { for (var o = m; o && o !== S.scene; o = o.parent) if (o.visible === false) return false; return true; }
    function pecaVisivel(uid) {
      var ms = malhas[uid]; if (!ms || !ms.length) return true;
      for (var i = 0; i < ms.length; i++) if (malhaVisivel(ms[i])) return true;
      return false;
    }
    /* o que está visível, resumido num número: entra na assinatura do recálculo das cotas (esconder uma peça refaz a conta) */
    function assinaturaVis() {
      var h = 2166136261;
      for (var i = 0; i < listaUids.length; i++) if (pecaVisivel(listaUids[i])) h = Math.imul(h ^ (i + 1), 16777619) >>> 0;
      return h;
    }

    /* alvos = um por módulo + vetor de afastamento (js/bimexplodir.js alvosPorModuloEVetor), só com as peças visíveis; sem carimbo,
       um por pavimento */
    function alvosGerais() {
      var itens = [], algum = false;
      modelos().forEach(function (mo) {
        (mo.elementos || []).forEach(function (e) {
          if (!e.vol || !e.vol.modulo) return;
          var cx = caixaDe(e.uid); if (!cx) return;
          algum = true;
          if (!pecaVisivel(e.uid)) return;
          itens.push({ modulo: e.vol.modulo, caixa: cx, d: dMap[e.uid] || [0, 0, 0] });
        });
      });
      if (algum) return E.alvosPorModuloEVetor(itens, est.k);
      /* sem carimbo: por pavimento, pela caixa das malhas (a geometria local × a matriz da malha de agora) */
      var porPav = {}, out = [];
      modelos().forEach(function (mo) {
        (mo.pavimentos || []).forEach(function (pv) {
          (pv.eids || []).forEach(function (eid) {
            var u = mo.mid + ":" + eid, ms = malhas[u] || [];
            ms.forEach(function (m) {
              if (!m.geometry || !malhaVisivel(m)) return;
              if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
              var bb = m.geometry.boundingBox; if (!bb) return;
              var g = porPav[pv.nome] = porPav[pv.nome] || { min: [1e30, 1e30, 1e30], max: [-1e30, -1e30, -1e30], n: 0 };
              for (var a = 0; a < 8; a++) {
                _v.set((a & 1) ? bb.max.x : bb.min.x, (a & 2) ? bb.max.y : bb.min.y, (a & 4) ? bb.max.z : bb.min.z).applyMatrix4(m.matrix);
                g.min[0] = Math.min(g.min[0], _v.x); g.min[1] = Math.min(g.min[1], _v.y); g.min[2] = Math.min(g.min[2], _v.z);
                g.max[0] = Math.max(g.max[0], _v.x); g.max[1] = Math.max(g.max[1], _v.y); g.max[2] = Math.max(g.max[2], _v.z);
              }
              g.n++;
            });
          });
        });
      });
      Object.keys(porPav).forEach(function (n) { var g = porPav[n]; if (g.n) out.push({ id: n, caixa: E.caixaDosPontos(g.min, g.max), desl: [0, 0, 0], prioridade: g.n }); });
      return out;
    }
    /* com o grupo aberto: um alvo por PEÇA do grupo (visível), no máximo 40, as maiores primeiro; ao fechar, voltam os módulos */
    function alvosGrupo() {
      var L = [];
      Object.keys(dMap2).forEach(function (u) {
        var cx = caixaDe(u); if (!cx || !pecaVisivel(u)) return;
        L.push({ id: u, caixa: cx, desl: deslAtual(u), vol: cx.meia[0] * cx.meia[1] * cx.meia[2] });
      });
      L.sort(function (a, b) { return (b.vol - a.vol) || (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0)); });
      L = L.slice(0, 40);
      return L.map(function (a, i) { return { id: a.id, caixa: a.caixa, desl: a.desl, prioridade: L.length - i }; });
    }
    function alvosFoco() {
      var cx = caixaDe(foco.uid); if (!cx) return [];
      return [{ id: foco.uid, caixa: E.desloca(cx, deslAtual(foco.uid)), desl: [0, 0, 0], prioridade: 1 }];
    }

    /* ---------------------------------------------------------------- cotas: a tela */
    function textoTex(txt) {
      if (cotas.tex[txt]) return cotas.tex[txt];
      /* ⚠ no teto sai a MAIS ANTIGA, com dispose (03/11/2026, revisão): esvaziar o cache inteiro soltava no meio do quadro as texturas que os
         sprites ainda estavam usando, e a textura trocada sem dispose ficava na placa de vídeo. O teto se lê na hora (o teste o baixa). */
      var teto = (BimExplodirUI && BimExplodirUI.TETO_TEX) || TETO_TEX;
      while (cotas.nTex >= teto && cotas.ordemTex.length) {
        var velho = cotas.ordemTex.shift();
        if (cotas.tex[velho]) { cotas.tex[velho].dispose(); delete cotas.tex[velho]; cotas.nTex--; cotas.nDispose++; }
      }
      var cv = document.createElement("canvas"), fs = 40, pad = 10, g = cv.getContext("2d");
      g.font = "bold " + fs + "px Arial"; cv.width = Math.ceil(g.measureText(txt).width) + pad * 2; cv.height = fs + pad * 2;
      g = cv.getContext("2d"); g.font = "bold " + fs + "px Arial"; g.textBaseline = "middle"; g.textAlign = "center";
      var cor = corContorno(), clara = cor === "#e6e6e6";
      g.lineJoin = "round"; g.lineWidth = 9; g.strokeStyle = clara ? "rgba(0,0,0,.85)" : "rgba(255,255,255,.92)"; g.strokeText(txt, cv.width / 2, cv.height / 2 + 2);   /* o halo, sem caixa */
      g.fillStyle = cor; g.fillText(txt, cv.width / 2, cv.height / 2 + 2);
      var t = new THREE.CanvasTexture(cv); t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
      if (THREE.sRGBEncoding != null) t.encoding = THREE.sRGBEncoding;
      t.userData = { razao: cv.width / cv.height };
      cotas.tex[txt] = t; cotas.nTex++; cotas.ordemTex.push(txt); return t;
    }
    function corContorno() {
      var h = 0x151515; try { if (global.BimFundo) h = global.BimFundo.contorno(global.BimFundo.ler().fundo, 0x151515); } catch (_) {}
      return "#" + ("000000" + h.toString(16)).slice(-6);
    }
    function montarCotas() {
      if (cotas.g) return;
      cotas.g = new THREE.Group(); cotas.g.name = "cotas-vivas";
      cotas.linPos = new Float32Array(MAX_ITENS * 5 * 6 + 64 * 12);
      var geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(cotas.linPos, 3)); geo.setDrawRange(0, 0);
      cotas.lin = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(corContorno()), depthTest: false, transparent: true }));
      cotas.lin.frustumCulled = false; cotas.lin.renderOrder = 997; cotas.lin.raycast = function () {};
      cotas.g.add(cotas.lin); S.scene.add(cotas.g);
    }
    function sprite(i) {
      var sp = cotas.sprites[i];
      if (!sp) {
        sp = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
        sp.renderOrder = 999; sp.raycast = function () {}; sp.frustumCulled = false; cotas.g.add(sp); cotas.sprites[i] = sp;
      }
      return sp;
    }
    function desmontarCotas() {
      if (cotas.g) {
        S.scene.remove(cotas.g);
        if (cotas.lin) { cotas.lin.geometry.dispose(); cotas.lin.material.dispose(); }
        cotas.sprites.forEach(function (sp) { if (sp && sp.material) sp.material.dispose(); });
        Object.keys(cotas.tex).forEach(function (k) { cotas.tex[k].dispose(); });
      }
      cotas.g = null; cotas.lin = null; cotas.sprites = []; cotas.tex = {}; cotas.nTex = 0; cotas.ordemTex = []; cotas.itens = []; cotas.marcas = []; cotas.sigCam = null; cotas.k = -1;
    }

    /* o mundo a partir de um deslocamento em pixels em torno de um ponto de referência (plano paralelo à câmera) */
    function mundoDoPx(ref, pxRef, px, cam, canvasH) {
      var depth, wpp;
      _v.copy(ref).sub(cam.position);
      cam.getWorldDirection(_v2);
      depth = _v.dot(_v2);
      wpp = cam.isOrthographicCamera ? ((cam.top - cam.bottom) / (cam.zoom || 1)) / canvasH : (2 * Math.tan(cam.fov * Math.PI / 360) * Math.max(depth, 1e-4)) / canvasH;
      _v3.setFromMatrixColumn(cam.matrixWorld, 0);   /* direita */
      var up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      return new THREE.Vector3().copy(ref).addScaledVector(_v3, (px[0] - pxRef[0]) * wpp).addScaledVector(up, -(px[1] - pxRef[1]) * wpp);
    }
    function pxEscala(ref, cam, canvasH) {
      _v.copy(ref).sub(cam.position); cam.getWorldDirection(_v2);
      var depth = _v.dot(_v2);
      return cam.isOrthographicCamera ? ((cam.top - cam.bottom) / (cam.zoom || 1)) / canvasH : (2 * Math.tan(cam.fov * Math.PI / 360) * Math.max(depth, 1e-4)) / canvasH;
    }

    function atualizarCotas(forcar) {
      if (!cotas.on) return;
      var cam = S.camera, el = S.renderer.domElement, W = el.clientWidth, H = el.clientHeight;
      if (!(W > 0 && H > 0)) return;
      var agora = (typeof performance !== "undefined") ? performance.now() : Date.now();
      reindexar();
      cam.updateMatrixWorld(); S.modelRoot.updateMatrixWorld();
      var s = cam.matrixWorld.elements.join(",") + "|" + cam.projectionMatrix.elements.join(",") + "|" + S.modelRoot.matrixWorld.elements.join(",") + "|" + W + "x" + H + "|" + est.k + "|" + est2.k + "|" + (temGrupoMovel() ? "G" : "") + "|" + (foco ? foco.uid : "") + "|" + assinaturaVis();
      if (!forcar && (s === cotas.sigCam || agora - cotas.ultimo < COTA_MS)) return;
      cotas.ultimo = agora; cotas.sigCam = s; cotas.k = est.k;
      montarCotas();
      /* a câmera no referencial do modelo: vp = projeção × vista × modelRoot */
      _m4.copy(cam.projectionMatrix).multiply(cam.matrixWorldInverse).multiply(S.modelRoot.matrixWorld);
      _inv.copy(S.modelRoot.matrixWorld).invert();
      var pos = new THREE.Vector3().copy(cam.position).applyMatrix4(_inv);
      var alvos = foco ? alvosFoco() : (temGrupoMovel() ? alvosGrupo() : alvosGerais());
      var t0 = agora;
      var res = C.escolher(alvos, { pos: [pos.x, pos.y, pos.z], vp: _m4.elements.slice(), w: W, h: H }, foco ? { anterior: cotas.anterior || {}, fontePx: 13, folgaPx: 16, minPx: 4, minM: 0.005 } : { anterior: cotas.anterior || {}, fontePx: 13, folgaPx: 16 });
      cotas.anterior = C.memoria(res);
      var cor = corContorno(); cotas.lin.material.color.set(cor);
      var P = cotas.linPos, n = 0, nSp = 0, M = S.modelRoot.matrixWorld;
      for (var i = 0; i < res.length && i < MAX_ITENS; i++) {
        var r = res[i];
        var A = new THREE.Vector3(r.pa[0], r.pa[1], r.pa[2]).applyMatrix4(M), B = new THREE.Vector3(r.pb[0], r.pb[1], r.pb[2]).applyMatrix4(M);
        var A2 = mundoDoPx(A, r.ea, r.a, cam, H), B2 = mundoDoPx(B, r.eb, r.b, cam, H);
        n = seg(P, n, A, A2); n = seg(P, n, B, B2); n = seg(P, n, A2, B2);
        /* traço a 45° nos extremos (5 px) */
        var dx = r.b[0] - r.a[0], dy = r.b[1] - r.a[1], l = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / l, uy = dy / l, px2 = -uy, py2 = ux, tk = 5;
        var tx = (ux + px2) * tk / Math.SQRT2 * 1.0, ty = (uy + py2) * tk / Math.SQRT2 * 1.0;
        n = seg(P, n, mundoDoPx(A2, r.a, [r.a[0] - tx, r.a[1] - ty], cam, H), mundoDoPx(A2, r.a, [r.a[0] + tx, r.a[1] + ty], cam, H));
        n = seg(P, n, mundoDoPx(B2, r.b, [r.b[0] - tx, r.b[1] - ty], cam, H), mundoDoPx(B2, r.b, [r.b[0] + tx, r.b[1] + ty], cam, H));
        /* o texto: no ponto do meio da linha, deslocado em px, girado pelo ângulo normalizado */
        var mid = new THREE.Vector3().addVectors(A2, B2).multiplyScalar(0.5), midPx = [(r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2];
        var T = mundoDoPx(mid, midPx, r.xy, cam, H);
        var sp = sprite(nSp++), tex = textoTex(r.txt);
        sp.material.map = tex; sp.material.rotation = r.ang * Math.PI / 180; sp.material.needsUpdate = true;
        var hMundo = 13 * 1.35 * pxEscala(T, cam, H);
        sp.position.copy(T); sp.scale.set(hMundo * tex.userData.razao, hMundo, 1); sp.visible = true;
      }
      /* as marcas dos furos (só no foco) */
      var marcas = foco ? marcasDosFuros(cam, W, H) : [];
      cotas.marcas = marcas;
      for (var q = 0; q < marcas.length && n + 12 <= P.length; q++) { var mk = marcas[q]; n = seg(P, n, mk.a, mk.b); n = seg(P, n, mk.c, mk.d); }
      for (var z = nSp; z < cotas.sprites.length; z++) cotas.sprites[z].visible = false;
      cotas.lin.geometry.attributes.position.needsUpdate = true; cotas.lin.geometry.setDrawRange(0, n / 3);
      cotas.itens = res; cotas.ms = Math.round(((typeof performance !== "undefined") ? performance.now() : Date.now()) - t0);
    }
    function seg(P, n, a, b) { P[n++] = a.x; P[n++] = a.y; P[n++] = a.z; P[n++] = b.x; P[n++] = b.y; P[n++] = b.z; return n; }

    /* as marcas dos furos da peça em foco: uma cruz de 8 px em cada furo (s ao longo do comprimento; y, z na seção, em mm,
       a partir do canto da seção: E.pontoDoFuro) */
    function marcasDosFuros(cam, W, H) {
      var d = dadosPeca(foco.uid), cx = caixaDe(foco.uid), out = [];
      if (!d || !cx || !d.furos.length) return out;
      var c = E.desloca(cx, deslAtual(foco.uid)), M = S.modelRoot.matrixWorld;
      d.furos.forEach(function (f) {
        var q = E.pontoDoFuro(c, f);
        var p = new THREE.Vector3(q[0], q[1], q[2]).applyMatrix4(M);
        var k = 6 * pxEscala(p, cam, H), r = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).multiplyScalar(k), u = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1).multiplyScalar(k);
        out.push({ a: p.clone().sub(r), b: p.clone().add(r), c: p.clone().sub(u), d: p.clone().add(u), furo: f });
      });
      return out;
    }

    function cotasVivas(ligar) {
      var novo = (ligar === undefined) ? !cotas.on : !!ligar;
      if (novo === cotas.on) return cotas.on;
      cotas.on = novo;
      if (novo) { atualizarCotas(true); } else desmontarCotas();
      pintarBotaoCotas(cotas.on);
      return cotas.on;
    }
    /* ⚠ o botão "Cotas vivas" da fita segue o ESTADO, não o clique (03/11/2026, revisão): a Prancha Viva desliga as cotas ao sair do
       cenário e o botão ficava aceso com as cotas apagadas */
    function pintarBotaoCotas(on) { try { var R = global.BimRibbon; if (R && R.setAtivo) R.setAtivo("cotas-vivas", !!on); } catch (_) {} }
    function diag() {
      var el = S.renderer.domElement;
      return { on: cotas.on, k: est.k, w: el.clientWidth, h: el.clientHeight, n: cotas.itens.length, ms: cotas.ms || 0,
        sprites: cotas.sprites.filter(function (s) { return s && s.visible; }).length, texturas: cotas.nTex, descartadas: cotas.nDispose, marcas: cotas.marcas.length,
        itens: cotas.itens.map(function (r) { return { alvo: r.alvo, eixo: r.eixo, aresta: r.aresta, txt: r.txt, ang: r.ang, xy: r.xy, a: r.a, b: r.b, caixaTexto: r.caixaTexto }; }) };
    }
    /* o teste vira a câmera e pede o cálculo na hora */
    function recalcular() { cotas.ultimo = 0; cotas.sigCam = null; atualizarCotas(true); return diag(); }

    /* ---------------------------------------------------------------- foco na peça */
    function focoPeca(uid) {
      var e = elementoDe(uid), cx = caixaDe(uid);
      if (!e || !e.vol || !cx) return { ok: false, motivo: "a peça não traz a caixa do carimbo" };
      if (!foco) foco = { uid: uid, p: S.camera.position.clone(), t: S.orbit.target.clone(), reenq: false };
      else foco.uid = uid;
      enquadrarPecaFoco();
      var n = S._raioXChaves ? S._raioXChaves([e.chave], false) : 0; semRecado();
      foco.sel = S._selN || 0; foco.chave = e.chave;
      cotas.anterior = {};
      cotasVivas(true); cotas.sigCam = null;
      return { ok: true, uid: uid, raioX: n };
    }
    function focoSair() {
      if (!foco) return { ok: false };
      var f = foco; foco = null;
      if (S._limparRaioX) S._limparRaioX();
      if (grupo) grupoRaio();   /* o grupo escolhido segue em destaque */
      if (S._voarCam) S._voarCam(f.p, f.t, 0.55);
      cotas.anterior = {}; cotas.sigCam = null;
      return { ok: true };
    }

    /* ---------------------------------------------------------------- o GRUPO (um módulo aberto sozinho, 03/11/2026)
       escolher → destaque (raio-X no resto) e o cartão de 2 opções · abrir → as camadas se afastam (canal k2), a câmera enquadra e as cotas
       passam às peças · agrupar → fecha animado, a câmera volta se a pessoa não a moveu · fechar → tira tudo.
       ⚠ Só existe grupo com `vol` (carimbo do projeto); o modo automático, sem carimbo, segue como era. */
    function notificarGrupo() { try { pintarCartao(); } catch (_) {} if (grupoOuvinte) { try { grupoOuvinte(); } catch (_) {} } }
    /* ⚠ o recado do 3D fica até outro o trocar: o de um raio-X anterior ficava por cima do desenho (03/11/2026). O cartão já diz o que está em destaque */
    function semRecado() { if (S._hint) { try { S._hint(""); } catch (_) {} } }
    function grupoRaio() {
      if (!grupo || !S._raioXChaves) return 0;
      var n = S._raioXChaves(grupo.chaves, grupoCfg.cartao ? false : grupo.titulo + " em destaque; o resto fica translúcido. Fechar tira o destaque."); if (grupoCfg.cartao) semRecado(); grupo.sel = S._selN || 0; return n;
    }
    /* ⚠ o grupo é "as peças do MESMO módulo no MESMO modelo" que são visíveis. Nome, título e ficha saem do carimbo, nunca de texto da obra. */
    function grupoDaPeca(uid) {
      var e = elementoDe(uid); if (!e || !e.vol || !e.vol.modulo) return null;
      var mod = e.vol.modulo, uids = [], chaves = [], fichas = {}, ordemF = [], dono = null;
      modelos().forEach(function (mo) {
        if (dono) return;
        var tem = (mo.elementos || []).some(function (x) { return x.uid === uid; });
        if (tem) dono = mo;
      });
      if (!dono) return null;
      (dono.elementos || []).forEach(function (x) {
        if (!x.vol || x.vol.modulo !== mod || !pecaVisivel(x.uid)) return;
        uids.push(x.uid); chaves.push(x.chave);
        var f = E.lerFicha(x.vol.ficha, global.location && global.location.origin);
        if (f) { if (!fichas[f.url]) { fichas[f.url] = { f: f, n: 0 }; ordemF.push(f.url); } fichas[f.url].n++; }
      });
      /* ⚠ um módulo pode ter várias folhas (uma parede longa, 03/11/2026: a fachada tem 4): a ficha é a da PEÇA clicada, e as outras ficam a um botão */
      var melhor = null; ordemF.forEach(function (u) { if (!melhor || fichas[u].n > fichas[melhor].n) melhor = u; });
      var daPeca = E.lerFicha(e.vol.ficha, global.location && global.location.origin);
      if (daPeca && fichas[daPeca.url]) melhor = daPeca.url;
      var rotulo = function (fi) { return { titulo: fi.titulo, url: fi.url, pagina: fi.pagina, rotulo: fi.titulo + (fi.pagina ? ", página " + fi.pagina : "") }; };
      var lista = ordemF.map(function (u) { return rotulo(fichas[u].f); }).sort(function (a, b) { return (Number(a.pagina) || 0) - (Number(b.pagina) || 0); });
      return { modulo: mod, mid: dono.mid, titulo: E.tituloDoGrupo(mod), n: uids.length, ficha: melhor ? rotulo(fichas[melhor].f) : null, fichas: lista, uids: uids, chaves: chaves };
    }
    function grupoEstado() {
      var g = grupo;
      return { escolhido: !!g, aberto: !!(g && g.aberto), modulo: g ? g.modulo : null, mid: g ? g.mid : null, titulo: g ? g.titulo : "", n: g ? g.n : 0, temFicha: !!(g && g.ficha), ficha: g ? g.ficha : null,
        k2: est2.k, movendo: !!est2.movendo, nMoveis: Object.keys(dMap2).length, uids: g ? g.uids.slice() : [], raioX: S._raioXAtivo ? S._raioXAtivo() : 0 };
    }
    /* zera o canal do grupo NA HORA (sem animação): trocar de modo, montar sem animação, modelo trocado, outro grupo */
    function grupoSnapFechar() {
      var tinha = !!grupo || temGrupoMovel() || est2.k > 0 || est2.movendo;
      est2.t = 0; est2.k = 0; est2.alvo = 0; est2.movendo = false; est2.mudou = false;
      /* ⚠ aplicar(k, 0) ANTES de esvaziar dMap2 (03/11/2026, revisão): movel() só enxerga o que está em dMap/dMap2, e a peça do grupo sem vetor no modo ficava na malha real em pos0 + k2·s */
      if (temGrupoMovel()) { if (ativoAplicado) aplicar(est.k, 0); dMap2 = {}; gen++; contornoDeNovo(); }
      camGrp = null; camEnq2 = null; grupoEnqAoFim = false;
      grupoLimparTela();
      if (tinha) { cotas.k = -1; cotas.anterior = {}; cotas.sigCam = null; }
    }
    /* o destaque, o cartão e as cotas que o grupo ligou sozinho */
    function grupoLimparTela() {
      var tinha = !!grupo; grupo = null; cartaoPeca = null;
      if (tinha && !foco && S._limparRaioX) S._limparRaioX();
      if (grupoCotasNos) { grupoCotasNos = false; if (!foco) cotasVivas(false); }
      if (tinha) notificarGrupo();
    }
    function grupoEscolher(uid) {
      if (est.alvo !== 1) return { ok: false, motivo: "Abra a vista explodida antes de escolher um módulo." };
      var g = grupoDaPeca(uid);
      if (!g) return { ok: false, motivo: "Esta peça não faz parte de um módulo com volumetria." };
      /* ⚠ o MESMO grupo = mesmo módulo no mesmo modelo (03/11/2026, revisão: o mesmo código em dois modelos federados virava um grupo só). A ficha é a da peça clicada: sem atualizar, ficava a da 1ª peça */
      if (grupo && grupo.modulo === g.modulo && grupo.mid === g.mid) { grupo.ficha = g.ficha; grupo.fichas = g.fichas; notificarGrupo(); return { ok: true, igual: true, grupo: grupoEstado() }; }
      if (grupo || temGrupoMovel()) grupoSnapFechar();
      if (foco) focoSair();
      g.aberto = false; g.sel = null; grupo = g;
      grupoRaio();
      cotas.k = -1;
      notificarGrupo();
      return { ok: true, raioX: S._raioXAtivo ? S._raioXAtivo() : 0, grupo: grupoEstado() };
    }
    function grupoAbrir() {
      if (!grupo) return { ok: false, motivo: "Escolha um módulo antes." };
      if (grupo.aberto) return { ok: true, igual: true, grupo: grupoEstado() };
      if (grupo.n < 2) return { ok: false, motivo: "Este módulo tem uma peça só: não há o que abrir." };
      if (temGrupoMovel()) { var gg = grupo; grupoSnapFechar(); grupo = gg; grupoRaio(); }   /* um grupo antigo ainda fechando: sai na hora */
      /* o plano sobre a posição EXPLODIDA (k = 1), não a de agora: o resultado não depende de em que ponto da animação a pessoa clicou */
      var pecas = [];
      grupo.uids.forEach(function (u) {
        var cx = caixaDe(u); if (!cx) return;
        var d = dMap[u] || [0, 0, 0];
        pecas.push({ uid: u, caixa: E.desloca(cx, d) });
      });
      var plano2 = E.planoDoGrupo(pecas, {});
      if (!Object.keys(plano2).length) return { ok: false, motivo: "As peças deste módulo não trazem a caixa para abrir." };
      /* a câmera: guarda a de agora; se o enquadramento da explodida ainda não aconteceu, ele conta como feito (o Montar volta pela guardada) */
      if (voavel()) {
        if (enquadrarAoFim) { enquadrarAoFim = false; if (!camEnq) camEnq = { p: S.camera.position.clone(), t: S.orbit.target.clone(), em: agoraMs() }; }
        camGrp = { p: S.camera.position.clone(), t: S.orbit.target.clone() };
        grupoEnqAoFim = true;
      }
      dMap2 = plano2; gen++;
      grupo.aberto = true;
      E.ir(est2, 1);
      if (grande) { est2.t = 1; est2.k = 1; est2.movendo = false; aplicar(est.k, 1); contornoDeNovo(); }
      if (grupoCfg.cotasAuto && !cotas.on) { cotasVivas(true); grupoCotasNos = true; }
      cotas.k = -1; cotas.anterior = {}; cotas.sigCam = null;
      notificarGrupo();
      return { ok: true, n: Object.keys(plano2).length, grupo: grupoEstado() };
    }
    /* Agrupar: fecha animado e volta ao cartão de 2 opções (o destaque fica) */
    function grupoAgrupar() {
      if (!grupo || !grupo.aberto) return { ok: false };
      /* ⚠ a peça em foco sai ANTES (03/11/2026, revisão): Agrupar com foco deixava o foco, as cotas da peça e o painel dela com o grupo já fechado. A câmera que o foco devolve é a do enquadramento do grupo: conta como nossa */
      if (foco) { var cf = foco; focoSair(); if (camEnq2 && mesmaCamera(cf, camEnq2)) camEnq2.em = agoraMs(); }
      grupo.aberto = false; cartaoPeca = null;
      E.ir(est2, 0);
      if (grande) { est2.t = 0; est2.k = 0; est2.movendo = false; if (ativoAplicado) aplicar(est.k, 0); dMap2 = {}; gen++; contornoDeNovo(); }
      voltarCameraGrupo();
      if (grupoCotasNos) { grupoCotasNos = false; cotasVivas(false); }
      cotas.k = -1; cotas.anterior = {}; cotas.sigCam = null;
      notificarGrupo();
      return { ok: true, grupo: grupoEstado() };
    }
    /* Fechar (vazio, Esc, botão): agrupa antes, se estiver aberto, e tira o destaque */
    function grupoFechar() {
      var tinha = !!grupo || temGrupoMovel();
      if (!tinha) return { ok: false };
      if (foco) focoSair();
      if (grupo && grupo.aberto) grupoAgrupar();
      grupoLimparTela();
      return { ok: true };
    }


    /* ---------------------------------------------------------------- o CARTÃO do grupo e a FICHA (um componente só, nas 3 telas)
       O cartão mora no <body> (fora do canvas, sem herdar nada do layout de quem o chama), CSS próprio `.bimexp-`, claro e escuro, acima da
       Prancha Viva (z 9000), alvo de toque ≥ 44 px, e em largura < 600 px vira folha embaixo. */
    var cartaoEl = null, fichaEl = null, cartaoPeca = null, gancho = null, ganchoAnterior = null, teclaOn = false;
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]; }); }
    function escuro() {
      var d = global.document; if (!d) return false;
      try {
        if (d.documentElement.getAttribute("data-tema") === "dark") return true;
        if (S._visitante) return true;   /* o visor do celular é escuro */
        if (d.querySelector(".pviva-escuro")) return true;
      } catch (_) {}
      return false;
    }
    function injetarCss() {
      var d = global.document; if (!d || d.getElementById("bimexp-css")) return;
      var st = d.createElement("style"); st.id = "bimexp-css";
      st.textContent = [
        ".bimexp-cartao{--bx-bg:#ffffff;--bx-tx:#1c2733;--bx-sub:#5b6875;--bx-bd:#c9d3de;--bx-pri:#1d5f9c;--bx-pri-tx:#ffffff;--bx-bt:#f2f6fa;position:fixed;left:50%;bottom:max(84px,var(--bimexp-base,0px));transform:translateX(-50%);z-index:2147483000;width:min(440px,calc(100vw - 24px));max-height:60vh;overflow:auto;box-sizing:border-box;background:var(--bx-bg);color:var(--bx-tx);border:1px solid var(--bx-bd);border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.28);padding:12px 14px;font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}",
        ".bimexp-cartao.bimexp-escuro,.bimexp-ficha.bimexp-escuro{--bx-bg:#12263b;--bx-tx:#e3edf7;--bx-sub:#9fb2c8;--bx-bd:#24435f;--bx-pri:#5aa9e6;--bx-pri-tx:#06121f;--bx-bt:#183452}",
        ".bimexp-cartao[hidden],.bimexp-ficha[hidden]{display:none}",
        ".bimexp-cartao *{box-sizing:border-box}",
        ".bimexp-tit{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin:0 0 2px}.bimexp-tit b{font-size:16px}.bimexp-tit span{color:var(--bx-sub);font-size:12.5px}",
        ".bimexp-sub{color:var(--bx-sub);font-size:12.5px;margin:0 0 8px}",
        ".bimexp-acoes{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}",
        ".bimexp-bt{flex:1 1 130px;min-height:44px;min-width:44px;padding:8px 12px;border:1px solid var(--bx-bd);border-radius:10px;background:var(--bx-bt);color:var(--bx-tx);font:inherit;font-weight:600;cursor:pointer}",
        ".bimexp-bt.pri{background:var(--bx-pri);border-color:var(--bx-pri);color:var(--bx-pri-tx)}",
        ".bimexp-bt:focus-visible{outline:3px solid var(--bx-pri);outline-offset:2px}",
        ".bimexp-bt[disabled]{opacity:.55;cursor:not-allowed}",
        ".bimexp-motivo{color:var(--bx-sub);font-size:12.5px;margin:6px 0 0}",
        ".bimexp-peca{margin:8px 0 0;padding:8px 10px;border:1px solid var(--bx-bd);border-radius:10px}.bimexp-peca dl{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin:4px 0}.bimexp-peca dt{color:var(--bx-sub)}.bimexp-peca dd{margin:0}",
        ".bimexp-peca table{width:100%;border-collapse:collapse;font-size:12.5px}.bimexp-peca th,.bimexp-peca td{text-align:left;padding:2px 6px;border-bottom:1px solid var(--bx-bd)}",
        /* o cartão no TOPO (o visor do celular tem a barra de baixo e o cartão da peça embaixo): fica logo abaixo do cabeçalho */
        ".bimexp-cartao.bimexp-topo{top:var(--bimexp-topo,60px);bottom:auto;max-height:50vh}",
        "@media (max-width:599px){.bimexp-cartao{left:0;right:0;bottom:var(--bimexp-base,0px);transform:none;width:auto;max-height:55vh;border-radius:14px 14px 0 0;padding-bottom:calc(14px + env(safe-area-inset-bottom,0px))}.bimexp-cartao.bimexp-topo{left:8px;right:8px;top:var(--bimexp-topo,60px);bottom:auto;border-radius:12px;padding-bottom:12px}}",
        ".bimexp-ficha{--bx-bg:#ffffff;--bx-tx:#1c2733;--bx-bd:#c9d3de;--bx-pri:#1d5f9c;--bx-pri-tx:#fff;--bx-bt:#f2f6fa;position:fixed;inset:0;z-index:2147483300;display:flex;flex-direction:column;background:rgba(8,14,22,.94);font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}",
        ".bimexp-ficha-topo{display:flex;align-items:center;gap:6px;padding:8px 10px;background:var(--bx-bg);color:var(--bx-tx);border-bottom:1px solid var(--bx-bd);flex-wrap:wrap}.bimexp-ficha-topo b{flex:1;min-width:120px}",
        ".bimexp-ficha-topo .bimexp-bt{flex:0 0 auto;min-width:44px}",
        ".bimexp-ficha-palco{position:relative;flex:1;overflow:hidden;touch-action:none;cursor:grab}.bimexp-ficha-palco img{position:absolute;left:0;top:0;transform-origin:0 0;max-width:none;background:#fff;user-select:none;-webkit-user-drag:none}",
        ".bimexp-ficha-erro{position:absolute;left:12px;right:12px;top:70px;background:#fff8e6;border:1px solid #f3c77a;color:#6b4300;border-radius:10px;padding:12px}"
      ].join("\n");
      (d.head || d.documentElement).appendChild(st);
    }

    /* A FICHA: a imagem do endereço do carimbo, com zoom (roda, +, − e a pinça) e arrasto; sem rede, o recado diz qual é a ficha.
       ⚠ O endereço vem do arquivo do projeto: só entra o que passa em E.urlFichaOk (https, relativo ou a mesma origem). */
    function fecharFicha() { if (fichaEl) { try { fichaEl.parentNode.removeChild(fichaEl); } catch (_) {} fichaEl = null; } }
    function abrirFicha(fi, lista) {
      var d = global.document; if (!d || !fi) return false;
      var folhas = (lista || []).filter(function (x) { return E.urlFichaOk(x.url, global.location && global.location.origin); }), ix = -1;
      folhas.forEach(function (x, i) { if (x.url === fi.url) ix = i; });
      if (folhas.length < 2 || ix < 0) { folhas = null; ix = 0; }
      if (!E.urlFichaOk(fi.url, global.location && global.location.origin)) return false;
      fecharFicha(); injetarCss();
      var ov = d.createElement("div"); ov.className = "bimexp-ficha" + (escuro() ? " bimexp-escuro" : ""); ov.setAttribute("data-bimexp", "ficha"); ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", "Ficha");
      ov.innerHTML = '<div class="bimexp-ficha-topo"><b data-bimexp="ficha-tit">' + esc(fi.rotulo || fi.titulo) + '</b>' +
        (folhas ? '<button type="button" class="bimexp-bt" data-bimexp-acao="ficha-ant" aria-label="Folha anterior">\u2039</button><span data-bimexp="ficha-n"></span><button type="button" class="bimexp-bt" data-bimexp-acao="ficha-prox" aria-label="Próxima folha">\u203A</button>' : "") +
        '<button type="button" class="bimexp-bt" data-bimexp-acao="ficha-menos" aria-label="Afastar">\u2212</button><button type="button" class="bimexp-bt" data-bimexp-acao="ficha-mais" aria-label="Aproximar">+</button>' +
        '<button type="button" class="bimexp-bt" data-bimexp-acao="ficha-ajustar">Ajustar</button><button type="button" class="bimexp-bt pri" data-bimexp-acao="ficha-fechar">Fechar</button></div>' +
        '<div class="bimexp-ficha-palco" data-bimexp="ficha-palco"><img alt="" data-bimexp="ficha-img"></div><div class="bimexp-ficha-erro" data-bimexp="ficha-erro" hidden></div>';
      d.body.appendChild(ov); fichaEl = ov;
      var palco = ov.querySelector(".bimexp-ficha-palco"), img = ov.querySelector("img"), er = ov.querySelector(".bimexp-ficha-erro"), v = { s: 1, tx: 0, ty: 0 };
      function pintar() { img.style.transform = "translate(" + v.tx + "px," + v.ty + "px) scale(" + v.s + ")"; }
      function ajustar() {
        if (!img.naturalWidth) return;
        var s = Math.min(palco.clientWidth / img.naturalWidth, palco.clientHeight / img.naturalHeight, 1) || 1;
        v.s = s; v.tx = (palco.clientWidth - img.naturalWidth * s) / 2; v.ty = (palco.clientHeight - img.naturalHeight * s) / 2; pintar();
      }
      function zoom(k, cx, cy) { var s2 = Math.max(0.05, Math.min(12, v.s * k)), f = s2 / v.s; v.tx = cx - (cx - v.tx) * f; v.ty = cy - (cy - v.ty) * f; v.s = s2; pintar(); }
      img.onload = ajustar;
      img.onerror = function () {
        er.innerHTML = "<b>N\u00E3o consegui abrir a ficha pela rede.</b><br>" + esc(fi.titulo) + (fi.pagina ? ", p\u00E1gina " + esc(fi.pagina) : "") + ". Confira a conex\u00E3o e tente de novo.";
        er.hidden = false;
      };
      function mostrarFolha(i) {
        ix = (i + folhas.length) % folhas.length; fi = folhas[ix]; er.hidden = true;
        ov.querySelector('[data-bimexp="ficha-tit"]').textContent = fi.rotulo || fi.titulo;
        ov.querySelector('[data-bimexp="ficha-n"]').textContent = (ix + 1) + " de " + folhas.length;
        img.src = fi.url;
      }
      if (folhas) mostrarFolha(ix); else img.src = fi.url;
      ov.addEventListener("click", function (e) {
        var b = e.target.closest ? e.target.closest("[data-bimexp-acao]") : null; if (!b) return; var a = b.getAttribute("data-bimexp-acao");
        if (a === "ficha-fechar") fecharFicha(); else if (a === "ficha-ajustar") ajustar();
        else if (a === "ficha-ant" && folhas) mostrarFolha(ix - 1); else if (a === "ficha-prox" && folhas) mostrarFolha(ix + 1);
        else if (a === "ficha-mais" || a === "ficha-menos") zoom(a === "ficha-mais" ? 1.4 : 1 / 1.4, palco.clientWidth / 2, palco.clientHeight / 2);
      });
      palco.addEventListener("wheel", function (e) { e.preventDefault(); var r = palco.getBoundingClientRect(); zoom(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
      /* arrasto com um ponteiro; a pinça com dois (a distância entre eles escala em torno do ponto médio) */
      var pts = {}, p0 = null, dist0 = 0;
      function n() { return Object.keys(pts).length; }
      palco.addEventListener("pointerdown", function (e) {
        pts[e.pointerId] = { x: e.clientX, y: e.clientY }; try { palco.setPointerCapture(e.pointerId); } catch (e1) {}
        if (n() === 1) p0 = { x: e.clientX, y: e.clientY, tx: v.tx, ty: v.ty };
        else if (n() === 2) { var k = Object.keys(pts); dist0 = Math.hypot(pts[k[0]].x - pts[k[1]].x, pts[k[0]].y - pts[k[1]].y); p0 = null; }
      });
      palco.addEventListener("pointermove", function (e) {
        if (!pts[e.pointerId]) return; pts[e.pointerId] = { x: e.clientX, y: e.clientY };
        if (n() === 1 && p0) { v.tx = p0.tx + e.clientX - p0.x; v.ty = p0.ty + e.clientY - p0.y; pintar(); }
        else if (n() === 2 && dist0 > 0) {
          var k = Object.keys(pts), a = pts[k[0]], b = pts[k[1]], dn = Math.hypot(a.x - b.x, a.y - b.y), r = palco.getBoundingClientRect();
          if (dn > 0) { zoom(dn / dist0, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); dist0 = dn; }
        }
      });
      function solta(e) { delete pts[e.pointerId]; dist0 = 0; p0 = n() === 1 ? (function () { var k = Object.keys(pts)[0]; return { x: pts[k].x, y: pts[k].y, tx: v.tx, ty: v.ty }; })() : null; }
      palco.addEventListener("pointerup", solta); palco.addEventListener("pointercancel", solta);
      return true;
    }

    function pecaHtml(uid) {
      var dp = dadosPeca(uid); if (!dp) return "";
      var vi = null; try { vi = global.PranchaViva && global.PranchaViva.volInfo ? global.PranchaViva.volInfo(dp) : null; } catch (_) { vi = null; }
      var comp = vi ? vi.comprimentoTxt : (dp.comprimento ? String(dp.comprimento).replace(".", ",") + " m" : "");
      var h = '<div class="bimexp-peca" data-bimexp="peca"><b>Pe\u00E7a ' + esc(dp.marca) + '</b><dl>' +
        (dp.tipo ? "<dt>Tipo</dt><dd>" + esc(dp.tipo) + "</dd>" : "") + (dp.secao ? "<dt>Se\u00E7\u00E3o</dt><dd>" + esc(dp.secao) + "</dd>" : "") +
        (comp ? "<dt>Comprimento</dt><dd>" + esc(comp) + "</dd>" : "") + "<dt>Furos</dt><dd>" + dp.nFuros + "</dd></dl>";
      if (dp.nFuros) {
        h += '<table data-bimexp="furos"><tr><th>s</th><th>\u00F8</th><th>Face</th><th>Liga\u00E7\u00E3o</th></tr>' + dp.furos.map(function (f) {
          return "<tr><td>" + Math.round(f.s) + " mm</td><td>\u00F8" + (Math.round(f.d * 10) / 10 + "").replace(".", ",") + " mm</td><td>" + esc(f.face) + (f.passante ? " \u00B7 passante" : (f.prof ? " \u00B7 " + Math.round(f.prof) + " mm" : "")) + "</td><td>" + esc(f.ligacao || "\u2014") + "</td></tr>";
        }).join("") + "</table>";
      }
      if (dp.ligacoes.length) h += '<div style="margin-top:6px"><span style="color:var(--bx-sub)">Liga\u00E7\u00F5es</span><ul data-bimexp="ligacoes" style="margin:2px 0 0 18px;padding:0">' + dp.ligacoes.map(function (l) { return "<li><b>" + esc(l.codigo) + "</b> \u00B7 " + esc(l.tipo) + "</li>"; }).join("") + "</ul></div>";
      h += '<div class="bimexp-acoes">' + (dp.ficha ? '<button type="button" class="bimexp-bt" data-bimexp-acao="peca-ficha">Abrir a ficha da pe\u00E7a</button>' : "") + '<button type="button" class="bimexp-bt" data-bimexp-acao="peca-voltar">Voltar ao grupo</button></div></div>';
      return h;
    }
    function cartaoOculto() { if (cartaoEl) cartaoEl.hidden = true; }
    /* ⚠ o cartão e a ficha moram no <body>, acima de tudo (03/11/2026, revisão): com o 3D escondido (a tela do ERP, a Prancha Viva em 2D, outra aba de vista) eles ficavam por cima do que a pessoa está vendo. O 3D segue desenhando o tick com o canvas fora, então é o tick que confere. */
    function canvasFora() {
      if (S._principalOculta) return true;
      var cv = S.renderer && S.renderer.domElement; if (!cv) return false;
      if (cv.isConnected === false) return true;
      return !!(cv.getClientRects && !cv.getClientRects().length);
    }
    var foraAntes = false;
    function vigiarCanvas() {
      var fora = canvasFora(); if (fora === foraAntes) return; foraAntes = fora;
      if (fora) { cartaoOculto(); fecharFicha(); } else pintarCartao();   /* volta com o grupo ainda escolhido, ou segue escondido */
    }
    function pintarCartao() {
      var d = global.document; if (!d || !d.body) return;
      var g = grupo;
      if (!g || !grupoCfg.cartao || canvasFora()) { cartaoOculto(); return; }
      injetarCss();
      if (!cartaoEl) {
        cartaoEl = d.createElement("div"); cartaoEl.className = "bimexp-cartao"; cartaoEl.setAttribute("data-bimexp", "cartao"); cartaoEl.setAttribute("role", "dialog");
        d.body.appendChild(cartaoEl);
        cartaoEl.addEventListener("click", function (e) {
          var b = e.target.closest ? e.target.closest("[data-bimexp-acao]") : null; if (!b || b.disabled) return;
          var a = b.getAttribute("data-bimexp-acao");
          if (a === "detalhar") { if (grupo && grupo.ficha) abrirFicha(grupo.ficha, grupo.fichas); }
          else if (a === "explodir") { var r = grupoAbrir(); if (r && !r.ok && r.motivo) aviso(r.motivo); }
          else if (a === "agrupar") { cartaoPeca = null; grupoAgrupar(); }
          else if (a === "fechar") grupoFechar();
          else if (a === "peca-voltar") { cartaoPeca = null; pintarCartao(); }
          else if (a === "peca-ficha") { var dp = cartaoPeca ? dadosPeca(cartaoPeca) : null; if (dp && dp.ficha) abrirFicha({ titulo: dp.ficha.titulo, url: dp.ficha.url, pagina: dp.ficha.pagina, rotulo: dp.ficha.titulo + (dp.ficha.pagina ? ", p\u00E1gina " + dp.ficha.pagina : "") }); }
        });
      }
      cartaoEl.className = "bimexp-cartao" + (escuro() ? " bimexp-escuro" : "") + (grupoCfg.topo != null ? " bimexp-topo" : "");
      cartaoEl.style.setProperty("--bimexp-base", (grupoCfg.base || 0) + "px");
      if (grupoCfg.topo != null) cartaoEl.style.setProperty("--bimexp-topo", grupoCfg.topo + "px");
      cartaoEl.setAttribute("aria-label", g.titulo);
      var semFicha = !g.ficha, aberto = g.aberto;
      var h = '<div class="bimexp-tit"><b data-bimexp="titulo">' + esc(g.titulo) + '</b><span data-bimexp="n">' + g.n + (g.n === 1 ? " pe\u00E7a" : " pe\u00E7as") + (aberto ? " \u00B7 aberto" : "") + '</span></div>';
      h += '<p class="bimexp-sub">' + (aberto ? "As pe\u00E7as est\u00E3o afastadas em camadas. Toque numa pe\u00E7a para ver os dados dela." : "M\u00F3dulo em destaque. Veja a ficha dele ou abra as pe\u00E7as.") + '</p>';
      if (aberto && cartaoPeca) h += pecaHtml(cartaoPeca);
      h += '<div class="bimexp-acoes">';
      if (aberto) h += '<button type="button" class="bimexp-bt pri" data-bimexp-acao="agrupar">Agrupar</button>';
      h += '<button type="button" class="bimexp-bt' + (aberto ? "" : " pri") + '" data-bimexp-acao="detalhar"' + (semFicha ? ' disabled title="Este grupo n\u00E3o tem ficha ligada"' : "") + '>Ver detalhamento</button>';
      if (!aberto) h += '<button type="button" class="bimexp-bt" data-bimexp-acao="explodir"' + (g.n < 2 ? ' disabled title="Este m\u00F3dulo tem uma pe\u00E7a s\u00F3"' : "") + '>Ver explodida</button>';
      h += '<button type="button" class="bimexp-bt" data-bimexp-acao="fechar">Fechar</button></div>';
      if (semFicha) h += '<p class="bimexp-motivo" data-bimexp="motivo">Este grupo n\u00E3o tem ficha ligada.</p>';
      cartaoEl.innerHTML = h; cartaoEl.hidden = false;
    }
    function aviso(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (_) {} try { if (S._hint) S._hint(t); } catch (_) {} }
    function removerCartaoFicha() { fecharFicha(); if (cartaoEl) { try { cartaoEl.parentNode.removeChild(cartaoEl); } catch (_) {} cartaoEl = null; } }

    /* O CLIQUE (a porta existente do js/bim.js: `S._aoClicarPeca`). Ligada só com a explodida pedida, com o modelo trazendo `vol`, e só se NINGUÉM
       mais a usa (o coletor de peso/içamento manda); o js/bim.js já respeita as ferramentas de clique (trena, corte, área, ângulo, editor): com
       elas ativas o clique é delas e este gancho nem é chamado. Peça sem volumetria e o vazio caem no clique de sempre (`S._cliqueNormal`). */
    function cliqueNormal(e) { if (e && S._cliqueNormal) { try { S._cliqueNormal(e); } catch (_) {} } }
    gancho = function (p, e) {
      var uid = p && p.uid;
      if (!uid) {   /* o vazio: tira o destaque; com o grupo aberto, agrupa antes */
        if (grupo || temGrupoMovel()) grupoFechar();
        cliqueNormal(e); return;
      }
      var g = grupoDaPeca(uid);
      if (!g) { if (grupo || temGrupoMovel()) grupoFechar(); cliqueNormal(e); return; }
      if (!grupo) { grupoEscolher(uid); return; }
      if (grupo.modulo !== g.modulo || grupo.mid !== g.mid) { grupoFechar(); grupoEscolher(uid); return; }
      if (!grupo.aberto) { grupoEscolher(uid); return; }   /* o cartão de 2 opções já está aberto: só a ficha passa a ser a da peça tocada */
      /* grupo aberto, peça do grupo: seleção de sempre (o contorno, e no visor o cartão da peça que já existe); no BIM o cartão da peça é o nosso */
      cliqueNormal(e);
      if (!S._visitante) { cartaoPeca = uid; pintarCartao(); }
    };
    gancho._grupo = true;
    function manterGancho() {
      var quer = grupoCfg.clique && est.alvo === 1 && plano && plano.nVol > 0;
      if (quer) { if (!S._aoClicarPeca) { ganchoAnterior = null; S._aoClicarPeca = gancho; } }
      else if (S._aoClicarPeca === gancho) { S._aoClicarPeca = ganchoAnterior; ganchoAnterior = null; }
    }
    /* o Esc do grupo: fecha a ficha primeiro; depois agrupa e tira o destaque. Devolve true se tratou (a tela que tem Esc próprio — a Prancha Viva — pergunta antes) */
    function grupoEsc() {
      if (fichaEl) { fecharFicha(); return true; }
      if (!(grupo || temGrupoMovel())) return false;
      if (S._ferramentaClique && S._ferramentaClique()) return false;   /* a ferramenta de clique ativa é dona do Esc */
      cartaoPeca = null; grupoFechar(); return true;
    }
    function aoTecla(e) {
      if (!e || (e.key !== "Escape" && e.keyCode !== 27)) return;
      /* ⚠ a mesma guarda do Esc da Prancha Viva (03/11/2026, revisão): o Esc de um modal, de um campo de texto ou de um 3D que não está na página não é do grupo */
      var alvoE = e.target && e.target.tagName; if (/^(INPUT|TEXTAREA|SELECT)$/.test(alvoE || "")) return;
      if (global.document.getElementById("modal-bg") || canvasFora()) return;
      if (grupoEsc()) { e.stopPropagation(); e.preventDefault(); }
    }
    if (global.document && global.document.addEventListener) { global.document.addEventListener("keydown", aoTecla, true); teclaOn = true; }

    /* ---------------------------------------------------------------- a RA nativa: o número em GEOMETRIA, um por módulo */
    function pecasDeCotas() {
      if (!cotas.on) return [];
      var alvos = foco ? alvosFoco() : (temGrupoMovel() ? alvosGrupo() : alvosGerais()), out = [], mn = [1e30, 1e30, 1e30], mx = [-1e30, -1e30, -1e30];
      alvos.forEach(function (a) { E.cantos(E.desloca(a.caixa, a.desl || [0, 0, 0])).forEach(function (p) { for (var i = 0; i < 3; i++) { if (p[i] < mn[i]) mn[i] = p[i]; if (p[i] > mx[i]) mx[i] = p[i]; } }); });
      var lado = Math.max(mx[0] - mn[0], mx[2] - mn[2]); if (!(lado > 0)) return out;
      var altura = lado * 0.012;
      alvos.forEach(function (a) {
        var m = Math.max(a.caixa.meia[0], a.caixa.meia[1], a.caixa.meia[2]) * 2, dz = a.desl || [0, 0, 0];
        var centro = [a.caixa.c[0] + dz[0], a.caixa.c[1] + dz[1] + a.caixa.meia[1] + altura * 1.2, a.caixa.c[2] + dz[2]];
        C.numeroPecas(C.fmtM(m), { centro: centro, altura: altura }).forEach(function (g) { out.push(g); });
      });
      return out;
    }

    /* ---------------------------------------------------------------- o tick */
    function tick(dt) {
      /* modelo trocado/refeito com a explodida ligada. ⚠ Se o modelo novo não tem o modo (dMap vazio), o estado ZERA (03/11/2026, revisão):
         com `alvo = 1` e nada para mover, "Explodir" pedia o que já estava pedido e ficava morto até recarregar a página */
      if ((ativoAplicado || est.alvo === 1) && assinatura() !== sig) {
        if (ativoAplicado) finalizar();
        grupoSnapFechar();   /* o grupo é de um modelo que acabou de mudar */
        plano = null; var p2 = reindexar(); dMap = (modoId && p2.desl[modoId]) || {}; gen++;
        if (!Object.keys(dMap).length) { est.t = 0; est.k = 0; est.alvo = 0; est.movendo = false; modoId = null; enquadrarAoFim = false; camGuardada = null; camEnq = null; cotas.k = -1; }
        else if (est.alvo === 1) aplicar(est.k);
      }
      if (est.movendo || est2.movendo || ativoAplicado) {
        E.passo(est, (dt || 0) * 1000); E.passo(est2, (dt || 0) * 1000);
        if (est.mudou || est2.mudou || (ativoAplicado && precisaReaplicar())) aplicar(est.k, est2.k);
        /* o grupo terminou de fechar: sai do canal (a posição já é a do modo) */
        if (est2.k === 0 && !est2.movendo && est2.alvo === 0 && temGrupoMovel()) { dMap2 = {}; gen++; if (ativoAplicado) aplicar(est.k, 0); cotas.k = -1; }
        if (est.k === 0 && est2.k === 0 && !est.movendo && !est2.movendo && ativoAplicado) finalizar();
      }
      var movendoAgora = !!(est.movendo || est2.movendo);
      if (movAntes && !movendoAgora) contornoDeNovo();   /* o fim do movimento: o contorno da seleção acompanha a peça */
      movAntes = movendoAgora;
      if (grupoEnqAoFim && !est.movendo && !est2.movendo) { grupoEnqAoFim = false; if (!foco) { try { enquadrarGrupo(); } catch (eG) {} } }
      /* ⚠ mesma regra do foco: toda seleção nova limpa o raio-X (js/bim.js), e o clique que escolhe o grupo também seleciona */
      if (grupo && !foco && (S._selN || 0) !== grupo.sel) grupoRaio();
      if (enquadrarAoFim && !est.movendo) { enquadrarAoFim = false; if (!foco) { try { enquadrarConjunto(); } catch (eF) {} } }
      if (foco && foco.reenq && !est.movendo) { foco.reenq = false; try { enquadrarPecaFoco(); } catch (eP) {} }   /* a peça em foco acompanha o Explodir/Montar */
      /* ⚠ o clique que chamou o foco também seleciona a peça, e toda seleção nova limpa o raio-X (js/bim.js, "nova seleção reseta"):
         sem isto o resto do modelo voltava opaco um instante depois do toque. Só quando a SELEÇÃO muda: o botão Restaurar segue valendo. */
      if (foco && (S._selN || 0) !== foco.sel) { foco.sel = S._selN || 0; if (S._raioXChaves) S._raioXChaves([foco.chave], false); semRecado(); }
      manterGancho(); vigiarCanvas();
      if (cotas.on) atualizarCotas(false);
      vigiarFita(dt);
    }
    /* o botão Explodir se desabilita sozinho, com o MOTIVO, quando o modelo não tem o que explodir (uma vez por segundo) */
    var _fitaSig = null, _fitaAcc = 0;
    function vigiarFita(dt) {
      _fitaAcc += dt || 0; if (_fitaAcc < 1) return; _fitaAcc = 0;
      var R = global.BimRibbon; if (!R || !R.desabilitar) return;
      var i = info(), mot = i.modos.length ? "" : i.motivo, sg = mot + "|" + i.modos.map(function (m) { return m.id; }).join();
      if (sg === _fitaSig) return; _fitaSig = sg;
      R.desabilitar("explodir", mot); R.desabilitar("explodir-montar", mot);
      E.ORDEM.forEach(function (m) { var tem = i.modos.some(function (x) { return x.id === m.id; }); R.desabilitar("explodir-" + m.id, tem ? "" : "Este modelo não tem o modo " + m.nome + "."); });
      try { if (global.BimShell && global.BimShell.pintarFita) global.BimShell.pintarFita(); } catch (_) {}
    }
    S._tickExtra.push(tick);

    /* gancho de teste: o estado BYTE A BYTE do que a explodida mexe — o hash dos buffers de posição (mesclado e arestas) e
       o das matrizes das malhas reais. "Montar volta exato" é comparar dois destes. `uids` pede o 1º vértice do mesclado
       de cada peça (em coordenadas do modelo: a posição do buffer + a origem do mesclado) */
    function prova(uids) {
      function fnv(h, u8) { for (var i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 16777619) >>> 0; } return h; }
      var hb = 2166136261, hm = 2166136261, ha = 2166136261, nA = 0, nP = 0, nM = 0, mf = 0, ex = 0, verts = {}, arVerts = {}, pedidos = {}, vers = [];
      (uids || []).forEach(function (u) { pedidos[u] = 1; });
      modelos().forEach(function (mo) {
        if (mo._agreg) mo._agreg.partes.forEach(function (pt) {
          var a = pt.malha.geometry.attributes.position.array; hb = fnv(hb, new Uint8Array(a.buffer, a.byteOffset, a.byteLength)); nP++; vers.push(pt.malha.geometry.attributes.position.version);
          pt.faixas.forEach(function (f) { var u = uidDe(f.ref); if (u && pedidos[u] && !verts[u]) { var o = f.iniVert * 3; verts[u] = [a[o] + pt.malha.position.x, a[o + 1] + pt.malha.position.y, a[o + 2] + pt.malha.position.z]; } });
        });
        var ar = S._arestasDoModelo ? S._arestasDoModelo(mo.mid) : null;
        if (ar && ar.ls) {
          var b = ar.ls.geometry.attributes.position.array; hb = fnv(hb, new Uint8Array(b.buffer, b.byteOffset, b.byteLength)); ha = fnv(ha, new Uint8Array(b.buffer, b.byteOffset, b.byteLength)); nA++;
          ar.faixas.forEach(function (f) { var u = uidDe(f.ref); if (u && pedidos[u] && !arVerts[u]) { var o2 = f.ini * 3; arVerts[u] = [b[o2] + ar.ls.position.x, b[o2 + 1] + ar.ls.position.y, b[o2 + 2] + ar.ls.position.z]; } });
        }
      });
      Object.keys(malhas).forEach(function (u) { malhas[u].forEach(function (m) {
        var e = new Float64Array(m.matrix.elements); hm = fnv(hm, new Uint8Array(e.buffer)); nM++;
        if (m.userData._matFechada) mf++; if (m.userData._explPos0) ex++;
      }); });
      var meshes = {};
      var mats = {}, quats = {}, escs = {};
      Object.keys(pedidos).forEach(function (u) { var m = (malhas[u] || [])[0]; if (m) { meshes[u] = [m.position.x, m.position.y, m.position.z]; mats[u] = m.matrix.elements.slice(); quats[u] = [m.quaternion.x, m.quaternion.y, m.quaternion.z, m.quaternion.w]; escs[u] = [m.scale.x, m.scale.y, m.scale.z]; } });
      return { mats: mats, quats: quats, escs: escs, buf: hb.toString(16), mat: hm.toString(16), ha: nA ? ha.toString(16) : "0", arestas: nA, arVerts: arVerts, partes: nP, malhas: nM, matFechadas: mf, explPos0: ex, verts: verts, meshes: meshes, vers: vers };
    }

    function dispor() {
      grupoSnapFechar();
      if (S._aoClicarPeca === gancho) S._aoClicarPeca = ganchoAnterior;
      if (teclaOn && global.document) { try { global.document.removeEventListener("keydown", aoTecla, true); } catch (_) {} teclaOn = false; }
      removerCartaoFicha();
      if (ativoAplicado) { est.t = 0; est.k = 0; est.movendo = false; try { aplicar(0, 0); finalizar(); } catch (_) {} }
      desmontarCotas(); cotas.on = false; foco = null; grupo = null; pintarBotaoCotas(false);
      var i = S._tickExtra.indexOf(tick); if (i !== -1) S._tickExtra.splice(i, 1);
    }

    return { tick: tick, info: info, explodir: explodir, montar: montar, montarAgora: montarAgora, ligada: ligada, chaveRA: chaveRA, estado: estado, cotasVivas: function (l) { grupoCotasNos = false; return cotasVivas(l); }, cotasLigadas: function () { return cotas.on; },
      focoPeca: focoPeca, focoSair: focoSair, focoAtual: function () { return foco ? foco.uid : null; }, dadosPeca: dadosPeca, diag: diag, recalcular: recalcular,
      pecasDeCotas: pecasDeCotas, dispor: dispor, prova: prova, _estado: est, _estado2: est2,
      grupoDaPeca: function (uid) { var g = grupoDaPeca(uid); return g ? { modulo: g.modulo, mid: g.mid, titulo: g.titulo, n: g.n, ficha: g.ficha, uids: g.uids } : null; },
      grupoEscolher: grupoEscolher, grupoAbrir: grupoAbrir, grupoAgrupar: grupoAgrupar, grupoFechar: grupoFechar, grupoEstado: grupoEstado,
      grupoOpcoes: function (o) {
        if (o && typeof o.cotasAuto === "boolean") grupoCfg.cotasAuto = o.cotasAuto;
        if (o && typeof o.cartao === "boolean") { grupoCfg.cartao = o.cartao; pintarCartao(); }
        if (o && typeof o.clique === "boolean") { grupoCfg.clique = o.clique; manterGancho(); }
        /* onde o cartão fica: `base` = px livres embaixo (barras da tela que o chama); `topo` = px do cabeçalho (o cartão passa para cima) */
        if (o && typeof o.base === "number" && isFinite(o.base)) { grupoCfg.base = o.base; pintarCartao(); }
        if (o && (typeof o.topo === "number" || o.topo === null)) { grupoCfg.topo = o.topo; pintarCartao(); }
        return { cotasAuto: grupoCfg.cotasAuto, cartao: grupoCfg.cartao, clique: grupoCfg.clique, base: grupoCfg.base, topo: grupoCfg.topo };
      },
      grupoEsc: grupoEsc, abrirFicha: abrirFicha, fecharFicha: fecharFicha, cartaoAtual: function () { return cartaoEl && !cartaoEl.hidden ? cartaoEl : null; },
      grupoOuvir: function (fn) { grupoOuvinte = typeof fn === "function" ? fn : null; } };
  }

  /* ---------------------------------------------------------------- a fita: Vista › Explodida */
  var ROTULO_MODO = { geral: "Explodida geral", paineis: "Painéis", niveis: "Níveis", coberturas: "Coberturas" };
  function registrar(reg, g) {
    var R = global.BimRibbon;
    if (!reg) return false;
    function B() { return global.BIM; }
    function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (_) {} }
    function toast(t, k) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "aviso"); } catch (_) {} }
    if (R && R.acrescentar) R.acrescentar("vista", "Vista", "Explodida", [
      { id: "explodir", rotulo: "Explodir", icone: "camadas", grande: true, tipo: "menu", requer: "modelo",
        /* os ids dos itens ficam LITERAIS aqui dentro: o test-bimdisciplinas lê o código-fonte da chamada e confere cada um com a disciplina */
        itens: [{ id: "explodir-geral", rotulo: "Explodida geral", icone: "camadas" }, { id: "explodir-paineis", rotulo: "Painéis", icone: "camadas" },
          { id: "explodir-niveis", rotulo: "Níveis", icone: "camadas" }, { id: "explodir-coberturas", rotulo: "Coberturas", icone: "camadas" }],
        dica: "Afasta as peças do modelo para ver cada uma: explodida geral, só os painéis, os níveis ou as coberturas — o afastamento que o projeto traz. Sem isso no arquivo, os pavimentos se afastam uns dos outros. Montar volta tudo ao lugar." },
      { id: "explodir-montar", rotulo: "Montar", icone: "voltar", requer: "modelo", dica: "Devolve as peças à posição original (exatamente a de antes de explodir)." },
      { id: "cotas-vivas", rotulo: "Cotas\nvivas", icone: "regua", tipo: "alterna", requer: "modelo",
        dica: "Mede cada módulo na tela, em tempo real: a cota fica na aresta de silhueta, afastada da peça, com o texto sempre legível, e acompanha a câmera e a explodida. Com uma peça em foco, mostra comprimento, altura, largura e os furos." }
    ]);
    function modo(id) {
      return function () {
        var b = B(), r = b && b.explodir ? b.explodir(id) : { ok: false, motivo: "O 3D não está aberto." };
        if (!r.ok) { toast(r.motivo || "Não há o que explodir neste modelo.", "aviso"); return false; }
        if (r.modo !== id) status("Este modelo não tem o modo " + (ROTULO_MODO[id] || id) + ": usei " + (ROTULO_MODO[r.modo] || r.modo) + ".");
        else status("Explodida: " + (ROTULO_MODO[r.modo] || r.modo) + (r.auto ? " (automática: o arquivo não traz afastamentos, os pavimentos se afastam)" : "") + ". Montar volta ao original.");
        return true;
      };
    }
    global.BimExplodir.ORDEM.forEach(function (m) { reg["explodir-" + m.id] = modo(m.id); });
    reg.explodir = function () { var i = B() && B().explodirInfo ? B().explodirInfo() : null; return modo(i && i.modos.length ? i.modos[0].id : "geral")(); };
    reg["explodir-montar"] = function () { var b = B(); if (!b || !b.explodirMontar) return false; b.explodirMontar(); status("Peças de volta ao lugar."); return true; };
    reg["cotas-vivas"] = function (e) {
      var b = B(); if (!b || !b.cotasVivas) return false;
      var on = b.cotasVivas(!!e.ligado);
      try { R.setAtivo("cotas-vivas", !!on); } catch (_) {}
      status(on ? "Cotas vivas ligadas: acompanham a câmera e a explodida." : "Cotas vivas desligadas.");
      return true;
    };
    return true;
  }

  var BimExplodirUI = { criar: criar, registrar: registrar, GRANDE: GRANDE, TETO_TEX: TETO_TEX };
  global.BimExplodirUI = BimExplodirUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimExplodirUI;
})(typeof window !== "undefined" ? window : this);
