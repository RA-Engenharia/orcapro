/* OrcaPRO-pacote:bim-pacote — gerado de js/bim.js por tools/construir-pacotes-js.js. NÃO EDITE. */
import * as THREE from 'three';
import { OrbitControls } from '../bim/vendor/OrbitControls.js';
import { Sky } from '../bim/vendor/Sky.js';
import { criarCristal } from '../bim/cristal.js';
import { IfcAPI } from 'web-ifc';
THREE.ColorManagement.enabled = true;
function luzNum(hex) { return new THREE.Color().setRGB(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255, THREE.LinearSRGBColorSpace); }
function texSRGB(t) { if (t) t.encoding = THREE.sRGBEncoding; return t; }
var S = null;
var OBRA_ID = '';
var FED = null;
var TETO_COLETA = 200 * 1024 * 1024;
var cacheSeq = 0;
function semWasm(mo) { return !!(mo && (mo.sintetico || mo.doCache)); }
function idModelo(nome, arquivoId, abertos) {
if (typeof window === 'undefined') return '';
if (FED && window.BimFed) return window.BimFed.resolver(FED, nome, arquivoId, abertos);
return window.BimId ? window.BimId.modeloId(OBRA_ID, nome) : '';
}
function nomeDeIdentidade(mo) {
if (mo && mo.editor) return 'Criados no OrcaPRO';
return mo ? mo.nome : '';
}
function vagasOcupadas(exceto) {
var out = {};
if (!S || !S.modelos) return out;
for (var i = 0; i < S.modelos.length; i++) {
var m = S.modelos[i];
if (m === exceto || !m.modeloId) continue;
out[m.modeloId] = m.versaoId || '';
}
return out;
}
function idElemento(modeloId, el) {
if (typeof window === 'undefined' || !window.BimId) return { chave: '', globalId: '', instavel: true };
return window.BimId.doElemento(modeloId, el);
}
function lerIdentidadeIfc(api, mid, expressID) {
try {
var ln = api.GetLine(mid, expressID, false);
return {
globalId: (ln && ln.GlobalId && ln.GlobalId.value) || '',
nomeIfc: (ln && ln.Name && ln.Name.value) || '',
descricao: (ln && ln.Description && ln.Description.value) || '',
tag: (ln && ln.Tag && ln.Tag.value) || ''
};
} catch (_) { return { globalId: '', nomeIfc: '', descricao: '', tag: '' }; }
}
function recarimbarIdentidade() {
if (!S || !S.modelos) return;
var B = (typeof window !== 'undefined') ? window.BimId : null;
var novos = S.modelos.map(function (mo) { return idModelo(nomeDeIdentidade(mo), mo.versaoId, vagasOcupadas(mo)); });
S.modelos.forEach(function (mo, i) {
mo.modeloId = novos[i];
if (mo.sintetico && !mo.versaoId) mo.versaoId = 'sintetico';
(mo.elementos || []).forEach(function (e) {
if (!e.globalId && mo.sintetico && B) e.globalId = B.sintetico((mo.editor ? 'edit' : 'p3d') + '_' + e.id);
var r = idElemento(mo.modeloId, e);
e.chave = r.chave; e.chaveInstavel = r.instavel;
});
});
}
var BLOCOK_SAL = 'orcapro:blocok:v1:';
var BLOCOK_HASHES = [
'0414090e312090f655c6feac87873e7addd3767dd8cb37c87134a54a3b3059ef',
'606cee692085607e07856ca12ec08f9525167d82a21fc48e1f67366ba5607e7e'
];
function blocokEmailLiberado(email) {
var e = String(email || '').trim().toLowerCase();
if (!e) return false;
var U = (typeof window !== 'undefined' && window.Util) ? window.Util : (typeof Util !== 'undefined' ? Util : null);
if (!U || !U.sha256hex) return false;
try { return BLOCOK_HASHES.indexOf(U.sha256hex(BLOCOK_SAL + e)) >= 0; } catch (_) { return false; }
}
try { if (typeof window !== 'undefined') window.blocokEmailLiberado = blocokEmailLiberado; } catch (_) {}
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
var TIPOS = {
IFCWALL: 'Parede', IFCWALLSTANDARDCASE: 'Parede', IFCSLAB: 'Laje', IFCBEAM: 'Viga', IFCCOLUMN: 'Pilar',
IFCDOOR: 'Porta', IFCWINDOW: 'Janela', IFCROOF: 'Cobertura', IFCSTAIR: 'Escada', IFCSTAIRFLIGHT: 'Lance de escada',
IFCRAILING: 'Guarda-corpo', IFCFURNISHINGELEMENT: 'Mobiliário', IFCPLATE: 'Chapa', IFCMEMBER: 'Perfil/Montante',
IFCFLOWTERMINAL: 'Louça/terminal', IFCFLOWSEGMENT: 'Tubo/duto', IFCFLOWFITTING: 'Conexão', IFCBUILDINGELEMENTPROXY: 'Elemento genérico',
IFCCOVERING: 'Revestimento', IFCSPACE: 'Ambiente', IFCFOOTING: 'Fundação', IFCPILE: 'Estaca', IFCCURTAINWALL: 'Fachada cortina'
};
var IFC_RELDEFINESBYPROPERTIES = 4186316022, IFC_PROPERTYSINGLEVALUE = 3650150729;
var IFC_SIUNIT = 448429030;
var IFC_BUILDINGSTOREY = 3124254112, IFC_RELCONTAINEDINSPATIALSTRUCTURE = 3242617779;
var IFC_RELDEFINESBYTYPE = 781010003, IFC_PROPERTYSET = 1451395588, IFC_ELEMENTQUANTITY = 1883228015;
var IFC_RELASSIGNSTOGROUP = 1307041759, IFC_SYSTEM = 2254336722, IFC_DISTRIBUTIONSYSTEM = 3205830791;
var IFC_PROP_ENUM = 4166981789, IFC_PROP_LIST = 2752243245, IFC_PROP_BOUNDED = 871118103, IFC_PROP_COMPLEX = 2542286263;
var IFC_DISTRIBUTIONPORT = 3041715199, IFC_RELCONNECTSPORTTOELEMENT = 4201705270, IFC_RELCONNECTSPORTS = 3190031847;
var IFC_RELASSOCIATESMATERIAL = 2655215786, IFC_MATERIAL = 1838606355, IFC_MATERIALLIST = 2199411900;
var IFC_MATERIALLAYERSETUSAGE = 1303795690, IFC_MATERIALLAYERSET = 3303938423;
var IFC_MATERIALPROFILESETUSAGE = 3079605661, IFC_MATERIALPROFILESET = 164193824;
var IFC_MATERIALCONSTITUENTSET = 2852063980, IFC_MATERIALPROPERTIES = 3265635763;
function montar(host, opts) {
opts = opts || {};
if (S && S.alive) {
S.opts = opts;
host.innerHTML = '';
host.style.position = 'relative';
host.style.background = 'radial-gradient(120% 120% at 50% 0%, #16324f 0%, #0b1a2b 70%)';
[(S.xr && S.xr.video), S.bar, S.barToggle, S.hud, S.over, S.loading, S.renderer.domElement, S._cvVivo, S.aviso3d, S.vcubeEl, S.hint, S.cortePanel, S.corteLPanel, S.snapPanel, S.snapMarca, S.travaChip, S.ctlMira, S.eixoBar, S.marcasSvg, S.guiaH, S.guiaV, S.lupaEl, S.ctecCfg, S.ctecModal, S.plantaCfg, S.pavPanel, S.visPanel, S.sisPanel, S.blocokPanel, S.p3dPanel, S.editPanel, S.editDist, S.xrPanel, S.xrHud, S.reqPanel].forEach(function (el) { if (el) host.appendChild(el); });
if (S._onDragOver) { host.addEventListener('dragover', S._onDragOver); host.addEventListener('drop', S._onDrop); }
S.host = host;
try { if (S._fecharPaineis && S.bar && S.bar.style.display === 'none') S._fecharPaineis(null); } catch (eP) {}
setTimeout(function () { if (S && S._resize) S._resize(); if (S && S._ajustarTop) S._ajustarTop(); if (S && S._aplicarTema) S._aplicarTema(); try { if (window.BimMesa) window.BimMesa.aoMontar(); } catch (eM) {} }, 0);
try { if (S._ro) { S._ro.disconnect(); S._ro.observe(host); } } catch (eRo) {}
return;
}
if (S && !S.alive) desmontarMorto();
host.innerHTML = '';
host.style.position = 'relative';
host.style.background = 'radial-gradient(120% 120% at 50% 0%, #16324f 0%, #0b1a2b 70%)';
function ico(n) {
var P = {
fechar: '<path d="M4 4l8 8M12 4l-8 8"/>',
camadas: '<path d="M8 2l6 3-6 3-6-3z"/><path d="M2 8l6 3 6-3"/><path d="M2 11l6 3 6-3"/>',
relatorios: '<path d="M4 2h5l3 3v9H4z"/><path d="M6 7.5h4M6 10h4M6 12.5h2"/>',
requisicoes: '<path d="M3 4h10v10H3z"/><path d="M6 2h4v3H6z"/><path d="M5.5 8.5h5M5.5 11h3"/>',
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
xr: '<path d="M2 6.5A1.5 1.5 0 0 1 3.5 5h9A1.5 1.5 0 0 1 14 6.5v3A1.5 1.5 0 0 1 12.5 11h-2.2L8 9 5.7 11H3.5A1.5 1.5 0 0 1 2 9.5z"/><circle cx="5" cy="8" r="0.7"/><circle cx="11" cy="8" r="0.7"/>',
grafico: '<path d="M2 2v11a1 1 0 0 0 1 1h11"/><path d="M6 11V7M9 11V4M12 11V6"/>',
sistemas: '<path d="M8 2s4 4.6 4 7.4A4 4 0 0 1 4 9.4C4 6.6 8 2 8 2z"/><path d="M6.4 9.6a1.7 1.7 0 0 0 1.7 1.7"/>'
};
return '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:3px">' + (P[n] || '') + '</svg>';
}
function ehToque() {
try { return !(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches); }
catch (e) { return false; }
}
function aceitaIFC() { return ehToque() ? '' : ' accept=".ifc,.skp,.zip"'; }
function classificarEntradaBim(itens) {
var r = { ifc: [], skp: [], zip: [], outros: [] };
(itens || []).forEach(function (it) {
var nome = String(typeof it === 'string' ? it : ((it && it.name) || ''));
if (/\.ifc$/i.test(nome)) r.ifc.push(it);
else if (/\.skp$/i.test(nome)) r.skp.push(it);
else if (/\.zip$/i.test(nome)) r.zip.push(it);
else r.outros.push(it);
});
return r;
}
var bar = document.createElement('div');
bar.style.cssText = 'position:absolute;left:0;right:0;top:0;z-index:4;display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 10px;background:linear-gradient(180deg,rgba(15,39,64,.9),rgba(15,39,64,0))';
bar.setAttribute('data-bim-barra', '1');
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
'<button class="btn sm" data-b="cota" title="Cotar rede: toque num tubo e o comprimento dele aparece em cima da peça — o número vem do IFC, não é medido na tela">' + ico('cotas') + 'Cotar</button>' +
'<button class="btn sm" data-b="cota-iguais" title="Cotar todos os trechos iguais ao último tocado (mesma família, ou mesmo tipo quando o IFC não trouxer família)">' + ico('camadas') + 'Iguais</button>' +
'<button class="btn sm" data-b="cota-todas" title="Cotar a rede inteira que estiver à vista">' + ico('sistemas') + 'Toda a rede</button>' +
'<button class="btn sm" data-b="cota-numerar" title="Numera os tubos seguindo o encadeamento da rede (R01-T001, R01-T002...) e mostra o numero em cima de cada peca">' + ico('cotas') + 'Numerar</button>' +
'<button class="btn sm" data-b="cota-planilha" title="Baixa a relacao dos tubos por ramal: numero, comprimento e a conexao de cada extremidade">' + ico('relatorios') + 'Planilha</button>' +
'<button class="btn sm" data-b="req-bim" title="Levanta as pecas do modelo por familia, casa com o banco de insumos e monta a requisicao de material">' + ico('requisicoes') + 'Requisitar</button>' +
'<button class="btn sm" data-b="cota-limpar" title="Apagar as cotas da rede">' + ico('lixo') + 'Limpar cotas</button>' +
'<button class="btn sm" data-b="planta" title="Planta baixa: corta o modelo numa altura e vê de cima">' + ico('planta') + 'Planta</button>' +
'<button class="btn sm" data-b="corte" title="Corte livre: plano de corte horizontal, vertical ou em qualquer ângulo">' + ico('corte') + 'Corte</button>' +
'<button class="btn sm" data-b="p3d" title="Reconstruir 3D a partir da planta baixa em DXF (assistido: o sistema propõe as paredes, você confirma)">' + ico('p3d') + '2D→3D</button>' +
'<button class="btn sm" data-b="editar" title="Editor: criar paredes, lajes e pilares SINTÉTICOS, mover, apagar e anotar — salvo com a obra">' + ico('editar') + 'Editar</button>' +
'<button class="btn sm" data-b="pav" title="Pavimentos declarados no IFC: isolar um andar ou gerar a planta dele">' + ico('pav') + 'Pav.</button>' +
'<button class="btn sm" data-b="vis" title="Visibilidade: isolar ou ocultar o elemento selecionado (duplo-clique seleciona)">' + ico('ver') + 'Ver</button>' +
'<button class="btn sm" data-b="xr" title="Realidade Mista/Virtual: andar dentro do modelo em escala real (1:1) ou escolhida, medir, ver por disciplina e gerar QR para o celular">' + ico('xr') + 'RA/RV</button>' +
'<button class="btn sm" data-b="sistema" title="Colorir a tubulação por sistema hidrossanitário (água fria, água quente, esgoto, pluvial, gás, incêndio, ventilação) com cores editáveis — vale na Planta baixa e no RA/RV">' + ico('sistemas') + 'Sistemas</button>' +
(blocokLiberado() ? '<button class="btn sm" data-b="blocok" title="Plantas Executivas Blocok: lê as paredes do IFC e gera a prancha de cada parede com as placas 90×90 numeradas e paginadas + tabela de material (placas + insumos calculados) + carga na fundação">' + ico('parede') + 'Blocok</button>' : '') +
'<button class="btn sm" data-b="foto" title="Salvar foto PNG do modelo com carimbo de data">' + ico('foto') + 'Foto</button>' +
'<button class="btn sm" data-b="fit">' + ico('fit') + 'Enquadrar</button>' +
'<button class="btn sm" data-b="tema" title="Cor da interface do BIM: OrçaPRO → Grafite → Claro">' + ico('tema') + '</button>' +
'<input type="file" data-b="file"' + aceitaIFC() + ' multiple style="display:none">';
host.appendChild(bar);
function icoG(n) { return ico(n).replace('width="13" height="13"', 'width="17" height="17"').replace('margin-right:3px', 'margin-right:0'); }
var dock = document.createElement('div');
dock.style.cssText = 'position:absolute;left:10px;top:calc(100% + 2px);display:flex;flex-direction:column;gap:6px;z-index:6;pointer-events:auto;overflow-y:auto;overflow-x:hidden;padding-right:2px';
var GRUPOS_DOCK = [
{ rot: 'Medição', ic: 'medir', bs: ['medir', 'area', 'angulo', 'snap', 'limpar-medidas'] },
{ rot: 'Cotar rede', ic: 'cotas', bs: ['cota', 'cota-iguais', 'cota-todas', 'cota-numerar', 'cota-planilha', 'cota-limpar'] },
{ rot: 'Requisitar', ic: 'requisicoes', bs: ['req-bim'] },
{ rot: 'Cortes & Plantas', ic: 'planta', bs: ['planta', 'corte', 'pav'] },
{ rot: 'Visibilidade', ic: 'ver', bs: ['vis', 'sistema', 'foto'] },
{ rot: 'Edição & 2D→3D', ic: 'editar', bs: ['editar', 'p3d', 'blocok'] },
{ rot: 'Imersivo RA/RV', ic: 'xr', bs: ['xr'] }
];
var PAINEIS_DOCK = [['modelos', 'Modelos carregados'], ['4d', 'Simulação 4D'], ['clash', 'Compatibilização (clash)'], ['qto', 'Quantitativos'], ['familias', 'Banco de famílias'], ['6d', '6D/7D Ciclo de vida']];
var dockHover = !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
var flyTimer = null;
function faixaVisivel() {
var alturaJ = window.innerHeight || document.documentElement.clientHeight || 800;
var r;
try { r = ((S && S.host) || host).getBoundingClientRect(); } catch (_) { r = null; }
if (!r || !r.height) return { topo: 0, fundo: alturaJ, fundoHost: alturaJ };
return { topo: Math.max(0, r.top), fundo: alturaJ, fundoHost: Math.min(alturaJ, r.bottom) };
}
function fecharFlys() { if (flyTimer) { clearTimeout(flyTimer); flyTimer = null; } dock.querySelectorAll('.bim-fly').forEach(function (f) { f.style.display = 'none'; }); }
function agendarFechar() { if (flyTimer) clearTimeout(flyTimer); flyTimer = setTimeout(fecharFlys, 320); }
function abrirFly(head, fly) {
fecharFlys();
var r = head.getBoundingClientRect();
fly.style.display = 'flex';
var fx = faixaVisivel();
var larguraJ = window.innerWidth || 400;
fly.style.maxHeight = Math.max(120, Math.floor(fx.fundo - fx.topo - 16)) + 'px';
var h = Math.min(fly.offsetHeight || 200, fx.fundo - fx.topo - 16);
if (dock.getAttribute('data-dir') === 'row') {
var w = fly.offsetWidth || 172;
fly.style.left = Math.round(Math.max(8, Math.min(r.left, larguraJ - w - 8))) + 'px';
var abaixo = r.bottom + 4;
var cabeAbaixo = abaixo + h + 8 <= fx.fundo;
fly.style.top = Math.round(cabeAbaixo ? abaixo : Math.max(fx.topo + 8, r.top - h - 4)) + 'px';
return;
}
fly.style.left = (r.right + 4) + 'px';
fly.style.top = Math.round(Math.max(fx.topo + 8, Math.min(r.top, fx.fundo - h - 8))) + 'px';
}
function montarGrupo(g) {
var wrap = document.createElement('div');
wrap.style.cssText = 'position:relative;flex:0 0 auto';
var head = document.createElement('button');
head.className = 'btn sm';
head.setAttribute('data-grp', g.rot);
head.title = g.rot;
head.style.cssText = 'width:42px;height:42px;display:flex;align-items:center;justify-content:center;border-radius:11px;padding:0;box-shadow:0 2px 10px rgba(0,0,0,.35)';
head.innerHTML = icoG(g.ic);
var fly = document.createElement('div');
fly.className = 'bim-fly';
fly.style.cssText = 'position:fixed;display:none;flex-direction:column;gap:4px;padding:8px;border-radius:11px;min-width:172px;max-height:70vh;overflow-y:auto;box-shadow:0 10px 30px rgba(0,0,0,.45);z-index:60';
fly.innerHTML = '<div class="bim-fly-tit" style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;opacity:.75;padding:0 4px 2px">' + g.rot + '</div>';
if (g.bs) g.bs.forEach(function (k) {
var b = bar.querySelector('[data-b="' + k + '"]');
if (!b) return;
b.style.width = '100%';
b.style.justifyContent = 'flex-start';
fly.appendChild(b);
});
if (g.pp) g.pp.forEach(function (par) {
var pb = document.createElement('button');
pb.className = 'btn sm';
pb.setAttribute('data-pp', par[0]);
pb.style.cssText = 'width:100%;justify-content:flex-start';
pb.innerHTML = ico('grafico') + par[1];
fly.appendChild(pb);
});
wrap.appendChild(head); wrap.appendChild(fly);
if (dockHover) {
wrap.addEventListener('mouseenter', function () { abrirFly(head, fly); });
wrap.addEventListener('mouseleave', agendarFechar);
head.addEventListener('click', function (ev) { ev.stopPropagation(); abrirFly(head, fly); });
} else {
head.addEventListener('click', function (ev) {
ev.stopPropagation();
var aberto = fly.style.display === 'flex';
if (aberto) fecharFlys(); else abrirFly(head, fly);
});
}
dock.appendChild(wrap);
}
GRUPOS_DOCK.forEach(montarGrupo);
if (opts && opts.onPainel) montarGrupo({ rot: 'Análise & Orçamento', ic: 'grafico', pp: PAINEIS_DOCK });
bar.appendChild(dock);
dock.addEventListener('click', function (e) {
var pb = e.target.closest('[data-pp]');
var oAtual = (S && S.opts) || opts;
if (pb && oAtual && oAtual.onPainel) { fecharFlys(); oAtual.onPainel(pb.getAttribute('data-pp')); return; }
if (e.target.closest('[data-b]')) { if (flyTimer) clearTimeout(flyTimer); flyTimer = setTimeout(fecharFlys, 60); }
});
var dockDocClick = function (e) { if (!dock.contains(e.target)) fecharFlys(); };
document.addEventListener('click', dockDocClick, true);
function dockRepintar(T) {
dock.querySelectorAll('.bim-fly').forEach(function (f) { f.style.background = T.painel; f.style.border = '1px solid ' + T.borda; f.style.color = T.texto; });
}
var barToggle = document.createElement('button');
barToggle.className = 'btn sm';
barToggle.setAttribute('data-bim-barra-toggle', '1');
barToggle.title = 'Mostrar ou esconder a barra de ferramentas (deixa a vista limpa)';
var ehTelaPequena = (host.clientWidth || window.innerWidth || 1024) <= 640;
var barraAberta = !ehTelaPequena;
try { var _pref = localStorage.getItem('orcapro:bim:barra'); if (_pref) barraAberta = _pref !== 'recolhida'; } catch (_) {}
var visitante = !!opts.visitante;
if (visitante) barraAberta = false;
function aplicarEstiloToggle() {
ehTelaPequena = (host.clientWidth || window.innerWidth || 1024) <= 640;
if (ehTelaPequena) {
var inst = document.getElementById('opr-install');
var bb = (inst && inst.offsetHeight) ? (inst.offsetHeight + 26) : 14;
barToggle.style.cssText = 'position:fixed;right:12px;bottom:' + bb + 'px;z-index:40;padding:12px 18px;font-size:14.5px;font-weight:800;border:0;border-radius:999px;background:#16a34a;color:#fff;box-shadow:0 6px 22px rgba(0,0,0,.5);cursor:pointer';
bar.style.maxHeight = ''; bar.style.overflowY = ''; bar.style.paddingBottom = '';
} else {
barToggle.style.cssText = 'position:absolute;right:10px;top:8px;z-index:5;padding:5px 9px;font-size:12px;opacity:.94;box-shadow:0 2px 8px rgba(0,0,0,.35)';
bar.style.maxHeight = ''; bar.style.overflowY = ''; bar.style.paddingBottom = '';
}
try {
var rH = ((S && S.host) || host).getBoundingClientRect();
var rB = bar.getBoundingClientRect();
var fxD = faixaVisivel();
var visTopo = Math.max(rH.top, fxD.topo);
var visFundo = Math.min(rH.bottom, fxD.fundoHost);
var abaixoDaBarra = Math.max(visTopo, rB.bottom + 2);
var disponivel = Math.floor(visFundo - abaixoDaBarra - 8);
dock.style.top = Math.round(abaixoDaBarra - rB.top) + 'px';
var nGrupos = dock.children.length || 6;
var precisaAltura = nGrupos * 48;
var precisaLargura = nGrupos * 48 + 20;
var deitar = disponivel < precisaAltura && (rH.width || 0) >= precisaLargura;
dock.setAttribute('data-dir', deitar ? 'row' : 'col');
if (deitar) {
dock.style.display = 'flex';
dock.style.flexDirection = 'row';
dock.style.maxHeight = '';
dock.style.height = '46px';
dock.style.overflowY = 'hidden';
dock.style.overflowX = 'auto';
dock.style.right = '';
dock.style.maxWidth = Math.max(96, Math.floor((rH.width || 0) - 20)) + 'px';
} else {
dock.style.flexDirection = 'column';
dock.style.height = '';
dock.style.overflowY = 'auto';
dock.style.overflowX = 'hidden';
dock.style.right = '';
dock.style.maxWidth = '';
dock.style.display = 'flex';
dock.style.maxHeight = Math.max(44, disponivel) + 'px';
}
} catch (eD) {}
barToggle.innerHTML = barraAberta ? (ehTelaPequena ? '' + (typeof Icones !== 'undefined' ? Icones.get('fechar', 15) : '') + ' Fechar ferramentas' : '⤢ Esconder') : '' + (typeof Icones !== 'undefined' ? Icones.get('ajustes', 15) : '') + ' Ferramentas';
if (visitante) barToggle.style.display = 'none';
}
function setBarra(aberta) {
if (visitante) aberta = false;
barraAberta = !!aberta;
bar.style.display = aberta ? 'flex' : 'none';
barToggle.innerHTML = aberta ? (ehTelaPequena ? '' + (typeof Icones !== 'undefined' ? Icones.get('fechar', 15) : '') + ' Fechar ferramentas' : '⤢ Esconder') : '' + (typeof Icones !== 'undefined' ? Icones.get('ajustes', 15) : '') + ' Ferramentas';
try { localStorage.setItem('orcapro:bim:barra', aberta ? 'aberta' : 'recolhida'); } catch (_) {}
if (aberta && ehTelaPequena && host.scrollIntoView) { try { host.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (_) {} }
if (S && S._ajustarTop) S._ajustarTop();
}
var fabObs = null;
try {
fabObs = new MutationObserver(aplicarEstiloToggle);
fabObs.observe(document.body, { childList: true });
} catch (eF) {}
barToggle.addEventListener('click', function () { setBarra(!barraAberta); });
host.appendChild(barToggle);
aplicarEstiloToggle();
window.addEventListener('resize', aplicarEstiloToggle);
var dockRaf = 0;
function aoRolar() {
if (dockRaf) return;
dockRaf = requestAnimationFrame(function () { dockRaf = 0; aplicarEstiloToggle(); });
}
window.addEventListener('scroll', aoRolar, true);
setBarra(barraAberta);
var TEMAS = {
orcapro: { nome: 'OrçaPRO', ativo: '#16a34a', bar: 'linear-gradient(180deg,rgba(15,39,64,.9),rgba(15,39,64,0))', painel: 'rgba(15,39,64,.97)', borda: '#24435f', texto: '#dbe8f5', fundo: 'radial-gradient(120% 120% at 50% 0%, #16324f 0%, #0b1a2b 70%)' },
revit: { nome: 'Grafite', ativo: '#1858A8', bar: 'linear-gradient(180deg,rgba(59,68,75,.96),rgba(59,68,75,0))', painel: 'rgba(42,49,56,.97)', borda: '#565f66', texto: '#e8eaec', fundo: 'radial-gradient(120% 120% at 50% 0%, #4a5158 0%, #2e343a 70%)' },
claro: { nome: 'Claro', ativo: '#0e7490', bar: 'linear-gradient(180deg,rgba(235,241,247,.95),rgba(235,241,247,0))', painel: 'rgba(248,250,252,.98)', borda: '#c4d0dc', texto: '#1a2b3c', fundo: 'radial-gradient(120% 120% at 50% 0%, #e6edf4 0%, #c9d6e3 70%)' }
};
var temaId = 'orcapro';
try { var t0 = localStorage.getItem('orcapro:bim:tema'); if (t0 && TEMAS[t0]) temaId = t0; } catch (_) {}
function corAtiva() { return TEMAS[temaId].ativo; }
function aplicarTema() {
var T = TEMAS[temaId];
var h2 = (S && S.host) || host;
h2.style.background = (S && ((S._estiloOn && S._estiloOn()) || (S._linhaOn && S._linhaOn()))) ? '#fff' : T.fundo;
bar.style.background = T.bar;
bar.style.color = T.texto;
[S.editPanel, S.snapPanel, S.pavPanel, S.visPanel, S.editDist, S.p3dPanel].forEach(function (pn) {
if (!pn) return;
pn.querySelectorAll && pn.querySelectorAll('button').forEach(function (b3) { if (b3.style.background && b3.style.background !== '') b3.style.background = corAtiva(); });
});
bar.querySelectorAll('button').forEach(function (b2) { if (b2.style.background && b2.style.background !== '') b2.style.background = corAtiva(); });
dockRepintar(T);
try { localStorage.setItem('orcapro:bim:tema', temaId); } catch (_) {}
}
function trocarTema() {
temaId = temaId === 'orcapro' ? 'revit' : (temaId === 'revit' ? 'claro' : 'orcapro');
aplicarTema();
if (S && S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('paleta', 15) : '') + ' Tema: ' + TEMAS[temaId].nome);
}
function definirTema(id) {
if (!TEMAS[id]) return false;
temaId = id;
try { localStorage.setItem('orcapro:bim:tema', id); } catch (_) {}
aplicarTema();
return true;
}
var SIS_ORDEM = ['agua_fria', 'agua_quente', 'esgoto', 'pluvial', 'gas', 'incendio', 'ventilacao', 'outros'];
var SIS_PADRAO = {
agua_fria: { nome: 'Água fria', cor: '#2563eb' },
agua_quente: { nome: 'Água quente', cor: '#f97316' },
esgoto: { nome: 'Esgoto / sanitário', cor: '#7c4a12' },
pluvial: { nome: 'Águas pluviais', cor: '#16a34a' },
gas: { nome: 'Gás', cor: '#eab308' },
incendio: { nome: 'Incêndio (PPCI)', cor: '#dc2626' },
ventilacao: { nome: 'Ventilação', cor: '#7c3aed' },
outros: { nome: 'Outros / não classificado', cor: '#6b7a8a' }
};
var sisCores = {}; SIS_ORDEM.forEach(function (k) { sisCores[k] = SIS_PADRAO[k].cor; });
try { var _sc0 = JSON.parse(localStorage.getItem('orcapro:bim:sistemas') || '{}'); SIS_ORDEM.forEach(function (k) { if (_sc0[k] && /^#[0-9a-f]{6}$/i.test(_sc0[k])) sisCores[k] = _sc0[k]; }); } catch (_) {}
function salvarSisCores() { try { localStorage.setItem('orcapro:bim:sistemas', JSON.stringify(sisCores)); } catch (_) {} }
var sisColor = { on: false };
var sisMatCache = {};
function classificaSistemaTxt(s) {
s = String(s || '').toLowerCase().replace(/hidr[oa]ss?anit\w*/g, ' ');
if (/inc[eê]ndio|hidrante|sprinkler|combate a inc|\bppci\b|\bspk\b/.test(s)) return 'incendio';
if (/\bg[aá]s\b|\bglp\b|\bgnv\b|g[aá]s natural|combust[ií]v/.test(s)) return 'gas';
if (/exaust|\bduto\b|\bduct\b|\bhvac\b|\bavac\b|climatiz|ar[ -]?condic/.test(s)) return 'ventilacao';
if (/pluvial|[aá]guas? ?pluvia|rainwater|\bstorm\b|calha/.test(s)) return 'pluvial';
if (/esgoto|\besg\b|sanit[aá]ri|sewage|\bwaste\b|\bfoul\b|ventila[çc]/.test(s)) return 'esgoto';
if (/[aá]gua ?quente|\baq\b|hot ?water|domestichotwater|\bquente\b/.test(s)) return 'agua_quente';
if (/[aá]gua ?fria|\baf\b|cold ?water|domesticcoldwater|[aá]gua ?pot[aá]vel|[aá]gua|\bwater\b/.test(s)) return 'agua_fria';
return 'outros';
}
function sisTxtEl(e) { return (e.nome || '') + ' ' + (e.familia || '') + ' ' + (e.tipo || '') + ' ' + (e.tag || ''); }
function classificaEl(e) {
var k = classificaSistemaTxt(e.sistemaIfc || '');
if (k === 'outros') k = classificaSistemaTxt(sisTxtEl(e));
return k;
}
function sisMat(chave, alpha) {
var cor = sisCores[chave] || sisCores.outros;
var op = (chave === 'outros' ? 0.30 : 1) * (alpha == null ? 1 : Math.max(0.05, Math.min(1, alpha)));
op = Math.round(op / 0.05) * 0.05;
var transp = op < 0.985;
var key = chave + '@' + op.toFixed(2) + '@' + cor;
if (!sisMatCache[key]) sisMatCache[key] = new THREE.MeshStandardMaterial({ color: new THREE.Color(cor), roughness: 0.55, metalness: 0.05, transparent: transp, opacity: op, depthWrite: !transp, side: THREE.DoubleSide });
return sisMatCache[key];
}
function limparSisMatCache() { Object.keys(sisMatCache).forEach(function (k) { try { sisMatCache[k].dispose(); } catch (_) {} }); sisMatCache = {}; }
function construirSisIdx() {
(S.elementos || []).forEach(function (e) {
var k = classificaEl(e);
e.sistema = k;
var m = S.meshPorUid[e.uid]; if (m) m.userData._sisK = k;
});
}
function carimbarConsulta() {
if (!S || !S.modelos) return 0;
var porUid = {}, n = 0;
try {
pavLista().forEach(function (p) {
for (var u in p.uids) { if (Object.prototype.hasOwnProperty.call(p.uids, u)) porUid[u] = p.nome; }
});
} catch (_) {}
S.modelos.forEach(function (mo) {
(mo.elementos || []).forEach(function (e) {
e.pavimento = porUid[e.uid] || '';
var k = classificaEl(e);
e.sistema = k;
e.sistemaNome = (SIS_PADRAO[k] && SIS_PADRAO[k].nome) || '';
n++;
});
});
return n;
}
function valoresDe(campo) {
var c = String(campo || ''), cnt = {};
(S.elementos || []).forEach(function (e) {
var v = c.indexOf('.') < 0 ? e[c] : ((e[c.split('.')[0]] || {})[c.split('.')[1]]);
if (v == null || String(v).trim() === '') return;
var s = String(v);
cnt[s] = (cnt[s] || 0) + 1;
});
return Object.keys(cnt).sort().map(function (v) { return { valor: v, n: cnt[v] }; });
}
function sistemasPresentes() {
var cnt = {};
(S.elementos || []).forEach(function (e) { var k = e.sistema || classificaEl(e); cnt[k] = (cnt[k] || 0) + 1; });
return cnt;
}
setTimeout(function () { if (S && S.alive) { S._aplicarTema = aplicarTema; aplicarTema(); } }, 0);
var hud = document.createElement('div');
hud.style.cssText = 'position:absolute;right:10px;bottom:10px;z-index:3;background:rgba(15,39,64,.85);border:1px solid #24435f;border-radius:8px;padding:6px 10px;font-size:12px;color:#bcd0e4';
hud.innerHTML = 'Elementos: <b data-h="el">0</b> · Triângulos: <b data-h="tri">0</b>';
if (visitante) hud.style.display = 'none';
host.appendChild(hud);
var over = document.createElement('div');
over.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:2;pointer-events:none';
over.innerHTML = '<div class="bim-flut" style="pointer-events:auto;text-align:center;background:var(--card-bg,#fff);border:2px dashed var(--linha-forte,#8697a9);border-radius:var(--raio-lg,16px);padding:28px 34px;max-width:420px;color:var(--texto,#15181d)"><div style="font-size:34px;color:var(--aco,#2d6a9c)">' + (typeof Icones !== 'undefined' ? Icones.get('obra', 22) : '') + '</div><h3 style="margin:8px 0 6px;font-weight:600">Arraste um <b>.IFC</b> aqui</h3><p style="color:var(--texto-fraco,#4b5563);font-size:13px;margin:4px 0">Exporte o IFC do programa de projeto e solte — abre em 3D, offline. Recebeu o <b>arquivo da obra (.zip)</b> no grupo? Solte ele aqui, ou use <b>Arquivo da obra</b> no alto.</p></div>';
host.appendChild(over);
var loading = document.createElement('div');
loading.style.cssText = 'position:absolute;inset:0;background:rgba(11,26,43,.86);display:none;align-items:center;justify-content:center;flex-direction:column;gap:12px;z-index:5;color:var(--texto,#1a2b3c)';
loading.innerHTML = '<div style="width:40px;height:40px;border:4px solid var(--linha,#d3dce6);border-top-color:var(--aco,#2d6a9c);border-radius:50%;animation:bimsp 1s linear infinite"></div><div data-l="txt">Lendo o IFC…</div>';
host.appendChild(loading);
if (!document.getElementById('bim-spin-style')) { var st = document.createElement('style'); st.id = 'bim-spin-style'; st.textContent = '@keyframes bimsp{to{transform:rotate(360deg)}}'; document.head.appendChild(st); }
var scene = new THREE.Scene(); scene.background = null;
var camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000); camera.position.set(20, 18, 22);
var envPadrao3d = null;
var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
try { renderer.outputColorSpace = THREE.SRGBColorSpace; } catch (_) {}
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
try { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; } catch (_) {}
try { renderer.xr.enabled = true; } catch (_) {}
function prepararRenderer(r, de) {
r.setPixelRatio(de.getPixelRatio());
r.outputEncoding = de.outputEncoding;
try { r.outputColorSpace = THREE.SRGBColorSpace; } catch (_) {}
r.toneMapping = de.toneMapping; r.toneMappingExposure = de.toneMappingExposure;
try { r.shadowMap.enabled = de.shadowMap.enabled; r.shadowMap.type = de.shadowMap.type; } catch (_) {}
try { r.xr.enabled = true; } catch (_) {}
r.clippingPlanes = de.clippingPlanes; r.localClippingEnabled = de.localClippingEnabled;
r.sortObjects = de.sortObjects; r.autoClear = de.autoClear;
try { r.setClearColor(de.getClearColor(new THREE.Color()), de.getClearAlpha()); } catch (_) {}
try { if ('useLegacyLights' in de) r.useLegacyLights = de.useLegacyLights; if ('physicallyCorrectLights' in de) r.physicallyCorrectLights = de.physicallyCorrectLights; } catch (_) {}
}
renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;outline:none';
host.appendChild(renderer.domElement);
renderer.domElement.addEventListener('webglcontextlost', function (e) { aoPerderContexto3d(e, renderer); }, false);
renderer.domElement.addEventListener('webglcontextrestored', function (e) { aoVoltarContexto3d(e); }, false);
var hemi = new THREE.HemisphereLight(luzNum(0xffffff), luzNum(0x223344), 0.55); scene.add(hemi);
var dir = new THREE.DirectionalLight(0xffffff, 1.0); dir.position.set(30, 50, 20); scene.add(dir);
try {
var _pmrem = new THREE.PMREMGenerator(renderer);
var _envScn = new THREE.Scene();
var _room = new THREE.Mesh(new THREE.BoxGeometry(24, 18, 24), new THREE.MeshStandardMaterial({ side: THREE.BackSide, roughness: 1, metalness: 0, color: luzNum(0x9fb0c4) }));
_envScn.add(_room);
var _areaLuz = function (cor, w, h, d, x, y, z, ganho) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial()); m.material.color.copy(luzNum(cor)).multiplyScalar(ganho); m.position.set(x, y, z); return m; };
_envScn.add(_areaLuz(0xffffff, 16, 1, 16, 0, 8.5, 0, 3.0));
_envScn.add(_areaLuz(0xdfeaf7, 1, 10, 12, -11.5, 2, -3, 1.6));
_envScn.add(_areaLuz(0xfff0dc, 1, 10, 12, 11.5, 2, 4, 1.3));
_envScn.add(_areaLuz(0xc4d0dd, 16, 1, 16, 0, -8.5, 0, 0.6));
var _envRT = _pmrem.fromScene(_envScn, 0.04);
scene.environment = _envRT.texture; envPadrao3d = _envRT.texture;
_room.geometry.dispose(); _envScn.traverse(function (o) { if (o.material && o.material.dispose) o.material.dispose(); if (o.geometry && o.geometry.dispose) o.geometry.dispose(); });
_pmrem.dispose();
} catch (eEnv) { }
try { dir.shadow.mapSize.set(2048, 2048); dir.shadow.camera.near = 1; dir.shadow.camera.far = 400; dir.shadow.bias = -0.0005; var _ds = dir.shadow.camera; _ds.left = -80; _ds.right = 80; _ds.top = 80; _ds.bottom = -80; _ds.updateProjectionMatrix(); } catch (_) {}
var fill = new THREE.DirectionalLight(luzNum(0xbfd8ee), 0.35); fill.position.set(-40, 25, -30); scene.add(fill);
var grid = new THREE.GridHelper(200, 40, 0x2e6f9e, 0x1c3a58); grid.material.opacity = .5; grid.material.transparent = true; scene.add(grid);
var _chaoTex = (function () {
var c = document.createElement('canvas'); c.width = c.height = 256; var g = c.getContext('2d');
var rg = g.createRadialGradient(128, 128, 8, 128, 128, 126);
rg.addColorStop(0, 'rgba(0,0,0,.42)'); rg.addColorStop(.55, 'rgba(0,0,0,.20)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
var t = texSRGB(new THREE.CanvasTexture(c)); return t;
})();
var _chao = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: _chaoTex, transparent: true, depthWrite: false, opacity: .9 }));
_chao.rotation.x = -Math.PI / 2; _chao.renderOrder = -1; _chao.raycast = function () {}; scene.add(_chao);
var orbit = new OrbitControls(camera, renderer.domElement); orbit.enableDamping = true; orbit.dampingFactor = .08;
var modelRoot = new THREE.Group(); modelRoot.rotation.x = 0; scene.add(modelRoot);
var matAndamento = new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0x7a4a06, transparent: true, opacity: .9, metalness: .05, roughness: .8, side: THREE.DoubleSide });
var selMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, emissive: 0x0a5a2a, metalness: .1, roughness: .7 });
var clashMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0x5a0a0a, metalness: .1, roughness: .6 });
S = { host: host, opts: opts, scene: scene, camera: camera, renderer: renderer, orbit: orbit, modelRoot: modelRoot,
_definirTema: definirTema,
bar: bar, hud: hud, over: over, loading: loading,
api: new IfcAPI(), apiReady: false, modelID: -1, meshPorId: {}, elementos: [],
modelos: [], meshPorUid: {}, ultra: false, _tickExtra: [], _tickPos: [],
fly: { on: false, keys: {}, speed: 14, yaw: 0, pitch: 0 }, selected: null, prevMat: null,
matAndamento: matAndamento, selMat: selMat, clashMat: clashMat, _clashSel: [], matCache: {}, raf: 0, alive: true };
var Sm = S;
S.barToggle = barToggle; S._setBarra = setBarra;
S._fabObserver = fabObs; S._fabEstilo = aplicarEstiloToggle; S._dockRolar = aoRolar;
S._dockDocClick = dockDocClick;
var _szRes = new THREE.Vector2();
function resize() {
try { if (window.BimDocaUI && BimDocaUI.congelado && BimDocaUI.congelado()) return; } catch (_) {}
var alvo = (S && S.host) || host;
var w = alvo.clientWidth, h = alvo.clientHeight;
if (!(w && h)) return;
var cv = cvDesenho(), pr = renderer.getPixelRatio(), sz = renderer.getSize(_szRes);
if (sz.x !== w || sz.y !== h || cv.width !== Math.floor(w * pr) || cv.height !== Math.floor(h * pr)) renderer.setSize(w, h, false);
var c0 = renderer.domElement;
if (c0 !== cv && (c0.width !== cv.width || c0.height !== cv.height)) { c0.width = cv.width; c0.height = cv.height; }
if (camera.aspect !== w / h) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
}
function cvDesenho() { return (S && S._cvVivo) || renderer.domElement; }
S._resize = resize; S._canvasDesenho = cvDesenho; window.addEventListener('resize', resize); resize();
try { if (window.ResizeObserver) { S._ro = new ResizeObserver(function () { if (S && S.alive && !S._principalOculta) resize(); }); S._ro.observe(host); } } catch (_) {}
var canvasEl = renderer.domElement, fly = S.fly, _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
var trava = { on: false, avisoT: 0 };
S.trava = trava;
var travaChip = document.createElement('button');
travaChip.type = 'button'; travaChip.setAttribute('data-bim', 'trava');
travaChip.style.cssText = 'position:absolute;left:10px;top:' + ((opts.topoReservado || 0) + 10) + 'px;z-index:21;display:none;border:0;border-radius:16px;padding:6px 12px;font:600 12px var(--fonte,system-ui),sans-serif;color:#fff;background:var(--aco,#2d6a9c);box-shadow:0 2px 10px rgba(0,0,0,.3);cursor:pointer;touch-action:manipulation';
host.appendChild(travaChip); S.travaChip = travaChip;
travaChip.addEventListener('click', function (e) { e.stopPropagation(); setTrava(false); });
function orbitaPode() { return !trava.on && !fly.on && !(S.lupa && S.lupa.on) && !(S.xr && S.xr.on); }
function pararInercia() {
if (!orbit) return;
var p0 = camera.position.clone(), t0 = orbit.target.clone(), amort = orbit.enableDamping;
orbit.enableDamping = false; orbit.update();
camera.position.copy(p0); orbit.target.copy(t0); orbit.update();
orbit.enableDamping = amort;
}
S._pararInercia = pararInercia;
function setTrava(on) {
trava.on = !!on;
if (trava.on) pararInercia();
if (orbit) orbit.enabled = orbitaPode();
travaChip.innerHTML = (typeof Icones !== 'undefined' ? Icones.get('cadeado', 14) : '') + ' Câmera travada · toque para destravar';
travaChip.style.display = trava.on ? 'block' : 'none';
if (S._ajustarTop) S._ajustarTop();
return trava.on;
}
S._setTrava = setTrava; S._visitante = visitante;
function avisarTrava() {
var agora = performance.now(); if (agora - trava.avisoT < 2500) return; trava.avisoT = agora;
S._hint((typeof Icones !== 'undefined' ? Icones.get('cadeado', 15) : '') + ' Câmera travada: encostar a mão não gira nem dá zoom. Toque em "Câmera travada" para destravar.');
travaChip.animate && travaChip.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 380 });
}
canvasEl.addEventListener('wheel', function () { if (trava.on) avisarTrava(); }, { passive: true });
function arrasteTravado(e) { if (trava.on && e.buttons && !ferramentaClique()) avisarTrava(); }
canvasEl.addEventListener('pointermove', arrasteTravado);
setTimeout(function () { try { if (window.BimMesa && S && S.alive) window.BimMesa.aoMontar(); } catch (_) {} }, 0);
function setMode(voo) {
if (S._cancelTween) S._cancelTween();
fly.on = voo; orbit.enabled = !voo && !trava.on;
bar.querySelector('[data-b="voo"]').classList.toggle('on', voo);
bar.querySelector('[data-b="voo"]').style.background = voo ? corAtiva() : '';
bar.querySelector('[data-b="voo"]').style.color = voo ? '#fff' : '';
bar.querySelector('[data-b="orbita"]').style.background = voo ? '' : corAtiva();
bar.querySelector('[data-b="orbita"]').style.color = voo ? '' : '#fff';
if (!voo && document.pointerLockElement) document.exitPointerLock();
}
S._setMode = setMode;
canvasEl.addEventListener('click', function () { if (fly.on && !document.pointerLockElement) canvasEl.requestPointerLock(); });
S._onKeyDown = function (e) { fly.keys[e.code] = true; if (e.code === 'Escape') { if (S._lupaFechar && S.lupa && S.lupa.on) { S._lupaFechar(); return; } if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) { if (S && S.host && S.host.contains(e.target)) e.target.blur(); return; } if (S.ctecModal && S.ctecModal.style.display === 'flex' && S._fecharCtecModal) { S._fecharCtecModal(); return; } if (S.plantaCfg && S.plantaCfg.style.display !== 'none') { S.plantaCfg.style.display = 'none'; return; }
if (S._fecharPaineis && !(fly.on || (S.medir && S.medir.on) || (S.area && S.area.on) || (S.ang && S.ang.on) || (S.planta && S.planta.on) || (S.corteL && S.corteL.on) || (S.edit && S.edit.on)) && [S.visPanel, S.pavPanel, S.snapPanel, S.xrPanel].some(function (p) { return p && p.style.display === 'flex'; })) { S._fecharPaineis(null); return; } if (S.xr && S.xr.on && S._sairImersivo) { S._sairImersivo(); return; } if (S._ctecCancelar && S._ctecCancelar(true)) return; if (fly.on) setMode(false); if (S.medir && S.medir.on) S._setMedir(false); if (S.area && S.area.on && S._setArea) S._setArea(false); if (S.ang && S.ang.on && S._setAng) S._setAng(false); if (S.planta && S.planta.on) S._setPlanta(false); if (S.corteL && S.corteL.on && S._setCorteL) S._setCorteL(false); if (S.edit && S.edit.on) { if (S.edit.p1 && S._editFimCadeia) { S._editFimCadeia(); return; } if (S._setEdit) S._setEdit(false); } } };
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
function renderFrame(dt) {
if (S._xrWalk) S._xrWalk(dt);
else if (fly.on) flyStep(dt); else orbit.update();
for (var tx = 0; tx < S._tickExtra.length; tx++) { try { S._tickExtra[tx](dt); } catch (_) {} }
if (!S._principalOculta) {
renderer.render(scene, camera);
if (S._cxMain) S._cxMain.desenhar(renderer, camera);
}
if (S._renderVistas) S._renderVistas(dt);
for (var tp = 0; tp < S._tickPos.length; tp++) { try { S._tickPos[tp](dt); } catch (_) {} }
}
var SAUDE = { erros: 0, seguidos: 0, ultErro: '', bom: null, nQ: 0, tCheca: 0, vazioN: 0, dispensado: '', raio: null, raioSig: '', raioT: 0, tentativas: 0, tRec: 0, farAjustes: 0 };
S._saude3d = SAUDE;
function msg3d(e) { return String((e && (e.message || e)) || '').replace(/[^\s@]+@[^\s@]+/g, '<email>').replace(/[A-Za-z0-9_\-]{24,}/g, '<id>').slice(0, 140); }
function diag3d(evento, extra) {
try {
var reg = { tipo: '3d', evento: evento, em: new Date().toISOString(), versao: (window.CONFIG && window.CONFIG.versao) || '' };
if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) reg[k] = extra[k];
(S._diag3d = S._diag3d || []).push(reg); if (S._diag3d.length > 40) S._diag3d.shift();
if (window.MemVigia && MemVigia.enviar) MemVigia.enviar(reg);
} catch (_) {}
}
function v3fin(v) { return !!v && isFinite(v.x) && isFinite(v.y) && isFinite(v.z); }
function cameraSa() {
var q = camera.quaternion;
return v3fin(camera.position) && v3fin(orbit.target) && isFinite(q.x) && isFinite(q.y) && isFinite(q.z) && isFinite(q.w) &&
isFinite(camera.near) && isFinite(camera.far) && camera.near > 0 && camera.far > camera.near &&
isFinite(camera.fov) && camera.fov > 0 && camera.fov < 180 && isFinite(camera.zoom) && camera.zoom > 0 &&
isFinite(camera.aspect) && camera.aspect > 0 && isFinite(fly.yaw) && isFinite(fly.pitch);
}
function guardarCameraBoa() {
var b = SAUDE.bom || (SAUDE.bom = { p: new THREE.Vector3(), q: new THREE.Quaternion(), t: new THREE.Vector3() });
b.p.copy(camera.position); b.q.copy(camera.quaternion); b.t.copy(orbit.target);
b.near = camera.near; b.far = camera.far; b.fov = camera.fov; b.zoom = camera.zoom; b.yaw = fly.yaw; b.pitch = fly.pitch;
}
function sanearCamera(motivo) {
if (S._cancelTween) S._cancelTween();
var amort = orbit.enableDamping; orbit.enableDamping = false; try { orbit.update(); } catch (_) {} orbit.enableDamping = amort;
if (!v3fin(camera.up)) camera.up.set(0, 1, 0);
var b = SAUDE.bom;
if (b) {
camera.position.copy(b.p); camera.quaternion.copy(b.q); orbit.target.copy(b.t);
camera.near = b.near; camera.far = b.far; camera.fov = b.fov; camera.zoom = b.zoom; fly.yaw = b.yaw; fly.pitch = b.pitch;
} else {
camera.position.set(20, 18, 22); orbit.target.set(0, 0, 0); camera.near = 0.1; camera.far = 5000; camera.fov = 60; camera.zoom = 1; fly.yaw = 0; fly.pitch = -0.35;
}
if (!isFinite(camera.aspect) || camera.aspect <= 0) camera.aspect = 1;
camera.updateProjectionMatrix();
if (!b) { try { enquadrar(); } catch (_) {} }
try { orbit.update(); } catch (_) {}
if (!cameraSa()) { camera.position.set(20, 18, 22); orbit.target.set(0, 0, 0); camera.near = 0.1; camera.far = 5000; camera.fov = 60; camera.zoom = 1; fly.yaw = 0; fly.pitch = -0.35; camera.updateProjectionMatrix(); try { orbit.update(); } catch (_) {} }
diag3d('camera-saneada', { motivo: motivo || '', voltou: b ? 'ultima-boa' : 'enquadrar' });
}
function raioCena() {
var n = 0, gs = modelRoot.children; for (var i = 0; i < gs.length; i++) n += (gs[i].children || []).length;
var sig = gs.length + ':' + n, ag = performance.now();
if (SAUDE.raioT && ag - SAUDE.raioT < (SAUDE.raioSig === sig ? 10000 : 1000)) return SAUDE.raio;
SAUDE.raioSig = sig; SAUDE.raioT = ag; SAUDE.raio = null;
if (!n) return null;
var bx = new THREE.Box3().setFromObject(modelRoot);
if (!bx.isEmpty() && v3fin(bx.min) && v3fin(bx.max)) { var sf = bx.getBoundingSphere(new THREE.Sphere()); SAUDE.raio = { c: sf.center, r: Math.max(0.5, sf.radius) }; }
return SAUDE.raio;
}
function ajustarPlanos() {
if ((typeof ortoMain !== 'undefined' && ortoMain && ortoMain.on) || S._xrActive) return;
var rc = raioCena(); if (!rc) return;
var precisa = camera.position.distanceTo(rc.c) + rc.r * 1.25 + 1;
if (!(camera.far < precisa)) return;
camera.far = precisa * 2;
if (camera.near < camera.far / 2e6) camera.near = camera.far / 2e6;
camera.updateProjectionMatrix();
if (SAUDE.farAjustes++ < 3) diag3d('far-ajustado', { far: Math.round(camera.far), raio: Math.round(rc.r) });
}
function conferirTamanho() {
if (S._principalOculta || S._xrActive) return;
var alvo = S.host; if (!alvo) return;
var w = alvo.clientWidth, h = alvo.clientHeight; if (!(w && h)) return;
var cv = cvDesenho(), pr = renderer.getPixelRatio();
if (cv.width === Math.floor(w * pr) && cv.height === Math.floor(h * pr)) return;
diag3d('canvas-redimensionado', { de: cv.width + 'x' + cv.height, para: Math.floor(w * pr) + 'x' + Math.floor(h * pr) });
resize();
}
var aviso3d = document.createElement('div');
aviso3d.className = 'bim-flut';
aviso3d.setAttribute('data-bim', 'aviso-3d'); aviso3d.setAttribute('role', 'status');
aviso3d.style.cssText = 'position:absolute;left:50%;top:64px;transform:translateX(-50%);z-index:6;display:none;max-width:min(460px,92%);box-sizing:border-box;background:var(--card-bg,#fff);color:var(--texto,#15181d);border:1px solid var(--linha-forte,#8697a9);border-radius:var(--raio,10px);padding:12px 14px;font-size:var(--t-base,13px);pointer-events:auto';
host.appendChild(aviso3d);
S.aviso3d = aviso3d;
function escAv(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function mostrarAviso3d(o) {
aviso3d.setAttribute('data-tipo', o.tipo || ''); aviso3d.setAttribute('data-cod', o.cod || '');
var h = '<div style="display:flex;gap:10px;align-items:flex-start"><div style="flex:1;min-width:0"><b style="display:block;margin-bottom:3px">' + escAv(o.titulo) + '</b><span style="color:var(--texto-fraco,#4b5563)">' + escAv(o.texto) + '</span></div>' +
(o.dispensavel ? '<button type="button" class="btn sm ghost" data-av3d="fechar" title="Fechar este aviso" aria-label="Fechar este aviso" style="flex:none">' + ico('fechar') + '</button>' : '') + '</div>';
var bts = o.botoes || [];
if (bts.length) h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:9px">' + bts.map(function (b, i) { return '<button type="button" class="btn sm' + (b.primario ? ' primary' : '') + '" data-av3d="' + i + '">' + escAv(b.rotulo) + '</button>'; }).join('') + '</div>';
aviso3d.innerHTML = h;
aviso3d.onclick = function (e) {
var t = e.target && e.target.closest ? e.target.closest('[data-av3d]') : null; if (!t) return;
var k = t.getAttribute('data-av3d');
if (k === 'fechar') { SAUDE.dispensado = o.cod || o.tipo || ''; aviso3d.style.display = 'none'; return; }
var b = bts[+k]; if (b && b.acao) { try { b.acao(); } catch (eA) { diag3d('aviso-acao-falhou', { msg: msg3d(eA) }); } }
};
aviso3d.style.display = 'block';
}
function esconderAviso3d(tipo) { if (aviso3d.style.display !== 'none' && (!tipo || aviso3d.getAttribute('data-tipo') === tipo)) aviso3d.style.display = 'none'; }
S._aviso3d = function () { return aviso3d.style.display === 'none' ? null : { tipo: aviso3d.getAttribute('data-tipo'), cod: aviso3d.getAttribute('data-cod'), texto: aviso3d.textContent }; };
var _frus3 = new THREE.Frustum(), _mPS3 = new THREE.Matrix4(), _esf3 = new THREE.Sphere();
function oQueSeVe() {
camera.updateMatrixWorld(); _mPS3.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _frus3.setFromProjectionMatrix(_mPS3);
var pls = renderer.clippingPlanes || [], r = { pecas: 0, vis: 0, quadro: 0, cortado: 0, desenha: false }, gs = modelRoot.children;
for (var i = 0; i < gs.length; i++) {
var ms = gs[i].children || []; r.pecas += ms.length;
if (gs[i].visible === false) continue;
for (var j = 0; j < ms.length; j++) {
var m = ms[j]; if (!m.visible) continue;
r.vis++;
if (!m.isMesh || m.isInstancedMesh || m.frustumCulled === false || !m.geometry) { r.desenha = true; return r; }
var gg = m.geometry;
if (!gg.boundingSphere) { try { gg.computeBoundingSphere(); } catch (_) {} }
if (!gg.boundingSphere || !isFinite(gg.boundingSphere.radius)) continue;
_esf3.copy(gg.boundingSphere).applyMatrix4(m.matrixWorld);
if (!_frus3.intersectsSphere(_esf3)) continue;
r.quadro++;
var fora = false; for (var k = 0; k < pls.length; k++) if (pls[k].distanceToPoint(_esf3.center) < -_esf3.radius) { fora = true; break; }
if (fora) { r.cortado++; continue; }
r.desenha = true; return r;
}
}
return r;
}
function motivoVazio(r) {
if (modelRoot.visible === false) return { cod: 'raiz', texto: 'O modelo está escondido nesta vista.', rotulo: 'Mostrar o modelo', acao: function () { modelRoot.visible = true; } };
if (!r.vis) {
var comPecas = S.modelos.filter(function (m) { return m && m.grupo && (m.grupo.children || []).length; });
if (comPecas.length && comPecas.every(function (m) { return m.visivel === false || m.grupo.visible === false; }))
return { cod: 'modelos', texto: 'Todos os modelos estão desligados no painel Modelos.', rotulo: 'Ligar os modelos', acao: function () { comPecas.forEach(function (m) { setVisivel(m.mid, true); }); } };
if (S._fut4d) return { cod: '4d', texto: 'A simulação 4D está numa data em que nada foi construído ainda.', rotulo: 'Sair do 4D', acao: function () { mostrarTudo(); } };
if (typeof pav !== 'undefined' && pav && (pav.isolado || pav.manual)) return { cod: 'pavimento', texto: pav.isolado ? 'O pavimento "' + pav.isolado + '" está isolado e não tem peça visível.' : 'O isolamento da Visibilidade não deixou nenhuma peça visível.', rotulo: 'Mostrar todos os pavimentos', acao: function () { restaurarVisibilidade(); } };
var ocl = 0; try { ocl = (window.BimSelInst && BimSelInst.ocultos) ? BimSelInst.ocultos().length : 0; } catch (_) {}
if (ocl) return { cod: 'ocultos', texto: ocl + (ocl === 1 ? ' peça está oculta' : ' peças estão ocultas') + ' temporariamente (Ocultar/Isolar) e nada sobrou à vista.', rotulo: 'Mostrar todos', acao: function () { if (window.BimSelInst && BimSelInst.mostrarTodos) BimSelInst.mostrarTodos(); else restaurarVisibilidade(); } };
var fl = null; try { fl = (window.BimP10UI && BimP10UI.vista) ? BimP10UI.vista().filtro : null; } catch (_) {}
if (fl && fl !== 'tudo') { var nmF = fl; try { nmF = window.BimFases ? BimFases.filtro(fl).nome : fl; } catch (_) {} return { cod: 'fase', texto: 'O filtro de fase da vista ("' + nmF + '") não mostra nenhuma peça.', rotulo: 'Mostrar todas as fases', acao: function () { BimP10UI.definirVista({ filtro: 'tudo' }); } }; }
return { cod: 'oculto', texto: 'Nenhuma peça está visível: tudo foi ocultado ou isolado.', rotulo: 'Mostrar tudo', acao: function () { recuperarVista3d({ origem: 'aviso' }); } };
}
if (!r.quadro && fly.on) return null;
if (!r.quadro) return { cod: 'fora', texto: 'O modelo está fora do enquadramento da câmera.', rotulo: 'Enquadrar tudo', acao: function () { enquadrar(); } };
if (r.cortado >= r.quadro) {
var qual = (typeof cxMain !== 'undefined' && cxMain && cxMain.on) ? 'A caixa de corte' : ((typeof planta !== 'undefined' && planta && planta.on) ? 'O plano de corte da planta' : 'O corte');
return { cod: 'corte', texto: qual + ' está escondendo o modelo inteiro.', rotulo: 'Desligar o corte', acao: function () { if (S._cxDesligar) S._cxDesligar(); if (planta.on) setPlanta(false); if (corteL.on) setCorteL(false); } };
}
return null;
}
function conferirVazio() {
var calar = S._principalOculta || S._xrActive || S._ctxPerdido || loading.style.display === 'flex' || (typeof cris !== 'undefined' && cris && cris.estado === 'abrindo');
if (calar) { SAUDE.vazioN = 0; return; }
var temPecas = S.modelos.some(function (m) { return m && m.grupo && (m.grupo.children || []).length; });
var mv = temPecas ? motivoVazio(oQueSeVe()) : null;
if (!mv) { SAUDE.vazioN = 0; SAUDE.dispensado = ''; esconderAviso3d('vazio'); return; }
if (++SAUDE.vazioN < 2 || SAUDE.dispensado === mv.cod) return;
if (aviso3d.style.display !== 'none' && aviso3d.getAttribute('data-cod') === mv.cod) return;
if (SAUDE.vazioN === 2) diag3d('vista-vazia', { motivo: mv.cod });
mostrarAviso3d({ tipo: 'vazio', cod: mv.cod, titulo: 'Nada aparece no 3D', texto: mv.texto, dispensavel: true, botoes: [
{ rotulo: mv.rotulo, primario: true, acao: function () { mv.acao(); SAUDE.vazioN = 0; esconderAviso3d('vazio'); } },
{ rotulo: 'Recuperar vista 3D', acao: function () { recuperarVista3d({ origem: 'aviso-vazio' }); } }] });
}
function quadroFalhou(e) {
SAUDE.erros++; SAUDE.seguidos++; SAUDE.ultErro = msg3d(e);
if (SAUDE.erros <= 3 || SAUDE.seguidos === 120) {
try { console.error('[3D] um quadro falhou e o desenho seguiu:', e); } catch (_) {}
diag3d('quadro-falhou', { msg: SAUDE.ultErro, seguidos: SAUDE.seguidos, total: SAUDE.erros });
}
if (SAUDE.seguidos === 20 && !cameraSa()) sanearCamera('quadro-falhou');
if (SAUDE.seguidos === 60) mostrarAviso3d({ tipo: 'erro', cod: 'erro', titulo: 'O 3D não está conseguindo desenhar', texto: 'Um erro se repete a cada quadro: ' + SAUDE.ultErro + '. O modelo e a edição continuam salvos.', botoes: [
{ rotulo: 'Recuperar vista 3D', primario: true, acao: function () { recuperarVista3d({ origem: 'aviso-erro' }); } }] });
}
function tick() {
if (!S || S !== Sm || !S.alive) return;
if (S._xrActive) { S.raf = 0; return; }
S.raf = requestAnimationFrame(tick);
var dt = Math.min(clock.getDelta(), 0.1);
if (S._ctxPerdido) return;
try {
if (!cameraSa()) sanearCamera('nan');
ajustarPlanos();
renderFrame(dt);
if (SAUDE.seguidos) { SAUDE.seguidos = 0; esconderAviso3d('erro'); }
SAUDE.nQ++; if (cameraSa()) guardarCameraBoa();
var cpE = camera.matrixWorld.elements, cpU = S._camUlt || (S._camUlt = new Float64Array(16)), cpM = false;
for (var cpI = 0; cpI < 16; cpI++) if (cpU[cpI] !== cpE[cpI]) { cpM = true; cpU[cpI] = cpE[cpI]; }
if (cpM) S._camMudouEm = performance.now();
} catch (e) { quadroFalhou(e); }
SAUDE.tCheca += dt;
if (SAUDE.tCheca >= 1.5) { SAUDE.tCheca = 0; try { conferirTamanho(); conferirVazio(); } catch (_) {} }
}
S._renderFrame = renderFrame;
S._retomarTick = function () { if (S && S === Sm && S.alive && !S._xrActive) { if (S.raf) { try { cancelAnimationFrame(S.raf); } catch (_) {} } S.raf = 0; tick(); } };
var ESPERAS_REC = [0, 1500, 3000, 6000, 12000, 20000];
function aoPerderContexto3d(e) {
try { e.preventDefault(); } catch (_) {}
if (!S || S !== Sm) return;
if (e && e.target && e.target !== cvDesenho()) return;
S._ctxPerdido = true; S._ctxPerdas = (S._ctxPerdas || 0) + 1; SAUDE.tentativas = 0;
diag3d('contexto-perdido', { perdas: S._ctxPerdas, modelos: S.modelos.length, canvas: document.getElementsByTagName('canvas').length });
mostrarAviso3d({ tipo: 'contexto', cod: 'contexto', titulo: 'Recuperando o 3D…', texto: 'A placa de vídeo descartou o desenho desta vista. O modelo e a edição continuam aqui; o 3D volta em instantes.' });
clearTimeout(SAUDE.tRec);
SAUDE.tRec = setTimeout(function () { recriarRenderer('perda'); }, 900);
}
function aoVoltarContexto3d(e) {
if (!S || S !== Sm) return;
if (e && e.target && e.target !== cvDesenho()) {
try { var g0 = e.target.getContext('webgl2') || e.target.getContext('webgl'), x0 = g0 && g0.getExtension('WEBGL_lose_context'); if (x0) x0.loseContext(); } catch (_) {}
return;
}
if (!S._ctxPerdido) return;
clearTimeout(SAUDE.tRec);
refazerAmbiente();
fimRecuperacao('o navegador devolveu');
}
function refazerAmbiente() {
try {
var nv = envPara(renderer); if (!nv) return;
var velho = envPadrao3d; envPadrao3d = nv;
(S._envAntigos = S._envAntigos || []).push(velho);
if (scene.environment === velho) scene.environment = nv;
} catch (_) {}
}
function fimRecuperacao(como) {
S._ctxPerdido = false; esconderAviso3d('contexto');
try { resize(); } catch (_) {}
if (S._retomarTick) S._retomarTick();
diag3d('contexto-recuperado', { como: como, tentativas: SAUDE.tentativas });
try { if (window.UI && UI.toast) UI.toast('O 3D voltou. A placa de vídeo tinha descartado o desenho; o modelo e a edição ficaram como estavam.', 'ok', 6000); } catch (_) {}
}
function recriarRenderer(origem) {
if (!S || S !== Sm || !S.alive) return false;
clearTimeout(SAUDE.tRec);
try { if (S.xr && S.xr.on && S._sairImersivo) S._sairImersivo(); } catch (_) {}
var velho = renderer, cvVelho = cvDesenho(), base = renderer.domElement;
var cv = document.createElement('canvas');
cv.setAttribute('data-bim-desenho', '1');
cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block;outline:none;pointer-events:none';
var novo = null;
try { novo = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: 'high-performance' }); } catch (eN) { novo = null; }
if (!novo || !novo.getContext() || novo.getContext().isContextLost()) {
try { if (novo) { novo.dispose(); novo.forceContextLoss(); } } catch (_) {}
SAUDE.tentativas++;
diag3d('contexto-recriar-falhou', { tentativa: SAUDE.tentativas, origem: origem });
if (SAUDE.tentativas < ESPERAS_REC.length) { SAUDE.tRec = setTimeout(function () { recriarRenderer('nova-tentativa'); }, ESPERAS_REC[SAUDE.tentativas]); return false; }
mostrarAviso3d({ tipo: 'contexto', cod: 'contexto-falhou', titulo: 'O 3D não conseguiu voltar', texto: 'A placa de vídeo recusou um desenho novo (' + SAUDE.tentativas + ' tentativas). O modelo e a edição estão salvos. Feche outras abas com 3D e tente de novo, ou recarregue a página.', botoes: [
{ rotulo: 'Tentar de novo', primario: true, acao: function () { SAUDE.tentativas = 0; recriarRenderer('botao'); } },
{ rotulo: 'Recarregar a página', acao: function () { try { if (window.Gestao && Gestao._bimEdFlush) Gestao._bimEdFlush(); } catch (_) {} setTimeout(function () { try { location.reload(); } catch (_) {} }, 300); } }] });
return false;
}
prepararRenderer(novo, velho);
novo.domElement = base;
cv.addEventListener('webglcontextlost', function (ev) { aoPerderContexto3d(ev); }, false);
cv.addEventListener('webglcontextrestored', function (ev) { aoVoltarContexto3d(ev); }, false);
if (cvVelho !== base && cvVelho.parentNode) cvVelho.parentNode.removeChild(cvVelho);
if (base.parentNode) base.parentNode.insertBefore(cv, base.nextSibling); else if (S.host) S.host.appendChild(cv);
try { velho.dispose(); } catch (_) {}
if (cvVelho !== base) { try { velho.forceContextLoss(); } catch (_) {} }
renderer = novo; S.renderer = novo; S._cvVivo = cv;
refazerAmbiente();
fimRecuperacao(origem === 'manual' ? 'renderer novo (comando)' : 'renderer novo');
return true;
}
S._recriarRenderer = recriarRenderer;
S._sanearCamera = sanearCamera;
function recuperarVista3d(o) {
o = o || {};
var feito = [];
if (!S || S !== Sm || !S.alive) return { ok: false, feito: feito };
try { if (S.xr && S.xr.on && S._sairImersivo) { S._sairImersivo(); feito.push('imersivo'); } } catch (_) {}
try { if (fly.on) { setMode(false); feito.push('voo'); } } catch (_) {}
try {
if (planta.on) feito.push('planta'); if (corteL.on) feito.push('corte');
if (medir.on || area.on || ang.on || cota.on) feito.push('ferramenta de medida');
sairFerramentas();
} catch (_) {}
try { if (cxMain.on && S._cxDesligar) { S._cxDesligar(); feito.push('caixa de corte'); } } catch (_) {}
try {
var ocl = (window.BimSelInst && BimSelInst.ocultos) ? BimSelInst.ocultos().length : 0;
if (pav.isolado || pav.manual || ocl) feito.push('isolar/ocultar temporário');
if (window.BimSelInst && BimSelInst.mostrarTodos && ocl) BimSelInst.mostrarTodos(); else restaurarVisibilidade();
} catch (_) {}
try { if (S._fut4d) { mostrarTudo(); feito.push('simulação 4D'); } } catch (_) {}
try {
var comPecas = S.modelos.filter(function (m) { return m && m.grupo && (m.grupo.children || []).length; });
if (comPecas.length && comPecas.every(function (m) { return m.visivel === false || m.grupo.visible === false; })) { comPecas.forEach(function (m) { setVisivel(m.mid, true); }); feito.push('modelos religados'); }
} catch (_) {}
if (modelRoot.visible === false) { modelRoot.visible = true; feito.push('modelo escondido'); }
try { var rr = oQueSeVe(), fl = (window.BimP10UI && BimP10UI.vista) ? BimP10UI.vista().filtro : null; if (!rr.vis && fl && fl !== 'tudo') { BimP10UI.definirVista({ filtro: 'tudo' }); feito.push('filtro de fase'); } } catch (_) {}
if (!cameraSa()) { sanearCamera('recuperar'); feito.push('câmera inválida'); }
try { if (S._cancelTween) S._cancelTween(); enquadrar(); } catch (_) {}
var perdido = !!S._ctxPerdido; try { perdido = perdido || renderer.getContext().isContextLost(); } catch (_) {}
if (perdido) { if (recriarRenderer('manual')) feito.push('3D recriado'); }
try { resize(); } catch (_) {}
if (S._retomarTick) S._retomarTick();
SAUDE.vazioN = 0; SAUDE.dispensado = ''; esconderAviso3d('vazio'); esconderAviso3d('erro');
diag3d('recuperar-vista', { feito: feito.join(', '), origem: o.origem || '' });
return { ok: true, feito: feito };
}
S._recuperarVista = recuperarVista3d;
tick();
var ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
function cadeiaVisivel(o) { for (var n = o; n; n = n.parent) { if (n.visible === false) return false; if (n === modelRoot) break; } return true; }
function visivelParaRaio(o) {
if (cadeiaVisivel(o)) return true;
if (!o || !o.userData || o.userData._alvOculta !== true) return false;
for (var n = o.parent; n; n = n.parent) { if (n.visible === false) return false; if (n === modelRoot) break; }
return true;
}
function foraDoClip(p) {
var pls = renderer.clippingPlanes || [];
for (var i = 0; i < pls.length; i++) if (pls[i].distanceToPoint(p) < -1e-6) return true;
return false;
}
function primeiroHit(hits) {
for (var i = 0; i < hits.length; i++) {
if (!visivelParaRaio(hits[i].object)) continue;
if (foraDoClip(hits[i].point)) continue;
return hits[i];
}
return null;
}
canvasEl.addEventListener('dblclick', function (e) {
if (!S || !S.alive) return;
if (fly.on) return;
if (S.edit && S.edit.on && S.edit.sub) return;
if (ctec.ativo) return;
if (S.medir && S.medir.on) return;
if (area.on) { if (area.pts.length >= 3) fecharArea(); return; }
if (ang.on) return;
if (S._aoClicarPeca) return;
if (S._aoMarcarPonto) return;
try { if (window.MetalComponenteUI && MetalComponenteUI.duplo && S._uidEm) { var uD = S._uidEm(e.clientX, e.clientY); if (uD && /^edit:/.test(uD) && MetalComponenteUI.duplo(uD)) return; } } catch (_) {}
var vazioD = false; try { vazioD = !visitante && !raycastEm(e.clientX, e.clientY); } catch (_) {}
selecionarEm(e.clientX, e.clientY);
if (vazioD && S._fit) S._fit();
});
function selecionarEm(cx, cy) {
if (S._limparRaioX) S._limparRaioX();
var r = canvasEl.getBoundingClientRect();
mouse.x = ((cx - r.left) / r.width) * 2 - 1; mouse.y = -((cy - r.top) / r.height) * 2 + 1;
ray.setFromCamera(mouse, camera);
var hit = primeiroHit(ray.intersectObjects(modelRoot.children, true));
if (S.selected) { S.selected.material = S.prevMat; S.selected = null; }
if (hit && hit.object.userData && hit.object.userData.expressID != null) {
S.selected = hit.object; S.prevMat = S.selected.material; S.selected.material = selMat;
contornoSelecao(hit.object);
if (!fly.on && !xr.on && !planta.on && !corteL.on && !visitante && !trava.on) enquadrarObj(new THREE.Box3().setFromObject(hit.object), 2.6);
if (opts.onPick) opts.onPick(propsDe(hit.object.userData.mid != null ? hit.object.userData.mid : S.modelID, hit.object.userData.expressID, hit.object.userData.tipo));
} else if (opts.onPick) { contornoSelecao(null); opts.onPick(null); }
try { if (window.BimSelecao && BimSelecao.mudou) BimSelecao.mudou(); } catch (_) {}
}
S._selecionarEm = selecionarEm;
var _cvT = null;
function cancelTween() { _cvT = null; }
S._cancelTween = cancelTween;
function voarCam(destPos, destTgt, dur) {
if (!destPos) return;
if (!(isFinite(destPos.x) && isFinite(destPos.y) && isFinite(destPos.z)) || (destTgt && !(isFinite(destTgt.x) && isFinite(destTgt.y) && isFinite(destTgt.z)))) return;
_cvT = { p0: camera.position.clone(), p1: destPos.clone(), t0: orbit.target.clone(), t1: (destTgt || orbit.target).clone(), dur: Math.max(0.15, dur || 0.6), e: 0 };
}
S._tickExtra.push(function (dt) {
if (!_cvT) return;
_cvT.e += dt; var k = Math.min(1, _cvT.e / _cvT.dur);
var s = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
camera.position.lerpVectors(_cvT.p0, _cvT.p1, s);
orbit.target.lerpVectors(_cvT.t0, _cvT.t1, s);
if (k >= 1) _cvT = null;
});
function enquadrarObj(box, fator) {
if (!box || box.isEmpty()) return;
if (!(isFinite(box.min.x) && isFinite(box.min.y) && isFinite(box.min.z) && isFinite(box.max.x) && isFinite(box.max.y) && isFinite(box.max.z))) return;
if (S._sanearCamera && !(isFinite(camera.position.x) && isFinite(camera.position.y) && isFinite(camera.position.z) && isFinite(orbit.target.x) && isFinite(orbit.target.y) && isFinite(orbit.target.z))) S._sanearCamera('enquadrar');
var c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
var raio = Math.max(sz.x, sz.y, sz.z, 0.5) * 0.5;
var dist = (raio / Math.tan((camera.fov * Math.PI / 180) / 2)) * (fator || 1.6);
var dir = camera.position.clone().sub(orbit.target); if (!(dir.lengthSq() >= 1e-6)) dir.set(0.7, 0.55, 0.8); dir.normalize();
var near = Math.max(0.01, (dist - raio) * 0.5); if (near < camera.near) { camera.near = near; camera.updateProjectionMatrix(); }
var precisaFar = dist + raio * 4; if (camera.far < precisaFar) { camera.far = precisaFar; camera.updateProjectionMatrix(); }
voarCam(c.clone().add(dir.multiplyScalar(dist)), c, 0.55);
}
S._enquadrarObj = enquadrarObj; S._voarCam = voarCam;
var _selLn = null, _selLnMat = null;
function contornoSelecao(mesh) {
if (_selLn) { scene.remove(_selLn); if (_selLn.geometry) _selLn.geometry.dispose(); _selLn = null; }
if (!mesh || !mesh.geometry) return;
if (mesh.geometry.attributes && mesh.geometry.attributes.position && mesh.geometry.attributes.position.count > 60000) return;
var arr = arestasDe(mesh.geometry); if (!arr.length) return;
if (!_selLnMat) _selLnMat = new THREE.LineBasicMaterial({ color: 0x2effa0, depthTest: false, transparent: true, opacity: 0.95 });
var bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
var ln = new THREE.LineSegments(bg, _selLnMat);
ln.matrixAutoUpdate = false; ln.matrix.copy(mesh.matrixWorld); ln.renderOrder = 1000; ln.raycast = function () {};
scene.add(ln); _selLn = ln;
}
S._contornoSelecao = contornoSelecao;
var _telPeca = null, _telPecaMat = null;
S._telPecaRealce = function (pos) {
if (_telPeca) { scene.remove(_telPeca); if (_telPeca.geometry) _telPeca.geometry.dispose(); _telPeca = null; }
if (!pos || !pos.length) return false;
if (!_telPecaMat) _telPecaMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, depthTest: false, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
var m = new THREE.Mesh(g, _telPecaMat); m.renderOrder = 1001; m.raycast = function () {};
scene.add(m); _telPeca = m; return true;
};
var _V3 = function (x, y, z) { return new THREE.Vector3(x, y, z); };
var VC_FACES = {
frontal: { rot: 'FRONTAL', n: _V3(0, 0, 1), u: _V3(1, 0, 0), v: _V3(0, 1, 0) },
direita: { rot: 'DIREITA', n: _V3(1, 0, 0), u: _V3(0, 0, -1), v: _V3(0, 1, 0) },
posterior: { rot: 'POSTERIOR', n: _V3(0, 0, -1), u: _V3(-1, 0, 0), v: _V3(0, 1, 0) },
esquerda: { rot: 'ESQUERDA', n: _V3(-1, 0, 0), u: _V3(0, 0, 1), v: _V3(0, 1, 0) },
superior: { rot: 'SUPERIOR', n: _V3(0, 1, 0), u: _V3(1, 0, 0), v: _V3(0, 0, -1) },
inferior: { rot: 'INFERIOR', n: _V3(0, -1, 0), u: _V3(1, 0, 0), v: _V3(0, 0, 1) }
};
function vcCss(w) { return [w.x, -w.y, w.z]; }
function vcMatFace(f, meio) {
var X = vcCss(f.u), Y = vcCss(f.v.clone().negate()), Z = vcCss(f.n), T = vcCss(f.n.clone().multiplyScalar(meio));
return 'matrix3d(' + [X[0], X[1], X[2], 0, Y[0], Y[1], Y[2], 0, Z[0], Z[1], Z[2], 0, T[0], T[1], T[2], 1].join(',') + ')';
}
function cristalLigado() {
var on = false;
try { on = !!(typeof window !== 'undefined' && window.CONFIG && window.CONFIG.bimRecursos && window.CONFIG.bimRecursos.cristal === true); } catch (_) {}
try { var raw = localStorage.getItem('orcapro:tela:bim-cristal:v1'); if (raw) { var o = JSON.parse(raw); if (o && typeof o.cristal === 'boolean') on = o.cristal; } } catch (_) {}
return on;
}
function vcMatPlano(u, v, n, d) {
var X = vcCss(u), Y = vcCss(v.clone().negate()), Z = vcCss(n), T = vcCss(n.clone().multiplyScalar(d));
return 'matrix3d(' + [X[0], X[1], X[2], 0, Y[0], Y[1], Y[2], 0, Z[0], Z[1], Z[2], 0, T[0], T[1], T[2], 1].join(',') + ')';
}
function vcEstilo() {
if (document.getElementById('bim-vcube-estilo')) return;
var st = document.createElement('style'); st.id = 'bim-vcube-estilo';
st.textContent =
'.bim-vcube{position:absolute;top:10px;right:12px;width:104px;height:112px;z-index:5;user-select:none;font-family:"Segoe UI",system-ui,sans-serif}' +
'.bim-vcube-casa{position:absolute;left:0;top:0;width:20px;height:20px;padding:0;border:0;background:transparent;color:#5b6573;cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:.8}' +
'.bim-vcube-casa:hover{opacity:1;color:#1a6cb5}' +
'.bim-vcube-cena{position:absolute;left:17px;top:14px;width:70px;height:70px}' +
'.bim-vcube-cubo{position:absolute;left:35px;top:35px;width:0;height:0;transform-style:preserve-3d}' +
'.bim-vcube-face{position:absolute;left:-35px;top:-35px;width:70px;height:70px;box-sizing:border-box;border:1px solid #9aa5b1;background:rgba(236,240,244,.94);display:grid;grid-template-columns:22% 56% 22%;grid-template-rows:22% 56% 22%;backface-visibility:hidden}' +
'.bim-vcube-face>span{display:block}' +
'.bim-vcube-face>span:hover{background:rgba(26,108,181,.35)}' +
'.bim-vcube-face>b{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;letter-spacing:.2px;color:#44505c;pointer-events:none}' +
'.bim-vcube-anel{position:absolute;left:4px;top:60px;width:96px;height:44px;border-radius:50%;border:5px solid rgba(160,170,182,.55);box-sizing:border-box;pointer-events:none}' +
'.bim-vcube.cristal{width:96px;height:104px}' +
'.bim-vcube.cristal .bim-vcube-cena{left:18px;top:16px;width:60px;height:60px}' +
'.bim-vcube.cristal .bim-vcube-cubo{left:30px;top:30px}' +
'.bim-vcube.cristal .bim-vcube-face{left:-30px;top:-30px;width:60px;height:60px;border:1px solid rgba(120,255,180,.6);background:rgba(28,112,72,.66);box-shadow:inset 0 0 12px rgba(90,255,170,.22)}' +
'.bim-vcube.cristal.com-cristal .bim-vcube-face{background:rgba(40,170,100,.10)}' +
'.bim-vcube.cristal .bim-vcube-face>span:hover{background:rgba(60,207,115,.42);box-shadow:0 0 8px rgba(110,255,170,.6)}' +
'.bim-vcube.cristal .bim-vcube-face>b{font-size:8.5px;font-weight:700;letter-spacing:.5px;color:#f0fff6;text-shadow:0 0 4px #3ccf73,0 0 2px #0b2a18,0 0 1px #000}' +
'.bim-vcube.cristal .bim-vcube-anel{display:none}' +
'.bim-vcube-bussola{position:absolute;left:-66px;top:-66px;width:132px;height:132px;pointer-events:none}' +
'.bim-vcube-ctl{position:absolute;inset:0;opacity:0;pointer-events:none;transition:opacity .15s}' +
'.bim-vcube:hover .bim-vcube-ctl,.bim-vcube.sobre .bim-vcube-ctl,.bim-vcube.toque .bim-vcube-ctl{opacity:1}' +
'.bim-vcube:hover .bim-vcube-ctl>*,.bim-vcube.sobre .bim-vcube-ctl>*,.bim-vcube.toque .bim-vcube-ctl>*{pointer-events:auto}' +
'.bim-vcube-ctl button{position:absolute;width:20px;height:20px;padding:0;border:0;border-radius:6px;background:rgba(15,39,64,.72);color:#bfffd6;cursor:pointer;display:flex;align-items:center;justify-content:center}' +
'.bim-vcube-ctl button:hover{background:#1f9d55;color:#fff}' +
'.bim-vcube-ctl select{position:absolute;left:0;top:83px;width:36px;height:18px;font-size:10px;border-radius:5px;border:1px solid #2e6f9e;background:rgba(15,39,64,.85);color:#dbe8f5;padding:0 2px}' +
'.bim-vcube-angulo{position:absolute;right:100px;top:0;display:none;pointer-events:auto;background:rgba(15,39,64,.95);border:1px solid #2e6f9e;border-radius:8px;padding:6px 8px;color:#dbe8f5;font-size:11px;white-space:nowrap;z-index:6}' +
'.bim-vcube-angulo.aberto{display:block}' +
'.bim-vcube-angulo input{width:44px;font-size:11px;margin:0 4px 0 2px;background:#0f2740;color:#fff;border:1px solid #2e6f9e;border-radius:4px}' +
'.bim-vcube-menu{position:fixed;z-index:80;min-width:230px;background:#fff;color:#1a1a1a;border:1px solid #b4b4b4;box-shadow:0 6px 18px rgba(0,0,0,.22);padding:4px 0;font:12px "Segoe UI",system-ui,sans-serif}' +
'.bim-vcube-menu div{padding:5px 14px 5px 26px;cursor:pointer;white-space:nowrap;position:relative}' +
'.bim-vcube-menu div:hover{background:#d8e6f2}' +
'.bim-vcube-menu div[data-marca]:before{content:"\\2713";position:absolute;left:9px}' +
'.bim-vcube-menu hr{border:0;border-top:1px solid #d4d4d4;margin:4px 0}' +
'.bim-vcube-menu .sub{padding-left:40px}';
document.head.appendChild(st);
}
function criarViewCube(cont, ctx) {
vcEstilo();
var cristal = !!(ctx && ctx.cristal);
var w = document.createElement('div'); w.className = 'bim-vcube' + (cristal ? ' cristal' : '');
w.innerHTML = '<button type="button" class="bim-vcube-casa" title="Ir para o início (Início)">' +
'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg></button>' +
'<div class="bim-vcube-anel"></div><div class="bim-vcube-cena"><div class="bim-vcube-cubo"></div></div>';
var cubo = w.querySelector('.bim-vcube-cubo');
Object.keys(VC_FACES).forEach(function (k) {
var f = VC_FACES[k], fe = document.createElement('div');
fe.className = 'bim-vcube-face'; fe.setAttribute('data-face', k); fe.style.transform = vcMatFace(f, cristal ? 30 : 35);
[1, 0, -1].forEach(function (j) { [-1, 0, 1].forEach(function (i) { var z = document.createElement('span'); z.setAttribute('data-i', i); z.setAttribute('data-j', j); fe.appendChild(z); }); });
var b = document.createElement('b'); b.textContent = f.rot; fe.appendChild(b);
cubo.appendChild(fe);
});
if (cristal) {
var bus = document.createElement('div'); bus.className = 'bim-vcube-bussola';
var marcas = '';
for (var gm = 0; gm < 360; gm += 15) { var ra = gm * Math.PI / 180, r1 = gm % 45 === 0 ? 40 : 43; marcas += '<line x1="' + (66 + Math.sin(ra) * r1).toFixed(1) + '" y1="' + (66 - Math.cos(ra) * r1).toFixed(1) + '" x2="' + (66 + Math.sin(ra) * 47).toFixed(1) + '" y2="' + (66 - Math.cos(ra) * 47).toFixed(1) + '"/>'; }
var BUS_EST = { bn: 'font-size="15" font-weight="800" fill="#3ccf73"', bp: 'font-size="12" font-weight="700" fill="#f2fff7"', bd: 'font-size="8" font-weight="700" fill="#cdf5dc"' };
function rotBus(t, gr, rr, cls) { var a = gr * Math.PI / 180; return '<text x="' + (66 + Math.sin(a) * rr).toFixed(1) + '" y="' + (66 - Math.cos(a) * rr + 4.5).toFixed(1) + '" text-anchor="middle" font-family="Segoe UI,sans-serif" stroke="#0b2a18" stroke-width=".6" paint-order="stroke" ' + BUS_EST[cls] + ' data-rosa="' + t + '">' + t + '</text>'; }
bus.innerHTML = '<svg viewBox="0 0 132 132" width="132" height="132"><circle cx="66" cy="66" r="45" fill="none" stroke="rgba(150,255,195,.7)" stroke-width="3"/>' +
'<g stroke="rgba(190,255,215,.7)" stroke-width="1">' + marcas + '</g>' +
rotBus('N', 0, 56, 'bn') + rotBus('L', 90, 56, 'bp') + rotBus('S', 180, 56, 'bp') + rotBus('O', 270, 56, 'bp') +
rotBus('NE', 45, 55, 'bd') + rotBus('SE', 135, 55, 'bd') + rotBus('SO', 225, 55, 'bd') + rotBus('NO', 315, 55, 'bd') + '</svg>';
bus.style.transform = vcMatPlano(_V3(1, 0, 0), _V3(0, 0, -1), _V3(0, 1, 0), -30);
cubo.appendChild(bus);
var seta = function (d) { return '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6"><path d="' + d + '"/></svg>'; };
var ctl = document.createElement('div'); ctl.className = 'bim-vcube-ctl';
ctl.innerHTML = '<button type="button" data-vc="cima" title="Girar para cima" style="left:38px;top:0">' + seta('M6 15l6-6 6 6') + '</button>' +
'<button type="button" data-vc="baixo" title="Girar para baixo" style="left:38px;top:82px">' + seta('M6 9l6 6 6-6') + '</button>' +
'<button type="button" data-vc="esquerda" title="Girar para a esquerda" style="left:0;top:36px">' + seta('M15 6l-6 6 6 6') + '</button>' +
'<button type="button" data-vc="direita" title="Girar para a direita" style="left:76px;top:36px">' + seta('M9 6l6 6-6 6') + '</button>' +
'<button type="button" data-vc="angulo" title="Ângulo exato (azimute e elevação)" style="left:76px;top:82px">' + seta('M4 20h16M4 20L16 6') + '</button>' +
'<button type="button" data-vc="menu" title="Menu da vista" style="left:76px;top:0">' + seta('M5 7h14M5 12h14M5 17h14') + '</button>' +
'<select data-vc="passo" title="Passo do giro">' + [15, 30, 45, 90].map(function (g) { return '<option value="' + g + '"' + (g === 45 ? ' selected' : '') + '>' + g + '°</option>'; }).join('') + '</select>' +
'<div class="bim-vcube-angulo">azimute<input type="text" inputmode="decimal" data-vc="az" value="0">elevação<input type="text" inputmode="decimal" data-vc="el" value="30"><button type="button" data-vc="ir" style="position:static;display:inline-flex;width:auto;padding:0 6px">Ir</button></div>';
w.appendChild(ctl);
function vcBA() { return (typeof window !== 'undefined') ? window.BimAbertura : null; }
function vcIrAngulo(az, el) {
var BAv = vcBA(); if (!BAv) return;
var cam = ctx.cam(), orb = ctx.orbit(), dist = cam.position.distanceTo(orb.target);
var p = BAv.posicaoDaCamera(orb.target, dist, az, Math.max(-89, Math.min(89, el)));
ctx.voar(new THREE.Vector3(p.x, p.y, p.z), orb.target.clone());
}
function vcAngAtual() { var BAv = vcBA(), cam = ctx.cam(), orb = ctx.orbit(); if (!BAv) return null; var d = orb.target.clone().sub(cam.position); return BAv.anguloDaCamera(d.x, d.y, d.z); }
ctl.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
ctl.addEventListener('click', function (e) {
var b = e.target && e.target.closest ? e.target.closest('[data-vc]') : null; if (!b) return;
e.stopPropagation();
var acao = b.getAttribute('data-vc'), BAv = vcBA();
if (acao === 'menu') { var rcm = b.getBoundingClientRect(); abrirMenuCubo(rcm.left, rcm.bottom, ctx); return; }
if (acao === 'angulo') { var pa = ctl.querySelector('.bim-vcube-angulo'), at = vcAngAtual(); if (at) { ctl.querySelector('[data-vc="az"]').value = Math.round(at.az); ctl.querySelector('[data-vc="el"]').value = Math.round(at.el); } pa.classList.toggle('aberto'); return; }
if (acao === 'ir') { vcIrAngulo(+String(ctl.querySelector('[data-vc="az"]').value).replace(',', '.') || 0, +String(ctl.querySelector('[data-vc="el"]').value).replace(',', '.') || 0); return; }
if (!BAv || ['cima', 'baixo', 'esquerda', 'direita'].indexOf(acao) < 0) return;
var a0 = vcAngAtual(), n = BAv.girar(a0.az, a0.el, acao, +ctl.querySelector('[data-vc="passo"]').value || 45);
vcIrAngulo(n.az, n.el);
});
w.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') w.classList.add('sobre'); });
w.addEventListener('pointerleave', function () { w.classList.remove('sobre'); });
w.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'touch') return; w.classList.add('toque'); clearTimeout(w._toqueT); w._toqueT = setTimeout(function () { w.classList.remove('toque'); }, 3000); }, true);
}
cont.appendChild(w);
var arrastou = false, p0 = null, zonaDown = null;
w.querySelector('.bim-vcube-casa').onclick = function (e) { e.stopPropagation(); ctx.home(); };
cubo.addEventListener('pointerdown', function (e) { if (e.button !== 0) return; p0 = { x: e.clientX, y: e.clientY }; arrastou = false; zonaDown = e.target && e.target.closest ? e.target.closest('.bim-vcube-face > span') : null; try { cubo.setPointerCapture(e.pointerId); } catch (_) {} e.stopPropagation(); });
cubo.addEventListener('pointermove', function (e) {
if (!p0) return;
var dx = e.clientX - p0.x, dy = e.clientY - p0.y;
if (!arrastou && Math.abs(dx) + Math.abs(dy) < 4) return;
arrastou = true; p0 = { x: e.clientX, y: e.clientY };
var cam = ctx.cam(), orb = ctx.orbit(), off = cam.position.clone().sub(orb.target);
var sph = new THREE.Spherical().setFromVector3(off);
sph.theta -= dx * 0.012; sph.phi = Math.max(0.02, Math.min(Math.PI - 0.02, sph.phi - dy * 0.012));
off.setFromSpherical(sph); cam.position.copy(orb.target).add(off); cam.lookAt(orb.target);
});
cubo.addEventListener('pointerup', function (e) {
var eraClique = p0 && !arrastou; p0 = null;
if (!eraClique) return;
var z = zonaDown; zonaDown = null; if (!z) return;
var f = VC_FACES[z.parentNode.getAttribute('data-face')], i = +z.getAttribute('data-i'), j = +z.getAttribute('data-j');
orientarPara(ctx, f.n.clone().add(f.u.clone().multiplyScalar(i)).add(f.v.clone().multiplyScalar(j)));
});
w.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); abrirMenuCubo(e.clientX, e.clientY, ctx); });
var ultimo = '';
return {
el: w,
atualizar: function () {
var cam = ctx.cam(); if (!cam) return;
cam.updateMatrixWorld();
var e = cam.matrixWorldInverse.elements;
var m = [e[0], -e[1], e[2], 0, -e[4], e[5], -e[6], 0, e[8], -e[9], e[10], 0, 0, 0, 0, 1];
var s = 'matrix3d(' + m.map(function (x) { return Math.abs(x) < 1e-7 ? 0 : +x.toFixed(6); }).join(',') + ')';
if (s !== ultimo) { cubo.style.transform = s; ultimo = s; }
},
remover: function () { if (w.parentNode) w.parentNode.removeChild(w); }
};
}
function orientarPara(ctx, dir) {
var cam = ctx.cam(), orb = ctx.orbit();
dir = dir.clone(); if (dir.lengthSq() < 1e-9) return; dir.normalize();
if (Math.abs(dir.y) > 0.999) dir.z += 0.0015 * (dir.y > 0 ? 1 : -1);
var d = cam.position.distanceTo(orb.target);
ctx.voar(orb.target.clone().add(dir.normalize().multiplyScalar(d)), orb.target.clone());
}
var _menuCubo = null;
function fecharMenuCubo() { if (_menuCubo && _menuCubo.parentNode) _menuCubo.parentNode.removeChild(_menuCubo); _menuCubo = null; }
function abrirMenuCubo(x, y, ctx) {
fecharMenuCubo();
var orto = !!ctx.orto(), m = document.createElement('div'); m.className = 'bim-vcube-menu';
var itens = [['inicio', 'Ir para o início'], ['salvar', 'Salvar vista'], null, ['persp', 'Perspectiva', !orto], ['orto', 'Ortogonal', orto], null,
['definir-inicio', 'Definir vista atual como a principal'], ['reinicio', 'Reinicializar o início'], null,
['o-frontal', 'Orientar: Frontal', false, 1], ['o-posterior', 'Orientar: Posterior', false, 1], ['o-esquerda', 'Orientar: Esquerda', false, 1], ['o-direita', 'Orientar: Direita', false, 1],
['o-superior', 'Orientar: Superior', false, 1], ['o-inferior', 'Orientar: Inferior', false, 1], ['o-iso', 'Orientar: Isométrica', false, 1], null, ['enquadrar', 'Enquadrar tudo']];
itens.forEach(function (it) {
if (!it) { m.appendChild(document.createElement('hr')); return; }
var d = document.createElement('div'); d.textContent = it[1]; d.setAttribute('data-a', it[0]);
if (it[2]) d.setAttribute('data-marca', '1');
if (it[3]) d.className = 'sub';
m.appendChild(d);
});
m.addEventListener('click', function (e) {
var a = e.target.getAttribute && e.target.getAttribute('data-a'); if (!a) return;
fecharMenuCubo();
if (a.indexOf('o-') === 0) {
var k = a.slice(2);
if (k === 'iso') orientarPara(ctx, _V3(1, 0.85, 1)); else orientarPara(ctx, VC_FACES[k].n.clone());
return;
}
ctx.menu(a);
});
m.addEventListener('contextmenu', function (e) { e.preventDefault(); });
document.body.appendChild(m);
var r = m.getBoundingClientRect();
m.style.left = Math.max(4, Math.min(x, (window.innerWidth || 800) - r.width - 6)) + 'px';
m.style.top = Math.max(4, Math.min(y, (window.innerHeight || 600) - r.height - 6)) + 'px';
_menuCubo = m;
setTimeout(function () { document.addEventListener('pointerdown', function fora(ev) { if (_menuCubo && !_menuCubo.contains(ev.target)) { fecharMenuCubo(); document.removeEventListener('pointerdown', fora, true); } }, true); }, 0);
}
var ORTO_FOV = 1.2;
function raioModelo() { var b = new THREE.Box3().setFromObject(modelRoot); if (b.isEmpty()) return 20; return Math.max(1, b.getSize(new THREE.Vector3()).length() / 2); }
function aplicarOrto(cam, orb, on, estado) {
if (!!estado.on === !!on) return;
var d = cam.position.distanceTo(orb.target), dir = cam.position.clone().sub(orb.target).normalize();
var fov0 = cam.fov, fov1 = on ? ORTO_FOV : (estado.fovPersp || 60);
var h = 2 * d * Math.tan(fov0 * Math.PI / 360);
var d1 = h / (2 * Math.tan(fov1 * Math.PI / 360));
if (on) { estado.fovPersp = cam.fov; estado.near0 = cam.near; estado.far0 = cam.far; }
estado.on = !!on;
cam.fov = fov1; cam.position.copy(orb.target).add(dir.multiplyScalar(d1));
if (!on && estado.near0) { cam.near = estado.near0; cam.far = estado.far0; }
cam.updateProjectionMatrix();
ajustarPlanosOrto(cam, orb, estado);
}
function ajustarPlanosOrto(cam, orb, estado) {
if (!estado.on) return;
var dd = cam.position.distanceTo(orb.target), R = estado.raio || (estado.raio = raioModelo());
var nn = Math.max(0.1, dd - R * 2.2), ff = dd + R * 4;
if (Math.abs(nn - cam.near) > 0.5 || Math.abs(ff - cam.far) > 1) { cam.near = nn; cam.far = ff; cam.updateProjectionMatrix(); }
}
function criarCaixaCorte(ctx) {
var cx = { on: false, box: new THREE.Box3(), planos: [], cena: new THREE.Scene(), setas: [], arr: null };
for (var i = 0; i < 6; i++) cx.planos.push(new THREE.Plane(_V3(1, 0, 0), 0));
var linMat = new THREE.LineBasicMaterial({ color: 0x1a6cb5, depthTest: false, transparent: true, opacity: 0.95 });
var setaMat = new THREE.MeshBasicMaterial({ color: 0x1f6fd1, depthTest: false, transparent: true, opacity: 0.95 });
var setaMatHover = new THREE.MeshBasicMaterial({ color: 0xf59e0b, depthTest: false, transparent: true, opacity: 1 });
var linhas = new THREE.LineSegments(new THREE.BufferGeometry(), linMat); linhas.renderOrder = 999; cx.cena.add(linhas);
var FACES = [['x', -1], ['x', 1], ['y', -1], ['y', 1], ['z', -1], ['z', 1]];
var coneGeo = new THREE.ConeGeometry(0.35, 1, 14);
FACES.forEach(function (f, k) {
var g = new THREE.Group(), cone = new THREE.Mesh(coneGeo, setaMat), cone2 = new THREE.Mesh(coneGeo, setaMat);
cone.position.y = 0.55; cone2.position.y = -0.55; cone2.rotation.z = Math.PI;
g.add(cone); g.add(cone2); g.userData.face = k; cone.userData.face = k; cone2.userData.face = k;
var n = _V3(f[0] === 'x' ? f[1] : 0, f[0] === 'y' ? f[1] : 0, f[0] === 'z' ? f[1] : 0);
g.quaternion.setFromUnitVectors(_V3(0, 1, 0), n);
cx.cena.add(g); cx.setas.push(g);
});
function atualizar() {
var b = cx.box, mn = b.min, mx = b.max;
cx.planos[0].set(_V3(1, 0, 0), -mn.x); cx.planos[1].set(_V3(-1, 0, 0), mx.x);
cx.planos[2].set(_V3(0, 1, 0), -mn.y); cx.planos[3].set(_V3(0, -1, 0), mx.y);
cx.planos[4].set(_V3(0, 0, 1), -mn.z); cx.planos[5].set(_V3(0, 0, -1), mx.z);
var c = [[mn.x, mn.y, mn.z], [mx.x, mn.y, mn.z], [mx.x, mx.y, mn.z], [mn.x, mx.y, mn.z], [mn.x, mn.y, mx.z], [mx.x, mn.y, mx.z], [mx.x, mx.y, mx.z], [mn.x, mx.y, mx.z]];
var ar = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7], pos = [];
ar.forEach(function (ix) { pos.push(c[ix][0], c[ix][1], c[ix][2]); });
linhas.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); linhas.geometry.computeBoundingSphere();
var ctr = b.getCenter(new THREE.Vector3());
FACES.forEach(function (f, k) {
var p = ctr.clone(); p[f[0]] = f[1] < 0 ? mn[f[0]] : mx[f[0]];
cx.setas[k].position.copy(p);
});
}
cx.ligar = function (on, box) {
cx.on = !!on;
var rr = ctx.renderer();
if (cx.on) {
var b = box || new THREE.Box3().setFromObject(modelRoot);
if (b.isEmpty()) { cx.on = false; return false; }
var sz = b.getSize(new THREE.Vector3()), fol = Math.max(0.05, sz.length() * 0.01);
cx.box.copy(b).expandByScalar(fol);
atualizar();
rr.clippingPlanes = cx.susp ? [] : cx.planos.slice(); rr.localClippingEnabled = false;
} else {
if (rr.clippingPlanes && rr.clippingPlanes.length === 6 && rr.clippingPlanes[0] === cx.planos[0]) rr.clippingPlanes = [];
}
return cx.on;
};
cx.suspender = function (sim) {
cx.susp = !!sim;
var rr = ctx.renderer(); if (!cx.on || !rr) return;
if (cx.susp) { if (rr.clippingPlanes && rr.clippingPlanes[0] === cx.planos[0]) rr.clippingPlanes = []; }
else if (!rr.clippingPlanes || !rr.clippingPlanes.length) { atualizar(); rr.clippingPlanes = cx.planos.slice(); rr.localClippingEnabled = false; }
};
cx.desenhar = function (rr, cam) {
if (!cx.on) return;
var ctr = cx.box.getCenter(new THREE.Vector3());
var esc = Math.max(0.05, cam.position.distanceTo(ctr) * Math.tan((cam.fov || 60) * Math.PI / 360) * 0.045);
cx.setas.forEach(function (g) { g.scale.setScalar(esc); });
var ac = rr.autoClear, cp = rr.clippingPlanes;
rr.autoClear = false; rr.clippingPlanes = [];
try { rr.render(cx.cena, cam); } catch (_) {}
rr.clippingPlanes = cp; rr.autoClear = ac;
};
var ray = new THREE.Raycaster(), ms = new THREE.Vector2(), arr = null, hover = null;
function setaSob(e) {
if (!cx.on) return null;
var cv = ctx.canvas(), r = cv.getBoundingClientRect();
ms.x = ((e.clientX - r.left) / r.width) * 2 - 1; ms.y = -((e.clientY - r.top) / r.height) * 2 + 1;
ray.setFromCamera(ms, ctx.cam());
var h = ray.intersectObjects(cx.setas, true);
return h.length ? h[0].object.userData.face : null;
}
function pintarHover(f) { if (hover === f) return; hover = f; cx.setas.forEach(function (g, k) { g.children.forEach(function (c) { c.material = k === f ? setaMatHover : setaMat; }); }); ctx.canvas().style.cursor = f == null ? '' : 'move'; }
cx.soltar = function (e) {
if (!arr) return;
if (e && e.pointerId != null && arr.id != null && e.pointerId !== arr.id) return;
var id = arr.id; arr = null;
var orb = ctx.orbit(); if (orb) orb.enabled = ctx.orbitLivre ? ctx.orbitLivre() : true;
try { if (id != null) ctx.canvas().releasePointerCapture(id); } catch (_) {}
};
cx.onDown = function (e) {
if (arr) { if (arr.id != null && e.pointerId !== arr.id) return; cx.soltar(null); }
if (!cx.on || e.button !== 0) return;
var f = setaSob(e); if (f == null) return;
e.stopImmediatePropagation(); e.preventDefault();
var eixo = FACES[f][0], lado = FACES[f][1], cam = ctx.cam();
var ctr = cx.box.getCenter(new THREE.Vector3()); ctr[eixo] = lado < 0 ? cx.box.min[eixo] : cx.box.max[eixo];
var um = _V3(0, 0, 0); um[eixo] = 1;
var cv = ctx.canvas(), r = cv.getBoundingClientRect();
var a = ctr.clone().project(cam), b = ctr.clone().add(um).project(cam);
var px = { x: (b.x - a.x) * r.width / 2, y: -(b.y - a.y) * r.height / 2 };
var l2 = px.x * px.x + px.y * px.y;
arr = { id: e.pointerId, f: f, eixo: eixo, lado: lado, x0: e.clientX, y0: e.clientY, v0: lado < 0 ? cx.box.min[eixo] : cx.box.max[eixo], px: px, l2: Math.max(l2, 1e-6) };
var orb = ctx.orbit(); if (orb) orb.enabled = false;
try { cv.setPointerCapture(e.pointerId); } catch (_) {}
};
cx.onMove = function (e) {
if (!cx.on) return;
if (!arr) { pintarHover(setaSob(e)); return; }
if (e.pointerType === 'mouse' && e.buttons === 0) { cx.soltar(e); return; }
e.stopImmediatePropagation();
var dx = e.clientX - arr.x0, dy = e.clientY - arr.y0;
var dm = (dx * arr.px.x + dy * arr.px.y) / arr.l2;
var v = arr.v0 + dm, lim = 0.02;
if (arr.lado < 0) cx.box.min[arr.eixo] = Math.min(v, cx.box.max[arr.eixo] - lim);
else cx.box.max[arr.eixo] = Math.max(v, cx.box.min[arr.eixo] + lim);
atualizar();
};
cx.onUp = function (e) {
if (!arr) return;
if (e.pointerId != null && arr.id != null && e.pointerId !== arr.id) return;
e.stopImmediatePropagation();
cx.soltar(e);
};
cx.ligarEventos = function (cv) {
cv.addEventListener('pointerdown', cx.onDown, true);
cv.addEventListener('pointermove', cx.onMove, true);
cv.addEventListener('pointerup', cx.onUp, true);
cv.addEventListener('pointercancel', cx.soltar, true);
cv.addEventListener('lostpointercapture', cx.soltar, true);
var pai = cv.parentNode;
if (pai && pai.addEventListener) pai.addEventListener('pointerdown', function (e) {
if (!cx.on || e.target === cv || !e.target || !e.target.closest || !e.target.closest('.bp-camada')) return;
cx.onDown(e);
}, true);
};
cx.estado = function () { return { on: cx.on, min: cx.box.min.toArray(), max: cx.box.max.toArray() }; };
return cx;
}
var ortoMain = { on: false, fovPersp: 60, raio: 0 };
var inicioChave = function () { return 'orcapro:bim:inicio:' + (OBRA_ID || '-'); };
function irInicio(cam, orb, voar) {
var sv = null; try { sv = JSON.parse(localStorage.getItem(inicioChave()) || 'null'); } catch (_) {}
if (sv && sv.p && sv.t) { voar(_V3(sv.p[0], sv.p[1], sv.p[2]), _V3(sv.t[0], sv.t[1], sv.t[2])); return; }
var b = new THREE.Box3().setFromObject(modelRoot);
if (b.isEmpty()) return;
var c = b.getCenter(new THREE.Vector3()), raio = Math.max(b.getSize(new THREE.Vector3()).length() / 2, 0.5);
var dist = raio / Math.tan((cam.fov * Math.PI / 180) / 2) * 1.15;
voar(c.clone().add(_V3(1, 0.85, 1).normalize().multiplyScalar(dist)), c);
}
function menuDaVista(a, cam, orb, voar, estOrto) {
if (a === 'inicio') irInicio(cam, orb, voar);
else if (a === 'enquadrar') { if (cam === camera) S._fit(); else irInicio(cam, orb, voar); }
else if (a === 'persp' || a === 'orto') { aplicarOrto(cam, orb, a === 'orto', estOrto); if (S.opts && S.opts.onOrto) try { S.opts.onOrto(estOrto.on); } catch (_) {} }
else if (a === 'definir-inicio') { try { localStorage.setItem(inicioChave(), JSON.stringify({ p: cam.position.toArray(), t: orb.target.toArray() })); } catch (_) {} if (S._hint) S._hint('Vista atual definida como o início desta obra.'); }
else if (a === 'reinicio') { try { localStorage.removeItem(inicioChave()); } catch (_) {} irInicio(cam, orb, voar); }
else if (a === 'salvar') { var o = (S && S.opts) || opts; if (o && o.onSalvarVista) o.onSalvarVista(); }
}
var _cristalOn = !visitante && cristalLigado();
var vcMain = criarViewCube(host, {
cristal: _cristalOn,
cam: function () { return camera; }, orbit: function () { return orbit; },
voar: function (p, t) { voarCam(p, t, 0.55); }, orto: function () { return ortoMain.on; },
home: function () { irInicio(camera, orbit, function (p, t) { voarCam(p, t, 0.6); }); },
menu: function (a) { menuDaVista(a, camera, orbit, function (p, t) { voarCam(p, t, 0.6); }, ortoMain); }
});
S.vcubeEl = vcMain.el;
if (visitante) vcMain.el.style.display = 'none';
S._tickPos.push(function () { vcMain.atualizar(); ajustarPlanosOrto(camera, orbit, ortoMain); });
S._orientarMain = function (d) { orientarPara({ cam: function () { return camera; }, orbit: function () { return orbit; }, voar: function (p, t) { voarCam(p, t, 0.55); } }, _V3(d[0], d[1], d[2])); };
try { if (window.BimControle && !visitante) { S._ctl = window.BimControle.criar(S, THREE); S._tickExtra.push(S._ctl.tick); } } catch (_) {}
try { if (window.BimMouse && !visitante) S._mouse = window.BimMouse.instalar(S); } catch (_) {}
try { if (window.BimAbrirUI && !visitante) S._abrirUI = window.BimAbrirUI.instalar(S, THREE); } catch (_) {}
var cris = { hist: ['cubo'], congelado: null, obj: null, estado: 'cubo', t0: 0, tCarga: 0, curta: null, mo: null, c: null, escalado: null, ultimo: performance.now(), abriuEm: performance.now(), arr: null, semMov: false };
try { cris.semMov = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) {}
function crisBA() { return (typeof window !== 'undefined') ? window.BimAbertura : null; }
function crisSet(e) { if (e === cris.estado) return; cris.estado = e; cris.hist.push(e); if (cris.hist.length > 40) cris.hist.shift(); }
function crisT(t0) { return cris.congelado != null ? cris.congelado : performance.now() - t0; }
function cristalDom() {
if (S.vcubeEl) { S.vcubeEl.style.visibility = (!cris.obj || cris.estado === 'cubo') ? '' : 'hidden'; S.vcubeEl.classList.toggle('com-cristal', !!cris.obj); }
if (cris.obj && cris.estado !== 'cubo') {
over.style.alignItems = 'flex-end'; over.style.paddingBottom = '3vh';
var cxo = over.firstElementChild; if (cxo && !cxo._compacto) { cxo._compacto = 1; cxo.style.padding = '10px 22px'; cxo.style.maxWidth = '560px'; cxo.style.background = 'rgba(15,39,64,.72)'; if (cxo.firstElementChild) cxo.firstElementChild.style.display = 'none'; }
loading.style.background = 'rgba(11,26,43,.12)'; loading.style.justifyContent = 'flex-end'; loading.style.paddingBottom = '8vh';
}
}
function cristalCentroDe(mo) {
var b = new THREE.Box3(), t = new THREE.Box3();
(mo.grupo.children || []).forEach(function (m) { if (!m.geometry) return; if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); m.updateMatrix(); t.copy(m.geometry.boundingBox).applyMatrix4(m.matrix); b.union(t); });
return b.isEmpty() ? new THREE.Vector3() : b.getCenter(new THREE.Vector3());
}
function cristalEvento(ev) {
var BA = crisBA(); if (!BA) return;
if (ev === 'carregar' && cris.estado === 'centro') cris.tCarga = performance.now();
crisSet(BA.proximo(cris.estado, ev)); cristalDom();
}
function cristalModeloPronto(mo) {
var BA = crisBA(); if (!BA) return;
cris.menorEscala = null;
if (!cris.obj || cris.semMov) { crisSet('cubo'); cris.mo = null; cristalDom(); return; }
if (cris.estado === 'cubo') { cris.curta = { t0: performance.now(), mo: mo, c: cristalCentroDe(mo) }; return; }
crisSet(BA.proximo(cris.estado === 'centro' ? 'carregando' : cris.estado, 'pronto'));
cris.t0 = performance.now(); cris.mo = mo; cris.c = cristalCentroDe(mo); cris.abriuEm = cris.t0; cristalDom();
}
function cristalFechouTudo() { if (!S.modelos.length) { crisSet('cubo'); cris.mo = null; cris.curta = null; cristalDom(); } }
S._cristalEvento = cristalEvento; S._cristalModeloPronto = cristalModeloPronto; S._cristalFechouTudo = cristalFechouTudo;
S._cristalEstado = function () { return cris.obj ? cris.estado : 'sem-cristal'; };
S._cristalCanto = function () {
var o = cris.obj, r2 = cristalRetCanto(); if (!o || !r2) return null;
var cv = renderer.domElement.getBoundingClientRect();
return { ret: r2, barras: o.barras.map(function (b) { var p = new THREE.Vector3(); b.getWorldPosition(p); p.project(o.camCanto); return [Math.round(cv.left + r2.x + (p.x + 1) / 2 * r2.w), Math.round(cv.bottom - r2.y - (p.y + 1) / 2 * r2.h), +p.z.toFixed(3)]; }), vis: o.barras.map(function (b) { var v = true; b.traverseAncestors(function (a) { if (!a.visible) v = false; }); return v && b.visible; }) };
};
S._cristalCongelar = function (ms) { cris.congelado = ms == null ? null : +ms; };
S._cristalDiag = function () { return { hist: cris.hist.slice(), estado: S._cristalEstado(), semMov: cris.semMov, menorEscala: cris.menorEscala == null ? null : cris.menorEscala, curta: !!cris.curta, escalaFora: S.modelos.map(function (m) { return +m.grupo.scale.x.toFixed(4); }) }; };
S._cristalPular = function () { var BA = crisBA(); if (BA && cris.estado === 'abrindo') { crisSet(BA.proximo('abrindo', 'pular')); cris.mo = null; cristalDom(); } };
if (_cristalOn) {
fetch('bim/cristal-textos.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (tx) {
if (S !== Sm || !S.alive || !crisBA()) return;
try { cris.obj = criarCristal({ renderer: renderer, transmissao: !cris.semMov, textos: tx }); } catch (eC) { cris.obj = null; }
if (S.modelos.length) crisSet('cubo');
cristalDom();
});
}
function cristalEscala(mo, c, s, vis) {
cris.escalado = { mo: mo, vis: mo.grupo.visible, pos: mo.grupo.position.clone(), esc: mo.grupo.scale.clone() };
cris.menorEscala = Math.min(cris.menorEscala == null ? 9 : cris.menorEscala, s);
mo.grupo.scale.setScalar(s); mo.grupo.position.set(c.x * (1 - s), c.y * (1 - s), c.z * (1 - s)); mo.grupo.visible = vis && cris.escalado.vis;
var ag = mo._agreg && mo._agreg.grupo;
if (ag) {
modelRoot.updateMatrix();
var M = new THREE.Matrix4().copy(modelRoot.matrix).multiply(new THREE.Matrix4().makeTranslation(c.x, c.y, c.z)).multiply(new THREE.Matrix4().makeScale(s, s, s)).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
M.decompose(ag.position, ag.quaternion, ag.scale); ag.visible = ag.visible && vis;
}
}
function cristalRestaura() {
var e = cris.escalado; if (!e) return; cris.escalado = null;
e.mo.grupo.scale.copy(e.esc); e.mo.grupo.position.copy(e.pos); e.mo.grupo.visible = e.vis; e.mo.grupo.updateMatrixWorld(true);
}
S._cristalTickEscala = function () {
var BA = crisBA(); if (!BA || !cris.obj) return;
var agora = performance.now();
if (cris.estado === 'abrindo' && cris.mo) { var q = BA.quadro(crisT(cris.t0), { semMovimento: cris.semMov }); cristalEscala(cris.mo, cris.c, q.modeloEscala, q.modeloVisivel); }
else if (cris.curta) { var qc = BA.quadroCurto(agora - cris.curta.t0, { semMovimento: cris.semMov }); cristalEscala(cris.curta.mo, cris.curta.c, qc.modeloEscala, true); }
};
function cristalRetCanto() {
var ce = S.vcubeEl && S.vcubeEl.querySelector('.bim-vcube-cena'); if (!ce) return null;
var a = ce.getBoundingClientRect(), b = renderer.domElement.getBoundingClientRect();
if (!a.width || !b.width) return null;
var cx = a.left + a.width / 2 - b.left, cy = b.bottom - (a.top + a.height / 2), lado = a.width * 2;
return { x: Math.round(cx - lado / 2), y: Math.round(cy - lado / 2), w: Math.round(lado), h: Math.round(lado), ladoCubo: a.width };
}
function lerpN(a, b, k) { return a + (b - a) * k; }
S._tickPos.push(function () {
var agora = performance.now(), dt = Math.min(0.1, (agora - cris.ultimo) / 1000); cris.ultimo = agora;
cristalRestaura();
var BA = crisBA(), o = cris.obj; if (!BA || !o) return;
var tS = agora / 1000, tamR = renderer.getSize(new THREE.Vector2()), W = tamR.x, H = tamR.y;
if (cris.estado === 'centro' || cris.estado === 'carregando') {
o.aplicarAbertura(null, false);
o.aplicarBarras(cris.estado === 'carregando' ? BA.barras(Math.min(0.92, (agora - cris.tCarga) / 4000)) : null);
o.aplicarEstrela(cris.semMov ? BA.estrela(0, 'acesa') : BA.estrela(tS, 'forte'));
o.animarCentro(dt, tS, cris.semMov);
o.camCentro.position.set(0, 0.12, 6.2); o.camCentro.lookAt(0, -0.3, 0); o.camCentro.aspect = W / Math.max(1, H); o.camCentro.updateProjectionMatrix();
o.desenhar({ x: 0, y: 0, w: W, h: H }, o.camCentro);
return;
}
if (cris.estado === 'abrindo') {
var q = BA.quadro(crisT(cris.t0), { semMovimento: cris.semMov }), rc = cristalRetCanto() || { x: W - 200, y: H - 200, w: 160, h: 160 }, k = q.paraOCanto;
o.aplicarAbertura(q, false); o.aplicarBarras(null); o.aplicarEstrela(BA.estrela(tS, 'forte'));
o.animarCentro(dt, tS, cris.semMov);
var rect = { x: Math.round(lerpN(0, rc.x, k)), y: Math.round(lerpN(0, rc.y, k)), w: Math.max(2, Math.round(lerpN(W, rc.w, k))), h: Math.max(2, Math.round(lerpN(H, rc.h, k))) };
o.camCentro.position.set(0, 0.12, 6.2 - q.zoom * 1.8 - k * 1.6); o.camCentro.lookAt(0, -0.3 * (1 - k), 0); o.camCentro.aspect = rect.w / rect.h; o.camCentro.updateProjectionMatrix();
o.desenhar(rect, o.camCentro);
if (q.fim) { crisSet(BA.proximo('abrindo', 'fim')); cris.mo = null; cristalDom(); }
return;
}
if (cris.estado === 'cubo' && S.vcubeEl && S.vcubeEl.style.display !== 'none') {
var r2 = cristalRetCanto(); if (!r2) return;
var pc = cris.curta ? BA.quadroCurto(agora - cris.curta.t0, { semMovimento: cris.semMov }) : null;
o.aplicarAbertura(pc ? { t: 0, respira: pc.pisca * 0.12, luz: pc.pisca, tampaGraus: 0, ladosGraus: 0, explosao: pc.feixe * 0.6, cristalOpac: 1, paraOCanto: 1 } : null, true);
o.aplicarBarras(null);
o.aplicarEstrela(cris.semMov ? BA.estrela(0, 'acesa') : (agora - cris.abriuEm < 3000 ? BA.estrela(tS, 'forte') : BA.estrela(tS, 'suave')));
o.prepararCanto(camera.quaternion, r2, r2.ladoCubo);
o.desenhar(r2, o.camCanto);
if (pc && pc.fim) cris.curta = null;
}
});
function cristalMover(ev) {
if (!cris.obj || cris.estado !== 'centro') return;
var r = canvasEl.getBoundingClientRect();
cris.obj.inclinar(((ev.clientX - r.left) / r.width - 0.5) * 2, ((ev.clientY - r.top) / r.height - 0.5) * 2);
if (cris.arr) { cris.obj.arrastar(ev.clientX - cris.arr.x, ev.clientY - cris.arr.y); cris.arr.x = ev.clientX; cris.arr.y = ev.clientY; cris.arr.moveu = true; }
}
function cristalApertar(ev) {
if (!cris.obj) return;
if (cris.estado === 'abrindo') { S._cristalPular(); return; }
if (cris.estado === 'centro') cris.arr = { x: ev.clientX, y: ev.clientY, moveu: false };
}
function cristalSoltar() { if (cris.arr && !cris.arr.moveu && cris.obj) cris.obj.pular(); cris.arr = null; }
canvasEl.addEventListener('pointermove', cristalMover);
canvasEl.addEventListener('pointerdown', cristalApertar);
canvasEl.addEventListener('pointerup', cristalSoltar);
document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S === Sm && S.alive && cris.estado === 'abrindo') S._cristalPular(); });
var cxMain = criarCaixaCorte({ renderer: function () { return renderer; }, cam: function () { return camera; }, orbit: function () { return orbit; }, canvas: function () { return renderer.domElement; }, orbitLivre: function () { return !fly.on; } });
cxMain.ligarEventos(renderer.domElement);
S._cxMain = cxMain;
S._cxDesligar = function () { if (cxMain.on) { cxMain.ligar(false); if (S.opts && S.opts.onCaixaCorte) try { S.opts.onCaixaCorte(false); } catch (_) {} } };
function caixaCorteMain(on) {
if (on) { if (planta.on) setPlanta(false); if (corteL.on) setCorteL(false); }
var r = cxMain.ligar(on);
if (S.opts && S.opts.onCaixaCorte) try { S.opts.onCaixaCorte(r); } catch (_) {}
return r;
}
S._caixaCorte = caixaCorteMain;
S._caixaCorteEm = function (min, max, iso) {
if (planta.on) setPlanta(false); if (corteL.on) setCorteL(false);
var b = new THREE.Box3(_V3(+min[0], +min[1], +min[2]), _V3(+max[0], +max[1], +max[2])), r = cxMain.ligar(true, b);
if (S.opts && S.opts.onCaixaCorte) try { S.opts.onCaixaCorte(r); } catch (_) {}
if (r && iso) { var c = b.getCenter(_V3(0, 0, 0)), d = b.getSize(_V3(0, 0, 0)).length(); voarCam(_V3(c.x + d * iso[0], c.y + d * iso[1], c.z + d * iso[2]), c, 0.6); }
return r;
};
S._ortoMain = function (on) { aplicarOrto(camera, orbit, on, ortoMain); return ortoMain.on; };
S._grade = function (on) { if (on != null) grid.visible = !!on; return grid.visible; };
S._ortoEstado = function () { return ortoMain.on; };
S._camPlanos = function () { return { near: camera.near, far: camera.far, fov: camera.fov }; };
S._irInicio = function () { irInicio(camera, orbit, function (p, t) { voarCam(p, t, 0.6); }); };
function envPara(rr) {
try {
var pm = new THREE.PMREMGenerator(rr), sc = new THREE.Scene();
sc.add(new THREE.Mesh(new THREE.BoxGeometry(24, 18, 24), new THREE.MeshStandardMaterial({ side: THREE.BackSide, roughness: 1, metalness: 0, color: luzNum(0x9fb0c4) })));
var luz = function (cor, w, h, d, x, y, z, g) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial()); m.material.color.copy(luzNum(cor)).multiplyScalar(g); m.position.set(x, y, z); return m; };
sc.add(luz(0xffffff, 16, 1, 16, 0, 8.5, 0, 3.0)); sc.add(luz(0xdfeaf7, 1, 10, 12, -11.5, 2, -3, 1.6)); sc.add(luz(0xfff0dc, 1, 10, 12, 11.5, 2, 4, 1.3)); sc.add(luz(0xc4d0dd, 16, 1, 16, 0, -8.5, 0, 0.6));
var rt = pm.fromScene(sc, 0.04);
sc.traverse(function (o) { if (o.material && o.material.dispose) o.material.dispose(); if (o.geometry && o.geometry.dispose) o.geometry.dispose(); });
pm.dispose();
return rt.texture;
} catch (e) { return null; }
}
S.vistas = {}; var _vSeq = 0;
function montarVista(v, cont) {
var rr = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
rr.setPixelRatio(Math.min((cont.ownerDocument.defaultView || window).devicePixelRatio || 1, 2));
rr.outputEncoding = renderer.outputEncoding;
try { rr.outputColorSpace = THREE.SRGBColorSpace; } catch (_) {}
rr.toneMapping = renderer.toneMapping; rr.toneMappingExposure = renderer.toneMappingExposure;
rr.domElement.style.cssText = 'display:block;width:100%;height:100%;outline:none';
cont.style.position = cont.style.position || 'relative';
cont.appendChild(rr.domElement);
rr.domElement.addEventListener('webglcontextlost', function (e) {
try { e.preventDefault(); } catch (_) {}
setTimeout(function () {
if (!S || v.renderer !== rr || !v.cont) return;
var c2 = v.cont; desmontarVista(v);
try { montarVista(v, c2); diag3d('vista-recriada', { vista: String(v.id || '') }); } catch (eV) { diag3d('vista-recriar-falhou', { msg: msg3d(eV) }); }
}, 900);
}, false);
var orb = new OrbitControls(v.camera, rr.domElement); orb.enableDamping = true; orb.dampingFactor = .08; orb.target.copy(v.alvo);
v.renderer = rr; v.orbit = orb; v.cont = cont; v.env = envPara(rr);
var cxAnt = v.cx && v.cx.on ? v.cx.box.clone() : null;
v.cx = criarCaixaCorte({ renderer: function () { return v.renderer; }, cam: function () { return v.camera; }, orbit: function () { return v.orbit; }, canvas: function () { return v.renderer.domElement; } });
v.cx.ligarEventos(rr.domElement);
if (cxAnt) { v.cx.ligar(true, cxAnt); v.cx.box.copy(cxAnt); }
v.cubo = criarViewCube(cont, { cristal: _cristalOn,
cam: function () { return v.camera; }, orbit: function () { return v.orbit; },
voar: function (p, t) { v.tween = { p0: v.camera.position.clone(), p1: p, t0: v.orbit.target.clone(), t1: t, e: 0, dur: 0.55 }; },
orto: function () { return v.orto.on; },
home: function () { irInicio(v.camera, v.orbit, function (p, t) { v.tween = { p0: v.camera.position.clone(), p1: p, t0: v.orbit.target.clone(), t1: t, e: 0, dur: 0.6 }; }); },
menu: function (a) { menuDaVista(a, v.camera, v.orbit, function (p, t) { v.tween = { p0: v.camera.position.clone(), p1: p, t0: v.orbit.target.clone(), t1: t, e: 0, dur: 0.6 }; }, v.orto); }
});
rr.domElement.addEventListener('dblclick', function (e) { selecionarNaVista(v, e.clientX, e.clientY); });
rr.domElement.addEventListener('pointerdown', function (e) {
navBotoes(v.orbit, e);
v._sel = (e.button === 0 && e.pointerType !== 'touch' && !visitante) ? { x: e.clientX, y: e.clientY } : null;
}, true);
rr.domElement.addEventListener('pointerup', function (e) {
var d = v._sel, SL = SLx(); v._sel = null;
if (!d || e.button !== 0 || !SL || SL.mao() || SL.arrastou(d, { x: e.clientX, y: e.clientY }) || !semFerramenta3d()) return;
var u = selecionarNaVista(v, e.clientX, e.clientY, true);
if (u) selAplicar(S._compExp ? S._compExp(u) : [u], (e.ctrlKey || e.metaKey) ? 'alternar' : 'trocar'); else if (!(e.ctrlKey || e.metaKey)) selAplicar([], 'trocar');
});
redimVista(v);
}
function desmontarVista(v) {
try { if (v.cubo) v.cubo.remover(); } catch (_) {}
try { if (v.orbit) v.orbit.dispose(); } catch (_) {}
try { if (v.env) v.env.dispose(); } catch (_) {}
try { if (v.renderer) { var el = v.renderer.domElement; v.renderer.dispose(); if (v.renderer.forceContextLoss) v.renderer.forceContextLoss(); if (el.parentNode) el.parentNode.removeChild(el); } } catch (_) {}
v.renderer = null; v.orbit = null; v.cubo = null;
}
function redimVista(v) {
if (!v || !v.renderer || !v.cont) return;
var w = v.cont.clientWidth, h = v.cont.clientHeight;
if (w && h) { v.renderer.setSize(w, h, false); v.camera.aspect = w / h; v.camera.updateProjectionMatrix(); }
}
function selecionarNaVista(v, cx0, cy0, soUid) {
if (S._limparRaioX) S._limparRaioX();
var cv = v.renderer.domElement, r = cv.getBoundingClientRect(), rr = new THREE.Raycaster(), m = new THREE.Vector2();
m.x = ((cx0 - r.left) / r.width) * 2 - 1; m.y = -((cy0 - r.top) / r.height) * 2 + 1;
rr.layers.mask = ray.layers.mask;
rr.setFromCamera(m, v.camera);
var hits = rr.intersectObjects(modelRoot.children, true), hit = null, pls = v.renderer.clippingPlanes || [];
for (var i = 0; i < hits.length && !hit; i++) {
var ob = hits[i].object;
if (v.est ? !(ob.userData && ob.userData.expressID != null && existeNaVista(ob, v.est) && (!ob.parent || ob.parent.visible !== false)) : !cadeiaVisivel(ob)) continue;
var fora = false; for (var k = 0; k < pls.length; k++) if (pls[k].distanceToPoint(hits[i].point) < -1e-6) fora = true;
if (!fora) hit = hits[i];
}
if (soUid) return hit ? uidDeMalha(hit.object) : null;
if (S.selected) { S.selected.material = S.prevMat; S.selected = null; }
var o = (S && S.opts) || opts;
if (hit && hit.object.userData && hit.object.userData.expressID != null) {
S.selected = hit.object; S.prevMat = S.selected.material; S.selected.material = selMat;
contornoSelecao(hit.object);
if (o.onPick) o.onPick(propsDe(hit.object.userData.mid != null ? hit.object.userData.mid : S.modelID, hit.object.userData.expressID, hit.object.userData.tipo));
} else { contornoSelecao(null); if (o.onPick) o.onPick(null); }
}
S._selecionarUid = function (uid) {
var m = S.meshPorUid && S.meshPorUid[uid]; if (!m) return false;
if (S.selected) { S.selected.material = S.prevMat; S.selected = null; }
S.selected = m; S.prevMat = m.material; m.material = selMat; contornoSelecao(m);
var o = (S && S.opts) || opts;
if (o.onPick) o.onPick(propsDe(m.userData.mid != null ? m.userData.mid : S.modelID, m.userData.expressID, m.userData.tipo));
try { if (window.BimSelecao && BimSelecao.mudou) BimSelecao.mudou(); } catch (_) {}
return true;
};
function novaVista(cont, nome) {
var id = 'v' + (++_vSeq);
var v = { id: id, nome: nome || ('{3D} ' + (_vSeq + 1)), camera: camera.clone(), alvo: orbit.target.clone(), orto: { on: ortoMain.on, fovPersp: ortoMain.fovPersp }, visivel: true };
S.vistas[id] = v;
montarVista(v, cont);
return id;
}
function renderVistas(dt) {
var ks = Object.keys(S.vistas);
for (var i = 0; i < ks.length; i++) {
var v = S.vistas[ks[i]];
if (!v.renderer || !v.visivel || !v.cont || !v.cont.isConnected) continue;
if (v.tween) {
v.tween.e += dt; var kk = Math.min(1, v.tween.e / v.tween.dur), s = kk < 0.5 ? 2 * kk * kk : 1 - Math.pow(-2 * kk + 2, 2) / 2;
v.camera.position.lerpVectors(v.tween.p0, v.tween.p1, s); v.orbit.target.lerpVectors(v.tween.t0, v.tween.t1, s);
if (kk >= 1) v.tween = null;
}
v.orbit.update();
ajustarPlanosOrto(v.camera, v.orbit, v.orto);
if (v.renderer.toneMapping !== renderer.toneMapping) { v.renderer.toneMapping = renderer.toneMapping; }
var fb = !!(S._linhaOn && S._linhaOn());
if (v._fundoBranco !== fb) { v._fundoBranco = fb; v.cont.style.background = fb ? '#fff' : ''; }
var envP = scene.environment; scene.environment = v.env;
var tr = null;
try { catAjustarVista(v); } catch (_) {}
try { if (v.est) tr = trocasDaVista(v); v.renderer.render(scene, v.camera); v.cx.desenhar(v.renderer, v.camera); } catch (_) {}
finally { if (tr) desfazerTrocas(tr); }
scene.environment = envP;
v.cubo.atualizar();
}
}
S._renderVistas = renderVistas;
S._novaVista = novaVista;
S._fecharVista = function (id) { var v = S.vistas[id]; if (!v) return false; limparEstadoVista(v); desmontarVista(v); delete S.vistas[id]; return true; };
var _parteSeq = 0, _estSeq = 0, _matCorVista = {};
function uidDe(m) { return m.userData.mid + ':' + m.userData.expressID; }
function existeNaVista(m, est) {
if (ehFuturo4d(m) || ehRemovidoEd(m)) return false;
if (est.catOc) { var kOc = catDeMalha(m); if (kOc && est.catOc[kOc]) return false; }
var u = uidDe(m);
if (est.isolados) return !!est.isolados[u];
if (est.ocultos) return !est.ocultos[u];
return true;
}
function corNaVista(m, est) {
var u = uidDe(m), c = est.cores[u] || (est.catOn ? catCorLinear(m) : null) || _corDoMaterial(m.userData.matOrig || m.material);
var a = c[3] == null ? 1 : c[3];
if (est.rx && !est.rx[u]) a = 0.1;
return [c[0], c[1], c[2], a];
}
function limparEstadoVista(v) {
if (v.cotas) {
(v.cotasObjs || []).forEach(function (o) { try { v.cotas.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } } catch (_) {} });
scene.remove(v.cotas);
}
Object.keys(v.cache || {}).forEach(function (k) { var c = v.cache[k]; if (c && c.mat) { try { c.mat.dispose(); } catch (_) {} } });
v.cotas = null; v.cotasObjs = []; v.cotasRegs = []; v.cache = {}; v.est = null; v.pv = null;
}
function prepararVista(v) {
var est = v.est;
S.modelos.forEach(function (mo) {
var ag = mo._agreg; if (!ag) return;
ag.partes.forEach(function (parte) {
if (!parte._id) parte._id = ++_parteSeq;
var c = v.cache[parte._id];
if (c && c.ver === est.ver && c.sig === ag.assinatura) return;
var fx = parte.faixas, ocultos = {}, algumT = false, nPecas = 0;
var cores = (c && c.cores && c.cores.length === parte.cores.length) ? c.cores : new Float32Array(parte.cores.length);
for (var f = 0; f < fx.length; f++) {
var faixa = fx[f], ref = faixa.ref;
if (!ref) { ocultos[faixa.e] = 1; continue; }
if (!existeNaVista(ref, est) || _desenhaPorSi(ref)) { ocultos["#" + f] = 1; continue; }
var cor = corNaVista(ref, est); nPecas++;
if (cor[3] < 1) algumT = true;
var ini = faixa.iniVert * 4, fim = ini + faixa.nVert * 4;
for (var q = ini; q < fim; q += 4) { cores[q] = cor[0]; cores[q + 1] = cor[1]; cores[q + 2] = cor[2]; cores[q + 3] = cor[3]; }
}
var r = BimAgreg.indicesVisiveis(fx, parte.idxCheio, ocultos, c && c.idx);
var idxAttr = (c && c.idxAttr && c.idxAttr.array === r.idx) ? c.idxAttr : new THREE.BufferAttribute(r.idx, 1);
idxAttr.needsUpdate = true;
var corAttr = (c && c.corAttr && c.corAttr.array === cores) ? c.corAttr : new THREE.BufferAttribute(cores, 4);
corAttr.needsUpdate = true;
var mat = c && c.mat;
if (!mat) mat = parte.malha.material.clone();
if (mat.transparent !== algumT) { mat.transparent = algumT; mat.depthWrite = !algumT; mat.needsUpdate = true; }
v.cache[parte._id] = { ver: est.ver, sig: ag.assinatura, idx: r.idx, n: r.nIdx, idxAttr: idxAttr, cores: cores, corAttr: corAttr, mat: mat, nPecas: nPecas };
});
});
}
function matCorVista(cor) {
var k = cor.join(',');
if (!_matCorVista[k]) _matCorVista[k] = new THREE.MeshStandardMaterial({ color: new THREE.Color(cor[0], cor[1], cor[2]), transparent: cor[3] < 1, opacity: cor[3], depthWrite: cor[3] >= 1, metalness: .05, roughness: .85, side: THREE.DoubleSide });
return _matCorVista[k];
}
function trocasDaVista(v) {
prepararVista(v);
var est = v.est, t = { partes: [], vis: [], mats: [], lay: [], cotas: null };
S.modelos.forEach(function (mo) {
var ag = mo._agreg;
if (ag) {
ag.partes.forEach(function (parte) {
var c = v.cache[parte._id]; if (!c) return;
var g = parte.malha.geometry;
t.partes.push([parte, g.index, g.attributes.color, g.drawRange.start, g.drawRange.count, parte.malha.material]);
g.index = c.idxAttr; g.attributes.color = c.corAttr; g.drawRange.start = 0; g.drawRange.count = c.n;
parte.malha.material = c.mat;
});
mo.grupo.children.forEach(function (m) {
if (!m.isMesh || m.userData.expressID == null || !_desenhaPorSi(m)) return;
var q = existeNaVista(m, est), agora = m.visible !== false && m.layers.isEnabled(0);
if (q && !agora) { t.lay.push([m, m.layers.mask, m.visible]); m.visible = true; m.layers.enable(0); }
else if (!q && agora) { t.vis.push([m, true]); m.visible = false; }
});
return;
}
mo.grupo.children.forEach(function (m) {
if (!m.isMesh || m.userData.expressID == null) return;
var q = existeNaVista(m, est);
if (q !== (m.visible !== false)) { t.vis.push([m, m.visible]); m.visible = q; }
if (q && !_ehRealce(m.material)) {
var u = uidDe(m);
if (est.cores[u] || est.rx || est.catOn || catCor.on) { t.mats.push([m, m.material]); m.material = matCorVista(corNaVista(m, est)); }
}
});
});
if (_selLn && S.selected && S.selected.userData && S.selected.userData.expressID != null) {
var qs = existeNaVista(S.selected, est);
if (qs !== (_selLn.visible !== false)) { t.vis.push([_selLn, _selLn.visible]); _selLn.visible = qs; }
}
medir.objs.forEach(function (o) { if (o.visible !== false) { t.vis.push([o, true]); o.visible = false; } });
if (v.cotas) { v.cotas.visible = true; t.cotas = v.cotas; (v.cotasObjs || []).forEach(function (o) { rescaleObj(o, v.camera); }); }
return t;
}
function desfazerTrocas(t) {
t.partes.forEach(function (x) { var g = x[0].malha.geometry; g.index = x[1]; g.attributes.color = x[2]; g.drawRange.start = x[3]; g.drawRange.count = x[4]; x[0].malha.material = x[5]; });
t.vis.forEach(function (x) { x[0].visible = x[1]; });
t.mats.forEach(function (x) { x[0].material = x[1]; });
t.lay.forEach(function (x) { x[0].layers.mask = x[1]; x[0].visible = x[2]; });
if (t.cotas) t.cotas.visible = false;
}
function aplicarVistaNa(v, pv) {
var BV = (typeof window !== 'undefined') ? window.BimVista : null;
var r = BV ? BV.resolver(pv, S.elementos || []) : null;
var res = { ok: true, naoLocalizadas: r ? r.naoLocalizadas : [], completa: pv.completa === true, globais: [] };
limparEstadoVista(v);
var est = { isolados: null, ocultos: null, cores: {}, rx: null, ver: ++_estSeq };
if (r) {
if (r.isolados.length) { est.isolados = {}; uidsDeChaves(r.isolados).forEach(function (u) { est.isolados[u] = 1; }); }
else if (r.ocultos.length) { est.ocultos = {}; uidsDeChaves(r.ocultos).forEach(function (u) { est.ocultos[u] = 1; }); }
(r.aparencias || []).forEach(function (a) {
var cl = new THREE.Color().setRGB(+a.cor[0], +a.cor[1], +a.cor[2], THREE.SRGBColorSpace);
var cor = [cl.r, cl.g, cl.b, a.alpha != null ? +a.alpha : 1];
uidsDeChaves([a.chave]).forEach(function (u) { est.cores[u] = cor; });
});
if (pv.visibilidade && pv.visibilidade.raioX && r.raioXAlvo.length) { est.rx = {}; uidsDeChaves(r.raioXAlvo).forEach(function (u) { est.rx[u] = 1; }); }
}
var cs = pv.cortes || {};
if ((cs.planta && cs.planta.on) || (cs.livre && cs.livre.on)) res.globais.push('corte');
if (pv.estilo && pv.estilo.desenho) res.globais.push('estilo desenho');
if (pv.estilo && pv.estilo.visual && pv.estilo.visual !== EST.modo) res.globais.push('estilo visual');
if (pv.cotaRede && pv.cotaRede.on) res.globais.push('cotas da rede');
v.est = est; v.cache = {}; v.pv = pv;
v.cotas = new THREE.Group(); v.cotas.visible = false; scene.add(v.cotas);
var g0 = medir.objs, r0 = medir.regs;
medir.objs = []; medir.regs = []; S._medAlvo = v.cotas;
try {
(pv.medidas || []).forEach(function (m) {
var P = (m.pts || []).map(function (p) { return new THREE.Vector3(+p[0], +p[1], +p[2]); });
if (m.tipo === 'dist' && P.length === 2) desenharMedida(P[0], P[1], !!m.horizontal, m.eixo || '', m.mapa);
else if (m.tipo === 'area' && P.length >= 3) desenharArea(P, !!m.horizontal, m.mapa);
else if (m.tipo === 'ang' && P.length === 3) desenharAngulo(P[0], P[1], P[2], m.mapa);
});
} finally {
v.cotasObjs = medir.objs; v.cotasRegs = medir.regs;
medir.objs = g0; medir.regs = r0; S._medAlvo = null;
try { btnCotas(); } catch (_) {}
}
var c = pv.camera; v.tween = null;
if (c && c.pos) {
v.camera.position.set(c.pos[0], c.pos[1], c.pos[2]);
if (c.up) v.camera.up.set(c.up[0], c.up[1], c.up[2]);
if (c.fov && !v.orto.on) v.camera.fov = c.fov;
v.camera.updateProjectionMatrix();
if (c.alvo) { v.orbit.target.set(c.alvo[0], c.alvo[1], c.alvo[2]); v.camera.lookAt(c.alvo[0], c.alvo[1], c.alvo[2]); }
v.orbit.update();
}
return res;
}
S._aplicarVistaNa = function (id, pv) { var v = S.vistas[id]; if (!v || !pv) return { ok: false, erro: 'vista não encontrada' }; try { return aplicarVistaNa(v, pv); } catch (e) { return { ok: false, erro: String(e && e.message || e) }; } };
S._vistaTemEstado = function (id) { var v = S.vistas[id]; return !!(v && v.est); };
S._vistaInfo = function (id) {
var v = S.vistas[id]; if (!v) return null;
var n = 0, tri = 0; Object.keys(v.cache || {}).forEach(function (k) { var c = v.cache[k]; n += c.nPecas || 0; tri += (c.n || 0) / 3; });
var realce = 0;
if (v.est) S.modelos.forEach(function (mo) { mo.grupo.children.forEach(function (m) { if (m.isMesh && m.userData.expressID != null && _ehRealce(m.material) && existeNaVista(m, v.est)) realce++; }); });
n += realce;
return { estado: !!v.est, pecas: n, triangulos: tri, desenhados: v.renderer ? v.renderer.info.render.triangles : 0, cores: v.est ? Object.keys(v.est.cores).length : 0, raioX: !!(v.est && v.est.rx), cotas: (v.cotasObjs || []).length,
camera: [v.camera.position.x, v.camera.position.y, v.camera.position.z] };
};
S._estadoDaVista = function (id) {
var v = S.vistas[id]; if (!v) return null;
var base = v.pv ? JSON.parse(JSON.stringify(v.pv)) : estadoVista();
if (!base) return null;
delete base.id; delete base.nome; delete base.pasta; delete base.comentario; delete base.autor; delete base.thumb;
base.camera = { pos: [v.camera.position.x, v.camera.position.y, v.camera.position.z], alvo: [v.orbit.target.x, v.orbit.target.y, v.orbit.target.z], up: [v.camera.up.x, v.camera.up.y, v.camera.up.z], fov: v.camera.fov, orto: false };
if (v.pv) base.medidas = (v.cotasRegs || []).slice();
return base;
};
var _visSigGlobal = null, _visTick = 0;
S._tickExtra.push(function () {
if (++_visTick % 12) return;
var sig = 0;
S.modelos.forEach(function (mo) { sig = (sig * 31 + (mo.grupo.visible === false ? 1 : 2)) | 0; mo.grupo.children.forEach(function (m) { sig = (sig * 33 + (m.visible === false ? 1 : 2)) | 0; }); });
if (_visSigGlobal !== null && sig !== _visSigGlobal) { var o = (S && S.opts) || opts; if (o.onVisibilidadeGlobal) { try { o.onVisibilidadeGlobal(); } catch (_) {} } }
_visSigGlobal = sig;
});
S._moverVista = function (id, cont) {
var v = S.vistas[id]; if (!v || !cont) return false;
v.alvo = v.orbit ? v.orbit.target.clone() : v.alvo;
desmontarVista(v);
montarVista(v, cont);
return true;
};
S._redimVistas = function () { Object.keys(S.vistas).forEach(function (k) { redimVista(S.vistas[k]); }); };
S._raioVista = function (id, x, y) {
var v = S.vistas[id]; if (!v || !v.renderer) return null;
var cv = v.renderer.domElement, r = cv.getBoundingClientRect(), rc = new THREE.Raycaster(), m = new THREE.Vector2();
m.x = ((x - r.left) / r.width) * 2 - 1; m.y = -((y - r.top) / r.height) * 2 + 1;
v.camera.updateMatrixWorld();
rc.layers.mask = ray.layers.mask;
rc.setFromCamera(m, v.camera);
var h = rc.intersectObjects(modelRoot.children, true);
return { n: h.length, r: [r.left, r.top, r.width, r.height], cam: v.camera.position.toArray(), m: [m.x, m.y], fov: v.camera.fov, asp: v.camera.aspect };
};
S._ortoVista = function (id, on) { var v = S.vistas[id]; if (!v || !v.orbit) return false; aplicarOrto(v.camera, v.orbit, !!on, v.orto); return v.orto.on; };
var _lupa3d = null;
function limparLupa3d() {
if (!_lupa3d) return;
scene.remove(_lupa3d);
_lupa3d.traverse(function (o) { if (o.geometry && o.geometry.dispose) o.geometry.dispose(); });
_lupa3d = null;
}
S._limparLupa3d = limparLupa3d;
function verNo3D(uids) {
limparLupa3d();
if (!uids || !uids.length) return 0;
var porUid = {};
(S.elementos || []).forEach(function (e) { porUid[e.uid] = e; });
modelRoot.updateMatrixWorld(true);
var uniao = new THREE.Box3(), n = 0, grupo = new THREE.Group();
for (var i = 0; i < uids.length; i++) {
var e2 = porUid[uids[i]];
if (!e2 || !e2.aabb) continue;
var b = new THREE.Box3(
new THREE.Vector3(e2.aabb.min[0], e2.aabb.min[1], e2.aabb.min[2]),
new THREE.Vector3(e2.aabb.max[0], e2.aabb.max[1], e2.aabb.max[2]));
b.applyMatrix4(modelRoot.matrixWorld);
if (b.isEmpty()) continue;
uniao.union(b); n++;
if (grupo.children.length < 80) {
var hl = new THREE.Box3Helper(b, 0x16a34a);
if (hl.material) { hl.material.depthTest = false; hl.material.transparent = true; hl.material.opacity = .95; }
hl.renderOrder = 1001; hl.raycast = function () {};
grupo.add(hl);
}
}
if (!n) return 0;
grupo.raycast = function () {};
scene.add(grupo); _lupa3d = grupo;
if (S._enquadrarObj && !fly.on && !xr.on) S._enquadrarObj(uniao, 2.4);
return n;
}
S._verNo3D = verNo3D;
S._tickExtra.push(function () { if (_selLn) _selLn.visible = !!(S.selected && cadeiaVisivel(S.selected)); });
bar.addEventListener('click', function (e) {
var b = e.target.closest('[data-b]'); if (!b) return; var k = b.getAttribute('data-b');
if (k === 'abrir') bar.querySelector('[data-b="file"]').click();
else if (k === 'exemplo') carregarExemplo();
else if (k === 'limpar') limparTudo();
else if (k === 'tema') trocarTema();
else if (k === 'ultra') setUltra(!S.ultra);
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
else if (k === 'sistema') { if (sisColor.on && sisPanel.style.display === 'none') { pintarSisPanel(); sisPanel.style.display = 'flex'; fecharPaineis(sisPanel); } else setSisColor(!sisColor.on); }
else if (k === 'blocok') toggleBlocokPanel();
else if (k === 'foto') tirarFoto();
else if (k === 'limpar-medidas') { if (S._limparMedidas) S._limparMedidas(); }
else if (k === 'req-bim') { if (S._reqAbrir) S._reqAbrir(); }
else if (k === 'cota') { setCota(!cota.on, 'clicado'); }
else if (k === 'cota-iguais') {
if (!cota.chave) { UI0('Toque primeiro num tubo — aí eu coto todos os iguais a ele.', 'info'); }
else setCota(true, 'iguais');
}
else if (k === 'cota-todas') { setCota(true, 'todas'); }
else if (k === 'cota-numerar') {
var pacN = numerarRede();
if (pacN) {
var r = pacN.resumo;
cota.indice = null;
setCota(true, 'todas');
UI0(r.numerados + ' tubos numerados em ' + r.ramais + ' ramal(is) · ' + fmtDist(r.metrosNumerados) +
(r.avulsos ? ' · ' + r.avulsos + ' avulso(s) sem ligacao no IFC' : ''), 'ok');
}
}
else if (k === 'cota-planilha') {
var pacP = (S._numeracao && S._numeracao()) || numerarRede();
if (pacP) {
try {
var levC = reqLevantar();
if (levC) { pacP.compra = levC.pecas; pacP.compraResumo = levC.resumo; }
} catch (eC) { pacP.compra = null; }
if (typeof BimTuboXLS === 'undefined') UI0('Gerador de planilha nao carregado.', 'erro');
else BimTuboXLS.gerar(pacP, {
nome: 'Tubos por ramal',
ok: function () { UI0('Planilha gerada: ' + pacP.linhas.length + ' tubos.', 'ok'); },
erro: function (e) { UI0('Nao consegui gerar a planilha: ' + (e && e.message || e), 'erro'); }
});
}
}
else if (k === 'cota-limpar') { cota.fixados = {}; cota.chave = null; cotaLimpar(); setCota(false); }
else if (k === 'fit') { if (planta.on) enquadrarTopo(); else if (S._enquadrarObj && !fly.on && !xr.on) S._enquadrarObj(new THREE.Box3().setFromObject(modelRoot), 1.5); else enquadrar(); }
});
S._setVoo = function (on) { sairFerramentas(); setMode(on == null ? !fly.on : !!on); };
S._fit = function () {
if (planta.on) enquadrarTopo();
else if (S._enquadrarObj && !fly.on && !xr.on) S._enquadrarObj(new THREE.Box3().setFromObject(modelRoot), 1.5);
else enquadrar();
};
S._togglePav = togglePavPanel;
S._toggleVis = toggleVisPanel;
function sairFerramentas() { if (S._fecharCtecModal && ctecModal.style.display === 'flex') S._fecharCtecModal(); ctecCancelar(); if (medir.on) setMedir(false); if (area.on) setArea(false); if (ang.on) setAng(false); if (planta.on) setPlanta(false); if (corteL.on) setCorteL(false); if (S.edit && S.edit.on && S._setEdit) S._setEdit(false); if (cota.on) setCota(false); if (S.xr && S.xr.on && S._sairImersivo) S._sairImersivo(); }
bar.querySelector('[data-b="file"]').addEventListener('change', function (e) {
var fs2 = Array.prototype.slice.call(e.target.files || []);
receberArquivos(fs2);
e.target.value = '';
});
function orientarSketchUp(nomes) {
nomes = nomes || [];
var nm = nomes.slice(0, 3).map(function (n) { return '“' + n + '”'; }).join(', ') + (nomes.length > 3 ? '…' : '');
var titulo = 'Arquivo do SketchUp (.skp)';
var aviso = (nomes.length === 1 ? 'O arquivo ' + nm + ' é' : 'Os arquivos ' + nm + ' são') +
' do SketchUp. O formato .skp é fechado e nenhum navegador consegue lê-lo; o OrçaPRO abre o IFC que o próprio SketchUp exporta — com a geometria e o tipo de cada elemento.';
var passos = [
'Abra o modelo no SketchUp Pro (ou Studio).',
'Menu Arquivo → Exportar → Modelo 3D…',
'Em “Salvar como tipo”, escolha IFC (*.ifc). O IFC 4 é o padrão; no Windows também existe o IFC 2x3 — os dois abrem aqui.',
'Volte ao OrçaPRO e abra o .ifc exportado: botão Abrir IFC, ou arraste para o visualizador.'
];
var dica = 'Dica: classifique os componentes com tipos IFC no SketchUp (painel Classificações → “Tipo” em Informações da entidade) antes de exportar; sem isso parede, laje e pilar podem chegar como elementos genéricos e o QTO não sabe separá-los. Se a sua versão do SketchUp não exportar IFC, peça o .ifc a quem fez o projeto.';
if (typeof UI === 'undefined' || !UI.modal) {
try { alert(titulo + '\n\n' + aviso + '\n\n' + passos.map(function (p, i) { return (i + 1) + '. ' + p; }).join('\n') + '\n\n' + dica); } catch (_) {}
return;
}
var corpo = '<p style="margin:0 0 10px">' + esc(aviso) + '</p>' +
'<ol style="margin:0 0 10px 18px;padding:0;line-height:1.5">' + passos.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ol>' +
'<p class="muted" style="margin:0;font-size:12px">' + esc(dica) + '</p>';
UI.modal(titulo, corpo, [
{ texto: 'Escolher o IFC exportado', classe: 'primary', onClick: function () { UI.fecharModal(); try { bar.querySelector('[data-b="file"]').click(); } catch (_) {} } },
{ texto: 'Fechar', classe: 'ghost', onClick: function () { UI.fecharModal(); } }
]);
}
function receberArquivos(lista, semFamilias) {
if (!semFamilias && window.FamiliaImportUI && FamiliaImportUI.ativo()) lista = FamiliaImportUI.interceptar(lista, function (resto) { receberArquivos(resto, true); });
if (!lista || !lista.length) return;
var cls = classificarEntradaBim(lista);
cls.ifc.forEach(function (f) { abrirArquivo(f); });
if (cls.skp.length) orientarSketchUp(cls.skp.map(function (f) { return f.name; }));
if (cls.zip.length) {
var oZ = (S && S.opts) || opts;
if (oZ && typeof oZ.onArquivoObra === 'function') {
oZ.onArquivoObra(cls.zip[0]);
if (cls.zip.length > 1) { try { UI.toast('Abri só o primeiro .zip (' + cls.zip[0].name + '). Mande um arquivo da obra por vez.', 'aviso'); } catch (_) {} }
} else cls.outros = cls.outros.concat(cls.zip);
}
var maus = cls.outros;
if (maus.length) {
var nm = maus.map(function (f) { return f.name; }).slice(0, 3).join(', ');
var msg = maus.length === 1
? 'O arquivo “' + nm + '” não é um modelo IFC. O BIM abre arquivos terminados em .ifc.'
: maus.length + ' arquivos não são IFC (' + nm + (maus.length > 3 ? '…' : '') + '). O BIM abre arquivos terminados em .ifc.';
try { if (typeof UI !== 'undefined' && UI.toast) UI.toast(msg, 'erro'); else alert(msg); } catch (_) {}
}
}
function onDragOver(e) { e.preventDefault(); }
function onDrop(e) { e.preventDefault(); receberArquivos(Array.prototype.slice.call(e.dataTransfer.files || [])); }
host.addEventListener('dragover', onDragOver); host.addEventListener('drop', onDrop);
S._onDragOver = onDragOver; S._onDrop = onDrop;
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
if (moS && moS.doCache) {
var elC = null;
for (var q4 = 0; q4 < moS.elementos.length; q4++) if (moS.elementos[q4].id === expressID) { elC = moS.elementos[q4]; break; }
var cbC = (moS.carimbos && moS.carimbos[expressID]) || {};
var qC = (moS.qto && moS.qto[expressID]) || null;
var famC = (moS.familias && moS.familias[expressID]) || null;
return { id: expressID, mid: mid, uid: mid + ':' + expressID,
nome: (elC && (elC.nomeIfc || elC.nome)) || '—', tipo: (elC && elC.tipo) || tipoCache || '',
globalId: (elC && elC.globalId) || '', tag: (elC && elC.tag) || '',
familia: famC ? famC.familia : ((elC && elC.familia) || ''),
etapa: cbC.etapa || (elC && elC.etapa) || '', codOrc: cbC.codOrc || (elC && elC.codOrc) || '', tarefa: cbC.tarefa || (elC && elC.tarefa) || '',
fase: cbC.fase || (elC && elC.fase) || '', qto: qC,
area: qC && qC.area, comprimento: qC && qC.comprimento };
}
if (moS && moS.sintetico) {
var elS = null; for (var q3 = 0; q3 < moS.elementos.length; q3++) if (moS.elementos[q3].id === expressID) { elS = moS.elementos[q3]; break; }
var qS = (moS.qto && moS.qto[expressID]) || {};
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
etapa: cb.etapa || '', codOrc: cb.codOrc || '', fase: cb.fase || '', tarefa: cb.tarefa || '', qto: qtoP };
} catch (e) { return { id: expressID, mid: mid, uid: mid + ':' + expressID, nome: '—', tipo: tipoCache || '', globalId: '', familia: '', etapa: '', codOrc: '', fase: '', qto: null }; }
}
function nomeTipo(num) { var raw = ''; try { if (S.api.GetNameFromTypeCode) raw = S.api.GetNameFromTypeCode(num); } catch (_) {} return raw || ('IFC#' + num); }
function reposicionarChao() {
var box = new THREE.Box3().setFromObject(modelRoot); if (box.isEmpty()) return;
var size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
grid.position.y = box.min.y;
var fp = Math.max(size.x, size.z) * 1.3 || 20;
_chao.scale.set(fp, fp, 1); _chao.position.set(center.x, box.min.y + 0.01, center.z);
}
S._reposicionarChao = reposicionarChao;
function enquadrar() {
if (S._cancelTween) S._cancelTween();
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
var hint = document.createElement('div');
hint.setAttribute('data-bim', 'hint');
hint.className = 'bim-dica';
hint.style.cssText = 'position:absolute;left:50%;top:52px;transform:translateX(-50%);z-index:4;display:none;pointer-events:none;background:var(--texto,#15181d);color:var(--surface,#fff);font-weight:var(--p-medio);font-size:var(--t-micro);padding:7px 15px;border-radius:99px;box-shadow:var(--sombra,0 6px 16px rgba(0,0,0,.25));width:max-content;max-width:90%;box-sizing:border-box;text-align:center';
host.appendChild(hint);
S.hint = hint;
S._hint = function (msg) {
S._hintUltimo = msg || '';
if (!msg) { hint.style.display = 'none'; return; }
while (hint.firstChild) hint.removeChild(hint.firstChild);
var s = String(msg), ini = 0, m;
var re = /<svg class="ic-svg" data-ic="([A-Za-z0-9_-]+)"[^>]*width="(\d+)"[^>]*>[\s\S]*?<\/svg>/g;
while ((m = re.exec(s))) {
if (m.index > ini) hint.appendChild(document.createTextNode(s.slice(ini, m.index)));
if (typeof Icones !== 'undefined' && Icones.tem && Icones.tem(m[1])) {
var sp = document.createElement('span');
sp.style.cssText = 'display:inline-flex;vertical-align:-2px;margin:0 4px 0 0';
sp.innerHTML = Icones.get(m[1], Number(m[2]) || 15);
hint.appendChild(sp);
}
ini = m.index + m[0].length;
}
if (ini < s.length) hint.appendChild(document.createTextNode(s.slice(ini)));
hint.style.display = 'block';
};
var medir = { on: false, pts: [], objs: [], down: null, prov: null, regs: [], pilha: [] };
S.medir = medir;
var _ptrTipo = '';
function ehToque() {
if (_ptrTipo) return _ptrTipo === 'touch';
return visitante || !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
}
function trenaTxt(k) {
var d = ehToque(), ic = (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '');
if (k === 'on') return ic + (d ? ' Trena: toque em 2 pontos do modelo. Segure o dedo para mirar com a lupa.' : ' Trena: clique em 2 pontos do modelo pra medir. Esc sai.');
if (k === 'planta') return ic + (d ? ' Trena na planta: toque em 2 pontos — a cota é a distância horizontal.' : ' Trena na planta: clique em 2 pontos — a cota é a distância horizontal.');
if (k === '2o') return ic + (d ? ' Agora toque no 2º ponto (segure o dedo para a lupa).' : ' Agora clique no 2º ponto.');
if (k === 'ok') return ic + (d ? ' Medido! Toque 2 pontos para medir de novo.' : ' Medido! Clique 2 pontos pra medir de novo, ou Esc pra sair.');
if (k === 'perto') return ic + (d ? ' Pontos muito próximos — toque 2 pontos distintos.' : ' Pontos muito próximos — clique 2 pontos distintos.');
return '';
}
function fmtDist(m) { return m >= 1 ? m.toFixed(2).replace('.', ',') + ' m' : Math.round(m * 100) + ' cm'; }
function labelSprite(txt, borda) {
var cv = document.createElement('canvas'), fs = 46, pad = 14;
var g = cv.getContext('2d'); g.font = 'bold ' + fs + 'px Arial';
cv.width = Math.ceil(g.measureText(txt).width) + pad * 2; cv.height = fs + pad * 2;
g = cv.getContext('2d'); g.font = 'bold ' + fs + 'px Arial';
g.fillStyle = 'rgba(11,26,43,.94)'; g.fillRect(0, 0, cv.width, cv.height);
g.strokeStyle = borda || '#22c55e'; g.lineWidth = borda ? 7 : 4; g.strokeRect(3, 3, cv.width - 6, cv.height - 6);
g.fillStyle = '#c7f9d8'; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(txt, pad, cv.height / 2 + 2);
var tex = texSRGB(new THREE.CanvasTexture(cv)); tex.minFilter = THREE.LinearFilter;
var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
sp.userData._ratio = cv.width / cv.height; sp.userData._sc = 0.028; sp.renderOrder = 999; return sp;
}
function pontoMarca(p) {
var s = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16), new THREE.MeshBasicMaterial({ color: 0x22c55e, depthTest: false }));
s.position.copy(p); s.userData._sc = 0.006; s.renderOrder = 998; return s;
}
function rescaleObj(o, cam) {
var sc = o.userData && o.userData._sc; if (!sc) return;
var d = (cam || camera).position.distanceTo(o.position) * sc;
if (o.userData._ratio) o.scale.set(d * o.userData._ratio, d, 1); else o.scale.setScalar(d);
}
S._tickExtra.push(function () { for (var i = 0; i < medir.objs.length; i++) rescaleObj(medir.objs[i]); });
var cota = {
on: false, modo: 'clicado',
fixados: {},
chave: null,
objs: [],
porUid: {},
indice: null, indiceMarca: -1,
acum: 0, ultimoCusto: 0, periodo: 0.18,
semQto: 0, cortadas: 0
};
function cotaTeto() { return ehTelaPequena ? 22 : 48; }
var COTA_MAX_INDICE = 1500;
function cotaEhRede(e) {
var t = String(e.tipo || '').toUpperCase();
return t === 'IFCFLOWSEGMENT' || t === 'IFCFLOWFITTING' || t === 'IFCFLOWTERMINAL' ||
t === 'IFCPIPESEGMENT' || t === 'IFCDUCTSEGMENT';
}
function cotaComprimento(e) {
var q = e && e.qto;
if (!q || !(q.comprimento > 0)) return 0;
if (q.compFonte === 'anonima') return 0;
return q.comprimento;
}
function cotaMarca() {
var nEl = (S.elementos && S.elementos.length) || 0;
var nRem = S._remEd ? Object.keys(S._remEd).length : 0;
return S.modelos.length + ':' + nEl + ':' + nRem;
}
function cotaIndice() {
if (cota.indice && cota.indiceMarca === cotaMarca()) return cota.indice;
var lista = [], sem = 0;
elementosVivos().forEach(function (e) {
if (!cotaEhRede(e)) return;
if (!e.aabb) return;
var L = cotaComprimento(e);
if (!L) { sem++; return; }
if (L < 0.3) return;
var a = e.aabb;
lista.push({
uid: e.uid, L: L,
x: (a.min[0] + a.max[0]) / 2, y: a.max[1], z: (a.min[2] + a.max[2]) / 2,
chave: (e.familia && String(e.familia).trim()) || String(e.tipo || ''),
temFamilia: !!(e.familia && String(e.familia).trim())
});
});
cota.semQto = sem; cota.indice = lista; cota.indiceMarca = cotaMarca();
return lista;
}
function cotaLimpar() {
cota.objs.forEach(function (sp) {
scene.remove(sp);
try { if (sp.material) { if (sp.material.map) sp.material.map.dispose(); sp.material.dispose(); } } catch (_) {}
});
cota.objs = []; cota.porUid = {}; cota.cortadas = 0;
}
function cotaAlvos() {
var ix = cotaIndice();
if (cota.modo === 'todas') return ix;
if (cota.modo === 'iguais' && cota.chave != null) {
return ix.filter(function (r) { return r.chave === cota.chave; });
}
return ix.filter(function (r) { return cota.fixados[r.uid]; });
}
function cotaPassada() {
if (!cota.on || !S || !S.alive) return;
var alvos = cotaAlvos(), teto = cotaTeto();
var vis = [], v = new THREE.Vector3();
for (var i = 0; i < alvos.length; i++) {
var r = alvos[i];
var m = S.meshPorUid && S.meshPorUid[r.uid];
if (m && (m.visible === false || !cadeiaVisivel(m))) continue;
v.set(r.x, r.y, r.z);
if (foraDoClip(v)) continue;
v.project(camera);
if (v.z > 1 || v.x < -1.15 || v.x > 1.15 || v.y < -1.15 || v.y > 1.15) continue;
vis.push({ r: r, sx: v.x, sy: v.y, d: v.z, fixo: !!cota.fixados[r.uid] });
}
vis.sort(function (a, b) { return (b.fixo - a.fixo) || (a.d - b.d); });
var grade = {}, escolhidos = [];
for (var k = 0; k < vis.length && escolhidos.length < teto; k++) {
var c = vis[k];
var gx = Math.round(c.sx * 6), gy = Math.round(c.sy * 14), gk = gx + '|' + gy;
if (grade[gk] && !c.fixo) continue;
grade[gk] = 1; escolhidos.push(c);
}
cota.cortadas = alvos.length - escolhidos.length;
var querer = {};
escolhidos.forEach(function (c) { querer[c.r.uid] = c.r; });
Object.keys(cota.porUid).forEach(function (uid) {
if (querer[uid]) return;
var sp = cota.porUid[uid];
scene.remove(sp);
try { if (sp.material) { if (sp.material.map) sp.material.map.dispose(); sp.material.dispose(); } } catch (_) {}
var ix2 = cota.objs.indexOf(sp); if (ix2 >= 0) cota.objs.splice(ix2, 1);
delete cota.porUid[uid];
});
Object.keys(querer).forEach(function (uid) {
var jaTem = cota.porUid[uid];
if (jaTem) {
var esperado = (numeroDe(uid) ? numeroDe(uid) + ' · ' : '') + fmtDist(querer[uid].L);
if (jaTem.userData && jaTem.userData._txt === esperado) return;
scene.remove(jaTem);
try { if (jaTem.material) { if (jaTem.material.map) jaTem.material.map.dispose(); jaTem.material.dispose(); } } catch (_) {}
var ixv = cota.objs.indexOf(jaTem); if (ixv >= 0) cota.objs.splice(ixv, 1);
delete cota.porUid[uid];
}
var r2 = querer[uid];
var txt = (numeroDe(uid) ? numeroDe(uid) + ' · ' : '') + fmtDist(r2.L);
var sp = labelSprite(txt);
sp.userData._txt = txt;
if (!cota.fixados[uid] && sp.material) { sp.material.depthTest = true; sp.renderOrder = 0; }
sp.position.set(r2.x, r2.y + 0.06, r2.z);
scene.add(sp); rescaleObj(sp);
cota.objs.push(sp); cota.porUid[uid] = sp;
});
}
var num = { pacote: null, marca: null, porUid: {} };
var _fLen = {};
function fatorLen(mid) {
if (_fLen[mid] != null) return _fLen[mid];
var moF = modeloDe(mid);
if (semWasm(moF)) { _fLen[mid] = +(moF.fatorLenCache) || 1; return _fLen[mid]; }
var b = 1;
try { var x = unidadePrefixoBase(mid, 'LENGTHUNIT'); if (x != null) b = x; } catch (_) {}
_fLen[mid] = b; return b;
}
function numerarRede() {
if (!S || !S.alive) return null;
if (typeof BimTubo === 'undefined') { UI0('Motor de numeração não carregado.', 'erro'); return null; }
var pecas = {}, mids = {};
elementosVivos().forEach(function (e) {
if (!e || !e.uid) return;
mids[e.mid] = 1;
var Le = cotaComprimento(e);
pecas[e.uid] = {
id: e.id, uid: e.uid, tipo: e.tipo, nome: e.nome, familia: e.familia,
sistema: e.sistema || '', pavimento: e.pavimento || '',
L: Le, compFonte: (e.qto && e.qto.compFonte) || '',
dnMm: (Le > 0 && BimTubo.ehTubo(e) && e.mid != null) ? lerBitolaMm(e.mid, e.id, fatorLen(e.mid)) : 0
};
});
var topo = { portaDe: {}, ligacao: {}, portasDe: {}, dirPorta: {}, nPortas: 0, nLigacoes: 0 };
Object.keys(mids).forEach(function (mid) {
var t;
try { t = lerTopologiaRede(isNaN(+mid) ? mid : +mid); } catch (_) { return; }
if (!t) return;
Object.keys(t.portaDe).forEach(function (p) { topo.portaDe[p] = t.portaDe[p]; });
Object.keys(t.ligacao).forEach(function (p) { topo.ligacao[p] = t.ligacao[p]; });
Object.keys(t.portasDe).forEach(function (u) { topo.portasDe[u] = (topo.portasDe[u] || []).concat(t.portasDe[u]); });
Object.keys(t.dirPorta).forEach(function (p) { topo.dirPorta[p] = t.dirPorta[p]; });
topo.nPortas += t.nPortas; topo.nLigacoes += t.nLigacoes;
});
if (!topo.nLigacoes) {
UI0('Este IFC não publica a ligação entre as peças. Dá para listar os tubos, não para encadeá-los.', 'erro');
return null;
}
var pac = BimTubo.numerar(pecas, topo);
pac.topo = { portas: topo.nPortas, ligacoes: topo.nLigacoes };
num.pacote = pac; num.marca = cotaMarca(); num.porUid = {};
pac.linhas.forEach(function (l) { num.porUid[l.uid] = l.n; });
return pac;
}
function numeroDe(uid) { return (num.marca === cotaMarca()) ? (num.porUid[uid] || '') : ''; }
S._numerarRede = numerarRede;
S._numeracao = function () { return (num.marca === cotaMarca()) ? num.pacote : null; };
function UI0(msg, tipo) {
try { if (typeof UI !== 'undefined' && UI.toast) { UI.toast(msg, tipo || 'info'); return; } } catch (_) {}
try { if (S && S._hint) S._hint(msg); } catch (_) {}
}
function cotaResumo() {
var alvos = cotaAlvos(), soma = 0;
alvos.forEach(function (r) { soma += r.L; });
var t = alvos.length + ' trecho(s) · ' + fmtDist(soma);
if (cota.cortadas > 0) t += ' · mostrando as ' + (alvos.length - cota.cortadas) + ' mais legíveis';
if (cota.semQto > 0) t += ' · ' + cota.semQto + ' sem comprimento no IFC';
return t;
}
function setCota(on, modo) {
if (!S) return;
if (on && (fly.on || xr.on)) { UI0('Saia do modo Voo/RA-RV para cotar a rede.', 'erro'); return; }
if (on) { sairFerramentasMenosCota(); }
cota.on = !!on;
if (modo) cota.modo = modo;
if (!cota.on) { cotaLimpar(); }
else {
var ix = cotaIndice();
if (!ix.length) {
cota.on = false;
UI0(cota.semQto > 0
? 'Este IFC não traz o comprimento das peças (' + cota.semQto + ' sem quantidade). Quem exportou precisa marcar "exportar quantidades base".'
: 'Não achei tubulação neste modelo.', 'erro');
} else if (cota.modo === 'todas' && ix.length > COTA_MAX_INDICE) {
cota.on = false;
UI0('São ' + ix.length + ' trechos — demais para mostrar de uma vez. Isole um pavimento ou um sistema e tente de novo.', 'erro');
} else {
cota.acum = cota.periodo;
UI0(cotaResumo() + ' · comprimento do trecho como foi modelado', 'ok');
}
}
var b = bar.querySelector('[data-b="cota"]');
if (b) { b.classList.toggle('on', cota.on); b.style.background = cota.on ? '#16a34a' : ''; b.style.color = cota.on ? '#fff' : ''; }
if (!cota.on) cotaLimpar();
atualizarCursor();
}
function sairFerramentasMenosCota() {
if (medir.on) setMedir(false);
if (area.on) setArea(false);
if (ang.on) setAng(false);
if (S.edit && S.edit.on && S._setEdit) S._setEdit(false);
}
S._setCota = setCota;
S._cotaIndice = function () { var ix = cotaIndice(); return { total: ix.length, semQto: cota.semQto, amostra: ix.slice(0, 3) }; };
S._cotaEstado = function () { return { on: cota.on, modo: cota.modo, n: cota.objs.length, cortadas: cota.cortadas, semQto: cota.semQto, fixados: Object.keys(cota.fixados).length, chave: cota.chave, periodo: cota.periodo, custo: cota.ultimoCusto }; };
S._tickExtra.push(function (dt) {
if (!cota.on) return;
for (var i = 0; i < cota.objs.length; i++) rescaleObj(cota.objs[i]);
cota.acum += (dt || 0.016);
if (cota.acum < cota.periodo) return;
cota.acum = 0;
var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
cotaPassada();
if (t0) {
cota.ultimoCusto = performance.now() - t0;
cota.periodo = cota.ultimoCusto > 8 ? 0.5 : 0.18;
}
});
function btnCotas() { var b = bar.querySelector('[data-b="limpar-medidas"]'); if (b) b.style.display = medir.objs.length ? '' : 'none'; if (S && S._ajustarTop) S._ajustarTop(); }
function addMed(o) { (S._medAlvo || scene).add(o); medir.objs.push(o); rescaleObj(o); }
function pxyz(v) { return [v.x, v.y, v.z]; }
function fontesMapa(l) { var o = []; (l || []).forEach(function (x) { if (x && o.indexOf(x) < 0) o.push(x); }); return o; }
function desenharMedida(a, b, horiz, eixoRot, mapa) {
var dxz = Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z));
var horizontal = (horiz == null) ? !!planta.on : !!horiz, d = horizontal ? dxz : a.distanceTo(b);
if (d < 2e-3) return false;
var line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0x22c55e, depthTest: false })); line.renderOrder = 997;
var fm = fontesMapa(mapa), txtCota = fmtDist(d) + (eixoRot ? ' (' + eixoRot + ')' : horizontal ? ' (horizontal)' : '');
if (fm.length && window.BimTrenaMapa) txtCota = window.BimTrenaMapa.rotulo(txtCota, fm);
var lab = labelSprite(txtCota); lab.position.copy(a.clone().add(b).multiplyScalar(0.5));
var mA = pontoMarca(a), mB = pontoMarca(b);
addMed(mA); addMed(mB); addMed(line); addMed(lab); btnCotas();
medir.ultima = { valor: d, horizontal: horizontal, eixo: eixoRot || '', mapa: fm, rotulo: txtCota };
var reg = { tipo: 'dist', pts: [pxyz(a), pxyz(b)], horizontal: horizontal, eixo: eixoRot || '' };
if (fm.length) reg.mapa = fm;
medir.regs.push(reg);
medir.pilha.push({ objs: [mA, mB, line, lab], reg: reg, ultima: medir.ultima });
return true;
}
function limparMarca(o) { scene.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }
function tirarProv() { if (!medir.prov) return; var i = medir.objs.indexOf(medir.prov); if (i >= 0) { limparMarca(medir.prov); medir.objs.splice(i, 1); } medir.prov = null; }
function limparMedidas() { medir.prov = null; area.pts = []; area.tmp = []; ang.pts = []; ang.tmp = []; medir.objs.forEach(limparMarca); medir.objs = []; medir.pts = []; medir.regs = []; medir.pilha = []; medir.ultima = null; atualizarElastico(null); btnCotas(); }
S._limparMedidas = limparMedidas;
function desfazerMedida() {
if (medir.pts.length) { medir.pts = []; medir.dirAresta = null; tirarProv(); atualizarElastico(null); if (medir.on) S._hint(trenaTxt('on')); return 'ponto'; }
while (medir.pilha.length) {
var u = medir.pilha.pop(), ri = medir.regs.indexOf(u.reg);
if (ri < 0) continue;
medir.regs.splice(ri, 1);
u.objs.forEach(function (o) { var i = medir.objs.indexOf(o); if (i >= 0) { limparMarca(o); medir.objs.splice(i, 1); } });
var ant = medir.pilha[medir.pilha.length - 1];
medir.ultima = ant ? ant.ultima : null;
btnCotas();
return 'medida';
}
return null;
}
S._desfazerMedida = desfazerMedida;
function atualizarCursor() { canvasEl.style.cursor = (medir.on || area.on || ang.on) ? 'crosshair' : ''; }
function setMedir(on) {
medir.on = !!on;
if (on) { setMode(false); if (area.on) setArea(false); if (ang.on) setAng(false); if (edit && edit.on) setEdit(false); }
else { medir.pts = []; tirarProv(); btnCotas(); esconderSnapMarca(); }
if (S._pintarEixo) S._pintarEixo();
var bm = bar.querySelector('[data-b="medir"]'); if (bm) { bm.style.background = on ? corAtiva() : ''; bm.style.color = on ? '#fff' : ''; }
atualizarCursor();
S._hint(on ? trenaTxt(planta.on ? 'planta' : 'on') : (planta.on ? '' + (typeof Icones !== 'undefined' ? Icones.get('regua', 15) : '') + ' Planta baixa. Ajuste a altura do corte no painel.' : ''));
}
S._setMedir = setMedir;
var _ultimosHits = [];
function raycastEm(clientX, clientY) {
var rc = canvasEl.getBoundingClientRect();
mouse.x = ((clientX - rc.left) / rc.width) * 2 - 1; mouse.y = -((clientY - rc.top) / rc.height) * 2 + 1;
ray.setFromCamera(mouse, camera);
var hits = ray.intersectObjects(modelRoot.children, true);
_ultimosHits = [];
for (var hh = 0; hh < hits.length && _ultimosHits.length < 3; hh++) {
if (!visivelParaRaio(hits[hh].object) || foraDoClip(hits[hh].point)) continue;
var repetido = false;
for (var uh = 0; uh < _ultimosHits.length; uh++) if (_ultimosHits[uh].object === hits[hh].object) { repetido = true; break; }
if (repetido) continue;
_ultimosHits.push(hits[hh]);
}
if (S._vistaInstOn && S._vistaInstOn() && S._vistaInstFundo && _ultimosHits.length > 1) {
var frente = _ultimosHits.filter(function (h) { return !S._vistaInstFundo(h.object); });
if (frente.length) _ultimosHits = frente.concat(_ultimosHits.filter(function (h) { return S._vistaInstFundo(h.object); }));
}
return _ultimosHits[0] || null;
}
S._raycastEm = raycastEm; S._aplicarSnapRef = function (h, r) { return aplicarSnap(h, r); }; S._foraDoClipRef = foraDoClip;
function pontoNaTela(cx, cy) {
var h = raycastEm(cx, cy); if (!h) return null;
modelRoot.updateMatrixWorld(true);
var pl = h.point.clone().applyMatrix4(new THREE.Matrix4().copy(modelRoot.matrixWorld).invert());
var ud = h.object.userData || {}, uid = ud.expressID != null ? ((ud.mid != null ? ud.mid : S.modelID) + ':' + ud.expressID) : '';
var el = null, els = S.elementos || [];
for (var i = 0; uid && i < els.length; i++) if (els[i].uid === uid) { el = els[i]; break; }
return { p: [pl.x, pl.y, pl.z], uid: uid, chave: el ? (el.chave || '') : '', nome: el ? (el.familia || el.nome || el.tipo || '') : '', tipo: ud.tipo || '' };
}
S._pontoNaTela = pontoNaTela;
var _apRay = new THREE.Raycaster(), apoGrp = new THREE.Group(), apoMat = null, apoLin = null;
apoGrp.userData.marcador = true; scene.add(apoGrp);
function apoMalhas(filtro) {
var out = [];
cadaMalha(function (m) {
if (!m || !m.isMesh || !m.geometry || (m.userData && m.userData.marcador)) return;
if (!visivelParaRaio(m)) return;
if (filtro && !filtro(m)) return;
out.push(m);
});
return out;
}
function apoCaixaMalha(m, inv) {
if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
if (!m.geometry.boundingBox) return null;
m.updateWorldMatrix(true, false);
return new THREE.Box3().copy(m.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
}
S._apoiarCaixa = function (uids) {
if (!S || !S.alive || !modelRoot) return null;
modelRoot.updateMatrixWorld(true);
var set = {}; (uids || []).forEach(function (u) { set[u] = 1; });
var inv = new THREE.Matrix4().copy(modelRoot.matrixWorld).invert(), bx = new THREE.Box3(), n = 0;
apoMalhas(function (m) { return set[uidDeMalha(m)]; }).forEach(function (m) {
var b = apoCaixaMalha(m, inv); if (!b || b.isEmpty() || !isFinite(b.min.y) || !isFinite(b.max.y)) return;
bx.union(b); n++;
});
return n ? { min: [bx.min.x, bx.min.y, bx.min.z], max: [bx.max.x, bx.max.y, bx.max.z], n: n } : null;
};
S._apoiarRaios = function (pts, o) {
o = o || {};
if (!S || !S.alive || !modelRoot) return [];
modelRoot.updateMatrixWorld(true);
var so = o.soUid || null, alvos = apoMalhas(function (m) { return !so || uidDeMalha(m) === so; });
var vazio = (pts || []).map(function (p) { return { x: p.x, z: p.z, hits: [] }; });
if (!alvos.length) return vazio;
var mw = modelRoot.matrixWorld, inv = new THREE.Matrix4().copy(mw).invert(), topo = -Infinity;
alvos.forEach(function (m) { var b = apoCaixaMalha(m, inv); if (b && !b.isEmpty() && b.max.y > topo) topo = b.max.y; });
if (!isFinite(topo)) return vazio;
var yTopo = topo + 1, baixo = new THREE.Vector3(0, -1, 0).transformDirection(mw), troca = [];
alvos.forEach(function (m) { (Array.isArray(m.material) ? m.material : [m.material]).forEach(function (mt) { if (mt && mt.side !== THREE.DoubleSide) { troca.push([mt, mt.side]); mt.side = THREE.DoubleSide; } }); });
try {
return (pts || []).map(function (p) {
_apRay.set(new THREE.Vector3(p.x, yTopo, p.z).applyMatrix4(mw), baixo); _apRay.far = 1e5; _apRay.layers.mask = ray.layers.mask;
var hits = [];
_apRay.intersectObjects(alvos, false).forEach(function (h) { hits.push({ y: h.point.clone().applyMatrix4(inv).y, uid: uidDeMalha(h.object) }); });
return { x: p.x, z: p.z, hits: hits };
});
} finally { troca.forEach(function (t) { t[0].side = t[1]; }); }
};
S._apoiarInfo = function () { return { filhos: apoGrp.children.length, visivel: apoGrp.visible, dyMundo: apoGrp.position.y }; };
S._apoiarLimpar = function () {
while (apoGrp.children.length) { var c = apoGrp.children[0]; apoGrp.remove(c); if (c.userData && c.userData.proprio && c.geometry) c.geometry.dispose(); }
apoGrp.position.set(0, 0, 0); apoGrp.visible = true; apoGrp.updateMatrix();
};
S._apoiarFantasma = function (uids) {
S._apoiarLimpar();
if (!S || !S.alive || !modelRoot) return 0;
modelRoot.updateMatrixWorld(true);
if (!apoMat) { apoMat = new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); apoLin = new THREE.LineBasicMaterial({ color: 0xff8a00, depthTest: false, transparent: true, opacity: 0.95 }); }
var set = {}; (uids || []).forEach(function (u) { set[u] = 1; });
var ms = apoMalhas(function (m) { return set[uidDeMalha(m)]; }).slice(0, 300);
ms.forEach(function (m) {
m.updateWorldMatrix(true, false);
var c = new THREE.Mesh(m.geometry, apoMat);
c.matrixAutoUpdate = false; c.matrix.copy(m.matrixWorld); c.renderOrder = 998; c.raycast = function () {}; c.userData.marcador = true; c.frustumCulled = false;
apoGrp.add(c);
});
var cx = S._apoiarCaixa(uids);
if (cx) {
var eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(cx.max[0] - cx.min[0], cx.max[1] - cx.min[1], cx.max[2] - cx.min[2])), ln = new THREE.LineSegments(eg, apoLin);
ln.position.set((cx.min[0] + cx.max[0]) / 2, (cx.min[1] + cx.max[1]) / 2, (cx.min[2] + cx.max[2]) / 2); ln.updateMatrix();
ln.matrix.premultiply(modelRoot.matrixWorld); ln.matrixAutoUpdate = false; ln.renderOrder = 999; ln.raycast = function () {}; ln.userData.marcador = true; ln.userData.proprio = true; ln.frustumCulled = false;
apoGrp.add(ln);
}
apoGrp.visible = false;
return ms.length;
};
S._apoiarDy = function (dy) {
var v = +dy; if (!isFinite(v)) { apoGrp.visible = false; return; }
apoGrp.visible = true;
var mw = modelRoot.matrixWorld, a = new THREE.Vector3(0, 0, 0).applyMatrix4(mw), b = new THREE.Vector3(0, v, 0).applyMatrix4(mw);
apoGrp.position.copy(b.sub(a)); apoGrp.updateMatrix(); apoGrp.updateMatrixWorld(true);
};
var _ultColeta = null;
function cliqueColetor(e) {
var p = pontoNaTela(e.clientX, e.clientY);
var agora = (e && e.timeStamp > 0) ? e.timeStamp : performance.now();
if (p && p.uid && _ultColeta && _ultColeta.uid === p.uid && agora - _ultColeta.t < 400) return;
_ultColeta = p && p.uid ? { uid: p.uid, t: agora } : null;
try { S._aoClicarPeca(p); } catch (_) {}
}
S._cliqueColetor = cliqueColetor;
function modeloDaPeca(uid) {
var s = String(uid || ''), i = s.lastIndexOf(':'); if (i < 0) return null;
var mid = s.slice(0, i);
return modeloDe(mid !== '' && !isNaN(+mid) ? +mid : mid) || modeloDe(mid);
}
function malhasDaPeca(uid) {
var mo = modeloDaPeca(uid), eid = String(uid).slice(String(uid).lastIndexOf(':') + 1);
if (!mo || !mo.grupo) return [];
if (!mo._malhasPorId) {
mo._malhasPorId = {};
mo.grupo.children.forEach(function (m) {
var id = m.userData && m.userData.expressID; if (id == null || !m.isMesh) return;
(mo._malhasPorId[id] = mo._malhasPorId[id] || []).push(m);
});
}
return mo._malhasPorId[eid] || [];
}
function volumeMalha(uid) {
var mo = modeloDaPeca(uid); if (!mo) return null;
var memo = mo._volMalha || (mo._volMalha = {});
if (Object.prototype.hasOwnProperty.call(memo, uid)) return memo[uid];
var ms = malhasDaPeca(uid), caixa = new THREE.Box3(), tmp = new THREE.Box3();
if (!ms.length) return null;
ms.forEach(function (m) {
if (!m.geometry) return; m.updateMatrix();
if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
tmp.copy(m.geometry.boundingBox).applyMatrix4(m.matrix); caixa.union(tmp);
});
if (caixa.isEmpty()) { memo[uid] = null; return null; }
var c = caixa.getCenter(new THREE.Vector3()), sz = caixa.getSize(new THREE.Vector3()), vCaixa = sz.x * sz.y * sz.z;
var total = 0;
ms.forEach(function (m) {
var g = m.geometry, pa = g && g.attributes && g.attributes.position, ix = g && g.index; if (!pa || !ix) return;
var e = m.matrix.elements, p = pa.array, id = ix.array, s = 0;
function X(k) { return e[0] * p[k] + e[4] * p[k + 1] + e[8] * p[k + 2] + e[12] - c.x; }
function Y(k) { return e[1] * p[k] + e[5] * p[k + 1] + e[9] * p[k + 2] + e[13] - c.y; }
function Z(k) { return e[2] * p[k] + e[6] * p[k + 1] + e[10] * p[k + 2] + e[14] - c.z; }
for (var t = 0; t + 2 < id.length; t += 3) {
var a = id[t] * 3, b = id[t + 1] * 3, d = id[t + 2] * 3;
var ax = X(a), ay = Y(a), az = Z(a), bx = X(b), by = Y(b), bz = Z(b), dx = X(d), dy = Y(d), dz = Z(d);
s += ax * (by * dz - bz * dy) - ay * (bx * dz - bz * dx) + az * (bx * dy - by * dx);
}
total += Math.abs(s / 6);
});
var r = (total > 0 && total <= vCaixa * 1.001) ? { volume: total, caixa: vCaixa } : null;
memo[uid] = r;
return r;
}
S._volumeMalha = volumeMalha;
var pinGrupo = new THREE.Group(); pinGrupo.name = 'pinos-visitante'; scene.add(pinGrupo);
var _pinWp = new THREE.Vector3();
function pinos(lista) {
while (pinGrupo.children.length) {
var o = pinGrupo.children.pop();
try { if (o.material && o.material.map) o.material.map.dispose(); if (o.material) o.material.dispose(); if (o.geometry) o.geometry.dispose(); } catch (_) {}
}
(lista || []).forEach(function (pn) {
if (!pn || !pn.p || pn.p.length !== 3) return;
var pl = new THREE.Vector3(pn.p[0], pn.p[1], pn.p[2]);
var sp = labelSprite(String(pn.rotulo || '•').slice(0, 24));
sp.userData.pl = pl.clone().add(new THREE.Vector3(0, 0.35, 0)); sp.userData.pinoId = pn.id;
var bola = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 12), new THREE.MeshBasicMaterial({ color: pn.cor || 0xf59e0b, depthTest: false }));
bola.userData = { pl: pl, _sc: 0.008, pinoId: pn.id }; bola.renderOrder = 998;
pinGrupo.add(sp); pinGrupo.add(bola);
});
}
S._pinos = pinos;
S._tickExtra.push(function () {
if (!pinGrupo.children.length) return;
modelRoot.updateMatrixWorld();
for (var i = 0; i < pinGrupo.children.length; i++) {
var o = pinGrupo.children[i];
o.position.copy(o.userData.pl).applyMatrix4(modelRoot.matrixWorld);
var sc = o.userData._sc; if (!sc) continue;
var d = camera.position.distanceTo(o.getWorldPosition(_pinWp)) * sc;
if (o.userData._ratio) o.scale.set(d * o.userData._ratio, d, 1); else o.scale.setScalar(d);
}
});
function olharPara(p, dist) {
if (!p || p.length !== 3) return;
modelRoot.updateMatrixWorld(true);
var alvo = new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(modelRoot.matrixWorld);
var dir = camera.position.clone().sub(orbit.target); if (dir.lengthSq() < 1e-6) dir.set(0.7, 0.55, 0.8); dir.normalize();
voarCam(alvo.clone().add(dir.multiplyScalar(dist || 6)), alvo, 0.6);
}
S._olharPara = olharPara;
var icar = { grupo: new THREE.Group(), equip: null, sim: null, rotulos: [], vivos: {}, giro: null };
icar.grupo.name = 'icamento'; icar.grupo.matrixAutoUpdate = false; scene.add(icar.grupo);
var _icWp = new THREE.Vector3();
function icL(p) { return new THREE.Vector3(+p.x || 0, +p.z || 0, -(+p.y || 0)); }
function icM(v) { return { x: v.x, y: -v.z, z: v.y }; }
function icMat(cor, op) { return new THREE.MeshStandardMaterial({ color: cor, metalness: .15, roughness: .65, transparent: op != null && op < 1, opacity: op == null ? 1 : op, side: THREE.DoubleSide }); }
function icDescartar(o) {
o.traverse(function (x) {
try {
if (x.material && !x.userData.geoCompartilhada) (Array.isArray(x.material) ? x.material : [x.material]).forEach(function (m) { if (m.map && !(m.userData && m.userData.texCompartilhada)) m.map.dispose(); m.dispose(); });
if (x.geometry && !x.userData.geoCompartilhada) x.geometry.dispose();
} catch (_) {}
});
}
function icLimparSim() {
var s = icar.sim; if (!s) return;
icar.sim = null;
if (s.fantasma) { icar.grupo.remove(s.fantasma); icDescartar(s.fantasma); }
if (s.escondeu) { try { limpar4DTarefas(); } catch (_) {} }
}
function icLimpar() {
icLimparSim();
while (icar.grupo.children.length) { var o = icar.grupo.children.pop(); icDescartar(o); }
icar.equip = null; icar.rotulos = []; icar.vivos = {}; icar.giro = null; icar.tandem = null;
}
function icTandemPose(g, pt) {
var td = icar.tandem; if (!td) return;
var ponta = g.clone().setY(g.y + 3), d = ponta.clone().sub(td.pe), L = Math.max(d.length(), 1e-3);
td.lanca.position.copy(td.pe).add(ponta).multiplyScalar(0.5);
td.lanca.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()); td.lanca.scale.set(1, 1, L);
function mover(l, a, b) { if (!l) return; var at = l.geometry.attributes.position; at.setXYZ(0, a.x, a.y, a.z); at.setXYZ(1, b.x, b.y, b.z); at.needsUpdate = true; l.geometry.computeBoundingSphere(); }
mover(td.cabo, g, ponta); if (pt) mover(td.linga, g, pt);
td.gAgora = g.clone();
}
function icBarra(a, b, larg, alt, mat) {
var d = b.clone().sub(a), len = Math.max(d.length(), 1e-3);
var m = new THREE.Mesh(new THREE.BoxGeometry(larg, alt, len), mat);
m.position.copy(a).add(b).multiplyScalar(0.5);
m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize());
return m;
}
function icLinha(pts, cor, tracejada, larg) {
var g = new THREE.BufferGeometry().setFromPoints(pts);
var mat = tracejada ? new THREE.LineDashedMaterial({ color: cor, dashSize: tracejada, gapSize: tracejada * 0.6, depthTest: false, transparent: true })
: new THREE.LineBasicMaterial({ color: cor, depthTest: false, transparent: true, linewidth: larg || 1 });
var l = new THREE.Line(g, mat); if (tracejada) l.computeLineDistances(); l.renderOrder = 996; return l;
}
function icCirculo(c, r, y, cor, tr) {
var pts = [];
for (var k = 0; k <= 96; k++) { var t = k / 96 * Math.PI * 2; pts.push(new THREE.Vector3(c.x + r * Math.cos(t), y, c.z + r * Math.sin(t))); }
return icLinha(pts, cor, tr);
}
function icRotulo(txt, p) {
var sp = labelSprite(String(txt).slice(0, 40)); sp.position.copy(p); icar.grupo.add(sp); icar.rotulos.push(sp); return sp;
}
function icGeometria(uids) {
var out = {}; if (!S) return out;
modelRoot.updateMatrixWorld(true);
var inv = new THREE.Matrix4().copy(modelRoot.matrixWorld).invert(), mm = new THREE.Matrix4(), tmp = new THREE.Box3();
(uids || []).forEach(function (uid) {
var ms = malhasDaPeca(uid); if (!ms.length) return;
var caixa = new THREE.Box3(), sv = 0, cx = 0, cy = 0, cz = 0;
ms.forEach(function (m) {
if (!m.geometry) return;
m.updateMatrixWorld(true); mm.multiplyMatrices(inv, m.matrixWorld);
if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
tmp.copy(m.geometry.boundingBox).applyMatrix4(mm); caixa.union(tmp);
});
if (caixa.isEmpty()) return;
var o = caixa.getCenter(new THREE.Vector3());
ms.forEach(function (m) {
var g = m.geometry, pa = g && g.attributes && g.attributes.position, ix = g && g.index; if (!pa || !ix) return;
mm.multiplyMatrices(inv, m.matrixWorld);
var e = mm.elements, p = pa.array, id = ix.array;
function X(k) { return e[0] * p[k] + e[4] * p[k + 1] + e[8] * p[k + 2] + e[12] - o.x; }
function Y(k) { return e[1] * p[k] + e[5] * p[k + 1] + e[9] * p[k + 2] + e[13] - o.y; }
function Z(k) { return e[2] * p[k] + e[6] * p[k + 1] + e[10] * p[k + 2] + e[14] - o.z; }
for (var t = 0; t + 2 < id.length; t += 3) {
var a = id[t] * 3, b = id[t + 1] * 3, d = id[t + 2] * 3;
var ax = X(a), ay = Y(a), az = Z(a), bx = X(b), by = Y(b), bz = Z(b), dx = X(d), dy = Y(d), dz = Z(d);
var v = (ax * (by * dz - bz * dy) - ay * (bx * dz - bz * dx) + az * (bx * dy - by * dx)) / 6;
sv += v; cx += v * (ax + bx + dx) / 4; cy += v * (ay + by + dy) / 4; cz += v * (az + bz + dz) / 4;
}
});
var sz = caixa.getSize(new THREE.Vector3()), vCaixa = sz.x * sz.y * sz.z;
var cgOk = Math.abs(sv) > 1e-9 && Math.abs(sv) <= vCaixa * 1.001;
var cgL = cgOk ? new THREE.Vector3(o.x + cx / sv, o.y + cy / sv, o.z + cz / sv) : o.clone();
if (cgOk && !caixa.containsPoint(cgL)) { cgL = o.clone(); cgOk = false; }
var a1 = icM(caixa.min), a2 = icM(caixa.max);
out[uid] = { min: { x: Math.min(a1.x, a2.x), y: Math.min(a1.y, a2.y), z: Math.min(a1.z, a2.z) },
max: { x: Math.max(a1.x, a2.x), y: Math.max(a1.y, a2.y), z: Math.max(a1.z, a2.z) }, cg: icM(cgL), cgPelaMalha: cgOk };
});
return out;
}
function icChao() {
var box = new THREE.Box3();
modelRoot.updateMatrixWorld(true);
var inv = new THREE.Matrix4().copy(modelRoot.matrixWorld).invert(), tmp = new THREE.Box3();
cadaMalha(function (m) { if (!m.geometry || !m.visible) return; if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); m.updateMatrixWorld(true); tmp.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld).applyMatrix4(inv); box.union(tmp); });
return box.isEmpty() ? 0 : box.min.y;
}
function icPontoNoChao(cx, cy, opts) {
modelRoot.updateMatrixWorld(true);
var inv = new THREE.Matrix4().copy(modelRoot.matrixWorld).invert();
if (!opts || opts.modo === 'superficie') {
var h = raycastEm(cx, cy);
if (h) { var pl = h.point.clone().applyMatrix4(inv), ud = h.object.userData || {}; var r = icM(pl); r.uid = ud.expressID != null ? ((ud.mid != null ? ud.mid : S.modelID) + ':' + ud.expressID) : ''; r.noModelo = true; return r; }
}
var rc = canvasEl.getBoundingClientRect();
mouse.x = ((cx - rc.left) / rc.width) * 2 - 1; mouse.y = -((cy - rc.top) / rc.height) * 2 + 1;
ray.setFromCamera(mouse, camera);
var yCh = (opts && opts.cota != null) ? icL({ x: 0, y: 0, z: +opts.cota }).y : icChao();
var p0 = new THREE.Vector3(0, yCh, 0).applyMatrix4(modelRoot.matrixWorld), p1 = new THREE.Vector3(0, yCh + 1, 0).applyMatrix4(modelRoot.matrixWorld);
var n = p1.clone().sub(p0).normalize(), plano = new THREE.Plane().setFromNormalAndCoplanarPoint(n, p0), hit = new THREE.Vector3();
if (!ray.ray.intersectPlane(plano, hit)) return null;
var r2 = icM(hit.applyMatrix4(inv)); r2.uid = ''; r2.noModelo = false; return r2;
}
var _icRaioSonda = new THREE.Raycaster();
function icSondar(pts) {
modelRoot.updateMatrixWorld(true);
var alvos = []; cadaMalha(function (m) { if (m.visible && m.isMesh) alvos.push(m); });
var baixo = new THREE.Vector3(0, -1, 0).transformDirection(modelRoot.matrixWorld), inv = new THREE.Matrix4().copy(modelRoot.matrixWorld).invert();
return (pts || []).map(function (p) {
var o = icL({ x: p.x, y: p.y, z: (+p.z || 0) + 3 }).applyMatrix4(modelRoot.matrixWorld);
_icRaioSonda.set(o, baixo); _icRaioSonda.far = 1e4; _icRaioSonda.layers.mask = ray.layers.mask;
var hs = _icRaioSonda.intersectObjects(alvos, false), sup = null;
for (var i = 0; i < hs.length; i++) { if (!cadeiaVisivel(hs[i].object)) continue; sup = icM(hs[i].point.clone().applyMatrix4(inv)).z; break; }
return { x: p.x, y: p.y, z: p.z, sup: sup };
});
}
var _raioPisoIfc = new THREE.Raycaster();
S._pisoIfcEm = function (x, z, yTopo) {
if (!modelRoot) return null;
modelRoot.updateMatrixWorld(true);
var alvos = []; cadaMalha(function (m) { var u = m.userData || {}; if (m.isMesh && u.mid !== 'edit' && (u.tipo === 'IFCSLAB' || u.tipo === 'IFCCOVERING')) alvos.push(m); });
if (!alvos.length) return null;
var o = new THREE.Vector3(+x, +yTopo, +z).applyMatrix4(modelRoot.matrixWorld), dir = new THREE.Vector3(0, -1, 0).transformDirection(modelRoot.matrixWorld), inv = new THREE.Matrix4().copy(modelRoot.matrixWorld).invert();
_raioPisoIfc.set(o, dir); _raioPisoIfc.far = 1e4; _raioPisoIfc.layers.mask = ray.layers.mask;
var hs = _raioPisoIfc.intersectObjects(alvos, false);
for (var i = 0; i < hs.length; i++) { if (!cadeiaVisivel(hs[i].object)) continue; var pl = hs[i].point.clone().applyMatrix4(inv), ud = hs[i].object.userData; return { y: pl.y, tipo: ud.tipo, uid: (ud.mid != null ? ud.mid : S.modelID) + ':' + ud.expressID }; }
return null;
};
function icDesenhar(c) {
icLimpar();
if (!S || !c || !c.pos) return { ok: false, erro: 'sem posição' };
var pos = icL(c.pos), rumo = (+c.rumo_graus || 0) * Math.PI / 180;
var ax = new THREE.Vector3(Math.cos(rumo), 0, -Math.sin(rumo)), lat = new THREE.Vector3(Math.sin(rumo), 0, Math.cos(rumo));
var y0 = pos.y;
function P(al, sd, up) { return pos.clone().add(ax.clone().multiplyScalar(al)).add(lat.clone().multiplyScalar(sd)).setY(y0 + up); }
var mAm = icMat(0xf59e0b), mCab = icMat(0x1d4ed8), mChassi = icMat(0x475569), mPat = icMat(0xfacc15), mSap = icMat(0x7c2d12), mPreto = icMat(0x111827);
var ge = (c.forma && window.IcarCinematica) ? icGerar(c, pos, rumo, y0) : null;
function caixa(al, sd, up, Lx, Wl, Hz, mat) {
var m = new THREE.Mesh(new THREE.BoxGeometry(Lx, Hz, Wl), mat);
m.position.copy(P(al, sd, up + Hz / 2)); m.rotation.y = rumo; icar.grupo.add(m); return m;
}
var ehMunck = c.tipo === 'munck', comp = +c.comp || (ehMunck ? 8.5 : 12), larg = +c.larg || 2.5;
var pat = c.patolas || [], pLat = Math.max(+pat[pat.length - 1] || larg + 2, larg), pLong = ehMunck ? null : (+pat[0] || comp * 0.55);
var rodas = function (als) { als.forEach(function (al) { [-1, 1].forEach(function (s) { var r = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 18), mPreto); r.position.copy(P(al, s * (larg / 2 - 0.15), 0.5)); r.rotation.set(Math.PI / 2, 0, 0); r.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), rumo); icar.grupo.add(r); }); }); };
var sapatas = [];
if (ge) { }
else if (ehMunck) {
caixa(-comp / 2 + 2.6, 0, 0.75, comp, larg * 0.9, 0.45, mChassi);
caixa(-comp / 2 + 2.6 - 0.6, 0, 1.2, comp - 3.6, larg, 0.25, icMat(0x64748b));
caixa(1.75, 0, 0.8, 2.1, larg, 2.0, mCab);
rodas([1.6, -comp + 3.4, -comp + 4.6]);
[0.15, -comp + 2.9].forEach(function (al) { sapatas.push(P(al, -pLat / 2, 0), P(al, pLat / 2, 0)); });
} else {
caixa(0, 0, 0.9, comp, larg, 0.9, mChassi);
caixa(comp / 2 - 1.2, 0, 1.0, 2.2, larg * 0.95, 1.9, mCab);
rodas([comp / 2 - 2.6, comp / 2 - 4.3, -comp / 2 + 2.4, -comp / 2 + 4.0].slice(0, Math.max(2, Math.min(4, +c.eixos || 3))));
[-pLong / 2, pLong / 2].forEach(function (al) { sapatas.push(P(al, -pLat / 2, 0), P(al, pLat / 2, 0)); });
}
sapatas.forEach(function (s) {
var noCh = s.clone().setY(y0 + 0.9), borda = s.clone().sub(lat.clone().multiplyScalar(Math.sign(s.clone().sub(pos).dot(lat)) * (pLat / 2 - larg / 2))).setY(y0 + 0.9);
icar.grupo.add(icBarra(borda, noCh, 0.28, 0.28, mPat));
icar.grupo.add(icBarra(noCh, s.clone().setY(y0 + 0.12), 0.2, 0.2, mPat));
var sp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.7), mSap); sp.position.copy(s).setY(y0 + 0.04); icar.grupo.add(sp);
});
var yC = y0 + 0.03;
(c.redes || []).forEach(function (rd) {
var z = window.IcarColisao ? IcarColisao.zonaNR10(rd.kV) : null, A = icL({ x: rd.a[0], y: rd.a[1], z: rd.a[2] }), B = icL({ x: rd.b[0], y: rd.b[1], z: rd.b[2] });
var ln = icLinha([A, B], 0x111827); ln.name = 'rede-eletrica'; icar.grupo.add(ln);
if (!z) return;
[[z.Rc, 0xf97316, 0.16], [z.Rr, 0xdc2626, 0.3]].forEach(function (zr) {
var cil = icCilindroL(icar.grupo, A, B, zr[0], new THREE.MeshBasicMaterial({ color: zr[1], transparent: true, opacity: zr[2], depthWrite: false, side: THREE.DoubleSide }), 24); cil.name = 'rede-zona';
});
icRotulo((rd.nome || 'rede') + ' · ' + String(rd.kV).replace('.', ',') + ' kV · Rc ' + String(z.Rc).replace('.', ',') + ' m', A.clone().lerp(B, 0.5).setY(A.y + z.Rc + 0.6));
});
(c.proibidoApoiar || []).forEach(function (ar) {
var pts = (ar.poligono || []).map(function (q) { return icL({ x: q[0], y: q[1], z: 0 }).setY(yC + 0.01); });
if (pts.length >= 2) { var ln = icLinha(ar.aberta ? pts : pts.concat([pts[0]]), 0xdc2626, ar.aberta ? 0.3 : 0); ln.name = 'area-proibida'; icar.grupo.add(ln); }
if (pts.length >= 3 && !ar.aberta) {
var sh = new THREE.Shape(pts.map(function (v) { return new THREE.Vector2(v.x, -v.z); }));
var mF = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: 0xdc2626, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
mF.rotation.x = -Math.PI / 2; mF.position.y = yC + 0.008; mF.name = 'area-proibida'; icar.grupo.add(mF);
var cx = 0, cz = 0; pts.forEach(function (v) { cx += v.x; cz += v.z; });
icRotulo('não apoiar: ' + (ar.motivo || 'área'), new THREE.Vector3(cx / pts.length, yC + 0.5, cz / pts.length));
}
});
if (c.visada && c.visada.olho && c.visada.alvo) {
var lnV = icLinha([icL(c.visada.olho), icL(c.visada.alvo)], c.visada.livre === false ? 0xdc2626 : 0x16a34a, 0.25); lnV.name = 'visada'; lnV.userData.foraDaFoto = true; icar.grupo.add(lnV);
}
if (c.raio > 0) icar.grupo.add(icCirculo(pos, c.raio, yC, 0xf97316, 0.5));
if (c.alcanceMax > 0) { var cAlc = icCirculo(pos, c.alcanceMax, yC, 0x94a3b8, 0.35); cAlc.userData.foraDaFoto = true; icar.grupo.add(cAlc); }
if (c.isolamento > 0) icar.grupo.add(icCirculo(pos, c.isolamento, yC, 0xef4444, 0.8));
var lanca = new THREE.Group(); lanca.name = 'lanca'; icar.grupo.add(lanca);
icar.equip = { c: c, pos: pos, ax: ax, lat: lat, y0: y0, ehMunck: ehMunck, lanca: lanca, mAm: mAm, mPreto: mPreto, ge: ge, k: c.k != null ? +c.k : null };
icAtualizarLanca(c.gancho ? icL(c.gancho) : P(0, 0, 6), (c.pontos || []).map(icL));
if (c.cg && c.raio > 0) {
var cg0 = icL(c.cg).setY(yC);
icar.grupo.add(icLinha([pos.clone().setY(yC), cg0], 0xf97316));
icRotulo('R = ' + (Math.round(c.raio * 100) / 100).toString().replace('.', ',') + ' m', pos.clone().lerp(cg0, 0.5).setY(yC + 0.4));
}
if (c.tandem && c.tandem.pos && c.tandem.gancho) {
var t2 = c.tandem, p2 = icL(t2.pos), g2 = icL(t2.gancho), y2 = p2.y, m2 = icMat(0x0ea5e9);
var d2 = g2.clone().setY(y2).sub(p2); if (d2.length() > 1e-6) d2.normalize(); else d2.set(1, 0, 0);
var b2 = new THREE.Group(); b2.name = 'tandem-equip'; b2.position.copy(p2).setY(y2); b2.rotation.y = Math.atan2(-d2.z, d2.x) + Math.PI / 2; icar.grupo.add(b2);
var ch2 = new THREE.Mesh(new THREE.BoxGeometry(8, 0.9, 2.5), icMat(0x475569)); ch2.position.set(0, 1.35, 0); b2.add(ch2);
var cb2c = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.9, 2.4), icMat(0x0369a1)); cb2c.position.set(3.0, 2.3, 0); b2.add(cb2c);
var gi2 = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.5, 24), m2); gi2.position.set(0, 2.05, 0); b2.add(gi2);
[-2.8, -1.4, 1.6, 2.9].forEach(function (u) { [-1, 1].forEach(function (s) { var rd = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 18), icMat(0x111827)); rd.rotation.x = Math.PI / 2; rd.position.set(u, 0.5, s * 1.1); b2.add(rd); }); });
var l2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 1), m2); l2.name = 'tandem-lanca'; icar.grupo.add(l2);
var cb2 = icLinha([g2, g2.clone().setY(g2.y + 3)], 0x111827); icar.grupo.add(cb2);
var lg2 = t2.ponto ? icLinha([g2, icL(t2.ponto)], 0x16a34a) : null; if (lg2) { lg2.name = 'tandem-linga'; icar.grupo.add(lg2); }
icar.tandem = { pe: p2.clone().setY(y2 + 2.5), lanca: l2, cabo: cb2, linga: lg2, g: g2.clone(), pt: t2.ponto ? icL(t2.ponto) : null, gAgora: null };
icTandemPose(g2, icar.tandem.pt);
if (t2.raio > 0) icar.grupo.add(icCirculo(p2, t2.raio, yC, 0x0ea5e9, 0.5));
if (t2.rotulo) icRotulo(t2.rotulo, p2.clone().setY(y2 + 4.4));
}
(c.rotulos || []).forEach(function (r) { if (r && r.p) icRotulo(r.txt, icL(r.p)); });
if (c.rotulo) icRotulo(c.rotulo, pos.clone().setY(y0 + (ge ? (ehMunck ? 6.2 : 7.2) : (ehMunck ? 4.6 : 4.2))));
icSincronizar();
return { ok: true, objetos: icar.grupo.children.length };
}
var IC_FAB = { liebherr: 0xf5c400, masal: 0xc8102e, palfinger: 0xd4001a, madal: 0xd4001a, xcmg: 0xf2b705, sany: 0xd71920, tka: 0x1f4e9a, argos: 0x0b5fa5, imap: 0xd71920 };
function icCorFab(nome) { var n = String(nome || '').toLowerCase(); for (var k in IC_FAB) if (n.indexOf(k) >= 0) return IC_FAB[k]; return 0xf59e0b; }
function icCaixaL(pai, x0, x1, y0, y1, z0, z1, mat, nome) {
var m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(1e-3, x1 - x0), Math.max(1e-3, y1 - y0), Math.max(1e-3, z1 - z0)), mat);
m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); if (nome) m.name = nome; pai.add(m); return m;
}
function icCilindroL(pai, a, b, r, mat, seg) {
var d = b.clone().sub(a), L = Math.max(d.length(), 1e-3);
var m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, seg || 14), mat);
m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); pai.add(m); return m;
}
function icTracejar(m) {
var e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineDashedMaterial({ color: 0x334155, dashSize: 0.18, gapSize: 0.12 }));
e.computeLineDistances(); e.position.copy(m.position); e.quaternion.copy(m.quaternion); e.scale.copy(m.scale); m.parent.add(e); return e;
}
function icRotuloVivo(id, txt, p, cor) {
var v = icar.vivos[id];
if (!txt) { if (v) v.visible = false; return null; }
if (!v || v.userData._txt !== txt || v.userData._cor !== cor) {
if (v) { icar.grupo.remove(v); icDescartar(v); var ix = icar.rotulos.indexOf(v); if (ix >= 0) icar.rotulos.splice(ix, 1); }
v = labelSprite(String(txt).slice(0, 60), cor); v.userData._txt = txt; v.userData._cor = cor; icar.grupo.add(v); icar.rotulos.push(v); icar.vivos[id] = v;
}
v.visible = true; v.position.copy(p); return v;
}
function icGerar(c, pos, rumo, y0) {
var fo = c.forma, est = fo.estimado || {}, munck = fo.tipo === 'munck';
var eqG = new THREE.Group(); eqG.name = 'equipamento-articulado'; eqG.position.copy(pos).setY(y0); eqG.rotation.y = rumo; icar.grupo.add(eqG);
var fab = icCorFab(c.rotulo), mFab = icMat(fab), mChassi = icMat(0x3f4652), mPreto = icMat(0x15181d), mAro = icMat(0xb8bec7);
var mVidro = new THREE.MeshStandardMaterial({ color: 0x8fb6d9, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.55 });
var mCil = new THREE.MeshStandardMaterial({ color: 0xd9dde3, metalness: 0.9, roughness: 0.2 });
var ge = { eqG: eqG, munck: munck, fo: fo, patolas: [], tracejar: [], mats: {} };
function marca(m, campo) { if (est[campo]) ge.tracejar.push(m); return m; }
function roda(u, z, r, larg) {
var w = new THREE.Group(); w.position.set(u, r, z); eqG.add(w);
var pneu = new THREE.Mesh(new THREE.CylinderGeometry(r, r, larg, 22), mPreto); pneu.rotation.x = Math.PI / 2; w.add(pneu);
var aro = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, larg + 0.02, 16), mAro); aro.rotation.x = Math.PI / 2; w.add(aro);
}
var gU = fo.giroU || 0, a = fo.patolaA, b = fo.patolaB;
var pos4 = [[a / 2, b / 2], [a / 2, -b / 2], [-a / 2, b / 2], [-a / 2, -b / 2]];
if (!munck) {
var ch = fo.chassi, L = ch.comprimento, W = ch.largura, xc = -gU, hRod = ch.rodaD / 2;
marca(icCaixaL(eqG, xc - L / 2, xc + L / 2, hRod * 0.9, hRod * 0.9 + ch.altura, -W / 2, W / 2, mFab, 'chassi'), 'comprimento');
ch.eixos.forEach(function (u) { [-1, 1].forEach(function (s) { roda(xc + u, s * (W / 2 - 0.2), hRod, 0.45); }); });
var cb = fo.cabineMotorista, xf = xc + L / 2;
var cab = icCaixaL(eqG, xf - cb.comprimento, xf, hRod * 0.9 + ch.altura, hRod * 0.9 + ch.altura + cb.altura, -W / 2, W / 2 - 0.9, mFab, 'cabine'); marca(cab, 'cabineMotorista');
icCaixaL(eqG, xf - 0.02, xf + 0.01, hRod * 0.9 + ch.altura + 0.6, hRod * 0.9 + ch.altura + cb.altura - 0.15, -W / 2 + 0.1, W / 2 - 1.0, mVidro);
ge.topoChassi = hRod * 0.9 + ch.altura;
} else {
var cm = fo.caminhao, Lc = cm.comprimento, Wc = cm.largura, x1 = 2.8, x0 = x1 - Lc, hR = cm.rodaD / 2, xcen = (x0 + x1) / 2;
marca(icCaixaL(eqG, x0, x1, hR * 0.8, hR * 0.8 + 0.35, -Wc * 0.42, Wc * 0.42, mChassi, 'chassi'), 'comprimento');
var cabM = icCaixaL(eqG, x1 - cm.cabine.comprimento, x1, hR * 0.8 + 0.35, hR * 0.8 + 0.35 + cm.cabine.altura, -Wc / 2, Wc / 2, icMat(0xe5e7eb), 'cabine'); marca(cabM, 'caminhaoDetalhe');
icCaixaL(eqG, x1 - 0.02, x1 + 0.01, hR * 0.8 + 1.2, hR * 0.8 + 0.35 + cm.cabine.altura - 0.15, -Wc / 2 + 0.12, Wc / 2 - 0.12, mVidro);
var car = icCaixaL(eqG, x0 + 0.1, -0.7, hR * 0.8 + 0.35, hR * 0.8 + 0.45, -Wc / 2, Wc / 2, icMat(0x6b7280), 'carroceria'); marca(car, 'caminhaoDetalhe');
[-1, 1].forEach(function (s) { icCaixaL(eqG, x0 + 0.1, -0.7, hR * 0.8 + 0.45, hR * 0.8 + 0.85, s * Wc / 2 - 0.04, s * Wc / 2 + 0.04, icMat(0x9ca3af)); });
cm.eixos.forEach(function (u) { [-1, 1].forEach(function (s) { roda(xcen + u, s * (Wc / 2 - 0.25), hR, 0.38); }); });
icCaixaL(eqG, -0.65, 0.65, hR * 0.8 + 0.35, 1.3, -0.65, 0.65, mFab, 'base do guindaste');
ge.topoChassi = 1.3;
}
var lado = fo.sapataLado || 0.6, hViga = munck ? 0.95 : (ge.topoChassi - 0.35), largCh = munck ? fo.caminhao.largura : fo.chassi.largura;
pos4.forEach(function (p, k) {
var u = p[0] - gU, z = -p[1], zIn = (z > 0 ? 1 : -1) * largCh * 0.42;
var viga = icCilindroL(eqG, new THREE.Vector3(u, hViga, zIn), new THREE.Vector3(u, hViga, z), 0.13, mFab); viga.userData.parte = 'viga';
var cil = icCilindroL(eqG, new THREE.Vector3(u, hViga, z), new THREE.Vector3(u, 0.16, z), 0.09, mCil);
var mS = icMat(0x9ca3af), sap = icCaixaL(eqG, u - lado / 2, u + lado / 2, 0.03, 0.12, z - lado / 2, z + lado / 2, mS, 'sapata-' + k); marca(sap, 'sapataLado_m');
var mC = new THREE.MeshBasicMaterial({ color: 0x9ca3af, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
var chao = new THREE.Mesh(new THREE.PlaneGeometry(lado * 1.9, lado * 1.9), mC); chao.rotation.x = -Math.PI / 2; chao.position.set(u, 0.012, z); chao.renderOrder = 2; eqG.add(chao);
if (est.patolaA || est.patolaB) ge.tracejar.push(viga);
ge.patolas.push({ sapata: sap, chao: chao, mS: mS, mC: mC, u: u, z: z });
});
ge.escoras = [];
var escs = (c.fisica && c.fisica.escoras) || [];
escs.forEach(function (es, n) {
var k = +es.patola, pa = ge.patolas[k]; if (!pa) return;
var mesmas = escs.filter(function (x) { return +x.patola === k; }), j = mesmas.indexOf(es), nn = mesmas.length;
var ang = nn > 1 ? j / nn * Math.PI * 2 : 0, rr = nn > 1 ? lado * 0.45 : 0;
var mE = icMat(0x9ca3af), x0 = pa.u + rr * Math.cos(ang), z0 = pa.z + rr * Math.sin(ang);
var poste = icCilindroL(eqG, new THREE.Vector3(x0, -2.8, z0), new THREE.Vector3(x0, -0.05, z0), 0.06, mE); poste.name = 'escora-' + (n + 1);
icCaixaL(eqG, x0 - 0.15, x0 + 0.15, -0.12, -0.05, z0 - 0.15, z0 + 0.15, mE);
ge.escoras.push({ m: mE, idx: n, x: x0, z: z0 });
});
var sup = new THREE.Group(); sup.name = 'superestrutura'; sup.position.set(0, ge.topoChassi, 0); eqG.add(sup); ge.sup = sup;
if (!munck) {
var pl = fo.plataforma, se = fo.superestrutura, cpf = fo.contrapeso;
marca(icCilindroL(sup, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, pl.altura, 0), pl.raio, mChassi, 28), 'plataforma');
var supC = icCaixaL(sup, -se.comprimento * 0.62, se.comprimento * 0.38, pl.altura, pl.altura + se.altura, -se.largura / 2, se.largura / 2 - 0.85, mFab, 'superestrutura'); marca(supC, 'superestrutura');
var cabO = icCaixaL(sup, se.comprimento * 0.05, se.comprimento * 0.38 + 0.5, pl.altura, pl.altura + 1.7, se.largura / 2 - 0.8, se.largura / 2, mFab, 'cabine do operador');
cabO.position.z = -cabO.position.z; marca(cabO, 'superestrutura');
icCaixaL(sup, se.comprimento * 0.38 + 0.49, se.comprimento * 0.38 + 0.52, pl.altura + 0.5, pl.altura + 1.6, -(se.largura / 2 - 0.05), -(se.largura / 2 - 0.75), mVidro);
var mCp = icMat(0x2b2f36), rc = cpf.raio;
var cp1 = icCaixaL(sup, -rc - cpf.comprimento / 2, -rc + cpf.comprimento / 2, pl.altura, pl.altura + cpf.altura * 0.55, -cpf.largura / 2, cpf.largura / 2, mCp, 'contrapeso'); marca(cp1, 'contrapesoRaio');
marca(icCaixaL(sup, -rc - cpf.comprimento * 0.4, -rc + cpf.comprimento * 0.4, pl.altura + cpf.altura * 0.55, pl.altura + cpf.altura, -cpf.largura * 0.4, cpf.largura * 0.4, mCp), 'contrapesoRaio');
var pe = new THREE.Group(); pe.name = 'pe-da-lanca'; pe.position.set(fo.peU, fo.peW - ge.topoChassi, 0); sup.add(pe); ge.pe = pe;
ge.secoes = [];
for (var i = 0; i < fo.secoes; i++) {
var hh = 0.95 - 0.13 * i, ww = 0.72 - 0.1 * i, mSec = icMat(fab);
var s = new THREE.Mesh(new THREE.BoxGeometry(1, hh, ww), mSec); s.name = 'secao-' + i; pe.add(s); ge.secoes.push({ m: s, mat: mSec });
if (est.Lmin || est.secoes) ge.tracejar.push(s);
}
var cabeca = new THREE.Group(); cabeca.name = 'cabeca'; pe.add(cabeca); ge.cabeca = cabeca;
icCaixaL(cabeca, -0.25, 0.35, -0.45, 0.35, -0.3, 0.3, mFab);
[-0.12, 0.12].forEach(function (zz) { var pol = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 20), mAro); pol.rotation.x = Math.PI / 2; pol.position.set(0.3, -0.05, zz); cabeca.add(pol); });
ge.cilElev = null; ge.mCil = mCil;
} else {
var mFabM = mFab;
ge.coluna = icCaixaL(sup, -0.35, 0.35, 0, fo.colunaW - ge.topoChassi, -0.35, 0.35, mFabM, 'coluna'); marca(ge.coluna, 'colunaW');
ge.braco1 = new THREE.Mesh(new THREE.BoxGeometry(1, 0.42, 0.42), mFabM); ge.braco1.name = 'braco-1'; sup.add(ge.braco1);
ge.braco2 = new THREE.Mesh(new THREE.BoxGeometry(1, 0.34, 0.34), mFabM); ge.braco2.name = 'braco-2'; sup.add(ge.braco2);
ge.ext = new THREE.Mesh(new THREE.BoxGeometry(1, 0.24, 0.24), mFabM); ge.ext.name = 'extensao'; sup.add(ge.ext);
if (est.L1) ge.tracejar.push(ge.braco1); if (est.L2) ge.tracejar.push(ge.braco2); if (est.extMax) ge.tracejar.push(ge.ext);
ge.mCil = mCil; ge.mBracos = mFabM;
}
ge.cabos = new THREE.Group(); ge.cabos.name = 'cabo'; eqG.add(ge.cabos);
ge.mCabo = new THREE.LineBasicMaterial({ color: 0x111827 });
ge.moitao = new THREE.Group(); ge.moitao.name = 'moitao'; eqG.add(ge.moitao);
ge.mMoitao = icMat(munck ? 0x111827 : 0xf5c400);
icCaixaL(ge.moitao, -0.22, 0.22, 0.2, 0.75, -0.18, 0.18, ge.mMoitao);
var gch = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 8, 16, Math.PI * 1.4), mAro); gch.position.set(0, 0.08, 0); gch.rotation.z = Math.PI * 0.8; ge.moitao.add(gch);
if (c.mostrarEstimado) ge.tracejar.forEach(function (m) { try { icTracejar(m); } catch (_) {} });
ge.nEstimadas = ge.tracejar.length;
return ge;
}
function icPoseGerada(gancho, pontos) {
var q = icar.equip, ge = q.ge, fo = ge.fo, C = window.IcarCinematica;
q._pontosUlt = (pontos || []).map(function (p) { return p.clone(); });
var Mloc = new THREE.Matrix4().compose(ge.eqG.position, ge.eqG.quaternion, ge.eqG.scale), invL = Mloc.clone().invert();
var gl = gancho.clone().applyMatrix4(invL), plL = (pontos || []).map(function (p) { return p.clone().applyMatrix4(invL); });
var R = Math.hypot(gl.x, gl.z), th = Math.atan2(-gl.z, gl.x);
ge.sup.rotation.y = th;
q.theta = th; q.R = R; q.ganchoL = gl;
var pontaL = null, wTopo = ge.topoChassi;
if (!ge.munck) {
var L = +q.c.lanca || fo.Lmin || 10;
var k = C ? C.telescopica({ L: L, peU: fo.peU, peW: fo.peW, Lmin: Math.min(fo.Lmin || L, L), secoes: fo.secoes, dPonta: fo.dPonta, alfaMax: fo.alfaMax }, { R: R, H: gl.y }) : null;
if (!k || !k.ok) {
k = { ok: false, alfa: Math.atan2(Math.max(0.2, gl.y - fo.peW), Math.max(0.5, R - fo.peU)), secoes: [{ de: 0, ate: L }], ponta: null };
k.ponta = { r: fo.peU + L * Math.cos(k.alfa), w: fo.peW + L * Math.sin(k.alfa) };
}
ge.pe.rotation.z = k.alfa;
ge.secoes.forEach(function (s, i) { var sc = k.secoes[Math.min(i, k.secoes.length - 1)], len = Math.max(0.3, sc.ate - sc.de); s.m.scale.x = len; s.m.position.set(sc.de + len / 2, 0, 0); s.m.visible = i < k.secoes.length; });
ge.cabeca.position.set(L, 0, 0);
if (ge.cilElev) { ge.sup.remove(ge.cilElev); icDescartar(ge.cilElev); }
var baseC = new THREE.Vector3(fo.peU + 1.4, fo.plataforma.altura + 0.1, 0), pBoom = new THREE.Vector3(fo.peU + 0.45 * (fo.Lmin || L) * Math.cos(k.alfa), (fo.peW - ge.topoChassi) + 0.45 * (fo.Lmin || L) * Math.sin(k.alfa) - 0.35, 0);
ge.cilElev = icCilindroL(ge.sup, baseC, pBoom, 0.16, ge.mCil);
q.alfa = k.alfa; q.alfaGraus = k.alfa * 180 / Math.PI; q.kin = k;
pontaL = new THREE.Vector3(k.ponta.r * Math.cos(th), k.ponta.w, -k.ponta.r * Math.sin(th));
} else {
var Cm = { r: 0, w: fo.colunaW }, P = { r: R, w: gl.y + 1.2 };
var km = C ? C.munck({ C: Cm, L1: fo.L1, L2: fo.L2, extMin: 0, extMax: fo.extMax }, P) : null;
function noSup(pt) { return new THREE.Vector3(pt.r, pt.w - wTopo, 0); }
function barra(m, a2, b2) { var d = b2.clone().sub(a2), len = Math.max(d.length(), 1e-3); m.scale.x = len; m.position.copy(a2).add(b2).multiplyScalar(0.5); m.rotation.set(0, 0, Math.atan2(d.y, d.x)); }
if (km && km.ok) {
var c0 = noSup(Cm), cot = noSup(km.cotovelo), pt = noSup(km.ponta), dir2 = pt.clone().sub(cot).normalize();
var fim2 = cot.clone().add(dir2.clone().multiplyScalar(fo.L2));
barra(ge.braco1, c0, cot); barra(ge.braco2, cot, fim2.distanceTo(cot) < pt.distanceTo(cot) ? fim2 : pt); ge.ext.visible = km.ext > 0.01;
if (ge.ext.visible) barra(ge.ext, fim2.clone().sub(dir2.clone().multiplyScalar(0.4)), pt);
q.kin = km; pontaL = new THREE.Vector3(km.ponta.r * Math.cos(th), km.ponta.w, -km.ponta.r * Math.sin(th));
} else {
var c1 = noSup(Cm), p1 = noSup(P); barra(ge.braco1, c1, c1.clone().lerp(p1, 0.5)); barra(ge.braco2, c1.clone().lerp(p1, 0.5), p1); ge.ext.visible = false;
q.kin = km || { ok: false }; pontaL = new THREE.Vector3(P.r * Math.cos(th), P.w, -P.r * Math.sin(th));
}
}
q.pontaL = pontaL;
while (ge.cabos.children.length) { var o0 = ge.cabos.children.pop(); if (o0.geometry) o0.geometry.dispose(); }
var n = Math.max(1, Math.min(8, +q.c.pernasCabo || (ge.munck ? 1 : 2)));
for (var j = 0; j < n; j++) {
var dz = (j - (n - 1) / 2) * 0.07;
var gl2 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(pontaL.x, pontaL.y - 0.1, pontaL.z + dz), new THREE.Vector3(gl.x, gl.y + 0.75, gl.z + dz)]);
ge.cabos.add(new THREE.Line(gl2, ge.mCabo));
}
ge.moitao.position.copy(gl).setY(gl.y);
if (ge.lingas) { ge.eqG.remove(ge.lingas); icDescartar(ge.lingas); }
ge.lingas = new THREE.Group(); ge.lingas.name = 'lingas'; ge.eqG.add(ge.lingas); ge.mLingas = [];
plL.forEach(function (p, i) {
var mL = new THREE.LineBasicMaterial({ color: 0x16a34a, depthTest: false, transparent: true });
var ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([gl, p]), mL); ln.renderOrder = 996; ge.lingas.add(ln); ge.mLingas.push(mL);
var bo = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), new THREE.MeshBasicMaterial({ color: 0x16a34a, depthTest: false })); bo.position.copy(p); bo.renderOrder = 997; ge.lingas.add(bo);
});
q.gancho = gancho.clone();
icFisicaAgora(false);
}
function icFisicaAgora(forcar) {
var q = icar.equip; if (!q || !q.ge || !q.c.fisica || !window.IcarFisica) return null;
var agora = performance.now();
if (!forcar && q._fisT && agora - q._fisT < 120) { q._fisPend = true; return q.fis; }
q._fisT = agora; q._fisPend = false;
var e = {}, base = q.c.fisica; for (var kk in base) e[kk] = base[kk];
e.theta = q.theta; e.R = q.R; if (q.k != null) e.k = q.k;
var r = IcarFisica.componentes(e);
q.fis = r; icPintar(r);
return r;
}
function icPintar(r) {
var q = icar.equip, ge = q.ge, c = q.c, valores = c.valores !== false, soCrit = !!c.soCritico, falha = !!c.modoFalha;
var porId = {}; r.componentes.forEach(function (x) { porId[x.id] = x; });
q.pulsa = [];
function cor(x) { return new THREE.Color((x && x.u && x.u.faixa && x.u.faixa.cor) || '#9ca3af'); }
function critico(x) { return x && x.u && ((x.u.uTrab != null && x.u.uTrab >= 0.8) || (x.u.uRup != null && x.u.uRup >= 1) || x.descola); }
function pinta(mat, x, op) {
if (!mat) return;
mat.color.copy(cor(x));
if (mat.emissive) mat.emissive.set(0x000000);
var esmaece = falha && !critico(x);
if (mat.opacity != null) { mat.transparent = esmaece || mat.transparent; mat.opacity = esmaece ? 0.18 : (op != null ? op : mat.opacity); }
if (x && x.u && x.u.faixa.pulsa && mat.emissive) q.pulsa.push(mat);
}
function br(v, d) { return v == null || !isFinite(v) ? '—' : (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d).replace('.', ','); }
function pct(x) { return x && x.u && x.u.uTrab != null ? br(x.u.uTrab * 100, 0) + ' %' : 'sem dado'; }
var SIG = ['DE', 'DD', 'TE', 'TD'];
ge.patolas.forEach(function (pa, k) {
var xp = porId['patola-' + SIG[k]], xs = porId['solo-' + SIG[k]];
pinta(pa.mS, xp, 1); pinta(pa.mC, xs, 0.55);
var t = !valores || (soCrit && !critico(xp) && !critico(xs)) ? null
: SIG[k] + ' · ' + (xp && xp.esforco != null ? 'R = ' + br(xp.esforco, 0) + ' kN' + (xp.descola ? ' (descola)' : '') : 'R: sem dado') + (xs && xs.esforco != null ? ' · ' + br(xs.esforco, 0) + ' kPa' : '');
var wp = new THREE.Vector3(pa.u, 1.0, pa.z).applyMatrix4(new THREE.Matrix4().compose(ge.eqG.position, ge.eqG.quaternion, ge.eqG.scale));
icRotuloVivo('patola-' + k, t, wp, xp && xp.u ? xp.u.faixa.cor : null);
});
(ge.escoras || []).forEach(function (es) {
var xe = porId['escora-' + (es.idx + 1)]; pinta(es.m, xe, 1);
var wpE = new THREE.Vector3(es.x, -1.4, es.z).applyMatrix4(new THREE.Matrix4().compose(ge.eqG.position, ge.eqG.quaternion, ge.eqG.scale));
icRotuloVivo('escora-' + es.idx, valores && xe && (!soCrit || critico(xe)) ? 'escora ' + (es.idx + 1) + ': ' + (xe.esforco != null ? br(xe.esforco, 0) + ' kN (' + pct(xe) + ')' : 'sem dado') : null, wpE, xe && xe.u ? xe.u.faixa.cor : null);
});
var tb = porId.tabela;
if (ge.secoes) ge.secoes.forEach(function (s) { pinta(s.mat, tb, 1); });
if (ge.munck) { pinta(ge.mBracos, tb, 1); }
var cb = porId.cabo; if (cb && cb.u.uTrab != null) ge.mCabo.color.copy(cor(cb)); else ge.mCabo.color.set(0x111827);
var mo = porId.moitao; if (mo && mo.u.uTrab != null) pinta(ge.mMoitao, mo, 1);
(ge.mLingas || []).forEach(function (m, i) { var x = porId['linga-' + (i + 1)]; m.color.copy(cor(x)); if (x && x.u.faixa.pulsa) q.pulsa.push(m); });
var Mg = new THREE.Matrix4().compose(ge.eqG.position, ge.eqG.quaternion, ge.eqG.scale);
var gW = q.ganchoL.clone().applyMatrix4(Mg), pW = q.pontaL.clone().applyMatrix4(Mg);
icRotuloVivo('gancho', valores && !soCrit ? 'Q = ' + br(c.carga_kg, 0) + ' kg' : null, gW.clone().setY(gW.y + 1.3), null);
icRotuloVivo('tabela', valores && (!soCrit || critico(tb)) ? 'tabela ' + pct(tb) : null, pW.clone().setY(pW.y + 0.9), tb && tb.u ? tb.u.faixa.cor : null);
var tom = porId.tombamento;
icRotuloVivo('giro', valores && !soCrit && r.reacoes.ok ? 'margem ' + br(r.reacoes.margem_m, 2) + ' m' + (r.reacoes.MeMt ? ' · Me/Mt ' + br(r.reacoes.MeMt, 1) : '') : null,
new THREE.Vector3(0, ge.topoChassi + 2.4, 0).applyMatrix4(Mg), tom && tom.u ? tom.u.faixa.cor : null);
var pts = ge.lingas ? ge.lingas.children.filter(function (o) { return o.isLine; }) : [];
pts.forEach(function (ln, i) {
var x = porId['linga-' + (i + 1)], a2 = ln.geometry.attributes.position;
var mid = new THREE.Vector3((a2.getX(0) + a2.getX(1)) / 2, (a2.getY(0) + a2.getY(1)) / 2, (a2.getZ(0) + a2.getZ(1)) / 2).applyMatrix4(Mg);
icRotuloVivo('linga-' + i, valores && x && (!soCrit || critico(x)) ? br(x.esforco, 0) + ' kgf (' + pct(x) + ')' : null, mid, x && x.u ? x.u.faixa.cor : null);
});
}
function icAtualizarLanca(gancho, pontos) {
var q = icar.equip; if (!q) return;
if (q.ge) { icPoseGerada(gancho, pontos); return; }
while (q.lanca.children.length) { var o = q.lanca.children.pop(); icDescartar(o); }
var pos = q.pos, y0 = q.y0, c = q.c;
var ponta = gancho.clone().setY(gancho.y + (q.ehMunck ? 1.2 : (+c.pontaGancho || 3)));
if (!q.ehMunck && +c.lanca > 0) {
var dHz = Math.hypot(gancho.x - pos.x, gancho.z - pos.z), Lb = +c.lanca, yPe = y0 + (+c.alturaPe || 2.5);
if (Lb > dHz + 0.05) ponta.setY(Math.max(yPe + Math.sqrt(Lb * Lb - dHz * dHz), gancho.y + 0.6));
}
var dirH = ponta.clone().setY(pos.y).sub(pos); var dist = dirH.length(); if (dist > 1e-6) dirH.normalize(); else dirH.set(1, 0, 0);
if (q.ehMunck) {
var col0 = pos.clone().setY(y0 + 1.3), col1 = pos.clone().setY(y0 + 3.4);
q.lanca.add(icBarra(col0, col1, 0.55, 0.55, q.mAm));
var joelho = pos.clone().add(dirH.clone().multiplyScalar(dist * 0.38)).setY(Math.max(col1.y, ponta.y) + 1.4);
q.lanca.add(icBarra(col1, joelho, 0.42, 0.42, q.mAm));
q.lanca.add(icBarra(joelho, ponta, 0.3, 0.3, q.mAm));
} else {
var giro = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.5, 24), icMat(0xd97706)); giro.position.copy(pos).setY(y0 + 1.95); q.lanca.add(giro);
var cp = pos.clone().sub(dirH.clone().multiplyScalar(1.6)).setY(y0 + 2.6);
var cpM = icBarra(cp.clone().sub(dirH.clone().multiplyScalar(0.6)), cp.clone().add(dirH.clone().multiplyScalar(0.6)), 2.2, 1.1, icMat(0x334155)); q.lanca.add(cpM);
var pe = pos.clone().setY(y0 + (+c.alturaPe || 2.5));
var meio = pe.clone().lerp(ponta, 0.55);
q.lanca.add(icBarra(pe, meio, 0.75, 0.85, q.mAm));
q.lanca.add(icBarra(meio, ponta, 0.5, 0.6, q.mAm));
}
q.lanca.add(icLinha([ponta, gancho], 0x111827)); q.gancho = gancho.clone();
var bl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.45, 0.32), q.mPreto); bl.position.copy(gancho).setY(gancho.y + 0.22); q.lanca.add(bl);
(pontos || []).forEach(function (p) {
q.lanca.add(icLinha([gancho, p], 0x16a34a));
var b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), new THREE.MeshBasicMaterial({ color: 0x16a34a, depthTest: false })); b.position.copy(p); b.renderOrder = 997; q.lanca.add(b);
});
}
function icSimular(s) {
if (!S || !icar.equip) return { ok: false, erro: 'desenhe o equipamento antes' };
icLimparSim();
modelRoot.updateMatrixWorld(true);
var inv = new THREE.Matrix4().copy(modelRoot.matrixWorld).invert();
var fant = new THREE.Group(); fant.matrixAutoUpdate = false; fant.name = 'icamento-fantasma';
var matF = new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0x7c2d12, transparent: true, opacity: 0.88, side: THREE.DoubleSide });
var n = 0;
(s.uids || []).forEach(function (u) {
malhasDaPeca(u).forEach(function (m) {
if (!m.geometry) return;
m.updateMatrixWorld(true);
var k = new THREE.Mesh(m.geometry, matF); k.userData.geoCompartilhada = true;
k.matrixAutoUpdate = false; k.matrix.multiplyMatrices(inv, m.matrixWorld); fant.add(k); n++;
});
});
var mt = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), matF); mt.visible = false; fant.add(mt);
if (!n) return { ok: false, erro: 'peças sem malha na cena' };
icar.grupo.add(fant);
var piv = icL(s.pivo), Cd = icL(s.cg), fundoY = +s.fundo || 0;
var phD = Math.atan2(Cd.z - piv.z, Cd.x - piv.x), rD = Math.hypot(Cd.x - piv.x, Cd.z - piv.z);
var phC, rC, dh0;
if (s.coleta) { var Cc = icL(s.coleta); phC = Math.atan2(Cc.z - piv.z, Cc.x - piv.x); rC = Math.hypot(Cc.x - piv.x, Cc.z - piv.z); dh0 = (+s.coleta.z || 0) - fundoY; }
else { phC = phD + Math.PI / 2; rC = Math.max(rD * 0.6, 2.5); dh0 = icar.equip.y0 - icL({ x: 0, y: 0, z: fundoY }).y; }
var dhT = Math.max(dh0, 0) + (s.folga > 0 ? +s.folga : 1);
var dPh = phD - phC; while (dPh > Math.PI) dPh -= 2 * Math.PI; while (dPh < -Math.PI) dPh += 2 * Math.PI; phC = phD - dPh;
var gD = icL(s.gancho), pD = (s.pontos || []).map(icL);
var tdS = s.tandem && s.tandem.gancho && icar.tandem ? { g: icL(s.tandem.gancho), pt: s.tandem.ponto ? icL(s.tandem.ponto) : null } : null;
var Cc0 = tdS && s.coleta ? icL(s.coleta) : Cd.clone(), dhA = tdS && s.coleta ? (+s.coleta.z || 0) - fundoY : dh0;
var dhTT = Math.max(dhA, 0) + (s.folga > 0 ? +s.folga : 1);
function estadoTandem(t) {
var x, z, dh;
if (t < 0.22) { var a = t / 0.22; x = Cc0.x; z = Cc0.z; dh = dhA + (dhTT - dhA) * a; }
else if (t < 0.74) { var b = (t - 0.22) / 0.52, e = b * b * (3 - 2 * b); x = Cc0.x + (Cd.x - Cc0.x) * e; z = Cc0.z + (Cd.z - Cc0.z) * e; dh = dhTT; }
else { var d = Math.min(1, (t - 0.74) / 0.26); x = Cd.x; z = Cd.z; dh = dhTT * (1 - d); }
return new THREE.Matrix4().makeTranslation(x - Cd.x, dh, z - Cd.z);
}
var estado = tdS ? estadoTandem : estadoGiro;
function estadoGiro(t) {
var ph, r, dh;
if (t < 0.22) { var a = t / 0.22; ph = phC; r = rC; dh = dh0 + (dhT - dh0) * a; }
else if (t < 0.74) { var b = (t - 0.22) / 0.52, e = b * b * (3 - 2 * b); ph = phC + (phD - phC) * e; r = rC + (rD - rC) * e; dh = dhT; }
else { var d = Math.min(1, (t - 0.74) / 0.26); ph = phD; r = rD; dh = dhT * (1 - d); }
var M = new THREE.Matrix4().makeTranslation(piv.x + r * Math.cos(ph), Cd.y + dh, piv.z + r * Math.sin(ph))
.multiply(new THREE.Matrix4().makeRotationY(phD - ph)).multiply(new THREE.Matrix4().makeTranslation(-Cd.x, -Cd.y, -Cd.z));
return M;
}
var trilha = [];
for (var k2 = 0; k2 <= 60; k2++) trilha.push(Cd.clone().applyMatrix4(estado(k2 / 60)));
var ln = icLinha(trilha, 0x7c3aed, 0.25); ln.name = 'linha-icamento'; icar.grupo.add(ln);
var esc = false; try { aplicar4DSim({ ocultos: s.uids || [] }); esc = true; } catch (_) {}
icar.sim = { t: 0, dur: Math.max(2, +s.duracao_s || 9), fantasma: fant, estado: estado, gD: gD, pD: pD, escondeu: esc, aoFim: s.aoFim, parado: !!s.pausado, tandem: tdS };
function passo() {
var si = icar.sim; if (!si) return;
var M = si.estado(Math.min(1, si.t));
si.fantasma.matrix.copy(M); si.fantasma.matrixWorldNeedsUpdate = true;
icAtualizarLanca(si.gD.clone().applyMatrix4(M), si.pD.map(function (p) { return p.clone().applyMatrix4(M); }));
if (si.tandem) icTandemPose(si.tandem.g.clone().applyMatrix4(M), si.tandem.pt ? si.tandem.pt.clone().applyMatrix4(M) : null);
}
icar.sim.passo = passo; passo();
return { ok: true, malhas: n, trilha: trilha.length };
}
function icMotorArr(v) { return [v.x, -v.z, v.y]; }
function icObbDeMalha(m, invG) {
if (!m.geometry) return null;
if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
m.updateMatrixWorld(true);
var bb = m.geometry.boundingBox, M = new THREE.Matrix4().multiplyMatrices(invG, m.matrixWorld);
var c = bb.getCenter(new THREE.Vector3()).applyMatrix4(M), ex = new THREE.Vector3(), ey = new THREE.Vector3(), ez = new THREE.Vector3();
M.extractBasis(ex, ey, ez);
var sx = ex.length(), sy = ey.length(), sz = ez.length(), sz3 = bb.getSize(new THREE.Vector3());
ex.normalize(); ey.normalize(); ez.normalize();
return { c: icMotorArr(c), e: [icMotorArr(ex), icMotorArr(ey), icMotorArr(ez)], h: [sz3.x * sx / 2, sz3.y * sy / 2, sz3.z * sz / 2] };
}
function icPontoMotor(obj, x, invG) { obj.updateMatrixWorld(true); return icMotorArr(new THREE.Vector3(x, 0, 0).applyMatrix4(obj.matrixWorld).applyMatrix4(invG)); }
function icPartesAgora(invG) {
var q = icar.equip, ge = q.ge, out = [], Mg = new THREE.Matrix4().compose(ge.eqG.position, ge.eqG.quaternion, ge.eqG.scale);
icSincronizar(); ge.eqG.updateMatrixWorld(true);
function loc(v) { return icMotorArr(v.clone().applyMatrix4(Mg)); }
var gch = loc(q.ganchoL.clone().setY(q.ganchoL.y + 0.75)), ponta = loc(q.pontaL);
if (!ge.munck) {
out.push({ quem: 'lança', tipo: 'capsula', a: icPontoMotor(ge.pe, 0, invG), b: icPontoMotor(ge.cabeca, 0, invG), raio: 0.48 });
ge.sup.traverse(function (o) { if (o.isMesh && o.name === 'contrapeso') { var ob = icObbDeMalha(o, invG); if (ob) out.push({ quem: 'contrapeso', tipo: 'obb', obb: ob }); } });
} else {
out.push({ quem: 'braço 1', tipo: 'capsula', a: icPontoMotor(ge.braco1, -0.5, invG), b: icPontoMotor(ge.braco1, 0.5, invG), raio: 0.21 });
out.push({ quem: 'braço 2', tipo: 'capsula', a: icPontoMotor(ge.braco2, -0.5, invG), b: icPontoMotor(ge.braco2, 0.5, invG), raio: 0.17 });
if (ge.ext.visible) out.push({ quem: 'extensão', tipo: 'capsula', a: icPontoMotor(ge.ext, -0.5, invG), b: icPontoMotor(ge.ext, 0.5, invG), raio: 0.12 });
}
out.push({ quem: 'cabo', tipo: 'segmento', a: ponta, b: gch, raio: 0.03 });
(ge.lingas ? ge.lingas.children.filter(function (o) { return o.isLine; }) : []).forEach(function (ln, i) {
var a2 = ln.geometry.attributes.position;
out.push({ quem: 'linga ' + (i + 1), tipo: 'segmento', a: loc(new THREE.Vector3(a2.getX(0), a2.getY(0), a2.getZ(0))), b: loc(new THREE.Vector3(a2.getX(1), a2.getY(1), a2.getZ(1))), raio: 0.02 });
});
var si = icar.sim;
if (si && si.fantasma) {
var bxF = new THREE.Box3(), tmp = new THREE.Box3();
si.fantasma.children.forEach(function (k) { if (!k.geometry || k.visible === false) return; if (!k.geometry.boundingBox) k.geometry.computeBoundingBox(); tmp.copy(k.geometry.boundingBox).applyMatrix4(k.matrix); if (!tmp.isEmpty()) bxF.union(tmp); });
if (!bxF.isEmpty()) {
var M = si.fantasma.matrix, c = bxF.getCenter(new THREE.Vector3()).applyMatrix4(M), sz = bxF.getSize(new THREE.Vector3()), ex = new THREE.Vector3(), ey = new THREE.Vector3(), ez = new THREE.Vector3();
M.extractBasis(ex, ey, ez); ex.normalize(); ey.normalize(); ez.normalize();
out.push({ quem: 'carga', tipo: 'obb', obb: { c: icMotorArr(c), e: [icMotorArr(ex), icMotorArr(ey), icMotorArr(ez)], h: [sz.x / 2, sz.y / 2, sz.z / 2] } });
}
}
return out;
}
function icCaixas(fora, regiao) {
var foraSet = {}; (fora || []).forEach(function (u) { foraSet[u] = 1; });
modelRoot.updateMatrixWorld(true);
var invRoot = new THREE.Matrix4().copy(modelRoot.matrixWorld).invert(), out = [], b3 = new THREE.Box3(), tmp = new THREE.Box3();
(S.elementos || []).forEach(function (el) {
if (foraSet[el.uid]) return;
var ms = malhasDaPeca(el.uid).filter(function (m) { return m.isMesh && m.visible && cadeiaVisivel(m) && m.geometry; });
if (!ms.length) return;
b3.makeEmpty();
ms.forEach(function (m) { m.updateMatrixWorld(true); if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); tmp.copy(m.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(invRoot, m.matrixWorld)); b3.union(tmp); });
var mn = icMotorArr(b3.min), mx = icMotorArr(b3.max), a = [Math.min(mn[0], mx[0]), Math.min(mn[1], mx[1]), Math.min(mn[2], mx[2])], b = [Math.max(mn[0], mx[0]), Math.max(mn[1], mx[1]), Math.max(mn[2], mx[2])];
if (regiao && (a[0] > regiao.max[0] || b[0] < regiao.min[0] || a[1] > regiao.max[1] || b[1] < regiao.min[1])) return;
out.push({ id: el.uid, nome: el.nomeIfc || el.nome || el.familia || el.uid, tipo: el.tipo || '', min: a, max: b });
});
(icar.entorno || []).forEach(function (e) {
var a = e.aabb.min, b = e.aabb.max; if (foraSet[e.id]) return;
if (regiao && (a[0] > regiao.max[0] || b[0] < regiao.min[0] || a[1] > regiao.max[1] || b[1] < regiao.min[1])) return;
out.push({ id: e.id, nome: e.nome, tipo: 'ENTORNO', min: a.slice(), max: b.slice() });
});
return out;
}
function icObstaculos(fora, caixaCaminho, invRoot) {
var foraSet = {}; (fora || []).forEach(function (u) { foraSet[u] = 1; });
var out = [], v = new THREE.Vector3(), b3 = new THREE.Box3(), tmp = new THREE.Box3();
(S.elementos || []).forEach(function (el) {
if (foraSet[el.uid]) return;
var ms = malhasDaPeca(el.uid).filter(function (m) { return m.isMesh && m.visible && cadeiaVisivel(m) && m.geometry; });
if (!ms.length) return;
b3.makeEmpty();
ms.forEach(function (m) { m.updateMatrixWorld(true); if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); tmp.copy(m.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(invRoot, m.matrixWorld)); b3.union(tmp); });
var mn = icMotorArr(b3.min), mx = icMotorArr(b3.max), aabb = { min: [Math.min(mn[0], mx[0]), Math.min(mn[1], mx[1]), Math.min(mn[2], mx[2])], max: [Math.max(mn[0], mx[0]), Math.max(mn[1], mx[1]), Math.max(mn[2], mx[2])] };
if (caixaCaminho && !(aabb.min[0] <= caixaCaminho.max[0] && aabb.max[0] >= caixaCaminho.min[0] && aabb.min[1] <= caixaCaminho.max[1] && aabb.max[1] >= caixaCaminho.min[1] && aabb.min[2] <= caixaCaminho.max[2] && aabb.max[2] >= caixaCaminho.min[2])) return;
var tris = [];
ms.forEach(function (m) {
var g = m.geometry, pos = g.attributes.position, idx = g.index, M = new THREE.Matrix4().multiplyMatrices(invRoot, m.matrixWorld), n = idx ? idx.count : pos.count;
for (var i = 0; i < n; i++) { v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(M); tris.push(v.x, -v.z, v.y); }
});
out.push({ id: el.uid, nome: el.nomeIfc || el.nome || el.familia || el.uid, aabb: aabb, tris: tris });
});
return out;
}
function icVisada(o) {
if (!window.IcarColisao || !IcarColisao.visada) return { ok: false, erro: 'motor de colisões não carregado' };
if (!o || !o.olho || !o.alvo) return { ok: false, erro: 'sem o olho ou o alvo' };
modelRoot.updateMatrixWorld(true);
var invRoot = new THREE.Matrix4().copy(modelRoot.matrixWorld).invert(), a = [+o.olho.x, +o.olho.y, +o.olho.z], b = [+o.alvo.x, +o.alvo.y, +o.alvo.z];
var cx = { min: [Math.min(a[0], b[0]) - 0.5, Math.min(a[1], b[1]) - 0.5, Math.min(a[2], b[2]) - 0.5], max: [Math.max(a[0], b[0]) + 0.5, Math.max(a[1], b[1]) + 0.5, Math.max(a[2], b[2]) + 0.5] };
var obst = icObstaculos(o.uids || [], cx, invRoot);
(icar.entorno || []).forEach(function (e) { var q = e.aabb; if (q.min[0] <= cx.max[0] && q.max[0] >= cx.min[0] && q.min[1] <= cx.max[1] && q.max[1] >= cx.min[1] && q.min[2] <= cx.max[2] && q.max[2] >= cx.min[2]) obst.push(e); });
var r = IcarColisao.visada(a, b, obst, { folgaAlvo: o.folgaAlvo });
r.ok = true; r.olho = { x: a[0], y: a[1], z: a[2] }; r.alvo = { x: b[0], y: b[1], z: b[2] }; r.obstaculos = obst.length;
return r;
}
function icColisoes(opts) {
opts = opts || {};
var q = icar.equip, si = icar.sim;
if (!q || !q.ge || !si || !window.IcarColisao) return { ok: false, erro: !q || !q.ge ? 'equipamento articulado não desenhado' : !si ? 'sem a simulação' : 'motor de colisões não carregado' };
icSincronizar();
var invG = new THREE.Matrix4().copy(icar.grupo.matrixWorld).invert(), invRoot = new THREE.Matrix4().copy(modelRoot.matrixWorld).invert();
var N = Math.max(6, Math.min(120, +opts.amostras || 60)), amostras = [], t0 = performance.now(), tVolta = si.t;
for (var k = 0; k <= N; k++) {
var t = k / N, M = si.estado(t);
si.fantasma.matrix.copy(M); si.fantasma.matrixWorldNeedsUpdate = true;
icPoseGerada(si.gD.clone().applyMatrix4(M), si.pD.map(function (p) { return p.clone().applyMatrix4(M); }));
amostras.push({ t: t, partes: icPartesAgora(invG) });
}
var folga = +opts.folga >= 0 ? +opts.folga : 0.5, cx = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
amostras.forEach(function (am) { am.partes.forEach(function (pt) { var b = IcarColisao.aabbParte(pt, folga); for (var i = 0; i < 3; i++) { cx.min[i] = Math.min(cx.min[i], b.min[i]); cx.max[i] = Math.max(cx.max[i], b.max[i]); } }); });
var obst = icObstaculos(opts.uids || [], cx, invRoot);
(icar.entorno || []).forEach(function (e) {
var a = e.aabb; if (a.min[0] <= cx.max[0] && a.max[0] >= cx.min[0] && a.min[1] <= cx.max[1] && a.max[1] >= cx.min[1] && a.min[2] <= cx.max[2] && a.max[2] >= cx.min[2]) obst.push(e);
});
var ignorar = {};
[amostras[0], amostras[amostras.length - 1]].forEach(function (am) {
var r0 = IcarColisao.verificar([{ t: am.t, partes: am.partes.filter(function (pt) { return pt.quem === 'carga' || /^linga/.test(pt.quem); }) }], obst, [], { folga: 0.02 });
r0.eventos.forEach(function (ev) { (ignorar[ev.quem] = ignorar[ev.quem] || []).indexOf(ev.id) < 0 && ignorar[ev.quem].push(ev.id); });
});
var res = IcarColisao.verificar(amostras, obst, opts.redes || [], { folga: folga, ignorar: ignorar });
res.ok = true; res.amostras = amostras.length; res.obstaculos = obst.length; res.ms = Math.round(performance.now() - t0); res.ignorados = ignorar;
if (opts.debug) res.debug = { obst: obst.map(function (o) { return { nome: o.nome, id: o.id, aabb: o.aabb, ntri: o.tris.length / 9 }; }), caixa: cx, ultimo: amostras[amostras.length - 1].partes.map(function (pt) { return { quem: pt.quem, obb: pt.obb || null, a: pt.a || null, b: pt.b || null }; }),
elementos: (S.elementos || []).filter(function (e) { return /^p3d/.test(e.uid); }).map(function (e) { return { uid: e.uid, malhas: malhasDaPeca(e.uid).length, vis: malhasDaPeca(e.uid).map(function (m) { return m.visible && cadeiaVisivel(m); }) }; }) };
si.t = tVolta; si.passo();
icar.colisao = res;
return res;
}
function icSincronizar() { modelRoot.updateMatrixWorld(); icar.grupo.matrix.copy(modelRoot.matrixWorld); icar.grupo.matrixWorldNeedsUpdate = true; icar.grupo.updateMatrixWorld(true); }
var icMapaG = new THREE.Group(); icMapaG.name = 'agente-mapa-g'; icMapaG.matrixAutoUpdate = false; scene.add(icMapaG);
S._tickExtra.push(function () { if (!icMapaG.children.length) return; modelRoot.updateMatrixWorld(); icMapaG.matrix.copy(modelRoot.matrixWorld); icMapaG.matrixWorldNeedsUpdate = true; });
function icMapa(mp) {
while (icMapaG.children.length) { var o = icMapaG.children.pop(); icDescartar(o); }
if (!mp || !mp.pontos || !mp.pontos.length) return { ok: true, n: 0 };
var lado = Math.max(0.2, (+mp.passo || 1) * 0.9), nM = mp.pontos.length, yM = icL({ x: 0, y: 0, z: +mp.z || 0 }).y + 0.035;
var gM = new THREE.PlaneGeometry(lado, lado); gM.rotateX(-Math.PI / 2);
var imM = new THREE.InstancedMesh(gM, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide }), nM);
var mtx = new THREE.Matrix4(), corM = new THREE.Color(), contM = { verde: 0, ambar: 0, cinza: 0 };
mp.pontos.forEach(function (q, i) {
var v = icL({ x: q.x, y: q.y, z: 0 }); mtx.makeTranslation(v.x, yM, v.z); imM.setMatrixAt(i, mtx);
var k = !q.cabe ? 'cinza' : q.n >= mp.total ? 'verde' : 'ambar'; contM[k]++;
corM.setHex(k === 'verde' ? 0x16a34a : k === 'ambar' ? 0xeab308 : 0x9ca3af); imM.setColorAt(i, corM);
});
imM.instanceMatrix.needsUpdate = true; if (imM.instanceColor) imM.instanceColor.needsUpdate = true;
imM.name = 'agente-mapa'; imM.userData.contagem = contM; imM.renderOrder = 990; icMapaG.add(imM);
modelRoot.updateMatrixWorld(); icMapaG.matrix.copy(modelRoot.matrixWorld); icMapaG.matrixWorldNeedsUpdate = true;
return { ok: true, n: nM, contagem: contM };
}
var icPlantaG = new THREE.Group(); icPlantaG.name = 'planta-g'; icPlantaG.matrixAutoUpdate = false; scene.add(icPlantaG);
S._tickExtra.push(function () { if (!icPlantaG.children.length) return; modelRoot.updateMatrixWorld(); icPlantaG.matrix.copy(modelRoot.matrixWorld); icPlantaG.matrixWorldNeedsUpdate = true; });
function icMatPlanta(cal, cota) {
var c = Math.cos(cal.r), sn = Math.sin(cal.r), s = cal.s;
return new THREE.Matrix4().set(s * c, -s * sn, 0, cal.t.x, 0, 0, 1, cota, -s * sn, -s * c, 0, -cal.t.y, 0, 0, 0, 1);
}
var IC_M_MOTOR = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);
var icTexs = {};
function icTexGrao(nome, base, cores, passo) {
if (!icTexs[nome]) {
var cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
var x = cv.getContext('2d'), s = 7;
function rnd() { s = (s * 16807) % 2147483647; return s / 2147483647; }
x.fillStyle = base; x.fillRect(0, 0, 128, 128);
for (var i = 0; i < 2600; i++) { x.globalAlpha = 0.3 + 0.45 * rnd(); x.fillStyle = cores[Math.floor(rnd() * cores.length)]; x.fillRect(Math.floor(rnd() * 128), Math.floor(rnd() * 128), 1 + Math.floor(rnd() * 2), 1 + Math.floor(rnd() * 2)); }
x.globalAlpha = 1;
var t = texSRGB(new THREE.CanvasTexture(cv)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / passo, 1 / passo);
icTexs[nome] = t;
}
return icTexs[nome];
}
function icMatGrao(nome, base, cores, passo, extra) {
var o = { map: icTexGrao(nome, base, cores, passo), roughness: 0.95, metalness: 0 };
for (var k in extra || {}) o[k] = extra[k];
var m = new THREE.MeshStandardMaterial(o); m.userData.texCompartilhada = true; m.userData.grao = nome; return m;
}
var icTexFachada = null;
function icFachada() {
if (!icTexFachada) {
var cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
var x = cv.getContext('2d'); x.fillStyle = '#e7e2d6'; x.fillRect(0, 0, 128, 128);
var k = 128 / 3; x.fillStyle = '#5b6b7a'; x.fillRect(0.9 * k, 128 - 2.4 * k, 1.2 * k, 1.4 * k);
x.fillStyle = '#cfd8e3'; x.fillRect(0.9 * k + 2, 128 - 2.4 * k + 2, 1.2 * k - 4, 3);
icTexFachada = texSRGB(new THREE.CanvasTexture(cv)); icTexFachada.wrapS = icTexFachada.wrapT = THREE.RepeatWrapping; icTexFachada.repeat.set(1 / 3, 1 / 3);
}
var m = new THREE.MeshStandardMaterial({ map: icTexFachada, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
m.userData.fachada = true; m.userData.texCompartilhada = true; return m;
}
icar.entorno = [];
function icPlanta(cfg) {
while (icPlantaG.children.length) { var o = icPlantaG.children.pop(); icDescartar(o); }
icar.entorno = [];
var out = { ok: true, plano: false, linhas: 0, volumes: 0, propostas: 0, agua: 0 };
if (!cfg) return out;
var op = cfg.opacidade == null ? 0.6 : Math.max(0, Math.min(1, +cfg.opacidade));
if (cfg.cal && (cfg.imagem || (cfg.segmentos && cfg.segmentos.length))) {
if (cfg.imagem && cfg.largura > 0 && cfg.altura > 0) {
var tx = texSRGB(cfg.imagem.getContext ? new THREE.CanvasTexture(cfg.imagem) : new THREE.Texture(cfg.imagem)); tx.needsUpdate = true;
var gP = new THREE.PlaneGeometry(+cfg.largura, +cfg.altura); gP.translate(+cfg.largura / 2, +cfg.altura / 2, 0);
var mP = new THREE.Mesh(gP, new THREE.MeshBasicMaterial({ map: tx, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }));
mP.matrixAutoUpdate = false; mP.matrix.copy(icMatPlanta(cfg.cal, (+cfg.cota || 0) + 0.005)); mP.name = 'planta-imagem'; mP.renderOrder = 1; icPlantaG.add(mP); out.plano = true;
}
if (cfg.segmentos && cfg.segmentos.length && !cfg.imagem) {
var sg = cfg.segmentos, arr = new Float32Array(sg.length * 6);
sg.forEach(function (s, i) { arr[i * 6] = s.x1; arr[i * 6 + 1] = s.y1; arr[i * 6 + 2] = 0; arr[i * 6 + 3] = s.x2; arr[i * 6 + 4] = s.y2; arr[i * 6 + 5] = 0; });
var gL = new THREE.BufferGeometry(); gL.setAttribute('position', new THREE.BufferAttribute(arr, 3));
var lL = new THREE.LineSegments(gL, new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: Math.max(0.35, op), depthWrite: false }));
lL.matrixAutoUpdate = false; lL.matrix.copy(icMatPlanta(cfg.cal, (+cfg.cota || 0) + 0.01)); lL.name = 'planta-linhas'; lL.renderOrder = 1; icPlantaG.add(lL); out.linhas = sg.length;
}
}
(cfg.volumes || []).forEach(function (v, i) {
var pts = v.poligono; if (!pts || pts.length < 3) return;
var agua = v.tipo === 'agua', alt = agua ? 0.05 : Math.max(0.05, +v.altura || 0), base = +v.base || 0;
var gV = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(function (q) { return new THREE.Vector2(+q[0], +q[1]); })), { depth: alt, bevelEnabled: false });
gV.translate(0, 0, base);
var mat = v.proposta ? new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide })
: agua ? new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide })
: v.tipo === 'edificacao' ? [icMat(0x9ca3af, 0.95), icFachada()] : v.tipo === 'muro' ? icMat(0xa8a29e, 0.95) : icMat(0xcbd5e1, 0.92);
var mV = new THREE.Mesh(gV, mat); mV.matrixAutoUpdate = false; mV.matrix.copy(IC_M_MOTOR); mV.name = v.proposta ? 'planta-proposta' : agua ? 'entorno-agua' : 'entorno'; mV.userData.idx = i; icPlantaG.add(mV);
var eV = new THREE.LineSegments(new THREE.EdgesGeometry(gV), new THREE.LineBasicMaterial({ color: v.proposta ? 0xc2410c : agua ? 0x0284c7 : 0x64748b }));
eV.matrixAutoUpdate = false; eV.matrix.copy(IC_M_MOTOR); icPlantaG.add(eV);
if (v.proposta) { out.propostas++; return; }
if (agua) { out.agua++; return; }
out.volumes++;
var pa = gV.attributes.position, tris = [], mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], idx = gV.index, nT = idx ? idx.count : pa.count;
for (var k = 0; k < nT; k++) { var j = idx ? idx.getX(k) : k, x = pa.getX(j), y = pa.getY(j), z = pa.getZ(j); tris.push(x, y, z); if (x < mn[0]) mn[0] = x; if (y < mn[1]) mn[1] = y; if (z < mn[2]) mn[2] = z; if (x > mx[0]) mx[0] = x; if (y > mx[1]) mx[1] = y; if (z > mx[2]) mx[2] = z; }
icar.entorno.push({ id: 'entorno:' + (v.id || i), nome: v.nome || ('Entorno ' + (i + 1)), aabb: { min: mn, max: mx }, tris: tris });
});
if (cfg.limite && cfg.limite.length >= 2) {
var yLi = icL({ x: 0, y: 0, z: +cfg.cotaLimite || 0 }).y + 0.04, ptsLi = cfg.limite.map(function (q) { return icL({ x: +q[0], y: +q[1], z: 0 }).setY(yLi); });
var lnLi = icLinha(cfg.limiteAberto ? ptsLi : ptsLi.concat([ptsLi[0]]), 0x16a34a, 0.4); lnLi.name = 'agente-limite'; icPlantaG.add(lnLi); out.limite = cfg.limite.length;
}
modelRoot.updateMatrixWorld(); icPlantaG.matrix.copy(modelRoot.matrixWorld); icPlantaG.matrixWorldNeedsUpdate = true;
return out;
}
function icPlantaPonto(px, py) {
var m = icPlantaG.getObjectByName('planta-imagem') || icPlantaG.getObjectByName('planta-linhas'); if (!m) return null;
var v = new THREE.Vector3(px, py, 0).applyMatrix4(m.matrix); return icM(v);
}
var icLocalG = new THREE.Group(); icLocalG.name = 'local-g'; icLocalG.matrixAutoUpdate = false; scene.add(icLocalG);
var icLocalMundo = new THREE.Group(); icLocalMundo.name = 'local-mundo'; scene.add(icLocalMundo);
var icLocalEst = { chuva: null, nevoa: undefined, nevoaVis: 0, sol: null };
function icLocalCaixa() {
var b = new THREE.Box3(); modelRoot.updateMatrixWorld(); try { b.setFromObject(modelRoot); } catch (_) {}
if (b.isEmpty()) b.set(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 10, 10));
return b;
}
function icMotorDirMundo(mx, my, mz) { modelRoot.updateMatrixWorld(); return icL({ x: mx, y: my, z: mz }).transformDirection(modelRoot.matrixWorld); }
function icEnuMotor(e, n, norte) { var t = (+norte || 0) * Math.PI / 180; return { x: e * Math.cos(t) - n * Math.sin(t), y: e * Math.sin(t) + n * Math.cos(t) }; }
function icLocal(cfg) {
while (icLocalG.children.length) icDescartar(icLocalG.children.pop());
while (icLocalMundo.children.length) icDescartar(icLocalMundo.children.pop());
icLocalEst.chuva = null;
cfg = cfg || {};
var out = { ok: true, imagem: false, relevo: 0, ruas: 0, verdes: 0, postes: 0, redes: 0, sol: false, neblina: false, chuva: 0, vento: false };
var im = cfg.imagem;
if (im && im.canvas && im.cantos && im.cantos.length === 4) {
var zI = (+im.z || 0) + 0.004, c4 = im.cantos, gI = new THREE.BufferGeometry();
gI.setAttribute('position', new THREE.Float32BufferAttribute([+c4[0][0], +c4[0][1], zI, +c4[1][0], +c4[1][1], zI, +c4[2][0], +c4[2][1], zI, +c4[3][0], +c4[3][1], zI], 3));
gI.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2)); gI.setIndex([0, 3, 2, 0, 2, 1]);
var tI = texSRGB(new THREE.CanvasTexture(im.canvas)); tI.needsUpdate = true;
var mI = new THREE.Mesh(gI, new THREE.MeshBasicMaterial({ map: tI, transparent: true, opacity: im.opacidade == null ? 0.9 : +im.opacidade, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 }));
mI.matrixAutoUpdate = false; mI.matrix.copy(IC_M_MOTOR); mI.name = 'local-imagem'; mI.renderOrder = 0; icLocalG.add(mI); out.imagem = true;
}
var lv = cfg.levantamento;
if (lv && lv.pos && lv.idx && lv.pos.length >= 9) {
var gL2 = new THREE.BufferGeometry(); gL2.setAttribute('position', new THREE.Float32BufferAttribute(lv.pos, 3)); gL2.setIndex(lv.idx); gL2.computeVertexNormals();
var mL2 = new THREE.Mesh(gL2, new THREE.MeshStandardMaterial({ color: 0xb59466, roughness: 0.95, metalness: 0, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 }));
mL2.matrixAutoUpdate = false; mL2.matrix.copy(IC_M_MOTOR); mL2.name = 'local-levantamento'; icLocalG.add(mL2); out.levantamento = lv.pos.length / 3;
}
if (cfg.curvas && cfg.curvas.length) {
var arrC = new Float32Array(cfg.curvas.length * 6);
cfg.curvas.forEach(function (s, i) { arrC[i * 6] = s[0]; arrC[i * 6 + 1] = s[1]; arrC[i * 6 + 2] = s[4] + 0.02; arrC[i * 6 + 3] = s[2]; arrC[i * 6 + 4] = s[3]; arrC[i * 6 + 5] = s[4] + 0.02; });
var gC2 = new THREE.BufferGeometry(); gC2.setAttribute('position', new THREE.BufferAttribute(arrC, 3));
var lC2 = new THREE.LineSegments(gC2, new THREE.LineBasicMaterial({ color: 0x6b4f2a, transparent: true, opacity: 0.85, depthWrite: false }));
lC2.matrixAutoUpdate = false; lC2.matrix.copy(IC_M_MOTOR); lC2.name = 'local-curvas'; lC2.renderOrder = 2; icLocalG.add(lC2); out.curvas = cfg.curvas.length;
}
var rl = cfg.relevo;
if (rl && rl.pos && rl.idx && rl.pos.length >= 9) {
var gR = new THREE.BufferGeometry(); gR.setAttribute('position', new THREE.Float32BufferAttribute(rl.pos, 3)); gR.setIndex(rl.idx); gR.computeVertexNormals();
var mR = new THREE.Mesh(gR, new THREE.MeshStandardMaterial({ color: 0x9ca38f, roughness: 0.95, metalness: 0, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 }));
mR.matrixAutoUpdate = false; mR.matrix.copy(IC_M_MOTOR); mR.name = 'local-relevo'; icLocalG.add(mR);
var wR = new THREE.LineSegments(new THREE.WireframeGeometry(gR), new THREE.LineBasicMaterial({ color: 0x6b7280, transparent: true, opacity: 0.16, depthWrite: false }));
wR.matrixAutoUpdate = false; wR.matrix.copy(IC_M_MOTOR); icLocalG.add(wR);
out.relevo = rl.pos.length / 3;
}
function polilinha(pts, cor, nome, fechar, trac) {
var v = pts.map(function (q) { return icL({ x: +q[0], y: +q[1], z: (q[2] != null ? +q[2] : 0) + 0.03 }); }); if (v.length < 2) return null;
if (fechar) v.push(v[0].clone());
var l = icLinha(v, cor, trac || null); l.material.depthTest = true; l.renderOrder = 1; l.name = nome; icLocalG.add(l); return l;
}
(cfg.ruas || []).forEach(function (r) {
if (r.faixa && r.faixa.length >= 4) {
var gF = new THREE.ShapeGeometry(new THREE.Shape(r.faixa.map(function (q) { return new THREE.Vector2(+q[0], +q[1]); })));
gF.translate(0, 0, (+r.z || 0) + 0.015);
var mF = new THREE.Mesh(gF, icMatGrao('asfalto', '#2e3236', ['#1d2024', '#3c4045', '#282b2f', '#4a4e53'], 4, { roughness: 0.92, transparent: true, opacity: 0.92, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
mF.matrixAutoUpdate = false; mF.matrix.copy(IC_M_MOTOR); mF.name = 'local-rua-faixa'; icLocalG.add(mF); out.faixas = (out.faixas || 0) + 1;
}
if (polilinha(r.pontos || [], r.faixa ? 0xe5e7eb : 0x475569, 'local-rua', false, r.faixa ? 1.5 : 0)) out.ruas++;
});
var arv = cfg.arvores || [];
if (arv.length) {
var gT = new THREE.CylinderGeometry(0.12, 0.16, 2.2, 6); gT.translate(0, 1.1, 0);
var gCp = new THREE.SphereGeometry(1.6, 8, 6); gCp.translate(0, 3.4, 0);
var iT = new THREE.InstancedMesh(gT, new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 1 }), arv.length), iC = new THREE.InstancedMesh(gCp, new THREE.MeshStandardMaterial({ color: 0x4d7c3a, roughness: 1 }), arv.length);
var mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), ss = new THREE.Vector3();
arv.forEach(function (a, i) { var pz = icL({ x: +a.x, y: +a.y, z: +a.z || 0 }), e = +a.escala || 1; ss.set(e, e, e); mm.compose(pz, qq, ss); iT.setMatrixAt(i, mm); iC.setMatrixAt(i, mm); });
iT.name = 'local-arvores'; iC.name = 'local-arvores-copa'; icLocalG.add(iT); icLocalG.add(iC); out.arvores = arv.length;
}
(cfg.verdes || []).forEach(function (r) {
var pg = r.poligono || [];
if (pg.length >= 3) {
var zg = 0; pg.forEach(function (q) { zg += q[2] != null ? +q[2] : 0; });
var gG = new THREE.ShapeGeometry(new THREE.Shape(pg.map(function (q) { return new THREE.Vector2(+q[0], +q[1]); })));
gG.translate(0, 0, zg / pg.length + 0.012);
var mG = new THREE.Mesh(gG, icMatGrao('grama', '#5e8a3a', ['#4a7330', '#6f9c45', '#3f6428', '#83ad52'], 3, { transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
mG.matrixAutoUpdate = false; mG.matrix.copy(IC_M_MOTOR); mG.name = 'local-gramado'; icLocalG.add(mG); out.gramados = (out.gramados || 0) + 1;
}
if (polilinha(pg, 0x16a34a, 'local-verde', true)) out.verdes++;
});
(cfg.redes || []).forEach(function (r) { if (r.a && r.b && polilinha([r.a, r.b], 0xeab308, 'local-rede', false, 0.6)) out.redes++; });
(cfg.postes || []).forEach(function (p) {
var gP = new THREE.CylinderGeometry(0.12, 0.12, 1.5, 8); gP.translate(0, 0.75, 0);
var mP = new THREE.Mesh(gP, icMat(0xca8a04)); mP.position.copy(icL({ x: +p.x, y: +p.y, z: +p.z || 0 })); mP.name = 'local-poste'; icLocalG.add(mP); out.postes++;
});
var sol = cfg.sol;
if (sol && isFinite(+sol.elevacao) && isFinite(+sol.azimute)) {
if (!icLocalEst.sol) icLocalEst.sol = { pos: dir.position.clone(), int: dir.intensity, hemi: hemi.intensity };
var el = +sol.elevacao * Math.PI / 180, az = +sol.azimute * Math.PI / 180, q = icEnuMotor(Math.cos(el) * Math.sin(az), Math.cos(el) * Math.cos(az), sol.norte);
var dS = icMotorDirMundo(q.x, q.y, Math.sin(el)).normalize();
dir.position.copy(dir.target.position).addScaledVector(dS, 100);
dir.intensity = el > 0 ? 0.3 + 0.8 * Math.min(1, Math.sin(el) * 2.5) : 0.05;
hemi.intensity = el > 0 ? icLocalEst.sol.hemi : icLocalEst.sol.hemi * 0.45;
out.sol = true; out.solDir = { x: dS.x, y: dS.y, z: dS.z };
} else if (icLocalEst.sol) { dir.position.copy(icLocalEst.sol.pos); dir.intensity = icLocalEst.sol.int; hemi.intensity = icLocalEst.sol.hemi; icLocalEst.sol = null; }
var cl = cfg.clima;
if (cl && +cl.neblina >= 20) {
if (icLocalEst.nevoa === undefined) icLocalEst.nevoa = scene.fog;
icLocalEst.nevoaVis = +cl.neblina >= 80 ? 40 : +cl.neblina >= 50 ? 120 : 400;
scene.fog = new THREE.Fog(0xd7dde3, 1, 1000); out.neblina = true;
} else if (icLocalEst.nevoa !== undefined) { scene.fog = icLocalEst.nevoa; icLocalEst.nevoa = undefined; icLocalEst.nevoaVis = 0; }
if (cl && +cl.chuva > 0.1) {
var bx = icLocalCaixa(), c = bx.getCenter(new THREE.Vector3()), sz = bx.getSize(new THREE.Vector3()), R = Math.max(sz.x, sz.z) * 0.7 + 6, H = sz.y + 18;
var nP = Math.min(6000, Math.round(500 + +cl.chuva * 500)), arr = new Float32Array(nP * 3);
for (var k = 0; k < nP; k++) { arr[k * 3] = c.x + (Math.random() * 2 - 1) * R; arr[k * 3 + 1] = bx.min.y + Math.random() * H; arr[k * 3 + 2] = c.z + (Math.random() * 2 - 1) * R; }
var gC = new THREE.BufferGeometry(); gC.setAttribute('position', new THREE.BufferAttribute(arr, 3));
var pC = new THREE.Points(gC, new THREE.PointsMaterial({ color: 0x60a5fa, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.75, depthWrite: false }));
pC.name = 'local-chuva'; pC.userData = { y0: bx.min.y, y1: bx.min.y + H, v: 8 }; icLocalMundo.add(pC); icLocalEst.chuva = pC; out.chuva = nP;
}
if (cl && isFinite(+cl.ventoMs) && cl.ventoDir != null && isFinite(+cl.ventoDir)) {
var bv = icLocalCaixa(), topo = new THREE.Vector3((bv.min.x + bv.max.x) / 2, bv.max.y + 3, (bv.min.z + bv.max.z) / 2), pr = (+cl.ventoDir + 180) * Math.PI / 180;
var qv = icEnuMotor(Math.sin(pr), Math.cos(pr), cl.norte), dV = icMotorDirMundo(qv.x, qv.y, 0).normalize(), L = 3 + Math.min(20, +cl.ventoMs);
var o0 = topo.clone().addScaledVector(dV, -L / 2), corV = cl.estado === 'bloqueado' ? 0xdc2626 : cl.estado === 'atencao' ? 0xd97706 : 0x0284c7;
var aV = new THREE.ArrowHelper(dV, o0, L, corV, L * 0.25, L * 0.12); aV.name = 'local-vento'; icLocalMundo.add(aV);
var sV = labelSprite('vento ' + Math.round(+cl.ventoMs) + ' m/s'); sV.position.copy(o0); icLocalMundo.add(sV); out.vento = true;
}
if (out.sol) {
var ceu = new Sky(); ceu.name = 'local-ceu'; ceu.userData.foraDaFoto = true; ceu.frustumCulled = false; ceu.renderOrder = -10;
ceu.material.fragmentShader = ceu.material.fragmentShader.replace('#include <encodings_fragment>', '').replace('#include <colorspace_fragment>', '');
var un = ceu.material.uniforms, turvo = !!(cl && (+cl.chuva > 0.1 || +cl.neblina >= 20));
un.turbidity.value = turvo ? 14 : 4; un.rayleigh.value = turvo ? 0.6 : 1.6; un.mieCoefficient.value = 0.005; un.mieDirectionalG.value = 0.8;
un.sunPosition.value.copy(dS);
ceu.scale.setScalar(450000);
icLocalMundo.add(ceu); out.ceu = true;
}
modelRoot.updateMatrixWorld(); icLocalG.matrix.copy(modelRoot.matrixWorld); icLocalG.matrixWorldNeedsUpdate = true;
return out;
}
S._tickExtra.push(function (dt) {
if (icLocalG.children.length) { modelRoot.updateMatrixWorld(); icLocalG.matrix.copy(modelRoot.matrixWorld); icLocalG.matrixWorldNeedsUpdate = true; }
var ch = icLocalEst.chuva;
if (ch) {
var pa = ch.geometry.attributes.position, u = ch.userData, s = dt > 0 && dt < 0.25 ? dt : 0.016;
for (var k = 0; k < pa.count; k++) { var y = pa.getY(k) - u.v * s; pa.setY(k, y < u.y0 ? u.y1 : y); }
pa.needsUpdate = true;
}
if (icLocalEst.nevoaVis && scene.fog) { var D = camera.position.distanceTo(orbit.target); scene.fog.near = D * 0.6; scene.fog.far = D + icLocalEst.nevoaVis; }
});
var IC_G3_VENDOR = new URL('../bim/vendor/', import.meta.url).href, IC_G3_LOGO = new URL('../img/terceiros/GoogleMaps_Logo_WithDarkOutline.svg', import.meta.url).href;
var icG3 = { on: false, mod: null, tiles: null, draco: null, cfg: null, zDesloc: 0, hChao: null, buscas: 0, ultBusca: 0, selo: null, erro: null, carregados: 0, planos: null, clipAntes: null, versao: 0, quadros: 0 };
var icG3G = new THREE.Group(); icG3G.name = 'google-3d'; icG3G.matrixAutoUpdate = false; scene.add(icG3G);
var icG3Ray = new THREE.Raycaster();
function icG3Carregar() {
if (icG3.mod) return Promise.resolve(icG3.mod);
return Promise.all([import('../bim/vendor/3dtiles/three/TilesRenderer.js'), import('../bim/vendor/3dtiles/three/plugins/GoogleCloudAuthPlugin.js'),
import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/loaders/DRACOLoader.js')])
.then(function (m) { icG3.mod = { TilesRenderer: m[0].TilesRenderer, Auth: m[1].GoogleCloudAuthPlugin, GLTFLoader: m[2].GLTFLoader, DRACOLoader: m[3].DRACOLoader }; return icG3.mod; });
}
function icG3Matriz() {
var c = icG3.cfg; if (!c || !window.IcarGeo) return;
var M = new THREE.Matrix4().fromArray(IcarGeo.matrizEcefMotor({ lat: +c.lat, lon: +c.lon, x0: +c.x0 || 0, y0: +c.y0 || 0, norte: +c.norte || 0 }, icG3.zDesloc + (+c.ajuste || 0)));
modelRoot.updateMatrixWorld();
icG3G.matrix.copy(modelRoot.matrixWorld).multiply(IC_M_MOTOR).multiply(M); icG3G.matrixWorldNeedsUpdate = true; icG3G.updateMatrixWorld(true);
}
function icG3Planos() {
var b = icLocalCaixa(), mg = 3;
return [new THREE.Plane(new THREE.Vector3(1, 0, 0), -(b.max.x + mg)), new THREE.Plane(new THREE.Vector3(-1, 0, 0), b.min.x - mg),
new THREE.Plane(new THREE.Vector3(0, 0, 1), -(b.max.z + mg)), new THREE.Plane(new THREE.Vector3(0, 0, -1), b.min.z - mg)];
}
function icG3RecorteEm(obj) {
var pl = icG3.cfg && icG3.cfg.recortar !== false ? icG3.planos : null;
obj.traverse(function (o) { if (!o.material) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.clippingPlanes = pl; m.clipIntersection = true; m.needsUpdate = true; }); });
}
function icG3AplicarRecorte() { icG3.planos = icG3Planos(); if (icG3.tiles) icG3RecorteEm(icG3.tiles.group); }
var IC_G3_ERRO_MAX = 15;
function icG3AcharChao() {
var c = icG3.cfg, t = icG3.tiles; if (!c || !t) return false;
var porCena = new Map(); if (t.visibleTiles) t.visibleTiles.forEach(function (tl) { if (tl && tl.cached && tl.cached.scene) porCena.set(tl.cached.scene, +tl.geometricError || 0); });
function erroDo(o) { for (var q = o; q; q = q.parent) { if (porCena.has(q)) return porCena.get(q); } return Infinity; }
var b = icLocalCaixa(), inv = new THREE.Matrix4().copy(modelRoot.matrixWorld).invert();
var ctrM = icM(b.getCenter(new THREE.Vector3()).applyMatrix4(inv)), R = Math.max(10, b.getSize(new THREE.Vector3()).setY(0).length() / 2 + 5), zs = [];
for (var k = 0; k < 36; k++) {
var a = (k % 12) / 12 * Math.PI * 2 + Math.floor(k / 12) * 0.26, Rk = R * [1, 1.6, 2.4][Math.floor(k / 12)], px = ctrM.x + Rk * Math.cos(a), py = ctrM.y + Rk * Math.sin(a);
var topo = icL({ x: px, y: py, z: (+c.zChao || 0) + 3000 }).applyMatrix4(modelRoot.matrixWorld), fundo = icL({ x: px, y: py, z: (+c.zChao || 0) - 3000 }).applyMatrix4(modelRoot.matrixWorld);
icG3Ray.set(topo, fundo.clone().sub(topo).normalize()); icG3Ray.far = 6000;
var hs = []; try { hs = icG3Ray.intersectObject(t.group, true); } catch (_) {}
hs = hs.filter(function (h) { return erroDo(h.object) <= IC_G3_ERRO_MAX; });
if (hs.length) { hs.sort(function (p, q) { return p.distance - q.distance; }); zs.push(icM(hs[0].point.clone().applyMatrix4(inv)).z); }
}
if (zs.length < 3) return false;
zs.sort(function (p, q) { return p - q; });
var zAchado = zs[Math.floor(zs.length * 0.2)], u = zAchado - (icG3.zDesloc + (+c.ajuste || 0));
icG3.hChao = Math.round(u * 100) / 100; icG3.zDesloc = (+c.zChao || 0) - u; icG3.buscas++;
return true;
}
function icG3Selo() {
var el = icG3.selo;
if (!el) {
el = document.createElement('div'); el.setAttribute('data-google-selo', '1');
el.style.cssText = 'position:absolute;left:8px;bottom:8px;z-index:6;display:none;align-items:center;gap:6px;padding:3px 8px;border-radius:6px;background:rgba(15,23,42,.6);color:#fff;font:11px/1.3 system-ui,sans-serif;pointer-events:none;max-width:72%';
el.innerHTML = '<img alt="Google Maps" style="height:16px;width:auto;display:block" src="' + IC_G3_LOGO + '"><span data-g3-cred></span>';
var pai = renderer.domElement.parentElement || document.body; if (pai !== document.body && getComputedStyle(pai).position === 'static') pai.style.position = 'relative';
pai.appendChild(el); icG3.selo = el;
}
var at = []; try { if (icG3.tiles) icG3.tiles.getAttributions(at); } catch (_) {}
var txt = at.filter(function (a) { return a.type === 'string' && a.value; }).map(function (a) { return a.value; }).join('; ');
el.querySelector('[data-g3-cred]').textContent = txt;
el.style.display = icG3.on ? 'flex' : 'none';
}
function icG3Desligar() {
icG3.versao++;
if (icG3.tiles) { try { icG3G.remove(icG3.tiles.group); icG3.tiles.dispose(); } catch (_) {} icG3.tiles = null; }
if (icG3.draco) { try { icG3.draco.dispose(); } catch (_) {} icG3.draco = null; }
icG3.on = false; icG3.cfg = null; icG3.carregados = 0; icG3.hChao = null; icG3.buscas = 0;
if (icG3.selo) icG3.selo.style.display = 'none';
if (icG3.clipAntes != null) { renderer.localClippingEnabled = icG3.clipAntes; icG3.clipAntes = null; }
}
function icGoogle3d(cfg) {
if (!cfg || cfg.ligar === false) { icG3Desligar(); return Promise.resolve({ ok: true, ligado: false }); }
if (!cfg.chave) return Promise.resolve({ ok: false, erro: 'sem a chave do Google' });
if (!(isFinite(+cfg.lat) && isFinite(+cfg.lon))) return Promise.resolve({ ok: false, erro: 'a obra ainda não foi localizada' });
if (icG3.on && icG3.cfg && icG3.cfg.chave === cfg.chave && +icG3.cfg.lat === +cfg.lat && +icG3.cfg.lon === +cfg.lon) {
var recAntes = icG3.cfg.recortar !== false; icG3.cfg = cfg;
if (recAntes !== (cfg.recortar !== false)) icG3AplicarRecorte();
if (cfg.reajustar) { icG3.buscas = 0; icG3.ultBusca = 0; }
return Promise.resolve({ ok: true, ligado: true, mesmaSessao: true });
}
icG3Desligar();
icG3.cfg = cfg; icG3.on = true; icG3.erro = null;
icG3.zDesloc = (+cfg.zChao || 0) - (isFinite(+cfg.altitude) ? +cfg.altitude : 0);
if (icG3.clipAntes == null) icG3.clipAntes = renderer.localClippingEnabled;
icG3Selo();
var ver = ++icG3.versao;
return icG3Carregar().then(function (M) {
if (ver !== icG3.versao || !icG3.on) return { ok: false, erro: 'desligado antes de carregar' };
var t = new M.TilesRenderer(cfg.url || undefined), au = new M.Auth({ apiToken: String(cfg.chave), autoRefreshToken: true });
var f0 = au.fetchData.bind(au);
au.fetchData = function (u, o) { var raiz = /root\.json/.test(String(u)); return f0(u, o).then(function (r) { if (r && !r.ok && raiz) icG3.erro = 'o Google recusou o pedido (HTTP ' + r.status + ') — confira a chave e a cota no console do Google Cloud'; return r; }, function (err) { if (raiz) icG3.erro = 'o Google recusou o pedido — confira a chave e a cota no console do Google Cloud'; throw err; }); };
t.registerPlugin(au);
var dr = new M.DRACOLoader(); dr.setDecoderPath(IC_G3_VENDOR + 'jsm/libs/draco/gltf/');
var gl = new M.GLTFLoader(t.manager); gl.setDRACOLoader(dr); t.manager.addHandler(/\.(gltf|glb)$/, gl);
t.addEventListener('load-model', function (e) { icG3.carregados++; if (e && e.scene) icG3RecorteEm(e.scene); });
icG3.tiles = t; icG3.draco = dr; icG3G.add(t.group);
icG3AplicarRecorte(); icG3Matriz();
return { ok: true, ligado: true };
}).catch(function (e) { icG3.erro = 'não consegui carregar o módulo do 3D: ' + String((e && e.message) || e).slice(0, 160); icG3Desligar(); return { ok: false, erro: icG3.erro }; });
}
S._tickExtra.push(function () {
if (!icG3.on || !icG3.tiles) return;
var t = icG3.tiles;
icG3Matriz();
if (icG3.cfg && icG3.cfg.recortar !== false) renderer.localClippingEnabled = true;
t.setCamera(camera); t.setResolutionFromRenderer(camera, renderer); camera.updateMatrixWorld(); t.update();
icG3.quadros++;
var agora = Date.now(), ocioso = t.stats && !t.stats.downloading && !t.stats.parsing;
if (t.visibleTiles && t.visibleTiles.size && icG3.buscas < 6 && agora - icG3.ultBusca > (ocioso ? 1500 : 4000)) { icG3.ultBusca = agora; icG3AcharChao(); }
if (icG3.quadros % 20 === 0) icG3Selo();
});
function icG3Sondar(x, y) {
var t = icG3.tiles; if (!t) return null;
var inv = new THREE.Matrix4().copy(modelRoot.matrixWorld).invert();
var topo = icL({ x: +x, y: +y, z: 3000 }).applyMatrix4(modelRoot.matrixWorld), fundo = icL({ x: +x, y: +y, z: -3000 }).applyMatrix4(modelRoot.matrixWorld);
icG3Ray.set(topo, fundo.clone().sub(topo).normalize()); icG3Ray.far = 6000;
var hs = []; try { hs = icG3Ray.intersectObject(t.group, true); } catch (_) {}
if (!hs.length) return null; hs.sort(function (p, q) { return p.distance - q.distance; });
return Math.round(icM(hs[0].point.clone().applyMatrix4(inv)).z * 1000) / 1000;
}
function icG3Estado() {
var t = icG3.tiles, nPl = 0;
if (t) t.group.traverse(function (o) { if (o.material && !Array.isArray(o.material) && o.material.clippingPlanes && o.material.clippingPlanes.length === 4 && o.material.clipIntersection) nPl++; });
return { on: icG3.on, modulo: !!icG3.mod, raiz: !!(t && t.rootTileSet), visiveis: t && t.visibleTiles ? t.visibleTiles.size : 0, carregados: icG3.carregados, hChao: icG3.hChao, zDesloc: Math.round(icG3.zDesloc * 1000) / 1000,
fila: t && t.stats ? { baixando: t.stats.downloading, processando: t.stats.parsing, falhas: t.stats.failed } : null,
erroMin: (function () { var m = Infinity; if (t && t.visibleTiles) t.visibleTiles.forEach(function (tl) { m = Math.min(m, +tl.geometricError || 0); }); return isFinite(m) ? Math.round(m * 10) / 10 : null; })(),
buscas: icG3.buscas, erro: icG3.erro, recorte: !!(icG3.cfg && icG3.cfg.recortar !== false && icG3.planos), clipLocal: renderer.localClippingEnabled, planosNosBlocos: nPl, filhos: icG3G.children.length,
selo: icG3.selo && icG3.selo.style.display !== 'none' ? (icG3.selo.textContent || '') : null, logo: !!(icG3.selo && icG3.selo.querySelector('img[alt="Google Maps"]')), visivel: icG3G.visible };
}
var IFC_MAPCONVERSION = 3057273783, IFC_PROJECTEDCRS = 3843373140, IFC_GEOMREPCONTEXT = 3448662350, IFC_SITE_T = 4097777520;
function icGeoIfc() {
var G = window.IcarGeo; if (!G) return { ok: false, motivo: 'falta js/icargeo.js' };
if (!S.api || S.modelID == null) return { ok: false, motivo: 'abra o modelo IFC primeiro' };
var api = S.api, mid = S.modelID;
function val(x) { return x && typeof x === 'object' && x.value !== undefined ? x.value : x; }
function lin(id) { try { return api.GetLine(mid, val(id), false); } catch (_) { return null; } }
function ids(t) { var o = []; try { var r = api.GetLineIDsWithType(mid, t); for (var i = 0; i < r.size(); i++) o.push(r.get(i)); } catch (_) {} return o; }
var fLen = unidadePrefixoBase(mid, 'LENGTHUNIT'); if (fLen == null) fLen = 1;
var mcs = ids(IFC_MAPCONVERSION);
for (var a = 0; a < mcs.length; a++) {
var mc = lin(mcs[a]), crs = mc && lin(mc.TargetCRS), nome = crs ? String(val(crs.Name) || '') : '', ep = /(\d{4,5})\s*$/.exec(nome) || /EPSG\D*(\d{4,5})/i.exec(nome);
if (!mc || !ep) continue;
var E0 = +val(mc.Eastings), N0 = +val(mc.Northings), fat = [1, fLen, 0.001].filter(function (f) { var e = E0 * f, n = N0 * f; return e > 100000 && e < 900000 && n > 0 && n < 10000000; })[0];
if (!fat) continue;
var sc = +val(mc.Scale) || 1; if (fLen !== 1 && Math.abs(sc - fLen) < 1e-9) sc = 1;
var g = G.geoDoMapConversion({ Eastings: E0 * fat, Northings: N0 * fat, XAxisAbscissa: val(mc.XAxisAbscissa), XAxisOrdinate: val(mc.XAxisOrdinate), Scale: sc }, +ep[1]);
if (g) { g.ok = true; return g; }
}
var st = ids(IFC_SITE_T), site = st.length ? lin(st[0]) : null;
if (!site) return { ok: false, motivo: 'o IFC não tem IfcSite' };
function arr(v) { v = val(v); return v && v.length ? Array.prototype.map.call(v, function (x) { return +val(x); }) : null; }
var la = G.anguloIfc(arr(site.RefLatitude)), lo = G.anguloIfc(arr(site.RefLongitude));
if (la == null || lo == null || (Math.abs(la) < 1e-9 && Math.abs(lo) < 1e-9)) return { ok: false, motivo: 'o IFC não traz latitude e longitude do terreno (IfcSite)' };
var x0 = 0, y0 = 0;
try { var pl = lin(site.ObjectPlacement), rp = pl && lin(pl.RelativePlacement), lc = rp && lin(rp.Location), cs = lc && arr(lc.Coordinates); if (cs) { x0 = (cs[0] || 0) * fLen; y0 = (cs[1] || 0) * fLen; } } catch (_) {}
var norte = 0, temNorte = false, cxs = ids(IFC_GEOMREPCONTEXT);
for (var c = 0; c < cxs.length && !temNorte; c++) {
var cx = lin(cxs[c]); if (!cx || !cx.TrueNorth) continue;
var tn = lin(cx.TrueNorth), dr = tn && arr(tn.DirectionRatios); if (!dr || dr.length < 2) continue;
norte = G.norteDeTrueNorth(dr[0], dr[1]); temNorte = true;
}
return { ok: true, lat: la, lon: lo, x0: Math.round(x0 * 1000) / 1000, y0: Math.round(y0 * 1000) / 1000, norte: Math.round(norte * 1e4) / 1e4, semNorte: !temNorte,
fonte: 'IfcSite (latitude/longitude do terreno)' + (temNorte ? ' + norte do projeto' : ' — sem norte no arquivo (norte = +Y)') };
}
S._tickExtra.push(function (dt) {
if (!icar.grupo.children.length) return;
icSincronizar();
var si = icar.sim;
if (si && !si.parado) {
si.t += (dt > 0 && dt < 0.25 ? dt : 0.016) / si.dur;
si.passo();
if (si.t >= 1.12) { si.parado = true; var fim = si.aoFim; icLimparSim(); try { if (fim) fim(); } catch (_) {} }
}
var qe = icar.equip;
if (qe && qe.ge) {
if (icar.giro) {
var gr = icar.giro; gr.t += (dt > 0 && dt < 0.25 ? dt : 0.016) / gr.dur;
var ang = gr.th0 + Math.PI * 2 * Math.min(1, gr.t), Mg0 = new THREE.Matrix4().compose(qe.ge.eqG.position, qe.ge.eqG.quaternion, qe.ge.eqG.scale);
var gL = new THREE.Vector3(gr.R * Math.cos(ang), gr.y, -gr.R * Math.sin(ang)).applyMatrix4(Mg0);
var rot = new THREE.Matrix4().makeRotationY(ang - gr.th0), pts = gr.pL.map(function (p) { return p.clone().applyMatrix4(rot).applyMatrix4(Mg0); });
icPoseGerada(gL, pts);
if (gr.t >= 1) { icar.giro = null; icPoseGerada(gr.g0, gr.p0); icFisicaAgora(true); }
} else if (qe._fisPend) icFisicaAgora(true);
if (qe.pulsa && qe.pulsa.length) {
var pz = 0.5 + 0.5 * Math.sin(performance.now() / 1000 * 8);
qe.pulsa.forEach(function (m) { if (m.emissive) m.emissive.setRGB(0.85 * pz, 0, 0); else if (m.opacity != null) { m.transparent = true; m.opacity = 0.35 + 0.65 * pz; } });
}
}
for (var i = 0; i < icar.rotulos.length; i++) {
var o = icar.rotulos[i], d = camera.position.distanceTo(o.getWorldPosition(_icWp)) * (o.userData._sc || 0.028);
if (o.userData._ratio) o.scale.set(d * o.userData._ratio, d, 1); else o.scale.setScalar(d);
}
icEmpilharRotulos();
});
function icEmpilharRotulos() {
var lista = icar.rotulos.filter(function (o) { return o.visible && o.parent; });
if (lista.length < 2) { lista.forEach(function (o) { o.center.set(0.5, 0.5); }); return; }
var tam = renderer.getSize(new THREE.Vector2()), W = tam.x, H = tam.y, tanF = Math.tan((camera.fov || 50) * Math.PI / 360);
var itens = lista.map(function (o) {
o.getWorldPosition(_icWp);
var dist = camera.position.distanceTo(_icWp), p = _icWp.clone().project(camera);
var hPx = camera.isPerspectiveCamera ? o.scale.y / (2 * dist * tanF) * H : o.scale.y * camera.zoom / ((camera.top - camera.bottom) || 1) * H;
return { o: o, dist: dist, x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H, h: hPx, w: hPx * (o.userData._ratio || 1), atras: p.z > 1 };
}).sort(function (a, b) { return a.dist - b.dist; });
var postos = [];
function bate(r) { for (var j = 0; j < postos.length; j++) { var q = postos[j]; if (r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0) return true; } return false; }
itens.forEach(function (it) {
if (it.atras) { it.o.center.set(0.5, 0.5); return; }
var n = 0, r;
for (; n <= 8; n++) {
var cy = it.y - n * it.h * 1.08;
r = { x0: it.x - it.w / 2, x1: it.x + it.w / 2, y0: cy - it.h / 2, y1: cy + it.h / 2 };
if (!bate(r)) break;
}
if (n > 8) n = 8;
it.o.center.set(0.5, 0.5 - n * 1.08); it.o.userData._degraus = n;
it.o.userData._tela = r;
postos.push(r);
});
}
function icCaptura(vista) {
if (!S || !icar.grupo.children.length) return null;
icSincronizar();
var box = icCaixaFoco(); if (box.isEmpty()) return null;
var c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3()), raio = Math.max(sz.x, sz.y, sz.z) * 0.62;
var bk = { p: camera.position.clone(), up: camera.up.clone(), fov: camera.fov, near: camera.near, far: camera.far, bg: scene.background };
var vLn = _selLn ? _selLn.visible : null, url = null;
try {
camera.fov = 14; var dist = raio / Math.tan(camera.fov * Math.PI / 360) * 1.08;
var q = icar.equip, dir;
if (vista === 'planta') { dir = new THREE.Vector3(0, 1, 0); camera.up.set(0, 0, -1).transformDirection(modelRoot.matrixWorld); }
else if (vista === 'elevacao' && q && q.c.cg) {
var pv = q.pos.clone().applyMatrix4(icar.grupo.matrix), cg = icL(q.c.cg).applyMatrix4(icar.grupo.matrix);
var rd = cg.sub(pv).setY(0); if (rd.lengthSq() < 1e-6) rd.set(1, 0, 0); rd.normalize();
dir = new THREE.Vector3(-rd.z, 0, rd.x); camera.up.set(0, 1, 0);
} else { dir = new THREE.Vector3(0.75, 0.62, 0.9).normalize(); camera.up.set(0, 1, 0); }
camera.position.copy(c).add(dir.multiplyScalar(dist));
icMapaG.visible = false;
var ceuC = icLocalMundo.getObjectByName('local-ceu'); if (ceuC) ceuC.visible = false;
var g3C = icG3G.visible; icG3G.visible = false;
camera.near = Math.max(0.05, dist - raio * 3); camera.far = dist + raio * 4;
camera.lookAt(c); camera.updateProjectionMatrix();
scene.background = new THREE.Color(0xffffff);
if (_selLn) _selLn.visible = false;
renderer.render(scene, camera);
url = cvDesenho().toDataURL('image/png');
} catch (_) { url = null; } finally {
camera.position.copy(bk.p); camera.up.copy(bk.up); camera.fov = bk.fov; camera.near = bk.near; camera.far = bk.far; scene.background = bk.bg;
icMapaG.visible = true;
var ceuV = icLocalMundo.getObjectByName('local-ceu'); if (ceuV) ceuV.visible = true;
icG3G.visible = g3C !== false;
if (_selLn && vLn !== null) _selLn.visible = vLn;
camera.lookAt(orbit.target); camera.updateProjectionMatrix();
}
return url;
}
function icRaizesSombra() {
var r = [modelRoot];
(S.modelos || []).forEach(function (mo) { if (mo._agreg && mo._agreg.grupo) r.push(mo._agreg.grupo); });
return r.concat([icar.grupo, icPlantaG, icLocalG, icLocalMundo]);
}
function icFotoHD(o) {
o = o || {};
if (!S) return { ok: false, erro: 'visualizador não montado' };
var W = Math.max(320, Math.min(3840, Math.round(+o.largura || 1920))), H = Math.max(240, Math.min(2160, Math.round(+o.altura || 1080)));
var maxRB = (renderer.capabilities && renderer.capabilities.maxRenderbufferSize) || 4096, ss = Math.max(1, Math.min(2, Math.floor(Math.min(maxRB / W, maxRB / H))));
var cv = cvDesenho(), tam = new THREE.Vector2(); renderer.getSize(tam);
var sc = dir.shadow.camera, bk = { w: cv.width, h: cv.height, pr: renderer.getPixelRatio(), asp: camera.aspect, cast: dir.castShadow, map: dir.shadow.mapSize.clone(),
cam: [sc.left, sc.right, sc.top, sc.bottom, sc.near, sc.far], pos: dir.position.clone(), tgt: dir.target.position.clone() };
var g3F = icG3G.visible; icG3G.visible = false;
var marcadas = [], envs = [], trocas = [], luzes = { d: dir.intensity, h: hemi.intensity, f: fill.intensity, g: grid.visible }, out = null;
try {
dir.intensity = luzes.d * 1.7; hemi.intensity = luzes.h * 0.55; fill.intensity = luzes.f * 0.4; grid.visible = false;
icLocalG.children.forEach(function (m) {
if (m.name !== 'local-imagem' || !m.material || !m.material.isMeshBasicMaterial) return;
var b = m.material;
trocas.push([m, b, m.receiveShadow]);
m.material = new THREE.MeshStandardMaterial({ map: b.map, transparent: b.transparent, opacity: b.opacity, depthWrite: false, side: b.side, polygonOffset: b.polygonOffset,
polygonOffsetFactor: b.polygonOffsetFactor, polygonOffsetUnits: b.polygonOffsetUnits, roughness: 1, metalness: 0 });
m.receiveShadow = true;
});
icRaizesSombra().forEach(function (g) {
g.traverse(function (m) {
if (!m.isMesh || !m.material) return;
(Array.isArray(m.material) ? m.material : [m.material]).forEach(function (mt) {
if (mt.envMapIntensity == null || mt.userData.__envFoto) return;
mt.userData.__envFoto = true; envs.push([mt, mt.envMapIntensity]); mt.envMapIntensity = mt.envMapIntensity * 0.5;
});
});
});
if (!o.semSombra) icRaizesSombra().forEach(function (g) {
g.traverse(function (m) {
if (!m.isMesh || !m.geometry || m.name === 'local-ceu') return;
marcadas.push([m, m.castShadow, m.receiveShadow]);
var chao = /^local-(relevo|levantamento|imagem|rua-faixa|gramado)$/.test(m.name), fino = m.material && m.material.transparent && m.material.opacity < 0.5;
m.castShadow = !chao && !fino; m.receiveShadow = true;
});
});
var box = icLocalCaixa(); if (icar.grupo.children.length) { var bF = icCaixaFoco(); if (!bF.isEmpty()) box.union(bF); }
icPlantaG.children.forEach(function (e) { if (e.name === 'entorno') { var bE = new THREE.Box3().setFromObject(e); if (!bE.isEmpty()) box.union(bE); } });
var ctr = box.getCenter(new THREE.Vector3()), R = Math.min(150, box.getSize(new THREE.Vector3()).length() / 2 + 2);
var dSol = dir.position.clone().sub(dir.target.position); if (dSol.lengthSq() < 1e-9) dSol.set(0.4, 1, 0.3); dSol.normalize();
dir.target.position.copy(ctr); dir.target.updateMatrixWorld(); dir.position.copy(ctr).addScaledVector(dSol, R * 2);
sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 0.5; sc.far = R * 4; sc.updateProjectionMatrix();
dir.shadow.mapSize.set(4096, 4096); if (dir.shadow.map) { dir.shadow.map.dispose(); dir.shadow.map = null; }
dir.castShadow = !o.semSombra;
renderer.setPixelRatio(1); renderer.setSize(W * ss, H * ss, false);
camera.aspect = W / H; camera.updateProjectionMatrix();
renderer.setScissorTest(false); renderer.setViewport(0, 0, W * ss, H * ss);
var g3NaFoto = icG3G.visible && icG3G.children.length > 0;
renderer.render(scene, camera);
var mapaOk = !!(dir.shadow.map && dir.shadow.map.texture);
var c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
var x2 = c2.getContext('2d'); x2.fillStyle = '#eef2f6'; x2.fillRect(0, 0, W, H);
x2.imageSmoothingEnabled = true; x2.imageSmoothingQuality = 'high';
x2.drawImage(cv, 0, 0, W * ss, H * ss, 0, 0, W, H);
var txt = String(o.carimbo || 'OrçaPRO · modo foto · imagem ilustrativa').slice(0, 90), fs = Math.round(H / 54);
x2.font = '600 ' + fs + 'px system-ui, sans-serif'; var tw = x2.measureText(txt).width;
x2.fillStyle = 'rgba(15,23,42,.55)'; x2.fillRect(W - tw - fs * 1.6, H - fs * 2.2, tw + fs * 1.2, fs * 1.7);
x2.fillStyle = '#fff'; x2.fillText(txt, W - tw - fs, H - fs * 0.95);
out = { ok: true, url: c2.toDataURL('image/png'), largura: W, altura: H, superamostra: ss, sombras: marcadas.filter(function (x) { return x[0].castShadow; }).length,
mescladas: marcadas.filter(function (x) { return x[0].userData.agregado; }).length, satelite: trocas.length, google3dNaFoto: g3NaFoto,
ceu: !!icLocalMundo.getObjectByName('local-ceu'), mapaSombra: dir.shadow.mapSize.x, mapaGerado: mapaOk, recebem: marcadas.length, luz: Math.round(dir.intensity * 100) / 100 };
} catch (e) { out = { ok: false, erro: String((e && e.message) || e) }; }
finally {
marcadas.forEach(function (x) { x[0].castShadow = x[1]; x[0].receiveShadow = x[2]; });
envs.forEach(function (x) { x[0].envMapIntensity = x[1]; delete x[0].userData.__envFoto; });
trocas.forEach(function (x) { var t = x[0].material; x[0].material = x[1]; x[0].receiveShadow = x[2]; try { t.dispose(); } catch (_) {} });
dir.intensity = luzes.d; hemi.intensity = luzes.h; fill.intensity = luzes.f; grid.visible = luzes.g;
dir.castShadow = bk.cast; dir.shadow.mapSize.copy(bk.map); if (dir.shadow.map) { dir.shadow.map.dispose(); dir.shadow.map = null; }
sc.left = bk.cam[0]; sc.right = bk.cam[1]; sc.top = bk.cam[2]; sc.bottom = bk.cam[3]; sc.near = bk.cam[4]; sc.far = bk.cam[5]; sc.updateProjectionMatrix();
dir.position.copy(bk.pos); dir.target.position.copy(bk.tgt); dir.target.updateMatrixWorld();
renderer.setPixelRatio(bk.pr); renderer.setSize(tam.x, tam.y, false); camera.aspect = bk.asp; camera.updateProjectionMatrix();
icG3G.visible = g3F;
if (out) out.restaurado = cv.width === bk.w && cv.height === bk.h && dir.castShadow === bk.cast && dir.intensity === luzes.d && hemi.intensity === luzes.h && grid.visible === luzes.g;
}
return out;
}
function icCaixaFoco() {
var box = new THREE.Box3();
icar.grupo.children.forEach(function (o) { if (!o.userData.foraDaFoto && !o.isSprite) box.expandByObject(o); });
return box;
}
function icEnquadrar() {
icSincronizar();
var box = icCaixaFoco(); if (box.isEmpty()) return false;
if (S._enquadrarObj) S._enquadrarObj(box, 1.25); return true;
}
S._icar = { geometria: icGeometria, chao: function () { return icM(new THREE.Vector3(0, icChao(), 0)).z; }, pontoNoChao: icPontoNoChao, sondar: icSondar, desenhar: icDesenhar, limpar: icLimpar,
simular: icSimular, simulando: function () { return !!icar.sim; }, parar: function () { icLimparSim(); return true; },
colisoes: icColisoes, caixas: icCaixas, fotoHD: icFotoHD, google3d: icGoogle3d, google3dEstado: icG3Estado, google3dSondar: icG3Sondar, mapa: icMapa, planta: icPlanta, plantaPonto: icPlantaPonto, visada: icVisada, local: icLocal, geoIfc: icGeoIfc,
localEstado: function () {
var c = { gramados: 0, ceu: !!icLocalMundo.getObjectByName('local-ceu'), faixas: 0, arvores: 0, levantamento: 0, curvas: 0, imagem: 0, relevo: 0, ruas: 0, verdes: 0, postes: 0, redes: 0, chuva: 0, vento: 0, neblina: !!(icLocalEst.nevoaVis && scene.fog), sol: !!icLocalEst.sol, luz: { x: dir.position.x, y: dir.position.y, z: dir.position.z, i: dir.intensity } };
c.graos = []; icLocalG.children.forEach(function (o) { var gr = (o.name === 'local-gramado' || o.name === 'local-rua-faixa') && o.material && o.material.userData.grao; if (gr && c.graos.indexOf(gr) < 0) c.graos.push(gr); });
c.sombrasLigadas = 0; icRaizesSombra().slice(0, -4).forEach(function (g) { g.traverse(function (m) { if (m.isMesh && m.castShadow) c.sombrasLigadas++; }); });
icLocalG.children.forEach(function (o) { if (o.name === 'local-gramado') c.gramados++; else if (o.name === 'local-rua-faixa') c.faixas++; else if (o.name === 'local-arvores') c.arvores = o.count; else if (o.name === 'local-levantamento') c.levantamento++; else if (o.name === 'local-curvas') c.curvas = o.geometry.attributes.position.count / 2; else if (o.name === 'local-imagem') c.imagem++; else if (o.name === 'local-relevo') c.relevo++; else if (o.name === 'local-rua') c.ruas++; else if (o.name === 'local-verde') c.verdes++; else if (o.name === 'local-poste') c.postes++; else if (o.name === 'local-rede') c.redes++; });
icLocalMundo.children.forEach(function (o) { if (o.name === 'local-chuva') c.chuva = o.geometry.attributes.position.count; else if (o.name === 'local-vento') c.vento++; });
return c;
},
plantaEstado: function () {
var c = { plano: 0, linhas: 0, propostas: 0, entorno: 0, agua: 0, opacidade: null };
icPlantaG.children.forEach(function (o) { if (o.name === 'entorno' && Array.isArray(o.material) && o.material[1] && o.material[1].userData.fachada) c.fachadas = (c.fachadas || 0) + 1; });
icPlantaG.children.forEach(function (o) { if (o.name === 'planta-imagem') { c.plano++; c.opacidade = o.material.opacity; } else if (o.name === 'planta-linhas') c.linhas++; else if (o.name === 'planta-proposta') c.propostas++; else if (o.name === 'entorno') c.entorno++; else if (o.name === 'entorno-agua') c.agua++; else if (o.name === 'agente-limite') c.limite = (c.limite || 0) + 1; });
c.obstaculos = (icar.entorno || []).length; return c;
},
mapaEstado: function () { var m = icMapaG.getObjectByName('agente-mapa'); return m ? { n: m.count, contagem: m.userData.contagem, visivel: icMapaG.visible } : null; },
simIr: function (t) { var si = icar.sim; if (!si) return false; si.t = Math.max(0, Math.min(1, +t || 0)); si.parado = true; si.passo(); icFisicaAgora(true); return true; },
simPausado: function () { return !!(icar.sim && icar.sim.parado); },
captura: icCaptura, enquadrar: icEnquadrar,
girar: function (on, dur) {
var q = icar.equip; if (!q || !q.ge || !q.ganchoL) return false;
if (!on) { if (icar.giro) { var g0 = icar.giro; icar.giro = null; icPoseGerada(g0.g0, g0.p0); } return true; }
var Mi = new THREE.Matrix4().compose(q.ge.eqG.position, q.ge.eqG.quaternion, q.ge.eqG.scale).invert();
var pL = (q._pontosUlt || []).map(function (p) { return p.clone().applyMatrix4(Mi); });
icar.giro = { t: 0, dur: Math.max(2, +dur || 8), th0: q.theta, R: q.R, y: q.ganchoL.y, pL: pL, g0: q.gancho.clone(), p0: (q._pontosUlt || []).map(function (p) { return p.clone(); }) };
return true;
},
girando: function () { return !!icar.giro; },
theta: function (graus) {
var q = icar.equip; if (!q || !q.ge || !q.ganchoL) return null;
var a = (+graus || 0) * Math.PI / 180, Mg = new THREE.Matrix4().compose(q.ge.eqG.position, q.ge.eqG.quaternion, q.ge.eqG.scale);
var rot = new THREE.Matrix4().makeRotationY(a - q.theta), Mi = Mg.clone().invert();
var pts = (q._pontosUlt || []).map(function (p) { return p.clone().applyMatrix4(Mi).applyMatrix4(rot).applyMatrix4(Mg); });
icPoseGerada(new THREE.Vector3(q.R * Math.cos(a), q.ganchoL.y, -q.R * Math.sin(a)).applyMatrix4(Mg), pts);
icFisicaAgora(true); return q.theta;
},
sobrecarga: function (k) { var q = icar.equip; if (!q) return null; q.k = k == null ? null : +k; return icFisicaAgora(true); },
opcoes: function (o) { var q = icar.equip; if (!q) return false; for (var k in o) q.c[k] = o[k]; icFisicaAgora(true); return true; },
equipEstado: function () {
var q = icar.equip; if (!q || !q.ge) return null;
var ge = q.ge, Mg = new THREE.Matrix4().compose(ge.eqG.position, ge.eqG.quaternion, ge.eqG.scale);
function hex(m) { return m && m.color ? '#' + m.color.getHexString() : null; }
var rot = {}; Object.keys(icar.vivos).forEach(function (k) { var v = icar.vivos[k]; if (v.visible) rot[k] = v.userData._txt; });
icSincronizar();
var invG = new THREE.Matrix4().copy(icar.grupo.matrixWorld).invert();
function daMalha(m, x) { if (!m) return null; m.updateMatrixWorld(true); return icM(new THREE.Vector3(x, 0, 0).applyMatrix4(m.matrixWorld).applyMatrix4(invG)); }
var pontaMalha = ge.munck ? daMalha(ge.ext && ge.ext.visible ? ge.ext : ge.braco2, 0.5) : daMalha(ge.cabeca, 0), cotMalha = ge.munck ? daMalha(ge.braco1, 0.5) : null;
var colMalha = ge.munck ? daMalha(ge.braco1, -0.5) : null;
return { tipo: ge.munck ? 'munck' : 'guindaste', theta: q.theta * 180 / Math.PI, R: q.R, alfa: q.alfaGraus != null ? q.alfaGraus : null, kinOk: !!(q.kin && q.kin.ok),
ponta: q.pontaL ? icM(q.pontaL.clone().applyMatrix4(Mg)) : null, gancho: q.gancho ? icM(q.gancho) : null, centro: icM(new THREE.Vector3(0, 0, 0).applyMatrix4(Mg)),
cores: { escoras: (ge.escoras || []).map(function (e) { return hex(e.m); }), patolas: ge.patolas.map(function (p) { return hex(p.mS); }), solo: ge.patolas.map(function (p) { return hex(p.mC); }), lanca: ge.secoes ? hex(ge.secoes[0].mat) : hex(ge.mBracos), cabo: hex(ge.mCabo), lingas: (ge.mLingas || []).map(hex) },
rotulosTela: (function () {
var tam = renderer.getSize(new THREE.Vector2()), W = tam.x, H = tam.y, tanF = Math.tan((camera.fov || 50) * Math.PI / 360), wp = new THREE.Vector3();
return icar.rotulos.filter(function (o) { return o.visible && o.parent; }).map(function (o) {
o.getWorldPosition(wp); var dist = camera.position.distanceTo(wp), p = wp.clone().project(camera);
var h = o.scale.y / (2 * dist * tanF) * H, w = h * (o.userData._ratio || 1), x = (p.x + 1) / 2 * W, y = (1 - p.y) / 2 * H - (0.5 - o.center.y) * h;
return { txt: o.userData._txt || '', x0: Math.round(x - w / 2), x1: Math.round(x + w / 2), y0: Math.round(y - h / 2), y1: Math.round(y + h / 2), degraus: o.userData._degraus || 0 };
});
})(),
pontaMalha: pontaMalha, cotoveloMalha: cotMalha, colunaMalha: colMalha, kin: q.kin ? { ok: !!q.kin.ok, modo: q.kin.modo || null, ext: q.kin.ext != null ? q.kin.ext : null } : null,
rotulos: rot, nEstimadas: ge.nEstimadas, pulsando: (q.pulsa || []).length, fis: q.fis ? q.fis.componentes.map(function (x) { return { id: x.id, esforco: x.esforco, uTrab: x.u.uTrab, uRup: x.u.uRup, faixa: x.u.faixa.chave }; }) : null, k: q.k };
},
estado: function (uids) {
var vis = 0; (uids || []).forEach(function (u) { malhasDaPeca(u).forEach(function (m) { if (m.visible) vis++; }); });
var lc = icar.equip && icar.equip.gancho ? [icar.equip.gancho.x, icar.equip.gancho.y, icar.equip.gancho.z] : null;
return { objetos: icar.grupo.children.length, equip: !!icar.equip, equipPos: icar.equip ? icM(icar.equip.pos) : null, sim: icar.sim ? { t: icar.sim.t, malhas: icar.sim.fantasma.children.length - 1 } : null, rotulos: icar.rotulos.length,
malhasVisiveis: vis, lanca: lc, linhaIcamento: !!icar.grupo.getObjectByName('linha-icamento'),
tandem: ['tandem-equip', 'tandem-lanca', 'tandem-linga'].filter(function (n) { return !!icar.grupo.getObjectByName(n); }).length,
tandemGancho: icar.tandem && icar.tandem.gAgora ? icM(icar.tandem.gAgora) : null };
} };
var _tetoV = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
function tetoVisitante(frac) {
var box = new THREE.Box3().setFromObject(modelRoot); if (box.isEmpty()) return null;
if (frac == null || frac >= 0.999) { renderer.clippingPlanes = []; renderer.localClippingEnabled = false; return { inteiro: true }; }
var y = box.min.y + (box.max.y - box.min.y) * Math.max(0, frac);
_tetoV.constant = y; renderer.localClippingEnabled = true; renderer.clippingPlanes = [_tetoV];
return { inteiro: false, alturaM: y - box.min.y };
}
S._tetoVisitante = tetoVisitante;
var AGREG = { on: true };
try { AGREG.on = localStorage.getItem('orcapro:bim:agregar') !== '0'; } catch (_) {}
if (AGREG.on) ray.layers.set(1);
function _corDoMaterial(mat) {
if (!mat) return [1, 1, 1, 1];
var c = mat.color || { r: 1, g: 1, b: 1 };
var a = (mat.transparent && typeof mat.opacity === 'number') ? mat.opacity : 1;
return [c.r, c.g, c.b, a];
}
function agregarModelo(mo) {
if (!AGREG.on || !mo || mo._agreg || typeof window === 'undefined' || !window.BimAgreg) return false;
var geos = {}, insts = [];
for (var i = 0; i < mo.grupo.children.length; i++) {
var m = mo.grupo.children[i];
if (!m.isMesh || m.userData.expressID == null || !m.geometry || !m.geometry.index) continue;
var pa = m.geometry.attributes.position, na = m.geometry.attributes.normal;
if (!pa || !na) continue;
var k = m.uuid;
geos[k] = { pos: pa.array, nor: na.array, idx: m.geometry.index.array };
var texI = (m.userData.matOrig && m.userData.matOrig.userData && m.userData.matOrig.userData.tex) || null;
insts.push({ e: m.userData.expressID, g: k, m: (m.userData._matFechada || m.matrix).elements, cor: _corDoMaterial(m.userData.matOrig || m.material), ref: m,
tx: texI && window.BimTextura ? window.BimTextura.chave(texI) : '', tex: texI });
}
if (!insts.length) return false;
var plano = BimAgreg.planejar({ instancias: insts, geometrias: geos });
var outroMesclado = S.modelos.some(function (x) { return x !== mo && (x._agreg || x._agregSuspenso); });
if (!S._origemAgreg || !outroMesclado) S._origemAgreg = BimAgreg.origemDe(plano);
var origem = S._origemAgreg;
var grupo = new THREE.Group();
grupo.userData.agregadoDe = mo.mid;
var partes = [];
for (var b = 0; b < plano.buckets.length; b++) {
var bucket = plano.buckets[b];
var built = BimAgreg.construir(bucket, geos, origem);
var bg = new THREE.BufferGeometry();
bg.setAttribute('position', new THREE.BufferAttribute(built.pos, 3));
bg.setAttribute('normal', new THREE.BufferAttribute(built.nor, 3));
var cores = new Float32Array(built.pos.length / 3 * 4);
bg.setAttribute('color', new THREE.BufferAttribute(cores, 4));
bg.setIndex(new THREE.BufferAttribute(built.idx, 1));
var mat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, metalness: .05, roughness: .85, side: THREE.DoubleSide, depthWrite: true });
var malha = new THREE.Mesh(bg, mat);
malha.position.set(origem[0], origem[1], origem[2]);
malha.layers.set(0);
malha.userData.agregado = true;
malha.frustumCulled = false;
grupo.add(malha);
partes.push({ malha: malha, faixas: built.faixas, idxCheio: built.idx, cores: cores, bucket: bucket });
}
scene.add(grupo);
mo._agreg = { grupo: grupo, partes: partes, origem: origem, assinatura: null };
var fundidos = {}; insts.forEach(function (x) { fundidos[x.g] = 1; });
for (var q = 0; q < mo.grupo.children.length; q++) { var cq = mo.grupo.children[q]; if (!cq.isMesh) continue; if (fundidos[cq.uuid]) cq.layers.set(1); else cq.layers.enable(1); }
if (TEXR.on) texVestirAgreg(mo._agreg);
_reaplicarAparencia(mo._agreg);
return true;
}
function desagregarModelo(mo) {
if (!mo || !mo._agreg) return;
try {
mo._agreg.partes.forEach(function (p) {
if (p.malha.geometry) p.malha.geometry.dispose();
if (p.malha.material) p.malha.material.dispose();
});
scene.remove(mo._agreg.grupo);
} catch (_) {}
mo._agreg = null;
for (var q = 0; q < mo.grupo.children.length; q++) if (mo.grupo.children[q].isMesh) mo.grupo.children[q].layers.set(0);
}
function _lerEstadoDoModelo(mo) {
var filhos = mo.grupo.children, sig = 0, porMat = {}, misto = false;
for (var k = 0; k < filhos.length; k++) {
var m = filhos[k];
if (!m.isMesh) continue;
sig = (sig * 33 + (m.visible === false ? 1 : 2)) | 0;
sig = (sig * 33 + (m.material ? m.material.id : 0)) | 0;
if (m.userData._solta) sig = (sig * 33 + 7) | 0;
if (m.visible === false || misto) continue;
var base = m.userData.matOrig ? m.userData.matOrig.id : 0;
var op = (m.material && m.material.transparent) ? m.material.opacity : 1;
if (porMat[base] === undefined) porMat[base] = op;
else if (Math.abs(porMat[base] - op) > 0.001) misto = true;
}
return { sig: sig, misto: misto };
}
function sincronizarAgregado() {
if (!AGREG.on || !S || !S.modelos) return;
for (var i = 0; i < S.modelos.length; i++) {
var mo = S.modelos[i];
var est = _lerEstadoDoModelo(mo);
if (est.misto) {
if (mo._agreg) { desagregarModelo(mo); mo._agregSuspenso = 1; }
continue;
}
if (mo._agregSuspenso) { mo._agregSuspenso = 0; agregarModelo(mo); }
var ag = mo._agreg;
if (!ag) continue;
ag.grupo.position.copy(modelRoot.position);
ag.grupo.quaternion.copy(modelRoot.quaternion);
ag.grupo.scale.copy(modelRoot.scale);
ag.grupo.visible = modelRoot.visible !== false && mo.grupo.visible !== false;
if (est.sig === ag.assinatura && !ag._sujoTex) continue;
ag._sujoTex = false;
ag.assinatura = est.sig;
_reaplicarAparencia(ag);
}
}
function _ehRealce(mat) {
return !!(mat && mat.emissive && (mat.emissive.r > 0.002 || mat.emissive.g > 0.002 || mat.emissive.b > 0.002));
}
function _desenhaPorSi(m) { return !!(m && (_ehRealce(m.material) || (m.userData && (m.userData._solta || m.userData.famPremium)))); }
function _comTextura(ref) {
var mt = ref.material;
return !!(mt && (mt === ref.userData.matOrig || (mt.userData && mt.userData.tex)));
}
function _reaplicarAparencia(ag) {
for (var p = 0; p < ag.partes.length; p++) {
var parte = ag.partes[p], fx = parte.faixas, ocultos = {};
var algumTransp = false, nVis = 0, nComTex = 0;
for (var f = 0; f < fx.length; f++) {
var faixa = fx[f], ref = faixa.ref;
if (!ref) continue;
if (_desenhaPorSi(ref)) {
ocultos["#" + f] = 1;
ref.layers.set(1); if (ref.visible !== false) ref.layers.enable(0);
continue;
}
ref.layers.set(1);
var oculta = ref.visible === false;
if (oculta) ocultos["#" + f] = 1;
var c = _corDoMaterial(ref.material);
if (!oculta && c[3] < 1) algumTransp = true;
if (!oculta) { nVis++; if (_comTextura(ref)) nComTex++; }
var ini = faixa.iniVert * 4, fim = ini + faixa.nVert * 4;
for (var v = ini; v < fim; v += 4) { parte.cores[v] = c[0]; parte.cores[v + 1] = c[1]; parte.cores[v + 2] = c[2]; parte.cores[v + 3] = c[3]; }
}
parte.malha.geometry.attributes.color.needsUpdate = true;
if (parte.malha.material.transparent !== algumTransp) {
parte.malha.material.transparent = algumTransp;
parte.malha.material.depthWrite = !algumTransp;
parte.malha.material.needsUpdate = true;
}
var mtB = parte.malha.material;
if (parte.bucket && parte.bucket.tex && parte.bucket.tex.slug && nVis) {
if (!nComTex) {
if (mtB.map || mtB.normalMap || mtB.roughnessMap) {
mtB.userData._mapasGuardados = [mtB.map, mtB.normalMap, mtB.roughnessMap];
mtB.map = null; mtB.normalMap = null; mtB.roughnessMap = null; mtB.needsUpdate = true;
}
} else if (mtB.userData._mapasGuardados) {
var mg = mtB.userData._mapasGuardados; delete mtB.userData._mapasGuardados;
if (TEXR.on) { mtB.map = mg[0]; mtB.normalMap = mg[1]; mtB.roughnessMap = mg[2]; mtB.needsUpdate = true; }
}
}
var r = BimAgreg.indicesVisiveis(fx, parte.idxCheio, ocultos, parte.idxVis);
parte.idxVis = r.idx;
var attr = parte.malha.geometry.index;
if (attr.array !== r.idx) parte.malha.geometry.setIndex(new THREE.BufferAttribute(r.idx, 1));
parte.malha.geometry.index.needsUpdate = true;
parte.malha.geometry.setDrawRange(0, r.nIdx);
}
}
function ligarAgregacao(on) {
var novo = !!on;
if (novo === AGREG.on) return AGREG.on;
AGREG.on = novo;
try { localStorage.setItem('orcapro:bim:agregar', novo ? '1' : '0'); } catch (_) {}
if (novo) {
ray.layers.set(1);
S.modelos.forEach(function (mo) { agregarModelo(mo); });
} else {
ray.layers.set(0); ray.layers.enable(1);
S._origemAgreg = null;
S.modelos.forEach(function (mo) { desagregarModelo(mo); });
}
return AGREG.on;
}
S._agregar = agregarModelo; S._desagregar = desagregarModelo; S._ligarAgregacao = ligarAgregacao;
S._agregEstado = function () {
if (!AGREG.on) return { on: false };
var malhas = 0, tri = 0;
S.modelos.forEach(function (mo) {
if (!mo._agreg) return;
mo._agreg.partes.forEach(function (p) { malhas++; tri += p.idxCheio.length / 3; });
});
return { on: true, malhasMescladas: malhas, triangulos: tri, origem: S._origemAgreg };
};
var TEXR = { on: false, motivo: '', cache: {}, ancora: null, pref: null, seq: 0, ultimo: null };
try { TEXR.pref = localStorage.getItem('orcapro:bim:materiais'); } catch (_) {}
function texMotor() { return (typeof window !== 'undefined' && window.BimTextura) ? window.BimTextura : null; }
function texFrota() { try { return !(window.CONFIG && window.CONFIG.bimRecursos && window.CONFIG.bimRecursos.materiais === false); } catch (_) { return true; } }
function texAparelho() {
var a = { memoria: 0, toque: false, telaMax: 0 };
try { a.memoria = +navigator.deviceMemory || 0; } catch (_) {}
try { a.toque = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch (_) {}
try { a.telaMax = Math.max(screen.width || 0, screen.height || 0); } catch (_) {}
return a;
}
function texAncora() {
if (TEXR.ancora) return TEXR.ancora;
var ms = [];
S.modelos.forEach(function (mo) { mo.grupo.children.forEach(function (m) { if (m.isMesh && m.userData.expressID != null) ms.push((m.userData._matFechada || m.matrix).elements); }); });
TEXR.ancora = texMotor().ancoraDe(ms);
return TEXR.ancora;
}
function texCarregar(slug, pbr) {
if (pbr == null) pbr = true;
var B = texMotor(), fraco = B.aparelhoFraco(texAparelho());
var ent = TEXR.cache[slug];
var ld = new THREE.TextureLoader(), an = 4;
try { an = Math.min(8, renderer.capabilities.getMaxAnisotropy()); } catch (_) {}
function um(url, cor) {
if (!url) return Promise.resolve(null);
return new Promise(function (res) {
ld.load(url, function (t) {
t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = an; if (cor) texSRGB(t);
try {
var im = t.image;
if (fraco && im && im.width > 512 && typeof document !== 'undefined') {
var k = 512 / Math.max(im.width, im.height), cv = document.createElement('canvas');
cv.width = Math.max(1, Math.round(im.width * k)); cv.height = Math.max(1, Math.round(im.height * k));
cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
t.image = cv; t.needsUpdate = true; t.userData = t.userData || {}; t.userData.reduzida = true;
}
} catch (_) {}
res(t);
}, undefined, function () { res(null); });
});
}
if (!ent) {
ent = { tex: {}, ok: false, erro: '' };
TEXR.cache[slug] = ent;
var arq0 = B.arquivos(slug, true);
if (!arq0) { ent.erro = 'textura desconhecida: ' + slug; ent.p = Promise.resolve(ent); ent.pPbr = ent.p; return ent.p; }
ent.p = um(arq0.cor, true).then(function (t) {
ent.tex.cor = t; ent.ok = !!t;
if (!t) ent.erro = 'não consegui carregar ' + arq0.cor;
return ent;
});
}
if (!pbr || fraco) return ent.p;
if (!ent.pPbr) {
var arq = B.arquivos(slug, false);
ent.pPbr = !arq ? ent.p : Promise.all([ent.p, um(arq.normal), um(arq.rugosidade)]).then(function (r) {
ent.tex.normal = r[1]; ent.tex.rug = r[2];
return ent;
});
}
return ent.pPbr;
}
function texVestirMat(mat, t, tinta) {
if (!mat || !t) return false;
if (!mat.userData._fis) mat.userData._fis = { r: mat.roughness, m: mat.metalness, o: mat.opacity, tr: mat.transparent, dw: mat.depthWrite, ei: mat.envMapIntensity };
if (t.classe === 'vidro') {
mat.roughness = 0.06; mat.metalness = 0; mat.envMapIntensity = 1.3;
if (mat.opacity > 0.99 && !mat.userData.agregado) { mat.transparent = true; mat.opacity = 0.35; mat.depthWrite = false; }
mat.needsUpdate = true; return true;
}
if (t.classe === 'metal') { mat.roughness = 0.35; mat.metalness = 0.6; mat.needsUpdate = true; return true; }
var ent = TEXR.cache[t.slug]; if (!ent || !ent.ok) return false;
delete mat.userData._mapasGuardados;
var pbr = TEXR.nivel !== 'textura';
mat.map = ent.tex.cor; mat.normalMap = pbr ? (ent.tex.normal || null) : null; mat.roughnessMap = pbr ? (ent.tex.rug || null) : null;
mat.roughness = (pbr && ent.tex.rug) ? 1 : 0.85;
mat.metalness = (texMotor().BIB[t.slug] && texMotor().BIB[t.slug].metal) || 0.02;
if (!pbr) mat.metalness = Math.min(mat.metalness, 0.3);
if (TEXR.env != null) mat.envMapIntensity = TEXR.env;
if (tinta) mat.color.setRGB(tinta[0], tinta[1], tinta[2], THREE.LinearSRGBColorSpace);
mat.needsUpdate = true;
return true;
}
function texDespirMat(mat) {
if (!mat) return;
var f = mat.userData._fis;
if (f) { mat.roughness = f.r; mat.metalness = f.m; mat.opacity = f.o; mat.transparent = f.tr; mat.depthWrite = f.dw; if (f.ei != null) mat.envMapIntensity = f.ei; delete mat.userData._fis; }
mat.map = null; mat.normalMap = null; mat.roughnessMap = null;
delete mat.userData._mapasGuardados;
if (mat.userData.corLin) mat.color.copy(mat.userData.corLin);
mat.needsUpdate = true;
}
function texVestir(mat) {
var t = mat && mat.userData && mat.userData.tex; if (!t) return false;
var acE = mat.userData.acabEnt;
return texVestirMat(mat, t, t.slug ? (acE && window.BimAcabVis ? window.BimAcabVis.tinta(acE, texMotor().BIB) : texMotor().tinta(mat.userData.corIfc, t.slug)) : null);
}
function texUvPeca(m, t) {
var g = m.geometry; if (!g || !g.attributes || !g.attributes.position) return;
var a = texAncora(), ch = t.slug + '@' + t.escala + '@' + a.join(',');
if (g.userData._uvChave === ch) return;
var uv = texMotor().uvDeMalha(g.attributes.position.array, g.attributes.normal ? g.attributes.normal.array : null,
(m.userData._matFechada || m.matrix).elements, t.escala, t.asp, a);
g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.userData._uvChave = ch;
}
function texUvParte(parte) {
var t = parte.bucket && parte.bucket.tex; if (!t || !t.slug) return;
var g = parte.malha.geometry, nv = g.attributes.position.count, a = texAncora();
var uv = (g.attributes.uv && g.attributes.uv.array.length === nv * 2) ? g.attributes.uv.array : new Float32Array(nv * 2);
for (var i = 0; i < parte.faixas.length; i++) {
var f = parte.faixas[i], ref = f.ref; if (!ref || !ref.geometry) continue;
texMotor().uvDeMalha(ref.geometry.attributes.position.array, ref.geometry.attributes.normal ? ref.geometry.attributes.normal.array : null,
(ref.userData._matFechada || ref.matrix).elements, t.escala, t.asp, a, uv, f.iniVert);
}
if (!g.attributes.uv || g.attributes.uv.array !== uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); else g.attributes.uv.needsUpdate = true;
}
function texVestirAgreg(ag) {
if (!ag) return;
ag.partes.forEach(function (parte) {
var t = parte.bucket && parte.bucket.tex; if (!t) return;
if (t.slug) texUvParte(parte);
parte.malha.material.userData.agregado = true;
texVestirMat(parte.malha.material, t, t.slug ? [1, 1, 1] : null);
});
ag._sujoTex = true;
}
function texDespirAgreg(ag) {
if (!ag) return;
ag.partes.forEach(function (parte) { if (parte.bucket && parte.bucket.tex) texDespirMat(parte.malha.material); });
ag._sujoTex = true;
}
function texSujar() {
S.modelos.forEach(function (mo) {
if (mo._agreg) mo._agreg._sujoTex = true;
if (mo.alpha < 0.99) { Object.keys(mo.transCache).forEach(function (k) { try { mo.transCache[k].dispose(); } catch (_) {} }); mo.transCache = {}; refreshModelo(mo); }
});
Object.keys(S.vistas || {}).forEach(function (id) {
var v = S.vistas[id]; if (!v || !v.cache) return;
Object.keys(v.cache).forEach(function (k) { var c = v.cache[k]; if (c && c.mat) { try { c.mat.dispose(); } catch (_) {} } delete v.cache[k]; });
});
}
function estMatsBase() {
var vistos = {}, out = [];
function por(b) { if (b && b.isMaterial && !vistos[b.id]) { vistos[b.id] = 1; out.push(b); } }
S.modelos.forEach(function (mo) {
Object.keys(mo.matCache || {}).forEach(function (k) { por(mo.matCache[k]); });
mo.grupo.children.forEach(function (m) { if (m.isMesh) por(m.userData && m.userData.matOrig); });
});
Object.keys(acabMats).forEach(function (k) { por(acabMats[k]); });
return out;
}
function texMateriais() {
return estMatsBase().filter(function (mt) { return mt.userData && mt.userData.tex; });
}
function texAplicar(on, motivo) {
var B = texMotor();
TEXR.on = !!on && !!B; TEXR.motivo = motivo || '';
var seq = ++TEXR.seq, mats = texMateriais();
if (!TEXR.on) {
mats.forEach(texDespirMat);
S.modelos.forEach(function (mo) { texDespirAgreg(mo._agreg); });
texSujar();
return Promise.resolve(texEstado());
}
var slugs = {};
mats.forEach(function (mt) { if (mt.userData.tex.slug) slugs[mt.userData.tex.slug] = 1; });
var t0 = (typeof performance !== 'undefined') ? performance.now() : 0;
S.modelos.forEach(function (mo) {
mo.grupo.children.forEach(function (m) {
var mo2 = m.userData.matOrig, t = mo2 && mo2.userData && mo2.userData.tex;
if (t && t.slug) texUvPeca(m, t);
});
});
acabSoltos = acabSoltos.filter(function (m) { return m.parent; });
acabSoltos.forEach(function (m) { var t = m.material && m.material.userData && m.material.userData.tex; if (t && t.slug) texUvPeca(m, t); });
var tUv = (typeof performance !== 'undefined') ? performance.now() - t0 : 0;
var pbr = TEXR.nivel !== 'textura';
return Promise.all(Object.keys(slugs).map(function (s) { return texCarregar(s, pbr); })).then(function () {
if (seq !== TEXR.seq || !TEXR.on || S !== Sm || !S.alive) return texEstado();
var t1 = (typeof performance !== 'undefined') ? performance.now() : 0;
mats.forEach(texVestir);
S.modelos.forEach(function (mo) { texVestirAgreg(mo._agreg); });
texSujar();
TEXR.ultimo = { msUv: Math.round(tUv), msVestir: Math.round(((typeof performance !== 'undefined') ? performance.now() : 0) - t1), msTotal: Math.round(((typeof performance !== 'undefined') ? performance.now() : 0) - t0) };
return texEstado();
});
}
function texTemPropriedade() {
var B = texMotor(); if (!B) return false;
return S.modelos.some(function (mo) { return (mo.elementos || []).some(function (e) { return (e.materiais || []).some(function (x) { return x && x.tx && B.existe(x.tx); }); }); });
}
function texDecisao() {
var B = texMotor();
if (!B) return { ligado: false, motivo: 'o motor de texturas não carregou' };
return B.padrao({ frota: texFrota(), pref: TEXR.pref, aparelho: texAparelho(), temPropriedade: texTemPropriedade() });
}
function texAuto() {
if (!texMotor()) return;
if (EST.fixo && estPrevia()) { estReaplicar(true); return; }
var d = texDecisao();
if (estPrevia() && d.ligado) { estiloVisual('realista', { auto: true, motivo: d.motivo }); return; }
if (d.ligado || TEXR.on) texAplicar(d.ligado, d.motivo).then(texAvisar); else { TEXR.motivo = d.motivo; texAvisar(); }
}
function texAvisar() { if (S && S.opts && S.opts.onMateriais) { try { S.opts.onMateriais(texEstado()); } catch (_) {} } }
function texLiberar() {
Object.keys(TEXR.cache).forEach(function (s) { var e = TEXR.cache[s]; ['cor', 'normal', 'rug'].forEach(function (k) { if (e.tex && e.tex[k]) { try { e.tex[k].dispose(); } catch (_) {} } }); });
TEXR.cache = {}; TEXR.ancora = null;
}
function texEstado() {
var mats = texMateriais(), porSlug = {}, vestidos = 0, fontes = { propriedade: 0, palavra: 0 };
mats.forEach(function (mt) { var t = mt.userData.tex; var k = t.slug || ('#' + t.classe); porSlug[k] = (porSlug[k] || 0) + 1; if (t.fonte) fontes[t.fonte] = (fontes[t.fonte] || 0) + 1; if (mt.map || (t.classe && mt.userData._fis)) vestidos++; });
return { on: TEXR.on, motivo: TEXR.motivo, frota: texFrota(), pref: TEXR.pref, materiais: mats.length, vestidos: vestidos, porTextura: porSlug, fontes: fontes,
carregadas: Object.keys(TEXR.cache).filter(function (s) { return TEXR.cache[s].ok; }), erros: Object.keys(TEXR.cache).filter(function (s) { return TEXR.cache[s].erro; }).map(function (s) { return TEXR.cache[s].erro; }),
ancora: TEXR.ancora, tempo: TEXR.ultimo };
}
function texEscolher(on) {
if (!texFrota()) return texAplicar(false, 'desligado para todas as instalações').then(function (e) { texAvisar(); return e; });
texGravarPref(on);
var d = texDecisao();
return texAplicar(d.ligado, d.motivo).then(function (e) { texAvisar(); return e; });
}
function texGravarPref(on) {
if (!texFrota()) return false;
TEXR.pref = on ? '1' : '0';
try { localStorage.setItem('orcapro:bim:materiais', TEXR.pref); } catch (_) {}
return true;
}
var ABR = { ativas: [], dur: 0.7 };
function abrMotor() { return (typeof window !== 'undefined' && window.BimAbrir) ? window.BimAbrir : null; }
function abrIndice(mo) {
if (mo._abr) return mo._abr;
if (mo.editor) return (mo._abr = partesIndiceEdit(mo));
var B = abrMotor(); if (!B) return null;
var cb = mo.carimbos || {};
var pecas = (mo.elementos || []).map(function (e) { var c = cb[e.id] || {}; return { id: e.id, globalId: e.globalId, abertura: c.abertura || null, folhaDe: c.folhaDe || null }; });
var ix = B.indice(pecas), malhas = {};
mo.grupo.children.forEach(function (m) { if (m.isMesh && m.userData.expressID != null) (malhas[m.userData.expressID] = malhas[m.userData.expressID] || []).push(m); });
Object.keys(ix.portas).forEach(function (k) {
var pt = ix.portas[k]; pt.mid = mo.mid; pt.t = 0; pt.alvo = 0;
pt.folhas.forEach(function (f) { f.malhas = []; f.ids.forEach(function (id) { (malhas[id] || []).forEach(function (m) { f.malhas.push(m); }); }); });
});
mo._abr = ix;
return ix;
}
function abrDe(uid) {
var s = String(uid == null ? '' : uid), i = s.lastIndexOf(':'); if (i < 0) return null;
var midS = s.slice(0, i), id = +s.slice(i + 1), mo = null;
S.modelos.forEach(function (m) { if (String(m.mid) === midS) mo = m; });
if (!mo) return null;
var ix = abrIndice(mo); if (!ix) return null;
var pid = ix.portas[id] ? id : ix.pecaDaPorta[id];
return pid != null ? (ix.portas[pid] || null) : null;
}
var _abrT = null, _abrM = null;
function abrAplicar(pt) {
var B = abrMotor(), k = B.suave(pt.t);
if (!_abrT) { _abrT = new THREE.Matrix4(); _abrM = new THREE.Matrix4(); }
pt.folhas.forEach(function (f) {
if (f.folha.movimento === 'fixa') return;
var P = f.folha.poseFn ? f.folha.poseFn(k) : B.pose(f.folha, k);
f.malhas.forEach(function (m) {
if (!m.userData._matFechada) m.userData._matFechada = m.matrix.clone();
if (pt.t === (pt.repouso || 0)) {
m.userData._matFechada.decompose(m.position, m.quaternion, m.scale); m.updateMatrix(); m.userData._solta = !!m.userData._apSolta;
if (m.userData._apM0) m.userData._apM0.copy(m.matrix);
return;
}
_abrT.fromArray(P); _abrM.multiplyMatrices(_abrT, m.userData._matFechada);
_abrM.decompose(m.position, m.quaternion, m.scale); m.updateMatrix(); m.userData._solta = true;
if (m.userData._apM0) m.userData._apM0.copy(m.matrix);
});
});
}
function abrirFechar(uid, abrir) {
var pt = abrDe(uid); if (!pt || !pt.moveis) return null;
pt.alvo = (abrir == null) ? (pt.alvo > 0 ? 0 : 1) : (abrir ? 1 : 0);
if (ABR.ativas.indexOf(pt) < 0) ABR.ativas.push(pt);
return pt.alvo > 0;
}
S._tickExtra.push(function (dt) {
if (!ABR.ativas.length) return;
var B = abrMotor(); if (!B) { ABR.ativas = []; return; }
ABR.ativas = ABR.ativas.filter(function (pt) {
if (!S.modelos.some(function (mo) { return mo.mid === pt.mid; })) return false;
pt.t = B.passo(pt.t, pt.alvo, dt, pt.dur || ABR.dur);
abrAplicar(pt);
var fim = pt.t === pt.alvo;
if (fim && S.selected && S._contornoSelecao && pt.folhas.some(function (f) { return f.malhas.indexOf(S.selected) >= 0; })) S._contornoSelecao(S.selected);
return !fim;
});
});
function abrResumo(pt) {
return { porta: pt.mid + ':' + pt.id, globalId: pt.globalId, tipo: pt.ab.tipo, nomeTipo: abrMotor().nomeTipo(pt.ab.tipo), folhas: pt.folhas.length,
moveis: pt.moveis, aberta: pt.alvo > 0, t: pt.t, convencao: pt.ab.convencao, avisos: pt.ab.avisos.slice() };
}
S._aberturaDe = function (uid) { var pt = abrDe(uid); return pt ? abrResumo(pt) : null; };
S._abrirFechar = abrirFechar;
S._portas = function () {
var out = [];
S.modelos.forEach(function (mo) { var ix = abrIndice(mo); if (!ix) return; Object.keys(ix.portas).forEach(function (k) { out.push(abrResumo(ix.portas[k])); }); });
return out;
};
S._partesEstado = {};
function partesPM() { return (typeof window !== 'undefined' && window.PartesMoveis) ? window.PartesMoveis : null; }
var ROT_PARTE = { giro: 'porta', pivotante: 'porta', basculante: 'folha basculante', correr: 'folha de correr', gaveta: 'gaveta', recolher: 'folha de vidro' };
function parteChave(m) { return (m.userData.parteDe != null ? m.userData.parteDe : m.userData.expressID) + '|' + m.userData.parte; }
function partesIndiceEdit(mo) {
var PM = partesPM(), ix = { portas: {}, pecaDaPorta: {}, edit: true };
if (!PM || !mo.partes) return ix;
var malhas = {};
mo.grupo.children.forEach(function (m) {
if (m.isMesh && m.userData.parte && m.userData.expressID != null) { var kk = parteChave(m); (malhas[kk] = malhas[kk] || []).push(m); }
});
mo.partes.forEach(function (fi) {
fi.partes.forEach(function (p) {
var k = fi.id + '|' + p.id, ms = malhas[k]; if (!ms || !ms.length) return;
var ses = S._partesEstado[k], fr = (ses && ses.base === fi.fracao) ? ses.alvo : fi.fracao;
var baseP = p.geoEstado ? fi.fracao : 0, kBase = baseP * baseP * (3 - 2 * baseP);
var pt = { mid: mo.mid, id: fi.id, parte: p.id, chave: k, nome: fi.nome, categoria: fi.categoria, rotulo: (p.nome || ROT_PARTE[p.tipo] || p.tipo), tipo: p.tipo, grupo: p.grupo || '', base: fi.fracao, dur: 0.6,
ab: { tipo: String(p.tipo).toUpperCase(), convencao: 'v1', avisos: [] }, globalId: '', moveis: 1, t: fr, alvo: fr,
folhas: [{ ids: [fi.id], malhas: ms, folha: { movimento: p.movimento, poseFn: (function (pp, ii, bb, kb) { return function (kk) { var Mt = PM.poseMundo(pp, kk, ii); return bb ? PM.mult(Mt, PM.inversaRigida(PM.poseMundo(pp, kb, ii, { sinc: true }))) : Mt; }; })(p, fi.inst, baseP > 0, kBase) } }] };
pt.repouso = baseP;
ix.portas[k] = pt;
});
});
return ix;
}
S._partesIniciar = function (mo) {
var ix = abrIndice(mo); if (!ix) return;
Object.keys(ix.portas).forEach(function (k) { var pt = ix.portas[k]; if (pt.t > 0) abrAplicar(pt); });
};
function partesDoEditor() { var ed = null; S.modelos.forEach(function (m) { if (m.editor) ed = m; }); return ed; }
S._partes = {
dur: 0.6,
versao: function () { return S._partesVersao || 0; },
indice: function () { var mo = partesDoEditor(); return mo ? abrIndice(mo) : null; },
lista: function () { var ix = this.indice(); return ix ? Object.keys(ix.portas).map(function (k) { return ix.portas[k]; }) : []; },
total: function () { return this.lista().length; },
de: function (mesh) { var ix = this.indice(); return ix && mesh && mesh.userData && mesh.userData.parte ? (ix.portas[parteChave(mesh)] || null) : null; },
abrir: function (pt, abrir) {
if (!pt) return null;
var novo = (abrir == null) ? (pt.alvo > 0 ? 0 : 1) : (abrir ? 1 : 0), self = this;
var alvos = pt.grupo ? this.lista().filter(function (q) { return q.id === pt.id && q.grupo === pt.grupo; }) : [pt];
alvos.forEach(function (q) {
q.alvo = novo;
S._partesEstado[q.chave] = { alvo: q.alvo, base: q.base };
if (ABR.ativas.indexOf(q) < 0) ABR.ativas.push(q);
});
void self;
return pt.alvo > 0;
},
todas: function (abrir) {
var n = 0, self = this; this.lista().forEach(function (pt) { if ((pt.alvo > 0) !== !!abrir) { self.abrir(pt, abrir); n++; } });
return n;
},
estado: function () { return this.lista().map(function (pt) { return { id: pt.id, parte: pt.parte, tipo: pt.tipo, t: pt.t, alvo: pt.alvo, meshes: pt.folhas[0].malhas.length }; }); }
};
S._partesTela = function (id, parte) {
var ix = S._partes.indice(), pt = ix && ix.portas[id + '|' + parte]; if (!pt) return null;
var bb = new THREE.Box3(); pt.folhas[0].malhas.forEach(function (m) { m.updateWorldMatrix(true, false); bb.expandByObject(m); });
if (bb.isEmpty()) return null;
var c = bb.getCenter(new THREE.Vector3()), t = S._telaDe(c.x, c.y, c.z);
return { x: t.x, y: t.y, atras: !!t.atras, centro: [c.x, c.y, c.z], min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z], t: pt.t, alvo: pt.alvo };
};
S._texVestir = function (mat) { if (TEXR.on) texVestir(mat); };
S._texAuto = texAuto; S._texEscolher = texEscolher; S._texEstado = texEstado; S._texLiberar = texLiberar; S._texAplicar = texAplicar; S._texGravarPref = texGravarPref;
S._tickExtra.push(function () { sincronizarAgregado(); });
S._tickExtra.push(function () { if (S._cristalTickEscala) S._cristalTickEscala(); });
var EST = { modo: 'sombreado', fixo: false, ar: {}, luz: null, real: null, mat: null, ultimo: null };
var acabMats = {}, acabSoltos = [];
function acabEnt(nome) { return window.BimAcabVis ? window.BimAcabVis.porNome(nome) : null; }
function acabTex(ent) {
var B = texMotor(); if (!ent || !ent.slug || !B || !B.existe(ent.slug)) return null;
return { slug: ent.slug, escala: B.BIB[ent.slug].m, asp: B.BIB[ent.slug].asp || 1, fonte: 'acabamento', classe: '', material: ent.rotulo, termo: ent.id };
}
function acabMat(ent, sobre) {
var k = ent.id + (sobre ? '|p' : '');
if (acabMats[k]) return acabMats[k];
var c = window.BimAcabVis.rgb(ent.cor);
var mt = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace), metalness: ent.met || 0, roughness: ent.rug == null ? 0.8 : ent.rug, side: THREE.DoubleSide });
if (ent.op) { mt.transparent = true; mt.opacity = ent.op; mt.depthWrite = false; }
if (sobre) { mt.polygonOffset = true; mt.polygonOffsetFactor = -2; mt.polygonOffsetUnits = -40; }
mt.userData.corLin = mt.color.clone(); mt.userData.acab = ent.id; mt.userData.acabEnt = ent;
acabMats[k] = mt;
estMarcarMat(mt, ent.rotulo);
return mt;
}
function acabRegistrar(mesh) {
acabSoltos = acabSoltos.filter(function (m) { return m.parent; });
acabSoltos.push(mesh);
mesh.receiveShadow = !!dir.castShadow; mesh.castShadow = false;
var mt = mesh.material, t = mt && mt.userData && mt.userData.tex;
if (!TEXR.on || !t || !t.slug) return;
texUvPeca(mesh, t);
if (!mt.map) texCarregar(t.slug, TEXR.nivel !== 'textura').then(function () { if (TEXR.on && S && S.alive) texVestir(mt); });
}
function acabBaseParede(c) {
var ks = Object.keys(c.pinturas || {}).sort(function (a, b) { return a === 'fora|0' ? -1 : (b === 'fora|0' ? 1 : (a < b ? -1 : 1)); });
for (var i = 0; i < ks.length; i++) { var ent = acabEnt(c.pinturas[ks[i]] && c.pinturas[ks[i]].material); if (ent && ent.grupo !== 'agua') return acabMat(ent, false); }
return null;
}
S._acabMat = acabMat; S._acabRegistrar = acabRegistrar;
S._tickExtra.push(function () {
if (!acabSoltos.length) return;
for (var i = 0; i < acabSoltos.length; i++) {
var m = acabSoltos[i], id = m.userData && m.userData.p4Pintura, base = id != null ? S.meshPorUid['edit:' + id] : null;
if (base) m.visible = base.visible !== false && !!base.parent;
}
});
function estPrevia() { try { return document.documentElement.getAttribute('data-visual') === 'nova'; } catch (_) { return false; } }
function estPlano(m) { var B = texMotor(); return B ? B.planoEstilo(m) : { estilo: 'sombreado', nome: 'Sombreado', texturas: false }; }
function estTrocas() { try { return (window.BimEstilo && window.BimEstilo.trocasAtuais) ? (window.BimEstilo.trocasAtuais() || {}) : {}; } catch (_) { return {}; } }
try { var _e0 = localStorage.getItem('orcapro:bim:estilo-visual'); if (_e0 && estPrevia() && texMotor() && texMotor().estiloValido(_e0)) { EST.modo = _e0; EST.fixo = true; } } catch (_) {}
function estLinhaFaces(on) {
var mudou = 0;
estMatsBase().forEach(function (mt) {
if (on) {
if (mt.userData._linha) return;
mt.userData._linha = { c: mt.color.clone(), po: mt.polygonOffset, pf: mt.polygonOffsetFactor, pu: mt.polygonOffsetUnits, r: mt.roughness, me: mt.metalness, ei: mt.envMapIntensity };
var g = (mt.transparent && mt.opacity < 0.95) ? 0.9 : 0.97;
mt.color.setRGB(g, g, g);
mt.polygonOffset = true; mt.polygonOffsetFactor = 1; mt.polygonOffsetUnits = 1;
mt.roughness = 1; mt.metalness = 0;
mt.needsUpdate = true; mudou++;
} else {
var s = mt.userData._linha; if (!s) return;
mt.color.copy(s.c); mt.polygonOffset = s.po; mt.polygonOffsetFactor = s.pf; mt.polygonOffsetUnits = s.pu;
mt.roughness = s.r; mt.metalness = s.me; mt.envMapIntensity = s.ei;
delete mt.userData._linha; mt.needsUpdate = true; mudou++;
}
});
estPolyBuckets(!!on);
if (mudou) texSujar();
return mudou;
}
function estPolyBuckets(on) {
S.modelos.forEach(function (mo) {
if (!mo._agreg) return;
mo._agreg.partes.forEach(function (p) {
var mt = p.malha.material; if (!mt || mt.polygonOffset === on) return;
mt.polygonOffset = on; mt.polygonOffsetFactor = on ? 1 : 0; mt.polygonOffsetUnits = on ? 1 : 0; mt.needsUpdate = true;
});
});
}
function estLuz(on) {
if (on) {
if (!EST.luz) {
EST.luz = { hc: hemi.color.clone(), hg: hemi.groundColor.clone(), fc: fill.color.clone(), tm: renderer.toneMapping, env: scene.environment, grid: grid.visible, chao: _chao.visible };
hemi.color.setRGB(1, 1, 1); hemi.groundColor.setRGB(0.6, 0.6, 0.6); fill.color.setRGB(1, 1, 1);
renderer.toneMapping = THREE.NoToneMapping; scene.environment = null;
grid.visible = false; _chao.visible = false;
}
} else if (EST.luz) {
var l = EST.luz; EST.luz = null;
hemi.color.copy(l.hc); hemi.groundColor.copy(l.hg); fill.color.copy(l.fc);
renderer.toneMapping = l.tm; scene.environment = (S._envAntigos && S._envAntigos.indexOf(l.env) >= 0) ? envPadrao3d : l.env; grid.visible = l.grid; _chao.visible = l.chao;
}
try { aplicarTema(); } catch (_) {}
}
S._linhaOn = function () { return !!EST.luz; };
function estArestasMontar(mo) {
var t0 = (typeof performance !== 'undefined') ? performance.now() : 0;
var orig = S._origemAgreg || texAncora(), faixas = [], tot = 0, pulados = 0;
mo.grupo.children.forEach(function (m) {
if (!m.isMesh || m.userData.expressID == null || !m.geometry || !m.geometry.attributes || !m.geometry.attributes.position) return;
if (nVerts(m.geometry) > SNAP_MAX_VERT) { pulados++; return; }
var arr = arestasDe(m.geometry); if (!arr.length) return;
faixas.push({ ref: m, ini: tot / 3, n: arr.length / 3, arr: arr, M: (m.userData._matFechada || m.matrix).elements });
tot += arr.length;
});
var pos = new Float32Array(tot), o = 0;
faixas.forEach(function (f) {
var M = f.M, a = f.arr;
for (var i = 0; i < a.length; i += 3) {
var x = a[i], y = a[i + 1], z = a[i + 2];
pos[o++] = M[0] * x + M[4] * y + M[8] * z + M[12] - orig[0];
pos[o++] = M[1] * x + M[5] * y + M[9] * z + M[13] - orig[1];
pos[o++] = M[2] * x + M[6] * y + M[10] * z + M[14] - orig[2];
}
delete f.arr; delete f.M;
});
var g = new THREE.BufferGeometry();
g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
var idx = new Uint32Array(Math.max(1, tot / 3));
g.setIndex(new THREE.BufferAttribute(idx, 1)); g.setDrawRange(0, 0);
if (!EST.mat) EST.mat = new THREE.LineBasicMaterial({ color: 0x151515 });
var ls = new THREE.LineSegments(g, EST.mat);
ls.position.set(orig[0], orig[1], orig[2]); ls.frustumCulled = false;
ls.raycast = function () {};
var grupo = new THREE.Group(); grupo.add(ls); grupo.userData.arestasDe = mo.mid;
scene.add(grupo);
return { mo: mo, grupo: grupo, ls: ls, faixas: faixas, idx: idx, sig: null, segmentos: tot / 6, pulados: pulados,
ms: Math.round(((typeof performance !== 'undefined') ? performance.now() : 0) - t0) };
}
function estArestasSoltar(e) {
if (!e) return;
try { scene.remove(e.grupo); e.ls.geometry.dispose(); } catch (_) {}
}
function estArestasSync() {
var vivos = {};
S.modelos.forEach(function (mo) {
var e = EST.ar[mo.mid];
if (e && e.mo !== mo) { estArestasSoltar(e); e = null; }
if (!e) e = EST.ar[mo.mid] = estArestasMontar(mo);
vivos[mo.mid] = 1;
e.grupo.position.copy(modelRoot.position); e.grupo.quaternion.copy(modelRoot.quaternion); e.grupo.scale.copy(modelRoot.scale);
e.grupo.visible = !estiloD.on && modelRoot.visible !== false && mo.grupo.visible !== false;
var fx = e.faixas, sig = 0, k, m, mt, vis;
for (k = 0; k < fx.length; k++) {
m = fx[k].ref; mt = m.material;
vis = m.visible !== false && m.parent === mo.grupo && !(m.userData && m.userData._solta) && !(mt && mt.transparent && mt.opacity < 0.15);
fx[k].vis = vis;
sig = (sig * 31 + (vis ? 2 : 1)) | 0;
}
if (sig === e.sig) return;
e.sig = sig;
var n = 0;
for (k = 0; k < fx.length; k++) { if (!fx[k].vis) continue; for (var q = 0; q < fx[k].n; q++) e.idx[n++] = fx[k].ini + q; }
e.ls.geometry.index.needsUpdate = true; e.ls.geometry.setDrawRange(0, n);
});
Object.keys(EST.ar).forEach(function (k) { if (!vivos[k]) { estArestasSoltar(EST.ar[k]); delete EST.ar[k]; } });
}
function estArestasLigar(on) {
if (on) { estArestasSync(); return; }
Object.keys(EST.ar).forEach(function (k) { estArestasSoltar(EST.ar[k]); });
EST.ar = {};
}
function estLuzAplicar() {
var a = EST.luzAj, R = EST.real; if (!a || !R) return false;
if (!R.luzOrig) { var x0 = 1; try { x0 = renderer.toneMappingExposure; } catch (_) {} R.luzOrig = { h: hemi.intensity, f: fill.intensity, x: x0 }; }
if (a.hemi != null) hemi.intensity = +a.hemi;
if (a.fill != null) fill.intensity = +a.fill;
if (a.sol != null) dir.intensity = +a.sol;
if (a.expo != null) { try { renderer.toneMappingExposure = +a.expo; } catch (_) {} }
if (a.az != null && a.el != null && R.c) {
var az = +a.az * Math.PI / 180, el = +a.el * Math.PI / 180, rr = R.r;
dir.position.set(R.c.x + rr * Math.cos(el) * Math.sin(az), R.c.y + rr * Math.sin(el), R.c.z + rr * Math.cos(el) * Math.cos(az));
}
if (a.env != null && TEXR.env !== +a.env) { TEXR.env = +a.env; if (TEXR.on) texAplicar(true, TEXR.motivo); }
return true;
}
S._estLuz = function (o) { EST.luzAj = o && typeof o === 'object' ? o : null; return estLuzAplicar(); };
function estRealista(on) {
if (on) {
if (EST.real) { ligarSombras(true); return; }
var sc = dir.shadow.camera;
EST.real = { cast: dir.castShadow, di: dir.intensity, dp: dir.position.clone(), tp: dir.target.position.clone(), alvoNaCena: !!dir.target.parent,
cam: [sc.left, sc.right, sc.top, sc.bottom, sc.far] };
try {
var b = new THREE.Box3().setFromObject(modelRoot);
if (!b.isEmpty()) {
var c = b.getCenter(new THREE.Vector3()), r = Math.max(15, b.getSize(new THREE.Vector3()).length() * 0.6);
dir.target.position.copy(c); if (!dir.target.parent) scene.add(dir.target);
dir.position.set(c.x + r * 0.6, c.y + r * 1.0, c.z + r * 0.4);
sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.far = r * 4; sc.updateProjectionMatrix();
EST.real.c = c.clone(); EST.real.r = r;
}
} catch (_) {}
EST.real.sombra = ligarSombras(true);
dir.intensity = 1.15;
estLuzAplicar();
} else if (EST.real) {
var s = EST.real; EST.real = null;
if (s.luzOrig) { hemi.intensity = s.luzOrig.h; fill.intensity = s.luzOrig.f; try { renderer.toneMappingExposure = s.luzOrig.x; } catch (_) {} }
if (!s.cast) ligarSombras(false);
dir.intensity = s.di; dir.position.copy(s.dp); dir.target.position.copy(s.tp);
if (!s.alvoNaCena && dir.target.parent) dir.target.parent.remove(dir.target);
var sc2 = dir.shadow.camera; sc2.left = s.cam[0]; sc2.right = s.cam[1]; sc2.top = s.cam[2]; sc2.bottom = s.cam[3]; sc2.far = s.cam[4]; sc2.updateProjectionMatrix();
}
}
S._tickExtra.push(function () {
if (EST.luz) { estArestasSync(); estPolyBuckets(true); }
if (EST.real) {
var falta = false;
S.modelos.forEach(function (mo) { if (mo._agreg && mo._agreg.partes.length && !mo._agreg.partes[0].malha.castShadow) falta = true; });
if (falta) ligarSombras(true);
}
});
function estEstado() {
var p = estPlano(EST.modo), seg = 0, ms = 0, pul = 0;
Object.keys(EST.ar).forEach(function (k) { seg += EST.ar[k].segmentos; ms += EST.ar[k].ms; pul += EST.ar[k].pulados; });
var t = texEstado();
return { modo: EST.modo, nome: p.nome, fixo: EST.fixo, previa: estPrevia(), arestas: { modelos: Object.keys(EST.ar).length, segmentos: seg, ms: ms, pulados: pul },
linha: !!EST.luz, realista: !!EST.real, sombras: !!dir.castShadow, texturas: { on: t.on, nivel: TEXR.nivel || 'realista', vestidos: t.vestidos, carregadas: t.carregadas, erros: t.erros },
tom: renderer.toneMapping === THREE.NoToneMapping ? 'nenhum' : 'aces', ultimo: EST.ultimo };
}
function estAvisar() {
try { window.dispatchEvent(new CustomEvent('bim:estilo', { detail: { modo: EST.modo } })); } catch (_) {}
}
function estiloVisual(modo, o) {
o = o || {};
var B = texMotor();
if (!B || !B.estiloValido(modo)) return Promise.resolve(estEstado());
var p = B.planoEstilo(modo), t0 = (typeof performance !== 'undefined') ? performance.now() : 0;
if (estiloD.on && !o.manterDesenho && !o.auto) setEstiloDesenho(false);
EST.modo = p.estilo; if (!o.auto) EST.fixo = true;
if (!o.naoGravar && !o.auto) { try { localStorage.setItem('orcapro:bim:estilo-visual', EST.modo); } catch (_) {} }
if (!p.arestas) estArestasLigar(false);
if (!p.facesClaras) estLinhaFaces(false);
if (!p.luzNeutra) estLuz(false);
if (!p.sombras) estRealista(false);
TEXR.nivel = p.pbr ? 'realista' : 'textura'; TEXR.env = p.env;
if (p.sombras && EST.luzAj && EST.luzAj.env != null) TEXR.env = +EST.luzAj.env;
var querTex = p.texturas && texFrota();
var pr = texAplicar(querTex, o.motivo || ('estilo ' + p.nome));
if (p.facesClaras) estLinhaFaces(true);
if (p.luzNeutra) estLuz(true);
if (p.arestas) estArestasLigar(true);
if (p.sombras) estRealista(true);
return pr.then(function () {
EST.ultimo = { modo: EST.modo, ms: Math.round(((typeof performance !== 'undefined') ? performance.now() : 0) - t0) };
texAvisar(); estAvisar();
return estEstado();
});
}
function estReaplicar() {
if (!EST.fixo || !estPrevia()) return;
estiloVisual(EST.modo, { auto: true });
}
S._reaplicarEstiloVisual = function () {
if (!EST.fixo || !estPrevia()) return;
if (EST.luz) estLinhaFaces(true);
if (EST.real) ligarSombras(true);
};
var EST_NOMES_EDITOR = { parede: 'Alvenaria', laje: 'Laje de concreto', pilar: 'Concreto armado', viga: 'Concreto armado', cobertura: 'Telha cerâmica' };
function estMarcarMat(mat, nome) {
if (!mat || !mat.userData) return false;
var B = texMotor(); if (!B) return false;
if (!mat.userData.corLin) mat.userData.corLin = mat.color.clone();
mat.userData.nomeMaterial = nome;
var acEnt = estPrevia() ? acabEnt(nome) : null;
var tex = acEnt ? acabTex(acEnt) : (estPrevia() ? texDe([{ n: nome }], mat.transparent ? mat.opacity : 1) : null);
var kN = tex ? B.chave(tex) : '', kV = mat.userData.tex ? B.chave(mat.userData.tex) : '';
if (kN === kV) return false;
if (mat.map || mat.userData._fis) texDespirMat(mat);
if (tex) { var c = mat.userData.corLin.clone().convertLinearToSRGB(); mat.userData.tex = tex; mat.userData.corIfc = [c.r, c.g, c.b]; }
else { delete mat.userData.tex; delete mat.userData.corIfc; }
return true;
}
function estMarcarEditor() {
var n = 0;
if (editMats) Object.keys(EST_NOMES_EDITOR).forEach(function (k) { if (editMats[k] && estMarcarMat(editMats[k], EST_NOMES_EDITOR[k])) n++; });
Object.keys(famMats).forEach(function (k) { if (estMarcarMat(famMats[k], famMats[k].userData.nomeMaterial || k)) n++; });
return n;
}
function estRedecidir() {
var B = texMotor(); if (!B) return 0;
var afetados = [], n = 0;
S.modelos.forEach(function (mo) {
if (mo.mid === 'edit') return;
var getMat = criarGetMat(mo), porId = {}, trocas = [];
(mo.elementos || []).forEach(function (e) { porId[e.id] = e; });
mo.grupo.children.forEach(function (m) {
if (!m.isMesh || m.userData.expressID == null) return;
var velho = m.userData.matOrig, rgba = velho && velho.userData && velho.userData.rgba;
if (!rgba) return;
var el = porId[m.userData.expressID], tex = texDe(el && el.materiais, rgba[3]);
if ((tex ? B.chave(tex) : '') === (velho.userData.tex ? B.chave(velho.userData.tex) : '')) return;
trocas.push([m, velho, getMat(rgba[0], rgba[1], rgba[2], rgba[3], tex)]);
});
if (!trocas.length) return;
trocas.forEach(function (x) {
var m = x[0], velho = x[1], novo = x[2];
var pm = S.selected === m ? S.prevMat : null;
var pmBase = !!pm && (pm === velho || Object.keys(mo.transCache || {}).some(function (k) { return mo.transCache[k] === pm; }));
m.userData.matOrig = novo;
if (pmBase) S.prevMat = matBase(m);
if (m.userData._matAntesEstilo === velho) m.userData._matAntesEstilo = novo;
});
refreshModelo(mo);
n += trocas.length; afetados.push(mo);
});
if (estMarcarEditor()) S.modelos.forEach(function (mo) { if (mo.mid === 'edit') afetados.push(mo); });
afetados.forEach(function (mo) { if (mo._agreg) { desagregarModelo(mo); agregarModelo(mo); } });
if (estiloD.on) setEstiloDesenho(true, true);
if (afetados.length) {
if (TEXR.on) texAplicar(true, TEXR.motivo).then(texAvisar); else texSujar();
if (EST.luz) estLinhaFaces(true);
if (EST.real) ligarSombras(true);
}
return n;
}
function estMaterialDaPeca(uid) {
var B = texMotor(), m = S.meshPorUid && S.meshPorUid[uid];
if (!B || !m) return null;
var mo = modeloDe(m.userData.mid), el = null, nomes = [];
((mo && mo.elementos) || []).some(function (e) { if (e.id === m.userData.expressID) { el = e; return true; } return false; });
((el && el.materiais) || []).forEach(function (x) { var nm = String((x && x.n) || '').trim(); if (nm && nomes.indexOf(nm) < 0) nomes.push(nm); });
if (!nomes.length && mo) mo.grupo.children.forEach(function (mm) {
if (mm.userData.expressID !== m.userData.expressID) return;
var nm = mm.userData.matOrig && mm.userData.matOrig.userData && mm.userData.matOrig.userData.nomeMaterial;
if (nm && nomes.indexOf(nm) < 0) nomes.push(nm);
});
var t = m.userData.matOrig && m.userData.matOrig.userData && m.userData.matOrig.userData.tex, tr = estTrocas();
return {
uid: uid, previa: estPrevia(),
materiais: nomes.map(function (nm) { var c = B.casar(nm), k = B.chaveMaterial(nm); return { nome: nm, chave: k, troca: tr[k] || '', casou: c ? (c.slug || ('#' + c.classe)) : '', termo: c ? c.termo : '' }; }),
textura: t ? (t.slug || ('#' + t.classe)) : '', nomeTextura: t ? B.nomeDe(t.slug || ('#' + t.classe)) : '', fonte: t ? t.fonte : '', termo: t ? (t.termo || '') : ''
};
}
S._estiloVisual = estiloVisual; S._estEstado = estEstado; S._estRedecidir = estRedecidir; S._estMaterialDaPeca = estMaterialDaPeca; S._estPrevia = estPrevia;
function ferramentaClique() { return medir.on || area.on || ang.on || ctec.ativo || cota.on || (S.edit && S.edit.on); }
var toolFechou = null, _upAtual = null;
function marcarFechamento() { toolFechou = _upAtual ? { x: _upAtual.x, y: _upAtual.y, t: performance.now() } : { x: -1e9, y: -1e9, t: performance.now() }; }
var _toque = null, _dedos = 0;
canvasEl.addEventListener('pointerdown', function (e) {
if (!S || !S.alive) return;
_dedos++;
if (e.pointerType) _ptrTipo = e.pointerType;
_toque = (_dedos === 1 && e.button === 0) ? { x: e.clientX, y: e.clientY, t: performance.now(), ts: e.timeStamp || 0, id: e.pointerId } : null;
if (ferramentaClique()) medir.down = (e.button === 0) ? { x: e.clientX, y: e.clientY } : null;
if (e.pointerType === 'touch' && ferramentaClique() && medir.down && S._lupaAgendar) S._lupaAgendar(e);
if (S.lupa && S.lupa.on && S.lupa.id != null && e.pointerId !== S.lupa.id && S._lupaFechar) S._lupaFechar();
});
canvasEl.addEventListener('pointercancel', function (e) {
if (!S || !S.alive) return;
_dedos = Math.max(0, _dedos - 1); _toque = null;
medir.down = null;
if (S._lupaSoltar) S._lupaSoltar(e);
});
canvasEl.addEventListener('pointerup', function (e) {
if (!S || !S.alive) return;
var alvoLupa = S._lupaSoltar ? S._lupaSoltar(e) : null;
_dedos = Math.max(0, _dedos - 1);
var tq = _toque; _toque = null;
if (S._sel3Up && S._sel3Up(e)) { medir.down = null; return; }
if (tq && tq.id === e.pointerId && !ferramentaClique() && !fly.on && !xr.on && (visitante || S._aoTocar || S._aoClicarPeca || S._aoMarcarPonto || (S._sel3Clique && e.pointerType === 'touch'))) {
var tdx = e.clientX - tq.x, tdy = e.clientY - tq.y;
var durou = (tq.ts > 0 && e.timeStamp > 0) ? e.timeStamp - tq.ts : performance.now() - tq.t;
if (tdx * tdx + tdy * tdy <= 100 && durou < 500) {
if (S._aoMarcarPonto) { var fm = S._aoMarcarPonto, om = S._aoMarcarOpts; S._aoMarcarPonto = null; S._aoMarcarOpts = null; try { fm(S._icar.pontoNoChao(e.clientX, e.clientY, om)); } catch (eM) {} }
else if (S._aoTocar) { var fn = S._aoTocar; S._aoTocar = null; try { fn(pontoNaTela(e.clientX, e.clientY)); } catch (eT) {} }
else if (S._aoClicarPeca) cliqueColetor(e);
else if (!visitante && S._sel3Clique) S._sel3Clique(e);
else selecionarEm(e.clientX, e.clientY);
return;
}
}
if (!ferramentaClique() || e.button !== 0) { medir.down = null; return; }
if (!alvoLupa && !medir.down) return;
var dx = 0, dy = 0;
if (medir.down) { dx = e.clientX - medir.down.x; dy = e.clientY - medir.down.y; }
medir.down = null;
if (!alvoLupa && dx * dx + dy * dy > 100) return;
if (alvoLupa) { e = { clientX: alvoLupa.x, clientY: alvoLupa.y, button: 0, detail: 1, pointerType: 'touch' }; }
if (toolFechou && performance.now() - toolFechou.t < 400) {
var fdx = e.clientX - toolFechou.x, fdy = e.clientY - toolFechou.y;
if (e.detail >= 2 || fdx * fdx + fdy * fdy < 36) return;
}
_upAtual = { x: e.clientX, y: e.clientY };
var hit = raycastEm(e.clientX, e.clientY);
if (S.edit && S.edit.on && S.edit.sub) { editClique(e, hit); return; }
if (S.edit && S.edit.on && !S.edit.sub) {
if (S._sel3Clique) { S._sel3Clique(e); return; }
if (S._prec) S._prec.selecionar(e, hit);
if (hit && _ultimosHits[0]) {
var udP = _ultimosHits[0].object.userData;
if (opts.onPick) opts.onPick(propsDe(udP.mid !== undefined ? udP.mid : S.modelID, udP.expressID, udP.tipo));
}
return;
}
if (cota.on) {
if (!hit) { S._hint('Toque em cima de um tubo para ver o comprimento dele.'); return; }
var udC = hit.object.userData || {};
if (udC.expressID == null) { S._hint('Isso não é uma peça do modelo.'); return; }
var uidC = (udC.mid != null ? udC.mid : S.modelID) + ':' + udC.expressID;
var reg = null, ixC = cotaIndice();
for (var ic = 0; ic < ixC.length; ic++) if (ixC[ic].uid === uidC) { reg = ixC[ic]; break; }
if (!reg) {
var elC = null;
elementosVivos().forEach(function (x) { if (x.uid === uidC) elC = x; });
S._hint(elC && !cotaEhRede(elC)
? 'Essa peça não é tubulação — o modo Cotar rede vale para tubo, duto e conexão.'
: 'Este tubo não tem comprimento publicado no IFC. Use a trena para medir.');
marcarFechamento(); return;
}
if (cota.fixados[uidC]) delete cota.fixados[uidC]; else cota.fixados[uidC] = 1;
cota.chave = reg.chave;
if (cota.modo !== 'clicado') cota.modo = 'clicado';
cota.acum = cota.periodo;
S._hint(fmtDist(reg.L) + ' · ' + (reg.temFamilia ? reg.chave : 'sem família no IFC — “Iguais” usa o tipo'));
marcarFechamento(); return;
}
var sn = mirarParaClique(e.clientX, e.clientY, raioToque(e));
if (!sn || !sn.p) { S._hint((ctec.ativo ? '📝' : area.on ? '▱' : ang.on ? '∠' : '📏') + (ehToque() ? ' Toque em cima de uma superfície do modelo.' : ' Clique em cima de uma superfície do modelo.')); return; }
mostrarSnapMarca(sn, e.clientX, e.clientY);
if (ctec.ativo) { ctecClique(sn.p.clone()); return; }
var avisoMapa = function () { if (sn.mapa && window.BimTrenaMapa) S._hint((S._hintUltimo || '') + ' — ' + window.BimTrenaMapa.aviso([sn.mapa])); };
if (area.on) { areaClique(sn.p.clone(), sn.mapa); avisoMapa(); return; }
if (ang.on) { angClique(sn.p.clone(), sn.mapa); avisoMapa(); return; }
medir.pts.push({ p: sn.p.clone(), mapa: sn.mapa || '' });
if (medir.pts.length === 1) medir.dirAresta = dirDaAresta(sn);
if (medir.pts.length === 2) {
tirarProv();
_shift = !!e.shiftKey;
var rr = restringir(medir.pts[0].p, medir.pts[1].p);
var ok = desenharMedida(medir.pts[0].p, rr.p, rr.rot ? false : null, rr.rot, [medir.pts[0].mapa, medir.pts[1].mapa]); medir.pts = []; atualizarElastico(null);
marcarFechamento();
S._hint(trenaTxt(ok ? 'ok' : 'perto'));
avisoMapa();
} else {
var m0 = pontoMarca(medir.pts[0].p); addMed(m0); medir.prov = m0;
if (medir.eixo === 'aresta' && !medir.dirAresta) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '') + ' Para medir ao longo de uma aresta, comece o 1º ponto EM CIMA da aresta. Esta medida vai livre.');
else S._hint(trenaTxt('2o'));
avisoMapa();
}
});
var _snapHoverT = 0;
canvasEl.addEventListener('pointermove', function (e) {
if (!S || !S.alive) return;
if (S._lupaMover && S._lupaMover(e)) return;
if (S._colocar) S._colocar.mover(e);
if (S._p2d && S._p2d.mover(e)) return;
if (S._p3) S._p3.mover(e);
if (S._cot && S._cot.mover(e)) return;
if (S._metc && S._metc.mover(e)) return;
if (S._metp && S._metp.mover(e)) return;
if (S._mtq && S._mtq.mover(e)) return;
if (S._prec && S._prec.mover(e)) {
if (window.BimPlantaModelar && BimPlantaModelar.moverForma3d) BimPlantaModelar.moverForma3d();
return;
}
if (S.edit && S.edit.on && (((S.edit.sub === 'parede' || S.edit.sub === 'viga' || S.edit.sub === 'cobertura') && S.edit.p1) || S.edit.sub === 'familia' || (S._volPreviewa && S._volPreviewa())) && S._editPreviewMove) {
S._editPreviewMove(e);
}
if (!ferramentaClique() || !snap.on) return;
var t = performance.now(); if (t - _snapHoverT < 60) return; _snapHoverT = t;
_shift = !!e.shiftKey;
var sn = mirarEm(e.clientX, e.clientY, raioToque(e));
if (!sn || !sn.p) { esconderSnapMarca(); return; }
mostrarSnapMarca(sn, e.clientX, e.clientY);
});
function modeladorOn() { try { return !!(window.BimPrevia && BimPrevia.modelador()); } catch (_) { return false; } }
function SLx() { return window.BimSelecao || null; }
function uidDeMalha(m) { var ud = m && m.userData; return ud && ud.expressID != null ? (ud.mid != null ? ud.mid : S.modelID) + ':' + ud.expressID : null; }
function semFerramenta3d() {
if (medir.on || area.on || ang.on || ctec.ativo || cota.on) return false;
if (S.edit && S.edit.on && S.edit.sub) return false;
if (S._aoClicarPeca || S._aoMarcarPonto || S._aoTocar) return false;
if (S._apoiando) return false;
return !(fly.on || (xr && xr.on));
}
var selInst = [], selInstGrp = new THREE.Group(), selInstMat = null, selInstLin = null;
selInstGrp.userData.marcador = true; scene.add(selInstGrp);
function ehInstUid(u) { try { return !!(window.BimInstUI && BimInstUI.ehInst && BimInstUI.ehInst(u)); } catch (_) { return false; } }
function realcarInst() {
while (selInstGrp.children.length) selInstGrp.remove(selInstGrp.children[0]);
var mo = edit.modelo; if (!selInst.length || !mo) return;
if (!selInstMat) { selInstMat = new THREE.MeshBasicMaterial({ color: 0x2effa0, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); selInstLin = new THREE.LineBasicMaterial({ color: 0x2effa0, depthTest: false, transparent: true, opacity: 0.95 }); }
var s = {}; selInst.forEach(function (u) { s[u.slice(5)] = 1; });
mo.grupo.children.forEach(function (m) {
var ud = m.userData || {}; if (!s[ud.expressID] || !m.geometry || ud.marcador) return;
var c = m.isLineSegments ? new THREE.LineSegments(m.geometry, selInstLin) : (m.isLine ? new THREE.Line(m.geometry, selInstLin) : (m.isMesh ? new THREE.Mesh(m.geometry, selInstMat) : null));
if (!c) return;
c.matrixAutoUpdate = false; c.matrix.copy(m.matrixWorld); c.renderOrder = 999; c.raycast = function () {}; c.userData.marcador = true; c.frustumCulled = m.frustumCulled;
selInstGrp.add(c);
});
}
S._selInstContar = function () { return selInstGrp.children.length; };
S._selInstRefazer = function () { var vivos = selInst.filter(function (u) { return !!(S.meshPorUid && S.meshPorUid[u]); }); selInst = vivos; realcarInst(); };
function selAtual() {
var r = [];
try { if (S._prec && S._prec.api) S._prec.api.selecao().forEach(function (id) { r.push('edit:' + id); }); } catch (_) {}
selInst.forEach(function (u) { if (r.indexOf(u) < 0) r.push(u); });
var u = S.selected ? uidDeMalha(S.selected) : null; if (u && r.indexOf(u) < 0) r.push(u);
return r;
}
function precConhece(id) {
try { var Pr = window.BimPrecisao, e = S.edit && S.edit.estado; return !(Pr && Pr.tipoNoEstado && e) || !!Pr.tipoNoEstado(e, id); } catch (_) { return true; }
}
function selAplicar(uids, modo) {
var SL = SLx(), novo = SL ? SL.combinar(selAtual(), uids || [], modo || 'trocar') : (uids || []).slice();
novo = novo.filter(function (u) { return !!(S.meshPorUid && S.meshPorUid[u]); });
var mod = modeladorOn() && S._prec && S._prec.api;
var insts = mod ? novo.filter(function (u) { return /^edit:/.test(u) && (ehInstUid(u) || !precConhece(u.slice(5))); }) : [];
var eds = mod ? novo.filter(function (u) { return /^edit:/.test(u) && insts.indexOf(u) < 0; }).map(function (u) { return u.slice(5); }) : [];
var outros = novo.filter(function (u) { return !(mod && /^edit:/.test(u)); });
selInst = insts; realcarInst();
if (mod) { if ((eds.length || insts.length) && !edit.on) setEdit(true); S._prec.api.selecionar(eds); }
if (S._limparRaioX) S._limparRaioX();
if (S.selected) { S.selected.material = S.prevMat; S.selected = null; S.prevMat = null; }
contornoSelecao(null);
var ult = outros.length ? S.meshPorUid[outros[outros.length - 1]] : null;
if (ult) { S.selected = ult; S.prevMat = ult.material; ult.material = selMat; contornoSelecao(ult); }
var o = (S && S.opts) || opts, m0 = novo.length ? S.meshPorUid[novo[0]] : null;
if (o.onPick) { try { o.onPick(m0 ? propsDe(m0.userData.mid != null ? m0.userData.mid : S.modelID, m0.userData.expressID, m0.userData.tipo) : null); } catch (_) {} }
if (novo.length > 1) S._hint(novo.length + ' peças selecionadas. Arraste uma delas para mover (com Ctrl, copia); Delete apaga; Esc limpa.');
else if (eds.length === 1) S._hint('Selecionada. Arraste a peça para mover; as alças esticam a ponta; Delete apaga; Esc limpa.');
try { if (SL && SL.mudou) SL.mudou(); } catch (_) {}
try { if (window.MetalComponenteUI && MetalComponenteUI.aoSelecionar) MetalComponenteUI.aoSelecionar(novo); } catch (_) {}
try { if (window.BimTelhadoPecaUI && BimTelhadoPecaUI.aoSelecionar) BimTelhadoPecaUI.aoSelecionar(novo); } catch (_) {}
try { if (window.BimVaoArr && BimVaoArr.aoSelecionar) BimVaoArr.aoSelecionar(novo); } catch (_) {}
try { if (window.BimInstCon && BimInstCon.aoSelecionar) BimInstCon.aoSelecionar(novo); } catch (_) {}
return novo;
}
S._selAplicar = selAplicar; S._selAtual = selAtual;
S._uidEm = function (cx, cy) { var hit = raycastEm(cx, cy); return uidDeMalha(hit && hit.object); };
S._semFerramenta3d = semFerramenta3d;
S._caixaDeUids = function (uids) { var fica = {}, bx = new THREE.Box3(), bm = new THREE.Box3(); (uids || []).forEach(function (u) { fica[u] = 1; }); todasMalhas(function (m) { var u = uidDeMalha(m); if (!u || !fica[u] || !m.geometry) return; if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); if (m.geometry.boundingBox) { bm.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld); bx.union(bm); } }); return bx; };
S._uidsNaVista3d = function () {
var fr = new THREE.Frustum(), mt = new THREE.Matrix4(), bx = new THREE.Box3(), out = {};
camera.updateMatrixWorld(); mt.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); fr.setFromProjectionMatrix(mt);
todasMalhas(function (m) {
var u = uidDeMalha(m); if (!u || out[u] || !m.geometry || !cadeiaVisivel(m)) return;
if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
bx.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
if (fr.intersectsBox(bx)) out[u] = 1;
});
return Object.keys(out);
};
S._ocultarUids = function (uids) {
var fora = {}, n = 0; (uids || []).forEach(function (u) { fora[u] = 1; });
if (S.selected && fora[uidDeMalha(S.selected)]) { S.selected.material = S.prevMat; S.selected = null; S.prevMat = null; contornoSelecao(null); }
todasMalhas(function (m) { var u = uidDeMalha(m); if (u && fora[u] && m.visible !== false) { m.visible = false; n++; } });
pav.manual = true;
return n;
};
S._algoOculto = function () { var r = false; todasMalhas(function (m) { if (!r && m.userData.expressID != null && m.visible === false && !ehFuturo4d(m) && !ehRemovidoEd(m)) r = true; }); return r; };
function compExp(u) { try { return window.MetalComponenteUI && MetalComponenteUI.expandir ? MetalComponenteUI.expandir(u) : [u]; } catch (_) { return [u]; } }
S._compExp = compExp;
function sel3Clique(e) {
var hit = raycastEm(e.clientX, e.clientY), u = uidDeMalha(hit && hit.object), ctrl = !!(e.ctrlKey || e.metaKey);
if (!u && window.BimInstUI && BimInstUI.pickTela) { try { u = BimInstUI.pickTela(e.clientX, e.clientY) || null; if (u && !(S.meshPorUid && S.meshPorUid[u])) u = null; } catch (_) { u = null; } }
if (u && !ctrl && window.BimTelhadoPecaUI && BimTelhadoPecaUI.clique) { try { BimTelhadoPecaUI.clique(u, _ultimosHits.slice(), selAtual()); } catch (_) {} }
if (u) selAplicar(compExp(u), ctrl ? 'alternar' : 'trocar'); else if (!ctrl) selAplicar([], 'trocar');
}
S._sel3Clique = function (e) { if (!S || !S.alive || visitante) return false; sel3Clique(e); return true; };
function navBotoes(orb, e) {
var SL = SLx(); if (!SL || !orb || e.pointerType === 'touch') return;
var b = SL.botoesOrbita({ visitante: visitante, mao: SL.mao(), ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey });
orb.mouseButtons.LEFT = b.LEFT; orb.mouseButtons.MIDDLE = b.MIDDLE; orb.mouseButtons.RIGHT = b.RIGHT;
}
S._navBotoes = navBotoes;
var _pivo = null;
canvasEl.addEventListener('pointermove', function (e) {
var p = _pivo; if (!p || e.pointerId !== p.id) return;
var BMp = window.BimMouse; if (!BMp || !BMp.passouDoLimiar(p.x, p.y, e.clientX, e.clientY)) return;
_pivo = null;
var P = pontoSobCursor(p.x, p.y); if (!P) return;
if (S._cancelTween) S._cancelTween();
orbit.target.copy(P); S._ultimoPivo = { x: P.x, y: P.y, z: P.z };
}, true);
function soltarPivo() { _pivo = null; }
canvasEl.addEventListener('pointerup', soltarPivo, true); canvasEl.addEventListener('pointercancel', soltarPivo, true);
canvasEl.setAttribute('data-bim-nav', '1');
canvasEl.addEventListener('pointerdown', function (e) {
if (!S || !S.alive) return;
navBotoes(orbit, e);
_pivo = null;
try { var BMp = window.BimMouse; if (BMp && !visitante && e.pointerType === 'mouse' && !fly.on && !planta.on && !S._principalOculta && BMp.vaiGirar(e.button, orbit.mouseButtons, e)) _pivo = { id: e.pointerId, x: e.clientX, y: e.clientY }; } catch (_) {}
var SL = SLx();
if (SL && e.pointerType !== 'touch' && (e.button === 1 || e.button === 2 || (e.button === 0 && SL.mao() && !visitante))) canvasEl.setAttribute('data-bim-pan', '1');
}, true);
function soltarPan() { canvasEl.removeAttribute('data-bim-pan'); }
canvasEl.addEventListener('pointerup', soltarPan); canvasEl.addEventListener('pointercancel', soltarPan);
canvasEl.addEventListener('mousedown', function (e) { if (e.button === 1) e.preventDefault(); });
canvasEl.addEventListener('auxclick', function (e) { if (e.button === 1) e.preventDefault(); });
var sel3 = null, selRet = null;
canvasEl.addEventListener('pointerdown', function (e) {
sel3 = null;
if (!S || !S.alive || e.button !== 0 || e.pointerType === 'touch' || visitante) return;
if (S._abrirUI && S._abrirUI.gate(e)) return;
var SL = SLx(); if (!SL || SL.mao() || !semFerramenta3d()) return;
var hit = raycastEm(e.clientX, e.clientY), u = uidDeMalha(hit && hit.object), mod = modeladorOn() && !!S._prec;
var a = SL.acao({ botao: 0, vista: '3d', alvo: u ? 'peca' : 'vazio', editavel: !!(u && /^edit:/.test(u)), modelador: mod, ctrl: !!(e.ctrlKey || e.metaKey), shift: e.shiftKey });
sel3 = { x: e.clientX, y: e.clientY, u: u, acao: a, ctrl: !!(e.ctrlKey || e.metaKey), modo: null, id: e.pointerId, tipo: e.pointerType, hp: hit && hit.point ? { x: hit.point.x, y: hit.point.y, z: hit.point.z } : null, hits: _ultimosHits.slice() };
});
function ctrlCopiaIniciar(s) {
var ev = { clientX: s.x, clientY: s.y, pointerType: s.tipo };
if (window.BimVaoArr && BimVaoArr.pode && BimVaoArr.pode(s.u)) { s.copia = true; return BimVaoArr.iniciar('3d', s.u, ev, { copia: true }) ? 'vao' : 'nada'; }
if ((window.BimInstArr && BimInstArr.pode && BimInstArr.pode(s.u)) || (window.BimTelhadoPecaArr && BimTelhadoPecaArr.pode && BimTelhadoPecaArr.pode(s.u, s.hits))) {
S._hint('Esta peça não se copia arrastando (a peça do telhado vem da cobertura; o tubo copiado solto quebraria as ligações).'); return 'nada';
}
if (selAtual().indexOf(s.u) < 0) selAplicar(compExp(s.u), 'trocar');
s.copia = true;
return (S._prec.arrastoIniciar && S._prec.arrastoIniciar(ev, { copia: true })) ? 'mover' : 'nada';
}
canvasEl.addEventListener('pointermove', function (e) {
var s = sel3; if (!s || e.pointerId !== s.id) return;
var SL = SLx(); if (!SL) return;
if (!s.modo) {
if (!SL.arrastou({ x: s.x, y: s.y }, { x: e.clientX, y: e.clientY })) return;
s.modo = 'nada';
if (s.acao === 'janela') s.modo = 'janela';
else if (s.acao === 'alternar' && s.ctrl && s.u && /^edit:/.test(s.u) && modeladorOn() && S._prec) {
s.modo = ctrlCopiaIniciar(s);
}
else if (s.acao === 'peca-mover' && s.u && !s.ctrl && window.BimVaoArr && BimVaoArr.pode && BimVaoArr.pode(s.u)) {
if (BimVaoArr.iniciar('3d', s.u, { clientX: s.x, clientY: s.y })) s.modo = 'vao';
}
else if ((s.acao === 'peca-mover' || s.acao === 'peca') && s.u && !s.ctrl && window.BimInstArr && BimInstArr.pode && BimInstArr.pode(s.u)) {
if (BimInstArr.iniciar('3d', s.u, { clientX: s.x, clientY: s.y }, s.hp)) s.modo = 'inst';
}
else if ((s.acao === 'peca-mover' || s.acao === 'peca') && s.u && !s.ctrl && window.BimTelhadoPecaArr && BimTelhadoPecaArr.pode && BimTelhadoPecaArr.pode(s.u, s.hits)) {
if (BimTelhadoPecaArr.iniciar('3d', s.u, { clientX: s.x, clientY: s.y, shiftKey: e.shiftKey, altKey: e.altKey }, s.hp, s.hits)) s.modo = 'telpeca';
}
else if (s.acao === 'peca-mover') {
if (selAtual().indexOf(s.u) < 0) selAplicar(compExp(s.u), 'trocar');
if (S._prec && S._prec.arrastoIniciar && S._prec.arrastoIniciar({ clientX: s.x, clientY: s.y, pointerType: s.tipo })) s.modo = 'mover';
}
try { canvasEl.setPointerCapture(e.pointerId); } catch (_) {}
}
if (s.modo === 'mover') S._prec.arrastoMover(e);
else if (s.modo === 'inst') BimInstArr.mover(e);
else if (s.modo === 'vao') BimVaoArr.mover(e);
else if (s.modo === 'telpeca') BimTelhadoPecaArr.mover(e);
else if (s.modo === 'janela') selRetDesenhar(s, e);
});
function selRetDesenhar(s, e) {
var SL = SLx(), h = S.host || host, hr = h.getBoundingClientRect();
if (!selRet) { selRet = document.createElement('div'); selRet.className = 'bim-sel-janela'; selRet.setAttribute('data-bim', 'janela'); }
if (selRet.parentNode !== h) h.appendChild(selRet);
selRet.setAttribute('data-modo', SL.modoJanela(s.x, e.clientX));
var x0 = Math.min(s.x, e.clientX), y0 = Math.min(s.y, e.clientY);
selRet.style.left = (x0 - hr.left) + 'px'; selRet.style.top = (y0 - hr.top) + 'px';
selRet.style.width = Math.abs(e.clientX - s.x) + 'px'; selRet.style.height = Math.abs(e.clientY - s.y) + 'px';
selRet.style.display = 'block';
}
function selRetTirar() { if (selRet) selRet.style.display = 'none'; }
function janela3d(s, e) {
var SL = SLx(), j = SL.janela([s.x, s.y], [e.clientX, e.clientY], SL.modoJanela(s.x, e.clientX));
var mo = edit.modelo; if (!mo || !mo.grupo) return [];
var st0 = edit.estado || BimEdit.aplicar(edit.ops), pg = {};
try { if (window.BimPrecisao) BimPrecisao.geometria(st0, { avaliar: famAval }).els.forEach(function (g) { pg[g.id] = g; }); } catch (_) {}
var por = {};
mo.grupo.children.forEach(function (m) {
if (!m.isMesh || m.userData.expressID == null || !cadeiaVisivel(m)) return;
(por[m.userData.expressID] = por[m.userData.expressID] || []).push(m);
});
var pecas = [];
Object.keys(por).forEach(function (id) {
var bx = new THREE.Box3(); por[id].forEach(function (m) { bx.expandByObject(m); });
if (bx.isEmpty()) return;
var pts = [], atras = false, g = pg[id], cs = g && g.cantos && g.cantos.length >= 2 ? g.cantos : null;
function pj(x, y, z) { var t = S._telaDe(x, y, z); if (t.atras) atras = true; else pts.push([t.x, t.y]); }
if (cs) cs.forEach(function (c) { pj(c.x, bx.min.y, c.z); pj(c.x, bx.max.y, c.z); });
else [bx.min.x, bx.max.x].forEach(function (x) { [bx.min.y, bx.max.y].forEach(function (y) { [bx.min.z, bx.max.z].forEach(function (z) { pj(x, y, z); }); }); });
if (atras && j.modo === 'dentro') return;
if (pts.length) pecas.push(SL.pecaDoCasco('edit:' + id, pts));
});
return SL.pegaJanela(j, pecas);
}
S._sel3Up = function (e) {
var s = sel3; if (!s || e.button !== 0 || e.pointerId !== s.id) return false;
sel3 = null; selRetTirar();
try { canvasEl.releasePointerCapture(e.pointerId); } catch (_) {}
if (!s.modo) { sel3Clique(e); return true; }
if (s.modo === 'mover') { if (S._prec && S._prec.arrastoSoltar) S._prec.arrastoSoltar(e); marcarFechamento(); return true; }
if (s.modo === 'inst') { if (window.BimInstArr) BimInstArr.soltar(e); marcarFechamento(); return true; }
if (s.modo === 'vao') { if (window.BimVaoArr) BimVaoArr.soltar(e); marcarFechamento(); return true; }
if (s.modo === 'telpeca') { if (window.BimTelhadoPecaArr) BimTelhadoPecaArr.soltar(e); marcarFechamento(); return true; }
if (s.modo === 'janela') {
var ids = janela3d(s, e);
selAplicar(ids, s.ctrl ? 'somar' : 'trocar');
try { if (window.BimInstJanela && BimInstJanela.aposJanela) BimInstJanela.aposJanela(ids, '3d'); } catch (eJ) {}
S._hint(ids.length ? ids.length + ' peça(s) selecionada(s) pela janela (' + (SLx().modoJanela(s.x, e.clientX) === 'dentro' ? 'só o que está inteiro dentro' : 'o que a janela toca') + ').' : 'A janela não pegou nenhuma peça do modelo.');
}
return true;
};
canvasEl.addEventListener('pointercancel', function () { if (sel3 && sel3.modo === 'mover' && S._prec && S._prec.arrastoCancelar) S._prec.arrastoCancelar(); if (sel3 && sel3.modo === 'inst' && window.BimInstArr) BimInstArr.cancelar(); if (sel3 && sel3.modo === 'vao' && window.BimVaoArr) BimVaoArr.cancelar(); if (sel3 && sel3.modo === 'telpeca' && window.BimTelhadoPecaArr) BimTelhadoPecaArr.cancelar(); sel3 = null; selRetTirar(); });
S._opsApagarIfc = function (uids) {
var ops = [];
(uids || []).forEach(function (u) {
if (/^edit:/.test(u)) return;
var m = S.meshPorUid && S.meshPorUid[u]; if (!m || !m.userData) return;
var mid = m.userData.mid != null ? m.userData.mid : S.modelID, eid = m.userData.expressID;
var mo = S.modelos.filter(function (x) { return x.mid === mid; })[0];
ops.push({ op: 'apagarIfc', uid: mid + ':' + eid, arq: mo ? mo.nome : null, eid: eid });
});
return ops;
};
S._apagarSelecao = function () {
var uids = selAtual(); if (!uids.length) return false;
var est = S.edit && S.edit.estado, Pr = window.BimPrecisao, ops = [], eds = [], nFix = 0;
uids.forEach(function (u) {
if (!/^edit:/.test(u)) return;
var id = u.slice(5);
if (Pr && Pr.fixado && est && Pr.fixado(est, id)) { nFix++; return; }
ops.push({ op: 'apagar', id: id }); eds.push(u);
});
try { if (eds.length && window.BimSelInst && BimSelInst.interceptarApagar && BimSelInst.interceptarApagar(eds)) {
var nFora = uids.length - eds.length;
if (nFora > 0) S._hint(nFora + (nFora === 1 ? ' peça da seleção NÃO foi apagada' : ' peças da seleção NÃO foram apagadas') + ': a pergunta da peça pronta vem primeiro e vale só para as peças do editor. Responda e aperte Delete de novo.');
return true;
} } catch (_) {}
var nIfc = 0;
S._opsApagarIfc(uids).forEach(function (o) { ops.push(o); nIfc++; });
if (!ops.length) { S._hint(nFix ? nFix + ' fixado(s) ficou(aram): use Desafixar antes.' : 'Nada para apagar na seleção.'); return true; }
var lote = { op: 'lote', id: 'dl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), origem: 'delete', pedido: 'Apagar ' + ops.length + (ops.length === 1 ? ' elemento' : ' elementos'), ops: ops };
selAplicar([], 'trocar');
var ok = !!(window.BIM && BIM.editarLote && BIM.editarLote(lote));
S._hint(ok ? ops.length + (ops.length === 1 ? ' elemento apagado' : ' elementos apagados') + (nIfc ? ' (' + nIfc + ' do IFC importado: ficam ocultos e marcados como removidos; o arquivo não muda)' : '') + ' — Ctrl+Z desfaz' + (ops.length > 1 ? ' de uma vez' : '') + '.' + (nFix ? ' ' + nFix + ' fixado(s) ficou(aram): use Desafixar antes.' : '') : 'O editor recusou o apagar.');
return true;
};
S._setasCtx = function () {
if (!S || S !== Sm || !S.alive) return null;
var h = S.host || host, raiz = h && h.closest ? (h.closest('.bim-revit') || h) : h;
if (!raiz || !raiz.isConnected || !raiz.getClientRects().length) return null;
var r = { ocupado: !semFerramenta3d(), forward: null, mPorPx: null };
try {
var cam = S.camera, d = new THREE.Vector3(); cam.getWorldDirection(d);
var f = { x: d.x, z: d.z };
if (Math.abs(d.y) > 0.85) { var up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion); f = { x: up.x, z: up.z }; }
r.forward = f;
var box = new THREE.Box3(), n = 0;
selAtual().forEach(function (u) { var m = S.meshPorUid && S.meshPorUid[u]; if (m) { box.expandByObject(m); n++; } });
var hpx = (S.renderer && S.renderer.domElement && S.renderer.domElement.clientHeight) || 600;
if (cam.isPerspectiveCamera) {
var c = (n && !box.isEmpty()) ? box.getCenter(new THREE.Vector3()) : S.orbit.target.clone();
var prof = Math.max(0.05, c.sub(cam.position).dot(d));
r.mPorPx = 2 * prof * Math.tan(cam.fov * Math.PI / 360) / hpx;
} else r.mPorPx = (cam.top - cam.bottom) / (cam.zoom || 1) / hpx;
} catch (_) {}
return r;
};
S._selTeclas = function (e) {
if (!S || S !== Sm || !S.alive) return;
var k = e.key; if (k !== 'Escape' && k !== 'Delete' && k !== 'Del') return;
if (window.BimSelInst && BimSelInst.menuAberto && BimSelInst.menuAberto()) return;
var t = e.target || {}; if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '') || t.isContentEditable) return;
var h = S.host || host, raiz = h && h.closest ? (h.closest('.bim-revit') || h) : h;
if (!raiz || !raiz.isConnected || !raiz.getClientRects().length) return;
var SL = SLx();
if (k === 'Escape') {
if (sel3 && sel3.modo) { if (sel3.modo === 'mover' && S._prec && S._prec.arrastoCancelar) S._prec.arrastoCancelar(); if (sel3.modo === 'inst' && window.BimInstArr) BimInstArr.cancelar(); if (sel3.modo === 'vao' && window.BimVaoArr) BimVaoArr.cancelar(); if (sel3.modo === 'telpeca' && window.BimTelhadoPecaArr) BimTelhadoPecaArr.cancelar(); sel3 = null; selRetTirar(); e.preventDefault(); e.stopPropagation(); return; }
if (SL && SL.arrastando && SL.arrastando()) { SL.cancelar(); e.preventDefault(); e.stopPropagation(); return; }
if (!semFerramenta3d() || (SL && SL.ferramenta2d && SL.ferramenta2d()) || (edit.on && edit.p1)) return;
if (!selAtual().length) return;
selAplicar([], 'trocar'); S._hint('Seleção limpa.');
e.preventDefault(); e.stopPropagation(); return;
}
if (!semFerramenta3d()) return;
if (selInst.length || S.selected) {
if (S._apagarSelecao()) { e.preventDefault(); e.stopPropagation(); }
return;
}
var temEd = !!(S._prec && S._prec.api && S._prec.api.selecao().length);
if (temEd) setTimeout(function () { if (S && S.alive) selAplicar(selAtual(), 'trocar'); }, 0);
};
window.addEventListener('keydown', S._selTeclas, true);
var _rayZ = new THREE.Raycaster(), _mZ = new THREE.Vector2(), _zMem = null;
function pontoDoZoom(cx, cy) {
var agora = performance.now();
if (_zMem && agora - _zMem.t < 180 && Math.abs(cx - _zMem.x) + Math.abs(cy - _zMem.y) < 4) { _zMem.t = agora; return _zMem.p.clone(); }
var rc = canvasEl.getBoundingClientRect(); if (!rc.width || !rc.height) return null;
_mZ.x = ((cx - rc.left) / rc.width) * 2 - 1; _mZ.y = -((cy - rc.top) / rc.height) * 2 + 1;
_rayZ.layers.mask = ray.layers.mask; _rayZ.setFromCamera(_mZ, camera);
var h = primeiroHit(_rayZ.intersectObjects(modelRoot.children, true)), p = null;
if (h) p = h.point.clone();
else {
var n = new THREE.Vector3(); camera.getWorldDirection(n);
var pl = new THREE.Plane().setFromNormalAndCoplanarPoint(n, orbit.target), q = new THREE.Vector3();
p = _rayZ.ray.intersectPlane(pl, q) ? q : null;
}
_zMem = p ? { x: cx, y: cy, t: agora, p: p.clone() } : null;
return p;
}
function pontoSobCursor(cx, cy) {
var rc = canvasEl.getBoundingClientRect(); if (!rc.width || !rc.height) return null;
_mZ.x = ((cx - rc.left) / rc.width) * 2 - 1; _mZ.y = -((cy - rc.top) / rc.height) * 2 + 1;
_rayZ.layers.mask = ray.layers.mask; _rayZ.setFromCamera(_mZ, camera);
var h = primeiroHit(_rayZ.intersectObjects(modelRoot.children, true));
return h ? h.point.clone() : null;
}
S._pontoSobCursor = pontoSobCursor;
var _tamMod = { v: 1, t: -1e9 };
function tamModelo() {
var t = performance.now(); if (t - _tamMod.t < 1500) return _tamMod.v;
try { var bx = new THREE.Box3().setFromObject(modelRoot); if (!bx.isEmpty()) _tamMod.v = Math.max(bx.getSize(new THREE.Vector3()).length(), 0.5); } catch (_) {}
_tamMod.t = t; return _tamMod.v;
}
canvasEl.addEventListener('wheel', function (e) {
if (!S || S !== Sm || !S.alive || visitante || !orbit.enabled || orbit.enableZoom === false || fly.on || !e.deltaY) return;
var rcz = canvasEl.getBoundingClientRect(); if (!rcz.width || !rcz.height) return;
_mZ.x = ((e.clientX - rcz.left) / rcz.width) * 2 - 1; _mZ.y = -((e.clientY - rcz.top) / rcz.height) * 2 + 1;
_rayZ.layers.mask = ray.layers.mask; _rayZ.setFromCamera(_mZ, camera);
var dirZ = _rayZ.ray.direction.clone();
var P = pontoDoZoom(e.clientX, e.clientY);
if (P && P.clone().sub(camera.position).dot(dirZ) <= 0) { _zMem = null; P = pontoDoZoom(e.clientX, e.clientY); if (P && P.clone().sub(camera.position).dot(dirZ) <= 0) P = null; }
if (!P) P = camera.position.clone().addScaledVector(dirZ, Math.max(camera.position.distanceTo(orbit.target), 1e-3));
var f = e.deltaY > 0 ? 1.12 : 1 / 1.12, BMz = window.BimMouse;
var pz = BMz ? BMz.passoZoom({ dP: camera.position.distanceTo(P), dAlvo: camera.position.distanceTo(orbit.target), f: f, piso: BMz.pisoZoom(tamModelo()), minD: orbit.minDistance, maxD: orbit.maxDistance })
: (function () { var nd0 = camera.position.distanceTo(orbit.target) * f; return (nd0 < orbit.minDistance || nd0 > orbit.maxDistance) ? { modo: 'nada' } : { modo: 'escala', g: f }; })();
if (pz.modo === 'nada') return;
e.preventDefault(); e.stopImmediatePropagation();
if (S._cancelTween) S._cancelTween();
if (pz.modo === 'escala') {
camera.position.sub(P).multiplyScalar(pz.g).add(P);
orbit.target.sub(P).multiplyScalar(pz.g).add(P);
} else {
var uz = dirZ.multiplyScalar(pz.avanco);
camera.position.add(uz); orbit.target.add(uz);
}
orbit.update();
}, { capture: true, passive: false });
var area = { on: false, pts: [], tmp: [] };
var ang = { on: false, pts: [], tmp: [] };
S.area = area; S.ang = ang;
function limparTmp(t) { t.forEach(function (o) { var i = medir.objs.indexOf(o); if (i >= 0) medir.objs.splice(i, 1); limparMarca(o); }); t.length = 0; }
function fmtArea(a) { return (a >= 1 ? a.toFixed(2) : a.toFixed(3)).replace('.', ',') + ' m²'; }
function areaCalc(pts, horiz) {
var n = pts.length, i, p, q;
if (horiz == null ? planta.on : horiz) {
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
if (nl < 1e-9) return null;
cx /= n; cy /= n; cz /= n;
var desv = 0;
for (i = 0; i < n; i++) { var dv = Math.abs(((pts[i].x - cx) * nx + (pts[i].y - cy) * ny + (pts[i].z - cz) * nz) / nl); if (dv > desv) desv = dv; }
var areaV = nl / 2;
return { area: areaV, per: per, aprox: desv > Math.max(0.01, Math.sqrt(areaV) * 0.02), horizontal: false, normal: new THREE.Vector3(nx / nl, ny / nl, nz / nl) };
}
S._areaCalc = areaCalc;
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
} catch (_) { return null; }
}
function setArea(on) {
area.on = !!on;
if (on) { setMode(false); if (medir.on) setMedir(false); if (ang.on) setAng(false); if (edit && edit.on) setEdit(false); }
else { limparTmp(area.tmp); area.pts = []; esconderSnapMarca(); btnCotas(); }
var b = bar.querySelector('[data-b="area"]'); if (b) { b.style.background = on ? corAtiva() : ''; b.style.color = on ? '#fff' : ''; }
atualizarCursor();
S._hint(on ? ('▱ Área: clique os cantos (3+)' + (planta.on ? ' na planta' : '') + ' e feche clicando de novo no 1º ponto (ou duplo-clique).') : (planta.on ? '' + (typeof Icones !== 'undefined' ? Icones.get('regua', 15) : '') + ' Planta baixa. Ajuste a altura do corte no painel.' : ''));
}
S._setArea = setArea;
function areaClique(p, mapa) {
if (area.pts.length >= 3) {
var rc2 = canvasEl.getBoundingClientRect();
var v0 = new THREE.Vector3().copy(area.pts[0]).project(camera);
var vp = new THREE.Vector3().copy(p).project(camera);
var ddx = (v0.x - vp.x) / 2 * rc2.width, ddy = (v0.y - vp.y) / 2 * rc2.height;
if (ddx * ddx + ddy * ddy < 18 * 18) { fecharArea(); return; }
}
area.pts.push(p); (area.mapa = area.mapa || []).push(mapa || '');
var m = pontoMarca(p); m.material.color.set(0x38bdf8); addMed(m); area.tmp.push(m);
if (area.pts.length > 1) {
var seg = new THREE.Line(new THREE.BufferGeometry().setFromPoints([area.pts[area.pts.length - 2], p]), new THREE.LineBasicMaterial({ color: 0x38bdf8, depthTest: false }));
seg.renderOrder = 997; addMed(seg); area.tmp.push(seg);
}
S._hint(area.pts.length < 3 ? ('▱ Ponto ' + area.pts.length + ' — siga marcando os cantos.') : ('▱ ' + area.pts.length + ' pontos — feche clicando no 1º ponto (ou duplo-clique).'));
}
function fecharArea() {
if (!area.on || area.pts.length < 3) { S._hint('▱ Marque pelo menos 3 pontos antes de fechar.'); return; }
marcarFechamento();
var pts = [];
area.pts.forEach(function (pp) { if (!pts.length || pp.distanceTo(pts[pts.length - 1]) > 2e-3) pts.push(pp); });
if (pts.length > 1 && pts[pts.length - 1].distanceTo(pts[0]) < 2e-3) pts.pop();
var fmA = area.mapa || [];
limparTmp(area.tmp); area.pts = []; area.mapa = [];
if (pts.length < 3) { S._hint('▱ Pontos coincidentes — marque 3+ cantos distintos.'); return; }
if (!desenharArea(pts, undefined, fmA)) { S._hint('▱ Pontos colineares — não formam área. Recomece.'); return; }
S._hint('▱ Área medida! Clique os cantos da próxima, ou Esc pra sair.');
}
function desenharArea(pts, horiz, mapa) {
var res = areaCalc(pts, horiz);
if (!res || res.area < 1e-4) return null;
var loop = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.concat([pts[0]])), new THREE.LineBasicMaterial({ color: 0x38bdf8, depthTest: false }));
loop.renderOrder = 997; addMed(loop);
pts.forEach(function (pp) { var mk = pontoMarca(pp); mk.material.color.set(0x38bdf8); addMed(mk); });
var fill = preencherPoligono(pts, res.normal); if (fill) addMed(fill);
var c = new THREE.Vector3(); pts.forEach(function (pp) { c.add(pp); }); c.multiplyScalar(1 / pts.length);
var sufixo = res.horizontal ? ' (horizontal)' : (res.aprox ? ' ≈ plano médio' : '');
var fmA = fontesMapa(mapa), txtA = '▱ ' + fmtArea(res.area) + ' · per ' + fmtDist(res.per) + sufixo;
if (fmA.length && window.BimTrenaMapa) txtA = window.BimTrenaMapa.rotulo(txtA, fmA);
var lab = labelSprite(txtA);
lab.position.copy(c); addMed(lab); btnCotas();
medir.ultimaArea = { area: res.area, perimetro: res.per, horizontal: res.horizontal, aproximada: res.aprox, pontos: pts.length, mapa: fmA, rotulo: txtA };
var regA = { tipo: 'area', pts: pts.map(pxyz), horizontal: res.horizontal }; if (fmA.length) regA.mapa = fmA;
medir.regs.push(regA);
return res;
}
function setAng(on) {
ang.on = !!on;
if (on) { setMode(false); if (medir.on) setMedir(false); if (area.on) setArea(false); if (edit && edit.on) setEdit(false); }
else { limparTmp(ang.tmp); ang.pts = []; esconderSnapMarca(); btnCotas(); }
var b = bar.querySelector('[data-b="angulo"]'); if (b) { b.style.background = on ? corAtiva() : ''; b.style.color = on ? '#fff' : ''; }
atualizarCursor();
S._hint(on ? '∠ Ângulo: clique o 1º ponto, depois o VÉRTICE, depois o 2º ponto.' : (planta.on ? '' + (typeof Icones !== 'undefined' ? Icones.get('regua', 15) : '') + ' Planta baixa. Ajuste a altura do corte no painel.' : ''));
}
S._setAng = setAng;
function angClique(p, mapa) {
ang.pts.push(p); (ang.mapa = ang.mapa || []).push(mapa || '');
var m = pontoMarca(p); m.material.color.set(0xf59e0b); addMed(m); ang.tmp.push(m);
if (ang.pts.length > 1) {
var seg = new THREE.Line(new THREE.BufferGeometry().setFromPoints([ang.pts[ang.pts.length - 2], p]), new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false }));
seg.renderOrder = 997; addMed(seg); ang.tmp.push(seg);
}
if (ang.pts.length === 1) { S._hint('∠ Agora clique o VÉRTICE do ângulo.'); return; }
if (ang.pts.length === 2) { S._hint('∠ Agora clique o 2º ponto.'); return; }
var P1 = ang.pts[0], V = ang.pts[1], P2 = ang.pts[2], fmG = ang.mapa || [];
marcarFechamento();
limparTmp(ang.tmp); ang.pts = []; ang.mapa = [];
var deg = desenharAngulo(P1, V, P2, fmG);
if (deg == null) { S._hint('∠ Pontos coincidentes — recomece: 1º ponto, vértice, 2º ponto.'); return; }
S._hint('∠ ' + deg.toFixed(1).replace('.', ',') + '° — clique 3 pontos pra medir outro, ou Esc pra sair.');
}
function desenharAngulo(P1, V, P2, mapa) {
var u = P1.clone().sub(V), v = P2.clone().sub(V);
if (u.length() < 2e-3 || v.length() < 2e-3) return null;
var rad = u.angleTo(v), deg = rad * 180 / Math.PI;
[[V, P1], [V, P2]].forEach(function (par) {
var l2 = new THREE.Line(new THREE.BufferGeometry().setFromPoints(par), new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false }));
l2.renderOrder = 997; addMed(l2);
});
[P1, V, P2].forEach(function (pp) { var mk = pontoMarca(pp); mk.material.color.set(0xf59e0b); addMed(mk); });
var eixo = new THREE.Vector3().crossVectors(u, v), r = Math.min(u.length(), v.length()) * 0.35;
if (eixo.lengthSq() > 1e-12) {
eixo.normalize();
var arcPts = [], un = u.clone().normalize();
for (var t2 = 0; t2 <= 16; t2++) arcPts.push(V.clone().add(un.clone().applyAxisAngle(eixo, rad * t2 / 16).multiplyScalar(r)));
var arco = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arcPts), new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false }));
arco.renderOrder = 997; addMed(arco);
}
var bis = u.clone().normalize().add(v.clone().normalize());
if (bis.lengthSq() < 1e-9) bis = (eixo.lengthSq() > 1e-12 ? new THREE.Vector3().crossVectors(eixo, u).normalize() : new THREE.Vector3(0, 1, 0)); else bis.normalize();
var fmG = fontesMapa(mapa), txtG = '∠ ' + deg.toFixed(1).replace('.', ',') + '°';
if (fmG.length && window.BimTrenaMapa) txtG = window.BimTrenaMapa.rotulo(txtG, fmG);
var lab = labelSprite(txtG);
lab.position.copy(V).add(bis.multiplyScalar(Math.max(r * 1.4, 0.05)));
addMed(lab); btnCotas();
medir.ultimoAngulo = { graus: deg, mapa: fmG, rotulo: txtG };
var regG = { tipo: 'ang', pts: [pxyz(P1), pxyz(V), pxyz(P2)], horizontal: false }; if (fmG.length) regG.mapa = fmG;
medir.regs.push(regG);
return deg;
}
var planta = { on: false, plane: null, y0: 0, y1: 1 };
S.planta = planta;
var cortePanel = document.createElement('div');
cortePanel.style.cssText = 'position:absolute;left:10px;bottom:10px;z-index:4;display:none;flex-direction:column;gap:7px;background:var(--card-bg,#fff);border:1px solid var(--linha,#d3dce6);border-radius:var(--raio,12px);padding:11px 13px;color:var(--texto,#1a2b3c);font-size:12px;width:220px';
cortePanel.classList.add('bim-flut', 'bim-flut-baixo');
cortePanel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:baseline"><b>' + (typeof Icones !== 'undefined' ? Icones.get('regua', 15) : '') + ' Altura do corte</b><span data-c="v" style="color:var(--aco,#2d6a9c);font-weight:600">—</span></div>' +
'<input type="range" data-c="alt" min="0" max="1000" value="620" style="width:100%;accent-color:var(--aco,#2d6a9c)">' +
'<div style="font-size:11px;color:var(--texto-fraco,#5b6b7c)">Esconde o que está acima do corte — a planta baixa do pavimento. A ' + (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '') + ' trena funciona aqui (cota horizontal).</div>' +
'<label style="display:flex;gap:6px;align-items:center;font-size:11.5px;cursor:pointer"><input type="checkbox" data-c="acima" checked> Peças acima do corte tracejadas (até o nível de cima)</label>' +
'<button class="btn sm primary" data-c="planta2d" style="width:100%">' + (typeof Icones !== 'undefined' ? Icones.get('nota', 15) : '') + ' Planta baixa técnica (2D)</button>' +
'<button class="btn sm" data-c="estilo" style="width:100%">' + (typeof Icones !== 'undefined' ? Icones.get('editar', 15) : '') + ' Estilo desenho (branco)</button>' +
'<button class="btn sm" data-c="cortetec" style="width:100%">' + (typeof Icones !== 'undefined' ? Icones.get('nota', 15) : '') + ' Gerar corte técnico (A–A)</button>';
host.appendChild(cortePanel);
S.cortePanel = cortePanel;
function setAlturaCorte(frac) {
if (!planta.plane) return;
var y = planta.y0 + (planta.y1 - planta.y0) * frac; planta.plane.constant = y;
var rot = cortePanel.querySelector('[data-c="v"]'); if (rot) rot.textContent = fmtDist(Math.max(0, y - planta.y0)) + ' do piso';
acima3dAgendar();
}
var acima3d = { on: true, grupo: null, tm: 0, n: 0, topo: null };
S.acima3d = acima3d;
function acima3dLimpar() {
if (acima3d.grupo) { scene.remove(acima3d.grupo); acima3d.grupo.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); acima3d.grupo = null; }
acima3d.n = 0; acima3d.topo = null;
}
function acima3dTopo(h) {
var A = window.Desenho2D && Desenho2D.Acima, nv = []; if (!A) return null;
try { if (window.Bim2D && Bim2D.niveis) nv = Bim2D.niveis() || []; } catch (eN) { nv = []; }
var base = null; nv.forEach(function (n) { var y = +n.y; if (isFinite(y) && y <= h + 1e-6 && (base == null || y > base)) base = y; });
return A.topo({}, base == null ? planta.y0 : base, h, nv);
}
function acima3dAtualizar() {
acima3dLimpar();
if (!planta.on || !planta.plane || !acima3d.on) return 0;
var h = planta.plane.constant, topo = acima3dTopo(h); if (topo == null) return 0;
var gr = {}, ord = [], bb = new THREE.Box3();
modelRoot.children.forEach(function (g) {
(g.children || []).forEach(function (m) {
if (!m.isMesh || !m.geometry || !m.userData || m.userData.expressID == null || !cadeiaVisivel(m)) return;
if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
bb.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
if (!(bb.min.y > h) || !(bb.min.y < topo - 0.005 || m.userData.acimaSempre) || !(Desenho2D.Acima.tipoPode(m.userData.tipo) || m.userData.acimaSempre)) return;
var u = (m.userData.mid != null ? m.userData.mid : S.modelID) + ':' + m.userData.expressID;
if (!gr[u]) { gr[u] = { ms: [], t: m.userData.tipo || '', mid: m.userData.mid, eid: m.userData.expressID, forcar: !!m.userData.acimaSempre }; ord.push(u); }
gr[u].ms.push(m);
});
});
var itens = acimaItens(gr, ord, function (x) { return x; }, function (x, y, z) { return z; }), v = [], yL = h - 0.003;
itens.forEach(function (it) {
if (it.segs) it.segs.forEach(function (q) { v.push(q[0], yL, q[1], q[2], yL, q[3]); });
else if (it.pts && it.pts.length > 1) for (var i = 0, n = it.pts.length; i < n; i++) { var a = it.pts[i], b = it.pts[(i + 1) % n]; v.push(a[0], yL, a[1], b[0], yL, b[1]); }
});
acima3d.topo = topo;
if (!v.length) return 0;
var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
var ls = new THREE.LineSegments(geo, new THREE.LineDashedMaterial({ color: 0x6b7480, dashSize: 0.3, gapSize: 0.075, depthTest: false, transparent: true, opacity: 0.95 }));
ls.computeLineDistances(); ls.renderOrder = 998; ls.userData.acimaCorte = true;
var gp = new THREE.Group(); gp.name = 'acima-do-corte'; gp.userData.acimaCorte = true; gp.add(ls);
gp.userData.uids = itens.map(function (it) { return it.u; });
scene.add(gp); acima3d.grupo = gp; acima3d.n = itens.length;
return itens.length;
}
function acima3dAgendar() {
if (acima3d.tm) clearTimeout(acima3d.tm);
if (!planta.on) { acima3dLimpar(); return; }
acima3d.tm = setTimeout(function () { acima3d.tm = 0; try { acima3dAtualizar(); } catch (eA) { acima3dLimpar(); } }, 120);
}
S._acima3d = { atualizar: acima3dAtualizar, agendar: acima3dAgendar, limpar: acima3dLimpar, estado: function () { return { on: acima3d.on, n: acima3d.n, topo: acima3d.topo, uids: acima3d.grupo ? acima3d.grupo.userData.uids.slice() : [], plantaOn: !!planta.on, corte: planta.plane ? planta.plane.constant : null }; } };
function setPlanta(on) {
planta.on = !!on;
if (S._pintarEixo) setTimeout(S._pintarEixo, 0);
var bp = bar.querySelector('[data-b="planta"]');
if (on) {
if (corteL.on) setCorteL(false);
if (S._cxDesligar) S._cxDesligar();
setMode(false);
var box = new THREE.Box3().setFromObject(modelRoot);
if (box.isEmpty()) { planta.on = false; S._hint('Carregue um modelo primeiro.'); return; }
var min = box.min, max = box.max, c = box.getCenter(new THREE.Vector3());
planta.y0 = min.y; planta.y1 = max.y;
planta.plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), max.y);
renderer.localClippingEnabled = true; renderer.clippingPlanes = [planta.plane];
orbit.enableRotate = false;
enquadrarTopo();
cortePanel.style.display = 'flex';
cortePanel.querySelector('[data-c="alt"]').value = 620; setAlturaCorte(0.62);
if (bp) { bp.style.background = corAtiva(); bp.style.color = '#fff'; }
if (!estiloD.on && !sisColor.on) setEstiloDesenho(true);
S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('regua', 15) : '') + ' Planta baixa. Ajuste a altura do corte e gere a ' + (typeof Icones !== 'undefined' ? Icones.get('nota', 15) : '') + ' planta técnica com cotas no painel. Toque em ' + (typeof Icones !== 'undefined' ? Icones.get('regua', 15) : '') + ' de novo pra sair.');
} else {
acima3dLimpar(); if (acima3d.tm) { clearTimeout(acima3d.tm); acima3d.tm = 0; }
ctecCancelar();
plantaCfg.style.display = 'none';
if (estiloD.on) setEstiloDesenho(false);
renderer.clippingPlanes = []; renderer.localClippingEnabled = false; planta.plane = null;
orbit.enableRotate = true;
cortePanel.style.display = 'none';
if (bp) { bp.style.background = ''; bp.style.color = ''; }
enquadrar(); S._hint(medir.on ? '' + (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '') + ' Trena: clique em 2 pontos do modelo pra medir. Esc sai.' : '');
}
}
S._setPlanta = setPlanta;
function enquadrarTopo() {
if (S._cancelTween) S._cancelTween();
var box = new THREE.Box3().setFromObject(modelRoot); if (box.isEmpty()) return;
var c = box.getCenter(new THREE.Vector3());
var sizeXZ = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) || 10;
camera.position.set(c.x, box.max.y + sizeXZ * 1.15, c.z);
orbit.target.set(c.x, box.min.y, c.z); orbit.update();
}
S._enquadrarTopo = enquadrarTopo;
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
cortePanel.querySelector('[data-c="acima"]').addEventListener('change', function () { acima3d.on = !!this.checked; if (acima3d.on) acima3dAgendar(); else acima3dLimpar(); });
function cmdNovo(id) {
try { if (window.BimRibbon && BimRibbon.comando(id) && window.BimShell && BimShell.executar) { BimShell.executar(id); return true; } } catch (_) {}
return false;
}
cortePanel.querySelector('[data-c="cortetec"]').addEventListener('click', function () { if (cmdNovo('corte-2d')) return; ctecIniciar(); });
cortePanel.querySelector('[data-c="planta2d"]').addEventListener('click', function () { if (cmdNovo('planta-2d')) return; fecharPaineis(); ctecCancelar(); plantaCfg.style.display = 'flex'; });
cortePanel.querySelector('[data-c="estilo"]').addEventListener('click', function () { if (window.BimEstilo && BimEstilo.previa && BimEstilo.previa() && BimEstilo.menu) { BimEstilo.menu(this); return; } setEstiloDesenho(!estiloD.on); });
var corteL = { on: false, plane: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), az: 0, inc: 0, inv: false, d0: 0, d1: 1 };
S.corteL = corteL;
var corteLPanel = document.createElement('div');
corteLPanel.style.cssText = 'position:absolute;left:10px;bottom:10px;z-index:4;display:none;flex-direction:column;gap:7px;background:var(--card-bg,#fff);border:1px solid var(--linha,#d3dce6);border-radius:var(--raio,12px);padding:11px 13px;color:var(--texto,#1a2b3c);font-size:12px;width:240px';
corteLPanel.classList.add('bim-flut', 'bim-flut-baixo');
corteLPanel.innerHTML =
'<div style="display:flex;justify-content:space-between;align-items:baseline"><b>' + (typeof Icones !== 'undefined' ? Icones.get('corte', 15) : '') + ' Plano de corte</b><span data-k="v" style="color:var(--aco,#2d6a9c);font-weight:600">—</span></div>' +
'<div style="display:flex;gap:5px"><button class="btn sm" data-k="ph" style="flex:1">Horizontal</button><button class="btn sm" data-k="pns" style="flex:1">N–S</button><button class="btn sm" data-k="plo" style="flex:1">L–O</button></div>' +
'<label style="display:flex;justify-content:space-between;font-size:11px;color:var(--texto-fraco,#5b6b7c)">Ângulo (azimute) <span data-k="azv">0°</span></label>' +
'<input type="range" data-k="az" min="0" max="359" value="0" style="width:100%;accent-color:var(--aco,#2d6a9c)">' +
'<label style="display:flex;justify-content:space-between;font-size:11px;color:var(--texto-fraco,#5b6b7c)">Inclinação (0=vertical, 90=horizontal) <span data-k="incv">0°</span></label>' +
'<input type="range" data-k="inc" min="0" max="90" value="0" style="width:100%;accent-color:var(--aco,#2d6a9c)">' +
'<label style="display:flex;justify-content:space-between;font-size:11px;color:var(--texto-fraco,#5b6b7c)">Posição do corte <span data-k="posv">50%</span></label>' +
'<input type="range" data-k="pos" min="0" max="1000" value="500" style="width:100%;accent-color:var(--aco,#2d6a9c)">' +
'<button class="btn sm" data-k="inv" style="width:100%">' + (typeof Icones !== 'undefined' ? Icones.get('ciclo', 15) : '') + ' Inverter lado visível</button>' +
'<div style="font-size:11px;color:var(--texto-fraco,#5b6b7c)">O modelo some do lado cortado conforme você move. Gire a órbita normalmente. A ' + (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '') + ' trena funciona na face do corte.</div>';
corteLPanel.setAttribute('data-bim', 'corteL');
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
var d0 = Infinity, d1 = -Infinity, c = new THREE.Vector3();
for (var i = 0; i < 8; i++) {
c.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
var d = n.dot(c); if (d < d0) d0 = d; if (d > d1) d1 = d;
}
corteL.d0 = d0; corteL.d1 = d1;
var frac = (+corteLPanel.querySelector('[data-k="pos"]').value) / 1000;
var s = d0 + (d1 - d0) * frac;
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
if (planta.on) setPlanta(false);
if (S._cxDesligar) S._cxDesligar();
setMode(false);
var box = new THREE.Box3().setFromObject(modelRoot);
if (box.isEmpty()) { corteL.on = false; S._hint('Carregue um modelo primeiro.'); return; }
corteLPanel.style.display = 'flex';
if (bc) { bc.style.background = corAtiva(); bc.style.color = '#fff'; }
aplicarCorteL();
S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('corte', 15) : '') + ' Corte livre: escolha a direção e arraste a posição — o modelo abre ao vivo. Esc sai.');
} else {
renderer.clippingPlanes = []; renderer.localClippingEnabled = false;
corteLPanel.style.display = 'none';
if (bc) { bc.style.background = ''; bc.style.color = ''; }
S._hint(medir.on ? '' + (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '') + ' Trena: clique em 2 pontos do modelo pra medir. Esc sai.' : '');
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
function corteEstado() {
var box = new THREE.Box3().setFromObject(modelRoot);
if (box.isEmpty()) return { on: false };
var frac = (+corteLPanel.querySelector('[data-k="pos"]').value) / 1000;
return { on: corteL.on, horizontal: corteL.inc === 90 && !corteL.inv, yMin: box.min.y, yMax: box.max.y, y: box.min.y + (box.max.y - box.min.y) * frac, frac: frac };
}
function corteHorizontal(h) {
if (h == null) { if (corteL.on) setCorteL(false); return corteEstado(); }
var box = new THREE.Box3().setFromObject(modelRoot);
if (box.isEmpty()) return { on: false };
corteL.az = 0; corteL.inc = 90; corteL.inv = false;
corteLPanel.querySelector('[data-k="az"]').value = 0; corteLPanel.querySelector('[data-k="inc"]').value = 90;
var bi = corteLPanel.querySelector('[data-k="inv"]'); if (bi) { bi.style.background = ''; bi.style.color = ''; }
var frac = Math.max(0, Math.min(1, (h - box.min.y) / Math.max(1e-6, box.max.y - box.min.y)));
corteLPanel.querySelector('[data-k="pos"]').value = Math.round(frac * 1000);
if (!corteL.on) {
setCorteL(true);
if (corteL.on) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('corte', 15) : '') + ' Corte horizontal: arraste o trilho ao lado da barra, ou use ▲/▼ pavimento.');
} else aplicarCorteL();
return corteEstado();
}
function pavimentosCorte() {
return pavLista().filter(function (pv) { return pv.y0 != null; }).map(function (pv) { return { nome: pv.nome, y: pv.y0 + 1.2 }; });
}
S._corteHorizontal = corteHorizontal; S._corteEstado = corteEstado; S._pavimentosCorte = pavimentosCorte;
var _giro = null, _giroEixo = new THREE.Vector3(0, 1, 0);
function girarVista(graus) {
if (fly.on || !graus) return false;
if (S._cancelTween) S._cancelTween();
if (S._pararInercia) S._pararInercia();
_giro = { total: graus * Math.PI / 180, feito: 0, dur: Math.max(0.35, Math.abs(graus) / 180 * 0.7), e: 0 };
return true;
}
S._tickExtra.push(function (dt) {
if (!_giro) return;
_giro.e += dt;
var k = Math.min(1, _giro.e / _giro.dur), s = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
var alvo = _giro.total * s, d = alvo - _giro.feito; _giro.feito = alvo;
var off = camera.position.clone().sub(orbit.target).applyAxisAngle(_giroEixo, d);
camera.position.copy(orbit.target).add(off); camera.lookAt(orbit.target);
if (k >= 1) _giro = null;
});
S._girarVista = girarVista;
var snap = { on: true, v: true, m: true, a: true, i: true, c: true, raio: 14 };
try { var _sv = JSON.parse(localStorage.getItem('orcapro:bim:snap') || 'null'); if (_sv) { snap.on = !!_sv.on; snap.v = !!_sv.v; snap.m = !!_sv.m; snap.a = !!_sv.a; snap.i = _sv.i !== false; snap.c = _sv.c !== false; } } catch (_) {}
function salvarSnap() { try { localStorage.setItem('orcapro:bim:snap', JSON.stringify({ on: snap.on, v: snap.v, m: snap.m, a: snap.a, i: snap.i, c: snap.c })); } catch (_) {} }
S.snap = snap;
var snapPanel = document.createElement('div');
snapPanel.style.cssText = 'position:absolute;right:10px;top:52px;z-index:4;display:none;flex-direction:column;gap:7px;background:var(--card-bg,#fff);border:1px solid var(--linha,#d3dce6);border-radius:var(--raio,12px);padding:11px 13px;color:var(--texto,#1a2b3c);font-size:12px;width:210px';
snapPanel.classList.add('bim-flut');
snapPanel.innerHTML =
'<div style="display:flex;justify-content:space-between;align-items:center"><b>' + (typeof Icones !== 'undefined' ? Icones.get('ima', 15) : '') + ' Snap da trena</b><button class="btn sm" data-s="on" style="padding:2px 9px">ON</button></div>' +
'<div style="display:flex;gap:5px;flex-wrap:wrap">' +
'<button class="btn sm" data-s="v" style="flex:1" title="Agarra no fim de linha (canto/vértice)">▪ Vértice</button>' +
'<button class="btn sm" data-s="m" style="flex:1" title="Agarra no meio da aresta">● Meio</button>' +
'<button class="btn sm" data-s="a" style="flex:1" title="Agarra no ponto mais próximo da aresta">◆ Aresta</button>' +
'<button class="btn sm" data-s="i" style="flex:1" title="Agarra no CRUZAMENTO real de duas arestas (canto parede×viga)">✚ Interseção</button>' +
'<button class="btn sm" data-s="c" style="flex:1" title="Agarra no EIXO de uma boca redonda: ponta de tubo, furo, pilar circular">⊕ Centro</button></div>' +
'<div style="font-size:11px;color:var(--texto-fraco,#5b6b7c)">Aproxime o clique de um canto/aresta: a cota agarra no ponto exato (o marcador mostra o tipo). Sem alvo por perto, mede na superfície livre.</div>';
host.appendChild(snapPanel);
S.snapPanel = snapPanel;
var reqPanel = document.createElement('div');
reqPanel.style.cssText = 'position:absolute;left:10px;right:10px;top:56px;z-index:5;display:none;flex-direction:column;gap:8px;background:var(--card-bg,#fff);border:1px solid var(--linha,#d3dce6);border-radius:11px;padding:12px 14px;color:var(--texto,#1a2b3c);font-size:12px;max-width:1180px;max-height:86%;overflow:auto;box-shadow:0 14px 38px rgba(12,31,51,.28)';
reqPanel.classList.add('bim-flut');
host.appendChild(reqPanel);
S.reqPanel = reqPanel;
var reqEstado = null;
var reqBusca = null;
function reqBuscaResultados(idx, termo) {
var t = String(termo || '').trim().toLowerCase();
if (t.length < 2) return '<div style="color:#6b7a8a;font-size:10.5px;padding:3px 0">digite ao menos 2 letras — ou o código do insumo</div>';
var todos = [];
try { if (typeof Insumos !== 'undefined') todos = Insumos._idx || []; } catch (e) { todos = []; }
if (!todos.length) return '<div style="color:#b45309;font-size:10.5px;padding:3px 0">o banco de insumos não está carregado nesta tela</div>';
var palavras = t.split(/\s+/).filter(Boolean);
var achados = [];
for (var i = 0; i < todos.length && achados.length < 40; i++) {
var it = todos[i];
if (String(it.tipo || '').toLowerCase() === 'composicao') continue;
var alvo = (String(it.codigo || '') + ' ' + String(it.descricao || '')).toLowerCase();
var tem = true;
for (var w = 0; w < palavras.length; w++) if (alvo.indexOf(palavras[w]) < 0) { tem = false; break; }
if (tem) achados.push(it);
}
if (!achados.length) return '<div style="color:#b45309;font-size:10.5px;padding:3px 0">nenhum insumo com todas essas palavras</div>';
return achados.slice(0, 25).map(function (it) {
return '<button class="btn sm" data-rq-pick="' + idx + '" data-rq-cod="' + esc(String(it.codigo)) + '" ' +
'style="display:block;width:100%;text-align:left;font-size:10.5px;margin:2px 0;white-space:normal">' +
esc(String(it.descricao).slice(0, 90)) + ' · <b>' + esc(String(it.unidade || '')) + '</b> · R$ ' +
(Number(it.custoUnitario) || 0).toFixed(2) + '</button>';
}).join('') + (achados.length > 25 ? '<div style="color:#6b7a8a;font-size:10px">mostrando 25 — refine a busca</div>' : '');
}
function reqLevantar() {
if (typeof BimPeca === 'undefined') { UI0('Motor de peças não carregado.', 'erro'); return null; }
var els = (S.elementos || []).filter(function (e) {
var f = String((e && e.fase) || '').toLowerCase();
return !(f === 'demolir' || f === 'demolicao' || f === 'existente');
});
if (!els.length) { UI0('Carregue um modelo primeiro.', 'info'); return null; }
var entrada = els.map(function (e) {
var q = e.qto || {}, quant = 0, un = '', fq = '';
if (q.comprimento > 0) { quant = q.comprimento; un = 'm'; fq = q.compFonte || 'ifc'; }
else if (q.area > 0) { quant = q.area; un = 'm2'; fq = 'ifc'; }
else if (q.volume > 0) { quant = q.volume; un = 'm3'; fq = 'ifc'; }
var bit = 0;
try {
if (e.mid != null && typeof BimTubo !== 'undefined' && BimTubo.ehTubo && BimTubo.ehTubo(e)) {
bit = lerBitolaMm(e.mid, e.id, fatorLen(e.mid)) || 0;
}
} catch (eB) {}
return { tipo: e.tipo, familia: e.familia, sistemaIfc: e.sistemaIfc, nome: e.nome,
descricao: e.descricao || '', descricaoFonte: e.descricaoFonte || '',
bitolaMm: bit, quantidade: quant, unidade: un, fonteQtd: fq, uid: e.uid, n: 1 };
});
var topos = {};
(S.modelos || []).forEach(function (mo) {
try { topos[mo.mid] = lerTopologiaRede(mo.mid); } catch (eT) {}
});
var topoUnida = { portaDe: {}, portasDe: {}, ligacao: {} };
Object.keys(topos).forEach(function (mid) {
var t = topos[mid] || {};
Object.keys(t.portaDe || {}).forEach(function (p) { topoUnida.portaDe[mid + ':' + p] = t.portaDe[p]; });
Object.keys(t.portasDe || {}).forEach(function (u) {
topoUnida.portasDe[u] = (t.portasDe[u] || []).map(function (p) { return mid + ':' + p; });
});
Object.keys(t.ligacao || {}).forEach(function (p) { topoUnida.ligacao[mid + ':' + p] = mid + ':' + t.ligacao[p]; });
});
try {
var mapaBit = BimPeca.bitolasPorTopologia(entrada, topoUnida);
BimPeca.aplicarTopologia(entrada, mapaBit);
} catch (eP) { }
return BimPeca.levantar(entrada);
}
var reqPeso = null;
function reqCarregarBase() {
try {
if (typeof Insumos === 'undefined') return Promise.resolve(0);
if (Insumos.carregado && (Insumos._idx || []).length) return Promise.resolve(Insumos._idx.length);
if (typeof Gestao === 'undefined' || !Gestao._analiticoAtivo) return Promise.resolve(0);
var a = Gestao._analiticoAtivo();
if (!a || !a.url) return Promise.resolve(0);
return Insumos.carregar(a.url, a.uf, a.live).then(function () { return (Insumos._idx || []).length; });
} catch (e) { return Promise.resolve(0); }
}
function reqCandidatos(peca) {
var todos = [];
try {
if (typeof Insumos !== 'undefined') {
if (!Insumos.carregado && Insumos.carregar) { }
todos = Insumos._idx || [];
}
} catch (e) { todos = []; }
var termos = peca.termos;
if (!todos.length || !termos.length) return [];
var pont = [];
for (var i = 0; i < todos.length; i++) {
var it = todos[i];
if (String(it.tipo || '').toLowerCase() === 'composicao') continue;
var d = String(it.descricao || '').toLowerCase();
var c = 0;
for (var t = 0; t < termos.length; t++) if (d.indexOf(termos[t]) >= 0) c++;
if (c) pont.push({ c: c, item: it });
}
pont.sort(function (a, b) { return b.c - a.c; });
return pont.slice(0, 300).map(function (x) { return { item: x.item, fonte: x.item.fonte || '' }; });
}
function reqFiltrada(paraGerar) {
if (!reqEstado) return [];
return (reqEstado.pecas || []).filter(function (x) {
if (paraGerar && x.removido) return false;
if (reqEstado.filtro && (x.p.subsistema || x.p.disciplina || 'sem classificação') !== reqEstado.filtro) return false;
if (reqEstado.grupo && (x.p.grupo || 'outros') !== reqEstado.grupo) return false;
return true;
});
}
function reqPintar() {
if (!reqEstado) return;
var pecas = reqEstado.pecas;
var cont = { ok: 0, escolher: 0, sem: 0 };
pecas.forEach(function (x) { cont[x.escolhido ? 'ok' : (x.v.candidatos.length ? 'escolher' : 'sem')]++; });
var subs = {};
pecas.forEach(function (x) { var k = x.p.subsistema || x.p.disciplina || 'sem classificação'; subs[k] = (subs[k] || 0) + x.p.n; });
var chips = Object.keys(subs).sort(function (a, b) { return subs[b] - subs[a]; }).map(function (k) {
var on = reqEstado.filtro === k;
return '<button class="btn sm" data-rq-sub="' + esc(k) + '"' + (on ? ' style="background:#2e6f9e;color:#fff"' : '') + '>' + esc(k) + ' <b>' + subs[k] + '</b></button>';
}).join(' ');
var grupos = {};
pecas.forEach(function (x) { var g = x.p.grupo || 'outros'; grupos[g] = (grupos[g] || 0) + x.p.n; });
var chipsG = Object.keys(grupos).sort(function (a, b) { return grupos[b] - grupos[a]; }).map(function (g) {
var on = reqEstado.grupo === g;
return '<button class="btn sm" data-rq-grp="' + esc(g) + '"' + (on ? ' style="background:#2e6f9e;color:#fff"' : '') + '>' +
esc(BimPeca.rotuloGrupo ? BimPeca.rotuloGrupo(g) : g) + ' <b>' + grupos[g] + '</b></button>';
}).join(' ');
var visiveis = reqFiltrada(false);
var linhas = visiveis.map(function (x) {
var p = x.p, v = x.v;
var medida = BimPeca.resumoDim(p.dims, p.bitolaPar);
var opcoes = v.candidatos.slice(0, 6).map(function (c, j) {
var sel = x.escolhido && x.escolhido.codigo === c.item.codigo;
return '<option value="' + j + '"' + (sel ? ' selected' : '') + '>' +
(c.dim === 'confere' ? '[medida confere] ' : c.dim === 'diverge' ? '[OUTRA MEDIDA] ' : '') +
esc(String(c.item.descricao).slice(0, 70)) + '  ·  R$ ' + (Number(c.item.custoUnitario) || 0).toFixed(2) +
'</option>';
}).join('');
if (x.escolhido) {
var jaTem = false;
v.candidatos.slice(0, 6).forEach(function (c) {
if (String(c.item.codigo) === String(x.escolhido.codigo)) jaTem = true;
});
if (!jaTem) {
opcoes = '<option value="M" selected>[escolhido por você] ' +
esc(String(x.escolhido.descricao).slice(0, 70)) + '  ·  R$ ' +
(Number(x.escolhido.custoUnitario) || 0).toFixed(2) + '</option>' + opcoes;
}
}
return '<tr' + (x.removido ? ' style="opacity:.45;text-decoration:line-through"' : '') + '>' +
'<td style="padding:5px 4px;vertical-align:top;border-top:1px solid var(--linha,#d3dce6)">' +
(p.descricao
? '<div><b>' + esc(String(p.descricao).slice(0, 54)) + '</b>' +
'<span title="O nome de mercado veio do campo Descrição do modelo — é ele que foi usado para casar com a base" style="margin-left:5px;font-size:9.5px;font-weight:700;color:var(--verde,#15803d);border:1px solid #86efac;border-radius:99px;padding:0 5px">Descrição</span></div>' +
'<div style="color:#6b7a8a;font-size:10.5px">' + esc(String(p.familia || p.rotulo || '(sem família)').slice(0, 54)) + '</div>' +
(p.descricaoVariantes > 1
? '<div style="color:#b45309;font-size:10.5px">' + p.descricaoVariantes + ' descrições diferentes nestas peças — comprando pela primeira</div>'
: '')
: '<div><b>' + esc(String(p.familia || p.rotulo || '(sem nome no modelo)').slice(0, 54)) + '</b></div>') +
'<div style="color:var(--texto-fraco,#5b6b7c);font-size:11px">' + p.n + ' pç · ' +
(p.fonteQtd === 'contagem' ? 'por contagem'
: p.fonteQtd === 'parcial'
? ('<span style="color:#b45309">' + p.quantidade.toFixed(2) + ' ' + p.unidade + ' — INCOMPLETO, ' + p.faltamMedida + ' peça(s) sem medida no IFC</span>')
: (p.quantidade.toFixed(2) + ' ' + p.unidade + ' medidos no IFC')) +
(medida !== 'sem medida' ? ' · ' + esc(medida) : '') + '</div>' +
(p.barras
? '<div style="color:var(--verde,#15803d);font-size:11px;font-weight:700">' + p.barras +
' barra(s) de ' + p.barraM + ' m para comprar</div>'
: '') +
(p.familiasReunidas > 1
? '<div style="color:var(--texto-fraco,#5b6b7c);font-size:10.5px" title="' +
esc((p.familiasOutras || []).join(' · ')) + '">' +
p.familiasReunidas + ' famílias do modelo reunidas nesta descrição</div>'
: '') +
'</td>' +
'<td style="padding:5px 4px;vertical-align:top;min-width:260px;border-top:1px solid var(--linha,#d3dce6)">' +
(opcoes
? '<select data-rq-sel="' + x.idx + '" style="width:100%;font-size:11px"><option value="">— deixar pendente —</option>' + opcoes + '</select>'
: '<span style="color:#b45309">sem candidato na base</span>') +
'<div style="color:var(--texto-fraco,#5b6b7c);font-size:11px;margin-top:3px">' + esc(v.porque) + '</div>' +
(reqBusca && reqBusca.idx === x.idx
? '<div style="margin-top:5px;border-top:1px dashed #c9d5e1;padding-top:5px">' +
'<input data-rq-busca="' + x.idx + '" value="' + esc(reqBusca.termo || '') + '" ' +
'placeholder="buscar na base: codigo ou palavras da descricao" ' +
'style="width:100%;padding:4px 7px;border-radius:6px;border:1px solid #9db4c8;background:#ffffff;color:var(--texto,#1a2b3c);font-size:11px">' +
'<div id="rq-res-' + x.idx + '" style="max-height:150px;overflow:auto;margin-top:4px">' +
reqBuscaResultados(x.idx, reqBusca.termo) + '</div></div>'
: '') +
'</td>' +
'<td style="padding:5px 4px;vertical-align:top;text-align:right;border-top:1px solid var(--linha,#d3dce6);white-space:nowrap">' +
(x.escolhido ? '<div style="color:var(--verde,#15803d);margin-bottom:3px">✓</div>' : '') +
'<button class="btn sm" data-rq-3d="' + x.idx + '" title="Levar a câmera até estas ' + p.n + ' peça(s) no modelo e contorná-las">' +
(typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + ' 3D</button> ' +
'<button class="btn sm" data-rq-buscar="' + x.idx + '" title="Procurar o item na base inteira, e nao so entre os candidatos que o casador achou">' +
(reqBusca && reqBusca.idx === x.idx ? 'fechar busca' : 'buscar') + '</button>' +
(x.escolhido
? ''
: ' <button class="btn sm" data-rq-novo="' + x.idx + '" title="Criar como insumo próprio, com a descrição e a unidade que vieram do modelo">+ insumo</button>') +
' <button class="btn sm" data-rq-remover="' + x.idx + '" title="' +
(x.removido ? 'Trazer esta peça de volta para a requisição' : 'Tirar esta peça da requisição — dá para voltar atrás') + '">' +
(x.removido ? 'voltar' : 'remover') + '</button>' +
'</td></tr>';
}).join('');
reqPanel.innerHTML =
'<div style="display:flex;align-items:center;gap:8px">' +
'<b style="flex:1">Requisitar pelo modelo</b>' +
'<button class="btn sm" data-rq="fechar" title="Fechar">' + ico('fechar') + '</button></div>' +
'<div style="color:var(--texto-fraco,#5b6b7c)">' + pecas.length + ' peças distintas · ' +
'<span style="color:var(--verde,#15803d)">' + cont.ok + ' casadas</span> · ' + cont.escolher + ' a escolher · ' +
'<span style="color:#b45309">' + cont.sem + ' sem candidato</span>' +
(function () {
var nR = 0;
pecas.forEach(function (y) { if (y.removido) nR++; });
return nR ? ' · <span style="color:#b91c1c">' + nR + ' removida(s), fora da requisição</span>' : '';
})() + '</div>' +
(function () {
var r = reqEstado.resumo || {};
var cd = r.comDescricao || 0, tot = pecas.length;
if (cd) {
return '<div style="color:var(--verde,#15803d);font-size:11px">' + cd + ' de ' + tot +
' peças trouxeram a <b>Descrição</b> do modelo — é por ela que o casamento com a base foi feito' +
(r.descricaoDivergente ? ', e em ' + r.descricaoDivergente + ' há descrições diferentes na mesma peça' : '') + '</div>';
}
return '<div style="color:#b45309;font-size:11px">Nenhuma peça trouxe o campo <b>Descrição</b> — o casamento foi feito só pelo nome da família. ' +
'Preencher a Descrição do tipo no Revit (o nome comercial) melhora o encontro com a base.</div>';
})() +
'<div style="display:flex;gap:4px;flex-wrap:wrap">' +
'<button class="btn sm" data-rq-sub=""' + (reqEstado.filtro ? '' : ' style="background:#2e6f9e;color:#fff"') + '>tudo</button>' + chips + '</div>' +
'<div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">' +
'<span style="color:#6b7a8a;font-size:11px">comprar:</span>' +
'<button class="btn sm" data-rq-grp=""' + (reqEstado.grupo ? '' : ' style="background:#2e6f9e;color:#fff"') + '>tudo</button>' + chipsG + '</div>' +
'<table style="width:100%;border-collapse:collapse;font-size:11.5px"><tbody>' + linhas + '</tbody></table>' +
((cont.sem + cont.escolher)
? '<div style="color:#b45309">O que ficar sem item entra como <b>linha pendente, sem preço</b> — o total sai parcial e precisa ser completado antes de mandar aprovar.</div>'
: '') +
'<div style="display:flex;gap:6px">' +
'<button class="btn sm primary" data-rq="gerar">Gerar requisição' +
(reqEstado.filtro ? ' (' + visiveis.length + ' de ' + pecas.length + ')' : '') + '</button>' +
'<button class="btn sm" data-rq="fechar">Cancelar</button></div>';
}
function reqAbrir() {
var lev = reqLevantar();
if (!lev) return;
if (typeof Insumos !== 'undefined' && !(Insumos._idx || []).length) {
UI0('Carregando o banco de insumos...', 'info');
reqCarregarBase().then(function (n) {
if (!n) { UI0('Nao consegui carregar o banco de insumos. Abra o app pelo Iniciar-OrcaPRO e tente de novo.', 'erro'); return; }
reqAbrir();
});
return;
}
try {
if (!reqPeso && typeof Insumos !== 'undefined' && Insumos._idx) {
reqPeso = BimPeca.pesosDe((Insumos._idx || []).filter(function (it) {
return String(it.tipo || '').toLowerCase() !== 'composicao';
}).map(function (it) { return { item: it }; }));
}
} catch (ePz) { reqPeso = null; }
var pecas = lev.pecas.map(function (p, i) {
var v = BimPeca.casar(p, reqCandidatos(p), { peso: reqPeso });
return { idx: i, p: p, v: v, escolhido: (v.status === 'ok' && v.candidatos[0]) ? v.candidatos[0].item : null };
});
reqEstado = { pecas: pecas, filtro: '', resumo: lev.resumo };
reqBusca = null;
reqEstado.grupo = '';
fecharPaineis(reqPanel);
reqPanel.style.display = 'flex';
reqPintar();
}
reqPanel.addEventListener('input', function (ev) {
var cx = ev.target && ev.target.getAttribute ? ev.target.getAttribute('data-rq-busca') : null;
if (cx === null || !reqBusca) return;
reqBusca.termo = ev.target.value || '';
var box = document.getElementById('rq-res-' + cx);
if (box) box.innerHTML = reqBuscaResultados(+cx, reqBusca.termo);
});
reqPanel.addEventListener('change', function (ev) {
var sel = ev.target && ev.target.closest ? ev.target.closest('[data-rq-sel]') : null;
if (!sel || !reqEstado) return;
var x = reqEstado.pecas[+sel.getAttribute('data-rq-sel')];
if (!x) return;
var j = sel.value;
if (j === 'M') { x.escolhaManual = true; return; }
x.escolhido = (j === '') ? null : ((x.v.candidatos[+j] || {}).item || null);
if (x.escolhido) x.escolhaManual = false;
reqPintar();
});
reqPanel.addEventListener('click', function (ev) {
var b = ev.target && ev.target.closest ? ev.target.closest('button') : null;
if (!b || !reqEstado) return;
var sub = b.getAttribute('data-rq-sub');
if (sub !== null) { reqEstado.filtro = sub; reqPintar(); return; }
var grp = b.getAttribute('data-rq-grp');
if (grp !== null) { reqEstado.grupo = (reqEstado.grupo === grp) ? '' : grp; reqPintar(); return; }
var ver3d = b.getAttribute('data-rq-3d');
if (ver3d !== null) {
var x3 = reqEstado.pecas[+ver3d];
if (x3) {
var achou = S._verNo3D ? S._verNo3D(x3.p.uids || []) : 0;
if (!achou) UI0('Não consegui localizar estas peças no 3D — o modelo restaurado do cache pode não trazer a caixa delas. Abra o .ifc de novo.', 'info');
else UI0(achou + ' peça(s) contornadas no modelo' + (achou < x3.p.n ? ' (de ' + x3.p.n + ' — a lista guarda até 200 por linha)' : '') + '.', 'ok');
}
return;
}
var abrir = b.getAttribute('data-rq-buscar');
if (abrir !== null) {
reqBusca = (reqBusca && reqBusca.idx === +abrir) ? null : { idx: +abrir, termo: '' };
reqPintar();
try { var cx = reqPanel.querySelector('[data-rq-busca]'); if (cx) cx.focus(); } catch (eF) {}
return;
}
var pick = b.getAttribute('data-rq-pick');
if (pick !== null) {
var xp = reqEstado.pecas[+pick];
var cod = b.getAttribute('data-rq-cod');
if (xp && cod) {
var achado = null;
try {
var lista = (typeof Insumos !== 'undefined' && Insumos._idx) || [];
for (var q = 0; q < lista.length; q++) if (String(lista[q].codigo) === cod) { achado = lista[q]; break; }
} catch (eP) {}
if (achado) { xp.escolhido = achado; xp.escolhaManual = true; reqBusca = null; reqPintar(); }
}
return;
}
var rem = b.getAttribute('data-rq-remover');
if (rem !== null) {
var xr = reqEstado.pecas[+rem];
if (xr) { xr.removido = !xr.removido; reqPintar(); }
return;
}
var novo = b.getAttribute('data-rq-novo');
if (novo !== null) {
var xn = reqEstado.pecas[+novo];
if (xn) {
try { window.dispatchEvent(new CustomEvent('orcapro:insumo-do-bim', { detail: BimPeca.paraInsumoProprio(xn.p) })); } catch (e2) {}
}
return;
}
var k = b.getAttribute('data-rq');
if (k === 'fechar') { reqPanel.style.display = 'none'; reqEstado = null; reqBusca = null;
if (S._limparLupa3d) S._limparLupa3d(); return; }
if (k === 'gerar') {
var visiveis = reqFiltrada(true);
if (!visiveis.length) { UI0('Não sobrou nenhuma peça para requisitar — todas foram removidas ou o filtro não deixou nenhuma.', 'info'); return; }
var escolhas = {};
visiveis.forEach(function (x) { escolhas[x.p.chave] = x.escolhido; });
var pac = BimPeca.paraRequisicao(visiveis.map(function (x) { return x.p; }), escolhas);
try { window.dispatchEvent(new CustomEvent('orcapro:requisicao-do-bim', { detail: pac })); } catch (e3) {}
reqPanel.style.display = 'none'; reqEstado = null; reqBusca = null;
}
});
S._reqAbrir = reqAbrir;
S._reqPintarTeste = function (pecas, resumo) {
reqEstado = {
pecas: (pecas || []).map(function (p, i) {
return { idx: i, p: p, v: { candidatos: [], porque: 'bancada de teste' }, escolhido: null };
}),
filtro: '', resumo: resumo || {}
};
reqPanel.style.display = 'flex';
reqPintar();
return reqPanel.innerHTML;
};
var sisPanel = document.createElement('div');
sisPanel.style.cssText = 'position:absolute;left:10px;bottom:14px;z-index:4;display:none;flex-direction:column;gap:6px;background:var(--card-bg,#fff);border:1px solid var(--linha,#d3dce6);border-radius:var(--raio,12px);padding:11px 13px;color:var(--texto,#1a2b3c);font-size:12px;width:238px;max-height:72%;overflow:auto';
sisPanel.classList.add('bim-flut', 'bim-flut-baixo');
host.appendChild(sisPanel);
S.sisPanel = sisPanel;
function pintarSisPanel() {
var cnt = sistemasPresentes();
var linhas = SIS_ORDEM.filter(function (k) { return cnt[k]; }).map(function (k) {
return '<label style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
'<input type="color" data-sk="' + k + '" value="' + sisCores[k] + '" style="width:26px;height:22px;border:0;background:none;padding:0;cursor:pointer">' +
'<span style="flex:1">' + esc(SIS_PADRAO[k].nome) + '</span>' +
'<b style="color:var(--texto-fraco,#5b6b7c);font-weight:600">' + cnt[k] + '</b></label>';
}).join('');
sisPanel.innerHTML =
'<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>' + (typeof Icones !== 'undefined' ? Icones.get('paleta', 15) : '') + ' Sistemas hidrossanitários</b>' +
'<button class="btn sm" data-sx="fechar" style="padding:2px 8px" title="Desligar as cores por sistema">Desligar cores</button></div>' +
(linhas || '<div style="color:var(--texto-fraco,#5b6b7c);line-height:1.4">Nenhum sistema hidráulico reconhecido pelos nomes dos elementos. As cores aparecem quando o IFC tiver tubulação nomeada (água fria, esgoto, pluvial, gás, incêndio…).</div>') +
'<div style="display:flex;gap:6px;margin-top:2px"><button class="btn sm" data-sx="padrao" style="flex:1" title="Voltar às cores padrão">' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Cores padrão</button></div>' +
'<div style="font-size:11px;color:var(--texto-fraco,#5b6b7c);line-height:1.4">Estas cores também valem na <b>Planta baixa</b> e no <b>RA/RV</b>. Clique numa cor pra trocar.</div>';
}
function montarLegendaChips() {
var cnt = sistemasPresentes();
var chips = SIS_ORDEM.filter(function (k) { return cnt[k]; }).map(function (k) {
return '<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(11,26,43,.72);border-radius:12px;padding:3px 8px;margin:2px"><span style="width:11px;height:11px;border-radius:3px;background:' + sisCores[k] + '"></span>' + esc(SIS_PADRAO[k].nome) + '</span>';
}).join('');
return chips ? '<div data-h="sisleg" style="position:absolute;left:8px;top:8px;max-width:62%;pointer-events:none;display:flex;flex-wrap:wrap;font-size:11px;color:#eaf2fb">' + chips + '</div>' : '';
}
S._montarLegendaChips = function () { return sisColor.on ? montarLegendaChips() : ''; };
function repintarSisBase() { S.modelos.forEach(function (mo) { refreshModelo(mo); }); if (S._reaplicarEstilo) S._reaplicarEstilo(); if (S._sisImersivoSync) S._sisImersivoSync(); }
function setSisColor(on) {
on = !!on;
if (on && S._estiloOn && S._estiloOn() && S._setEstiloDesenho) S._setEstiloDesenho(false);
if (on && catCor.on && S._setCoresCat) S._setCoresCat(false);
sisColor.on = on;
if (on) construirSisIdx();
S.modelos.forEach(function (mo) { refreshModelo(mo); });
if (S.selected) S.prevMat = matBase(S.selected);
if (S._reaplicarEstilo) S._reaplicarEstilo();
var b = bar.querySelector('[data-b="sistema"]');
if (b) { b.classList.toggle('on', on); b.style.background = on ? corAtiva() : ''; b.style.color = on ? '#fff' : ''; }
pintarSisPanel();
if (!(S.xr && S.xr.on)) { sisPanel.style.display = on ? 'flex' : 'none'; if (on) fecharPaineis(sisPanel); }
if (S._sisImersivoSync) S._sisImersivoSync();
if (S._hint) S._hint(on ? '' + (typeof Icones !== 'undefined' ? Icones.get('paleta', 15) : '') + ' Colorido por sistema hidrossanitário. Toque nas cores da legenda pra personalizar.' : 'Cores originais do modelo restauradas.');
}
S._setSistema = setSisColor;
S._sisColorOn = function () { return !!sisColor.on; };
S._sisClassificar = function (texto) { return classificaSistemaTxt(texto); };
S._reaplicarSistema = function () { if (!sisColor.on) return; construirSisIdx(); S.modelos.forEach(function (mo) { refreshModelo(mo); }); };
S._sisInfo = function () {
var pres = sistemasPresentes(), cores = {}, amostra = {};
SIS_ORDEM.forEach(function (k) { cores[k] = sisCores[k]; });
(S.elementos || []).forEach(function (e) {
var k = e.sistema || classificaEl(e);
if (amostra[k]) return;
var m = S.meshPorUid[e.uid];
amostra[k] = { uid: e.uid, nome: e.nome, matCor: (m && m.material && m.material.color) ? '#' + m.material.color.getHexString() : null };
});
return { on: !!sisColor.on, presentes: pres, cores: cores, amostra: amostra };
};
sisPanel.addEventListener('input', function (e) {
var ci = e.target.closest && e.target.closest('input[data-sk]'); if (!ci) return;
var k = ci.getAttribute('data-sk'); if (!/^#[0-9a-f]{6}$/i.test(ci.value)) return;
sisCores[k] = ci.value; salvarSisCores(); limparSisMatCache();
if (sisColor.on) repintarSisBase();
});
sisPanel.addEventListener('click', function (e) {
var b = e.target.closest('[data-sx]'); if (!b) return; var k = b.getAttribute('data-sx');
if (k === 'fechar') setSisColor(false);
else if (k === 'padrao') { SIS_ORDEM.forEach(function (kk) { sisCores[kk] = SIS_PADRAO[kk].cor; }); salvarSisCores(); limparSisMatCache(); pintarSisPanel(); if (sisColor.on) repintarSisBase(); }
});
function getBK() { return (typeof Blocok !== 'undefined' && Blocok) || (typeof window !== 'undefined' && window.Blocok) || null; }
function blocokLiberado() {
try {
try { if (typeof localStorage !== 'undefined' && localStorage.getItem('orcapro:blocok:owner') === '1') return true; } catch (_) {}
try { if (window.Modela && Modela.tem && Modela.tem('blocok')) return true; } catch (_) {}
var norm = function (e) { return String(e || '').trim().toLowerCase(); };
var A = (typeof window !== 'undefined' && window.Auth) ? window.Auth : (typeof Auth !== 'undefined' ? Auth : null);
var emLocal = (A && A.usuario && A.usuario()) ? norm(A.usuario().email) : '';
var N = (typeof window !== 'undefined' && window.Nuvem) ? window.Nuvem : null;
var emNuvem = (N && N.auth && N.auth.currentUser) ? norm(N.auth.currentUser.email) : '';
return blocokEmailLiberado(emLocal) || (!!emNuvem && blocokEmailLiberado(emNuvem));
} catch (_) { return false; }
}
var blocokCfg = { espForcada: 'auto', pesoPorEsp: { 10: 46, 13: 46, 15: 46, 20: 46 }, insCfg: null, moCfg: null, logCfg: null, descontarVaos: true };
function ensureInsCfg() { if (!blocokCfg.insCfg) { var bk = getBK(); blocokCfg.insCfg = bk ? bk.insumoDefaults() : {}; } return blocokCfg.insCfg; }
function ensureMoCfg() { if (!blocokCfg.moCfg) { var bk = getBK(); blocokCfg.moCfg = bk ? bk.maoDeObraDefaults() : {}; } return blocokCfg.moCfg; }
function ensureLogCfg() { if (!blocokCfg.logCfg) { var bk = getBK(); blocokCfg.logCfg = bk ? bk.logisticaDefaults() : {}; } return blocokCfg.logCfg; }
function ehParedeTipo(t) { t = String(t || '').toUpperCase(); return t.indexOf('WALL') >= 0 || t === 'PAREDE'; }
function ehVaoTipo(t) { t = String(t || '').toUpperCase(); return t.indexOf('DOOR') >= 0 || t.indexOf('WINDOW') >= 0 || t === 'PORTA' || t === 'JANELA'; }
function fmtB(n) { return (Math.round((+n || 0) * 100) / 100).toFixed(2).replace('.', ','); }
function pavDaParede(uid, yBase) {
try {
var lst = (S._pavLista) ? S._pavLista() : [];
if (!lst.length) return 'Pavimento único';
for (var i = 0; i < lst.length; i++) { if (lst[i].uids && lst[i].uids[uid]) return lst[i].nome; }
var melhor = null;
lst.forEach(function (pv) { if (pv.y0 != null && pv.y0 <= yBase + 0.5 && (!melhor || pv.y0 > melhor.y0)) melhor = pv; });
return (melhor && melhor.nome) || lst[0].nome || 'Pavimento único';
} catch (_) { return 'Pavimento único'; }
}
function extrairParedesBlocok() {
var BK = getBK(); if (!BK) return { paredes: [], vaosDet: 0 };
modelRoot.updateMatrixWorld(true);
var acc = {}, ordem = [], tmpV = new THREE.Vector3();
todasMalhas(function (m) {
var ud = m.userData || {}; if (ud.expressID == null || !m.geometry) return;
if (!ehParedeTipo(ud.tipo)) return;
if (m.visible === false || !cadeiaVisivel(m)) return;
var uid = ud.mid + ':' + ud.expressID, a = acc[uid];
if (!a) { a = acc[uid] = { pts: [], yMin: Infinity, yMax: -Infinity, tipo: ud.tipo }; ordem.push(uid); }
var pos = m.geometry.attributes && m.geometry.attributes.position; if (!pos) return;
var step = Math.max(1, Math.floor(pos.count / 260));
for (var i = 0; i < pos.count; i += step) {
tmpV.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
a.pts.push([tmpV.x, tmpV.z]);
if (tmpV.y < a.yMin) a.yMin = tmpV.y; if (tmpV.y > a.yMax) a.yMax = tmpV.y;
}
});
var vaos = [], nomePorUid = {};
(S.modelos || []).forEach(function (mo) {
(mo.elementos || []).forEach(function (e) {
nomePorUid[e.uid] = e.nome;
if (ehVaoTipo(e.tipo) && e.aabb) {
var mn = e.aabb.min, mx = e.aabb.max;
vaos.push({ cx: (mn[0] + mx[0]) / 2, cz: (mn[2] + mx[2]) / 2, y0: mn[1], y1: mx[1], sx: mx[0] - mn[0], sz: mx[2] - mn[2] });
}
});
});
var raw = [];
ordem.forEach(function (uid) {
var a = acc[uid]; if (a.pts.length < 6) return;
var obb = BK.obb2dXZ(a.pts); if (!obb) return;
var L = obb.comprimento, esp = obb.espessura, H = (a.yMax - a.yMin);
if (L < 0.3 || H < 0.3) return;
if (esp < 0.03) esp = 0.10;
var dx = obb.p2[0] - obb.p1[0], dz = obb.p2[1] - obb.p1[1], dl = Math.sqrt(dx * dx + dz * dz) || 1;
raw.push({ uid: uid, obb: obb, L: L, esp: esp, H: H, yMin: a.yMin, p1: obb.p1, ux: dx / dl, uz: dz / dl, vlist: [] });
});
var vaosDet = BK.distribuirVaos(raw, blocokCfg.descontarVaos ? vaos : []);
var paredes = [], np = 0;
raw.forEach(function (w) {
var espCm = (blocokCfg.espForcada === 'auto') ? BK.espBlocok(w.esp) : +blocokCfg.espForcada;
var pag = BK.paginar({ comprimento: w.L, altura: w.H, vaos: w.vlist });
np++;
paredes.push({ id: 'P' + np, uid: w.uid, nome: nomePorUid[w.uid] || ('Parede ' + np), comprimento: w.L, altura: w.H, espessura: espCm, espM: w.esp, pag: pag, p1: w.obb.p1, p2: w.obb.p2, vaos: w.vlist, yMin: w.yMin, pavimento: pavDaParede(w.uid, w.yMin) });
});
return { paredes: paredes, vaosDet: vaosDet };
}
S._extrairParedesBlocok = extrairParedesBlocok;
function svgParedeBlocok(pd) {
var pag = pd.pag, L = pag.comprimento, H = pag.altura, pad = 30;
var sc = Math.min(720 / L, 300 / H); if (!isFinite(sc) || sc <= 0) sc = 40;
var iw = L * sc, ih = H * sc, W = iw + pad * 2, Ht = ih + pad * 2 + 20;
function X(x) { return pad + x * sc; }
function Y(y) { return pad + (H - y) * sc; }
var s = '<svg viewBox="0 0 ' + W.toFixed(0) + ' ' + Ht.toFixed(0) + '" width="100%" style="max-width:' + Math.min(760, W).toFixed(0) + 'px;height:auto;background:#fff;border:1px solid #ccc;border-radius:6px">';
s += '<rect x="' + X(0).toFixed(1) + '" y="' + Y(H).toFixed(1) + '" width="' + iw.toFixed(1) + '" height="' + ih.toFixed(1) + '" fill="#fbfdff" stroke="#123" stroke-width="1.4"/>';
(pd.vaos || []).forEach(function (v) {
s += '<rect x="' + X(v.x).toFixed(1) + '" y="' + Y(v.y + v.h).toFixed(1) + '" width="' + (v.w * sc).toFixed(1) + '" height="' + (v.h * sc).toFixed(1) + '" fill="#e8ecef" stroke="#8a97a3" stroke-dasharray="4 3"/>';
if (v.w * sc > 30 && v.h * sc > 18) s += '<text x="' + X(v.x + v.w / 2).toFixed(1) + '" y="' + Y(v.y + v.h / 2).toFixed(1) + '" font-size="10" fill="#6b7a8a" text-anchor="middle" dominant-baseline="middle">VÃO</text>';
});
var fs = Math.max(8, Math.min(15, sc * 0.28));
pag.placas.forEach(function (p) {
var px = X(p.x), py = Y(p.y + p.h), pw = p.w * sc, ph = p.h * sc, rec = p.tipo === 'recorte';
s += '<rect x="' + px.toFixed(1) + '" y="' + py.toFixed(1) + '" width="' + pw.toFixed(1) + '" height="' + ph.toFixed(1) + '" fill="' + (rec ? '#fdecc8' : '#e6f0fb') + '" stroke="#2b4a6b" stroke-width="0.7"/>';
if (pw > 15 && ph > 13) {
s += '<text x="' + (px + pw / 2).toFixed(1) + '" y="' + (py + ph / 2).toFixed(1) + '" font-size="' + fs.toFixed(1) + '" font-weight="bold" fill="#12314f" text-anchor="middle" dominant-baseline="middle">' + p.n + '</text>';
if (rec && pw > 42 && ph > 30) s += '<text x="' + (px + pw / 2).toFixed(1) + '" y="' + (py + ph - 3).toFixed(1) + '" font-size="8" fill="#8a5a10" text-anchor="middle">' + Math.round(p.w * 100) + '×' + Math.round(p.h * 100) + '</text>';
}
});
s += '<text x="' + (pad + iw / 2).toFixed(1) + '" y="' + (Ht - 5).toFixed(1) + '" font-size="11" fill="#333" text-anchor="middle">L = ' + fmtB(L) + ' m · H = ' + fmtB(H) + ' m · esp ' + pd.espessura + ' cm</text>';
return s + '</svg>';
}
function svgMapaBlocok(paredes) {
if (!paredes.length) return '';
var xs = [], zs = [];
paredes.forEach(function (pd) { xs.push(pd.p1[0], pd.p2[0]); zs.push(pd.p1[1], pd.p2[1]); });
var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs), minZ = Math.min.apply(null, zs), maxZ = Math.max.apply(null, zs);
var w = (maxX - minX) || 1, h = (maxZ - minZ) || 1, pad = 26;
var sc = Math.min(680 / w, 420 / h); if (!isFinite(sc) || sc <= 0) sc = 20;
var W = w * sc + pad * 2, H = h * sc + pad * 2;
function X(x) { return pad + (x - minX) * sc; }
function Y(z) { return pad + (z - minZ) * sc; }
var s = '<svg viewBox="0 0 ' + W.toFixed(0) + ' ' + H.toFixed(0) + '" width="100%" style="max-width:' + Math.min(720, W).toFixed(0) + 'px;height:auto;background:#fff;border:1px solid #ccc;border-radius:6px">';
paredes.forEach(function (pd) {
var x1 = X(pd.p1[0]), y1 = Y(pd.p1[1]), x2 = X(pd.p2[0]), y2 = Y(pd.p2[1]), mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
s += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="#1858a8" stroke-width="4" stroke-linecap="round"/>';
s += '<circle cx="' + mx.toFixed(1) + '" cy="' + my.toFixed(1) + '" r="10" fill="#fff" stroke="#1858a8"/>';
s += '<text x="' + mx.toFixed(1) + '" y="' + my.toFixed(1) + '" font-size="10" font-weight="bold" fill="#123" text-anchor="middle" dominant-baseline="middle">' + esc(pd.id) + '</text>';
});
return s + '</svg>';
}
function gerarBlocok(opts) {
opts = opts || {};
if (!blocokLiberado()) { if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Plantas Executivas Blocok é um recurso exclusivo (liberado por licença).'); return null; }
var BK = getBK();
if (!BK) { if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Motor Blocok não carregou (js/blocok.js).'); return null; }
if (!(S.modelos && S.modelos.length)) { if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Abra um IFC primeiro — o Blocok lê as paredes do modelo.'); return null; }
var ext = extrairParedesBlocok(), paredes = ext.paredes;
if (!paredes.length) { if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Nenhuma parede visível reconhecida (IfcWall). Verifique se o andar/disciplina está ligado.'); return { paredes: [], material: null, carga: null, insumos: null }; }
var mat = BK.material(paredes, { pesoPorEsp: blocokCfg.pesoPorEsp });
var carga = BK.cargaFundacao(paredes, { pesoPorEsp: blocokCfg.pesoPorEsp });
var ins = BK.insumos(paredes, ensureInsCfg());
var dados = { paredes: paredes, material: mat, carga: carga, insumos: ins, vaosDet: ext.vaosDet };
if (!opts.semJanela) abrirRelatorioBlocok(dados);
if (S._hint) S._hint('🧱 ' + paredes.length + ' paredes · ' + mat.totalPlacas + ' placas · ' + fmtB(mat.pesoTotalT) + ' t. Prancha aberta em nova aba.');
return dados;
}
S.blocok = gerarBlocok;
S._blocokLiberado = blocokLiberado;
function gerarPlanilhaBlocok() {
if (!blocokLiberado()) { if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Recurso exclusivo (liberado por licença).'); return null; }
try { if (!(window.App && App._demo) && window.Licenca && Licenca.status && Licenca.status().suspensa) { if (window.App && App._avisoTrial) App._avisoTrial(); return null; } } catch (_) {}
var BK = getBK(); if (!BK) { if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Motor Blocok não carregou.'); return null; }
var XLS = (typeof window !== 'undefined' && window.BlocokXLS) || null;
if (!XLS) { if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('graficos', 15) : '') + ' Módulo de planilha não carregou (js/blocokxls.js).'); return null; }
if (!(S.modelos && S.modelos.length)) { if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Abra um IFC primeiro.'); return null; }
var ext = extrairParedesBlocok(), paredes = ext.paredes;
if (!paredes.length) { if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Nenhuma parede visível reconhecida (IfcWall).'); return null; }
var pesoCfg = { pesoPorEsp: blocokCfg.pesoPorEsp }, ic = ensureInsCfg();
var mat = BK.material(paredes, pesoCfg);
var pacote = {
obra: (S.opts && (S.opts.obraNome || S.opts.obra)) || 'Obra', data: new Date().toLocaleDateString('pt-BR'),
paredes: paredes, material: mat, insumos: BK.insumos(paredes, ic), carga: BK.cargaFundacao(paredes, pesoCfg),
maoObra: BK.maoDeObra(mat, ensureMoCfg()), logistica: BK.logistica(mat, ensureLogCfg()),
moCfg: ensureMoCfg(), pesoCfg: pesoCfg,
juntaNome: (ic.junta && ic.junta.tipo === 'argamassa') ? 'argamassa polimérica (junta preenchida)' : (ic.junta && ic.junta.tipo === 'seca') ? 'encaixe seco' : 'cola/adesivo polimérico (cordão)',
premissas: { faceCm: ic.faceCm, cimento: ic.mix && ic.mix.cimento, areia: ic.mix && ic.mix.areia, pedrisco: ic.mix && ic.mix.pedrisco, aditivo: ic.mix && ic.mix.aditivo }
};
if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('graficos', 15) : '') + ' Gerando a planilha Excel (' + paredes.length + ' paredes, ' + mat.totalPlacas + ' placas)…');
XLS.gerar(pacote, {
nome: 'Blocok — ' + pacote.obra + ' — ' + pacote.data.replace(/\//g, '-'),
ok: function () { if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('graficos', 15) : '') + ' Planilha Excel baixada — abas por pavimento + romaneio + material + insumos + mão de obra + cargas + logística.'); },
erro: function (e) { if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('graficos', 15) : '') + ' Não gerou a planilha (' + e + ').'); }
});
return pacote;
}
S.blocokPlanilha = gerarPlanilhaBlocok;
function abrirRelatorioBlocok(d) {
var w = null; try { w = window.open('', '_blank'); } catch (_) {}
if (!w) { if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('imprimir', 15) : '') + ' O navegador bloqueou a nova aba — libere pop-ups pra ver as pranchas Blocok.'); return; }
var obra = (S.opts && (S.opts.obraNome || S.opts.obra)) || 'Obra', hoje = new Date().toLocaleDateString('pt-BR');
var m = d.material, cg = d.carga;
function card(v, l) { return '<div class="cd"><b>' + v + '</b><span>' + esc(l) + '</span></div>'; }
var cards = card(d.paredes.length, 'paredes') + card(m.totalPlacas, 'placas 90×90') + card(m.totalInteiras, 'inteiras') + card(m.totalRecortes, 'recortes') + card(fmtB(m.areaPlacas) + ' m²', 'área de placa') + card(fmtB(m.pesoTotalT) + ' t', 'peso p/ compra');
var trEsp = m.porEspessura.map(function (e) { return '<tr><td>' + e.espessura + ' cm</td><td>' + e.placas + '</td><td>' + e.inteiras + '</td><td>' + e.recortes + '</td><td>' + fmtB(e.area) + '</td><td>' + fmtB(e.peso) + '</td></tr>'; }).join('');
var ins = d.insumos || { producao: [], montagem: [], areaCheia: 0, areaInstalada: 0, juntaTipo: '' };
function trInsumo(i) { return '<tr><td>' + esc(i.nome) + '</td><td>' + fmtB(i.total) + '</td><td>' + esc(i.unid) + '</td></tr>'; }
var trProd = (ins.producao || []).map(trInsumo).join('');
var juntaNome = ins.juntaTipo === 'argamassa' ? 'argamassa polimérica (junta preenchida)' : (ins.juntaTipo === 'seca' ? 'encaixe seco (sem argamassa)' : 'adesivo/argamassa polimérica (cordão)');
var trMont = (ins.montagem || []).length ? (ins.montagem || []).map(trInsumo).join('') : '<tr><td colspan="3" style="text-align:left;color:#6b7a8a">Junta seca — sem consumo de argamassa/adesivo.</td></tr>';
var trCg = cg.linhas.map(function (l, ix) { var pd = d.paredes[ix]; return '<tr><td>' + esc(pd ? pd.id : ('P' + (ix + 1))) + '</td><td>' + fmtB(l.comprimento) + '</td><td>' + l.espessura + '</td><td>' + l.placas + '</td><td>' + fmtB(l.pesoKg) + '</td><td>' + fmtB(l.cargaKgM) + '</td><td>' + fmtB(l.cargaKNm) + '</td></tr>'; }).join('');
var pranchas = d.paredes.map(function (pd) {
var pg = pd.pag;
return '<div class="pr"><h3>' + esc(pd.id) + ' — ' + esc(pd.nome) + '</h3><div class="meta">' + fmtB(pd.comprimento) + ' × ' + fmtB(pd.altura) + ' m · esp ' + pd.espessura + ' cm · ' + pg.total + ' placas (' + pg.inteiras + ' inteiras + ' + pg.recortes + ' recortes)' + (pd.vaos && pd.vaos.length ? ' · ' + pd.vaos.length + ' vão(s)' : '') + '</div>' + svgParedeBlocok(pd) + '</div>';
}).join('');
var mapa = svgMapaBlocok(d.paredes);
var css = '*{box-sizing:border-box}body{font-family:-apple-system,Segoe UI,Arial,sans-serif;margin:0;color:#12314f;background:#f4f7fb}'
+ 'header{background:linear-gradient(135deg,#0f2740,#1858a8);color:#fff;padding:20px 26px;display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}'
+ 'header h1{margin:0;font-size:21px}header .sub{opacity:.85;font-size:13px;margin-top:3px}'
+ '.wrap{max-width:1000px;margin:0 auto;padding:18px 22px 20px}.cards{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0}'
+ '.cd{background:#fff;border:1px solid #dbe4ee;border-radius:10px;padding:10px 14px;min-width:96px;flex:1}.cd b{display:block;font-size:20px;color:#1858a8}.cd span{font-size:11px;color:#6b7a8a;text-transform:uppercase;letter-spacing:.4px}'
+ 'h2{font-size:15px;border-bottom:2px solid #1858a8;padding-bottom:5px;margin:26px 0 12px}'
+ 'table{width:100%;border-collapse:collapse;font-size:12.5px;background:#fff}th,td{border:1px solid #d5dfea;padding:6px 9px;text-align:right}th{background:#eaf1f8}td:first-child,th:first-child{text-align:left}'
+ '.conf{color:#b26a00;font-style:italic}.leg{display:flex;flex-wrap:wrap;gap:16px;font-size:11.5px;color:#6b7a8a;margin:8px 0}.leg span{display:inline-flex;align-items:center;gap:5px}.sw{width:14px;height:14px;border-radius:3px;border:1px solid #2b4a6b;display:inline-block}'
+ '.pr{background:#fff;border:1px solid #dbe4ee;border-radius:10px;padding:14px;margin:14px 0;page-break-inside:avoid}.pr h3{margin:0 0 3px;font-size:14px;color:#1858a8}.pr .meta{font-size:12px;color:#6b7a8a;margin-bottom:8px}'
+ 'footer{max-width:1000px;margin:0 auto;padding:8px 22px 40px;font-size:11px;color:#7a8a99;line-height:1.55}'
+ '.pbtn{background:#16a34a;color:#fff;border:0;border-radius:8px;padding:9px 16px;font-size:13px;cursor:pointer}'
+ '@media print{.pbtn,.noprint{display:none}body{background:#fff}}';
var html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Plantas Executivas Blocok — ' + esc(obra) + '</title><style>' + css + '</style></head><body>'
+ '<header><div><h1>' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Plantas Executivas — Sistema Blocok</h1><div class="sub">' + esc(obra) + ' · ' + hoje + ((typeof Empresa!=='undefined'&&Empresa.creditoTexto&&Empresa.creditoTexto())?' · gerado no OrçaPRO BIM':'') + '</div></div><button class="pbtn noprint" onclick="window.print()">' + (typeof Icones !== 'undefined' ? Icones.get('imprimir', 15) : '') + ' Imprimir / PDF</button></header>'
+ '<div class="wrap">'
+ '<div class="cards">' + cards + '</div>'
+ '<div class="leg"><span><i class="sw" style="background:#e6f0fb"></i> placa inteira 90×90 cm</span><span><i class="sw" style="background:#fdecc8"></i> recorte (dimensão em cm)</span><span><i class="sw" style="background:#e8ecef;border-style:dashed"></i> vão (porta/janela)</span></div>'
+ (mapa ? '<h2>' + (typeof Icones !== 'undefined' ? Icones.get('planta', 15) : '') + ' Mapa de localização das paredes</h2>' + mapa : '')
+ '<h2>' + (typeof Icones !== 'undefined' ? Icones.get('estoque', 15) : '') + ' Material — placas por espessura</h2><table><thead><tr><th>Espessura</th><th>Placas</th><th>Inteiras</th><th>Recortes</th><th>Área (m²)</th><th>Peso (kg)</th></tr></thead><tbody>' + trEsp + '<tr style="font-weight:bold;background:#eef4fa"><td>Total</td><td>' + m.totalPlacas + '</td><td>' + m.totalInteiras + '</td><td>' + m.totalRecortes + '</td><td>' + fmtB(m.areaPlacas) + '</td><td>' + fmtB(m.pesoTotalKg) + '</td></tr></tbody></table>'
+ '<h2>🏭 Insumos de produção das placas <span style="font-size:11px;color:#6b7a8a;font-weight:400">(fábrica — por placa cheia produzida: ' + fmtB(ins.areaCheia) + ' m²)</span></h2><table><thead><tr><th>Insumo</th><th>Quantidade</th><th>Unid.</th></tr></thead><tbody>' + trProd + '</tbody></table>'
+ '<h2>' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Insumos de montagem/assentamento <span style="font-size:11px;color:#6b7a8a;font-weight:400">(obra — junta: ' + esc(juntaNome) + ' · por ' + fmtB(ins.areaInstalada) + ' m² instalados)</span></h2><table><thead><tr><th>Insumo</th><th>Quantidade</th><th>Unid.</th></tr></thead><tbody>' + trMont + '</tbody></table>'
+ '<h2>' + (typeof Icones !== 'undefined' ? Icones.get('obra', 15) : '') + ' Carga própria das paredes na fundação</h2><table><thead><tr><th>Parede</th><th>Comp. (m)</th><th>Esp. (cm)</th><th>Placas</th><th>Peso (kg)</th><th>Carga (kg/m)</th><th>Carga (kN/m)</th></tr></thead><tbody>' + trCg + '<tr style="font-weight:bold;background:#eef4fa"><td>Total</td><td>—</td><td>—</td><td>' + m.totalPlacas + '</td><td>' + fmtB(cg.pesoTotalKg) + '</td><td>—</td><td>—</td></tr></tbody></table>'
+ '<h2>' + (typeof Icones !== 'undefined' ? Icones.get('regua', 15) : '') + ' Pranchas executivas por parede</h2>' + pranchas
+ '</div>'
+ '<footer><b>Observações e premissas (honestidade técnica):</b><br>'
+ '1) Os insumos são uma <b>estimativa técnica calculada</b> a partir da geometria do painel (2 faces de micro concreto + núcleo EPS + junta de assentamento) com um <b>traço de referência editável</b>: produção por placa cheia produzida, assentamento por m² instalado conforme a <b>junta escolhida</b>. Ajuste traço/junta/peso no painel se a sua fábrica usar valores próprios.<br>'
+ '2) Comprimento, altura e espessura de cada parede são extraídos da geometria do IFC (OBB 2D no plano); paredes fora de esquadro, curvas ou fragmentadas podem exigir conferência manual.<br>'
+ '3) Vãos de porta/janela são detectados automaticamente pela posição no modelo — confira nas pranchas (só some a placa 100% dentro do vão).<br>'
+ '4) A carga na fundação é o <b>peso próprio LÍQUIDO</b> das paredes (área de placa efetivamente instalada — o retalho do recorte é descartado, não pesa na parede). Já o card <b>“peso p/ compra”</b> soma <b>placas cheias</b> (o que você adquire/transporta). Não inclui laje, cobertura nem sobrecarga de uso — some às demais cargas no dimensionamento estrutural.<br>'
+ '5) Placas numeradas em fiadas da <b>base para o topo</b>, da <b>esquerda para a direita</b>. ' + ((typeof Empresa!=='undefined'&&Empresa.creditoTexto&&Empresa.creditoTexto())?'Gerado no OrçaPRO BIM.':'') + '</footer>'
+ '</body></html>';
try { w.document.write(html); w.document.close(); } catch (_) { if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Não deu pra montar a prancha na nova aba.'); }
}
var blocokPanel = document.createElement('div');
blocokPanel.style.cssText = 'position:absolute;left:10px;bottom:14px;z-index:4;display:none;flex-direction:column;gap:7px;background:var(--card-bg,#fff);border:1px solid var(--linha,#d3dce6);border-radius:11px;padding:12px 13px;color:var(--texto,#1a2b3c);font-size:12px;width:264px;max-height:80%;overflow:auto';
blocokPanel.classList.add('bim-flut', 'bim-flut-baixo');
host.appendChild(blocokPanel);
S.blocokPanel = blocokPanel;
var INP = 'width:58px;background:var(--surface,#fff);border:1px solid var(--linha,#d3dce6);color:var(--texto,#1a2b3c);border-radius:5px;padding:2px 5px';
function linhaNum(rot, attrs, val, unid) {
return '<label style="display:flex;align-items:center;gap:5px;margin-top:3px"><span style="flex:1;color:var(--texto-fraco,#5b6b7c);font-size:11px">' + rot + '</span><input type="number" min="0" step="0.1" ' + attrs + ' value="' + val + '" style="' + INP + '"><span style="color:var(--texto-fraco,#5b6b7c);font-size:10px;width:40px">' + unid + '</span></label>';
}
function pintarBlocokPanel() {
var c = ensureInsCfg();
var espOpts = ['auto', 10, 13, 15, 20].map(function (v) { return '<option value="' + v + '"' + (String(blocokCfg.espForcada) === String(v) ? ' selected' : '') + '>' + (v === 'auto' ? 'Automática (espessura real)' : v + ' cm') + '</option>'; }).join('');
var juntaOpts = [['cola', 'Cola/adesivo polimérico (cordão)'], ['argamassa', 'Argamassa polimérica (junta preenchida)'], ['seca', 'Encaixe seco (sem argamassa)']].map(function (o) { return '<option value="' + o[0] + '"' + (c.junta.tipo === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('');
var juntaExtra = (c.junta.tipo === 'cola') ? linhaNum('Consumo do adesivo', 'data-bkj="cola"', c.junta.colaKgM2, 'kg/m²')
: (c.junta.tipo === 'argamassa') ? linhaNum('Espessura da junta', 'data-bkj="gap"', c.junta.gapCm, 'cm') : '';
var pesos = [10, 13, 15, 20].map(function (e) { return '<label style="display:flex;align-items:center;gap:5px;margin-top:3px"><span style="width:36px;color:var(--texto-fraco,#5b6b7c)">' + e + ' cm</span><input type="number" min="1" step="0.5" data-bkp="peso" data-esp="' + e + '" value="' + blocokCfg.pesoPorEsp[e] + '" style="' + INP + '"><span style="color:var(--texto-fraco,#5b6b7c);font-size:11px">kg/placa</span></label>'; }).join('');
var traco = linhaNum('Cimento CP-V', 'data-bkm="cimento"', c.mix.cimento, 'kg/m³')
+ linhaNum('Areia industrial', 'data-bkm="areia"', c.mix.areia, 'm³/m³')
+ linhaNum('Pedrisco', 'data-bkm="pedrisco"', c.mix.pedrisco, 'm³/m³')
+ linhaNum('Aditivo polimérico', 'data-bkm="aditivo"', c.mix.aditivo, 'kg/m³')
+ linhaNum('Face de micro concreto', 'data-bkf="face"', c.faceCm, 'cm');
var mc = ensureMoCfg(), lc = ensureLogCfg();
var molog = linhaNum('Rendimento', 'data-bkmo="placasDiaEquipe"', mc.placasDiaEquipe, 'placas/dia')
+ linhaNum('Equipes', 'data-bkmo="nEquipes"', mc.nEquipes, 'equipe')
+ linhaNum('Pessoas/equipe', 'data-bkmo="pessoasEquipe"', mc.pessoasEquipe, 'pess.')
+ linhaNum('Jornada', 'data-bkmo="jornadaH"', mc.jornadaH, 'h/dia')
+ linhaNum('Custo MO', 'data-bkmo="custoHh"', mc.custoHh, 'R$/Hh')
+ linhaNum('Capac./viagem', 'data-bklg="pesoViagemKg"', lc.pesoViagemKg, 'kg')
+ linhaNum('Placas/pallet', 'data-bklg="placasPallet"', lc.placasPallet, 'un');
blocokPanel.innerHTML =
'<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Plantas Executivas Blocok</b><button class="btn sm" data-bk="fechar" style="padding:2px 8px">' + (typeof Icones !== 'undefined' ? Icones.get('fechar', 15) : '') + '</button></div>'
+ '<div style="font-size:11px;color:var(--texto-fraco,#5b6b7c);line-height:1.35">Lê as paredes do IFC → pranchas 90×90 numeradas + material + <b>insumos calculados</b> + carga na fundação.</div>'
+ '<label style="display:flex;flex-direction:column;gap:2px"><span style="color:var(--texto-fraco,#5b6b7c)">Espessura Blocok</span><select data-bk="esp" style="background:var(--surface,#fff);border:1px solid var(--linha,#d3dce6);color:var(--texto,#1a2b3c);border-radius:5px;padding:3px 5px">' + espOpts + '</select></label>'
+ '<label style="display:flex;flex-direction:column;gap:2px;margin-top:2px"><span style="color:var(--texto-fraco,#5b6b7c)">Junta de assentamento</span><select data-bk="junta" style="background:var(--surface,#fff);border:1px solid var(--linha,#d3dce6);color:var(--texto,#1a2b3c);border-radius:5px;padding:3px 5px">' + juntaOpts + '</select></label>' + juntaExtra
+ '<details style="border-top:1px solid var(--linha,#d3dce6);padding-top:5px"><summary style="cursor:pointer;font-size:11px;color:#243b52">Traço do micro concreto (avançado)</summary>' + traco + '</details>'
+ '<details style="border-top:1px solid var(--linha,#d3dce6);padding-top:5px"><summary style="cursor:pointer;font-size:11px;color:#243b52">Peso por placa (compra)</summary>' + pesos + '</details>'
+ '<details style="border-top:1px solid var(--linha,#d3dce6);padding-top:5px"><summary style="cursor:pointer;font-size:11px;color:#243b52">Mão de obra & logística (planilha)</summary>' + molog + '</details>'
+ '<label style="display:flex;align-items:center;gap:6px;margin-top:2px"><input type="checkbox" data-bk="vaos"' + (blocokCfg.descontarVaos ? ' checked' : '') + '> descontar vãos (portas/janelas)</label>'
+ '<button class="btn sm primary" data-bk="gerar" style="margin-top:2px">' + (typeof Icones !== 'undefined' ? Icones.get('regua', 15) : '') + ' Gerar plantas executivas</button>'
+ '<button class="btn sm" data-bk="planilha" style="margin-top:2px">' + (typeof Icones !== 'undefined' ? Icones.get('graficos', 15) : '') + ' Gerar planilha (Excel)</button>'
+ '<div style="font-size:10px;color:#8296ab;line-height:1.3">Planilha com abas por pavimento, romaneio de placas, material, insumos, mão de obra, cargas e logística. Insumos <b>calculados</b> (traço editável).</div>';
}
function toggleBlocokPanel() {
if (!blocokLiberado()) { if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Plantas Executivas Blocok é um recurso exclusivo (liberado por licença).'); return; }
var abrir = (blocokPanel.style.display === 'none' || !blocokPanel.style.display);
if (abrir) { pintarBlocokPanel(); fecharPaineis(blocokPanel); blocokPanel.style.display = 'flex'; }
else blocokPanel.style.display = 'none';
var b = bar.querySelector('[data-b="blocok"]'); if (b) { b.style.background = abrir ? corAtiva() : ''; b.style.color = abrir ? '#fff' : ''; }
}
S._toggleBlocok = toggleBlocokPanel;
blocokPanel.addEventListener('change', function (e) {
var t = e.target; if (!t.getAttribute) return;
var k = t.getAttribute('data-bk'), kp = t.getAttribute('data-bkp'), kj = t.getAttribute('data-bkj'), kf = t.getAttribute('data-bkf'), km = t.getAttribute('data-bkm'), kmo = t.getAttribute('data-bkmo'), klg = t.getAttribute('data-bklg');
var c = ensureInsCfg();
if (k === 'esp') blocokCfg.espForcada = (t.value === 'auto') ? 'auto' : +t.value;
else if (k === 'vaos') blocokCfg.descontarVaos = !!t.checked;
else if (k === 'junta') { c.junta.tipo = t.value; pintarBlocokPanel(); }
else if (kj === 'cola') c.junta.colaKgM2 = Math.max(0, +t.value || 0);
else if (kj === 'gap') c.junta.gapCm = Math.max(0, +t.value || 0);
else if (kf === 'face') c.faceCm = Math.max(0.3, +t.value || 1.5);
else if (km) c.mix[km] = Math.max(0, +t.value || 0);
else if (kmo) ensureMoCfg()[kmo] = Math.max(0, +t.value || 0);
else if (klg) ensureLogCfg()[klg] = Math.max(0, +t.value || 0);
else if (kp === 'peso') { var esp = t.getAttribute('data-esp'), val = +t.value; if (val > 0) blocokCfg.pesoPorEsp[esp] = val; }
});
blocokPanel.addEventListener('click', function (e) {
var b = e.target.closest('[data-bk]'); if (!b) return; var k = b.getAttribute('data-bk');
if (k === 'fechar') toggleBlocokPanel();
else if (k === 'gerar') gerarBlocok({});
else if (k === 'planilha') gerarPlanilhaBlocok();
});
function pintarSnapPanel() {
var cfg = { on: snap.on, v: snap.v, m: snap.m, a: snap.a, i: snap.i, c: snap.c };
['on', 'v', 'm', 'a', 'i', 'c'].forEach(function (kk) {
var b = snapPanel.querySelector('[data-s="' + kk + '"]'); if (!b) return;
b.style.background = cfg[kk] ? corAtiva() : ''; b.style.color = cfg[kk] ? '#fff' : '';
if (kk === 'on') b.textContent = cfg.on ? 'ON' : 'OFF';
});
var bs = bar.querySelector('[data-b="snap"]'); if (bs) { bs.style.background = snap.on ? corAtiva() : ''; bs.style.color = snap.on ? '#fff' : ''; bs.style.outline = (snapPanel.style.display === 'flex') ? '2px solid #15803d' : ''; }
}
pintarSnapPanel();
function toggleSnapPanel() { var abrir = (snapPanel.style.display === 'none' || !snapPanel.style.display); fecharPaineis(abrir ? snapPanel : null); snapPanel.style.display = abrir ? 'flex' : 'none'; pintarSnapPanel(); }
snapPanel.addEventListener('click', function (e) {
var b = e.target.closest('[data-s]'); if (!b) return; var kk = b.getAttribute('data-s');
if (kk === 'on') snap.on = !snap.on; else snap[kk] = !snap[kk];
if (!snap.on) esconderSnapMarca();
salvarSnap(); pintarSnapPanel();
});
var snapMarca = document.createElement('div');
snapMarca.style.cssText = 'position:absolute;z-index:5;display:none;pointer-events:none;width:0;height:0;overflow:visible';
snapMarca.innerHTML = '<div data-sm="ico" style="position:absolute;left:-8px;top:-8px;width:16px;height:16px;box-sizing:border-box;border:2px solid #22c55e"></div>' +
'<div data-sm="rot" style="position:absolute;top:11px;left:0;transform:translateX(-50%);white-space:nowrap;font-size:10px;font-weight:700;color:#15803d;background:rgba(15,39,64,.8);border-radius:5px;padding:1px 6px;text-align:center"></div>' +
'<div data-sm="dist" style="position:absolute;top:25px;left:0;transform:translateX(-50%);white-space:nowrap;display:none;font-size:11px;font-weight:800;color:#fff;background:rgba(15,39,64,.88);border-radius:6px;padding:1px 7px"></div>';
host.appendChild(snapMarca);
S.snapMarca = snapMarca;
var SNAP_VIS = { vertice: { cor: '#22c55e', borda: '0', rot: 'vértice' }, meio: { cor: '#f59e0b', borda: '50%', rot: 'meio' }, aresta: { cor: '#38bdf8', borda: '0', rot: 'aresta' }, intersecao: { cor: '#e879f9', borda: '0', rot: '✚ interseção' }, centro: { cor: '#facc15', borda: '50%', rot: '⊕ centro' } };
if (window.BimPrecisao) ['fim', 'perpendicular', 'extensao', 'proximo', 'grade'].forEach(function (k) { SNAP_VIS[k] = { cor: { fim: 'var(--verde)', perpendicular: 'var(--aco)', extensao: 'var(--amarelo)', proximo: 'var(--texto-fraco)', grade: 'var(--texto-fraco)' }[k], borda: '0', rot: BimPrecisao.ROTULO[k], svg: BimPrecisao.glifoSvg(k) }; });
if (window.BimPrecisao && BimPrecisao.TIPOS) BimPrecisao.TIPOS.forEach(function (k) { if (!SNAP_VIS[k]) SNAP_VIS[k] = { cor: 'var(--aco)', borda: '0', rot: BimPrecisao.ROTULO[k] || k, svg: BimPrecisao.glifoSvg(k) }; });
var snapVivo = null;
var NOTAVEL_MAX = 8;
var NOTAVEL_MIN_SEP = 9;
var notavelPool = [], notavelPts = [];
function notavelEl(i) {
var vivo = (S && S.host) || host;
if (notavelPool[i]) {
if (notavelPool[i].parentNode !== vivo) vivo.appendChild(notavelPool[i]);
return notavelPool[i];
}
var d = document.createElement('div');
d.setAttribute('data-bim', 'notavel');
d.style.cssText = 'position:absolute;z-index:3;display:none;pointer-events:none;width:11px;height:11px;transform:translate(-50%,-50%);opacity:.75';
vivo.appendChild(d); notavelPool[i] = d; return d;
}
function notaveisEsconder() { notavelPts = []; for (var i = 0; i < notavelPool.length; i++) notavelPool[i].style.display = 'none'; }
function notaveisDefinir(lista) {
notavelPts = [];
if (!lista || !lista.length || !snap.on) { notaveisEsconder(); return; }
var rc = canvasEl.getBoundingClientRect();
var ord = lista.slice().sort(function (a, b) { return a.d - b.d; }), aceitos = [];
for (var i = 0; i < ord.length && notavelPts.length < NOTAVEL_MAX; i++) {
var q = _snP.copy(ord[i].v).project(camera);
if (q.z > 1 || q.z < -1) continue;
var sx = (q.x + 1) / 2 * rc.width, sy = (1 - q.y) / 2 * rc.height;
var colado = false;
for (var ai = 0; ai < aceitos.length; ai++) {
var ddx = aceitos[ai][0] - sx, ddy = aceitos[ai][1] - sy;
if (ddx * ddx + ddy * ddy < NOTAVEL_MIN_SEP * NOTAVEL_MIN_SEP) { colado = true; break; }
}
if (colado) continue;
aceitos.push([sx, sy]); notavelPts.push(ord[i]);
}
posicionarNotaveis();
}
function posicionarNotaveis() {
var rc = canvasEl.getBoundingClientRect(), hr = ((S && S.host) || host).getBoundingClientRect(), i;
for (i = 0; i < notavelPool.length; i++) if (i >= notavelPts.length) notavelPool[i].style.display = 'none';
for (i = 0; i < notavelPts.length; i++) {
var el = notavelEl(i), n = notavelPts[i];
var q = _snP.copy(n.v).project(camera);
if (q.z > 1 || q.z < -1) { el.style.display = 'none'; continue; }
el.style.left = ((q.x + 1) / 2 * rc.width + (rc.left - hr.left)) + 'px';
el.style.top = ((1 - q.y) / 2 * rc.height + (rc.top - hr.top)) + 'px';
if (el._corBim !== n.tipo) {
var cor = (SNAP_VIS[n.tipo] || { cor: '#22c55e' }).cor;
el.style.background = 'linear-gradient(' + cor + ',' + cor + ') center/11px 1px no-repeat,'
+ 'linear-gradient(' + cor + ',' + cor + ') center/1px 11px no-repeat';
el._corBim = n.tipo;
}
el.style.display = 'block';
}
}
function posicionarSnapMarca() {
if (notavelPts.length) posicionarNotaveis();
if (!snapVivo) return;
var rc = canvasEl.getBoundingClientRect(), hr = ((S && S.host) || host).getBoundingClientRect();
var q = snapVivo.p.clone().project(camera);
if (q.z > 1 || q.z < -1) { snapMarca.style.display = 'none'; return; }
var x = (q.x + 1) / 2 * rc.width + (rc.left - hr.left), y = (1 - q.y) / 2 * rc.height + (rc.top - hr.top);
snapMarca.style.left = x + 'px'; snapMarca.style.top = y + 'px'; snapMarca.style.display = 'block';
var vg = SNAP_VIS[snapVivo.tipo];
if (snapVivo.tipo) guiasEm(x, y, vg ? vg.cor : '#22c55e');
else guiasEsconder();
}
S._tickExtra.push(function () { posicionarSnapMarca(); });
var destaqueSnap = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x38bdf8, depthTest: false, transparent: true, opacity: 0.95 }));
destaqueSnap.renderOrder = 999; destaqueSnap.visible = false; destaqueSnap.frustumCulled = false; scene.add(destaqueSnap);
var elastico = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x22c55e, depthTest: false, transparent: true, opacity: 0.85 }));
elastico.renderOrder = 996; elastico.visible = false; elastico.frustumCulled = false; scene.add(elastico);
function linhaEm(l, a, b) { var pa = l.geometry.attributes.position; pa.setXYZ(0, a.x, a.y, a.z); pa.setXYZ(1, b.x, b.y, b.z); pa.needsUpdate = true; l.geometry.computeBoundingSphere(); l.visible = true; }
function distElastico(a, b, eixoRot) {
var horizontal = !eixoRot && !!planta.on;
var d = horizontal ? Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z)) : a.distanceTo(b);
return fmtDist(d) + (eixoRot ? ' (' + eixoRot + ')' : horizontal ? ' (horizontal)' : '');
}
function atualizarElastico(p) {
var dv = snapMarca.querySelector('[data-sm="dist"]');
if (!p || !medir.on || medir.pts.length !== 1) { elastico.visible = false; dv.style.display = 'none'; return; }
var rr = restringir(medir.pts[0].p, p);
linhaEm(elastico, medir.pts[0].p, rr.p);
dv.textContent = distElastico(medir.pts[0].p, rr.p, rr.rot); dv.style.display = 'block';
}
var EIXOS = [{ k: 'livre', rot: 'Livre' }, { k: 'h', rot: 'Horizontal' }, { k: 'v', rot: 'Vertical' }, { k: 'aresta', rot: 'Ao longo da aresta' }];
medir.eixo = 'livre'; medir.dirAresta = null;
var _shift = false;
function dirDaAresta(sn) {
if (!sn || !sn.seg || (sn.tipo !== 'aresta' && sn.tipo !== 'meio')) return null;
var d = sn.seg[1].clone().sub(sn.seg[0]); return d.lengthSq() > 1e-10 ? d.normalize() : null;
}
function restringir(a, p) {
var eixo = _shift ? 'orto' : medir.eixo;
if (planta.on && eixo !== 'orto') return { p: p.clone(), rot: '' };
if (eixo === 'h') return { p: new THREE.Vector3(p.x, a.y, p.z), rot: 'horizontal' };
if (eixo === 'v' && !planta.on) return { p: new THREE.Vector3(a.x, p.y, a.z), rot: 'vertical' };
if (eixo === 'orto') {
var dx = Math.abs(p.x - a.x), dy = planta.on ? 0 : Math.abs(p.y - a.y), dz = Math.abs(p.z - a.z);
if (dy >= dx && dy >= dz) return { p: new THREE.Vector3(a.x, p.y, a.z), rot: 'vertical' };
if (dx >= dz) return { p: new THREE.Vector3(p.x, a.y, a.z), rot: 'eixo X' };
return { p: new THREE.Vector3(a.x, a.y, p.z), rot: 'eixo Z' };
}
if (eixo === 'aresta' && medir.dirAresta) { var k = p.clone().sub(a).dot(medir.dirAresta); return { p: a.clone().add(medir.dirAresta.clone().multiplyScalar(k)), rot: 'ao longo da aresta' }; }
return { p: p.clone(), rot: '' };
}
S._restringirTrena = restringir;
var eixoBar = document.createElement('div');
eixoBar.setAttribute('data-bim', 'eixo');
eixoBar.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);bottom:' + (opts.eixoBase != null ? opts.eixoBase : (opts.baseReservada || 0) + 14) + 'px;z-index:21;display:none;justify-content:center;width:max-content;max-width:calc(100% - 16px);box-sizing:border-box;gap:4px;padding:4px;border-radius:12px;background:rgba(11,26,43,.86);box-shadow:0 2px 10px rgba(0,0,0,.3);font:600 12px Inter,system-ui,sans-serif';
host.appendChild(eixoBar); S.eixoBar = eixoBar;
function pintarEixo() {
var vis = medir.on && !planta.on;
eixoBar.style.display = vis ? 'flex' : 'none';
if (!vis) return;
eixoBar.innerHTML = EIXOS.map(function (x) {
var on = medir.eixo === x.k;
return '<button type="button" data-eixo="' + x.k + '" style="border:0;border-radius:9px;padding:7px 11px;cursor:pointer;touch-action:manipulation;color:' + (on ? '#fff' : '#cbd8e6') + ';background:' + (on ? '#2563eb' : 'transparent') + '">' + x.rot + '</button>';
}).join('') + (ehToque() ? '' : '<span style="align-self:center;color:#7d93ab;font-size:11px;padding:0 6px">Shift: eixo mais perto</span>');
}
eixoBar.addEventListener('click', function (e) {
var b = e.target.closest ? e.target.closest('[data-eixo]') : null; if (!b) return;
e.stopPropagation();
medir.eixo = b.getAttribute('data-eixo'); pintarEixo();
if (_ultimaMira && _ultimaMira.sn && _ultimaMira.sn.p) atualizarElastico(_ultimaMira.sn.p);
});
S._pintarEixo = pintarEixo;
S._elasticoTexto = function () { var dv = snapMarca.querySelector('[data-sm="dist"]'); return dv.style.display === 'none' ? '' : dv.textContent; };
var _elUid = { n: -1, arr: null, mapa: {} };
function nomeDaPeca(obj) {
var ud = obj && obj.userData; if (!ud || ud.expressID == null) return '';
var els = S.elementos || [];
if (_elUid.arr !== els || _elUid.n !== els.length) { _elUid = { n: els.length, arr: els, mapa: {} }; for (var i = 0; i < els.length; i++) _elUid.mapa[els[i].uid] = els[i]; }
var el = _elUid.mapa[(ud.mid != null ? ud.mid : S.modelID) + ':' + ud.expressID];
var nm = String((el && (el.familia || el.nome || el.tipo)) || ud.tipo || '');
return nm.length > 30 ? nm.slice(0, 29) + '…' : nm;
}
function mostrarSnapMarca(sn) {
notaveisDefinir(sn && sn.notaveis);
if (sn && sn.p && sn.seg && (sn.tipo === 'aresta' || sn.tipo === 'meio')) { linhaEm(destaqueSnap, sn.seg[0], sn.seg[1]); destaqueSnap.material.color.set((SNAP_VIS[sn.tipo] || SNAP_VIS.aresta).cor); }
else destaqueSnap.visible = false;
atualizarElastico(sn && sn.p);
if (!sn || !sn.tipo) {
snapVivo = null; guiasEsconder();
if (sn && sn.pesado && snap.on) {
var icoP = snapMarca.querySelector('[data-sm="ico"]');
icoP.innerHTML = ''; icoP.style.borderWidth = ''; icoP.style.borderColor = '#94a3b8'; icoP.style.borderRadius = '50%'; icoP.style.transform = '';
var rotP = snapMarca.querySelector('[data-sm="rot"]');
rotP.textContent = 'sem snap (peça pesada)'; rotP.style.color = '#94a3b8';
snapVivo = { p: sn.p.clone(), tipo: null };
posicionarSnapMarca();
return;
}
if (sn && sn.p && snap.on) {
var icoS = snapMarca.querySelector('[data-sm="ico"]');
icoS.innerHTML = ''; icoS.style.borderWidth = ''; icoS.style.borderColor = '#cbd5e1'; icoS.style.borderRadius = '50%'; icoS.style.transform = 'scale(.6)';
var rotS = snapMarca.querySelector('[data-sm="rot"]'), nmS = nomeDaPeca(sn.obj);
rotS.textContent = sn.mapa && window.BimTrenaMapa ? ('sobre o mapa · ' + window.BimTrenaMapa.nome(sn.mapa)) : ('superfície' + (nmS ? ' · ' + nmS : '')); rotS.style.color = sn.mapa ? '#7dd3fc' : '#cbd5e1';
snapVivo = { p: sn.p.clone(), tipo: null };
posicionarSnapMarca();
return;
}
snapMarca.style.display = 'none';
return;
}
var vis = SNAP_VIS[sn.tipo], ico = snapMarca.querySelector('[data-sm="ico"]');
var glifo = (sn.editor && window.BimPrecisao) ? BimPrecisao.glifoSvg(sn.tipo) : (vis.svg || '');
ico.innerHTML = glifo; ico.style.borderWidth = glifo ? '0' : ''; ico.style.color = glifo ? (sn.editor ? sn.cor || vis.cor : vis.cor) : '';
ico.style.borderColor = vis.cor; ico.style.borderRadius = vis.borda;
ico.style.transform = (!glifo && (sn.tipo === 'aresta' || sn.tipo === 'intersecao')) ? 'rotate(45deg)' : '';
var nmP = nomeDaPeca(sn.obj);
snapMarca.querySelector('[data-sm="rot"]').textContent = vis.rot + (nmP ? ' · ' + nmP : '');
snapMarca.querySelector('[data-sm="rot"]').style.color = glifo ? (sn.cor || vis.cor) : vis.cor;
if (sn.editor && window.BimPrecisao) snapMarca.querySelector('[data-sm="rot"]').textContent = (BimPrecisao.ROTULO[sn.tipo] || vis.rot) + (sn.extra ? ' · ' + sn.extra : '');
snapVivo = { p: sn.p.clone(), tipo: sn.tipo };
posicionarSnapMarca();
}
function esconderSnapMarca() { snapVivo = null; snapMarca.style.display = 'none'; guiasEsconder(); notaveisEsconder(); destaqueSnap.visible = false; atualizarElastico(null); }
var guiaH = document.createElement('div'), guiaV = document.createElement('div');
guiaH.setAttribute('data-bim', 'guia-h');
guiaH.style.cssText = 'position:absolute;left:0;right:0;height:0;border-top:1px dashed rgba(34,197,94,.55);z-index:4;display:none;pointer-events:none';
guiaV.setAttribute('data-bim', 'guia-v');
guiaV.style.cssText = 'position:absolute;top:0;bottom:0;width:0;border-left:1px dashed rgba(34,197,94,.55);z-index:4;display:none;pointer-events:none';
host.appendChild(guiaH); host.appendChild(guiaV);
S.guiaH = guiaH; S.guiaV = guiaV;
function guiasEsconder() { guiaH.style.display = 'none'; guiaV.style.display = 'none'; }
function guiasEm(x, y, cor) {
guiaH.style.borderTopColor = cor; guiaV.style.borderLeftColor = cor;
guiaH.style.top = y + 'px'; guiaV.style.left = x + 'px';
guiaH.style.display = 'block'; guiaV.style.display = 'block';
}
var LUPA_Z = 3.0, LUPA_D = 132, LUPA_ESPERA = 350;
var lupa = { on: false, x: 0, y: 0, timer: null, id: null, sn: null };
S.lupa = lupa;
var lupaEl = document.createElement('div');
lupaEl.setAttribute('data-bim', 'lupa');
lupaEl.style.cssText = 'position:absolute;z-index:9;display:none;pointer-events:none;width:' + LUPA_D + 'px;height:' + LUPA_D + 'px;' +
'border-radius:50%;overflow:hidden;border:3px solid rgba(34,197,94,.95);box-shadow:0 6px 22px rgba(0,0,0,.45);transform:translate(-50%,-50%);background:#ffffff';
var lupaCv = document.createElement('canvas');
lupaCv.width = LUPA_D; lupaCv.height = LUPA_D;
lupaCv.style.cssText = 'width:100%;height:100%;display:block';
lupaEl.appendChild(lupaCv);
host.appendChild(lupaEl);
S.lupaEl = lupaEl;
var lupaCtx = lupaCv.getContext('2d');
function lupaDesenhar() {
if (!lupa.on || !lupaCtx) return;
var rc = canvasEl.getBoundingClientRect();
var dpr = (canvasEl.width / Math.max(1, rc.width)) || 1;
var cx = (lupa.x - rc.left) * dpr, cy = (lupa.y - rc.top) * dpr;
var lado = (LUPA_D / LUPA_Z) * dpr;
lupaCtx.clearRect(0, 0, LUPA_D, LUPA_D);
try {
lupaCtx.drawImage(cvDesenho(), cx - lado / 2, cy - lado / 2, lado, lado, 0, 0, LUPA_D, LUPA_D);
} catch (e) { return; }
var m = LUPA_D / 2;
lupaCtx.strokeStyle = 'rgba(255,255,255,.85)'; lupaCtx.lineWidth = 1;
lupaCtx.beginPath();
lupaCtx.moveTo(m - 16, m); lupaCtx.lineTo(m - 4, m);
lupaCtx.moveTo(m + 4, m); lupaCtx.lineTo(m + 16, m);
lupaCtx.moveTo(m, m - 16); lupaCtx.lineTo(m, m - 4);
lupaCtx.moveTo(m, m + 4); lupaCtx.lineTo(m, m + 16);
lupaCtx.stroke();
if (lupa.sn && lupa.sn.tipo) {
var vis = SNAP_VIS[lupa.sn.tipo] || { cor: '#22c55e', rot: '' };
var q = lupa.sn.p.clone().project(camera);
var sx = (q.x + 1) / 2 * rc.width + rc.left, sy = (1 - q.y) / 2 * rc.height + rc.top;
var lx = m + (sx - lupa.x) * LUPA_Z, ly = m + (sy - lupa.y) * LUPA_Z;
lupaCtx.strokeStyle = vis.cor; lupaCtx.lineWidth = 2;
if (lupa.sn.tipo === 'meio') { lupaCtx.beginPath(); lupaCtx.arc(lx, ly, 7, 0, 6.284); lupaCtx.stroke(); }
else { lupaCtx.strokeRect(lx - 6, ly - 6, 12, 12); }
lupaCtx.fillStyle = vis.cor; lupaCtx.font = 'bold 11px Arial'; lupaCtx.textAlign = 'center';
lupaCtx.fillText(vis.rot, m, LUPA_D - 9);
}
}
S._tickPos.push(function () { lupaDesenhar(); });
function lupaPosicionar() {
var hr = ((S && S.host) || host).getBoundingClientRect();
var offset = LUPA_D * 0.78;
var y = lupa.y - hr.top - offset;
if (y - LUPA_D / 2 < 4) y = lupa.y - hr.top + offset;
lupaEl.style.left = (lupa.x - hr.left) + 'px';
lupaEl.style.top = y + 'px';
}
function lupaAtualizarSnap() {
var sn = mirarEm(lupa.x, lupa.y, raioToque({ pointerType: 'touch' }));
if (!sn || !sn.p) { lupa.sn = null; esconderSnapMarca(); return; }
lupa.sn = { p: sn.p.clone(), tipo: sn.tipo || null };
mostrarSnapMarca(sn);
}
function lupaAbrir(x, y, pid) {
lupa.on = true; lupa.x = x; lupa.y = y; lupa.id = pid;
lupaEl.style.display = 'block';
if (orbit) orbit.enabled = false;
lupaPosicionar(); lupaAtualizarSnap();
S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '') + ' Arraste para ajustar a mira. Solte para marcar o ponto.');
}
function lupaFechar(semDica) {
if (!lupa.on) return;
lupa.on = false; lupa.id = null; lupa.sn = null;
lupaEl.style.display = 'none';
if (orbit) orbit.enabled = !trava.on;
if (!semDica && S._hint) S._hint('');
}
S._lupaFechar = lupaFechar;
S._ferramentaClique = ferramentaClique;
function lupaCancelarEspera() { if (lupa.timer) { clearTimeout(lupa.timer); lupa.timer = null; } }
S._lupaAgendar = function (e) {
lupaCancelarEspera();
var x = e.clientX, y = e.clientY, pid = e.pointerId;
lupa.timer = setTimeout(function () {
lupa.timer = null;
if (!S || !S.alive || !ferramentaClique()) return;
if (!medir.down) return;
lupaAbrir(x, y, pid);
}, LUPA_ESPERA);
};
var _lupaSnapT = 0;
S._lupaMover = function (e) {
if (lupa.on) {
if (lupa.id != null && e.pointerId !== lupa.id) return;
lupa.x = e.clientX; lupa.y = e.clientY;
lupaPosicionar();
var _tl = performance.now();
if (_tl - _lupaSnapT >= 60) { _lupaSnapT = _tl; lupaAtualizarSnap(); }
e.preventDefault();
return true;
}
if (lupa.timer && medir.down) {
var dx = e.clientX - medir.down.x, dy = e.clientY - medir.down.y;
if (dx * dx + dy * dy > 144) lupaCancelarEspera();
}
return false;
};
S._lupaSoltar = function (e) {
lupaCancelarEspera();
if (!lupa.on) return null;
if (lupa.id != null && e && e.pointerId !== lupa.id) return null;
var alvo = { x: lupa.x, y: lupa.y, sn: lupa.sn };
lupaFechar(true);
return alvo;
};
var arestasCache = new WeakMap();
var arestasConteudo = new Map();
function chaveConteudo(geo) {
var pa = geo.attributes && geo.attributes.position; if (!pa || !pa.array || !pa.array.buffer) return null;
var a = pa.array, v = a.BYTES_PER_ELEMENT === 4 ? new Int32Array(a.buffer, a.byteOffset, a.length) : null; if (!v) return null;
var h1 = 0x811c9dc5, h2 = 0x9e3779b9, i, ix = geo.index ? geo.index.array : null;
for (i = 0; i < v.length; i++) { h1 = Math.imul(h1 ^ v[i], 0x01000193); h2 = Math.imul(h2 + v[i], 0x85ebca6b) ^ (h2 >>> 13); }
if (ix) for (i = 0; i < ix.length; i++) { h1 = Math.imul(h1 ^ ix[i], 0x01000193); h2 = Math.imul(h2 + ix[i], 0x85ebca6b) ^ (h2 >>> 13); }
return v.length + ":" + (ix ? ix.length : -1) + ":" + (h1 >>> 0).toString(36) + ":" + (h2 >>> 0).toString(36);
}
function arestasDe(geo) {
var c = arestasCache.get(geo);
if (!c) {
var k = null; try { k = chaveConteudo(geo); } catch (_) { k = null; }
c = k ? arestasConteudo.get(k) : null;
if (!c) {
try { var e = new THREE.EdgesGeometry(geo, 25); c = e.attributes.position.array.slice(); e.dispose(); } catch (_) { c = new Float32Array(0); }
if (k) { arestasConteudo.set(k, c); if (arestasConteudo.size > 6000) { var it = arestasConteudo.keys(); for (var n = 0; n < 1000; n++) arestasConteudo.delete(it.next().value); } }
}
arestasCache.set(geo, c);
}
return c;
}
S._arestasDe = arestasDe;
var centrosCache = new WeakMap();
var CENTRO_MIN_VERT = 6;
var CENTRO_MAX = 64;
var CENTRO_MAX_ARESTAS = 12000;
var CENTRO_MAX_NOS = 6000;
var CENTRO_MAX_VOLTA = 160;
var CENTRO_ORCAMENTO = 15000;
function centrosDe(geo) {
var c = centrosCache.get(geo);
if (c) return c;
c = [];
try {
var np = (geo.attributes && geo.attributes.position) ? geo.attributes.position.count : 0;
if (np <= SNAP_MAX_VERT) c = _acharAneis(arestasDe(geo));
} catch (_) { c = []; }
centrosCache.set(geo, c);
return c;
}
function _aneiCentro(nos, laco) {
if (!laco || laco.length < CENTRO_MIN_VERT) return null;
var cx = 0, cy = 0, cz = 0, j;
for (j = 0; j < laco.length; j++) { var pj = nos[laco[j]]; cx += pj.x; cy += pj.y; cz += pj.z; }
cx /= laco.length; cy /= laco.length; cz /= laco.length;
var p0 = nos[laco[0]], p1 = nos[laco[Math.floor(laco.length / 3)]], p2 = nos[laco[Math.floor(2 * laco.length / 3)]];
var ax = p1.x - p0.x, ay = p1.y - p0.y, az = p1.z - p0.z;
var bx = p2.x - p0.x, by = p2.y - p0.y, bz = p2.z - p0.z;
var nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
var mn = Math.sqrt(nx * nx + ny * ny + nz * nz);
if (!mn) return null;
nx /= mn; ny /= mn; nz /= mn;
var raioMed = 0, raios = [];
for (j = 0; j < laco.length; j++) {
var q = nos[laco[j]];
if (Math.abs((q.x - cx) * nx + (q.y - cy) * ny + (q.z - cz) * nz) > 0.004) return null;
var r = Math.sqrt((q.x - cx) * (q.x - cx) + (q.y - cy) * (q.y - cy) + (q.z - cz) * (q.z - cz));
raios.push(r); raioMed += r;
}
raioMed /= laco.length;
if (raioMed < 0.002) return null;
var desvio = 0;
for (j = 0; j < raios.length; j++) desvio = Math.max(desvio, Math.abs(raios[j] - raioMed));
if (desvio / raioMed > 0.25) return null;
return { x: cx, y: cy, z: cz };
}
function _andarLaco(nos, ini, primeiro, vistos, orc) {
var laco = [ini, primeiro], noLaco = {}, ant = ini, atual = primeiro, fechou = false, k;
if (vistos[primeiro]) return null;
noLaco[ini] = 1; noLaco[primeiro] = 1;
for (k = 0; k < CENTRO_MAX_VOLTA; k++) {
if (orc && --orc.passos < 0) return null;
var n = nos[atual], prox = null, melhorCos = -2;
for (var vi = 0; vi < n.viz.length; vi++) {
var cand = n.viz[vi];
if (cand === ant) continue;
if (cand === ini && laco.length >= CENTRO_MIN_VERT) { fechou = true; break; }
if (vistos[cand] || noLaco[cand]) continue;
var a = nos[ant], b = n, cc = nos[cand];
var u1 = b.x - a.x, u2 = b.y - a.y, u3 = b.z - a.z;
var v1 = cc.x - b.x, v2 = cc.y - b.y, v3 = cc.z - b.z;
var mu = Math.sqrt(u1 * u1 + u2 * u2 + u3 * u3), mv = Math.sqrt(v1 * v1 + v2 * v2 + v3 * v3);
var cos = (mu && mv) ? (u1 * v1 + u2 * v2 + u3 * v3) / (mu * mv) : -2;
if (cos > melhorCos) { melhorCos = cos; prox = cand; }
}
if (fechou) return laco;
if (!prox) return null;
laco.push(prox); noLaco[prox] = 1; ant = atual; atual = prox;
}
return null;
}
function _acharAneis(arr) {
if (!arr || arr.length < CENTRO_MIN_VERT * 6) return [];
if (arr.length / 6 > CENTRO_MAX_ARESTAS) return [];
var nos = {}, ordem = [], i, k;
function chave(x, y, z) { return (Math.round(x * 1e4) / 1e4) + '|' + (Math.round(y * 1e4) / 1e4) + '|' + (Math.round(z * 1e4) / 1e4); }
function no(x, y, z) {
var ch = chave(x, y, z);
if (!nos[ch]) { nos[ch] = { x: x, y: y, z: z, viz: [] }; ordem.push(ch); }
return ch;
}
for (i = 0; i + 5 < arr.length; i += 6) {
var ca = no(arr[i], arr[i + 1], arr[i + 2]), cb = no(arr[i + 3], arr[i + 4], arr[i + 5]);
if (ca === cb) continue;
if (nos[ca].viz.indexOf(cb) < 0) nos[ca].viz.push(cb);
if (nos[cb].viz.indexOf(ca) < 0) nos[cb].viz.push(ca);
}
if (ordem.length > CENTRO_MAX_NOS) return [];
var vistos = {}, saida = [], orc = { passos: CENTRO_ORCAMENTO };
for (var oi = 0; oi < ordem.length && saida.length < CENTRO_MAX; oi++) {
if (orc.passos < 0) break;
var ini = ordem[oi];
if (vistos[ini] || nos[ini].viz.length < 2) continue;
var laco = null;
for (var si = 0; si < nos[ini].viz.length; si++) {
var tent = _andarLaco(nos, ini, nos[ini].viz[si], vistos, orc);
if (!tent || !_aneiCentro(nos, tent)) continue;
if (!laco || tent.length < laco.length) laco = tent;
}
if (!laco) { vistos[ini] = 1; continue; }
var ctr = _aneiCentro(nos, laco);
if (!ctr) continue;
for (var j = 0; j < laco.length; j++) vistos[laco[j]] = 1;
saida.push(new THREE.Vector3(ctr.x, ctr.y, ctr.z));
}
return saida;
}
S._acharAneis = _acharAneis;
var _snA = new THREE.Vector3(), _snB = new THREE.Vector3(), _snM = new THREE.Vector3(), _snCl = new THREE.Vector3(), _snP = new THREE.Vector3(), _snCt = new THREE.Vector3(), _snL = new THREE.Line3();
var SNAP_MAX_VERT = 90000;
var SNAP_PESO = { intersecao: 1.5, centro: 1.4, vertice: 1.35, meio: 1.15, aresta: 1.0 };
function snapFolga(raio) { return Math.max(6, raio * 0.25); }
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
function snapRaioPonto(raio) { return Math.round(raio * 0.7); }
var SNAP_PONTOS = { vertice: 1, meio: 1, intersecao: 1, centro: 1 };
var _snRc = new THREE.Raycaster(), _snRc2 = new THREE.Raycaster(), _snNdc = new THREE.Vector2(), _snRay = new THREE.Ray(), _snNaRay = new THREE.Vector3();
function snapVisivel(p, objs) {
if (!objs.length) return true;
_snRc2.layers.mask = ray.layers.mask;
var q = _snP.copy(p).project(camera);
_snRc2.setFromCamera(_snNdc.set(q.x, q.y), camera);
var L = _snRc2.ray.origin.distanceTo(p), tol = Math.max(0.01, L * 0.002);
_snRc2.far = L + tol;
var hs = _snRc2.intersectObjects(objs, false);
for (var i = 0; i < hs.length; i++) {
if (!cadeiaVisivel(hs[i].object) || foraDoClip(hs[i].point)) continue;
return hs[i].distance >= L - tol;
}
return true;
}
function aplicarSnap(hit, raioPx, cursor, extras) {
if (!snap.on || (!hit && !cursor)) return hit ? { p: hit.point, tipo: null } : null;
if (hit && (!hit.object || !hit.object.geometry)) return { p: hit.point, tipo: null };
var raio = raioPx || snap.raio, raioP = snapRaioPonto(raio), rc = canvasEl.getBoundingClientRect();
function px(v) { var q = _snP.copy(v).project(camera); return { x: (q.x + 1) / 2 * rc.width, y: (1 - q.y) / 2 * rc.height }; }
var alvoPx = cursor ? { x: cursor.x - rc.left, y: cursor.y - rc.top } : px(hit.point);
_snRc.setFromCamera(_snNdc.set(alvoPx.x / rc.width * 2 - 1, -(alvoPx.y / rc.height) * 2 + 1), camera);
_snRay.copy(_snRc.ray);
var pontos = [], arestas = [], notaveis = [], varridos = [];
function testar(v, tipo, obj, a, b) {
var p2 = px(v), dx = p2.x - alvoPx.x, dy = p2.y - alvoPx.y, d = Math.sqrt(dx * dx + dy * dy);
var ehPonto = !!SNAP_PONTOS[tipo];
if (d > raio) return;
if (foraDoClip(v)) return;
if (ehPonto && notaveis.length < 24) notaveis.push({ v: v.clone(), tipo: tipo, d: d });
if (ehPonto && d > raioP) return;
var c = { p: v.clone(), tipo: tipo, d: d, dEff: d / (SNAP_PESO[tipo] || 1), obj: obj, a: a ? a.clone() : null, b: b ? b.clone() : null };
if (ehPonto) pontos.push(c); else arestas.push(c);
}
var proximas = [], pulouPesado = false;
function varrerObjeto(obj) {
if (!obj || !obj.geometry || varridos.indexOf(obj) > -1) return;
var g = obj.geometry, np = (g.attributes && g.attributes.position) ? g.attributes.position.count : 0;
if (np > SNAP_MAX_VERT) { if (hit && obj === hit.object) pulouPesado = true; return; }
varridos.push(obj);
var arr = arestasDe(g); if (!arr.length) return;
var mw = obj.matrixWorld;
if (snap.c !== false) {
var ctr = centrosDe(g);
for (var ci = 0; ci < ctr.length; ci++) testar(_snCt.copy(ctr[ci]).applyMatrix4(mw), 'centro', obj);
}
for (var i = 0; i < arr.length; i += 6) {
_snA.set(arr[i], arr[i + 1], arr[i + 2]).applyMatrix4(mw);
_snB.set(arr[i + 3], arr[i + 4], arr[i + 5]).applyMatrix4(mw);
if (snap.v) { testar(_snA, 'vertice', obj); testar(_snB, 'vertice', obj); }
if (snap.m) { testar(_snM.addVectors(_snA, _snB).multiplyScalar(0.5), 'meio', obj, _snA, _snB); }
_snRay.distanceSqToSegment(_snA, _snB, _snNaRay, _snCl);
if (snap.a) testar(_snCl, 'aresta', obj, _snA, _snB);
if (snap.i !== false && proximas.length < 14) {
var pc = px(_snCl), ddx = pc.x - alvoPx.x, ddy = pc.y - alvoPx.y;
if (ddx * ddx + ddy * ddy <= (raio + 6) * (raio + 6)) proximas.push({ a: _snA.clone(), b: _snB.clone(), obj: obj });
}
}
}
if (hit) varrerObjeto(hit.object);
for (var oh = 1; oh < _ultimosHits.length; oh++) if (!hit || _ultimosHits[oh].object !== hit.object) varrerObjeto(_ultimosHits[oh].object);
if (extras) { var ate = performance.now() + SNAP_ORCAMENTO_MS; for (var ex = 0; ex < extras.length; ex++) { if (ex >= SNAP_MIN_PECAS && performance.now() > ate) break; varrerObjeto(extras[ex]); } }
if (snap.i !== false) {
for (var ii = 0; ii < proximas.length; ii++) for (var jj = ii + 1; jj < proximas.length; jj++) {
var r3 = segSeg3D(proximas[ii].a, proximas[ii].b, proximas[jj].a, proximas[jj].b);
if (r3.d < 0.01) testar(r3.p, 'intersecao', proximas[ii].obj);
}
}
var melhor = null, maisPerto = null, k;
for (k = 0; k < pontos.length; k++) {
if (!melhor || pontos[k].dEff < melhor.dEff) melhor = pontos[k];
if (!maisPerto || pontos[k].d < maisPerto.d) maisPerto = pontos[k];
}
if (melhor && maisPerto && melhor.tipo !== maisPerto.tipo && melhor.d > maisPerto.d + snapFolga(raioP)) melhor = maisPerto;
function semRepetir(lista, chaveD) {
var visto = {}, out = [];
for (var i = 0; i < lista.length; i++) {
var c = lista[i], kk = Math.round(c.p.x * 1000) + ',' + Math.round(c.p.y * 1000) + ',' + Math.round(c.p.z * 1000);
var ja = visto[kk];
if (ja === undefined) { visto[kk] = out.length; out.push(c); } else if (c[chaveD] < out[ja][chaveD]) out[ja] = c;
}
return out;
}
pontos = semRepetir(pontos, 'dEff'); arestas = semRepetir(arestas, 'd');
var fila = [];
if (melhor) fila.push(melhor);
pontos.sort(function (a, b) { return a.dEff - b.dEff; });
for (k = 0; k < pontos.length; k++) if (pontos[k].p.distanceToSquared(melhor.p) > 1e-12 || pontos[k].tipo !== melhor.tipo) fila.push(pontos[k]);
arestas.sort(function (a, b) { return a.d - b.d; });
for (k = 0; k < arestas.length; k++) fila.push(arestas[k]);
var venc = null, ateVis = performance.now() + SNAP_ORCAMENTO_MS;
for (k = 0; k < fila.length; k++) {
if (k >= SNAP_MIN_CHECAGENS && performance.now() > ateVis) break;
if (snapVisivel(fila[k].p, varridos)) { venc = fila[k]; break; }
}
return venc
? { p: venc.p, tipo: venc.tipo, notaveis: notaveis, pesado: pulouPesado, obj: venc.obj || null, seg: (venc.a && venc.b) ? [venc.a, venc.b] : null }
: { p: hit ? hit.point : null, tipo: null, notaveis: notaveis, pesado: pulouPesado, obj: hit ? hit.object : null, seg: null };
}
var PERTO_MAX = 5000, SNAP_ORCAMENTO_MS = 12;
var SNAP_MIN_PECAS = 60, SNAP_MIN_CHECAGENS = 150;
var _caixasTela = { chave: '', lista: [] }, _cxV = new THREE.Vector3(), _cxB = new THREE.Box3();
function chaveDaCena() {
var rc = canvasEl.getBoundingClientRect();
camera.updateMatrixWorld();
var ids = []; for (var ci = 0; ci < modelRoot.children.length; ci++) ids.push(modelRoot.children[ci].id);
return camera.matrixWorld.elements.join(',') + '|' + camera.projectionMatrix.elements.join(',') + '|' + Math.round(rc.width) + 'x' + Math.round(rc.height) + '|' + ids.join(',');
}
function caixasNaTela() {
var rc = canvasEl.getBoundingClientRect();
var chave = chaveDaCena();
if (_caixasTela.chave === chave) return _caixasTela.lista;
var lista = [];
modelRoot.updateMatrixWorld(true);
modelRoot.traverse(function (o) {
if (!o.isMesh || !o.geometry) return;
var g = o.geometry; if (!g.boundingBox) g.computeBoundingBox();
if (!g.boundingBox) return;
_cxB.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, atras = false;
for (var i = 0; i < 8; i++) {
_cxV.set(i & 1 ? _cxB.max.x : _cxB.min.x, i & 2 ? _cxB.max.y : _cxB.min.y, i & 4 ? _cxB.max.z : _cxB.min.z).project(camera);
if (_cxV.z > 1 || _cxV.z < -1) atras = true;
var sx = (_cxV.x + 1) / 2 * rc.width, sy = (1 - _cxV.y) / 2 * rc.height;
if (sx < x0) x0 = sx; if (sx > x1) x1 = sx; if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
}
lista.push({ o: o, x0: x0, y0: y0, x1: x1, y1: y1, atras: atras, perto: _cxB.distanceToPoint(camera.position) });
});
_caixasTela = { chave: chave, lista: lista };
return lista;
}
function pecasPerto(cx, cy, raio) {
var rc = canvasEl.getBoundingClientRect(), x = cx - rc.left, y = cy - rc.top, L = caixasNaTela(), sel = [];
for (var i = 0; i < L.length; i++) {
var c = L[i];
if (!c.atras && (x + raio < c.x0 || x - raio > c.x1 || y + raio < c.y0 || y - raio > c.y1)) continue;
if (!cadeiaVisivel(c.o)) continue;
sel.push(c);
}
sel.sort(function (a, b) { return a.perto - b.perto; });
var out = [];
for (var k = 0; k < sel.length && k < PERTO_MAX; k++) out.push(sel[k].o);
return out;
}
function mirarEm(cx, cy, raioPx) {
var hit = raycastEm(cx, cy), raio = raioPx || snap.raio;
var sn = aplicarSnap(hit, raio, { x: cx, y: cy }, snap.on ? pecasPerto(cx, cy, raio) : null);
if (!sn || (!sn.tipo && !hit && !sn.pesado)) sn = null;
if (!(sn && sn.tipo) && (medir.on || area.on || ang.on)) {
var hm = mapaHitEm(cx, cy);
if (hm && window.BimTrenaMapa.escolher(hit ? hit.distance : null, hm.distance) === 'mapa') sn = { p: hm.point.clone(), tipo: null, obj: null, mapa: hm.fonte };
}
_ultimaMira = { x: cx, y: cy, raio: raio, chave: chaveDaCena(), sn: sn };
return sn;
}
var _rayMapa = new THREE.Raycaster(); _rayMapa.layers.enableAll();
function mapaGrupos() { return [icG3G, icPlantaG, icLocalG].filter(function (g) { return g && g.visible !== false && g.children.length; }); }
function clipadoNoMaterial(mat, pt) {
var pl = mat && mat.clippingPlanes; if (!pl || !pl.length) return false;
var dentro = 0;
for (var i = 0; i < pl.length; i++) if (pl[i].distanceToPoint(pt) < 0) dentro++;
return mat.clipIntersection ? dentro === pl.length : dentro > 0;
}
function mapaHitEm(cx, cy) {
var B = (typeof window !== 'undefined') ? window.BimTrenaMapa : null; if (!B) return null;
var gs = mapaGrupos(); if (!gs.length) return null;
var rc = canvasEl.getBoundingClientRect();
_rayMapa.setFromCamera(new THREE.Vector2(((cx - rc.left) / rc.width) * 2 - 1, -((cy - rc.top) / rc.height) * 2 + 1), camera);
var hs = _rayMapa.intersectObjects(gs, true);
for (var i = 0; i < hs.length; i++) {
var h = hs[i], o = h.object;
if (!o.isMesh || o.isInstancedMesh) continue;
var vis = true, nomes = [];
for (var n = o; n; n = n.parent) { if (n.visible === false) { vis = false; break; } nomes.push(n.name || ''); if (n.parent === scene) break; }
if (!vis || foraDoClip(h.point)) continue;
var mt = Array.isArray(o.material) ? o.material[h.face && h.face.materialIndex || 0] : o.material;
if (!mt || mt.visible === false || clipadoNoMaterial(mt, h.point)) continue;
var f = B.fonteDe(nomes); if (!f) continue;
return { point: h.point.clone(), distance: h.distance, fonte: f, obj: o };
}
var yCh = icChao(), p0 = new THREE.Vector3(0, yCh, 0).applyMatrix4(modelRoot.matrixWorld), p1 = new THREE.Vector3(0, yCh + 1, 0).applyMatrix4(modelRoot.matrixWorld);
var plano = new THREE.Plane().setFromNormalAndCoplanarPoint(p1.clone().sub(p0).normalize(), p0), pt = new THREE.Vector3();
if (!_rayMapa.ray.intersectPlane(plano, pt) || foraDoClip(pt)) return null;
var d = pt.distanceTo(_rayMapa.ray.origin);
return d <= 2000 ? { point: pt, distance: d, fonte: 'chao', obj: null } : null;
}
S._mapaHitEm = mapaHitEm;
var _ultimaMira = null;
function mirarParaClique(cx, cy, raioPx) {
var m = _ultimaMira, raio = raioPx || snap.raio;
if (m && m.raio === raio && Math.abs(m.x - cx) <= 2 && Math.abs(m.y - cy) <= 2 && m.chave === chaveDaCena() &&
(!m.sn || ((!m.sn.obj || cadeiaVisivel(m.sn.obj)) && !(m.sn.p && foraDoClip(m.sn.p))))) return m.sn;
return mirarEm(cx, cy, raio);
}
S._snapLimites = function (ms, pecas, checagens) { var ant = [SNAP_ORCAMENTO_MS, SNAP_MIN_PECAS, SNAP_MIN_CHECAGENS]; if (ms != null) { SNAP_ORCAMENTO_MS = ms; SNAP_MIN_PECAS = pecas; SNAP_MIN_CHECAGENS = checagens; } return ant; };
S._ultimaMiraXY = function () { return _ultimaMira ? [_ultimaMira.x, _ultimaMira.y] : null; };
S._marcaAtual = function () { return snapVivo ? { p: [snapVivo.p.x, snapVivo.p.y, snapVivo.p.z], tipo: snapVivo.tipo } : null; };
S._mirarEm = mirarEm; S._centrosDe = centrosDe; S._pecasPerto = pecasPerto; S._destaqueSnap = destaqueSnap; S._raioCamadas = function () { return ray.layers.mask; };
function raioToque(e) { return (e && e.pointerType === 'touch') ? 30 : snap.raio; }
var ctec = { ativo: false, pts: [], objs: [] };
S._tickExtra.push(function () { for (var i = 0; i < ctec.objs.length; i++) rescaleObj(ctec.objs[i]); });
function ctecLimparDesenho() { ctec.objs.forEach(limparMarca); ctec.objs = []; ctec.pts = []; }
function ctecIniciar() {
if (!planta.on) { setPlanta(true); if (!planta.on) return; }
if (S.plantaCfg) S.plantaCfg.style.display = 'none';
if (edit && edit.on) setEdit(false);
ctecLimparDesenho(); ctec.ativo = true;
S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('nota', 15) : '') + ' Clique o 1º ponto da linha de corte (A) sobre a planta.');
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
if (ctec.pts.length === 1) { S._hint("" + (typeof Icones !== "undefined" ? Icones.get("nota", 15) : "") + " Agora clique o 2º ponto (A')."); return; }
var line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([ctec.pts[0], ctec.pts[1]]), new THREE.LineBasicMaterial({ color: 0x38bdf8, depthTest: false }));
line.renderOrder = 997; scene.add(line); ctec.objs.push(line);
ctec.ativo = false;
marcarFechamento();
ctecCfg.style.display = 'flex'; S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('nota', 15) : '') + ' Configure o corte e clique Gerar.');
}
var ctecCfg = document.createElement('div');
ctecCfg.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:6;display:none;flex-direction:column;gap:8px;background:var(--card-bg,#fff);border:1px solid var(--linha,#d3dce6);border-radius:12px;padding:14px 16px;color:var(--texto,#1a2b3c);font-size:12px;width:260px;box-shadow:0 12px 34px rgba(0,0,0,.5)';
ctecCfg.classList.add('bim-flut');
ctecCfg.innerHTML =
'<b>' + (typeof Icones !== 'undefined' ? Icones.get('nota', 15) : '') + ' Gerar corte técnico</b>' +
'<label style="display:flex;justify-content:space-between;align-items:center">Tipo de vista <select data-t="tipo" class="inp" style="width:130px"><option value="corte">Corte (A–A)</option><option value="fachada">Fachada/Elevação</option></select></label>' +
'<label style="display:flex;justify-content:space-between;align-items:center">Escala <select data-t="esc" class="inp" style="width:130px"><option value="50">1:50</option><option value="75">1:75</option><option value="100" selected>1:100</option><option value="200">1:200</option></select></label>' +
'<label style="display:flex;justify-content:space-between;align-items:center">Profundidade de visão <input data-t="prof" class="inp" type="number" min="0.5" step="0.5" value="10" style="width:70px"> m</label>' +
'<label style="display:flex;gap:6px;align-items:center;font-size:12px"><input data-t="inv" type="checkbox"> Olhar para o outro lado</label>' +
'<div style="font-size:11px;color:#b45309;line-height:1.35">' + (typeof Icones !== 'undefined' ? Icones.get('alerta', 15) : '') + ' Auxílio visual de coordenação, não substitui o projeto executivo. Faces cortadas saem <b>hachuradas</b>; superfícies curvas/tubos podem sair sem contorno. Confira sempre pela escala gráfica.</div>' +
'<div style="display:flex;gap:6px"><button class="btn sm primary" data-t="gerar" style="flex:1">Gerar</button><button class="btn sm" data-t="cancelar" style="flex:1">Cancelar</button></div>';
host.appendChild(ctecCfg);
S.ctecCfg = ctecCfg;
var ctecModal = document.createElement('div');
ctecModal.style.cssText = 'position:absolute;inset:0;z-index:7;display:none;align-items:center;justify-content:center;background:rgba(4,12,22,.82)';
ctecModal.innerHTML =
'<div style="display:flex;flex-direction:column;gap:9px;max-width:92%;max-height:92%;background:#ffffff;border:1px solid var(--linha,#d3dce6);border-radius:12px;padding:13px">' +
'<div style="display:flex;justify-content:space-between;align-items:center;color:var(--texto,#1a2b3c);font-size:13px"><b data-r="titulo">Corte técnico</b>' +
'<span><button class="btn sm" data-r="ajustar" title="Mudar escala/tipo/profundidade sem redesenhar a linha">🔧 Ajustar</button> <button class="btn sm" data-r="imprimir">' + (typeof Icones !== 'undefined' ? Icones.get('imprimir', 15) : '') + ' Imprimir</button> <button class="btn sm" data-r="baixar">' + (typeof Icones !== 'undefined' ? Icones.get('baixar', 15) : '') + ' PNG</button> <button class="btn sm" data-r="fechar">' + (typeof Icones !== 'undefined' ? Icones.get('fechar', 15) : '') + '</button></span></div>' +
'<div style="overflow:auto;background:#fff;border-radius:6px;text-align:center"><img data-r="img" style="max-width:100%;display:block;margin:0 auto"></div></div>';
host.appendChild(ctecModal);
S.ctecModal = ctecModal;
var SERIE_ESC = [50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 1250, 1500, 2000, 2500];
function gerarCorteTec(o) {
if (S._famLodTudo0) S._famLodTudo0();
var box = new THREE.Box3().setFromObject(modelRoot);
if (box.isEmpty()) return null;
var dx = o.bx - o.ax, dz = o.bz - o.az, L = Math.sqrt(dx * dx + dz * dz);
if (L < 0.05) return null;
var vx = dz / L, vz = -dx / L; if (o.inv) { vx = -vx; vz = -vz; }
var margem = Math.max(0.4, L * 0.03), yMin = box.min.y, yMax = box.max.y;
var wM = L + margem * 2, hM = (yMax - yMin) + margem * 2;
var escBase = o.escala || 100, PPM96 = 96 / 25.4;
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
var cx = (o.ax + o.bx) / 2, cz = (o.az + o.bz) / 2, cy = (yMin + yMax) / 2;
var diag = box.getSize(new THREE.Vector3()).length();
var recuo = (o.tipo === 'fachada') ? diag : 0.02;
var secPlane = (o.tipo === 'fachada') ? null : new THREE.Plane(new THREE.Vector3(vx, 0, vz), -(vx * cx + vz * cz));
var cam = new THREE.OrthographicCamera(-wM / 2, wM / 2, hM / 2, -hM / 2, 0.01, recuo + ((o.tipo === 'fachada') ? diag * 2 : Math.max(0.5, +o.prof || 10)));
cam.position.set(cx - vx * recuo, cy, cz - vz * recuo);
cam.up.set(0, 1, 0); cam.lookAt(cx, cy, cz); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
var prevClip = renderer.clippingPlanes, prevLocal = renderer.localClippingEnabled;
var prevClear = renderer.getClearColor(new THREE.Color()).clone(), prevAlpha = renderer.getClearAlpha();
var prevTone = renderer.toneMapping, prevAuto = renderer.autoClear;
var rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true, stencilBuffer: true }), buf = null, edgesRoot = null, matMassa = null, matLinha = null, escondidos = [];
var stBack = null, stFront = null, capMat = null, capGeo = null, hatchTex = null;
try {
renderer.clippingPlanes = secPlane ? [secPlane] : []; renderer.localClippingEnabled = false;
renderer.toneMapping = THREE.NoToneMapping;
scene.children.forEach(function (c) { if (c !== modelRoot && c.visible !== false) { escondidos.push(c); c.visible = false; } });
matMassa = new THREE.MeshBasicMaterial({ color: luzNum(0xededed), polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
scene.overrideMaterial = matMassa;
renderer.setRenderTarget(rt); renderer.setClearColor(0xffffff, 1); renderer.clear();
renderer.render(scene, cam);
scene.overrideMaterial = null;
if (secPlane) {
renderer.autoClear = false;
var camSt = cam.clone(); camSt.far = recuo + diag * 2 + 1; camSt.updateProjectionMatrix();
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
var esp = 0.0028 * escalaEf;
hatchTex.repeat.set(wM / esp, hM / esp);
capMat = new THREE.MeshBasicMaterial({ map: hatchTex, depthTest: true, depthFunc: THREE.AlwaysDepth, depthWrite: true, side: THREE.DoubleSide,
stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.ZeroStencilOp, stencilZFail: THREE.ZeroStencilOp, stencilZPass: THREE.ZeroStencilOp });
capGeo = new THREE.PlaneGeometry(wM, hM);
var capQuad = new THREE.Mesh(capGeo, capMat);
capQuad.position.set(cx + vx * 1e-3, cy, cz + vz * 1e-3);
capQuad.lookAt(cx + vx * 2, cy, cz + vz * 2);
var capScene = new THREE.Scene(); capScene.add(capQuad);
renderer.render(capScene, camSt);
}
edgesRoot = new THREE.Group(); matLinha = new THREE.LineBasicMaterial({ color: luzNum(0x111111) });
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
var faixa = 46, cnv = document.createElement('canvas'); cnv.width = W; cnv.height = H + faixa;
var g2 = cnv.getContext('2d'), img = g2.createImageData(W, H);
for (var y = 0; y < H; y++) { var srcY = (H - 1 - y) * W * 4; img.data.set(buf.subarray(srcY, srcY + W * 4), y * W * 4); }
g2.putImageData(img, 0, 0);
g2.fillStyle = '#fff'; g2.fillRect(0, H, W, faixa);
g2.strokeStyle = '#111'; g2.lineWidth = 2; g2.strokeRect(1, 1, W - 2, H + faixa - 2); g2.beginPath(); g2.moveTo(1, H); g2.lineTo(W - 1, H); g2.stroke();
g2.fillStyle = '#111'; var temBarra = pxM >= 8 && pxM < W * 0.45, barW = temBarra ? pxM + 26 : 0;
if (temBarra) { g2.fillRect(W - pxM - 12, H + 16, pxM, 6); g2.font = '10px Arial'; g2.fillText('1 m', W - pxM - 12, H + 37); }
var titulo = (o.tipo === 'fachada' ? 'FACHADA' : 'CORTE A–A') + '  ·  ESC 1:' + escalaEf + (ajustada ? ' (ajustada)' : '') + '  ·  ' + (((typeof Empresa!=='undefined'&&Empresa.nomeDoc&&Empresa.nomeDoc())||'') || 'Desenho técnico') + ((typeof Empresa!=='undefined'&&Empresa.creditoTexto&&Empresa.creditoTexto())?' · OrçaPRO BIM':'') + '  ·  ' + new Date().toLocaleDateString('pt-BR');
var livre = W - 16 - barW, fs = 15;
g2.font = 'bold ' + fs + 'px Arial';
while (fs > 8 && g2.measureText(titulo).width > livre) { fs--; g2.font = 'bold ' + fs + 'px Arial'; }
if (g2.measureText(titulo).width > livre) { titulo = 'ESC 1:' + escalaEf + (ajustada ? ' (aj.)' : ''); g2.font = 'bold 11px Arial'; }
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
if (!res) { ctecIniciar(); S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('nota', 15) : '') + ' Linha muito curta — clique o 1º ponto da linha de corte (A) de novo.'); return; }
ctecModal._ajustar = null; ctecModal._nomeArq = null;
ctecModal._res = res;
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
if (ctecModal._ajustar) { ctecModal._ajustar(); S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('nota', 15) : '') + ' Ajuste e clique Gerar.'); }
else { ctecCfg.style.display = 'flex'; S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('nota', 15) : '') + ' Ajuste e clique Gerar (a linha A–A foi mantida).'); }
}
else if (k === 'baixar') { var aEl = document.createElement('a'); aEl.href = url; aEl.download = ctecModal._nomeArq || 'corte-tecnico.png'; aEl.click(); }
else if (k === 'imprimir') {
var w = null; try { w = window.open('', '_blank'); } catch (_) {}
if (!w) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('imprimir', 15) : '') + ' O navegador bloqueou a janela de impressão — use ' + (typeof Icones !== 'undefined' ? Icones.get('baixar', 15) : '') + ' PNG e imprima o arquivo em 100%.'); return; }
try {
var ttlImp = esc((ctecModal.querySelector('[data-r="titulo"]').textContent || 'Desenho técnico')) + ((typeof Empresa!=='undefined'&&Empresa.creditoTexto&&Empresa.creditoTexto())?' — OrçaPRO BIM':'');
w.document.write('<!doctype html><meta charset="utf-8"><title>' + ttlImp + '</title>' +
'<style>@page{size:auto;margin:8mm}body{margin:0;font-family:Arial}.av{font-size:12px;color:#444;margin:6px 2px}@media print{.av{display:none}}</style>' +
'<p class="av">Imprima em <b>100%</b> (sem “ajustar à página”) para a escala do carimbo valer. A escala gráfica de 1 m serve de conferência.</p>' +
'<img src="' + url + '" style="width:' + (res.larguraMM || 200).toFixed(1) + 'mm;height:' + (res.alturaMM || 150).toFixed(1) + 'mm;display:block" onload="setTimeout(function(){window.print()},300)">');
w.document.close();
} catch (_) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('imprimir', 15) : '') + ' Não deu pra abrir a impressão — use ' + (typeof Icones !== 'undefined' ? Icones.get('baixar', 15) : '') + ' PNG.'); }
}
});
var estiloD = { on: false, mat: null, matLinha: null };
S._estiloOn = function () { return !!estiloD.on; };
function nVerts(geo) { return (geo && geo.attributes && geo.attributes.position) ? geo.attributes.position.count : 0; }
function setEstiloDesenho(on, silencioso) {
if (on && S._limparRaioX) S._limparRaioX();
estiloD.on = !!on;
var bt = cortePanel.querySelector('[data-c="estilo"]');
var h2 = (S && S.host) || host;
if (on) {
if (!estiloD.mat) estiloD.mat = new THREE.MeshBasicMaterial({ color: 0xe9e9e9, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
if (!estiloD.matLinha) estiloD.matLinha = new THREE.LineBasicMaterial({ color: 0x111111 });
todasMalhas(function (m) {
if (!m.geometry) return;
if (!('_matAntesEstilo' in m.userData)) {
if (m === S.selected) m.userData._matAntesEstilo = S.prevMat || m.material;
else m.userData._matAntesEstilo = m.material;
}
if (m === S.selected) S.prevMat = estiloD.mat;
else if (m.material !== estiloD.mat) m.material = estiloD.mat;
if (!m.userData._edgeLn && nVerts(m.geometry) <= SNAP_MAX_VERT) {
var arr = arestasDe(m.geometry);
if (arr.length) {
var bge = new THREE.BufferGeometry(); bge.setAttribute('position', new THREE.BufferAttribute(arr, 3));
var ln = new THREE.LineSegments(bge, estiloD.matLinha);
ln.raycast = function () {};
m.add(ln); m.userData._edgeLn = ln;
}
}
if (m.userData._edgeLn) m.userData._edgeLn.visible = true;
});
h2.style.background = '#fff';
_chao.visible = false;
if (bt) bt.style.outline = '2px solid ' + corAtiva();
if (!silencioso) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('editar', 15) : '') + ' Estilo desenho: massas + arestas no fundo branco (as cores voltam ao sair).');
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
if (S._aplicarTema) S._aplicarTema();
}
}
S._setEstiloDesenho = setEstiloDesenho;
S._reaplicarEstilo = function () { if (estiloD.on) setEstiloDesenho(true, true); };
S._edgesEstilo = function (mostrar) { if (!estiloD.on) return; todasMalhas(function (m) { if (m.userData._edgeLn) m.userData._edgeLn.visible = !!mostrar; }); };
var plantaCfg = document.createElement('div');
plantaCfg.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:6;display:none;flex-direction:column;gap:8px;background:var(--card-bg,#fff);border:1px solid var(--linha,#d3dce6);border-radius:12px;padding:14px 16px;color:var(--texto,#1a2b3c);font-size:12px;width:270px;box-shadow:0 12px 34px rgba(0,0,0,.5)';
plantaCfg.classList.add('bim-flut');
plantaCfg.innerHTML =
'<b>' + (typeof Icones !== 'undefined' ? Icones.get('nota', 15) : '') + ' Planta baixa técnica</b>' +
'<label style="display:flex;justify-content:space-between;align-items:center">Escala <select data-q="esc" class="inp" style="width:130px"><option value="50" selected>1:50</option><option value="75">1:75</option><option value="100">1:100</option><option value="200">1:200</option></select></label>' +
'<label style="display:flex;gap:6px;align-items:center"><input data-q="cotas" type="checkbox" checked> Cotas automáticas nas paredes</label>' +
'<label style="display:flex;justify-content:space-between;align-items:center">Profundidade abaixo do corte <input data-q="prof" class="inp" type="number" min="0.5" step="0.5" value="3" style="width:64px"> m</label>' +
'<div style="font-size:11px;color:#b45309;line-height:1.35">' + (typeof Icones !== 'undefined' ? Icones.get('alerta', 15) : '') + ' Cotas externas: uma cadeia por lado, só com os cantos e as paredes internas que encostam na fachada, mais o total. Cotas internas: largura e profundidade de cada ambiente retangular. Parede fora de esquadro fica sem cota automática (declarada no desenho) — use a ' + (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '') + ' trena.</div>' +
'<div style="display:flex;gap:6px"><button class="btn sm primary" data-q="gerar" style="flex:1">Gerar</button><button class="btn sm" data-q="cancelar" style="flex:1">Cancelar</button></div>';
host.appendChild(plantaCfg);
S.plantaCfg = plantaCfg;
function desenharCotas(g2, cad, geo, int) {
var mmpx = 96 / 25.4;
function mm(v) { return Math.round(v * mmpx); }
function px(x) { return geo.padL + (x - geo.x0) * geo.pxM; }
function py(z) { return (z - geo.z0) * geo.pxM; }
function ponto(x, y, r) { g2.beginPath(); g2.arc(x, y, r || 2.4, 0, Math.PI * 2); g2.fill(); }
g2.lineWidth = 1;
function cadH(c, borda, sinal) {
var y1 = borda + sinal * mm(12), y2 = y1 + sinal * mm(8);
if (c.segs.length === 1) y2 = y1;
g2.strokeStyle = '#888';
c.ticks.forEach(function (t) { g2.beginPath(); g2.moveTo(px(t), borda + sinal * 2); g2.lineTo(px(t), y2 + sinal * mm(1.5)); g2.stroke(); });
g2.strokeStyle = '#111'; g2.fillStyle = '#111';
g2.beginPath(); g2.moveTo(px(c.total.a) - 6, y1); g2.lineTo(px(c.total.b) + 6, y1); g2.stroke();
c.ticks.forEach(function (t) { ponto(px(t), y1); });
if (c.segs.length > 1) c.segs.forEach(function (s) {
var w = px(s.b) - px(s.a), t = BimPlanta.fmtM(s.v);
g2.font = '10px Arial'; var tw = g2.measureText(t).width;
if (tw > w - 4) { g2.font = '8px Arial'; tw = g2.measureText(t).width; if (tw > w - 2) return; }
g2.fillText(t, (px(s.a) + px(s.b)) / 2 - tw / 2, y1 - 3);
});
g2.beginPath(); g2.moveTo(px(c.total.a) - 6, y2); g2.lineTo(px(c.total.b) + 6, y2); g2.stroke();
ponto(px(c.total.a), y2); ponto(px(c.total.b), y2);
g2.font = 'bold 11px Arial'; var tt = BimPlanta.fmtM(c.total.v), ttw = g2.measureText(tt).width;
g2.fillText(tt, (px(c.total.a) + px(c.total.b)) / 2 - ttw / 2, y2 - 3);
}
function cadV(c, borda, sinal) {
var x1 = borda + sinal * mm(12), x2 = x1 + sinal * mm(8), dx = sinal > 0 ? 11 : -3;
if (c.segs.length === 1) x2 = x1;
g2.strokeStyle = '#888';
c.ticks.forEach(function (t) { g2.beginPath(); g2.moveTo(borda + sinal * 2, py(t)); g2.lineTo(x2 + sinal * mm(1.5), py(t)); g2.stroke(); });
g2.strokeStyle = '#111'; g2.fillStyle = '#111';
g2.beginPath(); g2.moveTo(x1, py(c.total.a) - 6); g2.lineTo(x1, py(c.total.b) + 6); g2.stroke();
c.ticks.forEach(function (t) { ponto(x1, py(t)); });
if (c.segs.length > 1) c.segs.forEach(function (s) {
var h = py(s.b) - py(s.a), t = BimPlanta.fmtM(s.v);
g2.font = '10px Arial'; var tw = g2.measureText(t).width;
if (tw > h - 4) { g2.font = '8px Arial'; tw = g2.measureText(t).width; if (tw > h - 2) return; }
g2.save(); g2.translate(x1 + dx, (py(s.a) + py(s.b)) / 2 + tw / 2); g2.rotate(-Math.PI / 2); g2.fillText(t, 0, 0); g2.restore();
});
g2.beginPath(); g2.moveTo(x2, py(c.total.a) - 6); g2.lineTo(x2, py(c.total.b) + 6); g2.stroke();
ponto(x2, py(c.total.a)); ponto(x2, py(c.total.b));
g2.save(); g2.font = 'bold 11px Arial'; var tz = BimPlanta.fmtM(c.total.v), tzw = g2.measureText(tz).width;
g2.translate(x2 + dx, (py(c.total.a) + py(c.total.b)) / 2 + tzw / 2); g2.rotate(-Math.PI / 2); g2.fillText(tz, 0, 0); g2.restore();
}
if (cad) {
if (cad.topo) cadH(cad.topo, py(cad.faces.topo), -1);
if (cad.base) cadH(cad.base, py(cad.faces.base), 1);
if (cad.esq) cadV(cad.esq, px(cad.faces.esq), -1);
if (cad.dir) cadV(cad.dir, px(cad.faces.dir), 1);
}
if (int && int.cotas) {
g2.lineWidth = 0.8;
int.cotas.forEach(function (c) {
var t = BimPlanta.fmtM(c.v);
g2.strokeStyle = '#111'; g2.fillStyle = '#111'; g2.font = '9px Arial';
var tw = g2.measureText(t).width;
if (c.tipo === 'larg') {
var ya = py(c.fixo), xa = px(c.a), xb = px(c.b);
g2.beginPath(); g2.moveTo(xa, ya); g2.lineTo(xb, ya); g2.stroke();
ponto(xa, ya, 2); ponto(xb, ya, 2);
var tx = (xa + xb) / 2 - tw / 2, ty = ya - 3;
g2.save(); g2.strokeStyle = '#fff'; g2.lineWidth = 3; g2.strokeText(t, tx, ty); g2.restore(); g2.fillText(t, tx, ty);
} else {
var xp = px(c.fixo), za = py(c.a), zb = py(c.b);
g2.beginPath(); g2.moveTo(xp, za); g2.lineTo(xp, zb); g2.stroke();
ponto(xp, za, 2); ponto(xp, zb, 2);
g2.save(); g2.translate(xp - 3, (za + zb) / 2 + tw / 2); g2.rotate(-Math.PI / 2);
g2.strokeStyle = '#fff'; g2.lineWidth = 3; g2.strokeText(t, 0, 0); g2.fillText(t, 0, 0); g2.restore();
}
});
}
}
function ambientesDaPlanta(yCorte, visivelEl) {
var lista = [], fonte = '';
try {
var UI = window.BimAmbienteUI, AM = window.BimAmbiente;
var st = UI && UI.estado ? UI.estado() : null;
if (st && AM && AM.calcular && st.ambientes && st.ambientes.length) {
var r = AM.calcular(st, { regra: 'face', niveis: UI.niveisObra ? UI.niveisObra() : [] });
st.ambientes.forEach(function (a) {
var c = r.porId[a.id];
if (!c || c.estado !== 'delimitado' || !c.contorno || c.contorno.length < 3) return;
if (typeof c.base === 'number' && typeof c.topo === 'number' && !(c.base - 0.01 <= yCorte && yCorte <= c.topo + 0.01)) return;
lista.push({ nome: a.nome || ('Ambiente ' + (lista.length + 1)), pts: c.contorno });
});
if (lista.length) fonte = 'ambientes do editor';
}
} catch (eA) { lista = []; }
if (lista.length) return { lista: lista, fonte: fonte };
S.modelos.forEach(function (mo) {
if (mo.visivel === false) return;
(mo.elementos || []).forEach(function (el) {
if (!el.aabb || String(el.tipo).toUpperCase() !== 'IFCSPACE' || !visivelEl(el)) return;
var a = el.aabb;
if (!(a.min[1] < yCorte && a.max[1] > yCorte)) return;
var m = S.meshPorUid[el.uid], retang = !!m, vv = new THREE.Vector3();
if (m) {
m.updateWorldMatrix(true, true);
m.traverse(function (o) {
if (!retang || !o.isMesh || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
var pos = o.geometry.attributes.position;
for (var i = 0; i < pos.count; i++) {
vv.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
var nx = Math.min(Math.abs(vv.x - a.min[0]), Math.abs(vv.x - a.max[0])), nz = Math.min(Math.abs(vv.z - a.min[2]), Math.abs(vv.z - a.max[2]));
if (nx > 0.03 || nz > 0.03) { retang = false; return; }
}
});
}
var nm = el.nome || el.name || el.tag || ('Ambiente ' + (lista.length + 1));
if (retang) lista.push({ nome: nm, pts: [{ x: a.min[0], z: a.min[2] }, { x: a.max[0], z: a.min[2] }, { x: a.max[0], z: a.max[2] }, { x: a.min[0], z: a.max[2] }] });
else lista.push({ nome: nm, pts: [{ x: a.min[0], z: a.min[2] }, { x: a.max[0], z: a.max[2] }, { x: a.min[0], z: a.max[2] }] });
});
});
return { lista: lista, fonte: lista.length ? 'espaços do modelo (IfcSpace)' : '' };
}
function obstaculosDaPlanta(yCorte, visivelEl) {
var out = [], re = /FURNISH|SANITARY|FLOWSTORAGE|BUILDINGELEMENTPROXY|ELECTRICAPPLIANCE|FLOWTERMINAL/i;
S.modelos.forEach(function (mo) {
if (mo.visivel === false) return;
(mo.elementos || []).forEach(function (el) {
if (!el.aabb || !re.test(String(el.tipo)) || !visivelEl(el)) return;
var a = el.aabb;
if (!(a.min[1] < yCorte)) return;
if (!(isFinite(a.min[0]) && isFinite(a.max[0]) && isFinite(a.min[2]) && isFinite(a.max[2]))) return;
out.push({ minx: a.min[0] - 0.03, maxx: a.max[0] + 0.03, minz: a.min[2] - 0.03, maxz: a.max[2] + 0.03 });
});
});
return out;
}
function gerarPlantaTec(o) {
if (S._famLodTudo0) S._famLodTudo0();
var box = new THREE.Box3().setFromObject(modelRoot);
if (box.isEmpty()) return null;
var minX = box.min.x, maxX = box.max.x, minZ = box.min.z, maxZ = box.max.z;
var margem = Math.max(0.4, Math.max(maxX - minX, maxZ - minZ) * 0.03);
var wM = (maxX - minX) + margem * 2, hM = (maxZ - minZ) + margem * 2;
var escBase = o.escala || 50, PPM96 = 96 / 25.4;
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
var secPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), o.y);
var cam = new THREE.OrthographicCamera(-wM / 2, wM / 2, hM / 2, -hM / 2, 0.01, recuo + prof);
cam.position.set(cx, o.y + recuo, cz);
cam.up.set(0, 0, -1);
cam.lookAt(cx, o.y - 1, cz); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
var prevClip = renderer.clippingPlanes, prevLocal = renderer.localClippingEnabled;
var prevClear = renderer.getClearColor(new THREE.Color()).clone(), prevAlpha = renderer.getClearAlpha();
var prevTone = renderer.toneMapping, prevAuto = renderer.autoClear;
var rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true, stencilBuffer: true }), buf = null, edgesRoot = null, matMassa = null, matLinha = null, escondidos = [];
var stBack = null, stFront = null, capMat = null, capGeo = null, hatchTex = null;
try {
renderer.clippingPlanes = [secPlane]; renderer.localClippingEnabled = false;
renderer.toneMapping = THREE.NoToneMapping;
scene.children.forEach(function (c) { if (c !== modelRoot && c.visible !== false) { escondidos.push(c); c.visible = false; } });
matMassa = new THREE.MeshBasicMaterial({ color: luzNum(0xededed), polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
scene.overrideMaterial = matMassa;
renderer.setRenderTarget(rt); renderer.setClearColor(0xffffff, 1); renderer.clear();
renderer.render(scene, cam);
scene.overrideMaterial = null;
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
var esp = 0.0028 * escalaEf;
hatchTex.repeat.set(wM / esp, hM / esp);
capMat = new THREE.MeshBasicMaterial({ map: hatchTex, depthTest: true, depthFunc: THREE.AlwaysDepth, depthWrite: true, side: THREE.DoubleSide,
stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.ZeroStencilOp, stencilZFail: THREE.ZeroStencilOp, stencilZPass: THREE.ZeroStencilOp });
capGeo = new THREE.PlaneGeometry(wM, hM);
var capQuad = new THREE.Mesh(capGeo, capMat);
capQuad.rotation.x = Math.PI / 2;
capQuad.position.set(cx, o.y - 1e-3, cz);
var capScene = new THREE.Scene(); capScene.add(capQuad);
renderer.render(capScene, camSt);
edgesRoot = new THREE.Group(); matLinha = new THREE.LineBasicMaterial({ color: luzNum(0x111111) });
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
var cad = null, cotInt = null;
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
var visEl = function (el) { var m = S.meshPorUid[el.uid]; return !!m && m.visible && cadeiaVisivel(m); };
var amb = ambientesDaPlanta(o.y, visEl);
var pcorte = BimPlanta.paredesDoCorte(els, o.y), foraEdif = 0, semAmb = !amb.lista.length;
if (!semAmb) { var ed = BimPlanta.paredesDaEdificacao(pcorte, amb.lista, 0.3); pcorte = ed.paredes; foraEdif = ed.fora; }
cad = BimPlanta.ladosPlanta(pcorte);
cad.foraEdificacao = foraEdif; cad.semAmbientes = semAmb;
cotInt = BimPlanta.cotasInternas(amb.lista, { obstaculos: obstaculosDaPlanta(o.y, visEl), margem: Math.max(0.25, escalaEf / 1000 * 8) });
cotInt.fonte = amb.fonte;
}
var temCotas = !!(cad && (cad.topo || cad.base || cad.esq || cad.dir));
var avisos = [];
if (cad && cad.semAmbientes) avisos.push('Sem ambientes no corte: a cota externa usa TODAS as paredes (inclui muro/divisa se houver)');
if (cad && cad.diagonais) avisos.push('⚠ ' + cad.diagonais + ' parede(s) fora de esquadro/curtas sem cota automática — meça com a trena');
if (o.cotas && !temCotas) avisos.push('' + (typeof Icones !== 'undefined' ? Icones.get('alerta', 15) : '') + ' Nenhuma parede reta atravessa o corte — sem cotas automáticas');
if (cotInt) {
if (cotInt.pulados) avisos.push('Cotas internas: ' + cotInt.pulados + ' ambiente(s) curvo(s) ou diagonal(is) sem cota interna — meça com a trena');
if (cotInt.semLugar) avisos.push('Cotas internas: ' + cotInt.semLugar + ' ambiente(s) sem vão livre de 0,60 m para a cota interna');
if (!cotInt.total && !cotInt.fonte) avisos.push('Cotas internas: nenhum ambiente no corte (crie os ambientes ou use o IfcSpace do projeto)');
}
var padTop = avisos.length ? (avisos.length * 15 + 8) : 0;
var needC = Math.round((12 + 8) * PPM96) + 16, gx0 = minX - margem, gz0 = minZ - margem;
function faltaPad(dist) { return Math.max(0, Math.ceil(needC - dist)); }
var padCT = (cad && cad.topo) ? faltaPad((cad.faces.topo - gz0) * pxM) : 0;
var padL = (cad && cad.esq) ? faltaPad((cad.faces.esq - gx0) * pxM) : 0;
var padR = (cad && cad.dir) ? faltaPad(W - (cad.faces.dir - gx0) * pxM) : 0;
var padB = (cad && cad.base) ? faltaPad(H - (cad.faces.base - gz0) * pxM) : 0;
var faixa = 46, totalW = padL + W + padR, totalH = padTop + padCT + H + padB + faixa, yBase = padTop + padCT + H + padB;
var cnv = document.createElement('canvas'); cnv.width = totalW; cnv.height = totalH;
var g2 = cnv.getContext('2d');
g2.fillStyle = '#fff'; g2.fillRect(0, 0, totalW, totalH);
var img = g2.createImageData(W, H);
for (var y2f = 0; y2f < H; y2f++) { var srcY = (H - 1 - y2f) * W * 4; img.data.set(buf.subarray(srcY, srcY + W * 4), y2f * W * 4); }
g2.putImageData(img, padL, padTop + padCT);
if (cad) { g2.save(); g2.translate(0, padTop + padCT); desenharCotas(g2, cad, { padL: padL, H: H, W: W, pxM: pxM, x0: minX - margem, z0: minZ - margem }, cotInt); g2.restore(); }
if (avisos.length) {
g2.font = '11px Arial'; g2.fillStyle = '#b45309';
for (var ai = 0; ai < avisos.length; ai++) g2.fillText(avisos[ai], 8, 16 + ai * 15);
}
g2.strokeStyle = '#111'; g2.lineWidth = 2; g2.strokeRect(1, 1, totalW - 2, totalH - 2);
g2.beginPath(); g2.moveTo(1, yBase); g2.lineTo(totalW - 1, yBase); g2.stroke();
g2.fillStyle = '#111'; var temBarra = pxM >= 8 && pxM < totalW * 0.45, barW = temBarra ? pxM + 26 : 0;
if (temBarra) { g2.fillRect(totalW - pxM - 12, yBase + 16, pxM, 6); g2.font = '10px Arial'; g2.fillText('1 m', totalW - pxM - 12, yBase + 37); }
var rotAlt = o.rotAlt || (fmtDist(Math.max(0, o.y - box.min.y)) + ' do piso');
var titulo = 'PLANTA BAIXA (corte a ' + rotAlt + ')  ·  ESC 1:' + escalaEf + (ajustada ? ' (ajustada)' : '') + '  ·  ' + (((typeof Empresa!=='undefined'&&Empresa.nomeDoc&&Empresa.nomeDoc())||'') || 'Desenho técnico') + ((typeof Empresa!=='undefined'&&Empresa.creditoTexto&&Empresa.creditoTexto())?' · OrçaPRO BIM':'') + '  ·  ' + new Date().toLocaleDateString('pt-BR');
var livre = totalW - 16 - barW, fs = 15;
g2.font = 'bold ' + fs + 'px Arial';
while (fs > 8 && g2.measureText(titulo).width > livre) { fs--; g2.font = 'bold ' + fs + 'px Arial'; }
if (g2.measureText(titulo).width > livre) { titulo = 'ESC 1:' + escalaEf + (ajustada ? ' (aj.)' : ''); g2.font = 'bold 11px Arial'; }
g2.fillStyle = '#111'; g2.fillText(titulo, 10, yBase + 29);
return { url: cnv.toDataURL('image/png'), w: totalW, h: totalH, escala: escalaEf, pxPorMetro: pxM, ajustada: ajustada, cotas: temCotas, foraEdificacao: cad ? cad.foraEdificacao : 0, lados: cad ? { topo: !!cad.topo, base: !!cad.base, esq: !!cad.esq, dir: !!cad.dir } : null, cotasInternas: cotInt ? cotInt.cotas.length : 0, ambientesPulados: cotInt ? cotInt.pulados : 0, ambientesSemLugar: cotInt ? cotInt.semLugar : 0, diagonais: cad ? cad.diagonais : 0, larguraMM: totalW / 96 * 25.4, alturaMM: totalH / 96 * 25.4 };
}
S._gerarPlantaTec = gerarPlantaTec;
function acimaItens(acimaGr, acimaOrd, telaX, telaY) {
var acima = [];
if (!acimaOrd.length || !window.Desenho2D || !Desenho2D.Acima) return acima;
var caixasA = null, tagsA = null;
acimaOrd.forEach(function (uA) {
var gA = acimaGr[uA], pts = [], segs = [], y0 = Infinity, y1 = -Infinity, areaB = 0, vis = {};
gA.ms.forEach(function (m) {
var geo = m.geometry, pos = geo.attributes.position, e = m.matrixWorld.elements, A = pos.array, nV = pos.count, idx = geo.index ? geo.index.array : null;
var passo = Math.max(1, Math.floor(nV / 6000));
var WX = new Float32Array(nV), WY = new Float32Array(nV), WZ = new Float32Array(nV);
for (var vi = 0; vi < nV; vi++) {
var x = A[vi * 3], y = A[vi * 3 + 1], z = A[vi * 3 + 2];
WX[vi] = e[0] * x + e[4] * y + e[8] * z + e[12]; WY[vi] = e[1] * x + e[5] * y + e[9] * z + e[13]; WZ[vi] = e[2] * x + e[6] * y + e[10] * z + e[14];
if (WY[vi] < y0) y0 = WY[vi]; if (WY[vi] > y1) y1 = WY[vi];
if (vi % passo === 0) pts.push([telaX(WX[vi], WY[vi], WZ[vi]), telaY(WX[vi], WY[vi], WZ[vi])]);
}
var nT = idx ? idx.length / 3 : nV / 3;
if (nT <= 200000) for (var ti = 0; ti < nT; ti++) {
var i0 = idx ? idx[ti * 3] : ti * 3, i1 = idx ? idx[ti * 3 + 1] : ti * 3 + 1, i2 = idx ? idx[ti * 3 + 2] : ti * 3 + 2;
var ax = WX[i1] - WX[i0], ay = WY[i1] - WY[i0], az = WZ[i1] - WZ[i0], bx = WX[i2] - WX[i0], by = WY[i2] - WY[i0], bz = WZ[i2] - WZ[i0];
var ny = az * bx - ax * bz;
if (ny < 0) areaB += -ny / 2;
}
var arr = arestasDe(geo);
for (var ei = 0; ei < arr.length; ei += 6) {
var X1 = e[0] * arr[ei] + e[4] * arr[ei + 1] + e[8] * arr[ei + 2] + e[12], Z1 = e[2] * arr[ei] + e[6] * arr[ei + 1] + e[10] * arr[ei + 2] + e[14];
var X2 = e[0] * arr[ei + 3] + e[4] * arr[ei + 4] + e[8] * arr[ei + 5] + e[12], Z2 = e[2] * arr[ei + 3] + e[6] * arr[ei + 4] + e[10] * arr[ei + 5] + e[14];
var sx1 = telaX(X1, 0, Z1), sy1 = telaY(X1, 0, Z1), sx2 = telaX(X2, 0, Z2), sy2 = telaY(X2, 0, Z2);
if (Math.abs(sx2 - sx1) + Math.abs(sy2 - sy1) < 1e-3) continue;
var ka = Math.round(sx1 * 1000) + ',' + Math.round(sy1 * 1000), kb = Math.round(sx2 * 1000) + ',' + Math.round(sy2 * 1000), kk = ka < kb ? ka + '|' + kb : kb + '|' + ka;
if (vis[kk]) continue; vis[kk] = 1;
if (segs.length < 20000) segs.push([sx1, sy1, sx2, sy2]);
}
});
var marca = '';
if (gA.mid === 'edit' && edit && edit.estado) {
if (!caixasA) { caixasA = {}; (edit.estado.caixas || []).forEach(function (c) { if (c && c.id != null) caixasA[c.id] = c; }); }
var cA = caixasA[gA.eid]; if (cA && cA.marca) marca = String(cA.marca);
} else {
if (!tagsA) { tagsA = {}; (S.elementos || []).forEach(function (el) { if (el && el.uid && el.tag) tagsA[el.uid] = el.tag; }); }
var tg = tagsA[uA]; if (tg && String(tg).length <= 12 && /[A-Za-z]/.test(String(tg))) marca = String(tg);
}
var itA = Desenho2D.Acima.peca({ u: uA, t: gA.t, pts: pts, segs: segs, areaBaixo: areaB, fundo: y0, topo: y1, marca: marca, forcar: !!gA.forcar });
if (itA) acima.push(itA);
});
return acima;
}
function vista2d(def) {
var BMU = window.BimMateriaisUI, A3 = window.AlvAssentamento3D;
var corpo = function () { return vista2dCorpo(def); };
var semBlocos = (A3 && typeof A3.paraDesenho === 'function') ? function () { return A3.paraDesenho(corpo); } : corpo;
if (BMU && typeof BMU.emLote === 'function') return BMU.emLote(semBlocos);
return semBlocos();
}
function vista2dCorpo(def) {
if (S._famLodTudo0) S._famLodTudo0();
var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
def = def || {};
var box = new THREE.Box3().setFromObject(modelRoot);
if (box.isEmpty()) return { ok: false, vazio: true, erro: 'Abra um modelo primeiro.' };
var edEx = null;
if (!def.semEntorno) {
var edA = null; try { edA = S._edificacaoAtiva(); } catch (eEd) { edA = null; }
if (edA && edA.caixa) { edEx = edA.exclusoes; box = new THREE.Box3(new THREE.Vector3(edA.caixa.min[0], edA.caixa.min[1], edA.caixa.min[2]), new THREE.Vector3(edA.caixa.max[0], edA.caixa.max[1], edA.caixa.max[2])); }
}
var planta = def.tipo !== 'corte';
var p6Forro = def.tipo === 'forro', p6Oc = typeof def.p6Ocultar === 'function' ? def.p6Ocultar : null, p6Tag = !!def.p6Tag, linhasUd = [];
var NVi = window.BimInstNivel, instVet = null;
if (NVi && !p6Forro && !def._soInst && edit && edit.estado && edit.estado.instalacoes && window.BimInst && !(window.BimInstUI && BimInstUI._previaHidro && !BimInstUI._previaHidro())) {
var ndPed = NVi.norm(def.nivelInst, NVi.padraoVista(def.tipo === 'corte' ? 'corte' : 'planta'));
var ndCena = (window.BimInstUI && BimInstUI._nivelFeito) || 'alto';
var ndUsa = NVi.ORDEM[Math.min(NVi.ORDEM.indexOf(ndPed), NVi.ORDEM.indexOf(NVi.norm(ndCena, 'alto')))];
instVet = { pedido: ndPed, usado: ndUsa, linhas: 0, solidos: 0 };
}
var dir, upv, O, plano, camPos, near = 0.4, far, sFn;
if (p6Forro) {
var hF = +def.yCorte, topoF = (def.yTopo != null) ? +def.yTopo : box.max.y + 0.01;
if (!isFinite(hF)) return { ok: false, erro: 'Altura do corte inválida.' };
dir = new THREE.Vector3(0, 1, 0); upv = new THREE.Vector3(0, 0, -1); O = new THREE.Vector3(0, 0, 0);
plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), -hF);
camPos = new THREE.Vector3((box.min.x + box.max.x) / 2, hF - 0.5, (box.min.z + box.max.z) / 2);
far = 0.5 + Math.max(0.05, topoF - hF);
} else if (planta) {
var h = +def.yCorte, fundo = (def.yFundo != null) ? +def.yFundo : box.min.y - 0.01;
if (!isFinite(h)) return { ok: false, erro: 'Altura do corte inválida.' };
dir = new THREE.Vector3(0, -1, 0); upv = new THREE.Vector3(0, 0, -1); O = new THREE.Vector3(0, 0, 0);
plano = new THREE.Plane(new THREE.Vector3(0, -1, 0), h);
camPos = new THREE.Vector3((box.min.x + box.max.x) / 2, h + 0.5, (box.min.z + box.max.z) / 2);
far = 0.5 + Math.max(0.05, h - fundo);
} else {
var dx = (+def.bx) - (+def.ax), dz = (+def.bz) - (+def.az), L = Math.sqrt(dx * dx + dz * dz);
if (!(L > 0.05)) return { ok: false, erro: 'O corte precisa de dois pontos diferentes.' };
var nx = dz / L, nz = -dx / L; if (def.inv) { nx = -nx; nz = -nz; }
dir = new THREE.Vector3(nx, 0, nz); upv = new THREE.Vector3(0, 1, 0); O = new THREE.Vector3(+def.ax, 0, +def.az);
plano = new THREE.Plane(dir.clone(), -(nx * (+def.ax) + nz * (+def.az)));
var diag = box.getSize(new THREE.Vector3()).length();
var prof = (def.prof != null && +def.prof > 0) ? +def.prof : diag;
camPos = O.clone().addScaledVector(dir, -0.5); camPos.y = (box.min.y + box.max.y) / 2;
far = 0.5 + prof;
}
var r = new THREE.Vector3().crossVectors(dir, upv).normalize();
sFn = function (x, y, z) { return plano.normal.x * x + plano.normal.y * y + plano.normal.z * z + plano.constant; };
var l = Infinity, rr = -Infinity, bt = Infinity, tp = -Infinity, cc = new THREE.Vector3();
for (var ci = 0; ci < 8; ci++) {
cc.set(ci & 1 ? box.max.x : box.min.x, ci & 2 ? box.max.y : box.min.y, ci & 4 ? box.max.z : box.min.z).sub(camPos);
var cxv = cc.dot(r), cyv = cc.dot(upv);
if (cxv < l) l = cxv; if (cxv > rr) rr = cxv; if (cyv < bt) bt = cyv; if (cyv > tp) tp = cyv;
}
l -= 0.2; rr += 0.2; bt -= 0.2; tp += 0.2;
var Wm = rr - l, Hm = tp - bt;
var res = Math.max(512, Math.min(4096, +def.res || 2400, (renderer.capabilities && renderer.capabilities.maxTextureSize) || 4096));
var ppm = res / Math.max(Wm, Hm), W = Math.max(8, Math.ceil(Wm * ppm)), H = Math.max(8, Math.ceil(Hm * ppm));
var cam = new THREE.OrthographicCamera(l, rr, tp, bt, near, far);
cam.position.copy(camPos); cam.up.copy(upv); cam.lookAt(camPos.clone().add(dir));
cam.layers.enable(0); cam.layers.enable(1);
cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
var co = camPos.clone().sub(O), offX = co.dot(r), offY = co.dot(upv);
function telaX(px, py, pz) { return (px - O.x) * r.x + (py - O.y) * r.y + (pz - O.z) * r.z; }
function telaY(px, py, pz) { return -((px - O.x) * upv.x + (py - O.y) * upv.y + (pz - O.z) * upv.z); }
function prof3(px, py, pz) { return (px - camPos.x) * dir.x + (py - camPos.y) * dir.y + (pz - camPos.z) * dir.z; }
var prevClip = renderer.clippingPlanes, prevLocal = renderer.localClippingEnabled, prevTone = renderer.toneMapping;
var prevClear = renderer.getClearColor(new THREE.Color()).clone(), prevAlpha = renderer.getClearAlpha(), prevAuto = renderer.autoClear;
var escondidos = [], rt = null, mat = null, buf = null;
try {
rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true });
mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
renderer.clippingPlanes = [plano]; renderer.localClippingEnabled = false; renderer.toneMapping = THREE.NoToneMapping;
scene.children.forEach(function (c) { if (c !== modelRoot && c.visible !== false) { escondidos.push(c); c.visible = false; } });
if (p6Oc) modelRoot.traverse(function (o) { if (o.isMesh && o.visible !== false && p6Oc(o.userData || {})) { escondidos.push(o); o.visible = false; } });
if (edEx) modelRoot.traverse(function (o) { if (o.isMesh && o.visible !== false && o.userData && o.userData.expressID != null && edEx[o.userData.mid + ':' + o.userData.expressID]) { escondidos.push(o); o.visible = false; } });
modelRoot.traverse(function (o) { if (o.isMesh && o.visible !== false && o.userData && o.userData.sem2d) { escondidos.push(o); o.visible = false; } });
scene.overrideMaterial = mat;
renderer.autoClear = true;
renderer.setRenderTarget(rt); renderer.setClearColor(0xffffff, 1); renderer.clear();
renderer.render(scene, cam);
buf = new Uint8Array(W * H * 4);
renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
} finally {
scene.overrideMaterial = null;
escondidos.forEach(function (c) { c.visible = true; });
renderer.setRenderTarget(null);
if (rt) try { rt.dispose(); } catch (_) {}
if (mat) mat.dispose();
renderer.clippingPlanes = prevClip; renderer.localClippingEnabled = prevLocal; renderer.toneMapping = prevTone;
renderer.setClearColor(prevClear, prevAlpha); renderer.autoClear = prevAuto;
}
var U0 = (255 / 256) / (256 * 256 * 256), U1 = (255 / 256) / (256 * 256), U2 = (255 / 256) / 256, U3 = 255 / 256;
var dist = new Float32Array(W * H);
for (var pi = 0; pi < W * H; pi++) {
var o4 = pi * 4, d01 = (buf[o4] / 255) * U0 + (buf[o4 + 1] / 255) * U1 + (buf[o4 + 2] / 255) * U2 + (buf[o4 + 3] / 255) * U3;
dist[pi] = d01 >= 0.9999 ? Infinity : near + d01 * (far - near);
}
function bufDist(X, Y) {
var xc = (X - offX - l) / Wm * W, yc = (tp - (-Y - offY)) / Hm * H;
var ix = Math.floor(xc), iy = Math.floor(yc), m = -Infinity;
for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) {
var xx = ix + ox, yy = iy + oy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
var v = dist[(H - 1 - yy) * W + xx]; if (v > m) m = v;
}
return m;
}
var cortes = [], linhas = [], nMalhas = 0, nTri = 0, nAr = 0, amostras = 0, linhasFase = {};
var linhasIfc = [];
var portasNat = [], portasIfc = {};
var acimaTopo = (planta && !p6Forro && window.Desenho2D && Desenho2D.Acima && def.acimaTopo != null && isFinite(+def.acimaTopo) && +def.acimaTopo > +def.yCorte + 0.01) ? +def.acimaTopo : null;
var acimaGr = {}, acimaOrd = [];
var tol = Math.max(0.004, 2.0 / ppm), passoPx = 0.9;
var bb = new THREE.Box3(), v3 = new THREE.Vector3();
var curvaFeita = {}, curvaVaos = null;
function curvaPlanta(id) {
var c = null; (edit.estado.caixas || []).forEach(function (x) { if (x && x.id === id) c = x; });
if (!c || !BimCurva.ehCurva(c)) return false;
if (curvaFeita[id]) return true;
curvaFeita[id] = 1;
if (!curvaVaos) { try { curvaVaos = BimEdit.vaosDasParedes(edit.estado, famAval) || {}; } catch (eV) { curvaVaos = {}; } }
var hC = +def.yCorte, vz = curvaVaos[id];
BimCurva.cortePlanta(c, function (q) { return [telaX(q[0], hC, q[1]), telaY(q[0], hC, q[1])]; }, vz ? vz.aceitos : [], hC).forEach(function (k) {
if (p6Tag) { k.t = 'IFCWALL'; k.u = 'edit:' + id; }
k.ifc = 'IFCWALL'; k._pid = id; cortes.push(k);
});
return true;
}
modelRoot.children.forEach(function (g) {
(g.children || []).forEach(function (m) {
if (!m.isMesh || !m.geometry || !cadeiaVisivel(m)) return;
if (p6Oc && p6Oc(m.userData || {})) return;
if (edEx && m.userData && m.userData.expressID != null && edEx[m.userData.mid + ':' + m.userData.expressID]) return;
if (m.userData && m.userData.sem2d) return;
if (instVet) {
var udI = m.userData || {};
if (udI.instUnif || udI.instPapel || udI.instFam) return;
}
if (planta && !p6Forro) {
if (m.userData.portaFolha) return;
if (m.userData.portaPlanta) portasNat.push(m);
else if (m.userData.mid !== 'edit' && !m.userData.fimpSem2d && /^IFCDOOR(STANDARDCASE)?$/.test(String(m.userData.tipo || '').toUpperCase())) {
var kPI = m.userData.mid + ':' + m.userData.expressID; (portasIfc[kPI] = portasIfc[kPI] || []).push(m);
}
}
if (planta && !p6Forro && m.userData.mobSem2d) {
var mp = m.userData.mobPlanta, mfy = m.userData.mobFaixaY || [-Infinity, Infinity];
if (mp && mfy[1] >= fundo - 1e-6 && mfy[0] <= h + 1e-6) {
var udMb = p6Tag ? { t: m.userData.tipo || '', u: m.userData.expressID != null ? ((m.userData.mid != null ? m.userData.mid : S.modelID) + ':' + m.userData.expressID) : '' } : null;
for (var iMb = 0; iMb + 3 < mp.length; iMb += 4) {
linhas.push([telaX(mp[iMb], h, mp[iMb + 1]), telaY(mp[iMb], h, mp[iMb + 1]), telaX(mp[iMb + 2], h, mp[iMb + 3]), telaY(mp[iMb + 2], h, mp[iMb + 3])]);
linhasIfc.push(m.userData.tipo || ''); if (udMb) linhasUd.push(udMb);
}
}
return;
}
if (planta && !p6Forro && m.userData.fimpSem2d) {
var fp = m.userData.fimpPlanta, fy = m.userData.fimpFaixaY || [-Infinity, Infinity];
if (fp && fy[1] >= fundo - 1e-6 && fy[0] <= h + 1e-6) {
var udF = p6Tag ? { t: m.userData.tipo || '', u: (m.userData.mid != null ? m.userData.mid : S.modelID) + ':' + m.userData.expressID } : null;
for (var iF = 0; iF + 3 < fp.length; iF += 4) {
linhas.push([telaX(fp[iF], h, fp[iF + 1]), telaY(fp[iF], h, fp[iF + 1]), telaX(fp[iF + 2], h, fp[iF + 3]), telaY(fp[iF + 2], h, fp[iF + 3])]);
linhasIfc.push(m.userData.tipo || ''); if (udF) linhasUd.push(udF);
}
}
return;
}
var udT = p6Tag ? { t: m.userData.tipo || '', u: m.userData.expressID != null ? ((m.userData.mid != null ? m.userData.mid : S.modelID) + ':' + m.userData.expressID) : '' } : null;
var geo = m.geometry, pos = geo.attributes && geo.attributes.position; if (!pos) return;
if (!geo.boundingBox) geo.computeBoundingBox();
bb.copy(geo.boundingBox).applyMatrix4(m.matrixWorld);
var algumFica = false, algumSai = false;
for (var k8 = 0; k8 < 8; k8++) {
var sv = sFn(k8 & 1 ? bb.max.x : bb.min.x, k8 & 2 ? bb.max.y : bb.min.y, k8 & 4 ? bb.max.z : bb.min.z);
if (sv >= 0) algumFica = true; else algumSai = true;
}
if (!algumFica) {
if (acimaTopo != null && m.userData && (bb.min.y < acimaTopo - 0.005 || m.userData.acimaSempre) && m.userData.expressID != null && (Desenho2D.Acima.tipoPode(m.userData.tipo) || m.userData.acimaSempre)) {
var uA = (m.userData.mid != null ? m.userData.mid : S.modelID) + ':' + m.userData.expressID;
if (!acimaGr[uA]) { acimaGr[uA] = { ms: [], t: m.userData.tipo || '', mid: m.userData.mid, eid: m.userData.expressID, forcar: !!m.userData.acimaSempre }; acimaOrd.push(uA); }
acimaGr[uA].ms.push(m);
}
return;
}
nMalhas++;
var curvaPl = planta && !p6Forro && algumSai && window.BimCurva && edit && edit.estado && m.userData && m.userData.mid === 'edit' ? curvaPlanta(m.userData.expressID) : false;
var e = m.matrixWorld.elements, A = pos.array, idx = geo.index ? geo.index.array : null;
var nV = pos.count;
var WX = new Float32Array(nV), WY = new Float32Array(nV), WZ = new Float32Array(nV), SS = new Float32Array(nV);
for (var vi = 0; vi < nV; vi++) {
var x = A[vi * 3], y = A[vi * 3 + 1], z = A[vi * 3 + 2];
var wx = e[0] * x + e[4] * y + e[8] * z + e[12], wy = e[1] * x + e[5] * y + e[9] * z + e[13], wz = e[2] * x + e[6] * y + e[10] * z + e[14];
WX[vi] = wx; WY[vi] = wy; WZ[vi] = wz; SS[vi] = sFn(wx, wy, wz);
}
if (algumSai && !curvaPl) {
var segs = [], nT = idx ? idx.length / 3 : nV / 3;
for (var ti = 0; ti < nT; ti++) {
var i0 = idx ? idx[ti * 3] : ti * 3, i1 = idx ? idx[ti * 3 + 1] : ti * 3 + 1, i2 = idx ? idx[ti * 3 + 2] : ti * 3 + 2;
var s0 = SS[i0], s1 = SS[i1], s2 = SS[i2];
var p0 = s0 >= 0, p1 = s1 >= 0, p2 = s2 >= 0;
if (p0 === p1 && p1 === p2) continue;
nTri++;
var pts = [], ar = [[i0, i1, s0, s1], [i1, i2, s1, s2], [i2, i0, s2, s0]];
for (var ai = 0; ai < 3; ai++) {
var q = ar[ai]; if ((q[2] >= 0) === (q[3] >= 0)) continue;
var tt = q[2] / (q[2] - q[3]), ia = q[0], ib = q[1];
var ix = WX[ia] + (WX[ib] - WX[ia]) * tt, iy = WY[ia] + (WY[ib] - WY[ia]) * tt, iz = WZ[ia] + (WZ[ib] - WZ[ia]) * tt;
pts.push([telaX(ix, iy, iz), telaY(ix, iy, iz)]);
}
if (pts.length === 2) segs.push(pts);
}
encadear(segs).forEach(function (c) { if (udT) { c.t = udT.t; c.u = udT.u; } c.ifc = m.userData.tipo || ''; if (m.userData._fase) c.fase = m.userData._fase; if (m.userData.mid === 'edit') c._pid = m.userData.expressID; cortes.push(c); });
}
var arr = arestasDe(geo), l0p10 = linhas.length;
for (var ei = 0; ei < arr.length; ei += 6) {
nAr++;
var ax = arr[ei], ay = arr[ei + 1], az = arr[ei + 2], bx = arr[ei + 3], by = arr[ei + 4], bz = arr[ei + 5];
var X1 = e[0] * ax + e[4] * ay + e[8] * az + e[12], Y1 = e[1] * ax + e[5] * ay + e[9] * az + e[13], Z1 = e[2] * ax + e[6] * ay + e[10] * az + e[14];
var X2 = e[0] * bx + e[4] * by + e[8] * bz + e[12], Y2 = e[1] * bx + e[5] * by + e[9] * bz + e[13], Z2 = e[2] * bx + e[6] * by + e[10] * bz + e[14];
var sa = sFn(X1, Y1, Z1), sb = sFn(X2, Y2, Z2);
if (sa < 0 && sb < 0) continue;
if (Math.abs(sa) < 1e-3 && Math.abs(sb) < 1e-3) continue;
if (sa < 0 || sb < 0) {
var tc = sa / (sa - sb);
var cx2 = X1 + (X2 - X1) * tc, cy2 = Y1 + (Y2 - Y1) * tc, cz2 = Z1 + (Z2 - Z1) * tc;
if (sa < 0) { X1 = cx2; Y1 = cy2; Z1 = cz2; } else { X2 = cx2; Y2 = cy2; Z2 = cz2; }
}
var da = prof3(X1, Y1, Z1), db = prof3(X2, Y2, Z2);
if (da > far && db > far) continue;
var sx1 = telaX(X1, Y1, Z1), sy1 = telaY(X1, Y1, Z1), sx2 = telaX(X2, Y2, Z2), sy2 = telaY(X2, Y2, Z2);
var lenPx = Math.sqrt((sx2 - sx1) * (sx2 - sx1) + (sy2 - sy1) * (sy2 - sy1)) * ppm;
var n = Math.max(2, Math.min(4000, Math.ceil(lenPx / passoPx) + 1));
amostras += n;
var ini = -1, ult = -1;
for (var si = 0; si < n; si++) {
var f = si / (n - 1), X = sx1 + (sx2 - sx1) * f, Y = sy1 + (sy2 - sy1) * f, dd = da + (db - da) * f;
var vis = dd <= far && (def.p6Aramado === true || dd <= bufDist(X, Y) + tol);
if (vis) { if (ini < 0) ini = si; ult = si; }
if ((!vis || si === n - 1) && ini >= 0) {
var fa = ini / (n - 1), fb = ult / (n - 1);
if (ult > ini) { linhas.push([sx1 + (sx2 - sx1) * fa, sy1 + (sy2 - sy1) * fa, sx1 + (sx2 - sx1) * fb, sy1 + (sy2 - sy1) * fb]); if (udT) linhasUd.push(udT); linhasIfc.push(m.userData.tipo || ''); }
ini = -1;
}
}
}
if (m.userData._fase && linhas.length > l0p10) { var lf = linhasFase[m.userData._fase] || (linhasFase[m.userData._fase] = []); linhas.splice(l0p10).forEach(function (q) { lf.push(q); }); }
});
});
var portas = [];
if (planta && !p6Forro && window.SimboloPorta) {
var naFaixa = function (y0, y1) { return y1 >= fundo - 1e-6 && y0 <= h + 1e-6; };
var paraTela = function (sp, u) {
function q(p) { return [telaX(p[0], h, p[1]), telaY(p[0], h, p[1])]; }
return { t: 'IFCDOOR', u: u, tipo: sp.tipo,
folhas: (sp.folhas || []).map(function (f) { return f.map(q); }),
arcos: (sp.arcos || []).map(function (a) { return { c: q(a.c), r: a.r, de: q(a.de), ate: q(a.ate) }; }),
linhas: (sp.linhas || []).map(function (l) { var a = q([l[0], l[1]]), b = q([l[2], l[3]]); return [a[0], a[1], b[0], b[1]]; }) };
};
portasNat.forEach(function (m) {
var fy = m.userData.portaFaixaY || [-Infinity, Infinity];
if (naFaixa(fy[0], fy[1])) portas.push(paraTela(m.userData.portaPlanta, 'edit:' + m.userData.expressID));
});
Object.keys(portasIfc).forEach(function (kP) {
try { var r = portaIfcPlanta(portasIfc[kP]); if (r && naFaixa(r.y0, r.y1)) portas.push(paraTela(r.sp, kP)); } catch (ePI) { }
});
}
var acima = acimaTopo != null ? acimaItens(acimaGr, acimaOrd, telaX, telaY) : [];
var uniaoInfo = null;
if (window.BimUniao && edit && edit.estado) {
try {
var dU = { cortes: cortes, linhas: linhas, linhasIfc: linhasIfc, linhasUd: linhasUd };
uniaoInfo = BimUniao.planta(dU, edit.estado, { vizinhas: p6Tag ? ['linhasIfc', 'linhasUd'] : ['linhasIfc'],
chave: function (c) {
var mt = null; try { mt = window.BimModeloVista && typeof BimModeloVista.materialDe === 'function' ? BimModeloVista.materialDe('edit:' + c.id) : null; } catch (eM) { mt = null; }
return BimUniao.assinatura(c) + (mt && mt.id ? '|mat:' + mt.id : '');
} });
cortes = dU.cortes; linhas = dU.linhas; linhasIfc = dU.linhasIfc; if (p6Tag) linhasUd = dU.linhasUd;
} catch (eU) { uniaoInfo = { erro: String(eU && eU.message || eU) }; }
}
cortes.forEach(function (c) { delete c._pid; });
if (instVet) {
try {
var Rr = BimInst.rede(edit.estado, famAval), segsI = [], polysI = [];
if (instVet.usado === 'baixo' || instVet.usado === 'medio') segsI = NVi.unifilar(Rr, 'baixo', { escala: +def.escalaInst || NVi.ESCALA_PADRAO, corContorno: instVet.usado === 'medio' }).segs.slice();
if (instVet.usado === 'medio') {
var HGm = window.HidGeo || null, Fmd = NVi.formas(Rr, 'alto', [dir.x, dir.y, dir.z], {
cotasCx: function (m, t, dn) { try { return HGm ? HGm.cotasConexao(m, t, dn) : null; } catch (e) { return null; } },
cotasTubo: function (m, dn) { try { return HGm ? HGm.cotasTubo(m, dn) : null; } catch (e) { return null; } } });
var pecaId = {}; Fmd.polys.forEach(function (pg) { if (pg.papel === 'caixa') { polysI.push(pg); pecaId[pg.id] = 1; } });
Fmd.segs.forEach(function (q) { if (q.papel === 'grade' && pecaId[q.id]) segsI.push(q); });
segsI = segsI.filter(function (q) { return !(q.papel === 'contorno' && pecaId[q.id]); });
}
else {
var HG = window.HidGeo || null;
var Fm = NVi.formas(Rr, instVet.usado, [dir.x, dir.y, dir.z], {
cotasCx: function (m, t, dn) { try { return HG ? HG.cotasConexao(m, t, dn) : null; } catch (e) { return null; } },
cotasTubo: function (m, dn) { try { return HG ? HG.cotasTubo(m, dn) : null; } catch (e) { return null; } }
});
if (window.HidSombra && HidSombra.ligada !== false && def.instSombra !== false) {
instVet.sombra = { cor: (def.instCor || (window.BimInstUI && BimInstUI.modoCor)) === 'sistema' ? 'sistema' : 'neutro' };
Fm.segs.forEach(function (q) { if (q.papel === 'prumada') segsI.push(q); });
polysI = Fm.polys.map(function (pg) { if (pg.papel === 'prumada') return pg; var q = {}; Object.keys(pg).forEach(function (kq) { q[kq] = pg[kq]; }); q.oculto = true; return q; });
} else {
Fm.segs.forEach(function (q) { segsI.push(q); });
polysI = Fm.polys;
}
}
var sisDe = {};
['trechos', 'conexoes', 'pecas', 'acessorios'].forEach(function (g) { (Rr[g] || []).forEach(function (x) { if (x && x.id != null && x.sistema) sisDe['edit:' + x.id] = x.sistema; }); });
var trDoSis = {}; (Rr.trechos || []).forEach(function (tr) { if (tr && tr.sistema && !trDoSis[tr.sistema]) trDoSis[tr.sistema] = tr.id; });
var sisOculto = {}, ocultoSis = function (sis) {
if (!p6Oc || !sis || !trDoSis[sis]) return false;
if (sisOculto[sis] == null) sisOculto[sis] = !!p6Oc({ tipo: 'IFCPIPESEGMENT', mid: 'edit', expressID: trDoSis[sis] });
return sisOculto[sis];
};
if (instVet.usado === 'baixo') (edit.estado.familias || []).forEach(function (fi) {
var fam = famReg.lista[fi.famId], cls = fam ? NVi.classeDaCategoria(fam.categoria) : null; if (!cls || cls === 'andaime') return;
var av = famAval(fi.famId, fi.tipoId, fi.inst); if (!av || !av.caixa) return;
NVi.contornoFamilia(av.caixa, fi, { id: fi.id, louca: cls === 'aparelho', ifc: FAM_IFC[fam.categoria] || 'IFCFLOWTERMINAL' }).forEach(function (q) { segsI.push(q); });
});
var topoI = (acimaTopo != null && acimaTopo >= +def.yCorte + 1.5) ? acimaTopo : +def.yCorte + 3.0;
var loI = planta ? (+def.yCorte - topoI) : 0, hiI = far - 0.5 + (planta ? 0.8 : 0);
instVet.faixa = planta ? [Math.round((+def.yCorte - hiI) * 1000) / 1000, Math.round(topoI * 1000) / 1000] : [0, Math.round(hiI * 1000) / 1000];
var fI = function (p) { return sFn(p[0], p[1], p[2]); };
segsI.forEach(function (q) {
if (p6Oc && (p6Oc({ tipo: q.ifc || 'IFCPIPESEGMENT', mid: 'edit', expressID: q.id }) || ocultoSis(q.sistema))) return;
var rc = NVi.recortar(q.a, q.b, fI, loI, hiI); if (!rc) return;
var x1 = telaX(rc[0][0], rc[0][1], rc[0][2]), y1 = telaY(rc[0][0], rc[0][1], rc[0][2]), x2 = telaX(rc[1][0], rc[1][1], rc[1][2]), y2 = telaY(rc[1][0], rc[1][1], rc[1][2]);
if (Math.abs(x2 - x1) + Math.abs(y2 - y1) < 1e-6) return;
linhas.push([x1, y1, x2, y2]); linhasIfc.push(q.ifc || 'IFCPIPESEGMENT'); instVet.linhas++;
if (p6Tag) { var es = NVi.estiloSeg(q); linhasUd.push({ t: q.ifc || 'IFCPIPESEGMENT', u: 'edit:' + q.id, inst: { k: es.k, pena: es.pena, cor: es.cor, padrao: es.padrao } }); }
});
polysI.forEach(function (pg) {
if (p6Oc && (p6Oc({ tipo: pg.ifc || 'IFCPIPESEGMENT', mid: 'edit', expressID: pg.id }) || ocultoSis(pg.sistema))) return;
var cxp = [0, 0, 0]; pg.pts.forEach(function (q) { cxp[0] += q[0] / pg.pts.length; cxp[1] += q[1] / pg.pts.length; cxp[2] += q[2] / pg.pts.length; });
var fc = fI(cxp); if (fc < loI - 1e-6 || fc > hiI + 1e-6) return;
var c2 = { pts: pg.pts.map(function (q) { return [telaX(q[0], q[1], q[2]), telaY(q[0], q[1], q[2])]; }), fechado: true,
inst: pg.oculto ? { k: 'p0alvo', pena: 1, cor: '#000000', padrao: 'continua', oculto: true }
: { k: pg.k, pena: pg.semContorno ? 1 : 4, cor: pg.semContorno ? pg.preenchCor : '#000000', padrao: 'continua', preench: 'solido', corPreench: pg.preenchCor } };
if (p6Tag) { c2.t = pg.ifc || 'IFCPIPESEGMENT'; c2.u = 'edit:' + pg.id; }
cortes.push(c2); instVet.solidos++;
});
if (instVet.sombra) {
try {
var SB = window.HidSombra, elsS = {}, ordS = [], trPorId = {}, nm3 = new THREE.Matrix3(), vtmp = new THREE.Vector3();
(Rr.trechos || []).forEach(function (tq) { trPorId[tq.id] = tq; });
var corPre = {}; (Fm.polys || []).forEach(function (pg) { if (pg.papel === 'tubo' && pg.sistema && pg.preenchCor && !corPre[pg.sistema]) corPre[pg.sistema] = pg.preenchCor; });
var corSisS = function (sis) { try { var c = new THREE.Color(corPre[sis] || (BimInst.SISTEMAS[sis] || {}).cor || '#888888'); return [c.r, c.g, c.b]; } catch (e) { return null; } };
modelRoot.traverse(function (m) {
var ud = m.userData || {};
if (!m.isMesh || !m.geometry || !ud.instPapel || ud.instUnif || !cadeiaVisivel(m)) return;
if (['tubo', 'conexao', 'peca', 'acessorio'].indexOf(ud.instPapel) < 0) return;
var sisM = sisDe['edit:' + ud.expressID];
if (p6Oc && (p6Oc(ud) || ocultoSis(sisM))) return;
var geo = m.geometry, pa = geo.attributes.position, na = geo.attributes.normal; if (!pa) return;
var e16 = m.matrixWorld.elements, A = pa.array, nV = pa.count, pos = new Float64Array(nV * 3), nrm = na ? new Float64Array(nV * 3) : null;
nm3.getNormalMatrix(m.matrixWorld);
for (var iv = 0; iv < nV; iv++) {
var x = A[iv * 3], y = A[iv * 3 + 1], z = A[iv * 3 + 2];
pos[iv * 3] = e16[0] * x + e16[4] * y + e16[8] * z + e16[12]; pos[iv * 3 + 1] = e16[1] * x + e16[5] * y + e16[9] * z + e16[13]; pos[iv * 3 + 2] = e16[2] * x + e16[6] * y + e16[10] * z + e16[14];
if (nrm) { vtmp.set(na.array[iv * 3], na.array[iv * 3 + 1], na.array[iv * 3 + 2]).applyMatrix3(nm3).normalize(); nrm[iv * 3] = vtmp.x; nrm[iv * 3 + 1] = vtmp.y; nrm[iv * 3 + 2] = vtmp.z; }
}
var idx = geo.index ? geo.index.array : (function () { var q = []; for (var k3 = 0; k3 < nV; k3++) q.push(k3); return q; })();
var mc = m.material && m.material.color ? [m.material.color.r, m.material.color.g, m.material.color.b] : null;
var kE = String(ud.expressID != null ? ud.expressID : m.uuid);
if (!elsS[kE]) {
var tq = trPorId[ud.expressID], ex2 = tq ? [(tq.p2.x - tq.p1.x) * r.x + (tq.p2.y - tq.p1.y) * r.y + (tq.p2.z - tq.p1.z) * r.z, -((tq.p2.x - tq.p1.x) * upv.x + (tq.p2.y - tq.p1.y) * upv.y + (tq.p2.z - tq.p1.z) * upv.z)] : null;
elsS[kE] = { id: kE, papel: ud.instPapel, eixo2d: ex2, malhas: [], ifc: ud.tipo || '' }; ordS.push(kE);
}
var baseS = SB.corBase(ud.instPapel, mc, instVet.sombra.cor, corSisS(sisM));
elsS[kE].malhas.push({ pos: pos, nrm: nrm, idx: idx, base: baseS });
elsS[kE].chave = (elsS[kE].chave ? elsS[kE].chave + ";" : "") + geo.uuid + "@" + Array.prototype.map.call(e16, function (v) { return Math.round(v * 1e5); }).join(",") + "#" + baseS.map(function (v) { return Math.round(v * 255); }).join(",");
});
var rS = SB.renderizar(ordS.map(function (k4) { return elsS[k4]; }), { O: [O.x, O.y, O.z], r: [r.x, r.y, r.z], up: [upv.x, upv.y, upv.z], dir: [dir.x, dir.y, dir.z] },
{ ppm: +def.instPpm || 1200, faixa: { f: fI, lo: loI, hi: hiI } });
instVet.imagens = rS.imagens.map(function (im) { return { x: im.x, y: im.y, w: im.w, h: im.h, ang: im.ang, href: SB.pngDe(im), u: 'edit:' + im.id, papel: im.papel }; }).filter(function (im) { return !!im.href; });
rS.arestas.forEach(function (ar) {
linhas.push(ar.seg.slice()); linhasIfc.push((elsS[ar.id] || {}).ifc || 'IFCPIPESEGMENT'); instVet.linhas++;
if (p6Tag) linhasUd.push({ t: (elsS[ar.id] || {}).ifc || 'IFCPIPESEGMENT', u: 'edit:' + ar.id, inst: ar.sil ? { k: 'p5silhueta', pena: 2, cor: '#1c1c1c', padrao: 'continua' } : { k: 'p5aresta', pena: 1, cor: '#1c1c1c', padrao: 'continua' } });
});
instVet.sombra.elementos = ordS.length; instVet.sombra.imagens = instVet.imagens.length; instVet.sombra.arestas = rS.arestas.length;
} catch (eS) { instVet.sombra.erro = String(eS && eS.message || eS); }
}
if (instVet.usado !== 'baixo') {
var defI = {}; Object.keys(def).forEach(function (kd) { defI[kd] = def[kd]; });
defI._soInst = true; defI.p6Tag = true; defI.acimaTopo = null;
if (planta) { defI.yCorte = topoI; defI.yFundo = (def.yFundo != null ? +def.yFundo : box.min.y) - 0.8; }
var usadoI = instVet.usado;
defI.p6Ocultar = function (ud) {
ud = ud || {};
if (!(ud.instPapel || ud.instFam) || ud.instUnif) return true;
if (ud.instPapel === 'tubo' || ud.instPapel === 'conexao' || ud.instPapel === 'peca') return true;
if (usadoI === 'medio' && ud.instPapel === 'acessorio') return true;
if (instVet.sombra && ud.instPapel === 'acessorio') return true;
if (ud.instPapel === 'acessorio' && ocultoSis(sisDe['edit:' + ud.expressID])) return true;
void usadoI;
return p6Oc ? !!p6Oc(ud) : false;
};
var rI = vista2d(defI);
if (rI && rI.ok) {
var estS = function (u) { if (sisDe[u]) return { k: 'p4acess', pena: 2, cor: '#000000', padrao: 'continua' }; return { k: 'louca', fundo: true, meioTom: true, pena: 2 }; };
(rI.cortes || []).forEach(function (c) { var es2 = estS(c.u); if (es2) c.inst = es2; if (!p6Tag) { delete c.t; delete c.u; } cortes.push(c); instVet.solidos++; });
(rI.linhas || []).forEach(function (l, il) {
var ud2 = (rI.linhasUd || [])[il] || {}, es3 = estS(ud2.u);
linhas.push(l); linhasIfc.push((rI.linhasIfc || [])[il] || ''); instVet.solidos++;
if (p6Tag) linhasUd.push(es3 ? { t: ud2.t, u: ud2.u, inst: es3 } : ud2);
});
}
}
} catch (eI) { instVet.erro = String(eI && eI.message || eI); }
}
var ms = Math.round(((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0));
if (p6Forro) {
cortes.forEach(function (c) { c.pts.forEach(function (q) { q[0] = -q[0]; }); });
linhas.forEach(function (q) { q[0] = -q[0]; q[2] = -q[2]; });
}
return { ok: true, tipo: planta ? 'planta' : 'corte', cortes: cortes, linhas: linhas, linhasUd: p6Tag ? linhasUd : undefined, linhasIfc: linhasIfc, linhasFase: Object.keys(linhasFase).length ? linhasFase : undefined,
instImagens: instVet && instVet.imagens && instVet.imagens.length ? instVet.imagens : undefined,
portas: portas.length ? portas : undefined,
acima: acimaTopo != null ? acima : undefined, acimaTopo: acimaTopo != null ? acimaTopo : undefined,
info: { ms: ms, malhas: nMalhas, triCortados: nTri, arestas: nAr, amostras: amostras, px: [W, H], pxPorMetro: Math.round(ppm * 10) / 10, uniao: uniaoInfo || undefined, nivelInst: instVet || undefined } };
}
function opPortaIfc(mid, eid) {
var mo = null; S.modelos.forEach(function (x) { if (x.mid === mid) mo = x; });
if (!mo) return '';
var cache = mo._portaOp || (mo._portaOp = {});
if (cache[eid] !== undefined) return cache[eid];
function v(o) { return o && o.value != null ? String(o.value) : (typeof o === 'string' ? o : ''); }
var op = '';
try {
if (S.api && S.api.GetLine) {
var el = S.api.GetLine(mid, eid, false); op = v(el && el.OperationType);
if (!op || /^(NOTDEFINED|USERDEFINED)$/.test(op)) {
var ft = mo.familias && mo.familias[eid];
if (ft && ft.tipoId != null) { var tp = S.api.GetLine(mid, ft.tipoId, false), o2 = v(tp && tp.OperationType); if (o2) op = o2; }
}
}
} catch (eOp) { op = ''; }
cache[eid] = op;
return op;
}
function portaIfcPlanta(lista) {
var SPi = window.SimboloPorta, m0 = lista[0]; if (!SPi || !m0) return null;
m0.updateMatrixWorld(true);
var e = m0.matrixWorld.elements, ex = [e[0], e[2]], ey = [e[4], e[6]], pts = [], y0 = Infinity, y1 = -Infinity, v = new THREE.Vector3();
lista.forEach(function (m) {
var pos = m.geometry && m.geometry.attributes && m.geometry.attributes.position; if (!pos) return;
var passo = Math.max(1, Math.floor(pos.count / 4000));
for (var i = 0; i < pos.count; i += passo) {
v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
pts.push([v.x, v.z]); if (v.y < y0) y0 = v.y; if (v.y > y1) y1 = v.y;
}
});
if (!pts.length) return null;
if (Math.hypot(ex[0], ex[1]) < 0.3) {
var bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
pts.forEach(function (p) { if (p[0] < bx0) bx0 = p[0]; if (p[0] > bx1) bx1 = p[0]; if (p[1] < bz0) bz0 = p[1]; if (p[1] > bz1) bz1 = p[1]; });
ex = (bx1 - bx0) >= (bz1 - bz0) ? [1, 0] : [0, 1]; ey = null;
} else if (Math.hypot(ey[0], ey[1]) < 0.3) ey = null;
var ent = SPi.entradaIfc(pts, ex, ey, opPortaIfc(m0.userData.mid, m0.userData.expressID));
if (!ent) return null;
var sp = SPi.gerar(ent);
return sp.ok ? { sp: sp, y0: y0, y1: y1 } : null;
}
function encadear(segs) {
var chave = function (p) { return Math.round(p[0] * 2000) + ',' + Math.round(p[1] * 2000); };
var mapa = {}, usado = new Array(segs.length), out = [];
segs.forEach(function (s, i) { [0, 1].forEach(function (j) { var k = chave(s[j]); (mapa[k] = mapa[k] || []).push(i); }); });
function proximo(p, atual) {
var lst = mapa[chave(p)] || [];
for (var i = 0; i < lst.length; i++) if (!usado[lst[i]] && lst[i] !== atual) return lst[i];
return -1;
}
for (var i = 0; i < segs.length; i++) {
if (usado[i]) continue;
usado[i] = true;
var pts = [segs[i][0], segs[i][1]];
var fim = pts[pts.length - 1], nx;
while ((nx = proximo(fim, -1)) >= 0) {
usado[nx] = true; var s = segs[nx];
var outra = chave(s[0]) === chave(fim) ? s[1] : s[0];
pts.push(outra); fim = outra;
}
var ini = pts[0];
while ((nx = proximo(ini, -1)) >= 0) {
usado[nx] = true; var s2 = segs[nx];
var outra2 = chave(s2[0]) === chave(ini) ? s2[1] : s2[0];
pts.unshift(outra2); ini = outra2;
}
var fechado = pts.length > 3 && chave(pts[0]) === chave(pts[pts.length - 1]);
if (fechado) pts.pop();
out.push({ pts: simplificar(pts, fechado), fechado: fechado });
}
return out;
}
function simplificar(pts, fechado) {
if (pts.length < 3) return pts;
var out = [], n = pts.length;
for (var i = 0; i < n; i++) {
var a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
if (!fechado && (i === 0 || i === n - 1)) { out.push(b); continue; }
var cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
var la = Math.hypot(b[0] - a[0], b[1] - a[1]), lc = Math.hypot(c[0] - b[0], c[1] - b[1]);
if (la > 1e-6 && lc > 1e-6 && Math.abs(cr) / (la * lc) < 1e-4) continue;
out.push(b);
}
return out.length >= 2 ? out : pts;
}
S._vista2d = vista2d;
plantaCfg.addEventListener('click', function (e) {
var b = e.target.closest('[data-q]'); if (!b) return; var k = b.getAttribute('data-q');
if (k === 'cancelar') { plantaCfg.style.display = 'none'; return; }
if (k !== 'gerar') return;
if (!planta.on || !planta.plane) { plantaCfg.style.display = 'none'; S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('regua', 15) : '') + ' Abra a Planta primeiro — o corte usa a altura do slider.'); return; }
var res = gerarPlantaTec({
y: planta.plane.constant,
escala: +plantaCfg.querySelector('[data-q="esc"]').value,
cotas: plantaCfg.querySelector('[data-q="cotas"]').checked,
prof: +plantaCfg.querySelector('[data-q="prof"]').value,
rotAlt: (cortePanel.querySelector('[data-c="v"]') || {}).textContent
});
plantaCfg.style.display = 'none';
if (!res) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('nota', 15) : '') + ' Carregue um modelo primeiro.'); return; }
ctecModal._res = res;
ctecModal._nomeArq = 'planta-baixa.png';
ctecModal._ajustar = function () { plantaCfg.style.display = 'flex'; };
ctecModal.querySelector('[data-r="img"]').src = res.url;
ctecModal.querySelector('[data-r="titulo"]').textContent = 'Planta baixa — ESC 1:' + res.escala + (res.ajustada ? ' (ajustada p/ caber)' : '') + (res.cotas ? ' · cotas automáticas' : '');
ctecModal.style.display = 'flex'; S._hint('');
});
var pav = { isolado: null, manual: false };
S.pav = pav;
function ehFuturo4d(m) {
var f = S._fut4d; if (!f) return false;
var id = m.userData.expressID;
return !!(f[m.userData.mid + ':' + id] || f[id]);
}
function ehAndamento4d(m) {
var a = S._and4d; if (!a) return false;
var id = m.userData.expressID;
return !!(a[m.userData.mid + ':' + id] || a[id]);
}
S._ehAndamento4d = ehAndamento4d;
function visiveisEfetivos() {
var v = 0;
modelRoot.children.forEach(function (g) { if (g.visible === false) return; (g.children || []).forEach(function (m) { if (m.visible) v++; }); });
return v;
}
var pavPanel = document.createElement('div');
pavPanel.style.cssText = 'position:absolute;left:10px;top:52px;z-index:4;display:none;flex-direction:column;gap:6px;background:var(--card-bg,#fff);border:1px solid var(--linha,#d3dce6);border-radius:var(--raio,12px);padding:11px 13px;color:var(--texto,#1a2b3c);font-size:12px;width:250px;max-height:55%;overflow:auto';
pavPanel.classList.add('bim-flut');
host.appendChild(pavPanel);
S.pavPanel = pavPanel;
function todasMalhas(fn) { modelRoot.children.forEach(function (g) { (g.children || []).forEach(fn); }); }
function pavLista() {
var mapa = {}, ordem = [];
S.modelos.forEach(function (mo) {
(mo.pavimentos || []).forEach(function (pv) {
var k = pv.nome.trim().toLowerCase();
if (!mapa[k]) { mapa[k] = { nome: pv.nome.trim(), uids: {}, y0: null, yMax: null, elev: null, n: 0 }; ordem.push(mapa[k]); }
pv.eids.forEach(function (eid) { if (!mapa[k].uids[mo.mid + ':' + eid]) { mapa[k].uids[mo.mid + ':' + eid] = 1; mapa[k].n++; } });
if (pv.y0 != null) {
if (mapa[k].y0 == null || pv.y0 < mapa[k].y0) mapa[k].y0 = pv.y0;
if (mapa[k].yMax == null || pv.y0 > mapa[k].yMax) mapa[k].yMax = pv.y0;
}
if (pv.elev != null && (mapa[k].elev == null || pv.elev < mapa[k].elev)) mapa[k].elev = pv.elev;
});
});
ordem.forEach(function (pv) { pv.spread = (pv.y0 != null && pv.yMax != null && (pv.yMax - pv.y0) > 1.5); });
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
var html = '<div style="display:flex;justify-content:space-between;align-items:center"><b>' + (typeof Icones !== 'undefined' ? Icones.get('niveis', 15) : '') + ' Pavimentos</b><button class="btn sm" data-p="todos" title="Mostrar todos os pavimentos de novo">' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Todos</button></div>';
if (!lst.length) {
html += '<div style="font-size:11px;color:var(--texto-fraco,#5b6b7c)">Este IFC não declara pavimentos (IfcBuildingStorey). Use a ' + (typeof Icones !== 'undefined' ? Icones.get('regua', 15) : '') + ' Planta com o slider de altura.</div>';
} else {
var base = null;
lst.forEach(function (pv) { if (pv.y0 != null && (base == null || pv.y0 < base)) base = pv.y0; });
lst.forEach(function (pv) {
var atv = pav.isolado === pv.nome;
var nivel = (pv.y0 != null && base != null) ? ' <span style="color:var(--texto-fraco,#5b6b7c);font-size:11px">nível +' + fmtDist(Math.max(0, pv.y0 - base)) + '</span>' : '';
html += '<div style="display:flex;align-items:center;gap:5px;border:1px solid ' + (atv ? corAtiva() : 'transparent') + ';border-radius:7px;padding:2px 4px">' +
'<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(pv.nome) + ' · ' + pv.n + ' elementos">' + esc(pv.nome) + nivel + '</span>' +
'<button class="btn sm" data-p="iso" data-n="' + esc(pv.nome) + '" title="Isolar este pavimento">' + (typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + '</button>' +
'<button class="btn sm" data-p="pl" data-n="' + esc(pv.nome) + '" title="Planta baixa deste pavimento">' + (typeof Icones !== 'undefined' ? Icones.get('regua', 15) : '') + '</button></div>';
});
html += '<div style="font-size:11px;color:var(--texto-fraco,#5b6b7c)">Isolar mostra só o que o IFC declara nesse andar — o que não está em pavimento nenhum também some. ' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Todos restaura.</div>';
}
pavPanel.innerHTML = html;
var bp2 = bar.querySelector('[data-b="pav"]'); if (bp2) { bp2.style.background = pav.isolado ? corAtiva() : ''; bp2.style.color = pav.isolado ? '#fff' : ''; bp2.style.outline = (pavPanel.style.display === 'flex') ? '2px solid #15803d' : ''; }
}
S._pavRender = pavRender;
function restaurarVisibilidade() {
pav.isolado = null; pav.manual = false;
if (window.BimSelInst && BimSelInst._limparOcultos) BimSelInst._limparOcultos();
if (S._limparRaioX) S._limparRaioX();
todasMalhas(function (m) { m.visible = !ehFuturo4d(m) && !ehRemovidoEd(m); });
pavRender();
}
S._restaurarVis = restaurarVisibilidade;
function isolarPavimento(nome) {
var lst = pavLista(), alvo = null;
for (var i = 0; i < lst.length; i++) if (lst[i].nome === nome) { alvo = lst[i]; break; }
if (!alvo) return false;
todasMalhas(function (m) { m.visible = !!alvo.uids[m.userData.mid + ':' + m.userData.expressID] && !ehFuturo4d(m) && !ehRemovidoEd(m); });
pav.isolado = alvo.nome; pav.manual = false; pavRender();
if (visiveisEfetivos() === 0) S._hint('🏢 "' + alvo.nome + '" isolado, mas nada visível — o pavimento pertence a um modelo desligado (religue no painel Modelos) ou não tem geometria/está no futuro do 4D. ' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Todos restaura.');
else S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('niveis', 15) : '') + ' Pavimento "' + alvo.nome + '" isolado. ' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Todos (painel 🏢) restaura.');
return true;
}
S._isolarPavimento = isolarPavimento;
function plantaPavimento(nome) {
var lst = pavLista(), alvo = null;
for (var i = 0; i < lst.length; i++) if (lst[i].nome === nome) { alvo = lst[i]; break; }
if (!alvo) return false;
isolarPavimento(alvo.nome);
if (!planta.on) setPlanta(true);
if (!planta.on) return false;
var y = (alvo.y0 != null ? alvo.y0 : planta.y0) + 1.2;
y = Math.max(planta.y0 + 0.05, Math.min(planta.y1 - 0.001, y));
var frac = (y - planta.y0) / ((planta.y1 - planta.y0) || 1);
var sl = cortePanel.querySelector('[data-c="alt"]'); if (sl) sl.value = Math.round(frac * 1000);
setAlturaCorte(frac);
var aviso = '';
if (alvo.y0 == null) aviso = ' ' + (typeof Icones !== 'undefined' ? Icones.get('alerta', 15) : '') + ' Este pavimento não tem geometria própria — o corte ficou na base do modelo.';
else if (alvo.spread) aviso = ' ' + (typeof Icones !== 'undefined' ? Icones.get('alerta', 15) : '') + ' Há "' + alvo.nome + '" em cotas diferentes entre os modelos — parte pode ficar acima do corte (ajuste no slider).';
S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('regua', 15) : '') + ' Planta do pavimento "' + alvo.nome + '".' + aviso + ' Ajuste fino no slider; ' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Todos (painel 🏢) traz o prédio de volta.');
return true;
}
S._plantaPavimento = plantaPavimento;
pavPanel.addEventListener('click', function (e) {
var b = e.target.closest('[data-p]'); if (!b) return; var k = b.getAttribute('data-p');
if (k === 'todos') { restaurarVisibilidade(); S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('niveis', 15) : '') + ' Todos os pavimentos visíveis.'); }
else if (k === 'iso') isolarPavimento(b.getAttribute('data-n'));
else if (k === 'pl') plantaPavimento(b.getAttribute('data-n'));
});
function togglePavPanel() {
var abrir = (pavPanel.style.display === 'none' || !pavPanel.style.display);
fecharPaineis(abrir ? pavPanel : null);
pavPanel.style.display = abrir ? 'flex' : 'none';
if (abrir) pavRender(); else { var bp3 = bar.querySelector('[data-b="pav"]'); if (bp3) bp3.style.outline = ''; }
}
var visPanel = document.createElement('div');
visPanel.style.cssText = 'position:absolute;right:10px;top:52px;z-index:4;display:none;flex-direction:column;gap:6px;background:var(--card-bg,#fff);border:1px solid var(--linha,#d3dce6);border-radius:var(--raio,12px);padding:11px 13px;color:var(--texto,#1a2b3c);font-size:12px;width:220px';
visPanel.classList.add('bim-flut');
visPanel.innerHTML =
'<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>' + (typeof Icones !== 'undefined' ? Icones.get('olho', 15) : '') + ' Visibilidade</b>' +
'<button class="btn sm" data-v="fechar" title="Fechar este painel" style="padding:2px 8px;line-height:1.2">' + (typeof Icones !== 'undefined' ? Icones.get('fechar', 15) : '') + '</button></div>' +
'<button class="btn sm" data-v="iso" title="Esconde tudo, menos o elemento selecionado">' + (typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + ' Isolar seleção</button>' +
'<button class="btn sm" data-v="occ" title="Esconde o elemento selecionado">' + (typeof Icones !== 'undefined' ? Icones.get('olhoFechado', 15) : '') + ' Ocultar seleção</button>' +
'<button class="btn sm" data-v="tipo" title="Mostra só os elementos do MESMO tipo do selecionado (ex.: todas as paredes)">' + (typeof Icones !== 'undefined' ? Icones.get('quebracabeca', 15) : '') + ' Só este tipo</button>' +
'<button class="btn sm" data-v="rx" title="Raio-X: deixa o resto translúcido (não some) e destaca o elemento. Enxergue o que está atrás/dentro.">' + (typeof Icones !== 'undefined' ? Icones.get('camadas', 15) : '') + ' Raio-X da seleção</button>' +
'<button class="btn sm" data-v="rxt" title="Raio-X por tipo: destaca todos deste tipo (ex.: toda a hidráulica) e translucidez o resto — bom pra ver onde há cano antes de furar.">' + (typeof Icones !== 'undefined' ? Icones.get('camadas', 15) : '') + ' Raio-X deste tipo</button>' +
'<button class="btn sm" data-v="tudo" title="Volta a mostrar tudo">' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Restaurar tudo</button>' +
'<div style="font-size:11px;color:var(--texto-fraco,#5b6b7c)">Dê <b>dois cliques</b> num elemento do modelo pra selecionar antes.</div>';
host.appendChild(visPanel);
S.visPanel = visPanel;
function selInfo() { return (S.selected && S.selected.userData && S.selected.userData.expressID != null) ? { mid: S.selected.userData.mid, eid: S.selected.userData.expressID, tipo: S.selected.userData.tipo } : null; }
function isolarSelecao() {
var si = selInfo(); if (!si) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('olho', 15) : '') + ' Dê dois cliques num elemento do modelo primeiro.'); return; }
todasMalhas(function (m) { m.visible = (m.userData.mid === si.mid && m.userData.expressID === si.eid) && !ehFuturo4d(m) && !ehRemovidoEd(m); });
pav.isolado = null; pav.manual = true; pavRender();
if (visiveisEfetivos() === 0) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + ' Isolado, mas nada visível — o modelo desse elemento está desligado no painel Modelos. ' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Restaurar tudo volta o modelo.');
else S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + ' Elemento isolado. ' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Restaurar tudo (painel 👁) volta o modelo.');
}
S._isolarSelecao = isolarSelecao;
function ocultarSelecao() {
var si = selInfo(); if (!si) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('olho', 15) : '') + ' Dê dois cliques num elemento do modelo primeiro.'); return; }
if (S.selected) { S.selected.material = S.prevMat; S.selected = null; S.prevMat = null; contornoSelecao(null); if (opts.onPick) { try { opts.onPick(null); } catch (_) {} } }
todasMalhas(function (m) { if (m.userData.mid === si.mid && m.userData.expressID === si.eid) m.visible = false; });
pav.manual = true;
S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('olhoFechado', 15) : '') + ' Elemento oculto. ' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Restaurar tudo (painel 👁) traz de volta.');
}
S._ocultarSelecao = ocultarSelecao;
function isolarTipo() {
var si = selInfo(); if (!si) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('olho', 15) : '') + ' Dê dois cliques num elemento do modelo primeiro.'); return; }
todasMalhas(function (m) { m.visible = (m.userData.tipo === si.tipo) && !ehFuturo4d(m) && !ehRemovidoEd(m); });
pav.isolado = null; pav.manual = true; pavRender();
if (visiveisEfetivos() === 0) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('quebracabeca', 15) : '') + ' Só "' + rotuloDisciplina(si.tipo) + '", mas nada visível — o modelo está desligado no painel Modelos. ' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Restaurar tudo volta.');
else S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('quebracabeca', 15) : '') + ' Mostrando só "' + rotuloDisciplina(si.tipo) + '". ' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Restaurar tudo volta o modelo.');
}
S._isolarTipo = isolarTipo;
var xray = { on: false, ghosted: [] };
var _ghostMat = null;
function ghostMat() { if (!_ghostMat) _ghostMat = new THREE.MeshStandardMaterial({ color: 0x93a7bd, transparent: true, opacity: .1, depthWrite: false, metalness: 0, roughness: 1, side: THREE.DoubleSide }); return _ghostMat; }
function limparRaioX() { if (!xray.on) return; xray.ghosted.forEach(function (m) { m.material = ehAndamento4d(m) ? S.matAndamento : matBase(m); }); xray.ghosted = []; xray.on = false; }
S._limparRaioX = limparRaioX;
function aplicarRaioX(ehAlvo, msg) {
limparRaioX();
xray.on = true;
var nAlvo = 0;
todasMalhas(function (m) {
if (m.userData.expressID == null) return;
if (ehFuturo4d(m) || ehRemovidoEd(m) || !m.visible) return;
if (ehAlvo(m)) { nAlvo++; return; }
m.material = ghostMat(); xray.ghosted.push(m);
});
if (!nAlvo) { limparRaioX(); S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('camadas', 15) : '') + ' Nada correspondeu ao alvo do raio-X.'); return 0; }
S._hint(msg);
return nAlvo;
}
function raioXSelecao() {
var si = selInfo(); if (!si) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('olho', 15) : '') + ' Dê dois cliques num elemento primeiro.'); return; }
aplicarRaioX(function (m) { return m.userData.mid === si.mid && m.userData.expressID === si.eid; }, '' + (typeof Icones !== 'undefined' ? Icones.get('camadas', 15) : '') + ' Raio-X: elemento em destaque, resto translúcido. ' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Restaurar tudo volta.');
if (S.selected) contornoSelecao(S.selected);
}
function raioXTipo() {
var si = selInfo(); if (!si) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('olho', 15) : '') + ' Dê dois cliques num elemento primeiro.'); return; }
aplicarRaioX(function (m) { return m.userData.tipo === si.tipo; }, '' + (typeof Icones !== 'undefined' ? Icones.get('camadas', 15) : '') + ' Raio-X de "' + rotuloDisciplina(si.tipo) + '": resto translúcido — bom pra ver onde há cano/eletroduto antes de furar. ' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Restaurar tudo volta.');
}
S._raioXSelecao = raioXSelecao; S._raioXTipo = raioXTipo;
function raioXChaves(chaves, msg) {
var alvo = {};
uidsDeChaves(chaves).forEach(function (u) { alvo[u] = 1; });
return aplicarRaioX(function (m) { return !!alvo[m.userData.mid + ':' + m.userData.expressID]; },
msg || ('' + (typeof Icones !== 'undefined' ? Icones.get('camadas', 15) : '') + ' Raio-X: o grupo em destaque, o resto translúcido. ' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Restaurar tudo volta.')) || 0;
}
S._raioXChaves = raioXChaves;
visPanel.addEventListener('click', function (e) {
var b = e.target.closest('[data-v]'); if (!b) return; var k = b.getAttribute('data-v');
if (k === 'fechar') { visPanel.style.display = 'none'; var bvF = bar.querySelector('[data-b="vis"]'); if (bvF) bvF.style.outline = ''; return; }
if (k === 'iso') isolarSelecao();
else if (k === 'occ') ocultarSelecao();
else if (k === 'tipo') isolarTipo();
else if (k === 'rx') raioXSelecao();
else if (k === 'rxt') raioXTipo();
else if (k === 'tudo') { restaurarVisibilidade(); S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Tudo visível de novo.'); }
});
function toggleVisPanel() {
var abrir = (visPanel.style.display === 'none' || !visPanel.style.display);
fecharPaineis(abrir ? visPanel : null);
visPanel.style.display = abrir ? 'flex' : 'none';
var bv = bar.querySelector('[data-b="vis"]'); if (bv) bv.style.outline = abrir ? '2px solid var(--aco,#2d6a9c)' : '';
}
function fecharPaineis(exceto) {
if (exceto && edit && edit.on && typeof setEdit === 'function') setEdit(false);
[snapPanel, pavPanel, visPanel, xrPanel, sisPanel, blocokPanel, reqPanel].forEach(function (pn) { if (pn && pn !== exceto) pn.style.display = 'none'; });
if (blocokPanel !== exceto) { var bbk = bar.querySelector('[data-b="blocok"]'); if (bbk) { bbk.style.background = ''; bbk.style.color = ''; } }
pintarSnapPanel();
var bp4 = bar.querySelector('[data-b="pav"]'); if (bp4 && pavPanel.style.display !== 'flex') bp4.style.outline = '';
var bv2 = bar.querySelector('[data-b="vis"]'); if (bv2 && visPanel.style.display !== 'flex') bv2.style.outline = '';
}
S._fecharPaineis = fecharPaineis;
function porFechadorNoPainel(pn) {
if (!pn || pn.querySelector('[data-pnl-fechar]')) return;
var x = document.createElement('button');
x.className = 'btn sm';
x.setAttribute('data-pnl-fechar', '1');
x.title = 'Fechar este painel';
x.textContent = '✕';
x.style.cssText = 'position:absolute;right:7px;top:7px;z-index:2;padding:1px 7px;line-height:1.25;font-size:12px;opacity:.9';
x.addEventListener('click', function (ev) { ev.stopPropagation(); pn.style.display = 'none'; fecharPaineis(null); });
pn.style.paddingRight = '30px';
pn.appendChild(x);
}
[snapPanel, pavPanel, sisPanel, blocokPanel].forEach(function (pn) {
if (!pn) return;
porFechadorNoPainel(pn);
if (typeof MutationObserver === 'function') {
new MutationObserver(function () { porFechadorNoPainel(pn); }).observe(pn, { childList: true });
}
});
function ajustarTopFlutuantes() {
var bh = (bar && bar.offsetHeight) || 0;
var t = bh ? bh + 8 : (ehTelaPequena ? 8 : 44);
var o0 = (S && S.opts) || opts || {};
if (o0.topoReservado > t) t = o0.topoReservado;
[hint, snapPanel, pavPanel, visPanel, xrPanel].forEach(function (el) { if (el) el.style.top = t + 'px'; });
if (hint && trava.on) hint.style.top = Math.max(t, (o0.topoReservado || 0) + 46) + 'px';
if (xrPanel) { xrPanel.style.width = ehTelaPequena ? 'calc(100% - 20px)' : '250px'; xrPanel.style.maxWidth = '340px'; xrPanel.style.boxSizing = 'border-box'; }
if (xrPanel && o0.baseReservada > 0) xrPanel.style.maxHeight = 'calc(100% - ' + (t + o0.baseReservada + 10) + 'px)';
[snapPanel, pavPanel, visPanel, xrPanel].forEach(function (el) { if (el) { el.style.left = "auto"; el.style.right = "10px"; el.style.zIndex = "7"; } });
}
S._ajustarTop = ajustarTopFlutuantes;
ajustarTopFlutuantes();
window.addEventListener('resize', ajustarTopFlutuantes);
function thumbFamilia(uid, maxPx) {
try {
if (!S.modelos.length) return null;
var px = uid.lastIndexOf(':'); if (px < 0) return null;
var midStr = uid.slice(0, px), eidRaw = uid.slice(px + 1);
var alvoEid = /^\d+$/.test(eidRaw) ? +eidRaw : eidRaw;
var alvoMid = /^\d+$/.test(midStr) ? +midStr : midStr;
var mo = modeloDe(alvoMid); if (!mo) return null;
var elA = (mo.elementos || []).filter(function (e) { return e.id === alvoEid; })[0];
var aabb = elA && elA.aabb; if (!aabb) return null;
var visAntes = [], matAntes = [];
cadaMalha(function (m) {
visAntes.push([m, m.visible]);
var ehAlvo = (m.userData.mid === alvoMid && m.userData.expressID === alvoEid);
m.visible = ehAlvo;
if (ehAlvo && m.userData.matOrig && m.material !== m.userData.matOrig) { matAntes.push([m, m.material]); m.material = m.userData.matOrig; }
});
var gAntes = []; modelRoot.children.forEach(function (g) { gAntes.push([g, g.visible]); g.visible = true; });
if (S._edgesEstilo) S._edgesEstilo(false);
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
scene.background = new THREE.Color(0xf3f6fa);
renderer.render(scene, camera);
var srcCnv = cvDesenho(), lado = Math.min(srcCnv.width, srcCnv.height);
var out = document.createElement('canvas'); var mp = maxPx || 220; out.width = mp; out.height = mp;
out.getContext('2d').drawImage(srcCnv, (srcCnv.width - lado) / 2, (srcCnv.height - lado) / 2, lado, lado, 0, 0, mp, mp);
thumb = out.toDataURL('image/jpeg', 0.85);
} catch (_) { thumb = null; }
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
S._propsCompletas = function (uid) {
try {
var px = uid.lastIndexOf(':'); if (px < 0) return [];
var midStr = uid.slice(0, px), eidRaw2 = uid.slice(px + 1);
var eid2 = /^\d+$/.test(eidRaw2) ? +eidRaw2 : eidRaw2;
var mid2 = /^\d+$/.test(midStr) ? +midStr : midStr;
var gr = propsCompletas(mid2, eid2);
try {
var moX = modeloDe(mid2), elX = moX ? (moX.elementos || []).filter(function (e) { return e.id === eid2; })[0] : null;
var gidX = elX && elX.globalId, ex = gidX && S._extrasPorGuid ? S._extrasPorGuid[gidX] : null;
if (ex) Object.keys(ex.grupos || {}).forEach(function (g) {
var o = ex.grupos[g] || {};
gr.push({ pset: ex.programa + ' › ' + g, origem: /tipo/i.test(g) ? 'tipo' : 'instância', props: Object.keys(o).map(function (k) { return { n: k, v: String(o[k]) }; }) });
});
var oe = elX && elX.origemExterna;
if (oe) {
gr.push({ pset: (oe.programa || 'Outro programa') + ' › identidade', origem: 'instância', props: [{ n: 'Componente', v: oe.componente || '—' }, { n: 'Etiqueta (tag)', v: oe.etiqueta || '—' }, { n: 'Material', v: oe.material || '—' }].concat(oe.guid ? [{ n: 'Id de origem', v: oe.guid }] : []) });
Object.keys(oe.atributos || {}).forEach(function (dic) {
var a = oe.atributos[dic] || {};
gr.push({ pset: (oe.programa || 'Outro programa') + ' › ' + dic, origem: 'instância', props: Object.keys(a).map(function (k) { return { n: k, v: String(a[k]) }; }) });
});
}
} catch (eX) {}
return gr;
} catch (e) { return []; }
};
function contarMalhasVisiveis() {
var n = 0, filhos = modelRoot.children;
for (var i = 0; i < filhos.length; i++) {
var g = filhos[i];
if (g.visible === false) continue;
var ms = g.children;
for (var j = 0; j < ms.length; j++) if (ms[j].visible) n++;
}
return n;
}
function contarVisiveis() {
var visSet = {};
modelRoot.children.forEach(function (g) {
if (g.visible === false) return;
(g.children || []).forEach(function (m) {
if (m.visible && m.userData.expressID != null) visSet[m.userData.mid + ':' + m.userData.expressID] = 1;
});
});
return Object.keys(visSet).length;
}
function totalElementos() { var t2 = 0; S.modelos.forEach(function (mo) { t2 += mo.nEl || 0; }); return t2; }
S._contarVisiveis = contarVisiveis;
S._contarMalhasVisiveis = contarMalhasVisiveis;
function totalElementos() { var t2 = 0; S.modelos.forEach(function (mo) { t2 += mo.nEl || 0; }); return t2; }
S._contarVisiveis = contarVisiveis;
function rotuloElementos() {
var tot = totalElementos();
var nv = contarVisiveis();
var cortado = (renderer.clippingPlanes || []).length > 0;
return nv < tot ? (nv + ' de ' + tot + ' elementos (vista filtrada)')
: (cortado ? (tot + ' elementos (vista cortada)') : (tot + ' elementos'));
}
S._rotuloElementos = rotuloElementos;
function desenharQuadro(fundo) {
if (!S || !S.alive || !renderer) return null;
var prevBg = scene.background;
var vLn = _selLn ? _selLn.visible : null;
try {
if (fundo) scene.background = new THREE.Color(fundo);
if (_selLn) _selLn.visible = false;
renderer.render(scene, camera);
} catch (e) { return null; }
finally { scene.background = prevBg; if (_selLn && vLn !== null) _selLn.visible = vLn; }
return cvDesenho();
}
S._desenharQuadro = desenharQuadro;
function desenharQuadroEm(fundo, larg, alt, opts) {
opts = opts || {};
larg = Math.round(+larg || 0); alt = Math.round(+alt || 0);
if (!S || !S.alive || !renderer || larg < 8 || alt < 8) return null;
var prevBg = scene.background, vLn = _selLn ? _selLn.visible : null;
var vSolo = solo.grupo ? solo.grupo.visible : null;
var pr = renderer.getPixelRatio(), asp = camera.aspect, fov = camera.fov, out = null;
try {
if (fundo) scene.background = new THREE.Color(fundo);
if (_selLn) _selLn.visible = false;
if (opts.semSolo !== false && solo.grupo) solo.grupo.visible = false;
renderer.setPixelRatio(1); renderer.setSize(larg, alt, false);
var na = larg / alt;
if (na < asp) camera.fov = 2 * Math.atan(Math.tan(fov * Math.PI / 360) * asp / na) * 180 / Math.PI;
camera.aspect = na; camera.updateProjectionMatrix();
renderer.render(scene, camera);
out = document.createElement('canvas'); out.width = larg; out.height = alt;
out.getContext('2d').drawImage(cvDesenho(), 0, 0);
} catch (e) { out = null; }
finally {
scene.background = prevBg; if (_selLn && vLn !== null) _selLn.visible = vLn;
if (solo.grupo && vSolo !== null) solo.grupo.visible = vSolo;
camera.fov = fov; camera.aspect = asp; camera.updateProjectionMatrix();
renderer.setPixelRatio(pr);
if (S._resize) S._resize();
try { renderer.render(scene, camera); } catch (e2) {}
}
return out;
}
S._desenharQuadroEm = desenharQuadroEm;
function tirarFoto() {
if (!S.modelos.length) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('camera', 15) : '') + ' Carregue um modelo primeiro.'); return null; }
var prevBg = scene.background, url;
var vLn = _selLn ? _selLn.visible : null;
try {
scene.background = new THREE.Color(estiloD.on ? 0xffffff : 0x0d1f33);
if (_selLn) _selLn.visible = false;
renderer.render(scene, camera);
url = cvDesenho().toDataURL('image/png');
} catch (_) { url = null; } finally { scene.background = prevBg; if (_selLn && vLn !== null) _selLn.visible = vLn; }
if (!url) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('camera', 15) : '') + ' Não consegui capturar a imagem.'); return null; }
var img = new Image();
img.onload = function () {
try {
var faixa = 44, cnv = document.createElement('canvas');
cnv.width = img.width; cnv.height = img.height + faixa;
var g2 = cnv.getContext('2d');
g2.drawImage(img, 0, 0);
g2.fillStyle = '#0b1a2b'; g2.fillRect(0, img.height, cnv.width, faixa);
var rotEl = rotuloElementos();
g2.fillStyle = '#15803d'; g2.font = 'bold 16px Segoe UI, Arial';
g2.fillText((((typeof Empresa!=='undefined'&&Empresa.nomeDoc&&Empresa.nomeDoc())||'') ? ((typeof Empresa!=='undefined'&&Empresa.nomeDoc&&Empresa.nomeDoc())||'') + ' · ' : '') + ((typeof Empresa!=='undefined'&&Empresa.creditoTexto&&Empresa.creditoTexto())?'OrçaPRO BIM · ':'') + new Date().toLocaleString('pt-BR') + ' · ' + rotEl + (pav.isolado ? ' · pavimento: ' + pav.isolado : ''), 12, img.height + 28);
try {
var sDisc = window.BimDisciplinas && BimDisciplinas.selo ? BimDisciplinas.selo() : null;
if (sDisc) {
g2.font = 'bold 13px Segoe UI, Arial';
var wS = g2.measureText(sDisc.texto).width + 24, xS = cnv.width - wS - 10, yS = img.height + 10;
g2.fillStyle = sDisc.cor; g2.fillRect(xS, yS, wS, 24);
g2.fillStyle = sDisc.textoCor; g2.fillText(sDisc.texto, xS + 12, yS + 17);
}
} catch (_) {}
var a2 = document.createElement('a'); a2.href = cnv.toDataURL('image/png'); a2.download = 'bim-foto.png'; a2.click();
S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('camera', 15) : '') + ' Foto salva (bim-foto.png).');
} catch (_) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('camera', 15) : '') + ' Não consegui montar o arquivo da foto.'); }
};
img.src = url;
return url;
}
S._tirarFoto = tirarFoto;
var EYE = 1.6;
var xr = { on: false, mode: null, escala: 1, session: null, hitSrc: null, reticle: null,
placed: false, travado: false, prevClip: null, clip: null, prevLocal: false,
cam: null, look: { yaw: 0, pitch: 0 }, joy: { x: 0, z: 0 }, ori: false, oriBase: null,
oriQuat: null, oriOk: false, oriYawOff: 0,
boxOrig: null, posOrig: null,
modelSnap: null, medir: { on: false, pts: [], objs: [] }, discOcultas: {} };
S.xr = xr;
var xrPanel = document.createElement('div');
xrPanel.style.cssText = 'position:absolute;left:10px;top:52px;z-index:5;display:none;flex-direction:column;gap:8px;background:var(--card-bg,#fff);border:1px solid var(--linha,#d3dce6);border-radius:12px;padding:12px 13px;color:var(--texto,#1a2b3c);font-size:12px;width:250px;max-height:78vh;overflow:auto';
xrPanel.classList.add('bim-flut');
host.appendChild(xrPanel);
S.xrPanel = xrPanel;
var xrHud = document.createElement('div');
xrHud.style.cssText = 'position:absolute;inset:0;z-index:6;display:none;pointer-events:none';
try {
new MutationObserver(function () {
if (S && S.barToggle) S.barToggle.style.visibility = (xrHud.style.display !== 'none') ? 'hidden' : '';
}).observe(xrHud, { attributes: true, attributeFilter: ['style'] });
} catch (eMo) {}
host.appendChild(xrHud);
S.xrHud = xrHud;
function xrSupport(modo) { return !!(navigator.xr && navigator.xr.isSessionSupported) ? navigator.xr.isSessionSupported(modo).catch(function () { return false; }) : Promise.resolve(false); }
function pintarXRPanel() {
var box = new THREE.Box3().setFromObject(modelRoot);
var vazio = box.isEmpty();
var discs = disciplinasPresentes();
var html = '<div style="display:flex;justify-content:space-between;align-items:center"><b>' + (typeof Icones !== 'undefined' ? Icones.get('vr', 15) : '') + ' Realidade Mista / Virtual</b><button class="btn sm" data-x="fechar" title="Fechar painel">' + (typeof Icones !== 'undefined' ? Icones.get('fechar', 15) : '') + '</button></div>';
if (vazio) { html += '<div style="font-size:11px;color:var(--texto-fraco,#5b6b7c)">Carregue um modelo primeiro.</div>'; xrPanel.innerHTML = html; return; }
if (!xr.on) {
var ql = quickLookAqui();
var pavsXR = (S._pavLista ? S._pavLista() : []).map(function (x) { return x.nome; });
if (discs.length > 1 || pavsXR.length > 1) {
html += '<div style="font-size:11px;color:var(--texto-fraco,#5b6b7c);margin-top:2px">O que aparece (vale para todos os modos):</div>';
if (discs.length > 1) {
html += '<div style="display:flex;flex-wrap:wrap;gap:5px">';
discs.forEach(function (d) { var off = !!xr.discOcultas[d.chave]; html += '<button class="btn sm" data-xd="' + esc(d.chave) + '" style="' + (off ? 'opacity:.45' : 'background:' + corAtiva() + ';color:#fff') + '">' + esc(d.nome) + '</button>'; });
html += '</div>';
}
if (pavsXR.length > 1) {
html += '<label style="display:flex;justify-content:space-between;align-items:center;gap:6px">Pavimento <select data-x="pavxr" class="inp" style="flex:1;min-width:0"><option value="">Todos</option>' +
pavsXR.map(function (nm) { return '<option value="' + esc(nm) + '"' + (pav.isolado === nm ? ' selected' : '') + '>' + esc(nm) + '</option>'; }).join('') + '</select></label>';
}
}
var android = /Android/i.test(navigator.userAgent || '') && !!(S.opts && S.opts.onSceneViewer);
html += '<button class="btn sm longo" data-x="ratrava" style="width:100%;' + (raTrava ? 'background:var(--aco,#2d6a9c);color:#fff' : '') + '">' +
(raTrava ? (typeof Icones !== 'undefined' ? Icones.get('cadeado', 15) : '') + ' RA travada: encostar a mão não muda o tamanho nem tira do lugar' : (typeof Icones !== 'undefined' ? Icones.get('destravado', 15) : '') + ' RA livre: a pinça muda o tamanho da maquete') + '</button>';
html += '<div style="font-size:11px;color:var(--texto-fraco,#5b6b7c)">Veja o projeto no ambiente ou ande dentro dele. Escolha o modo:</div>' +
(ql ? '<button class="btn sm primary longo" data-x="quicklook" data-ql="real" style="width:100%">' + (typeof Icones !== 'undefined' ? Icones.get('celular', 15) : '') + ' RA do iPhone — no chão, tamanho real</button>' +
'<button class="btn sm longo" data-x="quicklook" data-ql="maquete" style="width:100%">' + (typeof Icones !== 'undefined' ? Icones.get('celular', 15) : '') + ' RA do iPhone — maquete na mesa</button>' : '') +
(android ? '<button class="btn sm primary longo" data-x="sceneviewer" data-ql="real" style="width:100%">' + (typeof Icones !== 'undefined' ? Icones.get('celular', 15) : '') + ' RA do Android (app do Google) — tamanho real</button>' +
'<button class="btn sm longo" data-x="sceneviewer" data-ql="maquete" style="width:100%">' + (typeof Icones !== 'undefined' ? Icones.get('celular', 15) : '') + ' RA do Android — maquete na mesa</button>' : '') +
'<button class="btn sm ' + (ql || android ? '' : 'primary ') + 'longo" data-x="camera" style="width:100%">' + (typeof Icones !== 'undefined' ? Icones.get('camera', 15) : '') + ' Câmera + Projeto (ver no seu ambiente)</button>' +
'<button class="btn sm longo" data-x="caminhar" style="width:100%">' + (typeof Icones !== 'undefined' ? Icones.get('caminhar', 15) : '') + ' Caminhar no projeto (fundo liso)</button>' +
(ql ? '' : '<button class="btn sm longo" data-x="ar" style="width:100%" disabled>' + (typeof Icones !== 'undefined' ? Icones.get('celular', 15) : '') + ' RA com âncora (Android) <span data-x="arst" style="color:var(--texto-fraco,#5b6b7c)">(verificando…)</span></button>') +
'<button class="btn sm longo" data-x="vr" style="width:100%" disabled>' + (typeof Icones !== 'undefined' ? Icones.get('vr', 15) : '') + ' VR imersivo <span data-x="vrst" style="color:var(--texto-fraco,#5b6b7c)">(verificando…)</span></button>' +
(ql
? '<div style="font-size:11px;color:var(--texto-fraco,#5b6b7c);line-height:1.35"><b>RA do iPhone</b>: abre a realidade aumentada do próprio iPhone — o projeto fica preso no chão enquanto você anda em volta. Nada é instalado e o arquivo não sai do aparelho.</div>'
: '<div style="font-size:11px;color:var(--texto-fraco,#5b6b7c);line-height:1.35">📷 <b>funciona no iPhone e Android</b>: liga a câmera e o projeto aparece no ambiente real — mova o celular pra olhar, joystick pra chegar perto (precisa HTTPS: use o link ' + (typeof Icones !== 'undefined' ? Icones.get('nuvem', 15) : '') + ' da nuvem). ' + (typeof Icones !== 'undefined' ? Icones.get('celular', 15) : '') + ' RA com âncora (fixa no chão): Android com ARCore; no iPhone, pela RA do iPhone.</div>');
} else {
var em = xr.mode === 'ar' ? '' + (typeof Icones !== 'undefined' ? Icones.get('celular', 15) : '') + ' RA no ambiente' : xr.mode === 'vr' ? '' + (typeof Icones !== 'undefined' ? Icones.get('vr', 15) : '') + ' VR imersivo' : xr.mode === 'camera' ? '' + (typeof Icones !== 'undefined' ? Icones.get('camera', 15) : '') + ' Câmera + Projeto' : '' + (typeof Icones !== 'undefined' ? Icones.get('caminhar', 15) : '') + ' Caminhando';
html += '<div style="font-size:11px;color:var(--aco,#2d6a9c)"><b>' + em + '</b> ativo</div>';
if (xr.mode === 'ar') {
var ESCS = [['1', '1:1 (real)'], ['0.04', '1:25'], ['0.02', '1:50'], ['0.01', '1:100'], ['0.005', '1:200']];
html += '<label style="display:flex;justify-content:space-between;align-items:center">Escala <select data-x="esc" class="inp" style="width:120px">' +
ESCS.map(function (o) { return '<option value="' + o[0] + '"' + (Math.abs(parseFloat(o[0]) - (xr.escala || 1)) < 1e-6 ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>';
} else {
var real = (xr.escala || 1) >= 0.999;
var ESCS2 = [['1', '1:1 real (andar dentro)'], ['fit', 'Caber na sala (auto)'], ['0.04', '1:25'], ['0.02', '1:50'], ['0.01', '1:100'], ['0.005', '1:200']];
var selNum = null; if (!real) { for (var _i = 2; _i < ESCS2.length; _i++) { if (Math.abs(parseFloat(ESCS2[_i][0]) - (xr.escala || 1)) < 1e-4) { selNum = ESCS2[_i][0]; break; } } }
var selVal = real ? '1' : (selNum || 'fit');
html += '<label style="display:flex;justify-content:space-between;align-items:center">Escala <select data-x="esc2" class="inp" style="width:150px">' +
ESCS2.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === selVal ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
'<div style="display:flex;gap:6px">' +
'<button class="btn sm" data-x="centralizar" style="flex:1">' + (typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + ' Centralizar</button>' +
'<button class="btn sm" data-x="travarcam" style="flex:1">' + (xr.travado ? '' + (typeof Icones !== 'undefined' ? Icones.get('destravado', 15) : '') + ' Destravar' : '' + (typeof Icones !== 'undefined' ? Icones.get('cadeado', 15) : '') + ' Travar') + '</button></div>' +
'<div style="font-size:11px;color:var(--texto-fraco,#5b6b7c);line-height:1.3">1:1 = andar DENTRO em tamanho real. Miniatura = ver o projeto inteiro na sua frente. ' + (typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + ' recoloca à frente; ' + (typeof Icones !== 'undefined' ? Icones.get('cadeado', 15) : '') + ' fixa no lugar.</div>';
}
var cf = (xr.cortefrac == null ? 1000 : xr.cortefrac);
html += '<div style="display:flex;justify-content:space-between;align-items:baseline"><span>' + (typeof Icones !== 'undefined' ? Icones.get('corte', 15) : '') + ' Teto de visão</span><span data-x="cortev" style="color:#15803d">' + (cf >= 999 ? 'inteiro' : '') + '</span></div>' +
'<input type="range" data-x="corte" min="0" max="1000" value="' + cf + '" style="width:100%;accent-color:var(--aco,#2d6a9c)">';
if (xr.mode !== 'ar' && xr.mode !== 'vr') {
var ps = Math.round(_passSens() * 100);
html += '<div style="display:flex;justify-content:space-between;align-items:baseline"><span>' + (typeof Icones !== 'undefined' ? Icones.get('caminhar', 15) : '') + ' Sensibilidade dos passos</span><span data-x="passv" style="color:#15803d">' + (ps / 100).toFixed(1) + '×</span></div>' +
'<input type="range" data-x="passsens" min="40" max="300" value="' + ps + '" style="width:100%;accent-color:#0d9488">' +
'<div style="font-size:10.5px;color:var(--texto-fraco,#5b6b7c);line-height:1.25;margin-top:-2px">Ande com o aparelho na mão pra andar no projeto. Se o projeto não anda, <b>aumente</b>; se anda sozinho, <b>diminua</b>. (No tablet costuma precisar mais.)</div>';
}
html += '<button class="btn sm" data-x="medir" style="width:100%">' + (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '') + ' Medir na escala (toque 2 pontos)</button>';
if (discs.length > 1) {
html += '<div style="font-size:11px;color:var(--texto-fraco,#5b6b7c);margin-top:2px">Disciplinas (toque pra ligar/desligar):</div><div style="display:flex;flex-wrap:wrap;gap:5px">';
discs.forEach(function (d) {
var off = !!xr.discOcultas[d.chave];
html += '<button class="btn sm" data-xd="' + esc(d.chave) + '" style="' + (off ? 'opacity:.45' : 'background:' + corAtiva() + ';color:#fff') + '">' + esc(d.nome) + '</button>';
});
html += '</div>';
}
if (xr.mode === 'ar') {
html += '<button class="btn sm" data-x="travar" style="width:100%">' + (xr.travado ? '' + (typeof Icones !== 'undefined' ? Icones.get('destravado', 15) : '') + ' Destravar do ponto' : '' + (typeof Icones !== 'undefined' ? Icones.get('cadeado', 15) : '') + ' Travar neste ponto') + '</button>' +
'<div style="font-size:11px;color:var(--texto-fraco,#5b6b7c);line-height:1.3">Aponte pro chão, toque pra fixar o projeto no lugar real; trave pra ele não sair do lugar.</div>';
}
html += '<button class="btn sm" data-x="sair" style="width:100%">⏹ Sair do imersivo</button>';
}
xrPanel.innerHTML = html;
if (!xr.on && !vazio) {
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
function quickLookAqui() {
if (typeof window === 'undefined' || !window.BimUsdz) return false;
var a = document.createElement('a');
var rel = false; try { rel = !!(a.relList && a.relList.supports && a.relList.supports('ar')); } catch (_) {}
return BimUsdz.quickLook({ ua: navigator.userAgent, plataforma: navigator.platform, toques: navigator.maxTouchPoints || 0,
relAr: rel, webview: !!(window.webkit && window.webkit.messageHandlers) });
}
function pecasVisiveis() {
modelRoot.updateMatrixWorld(true);
var inv = new THREE.Matrix4().copy(modelRoot.matrixWorld).invert(), rel = new THREE.Matrix4(), out = [];
modelRoot.traverseVisible(function (o) {
if (!o.isMesh || o.isInstancedMesh || !o.geometry || !o.geometry.attributes) return;
var pa = o.geometry.attributes.position, na = o.geometry.attributes.normal;
if (!pa || pa.isInterleavedBufferAttribute || pa.count < 3) return;
var mat = Array.isArray(o.material) ? o.material[0] : o.material;
if (!mat || mat.visible === false || mat.colorWrite === false) return;
var cor = (o.userData && o.userData.matOrig && o.userData.matOrig.color && o.material === selMat) ? o.userData.matOrig : mat;
var op = mat.transparent ? (mat.opacity == null ? 1 : mat.opacity) : 1;
if (op < 0.05) return;
var idx = o.geometry.index ? o.geometry.index.array : null;
if (!idx) { idx = new Uint32Array(pa.count); for (var i = 0; i < pa.count; i++) idx[i] = i; }
rel.multiplyMatrices(inv, o.matrixWorld);
var cBase = (cor.map && cor.userData && cor.userData.corLin) ? cor.userData.corLin : cor.color;
var cS = cBase ? cBase.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace) : { r: 0.8, g: 0.8, b: 0.8 };
out.push({ cor: [cS.r, cS.g, cS.b, op],
pos: pa.array, nor: (na && !na.isInterleavedBufferAttribute) ? na.array : null, idx: idx, matriz: rel.elements.slice() });
});
return out;
}
var _ql = null;
function abrirQuickLook(modo, btn) {
var pecas = pecasVisiveis(), tri = 0;
pecas.forEach(function (p) { tri += Math.floor(p.idx.length / 3); });
var chave = modo + '|' + pecas.length + '|' + tri;
if (_ql && _ql.chave === chave) { dispararQuickLook(_ql.url); return; }
var rot = btn ? btn.innerHTML : '';
if (btn) { btn.disabled = true; btn.textContent = 'Montando o arquivo da RA…'; }
setTimeout(function () {
var r;
try { r = BimUsdz.gerar(pecas, { modo: modo }); } catch (e) { r = { ok: false, erro: String(e && e.message || e) }; }
if (btn) { btn.disabled = false; btn.innerHTML = rot; }
S._qlUltimo = { ok: r.ok, erro: r.erro || '', tri: r.tri || 0, malhas: r.malhas || 0, bytes: r.ok ? r.bytes.length : 0, modo: modo };
if (!r.ok) {
S._hint(r.erro === 'grande'
? 'Este modelo tem ' + Math.round(r.tri / 1000) + ' mil triângulos visíveis; a RA do iPhone aguenta até ' + Math.round(r.limite / 1000) + ' mil. Desligue disciplinas (ex.: deixe só a Arquitetura) e toque de novo — ou use Caminhar.'
: r.erro === 'vazio' ? 'Nada visível para mostrar. Ligue ao menos uma disciplina.'
: 'Não consegui montar o arquivo da RA: ' + r.erro);
return;
}
var url = URL.createObjectURL(new Blob([r.bytes], { type: 'model/vnd.usdz+zip' }));
if (_ql) { try { URL.revokeObjectURL(_ql.url); } catch (_) {} }
_ql = { chave: chave, url: url };
dispararQuickLook(url);
}, 40);
}
var raTrava = true;
try { raTrava = localStorage.getItem('orcapro:bim:raTrava') !== '0'; } catch (_) {}
S._raTravada = function () { return raTrava; };
function dispararQuickLook(url) {
var a = document.createElement('a');
a.setAttribute('rel', 'ar');
a.setAttribute('href', url + (raTrava ? '#allowsContentScaling=0' : ''));
a.setAttribute('download', 'projeto.usdz');
a.appendChild(document.createElement('img'));
a.style.display = 'none';
document.body.appendChild(a);
S._qlDisparos = (S._qlDisparos || 0) + 1;
a.click();
setTimeout(function () { try { a.remove(); } catch (_) {} }, 1500);
}
function arquivoRA(formato, modo) {
if (!window.BimUsdz) return { ok: false, erro: 'motor da RA não carregou' };
var pecas = pecasVisiveis();
try { return formato === 'glb' ? BimUsdz.gerarGlb(pecas, { modo: modo }) : BimUsdz.gerar(pecas, { modo: modo }); }
catch (e) { return { ok: false, erro: String(e && e.message || e) }; }
}
S._arquivoRA = arquivoRA;
function toggleXRPanel() {
if (xrPanel.style.display === 'flex') { xrPanel.style.display = 'none'; return; }
if (S._fecharPaineis) S._fecharPaineis(xrPanel);
pintarXRPanel(); xrPanel.style.display = 'flex';
if (S._ajustarTop) S._ajustarTop();
}
S._toggleXR = toggleXRPanel;
function ligarSombras(on) {
var tri = 0; S.modelos.forEach(function (mo) { tri += mo.nTri || 0; });
if (on && tri > 1800000) return false;
dir.castShadow = !!on;
todasMalhas(function (m) { if (m.geometry) { m.castShadow = !!on; m.receiveShadow = !!on; } });
acabSoltos.forEach(function (m) { m.receiveShadow = !!on; });
S.modelos.forEach(function (mo) { if (mo._agreg && mo._agreg.grupo) mo._agreg.grupo.traverse(function (m) { if (m.isMesh) { m.castShadow = !!on; m.receiveShadow = !!on; } }); });
return true;
}
function aplicarEscalaXR(f) {
if (xr.mode !== 'ar') { xr.escala = 1; return; }
xr.escala = f || 1;
if (xr.placed) posicionarModeloAR();
}
var _imFwd = new THREE.Vector3(), _imC = new THREE.Vector3();
function fitEscala() {
var b = xr.boxLocal; if (!b) return 0.02;
var d = b.getSize(new THREE.Vector3()), maior = Math.max(d.x, d.y, d.z) || 1;
return Math.max(0.002, Math.min(1, 2.2 / maior));
}
function posicionarNaFrente(dist) {
var b = xr.boxLocal; if (!b) return;
var s = xr.escala || 1;
camera.getWorldDirection(_imFwd); _imFwd.y = 0; if (_imFwd.lengthSq() < 1e-6) _imFwd.set(0, 0, -1); _imFwd.normalize();
var pisoY = camera.position.y - EYE;
var ax = camera.position.x + _imFwd.x * dist, az = camera.position.z + _imFwd.z * dist;
b.getCenter(_imC);
modelRoot.position.set(ax - s * _imC.x, pisoY - s * b.min.y, az - s * _imC.z);
xr._pisoY = pisoY;
}
function aplicarEscalaImersivo(f) {
if (xr.mode === 'ar') { aplicarEscalaXR(f); return; }
if (!xr.on || !xr.boxLocal) return;
if (xr.travado) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('cadeado', 15) : '') + ' Destrave pra mudar a escala.'); pintarXRPanel(); return; }
xr.escala = f > 0 ? f : 1;
modelRoot.scale.setScalar(xr.escala);
if (xr.escala >= 0.999) {
modelRoot.position.set(0, 0, 0);
xr.boxLocal.getCenter(_imC);
camera.position.set(_imC.x, xr.boxLocal.min.y + EYE, _imC.z);
xr._pisoY = xr.boxLocal.min.y;
xrDica('Escala real 1:1 — você está DENTRO do projeto. Vire o celular; ande com o joystick.');
} else {
posicionarNaFrente(2.0);
xrDica('Miniatura na sua frente. Vire o celular pra olhar; ' + (typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + ' recentraliza; joystick pra rodear.');
}
if (xr.cortefrac != null && xr.cortefrac < 999) aplicarTetoVisao(xr.cortefrac / 1000);
}
S._aplicarEscalaImersivo = aplicarEscalaImersivo;
function centralizarProjeto() {
if (xr.mode === 'ar') { if (!xr.travado) { xr.placed = false; xrDica('Aponte pro chão e toque pra fixar de novo.'); } else S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('cadeado', 15) : '') + ' Destrave pra reposicionar.'); return; }
if (!xr.on || !xr.boxLocal) return;
if (xr.travado) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('cadeado', 15) : '') + ' Destrave pra reposicionar.'); return; }
if (xr.escala >= 0.999) { xr.boxLocal.getCenter(_imC); camera.position.set(_imC.x, xr.boxLocal.min.y + EYE, _imC.z); xr._pisoY = xr.boxLocal.min.y; }
else posicionarNaFrente(2.0);
S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + ' Projeto recolocado à sua frente.');
}
S._centralizarImersivo = centralizarProjeto;
function xrReSnap() {
if (!xr.on || xr.mode === 'ar' || xr.mode === 'vr') return;
var p = modelRoot.position.clone(), s = modelRoot.scale.clone();
modelRoot.position.set(0, 0, 0); modelRoot.scale.setScalar(1); modelRoot.updateMatrixWorld(true);
var b = new THREE.Box3().setFromObject(modelRoot);
modelRoot.position.copy(p); modelRoot.scale.copy(s); modelRoot.updateMatrixWorld(true);
if (b.isEmpty()) { sairImersivo(); return; }
xr.boxLocal = b.clone();
aplicarEscalaImersivo(xr.escala || 1);
}
S._xrReSnap = xrReSnap;
function aplicarTetoVisao(frac) {
var box = new THREE.Box3().setFromObject(modelRoot); if (box.isEmpty()) return;
xr.cortefrac = Math.round(frac * 1000);
var y = box.min.y + (box.max.y - box.min.y) * frac;
var rot = xrPanel.querySelector('[data-x="cortev"]');
if (frac >= 0.999) { var walk = (xr.mode !== 'ar' && xr.mode !== 'vr'); renderer.clippingPlanes = walk ? [] : (xr.prevClip || []); renderer.localClippingEnabled = walk ? false : xr.prevLocal; if (rot) rot.textContent = 'inteiro'; return; }
if (!xr.clip) xr.clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
xr.clip.constant = y;
renderer.localClippingEnabled = true; renderer.clippingPlanes = [xr.clip];
if (rot) rot.textContent = fmtDist(Math.max(0, y - box.min.y) / (xr.escala || 1)) + ' do piso';
}
function montarHud(comReticulo) {
var discs = disciplinasPresentes();
var chips = discs.length > 1 ? discs.map(function (d) { var off = !!xr.discOcultas[d.chave]; return '<button data-har="' + esc(d.chave) + '" style="pointer-events:auto;border:0;border-radius:14px;padding:7px 11px;font-size:12px;color:#fff;background:' + (off ? 'rgba(90,110,130,.7)' : corAtiva()) + '">' + esc(d.nome) + '</button>'; }).join('') : '';
var passosOn = !!(xr._pass && xr._pass.on);
function bt(k, ico, rot, bg, cor) {
return '<button data-har="' + k + '" style="pointer-events:auto;border:0;border-radius:12px;width:68px;min-height:52px;padding:5px 2px;font-size:10.5px;line-height:1.15;color:' + (cor || '#fff') + ';background:' + bg +
';font-weight:700;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;touch-action:manipulation">' + (typeof Icones !== 'undefined' ? Icones.get(ico, 18) : '') + '<span>' + rot + '</span></button>';
}
var barra = '<div data-h="lateral" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:6px;max-height:calc(100% - 130px);overflow-y:auto;pointer-events:auto;padding:6px;background:rgba(11,26,43,.55);border-radius:14px">' +
(comReticulo ? bt('trava', xr.travado ? 'cadeado' : 'destravado', xr.travado ? 'Travado' : 'Livre', xr.travado ? '#15803d' : '#b45309') : '') +
bt('medir', 'medir', 'Medir', xr.medir.on ? '#b45309' : '#15803d', xr.medir.on ? '#fff' : '#0b1a2b') +
bt('centralizar', 'alvo', 'Centralizar', '#2563eb') +
(comReticulo ? '' : bt('passos', 'caminhar', 'Passos: ' + (passosOn ? 'on' : 'off'), passosOn ? '#0d9488' : 'rgba(90,110,130,.7)')) +
bt('sistema', 'paleta', 'Cores', sisColor.on ? corAtiva() : '#334a63') +
bt('ajustes', 'ajustes', 'Ajustes', '#334a63') +
bt('sair', 'fechar', 'Sair', '#b91c1c') + '</div>' +
(chips ? '<div style="position:absolute;left:0;right:0;bottom:16px;display:flex;flex-wrap:wrap;gap:6px;justify-content:center;padding:0 92px 0 10px">' + chips + '</div>' : '');
xrHud.innerHTML =
(comReticulo ? '' : '<div data-h="joy" style="position:absolute;left:16px;bottom:60px;width:108px;height:108px;border-radius:50%;background:rgba(20,40,64,.4);border:2px solid rgba(127,224,163,.5);pointer-events:auto;touch-action:none">' +
'<div data-h="knob" style="position:absolute;left:31px;top:31px;width:46px;height:46px;border-radius:50%;background:rgba(127,224,163,.85)"></div></div>') +
(comReticulo ? '<div style="position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border:2px solid #15803d;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.4)"></div>' : '') +
barra +
(S._montarLegendaChips ? S._montarLegendaChips() : '') +
'<div style="position:absolute;left:0;right:0;top:0;display:flex;justify-content:center;pointer-events:none"><div data-h="dica" style="margin-top:8px;background:rgba(11,26,43,.82);color:var(--texto,#1a2b3c);font-size:12px;padding:5px 12px;border-radius:20px;max-width:88%;text-align:center"></div></div>';
xrHud.style.display = 'block';
if (!comReticulo) ligarJoystick();
}
xrHud.addEventListener('click', function (e) {
var b = e.target.closest('[data-har]'); if (!b) return; var k = b.getAttribute('data-har');
if (k === 'sair') sairImersivo();
else if (k === 'trava') { xr.travado = !xr.travado; if (xr.reticle) xr.reticle.visible = false; pintarTravaHud(); xrDica(xr.travado ? 'Travado: a maquete não sai do lugar.' : 'Livre: use "Centralizar" (ou Ajustes → reposicionar) para mover.'); }
else if (k === 'centralizar') centralizarProjeto();
else if (k === 'passos') {
if (xr._passH) { xr._pass.on = !xr._pass.on; _syncPassosHud(xr._pass.on ? 'Andar com o celular na mão move você no projeto (por passos).' : 'Passos desligados — use o joystick.'); }
else { ligarPassos(); }
}
else if (k === 'medir') { xr.medir.on = !xr.medir.on; if (!xr.medir.on) limparMedirXR(); b.style.background = xr.medir.on ? '#b45309' : '#15803d'; xrDica(xr.medir.on ? '' + (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '') + ' Toque em 2 pontos do modelo pra medir na escala.' : ''); }
else if (k === 'ajustes') { var aberto = xrPanel.style.display === 'flex'; if (aberto) { xrPanel.style.display = 'none'; } else { pintarXRPanel(); xrPanel.style.display = 'flex'; if (S._ajustarTop) S._ajustarTop(); } }
else if (k === 'sistema') { if (S._setSistema) S._setSistema(!(S._sisColorOn && S._sisColorOn())); }
else { toggleDisciplinaXR(k); var off = !!xr.discOcultas[k]; b.style.background = off ? 'rgba(90,110,130,.7)' : corAtiva(); }
});
S._sisImersivoSync = function () {
if (!(xr.on && xrHud.style.display !== 'none')) return;
var b = xrHud.querySelector('[data-har="sistema"]'); if (b) b.style.background = S._sisColorOn && S._sisColorOn() ? corAtiva() : '#c9d5e1';
var leg = xrHud.querySelector('[data-h="sisleg"]'); if (leg && leg.parentNode) leg.parentNode.removeChild(leg);
if (S._sisColorOn && S._sisColorOn() && S._montarLegendaChips) { var html = S._montarLegendaChips(); if (html) xrHud.insertAdjacentHTML('beforeend', html); }
};
function xrDica(t) { var d = xrHud.querySelector('[data-h="dica"]'); if (d) d.textContent = t || ''; }
function _syncPassosHud(dica) {
var b = xrHud.querySelector('[data-har="passos"]');
if (b) { var on = !!(xr._pass && xr._pass.on); b.innerHTML = (typeof Icones !== 'undefined' ? Icones.get('caminhar', 18) : '') + '<span>Passos: ' + (on ? 'on' : 'off') + '</span>'; b.style.background = on ? '#0d9488' : 'rgba(90,110,130,.7)'; }
if (dica) xrDica(dica);
}
S._xrPassosHud = function (n) { var b = xrHud.querySelector('[data-har="passos"] span'); if (b && xr._pass && xr._pass.on) b.textContent = n + ' passos'; };
function pintarTravaHud() {
var b = xrHud.querySelector('[data-har="trava"]'); if (!b) return;
b.innerHTML = (typeof Icones !== 'undefined' ? Icones.get(xr.travado ? 'cadeado' : 'destravado', 18) : '') + '<span>' + (xr.travado ? 'Travado' : 'Livre') + '</span>';
b.style.background = xr.travado ? '#15803d' : '#b45309';
}
function ligarJoystick() {
var joy = xrHud.querySelector('[data-h="joy"]'), knob = xrHud.querySelector('[data-h="knob"]');
if (!joy) return;
var ativo = false, cx = 60, cy = 60, R = 42;
function set(px, py) {
var dx = px - cx, dy = py - cy, d = Math.sqrt(dx * dx + dy * dy) || 1;
if (d > R) { dx = dx / d * R; dy = dy / d * R; }
knob.style.left = (35 + dx) + 'px'; knob.style.top = (35 + dy) + 'px';
xr.joy.x = dx / R; xr.joy.z = dy / R;
}
function pos(e) { var r = joy.getBoundingClientRect(), t = e.touches ? e.touches[0] : e; return [t.clientX - r.left, t.clientY - r.top]; }
joy.addEventListener('pointerdown', function (e) { ativo = true; joy.setPointerCapture && joy.setPointerCapture(e.pointerId); var p = pos(e); set(p[0], p[1]); e.preventDefault(); });
joy.addEventListener('pointermove', function (e) { if (!ativo) return; var p = pos(e); set(p[0], p[1]); e.preventDefault(); });
var solta = function () { ativo = false; xr.joy.x = 0; xr.joy.z = 0; knob.style.left = '35px'; knob.style.top = '35px'; };
joy.addEventListener('pointerup', solta); joy.addEventListener('pointercancel', solta);
}
var xrDrag = null;
function xrPointerDown(e) { if (!xr.on || xr.mode === 'ar' || xr.mode === 'vr') return; if (xr.medir.on) { medirTocar(e); return; } xrDrag = { x: e.clientX, y: e.clientY }; }
function xrPointerMove(e) {
if (!xrDrag) return;
if (xr.oriOk) { xr.oriYawOff -= (e.clientX - xrDrag.x) * 0.005; }
else { xr.look.yaw -= (e.clientX - xrDrag.x) * 0.005; xr.look.pitch -= (e.clientY - xrDrag.y) * 0.005; xr.look.pitch = Math.max(-1.4, Math.min(1.4, xr.look.pitch)); }
xrDrag = { x: e.clientX, y: e.clientY };
}
function xrPointerUp() { xrDrag = null; }
var _oriZee = new THREE.Vector3(0, 0, 1);
var _oriEul = new THREE.Euler();
var _oriQ0 = new THREE.Quaternion();
var _oriQ1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
var _oriYaw = new THREE.Quaternion();
var _oriUp = new THREE.Vector3(0, 1, 0);
function _screenAngRad() { var a = 0; try { a = (window.screen && screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (window.orientation || 0); } catch (e) {} return (a || 0) * Math.PI / 180; }
function _permOri() {
if (typeof DeviceOrientationEvent === 'undefined' || !DeviceOrientationEvent.requestPermission) return null;
if (!xr._oriPromise) xr._oriPromise = DeviceOrientationEvent.requestPermission().then(function (p) { xr._oriPerm = p; if (p !== 'granted') xr._oriPromise = null; return p; }).catch(function () { xr._oriPromise = null; return 'denied'; });
return xr._oriPromise;
}
function _permPasso() {
if (typeof DeviceMotionEvent === 'undefined' || !DeviceMotionEvent.requestPermission) return null;
if (!xr._passPromise) xr._passPromise = DeviceMotionEvent.requestPermission().then(function (p) { xr._passPerm = p; if (p !== 'granted') xr._passPromise = null; return p; }).catch(function () { xr._passPromise = null; return 'denied'; });
return xr._passPromise;
}
function _pedirSensores() { _permOri(); _permPasso(); }
function ligarOrientacao() {
if (xr.ori) return;
function handler(ev) {
if (ev.alpha == null && ev.beta == null && ev.gamma == null) return;
var alpha = (ev.alpha || 0) * Math.PI / 180, beta = (ev.beta || 0) * Math.PI / 180, gamma = (ev.gamma || 0) * Math.PI / 180;
_oriEul.set(beta, alpha, -gamma, 'YXZ');
var q = xr.oriQuat || (xr.oriQuat = new THREE.Quaternion());
q.setFromEuler(_oriEul);
q.multiply(_oriQ1);
q.multiply(_oriQ0.setFromAxisAngle(_oriZee, -_screenAngRad()));
_oriYaw.setFromAxisAngle(_oriUp, xr.oriYawOff || 0);
q.premultiply(_oriYaw);
xr.oriOk = true;
}
var start = function () { window.addEventListener('deviceorientation', handler, true); xr.ori = true; xr._oriH = handler; xrDica('Vire e incline o celular pra olhar — o projeto acompanha. Joystick pra andar. Arraste na horizontal pra recentralizar.'); };
var pr = _permOri();
if (pr) { pr.then(function (p) { if (p === 'granted') start(); }); }
else if (typeof DeviceOrientationEvent !== 'undefined') { start(); }
}
function desligarOrientacao() { if (xr.ori && xr._oriH) { window.removeEventListener('deviceorientation', xr._oriH, true); } xr.ori = false; xr.oriOk = false; xr.oriBase = null; }
var _passLen = 0.68;
function _passSens() { if (xr.passSens == null) { var v = 1.3; try { var s = parseFloat(localStorage.getItem('orcapro:bim:passSens')); if (s > 0) v = s; } catch (_) {} xr.passSens = Math.max(0.4, Math.min(3, v)); } return xr.passSens; }
function _passoDetecta(P, mag, now, sens) {
P.ema = P.ema * 0.9 + mag * 0.1;
var din = mag - P.ema;
P.dev = P.dev * 0.92 + Math.abs(din) * 0.08;
var thr = Math.max(0.55, P.dev * 1.4) / (sens || 1);
if (!P.up && din > thr && P.dev > 0.35 && (now - P.last) > 300) { P.up = true; P.last = now; P.n++; return true; }
if (P.up && din < thr * 0.5) P.up = false;
return false;
}
function ligarPassos() {
if (xr._passH) return;
xr._pass = { last: 0, ema: 9.81, dev: 0.2, up: false, on: false, n: 0 };
function handler(ev) {
if (!xr.on || !xr._pass || !xr._pass.on) return;
var a = ev.accelerationIncludingGravity || ev.acceleration; if (!a) return;
var mag = Math.sqrt((a.x || 0) * (a.x || 0) + (a.y || 0) * (a.y || 0) + (a.z || 0) * (a.z || 0));
var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
if (_passoDetecta(xr._pass, mag, now, _passSens())) { xr._stepMove = (xr._stepMove || 0) + _passLen; if (S._xrPassosHud) S._xrPassosHud(xr._pass.n); }
}
var start = function () { window.addEventListener('devicemotion', handler); xr._passH = handler; if (xr._pass) xr._pass.on = true; _syncPassosHud(); };
var pr = _permPasso();
if (pr) { pr.then(function (p) { if (p === 'granted') start(); else _syncPassosHud('📵 Passos precisam da permissão de Movimento (negada) — use o joystick.'); }); }
else if (typeof DeviceMotionEvent !== 'undefined') { start(); }
}
function desligarPassos() { if (xr._passH) { try { window.removeEventListener('devicemotion', xr._passH); } catch (_) {} xr._passH = null; } xr._pass = null; xr._stepMove = 0; }
S._xrStep = function () { xr._stepMove = (xr._stepMove || 0) + _passLen; };
S._passSensSet = function (v) { v = Math.max(0.4, Math.min(3, +v || 1)); xr.passSens = v; try { localStorage.setItem('orcapro:bim:passSens', String(v)); } catch (_) {} return v; };
S._xrSimPassos = function (mags) {
var P = { last: -9999, ema: 9.81, dev: 0.2, up: false, n: 0 }, i, t = 0, passos = 0;
for (i = 0; i < mags.length; i++) { t += 60; if (_passoDetecta(P, mags[i], t, _passSens())) passos++; }
return passos;
};
var _xrFwd = new THREE.Vector3(), _xrRight = new THREE.Vector3(), _xrUp = new THREE.Vector3(0, 1, 0);
function xrWalkStep(dt) {
if (xr.mode === 'vr') { xrVRLoco(dt); return; }
if (xr.mode !== 'ar') {
if (xr.oriOk && xr.oriQuat) { camera.quaternion.copy(xr.oriQuat); }
else { var e = new THREE.Euler(xr.look.pitch, xr.look.yaw, 0, 'YXZ'); camera.quaternion.setFromEuler(e); }
if (xr._stepMove) { camera.getWorldDirection(_xrFwd); _xrFwd.y = 0; if (_xrFwd.lengthSq() > 1e-6) { var sm = xr._stepMove; xr._stepMove = 0; _xrFwd.normalize(); camera.position.addScaledVector(_xrFwd, sm); camera.position.y = xr._pisoY + EYE; } }
}
var mv = xr.joy.x * xr.joy.x + xr.joy.z * xr.joy.z;
if (mv < 0.0009) return;
camera.getWorldDirection(_xrFwd); _xrFwd.y = 0; _xrFwd.normalize();
_xrRight.crossVectors(_xrFwd, _xrUp).normalize();
var vel = 1.4 * dt;
var alvo = new THREE.Vector3();
alvo.addScaledVector(_xrFwd, -xr.joy.z * vel).addScaledVector(_xrRight, xr.joy.x * vel);
if (xr.mode === 'ar') { modelRoot.position.sub(alvo); }
else { camera.position.add(alvo); camera.position.y = xr._pisoY + EYE; }
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
var xrRig = new THREE.Group(); scene.add(xrRig);
function iniciarAndar(modo) {
if (xr.on) return;
if (!modelRoot.children.length) { S._hint('Carregue um modelo primeiro.'); return; }
xr.posOrig = modelRoot.position.clone();
modelRoot.position.set(0, 0, 0); modelRoot.scale.setScalar(1); modelRoot.updateMatrixWorld(true);
var box = new THREE.Box3().setFromObject(modelRoot);
if (box.isEmpty()) { modelRoot.position.copy(xr.posOrig); S._hint('Modelo sem geometria visível.'); return; }
xr.boxLocal = box.clone();
xr.on = true; xr.mode = modo; xr.escala = 1; xr.cortefrac = 1000;
xr.oriYawOff = 0; xr.oriOk = false; xr.travado = false;
xr.cam = { pos: camera.position.clone(), quat: camera.quaternion.clone(), near: camera.near, far: camera.far };
xr.prevClip = renderer.clippingPlanes; xr.prevLocal = renderer.localClippingEnabled;
renderer.clippingPlanes = []; renderer.localClippingEnabled = false;
orbit.enabled = false; if (S.fly && S.fly.on && S._setMode) S._setMode(false);
ligarSombras(true);
var c = box.getCenter(new THREE.Vector3());
camera.near = 0.02; camera.far = 5000;
camera.quaternion.identity();
if (modo === 'camera') { camera.position.set(0, box.min.y + EYE, 0); xr._pisoY = box.min.y; }
else { camera.position.set(c.x, box.min.y + EYE, c.z); xr._pisoY = box.min.y; }
camera.updateProjectionMatrix();
xr.look.yaw = 0; xr.look.pitch = 0; xr.joy.x = 0; xr.joy.z = 0;
S._xrWalk = xrWalkStep;
montarHud(false);
if (typeof DeviceOrientationEvent !== 'undefined') ligarOrientacao();
ligarPassos();
canvasEl.addEventListener('pointerdown', xrPointerDown); canvasEl.addEventListener('pointermove', xrPointerMove); window.addEventListener('pointerup', xrPointerUp);
marcarBtnXR(true); pintarXRPanel(); xrPanel.style.display = 'none';
if (modo === 'camera') { aplicarEscalaImersivo(fitEscala()); S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('camera', 15) : '') + ' Projeto no seu ambiente. Vire o celular pra olhar; ' + (typeof Icones !== 'undefined' ? Icones.get('ajustes', 15) : '') + ' Ajustes p/ escala (1:1 = andar dentro) e ' + (typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + ' Centralizar. ⏹ Sair.'); }
else { xrDica('' + (typeof Icones !== 'undefined' ? Icones.get('caminhar', 15) : '') + ' Você está DENTRO em escala real 1:1. Vire o celular pra olhar; joystick pra andar.'); S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('caminhar', 15) : '') + ' Dentro do projeto 1:1. Vire o celular; joystick pra andar. ⏹ Sair.'); }
}
function entrarCaminhar() { iniciarAndar('caminhar'); }
function entrarCamera() {
if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('camera', 15) : '') + ' Este navegador não dá acesso à câmera.'); return; }
var h = location.hostname;
var origemSegura = (location.protocol === 'https:') || (typeof window.isSecureContext !== 'undefined' && window.isSecureContext) || h === 'localhost' || h === '127.0.0.1' || h === '::1' || /\.localhost$/.test(h);
if (!origemSegura) {
S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('camera', 15) : '') + ' A câmera só abre por HTTPS. Use o link ' + (typeof Icones !== 'undefined' ? Icones.get('nuvem', 15) : '') + ' da nuvem (ou rode no próprio computador).');
return;
}
if (xr.on || xr._camPend) return;
xr._camPend = true;
_pedirSensores();
S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('camera', 15) : '') + ' Pedindo acesso à câmera…');
navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }).then(function (stream) {
xr._camPend = false;
if (xr.on) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {} return; }
xr.stream = stream;
var v = document.createElement('video');
v.setAttribute('playsinline', ''); v.setAttribute('muted', ''); v.muted = true; v.autoplay = true;
v.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;background:#000';
v.srcObject = stream; host.insertBefore(v, host.firstChild); xr.video = v; try { v.play(); } catch (_) {}
canvasEl.style.position = 'relative'; canvasEl.style.zIndex = '1'; canvasEl.style.background = 'transparent';
iniciarAndar('camera');
}).catch(function (e) {
xr._camPend = false;
var nm = (e && e.name) || e;
S._hint(nm === 'NotAllowedError' ? '' + (typeof Icones !== 'undefined' ? Icones.get('camera', 15) : '') + ' Você negou a câmera. Toque de novo e permita.' : '' + (typeof Icones !== 'undefined' ? Icones.get('camera', 15) : '') + ' Não consegui abrir a câmera: ' + nm);
});
}
function limparCamera() {
if (xr.stream) { try { xr.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {} xr.stream = null; }
if (xr.video) { try { xr.video.pause(); xr.video.srcObject = null; if (xr.video.parentNode) xr.video.parentNode.removeChild(xr.video); } catch (_) {} xr.video = null; }
try { canvasEl.style.zIndex = ''; canvasEl.style.background = ''; } catch (_) {}
}
function entrarVR() {
if (!navigator.xr) return;
var box = new THREE.Box3().setFromObject(modelRoot); if (box.isEmpty()) return;
navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] }).then(function (session) {
xr.on = true; xr.mode = 'vr'; xr.session = session; xr.escala = 1;
xr.cam = { pos: camera.position.clone(), quat: camera.quaternion.clone() };
xr.prevClip = renderer.clippingPlanes; xr.prevLocal = renderer.localClippingEnabled;
xr.joy.x = 0; xr.joy.z = 0;
S._xrWalk = xrWalkStep;
ligarSombras(true);
var c = box.getCenter(new THREE.Vector3());
xrRig.position.set(c.x, box.min.y, c.z); xrRig.rotation.set(0, 0, 0);
renderer.xr.setReferenceSpaceType('local-floor');
xrRig.add(camera);
renderer.xr.setSession(session).then(function () {
if (!xr.on) return;
if (S._setCota && S._cotaEstado && S._cotaEstado().on) S._setCota(false);
xr._xrActivePrev = S._xrActive; S._xrActive = true; if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
renderer.setAnimationLoop(xrLoop);
}).catch(function (e) { sairImersivo(); S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('vr', 15) : '') + ' Falha ao iniciar a sessão VR: ' + (e && e.message || e)); });
session.addEventListener('end', sairImersivo);
marcarBtnXR(true); pintarXRPanel(); xrPanel.style.display = 'none';
}).catch(function (e) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('vr', 15) : '') + ' Não deu pra entrar em VR: ' + (e && e.message || e)); });
}
function entrarAR() {
if (!navigator.xr) return;
montarHud(true);
navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay', 'local-floor'], domOverlay: { root: xrHud } }).then(function (session) {
xr.on = true; xr.mode = 'ar'; xr.session = session; xr.placed = false; xr.travado = false;
xr.modelSnap = { pos: modelRoot.position.clone(), quat: modelRoot.quaternion.clone(), scale: modelRoot.scale.clone() };
xr.prevClip = renderer.clippingPlanes; xr.prevLocal = renderer.localClippingEnabled;
xr.joy.x = 0; xr.joy.z = 0;
S._xrWalk = xrWalkStep;
modelRoot.visible = false;
ligarSombras(true);
if (!xr.reticle) {
var g = new THREE.RingGeometry(0.09, 0.11, 32).rotateX(-Math.PI / 2);
xr.reticle = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x7fe0a3 }));
xr.reticle.matrixAutoUpdate = false; xr.reticle.visible = false; scene.add(xr.reticle);
}
renderer.xr.setReferenceSpaceType('local');
renderer.xr.setSession(session).then(function () {
if (!xr.on) return;
S._xrActive = true; if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
session.requestReferenceSpace('viewer').then(function (vs) {
session.requestHitTestSource({ space: vs }).then(function (src) { if (xr.on) xr.hitSrc = src; else { try { src.cancel(); } catch (_) {} } });
});
renderer.setAnimationLoop(xrLoop);
}).catch(function (e) { sairImersivo(); S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('celular', 15) : '') + ' Falha ao iniciar a sessão RA: ' + (e && e.message || e)); });
session.addEventListener('select', function () { if (xr.medir.on && xr.placed) medirTocar({}); else arColocar(); });
session.addEventListener('end', sairImersivo);
xrDica('Aponte a câmera pro chão e toque na tela pra fixar o projeto.');
marcarBtnXR(true); pintarXRPanel(); xrPanel.style.display = 'none';
}).catch(function (e) { xrHud.style.display = 'none'; S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('celular', 15) : '') + ' RA indisponível neste aparelho: ' + (e && e.message || e)); });
}
function arColocar() {
if (xr.travado || !xr.reticle || !xr.reticle.visible) return;
xr._anchorMat = xr.reticle.matrix.clone();
xr.placed = true; modelRoot.visible = true;
posicionarModeloAR();
xr.travado = raTrava; pintarTravaHud();
xrDica(raTrava ? 'Projeto fixado e TRAVADO: encostar a mão não tira ele do lugar. Toque em "Travado" para mover.' : 'Projeto fixado. Ande em volta! Toque em "Livre" para travar no lugar.');
pintarXRPanel();
}
function posicionarModeloAR() {
if (!xr._anchorMat) return;
var box = new THREE.Box3().setFromObject(modelRoot);
var p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
xr._anchorMat.decompose(p, q, s);
modelRoot.scale.setScalar(xr.escala || 1);
var box0 = new THREE.Box3().setFromObject(modelRoot);
modelRoot.position.set(0, 0, 0);
var min = box0.min.clone();
modelRoot.position.set(p.x - (box0.getCenter(new THREE.Vector3()).x), p.y - min.y, p.z - (box0.getCenter(new THREE.Vector3()).z));
modelRoot.quaternion.copy(q);
}
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
var marcaXR = null, elasticoXR = null, _marcaXRT = 0, _miraXR = null;
var COR_TIPO = { vertice: 0x22c55e, meio: 0xf59e0b, aresta: 0x38bdf8, intersecao: 0xe879f9, centro: 0xfacc15 };
function centroDaTela() { var r = canvasEl.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
S._tickExtra.push(function () {
var vivo = xr.on && xr.medir && xr.medir.on && (xr.mode !== 'ar' || xr.placed);
if (!vivo) { if (marcaXR) marcaXR.visible = false; if (elasticoXR) elasticoXR.visible = false; _miraXR = null; return; }
var agora = performance.now(); if (agora - _marcaXRT < 150) { if (marcaXR && marcaXR.visible) rescaleObj(marcaXR); return; }
_marcaXRT = agora;
var c = centroDaTela(), sn = mirarEm(c.x, c.y, 30);
_miraXR = sn && sn.p ? sn : null;
if (!marcaXR) { marcaXR = pontoMarca(new THREE.Vector3()); marcaXR.userData._sc = 0.012; scene.add(marcaXR); }
if (!_miraXR) { marcaXR.visible = false; if (elasticoXR) elasticoXR.visible = false; return; }
marcaXR.position.copy(_miraXR.p); marcaXR.material.color.setHex(COR_TIPO[_miraXR.tipo] || 0xcbd5e1); marcaXR.visible = true; rescaleObj(marcaXR);
var rot = (_miraXR.tipo ? (SNAP_VIS[_miraXR.tipo] || {}).rot : 'superfície') || 'superfície', nm = nomeDaPeca(_miraXR.obj), dist = '';
if (xr.medir.pts.length === 1) {
if (!elasticoXR) { elasticoXR = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x7fe0a3, depthTest: false })); elasticoXR.renderOrder = 997; elasticoXR.frustumCulled = false; scene.add(elasticoXR); }
linhaEm(elasticoXR, xr.medir.pts[0], _miraXR.p);
dist = ' · ' + fmtDist(xr.medir.pts[0].distanceTo(_miraXR.p) / (xr.escala || 1)) + ' (real)';
} else if (elasticoXR) elasticoXR.visible = false;
xrDica(rot + (nm ? ' · ' + nm : '') + dist);
});
function medirTocar(e) {
var c = centroDaTela(), cx = e.clientX != null ? e.clientX : c.x, cy = e.clientY != null ? e.clientY : c.y;
var sn = (e.clientX == null && _miraXR) ? _miraXR : mirarEm(cx, cy, 30);
if (!sn || !sn.p) { xrDica('' + (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '') + ' Mire numa superfície do modelo.'); return; }
var P = sn.p.clone();
xr.medir.pts.push(P);
var m = pontoMarca(P.clone()); scene.add(m); xr.medir.objs.push(m); rescaleObj(m);
if (xr.medir.pts.length === 2) {
var a = xr.medir.pts[0], b = xr.medir.pts[1];
var dReal = a.distanceTo(b) / (xr.escala || 1);
var ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0x7fe0a3, depthTest: false }));
ln.renderOrder = 998; scene.add(ln); xr.medir.objs.push(ln);
var lab = labelSprite(fmtDist(dReal)); lab.position.copy(a.clone().add(b).multiplyScalar(0.5)); scene.add(lab); xr.medir.objs.push(lab); rescaleObj(lab);
xrDica('📏 ' + fmtDist(dReal) + ' (real). Toque 2 pontos pra medir de novo.');
xr.medir.pts = [];
if (elasticoXR) elasticoXR.visible = false;
} else xrDica('' + (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '') + ' Agora toque no 2º ponto.');
}
S._medirTocarXR = medirTocar;
function limparMedirXR() { xr.medir.objs.forEach(function (o) { scene.remove(o); if (o.geometry) o.geometry.dispose(); }); xr.medir.objs = []; xr.medir.pts = []; }
function toggleDisciplinaXR(chave) {
xr.discOcultas[chave] = !xr.discOcultas[chave];
S.modelos.forEach(function (mo) { if ((mo.disciplina || 'outros') === chave) mo.grupo.visible = !xr.discOcultas[chave] && mo.visivel !== false; });
pintarXRPanel();
}
S._disciplinas = function () { return disciplinasPresentes().map(function (d) { d.oculta = !!xr.discOcultas[d.chave]; return d; }); };
S._disciplinaVisivel = function (chave, on) { if (!!xr.discOcultas[chave] !== !on) toggleDisciplinaXR(chave); };
function sairImersivo() {
if (!xr.on) return;
var eraVR = xr.mode === 'vr', eraAR = xr.mode === 'ar';
xr.on = false;
if (xr.hitSrc) { try { xr.hitSrc.cancel(); } catch (_) {} }
if (xr.session) { try { xr.session.end(); } catch (_) {} }
xr.session = null; xr.hitSrc = null; xr.joy.x = 0; xr.joy.z = 0; xr.cortefrac = 1000;
limparCamera();
S._xrActive = false; S._xrWalk = null;
try { renderer.setAnimationLoop(null); } catch (_) {}
if (xr.reticle) xr.reticle.visible = false;
if (eraVR) { scene.add(camera); xrRig.remove(camera); }
modelRoot.visible = true;
modelRoot.scale.setScalar(1);
if (xr.modelSnap) { modelRoot.position.copy(xr.modelSnap.pos); modelRoot.quaternion.copy(xr.modelSnap.quat); modelRoot.scale.copy(xr.modelSnap.scale); xr.modelSnap = null; }
else if (xr.posOrig) { modelRoot.position.copy(xr.posOrig); }
xr.posOrig = null; xr.boxLocal = null;
if (!visitante) { S.modelos.forEach(function (mo) { mo.grupo.visible = mo.visivel !== false; }); xr.discOcultas = {}; }
ligarSombras(false);
limparMedirXR(); xr.medir.on = false;
desligarOrientacao(); desligarPassos();
renderer.clippingPlanes = xr.prevClip || []; renderer.localClippingEnabled = xr.prevLocal;
canvasEl.removeEventListener('pointerdown', xrPointerDown); canvasEl.removeEventListener('pointermove', xrPointerMove); window.removeEventListener('pointerup', xrPointerUp);
xrHud.style.display = 'none'; xrHud.innerHTML = '';
if (xr.cam) { camera.position.copy(xr.cam.pos); if (xr.cam.quat) camera.quaternion.copy(xr.cam.quat); if (xr.cam.near) { camera.near = xr.cam.near; camera.far = xr.cam.far; camera.updateProjectionMatrix(); } xr.cam = null; }
orbit.enabled = !trava.on; orbit.update();
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
else if (k === 'ratrava') { raTrava = !raTrava; try { localStorage.setItem('orcapro:bim:raTrava', raTrava ? '1' : '0'); } catch (_) {} pintarXRPanel(); }
else if (k === 'quicklook') { abrirQuickLook(b.getAttribute('data-ql') === 'maquete' ? 'maquete' : 'real', b); }
else if (k === 'sceneviewer') { if (S.opts && S.opts.onSceneViewer) S.opts.onSceneViewer(b.getAttribute('data-ql') === 'maquete' ? 'maquete' : 'real', b); }
else if (k === 'camera') { entrarCamera(); }
else if (k === 'caminhar') { entrarCaminhar(); }
else if (k === 'vr') { entrarVR(); }
else if (k === 'ar') { entrarAR(); }
else if (k === 'sair') { sairImersivo(); }
else if (k === 'travar') { xr.travado = !xr.travado; if (xr.reticle) xr.reticle.visible = false; pintarXRPanel(); }
else if (k === 'centralizar') { centralizarProjeto(); }
else if (k === 'travarcam') { xr.travado = !xr.travado; S._hint(xr.travado ? '' + (typeof Icones !== 'undefined' ? Icones.get('cadeado', 15) : '') + ' Projeto travado no lugar.' : '' + (typeof Icones !== 'undefined' ? Icones.get('destravado', 15) : '') + ' Projeto liberado — dá pra reposicionar/escalar.'); pintarXRPanel(); }
else if (k === 'medir') { xr.medir.on = !xr.medir.on; if (!xr.medir.on) limparMedirXR(); xrDica(xr.medir.on ? '' + (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '') + ' Toque 2 pontos do modelo pra medir na escala.' : ''); b.style.background = xr.medir.on ? corAtiva() : ''; b.style.color = xr.medir.on ? '#fff' : ''; }
});
xrPanel.addEventListener('change', function (e) {
var b = e.target.closest('[data-x]'); if (!b) return; var k = b.getAttribute('data-x');
if (k === 'pavxr') { if (b.value) isolarPavimento(b.value); else if (pav.isolado) restaurarVisibilidade(); pintarXRPanel(); return; }
if (k === 'esc') aplicarEscalaXR(parseFloat(b.value) || 1);
else if (k === 'esc2') { var v = b.value; aplicarEscalaImersivo(v === 'fit' ? fitEscala() : (parseFloat(v) || 1)); }
});
xrPanel.addEventListener('input', function (e) {
var b = e.target.closest('[data-x]'); if (!b) return; var k = b.getAttribute('data-x');
if (k === 'corte') aplicarTetoVisao((+b.value) / 1000);
else if (k === 'passsens') { var v = S._passSensSet((+b.value) / 100); var lab = xrPanel.querySelector('[data-x="passv"]'); if (lab) lab.textContent = v.toFixed(1) + '×'; }
});
var p3dSeq = 0;
function carregarSintetico(caixas, nome) {
caixas = caixas || [];
if (!caixas.length) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('obra', 15) : '') + ' Nenhuma parede ligada pra gerar.'); return null; }
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
modelo.qto[m.userData.expressID] = { comprimento: c.comprimento, area: c.area, volume: +(c.comprimento * c.altura * c.espessura).toFixed(4), contagem: 1 };
modelo.elementos.push({ id: m.userData.expressID, uid: mid + ':' + m.userData.expressID, mid: mid, arquivo: modelo.nome, tipo: 'IFCWALL', nome: 'Parede ' + (i + 1) + ' (' + c.comprimento.toFixed(2).replace('.', ',') + ' m)', etapa: null, codOrc: null, qto: modelo.qto[m.userData.expressID], disciplina: 'arquitetura' });
modelo.nEl++;
});
S.modelos.push(modelo);
recarimbarIdentidade();
agregarModelo(modelo);
carimbarConsulta();
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
if (S._editReaplicarRem) S._editReaplicarRem();
notifyModelos();
if (S._xrReSnap) S._xrReSnap();
if (opts.onLoaded) opts.onLoaded(elementosVivos());
return mid;
}
S._carregarSintetico = carregarSintetico;
var solo = { grupo: null, vols: [], furos: [], plano: null, opac: 0.5, destaque: null, n: 0 };
function soloV(p) { return new THREE.Vector3(+p[0], +p[2], -(+p[1])); }
function soloLimpar() {
if (solo.grupo) {
solo.grupo.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.dispose(); }); } });
if (solo.grupo.parent) solo.grupo.parent.remove(solo.grupo);
}
solo.grupo = null; solo.vols = []; solo.furos = []; solo.plano = null; solo.destaque = null; solo.n = 0;
}
function soloHexa(v, cor, opac) {
var P = v.map(soloV), pos = [];
var F = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
F.forEach(function (t) { t.forEach(function (i) { pos.push(P[i].x, P[i].y, P[i].z); }); });
var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
var m = new THREE.MeshStandardMaterial({ color: new THREE.Color(cor), transparent: true, opacity: opac, depthWrite: false, side: THREE.DoubleSide, roughness: 0.95, metalness: 0 });
var mesh = new THREE.Mesh(g, m); mesh.renderOrder = 2;
var ar = new THREE.LineSegments(new THREE.EdgesGeometry(g, 20), new THREE.LineBasicMaterial({ color: new THREE.Color(cor).multiplyScalar(0.55), transparent: true, opacity: Math.min(1, opac + 0.3) }));
ar.renderOrder = 3;
return { mesh: mesh, arestas: ar };
}
function soloMostrar(def) {
soloLimpar();
def = def || {};
var vols = def.volumes || [], furos = def.furos || [];
if (!vols.length && !furos.length) return { ok: false, erro: 'sem volumes nem furos para desenhar' };
if (def.opacidade != null) solo.opac = Math.max(0.05, Math.min(1, +def.opacidade));
solo.grupo = new THREE.Group(); solo.grupo.name = 'sondagem3d'; solo.grupo.userData.sondagem = true;
vols.forEach(function (v) {
if (!v || !v.v || v.v.length !== 8) return;
var h = soloHexa(v.v, v.cor || '#c8b58a', solo.opac);
h.mesh.userData = { soloUnidade: v.unidade, nome: v.nome, critico: !!v.critico };
solo.grupo.add(h.mesh); solo.grupo.add(h.arestas);
solo.vols.push({ unidade: v.unidade, mesh: h.mesh, arestas: h.arestas, critico: !!v.critico, cor: v.cor });
});
furos.forEach(function (f) {
if (!f || f.x == null || f.y == null || f.zBoca == null) return;
(f.trechos || []).forEach(function (t) {
var alt = Math.max(0.01, t.ate - t.de);
var cil = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, alt, 18), new THREE.MeshStandardMaterial({ color: new THREE.Color(t.cor || '#999'), roughness: 0.8 }));
var c = soloV([f.x, f.y, f.zBoca - (t.de + t.ate) / 2]); cil.position.copy(c);
cil.userData = { soloFuro: f.id }; solo.grupo.add(cil);
});
var topo = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.06, 18), new THREE.MeshStandardMaterial({ color: 0x1d1d1d }));
topo.position.copy(soloV([f.x, f.y, f.zBoca + 0.03])); solo.grupo.add(topo);
solo.furos.push({ id: f.id, x: f.x, y: f.y, zBoca: f.zBoca });
});
if (def.area && def.area.length >= 4) {
var a = def.area, sh = new THREE.Shape();
sh.moveTo(a[0][0], a[0][1]); for (var i = 1; i < a.length; i++) sh.lineTo(a[i][0], a[i][1]);
var pg = new THREE.ShapeGeometry(sh); pg.rotateX(-Math.PI / 2);
var pl = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: 0x1565c0, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
pl.visible = false; pl.renderOrder = 4; solo.plano = pl; solo.grupo.add(pl);
}
modelRoot.add(solo.grupo);
solo.n = solo.vols.length;
return { ok: true, volumes: solo.vols.length, furos: solo.furos.length };
}
function soloProfundidade(zIfc) {
if (!solo.plano) return false;
if (zIfc == null || !isFinite(+zIfc)) { solo.plano.visible = false; return true; }
solo.plano.position.y = +zIfc; solo.plano.visible = true; return true;
}
function soloAplicarOpac() {
solo.vols.forEach(function (v) {
var alvo = solo.destaque == null ? solo.opac : (v.unidade === solo.destaque ? Math.min(0.92, solo.opac + 0.35) : solo.opac * 0.25);
v.mesh.material.opacity = alvo; v.arestas.material.opacity = Math.min(1, alvo + 0.3);
});
}
S._soloMostrar = soloMostrar; S._soloLimpar = soloLimpar; S._soloProfundidade = soloProfundidade;
S._soloDestacar = function (u) { solo.destaque = (u == null || u === '') ? null : String(u); soloAplicarOpac(); return solo.destaque; };
S._soloOpacidade = function (a) { solo.opac = Math.max(0.05, Math.min(1, +a || 0.5)); soloAplicarOpac(); return solo.opac; };
S._soloEstado = function () {
return { on: !!solo.grupo, volumes: solo.vols.map(function (v) { return { unidade: v.unidade, critico: v.critico, opacidade: +v.mesh.material.opacity.toFixed(3), cor: v.cor }; }),
furos: solo.furos.slice(), plano: solo.plano ? { visivel: solo.plano.visible, y: solo.plano.position.y } : null, destaque: solo.destaque, opacidade: solo.opac,
dentroDoModelRoot: !!(solo.grupo && solo.grupo.parent === modelRoot) };
};
var edit = { on: false, sub: null, p1: null, prov: null, ops: [], seq: 0,
moverId: null, moverMesh: null, esp: 0.15, espLaje: 0.15, alt: 2.8, secao: 0.2,
base: 0, modelo: null, sprites: [], removidosAntes: [],
orto: false, angPre: 0, chain: true, pPrev: null, linhaProv: null,
vigaB: 0.14, vigaH: 0.40, cobIncl: 30, cobAguas: 2, cobBeiral: 0.5, famSel: null, famRot: 0, ghost: null, redo: [], estado: null };
S.edit = edit;
var editPanel = document.createElement('div');
editPanel.style.cssText = 'position:absolute;left:10px;top:52px;z-index:6;display:none;flex-direction:column;gap:8px;background:var(--card-bg,#fff);border:1px solid var(--linha,#d3dce6);border-radius:12px;padding:10px 12px;color:var(--texto,#1a2b3c);font-size:12px;width:280px;max-width:94%';
editPanel.classList.add('bim-flut');
editPanel.innerHTML =
'<div style="display:flex;justify-content:space-between;align-items:center"><b>' + (typeof Icones !== 'undefined' ? Icones.get('editar', 15) : '') + ' Editor <span style="color:var(--texto-fraco,#5b6b7c);font-weight:400">(sintético)</span></b><button class="btn sm" data-ed="fechar">' + (typeof Icones !== 'undefined' ? Icones.get('fechar', 15) : '') + '</button></div>' +
'<div style="display:flex;gap:6px;flex-wrap:wrap">' +
'<button class="btn sm" data-ed="parede">' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Parede</button>' +
'<button class="btn sm" data-ed="laje">' + (typeof Icones !== 'undefined' ? Icones.get('laje', 15) : '') + ' Laje</button>' +
'<button class="btn sm" data-ed="pilar">' + (typeof Icones !== 'undefined' ? Icones.get('pilar', 15) : '') + ' Pilar</button>' +
'<button class="btn sm" data-ed="mover">↔️ Mover</button>' +
'<button class="btn sm" data-ed="apagar">' + (typeof Icones !== 'undefined' ? Icones.get('lixeira', 15) : '') + ' Apagar</button>' +
'<button class="btn sm" data-ed="anotar">' + (typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + ' Anotar</button></div>' +
'<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
'<label style="display:flex;gap:4px;align-items:center">Esp. <input data-ed="esp" class="inp" type="number" value="0.15" step="0.01" min="0.05" max="1.0" style="width:56px"> m</label>' +
'<label style="display:flex;gap:4px;align-items:center">Alt. <input data-ed="alt" class="inp" type="number" value="2.80" step="0.1" min="0.3" max="8" style="width:56px"> m</label>' +
'<label style="display:flex;gap:4px;align-items:center">Pilar <input data-ed="secao" class="inp" type="number" value="0.20" step="0.05" min="0.1" max="1" style="width:56px"> m</label></div>' +
'<input data-ed="txt" class="inp" placeholder="Texto da anotação (para Anotar)" maxlength="200" style="width:100%">' +
'<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
'<button class="btn sm" data-ed="orto" title="Trava a parede na horizontal/vertical (ou segure Shift enquanto desenha)">⟂ Orto</button>' +
'<button class="btn sm" data-ed="angpre" title="Ângulos predefinidos: livre → 45° → 15°">∠ Livre</button>' +
'<button class="btn sm" data-ed="chain" title="A próxima parede continua do fim da anterior (Esc encerra a cadeia)">⛓ Encadear</button>' +
'</div>' +
'<div style="font-size:10.5px;color:var(--texto-fraco,#5b6b7c)">' + (typeof Icones !== 'undefined' ? Icones.get('lampada', 15) : '') + ' Desenhando parede: digite a <b>distância</b> na caixinha junto ao cursor e Enter.</div>' +
'<div style="display:flex;gap:6px;align-items:center"><button class="btn sm" data-ed="undo">' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Desfazer</button><span data-ed="st" style="color:var(--texto-fraco,#5b6b7c);font-size:11.5px"></span></div>' +
'<div style="font-size:11px;color:#b45309;line-height:1.35">' + (typeof Icones !== 'undefined' ? Icones.get('alerta', 15) : '') + ' Volumetria SINTÉTICA de estudo, com QTO exato das peças criadas. Elemento de IFC importado nunca muda — "apagar" só o oculta como removido na edição.</div>';
host.appendChild(editPanel);
S.editPanel = editPanel;
var editMats = null;
function editMat(tipo) {
if (!editMats) {
editMats = {
parede: new THREE.MeshStandardMaterial({ color: 0xd8cfc0, metalness: .05, roughness: .85, side: THREE.DoubleSide }),
laje: new THREE.MeshStandardMaterial({ color: 0x9aa7b4, metalness: .05, roughness: .9, side: THREE.DoubleSide }),
pilar: new THREE.MeshStandardMaterial({ color: 0x7fa7d4, metalness: .1, roughness: .8, side: THREE.DoubleSide }),
viga: new THREE.MeshStandardMaterial({ color: 0x8fb3d9, metalness: .1, roughness: .8, side: THREE.DoubleSide }),
cobertura: new THREE.MeshStandardMaterial({ color: 0xa65a3a, metalness: .05, roughness: .85, side: THREE.DoubleSide }),
sel: new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x114422, metalness: .1, roughness: .6, side: THREE.DoubleSide })
};
}
if (!editMats._marcados) { editMats._marcados = true; Object.keys(EST_NOMES_EDITOR).forEach(function (k) { if (editMats[k]) estMarcarMat(editMats[k], EST_NOMES_EDITOR[k]); }); }
return editMats[tipo] || editMats.parede;
}
var famReg = { lista: {}, cache: {} };
function famDefinir(lista) {
famReg.lista = {}; famReg.cache = {};
(lista || []).forEach(function (f) { if (f && f.id) famReg.lista[f.id] = f; });
}
function famAval(famId, tipoId, inst) {
var f = famReg.lista[famId]; if (!f || !window.Familia) return null;
var k = famId + '|' + (tipoId || '') + '|' + JSON.stringify(inst || {});
if (!famReg.cache[k]) famReg.cache[k] = window.Familia.avaliar(f, tipoId, inst || {});
return famReg.cache[k];
}
var famMats = {};
var FAM_PBR = {
'louça branca': { cor: 0xf3f3f0, rug: 0.25, met: 0, cc: 0.5, ccr: 0.15 }, 'branco': { cor: 0xf0f0ee, rug: 0.32, met: 0, cc: 0.4, ccr: 0.18 },
'metal cromado': { cor: 0xe9ebef, rug: 0.06, met: 1 }, 'inox': { cor: 0xc6cacf, rug: 0.38, met: 1 }, 'aço inox': { cor: 0xc6cacf, rug: 0.38, met: 1 },
'latão': { cor: 0xc9a24a, rug: 0.28, met: 1 }, 'plástico': { cor: 0xd6d8da, rug: 0.45, met: 0 }, 'pvc': { cor: 0xece9e1, rug: 0.5, met: 0 },
'polietileno azul': { cor: 0x1d5fae, rug: 0.42, met: 0, cc: 0.25, ccr: 0.3 }, 'ferro fundido': { cor: 0x3a3d42, rug: 0.55, met: 0.5 },
'água': { cor: 0xc9dbe2, rug: 0.04, met: 0, cc: 1, ccr: 0.02 },
'fibra azul': { cor: 0x2f86c4, rug: 0.3, met: 0, cc: 0.6, ccr: 0.12 }, 'borda da piscina': { cor: 0xf1f0ea, rug: 0.4, met: 0, cc: 0.3, ccr: 0.2 },
'vidro temperado': { cor: 0x8fcfdc, rug: 0.04, met: 0, op: 0.42 },
'água da piscina': { cor: 0x55c3e6, rug: 0.03, met: 0, cc: 1, ccr: 0.02, op: 0.5 },
'equipamento preto': { cor: 0x26282b, rug: 0.5, met: 0.15 }, 'equipamento laranja': { cor: 0xf2692a, rug: 0.4, met: 0 }, 'equipamento verde': { cor: 0x8cc63f, rug: 0.4, met: 0 },
'equipamento bege': { cor: 0xebe2cb, rug: 0.35, met: 0, cc: 0.3, ccr: 0.25 },
'equipamento verde-água': { cor: 0x10757e, rug: 0.32, met: 0, cc: 0.35, ccr: 0.2 }, 'equipamento vermelho': { cor: 0xc0393b, rug: 0.4, met: 0 },
'equipamento azul': { cor: 0x2095ca, rug: 0.38, met: 0 }, 'equipamento cinza': { cor: 0x7c7f7a, rug: 0.5, met: 0 }, 'acrílico transparente': { cor: 0xdfe9ee, rug: 0.05, met: 0, op: 0.25 },
'madeira nogueira': { cor: 0x6b4a32, rug: 0.55, met: 0, cc: 0.15, ccr: 0.4 }, 'madeira clara': { cor: 0xb58a55, rug: 0.6, met: 0 }, 'madeira escura': { cor: 0x3b2a20, rug: 0.55, met: 0, cc: 0.15, ccr: 0.4 },
'madeira deck': { cor: 0x6a3d25, rug: 0.7, met: 0 }, 'madeira freijo': { cor: 0xa27240, rug: 0.55, met: 0, cc: 0.12, ccr: 0.4 },
'laca branca': { cor: 0xf2f2ef, rug: 0.3, met: 0, cc: 0.4, ccr: 0.25 }, 'laca grafite': { cor: 0x3a3d40, rug: 0.38, met: 0, cc: 0.4, ccr: 0.25 },
'metal preto': { cor: 0x1f2023, rug: 0.45, met: 0.6 }, 'marmore branco': { cor: 0xece9e4, rug: 0.12, met: 0, cc: 0.6, ccr: 0.1 }, 'quartzo branco': { cor: 0xe9e8e4, rug: 0.2, met: 0, cc: 0.45, ccr: 0.15 },
'granito preto': { cor: 0x1d1e20, rug: 0.2, met: 0, cc: 0.5, ccr: 0.12 }, 'vidro fume': { cor: 0x4a5560, rug: 0.05, met: 0, op: 0.45 }, 'espelho': { cor: 0xc9d3d8, rug: 0.03, met: 1 },
'tela preta': { cor: 0x0b0c0e, rug: 0.08, met: 0, cc: 1, ccr: 0.05 }, 'couro caramelo': { cor: 0x9a5f34, rug: 0.5, met: 0, cc: 0.1, ccr: 0.5 }, 'colchao': { cor: 0xe9e5dc, rug: 0.95, met: 0 },
'roupa de cama': { cor: 0xe2ded4, rug: 0.92, met: 0 }, 'manta cinza': { cor: 0x9a9a98, rug: 0.95, met: 0 }, 'cimento queimado': { cor: 0x9b9a96, rug: 0.85, met: 0 },
'tijolo refratario': { cor: 0xc79a6a, rug: 0.9, met: 0 }, 'tijolinho aparente': { cor: 0xb5683f, rug: 0.92, met: 0 }, 'tijolinho escuro': { cor: 0x5d4a40, rug: 0.92, met: 0 }, 'pedra cinza': { cor: 0x8a8d8f, rug: 0.9, met: 0 }, 'acrilico branco': { cor: 0xf7f7f5, rug: 0.15, met: 0, cc: 0.6, ccr: 0.1 },
'borracha preta': { cor: 0x1a1a1a, rug: 0.8, met: 0 }, 'linho natural': { cor: 0xcdbfa6, rug: 0.95, met: 0 }, 'tecido cinza': { cor: 0x777a7e, rug: 0.95, met: 0 },
'tecido bege': { cor: 0xb09b7e, rug: 0.95, met: 0 }, 'tecido grafite': { cor: 0x35383c, rug: 0.95, met: 0 }, 'tecido verde': { cor: 0x5a7058, rug: 0.95, met: 0 },
'tecido terracota': { cor: 0xb4603f, rug: 0.95, met: 0 }, 'tecido azul': { cor: 0x4a6a8a, rug: 0.95, met: 0 }, 'terra': { cor: 0x5a4332, rug: 0.98, met: 0 },
'ceramica terracota': { cor: 0xb5623c, rug: 0.7, met: 0 }, 'tronco palmeira': { cor: 0x6a5238, rug: 0.95, met: 0 }, 'casca de arvore': { cor: 0x7b6a5a, rug: 0.95, met: 0 },
'folha verde escura': { cor: 0x2f5a2e, rug: 0.6, met: 0 }, 'folha verde': { cor: 0x4a7f35, rug: 0.6, met: 0 }, 'folha verde clara': { cor: 0x7fae4a, rug: 0.6, met: 0 }, 'folha variegada': { cor: 0x6f9a48, rug: 0.55, met: 0 },
'flor amarela': { cor: 0xf2c53a, rug: 0.6, met: 0 }, 'flor rosa': { cor: 0xe58aa6, rug: 0.6, met: 0 }, 'flor lilas': { cor: 0xb48ad2, rug: 0.6, met: 0 }, 'flor azul': { cor: 0x6f7fd8, rug: 0.6, met: 0 }, 'flor branca': { cor: 0xf4f2ee, rug: 0.6, met: 0 },
'grama esmeralda': { cor: 0x3f7d2b, rug: 0.95, met: 0 }, 'grama amendoim': { cor: 0x5f9b35, rug: 0.95, met: 0 }, 'seixo': { cor: 0xd8d0c0, rug: 0.7, met: 0 },
'tecido off-white': { cor: 0xe6e1d6, rug: 0.95, met: 0 }, 'tecido mostarda': { cor: 0xc79a2e, rug: 0.95, met: 0 }, 'tecido rosa': { cor: 0xd9a1a8, rug: 0.95, met: 0 },
'tecido linho': { cor: 0xcdbfa6, rug: 0.95, met: 0 }, 'tecido veludo verde': { cor: 0x2f5a45, rug: 0.9, met: 0 }, 'tecido veludo azul': { cor: 0x1f3f6a, rug: 0.9, met: 0 },
'tecido veludo rosa': { cor: 0xc98a97, rug: 0.9, met: 0 }, 'tecido boucle': { cor: 0xe4dfd3, rug: 0.97, met: 0 }, 'couro preto': { cor: 0x1c1b1b, rug: 0.45, met: 0, cc: 0.1, ccr: 0.5 },
'couro marrom': { cor: 0x5a3722, rug: 0.45, met: 0, cc: 0.1, ccr: 0.5 }, 'couro sintetico preto': { cor: 0x1f1e1e, rug: 0.5, met: 0, cc: 0.1, ccr: 0.5 }, 'mdf carvalho': { cor: 0xb98d5a, rug: 0.6, met: 0 },
'mdf nogueira': { cor: 0x6b4a32, rug: 0.55, met: 0, cc: 0.15, ccr: 0.4 }, 'mdf freijo': { cor: 0xa27240, rug: 0.55, met: 0, cc: 0.12, ccr: 0.4 }, 'mdf branco': { cor: 0xf1f1ef, rug: 0.4, met: 0, cc: 0.2, ccr: 0.3 },
'mdf off-white': { cor: 0xe8e4da, rug: 0.4, met: 0, cc: 0.2, ccr: 0.3 }, 'mdf grafite': { cor: 0x3a3d40, rug: 0.4, met: 0, cc: 0.2, ccr: 0.3 }, 'mdf preto': { cor: 0x1f2023, rug: 0.4, met: 0, cc: 0.2, ccr: 0.3 },
'mdf verde': { cor: 0x4f6a52, rug: 0.4, met: 0, cc: 0.2, ccr: 0.3 }, 'mdf azul': { cor: 0x3f5f82, rug: 0.4, met: 0, cc: 0.2, ccr: 0.3 }, 'metal branco': { cor: 0xe9e9e6, rug: 0.4, met: 0.6 },
'metal cobre': { cor: 0xb87333, rug: 0.35, met: 1 }, 'metal dourado': { cor: 0xc9a24a, rug: 0.3, met: 1 }, 'vidro': { cor: 0xc6dde6, rug: 0.05, met: 0, op: 0.3 },
'palha natural': { cor: 0xc9b17f, rug: 0.9, met: 0 }, 'rattan natural': { cor: 0xb99b6b, rug: 0.85, met: 0 }, 'concreto': { cor: 0x9c9b97, rug: 0.85, met: 0 },
'aço galvanizado': { cor: 0xaab0b4, rug: 0.45, met: 0.85 }, 'aço zincado bicromatizado': { cor: 0xc9a227, rug: 0.38, met: 0.85, cc: 0.3, ccr: 0.2 }, 'aço preto oxidado': { cor: 0x1e1e1e, rug: 0.55, met: 0.6 }, 'aço grafite': { cor: 0x5a5d61, rug: 0.5, met: 0.6 },
'madeira pinus': { cor: 0xd9964a, rug: 0.7, met: 0 }, 'madeira eucalipto': { cor: 0xb07a4a, rug: 0.7, met: 0 }, 'borracha': { cor: 0x1a1a1a, rug: 0.9, met: 0 },
'tela pe': { cor: 0x5b8c3a, rug: 0.8, met: 0, op: 0.55 }, 'tela pe laranja': { cor: 0xf08a24, rug: 0.8, met: 0, op: 0.55 },
'aço galvanizado perfurado': { cor: 0xaab0b4, rug: 0.45, met: 0.85 }, 'alumínio do alçapão': { cor: 0xaeaeae, rug: 0.4, met: 0.85 }
};
function famMatPBR(k, nome) {
var d = FAM_PBR[k], o = { color: new THREE.Color(d.cor), roughness: d.rug, metalness: d.met, side: THREE.DoubleSide };
if (d.op) { o.transparent = true; o.opacity = d.op; o.depthWrite = false; }
var m = d.cc ? new THREE.MeshPhysicalMaterial(Object.assign(o, { clearcoat: d.cc, clearcoatRoughness: d.ccr })) : new THREE.MeshStandardMaterial(o);
m.userData.famPBR = true;
estMarcarMat(m, String(nome || '').trim() || k);
return m;
}
var FAM_CORES = { madeira: 0xb88a5a, 'alumínio': 0xc9ced6, aluminio: 0xc9ced6, vidro: 0x9fd3f0, concreto: 0xa9b0b8, granito: 0x4a4a4a,
inox: 0xd0d4d8, 'louça branca': 0xf4f4f2, 'mdf branco': 0xf1f1ef, 'polietileno azul': 0x2c6fbf, metal: 0x8a8f96, 'aço': 0x8a8f96,
'metal cromado': 0xcfd3d8, 'aço inox': 0xd0d4d8, pvc: 0xe6e3d6, polietileno: 0x2c6fbf, 'ferro fundido': 0x3b3f45, branco: 0xf1f1ee, 'plástico': 0xdfe1e3,
vermelho: 0xc62828, azul: 0x2c6fbf, preto: 0x24262a, 'cinza escuro': 0x5a5f66, 'cinza claro': 0xc9ccd0, latao: 0xb89b47, 'latão': 0xb89b47, brita: 0x9a9a96,
'alumínio branco': 0xf2f2ef, 'alumínio preto': 0x2a2c2f, 'alumínio bronze': 0x6e5a48 };
function famMat(nome) {
var k = String(nome || '').toLowerCase().trim();
if (famMats[k]) return famMats[k];
if (FAM_PBR[k]) { var mPBR = famMatPBR(k, nome); if (k === 'aço galvanizado perfurado' && window.FamiliasAndaimeM && FamiliasAndaimeM.materialPerfurado) FamiliasAndaimeM.materialPerfurado(THREE, mPBR); return (famMats[k] = mPBR); }
var acE = acabEnt(nome);
if (acE) return (famMats[k] = acabMat(acE, false));
var cor = FAM_CORES[k];
if (cor == null) { var h = 0; for (var i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0; cor = k ? (0x808080 + (h & 0x3f3f3f)) : 0xc8ccd2; }
var vidro = k.indexOf('vidro') >= 0;
famMats[k] = new THREE.MeshStandardMaterial({ color: luzNum(cor), metalness: k === 'inox' || k === 'metal' || k === 'alumínio' ? 0.5 : 0.05, roughness: vidro ? 0.1 : 0.7,
transparent: vidro, opacity: vidro ? 0.35 : 1, side: THREE.DoubleSide, depthWrite: !vidro });
estMarcarMat(famMats[k], String(nome || '').trim() || k);
return famMats[k];
}
var FAM_IFC = { porta: 'IFCDOOR', janela: 'IFCWINDOW', pilar: 'IFCCOLUMN', viga: 'IFCBEAM', mobiliario: 'IFCFURNISHINGELEMENT', cozinha: 'IFCFURNISHINGELEMENT', banho: 'IFCFURNISHINGELEMENT', lazer: 'IFCFURNISHINGELEMENT',
loucas: 'IFCSANITARYTERMINAL', equipamento: 'IFCFLOWSTORAGEDEVICE', estrutural: 'IFCMEMBER', generico: 'IFCBUILDINGELEMENTPROXY',
parede: 'IFCWALL', laje: 'IFCSLAB', piso: 'IFCCOVERING',
acessorio_tubo: 'IFCVALVE', dispositivo_eletrico: 'IFCOUTLET', luminaria: 'IFCLIGHTFIXTURE', equipamento_eletrico: 'IFCELECTRICDISTRIBUTIONBOARD',
conexao_tubo: 'IFCPIPEFITTING', conexao_duto: 'IFCDUCTFITTING', conexao_eletroduto: 'IFCCABLECARRIERFITTING' };
function famMalhas(av, inst, matSobre) {
var inclRad = inst && inst.inst && isFinite(Number(inst.inst.Inclinacao_rad)) ? Number(inst.inst.Inclinacao_rad) : 0;
var out = [], M = new THREE.Matrix4().compose(new THREE.Vector3(inst.x, inst.y, inst.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(inclRad, inst.rotY || 0, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
(av.solidos || []).forEach(function (s) {
var g = null, m, matProprio = null;
try {
if (s.forma === 'caixa') { g = new THREE.BoxGeometry(s.dx, s.dy, s.dz); m = new THREE.Mesh(g); m.position.set(s.x, s.y + s.dy / 2, s.z); m.rotation.y = (s.rot || 0) * Math.PI / 180; }
else if (s.forma === 'malha') {
g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(s.v, 3)); g.setIndex(s.f);
if (!s.suave && s.f.length < 600000) g = g.toNonIndexed();
g.computeVertexNormals(); m = new THREE.Mesh(g); m.position.set(s.x || 0, s.y || 0, s.z || 0);
if (s.origemForma === 'gerada') famLodRegistrar(m, s);
if (!matSobre && (s.cor || s.transparencia)) matProprio = famMatCor(s.material, s.cor, s.transparencia);
}
else if (s.forma === 'cilindro') {
g = new THREE.CylinderGeometry(s.raio, s.raio, s.altura, 28); m = new THREE.Mesh(g);
if (s.eixo === 'x') { m.rotation.z = -Math.PI / 2; m.position.set(s.x + s.altura / 2, s.y, s.z); }
else if (s.eixo === 'z') { m.rotation.x = Math.PI / 2; m.position.set(s.x, s.y, s.z + s.altura / 2); }
else m.position.set(s.x, s.y + s.altura / 2, s.z);
} else {
var sh = new THREE.Shape();
(s.contorno || []).forEach(function (q, i) { var px = q[0], py = s.plano === 'frente' ? q[1] : -q[1]; if (i) sh.lineTo(px, py); else sh.moveTo(px, py); });
g = new THREE.ExtrudeGeometry(sh, { depth: s.altura, bevelEnabled: false });
if (s.plano !== 'frente') g.rotateX(-Math.PI / 2);
m = new THREE.Mesh(g); m.position.set(s.x, s.y, s.z); m.rotation.y = (s.rot || 0) * Math.PI / 180;
}
} catch (e) { return; }
if (!matSobre && !matProprio && s.peca && s.cor) matProprio = famMatCor(s.material, s.cor, 0);
m.material = matSobre || matProprio || famMat(s.material);
m.updateMatrix(); m.applyMatrix4(M);
if (s.id != null) m.userData.famSolido = s.id;
if (s.parte) m.userData.parte = s.parte;
if (/^água da piscina$/i.test(String(s.material || ''))) m.userData.sem2d = true;
out.push(m);
});
if (av.linhasPlanta && av.linhasPlanta.length && out.length) {
var cR = Math.cos(inst.rotY || 0), sR = Math.sin(inst.rotY || 0), lp = av.linhasPlanta, w = [];
for (var iL = 0; iL + 3 < lp.length; iL += 4) w.push(inst.x + lp[iL] * cR + lp[iL + 1] * sR, inst.z - lp[iL] * sR + lp[iL + 1] * cR, inst.x + lp[iL + 2] * cR + lp[iL + 3] * sR, inst.z - lp[iL + 2] * sR + lp[iL + 3] * cR);
var yF = av.caixa ? [inst.y + av.caixa.y0, inst.y + av.caixa.y1] : [inst.y, inst.y + 2];
out.forEach(function (mm, iM) { mm.userData.fimpSem2d = true; if (!iM) { mm.userData.fimpPlanta = w; mm.userData.fimpFaixaY = yF; } });
}
if (av.simboloPlanta && out.length && window.FamiliasMob && window.FamiliasMob.linhasPlanta) {
try {
var lpm = window.FamiliasMob.linhasPlanta(av.simboloPlanta), cM = Math.cos(inst.rotY || 0), sM = Math.sin(inst.rotY || 0), wM = [];
for (var iQ = 0; iQ + 3 < lpm.length; iQ += 4) wM.push(inst.x + lpm[iQ] * cM + lpm[iQ + 1] * sM, inst.z - lpm[iQ] * sM + lpm[iQ + 1] * cM, inst.x + lpm[iQ + 2] * cM + lpm[iQ + 3] * sM, inst.z - lpm[iQ + 2] * sM + lpm[iQ + 3] * cM);
var yM = av.caixa ? [inst.y + av.caixa.y0, inst.y + av.caixa.y1] : [inst.y, inst.y + 1];
out.forEach(function (mm, iM) { mm.userData.mobSem2d = true; if (!iM) { mm.userData.mobPlanta = wM; mm.userData.mobFaixaY = yM; } });
} catch (eMob) { }
}
if (av.luz) out.forEach(function (mm, iM) { if (!iM) mm.userData.luz = { potencia: av.luz.potencia, fluxo: av.luz.fluxo, temperatura: av.luz.temperatura,
posicao: [inst.x + av.luz.posicao[0] * Math.cos(inst.rotY || 0) + av.luz.posicao[2] * Math.sin(inst.rotY || 0), inst.y + av.luz.posicao[1], inst.z - av.luz.posicao[0] * Math.sin(inst.rotY || 0) + av.luz.posicao[2] * Math.cos(inst.rotY || 0)] }; });
return out;
}
function famNivelDe(fam) {
var NV = window.BimInstNivel; if (!NV || !fam || !window.BimInstUI || !BimInstUI.nivelCena) return null;
if (BimInstUI._previaHidro && !BimInstUI._previaHidro()) return null;
var cls = NV.classeDaCategoria(fam.categoria); if (!cls) return null;
return { cls: cls, nivel: NV.norm(BimInstUI.nivelCena(), 'alto') };
}
function famMalhasNivel(av, fi, fam) {
if (fam && fam.categoria === 'andaime') return [];
var fn = famNivelDe(fam), NV = window.BimInstNivel;
if (fn && fn.nivel === 'baixo' && av.caixa && BimInstUI._malhaG && BimInstUI._matLinha) {
var segs = NV.contornoFamilia(av.caixa, fi, { id: fi.id, louca: fn.cls === 'aparelho' }), est = NV.estiloSeg({ papel: 'contorno' });
var ml = NV.malhaLinhas(segs, NV.raioPena(est.mm, NV.ESCALA_PADRAO));
if (ml.idx.length) {
var mc = BimInstUI._malhaG(THREE, ml, BimInstUI._matLinha(THREE, est.cor));
mc.userData.instUnif = true; mc.userData.instFam = true; mc.userData.instNivel = 'baixo';
return [mc];
}
}
var ms = famMalhas(av, fi);
if (fn) ms.forEach(function (m) {
m.userData.instFam = true; m.userData.instNivel = fn.nivel;
if (m.userData.famLod) { m.userData.famLodFixo = fn.nivel === 'medio' ? 1 : null; if (fn.nivel === 'medio') famLodNivel(m, 1); }
});
return ms;
}
function portaNativa(fam, av, fi, malhas) {
var SPn = window.SimboloPorta;
if (!SPn || !fam || fam.categoria !== 'porta' || !av || !av.solidos || !av.solidos.length || !malhas.length) return;
if (av.linhasPlanta && av.linhasPlanta.length) return;
try {
var pf = SPn.daFamilia(fam, av, fi.inst || {}), cR = Math.cos(fi.rotY || 0), sR = Math.sin(fi.rotY || 0);
var sp = SPn.gerar({ centro: [fi.x, fi.z], dir: [cR, -sR], largura: pf.largura, espParede: pf.espParede, espFolha: pf.espFolha,
dobradica: pf.dobradica, abre: pf.abre, tipo: pf.tipo, folhas: pf.folhas });
if (!sp.ok) return;
malhas[0].userData.portaPlanta = sp;
malhas[0].userData.portaFaixaY = av.caixa && isFinite(av.caixa.y0) ? [fi.y + av.caixa.y0, fi.y + av.caixa.y1] : [fi.y, fi.y + 2.1];
var fids = {}; pf.folhaIds.forEach(function (x) { fids[x] = 1; });
malhas.forEach(function (mm) { if (mm.userData.famSolido != null && fids[mm.userData.famSolido]) mm.userData.portaFolha = true; });
} catch (eSp) { }
}
var famMatsCor = {};
function famMatCor(nome, cor, transp) {
var k = String(nome || '') + '|' + (cor || '') + '|' + (transp || 0);
if (famMatsCor[k]) return famMatsCor[k];
var hx = /^#?([0-9a-f]{6})$/i.exec(String(cor || '')), base = hx ? parseInt(hx[1], 16) : null;
if (base == null) return (famMatsCor[k] = famMat(nome));
var tr = Math.max(0, Math.min(0.95, +transp || 0));
famMatsCor[k] = new THREE.MeshStandardMaterial({ color: luzNum(base), metalness: 0.05, roughness: tr > 0.3 ? 0.1 : 0.7, transparent: tr > 0, opacity: 1 - tr, side: THREE.DoubleSide, depthWrite: tr <= 0 });
famMatsCor[k].userData.famCor = true;
estMarcarMat(famMatsCor[k], String(nome || '').trim() || k);
return famMatsCor[k];
}
S._famDefinir = famDefinir; S._famAval = famAval;
S._famCorDefinida = function (nome) { var k = String(nome || '').toLowerCase().trim(); return !!(FAM_PBR[k] || FAM_CORES[k] != null || acabEnt(nome)); };
var famLod = { lista: [], quadro: 0 };
function famLodRegistrar(m, s) {
var geos = [m.geometry];
(s.lod || []).forEach(function (l) {
if (!l || !l.f || !l.f.length) { geos.push(m.geometry); return; }
var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(l.v, 3)); g.setIndex(l.f); g.computeVertexNormals(); geos.push(g);
});
m.userData.famPremium = true; m.userData.famLod = geos; m.userData.famLodNivel = 0;
famLod.lista.push(m);
}
function famLodNivel(m, n) {
var gs = m.userData.famLod; if (!gs || m.userData.famLodNivel === n) return;
m.geometry = gs[Math.min(n, gs.length - 1)]; m.userData.famLodNivel = n;
}
var _famLodV = new THREE.Vector3();
S._famLodTudo0 = function () { famLod.lista.forEach(function (m) { famLodNivel(m, 0); }); };
S._tickExtra.push(function () {
if (++famLod.quadro % 15 || !famLod.lista.length) return;
var desenho = !S.camera.isPerspectiveCamera || (S.planta && S.planta.on) || (S.corteL && S.corteL.on);
famLod.lista = famLod.lista.filter(function (m) {
if (!m.userData || !m.userData.famLod) return false;
var vivo = false; for (var p = m.parent; p; p = p.parent) if (p === S.scene) { vivo = true; break; }
if (!vivo) { if (!m.parent) { (m.userData.famLod || []).forEach(function (g) { if (g !== m.geometry) try { g.dispose(); } catch (_) {} }); return false; } return true; }
if (desenho) { famLodNivel(m, 0); return true; }
if (m.userData.famLodFixo != null) { famLodNivel(m, m.userData.famLodFixo); return true; }
if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
_famLodV.copy(m.geometry.boundingSphere.center); m.localToWorld(_famLodV);
var d = _famLodV.distanceTo(S.camera.position);
famLodNivel(m, d < 8 ? 0 : (d < 25 ? 1 : 2));
return true;
});
});
S._luzes = function () {
var out = [];
try { if (edit.modelo && edit.modelo.grupo) edit.modelo.grupo.children.forEach(function (m) { var l = m.userData && m.userData.luz; if (l) out.push({ id: m.userData.expressID, potencia: l.potencia, fluxo: l.fluxo, temperatura: l.temperatura, posicao: l.posicao.slice() }); }); } catch (e) {}
return out;
};
S._famCat = function (id) { var f = famReg.lista[id]; return f ? f.categoria : null; };
function editBase() {
try {
var bb = new THREE.Box3(), tem = false;
S.modelos.forEach(function (mo) { if (mo.mid === 'edit' || !mo.grupo) return; bb.expandByObject(mo.grupo); tem = true; });
return (!tem || bb.isEmpty()) ? 0 : bb.min.y;
} catch (_) { return 0; }
}
S._pontoPlanoY = function (clientX, clientY, y) {
var rc = canvasEl.getBoundingClientRect(), m = new THREE.Vector2(((clientX - rc.left) / rc.width) * 2 - 1, -((clientY - rc.top) / rc.height) * 2 + 1), rr = new THREE.Raycaster(), alvo = new THREE.Vector3();
rr.setFromCamera(m, camera);
return rr.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -(+y || 0)), alvo) ? { x: alvo.x, y: alvo.y, z: alvo.z } : null;
};
function editPontoPlano(clientX, clientY) {
var rc = canvasEl.getBoundingClientRect();
mouse.x = ((clientX - rc.left) / rc.width) * 2 - 1; mouse.y = -((clientY - rc.top) / rc.height) * 2 + 1;
ray.setFromCamera(mouse, camera);
var alvo = new THREE.Vector3();
if (edit.sub !== 'inst' && window.BimPlano && BimPlano.ativo && BimPlano.ativo()) {
var pq = BimPlano.pontoNoPlano({ origem: [ray.ray.origin.x, ray.ray.origin.y, ray.ray.origin.z], direcao: [ray.ray.direction.x, ray.ray.direction.y, ray.ray.direction.z] });
return pq ? alvo.set(pq[0], pq[1], pq[2]) : null;
}
var yPl = edit.sub !== 'inst' ? edit.base : (edit.instY != null ? edit.instY : (window.BimInstUI && BimInstUI.planoY ? BimInstUI.planoY(edit.base) : edit.base));
var plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), -yPl);
return ray.ray.intersectPlane(plano, alvo) ? alvo : null;
}
function planoBase() { try { var yb = window.BimPlano && BimPlano.alturaBase ? BimPlano.alturaBase() : null; if (yb != null && isFinite(yb)) edit.base = yb; } catch (_) {} }
function editTirarProv() {
if (edit.prov) { limparMarca(edit.prov); edit.prov = null; }
edit.p1 = null; edit.instY = null;
editPreviewLimpar();
volLimpar();
if (S._b2Cancelar) S._b2Cancelar();
if (S._p3) S._p3.cancelar();
if (S._metc) S._metc.cancelar();
if (S._cot) S._cot.cancelar();
if (S._metp) S._metp.cancelar();
if (S._mtq) S._mtq.cancelar();
}
function editAjustarPonto(p, ev) {
if (!edit.p1 || !p || (edit.sub !== 'parede' && edit.sub !== 'viga' && edit.sub !== 'inst' && !(edit.b2 && /^(eixo|laje|furo|guarda|escada)$/.test(edit.sub)))) return p;
if (ev && ev._semAjuste) return p;
if (edit.b2 && edit.b2.lajeModo === 'retangulo' && (edit.sub === 'laje' || edit.sub === 'furo') && edit.b2pts && edit.b2pts.length === 1) return p;
if (window.BimBarraOpcoes && BimBarraOpcoes.substituiPainel && BimBarraOpcoes.substituiPainel()) {
var uB = (S._prec && S._prec.api && S._prec.api.estado) ? S._prec.api.estado().ultimo : null;
if (uB && uB.tipo && /^(fim|intersecao|meio|centro|perpendicular|centroide|quadrante|insercao|no|tangente|aparente|paralelo|rastreamento)$/.test(uB.tipo) && uB.p && Math.abs(uB.p.x - p.x) < 1e-6 && Math.abs(uB.p.z - p.z) < 1e-6) return p;
var rB = BimBarraOpcoes.ajustarPonto(edit.sub, { x: edit.p1.x, z: edit.p1.z }, { x: p.x, z: p.z }, !!(ev && ev.shiftKey), { grade: !uB || !uB.tipo || uB.tipo === 'grade' });
var qB = p.clone(); qB.x = rB.p.x; qB.z = rB.p.z; qB.y = edit.p1.y; return qB;
}
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
var editDist = document.createElement('div');
editDist.style.cssText = 'position:absolute;z-index:6;display:none;background:rgba(255,255,255,.98);border:1px solid var(--aco,#2d6a9c);border-radius:var(--raio-sm,8px);padding:3px 6px;color:var(--texto,#1a2b3c);font-size:12px;white-space:nowrap;pointer-events:auto';
editDist.innerHTML = '<span data-edd="txt" style="font-weight:600;color:var(--aco,#2d6a9c)"></span> <input data-edd="inp" inputmode="decimal" placeholder="m" style="width:52px;background:#ffffff;border:1px solid #9db4c8;border-radius:5px;color:var(--texto,#1a2b3c);font-size:12px;padding:1px 4px">';
host.appendChild(editDist);
S.editDist = editDist;
function editPreviewLimpar() {
if (edit.linhaProv) { scene.remove(edit.linhaProv); if (edit.linhaProv.geometry) edit.linhaProv.geometry.dispose(); edit.linhaProv = null; }
edit.pPrev = null;
editDist.style.display = 'none';
}
function editPreview(p, clientX, clientY) {
if (!edit.p1 || !p) { editPreviewLimpar(); return; }
edit.pPrev = p.clone();
if (!edit.linhaProv) {
if (!edit._linhaMat) edit._linhaMat = new THREE.LineBasicMaterial({ color: 0x2fbf71, depthTest: false });
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
editDist.addEventListener('keydown', function (e) {
if (e.key === 'Escape') {
e.stopPropagation();
var iEsc = editDist.querySelector('[data-edd="inp"]'); if (iEsc) { iEsc.value = ''; iEsc.blur(); }
if (S._editFimCadeia) S._editFimCadeia();
return;
}
e.stopPropagation();
if (e.key !== 'Enter') return;
if (S._volDistDigitada && S._volDistDigitada()) return;
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
if (edit.sub === 'viga' || edit.sub === 'inst') { editClique({ clientX: 0, clientY: 0, shiftKey: false }, null, p2); return; }
if (edit.sub !== 'parede') return;
editConcluirParede(p2);
});
function editConcluirParede(p2) {
var cxP = BimEdit.parede({ x: edit.p1.x, z: edit.p1.z }, { x: p2.x, z: p2.z }, edit.esp, edit.alt, edit.base);
if (!cxP) {
var dLonge = Math.sqrt(Math.pow(p2.x - edit.p1.x, 2) + Math.pow(p2.z - edit.p1.z, 2));
S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + (dLonge > 1e4 || !isFinite(dLonge) ? ' Ponto longe demais (clique perto do horizonte?) — clique o fim da parede sobre o piso.' : ' Pontos muito próximos — clique 2 pontos distintos.'));
return;
}
if (edit.b2 && window.BimArq) BimArq.marcarParede(cxP, S._b2CfgParede ? S._b2CfgParede() : {});
editOp({ op: 'criar', id: 'e' + (++edit.seq), caixa: cxP });
var comp = cxP.comprimento.toFixed(2).replace('.', ',');
if (edit.chain) {
if (edit.prov) { limparMarca(edit.prov); edit.prov = null; }
editPreviewLimpar();
edit.p1 = p2.clone();
edit.prov = pontoMarca(p2); scene.add(edit.prov); rescaleObj(edit.prov);
S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Parede criada (' + comp + ' m). ⛓ Continuando do fim — clique o próximo ponto, ou Esc pra encerrar.');
} else {
editTirarProv();
S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Parede criada (' + comp + ' m). Siga clicando, ou Esc.');
}
marcarFechamento();
}
S._editFimCadeia = function () {
editTirarProv();
S._hint(edit.sub ? '' + (typeof Icones !== 'undefined' ? Icones.get('editar', 15) : '') + ' Traço encerrado — clique o INÍCIO da próxima parede.' : '');
marcarFechamento();
};
var _edPrevT = 0;
S._editPreviewMove = function (e) {
var t2 = performance.now(); if (t2 - _edPrevT < 33) return; _edPrevT = t2;
if (edit.sub === 'familia') { editGhostMover(e); return; }
if (VOL_SUBS[edit.sub]) { volPreviewMove(e); return; }
var hit2 = raycastEm(e.clientX, e.clientY);
var sn2 = hit2 ? aplicarSnap(hit2, raioToque(e)) : null;
var pM = sn2 ? sn2.p.clone() : editPontoPlano(e.clientX, e.clientY);
if (!pM) return;
var pA = editAjustarPonto(pM, e);
if (edit.sub === 'inst' && edit.p1 && pA && window.BimInstUI && BimInstUI.previaPonto) { var qI = BimInstUI.previaPonto({ x: edit.p1.x, z: edit.p1.z }, { x: pA.x, z: pA.z }, e); if (qI) { pA = pA.clone(); pA.x = qI.x; pA.z = qI.z; } }
editPreview(pA, e.clientX, e.clientY);
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
function editUidRemovido(info) {
if (S.meshPorUid[info.uid]) return info.uid;
if (info.arq != null && info.eid != null) {
var mo2 = S.modelos.filter(function (x) { return x.mid !== 'edit' && x.nome === info.arq; })[0];
if (mo2) return mo2.mid + ':' + info.eid;
}
return info.uid;
}
function editRebuild() {
var tR = { t0: performance.now() };
if (edit.removidosAntes.length) {
var ra = {}; edit.removidosAntes.forEach(function (u) { ra[u] = 1; });
todasMalhas(function (m) { if (ra[m.userData.mid + ':' + m.userData.expressID]) m.visible = !ehFuturo4d(m); });
}
editSoltarSel();
ABR.ativas = ABR.ativas.filter(function (pt) { return pt.mid !== 'edit'; });
S._partesVersao = (S._partesVersao || 0) + 1;
if (S.selected && S.selected.userData && S.selected.userData.mid === 'edit') { S.selected = null; S.prevMat = null; if (S._contornoSelecao) S._contornoSelecao(null); }
if (edit.modelo) {
desagregarModelo(edit.modelo);
modelRoot.remove(edit.modelo.grupo);
edit.modelo.grupo.traverse(function (o) { if (o.geometry && !(o.geometry.userData && (o.geometry.userData.metGeo || o.geometry.userData.instGeoCache))) o.geometry.dispose(); });
edit.modelo.grupo.traverse(function (o) {
var gs = o.userData && o.userData.famLod; if (!gs) return;
gs.forEach(function (g) { if (g && g !== o.geometry && !(g.userData && (g.userData.metGeo || g.userData.instGeoCache))) { try { g.dispose(); } catch (_) {} } });
o.userData.famLod = null;
});
edit.modelo.grupo.children.slice().forEach(function (m) { delete S.meshPorUid['edit:' + m.userData.expressID]; });
var ix = S.modelos.indexOf(edit.modelo); if (ix >= 0) S.modelos.splice(ix, 1);
edit.modelo = null;
}
edit.sprites.forEach(function (sp) { scene.remove(sp); if (sp.material && sp.material.map) sp.material.map.dispose(); if (sp.material) sp.material.dispose(); });
edit.sprites = [];
if (S._b2Limpar3d) S._b2Limpar3d();
tR.a = performance.now();
var st = BimEdit.aplicar(edit.ops);
tR.b = performance.now();
edit.estado = st;
var instEls = [];
try { if (window.BimInstUI && st.instalacoes) instEls = BimInstUI.malhas(st, famAval, THREE); } catch (eIn) { instEls = []; }
var nInst = instEls.filter(function (x) { return !x.marcador; }).length;
volMedir(st);
var nVol = st.volumes ? st.volumes.length : 0;
var nFo = st.forros ? st.forros.length : 0;
var nP11 = S._p11 ? S._p11.contar(st) : 0;
var nP3 = S._p3 ? S._p3.contar(st) : 0;
if (st.caixas.length || st.familias.length || st.coberturas.length || nInst || nVol || nFo || nP11 || nP3) {
var nTot = st.caixas.length + st.familias.length + st.coberturas.length + nInst + nVol + nFo + nP11 + nP3;
var mo = { mid: 'edit', sintetico: true, editor: true, nome: 'Criados no OrçaPRO (' + nTot + ')', disciplina: 'arquitetura', alpha: 1, visivel: true, grupo: new THREE.Group(), matCache: {}, transCache: {}, elementos: [], tipos: {}, nEl: 0, nTri: 0, pavimentos: [], carimbos: {}, qto: {} };
mo.grupo.userData.mid = 'edit';
var vaosEd = BimEdit.vaosDasParedes(st, famAval);
function addMesh(m, id, ifc, mat) {
m.userData.expressID = id; m.userData.tipo = ifc; m.userData.mid = 'edit'; m.userData.matOrig = mat || m.material;
mo.grupo.add(m);
if (!S.meshPorUid['edit:' + id]) S.meshPorUid['edit:' + id] = m;
mo.nTri += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
}
var NOMES_ED = { parede: 'Parede', laje: 'Laje', pilar: 'Pilar', viga: 'Viga', escada: 'Escada', guarda: 'Guarda-corpo' };
st.caixas.forEach(function (c) {
var mat = editMat(c.tipo), vz = c.tipo === 'parede' ? vaosEd[c.id] : null;
if (c.tipo === 'parede' && c.pinturas && estPrevia()) { var amB = acabBaseParede(c); if (amB) mat = amB; }
var b2r = (c.b2 && S._b2Malhas) ? S._b2Malhas(c, vz, mat, addMesh) : null;
if (b2r) { } else if (vz) {
var co = Math.cos(c.rotY), si = Math.sin(c.rotY);
vz.pedacos.forEach(function (pd) {
var xm = (pd.x0 + pd.x1) / 2, ym = (pd.y0 + pd.y1) / 2 - c.altura / 2;
var m2 = new THREE.Mesh(new THREE.BoxGeometry(pd.x1 - pd.x0, pd.y1 - pd.y0, c.espessura), mat);
m2.position.set(c.cx + xm * co, c.cy + ym, c.cz - xm * si); m2.rotation.y = c.rotY;
addMesh(m2, c.id, c.ifc, mat);
});
} else {
var m = new THREE.Mesh(new THREE.BoxGeometry(c.comprimento, c.altura, c.espessura), mat);
m.position.set(c.cx, c.cy, c.cz); m.rotation.y = c.rotY;
addMesh(m, c.id, c.ifc, mat);
}
mo.tipos[c.ifc] = (mo.tipos[c.ifc] || 0) + 1;
var areaL = vz ? vz.areaLiquida : c.area;
mo.qto[c.id] = b2r ? b2r.qto : { comprimento: c.tipo === 'pilar' ? (c.comprimentoPilar || c.altura) : c.comprimento, area: areaL, volume: vz ? Math.round(areaL * c.espessura * 10000) / 10000 : c.volume, contagem: 1, areaVaos: vz ? vz.areaVaos : 0 };
mo.elementos.push({ id: c.id, uid: 'edit:' + c.id, mid: 'edit', arquivo: mo.nome, tipo: c.ifc, nome: (c.tipo === 'vedacao' && c.vedacao ? String(c.vedacao.nome || c.vedacao.papel || 'Vedação') : c.tipo === 'metal' && window.BimMetal ? BimMetal.nome(c) + (c.marca ? ' [' + c.marca + ']' : '') : (NOMES_ED[c.tipo] || 'Elemento')) + ' (sintética ' + c.id + ')', etapa: null, codOrc: null, qto: mo.qto[c.id], disciplina: c.tipo === 'viga' || c.tipo === 'pilar' || c.tipo === 'metal' ? 'estrutura' : 'arquitetura' });
mo.nEl++;
});
st.coberturas.forEach(function (cb) {
var matC = editMat('cobertura');
cb.planos.forEach(function (p) {
var mC = new THREE.Mesh(new THREE.BoxGeometry(p.comprimento, p.espessura, p.largura), matC);
mC.rotation.order = 'YXZ'; mC.rotation.y = p.rotY; mC.rotation.x = p.rotX; mC.position.set(p.cx, p.cy, p.cz);
addMesh(mC, cb.id, 'IFCROOF', matC);
});
mo.tipos.IFCROOF = (mo.tipos.IFCROOF || 0) + 1;
mo.qto[cb.id] = { area: cb.area, areaProjecao: cb.areaProjecao, volume: cb.volume, comprimento: cb.comprimentoCumeeira, contagem: 1 };
mo.elementos.push({ id: cb.id, uid: 'edit:' + cb.id, mid: 'edit', arquivo: mo.nome, tipo: 'IFCROOF', nome: 'Cobertura ' + (cb.aguas === 1 ? '1 água' : '2 águas') + ' ' + String(cb.inclinacao).replace('.', ',') + '% (sintética ' + cb.id + ')', etapa: null, codOrc: null, qto: mo.qto[cb.id], disciplina: 'arquitetura' });
mo.nEl++;
});
if (nFo && S._p2bForros) S._p2bForros(st, mo, addMesh);
if (nP11) S._p11.desenhar(st, mo, addMesh);
if (nP3) S._p3.malhas(st, mo, addMesh);
if (S._andaime3d) S._andaime3d.ini();
st.familias.forEach(function (fi) {
var av = famAval(fi.famId, fi.tipoId, fi.inst), fam = famReg.lista[fi.famId];
var ifc = fam ? (FAM_IFC[fam.categoria] || 'IFCBUILDINGELEMENTPROXY') : 'IFCBUILDINGELEMENTPROXY';
var viaInst = !!(fam && fam.categoria === 'andaime' && S._andaime3d && av && av.solidos && av.solidos.length && S._andaime3d.coletar(fi, av, fam));
var malhas = viaInst ? [] : (av && av.solidos && av.solidos.length ? famMalhasNivel(av, fi, fam) : []);
if (!malhas.length && !viaInst) {
var mx = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), editMat('sel'));
mx.position.set(fi.x, fi.y + 0.2, fi.z); malhas = [mx];
}
malhas.forEach(function (mf) { addMesh(mf, fi.id, ifc, mf.material); });
portaNativa(fam, av, fi, malhas);
if (av && av.partesMoveis && av.partesMoveis.length) (mo.partes = mo.partes || []).push({ id: fi.id, famId: fi.famId, nome: fam ? fam.nome : fi.famId, categoria: fam ? fam.categoria : '',
inst: { x: fi.x, y: fi.y, z: fi.z, rotY: fi.rotY || 0 }, partes: av.partesMoveis, fracao: av.estadoPartes ? av.estadoPartes.fracao : 0 });
mo.tipos[ifc] = (mo.tipos[ifc] || 0) + 1;
var qf = av && av.quantitativo ? av.quantitativo : { unidade: 'un', quantidade: 1 };
mo.qto[fi.id] = { contagem: 1, unidade: qf.unidade, quantidade: qf.quantidade, volume: qf.unidade === 'm3' ? qf.quantidade : undefined, area: qf.unidade === 'm2' ? qf.quantidade : undefined, comprimento: qf.unidade === 'm' ? qf.quantidade : undefined, massa: av && av.massa > 0 ? av.massa : undefined };
mo.elementos.push({ id: fi.id, uid: 'edit:' + fi.id, mid: 'edit', arquivo: mo.nome, tipo: ifc,
nome: (fam ? fam.nome : 'Família não carregada (' + fi.famId + ')') + (av && av.tipo ? ' : ' + av.tipo.nome : ''), etapa: null, codOrc: qf.codigo || null, qto: mo.qto[fi.id],
disciplina: fam && (fam.categoria === 'pilar' || fam.categoria === 'viga' || fam.categoria === 'estrutural') ? 'estrutura' : (fam && (fam.categoria === 'loucas' || fam.categoria === 'equipamento' || fam.categoria === 'acessorio_tubo' || fam.categoria === 'conexao_tubo' || fam.categoria === 'conexao_duto') ? 'hidraulica' : (fam && /^(dispositivo_eletrico|luminaria|equipamento_eletrico|conexao_eletroduto)$/.test(fam.categoria) ? 'eletrica' : 'arquitetura')),
familia: { famId: fi.famId, tipoId: fi.tipoId, hospedada: !!fi.host } });
mo.nEl++;
});
if (S._andaime3d) { try { S._andaime3d.fim(mo); } catch (eAnd) { try { console.warn('[andaime3d]', eAnd); } catch (_) {} } }
instEls.forEach(function (ie) {
ie.malhas.forEach(function (mi) { addMesh(mi, ie.id, ie.ifc || 'IFCBUILDINGELEMENTPROXY', mi.material); });
if (ie.marcador) return;
mo.tipos[ie.ifc] = (mo.tipos[ie.ifc] || 0) + 1;
mo.qto[ie.id] = ie.qto;
mo.elementos.push({ id: ie.id, uid: 'edit:' + ie.id, mid: 'edit', arquivo: mo.nome, tipo: ie.ifc, nome: ie.nome, etapa: null, codOrc: ie.codigo || null, qto: ie.qto, disciplina: ie.disciplina });
mo.nEl++;
});
volDesenhar(st, mo, addMesh);
(st.moveisGrupo || []).forEach(function (g) {
var no = {}, n = 0; g.ids.forEach(function (x) { no[x] = 1; });
mo.grupo.children.forEach(function (m) { if (m.isMesh && m.userData.expressID != null && no[String(m.userData.expressID)]) { m.userData.parte = g.parte.id; m.userData.parteDe = g.id; n++; } });
if (n) (mo.partes = mo.partes || []).push({ id: g.id, famId: '', nome: g.nome, categoria: g.categoria, inst: { x: 0, y: 0, z: 0, rotY: 0 }, partes: [g.parte], fracao: 0, grupo: true });
});
modelRoot.add(mo.grupo);
try {
modelRoot.updateMatrixWorld(true);
var elPorId = {}; mo.elementos.forEach(function (e2) { if (!(e2.id in elPorId)) elPorId[e2.id] = e2; });
mo.grupo.children.forEach(function (m) {
var bb = new THREE.Box3().setFromObject(m);
var elx = elPorId[m.userData.expressID];
if (elx && !bb.isEmpty()) {
if (elx.aabb) { bb.expandByPoint(new THREE.Vector3(elx.aabb.min[0], elx.aabb.min[1], elx.aabb.min[2])); bb.expandByPoint(new THREE.Vector3(elx.aabb.max[0], elx.aabb.max[1], elx.aabb.max[2])); }
elx.aabb = { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] };
}
});
} catch (_) {}
S.modelos.push(mo);
recarimbarIdentidade(); tR.c = performance.now(); if (mo.partes && S._partesIniciar) S._partesIniciar(mo);
agregarModelo(mo);
tR.d = performance.now();
carimbarConsulta();
edit.modelo = mo;
}
if (S._metGeoVarrer) S._metGeoVarrer();
try { if (window.BimAbrirUI) window.BimAbrirUI.atualizar(); } catch (_) {}
st.anotacoes.forEach(function (a) {
var sp = labelSprite('📍 ' + a.texto);
sp.position.set(a.x, a.y, a.z); sp.userData._anotId = a.id;
scene.add(sp); rescaleObj(sp); edit.sprites.push(sp);
});
if (S._b2Eixos) S._b2Eixos(st);
S._remEd = {};
(st.removidosIfcInfo || []).forEach(function (info) { S._remEd[editUidRemovido(info)] = 1; });
if (st.removidosIfc.length) todasMalhas(function (m) { if (S._remEd[m.userData.mid + ':' + m.userData.expressID]) m.visible = false; });
edit.removidosAntes = Object.keys(S._remEd);
editGanchos(st, tR);
}
function editGanchos(st, tR) {
S.elementos = []; S.modelos.forEach(function (mo2) { S.elementos = S.elementos.concat(mo2.elementos); });
over.style.display = (S.modelos.length || st.anotacoes.length || (st.eixos && st.eixos.length)) ? 'none' : 'flex';
atualizarHud(); notifyModelos(); editSt();
if (S._prec) S._prec.aposRebuild(st);
try { if (window.BimVaoArr && BimVaoArr.aposRebuild) BimVaoArr.aposRebuild(); } catch (_) {}
try { if (window.BimInstCon && BimInstCon.atualizar && BimInstCon._uid) BimInstCon.atualizar(); } catch (_) {}
if (S._selInstRefazer) S._selInstRefazer();
if (S._p2d) S._p2d.aposRebuild(st);
if (S._mat) S._mat.aposRebuild(st, edit.modelo);
if (S._p10) S._p10.aposRebuild(st, edit.modelo);
if (S._p11) S._p11.aposRebuild(st);
if (S._emb) S._emb.aposRebuild(st);
if (S._bkx) S._bkx.aposRebuild(st);
if (S._alv) S._alv.aposRebuild(st);
if (S._metc) S._metc.aposRebuild(st);
if (S._cot) S._cot.aposRebuild(st);
if (window.BimInstUI && BimInstUI.aoMudarModelo) BimInstUI.aoMudarModelo();
if (window.BimPropsUI && BimPropsUI.aoMudarModelo) BimPropsUI.aoMudarModelo();
if (window.BimAnot2DUI && BimAnot2DUI.aposRebuild) BimAnot2DUI.aposRebuild(st);
if (window.BimTabelaUI && BimTabelaUI.aoMudarModelo) BimTabelaUI.aoMudarModelo();
if (window.BimSelInst && BimSelInst.aposRebuild) { try { BimSelInst.aposRebuild(); } catch (eSI) {} }
if (S._acima3d && planta.on) S._acima3d.agendar();
if (opts.onLoaded) opts.onLoaded(elementosVivos());
if (opts.onEdicao && !edit._replay) { try { opts.onEdicao(edit.ops.slice()); } catch (_) {} }
var tF = performance.now();
S._ultimoRebuild = { total: Math.round(tF - tR.t0), limpar: Math.round(tR.a - tR.t0), replay: Math.round(tR.b - tR.a), malhas: tR.c ? Math.round(tR.c - tR.b) : 0,
agregar: tR.d ? Math.round(tR.d - tR.c) : 0, ganchos: Math.round(tF - (tR.d || tR.b)) };
}
function opSoInst(o) {
if (!o) return false;
if (o.op === 'lote') return Array.isArray(o.ops) && o.ops.length > 0 && o.ops.every(opSoInst);
return !!(window.BimInst && BimInst.ehOp && BimInst.ehOp(o.op));
}
function editRebuildInst() {
var mo = edit.modelo, st0 = edit.estado;
if (!mo || !st0 || S.modelos.indexOf(mo) < 0 || !window.BimInstUI || !BimInstUI.malhas) return false;
var tR = { t0: performance.now() };
tR.a = performance.now();
var st = BimEdit.aplicar(edit.ops);
tR.b = performance.now();
function ids(l) { return (l || []).map(function (x) { return x.id + '@' + (x.cx != null ? x.cx : x.x) + ',' + (x.cz != null ? x.cz : x.z); }).join('|'); }
if (ids(st.caixas) !== ids(st0.caixas) || ids(st.familias) !== ids(st0.familias) || ids(st.coberturas) !== ids(st0.coberturas) ||
(st.volumes || []).length !== (st0.volumes || []).length || (st.anotacoes || []).length !== (st0.anotacoes || []).length ||
(st.removidosIfc || []).length !== (st0.removidosIfc || []).length) return false;
editSoltarSel();
edit.estado = st;
desagregarModelo(mo);
var sai = mo.grupo.children.filter(function (m) { var u = m.userData || {}; return !u.instFam && !!(u.instPapel || u.instUnif || u.marcador || u.desconexao); }), saiIds = {};
sai.forEach(function (m) {
var u = m.userData, uid = 'edit:' + u.expressID;
if (!u.marcador) saiIds[u.expressID] = 1;
mo.grupo.remove(m);
if (S.meshPorUid[uid] === m) delete S.meshPorUid[uid];
if (m === S.selected) { S.selected = null; S.prevMat = null; if (S._contornoSelecao) S._contornoSelecao(null); }
mo.nTri -= (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
if (!(m.geometry.userData && (m.geometry.userData.metGeo || m.geometry.userData.instGeoCache))) try { m.geometry.dispose(); } catch (_) {}
});
mo.elementos = mo.elementos.filter(function (e) {
if (!saiIds[e.id]) return true;
if (mo.tipos[e.tipo]) { mo.tipos[e.tipo]--; if (!mo.tipos[e.tipo]) delete mo.tipos[e.tipo]; }
delete mo.qto[e.id]; mo.nEl--; return false;
});
var instEls = [];
try { if (st.instalacoes) instEls = BimInstUI.malhas(st, famAval, THREE); } catch (eIn) { instEls = []; }
var novos = {};
instEls.forEach(function (ie) {
ie.malhas.forEach(function (mi) {
var ifc = ie.ifc || 'IFCBUILDINGELEMENTPROXY';
mi.userData.expressID = ie.id; mi.userData.tipo = ifc; mi.userData.mid = 'edit'; mi.userData.matOrig = mi.material;
mo.grupo.add(mi);
if (!S.meshPorUid['edit:' + ie.id]) S.meshPorUid['edit:' + ie.id] = mi;
mo.nTri += (mi.geometry.index ? mi.geometry.index.count : mi.geometry.attributes.position.count) / 3;
});
if (ie.marcador) return;
mo.tipos[ie.ifc] = (mo.tipos[ie.ifc] || 0) + 1;
mo.qto[ie.id] = ie.qto; novos[ie.id] = 1;
mo.elementos.push({ id: ie.id, uid: 'edit:' + ie.id, mid: 'edit', arquivo: mo.nome, tipo: ie.ifc, nome: ie.nome, etapa: null, codOrc: ie.codigo || null, qto: ie.qto, disciplina: ie.disciplina });
mo.nEl++;
});
try {
modelRoot.updateMatrixWorld(true);
var elPorId = {}; mo.elementos.forEach(function (e2) { if (novos[e2.id] && !(e2.id in elPorId)) elPorId[e2.id] = e2; });
mo.grupo.children.forEach(function (m) {
var elx = elPorId[m.userData.expressID]; if (!elx) return;
var bb = new THREE.Box3().setFromObject(m); if (bb.isEmpty()) return;
if (elx.aabb) { bb.expandByPoint(new THREE.Vector3(elx.aabb.min[0], elx.aabb.min[1], elx.aabb.min[2])); bb.expandByPoint(new THREE.Vector3(elx.aabb.max[0], elx.aabb.max[1], elx.aabb.max[2])); }
elx.aabb = { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] };
});
} catch (_) {}
recarimbarIdentidade(); tR.c = performance.now();
agregarModelo(mo);
tR.d = performance.now();
carimbarConsulta();
editGanchos(st, tR);
if (S._ultimoRebuild) S._ultimoRebuild.parcial = true;
return true;
}
S._opSoInst = opSoInst;
S._tickExtra.push(function () { for (var i = 0; i < edit.sprites.length; i++) rescaleObj(edit.sprites[i]); });
function instNivelRefazer() {
var mo = edit.modelo, st = edit.estado;
if (!mo || !st || !window.BimInstUI || !BimInstUI.malhas) return { ok: false, erro: 'sem modelo do editor' };
var t0 = performance.now(), removidas = 0, novas = 0;
desagregarModelo(mo);
var sai = mo.grupo.children.filter(function (m) { var u = m.userData || {}; return !!(u.instPapel || u.instUnif || u.instFam || u.marcador || u.desconexao); });
sai.forEach(function (m) {
var uid = 'edit:' + m.userData.expressID;
mo.grupo.remove(m); removidas++;
if (S.meshPorUid[uid] === m) delete S.meshPorUid[uid];
if (m === S.selected) { S.selected = null; S.prevMat = null; if (S._contornoSelecao) S._contornoSelecao(null); }
mo.nTri -= (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
(m.userData.famLod || [m.geometry]).forEach(function (g) { if (!(g.userData && (g.userData.metGeo || g.userData.instGeoCache))) try { g.dispose(); } catch (_) {} });
});
function addI(m, id, ifc) {
m.userData.expressID = id; m.userData.tipo = ifc; m.userData.mid = 'edit'; m.userData.matOrig = m.material;
mo.grupo.add(m); novas++;
if (!S.meshPorUid['edit:' + id]) S.meshPorUid['edit:' + id] = m;
mo.nTri += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
}
var els = [];
try { els = BimInstUI.malhas(st, famAval, THREE); } catch (eIn) { els = []; }
els.forEach(function (ie) { ie.malhas.forEach(function (mi) { addI(mi, ie.id, ie.ifc || 'IFCBUILDINGELEMENTPROXY'); }); });
if (S._andaime3d) S._andaime3d.ini();
(st.familias || []).forEach(function (fi) {
var fam = famReg.lista[fi.famId]; if (!famNivelDe(fam)) return;
var av = famAval(fi.famId, fi.tipoId, fi.inst); if (!(av && av.solidos && av.solidos.length)) return;
if (fam.categoria === 'andaime' && S._andaime3d && S._andaime3d.coletar(fi, av, fam)) return;
var ifc = FAM_IFC[fam.categoria] || 'IFCBUILDINGELEMENTPROXY';
famMalhasNivel(av, fi, fam).forEach(function (mf) { addI(mf, fi.id, ifc); });
});
if (S._andaime3d) { try { S._andaime3d.fim(mo); } catch (eAnd2) { try { console.warn('[andaime3d]', eAnd2); } catch (_) {} } }
modelRoot.updateMatrixWorld(true);
agregarModelo(mo);
if (window.BimSelInst && BimSelInst.aposRebuild) { try { BimSelInst.aposRebuild(); } catch (eSI) {} }
if (S._acima3d && planta.on) S._acima3d.agendar();
if (S._selInstRefazer) S._selInstRefazer();
var med = instMedir();
S._ultimoNivel = { ok: true, nivel: BimInstUI._nivelFeito, ms: Math.round(performance.now() - t0), removidas: removidas, novas: novas, tri: med.tri, malhas: med.malhas };
return S._ultimoNivel;
}
function instMedir() {
var mo = edit.modelo, r = { malhas: 0, tri: 0, porPapel: {} };
if (!mo) return r;
mo.grupo.children.forEach(function (m) {
var u = m.userData || {}, p = u.instPapel || (u.instFam ? 'familia' : null); if (!p || !m.geometry) return;
var t = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
r.malhas++; r.tri += t; r.porPapel[p] = (r.porPapel[p] || 0) + t;
});
return r;
}
S._instNivelRefazer = instNivelRefazer; S._instMedir = instMedir;
function editOp(o) {
try { if (window.Modela && Modela.iniciarTeste) Modela.iniciarTeste(); } catch (_m) {}
edit.ops.push(o); edit.redo = [];
if (!(opSoInst(o) && editRebuildInst())) editRebuild();
}
S._editDesfazer = function () { if (!edit.ops.length) return false; var o = edit.ops.pop(); edit.redo.push(o); editTirarProv(); if (!(opSoInst(o) && editRebuildInst())) editRebuild(); return true; };
S._editRefazer = function () { if (!edit.redo.length) return false; var o = edit.redo.pop(); edit.ops.push(o); if (!(opSoInst(o) && editRebuildInst())) editRebuild(); return true; };
S._editReconstruir = function () { if (edit.ops.length) editRebuild(); };
S._editOpExterna = function (o) { editOp(o); };
function ifcConvCamadas(mid) {
var porItem = {}, porRep = {}, porPds = {}, api = S.api;
function linha(id) { try { return api.GetLine(mid, id, false); } catch (_) { return null; } }
function lista(x) { return x == null ? [] : (Array.isArray(x) ? x : [x]); }
function ref(x) { return (x && x.value != null) ? x.value : null; }
try {
var ls = api.GetLineIDsWithType(mid, 2022622350), n = ls.size();
if (!n) return porPds;
for (var i = 0; i < n; i++) {
var l = linha(ls.get(i)), nome = l && l.Name && l.Name.value ? String(l.Name.value) : '';
if (!nome) continue;
lista(l.AssignedItems).forEach(function (h) { var id = ref(h); if (id != null && porItem[id] == null) porItem[id] = nome; });
}
var rs = api.GetLineIDsWithType(mid, 4240577450), nr = rs.size();
if (nr > 60000) return porPds;
for (var j = 0; j < nr; j++) {
var rid = rs.get(j), r = linha(rid); if (!r) continue;
if (porItem[rid] != null) { porRep[rid] = porItem[rid]; continue; }
lista(r.Items).some(function (h) { var c = porItem[ref(h)]; if (c != null) { porRep[rid] = c; return true; } return false; });
}
var ps = api.GetLineIDsWithType(mid, 673634403), np = ps.size();
for (var k = 0; k < np; k++) {
var pid = ps.get(k), p = linha(pid); if (!p) continue;
lista(p.Representations).some(function (h) { var c = porRep[ref(h)]; if (c != null) { porPds[pid] = c; return true; } return false; });
}
} catch (_) { }
return porPds;
}
S._ifcConvLista = function () {
var out = [], rem = S._remEd || {};
try { modelRoot.updateMatrixWorld(true); } catch (_) {}
(S.modelos || []).forEach(function (mo) {
if (typeof mo.mid !== 'number' || mo.sintetico || mo.editor || mo.visivel === false) return;
mo.elementos.forEach(function (e) {
if (String(e.tipo).toUpperCase() === 'IFCBUILDINGELEMENTPROXY' && !rem[e.uid]) out.push({ uid: e.uid, id: e.id, mid: mo.mid, arq: mo.nome });
});
});
return out;
};
S._ifcConvPeca = function (uid) {
var mo = modeloDaPeca(uid), ms = malhasDaPeca(uid), el = null;
if (!mo || !ms.length) return null;
for (var q = 0; q < mo.elementos.length; q++) if (mo.elementos[q].uid === uid) { el = mo.elementos[q]; break; }
if (!el) return null;
var total = 0, i;
ms.forEach(function (m) { var g = m.geometry; if (g && g.attributes && g.attributes.position) total += Math.floor((g.index ? g.index.count : g.attributes.position.count) / 3); });
var cam = '';
try {
if (S.api) {
if (!mo._ifcCamadas) mo._ifcCamadas = ifcConvCamadas(mo.mid);
var ln = S.api.GetLine(mo.mid, el.id, false), rp = ln && ln.Representation && ln.Representation.value;
if (rp != null && mo._ifcCamadas[rp]) cam = mo._ifcCamadas[rp];
}
} catch (_) {}
var mat = ''; try { mat = el.materiais ? JSON.stringify(el.materiais).slice(0, 240) : ''; } catch (_) {}
var base = { uid: uid, id: el.id, arq: mo.nome, nome: el.nomeIfc || '', camada: cam, material: mat, familia: el.familia || '', nTri: total };
if (total > 60000) { base.pesada = true; base.tris = new Float32Array(0); base.partes = []; return base; }
var T = new Float32Array(total * 9), w = 0, partes = [], v = new THREE.Vector3();
ms.forEach(function (m) {
var g = m.geometry; if (!g || !g.attributes || !g.attributes.position) return;
var pos = g.attributes.position, idx = g.index, n = Math.floor((idx ? idx.count : pos.count) / 3), M = m.matrixWorld;
for (var t = 0; t < n; t++) for (var k = 0; k < 3; k++) {
v.fromBufferAttribute(pos, idx ? idx.getX(t * 3 + k) : t * 3 + k).applyMatrix4(M);
T[w++] = v.x; T[w++] = v.y; T[w++] = v.z;
}
partes.push(w / 9);
});
base.tris = w === T.length ? T : T.subarray(0, w); base.partes = partes;
return base;
};
S._instCtx = function () {
return { edit: edit, op: editOp, famAval: famAval, hint: function (t) { S._hint(t); }, marcar: marcarFechamento,
inicio: function (p) {
if (edit.prov) { limparMarca(edit.prov); edit.prov = null; }
editPreviewLimpar();
edit.p1 = new THREE.Vector3(p.x, p.y, p.z); edit.instY = p.y;
edit.prov = pontoMarca(edit.p1); scene.add(edit.prov); rescaleObj(edit.prov);
},
fim: function () { editTirarProv(); } };
};
var editPrevG = null, editPrevMat = null;
S._editPrevia = function (ops) {
if (editPrevG) { scene.remove(editPrevG); editPrevG.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); editPrevG = null; }
if (!ops || !ops.length) return { ok: true, malhas: 0 };
if (!editPrevMat) editPrevMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });
var st = BimEdit.aplicar(ops), g = new THREE.Group(), vz = BimEdit.vaosDasParedes(st, famAval);
g.userData.previaIA = true;
st.caixas.forEach(function (c) {
var v = c.tipo === 'parede' ? vz[c.id] : null, co = Math.cos(c.rotY), si = Math.sin(c.rotY);
if (c.arco && window.BimCurva) { BimCurva.pecas(c, v ? v.aceitos : []).pecas.forEach(function (pc) { g.add(new THREE.Mesh(b2Geo(pc.pts, null, pc.y0, pc.ytopo, b2Plano), editPrevMat)); }); return; }
(v ? v.pedacos : [{ x0: -c.comprimento / 2, x1: c.comprimento / 2, y0: 0, y1: c.altura }]).forEach(function (pd) {
var xm = (pd.x0 + pd.x1) / 2, ym = (pd.y0 + pd.y1) / 2 - c.altura / 2;
var m = new THREE.Mesh(new THREE.BoxGeometry(pd.x1 - pd.x0, pd.y1 - pd.y0, c.espessura), editPrevMat);
m.position.set(c.cx + xm * co, c.cy + ym, c.cz - xm * si); m.rotation.y = c.rotY; g.add(m);
});
});
st.coberturas.forEach(function (cb) {
cb.planos.forEach(function (p) {
var m = new THREE.Mesh(new THREE.BoxGeometry(p.comprimento, p.espessura, p.largura), editPrevMat);
m.rotation.order = 'YXZ'; m.rotation.y = p.rotY; m.rotation.x = p.rotX; m.position.set(p.cx, p.cy, p.cz); g.add(m);
});
});
st.familias.forEach(function (fi) {
var av = famAval(fi.famId, fi.tipoId, fi.inst);
var ms = av && av.solidos && av.solidos.length ? famMalhas(av, fi, editPrevMat) : [];
if (!ms.length) { var mx = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), editPrevMat); mx.position.set(fi.x, fi.y + 0.2, fi.z); ms = [mx]; }
ms.forEach(function (m) { g.add(m); });
});
scene.add(g); editPrevG = g;
try { enquadrarObj(new THREE.Box3().setFromObject(g), 1.4); } catch (e) {}
return { ok: true, malhas: g.children.length };
};
var instPrevG = null;
S._editPreviaInst = function (ops) {
if (instPrevG) { scene.remove(instPrevG); instPrevG.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); instPrevG = null; }
if (!ops || !ops.length || !window.BimInstUI || !S.edit) return { ok: true, malhas: 0 };
var st = BimEdit.aplicar((S.edit.ops || []).concat(ops)), ids = {}, g = new THREE.Group(), n = 0, ult = BimInstUI._ultimaRede, cv = BimInstUI._corVerif;
ops.forEach(function (o) { if (o && o.id != null) ids[o.id] = 1; });
var mat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0b5d80, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
BimInstUI._corVerif = null;
try { BimInstUI.malhas(st, famAval, THREE).forEach(function (el) { if (!ids[el.id] || el.marcador) return; el.malhas.forEach(function (m) { m.material = mat; g.add(m); n++; }); }); } catch (eP) {}
BimInstUI._corVerif = cv; BimInstUI._ultimaRede = ult;
g.userData.previaInst = true; scene.add(g); instPrevG = g;
return { ok: true, malhas: n };
};
S._telaDe = function (x, y, z) {
var v = new THREE.Vector3(x, y, z).project(camera), r = canvasEl.getBoundingClientRect();
return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, atras: v.z > 1 };
};
S._famPreview = function (canvas, av) {
if (!canvas || !av) return false;
var pv = canvas._famPrev;
if (!pv) {
var antiga = S._famPrevViva;
if (antiga && antiga.canvas !== canvas) {
try { antiga.pv.rnd.dispose(); antiga.pv.rnd.forceContextLoss(); } catch (_) {}
try { antiga.canvas._famPrev = null; } catch (_) {}
S._famPrevViva = null;
}
var rnd = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
rnd.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
var sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.9));
var dl = new THREE.DirectionalLight(0xffffff, 0.8); dl.position.set(3, 5, 4); sc.add(dl);
var cam = new THREE.PerspectiveCamera(35, 1, 0.01, 200), grp = new THREE.Group(); sc.add(grp);
var grade = new THREE.GridHelper(4, 16, 0x7f98b0, 0xc5d3df); sc.add(grade);
pv = canvas._famPrev = { rnd: rnd, sc: sc, cam: cam, grp: grp, th: 0.8, ph: 1.05, r: 3, alvo: new THREE.Vector3() };
S._famPrevViva = { canvas: canvas, pv: pv };
var arr = null;
canvas.addEventListener('pointerdown', function (e) { arr = { x: e.clientX, y: e.clientY, th: pv.th, ph: pv.ph }; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} });
canvas.addEventListener('pointermove', function (e) { if (!arr) return; pv.th = arr.th - (e.clientX - arr.x) * 0.01; pv.ph = Math.max(0.15, Math.min(1.5, arr.ph - (e.clientY - arr.y) * 0.01)); desenhar(); });
canvas.addEventListener('pointerup', function () { arr = null; });
canvas.addEventListener('wheel', function (e) { e.preventDefault(); pv.r = Math.max(0.3, Math.min(60, pv.r * (e.deltaY > 0 ? 1.12 : 1 / 1.12))); desenhar(); }, { passive: false });
pv.desenhar = desenhar;
}
function desenhar() {
var w = canvas.clientWidth || 300, h = canvas.clientHeight || 220;
pv.rnd.setSize(w, h, false); pv.cam.aspect = w / h; pv.cam.updateProjectionMatrix();
pv.cam.position.set(pv.alvo.x + pv.r * Math.sin(pv.ph) * Math.sin(pv.th), pv.alvo.y + pv.r * Math.cos(pv.ph), pv.alvo.z + pv.r * Math.sin(pv.ph) * Math.cos(pv.th));
pv.cam.lookAt(pv.alvo); pv.rnd.render(pv.sc, pv.cam);
}
pv.grp.children.slice().forEach(function (m) { pv.grp.remove(m); if (m.geometry) m.geometry.dispose(); });
famMalhas(av, { x: 0, y: 0, z: 0, rotY: 0 }).forEach(function (m) { pv.grp.add(m); });
var bb = new THREE.Box3().setFromObject(pv.grp);
if (!bb.isEmpty()) { bb.getCenter(pv.alvo); var tam = bb.getSize(new THREE.Vector3()).length(); if (!canvas._famPrevAjustado) { pv.r = Math.max(0.8, tam * 1.6); canvas._famPrevAjustado = true; } }
pv.desenhar();
return true;
};
function editHintSub() {
var h = { parede: '' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Clique o INÍCIO e o FIM da parede (no modelo ou no chão vazio).',
laje: '' + (typeof Icones !== 'undefined' ? Icones.get('laje', 15) : '') + ' Clique 2 cantos OPOSTOS do retângulo da laje.',
pilar: '' + (typeof Icones !== 'undefined' ? Icones.get('pilar', 15) : '') + ' Clique onde o pilar nasce.',
mover: '↔️ Clique num elemento CRIADO AQUI e depois no novo lugar (IFC não se move — honestidade).',
apagar: '' + (typeof Icones !== 'undefined' ? Icones.get('lixeira', 15) : '') + ' Clique no elemento: criado aqui = removido; do IFC = ocultado como "removido na edição".',
anotar: '' + (typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + ' Escreva o texto no campo e clique no ponto do modelo.',
viga: 'Viga: clique o INÍCIO e o FIM (topo na altura do nível + ' + String(edit.alt).replace('.', ',') + ' m).',
cobertura: 'Cobertura: clique dois cantos OPOSTOS da área coberta (sem o beiral).',
familia: 'Família: clique onde colocar (porta e janela: numa parede criada aqui). Barra de espaço gira.',
inst: 'Instalações: clique o início e os pontos do traçado (o sistema, o material e o DN ficam em Propriedades). Esc encerra.',
extrusao: 'Extrusão: clique os pontos do contorno no plano de trabalho; feche no 1º ponto ou Enter.',
revolucao: 'Revolução: clique o EIXO (vertical) no chão.',
varredura: 'Varredura: clique os pontos do caminho; Enter corre o perfil do painel.',
unir: 'Unir: clique o volume ALVO.', subtrair: 'Subtrair: clique o volume que vai ser RECORTADO.',
empurrar: 'Empurrar/puxar: clique numa FACE de um volume criado aqui.',
volprops: 'Clique num volume para ele ficar com a categoria e o material do painel.',
ambiente: 'Aplicar por ambiente: clique DENTRO de um cômodo fechado por paredes — o ambiente nasce (ou é escolhido) e os acabamentos ficam em Propriedades.' };
var hb = (edit.sub && S._ctr) ? S._ctr.dica(edit.sub) : '';
if (!hb) hb = (edit.sub && edit.b2 && S._b2Hint) ? S._b2Hint(edit.sub) : '';
if (!hb && edit.sub && S._p2d) hb = S._p2d.dica(edit.sub);
if (!hb && edit.sub && S._p11) hb = S._p11.dica(edit.sub);
if (!hb && edit.sub && S._p3) hb = S._p3.dica(edit.sub);
if (!hb && edit.sub && S._emb) hb = S._emb.dica(edit.sub);
if (!hb && edit.sub && S._cot) hb = S._cot.dica(edit.sub);
var semPainel = !!(window.BimBarraOpcoes && BimBarraOpcoes.substituiPainel && BimBarraOpcoes.substituiPainel());
if (semPainel) h.anotar = '' + (typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + ' Escreva o texto na barra de opções (Texto) e clique no ponto do modelo.';
S._hint(edit.sub ? (hb || h[edit.sub] || '') : (semPainel ? '' : '' + (typeof Icones !== 'undefined' ? Icones.get('editar', 15) : '') + ' Editor: escolha uma ferramenta no painel.'));
}
function editClique(e, hit, pForcado) {
if (edit.sub === 'ambiente' && !pForcado) {
var pAmb = editPontoPlano(e.clientX, e.clientY);
if (pAmb && window.Gestao && Gestao._ambClique) Gestao._ambClique({ x: pAmb.x, z: pAmb.z });
return;
}
if (S._cot && S._cot.clique(e, hit, pForcado)) return;
if (S._metc && S._metc.clique(e, hit, pForcado)) return;
if (S._metp && S._metp.clique(e, hit, pForcado)) return;
if (S._mtq && S._mtq.clique(e, hit, pForcado)) return;
var instAlvo = false;
if (!pForcado && S._prec && edit.sub === 'inst' && window.BimInstUI && BimInstUI.cfg && BimInstUI.cfg.ferramenta !== 'peca') {
try {
var snI = hit ? aplicarSnap(hit, raioToque(e)) : null, pI = snI ? snI.p : editPontoPlano(e.clientX, e.clientY);
instAlvo = !!(pI && BimInstUI.agarrar(edit.estado, famAval, pI, BimInstUI.cfg.sistema));
} catch (eI) { instAlvo = false; }
}
if (!pForcado && S._prec && !instAlvo) { var rPrec = S._prec.clique(e, hit); if (rPrec === true) return; if (rPrec) pForcado = rPrec; }
var cotaSn = edit._cotaSnap; edit._cotaSnap = null; edit._cotaAgora = cotaSn;
var sn = (hit && !pForcado) ? aplicarSnap(hit, raioToque(e)) : null;
var p = pForcado ? pForcado.clone() : (sn ? sn.p.clone() : editPontoPlano(e.clientX, e.clientY));
if (sn) mostrarSnapMarca(sn, e.clientX, e.clientY);
var sub = edit.sub;
if (p && !(e && e._planta) && window.BimPlantaModelar && BimPlantaModelar.cliqueForma && BimPlantaModelar.cliqueForma(sub, { x: p.x, z: p.z }, e)) return;
if (S._p2d && S._p2d.clique(sub, e, hit, p)) return;
if (S._p11 && S._p11.clique(sub, e, hit, p)) return;
if (S._ctr && S._ctr.clique(sub, e, hit, p)) return;
if (S._p3 && S._p3.clique(sub, e, hit, p)) return;
if (S._emb && S._emb.clique(sub, e, hit, p)) return;
if (edit.b2 && S._b2Clique && S._b2Clique(sub, e, hit, p)) return;
if (sub === 'apagar') {
if (!hit) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('lixeira', 15) : '') + ' Clique em cima de um elemento.'); return; }
var mA = _ultimosHits[0].object, midA = mA.userData.mid, idA = mA.userData.expressID;
if (midA === 'edit') { editOp({ op: 'apagar', id: idA }); S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('lixeira', 15) : '') + ' Removido (Desfazer volta).'); }
else {
var moRem = S.modelos.filter(function (x) { return x.mid === midA; })[0];
editOp({ op: 'apagarIfc', uid: midA + ':' + idA, arq: moRem ? moRem.nome : null, eid: idA });
S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('lixeira', 15) : '') + ' Elemento do modelo OCULTADO como removido na edição — o arquivo original não muda.');
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
var opMv = { op: 'mover', id: edit.moverId, cx: p.x, cz: p.z }, vMv = volDoId(edit.moverId);
if (vMv && vMv.medidas && vMv.medidas.caixa) { var cxv = vMv.medidas.caixa; opMv.dx = Math.round((p.x - (cxv.min[0] + cxv.max[0]) / 2) * 1000) / 1000; opMv.dz = Math.round((p.z - (cxv.min[2] + cxv.max[2]) / 2) * 1000) / 1000; }
editOp(opMv);
S._hint('↔️ Movido. Clique noutro elemento pra mover de novo, ou Esc.');
marcarFechamento(); return;
}
if (sub === 'familia') { editColocarFamilia(e, hit, p); return; }
if (sub === 'inst') { if (window.BimInstUI) BimInstUI.clique(S._instCtx(), p ? (pForcado ? p : editAjustarPonto(p, e)) : null, e); return; }
if (VOL_SUBS[sub]) { volClique(e, hit, p); return; }
if (!p) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('editar', 15) : '') + ' Não achei o ponto — clique no modelo ou no plano do chão.'); return; }
if ((sub === 'viga' || sub === 'cobertura') && edit.p1) {
var p2v = editAjustarPonto(p, e), ini = edit.p1.clone();
editTirarProv();
if (sub === 'viga') {
var topoV = edit._topoVista != null ? edit._topoVista : (edit._cotaP1 != null ? edit._cotaP1 : (cotaSn != null ? cotaSn : edit.base + edit.alt));
edit._cotaP1 = null;
var cV = BimEdit.viga({ x: ini.x, z: ini.z }, { x: p2v.x, z: p2v.z }, edit.vigaB, edit.vigaH, topoV);
if (!cV) { S._hint('Pontos muito próximos — clique 2 pontos distintos.'); return; }
editOp({ op: 'criar', id: 'e' + (++edit.seq), caixa: cV });
S._hint('Viga criada (' + cV.comprimento.toFixed(2).replace('.', ',') + ' m, ' + Math.round(edit.vigaB * 100) + ' × ' + Math.round(edit.vigaH * 100) + ', topo a ' + topoV.toFixed(2).replace('.', ',') + ' m). Clique o início da próxima, ou Esc.');
} else {
var cb = BimEdit.cobertura({ x: ini.x, z: ini.z }, { x: p.x, z: p.z }, { base: edit.base + edit.alt, inclinacao: edit.cobIncl, aguas: edit.cobAguas, beiral: edit.cobBeiral, espessura: 0.08 });
if (!cb) { S._hint('Retângulo pequeno demais para a cobertura.'); return; }
if (edit.b2 && edit.b2.restricoes && edit.b2.restricoes.cobertura && window.BimArq) BimArq.restringir(cb, edit.b2.restricoes.cobertura, edit.b2.niveis);
editOp({ op: 'cobertura', id: 'e' + (++edit.seq), cobertura: cb });
S._hint('Cobertura criada: ' + cb.area.toFixed(2).replace('.', ',') + ' m² de telhado (' + cb.aguas + (cb.aguas === 1 ? ' água' : ' águas') + ', ' + String(cb.inclinacao).replace('.', ',') + '%, cumeeira a ' + cb.cumeeira.toFixed(2).replace('.', ',') + ' m).');
}
marcarFechamento(); return;
}
if (sub === 'viga' || sub === 'cobertura') {
edit._cotaP1 = sub === 'viga' ? cotaSn : null;
edit.p1 = p.clone(); edit.prov = pontoMarca(p); scene.add(edit.prov); rescaleObj(edit.prov);
S._hint(sub === 'viga' ? 'Agora clique o FIM da viga.' : 'Agora clique o canto OPOSTO do telhado (o beiral de ' + String(edit.cobBeiral).replace('.', ',') + ' m é somado em volta).');
return;
}
if (sub === 'pilar') {
var cP = BimEdit.pilar({ x: p.x, z: p.z }, edit.secao, edit.alt, edit.base);
if (cP) { editOp({ op: 'criar', id: 'e' + (++edit.seq), caixa: cP }); S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('pilar', 15) : '') + ' Pilar criado. Clique pra outro, ou Esc.'); }
marcarFechamento(); return;
}
if (sub === 'anotar') {
var txt = (editPanel.querySelector('[data-ed="txt"]').value || '').trim();
if (!txt) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + ((window.BimBarraOpcoes && BimBarraOpcoes.substituiPainel && BimBarraOpcoes.substituiPainel()) ? ' Escreva o texto da anotação na barra de opções (Texto) primeiro.' : ' Escreva o texto da anotação no painel primeiro.')); return; }
editOp({ op: 'anotar', id: 'a' + (++edit.seq), x: p.x, y: p.y, z: p.z, texto: txt });
S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + ' Anotado! O pin fica salvo com a obra.');
marcarFechamento(); return;
}
if (sub === 'parede' || sub === 'laje') {
if (!edit.p1) {
edit.p1 = p.clone();
edit.prov = pontoMarca(p); scene.add(edit.prov); rescaleObj(edit.prov);
S._hint(sub === 'parede' ? '' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Agora clique o FIM da parede (ou digite a distância na caixinha + Enter).' : '' + (typeof Icones !== 'undefined' ? Icones.get('laje', 15) : '') + ' Agora clique o canto OPOSTO.');
return;
}
if (sub === 'parede') { editConcluirParede(editAjustarPonto(p, e)); return; }
var cx2 = BimEdit.laje({ x: edit.p1.x, z: edit.p1.z }, { x: p.x, z: p.z }, Math.min(edit.espLaje, 0.4), edit.base);
editTirarProv();
if (!cx2) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('editar', 15) : '') + ' Pontos muito próximos — clique 2 pontos distintos.'); return; }
editOp({ op: 'criar', id: 'e' + (++edit.seq), caixa: cx2 });
S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('laje', 15) : '') + ' Laje criada (' + cx2.area.toFixed(2).replace('.', ',') + ' m²).');
marcarFechamento(); return;
}
}
function editParedeDoHit() {
var h0 = _ultimosHits && _ultimosHits[0]; if (!h0) return null;
var m = h0.object; if (!m || m.userData.mid !== 'edit' || m.userData.tipo !== 'IFCWALL') return null;
var par = ((edit.estado && edit.estado.caixas) || []).filter(function (c) { return c.id === m.userData.expressID; })[0];
return par ? { parede: par, ponto: h0.point } : null;
}
function editColocarFamilia(e, hit, p) {
var fsel = edit.famSel, fam = fsel && famReg.lista[fsel.famId];
if (!fam) { S._hint('Escolha a família e o tipo na Biblioteca de famílias (Gerenciar › Famílias) antes de clicar.'); return; }
if (fam.hospedagem === 'parede') {
var ph = hit ? editParedeDoHit() : null;
if (!ph) { S._hint('"' + fam.nome + '" vai numa parede: clique numa parede CRIADA no OrçaPRO (a parede do IFC importado não é alterada).'); return; }
var av = famAval(fsel.famId, fsel.tipoId, fsel.inst || {}), lv = av && av.abertura ? av.abertura.largura : 0.8;
var meia = ph.parede.comprimento / 2 - lv / 2;
if (meia <= 0) { S._hint('A parede (' + ph.parede.comprimento.toFixed(2).replace('.', ',') + ' m) é mais curta que o vão (' + lv.toFixed(2).replace('.', ',') + ' m).'); return; }
var t = Math.max(-meia, Math.min(meia, BimEdit.tNaParede(ph.parede, ph.ponto)));
editOp({ op: 'familia', id: 'f' + (++edit.seq), famId: fsel.famId, tipoId: fsel.tipoId, host: { id: ph.parede.id, t: Math.round(t * 1000) / 1000 }, inst: fsel.inst || {} });
S._hint(fam.nome + ' colocada na parede (o vão já foi aberto e descontado). Clique em outra parede, ou Esc.');
} else {
if (!p) { S._hint('Não achei o ponto — clique no modelo ou no plano do chão.'); return; }
var pzC = S._colocar ? S._colocar.pose(p) : null;
var idFam = 'f' + (edit.seq + 1);
var opF = { op: 'familia', id: 'f' + (++edit.seq), famId: fsel.famId, tipoId: fsel.tipoId, x: pzC ? pzC.x : Math.round(p.x * 1000) / 1000, y: pzC ? pzC.y : edit.base, z: pzC ? pzC.z : Math.round(p.z * 1000) / 1000, rotY: pzC ? pzC.rotY : edit.famRot, inst: fsel.inst || {} };
var ltL = null;
try { if (window.EletIlumUI && fam.mep && fam.mep.peca === 'luminaria') { ltL = EletIlumUI.aoColocar(JSON.parse(JSON.stringify(opF)), edit.ops, famAval); if (ltL) ltL = BimEdit.sanear([ltL])[0] || null; } } catch (_eL) { ltL = null; }
editOp(ltL || opF);
S._hint(fam.nome + ' colocada' + (window.EletIlumUI && fam.mep && fam.mep.peca === 'luminaria' ? EletIlumUI.rotuloColocar() : '') + '. Barra de espaço gira 90°; clique para outra, ou Esc.');
try { if (typeof window !== 'undefined' && window.dispatchEvent && typeof CustomEvent === 'function') window.dispatchEvent(new CustomEvent('bim:familia-colocada', { detail: { id: idFam, famId: fsel.famId, tipoId: fsel.tipoId } })); } catch (eEv) {}
}
marcarFechamento();
}
var famGhostMat = null;
function editGhostLimpar() { if (edit.ghost) { scene.remove(edit.ghost); edit.ghost.geometry.dispose(); edit.ghost = null; } }
function editGhostMover(e) {
if (S._colocar && S._colocar.familia()) { if (edit.ghost) edit.ghost.visible = false; return; }
var fsel = edit.famSel, fam = fsel && famReg.lista[fsel.famId]; if (!fam) return;
var av = famAval(fsel.famId, fsel.tipoId, fsel.inst || {}); if (!av || !av.caixa) return;
var pos = null, rotY = edit.famRot;
if (fam.hospedagem === 'parede') {
var ph = raycastEm(e.clientX, e.clientY) ? editParedeDoHit() : null;
if (ph) { var hp = BimEdit.posicaoHospedada(ph.parede, BimEdit.tNaParede(ph.parede, ph.ponto)); pos = hp; rotY = hp.rotY; }
} else { var pp = editPontoPlano(e.clientX, e.clientY); if (pp) pos = { x: pp.x, y: edit.base, z: pp.z }; }
if (!pos) { if (edit.ghost) edit.ghost.visible = false; return; }
var b = av.caixa;
if (!edit.ghost) {
famGhostMat = famGhostMat || new THREE.LineBasicMaterial({ color: 0x3fb5e5, depthTest: false, transparent: true, opacity: 0.95 });
edit.ghost = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), famGhostMat);
edit.ghost.renderOrder = 998; scene.add(edit.ghost);
}
edit.ghost.visible = true;
edit.ghost.scale.set(Math.max(b.x1 - b.x0, 0.01), Math.max(b.y1 - b.y0, 0.01), Math.max(b.z1 - b.z0, 0.01));
var cxl = (b.x0 + b.x1) / 2, cyl = (b.y0 + b.y1) / 2, czl = (b.z0 + b.z1) / 2, co = Math.cos(rotY), si = Math.sin(rotY);
edit.ghost.position.set(pos.x + cxl * co + czl * si, pos.y + cyl, pos.z - cxl * si + czl * co);
edit.ghost.rotation.set(0, rotY, 0);
}
document.addEventListener('keydown', function (ev) {
if (!edit.on || edit.sub !== 'familia' || ev.key !== ' ') return;
var t2 = ev.target || {}; if (/^(INPUT|TEXTAREA|SELECT)$/.test(t2.tagName || '')) return;
edit.famRot = (edit.famRot + Math.PI / 2) % (2 * Math.PI); ev.preventDefault();
S._hint('Girada para ' + Math.round(edit.famRot * 180 / Math.PI) + '°.');
try { if (window.BimShell && BimShell.status) BimShell.status('Giro ' + Math.round(edit.famRot * 180 / Math.PI) + '° — Espaço gira 90°.'); } catch (eGS) {}
});
var VOL_SUBS = { extrusao: 1, revolucao: 1, varredura: 1, unir: 1, subtrair: 1, empurrar: 1, volprops: 1 };
edit.vol = { pts: [], linha: null, marcas: [], eixo: null, dirPerfil: null, alvo: null, face: null, dist: 0,
altura: 1, categoria: 'generico', material: 'Concreto', angulo: 360, perfil: 'retangulo', largura: 0.2, alturaPerfil: 0.4, diametro: 0.1, elevacao: 0 };
edit.volCache = {};
S._volSubs = VOL_SUBS;
S._csgFn = null;
var csgCarregando = null;
function csgCarregar() {
if (S._csgFn) return Promise.resolve(S._csgFn);
if (csgCarregando) return csgCarregando;
csgCarregando = import('../bim/vendor/jsm/csg/three-bvh-csg.module.js').then(function (lib) {
if (typeof BimVolume === 'undefined') throw new Error('js/bimvolume.js não carregou');
S._csgFn = BimVolume.csgCom(THREE, lib);
return S._csgFn;
}, function (e) { csgCarregando = null; S._hint('Não consegui carregar o motor de união/subtração (CSG): ' + (e && e.message)); throw e; });
return csgCarregando;
}
S._csgCarregar = csgCarregar;
function volDoId(id) { return ((edit.estado && edit.estado.volumes) || []).filter(function (v) { return v.id === id; })[0] || null; }
function volMedir(st) {
if (!st.volumes || !st.volumes.length || typeof BimVolume === 'undefined') return;
if (Object.keys(edit.volCache).length > 300) edit.volCache = {};
var med = BimEdit.medirVolumes(st, S._csgFn, edit.volCache);
if (med.pendentes && !S._csgFn) {
csgCarregar().then(function () { if (!S || !S.alive) return; var rp = edit._replay; edit._replay = true; try { editRebuild(); } finally { edit._replay = rp; } }, function () {});
}
if (med.erros.length) S._hint('Volume ' + med.erros[0].id + ': ' + med.erros[0].erro);
}
var aguaMats = {};
function aguaMat(inst) {
var k = inst ? 'i' : 'n';
if (!aguaMats[k]) {
aguaMats[k] = new THREE.MeshPhysicalMaterial({ color: 0x2f8fc9, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, transparent: true, opacity: inst ? 0.22 : 0.55, depthWrite: false, side: THREE.DoubleSide });
aguaMats[k].name = inst ? 'agua-instalacoes' : 'agua'; aguaMats[k].userData.agua = true;
estMarcarMat(aguaMats[k], 'Água');
}
return aguaMats[k];
}
S._aguaMat = aguaMat;
function volDesenhar(st, mo, addMesh) {
(st.volumes || []).forEach(function (v) {
if (!v.malha) return;
var m = v.malha, pos = new Float32Array(m.f.length * 3);
for (var i = 0; i < m.f.length; i++) { var k = m.f[i]; pos[3 * i] = m.v[3 * k]; pos[3 * i + 1] = m.v[3 * k + 1]; pos[3 * i + 2] = m.v[3 * k + 2]; }
var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.computeVertexNormals();
var ix = new (m.f.length > 65535 ? Uint32Array : Uint16Array)(m.f.length); for (var j = 0; j < ix.length; j++) ix[j] = j;
g.setIndex(new THREE.BufferAttribute(ix, 1));
var ehAgua = /^[áa]gua$/i.test(String(v.material || '').trim()), ehPisc = /piscin|pool|\bspa\b|ofur/i.test(String(v.nome || ''));
var mat = ehAgua ? aguaMat(false) : famMat(v.material), ms = new THREE.Mesh(g, mat);
if (ehAgua) ms.userData.agua = true; else if (ehPisc) ms.userData.piscFundo = true;
addMesh(ms, v.id, v.ifc, mat);
mo.tipos[v.ifc] = (mo.tipos[v.ifc] || 0) + 1;
var md = v.medidas || {};
mo.qto[v.id] = { volume: md.volume, area: md.area, comprimento: md.comprimento, contagem: 1 };
var NOMES_V = { generico: 'Volume', parede: 'Parede (volume)', laje: 'Laje (volume)', pilar: 'Pilar (volume)', viga: 'Viga (volume)', cobertura: 'Cobertura (volume)' };
mo.elementos.push({ id: v.id, uid: 'edit:' + v.id, mid: 'edit', arquivo: mo.nome, tipo: v.ifc, nome: (v.nome || NOMES_V[v.categoria] || 'Volume') + ' — ' + v.material + ' (sintético ' + v.id + ')',
etapa: null, codOrc: null, qto: mo.qto[v.id], disciplina: v.categoria === 'pilar' || v.categoria === 'viga' ? 'estrutura' : 'arquitetura', volume: { categoria: v.categoria, material: v.material } });
mo.nEl++;
});
}
function volLinha() {
var vo = edit.vol;
if (vo.linha) { scene.remove(vo.linha); vo.linha.geometry.dispose(); vo.linha = null; }
var pts = vo.pts.map(function (q) { return q.ponto; });
if (pts.length < 2) return;
if (!edit._linhaMat) edit._linhaMat = new THREE.LineBasicMaterial({ color: 0x2fbf71, depthTest: false });
vo.linha = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), edit._linhaMat);
vo.linha.renderOrder = 999; scene.add(vo.linha);
}
function volLimpar() {
var vo = edit.vol; if (!vo) return;
vo.pts = []; vo.eixo = null; vo.dirPerfil = null; vo.alvo = null; vo.face = null; vo.dist = 0;
if (vo.linha) { scene.remove(vo.linha); vo.linha.geometry.dispose(); vo.linha = null; }
vo.marcas.forEach(function (o) { limparMarca(o); }); vo.marcas = [];
if (vo.realce) { vo.realce.material = vo.realce.userData.matOrig || vo.realce.material; vo.realce = null; }
}
S._volLimpar = volLimpar;
function volMarca(p) { var mk = pontoMarca(p); scene.add(mk); rescaleObj(mk); edit.vol.marcas.push(mk); }
function volPontoPerfil(clientX, clientY) {
var vo = edit.vol; if (!vo.eixo || !vo.dirPerfil) return null;
var rc = canvasEl.getBoundingClientRect();
mouse.x = ((clientX - rc.left) / rc.width) * 2 - 1; mouse.y = -((clientY - rc.top) / rc.height) * 2 + 1;
ray.setFromCamera(mouse, camera);
var nrm = new THREE.Vector3(vo.dirPerfil.z, 0, -vo.dirPerfil.x);
var pl = new THREE.Plane().setFromNormalAndCoplanarPoint(nrm, vo.eixo), alvo = new THREE.Vector3();
return ray.ray.intersectPlane(pl, alvo) ? alvo : null;
}
function volPerfilRH(p) {
var vo = edit.vol, r = (p.x - vo.eixo.x) * vo.dirPerfil.x + (p.z - vo.eixo.z) * vo.dirPerfil.z;
return [Math.max(0, Math.round(r * 1000) / 1000), Math.round((p.y - vo.eixo.y) * 1000) / 1000];
}
function volNovo(receita, rotulo) {
var vo = edit.vol, id = 'e' + (++edit.seq);
editOp({ op: 'volume', id: id, volume: { receita: receita, categoria: vo.categoria, material: vo.material } });
var v = volDoId(id);
if (v && v.medidas) S._hint(rotulo + ' criada: ' + v.medidas.volume.toFixed(3).replace('.', ',') + ' m³, ' + v.medidas.area.toFixed(2).replace('.', ',') + ' m² de superfície (' + (BimVolume.CATEGORIAS[vo.categoria] || vo.categoria) + ', ' + vo.material + ').');
else if (v && v.erro) S._hint(rotulo + ': ' + v.erro);
marcarFechamento();
return id;
}
function volConcluir() {
var vo = edit.vol, sub = edit.sub;
if (sub === 'extrusao') {
if (vo.pts.length < 3) { S._hint('Extrusão: clique pelo menos 3 pontos do contorno.'); return false; }
var pl = (window.BimPlano && BimPlano.planoVolume && BimPlano.planoVolume()) || BimVolume.planoHorizontal(edit.base);
var cont = vo.pts.map(function (q) { var ab = BimVolume.paraPlano(BimVolume.lerPlano(pl), [q.ponto.x, q.ponto.y, q.ponto.z]); return [Math.round(ab[0] * 1000) / 1000, Math.round(ab[1] * 1000) / 1000]; });
var ex = BimVolume.extrusao({ contorno: cont, plano: pl, altura: vo.altura });
if (!ex.ok) { S._hint('Extrusão: ' + ex.erro + '.'); return false; }
editTirarProv();
volNovo({ forma: 'extrusao', contorno: cont, plano: pl, altura: vo.altura }, 'Extrusão');
return true;
}
if (sub === 'revolucao') {
if (!vo.eixo || vo.pts.length < 3) { S._hint('Revolução: clique o eixo, a direção e pelo menos 3 pontos do perfil.'); return false; }
var rec = { forma: 'revolucao', perfil: vo.pts.map(function (q) { return q.rh; }), angulo: vo.angulo, segmentos: 48,
eixo: { o: [vo.eixo.x, vo.eixo.y, vo.eixo.z], d: [0, 1, 0], ref: [vo.dirPerfil.x, 0, vo.dirPerfil.z] } };
var rv = BimVolume.revolucao(rec);
if (!rv.ok) { S._hint('Revolução: ' + rv.erro + '.'); return false; }
editTirarProv();
volNovo(rec, 'Revolução');
return true;
}
if (sub === 'varredura') {
if (vo.pts.length < 2) { S._hint('Varredura: clique pelo menos 2 pontos do caminho.'); return false; }
var perfil = vo.perfil === 'circulo' ? BimVolume.perfilCirculo(vo.diametro, 24).map(function (q) { return [q[0], q[1] + vo.diametro / 2]; }) : BimVolume.perfilRetangulo(vo.largura, vo.alturaPerfil);
var cam = vo.pts.map(function (q) { return [Math.round(q.ponto.x * 1000) / 1000, Math.round((edit.base + vo.elevacao) * 1000) / 1000, Math.round(q.ponto.z * 1000) / 1000]; });
var rec2 = { forma: 'varredura', perfil: perfil, caminho: cam }, vr = BimVolume.varredura(rec2);
if (!vr.ok) { S._hint('Varredura: ' + vr.erro + '.'); return false; }
editTirarProv();
volNovo(rec2, 'Varredura');
return true;
}
return false;
}
S._volConcluir = volConcluir;
function volDoHit() {
var h0 = _ultimosHits && _ultimosHits[0]; if (!h0 || !h0.object || h0.object.userData.mid !== 'edit') return null;
var v = volDoId(h0.object.userData.expressID); if (!v) return null;
var n = h0.face ? h0.face.normal.clone().transformDirection(h0.object.matrixWorld) : null;
return { v: v, mesh: h0.object, ponto: modelRoot.worldToLocal(h0.point.clone()), normal: n };
}
function volRealcar(mesh) {
var vo = edit.vol;
if (vo.realce) { vo.realce.material = vo.realce.userData.matOrig || vo.realce.material; vo.realce = null; }
if (mesh) { mesh.material = editMat('sel'); vo.realce = mesh; }
}
function volDistMouse(clientX, clientY) {
var f = edit.vol.face; if (!f) return 0;
var rc = canvasEl.getBoundingClientRect();
mouse.x = ((clientX - rc.left) / rc.width) * 2 - 1; mouse.y = -((clientY - rc.top) / rc.height) * 2 + 1;
ray.setFromCamera(mouse, camera);
var d1 = ray.ray.direction, d2 = new THREE.Vector3(f.normal[0], f.normal[1], f.normal[2]), w0 = ray.ray.origin.clone().sub(new THREE.Vector3(f.ponto[0], f.ponto[1], f.ponto[2]));
var a = d1.dot(d1), b = d1.dot(d2), c = d2.dot(d2), d = d1.dot(w0), e2 = d2.dot(w0), den = a * c - b * b;
if (Math.abs(den) < 1e-9) return 0;
return Math.round(((a * e2 - b * d) / den) * 100) / 100;
}
function volEmpurrarCom(dist) {
var vo = edit.vol, f = vo.face;
if (!f || !(Math.abs(dist) >= 0.01)) { S._hint('Empurrar: a distância precisa ser de pelo menos 1 cm.'); return false; }
var id = f.id;
editOp({ op: 'volEmpurrar', id: id, ponto: f.ponto, normal: f.normal, dist: dist });
var v = volDoId(id);
S._hint(v && v.medidas ? 'Face ' + (dist > 0 ? 'puxada ' : 'empurrada ') + Math.abs(dist).toFixed(2).replace('.', ',') + ' m: o volume ficou com ' + v.medidas.volume.toFixed(3).replace('.', ',') + ' m³.' :
(v && v.pendente ? 'Calculando a face pelo CSG…' : 'Não deu para empurrar: ' + ((v && v.erro) || 'a face não foi achada') + '. Desfazer (Ctrl+Z) volta.'));
editTirarProv(); marcarFechamento();
return true;
}
S._volDistDigitada = function () {
if (edit.sub !== 'empurrar' || !edit.vol.face) return false;
var inp = editDist.querySelector('[data-edd="inp"]'), v = parseFloat(String(inp.value || '').replace(',', '.'));
inp.value = '';
if (isFinite(v)) volEmpurrarCom(v);
return true;
};
function volClique(e, hit, p) {
var vo = edit.vol, sub = edit.sub, rotN = BimVolume.CATEGORIAS;
if (sub === 'unir' || sub === 'subtrair') {
var hv = hit ? volDoHit() : null;
if (!hv) { S._hint((sub === 'unir' ? 'Unir' : 'Subtrair') + ': clique num VOLUME criado aqui (parede, laje e IFC não entram).'); return; }
if (!vo.alvo) { vo.alvo = hv.v.id; volRealcar(hv.mesh); csgCarregar().catch(function () {}); S._hint(sub === 'unir' ? 'Agora clique o volume que vai JUNTAR a este.' : 'Agora clique o volume que vai RECORTAR este (ele some depois do corte).'); return; }
if (hv.v.id === vo.alvo) { S._hint('Clique OUTRO volume.'); return; }
var alvo = vo.alvo; volRealcar(null); vo.alvo = null;
csgCarregar().then(function () {
editOp({ op: 'volBool', id: alvo, ferramenta: hv.v.id, tipo: sub === 'unir' ? 'uniao' : 'subtracao' });
var r = volDoId(alvo);
S._hint(r && r.medidas ? (sub === 'unir' ? 'Unidos' : 'Recortado') + ': ' + r.medidas.volume.toFixed(3).replace('.', ',') + ' m³. Desfazer (Ctrl+Z) volta.' : 'Não deu: ' + ((r && r.erro) || 'sem volume') + '. Desfazer (Ctrl+Z) volta.');
marcarFechamento();
}, function () {});
return;
}
if (sub === 'empurrar') {
if (!vo.face) {
var hf = hit ? volDoHit() : null;
if (!hf || !hf.normal) { S._hint('Empurrar: clique numa FACE de um volume criado aqui.'); return; }
vo.face = { id: hf.v.id, ponto: [hf.ponto.x, hf.ponto.y, hf.ponto.z], normal: [hf.normal.x, hf.normal.y, hf.normal.z] };
volRealcar(hf.mesh); csgCarregar().catch(function () {});
S._hint('Mexa o mouse para longe (puxa) ou para dentro (empurra) e clique — ou digite a distância em metros e Enter (negativo empurra).');
return;
}
volEmpurrarCom(volDistMouse(e.clientX, e.clientY));
return;
}
if (sub === 'volprops') {
var hp = hit ? volDoHit() : null;
if (!hp) { S._hint('Clique num volume criado aqui para ele ficar com a categoria e o material do painel.'); return; }
editOp({ op: 'volProps', id: hp.v.id, categoria: vo.categoria, material: vo.material });
S._hint('Volume ' + hp.v.id + ': ' + (rotN[vo.categoria] || vo.categoria) + ', ' + vo.material + '.'); marcarFechamento();
return;
}
if (sub === 'revolucao') {
if (!vo.eixo) { if (!p) return; vo.eixo = new THREE.Vector3(p.x, edit.base, p.z); volMarca(vo.eixo); S._hint('Revolução: agora clique PARA ONDE vai o perfil (define o plano em pé).'); return; }
if (!vo.dirPerfil) {
if (!p) return;
var dx = p.x - vo.eixo.x, dz = p.z - vo.eixo.z, L = Math.sqrt(dx * dx + dz * dz);
if (L < 0.05) { S._hint('Clique um pouco mais longe do eixo.'); return; }
vo.dirPerfil = { x: dx / L, z: dz / L };
S._hint('Revolução: clique os pontos do perfil no plano em pé (a distância ao eixo é o raio). Enter gira ' + vo.angulo + '°.'); return;
}
var pp = volPontoPerfil(e.clientX, e.clientY); if (!pp) return;
var rh = volPerfilRH(pp), pr = new THREE.Vector3(vo.eixo.x + vo.dirPerfil.x * rh[0], vo.eixo.y + rh[1], vo.eixo.z + vo.dirPerfil.z * rh[0]);
vo.pts.push({ ponto: pr, rh: rh }); volMarca(pr); volLinha();
edit.p1 = pr.clone();
S._hint('Perfil: ' + vo.pts.length + ' ponto(s). Enter gira; Esc cancela.');
return;
}
if (!p) { S._hint('Não achei o ponto — clique no modelo ou no plano do chão.'); return; }
var q = new THREE.Vector3(p.x, edit.base, p.z);
if (sub === 'extrusao' && window.BimPlano && BimPlano.ativo() && !BimPlano.horizontalAtivo()) q = p.clone();
if (sub === 'extrusao' && vo.pts.length >= 3) {
var p0 = vo.pts[0].ponto, t0 = S._telaDe(p0.x, p0.y, p0.z);
if (q.distanceTo(p0) < 0.15 || (t0 && Math.hypot(t0.x - e.clientX, t0.y - e.clientY) < 12)) { volConcluir(); return; }
}
vo.pts.push({ ponto: q }); volMarca(q); volLinha();
edit.p1 = q.clone();
S._hint(sub === 'extrusao' ? 'Contorno: ' + vo.pts.length + ' ponto(s). Clique o 1º ponto ou Enter para extrudar ' + String(vo.altura).replace('.', ',') + ' m.' :
'Caminho: ' + vo.pts.length + ' ponto(s). Enter corre o perfil.');
}
function volPreviewMove(e) {
var vo = edit.vol, sub = edit.sub;
if (sub === 'empurrar' && vo.face) {
var d = volDistMouse(e.clientX, e.clientY), rc2 = canvasEl.getBoundingClientRect();
editDist.style.display = ''; editDist.style.left = (e.clientX - rc2.left + 16) + 'px'; editDist.style.top = (e.clientY - rc2.top + 12) + 'px';
var tx = editDist.querySelector('[data-edd="txt"]'); if (tx) tx.textContent = (d > 0 ? '+' : '') + d.toFixed(2).replace('.', ',') + ' m';
vo.dist = d; return;
}
if (!edit.p1) return;
var pM = sub === 'revolucao' ? volPontoPerfil(e.clientX, e.clientY) : editPontoPlano(e.clientX, e.clientY);
if (pM) editPreview(pM, e.clientX, e.clientY);
}
S._volPreviewa = function () { return !!(edit.on && VOL_SUBS[edit.sub] && (edit.p1 || (edit.sub === 'empurrar' && edit.vol.face))); };
document.addEventListener('keydown', function (ev) {
if (!edit.on || !VOL_SUBS[edit.sub] || ev.key !== 'Enter') return;
var t2 = ev.target || {}; if (/^(INPUT|TEXTAREA|SELECT)$/.test(t2.tagName || '')) return;
if (!edit.vol.pts.length && !edit.vol.eixo) return;
ev.preventDefault(); ev.stopPropagation();
volConcluir();
}, true);
S._volParametros = function (par) {
var vo = edit.vol; par = par || {};
['altura', 'angulo', 'largura', 'alturaPerfil', 'diametro', 'elevacao'].forEach(function (k) { var n2 = Number(par[k]); if (par[k] != null && isFinite(n2)) vo[k] = n2; });
if (par.categoria && BimVolume.CATEGORIAS[par.categoria]) vo.categoria = par.categoria;
if (par.material != null && String(par.material).trim()) vo.material = String(par.material).trim().slice(0, 60);
if (par.perfil === 'circulo' || par.perfil === 'retangulo') vo.perfil = par.perfil;
vo.angulo = Math.max(1, Math.min(360, vo.angulo));
volPainelPintar();
return JSON.parse(JSON.stringify({ altura: vo.altura, angulo: vo.angulo, largura: vo.largura, alturaPerfil: vo.alturaPerfil, diametro: vo.diametro, elevacao: vo.elevacao, categoria: vo.categoria, material: vo.material, perfil: vo.perfil }));
};
var volPainel = document.createElement('div');
volPainel.setAttribute('data-ed', 'vol');
volPainel.style.cssText = 'display:none;flex-direction:column;gap:6px;border-top:1px solid var(--linha,#d3dce6);padding-top:6px';
volPainel.innerHTML =
'<b>Volume livre</b>' +
'<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
'<label>Altura <input data-vol="altura" class="inp" type="number" step="0.05" style="width:58px"> m</label>' +
'<label>Ângulo <input data-vol="angulo" class="inp" type="number" step="15" min="1" max="360" style="width:52px">°</label></div>' +
'<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
'<label>Perfil <select data-vol="perfil" class="inp"><option value="retangulo">Retângulo</option><option value="circulo">Círculo</option></select></label>' +
'<label>L <input data-vol="largura" class="inp" type="number" step="0.01" style="width:52px"></label>' +
'<label>A <input data-vol="alturaPerfil" class="inp" type="number" step="0.01" style="width:52px"></label>' +
'<label>Ø <input data-vol="diametro" class="inp" type="number" step="0.01" style="width:52px"></label></div>' +
'<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
'<label>Categoria <select data-vol="categoria" class="inp">' + (typeof BimVolume !== 'undefined' ? Object.keys(BimVolume.CATEGORIAS).map(function (k) { return '<option value="' + k + '">' + BimVolume.CATEGORIAS[k] + '</option>'; }).join('') : '') + '</select></label>' +
'<label>Material <input data-vol="material" class="inp" maxlength="60" style="width:110px"></label></div>' +
'<div style="font-size:10.5px;color:var(--texto-fraco,#5b6b7c)" data-vol="dica"></div>';
editPanel.insertBefore(volPainel, editPanel.lastChild);
function volPainelPintar() {
var vo = edit.vol;
volPainel.querySelectorAll('[data-vol]').forEach(function (el) { var k = el.getAttribute('data-vol'); if (k !== 'dica' && document.activeElement !== el) el.value = vo[k]; });
var dica = { extrusao: 'Clique o contorno no plano de trabalho; feche no 1º ponto ou Enter.', revolucao: 'Eixo, direção do perfil e o perfil em pé; Enter gira.',
varredura: 'Clique o caminho; Enter corre o perfil.', unir: 'Clique o volume alvo e depois o que junta.', subtrair: 'Clique o volume alvo e depois o que recorta (ele some).',
empurrar: 'Clique a face, mexa o mouse e clique (ou digite a distância).', volprops: 'Clique um volume: ele fica com a categoria e o material acima.' }[edit.sub] || '';
var dd = volPainel.querySelector('[data-vol="dica"]'); if (dd) dd.textContent = dica;
volPainel.style.display = VOL_SUBS[edit.sub] ? 'flex' : 'none';
}
S._volPainelPintar = volPainelPintar;
volPainel.addEventListener('change', function (e) {
var el = e.target.closest('[data-vol]'); if (!el) return;
var par = {}; par[el.getAttribute('data-vol')] = el.value; S._volParametros(par);
});
S._ifcSaida = function (o) {
o = o || {};
if (typeof IfcSaida === 'undefined') return Promise.resolve({ ok: false, erro: 'o escritor de IFC (js/ifcsaida.js) não carregou' });
var st = BimEdit.aplicar(edit.ops);
if (window.BimOpcoes && BimOpcoes.filtrar && st.opcoes) st = BimOpcoes.filtrar(st);
var precisa = (st.volumes || []).some(function (v) { return BimVolume.precisaCsg(v.receita); });
return (precisa ? csgCarregar() : Promise.resolve(null)).then(function () {
BimEdit.medirVolumes(st, S._csgFn, edit.volCache);
var inst = st.instalacoes || {};
var n = st.caixas.length + st.coberturas.length + st.familias.length + (st.volumes || []).length + (st.eixos || []).length + (inst.trechos || []).length + (inst.pecas || []).length
+ (S._p11 ? S._p11.contar(st) : 0);
if (!n) return { ok: false, erro: 'nada modelado no OrçaPRO para exportar (o IFC importado já é um IFC)' };
var r = IfcSaida.gerar(st, { avaliarFam: famAval, csg: S._csgFn, cacheVolume: edit.volCache,
categoriaFam: function (id) { var f = famReg.lista[id]; return f ? f.categoria : null; }, nomeFam: function (id) { var f = famReg.lista[id]; return f ? f.nome : id; },
familia: function (id) { return famReg.lista[id] || null; },
parametrosProjeto: o.parametrosProjeto || S._paramProjeto || null,
materiaisProjeto: o.materiaisProjeto || ((window.BimMateriaisUI && BimMateriaisUI.ativo() && BimMateriaisUI.ifcOpts) ? BimMateriaisUI.ifcOpts() : null),
niveis: o.niveis, projeto: o.projeto, semente: o.semente, autor: o.autor, empresa: o.empresa, versaoApp: o.versaoApp, arquivo: o.arquivo, agora: o.agora,
fabricacao: !!o.fabricacao });
r.ok = true; r.n = n;
return r;
});
};
function setEditSub(sub) {
edit.sub = (edit.sub === sub) ? null : sub;
editGhostLimpar();
editTirarProv(); editSoltarSel(); editHintSub(); editSt();
if (S._volPainelPintar) S._volPainelPintar();
if (edit.sub === 'unir' || edit.sub === 'subtrair' || edit.sub === 'empurrar') csgCarregar().catch(function () {});
canvasEl.style.cursor = edit.sub ? 'crosshair' : '';
['parede', 'laje', 'pilar', 'mover', 'apagar', 'anotar'].forEach(function (k) {
var b = editPanel.querySelector('[data-ed="' + k + '"]'); if (!b) return;
var on2 = edit.sub === k;
b.style.background = on2 ? corAtiva() : ''; b.style.color = on2 ? '#fff' : '';
});
if (S._prec) S._prec.aoSub(edit.sub);
if (S._p2d) S._p2d.aoSub(edit.sub);
if (S._p11) S._p11.aoSub(edit.sub);
if (S._p3) S._p3.aoSub(edit.sub);
if (S._emb) S._emb.aoSub(edit.sub);
if (S._metc) S._metc.aoSub(edit.sub);
if (S._cot) S._cot.aoSub(edit.sub);
if (S._metp) S._metp.aoSub(edit.sub);
if (S._mtq) S._mtq.aoSub(edit.sub);
if (window.BimBarraOpcoes && BimBarraOpcoes.armou) BimBarraOpcoes.armou(edit.sub);
}
function setEdit(on) {
edit.on = !!on;
if (on) {
if (medir.on) setMedir(false); if (area.on) setArea(false); if (ang.on) setAng(false);
if (ctec.ativo && S._ctecCancelar) S._ctecCancelar(true);
setMode(false); fecharPaineis(null);
edit.base = (edit.b2 && edit.b2.nivel && isFinite(+edit.b2.nivel.elevacao)) ? +edit.b2.nivel.elevacao : editBase();
planoBase();
editPanel.style.display = (window.BimBarraOpcoes && BimBarraOpcoes.substituiPainel && BimBarraOpcoes.substituiPainel()) ? 'none' : 'flex';
editHintSub(); editSt();
} else {
editTirarProv(); editSoltarSel();
edit.sub = null; editPanel.style.display = 'none';
canvasEl.style.cursor = ''; S._hint('');
if (S._prec) S._prec.aoSub(null);
if (S._p2d) S._p2d.aoSub(null);
if (S._p11) S._p11.aoSub(null);
if (S._p3) S._p3.aoSub(null);
if (S._metc) S._metc.aoSub(null);
if (S._cot) S._cot.aoSub(null);
if (S._metp) S._metp.aoSub(null);
if (S._mtq) S._mtq.aoSub(null);
if (window.BimBarraOpcoes && BimBarraOpcoes.armou) BimBarraOpcoes.armou(null);
}
var be = bar.querySelector('[data-b="editar"]'); if (be) { be.style.background = on ? corAtiva() : ''; be.style.color = on ? '#fff' : ''; }
}
S._setEdit = setEdit;
S._setEditSub = setEditSub;
S._editOps = function () { return edit.ops.slice(); };
S._editAplicar = function (ops) {
if (!S || !S.alive) return;
edit.ops = BimEdit.sanear(ops);
var mx = 0;
edit.ops.concat(BimEdit.achatar(edit.ops)).forEach(function (o) { var m2 = /^[eaf](\d+)$/.exec(String(o.id || '')); if (m2) mx = Math.max(mx, parseInt(m2[1], 10)); });
edit.seq = mx;
edit._replay = true;
try { editRebuild(); } finally { edit._replay = false; }
if (edit.ops.length) enquadrar();
};
S._editReaplicarRem = function () {
if (!edit.ops.length) return;
var st2 = BimEdit.aplicar(edit.ops);
if (!st2.removidosIfc.length) return;
S._remEd = {};
(st2.removidosIfcInfo || []).forEach(function (info) { S._remEd[editUidRemovido(info)] = 1; });
todasMalhas(function (m) { if (S._remEd[m.userData.mid + ':' + m.userData.expressID]) m.visible = false; });
edit.removidosAntes = Object.keys(S._remEd);
};
S._editReset = function () {
edit.ops = []; edit.seq = 0; edit.removidosAntes = []; edit.modelo = null; S._remEd = null;
edit.sprites.forEach(function (sp) { scene.remove(sp); if (sp.material && sp.material.map) sp.material.map.dispose(); if (sp.material) sp.material.dispose(); });
edit.sprites = [];
if (S._b2Limpar3d) S._b2Limpar3d();
if (edit.on) setEdit(false);
if (opts.onEdicao) { try { opts.onEdicao([]); } catch (_) {} }
};
editPanel.addEventListener('click', function (e) {
var b = e.target.closest('[data-ed]'); if (!b) return; var k = b.getAttribute('data-ed');
if (k === 'fechar') setEdit(false);
else if (k === 'undo') { if (S._editDesfazer()) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Desfeito.'); } else { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Nada pra desfazer.'); } }
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
(function () { var bC = editPanel.querySelector('[data-ed="chain"]'); if (bC) { bC.style.background = corAtiva(); bC.style.color = '#fff'; } })();
editPanel.addEventListener('change', function (e) {
var i = e.target.closest('input[data-ed]'); if (!i) return; var k = i.getAttribute('data-ed'), v = parseFloat(i.value);
var lim = { esp: [0.05, 1.0], alt: [0.3, 8], secao: [0.1, 1] }[k];
if (!lim || !(v > 0) || !isFinite(v)) return;
v = Math.min(lim[1], Math.max(lim[0], v));
i.value = String(v);
if (k === 'esp') { if (edit.sub === 'laje') edit.espLaje = v; else edit.esp = v; }
else if (k === 'alt') edit.alt = v; else edit.secao = v;
});
S._setEspEditor = function (metros, rotulo) {
var v = parseFloat(metros);
if (!(v > 0) || !isFinite(v)) return false;
if (Math.abs(v - edit.esp) < 1e-6 && (rotulo || "") === (edit.tipoRotulo || "")) return true;
v = Math.min(1.0, Math.max(0.05, v));
edit.esp = v;
edit.tipoRotulo = rotulo || "";
if (edit.sub !== 'laje') {
var inp = editPanel.querySelector('input[data-ed="esp"]');
if (inp) inp.value = String(Math.round(v * 1000) / 1000);
}
return true;
};
S._espEditor = function () { return { esp: edit.esp, espLaje: edit.espLaje, tipo: edit.tipoRotulo || "" }; };
S._prec = (window.BimPrecisaoUI && window.BimPrecisao) ? BimPrecisaoUI.montar({
THREE: THREE, S: S, edit: edit, canvas: canvasEl, scene: scene,
host: function () { return (S && S.host) || host; }, camera: function () { return camera; },
planoPonto: editPontoPlano, raio: raioToque, raycast: raycastEm, hits: function () { return _ultimosHits; },
snapMalha: function (e, h) { return h ? aplicarSnap(h, raioToque(e)) : null; },
marca: mostrarSnapMarca, marcaEsconder: esconderSnapMarca,
op: editOp, clique: editClique, concluirParede: editConcluirParede, ajustar: editAjustarPonto, ghost: editGhostMover,
cotaSnap: function (y) { edit._cotaSnap = (y != null && isFinite(+y)) ? +y : null; },
armar: function (sub) { if (!edit.on) setEdit(true); if (edit.sub !== sub) setEditSub(sub); },
desarmar: function () { if (edit.sub) setEditSub(edit.sub); },
rotulo: labelSprite, reescalar: rescaleObj, avaliar: famAval, matSel: function () { return editMat('sel'); },
acabMat: acabMat, acabRegistrar: acabRegistrar,
fechou: marcarFechamento, hint: function (t) { S._hint(t); }
}) : null;
S._p2d = (window.BimAmbienteUI && BimAmbienteUI.montar3d) ? BimAmbienteUI.montar3d({
THREE: THREE, S: S, edit: edit, scene: scene,
op: editOp, planoPonto: editPontoPlano, hint: function (t) { S._hint(t); }, fechou: marcarFechamento,
enquadrar: function (box) { enquadrarObj(box, 2.2); },
pick: function (info) {
if (S.selected) { S.selected.material = S.prevMat; S.selected = null; S.prevMat = null; }
if (S._contornoSelecao) S._contornoSelecao(null);
var o = (S && S.opts) || opts; if (o.onPick) o.onPick(info);
}
}) : null;
S._p10 = (window.BimP10UI && BimP10UI.montar3d) ? BimP10UI.montar3d({ THREE: THREE, scene: scene }) : null;
S._p11 = (window.BimTerrenoUI && BimTerrenoUI.montar3d) ? BimTerrenoUI.montar3d({
THREE: THREE, S: S, edit: edit, scene: scene,
op: editOp, planoPonto: editPontoPlano, hint: function (t) { S._hint(t); }, fechou: marcarFechamento
}) : null;
S._p3 = (window.BimP3UI && BimP3UI.montar3d) ? BimP3UI.montar3d({
THREE: THREE, S: S, edit: edit, scene: scene, op: editOp, hint: function (t) { S._hint(t); }, fechou: marcarFechamento,
planoPonto: editPontoPlano, telaDe: function (x, y, z) { return S._telaDe ? S._telaDe(x, y, z) : null; },
marca: pontoMarca, limparMarca: limparMarca, reescalar: rescaleObj,
alvo: function () { var h = _ultimosHits[0]; return h && h.object && h.object.userData.mid === 'edit' ? h.object.userData.expressID : null; }
}) : null;
S._ctr = (window.BimContornoUI && BimContornoUI.montar3d) ? BimContornoUI.montar3d({
THREE: THREE, S: S, edit: edit, scene: scene, op: editOp, hint: function (t) { S._hint(t); }, fechou: marcarFechamento,
host: function () { return S.host || host; },
telaDe: function (x, y, z) { return S._telaDe ? S._telaDe(x, y, z) : null; },
planoEm: function (cx, cy, y) {
var rc = canvasEl.getBoundingClientRect();
mouse.x = ((cx - rc.left) / rc.width) * 2 - 1; mouse.y = -((cy - rc.top) / rc.height) * 2 + 1;
ray.setFromCamera(mouse, camera);
var alvo = new THREE.Vector3();
return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), alvo) ? { x: alvo.x, z: alvo.z } : null;
},
alvo: function () { var h = _ultimosHits[0]; return h && h.object && h.object.userData.mid === 'edit' ? h.object.userData.expressID : null; },
alvos: function () { return _ultimosHits.filter(function (h) { return h && h.object && h.object.userData.mid === 'edit'; }).map(function (h) { return h.object.userData.expressID; }); },
selecao: function () { return S._selAtual ? S._selAtual() : []; },
nivel: function () { return edit.b2 && edit.b2.nivel ? edit.b2.nivel : null; },
base: function () { return edit.base; },
modoDe: function (sub) {
if (sub === 'laje') return edit.b2 ? edit.b2.lajeModo : '';
if (sub === 'forro') return window.BimForroUI ? BimForroUI.cfg().modo : '';
if (sub === 'telhado') return window.BimP3UI ? BimP3UI.cfg('telhado').modo : '';
return '';
},
aguasTelhado: function () { return window.BimP3UI ? BimP3UI.cfg('telhado').aguas : 4; },
criar: function (sub, contornos, extra) {
var feitos = 0;
if (sub === 'telhado') { contornos.forEach(function (C) { if (S._p3 && S._p3.criarPorContorno && S._p3.criarPorContorno(C, extra)) feitos++; }); return feitos; }
contornos.forEach(function (C) {
edit.b2pts = C.map(function (q) { return new THREE.Vector3(q.x, edit.base, q.z); });
if (S._b2FecharExt && S._b2FecharExt()) feitos++;
});
edit.b2pts = [];
return feitos;
}
}) : null;
S._mat = (window.BimMateriaisUI && BimMateriaisUI.montar3d) ? BimMateriaisUI.montar3d({ THREE: THREE, S: S, edit: edit }) : null;
S._emb = (window.BimEmBreveUI && BimEmBreveUI.montar3d) ? BimEmBreveUI.montar3d({
THREE: THREE, S: S, edit: edit, scene: scene, hits: function () { return _ultimosHits; }, hint: function (t) { S._hint(t); }, fechou: marcarFechamento,
desarmar: function () { if (edit.sub) setEditSub(edit.sub); },
baseNivel: function () { return (edit.b2 && edit.b2.nivel && isFinite(+edit.b2.nivel.elevacao)) ? +edit.b2.nivel.elevacao : editBase(); },
vaos: function (st) { return BimEdit.vaosDasParedes(st, famAval); },
alvo: function () { return orbit && orbit.target ? orbit.target.clone() : null; }
}) : null;
S._bkx = (window.BlocokExecUI && BlocokExecUI.montar3d) ? BlocokExecUI.montar3d({
THREE: THREE, S: S, edit: edit, scene: scene, vaos: function (st) { return BimEdit.vaosDasParedes(st, famAval); }
}) : null;
S._andaime3d = (window.Andaime3D && Andaime3D.montar3d) ? Andaime3D.montar3d({ THREE: THREE, famAval: famAval, famMat: famMat,
nivel: function (fam) { var fn = famNivelDe(fam); return fn ? fn.nivel : 'alto'; },
planta: function (sim) { return window.FamiliasMob && FamiliasMob.linhasPlanta ? FamiliasMob.linhasPlanta(sim) : []; },
uv: function (nome) { return window.FamiliasAndaimeM && String(nome).toLowerCase() === FamiliasAndaimeM.MATERIAL_PERFURADO ? FamiliasAndaimeM.uvPerfurado : null; } }) : null;
S._alv = (window.AlvAssentamento3D && AlvAssentamento3D.montar3d) ? AlvAssentamento3D.montar3d({
THREE: THREE, S: S, edit: edit, scene: scene, vaos: function (st) { return BimEdit.vaosDasParedes(st, famAval); }
}) : null;
S._raioDe = function (cx, cy) {
var rc = canvasEl.getBoundingClientRect(), m2 = new THREE.Vector2(((cx - rc.left) / rc.width) * 2 - 1, -((cy - rc.top) / rc.height) * 2 + 1), rr = new THREE.Raycaster();
rr.setFromCamera(m2, camera);
return { origem: [rr.ray.origin.x, rr.ray.origin.y, rr.ray.origin.z], direcao: [rr.ray.direction.x, rr.ray.direction.y, rr.ray.direction.z] };
};
S._metc = (window.MetalCriarUI && MetalCriarUI.montar3d) ? MetalCriarUI.montar3d({
THREE: THREE, S: S, edit: edit, scene: scene, canvas: canvasEl,
host: function () { return (S && S.host) || host; }, camera: function () { return camera; },
raio: function (cx, cy) { return S._raioDe(cx, cy); }, raycast: raycastEm, hits: function () { return _ultimosHits; },
marca: mostrarSnapMarca, marcaEsconder: esconderSnapMarca, hint: function (t) { S._hint(t); }, fechou: marcarFechamento,
telaDe: function (x, y, z) { return S._telaDe ? S._telaDe(x, y, z) : null; }, reescalar: rescaleObj, avaliar: famAval,
alvo: function () { return orbit && orbit.target ? orbit.target.clone() : null; }
}) : null;
S._cot = (window.BimCotasUI && BimCotasUI.montar3d && window.BimCotas) ? BimCotasUI.montar3d({
THREE: THREE, S: S, edit: edit, scene: scene, canvas: canvasEl,
host: function () { return (S && S.host) || host; }, camera: function () { return camera; },
raio: function (cx, cy) { return S._raioDe(cx, cy); }, raycast: raycastEm,
snapMalha: function (e, h) { return h ? aplicarSnap(h, raioToque(e)) : null; },
planoPonto: editPontoPlano, marca: mostrarSnapMarca, marcaEsconder: esconderSnapMarca,
hint: function (t) { S._hint(t); }, fechou: marcarFechamento,
telaDe: function (x, y, z) { return S._telaDe ? S._telaDe(x, y, z) : null; }, reescalar: rescaleObj
}) : null;
S._metp = (window.MetalProntasUI && MetalProntasUI.montar3d) ? MetalProntasUI.montar3d({
THREE: THREE, S: S, edit: edit, scene: scene,
raio: function (cx, cy) { return S._raioDe(cx, cy); }, marca: mostrarSnapMarca, marcaEsconder: esconderSnapMarca, hint: function (t) { S._hint(t); },
telaDe: function (x, y, z) { return S._telaDe ? S._telaDe(x, y, z) : null; }
}) : null;
S._mtq = (window.MetalTanqueUI && MetalTanqueUI.montar3d) ? MetalTanqueUI.montar3d({
THREE: THREE, S: S, edit: edit, scene: scene,
raio: function (cx, cy) { return S._raioDe(cx, cy); }, marca: mostrarSnapMarca, marcaEsconder: esconderSnapMarca, hint: function (t) { S._hint(t); },
telaDe: function (x, y, z) { return S._telaDe ? S._telaDe(x, y, z) : null; }
}) : null;
S._colocar = (window.BimInstColocar && BimInstColocar.montar3d) ? BimInstColocar.montar3d({
THREE: THREE, S: S, edit: edit, scene: scene, canvas: canvasEl, camera: function () { return camera; },
famAval: famAval, famMalhas: function (av, inst, mat) { return famMalhas(av, inst, mat); }, familia: function (id) { return famReg.lista[id] || null; },
planoPonto: editPontoPlano, hint: function (t) { S._hint(t); }
}) : null;
edit.b2 = null; edit.b2pts = null; edit.b2linha = null; edit.b2objs = []; edit.b2moverEixo = null;
var b2Mats = null;
function b2Mat(k) {
if (!b2Mats) {
b2Mats = {
aco: new THREE.MeshStandardMaterial({ color: 0x8a9099, metalness: .55, roughness: .45, side: THREE.DoubleSide }),
madeira: new THREE.MeshStandardMaterial({ color: 0xb88a5a, metalness: .02, roughness: .85, side: THREE.DoubleSide }),
escada: new THREE.MeshStandardMaterial({ color: 0xb9c0c8, metalness: .05, roughness: .9, side: THREE.DoubleSide }),
parafuso: new THREE.MeshStandardMaterial({ color: 0x4a4f57, metalness: .7, roughness: .35, side: THREE.DoubleSide }),
eixo: new THREE.LineDashedMaterial({ color: 0x2e6f9e, dashSize: 0.6, gapSize: 0.18, depthTest: false, transparent: true, opacity: 0.9 }),
poli: new THREE.LineBasicMaterial({ color: 0x2fbf71, depthTest: false })
};
}
return b2Mats[k];
}
var b2MatsAcab = {};
function b2MatAcab(acab, aco) {
var AC = window.BimMetalAcab, a = AC ? AC.normalizar(acab, aco) : null;
if (!a) return b2Mat('aco');
var k = AC.chave(a);
if (!b2MatsAcab[k]) {
var d = AC.pbr(a), m = new THREE.MeshStandardMaterial({ color: new THREE.Color(d.cor), roughness: d.rug, metalness: d.met, side: THREE.DoubleSide });
m.userData.acabMetal = k; m.userData.corLin = m.color.clone(); m.userData.nomeMaterial = AC.rotulo(a);
b2MatsAcab[k] = m;
}
return b2MatsAcab[k];
}
S._b2MatAcab = b2MatAcab;
function b2Geo(poli, furos, z0, z1, mapa) {
var V2 = function (q) { return new THREE.Vector2(q[0], q[1]); };
var cont = poli.map(V2), fur = (furos || []).map(function (f) { return f.map(V2); });
var todos = poli.concat.apply(poli.slice(), furos || []), nC = poli.length;
var zt = function (i) { return Array.isArray(z1) ? (i < nC ? z1[i] : z1.reduce(function (s, v) { return s + v; }, 0) / z1.length) : z1; };
var pos = [];
function v(i, z) { var w = mapa(todos[i][0], todos[i][1], z); pos.push(w[0], w[1], w[2]); }
var tris = [];
try { tris = THREE.ShapeUtils.triangulateShape(cont, fur); } catch (eT) { tris = []; }
tris.forEach(function (t) { v(t[0], z0); v(t[2], z0); v(t[1], z0); v(t[0], zt(t[0])); v(t[1], zt(t[1])); v(t[2], zt(t[2])); });
var aneis = [[0, nC]], ini = nC;
(furos || []).forEach(function (f) { aneis.push([ini, f.length]); ini += f.length; });
aneis.forEach(function (an) {
for (var k = 0; k < an[1]; k++) {
var i = an[0] + k, j = an[0] + (k + 1) % an[1];
v(i, z0); v(j, z0); v(j, zt(j)); v(i, z0); v(j, zt(j)); v(i, zt(i));
}
});
var g = new THREE.BufferGeometry();
g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
var idx = []; for (var q = 0; q < pos.length / 3; q++) idx.push(q);
g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingBox();
return g;
}
var p2bMatForro = null;
S._p2bForros = function (st, mo, addMesh) {
var BF = window.BimForro; if (!BF) return;
if (!p2bMatForro) p2bMatForro = new THREE.MeshStandardMaterial({ color: 0xf1eee6, metalness: 0, roughness: .95, side: THREE.DoubleSide });
(st.forros || []).forEach(function (f) {
if (!f || !f.ok || !f.contorno || f.contorno.length < 3) return;
var C = (f.sancaInterno && f.sancaInterno.length > 2 ? f.sancaInterno : f.contorno).map(function (p) { return [p.x, p.z]; }), Fu = f.sancaInterno && f.sancaInterno.length > 2 ? [] : (f.furos || []).map(function (q) { return q.pts.map(function (p) { return [p.x, p.z]; }); });
var g = b2Geo(C, Fu, 0, f.espessura, function (a, b, z) { return [a, BF.cotaEm(f, a, b) + z, b]; });
addMesh(new THREE.Mesh(g, p2bMatForro), f.id, 'IFCCOVERING', p2bMatForro);
mo.tipos.IFCCOVERING = (mo.tipos.IFCCOVERING || 0) + 1;
mo.qto[f.id] = { area: f.area, comprimento: f.perimetro, volume: f.volume, contagem: 1 };
mo.elementos.push({ id: f.id, uid: 'edit:' + f.id, mid: 'edit', arquivo: mo.nome, tipo: 'IFCCOVERING', nome: 'Forro ' + (f.tipoForro ? f.tipoForro.rotulo : '') + ' (sintético ' + f.id + ')', etapa: null, codOrc: null, qto: mo.qto[f.id], disciplina: 'arquitetura' });
mo.nEl++;
});
};
function p2bForroCriar(dados) {
var b = edit.b2 || {};
if (!window.BimForroUI) { S._hint('A tela do forro (js/bimforroui.js) não carregou.'); return false; }
var rF = BimForroUI.criar(edit.estado, dados, b.nivel || null, edit.base, 'e' + (edit.seq + 1), b.niveis || null);
if (!rF.ok) { S._hint(rF.motivo); return false; }
edit.seq++; editTirarProv(); editOp(rF.op); S._hint(rF.resumo + ' Clique para outro, ou Esc.'); marcarFechamento();
return true;
}
function p2bForroAuto() { return window.BimForroUI && BimForroUI.cfg().modo !== 'contorno'; }
function b2Barra(a, b, s, mat) {
var A = new THREE.Vector3(a.x, a.y, a.z), Bv = new THREE.Vector3(b.x, b.y, b.z), L = A.distanceTo(Bv);
var m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(L, 0.01), s, s), mat);
m.position.copy(A).add(Bv).multiplyScalar(0.5);
m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), Bv.clone().sub(A).normalize());
return m;
}
function b2Plano(a, b, z) { return [a, z, b]; }
var metGeo = { mapa: {}, rodada: 1, feitas: 0, ligado: true };
function metGeoDescartar(e) { e.geos.forEach(function (g) { if (g.userData._arestas) g.userData._arestas.dispose(); g.dispose(); }); if (e.juntas) e.juntas.dispose(); }
var vedMats = {}, vedMatJ = null;
function vedMat(v) {
var k = (v && v.material === 'telha' ? 'telha:' + (v.textura || 'telha_metalica') : (v && v.material) || 'rufo');
if (vedMats[k]) return vedMats[k];
var COR = { 'telha:telha_metalica': [0.78, 0.81, 0.84], 'telha:telha_fibrocimento': [0.80, 0.80, 0.78], alvenaria: [0.74, 0.73, 0.70], concreto: [0.78, 0.78, 0.77], rufo: [0.70, 0.73, 0.76] }, c = COR[k] || COR.rufo;
var mt = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace), metalness: /telha:telha_metalica|rufo/.test(k) ? 0.35 : 0.02, roughness: /telha:telha_metalica|rufo/.test(k) ? 0.55 : 0.9, side: THREE.DoubleSide });
mt.userData.corLin = mt.color.clone(); mt.userData.rgba = [c[0], c[1], c[2], 1];
var slug = v && v.textura;
if (slug && window.BimTextura && BimTextura.existe && BimTextura.existe(slug) && BimTextura.BIB && BimTextura.BIB[slug]) { mt.userData.tex = { slug: slug, escala: BimTextura.BIB[slug].m, asp: BimTextura.BIB[slug].asp || 1, fonte: 'vedacao', classe: '', material: slug }; mt.userData.corIfc = [c[0], c[1], c[2]]; }
mt.userData.vedacao = k;
vedMats[k] = mt;
return mt;
}
function vedMatJunta() { if (!vedMatJ) vedMatJ = new THREE.LineBasicMaterial({ color: 0x5d6f82, transparent: true, opacity: 0.75 }); return vedMatJ; }
S._metGeoVarrer = function () {
var r = metGeo.rodada;
Object.keys(metGeo.mapa).forEach(function (id) { var e = metGeo.mapa[id]; if (e.usado !== r) { metGeoDescartar(e); delete metGeo.mapa[id]; } });
metGeo.rodada = r + 1;
};
S._metGeoEstado = function (ligar) { if (ligar != null) metGeo.ligado = !!ligar; return { pecas: Object.keys(metGeo.mapa).length, rodada: metGeo.rodada, feitas: metGeo.feitas, ligado: metGeo.ligado }; };
S._b2Malhas = function (c, vz, mat, addMesh) {
var A = window.BimArq; if (!A || !c || !c.b2) return null;
var me = null;
if (c.tipo === 'vedacao' && c.metal) {
if (!window.BimMetal) return null;
var vd = c.vedacao || {}, mV = vedMat(vd), tV = vd.desenho || c.ifc;
var chV = JSON.stringify([c.metal, c.cx, c.cy, c.cz, c.rotY, vd.modulo || 0]), enV = metGeo.mapa[c.id];
if (!enV || enV.chave !== chV || !metGeo.ligado) {
if (enV) metGeoDescartar(enV);
enV = metGeo.mapa[c.id] = { chave: chV, geos: [] };
BimMetal.solidos(c).forEach(function (sd) { if (sd.poli.length >= 3) { var gV = b2Geo(sd.poli, sd.furos, sd.z0, sd.z1, sd.ponto); gV.userData.metGeo = true; enV.geos.push(gV); metGeo.feitas++; } });
var jV = window.AcoVedacao && AcoVedacao.juntas ? AcoVedacao.juntas(c) : [];
if (jV.length) {
var pJ = []; jV.forEach(function (s) { pJ.push(s[0], s[1], s[2], s[3], s[4], s[5]); });
var gJ = new THREE.BufferGeometry(); gJ.setAttribute('position', new THREE.Float32BufferAttribute(pJ, 3)); gJ.userData.metGeo = true; enV.juntas = gJ;
}
}
enV.usado = metGeo.rodada;
enV.geos.forEach(function (gV, iV) {
var mesh = new THREE.Mesh(gV, mV);
if (vd.acimaSempre) mesh.userData.acimaSempre = true;
mesh.userData.vedacao = vd.papel || 'vedacao';
if (iV === 0 && enV.juntas) { var lsJ = new THREE.LineSegments(enV.juntas, vedMatJunta()); lsJ.raycast = function () {}; lsJ.userData.juntaTelha = true; mesh.add(lsJ); }
addMesh(mesh, c.id, tV, mV);
});
var mdV = c.medidas || {};
return { qto: { comprimento: vd.comprimento != null ? vd.comprimento : mdV.comprimento, area: vd.area != null ? vd.area : mdV.area, volume: mdV.volume, contagem: 1, massa: c.massa } };
}
if (c.tipo === 'metal' && c.metal) {
if (!window.BimMetal) return null;
var mM = c.acab && window.BimMetalAcab ? b2MatAcab(c.acab, c.metal.aco) : b2Mat(c.metal.kind === 'parafuso' ? 'parafuso' : 'aco');
var chM = JSON.stringify([c.metal, c.cx, c.cy, c.cz, c.rotY]), enM = metGeo.mapa[c.id];
if (!enM || enM.chave !== chM || !metGeo.ligado) {
if (enM) metGeoDescartar(enM);
enM = metGeo.mapa[c.id] = { chave: chM, geos: [] };
BimMetal.solidos(c).forEach(function (sd) { if (sd.poli.length >= 3) { var gM = b2Geo(sd.poli, sd.furos, sd.z0, sd.z1, sd.ponto); gM.userData.metGeo = true; enM.geos.push(gM); metGeo.feitas++; } });
}
enM.usado = metGeo.rodada;
enM.geos.forEach(function (gM) { addMesh(new THREE.Mesh(gM, mM), c.id, c.ifc, mM); });
var mdM = c.medidas || {};
return { qto: { comprimento: mdM.comprimento, area: mdM.area, volume: mdM.volume, contagem: 1, massa: c.massa } };
}
if (c.tipo === 'parede') {
var r = A.pecasParede(c, vz ? vz.aceitos : []);
if (!r.pecas.length) return null;
r.pecas.forEach(function (pc) { var m = new THREE.Mesh(b2Geo(pc.pts, null, pc.y0, pc.ytopo, b2Plano), mat); addMesh(m, c.id, c.ifc, mat); });
me = BimEdit.medidasDe(c, vz ? vz.areaVaos : 0);
return { qto: { comprimento: me.comprimento, area: me.area, volume: me.volume, contagem: 1, areaVaos: vz ? vz.areaVaos : 0, areaFora: me.areaFora, areaDentro: me.areaDentro } };
}
if (c.tipo === 'laje' && c.contorno) {
var C = window.BimCurva && BimCurva.temArco(c.contorno) ? BimCurva.pontosContorno(c.contorno) : c.contorno.map(function (p) { return [p.x, p.z]; }), F = (c.furos || []).map(function (f) { return f.pts.map(function (p) { return [p.x, p.z]; }); });
addMesh(new THREE.Mesh(b2Geo(C, F, c.cy - c.altura / 2, c.cy + c.altura / 2, b2Plano), mat), c.id, c.ifc, mat);
return { qto: { comprimento: c.perimetro, area: c.area, volume: c.volume, contagem: 1 } };
}
if ((c.tipo === 'pilar' || c.tipo === 'viga') && c.perfil) {
var s = A.secao(c.perfil); if (!s.ok) return null;
var mp = c.acab && window.BimMetalAcab && BimMetalAcab.ehAcoArq(c) ? b2MatAcab(c.acab, BimMetalAcab.acoDe(c)) : (c.material === 'aco' ? b2Mat('aco') : (c.material === 'madeira' ? (c.madeiraMat && FAM_PBR[c.madeiraMat] ? famMat(c.madeiraMat) : b2Mat('madeira')) : mat));
var co = Math.cos(c.rotY), si = Math.sin(c.rotY), g;
var m9 = window.BimEstrut ? (c.tipo === 'pilar' ? BimEstrut.malhaPilar(c, s) : BimEstrut.malhaViga(c, s)) : null;
var vc9 = c.tipo === 'viga' && c.arco && window.BimCurva ? BimCurva.vigaPlanta(c) : null;
if (vc9) g = b2Geo(vc9.pts, null, vc9.y0, vc9.y1, b2Plano);
else if (m9) g = b2Geo(s.contorno, s.furos, m9.z0, m9.z1, m9.mapa);
else if (c.tipo === 'pilar') {
g = b2Geo(s.contorno, s.furos, c.cy - c.altura / 2, c.cy + c.altura / 2, function (a, b, z) { return [c.cx + a * co + b * si, z, c.cz - a * si + b * co]; });
} else {
g = b2Geo(s.contorno, s.furos, -c.comprimento / 2 + (+c.recuoIni || 0), c.comprimento / 2 - (+c.recuoFim || 0), function (a, b, u) { return [c.cx + u * co + a * si, c.cy + b, c.cz - u * si + a * co]; });
}
addMesh(new THREE.Mesh(g, mp), c.id, c.ifc, mp);
me = BimEdit.medidasDe(c, 0);
return { qto: { comprimento: me.comprimento, area: me.areaForma, volume: me.volume, contagem: 1, massa: c.massa } };
}
if (c.tipo === 'escada' && c.escada && c.escada.lances) {
var me2 = b2Mat('escada');
c.escada.lances.forEach(function (l) {
var dx = Math.cos(l.ang), dz = Math.sin(l.ang), rx = -dz, rz = dx;
var g2 = b2Geo(l.perfil.map(function (q) { return [q.u, q.y]; }), null, -l.largura / 2, l.largura / 2,
function (u, y, w) { return [l.x + u * dx + w * rx, l.y + y, l.z + u * dz + w * rz]; });
addMesh(new THREE.Mesh(g2, me2), c.id, c.ifc, me2);
});
if (c.escada.patamar) addMesh(new THREE.Mesh(b2Geo(c.escada.patamar.pts.map(function (p) { return [p.x, p.z]; }), null, c.escada.patamar.y0, c.escada.patamar.y1, b2Plano), me2), c.id, c.ifc, me2);
var md = c.medidas || {};
return { qto: { comprimento: md.comprimento, area: md.area, volume: md.volume, contagem: 1 } };
}
if (c.tipo === 'rampa' && c.rampa && c.rampa.lances) {
var mR = b2Mat('escada');
c.rampa.lances.forEach(function (l) {
var dx = Math.cos(l.ang), dz = Math.sin(l.ang), rx = -dz, rz = dx;
addMesh(new THREE.Mesh(b2Geo(l.perfil.map(function (q) { return [q.u, q.y]; }), null, -l.largura / 2, l.largura / 2,
function (u, y, w) { return [l.x + u * dx + w * rx, l.y + y, l.z + u * dz + w * rz]; }), mR), c.id, c.ifc, mR);
});
(c.rampa.patamares || []).forEach(function (pt) { addMesh(new THREE.Mesh(b2Geo(pt.pts.map(function (q) { return [q.x, q.z]; }), null, pt.y0, pt.y1, b2Plano), mR), c.id, c.ifc, mR); });
var mdR = c.medidas || {};
return { qto: { comprimento: mdR.comprimento, area: mdR.area, volume: mdR.volume, contagem: 1 } };
}
if (c.tipo === 'guarda' && c.guarda && c.guarda.montantes) {
var ma = b2Mat('aco'), par = c.guarda.par || {}, sm = par.secMontante || 0.04;
c.guarda.montantes.forEach(function (q) {
var mm = new THREE.Mesh(new THREE.BoxGeometry(sm, par.altura, sm), ma);
mm.position.set(q.x, q.y + par.altura / 2, q.z); addMesh(mm, c.id, c.ifc, ma);
});
(c.guarda.corrimao || []).forEach(function (sg) { addMesh(b2Barra(sg.a, sg.b, par.secCorrimao || 0.05, ma), c.id, c.ifc, ma); });
(c.guarda.corrimaos || []).forEach(function (sg) { addMesh(b2Barra(sg.a, sg.b, 0.04, ma), c.id, c.ifc, ma); });
var mg = c.medidas || {};
return { qto: { comprimento: mg.comprimento, area: mg.area, volume: 0, contagem: 1 } };
}
return null;
};
function b2Bolha(txt) {
var cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
var g = cv.getContext('2d');
g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
g.strokeStyle = '#2e6f9e'; g.lineWidth = 7; g.stroke();
g.fillStyle = '#1a2b3c'; g.font = 'bold ' + (String(txt).length > 2 ? 40 : 58) + 'px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
g.fillText(String(txt), 64, 68);
var tex = texSRGB(new THREE.CanvasTexture(cv)); tex.minFilter = THREE.LinearFilter;
var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
sp.userData._sc = 0.035; sp.renderOrder = 999; return sp;
}
S._b2Limpar3d = function () {
(edit.b2objs || []).forEach(function (o) { scene.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material && o.material.map) { o.material.map.dispose(); o.material.dispose(); } });
edit.b2objs = [];
};
S._b2Eixos = function (st) {
var y = (edit.b2 && edit.b2.nivel && isFinite(+edit.b2.nivel.elevacao)) ? +edit.b2.nivel.elevacao : edit.base;
(st.eixos || []).forEach(function (ex) {
var a = new THREE.Vector3(ex.x0, y + 0.01, ex.z0), b = new THREE.Vector3(ex.x1, y + 0.01, ex.z1), d = b.clone().sub(a).normalize();
var ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), b2Mat('eixo'));
ln.computeLineDistances(); ln.renderOrder = 997; ln.userData.eixoId = ex.id;
scene.add(ln); edit.b2objs.push(ln);
[a.clone().addScaledVector(d, -0.45), b.clone().addScaledVector(d, 0.45)].forEach(function (pp) {
var sp = b2Bolha(ex.nome); sp.position.copy(pp); sp.userData.eixoId = ex.id;
scene.add(sp); rescaleObj(sp); edit.b2objs.push(sp);
});
});
};
S._tickExtra.push(function () { for (var i = 0; i < edit.b2objs.length; i++) if (edit.b2objs[i].isSprite) rescaleObj(edit.b2objs[i]); });
S._b2Cancelar = function () {
if (edit.b2linha) { scene.remove(edit.b2linha); edit.b2linha.geometry.dispose(); edit.b2linha = null; }
edit.b2pts = null; edit.b2moverEixo = null;
};
function b2Linha() {
if (edit.b2linha) { scene.remove(edit.b2linha); edit.b2linha.geometry.dispose(); edit.b2linha = null; }
if (!edit.b2pts || edit.b2pts.length < 2) return;
edit.b2linha = new THREE.Line(new THREE.BufferGeometry().setFromPoints(edit.b2pts), b2Mat('poli'));
edit.b2linha.renderOrder = 998; scene.add(edit.b2linha);
}
S._b2CfgParede = function () {
var b = edit.b2 || {};
return { tipoParede: b.tipoParede || null, anexarTopo: !!b.anexarTopo, unir: b.unir !== false, juntaCanto: b.juntaCanto === 'esquadria' ? 'esquadria' : null, nivelId: b.nivel ? b.nivel.id : null,
restricoes: b2Restr('parede'), niveis: b.niveis || null,
linhaLoc: b.linhaLoc || null };
};
function b2Restr(sub) {
var b = edit.b2 || {}, r = (b.restricoes && b.restricoes[sub]) || null;
var dP = r && b.nivel && window.BimPlano && BimPlano.deslocDoNivel ? BimPlano.deslocDoNivel(b.nivel) : 0;
if (dP) { r = JSON.parse(JSON.stringify(r)); r.deslocBase = Math.round(((+r.deslocBase || 0) + dP) * 1e6) / 1e6; }
return r;
}
var p1bVisto = 0;
S._tickExtra.push(function () {
var t = Date.now(); if (t - p1bVisto < 1200) return; p1bVisto = t;
var st = edit.estado; if (!st || !st.restricoes || !st.restricoes.n || !edit.ops.length || !window.BimArq || !BimEdit.niveisAtuais) return;
var L = BimEdit.niveisAtuais(); if (!L) return;
if (BimArq.assinaturaNiveis(L) !== st.niveisAssinatura) { editRebuild(); if (window.BimArqUI && BimArqUI.ativo()) BimArqUI.enviar(); }
});
S._b2Config = function (cfg) {
if (cfg === null) { edit.b2 = null; S._b2Cancelar(); return null; }
var b = edit.b2 || (edit.b2 = {});
Object.keys(cfg || {}).forEach(function (k) { b[k] = cfg[k]; });
if (cfg && cfg.nivel && isFinite(+cfg.nivel.elevacao)) {
edit.base = +cfg.nivel.elevacao;
planoBase();
if (+cfg.nivel.peDireito > 0) {
edit.alt = Math.min(8, Math.max(0.3, +cfg.nivel.peDireito));
var iA = editPanel.querySelector('input[data-ed="alt"]'); if (iA) iA.value = String(edit.alt);
}
}
if (b.tipoParede && b.tipoParede.espessura > 0 && S._setEspEditor) S._setEspEditor(b.tipoParede.espessura, b.tipoParede.rotulo);
return JSON.parse(JSON.stringify(b));
};
S._b2Hint = function (sub) {
var H = {
eixo: 'Eixo: clique as duas pontas (Shift trava na horizontal/vertical). O nome sai sozinho: número na vertical, letra na horizontal.',
laje: (edit.b2 && edit.b2.lajeModo === 'retangulo') ? 'Laje: clique dois cantos opostos.' : 'Laje por contorno: clique os cantos; feche clicando no primeiro ponto ou com Enter. Esc cancela.',
furo: 'Furo na laje: clique os cantos do furo dentro da laje; feche no primeiro ponto ou com Enter.',
escada: 'Escada: clique o meio do primeiro degrau e depois a direção da subida. Degraus pelas regras do tipo; os guarda-corpos nascem junto.',
guarda: 'Guarda-corpo: clique os pontos do caminho e Enter para terminar — ou clique numa escada para seguir a lateral dela.',
pilar: (edit.b2 && edit.b2.perfilPilar) ? 'Pilar por perfil: clique onde ele nasce.' : '',
viga: (edit.b2 && edit.b2.perfilViga) ? 'Viga por perfil: clique o início e o fim (o topo fica no topo da parede).' : '',
forro: p2bForroAuto() ? 'Forro automático: clique DENTRO da sala fechada por paredes.' : 'Forro por contorno: clique os cantos; feche no primeiro ponto ou com Enter. Esc cancela.',
rampa: 'Rampa: clique o meio do pé da rampa e depois a direção da subida. Segmentos e patamares pela NBR 9050 (inclinação × desnível); guarda-corpo com corrimão duplo nasce junto.',
trelica: 'Treliça: clique os dois apoios. Banzos, montantes e diagonais viram vigas e pilares de madeira (Propriedades: tipo, altura, painéis, seções).'
};
return H[sub] || '';
};
function b2Num(v) { return String(Math.round(v * 100) / 100).replace('.', ','); }
function b2Fechar() {
var sub = edit.sub, pts = edit.b2pts || [], b = edit.b2 || {}, A = window.BimArq;
if (!A) return false;
if ((sub === 'laje' || sub === 'furo') && pts.length >= 3) {
var P = pts.map(function (q) { return { x: q.x, z: q.z }; });
if (sub === 'laje') {
var tl = b.tipoLaje || { id: 'macica-12', rotulo: 'Laje maciça 12 cm', espessura: 0.12 };
var v0 = A.validarPoligono(P); if (!v0.ok) { S._hint(v0.motivo); return false; }
var cl = A.lajeContorno(P, { topo: edit.base, espessura: tl.espessura, tipoLaje: tl, nivelId: b.nivel ? b.nivel.id : null, restricoes: b2Restr('laje'), niveis: b.niveis || null });
if (!cl) { S._hint('Contorno inválido para a laje.'); return false; }
editTirarProv();
editOp({ op: 'criar', id: 'e' + (++edit.seq), caixa: A.paraOp(cl) });
S._hint('Laje criada: ' + b2Num(cl.area) + ' m², ' + b2Num(cl.volume) + ' m³ (' + tl.rotulo + '). Clique o próximo contorno, ou Esc.');
} else {
var alvo = ((edit.estado && edit.estado.caixas) || []).filter(function (c) {
return c.tipo === 'laje' && c.contorno && A.validarFuro(c.contorno, P, c.furos).ok;
}).sort(function (x, y) { return Math.abs(x.cy + x.altura / 2 - edit.base) - Math.abs(y.cy + y.altura / 2 - edit.base); })[0];
if (!alvo) {
var qq = ((edit.estado && edit.estado.caixas) || []).filter(function (c) { return c.tipo === 'laje' && c.contorno; })[0];
S._hint(qq ? A.validarFuro(qq.contorno, P, qq.furos).motivo : 'O furo vai numa laje por contorno criada aqui.'); return false;
}
editTirarProv();
editOp({ op: 'furo', id: alvo.id, furo: A.validarFuro(alvo.contorno, P, alvo.furos).pts.map(function (q) { return { x: Math.round(q[0] * 1e6) / 1e6, z: Math.round(q[1] * 1e6) / 1e6 }; }) });
S._hint('Furo aberto na laje (a área e o volume já descontam).');
}
marcarFechamento(); return true;
}
if (sub === 'forro' && pts.length >= 3) return p2bForroCriar({ contorno: pts.map(function (q) { return { x: q.x, z: q.z }; }) });
if (sub === 'guarda' && pts.length >= 2) {
var g = A.guarda(pts.map(function (q) { return { x: q.x, y: q.y, z: q.z }; }), b.guarda || {});
if (!g) { S._hint('Caminho inválido para o guarda-corpo.'); return false; }
editTirarProv();
editOp({ op: 'criar', id: 'e' + (++edit.seq), caixa: A.paraOp(g) });
S._hint('Guarda-corpo: ' + b2Num(g.medidas.comprimento) + ' m, ' + g.medidas.montantes + ' montantes.');
marcarFechamento(); return true;
}
return false;
}
S._b2FecharExt = b2Fechar;
window.addEventListener('keydown', function (ev) {
if (ev.key !== 'Enter' || !edit.on || !edit.b2 || !edit.b2pts || !edit.b2pts.length) return;
var t3 = ev.target || {}; if (/^(INPUT|TEXTAREA|SELECT)$/.test(t3.tagName || '') || t3.isContentEditable) return;
if (b2Fechar()) { ev.preventDefault(); ev.stopPropagation(); }
}, true);
function b2EixoPerto(p) {
var melhor = null, dm = 0.5;
((edit.estado && edit.estado.eixos) || []).forEach(function (ex) {
var dx = ex.x1 - ex.x0, dz = ex.z1 - ex.z0, L2 = dx * dx + dz * dz, t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - ex.x0) * dx + (p.z - ex.z0) * dz) / L2)) : 0;
var d = Math.sqrt(Math.pow(ex.x0 + t * dx - p.x, 2) + Math.pow(ex.z0 + t * dz - p.z, 2));
if (d < dm) { dm = d; melhor = ex; }
});
return melhor;
}
function b2Imantar(p, e) {
if (!p || !e || !isFinite(e.clientX)) return;
var ws = ((edit.estado && edit.estado.caixas) || []).filter(function (c) { return c.tipo === 'parede' && c.b2; });
var melhor = null, dm = 12;
ws.forEach(function (c) {
BimEdit.eixoDaCaixa(c).forEach(function (q) {
var s = S._telaDe(q.x, edit.base, q.z), d = Math.sqrt(Math.pow(s.x - e.clientX, 2) + Math.pow(s.y - e.clientY, 2));
if (!s.atras && d < dm) { dm = d; melhor = q; }
});
});
if (!melhor) {
dm = 8;
ws.forEach(function (c) {
var pp = BimEdit.eixoDaCaixa(c), dx = pp[1].x - pp[0].x, dz = pp[1].z - pp[0].z, L2 = dx * dx + dz * dz; if (!(L2 > 0)) return;
var t = Math.max(0, Math.min(1, ((p.x - pp[0].x) * dx + (p.z - pp[0].z) * dz) / L2)), q = { x: pp[0].x + t * dx, z: pp[0].z + t * dz };
var s = S._telaDe(q.x, edit.base, q.z), d = Math.sqrt(Math.pow(s.x - e.clientX, 2) + Math.pow(s.y - e.clientY, 2));
if (!s.atras && d < dm) { dm = d; melhor = q; }
});
}
if (melhor) { p.x = melhor.x; p.z = melhor.z; }
}
S._b2Clique = function (sub, e, hit, p) {
var A = window.BimArq, b = edit.b2 || {};
if (!A) return false;
if (sub === 'parede') { b2Imantar(p, e); return false; }
if (sub === 'mover') {
if (edit.b2moverEixo) {
if (!p) return true;
editOp({ op: 'mover', id: edit.b2moverEixo, cx: p.x, cz: p.z }); edit.b2moverEixo = null;
S._hint('Eixo movido. Clique noutro elemento, ou Esc.'); marcarFechamento(); return true;
}
if (edit.moverId || !p) return false;
if (hit && _ultimosHits[0] && _ultimosHits[0].object.userData.mid === 'edit') return false;
var ex = b2EixoPerto(p); if (!ex) return false;
edit.b2moverEixo = ex.id; S._hint('Eixo ' + ex.nome + ' escolhido: clique o novo lugar do meio dele.'); return true;
}
if (!p) return false;
if (sub === 'eixo' || sub === 'escada' || sub === 'rampa' || sub === 'trelica' || (sub === 'viga' && b.perfilViga)) {
if (!edit.p1) { if (sub === 'viga') edit._cotaP1 = edit._cotaAgora; edit.p1 = p.clone(); edit.prov = pontoMarca(p); scene.add(edit.prov); rescaleObj(edit.prov); S._hint(sub === 'escada' || sub === 'rampa' ? 'Agora clique a DIREÇÃO da subida.' : 'Agora clique a outra ponta.'); return true; }
var p2 = editAjustarPonto(p, e), ini = edit.p1.clone();
editTirarProv();
if (sub === 'eixo') {
var nome = A.proximoNomeEixo((edit.estado && edit.estado.eixos) || [], [ini.x, ini.z], [p2.x, p2.z]);
var ei = A.eixo([ini.x, ini.z], [p2.x, p2.z], nome);
if (!ei) { S._hint('Eixo curto demais (mínimo 30 cm).'); return true; }
editOp({ op: 'eixo', id: 'e' + (++edit.seq), eixo: ei });
S._hint('Eixo ' + ei.nome + ' criado. Clique o próximo, ou Esc. O nome se troca em Propriedades.');
} else if (sub === 'escada') {
var ce = b.escada || {}, ang = Math.atan2(p2.z - ini.z, p2.x - ini.x);
if (Math.sqrt(Math.pow(p2.x - ini.x, 2) + Math.pow(p2.z - ini.z, 2)) < 0.05) { S._hint('Clique a direção um pouco mais longe do primeiro ponto.'); return true; }
var H = +ce.desnivel > 0 ? +ce.desnivel : edit.alt;
var pEsc = { emax: ce.emax, pmin: ce.pmin, piso: ce.piso, tipoId: ce.tipoId, larguraMin: ce.larguraMin };
var esc = A.escada({ x: ini.x, z: ini.z, ang: ang, base: edit.base, desnivel: H, largura: ce.largura || 1.0, forma: ce.forma || 'reta', giro: ce.giro || 'direita', espessura: ce.espessura || 0.12,
emax: pEsc.emax, pmin: pEsc.pmin, piso: pEsc.piso, tipoId: pEsc.tipoId, larguraMin: pEsc.larguraMin, guarda: ce.guarda, nivelId: b.nivel ? b.nivel.id : null, restricoes: b2Restr('escada'), niveis: b.niveis || null,
regra: ce.regra, vao: ce.vao, comecaEspelho: ce.comecaEspelho, terminaEspelho: ce.terminaEspelho, revPiso: ce.revPiso, revEspelho: ce.revEspelho, matPiso: ce.matPiso, matEspelho: ce.matEspelho });
if (!esc) { var cc = A.escadaCalc(H, { emax: pEsc.emax, pmin: pEsc.pmin, piso: pEsc.piso, tipoId: pEsc.tipoId, larguraMin: pEsc.larguraMin, regra: ce.regra }); S._hint(cc.ok ? 'Escada em L ou em U precisa de pelo menos 4 degraus.' : cc.motivo); return true; }
var lote = A.opsEscada(esc, function () { return 'e' + (++edit.seq); }, { altura: b.guarda && b.guarda.altura, espac: b.guarda && b.guarda.espac });
editOp(lote);
var k = esc.escada.calc, nG = lote.ops.length - 1;
S._hint('Escada: ' + k.n + ' espelhos de ' + b2Num(k.e * 100) + ' cm, piso de ' + b2Num(k.p * 100) + ' cm (regras do tipo; 2e + p = ' + b2Num(k.blondel * 100) + ' cm)' +
(nG ? ', com ' + nG + ' guarda-corpo' + (nG > 1 ? 's' : '') : ', sem guarda-corpo') + '.' + (k.avisos.length ? ' ' + k.avisos.join(' ') : ''));
} else if ((sub === 'rampa' || sub === 'trelica') && window.BimEstrutUI) {
var r9 = BimEstrutUI.criar(sub, ini, p2, { base: edit.base, alt: edit.alt, nivel: b.nivel || null, novoId: function () { return 'e' + (++edit.seq); } });
if (!r9.ok) { S._hint(r9.motivo); return true; }
editOp(r9.op); S._hint(r9.resumo);
} else {
var cotaV = edit._topoVista != null ? edit._topoVista : (edit._cotaP1 != null ? edit._cotaP1 : edit._cotaAgora), topoCota = cotaV != null; edit._cotaP1 = null;
var cv = A.vigaPerfil([ini.x, ini.z], [p2.x, p2.z], { perfil: b.perfilViga, material: b.materialViga || 'concreto', topo: topoCota ? cotaV : edit.base + edit.alt, nivelId: b.nivel ? b.nivel.id : null, restricoes: topoCota ? null : b2Restr('viga'), niveis: b.niveis || null });
if (!cv) { S._hint('Viga: pontos muito próximos ou perfil inválido.'); return true; }
editOp({ op: 'criar', id: 'e' + (++edit.seq), caixa: A.paraOp(cv) });
S._hint('Viga ' + cv.perfilRotulo + ' criada (' + b2Num(cv.comprimento) + ' m). Clique o início da próxima, ou Esc.');
}
marcarFechamento(); return true;
}
if (sub === 'pilar' && b.perfilPilar) {
var cp = A.pilarPerfil([p.x, p.z], { perfil: b.perfilPilar, material: b.materialPilar || 'concreto', base: edit.base, altura: edit.alt, rotY: (+b.giroPilar || 0) * Math.PI / 180, nivelId: b.nivel ? b.nivel.id : null, restricoes: b2Restr('pilar'), niveis: b.niveis || null });
if (!cp) { S._hint('Perfil do pilar inválido — confira as medidas em Propriedades.'); return true; }
editOp({ op: 'criar', id: 'e' + (++edit.seq), caixa: A.paraOp(cp) });
S._hint('Pilar ' + cp.perfilRotulo + ' criado. Clique para outro, ou Esc.'); marcarFechamento(); return true;
}
if (sub === 'forro' && p2bForroAuto()) { p2bForroCriar({ ponto: { x: p.x, z: p.z } }); return true; }
if (sub === 'laje' || sub === 'furo' || sub === 'guarda' || sub === 'forro') {
if (sub === 'guarda' && !(edit.b2pts && edit.b2pts.length) && hit && _ultimosHits[0] && _ultimosHits[0].object.userData.mid === 'edit' && _ultimosHits[0].object.userData.tipo === 'IFCSTAIR') {
var eid2 = _ultimosHits[0].object.userData.expressID, ec = ((edit.estado && edit.estado.caixas) || []).filter(function (c) { return c.id === eid2; })[0];
var cams = ec && ec.escada && ec.escada.caminhos, lado = (b.guarda && b.guarda.lado) || '';
var cam = cams ? (cams[lado] || cams.direita || cams.externo) : null;
var gg = cam ? A.guarda(cam, b.guarda || {}) : null;
if (!gg) { S._hint('Não consegui seguir a lateral desta escada.'); return true; }
editOp({ op: 'criar', id: 'e' + (++edit.seq), caixa: A.paraOp(gg) });
S._hint('Guarda-corpo na escada: ' + b2Num(gg.medidas.comprimento) + ' m, ' + gg.medidas.montantes + ' montantes.'); marcarFechamento(); return true;
}
var q = (edit.b2pts && edit.b2pts.length) ? editAjustarPonto(p, e) : p.clone();
if (sub !== 'guarda') q.y = edit.base;
if (!edit.b2pts) edit.b2pts = [];
if (sub !== 'guarda' && sub !== 'forro' && b.lajeModo === 'retangulo' && edit.b2pts.length === 1) {
var a0 = edit.b2pts[0];
edit.b2pts = [a0, new THREE.Vector3(q.x, a0.y, a0.z), new THREE.Vector3(q.x, a0.y, q.z), new THREE.Vector3(a0.x, a0.y, q.z)];
b2Fechar(); return true;
}
if (sub !== 'guarda' && edit.b2pts.length >= 3 && e && isFinite(e.clientX)) {
var t0 = S._telaDe(edit.b2pts[0].x, edit.b2pts[0].y, edit.b2pts[0].z);
if (Math.abs(t0.x - e.clientX) <= 12 && Math.abs(t0.y - e.clientY) <= 12) { b2Fechar(); return true; }
}
edit.b2pts.push(q);
if (edit.prov) { limparMarca(edit.prov); edit.prov = null; }
edit.p1 = q.clone(); edit.prov = pontoMarca(q); scene.add(edit.prov); rescaleObj(edit.prov);
b2Linha();
var nP = edit.b2pts.length;
S._hint(sub === 'guarda' ? nP + ' ponto(s) — Enter termina o guarda-corpo.' : nP + ' ponto(s)' + (nP >= 3 ? ' — clique no primeiro ponto ou Enter para fechar.' : ' — siga clicando os cantos.'));
return true;
}
return false;
};
var pmPrevia3d = null;
S._planta2d = {
traco: function () {
return { on: !!edit.on, sub: edit.sub || null, base: edit.base, alt: edit.alt, esp: edit.esp,
p1: edit.p1 ? { x: edit.p1.x, z: edit.p1.z } : null,
pts: (edit.b2pts || []).map(function (q) { return { x: q.x, z: q.z }; }),
vol: ((edit.vol && edit.vol.pts) || []).map(function (q) { return { x: q.ponto.x, z: q.ponto.z }; }),
chain: !!edit.chain, famSel: edit.famSel ? JSON.parse(JSON.stringify(edit.famSel)) : null, moverId: edit.moverId || null, b2: !!edit.b2, lajeModo: (edit.b2 && edit.b2.lajeModo) || null,
dica: S._hintUltimo || '' };
},
clique: function (p, o) {
if (!edit.on || !edit.sub || !p || !isFinite(p.x) || !isFinite(p.z)) return false;
o = o || {};
var m = o.alvoId != null ? S.meshPorUid['edit:' + o.alvoId] : null;
var hitF = m ? { object: m, point: new THREE.Vector3(p.x, edit.base + 0.5, p.z), distance: 1 } : null;
var ant = _ultimosHits; _ultimosHits = hitF ? [hitF] : [];
var topoAnt = edit._topoVista; edit._topoVista = (o.topo != null && isFinite(+o.topo)) ? +o.topo : null;
try { editClique({ clientX: NaN, clientY: NaN, shiftKey: !!o.shift, ctrlKey: !!o.ctrl, metaKey: false, _semAjuste: true, _planta: true }, hitF, new THREE.Vector3(p.x, edit.base, p.z)); }
finally { _ultimosHits = ant; edit._topoVista = topoAnt; }
return true;
},
cancelar: function () { editTirarProv(); if (pmPrevia3d) this.previa3d(null); return true; },
desarmar: function () { if (!edit.sub) return false; if (pmPrevia3d) this.previa3d(null); setEditSub(edit.sub); return true; },
fechar: function () { return b2Fechar(); },
contorno: function (pts) {
if (!edit.on || !edit.sub || !pts || pts.length < 2) return false;
editTirarProv();
edit.b2pts = pts.map(function (q) { return new THREE.Vector3(q.x, edit.base, q.z); });
var ok = b2Fechar();
if (!ok) editTirarProv();
return ok;
},
criarSegmentos: function (sub, segs) {
var A = window.BimArq, b = edit.b2 || {}, ops = [], eixosNovos = ((edit.estado && edit.estado.eixos) || []).slice();
(segs || []).forEach(function (s) {
if (!s || !s.a || !s.b || !isFinite(s.a.x) || !isFinite(s.a.z) || !isFinite(s.b.x) || !isFinite(s.b.z)) return;
if (sub === 'parede') {
var cx = BimEdit.parede({ x: s.a.x, z: s.a.z }, { x: s.b.x, z: s.b.z }, edit.esp, edit.alt, edit.base); if (!cx) return;
if (edit.b2 && A) A.marcarParede(cx, S._b2CfgParede());
if (s.tipo === 'arco' && s.m && isFinite(s.m.x) && isFinite(s.m.z)) cx.arco = { m: { x: s.m.x, z: s.m.z } };
ops.push({ op: 'criar', id: 'e' + (++edit.seq), caixa: cx });
} else if (sub === 'viga') {
var cv = (b.perfilViga && A) ? A.vigaPerfil([s.a.x, s.a.z], [s.b.x, s.b.z], { perfil: b.perfilViga, material: b.materialViga || 'concreto', topo: edit.base + edit.alt, nivelId: b.nivel ? b.nivel.id : null, restricoes: b2Restr('viga'), niveis: b.niveis || null }) : null;
var cxV = cv ? A.paraOp(cv) : BimEdit.viga({ x: s.a.x, z: s.a.z }, { x: s.b.x, z: s.b.z }, edit.vigaB, edit.vigaH, edit.base + edit.alt);
if (cxV) ops.push({ op: 'criar', id: 'e' + (++edit.seq), caixa: cxV });
} else if (sub === 'eixo' && A) {
var nome = A.proximoNomeEixo(eixosNovos, [s.a.x, s.a.z], [s.b.x, s.b.z]), ei = A.eixo([s.a.x, s.a.z], [s.b.x, s.b.z], nome);
if (ei) { eixosNovos.push(ei); ops.push({ op: 'eixo', id: 'e' + (++edit.seq), eixo: ei }); }
}
});
if (!ops.length) return { ok: false, n: 0 };
editTirarProv();
editOp(ops.length === 1 ? ops[0] : { op: 'lote', id: 'e' + (++edit.seq), origem: 'desenho', ops: ops });
marcarFechamento();
return { ok: true, n: ops.length, ids: ops.map(function (x) { return x.id; }) };
},
encadear: function (v) { if (v != null) edit.chain = !!v; return !!edit.chain; },
anotarTexto: function (tx) { var i = editPanel.querySelector('[data-ed="txt"]'); if (i) i.value = String(tx == null ? '' : tx).slice(0, 200); return !!i; },
famInst: function (o) {
if (!edit.famSel || !o) return null;
edit.famSel.inst = edit.famSel.inst || {};
Object.keys(o).forEach(function (k) { edit.famSel.inst[k] = o[k]; });
return JSON.parse(JSON.stringify(edit.famSel.inst));
},
previa3d: function (L) {
if (pmPrevia3d) { scene.remove(pmPrevia3d); pmPrevia3d.traverse(function (o2) { if (o2.geometry) o2.geometry.dispose(); }); pmPrevia3d = null; }
if (!L || !L.length) return 0;
if (!edit._linhaMat) edit._linhaMat = new THREE.LineBasicMaterial({ color: 0x2fbf71, depthTest: false });
var g = new THREE.Group(); g.name = 'planta-forma-previa';
L.forEach(function (pts) {
if (!pts || pts.length < 2) return;
var ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(function (q) { return new THREE.Vector3(q.x, edit.base + 0.02, q.z); })), edit._linhaMat);
ln.renderOrder = 999; ln.frustumCulled = false; g.add(ln);
});
scene.add(g); pmPrevia3d = g;
return g.children.length;
}
};
var p3d = { parse: null, det: null };
var p3dPanel = document.createElement('div');
p3dPanel.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:6;display:none;flex-direction:column;gap:8px;background:var(--card-bg,#fff);border:1px solid var(--linha,#d3dce6);border-radius:12px;padding:14px 16px;color:var(--texto,#1a2b3c);font-size:12px;width:480px;max-width:94%;max-height:92%;overflow:auto;box-shadow:0 12px 34px rgba(0,0,0,.5)';
p3dPanel.classList.add('bim-flut');
p3dPanel.innerHTML =
'<div style="display:flex;justify-content:space-between;align-items:center"><b>' + (typeof Icones !== 'undefined' ? Icones.get('obra', 15) : '') + ' Planta 2D → 3D (DXF)</b><button class="btn sm" data-p3="fechar">' + (typeof Icones !== 'undefined' ? Icones.get('fechar', 15) : '') + '</button></div>' +
'<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
'<button class="btn sm primary" data-p3="abrir">' + (typeof Icones !== 'undefined' ? Icones.get('abrir', 15) : '') + ' Abrir .DXF</button>' +
'<label style="display:flex;gap:5px;align-items:center">Pé-direito <input data-p3="pd" class="inp" type="number" value="2.80" step="0.1" min="2" max="6" style="width:64px"> m</label>' +
'<label style="display:flex;gap:5px;align-items:center">Unidade <select data-p3="un" class="inp" style="width:76px"><option value="">auto</option><option value="0.001">mm</option><option value="0.01">cm</option><option value="1">m</option></select></label>' +
'<input type="file" data-p3="file"' + (ehToque() ? '' : ' accept=".dxf"') + ' style="display:none"></div>' +
'<div data-p3="info" style="font-size:11.5px;color:var(--texto-fraco,#5b6b7c)">Exporte a planta baixa do seu CAD em <b>DXF</b> (AutoCAD/QCAD/LibreCAD; DWG? salve-como DXF). O sistema propõe as paredes — você confirma.</div>' +
'<canvas data-p3="cv" width="448" height="300" style="background:#0b1a2b;border:1px solid var(--linha,#d3dce6);border-radius:8px;cursor:pointer;display:none"></canvas>' +
'<div data-p3="res" style="font-size:12px"></div>' +
'<button class="btn sm primary" data-p3="gerar" style="display:none">' + (typeof Icones !== 'undefined' ? Icones.get('obra', 15) : '') + ' Gerar 3D</button>' +
'<div style="font-size:11px;color:#b45309;line-height:1.35">' + (typeof Icones !== 'undefined' ? Icones.get('alerta', 15) : '') + ' Volumetria de ESTUDO (paredes por par de linhas paralelas de 6–40 cm) — clique numa parede verde do preview pra ligar/desligar. Portas, janelas e cobertura não entram nesta fase. Não substitui o projeto.</div>';
host.appendChild(p3dPanel);
S.p3dPanel = p3dPanel;
function toggleP3dPanel() { var abrir = p3dPanel.style.display === 'none' || !p3dPanel.style.display; fecharPaineis(null); p3dPanel.style.display = abrir ? 'flex' : 'none'; }
S._toggleP3d = toggleP3dPanel;
function p3dDesenhar() {
var cv = p3dPanel.querySelector('[data-p3="cv"]'); if (!cv || !p3d.parse) return;
cv.style.display = '';
var g = cv.getContext('2d'), ex = p3d.parse.extents;
g.fillStyle = '#0b1a2b'; g.fillRect(0, 0, cv.width, cv.height);
if (!ex) return;
var mrg = 14, sw = (cv.width - mrg * 2) / Math.max(1e-6, ex.x1 - ex.x0), sh = (cv.height - mrg * 2) / Math.max(1e-6, ex.y1 - ex.y0);
var sc = Math.min(sw, sh);
function px(x) { return mrg + (x - ex.x0) * sc; }
function py(y) { return cv.height - mrg - (y - ex.y0) * sc; }
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
res.innerHTML = '<b style="color:var(--verde,#15803d)">' + ligadas.length + ' parede(s) ligadas</b> (' + mTot.toFixed(1).replace('.', ',') + ' m lineares) · ' +
p3d.det.stats.segmentosSemPar + ' segmento(s) não formaram par (porta, mobiliário, cota — ou face de parede que o pareador não casou) · unidade: ' + (p3d.parse.unidade.origem === 'insunits' ? 'do arquivo' : p3d.parse.unidade.origem);
var dubias = p3d.det.paredes.filter(function (p) { return p.ligada === false; });
if (dubias.length) {
var nTrio = dubias.filter(function (p) { return p.viaTrio; }).length;
var nPil = dubias.filter(function (p) { return p.provavelPilar && !p.viaTrio; }).length;
var nOutro = dubias.length - nTrio - nPil;
var mot = [];
if (nTrio) mot.push(nTrio + ' com três linhas paralelas (pode ser cota, não parede)');
if (nPil) mot.push(nPil + ' com comprimento próximo da espessura (parece pilar, contaria em dobro)');
if (nOutro > 0) mot.push(nOutro + ' desligados por você');
res.innerHTML += '<br><span style="color:#b45309">⚠ ' + dubias.length + ' NÃO entram no 3D: ' + mot.join(' · ') + '.</span>';
}
if (!ligadas.length) {
bg.style.display = 'none';
res.innerHTML += p3d.det.paredes.length
? '<br><b style="color:#b45309">Nenhuma parede ligada</b> — clique nas do desenho para ligar ' +
'o que for parede de verdade. O 3D só nasce com pelo menos uma.'
: '<br><b style="color:#b45309">Nenhuma parede foi proposta</b> — não há o que clicar. ' +
'Confira a UNIDADE no seletor acima (envergadura errada joga toda espessura fora da faixa de ' +
'6–40 cm) e explode os blocos no CAD antes de exportar.';
return;
}
bg.style.display = ''; bg.textContent = '' + (typeof Icones !== 'undefined' ? Icones.get('obra', 15) : '') + ' Gerar 3D (' + ligadas.length + ' paredes)';
}
function p3dProcessar(texto, nome) {
if (typeof window === 'undefined' || !window.DXF || !window.Planta3D) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('obra', 15) : '') + ' Motores 2D→3D não carregados — atualize o app.'); return; }
p3d._texto = String(texto || '');
var fu = parseFloat(p3dPanel.querySelector('[data-p3="un"]').value) || 0;
p3d.parse = window.DXF.parse(texto, fu > 0 ? { fatorUnidade: fu } : {});
p3d.nome = nome || 'planta.dxf';
var info = p3dPanel.querySelector('[data-p3="info"]');
if (!p3d.parse.segmentos.length) { info.innerHTML = '' + (typeof Icones !== 'undefined' ? Icones.get('alerta', 15) : '') + ' Não achei geometria 2D neste DXF (só ' + JSON.stringify(p3d.parse.stats.ignoradas) + '). Exporte como DXF ASCII (R12/2000) com as linhas das paredes.'; p3d.det = null; p3dDesenhar(); p3dResumo(); return; }
var fam3d = window.Planta3D.filtrarFamilias(p3d.parse.segmentos, { espMin: 0.06, espMax: 0.40, angTol: 4 });
p3d.familias = fam3d.familias || [];
p3d.det = window.Planta3D.detectarParedes(fam3d.segmentos);
var env = p3d.parse.extents ? ((p3d.parse.extents.x1 - p3d.parse.extents.x0).toFixed(1) + '×' + (p3d.parse.extents.y1 - p3d.parse.extents.y0).toFixed(1) + ' m') : '—';
var ign = Object.keys(p3d.parse.stats.ignoradas || {}).map(function (k) { return k + '×' + p3d.parse.stats.ignoradas[k]; }).join(', ');
info.innerHTML = '<b>' + esc(p3d.nome) + '</b> · ' + p3d.parse.segmentos.length + ' segmentos · envergadura ' + env +
(p3d.parse.unidade.origem.indexOf('heuristica') === 0 ? ' · <span style="color:#b45309">unidade ASSUMIDA (' + p3d.parse.unidade.origem.slice(11) + ') — confira a envergadura e corrija no seletor se preciso</span>' : '');
if (ign) info.innerHTML += '<br>' + (typeof Icones !== 'undefined' ? Icones.get('alerta', 15) : '') + ' Entidades ignoradas: ' + esc(ign) + (/INSERT/.test(ign) ? ' — geometria DENTRO de bloco não entra: exploda os blocos no CAD antes de exportar.' : '.');
if (!p3d.det.paredes.length) info.innerHTML += '<br>' + (typeof Icones !== 'undefined' ? Icones.get('alerta', 15) : '') + ' Nenhum par de linhas com cara de parede (6–40 cm). Confira a UNIDADE — envergadura errada = espessuras fora da faixa.';
if (p3d.familias.length) {
info.innerHTML += '<br>' + (typeof Icones !== 'undefined' ? Icones.get('proibido', 15) : '') + ' Descartado como não-parede: ' + p3d.familias.map(function (fx) {
return fx.linhas + ' linhas a ' + Math.round(fx.espacamento * 100) + ' cm (' + esc(fx.motivo) + ')';
}).join(' · ') + '. Parede tem DUAS faces.';
}
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
if (mid) { p3dPanel.style.display = 'none'; S._hint('🏗 ' + caixas.length + ' paredes no 3D! O QTO já mede os m² — e a ' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Parede-Cebola explode em camadas SINAPI no orçamento.'); }
}
});
p3dPanel.addEventListener('change', function (e) {
var t = e.target;
if (t.getAttribute('data-p3') === 'file' && t.files && t.files[0]) {
var f = t.files[0], fr = new FileReader();
if (!/\.dxf$/i.test(f.name || '')) {
t.value = '';
var m3 = 'O arquivo “' + f.name + '” não é um DXF. Exporte a planta do seu CAD em DXF e tente de novo.';
try { if (typeof UI !== 'undefined' && UI.toast) UI.toast(m3, 'erro'); else alert(m3); } catch (_) {}
return;
}
fr.onload = function () { p3dProcessar(String(fr.result || ''), f.name); };
fr.readAsText(f); t.value = '';
} else if (t.getAttribute('data-p3') === 'un' && p3d._texto) { p3dProcessar(p3d._texto, p3d.nome); }
});
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
S._p3dProcessar = p3dProcessar;
function initApi() { if (!S._initP) S._initP = (async function () { S.api.SetWasmPath('bim/vendor/'); await S.api.Init(); S.apiReady = true; })().catch(function (e) { S._initP = null; throw e; }); return S._initP; }
var _loadChain = Promise.resolve();
function enfileirar(fn) { _loadChain = _loadChain.then(fn, fn); return _loadChain; }
function lerTopologiaRede(mid) {
var mo = modeloDe(mid);
if (mo && mo.topologia) return mo.topologia;
if (semWasm(mo)) return { portaDe: {}, ligacao: {}, portasDe: {}, dirPorta: {}, nPortas: 0, nLigacoes: 0 };
var topo = { portaDe: {}, ligacao: {}, portasDe: {}, dirPorta: {}, nPortas: 0, nLigacoes: 0 };
try {
var re1 = S.api.GetLineIDsWithType(mid, IFC_RELCONNECTSPORTTOELEMENT), n1 = re1.size();
for (var i = 0; i < n1; i++) {
var r1; try { r1 = S.api.GetLine(mid, re1.get(i), false); } catch (_) { continue; }
if (!r1 || !r1.RelatingPort || !r1.RelatedElement) continue;
var pid = r1.RelatingPort.value, eid = r1.RelatedElement.value;
if (pid == null || eid == null) continue;
var uid = mid + ':' + eid;
topo.portaDe[pid] = uid;
(topo.portasDe[uid] = topo.portasDe[uid] || []).push(pid);
topo.nPortas++;
}
var re2 = S.api.GetLineIDsWithType(mid, IFC_RELCONNECTSPORTS), n2 = re2.size();
for (var j = 0; j < n2; j++) {
var r2; try { r2 = S.api.GetLine(mid, re2.get(j), false); } catch (_) { continue; }
if (!r2 || !r2.RelatingPort || !r2.RelatedPort) continue;
var pa = r2.RelatingPort.value, pb = r2.RelatedPort.value;
if (pa == null || pb == null) continue;
topo.ligacao[pa] = pb; topo.ligacao[pb] = pa;
topo.nLigacoes++;
}
var re3 = S.api.GetLineIDsWithType(mid, IFC_DISTRIBUTIONPORT), n3 = re3.size();
for (var k = 0; k < n3; k++) {
var id3 = re3.get(k), p3;
try { p3 = S.api.GetLine(mid, id3, false); } catch (_) { continue; }
if (p3 && p3.FlowDirection && p3.FlowDirection.value) topo.dirPorta[id3] = String(p3.FlowDirection.value);
}
} catch (e) { }
if (mo) mo.topologia = topo;
return topo;
}
function lerBitolaMm(mid, eid, fLen) {
var moB = modeloDe(mid);
if (semWasm(moB)) return (moB.bitolas && moB.bitolas[eid]) || 0;
try {
var el = S.api.GetLine(mid, eid, false);
if (!el || !el.Representation || el.Representation.value == null) return 0;
var pds = S.api.GetLine(mid, el.Representation.value, false);
var reps = pds && pds.Representations; if (!reps) return 0;
reps = Array.isArray(reps) ? reps : [reps];
for (var i = 0; i < reps.length; i++) {
if (!reps[i] || reps[i].value == null) continue;
var sr; try { sr = S.api.GetLine(mid, reps[i].value, false); } catch (_) { continue; }
var itens = sr && sr.Items; if (!itens) continue;
itens = Array.isArray(itens) ? itens : [itens];
for (var j = 0; j < itens.length; j++) {
if (!itens[j] || itens[j].value == null) continue;
var it; try { it = S.api.GetLine(mid, itens[j].value, false); } catch (_) { continue; }
if (!it || !it.SweptArea || it.SweptArea.value == null) continue;
var pf; try { pf = S.api.GetLine(mid, it.SweptArea.value, false); } catch (_) { continue; }
if (!pf) continue;
var r = pf.Radius; if (r && r.value != null) r = r.value;
var v = parseFloat(r);
if (!isNaN(v) && v > 0) return Math.round(v * 2 * (fLen || 1) * 1000);
}
}
} catch (_) {}
return 0;
}
function lerPerfilI(mid, eid) {
var moP = modeloDe(mid);
if (!moP || semWasm(moP)) return null;
var fLen = unidadePrefixoBase(mid, 'LENGTHUNIT'); if (fLen == null) fLen = 1;
function vl(x) { var n = x && x.value != null ? parseFloat(x.value) : parseFloat(x); return isFinite(n) && n > 0 ? n * fLen : null; }
try {
var el = S.api.GetLine(mid, eid, false);
if (!el || !el.Representation || el.Representation.value == null) return null;
var pds = S.api.GetLine(mid, el.Representation.value, false);
var reps = pds && pds.Representations; if (!reps) return null;
reps = Array.isArray(reps) ? reps : [reps];
for (var i = 0; i < reps.length; i++) {
if (!reps[i] || reps[i].value == null) continue;
var sr; try { sr = S.api.GetLine(mid, reps[i].value, false); } catch (_) { continue; }
var itens = sr && sr.Items; if (!itens) continue;
itens = Array.isArray(itens) ? itens : [itens];
for (var j = 0; j < itens.length; j++) {
if (!itens[j] || itens[j].value == null) continue;
var it; try { it = S.api.GetLine(mid, itens[j].value, false); } catch (_) { continue; }
if (!it || !it.SweptArea || it.SweptArea.value == null) continue;
var pf; try { pf = S.api.GetLine(mid, it.SweptArea.value, false); } catch (_) { continue; }
var h = vl(pf && pf.OverallDepth), b = vl(pf && pf.OverallWidth), tw = vl(pf && pf.WebThickness), tf = vl(pf && pf.FlangeThickness);
if (h && b && tw && tf) return { tipo: 'I', h: h, b: b, tw: tw, tf: tf, comprimento: vl(it.Depth), fonte: 'IfcIShapeProfileDef do IFC' + (pf.ProfileName && pf.ProfileName.value ? ' (' + pf.ProfileName.value + ')' : '') };
}
}
} catch (_) {}
return null;
}
S._icarPerfil = function (uid) { var p = String(uid || '').split(':'); return p.length === 2 ? lerPerfilI(+p[0], +p[1]) : null; };
var NOME_DESCRICAO = { description: 1, descricao: 1, 'descrição': 1 };
function ehNomeDeDescricao(nm) {
var s = String(nm == null ? '' : nm).trim().toLowerCase()
.replace(/[àáâãä]/g, 'a').replace(/[èéêë]/g, 'e').replace(/[ìíîï]/g, 'i')
.replace(/[òóôõö]/g, 'o').replace(/[ùúûü]/g, 'u').replace(/ç/g, 'c');
return !!NOME_DESCRICAO[s];
}
function descricaoDeMercado(idIfc, famEl, carimbo) {
var inst = (idIfc && String(idIfc.descricao || '').trim()) || '';
if (inst) return { descricao: inst, fonte: 'instancia' };
var tipo = (famEl && String(famEl.descricao || '').trim()) || '';
if (tipo) return { descricao: tipo, fonte: 'tipo' };
var ps = (carimbo && String(carimbo.descricaoPset || '').trim()) || '';
if (ps) return { descricao: ps, fonte: 'pset' };
return { descricao: '', fonte: '' };
}
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
if (!pset || !pset.HasProperties) continue;
var props = Array.isArray(pset.HasProperties) ? pset.HasProperties : [pset.HasProperties];
var etapa = null, cod = null, fase = null, descrPset = null, tarefa = null, discP = null, detalhe = null, montagem = null, folha = null;
var psNome = pset.Name && pset.Name.value, abre = null, folhaDe = null;
for (var p = 0; p < props.length; p++) {
var h = props[p]; if (!h || h.value == null) continue;
var pv; try { pv = S.api.GetLine(mid, h.value, false); } catch (_) { continue; }
if (!pv || pv.type !== IFC_PROPERTYSINGLEVALUE) continue;
var nm = pv.Name && pv.Name.value;
if (psNome === 'RA_Abertura' && pv.NominalValue && (nm === 'Tipo' || nm === 'Folhas' || nm === 'Convencao')) {
if (!abre) abre = {};
abre[nm] = pv.NominalValue.value == null ? '' : String(pv.NominalValue.value);
continue;
}
if (psNome === 'RA_Folha' && nm === 'Esquadria_GUID' && pv.NominalValue) { folhaDe = String(pv.NominalValue.value || ''); continue; }
if (nm === 'OrcaPRO_Etapa' && pv.NominalValue) etapa = pv.NominalValue.value;
else if (nm === 'OrcaPRO_CodOrc' && pv.NominalValue) cod = pv.NominalValue.value;
else if (nm === 'OrcaPRO_Fase' && pv.NominalValue) fase = pv.NominalValue.value;
else if (nm === 'OrcaPRO_Tarefa' && pv.NominalValue) tarefa = pv.NominalValue.value;
else if (nm === 'OrcaPRO_Disciplina' && pv.NominalValue) discP = pv.NominalValue.value;
else if (nm === 'OrcaPRO_Detalhe' && pv.NominalValue) detalhe = pv.NominalValue.value;
else if (nm === 'OrcaPRO_Montagem' && pv.NominalValue) montagem = pv.NominalValue.value;
else if (nm === 'OrcaPRO_Folha' && pv.NominalValue) folha = pv.NominalValue.value;
else if (nm && pv.NominalValue && descrPset == null && ehNomeDeDescricao(nm)) {
var vD = pv.NominalValue.value;
if (vD != null && String(vD).trim()) descrPset = String(vD).trim();
}
}
if (!abre && !folhaDe && etapa == null && cod == null && fase == null && descrPset == null && tarefa == null && discP == null && detalhe == null && montagem == null && folha == null) continue;
var objs = Array.isArray(rel.RelatedObjects) ? rel.RelatedObjects : [rel.RelatedObjects];
for (var o = 0; o < objs.length; o++) {
var oh = objs[o]; if (!oh || oh.value == null) continue;
var eid = oh.value; if (!mapa[eid]) mapa[eid] = {};
if (etapa != null) mapa[eid].etapa = etapa;
if (cod != null) mapa[eid].codOrc = cod;
if (fase != null) mapa[eid].fase = fase;
if (tarefa != null && String(tarefa).trim()) mapa[eid].tarefa = String(tarefa).trim();
if (discP != null && String(discP).trim()) mapa[eid].disciplinaPeca = String(discP).trim();
if (detalhe != null && String(detalhe).trim()) mapa[eid].detalhe = String(detalhe).trim();
if (montagem != null && String(montagem).trim()) mapa[eid].montagem = String(montagem).trim();
if (folha != null && String(folha).trim()) mapa[eid].folhas = String(folha).trim();
if (descrPset != null && !mapa[eid].descricaoPset) mapa[eid].descricaoPset = descrPset;
if (abre) mapa[eid].abertura = abre;
if (folhaDe) mapa[eid].folhaDe = folhaDe;
}
}
} catch (e) { }
return mapa;
}
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
var descrFam = (tipoObj && tipoObj.Description && tipoObj.Description.value) || '';
var objs = Array.isArray(rel.RelatedObjects) ? rel.RelatedObjects : [rel.RelatedObjects];
for (var o = 0; o < objs.length; o++) {
var oh = objs[o]; if (!oh || oh.value == null) continue;
mapa[oh.value] = { familia: nomeFam, tipoId: tid, descricao: descrFam };
}
}
} catch (e) { }
return mapa;
}
function lerMateriais(mid) {
var mapa = {}, memo = {}, dens = {}, texM = {}, escM = {};
function linha(id) { if (id == null) return null; try { return S.api.GetLine(mid, id, false); } catch (_) { return null; } }
function lista(x) { return x == null ? [] : (Array.isArray(x) ? x : [x]); }
function ref(x) { return (x && x.value != null) ? x.value : null; }
function numv(x) { if (x == null) return NaN; if (typeof x === 'object') x = x.value; var v = parseFloat(x); return isNaN(v) ? NaN : v; }
try {
var mps = S.api.GetLineIDsWithType(mid, IFC_MATERIALPROPERTIES), nmp = mps.size();
for (var a = 0; a < nmp; a++) {
var mp = linha(mps.get(a)), matId = mp && ref(mp.Material); if (matId == null) continue;
var ehRA = !!(mp.Name && mp.Name.value === 'RA_Material');
lista(mp.Properties).forEach(function (h) {
var pv = linha(ref(h)); if (!pv || pv.type !== IFC_PROPERTYSINGLEVALUE) return;
if (!pv.Name || !pv.NominalValue) return;
var nmP = pv.Name.value;
if (nmP === 'MassDensity') { var v = numv(pv.NominalValue.value); if (v > 0) dens[matId] = v; }
else if (ehRA && nmP === 'Textura') { var tx = String(pv.NominalValue.value == null ? '' : pv.NominalValue.value).trim(); if (tx) texM[matId] = tx; }
else if (ehRA && nmP === 'Escala_m') { var es = numv(pv.NominalValue.value); if (es > 0) escM[matId] = es; }
});
}
} catch (_) {}
function item(matId, f) {
var m = linha(matId), n = m && m.Name && m.Name.value ? String(m.Name.value).trim() : '';
if (!n) return null;
var o = { n: n, f: (f == null || isNaN(f)) ? null : f, rho: dens[matId] || null };
if (texM[matId]) { o.tx = texM[matId]; if (escM[matId]) o.esc = escM[matId]; }
return o;
}
function resolver(id, prof) {
if (id == null || prof > 4) return [];
if (memo[id]) return memo[id];
var m = linha(id), out = [];
if (m) {
var t = m.type;
if (t === IFC_MATERIAL) { var it = item(id, null); if (it) out.push(it); }
else if (t === IFC_MATERIALLAYERSETUSAGE) out = resolver(ref(m.ForLayerSet), prof + 1);
else if (t === IFC_MATERIALPROFILESETUSAGE) out = resolver(ref(m.ForProfileSet), prof + 1);
else if (t === IFC_MATERIALLAYERSET) {
var cams = lista(m.MaterialLayers).map(function (h) { return linha(ref(h)); }).filter(Boolean), tot = 0;
cams.forEach(function (c) { var e = numv(c.LayerThickness); if (e > 0) tot += e; });
cams.forEach(function (c) { var e = numv(c.LayerThickness), it2 = item(ref(c.Material), tot > 0 ? (e > 0 ? e / tot : 0) : null); if (it2) out.push(it2); });
} else if (t === IFC_MATERIALPROFILESET) {
lista(m.MaterialProfiles).forEach(function (h) { var p = linha(ref(h)), it3 = p && item(ref(p.Material), null); if (it3) out.push(it3); });
} else if (t === IFC_MATERIALCONSTITUENTSET) {
lista(m.MaterialConstituents).forEach(function (h) { var c = linha(ref(h)), it4 = c && item(ref(c.Material), numv(c.Fraction)); if (it4) out.push(it4); });
} else if (t === IFC_MATERIALLIST) {
lista(m.Materials).forEach(function (h) { var it5 = item(ref(h), null); if (it5) out.push(it5); });
}
}
var por = {}, uniq = [];
out.forEach(function (x) {
if (!por[x.n]) { por[x.n] = { n: x.n, f: x.f, rho: x.rho }; if (x.tx) { por[x.n].tx = x.tx; if (x.esc) por[x.n].esc = x.esc; } uniq.push(por[x.n]); }
else if (por[x.n].f != null && x.f != null) por[x.n].f += x.f;
else por[x.n].f = null;
});
memo[id] = uniq;
return uniq;
}
try {
var rels = S.api.GetLineIDsWithType(mid, IFC_RELASSOCIATESMATERIAL), n = rels.size();
for (var i = 0; i < n; i++) {
var rel = linha(rels.get(i)); if (!rel || !rel.RelatingMaterial || !rel.RelatedObjects) continue;
var mats = resolver(ref(rel.RelatingMaterial), 0); if (!mats.length) continue;
lista(rel.RelatedObjects).forEach(function (oh) { var eid = ref(oh); if (eid != null) mapa[eid] = mats; });
}
} catch (e) { }
return mapa;
}
function lerSistemas(mid) {
var mapa = {};
try {
var rels = S.api.GetLineIDsWithType(mid, IFC_RELASSIGNSTOGROUP);
var n = rels.size();
for (var i = 0; i < n; i++) {
var rel; try { rel = S.api.GetLine(mid, rels.get(i), false); } catch (_) { continue; }
if (!rel || !rel.RelatingGroup || rel.RelatingGroup.value == null || !rel.RelatedObjects) continue;
var grp; try { grp = S.api.GetLine(mid, rel.RelatingGroup.value, false); } catch (_) { continue; }
if (!grp || (grp.type !== IFC_SYSTEM && grp.type !== IFC_DISTRIBUTIONSYSTEM)) continue;
var nomeSis = (grp.Name && grp.Name.value) || (grp.LongName && grp.LongName.value) || null;
if (!nomeSis) continue;
var objs = Array.isArray(rel.RelatedObjects) ? rel.RelatedObjects : [rel.RelatedObjects];
for (var o = 0; o < objs.length; o++) {
var oh = objs[o]; if (!oh || oh.value == null) continue;
if (!mapa[oh.value]) mapa[oh.value] = nomeSis;
}
}
} catch (e) { }
return mapa;
}
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
if (pset.HasProperties) {
var hs = Array.isArray(pset.HasProperties) ? pset.HasProperties : [pset.HasProperties];
for (var p = 0; p < hs.length; p++) {
var h = hs[p]; if (!h || h.value == null) continue;
var pv; try { pv = S.api.GetLine(mid, h.value, false); } catch (_) { continue; }
if (!pv) continue;
var v = propValor(mid, pv);
if (v != null && v !== "") props.push({ n: (pv.Name && pv.Name.value) || "?", v: String(v) });
}
} else if (pset.Quantities) {
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
function propsCompletas(mid, expressID) {
var grupos = [];
var mo = modeloDe(mid);
if (mo && mo.doCache) {
var elK = (mo.elementos || []).filter(function (e) { return e.id === expressID; })[0];
var qK = (mo.qto && mo.qto[expressID]) || null;
var pr = [];
if (elK && elK.tipo) pr.push({ n: 'Tipo IFC', v: String(elK.tipo) });
if (elK && elK.globalId) pr.push({ n: 'GlobalId', v: String(elK.globalId) });
if (elK && elK.familia) pr.push({ n: 'Família/tipo', v: String(elK.familia) });
if (elK && elK.descricao) pr.push({ n: 'Descrição (nome de mercado)', v: String(elK.descricao) });
if (elK && elK.tag) pr.push({ n: 'Tag', v: String(elK.tag) });
if (elK && elK.etapa) pr.push({ n: 'Etapa (OrçaPRO)', v: String(elK.etapa) });
if (elK && elK.codOrc) pr.push({ n: 'Código do orçamento', v: String(elK.codOrc) });
if (pr.length) grupos.push({ pset: 'Do modelo guardado', origem: 'instância', props: pr });
if (qK) grupos.push({ pset: 'Quantitativos', origem: 'instância', props: [
{ n: 'Comprimento', v: String(qK.comprimento == null ? '—' : qK.comprimento) },
{ n: 'Área', v: String(qK.area == null ? '—' : qK.area) },
{ n: 'Volume', v: String(qK.volume == null ? '—' : qK.volume) }] });
grupos.push({ pset: 'Lista completa de propriedades', origem: 'instância', props: [
{ n: 'Não está guardada', v: 'Abra o arquivo .ifc de novo para ver todas as propriedades desta peça.' }] });
return grupos;
}
if (mo && mo.sintetico) {
var elS = (mo.elementos || []).filter(function (e) { return e.id === expressID; })[0];
if (elS && elS.qto) grupos.push({ pset: "Dimensões (criado no OrçaPRO)", origem: "instância", props: [
{ n: "Comprimento (m)", v: String(elS.qto.comprimento || 0) }, { n: "Área (m²)", v: String(elS.qto.area || 0) }, { n: "Volume (m³)", v: String(elS.qto.volume || 0) }] });
return grupos;
}
try {
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
var fam = (mo && mo.familias && mo.familias[expressID]) || null;
if (fam && fam.tipoId != null) {
var tipoObj; try { tipoObj = S.api.GetLine(mid, fam.tipoId, false); } catch (_) { tipoObj = null; }
if (tipoObj && tipoObj.HasPropertySets) {
var hps = Array.isArray(tipoObj.HasPropertySets) ? tipoObj.HasPropertySets : [tipoObj.HasPropertySets];
for (var t = 0; t < hps.length; t++) if (hps[t] && hps[t].value != null) lerPropsDePset(mid, hps[t].value, grupos, "família");
}
}
} catch (e) { }
return grupos;
}
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
function lerQuantitativos(mid) {
var mapa = {};
var bL = unidadePrefixoBase(mid, 'LENGTHUNIT'); if (bL == null) bL = 1;
var bA = unidadePrefixoBase(mid, 'AREAUNIT'), bV = unidadePrefixoBase(mid, 'VOLUMEUNIT');
var fLen = bL, fArea = (bA != null ? bA * bA : bL * bL), fVol = (bV != null ? bV * bV * bV : bL * bL * bL);
var bM = unidadePrefixoBase(mid, 'MASSUNIT'), fMassa = (bM != null ? bM / 1000 : 1);
function vnum(x) { if (x == null) return NaN; if (typeof x === 'object') x = x.value; var v = parseFloat(x); return isNaN(v) ? NaN : v; }
try {
var rels = S.api.GetLineIDsWithType(mid, IFC_RELDEFINESBYPROPERTIES), nRel = rels.size();
for (var i = 0; i < nRel; i++) {
var rel; try { rel = S.api.GetLine(mid, rels.get(i), false); } catch (_) { continue; }
if (!rel || !rel.RelatingPropertyDefinition || !rel.RelatedObjects) continue;
var qid = rel.RelatingPropertyDefinition.value; if (qid == null) continue;
var qset; try { qset = S.api.GetLine(mid, qid, false); } catch (_) { continue; }
if (!qset) continue;
var comp = { v: 0, s: -1 }, ar = { v: 0, s: -1 }, vol = { v: 0, s: -1 }, mas = { v: 0, s: -1 }, cont = 0;
if (!qset.Quantities && qset.HasProperties) {
var props = Array.isArray(qset.HasProperties) ? qset.HasProperties : [qset.HasProperties];
for (var pp = 0; pp < props.length; pp++) {
var ph = props[pp]; if (!ph || ph.value == null) continue;
var pv; try { pv = S.api.GetLine(mid, ph.value, false); } catch (_) { continue; }
if (!pv || pv.type !== IFC_PROPERTYSINGLEVALUE || !pv.NominalValue) continue;
var pnm = (pv.Name && pv.Name.value) ? String(pv.Name.value).toLowerCase() : '';
if (/width|height|thick|depth|perimet|larg|altura|espess|diamet|diâmet|bore|radius|raio/.test(pnm)) continue;
var sP = pnm === 'length' ? 3 : /length|comprim/.test(pnm) ? 2 : 0;
if (!sP) continue;
var Pv = vnum(pv.NominalValue.value);
if (isNaN(Pv) || Pv <= 0) continue;
if (sP > comp.s) comp = { v: Pv, s: sP };
}
if (comp.s < 0) continue;
var qtoP = { comprimento: comp.v * fLen, area: 0, volume: 0, contagem: 0,
compFonte: comp.s === 3 ? 'exata' : 'nomeada' };
var objsP = Array.isArray(rel.RelatedObjects) ? rel.RelatedObjects : [rel.RelatedObjects];
for (var op = 0; op < objsP.length; op++) {
var ohp = objsP[op]; if (!ohp || ohp.value == null) continue;
var eidp = ohp.value;
if (!mapa[eidp]) mapa[eidp] = { comprimento: 0, area: 0, volume: 0, contagem: 0, compFonte: '' };
if (qtoP.comprimento > mapa[eidp].comprimento) { mapa[eidp].comprimento = qtoP.comprimento; mapa[eidp].compFonte = qtoP.compFonte; }
}
continue;
}
if (!qset.Quantities) continue;
var qs = Array.isArray(qset.Quantities) ? qset.Quantities : [qset.Quantities];
for (var q = 0; q < qs.length; q++) {
var qh = qs[q]; if (!qh || qh.value == null) continue;
var qv; try { qv = S.api.GetLine(mid, qh.value, false); } catch (_) { continue; }
if (!qv) continue;
var nm = (qv.Name && qv.Name.value) ? String(qv.Name.value).toLowerCase() : '';
if (qv.LengthValue != null) {
var Lv = vnum(qv.LengthValue); if (isNaN(Lv)) continue;
if (/width|height|thick|depth|perimet|larg|altura|espess|diamet|diâmet|bore|radius|raio/.test(nm)) continue;
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
} else if (qv.WeightValue != null) {
var Wv = vnum(qv.WeightValue); if (isNaN(Wv) || Wv <= 0) continue;
var sW = /net/.test(nm) ? 3 : /gross/.test(nm) ? 2 : 1;
if (sW > mas.s) mas = { v: Wv, s: sW };
}
}
if (comp.s < 0 && ar.s < 0 && vol.s < 0 && mas.s < 0 && cont === 0) continue;
var qto = { comprimento: comp.s >= 0 ? comp.v * fLen : 0, area: ar.s >= 0 ? ar.v * fArea : 0, volume: vol.s >= 0 ? vol.v * fVol : 0, contagem: cont,
massa: mas.s >= 0 ? mas.v * fMassa : 0, massaFonte: mas.s === 3 ? 'liquida' : mas.s === 2 ? 'bruta' : mas.s === 1 ? 'anonima' : '',
compFonte: comp.s === 3 ? 'exata' : comp.s === 2 ? 'nomeada' : comp.s === 1 ? 'anonima' : '' };
var objs = Array.isArray(rel.RelatedObjects) ? rel.RelatedObjects : [rel.RelatedObjects];
for (var o = 0; o < objs.length; o++) {
var oh = objs[o]; if (!oh || oh.value == null) continue;
var eid = oh.value;
if (!mapa[eid]) mapa[eid] = { comprimento: 0, area: 0, volume: 0, contagem: 0, compFonte: '' };
if (qto.comprimento > mapa[eid].comprimento) { mapa[eid].comprimento = qto.comprimento; mapa[eid].compFonte = qto.compFonte; }
if (qto.area > mapa[eid].area) mapa[eid].area = qto.area;
if (qto.volume > mapa[eid].volume) mapa[eid].volume = qto.volume;
if (qto.contagem > mapa[eid].contagem) mapa[eid].contagem = qto.contagem;
if (qto.massa > (mapa[eid].massa || 0)) { mapa[eid].massa = qto.massa; mapa[eid].massaFonte = qto.massaFonte; }
}
}
} catch (e) { }
return mapa;
}
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
var alvo = st[rel.RelatingStructure.value]; if (!alvo) continue;
var els = Array.isArray(rel.RelatedElements) ? rel.RelatedElements : (rel.RelatedElements ? [rel.RelatedElements] : []);
for (var k2 = 0; k2 < els.length; k2++) { var h2 = els[k2]; if (h2 && h2.value != null) alvo.eids.push(h2.value); }
}
} catch (_) { }
return out;
}
function detectarDisciplina(nome, tipos) {
var n = String(nome || '').toLowerCase();
if (/estrut|struct|\best[_\-.]|founda/.test(n)) return 'estrutural';
if (/arq|arch/.test(n)) return 'arquitetura';
if (/hidr|hydro|sanit|agua|água|esgoto|plumb|\bhid[_\-.]|\bplu[_\-.]|\bsan[_\-.]/.test(n)) return 'hidraulica';
if (/elet|elec|el[ée]tr|\bele[_\-.]/.test(n)) return 'eletrica';
if (/avac|hvac|mec[aâ]|clima|\bmec[_\-.]/.test(n)) return 'mecanica';
var t = tipos || {};
var est = (t.IFCBEAM || 0) + (t.IFCCOLUMN || 0) + (t.IFCFOOTING || 0) + (t.IFCPILE || 0) + (t.IFCMEMBER || 0);
var hid = (t.IFCFLOWSEGMENT || 0) + (t.IFCFLOWFITTING || 0) + (t.IFCFLOWTERMINAL || 0);
var arq = (t.IFCWALL || 0) + (t.IFCWALLSTANDARDCASE || 0) + (t.IFCDOOR || 0) + (t.IFCWINDOW || 0) + (t.IFCCOVERING || 0) + (t.IFCROOF || 0) + (t.IFCSLAB || 0);
var max = Math.max(est, hid, arq);
if (!max) return 'arquitetura';
return max === hid ? 'hidraulica' : (max === est ? 'estrutural' : 'arquitetura');
}
function modeloDe(mid) { for (var i = 0; i < S.modelos.length; i++) if (S.modelos[i].mid === mid) return S.modelos[i]; return null; }
function publicos() { return S.modelos.map(function (mo) { return { mid: mo.mid, nome: mo.nome, disciplina: mo.disciplina, alpha: mo.alpha, visivel: mo.visivel, n: mo.elementos.length, modeloId: mo.modeloId || '', arquivoId: mo.versaoId || '', doCache: !!mo.doCache, sintetico: !!mo.sintetico, temColeta: !!mo._coleta, semCache: mo._semCache || '', exemplo: !!mo.exemplo }; }); }
function notifyModelos() { if (S._reaplicarEstilo) S._reaplicarEstilo(); if (S._reaplicarSistema) S._reaplicarSistema(); if (S._reaplicarEstiloVisual) S._reaplicarEstiloVisual(); if (S._reaplicarCoresCat) S._reaplicarCoresCat(); if (S.opts && S.opts.onModelos) { try { S.opts.onModelos(publicos()); } catch (_) {} } }
S._publicos = publicos;
var _corMatCache = {};
function corMat(hex, alpha) {
var a = (alpha == null ? 1 : alpha);
var k = hex + '_' + a.toFixed(2);
if (!_corMatCache[k]) {
_corMatCache[k] = new THREE.MeshStandardMaterial({
color: new THREE.Color(hex), metalness: .05, roughness: .85, side: THREE.DoubleSide,
transparent: a < 1, opacity: a, depthWrite: a >= 1
});
}
return _corMatCache[k];
}
function uidsDeChaves(chaves) {
var alvo = {}, out = [];
(chaves || []).forEach(function (c) { alvo[c] = 1; });
(S.elementos || []).forEach(function (e) { if (e.chave && alvo[e.chave]) out.push(e.uid); });
return out;
}
function isolarChaves(chaves) {
var alvo = {}, n = 0;
uidsDeChaves(chaves).forEach(function (u) { alvo[u] = 1; });
todasMalhas(function (m) {
if (m.userData.expressID == null) return;
var vis = !!alvo[m.userData.mid + ':' + m.userData.expressID] && !ehFuturo4d(m) && !ehRemovidoEd(m);
m.visible = vis; if (vis) n++;
});
pav.isolado = null; pav.manual = true; pavRender();
return n;
}
function pintarChaves(mapa, dono) {
var porUid = {}, n = 0;
var alvo = mapa || {};
(S.elementos || []).forEach(function (e) {
if (e.chave && alvo[e.chave]) { porUid[e.uid] = alvo[e.chave]; n++; }
});
S._pintura = n ? porUid : null;
S._pinturaDono = n ? (dono || "?") : null;
S.modelos.forEach(function (mo) { refreshModelo(mo); });
return n;
}
function limparPintura() { S._pintura = null; S._pinturaDono = null; S.modelos.forEach(function (mo) { refreshModelo(mo); }); }
S._isolarChaves = isolarChaves; S._pintarChaves = pintarChaves; S._limparPintura = limparPintura;
S._uidsDeChaves = uidsDeChaves;
var _lnAtraso = null, _lnAtrasoMat = null;
var MAX_CONTORNO = 4000;
function limparContorno4D() {
if (_lnAtraso && _lnAtraso.parent) _lnAtraso.parent.remove(_lnAtraso);
if (_lnAtraso && _lnAtraso.geometry) { try { _lnAtraso.geometry.dispose(); } catch (e) {} }
_lnAtraso = null;
}
function aplicar4DTarefas(sim) {
if (!S || !sim) return { ok: false, erro: 'simulação vazia' };
if (S.pav && (S.pav.isolado || S.pav.manual)) { S.pav.isolado = null; S.pav.manual = false; if (S._pavRender) S._pavRender(); }
var fora = {};
uidsDeChaves(sim.ocultos || []).forEach(function (u) { fora[u] = 1; });
var porChave = {}, n = 0;
Object.keys(sim.pinturas || {}).forEach(function (k) { porChave[k] = sim.pinturas[k]; n++; });
var porUid = {};
(S.elementos || []).forEach(function (e) { if (e.chave && porChave[e.chave]) porUid[e.uid] = porChave[e.chave]; });
S._pintura = n ? porUid : null;
S._pinturaDono = "4d-tarefas";
S._fut4d = fora;
cadaMalha(function (m) {
var id = m.userData.expressID; if (id == null) return;
var uid = m.userData.mid + ':' + id;
if (fora[uid] || ehRemovidoEd(m)) { m.visible = false; return; }
m.visible = true;
if (m === S.selected) return;
m.material = S._matBase ? S._matBase(m) : (m.userData.matOrig || m.material);
});
limparContorno4D();
var alvos = uidsDeChaves(Object.keys(sim.contornos || {}));
var res = { ok: true, ocultos: Object.keys(fora).length, pintados: n, contornados: 0, contornoCortado: false };
if (!alvos.length) return res;
var mapaUid = {};
alvos.forEach(function (u) { mapaUid[u] = 1; });
var pos = [], usados = 0, cortou = false;
var _v = new THREE.Vector3();
cadaMalha(function (m) {
if (m.userData.expressID == null) return;
if (!mapaUid[m.userData.mid + ':' + m.userData.expressID]) return;
if (usados >= MAX_CONTORNO) { cortou = true; return; }
var g = m.geometry;
if (!g || !g.attributes || !g.attributes.position) return;
if (g.attributes.position.count > 60000) return;
var arr;
try { arr = arestasDe(g); } catch (e) { return; }
if (!arr || !arr.length) return;
var mw = m.matrixWorld;
for (var i = 0; i < arr.length; i += 3) {
_v.set(arr[i], arr[i + 1], arr[i + 2]).applyMatrix4(mw);
pos.push(_v.x, _v.y, _v.z);
}
usados++;
});
if (pos.length) {
var bg = new THREE.BufferGeometry();
bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
var cor = sim.contornos[Object.keys(sim.contornos)[0]] || '#ea580c';
if (!_lnAtrasoMat) _lnAtrasoMat = new THREE.LineBasicMaterial({ color: new THREE.Color(cor), depthTest: true, transparent: false });
else _lnAtrasoMat.color = new THREE.Color(cor);
_lnAtraso = new THREE.LineSegments(bg, _lnAtrasoMat);
_lnAtraso.renderOrder = 998;
scene.add(_lnAtraso);
}
res.contornados = usados;
res.contornoCortado = cortou;
return res;
}
function limpar4DTarefas() {
limparContorno4D();
S._pintura = null; S._fut4d = null; S._and4d = null;
cadaMalha(function (m) { m.visible = !ehRemovidoEd(m); if (m !== S.selected) m.material = S._matBase ? S._matBase(m) : (m.userData.matOrig || m.material); });
}
S._aplicar4DTarefas = aplicar4DTarefas; S._limpar4DTarefas = limpar4DTarefas;
function aplicar4DSim(cena) {
if (!S || !cena) return { ok: false, erro: 'simulação vazia' };
if (S.pav && (S.pav.isolado || S.pav.manual)) { S.pav.isolado = null; S.pav.manual = false; if (S._pavRender) S._pavRender(); }
limparContorno4D();
var fora = {};
(cena.ocultos || []).forEach(function (u) { fora[u] = 1; });
var pint = {}, n = 0;
Object.keys(cena.pinturas || {}).forEach(function (u) {
var p = cena.pinturas[u];
if (p && typeof p.cor === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.cor)) { pint[u] = { cor: p.cor, opacidade: Math.max(0.05, Math.min(1, +p.opacidade || 1)) }; n++; }
});
S._pintura = n ? pint : null;
S._pinturaDono = '4d-sim';
S._fut4d = fora; S._and4d = null;
var vis = 0;
cadaMalha(function (m) {
var id = m.userData.expressID; if (id == null) return;
var uid = m.userData.mid + ':' + id;
if (fora[uid] || ehRemovidoEd(m)) { m.visible = false; return; }
m.visible = true; vis++;
if (m === S.selected) return;
m.material = S._matBase ? S._matBase(m) : (m.userData.matOrig || m.material);
});
return { ok: true, ocultos: Object.keys(fora).length, pintados: n, malhasVisiveis: vis };
}
function enquadrarUids(uids, opts) {
if (!S || !uids || !uids.length) return false;
var alvo = {}; uids.forEach(function (u) { alvo[u] = 1; });
var box = new THREE.Box3(), achou = 0, bm = new THREE.Box3();
cadaMalha(function (m) {
if (m.userData.expressID == null || !alvo[m.userData.mid + ':' + m.userData.expressID]) return;
if (!m.geometry) return;
if (!m.geometry.boundingBox) { try { m.geometry.computeBoundingBox(); } catch (e) { return; } }
if (!m.geometry.boundingBox) return;
bm.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
box.union(bm); achou++;
});
if (!achou || box.isEmpty()) return false;
var W = (S.renderer && S.renderer.domElement) ? (S.renderer.domElement.clientWidth || 0) : 0;
var tampa = Math.max(0, Math.min(W * 0.7, +((opts && opts.direita) || 0)));
if (!tampa || !W) { if (S._enquadrarObj) S._enquadrarObj(box, 1.5); return true; }
if (S._cancelTween) S._cancelTween();
var c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
var raio = Math.max(sz.x, sz.y, sz.z, 0.5) * 0.5, livre = (W - tampa) / W;
var tg = Math.tan((camera.fov * Math.PI / 180) / 2);
var tgLivre = tg * (camera.aspect || 1) * Math.max(0.3, livre);
var dist = (raio / Math.min(tg, tgLivre)) * 1.3;
var dir = camera.position.clone().sub(orbit.target); if (dir.lengthSq() < 1e-6) dir.set(0.7, 0.55, 0.8); dir.normalize();
var largMundo = 2 * dist * tg * (camera.aspect || 1);
var direita = new THREE.Vector3().crossVectors(dir.clone().negate(), camera.up).normalize();
var alvoCam = c.clone().add(direita.multiplyScalar((tampa / W) * largMundo / 2));
var near = Math.max(0.01, (dist - raio) * 0.5); if (near < camera.near) { camera.near = near; camera.updateProjectionMatrix(); }
voarCam(alvoCam.clone().add(dir.multiplyScalar(dist)), alvoCam, 0.55);
return true;
}
S._aplicar4DSim = aplicar4DSim; S._enquadrarUids = enquadrarUids;
S._caixaUids = function (uids) {
if (!uids || !uids.length) return null;
var alvo = {}; uids.forEach(function (u) { alvo[u] = 1; });
var box = new THREE.Box3(), bm = new THREE.Box3(), achou = 0;
cadaMalha(function (m) {
if (m.userData.expressID == null || !alvo[m.userData.mid + ':' + m.userData.expressID] || !m.geometry || m.visible === false) return;
if (!m.geometry.boundingBox) { try { m.geometry.computeBoundingBox(); } catch (e) { return; } }
if (!m.geometry.boundingBox) return;
bm.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld); box.union(bm); achou++;
});
return achou && !box.isEmpty() ? { min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z], malhas: achou } : null;
};
var edifCache = null;
function lerCamadasPds(mid) {
var porItem = {}, porRep = {}, porPds = {}, api = S.api;
function linha(id) { try { return api.GetLine(mid, id, false); } catch (_) { return null; } }
function lista(x) { return x == null ? [] : (Array.isArray(x) ? x : [x]); }
function ref(x) { return (x && x.value != null) ? x.value : null; }
try {
var ls = api.GetLineIDsWithType(mid, 2022622350), n = ls.size();
if (!n) return porPds;
for (var i = 0; i < n; i++) {
var l = linha(ls.get(i)), nome = l && l.Name && l.Name.value ? String(l.Name.value) : '';
if (!nome) continue;
lista(l.AssignedItems).forEach(function (h) { var id = ref(h); if (id != null && porItem[id] == null) porItem[id] = nome; });
}
var rs = api.GetLineIDsWithType(mid, 4240577450), nr = rs.size();
if (nr > 60000) return porPds;
for (var j = 0; j < nr; j++) {
var rid = rs.get(j), r = linha(rid); if (!r) continue;
if (porItem[rid] != null) { porRep[rid] = porItem[rid]; continue; }
lista(r.Items).some(function (h) { var c = porItem[ref(h)]; if (c != null) { porRep[rid] = c; return true; } return false; });
}
var ps = api.GetLineIDsWithType(mid, 673634403), np = ps.size();
for (var k = 0; k < np; k++) {
var pid = ps.get(k), p = linha(pid); if (!p) continue;
lista(p.Representations).some(function (h) { var c = porRep[ref(h)]; if (c != null) { porPds[pid] = c; return true; } return false; });
}
} catch (_) { }
return porPds;
}
S._sigGeo = function () {
var BF = window.BimFluidez; if (!BF || !BF.assinaturaCena || !S.modelRoot) return null;
var cx0 = null; try { cx0 = S._cxMain ? S._cxMain.estado() : null; } catch (_) { cx0 = null; }
var rem = S._remEd ? Object.keys(S._remEd).filter(function (k) { return S._remEd[k]; }).sort().join(',') : '';
return BF.assinaturaCena(S.modelRoot, { extra: [S._partesVersao || 0, cx0 && cx0.on ? JSON.stringify([cx0.min, cx0.max]) : '-', rem, (S.modelos || []).length, (S.elementos || []).length] });
};
S._sigVis = function () {
var BF = window.BimFluidez; if (!BF || !BF.assinaturaCena || !S.modelRoot) return null;
var cx0 = null; try { cx0 = S._cxMain ? S._cxMain.estado() : null; } catch (_) { cx0 = null; }
var rem = S._remEd ? Object.keys(S._remEd).filter(function (k) { return S._remEd[k]; }).sort().join(',') : '';
return BF.assinaturaCena(S.modelRoot, { vis: true, extra: [S._partesVersao || 0, cx0 && cx0.on ? JSON.stringify([cx0.min, cx0.max]) : '-', rem, (S.modelos || []).length, (S.elementos || []).length, scene.visible === false ? 0 : 1] });
};
function edificacaoMedir() {
var PV = window.PranchaViva;
if (!PV || !PV.caixaEdificacao || !S || !S.modelRoot) return null;
var sigR = null; try { sigR = S._sigGeo(); } catch (_) { sigR = null; }
if (sigR && edifCache && edifCache.sigR === sigR) return edifCache;
var box = new THREE.Box3().setFromObject(modelRoot); if (box.isEmpty()) return null;
var cx = null;
var porUid = {}, nM = 0, bm = new THREE.Box3(), tipoDe = {};
cadaMalha(function (m) {
var ud = m.userData || {}; if (!m.geometry || ud.expressID == null) return;
if (!m.geometry.boundingBox) { try { m.geometry.computeBoundingBox(); } catch (e) { return; } }
if (!m.geometry.boundingBox) return;
bm.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld); if (bm.isEmpty()) return;
var u = ud.mid + ':' + ud.expressID, o = porUid[u]; nM++;
if (!o) { porUid[u] = { min: [bm.min.x, bm.min.y, bm.min.z], max: [bm.max.x, bm.max.y, bm.max.z] }; tipoDe[u] = ud.tipo || ''; }
else { o.min[0] = Math.min(o.min[0], bm.min.x); o.min[1] = Math.min(o.min[1], bm.min.y); o.min[2] = Math.min(o.min[2], bm.min.z); o.max[0] = Math.max(o.max[0], bm.max.x); o.max[1] = Math.max(o.max[1], bm.max.y); o.max[2] = Math.max(o.max[2], bm.max.z); }
});
function r2(v) { return Math.round(v * 100) / 100; }
var sig = [nM, r2(box.min.x), r2(box.min.y), r2(box.min.z), r2(box.max.x), r2(box.max.y), r2(box.max.z)].join('|');
if (edifCache && edifCache.sig === sig) { edifCache.sigR = sigR; return edifCache; }
var lista = [], vistos = {};
(elementosVivos() || []).forEach(function (e) {
var c = porUid[e.uid]; if (!c) return;
vistos[e.uid] = 1;
lista.push({ uid: e.uid, tipo: e.tipo, nome: e.nome, nomeIfc: e.nomeIfc, tag: e.tag, familia: e.familia, materiais: e.materiais, camada: e.camada || '', min: c.min, max: c.max, protegido: String(e.uid).indexOf('edit:') === 0 });
});
Object.keys(porUid).forEach(function (u) { if (!vistos[u]) lista.push({ uid: u, tipo: tipoDe[u], min: porUid[u].min, max: porUid[u].max, protegido: u.indexOf('edit:') === 0 }); });
try {
(S.modelos || []).forEach(function (mo) {
if (typeof mo.mid !== 'number' || mo.sintetico || mo.editor || !S.api) return;
var gen = lista.filter(function (e) { return e.uid.indexOf(mo.mid + ':') === 0 && PV.CLASSES_GENERICAS[PV._classeIfc(e.tipo)]; });
if (!gen.length) return;
if (!mo._camadasPds) mo._camadasPds = lerCamadasPds(mo.mid);
var tem = false; for (var k in mo._camadasPds) { tem = true; break; }
if (!tem) return;
gen.forEach(function (e) {
if (e.camada) return;
try { var ln = S.api.GetLine(mo.mid, parseInt(e.uid.split(':')[1], 10), false), rp = ln && ln.Representation && ln.Representation.value; if (rp != null && mo._camadasPds[rp]) e.camada = mo._camadasPds[rp]; } catch (_) {}
});
});
} catch (_) {}
var r = PV.caixaEdificacao(lista, { caixaCorte: cx });
var ativo = !!(r && r.caixa && r.criterio !== 'sem-entorno' && r.criterio !== 'vazio');
var cota = []; try { if (ativo || r.caixa) cota = PV.pavimentosPorCota(lista, r.caixa, r.exclusoes); } catch (_) { cota = []; }
edifCache = { sig: sig, sigR: sigR, r: r, ativo: ativo, cota: cota, caixaModelo: { min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] } };
return edifCache;
}
S._edificacao = function () { var c = edificacaoMedir(); return c ? c.r : null; };
S._edificacaoAtiva = function () { var c = edificacaoMedir(); return c && c.ativo ? c.r : null; };
S._edificacaoCota = function () { var c = edificacaoMedir(); return c ? c.cota : []; };
S._caixasDe = function (uids) {
var alvo = {}, out = {}, bm = new THREE.Box3(); (uids || []).forEach(function (u) { alvo[u] = 1; });
cadaMalha(function (m) {
var u = m.userData.expressID == null ? null : m.userData.mid + ':' + m.userData.expressID;
if (!u || !alvo[u] || !m.geometry || m.visible === false) return;
if (!m.geometry.boundingBox) { try { m.geometry.computeBoundingBox(); } catch (e) { return; } }
if (!m.geometry.boundingBox) return;
bm.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
if (bm.isEmpty()) return;
var o = out[u];
if (!o) out[u] = { min: [bm.min.x, bm.min.y, bm.min.z], max: [bm.max.x, bm.max.y, bm.max.z] };
else { for (var k = 0; k < 3; k++) { var a = ["x", "y", "z"][k]; if (bm.min[a] < o.min[k]) o.min[k] = bm.min[a]; if (bm.max[a] > o.max[k]) o.max[k] = bm.max[a]; } }
});
return out;
};
var ocultasGrp = new THREE.Group(), ocultasMat = null;
ocultasGrp.userData.marcador = true; scene.add(ocultasGrp);
S._linhasOcultas = function (uids, on) {
var alvo = null; if (uids && uids.length) { alvo = {}; uids.forEach(function (u) { alvo[u] = 1; }); }
if (!on) {
var tirados = {};
for (var i = ocultasGrp.children.length - 1; i >= 0; i--) {
var c = ocultasGrp.children[i], u0 = c.userData.uidOculta;
if (alvo && !alvo[u0]) continue;
tirados[u0] = 1; ocultasGrp.remove(c); try { c.geometry.dispose(); } catch (_) {}
}
return Object.keys(tirados).length;
}
if (!alvo) return 0;
S._linhasOcultas(uids, false);
if (!ocultasMat) ocultasMat = new THREE.LineDashedMaterial({ color: 0x1a6cb5, dashSize: 0.1, gapSize: 0.06, depthTest: false, transparent: true, opacity: 0.9 });
var feitos = {}, soma = 0;
ocultasGrp.children.forEach(function (c) { soma += c.geometry.attributes.position.count; });
S._linhasOcultasCortou = false;
cadaMalha(function (m) {
if (m.userData.expressID == null || !m.isMesh || !m.geometry || m.userData.marcador) return;
var u = m.userData.mid + ':' + m.userData.expressID; if (!alvo[u]) return;
var pa = m.geometry.attributes && m.geometry.attributes.position; if (!pa || pa.count > 60000) return;
var ar = arestasDe(m.geometry); if (!ar || !ar.length) return;
if (soma + ar.length / 3 > 400000) { S._linhasOcultasCortou = true; return; }
soma += ar.length / 3;
var bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(ar, 3));
var ln = new THREE.LineSegments(bg, ocultasMat); ln.computeLineDistances();
ln.matrixAutoUpdate = false; ln.matrix.copy(m.matrixWorld); ln.renderOrder = 998; ln.raycast = function () {}; ln.frustumCulled = false;
ln.userData.marcador = true; ln.userData.uidOculta = u;
ocultasGrp.add(ln); feitos[u] = 1;
});
return Object.keys(feitos).length;
};
S._linhasOcultasEstado = function () { var u = {}; ocultasGrp.children.forEach(function (c) { u[c.userData.uidOculta] = 1; }); return { uids: Object.keys(u), linhas: ocultasGrp.children.length, cortou: !!S._linhasOcultasCortou }; };
function cameraAtual() {
var alvo = (orbit && orbit.target) ? orbit.target : { x: 0, y: 0, z: 0 };
return {
pos: [camera.position.x, camera.position.y, camera.position.z],
alvo: [alvo.x, alvo.y, alvo.z],
up: [camera.up.x, camera.up.y, camera.up.z],
fov: camera.fov, orto: false
};
}
function corParaV3(h) {
var m = /^#?([0-9a-fA-F]{6})$/.exec(String(h || ''));
if (!m) return null;
var n = parseInt(m[1], 16);
return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function v3ParaCor(c) {
function h(x) { var t = Math.round(Math.max(0, Math.min(1, +x || 0)) * 255).toString(16); return t.length < 2 ? '0' + t : t; }
return '#' + h(c[0]) + h(c[1]) + h(c[2]);
}
function estadoVista() {
var fantasma = {};
if (xray.on) xray.ghosted.forEach(function (m) { fantasma[m.uuid] = 1; });
var porUid = {};
todasMalhas(function (m) {
if (m.userData.expressID == null) return;
if (ehFuturo4d(m) || ehRemovidoEd(m)) return;
var u = m.userData.mid + ':' + m.userData.expressID;
var r = porUid[u] || (porUid[u] = { vis: false, solido: false });
if (m.visible) { r.vis = true; if (!fantasma[m.uuid]) r.solido = true; }
});
var visiveis = [], ocultos = [], alvoRx = [], semChave = 0;
(S.elementos || []).forEach(function (e) {
var r = porUid[e.uid]; if (!r) return;
if (!e.chave) { if (!r.vis) semChave++; return; }
if (r.vis) visiveis.push(e.chave); else ocultos.push(e.chave);
if (xray.on && r.vis && r.solido) alvoRx.push(e.chave);
});
var BV = (typeof window !== 'undefined') ? window.BimVista : null;
var vis = BV ? BV.escolherVisibilidade(visiveis, ocultos) : { isolados: [], ocultos: ocultos };
var aparencias = [];
if (S._pintura) {
(S.elementos || []).forEach(function (e) {
var p = S._pintura[e.uid]; if (!p || !e.chave) return;
var obj = (typeof p === 'object');
var rgb = corParaV3(obj ? p.cor : p); if (!rgb) return;
aparencias.push({ chave: e.chave, cor: rgb, alpha: (obj && p.opacidade != null) ? +p.opacidade : 1 });
});
}
var fixados = [];
if (cota.on) {
var fx = cota.fixados || {};
(S.elementos || []).forEach(function (e) { if (fx[e.uid] && e.chave) fixados.push(e.chave); });
}
var slP = cortePanel.querySelector('[data-c="alt"]'), slL = corteLPanel.querySelector('[data-k="pos"]');
return {
completa: true,
camera: cameraAtual(),
cortes: {
planta: { on: !!planta.on, y: planta.plane ? planta.plane.constant : 0, frac: slP ? (+slP.value) / 1000 : 0.62 },
livre: { on: !!corteL.on, az: corteL.az, inc: corteL.inc, inv: !!corteL.inv, pos: slL ? (+slL.value) / 1000 : 0.5,
plano: [corteL.plane.normal.x, corteL.plane.normal.y, corteL.plane.normal.z, corteL.plane.constant] }
},
visibilidade: { isolados: vis.isolados, ocultos: vis.ocultos, raioX: !!(xray.on && alvoRx.length), raioXAlvo: alvoRx },
aparencias: aparencias,
modelos: S.modelos.map(function (mo) { return { arquivoId: mo.versaoId || '', modeloId: mo.modeloId || '', visivel: mo.visivel !== false, alpha: mo.alpha == null ? 1 : mo.alpha }; }),
estilo: (EST.fixo && estPrevia()) ? { desenho: !!estiloD.on, visual: EST.modo } : { desenho: !!estiloD.on },
medidas: medir.regs.map(function (r) { return { tipo: r.tipo, pts: r.pts.map(function (p) { return p.slice(); }), horizontal: !!r.horizontal }; }),
cotaRede: { on: !!cota.on, modo: cota.modo, fixados: fixados, chave: cota.chave || '' },
semChave: semChave
};
}
function aplicarVista(v, opts) {
if (!v) return { ok: false, erro: 'ponto de vista vazio' };
opts = opts || {};
var completa = v.completa === true;
var res = { ok: true, naoLocalizadas: [], completa: completa };
try {
var BV = (typeof window !== 'undefined') ? window.BimVista : null;
var r = BV ? BV.resolver(v, S.elementos || []) : null;
cancelTween();
limparMedidas();
if (cota.on) setCota(false);
cota.fixados = {}; cota.chave = null;
var cs = v.cortes || {}, cp = cs.planta || {}, cl = cs.livre || {};
var querP = !!cp.on, querL = !querP && !!cl.on;
if (planta.on && !querP) setPlanta(false);
if (corteL.on && !querL) setCorteL(false);
if (querP) {
if (!planta.on) setPlanta(true);
if (planta.on) {
var fr = (cp.frac != null) ? +cp.frac : ((planta.y1 - planta.y0) ? (+cp.y - planta.y0) / (planta.y1 - planta.y0) : 0.62);
if (!isFinite(fr)) fr = 0.62;
fr = Math.max(0, Math.min(1, fr));
var slP = cortePanel.querySelector('[data-c="alt"]'); if (slP) slP.value = Math.round(fr * 1000);
setAlturaCorte(fr);
}
}
if (querL) {
corteL.az = +cl.az || 0; corteL.inc = +cl.inc || 0; corteL.inv = !!cl.inv;
var elAz = corteLPanel.querySelector('[data-k="az"]'), elInc = corteLPanel.querySelector('[data-k="inc"]');
var elPos = corteLPanel.querySelector('[data-k="pos"]'), elInv = corteLPanel.querySelector('[data-k="inv"]');
if (elAz) elAz.value = corteL.az;
if (elInc) elInc.value = corteL.inc;
if (elPos) elPos.value = Math.round((cl.pos == null ? 0.5 : Math.max(0, Math.min(1, +cl.pos))) * 1000);
if (elInv) { elInv.style.background = corteL.inv ? corAtiva() : ''; elInv.style.color = corteL.inv ? '#fff' : ''; }
if (!corteL.on) setCorteL(true); else aplicarCorteL();
}
var querE = completa ? !!(v.estilo && v.estilo.desenho) : (planta.on && estiloD.on);
if (!!estiloD.on !== querE) setEstiloDesenho(querE);
if (completa && v.estilo && v.estilo.visual && estPrevia() && texMotor() && texMotor().estiloValido(v.estilo.visual) && v.estilo.visual !== EST.modo) estiloVisual(v.estilo.visual, { manterDesenho: true });
if (completa && Array.isArray(v.modelos)) {
S.modelos.forEach(function (mo) {
var reg = null, i;
for (i = 0; i < v.modelos.length && !reg; i++) if (v.modelos[i].arquivoId && v.modelos[i].arquivoId === mo.versaoId) reg = v.modelos[i];
for (i = 0; i < v.modelos.length && !reg; i++) if (v.modelos[i].modeloId && v.modelos[i].modeloId === mo.modeloId) reg = v.modelos[i];
var querVis = reg ? reg.visivel !== false : true;
var querA = (reg && reg.alpha != null) ? +reg.alpha : 1;
if ((mo.visivel !== false) !== querVis) setVisivel(mo.mid, querVis);
if (Math.abs((mo.alpha == null ? 1 : mo.alpha) - querA) > 0.001) setTransparencia(mo.mid, querA);
});
}
restaurarVisibilidade();
if (r) {
res.naoLocalizadas = r.naoLocalizadas;
if (r.isolados.length) isolarChaves(r.isolados);
else if (r.ocultos.length) {
var fora = {};
uidsDeChaves(r.ocultos).forEach(function (u) { fora[u] = 1; });
todasMalhas(function (m) {
if (m.userData.expressID == null) return;
if (fora[m.userData.mid + ':' + m.userData.expressID]) m.visible = false;
});
pav.isolado = null; pav.manual = true; pavRender();
}
}
if (r && r.aparencias.length) {
var mapa = {};
r.aparencias.forEach(function (a) {
var hx = v3ParaCor(a.cor);
mapa[a.chave] = (a.alpha != null && a.alpha < 0.999) ? { cor: hx, opacidade: a.alpha } : hx;
});
pintarChaves(mapa, 'vista');
} else if (S._pintura) limparPintura();
if (r && v.visibilidade && v.visibilidade.raioX && r.raioXAlvo.length) raioXChaves(r.raioXAlvo);
(v.medidas || []).forEach(function (m) {
var P = (m.pts || []).map(function (p) { return new THREE.Vector3(+p[0], +p[1], +p[2]); });
if (m.tipo === 'dist' && P.length === 2) desenharMedida(P[0], P[1], !!m.horizontal, m.eixo || '', m.mapa);
else if (m.tipo === 'area' && P.length >= 3) desenharArea(P, !!m.horizontal, m.mapa);
else if (m.tipo === 'ang' && P.length === 3) desenharAngulo(P[0], P[1], P[2], m.mapa);
});
if (v.cotaRede && v.cotaRede.on) {
setCota(true, v.cotaRede.modo || 'clicado');
if (cota.on) {
uidsDeChaves(r ? r.cotaFixados : []).forEach(function (u) { cota.fixados[u] = 1; });
cota.chave = v.cotaRede.chave || null;
cota.acum = cota.periodo;
}
}
cancelTween();
if (S._pararInercia) S._pararInercia();
var c = v.camera;
if (c && c.pos) {
camera.position.set(c.pos[0], c.pos[1], c.pos[2]);
if (c.up) camera.up.set(c.up[0], c.up[1], c.up[2]);
if (c.fov) { camera.fov = c.fov; camera.updateProjectionMatrix(); }
if (orbit && orbit.target && c.alvo) { orbit.target.set(c.alvo[0], c.alvo[1], c.alvo[2]); orbit.update(); }
camera.lookAt(c.alvo[0], c.alvo[1], c.alvo[2]);
}
mostrarMarcas(v.marcacoes || [], c && c.pos ? c : null);
S._hint('');
} catch (e) { return { ok: false, erro: String(e && e.message || e) }; }
return res;
}
S._cameraAtual = cameraAtual; S._aplicarVista = aplicarVista; S._estadoVista = estadoVista;
var SVGNS = 'http://www.w3.org/2000/svg';
var marcasSvg = document.createElementNS(SVGNS, 'svg');
marcasSvg.setAttribute('data-bim', 'marcas');
marcasSvg.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:6;display:none;overflow:visible';
host.appendChild(marcasSvg); S.marcasSvg = marcasSvg;
var _marcas = null, _mkV1 = new THREE.Vector3(), _mkV2 = new THREE.Vector3();
function svgEl(tag, at) { var e = document.createElementNS(SVGNS, tag); for (var k in at) if (Object.prototype.hasOwnProperty.call(at, k)) e.setAttribute(k, at[k]); return e; }
function desenharMarcas(svg, lista, w, h) {
while (svg.firstChild) svg.removeChild(svg.firstChild);
svg.setAttribute('width', w); svg.setAttribute('height', h); svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
(lista || []).forEach(function (m) {
if (!m || !m.pts || !m.pts.length) return;
var cor = /^#[0-9a-fA-F]{6}$/.test(m.cor || '') ? m.cor : '#e11d48';
var P = m.pts.map(function (q) { return [q[0] * w, q[1] * h]; });
var traco = { stroke: cor, 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
if (m.tipo === 'livre' && P.length > 1) { traco.points = P.map(function (q) { return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' '); svg.appendChild(svgEl('polyline', traco)); }
else if ((m.tipo === 'linha' || m.tipo === 'seta') && P.length > 1) {
svg.appendChild(svgEl('line', { x1: P[0][0], y1: P[0][1], x2: P[1][0], y2: P[1][1], stroke: cor, 'stroke-width': 4, 'stroke-linecap': 'round' }));
if (m.tipo === 'seta') {
var ang = Math.atan2(P[1][1] - P[0][1], P[1][0] - P[0][0]), L = 16;
var a1 = [P[1][0] - L * Math.cos(ang - 0.45), P[1][1] - L * Math.sin(ang - 0.45)], a2 = [P[1][0] - L * Math.cos(ang + 0.45), P[1][1] - L * Math.sin(ang + 0.45)];
svg.appendChild(svgEl('polygon', { points: P[1].join(',') + ' ' + a1.join(',') + ' ' + a2.join(','), fill: cor }));
}
} else if ((m.tipo === 'retangulo' || m.tipo === 'nuvem') && P.length > 1) {
var x = Math.min(P[0][0], P[1][0]), y = Math.min(P[0][1], P[1][1]), rw = Math.abs(P[1][0] - P[0][0]), rh = Math.abs(P[1][1] - P[0][1]);
if (m.tipo === 'retangulo') svg.appendChild(svgEl('rect', { x: x, y: y, width: rw, height: rh, stroke: cor, 'stroke-width': 4, fill: 'none' }));
else svg.appendChild(svgEl('ellipse', { cx: x + rw / 2, cy: y + rh / 2, rx: rw / 2, ry: rh / 2, stroke: cor, 'stroke-width': 4, fill: 'none', 'stroke-dasharray': '10 6' }));
} else if (m.tipo === 'texto' && m.texto) {
var tx = svgEl('text', { x: P[0][0], y: P[0][1], fill: cor, 'font-size': 16, 'font-weight': 700, 'font-family': 'Inter,system-ui,sans-serif', 'paint-order': 'stroke', stroke: '#fff', 'stroke-width': 3 });
tx.textContent = String(m.texto);
svg.appendChild(tx);
}
});
}
S._desenharMarcas = desenharMarcas;
function mostrarMarcas(lista, cam) {
if (!lista || !lista.length) { _marcas = null; marcasSvg.style.display = 'none'; return false; }
var c = cam || cameraAtual();
_marcas = { lista: lista, cam: { pos: c.pos.slice(), alvo: c.alvo.slice() }, w: 0, h: 0 };
return true;
}
S._mostrarMarcas = mostrarMarcas;
S._tickExtra.push(function () {
if (!_marcas) { if (marcasSvg.style.display !== 'none') marcasSvg.style.display = 'none'; return; }
var c = _marcas.cam, dist = camera.position.distanceTo(orbit.target);
var d = camera.position.distanceTo(_mkV1.set(c.pos[0], c.pos[1], c.pos[2])) + orbit.target.distanceTo(_mkV2.set(c.alvo[0], c.alvo[1], c.alvo[2]));
if (d > Math.max(1e-4, dist * 1e-3)) { _marcas = null; marcasSvg.style.display = 'none'; return; }
var rc = canvasEl.getBoundingClientRect(), hr = ((S && S.host) || host).getBoundingClientRect();
if (_marcas.w !== rc.width || _marcas.h !== rc.height) {
_marcas.w = rc.width; _marcas.h = rc.height;
marcasSvg.style.left = (rc.left - hr.left) + 'px'; marcasSvg.style.top = (rc.top - hr.top) + 'px';
marcasSvg.style.width = rc.width + 'px'; marcasSvg.style.height = rc.height + 'px';
desenharMarcas(marcasSvg, _marcas.lista, rc.width, rc.height);
}
if (marcasSvg.style.display === 'none') marcasSvg.style.display = 'block';
});
var catCor = { on: false, ocultas: {}, porUid: {}, mats: {}, cx: null, esc: [], nOc: 0 };
var instVista = { on: false, mats: {} };
var INST_FUNDO = /^IFC(WALL|SLAB|COVERING|ROOF|BEAM|COLUMN|FOOTING|PILE|STAIR|RAMP|RAILING|DOOR|WINDOW|MEMBER|PLATE|CURTAINWALL|FURNISHINGELEMENT|BUILDINGELEMENTPART|GEOGRAPHICELEMENT)/;
function instVistaFundo(m) { var t = m && m.userData ? String(m.userData.tipo || '').toUpperCase() : ''; return !!t && INST_FUNDO.test(t); }
function instVistaMat(alpha) {
var op = Math.round(Math.max(0.05, Math.min(1, 0.2 * (alpha == null ? 1 : alpha))) * 100) / 100, k = op.toFixed(2);
if (!instVista.mats[k]) { instVista.mats[k] = new THREE.MeshStandardMaterial({ color: 0xa4abb3, roughness: 0.9, metalness: 0, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide }); instVista.mats[k].name = 'vista-instalacoes'; }
return instVista.mats[k];
}
function setVistaInst(on) {
on = !!on; if (on === instVista.on) return instVista.on;
instVista.on = on;
S.modelos.forEach(function (mo) { refreshModelo(mo); });
if (S.selected) S.prevMat = matBase(S.selected);
try { window.dispatchEvent(new CustomEvent('bim:vista-instalacoes', { detail: { on: on } })); } catch (_) {}
return instVista.on;
}
S._setVistaInst = setVistaInst;
S._vistaInstOn = function () { return !!instVista.on; };
S._vistaInstFundo = instVistaFundo;
function catMotor() { return (typeof window !== 'undefined' && window.BimCoresCat) ? window.BimCoresCat : null; }
function catCaixas() {
var est = S.edit && S.edit.estado; if (!est || !est.caixas) return null;
if (!catCor.cx || catCor.cx.est !== est || catCor.cx.n !== est.caixas.length) {
var mp = {}; est.caixas.forEach(function (c) { mp[c.id] = c; });
catCor.cx = { est: est, n: est.caixas.length, map: mp, pt: catMotor() ? catMotor().tiposDePronta(est.caixas) : {} };
}
return catCor.cx.map;
}
function catElemento(mo, id) {
var ix = mo._catIdx, L = mo.elementos || [];
if (!ix || ix.n !== L.length) { ix = { n: L.length, m: {} }; L.forEach(function (e) { ix.m[e.id] = e; }); mo._catIdx = ix; }
return ix.m[id];
}
function catDeMalha(m) {
var CC = catMotor(); if (!CC || !m || !m.userData || m.userData.expressID == null) return null;
var mid = m.userData.mid, mo = modeloDe(mid), id = m.userData.expressID, uid = mid + ':' + id;
var k = catCor.porUid[uid]; if (k) return k;
var d = null, e = mo ? catElemento(mo, id) : null;
if (mid === 'edit') { var cx = catCaixas(), c = cx ? cx[id] : null; if (c) { d = CC.descritorDeCaixa(c, { prontaTipos: catCor.cx && catCor.cx.pt }); if (!d.nome && e) d.nome = e.nome; } }
if (!d) {
var ex = {};
if (e && e.familia && e.familia.famId && S._famCat) ex.famCat = S._famCat(e.familia.famId);
if (e && mid === 'edit' && !e.familia && /^(hidraulica|eletrica)$/.test(e.disciplina || '')) ex.instalacao = true;
d = CC.descritorDeElemento(e || { tipo: m.userData.tipo, nome: '' }, ex);
if (!e) d.ifc = m.userData.tipo;
}
k = CC.categoria(d); catCor.porUid[uid] = k;
return k;
}
function catMat(cat, alpha) {
var CC = catMotor(), cor = CC ? CC.corDe(cat) : '#8e959c';
var op = Math.round((alpha == null ? 1 : Math.max(0.05, Math.min(1, alpha))) / 0.05) * 0.05, transp = op < 0.985;
var key = cat + '@' + op.toFixed(2) + '@' + cor;
if (!catCor.mats[key]) catCor.mats[key] = new THREE.MeshStandardMaterial({ color: new THREE.Color(cor), roughness: 0.7, metalness: 0.02, transparent: transp, opacity: op, depthWrite: !transp, side: THREE.DoubleSide });
return catCor.mats[key];
}
catCor.lin = {}; catCor.palVer = 0;
function catCorLinear(m) {
var k = catDeMalha(m), CC = catMotor(); if (!k || !CC) return null;
var hex = CC.corDe(k), c = catCor.lin[hex] || (catCor.lin[hex] = new THREE.Color(hex)), mo = modeloDe(m.userData.mid);
return [c.r, c.g, c.b, mo ? mo.alpha : 1];
}
function catAjustarVista(v) {
var cfg = v.catCfg || null, quer = !!(cfg && cfg.on), oc = (cfg && cfg.ocultas) || {};
var sigOc = Object.keys(oc).filter(function (k) { return oc[k]; }).sort().join(',');
var sigCena = catCor.on ? Object.keys(catCor.ocultas).filter(function (k) { return catCor.ocultas[k]; }).sort().join(',') : '';
var precisa = quer !== !!catCor.on || sigOc !== sigCena;
var est = v.est;
if (!est) {
if (!precisa) return;
est = v.est = { isolados: null, ocultos: null, cores: {}, rx: null, ver: ++_estSeq, catAuto: true }; v.cache = {};
} else if (!precisa && est.catAuto) { v.est = null; v.cache = {}; return; }
var sig = (quer ? 1 : 0) + '|' + sigOc + '|' + (catCor.on ? 1 : 0) + '|' + catCor.palVer;
if (est.catSig === sig) return;
est.catSig = sig; est.catOn = quer; est.catOc = sigOc ? oc : null; est.ver = ++_estSeq;
}
S._catVista = function (id, on, ocultas) {
var v = S.vistas[id]; if (!v) return false;
var oc = {}; Object.keys(ocultas || {}).forEach(function (k) { if (ocultas[k]) oc[k] = 1; });
v.catCfg = (on || Object.keys(oc).length) ? { on: !!on, ocultas: oc } : null;
try { catAjustarVista(v); } catch (_) {}
return true;
};
S._catVistaEst = function (id) { var v = S.vistas[id]; return v ? { cfg: v.catCfg || null, estado: !!v.est, auto: !!(v.est && v.est.catAuto), catOn: !!(v.est && v.est.catOn) } : null; };
function catAplicarOcultas() {
var lista = [], tem = false; Object.keys(catCor.ocultas).forEach(function (k) { if (catCor.ocultas[k]) tem = true; });
todasMalhas(function (m) {
if (!m.isMesh || m.userData.expressID == null) return;
var oc = false;
if (catCor.on && tem) { var k = catDeMalha(m); oc = !!(k && catCor.ocultas[k]); }
if (oc) { m.userData._catOc = 1; if (m.visible !== false) m.visible = false; lista.push(m); }
else if (m.userData._catOc) { delete m.userData._catOc; if (!ehFuturo4d(m) && !ehRemovidoEd(m)) m.visible = true; }
});
catCor.esc = lista; catCor.nOc = lista.length;
return lista.length;
}
S._tickExtra.push(function () {
var L = catCor.esc; if (!L.length || !catCor.on) return;
for (var i = 0; i < L.length; i++) if (L[i].visible !== false) L[i].visible = false;
});
function catRepintarBase() {
S.modelos.forEach(function (mo) { refreshModelo(mo); });
if (S.selected) S.prevMat = matBase(S.selected);
if (S._reaplicarEstilo) S._reaplicarEstilo();
}
function catAvisar() { try { window.dispatchEvent(new CustomEvent('bim:cores-cat', { detail: { on: catCor.on } })); } catch (_) {} }
function setCoresCat(on) {
on = !!on;
if (on && !catMotor()) return false;
if (on === catCor.on) return catCor.on;
if (on) {
if (sisColor.on) setSisColor(false);
if (S._estiloOn && S._estiloOn() && S._setEstiloDesenho) S._setEstiloDesenho(false);
catCor.porUid = {}; catCor.cx = null;
}
catCor.on = on;
catRepintarBase();
catAplicarOcultas();
catAvisar();
return catCor.on;
}
S._setCoresCat = setCoresCat;
S._coresCatOn = function () { return !!catCor.on; };
S._catDeUid = function (uid, tipo) {
var m = S.meshPorUid && S.meshPorUid[uid];
if (m) return catDeMalha(m);
var CC = catMotor(); return CC ? CC.categoria({ ifc: tipo }) : null;
};
S._catOcultas = function (mapa) {
if (mapa !== undefined) { catCor.ocultas = {}; Object.keys(mapa || {}).forEach(function (k) { if (mapa[k]) catCor.ocultas[k] = 1; }); catAplicarOcultas(); }
var o = {}; Object.keys(catCor.ocultas).forEach(function (k) { o[k] = 1; }); return o;
};
S._catRepintar = function () { catCor.palVer++; if (catCor.on) catRepintarBase(); };
S._catInfo = function () {
var cont = {}, vistos = {};
S.modelos.forEach(function (mo) {
if (!mo.visivel) return;
mo.grupo.children.forEach(function (m) {
if (!m.isMesh || m.userData.expressID == null) return;
var uid = mo.mid + ':' + m.userData.expressID; if (vistos[uid]) return; vistos[uid] = 1;
if (ehRemovidoEd(m)) return;
var k = catDeMalha(m); if (k) cont[k] = (cont[k] || 0) + 1;
});
});
return { on: !!catCor.on, contagem: cont, ocultas: S._catOcultas(), escondidas: catCor.nOc, pecas: Object.keys(vistos).length };
};
S._reaplicarCoresCat = function () {
catCor.porUid = {}; catCor.cx = null;
if (catCor.on) { catRepintarBase(); catAplicarOcultas(); }
else if (instVista.on) S.modelos.forEach(function (mo) { refreshModelo(mo); });
try { window.dispatchEvent(new CustomEvent('bim:modelos', { detail: { cores: catCor.on } })); } catch (_) {}
};
function matBase(m) {
if (S._pintura) {
var _cp = S._pintura[m.userData.mid + ':' + m.userData.expressID];
if (_cp) {
var _moP = modeloDe(m.userData.mid);
if (typeof _cp === 'object' && _cp) {
var _aM = (_moP ? _moP.alpha : 1);
var _aP = (_cp.opacidade == null ? 1 : _cp.opacidade);
return corMat(_cp.cor, Math.min(_aM, _aP));
}
return corMat(_cp, _moP ? _moP.alpha : 1);
}
}
if (instVista.on && instVistaFundo(m)) { var _moV = modeloDe(m.userData.mid); return instVistaMat(_moV ? _moV.alpha : 1); }
if (instVista.on && m.userData.agua && S._aguaMat) return S._aguaMat(true);
if (instVista.on && m.userData.piscFundo) { var _moP2 = modeloDe(m.userData.mid); return instVistaMat(_moP2 ? _moP2.alpha : 1); }
if (catCor.on) { var _kc = catDeMalha(m); if (_kc) { var _moC = modeloDe(m.userData.mid); return catMat(_kc, _moC ? _moC.alpha : 1); } }
if (sisColor.on) { var _moS = modeloDe(m.userData.mid); return sisMat(m.userData._sisK || 'outros', _moS ? _moS.alpha : 1); }
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
if (m.material === S.matAndamento) return;
if (xray.on && xray.ghosted.indexOf(m) !== -1) return;
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
if (opts.onLoaded) opts.onLoaded(elementosVivos());
}
var _hudUltimo = 0, _hudVis = -1;
function atualizarHud() {
var el = 0, tri = 0;
S.modelos.forEach(function (mo) { el += mo.nEl || 0; tri += mo.nTri || 0; });
var nv = el ? contarVisiveis() : 0;
_hudVis = nv;
var cortado = (renderer.clippingPlanes || []).length > 0;
var elBox = hud.querySelector('[data-h="el"]');
elBox.textContent = (nv < el ? nv.toLocaleString('pt-BR') + ' de ' + el.toLocaleString('pt-BR') : el.toLocaleString('pt-BR'));
elBox.title = nv < el
? 'A cena está mostrando ' + nv.toLocaleString('pt-BR') + ' de ' + el.toLocaleString('pt-BR') +
' elementos. Escondem peça: a simulação 4D, o isolamento por pavimento, o isolamento manual, um conjunto de seleção, a fase "existente" de reforma e as remoções do editor. O botão ↺ restaura.'
: (cortado ? 'Todos os elementos estão na cena, mas há um corte ativo: parte da geometria não aparece.' : 'Todos os elementos do modelo estão na cena.');
hud.querySelector('[data-h="tri"]').textContent = Math.round(tri).toLocaleString('pt-BR');
var _cb = S._onContadores || (S.opts && S.opts.onVisibilidade);
if (_cb) { try { _cb(nv, el); } catch (e) {} }
}
var _hudMalhas = -1, _hudConferido = 0;
S._tickExtra.push(function () {
var ag = Date.now();
if (ag - _hudUltimo < 500) return;
_hudUltimo = ag;
if (!S.modelos.length) return;
var mv = contarMalhasVisiveis();
if (mv !== _hudMalhas) { _hudMalhas = mv; _hudConferido = ag; atualizarHud(); return; }
if (ag - _hudConferido < 2000) return;
_hudConferido = ag;
if (contarVisiveis() !== _hudVis) atualizarHud();
});
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
desagregarModelo(mo);
if (S._setCota && S._cotaEstado && S._cotaEstado().on) S._setCota(false);
S.modelos.splice(S.modelos.indexOf(mo), 1);
mo.grupo.children.slice().forEach(function (m) { if (m.geometry) { try { m.geometry.dispose(); } catch (_) {} } if (m.userData && m.userData._edgeLn && m.userData._edgeLn.geometry) { try { m.userData._edgeLn.geometry.dispose(); } catch (_) {} } });
Object.keys(mo.matCache).forEach(function (k) { try { mo.matCache[k].dispose(); } catch (_) {} });
Object.keys(mo.transCache).forEach(function (k) { try { mo.transCache[k].dispose(); } catch (_) {} });
modelRoot.remove(mo.grupo);
if (typeof mid === 'number') { try { S.api.CloseModel(mid); } catch (_) {} }
if (S.selected && S.selected.userData.mid === mid) { S.selected = null; S.prevMat = null; if (S._contornoSelecao) S._contornoSelecao(null); }
if (S._limparRaioX) S._limparRaioX();
S._clashSel = (S._clashSel || []).filter(function (m) { return m.userData.mid !== mid; });
rebuildIndices(); atualizarHud(); notifyModelos();
if (S._limparMedidas) S._limparMedidas();
if (S._ctecCancelar) S._ctecCancelar();
if (!S.modelos.length && S.planta && S.planta.on && S._setPlanta) S._setPlanta(false);
else if (S.planta && S.planta.on && S._replanejarCorte) S._replanejarCorte();
if (S.corteL && S.corteL.on && S._aplicarCorteL) S._aplicarCorteL();
if (S._xrReSnap) S._xrReSnap();
if (pav.isolado || pav.manual) restaurarVisibilidade(); else pavRender();
if (mid === 'edit' && S._editReset) S._editReset();
if (opts.onLoaded) opts.onLoaded(elementosVivos());
if (S._cristalFechouTudo) S._cristalFechouTudo();
if (!S.modelos.length && S._texLiberar) S._texLiberar();
if (!S.modelos.length) { over.style.display = 'flex'; limparSisMatCache(); }
}
function limparTudo() {
if (S.planta && S.planta.on && S._setPlanta) S._setPlanta(false);
if (S.corteL && S.corteL.on && S._setCorteL) S._setCorteL(false);
if (S._ctecCancelar) S._ctecCancelar();
if (S._limparMedidas) S._limparMedidas();
if (S._setCota) S._setCota(false);
var indoEmbora = S.modelos.map(function (mo) { return { mid: mo.mid, modeloId: mo.modeloId || '', arquivoId: mo.versaoId || '', sintetico: !!mo.sintetico }; });
S.modelos.slice().forEach(function (mo) { removerModelo(mo.mid); });
if (S.opts && S.opts.onModelosRemovidos) { try { S.opts.onModelosRemovidos(indoEmbora); } catch (_) {} }
if (S._editReset) S._editReset();
S.carimbos = {}; S.qto = {}; S._fut4d = null; S._remEd = null;
try { limparContorno4D(); } catch (_c4) {}
S._pintura = null; S._and4d = null;
pav.isolado = null; pav.manual = false; pavRender();
}
S._setTransparencia = setTransparencia; S._setVisivel = setVisivel; S._setDisciplina = setDisciplina;
S._carimbarConsulta = carimbarConsulta; S._valoresDe = valoresDe;
S._removerModelo = removerModelo; S._limparTudo = limparTudo;
async function carregarIFC(arrayBuffer, nome, disc, ehExemplo) {
if (S !== Sm || !S.alive) return;
over.style.display = 'none'; loading.style.display = 'flex';
if (S._cristalEvento) S._cristalEvento('carregar');
loading.querySelector('[data-l="txt"]').textContent = 'Lendo ' + (nome || 'IFC') + '…';
if (S.modelos.length >= 8) { loading.style.display = 'none'; over.style.display = S.modelos.length ? 'none' : 'flex'; if (S._cristalEvento) S._cristalEvento('falhou'); try { alert('Limite de 8 modelos abertos ao mesmo tempo. Remova um antes de abrir outro (memória de vídeo).'); } catch (_) {} return; }
var mid;
try {
await initApi();
if (S !== Sm || !S.alive) return;
var data = new Uint8Array(arrayBuffer);
mid = S.api.OpenModel(data);
S.modelID = mid;
var modelo = { mid: mid, nome: nome || ('Modelo ' + (S.modelos.length + 1)), disciplina: disc || '', alpha: 1, visivel: true, grupo: new THREE.Group(), matCache: {}, transCache: {}, elementos: [], tipos: {}, nEl: 0, nTri: 0 };
modelo._bytes = data;
modelo.versaoId = (typeof window !== 'undefined' && window.BimId) ? window.BimId.versaoId(data, data.length) : '';
modelo.modeloId = idModelo(modelo.nome, modelo.versaoId);
modelo.grupo.userData.mid = mid;
modelRoot.add(modelo.grupo);
var carimbos = lerCarimbosOrcaPro(mid), qto = lerQuantitativos(mid);
modelo.carimbos = carimbos; modelo.qto = qto;
modelo.familias = lerTipos(mid);
modelo.sistemas = lerSistemas(mid);
var materiais = lerMateriais(mid);
modelo.pavimentos = lerPavimentos(mid);
var tmpMat = new THREE.Matrix4();
var getMat = criarGetMat(modelo);
var colG = [], colI = [], colVistos = {}, colBytes = 0, colOk = !!(typeof window !== 'undefined' && window.BimCache);
S.api.StreamAllMeshes(mid, function (mesh) {
var geos = mesh.geometries, n = geos.size(), tipoNum = 0;
try { tipoNum = S.api.GetLineType(mid, mesh.expressID); } catch (_) {}
var tipoNome = nomeTipo(tipoNum);
var tKey = String(tipoNome).toUpperCase(); modelo.tipos[tKey] = (modelo.tipos[tKey] || 0) + 1;
var famT = (modelo.familias && modelo.familias[mesh.expressID]) || null;
var matsEl = materiais[mesh.expressID] || (famT && famT.tipoId != null && materiais[famT.tipoId]) || null;
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
var c = pg.color, m = new THREE.Mesh(bg, getMat(c.x, c.y, c.z, c.w, texDe(matsEl, c.w)));
tmpMat.fromArray(pg.flatTransformation); m.applyMatrix4(tmpMat);
m.userData.expressID = mesh.expressID; m.userData.tipo = tipoNome; m.userData.mid = mid; m.userData.matOrig = m.material;
modelo.grupo.add(m);
S.meshPorId[mesh.expressID] = m; S.meshPorUid[mid + ':' + mesh.expressID] = m;
if (colOk) {
var gK = String(pg.geometryExpressID);
if (!colVistos[gK]) {
colBytes += pos.byteLength + nor.byteLength + idx.byteLength;
if (colBytes > TETO_COLETA) { colOk = false; colG = []; colI = []; colVistos = {}; }
else { colVistos[gK] = 1; colG.push({ gid: gK, pos: pos, nor: nor, idx: idx }); }
}
if (colOk) colI.push({ e: mesh.expressID, gid: gK, m: new Float64Array(pg.flatTransformation), cor: new Float32Array([c.x, c.y, c.z, c.w]) });
}
modelo.nTri += idx.length / 3; geo.delete();
}
var cb = carimbos[mesh.expressID] || {};
var famEl = (modelo.familias && modelo.familias[mesh.expressID]) || null;
var idIfc = lerIdentidadeIfc(S.api, mid, mesh.expressID);
var idB = idElemento(modelo.modeloId, { id: mesh.expressID, globalId: idIfc.globalId });
var dM = descricaoDeMercado(idIfc, famEl, cb);
modelo.elementos.push({ globalId: idB.globalId, chave: idB.chave, chaveInstavel: idB.instavel, nomeIfc: idIfc.nomeIfc, tag: idIfc.tag, id: mesh.expressID, uid: mid + ':' + mesh.expressID, mid: mid, arquivo: modelo.nome, tipo: tipoNome, nome: rotuloDisciplina(tipoNome), familia: famEl ? famEl.familia : null, descricao: dM.descricao, descricaoFonte: dM.fonte, sistemaIfc: (modelo.sistemas && modelo.sistemas[mesh.expressID]) || '', etapa: cb.etapa || null, codOrc: cb.codOrc || null, fase: cb.fase || null, tarefa: cb.tarefa || null, disciplinaPeca: cb.disciplinaPeca || null, detalhe: cb.detalhe || null, montagem: cb.montagem || null, folhas: cb.folhas || null, materiais: materiais[mesh.expressID] || (famEl && famEl.tipoId != null && materiais[famEl.tipoId]) || null, qto: (qto && qto[mesh.expressID]) || null });
modelo.nEl++;
});
modelo.disciplina = String(disc || '') || detectarDisciplina(modelo.nome, modelo.tipos);
modelo.elementos.forEach(function (e) { e.disciplina = modelo.disciplina; });
modelo._coleta = colOk ? { geometrias: colG, instancias: colI, bytes: colBytes } : null;
modelo.exemplo = !!ehExemplo;
try { if (arrayBuffer && arrayBuffer.byteLength <= 80 * 1024 * 1024) modelo._fonteIfc = arrayBuffer; } catch (eFo) {}
modelo._semCache = colOk ? '' : (colBytes > TETO_COLETA
? 'a geometria deste modelo passa de ' + Math.round(TETO_COLETA / (1024 * 1024)) + ' MB — ele abre normalmente, mas não fica guardado para reabrir rápido'
: 'o motor de cache não carregou nesta sessão');
S.modelos.push(modelo);
recarimbarIdentidade();
agregarModelo(modelo);
carimbarConsulta();
atualizarHud();
if (planta.on) setPlanta(false);
if (corteL.on) setCorteL(false);
enquadrar(); loading.style.display = 'none';
if (S._cristalModeloPronto) S._cristalModeloPronto(modelo);
try {
modelRoot.updateMatrixWorld(true);
var caixas = {};
modelo.grupo.children.forEach(function (m) {
var id = m.userData && m.userData.expressID; if (id == null) return;
var bb = new THREE.Box3().setFromObject(m); if (bb.isEmpty()) return;
if (!caixas[id]) caixas[id] = bb; else caixas[id].union(bb);
});
modelo.elementos.forEach(function (elx) { var bb = caixas[elx.id]; if (bb) elx.aabb = { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] }; });
(modelo.pavimentos || []).forEach(function (pv) {
var y0 = Infinity;
pv.eids.forEach(function (eid) { var bb = caixas[eid]; if (bb && bb.min.y < y0) y0 = bb.min.y; });
if (isFinite(y0)) pv.y0 = y0;
});
} catch (_) {}
S.elementos = []; S.modelos.forEach(function (mo) { S.elementos = S.elementos.concat(mo.elementos); });
if (pav.isolado || pav.manual) restaurarVisibilidade(); else pavRender();
if (S._editReaplicarRem) S._editReaplicarRem();
notifyModelos();
avisarModeloCarregado(modelo);
texAuto();
if (opts.onLoaded) opts.onLoaded(elementosVivos());
} catch (err) {
try { if (mid != null && mid !== -1) S.api.CloseModel(mid); } catch (_) {}
try { if (typeof modelo !== 'undefined' && modelo && S.modelos.indexOf(modelo) === -1) { (modelo.grupo.children || []).forEach(function (m) { if (m.geometry) { try { m.geometry.dispose(); } catch (_) {} } }); Object.keys(modelo.matCache || {}).forEach(function (k) { try { modelo.matCache[k].dispose(); } catch (_) {} }); modelRoot.remove(modelo.grupo); } } catch (_) {}
try { rebuildIndices(); } catch (_) {}
loading.style.display = 'none'; if (!S.modelos.length) over.style.display = 'flex';
if (S._cristalEvento) S._cristalEvento('falhou');
over.querySelector('div').innerHTML = '<div style="font-size:30px">' + (typeof Icones !== 'undefined' ? Icones.get('alerta', 15) : '') + '</div><h3 style="margin:8px 0">Não consegui ler este IFC</h3><p style="color:#a9c1d8;font-size:13px">' + esc(String(err && err.message || err)) + '</p><p style="color:#a9c1d8;font-size:12px">Confira se é um .ifc válido (IFC2x3 ou IFC4).</p>';
}
}
function rotuloDisciplina(ifcName) { var u = String(ifcName).toUpperCase(); return TIPOS[u] || String(ifcName).replace(/^IFC/, ''); }
function texDe(mats, alfa) {
if (typeof window === 'undefined' || !window.BimTextura) return null;
var o = { alfa: alfa };
if (estPrevia()) { o.dic = 'v2'; o.trocas = estTrocas(); }
var e = window.BimTextura.escolher(mats, o);
return (e.slug || e.classe) ? e : null;
}
function criarGetMat(modelo) {
return function (r, g, b, a, tex) {
var k = (r * 255 | 0) + '_' + (g * 255 | 0) + '_' + (b * 255 | 0) + '_' + a.toFixed(2) + (tex ? '|' + window.BimTextura.chave(tex) : '');
if (!modelo.matCache[k]) {
modelo.matCache[k] = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace), transparent: a < 1, opacity: a, metalness: .05, roughness: .85, side: THREE.DoubleSide });
if (tex) { modelo.matCache[k].userData.tex = tex; modelo.matCache[k].userData.corIfc = [r, g, b]; }
modelo.matCache[k].userData.corLin = modelo.matCache[k].color.clone();
modelo.matCache[k].userData.rgba = [r, g, b, a];
}
return modelo.matCache[k];
};
}
function montarDoCache(reg, estado) {
estado = estado || {};
if (!S || !S.alive) return { ok: false, erro: 'visualizador não está montado' };
if (typeof window === 'undefined' || !window.BimCache) return { ok: false, erro: 'motor de cache não carregado' };
if (S.modelos.length >= 8) return { ok: false, erro: 'Limite de 8 modelos abertos ao mesmo tempo.' };
var mid = 'cache' + (++cacheSeq);
var r = BimCache.paraCena(reg, mid);
if (!r.ok) return { ok: false, erro: r.erro };
var c = r.modelo;
var nomeDaObra = String(estado.nome || '') || c.nome;
var modelo = {
mid: mid, doCache: true, nome: nomeDaObra,
disciplina: '', alpha: 1, visivel: true,
grupo: new THREE.Group(), matCache: {}, transCache: {},
elementos: c.elementos, tipos: c.tipos, nEl: c.nEl, nTri: 0,
versaoId: c.arquivoId, modeloId: '',
carimbos: c.carimbos, qto: c.qto, familias: c.familias, sistemas: c.sistemas,
pavimentos: c.pavimentos, topologia: c.topologia, bitolas: c.bitolas,
fatorLenCache: c.fatorLen, bytesArquivo: c.bytesArquivo, convertidoEm: c.criadoEm
};
modelo.grupo.userData.mid = mid;
modelRoot.add(modelo.grupo);
var getMat = criarGetMat(modelo);
var tmpM = new THREE.Matrix4();
var tipoPorId = {}, matsPorId = {};
for (var t = 0; t < c.elementos.length; t++) { tipoPorId[c.elementos[t].id] = c.elementos[t].tipo; matsPorId[c.elementos[t].id] = c.elementos[t].materiais || null; c.elementos[t].arquivo = nomeDaObra; }
for (var i = 0; i < c.instancias.length; i++) {
var it = c.instancias[i];
var g = c.geometrias[it.g]; if (!g) continue;
var bg = new THREE.BufferGeometry();
bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(g.pos), 3));
bg.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(g.nor), 3));
bg.setIndex(new THREE.BufferAttribute(new Uint32Array(g.idx), 1));
var cor = it.cor || [1, 1, 1, 1];
var m = new THREE.Mesh(bg, getMat(cor[0], cor[1], cor[2], cor[3], texDe(matsPorId[it.e], cor[3])));
tmpM.fromArray(it.m); m.applyMatrix4(tmpM);
m.userData.expressID = it.e; m.userData.tipo = tipoPorId[it.e] || ''; m.userData.mid = mid; m.userData.matOrig = m.material;
modelo.grupo.add(m);
S.meshPorId[it.e] = m; S.meshPorUid[mid + ':' + it.e] = m;
modelo.nTri += g.idx.length / 3;
}
modelo.disciplina = String(estado.disciplina || '') || detectarDisciplina(modelo.nome, modelo.tipos);
modelo.elementos.forEach(function (e) { e.disciplina = modelo.disciplina; });
S.modelos.push(modelo);
recarimbarIdentidade();
agregarModelo(modelo);
carimbarConsulta();
atualizarHud();
if (planta.on) setPlanta(false);
if (corteL.on) setCorteL(false);
enquadrar(); over.style.display = 'none'; loading.style.display = 'none';
if (S._cristalModeloPronto) S._cristalModeloPronto(modelo);
try {
modelRoot.updateMatrixWorld(true);
var caixas = {};
modelo.grupo.children.forEach(function (mm) {
var id = mm.userData && mm.userData.expressID; if (id == null) return;
var bb = new THREE.Box3().setFromObject(mm); if (bb.isEmpty()) return;
if (!caixas[id]) caixas[id] = bb; else caixas[id].union(bb);
});
modelo.elementos.forEach(function (elx) { var bb = caixas[elx.id]; if (bb) elx.aabb = { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] }; });
(modelo.pavimentos || []).forEach(function (pv) {
var y0 = Infinity;
(pv.eids || []).forEach(function (eid2) { var bb2 = caixas[eid2]; if (bb2 && bb2.min.y < y0) y0 = bb2.min.y; });
if (isFinite(y0)) pv.y0 = y0;
});
} catch (_) {}
S.elementos = []; S.modelos.forEach(function (mo) { S.elementos = S.elementos.concat(mo.elementos); });
if (pav.isolado || pav.manual) restaurarVisibilidade(); else pavRender();
if (S._editReaplicarRem) S._editReaplicarRem();
if (estado.visivel === false && S._setVisivel) S._setVisivel(mid, false);
var al = +estado.alpha;
if (isFinite(al) && al > 0 && al < 1 && S._setTransparencia) S._setTransparencia(mid, al);
notifyModelos();
avisarModeloCarregado(modelo);
texAuto();
if (S._xrReSnap) S._xrReSnap();
if (opts && opts.onLoaded) opts.onLoaded(elementosVivos());
return { ok: true, mid: mid, nome: modelo.nome, nEl: modelo.elementos.length };
}
S._montarDoCache = montarDoCache; S._dadosParaCache = dadosParaCache; S._soltarColeta = soltarColeta;
function avisarModeloCarregado(mo) {
if (!mo || !S.opts || !S.opts.onModeloCarregado) return;
try {
S.opts.onModeloCarregado({
mid: mo.mid, nome: mo.nome, arquivoId: mo.versaoId || '', modeloId: mo.modeloId || '',
disciplina: mo.disciplina || '', doCache: !!mo.doCache, exemplo: !!mo.exemplo,
temColeta: !!mo._coleta, semCache: mo._semCache || '', nEl: (mo.elementos || []).length
});
} catch (_) {}
}
function dadosParaCache(mid) {
var mo = modeloDe(mid);
if (!mo || !mo._coleta || mo.doCache || mo.sintetico) return null;
return {
arquivoId: mo.versaoId, nome: mo.nome, bytesArquivo: (mo._bytes && mo._bytes.length) || 0,
criadoEm: new Date().toISOString(), webIfc: '0.0.44', three: THREE.REVISION ? ('r' + THREE.REVISION) : '',
geometrias: mo._coleta.geometrias, instancias: mo._coleta.instancias,
elementos: mo.elementos, tipos: mo.tipos, carimbos: mo.carimbos, qto: mo.qto,
familias: mo.familias, sistemas: mo.sistemas, pavimentos: mo.pavimentos,
topologia: mo.topologia || lerTopologiaRede(mo.mid), bitolas: bitolasDoModelo(mo),
fatorLen: fatorLen(mo.mid), nEl: mo.elementos.length, nTri: mo.nTri
};
}
function bitolasDoModelo(mo) {
var out = {}, f = fatorLen(mo.mid);
(mo.elementos || []).forEach(function (e) {
if (!/IFCPIPE|IFCDUCT|IFCFLOWSEGMENT/i.test(String(e.tipo || ''))) return;
try { var b = lerBitolaMm(mo.mid, e.id, f); if (b) out[e.id] = b; } catch (_) {}
});
return out;
}
function soltarColeta(mid) { var mo = modeloDe(mid); if (mo) mo._coleta = null; }
function abrirArquivo(file) { var fr = new FileReader(); fr.onload = function () { enfileirar(function () { return carregarIFC(fr.result, file.name); }); }; fr.readAsArrayBuffer(file); }
S._abrirBytes = function (ab, nome, disc) { return enfileirar(function () { return carregarIFC(ab, nome || 'modelo.ifc', disc); }); };
var _malhaSeq = 0;
S._importarMalha = function (nome, dados, o) {
o = o || {};
var ext = String(nome || '').split('.').pop().toLowerCase();
var txt = function () { return typeof dados === 'string' ? dados : new TextDecoder('utf-8').decode(new Uint8Array(dados)); };
var buf = function () { return typeof dados === 'string' ? new TextEncoder().encode(dados).buffer : dados; };
var carregar;
if (ext === 'glb' || ext === 'gltf') carregar = import('three/examples/jsm/loaders/GLTFLoader.js').then(function (m) { return new Promise(function (ok, erro) { new m.GLTFLoader().parse(ext === 'gltf' ? txt() : buf(), '', function (g) { ok(g.scene); }, function (e) { erro(new Error('glTF: ' + (e && e.message || e) + (ext === 'gltf' ? ' (o .gltf com arquivos .bin/.png separados não abre sozinho — exporte como .glb)' : ''))); }); }); });
else if (ext === 'obj') carregar = import('three/examples/jsm/loaders/OBJLoader.js').then(function (m) { return new m.OBJLoader().parse(txt()); });
else if (ext === 'stl') carregar = import('three/examples/jsm/loaders/STLLoader.js').then(function (m) { var g = new m.STLLoader().parse(buf()); var gr = new THREE.Group(); var ms = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xc8ccd2 })); ms.name = String(nome).replace(/\.[^.]+$/, ''); gr.add(ms); return gr; });
else if (ext === 'dae') carregar = import('three/examples/jsm/loaders/ColladaLoader.js').then(function (m) { var c = new m.ColladaLoader().parse(txt(), ''); if (!c || !c.scene) throw new Error('DAE sem cena'); return c.scene; });
else if (ext === 'fbx') carregar = import('three/examples/jsm/loaders/FBXLoader.js').then(function (m) { return new m.FBXLoader().parse(buf(), ''); });
else if (ext === 'json' || ext === 'skpjson') carregar = Promise.resolve().then(function () { return malhaDoJsonOrcaPRO(JSON.parse(txt())); });
else return Promise.resolve({ ok: false, erro: 'formato .' + ext + ' não é malha que o OrçaPRO lê (use glb, gltf, obj, stl, dae, fbx ou o .json da extensão do SketchUp).' });
return carregar.then(function (raiz) {
var r = montarMalha(nome, raiz, o);
if (r && r.ok) { try {
var by = typeof dados === 'string' ? new TextEncoder().encode(dados) : new Uint8Array(dados);
var mo = S.modelos.filter(function (x) { return x.mid === r.mid; })[0];
if (mo && by.byteLength <= 80 * 1024 * 1024) mo._fonteMalha = { bytes: by, opcoes: { unidade: r.unidade, zUp: !!o.zUp, disciplina: mo.disciplina } };
} catch (eF) {} }
return r;
})
.catch(function (e) { return { ok: false, erro: (e && e.message) || String(e) }; });
};
function malhaDoJsonOrcaPRO(j) {
if (!j || j.formato !== 'OrcaPRO-Malha') throw new Error('o .json não é uma malha do OrçaPRO (formato "' + (j && j.formato) + '")');
if (!(j.versao >= 1) || j.versao > 1) throw new Error('versão ' + j.versao + ' da malha não suportada; atualize o OrçaPRO');
var gr = new THREE.Group();
(j.objetos || []).forEach(function (ob) {
var g = new THREE.BufferGeometry();
g.setAttribute('position', new THREE.Float32BufferAttribute(ob.posicoes || [], 3));
if (ob.indices && ob.indices.length) g.setIndex(ob.indices);
g.computeVertexNormals();
var cor = Array.isArray(ob.cor) ? new THREE.Color(ob.cor[0] / 255, ob.cor[1] / 255, ob.cor[2] / 255) : new THREE.Color(0xc8ccd2);
var ms = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: cor, transparent: ob.opacidade != null && ob.opacidade < 1, opacity: ob.opacidade != null ? ob.opacidade : 1, side: THREE.DoubleSide }));
ms.name = ob.nome || ob.definicao || 'Objeto';
ms.userData._origem = { programa: j.programa || 'SketchUp', nome: ob.nome, definicao: ob.definicao, tag: ob.tag, material: ob.material, atributos: ob.atributos || {}, guid: ob.guid };
gr.add(ms);
});
gr.userData._unidade = j.unidade || 'm';
return gr;
}
function volumeAssinado(g) {
var p = g.attributes.position, ix = g.index, v = 0, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), area = 0, ab = new THREE.Vector3(), ac = new THREE.Vector3();
var n = ix ? ix.count : p.count;
for (var i = 0; i < n; i += 3) {
var i0 = ix ? ix.getX(i) : i, i1 = ix ? ix.getX(i + 1) : i + 1, i2 = ix ? ix.getX(i + 2) : i + 2;
a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2);
v += a.dot(b.clone().cross(c)) / 6;
area += ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() / 2;
}
return { volume: Math.abs(v), area: area };
}
function montarMalha(nome, raiz, o) {
raiz.updateMatrixWorld(true);
var malhas = []; raiz.traverse(function (x) { if (x.isMesh && x.geometry && x.geometry.attributes && x.geometry.attributes.position) malhas.push(x); });
if (!malhas.length) return { ok: false, erro: 'o arquivo não tem nenhuma malha (só linhas, câmeras ou vazio).' };
var bb0 = new THREE.Box3(); malhas.forEach(function (m) { bb0.expandByObject(m); });
var tam = bb0.getSize(new THREE.Vector3()), maior = Math.max(tam.x, tam.y, tam.z);
var un = o.unidade && o.unidade !== 'auto' ? o.unidade : (raiz.userData._unidade || (maior > 400 ? 'mm' : maior > 40 ? 'cm' : 'm'));
var esc = { m: 1, cm: 0.01, mm: 0.001, pol: 0.0254 }[un] || 1;
var M = new THREE.Matrix4().makeScale(esc, esc, esc);
if (o.zUp) M.premultiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
if (Array.isArray(o.posicao) && o.posicao.length === 3 && o.posicao.every(isFinite)) M.premultiply(new THREE.Matrix4().makeTranslation(+o.posicao[0], +o.posicao[1], +o.posicao[2]));
var mid = 'malha' + (++_malhaSeq);
var mo = { mid: mid, sintetico: false, malha: true, nome: String(nome), disciplina: o.disciplina || 'arquitetura', alpha: 1, visivel: true, grupo: new THREE.Group(), matCache: {}, transCache: {}, elementos: [], tipos: {}, nEl: 0, nTri: 0, pavimentos: [], carimbos: {}, qto: {} };
mo.grupo.userData.mid = mid;
malhas.forEach(function (m, i) {
var g = m.geometry.clone(); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(M, m.matrixWorld));
if (!g.attributes.normal) g.computeVertexNormals();
var mat = Array.isArray(m.material) ? m.material.map(function (x) { var c = x.clone(); c.side = THREE.DoubleSide; return c; }) : (m.material ? m.material.clone() : new THREE.MeshStandardMaterial({ color: 0xc8ccd2 }));
if (!Array.isArray(mat)) mat.side = THREE.DoubleSide;
var nm = new THREE.Mesh(g, mat), id = i + 1, org = m.userData && m.userData._origem;
nm.userData.expressID = id; nm.userData.mid = mid; nm.userData.tipo = 'IFCBUILDINGELEMENTPROXY'; nm.userData.matOrig = mat;
mo.grupo.add(nm); S.meshPorUid[mid + ':' + id] = nm;
var vq = volumeAssinado(g); mo.nTri += (g.index ? g.index.count : g.attributes.position.count) / 3;
mo.qto[id] = { area: Math.round(vq.area * 1000) / 1000, volume: Math.round(vq.volume * 10000) / 10000, contagem: 1 };
var nomeEl = (org && (org.nome || org.definicao)) || m.name || (m.parent && m.parent.name) || ('Objeto ' + id);
mo.elementos.push({ id: id, uid: mid + ':' + id, mid: mid, arquivo: mo.nome, tipo: 'IFCBUILDINGELEMENTPROXY', nome: nomeEl, etapa: null, codOrc: null, qto: mo.qto[id], disciplina: mo.disciplina,
origemExterna: org ? { programa: org.programa, componente: org.definicao || '', etiqueta: org.tag || '', material: org.material || '', atributos: org.atributos || {}, guid: org.guid || '' } : null });
mo.nEl++;
});
mo.tipos.IFCBUILDINGELEMENTPROXY = mo.nEl;
modelRoot.add(mo.grupo);
try {
modelRoot.updateMatrixWorld(true);
mo.grupo.children.forEach(function (m) { var bb = new THREE.Box3().setFromObject(m); var el = mo.elementos[m.userData.expressID - 1]; if (el && !bb.isEmpty()) el.aabb = { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] }; });
} catch (_) {}
S.modelos.push(mo);
recarimbarIdentidade();
agregarModelo(mo); carimbarConsulta();
S.elementos = []; S.modelos.forEach(function (x) { S.elementos = S.elementos.concat(x.elementos); });
over.style.display = 'none';
atualizarHud(); notifyModelos(); if (!o.manterCamera) enquadrar();
if (opts.onLoaded) { try { opts.onLoaded(elementosVivos()); } catch (_) {} }
return { ok: true, mid: mid, nome: mo.nome, pecas: mo.nEl, triangulos: Math.round(mo.nTri), unidade: un, escala: esc, tamanho: [Math.round(tam.x * esc * 100) / 100, Math.round(tam.y * esc * 100) / 100, Math.round(tam.z * esc * 100) / 100] };
}
S._bytesModelos = function () { return S.modelos.filter(function (m) { return m._bytes && m._bytes.length; }).map(function (m) { return { nome: m.nome, disc: m.disciplina || '', bytes: m._bytes, arquivoId: m.versaoId || '' }; }); };
function carregarExemplo() {
var CLOUD = 'https://orcaprogestao.com.br/samples/murumbir-demolicao.ifc';
function embutido() { fetch('bim/samples/exemplo.ifc').then(function (r) { return r.arrayBuffer(); }).then(function (ab) { enfileirar(function () { return carregarIFC(ab, 'exemplo.ifc', '', true); }); }).catch(function () { over.querySelector('div').innerHTML = '<div style="font-size:30px">' + (typeof Icones !== 'undefined' ? Icones.get('tabela', 15) : '') + '</div><p style="color:#a9c1d8">Abra um arquivo .ifc seu — o exemplo não foi encontrado.</p>'; }); }
fetch(CLOUD).then(function (r) { if (!r.ok) throw new Error('http'); return r.arrayBuffer(); }).then(function (ab) { enfileirar(function () { return carregarIFC(ab, 'Murumbir — Demolição (exemplo)', '', true); }); }).catch(embutido);
}
S._abrirArquivo = abrirArquivo; S._carregarExemplo = carregarExemplo;
}
function desmontarMorto() {
if (!S) return;
try { if (S.xr && S.xr.on && S._sairImersivo) S._sairImersivo(); } catch (_) {}
try { S._xrActive = false; if (S.renderer && S.renderer.setAnimationLoop) S.renderer.setAnimationLoop(null); } catch (_) {}
try { if (S.raf) cancelAnimationFrame(S.raf); } catch (_) {}
try { if (Reuniao.on) Reuniao.sair(); } catch (_) {}
try { if (S._onKeyDown) window.removeEventListener('keydown', S._onKeyDown); } catch (_) {}
try { if (S._onKeyUp) window.removeEventListener('keyup', S._onKeyUp); } catch (_) {}
try { if (S._selTeclas) window.removeEventListener('keydown', S._selTeclas, true); } catch (_) {}
try { if (S._ctl) S._ctl.dispor(); } catch (_) {}
try { if (S._mouse) S._mouse.dispor(); } catch (_) {}
try { if (S._abrirUI) S._abrirUI.dispor(); } catch (_) {}
try { if (S._onMouseMove) document.removeEventListener('mousemove', S._onMouseMove); } catch (_) {}
try { if (S._resize) window.removeEventListener('resize', S._resize); } catch (_) {}
try { if (S._ro) S._ro.disconnect(); } catch (_) {}
try { if (S._saude3d && S._saude3d.tRec) clearTimeout(S._saude3d.tRec); } catch (_) {}
try { if (S._ajustarTop) window.removeEventListener('resize', S._ajustarTop); } catch (_) {}
try { if (S._fabObserver) S._fabObserver.disconnect(); } catch (_) {}
try { if (S._fabEstilo) window.removeEventListener('resize', S._fabEstilo); } catch (_) {}
try { if (S._dockRolar) window.removeEventListener('scroll', S._dockRolar, true); } catch (_) {}
try { if (S._dockDocClick) document.removeEventListener('click', S._dockDocClick, true); } catch (_) {}
try { S.modelos.slice().forEach(function (mo) { if (typeof mo.mid === 'number') { try { S.api.CloseModel(mo.mid); } catch (_) {} } }); } catch (_) {}
try { if (S._texLiberar) S._texLiberar(); } catch (_) {}
try { S.renderer.dispose(); } catch (_) {}
S = null;
}
function cadaMalha(fn) { if (!S) return; S.modelRoot.children.forEach(function (g) { (g.children || []).forEach(fn); }); }
function ehRemovidoEd(m) {
var r = S && S._remEd; if (!r) return false;
return !!r[m.userData.mid + ':' + m.userData.expressID];
}
function elementosVivos() {
if (!S) return [];
var r = S._remEd; if (!r) return S.elementos.slice();
return S.elementos.filter(function (e) { return !r[e.uid]; });
}
function aplicarEstado(est) {
if (!S) return;
if (S.pav && (S.pav.isolado || S.pav.manual)) { S.pav.isolado = null; S.pav.manual = false; if (S._pavRender) S._pavRender(); }
var fut = {}, and = {};
(est && est.futuros || []).forEach(function (id) { fut[id] = 1; });
(est && est.emAndamento || []).forEach(function (id) { and[id] = 1; });
S._fut4d = fut;
S._and4d = and;
S._pintura = null; S._pinturaDono = "4d-auto";
cadaMalha(function (m) {
var id = m.userData.expressID; if (id == null) return;
var uid = m.userData.mid + ':' + id;
var chave = (fut[uid] != null || and[uid] != null) ? uid : id;
if (fut[chave] || ehRemovidoEd(m)) { m.visible = false; return; }
m.visible = true;
if (m === S.selected) return;
m.material = and[chave] ? S.matAndamento : (S._matBase ? S._matBase(m) : (m.userData.matOrig || m.material));
});
}
function mostrarTudo() {
if (!S) return;
if (typeof window !== 'undefined' && window.BimSelInst && BimSelInst._limparOcultos) BimSelInst._limparOcultos();
if (S.pav && (S.pav.isolado || S.pav.manual)) { S.pav.isolado = null; S.pav.manual = false; if (S._pavRender) S._pavRender(); }
S._fut4d = null; S._and4d = null;
if (S._pinturaDono === "4d-auto") { S._pintura = null; S._pinturaDono = null; }
if (S._pinturaDono === "4d-sim") { S._pintura = null; S._pinturaDono = null; }
cadaMalha(function (m) { m.visible = !ehRemovidoEd(m); if (m !== S.selected) m.material = S._matBase ? S._matBase(m) : (m.userData.matOrig || m.material); });
}
function focarClash(ids) {
if (!S) return;
if (S.planta && S.planta.on && S._setPlanta) S._setPlanta(false);
if (S.corteL && S.corteL.on && S._setCorteL) S._setCorteL(false);
if (S.medir && S.medir.on && S._setMedir) S._setMedir(false);
if (S.area && S.area.on && S._setArea) S._setArea(false);
if (S.ang && S.ang.on && S._setAng) S._setAng(false);
if (S._fecharCtecModal && S.ctecModal && S.ctecModal.style.display === 'flex') S._fecharCtecModal();
if (S._ctecCancelar) S._ctecCancelar();
if (S.edit && S.edit.on && S._setEdit) S._setEdit(false);
if (S.p3dPanel && S.p3dPanel.style.display === 'flex') S.p3dPanel.style.display = 'none';
limparClash();
if (S.selected) { S.selected.material = S.prevMat; S.selected = null; S.prevMat = null; }
if (S._contornoSelecao) S._contornoSelecao(null);
var idset = {}; (ids || []).forEach(function (id) { idset[id] = 1; });
var box = new THREE.Box3(), any = false;
S.modelRoot.children.forEach(function (g) { (g.children || []).forEach(function (m) {
if (m.userData && (idset[m.userData.mid + ':' + m.userData.expressID] || idset[m.userData.expressID])) {
if (ehRemovidoEd(m)) return;
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
function refinarClash(clashes, opts) {
clashes = clashes || [];
if (!S || typeof window === 'undefined' || !window.BIMTri) return clashes;
opts = opts || {};
var MAX_TRI = opts.maxTriPorElemento || 40000;
var FOLGA = opts.folga != null ? opts.folga : 0.01;
var MAX_TESTES = opts.maxTestes || 400000;
var MAX_CLASHES = opts.maxClashes || 800;
var DEADLINE_MS = opts.deadlineMs || 2500;
var MODO_FOLGA = opts.modo === "folga";
var FOLGA_ALVO = opts.folgaAlvo != null ? opts.folgaAlvo : 0.30;
try { S.modelRoot.updateMatrixWorld(true); } catch (_) {}
var t0 = performance.now();
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
function filtrar(ce, caixa, exp) {
var E = FOLGA + (exp || 0);
var x0 = caixa.min[0] - E, y0 = caixa.min[1] - E, z0 = caixa.min[2] - E;
var x1 = caixa.max[0] + E, y1 = caixa.max[1] + E, z1 = caixa.max[2] + E;
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
function contido(bIn, bOut) {
return bIn[0] >= bOut[0] - FOLGA && bIn[1] >= bOut[1] - FOLGA && bIn[2] >= bOut[2] - FOLGA &&
bIn[3] <= bOut[3] + FOLGA && bIn[4] <= bOut[4] + FOLGA && bIn[5] <= bOut[5] + FOLGA;
}
for (var i = 0; i < clashes.length; i++) {
var c = clashes[i]; if (!c) continue;
if (i >= MAX_CLASHES || performance.now() - t0 > DEADLINE_MS) { c.geo = 'nao-verificavel'; continue; }
if (!c.inter || !c.inter.min || !c.inter.max) { c.geo = 'nao-verificavel'; continue; }
var A = cacheDe(c.aId), B = cacheDe(c.bId);
if (A === null || A === 'cap' || B === null || B === 'cap') { c.geo = 'nao-verificavel'; continue; }
var EXP = MODO_FOLGA ? FOLGA_ALVO / 2 : 0;
var ta = filtrar(A, c.inter, EXP), tb = filtrar(B, c.inter, EXP);
var conf = false, naoVer = false;
if (ta.length && tb.length) {
if (MODO_FOLGA) {
var rf = window.BIMTri.distMalhas(ta, tb, { limite: FOLGA_ALVO, maxTestes: MAX_TESTES });
if (rf.estourou) naoVer = true;
else if (rf.abaixo) { conf = true; c.distancia = rf.distancia; }
} else {
var r = window.BIMTri.algumIntersecta(ta, tb, MAX_TESTES);
if (r.estourou) naoVer = true; else conf = r.confirmado;
}
}
if (!conf && !naoVer) {
var menor = null, maior = null;
if (contido(A.aabb, B.aabb)) { menor = A; maior = B; }
else if (contido(B.aabb, A.aabb)) { menor = B; maior = A; }
if (menor && menor.tris.length >= 3) {
conf = window.BIMTri.dentroVoto([menor.tris[0], menor.tris[1], menor.tris[2]], maior.tris);
if (conf && MODO_FOLGA) c.distancia = 0;
}
}
c.geo = naoVer ? 'nao-verificavel' : (conf ? 'confirmado' : 'descartado');
if (MODO_FOLGA && conf && c.distancia != null && FOLGA_ALVO > 0) {
var frac = c.distancia / FOLGA_ALVO;
c.severidade = frac <= 0.34 ? 'grave' : (frac <= 0.67 ? 'media' : 'leve');
}
}
return clashes;
}
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
var tex = texSRGB(new THREE.CanvasTexture(cv)); tex.anisotropy = 4;
var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
sp.scale.set(2.6, 0.65, 1); sp.renderOrder = 999;
return sp;
},
_jerseyTex: function (u) {
var cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
var x = cv.getContext('2d');
var shirt = u.c1 || '#222b34';
function desenha(logoImg) {
x.clearRect(0, 0, 256, 256);
x.fillStyle = shirt; x.fillRect(0, 0, 256, 256);
x.fillStyle = 'rgba(255,255,255,.10)'; x.fillRect(0, 0, 256, 20);
if (logoImg) { try { var r = (logoImg.width || 1) / (logoImg.height || 1), w = 100, h = w / r; if (h > 84) { h = 84; w = h * r; } x.drawImage(logoImg, 128 - w / 2, 34, w, h); } catch (e) {} }
else {
var ini = String(u.nome || 'Visitante').trim().split(/\s+/).map(function (p) { return p.charAt(0); }).join('').slice(0, 2).toUpperCase() || 'RA';
x.fillStyle = 'rgba(255,255,255,.16)'; x.beginPath(); x.arc(128, 64, 34, 0, Math.PI * 2); x.fill();
x.fillStyle = 'rgba(255,255,255,.95)'; x.font = 'bold 34px Segoe UI, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ini, 128, 65); x.textBaseline = 'alphabetic';
}
x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = 'bold 27px Segoe UI, Arial';
x.fillText(String(u.nome || 'Visitante').slice(0, 18), 128, 168);
if (u.tel) { x.font = '20px Segoe UI, Arial'; x.fillStyle = 'rgba(255,255,255,.88)'; x.fillText(String(u.tel).slice(0, 20), 128, 202); }
}
desenha(null);
var texF = texSRGB(new THREE.CanvasTexture(cv)); texF.anisotropy = 4;
var texB = texSRGB(new THREE.CanvasTexture(cv)); texB.anisotropy = 4; texB.wrapS = THREE.RepeatWrapping; texB.repeat.x = -1; texB.offset.x = 1;
if (u.logo) { var img = new Image(); img.onload = function () { desenha(img); texF.needsUpdate = true; texB.needsUpdate = true; }; img.onerror = function () {}; img.src = u.logo; }
return { texF: texF, texB: texB, shirt: new THREE.Color(shirt) };
},
_avatar: function (u) {
var g = new THREE.Group();
var corC = new THREE.Color(u.c2 || '#f59e0b'), mulher = u.sexo === 'm';
var matPele = new THREE.MeshStandardMaterial({ color: 0xe4b48e, roughness: .75 });
var matCalca = new THREE.MeshStandardMaterial({ color: 0x2b3440, roughness: .85 });
var matSapato = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: .6 });
var j = this._jerseyTex(u);
var matShirt = new THREE.MeshStandardMaterial({ color: j.shirt, roughness: .85 });
var matJf = new THREE.MeshStandardMaterial({ map: j.texF, roughness: .85 });
var matJb = new THREE.MeshStandardMaterial({ map: j.texB, roughness: .85 });
var lh = 0.82, th = 0.52, tw = mulher ? 0.36 : 0.42, td = 0.24, lw = mulher ? 0.13 : 0.15;
[-1, 1].forEach(function (s) {
var perna = new THREE.Mesh(new THREE.CylinderGeometry(lw * 0.5, lw * 0.45, lh, 10), matCalca); perna.position.set(s * 0.11, lh / 2, 0); g.add(perna);
var pe = new THREE.Mesh(new THREE.BoxGeometry(lw * 1.1, 0.07, 0.26), matSapato); pe.position.set(s * 0.11, 0.035, 0.06); g.add(pe);
});
var tronco = new THREE.Mesh(new THREE.BoxGeometry(tw, th, td), [matShirt, matShirt, matShirt, matShirt, matJf, matJb]);
tronco.position.y = lh + th / 2; g.add(tronco);
var aw = mulher ? 0.09 : 0.11;
[-1, 1].forEach(function (s) {
var br = new THREE.Mesh(new THREE.CylinderGeometry(aw * 0.5, aw * 0.45, 0.5, 8), matShirt); br.position.set(s * (tw / 2 + aw * 0.45), lh + th - 0.27, 0); br.rotation.z = s * 0.09; g.add(br);
var mao = new THREE.Mesh(new THREE.SphereGeometry(aw * 0.55, 8, 6), matPele); mao.position.set(s * (tw / 2 + aw * 0.5), lh + th - 0.5, 0); g.add(mao);
});
var cab = new THREE.Mesh(new THREE.SphereGeometry(0.135, 18, 14), matPele); cab.position.y = lh + th + 0.16; g.add(cab);
if (mulher) {
var matCab = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: .9 });
var cabelo = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), matCab); cabelo.position.set(0, lh + th + 0.19, -0.015); g.add(cabelo);
var rabo = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.028, 0.3, 8), matCab); rabo.position.set(0, lh + th + 0.03, -0.14); rabo.rotation.x = 0.2; g.add(rabo);
}
var capacete = new THREE.Mesh(new THREE.SphereGeometry(0.155, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: corC, roughness: .35, metalness: .15 })); capacete.position.y = lh + th + 0.19; g.add(capacete);
var aba = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 18), capacete.material); aba.position.set(0, lh + th + 0.15, 0.07); g.add(aba);
var nome = this._sprite(u.nome, u.c2 || '#f59e0b'); nome.position.y = lh + th + 0.55; g.add(nome);
var mic = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._micTex(), depthTest: false, transparent: true }));
mic.scale.set(0.42, 0.42, 1); mic.position.y = lh + th + 0.92; mic.visible = false; mic.renderOrder = 1001;
g.add(mic); g.userData.mic = mic;
var esc2 = u.esc === 'baixo' ? 0.9 : u.esc === 'alto' ? 1.1 : 1; g.scale.set(esc2, esc2, esc2);
g.userData.alvo = { p: new THREE.Vector3(), yaw: 0 };
return g;
},
_micTex: function () {
var cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
var x = cv.getContext('2d');
x.fillStyle = 'rgba(22,163,74,.92)'; x.beginPath(); x.arc(64, 64, 60, 0, Math.PI * 2); x.fill();
x.strokeStyle = '#eafff2'; x.lineWidth = 6; x.stroke();
x.font = '64px Segoe UI Emoji, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('🎤', 64, 70);
var t = texSRGB(new THREE.CanvasTexture(cv)); t.anisotropy = 4;
return t;
},
_aplicar: function (usuarios) {
var self = this, vistos = {};
Object.keys(usuarios || {}).forEach(function (uid) {
if (uid === self.uid) return;
var u = usuarios[uid]; if (!u || !u.p) return;
vistos[uid] = 1;
if (!self._logos) self._logos = {};
var lc = self._logos[uid];
if (u.lv && (!lc || (lc.lv !== u.lv && !lc.pend))) {
self._logos[uid] = { lv: u.lv, logo: (lc && lc.logo) || '', pend: true };
(function (id, lv) { fetch(self.base() + encodeURIComponent(self.sala) + '/logo/' + encodeURIComponent(id)).then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) { self._logos[id] = { lv: lv, logo: t || '', pend: false }; }).catch(function () { if (self._logos[id]) self._logos[id].pend = false; }); })(uid, u.lv);
} else if (!u.lv && lc) { self._logos[uid] = { lv: '', logo: '', pend: false }; }
u.logo = (self._logos[uid] && self._logos[uid].logo) || '';
var av = self.outros[uid];
if (!av || av.userData.c1 !== u.c1 || av.userData.c2 !== u.c2 || av.userData.nome !== u.nome || av.userData.esc !== u.esc || av.userData.sexo !== u.sexo || av.userData.tel !== u.tel || av.userData.logo !== u.logo) {
if (av) { self._dispor(av); self.grupo.remove(av); }
av = self._avatar(u); av.userData.c1 = u.c1; av.userData.c2 = u.c2; av.userData.nome = u.nome; av.userData.esc = u.esc; av.userData.sexo = u.sexo; av.userData.tel = u.tel; av.userData.logo = u.logo;
av.position.set(u.p[0], u.p[1] - 1.6, u.p[2]);
self.grupo.add(av); self.outros[uid] = av;
}
av.userData.alvo.p.set(u.p[0], u.p[1] - 1.6, u.p[2]);
av.userData.alvo.yaw = u.yaw || 0;
});
Object.keys(this.outros).forEach(function (uid) { if (!vistos[uid]) { self._dispor(self.outros[uid]); self.grupo.remove(self.outros[uid]); delete self.outros[uid]; delete self._logos[uid]; } });
if (S && S.opts && S.opts.onReuniao) { try { S.opts.onReuniao(Object.keys(vistos).length + 1); } catch (_) {} }
},
_dispor: function (g) {
try {
g.traverse(function (o) {
try {
if (o.geometry && !o.isSprite) o.geometry.dispose();
var m = o.material; if (!m) return;
var arr = Array.isArray(m) ? m : [m];
for (var i = 0; i < arr.length; i++) { var mm = arr[i]; if (!mm) continue; if (mm.map) mm.map.dispose(); mm.dispose(); }
} catch (_) {}
});
} catch (_) {}
},
_tick: function () {
var self = Reuniao; if (!self.on || !S) return;
var vozOn = (typeof Voz !== 'undefined' && Voz.on);
Object.keys(self.outros).forEach(function (uid) {
var av = self.outros[uid], a = av.userData.alvo;
av.position.lerp(a.p, 0.14);
var dy = a.yaw - av.rotation.y; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
av.rotation.y += dy * 0.14;
if (av.userData.mic) av.userData.mic.visible = vozOn && Voz.falandoUid(uid);
});
if (!self.conectado) return;
var now = Date.now();
var c = S.camera, e = new THREE.Euler().setFromQuaternion(c.quaternion, 'YXZ');
if (now - self._lastPost > 180) {
self._lastPost = now;
try { fetch(self.base() + encodeURIComponent(self.sala) + '/pose', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ uid: self.uid, p: [c.position.x, c.position.y, c.position.z], yaw: e.y }) }).then(function (r) { if (r && r.status === 429) { self.sair(); if (S && S.opts) { var cb = S.opts.onReuniaoCheia || S.opts.onReuniaoFalha; if (cb) { try { cb(); } catch (_) {} } } } }).catch(function () {}); } catch (_) {}
}
if (now - (self._lastIdent || 0) > 4000) {
self._lastIdent = now;
var g = self.cfg;
var mudouLogo = g.logo !== self._logoEnviado;
var body = { uid: self.uid, nome: g.nome, c1: g.c1, c2: g.c2, esc: g.esc, sexo: g.sexo, tel: g.tel, p: [c.position.x, c.position.y, c.position.z], yaw: e.y };
if (mudouLogo) body.logo = g.logo;
try { fetch(self.base() + encodeURIComponent(self.sala) + '/pose', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) }).then(function (r) { if (mudouLogo && r && r.ok) self._logoEnviado = g.logo; }).catch(function () {}); } catch (_) {}
}
},
entrar: function (cfg) {
if (!S) return false;
this.sair();
this.cfg = { nome: (cfg && cfg.nome) || 'Visitante', c1: (cfg && cfg.c1) || '#222b34', c2: (cfg && cfg.c2) || '#f59e0b', esc: (cfg && cfg.esc) || 'normal', sexo: (cfg && cfg.sexo) || 'h', tel: (cfg && cfg.tel) || '', logo: (cfg && cfg.logo) || '' };
this.sala = (cfg && cfg.sala) || 'geral';
this.grupo = new THREE.Group(); S.scene.add(this.grupo);
this.conectado = false; this.falhas = 0; this.jaConectou = false; this._logos = {}; this._lastIdent = 0; this._logoEnviado = null;
var self = this;
try {
this.es = new EventSource(this.base() + encodeURIComponent(this.sala) + '/stream');
this.es.onopen = function () { self.conectado = true; self.jaConectou = true; self.falhas = 0; self._logoEnviado = null; if (self._connTimer) { clearTimeout(self._connTimer); self._connTimer = 0; } if (S && S.opts && S.opts.onReuniao) { try { S.opts.onReuniao(self.on ? (Object.keys(self.outros).length + 1) : 0); } catch (_) {} } };
this.es.onmessage = function (ev) { try { var d = JSON.parse(ev.data); self.conectado = true; self.jaConectou = true; self._aplicar(d.usuarios || {}); } catch (_) {} };
this.es.onerror = function () {
self.conectado = false; self.falhas++;
var fatal = self.jaConectou && self.es && self.es.readyState === 2;
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
if (typeof Voz !== 'undefined' && (Voz.on || Voz.wanted)) { try { Voz.sair(); } catch (_) {} }
if (this._connTimer) { clearTimeout(this._connTimer); this._connTimer = 0; }
if (this.es) { try { this.es.close(); } catch (_) {} this.es = null; }
var i = S ? S._tickExtra.indexOf(this._tick) : -1; if (i !== -1) S._tickExtra.splice(i, 1);
var selfS = this; if (this.grupo) { Object.keys(this.outros).forEach(function (uid) { selfS._dispor(selfS.outros[uid]); }); if (S) S.scene.remove(this.grupo); }
this.grupo = null; this.outros = {}; this._logos = {};
if (S && S.opts && S.opts.onReuniao) { try { S.opts.onReuniao(0); } catch (_) {} }
}
};
var Voz = {
on: false, ctx: null, stream: null, src: null, proc: null, muteGain: null,
es: null, sala: '', uid: '', base: '', seq: 0, HZ: 8000, frameLen: 800,
frameBuf: null, frameFill: 0, ratio: 1, wanted: false, _acc: 0, _cnt: 0, _phase: 0,
vad: { floor: 0.003, hang: 0, speaking: false },
rx: {},
entrar: function (sala, uid, base) {
if (this.on) return true;
if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
var self = this; this.sala = sala; this.uid = uid; this.base = base; this.wanted = true;
try { this.ctx = new AC(); if (this.ctx.state === 'suspended') this.ctx.resume(); } catch (_) { this.ctx = null; }
if (!this.ctx) { this.wanted = false; return false; }
this.ratio = Math.max(1, this.ctx.sampleRate / this.HZ);
navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }).then(function (stream) {
if (self.on || !self.wanted) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {} if (!self.wanted && self.ctx) { try { self.ctx.close(); } catch (_) {} self.ctx = null; } return; }
self.stream = stream;
self.frameBuf = new Float32Array(self.frameLen); self.frameFill = 0; self.seq = 0; self._acc = 0; self._cnt = 0; self._phase = 0;
self.src = self.ctx.createMediaStreamSource(stream);
var proc = self.ctx.createScriptProcessor(2048, 1, 1); self.proc = proc;
self.muteGain = self.ctx.createGain(); self.muteGain.gain.value = 0;
proc.onaudioprocess = function (e) { self._captura(e); };
self.src.connect(proc); proc.connect(self.muteGain); self.muteGain.connect(self.ctx.destination);
try {
self.es = new EventSource(base + encodeURIComponent(sala) + '/audiostream?uid=' + encodeURIComponent(uid));
self.es.onmessage = function (ev) { self._recebe(ev.data); };
self.es.onerror = function () {};
} catch (_) {}
self.on = true;
if (S && S.opts && S.opts.onVoz) { try { S.opts.onVoz(true); } catch (_) {} }
}).catch(function (e) {
self.wanted = false; if (self.ctx) { try { self.ctx.close(); } catch (_) {} self.ctx = null; }
if (S && S.opts && S.opts.onVozErro) { try { S.opts.onVozErro((e && e.name) || String(e)); } catch (_) {} }
});
return true;
},
_captura: function (e) {
if (!this.on) return;
var input = e.inputBuffer.getChannelData(0), ratio = this.ratio, i;
for (i = 0; i < input.length; i++) {
this._acc += input[i]; this._cnt++; this._phase++;
if (this._phase >= ratio) {
this._phase -= ratio;
this.frameBuf[this.frameFill++] = this._acc / this._cnt; this._acc = 0; this._cnt = 0;
if (this.frameFill >= this.frameLen) { this._frame(); this.frameFill = 0; }
}
}
},
_frame: function () {
var buf = this.frameBuf, n = this.frameLen, i, sum = 0;
for (i = 0; i < n; i++) sum += buf[i] * buf[i];
var rms = Math.sqrt(sum / n), v = this.vad;
if (rms < v.floor) v.floor = v.floor * 0.9 + rms * 0.1; else v.floor = v.floor * 0.995 + rms * 0.005;
var thrOpen = Math.max(0.012, v.floor * 3.2), thrClose = Math.max(0.008, v.floor * 2.0);
var era = v.speaking;
if (!v.speaking) { if (rms > thrOpen) { v.speaking = true; v.hang = 6; } }
else { if (rms > thrClose) v.hang = 6; else if (--v.hang <= 0) v.speaking = false; }
if (v.speaking !== era && S && S.opts && S.opts.onFala) { try { S.opts.onFala(v.speaking); } catch (_) {} }
if (!v.speaking) return;
var pcm = new Int16Array(n);
for (i = 0; i < n; i++) { var x = buf[i]; if (x > 1) x = 1; else if (x < -1) x = -1; pcm[i] = x < 0 ? (x * 0x8000) | 0 : (x * 0x7fff) | 0; }
var b64 = this._toB64(pcm);
try { fetch(this.base + encodeURIComponent(this.sala) + '/audio', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ uid: this.uid, q: this.seq++, a: b64 }) }).catch(function () {}); } catch (_) {}
},
_recebe: function (data) {
if (!this.on || !this.ctx) return;
var msg; try { msg = JSON.parse(data); } catch (_) { return; }
if (!msg || !msg.a || !msg.u || msg.u === this.uid) return;
var pcm = this._fromB64(msg.a); if (!pcm || !pcm.length) return;
var n = pcm.length, f32 = new Float32Array(n), i;
for (i = 0; i < n; i++) f32[i] = pcm[i] / 0x8000;
var r = this.rx[msg.u];
if (!r) { r = this.rx[msg.u] = { gain: this.ctx.createGain(), next: 0, last: 0 }; r.gain.gain.value = 1; try { r.gain.connect(this.ctx.destination); } catch (_) {} }
r.last = Date.now();
var ab = this.ctx.createBuffer(1, n, this.HZ); ab.getChannelData(0).set(f32);
var srcN = this.ctx.createBufferSource(); srcN.buffer = ab; try { srcN.connect(r.gain); } catch (_) { return; }
var t = this.ctx.currentTime, dur = n / this.HZ;
if (r.next < t + 0.02) r.next = t + 0.12;
if (r.next > t + 0.5) return;
try { srcN.start(r.next); } catch (_) {}
r.next += dur;
},
falandoUid: function (uid) { var r = this.rx[uid]; return !!(r && (Date.now() - r.last) < 500); },
euFalando: function () { return !!(this.on && this.vad.speaking); },
sair: function () {
this.on = false; this.wanted = false;
if (this.es) { try { this.es.close(); } catch (_) {} this.es = null; }
if (this.proc) { try { this.proc.disconnect(); this.proc.onaudioprocess = null; } catch (_) {} this.proc = null; }
if (this.src) { try { this.src.disconnect(); } catch (_) {} this.src = null; }
if (this.muteGain) { try { this.muteGain.disconnect(); } catch (_) {} this.muteGain = null; }
if (this.stream) { try { this.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {} this.stream = null; }
var self = this; Object.keys(this.rx).forEach(function (u) { try { self.rx[u].gain.disconnect(); } catch (_) {} });
this.rx = {}; this.vad.speaking = false; this.vad.hang = 0;
if (this.ctx) { try { this.ctx.close(); } catch (_) {} this.ctx = null; }
if (S && S.opts && S.opts.onVoz) { try { S.opts.onVoz(false); } catch (_) {} }
},
_toB64: function (int16) {
var bytes = new Uint8Array(int16.buffer), bin = '', i, chunk = 0x8000;
for (i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
return btoa(bin);
},
_fromB64: function (b64) {
try { var bin = atob(b64), len = bin.length, bytes = new Uint8Array(len), i; for (i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i); return new Int16Array(bytes.buffer); } catch (_) { return null; }
}
};
window.BIM = {
montar: montar,
setObra: function (obraId) {
var novo = String(obraId == null ? '' : obraId);
if (novo === OBRA_ID) return OBRA_ID;
OBRA_ID = novo; recarimbarIdentidade(); return OBRA_ID;
},
obraAtual: function () { return OBRA_ID; },
setFederacao: function (mapa) {
FED = mapa || null;
if (mapa && mapa.obraId) OBRA_ID = String(mapa.obraId);
recarimbarIdentidade();
return true;
},
federacao: function () { return FED; },
dadosParaCache: function (mid) { return (S && S._dadosParaCache) ? S._dadosParaCache(mid) : null; },
soltarColeta: function (mid) { if (S && S._soltarColeta) S._soltarColeta(mid); },
agregacao: function (on) { return (S && S._ligarAgregacao) ? S._ligarAgregacao(on) : false; },
agregacaoEstado: function () { return (S && S._agregEstado) ? S._agregEstado() : { on: false }; },
carimbarConsulta: function () { return (S && S._carimbarConsulta) ? S._carimbarConsulta() : 0; },
valoresDe: function (campo) { return (S && S._valoresDe) ? S._valoresDe(campo) : []; },
uidsDeChaves: function (chaves) { return (S && S._uidsDeChaves) ? S._uidsDeChaves(chaves) : []; },
isolarChaves: function (chaves) { return (S && S._isolarChaves) ? S._isolarChaves(chaves) : 0; },
pintarChaves: function (mapa, dono) { return (S && S._pintarChaves) ? S._pintarChaves(mapa, dono) : 0; },
limparPintura: function () { if (S && S._limparPintura) S._limparPintura(); },
aplicar4DTarefas: function (sim) { return (S && S._aplicar4DTarefas) ? S._aplicar4DTarefas(sim) : { ok: false, erro: 'visualizador não montado' }; },
limpar4DTarefas: function () { if (S && S._limpar4DTarefas) S._limpar4DTarefas(); },
aplicar4DSim: function (cena) { return (S && S._aplicar4DSim) ? S._aplicar4DSim(cena) : { ok: false, erro: 'visualizador não montado' }; },
enquadrarUids: function (uids, opts) { return (S && S._enquadrarUids) ? S._enquadrarUids(uids, opts) : false; },
cameraAtual: function () { return (S && S._cameraAtual) ? S._cameraAtual() : null; },
aplicarVista: function (v, opts) {
if (opts && opts.vista && opts.vista !== '3d') return (S && S._aplicarVistaNa) ? S._aplicarVistaNa(opts.vista, v) : { ok: false, erro: 'visualizador não montado' };
return (S && S._aplicarVista) ? S._aplicarVista(v, opts) : { ok: false, erro: 'visualizador não montado' };
},
estadoVista: function (opts) {
if (opts && opts.vista && opts.vista !== '3d') return (S && S._estadoDaVista) ? S._estadoDaVista(opts.vista) : null;
return (S && S._estadoVista) ? S._estadoVista() : null;
},
vistaTemEstado: function (id) { return !!(S && S._vistaTemEstado && S._vistaTemEstado(id)); },
vistaInfo: function (id) { return (S && S._vistaInfo) ? S._vistaInfo(id) : null; },
modelosSemArquivo: function () {
return ((S && S.modelos) || []).filter(function (m) { return !m.sintetico && !(m._bytes && m._bytes.length); })
.map(function (m) { return { mid: m.mid, nome: m.nome, doCache: !!m.doCache }; });
},
abrirDoCache: function (reg, estado) { return (S && S._montarDoCache) ? S._montarDoCache(reg, estado) : { ok: false, erro: 'visualizador não montado' }; },
chaveDe: function (el) {
if (typeof el === 'string') el = ((S && S.elementos) || []).filter(function (x) { return x.uid === el; })[0];
return (el && el.chave) || '';
},
modelosIdentidade: function () {
return ((S && S.modelos) || []).map(function (m) { return { mid: m.mid, nome: m.nome, modeloId: m.modeloId, versaoId: m.versaoId }; });
},
redimensionar: function () { if (S && S._resize) S._resize(); },
abrirArquivo: function (f) { if (S && S._abrirArquivo) S._abrirArquivo(f); },
abrirBytes: function (ab, nome, disc) { return (S && S._abrirBytes) ? S._abrirBytes(ab, nome, disc) : null; },
bytesModelos: function () { return (S && S._bytesModelos) ? S._bytesModelos() : []; },
carregarExemplo: function () { if (S && S._carregarExemplo) S._carregarExemplo(); },
aplicarEstado: aplicarEstado,
mostrarTudo: mostrarTudo,
focarClash: function (ids) { if (S) focarClash(ids); },
limparClash: function () { if (S) limparClash(); },
refinarClash: function (clashes, opts) { return refinarClash(clashes, opts); },
medir: function (on) { if (S && S._setMedir) S._setMedir(on == null ? !(S.medir && S.medir.on) : !!on); },
get ultimaMedida() { return (S && S.medir && S.medir.ultima) || null; },
area: function (on) { if (S && S._setArea) S._setArea(on == null ? !(S.area && S.area.on) : !!on); },
get ultimaArea() { return (S && S.medir && S.medir.ultimaArea) || null; },
angulo: function (on) { if (S && S._setAng) S._setAng(on == null ? !(S.ang && S.ang.on) : !!on); },
get ultimoAngulo() { return (S && S.medir && S.medir.ultimoAngulo) || null; },
limparMedidas: function () { if (S && S._limparMedidas) S._limparMedidas(); },
trenaEstado: function () {
if (!S || !S.medir) return null;
var m = S.medir, n = 0;
for (var i = 0; i < m.regs.length; i++) if (m.regs[i].tipo === 'dist') n++;
return { on: !!m.on, n: n, pendente: m.pts.length, ultima: m.ultima ? { valor: m.ultima.valor, horizontal: !!m.ultima.horizontal, eixo: m.ultima.eixo || '' } : null, eixo: m.eixo || 'livre', objs: m.objs.length };
},
desfazerMedida: function () { return (S && S._desfazerMedida) ? S._desfazerMedida() : null; },
get pavimentos() { return (S && S._pavLista) ? S._pavLista().map(function (p) { return { nome: p.nome, y0: p.y0, n: p.n }; }) : []; },
get pavimentoIsolado() { return (S && S.pav && S.pav.isolado) || null; },
isolarPavimento: function (nome) { return (S && S._isolarPavimento) ? S._isolarPavimento(nome) : false; },
plantaPavimento: function (nome) { return (S && S._plantaPavimento) ? S._plantaPavimento(nome) : false; },
isolarSelecao: function () { if (S && S._isolarSelecao) S._isolarSelecao(); },
ocultarSelecao: function () { if (S && S._ocultarSelecao) S._ocultarSelecao(); },
isolarTipo: function () { if (S && S._isolarTipo) S._isolarTipo(); },
restaurarVisibilidade: function () { if (S && S._restaurarVis) S._restaurarVis(); },
abrirXR: function () { if (S && S._toggleXR) S._toggleXR(); },
painelXRAberto: function () { return !!(S && S.xrPanel && S.xrPanel.style.display === 'flex'); },
pontoNaTela: function (x, y) { return S && S._pontoNaTela ? S._pontoNaTela(x, y) : null; },
apoiarCaixa: function (uids) { return S && S._apoiarCaixa ? S._apoiarCaixa(uids) : null; },
apoiarRaios: function (pts, o) { return S && S._apoiarRaios ? S._apoiarRaios(pts, o) : []; },
apoiarFantasma: function (uids) { return S && S._apoiarFantasma ? S._apoiarFantasma(uids) : 0; },
apoiarDy: function (dy) { if (S && S._apoiarDy) S._apoiarDy(dy); },
apoiarLimpar: function () { if (S && S._apoiarLimpar) S._apoiarLimpar(); },
apoiarInfo: function () { return S && S._apoiarInfo ? S._apoiarInfo() : null; },
_apoiando: function (on) { if (S) S._apoiando = !!on; },
apoiarCanvas: function () { return S && S.renderer ? S.renderer.domElement : null; },
aoTocar: function (fn) { if (S) S._aoTocar = typeof fn === 'function' ? fn : null; },
coletarCliques: function (fn) { if (S) S._aoClicarPeca = typeof fn === 'function' ? fn : null; return !!(S && S._aoClicarPeca); },
coletandoCliques: function () { return !!(S && S._aoClicarPeca); },
_cliqueColetorEm: function (x, y) { if (S && S._cliqueColetor) S._cliqueColetor({ clientX: x, clientY: y }); },
volumeMalha: function (uid) { return (S && S._volumeMalha) ? S._volumeMalha(uid) : null; },
icarGeometria: function (uids) { return (S && S._icar) ? S._icar.geometria(uids) : {}; },
icarChao: function () { return (S && S._icar) ? S._icar.chao() : 0; },
icarMarcarPonto: function (fn, opts) { if (S) { S._aoMarcarPonto = typeof fn === 'function' ? fn : null; S._aoMarcarOpts = S._aoMarcarPonto ? (opts || null) : null; } return !!(S && S._aoMarcarPonto); },
icarSondar: function (pts) { return (S && S._icar) ? S._icar.sondar(pts) : []; },
icarPavimentos: function () { return (S && S._pavLista) ? S._pavLista().map(function (p) { return { nome: p.nome, elev: p.elev, y0: p.y0, n: p.n }; }) : []; },
icarMarcandoPonto: function () { return !!(S && S._aoMarcarPonto); },
_icarMarcarEm: function (x, y) { if (S && S._aoMarcarPonto) { var f = S._aoMarcarPonto, o = S._aoMarcarOpts; S._aoMarcarPonto = null; S._aoMarcarOpts = null; f(S._icar.pontoNoChao(x, y, o)); return true; } return false; },
icarDesenhar: function (c) { return (S && S._icar) ? S._icar.desenhar(c) : { ok: false, erro: 'visualizador não montado' }; },
icarLimpar: function () { if (S && S._icar) S._icar.limpar(); },
icarSimular: function (s) { return (S && S._icar) ? S._icar.simular(s) : { ok: false, erro: 'visualizador não montado' }; },
icarSimulando: function () { return !!(S && S._icar && S._icar.simulando()); },
icarPararSimulacao: function () { if (S && S._icar) S._icar.parar(); },
icarCaptura: function (vista) { return (S && S._icar) ? S._icar.captura(vista) : null; },
icarEnquadrar: function () { return !!(S && S._icar && S._icar.enquadrar()); },
_cristalEstado: function () { return (S && S._cristalEstado) ? S._cristalEstado() : null; },
_cristalPular: function () { if (S && S._cristalPular) S._cristalPular(); },
_cristalDiag: function () { return (S && S._cristalDiag) ? S._cristalDiag() : null; },
_cristalCanto: function () { return (S && S._cristalCanto) ? S._cristalCanto() : null; },
_cristalCongelar: function (ms) { if (S && S._cristalCongelar) S._cristalCongelar(ms); },
_icarEstado: function (uids) { return (S && S._icar) ? S._icar.estado(uids) : null; },
icarColisoes: function (opts) { return (S && S._icar) ? S._icar.colisoes(opts || {}) : { ok: false, erro: 'visualizador não montado' }; },
icarVisada: function (o) { return (S && S._icar) ? S._icar.visada(o) : { ok: false, erro: 'visualizador não montado' }; },
icarCaixas: function (fora, regiao) { return (S && S._icar) ? S._icar.caixas(fora, regiao) : []; },
icarMapa: function (mp) { return (S && S._icar) ? S._icar.mapa(mp) : { ok: false, erro: 'visualizador não montado' }; },
icarPlanta: function (cfg) { return (S && S._icar) ? S._icar.planta(cfg) : { ok: false, erro: 'visualizador não montado' }; },
icarGoogle3d: function (cfg) { return (S && S._icar) ? S._icar.google3d(cfg) : Promise.resolve({ ok: false, erro: 'visualizador não montado' }); },
icarGoogle3dEstado: function () { return (S && S._icar) ? S._icar.google3dEstado() : null; },
_icarGoogle3dSondar: function (x, y) { return (S && S._icar) ? S._icar.google3dSondar(x, y) : null; },
icarFotoHD: function (o) { return (S && S._icar) ? S._icar.fotoHD(o) : { ok: false, erro: 'visualizador não montado' }; },
icarLocal: function (cfg) { return (S && S._icar) ? S._icar.local(cfg) : { ok: false, erro: 'visualizador não montado' }; },
icarGeoIfc: function () { return (S && S._icar) ? S._icar.geoIfc() : { ok: false, motivo: 'visualizador não montado' }; },
_icarLocalEstado: function () { return (S && S._icar) ? S._icar.localEstado() : null; },
_icarPlantaPonto: function (x, y) { return (S && S._icar) ? S._icar.plantaPonto(x, y) : null; },
_icarPlantaEstado: function () { return (S && S._icar) ? S._icar.plantaEstado() : null; },
_icarMapaEstado: function () { return (S && S._icar) ? S._icar.mapaEstado() : null; },
icarSimIr: function (t) { return (S && S._icar) ? S._icar.simIr(t) : false; },
icarSimPausado: function () { return (S && S._icar) ? S._icar.simPausado() : false; },
icarPerfil: function (uid) { return (S && S._icarPerfil) ? S._icarPerfil(uid) : null; },
icarGirar: function (on, dur) { return (S && S._icar) ? S._icar.girar(on, dur) : false; },
icarGirando: function () { return (S && S._icar) ? S._icar.girando() : false; },
icarTheta: function (graus) { return (S && S._icar) ? S._icar.theta(graus) : null; },
icarSobrecarga: function (k) { return (S && S._icar) ? S._icar.sobrecarga(k) : null; },
icarOpcoes: function (o) { return (S && S._icar) ? S._icar.opcoes(o || {}) : false; },
_icarEquipEstado: function () { return (S && S._icar) ? S._icar.equipEstado() : null; },
pinos: function (lista) { if (S && S._pinos) S._pinos(lista || []); },
olharPara: function (p, dist) { if (S && S._olharPara) S._olharPara(p, dist); },
tetoVisitante: function (frac) { return S && S._tetoVisitante ? S._tetoVisitante(frac) : null; },
disciplinas: function () { return S && S._disciplinas ? S._disciplinas() : []; },
disciplinaVisivel: function (chave, on) { if (S && S._disciplinaVisivel) S._disciplinaVisivel(chave, on); },
arquivoRA: function (formato, modo) { return S && S._arquivoRA ? S._arquivoRA(formato, modo) : { ok: false, erro: 'visualizador não montado' }; },
selecionarEm: function (x, y) { if (S && S._selecionarEm) S._selecionarEm(x, y); },
_selecionarUid: function (uid) { return !!(S && S._selecionarUid && S._selecionarUid(uid)); },
selecionar: function (uids, modo) { return (S && S._selAplicar) ? S._selAplicar(uids || [], modo || 'trocar') : []; },
selecao: function () { return { uids: (S && S._selAtual) ? S._selAtual() : [] }; },
contornoEditar: function () { return !!(S && S._ctr && S._ctr.editar()); },
contornoPendentes: function () { if (!S || !S._ctr) return null; var r = S._ctr.pendentes(); r.sub = S.edit && S.edit.sub; r.on = !!(S.edit && S.edit.on); r.hint = S._hintUltimo || ''; return r; },
contornoEstado: function () { return (S && S._ctr) ? S._ctr.sessaoEstado() : null; },
setasCtx: function () { return (S && S._setasCtx) ? S._setasCtx() : null; },
opsApagarIfc: function (uids) { return (S && S._opsApagarIfc) ? S._opsApagarIfc(uids || []) : []; },
uidEm: function (x, y) { return (S && S.alive && S._uidEm) ? S._uidEm(x, y) : null; },
uidsNaVista3d: function () { return (S && S._uidsNaVista3d) ? S._uidsNaVista3d() : []; },
pisoIfcEm: function (x, z, yTopo) { return (S && S.alive && S._pisoIfcEm) ? S._pisoIfcEm(x, z, yTopo) : null; },
ocultarUids: function (uids) { return (S && S._ocultarUids) ? S._ocultarUids(uids || []) : 0; },
algoOculto: function () { return !!(S && S._algoOculto && S._algoOculto()); },
imersivo: function (modo) { if (!S || !S.xr) return false; if (S.xr.on) return true; if (S._toggleXR && (!S.xrPanel || S.xrPanel.style.display !== 'flex')) S._toggleXR(); var b = S.xrPanel && S.xrPanel.querySelector('[data-x="' + (modo || 'caminhar') + '"]'); if (b) { b.click(); return true; } return false; },
imersivoAtivo: function () { return !!(S && S.xr && S.xr.on); },
sairImersivo: function () { if (S && S._sairImersivo) S._sairImersivo(); },
foto: function () { return (S && S._tirarFoto) ? S._tirarFoto() : null; },
donoDaPintura: function () { return (S && S._pinturaDono) || null; },
contarVisiveis: function () { return (S && S._contarVisiveis) ? S._contarVisiveis() : 0; },
_contarMalhasVisiveis: function () { return (S && S._contarMalhasVisiveis) ? S._contarMalhasVisiveis() : 0; },
aoMudarVisibilidade: function (fn) { if (S) S._onContadores = fn; },
desenharQuadro: function (fundo) { return (S && S._desenharQuadro) ? S._desenharQuadro(fundo) : null; },
desenharQuadroEm: function (fundo, larg, alt, opts) { return (S && S._desenharQuadroEm) ? S._desenharQuadroEm(fundo, larg, alt, opts) : null; },
quadroLinhas: function (larg, alt) {
if (!S || !S._desenharQuadroEm || !S._setEstiloDesenho || !S._estiloOn) return null;
var antes = !!S._estiloOn();
try { if (!antes) S._setEstiloDesenho(true, true); return S._desenharQuadroEm('#ffffff', larg, alt); }
catch (e) { return null; }
finally { if (!antes) { try { S._setEstiloDesenho(false, true); } catch (e2) {} } }
},
estiloDesenhoLigado: function () { return !!(S && S._estiloOn && S._estiloOn()); },
enquadrarAgora: function () { if (S && S._enquadrar) { try { S._enquadrar(); return true; } catch (e) {} } return false; },
rotuloElementos: function () { return (S && S._rotuloElementos) ? S._rotuloElementos() : ""; },
plantaBaixa: function (o) {
o = o || {};
if (!S || !S._gerarPlantaTec) return null;
var y = o.y != null ? o.y : (S.planta && S.planta.plane ? S.planta.plane.constant : null);
if (y == null) return null;
return S._gerarPlantaTec({ y: y, escala: o.escala || 50, cotas: o.cotas !== false, prof: o.prof || 3, rotAlt: o.rotAlt });
},
estiloDesenho: function (on) { if (S && S._setEstiloDesenho) S._setEstiloDesenho(on == null ? !(S._estiloOn && S._estiloOn()) : !!on); },
estiloDesenhoAtivo: function () { return !!(S && S._estiloOn && S._estiloOn()); },
sistema: function (on) { if (S && S._setSistema) S._setSistema(on == null ? !(S._sisColorOn && S._sisColorOn()) : !!on); },
tema: function (id) { return !!(S && S._definirTema && S._definirTema(id)); },
sistemaOn: function () { return !!(S && S._sisColorOn && S._sisColorOn()); },
sistemaInfo: function () { return (S && S._sisInfo) ? S._sisInfo() : null; },
sistemaClassificar: function (texto) { return (S && S._sisClassificar) ? S._sisClassificar(texto) : null; },
coresCategoria: function (on) { return !!(S && S._setCoresCat && S._setCoresCat(on == null ? !(S._coresCatOn && S._coresCatOn()) : !!on)); },
coresCategoriaOn: function () { return !!(S && S._coresCatOn && S._coresCatOn()); },
coresCategoriaInfo: function () { return (S && S._catInfo) ? S._catInfo() : { on: false, contagem: {}, ocultas: {}, escondidas: 0, pecas: 0 }; },
coresCategoriaOcultas: function (mapa) { return (S && S._catOcultas) ? S._catOcultas(mapa) : {}; },
coresCategoriaRepintar: function () { if (S && S._catRepintar) S._catRepintar(); },
coresCategoriaVista: function (id, on, ocultas) { return !!(S && S._catVista && S._catVista(id, on, ocultas)); },
categoriaDaPeca: function (uid, tipo) { return (S && S._catDeUid) ? S._catDeUid(uid, tipo) : null; },
blocok: function (opts) { return (S && S.blocok) ? S.blocok(opts) : null; },
blocokParedes: function () { return (S && S._extrairParedesBlocok && S._blocokLiberado && S._blocokLiberado()) ? S._extrairParedesBlocok() : { paredes: [], vaosDet: 0 }; },
blocokPlanilha: function () { return (S && S.blocokPlanilha) ? S.blocokPlanilha() : null; },
propriedades: function (uid) { return (S && S._propsCompletas) ? S._propsCompletas(uid) : []; },
thumbFamilia: function (uid, maxPx) { return (S && S._thumbFamilia) ? S._thumbFamilia(uid, maxPx) : null; },
carregarSintetico: function (caixas, nome) { return (S && S._carregarSintetico) ? S._carregarSintetico(caixas, nome) : null; },
soloMostrar: function (def) { return (S && S._soloMostrar) ? S._soloMostrar(def) : { ok: false, erro: 'visualizador não montado' }; },
soloLimpar: function () { if (S && S._soloLimpar) S._soloLimpar(); },
soloProfundidade: function (zIfc) { return (S && S._soloProfundidade) ? S._soloProfundidade(zIfc) : false; },
soloDestacar: function (u) { return (S && S._soloDestacar) ? S._soloDestacar(u) : null; },
soloOpacidade: function (a) { return (S && S._soloOpacidade) ? S._soloOpacidade(a) : null; },
soloEstado: function () { return (S && S._soloEstado) ? S._soloEstado() : { on: false }; },
editar: function (on) { if (S && S._setEdit) S._setEdit(on == null ? !(S.edit && S.edit.on) : !!on); },
espessuraTipo: function (metros, rotulo) { return !!(S && S._setEspEditor && S._setEspEditor(metros, rotulo)); },
espessuraAtual: function () { return (S && S._espEditor) ? S._espEditor() : null; },
editarOps: function () { return (S && S._editOps) ? S._editOps() : []; },
editarAplicar: function (ops) { if (S && S._editAplicar) S._editAplicar(ops); },
precisao: function () { return (S && S._prec) ? S._prec.api : null; },
editarPreviaInst: function (ops) { return (S && S._editPreviaInst) ? S._editPreviaInst(ops) : { ok: false, malhas: 0 }; },
editarPrevia: function (ops) { return (S && S._editPrevia) ? S._editPrevia(ops) : { ok: false, malhas: 0 }; },
editarBase: function () { return S && S.edit && isFinite(S.edit.base) ? S.edit.base : 0; },
pontoPlanoY: function (clientX, clientY, y) { return (S && S._pontoPlanoY) ? S._pontoPlanoY(clientX, clientY, y) : null; },
ifcConvLista: function () { return (S && S._ifcConvLista) ? S._ifcConvLista() : []; },
ifcConvPeca: function (uid) { return (S && S._ifcConvPeca) ? S._ifcConvPeca(uid) : null; },
editarLote: function (lote) {
if (!S || !S._editOpExterna || !lote || lote.op !== 'lote') return false;
if (window.BimGrupos && BimGrupos.redirecionar && S.edit && S.edit.estado) lote = BimGrupos.redirecionar(lote, S.edit.estado);
var l = BimEdit.sanear([lote])[0]; if (!l) return false;
S._editOpExterna(l); return true;
},
familiasDefinir: function (lista) { if (S && S._famDefinir) { S._famDefinir(lista); if (S._editReconstruir) S._editReconstruir(); return true; } return false; },
editarArmar: function (sub, par) {
if (!S || !S._setEdit || !S.edit) return false;
var ed = S.edit; par = par || {};
if (sub === 'familia') { ed.famSel = { famId: par.famId, tipoId: par.tipoId, inst: par.inst || {} }; ed.famRot = 0; }
if (sub === 'viga') { if (par.b > 0) ed.vigaB = +par.b; if (par.h > 0) ed.vigaH = +par.h; }
if (sub === 'cobertura') { if (par.inclinacao > 0) ed.cobIncl = +par.inclinacao; if (par.aguas) ed.cobAguas = par.aguas === 1 ? 1 : 2; if (par.beiral != null) ed.cobBeiral = Math.max(0, +par.beiral); }
if (sub && S._volSubs && S._volSubs[sub] && S._volParametros) S._volParametros(par);
if (!ed.on) S._setEdit(true);
if (!sub) { if (ed.sub && S._setEditSub) S._setEditSub(ed.sub); return true; }
if (ed.sub === sub) { ed.sub = null; }
if (S._setEditSub) S._setEditSub(sub);
return ed.sub === sub;
},
volumeParametros: function (par) { return (S && S._volParametros) ? S._volParametros(par || {}) : null; },
volumeConcluir: function () { return !!(S && S._volConcluir && S._volConcluir()); },
volumeProps: function (id, mud) {
if (!S || !S._editOpExterna || !mud) return false;
var o = { op: 'volProps', id: id }; if (mud.categoria) o.categoria = mud.categoria; if (mud.material != null) o.material = mud.material; if (mud.nome != null) o.nome = mud.nome;
S._editOpExterna(o); return true;
},
_volEstado: function () { var e = S && S.edit; return e && e.vol ? { on: !!e.on, sub: e.sub, pts: e.vol.pts.length, face: !!e.vol.face, alvo: e.vol.alvo, eixo: !!e.vol.eixo, dica: S._hintUltimo || "", mesclados: S.scene.children.filter(function (g) { return g.userData && g.userData.agregadoDe === 'edit'; }).length } : null; },
csgCarregar: function () { return (S && S._csgCarregar) ? S._csgCarregar().then(function () { return true; }, function () { return false; }) : Promise.resolve(false); },
ifcSaida: function (o) { return (S && S._ifcSaida) ? S._ifcSaida(o) : Promise.resolve({ ok: false, erro: 'visualizador não montado' }); },
parametrosProjeto: function (p) {
if (!S) return null;
if (arguments.length) S._paramProjeto = p && typeof p === 'object' ? JSON.parse(JSON.stringify(p)) : null;
return S._paramProjeto || null;
},
editarB2: function (cfg) { return (S && S._b2Config) ? S._b2Config(cfg) : null; },
planta2d: function () { return (S && S._planta2d) ? S._planta2d : null; },
b2Fechar: function () { return !!(S && S._b2FecharExt && S._b2FecharExt()); },
realceTelhadoPeca: function (pos) { return (S && S._telPecaRealce) ? S._telPecaRealce(pos) : false; },
raioEm: function (clientX, clientY) { return (S && S._raioDe) ? S._raioDe(clientX, clientY) : null; },
dica: function (msg) { if (S && S._hint) S._hint(msg); },
b2Op: function (o) {
if (S && S._editOpExterna && o && ['tabela', 'tabelaApagar', 'identificar', 'desidentificar'].indexOf(o.op) >= 0) { if (!BimEdit.sanear([o]).length) return false; S._editOpExterna(o); return true; }
if (o && window.BimGrupos && BimGrupos.redirecionar && S && S.edit && S.edit.estado) o = BimGrupos.redirecionar(o, S.edit.estado);
if (!S || !S._editOpExterna || !o || ['ajustar', 'renomear', 'apagar', 'mover', 'eixo', 'ajustarTipo', 'marcar', 'forro', 'ambiente', 'ajustarAmbiente', 'separador', 'delimitar', 'ambienteRegra', 'fases', 'grupo', 'opcoes',
'topossolido', 'subregiao', 'plataforma', 'divisa', 'implantacao', 'compTerreno', 'rotuloCurvas',
'telhado', 'borda', 'fundacao', 'graute'].indexOf(o.op) < 0 && !(window.BimAnotP7 && BimAnotP7.ehOp(o.op)) && !(window.BimCotas && BimCotas.ehOp(o.op))) return false;
if (!BimEdit.sanear([o]).length) return false;
S._editOpExterna(o); return true;
},
desfazer: function () { return !!(S && S._editDesfazer && S._editDesfazer()); },
refazer: function () { return !!(S && S._editRefazer && S._editRefazer()); },
editarEstado: function () {
if (!S || !S.edit) return null;
var st = S.edit.estado || BimEdit.aplicar(S.edit.ops || []);
var r = { estado: st, ops: (S.edit.ops || []).length, refazer: (S.edit.redo || []).length };
Object.defineProperty(r, 'qto', { enumerable: true, configurable: true, get: function () { var q = BimEdit.qto(st, S._famAval); Object.defineProperty(r, 'qto', { value: q, enumerable: true, writable: true, configurable: true }); return q; } });
return r;
},
instanciaInfo: function (id) {
if (!S || !S.edit || !S.edit.estado) return null;
var f = (S.edit.estado.familias || []).filter(function (x) { return x.id === id; })[0];
if (!f) return null;
return { instancia: JSON.parse(JSON.stringify(f)), avaliado: S._famAval(f.famId, f.tipoId, f.inst) };
},
elementoOrcar: function (id, servicos) {
if (!S || !S.edit || !S._editOpExterna) return false;
S._editOpExterna({ op: 'orcar', id: id, servicos: BimEdit.limparServicos(servicos) }); return true;
},
instOp: function (o) { if (!S || !S._editOpExterna || !o || !o.op) return false; S._editOpExterna(o); return true; },
editarReconstruir: function () { if (S && S._editReconstruir) { S._editReconstruir(); return true; } return false; },
instNivelRefazer: function () { return (S && S._instNivelRefazer) ? S._instNivelRefazer() : { ok: false, erro: 'Visualizador não montado.' }; },
instMedir: function () { return (S && S._instMedir) ? S._instMedir() : { malhas: 0, tri: 0, porPapel: {} }; },
_instCtx: function () { return (S && S._instCtx) ? S._instCtx() : null; },
_andaime3d: function () { return (S && S._andaime3d) ? S._andaime3d.resumo() : null; },
_malhaEdit: function (id) { return (S && S.meshPorUid) ? (S.meshPorUid['edit:' + id] || null) : null; },
_andaimeObjetos: function () { var o = []; if (S && S.scene) S.scene.traverse(function (m) { if (m.isInstancedMesh && m.userData && m.userData.andaime3d) o.push(m); }); return o; },
_grade: function (liga) { if (!S || !S.scene) return 0; var n = 0; S.scene.traverse(function (o) { if (o.isGridHelper || (o.type === "GridHelper")) { o.visible = !!liga; n++; } }); return n; },
_olharPara: function (pos, alvo) {
if (!S || !S.camera || !S.orbit) return false;
var P = new THREE.Vector3(pos[0], pos[1], pos[2]), A2 = new THREE.Vector3(alvo[0], alvo[1], alvo[2]);
if (S.modelRoot) { S.modelRoot.updateMatrixWorld(true); P.applyMatrix4(S.modelRoot.matrixWorld); A2.applyMatrix4(S.modelRoot.matrixWorld); }
S.camera.position.copy(P); S.orbit.target.copy(A2); S.orbit.update(); return true;
},
_corMalha: function (id) { var m = S && S.meshPorUid['edit:' + id]; return m && m.material && m.material.color ? m.material.color.getHexString() : null; },
_corMaterialFam: function (nome) { return (S && S._famCorDefinida) ? S._famCorDefinida(nome) : false; },
familiaAvaliar: function (famId, tipoId, inst) { return (S && S._famAval) ? S._famAval(famId, tipoId, inst) : null; },
luzesDoModelo: function () { return (S && S._luzes) ? S._luzes() : []; },
familiaCategoria: function (famId) { return (S && S._famCat) ? S._famCat(famId) : null; },
instanciaAlterar: function (id, mud) {
if (!S || !S.edit || !S._editOpExterna) return false;
mud = mud || {};
var o = { op: 'instancia', id: id };
if (mud.famId != null) { o.famId = String(mud.famId); if (mud.x != null) o.x = +mud.x; if (mud.z != null) o.z = +mud.z; }
if (mud.tipoId != null) o.tipoId = mud.tipoId;
if (mud.inst) o.inst = mud.inst;
if (mud.rotY != null) o.rotY = +mud.rotY;
if (mud.y != null) o.y = +mud.y;
S._editOpExterna(o); return true;
},
telaDe: function (x, y, z) { return (S && S._telaDe) ? S._telaDe(x, y, z) : null; },
familiaPreview: function (canvas, avaliado) { return (S && S._famPreview) ? S._famPreview(canvas, avaliado) : false; },
visiveis: function () {
var v = 0; if (!S) return 0;
S.modelRoot.children.forEach(function (g) { if (g.visible === false) return; (g.children || []).forEach(function (m) { if (m.visible) v++; }); });
return v;
},
_p3dTexto: function (txt, nome) { if (S && S._p3dProcessar) S._p3dProcessar(txt, nome); },
painelP3d: function () { if (S && S._toggleP3d) { S._toggleP3d(); return true; } return false; },
voo: function (on) { if (S && S._setVoo) { S._setVoo(on); return true; } return false; },
home: function () { if (S && S._fit) { S._fit(); return true; } return false; },
recuperarVista: function (o) { return (S && S._recuperarVista) ? S._recuperarVista(o) : { ok: false, feito: [] }; },
canvasDesenho: function () { return S ? (S._canvasDesenho ? S._canvasDesenho() : S.renderer.domElement) : null; },
saude3d: function () {
if (!S) return null;
var sd = S._saude3d || {}, gl = null; try { gl = S.renderer.getContext(); } catch (_) {}
return { erros: sd.erros || 0, seguidos: sd.seguidos || 0, ultErro: sd.ultErro || '', perdas: S._ctxPerdas || 0, perdido: !!S._ctxPerdido || !!(gl && gl.isContextLost()),
tentativas: sd.tentativas || 0, renderNovo: !!S._cvVivo, aviso: S._aviso3d ? S._aviso3d() : null, far: S.camera.far, near: S.camera.near, diag: (S._diag3d || []).slice(-12) };
},
painelVis: function () { if (S && S._toggleVis) { S._toggleVis(); return true; } return false; },
painelPav: function () { if (S && S._togglePav) { S._togglePav(); return true; } return false; },
planta: function (on) { if (S && S._setPlanta) { var q = on == null ? !(S.planta && S.planta.on) : !!on; if (!q && !(S.planta && S.planta.on)) return; S._setPlanta(q); } },
corte: function (on) { if (S && S._setCorteL) S._setCorteL(on == null ? !(S.corteL && S.corteL.on) : !!on); },
corteConfig: function (cfg) {
if (!S || !S.corteL || !S.corteL.on) return;
if (cfg && cfg.az != null) { S.corteL.az = +cfg.az; var e1 = S.corteLPanel.querySelector('[data-k="az"]'); if (e1) e1.value = +cfg.az; }
if (cfg && cfg.inc != null) { S.corteL.inc = +cfg.inc; var e2 = S.corteLPanel.querySelector('[data-k="inc"]'); if (e2) e2.value = +cfg.inc; }
if (cfg && cfg.pos0a1 != null) { var e3 = S.corteLPanel.querySelector('[data-k="pos"]'); if (e3) e3.value = Math.round(Math.max(0, Math.min(1, +cfg.pos0a1)) * 1000); }
if (cfg && cfg.inv != null) S.corteL.inv = !!cfg.inv;
if (S._aplicarCorteL) S._aplicarCorteL();
},
snapConfig: function (cfg) {
if (!S || !S.snap) return { on: false };
['on', 'v', 'm', 'a', 'i', 'c'].forEach(function (k) { if (cfg && cfg[k] != null) S.snap[k] = !!cfg[k]; });
try { localStorage.setItem('orcapro:bim:snap', JSON.stringify({ on: S.snap.on, v: S.snap.v, m: S.snap.m, a: S.snap.a, i: S.snap.i, c: S.snap.c })); } catch (_) {}
return { on: S.snap.on, v: S.snap.v, m: S.snap.m, a: S.snap.a, i: S.snap.i, c: S.snap.c };
},
corteTecnico: function (o) { return (S && S._gerarCorteTec) ? S._gerarCorteTec(o || {}) : null; },
importarMalha: function (nome, dados, o) { return (S && S._importarMalha) ? S._importarMalha(nome, dados, o) : Promise.resolve({ ok: false, erro: 'Visualizador não montado.' }); },
parametrosExtras: function (extras) {
if (!S) return false;
S._extrasPorGuid = S._extrasPorGuid || {};
Object.keys(extras || {}).forEach(function (k) {
var x = extras[k]; if (!x || !x.porGuid) return;
Object.keys(x.porGuid).forEach(function (g) { S._extrasPorGuid[g] = { programa: x.programa || k, grupos: x.porGuid[g] }; });
});
return true;
},
malhaFontes: function () { return (S && S.modelos ? S.modelos : []).filter(function (m) { return m.malha; }).map(function (m) { return { mid: m.mid, nome: m.nome, bytes: m._fonteMalha ? m._fonteMalha.bytes : null, opcoes: m._fonteMalha ? m._fonteMalha.opcoes : null }; }); },
ifcFontes: function () { return (S && S.modelos ? S.modelos : []).filter(function (m) { return !m.sintetico && !m.editor && !m.malha; }).map(function (m) { return { mid: m.mid, nome: m.nome, disciplina: m.disciplina, bytes: (m._fonteIfc && m._fonteIfc.byteLength) ? new Uint8Array(m._fonteIfc) : null }; }); },
vista2d: function (def) { return (S && S._vista2d) ? S._vista2d(def || {}) : { ok: false, erro: 'Visualizador não montado.' }; },
pavimentos2d: function () {
if (!S || !S.modelRoot) return { pav: [], caixa: null };
var BF = window.BimFluidez, sig = null;
if (BF && BF.Memo && S._sigGeo) {
try { sig = S._sigGeo(); } catch (_) { sig = null; }
if (!S._pav2dMemo) S._pav2dMemo = new BF.Memo();
var r = S._pav2dMemo.obter(sig, function () { return window.BIM._pavimentos2dCalc(); });
return BF.copia ? BF.copia(r) : JSON.parse(JSON.stringify(r));
}
return window.BIM._pavimentos2dCalc();
},
assinaturaVista: function () { return (S && S._sigVis) ? S._sigVis() : null; },
cameraParadaMs: function () { return (S && S._camMudouEm) ? performance.now() - S._camMudouEm : Infinity; },
_pavimentos2dCalc: function () {
var b = new THREE.Box3().setFromObject(S.modelRoot), lst = [];
try { lst = (S._pavimentosCorte ? S._pavimentosCorte() : []).map(function (p) { return { nome: p.nome, y: p.y - 1.2 }; }); } catch (e) { lst = []; }
var cxM = b.isEmpty() ? null : { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] };
var ed = null, cotas = []; try { ed = S._edificacao ? S._edificacao() : null; cotas = ed && S._edificacaoCota ? S._edificacaoCota() : []; } catch (eE) { ed = null; }
return { pav: lst, caixa: cxM, caixaEdif: ed && ed.caixa ? ed.caixa : cxM, cotas: cotas || [],
entorno: ed ? { criterio: ed.criterio, texto: ed.texto, excluidos: ed.nExcluidos, total: ed.nTotal, motivos: ed.motivos } : null };
},
edificacao: function () { return (S && S._edificacao) ? S._edificacao() : null; },
_aneisDe: function (arrArestas) { return (S && S._acharAneis) ? S._acharAneis(arrArestas) : null; },
_lupaEstado: function () { if (!S || !S.lupa) return null; var L = S.lupa; return { on: !!L.on, orbita: !!(S.orbit && S.orbit.enabled), x: L.x, y: L.y, id: L.id, esperando: !!L.timer, tipoSnap: L.sn && L.sn.tipo || null, mediDown: !!(S.medir && S.medir.down), ferramenta: !!(S._ferramentaClique && S._ferramentaClique()) }; },
_coordMatriz: function (mid) {
if (!S || !S.api || !S.api.GetCoordinationMatrix) return null;
var alvo = (mid != null) ? mid : (S.modelos.filter(function (m) { return typeof m.mid === 'number'; })[0] || {}).mid;
if (alvo == null) return null;
try { var m = S.api.GetCoordinationMatrix(alvo); return Array.prototype.slice.call(m); } catch (e) { return String(e && e.message || e); }
},
_snapAt: function (cx, cy, raio) { if (!S || !S._mirarEm) return null; var sn = S._mirarEm(cx, cy, raio || (S.snap ? S.snap.raio : 14)); if (!sn || !sn.p) return null; return { tipo: sn.tipo, p: [sn.p.x, sn.p.y, sn.p.z] }; },
_perf: function () {
if (!S || !S.alive || !S.renderer) return null;
try { S.renderer.info.reset(); } catch (_) {}
var t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
try { S.renderer.render(S.scene, S.camera); } catch (_) { return null; }
var msQuadro = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
var i = S.renderer.info;
var malhas = 0, geos = 0, vistos = {};
try {
S.modelRoot.traverse(function (o) {
if (!o.isMesh) return;
malhas++;
var g = o.geometry; if (g && !vistos[g.uuid]) { vistos[g.uuid] = 1; geos++; }
});
} catch (_) {}
var porCamada = { visiveisNaCamera: 0, ocultasDaCamera: 0, invisiveis: 0, foraDoModelo: 0, linhasNaCamera: 0 };
try {
S.scene.traverse(function (o) {
if (!(o.isMesh || o.isLine || o.isLineSegments || o.isPoints)) return;
if (o.isLine || o.isLineSegments || o.isPoints) {
var vl = true; for (var pl = o; pl; pl = pl.parent) if (pl.visible === false) { vl = false; break; }
if (vl && S.camera.layers.test(o.layers)) porCamada.linhasNaCamera++;
return;
}
var vis = true;
for (var p = o; p; p = p.parent) if (p.visible === false) { vis = false; break; }
if (!vis) { porCamada.invisiveis++; return; }
if (S.camera.layers.test(o.layers)) porCamada.visiveisNaCamera++; else porCamada.ocultasDaCamera++;
var dentro = false; for (var q = o; q; q = q.parent) if (q === S.modelRoot) { dentro = true; break; }
if (!dentro) porCamada.foraDoModelo++;
});
} catch (_) {}
return {
drawCalls: i.render.calls, triangulos: i.render.triangles,
geometriasNaGpu: i.memory.geometries, texturas: i.memory.textures,
malhasNaCena: malhas, geometriasDistintas: geos, cena: porCamada,
msQuadro: +msQuadro.toFixed(2),
mascaraCamera: S.camera.layers.mask, autoReset: S.renderer.info.autoReset,
sombras: !!(S.renderer.shadowMap && S.renderer.shadowMap.enabled),
elementos: (S.elementos || []).length,
modelos: (S.modelos || []).length
};
},
_perfClique: function (cx, cy, n) {
if (!S || !S._raycastEm) return null;
n = n || 20;
var t0 = performance.now(), acertos = 0;
for (var k = 0; k < n; k++) { if (S._raycastEm(cx, cy)) acertos++; }
return { ms: +((performance.now() - t0) / n).toFixed(3), amostras: n, acertos: acertos };
},
_cota: function (on, modo) { if (S && S._setCota) S._setCota(on, modo); return this._cotaEstado(); },
_cotaEstado: function () { return (S && S._cotaEstado) ? S._cotaEstado() : null; },
_cotaIndice: function () { return (S && S._cotaIndice) ? S._cotaIndice() : null; },
numerarRede: function () { return (S && S._numerarRede) ? S._numerarRede() : null; },
numeracao: function () { return (S && S._numeracao) ? S._numeracao() : null; },
_testeTrena: function () { return S ? { S: S, THREE: THREE } : null; },
pranchaVivaApi: function () {
if (!S || !S.alive || !S.renderer) return null;
return { THREE: THREE, scene: S.scene, camera: S.camera, renderer: S.renderer, orbit: S.orbit, canvas: S.renderer.domElement, modelRoot: S.modelRoot,
raycast: S._raycastEm || null, tickExtra: S._tickExtra, tickPos: S._tickPos, host: S.host || null };
},
_px: function (p) { if (!S) return null; var v = new THREE.Vector3(p[0], p[1], p[2]).project(S.camera); var rc = S.renderer.domElement.getBoundingClientRect(); return { x: rc.left + (v.x + 1) / 2 * rc.width, y: rc.top + (1 - v.y) / 2 * rc.height }; },
_visiveis: function () { if (!S) return null; var v = 0, t = 0; S.modelRoot.children.forEach(function (g) { (g.children || []).forEach(function (m) { t++; if (m.visible) v++; }); }); return { visiveis: v, total: t }; },
_telaDe: function (x, y, z) { return (S && S._telaDe) ? S._telaDe(x, y, z) : null; },
_mouseEstado: function (zerar) { if (!S) return null; var r = { ultimoPivo: S._ultimoPivo || null }; if (zerar) S._ultimoPivo = null; return r; },
_cam: function () { if (!S) return null; var c = S.camera, t = S.orbit.target; return { p: [c.position.x, c.position.y, c.position.z], t: [t.x, t.y, t.z], near: c.near, far: c.far, rot: S.orbit.enableRotate }; },
_selecionarPrimeiro: function () {
if (!S) return null; var alvo = null;
S.modelRoot.children.some(function (g) { return (g.children || []).some(function (m) { if (m.userData && m.userData.expressID != null && m.visible) { alvo = m; return true; } return false; }); });
if (!alvo) return null;
if (S.selected) S.selected.material = S.prevMat;
S.selected = alvo; S.prevMat = alvo.material; alvo.material = S.selMat;
if (S._contornoSelecao) S._contornoSelecao(alvo);
return { tipo: alvo.userData.tipo, eid: alvo.userData.expressID, mid: alvo.userData.mid };
},
_temContorno: function () { if (!S) return false; var n = 0; S.scene.children.forEach(function (c) { if (c.type === 'LineSegments' && c.renderOrder === 1000) n++; }); return n; },
_contornoVis: function () { if (!S) return null; var v = null; S.scene.children.forEach(function (c) { if (c.type === 'LineSegments' && c.renderOrder === 1000) v = c.visible; }); return v; },
raioXSelecao: function () { if (S && S._raioXSelecao) S._raioXSelecao(); },
raioXTipo: function () { if (S && S._raioXTipo) S._raioXTipo(); },
limparRaioX: function () { if (S && S._limparRaioX) S._limparRaioX(); },
raioXChaves: function (chaves, msg) { return (S && S._raioXChaves) ? S._raioXChaves(chaves, msg) : 0; },
_ghostCount: function () { if (!S) return 0; var n = 0, gm = null; S.modelRoot.children.forEach(function (g) { (g.children || []).forEach(function (m) { if (m.material && m.material.opacity === 0.1 && m.material.transparent && m.material.depthWrite === false && m.material.color && m.material.color.getHex() === 0x93a7bd) n++; }); }); return n; },
_amberCount: function () { if (!S) return 0; var n = 0; S.modelRoot.children.forEach(function (g) { (g.children || []).forEach(function (m) { if (m.material === S.matAndamento) n++; }); }); return n; },
_chaoVis: function () { if (!S || !S.scene) return null; var v = null; S.scene.children.forEach(function (o) { if (o.type === 'Mesh' && o.geometry && o.geometry.type === 'PlaneGeometry' && o.material && o.material.map && o.renderOrder === -1) v = o.visible; }); return v; },
_envSet: function () { return !!(S && S.scene && S.scene.environment); },
_xr: function () { if (!S || !S.xr) return null; var x = S.xr, c = S.camera, m = S.modelRoot; return { on: x.on, mode: x.mode, escala: +(x.escala || 1).toFixed(4), oriOk: !!x.oriOk, travado: !!x.travado, camY: +c.position.y.toFixed(2), mScale: +m.scale.x.toFixed(4), mPos: [+m.position.x.toFixed(2), +m.position.y.toFixed(2), +m.position.z.toFixed(2)], camDist: +m.position.clone().sub(c.position).length().toFixed(2), camQuat: [+c.quaternion.x.toFixed(3), +c.quaternion.y.toFixed(3), +c.quaternion.z.toFixed(3), +c.quaternion.w.toFixed(3)] }; },
_xrEscala: function (f) { if (S && S._aplicarEscalaImersivo) S._aplicarEscalaImersivo(f); },
_xrCentralizar: function () { if (S && S._centralizarImersivo) S._centralizarImersivo(); },
_xrTickWalk: function () { if (S && S._xrWalk) S._xrWalk(0.016); },
_xrPasso: function () { if (S && S._xrStep) S._xrStep(); },
_xrSimPassos: function (mags) { return (S && S._xrSimPassos) ? S._xrSimPassos(mags) : 0; },
_passSens: function (v) { return (S && S._passSensSet) ? S._passSensSet(v) : 1; },
_chaoSet: function () { if (!S || !S.scene) return null; var c = null; S.scene.children.forEach(function (o) { if (o.type === 'Mesh' && o.geometry && o.geometry.type === 'PlaneGeometry' && o.material && o.material.map && o.renderOrder === -1) c = o; }); return c ? { x: c.scale.x, y: c.position.y } : null; },
_frame: function () { if (!S || !S.alive) return false; try { S.orbit.update(); for (var tx = 0; tx < S._tickExtra.length; tx++) { try { S._tickExtra[tx](0.016); } catch (_) {} } S.renderer.render(S.scene, S.camera); for (var tp = 0; tp < (S._tickPos || []).length; tp++) { try { S._tickPos[tp](0.016); } catch (_) {} } return true; } catch (_) { return false; } },
_foraDoClip: function (p) { return (S && S._foraDoClipRef) ? S._foraDoClipRef({ x: p[0], y: p[1], z: p[2] }) : false; },
_ctecModal: function () { return (S && S.ctecModal) ? S.ctecModal : null; },
_reqPintarTeste: function (pecas, resumo) { return (S && S._reqPintarTeste) ? S._reqPintarTeste(pecas, resumo) : ''; },
get elementos() { return elementosVivos(); },
get modelos() { return S && S._publicos ? S._publicos() : []; },
setTransparencia: function (mid, a) { if (S && S._setTransparencia) S._setTransparencia(mid, a); },
setVisivel: function (mid, v) { if (S && S._setVisivel) S._setVisivel(mid, v); },
setDisciplina: function (mid, d) { if (S && S._setDisciplina) S._setDisciplina(mid, d); },
removerModelo: function (mid) { if (S && S._removerModelo) S._removerModelo(mid); },
limpar: function () { if (S && S._limparTudo) S._limparTudo(); },
botao: function (k) {
if (!S || !S.bar) return false;
var b = S.bar.querySelector('[data-b="' + String(k).replace(/"/g, '') + '"]');
if (!b) return false;
b.click();
return true;
},
caixaCorte: function (on) { return (S && S._caixaCorte) ? S._caixaCorte(!!on) : false; },
caixaUids: function (uids) { return (S && S._caixaUids) ? S._caixaUids(uids) : null; },
caixasDe: function (uids) { return (S && S._caixasDe) ? S._caixasDe(uids) : {}; },
linhasOcultas: function (uids, on) { return (S && S._linhasOcultas) ? S._linhasOcultas(uids, !!on) : 0; },
linhasOcultasEstado: function () { return (S && S._linhasOcultasEstado) ? S._linhasOcultasEstado() : { uids: [], linhas: 0 }; },
caixaCorteEm: function (min, max, iso) { return (S && S._caixaCorteEm) ? S._caixaCorteEm(min, max, iso) : false; },
materiaisRealistas: function (on) {
if (S && S._estPrevia && S._estPrevia() && S._estiloVisual) {
if (S._texGravarPref) S._texGravarPref(!!on);
return S._estiloVisual(on ? 'realista' : 'sombreado').then(function () { return S._texEstado(); });
}
return (S && S._texEscolher) ? S._texEscolher(!!on) : Promise.resolve({ on: false });
},
estiloVisual: function (modo) { return (S && S._estiloVisual) ? S._estiloVisual(modo) : Promise.resolve(null); },
estiloLuz: function (o) { return (S && S._estLuz) ? S._estLuz(o) : false; },
estiloVisualEstado: function () { return (S && S._estEstado) ? S._estEstado() : null; },
estiloRedecidir: function () { return (S && S._estRedecidir) ? S._estRedecidir() : 0; },
materialDaPeca: function (uid) { return (S && S._estMaterialDaPeca) ? S._estMaterialDaPeca(uid) : null; },
materiaisEstado: function () { return (S && S._texEstado) ? S._texEstado() : { on: false }; },
cenaApresentacao: function () {
if (!S || !S.alive) return null;
var S0 = S;
return { THREE: THREE, get renderer() { return S0.renderer; }, canvas: function () { return S0._canvasDesenho ? S0._canvasDesenho() : null; }, scene: S.scene, camera: S.camera, orbit: S.orbit, modelRoot: S.modelRoot, modelos: S.modelos, host: S.host,
tickExtra: S._tickExtra, tickPos: S._tickPos, redimensionar: S._resize,
principalOculta: function (on) { if (on !== undefined) S._principalOculta = !!on; return !!S._principalOculta; } };
},
renderFonte: function () { return S ? { modelos: S.modelos, scene: S.scene, camera: S.camera, alvo: S.orbit ? S.orbit.target : null, origem: S._origemAgreg || null, modelRoot: S.modelRoot } : null; },
aberturaDe: function (uid) { return (S && S._aberturaDe) ? S._aberturaDe(uid) : null; },
abrirFechar: function (uid, abrir) { return (S && S._abrirFechar) ? S._abrirFechar(uid, abrir) : null; },
portas: function () { return (S && S._portas) ? S._portas() : []; },
partes: function () { return (S && S._partes) ? S._partes.estado() : []; },
abrirParte: function (id, parte, abrir) { var ix = S && S._partes ? S._partes.indice() : null, pt = ix && ix.portas[id + '|' + parte]; return pt ? S._partes.abrir(pt, abrir) : null; },
abrirTodasPartes: function (abrir) { return (S && S._partes) ? S._partes.todas(!!abrir) : 0; },
parteTela: function (id, parte) { return (S && S._partes && S._partesTela) ? S._partesTela(id, parte) : null; },
parteMalhas: function (id, parte) { var ix = S && S._partes ? S._partes.indice() : null, pt = ix && ix.portas[id + '|' + parte]; return pt ? pt.folhas[0].malhas : []; },
passeioPose: function (x, y, z, yaw, pitch) { if (!S || !S.fly) return null; S.camera.position.set(x, y, z); if (S._abrirUI && S._abrirUI.resetFreio) S._abrirUI.resetFreio(); if (yaw != null) S.fly.yaw = yaw; if (pitch != null) S.fly.pitch = pitch; return { on: !!S.fly.on, p: [S.camera.position.x, S.camera.position.y, S.camera.position.z], yaw: S.fly.yaw }; },
parteSobre: function (x, y) { var u = S && S._abrirUI; var a = u && u.alvoEm ? u.alvoEm(x, y, false) : null; return a ? { id: a.pt.id, parte: a.pt.parte, dist: a.dist } : null; },
caixaCorteAtiva: function () { return !!(S && S._cxMain && S._cxMain.on); },
vistaInstalacoes: function (on) { if (!S || !S._setVistaInst) return false; return on === undefined ? S._vistaInstOn() : S._setVistaInst(on); },
caixaCorteEstado: function () { return (S && S._cxMain) ? S._cxMain.estado() : null; },
caixaCorteSetaNaTela: function (k) {
if (!S || !S._cxMain || !S._cxMain.on || !S._cxMain.setas[k]) return null;
var p = S._cxMain.setas[k].position.clone().project(S.camera), r = S.renderer.domElement.getBoundingClientRect();
return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
},
ortogonal: function (on) { return (S && S._ortoMain) ? S._ortoMain(!!on) : false; },
grade: function (on) { return (S && S._grade) ? S._grade(on) : null; },
ortogonalAtivo: function () { return !!(S && S._ortoEstado && S._ortoEstado()); },
camPlanos: function () { return (S && S._camPlanos) ? S._camPlanos() : null; },
irParaInicio: function () { if (S && S._irInicio) { S._irInicio(); return true; } return false; },
principalOculta: function (on) { if (S) { S._principalOculta = !!on; if (S._cxMain) S._cxMain.suspender(!!on); if (!on && S._resize) S._resize(); } },
vistaNova: function (cont, nome) { return (S && S._novaVista && cont) ? S._novaVista(cont, nome) : null; },
vistaFechar: function (id) { return !!(S && S._fecharVista && S._fecharVista(id)); },
vistaMover: function (id, cont) { return !!(S && S._moverVista && S._moverVista(id, cont)); },
vistaVisivel: function (id, on) { var v = S && S.vistas && S.vistas[id]; if (v) v.visivel = !!on; return !!v; },
vistasRedimensionar: function () { if (S && S._redimVistas) S._redimVistas(); if (S && S._resize) S._resize(); },
vistaCaixaCorte: function (id, on) { var v = S && S.vistas && S.vistas[id]; return v && v.cx ? v.cx.ligar(!!on) : false; },
vistaRaio: function (id, x, y) { return S && S._raioVista ? S._raioVista(id, x, y) : null; },
vistaOrtogonal: function (id, on) { return !!(S && S._ortoVista && S._ortoVista(id, on)); },
vistaOrtoAtivo: function (id) { var v = S && S.vistas && S.vistas[id]; return !!(v && v.orto && v.orto.on); },
vistaCaixaAtiva: function (id) { var v = S && S.vistas && S.vistas[id]; return !!(v && v.cx && v.cx.on); },
vistasAbertas: function () { return S && S.vistas ? Object.keys(S.vistas).map(function (k) { var v = S.vistas[k]; return { id: v.id, nome: v.nome, caixa: !!(v.cx && v.cx.on), orto: !!(v.orto && v.orto.on) }; }) : []; },
vistaCamera: function (id) { var v = S && S.vistas && S.vistas[id]; return v ? { pos: v.camera.position.toArray(), alvo: v.orbit ? v.orbit.target.toArray() : v.alvo.toArray() } : null; },
temBotao: function (k) { return !!(S && S.bar && S.bar.querySelector('[data-b="' + String(k).replace(/"/g, '') + '"]')); },
botaoAtivo: function (k) { var b = S && S.bar && S.bar.querySelector('[data-b="' + String(k).replace(/"/g, '') + '"]'); if (!b) return false; return b.classList.contains('on') || !!(b.style.background && b.style.background !== 'transparent'); },
travar: function (on) { if (!S || !S._setTrava) return false; return S._setTrava(on == null ? !(S.trava && S.trava.on) : !!on); },
travado: function () { return !!(S && S.trava && S.trava.on); },
marcacoesMostrar: function (lista, cam) { return !!(S && S._mostrarMarcas && S._mostrarMarcas(lista, cam)); },
marcacoesVisiveis: function () { return !!(S && S.marcasSvg && S.marcasSvg.style.display !== 'none'); },
desenharMarcasEm: function (svg, lista, w, h) { if (S && S._desenharMarcas) S._desenharMarcas(svg, lista, w, h); },
canvasRect: function () { return S ? S.renderer.domElement.getBoundingClientRect() : null; },
girarVista: function (graus) { return !!(S && S._girarVista && S._girarVista(graus)); },
corteHorizontal: function (y) { return S && S._corteHorizontal ? S._corteHorizontal(y) : null; },
corteEstado: function () { return S && S._corteEstado ? S._corteEstado() : null; },
pavimentosCorte: function () { return S && S._pavimentosCorte ? S._pavimentosCorte() : []; },
host: function () { return S ? S.host : null; },
ehVisitante: function () { return !!(S && S._visitante); },
raTravada: function () { return S && S._raTravada ? S._raTravada() : true; },
ultraAtivo: function () { return !!(S && S.ultra); },
setUltra: function (v) { if (S && S._setUltra) S._setUltra(v); },
reuniao: {
entrar: function (cfg) { return Reuniao.entrar(cfg); },
sair: function () { Reuniao.sair(); },
get ativa() { return Reuniao.on; },
get sala() { return Reuniao.sala; },
get participantes() { return Reuniao.on ? Object.keys(Reuniao.outros).length + 1 : 0; },
audioEntrar: function () { if (!Reuniao.on) return false; return Voz.entrar(Reuniao.sala, Reuniao.uid, Reuniao.base()); },
audioSair: function () { Voz.sair(); },
get audioAtiva() { return Voz.on; },
euFalando: function () { return Voz.euFalando(); },
_vozRecebeTest: function (data) { Voz._recebe(data); },
_tickTest: function () { Reuniao._tick(); },
_avatarTest: function (u) {
var g = Reuniao._avatar(u || {}); var meshes = 0, jersey = false;
g.traverse(function (o) { if (o.isMesh) { meshes++; var m = o.material; if (Array.isArray(m) ? m.some(function (x) { return x && x.map; }) : (m && m.map)) jersey = true; } });
var alt = new THREE.Box3().setFromObject(g); var sz = alt.getSize(new THREE.Vector3());
Reuniao._dispor(g);
return { meshes: meshes, jersey: jersey, alturaM: +sz.y.toFixed(2), filhos: g.children.length };
}
}
};
//# sourceMappingURL=bim-pacote.js.map
