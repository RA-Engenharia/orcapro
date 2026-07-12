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
    [S.bar, S.hud, S.over, S.loading, S.renderer.domElement, S.hint, S.cortePanel, S.corteLPanel, S.snapPanel, S.snapMarca, S.ctecCfg, S.ctecModal].forEach(function (el) { if (el) host.appendChild(el); });
    if (S._onDragOver) { host.addEventListener('dragover', S._onDragOver); host.addEventListener('drop', S._onDrop); } // re-registra drop no host novo
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
    '<button class="btn sm" data-b="medir" title="Trena: clique em 2 pontos do modelo pra medir a distância">📏 Medir</button>' +
    '<button class="btn sm" data-b="snap" title="Snap da trena: agarrar em vértice, meio de aresta ou aresta">🧲</button>' +
    '<button class="btn sm" data-b="limpar-medidas" title="Apagar todas as cotas medidas" style="display:none">🧹 Cotas</button>' +
    '<button class="btn sm" data-b="planta" title="Planta baixa: corta o modelo numa altura e vê de cima">📐 Planta</button>' +
    '<button class="btn sm" data-b="corte" title="Corte livre: plano de corte horizontal, vertical ou em qualquer ângulo">✂️ Corte</button>' +
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
  S._onKeyDown = function (e) { fly.keys[e.code] = true; if (e.code === 'Escape') { if (S.ctecModal && S.ctecModal.style.display === 'flex' && S._fecharCtecModal) { S._fecharCtecModal(); return; } if (S._ctecCancelar && S._ctecCancelar(true)) return; if (fly.on) setMode(false); if (S.medir && S.medir.on) S._setMedir(false); if (S.planta && S.planta.on) S._setPlanta(false); if (S.corteL && S.corteL.on && S._setCorteL) S._setCorteL(false); } };
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
  // O Raycaster do three NÃO testa object.visible (só layers): sem filtro, o raio acerta elemento
  // OCULTO (modelo desligado no painel, 4D com "futuros" escondidos) na frente do visível — cota da
  // trena e seleção silenciosamente ERRADAS. Na planta, o clipping é só GPU: o raycast CPU ainda
  // acerta o telhado acima do corte. Este filtro resolve as duas famílias.
  function cadeiaVisivel(o) { for (var n = o; n; n = n.parent) { if (n.visible === false) return false; if (n === modelRoot) break; } return true; }
  // três clipa fragmentos onde plane.distanceToPoint(p) < 0 — o mesmo teste aqui mantém CPU==GPU
  // p/ QUALQUER plano ativo (planta baixa OU corte livre), não só o horizontal.
  function foraDoClip(p) {
    var pls = renderer.clippingPlanes || [];
    for (var i = 0; i < pls.length; i++) if (pls[i].distanceToPoint(p) < -1e-6) return true;
    return false;
  }
  function primeiroHit(hits) {
    for (var i = 0; i < hits.length; i++) {
      if (!cadeiaVisivel(hits[i].object)) continue;
      if (foraDoClip(hits[i].point)) continue; // clipado é só GPU; o raycast CPU ainda o acerta
      return hits[i];
    }
    return null;
  }
  canvasEl.addEventListener('dblclick', function (e) {
    if (!S || !S.alive) return;
    if (fly.on) return;
    if (S.medir && S.medir.on) return; // no modo trena o duplo-clique é medição, não seleção
    if (ctec.ativo) return; // riscando a linha de corte, clique é ponto — não seleção
    var r = canvasEl.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1; mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(mouse, camera);
    var hit = primeiroHit(ray.intersectObjects(modelRoot.children, true));
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
    // Órbita/Voo SEMPRE encerram as ferramentas (exclusividade nos 2 sentidos); Medir pode
    // coexistir com Planta/Corte (medir na planta e na face do corte é o uso pedido)
    else if (k === 'orbita') { sairFerramentas(); setMode(false); }
    else if (k === 'voo') { sairFerramentas(); setMode(true); }
    else if (k === 'medir') setMedir(!medir.on);
    else if (k === 'snap') toggleSnapPanel();
    else if (k === 'planta') setPlanta(!planta.on);
    else if (k === 'corte') setCorteL(!corteL.on);
    else if (k === 'limpar-medidas') { if (S._limparMedidas) S._limparMedidas(); }
    else if (k === 'fit') { if (planta.on) enquadrarTopo(); else enquadrar(); } // na planta re-centra a vista de topo (não sai)
  });
  // MATRIZ MODOS×SAÍDAS (manter em dia ao criar modo novo — regra aprendida no gate v1.1.64):
  //                    medir  planta  corteL  ctec(desenho)
  // botão Órbita/Voo    sai    sai     sai     cancela      (sairFerramentas)
  // Esc                 sai    sai     sai     cancela 1º   (S._onKeyDown)
  // focarClash          sai    sai     sai     cancela      (caminho externo, gestao.js)
  // carregarIFC         —      sai     sai     —            (bbox muda; medidas ficam)
  // removerModelo       limpa  re-ancora re-ancora cancela  (medidas limpas; corte re-ancora ou sai)
  // limparTudo          limpa  sai     sai     cancela
  // fit (Enquadrar)     —      sai     —       —            (corteL sobrevive: só reposiciona câmera)
  // entrar em planta    —      ·       sai     —            (planta×corteL disputam clippingPlanes)
  // entrar em corteL    —      sai     ·       cancela-se-via-planta
  // entrar em medir     —      —       —       —            (coexiste: mede na planta/no corte)
  function sairFerramentas() { if (S._fecharCtecModal && ctecModal.style.display === 'flex') S._fecharCtecModal(); ctecCancelar(); if (medir.on) setMedir(false); if (planta.on) setPlanta(false); if (corteL.on) setCorteL(false); } // fecha o modal do resultado + cobre o estágio "config aberta"
  bar.querySelector('[data-b="file"]').addEventListener('change', function (e) {
    var fs2 = Array.prototype.slice.call(e.target.files || []); fs2.forEach(function (f) { abrirArquivo(f); }); e.target.value = '';
  });
  function onDragOver(e) { e.preventDefault(); }
  function onDrop(e) { e.preventDefault(); Array.prototype.slice.call(e.dataTransfer.files || []).forEach(function (f) { if (/\.ifc$/i.test(f.name)) abrirArquivo(f); }); }
  host.addEventListener('dragover', onDragOver); host.addEventListener('drop', onDrop);
  S._onDragOver = onDragOver; S._onDrop = onDrop; // guardados p/ re-registrar no host novo (re-home)
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

  // ============================================================
  // Dica flutuante (usada pela trena e pela planta baixa)
  // ============================================================
  var hint = document.createElement('div');
  hint.setAttribute('data-bim', 'hint'); // âncora estável p/ testes/depuração
  hint.style.cssText = 'position:absolute;left:50%;top:52px;transform:translateX(-50%);z-index:4;display:none;background:rgba(34,197,94,.94);color:#04240f;font-weight:600;font-size:12.5px;padding:7px 15px;border-radius:20px;box-shadow:0 6px 16px rgba(0,0,0,.35);max-width:90%;text-align:center';
  host.appendChild(hint);
  S.hint = hint; // guardado p/ re-parentar no re-home (senão some ao revisitar a aba)
  S._hint = function (msg) { if (msg) { hint.textContent = msg; hint.style.display = 'block'; } else { hint.style.display = 'none'; } };

  // ============================================================
  // TRENA (medição) — clique em 2 pontos do modelo e mede a distância real
  // ============================================================
  var medir = { on: false, pts: [], objs: [], down: null, prov: null };
  S.medir = medir;

  // A geometria do web-ifc já vem NORMALIZADA em METROS (o próprio web-ifc aplica o fator da
  // unidade do arquivo). Logo, a distância entre 2 pontos do mundo JÁ é em metros — NÃO se aplica
  // o fator de unidade aqui (isso é só p/ os BaseQuantities do QTO, que vêm em unidade nativa).
  function fmtDist(m) { return m >= 1 ? m.toFixed(2).replace('.', ',') + ' m' : Math.round(m * 100) + ' cm'; }
  function labelSprite(txt) {
    var cv = document.createElement('canvas'), fs = 46, pad = 14;
    var g = cv.getContext('2d'); g.font = 'bold ' + fs + 'px Arial';
    cv.width = Math.ceil(g.measureText(txt).width) + pad * 2; cv.height = fs + pad * 2;
    g = cv.getContext('2d'); g.font = 'bold ' + fs + 'px Arial';
    g.fillStyle = 'rgba(11,26,43,.94)'; g.fillRect(0, 0, cv.width, cv.height);
    g.strokeStyle = '#22c55e'; g.lineWidth = 4; g.strokeRect(2, 2, cv.width - 4, cv.height - 4);
    g.fillStyle = '#c7f9d8'; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(txt, pad, cv.height / 2 + 2);
    var tex = new THREE.CanvasTexture(cv); tex.minFilter = THREE.LinearFilter;
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.userData._ratio = cv.width / cv.height; sp.userData._sc = 0.028; sp.renderOrder = 999; return sp;
  }
  function pontoMarca(p) {
    var s = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16), new THREE.MeshBasicMaterial({ color: 0x22c55e, depthTest: false }));
    s.position.copy(p); s.userData._sc = 0.006; s.renderOrder = 998; return s;
  }
  // marcas e etiquetas ficam do MESMO tamanho na tela em qualquer zoom/escala de modelo:
  // reescala por distância da câmera a cada frame (vãos pequenos — porta, parede — continuam legíveis)
  function rescaleObj(o) {
    var sc = o.userData && o.userData._sc; if (!sc) return;
    var d = camera.position.distanceTo(o.position) * sc;
    if (o.userData._ratio) o.scale.set(d * o.userData._ratio, d, 1); else o.scale.setScalar(d);
  }
  S._tickExtra.push(function () { for (var i = 0; i < medir.objs.length; i++) rescaleObj(medir.objs[i]); });
  function btnCotas() { var b = bar.querySelector('[data-b="limpar-medidas"]'); if (b) b.style.display = medir.objs.length ? '' : 'none'; }
  function addMed(o) { scene.add(o); medir.objs.push(o); rescaleObj(o); }
  function desenharMedida(a, b) {
    // na PLANTA mede-se a distância HORIZONTAL (projeção XZ) — é o que a planta representa;
    // em 3D livre, a distância real. A ETIQUETA declara "(horizontal)" pra não haver
    // diferença semântica silenciosa entre os dois modos.
    var dxz = Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z));
    var horizontal = !!planta.on, d = horizontal ? dxz : a.distanceTo(b);
    if (d < 2e-3) return false; // pontos coincidentes (duplo-clique/acidente) -> ignora
    var line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0x22c55e, depthTest: false })); line.renderOrder = 997;
    var lab = labelSprite(fmtDist(d) + (horizontal ? ' (horizontal)' : '')); lab.position.copy(a.clone().add(b).multiplyScalar(0.5));
    var mA = pontoMarca(a), mB = pontoMarca(b);
    addMed(mA); addMed(mB); addMed(line); addMed(lab); btnCotas();
    medir.ultima = { valor: d, horizontal: horizontal }; // introspecção (UI futura + testes)
    return true;
  }
  function limparMarca(o) { scene.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }
  function tirarProv() { if (!medir.prov) return; var i = medir.objs.indexOf(medir.prov); if (i >= 0) { limparMarca(medir.prov); medir.objs.splice(i, 1); } medir.prov = null; }
  function limparMedidas() { medir.prov = null; medir.objs.forEach(limparMarca); medir.objs = []; medir.pts = []; btnCotas(); }
  S._limparMedidas = limparMedidas;
  function setMedir(on) {
    medir.on = !!on;
    if (on) { setMode(false); } // pode coexistir com Planta/Corte: medir na planta e na face cortada
    else { medir.pts = []; tirarProv(); btnCotas(); esconderSnapMarca(); } // sai: descarta 1º ponto pendente
    var bm = bar.querySelector('[data-b="medir"]'); if (bm) { bm.style.background = on ? '#16a34a' : ''; bm.style.color = on ? '#fff' : ''; }
    canvasEl.style.cursor = on ? 'crosshair' : '';
    S._hint(on ? (planta.on ? '📏 Trena na planta: clique em 2 pontos — a cota é a distância horizontal.' : '📏 Trena: clique em 2 pontos do modelo pra medir. Esc sai.') : (planta.on ? '📐 Planta baixa. Ajuste a altura do corte no painel.' : ''));
  }
  S._setMedir = setMedir;
  // captura por CLIQUE-SEM-ARRASTE (não atrapalha a órbita: se arrastou, é rotação).
  // O MESMO caminho serve a trena e o desenho da linha do corte técnico — ambos com snap.
  function raycastEm(clientX, clientY) {
    var rc = canvasEl.getBoundingClientRect();
    mouse.x = ((clientX - rc.left) / rc.width) * 2 - 1; mouse.y = -((clientY - rc.top) / rc.height) * 2 + 1;
    ray.setFromCamera(mouse, camera);
    return primeiroHit(ray.intersectObjects(modelRoot.children, true)); // ignora oculto/clipado
  }
  S._raycastEm = raycastEm; S._aplicarSnapRef = function (h, r) { return aplicarSnap(h, r); }; S._foraDoClipRef = foraDoClip; // hooks p/ E2E
  canvasEl.addEventListener('pointerdown', function (e) { if (!S || !S.alive) return; if (medir.on || ctec.ativo) medir.down = (e.button === 0) ? { x: e.clientX, y: e.clientY } : null; });
  canvasEl.addEventListener('pointerup', function (e) {
    if (!S || !S.alive) return;
    if ((!medir.on && !ctec.ativo) || !medir.down || e.button !== 0) return; // só botão esquerdo/toque
    var dx = e.clientX - medir.down.x, dy = e.clientY - medir.down.y; medir.down = null;
    if (dx * dx + dy * dy > 100) return; // arrastou (>10px) -> era órbita; tolerância p/ toque (tablet)
    var hit = raycastEm(e.clientX, e.clientY);
    if (!hit) { S._hint((ctec.ativo ? '📝' : '📏') + ' Clique em cima de uma superfície do modelo.'); return; }
    var sn = aplicarSnap(hit, raioToque(e)); mostrarSnapMarca(sn, e.clientX, e.clientY);
    if (ctec.ativo) { ctecClique(sn.p.clone()); return; } // linha do corte técnico tem prioridade
    medir.pts.push({ p: sn.p.clone() });
    if (medir.pts.length === 2) {
      tirarProv(); // a marca definitiva do 1º ponto é desenhada por desenharMedida (evita marca dupla)
      var ok = desenharMedida(medir.pts[0].p, medir.pts[1].p); medir.pts = [];
      S._hint(ok ? '📏 Medido! Clique 2 pontos pra medir de novo, ou Esc pra sair.' : '📏 Pontos muito próximos — clique 2 pontos distintos.');
    } else {
      var m0 = pontoMarca(medir.pts[0].p); addMed(m0); medir.prov = m0; S._hint('📏 Agora clique no 2º ponto.');
    }
  });
  // hover do snap: feedback ao vivo de onde a trena vai "agarrar" (throttle p/ não pesar o raycast)
  var _snapHoverT = 0;
  canvasEl.addEventListener('pointermove', function (e) {
    if (!S || !S.alive) return;
    if ((!medir.on && !ctec.ativo) || !snap.on) return;
    var t = performance.now(); if (t - _snapHoverT < 60) return; _snapHoverT = t;
    var hit = raycastEm(e.clientX, e.clientY);
    if (!hit) { esconderSnapMarca(); return; }
    mostrarSnapMarca(aplicarSnap(hit, raioToque(e)), e.clientX, e.clientY);
  });

  // ============================================================
  // PLANTA BAIXA — plano de corte horizontal com altura ajustável
  // ============================================================
  var planta = { on: false, plane: null, y0: 0, y1: 1 };
  S.planta = planta;
  var cortePanel = document.createElement('div');
  cortePanel.style.cssText = 'position:absolute;left:10px;bottom:10px;z-index:4;display:none;flex-direction:column;gap:7px;background:rgba(15,39,64,.94);border:1px solid #24435f;border-radius:11px;padding:11px 13px;color:#dbe8f5;font-size:12px;width:220px';
  cortePanel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:baseline"><b>📐 Altura do corte</b><span data-c="v" style="color:#7fe0a3;font-weight:700">—</span></div>' +
    '<input type="range" data-c="alt" min="0" max="1000" value="620" style="width:100%;accent-color:#22c55e">' +
    '<div style="font-size:11px;color:#9fb2c8">Esconde o que está acima do corte — a planta baixa do pavimento. A 📏 trena funciona aqui (cota horizontal).</div>' +
    '<button class="btn sm" data-c="cortetec" style="width:100%">📝 Gerar corte técnico (A–A)</button>';
  host.appendChild(cortePanel);
  S.cortePanel = cortePanel; // guardado p/ re-parentar no re-home (senão o slider some ao revisitar a aba)
  function setAlturaCorte(frac) {
    if (!planta.plane) return;
    var y = planta.y0 + (planta.y1 - planta.y0) * frac; planta.plane.constant = y;
    var rot = cortePanel.querySelector('[data-c="v"]'); if (rot) rot.textContent = fmtDist(Math.max(0, y - planta.y0)) + ' do piso'; // mundo já em metros
  }
  function setPlanta(on) {
    planta.on = !!on;
    var bp = bar.querySelector('[data-b="planta"]');
    if (on) {
      if (corteL.on) setCorteL(false); // planta e corte livre disputam o MESMO clippingPlanes
      setMode(false); // trena PODE ficar ligada (medir na planta é o uso pedido)
      var box = new THREE.Box3().setFromObject(modelRoot);
      if (box.isEmpty()) { planta.on = false; S._hint('Carregue um modelo primeiro.'); return; }
      var min = box.min, max = box.max, c = box.getCenter(new THREE.Vector3());
      planta.y0 = min.y; planta.y1 = max.y;
      planta.plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), max.y); // normal -Y: mantém o que está ABAIXO
      renderer.localClippingEnabled = true; renderer.clippingPlanes = [planta.plane];
      orbit.enableRotate = false; // planta: só translada/zoom (vista de topo travada)
      enquadrarTopo();
      cortePanel.style.display = 'flex';
      cortePanel.querySelector('[data-c="alt"]').value = 620; setAlturaCorte(0.62); // ~altura de peitoril
      if (bp) { bp.style.background = '#16a34a'; bp.style.color = '#fff'; }
      S._hint('📐 Planta baixa. Ajuste a altura do corte no painel. Toque em 📐 de novo pra sair.');
    } else {
      ctecCancelar(); // desenho/config do corte técnico só faz sentido NA planta (incondicional: pega a config aberta)
      renderer.clippingPlanes = []; renderer.localClippingEnabled = false; planta.plane = null;
      orbit.enableRotate = true; // volta a permitir órbita livre
      cortePanel.style.display = 'none';
      if (bp) { bp.style.background = ''; bp.style.color = ''; }
      enquadrar(); S._hint(medir.on ? '📏 Trena: clique em 2 pontos do modelo pra medir. Esc sai.' : '');
    }
  }
  S._setPlanta = setPlanta;
  // vista de topo travada (reusada por setPlanta ao entrar E pelo Enquadrar dentro da planta)
  function enquadrarTopo() {
    var box = new THREE.Box3().setFromObject(modelRoot); if (box.isEmpty()) return;
    var c = box.getCenter(new THREE.Vector3());
    var sizeXZ = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) || 10;
    camera.position.set(c.x, box.max.y + sizeXZ * 1.15, c.z);
    orbit.target.set(c.x, box.min.y, c.z); orbit.update();
  }
  S._enquadrarTopo = enquadrarTopo;
  // modelo removido com a planta ativa: re-ancora y0/y1 no bbox restante (senão o slider ganha zona morta)
  function replanejarCorte() {
    if (!planta.on || !planta.plane) return;
    var box = new THREE.Box3().setFromObject(modelRoot);
    if (box.isEmpty()) { setPlanta(false); return; }
    planta.y0 = box.min.y; planta.y1 = box.max.y;
    var sl = cortePanel.querySelector('[data-c="alt"]');
    setAlturaCorte((sl ? +sl.value : 620) / 1000);
  }
  S._replanejarCorte = replanejarCorte;
  cortePanel.querySelector('[data-c="alt"]').addEventListener('input', function () { setAlturaCorte(this.value / 1000); });
  cortePanel.querySelector('[data-c="cortetec"]').addEventListener('click', function () { ctecIniciar(); });

  // ============================================================
  // ✂️ CORTE LIVRE — plano de corte em QUALQUER orientação, ao vivo
  // (horizontal, vertical N–S/L–O ou ângulo custom: azimute 0–360° + inclinação 0–90°).
  // Diferente da planta, a órbita fica LIVRE: o usuário gira em volta do corte.
  // ============================================================
  var corteL = { on: false, plane: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), az: 0, inc: 0, inv: false, d0: 0, d1: 1 };
  S.corteL = corteL;
  var corteLPanel = document.createElement('div');
  corteLPanel.style.cssText = 'position:absolute;left:10px;bottom:10px;z-index:4;display:none;flex-direction:column;gap:7px;background:rgba(15,39,64,.94);border:1px solid #24435f;border-radius:11px;padding:11px 13px;color:#dbe8f5;font-size:12px;width:240px';
  corteLPanel.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:baseline"><b>✂️ Plano de corte</b><span data-k="v" style="color:#7fe0a3;font-weight:700">—</span></div>' +
    '<div style="display:flex;gap:5px"><button class="btn sm" data-k="ph" style="flex:1">Horizontal</button><button class="btn sm" data-k="pns" style="flex:1">N–S</button><button class="btn sm" data-k="plo" style="flex:1">L–O</button></div>' +
    '<label style="display:flex;justify-content:space-between;font-size:11px;color:#9fb2c8">Ângulo (azimute) <span data-k="azv">0°</span></label>' +
    '<input type="range" data-k="az" min="0" max="359" value="0" style="width:100%;accent-color:#22c55e">' +
    '<label style="display:flex;justify-content:space-between;font-size:11px;color:#9fb2c8">Inclinação (0=vertical, 90=horizontal) <span data-k="incv">0°</span></label>' +
    '<input type="range" data-k="inc" min="0" max="90" value="0" style="width:100%;accent-color:#22c55e">' +
    '<label style="display:flex;justify-content:space-between;font-size:11px;color:#9fb2c8">Posição do corte <span data-k="posv">50%</span></label>' +
    '<input type="range" data-k="pos" min="0" max="1000" value="500" style="width:100%;accent-color:#22c55e">' +
    '<button class="btn sm" data-k="inv" style="width:100%">🔄 Inverter lado visível</button>' +
    '<div style="font-size:11px;color:#9fb2c8">O modelo some do lado cortado conforme você move. Gire a órbita normalmente. A 📏 trena funciona na face do corte.</div>';
  host.appendChild(corteLPanel);
  S.corteLPanel = corteLPanel;
  function corteNormal() {
    var az = corteL.az * Math.PI / 180, inc = corteL.inc * Math.PI / 180;
    return new THREE.Vector3(Math.sin(az) * Math.cos(inc), Math.sin(inc), Math.cos(az) * Math.cos(inc));
  }
  function aplicarCorteL() {
    if (!corteL.on) return;
    var n = corteNormal();
    var box = new THREE.Box3().setFromObject(modelRoot);
    if (box.isEmpty()) { setCorteL(false); return; }
    // faixa da posição = projeção dos 8 cantos do bbox na normal
    var d0 = Infinity, d1 = -Infinity, c = new THREE.Vector3();
    for (var i = 0; i < 8; i++) {
      c.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      var d = n.dot(c); if (d < d0) d0 = d; if (d > d1) d1 = d;
    }
    corteL.d0 = d0; corteL.d1 = d1;
    var frac = (+corteLPanel.querySelector('[data-k="pos"]').value) / 1000;
    var s = d0 + (d1 - d0) * frac;
    // mantém n·p <= s (plano normal -n, constant s); invertido mantém n·p >= s
    if (corteL.inv) { corteL.plane.normal.copy(n); corteL.plane.constant = -s; }
    else { corteL.plane.normal.copy(n).negate(); corteL.plane.constant = s; }
    renderer.localClippingEnabled = true; renderer.clippingPlanes = [corteL.plane];
    corteLPanel.querySelector('[data-k="v"]').textContent = fmtDist(Math.max(0, s - d0));
    corteLPanel.querySelector('[data-k="azv"]').textContent = corteL.az + '°';
    corteLPanel.querySelector('[data-k="incv"]').textContent = corteL.inc + '°';
    corteLPanel.querySelector('[data-k="posv"]').textContent = Math.round(frac * 100) + '%';
  }
  function setCorteL(on) {
    corteL.on = !!on;
    var bc = bar.querySelector('[data-b="corte"]');
    if (on) {
      if (planta.on) setPlanta(false); // disputam o clippingPlanes
      setMode(false); // órbita LIVRE (trena pode ficar)
      var box = new THREE.Box3().setFromObject(modelRoot);
      if (box.isEmpty()) { corteL.on = false; S._hint('Carregue um modelo primeiro.'); return; }
      corteLPanel.style.display = 'flex';
      if (bc) { bc.style.background = '#16a34a'; bc.style.color = '#fff'; }
      aplicarCorteL();
      S._hint('✂️ Corte livre: escolha a direção e arraste a posição — o modelo abre ao vivo. Esc sai.');
    } else {
      renderer.clippingPlanes = []; renderer.localClippingEnabled = false;
      corteLPanel.style.display = 'none';
      if (bc) { bc.style.background = ''; bc.style.color = ''; }
      S._hint(medir.on ? '📏 Trena: clique em 2 pontos do modelo pra medir. Esc sai.' : '');
    }
  }
  S._setCorteL = setCorteL; S._aplicarCorteL = aplicarCorteL;
  corteLPanel.addEventListener('input', function (e) {
    var k = e.target.getAttribute && e.target.getAttribute('data-k');
    if (k === 'az') corteL.az = +e.target.value;
    else if (k === 'inc') corteL.inc = +e.target.value;
    else if (k !== 'pos') return;
    aplicarCorteL();
  });
  corteLPanel.addEventListener('click', function (e) {
    var b = e.target.closest('[data-k]'); if (!b) return; var k = b.getAttribute('data-k');
    function preset(az, inc) { corteL.az = az; corteL.inc = inc; corteLPanel.querySelector('[data-k="az"]').value = az; corteLPanel.querySelector('[data-k="inc"]').value = inc; aplicarCorteL(); }
    if (k === 'ph') preset(0, 90);
    else if (k === 'pns') preset(0, 0);
    else if (k === 'plo') preset(90, 0);
    else if (k === 'inv') { corteL.inv = !corteL.inv; b.style.background = corteL.inv ? '#16a34a' : ''; b.style.color = corteL.inv ? '#fff' : ''; aplicarCorteL(); }
  });

  // ============================================================
  // 🧲 SNAP — a trena (e a linha do corte técnico) "agarram" em pontos notáveis:
  // vértice (fim de linha) > meio de aresta > aresta mais próxima > superfície livre.
  // Configurável por tipo, persistido; indicador visual mostra ONDE e O QUE agarrou.
  // ============================================================
  var snap = { on: true, v: true, m: true, a: true, raio: 14 };
  try { var _sv = JSON.parse(localStorage.getItem('orcapro:bim:snap') || 'null'); if (_sv) { snap.on = !!_sv.on; snap.v = !!_sv.v; snap.m = !!_sv.m; snap.a = !!_sv.a; } } catch (_) {}
  function salvarSnap() { try { localStorage.setItem('orcapro:bim:snap', JSON.stringify({ on: snap.on, v: snap.v, m: snap.m, a: snap.a })); } catch (_) {} }
  S.snap = snap;
  var snapPanel = document.createElement('div');
  snapPanel.style.cssText = 'position:absolute;right:10px;top:52px;z-index:4;display:none;flex-direction:column;gap:7px;background:rgba(15,39,64,.94);border:1px solid #24435f;border-radius:11px;padding:11px 13px;color:#dbe8f5;font-size:12px;width:210px';
  snapPanel.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center"><b>🧲 Snap da trena</b><button class="btn sm" data-s="on" style="padding:2px 9px">ON</button></div>' +
    '<div style="display:flex;gap:5px;flex-wrap:wrap">' +
    '<button class="btn sm" data-s="v" style="flex:1" title="Agarra no fim de linha (canto/vértice)">▪ Vértice</button>' +
    '<button class="btn sm" data-s="m" style="flex:1" title="Agarra no meio da aresta">● Meio</button>' +
    '<button class="btn sm" data-s="a" style="flex:1" title="Agarra no ponto mais próximo da aresta">◆ Aresta</button></div>' +
    '<div style="font-size:11px;color:#9fb2c8">Aproxime o clique de um canto/aresta: a cota agarra no ponto exato (o marcador mostra o tipo). Sem alvo por perto, mede na superfície livre.</div>';
  host.appendChild(snapPanel);
  S.snapPanel = snapPanel;
  function pintarSnapPanel() {
    var cfg = { on: snap.on, v: snap.v, m: snap.m, a: snap.a };
    ['on', 'v', 'm', 'a'].forEach(function (kk) {
      var b = snapPanel.querySelector('[data-s="' + kk + '"]'); if (!b) return;
      b.style.background = cfg[kk] ? '#16a34a' : ''; b.style.color = cfg[kk] ? '#fff' : '';
      if (kk === 'on') b.textContent = cfg.on ? 'ON' : 'OFF';
    });
    var bs = bar.querySelector('[data-b="snap"]'); if (bs) { bs.style.background = snap.on ? '#16a34a' : ''; bs.style.color = snap.on ? '#fff' : ''; bs.style.outline = (snapPanel.style.display === 'flex') ? '2px solid #7fe0a3' : ''; }
  }
  pintarSnapPanel();
  function toggleSnapPanel() { snapPanel.style.display = (snapPanel.style.display === 'none' || !snapPanel.style.display) ? 'flex' : 'none'; pintarSnapPanel(); } // repinta -> botão mostra painel aberto
  snapPanel.addEventListener('click', function (e) {
    var b = e.target.closest('[data-s]'); if (!b) return; var kk = b.getAttribute('data-s');
    if (kk === 'on') snap.on = !snap.on; else snap[kk] = !snap[kk];
    if (!snap.on) esconderSnapMarca();
    salvarSnap(); pintarSnapPanel();
  });
  // marcador HTML (não entra na cena 3D: não é clipado nem raycastado)
  var snapMarca = document.createElement('div');
  snapMarca.style.cssText = 'position:absolute;z-index:5;display:none;pointer-events:none;transform:translate(-50%,-50%)';
  snapMarca.innerHTML = '<div data-sm="ico" style="width:12px;height:12px;border:2px solid #22c55e;margin:0 auto"></div><div data-sm="rot" style="font-size:10px;font-weight:700;color:#7fe0a3;text-shadow:0 1px 2px rgba(0,0,0,.8);text-align:center;margin-top:2px"></div>';
  host.appendChild(snapMarca);
  S.snapMarca = snapMarca;
  var SNAP_VIS = { vertice: { cor: '#22c55e', borda: '0', rot: 'vértice' }, meio: { cor: '#f59e0b', borda: '50%', rot: 'meio' }, aresta: { cor: '#38bdf8', borda: '0', rot: 'aresta' } };
  function mostrarSnapMarca(sn, clientX, clientY) {
    if (!sn || !sn.tipo) { esconderSnapMarca(); return; }
    var rc = canvasEl.getBoundingClientRect(), hr = host.getBoundingClientRect();
    var q = sn.p.clone().project(camera);
    var x = (q.x + 1) / 2 * rc.width + (rc.left - hr.left), y = (1 - q.y) / 2 * rc.height + (rc.top - hr.top);
    var vis = SNAP_VIS[sn.tipo], ico = snapMarca.querySelector('[data-sm="ico"]');
    ico.style.borderColor = vis.cor; ico.style.borderRadius = vis.borda;
    ico.style.transform = sn.tipo === 'aresta' ? 'rotate(45deg)' : '';
    snapMarca.querySelector('[data-sm="rot"]').textContent = vis.rot;
    snapMarca.querySelector('[data-sm="rot"]').style.color = vis.cor;
    snapMarca.style.left = x + 'px'; snapMarca.style.top = y + 'px'; snapMarca.style.display = 'block';
  }
  function esconderSnapMarca() { snapMarca.style.display = 'none'; }
  // cache de arestas por geometria (espaço LOCAL); WeakMap → some junto com a geometria no GC
  var arestasCache = new WeakMap();
  function arestasDe(geo) {
    var c = arestasCache.get(geo);
    if (!c) { try { var e = new THREE.EdgesGeometry(geo, 25); c = e.attributes.position.array.slice(); e.dispose(); } catch (_) { c = new Float32Array(0); } arestasCache.set(geo, c); }
    return c;
  }
  S._arestasDe = arestasDe; // reusado pelo corte técnico (linhas pretas do desenho)
  // scratches DISTINTOS: _snP é EXCLUSIVO do px() (project() muta in-place) — nunca pode ser o mesmo
  // vetor que carrega um candidato (senão o ponto snapado sai em NDC, não em metros). _snM/_snCl
  // são reusados nos loops (o candidato aceito é clonado dentro de testar()).
  var _snA = new THREE.Vector3(), _snB = new THREE.Vector3(), _snM = new THREE.Vector3(), _snCl = new THREE.Vector3(), _snP = new THREE.Vector3(), _snL = new THREE.Line3();
  var SNAP_MAX_VERT = 90000; // malha densa (terreno/mobiliário) trava o hover ao gerar EdgesGeometry -> pula snap
  function aplicarSnap(hit, raioPx) {
    if (!snap.on || !hit || !hit.object || !hit.object.geometry) return { p: hit.point, tipo: null };
    var g = hit.object.geometry, np = (g.attributes && g.attributes.position) ? g.attributes.position.count : 0;
    if (np > SNAP_MAX_VERT) return { p: hit.point, tipo: null }; // elemento pesado: mede na superfície livre
    var arr = arestasDe(g);
    if (!arr.length) return { p: hit.point, tipo: null };
    var raio = raioPx || snap.raio, mw = hit.object.matrixWorld, rc = canvasEl.getBoundingClientRect();
    function px(v) { var q = _snP.copy(v).project(camera); return { x: (q.x + 1) / 2 * rc.width, y: (1 - q.y) / 2 * rc.height }; }
    var alvoPx = px(hit.point), melhor = null;
    function testar(v, tipo, prio) {
      var p2 = px(v), dx = p2.x - alvoPx.x, dy = p2.y - alvoPx.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d > raio) return;
      if (foraDoClip(v)) return; // vértice/aresta do lado CLIPADO (invisível) do corte NÃO pode ser snapado -> cota errada
      if (!melhor || prio > melhor.prio || (prio === melhor.prio && d < melhor.d)) melhor = { p: v.clone(), tipo: tipo, prio: prio, d: d };
    }
    for (var i = 0; i < arr.length; i += 6) {
      _snA.set(arr[i], arr[i + 1], arr[i + 2]).applyMatrix4(mw);
      _snB.set(arr[i + 3], arr[i + 4], arr[i + 5]).applyMatrix4(mw);
      if (snap.v) { testar(_snA, 'vertice', 3); testar(_snB, 'vertice', 3); }
      if (snap.m) { testar(_snM.addVectors(_snA, _snB).multiplyScalar(0.5), 'meio', 2); }
      if (snap.a) { _snL.set(_snA, _snB); testar(_snL.closestPointToPoint(hit.point, true, _snCl), 'aresta', 1); }
    }
    return melhor ? { p: melhor.p, tipo: melhor.tipo } : { p: hit.point, tipo: null };
  }
  function raioToque(e) { return (e && e.pointerType === 'touch') ? 30 : snap.raio; } // dedo tem ~mais incerteza

  // ============================================================
  // 📝 CORTE TÉCNICO — o usuário risca a linha A–A' NA PLANTA e o viewer gera a
  // vista de corte em preto-e-branco estilo desenho técnico, NA ESCALA escolhida
  // (px/m derivado de 96dpi), com carimbo e escala gráfica. Câmera ortográfica
  // perpendicular à linha; near = o próprio plano de corte. MVP honesto: faces
  // cortadas SEM hachura (caps por stencil ficam pra evolução).
  // ============================================================
  var ctec = { ativo: false, pts: [], objs: [] };
  S._tickExtra.push(function () { for (var i = 0; i < ctec.objs.length; i++) rescaleObj(ctec.objs[i]); });
  function ctecLimparDesenho() { ctec.objs.forEach(limparMarca); ctec.objs = []; ctec.pts = []; }
  function ctecIniciar() {
    if (!planta.on) { setPlanta(true); if (!planta.on) return; } // linha se risca NA planta
    ctecLimparDesenho(); ctec.ativo = true;
    S._hint('📝 Clique o 1º ponto da linha de corte (A) sobre a planta.');
  }
  function ctecCancelar(pergunta) {
    var tinha = ctec.ativo || ctecCfg.style.display !== 'none' || ctec.objs.length;
    ctec.ativo = false; ctecLimparDesenho(); ctecCfg.style.display = 'none';
    if (tinha && !pergunta) S._hint('');
    return !!tinha;
  }
  S._ctecCancelar = ctecCancelar;
  function ctecClique(p) {
    ctec.pts.push(p);
    var m = pontoMarca(p); m.material.color.set(0x38bdf8);
    scene.add(m); ctec.objs.push(m); rescaleObj(m);
    var rot = labelSprite(ctec.pts.length === 1 ? 'A' : "A'"); rot.position.copy(p).add(new THREE.Vector3(0, 0.02, 0));
    scene.add(rot); ctec.objs.push(rot); rescaleObj(rot);
    if (ctec.pts.length === 1) { S._hint("📝 Agora clique o 2º ponto (A')."); return; }
    var line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([ctec.pts[0], ctec.pts[1]]), new THREE.LineBasicMaterial({ color: 0x38bdf8, depthTest: false }));
    line.renderOrder = 997; scene.add(line); ctec.objs.push(line);
    ctec.ativo = false;
    ctecCfg.style.display = 'flex'; S._hint('📝 Configure o corte e clique Gerar.');
  }
  // painel de configuração do corte
  var ctecCfg = document.createElement('div');
  ctecCfg.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:6;display:none;flex-direction:column;gap:8px;background:rgba(15,39,64,.97);border:1px solid #24435f;border-radius:12px;padding:14px 16px;color:#dbe8f5;font-size:12px;width:260px;box-shadow:0 12px 34px rgba(0,0,0,.5)';
  ctecCfg.innerHTML =
    '<b>📝 Gerar corte técnico</b>' +
    '<label style="display:flex;justify-content:space-between;align-items:center">Tipo de vista <select data-t="tipo" class="inp" style="width:130px"><option value="corte">Corte (A–A)</option><option value="fachada">Fachada/Elevação</option></select></label>' +
    '<label style="display:flex;justify-content:space-between;align-items:center">Escala <select data-t="esc" class="inp" style="width:130px"><option value="50">1:50</option><option value="75">1:75</option><option value="100" selected>1:100</option><option value="200">1:200</option></select></label>' +
    '<label style="display:flex;justify-content:space-between;align-items:center">Profundidade de visão <input data-t="prof" class="inp" type="number" min="0.5" step="0.5" value="10" style="width:70px"> m</label>' +
    '<label style="display:flex;gap:6px;align-items:center;font-size:12px"><input data-t="inv" type="checkbox"> Olhar para o outro lado</label>' +
    '<div style="font-size:11px;color:#f0b94a;line-height:1.35">⚠ Auxílio visual de coordenação, não substitui o projeto executivo. Faces cortadas SEM hachura; superfícies curvas/tubos podem sair sem contorno. Confira sempre pela escala gráfica.</div>' +
    '<div style="display:flex;gap:6px"><button class="btn sm primary" data-t="gerar" style="flex:1">Gerar</button><button class="btn sm" data-t="cancelar" style="flex:1">Cancelar</button></div>';
  host.appendChild(ctecCfg);
  S.ctecCfg = ctecCfg;
  // modal do resultado
  var ctecModal = document.createElement('div');
  ctecModal.style.cssText = 'position:absolute;inset:0;z-index:7;display:none;align-items:center;justify-content:center;background:rgba(4,12,22,.82)';
  ctecModal.innerHTML =
    '<div style="display:flex;flex-direction:column;gap:9px;max-width:92%;max-height:92%;background:#0f2740;border:1px solid #24435f;border-radius:12px;padding:13px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;color:#dbe8f5;font-size:13px"><b data-r="titulo">Corte técnico</b>' +
    '<span><button class="btn sm" data-r="ajustar" title="Mudar escala/tipo/profundidade sem redesenhar a linha">🔧 Ajustar</button> <button class="btn sm" data-r="imprimir">🖨 Imprimir</button> <button class="btn sm" data-r="baixar">⬇ PNG</button> <button class="btn sm" data-r="fechar">✕</button></span></div>' +
    '<div style="overflow:auto;background:#fff;border-radius:6px;text-align:center"><img data-r="img" style="max-width:100%;display:block;margin:0 auto"></div></div>';
  host.appendChild(ctecModal);
  S.ctecModal = ctecModal;
  // série de escalas padrão de arquitetura (denominadores que existem em escalímetro)
  var SERIE_ESC = [50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 1250, 1500, 2000, 2500];
  function gerarCorteTec(o) {
    // o: {ax,az,bx,bz, escala, tipo:'corte'|'fachada', prof, inv} — coords do MUNDO (metros)
    var box = new THREE.Box3().setFromObject(modelRoot);
    if (box.isEmpty()) return null;
    var dx = o.bx - o.ax, dz = o.bz - o.az, L = Math.sqrt(dx * dx + dz * dz);
    if (L < 0.05) return null;
    var vx = dz / L, vz = -dx / L; if (o.inv) { vx = -vx; vz = -vz; } // direção do olhar (perpendicular à linha)
    var margem = Math.max(0.4, L * 0.03), yMin = box.min.y, yMax = box.max.y;
    var wM = L + margem * 2, hM = (yMax - yMin) + margem * 2;
    var escBase = o.escala || 100, PPM96 = 96 / 25.4;
    // cap honesto pelo que a GPU aguenta. Se a escala pedida estourar, SOBE pra próxima escala da
    // SÉRIE PADRÃO que caiba (escala inteira, medível com escalímetro) e recomputa px/m EXATO a
    // partir dela — assim o carimbo declara a MESMA escala que os pixels representam.
    var MAXPX = Math.min(4096, (renderer.capabilities && renderer.capabilities.maxTextureSize) || 4096);
    var escalaEf = escBase, pxM = PPM96 * (1000 / escalaEf);
    if (Math.max(wM, hM) * pxM > MAXPX) {
      escalaEf = null;
      for (var si = 0; si < SERIE_ESC.length; si++) { if (SERIE_ESC[si] >= escBase && Math.max(wM, hM) * (PPM96 * (1000 / SERIE_ESC[si])) <= MAXPX) { escalaEf = SERIE_ESC[si]; break; } }
      // modelo gigante (nem a maior escala da série cabe): escala contínua, arredondada PRA CIMA
      // (denominador maior -> desenho menor -> cabe garantido) e pxM recomputado EXATO dela -> carimbo==pixels
      if (escalaEf == null) { escalaEf = Math.ceil(PPM96 * 1000 / (MAXPX / Math.max(wM, hM))); pxM = PPM96 * (1000 / escalaEf); }
      else pxM = PPM96 * (1000 / escalaEf);
    }
    var ajustada = escalaEf !== escBase;
    var W = Math.round(wM * pxM), H = Math.round(hM * pxM);
    var cx = (o.ax + o.bx) / 2, cz = (o.az + o.bz) / 2, cy = (yMin + yMax) / 2;
    var diag = box.getSize(new THREE.Vector3()).length();
    var recuo = (o.tipo === 'fachada') ? diag : 0.02; // epsilon > 0 no near evita z-fighting da aresta no plano
    var cam = new THREE.OrthographicCamera(-wM / 2, wM / 2, hM / 2, -hM / 2, 0.01, recuo + ((o.tipo === 'fachada') ? diag * 2 : Math.max(0.5, +o.prof || 10)));
    cam.position.set(cx - vx * recuo, cy, cz - vz * recuo);
    cam.up.set(0, 1, 0); cam.lookAt(cx, cy, cz); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    // snapshot do estado do renderer ANTES do try — o finally SEMPRE restaura (mesmo se um passo lançar)
    var prevClip = renderer.clippingPlanes, prevLocal = renderer.localClippingEnabled;
    var prevClear = renderer.getClearColor(new THREE.Color()).clone(), prevAlpha = renderer.getClearAlpha();
    var prevTone = renderer.toneMapping, prevAuto = renderer.autoClear;
    var rt = new THREE.WebGLRenderTarget(W, H), buf = null, edgesRoot = null, matMassa = null, matLinha = null, escondidos = [];
    try {
      renderer.clippingPlanes = []; renderer.localClippingEnabled = false;
      renderer.toneMapping = THREE.NoToneMapping; // P&B fiel (sem ACES escurecer os cinzas)
      scene.children.forEach(function (c) { if (c !== modelRoot && c.visible !== false) { escondidos.push(c); c.visible = false; } });
      // PASSE 1 — massas cinza-claro sobre branco; polygonOffset empurra as faces no depth p/ as
      // arestas coplanares do passe 2 vencerem sem z-fighting.
      matMassa = new THREE.MeshBasicMaterial({ color: 0xededed, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      scene.overrideMaterial = matMassa;
      renderer.setRenderTarget(rt); renderer.setClearColor(0xffffff, 1); renderer.clear();
      renderer.render(scene, cam);
      scene.overrideMaterial = null;
      // PASSE 2 — arestas pretas (cache local + matrixWorld de cada malha)
      edgesRoot = new THREE.Group(); matLinha = new THREE.LineBasicMaterial({ color: 0x111111 });
      modelRoot.children.forEach(function (g) {
        (g.children || []).forEach(function (m) {
          if (!m.geometry || !cadeiaVisivel(m)) return;
          var arr = arestasDe(m.geometry); if (!arr.length) return;
          var bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
          var ls = new THREE.LineSegments(bg, matLinha);
          ls.matrixAutoUpdate = false; ls.matrix.copy(m.matrixWorld);
          edgesRoot.add(ls);
        });
      });
      scene.add(edgesRoot); modelRoot.visible = false; renderer.autoClear = false;
      renderer.render(scene, cam);
      buf = new Uint8Array(W * H * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
    } finally {
      // restaura o viewer SEMPRE — uma exceção no meio não pode congelar/vazar estado do renderer
      scene.overrideMaterial = null; renderer.autoClear = prevAuto; modelRoot.visible = true;
      if (edgesRoot) { scene.remove(edgesRoot); edgesRoot.children.forEach(function (ls) { if (ls.geometry) ls.geometry.dispose(); }); }
      if (matLinha) matLinha.dispose(); if (matMassa) matMassa.dispose();
      escondidos.forEach(function (c) { c.visible = true; });
      renderer.setRenderTarget(null); try { rt.dispose(); } catch (_) {}
      renderer.clippingPlanes = prevClip; renderer.localClippingEnabled = prevLocal;
      renderer.setClearColor(prevClear, prevAlpha); renderer.toneMapping = prevTone;
    }
    if (!buf) return null;
    // composição 2D: flip vertical (WebGL lê de baixo pra cima) + moldura + carimbo + escala gráfica
    var faixa = 46, cnv = document.createElement('canvas'); cnv.width = W; cnv.height = H + faixa;
    var g2 = cnv.getContext('2d'), img = g2.createImageData(W, H);
    for (var y = 0; y < H; y++) { var srcY = (H - 1 - y) * W * 4; img.data.set(buf.subarray(srcY, srcY + W * 4), y * W * 4); }
    g2.putImageData(img, 0, 0);
    g2.fillStyle = '#fff'; g2.fillRect(0, H, W, faixa);
    g2.strokeStyle = '#111'; g2.lineWidth = 2; g2.strokeRect(1, 1, W - 2, H + faixa - 2); g2.beginPath(); g2.moveTo(1, H); g2.lineTo(W - 1, H); g2.stroke();
    // escala gráfica de 1 m à direita (reserva a faixa antes do carimbo pra não colidir)
    g2.fillStyle = '#111'; var temBarra = pxM >= 8 && pxM < W * 0.45, barW = temBarra ? pxM + 26 : 0;
    if (temBarra) { g2.fillRect(W - pxM - 12, H + 16, pxM, 6); g2.font = '10px Arial'; g2.fillText('1 m', W - pxM - 12, H + 37); }
    // carimbo: encolhe a fonte até caber na largura livre (evita clip/transbordo em desenho estreito)
    var titulo = (o.tipo === 'fachada' ? 'FACHADA' : 'CORTE A–A') + '  ·  ESC 1:' + escalaEf + (ajustada ? ' (ajustada)' : '') + '  ·  OrçaPRO BIM  ·  ' + new Date().toLocaleDateString('pt-BR');
    var livre = W - 16 - barW, fs = 15;
    g2.font = 'bold ' + fs + 'px Arial';
    while (fs > 8 && g2.measureText(titulo).width > livre) { fs--; g2.font = 'bold ' + fs + 'px Arial'; }
    if (g2.measureText(titulo).width > livre) { titulo = 'ESC 1:' + escalaEf + (ajustada ? ' (aj.)' : ''); g2.font = 'bold 11px Arial'; } // fallback mínimo
    g2.fillStyle = '#111'; g2.fillText(titulo, 10, H + 29);
    return { url: cnv.toDataURL('image/png'), w: W, h: H + faixa, escala: escalaEf, pxPorMetro: pxM, ajustada: ajustada, larguraMM: (H + faixa ? W / 96 * 25.4 : 0), alturaMM: (H + faixa) / 96 * 25.4 };
  }
  S._gerarCorteTec = gerarCorteTec;
  ctecCfg.addEventListener('click', function (e) {
    var b = e.target.closest('[data-t]'); if (!b) return; var k = b.getAttribute('data-t');
    if (k === 'cancelar') { ctecCancelar(); return; }
    if (k !== 'gerar') return;
    var a = ctec.pts[0], p2 = ctec.pts[1]; if (!a || !p2) { ctecCancelar(); return; }
    var res = gerarCorteTec({
      ax: a.x, az: a.z, bx: p2.x, bz: p2.z,
      escala: +ctecCfg.querySelector('[data-t="esc"]').value,
      tipo: ctecCfg.querySelector('[data-t="tipo"]').value,
      prof: +ctecCfg.querySelector('[data-t="prof"]').value,
      inv: ctecCfg.querySelector('[data-t="inv"]').checked
    });
    ctecCfg.style.display = 'none';
    if (!res) { ctecIniciar(); S._hint('📝 Linha muito curta — clique o 1º ponto da linha de corte (A) de novo.'); return; } // re-arma (senão a ferramenta fica morta)
    ctecModal._res = res; // guarda p/ imprimir em mm físicos
    ctecModal.querySelector('[data-r="img"]').src = res.url;
    ctecModal.querySelector('[data-r="titulo"]').textContent = (ctecCfg.querySelector('[data-t="tipo"]').value === 'fachada' ? 'Fachada' : 'Corte A–A') + ' — ESC 1:' + res.escala + (res.ajustada ? ' (ajustada p/ caber)' : '');
    ctecModal.style.display = 'flex'; S._hint('');
  });
  S._fecharCtecModal = function () { ctecModal.style.display = 'none'; ctecLimparDesenho(); };
  ctecModal.addEventListener('click', function (e) {
    var b = e.target.closest('[data-r]'); if (!b) return; var k = b.getAttribute('data-r');
    var url = ctecModal.querySelector('[data-r="img"]').src, res = ctecModal._res || {};
    if (k === 'fechar') { S._fecharCtecModal(); }
    else if (k === 'ajustar') { ctecModal.style.display = 'none'; ctecCfg.style.display = 'flex'; S._hint('📝 Ajuste e clique Gerar (a linha A–A foi mantida).'); } // pts preservados
    else if (k === 'baixar') { var aEl = document.createElement('a'); aEl.href = url; aEl.download = 'corte-tecnico.png'; aEl.click(); }
    else if (k === 'imprimir') {
      // imprime na DIMENSÃO FÍSICA (mm) pra a escala do carimbo valer no papel — max-width:100% encolheria
      var w = null; try { w = window.open('', '_blank'); } catch (_) {}
      if (!w) { S._hint('🖨 O navegador bloqueou a janela de impressão — use ⬇ PNG e imprima o arquivo em 100%.'); return; }
      try {
        w.document.write('<!doctype html><meta charset="utf-8"><title>Corte técnico — OrçaPRO BIM</title>' +
          '<style>@page{size:auto;margin:8mm}body{margin:0;font-family:Arial}.av{font-size:12px;color:#444;margin:6px 2px}@media print{.av{display:none}}</style>' +
          '<p class="av">Imprima em <b>100%</b> (sem “ajustar à página”) para a escala do carimbo valer. A escala gráfica de 1 m serve de conferência.</p>' +
          '<img src="' + url + '" style="width:' + (res.larguraMM || 200).toFixed(1) + 'mm;height:' + (res.alturaMM || 150).toFixed(1) + 'mm;display:block" onload="setTimeout(function(){window.print()},300)">');
        w.document.close();
      } catch (_) { S._hint('🖨 Não deu pra abrir a impressão — use ⬇ PNG.'); }
    }
  });

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
    if (S._limparMedidas) S._limparMedidas(); // medidas referenciam coordenadas que podem ter saído
    if (S._ctecCancelar) S._ctecCancelar(); // linha de corte riscada pode referenciar o modelo removido
    if (!S.modelos.length && S.planta && S.planta.on && S._setPlanta) S._setPlanta(false);
    else if (S.planta && S.planta.on && S._replanejarCorte) S._replanejarCorte(); // sobrou modelo: corte re-ancorado
    if (S.corteL && S.corteL.on && S._aplicarCorteL) S._aplicarCorteL(); // re-ancora (ou sai, se o bbox esvaziou)
    if (opts.onLoaded) opts.onLoaded(S.elementos.slice());
    if (!S.modelos.length) over.style.display = 'flex';
  }
  function limparTudo() {
    if (S.planta && S.planta.on && S._setPlanta) S._setPlanta(false);
    if (S.corteL && S.corteL.on && S._setCorteL) S._setCorteL(false);
    if (S._ctecCancelar) S._ctecCancelar();
    if (S._limparMedidas) S._limparMedidas();
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
      if (planta.on) setPlanta(false); // carregar modelo com a planta ativa: sai da planta (senão vista fica incoerente)
      if (corteL.on) setCorteL(false); // idem corte livre (o bbox mudou; o usuário re-corta no modelo federado)
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
  // caminho EXTERNO (gestao.js "ver clash"): sai da Planta/Corte/Trena antes de voar a câmera —
  // senão o clash fica clipado pelo plano de corte e a órbita segue travada ("não funciona")
  if (S.planta && S.planta.on && S._setPlanta) S._setPlanta(false);
  if (S.corteL && S.corteL.on && S._setCorteL) S._setCorteL(false);
  if (S.medir && S.medir.on && S._setMedir) S._setMedir(false);
  if (S._fecharCtecModal && S.ctecModal && S.ctecModal.style.display === 'flex') S._fecharCtecModal(); // modal do resultado tapa o viewer -> fecha antes de voar a câmera
  if (S._ctecCancelar) S._ctecCancelar();
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
  // ---- ferramentas de coordenação ----
  medir: function (on) { if (S && S._setMedir) S._setMedir(on == null ? !(S.medir && S.medir.on) : !!on); },
  get ultimaMedida() { return (S && S.medir && S.medir.ultima) || null; }, // {valor(m), horizontal}
  limparMedidas: function () { if (S && S._limparMedidas) S._limparMedidas(); },
  planta: function (on) { if (S && S._setPlanta) S._setPlanta(on == null ? !(S.planta && S.planta.on) : !!on); },
  corte: function (on) { if (S && S._setCorteL) S._setCorteL(on == null ? !(S.corteL && S.corteL.on) : !!on); },
  corteConfig: function (cfg) { // {az?, inc?, pos0a1?, inv?} — programático/testes
    if (!S || !S.corteL || !S.corteL.on) return;
    if (cfg && cfg.az != null) { S.corteL.az = +cfg.az; var e1 = S.corteLPanel.querySelector('[data-k="az"]'); if (e1) e1.value = +cfg.az; }
    if (cfg && cfg.inc != null) { S.corteL.inc = +cfg.inc; var e2 = S.corteLPanel.querySelector('[data-k="inc"]'); if (e2) e2.value = +cfg.inc; }
    if (cfg && cfg.pos0a1 != null) { var e3 = S.corteLPanel.querySelector('[data-k="pos"]'); if (e3) e3.value = Math.round(Math.max(0, Math.min(1, +cfg.pos0a1)) * 1000); }
    if (cfg && cfg.inv != null) S.corteL.inv = !!cfg.inv;
    if (S._aplicarCorteL) S._aplicarCorteL();
  },
  snapConfig: function (cfg) { // {on?, v?, m?, a?} — liga/desliga tipos de snap
    if (!S || !S.snap) return { on: false };
    ['on', 'v', 'm', 'a'].forEach(function (k) { if (cfg && cfg[k] != null) S.snap[k] = !!cfg[k]; });
    try { localStorage.setItem('orcapro:bim:snap', JSON.stringify({ on: S.snap.on, v: S.snap.v, m: S.snap.m, a: S.snap.a })); } catch (_) {}
    return { on: S.snap.on, v: S.snap.v, m: S.snap.m, a: S.snap.a };
  },
  corteTecnico: function (o) { return (S && S._gerarCorteTec) ? S._gerarCorteTec(o || {}) : null; }, // {ax,az,bx,bz,escala,tipo,prof,inv} -> {url,w,h,escala}
  _snapAt: function (cx, cy) { if (!S || !S._raycastEm) return null; var h = S._raycastEm(cx, cy); if (!h) return null; var sn = S._aplicarSnapRef(h, S.snap ? S.snap.raio : 14); return { tipo: sn.tipo, p: [sn.p.x, sn.p.y, sn.p.z] }; }, // hook de teste: snap num ponto de tela
  _foraDoClip: function (p) { return (S && S._foraDoClipRef) ? S._foraDoClipRef({ x: p[0], y: p[1], z: p[2] }) : false; }, // hook de teste
  _ctecModal: function () { return (S && S.ctecModal) ? S.ctecModal : null; }, // hook de teste: elemento do modal do resultado
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
