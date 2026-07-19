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
// IfcBuildingStorey + IfcRelContainedInSpatialStructure — p/ a ferramenta 🏢 Pavimentos
// (códigos conferidos no vendor bim/vendor/web-ifc-api.js, estáveis no schema)
var IFC_BUILDINGSTOREY = 3124254112, IFC_RELCONTAINEDINSPATIALSTRUCTURE = 3242617779;
// v1.1.82 — família/tipo (IfcRelDefinesByType) + propriedades completas (todos os psets):
// códigos conferidos no vendor (web-ifc-api.js): RELDEFINESBYTYPE 10025, PROPERTYSET 10063,
// ELEMENTQUANTITY 10091, ENUMERATED/LIST/BOUNDED/COMPLEX p/ o painel não descartar nada.
var IFC_RELDEFINESBYTYPE = 781010003, IFC_PROPERTYSET = 1451395588, IFC_ELEMENTQUANTITY = 1883228015;
var IFC_PROP_ENUM = 4166981789, IFC_PROP_LIST = 2752243245, IFC_PROP_BOUNDED = 871118103, IFC_PROP_COMPLEX = 2542286263;

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
    [S.bar, S.barToggle, S.hud, S.over, S.loading, S.renderer.domElement, S.hint, S.cortePanel, S.corteLPanel, S.snapPanel, S.snapMarca, S.ctecCfg, S.ctecModal, S.plantaCfg, S.pavPanel, S.visPanel, S.p3dPanel, S.editPanel, S.editDist, S.xrPanel, S.xrHud].forEach(function (el) { if (el) host.appendChild(el); });
    if (S._onDragOver) { host.addEventListener('dragover', S._onDragOver); host.addEventListener('drop', S._onDrop); } // re-registra drop no host novo
    S.host = host;
    setTimeout(function () { if (S && S._resize) S._resize(); if (S && S._ajustarTop) S._ajustarTop(); if (S && S._aplicarTema) S._aplicarTema(); }, 0); // tema re-aplicado (o fundo acima é só o default até aqui)
    return;
  }
  // CONTEXTO PERDIDO: o viewer antigo morreu (S.alive=false) mas os listeners globais e o
  // renderer continuavam pendurados — cada remount vazava keydown/keyup/mousemove/resize
  // (teclado disparando em dobro) + um WebGLRenderer morto. Desmonta ANTES de criar o novo.
  if (S && !S.alive) desmontarMorto();
  host.innerHTML = '';
  host.style.position = 'relative';
  host.style.background = 'radial-gradient(120% 120% at 50% 0%, #16324f 0%, #0b1a2b 70%)';

  // v1.1.82 — ícones SVG line-art (estilo Revit) no lugar dos emojis: stroke currentColor,
  // 14px, herdam a cor do tema. ico(nome) devolve a tag inline.
  function ico(n) {
    var P = {
      abrir: '<path d="M2 5h4l2 2h6v6H2z"/><path d="M2 5V3h5"/>',
      lixo: '<path d="M4 5h8M6 5V3h4v2M5 5l1 8h4l1-8"/>',
      ultra: '<path d="M8 2l1.6 4.2L14 8l-4.4 1.8L8 14l-1.6-4.2L2 8l4.4-1.8z"/>',
      orbita: '<circle cx="8" cy="8" r="3.4"/><path d="M2.2 10.5C1 8 4 4 8 3.4M13.8 5.5C15 8 12 12 8 12.6"/>',
      voo: '<path d="M2 9l12-5-4 6 4 4-6-2-3 3z"/>',
      medir: '<path d="M2 12L12 2l2 2L4 14z"/><path d="M5 11l1 1M7 9l1 1M9 7l1 1M11 5l1 1"/>',
      area: '<path d="M3 4l10-1 -1 9-9 1z"/><path d="M3 4l9 8"/>',
      angulo: '<path d="M3 13L13 3M3 13h10"/><path d="M7 13a5 5 0 0 0-1.5-3.5"/>',
      snap: '<path d="M4 2v6a4 4 0 0 0 8 0V2"/><path d="M4 2h2M10 2h2"/>',
      cotas: '<path d="M2 8h12M2 6v4M14 6v4M6 8l-2-1.5M6 8l-2 1.5M10 8l2-1.5M10 8l2 1.5"/>',
      planta: '<rect x="3" y="3" width="10" height="10"/><path d="M3 8h5v5"/>',
      corte: '<path d="M2 10L14 4"/><circle cx="4" cy="12" r="1.6"/><circle cx="8" cy="11" r="1.6"/><path d="M9 9l5 3"/>',
      p3d: '<path d="M8 2l5 3v6l-5 3-5-3V5z"/><path d="M8 8l5-3M8 8L3 5M8 8v6"/>',
      editar: '<path d="M3 13l1-3 7-7 2 2-7 7z"/><path d="M10 4l2 2"/>',
      pav: '<path d="M2 12h12M2 9h12M2 6h12"/><path d="M4 12V4h8v8"/>',
      ver: '<path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z"/><circle cx="8" cy="8" r="1.8"/>',
      foto: '<rect x="2" y="4" width="12" height="9" rx="1.5"/><circle cx="8" cy="8.5" r="2.6"/><path d="M5 4l1-1.5h4L11 4"/>',
      fit: '<path d="M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3"/>',
      tema: '<circle cx="8" cy="8" r="5.6"/><path d="M8 2.4v11.2M8 8l4-4M8 8l4 4"/>',
      parede: '<path d="M2 12V6h12v6z"/><path d="M6 6v3M10 9v3M2 9h12"/>',
      laje: '<path d="M2 9l6-3 6 3-6 3z"/><path d="M2 9v2l6 3 6-3V9"/>',
      pilar: '<rect x="6" y="3" width="4" height="10"/><path d="M4 3h8M4 13h8"/>',
      mover: '<path d="M8 2v12M2 8h12M8 2l-2 2M8 2l2 2M8 14l-2-2M8 14l2-2M2 8l2-2M2 8l2 2M14 8l-2-2M14 8l-2 2"/>',
      nota: '<path d="M8 14V7"/><circle cx="8" cy="4.6" r="2.6"/>',
      xr: '<path d="M2 6.5A1.5 1.5 0 0 1 3.5 5h9A1.5 1.5 0 0 1 14 6.5v3A1.5 1.5 0 0 1 12.5 11h-2.2L8 9 5.7 11H3.5A1.5 1.5 0 0 1 2 9.5z"/><circle cx="5" cy="8" r="0.7"/><circle cx="11" cy="8" r="0.7"/>'
    };
    return '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:3px">' + (P[n] || '') + '</svg>';
  }

  // toolbar compacta
  var bar = document.createElement('div');
  bar.style.cssText = 'position:absolute;left:0;right:0;top:0;z-index:3;display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 10px;background:linear-gradient(180deg,rgba(15,39,64,.9),rgba(15,39,64,0))';
  bar.innerHTML =
    '<button class="btn sm primary" data-b="abrir">' + ico('abrir') + '+ IFC</button>' +
    '<button class="btn sm" data-b="exemplo">Exemplo</button>' +
    '<button class="btn sm" data-b="limpar" title="Remove todos os modelos carregados">' + ico('lixo') + '</button>' +
    '<span style="flex:1"></span>' +
    '<button class="btn sm" data-b="ultra" title="Qualidade ultra: nitidez máxima (usa mais GPU)">' + ico('ultra') + 'Ultra</button>' +
    '<button class="btn sm on" data-b="orbita" style="background:#16a34a;color:#fff">' + ico('orbita') + 'Órbita</button>' +
    '<button class="btn sm" data-b="voo">' + ico('voo') + 'Voo</button>' +
    '<button class="btn sm" data-b="medir" title="Trena: clique em 2 pontos do modelo pra medir a distância">' + ico('medir') + 'Medir</button>' +
    '<button class="btn sm" data-b="area" title="Área e perímetro: clique os cantos (3+) e feche clicando de novo no 1º ponto">' + ico('area') + 'Área</button>' +
    '<button class="btn sm" data-b="angulo" title="Ângulo entre 3 pontos: 1º ponto, vértice, 2º ponto">' + ico('angulo') + 'Ângulo</button>' +
    '<button class="btn sm" data-b="snap" title="Snap das medições: agarrar em vértice, meio de aresta ou aresta">' + ico('snap') + '</button>' +
    '<button class="btn sm" data-b="limpar-medidas" title="Apagar todas as cotas medidas" style="display:none">' + ico('cotas') + 'Cotas</button>' +
    '<button class="btn sm" data-b="planta" title="Planta baixa: corta o modelo numa altura e vê de cima">' + ico('planta') + 'Planta</button>' +
    '<button class="btn sm" data-b="corte" title="Corte livre: plano de corte horizontal, vertical ou em qualquer ângulo">' + ico('corte') + 'Corte</button>' +
    '<button class="btn sm" data-b="p3d" title="Reconstruir 3D a partir da planta baixa em DXF (assistido: o sistema propõe as paredes, você confirma)">' + ico('p3d') + '2D→3D</button>' +
    '<button class="btn sm" data-b="editar" title="Editor: criar paredes, lajes e pilares SINTÉTICOS, mover, apagar e anotar — salvo com a obra">' + ico('editar') + 'Editar</button>' +
    '<button class="btn sm" data-b="pav" title="Pavimentos declarados no IFC: isolar um andar ou gerar a planta dele">' + ico('pav') + 'Pav.</button>' +
    '<button class="btn sm" data-b="vis" title="Visibilidade: isolar ou ocultar o elemento selecionado (duplo-clique seleciona)">' + ico('ver') + 'Ver</button>' +
    '<button class="btn sm" data-b="xr" title="Realidade Mista/Virtual: andar dentro do modelo em escala real (1:1) ou escolhida, medir, ver por disciplina e gerar QR para o celular">' + ico('xr') + 'RA/RV</button>' +
    '<button class="btn sm" data-b="foto" title="Salvar foto PNG do modelo com carimbo de data">' + ico('foto') + 'Foto</button>' +
    '<button class="btn sm" data-b="fit">' + ico('fit') + 'Enquadrar</button>' +
    '<button class="btn sm" data-b="tema" title="Cor da interface do BIM: OrçaPRO → Revit → Claro">' + ico('tema') + '</button>' +
    '<input type="file" data-b="file" accept=".ifc" multiple style="display:none">';
  host.appendChild(bar);

  // v1.1.86 — RECOLHER a barra de ferramentas: ela cresceu (quebra em 2+ linhas) e tampava a
  // vista. Um botão discreto no canto esconde/mostra todos os botões; o estado fica salvo.
  var barToggle = document.createElement('button');
  barToggle.className = 'btn sm';
  barToggle.style.cssText = 'position:absolute;right:10px;top:8px;z-index:5;padding:5px 9px;font-size:12px;opacity:.94;box-shadow:0 2px 8px rgba(0,0,0,.35)';
  barToggle.title = 'Mostrar ou esconder a barra de ferramentas (deixa a vista limpa)';
  // no celular a barra (20 botões) tampava metade da tela → começa RECOLHIDA por padrão em tela
  // pequena; no PC começa aberta. A escolha do usuário (se ele mexer) manda daí pra frente.
  var barraAberta = (host.clientWidth || window.innerWidth || 1024) > 640;
  try { var _pref = localStorage.getItem('orcapro:bim:barra'); if (_pref) barraAberta = _pref !== 'recolhida'; } catch (_) {}
  function setBarra(aberta) {
    barraAberta = !!aberta;
    bar.style.display = aberta ? 'flex' : 'none';
    barToggle.innerHTML = aberta ? '⤢ Esconder' : '🧰 Ferramentas';
    try { localStorage.setItem('orcapro:bim:barra', aberta ? 'aberta' : 'recolhida'); } catch (_) {}
    if (S && S._ajustarTop) S._ajustarTop();
  }
  barToggle.addEventListener('click', function () { setBarra(!barraAberta); });
  host.appendChild(barToggle);
  setBarra(barraAberta); // aplica o estado salvo (S._ajustarTop roda depois no setup)

  // v1.1.82 — TEMA de cores da interface do BIM (escolha do usuário; 'revit' = o look do Revit)
  var TEMAS = {
    orcapro: { nome: 'OrçaPRO', ativo: '#16a34a', bar: 'linear-gradient(180deg,rgba(15,39,64,.9),rgba(15,39,64,0))', painel: 'rgba(15,39,64,.97)', borda: '#24435f', texto: '#dbe8f5', fundo: 'radial-gradient(120% 120% at 50% 0%, #16324f 0%, #0b1a2b 70%)' },
    revit: { nome: 'Revit', ativo: '#1858A8', bar: 'linear-gradient(180deg,rgba(59,68,75,.96),rgba(59,68,75,0))', painel: 'rgba(42,49,56,.97)', borda: '#565f66', texto: '#e8eaec', fundo: 'radial-gradient(120% 120% at 50% 0%, #4a5158 0%, #2e343a 70%)' },
    claro: { nome: 'Claro', ativo: '#0e7490', bar: 'linear-gradient(180deg,rgba(235,241,247,.95),rgba(235,241,247,0))', painel: 'rgba(248,250,252,.98)', borda: '#c4d0dc', texto: '#1a2b3c', fundo: 'radial-gradient(120% 120% at 50% 0%, #e6edf4 0%, #c9d6e3 70%)' }
  };
  var temaId = 'orcapro';
  try { var t0 = localStorage.getItem('orcapro:bim:tema'); if (t0 && TEMAS[t0]) temaId = t0; } catch (_) {}
  function corAtiva() { return TEMAS[temaId].ativo; }
  function aplicarTema() {
    var T = TEMAS[temaId];
    var h2 = (S && S.host) || host; // re-home troca o host — o closure original aponta pro morto
    h2.style.background = (S && S._estiloOn && S._estiloOn()) ? '#fff' : T.fundo; // estilo desenho segura o branco
    bar.style.background = T.bar;
    bar.style.color = T.texto;
    [S.editPanel, S.snapPanel, S.pavPanel, S.visPanel, S.editDist, S.p3dPanel].forEach(function (pn) {
      if (!pn) return;
      pn.style.background = T.painel; pn.style.borderColor = T.borda; pn.style.color = T.texto;
      // re-pinta os toggles ativos DOS PAINÉIS também (chain/orto/ângulo/sub-ferramenta)
      pn.querySelectorAll && pn.querySelectorAll('button').forEach(function (b3) { if (b3.style.background && b3.style.background !== '') b3.style.background = corAtiva(); });
    });
    // re-pinta os botões da toolbar que estavam com a cor ativa antiga (estado ligado sobrevive à troca)
    bar.querySelectorAll('button').forEach(function (b2) { if (b2.style.background && b2.style.background !== '') b2.style.background = corAtiva(); });
    try { localStorage.setItem('orcapro:bim:tema', temaId); } catch (_) {}
  }
  function trocarTema() {
    temaId = temaId === 'orcapro' ? 'revit' : (temaId === 'revit' ? 'claro' : 'orcapro');
    aplicarTema();
    if (S && S._hint) S._hint('🎨 Tema: ' + TEMAS[temaId].nome);
  }
  // aplica DEPOIS que S e todos os painéis nasceram (este bloco roda antes da criação do S)
  setTimeout(function () { if (S && S.alive) { S._aplicarTema = aplicarTema; aplicarTema(); } }, 0);

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
  // sombras suaves (qualidade de render + imersão RA/RV) e WebXR habilitado no renderer
  try { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; } catch (_) {}
  try { renderer.xr.enabled = true; } catch (_) {}
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;outline:none';
  host.appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', function (e) { e.preventDefault(); if (S) { S.alive = false; if (S.raf) cancelAnimationFrame(S.raf); } try { over.style.display = 'flex'; over.querySelector('div').innerHTML = '<div style="font-size:30px">🧊</div><h3 style="margin:8px 0">O 3D ficou pesado demais</h3><p style="color:#a9c1d8;font-size:13px">A memória de vídeo esgotou (modelos grandes / Ultra). Recarregue a aba BIM com menos modelos, ou desligue o ✨ Ultra.</p>'; } catch (_) {} }, false);
  var hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.55); scene.add(hemi); // reduzido: o ambiente PMREM abaixo faz o preenchimento
  var dir = new THREE.DirectionalLight(0xffffff, 1.0); dir.position.set(30, 50, 20); scene.add(dir);
  // v1.1.89 — ILUMINAÇÃO BASEADA EM IMAGEM (PMREM): reflexos suaves + shading premium em TODO
  // MeshStandardMaterial (o "look de render" dos melhores visualizadores). Custo ~zero por frame
  // (a env é pré-computada 1×). Os desenhos técnicos (corte/planta) usam material UNLIT (MeshBasic)
  // e NÃO são afetados. Um estúdio procedural (sala + luzes-área) vira a environment map.
  try {
    var _pmrem = new THREE.PMREMGenerator(renderer);
    var _envScn = new THREE.Scene();
    var _room = new THREE.Mesh(new THREE.BoxGeometry(24, 18, 24), new THREE.MeshStandardMaterial({ side: THREE.BackSide, roughness: 1, metalness: 0, color: 0x9fb0c4 }));
    _envScn.add(_room);
    var _areaLuz = function (cor, w, h, d, x, y, z, ganho) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial()); m.material.color.setHex(cor).multiplyScalar(ganho); m.position.set(x, y, z); return m; };
    _envScn.add(_areaLuz(0xffffff, 16, 1, 16, 0, 8.5, 0, 3.0));    // teto claro (luz principal difusa)
    _envScn.add(_areaLuz(0xdfeaf7, 1, 10, 12, -11.5, 2, -3, 1.6)); // parede fria à esquerda
    _envScn.add(_areaLuz(0xfff0dc, 1, 10, 12, 11.5, 2, 4, 1.3));   // parede quente à direita
    _envScn.add(_areaLuz(0xc4d0dd, 16, 1, 16, 0, -8.5, 0, 0.6));   // piso claro (bounce de baixo)
    var _envRT = _pmrem.fromScene(_envScn, 0.04);
    scene.environment = _envRT.texture;
    _room.geometry.dispose(); _envScn.traverse(function (o) { if (o.material && o.material.dispose) o.material.dispose(); if (o.geometry && o.geometry.dispose) o.geometry.dispose(); });
    _pmrem.dispose();
  } catch (eEnv) { /* sem env: cai no shading direto — nunca impede o viewer */ }
  // sombra da luz principal (ligada só quando o usuário entra no imersivo — custa GPU no modelo grande)
  try { dir.shadow.mapSize.set(2048, 2048); dir.shadow.camera.near = 1; dir.shadow.camera.far = 400; dir.shadow.bias = -0.0005; var _ds = dir.shadow.camera; _ds.left = -80; _ds.right = 80; _ds.top = 80; _ds.bottom = -80; _ds.updateProjectionMatrix(); } catch (_) {}
  var fill = new THREE.DirectionalLight(0xbfd8ee, 0.35); fill.position.set(-40, 25, -30); scene.add(fill); // luz de preenchimento (sombra menos chapada)
  var grid = new THREE.GridHelper(200, 40, 0x2e6f9e, 0x1c3a58); grid.material.opacity = .5; grid.material.transparent = true; scene.add(grid);
  // ---- sombra de contato (blob radial macio sob o modelo — "assenta" o prédio no chão, barato p/ mobile) ----
  var _chaoTex = (function () {
    var c = document.createElement('canvas'); c.width = c.height = 256; var g = c.getContext('2d');
    var rg = g.createRadialGradient(128, 128, 8, 128, 128, 126);
    rg.addColorStop(0, 'rgba(0,0,0,.42)'); rg.addColorStop(.55, 'rgba(0,0,0,.20)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
    var t = new THREE.CanvasTexture(c); return t;
  })();
  var _chao = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: _chaoTex, transparent: true, depthWrite: false, opacity: .9 }));
  _chao.rotation.x = -Math.PI / 2; _chao.renderOrder = -1; _chao.raycast = function () {}; scene.add(_chao);
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
  var Sm = S; // instância DESTE mount — guard de identidade p/ closures assíncronas (FileReader/fetch em voo de um viewer morto não podem poluir o viewer novo)
  S.barToggle = barToggle; S._setBarra = setBarra; // recolher/expandir a barra (entra no re-home)

  function resize() { var w = host.clientWidth, h = host.clientHeight; if (w && h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); } }
  S._resize = resize; window.addEventListener('resize', resize); resize();

  // ---- voo ----
  var canvasEl = renderer.domElement, fly = S.fly, _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  function setMode(voo) {
    if (S._cancelTween) S._cancelTween(); // qualquer troca de modo (Voo/Órbita e — via setMode(false) — Planta/Corte/Caminhar) cancela o voo cinematográfico pendente
    fly.on = voo; orbit.enabled = !voo;
    bar.querySelector('[data-b="voo"]').classList.toggle('on', voo);
    bar.querySelector('[data-b="voo"]').style.background = voo ? corAtiva() : '';
    bar.querySelector('[data-b="voo"]').style.color = voo ? '#fff' : '';
    bar.querySelector('[data-b="orbita"]').style.background = voo ? '' : corAtiva();
    bar.querySelector('[data-b="orbita"]').style.color = voo ? '' : '#fff';
    if (!voo && document.pointerLockElement) document.exitPointerLock();
  }
  S._setMode = setMode;
  canvasEl.addEventListener('click', function () { if (fly.on && !document.pointerLockElement) canvasEl.requestPointerLock(); });
  S._onKeyDown = function (e) { fly.keys[e.code] = true; if (e.code === 'Escape') { if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) { if (S && S.host && S.host.contains(e.target)) e.target.blur(); return; } if (S.ctecModal && S.ctecModal.style.display === 'flex' && S._fecharCtecModal) { S._fecharCtecModal(); return; } if (S.plantaCfg && S.plantaCfg.style.display !== 'none') { S.plantaCfg.style.display = 'none'; return; } if (S.xr && S.xr.on && S._sairImersivo) { S._sairImersivo(); return; } if (S._ctecCancelar && S._ctecCancelar(true)) return; if (fly.on) setMode(false); if (S.medir && S.medir.on) S._setMedir(false); if (S.area && S.area.on && S._setArea) S._setArea(false); if (S.ang && S.ang.on && S._setAng) S._setAng(false); if (S.planta && S.planta.on) S._setPlanta(false); if (S.corteL && S.corteL.on && S._setCorteL) S._setCorteL(false); if (S.edit && S.edit.on) { if (S.edit.p1 && S._editFimCadeia) { S._editFimCadeia(); return; } if (S._setEdit) S._setEdit(false); } } };
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
  // corpo de 1 quadro: reusado pelo rAF normal E pelo setAnimationLoop do WebXR (sessão VR/AR)
  function renderFrame(dt) {
    if (S._xrWalk) S._xrWalk(dt);          // locomoção do imersivo (andar) — tem prioridade
    else if (fly.on) flyStep(dt); else orbit.update();
    for (var tx = 0; tx < S._tickExtra.length; tx++) { try { S._tickExtra[tx](dt); } catch (_) {} }
    renderer.render(scene, camera);
  }
  function tick() { if (!S || !S.alive) return; if (S._xrActive) { S.raf = 0; return; } var dt = Math.min(clock.getDelta(), 0.1); renderFrame(dt); S.raf = requestAnimationFrame(tick); }
  S._renderFrame = renderFrame; S._retomarTick = function () { if (S && S.alive && !S._xrActive && !S.raf) tick(); };
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
    if (S.edit && S.edit.on && S.edit.sub) return; // desenhando: duplo-clique não seleciona nem abre painel
    if (ctec.ativo) return; // riscando a linha de corte, clique é ponto — não seleção (ANTES de area/ang: mesma ordem do pointerup)
    if (S.medir && S.medir.on) return; // no modo trena o duplo-clique é medição, não seleção
    if (area.on) { if (area.pts.length >= 3) fecharArea(); return; } // no modo área o duplo-clique FECHA o polígono
    if (ang.on) return; // no modo ângulo o clique é ponto — não seleção
    if (S._limparRaioX) S._limparRaioX(); // nova seleção reseta o raio-X (senão o ghostMat vaza pro prevMat)
    var r = canvasEl.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1; mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(mouse, camera);
    var hit = primeiroHit(ray.intersectObjects(modelRoot.children, true));
    if (S.selected) { S.selected.material = S.prevMat; S.selected = null; }
    if (hit && hit.object.userData && hit.object.userData.expressID != null) {
      S.selected = hit.object; S.prevMat = S.selected.material; S.selected.material = selMat;
      contornoSelecao(hit.object); // v1.1.89 — contorno nítido na seleção
      if (!fly.on && !xr.on && !planta.on && !corteL.on) enquadrarObj(new THREE.Box3().setFromObject(hit.object), 2.6); // foco cinematográfico — NÃO na planta/corte (quebraria a moldura travada)
      if (opts.onPick) opts.onPick(propsDe(hit.object.userData.mid != null ? hit.object.userData.mid : S.modelID, hit.object.userData.expressID, hit.object.userData.tipo));
    } else if (opts.onPick) { contornoSelecao(null); opts.onPick(null); }
  });

  // ---- navegação cinematográfica: tween suave de câmera (fly-to / enquadrar) ----
  var _cvT = null; // tween ativo
  function cancelTween() { _cvT = null; } // trocar de modo (voo/planta/corte/caminhar/enquadrar) cancela o voo pendente — senão o tween sobrescreve a câmera do modo novo por ~0,55s (gate v1.1.89)
  S._cancelTween = cancelTween;
  function voarCam(destPos, destTgt, dur) {
    if (!destPos) return;
    _cvT = { p0: camera.position.clone(), p1: destPos.clone(), t0: orbit.target.clone(), t1: (destTgt || orbit.target).clone(), dur: Math.max(0.15, dur || 0.6), e: 0 };
  }
  S._tickExtra.push(function (dt) {
    if (!_cvT) return;
    _cvT.e += dt; var k = Math.min(1, _cvT.e / _cvT.dur);
    var s = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // easeInOutQuad
    camera.position.lerpVectors(_cvT.p0, _cvT.p1, s);
    orbit.target.lerpVectors(_cvT.t0, _cvT.t1, s);
    if (k >= 1) _cvT = null;
  });
  // enquadra um box (elemento ou modelo) com voo suave, mantendo a direção de visão atual
  function enquadrarObj(box, fator) {
    if (!box || box.isEmpty()) return;
    var c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    var raio = Math.max(sz.x, sz.y, sz.z, 0.5) * 0.5;
    var dist = (raio / Math.tan((camera.fov * Math.PI / 180) / 2)) * (fator || 1.6);
    var dir = camera.position.clone().sub(orbit.target); if (dir.lengthSq() < 1e-6) dir.set(0.7, 0.55, 0.8); dir.normalize();
    // afrouxa o near ao aproximar de elemento pequeno em modelo grande (near travado em maxDim/1000 cortaria a frente) — só DIMINUI, nunca aumenta (não some o resto do modelo)
    var near = Math.max(0.01, (dist - raio) * 0.5); if (near < camera.near) { camera.near = near; camera.updateProjectionMatrix(); }
    voarCam(c.clone().add(dir.multiplyScalar(dist)), c, 0.55);
  }
  S._enquadrarObj = enquadrarObj; S._voarCam = voarCam;

  // ---- contorno nítido na seleção (lê claro em qualquer fundo, estilo visualizador pro) ----
  var _selLn = null, _selLnMat = null;
  function contornoSelecao(mesh) {
    if (_selLn) { scene.remove(_selLn); if (_selLn.geometry) _selLn.geometry.dispose(); _selLn = null; }
    if (!mesh || !mesh.geometry) return;
    if (mesh.geometry.attributes && mesh.geometry.attributes.position && mesh.geometry.attributes.position.count > 60000) return; // malha densa: sem contorno (EdgesGeometry travaria)
    var arr = arestasDe(mesh.geometry); if (!arr.length) return;
    if (!_selLnMat) _selLnMat = new THREE.LineBasicMaterial({ color: 0x2effa0, depthTest: false, transparent: true, opacity: 0.95 });
    var bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    var ln = new THREE.LineSegments(bg, _selLnMat);
    ln.matrixAutoUpdate = false; ln.matrix.copy(mesh.matrixWorld); ln.renderOrder = 1000; ln.raycast = function () {};
    scene.add(ln); _selLn = ln;
  }
  S._contornoSelecao = contornoSelecao;
  // o contorno é um overlay independente na cena (depthTest:false): compõe a visibilidade do elemento
  // selecionado a cada frame (some quando ele fica invisível no 4D, no toggle de modelo, isolar etc.) — regra de ouro
  S._tickExtra.push(function () { if (_selLn) _selLn.visible = !!(S.selected && cadeiaVisivel(S.selected)); });

  // ---- toolbar ----
  bar.addEventListener('click', function (e) {
    var b = e.target.closest('[data-b]'); if (!b) return; var k = b.getAttribute('data-b');
    if (k === 'abrir') bar.querySelector('[data-b="file"]').click();
    else if (k === 'exemplo') carregarExemplo();
    else if (k === 'limpar') limparTudo();
    else if (k === 'tema') trocarTema();
    else if (k === 'ultra') setUltra(!S.ultra);
    // Órbita/Voo SEMPRE encerram as ferramentas (exclusividade nos 2 sentidos); Medir pode
    // coexistir com Planta/Corte (medir na planta e na face do corte é o uso pedido)
    else if (k === 'orbita') { sairFerramentas(); setMode(false); }
    else if (k === 'voo') { sairFerramentas(); setMode(true); }
    else if (k === 'medir') setMedir(!medir.on);
    else if (k === 'area') setArea(!area.on);
    else if (k === 'angulo') setAng(!ang.on);
    else if (k === 'snap') toggleSnapPanel();
    else if (k === 'planta') setPlanta(!planta.on);
    else if (k === 'corte') setCorteL(!corteL.on);
    else if (k === 'p3d') toggleP3dPanel();
    else if (k === 'editar') setEdit(!edit.on);
    else if (k === 'pav') togglePavPanel();
    else if (k === 'vis') toggleVisPanel();
    else if (k === 'xr') toggleXRPanel();
    else if (k === 'foto') tirarFoto();
    else if (k === 'limpar-medidas') { if (S._limparMedidas) S._limparMedidas(); }
    else if (k === 'fit') { if (planta.on) enquadrarTopo(); else if (S._enquadrarObj && !fly.on && !xr.on) S._enquadrarObj(new THREE.Box3().setFromObject(modelRoot), 1.5); else enquadrar(); } // na planta re-centra a vista de topo (não sai); no 3D enquadra suave (cinematográfico)
  });
  // MATRIZ MODOS×SAÍDAS (manter em dia ao criar modo novo — regra aprendida no gate v1.1.64):
  //                    medir/area/ang  planta  corteL  ctec(desenho)  isolamento(pav/vis)
  // botão Órbita/Voo    sai            sai     sai     cancela        fica (só visibilidade)
  // Esc                 sai            sai     sai     cancela 1º     fica
  // focarClash          sai            sai     sai     cancela        clash força visible=true nos dele
  // carregarIFC         —              sai     sai     —              restaura (modelo novo nasce visível)
  // removerModelo       limpa          re-ancora re-ancora cancela    restaura se isolado
  // limparTudo          limpa          sai     sai     cancela        restaura
  // fit (Enquadrar)     —              sai     —       —              fica
  // entrar em planta    —              ·       sai     —              fica (planta do pavimento USA isolamento)
  // entrar em corteL    —              sai     ·       cancela-se-via-planta  fica
  // medir/area/ang      exclusivos ENTRE SI    —       —              coexistem com planta/corte
  // aplicarEstado(4D)/mostrarTudo (externos)                          limpam o marcador de isolamento
  // Órbita/Voo SEMPRE encerram o editor INTEIRO (setEdit(false) já limpa a cadeia via editTirarProv);
  // o "Esc encerra só o traço" vive APENAS no handler de Escape — aqui um return deixaria o editor
  // armado com o voo ligado (clique em pointerlock criaria parede acidental persistida)
  function sairFerramentas() { if (S._fecharCtecModal && ctecModal.style.display === 'flex') S._fecharCtecModal(); ctecCancelar(); if (medir.on) setMedir(false); if (area.on) setArea(false); if (ang.on) setAng(false); if (planta.on) setPlanta(false); if (corteL.on) setCorteL(false); if (S.edit && S.edit.on && S._setEdit) S._setEdit(false); if (S.xr && S.xr.on && S._sairImersivo) S._sairImersivo(); } // fecha o modal do resultado + cobre o estágio "config aberta"
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
    var moS = modeloDe(mid);
    if (moS && moS.sintetico) { // sintético não existe no wasm (GetLine com mid string sondaria o modelo 0 REAL)
      var elS = null; for (var q3 = 0; q3 < moS.elementos.length; q3++) if (moS.elementos[q3].id === expressID) { elS = moS.elementos[q3]; break; }
      var qS = (moS.qto && moS.qto[expressID]) || {};
      // v1.1.82: mesmo CONTRATO do ramo IFC (uid/mid/tipo real/qto) — Propriedades/Salvar família
      // funcionam também pro que foi criado no OrçaPRO (editor ✏️ e 2D→3D)
      return { id: expressID, mid: mid, uid: mid + ':' + expressID, nome: (elS && elS.nome) || 'Parede',
        tipo: (elS && elS.tipo) || 'IFCWALL', globalId: moS.editor ? 'criado no OrçaPRO' : '2D→3D', tag: '',
        familia: (elS && elS.nome) || '', etapa: '', codOrc: '', fase: '',
        qto: qS, area: qS.area, comprimento: qS.comprimento };
    }
    try {
      var line = S.api.GetLine(mid, expressID, true);
      var nome = (line.Name && line.Name.value) || '—';
      var tipo = tipoCache || nomeTipo(S.api.GetLineType(mid, expressID));
      var gid = (line.GlobalId && line.GlobalId.value) || '—';
      var moP = modeloDe(mid);
      var cb = (moP && moP.carimbos && moP.carimbos[expressID]) || {};
      var famP = (moP && moP.familias && moP.familias[expressID]) || null;
      var qtoP = (moP && moP.qto && moP.qto[expressID]) || null;
      return { id: expressID, mid: mid, uid: mid + ':' + expressID, nome: nome, tipo: tipo, globalId: gid, tag: (line.Tag && line.Tag.value) || '',
        familia: famP ? famP.familia : ((line.ObjectType && line.ObjectType.value) || ''),
        etapa: cb.etapa || '', codOrc: cb.codOrc || '', fase: cb.fase || '', qto: qtoP };
    } catch (e) { return { id: expressID, mid: mid, uid: mid + ':' + expressID, nome: '—', tipo: tipoCache || '', globalId: '', familia: '', etapa: '', codOrc: '', fase: '', qto: null }; }
  }
  function nomeTipo(num) { var raw = ''; try { if (S.api.GetNameFromTypeCode) raw = S.api.GetNameFromTypeCode(num); } catch (_) {} return raw || ('IFC#' + num); }

  // grid + sombra de contato acompanham a pegada atual de modelRoot (chamado por enquadrar E por removerModelo, sem mexer na câmera)
  function reposicionarChao() {
    var box = new THREE.Box3().setFromObject(modelRoot); if (box.isEmpty()) return;
    var size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    grid.position.y = box.min.y;
    var fp = Math.max(size.x, size.z) * 1.3 || 20; // folga de 30% na pegada
    _chao.scale.set(fp, fp, 1); _chao.position.set(center.x, box.min.y + 0.01, center.z);
  }
  S._reposicionarChao = reposicionarChao;
  function enquadrar() {
    if (S._cancelTween) S._cancelTween(); // fit instantâneo cancela voo pendente (senão o tween sobrescreve)
    var box = new THREE.Box3().setFromObject(modelRoot); if (box.isEmpty()) return;
    var size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    var maxDim = Math.max(size.x, size.y, size.z) || 10, dist = maxDim * 1.6;
    camera.position.set(center.x + dist * .7, center.y + dist * .6, center.z + dist * .7);
    camera.near = maxDim / 1000; camera.far = maxDim * 100; camera.updateProjectionMatrix();
    orbit.target.copy(center); orbit.update();
    fly.yaw = Math.atan2(camera.position.x - center.x, camera.position.z - center.z); fly.pitch = -0.35;
    reposicionarChao();
  }
  S._enquadrar = enquadrar;

  // ============================================================
  // Dica flutuante (usada pela trena e pela planta baixa)
  // ============================================================
  var hint = document.createElement('div');
  hint.setAttribute('data-bim', 'hint'); // âncora estável p/ testes/depuração
  hint.style.cssText = 'position:absolute;left:50%;top:52px;transform:translateX(-50%);z-index:4;display:none;pointer-events:none;background:rgba(34,197,94,.94);color:#04240f;font-weight:600;font-size:12.5px;padding:7px 15px;border-radius:20px;box-shadow:0 6px 16px rgba(0,0,0,.35);max-width:90%;text-align:center';
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
  function btnCotas() { var b = bar.querySelector('[data-b="limpar-medidas"]'); if (b) b.style.display = medir.objs.length ? '' : 'none'; if (S && S._ajustarTop) S._ajustarTop(); } // botão entra/sai -> a barra (flex-wrap) pode mudar de altura
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
  function limparMedidas() { medir.prov = null; area.pts = []; area.tmp = []; ang.pts = []; ang.tmp = []; medir.objs.forEach(limparMarca); medir.objs = []; medir.pts = []; btnCotas(); }
  S._limparMedidas = limparMedidas;
  // cursor único p/ as 3 ferramentas de medição (trena/área/ângulo)
  function atualizarCursor() { canvasEl.style.cursor = (medir.on || area.on || ang.on) ? 'crosshair' : ''; }
  function setMedir(on) {
    medir.on = !!on;
    if (on) { setMode(false); if (area.on) setArea(false); if (ang.on) setAng(false); if (edit && edit.on) setEdit(false); } // pode coexistir com Planta/Corte; exclusivo entre medições e editor
    else { medir.pts = []; tirarProv(); btnCotas(); esconderSnapMarca(); } // sai: descarta 1º ponto pendente
    var bm = bar.querySelector('[data-b="medir"]'); if (bm) { bm.style.background = on ? corAtiva() : ''; bm.style.color = on ? '#fff' : ''; }
    atualizarCursor();
    S._hint(on ? (planta.on ? '📏 Trena na planta: clique em 2 pontos — a cota é a distância horizontal.' : '📏 Trena: clique em 2 pontos do modelo pra medir. Esc sai.') : (planta.on ? '📐 Planta baixa. Ajuste a altura do corte no painel.' : ''));
  }
  S._setMedir = setMedir;
  // captura por CLIQUE-SEM-ARRASTE (não atrapalha a órbita: se arrastou, é rotação).
  // O MESMO caminho serve a trena e o desenho da linha do corte técnico — ambos com snap.
  var _ultimosHits = []; // objetos DISTINTOS visíveis/não-clipados do último raio (o snap de ✚ interseção usa até 2)
  function raycastEm(clientX, clientY) {
    var rc = canvasEl.getBoundingClientRect();
    mouse.x = ((clientX - rc.left) / rc.width) * 2 - 1; mouse.y = -((clientY - rc.top) / rc.height) * 2 + 1;
    ray.setFromCamera(mouse, camera);
    var hits = ray.intersectObjects(modelRoot.children, true);
    _ultimosHits = [];
    for (var hh = 0; hh < hits.length && _ultimosHits.length < 2; hh++) {
      if (!cadeiaVisivel(hits[hh].object) || foraDoClip(hits[hh].point)) continue;
      if (_ultimosHits.length && _ultimosHits[0].object === hits[hh].object) continue; // 2º OBJETO distinto (canto parede×viga)
      _ultimosHits.push(hits[hh]);
    }
    return _ultimosHits[0] || null;
  }
  S._raycastEm = raycastEm; S._aplicarSnapRef = function (h, r) { return aplicarSnap(h, r); }; S._foraDoClipRef = foraDoClip; // hooks p/ E2E
  function ferramentaClique() { return medir.on || area.on || ang.on || ctec.ativo || (S.edit && S.edit.on); } // quem consome clique-sem-arraste (editor SEM sub-ferramenta = clique mostra parâmetros)
  // GUARD ÚNICO anti-ponto-fantasma (gate v1.1.69): quando um clique FECHA uma medição/linha
  // (área, ângulo, trena, corte técnico), o pointerup IRMÃO do duplo-clique chegaria <400ms
  // depois NO MESMO LUGAR e plantaria o 1º ponto da próxima medição — silenciosamente errada.
  // Temporal+ESPACIAL (<20px): não pune usuário rápido clicando em outro canto.
  var toolFechou = null, _upAtual = null;
  function marcarFechamento() { toolFechou = _upAtual ? { x: _upAtual.x, y: _upAtual.y, t: performance.now() } : { x: -1e9, y: -1e9, t: performance.now() }; }
  canvasEl.addEventListener('pointerdown', function (e) { if (!S || !S.alive) return; if (ferramentaClique()) medir.down = (e.button === 0) ? { x: e.clientX, y: e.clientY } : null; });
  canvasEl.addEventListener('pointerup', function (e) {
    if (!S || !S.alive) return;
    if (!ferramentaClique() || !medir.down || e.button !== 0) return; // só botão esquerdo/toque
    var dx = e.clientX - medir.down.x, dy = e.clientY - medir.down.y; medir.down = null;
    if (dx * dx + dy * dy > 100) return; // arrastou (>10px) -> era órbita; tolerância p/ toque (tablet)
    if (toolFechou && performance.now() - toolFechou.t < 400) {
      var fdx = e.clientX - toolFechou.x, fdy = e.clientY - toolFechou.y;
      // irmão do duplo-clique: o navegador marca com detail>=2 (contagem de cliques); o critério
      // espacial <6px cobre double-tap de toque. Clique intencional (outra posição/1º clique) passa.
      if (e.detail >= 2 || fdx * fdx + fdy * fdy < 36) return;
    }
    _upAtual = { x: e.clientX, y: e.clientY };
    var hit = raycastEm(e.clientX, e.clientY);
    if (S.edit && S.edit.on && S.edit.sub) { editClique(e, hit); return; } // editor: aceita hit OU plano do chão
    if (S.edit && S.edit.on && !S.edit.sub) { // editor SEM ferramenta: clique simples mostra os parâmetros (estilo Revit)
      if (hit && _ultimosHits[0]) {
        var udP = _ultimosHits[0].object.userData;
        if (opts.onPick) opts.onPick(propsDe(udP.mid !== undefined ? udP.mid : S.modelID, udP.expressID, udP.tipo));
      }
      return;
    }
    if (!hit) { S._hint((ctec.ativo ? '📝' : area.on ? '▱' : ang.on ? '∠' : '📏') + ' Clique em cima de uma superfície do modelo.'); return; }
    var sn = aplicarSnap(hit, raioToque(e)); mostrarSnapMarca(sn, e.clientX, e.clientY);
    if (ctec.ativo) { ctecClique(sn.p.clone()); return; } // linha do corte técnico tem prioridade
    if (area.on) { areaClique(sn.p.clone()); return; }
    if (ang.on) { angClique(sn.p.clone()); return; }
    medir.pts.push({ p: sn.p.clone() });
    if (medir.pts.length === 2) {
      tirarProv(); // a marca definitiva do 1º ponto é desenhada por desenharMedida (evita marca dupla)
      var ok = desenharMedida(medir.pts[0].p, medir.pts[1].p); medir.pts = [];
      marcarFechamento(); // duplo-clique no 2º ponto não planta o 1º ponto da próxima cota
      S._hint(ok ? '📏 Medido! Clique 2 pontos pra medir de novo, ou Esc pra sair.' : '📏 Pontos muito próximos — clique 2 pontos distintos.');
    } else {
      var m0 = pontoMarca(medir.pts[0].p); addMed(m0); medir.prov = m0; S._hint('📏 Agora clique no 2º ponto.');
    }
  });
  // hover do snap: feedback ao vivo de onde a trena vai "agarrar" (throttle p/ não pesar o raycast)
  var _snapHoverT = 0;
  canvasEl.addEventListener('pointermove', function (e) {
    if (!S || !S.alive) return;
    // v1.1.82 — preview vivo da parede (rubber-band + cota junto ao cursor, estilo Revit)
    if (S.edit && S.edit.on && S.edit.sub === 'parede' && S.edit.p1 && S._editPreviewMove) {
      S._editPreviewMove(e);
    }
    if (!ferramentaClique() || !snap.on) return;
    var t = performance.now(); if (t - _snapHoverT < 60) return; _snapHoverT = t;
    var hit = raycastEm(e.clientX, e.clientY);
    if (!hit) { esconderSnapMarca(); return; }
    mostrarSnapMarca(aplicarSnap(hit, raioToque(e)), e.clientX, e.clientY);
  });

  // ============================================================
  // ▱ ÁREA (polígono) e ∠ ÂNGULO — mesmas garantias da trena: todo ponto
  // produzido passa pelo raycast filtrado (visível + fora do clip) e pelo snap.
  // ÁREA na planta = projeção HORIZONTAL (XZ, o que a planta representa);
  // em 3D = plano médio do polígono (vetor-área de Newell) — se os pontos
  // fugirem do plano, o rótulo declara "≈ plano médio" (nunca número mudo).
  // ============================================================
  var area = { on: false, pts: [], tmp: [] };
  var ang = { on: false, pts: [], tmp: [] };
  S.area = area; S.ang = ang;
  // remove SÓ os provisórios (marcas/segmentos do polígono em andamento) sem tocar nas medidas prontas
  function limparTmp(t) { t.forEach(function (o) { var i = medir.objs.indexOf(o); if (i >= 0) medir.objs.splice(i, 1); limparMarca(o); }); t.length = 0; }
  function fmtArea(a) { return (a >= 1 ? a.toFixed(2) : a.toFixed(3)).replace('.', ',') + ' m²'; }
  // área+perímetro do polígono. horizontal=true -> projeção XZ (shoelace). Senão, vetor-área de
  // Newell: |Σ cross|/2 é a área da projeção no plano médio — exata p/ polígono plano, aproximação
  // declarada p/ não-plano (aprox=true quando o desvio ao plano passa de 2% do lado típico).
  function areaCalc(pts) {
    var n = pts.length, i, p, q;
    if (planta.on) {
      var a2 = 0, perH = 0;
      for (i = 0; i < n; i++) {
        p = pts[i]; q = pts[(i + 1) % n];
        a2 += p.x * q.z - q.x * p.z;
        perH += Math.sqrt((q.x - p.x) * (q.x - p.x) + (q.z - p.z) * (q.z - p.z));
      }
      return { area: Math.abs(a2) / 2, per: perH, aprox: false, horizontal: true, normal: new THREE.Vector3(0, 1, 0) };
    }
    var nx = 0, ny = 0, nz = 0, per = 0, cx = 0, cy = 0, cz = 0;
    for (i = 0; i < n; i++) {
      p = pts[i]; q = pts[(i + 1) % n];
      nx += (p.y - q.y) * (p.z + q.z); ny += (p.z - q.z) * (p.x + q.x); nz += (p.x - q.x) * (p.y + q.y);
      per += p.distanceTo(q); cx += p.x; cy += p.y; cz += p.z;
    }
    var nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (nl < 1e-9) return null; // colinear/degenerado
    cx /= n; cy /= n; cz /= n;
    var desv = 0;
    for (i = 0; i < n; i++) { var dv = Math.abs(((pts[i].x - cx) * nx + (pts[i].y - cy) * ny + (pts[i].z - cz) * nz) / nl); if (dv > desv) desv = dv; }
    var areaV = nl / 2;
    return { area: areaV, per: per, aprox: desv > Math.max(0.01, Math.sqrt(areaV) * 0.02), horizontal: false, normal: new THREE.Vector3(nx / nl, ny / nl, nz / nl) };
  }
  S._areaCalc = areaCalc; // hook de teste (oráculo Node/E2E)
  // preenchimento translúcido: triangula no plano do polígono (base ortonormal da normal)
  function preencherPoligono(pts, normal) {
    try {
      var nv = normal.clone().normalize();
      var ref = Math.abs(nv.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      var bu = new THREE.Vector3().crossVectors(ref, nv).normalize();
      var bv = new THREE.Vector3().crossVectors(nv, bu);
      var p2 = pts.map(function (pp) { return new THREE.Vector2(pp.dot(bu), pp.dot(bv)); });
      var tris = THREE.ShapeUtils.triangulateShape(p2, []);
      if (!tris.length) return null;
      var pos = new Float32Array(pts.length * 3);
      pts.forEach(function (pp, i2) { pos[i2 * 3] = pp.x; pos[i2 * 3 + 1] = pp.y; pos[i2 * 3 + 2] = pp.z; });
      var idx = [];
      tris.forEach(function (t2) { idx.push(t2[0], t2[1], t2[2]); });
      var bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); bg.setIndex(idx);
      var mh = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.16, depthTest: false, side: THREE.DoubleSide }));
      mh.renderOrder = 996;
      return mh;
    } catch (_) { return null; } // polígono auto-intersectado etc.: fica só o contorno + rótulo
  }
  function setArea(on) {
    area.on = !!on;
    if (on) { setMode(false); if (medir.on) setMedir(false); if (ang.on) setAng(false); if (edit && edit.on) setEdit(false); } // coexiste com Planta/Corte; exclusivo entre medições e editor
    else { limparTmp(area.tmp); area.pts = []; esconderSnapMarca(); btnCotas(); }
    var b = bar.querySelector('[data-b="area"]'); if (b) { b.style.background = on ? corAtiva() : ''; b.style.color = on ? '#fff' : ''; }
    atualizarCursor();
    S._hint(on ? ('▱ Área: clique os cantos (3+)' + (planta.on ? ' na planta' : '') + ' e feche clicando de novo no 1º ponto (ou duplo-clique).') : (planta.on ? '📐 Planta baixa. Ajuste a altura do corte no painel.' : ''));
  }
  S._setArea = setArea;
  function areaClique(p) {
    // fechar: clique perto (na TELA) do 1º ponto, com 3+ pontos marcados.
    // Vetores locais novos — REGRA do gate v1.1.65: nunca passar pra project() um scratch que carrega candidato.
    if (area.pts.length >= 3) {
      var rc2 = canvasEl.getBoundingClientRect();
      var v0 = new THREE.Vector3().copy(area.pts[0]).project(camera);
      var vp = new THREE.Vector3().copy(p).project(camera);
      var ddx = (v0.x - vp.x) / 2 * rc2.width, ddy = (v0.y - vp.y) / 2 * rc2.height;
      if (ddx * ddx + ddy * ddy < 18 * 18) { fecharArea(); return; }
    }
    area.pts.push(p);
    var m = pontoMarca(p); m.material.color.set(0x38bdf8); addMed(m); area.tmp.push(m);
    if (area.pts.length > 1) {
      var seg = new THREE.Line(new THREE.BufferGeometry().setFromPoints([area.pts[area.pts.length - 2], p]), new THREE.LineBasicMaterial({ color: 0x38bdf8, depthTest: false }));
      seg.renderOrder = 997; addMed(seg); area.tmp.push(seg);
    }
    S._hint(area.pts.length < 3 ? ('▱ Ponto ' + area.pts.length + ' — siga marcando os cantos.') : ('▱ ' + area.pts.length + ' pontos — feche clicando no 1º ponto (ou duplo-clique).'));
  }
  function fecharArea() {
    if (!area.on || area.pts.length < 3) { S._hint('▱ Marque pelo menos 3 pontos antes de fechar.'); return; }
    marcarFechamento(); // engole o pointerup irmão do duplo-clique (ponto fantasma)
    // dedupe: duplo-clique de fechar dispara pointerup 2x no mesmo lugar -> pontos consecutivos coincidentes
    var pts = [];
    area.pts.forEach(function (pp) { if (!pts.length || pp.distanceTo(pts[pts.length - 1]) > 2e-3) pts.push(pp); });
    if (pts.length > 1 && pts[pts.length - 1].distanceTo(pts[0]) < 2e-3) pts.pop();
    limparTmp(area.tmp); area.pts = [];
    if (pts.length < 3) { S._hint('▱ Pontos coincidentes — marque 3+ cantos distintos.'); return; }
    var res = areaCalc(pts);
    if (!res || res.area < 1e-4) { S._hint('▱ Pontos colineares — não formam área. Recomece.'); return; }
    // desenho final: contorno fechado + preenchimento + marcas + rótulo no centro
    var loop = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.concat([pts[0]])), new THREE.LineBasicMaterial({ color: 0x38bdf8, depthTest: false }));
    loop.renderOrder = 997; addMed(loop);
    pts.forEach(function (pp) { var mk = pontoMarca(pp); mk.material.color.set(0x38bdf8); addMed(mk); });
    var fill = preencherPoligono(pts, res.normal); if (fill) addMed(fill);
    var c = new THREE.Vector3(); pts.forEach(function (pp) { c.add(pp); }); c.multiplyScalar(1 / pts.length);
    var sufixo = res.horizontal ? ' (horizontal)' : (res.aprox ? ' ≈ plano médio' : '');
    var lab = labelSprite('▱ ' + fmtArea(res.area) + ' · per ' + fmtDist(res.per) + sufixo);
    lab.position.copy(c); addMed(lab); btnCotas();
    medir.ultimaArea = { area: res.area, perimetro: res.per, horizontal: res.horizontal, aproximada: res.aprox, pontos: pts.length };
    S._hint('▱ Área medida! Clique os cantos da próxima, ou Esc pra sair.');
  }
  function setAng(on) {
    ang.on = !!on;
    if (on) { setMode(false); if (medir.on) setMedir(false); if (area.on) setArea(false); if (edit && edit.on) setEdit(false); }
    else { limparTmp(ang.tmp); ang.pts = []; esconderSnapMarca(); btnCotas(); }
    var b = bar.querySelector('[data-b="angulo"]'); if (b) { b.style.background = on ? corAtiva() : ''; b.style.color = on ? '#fff' : ''; }
    atualizarCursor();
    S._hint(on ? '∠ Ângulo: clique o 1º ponto, depois o VÉRTICE, depois o 2º ponto.' : (planta.on ? '📐 Planta baixa. Ajuste a altura do corte no painel.' : ''));
  }
  S._setAng = setAng;
  function angClique(p) {
    ang.pts.push(p);
    var m = pontoMarca(p); m.material.color.set(0xf59e0b); addMed(m); ang.tmp.push(m);
    if (ang.pts.length > 1) {
      var seg = new THREE.Line(new THREE.BufferGeometry().setFromPoints([ang.pts[ang.pts.length - 2], p]), new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false }));
      seg.renderOrder = 997; addMed(seg); ang.tmp.push(seg);
    }
    if (ang.pts.length === 1) { S._hint('∠ Agora clique o VÉRTICE do ângulo.'); return; }
    if (ang.pts.length === 2) { S._hint('∠ Agora clique o 2º ponto.'); return; }
    var P1 = ang.pts[0], V = ang.pts[1], P2 = ang.pts[2];
    marcarFechamento(); // 3º ponto pode vir de duplo-clique — engole o irmão
    limparTmp(ang.tmp); ang.pts = [];
    var u = P1.clone().sub(V), v = P2.clone().sub(V);
    if (u.length() < 2e-3 || v.length() < 2e-3) { S._hint('∠ Pontos coincidentes — recomece: 1º ponto, vértice, 2º ponto.'); return; }
    var rad = u.angleTo(v), deg = rad * 180 / Math.PI;
    // desenho final: os 2 lados + arco no plano u,v + rótulo na bissetriz
    [[V, P1], [V, P2]].forEach(function (par) {
      var l2 = new THREE.Line(new THREE.BufferGeometry().setFromPoints(par), new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false }));
      l2.renderOrder = 997; addMed(l2);
    });
    [P1, V, P2].forEach(function (pp) { var mk = pontoMarca(pp); mk.material.color.set(0xf59e0b); addMed(mk); });
    var eixo = new THREE.Vector3().crossVectors(u, v), r = Math.min(u.length(), v.length()) * 0.35;
    if (eixo.lengthSq() > 1e-12) { // 0°/180° não têm plano definido -> sem arco (só rótulo)
      eixo.normalize();
      var arcPts = [], un = u.clone().normalize();
      for (var t2 = 0; t2 <= 16; t2++) arcPts.push(V.clone().add(un.clone().applyAxisAngle(eixo, rad * t2 / 16).multiplyScalar(r)));
      var arco = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arcPts), new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false }));
      arco.renderOrder = 997; addMed(arco);
    }
    var bis = u.clone().normalize().add(v.clone().normalize());
    if (bis.lengthSq() < 1e-9) bis = (eixo.lengthSq() > 1e-12 ? new THREE.Vector3().crossVectors(eixo, u).normalize() : new THREE.Vector3(0, 1, 0)); else bis.normalize();
    var lab = labelSprite('∠ ' + deg.toFixed(1).replace('.', ',') + '°');
    lab.position.copy(V).add(bis.multiplyScalar(Math.max(r * 1.4, 0.05)));
    addMed(lab); btnCotas();
    medir.ultimoAngulo = { graus: deg };
    S._hint('∠ ' + deg.toFixed(1).replace('.', ',') + '° — clique 3 pontos pra medir outro, ou Esc pra sair.');
  }

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
    '<button class="btn sm primary" data-c="planta2d" style="width:100%">📄 Planta baixa técnica (2D)</button>' +
    '<button class="btn sm" data-c="estilo" style="width:100%">✏️ Estilo desenho (branco)</button>' +
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
      if (bp) { bp.style.background = corAtiva(); bp.style.color = '#fff'; }
      if (!estiloD.on) setEstiloDesenho(true); // planta "como deve ser": entra já em modo desenho (branco + arestas)
      S._hint('📐 Planta baixa. Ajuste a altura do corte e gere a 📄 planta técnica com cotas no painel. Toque em 📐 de novo pra sair.');
    } else {
      ctecCancelar(); // desenho/config do corte técnico só faz sentido NA planta (incondicional: pega a config aberta)
      plantaCfg.style.display = 'none'; // config da planta técnica idem
      if (estiloD.on) setEstiloDesenho(false); // devolve as cores do modelo
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
    if (S._cancelTween) S._cancelTween(); // fit-na-planta cancela voo pendente (senão o tween puxa a câmera pra fora do topo)
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
  cortePanel.querySelector('[data-c="planta2d"]').addEventListener('click', function () { fecharPaineis(); ctecCancelar(); plantaCfg.style.display = 'flex'; }); // planta técnica e corte A–A são modais centrais no mesmo z — não empilham
  cortePanel.querySelector('[data-c="estilo"]').addEventListener('click', function () { setEstiloDesenho(!estiloD.on); });

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
      if (bc) { bc.style.background = corAtiva(); bc.style.color = '#fff'; }
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
    else if (k === 'inv') { corteL.inv = !corteL.inv; b.style.background = corteL.inv ? corAtiva() : ''; b.style.color = corteL.inv ? '#fff' : ''; aplicarCorteL(); }
  });

  // ============================================================
  // 🧲 SNAP — a trena (e a linha do corte técnico) "agarram" em pontos notáveis:
  // vértice (fim de linha) > meio de aresta > aresta mais próxima > superfície livre.
  // Configurável por tipo, persistido; indicador visual mostra ONDE e O QUE agarrou.
  // ============================================================
  var snap = { on: true, v: true, m: true, a: true, i: true, raio: 14 };
  try { var _sv = JSON.parse(localStorage.getItem('orcapro:bim:snap') || 'null'); if (_sv) { snap.on = !!_sv.on; snap.v = !!_sv.v; snap.m = !!_sv.m; snap.a = !!_sv.a; snap.i = _sv.i !== false; } } catch (_) {}
  function salvarSnap() { try { localStorage.setItem('orcapro:bim:snap', JSON.stringify({ on: snap.on, v: snap.v, m: snap.m, a: snap.a, i: snap.i })); } catch (_) {} }
  S.snap = snap;
  var snapPanel = document.createElement('div');
  snapPanel.style.cssText = 'position:absolute;right:10px;top:52px;z-index:4;display:none;flex-direction:column;gap:7px;background:rgba(15,39,64,.94);border:1px solid #24435f;border-radius:11px;padding:11px 13px;color:#dbe8f5;font-size:12px;width:210px';
  snapPanel.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center"><b>🧲 Snap da trena</b><button class="btn sm" data-s="on" style="padding:2px 9px">ON</button></div>' +
    '<div style="display:flex;gap:5px;flex-wrap:wrap">' +
    '<button class="btn sm" data-s="v" style="flex:1" title="Agarra no fim de linha (canto/vértice)">▪ Vértice</button>' +
    '<button class="btn sm" data-s="m" style="flex:1" title="Agarra no meio da aresta">● Meio</button>' +
    '<button class="btn sm" data-s="a" style="flex:1" title="Agarra no ponto mais próximo da aresta">◆ Aresta</button>' +
    '<button class="btn sm" data-s="i" style="flex:1" title="Agarra no CRUZAMENTO real de duas arestas (canto parede×viga)">✚ Interseção</button></div>' +
    '<div style="font-size:11px;color:#9fb2c8">Aproxime o clique de um canto/aresta: a cota agarra no ponto exato (o marcador mostra o tipo). Sem alvo por perto, mede na superfície livre.</div>';
  host.appendChild(snapPanel);
  S.snapPanel = snapPanel;
  function pintarSnapPanel() {
    var cfg = { on: snap.on, v: snap.v, m: snap.m, a: snap.a, i: snap.i };
    ['on', 'v', 'm', 'a', 'i'].forEach(function (kk) {
      var b = snapPanel.querySelector('[data-s="' + kk + '"]'); if (!b) return;
      b.style.background = cfg[kk] ? corAtiva() : ''; b.style.color = cfg[kk] ? '#fff' : '';
      if (kk === 'on') b.textContent = cfg.on ? 'ON' : 'OFF';
    });
    var bs = bar.querySelector('[data-b="snap"]'); if (bs) { bs.style.background = snap.on ? corAtiva() : ''; bs.style.color = snap.on ? '#fff' : ''; bs.style.outline = (snapPanel.style.display === 'flex') ? '2px solid #7fe0a3' : ''; }
  }
  pintarSnapPanel();
  function toggleSnapPanel() { var abrir = (snapPanel.style.display === 'none' || !snapPanel.style.display); fecharPaineis(abrir ? snapPanel : null); snapPanel.style.display = abrir ? 'flex' : 'none'; pintarSnapPanel(); } // repinta -> botão mostra painel aberto
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
  var SNAP_VIS = { vertice: { cor: '#22c55e', borda: '0', rot: 'vértice' }, meio: { cor: '#f59e0b', borda: '50%', rot: 'meio' }, aresta: { cor: '#38bdf8', borda: '0', rot: 'aresta' }, intersecao: { cor: '#e879f9', borda: '0', rot: '✚ interseção' } };
  // o marcador é ANCORADO NO MUNDO e re-projetado a cada frame (achado do usuário: posicionado
  // uma única vez, ficava "pendurado" na tela enquanto o damping da câmera ainda deslizava —
  // o ponto mostrado parecia longe/bugado em relação ao ponto real)
  var snapVivo = null; // { p: Vector3, tipo }
  function posicionarSnapMarca() {
    if (!snapVivo) return;
    var rc = canvasEl.getBoundingClientRect(), hr = host.getBoundingClientRect();
    var q = snapVivo.p.clone().project(camera);
    if (q.z > 1 || q.z < -1) { snapMarca.style.display = 'none'; return; } // atrás da câmera/fora do frustum
    var x = (q.x + 1) / 2 * rc.width + (rc.left - hr.left), y = (1 - q.y) / 2 * rc.height + (rc.top - hr.top);
    snapMarca.style.left = x + 'px'; snapMarca.style.top = y + 'px'; snapMarca.style.display = 'block';
  }
  S._tickExtra.push(function () { posicionarSnapMarca(); });
  function mostrarSnapMarca(sn) {
    if (!sn || !sn.tipo) { esconderSnapMarca(); return; }
    var vis = SNAP_VIS[sn.tipo], ico = snapMarca.querySelector('[data-sm="ico"]');
    ico.style.borderColor = vis.cor; ico.style.borderRadius = vis.borda;
    ico.style.transform = (sn.tipo === 'aresta' || sn.tipo === 'intersecao') ? 'rotate(45deg)' : '';
    snapMarca.querySelector('[data-sm="rot"]').textContent = vis.rot;
    snapMarca.querySelector('[data-sm="rot"]').style.color = vis.cor;
    snapVivo = { p: sn.p.clone(), tipo: sn.tipo };
    posicionarSnapMarca();
  }
  function esconderSnapMarca() { snapVivo = null; snapMarca.style.display = 'none'; }
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
  // PESOS de desempate (achado do usuário: prioridade ABSOLUTA fazia um vértice a 13px "roubar"
  // de uma aresta a 2px do cursor — o snap agarrava LONGE de onde se clicava). Agora ganha o
  // candidato mais PRÓXIMO em distância efetiva; o peso só desempata tipos ~equidistantes.
  var SNAP_PESO = { intersecao: 1.5, vertice: 1.35, meio: 1.15, aresta: 1.0 };
  // pontos mais próximos entre dois segmentos 3D (Ericson) — devolve {d, p} (p = ponto médio do par)
  function segSeg3D(a1, a2, b1, b2) {
    var d1x = a2.x - a1.x, d1y = a2.y - a1.y, d1z = a2.z - a1.z;
    var d2x = b2.x - b1.x, d2y = b2.y - b1.y, d2z = b2.z - b1.z;
    var rx = a1.x - b1.x, ry = a1.y - b1.y, rz = a1.z - b1.z;
    var A = d1x * d1x + d1y * d1y + d1z * d1z, E = d2x * d2x + d2y * d2y + d2z * d2z;
    var F = d2x * rx + d2y * ry + d2z * rz, s, t;
    if (A <= 1e-12 && E <= 1e-12) { s = 0; t = 0; }
    else if (A <= 1e-12) { s = 0; t = Math.max(0, Math.min(1, F / E)); }
    else {
      var C = d1x * rx + d1y * ry + d1z * rz;
      if (E <= 1e-12) { t = 0; s = Math.max(0, Math.min(1, -C / A)); }
      else {
        var B = d1x * d2x + d1y * d2y + d1z * d2z, den = A * E - B * B;
        s = den > 1e-12 ? Math.max(0, Math.min(1, (B * F - C * E) / den)) : 0;
        t = Math.max(0, Math.min(1, (B * s + F) / E));
        s = Math.max(0, Math.min(1, (B * t - C) / A));
      }
    }
    var px1 = a1.x + d1x * s, py1 = a1.y + d1y * s, pz1 = a1.z + d1z * s;
    var qx1 = b1.x + d2x * t, qy1 = b1.y + d2y * t, qz1 = b1.z + d2z * t;
    var dd = Math.sqrt((px1 - qx1) * (px1 - qx1) + (py1 - qy1) * (py1 - qy1) + (pz1 - qz1) * (pz1 - qz1));
    return { d: dd, p: new THREE.Vector3((px1 + qx1) / 2, (py1 + qy1) / 2, (pz1 + qz1) / 2) };
  }
  function aplicarSnap(hit, raioPx) {
    if (!snap.on || !hit || !hit.object || !hit.object.geometry) return { p: hit.point, tipo: null };
    var raio = raioPx || snap.raio, rc = canvasEl.getBoundingClientRect();
    function px(v) { var q = _snP.copy(v).project(camera); return { x: (q.x + 1) / 2 * rc.width, y: (1 - q.y) / 2 * rc.height }; }
    var alvoPx = px(hit.point), melhor = null;
    function testar(v, tipo) {
      var p2 = px(v), dx = p2.x - alvoPx.x, dy = p2.y - alvoPx.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d > raio) return;
      if (foraDoClip(v)) return; // vértice/aresta do lado CLIPADO (invisível) do corte NÃO pode ser snapado -> cota errada
      var dEff = d / (SNAP_PESO[tipo] || 1);
      if (!melhor || dEff < melhor.dEff) melhor = { p: v.clone(), tipo: tipo, d: d, dEff: dEff };
    }
    // arestas PRÓXIMAS do cursor (candidatas ao ✚ interseção) — dos até 2 objetos do raio
    var proximas = [];
    function varrerObjeto(obj) {
      if (!obj || !obj.geometry) return;
      var g = obj.geometry, np = (g.attributes && g.attributes.position) ? g.attributes.position.count : 0;
      if (np > SNAP_MAX_VERT) return; // elemento pesado: sem snap nesse objeto
      var arr = arestasDe(g); if (!arr.length) return;
      var mw = obj.matrixWorld;
      for (var i = 0; i < arr.length; i += 6) {
        _snA.set(arr[i], arr[i + 1], arr[i + 2]).applyMatrix4(mw);
        _snB.set(arr[i + 3], arr[i + 4], arr[i + 5]).applyMatrix4(mw);
        if (snap.v) { testar(_snA, 'vertice'); testar(_snB, 'vertice'); }
        if (snap.m) { testar(_snM.addVectors(_snA, _snB).multiplyScalar(0.5), 'meio'); }
        _snL.set(_snA, _snB);
        var cl = _snL.closestPointToPoint(hit.point, true, _snCl);
        if (snap.a) testar(cl, 'aresta');
        if (snap.i !== false && proximas.length < 14) {
          var pc = px(cl), ddx = pc.x - alvoPx.x, ddy = pc.y - alvoPx.y;
          if (ddx * ddx + ddy * ddy <= (raio + 6) * (raio + 6)) proximas.push({ a: _snA.clone(), b: _snB.clone() });
        }
      }
    }
    varrerObjeto(hit.object);
    // 2º objeto do raio: o canto parede×viga vive na fronteira entre DOIS elementos
    if (_ultimosHits.length > 1 && _ultimosHits[1].object !== hit.object) varrerObjeto(_ultimosHits[1].object);
    // ✚ INTERSEÇÃO REAL: pares de arestas próximas cujos pontos-mais-próximos em 3D distam < 1 cm
    // (cruzamento genuíno no espaço, não coincidência visual de projeção — nunca inventa ponto)
    if (snap.i !== false) {
      for (var ii = 0; ii < proximas.length; ii++) for (var jj = ii + 1; jj < proximas.length; jj++) {
        var r3 = segSeg3D(proximas[ii].a, proximas[ii].b, proximas[jj].a, proximas[jj].b);
        if (r3.d < 0.01) testar(r3.p, 'intersecao');
      }
    }
    return melhor ? { p: melhor.p, tipo: melhor.tipo } : { p: hit.point, tipo: null };
  }
  function raioToque(e) { return (e && e.pointerType === 'touch') ? 30 : snap.raio; } // dedo tem ~mais incerteza

  // ============================================================
  // 📝 CORTE TÉCNICO — o usuário risca a linha A–A' NA PLANTA e o viewer gera a
  // vista de corte em preto-e-branco estilo desenho técnico, NA ESCALA escolhida
  // (px/m derivado de 96dpi), com carimbo e escala gráfica. Câmera ortográfica
  // perpendicular à linha; clipping no próprio plano de corte. Faces cortadas saem
  // HACHURADAS (caps por stencil: saldo backface−frontface ≠ 0 = interior de sólido).
  // ============================================================
  var ctec = { ativo: false, pts: [], objs: [] };
  S._tickExtra.push(function () { for (var i = 0; i < ctec.objs.length; i++) rescaleObj(ctec.objs[i]); });
  function ctecLimparDesenho() { ctec.objs.forEach(limparMarca); ctec.objs = []; ctec.pts = []; }
  function ctecIniciar() {
    if (!planta.on) { setPlanta(true); if (!planta.on) return; } // linha se risca NA planta
    if (S.plantaCfg) S.plantaCfg.style.display = 'none'; // config da planta técnica não pode ficar cobrindo os cliques A/B
    if (edit && edit.on) setEdit(false); // corte técnico e editor disputariam o mesmo clique
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
    marcarFechamento(); // duplo-clique no A' não vaza o irmão pra trena/área coexistente
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
    '<div style="font-size:11px;color:#f0b94a;line-height:1.35">⚠ Auxílio visual de coordenação, não substitui o projeto executivo. Faces cortadas saem <b>hachuradas</b>; superfícies curvas/tubos podem sair sem contorno. Confira sempre pela escala gráfica.</div>' +
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
    // plano de corte REAL (só no corte; a fachada olha de fora, não corta): além de clipar as
    // massas exatamente na linha A–A, é a referência dos passes de stencil da HACHURA
    var secPlane = (o.tipo === 'fachada') ? null : new THREE.Plane(new THREE.Vector3(vx, 0, vz), -(vx * cx + vz * cz));
    var cam = new THREE.OrthographicCamera(-wM / 2, wM / 2, hM / 2, -hM / 2, 0.01, recuo + ((o.tipo === 'fachada') ? diag * 2 : Math.max(0.5, +o.prof || 10)));
    cam.position.set(cx - vx * recuo, cy, cz - vz * recuo);
    cam.up.set(0, 1, 0); cam.lookAt(cx, cy, cz); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    // snapshot do estado do renderer ANTES do try — o finally SEMPRE restaura (mesmo se um passo lançar)
    var prevClip = renderer.clippingPlanes, prevLocal = renderer.localClippingEnabled;
    var prevClear = renderer.getClearColor(new THREE.Color()).clone(), prevAlpha = renderer.getClearAlpha();
    var prevTone = renderer.toneMapping, prevAuto = renderer.autoClear;
    var rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true, stencilBuffer: true }), buf = null, edgesRoot = null, matMassa = null, matLinha = null, escondidos = [];
    var stBack = null, stFront = null, capMat = null, capGeo = null, hatchTex = null;
    try {
      renderer.clippingPlanes = secPlane ? [secPlane] : []; renderer.localClippingEnabled = false;
      renderer.toneMapping = THREE.NoToneMapping; // P&B fiel (sem ACES escurecer os cinzas)
      scene.children.forEach(function (c) { if (c !== modelRoot && c.visible !== false) { escondidos.push(c); c.visible = false; } });
      // PASSE 1 — massas cinza-claro sobre branco; polygonOffset empurra as faces no depth p/ as
      // arestas coplanares do passe 2 vencerem sem z-fighting.
      matMassa = new THREE.MeshBasicMaterial({ color: 0xededed, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      scene.overrideMaterial = matMassa;
      renderer.setRenderTarget(rt); renderer.setClearColor(0xffffff, 1); renderer.clear();
      renderer.render(scene, cam);
      scene.overrideMaterial = null;
      // PASSE 1.5 — HACHURA nas faces cortadas (caps por stencil, só no corte):
      // com o plano ativo, conta backfaces (+1) e frontfaces (−1) do que sobrou além do plano;
      // onde o saldo ≠ 0 o plano atravessa o INTERIOR de um sólido → pinta o quad hachurado 45°.
      if (secPlane) {
        renderer.autoClear = false;
        // câmera EXCLUSIVA do stencil com far cobrindo o MODELO INTEIRO (achado do gate): o far
        // da câmera do desenho (= profundidade de visão) descartava backfaces distantes e
        // desbalanceava a paridade — hachura sumia em laje cortada profunda e aparecia FALSA em
        // parede em vista atravessando o far. L/R/T/B idênticos -> os pixels casam 1:1.
        var camSt = cam.clone(); camSt.far = recuo + diag * 2 + 1; camSt.updateProjectionMatrix();
        stBack = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, side: THREE.BackSide,
          stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: THREE.IncrementWrapStencilOp, stencilZFail: THREE.IncrementWrapStencilOp, stencilZPass: THREE.IncrementWrapStencilOp });
        stFront = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, side: THREE.FrontSide,
          stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: THREE.DecrementWrapStencilOp, stencilZFail: THREE.DecrementWrapStencilOp, stencilZPass: THREE.DecrementWrapStencilOp });
        scene.overrideMaterial = stBack; renderer.render(scene, camSt);
        scene.overrideMaterial = stFront; renderer.render(scene, camSt);
        scene.overrideMaterial = null;
        // textura de hachura 45° com espaçamento constante NO PAPEL (~2 mm × escala, em metros de mundo)
        var hcv = document.createElement('canvas'); hcv.width = hcv.height = 32;
        var hg = hcv.getContext('2d');
        hg.fillStyle = '#dfdfdf'; hg.fillRect(0, 0, 32, 32);
        hg.strokeStyle = '#141414'; hg.lineWidth = 2.4;
        hg.beginPath(); hg.moveTo(-4, 36); hg.lineTo(36, -4); hg.moveTo(-20, 20); hg.lineTo(20, -20); hg.moveTo(12, 52); hg.lineTo(52, 12); hg.stroke();
        hatchTex = new THREE.CanvasTexture(hcv);
        hatchTex.wrapS = hatchTex.wrapT = THREE.RepeatWrapping; hatchTex.minFilter = THREE.LinearFilter;
        var esp = 0.0028 * escalaEf; // período da hachura em metros de mundo (~2 mm no papel em qualquer escala)
        hatchTex.repeat.set(wM / esp, hM / esp);
        // depthFunc Always + depthWrite TRUE (achado do gate): o quad GRAVA depth na região
        // hachurada — arestas de geometria ATRÁS do corte não riscam a hachura no PASSE 2
        // (as do contorno, clipadas exatamente no plano, ficam mais perto que o quad e vencem)
        capMat = new THREE.MeshBasicMaterial({ map: hatchTex, depthTest: true, depthFunc: THREE.AlwaysDepth, depthWrite: true, side: THREE.DoubleSide,
          stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.ZeroStencilOp, stencilZFail: THREE.ZeroStencilOp, stencilZPass: THREE.ZeroStencilOp });
        capGeo = new THREE.PlaneGeometry(wM, hM);
        var capQuad = new THREE.Mesh(capGeo, capMat);
        capQuad.position.set(cx + vx * 1e-3, cy, cz + vz * 1e-3); // um fio ALÉM do plano (lado mantido pelo clip)
        capQuad.lookAt(cx + vx * 2, cy, cz + vz * 2);
        var capScene = new THREE.Scene(); capScene.add(capQuad);
        renderer.render(capScene, camSt);
      }
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
      if (stBack) stBack.dispose(); if (stFront) stFront.dispose();
      if (capMat) capMat.dispose(); if (capGeo) capGeo.dispose(); if (hatchTex) hatchTex.dispose();
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
    ctecModal._ajustar = null; ctecModal._nomeArq = null; // modal é compartilhado com a planta técnica: limpa os hooks dela
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
    else if (k === 'ajustar') {
      ctecModal.style.display = 'none';
      if (ctecModal._ajustar) { ctecModal._ajustar(); S._hint('📄 Ajuste e clique Gerar.'); } // planta técnica reabre a config DELA
      else { ctecCfg.style.display = 'flex'; S._hint('📝 Ajuste e clique Gerar (a linha A–A foi mantida).'); } // pts preservados
    }
    else if (k === 'baixar') { var aEl = document.createElement('a'); aEl.href = url; aEl.download = ctecModal._nomeArq || 'corte-tecnico.png'; aEl.click(); }
    else if (k === 'imprimir') {
      // imprime na DIMENSÃO FÍSICA (mm) pra a escala do carimbo valer no papel — max-width:100% encolheria
      var w = null; try { w = window.open('', '_blank'); } catch (_) {}
      if (!w) { S._hint('🖨 O navegador bloqueou a janela de impressão — use ⬇ PNG e imprima o arquivo em 100%.'); return; }
      try {
        var ttlImp = esc((ctecModal.querySelector('[data-r="titulo"]').textContent || 'Desenho técnico')) + ' — OrçaPRO BIM';
        w.document.write('<!doctype html><meta charset="utf-8"><title>' + ttlImp + '</title>' +
          '<style>@page{size:auto;margin:8mm}body{margin:0;font-family:Arial}.av{font-size:12px;color:#444;margin:6px 2px}@media print{.av{display:none}}</style>' +
          '<p class="av">Imprima em <b>100%</b> (sem “ajustar à página”) para a escala do carimbo valer. A escala gráfica de 1 m serve de conferência.</p>' +
          '<img src="' + url + '" style="width:' + (res.larguraMM || 200).toFixed(1) + 'mm;height:' + (res.alturaMM || 150).toFixed(1) + 'mm;display:block" onload="setTimeout(function(){window.print()},300)">');
        w.document.close();
      } catch (_) { S._hint('🖨 Não deu pra abrir a impressão — use ⬇ PNG.'); }
    }
  });

  // ============================================================
  // 📄 PLANTA BAIXA TÉCNICA — desenho 2D de verdade (estilo Revit):
  // corte horizontal na altura do slider, paredes cortadas HACHURADAS
  // (mesmo stencil por paridade do corte técnico), arestas pretas, fundo
  // branco, escala exata e COTAS AUTOMÁTICAS em cadeia nos 2 eixos
  // (motor BimPlanta — parede fora de esquadro fica FORA e é declarada).
  // ✏️ Estilo desenho: a própria vista ao vivo vira "planta de verdade"
  // (massas cinza + arestas pretas + fundo branco) enquanto navega.
  // ============================================================
  var estiloD = { on: false, mat: null, matLinha: null };
  S._estiloOn = function () { return !!estiloD.on; };
  function nVerts(geo) { return (geo && geo.attributes && geo.attributes.position) ? geo.attributes.position.count : 0; }
  // silencioso=true: re-aplicação automática (modelo novo / refreshModelo / alpha) — não repinta hint nem outline
  function setEstiloDesenho(on, silencioso) {
    if (on && S._limparRaioX) S._limparRaioX(); // estilo desenho reescreve todos os materiais → tira o raio-X antes (senão o ghostMat vira o "material antes do estilo")
    estiloD.on = !!on;
    var bt = cortePanel.querySelector('[data-c="estilo"]');
    var h2 = (S && S.host) || host; // re-home troca o host — o closure original aponta pro morto
    if (on) {
      if (!estiloD.mat) estiloD.mat = new THREE.MeshBasicMaterial({ color: 0xe9e9e9, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      if (!estiloD.matLinha) estiloD.matLinha = new THREE.LineBasicMaterial({ color: 0x111111 });
      todasMalhas(function (m) {
        if (!m.geometry) return;
        // salva o material ORIGINAL só na 1ª passada (idempotente); mas FORÇA o cinza SEMPRE que
        // reaplicar — senão refreshModelo/transparência/4D deixariam a cor original de volta com o
        // estilo ainda ligado (o _matAntesEstilo guarda o que restaurar; o material vivo é o cinza).
        if (!('_matAntesEstilo' in m.userData)) {
          if (m === S.selected) m.userData._matAntesEstilo = S.prevMat || m.material;
          else m.userData._matAntesEstilo = m.material;
        }
        if (m === S.selected) S.prevMat = estiloD.mat; // desselecionar devolve o cinza, não a cor
        else if (m.material !== estiloD.mat) m.material = estiloD.mat;
        // arestas pretas: pula malha densa (mesmo guard do snap) — EdgesGeometry em terreno de 90k
        // vértices trava a UI; a massa cinza continua, só sem contorno
        if (!m.userData._edgeLn && nVerts(m.geometry) <= SNAP_MAX_VERT) {
          var arr = arestasDe(m.geometry);
          if (arr.length) {
            var bge = new THREE.BufferGeometry(); bge.setAttribute('position', new THREE.BufferAttribute(arr, 3));
            var ln = new THREE.LineSegments(bge, estiloD.matLinha);
            ln.raycast = function () {}; // aresta é decoração — nunca rouba o clique/snap da parede
            m.add(ln); m.userData._edgeLn = ln;
          }
        }
        if (m.userData._edgeLn) m.userData._edgeLn.visible = true;
      });
      h2.style.background = '#fff';
      _chao.visible = false; // fundo branco: o blob da sombra de contato viraria borrão cinza (some no fundo escuro normal)
      if (bt) bt.style.outline = '2px solid ' + corAtiva();
      if (!silencioso) S._hint('✏️ Estilo desenho: massas + arestas no fundo branco (as cores voltam ao sair).');
    } else {
      _chao.visible = true;
      todasMalhas(function (m) {
        if ('_matAntesEstilo' in m.userData) {
          if (m === S.selected) { if (S.prevMat === estiloD.mat) S.prevMat = m.userData._matAntesEstilo; }
          else m.material = m.userData._matAntesEstilo;
          delete m.userData._matAntesEstilo;
        }
        if (m.userData._edgeLn) m.userData._edgeLn.visible = false;
      });
      if (bt) bt.style.outline = '';
      if (S._aplicarTema) S._aplicarTema(); // devolve o fundo do tema atual
    }
  }
  S._setEstiloDesenho = setEstiloDesenho;
  S._reaplicarEstilo = function () { if (estiloD.on) setEstiloDesenho(true, true); }; // modelo novo/refresh entra no estilo, sem spam de hint
  // esconde/mostra as arestas do estilo (thumbnail e foto de 1 elemento não podem sair com wireframe)
  S._edgesEstilo = function (mostrar) { if (!estiloD.on) return; todasMalhas(function (m) { if (m.userData._edgeLn) m.userData._edgeLn.visible = !!mostrar; }); };

  var plantaCfg = document.createElement('div');
  plantaCfg.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:6;display:none;flex-direction:column;gap:8px;background:rgba(15,39,64,.97);border:1px solid #24435f;border-radius:12px;padding:14px 16px;color:#dbe8f5;font-size:12px;width:270px;box-shadow:0 12px 34px rgba(0,0,0,.5)';
  plantaCfg.innerHTML =
    '<b>📄 Planta baixa técnica</b>' +
    '<label style="display:flex;justify-content:space-between;align-items:center">Escala <select data-q="esc" class="inp" style="width:130px"><option value="50" selected>1:50</option><option value="75">1:75</option><option value="100">1:100</option><option value="200">1:200</option></select></label>' +
    '<label style="display:flex;gap:6px;align-items:center"><input data-q="cotas" type="checkbox" checked> Cotas automáticas nas paredes</label>' +
    '<label style="display:flex;justify-content:space-between;align-items:center">Profundidade abaixo do corte <input data-q="prof" class="inp" type="number" min="0.5" step="0.5" value="3" style="width:64px"> m</label>' +
    '<div style="font-size:11px;color:#f0b94a;line-height:1.35">⚠ As cotas saem dos alinhamentos das faces das paredes retas nos eixos do modelo. Parede fora de esquadro fica sem cota automática (declarada no desenho) — use a 📏 trena.</div>' +
    '<div style="display:flex;gap:6px"><button class="btn sm primary" data-q="gerar" style="flex:1">Gerar</button><button class="btn sm" data-q="cancelar" style="flex:1">Cancelar</button></div>';
  host.appendChild(plantaCfg);
  S.plantaCfg = plantaCfg;

  // cadeias de cota (parciais + total) desenhadas em volta do desenho, estilo prancha
  function desenharCotas(g2, cad, geo) {
    var mmpx = 96 / 25.4;
    function mm(v) { return Math.round(v * mmpx); }
    function px(x) { return geo.padL + (x - geo.x0) * geo.pxM; }
    function py(z) { return (z - geo.z0) * geo.pxM; }
    function tick(x, y) { g2.beginPath(); g2.moveTo(x - 3.5, y + 3.5); g2.lineTo(x + 3.5, y - 3.5); g2.stroke(); }
    g2.lineWidth = 1;
    if (cad.x) {
      var y1 = geo.H + mm(6), y2 = geo.H + mm(12);
      g2.strokeStyle = '#888'; // linhas de chamada
      cad.x.ticks.forEach(function (t) { g2.beginPath(); g2.moveTo(px(t), geo.H + 2); g2.lineTo(px(t), y2 + mm(1.5)); g2.stroke(); });
      g2.strokeStyle = '#111'; g2.fillStyle = '#111';
      g2.beginPath(); g2.moveTo(px(cad.x.total.a) - 6, y1); g2.lineTo(px(cad.x.total.b) + 6, y1); g2.stroke();
      cad.x.ticks.forEach(function (t) { tick(px(t), y1); });
      cad.x.segs.forEach(function (s) {
        var w = px(s.b) - px(s.a), t = BimPlanta.fmtM(s.v);
        g2.font = '10px Arial'; var tw = g2.measureText(t).width;
        if (tw > w - 4) { g2.font = '8px Arial'; tw = g2.measureText(t).width; if (tw > w - 2) return; } // sem espaço: fica só o tick
        g2.fillText(t, (px(s.a) + px(s.b)) / 2 - tw / 2, y1 - 3);
      });
      g2.beginPath(); g2.moveTo(px(cad.x.total.a) - 6, y2); g2.lineTo(px(cad.x.total.b) + 6, y2); g2.stroke();
      tick(px(cad.x.total.a), y2); tick(px(cad.x.total.b), y2);
      g2.font = 'bold 11px Arial'; var tt = BimPlanta.fmtM(cad.x.total.v), ttw = g2.measureText(tt).width;
      g2.fillText(tt, (px(cad.x.total.a) + px(cad.x.total.b)) / 2 - ttw / 2, y2 - 3);
    }
    if (cad.z) {
      var x1 = geo.padL - mm(6), x2 = geo.padL - mm(12);
      g2.strokeStyle = '#888';
      cad.z.ticks.forEach(function (t) { g2.beginPath(); g2.moveTo(geo.padL - 2, py(t)); g2.lineTo(x2 - mm(1.5), py(t)); g2.stroke(); });
      g2.strokeStyle = '#111'; g2.fillStyle = '#111';
      g2.beginPath(); g2.moveTo(x1, py(cad.z.total.a) - 6); g2.lineTo(x1, py(cad.z.total.b) + 6); g2.stroke();
      cad.z.ticks.forEach(function (t) { tick(x1, py(t)); });
      cad.z.segs.forEach(function (s) {
        var h = py(s.b) - py(s.a), t = BimPlanta.fmtM(s.v);
        g2.font = '10px Arial'; var tw = g2.measureText(t).width;
        if (tw > h - 4) { g2.font = '8px Arial'; tw = g2.measureText(t).width; if (tw > h - 2) return; }
        g2.save(); g2.translate(x1 - 3, (py(s.a) + py(s.b)) / 2 + tw / 2); g2.rotate(-Math.PI / 2); g2.fillText(t, 0, 0); g2.restore();
      });
      g2.beginPath(); g2.moveTo(x2, py(cad.z.total.a) - 6); g2.lineTo(x2, py(cad.z.total.b) + 6); g2.stroke();
      tick(x2, py(cad.z.total.a)); tick(x2, py(cad.z.total.b));
      g2.save(); g2.font = 'bold 11px Arial'; var tz = BimPlanta.fmtM(cad.z.total.v), tzw = g2.measureText(tz).width;
      g2.translate(x2 - 3, (py(cad.z.total.a) + py(cad.z.total.b)) / 2 + tzw / 2); g2.rotate(-Math.PI / 2); g2.fillText(tz, 0, 0); g2.restore();
    }
  }

  function gerarPlantaTec(o) {
    // o: {y (altura do corte no MUNDO, metros), escala, cotas, prof, rotAlt}
    var box = new THREE.Box3().setFromObject(modelRoot);
    if (box.isEmpty()) return null;
    var minX = box.min.x, maxX = box.max.x, minZ = box.min.z, maxZ = box.max.z;
    var margem = Math.max(0.4, Math.max(maxX - minX, maxZ - minZ) * 0.03);
    var wM = (maxX - minX) + margem * 2, hM = (maxZ - minZ) + margem * 2;
    var escBase = o.escala || 50, PPM96 = 96 / 25.4;
    // mesmo cap honesto do corte técnico: se a escala pedida estoura a GPU, sobe pra próxima da
    // série padrão (medível com escalímetro) e recomputa px/m EXATO — carimbo == pixels
    var MAXPX = Math.min(4096, (renderer.capabilities && renderer.capabilities.maxTextureSize) || 4096);
    var escalaEf = escBase, pxM = PPM96 * (1000 / escalaEf);
    if (Math.max(wM, hM) * pxM > MAXPX) {
      escalaEf = null;
      for (var si = 0; si < SERIE_ESC.length; si++) { if (SERIE_ESC[si] >= escBase && Math.max(wM, hM) * (PPM96 * (1000 / SERIE_ESC[si])) <= MAXPX) { escalaEf = SERIE_ESC[si]; break; } }
      if (escalaEf == null) { escalaEf = Math.ceil(PPM96 * 1000 / (MAXPX / Math.max(wM, hM))); pxM = PPM96 * (1000 / escalaEf); }
      else pxM = PPM96 * (1000 / escalaEf);
    }
    var ajustada = escalaEf !== escBase;
    var W = Math.round(wM * pxM), H = Math.round(hM * pxM);
    var cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    var recuo = 0.02, prof = Math.max(0.5, +o.prof || 3);
    var secPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), o.y); // mantém o que está ABAIXO do corte
    var cam = new THREE.OrthographicCamera(-wM / 2, wM / 2, hM / 2, -hM / 2, 0.01, recuo + prof);
    cam.position.set(cx, o.y + recuo, cz);
    cam.up.set(0, 0, -1); // norte pra cima (X do modelo pra direita)
    cam.lookAt(cx, o.y - 1, cz); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    var prevClip = renderer.clippingPlanes, prevLocal = renderer.localClippingEnabled;
    var prevClear = renderer.getClearColor(new THREE.Color()).clone(), prevAlpha = renderer.getClearAlpha();
    var prevTone = renderer.toneMapping, prevAuto = renderer.autoClear;
    var rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true, stencilBuffer: true }), buf = null, edgesRoot = null, matMassa = null, matLinha = null, escondidos = [];
    var stBack = null, stFront = null, capMat = null, capGeo = null, hatchTex = null;
    try {
      renderer.clippingPlanes = [secPlane]; renderer.localClippingEnabled = false;
      renderer.toneMapping = THREE.NoToneMapping; // P&B fiel
      scene.children.forEach(function (c) { if (c !== modelRoot && c.visible !== false) { escondidos.push(c); c.visible = false; } });
      // PASSE 1 — massas cinza-claro sobre branco
      matMassa = new THREE.MeshBasicMaterial({ color: 0xededed, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      scene.overrideMaterial = matMassa;
      renderer.setRenderTarget(rt); renderer.setClearColor(0xffffff, 1); renderer.clear();
      renderer.render(scene, cam);
      scene.overrideMaterial = null;
      // PASSE 1.5 — HACHURA nas paredes cortadas (paridade de stencil, mesma técnica do corte
      // técnico; câmera do stencil com far cobrindo o modelo INTEIRO abaixo do corte)
      renderer.autoClear = false;
      var camSt = cam.clone(); camSt.far = recuo + Math.max(0.5, o.y - box.min.y) + 1; camSt.updateProjectionMatrix();
      stBack = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, side: THREE.BackSide,
        stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: THREE.IncrementWrapStencilOp, stencilZFail: THREE.IncrementWrapStencilOp, stencilZPass: THREE.IncrementWrapStencilOp });
      stFront = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, side: THREE.FrontSide,
        stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: THREE.DecrementWrapStencilOp, stencilZFail: THREE.DecrementWrapStencilOp, stencilZPass: THREE.DecrementWrapStencilOp });
      scene.overrideMaterial = stBack; renderer.render(scene, camSt);
      scene.overrideMaterial = stFront; renderer.render(scene, camSt);
      scene.overrideMaterial = null;
      var hcv = document.createElement('canvas'); hcv.width = hcv.height = 32;
      var hg = hcv.getContext('2d');
      hg.fillStyle = '#dfdfdf'; hg.fillRect(0, 0, 32, 32);
      hg.strokeStyle = '#141414'; hg.lineWidth = 2.4;
      hg.beginPath(); hg.moveTo(-4, 36); hg.lineTo(36, -4); hg.moveTo(-20, 20); hg.lineTo(20, -20); hg.moveTo(12, 52); hg.lineTo(52, 12); hg.stroke();
      hatchTex = new THREE.CanvasTexture(hcv);
      hatchTex.wrapS = hatchTex.wrapT = THREE.RepeatWrapping; hatchTex.minFilter = THREE.LinearFilter;
      var esp = 0.0028 * escalaEf; // ~2 mm no papel em qualquer escala
      hatchTex.repeat.set(wM / esp, hM / esp);
      capMat = new THREE.MeshBasicMaterial({ map: hatchTex, depthTest: true, depthFunc: THREE.AlwaysDepth, depthWrite: true, side: THREE.DoubleSide,
        stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.ZeroStencilOp, stencilZFail: THREE.ZeroStencilOp, stencilZPass: THREE.ZeroStencilOp });
      capGeo = new THREE.PlaneGeometry(wM, hM);
      var capQuad = new THREE.Mesh(capGeo, capMat);
      capQuad.rotation.x = Math.PI / 2; // XY -> XZ, normal pra baixo (lado mantido pelo clip)
      capQuad.position.set(cx, o.y - 1e-3, cz); // um fio ALÉM do plano, no lado mantido
      var capScene = new THREE.Scene(); capScene.add(capQuad);
      renderer.render(capScene, camSt);
      // PASSE 2 — arestas pretas
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
      // restaura o viewer SEMPRE (mesma disciplina do corte técnico)
      scene.overrideMaterial = null; renderer.autoClear = prevAuto; modelRoot.visible = true;
      if (edgesRoot) { scene.remove(edgesRoot); edgesRoot.children.forEach(function (ls) { if (ls.geometry) ls.geometry.dispose(); }); }
      if (matLinha) matLinha.dispose(); if (matMassa) matMassa.dispose();
      if (stBack) stBack.dispose(); if (stFront) stFront.dispose();
      if (capMat) capMat.dispose(); if (capGeo) capGeo.dispose(); if (hatchTex) hatchTex.dispose();
      escondidos.forEach(function (c) { c.visible = true; });
      renderer.setRenderTarget(null); try { rt.dispose(); } catch (_) {}
      renderer.clippingPlanes = prevClip; renderer.localClippingEnabled = prevLocal;
      renderer.setClearColor(prevClear, prevAlpha); renderer.toneMapping = prevTone;
    }
    if (!buf) return null;
    // COTAS AUTOMÁTICAS — só paredes VISÍVEIS que o corte atravessa (motor puro BimPlanta)
    var cad = null;
    if (o.cotas && typeof BimPlanta !== 'undefined') {
      var els = [];
      S.modelos.forEach(function (mo) {
        if (mo.visivel === false) return;
        (mo.elementos || []).forEach(function (el) {
          if (!el.aabb) return;
          var m = S.meshPorUid[el.uid];
          if (!m || !m.visible || !cadeiaVisivel(m)) return;
          els.push({ tipo: el.tipo, aabb: el.aabb });
        });
      });
      cad = BimPlanta.cadeias(BimPlanta.paredesDoCorte(els, o.y));
    }
    var temCotas = !!(cad && (cad.x || cad.z));
    // avisos honestos numa FAIXA reservada no topo (nunca por cima do desenho)
    var avisos = [];
    if (cad && cad.diagonais) avisos.push('⚠ ' + cad.diagonais + ' parede(s) fora de esquadro/curtas sem cota automática — meça com a trena');
    if (o.cotas && !temCotas) avisos.push('⚠ Nenhuma parede reta atravessa o corte — sem cotas automáticas');
    var padTop = avisos.length ? (avisos.length * 15 + 8) : 0;
    var padL = (cad && cad.z) ? Math.round(17 * PPM96) : 0; // 17 mm p/ cadeia vertical
    var padB = (cad && cad.x) ? Math.round(17 * PPM96) : 0;
    var faixa = 46, totalW = padL + W, totalH = padTop + H + padB + faixa, yBase = padTop + H + padB;
    var cnv = document.createElement('canvas'); cnv.width = totalW; cnv.height = totalH;
    var g2 = cnv.getContext('2d');
    g2.fillStyle = '#fff'; g2.fillRect(0, 0, totalW, totalH);
    var img = g2.createImageData(W, H);
    for (var y2f = 0; y2f < H; y2f++) { var srcY = (H - 1 - y2f) * W * 4; img.data.set(buf.subarray(srcY, srcY + W * 4), y2f * W * 4); }
    g2.putImageData(img, padL, padTop); // putImageData ignora transform — posiciona direto abaixo da faixa de avisos
    if (cad) { g2.save(); g2.translate(0, padTop); desenharCotas(g2, cad, { padL: padL, H: H, pxM: pxM, x0: minX - margem, z0: minZ - margem }); g2.restore(); }
    // faixa de avisos no topo
    if (avisos.length) {
      g2.font = '11px Arial'; g2.fillStyle = '#b45309';
      for (var ai = 0; ai < avisos.length; ai++) g2.fillText(avisos[ai], 8, 16 + ai * 15);
    }
    // moldura + divisória do carimbo + escala gráfica + carimbo (mesma régua do corte técnico)
    g2.strokeStyle = '#111'; g2.lineWidth = 2; g2.strokeRect(1, 1, totalW - 2, totalH - 2);
    g2.beginPath(); g2.moveTo(1, yBase); g2.lineTo(totalW - 1, yBase); g2.stroke();
    g2.fillStyle = '#111'; var temBarra = pxM >= 8 && pxM < totalW * 0.45, barW = temBarra ? pxM + 26 : 0;
    if (temBarra) { g2.fillRect(totalW - pxM - 12, yBase + 16, pxM, 6); g2.font = '10px Arial'; g2.fillText('1 m', totalW - pxM - 12, yBase + 37); }
    var rotAlt = o.rotAlt || (fmtDist(Math.max(0, o.y - box.min.y)) + ' do piso');
    var titulo = 'PLANTA BAIXA (corte a ' + rotAlt + ')  ·  ESC 1:' + escalaEf + (ajustada ? ' (ajustada)' : '') + '  ·  OrçaPRO BIM  ·  ' + new Date().toLocaleDateString('pt-BR');
    var livre = totalW - 16 - barW, fs = 15;
    g2.font = 'bold ' + fs + 'px Arial';
    while (fs > 8 && g2.measureText(titulo).width > livre) { fs--; g2.font = 'bold ' + fs + 'px Arial'; }
    if (g2.measureText(titulo).width > livre) { titulo = 'ESC 1:' + escalaEf + (ajustada ? ' (aj.)' : ''); g2.font = 'bold 11px Arial'; }
    g2.fillStyle = '#111'; g2.fillText(titulo, 10, yBase + 29);
    return { url: cnv.toDataURL('image/png'), w: totalW, h: totalH, escala: escalaEf, pxPorMetro: pxM, ajustada: ajustada, cotas: temCotas, diagonais: cad ? cad.diagonais : 0, larguraMM: totalW / 96 * 25.4, alturaMM: totalH / 96 * 25.4 };
  }
  S._gerarPlantaTec = gerarPlantaTec;
  plantaCfg.addEventListener('click', function (e) {
    var b = e.target.closest('[data-q]'); if (!b) return; var k = b.getAttribute('data-q');
    if (k === 'cancelar') { plantaCfg.style.display = 'none'; return; }
    if (k !== 'gerar') return;
    if (!planta.on || !planta.plane) { plantaCfg.style.display = 'none'; S._hint('📐 Abra a Planta primeiro — o corte usa a altura do slider.'); return; }
    var res = gerarPlantaTec({
      y: planta.plane.constant,
      escala: +plantaCfg.querySelector('[data-q="esc"]').value,
      cotas: plantaCfg.querySelector('[data-q="cotas"]').checked,
      prof: +plantaCfg.querySelector('[data-q="prof"]').value,
      rotAlt: (cortePanel.querySelector('[data-c="v"]') || {}).textContent
    });
    plantaCfg.style.display = 'none';
    if (!res) { S._hint('📄 Carregue um modelo primeiro.'); return; }
    ctecModal._res = res;
    ctecModal._nomeArq = 'planta-baixa.png';
    ctecModal._ajustar = function () { plantaCfg.style.display = 'flex'; };
    ctecModal.querySelector('[data-r="img"]').src = res.url;
    ctecModal.querySelector('[data-r="titulo"]').textContent = 'Planta baixa — ESC 1:' + res.escala + (res.ajustada ? ' (ajustada p/ caber)' : '') + (res.cotas ? ' · cotas automáticas' : '');
    ctecModal.style.display = 'flex'; S._hint('');
  });

  // ============================================================
  // 🏢 PAVIMENTOS — lê os IfcBuildingStorey do arquivo e permite isolar um andar
  // ou gerar a planta baixa DELE (isola + corta a 1,20 m do piso do pavimento).
  // Isolamento é SÓ visibilidade (mesh.visible) — 4D/mostrarTudo (externos)
  // sobrescrevem e limpam o marcador. Merge por NOME entre modelos federados
  // (o engenheiro pensa em andares, não em arquivos).
  // ============================================================
  var pav = { isolado: null, manual: false }; // manual = isolamento via 👁 (sem nome de pavimento)
  S.pav = pav;
  // COMPOSIÇÃO COM O 4D (achado do gate — família "camada nova reintroduz o que o filtro matou"):
  // aplicarEstado guarda os "futuros" em S._fut4d; toda escrita de visibilidade do 🏢/👁 compõe
  // com ele (visível = pertence ao alvo E não é futuro) — senão isolar um pavimento ressuscitaria
  // paredes que o cronograma ainda não construiu, com o rótulo de avanço ainda na tela.
  function ehFuturo4d(m) {
    var f = S._fut4d; if (!f) return false;
    var id = m.userData.expressID;
    return !!(f[m.userData.mid + ':' + id] || f[id]);
  }
  // irmão de ehFuturo4d: elemento "em andamento" (âmbar) no estágio 4D corrente — usado no restore do raio-X
  function ehAndamento4d(m) {
    var a = S._and4d; if (!a) return false;
    var id = m.userData.expressID;
    return !!(a[m.userData.mid + ':' + id] || a[id]);
  }
  S._ehAndamento4d = ehAndamento4d;
  // malhas que o usuário REALMENTE vê (grupo do modelo ligado + mesh visível)
  function visiveisEfetivos() {
    var v = 0;
    modelRoot.children.forEach(function (g) { if (g.visible === false) return; (g.children || []).forEach(function (m) { if (m.visible) v++; }); });
    return v;
  }
  var pavPanel = document.createElement('div');
  pavPanel.style.cssText = 'position:absolute;left:10px;top:52px;z-index:4;display:none;flex-direction:column;gap:6px;background:rgba(15,39,64,.94);border:1px solid #24435f;border-radius:11px;padding:11px 13px;color:#dbe8f5;font-size:12px;width:250px;max-height:55%;overflow:auto';
  host.appendChild(pavPanel);
  S.pavPanel = pavPanel;
  function todasMalhas(fn) { modelRoot.children.forEach(function (g) { (g.children || []).forEach(fn); }); }
  // lista mesclada por nome (entre modelos), ordenada pela altura real (y0 do AABB dos membros)
  function pavLista() {
    var mapa = {}, ordem = [];
    S.modelos.forEach(function (mo) {
      (mo.pavimentos || []).forEach(function (pv) {
        var k = pv.nome.trim().toLowerCase();
        if (!mapa[k]) { mapa[k] = { nome: pv.nome.trim(), uids: {}, y0: null, yMax: null, elev: null, n: 0 }; ordem.push(mapa[k]); }
        pv.eids.forEach(function (eid) { if (!mapa[k].uids[mo.mid + ':' + eid]) { mapa[k].uids[mo.mid + ':' + eid] = 1; mapa[k].n++; } });
        // FRAMES DISTINTOS (achado do gate): y0 é MUNDO (AABB dos membros); elev é LOCAL do
        // arquivo (datum próprio, ignora placement) — NUNCA entram na mesma régua. elev fica
        // num campo separado e serve SÓ de desempate de ordenação entre pavimentos sem malha.
        if (pv.y0 != null) {
          if (mapa[k].y0 == null || pv.y0 < mapa[k].y0) mapa[k].y0 = pv.y0;
          if (mapa[k].yMax == null || pv.y0 > mapa[k].yMax) mapa[k].yMax = pv.y0;
        }
        if (pv.elev != null && (mapa[k].elev == null || pv.elev < mapa[k].elev)) mapa[k].elev = pv.elev;
      });
    });
    // merge por nome com cotas REALMENTE diferentes (blocos em desnível) -> marca p/ avisar na planta
    ordem.forEach(function (pv) { pv.spread = (pv.y0 != null && pv.yMax != null && (pv.yMax - pv.y0) > 1.5); });
    // ordena pela altura de MUNDO; sem geometria vai pro fim (ordenado entre si pelo elev local)
    ordem.sort(function (a, b) {
      var ka = (a.y0 == null) ? 1 : 0, kb = (b.y0 == null) ? 1 : 0;
      if (ka !== kb) return ka - kb;
      if (ka === 1) return (a.elev == null ? 1e9 : a.elev) - (b.elev == null ? 1e9 : b.elev);
      return a.y0 - b.y0;
    });
    return ordem;
  }
  S._pavLista = pavLista;
  function pavRender() {
    var lst = pavLista();
    var html = '<div style="display:flex;justify-content:space-between;align-items:center"><b>🏢 Pavimentos</b><button class="btn sm" data-p="todos" title="Mostrar todos os pavimentos de novo">↺ Todos</button></div>';
    if (!lst.length) {
      html += '<div style="font-size:11px;color:#9fb2c8">Este IFC não declara pavimentos (IfcBuildingStorey). Use a 📐 Planta com o slider de altura.</div>';
    } else {
      var base = null;
      lst.forEach(function (pv) { if (pv.y0 != null && (base == null || pv.y0 < base)) base = pv.y0; });
      lst.forEach(function (pv) {
        var atv = pav.isolado === pv.nome;
        var nivel = (pv.y0 != null && base != null) ? ' <span style="color:#9fb2c8;font-size:11px">nível +' + fmtDist(Math.max(0, pv.y0 - base)) + '</span>' : '';
        html += '<div style="display:flex;align-items:center;gap:5px;border:1px solid ' + (atv ? corAtiva() : 'transparent') + ';border-radius:7px;padding:2px 4px">' +
          '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(pv.nome) + ' · ' + pv.n + ' elementos">' + esc(pv.nome) + nivel + '</span>' +
          '<button class="btn sm" data-p="iso" data-n="' + esc(pv.nome) + '" title="Isolar este pavimento">🎯</button>' +
          '<button class="btn sm" data-p="pl" data-n="' + esc(pv.nome) + '" title="Planta baixa deste pavimento">📐</button></div>';
      });
      html += '<div style="font-size:11px;color:#9fb2c8">Isolar mostra só o que o IFC declara nesse andar — o que não está em pavimento nenhum também some. ↺ Todos restaura.</div>';
    }
    pavPanel.innerHTML = html;
    var bp2 = bar.querySelector('[data-b="pav"]'); if (bp2) { bp2.style.background = pav.isolado ? corAtiva() : ''; bp2.style.color = pav.isolado ? '#fff' : ''; bp2.style.outline = (pavPanel.style.display === 'flex') ? '2px solid #7fe0a3' : ''; }
  }
  S._pavRender = pavRender;
  function restaurarVisibilidade() {
    pav.isolado = null; pav.manual = false;
    if (S._limparRaioX) S._limparRaioX(); // ↺ também tira o raio-X (materiais fantasma → originais)
    todasMalhas(function (m) { m.visible = !ehFuturo4d(m) && !ehRemovidoEd(m); }); // restaurar NÃO ressuscita futuros do 4D nem removidos da edição
    pavRender();
  }
  S._restaurarVis = restaurarVisibilidade;
  function isolarPavimento(nome) {
    var lst = pavLista(), alvo = null;
    for (var i = 0; i < lst.length; i++) if (lst[i].nome === nome) { alvo = lst[i]; break; }
    if (!alvo) return false;
    todasMalhas(function (m) { m.visible = !!alvo.uids[m.userData.mid + ':' + m.userData.expressID] && !ehFuturo4d(m) && !ehRemovidoEd(m); });
    pav.isolado = alvo.nome; pav.manual = false; pavRender();
    if (visiveisEfetivos() === 0) S._hint('🏢 "' + alvo.nome + '" isolado, mas nada visível — o pavimento pertence a um modelo desligado (religue no painel Modelos) ou não tem geometria/está no futuro do 4D. ↺ Todos restaura.');
    else S._hint('🏢 Pavimento "' + alvo.nome + '" isolado. ↺ Todos (painel 🏢) restaura.');
    return true;
  }
  S._isolarPavimento = isolarPavimento;
  function plantaPavimento(nome) {
    var lst = pavLista(), alvo = null;
    for (var i = 0; i < lst.length; i++) if (lst[i].nome === nome) { alvo = lst[i]; break; }
    if (!alvo) return false;
    isolarPavimento(alvo.nome);
    if (!planta.on) setPlanta(true);
    if (!planta.on) return false; // bbox vazio
    // corte a 1,20 m do piso do PAVIMENTO (altura de peitoril), limitado à faixa do modelo
    var y = (alvo.y0 != null ? alvo.y0 : planta.y0) + 1.2;
    y = Math.max(planta.y0 + 0.05, Math.min(planta.y1 - 0.001, y));
    var frac = (y - planta.y0) / ((planta.y1 - planta.y0) || 1);
    var sl = cortePanel.querySelector('[data-c="alt"]'); if (sl) sl.value = Math.round(frac * 1000);
    setAlturaCorte(frac);
    // rótulo honesto: merge com cotas diferentes / pavimento sem geometria têm ressalva explícita
    var aviso = '';
    if (alvo.y0 == null) aviso = ' ⚠ Este pavimento não tem geometria própria — o corte ficou na base do modelo.';
    else if (alvo.spread) aviso = ' ⚠ Há "' + alvo.nome + '" em cotas diferentes entre os modelos — parte pode ficar acima do corte (ajuste no slider).';
    S._hint('📐 Planta do pavimento "' + alvo.nome + '".' + aviso + ' Ajuste fino no slider; ↺ Todos (painel 🏢) traz o prédio de volta.');
    return true;
  }
  S._plantaPavimento = plantaPavimento;
  pavPanel.addEventListener('click', function (e) {
    var b = e.target.closest('[data-p]'); if (!b) return; var k = b.getAttribute('data-p');
    if (k === 'todos') { restaurarVisibilidade(); S._hint('🏢 Todos os pavimentos visíveis.'); }
    else if (k === 'iso') isolarPavimento(b.getAttribute('data-n'));
    else if (k === 'pl') plantaPavimento(b.getAttribute('data-n'));
  });
  function togglePavPanel() {
    var abrir = (pavPanel.style.display === 'none' || !pavPanel.style.display);
    fecharPaineis(abrir ? pavPanel : null);
    pavPanel.style.display = abrir ? 'flex' : 'none';
    if (abrir) pavRender(); else { var bp3 = bar.querySelector('[data-b="pav"]'); if (bp3) bp3.style.outline = ''; }
  }

  // ============================================================
  // 👁 VISIBILIDADE — isolar/ocultar o elemento selecionado (duplo-clique) ou
  // todos do mesmo tipo. Só mexe em mesh.visible (materiais intactos).
  // ============================================================
  var visPanel = document.createElement('div');
  visPanel.style.cssText = 'position:absolute;right:10px;top:52px;z-index:4;display:none;flex-direction:column;gap:6px;background:rgba(15,39,64,.94);border:1px solid #24435f;border-radius:11px;padding:11px 13px;color:#dbe8f5;font-size:12px;width:220px';
  visPanel.innerHTML =
    '<b>👁 Visibilidade</b>' +
    '<button class="btn sm" data-v="iso" title="Esconde tudo, menos o elemento selecionado">🎯 Isolar seleção</button>' +
    '<button class="btn sm" data-v="occ" title="Esconde o elemento selecionado">🙈 Ocultar seleção</button>' +
    '<button class="btn sm" data-v="tipo" title="Mostra só os elementos do MESMO tipo do selecionado (ex.: todas as paredes)">🧩 Só este tipo</button>' +
    '<button class="btn sm" data-v="rx" title="Raio-X: deixa o resto translúcido (não some) e destaca o elemento. Enxergue o que está atrás/dentro.">🫥 Raio-X da seleção</button>' +
    '<button class="btn sm" data-v="rxt" title="Raio-X por tipo: destaca todos deste tipo (ex.: toda a hidráulica) e translucidez o resto — bom pra ver onde há cano antes de furar.">🫥 Raio-X deste tipo</button>' +
    '<button class="btn sm" data-v="tudo" title="Volta a mostrar tudo">↺ Restaurar tudo</button>' +
    '<div style="font-size:11px;color:#9fb2c8">Dê <b>dois cliques</b> num elemento do modelo pra selecionar antes.</div>';
  host.appendChild(visPanel);
  S.visPanel = visPanel;
  function selInfo() { return (S.selected && S.selected.userData && S.selected.userData.expressID != null) ? { mid: S.selected.userData.mid, eid: S.selected.userData.expressID, tipo: S.selected.userData.tipo } : null; }
  function isolarSelecao() {
    var si = selInfo(); if (!si) { S._hint('👁 Dê dois cliques num elemento do modelo primeiro.'); return; }
    todasMalhas(function (m) { m.visible = (m.userData.mid === si.mid && m.userData.expressID === si.eid) && !ehFuturo4d(m) && !ehRemovidoEd(m); });
    pav.isolado = null; pav.manual = true; pavRender(); // isolamento manual substitui o de pavimento (e é restaurável)
    if (visiveisEfetivos() === 0) S._hint('🎯 Isolado, mas nada visível — o modelo desse elemento está desligado no painel Modelos. ↺ Restaurar tudo volta o modelo.');
    else S._hint('🎯 Elemento isolado. ↺ Restaurar tudo (painel 👁) volta o modelo.');
  }
  S._isolarSelecao = isolarSelecao;
  function ocultarSelecao() {
    var si = selInfo(); if (!si) { S._hint('👁 Dê dois cliques num elemento do modelo primeiro.'); return; }
    // devolve o material e desseleciona ANTES de esconder — senão o selMat fica preso no mesh oculto
    if (S.selected) { S.selected.material = S.prevMat; S.selected = null; S.prevMat = null; contornoSelecao(null); if (opts.onPick) { try { opts.onPick(null); } catch (_) {} } } // contornoSelecao(null): senão o contorno verde fica flutuando sobre o vazio (gate v1.1.89)
    todasMalhas(function (m) { if (m.userData.mid === si.mid && m.userData.expressID === si.eid) m.visible = false; });
    pav.manual = true; // remover/carregar modelo restaura (nada fica escondido "pra sempre" sem marcador)
    S._hint('🙈 Elemento oculto. ↺ Restaurar tudo (painel 👁) traz de volta.');
  }
  S._ocultarSelecao = ocultarSelecao;
  function isolarTipo() {
    var si = selInfo(); if (!si) { S._hint('👁 Dê dois cliques num elemento do modelo primeiro.'); return; }
    todasMalhas(function (m) { m.visible = (m.userData.tipo === si.tipo) && !ehFuturo4d(m) && !ehRemovidoEd(m); });
    pav.isolado = null; pav.manual = true; pavRender();
    if (visiveisEfetivos() === 0) S._hint('🧩 Só "' + rotuloDisciplina(si.tipo) + '", mas nada visível — o modelo está desligado no painel Modelos. ↺ Restaurar tudo volta.');
    else S._hint('🧩 Mostrando só "' + rotuloDisciplina(si.tipo) + '". ↺ Restaurar tudo volta o modelo.');
  }
  S._isolarTipo = isolarTipo;
  // ---- 🫥 RAIO-X: deixa o resto translúcido (não oculto) para ver o que está DENTRO/ATRÁS
  //      (ex.: onde passa cano/eletroduto antes de furar a parede) — material fantasma, restaurável.
  var xray = { on: false, ghosted: [] };
  var _ghostMat = null;
  function ghostMat() { if (!_ghostMat) _ghostMat = new THREE.MeshStandardMaterial({ color: 0x93a7bd, transparent: true, opacity: .1, depthWrite: false, metalness: 0, roughness: 1, side: THREE.DoubleSide }); return _ghostMat; }
  function limparRaioX() { if (!xray.on) return; xray.ghosted.forEach(function (m) { m.material = ehAndamento4d(m) ? S.matAndamento : matBase(m); }); xray.ghosted = []; xray.on = false; } // devolve o âmbar do 4D a quem estava "em andamento" (senão o restore mostra como concluído)
  S._limparRaioX = limparRaioX;
  function aplicarRaioX(ehAlvo, msg) {
    limparRaioX();
    xray.on = true; // ANTES do loop: senão o aborto abaixo chama limparRaioX() com xray.on=false e ele sai no early-return, deixando o modelo translúcido travado (gate v1.1.89)
    var nAlvo = 0;
    todasMalhas(function (m) {
      if (m.userData.expressID == null) return;
      if (ehFuturo4d(m) || ehRemovidoEd(m) || !m.visible) return; // não fantasmiza futuro/removido/já-oculto
      if (ehAlvo(m)) { nAlvo++; return; } // alvo permanece sólido
      m.material = ghostMat(); xray.ghosted.push(m);
    });
    if (!nAlvo) { limparRaioX(); S._hint('🫥 Nada correspondeu ao alvo do raio-X.'); return; } // agora restaura de verdade
    S._hint(msg);
  }
  function raioXSelecao() {
    var si = selInfo(); if (!si) { S._hint('👁 Dê dois cliques num elemento primeiro.'); return; }
    aplicarRaioX(function (m) { return m.userData.mid === si.mid && m.userData.expressID === si.eid; }, '🫥 Raio-X: elemento em destaque, resto translúcido. ↺ Restaurar tudo volta.');
    if (S.selected) contornoSelecao(S.selected);
  }
  function raioXTipo() {
    var si = selInfo(); if (!si) { S._hint('👁 Dê dois cliques num elemento primeiro.'); return; }
    aplicarRaioX(function (m) { return m.userData.tipo === si.tipo; }, '🫥 Raio-X de "' + rotuloDisciplina(si.tipo) + '": resto translúcido — bom pra ver onde há cano/eletroduto antes de furar. ↺ Restaurar tudo volta.');
  }
  S._raioXSelecao = raioXSelecao; S._raioXTipo = raioXTipo;
  visPanel.addEventListener('click', function (e) {
    var b = e.target.closest('[data-v]'); if (!b) return; var k = b.getAttribute('data-v');
    if (k === 'iso') isolarSelecao();
    else if (k === 'occ') ocultarSelecao();
    else if (k === 'tipo') isolarTipo();
    else if (k === 'rx') raioXSelecao();
    else if (k === 'rxt') raioXTipo();
    else if (k === 'tudo') { restaurarVisibilidade(); S._hint('↺ Tudo visível de novo.'); }
  });
  function toggleVisPanel() {
    var abrir = (visPanel.style.display === 'none' || !visPanel.style.display);
    fecharPaineis(abrir ? visPanel : null);
    visPanel.style.display = abrir ? 'flex' : 'none';
    var bv = bar.querySelector('[data-b="vis"]'); if (bv) bv.style.outline = abrir ? '2px solid #7fe0a3' : '';
  }
  // um painel flutuante por vez (snap/pav/vis disputam os cantos da tela)
  function fecharPaineis(exceto) {
    // abrir um painel flutuante fecha o editor (senão o painel nasce ATRÁS dele, invisível)
    if (exceto && edit && edit.on && typeof setEdit === 'function') setEdit(false);
    [snapPanel, pavPanel, visPanel, xrPanel].forEach(function (pn) { if (pn !== exceto) pn.style.display = 'none'; });
    pintarSnapPanel();
    var bp4 = bar.querySelector('[data-b="pav"]'); if (bp4 && pavPanel.style.display !== 'flex') bp4.style.outline = '';
    var bv2 = bar.querySelector('[data-b="vis"]'); if (bv2 && visPanel.style.display !== 'flex') bv2.style.outline = '';
  }
  S._fecharPaineis = fecharPaineis;
  // toolbar com flex-wrap pode ter 2+ linhas em tela estreita: hint/painéis ancoram ABAIXO da
  // altura REAL da barra (o top:52px fixo cobriria a 2ª linha de botões)
  function ajustarTopFlutuantes() {
    // barra recolhida (offsetHeight 0): ancora os painéis ABAIXO do botão flutuante de ferramentas
    var bh = (bar && bar.offsetHeight) || 0;
    var t = bh ? bh + 8 : 44;
    [hint, snapPanel, pavPanel, visPanel, xrPanel].forEach(function (el) { if (el) el.style.top = t + 'px'; });
  }
  S._ajustarTop = ajustarTopFlutuantes;
  ajustarTopFlutuantes();
  window.addEventListener('resize', ajustarTopFlutuantes);

  // ============================================================
  // 📸 FOTO — captura o canvas (render síncrono + toDataURL, funciona com
  // preserveDrawingBuffer:false) e compõe carimbo. O fundo é gradiente CSS
  // (não sai na captura) -> pinta um fundo sólido só durante o render.
  // ============================================================
  // v1.1.82 — thumbnail de UM elemento (banco de famílias / quantitativo ilustrado): salva a
  // visibilidade REAL de cada malha + câmera, isola as malhas do elemento, enquadra pelo AABB,
  // renderiza síncrono (preserveDrawingBuffer=false: render+toDataURL na MESMA task), reduz p/
  // maxPx e RESTAURA tudo (visibilidade por malha — não usa restaurarVisibilidade, que apagaria
  // um isolamento que o usuário tinha feito). Devolve dataURL jpeg ou null.
  function thumbFamilia(uid, maxPx) {
    try {
      if (!S.modelos.length) return null;
      var px = uid.lastIndexOf(':'); if (px < 0) return null;
      var midStr = uid.slice(0, px), eidRaw = uid.slice(px + 1);
      var alvoEid = /^\d+$/.test(eidRaw) ? +eidRaw : eidRaw; // ids do editor são strings 'eN'
      var alvoMid = /^\d+$/.test(midStr) ? +midStr : midStr;
      var mo = modeloDe(alvoMid); if (!mo) return null;
      var elA = (mo.elementos || []).filter(function (e) { return e.id === alvoEid; })[0];
      var aabb = elA && elA.aabb; if (!aabb) return null;
      // snapshot: visibilidade por MALHA (não usa restaurarVisibilidade — apagaria isolamento do usuário)
      // + MATERIAL ORIGINAL das malhas do alvo (seleção verde/4D âmbar/clash não podem sair na foto)
      var visAntes = [], matAntes = [];
      cadaMalha(function (m) {
        visAntes.push([m, m.visible]);
        var ehAlvo = (m.userData.mid === alvoMid && m.userData.expressID === alvoEid);
        m.visible = ehAlvo;
        if (ehAlvo && m.userData.matOrig && m.material !== m.userData.matOrig) { matAntes.push([m, m.material]); m.material = m.userData.matOrig; }
      });
      var gAntes = []; modelRoot.children.forEach(function (g) { gAntes.push([g, g.visible]); g.visible = true; });
      if (S._edgesEstilo) S._edgesEstilo(false); // estilo desenho ligado: sem wireframe preto na foto da família
      // grid, cotas, pins e avatares vivem FORA do modelRoot — esconde (menos as LUZES, senão a foto sai preta)
      var cenaAntes = [];
      scene.children.forEach(function (c) { if (c !== modelRoot && !c.isLight && c.visible) { cenaAntes.push(c); c.visible = false; } });
      var camPos = camera.position.clone(), camNear = camera.near, camFar = camera.far, tgt = orbit.target.clone();
      var clipAntes = renderer.clippingPlanes; renderer.clippingPlanes = [];
      var prevBg = scene.background, thumb = null;
      try {
        var cx = (aabb.min[0] + aabb.max[0]) / 2, cy = (aabb.min[1] + aabb.max[1]) / 2, cz = (aabb.min[2] + aabb.max[2]) / 2;
        var dim = Math.max(aabb.max[0] - aabb.min[0], aabb.max[1] - aabb.min[1], aabb.max[2] - aabb.min[2]) || 1;
        var dist = dim * 1.9;
        camera.position.set(cx + dist * 0.72, cy + dist * 0.5, cz + dist * 0.72);
        camera.near = dim / 100; camera.far = dim * 50; camera.updateProjectionMatrix();
        camera.lookAt(cx, cy, cz);
        scene.background = new THREE.Color(0xf3f6fa); // fundo claro: legível no impresso
        renderer.render(scene, camera); // preserveDrawingBuffer=false → drawImage na MESMA task
        var srcCnv = renderer.domElement, lado = Math.min(srcCnv.width, srcCnv.height);
        var out = document.createElement('canvas'); var mp = maxPx || 220; out.width = mp; out.height = mp;
        out.getContext('2d').drawImage(srcCnv, (srcCnv.width - lado) / 2, (srcCnv.height - lado) / 2, lado, lado, 0, 0, mp, mp);
        thumb = out.toDataURL('image/jpeg', 0.85);
      } catch (_) { thumb = null; }
      // restaura TUDO
      scene.background = prevBg;
      renderer.clippingPlanes = clipAntes;
      matAntes.forEach(function (par) { par[0].material = par[1]; });
      visAntes.forEach(function (par) { par[0].visible = par[1]; });
      gAntes.forEach(function (par) { par[0].visible = par[1]; });
      cenaAntes.forEach(function (c) { c.visible = true; });
      camera.position.copy(camPos); camera.near = camNear; camera.far = camFar; camera.updateProjectionMatrix();
      orbit.target.copy(tgt); orbit.update();
      return thumb;
    } catch (e) { return null; }
  }

  S._thumbFamilia = thumbFamilia;
  S._propsCompletas = function (uid) { // uid 'mid:eid' → grupos de propriedades
    try {
      var px = uid.lastIndexOf(':'); if (px < 0) return [];
      var midStr = uid.slice(0, px), eidRaw2 = uid.slice(px + 1);
      var eid2 = /^\d+$/.test(eidRaw2) ? +eidRaw2 : eidRaw2; // 'eN' do editor é string
      return propsCompletas(/^\d+$/.test(midStr) ? +midStr : midStr, eid2);
    } catch (e) { return []; }
  };

  function tirarFoto() {
    if (!S.modelos.length) { S._hint('📸 Carregue um modelo primeiro.'); return null; }
    var prevBg = scene.background, url;
    var vLn = _selLn ? _selLn.visible : null; // o contorno verde de seleção é overlay de UI: não sai no PNG entregável
    try {
      scene.background = new THREE.Color(estiloD.on ? 0xffffff : 0x0d1f33); // estilo desenho: foto sai no branco
      if (_selLn) _selLn.visible = false;
      renderer.render(scene, camera);
      url = renderer.domElement.toDataURL('image/png');
    } catch (_) { url = null; } finally { scene.background = prevBg; if (_selLn && vLn !== null) _selLn.visible = vLn; }
    if (!url) { S._hint('📸 Não consegui capturar a imagem.'); return null; }
    var img = new Image();
    img.onload = function () {
      try {
        var faixa = 44, cnv = document.createElement('canvas');
        cnv.width = img.width; cnv.height = img.height + faixa;
        var g2 = cnv.getContext('2d');
        g2.drawImage(img, 0, 0);
        g2.fillStyle = '#0b1a2b'; g2.fillRect(0, img.height, cnv.width, faixa);
        // carimbo HONESTO: conta ELEMENTOS efetivamente visíveis (isolamento/4D/modelo desligado
        // reduzem) e declara "vista filtrada" quando não é o modelo inteiro
        var tot = 0; S.modelos.forEach(function (mo) { tot += mo.nEl || 0; });
        var visSet = {};
        modelRoot.children.forEach(function (g) { if (g.visible === false) return; (g.children || []).forEach(function (m) { if (m.visible && m.userData.expressID != null) visSet[m.userData.mid + ':' + m.userData.expressID] = 1; }); });
        var nv = Object.keys(visSet).length;
        // planta/corte escondem via clippingPlanes (GPU) sem tocar mesh.visible -> também é vista parcial
        var cortado = (renderer.clippingPlanes || []).length > 0;
        var rotEl = nv < tot ? (nv + ' de ' + tot + ' elementos (vista filtrada)') : (cortado ? (tot + ' elementos (vista cortada)') : (tot + ' elementos'));
        g2.fillStyle = '#7fe0a3'; g2.font = 'bold 16px Segoe UI, Arial';
        g2.fillText('OrçaPRO BIM · ' + new Date().toLocaleString('pt-BR') + ' · ' + rotEl + (pav.isolado ? ' · pavimento: ' + pav.isolado : ''), 12, img.height + 28);
        var a2 = document.createElement('a'); a2.href = cnv.toDataURL('image/png'); a2.download = 'bim-foto.png'; a2.click();
        S._hint('📸 Foto salva (bim-foto.png).');
      } catch (_) { S._hint('📸 Não consegui montar o arquivo da foto.'); }
    };
    img.src = url;
    return url; // p/ testes (dataURL do render puro)
  }
  S._tirarFoto = tirarFoto;

  // ============================================================
  // 🥽 RA/RV — Realidade Mista e Virtual (v1.1.84)
  // Andar dentro do modelo em escala REAL (1:1) ou escolhida, medir na
  // escala, cortar a altura de visão, filtrar por DISCIPLINA e — no
  // Android/Chrome — colocar o projeto no ambiente com a câmera (RA).
  // O modo "Caminhar" funciona em QUALQUER aparelho (não exige WebXR),
  // então iPhone/iPad entram por ele. Tudo restaura ao sair.
  // ============================================================
  var EYE = 1.6; // altura dos olhos ao caminhar (m)
  var xr = { on: false, mode: null, escala: 1, session: null, hitSrc: null, reticle: null,
             placed: false, travado: false, prevClip: null, clip: null, prevLocal: false,
             cam: null, look: { yaw: 0, pitch: 0 }, joy: { x: 0, z: 0 }, ori: false, oriBase: null,
             modelSnap: null, medir: { on: false, pts: [], objs: [] }, discOcultas: {} };
  S.xr = xr;

  // painel de controle (fica sobre o canvas; entra no re-home)
  var xrPanel = document.createElement('div');
  xrPanel.style.cssText = 'position:absolute;left:10px;top:52px;z-index:5;display:none;flex-direction:column;gap:8px;background:rgba(15,39,64,.96);border:1px solid #24435f;border-radius:12px;padding:12px 13px;color:#dbe8f5;font-size:12px;width:250px;max-height:78vh;overflow:auto';
  host.appendChild(xrPanel);
  S.xrPanel = xrPanel;
  // HUD imersivo (joystick + sair + mira) — some quando não está no modo
  var xrHud = document.createElement('div');
  xrHud.style.cssText = 'position:absolute;inset:0;z-index:6;display:none;pointer-events:none';
  host.appendChild(xrHud);
  S.xrHud = xrHud;

  function xrSupport(modo) { return !!(navigator.xr && navigator.xr.isSessionSupported) ? navigator.xr.isSessionSupported(modo).catch(function () { return false; }) : Promise.resolve(false); }

  function pintarXRPanel() {
    var box = new THREE.Box3().setFromObject(modelRoot);
    var vazio = box.isEmpty();
    var discs = disciplinasPresentes();
    var html = '<div style="display:flex;justify-content:space-between;align-items:center"><b>🥽 Realidade Mista / Virtual</b><button class="btn sm" data-x="fechar" title="Fechar painel">✕</button></div>';
    if (vazio) { html += '<div style="font-size:11px;color:#9fb2c8">Carregue um modelo primeiro.</div>'; xrPanel.innerHTML = html; return; }
    if (!xr.on) {
      html += '<div style="font-size:11px;color:#9fb2c8">Veja o projeto no ambiente ou ande dentro dele. Escolha o modo:</div>' +
        '<button class="btn sm primary" data-x="camera" style="width:100%">📷 Câmera + Projeto (ver no seu ambiente)</button>' +
        '<button class="btn sm" data-x="caminhar" style="width:100%">👣 Caminhar no projeto (fundo liso)</button>' +
        '<button class="btn sm" data-x="ar" style="width:100%" disabled>📱 RA com âncora (Android) <span data-x="arst" style="color:#9fb2c8">(verificando…)</span></button>' +
        '<button class="btn sm" data-x="vr" style="width:100%" disabled>🥽 VR imersivo <span data-x="vrst" style="color:#9fb2c8">(verificando…)</span></button>' +
        '<div style="font-size:11px;color:#9fb2c8;line-height:1.35">📷 <b>funciona no iPhone e Android</b>: liga a câmera e o projeto aparece no ambiente real — mova o celular pra olhar, joystick pra chegar perto (precisa HTTPS: use o link ☁️ da nuvem). 📱 RA com âncora (fixa no chão) só no Android/ARCore.</div>';
    } else {
      var em = xr.mode === 'ar' ? '📱 RA no ambiente' : xr.mode === 'vr' ? '🥽 VR imersivo' : xr.mode === 'camera' ? '📷 Câmera + Projeto' : '👣 Caminhando';
      html += '<div style="font-size:11px;color:#7fe0a3"><b>' + em + '</b> ativo</div>';
      // escala: só no AR (mesa). Andar/VR é sempre 1:1 (escala real — é o sentido de "andar dentro")
      if (xr.mode === 'ar') {
        var ESCS = [['1', '1:1 (real)'], ['0.04', '1:25'], ['0.02', '1:50'], ['0.01', '1:100'], ['0.005', '1:200']];
        html += '<label style="display:flex;justify-content:space-between;align-items:center">Escala <select data-x="esc" class="inp" style="width:120px">' +
          ESCS.map(function (o) { return '<option value="' + o[0] + '"' + (Math.abs(parseFloat(o[0]) - (xr.escala || 1)) < 1e-6 ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>';
      } else {
        html += '<div style="font-size:11px;color:#9fb2c8">Você caminha em <b>escala real 1:1</b>. (Escala reduzida fica na 📱 RA de mesa.)</div>';
      }
      // altura do corte de visão (reflete o valor atual — não reseta no repaint)
      var cf = (xr.cortefrac == null ? 1000 : xr.cortefrac);
      html += '<div style="display:flex;justify-content:space-between;align-items:baseline"><span>✂️ Teto de visão</span><span data-x="cortev" style="color:#7fe0a3">' + (cf >= 999 ? 'inteiro' : '') + '</span></div>' +
        '<input type="range" data-x="corte" min="0" max="1000" value="' + cf + '" style="width:100%;accent-color:#22c55e">';
      // medir
      html += '<button class="btn sm" data-x="medir" style="width:100%">📏 Medir na escala (toque 2 pontos)</button>';
      // disciplinas
      if (discs.length > 1) {
        html += '<div style="font-size:11px;color:#9fb2c8;margin-top:2px">Disciplinas (toque pra ligar/desligar):</div><div style="display:flex;flex-wrap:wrap;gap:5px">';
        discs.forEach(function (d) {
          var off = !!xr.discOcultas[d.chave];
          html += '<button class="btn sm" data-xd="' + esc(d.chave) + '" style="' + (off ? 'opacity:.45' : 'background:' + corAtiva() + ';color:#fff') + '">' + esc(d.nome) + '</button>';
        });
        html += '</div>';
      }
      if (xr.mode === 'ar') {
        html += '<button class="btn sm" data-x="travar" style="width:100%">' + (xr.travado ? '🔓 Destravar do ponto' : '🔒 Travar neste ponto') + '</button>' +
          '<div style="font-size:11px;color:#9fb2c8;line-height:1.3">Aponte pro chão, toque pra fixar o projeto no lugar real; trave pra ele não sair do lugar.</div>';
      }
      html += '<button class="btn sm" data-x="sair" style="width:100%">⏹ Sair do imersivo</button>';
    }
    xrPanel.innerHTML = html;
    if (!xr.on && !vazio) {
      // habilita VR/AR conforme suporte real do aparelho
      xrSupport('immersive-vr').then(function (ok) { var b = xrPanel.querySelector('[data-x="vr"]'), st = xrPanel.querySelector('[data-x="vrst"]'); if (!b) return; b.disabled = !ok; if (st) st.textContent = ok ? '' : '(indisponível aqui)'; });
      xrSupport('immersive-ar').then(function (ok) { var b = xrPanel.querySelector('[data-x="ar"]'), st = xrPanel.querySelector('[data-x="arst"]'); if (!b) return; b.disabled = !ok; if (st) st.textContent = ok ? '' : '(precisa Android/ARCore)'; });
    }
  }
  function disciplinasPresentes() {
    var mapa = {};
    S.modelos.forEach(function (mo) { var d = (mo.disciplina || 'outros'); if (!mapa[d]) mapa[d] = { chave: d, nome: nomeDisc(d), n: 0 }; mapa[d].n += mo.elementos.length; });
    return Object.keys(mapa).map(function (k) { return mapa[k]; });
  }
  function nomeDisc(d) { var M = { arquitetura: 'Arquitetura', estrutura: 'Estrutura', hidraulica: 'Hidráulica', eletrica: 'Elétrica', mecanica: 'Mecânica', incendio: 'Incêndio', outros: 'Outros' }; return M[d] || (d.charAt(0).toUpperCase() + d.slice(1)); }

  function toggleXRPanel() {
    if (xrPanel.style.display === 'flex') { xrPanel.style.display = 'none'; return; }
    if (S._fecharPaineis) S._fecharPaineis(xrPanel);
    pintarXRPanel(); xrPanel.style.display = 'flex';
    if (S._ajustarTop) S._ajustarTop();
  }
  S._toggleXR = toggleXRPanel;

  // ---- qualidade: sombras só no imersivo e só se o modelo não for gigante ----
  function ligarSombras(on) {
    var tri = 0; S.modelos.forEach(function (mo) { tri += mo.nTri || 0; });
    if (on && tri > 1800000) return false; // modelo pesado: sombra travaria — segue sem
    dir.castShadow = !!on;
    todasMalhas(function (m) { if (m.geometry) { m.castShadow = !!on; m.receiveShadow = !!on; } });
    return true;
  }

  // ---- escala: só na RA de mesa (AR). Andar/VR é sempre 1:1 (escala real) — escalar o
  // modelRoot em torno da origem no Caminhar jogava a câmera pra fora do modelo (achado do gate).
  function aplicarEscalaXR(f) {
    if (xr.mode !== 'ar') { xr.escala = 1; return; } // caminhar/VR ignoram escala
    xr.escala = f || 1;
    if (xr.placed) posicionarModeloAR();
  }

  // ---- teto de visão (corte horizontal que esconde o que está acima) ----
  function aplicarTetoVisao(frac) {
    var box = new THREE.Box3().setFromObject(modelRoot); if (box.isEmpty()) return;
    xr.cortefrac = Math.round(frac * 1000); // lembra a posição p/ o repaint não resetar
    var y = box.min.y + (box.max.y - box.min.y) * frac;
    var rot = xrPanel.querySelector('[data-x="cortev"]');
    if (frac >= 0.999) { renderer.clippingPlanes = xr.prevClip || []; renderer.localClippingEnabled = xr.prevLocal; if (rot) rot.textContent = 'inteiro'; return; }
    if (!xr.clip) xr.clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    xr.clip.constant = y;
    renderer.localClippingEnabled = true; renderer.clippingPlanes = [xr.clip];
    if (rot) rot.textContent = fmtDist(Math.max(0, y - box.min.y) / (xr.escala || 1)) + ' do piso'; // metro REAL (divide pela escala do AR)
  }

  // ---- HUD: joystick de andar + mira + (no AR) barra de disciplina/medir/sair ----
  // No AR imersivo SÓ o dom-overlay (xrHud) aparece — o xrPanel de config fica invisível.
  // Então as ferramentas essenciais da obra (disciplina, medir, sair) vão pra CÁ.
  function montarHud(comReticulo) {
    // barra compacta de ferramentas SEMPRE (Caminhar E AR) — no celular o painel grande de config
    // tampa a vista, então as ações essenciais (disciplina/medir/ajustes/sair) ficam nesta barra.
    var discs = disciplinasPresentes();
    var chips = discs.length > 1 ? discs.map(function (d) { var off = !!xr.discOcultas[d.chave]; return '<button data-har="' + esc(d.chave) + '" style="pointer-events:auto;border:0;border-radius:14px;padding:7px 11px;font-size:12px;color:#fff;background:' + (off ? 'rgba(90,110,130,.7)' : corAtiva()) + '">' + esc(d.nome) + '</button>'; }).join('') : '';
    var barra = '<div style="position:absolute;left:0;right:0;bottom:16px;display:flex;flex-wrap:wrap;gap:6px;justify-content:center;padding:0 10px">' +
      chips +
      '<button data-har="medir" style="pointer-events:auto;border:0;border-radius:14px;padding:7px 12px;font-size:12px;color:#0b1a2b;background:#7fe0a3;font-weight:600">📏 Medir</button>' +
      '<button data-har="ajustes" style="pointer-events:auto;border:0;border-radius:14px;padding:7px 12px;font-size:12px;color:#fff;background:#334a63">⚙️ Ajustes</button>' +
      '<button data-har="sair" style="pointer-events:auto;border:0;border-radius:14px;padding:7px 12px;font-size:12px;color:#fff;background:#b91c1c">⏹ Sair</button></div>';
    xrHud.innerHTML =
      (comReticulo ? '' : '<div data-h="joy" style="position:absolute;left:16px;bottom:60px;width:108px;height:108px;border-radius:50%;background:rgba(20,40,64,.4);border:2px solid rgba(127,224,163,.5);pointer-events:auto;touch-action:none">' +
      '<div data-h="knob" style="position:absolute;left:31px;top:31px;width:46px;height:46px;border-radius:50%;background:rgba(127,224,163,.85)"></div></div>') +
      (comReticulo ? '<div style="position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border:2px solid #7fe0a3;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.4)"></div>' : '') +
      barra +
      '<div style="position:absolute;left:0;right:0;top:0;display:flex;justify-content:center;pointer-events:none"><div data-h="dica" style="margin-top:8px;background:rgba(11,26,43,.82);color:#dbe8f5;font-size:12px;padding:5px 12px;border-radius:20px;max-width:88%;text-align:center"></div></div>';
    xrHud.style.display = 'block';
    if (!comReticulo) ligarJoystick();
  }
  // cliques da barra (disciplina/medir/ajustes/sair) — no dom-overlay do imersivo
  xrHud.addEventListener('click', function (e) {
    var b = e.target.closest('[data-har]'); if (!b) return; var k = b.getAttribute('data-har');
    if (k === 'sair') sairImersivo();
    else if (k === 'medir') { xr.medir.on = !xr.medir.on; b.style.background = xr.medir.on ? '#f0b94a' : '#7fe0a3'; xrDica(xr.medir.on ? '📏 Toque em 2 pontos do modelo pra medir na escala.' : ''); }
    else if (k === 'ajustes') { var aberto = xrPanel.style.display === 'flex'; if (aberto) { xrPanel.style.display = 'none'; } else { pintarXRPanel(); xrPanel.style.display = 'flex'; if (S._ajustarTop) S._ajustarTop(); } }
    else { toggleDisciplinaXR(k); var off = !!xr.discOcultas[k]; b.style.background = off ? 'rgba(90,110,130,.7)' : corAtiva(); }
  });
  function xrDica(t) { var d = xrHud.querySelector('[data-h="dica"]'); if (d) d.textContent = t || ''; }
  function ligarJoystick() {
    var joy = xrHud.querySelector('[data-h="joy"]'), knob = xrHud.querySelector('[data-h="knob"]');
    if (!joy) return;
    var ativo = false, cx = 60, cy = 60, R = 42;
    function set(px, py) {
      var dx = px - cx, dy = py - cy, d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      knob.style.left = (35 + dx) + 'px'; knob.style.top = (35 + dy) + 'px';
      xr.joy.x = dx / R; xr.joy.z = dy / R; // x=strafe, z=frente(-)/trás(+)
    }
    function pos(e) { var r = joy.getBoundingClientRect(), t = e.touches ? e.touches[0] : e; return [t.clientX - r.left, t.clientY - r.top]; }
    joy.addEventListener('pointerdown', function (e) { ativo = true; joy.setPointerCapture && joy.setPointerCapture(e.pointerId); var p = pos(e); set(p[0], p[1]); e.preventDefault(); });
    joy.addEventListener('pointermove', function (e) { if (!ativo) return; var p = pos(e); set(p[0], p[1]); e.preventDefault(); });
    var solta = function () { ativo = false; xr.joy.x = 0; xr.joy.z = 0; knob.style.left = '35px'; knob.style.top = '35px'; };
    joy.addEventListener('pointerup', solta); joy.addEventListener('pointercancel', solta);
  }

  // ---- olhar arrastando (não-XR): drag no canvas gira a câmera ----
  var xrDrag = null;
  function xrPointerDown(e) { if (!xr.on || xr.mode === 'ar' || xr.mode === 'vr') return; if (xr.medir.on) { medirTocar(e); return; } xrDrag = { x: e.clientX, y: e.clientY }; }
  function xrPointerMove(e) { if (!xrDrag) return; xr.look.yaw -= (e.clientX - xrDrag.x) * 0.005; xr.look.pitch -= (e.clientY - xrDrag.y) * 0.005; xr.look.pitch = Math.max(-1.4, Math.min(1.4, xr.look.pitch)); xrDrag = { x: e.clientX, y: e.clientY }; }
  function xrPointerUp() { xrDrag = null; }

  // ---- orientação do aparelho (virar o celular pra olhar) ----
  function ligarOrientacao() {
    if (xr.ori) return;
    function handler(ev) {
      if (ev.alpha == null) return;
      var a = ev.alpha * Math.PI / 180, b = ev.beta * Math.PI / 180;
      if (!xr.oriBase) xr.oriBase = a;
      xr.look.yaw = -(a - xr.oriBase);
      xr.look.pitch = Math.max(-1.4, Math.min(1.4, (b - Math.PI / 2)));
    }
    var start = function () { window.addEventListener('deviceorientation', handler, true); xr.ori = true; xr._oriH = handler; xrDica('Vire o celular pra olhar em volta. Joystick pra andar.'); };
    if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
      DeviceOrientationEvent.requestPermission().then(function (p) { if (p === 'granted') start(); }).catch(function () {});
    } else if (typeof DeviceOrientationEvent !== 'undefined') { start(); }
  }
  function desligarOrientacao() { if (xr.ori && xr._oriH) { window.removeEventListener('deviceorientation', xr._oriH, true); } xr.ori = false; xr.oriBase = null; }

  // ---- passo de andar (roda todo frame via S._xrWalk) ----
  var _xrFwd = new THREE.Vector3(), _xrRight = new THREE.Vector3(), _xrUp = new THREE.Vector3(0, 1, 0);
  function xrWalkStep(dt) {
    if (xr.mode === 'vr') { xrVRLoco(dt); return; }
    // câmera olha conforme yaw/pitch (não-XR); no AR a câmera é da sessão, só nudge no plano
    if (xr.mode !== 'ar') {
      var e = new THREE.Euler(xr.look.pitch, xr.look.yaw, 0, 'YXZ'); camera.quaternion.setFromEuler(e);
    }
    var mv = xr.joy.x * xr.joy.x + xr.joy.z * xr.joy.z;
    if (mv < 0.0009) return;
    camera.getWorldDirection(_xrFwd); _xrFwd.y = 0; _xrFwd.normalize();
    _xrRight.crossVectors(_xrFwd, _xrUp).normalize();
    var vel = 1.4 * dt; // ~caminhada humana (m/s), em unidades de mundo já escaladas
    var alvo = new THREE.Vector3();
    alvo.addScaledVector(_xrFwd, -xr.joy.z * vel).addScaledVector(_xrRight, xr.joy.x * vel);
    if (xr.mode === 'ar') { modelRoot.position.sub(alvo); } // no AR movo o MODELO (a câmera é do device)
    else { camera.position.add(alvo); camera.position.y = xr._pisoY + EYE * (xr.escala || 1); }
  }
  function xrVRLoco(dt) {
    try {
      var s = renderer.xr.getSession(); if (!s) return;
      s.inputSources.forEach(function (src) {
        if (!src.gamepad || !src.handedness) return;
        var ax = src.gamepad.axes || [];
        var x = ax[2] || ax[0] || 0, y = ax[3] || ax[1] || 0;
        if (Math.abs(x) < 0.15 && Math.abs(y) < 0.15) return;
        if (src.handedness === 'left') {
          camera.getWorldDirection(_xrFwd); _xrFwd.y = 0; _xrFwd.normalize(); _xrRight.crossVectors(_xrFwd, _xrUp).normalize();
          var v = 1.6 * dt, mov = new THREE.Vector3(); mov.addScaledVector(_xrFwd, -y * v).addScaledVector(_xrRight, x * v);
          xrRig.position.add(mov);
        } else if (src.handedness === 'right' && Math.abs(x) > 0.6) {
          if (!xr._snapT || performance.now() - xr._snapT > 300) { xrRig.rotation.y -= (x > 0 ? 1 : -1) * Math.PI / 6; xr._snapT = performance.now(); }
        }
      });
    } catch (_) {}
  }

  // rig de VR: a câmera XR fica dentro dele; mover/girar o rig = teletransporte suave
  var xrRig = new THREE.Group(); scene.add(xrRig);

  // ---- ENTRAR: Caminhar / Câmera (universal, sem WebXR) ----
  // modo 'caminhar' = modelo em fundo liso; modo 'camera' = modelo POR CIMA do vídeo da câmera
  // (RA simples que roda no iPhone: giroscópio olha, joystick anda, o projeto aparece no ambiente).
  function iniciarAndar(modo) {
    var box = new THREE.Box3().setFromObject(modelRoot); if (box.isEmpty()) { S._hint('Carregue um modelo primeiro.'); return; }
    xr.on = true; xr.mode = modo; xr.escala = 1; xr.cortefrac = 1000;
    xr.cam = { pos: camera.position.clone(), quat: camera.quaternion.clone(), near: camera.near, far: camera.far };
    xr.prevClip = renderer.clippingPlanes; xr.prevLocal = renderer.localClippingEnabled;
    orbit.enabled = false; if (S.fly && S.fly.on && S._setMode) S._setMode(false);
    ligarSombras(true);
    var c = box.getCenter(new THREE.Vector3());
    xr._pisoY = box.min.y;
    // câmera: no modo câmera começa um pouco AFASTADO, olhando o modelo (vê o projeto no ambiente,
    // como um objeto na sua frente); no caminhar começa no centro (dentro).
    if (modo === 'camera') {
      var diag = box.getSize(new THREE.Vector3()); var recuo = Math.max(diag.x, diag.z) * 0.8 + 2;
      camera.position.set(c.x, box.min.y + EYE, box.max.z + recuo);
    } else camera.position.set(c.x, box.min.y + EYE, c.z);
    camera.near = 0.05; camera.far = 5000; camera.updateProjectionMatrix();
    xr.look.yaw = 0; xr.look.pitch = 0; xr.joy.x = 0; xr.joy.z = 0; // zera o joystick (senão anda sozinho na reentrada)
    S._xrWalk = xrWalkStep;
    montarHud(false);
    if (typeof DeviceOrientationEvent !== 'undefined') ligarOrientacao();
    canvasEl.addEventListener('pointerdown', xrPointerDown); canvasEl.addEventListener('pointermove', xrPointerMove); window.addEventListener('pointerup', xrPointerUp);
    marcarBtnXR(true); pintarXRPanel(); xrPanel.style.display = 'none';
    if (modo === 'camera') { xrDica('📷 Mova o celular pra olhar em volta · joystick pra chegar perto. O projeto aparece no ambiente real.'); S._hint('📷 Projeto sobre a câmera. ⏹ Sair no painel.'); }
    else { xrDica('Arraste pra olhar · joystick pra andar. Vire o celular pra usar o giroscópio.'); S._hint('👣 Você está DENTRO do projeto. Ande com o joystick; arraste pra olhar. ⏹ Sair no painel.'); }
  }
  function entrarCaminhar() { iniciarAndar('caminhar'); }
  // ---- ENTRAR: Câmera + Projeto (RA simples: vídeo da câmera de fundo + modelo por cima) ----
  function entrarCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { S._hint('📷 Este navegador não dá acesso à câmera.'); return; }
    if (!/^https:$|^http:\/\/localhost|^http:\/\/127\./.test(location.protocol + '//' + location.hostname) && location.hostname !== 'localhost') {
      // câmera só em HTTPS ou localhost (regra do navegador). No QR da rede local (http) não rola.
      S._hint('📷 A câmera só abre por HTTPS. Use o link ☁️ da nuvem (ou rode no próprio computador).');
      return;
    }
    S._hint('📷 Pedindo acesso à câmera…');
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }).then(function (stream) {
      xr.stream = stream;
      var v = document.createElement('video');
      v.setAttribute('playsinline', ''); v.setAttribute('muted', ''); v.muted = true; v.autoplay = true;
      v.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;background:#000';
      v.srcObject = stream; host.insertBefore(v, host.firstChild); xr.video = v; try { v.play(); } catch (_) {}
      canvasEl.style.position = 'relative'; canvasEl.style.zIndex = '1'; canvasEl.style.background = 'transparent';
      iniciarAndar('camera');
    }).catch(function (e) {
      var nm = (e && e.name) || e;
      S._hint(nm === 'NotAllowedError' ? '📷 Você negou a câmera. Toque de novo e permita.' : '📷 Não consegui abrir a câmera: ' + nm);
    });
  }
  function limparCamera() {
    if (xr.stream) { try { xr.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {} xr.stream = null; }
    if (xr.video) { try { xr.video.pause(); xr.video.srcObject = null; if (xr.video.parentNode) xr.video.parentNode.removeChild(xr.video); } catch (_) {} xr.video = null; }
    try { canvasEl.style.zIndex = ''; canvasEl.style.background = ''; } catch (_) {}
  }

  // ---- ENTRAR: VR imersivo (WebXR) ----
  function entrarVR() {
    if (!navigator.xr) return;
    var box = new THREE.Box3().setFromObject(modelRoot); if (box.isEmpty()) return;
    navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] }).then(function (session) {
      xr.on = true; xr.mode = 'vr'; xr.session = session; xr.escala = 1;
      xr.cam = { pos: camera.position.clone(), quat: camera.quaternion.clone() };
      xr.prevClip = renderer.clippingPlanes; xr.prevLocal = renderer.localClippingEnabled; // preserva Planta/Corte ativos
      xr.joy.x = 0; xr.joy.z = 0;
      S._xrWalk = xrWalkStep; // locomoção (analógico → xrVRLoco) roda no xrLoop
      ligarSombras(true);
      var c = box.getCenter(new THREE.Vector3());
      xrRig.position.set(c.x, box.min.y, c.z); xrRig.rotation.set(0, 0, 0);
      renderer.xr.setReferenceSpaceType('local-floor');
      xrRig.add(camera); // câmera XR dentro do rig → mover o rig te leva pelo modelo
      renderer.xr.setSession(session).then(function () {
        if (!xr.on) return; // sessão já encerrada antes deste callback (Esc/tirou o headset) — não ressuscita o loop
        xr._xrActivePrev = S._xrActive; S._xrActive = true; if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
        renderer.setAnimationLoop(xrLoop);
      }).catch(function (e) { sairImersivo(); S._hint('🥽 Falha ao iniciar a sessão VR: ' + (e && e.message || e)); });
      session.addEventListener('end', sairImersivo);
      marcarBtnXR(true); pintarXRPanel(); xrPanel.style.display = 'none'; // no imersivo o painel grande some (tampava a vista no celular); ⚙️ Ajustes reabre
    }).catch(function (e) { S._hint('🥽 Não deu pra entrar em VR: ' + (e && e.message || e)); });
  }

  // ---- ENTRAR: RA no ambiente (WebXR immersive-ar, Android) ----
  function entrarAR() {
    if (!navigator.xr) return;
    montarHud(true); // dom-overlay usa o xrHud
    navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay', 'local-floor'], domOverlay: { root: xrHud } }).then(function (session) {
      xr.on = true; xr.mode = 'ar'; xr.session = session; xr.placed = false; xr.travado = false;
      xr.modelSnap = { pos: modelRoot.position.clone(), quat: modelRoot.quaternion.clone(), scale: modelRoot.scale.clone() };
      xr.prevClip = renderer.clippingPlanes; xr.prevLocal = renderer.localClippingEnabled; // preserva Planta/Corte ativos
      xr.joy.x = 0; xr.joy.z = 0;
      S._xrWalk = xrWalkStep; // nudge do joystick no modo AR roda no xrLoop
      modelRoot.visible = false; // só aparece após colocar
      ligarSombras(true);
      // retículo de colocação
      if (!xr.reticle) {
        var g = new THREE.RingGeometry(0.09, 0.11, 32).rotateX(-Math.PI / 2);
        xr.reticle = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x7fe0a3 }));
        xr.reticle.matrixAutoUpdate = false; xr.reticle.visible = false; scene.add(xr.reticle);
      }
      renderer.xr.setReferenceSpaceType('local');
      renderer.xr.setSession(session).then(function () {
        if (!xr.on) return; // sessão já encerrada antes deste callback
        S._xrActive = true; if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
        session.requestReferenceSpace('viewer').then(function (vs) {
          session.requestHitTestSource({ space: vs }).then(function (src) { if (xr.on) xr.hitSrc = src; else { try { src.cancel(); } catch (_) {} } });
        });
        renderer.setAnimationLoop(xrLoop);
      }).catch(function (e) { sairImersivo(); S._hint('📱 Falha ao iniciar a sessão RA: ' + (e && e.message || e)); });
      // toque no AR: mede (se a régua estiver ligada) ou fixa o projeto
      session.addEventListener('select', function () { if (xr.medir.on && xr.placed) medirTocar({}); else arColocar(); });
      session.addEventListener('end', sairImersivo);
      xrDica('Aponte a câmera pro chão e toque na tela pra fixar o projeto.');
      marcarBtnXR(true); pintarXRPanel(); xrPanel.style.display = 'none'; // no imersivo o painel grande some (tampava a vista no celular); ⚙️ Ajustes reabre
    }).catch(function (e) { xrHud.style.display = 'none'; S._hint('📱 RA indisponível neste aparelho: ' + (e && e.message || e)); });
  }
  function arColocar() {
    if (xr.travado || !xr.reticle || !xr.reticle.visible) return;
    xr._anchorMat = xr.reticle.matrix.clone();
    xr.placed = true; modelRoot.visible = true;
    posicionarModeloAR();
    xrDica('Projeto fixado. Ande em volta! Trave no painel pra ele não sair do lugar.');
    pintarXRPanel();
  }
  function posicionarModeloAR() {
    if (!xr._anchorMat) return;
    var box = new THREE.Box3().setFromObject(modelRoot); // em coords atuais
    var p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    xr._anchorMat.decompose(p, q, s);
    modelRoot.scale.setScalar(xr.escala || 1);
    // apoia a BASE do modelo no ponto do chão
    var box0 = new THREE.Box3().setFromObject(modelRoot);
    modelRoot.position.set(0, 0, 0);
    var min = box0.min.clone();
    modelRoot.position.set(p.x - (box0.getCenter(new THREE.Vector3()).x), p.y - min.y, p.z - (box0.getCenter(new THREE.Vector3()).z));
    modelRoot.quaternion.copy(q);
  }

  // ---- loop XR (VR/AR): dt + locomoção + hit-test + render ----
  function xrLoop(t, frame) {
    if (!S || !S.alive) { renderer.setAnimationLoop(null); return; }
    var dt = Math.min(clock.getDelta(), 0.1);
    if (S._xrWalk) S._xrWalk(dt);
    if (xr.mode === 'ar' && frame && xr.hitSrc && !xr.travado) {
      try {
        var ref = renderer.xr.getReferenceSpace(), hits = frame.getHitTestResults(xr.hitSrc);
        if (hits.length) { var pose = hits[0].getPose(ref); if (pose) { xr.reticle.visible = !xr.placed; xr.reticle.matrix.fromArray(pose.transform.matrix); } }
        else xr.reticle.visible = false;
      } catch (_) {}
    }
    for (var i = 0; i < S._tickExtra.length; i++) { try { S._tickExtra[i](dt); } catch (_) {} }
    renderer.render(scene, camera);
  }

  // ---- medir na escala (2 toques) ----
  function medirTocar(e) {
    var r = canvasEl.getBoundingClientRect();
    var mx = (((e.clientX != null ? e.clientX : r.left + r.width / 2) - r.left) / r.width) * 2 - 1;
    var my = -((((e.clientY != null ? e.clientY : r.top + r.height / 2) - r.top) / r.height) * 2 - 1);
    ray.setFromCamera({ x: mx, y: my }, camera);
    var hit = primeiroHit(ray.intersectObjects(modelRoot.children, true));
    if (!hit) { xrDica('📏 Mire numa superfície do modelo.'); return; }
    xr.medir.pts.push(hit.point.clone());
    var m = pontoMarca(hit.point.clone()); scene.add(m); xr.medir.objs.push(m); rescaleObj(m);
    if (xr.medir.pts.length === 2) {
      var a = xr.medir.pts[0], b = xr.medir.pts[1];
      var dReal = a.distanceTo(b) / (xr.escala || 1); // divide pela escala → metros reais
      var ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0x7fe0a3, depthTest: false }));
      ln.renderOrder = 998; scene.add(ln); xr.medir.objs.push(ln);
      var lab = labelSprite(fmtDist(dReal)); lab.position.copy(a.clone().add(b).multiplyScalar(0.5)); scene.add(lab); xr.medir.objs.push(lab); rescaleObj(lab);
      xrDica('📏 ' + fmtDist(dReal) + ' (real). Toque 2 pontos pra medir de novo.');
      xr.medir.pts = [];
    } else xrDica('📏 Agora toque no 2º ponto.');
  }
  function limparMedirXR() { xr.medir.objs.forEach(function (o) { scene.remove(o); if (o.geometry) o.geometry.dispose(); }); xr.medir.objs = []; xr.medir.pts = []; }

  // ---- disciplina: liga/desliga MODELOS por disciplina ----
  function toggleDisciplinaXR(chave) {
    xr.discOcultas[chave] = !xr.discOcultas[chave];
    S.modelos.forEach(function (mo) { if ((mo.disciplina || 'outros') === chave) mo.grupo.visible = !xr.discOcultas[chave] && mo.visivel !== false; });
    pintarXRPanel();
  }

  // ---- SAIR: restaura tudo ----
  function sairImersivo() {
    if (!xr.on) return;
    var eraVR = xr.mode === 'vr', eraAR = xr.mode === 'ar';
    xr.on = false;
    if (xr.hitSrc) { try { xr.hitSrc.cancel(); } catch (_) {} }
    if (xr.session) { try { xr.session.end(); } catch (_) {} }
    xr.session = null; xr.hitSrc = null; xr.joy.x = 0; xr.joy.z = 0; xr.cortefrac = 1000;
    limparCamera(); // para a câmera + remove o vídeo de fundo (modo 📷)
    S._xrActive = false; S._xrWalk = null;
    try { renderer.setAnimationLoop(null); } catch (_) {}
    if (xr.reticle) xr.reticle.visible = false;
    if (eraVR) { scene.add(camera); xrRig.remove(camera); } // devolve a câmera à cena
    // restaura modelo (escala/posição do AR) e disciplinas
    modelRoot.visible = true;
    modelRoot.scale.setScalar(1);
    if (xr.modelSnap) { modelRoot.position.copy(xr.modelSnap.pos); modelRoot.quaternion.copy(xr.modelSnap.quat); modelRoot.scale.copy(xr.modelSnap.scale); xr.modelSnap = null; }
    S.modelos.forEach(function (mo) { mo.grupo.visible = mo.visivel !== false; }); xr.discOcultas = {};
    ligarSombras(false);
    limparMedirXR(); xr.medir.on = false;
    desligarOrientacao();
    renderer.clippingPlanes = xr.prevClip || []; renderer.localClippingEnabled = xr.prevLocal;
    canvasEl.removeEventListener('pointerdown', xrPointerDown); canvasEl.removeEventListener('pointermove', xrPointerMove); window.removeEventListener('pointerup', xrPointerUp);
    xrHud.style.display = 'none'; xrHud.innerHTML = '';
    if (xr.cam) { camera.position.copy(xr.cam.pos); if (xr.cam.quat) camera.quaternion.copy(xr.cam.quat); if (xr.cam.near) { camera.near = xr.cam.near; camera.far = xr.cam.far; camera.updateProjectionMatrix(); } xr.cam = null; }
    orbit.enabled = true; orbit.update();
    xr.escala = 1; xr.mode = null; xr.placed = false; xr.travado = false;
    marcarBtnXR(false); pintarXRPanel();
    if (S._retomarTick) S._retomarTick();
    S._hint('');
  }
  S._sairImersivo = sairImersivo;
  function marcarBtnXR(on) { var b = bar.querySelector('[data-b="xr"]'); if (b) { b.style.background = on ? corAtiva() : ''; b.style.color = on ? '#fff' : ''; } }

  xrPanel.addEventListener('click', function (e) {
    var bd = e.target.closest('[data-xd]'); if (bd) { toggleDisciplinaXR(bd.getAttribute('data-xd')); return; }
    var b = e.target.closest('[data-x]'); if (!b) return; var k = b.getAttribute('data-x');
    if (k === 'fechar') { xrPanel.style.display = 'none'; }
    else if (k === 'camera') { entrarCamera(); }
    else if (k === 'caminhar') { entrarCaminhar(); }
    else if (k === 'vr') { entrarVR(); }
    else if (k === 'ar') { entrarAR(); }
    else if (k === 'sair') { sairImersivo(); }
    else if (k === 'travar') { xr.travado = !xr.travado; if (xr.reticle) xr.reticle.visible = false; pintarXRPanel(); }
    else if (k === 'medir') { xr.medir.on = !xr.medir.on; if (!xr.medir.on) limparMedirXR(); xrDica(xr.medir.on ? '📏 Toque 2 pontos do modelo pra medir na escala.' : ''); b.style.background = xr.medir.on ? corAtiva() : ''; b.style.color = xr.medir.on ? '#fff' : ''; }
  });
  xrPanel.addEventListener('change', function (e) {
    var b = e.target.closest('[data-x]'); if (!b) return; var k = b.getAttribute('data-x');
    if (k === 'esc') aplicarEscalaXR(parseFloat(b.value) || 1);
  });
  xrPanel.addEventListener('input', function (e) {
    var b = e.target.closest('[data-x]'); if (!b) return;
    if (b.getAttribute('data-x') === 'corte') aplicarTetoVisao((+b.value) / 1000);
  });

  // ============================================================
  // 🏗 2D→3D (Fase C.1) — reconstrução ASSISTIDA a partir de DXF: o parser
  // (js/dxf.js) lê a planta, o detector (js/planta3d.js) PROPÕE paredes por
  // pares de linhas paralelas, o usuário confirma/desliga no preview e o
  // viewer extruda como MODELO SINTÉTICO (QTO/4D/clash/parede-cebola ganham
  // de graça). Honesto: volumetria de ESTUDO — não substitui projeto.
  // ============================================================
  var p3dSeq = 0;
  function carregarSintetico(caixas, nome) {
    caixas = caixas || [];
    if (!caixas.length) { S._hint('🏗 Nenhuma parede ligada pra gerar.'); return null; }
    if (S.modelos.length >= 8) { S._hint('Limite de 8 modelos abertos — remova um antes.'); return null; }
    var mid = 'p3d' + (++p3dSeq);
    var modelo = { mid: mid, sintetico: true, nome: nome || ('Planta 2D→3D (' + caixas.length + ' paredes)'), disciplina: 'arquitetura', alpha: 1, visivel: true, grupo: new THREE.Group(), matCache: {}, transCache: {}, elementos: [], tipos: { IFCWALL: caixas.length }, nEl: 0, nTri: 0, pavimentos: [], carimbos: {}, qto: {} };
    modelo.grupo.userData.mid = mid;
    modelRoot.add(modelo.grupo);
    var mat = new THREE.MeshStandardMaterial({ color: 0xd8cfc0, metalness: .05, roughness: .85, side: THREE.DoubleSide });
    modelo.matCache.parede = mat;
    caixas.forEach(function (c, i) {
      var g = new THREE.BoxGeometry(c.comprimento, c.altura, c.espessura);
      var m = new THREE.Mesh(g, mat);
      m.position.set(c.cx, c.cy, c.cz); m.rotation.y = c.rotY;
      m.userData.expressID = c.id != null ? c.id : (i + 1); m.userData.tipo = 'IFCWALL'; m.userData.mid = mid; m.userData.matOrig = mat;
      modelo.grupo.add(m);
      S.meshPorId[m.userData.expressID] = m; S.meshPorUid[mid + ':' + m.userData.expressID] = m;
      modelo.nTri += 12;
      // qto REAL da parede (área de 1 face; a Parede-Cebola/QTO consomem daqui — nada estimado por caixa)
      modelo.qto[m.userData.expressID] = { comprimento: c.comprimento, area: c.area, volume: +(c.comprimento * c.altura * c.espessura).toFixed(4), contagem: 1 };
      modelo.elementos.push({ id: m.userData.expressID, uid: mid + ':' + m.userData.expressID, mid: mid, arquivo: modelo.nome, tipo: 'IFCWALL', nome: 'Parede ' + (i + 1) + ' (' + c.comprimento.toFixed(2).replace('.', ',') + ' m)', etapa: null, codOrc: null, qto: modelo.qto[m.userData.expressID], disciplina: 'arquitetura' });
      modelo.nEl++;
    });
    S.modelos.push(modelo);
    // AABB mundo por elemento (clash/QTO)
    try {
      modelRoot.updateMatrixWorld(true);
      modelo.grupo.children.forEach(function (m) {
        var bb = new THREE.Box3().setFromObject(m);
        var elx = modelo.elementos.filter(function (e) { return e.id === m.userData.expressID; })[0];
        if (elx && !bb.isEmpty()) elx.aabb = { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] };
      });
    } catch (_) {}
    over.style.display = 'none';
    atualizarHud();
    if (planta.on) setPlanta(false);
    if (corteL.on) setCorteL(false);
    enquadrar();
    S.elementos = []; S.modelos.forEach(function (mo) { S.elementos = S.elementos.concat(mo.elementos); });
    if (pav.isolado || pav.manual) restaurarVisibilidade(); else pavRender();
    if (S._editReaplicarRem) S._editReaplicarRem(); // removidos da edição valem pro sintético recém-chegado
    notifyModelos();
    if (opts.onLoaded) opts.onLoaded(elementosVivos());
    return mid;
  }
  S._carregarSintetico = carregarSintetico;

  // ============================================================
  // ✏️ EDITOR — cria/edita volumetria SINTÉTICA no viewer (motor puro:
  // js/bimedit.js; ops serializáveis, undo por REPLAY determinístico).
  // Honestidade RA: o que nasce aqui é "sintético (criado no OrçaPRO)"
  // com QTO exato das peças; elemento de IFC importado NUNCA é alterado —
  // "apagar" IFC apenas OCULTA marcado como removido na edição.
  // ============================================================
  var edit = { on: false, sub: null, p1: null, prov: null, ops: [], seq: 0,
               moverId: null, moverMesh: null, esp: 0.15, alt: 2.8, secao: 0.2,
               base: 0, modelo: null, sprites: [], removidosAntes: [],
               // v1.1.82 — desenho estilo Revit: trava orto, ângulo predefinido (0=livre),
               // traço ENCADEADO (a próxima parede continua do fim da anterior) e o último
               // ponto ajustado do preview (direção p/ o input de distância)
               orto: false, angPre: 0, chain: true, pPrev: null, linhaProv: null };
  S.edit = edit;
  var editPanel = document.createElement('div');
  editPanel.style.cssText = 'position:absolute;left:10px;top:52px;z-index:6;display:none;flex-direction:column;gap:8px;background:rgba(15,39,64,.97);border:1px solid #24435f;border-radius:12px;padding:10px 12px;color:#dbe8f5;font-size:12px;width:280px;max-width:94%';
  editPanel.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center"><b>✏️ Editor <span style="color:#9fb2c8;font-weight:400">(sintético)</span></b><button class="btn sm" data-ed="fechar">✕</button></div>' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
    '<button class="btn sm" data-ed="parede">🧱 Parede</button>' +
    '<button class="btn sm" data-ed="laje">⬜ Laje</button>' +
    '<button class="btn sm" data-ed="pilar">🏛 Pilar</button>' +
    '<button class="btn sm" data-ed="mover">↔️ Mover</button>' +
    '<button class="btn sm" data-ed="apagar">🗑 Apagar</button>' +
    '<button class="btn sm" data-ed="anotar">📍 Anotar</button></div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
    '<label style="display:flex;gap:4px;align-items:center">Esp. <input data-ed="esp" class="inp" type="number" value="0.15" step="0.01" min="0.05" max="0.6" style="width:56px"> m</label>' +
    '<label style="display:flex;gap:4px;align-items:center">Alt. <input data-ed="alt" class="inp" type="number" value="2.80" step="0.1" min="0.3" max="8" style="width:56px"> m</label>' +
    '<label style="display:flex;gap:4px;align-items:center">Pilar <input data-ed="secao" class="inp" type="number" value="0.20" step="0.05" min="0.1" max="1" style="width:56px"> m</label></div>' +
    '<input data-ed="txt" class="inp" placeholder="Texto da anotação (p/ 📍 Anotar)" maxlength="200" style="width:100%">' +
    // v1.1.82 — controles de desenho estilo Revit (orto/ângulo/encadear)
    '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
    '<button class="btn sm" data-ed="orto" title="Trava a parede na horizontal/vertical (ou segure Shift enquanto desenha)">⟂ Orto</button>' +
    '<button class="btn sm" data-ed="angpre" title="Ângulos predefinidos: livre → 45° → 15°">∠ Livre</button>' +
    '<button class="btn sm" data-ed="chain" title="A próxima parede continua do fim da anterior (Esc encerra a cadeia)">⛓ Encadear</button>' +
    '</div>' +
    '<div style="font-size:10.5px;color:#9fb2c8">💡 Desenhando parede: digite a <b>distância</b> na caixinha junto ao cursor e Enter — igual no Revit.</div>' +
    '<div style="display:flex;gap:6px;align-items:center"><button class="btn sm" data-ed="undo">↩️ Desfazer</button><span data-ed="st" style="color:#9fb2c8;font-size:11.5px"></span></div>' +
    '<div style="font-size:11px;color:#f0b94a;line-height:1.35">⚠ Volumetria SINTÉTICA de estudo, com QTO exato das peças criadas. Elemento de IFC importado nunca muda — "apagar" só o oculta como removido na edição.</div>';
  host.appendChild(editPanel);
  S.editPanel = editPanel; // re-home re-parenteia via S.* — fora da lista o painel fica órfão
  var editMats = null;
  function editMat(tipo) {
    if (!editMats) {
      editMats = {
        parede: new THREE.MeshStandardMaterial({ color: 0xd8cfc0, metalness: .05, roughness: .85, side: THREE.DoubleSide }),
        laje: new THREE.MeshStandardMaterial({ color: 0x9aa7b4, metalness: .05, roughness: .9, side: THREE.DoubleSide }),
        pilar: new THREE.MeshStandardMaterial({ color: 0x7fa7d4, metalness: .1, roughness: .8, side: THREE.DoubleSide }),
        sel: new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x114422, metalness: .1, roughness: .6, side: THREE.DoubleSide })
      };
    }
    return editMats[tipo] || editMats.parede;
  }
  function editBase() {
    try {
      // só modelos IMPORTADOS ancoram o plano de trabalho — incluir o próprio modelo
      // do editor faria a laje (que cresce pra baixo) rebaixar a base a cada reentrada
      var bb = new THREE.Box3(), tem = false;
      S.modelos.forEach(function (mo) { if (mo.mid === 'edit' || !mo.grupo) return; bb.expandByObject(mo.grupo); tem = true; });
      return (!tem || bb.isEmpty()) ? 0 : bb.min.y;
    } catch (_) { return 0; }
  }
  // ponto no PLANO DE TRABALHO (y = base) quando o raio não acha malha —
  // permite desenhar no vazio (terreno limpo) e ao lado do modelo
  function editPontoPlano(clientX, clientY) {
    var rc = canvasEl.getBoundingClientRect();
    mouse.x = ((clientX - rc.left) / rc.width) * 2 - 1; mouse.y = -((clientY - rc.top) / rc.height) * 2 + 1;
    ray.setFromCamera(mouse, camera);
    var alvo = new THREE.Vector3();
    var plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), -edit.base); // y = base
    return ray.ray.intersectPlane(plano, alvo) ? alvo : null;
  }
  function editTirarProv() {
    if (edit.prov) { limparMarca(edit.prov); edit.prov = null; }
    edit.p1 = null;
    editPreviewLimpar();
  }
  // ---- v1.1.82: desenho estilo Revit ----
  // ajusta o 2º ponto pela trava orto (botão OU Shift) e pelos ângulos predefinidos
  function editAjustarPonto(p, ev) {
    if (!edit.p1 || !p || edit.sub !== 'parede') return p;
    var dx = p.x - edit.p1.x, dz = p.z - edit.p1.z;
    var dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 1e-6) return p;
    var q = p.clone(); q.y = edit.p1.y;
    if (edit.orto || (ev && ev.shiftKey)) {
      if (Math.abs(dx) >= Math.abs(dz)) q.z = edit.p1.z; else q.x = edit.p1.x;
      return q;
    }
    if (edit.angPre > 0) {
      var passo = edit.angPre * Math.PI / 180;
      var a2 = Math.round(Math.atan2(dz, dx) / passo) * passo;
      q.x = edit.p1.x + dist * Math.cos(a2); q.z = edit.p1.z + dist * Math.sin(a2);
    }
    return q;
  }
  // preview vivo (rubber-band) + caixinha de distância junto ao cursor (padrão do snapMarca:
  // DOM fora da cena — nunca é clipado nem raycastado)
  var editDist = document.createElement('div');
  editDist.style.cssText = 'position:absolute;z-index:6;display:none;background:rgba(15,39,64,.95);border:1px solid #2FBF71;border-radius:8px;padding:3px 6px;color:#dbe8f5;font-size:12px;white-space:nowrap;pointer-events:auto';
  editDist.innerHTML = '<span data-edd="txt" style="font-weight:700;color:#7fe0a3"></span> <input data-edd="inp" inputmode="decimal" placeholder="m" style="width:52px;background:#0b1a2b;border:1px solid #24435f;border-radius:5px;color:#fff;font-size:12px;padding:1px 4px">';
  host.appendChild(editDist);
  S.editDist = editDist; // re-home
  function editPreviewLimpar() {
    if (edit.linhaProv) { scene.remove(edit.linhaProv); if (edit.linhaProv.geometry) edit.linhaProv.geometry.dispose(); edit.linhaProv = null; }
    edit.pPrev = null;
    editDist.style.display = 'none';
  }
  function editPreview(p, clientX, clientY) {
    if (!edit.p1 || !p) { editPreviewLimpar(); return; }
    edit.pPrev = p.clone();
    if (!edit.linhaProv) {
      if (!edit._linhaMat) edit._linhaMat = new THREE.LineBasicMaterial({ color: 0x2fbf71, depthTest: false }); // 1 material vivo (sem leak por segmento)
      var g3 = new THREE.BufferGeometry().setFromPoints([edit.p1, p]);
      edit.linhaProv = new THREE.Line(g3, edit._linhaMat);
      edit.linhaProv.renderOrder = 999;
      scene.add(edit.linhaProv);
    } else {
      edit.linhaProv.geometry.setFromPoints([edit.p1, p]);
    }
    var d = Math.sqrt(Math.pow(p.x - edit.p1.x, 2) + Math.pow(p.z - edit.p1.z, 2));
    var rc2 = canvasEl.getBoundingClientRect();
    editDist.style.display = '';
    editDist.style.left = (clientX - rc2.left + 16) + 'px';
    editDist.style.top = (clientY - rc2.top + 12) + 'px';
    var tx = editDist.querySelector('[data-edd="txt"]');
    if (tx) tx.textContent = d.toFixed(2).replace('.', ',') + ' m';
  }
  // digitar a distância + Enter = parede com o comprimento EXATO na direção do preview
  editDist.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { // Esc DENTRO do input: encerra a cadeia (o stopPropagation não pode engolir)
      e.stopPropagation();
      var iEsc = editDist.querySelector('[data-edd="inp"]'); if (iEsc) { iEsc.value = ''; iEsc.blur(); }
      if (S._editFimCadeia) S._editFimCadeia();
      return;
    }
    e.stopPropagation(); // não aciona atalhos do viewer (WASD do voo etc.)
    if (e.key !== 'Enter') return;
    var inp2 = editDist.querySelector('[data-edd="inp"]');
    var num2 = parseFloat(String(inp2.value || '').replace(',', '.'));
    if (!(num2 > 0.01) || !edit.p1) return;
    var dir;
    if (edit.pPrev) {
      var ddx = edit.pPrev.x - edit.p1.x, ddz = edit.pPrev.z - edit.p1.z;
      var len = Math.sqrt(ddx * ddx + ddz * ddz);
      dir = len > 1e-6 ? { x: ddx / len, z: ddz / len } : { x: 1, z: 0 };
    } else dir = { x: 1, z: 0 };
    var p2 = new THREE.Vector3(edit.p1.x + dir.x * num2, edit.p1.y, edit.p1.z + dir.z * num2);
    inp2.value = '';
    editConcluirParede(p2);
  });
  // conclui a parede em p2 (2º clique OU distância digitada) com o traço ENCADEADO
  function editConcluirParede(p2) {
    var cxP = BimEdit.parede({ x: edit.p1.x, z: edit.p1.z }, { x: p2.x, z: p2.z }, edit.esp, edit.alt, edit.base);
    if (!cxP) { S._hint('🧱 Pontos muito próximos — clique 2 pontos distintos.'); return; }
    editOp({ op: 'criar', id: 'e' + (++edit.seq), caixa: cxP });
    var comp = cxP.comprimento.toFixed(2).replace('.', ',');
    if (edit.chain) {
      // encadeia: a próxima parede nasce do fim desta (Esc encerra a cadeia)
      if (edit.prov) { limparMarca(edit.prov); edit.prov = null; }
      editPreviewLimpar();
      edit.p1 = p2.clone();
      edit.prov = pontoMarca(p2); scene.add(edit.prov); rescaleObj(edit.prov);
      S._hint('🧱 Parede criada (' + comp + ' m). ⛓ Continuando do fim — clique o próximo ponto, ou Esc pra encerrar.');
    } else {
      editTirarProv();
      S._hint('🧱 Parede criada (' + comp + ' m). Siga clicando, ou Esc.');
    }
    marcarFechamento();
  }
  // Esc no meio da cadeia: encerra SÓ o traço (não fecha o editor)
  S._editFimCadeia = function () {
    editTirarProv();
    S._hint(edit.sub ? '✏️ Traço encerrado — clique o INÍCIO da próxima parede.' : '');
    marcarFechamento();
  };
  // preview no pointermove (registrado lá em cima via S._ — o handler nasce antes deste bloco)
  var _edPrevT = 0;
  S._editPreviewMove = function (e) {
    var t2 = performance.now(); if (t2 - _edPrevT < 33) return; _edPrevT = t2;
    var hit2 = raycastEm(e.clientX, e.clientY);
    var sn2 = hit2 ? aplicarSnap(hit2, raioToque(e)) : null;
    var pM = sn2 ? sn2.p.clone() : editPontoPlano(e.clientX, e.clientY);
    if (!pM) return;
    editPreview(editAjustarPonto(pM, e), e.clientX, e.clientY);
  };
  function editSt() {
    var el = editPanel.querySelector('[data-ed="st"]');
    if (el) el.textContent = edit.ops.length + ' operação(ões) · ' + ((edit.modelo && edit.modelo.nEl) || 0) + ' elemento(s)';
    editPanel.querySelectorAll('[data-ed]').forEach(function (b) {
      var k = b.getAttribute('data-ed');
      if (['parede', 'laje', 'pilar', 'mover', 'apagar', 'anotar'].indexOf(k) >= 0) {
        b.style.background = (edit.sub === k) ? corAtiva() : ''; b.style.color = (edit.sub === k) ? '#fff' : '';
      }
    });
  }
  function editSoltarSel() {
    if (edit.moverMesh && edit.moverMesh.userData.matOrig) edit.moverMesh.material = edit.moverMesh.userData.matOrig;
    edit.moverMesh = null; edit.moverId = null;
  }
  // reconstrói o modelo sintético 'edit' a partir do REPLAY das ops (fonte
  // única de verdade = motor puro; nada de estado paralelo no viewer)
  // uid gravado numa op pode ser de OUTRA sessão (o mid muda com a ordem de abertura dos
  // arquivos) — resolve pela identidade estável arquivo+expressID quando o uid direto não existe
  function editUidRemovido(info) {
    if (S.meshPorUid[info.uid]) return info.uid;
    if (info.arq != null && info.eid != null) {
      var mo2 = S.modelos.filter(function (x) { return x.mid !== 'edit' && x.nome === info.arq; })[0];
      if (mo2) return mo2.mid + ':' + info.eid;
    }
    return info.uid;
  }
  function editRebuild() {
    // restaura visibilidade dos IFC ocultados na rodada anterior (diff limpo) — TODAS as
    // malhas do elemento (multi-material tem várias), compondo com o 4D
    if (edit.removidosAntes.length) {
      var ra = {}; edit.removidosAntes.forEach(function (u) { ra[u] = 1; });
      todasMalhas(function (m) { if (ra[m.userData.mid + ':' + m.userData.expressID]) m.visible = !ehFuturo4d(m); });
    }
    editSoltarSel();
    // a malha 'edit' selecionada será destruída+recriada abaixo: limpa a seleção/contorno obsoletos
    // (senão o contorno verde fica congelado na posição antiga — mesmo padrão de removerModelo). Gate v1.1.89.
    if (S.selected && S.selected.userData && S.selected.userData.mid === 'edit') { S.selected = null; S.prevMat = null; if (S._contornoSelecao) S._contornoSelecao(null); }
    if (edit.modelo) {
      modelRoot.remove(edit.modelo.grupo);
      edit.modelo.grupo.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
      edit.modelo.grupo.children.slice().forEach(function (m) { delete S.meshPorUid['edit:' + m.userData.expressID]; });
      var ix = S.modelos.indexOf(edit.modelo); if (ix >= 0) S.modelos.splice(ix, 1);
      edit.modelo = null;
    }
    edit.sprites.forEach(function (sp) { scene.remove(sp); if (sp.material && sp.material.map) sp.material.map.dispose(); if (sp.material) sp.material.dispose(); });
    edit.sprites = [];
    var st = BimEdit.aplicar(edit.ops);
    if (st.caixas.length) {
      var mo = { mid: 'edit', sintetico: true, editor: true, nome: 'Criados no OrçaPRO (' + st.caixas.length + ')', disciplina: 'arquitetura', alpha: 1, visivel: true, grupo: new THREE.Group(), matCache: {}, transCache: {}, elementos: [], tipos: {}, nEl: 0, nTri: 0, pavimentos: [], carimbos: {}, qto: {} };
      mo.grupo.userData.mid = 'edit';
      st.caixas.forEach(function (c) {
        var g = new THREE.BoxGeometry(c.comprimento, c.altura, c.espessura);
        var m = new THREE.Mesh(g, editMat(c.tipo));
        m.position.set(c.cx, c.cy, c.cz); m.rotation.y = c.rotY;
        m.userData.expressID = c.id; m.userData.tipo = c.ifc; m.userData.mid = 'edit'; m.userData.matOrig = editMat(c.tipo);
        mo.grupo.add(m);
        S.meshPorUid['edit:' + c.id] = m;
        mo.nTri += 12; mo.tipos[c.ifc] = (mo.tipos[c.ifc] || 0) + 1;
        mo.qto[c.id] = { comprimento: c.tipo === 'pilar' ? (c.comprimentoPilar || c.altura) : c.comprimento, area: c.area, volume: c.volume, contagem: 1 };
        mo.elementos.push({ id: c.id, uid: 'edit:' + c.id, mid: 'edit', arquivo: mo.nome, tipo: c.ifc, nome: (c.tipo === 'parede' ? 'Parede' : c.tipo === 'laje' ? 'Laje' : 'Pilar') + ' (sintética ' + c.id + ')', etapa: null, codOrc: null, qto: mo.qto[c.id], disciplina: 'arquitetura' });
        mo.nEl++;
      });
      modelRoot.add(mo.grupo);
      try {
        modelRoot.updateMatrixWorld(true);
        mo.grupo.children.forEach(function (m) {
          var bb = new THREE.Box3().setFromObject(m);
          var elx = mo.elementos.filter(function (e2) { return e2.id === m.userData.expressID; })[0];
          if (elx && !bb.isEmpty()) elx.aabb = { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] };
        });
      } catch (_) {}
      S.modelos.push(mo);
      edit.modelo = mo;
    }
    st.anotacoes.forEach(function (a) {
      var sp = labelSprite('📍 ' + a.texto);
      sp.position.set(a.x, a.y, a.z); sp.userData._anotId = a.id;
      scene.add(sp); rescaleObj(sp); edit.sprites.push(sp);
    });
    // oculta os removidos (uid resolvido p/ a sessão atual; TODAS as malhas do elemento) e
    // publica S._remEd — todo escritor de visibilidade (4D/isolar/restaurar/focar) compõe com ele
    S._remEd = {};
    (st.removidosIfcInfo || []).forEach(function (info) { S._remEd[editUidRemovido(info)] = 1; });
    if (st.removidosIfc.length) todasMalhas(function (m) { if (S._remEd[m.userData.mid + ':' + m.userData.expressID]) m.visible = false; });
    edit.removidosAntes = Object.keys(S._remEd);
    S.elementos = []; S.modelos.forEach(function (mo2) { S.elementos = S.elementos.concat(mo2.elementos); });
    over.style.display = (S.modelos.length || st.anotacoes.length) ? 'none' : 'flex'; // sintético/anotação também tira o "arraste um IFC"
    atualizarHud(); notifyModelos(); editSt();
    if (opts.onLoaded) opts.onLoaded(elementosVivos());
    if (opts.onEdicao && !edit._replay) { try { opts.onEdicao(edit.ops.slice()); } catch (_) {} }
  }
  S._tickExtra.push(function () { for (var i = 0; i < edit.sprites.length; i++) rescaleObj(edit.sprites[i]); });
  function editOp(o) { edit.ops.push(o); editRebuild(); }
  function editHintSub() {
    var h = { parede: '🧱 Clique o INÍCIO e o FIM da parede (no modelo ou no chão vazio).',
              laje: '⬜ Clique 2 cantos OPOSTOS do retângulo da laje.',
              pilar: '🏛 Clique onde o pilar nasce.',
              mover: '↔️ Clique num elemento CRIADO AQUI e depois no novo lugar (IFC não se move — honestidade).',
              apagar: '🗑 Clique no elemento: criado aqui = removido; do IFC = ocultado como "removido na edição".',
              anotar: '📍 Escreva o texto no campo e clique no ponto do modelo.' };
    S._hint(edit.sub ? h[edit.sub] : '✏️ Editor: escolha uma ferramenta no painel.');
  }
  function editClique(e, hit) {
    var sn = hit ? aplicarSnap(hit, raioToque(e)) : null;
    var p = sn ? sn.p.clone() : editPontoPlano(e.clientX, e.clientY);
    if (sn) mostrarSnapMarca(sn, e.clientX, e.clientY);
    var sub = edit.sub;
    if (sub === 'apagar') {
      if (!hit) { S._hint('🗑 Clique em cima de um elemento.'); return; }
      var mA = _ultimosHits[0].object, midA = mA.userData.mid, idA = mA.userData.expressID;
      if (midA === 'edit') { editOp({ op: 'apagar', id: idA }); S._hint('🗑 Removido (Desfazer volta).'); }
      else {
        var moRem = S.modelos.filter(function (x) { return x.mid === midA; })[0];
        // arq+eid = identidade que sobrevive a F5/ordem de abertura (o mid é da sessão)
        editOp({ op: 'apagarIfc', uid: midA + ':' + idA, arq: moRem ? moRem.nome : null, eid: idA });
        S._hint('🗑 Elemento do modelo OCULTADO como removido na edição — o arquivo original não muda.');
      }
      marcarFechamento(); return;
    }
    if (sub === 'mover') {
      if (!edit.moverId) {
        if (!hit) { S._hint('↔️ Clique num elemento criado no editor.'); return; }
        var mM = _ultimosHits[0].object;
        if (mM.userData.mid !== 'edit') { S._hint('↔️ Só elementos CRIADOS AQUI se movem (IFC importado não é alterado).'); return; }
        edit.moverId = mM.userData.expressID; edit.moverMesh = mM; mM.material = editMat('sel');
        S._hint('↔️ Agora clique no NOVO lugar (o centro vai pra lá).'); return;
      }
      if (!p) { S._hint('↔️ Não achei o ponto — clique no modelo ou no plano do chão.'); return; }
      editOp({ op: 'mover', id: edit.moverId, cx: p.x, cz: p.z });
      S._hint('↔️ Movido. Clique noutro elemento pra mover de novo, ou Esc.');
      marcarFechamento(); return;
    }
    if (!p) { S._hint('✏️ Não achei o ponto — clique no modelo ou no plano do chão.'); return; }
    if (sub === 'pilar') {
      var cP = BimEdit.pilar({ x: p.x, z: p.z }, edit.secao, edit.alt, edit.base);
      if (cP) { editOp({ op: 'criar', id: 'e' + (++edit.seq), caixa: cP }); S._hint('🏛 Pilar criado. Clique pra outro, ou Esc.'); }
      marcarFechamento(); return;
    }
    if (sub === 'anotar') {
      var txt = (editPanel.querySelector('[data-ed="txt"]').value || '').trim();
      if (!txt) { S._hint('📍 Escreva o texto da anotação no painel primeiro.'); return; }
      editOp({ op: 'anotar', id: 'a' + (++edit.seq), x: p.x, y: p.y, z: p.z, texto: txt });
      S._hint('📍 Anotado! O pin fica salvo com a obra.');
      marcarFechamento(); return;
    }
    if (sub === 'parede' || sub === 'laje') {
      if (!edit.p1) {
        edit.p1 = p.clone();
        edit.prov = pontoMarca(p); scene.add(edit.prov); rescaleObj(edit.prov);
        S._hint(sub === 'parede' ? '🧱 Agora clique o FIM da parede (ou digite a distância na caixinha + Enter).' : '⬜ Agora clique o canto OPOSTO.');
        return;
      }
      if (sub === 'parede') { editConcluirParede(editAjustarPonto(p, e)); return; } // orto/ângulo/encadeado/distância
      var cx2 = BimEdit.laje({ x: edit.p1.x, z: edit.p1.z }, { x: p.x, z: p.z }, Math.min(edit.esp, 0.4), edit.base);
      editTirarProv();
      if (!cx2) { S._hint('✏️ Pontos muito próximos — clique 2 pontos distintos.'); return; }
      editOp({ op: 'criar', id: 'e' + (++edit.seq), caixa: cx2 });
      S._hint('⬜ Laje criada (' + cx2.area.toFixed(2).replace('.', ',') + ' m²).');
      marcarFechamento(); return;
    }
  }
  function setEditSub(sub) {
    edit.sub = (edit.sub === sub) ? null : sub;
    editTirarProv(); editSoltarSel(); editHintSub(); editSt();
    canvasEl.style.cursor = edit.sub ? 'crosshair' : '';
    // ferramenta ativa marcada no painel — sem isso o toggle fica invisível pro usuário
    ['parede', 'laje', 'pilar', 'mover', 'apagar', 'anotar'].forEach(function (k) {
      var b = editPanel.querySelector('[data-ed="' + k + '"]'); if (!b) return;
      var on2 = edit.sub === k;
      b.style.background = on2 ? corAtiva() : ''; b.style.color = on2 ? '#fff' : '';
    });
  }
  function setEdit(on) {
    edit.on = !!on;
    if (on) {
      if (medir.on) setMedir(false); if (area.on) setArea(false); if (ang.on) setAng(false);
      if (ctec.ativo && S._ctecCancelar) S._ctecCancelar(true);
      setMode(false); fecharPaineis(null);
      edit.base = editBase();
      editPanel.style.display = 'flex';
      editHintSub(); editSt();
    } else {
      editTirarProv(); editSoltarSel();
      edit.sub = null; editPanel.style.display = 'none';
      canvasEl.style.cursor = ''; S._hint('');
    }
    var be = bar.querySelector('[data-b="editar"]'); if (be) { be.style.background = on ? corAtiva() : ''; be.style.color = on ? '#fff' : ''; }
  }
  S._setEdit = setEdit;
  S._editOps = function () { return edit.ops.slice(); };
  S._editAplicar = function (ops) {
    if (!S || !S.alive) return; // viewer morto (ctx perdido): rebuild apagaria o aviso de recarregar
    edit.ops = BimEdit.sanear(ops);
    var mx = 0;
    edit.ops.forEach(function (o) { var m2 = /^[ea](\d+)$/.exec(String(o.id || '')); if (m2) mx = Math.max(mx, parseInt(m2[1], 10)); });
    edit.seq = mx;
    // replay NÃO re-dispara onEdicao (gravaria de volta o que acabou de ser lido)
    edit._replay = true;
    try { editRebuild(); } finally { edit._replay = false; }
    // replay externo (reentrar na obra / F5): enquadra o que voltou — no uso ao vivo
    // a câmera NÃO pula (editRebuild não enquadra; o usuário está desenhando nela)
    if (edit.ops.length) enquadrar();
  };
  // IFC chega DEPOIS do replay (pós-F5 só as ops persistem): re-resolve os removidos
  // sobre o modelo recém-carregado — sem isto o "removido na edição" voltaria visível
  S._editReaplicarRem = function () {
    if (!edit.ops.length) return;
    var st2 = BimEdit.aplicar(edit.ops);
    if (!st2.removidosIfc.length) return;
    S._remEd = {};
    (st2.removidosIfcInfo || []).forEach(function (info) { S._remEd[editUidRemovido(info)] = 1; });
    todasMalhas(function (m) { if (S._remEd[m.userData.mid + ':' + m.userData.expressID]) m.visible = false; });
    edit.removidosAntes = Object.keys(S._remEd);
  };
  // 🗑 Limpar / remover o modelo "Criados no OrçaPRO": o editor zera JUNTO (persistido) —
  // senão pins ficam órfãos na cena e a próxima op ressuscitaria tudo do replay
  S._editReset = function () {
    edit.ops = []; edit.seq = 0; edit.removidosAntes = []; edit.modelo = null; S._remEd = null;
    edit.sprites.forEach(function (sp) { scene.remove(sp); if (sp.material && sp.material.map) sp.material.map.dispose(); if (sp.material) sp.material.dispose(); });
    edit.sprites = [];
    if (edit.on) setEdit(false);
    if (opts.onEdicao) { try { opts.onEdicao([]); } catch (_) {} }
  };
  editPanel.addEventListener('click', function (e) {
    var b = e.target.closest('[data-ed]'); if (!b) return; var k = b.getAttribute('data-ed');
    if (k === 'fechar') setEdit(false);
    else if (k === 'undo') { if (edit.ops.length) { edit.ops.pop(); editTirarProv(); editRebuild(); S._hint('↩️ Desfeito.'); } else { S._hint('↩️ Nada pra desfazer.'); } } // TirarProv: cadeia não pode ficar apontando pra parede que sumiu
    else if (k === 'orto') { edit.orto = !edit.orto; b.style.background = edit.orto ? corAtiva() : ''; b.style.color = edit.orto ? '#fff' : ''; S._hint(edit.orto ? '⟂ Orto LIGADO — paredes só na horizontal/vertical.' : '⟂ Orto desligado (Shift também trava).'); }
    else if (k === 'angpre') {
      edit.angPre = edit.angPre === 0 ? 45 : (edit.angPre === 45 ? 15 : 0);
      b.textContent = '∠ ' + (edit.angPre === 0 ? 'Livre' : edit.angPre + '°');
      b.style.background = edit.angPre ? corAtiva() : ''; b.style.color = edit.angPre ? '#fff' : '';
      S._hint(edit.angPre ? '∠ Ângulos travados em múltiplos de ' + edit.angPre + '°.' : '∠ Ângulo livre.');
    }
    else if (k === 'chain') { edit.chain = !edit.chain; b.style.background = edit.chain ? corAtiva() : ''; b.style.color = edit.chain ? '#fff' : ''; S._hint(edit.chain ? '⛓ Encadear LIGADO — cada parede continua da anterior (Esc encerra o traço).' : '⛓ Encadear desligado.'); }
    else if (['parede', 'laje', 'pilar', 'mover', 'apagar', 'anotar'].indexOf(k) >= 0) setEditSub(k);
  });
  // estado inicial dos toggles (chain nasce ligado — fluxo Revit)
  (function () { var bC = editPanel.querySelector('[data-ed="chain"]'); if (bC) { bC.style.background = corAtiva(); bC.style.color = '#fff'; } })();
  editPanel.addEventListener('change', function (e) {
    var i = e.target.closest('input[data-ed]'); if (!i) return; var k = i.getAttribute('data-ed'), v = parseFloat(i.value);
    // clamp nos limites do input — valor DIGITADO ignora min/max do HTML (parede de 50 m de espessura não passa)
    var lim = { esp: [0.05, 0.6], alt: [0.3, 8], secao: [0.1, 1] }[k];
    if (!lim || !(v > 0) || !isFinite(v)) return;
    v = Math.min(lim[1], Math.max(lim[0], v));
    i.value = String(v);
    if (k === 'esp') edit.esp = v; else if (k === 'alt') edit.alt = v; else edit.secao = v;
  });

  var p3d = { parse: null, det: null };
  var p3dPanel = document.createElement('div');
  p3dPanel.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:6;display:none;flex-direction:column;gap:8px;background:rgba(15,39,64,.97);border:1px solid #24435f;border-radius:12px;padding:14px 16px;color:#dbe8f5;font-size:12px;width:480px;max-width:94%;max-height:92%;overflow:auto;box-shadow:0 12px 34px rgba(0,0,0,.5)';
  p3dPanel.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center"><b>🏗 Planta 2D → 3D (DXF)</b><button class="btn sm" data-p3="fechar">✕</button></div>' +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
    '<button class="btn sm primary" data-p3="abrir">📂 Abrir .DXF</button>' +
    '<label style="display:flex;gap:5px;align-items:center">Pé-direito <input data-p3="pd" class="inp" type="number" value="2.80" step="0.1" min="2" max="6" style="width:64px"> m</label>' +
    '<label style="display:flex;gap:5px;align-items:center">Unidade <select data-p3="un" class="inp" style="width:76px"><option value="">auto</option><option value="0.001">mm</option><option value="0.01">cm</option><option value="1">m</option></select></label>' +
    '<input type="file" data-p3="file" accept=".dxf" style="display:none"></div>' +
    '<div data-p3="info" style="font-size:11.5px;color:#9fb2c8">Exporte a planta baixa do seu CAD em <b>DXF</b> (AutoCAD/QCAD/LibreCAD; DWG? salve-como DXF). O sistema propõe as paredes — você confirma.</div>' +
    '<canvas data-p3="cv" width="448" height="300" style="background:#0b1a2b;border:1px solid #24435f;border-radius:8px;cursor:pointer;display:none"></canvas>' +
    '<div data-p3="res" style="font-size:12px"></div>' +
    '<button class="btn sm primary" data-p3="gerar" style="display:none">🏗 Gerar 3D</button>' +
    '<div style="font-size:11px;color:#f0b94a;line-height:1.35">⚠ Volumetria de ESTUDO (paredes por par de linhas paralelas de 6–40 cm) — clique numa parede verde do preview pra ligar/desligar. Portas, janelas e cobertura não entram nesta fase. Não substitui o projeto.</div>';
  host.appendChild(p3dPanel);
  S.p3dPanel = p3dPanel;
  function toggleP3dPanel() { var abrir = p3dPanel.style.display === 'none' || !p3dPanel.style.display; fecharPaineis(null); p3dPanel.style.display = abrir ? 'flex' : 'none'; }
  function p3dDesenhar() {
    var cv = p3dPanel.querySelector('[data-p3="cv"]'); if (!cv || !p3d.parse) return;
    cv.style.display = '';
    var g = cv.getContext('2d'), ex = p3d.parse.extents;
    g.fillStyle = '#0b1a2b'; g.fillRect(0, 0, cv.width, cv.height);
    if (!ex) return;
    var mrg = 14, sw = (cv.width - mrg * 2) / Math.max(1e-6, ex.x1 - ex.x0), sh = (cv.height - mrg * 2) / Math.max(1e-6, ex.y1 - ex.y0);
    var sc = Math.min(sw, sh);
    function px(x) { return mrg + (x - ex.x0) * sc; }
    function py(y) { return cv.height - mrg - (y - ex.y0) * sc; } // Y da planta pra cima
    p3d._px = px; p3d._py = py; p3d._sc = sc;
    g.strokeStyle = '#3a5570'; g.lineWidth = 1;
    p3d.parse.segmentos.forEach(function (s) { g.beginPath(); g.moveTo(px(s.x1), py(s.y1)); g.lineTo(px(s.x2), py(s.y2)); g.stroke(); });
    (p3d.det ? p3d.det.paredes : []).forEach(function (p) {
      g.strokeStyle = p.ligada !== false ? '#22c55e' : '#64748b';
      g.setLineDash(p.ligada !== false ? [] : [5, 4]);
      g.lineWidth = Math.max(3, p.espessura * sc);
      g.beginPath(); g.moveTo(px(p.x1), py(p.y1)); g.lineTo(px(p.x2), py(p.y2)); g.stroke();
      g.setLineDash([]);
    });
  }
  function p3dResumo() {
    var res = p3dPanel.querySelector('[data-p3="res"]'), bg = p3dPanel.querySelector('[data-p3="gerar"]');
    if (!p3d.det) { res.innerHTML = ''; bg.style.display = 'none'; return; }
    var ligadas = p3d.det.paredes.filter(function (p) { return p.ligada !== false; });
    var mTot = ligadas.reduce(function (s, p) { return s + p.comprimento; }, 0);
    res.innerHTML = '<b style="color:#7fe0a3">' + ligadas.length + ' parede(s) ligadas</b> (' + mTot.toFixed(1).replace('.', ',') + ' m lineares) · ' +
      p3d.det.stats.segmentosSemPar + ' segmento(s) sem par (portas/mobiliário/cotas — fora, honesto) · unidade: ' + (p3d.parse.unidade.origem === 'insunits' ? 'do arquivo' : p3d.parse.unidade.origem);
    bg.style.display = ''; bg.textContent = '🏗 Gerar 3D (' + ligadas.length + ' paredes)';
  }
  function p3dProcessar(texto, nome) {
    if (typeof window === 'undefined' || !window.DXF || !window.Planta3D) { S._hint('🏗 Motores 2D→3D não carregados — atualize o app.'); return; }
    p3d._texto = String(texto || ''); // guardado: trocar a unidade re-processa (a UI instrui isso)
    var fu = parseFloat(p3dPanel.querySelector('[data-p3="un"]').value) || 0;
    p3d.parse = window.DXF.parse(texto, fu > 0 ? { fatorUnidade: fu } : {});
    p3d.nome = nome || 'planta.dxf';
    var info = p3dPanel.querySelector('[data-p3="info"]');
    if (!p3d.parse.segmentos.length) { info.innerHTML = '⚠ Não achei geometria 2D neste DXF (só ' + JSON.stringify(p3d.parse.stats.ignoradas) + '). Exporte como DXF ASCII (R12/2000) com as linhas das paredes.'; p3d.det = null; p3dDesenhar(); p3dResumo(); return; }
    p3d.det = window.Planta3D.detectarParedes(p3d.parse.segmentos);
    var env = p3d.parse.extents ? ((p3d.parse.extents.x1 - p3d.parse.extents.x0).toFixed(1) + '×' + (p3d.parse.extents.y1 - p3d.parse.extents.y0).toFixed(1) + ' m') : '—';
    var ign = Object.keys(p3d.parse.stats.ignoradas || {}).map(function (k) { return k + '×' + p3d.parse.stats.ignoradas[k]; }).join(', ');
    info.innerHTML = '<b>' + esc(p3d.nome) + '</b> · ' + p3d.parse.segmentos.length + ' segmentos · envergadura ' + env +
      (p3d.parse.unidade.origem.indexOf('heuristica') === 0 ? ' · <span style="color:#f0b94a">unidade ASSUMIDA (' + p3d.parse.unidade.origem.slice(11) + ') — confira a envergadura e corrija no seletor se preciso</span>' : '');
    if (ign) info.innerHTML += '<br>⚠ Entidades ignoradas: ' + esc(ign) + (/INSERT/.test(ign) ? ' — geometria DENTRO de bloco não entra: exploda os blocos no CAD antes de exportar.' : '.');
    if (!p3d.det.paredes.length) info.innerHTML += '<br>⚠ Nenhum par de linhas com cara de parede (6–40 cm). Confira a UNIDADE — envergadura errada = espessuras fora da faixa.';
    p3dDesenhar(); p3dResumo();
  }
  p3dPanel.addEventListener('click', function (e) {
    var b = e.target.closest('[data-p3]'); if (!b) return; var k = b.getAttribute('data-p3');
    if (k === 'fechar') p3dPanel.style.display = 'none';
    else if (k === 'abrir') p3dPanel.querySelector('[data-p3="file"]').click();
    else if (k === 'gerar') {
      if (!p3d.det) return;
      var pd = parseFloat(p3dPanel.querySelector('[data-p3="pd"]').value) || 2.8;
      var caixas = window.Planta3D.extrudar(p3d.det.paredes, pd);
      var mid = carregarSintetico(caixas, p3d.nome.replace(/\.dxf$/i, '') + ' (2D→3D)');
      if (mid) { p3dPanel.style.display = 'none'; S._hint('🏗 ' + caixas.length + ' paredes no 3D! O QTO já mede os m² — e a 🧱 Parede-Cebola explode em camadas SINAPI no orçamento.'); }
    }
  });
  p3dPanel.addEventListener('change', function (e) {
    var t = e.target;
    if (t.getAttribute('data-p3') === 'file' && t.files && t.files[0]) {
      var f = t.files[0], fr = new FileReader();
      fr.onload = function () { p3dProcessar(String(fr.result || ''), f.name); };
      fr.readAsText(f); t.value = '';
    } else if (t.getAttribute('data-p3') === 'un' && p3d._texto) { p3dProcessar(p3d._texto, p3d.nome); } // achado do gate: era no-op — agora re-parseia com a unidade nova
  });
  // clique no preview: liga/desliga a parede proposta mais próxima
  p3dPanel.querySelector('[data-p3="cv"]').addEventListener('click', function (e) {
    if (!p3d.det || !p3d._px) return;
    var cv = e.target, rc = cv.getBoundingClientRect();
    var mx = (e.clientX - rc.left) * (cv.width / rc.width), my = (e.clientY - rc.top) * (cv.height / rc.height);
    var melhor = null, dMin = 12;
    p3d.det.paredes.forEach(function (p) {
      var x1 = p3d._px(p.x1), y1 = p3d._py(p.y1), x2 = p3d._px(p.x2), y2 = p3d._py(p.y2);
      var dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
      var t2 = L2 > 0 ? Math.max(0, Math.min(1, ((mx - x1) * dx + (my - y1) * dy) / L2)) : 0;
      var d = Math.sqrt(Math.pow(mx - (x1 + dx * t2), 2) + Math.pow(my - (y1 + dy * t2), 2));
      if (d < dMin) { dMin = d; melhor = p; }
    });
    if (melhor) { melhor.ligada = melhor.ligada === false; p3dDesenhar(); p3dResumo(); }
  });
  S._p3dProcessar = p3dProcessar; // hook de teste (injeta o texto DXF sem file input)

  // rejeição NÃO fica memoizada: falha transitória do wasm (offline/atualização) permite retentar na próxima carga
  function initApi() { if (!S._initP) S._initP = (async function () { S.api.SetWasmPath('bim/vendor/'); await S.api.Init(); S.apiReady = true; })().catch(function (e) { S._initP = null; throw e; }); return S._initP; }
  var _loadChain = Promise.resolve(); // cadeia LOCAL do mount (a global misturaria cargas de um viewer morto com o novo)
  function enfileirar(fn) { _loadChain = _loadChain.then(fn, fn); return _loadChain; }

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
        var etapa = null, cod = null, fase = null;
        for (var p = 0; p < props.length; p++) {
          var h = props[p]; if (!h || h.value == null) continue;
          var pv; try { pv = S.api.GetLine(mid, h.value, false); } catch (_) { continue; }
          if (!pv || pv.type !== IFC_PROPERTYSINGLEVALUE) continue;
          var nm = pv.Name && pv.Name.value;
          if (nm === 'OrcaPRO_Etapa' && pv.NominalValue) etapa = pv.NominalValue.value;
          else if (nm === 'OrcaPRO_CodOrc' && pv.NominalValue) cod = pv.NominalValue.value;
          else if (nm === 'OrcaPRO_Fase' && pv.NominalValue) fase = pv.NominalValue.value; // reforma: nova|demolir|existente
        }
        if (etapa == null && cod == null && fase == null) continue;
        var objs = Array.isArray(rel.RelatedObjects) ? rel.RelatedObjects : [rel.RelatedObjects];
        for (var o = 0; o < objs.length; o++) {
          var oh = objs[o]; if (!oh || oh.value == null) continue;
          var eid = oh.value; if (!mapa[eid]) mapa[eid] = {};
          if (etapa != null) mapa[eid].etapa = etapa;
          if (cod != null) mapa[eid].codOrc = cod;
          if (fase != null) mapa[eid].fase = fase;
        }
      }
    } catch (e) { /* leitura de propriedades é bônus; nunca impede o modelo de abrir */ }
    return mapa;
  }

  // v1.1.82 — FAMÍLIA/TIPO por elemento (IfcRelDefinesByType): o Revit exporta o nome do TIPO
  // como Name do IfcTypeObject (e 'Família:Tipo' no ObjectType da instância). Devolve mapa
  // expressID -> { familia, tipoId } — tipoId guarda o IfcTypeObject p/ ler os psets do TIPO depois.
  // Blindado: property é bônus, nunca impede o 3D de abrir.
  function lerTipos(mid) {
    var mapa = {};
    try {
      var rels = S.api.GetLineIDsWithType(mid, IFC_RELDEFINESBYTYPE);
      var n = rels.size();
      for (var i = 0; i < n; i++) {
        var rel; try { rel = S.api.GetLine(mid, rels.get(i), false); } catch (_) { continue; }
        if (!rel || !rel.RelatingType || !rel.RelatedObjects) continue;
        var tid = rel.RelatingType.value; if (tid == null) continue;
        var tipoObj; try { tipoObj = S.api.GetLine(mid, tid, false); } catch (_) { continue; }
        var nomeFam = (tipoObj && tipoObj.Name && tipoObj.Name.value) || null;
        if (!nomeFam) continue;
        var objs = Array.isArray(rel.RelatedObjects) ? rel.RelatedObjects : [rel.RelatedObjects];
        for (var o = 0; o < objs.length; o++) {
          var oh = objs[o]; if (!oh || oh.value == null) continue;
          mapa[oh.value] = { familia: nomeFam, tipoId: tid };
        }
      }
    } catch (e) { /* bônus */ }
    return mapa;
  }

  // valor legível de uma property (SingleValue/Enumerated/List/Bounded/Complex — nada é descartado)
  function propValor(mid, pv) {
    try {
      if (pv.type === IFC_PROPERTYSINGLEVALUE) return pv.NominalValue != null ? pv.NominalValue.value : null;
      if (pv.type === IFC_PROP_ENUM) return (pv.EnumerationValues || []).map(function (x) { return x && x.value; }).join(", ");
      if (pv.type === IFC_PROP_LIST) return (pv.ListValues || []).map(function (x) { return x && x.value; }).join(", ");
      if (pv.type === IFC_PROP_BOUNDED) {
        var lo = pv.LowerBoundValue && pv.LowerBoundValue.value, hi = pv.UpperBoundValue && pv.UpperBoundValue.value;
        return (lo != null ? lo : "…") + " – " + (hi != null ? hi : "…");
      }
      if (pv.type === IFC_PROP_COMPLEX) {
        var subs = Array.isArray(pv.HasProperties) ? pv.HasProperties : [pv.HasProperties];
        return subs.map(function (h) {
          try { var sub = S.api.GetLine(mid, h.value, false); return (sub.Name && sub.Name.value) + ": " + propValor(mid, sub); } catch (_) { return ""; }
        }).filter(Boolean).join(" · ");
      }
    } catch (e) {}
    return null;
  }
  function lerPropsDePset(mid, psetId, grupos, origem) {
    var pset; try { pset = S.api.GetLine(mid, psetId, false); } catch (_) { return; }
    if (!pset) return;
    var nomePset = (pset.Name && pset.Name.value) || "Propriedades";
    var props = [];
    if (pset.HasProperties) { // IfcPropertySet
      var hs = Array.isArray(pset.HasProperties) ? pset.HasProperties : [pset.HasProperties];
      for (var p = 0; p < hs.length; p++) {
        var h = hs[p]; if (!h || h.value == null) continue;
        var pv; try { pv = S.api.GetLine(mid, h.value, false); } catch (_) { continue; }
        if (!pv) continue;
        var v = propValor(mid, pv);
        if (v != null && v !== "") props.push({ n: (pv.Name && pv.Name.value) || "?", v: String(v) });
      }
    } else if (pset.Quantities) { // IfcElementQuantity — quantidades cruas do arquivo
      var qs = Array.isArray(pset.Quantities) ? pset.Quantities : [pset.Quantities];
      for (var q = 0; q < qs.length; q++) {
        var qh = qs[q]; if (!qh || qh.value == null) continue;
        var qv; try { qv = S.api.GetLine(mid, qh.value, false); } catch (_) { continue; }
        if (!qv) continue;
        var val = null, camp = ["LengthValue", "AreaValue", "VolumeValue", "CountValue", "WeightValue"];
        for (var c = 0; c < camp.length; c++) if (qv[camp[c]] != null) { val = qv[camp[c]].value != null ? qv[camp[c]].value : qv[camp[c]]; break; }
        if (val != null) props.push({ n: (qv.Name && qv.Name.value) || "?", v: String(val) });
      }
    }
    if (props.length) grupos.push({ pset: nomePset, origem: origem, props: props });
  }
  // TODAS as propriedades de um elemento, on-demand (clique): psets da INSTÂNCIA
  // (IfcRelDefinesByProperties) + psets do TIPO/família (IfcTypeObject.HasPropertySets — atributo
  // direto, caminho diferente!). Devolve [{pset, origem:'instância'|'família', props:[{n,v}]}].
  function propsCompletas(mid, expressID) {
    var grupos = [];
    var mo = modeloDe(mid);
    if (mo && mo.sintetico) { // criado no OrçaPRO: propriedades do editor
      var elS = (mo.elementos || []).filter(function (e) { return e.id === expressID; })[0];
      if (elS && elS.qto) grupos.push({ pset: "Dimensões (criado no OrçaPRO)", origem: "instância", props: [
        { n: "Comprimento (m)", v: String(elS.qto.comprimento || 0) }, { n: "Área (m²)", v: String(elS.qto.area || 0) }, { n: "Volume (m³)", v: String(elS.qto.volume || 0) }] });
      return grupos;
    }
    try {
      // psets da instância
      var rels = S.api.GetLineIDsWithType(mid, IFC_RELDEFINESBYPROPERTIES);
      var n = rels.size();
      for (var i = 0; i < n; i++) {
        var rel; try { rel = S.api.GetLine(mid, rels.get(i), false); } catch (_) { continue; }
        if (!rel || !rel.RelatingPropertyDefinition || !rel.RelatedObjects) continue;
        var objs = Array.isArray(rel.RelatedObjects) ? rel.RelatedObjects : [rel.RelatedObjects];
        var meu = false;
        for (var o = 0; o < objs.length; o++) if (objs[o] && objs[o].value === expressID) { meu = true; break; }
        if (!meu) continue;
        lerPropsDePset(mid, rel.RelatingPropertyDefinition.value, grupos, "instância");
      }
      // psets do TIPO (família)
      var fam = (mo && mo.familias && mo.familias[expressID]) || null;
      if (fam && fam.tipoId != null) {
        var tipoObj; try { tipoObj = S.api.GetLine(mid, fam.tipoId, false); } catch (_) { tipoObj = null; }
        if (tipoObj && tipoObj.HasPropertySets) {
          var hps = Array.isArray(tipoObj.HasPropertySets) ? tipoObj.HasPropertySets : [tipoObj.HasPropertySets];
          for (var t = 0; t < hps.length; t++) if (hps[t] && hps[t].value != null) lerPropsDePset(mid, hps[t].value, grupos, "família");
        }
      }
    } catch (e) { /* bônus */ }
    return grupos;
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

  // Lê os IfcBuildingStorey + a relação de contenção espacial → [{sid, nome, elev, eids:[expressID]}].
  // Elevation vem na unidade CRUA do arquivo (×fLen) e o placement pode deslocar — por isso é só
  // FALLBACK de ordenação; a altura confiável (y0) vem do AABB dos membros, no mundo (metros),
  // preenchida depois que as malhas existem. Blindado: pavimento é bônus, nunca impede o 3D.
  function lerPavimentos(mid) {
    var out = [], st = {};
    try {
      var fLen = unidadePrefixoBase(mid, 'LENGTHUNIT'); if (fLen == null) fLen = 1;
      var ids = S.api.GetLineIDsWithType(mid, IFC_BUILDINGSTOREY), n = ids.size();
      for (var i = 0; i < n; i++) {
        var sid = ids.get(i), ln; try { ln = S.api.GetLine(mid, sid, false); } catch (_) { continue; }
        if (!ln) continue;
        var nome = (ln.Name && ln.Name.value) || (ln.LongName && ln.LongName.value) || ('Pavimento ' + (out.length + 1));
        var reg = { sid: sid, nome: String(nome), elev: null, y0: null, eids: [] };
        var ev = ln.Elevation; if (ev && typeof ev === 'object') ev = ev.value;
        ev = parseFloat(ev); if (!isNaN(ev)) reg.elev = ev * fLen;
        st[sid] = reg; out.push(reg);
      }
      if (!out.length) return out;
      var rels = S.api.GetLineIDsWithType(mid, IFC_RELCONTAINEDINSPATIALSTRUCTURE), nR = rels.size();
      for (var r = 0; r < nR; r++) {
        var rel; try { rel = S.api.GetLine(mid, rels.get(r), false); } catch (_) { continue; }
        if (!rel || !rel.RelatingStructure || rel.RelatingStructure.value == null) continue;
        var alvo = st[rel.RelatingStructure.value]; if (!alvo) continue; // contido em Building/Space, não em pavimento
        var els = Array.isArray(rel.RelatedElements) ? rel.RelatedElements : (rel.RelatedElements ? [rel.RelatedElements] : []);
        for (var k2 = 0; k2 < els.length; k2++) { var h2 = els[k2]; if (h2 && h2.value != null) alvo.eids.push(h2.value); }
      }
    } catch (_) { /* pavimento é bônus; nunca impede o modelo de abrir */ }
    return out;
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
  function notifyModelos() { if (S._reaplicarEstilo) S._reaplicarEstilo(); if (S.opts && S.opts.onModelos) { try { S.opts.onModelos(publicos()); } catch (_) {} } } // estilo desenho pega modelo que entrar depois
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
    if (opts.onLoaded) opts.onLoaded(elementosVivos()); // 4D/QTO/clash replanejam com a disciplina nova
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
    mo.grupo.children.slice().forEach(function (m) { if (m.geometry) { try { m.geometry.dispose(); } catch (_) {} } if (m.userData && m.userData._edgeLn && m.userData._edgeLn.geometry) { try { m.userData._edgeLn.geometry.dispose(); } catch (_) {} } });
    Object.keys(mo.matCache).forEach(function (k) { try { mo.matCache[k].dispose(); } catch (_) {} });
    Object.keys(mo.transCache).forEach(function (k) { try { mo.transCache[k].dispose(); } catch (_) {} });
    modelRoot.remove(mo.grupo);
    if (typeof mid === 'number') { try { S.api.CloseModel(mid); } catch (_) {} } // mid sintético ('p3dN') no embind vira >>>0 = 0 e FECHARIA o 1º IFC real
    if (S.selected && S.selected.userData.mid === mid) { S.selected = null; S.prevMat = null; if (S._contornoSelecao) S._contornoSelecao(null); }
    if (S._limparRaioX) S._limparRaioX(); // raio-X segura refs de malhas que podem ter saído do modelo removido
    S._clashSel = (S._clashSel || []).filter(function (m) { return m.userData.mid !== mid; });
    rebuildIndices(); atualizarHud(); notifyModelos();
    if (S._limparMedidas) S._limparMedidas(); // medidas referenciam coordenadas que podem ter saído
    if (S._ctecCancelar) S._ctecCancelar(); // linha de corte riscada pode referenciar o modelo removido
    if (!S.modelos.length && S.planta && S.planta.on && S._setPlanta) S._setPlanta(false);
    else if (S.planta && S.planta.on && S._replanejarCorte) S._replanejarCorte(); // sobrou modelo: corte re-ancorado
    if (S.corteL && S.corteL.on && S._aplicarCorteL) S._aplicarCorteL(); // re-ancora (ou sai, se o bbox esvaziou)
    if (pav.isolado || pav.manual) restaurarVisibilidade(); else pavRender(); // isolamento (🏢 OU 👁) pode ter ficado sem alvo
    if (mid === 'edit' && S._editReset) S._editReset(); // apagar "Criados no OrçaPRO" = zerar edições (senão replay ressuscita + pins órfãos)
    if (opts.onLoaded) opts.onLoaded(elementosVivos());
    if (!S.modelos.length) over.style.display = 'flex';
  }
  function limparTudo() {
    if (S.planta && S.planta.on && S._setPlanta) S._setPlanta(false);
    if (S.corteL && S.corteL.on && S._setCorteL) S._setCorteL(false);
    if (S._ctecCancelar) S._ctecCancelar();
    if (S._limparMedidas) S._limparMedidas();
    S.modelos.slice().forEach(function (mo) { removerModelo(mo.mid); });
    if (S._editReset) S._editReset(); // 🗑 limpa TAMBÉM as edições (anotações/removidos sem modelo 'edit')
    S.carimbos = {}; S.qto = {}; S._fut4d = null; S._remEd = null;
    pav.isolado = null; pav.manual = false; pavRender();
  }
  S._setTransparencia = setTransparencia; S._setVisivel = setVisivel; S._setDisciplina = setDisciplina;
  S._removerModelo = removerModelo; S._limparTudo = limparTudo;

  async function carregarIFC(arrayBuffer, nome, disc) {
    // identidade + vida: um FileReader em voo de um viewer MORTO não pode nem apagar o overlay
    // nem despejar meshes/índices no viewer NOVO (S global pode já ser outra instância)
    if (S !== Sm || !S.alive) return;
    over.style.display = 'none'; loading.style.display = 'flex';
    loading.querySelector('[data-l="txt"]').textContent = 'Lendo ' + (nome || 'IFC') + '…';
    if (S.modelos.length >= 8) { loading.style.display = 'none'; over.style.display = S.modelos.length ? 'none' : 'flex'; try { alert('Limite de 8 modelos abertos ao mesmo tempo. Remova um antes de abrir outro (memória de vídeo).'); } catch (_) {} return; }
    var mid;
    try {
      await initApi();
      if (S !== Sm || !S.alive) return; // o mundo pode ter mudado durante o await (ctx-lost + remount)
      var data = new Uint8Array(arrayBuffer);
      mid = S.api.OpenModel(data);
      S.modelID = mid; // compat: "modelo corrente" = último carregado
      var modelo = { mid: mid, nome: nome || ('Modelo ' + (S.modelos.length + 1)), disciplina: disc || '', alpha: 1, visivel: true, grupo: new THREE.Group(), matCache: {}, transCache: {}, elementos: [], tipos: {}, nEl: 0, nTri: 0 };
      modelo._bytes = data; // v1.1.85: guarda os bytes do IFC p/ o ☁️ Compartilhar na nuvem (RA/RV)
      modelo.grupo.userData.mid = mid;
      modelRoot.add(modelo.grupo);
      // carimbos do exportador pyRevit + BaseQuantities — merge nos mapas compartilhados (4D/5D)
      var carimbos = lerCarimbosOrcaPro(mid), qto = lerQuantitativos(mid);
      modelo.carimbos = carimbos; modelo.qto = qto; // por modelo (expressID colide entre IFCs)
      modelo.familias = lerTipos(mid); // v1.1.82: família/tipo por elemento (Revit → IfcTypeObject)
      modelo.pavimentos = lerPavimentos(mid); // 🏢 (y0 real preenchido depois, pelo AABB dos membros)
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
        var famEl = (modelo.familias && modelo.familias[mesh.expressID]) || null;
        modelo.elementos.push({ id: mesh.expressID, uid: mid + ':' + mesh.expressID, mid: mid, arquivo: modelo.nome, tipo: tipoNome, nome: rotuloDisciplina(tipoNome), familia: famEl ? famEl.familia : null, etapa: cb.etapa || null, codOrc: cb.codOrc || null, fase: cb.fase || null, qto: (qto && qto[mesh.expressID]) || null });
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
        // 🏢 altura real de cada pavimento = menor Y (mundo, metros) entre os membros com malha
        (modelo.pavimentos || []).forEach(function (pv) {
          var y0 = Infinity;
          pv.eids.forEach(function (eid) { var bb = caixas[eid]; if (bb && bb.min.y < y0) y0 = bb.min.y; });
          if (isFinite(y0)) pv.y0 = y0;
        });
      } catch (_) {}
      S.elementos = []; S.modelos.forEach(function (mo) { S.elementos = S.elementos.concat(mo.elementos); });
      // isolamento antigo (🏢 OU 👁) ficaria incoerente (modelo novo nasce visível) -> restaura; senão só re-lista
      if (pav.isolado || pav.manual) restaurarVisibilidade(); else pavRender();
      if (S._editReaplicarRem) S._editReaplicarRem(); // "removidos na edição" persistidos valem pro IFC que acabou de chegar
      notifyModelos();
      if (opts.onLoaded) opts.onLoaded(elementosVivos());
    } catch (err) {
      try { if (mid != null && mid !== -1) S.api.CloseModel(mid); } catch (_) {}
      try { if (typeof modelo !== 'undefined' && modelo && S.modelos.indexOf(modelo) === -1) { (modelo.grupo.children || []).forEach(function (m) { if (m.geometry) { try { m.geometry.dispose(); } catch (_) {} } }); Object.keys(modelo.matCache || {}).forEach(function (k) { try { modelo.matCache[k].dispose(); } catch (_) {} }); modelRoot.remove(modelo.grupo); } } catch (_) {}
      try { rebuildIndices(); } catch (_) {} // meshPorId E meshPorUid sem restos do modelo que falhou (o manual só limpava o Uid)
      loading.style.display = 'none'; if (!S.modelos.length) over.style.display = 'flex';
      over.querySelector('div').innerHTML = '<div style="font-size:30px">⚠️</div><h3 style="margin:8px 0">Não consegui ler este IFC</h3><p style="color:#a9c1d8;font-size:13px">' + esc(String(err && err.message || err)) + '</p><p style="color:#a9c1d8;font-size:12px">Confira se é um .ifc válido (IFC2x3 ou IFC4).</p>';
    }
  }
  function rotuloDisciplina(ifcName) { var u = String(ifcName).toUpperCase(); return TIPOS[u] || String(ifcName).replace(/^IFC/, ''); }

  function abrirArquivo(file) { var fr = new FileReader(); fr.onload = function () { enfileirar(function () { return carregarIFC(fr.result, file.name); }); }; fr.readAsArrayBuffer(file); }
  // v1.1.85 — carrega IFC a partir de bytes (compartilhamento em nuvem: o celular baixa o modelo do VPS)
  S._abrirBytes = function (ab, nome, disc) { enfileirar(function () { return carregarIFC(ab, nome || 'modelo.ifc', disc); }); };
  // modelos IFC atuais com bytes guardados (p/ subir pra nuvem) — sintéticos/editor ficam de fora
  S._bytesModelos = function () { return S.modelos.filter(function (m) { return m._bytes && m._bytes.length; }).map(function (m) { return { nome: m.nome, disc: m.disciplina || '', bytes: m._bytes }; }); };
  function carregarExemplo() { fetch('bim/samples/exemplo.ifc').then(function (r) { return r.arrayBuffer(); }).then(function (ab) { enfileirar(function () { return carregarIFC(ab, 'exemplo.ifc'); }); }).catch(function () { over.querySelector('div').innerHTML = '<div style="font-size:30px">🗂️</div><p style="color:#a9c1d8">Abra um arquivo .ifc seu — o exemplo não foi encontrado.</p>'; }); }
  S._abrirArquivo = abrirArquivo; S._carregarExemplo = carregarExemplo;
}

