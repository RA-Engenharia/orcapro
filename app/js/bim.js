/* =====================================================================
 * bim.js — Visualizador BIM in-app (módulo ES). window.BIM.
 * Adapta a lógica provada do bim/bim.html (viewer autônomo da NF8n, 33d47fb):
 * web-ifc StreamAllMeshes → BufferGeometry Three (glue própria), voo+órbita,
 * pick por duplo-clique. Aqui vira um módulo montável na aba BIM da Gestão,
 * com camada 4D (recolore/oculta por estado — dirigido por BIM4D via gestao.js).
 *
 * Contrato consumido por gestao.js (aba BIM):
 *   BIM.montar(host, { onLoaded(elementos:[{id,tipo,nome}]), onPick(info) })
 *   BIM.abrirArquivo(File)  ·  BIM.carregarExemplo()
 *   BIM.aplicarEstado({construidos,emAndamento,futuros})  ·  BIM.mostrarTudo()
 * ===================================================================== */
import * as THREE from 'three';
import { OrbitControls } from '../bim/vendor/OrbitControls.js';
import { IfcAPI } from 'web-ifc';

var S = null; // estado do viewer montado

function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

var TIPOS = {
  IFCWALL: 'Parede', IFCWALLSTANDARDCASE: 'Parede', IFCSLAB: 'Laje', IFCBEAM: 'Viga', IFCCOLUMN: 'Pilar',
  IFCDOOR: 'Porta', IFCWINDOW: 'Janela', IFCROOF: 'Cobertura', IFCSTAIR: 'Escada', IFCSTAIRFLIGHT: 'Lance de escada',
  IFCRAILING: 'Guarda-corpo', IFCFURNISHINGELEMENT: 'Mobiliário', IFCPLATE: 'Chapa', IFCMEMBER: 'Perfil/Montante',
  IFCFLOWTERMINAL: 'Louça/terminal', IFCFLOWSEGMENT: 'Tubo/duto', IFCFLOWFITTING: 'Conexão', IFCBUILDINGELEMENTPROXY: 'Elemento genérico',
  IFCCOVERING: 'Revestimento', IFCSPACE: 'Ambiente', IFCFOOTING: 'Fundação', IFCPILE: 'Estaca', IFCCURTAINWALL: 'Fachada cortina'
};

