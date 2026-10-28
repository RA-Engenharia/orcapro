/* =====================================================================
 * bimtwinmotion.js — "SINCRONIZAR COM TWINMOTION" na vista 3D (28/10/2026)
 *
 * Pedido do Rogério: "igual ao Revit". Liga um botão na barra da vista 3D e:
 *   · girou/andou no 3D  -> a câmera do Twinmotion acompanha (POST /camera);
 *   · mudou a modelagem  -> o Twinmotion atualiza sozinho, sem salvar (POST /glb, debounce 1,5 s).
 * Quem fala com o Twinmotion é o programa local "OrçaPRO Direct Link" (127.0.0.1:8892; contrato em
 * docs/PEDIDO-TWINMOTION-DIRECTLINK.md). Este arquivo só conversa com ele por HTTP.
 *
 * O EXPORTADOR é a lógica PROVADA de exportar_para_unreal.js (Casa 487, `--twinmotion`):
 *   · só malhas VISÍVEIS (pai a pai) com expressID / acabPiso / p4Pintura;
 *   · fora: tubulação (IFCPIPESEGMENT/FITTING/VALVE/WASTETERMINAL), estrutura embutida `e<n>` (IFCBEAM/IFCCOLUMN),
 *     linha de divisa; cota, prévia, marcador e grade não têm id de elemento, então nem entram;
 *   · um Group por elemento (nome = id); malha `id|parte|solido|n`; extras `ra_*`; InstancedMesh expandido;
 *   · material CLONADO (nunca mexe no da cena) com NOME ESTÁVEL: o Twinmotion troca o material em TODAS as malhas que o
 *     compartilham, então parede, laje, forro, piso e face pintada ganham material PRÓPRIO `<id>__<hex>` — pintar UMA parede
 *     lá muda só ela, e o nome igual a cada envio faz o Twinmotion manter o que o Rogério trocou. Demais: `<nome>_<hex>`.
 *   · usa o material original da fase (`userData._p10orig`) quando houver.
 * ⚠ NÃO muda a vista do usuário (nada de definirVista): exporta o que está visível nela.
 * ⚠ O GLTFExporter é o da MESMA versão do three do app (r150): bim/vendor/jsm/exporters/GLTFExporter.js.
 * ⚠ O estado "ligado" NÃO persiste: o app sempre abre com o botão desligado.
 * ⚠ Só aparece com o app rodando local (localhost/127.0.0.1): no site ou no celular o programa não existe.
 * ===================================================================== */
