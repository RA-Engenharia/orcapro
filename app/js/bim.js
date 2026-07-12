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

// Códigos de tipo IFC p/ ler os carimbos do exportador pyRevit (OrcaPRO_Etapa/OrcaPRO_CodOrc)
// via relacionamento de property set. web-ifc 0.0.44 NÃO exporta essas constantes → hardcode
// dos códigos de tipo (estáveis no schema). Traversal: IfcRelDefinesByProperties → IfcPropertySet
// (HasProperties) → IfcPropertySingleValue(Name='OrcaPRO_Etapa').
var IFC_RELDEFINESBYPROPERTIES = 4186316022, IFC_PROPERTYSINGLEVALUE = 3650150729;
// IfcSIUnit — p/ normalizar BaseQuantities (que vêm na unidade do arquivo, ex.: mm) em metros.
var IFC_SIUNIT = 448429030;

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
    '<button class="btn sm primary" data-b="abrir">📂 + IFC</button>' +
    '<button class="btn sm" data-b="exemplo">Exemplo</button>' +
    '<button class="btn sm" data-b="limpar" title="Remove todos os modelos carregados">🗑</button>' +
    '<span style="flex:1"></span>' +
    '<button class="btn sm" data-b="ultra" title="Qualidade ultra: nitidez máxima (usa mais GPU)">✨ Ultra</button>' +
    '<button class="btn sm on" data-b="orbita" style="background:#16a34a;color:#fff">🖱️ Órbita</button>' +
    '<button class="btn sm" data-b="voo">✈️ Voo</button>' +
    '<button class="btn sm" data-b="fit">⤢ Enquadrar</button>' +
    '<input type="file" data-b="file" accept=".ifc" multiple style="display:none">';
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
  // qualidade de cor "de render": sRGB + tone mapping cinematográfico por padrão
  try { renderer.outputColorSpace = THREE.SRGBColorSpace; } catch (_) {}
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;outline:none';
  host.appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', function (e) { e.preventDefault(); if (S) { S.alive = false; if (S.raf) cancelAnimationFrame(S.raf); } try { over.style.display = 'flex'; over.querySelector('div').innerHTML = '<div style="font-size:30px">🧊</div><h3 style="margin:8px 0">O 3D ficou pesado demais</h3><p style="color:#a9c1d8;font-size:13px">A memória de vídeo esgotou (modelos grandes / Ultra). Recarregue a aba BIM com menos modelos, ou desligue o ✨ Ultra.</p>'; } catch (_) {} }, false);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.05));
  var dir = new THREE.DirectionalLight(0xffffff, 1.1); dir.position.set(30, 50, 20); scene.add(dir);
  var fill = new THREE.DirectionalLight(0xbfd8ee, 0.35); fill.position.set(-40, 25, -30); scene.add(fill); // luz de preenchimento (sombra menos chapada)
  var grid = new THREE.GridHelper(200, 40, 0x2e6f9e, 0x1c3a58); grid.material.opacity = .5; grid.material.transparent = true; scene.add(grid);
  var orbit = new OrbitControls(camera, renderer.domElement); orbit.enableDamping = true; orbit.dampingFactor = .08;
  // web-ifc já entrega a geometria em Y-up (converte o Z-up do IFC) → NÃO rotacionar (rotacionar tombava o modelo)
  var modelRoot = new THREE.Group(); modelRoot.rotation.x = 0; scene.add(modelRoot);

  var matAndamento = new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0x7a4a06, transparent: true, opacity: .9, metalness: .05, roughness: .8, side: THREE.DoubleSide });
  var selMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, emissive: 0x0a5a2a, metalness: .1, roughness: .7 });
  var clashMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0x5a0a0a, metalness: .1, roughness: .6 });

  S = { host: host, opts: opts, scene: scene, camera: camera, renderer: renderer, orbit: orbit, modelRoot: modelRoot,
        bar: bar, hud: hud, over: over, loading: loading,
        api: new IfcAPI(), apiReady: false, modelID: -1, meshPorId: {}, elementos: [],
        modelos: [], meshPorUid: {}, ultra: false, _tickExtra: [],
        fly: { on: false, keys: {}, speed: 14, yaw: 0, pitch: 0 }, selected: null, prevMat: null,
        matAndamento: matAndamento, selMat: selMat, clashMat: clashMat, _clashSel: [], matCache: {}, raf: 0, alive: true };

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
  function tick() { if (!S || !S.alive) return; var dt = Math.min(clock.getDelta(), 0.1); if (fly.on) flyStep(dt); else orbit.update(); for (var tx = 0; tx < S._tickExtra.length; tx++) { try { S._tickExtra[tx](dt); } catch (_) {} } renderer.render(scene, camera); S.raf = requestAnimationFrame(tick); }
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
      if (opts.onPick) opts.onPick(propsDe(hit.object.userData.mid != null ? hit.object.userData.mid : S.modelID, hit.object.userData.expressID, hit.object.userData.tipo));
    } else if (opts.onPick) opts.onPick(null);
  });

  // ---- toolbar ----
  bar.addEventListener('click', function (e) {
    var b = e.target.closest('[data-b]'); if (!b) return; var k = b.getAttribute('data-b');
    if (k === 'abrir') bar.querySelector('[data-b="file"]').click();
    else if (k === 'exemplo') carregarExemplo();
    else if (k === 'limpar') limparTudo();
    else if (k === 'ultra') setUltra(!S.ultra);
    else if (k === 'orbita') setMode(false);
    else if (k === 'voo') setMode(true);
    else if (k === 'fit') enquadrar();
  });
  bar.querySelector('[data-b="file"]').addEventListener('change', function (e) {
    var fs2 = Array.prototype.slice.call(e.target.files || []); fs2.forEach(function (f) { abrirArquivo(f); }); e.target.value = '';
  });
  host.addEventListener('dragover', function (e) { e.preventDefault(); });
  host.addEventListener('drop', function (e) {
    e.preventDefault();
    Array.prototype.slice.call(e.dataTransfer.files || []).forEach(function (f) { if (/\.ifc$/i.test(f.name)) abrirArquivo(f); });
  });
  function setUltra(on) {
    S.ultra = !!on;
    renderer.setPixelRatio(S.ultra ? Math.min(window.devicePixelRatio || 1, 2.5) : Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMappingExposure = S.ultra ? 1.22 : 1.12;
    dir.intensity = S.ultra ? 1.25 : 1.1; fill.intensity = S.ultra ? 0.5 : 0.35;
    var bu = bar.querySelector('[data-b="ultra"]'); if (bu) { bu.style.background = S.ultra ? '#7c3aed' : ''; bu.style.color = S.ultra ? '#fff' : ''; }
    resize();
  }
  S._setUltra = setUltra;

  function propsDe(mid, expressID, tipoCache) {
    try {
      var line = S.api.GetLine(mid, expressID, true);
      var nome = (line.Name && line.Name.value) || '—';
      var tipo = tipoCache || nomeTipo(S.api.GetLineType(mid, expressID));
      var gid = (line.GlobalId && line.GlobalId.value) || '—';
      var cb = (function () { var mo = modeloDe(mid); return (mo && mo.carimbos && mo.carimbos[expressID]) || {}; })();
      return { id: expressID, nome: nome, tipo: tipo, globalId: gid, tag: (line.Tag && line.Tag.value) || '', etapa: cb.etapa || '', codOrc: cb.codOrc || '' };
    } catch (e) { return { id: expressID, nome: '—', tipo: tipoCache || '', globalId: '', etapa: '', codOrc: '' }; }
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

  // rejeição NÃO fica memoizada: falha transitória do wasm (offline/atualização) permite retentar na próxima carga
  function initApi() { if (!S._initP) S._initP = (async function () { S.api.SetWasmPath('bim/vendor/'); await S.api.Init(); S.apiReady = true; })().catch(function (e) { S._initP = null; throw e; }); return S._initP; }
  function enfileirar(fn) { S._loadChain = (S._loadChain || Promise.resolve()).then(fn, fn); return S._loadChain; }

  // Lê os carimbos do exportador pyRevit e devolve mapa expressID -> {etapa, codOrc}.
  // Uma passada por todos os IfcRelDefinesByProperties; para cada, resolve o pset e varre
  // seus IfcPropertySingleValue atrás de OrcaPRO_Etapa/OrcaPRO_CodOrc, atribuindo a TODOS os
  // RelatedObjects (um rel pode carimbar vários elementos). Blindado: qualquer falha de leitura
  // devolve o que já achou — NUNCA impede o modelo 3D de abrir (property é bônus sobre a geometria).
  function lerCarimbosOrcaPro(mid) {
    var mapa = {};
    try {
      var rels = S.api.GetLineIDsWithType(mid, IFC_RELDEFINESBYPROPERTIES);
      var nRel = rels.size();
      for (var i = 0; i < nRel; i++) {
        var rel; try { rel = S.api.GetLine(mid, rels.get(i), false); } catch (_) { continue; }
        if (!rel || !rel.RelatingPropertyDefinition || !rel.RelatedObjects) continue;
        var psetID = rel.RelatingPropertyDefinition.value; if (psetID == null) continue;
        var pset; try { pset = S.api.GetLine(mid, psetID, false); } catch (_) { continue; }
        if (!pset || !pset.HasProperties) continue; // não é IfcPropertySet (ex.: quantities/type)
        var props = Array.isArray(pset.HasProperties) ? pset.HasProperties : [pset.HasProperties];
        var etapa = null, cod = null;
        for (var p = 0; p < props.length; p++) {
          var h = props[p]; if (!h || h.value == null) continue;
          var pv; try { pv = S.api.GetLine(mid, h.value, false); } catch (_) { continue; }
          if (!pv || pv.type !== IFC_PROPERTYSINGLEVALUE) continue;
          var nm = pv.Name && pv.Name.value;
          if (nm === 'OrcaPRO_Etapa' && pv.NominalValue) etapa = pv.NominalValue.value;
          else if (nm === 'OrcaPRO_CodOrc' && pv.NominalValue) cod = pv.NominalValue.value;
        }
        if (etapa == null && cod == null) continue;
        var objs = Array.isArray(rel.RelatedObjects) ? rel.RelatedObjects : [rel.RelatedObjects];
        for (var o = 0; o < objs.length; o++) {
          var oh = objs[o]; if (!oh || oh.value == null) continue;
          var eid = oh.value; if (!mapa[eid]) mapa[eid] = {};
          if (etapa != null) mapa[eid].etapa = etapa;
          if (cod != null) mapa[eid].codOrc = cod;
        }
      }
    } catch (e) { /* leitura de propriedades é bônus; nunca impede o modelo de abrir */ }
    return mapa;
  }

  // Fator linear do prefixo do IfcSIUnit de um tipo (LENGTHUNIT/AREAUNIT/VOLUMEUNIT). Ex.: CENTI→0.01.
  // Devolve null se o tipo não estiver declarado no arquivo. IMPORTANTE: no IFC, área e volume têm
  // unidade PRÓPRIA (SQUARE_METRE/CUBIC_METRE, quase sempre m²/m³ mesmo com comprimento em cm/mm) —
  // por isso NÃO se converte área com comprimento². Só se AREAUNIT/VOLUMEUNIT faltarem é que caímos
  // no derivado (comprimento² / comprimento³).
  function unidadePrefixoBase(mid, tipo) {
    try {
      var us = S.api.GetLineIDsWithType(mid, IFC_SIUNIT), n = us.size();
      for (var i = 0; i < n; i++) {
        var u; try { u = S.api.GetLine(mid, us.get(i), false); } catch (_) { continue; }
        if (!u || !u.UnitType || u.UnitType.value !== tipo) continue;
        var p = u.Prefix && u.Prefix.value;
        return p === 'MILLI' ? 0.001 : p === 'CENTI' ? 0.01 : p === 'DECI' ? 0.1 : p === 'KILO' ? 1000 : 1;
      }
    } catch (_) {}
    return null;
  }

  // Lê BaseQuantities (IfcElementQuantity) por elemento → {comprimento, area, volume, contagem} já
  // em metros/m²/m³. Espelha lerCarimbosOrcaPro, mas atua nos psets que têm .Quantities (não
  // .HasProperties — exatamente os que o traversal de carimbos pula). Escolhe por nome:
  // comprimento='Length' (ignora Width/Height/Perímetro); área/volume preferem 'Net' sobre 'Gross'.
  // Quando existir, o motor de quantitativos prefere isto (MEDIDO) ao AABB (ESTIMADO). Blindado:
  // qualquer falha devolve o que já achou — quantidade é bônus, NUNCA impede o 3D de abrir.
  function lerQuantitativos(mid) {
    var mapa = {};
    // 3 fatores independentes → metros / m² / m³. Área/volume usam a unidade própria (m²/m³ se
    // declarada); só caem no comprimento²/³ se AREAUNIT/VOLUMEUNIT não existirem no arquivo.
    var bL = unidadePrefixoBase(mid, 'LENGTHUNIT'); if (bL == null) bL = 1;
    var bA = unidadePrefixoBase(mid, 'AREAUNIT'), bV = unidadePrefixoBase(mid, 'VOLUMEUNIT');
    var fLen = bL, fArea = (bA != null ? bA * bA : bL * bL), fVol = (bV != null ? bV * bV * bV : bL * bL * bL);
    function vnum(x) { if (x == null) return NaN; if (typeof x === 'object') x = x.value; var v = parseFloat(x); return isNaN(v) ? NaN : v; }
    try {
      var rels = S.api.GetLineIDsWithType(mid, IFC_RELDEFINESBYPROPERTIES), nRel = rels.size();
      for (var i = 0; i < nRel; i++) {
        var rel; try { rel = S.api.GetLine(mid, rels.get(i), false); } catch (_) { continue; }
        if (!rel || !rel.RelatingPropertyDefinition || !rel.RelatedObjects) continue;
        var qid = rel.RelatingPropertyDefinition.value; if (qid == null) continue;
        var qset; try { qset = S.api.GetLine(mid, qid, false); } catch (_) { continue; }
        if (!qset || !qset.Quantities) continue; // não é IfcElementQuantity (pset comum cai fora)
        var qs = Array.isArray(qset.Quantities) ? qset.Quantities : [qset.Quantities];
        var comp = { v: 0, s: -1 }, ar = { v: 0, s: -1 }, vol = { v: 0, s: -1 }, cont = 0;
        for (var q = 0; q < qs.length; q++) {
          var qh = qs[q]; if (!qh || qh.value == null) continue;
          var qv; try { qv = S.api.GetLine(mid, qh.value, false); } catch (_) { continue; }
          if (!qv) continue;
          var nm = (qv.Name && qv.Name.value) ? String(qv.Name.value).toLowerCase() : '';
          if (qv.LengthValue != null) {
            var Lv = vnum(qv.LengthValue); if (isNaN(Lv)) continue;
            if (/width|height|thick|depth|perimet|larg|altura|espess/.test(nm)) continue; // não é "o comprimento"
            var sL = nm === 'length' ? 3 : /length|comprim/.test(nm) ? 2 : 1;
            if (sL > comp.s) comp = { v: Lv, s: sL };
          } else if (qv.AreaValue != null) {
            var Av = vnum(qv.AreaValue); if (isNaN(Av)) continue;
            var sA = /net/.test(nm) ? 3 : /gross/.test(nm) ? 2 : 1;
            if (sA > ar.s) ar = { v: Av, s: sA };
          } else if (qv.VolumeValue != null) {
            var Vv = vnum(qv.VolumeValue); if (isNaN(Vv)) continue;
            var sV = /net/.test(nm) ? 3 : /gross/.test(nm) ? 2 : 1;
            if (sV > vol.s) vol = { v: Vv, s: sV };
          } else if (qv.CountValue != null) {
            var Cv = vnum(qv.CountValue); if (!isNaN(Cv)) cont += Cv;
          }
        }
        if (comp.s < 0 && ar.s < 0 && vol.s < 0 && cont === 0) continue;
        var qto = { comprimento: comp.s >= 0 ? comp.v * fLen : 0, area: ar.s >= 0 ? ar.v * fArea : 0, volume: vol.s >= 0 ? vol.v * fVol : 0, contagem: cont };
        var objs = Array.isArray(rel.RelatedObjects) ? rel.RelatedObjects : [rel.RelatedObjects];
        for (var o = 0; o < objs.length; o++) {
          var oh = objs[o]; if (!oh || oh.value == null) continue;
          var eid = oh.value;
          // um elemento pode ter mais de um IfcElementQuantity → fica o MAIOR por dimensão (não soma, p/ não duplicar)
          if (!mapa[eid]) mapa[eid] = { comprimento: 0, area: 0, volume: 0, contagem: 0 };
          if (qto.comprimento > mapa[eid].comprimento) mapa[eid].comprimento = qto.comprimento;
          if (qto.area > mapa[eid].area) mapa[eid].area = qto.area;
          if (qto.volume > mapa[eid].volume) mapa[eid].volume = qto.volume;
          if (qto.contagem > mapa[eid].contagem) mapa[eid].contagem = qto.contagem;
        }
      }
    } catch (e) { /* quantidade é bônus; nunca impede o modelo de abrir */ }
    return mapa;
  }

  // ---------- MULTI-IFC: cada arquivo vira um MODELO independente (disciplina + transparência próprias) ----------
  function detectarDisciplina(nome, tipos) {
    var n = String(nome || '').toLowerCase();
    if (/estrut|struct|\best[_\-.]|founda/.test(n)) return 'estrutural';
    if (/arq|arch/.test(n)) return 'arquitetura';
    if (/hidr|hydro|sanit|agua|água|esgoto|plumb/.test(n)) return 'hidraulica';
    if (/elet|elec|el[ée]tr/.test(n)) return 'eletrica';
    if (/avac|hvac|mec[aâ]|clima/.test(n)) return 'mecanica';
    var t = tipos || {};
    var est = (t.IFCBEAM || 0) + (t.IFCCOLUMN || 0) + (t.IFCFOOTING || 0) + (t.IFCPILE || 0) + (t.IFCMEMBER || 0);
    var hid = (t.IFCFLOWSEGMENT || 0) + (t.IFCFLOWFITTING || 0) + (t.IFCFLOWTERMINAL || 0);
    var arq = (t.IFCWALL || 0) + (t.IFCWALLSTANDARDCASE || 0) + (t.IFCDOOR || 0) + (t.IFCWINDOW || 0) + (t.IFCCOVERING || 0) + (t.IFCROOF || 0) + (t.IFCSLAB || 0);
    var max = Math.max(est, hid, arq);
    if (!max) return 'arquitetura';
    return max === hid ? 'hidraulica' : (max === est ? 'estrutural' : 'arquitetura');
  }
  function modeloDe(mid) { for (var i = 0; i < S.modelos.length; i++) if (S.modelos[i].mid === mid) return S.modelos[i]; return null; }
  function publicos() { return S.modelos.map(function (mo) { return { mid: mo.mid, nome: mo.nome, disciplina: mo.disciplina, alpha: mo.alpha, visivel: mo.visivel, n: mo.elementos.length }; }); }
  function notifyModelos() { if (S.opts && S.opts.onModelos) { try { S.opts.onModelos(publicos()); } catch (_) {} } }
  S._publicos = publicos;

  // material corrente de um mesh respeitando a TRANSPARÊNCIA do modelo dele
  function matBase(m) {
    var mo = modeloDe(m.userData.mid);
    var orig = m.userData.matOrig || m.material;
    if (!mo || mo.alpha >= 0.99) return orig;
    var k = orig.uuid;
    if (!mo.transCache[k]) {
      var c = orig.clone();
      c.transparent = true; c.opacity = (orig.opacity != null ? orig.opacity : 1) * mo.alpha; c.depthWrite = false;
      mo.transCache[k] = c;
    }
    return mo.transCache[k];
  }
  S._matBase = matBase;
  function refreshModelo(mo) {
    mo.grupo.visible = !!mo.visivel;
    mo.grupo.children.forEach(function (m) {
      if (m === S.selected) return;
      if (S._clashSel && S._clashSel.indexOf(m) !== -1) return;
      if (m.material === S.matAndamento) return; // estado 4D "em andamento" mantém o âmbar
      m.material = matBase(m);
    });
  }
  function setTransparencia(mid, alpha) {
    var mo = modeloDe(mid); if (!mo) return;
    mo.alpha = Math.max(0.05, Math.min(1, +alpha || 0));
    Object.keys(mo.transCache).forEach(function (k) { try { mo.transCache[k].dispose(); } catch (_) {} });
    mo.transCache = {};
    refreshModelo(mo); notifyModelos();
  }
  function setVisivel(mid, v) { var mo = modeloDe(mid); if (!mo) return; mo.visivel = !!v; mo.grupo.visible = !!v; notifyModelos(); }
  function setDisciplina(mid, d) {
    var mo = modeloDe(mid); if (!mo) return;
    mo.disciplina = d; mo.elementos.forEach(function (e) { e.disciplina = d; });
    notifyModelos();
    if (opts.onLoaded) opts.onLoaded(S.elementos.slice()); // 4D/QTO/clash replanejam com a disciplina nova
  }
  function atualizarHud() {
    var el = 0, tri = 0;
    S.modelos.forEach(function (mo) { el += mo.nEl || 0; tri += mo.nTri || 0; });
    hud.querySelector('[data-h="el"]').textContent = el.toLocaleString('pt-BR');
    hud.querySelector('[data-h="tri"]').textContent = Math.round(tri).toLocaleString('pt-BR');
  }
  function rebuildIndices() {
    S.elementos = []; S.meshPorId = {}; S.meshPorUid = {};
    S.modelos.forEach(function (mo) {
      S.elementos = S.elementos.concat(mo.elementos);
      mo.grupo.children.forEach(function (m) {
        var eid = m.userData.expressID; if (eid == null) return;
        S.meshPorId[eid] = m; S.meshPorUid[mo.mid + ':' + eid] = m;
      });
    });
  }
  function removerModelo(mid) {
    var mo = modeloDe(mid); if (!mo) return;
    S.modelos.splice(S.modelos.indexOf(mo), 1);
    mo.grupo.children.slice().forEach(function (m) { if (m.geometry) { try { m.geometry.dispose(); } catch (_) {} } });
    Object.keys(mo.matCache).forEach(function (k) { try { mo.matCache[k].dispose(); } catch (_) {} });
    Object.keys(mo.transCache).forEach(function (k) { try { mo.transCache[k].dispose(); } catch (_) {} });
    modelRoot.remove(mo.grupo);
    try { S.api.CloseModel(mid); } catch (_) {}
    if (S.selected && S.selected.userData.mid === mid) { S.selected = null; S.prevMat = null; }
    S._clashSel = (S._clashSel || []).filter(function (m) { return m.userData.mid !== mid; });
    rebuildIndices(); atualizarHud(); notifyModelos();
    if (opts.onLoaded) opts.onLoaded(S.elementos.slice());
    if (!S.modelos.length) over.style.display = 'flex';
  }
  function limparTudo() {
    S.modelos.slice().forEach(function (mo) { removerModelo(mo.mid); });
    S.carimbos = {}; S.qto = {};
  }
  S._setTransparencia = setTransparencia; S._setVisivel = setVisivel; S._setDisciplina = setDisciplina;
  S._removerModelo = removerModelo; S._limparTudo = limparTudo;

  async function carregarIFC(arrayBuffer, nome) {
    over.style.display = 'none'; loading.style.display = 'flex';
    loading.querySelector('[data-l="txt"]').textContent = 'Lendo ' + (nome || 'IFC') + '…';
    if (S.modelos.length >= 8) { loading.style.display = 'none'; over.style.display = S.modelos.length ? 'none' : 'flex'; try { alert('Limite de 8 modelos abertos ao mesmo tempo. Remova um antes de abrir outro (memória de vídeo).'); } catch (_) {} return; }
    var mid;
    try {
      await initApi();
      var data = new Uint8Array(arrayBuffer);
      mid = S.api.OpenModel(data);
      S.modelID = mid; // compat: "modelo corrente" = último carregado
      var modelo = { mid: mid, nome: nome || ('Modelo ' + (S.modelos.length + 1)), disciplina: '', alpha: 1, visivel: true, grupo: new THREE.Group(), matCache: {}, transCache: {}, elementos: [], tipos: {}, nEl: 0, nTri: 0 };
      modelo.grupo.userData.mid = mid;
      modelRoot.add(modelo.grupo);
      // carimbos do exportador pyRevit + BaseQuantities — merge nos mapas compartilhados (4D/5D)
      var carimbos = lerCarimbosOrcaPro(mid), qto = lerQuantitativos(mid);
      modelo.carimbos = carimbos; modelo.qto = qto; // por modelo (expressID colide entre IFCs)
      var tmpMat = new THREE.Matrix4();
      function getMat(r, g, b, a) { var k = (r * 255 | 0) + '_' + (g * 255 | 0) + '_' + (b * 255 | 0) + '_' + a.toFixed(2); if (!modelo.matCache[k]) modelo.matCache[k] = new THREE.MeshStandardMaterial({ color: new THREE.Color(r, g, b), transparent: a < 1, opacity: a, metalness: .05, roughness: .85, side: THREE.DoubleSide }); return modelo.matCache[k]; }
      S.api.StreamAllMeshes(mid, function (mesh) {
        var geos = mesh.geometries, n = geos.size(), tipoNum = 0;
        try { tipoNum = S.api.GetLineType(mid, mesh.expressID); } catch (_) {}
        var tipoNome = nomeTipo(tipoNum);
        var tKey = String(tipoNome).toUpperCase(); modelo.tipos[tKey] = (modelo.tipos[tKey] || 0) + 1;
        for (var i = 0; i < n; i++) {
          var pg = geos.get(i), geo = S.api.GetGeometry(mid, pg.geometryExpressID);
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
          m.userData.expressID = mesh.expressID; m.userData.tipo = tipoNome; m.userData.mid = mid; m.userData.matOrig = m.material;
          modelo.grupo.add(m);
          S.meshPorId[mesh.expressID] = m; S.meshPorUid[mid + ':' + mesh.expressID] = m;
          modelo.nTri += idx.length / 3; geo.delete();
        }
        var cb = carimbos[mesh.expressID] || {};
        modelo.elementos.push({ id: mesh.expressID, uid: mid + ':' + mesh.expressID, mid: mid, arquivo: modelo.nome, tipo: tipoNome, nome: rotuloDisciplina(tipoNome), etapa: cb.etapa || null, codOrc: cb.codOrc || null, qto: (qto && qto[mesh.expressID]) || null });
        modelo.nEl++;
      });
      modelo.disciplina = detectarDisciplina(modelo.nome, modelo.tipos);
      modelo.elementos.forEach(function (e) { e.disciplina = modelo.disciplina; });
      S.modelos.push(modelo);
      atualizarHud();
      enquadrar(); loading.style.display = 'none';
      // AABB (mundo) por elemento do modelo novo — p/ compatibilização entre DISCIPLINAS
      try {
        modelRoot.updateMatrixWorld(true);
        var caixas = {};
        modelo.grupo.children.forEach(function (m) {
          var id = m.userData && m.userData.expressID; if (id == null) return;
          var bb = new THREE.Box3().setFromObject(m); if (bb.isEmpty()) return;
          if (!caixas[id]) caixas[id] = bb; else caixas[id].union(bb);
        });
        modelo.elementos.forEach(function (elx) { var bb = caixas[elx.id]; if (bb) elx.aabb = { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] }; });
      } catch (_) {}
      S.elementos = []; S.modelos.forEach(function (mo) { S.elementos = S.elementos.concat(mo.elementos); });
      notifyModelos();
      if (opts.onLoaded) opts.onLoaded(S.elementos.slice());
    } catch (err) {
      try { if (mid != null && mid !== -1) S.api.CloseModel(mid); } catch (_) {}
      try { if (typeof modelo !== 'undefined' && modelo && S.modelos.indexOf(modelo) === -1) { (modelo.grupo.children || []).forEach(function (m) { if (m.geometry) { try { m.geometry.dispose(); } catch (_) {} } }); Object.keys(modelo.matCache || {}).forEach(function (k) { try { modelo.matCache[k].dispose(); } catch (_) {} }); modelRoot.remove(modelo.grupo); } } catch (_) {}
      try { if (mid != null) Object.keys(S.meshPorUid).forEach(function (u) { if (u.indexOf(mid + ':') === 0) delete S.meshPorUid[u]; }); } catch (_) {}
      loading.style.display = 'none'; if (!S.modelos.length) over.style.display = 'flex';
      over.querySelector('div').innerHTML = '<div style="font-size:30px">⚠️</div><h3 style="margin:8px 0">Não consegui ler este IFC</h3><p style="color:#a9c1d8;font-size:13px">' + esc(String(err && err.message || err)) + '</p><p style="color:#a9c1d8;font-size:12px">Confira se é um .ifc válido (IFC2x3 ou IFC4).</p>';
    }
  }
  function rotuloDisciplina(ifcName) { var u = String(ifcName).toUpperCase(); return TIPOS[u] || String(ifcName).replace(/^IFC/, ''); }

  function abrirArquivo(file) { var fr = new FileReader(); fr.onload = function () { enfileirar(function () { return carregarIFC(fr.result, file.name); }); }; fr.readAsArrayBuffer(file); }
  function carregarExemplo() { fetch('bim/samples/exemplo.ifc').then(function (r) { return r.arrayBuffer(); }).then(function (ab) { enfileirar(function () { return carregarIFC(ab, 'exemplo.ifc'); }); }).catch(function () { over.querySelector('div').innerHTML = '<div style="font-size:30px">🗂️</div><p style="color:#a9c1d8">Abra um arquivo .ifc seu — o exemplo não foi encontrado.</p>'; }); }
  S._abrirArquivo = abrirArquivo; S._carregarExemplo = carregarExemplo;
}