// desmonta um viewer MORTO (pós webglcontextlost): remove listeners globais, cancela o RAF,
// libera os modelos do WASM e o renderer — deixa o caminho limpo pro montar() criar um novo.
function desmontarMorto() {
  if (!S) return;
  try { if (S.xr && S.xr.on && S._sairImersivo) S._sairImersivo(); } catch (_) {} // fecha sessão XR/loop antes de derrubar
  try { S._xrActive = false; if (S.renderer && S.renderer.setAnimationLoop) S.renderer.setAnimationLoop(null); } catch (_) {}
  try { if (S.raf) cancelAnimationFrame(S.raf); } catch (_) {}
  try { if (Reuniao.on) Reuniao.sair(); } catch (_) {}
  try { if (S._onKeyDown) window.removeEventListener('keydown', S._onKeyDown); } catch (_) {}
  try { if (S._onKeyUp) window.removeEventListener('keyup', S._onKeyUp); } catch (_) {}
  try { if (S._onMouseMove) document.removeEventListener('mousemove', S._onMouseMove); } catch (_) {}
  try { if (S._resize) window.removeEventListener('resize', S._resize); } catch (_) {}
  try { if (S._ajustarTop) window.removeEventListener('resize', S._ajustarTop); } catch (_) {}
  try { S.modelos.slice().forEach(function (mo) { if (typeof mo.mid === 'number') { try { S.api.CloseModel(mo.mid); } catch (_) {} } }); } catch (_) {}
  try { S.renderer.dispose(); } catch (_) {}
  S = null;
}
// itera as MALHAS REAIS de todos os modelos (um elemento pode ter VÁRIAS malhas — uma por cor;
// meshPorUid guarda só a última, então visibilidade via mapa deixava peças meio-escondidas)
function cadaMalha(fn) { if (!S) return; S.modelRoot.children.forEach(function (g) { (g.children || []).forEach(fn); }); }
// "removido na edição" (✏️ apagarIfc) compõe com TODO escritor de visibilidade — mesma família
// do ehFuturo4d: sem isto, 4D/isolar/restaurar/focar ressuscitam o que o editor ocultou.
function ehRemovidoEd(m) {
  var r = S && S._remEd; if (!r) return false;
  return !!r[m.userData.mid + ':' + m.userData.expressID];
}
// elementos SEM os "removidos na edição" — o que o EAP/QTO/4D/clash consomem tem que ser
// o MESMO modelo que o viewer mostra (peça apagada no ✏️ não pode ser orçada/quantificada)
function elementosVivos() {
  if (!S) return [];
  var r = S._remEd; if (!r) return S.elementos.slice();
  return S.elementos.filter(function (e) { return !r[e.uid]; });
}
// aplica o estado 4D: esconde futuros; construídos = material original; em andamento = âmbar
function aplicarEstado(est) {
  if (!S) return;
  // 4D sobrescreve a visibilidade inteira -> o isolamento (🏢/👁) deixa de valer; limpa o marcador
  if (S.pav && (S.pav.isolado || S.pav.manual)) { S.pav.isolado = null; S.pav.manual = false; if (S._pavRender) S._pavRender(); }
  var fut = {}, and = {};
  (est && est.futuros || []).forEach(function (id) { fut[id] = 1; });
  (est && est.emAndamento || []).forEach(function (id) { and[id] = 1; });
  S._fut4d = fut; // isolamento 🏢/👁 compõe com isto (não ressuscita futuros)
  S._and4d = and; // "em andamento" (âmbar): o restore do raio-X consulta isto p/ NÃO apagar o âmbar do 4D
  cadaMalha(function (m) {
    var id = m.userData.expressID; if (id == null) return;
    var uid = m.userData.mid + ':' + id;
    var chave = (fut[uid] != null || and[uid] != null) ? uid : id;
    if (fut[chave] || ehRemovidoEd(m)) { m.visible = false; return; }
    m.visible = true;
    if (m === S.selected) return; // não mexe no selecionado
    m.material = and[chave] ? S.matAndamento : (S._matBase ? S._matBase(m) : (m.userData.matOrig || m.material));
  });
}
function mostrarTudo() {
  if (!S) return;
  if (S.pav && (S.pav.isolado || S.pav.manual)) { S.pav.isolado = null; S.pav.manual = false; if (S._pavRender) S._pavRender(); }
  S._fut4d = null; S._and4d = null; // sair do 4D: nada mais é "futuro" nem "em andamento"
  cadaMalha(function (m) { m.visible = !ehRemovidoEd(m); if (m !== S.selected) m.material = S._matBase ? S._matBase(m) : (m.userData.matOrig || m.material); });
}