(function (global) {
  "use strict";

  var URL_PADRAO = "http://127.0.0.1:8892";
  var DEBOUNCE_GLB = 1500;     /* ms depois da última edição */
  var INTERVALO_CAM = 150;     /* ms entre câmeras enviadas */
  var EPS_CAM = 1e-4;
  var FORA = { IFCPIPESEGMENT: 1, IFCPIPEFITTING: 1, IFCVALVE: 1, IFCWASTETERMINAL: 1 };
  /* material próprio (pintar UMA peça no Twinmotion): paredes, lajes, forros e PILARES (cada pilar pinta sozinho, inclusive o topo) */
  var PROPRIO = { IFCWALL: 1, IFCSLAB: 1, IFCCOVERING: 1, IFCCOLUMN: 1 };
  var ESTRUT = { IFCBEAM: 1, IFCCOLUMN: 1 };

  /* URL base do Direct Link: window.OrcaTwURL só existe para teste (servidor falso numa porta livre) */
  function baseUrl() { return String((global && global.OrcaTwURL) || URL_PADRAO).replace(/\/+$/, ""); }

  /* o app roda local? (no site publicado e no celular o botão nem aparece) */
  function ehLocal(loc) {
    var h = String((loc || (global && global.location) || {}).hostname || "").toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1";
  }

  /* ---------------- exportador (puro: recebe o THREE) ---------------- */
  function vivo(o) { for (var x = o; x; x = x.parent) if (x.visible === false) return false; return true; }

  function idDe(u) {
    if (u.expressID != null) return String(u.expressID);
    if (u.acabPiso) return "piso:" + u.acabPiso;
    if (u.p4Pintura) return "pint:" + u.p4Pintura + ":" + (u.face || "") + ":" + (u.regiao || "");
    return null;
  }

  /* categoria do elemento, ou null se NÃO vai para o Twinmotion */
  /* PILAR/VIGA: vai para o Twinmotion, a não ser que esteja EMBUTIDO numa parede (caixa dentro da caixa de uma parede, 2 cm de folga).
     Até 28/10/2026 todo pilar/viga "e<n>" saía — os pilares do portão viravam caixa oca (só as faces de pintura) e o pergolado sumia. */
  /* MÓVEL SOLTO e PLANTA não vão (pedido do Rogério, 28/10/2026): no Twinmotion ele usa os da biblioteca dele. Vão os fixos —
     armários, bancadas, cozinha, banho, louças, guarda-roupa, closet, rack/painel. A família vem do sólido ("<família>:<n>"). */
  var SOLTO = /(^|-)mob-(sofa|mesa|cadeira|poltrona|cama|criado|tapete|aparador|escrivaninha|banqueta|pufe|puff)|(^|-)lazer-(mesa|espreguic|guarda-sol|cadeira)|(^|-)pais-/;
  function famDe(u) { return u && u.famSolido ? String(u.famSolido).split(":")[0] : ""; }
  function categoria(id, u, embutida) {
    if (FORA[u.tipo]) return null;
    if (SOLTO.test(famDe(u))) return null;
    if (ESTRUT[u.tipo] && embutida) return null;
    if (u.linhaDivisa) return null;
    if (u.tipo === "IFCLIGHTFIXTURE") return "luz";
    if (u.tipo === "IFCDOOR" || u.tipo === "IFCWINDOW") return "abertura";
    if (u.acabPiso) return "piso";
    if (u.p4Pintura) return "pintura";
    return "fixo";
  }

  /* nome estável do material: com dono -> `<id>__<hex>`; sem dono -> `<nome>_<hex>` (+ _tNN transparência, _vidro) */
  function nomeMaterial(m, dono) {
    var hex = m.color ? m.color.getHexString() : "000000";
    return (dono ? dono.replace(/[^A-Za-z0-9_-]+/g, "_") + "__" : (m.name ? m.name.replace(/[^A-Za-z0-9_]+/g, "_") + "_" : "")) + hex +
      (m.opacity < 0.99 ? "_t" + Math.round(m.opacity * 100) : "") + (m.transmission > 0 ? "_vidro" : "");
  }

  /* monta uma cena NOVA só com o que vai para o Twinmotion; a cena de origem não é tocada */
  function montarCena(THREE, origem) {
    origem.updateMatrixWorld(true);
    var cena = new THREE.Scene(), grupos = {}, cache = new Map(), nM = 0, nGrupos = 0;
    function matDe(m0, dono) {
      var k = m0.uuid + (dono ? "|" + dono : "");
      if (cache.has(k)) return cache.get(k);
      var m = m0.clone(); m.name = nomeMaterial(m, dono); cache.set(k, m); return m;
    }
    /* caixas das paredes visíveis (para saber se um pilar/viga está embutido) */
    var paredes = [], caixaDe = function (o) { o.geometry.computeBoundingBox(); return o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); };
    origem.traverse(function (o) { if (o.isMesh && o.geometry && vivo(o) && o.userData && o.userData.tipo === "IFCWALL" && !o.isInstancedMesh) paredes.push(caixaDe(o).expandByScalar(0.02)); });
    function embutida(o) {
      if (o.isInstancedMesh) return false;
      var b = caixaDe(o);
      for (var i = 0; i < paredes.length; i++) if (paredes[i].containsBox(b)) return true;
      return false;
    }
    origem.traverse(function (o) {
      if (!o.isMesh || !o.geometry || !vivo(o)) return;
      var u = o.userData || {}, id = idDe(u); if (!id) return;
      var c = categoria(id, u, ESTRUT[u.tipo] ? embutida(o) : false); if (!c) return;
      var g = grupos[id];
      if (!g) {
        g = new THREE.Group(); g.name = id;
        g.userData = { ra_id: id, ra_cat: c, ra_tipo: u.tipo || "" };
        cena.add(g); grupos[id] = g; nGrupos++;
      }
      var lista = [];
      if (o.isInstancedMesh) {
        var mi = new THREE.Matrix4();
        for (var i = 0; i < o.count; i++) { o.getMatrixAt(i, mi); lista.push(new THREE.Matrix4().multiplyMatrices(o.matrixWorld, mi)); }
      } else lista.push(o.matrixWorld.clone());
      var mat0 = u._p10orig || o.material; if (!mat0) return;
      /* TV do rack não vai (o Rogério usa a TV da biblioteca do Twinmotion, 28/10/2026): no gerador ra-mob-rack-tv a TV é a única peça
         em preto de tela/moldura (0b0c0e); painel ripado e rack continuam */
      if (/(^|-)mob-rack-tv/.test(famDe(u)) && [].concat(mat0).some(function (m) { return m && m.color && m.color.getHexString() === "0b0c0e"; })) return;
      var dono = (c === "piso" || c === "pintura" || PROPRIO[u.tipo]) ? id : null;
      var mats = Array.isArray(mat0) ? mat0.map(function (m, i) { return matDe(m, dono ? dono + (i ? "_" + i : "") : null); }) : matDe(mat0, dono);
      lista.forEach(function (M) {
        var c2 = new THREE.Mesh(o.geometry, mats);
        M.decompose(c2.position, c2.quaternion, c2.scale);
        c2.name = id + "|" + (u.parte || "") + "|" + (u.famSolido ? String(u.famSolido) : "") + "|" + (nM++);
        c2.userData = { ra_id: id, ra_parte: u.parte || "", ra_solido: u.famSolido ? String(u.famSolido) : "", ra_parteDe: u.parteDe || "" };
        g.add(c2);
      });
    });
    return { cena: cena, grupos: nGrupos, malhas: nM, materiais: cache.size };
  }

  /* GLB binário (ArrayBuffer) da cena de origem; `GLTFExporter` é a classe do three r150 do app */
  function exportarGLB(THREE, GLTFExporter, origem) {
    var r = montarCena(THREE, origem);
    return new Promise(function (ok, erro) {
      new GLTFExporter().parse(r.cena, function (b) { ok({ buffer: b, grupos: r.grupos, malhas: r.malhas, materiais: r.materiais }); }, erro,
        { binary: true, onlyVisible: true, maxTextureSize: 2048 });
    });
  }

  /* ---------------- câmera ---------------- */
  /* câmera em coordenadas three.js do app (m, Y para cima). `alvo` = posição + direção do olhar (vale no orbital e no passeio) */
  function cameraPayload(THREE, camera, alvoOrbita, canvas) {
    if (!camera || !camera.isPerspectiveCamera) return null;
    camera.updateMatrixWorld(true);
    var pos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    var dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    var dist = alvoOrbita ? pos.distanceTo(alvoOrbita) : 10;
    if (!(dist > 0.5)) dist = 10;
    var alvo = pos.clone().add(dir.multiplyScalar(dist));
    var up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    var asp = canvas && canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : (camera.aspect || 16 / 9);
    var r = function (v) { return Math.round(v * 10000) / 10000; };
    return { pos: [r(pos.x), r(pos.y), r(pos.z)], alvo: [r(alvo.x), r(alvo.y), r(alvo.z)], up: [r(up.x), r(up.y), r(up.z)], fov: r(camera.fov), aspecto: r(asp) };
  }
  function cameraMudou(a, b) {
    if (!a || !b) return true;
    var ch = ["pos", "alvo", "up"];
    for (var i = 0; i < ch.length; i++) for (var k = 0; k < 3; k++) if (Math.abs(a[ch[i]][k] - b[ch[i]][k]) > EPS_CAM) return true;
    return Math.abs(a.fov - b.fov) > EPS_CAM || Math.abs(a.aspecto - b.aspecto) > EPS_CAM;
  }

  /* ---------------- botão da barra da vista (js/bimshell.js › _vistabar) ---------------- */
  var CSS = ".rv-tw{display:inline-flex;align-items:center;gap:6px;margin-left:6px;padding-left:6px;border-left:1px solid rgba(128,128,128,.35)}" +
    ".rv-tw button{display:inline-flex;align-items:center;gap:4px;border:0;border-radius:5px;padding:3px 6px;background:transparent;color:inherit;font:600 11px var(--fonte,system-ui),sans-serif;cursor:pointer}" +
    ".rv-tw button:hover{background:rgba(128,128,128,.22)}.rv-tw button[aria-pressed=true]{background:var(--aco,#2d6a9c);color:#fff}.rv-tw button:focus-visible{outline:2px solid var(--aco,#2d6a9c);outline-offset:1px}" +
    ".rv-tw [data-tw=status]{font:500 11px var(--fonte,system-ui),sans-serif;opacity:.85;white-space:nowrap}.rv-tw [data-tw=status][data-ok=sim]{color:#2e9e5b;opacity:1}";
  var botoes = [], inst = null;

  function injetarCss() {
    if (typeof document === "undefined" || document.getElementById("rv-tw-css")) return;
    var st = document.createElement("style"); st.id = "rv-tw-css"; st.textContent = CSS; document.head.appendChild(st);
  }

  function botaoBarra(el, ico) {
    if (!ehLocal()) return null;
    injetarCss();
    var box = el("span", "rv-tw"); box.setAttribute("data-rv-tw", "1");
    var b = el("button", null, ""); b.type = "button"; b.setAttribute("data-tw", "botao");
    b.innerHTML = ico("ciclo", 14) + "<span>Twinmotion</span>";
    b.title = "Sincronizar com Twinmotion: a câmera do Twinmotion acompanha o 3D e o modelo atualiza lá a cada edição, sem salvar. Precisa do programa OrçaPRO Direct Link aberto.";
    b.setAttribute("aria-label", "Sincronizar com Twinmotion"); b.setAttribute("aria-pressed", "false");
    b.onclick = function () { if (inst) inst.alternar(); else avisar("O 3D ainda não está pronto para sincronizar. Abra um projeto e tente de novo."); };
    var s = el("span", null, ""); s.setAttribute("data-tw", "status"); s.hidden = true;
    box.appendChild(b); box.appendChild(s);
    botoes.push(box);
    pintar();
    return box;
  }

  function avisar(msg) {
    try { if (global.UI && global.UI.toast) { global.UI.toast(msg, "erro"); return; } } catch (_) {}
    try { if (inst && inst.S._hint) { inst.S._hint(msg); return; } } catch (_) {}
  }

  /* estado visual: botão ligado/desligado + "Twinmotion: conectado/sem conexão" */
  function pintar() {
    var on = !!(inst && inst.ligado()), ok = !!(inst && inst.conectado()), dica = inst ? inst.dicaStatus() : "";
    botoes = botoes.filter(function (b) { if (b.isConnected) b._visto = true; return b.isConnected || !b._visto; });
    botoes.forEach(function (box) {
      var b = box.querySelector('[data-tw="botao"]'), s = box.querySelector('[data-tw="status"]');
      if (b) b.setAttribute("aria-pressed", on ? "true" : "false");
      if (s) {
        s.hidden = !on; s.setAttribute("data-ok", ok ? "sim" : "nao");
        s.textContent = ok ? "Twinmotion: conectado" : "Twinmotion: sem conexão"; s.title = dica;
      }
    });
  }

  /* ---------------- instalação por viewer ---------------- */
  function instalar(S, THREE, env) {
    env = env || {};
    var win = env.win || (typeof window !== "undefined" ? window : null);
    if (!win || !S || !THREE) return null;
    if (win.__bimTwDispor) { try { win.__bimTwDispor(); } catch (e0) {} }

    var ligado = false, ligando = false, conectado = false, dica = "", ultCam = null, tCam = 0, tGlb = null, tEstado = null, enviando = false, pendente = false, vez = 0;
    var gltfCls = null;
    var diag = { glb: 0, cam: 0, falhas: 0 };

    function get(url, ms) {
      var ctl = typeof AbortController === "function" ? new AbortController() : null, tm = ctl ? setTimeout(function () { ctl.abort(); }, ms) : null;
      return fetch(url, { signal: ctl ? ctl.signal : undefined }).then(function (r) { if (tm) clearTimeout(tm); return r; }, function (e) { if (tm) clearTimeout(tm); throw e; });
    }
    function lerEstado() {
      return get(baseUrl() + "/estado", 1500).then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("estado " + r.status)); });
    }
    function aplicarEstado(e) {
      /* "conectado" = o Direct Link respondeu (a fonte está publicada). O Datasmith não informa ao programa quando o Twinmotion recebe
         (destinos_ativos fica 0 mesmo funcionando — visto em 28/10/2026), então ele não pode decidir o indicador. */
      conectado = !!e;
      dica = conectado ? "Fonte \"" + ((e && e.fonte) || "OrçaPRO") + "\" publicada. No Twinmotion: Importar › Direct Link e, para a câmera, escolha \"OrçaPRO — Vista 3D\"." : "";
      pintar();
    }
    function semConexao() { conectado = false; dica = "Sem resposta do OrçaPRO Direct Link. Abra o atalho na área de trabalho."; pintar(); }

    function carregarExportador() {
      if (gltfCls) return Promise.resolve(gltfCls);
      var imp = env.importar || function () { return import("three/examples/jsm/exporters/GLTFExporter.js"); };
      return imp().then(function (m) { gltfCls = m.GLTFExporter; return gltfCls; });
    }

    /* manda o GLB inteiro; uma de cada vez (se editar no meio, repete uma vez ao terminar) */
    function enviarGlb() {
      if (!ligado) return Promise.resolve(false);
      if (enviando) { pendente = true; return Promise.resolve(false); }
      enviando = true; pendente = false; var minha = vez;
      return carregarExportador().then(function (GE) { return exportarGLB(THREE, GE, S.scene); }).then(function (r) {
        if (!ligado || minha !== vez) return false;
        return fetch(baseUrl() + "/glb", { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: r.buffer }).then(function (resp) {
          if (!resp.ok) throw new Error("glb " + resp.status);
          diag.glb++;
          return lerEstado().then(aplicarEstado, semConexao).then(function () { return true; });
        });
      }).catch(function (e) { diag.falhas++; semConexao(); return false; }).then(function (x) {
        enviando = false;
        if (pendente && ligado) enviarGlb();
        return x;
      });
    }

    /* roda em todo quadro (S._tickExtra), mas só trabalha ligado e no máximo 1 vez a cada 150 ms */
    function tick() {
      if (!ligado) return;
      var agora = (typeof performance !== "undefined" ? performance.now() : Date.now());
      if (agora - tCam < INTERVALO_CAM) return;
      var p = cameraPayload(THREE, S.camera, S.orbit ? S.orbit.target : null, S.renderer && S.renderer.domElement);
      if (!p || !cameraMudou(p, ultCam)) return;
      tCam = agora; ultCam = p;
      diag.cam++;
      try { fetch(baseUrl() + "/camera", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) }).catch(function () {}); } catch (_) {}
    }
    S._tickExtra.push(tick);

    /* o modelo foi reconstruído (edição, desfazer, refazer): agenda o GLB */
    function aoReconstruir() {
      if (!ligado) return;
      if (tGlb) clearTimeout(tGlb);
      tGlb = setTimeout(function () { tGlb = null; enviarGlb(); }, DEBOUNCE_GLB);
    }

    function desligar() {
      ligado = false; vez++; pendente = false;
      if (tGlb) { clearTimeout(tGlb); tGlb = null; }
      if (tEstado) { clearInterval(tEstado); tEstado = null; }
      ultCam = null; conectado = false; pintar();
    }

    function ligar() {
      if (ligando) return Promise.resolve(false);   /* duplo clique enquanto espera o Direct Link */
      ligando = true;
      return lerEstado().then(function (e) {
        if (!S.scene) throw new Error("sem cena");
        ligado = true; vez++; ultCam = null; tCam = 0; aplicarEstado(e);
        tEstado = setInterval(function () { if (ligado) lerEstado().then(aplicarEstado, semConexao); }, 5000);
        return enviarGlb().then(function () { tick(); return true; });
      }, function () {
        avisar("Abra o OrçaPRO Direct Link (atalho na área de trabalho) e tente de novo.");
        return false;
      }).then(function (r) { ligando = false; return r; }, function (e) { ligando = false; avisar("Não consegui sincronizar com o Twinmotion: " + ((e && e.message) || e)); return false; });
    }

    function alternar() { if (ligado) { desligar(); return Promise.resolve(false); } return ligar(); }

    function dispor() { desligar(); if (win.__bimTwDispor === dispor) win.__bimTwDispor = null; if (inst && inst.dispor === dispor) { inst = null; pintar(); } }
    win.__bimTwDispor = dispor;

    inst = {
      S: S, alternar: alternar, ligar: ligar, desligar: desligar, dispor: dispor, aoReconstruir: aoReconstruir, enviarGlb: enviarGlb,
      ligado: function () { return ligado; }, conectado: function () { return conectado; }, dicaStatus: function () { return dica; }, diag: diag
    };
    return inst;
  }

  var BimTwinmotion = {
    URL_PADRAO: URL_PADRAO, DEBOUNCE_GLB: DEBOUNCE_GLB, INTERVALO_CAM: INTERVALO_CAM,
    ehLocal: ehLocal, baseUrl: baseUrl, idDe: idDe, categoria: categoria, nomeMaterial: nomeMaterial,
    montarCena: montarCena, exportarGLB: exportarGLB, cameraPayload: cameraPayload, cameraMudou: cameraMudou,
    instalar: instalar, botaoBarra: botaoBarra,
    aoReconstruir: function () { if (inst) inst.aoReconstruir(); },
    atual: function () { return inst; }
  };
  global.BimTwinmotion = BimTwinmotion;
  if (typeof module !== "undefined" && module.exports) module.exports = BimTwinmotion;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