// aplica o estado 4D: esconde futuros; construídos = material original; em andamento = âmbar
function aplicarEstado(est) {
  if (!S) return;
  var fut = {}, and = {};
  (est && est.futuros || []).forEach(function (id) { fut[id] = 1; });
  (est && est.emAndamento || []).forEach(function (id) { and[id] = 1; });
  Object.keys(S.meshPorUid || S.meshPorId).forEach(function (uid) {
    var m = (S.meshPorUid || S.meshPorId)[uid]; if (!m) return; var id = m.userData.expressID; var chave = (fut[uid] != null || and[uid] != null) ? uid : id;
    if (fut[chave]) { m.visible = false; return; }
    m.visible = true;
    if (m === S.selected) return; // não mexe no selecionado
    m.material = and[chave] ? S.matAndamento : (S._matBase ? S._matBase(m) : (m.userData.matOrig || m.material));
  });
}
function mostrarTudo() { if (!S) return; Object.keys(S.meshPorUid || S.meshPorId).forEach(function (id) { var m = (S.meshPorUid || S.meshPorId)[id]; if (m) { m.visible = true; if (m !== S.selected) m.material = S._matBase ? S._matBase(m) : (m.userData.matOrig || m.material); } }); }

// Compatibilização: destaca (vermelho) os elementos de um clash e enquadra a câmera no par.
function focarClash(ids) {
  if (!S) return;
  limparClash();
  var idset = {}; (ids || []).forEach(function (id) { idset[id] = 1; });
  var box = new THREE.Box3(), any = false;
  S.modelRoot.children.forEach(function (g) { (g.children || []).forEach(function (m) {
    if (m.userData && (idset[m.userData.mid + ':' + m.userData.expressID] || idset[m.userData.expressID])) {
      m.visible = true; m.material = S.clashMat; box.expandByObject(m); any = true; S._clashSel.push(m);
    }
  }); });
  if (any) {
    var size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    var maxDim = Math.max(size.x, size.y, size.z) || 2, dist = maxDim * 3 + 2;
    S.camera.position.set(c.x + dist * .7, c.y + dist * .55, c.z + dist * .7);
    S.camera.near = Math.max(0.01, maxDim / 100); S.camera.far = Math.max(1000, maxDim * 200); S.camera.updateProjectionMatrix();
    S.orbit.target.copy(c); S.orbit.update();
    S.fly.yaw = Math.atan2(S.camera.position.x - c.x, S.camera.position.z - c.z); S.fly.pitch = -0.3;
  }
}
function limparClash() { if (!S) return; (S._clashSel || []).forEach(function (m) { m.material = S._matBase ? S._matBase(m) : (m.userData.matOrig || m.material); }); S._clashSel = []; }