function montar(host, opts) {
  opts = opts || {};
  // RE-HOME: se já existe um viewer vivo, NÃO cria outro (senão vaza WebGLRenderer + loop RAF +
  // listeners a cada App.render() → "Too many active WebGL contexts"). Reaproveita a MESMA
  // instância, só re-parenta o DOM no novo host e preserva o modelo/estado 4D já carregado.
  if (S && S.alive) {
    S.opts = opts;
    host.innerHTML = '';
    host.style.position = 'relative';
    host.style.background = 'radial-gradient(120% 120% at 50% 0%, #16324f 0%, #0b1a2b 70%)';
    [S.bar, S.hud, S.over, S.loading, S.renderer.domElement].forEach(function (el) { if (el) host.appendChild(el); });
    S.host = host;
    setTimeout(function () { if (S && S._resize) S._resize(); }, 0);
    return;
  }
  host.innerHTML = '';
  host.style.position = 'relative';
  host.style.background = 'radial-gradient(120% 120% at 50% 0%, #16324f 0%, #0b1a2b 70%)';

  // toolbar compacta
  var bar = document.createElement('div');
  bar.style.cssText = 'position:absolute;left:0;right:0;top:0;z-index:3;display:flex;gap:6px;align-items:center;padding:8px 10px;background:linear-gradient(180deg,rgba(15,39,64,.9),rgba(15,39,64,0))';
  bar.innerHTML =
    '<button class="btn sm primary" data-b="abrir">📂 Abrir IFC</button>' +
    '<button class="btn sm" data-b="exemplo">Carregar exemplo</button>' +
    '<span style="flex:1"></span>' +
    '<button class="btn sm on" data-b="orbita" style="background:#16a34a;color:#fff">🖱️ Órbita</button>' +
    '<button class="btn sm" data-b="voo">✈️ Voo</button>' +
    '<button class="btn sm" data-b="fit">⤢ Enquadrar</button>' +
    '<input type="file" data-b="file" accept=".ifc" style="display:none">';
  host.appendChild(bar);

  var hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;right:10px;bottom:10px;z-index:3;background:rgba(15,39,64,.85);border:1px solid #24435f;border-radius:8px;padding:6px 10px;font-size:12px;color:#bcd0e4';
  hud.innerHTML = 'Elementos: <b data-h="el">0</b> · Triângulos: <b data-h="tri">0</b>';
  host.appendChild(hud);

  var over = document.createElement('div');
  over.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:2;pointer-events:none';
  over.innerHTML = '<div style="pointer-events:auto;text-align:center;background:rgba(15,39,64,.82);border:2px dashed #2e6f9e;border-radius:16px;padding:28px 34px;max-width:420px;color:#dbe8f5"><div style="font-size:34px">🏗️</div><h3 style="margin:8px 0 6px">Arraste um <b>.IFC</b> aqui</h3><p style="color:#a9c1d8;font-size:13px;margin:4px 0">Exporte do Revit/pyRevit e solte — abre em 3D, offline. Ou clique em <b>Carregar exemplo</b>.</p></div>';
  host.appendChild(over);

  var loading = document.createElement('div');
  loading.style.cssText = 'position:absolute;inset:0;background:rgba(11,26,43,.86);display:none;align-items:center;justify-content:center;flex-direction:column;gap:12px;z-index:5;color:#dbe8f5';
  loading.innerHTML = '<div style="width:40px;height:40px;border:4px solid #24435f;border-top-color:#16a34a;border-radius:50%;animation:bimsp 1s linear infinite"></div><div data-l="txt">Lendo o IFC…</div>';
  host.appendChild(loading);
  if (!document.getElementById('bim-spin-style')) { var st = document.createElement('style'); st.id = 'bim-spin-style'; st.textContent = '@keyframes bimsp{to{transform:rotate(360deg)}}'; document.head.appendChild(st); }

  // ---- Three ----
  var scene = new THREE.Scene(); scene.background = null;
  var camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000); camera.position.set(20, 18, 22);
  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;outline:none';
  host.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.05));
  var dir = new THREE.DirectionalLight(0xffffff, 1.1); dir.position.set(30, 50, 20); scene.add(dir);
  var grid = new THREE.GridHelper(200, 40, 0x2e6f9e, 0x1c3a58); grid.material.opacity = .5; grid.material.transparent = true; scene.add(grid);
  var orbit = new OrbitControls(camera, renderer.domElement); orbit.enableDamping = true; orbit.dampingFactor = .08;
  var modelRoot = new THREE.Group(); modelRoot.rotation.x = -Math.PI / 2; scene.add(modelRoot);

  var matAndamento = new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0x7a4a06, transparent: true, opacity: .9, metalness: .05, roughness: .8, side: THREE.DoubleSide });
  var selMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, emissive: 0x0a5a2a, metalness: .1, roughness: .7 });

  S = { host: host, opts: opts, scene: scene, camera: camera, renderer: renderer, orbit: orbit, modelRoot: modelRoot,
        bar: bar, hud: hud, over: over, loading: loading,
        api: new IfcAPI(), apiReady: false, modelID: -1, meshPorId: {}, elementos: [],
        fly: { on: false, keys: {}, speed: 14, yaw: 0, pitch: 0 }, selected: null, prevMat: null,
        matAndamento: matAndamento, selMat: selMat, raf: 0, alive: true };

  function resize() { var w = host.clientWidth, h = host.clientHeight; if (w && h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); } }
  S._resize = resize; window.addEventListener('resize', resize); resize();

  // ---- voo ----
  var canvasEl = renderer.domElement, fly = S.fly, _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  function setMode(voo) {
    fly.on = voo; orbit.enabled = !voo;
    bar.querySelector('[data-b="voo"]').classList.toggle('on', voo);
    bar.querySelector('[data-b="voo"]').style.background = voo ? '#16a34a' : '';
    bar.querySelector('[data-b="voo"]').style.color = voo ? '#fff' : '';
    bar.querySelector('[data-b="orbita"]').style.background = voo ? '' : '#16a34a';
    bar.querySelector('[data-b="orbita"]').style.color = voo ? '' : '#fff';
    if (!voo && document.pointerLockElement) document.exitPointerLock();
  }
  S._setMode = setMode;
  canvasEl.addEventListener('click', function () { if (fly.on && !document.pointerLockElement) canvasEl.requestPointerLock(); });
  S._onKeyDown = function (e) { fly.keys[e.code] = true; if (e.code === 'Escape' && fly.on) setMode(false); };
  S._onKeyUp = function (e) { fly.keys[e.code] = false; };
  S._onMouseMove = function (e) { if (!fly.on || !document.pointerLockElement) return; fly.yaw -= e.movementX * 0.0022; fly.pitch -= e.movementY * 0.0022; fly.pitch = Math.max(-1.5, Math.min(1.5, fly.pitch)); };
  window.addEventListener('keydown', S._onKeyDown); window.addEventListener('keyup', S._onKeyUp); document.addEventListener('mousemove', S._onMouseMove);
  function flyStep(dt) {
    var e = new THREE.Euler(fly.pitch, fly.yaw, 0, 'YXZ'); camera.quaternion.setFromEuler(e);
    camera.getWorldDirection(_fwd); _right.crossVectors(_fwd, _up).normalize();
    var s = fly.speed * (fly.keys['ShiftLeft'] || fly.keys['ShiftRight'] ? 3 : 1) * dt;
    if (fly.keys['KeyW']) camera.position.addScaledVector(_fwd, s);
    if (fly.keys['KeyS']) camera.position.addScaledVector(_fwd, -s);
    if (fly.keys['KeyD']) camera.position.addScaledVector(_right, s);
    if (fly.keys['KeyA']) camera.position.addScaledVector(_right, -s);
    if (fly.keys['KeyE']) camera.position.addScaledVector(_up, s);
    if (fly.keys['KeyQ']) camera.position.addScaledVector(_up, -s);
  }

  var clock = new THREE.Clock();
  function tick() { if (!S || !S.alive) return; var dt = Math.min(clock.getDelta(), 0.1); if (fly.on) flyStep(dt); else orbit.update(); renderer.render(scene, camera); S.raf = requestAnimationFrame(tick); }
  tick();

  // ---- pick ----
  var ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  canvasEl.addEventListener('dblclick', function (e) {
    if (fly.on) return;
    var r = canvasEl.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1; mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(mouse, camera);
    var hit = ray.intersectObjects(modelRoot.children, true)[0];
    if (S.selected) { S.selected.material = S.prevMat; S.selected = null; }
    if (hit && hit.object.userData && hit.object.userData.expressID != null) {
      S.selected = hit.object; S.prevMat = S.selected.material; S.selected.material = selMat;
      if (opts.onPick) opts.onPick(propsDe(hit.object.userData.expressID, hit.object.userData.tipo));
    } else if (opts.onPick) opts.onPick(null);
  });

  // ---- toolbar ----
  bar.addEventListener('click', function (e) {
    var b = e.target.closest('[data-b]'); if (!b) return; var k = b.getAttribute('data-b');
    if (k === 'abrir') bar.querySelector('[data-b="file"]').click();
    else if (k === 'exemplo') carregarExemplo();
    else if (k === 'orbita') setMode(false);
    else if (k === 'voo') setMode(true);
    else if (k === 'fit') enquadrar();
  });
  bar.querySelector('[data-b="file"]').addEventListener('change', function (e) { var f = e.target.files && e.target.files[0]; if (f) abrirArquivo(f); });
  host.addEventListener('dragover', function (e) { e.preventDefault(); });
  host.addEventListener('drop', function (e) { e.preventDefault(); var f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f && /\.ifc$/i.test(f.name)) abrirArquivo(f); });

  function propsDe(expressID, tipoCache) {
    try {
      var line = S.api.GetLine(S.modelID, expressID, true);
      var nome = (line.Name && line.Name.value) || '—';
      var tipo = tipoCache || nomeTipo(S.api.GetLineType(S.modelID, expressID));
      var gid = (line.GlobalId && line.GlobalId.value) || '—';
      return { id: expressID, nome: nome, tipo: tipo, globalId: gid, tag: (line.Tag && line.Tag.value) || '' };
    } catch (e) { return { id: expressID, nome: '—', tipo: tipoCache || '', globalId: '' }; }
  }
  function nomeTipo(num) { var raw = ''; try { if (S.api.GetNameFromTypeCode) raw = S.api.GetNameFromTypeCode(num); } catch (_) {} return raw || ('IFC#' + num); }

  function enquadrar() {
    var box = new THREE.Box3().setFromObject(modelRoot); if (box.isEmpty()) return;
    var size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    var maxDim = Math.max(size.x, size.y, size.z) || 10, dist = maxDim * 1.6;
    camera.position.set(center.x + dist * .7, center.y + dist * .6, center.z + dist * .7);
    camera.near = maxDim / 1000; camera.far = maxDim * 100; camera.updateProjectionMatrix();
    orbit.target.copy(center); orbit.update();
    fly.yaw = Math.atan2(camera.position.x - center.x, camera.position.z - center.z); fly.pitch = -0.35;
    grid.position.y = box.min.y;
  }
  S._enquadrar = enquadrar;

  async function initApi() { if (S.apiReady) return; S.api.SetWasmPath('bim/vendor/'); await S.api.Init(); S.apiReady = true; }

  async function carregarIFC(arrayBuffer, nome) {
    over.style.display = 'none'; loading.style.display = 'flex'; loading.querySelector('[data-l="txt"]').textContent = 'Iniciando o motor BIM…';
    try {
      await initApi();
      while (modelRoot.children.length) { var c = modelRoot.children.pop(); if (c.geometry) c.geometry.dispose(); }
      S.meshPorId = {}; S.elementos = [];
      if (S.modelID !== -1) { try { S.api.CloseModel(S.modelID); } catch (_) {} }
      loading.querySelector('[data-l="txt"]').textContent = 'Lendo geometria do IFC…';
      var data = new Uint8Array(arrayBuffer);
      S.modelID = S.api.OpenModel(data);
      var nEl = 0, nTri = 0, tmpMat = new THREE.Matrix4(), matCache = {};
      function getMat(r, g, b, a) { var k = (r * 255 | 0) + '_' + (g * 255 | 0) + '_' + (b * 255 | 0) + '_' + a.toFixed(2); if (!matCache[k]) matCache[k] = new THREE.MeshStandardMaterial({ color: new THREE.Color(r, g, b), transparent: a < 1, opacity: a, metalness: .05, roughness: .85, side: THREE.DoubleSide }); return matCache[k]; }
      S.api.StreamAllMeshes(S.modelID, function (mesh) {
        var geos = mesh.geometries, n = geos.size(), tipoNum = 0;
        try { tipoNum = S.api.GetLineType(S.modelID, mesh.expressID); } catch (_) {}
        var tipoNome = nomeTipo(tipoNum);
        for (var i = 0; i < n; i++) {
          var pg = geos.get(i), geo = S.api.GetGeometry(S.modelID, pg.geometryExpressID);
          var verts = S.api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize());
          var idx = S.api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize());
          var nv = verts.length / 6, pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3);
          for (var v = 0; v < nv; v++) { pos[v * 3] = verts[v * 6]; pos[v * 3 + 1] = verts[v * 6 + 1]; pos[v * 3 + 2] = verts[v * 6 + 2]; nor[v * 3] = verts[v * 6 + 3]; nor[v * 3 + 1] = verts[v * 6 + 4]; nor[v * 3 + 2] = verts[v * 6 + 5]; }
          var bg = new THREE.BufferGeometry();
          bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          bg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
          bg.setIndex(new THREE.BufferAttribute(idx, 1));
          var c = pg.color, m = new THREE.Mesh(bg, getMat(c.x, c.y, c.z, c.w));
          tmpMat.fromArray(pg.flatTransformation); m.applyMatrix4(tmpMat);
          m.userData.expressID = mesh.expressID; m.userData.tipo = tipoNome; m.userData.matOrig = m.material;
          modelRoot.add(m); S.meshPorId[mesh.expressID] = m;
          nTri += idx.length / 3; geo.delete();
        }
        S.elementos.push({ id: mesh.expressID, tipo: tipoNome, nome: rotuloDisciplina(tipoNome) });
        nEl++;
      });
      hud.querySelector('[data-h="el"]').textContent = nEl.toLocaleString('pt-BR');
      hud.querySelector('[data-h="tri"]').textContent = Math.round(nTri).toLocaleString('pt-BR');
      enquadrar(); loading.style.display = 'none';
      if (opts.onLoaded) opts.onLoaded(S.elementos.slice());
    } catch (err) {
      loading.style.display = 'none'; over.style.display = 'flex';
      over.querySelector('div').innerHTML = '<div style="font-size:30px">⚠️</div><h3 style="margin:8px 0">Não consegui ler este IFC</h3><p style="color:#a9c1d8;font-size:13px">' + esc(String(err && err.message || err)) + '</p><p style="color:#a9c1d8;font-size:12px">Confira se é um .ifc válido (IFC2x3 ou IFC4).</p>';
    }
  }
  function rotuloDisciplina(ifcName) { var u = String(ifcName).toUpperCase(); return TIPOS[u] || String(ifcName).replace(/^IFC/, ''); }

  function abrirArquivo(file) { var fr = new FileReader(); fr.onload = function () { carregarIFC(fr.result, file.name); }; fr.readAsArrayBuffer(file); }
  function carregarExemplo() { fetch('bim/samples/exemplo.ifc').then(function (r) { return r.arrayBuffer(); }).then(function (ab) { carregarIFC(ab, 'exemplo.ifc'); }).catch(function () { over.querySelector('div').innerHTML = '<div style="font-size:30px">🗂️</div><p style="color:#a9c1d8">Abra um arquivo .ifc seu — o exemplo não foi encontrado.</p>'; }); }
  S._abrirArquivo = abrirArquivo; S._carregarExemplo = carregarExemplo;
}

