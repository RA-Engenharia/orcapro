/* =====================================================================
 * bimcontrole.js — CONTROLE DE VIDEOGAME NO BIM (Gamepad API, "standard").
 * 15/10/2026, item do BACKLOG para a 1.2.149. ES5, sem build.
 *
 * Pedido do Rogério: navegar e APRESENTAR modelos com um controle de Xbox 360
 * com fio (XInput), sem instalar nada: ligou no USB, abriu o BIM, funciona.
 *
 * DUAS METADES NO MESMO ARQUIVO:
 *   [PURA]  zona morta, curva, borda de botão, mapa → ação, integração por dt,
 *           ciclo de abas, relógio do passeio automático. Sem DOM: o
 *           tools/test-bim-controle.js roda tudo em Node.
 *   [VIVA]  criar(S, THREE): o gancho que o js/bim.js pendura no laço de
 *           quadro (S._tickExtra). Sem controle conectado a função volta na
 *           primeira linha — custo zero, e nenhum getGamepads() é chamado.
 *
 * MAPA (Xbox 360 por XInput, mapping "standard"):
 *   eixos 0/1 = direcional esquerdo, 2/3 = direito; gatilhos são botões 6/7
 *   com .value de 0 a 1.  0 A · 1 B · 2 X · 3 Y · 4 LB · 5 RB · 8 BACK ·
 *   9 START · 10 L3 · 11 R3 · 12 cima · 13 baixo · 14 esquerda · 15 direita.
 *   Se mapping !== "standard" o módulo AVISA e não adivinha botão nenhum.
 *
 * ⚠ ZONA MORTA É RADIAL (o par x,y), com curva: o controle não "anda sozinho"
 *   (um direcional solto raramente volta a 0,00 exato) e a resposta perto do
 *   centro é fina o bastante para enquadrar sem tremer.
 * ⚠ VELOCIDADE = tamanho do modelo × dt (não "por quadro"): a 30 ou a 144 Hz o
 *   mesmo tempo de direcional dá o mesmo caminho. O deslocamento da órbita é
 *   limitado pela distância à mira, senão com zoom colado numa peça o modelo
 *   voaria na velocidade de um prédio inteiro.
 * ⚠ BOTÃO AGE NA BORDA DE DESCIDA. Botão que já estava apertado quando o
 *   controle apareceu NÃO dispara (primeira leitura só memoriza).
 * ⚠ NÃO VAZA LISTENER: criar() devolve dispor(); o js/bim.js chama no
 *   desmontarMorto (mesma regra do comentário em bim.js:310).
 * ===================================================================== */