// ===================== REUNIÃO: presença multi-usuário no modelo =====================
// Vários usuários andam no MESMO modelo com um avatar nomeado (compatibilização ao vivo).
// Transporte simples e robusto: SSE (recebe) + POST (envia pose) num relay do VPS — sem
// dependências. Sem internet, o BIM segue 100% (a reunião só não conecta).
var Reuniao = {
  on: false, sala: '', uid: 'u' + Math.random().toString(36).slice(2, 9),
  es: null, outros: {}, grupo: null, cfg: null, _lastPost: 0,
  base: function () { return ((typeof window !== 'undefined' && window.CONFIG && window.CONFIG.licencaServer) ? String(window.CONFIG.licencaServer).replace(/\/$/, '') : '') + '/bim-sala/'; },
  _sprite: function (nome, cor) {
    var cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
    var x = cv.getContext('2d');
    x.fillStyle = 'rgba(12,31,51,.88)'; x.beginPath();
    if (x.roundRect) x.roundRect(6, 18, 500, 92, 26); else x.rect(6, 18, 500, 92);
    x.fill();
    x.strokeStyle = cor; x.lineWidth = 6; x.stroke();
    x.font = 'bold 56px Segoe UI, Arial'; x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(String(nome || 'Visitante').slice(0, 16), 256, 66);
    var tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4;
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sp.scale.set(2.6, 0.65, 1); sp.renderOrder = 999;
    return sp;
  },
  _avatar: function (u) {
    var g = new THREE.Group();
    var corR = new THREE.Color(u.c1 || '#2e6f9e'), corC = new THREE.Color(u.c2 || '#f59e0b');
    var corpoGeo = THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.24, 0.72, 6, 14) : new THREE.CylinderGeometry(0.24, 0.26, 1.1, 14);
    var corpo = new THREE.Mesh(corpoGeo, new THREE.MeshStandardMaterial({ color: corR, roughness: .6 }));
    corpo.position.y = 0.85; g.add(corpo);
    var cab = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 14), new THREE.MeshStandardMaterial({ color: 0xe4b48e, roughness: .7 }));
    cab.position.y = 1.52; g.add(cab);
    var capacete = new THREE.Mesh(new THREE.SphereGeometry(0.185, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: corC, roughness: .35, metalness: .15 }));
    capacete.position.y = 1.55; g.add(capacete);
    var aba = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 18), capacete.material);
    aba.position.y = 1.5; aba.position.z = 0.05; g.add(aba);
    var nome = this._sprite(u.nome, u.c2 || '#f59e0b'); nome.position.y = 2.15; g.add(nome);
    var esc2 = u.esc === 'baixo' ? 0.88 : u.esc === 'alto' ? 1.12 : 1; g.scale.set(esc2, esc2, esc2);
    g.userData.alvo = { p: new THREE.Vector3(), yaw: 0 };
    return g;
  },
  _aplicar: function (usuarios) {
    var self = this, vistos = {};
    Object.keys(usuarios || {}).forEach(function (uid) {
      if (uid === self.uid) return;
      var u = usuarios[uid]; if (!u || !u.p) return;
      vistos[uid] = 1;
      var av = self.outros[uid];
      if (!av || av.userData.c1 !== u.c1 || av.userData.c2 !== u.c2 || av.userData.nome !== u.nome || av.userData.esc !== u.esc) {
        if (av) { self._dispor(av); self.grupo.remove(av); }
        av = self._avatar(u); av.userData.c1 = u.c1; av.userData.c2 = u.c2; av.userData.nome = u.nome; av.userData.esc = u.esc;
        av.position.set(u.p[0], u.p[1] - 1.6, u.p[2]);
        self.grupo.add(av); self.outros[uid] = av;
      }
      av.userData.alvo.p.set(u.p[0], u.p[1] - 1.6, u.p[2]); // câmera ≈ olhos → pé do avatar ~1,6m abaixo
      av.userData.alvo.yaw = u.yaw || 0;
    });
    Object.keys(this.outros).forEach(function (uid) { if (!vistos[uid]) { self._dispor(self.outros[uid]); self.grupo.remove(self.outros[uid]); delete self.outros[uid]; } });
    if (S && S.opts && S.opts.onReuniao) { try { S.opts.onReuniao(Object.keys(vistos).length + 1); } catch (_) {} }
  },
  _dispor: function (g) { try { g.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); } catch (_) {} },
  _tick: function () {
    var self = Reuniao; if (!self.on || !S) return;
    Object.keys(self.outros).forEach(function (uid) {
      var av = self.outros[uid], a = av.userData.alvo;
      av.position.lerp(a.p, 0.14);
      var dy = a.yaw - av.rotation.y; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      av.rotation.y += dy * 0.14;
    });
    if (!self.conectado) return; // sem SSE conectado não martela POST
    var now = Date.now();
    if (now - self._lastPost > 180) {
      self._lastPost = now;
      var c = S.camera, e = new THREE.Euler().setFromQuaternion(c.quaternion, 'YXZ');
      var body = JSON.stringify({ uid: self.uid, nome: self.cfg.nome, c1: self.cfg.c1, c2: self.cfg.c2, esc: self.cfg.esc, p: [c.position.x, c.position.y, c.position.z], yaw: e.y });
      try { fetch(self.base() + encodeURIComponent(self.sala) + '/pose', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: body }).catch(function () {}); } catch (_) {}
    }
  },
  entrar: function (cfg) {
    if (!S) return false;
    this.sair();
    this.cfg = { nome: (cfg && cfg.nome) || 'Visitante', c1: (cfg && cfg.c1) || '#2e6f9e', c2: (cfg && cfg.c2) || '#f59e0b', esc: (cfg && cfg.esc) || 'normal' };
    this.sala = (cfg && cfg.sala) || 'geral';
    this.grupo = new THREE.Group(); S.scene.add(this.grupo);
    this.conectado = false; this.falhas = 0; this.jaConectou = false;
    var self = this;
    try {
      this.es = new EventSource(this.base() + encodeURIComponent(this.sala) + '/stream');
      this.es.onopen = function () { self.conectado = true; self.jaConectou = true; self.falhas = 0; if (self._connTimer) { clearTimeout(self._connTimer); self._connTimer = 0; } if (S && S.opts && S.opts.onReuniao) { try { S.opts.onReuniao(self.on ? (Object.keys(self.outros).length + 1) : 0); } catch (_) {} } };
      this.es.onmessage = function (ev) { try { var d = JSON.parse(ev.data); self.conectado = true; self.jaConectou = true; self._aplicar(d.usuarios || {}); } catch (_) {} };
      // queda DEPOIS de conectado: pausa os POSTs (conectado=false) e deixa o SSE reconectar
      // sozinho (onopen religa); só desiste de vez quem NUNCA conectou (3 falhas na entrada).
      // EXCEÇÃO: resposta ≠200 (ex.: 502 do proxy com o relay morto) FECHA o EventSource pra
      // sempre (readyState=CLOSED, sem retry da spec) → sem sair() aqui viraria reunião-zumbi
      // silenciosa (botão verde, contagem stale, nunca se recupera sozinha).
      this.es.onerror = function () {
        self.conectado = false; self.falhas++;
        var fatal = self.jaConectou && self.es && self.es.readyState === 2; // 2 = CLOSED (não reconecta mais)
        if (fatal || (!self.jaConectou && self.falhas >= 3)) { self.sair(); if (S && S.opts && S.opts.onReuniaoFalha) { try { S.opts.onReuniaoFalha(); } catch (_) {} } }
      };
    } catch (_) { this.sair(); return false; }
    this._connTimer = setTimeout(function () { if (self.on && !self.jaConectou) { self.sair(); if (S && S.opts && S.opts.onReuniaoFalha) { try { S.opts.onReuniaoFalha(); } catch (_) {} } } }, 8000);
    S._tickExtra.push(this._tick);
    this.on = true;
    return true;
  },
  sair: function () {
    this.on = false; this.conectado = false;
    if (this._connTimer) { clearTimeout(this._connTimer); this._connTimer = 0; }
    if (this.es) { try { this.es.close(); } catch (_) {} this.es = null; }
    var i = S ? S._tickExtra.indexOf(this._tick) : -1; if (i !== -1) S._tickExtra.splice(i, 1);
    var selfS = this; if (this.grupo) { Object.keys(this.outros).forEach(function (uid) { selfS._dispor(selfS.outros[uid]); }); if (S) S.scene.remove(this.grupo); }
    this.grupo = null; this.outros = {};
    if (S && S.opts && S.opts.onReuniao) { try { S.opts.onReuniao(0); } catch (_) {} }
  }
};

