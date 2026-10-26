/* =====================================================================
 * alvassentamento3d.js — A PAREDE CRUA NO 3D, COMO É ASSENTADA.
 *
 * Pedido do Rogério (20/10/2026): "para quando estivermos mostrando uma
 * parede crua, sem reboco" — os blocos com os furos na orientação real,
 * fiadas, juntas de 1 cm com a argamassa recuada, amarração nos cantos e
 * encontros, verga e contraverga nos vãos, peça cortada na ponta.
 *
 * QUANDO APARECE
 *   · sozinho, na parede de tipo CRU (sem camada de revestimento: os tipos
 *     "Crua · …" do js/alvtipos.js) cujo núcleo tem família de assentamento;
 *   · em TODAS as paredes de alvenaria com o comando "Alvenaria assentada"
 *     (Alvenaria › Paginação) — a vista da obra antes do reboco.
 *   O Blocok (painel EPS) é OUTRO sistema e tem o desenho dele
 *   (js/blocokexecui.js): aqui ele nunca entra.
 *
 * MEMÓRIA E TRIÂNGULOS (a lição do Out of Memory de 20/10/2026)
 *   · INSTANCING: cada TIPO de peça (unidade × comprimento × altura, em mm)
 *     tem UMA geometria (casca + septos, js/alvunidades.js geometria) e um
 *     InstancedMesh por parede; cada peça custa só a matriz (64 bytes).
 *     A argamassa e o graute são caixas unitárias instanciadas.
 *   · NÍVEL DE DETALHE: de longe (> TETO.distanciaDetalhe da caixa da parede),
 *     na planta, no corte e na câmera ortográfica, a parede volta ao desenho
 *     de sempre (com a textura de bloco corrigida); de perto, as peças.
 *   · TETO: a cena inteira não passa de TETO.triangulosCena; se passaria, a
 *     peça sai em caixa simples (12 triângulos) e a tela avisa. A parede de
 *     30 m × 3 m no 8 furos (o mais detalhado) é a prova — tools/test-alvassentamento.js.
 *
 * Gancho: js/bim.js S._alv = AlvAssentamento3D.montar3d({THREE, S, edit,
 * scene, vaos}) e S._alv.aposRebuild(st) no fim de cada reconstrução.
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function AU() { return global.AlvUnidades || null; }
  function AS() { return global.AlvAssentamento || null; }
  function AT() { return global.AlvTipos || null; }
  function AG() { return global.AlvGeo || null; }

  var CORES = {
    ceramico_vedacao: 0xb4613d, ceramico_vedacao_v: 0xb4613d, ceramico_estrutural: 0xa8593a, tijolo_macico: 0xb5683f,
    concreto: 0x85837e, argamassa: 0xbfb7a8, graute: 0x6f6c66, verga: 0xa7a49d
  };

  /* --------------------------------------------- a família de uma parede */
  function nucleoDe(c) {
    var tp = c && c.tipoParede; if (!tp) return null;
    return arr(tp.camadas).filter(function (k) { return k.face === "nucleo"; })[0] || null;
  }
  function ehBlocok(c) {
    var tp = c && c.tipoParede; if (!tp) return false;
    if (/^blk-/.test(String(tp.id || ""))) return true;
    var n = nucleoDe(c); return !!(n && /^blocok_/.test(String(n.id || "")));
  }
  function familiaDe(c, todas) {
    if (!c || c.tipo !== "parede" || ehBlocok(c)) return null;
    if (c.alvFamilia && AU() && AU().familia(c.alvFamilia)) return String(c.alvFamilia);
    var T = AT(), n = nucleoDe(c);
    if (n && T && T.NUCLEOS[n.id]) {
      var nu = T.NUCLEOS[n.id];
      if (nu.alv) return nu.alv;
      if (nu.alvPorFuncao) {
        var tipo = T.TIPOS[String(c.tipoParede.id || "")], f = (tipo && tipo.funcao) || "vedacao";
        return nu.alvPorFuncao[f] || nu.alvPorFuncao.vedacao || null;
      }
      return null;   /* núcleo conhecido sem bloco (concreto, drywall): não assenta */
    }
    if (!todas) return null;
    if (n && n.material && /concreto|drywall|seco/i.test(String(n.material))) return null;
    /* parede sem tipo: pela espessura, o cerâmico de vedação de mesma largura (a obra corrente) */
    var t = num(n ? n.e : c.espessura, 0);
    if (!(t > 0.05)) return null;
    return t <= 0.105 ? "cv-8f-9" : (t <= 0.13 ? "cv-8f-11" : (t <= 0.165 ? "cv-9f-14" : (t <= 0.21 ? "cv-9f-19" : null)));
  }
  function ehCrua(c) {
    var tp = c && c.tipoParede; if (!tp) return false;
    return !arr(tp.camadas).some(function (k) { return k.face !== "nucleo"; });
  }

  /* --------------------------------------------- as paredes do estado → entradas do motor */
  function paredesDoEstado(st, vaosMap, todas, frameDe, aMundo) {
    var U = AU(), lista = [];
    arr(st && st.caixas).forEach(function (c) {
      if (!c || c.tipo !== "parede") return;
      if (!todas && !ehCrua(c)) return;
      var fam = familiaDe(c, todas); if (!fam) return;
      var F = U.familia(fam); if (!F) return;
      var f = frameDe(c), p1 = aMundo(f, -f.L / 2, 0), p2 = aMundo(f, f.L / 2, 0);
      var vr = vaosMap[c.id] || {}, ac = vr.aceitos || [];
      var uI = U.unidade(F.pecas.inteiro);
      lista.push({ c: c, f: f, fam: fam, l: uI.l, id: String(c.id), p1: { x: p1[0], y: p1[1] }, p2: { x: p2[0], y: p2[1] },
                   entrada: { id: String(c.id), L: f.L, H: f.H, familia: fam, ini: { tipo: "livre" }, fim: { tipo: "livre" }, interrupcoes: [], fixas: [],
                              vaos: ac.map(function (v) { return { tipo: num(v.y0, 0) < 0.05 ? "porta" : "janela", x0: num(v.x0, 0) + f.L / 2, x1: num(v.x1, 0) + f.L / 2, y0: num(v.y0, 0), y1: num(v.y1, 0) }; }) } });
    });
    /* ENCONTROS (js/alvgeo.js): L = canto, T = ponta no meio da outra, X = cruzamento */
    var G = AG(), J = U.JUNTA;
    if (G && G.encontros && lista.length > 1) {
      var porId = {}; lista.forEach(function (w) { porId[w.id] = w; });
      var ens = G.encontros(lista.map(function (w) { return { id: w.id, p1: w.p1, p2: w.p2 }; }), { tolerancia: 0.05 });
      ens.forEach(function (e) {
        var A = porId[e.a], B = porId[e.b]; if (!A || !B) return;
        function sDe(w, P) { var dx = w.p2.x - w.p1.x, dy = w.p2.y - w.p1.y, L = Math.sqrt(dx * dx + dy * dy) || 1; return ((P.x - w.p1.x) * dx + (P.y - w.p1.y) * dy) / L; }
        if (e.tipo === "L") {
          /* a de id menor atravessa nas fiadas pares, a outra nas ímpares */
          var aPassa = String(A.id) < String(B.id) ? "par" : "impar", bPassa = aPassa === "par" ? "impar" : "par";
          A.entrada[e.pontaA === "p1" ? "ini" : "fim"] = { tipo: "L", passa: aPassa, t: B.l };
          B.entrada[e.pontaB === "p1" ? "ini" : "fim"] = { tipo: "L", passa: bPassa, t: A.l };
        } else if (e.tipo === "T") {
          var ponta = e.pontaA ? A : B, corpo = e.pontaA ? B : A, qual = e.pontaA || e.pontaB;
          ponta.entrada[qual === "p1" ? "ini" : "fim"] = { tipo: "T", passa: "par", t: corpo.l };
          var s = sDe(corpo, e.ponto);
          corpo.entrada.interrupcoes.push({ x0: s - ponta.l / 2 - J, x1: s + ponta.l / 2 + J, paridade: 0 });
          corpo.entrada.fixas.push({ x: s, paridade: 1, papel: "amarracao-t" });
        } else if (e.tipo === "X") {
          var sa = sDe(A, e.ponto), sb = sDe(B, e.ponto);
          A.entrada.interrupcoes.push({ x0: sa - B.l / 2 - J, x1: sa + B.l / 2 + J, paridade: 0 });
          B.entrada.interrupcoes.push({ x0: sb - A.l / 2 - J, x1: sb + A.l / 2 + J, paridade: 1 });
        }
      });
    }
    return lista;
  }

  /* --------------------------------------------- geometria de uma peça (cache por tipo) */
  function geoDaPeca(T, cache, uid, c, a, simples) {
    var k = uid + "|" + Math.round(c * 1000) + "|" + Math.round(a * 1000) + (simples ? "|s" : "");
    if (cache[k]) return cache[k];
    var U = AU(), u = U.unidade(uid);
    var g = U.geometria(u, { c: c, a: a, simples: simples });
    var pos = [], nor = [];
    function face(p0, p1, p2, p3, n) {
      [p0, p1, p2, p0, p2, p3].forEach(function (p) { pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); });
    }
    g.caixas.forEach(function (b) {
      var x0 = b.x, x1 = b.x + b.w, y0 = b.y, y1 = b.y + b.h, z0 = b.z, z1 = b.z + b.d;
      face([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
      face([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
      face([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
      face([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
      face([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]);
      face([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
    });
    var geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
    geo.userData = { tri: pos.length / 9 };
    cache[k] = geo;
    return geo;
  }

  /* ===================================================================== */
  var estado = { ligado: false, api: null, grupos: [], cache: {}, escondidas: [], ultimo: null, quadro: 0, resumo: null, mats: null };

  function materiais(T) {
    if (estado.mats) return estado.mats;
    var m = {};
    Object.keys(CORES).forEach(function (k) {
      m[k] = new T.MeshStandardMaterial({ color: CORES[k], roughness: k === "graute" ? 0.95 : 0.88, metalness: 0 });
    });
    estado.mats = m;
    return m;
  }

  function limpar() {
    /* dispose() de CADA InstancedMesh: no three r150 é o evento "dispose" dele que libera o buffer da
       instanceMatrix na placa (WebGLObjects). Sem isso cada reconstrução deixava os buffers da anterior
       (revisão de 21/10/2026 — tools/test-alvassentamento3d-memoria.mjs). A geometria (cache por tipo de
       peça) e a caixa unitária são compartilhadas: não levam dispose aqui. */
    estado.grupos.forEach(function (g) {
      if (g.grupo.parent) g.grupo.parent.remove(g.grupo);
      var ims = []; g.grupo.traverse(function (o) { if (o.isInstancedMesh) ims.push(o); });
      ims.forEach(function (o) { try { o.dispose(); } catch (e) {} });
    });
    estado.grupos = [];
    estado.escondidas.forEach(function (m) { m.visible = true; if (m.userData) m.userData._alvOculta = false; }); estado.escondidas = [];
  }

  function desenhar(st) {
    var api = estado.api; if (!api || !api.THREE) return null;
    var T = api.THREE, S = api.S, U = AU(), A = AS();
    limpar();
    if (!U || !A || !global.BimArq || !BimArq.frameDe) return null;
    var vaosMap = {};
    try { vaosMap = api.vaos ? api.vaos(st) : {}; } catch (e) { vaosMap = {}; }
    var lista = paredesDoEstado(st, vaosMap, estado.ligado, BimArq.frameDe, BimArq.aMundo);
    if (!lista.length) { estado.resumo = { paredes: 0, pecas: 0, triangulos: 0 }; return estado.resumo; }
    var M = materiais(T), unit = estado.unit || (estado.unit = new T.BoxGeometry(1, 1, 1));
    /* 1ª passada: paginar e somar triângulos para decidir o detalhe */
    var res = lista.map(function (w) { return A.paginar(w.entrada); });
    var triTot = 0, pecTot = 0;
    res.forEach(function (r) { if (r && r.ok) { triTot += r.triangulos; pecTot += r.pecas.length; } });
    var simples = triTot > A.TETO.triangulosCena || pecTot > A.TETO.pecasCena;
    /* dentro do modelRoot: as peças herdam a mesma transformação do modelo do editor (as coordenadas são as dele) */
    var root = (S && S.modelRoot) || api.scene || (S && S.scene);
    var triReal = 0, avisos = [];
    lista.forEach(function (w, iw) {
      var r = res[iw]; if (!r || !r.ok) { if (r && r.motivo) avisos.push(w.id + ": " + r.motivo); return; }
      var f = w.f, F = U.familia(w.fam);
      var co = f.co, si = f.si;
      /* referencial da parede: x ao longo (co, 0, −si), y para cima, z na espessura (si, 0, co); origem no centro do eixo, na base */
      var mw = new T.Matrix4().set(co, 0, si, f.cx, 0, 1, 0, f.y0, -si, 0, co, f.cz, 0, 0, 0, 1);
      var grupo = new T.Group(); grupo.name = "alv-assentada-" + w.id; grupo.userData = { alvParede: w.id };
      var porGeo = {};
      r.pecas.forEach(function (p) {
        var geo = geoDaPeca(T, estado.cache, p.u, p.c, p.a, simples);
        var k = geo.uuid;
        (porGeo[k] = porGeo[k] || { geo: geo, grupoCor: U.unidade(p.u).grupo, ms: [] }).ms.push(new T.Matrix4().makeTranslation(p.x - f.L / 2, p.y, 0).premultiply(mw));
      });
      Object.keys(porGeo).forEach(function (k) {
        var g = porGeo[k], im = new T.InstancedMesh(g.geo, M[g.grupoCor] || M.ceramico_vedacao, g.ms.length);
        g.ms.forEach(function (m, i) { im.setMatrixAt(i, m); });
        im.instanceMatrix.needsUpdate = true; im.raycast = function () {}; im.userData = { alvPecas: true };
        im.computeBoundingSphere && im.computeBoundingSphere();
        grupo.add(im); triReal += g.geo.userData.tri * g.ms.length;
      });
      /* argamassa: caixas recuadas 5 mm de cada face — a junta aparece */
      var lA = r.espessura - 2 * A.RECUO_JUNTA;
      function caixas(lst, mat, prof) {
        if (!lst.length) return;
        var im = new T.InstancedMesh(unit, mat, lst.length);
        lst.forEach(function (b, i) {
          var m = new T.Matrix4().compose(new T.Vector3((b.x0 + b.x1) / 2 - f.L / 2, (b.y0 + b.y1) / 2, 0), new T.Quaternion(), new T.Vector3(Math.max(1e-4, b.x1 - b.x0), Math.max(1e-4, b.y1 - b.y0), prof));
          im.setMatrixAt(i, m.premultiply(mw));
        });
        im.instanceMatrix.needsUpdate = true; im.raycast = function () {}; im.userData = { unitBox: true };
        grupo.add(im); triReal += 12 * lst.length;
      }
      caixas(r.argamassa, M.argamassa, lA);
      caixas(r.vergas.filter(function (v) { return v.modo !== "canaleta"; }), M.verga, r.espessura);
      /* o graute dentro da canaleta (verga, contraverga, respaldo) */
      var gr = [];
      r.pecas.forEach(function (p) {
        if (!p.graute && !/canaleta/.test(p.papel)) return;
        var g = U.geometria(p.u, { c: p.c, a: p.a }), canal = g && g.furos.filter(function (h) { return h.canal; })[0];
        if (canal) gr.push({ x0: p.x, x1: p.x + p.c, y0: p.y + canal.y, y1: p.y + p.a - 0.01 });
      });
      caixas(gr, M.graute, Math.max(0.02, r.espessura - 2 * (U.unidade(F.pecas.inteiro).parede ? 0.03 : 0.03)));
      root.add(grupo);
      estado.grupos.push({ id: w.id, grupo: grupo, centro: new T.Vector3(f.cx, f.y0 + f.H / 2, f.cz), raio: Math.max(f.L, f.H) / 2, res: r });
    });
    estado.resumo = { paredes: estado.grupos.length, pecas: pecTot, triangulos: triReal, simples: simples, avisos: avisos,
                      porParede: estado.grupos.map(function (g) { return { id: g.id, familia: g.res.familia, pecas: g.res.pecas.length, porPapel: g.res.porPapel, avisos: g.res.avisos, triangulos: g.res.triangulos }; }) };
    if (simples) avisos.push("Cena grande: as peças saem em caixa simples (teto de " + A.TETO.triangulosCena + " triângulos).");
    lod(true);
    return estado.resumo;
  }

  /* --------------------------------------------- nível de detalhe */
  var _v = null;
  function lod(forcar) {
    var api = estado.api; if (!api || !estado.grupos.length) return;
    var S = api.S, T = api.THREE, cam = S && S.camera; if (!cam) return;
    var desenho = !cam.isPerspectiveCamera || (S.planta && S.planta.on) || (S.corteL && S.corteL.on);
    var D = AS().TETO.distanciaDetalhe;
    _v = _v || new T.Vector3();
    estado.grupos.forEach(function (g) {
      _v.copy(g.centro); if (S.modelRoot) { S.modelRoot.updateMatrixWorld(); _v.applyMatrix4(S.modelRoot.matrixWorld); }
      var perto = !desenho && (_v.distanceTo(cam.position) - g.raio) < D;
      if (g.grupo.visible !== perto || forcar) {
        g.grupo.visible = perto;
        mostrarOriginal(g.id, !perto);
      }
    });
  }
  function mostrarOriginal(id, mostra) {
    var api = estado.api, S = api && api.S; if (!S || !S.modelRoot) return;
    S.modelRoot.traverse(function (m) {
      if (!m.isMesh) return; var ud = m.userData || {};
      if (ud.mid === "edit" && String(ud.expressID) === String(id)) {
        /* _alvOculta: a peça está escondida SÓ por causa dos blocos — o raio do clique ainda a acerta (js/bim.js visivelParaRaio) */
        if (!mostra) { if (m.visible) { m.visible = false; m.userData._alvOculta = true; estado.escondidas.push(m); } }
        else if (!m.visible && estado.escondidas.indexOf(m) >= 0) { m.visible = true; m.userData._alvOculta = false; estado.escondidas.splice(estado.escondidas.indexOf(m), 1); }
      }
    });
  }

  var timer = null;
  var AlvAssentamento3D = {
    familiaDe: familiaDe, ehCrua: ehCrua, paredesDoEstado: paredesDoEstado,
    montar3d: function (api) {
      estado.api = api || null;
      try {
        if (api && api.S && api.S._tickExtra) api.S._tickExtra.push(function () { if (++estado.quadro % 15) return; lod(false); });
      } catch (e) {}
      return {
        aposRebuild: function (st) {
          estado.ultimo = st || null;
          clearTimeout(timer);
          timer = setTimeout(function () { try { desenhar(estado.ultimo); } catch (e) { try { console.warn("[alvenaria assentada]", e); } catch (_) {} } }, 250);
        }
      };
    },
    /* o comando "Alvenaria assentada": todas as paredes de alvenaria cruas (sem o revestimento) */
    alternar: function (liga) {
      estado.ligado = liga == null ? !estado.ligado : !!liga;
      var st = estado.ultimo;
      if (!st) { try { var e = global.BIM && BIM.editarEstado ? BIM.editarEstado() : null; st = e && e.estado ? e.estado : null; } catch (e2) {} }
      var r = desenhar(st);
      return { ligado: estado.ligado, resumo: r };
    },
    ligado: function () { return estado.ligado; },
    redesenhar: function () { return desenhar(estado.ultimo); },
    resumo: function () { return estado.resumo; },
    /* gancho de teste (e2e): põe a câmera num ponto olhando um alvo, e o nível de detalhe recalcula */
    _camera: function (pos, alvo) {
      var S = estado.api && estado.api.S; if (!S || !S.camera || !S.orbit) return false;
      var T = estado.api.THREE, P = new T.Vector3(pos[0], pos[1], pos[2]), A = new T.Vector3(alvo[0], alvo[1], alvo[2]);
      if (S.modelRoot) { S.modelRoot.updateMatrixWorld(true); P.applyMatrix4(S.modelRoot.matrixWorld); A.applyMatrix4(S.modelRoot.matrixWorld); }
      S.camera.position.copy(P); S.orbit.target.copy(A); S.orbit.update(); lod(true); return true;
    },
    /* ⚠ A VISTA 2D NÃO É O {3D} DE PERTO (26/10/2026, defeito da 1.2.182). O nível de detalhe acima troca a parede pelos
       blocos com a câmera a menos de TETO.distanciaDetalhe (18 m) — e troca ESCONDENDO a malha original (visible = false,
       _alvOculta) e pondo os grupos de blocos (InstancedMesh) dentro do modelRoot. A planta, o corte e a elevação
       (js/bim.js vista2d) leem a cena e respeitam a visibilidade: extraídas com o 3D de perto, as paredes cruas SUMIAM da
       planta (o Rogério: "volto para a planta baixa e as paredes somem ou aparecem só algumas" — só as que estavam a mais
       de 18 m da câmera ficavam) e um bloco e uma caixa de 1 m da argamassa (a geometria da instância sem a matriz dela)
       apareciam soltos na origem. Não era da fluidez: com o segundo plano desligado o mesmo acontecia na hora do clique
       (tools/e2e-bim-planta-paredes.js, PAREDES_CN_FILA=1).
       paraDesenho(fn) roda fn com a cena como o desenho técnico a vê — a parede original no lugar, os blocos fora — e
       devolve a visibilidade EXATA de antes (não recalcula o nível de detalhe: nada muda no 3D). Síncrono; aninhado vale. */
    paraDesenho: function (fn) {
      var trocas = [];
      estado.grupos.forEach(function (g) { if (g.grupo && g.grupo.visible !== false) { trocas.push([g.grupo, g.grupo.visible]); g.grupo.visible = false; } });
      estado.escondidas.forEach(function (m) { if (m && m.visible === false && m.userData && m.userData._alvOculta === true) { trocas.push([m, false]); m.visible = true; } });
      try { return fn(); } finally { for (var i = trocas.length - 1; i >= 0; i--) trocas[i][0].visible = trocas[i][1]; }
    },
    /* para o e2e: força o detalhe (ou o longe) sem mexer na câmera */
    forcarDetalhe: function (perto) { estado.grupos.forEach(function (g) { g.grupo.visible = !!perto; mostrarOriginal(g.id, !perto); }); }
  };

  global.AlvAssentamento3D = AlvAssentamento3D;
  if (typeof module !== "undefined" && module.exports) module.exports = AlvAssentamento3D;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