(function (global) {
  "use strict";

  var ZONA_MORTA = 0.15;      /* direcionais */
  var ZONA_GATILHO = 0.05;    /* LT/RT */
  var CURVA = 1.6;            /* 1 = linear; >1 = fino perto do centro */
  var VEL_PAN = 0.6;          /* escalas por segundo, em deflexão total */
  var VEL_PASSEIO = 0.3;      /* idem, andando */
  var VEL_GIRO = 1.9;         /* rad/s */
  var VEL_ZOOM = 1.6;         /* e-folds por segundo */
  var INTERVALO_PASSEIO = 6;  /* s por vista no passeio automático */
  var ESCALA_MIN = 0.05;      /* fração do tamanho do modelo: piso do deslocamento */

  /* botão do padrão → ação. Os gatilhos (6/7) e os direcionais (axes) não são "ação": são contínuos. */
  var MAPA = {
    0: "selecionar", 1: "voltar", 2: "isolar", 3: "enquadrar",
    4: "abaAnterior", 5: "abaProxima",
    8: "alternarModo", 9: "passeioAuto", 10: "caixaCorte", 11: "trena",
    12: "vistaTopo", 13: "vistaIso", 14: "vistaFrente", 15: "vistaLateral"
  };
  /* de onde se olha (cena: Y é o alto) — mesmas normais do ViewCube */
  var VISTAS = { vistaTopo: [0, 1, 0], vistaIso: [1, 0.85, 1], vistaFrente: [0, 0, 1], vistaLateral: [1, 0, 0] };

  function num(v) { v = +v; return isFinite(v) ? v : 0; }
  function limitar(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ----------------------------------------------------------- [PURA] */

  /* um eixo sozinho: dentro da zona morta = 0; fora, reescalado de 0 a 1 e curvado */
  function eixo(v, zm, curva) {
    v = limitar(num(v), -1, 1); zm = zm == null ? ZONA_MORTA : zm; curva = curva == null ? CURVA : curva;
    var m = Math.abs(v); if (m <= zm) return 0;
    var r = Math.pow((m - zm) / (1 - zm), curva);
    return v < 0 ? -r : r;
  }
  /* o par x,y de um direcional: zona morta RADIAL (o círculo, não o quadrado) */
  function par(x, y, zm, curva) {
    x = limitar(num(x), -1, 1); y = limitar(num(y), -1, 1); zm = zm == null ? ZONA_MORTA : zm; curva = curva == null ? CURVA : curva;
    var mr = Math.sqrt(x * x + y * y), m = Math.min(1, mr);   /* a diagonal cheia (1,1) tem módulo 1,41: limita o módulo, não cada eixo */
    if (m <= zm) return { x: 0, y: 0 };
    var r = Math.pow((m - zm) / (1 - zm), curva), k = r / mr;
    return { x: x * k, y: y * k };
  }
  /* gatilho: botão {value} (ou número) → 0..1 com zona morta pequena */
  function gatilho(b) {
    var v = b == null ? 0 : (typeof b === "object" ? (b.value != null ? b.value : (b.pressed ? 1 : 0)) : b);
    return eixo(limitar(num(v), 0, 1), ZONA_GATILHO, 1.3);
  }
  function ehPadrao(gp) { return !!gp && gp.mapping === "standard"; }

  /* lê um objeto Gamepad (ou parecido) → entrada normalizada. Fora do padrão: { padrao:false } e mais nada. */
  function lerEntrada(gp) {
    if (!ehPadrao(gp)) return { padrao: false };
    var ax = gp.axes || [], bt = gp.buttons || [], botoes = [], i;
    for (i = 0; i < 17; i++) { var b = bt[i]; botoes.push(!!(b && (b.pressed || (b.value != null && b.value > 0.5)))); }
    botoes[6] = false; botoes[7] = false;   /* gatilhos são contínuos, não botão */
    return {
      padrao: true,
      esq: par(ax[0], ax[1]), dir: par(ax[2], ax[3]),
      lt: gatilho(bt[6]), rt: gatilho(bt[7]),
      botoes: botoes
    };
  }
  /* índices que ACABARAM de descer. antes==null (primeira leitura) memoriza sem disparar. */
  function bordaDescida(antes, agora) {
    var out = []; if (!antes || !agora) return out;
    for (var i = 0; i < agora.length; i++) if (agora[i] && !antes[i]) out.push(i);
    return out;
  }
  /* ações do quadro: as bordas passadas pelo MAPA, na ordem do botão */
  function acoesDe(antes, agora) {
    return bordaDescida(antes, agora).map(function (i) { return MAPA[i]; }).filter(function (a) { return !!a; });
  }
  /* o deslocamento de um quadro tem a escala do modelo, mas nunca passa da distância à mira por muito */
  function escala(tam, dist) {
    tam = Math.max(num(tam), 0.5); dist = num(dist);
    if (!(dist > 0)) return tam;
    return Math.min(tam, Math.max(dist, tam * ESCALA_MIN));
  }
  /* o que um quadro de entrada (e) faz, em dt segundos.
     modo "orbita": pan = [direita, cima] (unidades da cena), az/pol (rad, convenção do arrasto do mouse),
                    zoom = fator multiplicativo da distância (<1 aproxima)
     modo "passeio": frente/lado/vert (unidades), yaw/pitch (rad, convenção do mouse com pointer lock) */
  function integrar(modo, e, dt, tam, dist) {
    dt = limitar(num(dt), 0, 0.1);
    var z = (e.rt || 0) - (e.lt || 0);
    if (modo === "passeio") {
      var v = Math.max(num(tam), 0.5) * VEL_PASSEIO * dt;
      return { frente: -e.esq.y * v, lado: e.esq.x * v, vert: z * v, yaw: -e.dir.x * VEL_GIRO * dt, pitch: -e.dir.y * VEL_GIRO * dt };
    }
    var s = escala(tam, dist) * VEL_PAN * dt;
    return { pan: [e.esq.x * s, -e.esq.y * s], az: -e.dir.x * VEL_GIRO * dt, pol: -e.dir.y * VEL_GIRO * dt, zoom: Math.exp(-z * VEL_ZOOM * dt) };
  }
  function parado(e) { return !e.esq.x && !e.esq.y && !e.dir.x && !e.dir.y && !e.lt && !e.rt; }

  /* LB/RB: a aba vizinha (cíclico). Aba que não está na lista (fechou) recomeça pela primeira. */
  function proximaAba(ids, ativa, passo) {
    if (!ids || !ids.length) return null;
    var i = ids.indexOf(ativa); if (i < 0) return ids[0];
    return ids[(i + (passo < 0 ? -1 : 1) + ids.length) % ids.length];
  }
  /* o relógio do passeio automático: avança o contador; devolve { t, avancar } */
  function passoPasseio(t, dt, intervalo) {
    intervalo = intervalo || INTERVALO_PASSEIO; t = num(t) + limitar(num(dt), 0, 0.1);
    if (t >= intervalo) return { t: t - intervalo, avancar: true };
    return { t: t, avancar: false };
  }
  /* direção do olhar → yaw/pitch do passeio (ordem YXZ, como o flyStep) e o contrário */
  function olharDe(dx, dy, dz) {
    var m = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    return { yaw: Math.atan2(-dx / m, -dz / m), pitch: Math.asin(limitar(dy / m, -1, 1)) };
  }

  /* ----------------------------------------------------------- [VIVA] */

  function criar(S, THREE, env) {
    env = env || {};
    var win = env.win || (typeof window !== "undefined" ? window : null);
    var doc = env.doc || (typeof document !== "undefined" ? document : null);
    var nav = env.nav || (typeof navigator !== "undefined" ? navigator : null);
    var st = { on: false, padrao: true, indice: -1, id: "", antes: null, tour: { on: false, t: 0, i: 0, lista: [] }, ultimoUso: 0, tam: 1, tamT: -1e9, mira: null, avisouFora: false };
    var _v = THREE ? new THREE.Vector3() : null, _sph = THREE ? new THREE.Spherical() : null;

    function podeLer() { return !!(nav && typeof nav.getGamepads === "function"); }
    function lista() { try { return podeLer() ? (nav.getGamepads() || []) : []; } catch (e) { return []; } }
    function dica(m) { try { if (S && S._hint) S._hint(m); } catch (e) {} }
    function agora() { return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now(); }

    function escolher(gp) {
      if (!gp) return;
      st.on = true; st.indice = gp.index; st.id = gp.id || ""; st.antes = null; st.padrao = ehPadrao(gp); st.ultimoUso = agora();
    }
    function aoConectar(ev) {
      var gp = ev && ev.gamepad; if (!gp) return;
      escolher(gp);
      dica(st.padrao ? "Controle conectado." : "Controle conectado, mas o mapeamento não é o padrão: não vou adivinhar os botões. Use um controle Xbox 360 com fio.");
    }
    function aoDesconectar(ev) {
      var gp = ev && ev.gamepad; if (gp && gp.index !== st.indice) return;
      var resto = lista().filter(function (g) { return !!g && g.connected !== false && !(gp && g.index === gp.index); });
      if (resto.length) { escolher(resto[0]); return; }
      pararPasseioAuto(true);
      st.on = false; st.indice = -1; st.antes = null;
      esconderMira();
      dica("Controle desconectado.");
    }
    if (win) { win.addEventListener("gamepadconnected", aoConectar); win.addEventListener("gamepaddisconnected", aoDesconectar); }
    /* o Chrome já pode ter um controle "visto" nesta página (remontagem): entra calado */
    (function () { var l = lista().filter(function (g) { return !!g && g.connected !== false; }); if (l.length) escolher(l[0]); })();

    /* ---- guardas: quando o controle NÃO mexe em nada ---- */
    function campoDeTexto() {
      var a = doc && doc.activeElement; if (!a) return false;
      return /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName || "") || !!a.isContentEditable;
    }
    function naTela() {
      var h = S.host; if (!h || !h.isConnected) return false;
      var raiz = h.closest ? (h.closest(".bim-revit") || h) : h;
      return !!(raiz && raiz.isConnected && raiz.getClientRects().length);
    }
    function modeloTam() {
      var t = agora(); if (t - st.tamT < 1500) return st.tam;
      try { var b = new THREE.Box3().setFromObject(S.modelRoot); if (!b.isEmpty()) st.tam = Math.max(b.getSize(_v).length(), 0.5); } catch (e) {}
      st.tamT = t; return st.tam;
    }
    /* ⚠ "ferramenta armada" NÃO é "editor ligado": selecionar uma peça do modelador já liga o editor (S.edit.on), e o A
       tem de continuar selecionando. Quem sabe é o mesmo teste que o clique do mouse usa (semFerramenta3d). */
    function ferramentaAtiva() {
      var planta = !!((S.corteL && S.corteL.on) || (S.planta && S.planta.on));
      if (S._semFerramenta3d) return !S._semFerramenta3d() || planta;
      return !!((S.medir && S.medir.on) || (S.area && S.area.on) || (S.ang && S.ang.on) || (S.edit && S.edit.on && S.edit.sub) || planta);
    }
    function cameraLivre() {
      return !(S.trava && S.trava.on) && !S._principalOculta && !(S.planta && S.planta.on) && !(S.corteL && S.corteL.on) && !(S.lupa && S.lupa.on) && !(S.xr && S.xr.on);
    }

    /* ---- mira do centro (A seleciona o que está nela) ---- */
    function garantirMira() {
      if (st.mira && st.mira.parentNode === S.host) return st.mira;
      if (st.mira && st.mira.parentNode) st.mira.parentNode.removeChild(st.mira);
      if (!doc || !S.host) return null;
      var m = doc.createElement("div"); m.setAttribute("data-bim", "mira");
      m.style.cssText = "position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;z-index:6;pointer-events:none;display:none";
      m.innerHTML = '<svg viewBox="0 0 26 26" width="26" height="26" fill="none" stroke="#ffffff" stroke-width="1.6" style="filter:drop-shadow(0 0 2px rgba(0,0,0,.85))"><circle cx="13" cy="13" r="7"/><path d="M13 1v6M13 19v6M1 13h6M19 13h6"/></svg>';
      S.host.appendChild(m); st.mira = m; S.ctlMira = m;
      return m;
    }
    function mostrarMira() { var m = garantirMira(); if (m) m.style.display = "block"; }
    function esconderMira() { if (st.mira) st.mira.style.display = "none"; }

    /* ---- ações ---- */
    function emPasseio() { return !!(S.fly && S.fly.on); }
    function entrarPasseio() {
      var d = S.camera.getWorldDirection(new THREE.Vector3()), o = olharDe(d.x, d.y, d.z);
      S.fly.yaw = o.yaw; S.fly.pitch = limitar(o.pitch, -1.5, 1.5);
      if (S._setVoo) S._setVoo(true);
      dica("Passeio: direcional esquerdo anda, direito olha, RT sobe e LT desce. BACK volta ao modelo.");
    }
    function sairPasseio() {
      var d = S.camera.getWorldDirection(new THREE.Vector3()), dist = Math.max(S.camera.position.distanceTo(S.orbit.target), modeloTam() * 0.25);
      if (S._setVoo) S._setVoo(false);
      S.orbit.target.copy(S.camera.position).addScaledVector(d, dist);   /* a mira volta à frente da câmera, sem pulo */
      S.camera.lookAt(S.orbit.target);
    }
    function esc() {
      if (!doc || !win || typeof win.KeyboardEvent !== "function") return;
      var alvo = doc.body || doc;
      ["keydown", "keyup"].forEach(function (t) { alvo.dispatchEvent(new win.KeyboardEvent(t, { key: "Escape", code: "Escape", bubbles: true, cancelable: true })); });
    }
    function selecionarNaMira() {
      var r = S.renderer.domElement.getBoundingClientRect(), u = S._uidEm ? S._uidEm(r.left + r.width / 2, r.top + r.height / 2) : null;
      if (u) S._selAplicar(S._compExp ? S._compExp(u) : [u], "trocar");
      else { S._selAplicar([], "trocar"); dica("Nada na mira do centro."); }
    }
    function pararPasseioAuto(calado) {
      if (!st.tour.on) return;
      st.tour.on = false; st.tour.t = 0;
      if (!calado) dica("Passeio automático parado.");
    }
    function irVista(i) {
      var G = win && win.Gestao, v = st.tour.lista[i]; if (!G || !v || !G._bimVistaIr) return;
      try { G._bimVistaIr(v.id); } catch (e) {}
      dica("Apresentação " + (i + 1) + "/" + st.tour.lista.length + ": " + (v.nome || "vista"));
    }
    function passeioAuto() {
      if (st.tour.on) { pararPasseioAuto(); return; }
      var G = win && win.Gestao, l = [];
      try { l = (G && G._bimVistaDaObra && G._bimVistaDaObra()) || []; } catch (e) { l = []; }
      if (!l.length) { dica("Não há pontos de vista salvos nesta obra para apresentar."); return; }
      if (emPasseio()) sairPasseio();
      st.tour = { on: true, t: 0, i: 0, lista: l.slice() };
      dica("Apresentação automática: " + l.length + " vista(s), " + INTERVALO_PASSEIO + " s cada. START para parar.");
      irVista(0);
    }
    function trocarAba(passo) {
      var G = win && win.Gestao; if (!G || !G._bimVxEst) return;
      var e = G._bimVxEst(), ids = ["3d"].concat((e.lista || []).filter(function (v) { return !(v.janela && !v.janela.closed); }).map(function (v) { return v.id; }));
      if (ids.length < 2) { dica("Só há uma vista aberta."); return; }
      var alvo = proximaAba(ids, e.ativa, passo); if (alvo && G._bimVxAtivar) G._bimVxAtivar(alvo);
    }
    function agir(a) {
      /* abas e parar o passeio automático valem em qualquer vista; o resto é da vista 3D principal */
      if (a === "abaAnterior") { trocarAba(-1); return; }
      if (a === "abaProxima") { trocarAba(1); return; }
      if (a === "passeioAuto") { passeioAuto(); return; }
      if (S._principalOculta || (S.xr && S.xr.on)) return;
      if (a === "voltar") {
        if (st.tour.on) { pararPasseioAuto(); return; }
        if (emPasseio()) { sairPasseio(); return; }
        var ferr = ferramentaAtiva(), tinha = (S._selAtual ? S._selAtual() : []).length;
        esc();
        if (!tinha && !ferr && S._algoOculto && S._algoOculto() && win.BimSelInst && win.BimSelInst.mostrarTodos) win.BimSelInst.mostrarTodos();
        return;
      }
      if (a === "alternarModo") { if (emPasseio()) sairPasseio(); else entrarPasseio(); return; }
      if (a === "trena") { if (S._setMedir) S._setMedir(!(S.medir && S.medir.on)); return; }
      if (a === "caixaCorte") { if (S._caixaCorte && S._cxMain) S._caixaCorte(!S._cxMain.on); return; }
      if (emPasseio() || ferramentaAtiva()) return;   /* o resto é do modo modelo, sem ferramenta de desenho/medição armada */
      if (a === "selecionar") { selecionarNaMira(); return; }
      if (a === "isolar") {
        var sel = S._selAtual ? S._selAtual() : [];
        if (!sel.length) { dica("Selecione uma peça (botão A) para isolar."); return; }
        if (win.BimSelInst && win.BimSelInst.isolar) win.BimSelInst.isolar(sel); else if (S._isolarSelecao) S._isolarSelecao();
        return;
      }
      if (a === "enquadrar") {
        var s2 = S._selAtual ? S._selAtual() : [], bx = s2.length && S._caixaDeUids ? S._caixaDeUids(s2) : null;
        if (bx && !bx.isEmpty() && S._enquadrarObj) S._enquadrarObj(bx, 1.6); else if (S._fit) S._fit();
        return;
      }
      if (VISTAS[a] && S._orientarMain) S._orientarMain(VISTAS[a]);
    }

    /* ---- movimento contínuo ---- */
    function mover(e, dt) {
      if (S._cancelTween) S._cancelTween();
      var cam = S.camera, orb = S.orbit;
      if (emPasseio()) {
        var f = S.fly, d = integrar("passeio", e, dt, modeloTam());
        f.yaw += d.yaw; f.pitch = limitar(f.pitch + d.pitch, -1.5, 1.5);
        var fw = cam.getWorldDirection(new THREE.Vector3()), dir = new THREE.Vector3(fw.x, 0, fw.z);
        if (dir.lengthSq() < 1e-8) dir.set(0, 0, -1);   /* olhando reto para cima/baixo: o "frente" some, não explode */
        dir.normalize();
        var right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
        cam.position.addScaledVector(fw, d.frente).addScaledVector(right, d.lado);
        cam.position.y += d.vert;
        cam.quaternion.setFromEuler(new THREE.Euler(f.pitch, f.yaw, 0, "YXZ"));
        return;
      }
      var off = _v.copy(cam.position).sub(orb.target), dist = off.length(), g = integrar("orbita", e, dt, modeloTam(), dist);
      if (g.pan[0] || g.pan[1]) {
        var rt = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 1);
        var mv = rt.multiplyScalar(g.pan[0]).add(up.multiplyScalar(g.pan[1]));
        cam.position.add(mv); orb.target.add(mv);
      }
      if (g.az || g.pol || g.zoom !== 1) {
        off.copy(cam.position).sub(orb.target);
        _sph.setFromVector3(off);
        _sph.theta += g.az; _sph.phi = limitar(_sph.phi + g.pol, 0.01, Math.PI - 0.01);
        _sph.radius = limitar(_sph.radius * g.zoom, orb.minDistance > 0 ? orb.minDistance : 0.05, isFinite(orb.maxDistance) ? orb.maxDistance : 1e9);
        off.setFromSpherical(_sph);
        cam.position.copy(orb.target).add(off);
        cam.lookAt(orb.target);
      }
    }

    /* ---- o quadro ---- */
    function tick(dt) {
      if (!st.on) return;                                 /* sem controle: custo zero */
      if (!S || !S.alive || S._visitante) return;
      var gp = lista()[st.indice]; if (!gp) return;
      var e = lerEntrada(gp);
      if (!e.padrao) {
        if (!st.avisouFora) { st.avisouFora = true; dica("Controle com mapeamento fora do padrão: não vou adivinhar os botões."); }
        return;
      }
      st.avisouFora = false;
      var acoes = acoesDe(st.antes, e.botoes);
      st.antes = e.botoes;
      if (campoDeTexto() || !naTela()) return;            /* digitando, ou o BIM fora da tela: o controle é mudo */
      var mexeu = !parado(e) || acoes.length;
      if (mexeu) { st.ultimoUso = agora(); mostrarMira(); }
      else if (st.mira && st.mira.style.display !== "none" && agora() - st.ultimoUso > 15000) esconderMira();
      acoes.forEach(function (a) { try { agir(a); } catch (er) { if (typeof console !== "undefined") console.warn("BimControle:", a, er); } });
      if (st.tour.on) {
        var p = passoPasseio(st.tour.t, dt); st.tour.t = p.t;
        if (p.avancar && st.tour.lista.length) { st.tour.i = (st.tour.i + 1) % st.tour.lista.length; irVista(st.tour.i); }
      }
      if (!parado(e) && cameraLivre()) mover(e, dt);
    }

    function dispor() {
      if (win) { win.removeEventListener("gamepadconnected", aoConectar); win.removeEventListener("gamepaddisconnected", aoDesconectar); }
      try { if (st.mira && st.mira.parentNode) st.mira.parentNode.removeChild(st.mira); } catch (e) {}
      st.mira = null; st.on = false; st.tour.on = false;
    }
    return {
      tick: tick, dispor: dispor,
      estado: function () { return { on: st.on, padrao: st.padrao, indice: st.indice, passeioAuto: st.tour.on, mira: !!(st.mira && st.mira.style.display !== "none") }; }
    };
  }

  var BimControle = {
    ZONA_MORTA: ZONA_MORTA, ZONA_GATILHO: ZONA_GATILHO, CURVA: CURVA, INTERVALO_PASSEIO: INTERVALO_PASSEIO,
    MAPA: MAPA, VISTAS: VISTAS,
    eixo: eixo, par: par, gatilho: gatilho, ehPadrao: ehPadrao, lerEntrada: lerEntrada,
    bordaDescida: bordaDescida, acoesDe: acoesDe, escala: escala, integrar: integrar, parado: parado,
    proximaAba: proximaAba, passoPasseio: passoPasseio, olharDe: olharDe,
    criar: criar
  };
  global.BimControle = BimControle;
  if (typeof module !== "undefined" && module.exports) module.exports = BimControle;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