window.BIM = {
  montar: montar,
  abrirArquivo: function (f) { if (S && S._abrirArquivo) S._abrirArquivo(f); },
  carregarExemplo: function () { if (S && S._carregarExemplo) S._carregarExemplo(); },
  aplicarEstado: aplicarEstado,
  mostrarTudo: mostrarTudo,
  focarClash: function (ids) { if (S) focarClash(ids); },
  limparClash: function () { if (S) limparClash(); },
  get elementos() { return S ? S.elementos.slice() : []; },
  // ---- multi-IFC (interoperabilidade entre disciplinas) ----
  get modelos() { return S && S._publicos ? S._publicos() : []; },
  setTransparencia: function (mid, a) { if (S && S._setTransparencia) S._setTransparencia(mid, a); },
  setVisivel: function (mid, v) { if (S && S._setVisivel) S._setVisivel(mid, v); },
  setDisciplina: function (mid, d) { if (S && S._setDisciplina) S._setDisciplina(mid, d); },
  removerModelo: function (mid) { if (S && S._removerModelo) S._removerModelo(mid); },
  limpar: function () { if (S && S._limparTudo) S._limparTudo(); },
  setUltra: function (v) { if (S && S._setUltra) S._setUltra(v); },
  // ---- reunião multi-usuário (avatares no modelo) ----
  reuniao: {
    entrar: function (cfg) { return Reuniao.entrar(cfg); },
    sair: function () { Reuniao.sair(); },
    get ativa() { return Reuniao.on; },
    get sala() { return Reuniao.sala; },
    get participantes() { return Reuniao.on ? Object.keys(Reuniao.outros).length + 1 : 0; }
  }
};