// Compatibilização: destaca (vermelho) os elementos de um clash e enquadra a câmera no par.
function focarClash(ids) {
  if (!S) return;
  // caminho EXTERNO (gestao.js "ver clash"): sai da Planta/Corte/Trena antes de voar a câmera —
  // senão o clash fica clipado pelo plano de corte e a órbita segue travada ("não funciona")
  if (S.planta && S.planta.on && S._setPlanta) S._setPlanta(false);
  if (S.corteL && S.corteL.on && S._setCorteL) S._setCorteL(false);
  if (S.medir && S.medir.on && S._setMedir) S._setMedir(false);
  if (S.area && S.area.on && S._setArea) S._setArea(false);
  if (S.ang && S.ang.on && S._setAng) S._setAng(false);
  if (S._fecharCtecModal && S.ctecModal && S.ctecModal.style.display === 'flex') S._fecharCtecModal(); // modal do resultado tapa o viewer -> fecha antes de voar a câmera
  if (S._ctecCancelar) S._ctecCancelar();
  if (S.edit && S.edit.on && S._setEdit) S._setEdit(false); // editor armado + câmera voando = clique seguinte criaria parede sem querer (setEdit já limpa a cadeia)
  if (S.p3dPanel && S.p3dPanel.style.display === 'flex') S.p3dPanel.style.display = 'none'; // modal 2D→3D também taparia o clash
  limparClash();
  // desfaz a seleção anterior ANTES de pintar o par de vermelho: devolve o material e apaga o contorno verde
  // (senão o selMat/contorno da seleção antiga sobrevivem por cima da cena do clash). Gate v1.1.89.
  if (S.selected) { S.selected.material = S.prevMat; S.selected = null; S.prevMat = null; }
  if (S._contornoSelecao) S._contornoSelecao(null);
  var idset = {}; (ids || []).forEach(function (id) { idset[id] = 1; });
  var box = new THREE.Box3(), any = false;
  S.modelRoot.children.forEach(function (g) { (g.children || []).forEach(function (m) {
    if (m.userData && (idset[m.userData.mid + ':' + m.userData.expressID] || idset[m.userData.expressID])) {
      if (ehRemovidoEd(m)) return; // "removido na edição" não é destacável — segue oculto
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

// ============================================================
// REFINO DO CLASH — geometria REAL (triângulo-a-triângulo, motor BIMTri)
// sobre os pares que o envelope (AABB) apontou. Cada clash ganha
// geo = 'confirmado' (tri de A atravessa tri de B) | 'descartado' (caixas se
// tocam mas a geometria não) | 'nao-verificavel' (sem malha/cap estourado —
// honesto: não-verificável NÃO vira "sem conflito"). Só triângulos dentro da
// caixa de interseção (expandida) entram no teste — mantém o custo baixo.
// ============================================================
function refinarClash(clashes, opts) {
  clashes = clashes || [];
  if (!S || typeof window === 'undefined' || !window.BIMTri) return clashes;
  opts = opts || {};
  var MAX_TRI = opts.maxTriPorElemento || 40000; // por ELEMENTO (malha completa em mundo)
  var FOLGA = opts.folga != null ? opts.folga : 0.01;
  var MAX_TESTES = opts.maxTestes || 400000;     // pares tri×tri por clash
  var MAX_CLASHES = opts.maxClashes || 800;      // refina os N piores (a lista já vem ordenada)
  var DEADLINE_MS = opts.deadlineMs || 2500;     // orçamento GLOBAL: estourou -> resto vira não-verificável (UI explica)
  try { S.modelRoot.updateMatrixWorld(true); } catch (_) {} // RAF pode estar congelado (aba em background)
  var t0 = performance.now();
  // índice uid/eid -> malhas (um elemento pode ter VÁRIAS malhas)
  var porId = {};
  S.modelRoot.children.forEach(function (g) {
    (g.children || []).forEach(function (m) {
      var ud = m.userData || {}; if (ud.expressID == null) return;
      var uid = ud.mid + ':' + ud.expressID;
      (porId[uid] = porId[uid] || []).push(m);
      (porId[ud.expressID] = porId[ud.expressID] || []).push(m);
    });
  });
  var _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vc = new THREE.Vector3();
  // CACHE por elemento (achado do gate: o mesmo elemento grande aparece em dezenas de clashes —
  // transformar a malha 1x por elemento, não 1x por clash): id -> { tris: Float32Array (mundo),
  // aabb: [x0,y0,z0,x1,y1,z1] } | 'cap' | null (sem malha)
  var cache = {};
  function cacheDe(id) {
    if (id in cache) return cache[id];
    var malhas = porId[id];
    if (!malhas || !malhas.length) return (cache[id] = null);
    var total = 0, mi, m, g;
    for (mi = 0; mi < malhas.length; mi++) {
      g = malhas[mi].geometry;
      if (g && g.attributes && g.attributes.position) total += Math.floor(((g.index ? g.index.array.length : g.attributes.position.count)) / 3);
    }
    if (total > MAX_TRI) return (cache[id] = 'cap');
    var arr = new Float32Array(total * 9), w = 0;
    var bx0 = Infinity, by0 = Infinity, bz0 = Infinity, bx1 = -Infinity, by1 = -Infinity, bz1 = -Infinity;
    for (mi = 0; mi < malhas.length; mi++) {
      m = malhas[mi]; g = m.geometry;
      if (!g || !g.attributes || !g.attributes.position) continue;
      var pos = g.attributes.position, idx = g.index ? g.index.array : null;
      var nTri = Math.floor((idx ? idx.length : pos.count) / 3), mw = m.matrixWorld;
      for (var t = 0; t < nTri; t++) {
        var i0 = idx ? idx[t * 3] : t * 3, i1 = idx ? idx[t * 3 + 1] : t * 3 + 1, i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
        _va.fromBufferAttribute(pos, i0).applyMatrix4(mw);
        _vb.fromBufferAttribute(pos, i1).applyMatrix4(mw);
        _vc.fromBufferAttribute(pos, i2).applyMatrix4(mw);
        arr[w] = _va.x; arr[w + 1] = _va.y; arr[w + 2] = _va.z;
        arr[w + 3] = _vb.x; arr[w + 4] = _vb.y; arr[w + 5] = _vb.z;
        arr[w + 6] = _vc.x; arr[w + 7] = _vc.y; arr[w + 8] = _vc.z;
        w += 9;
        if (_va.x < bx0) bx0 = _va.x; if (_va.x > bx1) bx1 = _va.x; if (_va.y < by0) by0 = _va.y; if (_va.y > by1) by1 = _va.y; if (_va.z < bz0) bz0 = _va.z; if (_va.z > bz1) bz1 = _va.z;
        if (_vb.x < bx0) bx0 = _vb.x; if (_vb.x > bx1) bx1 = _vb.x; if (_vb.y < by0) by0 = _vb.y; if (_vb.y > by1) by1 = _vb.y; if (_vb.z < bz0) bz0 = _vb.z; if (_vb.z > bz1) bz1 = _vb.z;
        if (_vc.x < bx0) bx0 = _vc.x; if (_vc.x > bx1) bx1 = _vc.x; if (_vc.y < by0) by0 = _vc.y; if (_vc.y > by1) by1 = _vc.y; if (_vc.z < bz0) bz0 = _vc.z; if (_vc.z > bz1) bz1 = _vc.z;
      }
    }
    return (cache[id] = { tris: arr.subarray(0, w), aabb: [bx0, by0, bz0, bx1, by1, bz1] });
  }
  // recorte da malha em cache pela zona da interseção (+folga)
  function filtrar(ce, caixa) {
    var x0 = caixa.min[0] - FOLGA, y0 = caixa.min[1] - FOLGA, z0 = caixa.min[2] - FOLGA;
    var x1 = caixa.max[0] + FOLGA, y1 = caixa.max[1] + FOLGA, z1 = caixa.max[2] + FOLGA;
    var tris = ce.tris, out = [];
    for (var b = 0; b < tris.length; b += 9) {
      var tx0 = Math.min(tris[b], tris[b + 3], tris[b + 6]), tx1 = Math.max(tris[b], tris[b + 3], tris[b + 6]);
      if (tx1 < x0 || tx0 > x1) continue;
      var ty0 = Math.min(tris[b + 1], tris[b + 4], tris[b + 7]), ty1 = Math.max(tris[b + 1], tris[b + 4], tris[b + 7]);
      if (ty1 < y0 || ty0 > y1) continue;
      var tz0 = Math.min(tris[b + 2], tris[b + 5], tris[b + 8]), tz1 = Math.max(tris[b + 2], tris[b + 5], tris[b + 8]);
      if (tz1 < z0 || tz0 > z1) continue;
      for (var q = 0; q < 9; q++) out.push(tris[b + q]);
    }
    return out;
  }
  function contido(bIn, bOut) { // AABB bIn dentro de bOut (com folga)
    return bIn[0] >= bOut[0] - FOLGA && bIn[1] >= bOut[1] - FOLGA && bIn[2] >= bOut[2] - FOLGA &&
           bIn[3] <= bOut[3] + FOLGA && bIn[4] <= bOut[4] + FOLGA && bIn[5] <= bOut[5] + FOLGA;
  }
  for (var i = 0; i < clashes.length; i++) {
    var c = clashes[i]; if (!c) continue;
    if (i >= MAX_CLASHES || performance.now() - t0 > DEADLINE_MS) { c.geo = 'nao-verificavel'; continue; }
    if (!c.inter || !c.inter.min || !c.inter.max) { c.geo = 'nao-verificavel'; continue; }
    var A = cacheDe(c.aId), B = cacheDe(c.bId);
    if (A === null || A === 'cap' || B === null || B === 'cap') { c.geo = 'nao-verificavel'; continue; }
    var ta = filtrar(A, c.inter), tb = filtrar(B, c.inter);
    var conf = false, naoVer = false;
    if (ta.length && tb.length) {
      var r = window.BIMTri.algumIntersecta(ta, tb, MAX_TESTES);
      if (r.estourou) naoVer = true; else conf = r.confirmado;
    }
    // CONTENÇÃO TOTAL (achado bloqueador do gate): tubo INTEIRO dentro da viga não tem
    // cruzamento de superfície — teste ponto-dentro-do-sólido (paridade de raio, voto 3 eixos)
    // com um vértice do elemento menor contra a malha COMPLETA do maior.
    if (!conf && !naoVer) {
      var menor = null, maior = null;
      if (contido(A.aabb, B.aabb)) { menor = A; maior = B; }
      else if (contido(B.aabb, A.aabb)) { menor = B; maior = A; }
      if (menor && menor.tris.length >= 3) {
        conf = window.BIMTri.dentroVoto([menor.tris[0], menor.tris[1], menor.tris[2]], maior.tris);
      }
    }
    c.geo = naoVer ? 'nao-verificavel' : (conf ? 'confirmado' : 'descartado');
  }
  return clashes;
}

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
  abrirBytes: function (ab, nome) { if (S && S._abrirBytes) S._abrirBytes(ab, nome); }, // v1.1.85 — RA/RV nuvem
  bytesModelos: function () { return (S && S._bytesModelos) ? S._bytesModelos() : []; },
  carregarExemplo: function () { if (S && S._carregarExemplo) S._carregarExemplo(); },
  aplicarEstado: aplicarEstado,
  mostrarTudo: mostrarTudo,
  focarClash: function (ids) { if (S) focarClash(ids); },
  limparClash: function () { if (S) limparClash(); },
  refinarClash: function (clashes, opts) { return refinarClash(clashes, opts); }, // tri-a-tri: anota geo=confirmado/descartado/nao-verificavel
  // ---- ferramentas de coordenação ----
  medir: function (on) { if (S && S._setMedir) S._setMedir(on == null ? !(S.medir && S.medir.on) : !!on); },
  get ultimaMedida() { return (S && S.medir && S.medir.ultima) || null; }, // {valor(m), horizontal}
  area: function (on) { if (S && S._setArea) S._setArea(on == null ? !(S.area && S.area.on) : !!on); },
  get ultimaArea() { return (S && S.medir && S.medir.ultimaArea) || null; }, // {area(m²), perimetro(m), horizontal, aproximada}
  angulo: function (on) { if (S && S._setAng) S._setAng(on == null ? !(S.ang && S.ang.on) : !!on); },
  get ultimoAngulo() { return (S && S.medir && S.medir.ultimoAngulo) || null; }, // {graus}
  limparMedidas: function () { if (S && S._limparMedidas) S._limparMedidas(); },
  // ---- pavimentos (IfcBuildingStorey) ----
  get pavimentos() { return (S && S._pavLista) ? S._pavLista().map(function (p) { return { nome: p.nome, y0: p.y0, n: p.n }; }) : []; },
  get pavimentoIsolado() { return (S && S.pav && S.pav.isolado) || null; },
  isolarPavimento: function (nome) { return (S && S._isolarPavimento) ? S._isolarPavimento(nome) : false; },
  plantaPavimento: function (nome) { return (S && S._plantaPavimento) ? S._plantaPavimento(nome) : false; },
  // ---- visibilidade ----
  isolarSelecao: function () { if (S && S._isolarSelecao) S._isolarSelecao(); },
  ocultarSelecao: function () { if (S && S._ocultarSelecao) S._ocultarSelecao(); },
  isolarTipo: function () { if (S && S._isolarTipo) S._isolarTipo(); },
  restaurarVisibilidade: function () { if (S && S._restaurarVis) S._restaurarVis(); },
  // ---- RA/RV (v1.1.84): imersivo — andar em escala real, VR, RA Android ----
  abrirXR: function () { if (S && S._toggleXR) S._toggleXR(); },
  imersivo: function (modo) { if (!S || !S.xr) return false; if (S.xr.on) return true; if (S._toggleXR && (!S.xrPanel || S.xrPanel.style.display !== 'flex')) S._toggleXR(); var b = S.xrPanel && S.xrPanel.querySelector('[data-x="' + (modo || 'caminhar') + '"]'); if (b) { b.click(); return true; } return false; },
  imersivoAtivo: function () { return !!(S && S.xr && S.xr.on); },
  sairImersivo: function () { if (S && S._sairImersivo) S._sairImersivo(); },
  foto: function () { return (S && S._tirarFoto) ? S._tirarFoto() : null; }, // dataURL do render (também baixa o PNG carimbado)
  // v1.1.83 — planta baixa técnica 2D (corte na altura do slider da Planta, hachura + cotas automáticas)
  plantaBaixa: function (o) {
    o = o || {};
    if (!S || !S._gerarPlantaTec) return null;
    var y = o.y != null ? o.y : (S.planta && S.planta.plane ? S.planta.plane.constant : null);
    if (y == null) return null; // sem Planta ativa e sem altura explícita, não há corte honesto
    return S._gerarPlantaTec({ y: y, escala: o.escala || 50, cotas: o.cotas !== false, prof: o.prof || 3, rotAlt: o.rotAlt });
  },
  estiloDesenho: function (on) { if (S && S._setEstiloDesenho) S._setEstiloDesenho(on == null ? !(S._estiloOn && S._estiloOn()) : !!on); },
  // v1.1.82 — propriedades completas do elemento (todos os psets, instância+família) e thumbnail
  propriedades: function (uid) { return (S && S._propsCompletas) ? S._propsCompletas(uid) : []; },
  thumbFamilia: function (uid, maxPx) { return (S && S._thumbFamilia) ? S._thumbFamilia(uid, maxPx) : null; },
  // ---- 2D→3D (Fase C.1): paredes confirmadas viram modelo sintético no viewer ----
  carregarSintetico: function (caixas, nome) { return (S && S._carregarSintetico) ? S._carregarSintetico(caixas, nome) : null; },
  editar: function (on) { if (S && S._setEdit) S._setEdit(on == null ? !(S.edit && S.edit.on) : !!on); },
  editarOps: function () { return (S && S._editOps) ? S._editOps() : []; },
  editarAplicar: function (ops) { if (S && S._editAplicar) S._editAplicar(ops); },
  // nº de malhas efetivamente visíveis (modelo ligado + mesh visível) — E2E/diagnóstico
  visiveis: function () {
    var v = 0; if (!S) return 0;
    S.modelRoot.children.forEach(function (g) { if (g.visible === false) return; (g.children || []).forEach(function (m) { if (m.visible) v++; }); });
    return v;
  },
  _p3dTexto: function (txt, nome) { if (S && S._p3dProcessar) S._p3dProcessar(txt, nome); }, // hook de teste: injeta DXF sem file input
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
    ['on', 'v', 'm', 'a', 'i'].forEach(function (k) { if (cfg && cfg[k] != null) S.snap[k] = !!cfg[k]; });
    try { localStorage.setItem('orcapro:bim:snap', JSON.stringify({ on: S.snap.on, v: S.snap.v, m: S.snap.m, a: S.snap.a, i: S.snap.i })); } catch (_) {}
    return { on: S.snap.on, v: S.snap.v, m: S.snap.m, a: S.snap.a, i: S.snap.i };
  },
  corteTecnico: function (o) { return (S && S._gerarCorteTec) ? S._gerarCorteTec(o || {}) : null; }, // {ax,az,bx,bz,escala,tipo,prof,inv} -> {url,w,h,escala}
  _snapAt: function (cx, cy) { if (!S || !S._raycastEm) return null; var h = S._raycastEm(cx, cy); if (!h) return null; var sn = S._aplicarSnapRef(h, S.snap ? S.snap.raio : 14); return { tipo: sn.tipo, p: [sn.p.x, sn.p.y, sn.p.z] }; }, // hook de teste: snap num ponto de tela
  _px: function (p) { if (!S) return null; var v = new THREE.Vector3(p[0], p[1], p[2]).project(S.camera); var rc = S.renderer.domElement.getBoundingClientRect(); return { x: rc.left + (v.x + 1) / 2 * rc.width, y: rc.top + (1 - v.y) / 2 * rc.height }; }, // hook de teste: mundo -> px da tela
  _visiveis: function () { if (!S) return null; var v = 0, t = 0; S.modelRoot.children.forEach(function (g) { (g.children || []).forEach(function (m) { t++; if (m.visible) v++; }); }); return { visiveis: v, total: t }; }, // hook de teste: malhas visíveis
  _cam: function () { if (!S) return null; var c = S.camera, t = S.orbit.target; return { p: [c.position.x, c.position.y, c.position.z], t: [t.x, t.y, t.z], near: c.near, far: c.far, rot: S.orbit.enableRotate }; }, // hook de teste: estado da câmera
  // ---- v1.1.89 render/navegação/raio-X: hooks de teste ----
  _selecionarPrimeiro: function () { // seleciona a 1ª malha real (imita o duplo-clique) p/ testar contorno/raio-X sem evento DOM
    if (!S) return null; var alvo = null;
    S.modelRoot.children.some(function (g) { return (g.children || []).some(function (m) { if (m.userData && m.userData.expressID != null && m.visible) { alvo = m; return true; } return false; }); });
    if (!alvo) return null;
    if (S.selected) S.selected.material = S.prevMat;
    S.selected = alvo; S.prevMat = alvo.material; alvo.material = S.selMat;
    if (S._contornoSelecao) S._contornoSelecao(alvo);
    return { tipo: alvo.userData.tipo, eid: alvo.userData.expressID, mid: alvo.userData.mid };
  },
  _temContorno: function () { if (!S) return false; var n = 0; S.scene.children.forEach(function (c) { if (c.type === 'LineSegments' && c.renderOrder === 1000) n++; }); return n; }, // nº de contornos de seleção na cena
  _contornoVis: function () { if (!S) return null; var v = null; S.scene.children.forEach(function (c) { if (c.type === 'LineSegments' && c.renderOrder === 1000) v = c.visible; }); return v; }, // visibilidade do contorno (segue o elemento)
  raioXSelecao: function () { if (S && S._raioXSelecao) S._raioXSelecao(); },
  raioXTipo: function () { if (S && S._raioXTipo) S._raioXTipo(); },
  limparRaioX: function () { if (S && S._limparRaioX) S._limparRaioX(); },
  _ghostCount: function () { if (!S) return 0; var n = 0, gm = null; S.modelRoot.children.forEach(function (g) { (g.children || []).forEach(function (m) { if (m.material && m.material.opacity === 0.1 && m.material.transparent && m.material.depthWrite === false && m.material.color && m.material.color.getHex() === 0x93a7bd) n++; }); }); return n; }, // malhas em material fantasma
  _amberCount: function () { if (!S) return 0; var n = 0; S.modelRoot.children.forEach(function (g) { (g.children || []).forEach(function (m) { if (m.material === S.matAndamento) n++; }); }); return n; }, // malhas em âmbar (4D em andamento)
  _chaoVis: function () { if (!S || !S.scene) return null; var v = null; S.scene.children.forEach(function (o) { if (o.type === 'Mesh' && o.geometry && o.geometry.type === 'PlaneGeometry' && o.material && o.material.map && o.renderOrder === -1) v = o.visible; }); return v; }, // visibilidade da sombra de contato
  _envSet: function () { return !!(S && S.scene && S.scene.environment); }, // ambiente PMREM aplicado?
  _chaoSet: function () { if (!S || !S.scene) return null; var c = null; S.scene.children.forEach(function (o) { if (o.type === 'Mesh' && o.geometry && o.geometry.type === 'PlaneGeometry' && o.material && o.material.map && o.renderOrder === -1) c = o; }); return c ? { x: c.scale.x, y: c.position.y } : null; }, // sombra de contato
  _frame: function () { if (!S || !S.alive) return false; try { S.orbit.update(); for (var tx = 0; tx < S._tickExtra.length; tx++) { try { S._tickExtra[tx](0.016); } catch (_) {} } S.renderer.render(S.scene, S.camera); return true; } catch (_) { return false; } }, // hook de teste: 1 frame síncrono FIEL ao tick real (inclui _tickExtra — marcador de snap, rescale de cotas, reunião)
  _foraDoClip: function (p) { return (S && S._foraDoClipRef) ? S._foraDoClipRef({ x: p[0], y: p[1], z: p[2] }) : false; }, // hook de teste
  _ctecModal: function () { return (S && S.ctecModal) ? S.ctecModal : null; }, // hook de teste: elemento do modal do resultado
  get elementos() { return elementosVivos(); },
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