// aplica o estado 4D: esconde futuros; construídos = material original; em andamento = âmbar
function aplicarEstado(est) {
  if (!S) return;
  var fut = {}, and = {};
  (est && est.futuros || []).forEach(function (id) { fut[id] = 1; });
  (est && est.emAndamento || []).forEach(function (id) { and[id] = 1; });
  Object.keys(S.meshPorId).forEach(function (id) {
    var m = S.meshPorId[id]; if (!m) return;
    if (fut[id]) { m.visible = false; return; }
    m.visible = true;
    if (m === S.selected) return; // não mexe no selecionado
    m.material = and[id] ? S.matAndamento : (m.userData.matOrig || m.material);
  });
}
function mostrarTudo() { if (!S) return; Object.keys(S.meshPorId).forEach(function (id) { var m = S.meshPorId[id]; if (m) { m.visible = true; if (m !== S.selected) m.material = m.userData.matOrig || m.material; } }); }

window.BIM = {
  montar: montar,
  abrirArquivo: function (f) { if (S && S._abrirArquivo) S._abrirArquivo(f); },
  carregarExemplo: function () { if (S && S._carregarExemplo) S._carregarExemplo(); },
  aplicarEstado: aplicarEstado,
  mostrarTudo: mostrarTudo,
  get elementos() { return S ? S.elementos.slice() : []; }
};
