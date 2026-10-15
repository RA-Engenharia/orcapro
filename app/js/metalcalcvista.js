/* =====================================================================
 * metalcalcvista.js — VISTA 3D DOS RESULTADOS DO CÁLCULO DA ESTRUTURA
 * METÁLICA (módulo ES; também window.MetalCalcVista).
 *
 * Lê o resultado do AcoDimensionar.calcular (contrato em
 * docs/metalica/CONTRATO.md) e mostra, numa cena three.js própria:
 *   1. APROVEITAMENTO — as barras como sólidos do perfil (I, U, L, tubo,
 *      barra, formado a frio), coloridas pela razão solicitante/resistente
 *      (verde ≤ 0,70 · amarelo ≤ 0,90 · laranja ≤ 1,00 · vermelho > 1,00);
 *      passar o mouse mostra a leitura rápida e clicar abre o cartão:
 *      perfil, aproveitamento, verificação que governa, situação
 *      (combinação/posição), todas as verificações e a SUGESTÃO quando não
 *      passa. O critério pode ser o governante (ELU e ELS), só ELU ou só ELS.
 *      Terças e travessas (r.tercas / r.travessas, NBR 14762) entram com o
 *      perfil Ue real e a cor da verificação do grupo; as ligações
 *      (r.ligacoes) aparecem no painel e no cartão da peça; contravento que
 *      não é tracionado em nenhuma combinação última aparece como FROUXO.
 *   2. DEFORMADA — a estrutura deformada ampliada (fator automático +
 *      controle deslizante) com a curvatura DE VERDADE ao longo de cada
 *      barra: as estações da análise já trazem o deslocamento global com a
 *      parcela da carga no vão; cor pelo deslocamento, topo dos pilares
 *      (em relação à base) e cumeeira (em relação aos beirais) rotulados.
 *   3. FLAMBAGEM — o modo de flambagem global animado. O modo vem nos nós
 *      (inclusive os internos "barra#k") com as rotações; entre os nós a
 *      curva é a de Hermite da própria barra, respeitando rótulas (libera)
 *      e tirantes. Mostra o λcr e o que ele quer dizer.
 *   4. ESFORÇOS — diagramas de N, V, M e T sobre as barras de um pórtico:
 *      momento do lado TRACIONADO, normal azul (tração) / vermelho
 *      (compressão), máximos rotulados. Elevação com câmera de campo
 *      estreito (cara de prancha), eixos A/B e linha do terreno.
 *   5. VENTO — as zonas da NBR 6123 (r.vento.casos[i].pressao) pintadas nas
 *      paredes e na cobertura: pressão líquida p = (Cpe − Cpi)·q por zona,
 *      azul = pressão, vermelho = sucção; setas da direção; V0, S1, S2, S3,
 *      Vk, q e Cpi no painel. Os ids W0a… são os de r.ventoCasos.
 *
 * Desempenho: uma malha só para todos os sólidos (cor por vértice) e uma
 * para as linhas grossas (instanciadas, largura em pixel) — poucos draw
 * calls até ~2.000 barras. A ampliação da deformada e a animação da
 * flambagem rodam no vertex shader (aDesl × uEscala): o controle deslizante
 * e a animação não reconstroem geometria. O clique/hover é por distância
 * na TELA aos eixos das barras (rápido e acerta barra fina).
 *
 * API: MetalCalcVista.abrir(container, r, opcoes) → controle
 *   controle.modo(nome)          'aproveitamento' | 'deformada' | 'flambagem' | 'esforcos' | 'vento'
 *   controle.combinacao(id)      combinação do modo atual (flambagem: a da análise de autovalor; vento: o caso, ex. 'W90a')
 *   controle.escala(f)           deformada: ×f; flambagem: amplitude máxima do modo em metros; 'auto' volta ao automático
 *   controle.selecionar(id)      membro (ou barra) em destaque + cartão; null limpa
 *   controle.foto(larg, alt)     → PNG (dataURL), com rótulos, título e legenda (para o memorial)
 *   controle.destruir()
 *   e também: esforco('N'|'V'|'M'|'T'), portico(k), vista('3d'|'frente'|'lateral'|'planta'),
 *   enquadrar(), animar(sim), ponto(id) → {x, y} na tela, estado()
 * opcoes: { modo, tema: 'claro'|'escuro'|'auto', combinacao, portico, esforco,
 *           animar (true), aoSelecionar(id, alvo), barra (true: mostra a barrinha) }
 * Prévia: tools/previa-metalcalcvista.html
 *
 * ⚠ COR: o three vendorizado é o r150 e o THREE.ColorManagement é GLOBAL
 * (o js/bim.js liga). Para a cor daqui não depender de quem carregou o
 * three antes, todas as cores entram JÁ em linear (conversão própria, sem
 * passar pelo Color.set) e a saída é sRGB — o resultado é igual com o
 * ColorManagement ligado ou desligado.
 * ⚠ Sem backdrop-filter em nada daqui (quebra position:fixed e pesa sobre
 * o canvas): painéis são opacos.
 * ===================================================================== */
import * as THREE from 'three';
import { OrbitControls } from '../bim/vendor/OrbitControls.js';

const VERSAO = '1.0.0';

/* ================================================================ BÁSICO */
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function soma(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function esc(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function pe(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function pv(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function comp(a) { return Math.sqrt(pe(a, a)); }
function unit(a) { const l = comp(a); return l > 0 ? esc(a, 1 / l) : [0, 0, 0]; }
function num(v, d) { if (v == null || v === '') return d; const n = Number(v); return isFinite(n) ? n : d; }
function arr(v) { return Array.isArray(v) ? v : []; }
function ehObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function lim(v, a, b) { return v < a ? a : v > b ? b : v; }
function v3(p) { return Array.isArray(p) && p.length >= 3 ? [num(p[0], 0), num(p[1], 0), num(p[2], 0)] : [0, 0, 0]; }

/* números no padrão brasileiro, com o sinal de menos tipográfico */
const MENOS = '\u2212';
function fmt(v, c) {
  if (v == null || !isFinite(v)) return '—';
  c = c == null ? 2 : c;
  const s = Math.abs(v).toFixed(c), partes = s.split('.');
  const int = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (v < 0 && Number(s) !== 0 ? MENOS : '') + int + (partes[1] ? ',' + partes[1] : '');
}
function fmtAuto(v) { const a = Math.abs(v); return fmt(v, a >= 100 ? 1 : a >= 1 ? 2 : a >= 0.01 ? 3 : 4); }
function fmtMm(m) { return fmt(m * 1000, 1) + ' mm'; }
function fmtFator(f) { if (!(f > 0)) return '0'; if (f >= 10) return fmt(Math.round(f), 0); if (f >= 1) return fmt(f, 1); return fmt(f, 2); }
/* o "redondo" mais próximo na escala 1-2-5 (em log) */
function arredondar125(v) {
  if (!(v > 0) || !isFinite(v)) return 1;
  const e = Math.floor(Math.log10(v)), base = Math.pow(10, e), cands = [1, 2, 5, 10].map(c => c * base);
  let melhor = cands[0]; for (const c of cands) if (Math.abs(Math.log(c / v)) < Math.abs(Math.log(melhor / v))) melhor = c;
  return melhor;
}

/* ================================================================ COR
 * Tudo em linear aqui dentro (ver a nota do cabeçalho). As cores de dado
 * são as da paleta validada (status: bom/atenção/sério/crítico; rampa
 * sequencial de um tom só; par divergente azul ↔ vermelho). */
function s2l(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function hexRgb(h) {
  h = String(h || '#000').replace('#', '');
  if (h.length === 3) h = h.split('').map(x => x + x).join('');
  const n = parseInt(h, 16) || 0;
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}
function linear(hex) { return hexRgb(hex).map(s2l); }
function corLinear(hex) { const l = linear(hex), c = new THREE.Color(); c.r = l[0]; c.g = l[1]; c.b = l[2]; return c; }
function rampa(t, passos) {
  t = lim(isFinite(t) ? t : 0, 0, 1);
  const n = passos.length - 1, x = t * n, i = Math.min(n - 1, Math.floor(x)), f = x - i;
  const a = hexRgb(passos[i]), b = hexRgb(passos[i + 1]);
  return [s2l(a[0] + (b[0] - a[0]) * f), s2l(a[1] + (b[1] - a[1]) * f), s2l(a[2] + (b[2] - a[2]) * f)];
}
function rampaCss(passos) { return 'linear-gradient(90deg,' + passos.map((p, i) => p + ' ' + (i / (passos.length - 1) * 100).toFixed(1) + '%').join(',') + ')'; }

/* aproveitamento: as 4 faixas pedidas, com as cores de status (nunca cor sozinha: rótulo + ícone) */
const STATUS = [
  { ate: 0.70, cor: '#0ca30c', faixa: '≤ 0,70', nome: 'com folga', icone: '✓' },
  { ate: 0.90, cor: '#f2a900', faixa: '0,70 a 0,90', nome: 'bem aproveitada', icone: '✓' },
  { ate: 1.00, cor: '#ea6f2d', faixa: '0,90 a 1,00', nome: 'no limite', icone: '!' },
  { ate: Infinity, cor: '#d03b3b', faixa: '> 1,00', nome: 'não passa', icone: '✕' }
];
function statusDe(r) {
  if (r == null || !isFinite(r)) return null;
  for (const s of STATUS) if (r <= s.ate + 1e-9) return s;
  return STATUS[STATUS.length - 1];
}

const RAMPA_CLARO = ['#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];
const RAMPA_ESCURO = ['#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef', '#9ec5f4', '#b7d3f6', '#cde2fb'];

const TEMAS = {
  claro: {
    nome: 'claro', fundo: ['#f6f8fb', '#e1e7ee'], grade: '#c3ccd6', gradeForte: '#aebbc8', sombra: 0.24, contato: 0.07,
    neutro: '#b9c3cd', secundaria: '#c9d1d9', fantasma: '#7f91a3', eixo: '#9aabbb', ceu: '#ffffff', chao: '#aab4be',
    tinta: '#111d2b', tinta2: '#516375', tinta3: '#7e95aa', painel: '#ffffff', borda: 'rgba(15,39,64,.14)',
    rampa: RAMPA_CLARO, tracao: '#2a78d6', compressao: '#e34948', diagrama: '#2a78d6', realce: '#0d6ebd',
    luzHemi: 0.78, luzSol: 0.82, luzFill: 0.26
  },
  escuro: {
    nome: 'escuro', fundo: ['#101b27', '#18283a'], grade: '#2a3d50', gradeForte: '#36506a', sombra: 0.42, contato: 0.22,
    neutro: '#5a6e82', secundaria: '#3e5064', fantasma: '#8ea3b8', eixo: '#55708a', ceu: '#ffffff', chao: '#2a3542',
    tinta: '#ecf2f8', tinta2: '#a9bacb', tinta3: '#7f95aa', painel: '#132331', borda: 'rgba(255,255,255,.10)',
    rampa: RAMPA_ESCURO, tracao: '#3987e5', compressao: '#e66767', diagrama: '#3987e5', realce: '#3d92cb',
    luzHemi: 0.72, luzSol: 0.80, luzFill: 0.22
  }
};
function escolherTema(t) {
  if (t === 'claro' || t === 'escuro') return t;
  try { if (document.documentElement.getAttribute('data-tema') === 'dark') return 'escuro'; } catch (e) {}
  return 'claro';
}

const FOV_3D = 30, FOV_PORTICO = 12;
const DIRECOES = { '3d': [-0.8, 0.52, 1.0], iso: [-0.8, 0.52, 1.0], frente: [0, 0.07, 1], lateral: [-1, 0.07, 0], planta: [0, 1, 0.02], topo: [0, 1, 0.02] };
const MODOS = [
  { id: 'aproveitamento', nome: 'Aproveitamento', tecla: '1' },
  { id: 'deformada', nome: 'Deformada', tecla: '2' },
  { id: 'flambagem', nome: 'Flambagem', tecla: '3' },
  { id: 'esforcos', nome: 'Esforços', tecla: '4' },
  { id: 'vento', nome: 'Vento', tecla: '5' }
];
function normalizarModo(m) {
  const s = String(m || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/^apro/.test(s) || s === 'razao' || s === 'cores') return 'aproveitamento';
  if (/^defor/.test(s) || /^desloc/.test(s)) return 'deformada';
  if (/^flamb/.test(s) || /^modo/.test(s)) return 'flambagem';
  if (/^esfor/.test(s) || /^diagr/.test(s)) return 'esforcos';
  if (/^vent/.test(s)) return 'vento';
  return null;
}

/* ================================================================ DADOS */
const NOME_PAPEL = { pilar: 'Pilar', viga: 'Viga de cobertura', tapamento: 'Coluna de tapamento' };
function tipoBarra(b, membro) {
  if (membro) return membro.papel || 'membro';
  const id = String(b.id);
  if (b.papel === 'contravento' || /^X[PC]/.test(id)) return 'contravento';
  if (/^PT/.test(id)) return 'travamento';
  if (/^(ES|BE|TR|TO)/.test(id)) return 'escora';
  return 'outra';
}
function nomeBarra(B) {
  const id = B.id;
  if (/^XP/.test(id)) return 'Contraventamento da parede';
  if (/^XC/.test(id)) return 'Contraventamento da cobertura';
  if (/^BE/.test(id)) return 'Terça do beiral';
  if (/^ES/.test(id)) return 'Terça';
  if (/^TR/.test(id)) return 'Travessa lateral';
  if (/^TO/.test(id)) return 'Travessa do oitão';
  if (/^PT/.test(id)) return 'Viga de travamento';
  if (B.tipo === 'contravento') return 'Contraventamento';
  return 'Barra';
}

function prepararDados(r) {
  const D = { ok: false, motivo: '', avisos: [], problemas: [] };
  if (!ehObj(r)) { D.motivo = 'Nenhum resultado de cálculo para mostrar.'; return D; }
  const G = r.modelo;
  if (!ehObj(G) || !ehObj(G.modelo)) {
    D.motivo = r.motivo || (arr(r.problemas)[0] && r.problemas[0].texto) || 'O cálculo não chegou a montar o modelo.';
    D.problemas = arr(r.problemas);
    return D;
  }
  const mod = G.modelo, L = ehObj(G.layout) ? G.layout : {};
  D.r = r; D.layout = L;
  const nos = new Map();
  for (const n of arr(mod.nos)) if (ehObj(n) && n.id != null) nos.set(String(n.id), [num(n.x, 0), num(n.y, 0), num(n.z, 0)]);
  D.nos = nos;
  /* membros (pilares, vigas, tapamentos) e o resultado da verificação de cada um */
  const membros = [], memPorId = new Map(), barraMem = new Map();
  const servico = arr(r.servico).filter(ehObj);
  for (const m of arr(G.membros)) {
    if (!ehObj(m) || m.id == null) continue;
    const M = {
      id: String(m.id), papel: m.papel || 'membro', grupo: m.grupo || m.papel, k: m.k, lado: m.lado, L: num(m.L, 0),
      secao: ehObj(m.secao) ? m.secao : {}, aco: ehObj(m.aco) ? m.aco : null, segs: arr(m.segs).map(String), nos: arr(m.nos).map(String),
      flambagem: ehObj(m.flambagem) ? m.flambagem : null, maosFrancesas: arr(m.maosFrancesas), indice: membros.length, barras: []
    };
    const v = ehObj(r.membros) ? r.membros[M.id] : null;
    M.verif = ehObj(v) ? v : null;
    M.razaoELU = M.verif ? num(M.verif.razao, null) : null;
    M.servico = servico.filter(s => String(s.membro) === M.id);
    M.razaoELS = M.servico.length ? Math.max.apply(null, M.servico.map(s => num(s.razao, 0))) : null;
    membros.push(M); memPorId.set(M.id, M);
    for (const s of M.segs) barraMem.set(s, M);
  }
  D.membros = membros; D.memPorId = memPorId;
  /* barras da análise (inclusive terças/travessas como escoras e o contraventamento) */
  const barras = [], barPorId = new Map(), secoes = ehObj(G.secoes) ? G.secoes : {};
  const trav = ehObj(r.travessas) ? r.travessas : {};
  const SEC = { terca: ehObj(r.tercas) && r.tercas.perfil ? r.tercas : null, travLat: ehObj(trav.lateral) && trav.lateral.perfil ? trav.lateral : null, travOit: ehObj(trav.oitao) && trav.oitao.perfil ? trav.oitao : null };
  D.SEC = SEC;
  let nFaltam = 0;
  for (const b of arr(mod.barras)) {
    if (!ehObj(b) || b.id == null) continue;
    const id = String(b.id), a = nos.get(String(b.i)), c = nos.get(String(b.j));
    if (!a || !c) { nFaltam++; continue; }
    const d = sub(c, a), Lb = comp(d);
    if (!(Lb > 1e-9)) continue;
    const ex = esc(d, 1 / Lb);
    /* eixos locais iguais aos do js/acoanalise.js: y = altura da seção (vy ortogonalizado), z = x × y */
    let vy = Array.isArray(b.vy) ? b.vy.map(Number) : null;
    if (!vy || comp(pv(ex, unit(vy))) < 1e-3) vy = Math.abs(ex[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const ey = unit(sub(vy, esc(ex, pe(vy, ex)))), ez = pv(ex, ey);
    const M = barraMem.get(id) || null, tipo = tipoBarra(b, M);
    let secao = null, grupoSec = null;
    if (M) secao = M.secao;
    else if (tipo === 'contravento') secao = secoes.contravento;
    else if (tipo === 'escora') {
      /* terças e travessas: o perfil e a verificação vêm do AcoSecundarias (NBR 14762), um resultado por grupo */
      grupoSec = /^(ES|BE)/.test(id) ? 'terca' : /^TO/.test(id) ? 'travOit' : /^TR/.test(id) ? 'travLat' : null;
      const G2 = grupoSec ? SEC[grupoSec] : null;
      secao = G2 && ehObj(G2.secao) ? { nome: G2.perfil, frio: G2.secao } : secoes.escora;
    }
    else if (tipo === 'travamento') secao = secoes.viga || secoes.pilar;
    const B = {
      id, i: String(b.i), j: String(b.j), p0: a, p1: c, L: Lb, ex, ey, ez, libera: ehObj(b.libera) ? b.libera : {},
      tracao: !!b.tracao, nElem: b.tracao ? 1 : Math.max(1, Math.round(num(b.nElem, 1))), membro: M, tipo,
      secao: ehObj(secao) ? secao : null, indice: barras.length, grupoSec, sec: grupoSec ? SEC[grupoSec] : null
    };
    barras.push(B); barPorId.set(id, B);
    if (M) M.barras.push(B);
  }
  if (nFaltam) D.avisos.push(nFaltam + ' barra(s) sem nó no resultado (amostra enxugada?) ficaram de fora.');
  for (const M of membros) {
    M.barras.sort((x, y) => M.segs.indexOf(x.id) - M.segs.indexOf(y.id));
    let x0 = 0; for (const B of M.barras) { B.x0 = x0; x0 += B.L; }
    M.Lgeo = x0;
  }
  D.barras = barras; D.barPorId = barPorId;
  if (!barras.length) { D.motivo = 'O resultado não traz as barras do modelo (nós ou barras ausentes).'; return D; }
  /* chaves numéricas (shader + clique): membro inteiro, ou a barra quando ela não é de membro */
  D.alvos = [];
  for (const M of membros) { M.chave = D.alvos.length; D.alvos.push({ tipo: 'membro', ref: M }); }
  for (const B of barras) {
    if (B.membro) B.chave = B.membro.chave;
    else { B.chave = D.alvos.length; D.alvos.push({ tipo: 'barra', ref: B }); }
  }
  /* caixa do modelo */
  const mn = [1e18, 1e18, 1e18], mx = [-1e18, -1e18, -1e18];
  for (const B of barras) for (const p of [B.p0, B.p1]) for (let q = 0; q < 3; q++) { if (p[q] < mn[q]) mn[q] = p[q]; if (p[q] > mx[q]) mx[q] = p[q]; }
  D.mn = mn; D.mx = mx; D.centro = esc(soma(mn, mx), 0.5); D.diag = Math.max(1, comp(sub(mx, mn)));
  D.dimMax = Math.max(1, mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  /* combinações com resultado de análise */
  const AC = ehObj(r.analise) && ehObj(r.analise.combinacoes) ? r.analise.combinacoes : {};
  D.AC = AC;
  const ok = id => ehObj(AC[id]) && AC[id].ok !== false && ehObj(AC[id].barras);
  D.combs = [];
  for (const c of arr(r.combinacoes)) if (ehObj(c) && ok(String(c.id))) D.combs.push({ id: String(c.id), nome: c.nome || '', tipo: c.tipo || '', descricao: c.descricao || '' });
  for (const c of arr(r.casos)) if (ehObj(c) && ok('caso_' + c.id)) D.combs.push({ id: 'caso_' + c.id, nome: c.nome || String(c.id), tipo: 'caso', descricao: 'caso ' + c.id + ', característico' });
  for (const id of Object.keys(AC)) if (ok(id) && !D.combs.some(c => c.id === id)) D.combs.push({ id, nome: id, tipo: /^ELU/.test(id) ? 'ELU' : /^ELS/.test(id) ? 'ELS-rara' : 'outra', descricao: '' });
  D.combPorId = new Map(D.combs.map(c => [c.id, c]));
  /* contraventamento: a razão de CADA barra (N máx. de tração nas ELU ÷ NRd do grupo) */
  const cv = ehObj(r.contravento) ? r.contravento : null;
  let NRd = null;
  if (cv && ehObj(cv.verificacao)) {
    NRd = num(cv.verificacao.pior && cv.verificacao.pior.NRd, null);
    if (NRd == null) { const v0 = arr(cv.verificacao.verificacoes)[0]; if (v0) NRd = num(v0.resistencia, null); }
  }
  D.cv = { NRd, perfil: cv ? cv.perfil : null, verif: cv ? cv.verificacao : null, barra: cv ? cv.barra : null };
  const elu = D.combs.filter(c => c.tipo === 'ELU');
  for (const B of barras) {
    if (B.tipo !== 'contravento') continue;
    /* barra só de tração: inativa (saiu do modelo) ou com N < 0 (a diagonal que menos encurta, quando as duas
       ficariam frouxas, fica ativa com compressão de décimos de kN) = FROUXA naquela combinação */
    let Nmax = 0, onde = null, nTr = 0, nFr = 0;
    for (const c of elu) {
      const e = AC[c.id].barras[B.id];
      if (!e) continue;
      const N = !e.inativa && arr(e.estacoes)[0] ? num(e.estacoes[0].N, 0) : 0;
      if (!e.inativa && N > 0) { nTr++; if (N > Nmax) { Nmax = N; onde = c.id; } } else nFr++;
    }
    B.cvN = Nmax; B.cvComb = onde; B.nTracao = nTr; B.nFrouxa = nFr; B.frouxa = nTr === 0 && nFr > 0;
    B.razao = NRd && !B.frouxa ? Nmax / NRd : (B.frouxa ? 0 : null);
  }
  /* ligações (AcoLigCalc), nomes dos casos de vento e o vento por zona */
  D.lig = ehObj(r.ligacoes) ? r.ligacoes : null;
  /* vento (AcoVento): cada caso com as zonas das paredes e da cobertura e a pressão líquida p = (Cpe − Cpi)·q */
  const vc = arr(r.ventoCasos).filter(ehObj);
  D.vento = ehObj(r.vento) && arr(r.vento.casos).length ? r.vento : null;
  D.ventoLista = D.vento ? arr(D.vento.casos).filter(c => ehObj(c) && ehObj(c.pressao)).map(c => {
    const w = vc.find(v => String(v.origem) === String(c.id)) || {};
    return { id: String(c.id), idW: w.id ? String(w.id) : String(c.id), nome: c.nome || w.nome || String(c.id), direcao: num(c.direcao, 0), cpi: num(c.cpi, null), cpiMotivo: c.cpiMotivo || '', q: num(c.q, null), pressao: c.pressao };
  }) : [];
  D.ventoNomes = new Map(arr(r.ventoCasos).filter(ehObj).map(v => [String(v.id), v.nome || String(v.id)]));
  for (const c of D.combs) if (c.tipo === 'caso' && D.ventoNomes.has(c.id.replace(/^caso_/, ''))) c.nome = D.ventoNomes.get(c.id.replace(/^caso_/, ''));
  /* pórticos: barras no plano z = zs[k] (pilares, vigas, tapamentos e travessas do oitão) */
  D.porticos = [];
  arr(L.zs).map(Number).forEach((z, k) => {
    const bs = barras.filter(B => Math.abs(B.p0[2] - z) < 1e-3 && Math.abs(B.p1[2] - z) < 1e-3 && B.tipo !== 'contravento');
    if (bs.length) D.porticos.push({ k, z, barras: bs, membros: membros.filter(M => M.barras.length && M.barras.every(b => bs.indexOf(b) >= 0)) });
  });
  /* flambagem global */
  D.flamb = arr(r.flambagem).filter(f => ehObj(f) && arr(f.modos).length).map((f, i) => ({
    i, combinacao: String(f.combinacao || ''), nome: f.nome || '', lambda: num(f.lambda, null),
    modos: arr(f.modos).filter(m => ehObj(m) && ehObj(m.desloc) && num(m.lambda, 0) > 0).map(m => ({ lambda: num(m.lambda, null), desloc: m.desloc }))
  })).filter(f => f.modos.length);
  D.flamb.forEach((f, i) => { f.i = i; if (!(f.lambda > 0)) f.lambda = f.modos[0].lambda; });
  /* combinações em que o autovalor não achou λ positivo (a estrutura não flamba sob elas até o |λ| examinado) */
  D.flambSem = arr(r.flambagem).filter(f => ehObj(f) && !(num(f.lambda, 0) > 0)).map(f => ({ combinacao: String(f.combinacao || ''), ate: num(f.semPositivoAte, null) }));
  D.aprovado = r.aprovado; D.falhas = num(r.falhas, 0);
  /* PÓRTICOS M4 (14/10/2026): a SITUAÇÃO da estrutura desenhada (js/acoenvoltorio.js situacao): com verificação faltando
     ("incompleto" — vento não verificado, mísula cônica, fadiga da ponte…) o selo NÃO diz "Aprovado" (a imagem vai para a capa
     do memorial: o memorial do shed dizia INCOMPLETO no texto e "Aprovado" na foto) */
  D.incompleto = !!(r.situacao && r.situacao.id === 'incompleto'); D.nNaoVerif = arr(r.naoVerificados).length;
  D.ok = true;
  return D;
}

/* ponto do eixo do membro a uma distância x da 1ª barra */
function pontoNoMembro(M, x) {
  const bs = M.barras; if (!bs.length) return null;
  for (const B of bs) if (x <= B.x0 + B.L + 1e-9) { const s = lim((x - B.x0) / B.L, 0, 1); return soma(B.p0, esc(sub(B.p1, B.p0), s)); }
  const u = bs[bs.length - 1]; return u.p1.slice();
}
function razaoMembro(M, criterio) {
  if (criterio === 'elu') return M.razaoELU;
  if (criterio === 'els') return M.razaoELS;
  const a = M.razaoELU, b = M.razaoELS;
  return a == null ? b : b == null ? a : Math.max(a, b);
}
/* terças/travessas (AcoSecundarias): razão do grupo; "elu"/"els" separam as flechas das resistências */
const NOME_SEC = { terca: 'Terças', travLat: 'Travessas laterais', travOit: 'Travessas do oitão' };
function razaoSec(G2, criterio) {
  if (!G2) return null;
  if (criterio !== 'elu' && criterio !== 'els') return num(G2.razao, null);
  let mx = null;
  for (const v of arr(G2.verificacoes)) { if (!ehObj(v)) continue; const serv = /flecha|desloca/i.test(String(v.nome || '')); if ((criterio === 'els') === serv) mx = Math.max(mx == null ? 0 : mx, num(v.razao, 0)); }
  return mx;
}
/* que ligações (AcoLigCalc) pertencem a cada tipo de peça */
const LIG_DE = { pilar: ['base', 'joelho'], viga: ['joelho', 'cumeeira', 'clip'], tapamento: ['baseTapamento'], contravento: ['contravento'], terca: ['clip'] };
function nomeMembro(M) { return (NOME_PAPEL[M.papel] || 'Barra') + ' ' + M.id; }
function ondeMembro(M, D) {
  const p = [];
  if (M.k != null && isFinite(M.k)) p.push('pórtico ' + (M.k + 1));
  if (M.papel === 'pilar' && M.lado != null) p.push(M.lado ? 'lado direito' : 'lado esquerdo');
  if (M.papel === 'viga' && /R$/.test(M.id)) p.push('água direita');
  if (M.papel === 'viga' && /L$/.test(M.id)) p.push(D && D.layout && D.layout.aguas === 1 ? 'água única' : 'água esquerda');
  return p.join(' · ');
}
function posicaoTexto(M, x, D) {
  const L = M.Lgeo || M.L || 0, t = L > 0 ? x / L : 0;
  let o = 'x = ' + fmt(x, 2) + ' m';
  if (M.papel === 'pilar' || M.papel === 'tapamento') { if (t < 0.02) o += ' (base)'; else if (t > 0.98) o += ' (topo)'; }
  else if (M.papel === 'viga') { if (t < 0.02) o += ' (beiral)'; else if (t > 0.98) o += (D && D.layout && D.layout.aguas === 1 ? ' (beiral)' : ' (cumeeira)'); }
  return o;
}

/* ================================================================ PERFIS
 * Contorno da seção no plano local (y, z) da barra, em metros, centrado no
 * centróide. Desenho do catálogo: x = largura (→ z local), y = altura
 * (→ y local, a alma do I). */
const CACHE_PERFIL = new Map();
function areaLoop(l) { let a = 0; for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
function centroLoop(l) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length], f = p[0] * q[1] - q[0] * p[1]; a += f; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f; }
  if (Math.abs(a) < 1e-18) { let sx = 0, sy = 0; for (const p of l) { sx += p[0]; sy += p[1]; } return [sx / l.length, sy / l.length]; }
  return [cx / (3 * a), cy / (3 * a)];
}
function circulo(r, n) { const o = []; for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n; o.push([r * Math.cos(a), r * Math.sin(a)]); } return o; }
function retArred(b, h, r, n) {
  r = Math.max(0, Math.min(r, b / 2 - 1e-9, h / 2 - 1e-9)); n = n || 4;
  if (r <= 1e-9) return [[-b / 2, -h / 2], [b / 2, -h / 2], [b / 2, h / 2], [-b / 2, h / 2]];
  const o = [], cs = [[b / 2 - r, -h / 2 + r, -Math.PI / 2], [b / 2 - r, h / 2 - r, 0], [-b / 2 + r, h / 2 - r, Math.PI / 2], [-b / 2 + r, -h / 2 + r, Math.PI]];
  for (const c of cs) for (let i = 0; i <= n; i++) { const a = c[2] + (Math.PI / 2) * i / n; o.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); }
  return o;
}
function offsetPolilinha(P, t) {
  const n = P.length, h = t / 2, esq = [], dir = [], nr = [];
  for (let i = 0; i < n - 1; i++) { const dx = P[i + 1][0] - P[i][0], dy = P[i + 1][1] - P[i][1], l = Math.hypot(dx, dy) || 1; nr.push([-dy / l, dx / l]); }
  for (let i = 0; i < n; i++) {
    let m;
    if (i === 0) m = nr[0]; else if (i === n - 1) m = nr[n - 2];
    else { const a = nr[i - 1], b = nr[i], s = [a[0] + b[0], a[1] + b[1]], l = Math.hypot(s[0], s[1]) || 1; m = [s[0] / l, s[1] / l]; const f = 1 / Math.max(0.5, m[0] * b[0] + m[1] * b[1]); m = [m[0] * f, m[1] * f]; }
    esq.push([P[i][0] + m[0] * h, P[i][1] + m[1] * h]); dir.push([P[i][0] - m[0] * h, P[i][1] - m[1] * h]);
  }
  return esq.concat(dir.reverse());
}
/* desenho (x, y) em mm → [y_local, z_local] em m */
function paraLocal(l) { return l.map(p => [p[1] * 0.001, p[0] * 0.001]); }
function contornoDe(mm) {
  if (!ehObj(mm)) return null;
  const f = mm.forma, n = k => num(mm[k], 0);
  if (f === 'I') {
    const d = n('d'), bf = n('bf'), tw = n('tw'), tf = n('tf'); if (!(d > 2 * tf && bf > tw && tw > 0 && tf > 0)) return null;
    const h = d / 2, b = bf / 2, w = tw / 2;
    return { ext: paraLocal([[-b, -h], [b, -h], [b, -h + tf], [w, -h + tf], [w, h - tf], [b, h - tf], [b, h], [-b, h], [-b, h - tf], [-w, h - tf], [-w, -h + tf], [-b, -h + tf]]), furos: [] };
  }
  if (f === 'U') {
    const d = n('d'), bf = n('bf'), tw = n('tw'), tf = n('tf'); if (!(d > 2 * tf && bf > tw && tw > 0 && tf > 0)) return null;
    const h = d / 2;
    return { ext: paraLocal([[0, -h], [bf, -h], [bf, -h + tf], [tw, -h + tf], [tw, h - tf], [bf, h - tf], [bf, h], [0, h]]), furos: [] };
  }
  if (f === 'L') {
    const a = num(mm.a, n('d')), b = num(mm.b, num(mm.bf, a)), t = n('t'); if (!(a > t && b > t && t > 0)) return null;
    return { ext: paraLocal([[0, 0], [b, 0], [b, t], [t, t], [t, a], [0, a]]), furos: [] };
  }
  if (f === 'tubo-ret') {
    const h = n('h'), b = n('b'), t = num(mm.t, n('tn')), ro = num(mm.ro, 2 * t); if (!(h > 2 * t && b > 2 * t && t > 0)) return null;
    return { ext: paraLocal(retArred(b, h, ro, 4)), furos: [paraLocal(retArred(b - 2 * t, h - 2 * t, Math.max(0, ro - t), 4))] };
  }
  if (f === 'tubo-circ') {
    const D = n('D'), t = num(mm.t, n('tn')); if (!(D > 2 * t && t > 0)) return null;
    return { ext: paraLocal(circulo(D / 2, 24)), furos: [paraLocal(circulo(D / 2 - t, 24))] };
  }
  if (f === 'circ') { const d = n('d'); if (!(d > 0)) return null; return { ext: paraLocal(circulo(d / 2, 14)), furos: [] }; }
  if (f === 'ret') { const b = n('b'), h = n('h'); if (!(b > 0 && h > 0)) return null; return { ext: paraLocal(retArred(b, h, 0)), furos: [] }; }
  if (Array.isArray(mm.linhaMedia) && mm.linhaMedia.length >= 2 && n('t') > 0) {
    return { ext: paraLocal(offsetPolilinha(mm.linhaMedia.map(p => [num(p[0], 0), num(p[1], 0)]), n('t'))), furos: [] };
  }
  return null;
}
/* formado a frio pelas dimensões da NBR 6355 (bw, bf, D, t — externas): linha média com cantos vivos + espessura */
function contornoFrio(f) {
  const t = num(f.t, 0), bw = num(f.bw, 0), bf = num(f.bf, 0), D = num(f.D, 0), tipo = String(f.tipo || 'Ue').replace(/\s+/g, '');
  if (!(t > 0 && bw > 2 * t && bf > t)) return null;
  const H = (bw - t) / 2, B = bf - t, Dl = D - t / 2;
  let P;
  if (/^Z/.test(tipo)) P = D > t ? [[B, H - Dl], [B, H], [0, H], [0, -H], [-B, -H], [-B, -H + Dl]] : [[B, H], [0, H], [0, -H], [-B, -H]];
  else if (tipo === 'L') P = [[0, bw - t / 2], [0, 0], [bf - t / 2, 0]];
  else if (D > t && tipo !== 'U') P = [[B, H - Dl], [B, H], [0, H], [0, -H], [B, -H], [B, -H + Dl]];
  else P = [[B, H], [0, H], [0, -H], [B, -H]];
  return { ext: paraLocal(offsetPolilinha(P, t)), furos: [] };
}
/* terça/travessa modelada só como escora (sem perfil no resultado): um Ue 150 × 60 × 20 de representação */
function contornoGenerico(tipo) {
  if (tipo === 'escora') return { ext: paraLocal(offsetPolilinha([[58, 55], [58, 74], [0, 74], [0, -74], [58, -74], [58, -55]], 2.6)), furos: [] };
  return { ext: paraLocal(retArred(100, 100, 0)), furos: [paraLocal(retArred(94, 94, 0))] };
}
function prepararPerfil(c) {
  let ext = c.ext.map(p => p.slice()), furos = c.furos.map(f => f.map(p => p.slice()));
  if (areaLoop(ext) < 0) ext.reverse();
  furos = furos.map(f => (areaLoop(f) > 0 ? f.reverse() : f));
  const Ae = areaLoop(ext), ce = centroLoop(ext);
  let A = Ae, Sx = ce[0] * Ae, Sy = ce[1] * Ae;
  for (const f of furos) { const a = areaLoop(f), cf = centroLoop(f); A += a; Sx += cf[0] * a; Sy += cf[1] * a; }
  const cx = A ? Sx / A : 0, cy = A ? Sy / A : 0, mover = l => l.map(p => [p[0] - cx, p[1] - cy]);
  ext = mover(ext); furos = furos.map(mover);
  const arestas = [];
  for (const loop of [ext].concat(furos)) for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length], du = b[0] - a[0], dv = b[1] - a[1], l = Math.hypot(du, dv);
    if (l < 1e-9) continue;
    arestas.push({ a, b, n: [dv / l, -du / l] });
  }
  const v2 = l => l.map(p => new THREE.Vector2(p[0], p[1]));
  let tris = [];
  try { tris = THREE.ShapeUtils.triangulateShape(v2(ext), furos.map(v2)); } catch (e) { tris = []; }
  const pts = ext.concat.apply(ext, furos);
  const capTris = tris.map(t => {
    const a = pts[t[0]], b = pts[t[1]], c2 = pts[t[2]];
    const s = (b[0] - a[0]) * (c2[1] - a[1]) - (b[1] - a[1]) * (c2[0] - a[0]);
    return s >= 0 ? [t[0], t[1], t[2]] : [t[0], t[2], t[1]];
  });
  let raio = 0; for (const p of pts) raio = Math.max(raio, Math.hypot(p[0], p[1]));
  return { arestas, capPts: pts, capTris, raio };
}
function perfilDe(secao, tipo) {
  if (secao && ehObj(secao.frio)) {
    const f = secao.frio, ch = 'frio:' + [f.tipo, f.bw, f.bf, f.D, f.t].join('|');
    if (CACHE_PERFIL.has(ch)) return CACHE_PERFIL.get(ch);
    let pf = null; try { const c = contornoFrio(f); if (c) pf = prepararPerfil(c); } catch (e) { pf = null; }
    if (!pf || !pf.arestas.length) pf = prepararPerfil(contornoGenerico(tipo));
    CACHE_PERFIL.set(ch, pf); return pf;
  }
  const mm = secao && ehObj(secao.mm) ? secao.mm : null;
  const chave = mm ? JSON.stringify([mm.forma, mm.d, mm.bf, mm.tw, mm.tf, mm.a, mm.b, mm.t, mm.tn, mm.h, mm.D, mm.ro, mm.tipoFrio, mm.bw, mm.linhaMedia ? mm.linhaMedia.length : 0]) : 'gen:' + tipo;
  if (CACHE_PERFIL.has(chave)) return CACHE_PERFIL.get(chave);
  let p = null;
  try { const c = contornoDe(mm); if (c) p = prepararPerfil(c); } catch (e) { p = null; }
  if (!p || !p.arestas.length) p = prepararPerfil(contornoGenerico(tipo));
  CACHE_PERFIL.set(chave, p);
  return p;
}

/* ================================================================ GEOMETRIA
 * Sólidos: peças = { B, perfil, am: [{ s (0..1 ao longo da barra), d ([3] desl. global ou null), c ([3] cor linear) }], chave }.
 * Cada aresta do contorno vira uma faixa (normais planas na volta do perfil,
 * contínuas ao longo da barra); tampas nas duas pontas. */
function construirSolidos(pecas, comDesl) {
  let nV = 0, nI = 0;
  for (const p of pecas) { const E = p.perfil.arestas.length, S = p.am.length; nV += E * S * 2 + 2 * p.perfil.capPts.length; nI += E * (S - 1) * 6 + 2 * p.perfil.capTris.length * 3; }
  const pos = new Float32Array(nV * 3), nor = new Float32Array(nV * 3), cor = new Float32Array(nV * 3), ids = new Float32Array(nV);
  const des = new Float32Array(nV * 3);
  const idx = nV > 65535 ? new Uint32Array(nI) : new Uint16Array(nI);
  let v = 0, ii = 0;
  /* laço quente sem alocar: tudo escrito direto nos vetores (2.000 barras × 10 estações × 12 arestas) */
  for (const p of pecas) {
    const B = p.B, ex = B.ex, ey = B.ey, ez = B.ez, S = p.am, nS = S.length, pf = p.perfil, id = p.chave;
    const bx = new Float64Array(nS), by = new Float64Array(nS), bz = new Float64Array(nS);
    for (let k = 0; k < nS; k++) { const t = S[k].s * B.L; bx[k] = B.p0[0] + ex[0] * t; by[k] = B.p0[1] + ex[1] * t; bz[k] = B.p0[2] + ex[2] * t; }
    for (const ed of pf.arestas) {
      const nx = ey[0] * ed.n[0] + ez[0] * ed.n[1], ny = ey[1] * ed.n[0] + ez[1] * ed.n[1], nz = ey[2] * ed.n[0] + ez[2] * ed.n[1];
      const ax = ey[0] * ed.a[0] + ez[0] * ed.a[1], ay = ey[1] * ed.a[0] + ez[1] * ed.a[1], az = ey[2] * ed.a[0] + ez[2] * ed.a[1];
      const cx = ey[0] * ed.b[0] + ez[0] * ed.b[1], cy = ey[1] * ed.b[0] + ez[1] * ed.b[1], cz = ey[2] * ed.b[0] + ez[2] * ed.b[1];
      const v0 = v;
      for (let k = 0; k < nS; k++) {
        const c = S[k].c, d = S[k].d;
        for (let w = 0; w < 2; w++) {
          const o = v * 3;
          pos[o] = bx[k] + (w ? cx : ax); pos[o + 1] = by[k] + (w ? cy : ay); pos[o + 2] = bz[k] + (w ? cz : az);
          nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
          cor[o] = c[0]; cor[o + 1] = c[1]; cor[o + 2] = c[2];
          if (d) { des[o] = d[0]; des[o + 1] = d[1]; des[o + 2] = d[2]; }
          ids[v] = id; v++;
        }
      }
      for (let k = 0; k < nS - 1; k++) {
        const A0 = v0 + k * 2, B0 = A0 + 1, A1 = A0 + 2, B1 = A0 + 3;
        idx[ii++] = A0; idx[ii++] = B0; idx[ii++] = B1;
        idx[ii++] = A0; idx[ii++] = B1; idx[ii++] = A1;
      }
    }
    for (let lado = 0; lado < 2; lado++) {
      const k = lado ? nS - 1 : 0, sg = lado ? 1 : -1, c = S[k].c, d = S[k].d, v0 = v;
      for (const q of pf.capPts) {
        const o = v * 3;
        pos[o] = bx[k] + ey[0] * q[0] + ez[0] * q[1]; pos[o + 1] = by[k] + ey[1] * q[0] + ez[1] * q[1]; pos[o + 2] = bz[k] + ey[2] * q[0] + ez[2] * q[1];
        nor[o] = ex[0] * sg; nor[o + 1] = ex[1] * sg; nor[o + 2] = ex[2] * sg;
        cor[o] = c[0]; cor[o + 1] = c[1]; cor[o + 2] = c[2];
        if (d) { des[o] = d[0]; des[o + 1] = d[1]; des[o + 2] = d[2]; }
        ids[v] = id; v++;
      }
      for (const t of pf.capTris) {
        if (sg > 0) { idx[ii++] = v0 + t[0]; idx[ii++] = v0 + t[1]; idx[ii++] = v0 + t[2]; }
        else { idx[ii++] = v0 + t[0]; idx[ii++] = v0 + t[2]; idx[ii++] = v0 + t[1]; }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(cor, 3));
  g.setAttribute('aId', new THREE.BufferAttribute(ids, 1));
  g.setAttribute('aDesl', new THREE.BufferAttribute(des, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  if (g.boundingSphere) g.boundingSphere.radius *= 1.5;   /* a ampliação no shader mexe na posição: folga para o recorte */
  return g;
}

const VS_LINHA = `
uniform vec2 uRes;
uniform float uLarg;
uniform float uEscala;
attribute vec3 iA;
attribute vec3 iB;
attribute vec3 iCA;
attribute vec3 iCB;
attribute vec3 iDA;
attribute vec3 iDB;
attribute float iId;
varying vec3 vCor;
varying float vId;
void aparar(const in vec4 s, inout vec4 e) {
  float a = projectionMatrix[2][2];
  float b = projectionMatrix[3][2];
  float perto = -0.5 * b / a;
  float t = (perto - s.z) / (e.z - s.z);
  e.xyz = mix(s.xyz, e.xyz, t);
}
void main() {
  vec4 va = modelViewMatrix * vec4(iA + uEscala * iDA, 1.0);
  vec4 vb = modelViewMatrix * vec4(iB + uEscala * iDB, 1.0);
  if (va.z < 0.0 && vb.z >= 0.0) aparar(va, vb);
  else if (vb.z < 0.0 && va.z >= 0.0) aparar(vb, va);
  vec4 ca = projectionMatrix * va;
  vec4 cb = projectionMatrix * vb;
  vec2 sa = ca.xy / ca.w * uRes * 0.5;
  vec2 sb = cb.xy / cb.w * uRes * 0.5;
  vec2 d = sb - sa;
  float l = length(d);
  vec2 dir = l > 1e-5 ? d / l : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  bool fim = position.y > 0.5;
  vec4 c = fim ? cb : ca;
  vec2 off = nrm * position.x * uLarg * 0.5 + dir * (fim ? 0.5 : -0.5) * uLarg;
  c.xy += off / (uRes * 0.5) * c.w;
  gl_Position = c;
  vCor = fim ? iCB : iCA;
  vId = iId;
}`;
const FS_LINHA = `
uniform float uOpac;
uniform float uSel;
uniform float uHover;
uniform vec3 uFundo;
varying vec3 vCor;
varying float vId;
void main() {
  vec3 c = vCor;
  if (uSel > -0.5 && abs(vId - uSel) > 0.5) c = mix(c, uFundo, 0.7);
  if (uHover > -0.5 && abs(vId - uHover) < 0.5) c = mix(c, vec3(1.0), 0.3);
  gl_FragColor = vec4(c, uOpac);
  #include <encodings_fragment>
}`;

/* ================================================================ RÓTULOS
 * Itens: { pos [3], desl [3]?, texto, sub?, classe, prioridade, cor? (marcador),
 *          ancora: 'acima'|'centro'|'longe' (longe: do lado oposto a pos2) , pos2 [3]? , desl2 [3]? }
 * A cada quadro: projeta, descarta o que está atrás/fora e o que bate num
 * rótulo de prioridade maior (o mais importante sempre aparece). */
class Rotulos {
  constructor(host) { this.host = host; this.itens = []; }
  limpar() { for (const it of this.itens) { if (it.el && it.el.parentNode) it.el.parentNode.removeChild(it.el); } this.itens = []; }
  definir(lista) {
    this.limpar();
    const frag = document.createDocumentFragment();
    for (const it of lista) {
      const el = document.createElement('div');
      el.className = 'mcv-rot mcv-rot--' + (it.classe || 'valor');
      if (it.cor) { const m = document.createElement('i'); m.className = 'mcv-rot-m'; m.style.background = it.cor; el.appendChild(m); }
      const t = document.createElement('b'); t.textContent = it.texto; el.appendChild(t);
      if (it.sub) { const s = document.createElement('span'); s.textContent = it.sub; el.appendChild(s); }
      el.style.visibility = 'hidden';
      frag.appendChild(el);
      this.itens.push(Object.assign({}, it, { el }));
    }
    this.host.appendChild(frag);
    for (const it of this.itens) { it.w = it.el.offsetWidth || 40; it.h = it.el.offsetHeight || 18; }
    this.itens.sort((a, b) => (b.prioridade || 0) - (a.prioridade || 0));
  }
  /* devolve a lista do que ficou visível, com x/y (canto superior esquerdo) */
  layout(camera, W, H, escala, medir) {
    const vis = [], ocup = [], tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), mv = camera.matrixWorldInverse;
    /* grupos (bolhas das duas pontas de um eixo): fica só a mais perto da câmera */
    const perto = new Map(), cp = camera.position;
    for (const it of this.itens) if (it.grupo) {
      const d = Math.hypot(it.pos[0] - cp.x, it.pos[1] - cp.y, it.pos[2] - cp.z), o = perto.get(it.grupo);
      if (!o || d < o.d) perto.set(it.grupo, { d, it });
    }
    for (const it of this.itens) {
      if (it.grupo && perto.get(it.grupo).it !== it) { it.vis = false; continue; }
      const p = it.desl ? soma(it.pos, esc(it.desl, escala)) : it.pos;
      tmp.set(p[0], p[1], p[2]);
      const zc = tmp.clone().applyMatrix4(mv).z;
      if (zc > -camera.near) { it.vis = false; continue; }
      tmp.project(camera);
      let x = (tmp.x + 1) / 2 * W, y = (1 - tmp.y) / 2 * H;
      const w = medir ? medir(it).w : it.w, h = medir ? medir(it).h : it.h;
      let bx, by;
      if (it.ancora === 'centro') { bx = x - w / 2; by = y - h / 2; }
      else if (it.ancora === 'longe' && it.pos2) {
        const q = it.desl2 ? soma(it.pos2, esc(it.desl2, escala)) : it.pos2;
        tmp2.set(q[0], q[1], q[2]).project(camera);
        let dx = x - (tmp2.x + 1) / 2 * W, dy = y - (1 - tmp2.y) / 2 * H; const l = Math.hypot(dx, dy);
        if (l > 1e-3) { dx /= l; dy /= l; } else { dx = 0; dy = -1; }
        const gap = 6 + Math.abs(dx) * w / 2 + Math.abs(dy) * h / 2;
        bx = x + dx * gap - w / 2; by = y + dy * gap - h / 2;
      } else { bx = x - w / 2; by = y - h - 9; }
      if (bx + w < 0 || by + h < 0 || bx > W || by > H) { it.vis = false; continue; }
      if (it.classe === 'eixo') { if (bx < 2 || by < 2 || bx + w > W - 2 || by + h > H - 2) { it.vis = false; continue; } }
      else { bx = lim(bx, 4, Math.max(4, W - w - 4)); by = lim(by, 4, Math.max(4, H - h - 4)); }
      const cx0 = bx - 3, cy0 = by - 2, cx1 = bx + w + 3, cy1 = by + h + 2;
      let bate = false;
      for (const o of ocup) if (!(cx1 < o[0] || cx0 > o[2] || cy1 < o[1] || cy0 > o[3])) { bate = true; break; }
      if (bate && !it.fixo) { it.vis = false; continue; }
      ocup.push([cx0, cy0, cx1, cy1]);
      it.vis = true; it.x = bx; it.y = by; it.ax = x; it.ay = y;
      vis.push(it);
    }
    return vis;
  }
  atualizar(camera, W, H, escala) {
    this.layout(camera, W, H, escala);
    for (const it of this.itens) {
      if (!it.vis) { if (it.el.style.visibility !== 'hidden') it.el.style.visibility = 'hidden'; continue; }
      it.el.style.visibility = 'visible';
      it.el.style.transform = 'translate(' + Math.round(it.x) + 'px,' + Math.round(it.y) + 'px)';
    }
  }
}

/* ================================================================ ESTILO */
const ICONE = {
  aproveitamento: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.3 14.6a6.7 6.7 0 1 1 13.4 0"/><path d="M10 14.6l3.4-4.4"/><circle cx="10" cy="14.6" r="1.2" fill="currentColor" stroke="none"/></svg>',
  deformada: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 7.5h15" opacity=".38"/><path d="M2.5 7.5c3.2 5.6 11.8 5.6 15 0"/><path d="M2.5 5v5M17.5 5v5"/></svg>',
  flambagem: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3.2v13.6" opacity=".38"/><path d="M10 3.2c-4.6 3.6-4.6 10 0 13.6"/><path d="M6.4 3.2h7.2M6.4 16.8h7.2"/></svg>',
  esforcos: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 14h15"/><path d="M2.5 14c2.2-8.4 12.8-8.4 15 0"/><path d="M6.2 14v-3.7M10 14V8.4M13.8 14v-3.7" opacity=".55"/></svg>',
  vento: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 7.5h9.2a2.4 2.4 0 1 0-2.4-2.4"/><path d="M2.5 11h12.6a2.4 2.4 0 1 1-2.4 2.4"/><path d="M2.5 14.5h5.5" opacity=".55"/></svg>',
  enquadrar: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5V3h4.5M12.5 3H17v4.5M17 12.5V17h-4.5M7.5 17H3v-4.5"/><rect x="7" y="7" width="6" height="6" rx="1" opacity=".55"/></svg>',
  foto: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6.8h3.1l1.4-2h5l1.4 2H17v9.2H3z"/><circle cx="10" cy="11.2" r="2.9"/></svg>',
  play: '<svg viewBox="0 0 20 20"><path d="M6.5 4.6v10.8l8.6-5.4z" fill="currentColor"/></svg>',
  pausa: '<svg viewBox="0 0 20 20"><path d="M5.8 4.6h3v10.8h-3zM11.2 4.6h3v10.8h-3z" fill="currentColor"/></svg>',
  esq: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4.5L6.5 10l5.5 5.5"/></svg>',
  dir: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4.5l5.5 5.5L8 15.5"/></svg>',
  fechar: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/></svg>'
};
const CSS = `
.mcv{position:relative;overflow:hidden;width:100%;height:100%;min-height:340px;box-sizing:border-box;
  font-family:var(--fonte,"IBM Plex Sans","Segoe UI",system-ui,-apple-system,sans-serif);font-size:13px;line-height:1.35;
  color:var(--mcv-t1);background:linear-gradient(180deg,var(--mcv-f0),var(--mcv-f1));outline:none;
  -webkit-user-select:none;user-select:none;isolation:isolate;-webkit-tap-highlight-color:transparent}
.mcv *{box-sizing:border-box}
.mcv--claro{--mcv-f0:#f6f8fb;--mcv-f1:#e1e7ee;--mcv-t1:#111d2b;--mcv-t2:#516375;--mcv-t3:#7e95aa;--mcv-p:#fff;--mcv-p2:#f3f6f9;
  --mcv-b:rgba(15,39,64,.13);--mcv-b2:rgba(15,39,64,.08);--mcv-lav:rgba(15,39,64,.06);--mcv-ac:var(--aco,#0d6ebd);--mcv-ac-t:#fff;
  --mcv-sh:0 1px 2px rgba(15,39,64,.06),0 6px 18px rgba(15,39,64,.09);--mcv-dica:#122336;--mcv-dica-t:#f4f7fb}
.mcv--escuro{--mcv-f0:#101b27;--mcv-f1:#18283a;--mcv-t1:#ecf2f8;--mcv-t2:#a9bacb;--mcv-t3:#7f95aa;--mcv-p:#142433;--mcv-p2:#182b3c;
  --mcv-b:rgba(255,255,255,.10);--mcv-b2:rgba(255,255,255,.07);--mcv-lav:rgba(255,255,255,.07);--mcv-ac:var(--aco-claro,#3d92cb);--mcv-ac-t:#fff;
  --mcv-sh:0 1px 2px rgba(0,0,0,.45),0 8px 22px rgba(0,0,0,.35);--mcv-dica:#e9f0f7;--mcv-dica-t:#0f1924}
.mcv-tela{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:default}
.mcv-tela.mcv-sobre{cursor:pointer}
.mcv-rotulos{position:absolute;inset:0;pointer-events:none;z-index:1;overflow:hidden}
.mcv-rot{position:absolute;left:0;top:0;display:inline-flex;align-items:baseline;gap:5px;white-space:nowrap;padding:2px 7px 2px 6px;
  border-radius:6px;background:var(--mcv-p);border:1px solid var(--mcv-b);box-shadow:0 1px 2px rgba(15,39,64,.10);
  font-size:11.5px;line-height:15px;color:var(--mcv-t1);will-change:transform}
.mcv-rot b{font-weight:600;font-variant-numeric:tabular-nums}
.mcv-rot span{color:var(--mcv-t2);font-size:10.5px}
.mcv-rot-m{display:inline-block;width:8px;height:8px;border-radius:50%;align-self:center;flex:none}
.mcv-rot--eixo{width:22px;height:22px;padding:0;justify-content:center;align-items:center;border-radius:50%;background:var(--mcv-p);
  border:1.2px solid var(--mcv-t3);box-shadow:none;font-size:11px;color:var(--mcv-t2)}
.mcv-rot--eixo b{font-weight:600}
.mcv-rot--fraco{background:var(--mcv-p2);color:var(--mcv-t2);box-shadow:none}
.mcv-rot--forte{border-color:var(--mcv-t1)}
.mcv-ui{position:absolute;inset:0;pointer-events:none;z-index:2}
.mcv-ui>*{pointer-events:auto}
.mcv-cx{background:var(--mcv-p);border:1px solid var(--mcv-b);border-radius:10px;box-shadow:var(--mcv-sh)}
.mcv-topo{position:absolute;top:12px;left:12px;right:12px;display:flex;align-items:flex-start;gap:8px;pointer-events:none}
.mcv-topo>*{pointer-events:auto}
.mcv-modos{display:inline-flex;gap:2px;padding:3px}
.mcv-modo,.mcv-bt,.mcv-seg button{appearance:none;-webkit-appearance:none;border:0;background:transparent;color:var(--mcv-t2);font:inherit;
  cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:7px;white-space:nowrap;border-radius:7px;transition:background .12s,color .12s}
.mcv-modo{height:32px;padding:0 13px 0 10px;font-size:13px;font-weight:500}
.mcv-modo svg{width:17px;height:17px;flex:none}
.mcv-modo:hover,.mcv-bt:hover,.mcv-seg button:hover{background:var(--mcv-lav);color:var(--mcv-t1)}
.mcv-modo[aria-pressed="true"]{background:var(--mcv-ac);color:var(--mcv-ac-t)}
.mcv-modo:focus-visible,.mcv-bt:focus-visible,.mcv-seg button:focus-visible,.mcv select:focus-visible,.mcv input:focus-visible{outline:2px solid var(--mcv-ac);outline-offset:1px}
.mcv-esp{flex:1 1 auto}
.mcv-acoes{display:inline-flex;align-items:center;gap:2px;padding:3px}
.mcv-bt{height:30px;min-width:30px;padding:0 8px;font-size:12.5px;font-weight:500}
.mcv-bt svg{width:17px;height:17px}
.mcv-sep{width:1px;height:18px;background:var(--mcv-b);margin:0 3px}
.mcv-sit{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 12px 0 10px;font-size:12.5px;font-weight:600;color:var(--mcv-t1);white-space:nowrap}
.mcv-sit small{font-weight:400;color:var(--mcv-t2);font-size:12px}
.mcv-ic{display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border-radius:50%;color:#fff;font-size:10.5px;font-weight:700;flex:none;line-height:1}
.mcv-ctx{position:absolute;top:60px;left:12px;display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;padding:7px 12px;max-width:calc(100% - 340px)}
.mcv-ctx label,.mcv-rotc{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--mcv-t2);white-space:nowrap}
.mcv-seg{display:inline-flex;gap:2px;padding:2px;border-radius:8px;background:var(--mcv-lav)}
.mcv-seg button{height:26px;padding:0 10px;font-size:12px;font-weight:500;border-radius:6px}
.mcv-seg button[aria-pressed="true"]{background:var(--mcv-p);color:var(--mcv-t1);box-shadow:0 1px 2px rgba(15,39,64,.16)}
.mcv--escuro .mcv-seg button[aria-pressed="true"]{background:#24394d}
.mcv select{appearance:none;-webkit-appearance:none;height:28px;max-width:300px;padding:0 26px 0 9px;border-radius:7px;border:1px solid var(--mcv-b);
  background:var(--mcv-p) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%237e95aa' stroke-width='1.5'/%3E%3C/svg%3E") no-repeat right 9px center/10px 6px;
  color:var(--mcv-t1);font:inherit;font-size:12.5px;cursor:pointer;text-overflow:ellipsis}
.mcv input[type=range]{-webkit-appearance:none;appearance:none;width:132px;height:20px;background:transparent;cursor:pointer;margin:0}
.mcv input[type=range]::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:var(--mcv-b)}
.mcv input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;margin-top:-5px;background:var(--mcv-ac);border:2px solid var(--mcv-p);box-shadow:0 0 0 1px var(--mcv-ac)}
.mcv input[type=range]::-moz-range-track{height:4px;border-radius:2px;background:var(--mcv-b)}
.mcv input[type=range]::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:var(--mcv-ac);border:2px solid var(--mcv-p)}
.mcv input[type=checkbox]{accent-color:var(--mcv-ac);width:14px;height:14px;margin:0}
.mcv-num{font-variant-numeric:tabular-nums;color:var(--mcv-t1);font-weight:600;min-width:42px;font-size:12px}
.mcv-col{position:absolute;top:60px;right:12px;bottom:12px;width:312px;display:flex;flex-direction:column;gap:10px;pointer-events:none}
.mcv-col>*{pointer-events:auto}
.mcv-cartao{flex:0 1 auto;min-height:0;overflow:auto;padding:0}
.mcv-info{flex:none;margin-top:auto;padding:12px 14px 13px}
.mcv-h{font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--mcv-t3);margin:0 0 7px}
.mcv-big{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 10px;margin:2px 0 6px}
.mcv-big b{white-space:nowrap;font-size:26px;font-weight:600;letter-spacing:-.01em;color:var(--mcv-t1);line-height:1.1}
.mcv-txt{font-size:12.5px;color:var(--mcv-t2);margin:4px 0 0}
.mcv-txt strong{color:var(--mcv-t1);font-weight:600}
.mcv-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--mcv-t1);white-space:nowrap}
.mcv-linhas{display:grid;grid-template-columns:auto 1fr auto;gap:5px 10px;align-items:center;margin-top:8px;font-size:12px}
.mcv-linhas .n{color:var(--mcv-t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mcv-linhas .v{font-variant-numeric:tabular-nums;font-weight:600;color:var(--mcv-t1);text-align:right}
.mcv-linhas .br{height:6px;border-radius:3px;background:var(--mcv-lav);position:relative;overflow:hidden;min-width:40px}
.mcv-linhas .br i{position:absolute;left:0;top:0;bottom:0;border-radius:3px}
.mcv-linhas .lk{cursor:pointer}
.mcv-linhas .lk:hover{color:var(--mcv-ac)}
.mcv-lei{display:grid;grid-template-columns:17px 1fr auto;gap:1px 8px;align-items:center;margin-top:9px;font-size:12.5px}
.mcv-lei .n{color:var(--mcv-t1);font-weight:500}
.mcv-lei .v{font-variant-numeric:tabular-nums;font-weight:600;color:var(--mcv-t1)}
.mcv-lei small{grid-column:2/4;color:var(--mcv-t2);font-size:11.5px}
.mcv-lei.lk{cursor:pointer}.mcv-lei.lk:hover .n{color:var(--mcv-ac)}
.mcv-det{margin-top:9px;border-top:1px solid var(--mcv-b2);padding-top:7px}
.mcv-det summary{cursor:pointer;display:flex;align-items:center;gap:8px;font-size:12px;color:var(--mcv-t1);font-weight:500;list-style:none}
.mcv-det summary::-webkit-details-marker{display:none}
.mcv-det summary::before{content:'';width:0;height:0;border-left:5px solid var(--mcv-t3);border-top:4px solid transparent;border-bottom:4px solid transparent;transition:transform .12s;flex:none}
.mcv-det[open] summary::before{transform:rotate(90deg)}
.mcv-det-r{margin-left:auto;display:inline-flex;align-items:center;gap:4px;color:var(--mcv-t2);font-weight:400;white-space:nowrap}
.mcv-det-r b{color:var(--mcv-t1);font-variant-numeric:tabular-nums}
.mcv-det .mcv-ic{width:15px;height:15px;font-size:9.5px}
.mcv-cab{display:flex;align-items:flex-start;gap:8px;padding:12px 12px 10px 14px;border-bottom:1px solid var(--mcv-b2)}
.mcv-cab div{flex:1;min-width:0}
.mcv-cab h3{margin:0;font-size:14.5px;font-weight:600;color:var(--mcv-t1);line-height:1.25}
.mcv-cab p{margin:2px 0 0;font-size:12px;color:var(--mcv-t2)}
.mcv-cab .mcv-bt{height:26px;min-width:26px;padding:0;margin:-3px -4px 0 0}
.mcv-sec{padding:10px 14px;border-bottom:1px solid var(--mcv-b2)}
.mcv-sec:last-child{border-bottom:0}
.mcv-kv{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;font-size:12px}
.mcv-kv dt{color:var(--mcv-t2)}
.mcv-kv dd{margin:0;color:var(--mcv-t1);font-weight:500;min-width:0;overflow-wrap:anywhere}
.mcv-medidor{position:relative;height:8px;border-radius:4px;margin:8px 0 3px;background:linear-gradient(90deg,#0ca30c33 0 58.3%,#f2a90033 58.3% 75%,#ea6f2d33 75% 83.3%,#d03b3b33 83.3% 100%)}
.mcv-medidor i{position:absolute;top:-3px;width:3px;height:14px;border-radius:2px;background:var(--mcv-t1);transform:translateX(-50%)}
.mcv-medidor u{position:absolute;left:0;top:0;bottom:0;border-radius:4px}
.mcv-esc{display:flex;justify-content:space-between;font-size:10.5px;color:var(--mcv-t3);font-variant-numeric:tabular-nums}
.mcv-regua{position:relative;height:14px;display:block}
.mcv-regua span{position:absolute;top:0;transform:translateX(-50%)}
.mcv-regua span:first-child{transform:none}
.mcv-regua span:last-child{transform:translateX(-100%)}
.mcv-sug{margin:0;padding:9px 11px;border-radius:8px;background:rgba(208,59,59,.08);border-left:3px solid #d03b3b;font-size:12.5px;color:var(--mcv-t1)}
.mcv-sug b{display:block;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--mcv-t2);margin-bottom:2px}
.mcv-nota{font-size:11.5px;color:var(--mcv-t2);margin:6px 0 0}
.mcv-leg{position:absolute;left:86px;bottom:12px;padding:9px 12px 10px;max-width:min(360px,calc(100% - 440px));min-width:180px}
.mcv-leg .mcv-h{margin-bottom:6px}
.mcv-leg-l{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--mcv-t1);margin-top:3px;white-space:nowrap}
.mcv-leg-l i{width:12px;height:12px;border-radius:3px;flex:none}
.mcv-leg-l span{color:var(--mcv-t2);margin-left:auto;padding-left:10px;font-variant-numeric:tabular-nums}
.mcv-rampa{height:10px;border-radius:3px;margin:4px 0 3px}
.mcv-giz{position:absolute;left:12px;bottom:12px;width:64px;height:64px;pointer-events:none;z-index:0}
.mcv-col{z-index:3}
.mcv-dica{position:absolute;left:0;top:0;z-index:4;pointer-events:none;padding:5px 9px;border-radius:7px;background:var(--mcv-dica);color:var(--mcv-dica-t);
  font-size:12px;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.18);max-width:340px;overflow:hidden;text-overflow:ellipsis}
.mcv-dica b{font-weight:600;font-variant-numeric:tabular-nums}
.mcv-msg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-width:min(480px,calc(100% - 32px));padding:18px 20px;z-index:5}
.mcv-msg h3{margin:0 0 6px;font-size:15px}
.mcv-msg p{margin:4px 0 0;color:var(--mcv-t2);font-size:13px}
.mcv [hidden]{display:none!important}
@media (max-width:900px){.mcv-modo span{display:none}.mcv-modo{padding:0 10px}.mcv-ctx{max-width:calc(100% - 24px)}
  .mcv-col{top:auto;width:auto;left:12px;max-height:46%}.mcv-info{display:none}.mcv-leg{left:86px;max-width:calc(100% - 110px)}
  .mcv-col:has(.mcv-cartao:not([hidden])) ~ .mcv-leg{display:none}}
@media (max-width:560px){.mcv-vistas,.mcv-sit small{display:none}.mcv-giz{display:none}.mcv-leg{left:12px}}
`;
function injetarEstilo() {
  if (typeof document === 'undefined' || document.getElementById('mcv-estilo')) return;
  const s = document.createElement('style'); s.id = 'mcv-estilo'; s.textContent = CSS; document.head.appendChild(s);
}
/* criação de elementos (texto SEMPRE por textContent: nome de perfil e de combinação vêm de dado) */
function h(tag, at, ...filhos) {
  const e = document.createElement(tag);
  if (at) for (const k of Object.keys(at)) {
    const v = at[k]; if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v;   /* html: só ícones constantes deste arquivo */
    else if (k === 'style') e.setAttribute('style', v); else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat()) if (f != null && f !== false) e.appendChild(typeof f === 'string' || typeof f === 'number' ? document.createTextNode(String(f)) : f);
  return e;
}
function iconeStatus(st) { return h('span', { class: 'mcv-ic', style: 'background:' + st.cor, text: st.icone, 'aria-hidden': 'true' }); }
function chipStatus(st, texto) { return h('span', { class: 'mcv-chip' }, iconeStatus(st), texto || st.nome); }

/* ================================================================ VISTA */
class Vista {
  constructor(host, r, op) {
    this.host = host; this.r = r; this.op = op || {};
    this.destruida = false;
    this.temaNome = escolherTema(this.op.tema);
    this.D = prepararDados(r);
    this.U = { escala: { value: 0 }, sel: { value: -1 }, hover: { value: -1 }, fundo: { value: new THREE.Color() }, res: { value: new THREE.Vector2(1, 1) } };
    const fe = String(this.op.esforco || 'M').toUpperCase();
    this.est = {
      modo: normalizarModo(this.op.modo) || 'aproveitamento',
      apr: { criterio: 'governante', secundarias: true },
      def: { comb: null, fator: null, indeformada: true },
      fla: { ent: 0, modo: 0, amp: null, animar: this.op.animar !== false },
      esf: { k: this.op.portico != null ? Number(this.op.portico) : null, esforco: ['N', 'V', 'M', 'T'].indexOf(fe) >= 0 ? fe : 'M', comb: null },
      ven: { caso: 0 }
    };
    this.cache = new Map(); this.cena = null; this.selChave = -1; this.hoverChave = -1;
    this.sujo = true; this.t0 = performance.now();
    this._montarDOM();
    if (!this.D.ok) { this._mensagem('Sem resultado para mostrar', [this.D.motivo].concat(this.D.problemas.map(p => p && p.texto).filter(Boolean).slice(1))); return; }
    if (!this._montarGL()) return;
    this._montarBase();
    this._iniciarEstados();
    this._ligarEventos();
    this._trocarModo(this.est.modo, true);
    if (this.est.modo === 'esforcos') {
      /* abre direto na elevação: a câmera 3D de volta é a vista padrão */
      const e = this._calcEnquadramento(new THREE.Box3(new THREE.Vector3(...this.D.mn), new THREE.Vector3(...this.D.mx)), new THREE.Vector3(...DIRECOES['3d']), FOV_3D, this.W, this.H);
      this._cam3d = { p: e.pos, t: e.alvo };
      this._cameraPortico(false);
    } else this.vista('3d', true);
    this._laco = this._laco.bind(this);
    this.raf = requestAnimationFrame(this._laco);
  }

  /* -------------------------------------------------------------- DOM */
  _montarDOM() {
    injetarEstilo();
    const raiz = this.raiz = h('div', { class: 'mcv mcv--' + this.temaNome, tabindex: '0', role: 'application', 'aria-label': 'Vista 3D dos resultados do cálculo da estrutura metálica' });
    this.canvas = h('canvas', { class: 'mcv-tela' });
    this.camRot = h('div', { class: 'mcv-rotulos' });
    this.ui = h('div', { class: 'mcv-ui' });
    raiz.appendChild(this.canvas); raiz.appendChild(this.camRot); raiz.appendChild(this.ui);
    this.dica = h('div', { class: 'mcv-dica', hidden: true }); raiz.appendChild(this.dica);
    this.msg = h('div', { class: 'mcv-msg mcv-cx', hidden: true }); raiz.appendChild(this.msg);
    if (getComputedStyle(this.host).position === 'static') this.host.style.position = 'relative';
    this.host.appendChild(raiz);
  }
  _mensagem(titulo, linhas) {
    this.msg.textContent = '';
    this.msg.appendChild(h('h3', { text: titulo }));
    for (const l of linhas || []) if (l) this.msg.appendChild(h('p', { text: l }));
    this.msg.hidden = false;
  }

  /* -------------------------------------------------------------- WebGL */
  _montarGL() {
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) {
      this._mensagem('O 3D não abriu neste navegador', ['O WebGL está desligado ou indisponível. Os resultados continuam no memorial e nas tabelas.']);
      return false;
    }
    const R = this.renderer;
    R.setClearColor(0x000000, 0);
    R.outputEncoding = THREE.sRGBEncoding;
    R.toneMapping = THREE.NoToneMapping;
    R.shadowMap.enabled = true;
    R.shadowMap.type = THREE.PCFSoftShadowMap;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    R.setPixelRatio(this.dpr);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20000);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.14;
    this.controls.enableZoom = true;               /* pinça no toque; a RODA é tratada antes (zoom em direção ao cursor) */
    this.controls.screenSpacePanning = true;
    this.controls.rotateSpeed = 0.75; this.controls.panSpeed = 0.9;
    this.controls.maxPolarAngle = Math.PI * 0.497;
    this._redimensionar();
    this.ro = new ResizeObserver(() => {
      const pequeno = this.W < 120 || this.H < 120;
      this._redimensionar(); this.sujo = true;
      /* foi aberta dentro de um painel escondido: enquadra de novo quando ele aparece */
      if (pequeno && this.W >= 120 && this.H >= 120 && this.cena) { if (this.est.modo === 'esforcos') this._cameraPortico(false); else this.vista('3d', true); }
    });
    this.ro.observe(this.raiz);
    return true;
  }
  _redimensionar() {
    const w = Math.max(1, this.raiz.clientWidth), hh = Math.max(1, this.raiz.clientHeight);
    this.W = w; this.H = hh;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, hh, false);
    this.camera.aspect = w / hh; this.camera.updateProjectionMatrix();
    this.U.res.value.set(w, hh);
    this._aplicarCentro(w, hh);
  }

  /* -------------------------------------------------------------- cena base: luz, chão, grade, eixos */
  _montarBase() {
    const T = TEMAS[this.temaNome], D = this.D, S = this.scene;
    this.base = new THREE.Group(); S.add(this.base);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1); this.base.add(this.hemi);
    this.sol = new THREE.DirectionalLight(0xffffff, 1);
    this.sol.castShadow = true;
    this.sol.shadow.mapSize.set(2048, 2048);
    this.sol.shadow.bias = -0.0004; this.sol.shadow.normalBias = 0.02;
    this.base.add(this.sol); this.base.add(this.sol.target);
    this.fill = new THREE.DirectionalLight(0xffffff, 1); this.base.add(this.fill);
    const c = D.centro, R = D.diag / 2;
    this.sol.position.set(c[0] - 0.45 * R * 2, c[1] + 1.0 * R * 2, c[2] + 0.62 * R * 2);
    this.sol.target.position.set(c[0], 0, c[2]);
    const sc = this.sol.shadow.camera; sc.left = -R * 1.25; sc.right = R * 1.25; sc.top = R * 1.25; sc.bottom = -R * 1.25; sc.near = 0.1; sc.far = R * 6; sc.updateProjectionMatrix();
    this.fill.position.set(c[0] + R * 2, c[1] + R * 0.6, c[2] - R * 1.5);
    /* chão: só recebe a sombra */
    const m = Math.max(4, 0.32 * D.dimMax);
    this.chaoExt = { x0: D.mn[0] - m, x1: D.mx[0] + m, z0: D.mn[2] - m, z1: D.mx[2] + m };
    const E = this.chaoExt;
    this.chao = new THREE.Mesh(new THREE.PlaneGeometry(E.x1 - E.x0, E.z1 - E.z0), new THREE.ShadowMaterial({ opacity: T.sombra, depthWrite: false }));
    this.chao.rotation.x = -Math.PI / 2; this.chao.position.set((E.x0 + E.x1) / 2, Math.min(0, D.mn[1]) - 0.004, (E.z0 + E.z1) / 2);
    this.chao.receiveShadow = true; this.chao.renderOrder = -2;
    this.base.add(this.chao);
    /* sombra de contato (oclusão fingida): uma mancha suave sob a planta da estrutura, para ela "pousar" no chão */
    const cvs = document.createElement('canvas');
    cvs.width = cvs.height = 256;
    const g2 = cvs.getContext('2d');
    g2.fillStyle = '#000'; g2.fillRect(0, 0, 256, 256);
    g2.shadowColor = '#fff'; g2.shadowBlur = 46; g2.fillStyle = '#fff'; g2.fillRect(64, 64, 128, 128);
    const tex = new THREE.CanvasTexture(cvs);
    const fx = ((D.mx[0] - D.mn[0]) + 2) * 1.75, fz = ((D.mx[2] - D.mn[2]) + 2) * 1.75;
    this.contato = new THREE.Mesh(new THREE.PlaneGeometry(fx, fz), new THREE.MeshBasicMaterial({ color: 0x0b1a2a, alphaMap: tex, transparent: true, opacity: T.contato, depthWrite: false }));
    this.contato.rotation.x = -Math.PI / 2; this.contato.position.set(D.centro[0], Math.min(0, D.mn[1]) - 0.003, D.centro[2]); this.contato.renderOrder = -3;
    this.base.add(this.contato);
    this._montarGrade();
    this._aplicarTema(this.temaNome, true);
  }
  _montarGrade() {
    if (this.grade) { this.base.remove(this.grade); this.grade.geometry.dispose(); this.grade.material.dispose(); }
    if (this.eixosL) { this.base.remove(this.eixosL); this.eixosL.geometry.dispose(); this.eixosL.material.dispose(); }
    const T = TEMAS[this.temaNome], D = this.D, E = this.chaoExt, y0 = Math.min(0, D.mn[1]) - 0.002;
    const passo = lim(arredondar125(D.dimMax / 22), 0.5, 20), maior = 5;
    const cx = (E.x0 + E.x1) / 2, cz = (E.z0 + E.z1) / 2, hx = (E.x1 - E.x0) / 2, hz = (E.z1 - E.z0) / 2;
    const pos = [], cor = [], cm = linear(T.grade), cM = linear(T.gradeForte);
    const alfa = (x, z) => { const t = Math.max(Math.abs(x - cx) / hx, Math.abs(z - cz) / hz); return t < 0.6 ? 1 : t > 1 ? 0 : 1 - (t - 0.6) / 0.4; };
    const seg = (x0, z0, x1, z1, forte) => {
      const n = 24, c = forte ? cM : cm, a0 = forte ? 0.62 : 0.34;
      for (let i = 0; i < n; i++) {
        const ta = i / n, tb = (i + 1) / n, xa = x0 + (x1 - x0) * ta, za = z0 + (z1 - z0) * ta, xb = x0 + (x1 - x0) * tb, zb = z0 + (z1 - z0) * tb;
        pos.push(xa, y0, za, xb, y0, zb);
        cor.push(c[0], c[1], c[2], a0 * alfa(xa, za), c[0], c[1], c[2], a0 * alfa(xb, zb));
      }
    };
    for (let x = Math.ceil(E.x0 / passo) * passo; x <= E.x1 + 1e-9; x += passo) seg(x, E.z0, x, E.z1, Math.round(x / passo) % maior === 0);
    for (let z = Math.ceil(E.z0 / passo) * passo; z <= E.z1 + 1e-9; z += passo) seg(E.x0, z, E.x1, z, Math.round(z / passo) % maior === 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cor, 4));
    this.grade = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    this.grade.renderOrder = -1;
    this.base.add(this.grade);
    /* eixos da obra (como nas pranchas): 1, 2, 3… nos pórticos; A, B nas filas de pilares */
    const L = D.layout, ep = [], ec = [], ce = linear(T.eixo);
    this.bolhas = [];
    const zs = arr(L.zs).map(Number), vao = num(L.vao, null);
    if (zs.length && vao != null) {
      const ext = Math.max(2.2, 0.06 * D.dimMax);
      const linha = (a, b) => { ep.push(a[0], y0 + 0.001, a[1], b[0], y0 + 0.001, b[1]); ec.push(ce[0], ce[1], ce[2], 0.75, ce[0], ce[1], ce[2], 0.75); };
      /* cada eixo tem bolha nas duas pontas; na tela só aparece a da ponta mais perto da câmera (grupo) */
      zs.forEach((z, k) => { linha([-ext, z], [vao + ext, z]); this.bolhas.push({ pos: [-ext - 0.9, y0, z], texto: String(k + 1), grupo: 'f' + k }); this.bolhas.push({ pos: [vao + ext + 0.9, y0, z], texto: String(k + 1), grupo: 'f' + k }); });
      const z0 = zs[0], z1 = zs[zs.length - 1];
      [[0, 'A'], [vao, 'B']].forEach(([x, n]) => { linha([x, z0 - ext], [x, z1 + ext]); this.bolhas.push({ pos: [x, y0, z0 - ext - 0.9], texto: n, grupo: 'a' + n }); this.bolhas.push({ pos: [x, y0, z1 + ext + 0.9], texto: n, grupo: 'a' + n }); });
    }
    if (ep.length) {
      const g2 = new THREE.BufferGeometry();
      g2.setAttribute('position', new THREE.Float32BufferAttribute(ep, 3));
      g2.setAttribute('color', new THREE.Float32BufferAttribute(ec, 4));
      this.eixosL = new THREE.LineSegments(g2, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
      this.eixosL.renderOrder = -1;
      this.base.add(this.eixosL);
    }
    /* na elevação do pórtico (Esforços) a grade e os eixos do galpão ficam escondidos — também quando a grade é refeita (tema, foto) */
    const el = this.est && this.est.modo === 'esforcos';
    this.grade.visible = !el; if (this.eixosL) this.eixosL.visible = !el;
  }
  _aplicarTema(nome, inicial) {
    this.temaNome = nome;
    const T = TEMAS[nome];
    this.raiz.classList.toggle('mcv--claro', nome === 'claro');
    this.raiz.classList.toggle('mcv--escuro', nome === 'escuro');
    if (!this.renderer) return;
    const f = linear(T.fundo[1]);
    this.U.fundo.value.r = f[0]; this.U.fundo.value.g = f[1]; this.U.fundo.value.b = f[2];
    this.hemi.color.copy(corLinear(T.ceu)); this.hemi.groundColor.copy(corLinear(T.chao)); this.hemi.intensity = T.luzHemi;
    this.sol.intensity = T.luzSol; this.fill.intensity = T.luzFill;
    this.chao.material.opacity = T.sombra;
    if (this.contato) this.contato.material.opacity = T.contato;
    if (!inicial) { this._montarGrade(); this._limparCache(); this._trocarModo(this.est.modo, true); }
    this.sujo = true;
  }

  /* -------------------------------------------------------------- estados iniciais por modo */
  _iniciarEstados() {
    const D = this.D;
    /* deformada: a combinação rara que governa o serviço (ou a 1ª rara) */
    let cDef = null, rz = -1;
    for (const s of arr(this.r.servico)) if (ehObj(s) && D.combPorId.has(String(s.comb)) && num(s.razao, 0) > rz) { rz = num(s.razao, 0); cDef = String(s.comb); }
    if (!cDef) { const c = D.combs.find(x => x.tipo === 'ELS-rara') || D.combs.find(x => /^ELS/.test(x.tipo)) || D.combs[0]; cDef = c ? c.id : null; }
    this.est.def.comb = this.op.combinacao && D.combPorId.has(String(this.op.combinacao)) ? String(this.op.combinacao) : cDef;
    /* flambagem: o menor λ positivo */
    let ie = 0, lm = Infinity;
    D.flamb.forEach((f, i) => { if (f.lambda > 0 && f.lambda < lm) { lm = f.lambda; ie = i; } });
    this.est.fla.ent = ie;
    /* esforços: o pórtico com a barra mais solicitada */
    if (this.est.esf.k == null || !D.porticos.some(p => p.k === this.est.esf.k)) {
      let kk = D.porticos.length ? D.porticos[0].k : null, best = -1;
      for (const M of D.membros) { const rr = razaoMembro(M, 'elu'); if (rr != null && rr > best && D.porticos.some(p => p.k === M.k && p.membros.indexOf(M) >= 0)) { best = rr; kk = M.k; } }
      this.est.esf.k = kk;
    }
    this.est.esf.comb = this.op.combinacao && D.combPorId.has(String(this.op.combinacao)) ? String(this.op.combinacao) : this._combGovernaPortico(this.est.esf.k);
  }
  _combGovernaPortico(k) {
    const D = this.D, P = D.porticos.find(p => p.k === k);
    let comb = null, best = -1;
    if (P) for (const M of P.membros) { if (M.verif && M.verif.pior && D.combPorId.has(String(M.verif.pior.comb)) && num(M.razaoELU, 0) > best) { best = num(M.razaoELU, 0); comb = String(M.verif.pior.comb); } }
    if (!comb) { const c = D.combs.find(x => x.tipo === 'ELU') || D.combs[0]; comb = c ? c.id : null; }
    return comb;
  }

  /* -------------------------------------------------------------- materiais */
  _matSolido(comDesl) {
    const U = this.U;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0.08 });
    m.onBeforeCompile = sh => {
      sh.uniforms.uEscala = U.escala; sh.uniforms.uSel = U.sel; sh.uniforms.uHover = U.hover; sh.uniforms.uFundo = U.fundo;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aDesl;\nattribute float aId;\nuniform float uEscala;\nvarying float vId;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + (comDesl ? 'transformed += uEscala * aDesl;\n' : '') + 'vId = aId;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uSel;\nuniform float uHover;\nuniform vec3 uFundo;\nvarying float vId;')
        .replace('#include <color_fragment>', '#include <color_fragment>\nif (uSel > -0.5 && abs(vId - uSel) > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, uFundo, 0.72);\nif (uHover > -0.5 && abs(vId - uHover) < 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), 0.32);');
    };
    m.customProgramCacheKey = () => 'mcv-solido-' + (comDesl ? 'd' : 'f');
    return m;
  }
  _matProfundidade() {
    const U = this.U;
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    m.onBeforeCompile = sh => {
      sh.uniforms.uEscala = U.escala;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aDesl;\nuniform float uEscala;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += uEscala * aDesl;');
    };
    m.customProgramCacheKey = () => 'mcv-prof-d';
    return m;
  }
  _malhaSolidos(pecas, comDesl) {
    if (!pecas.length) return null;
    const g = construirSolidos(pecas, comDesl), mesh = new THREE.Mesh(g, this._matSolido(comDesl));
    mesh.castShadow = true; mesh.receiveShadow = false;
    if (comDesl) mesh.customDepthMaterial = this._matProfundidade();
    return mesh;
  }
  /* linhas grossas: segs = [{ a, b, ca, cb, da?, db?, id? }] */
  _malhaLinhas(segs, op) {
    if (!segs.length) return null;
    op = op || {};
    const n = segs.length, A = new Float32Array(n * 3), B = new Float32Array(n * 3), CA = new Float32Array(n * 3), CB = new Float32Array(n * 3), DA = new Float32Array(n * 3), DB = new Float32Array(n * 3), ID = new Float32Array(n);
    segs.forEach((s, i) => {
      const o = i * 3;
      A.set(s.a, o); B.set(s.b, o); CA.set(s.ca, o); CB.set(s.cb || s.ca, o);
      if (s.da) DA.set(s.da, o); if (s.db) DB.set(s.db, o);
      ID[i] = s.id != null ? s.id : -10;
    });
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
    g.setIndex([0, 2, 1, 2, 3, 1]);
    g.setAttribute('iA', new THREE.InstancedBufferAttribute(A, 3)); g.setAttribute('iB', new THREE.InstancedBufferAttribute(B, 3));
    g.setAttribute('iCA', new THREE.InstancedBufferAttribute(CA, 3)); g.setAttribute('iCB', new THREE.InstancedBufferAttribute(CB, 3));
    g.setAttribute('iDA', new THREE.InstancedBufferAttribute(DA, 3)); g.setAttribute('iDB', new THREE.InstancedBufferAttribute(DB, 3));
    g.setAttribute('iId', new THREE.InstancedBufferAttribute(ID, 1));
    g.instanceCount = n;
    const U = this.U;
    const transp = op.opacidade != null && op.opacidade < 1;
    const m = new THREE.ShaderMaterial({
      uniforms: { uRes: U.res, uLarg: { value: op.largura || 2 }, uOpac: { value: op.opacidade != null ? op.opacidade : 1 }, uEscala: op.semEscala ? { value: 0 } : U.escala, uSel: op.semRealce ? { value: -1 } : U.sel, uHover: op.semRealce ? { value: -1 } : U.hover, uFundo: U.fundo },
      vertexShader: VS_LINHA, fragmentShader: FS_LINHA, transparent: transp, depthWrite: !transp, depthTest: op.semProfundidade ? false : true, side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    if (op.ordem != null) mesh.renderOrder = op.ordem;
    return mesh;
  }
  _limparCache() {
    for (const c of this.cache.values()) this._descartar(c);
    this.cache.clear();
    if (this.cena && !this.cena._emCache) this._descartar(this.cena);
    this.cena = null;
  }
  _descartar(c) {
    if (!c || !c.grupo) return;
    if (c.grupo.parent) c.grupo.parent.remove(c.grupo);
    c.grupo.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.dispose) o.material.dispose(); } if (o.customDepthMaterial) o.customDepthMaterial.dispose(); });
  }
  _guardar(chave, cena) {
    cena._emCache = true; cena.chave = chave;
    this.cache.set(chave, cena);
    if (this.cache.size > 8) { const k0 = this.cache.keys().next().value; const c0 = this.cache.get(k0); if (c0 !== this.cena) { this._descartar(c0); this.cache.delete(k0); } }
    return cena;
  }

  /* ============================================================== MODO 1: APROVEITAMENTO */
  _cenaAproveitamento() {
    const D = this.D, T = TEMAS[this.temaNome], st = this.est.apr, chave = 'apr|' + st.criterio + '|' + st.secundarias + '|' + this.temaNome;
    if (this.cache.has(chave)) return this.cache.get(chave);
    const pecas = [], linhas = [], alvos = [], cont = [0, 0, 0, 0], semVerif = { n: 0 };
    const cNeutro = linear(T.secundaria), contados = new Set();
    for (const B of D.barras) {
      let corB = null, razao = null;
      if (B.membro) { razao = razaoMembro(B.membro, st.criterio); const s = statusDe(razao); corB = s ? linear(s.cor) : linear(T.neutro); if (s && !contados.has(B.membro.id)) { cont[STATUS.indexOf(s)]++; contados.add(B.membro.id); } }
      else if (B.tipo === 'contravento') { razao = st.criterio === 'els' || B.frouxa ? null : B.razao; const s = statusDe(razao); corB = s ? linear(s.cor) : linear(T.neutro); if (s) cont[STATUS.indexOf(s)]++; }
      else {
        if (!st.secundarias) continue;
        const s = B.sec ? statusDe(razaoSec(B.sec, st.criterio)) : null;
        corB = s ? linear(s.cor) : cNeutro; semVerif.n++; if (B.sec) semVerif.comVerif = true;
      }
      if (B.tracao) { linhas.push({ a: B.p0, b: B.p1, ca: corB, cb: corB, id: B.chave }); alvos.push({ chave: B.chave, pts: [B.p0, B.p1] }); continue; }
      const pf = perfilDe(B.secao, B.tipo);
      pecas.push({ B, perfil: pf, am: [{ s: 0, d: null, c: corB }, { s: 1, d: null, c: corB }], chave: B.chave });
      alvos.push({ chave: B.chave, pts: [B.p0, B.p1], raio: pf.raio });
    }
    const grupo = new THREE.Group();
    const ms = this._malhaSolidos(pecas, false); if (ms) grupo.add(ms);
    const ml = this._malhaLinhas(linhas, { largura: 2.6 }); if (ml) grupo.add(ml);
    /* rótulos: as que não passam e a pior de cada grupo (seletivo: nunca um número em cada barra) */
    const rot = [], piores = new Map();
    for (const M of D.membros) { const rz = razaoMembro(M, st.criterio); if (rz == null || !M.barras.length) continue; const g = M.grupo || M.papel; if (!piores.has(g) || rz > piores.get(g).rz) piores.set(g, { M, rz }); }
    const falham = D.membros.filter(M => M.barras.length && num(razaoMembro(M, st.criterio), 0) > 1).sort((a, b) => razaoMembro(b, st.criterio) - razaoMembro(a, st.criterio)).slice(0, 5);
    for (const M of D.membros) {
      const rz = razaoMembro(M, st.criterio); if (rz == null || !M.barras.length) continue;
      const ehPior = piores.has(M.grupo || M.papel) && piores.get(M.grupo || M.papel).M === M;
      if (!(ehPior || falham.indexOf(M) >= 0)) continue;
      const s = statusDe(rz), p = pontoNoMembro(M, (M.Lgeo || M.L) / 2);
      rot.push({ pos: p, texto: fmt(rz, 2), sub: M.id, cor: s.cor, prioridade: 100 + rz * 10 + (ehPior ? 50 : 0), classe: rz > 1 ? 'forte' : 'valor', chave: M.chave });
    }
    if (st.criterio !== 'els') {
      let pior = null; for (const B of D.barras) if (B.tipo === 'contravento' && B.razao != null && (!pior || B.razao > pior.razao)) pior = B;
      if (pior) { const s = statusDe(pior.razao); rot.push({ pos: esc(soma(pior.p0, pior.p1), 0.5), texto: fmt(pior.razao, 2), sub: 'contravento', cor: s.cor, prioridade: 90 + pior.razao * 10, chave: pior.chave }); }
    }
    /* terças e travessas: um rótulo por grupo, quando perto do limite ou não passa */
    if (st.secundarias) for (const g of ['terca', 'travLat', 'travOit']) {
      const G2 = D.SEC[g], rz = razaoSec(G2, st.criterio); if (rz == null || !(rz > 0.9 || G2.ok === false)) continue;
      let rep = null, dm = Infinity;
      for (const B of D.barras) if (B.grupoSec === g) { const d = comp(sub(esc(soma(B.p0, B.p1), 0.5), D.centro)); if (d < dm) { dm = d; rep = B; } }
      if (rep) { const s = statusDe(rz); rot.push({ pos: esc(soma(rep.p0, rep.p1), 0.5), texto: fmt(rz, 2), sub: NOME_SEC[g].toLowerCase(), cor: s.cor, prioridade: 80 + rz * 10, classe: rz > 1 ? 'forte' : 'valor', chave: rep.chave }); }
    }
    const legenda = { tipo: 'status', titulo: st.criterio === 'els' ? 'Serviço · deslocamento ÷ limite' : st.criterio === 'elu' ? 'Aproveitamento · ELU' : 'Aproveitamento · ELU ou ELS', contagens: cont, secundarias: st.secundarias && semVerif.n ? semVerif.n : 0, secComVerif: !!semVerif.comVerif };
    return this._guardar(chave, { modo: 'aproveitamento', grupo, alvos, rotulos: rot, legenda, escala: 0 });
  }

  /* ============================================================== MODO 2: DEFORMADA */
  _amostrasEstacoes(B, cb) {
    const e = cb.barras ? cb.barras[B.id] : null, est = e ? arr(e.estacoes) : [];
    /* ⚠ barra SÓ DE TRAÇÃO (tirante/contravento): a estação traz a flecha de VIGA do peso próprio
       (Ø 12,5 mm × 8,3 m → 2,6 m na ELSr3 do galpão de exemplo), que não existe num tirante
       esticado. Aqui ela é a corda entre os nós. */
    if (!B.tracao && est.length >= 2 && !e.inativa && Array.isArray(est[0].u)) {
      let am = est.filter(p => ehObj(p) && Array.isArray(p.u)).map(p => ({ s: lim(num(p.x, 0) / B.L, 0, 1), d: v3(p.u) }));
      const nMax = this.D.barras.length > 900 ? 9 : 25;
      if (am.length > nMax + 1) { const passo = (am.length - 1) / nMax, o = []; for (let i = 0; i <= nMax; i++) o.push(am[Math.round(i * passo)]); am = o; }
      return am;
    }
    const da = cb.desloc ? cb.desloc[B.i] : null, db = cb.desloc ? cb.desloc[B.j] : null;
    return [{ s: 0, d: da ? v3(da) : [0, 0, 0] }, { s: 1, d: db ? v3(db) : [0, 0, 0] }];
  }
  _cenaDeformada() {
    const D = this.D, T = TEMAS[this.temaNome], comb = this.est.def.comb, cb = D.AC[comb];
    const chave = 'def|' + comb + '|' + this.temaNome;
    if (this.cache.has(chave)) return this.cache.get(chave);
    if (!cb) return { modo: 'deformada', grupo: new THREE.Group(), alvos: [], rotulos: [], legenda: null, vazio: 'Sem resultado de análise para esta combinação.' };
    const amostras = new Map(); let umax = 0, onde = null;
    for (const B of D.barras) {
      const am = this._amostrasEstacoes(B, cb); amostras.set(B.id, am);
      for (const a of am) { const m = comp(a.d); if (m > umax) { umax = m; onde = { B, a }; } }
    }
    const umaxS = umax > 0 ? umax : 1;
    const pecas = [], linhas = [], fantasmas = [], alvos = [], cF = linear(T.fantasma);
    for (const B of D.barras) {
      const am = amostras.get(B.id).map(a => ({ s: a.s, d: a.d, c: rampa(comp(a.d) / umaxS, T.rampa) }));
      fantasmas.push({ a: B.p0, b: B.p1, ca: cF, cb: cF });
      if (B.tracao) { linhas.push({ a: B.p0, b: B.p1, ca: am[0].c, cb: am[am.length - 1].c, da: am[0].d, db: am[am.length - 1].d, id: B.chave }); alvos.push({ chave: B.chave, pts: [B.p0, B.p1], des: [am[0].d, am[am.length - 1].d] }); continue; }
      pecas.push({ B, perfil: perfilDe(B.secao, B.tipo), am, chave: B.chave });
      alvos.push({ chave: B.chave, pts: am.map(a => soma(B.p0, esc(B.ex, a.s * B.L))), des: am.map(a => a.d) });
    }
    const grupo = new THREE.Group();
    const ms = this._malhaSolidos(pecas, true); if (ms) grupo.add(ms);
    const ml = this._malhaLinhas(linhas, { largura: 2.4 }); if (ml) grupo.add(ml);
    const mf = this._malhaLinhas(fantasmas, { largura: 1, opacidade: 0.42, semEscala: true, semRealce: true, ordem: 1 }); if (mf) { mf.name = 'fantasma'; grupo.add(mf); }
    /* leituras de serviço: topo dos pilares (em relação à base) e cumeeira (em relação aos beirais) */
    const C = D.combPorId.get(comb) || { tipo: '' }, rara = /rara/.test(C.tipo);
    const rot = [], leituras = { pilares: [], cumeeiras: [], umax, onde };
    const dN = id => (cb.desloc && cb.desloc[id] ? v3(cb.desloc[id]) : null);
    for (const M of D.membros) {
      if (M.papel !== 'pilar' || M.nos.length < 2) continue;
      const topo = M.nos[M.nos.length - 1], base = M.nos[0], a = dN(topo), b = dN(base) || [0, 0, 0];
      if (!a || !D.nos.get(topo)) continue;
      const dh = Math.hypot(a[0] - b[0], a[2] - b[2]), H = M.L || M.Lgeo, limv = H / 300;
      leituras.pilares.push({ M, dh, lim: limv, razao: dh / limv, no: topo, desl: a, H });
    }
    const L = D.layout;
    if (L && L.aguas === 2) arr(L.zs).forEach((z, k) => {
      const c = 'C' + k, e1 = 'E' + k + 'L', e2 = 'E' + k + 'R', dc = dN(c), d1 = dN(e1), d2 = dN(e2);
      if (!dc || !d1 || !d2 || !D.nos.get(c)) return;
      const dv = dc[1] - (d1[1] + d2[1]) / 2, vao = num(L.vao, 0), limv = vao / 250;
      leituras.cumeeiras.push({ k, dv, lim: limv, razao: Math.abs(dv) / limv, no: c, desl: dc, vao });
    });
    /* rótulos SELETIVOS: o máximo, os 2 piores topos de pilar e as 2 piores cumeeiras (o resto no cartão/dica) */
    const pMax = onde ? soma(onde.B.p0, esc(onde.B.ex, onde.a.s * onde.B.L)) : null;
    let maxNaCumeeira = false;
    let cums = leituras.cumeeiras.slice().sort((a, b) => Math.abs(b.dv) - Math.abs(a.dv));
    if (pMax) { const i0 = cums.findIndex(q => comp(sub(pMax, D.nos.get(q.no))) < 0.8); if (i0 > 0) cums.unshift(cums.splice(i0, 1)[0]); }
    cums = cums.slice(0, 2);
    for (const q of cums) {
      const s = rara ? (q.razao <= 1 ? STATUS[0] : STATUS[3]) : null, P = D.nos.get(q.no), ehMax = pMax && comp(sub(pMax, P)) < 0.8;
      if (ehMax) maxNaCumeeira = true;
      rot.push({ pos: P, desl: q.desl, texto: fmtMm(Math.abs(q.dv)), sub: 'cumeeira' + (Math.abs(q.dv) > 1e-6 ? ' · L/' + Math.round(q.vao / Math.abs(q.dv)) : ''), cor: s ? s.cor : null, classe: ehMax ? 'forte' : 'valor', prioridade: (ehMax ? 1000 : 300) + Math.abs(q.dv) * 1000, fixo: ehMax });
    }
    const pils = leituras.pilares.slice().sort((a, b) => b.dh - a.dh), usados = new Set();
    for (const q of pils) {
      if (usados.size >= 2) break;
      if (usados.has(q.M.k)) continue; usados.add(q.M.k);
      const s = rara ? (q.razao <= 1 ? STATUS[0] : STATUS[3]) : null;
      rot.push({ pos: D.nos.get(q.no), desl: q.desl, texto: fmtMm(q.dh), sub: 'topo' + (q.dh > 1e-6 ? ' · H/' + Math.round(q.H / q.dh) : ''), cor: s ? s.cor : null, prioridade: 250 + q.dh * 1000, chave: q.M.chave });
    }
    if (pMax && !maxNaCumeeira) rot.push({ pos: pMax, desl: onde.a.d, texto: 'máx. ' + fmtMm(umax), classe: 'forte', prioridade: 1000, fixo: true });
    /* fator automático: o maior deslocamento aparece com ~5 % do tamanho do modelo, arredondado (1-2-5) */
    const auto = arredondar125(umax > 0 ? 0.05 * D.dimMax / umax : 1);
    const legenda = { tipo: 'rampa', titulo: 'Deslocamento total', min: 0, max: umax, unidade: 'mm', fator: 1000, rampa: T.rampa };
    return this._guardar(chave, { modo: 'deformada', grupo, alvos, rotulos: rot, legenda, escalaAuto: auto, leituras, comb, rara, amostras });
  }

  /* ============================================================== MODO 3: FLAMBAGEM */
  _curvaModo(B, desloc, nAm) {
    const nE = B.tracao ? 1 : B.nElem, Le = B.L / nE, out = [];
    const cadeia = [B.i]; for (let k = 1; k < nE; k++) cadeia.push(B.id + '#' + k); cadeia.push(B.j);
    const lib = l => { const x = B.libera && B.libera[l]; return { ry: !!(x && x.ry), rz: !!(x && x.rz) }; };
    const ri = B.tracao ? { ry: true, rz: true } : lib('i'), rj = B.tracao ? { ry: true, rz: true } : lib('j');
    const incl = (ta, tb, la, lb, corda) => { if (la && lb) return [corda, corda]; if (lb) return [ta, (3 * corda - ta) / 2]; if (la) return [(3 * corda - tb) / 2, tb]; return [ta, tb]; };
    for (let k = 0; k < nE; k++) {
      const da = desloc[cadeia[k]], db = desloc[cadeia[k + 1]];
      const ta = da ? v3(da) : [0, 0, 0], tb = db ? v3(db) : [0, 0, 0];
      const ra = Array.isArray(da) && da.length >= 6 ? [num(da[3], 0), num(da[4], 0), num(da[5], 0)] : null;
      const rb = Array.isArray(db) && db.length >= 6 ? [num(db[3], 0), num(db[4], 0), num(db[5], 0)] : null;
      const la = [pe(ta, B.ex), pe(ta, B.ey), pe(ta, B.ez)], lb = [pe(tb, B.ex), pe(tb, B.ey), pe(tb, B.ez)];
      /* inclinações locais: v' = θz; w' = −θy (convenção do js/acoanalise.js) */
      let tza = ra ? pe(ra, B.ez) : 0, tzb = rb ? pe(rb, B.ez) : 0, psa = ra ? -pe(ra, B.ey) : 0, psb = rb ? -pe(rb, B.ey) : 0;
      const livreA = k === 0, livreB = k === nE - 1;
      [tza, tzb] = incl(tza, tzb, (livreA && ri.rz) || !ra, (livreB && rj.rz) || !rb, (lb[1] - la[1]) / Le);
      [psa, psb] = incl(psa, psb, (livreA && ri.ry) || !ra, (livreB && rj.ry) || !rb, (lb[2] - la[2]) / Le);
      for (let q = (k === 0 ? 0 : 1); q <= nAm; q++) {
        const xi = q / nAm, x2 = xi * xi, x3 = x2 * xi;
        const H1 = 1 - 3 * x2 + 2 * x3, H2 = Le * (xi - 2 * x2 + x3), H3 = 3 * x2 - 2 * x3, H4 = Le * (-x2 + x3);
        const ua = la[0] + (lb[0] - la[0]) * xi, v = H1 * la[1] + H2 * tza + H3 * lb[1] + H4 * tzb, w = H1 * la[2] + H2 * psa + H3 * lb[2] + H4 * psb;
        out.push({ s: (k + xi) / nE, d: soma(soma(esc(B.ex, ua), esc(B.ey, v)), esc(B.ez, w)) });
      }
    }
    return out;
  }
  _cenaFlambagem() {
    const D = this.D, T = TEMAS[this.temaNome], ent = D.flamb[this.est.fla.ent];
    if (!ent) {
      const sem = D.flambSem.map(f => f.combinacao + (f.ate != null ? ' (examinado até λ = ' + fmt(f.ate, 1) + ')' : '')).join('; ');
      return { modo: 'flambagem', grupo: new THREE.Group(), alvos: [], rotulos: [], legenda: null,
        vazio: sem ? 'Nenhum modo de flambagem global com λ positivo: ' + sem + '. A estrutura não flamba sob essas combinações.' : 'O resultado não traz a análise de flambagem global.' };
    }
    const mi = Math.min(this.est.fla.modo, ent.modos.length - 1), md = ent.modos[mi];
    const chave = 'fla|' + ent.i + '|' + mi + '|' + this.temaNome;
    if (this.cache.has(chave)) return this.cache.get(chave);
    const curvas = new Map(); let amax = 0, onde = null;
    for (const B of D.barras) {
      const nAm = B.tracao ? 1 : D.barras.length > 900 ? (B.L > 3 ? 5 : 4) : (B.L > 3 ? 8 : 6), cv = this._curvaModo(B, md.desloc, nAm);
      curvas.set(B.id, cv);
      for (const a of cv) { const m = comp(a.d); if (m > amax) { amax = m; onde = { B, a }; } }
    }
    const amS = amax > 0 ? amax : 1, pecas = [], linhas = [], fantasmas = [], alvos = [], cF = linear(T.fantasma);
    const partic = new Map();
    for (const B of D.barras) {
      const cv = curvas.get(B.id).map(a => ({ s: a.s, d: a.d, c: rampa(comp(a.d) / amS, T.rampa) }));
      let mxB = 0; for (const a of cv) mxB = Math.max(mxB, comp(a.d));
      const kk = B.chave; partic.set(kk, Math.max(partic.get(kk) || 0, mxB / amS));
      fantasmas.push({ a: B.p0, b: B.p1, ca: cF, cb: cF });
      if (B.tracao) { linhas.push({ a: B.p0, b: B.p1, ca: cv[0].c, cb: cv[cv.length - 1].c, da: cv[0].d, db: cv[cv.length - 1].d, id: B.chave }); alvos.push({ chave: B.chave, pts: [B.p0, B.p1], des: [cv[0].d, cv[cv.length - 1].d] }); continue; }
      pecas.push({ B, perfil: perfilDe(B.secao, B.tipo), am: cv, chave: B.chave });
      alvos.push({ chave: B.chave, pts: cv.map(a => soma(B.p0, esc(B.ex, a.s * B.L))), des: cv.map(a => a.d) });
    }
    const grupo = new THREE.Group();
    const ms = this._malhaSolidos(pecas, true); if (ms) grupo.add(ms);
    const ml = this._malhaLinhas(linhas, { largura: 2.4 }); if (ml) grupo.add(ml);
    const mf = this._malhaLinhas(fantasmas, { largura: 1, opacidade: 0.42, semEscala: true, semRealce: true, ordem: 1 }); if (mf) grupo.add(mf);
    /* direção predominante e a peça que mais se move */
    const somaDir = [0, 0, 0];
    for (const id of Object.keys(md.desloc)) { const d = md.desloc[id]; if (Array.isArray(d)) for (let q = 0; q < 3; q++) somaDir[q] += Math.abs(num(d[q], 0)); }
    const tot = somaDir[0] + somaDir[1] + somaDir[2] || 1, qd = somaDir.indexOf(Math.max.apply(null, somaDir));
    const direcao = ['transversal (X, no plano dos pórticos)', 'vertical (Y)', 'longitudinal (Z, ao longo do galpão)'][qd];
    const alvoMax = onde ? D.alvos[onde.B.chave] : null;
    const rot = [];
    if (onde) {
      const p = soma(onde.B.p0, esc(onde.B.ex, onde.a.s * onde.B.L));
      const nomeA = alvoMax ? (alvoMax.tipo === 'membro' ? nomeMembro(alvoMax.ref) : nomeBarra(alvoMax.ref) + ' ' + alvoMax.ref.id) : '';
      rot.push({ pos: p, desl: esc(onde.a.d, 1), texto: 'maior amplitude', sub: nomeA, classe: 'forte', prioridade: 1000, fixo: true });
    }
    const legenda = { tipo: 'rampa', titulo: 'Amplitude relativa do modo', min: 0, max: 1, unidade: '', fator: 1, rampa: T.rampa, relativa: true };
    const Lm = alvoMax ? (alvoMax.tipo === 'membro' ? (alvoMax.ref.Lgeo || alvoMax.ref.L) : alvoMax.ref.L) : D.dimMax / 6;
    const ampAlvo = lim(0.1 * Lm, 0.012 * D.dimMax, 0.05 * D.dimMax);
    return this._guardar(chave, { modo: 'flambagem', grupo, alvos, rotulos: rot, legenda, escalaAuto: ampAlvo / amS, ent, mi, md, direcao, fracDir: Math.max.apply(null, somaDir) / tot, alvoMax, partic, amax });
  }

  /* ============================================================== MODO 4: ESFORÇOS */
  _valorEsforco(p, B, n, qual) {
    if (qual === 'N') return num(p.N, 0);
    if (qual === 'T') return num(p.T, 0);
    if (qual === 'V') { const v = soma(esc(B.ey, num(p.Vy, 0)), esc(B.ez, num(p.Vz, 0))); return pe(v, n); }
    /* M: vetor do lado TRACIONADO (Mz > 0 comprime a face +y → traciona −y; My > 0 comprime −z → traciona +z) */
    const d = soma(esc(B.ey, -num(p.Mz, 0)), esc(B.ez, num(p.My, 0)));
    return pe(d, n);
  }
  _normalNoPlano(B) {
    let n = unit(pv([0, 0, 1], B.ex));
    if (comp(n) < 1e-6) n = [0, 1, 0];
    if (n[1] < -1e-6 || (Math.abs(n[1]) <= 1e-6 && n[0] > 0)) n = esc(n, -1);
    return n;
  }
  _cenaEsforcos() {
    const D = this.D, T = TEMAS[this.temaNome], es = this.est.esf, P = D.porticos.find(p => p.k === es.k), cb = D.AC[es.comb];
    const chave = 'esf|' + es.k + '|' + es.esforco + '|' + es.comb + '|' + this.temaNome;
    if (this.cache.has(chave)) return this.cache.get(chave);
    if (!P) return { modo: 'esforcos', grupo: new THREE.Group(), alvos: [], rotulos: [], legenda: null, vazio: 'Não há pórticos identificados neste resultado.' };
    if (!cb) return { modo: 'esforcos', grupo: new THREE.Group(), alvos: [], rotulos: [], legenda: null, vazio: 'Sem resultado de análise para esta combinação.' };
    const qual = es.esforco, grupo = new THREE.Group(), pecas = [], alvos = [], cN = linear(T.neutro);
    for (const B of P.barras) {
      pecas.push({ B, perfil: perfilDe(B.secao, B.tipo), am: [{ s: 0, d: null, c: cN }, { s: 1, d: null, c: cN }], chave: B.chave });
      alvos.push({ chave: B.chave, pts: [B.p0, B.p1] });
    }
    const ms = this._malhaSolidos(pecas, false); if (ms) grupo.add(ms);
    /* valores ao longo de cada barra */
    const dados = []; let vmax = 0;
    for (const B of P.barras) {
      const e = cb.barras[B.id], est = e && !e.inativa ? arr(e.estacoes).filter(ehObj) : [];
      const n = this._normalNoPlano(B);
      const pts = est.map(p => ({ x: lim(num(p.x, 0), 0, B.L), v: this._valorEsforco(p, B, n, qual) }));
      if (!pts.length) continue;
      for (const q of pts) vmax = Math.max(vmax, Math.abs(q.v));
      dados.push({ B, n, pts });
    }
    let maxM = 0; if (qual === 'T') for (const d of dados) { const e = cb.barras[d.B.id]; for (const p of arr(e && e.estacoes)) maxM = Math.max(maxM, Math.abs(num(p.Mz, 0)), Math.abs(num(p.My, 0))); }
    const desprezivel = !(vmax > 1e-4) || (qual === 'T' && vmax < Math.max(0.01, 2e-3 * maxM));
    const rot = [], vao = num(D.layout.vao, D.dimMax);
    const escalaD = desprezivel ? 0 : 0.12 * Math.max(vao, 4) / vmax;
    const cPos = linear(qual === 'N' ? T.tracao : T.diagrama), cNeg = linear(qual === 'N' ? T.compressao : T.diagrama);
    const triP = [], triC = [], contorno = [], hachura = [];
    const corDe = v => (v >= 0 ? cPos : cNeg);
    if (!desprezivel) for (const dd of dados) {
      if (dd.pts.every(q => Math.abs(q.v) < 2e-3 * vmax)) continue;
      const B = dd.B, base = x => soma(B.p0, esc(B.ex, x)), ponta = (x, v) => soma(base(x), esc(dd.n, v * escalaD));
      const pts = dd.pts;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        if (b.x - a.x < 1e-9) continue;
        if (a.v * b.v < 0) {
          const xm = a.x + (b.x - a.x) * a.v / (a.v - b.v);
          triP.push(base(a.x), ponta(a.x, a.v), base(xm)); triC.push(corDe(a.v), corDe(a.v), corDe(a.v));
          triP.push(base(xm), ponta(b.x, b.v), base(b.x)); triC.push(corDe(b.v), corDe(b.v), corDe(b.v));
        } else {
          const c = corDe(Math.abs(a.v) > Math.abs(b.v) ? a.v : b.v);
          triP.push(base(a.x), ponta(a.x, a.v), ponta(b.x, b.v)); triC.push(c, c, c);
          triP.push(base(a.x), ponta(b.x, b.v), base(b.x)); triC.push(c, c, c);
        }
        contorno.push({ a: ponta(a.x, a.v), b: ponta(b.x, b.v), ca: corDe(a.v), cb: corDe(b.v) });
      }
      const p0 = pts[0], p1 = pts[pts.length - 1], Mb = B.membro ? B.membro.barras : null;
      if (!Mb || Mb[0] === B) contorno.push({ a: base(p0.x), b: ponta(p0.x, p0.v), ca: corDe(p0.v), cb: corDe(p0.v) });
      if (!Mb || Mb[Mb.length - 1] === B) contorno.push({ a: base(p1.x), b: ponta(p1.x, p1.v), ca: corDe(p1.v), cb: corDe(p1.v) });
      let ultimo = -1e9;
      for (const q of pts) { if (q.x - ultimo < Math.max(0.18, B.L / 14) || Math.abs(q.v) * escalaD < 0.03) continue; ultimo = q.x; hachura.push({ a: base(q.x), b: ponta(q.x, q.v), ca: corDe(q.v), cb: corDe(q.v) }); }
    }
    if (triP.length) {
      const pos = new Float32Array(triP.length * 3), cor = new Float32Array(triP.length * 3);
      triP.forEach((p, i) => { pos.set(p, i * 3); cor.set(triC[i], i * 3); });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(cor, 3));
      const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 2; grupo.add(mesh);
    }
    const mc = this._malhaLinhas(contorno, { largura: 2, semRealce: true, ordem: 3 }); if (mc) grupo.add(mc);
    const mh = this._malhaLinhas(hachura, { largura: 1, opacidade: 0.5, semRealce: true, ordem: 3 }); if (mh) grupo.add(mh);
    /* elevação: linha do terreno e os eixos A/B do pórtico com bolha embaixo (como na prancha) */
    const caixaDiag = new THREE.Box3();
    for (const p of triP) caixaDiag.expandByPoint(new THREE.Vector3(p[0], p[1], p[2]));
    const vaoP = num(D.layout.vao, D.dimMax), y0 = Math.min(0, D.mn[1]), zP = P.z, cE = linear(T.eixo), ext = 0.07 * vaoP;
    const xsCol = [];
    for (const B of P.barras) if (B.membro && B.membro.papel === 'pilar') xsCol.push(B.p0[0]);
    const xs = Array.from(new Set(xsCol.map(x => Math.round(x * 1000) / 1000))).sort((a, b) => a - b);
    const eixosE = [{ a: [Math.min(D.mn[0], 0) - ext, y0, zP], b: [Math.max(D.mx[0], vaoP) + ext, y0, zP], ca: cE, cb: cE }];
    xs.forEach((x, i) => { eixosE.push({ a: [x, y0, zP], b: [x, y0 - 0.055 * vaoP, zP], ca: cE, cb: cE }); rot.push({ pos: [x, y0 - 0.055 * vaoP - 0.03 * vaoP, zP], texto: String.fromCharCode(65 + Math.min(i, 25)), classe: 'eixo', ancora: 'centro', prioridade: 6, fixo: true }); });
    const me = this._malhaLinhas(eixosE, { largura: 1.2, opacidade: 0.75, semRealce: true, semEscala: true, ordem: 1 }); if (me) grupo.add(me);
    /* máximos rotulados: por membro (ou barra solta), o maior |valor| e, no momento, o maior do outro sinal */
    const unid = qual === 'N' || qual === 'V' ? 'kN' : 'kN·m';
    const porGrupo = new Map();
    for (const dd of dados) { const g = dd.B.membro ? dd.B.membro.id : dd.B.id; if (!porGrupo.has(g)) porGrupo.set(g, []); porGrupo.get(g).push(dd); }
    const extremos = [];
    if (!desprezivel) for (const [g, lista] of porGrupo) {
      let mxP = null, mxN = null;
      for (const dd of lista) for (const q of dd.pts) {
        if (q.v >= 0 && (!mxP || q.v > mxP.q.v)) mxP = { dd, q };
        if (q.v < 0 && (!mxN || q.v < mxN.q.v)) mxN = { dd, q };
      }
      const cand = [mxP, mxN].filter(Boolean).sort((a, b) => Math.abs(b.q.v) - Math.abs(a.q.v));
      const usar = cand.length > 1 && Math.abs(cand[1].q.v) > 0.22 * Math.abs(cand[0].q.v) ? cand : cand.slice(0, 1);
      for (const c of usar) {
        if (Math.abs(c.q.v) < 0.02 * vmax) continue;
        const B = c.dd.B, b0 = soma(B.p0, esc(B.ex, c.q.x)), tip = soma(b0, esc(c.dd.n, c.q.v * escalaD));
        const txt = (qual === 'N' || qual === 'T' ? fmtAuto(c.q.v) : fmtAuto(Math.abs(c.q.v))) + ' ' + unid;
        extremos.push({ g, B, q: c.q, v: c.q.v });
        rot.push({ pos: tip, pos2: b0, ancora: 'longe', texto: txt, prioridade: 100 + Math.abs(c.q.v) / (vmax || 1) * 100, chave: B.chave });
      }
    }
    const nomes = { N: 'Força normal (N)', V: 'Cortante no plano do pórtico (V)', M: 'Momento fletor no plano do pórtico (M)', T: 'Momento de torção (T)' };
    const legenda = { tipo: 'esforco', titulo: nomes[qual], qual, desprezivel, vmax, unid };
    return this._guardar(chave, { modo: 'esforcos', grupo, alvos, rotulos: rot, legenda, P, qual, vmax, desprezivel, extremos, dados, unid, escalaD, caixaDiag });
  }

  /* ============================================================== MODO 5: VENTO
   * As zonas da NBR 6123 pintadas nas paredes e na cobertura (um pouco por fora das barras): azul = pressão
   * (empurra a face para dentro), vermelho = sucção (puxa para fora); valor da pressão líquida em cada zona e
   * a seta da direção do vento no chão. */
  _cenaVento() {
    const D = this.D, T = TEMAS[this.temaNome], L = D.layout, vc = D.ventoLista[this.est.ven.caso];
    if (!vc) return { modo: 'vento', grupo: new THREE.Group(), alvos: [], rotulos: [], legenda: null, vazio: 'O resultado não traz o cálculo do vento (rode o cálculo com o local da obra).' };
    const chave = 'ven|' + vc.id + '|' + this.temaNome;
    if (this.cache.has(chave)) return this.cache.get(chave);
    const grupo = new THREE.Group(), pecas = [], linhas = [], cN = linear(T.secundaria);
    for (const B of D.barras) {
      if (B.tracao) { linhas.push({ a: B.p0, b: B.p1, ca: cN, cb: cN }); continue; }
      pecas.push({ B, perfil: perfilDe(B.secao, B.tipo), am: [{ s: 0, d: null, c: cN }, { s: 1, d: null, c: cN }], chave: B.chave });
    }
    const ms = this._malhaSolidos(pecas, false); if (ms) grupo.add(ms);
    const ml = this._malhaLinhas(linhas, { largura: 1.6, semRealce: true }); if (ml) grupo.add(ml);
    const vao = num(L.vao, D.mx[0] - D.mn[0]), Lt = num(L.Lt, D.mx[2] - D.mn[2]), H = num(L.H, D.mx[1]), inc = num(L.i, 0), duas = L.aguas !== 1;
    const yT = x => (duas ? H + inc * Math.min(x, vao - x) : H + inc * x);
    const o = 0.38, P = vc.pressao, zonas = [];
    let pmax = 1e-9;
    const ponto = (face, s, y) => face === 'esquerda' ? [-o, y, s] : face === 'direita' ? [vao + o, y, s] : face === 'frente' ? [s, y, -o] : [s, y, Lt + o];
    for (const face of ['frente', 'fundo', 'esquerda', 'direita']) for (const z of arr(P.paredes && P.paredes[face])) {
      if (!ehObj(z)) continue;
      const s0 = num(z.s0, 0), s1 = num(z.s1, 0), p = num(z.p, 0); pmax = Math.max(pmax, Math.abs(p));
      let poli;
      if (face === 'esquerda' || face === 'direita') { const hh = yT(face === 'esquerda' ? 0 : vao); poli = [ponto(face, s0, 0), ponto(face, s1, 0), ponto(face, s1, hh), ponto(face, s0, hh)]; }
      else {
        const xs = [s0]; if (duas && s0 < vao / 2 - 1e-6 && s1 > vao / 2 + 1e-6) xs.push(vao / 2); xs.push(s1);
        poli = [ponto(face, s0, 0), ponto(face, s1, 0)].concat(xs.slice().reverse().map(x => ponto(face, x, yT(x))));
      }
      zonas.push({ poli, p, nome: z.zona, face, cpe: num(z.cpe, null) });
    }
    for (const z of arr(P.cobertura)) {
      if (!ehObj(z)) continue;
      const p = num(z.p, 0); pmax = Math.max(pmax, Math.abs(p));
      const x0 = num(z.x0, 0), x1 = num(z.x1, vao), z0 = num(z.z0, 0), z1 = num(z.z1, Lt);
      const xs = [x0]; if (duas && x0 < vao / 2 - 1e-6 && x1 > vao / 2 + 1e-6) xs.push(vao / 2); xs.push(x1);
      for (let i = 0; i < xs.length - 1; i++) {
        const a = xs[i], b = xs[i + 1];
        zonas.push({ poli: [[a, yT(a) + o, z0], [b, yT(b) + o, z0], [b, yT(b) + o, z1], [a, yT(a) + o, z1]], p, nome: z.zona, face: 'cobertura', cpe: num(z.cpe, null) });
      }
    }
    /* cor divergente: azul (pressão) ↔ cinza ↔ vermelho (sucção), intensidade por |p| */
    const neutro = hexRgb(T.secundaria), azul = hexRgb(T.tracao), verm = hexRgb(T.compressao);
    const corP = p => { const t = Math.min(1, Math.abs(p) / pmax), alvo = p >= 0 ? azul : verm, k = 0.22 + 0.78 * t; return [0, 1, 2].map(q => s2l(neutro[q] + (alvo[q] - neutro[q]) * k)); };
    const pos = [], cor = [], bordas = [];
    for (const z of zonas) {
      const c = corP(z.p), n = z.poli.length;
      for (let i = 1; i < n - 1; i++) { pos.push(...z.poli[0], ...z.poli[i], ...z.poli[i + 1]); cor.push(...c, ...c, ...c); }
      const cb = corP(z.p).map(v => v * 0.75);
      for (let i = 0; i < n; i++) bordas.push({ a: z.poli[i], b: z.poli[(i + 1) % n], ca: cb, cb });
    }
    if (pos.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
      const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
      mesh.renderOrder = 2; grupo.add(mesh);
    }
    const mb = this._malhaLinhas(bordas, { largura: 1.3, opacidade: 0.9, semRealce: true, semEscala: true, ordem: 3 }); if (mb) grupo.add(mb);
    /* setas 3D do vento batendo na face de barlavento (três, à meia altura) */
    const th = vc.direcao * Math.PI / 180, dir = [Math.sin(th), 0, Math.cos(th)], lado = [dir[2], 0, -dir[0]];
    const c0 = [vao / 2, 0, Lt / 2], hx = Math.abs(dir[0]) * vao / 2 + Math.abs(dir[2]) * Lt / 2, hw = Math.abs(lado[0]) * vao / 2 + Math.abs(lado[2]) * Lt / 2;
    const comp0 = Math.max(2.5, 0.09 * D.dimMax), rH = Math.max(0.06, 0.0028 * D.dimMax), rC = rH * 3.2, lC = rC * 2.6, yS = 0.55 * H;
    const setaGeo = [], ext = [];
    for (const f of [-0.55, 0, 0.55]) {
      const fimS = soma(soma(c0, esc(dir, -(hx + o + 0.6))), esc(lado, f * hw)); fimS[1] = yS;
      const iniS = soma(fimS, esc(dir, -comp0)); ext.push(iniS, fimS);
      const cil = new THREE.CylinderGeometry(rH, rH, comp0 - lC, 10, 1), cone = new THREE.ConeGeometry(rC, lC, 16, 1);
      cil.translate(0, (comp0 - lC) / 2, 0); cone.translate(0, comp0 - lC / 2, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dir[0], dir[1], dir[2]));
      for (const g0 of [cil, cone]) { g0.applyQuaternion(q); g0.translate(iniS[0], iniS[1], iniS[2]); setaGeo.push(g0); }
    }
    const pS = [], nS = [];
    for (const g0 of setaGeo) { const gi = g0.toNonIndexed(); pS.push(...gi.attributes.position.array); nS.push(...gi.attributes.normal.array); g0.dispose(); gi.dispose(); }
    const gS = new THREE.BufferGeometry(); gS.setAttribute('position', new THREE.Float32BufferAttribute(pS, 3)); gS.setAttribute('normal', new THREE.Float32BufferAttribute(nS, 3));
    const mSet = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.05 }), cs = linear(T.realce);
    mSet.color.r = cs[0]; mSet.color.g = cs[1]; mSet.color.b = cs[2];
    const mS = new THREE.Mesh(gS, mSet); mS.castShadow = true; grupo.add(mS);
    const ini = ext[2];
    /* rótulos: valor por zona (com sinal) e o nome da zona */
    const rot = [];
    for (const z of zonas) {
      const n = z.poli.length, cx = esc(z.poli.reduce((a, q) => soma(a, q), [0, 0, 0]), 1 / n);
      rot.push({ pos: cx, ancora: 'centro', texto: (z.p > 0 ? '+' : '') + fmt(z.p, 2), sub: z.nome, prioridade: 100 + Math.abs(z.p) / pmax * 50, classe: 'valor' });
    }
    rot.push({ pos: ini, texto: 'vento ' + fmt(vc.direcao, 0) + '°', classe: 'forte', prioridade: 900, fixo: true });
    const pmin = Math.min(0, ...zonas.map(z => z.p)), pmx = Math.max(0, ...zonas.map(z => z.p));
    const legenda = { tipo: 'vento', titulo: 'Pressão líquida do vento (kN/m²)', pmin, pmax: pmx };
    return this._guardar(chave, { modo: 'vento', grupo, alvos: [], rotulos: rot, legenda, vc, caixaExtra: ext });
  }

  /* ============================================================== TROCA DE MODO */
  _construirCena() {
    const m = this.est.modo;
    if (m === 'vento') return this._cenaVento();
    if (m === 'deformada') return this._cenaDeformada();
    if (m === 'flambagem') return this._cenaFlambagem();
    if (m === 'esforcos') return this._cenaEsforcos();
    return this._cenaAproveitamento();
  }
  _trocarModo(modo, forcar) {
    const novo = normalizarModo(modo) || 'aproveitamento', anterior = this.est.modo;
    if (!forcar && novo === anterior && this.cena) return;
    if (this.cena && this.cena.grupo.parent) this.scene.remove(this.cena.grupo);
    if (this.cena && !this.cena._emCache) this._descartar(this.cena);
    if (anterior !== 'esforcos' && novo === 'esforcos' && this.camera) this._cam3d = { p: this.camera.position.clone(), t: this.controls.target.clone() };
    this.est.modo = novo;
    let cena;
    try { cena = this._construirCena(); }
    catch (e) { console.error('[MetalCalcVista]', e); cena = { modo: novo, grupo: new THREE.Group(), alvos: [], rotulos: [], legenda: null, vazio: 'Não foi possível montar esta vista: ' + (e && e.message || e) }; }
    this.cena = cena;
    this.scene.add(cena.grupo);
    this._ajustarEscalaModo();
    /* na elevação do pórtico a grade e os eixos do galpão inteiro só poluem (o pórtico traz os dele) */
    const el = novo === 'esforcos';
    if (this.grade) this.grade.visible = !el;
    if (this.eixosL) this.eixosL.visible = !el;
    if (this.contato) this.contato.visible = !el;
    if (this.chao) this.chao.visible = !el;
    this._definirRotulos();
    this._montarUI();
    if (this.selChave >= 0) this._mostrarCartao(this.selChave); else this._esconderCartao();
    this._realce();
    if (this._jaMontou) {
      if (el && anterior !== 'esforcos') this._cameraPortico(true);
      else if (!el && anterior === 'esforcos') {
        if (this._cam3d) this._voar(this._cam3d.p, this._cam3d.t, false, FOV_3D); else this.vista('3d');
        this._cam3d = null;
      }
    }
    this._jaMontou = true;
    this.sujo = true;
  }
  _ajustarEscalaModo() {
    const c = this.cena, m = this.est.modo;
    if (m === 'deformada') { if (this.est.def.fator == null) this.est.def.fator = c.escalaAuto || 1; this.U.escala.value = this.est.def.fator; }
    else if (m === 'flambagem') { if (this.est.fla.amp == null) this.est.fla.amp = c.escalaAuto || 1; this.U.escala.value = this.est.fla.amp; }
    else this.U.escala.value = 0;
    const f = c.grupo.getObjectByName('fantasma'); if (f) f.visible = this.est.def.indeformada;
  }
  _definirRotulos() {
    const lista = [];
    if (this.est.modo !== 'esforcos') for (const b of this.bolhas || []) lista.push({ pos: b.pos, texto: b.texto, classe: 'eixo', ancora: 'centro', prioridade: 5, grupo: b.grupo });
    for (const r of this.cena.rotulos || []) lista.push(r);
    /* membro selecionado no Aproveitamento: marca a seção onde a verificação governa */
    const A = this._alvo(this.selChave);
    if (A && A.tipo === 'membro' && this.est.modo === 'aproveitamento' && A.ref.verif && A.ref.verif.pior && this.est.apr.criterio !== 'els') {
      const M = A.ref, x = num(M.verif.pior.x, null), P = x != null ? pontoNoMembro(M, x) : null;
      if (P) lista.push({ pos: P, texto: 'seção crítica', sub: posicaoTexto(M, x, this.D) + ' · ' + (M.verif.pior.comb || ''), classe: 'forte', prioridade: 5000, fixo: true });
    }
    if (!this.rotulos) this.rotulos = new Rotulos(this.camRot);
    this.rotulos.definir(lista);
    if (this.cena.vazio) this._mensagem('Nada para mostrar aqui', [this.cena.vazio]); else this.msg.hidden = true;
  }

  /* ============================================================== UI */
  _montarUI() {
    const ui = this.ui; ui.textContent = '';
    const D = this.D;
    if (this.op.barra !== false) {
      const topo = h('div', { class: 'mcv-topo' });
      const modos = h('div', { class: 'mcv-modos mcv-cx', role: 'toolbar', 'aria-label': 'O que mostrar' });
      for (const M of MODOS) {
        modos.appendChild(h('button', { class: 'mcv-modo', type: 'button', 'aria-pressed': String(this.est.modo === M.id), title: M.nome + ' (' + M.tecla + ')', onclick: () => this.modo(M.id) },
          h('span', { class: 'mcv-i', html: ICONE[M.id], 'aria-hidden': 'true', style: 'display:inline-flex' }), h('span', { text: M.nome })));
      }
      topo.appendChild(modos);
      topo.appendChild(h('div', { class: 'mcv-esp' }));
      /* situação geral do cálculo */
      const nf = D.falhas || 0, aprov = D.aprovado === true, inc = aprov && D.incompleto;
      if (D.aprovado != null) {
        topo.appendChild(h('div', { class: 'mcv-sit mcv-cx', title: inc ? 'As barras passam, mas há verificação NÃO feita (' + D.nNaoVerif + ') — veja o resultado' : (aprov ? 'Todas as barras e limites de serviço passam' : nf + ' barra(s)/limite(s) não passam') },
          iconeStatus(inc ? STATUS[2] : (aprov ? STATUS[0] : STATUS[3])), inc ? 'Incompleto' : (aprov ? 'Aprovado' : 'Não aprovado'), h('small', { text: inc ? 'não verificado: ' + D.nNaoVerif : (aprov ? '' : (nf + (nf === 1 ? ' limite excedido' : ' limites excedidos'))) })));
      }
      const acoes = h('div', { class: 'mcv-acoes mcv-cx' });
      acoes.appendChild(h('button', { class: 'mcv-bt', type: 'button', title: 'Enquadrar tudo (F)', 'aria-label': 'Enquadrar tudo', html: ICONE.enquadrar, onclick: () => this.enquadrar() }));
      acoes.appendChild(h('span', { class: 'mcv-sep' }));
      const vistas = h('div', { class: 'mcv-vistas', style: 'display:inline-flex;gap:1px' });
      [['3d', '3D'], ['frente', 'Frente'], ['lateral', 'Lado'], ['planta', 'Topo']].forEach(([id, n]) => vistas.appendChild(h('button', { class: 'mcv-bt', type: 'button', text: n, title: 'Vista: ' + n, onclick: () => this.vista(id) })));
      acoes.appendChild(vistas);
      acoes.appendChild(h('span', { class: 'mcv-sep' }));
      acoes.appendChild(h('button', { class: 'mcv-bt', type: 'button', title: 'Salvar imagem (PNG)', 'aria-label': 'Salvar imagem', html: ICONE.foto, onclick: () => this._baixarFoto() }));
      topo.appendChild(acoes);
      ui.appendChild(topo);
      const ctx = this._ctxModo(); if (ctx) ui.appendChild(ctx);
    }
    const col = h('div', { class: 'mcv-col' });
    this.cartao = h('div', { class: 'mcv-cartao mcv-cx', hidden: true, role: 'region', 'aria-label': 'Detalhe da barra', 'aria-live': 'polite' });
    col.appendChild(this.cartao);
    const info = this._infoModo(); if (info) col.appendChild(info);
    ui.appendChild(col);
    const leg = this._legenda(); if (leg) ui.appendChild(leg);
    this.giz = h('div', { class: 'mcv-giz' }); ui.appendChild(this.giz);
  }
  _selComb(lista, atual, aoMudar, rotulo) {
    const sel = h('select', { 'aria-label': rotulo || 'Combinação', onchange: e => aoMudar(e.target.value) });
    const grupos = [['ELU', 'Últimas (ELU)'], ['ELS-rara', 'Serviço — raras'], ['ELS-freq', 'Serviço — frequentes'], ['ELS-qp', 'Serviço — quase permanentes'], ['caso', 'Casos (característicos)'], ['outra', 'Outras']];
    const usados = new Set();
    for (const [tp, nome] of grupos) {
      const itens = lista.filter(c => (c.tipo || 'outra') === tp || (tp === 'outra' && !grupos.some(g => g[0] === c.tipo)));
      if (!itens.length) continue;
      const og = h('optgroup', { label: nome });
      for (const c of itens) {
        if (usados.has(c.id)) continue; usados.add(c.id);
        const txt = c.tipo === 'caso' ? c.id.replace(/^caso_/, '') + ' — ' + c.nome : c.id + (c.descricao ? ' — ' + c.descricao : '');
        const o = h('option', { value: c.id, text: txt }); if (c.id === atual) o.selected = true;
        const vt = this._ventosDe(c); o.title = [c.nome, vt].filter(Boolean).join(' · ');
        og.appendChild(o);
      }
      sel.appendChild(og);
    }
    return sel;
  }
  _ventosDe(c) {
    const D = this.D; if (!c || !D.ventoNomes.size) return '';
    const ids = new Set();
    if (c.tipo === 'caso') { const id = c.id.replace(/^caso_/, ''); if (D.ventoNomes.has(id)) ids.add(id); }
    for (const tk of String(c.descricao || '').match(/W[0-9A-Za-z]+/g) || []) if (D.ventoNomes.has(tk)) ids.add(tk);
    return Array.from(ids).map(id => (c.tipo === 'caso' ? '' : id + ': ') + D.ventoNomes.get(id)).join(' · ');
  }
  _seg(opcoes, atual, aoMudar, rot) {
    const s = h('div', { class: 'mcv-seg', role: 'group', 'aria-label': rot || '' });
    for (const [id, nome, tit] of opcoes) s.appendChild(h('button', { type: 'button', 'aria-pressed': String(id === atual), text: nome, title: tit || nome, onclick: () => aoMudar(id) }));
    return s;
  }
  _ctxModo() {
    const D = this.D, m = this.est.modo, box = h('div', { class: 'mcv-ctx mcv-cx' });
    if (m === 'aproveitamento') {
      box.appendChild(h('span', { class: 'mcv-rotc' }, 'Critério', this._seg([['governante', 'Governante', 'O maior entre ELU e ELS'], ['elu', 'ELU', 'Só os estados-limite últimos'], ['els', 'ELS', 'Só o serviço (deslocamentos)']], this.est.apr.criterio, v => { this.est.apr.criterio = v; this._trocarModo(m, true); }, 'Critério')));
      const chk = h('input', { type: 'checkbox', onchange: e => { this.est.apr.secundarias = e.target.checked; this._trocarModo(m, true); } }); chk.checked = this.est.apr.secundarias;
      box.appendChild(h('label', { title: 'Terças e travessas entram no modelo como escoras; são dimensionadas à parte' }, chk, 'Terças e travessas'));
    } else if (m === 'deformada') {
      box.appendChild(h('span', { class: 'mcv-rotc' }, 'Combinação', this._selComb(D.combs, this.est.def.comb, v => { this.est.def.comb = v; this.est.def.fator = null; this._trocarModo(m, true); })));
      box.appendChild(this._faixaEscala('Escala', () => this.est.def.fator, f => { this.est.def.fator = f; this.U.escala.value = f; this.sujo = true; }, () => this.cena.escalaAuto || 1, '×'));
      const chk = h('input', { type: 'checkbox', onchange: e => { this.est.def.indeformada = e.target.checked; this._ajustarEscalaModo(); this.sujo = true; } }); chk.checked = this.est.def.indeformada;
      box.appendChild(h('label', {}, chk, 'Indeformada'));
    } else if (m === 'flambagem') {
      if (D.flamb.length > 1) {
        const sel = h('select', { 'aria-label': 'Combinação da análise de flambagem', onchange: e => { this.est.fla.ent = Number(e.target.value); this.est.fla.modo = 0; this.est.fla.amp = null; this._trocarModo(m, true); } });
        D.flamb.forEach((f, i) => { const c = D.combPorId.get(f.combinacao); const o = h('option', { value: String(i), text: f.combinacao + (c && c.descricao ? ' — ' + c.descricao : '') + ' · λ ' + fmt(f.lambda, 2) }); if (i === this.est.fla.ent) o.selected = true; sel.appendChild(o); });
        box.appendChild(h('span', { class: 'mcv-rotc' }, 'Combinação', sel));
      }
      const ent = D.flamb[this.est.fla.ent];
      if (ent && ent.modos.length > 1) box.appendChild(h('span', { class: 'mcv-rotc' }, 'Modo', this._seg(ent.modos.map((md, i) => [i, String(i + 1), 'Modo ' + (i + 1) + ' · λ = ' + fmt(md.lambda, 2)]), this.est.fla.modo, v => { this.est.fla.modo = v; this.est.fla.amp = null; this._trocarModo(m, true); }, 'Modo')));
      const play = h('button', { class: 'mcv-bt', type: 'button', title: this.est.fla.animar ? 'Pausar' : 'Animar', 'aria-label': this.est.fla.animar ? 'Pausar' : 'Animar', html: this.est.fla.animar ? ICONE.pausa : ICONE.play, onclick: () => { this.animar(!this.est.fla.animar); } });
      play.style.border = '1px solid var(--mcv-b)';
      box.appendChild(play);
      box.appendChild(this._faixaEscala('Amplitude', () => this.est.fla.amp, f => { this.est.fla.amp = f; if (!this.est.fla.animar) this.U.escala.value = f; this.sujo = true; }, () => this.cena.escalaAuto || 1, ''));
    } else if (m === 'vento') {
      if (D.ventoLista.length) {
        const sel = h('select', { 'aria-label': 'Caso de vento', onchange: e => { this.est.ven.caso = Number(e.target.value); this._trocarModo(m, true); this.enquadrar(); } });
        D.ventoLista.forEach((v, i) => { const o2 = h('option', { value: String(i), text: v.idW + ' — ' + v.nome }); if (i === this.est.ven.caso) o2.selected = true; sel.appendChild(o2); });
        box.appendChild(h('span', { class: 'mcv-rotc' }, 'Caso de vento', sel));
      } else box.appendChild(h('span', { class: 'mcv-rotc', text: 'Sem cálculo de vento neste resultado' }));
    } else if (m === 'esforcos') {
      const ks = D.porticos.map(p => p.k), i = ks.indexOf(this.est.esf.k);
      const ir = d => { const j = (i + d + ks.length) % ks.length; this.portico(ks[j]); };
      const pk = h('span', { class: 'mcv-rotc' }, h('button', { class: 'mcv-bt', type: 'button', html: ICONE.esq, title: 'Pórtico anterior', 'aria-label': 'Pórtico anterior', onclick: () => ir(-1), style: 'height:26px;min-width:26px;padding:0' }),
        h('span', { class: 'mcv-num', text: 'Pórtico ' + (this.est.esf.k + 1), style: 'min-width:64px;text-align:center' }),
        h('button', { class: 'mcv-bt', type: 'button', html: ICONE.dir, title: 'Próximo pórtico', 'aria-label': 'Próximo pórtico', onclick: () => ir(1), style: 'height:26px;min-width:26px;padding:0' }));
      box.appendChild(pk);
      box.appendChild(this._seg([['N', 'N', 'Força normal'], ['V', 'V', 'Cortante'], ['M', 'M', 'Momento fletor'], ['T', 'T', 'Torção']], this.est.esf.esforco, v => this.esforco(v), 'Esforço'));
      box.appendChild(h('span', { class: 'mcv-rotc' }, 'Combinação', this._selComb(D.combs, this.est.esf.comb, v => { this.est.esf.comb = v; this._trocarModo(m, true); })));
    }
    return box;
  }
  /* controle deslizante logarítmico: o meio é o automático; vai de 1/10 a 10× */
  _faixaEscala(nome, ler, gravar, auto, prefixo) {
    const rotN = h('span', { class: 'mcv-num' });
    const mostrar = f => { rotN.textContent = (prefixo || '') + fmtFator(f) + (prefixo ? '' : ' m'); };
    const faixa = h('input', { type: 'range', min: '0', max: '100', step: '1', 'aria-label': nome });
    const deF = f => Math.round(50 + 50 * Math.log10(Math.max(1e-9, f / auto())));
    const paraF = p => auto() * Math.pow(10, (p - 50) / 50);
    faixa.value = String(lim(deF(ler() || auto()), 0, 100));
    mostrar(ler() || auto());
    faixa.addEventListener('input', () => { const p = Number(faixa.value), f = p <= 0 ? 0 : paraF(p); gravar(f); mostrar(f); this._atualizarTextoEscala(); });
    faixa.addEventListener('dblclick', () => { faixa.value = '50'; gravar(auto()); mostrar(auto()); });
    return h('span', { class: 'mcv-rotc', title: 'Duplo clique volta ao automático' }, nome, faixa, rotN);
  }
  _atualizarTextoEscala() { if (this._txtEscala) this._txtEscala.textContent = this._fraseEscala(); }
  _fraseEscala() {
    if (this.est.modo === 'deformada') return 'Deslocamentos ampliados ' + fmtFator(this.est.def.fator) + ' vezes.';
    return '';
  }
  _legenda() {
    const L = this.cena && this.cena.legenda; if (!L) return null;
    const T = TEMAS[this.temaNome], box = h('div', { class: 'mcv-leg mcv-cx' }, h('div', { class: 'mcv-h', text: L.titulo }));
    if (L.tipo === 'status') {
      STATUS.forEach((s, i) => box.appendChild(h('div', { class: 'mcv-leg-l' }, h('i', { style: 'background:' + s.cor }), s.faixa + ' · ' + s.nome, h('span', { text: String(L.contagens[i] || 0) }))));
      if (L.secundarias && L.secComVerif) box.appendChild(h('div', { class: 'mcv-nota', style: 'margin-top:6px;white-space:normal' }, 'Terças e travessas: cor da verificação do grupo (NBR 14762).'));
      else if (L.secundarias) box.appendChild(h('div', { class: 'mcv-leg-l' }, h('i', { style: 'background:' + T.secundaria }), 'Terças/travessas (à parte)', h('span', { text: String(L.secundarias) })));
    } else if (L.tipo === 'rampa') {
      box.appendChild(h('div', { class: 'mcv-rampa', style: 'background:' + rampaCss(L.rampa) }));
      const mx = L.max * L.fator, f = v => (L.relativa ? fmt(v, 1) : fmt(v, mx >= 100 ? 0 : 1));
      box.appendChild(h('div', { class: 'mcv-esc' }, h('span', { text: f(0) }), h('span', { text: f(mx / 2) }), h('span', { text: f(mx) + (L.unidade ? ' ' + L.unidade : '') })));
    } else if (L.tipo === 'vento') {
      box.appendChild(h('div', { class: 'mcv-rampa', style: 'background:linear-gradient(90deg,' + T.compressao + ',' + T.secundaria + ' 50%,' + T.tracao + ')' }));
      box.appendChild(h('div', { class: 'mcv-esc' }, h('span', { text: 'sucção ' + fmt(L.pmin, 2) }), h('span', { text: '0' }), h('span', { text: 'pressão +' + fmt(L.pmax, 2) })));
    } else if (L.tipo === 'esforco') {
      if (L.desprezivel) box.appendChild(h('div', { class: 'mcv-txt', text: 'Desprezível neste pórtico (máx. ' + fmtAuto(L.vmax) + ' ' + L.unid + ').' }));
      else if (L.qual === 'N') {
        box.appendChild(h('div', { class: 'mcv-leg-l' }, h('i', { style: 'background:' + T.tracao }), 'tração (+)'));
        box.appendChild(h('div', { class: 'mcv-leg-l' }, h('i', { style: 'background:' + T.compressao }), 'compressão (' + MENOS + ')'));
      } else {
        box.appendChild(h('div', { class: 'mcv-leg-l' }, h('i', { style: 'background:' + T.diagrama }), L.qual === 'M' ? 'desenhado do lado tracionado' : L.qual === 'V' ? 'no plano do pórtico' : 'sinal pelos eixos locais'));
      }
      if (!L.desprezivel) box.appendChild(h('div', { class: 'mcv-esc', style: 'margin-top:5px' }, h('span', { text: 'máx. |' + L.qual + '| = ' + fmtAuto(L.vmax) + ' ' + L.unid })));
    }
    return box;
  }
  _infoModo() {
    const D = this.D, m = this.est.modo, c = this.cena, box = h('div', { class: 'mcv-info mcv-cx' });
    if (c.vazio) return null;
    /* resultado incompleto (amostra enxugada, nós faltando): avisa em vez de mostrar "pouca estrutura" calado */
    for (const a of D.avisos) box.appendChild(h('p', { class: 'mcv-nota', style: 'margin:0 0 8px;color:var(--mcv-t1)' }, iconeStatus(STATUS[1]), ' ' + a));
    if (m === 'aproveitamento') {
      const r = this.r, crit = this.est.apr.criterio;
      box.appendChild(h('div', { class: 'mcv-h', text: 'Grupos de barras' }));
      const g = h('div', { class: 'mcv-linhas' });
      const nomesG = { pilar: 'Pilares', viga: 'Vigas', tapamento: 'Tapamentos', contravento: 'Contraventos' };
      for (const k of ['pilar', 'viga', 'tapamento', 'contravento']) {
        let pior = null, rz = null;
        if (k === 'contravento') { for (const B of D.barras) if (B.tipo === 'contravento' && !B.frouxa && B.razao != null && (!pior || B.razao > rz)) { pior = B; rz = B.razao; } if (crit === 'els') pior = null; }
        else for (const M of D.membros) if ((M.grupo || M.papel) === k) { const v = razaoMembro(M, crit); if (v != null && (rz == null || v > rz)) { rz = v; pior = M; } }
        if (!pior) continue;
        const s = statusDe(rz), perf = k === 'contravento' ? (D.cv.perfil || '') : (pior.secao && pior.secao.nome) || '';
        const nm = h('span', { class: 'n lk', text: nomesG[k] + ' · ' + perf, title: 'Mostrar ' + (pior.id || ''), onclick: () => this.selecionar(pior.id, { enquadrar: true }) });
        g.appendChild(nm);
        g.appendChild(h('span', { class: 'br' }, h('i', { style: 'width:' + Math.min(100, rz / 1.2 * 100).toFixed(1) + '%;background:' + s.cor })));
        g.appendChild(h('span', { class: 'v', text: fmt(rz, 2) }));
      }
      /* terças e travessas (NBR 14762): uma verificação por grupo */
      for (const gs of ['terca', 'travLat', 'travOit']) {
        const G2 = D.SEC[gs], rz = razaoSec(G2, crit); if (rz == null) continue;
        const s = statusDe(rz), rep = D.barras.find(B => B.grupoSec === gs);
        g.appendChild(h('span', { class: 'n' + (rep ? ' lk' : ''), text: NOME_SEC[gs] + ' · ' + G2.perfil, title: (G2.governante || '') + (rep ? ' — mostrar' : ''), onclick: rep ? () => this.selecionar(rep.id, { enquadrar: false }) : null }));
        g.appendChild(h('span', { class: 'br' }, h('i', { style: 'width:' + Math.min(100, rz / 1.2 * 100).toFixed(1) + '%;background:' + s.cor })));
        g.appendChild(h('span', { class: 'v', text: fmt(rz, 2) }));
      }
      box.appendChild(g);
      /* ligações (AcoLigCalc): a pior no resumo; a lista inteira abre no "detalhes" */
      const ligs = D.lig ? arr(D.lig.lista).filter(ehObj) : [];
      if (ligs.length && crit !== 'els') {
        const pior = ligs.slice().sort((a, b) => num(b.razao, 0) - num(a.razao, 0))[0], sp = statusDe(num(pior.razao, 0));
        const det = h('details', { class: 'mcv-det' });
        det.appendChild(h('summary', { title: 'A mais solicitada: ' + (pior.nome || pior.id) }, h('span', { text: 'Ligações · ' + ligs.length }), h('span', { class: 'mcv-det-r' }, 'pior ', h('b', { text: fmt(num(pior.razao, 0), 2) }), ' ', iconeStatus(sp))));
        const gl = h('div', { class: 'mcv-linhas' });
        for (const L2 of ligs) {
          const rz = num(L2.razao, 0), s2 = statusDe(rz);
          gl.appendChild(h('span', { class: 'n', text: L2.nome || L2.id, title: (L2.resumo || '') + (L2.governante ? ' — governa: ' + L2.governante : '') + (L2.sugestao ? ' — ' + L2.sugestao : '') }));
          gl.appendChild(h('span', { class: 'br' }, h('i', { style: 'width:' + Math.min(100, rz / 1.2 * 100).toFixed(1) + '%;background:' + s2.cor })));
          gl.appendChild(h('span', { class: 'v', text: fmt(rz, 2) }));
        }
        det.appendChild(gl);
        box.appendChild(det);
      }
      const extra = [];
      if (num(r.pesoTotal, 0) > 0 && num(r.pesoSecundarias, 0) > 0) extra.push('Aço: ' + fmt(r.pesoTotal / 1000, 2) + ' t — principal ' + fmt(num(r.peso, 0) / 1000, 2) + ' t' + (num(r.taxa, 0) > 0 ? ' (' + fmt(r.taxa, 1) + ' kg/m²)' : '') + ' + terças e travessas ' + fmt(r.pesoSecundarias / 1000, 2) + ' t');
      else if (num(r.peso, 0) > 0) extra.push('Aço: ' + fmt(r.peso / 1000, 2) + ' t' + (num(r.taxa, 0) > 0 ? ' (' + fmt(r.taxa, 1) + ' kg/m²)' : ''));
      if (ehObj(r.deslocabilidade) && r.deslocabilidade.classe) extra.push('Deslocabilidade ' + r.deslocabilidade.classe + ' (Δ2/Δ1 = ' + fmt(num(r.deslocabilidade.razao, 0), 2) + ')');
      if (extra.length) box.appendChild(h('div', { class: 'mcv-nota', style: 'margin-top:9px' }, ...extra.map((t, i) => h('div', { text: t, style: i ? 'margin-top:2px' : '' }))));
      box.appendChild(h('p', { class: 'mcv-nota', text: 'Clique numa barra para ver a verificação completa.', style: 'color:var(--mcv-t3)' }));
    } else if (m === 'deformada') {
      const C = D.combPorId.get(c.comb) || {}, Lt = c.leituras;
      box.appendChild(h('div', { class: 'mcv-h', text: 'Deformada · ' + c.comb }));
      box.appendChild(h('div', { class: 'mcv-txt', text: (C.tipo === 'caso' ? C.nome : (C.descricao || '')) + (C.tipo ? ' · ' + rotuloTipo(C.tipo) : '') }));
      const vtD = C.tipo === 'caso' ? '' : this._ventosDe(C); if (vtD) box.appendChild(h('div', { class: 'mcv-nota', style: 'margin-top:2px', text: vtD }));
      box.appendChild(h('div', { class: 'mcv-big' }, h('b', { text: fmtMm(Lt.umax) }), h('span', { class: 'mcv-txt', text: 'deslocamento máximo' })));
      const pm = Lt.pilares.slice().sort((a, b) => b.dh - a.dh)[0], cm = Lt.cumeeiras.slice().sort((a, b) => Math.abs(b.dv) - Math.abs(a.dv))[0];
      const bloco = (nome, val, det, rz, alvo) => {
        const s = rz != null && c.rara ? (rz <= 1 ? STATUS[0] : STATUS[3]) : null;
        box.appendChild(h('div', { class: 'mcv-lei' + (alvo ? ' lk' : ''), title: alvo ? 'Mostrar ' + alvo : '', onclick: alvo ? () => this.selecionar(alvo, { enquadrar: false }) : null },
          s ? iconeStatus(s) : h('span', { class: 'mcv-ic', style: 'background:transparent' }), h('span', { class: 'n', text: nome }), h('span', { class: 'v', text: fmtMm(val) }), h('small', { text: det })));
      };
      if (pm) bloco('Topo dos pilares', pm.dh, pm.M.id + (c.rara ? ' · limite H/300 = ' + fmtMm(pm.lim) : ' · em relação à base'), pm.razao, pm.M.id);
      if (cm) bloco('Cumeeira', Math.abs(cm.dv), 'pórtico ' + (cm.k + 1) + (c.rara ? ' · limite L/250 = ' + fmtMm(cm.lim) : ' · em relação aos beirais'), cm.razao, null);
      if (!c.rara) box.appendChild(h('p', { class: 'mcv-nota', text: /ELU/.test(C.tipo || '') ? 'Combinação última (2ª ordem): os limites de serviço valem nas combinações raras.' : 'Os limites de serviço (NBR 8800, Anexo C) valem nas combinações raras.' }));
      else box.appendChild(h('p', { class: 'mcv-nota', text: 'Pilar: topo em relação à base. Cumeeira: em relação aos beirais (NBR 8800, Anexo C).' }));
      this._txtEscala = h('p', { class: 'mcv-nota', text: this._fraseEscala() }); box.appendChild(this._txtEscala);
    } else if (m === 'flambagem') {
      const ent = c.ent, lam = c.md.lambda, C = D.combPorId.get(ent.combinacao) || {};
      box.appendChild(h('div', { class: 'mcv-h', text: 'Flambagem global · modo ' + (c.mi + 1) + ' de ' + ent.modos.length }));
      const s = lam == null ? null : lam < 0 ? STATUS[1] : lam >= 10 ? STATUS[0] : lam >= 3 ? STATUS[1] : STATUS[3];
      box.appendChild(h('div', { class: 'mcv-big' }, h('b', { text: (c.mi === 0 ? 'λcr = ' : 'λ' + (c.mi + 1) + ' = ') + fmt(lam, 2) }), s ? chipStatus(s, lam < 0 ? 'cargas invertidas' : lam >= 10 ? '2ª ordem pequena' : lam >= 3 ? '2ª ordem relevante' : 'muito flexível') : null));
      const descr = C.descricao ? ' (' + C.descricao + ')' : '';
      if (lam != null && lam > 0) box.appendChild(h('p', { class: 'mcv-txt' }, 'A combinação ', h('strong', { text: ent.combinacao }), descr + ' teria de ser multiplicada por ', h('strong', { text: fmt(lam, 2) }), ' para a estrutura flambar neste modo.'));
      else if (lam != null) box.appendChild(h('p', { class: 'mcv-txt' }, 'λ negativo: nesta combinação as cargas aliviam a compressão (sucção do vento). A estrutura só flambaria com as cargas no sentido oposto, multiplicadas por ', h('strong', { text: fmt(Math.abs(lam), 2) }), '.'));
      box.appendChild(h('p', { class: 'mcv-txt', text: lam != null && lam > 0 ? (lam >= 10 ? 'λcr ≥ 10: os efeitos globais de 2ª ordem são pequenos.' : lam >= 3 ? 'Entre 3 e 10: a 2ª ordem pesa — a análise já a considera (P-Δ e P-δ).' : 'Abaixo de 3: estrutura muito flexível — aumentar a rigidez (perfis, bases engastadas ou contraventamento).') : '' }));
      box.appendChild(h('p', { class: 'mcv-nota' }, 'Deslocamento predominante: ' + c.direcao + '.', c.alvoMax ? ' Maior amplitude: ' + (c.alvoMax.tipo === 'membro' ? nomeMembro(c.alvoMax.ref) : nomeBarra(c.alvoMax.ref) + ' ' + c.alvoMax.ref.id) + '.' : ''));
      for (const f of D.flambSem) box.appendChild(h('p', { class: 'mcv-nota', text: 'Na ' + f.combinacao + ' não há λ positivo' + (f.ate != null ? ' até ' + fmt(f.ate, 1) : '') + ': a estrutura não flamba sob ela.' }));
      box.appendChild(h('p', { class: 'mcv-nota', text: 'A forma do modo é relativa (amplitude normalizada); o tamanho na tela é só para ver.' }));
    } else if (m === 'vento') {
      const v = c.vc, V = D.vento, dirTxt = v.direcao === 0 ? 'paralelo à cumeeira (bate no oitão da frente)' : v.direcao === 90 ? 'perpendicular à cumeeira (bate na parede esquerda)' : 'direção ' + fmt(v.direcao, 0) + '°';
      box.appendChild(h('div', { class: 'mcv-h', text: 'Vento · ' + v.idW }));
      box.appendChild(h('div', { class: 'mcv-txt', text: v.nome + ' — ' + dirTxt }));
      box.appendChild(h('div', { class: 'mcv-big' }, h('b', { text: 'q = ' + fmt(v.q != null ? v.q : num(V.q, 0), 2) }), h('span', { class: 'mcv-txt', text: 'kN/m² (pressão dinâmica)' })));
      const kv = h('dl', { class: 'mcv-kv' }), par = (k2, val) => { if (val) { kv.appendChild(h('dt', { text: k2 })); kv.appendChild(h('dd', { text: val })); } };
      const s2 = ehObj(V.s2) ? num(V.s2.valor, null) : num(V.s2, null), s1 = ehObj(V.s1) ? num(V.s1.valor, null) : num(V.s1, null), s3 = ehObj(V.s3) ? num(V.s3.valor, null) : num(V.s3, null);
      const loc = (V.v0Info && V.v0Info.descricao) || (this.r.parametros && this.r.parametros.vento && this.r.parametros.vento.endereco) || '';
      par('V0', fmt(num(V.v0, 0), 0) + ' m/s' + (loc ? ' · ' + loc : ''));
      par('Fatores', 'S1 = ' + fmt(s1, 2) + ' · S2 = ' + fmt(s2, 2) + ' · S3 = ' + fmt(s3, 2));
      if (V.vk != null) par('Vk', fmt(num(V.vk, 0), 1) + ' m/s');
      if (v.cpi != null) par('Cpi', fmt(v.cpi, 2) + (v.cpiMotivo ? ' — ' + v.cpiMotivo : ''));
      box.appendChild(kv);
      box.appendChild(h('p', { class: 'mcv-nota', text: 'Em cada zona: p = (Cpe − Cpi)·q. Positivo empurra a face para dentro (pressão); negativo puxa para fora (sucção). NBR 6123.' }));
    } else if (m === 'esforcos') {
      const C = D.combPorId.get(this.est.esf.comb) || {};
      box.appendChild(h('div', { class: 'mcv-h', text: 'Pórtico ' + (this.est.esf.k + 1) + ' · ' + this.est.esf.comb }));
      box.appendChild(h('div', { class: 'mcv-txt', text: (C.tipo === 'caso' ? C.nome : (C.descricao || '')) + (C.tipo ? ' · ' + rotuloTipo(C.tipo) : '') }));
      const vtE = C.tipo === 'caso' ? '' : this._ventosDe(C); if (vtE) box.appendChild(h('div', { class: 'mcv-nota', style: 'margin-top:2px', text: vtE }));
      /* resumo dos 4 esforços neste pórtico (tabela: o equivalente acessível do diagrama) */
      const cb = D.AC[this.est.esf.comb], g = h('div', { class: 'mcv-linhas', style: 'grid-template-columns:auto 1fr auto' });
      const P = c.P, nomes = { N: 'Normal', V: 'Cortante', M: 'Momento', T: 'Torção' }, uni = { N: 'kN', V: 'kN', M: 'kN·m', T: 'kN·m' };
      for (const q of ['N', 'V', 'M', 'T']) {
        let best = null;
        if (cb) for (const B of P.barras) { const e = cb.barras[B.id]; if (!e || e.inativa) continue; const n = this._normalNoPlano(B); for (const p of arr(e.estacoes)) { if (!ehObj(p)) continue; const v = this._valorEsforco(p, B, n, q); if (!best || Math.abs(v) > Math.abs(best.v)) best = { v, B, x: num(p.x, 0) }; } }
        if (!best) continue;
        const quem = best.B.membro ? best.B.membro.id : best.B.id;
        g.appendChild(h('span', { class: 'n lk', text: nomes[q] + ' máx.', title: 'Ver ' + nomes[q], onclick: () => this.esforco(q), style: q === this.est.esf.esforco ? 'color:var(--mcv-t1);font-weight:600' : '' }));
        g.appendChild(h('span', { class: 'n', text: quem, style: 'text-align:right' }));
        g.appendChild(h('span', { class: 'v', text: (q === 'N' || q === 'T' ? fmtAuto(best.v) : fmtAuto(Math.abs(best.v))) + ' ' + uni[q] }));
      }
      box.appendChild(g);
      box.appendChild(h('p', { class: 'mcv-nota', text: 'Valores de cálculo da combinação (kN, kN·m). Momento do lado tracionado.' }));
    }
    return box;
  }

  /* ============================================================== CARTÃO (clique) e DICA (passar o mouse) */
  _alvo(chave) { return chave >= 0 ? this.D.alvos[chave] : null; }
  _esconderCartao() { if (this.cartao) { this.cartao.hidden = true; this.cartao.textContent = ''; } }
  _mostrarCartao(chave) {
    const A = this._alvo(chave); if (!A || !this.cartao) { this._esconderCartao(); return; }
    const c = this.cartao; c.textContent = '';
    const titulo = A.tipo === 'membro' ? nomeMembro(A.ref) : nomeBarra(A.ref) + ' ' + A.ref.id;
    const sub = A.tipo === 'membro' ? [ondeMembro(A.ref, this.D), 'L = ' + fmt(A.ref.Lgeo || A.ref.L, 2) + ' m'].filter(Boolean).join(' · ') : ((A.ref.secao && A.ref.secao.nome) || '') + ' · L = ' + fmt(A.ref.L, 2) + ' m';
    c.appendChild(h('div', { class: 'mcv-cab' }, h('div', {}, h('h3', { text: titulo }), h('p', { text: sub })),
      h('button', { class: 'mcv-bt', type: 'button', html: ICONE.fechar, title: 'Fechar (Esc)', 'aria-label': 'Fechar', onclick: () => this.selecionar(null) })));
    const m = this.est.modo;
    try {
      if (m === 'aproveitamento') this._cartaoAproveitamento(c, A);
      else if (m === 'deformada') this._cartaoDeformada(c, A);
      else if (m === 'flambagem') this._cartaoFlambagem(c, A);
      else this._cartaoEsforcos(c, A);
    } catch (e) { c.appendChild(h('div', { class: 'mcv-sec mcv-txt', text: 'Sem detalhe para esta barra.' })); }
    c.hidden = false;
  }
  _cartaoAproveitamento(c, A) {
    const D = this.D;
    if (A.tipo === 'membro') {
      const M = A.ref, v = M.verif, crit = this.est.apr.criterio, rz = razaoMembro(M, crit), s = statusDe(rz);
      const sec = h('div', { class: 'mcv-sec' });
      if (rz != null) {
        sec.appendChild(h('div', { class: 'mcv-big' }, h('b', { text: fmt(rz, 2) }), chipStatus(s)));
        const pos = Math.min(rz, 1.2) / 1.2 * 100;
        sec.appendChild(h('div', { class: 'mcv-medidor' }, h('i', { style: 'left:' + pos.toFixed(1) + '%' })));
        sec.appendChild(h('div', { class: 'mcv-esc mcv-regua' }, h('span', { text: '0', style: 'left:0' }), h('span', { text: '0,70', style: 'left:58.3%' }), h('span', { text: '1,00', style: 'left:83.3%' }), h('span', { text: '1,20', style: 'left:100%' })));
      } else sec.appendChild(h('p', { class: 'mcv-txt', text: 'Sem verificação para este critério.' }));
      const elsGoverna = M.razaoELS != null && (M.razaoELU == null || M.razaoELS > M.razaoELU) && crit !== 'elu';
      const kv = h('dl', { class: 'mcv-kv', style: 'margin-top:10px' });
      const par = (k, val) => { if (val == null || val === '') return; kv.appendChild(h('dt', { text: k })); kv.appendChild(h('dd', { text: val })); };
      if (crit === 'els' || elsGoverna) {
        const sv = M.servico.slice().sort((a, b) => num(b.razao, 0) - num(a.razao, 0))[0];
        if (sv) { par('Governa', 'Serviço — ' + (sv.texto || sv.tipo)); par('Valor', fmtMm(num(sv.valor, 0)) + ' (limite ' + fmtMm(num(sv.limite, 0)) + ')'); par('Situação', String(sv.comb || '') + (D.combPorId.get(String(sv.comb)) ? ' — ' + D.combPorId.get(String(sv.comb)).descricao : '')); if (sv.ref) par('Norma', sv.ref); }
      } else if (v) {
        const vg = arr(v.verificacoes).find(x => x && x.nome === v.governante);
        par('Governa', v.governante || '—');
        if (vg && vg.item) par('Norma', vg.item);
        if (v.pior) {
          const C = D.combPorId.get(String(v.pior.comb));
          par('Situação', String(v.pior.comb || '') + (C && C.descricao ? ' — ' + C.descricao : '') + ' · ' + posicaoTexto(M, num(v.pior.x, 0), D));
          const ef = [];
          if (v.pior.N != null) ef.push('N = ' + fmtAuto(num(v.pior.N, 0)) + ' kN');
          if (v.pior.Mz != null) ef.push('Mz = ' + fmtAuto(num(v.pior.Mz, 0)) + ' kN·m');
          if (v.pior.My != null && Math.abs(num(v.pior.My, 0)) > 0.005) ef.push('My = ' + fmtAuto(num(v.pior.My, 0)) + ' kN·m');
          if (v.pior.Vy != null) ef.push('V = ' + fmtAuto(Math.abs(num(v.pior.Vy, 0))) + ' kN');
          if (ef.length) par('Esforços', ef.join(' · '));
          if (v.pior.formula) par('Fórmula', v.pior.formula);
        }
      }
      sec.appendChild(kv);
      c.appendChild(sec);
      if (v && v.sugestao && !(v.ok !== false && rz != null && rz <= 1)) c.appendChild(h('div', { class: 'mcv-sec' }, h('p', { class: 'mcv-sug' }, h('b', { text: 'O que fazer' }), v.sugestao)));
      else if (rz != null && rz > 1) {
        const txt = elsGoverna || crit === 'els' ? 'Deslocamento acima do limite: aumentar a rigidez (perfil com mais inércia, base engastada ou contraventamento) — a resistência já passa.' : 'Não passa: trocar por um perfil maior da família ou travar mais a barra.';
        c.appendChild(h('div', { class: 'mcv-sec' }, h('p', { class: 'mcv-sug' }, h('b', { text: 'O que fazer' }), txt)));
      }
      /* perfil e aço */
      const kv2 = h('dl', { class: 'mcv-kv' }), par2 = (k, val) => { if (val) { kv2.appendChild(h('dt', { text: k })); kv2.appendChild(h('dd', { text: val })); } };
      par2('Perfil', (M.secao.nome || '—') + (num(M.secao.massa, 0) > 0 ? ' · ' + fmt(num(M.secao.massa, 0), 1) + ' kg/m' : ''));
      if (M.aco) par2('Aço', (M.aco.id || '') + (M.aco.fy ? ' · fy = ' + fmt(num(M.aco.fy, 0), 0) + ' MPa' : ''));
      if (M.flambagem) par2('Flambagem', 'Lx = ' + fmt(num(M.flambagem.Lx, 0), 2) + ' m · Ly = ' + fmt(num(M.flambagem.Ly, 0), 2) + ' m · Lz = ' + fmt(num(M.flambagem.Lz, 0), 2) + ' m');
      if (M.maosFrancesas.length) par2('Mãos-francesas', M.maosFrancesas.map(x => fmt(num(x, 0), 2)).join('; ') + ' m');
      c.appendChild(h('div', { class: 'mcv-sec' }, kv2));
      /* todas as verificações (a tabela por trás da cor) */
      const lst = h('div', { class: 'mcv-linhas' });
      for (const x of arr(v && v.verificacoes)) {
        if (!ehObj(x)) continue;
        const r2 = num(x.razao, 0), s2 = statusDe(r2), gov = v.governante === x.nome;
        lst.appendChild(h('span', { class: 'n', text: x.nome, title: (x.item || '') + (x.solicitante != null ? ' · Sd = ' + fmtAuto(num(x.solicitante, 0)) + ' ' + (x.unidade || '') + ' · Rd = ' + fmtAuto(num(x.resistencia, 0)) + ' ' + (x.unidade || '') : ''), style: gov ? 'color:var(--mcv-t1);font-weight:600' : '' }));
        lst.appendChild(h('span', { class: 'br' }, h('i', { style: 'width:' + Math.min(100, r2 / 1.2 * 100).toFixed(1) + '%;background:' + s2.cor })));
        lst.appendChild(h('span', { class: 'v', text: fmt(r2, 2) }));
      }
      for (const sv of M.servico) {
        const r2 = num(sv.razao, 0), s2 = statusDe(r2);
        lst.appendChild(h('span', { class: 'n', text: 'Serviço · ' + (sv.tipo === 'pilarTopo' ? 'topo (H/300)' : sv.tipo === 'viga' ? 'flecha (L/250)' : sv.tipo), title: sv.texto || '' }));
        lst.appendChild(h('span', { class: 'br' }, h('i', { style: 'width:' + Math.min(100, r2 / 1.2 * 100).toFixed(1) + '%;background:' + s2.cor })));
        lst.appendChild(h('span', { class: 'v', text: fmt(r2, 2) }));
      }
      if (lst.childNodes.length) c.appendChild(h('div', { class: 'mcv-sec' }, h('div', { class: 'mcv-h', text: 'Verificações', style: 'margin:0' }), lst));
      if (v && arr(v.avisos).length) c.appendChild(h('div', { class: 'mcv-sec' }, ...arr(v.avisos).map(a => h('p', { class: 'mcv-nota', text: String(a) }))));
      this._cartaoLigacoes(c, LIG_DE[M.papel]);
    } else {
      const B = A.ref, sec = h('div', { class: 'mcv-sec' });
      if (B.tipo === 'contravento') {
        const s = statusDe(B.razao);
        if (B.frouxa) sec.appendChild(h('div', { class: 'mcv-big' }, h('b', { text: 'frouxa' }), h('span', { class: 'mcv-txt', text: 'não tracionada em nenhuma combinação última' })));
        else if (B.razao != null) sec.appendChild(h('div', { class: 'mcv-big' }, h('b', { text: fmt(B.razao, 2) }), chipStatus(s)));
        const kv = h('dl', { class: 'mcv-kv' }), par = (k, val) => { if (val) { kv.appendChild(h('dt', { text: k })); kv.appendChild(h('dd', { text: val })); } };
        par('Perfil', (B.secao && B.secao.nome) || D.cv.perfil || '—');
        if (!B.frouxa) par('Tração', 'N = ' + fmtAuto(B.cvN || 0) + ' kN' + (B.cvComb ? ' (' + B.cvComb + ')' : ''));
        if (D.cv.NRd) par('Resistência', 'NRd = ' + fmtAuto(D.cv.NRd) + ' kN');
        const vg = D.cv.verif && arr(D.cv.verif.verificacoes)[0];
        if (vg) par('Governa', (vg.nome || 'Tração') + (vg.item ? ' — ' + vg.item : ''));
        if (B.nTracao != null) par('Combinações', B.nTracao + (B.nTracao === 1 ? ' tracionada' : ' tracionadas') + ' · ' + B.nFrouxa + (B.nFrouxa === 1 ? ' frouxa' : ' frouxas'));
        sec.appendChild(kv);
        sec.appendChild(h('p', { class: 'mcv-nota', text: 'Barra só de tração: fica frouxa (sai do modelo) quando seria comprimida; no par em X trabalha a diagonal tracionada.' + (D.cv.barra === B.id ? ' É a mais solicitada do grupo.' : '') }));
        c.appendChild(sec);
        this._cartaoLigacoes(c, LIG_DE.contravento);
        return;
      } else if (B.sec) {
        /* terça / travessa: a verificação típica do grupo (AcoSecundarias, NBR 14762) */
        const G2 = B.sec, crit = this.est.apr.criterio, rz = razaoSec(G2, crit), s = statusDe(rz);
        if (rz != null) {
          sec.appendChild(h('div', { class: 'mcv-big' }, h('b', { text: fmt(rz, 2) }), chipStatus(s)));
          sec.appendChild(h('div', { class: 'mcv-medidor' }, h('i', { style: 'left:' + (Math.min(rz, 1.2) / 1.2 * 100).toFixed(1) + '%' })));
        }
        const kv = h('dl', { class: 'mcv-kv', style: 'margin-top:10px' }), par = (k, val) => { if (val) { kv.appendChild(h('dt', { text: k })); kv.appendChild(h('dd', { text: val })); } };
        const vg = arr(G2.verificacoes).find(x => ehObj(x) && x.nome === G2.governante);
        par('Governa', G2.governante || '—');
        if (vg && vg.item) par('Norma', vg.item);
        if (G2.combinacaoGovernante) par('Combinação', G2.combinacaoGovernante);
        if (ehObj(G2.esforcos)) {
          const e2 = G2.esforcos, ef = [];
          if (e2.Mx != null) ef.push('Mx = ' + fmtAuto(num(e2.Mx, 0)) + ' kN·m');
          if (e2.My != null) ef.push('My = ' + fmtAuto(num(e2.My, 0)) + ' kN·m');
          if (e2.Vy != null) ef.push('V = ' + fmtAuto(num(e2.Vy, 0)) + ' kN');
          if (ef.length) par('Esforços', ef.join(' · '));
        }
        par('Perfil', G2.perfil + (num(G2.massa, 0) > 0 ? ' · ' + fmt(num(G2.massa, 0), 2) + ' kg/m' : ''));
        if (G2.aco) par('Aço', (G2.aco.id || '') + (G2.aco.fy ? ' · fy = ' + fmt(num(G2.aco.fy, 0), 0) + ' MPa' : ''));
        if (num(G2.vao, 0) > 0) par('Vão', fmt(num(G2.vao, 0), 2) + ' m' + (G2.linhas != null ? ' · ' + G2.linhas + (B.grupoSec === 'terca' ? ' linha(s) de correntes' : ' tirante(s)') + ' por vão' : ''));
        sec.appendChild(kv);
        c.appendChild(sec);
        if (rz != null && rz > 1) {
          const alt = arr(G2.alternativas).filter(ehObj);
          const txt = G2.sugestao || (alt.length ? 'Alternativas do catálogo: ' + alt.map(a2 => a2.perfil + (a2.linhas != null ? ' (' + a2.linhas + (a2.linhas === 1 ? ' linha)' : ' linhas)') : '')).join('; ') : 'Perfil maior ou mais linhas de correntes/tirantes.');
          c.appendChild(h('div', { class: 'mcv-sec' }, h('p', { class: 'mcv-sug' }, h('b', { text: 'O que fazer' }), txt)));
        }
        const lst = h('div', { class: 'mcv-linhas' });
        for (const x of arr(G2.verificacoes)) {
          if (!ehObj(x)) continue;
          const r2 = num(x.razao, 0), s2 = statusDe(r2), gov = x.nome === G2.governante;
          lst.appendChild(h('span', { class: 'n', text: x.nome, title: x.item || '', style: gov ? 'color:var(--mcv-t1);font-weight:600' : '' }));
          lst.appendChild(h('span', { class: 'br' }, h('i', { style: 'width:' + Math.min(100, r2 / 1.2 * 100).toFixed(1) + '%;background:' + s2.cor })));
          lst.appendChild(h('span', { class: 'v', text: fmt(r2, 2) }));
        }
        if (lst.childNodes.length) c.appendChild(h('div', { class: 'mcv-sec' }, h('div', { class: 'mcv-h', text: 'Verificações do grupo (NBR 14762)', style: 'margin:0' }), lst));
        if (arr(G2.avisos).length) c.appendChild(h('div', { class: 'mcv-sec' }, ...arr(G2.avisos).map(a2 => h('p', { class: 'mcv-nota', text: String(a2) }))));
        this._cartaoLigacoes(c, B.grupoSec === 'terca' ? LIG_DE.terca : null);
        return;
      } else {
        sec.appendChild(h('p', { class: 'mcv-txt', text: B.tipo === 'escora' ? 'Entra no pórtico espacial só como escora (força axial, rótulas nas pontas). A terça/travessa é dimensionada à parte (NBR 14762).' : 'Barra do modelo sem verificação própria neste resultado.' }));
        let nmax = 0, onde = null;
        for (const C of D.combs) { if (C.tipo !== 'ELU') continue; const e = D.AC[C.id].barras[B.id]; if (!e || e.inativa) continue; for (const p of arr(e.estacoes)) if (ehObj(p) && Math.abs(num(p.N, 0)) > Math.abs(nmax)) { nmax = num(p.N, 0); onde = C.id; } }
        if (onde) sec.appendChild(h('dl', { class: 'mcv-kv', style: 'margin-top:8px' }, h('dt', { text: 'N máx. (ELU)' }), h('dd', { text: fmtAuto(nmax) + ' kN (' + onde + ')' })));
      }
      c.appendChild(sec);
    }
  }
  /* ligações da peça (AcoLigCalc): razão, o que governa e o resumo do detalhe */
  _cartaoLigacoes(c, ids) {
    const D = this.D;
    if (!D.lig || !ids || !ids.length || this.est.apr.criterio === 'els') return;
    const lista = arr(D.lig.lista).filter(x => ehObj(x) && ids.indexOf(x.id) >= 0);
    if (!lista.length) return;
    const sec = h('div', { class: 'mcv-sec' }, h('div', { class: 'mcv-h', text: 'Ligações', style: 'margin:0 0 4px' }));
    for (const L2 of lista) {
      const rz = num(L2.razao, 0), s = statusDe(rz);
      sec.appendChild(h('div', { class: 'mcv-lei', style: 'margin-top:6px' }, iconeStatus(s), h('span', { class: 'n', text: L2.nome || L2.id }), h('span', { class: 'v', text: fmt(rz, 2) }),
        h('small', { text: (L2.governante ? 'governa: ' + L2.governante + '. ' : '') + (L2.resumo || '') })));
      if (L2.sugestao) sec.appendChild(h('p', { class: 'mcv-nota', text: String(L2.sugestao) }));
    }
    c.appendChild(sec);
  }
  _cartaoDeformada(c, A) {
    const D = this.D, cn = this.cena, sec = h('div', { class: 'mcv-sec' }), kv = h('dl', { class: 'mcv-kv' });
    const par = (k, val) => { if (val) { kv.appendChild(h('dt', { text: k })); kv.appendChild(h('dd', { text: val })); } };
    const bs = A.tipo === 'membro' ? A.ref.barras : [A.ref];
    let mx = 0, xMx = 0;
    for (const B of bs) for (const a of (cn.amostras && cn.amostras.get(B.id)) || []) { const m = comp(a.d); if (m > mx) { mx = m; xMx = (B.x0 || 0) + a.s * B.L; } }
    sec.appendChild(h('div', { class: 'mcv-big' }, h('b', { text: fmtMm(mx) }), h('span', { class: 'mcv-txt', text: 'deslocamento máx. na barra' })));
    if (A.tipo === 'membro') {
      const M = A.ref; par('Onde', posicaoTexto(M, xMx, D));
      const pl = cn.leituras.pilares.find(p => p.M === M);
      if (pl) par('Topo × base', fmtMm(pl.dh) + (pl.dh > 1e-6 ? ' (H/' + Math.round((M.L || M.Lgeo) / pl.dh) + ')' : '') + (cn.rara ? ' · limite H/300 = ' + fmtMm(pl.lim) : ''));
      if (M.papel === 'viga' && M.barras.length) {
        /* flecha em relação à corda do membro (beiral–cumeeira) */
        const b0 = M.barras[0], bN = M.barras[M.barras.length - 1], am0 = cn.amostras.get(b0.id), amN = cn.amostras.get(bN.id);
        if (am0 && amN) {
          const ua = am0[0].d, ub = amN[amN.length - 1].d, Lm = M.Lgeo, ey = b0.ey; let f = 0;
          for (const B of M.barras) for (const a of cn.amostras.get(B.id)) { const x = (B.x0 || 0) + a.s * B.L, s = x / Lm, rel = sub(a.d, soma(ua, esc(sub(ub, ua), s))); const w = pe(rel, ey); if (Math.abs(w) > Math.abs(f)) f = w; }
          par('Flecha (corda)', fmtMm(Math.abs(f)) + ' — em relação à reta beiral–cumeeira');
        }
        const cm = cn.leituras.cumeeiras.find(q => q.k === M.k);
        if (cm) par('Cumeeira', fmtMm(Math.abs(cm.dv)) + ' em relação aos beirais' + (cn.rara ? ' · limite L/250 = ' + fmtMm(cm.lim) : ''));
      }
      for (const sv of M.servico) if (String(sv.comb) === cn.comb) par(sv.tipo === 'viga' ? 'Flecha no cálculo' : 'Topo no cálculo', fmtMm(num(sv.valor, 0)) + ' · limite ' + fmtMm(num(sv.limite, 0)) + (sv.tipo === 'viga' ? ' (medida entre os nós do modelo)' : ''));
    }
    par('Combinação', cn.comb + ((D.combPorId.get(cn.comb) || {}).descricao ? ' — ' + D.combPorId.get(cn.comb).descricao : ''));
    sec.appendChild(kv);
    c.appendChild(sec);
  }
  _cartaoFlambagem(c, A) {
    const cn = this.cena, sec = h('div', { class: 'mcv-sec' }), p = cn.partic.get(A.ref.chave) || 0;
    sec.appendChild(h('div', { class: 'mcv-big' }, h('b', { text: fmt(p, 2) }), h('span', { class: 'mcv-txt', text: 'amplitude relativa no modo' })));
    sec.appendChild(h('p', { class: 'mcv-txt', text: p > 0.6 ? 'Esta barra é protagonista do modo: travá-la ou enrijecê-la é o que mais sobe o λcr.' : p > 0.25 ? 'Participa do modo, acompanhando as barras vizinhas.' : 'Quase parada neste modo.' }));
    if (A.tipo === 'membro' && A.ref.flambagem) { const F = A.ref.flambagem; sec.appendChild(h('p', { class: 'mcv-nota', text: 'Comprimentos de flambagem no dimensionamento: Lx = ' + fmt(num(F.Lx, 0), 2) + ' m, Ly = ' + fmt(num(F.Ly, 0), 2) + ' m, Lz = ' + fmt(num(F.Lz, 0), 2) + ' m.' })); }
    c.appendChild(sec);
  }
  _cartaoEsforcos(c, A) {
    const D = this.D, cb = D.AC[this.est.esf.comb], sec = h('div', { class: 'mcv-sec' });
    const bs = A.tipo === 'membro' ? A.ref.barras : [A.ref];
    const g = h('div', { class: 'mcv-linhas', style: 'grid-template-columns:auto 1fr auto' }), uni = { N: 'kN', V: 'kN', M: 'kN·m', T: 'kN·m' }, nomes = { N: 'Normal', V: 'Cortante', M: 'Momento', T: 'Torção' };
    for (const q of ['N', 'V', 'M', 'T']) {
      let mn = null, mx = null;
      for (const B of bs) { const e = cb && cb.barras[B.id]; if (!e || e.inativa) continue; const n = this._normalNoPlano(B); for (const p of arr(e.estacoes)) { if (!ehObj(p)) continue; const v = this._valorEsforco(p, B, n, q), x = (B.x0 || 0) + num(p.x, 0); if (!mx || v > mx.v) mx = { v, x }; if (!mn || v < mn.v) mn = { v, x }; } }
      if (!mx) continue;
      g.appendChild(h('span', { class: 'n', text: nomes[q], style: q === this.est.esf.esforco ? 'color:var(--mcv-t1);font-weight:600' : '' }));
      g.appendChild(h('span', { class: 'n', text: 'mín. ' + fmtAuto(mn.v), style: 'text-align:right' }));
      g.appendChild(h('span', { class: 'v', text: 'máx. ' + fmtAuto(mx.v) + ' ' + uni[q] }));
    }
    sec.appendChild(g);
    sec.appendChild(h('p', { class: 'mcv-nota', text: 'Combinação ' + this.est.esf.comb + '. V e M no plano do pórtico (M positivo = lado de cima/de dentro tracionado).' }));
    c.appendChild(sec);
  }
  _textoDica(chave) {
    const A = this._alvo(chave); if (!A) return null;
    const nome = A.tipo === 'membro' ? A.ref.id + ' · ' + (NOME_PAPEL[A.ref.papel] || '') : A.ref.id + ' · ' + nomeBarra(A.ref);
    const m = this.est.modo, cn = this.cena;
    if (m === 'aproveitamento') {
      const B = A.tipo === 'barra' ? A.ref : null, crit = this.est.apr.criterio;
      if (B && B.tipo === 'contravento' && B.frouxa) return [nome, (B.secao && B.secao.nome) || '', 'frouxa'];
      const rz = A.tipo === 'membro' ? razaoMembro(A.ref, crit) : B.sec ? razaoSec(B.sec, crit) : B.razao;
      const perf = A.tipo === 'membro' ? (A.ref.secao.nome || '') : B.sec ? B.sec.perfil : ((B.secao && B.secao.nome) || '');
      return [nome, perf, rz != null ? fmt(rz, 2) : 'à parte'];
    }
    if (m === 'deformada' && cn.amostras) {
      const bs = A.tipo === 'membro' ? A.ref.barras : [A.ref]; let mx = 0;
      for (const B of bs) for (const a of cn.amostras.get(B.id) || []) mx = Math.max(mx, comp(a.d));
      return [nome, '', fmtMm(mx)];
    }
    if (m === 'flambagem' && cn.partic) return [nome, 'amplitude', fmt(cn.partic.get(chave) || 0, 2)];
    if (m === 'esforcos' && cn.dados) {
      let mx = null; for (const dd of cn.dados) if (dd.B.chave === chave) for (const q of dd.pts) if (!mx || Math.abs(q.v) > Math.abs(mx)) mx = q.v;
      return [nome, cn.qual + ' máx.', mx != null ? fmtAuto(cn.qual === 'N' || cn.qual === 'T' ? mx : Math.abs(mx)) + ' ' + cn.unid : '—'];
    }
    return [nome, '', ''];
  }

  /* ============================================================== CÂMERA */
  /* caixa do que está na tela no modo atual (com a deformação na escala; na flambagem, nos dois sentidos) */
  _caixaVisivel() {
    const c = this.cena, box = new THREE.Box3(), v = new THREE.Vector3();
    const escs = this.est.modo === 'flambagem' ? [this.est.fla.amp || 0, -(this.est.fla.amp || 0)] : [this.U.escala.value];
    if (c && c.alvos && c.alvos.length) for (const a of c.alvos) a.pts.forEach((p, i) => {
      const d = a.des && a.des[i] ? a.des[i] : null;
      for (const s of escs) { v.set(p[0] + (d ? d[0] * s : 0), p[1] + (d ? d[1] * s : 0), p[2] + (d ? d[2] * s : 0)); box.expandByPoint(v); }
    });
    if (box.isEmpty()) { const D = this.D; box.set(new THREE.Vector3(...D.mn), new THREE.Vector3(...D.mx)); }
    if (c && c.caixaExtra) for (const q of c.caixaExtra) box.expandByPoint(new THREE.Vector3(q[0], q[1], q[2]));
    return box;
  }
  /* região livre da tela (px): fora da barrinha de cima e da coluna de painéis da direita */
  _regiaoLivre(W, H, foto) {
    if (foto) return { x0: 0.04 * W, x1: 0.96 * W, y0: 0.115 * H, y1: 0.875 * H };
    const barra = this.op.barra !== false, larga = W > 900;
    return { x0: 22, x1: W - (larga ? 348 : 22), y0: barra ? 116 : 22, y1: H - (larga ? 30 : 96) };
  }
  /* centro óptico no meio da região livre (setViewOffset): a imagem 3D continua ocupando o quadro todo
     (passa por baixo dos painéis), mas o ponto de órbita e o enquadramento ficam centrados na área útil */
  _aplicarCentro(W, H, foto) {
    const reg = this._regiaoLivre(W, H, foto), cx = (reg.x0 + reg.x1) / 2, cy = (reg.y0 + reg.y1) / 2;
    this.camera.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
    this.camera.updateProjectionMatrix();
  }
  /* câmera que enquadra a caixa olhando na direção dir (do alvo para a câmera): busca a distância em que a
     projeção REAL dos 8 cantos cabe na região livre, simétrica em torno do centro óptico (ver _aplicarCentro) */
  _calcEnquadramento(box, dir, fov, W, H, foto) {
    dir = dir.clone().normalize();
    const r = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir);
    if (r.lengthSq() < 1e-10) r.set(1, 0, 0); r.normalize();
    const u = new THREE.Vector3().crossVectors(dir, r).normalize(), C = box.getCenter(new THREE.Vector3());
    const cantos = []; for (let i = 0; i < 8; i++) cantos.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
    const tv = Math.tan(THREE.MathUtils.degToRad(fov) / 2), th = tv * W / H, reg = this._regiaoLivre(W, H, foto), tmp = new THREE.Vector3();
    const hw = (reg.x1 - reg.x0) / 2, hh = (reg.y1 - reg.y0) / 2;
    /* extensão projetada (px, relativa ao centro óptico) com a câmera em alvo + dir·d; null se algo fica atrás */
    const ext = (alvo, d) => {
      const cam = alvo.clone().addScaledVector(dir, d); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const p of cantos) {
        tmp.copy(p).sub(cam); const z = -tmp.dot(dir); if (z <= 0.05) return null;
        const px = (tmp.dot(r) / z) / th * W / 2, py = -(tmp.dot(u) / z) / tv * H / 2;
        if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
      }
      return { x0, x1, y0, y1 };
    };
    const busca = alvo => {
      let lo = 0.05, hi = Math.max(10, this.D.diag * 60);
      for (let i = 0; i < 48; i++) { const mid = (lo + hi) / 2, e = ext(alvo, mid); if (e && e.x0 >= -hw && e.x1 <= hw && e.y0 >= -hh && e.y1 <= hh) hi = mid; else lo = mid; }
      return hi;
    };
    /* 1º: cabe simétrico em torno do centro da caixa; depois aproxima o centro PROJETADO do centro óptico
       (amortecido: em perspectiva o deslocamento não é linear) — cada passo continua cabendo por construção */
    const alvo = C.clone(); let d = busca(alvo);
    for (let it = 0; it < 6; it++) {
      const e = ext(alvo, d); if (!e) break;
      const ox = (e.x0 + e.x1) / 2, oy = (e.y0 + e.y1) / 2;
      if (Math.abs(ox) < 1.5 && Math.abs(oy) < 1.5) break;
      const wpp = 2 * d * tv / H;
      alvo.addScaledVector(r, ox * wpp * 0.7).addScaledVector(u, -oy * wpp * 0.7);
      d = busca(alvo);
    }
    return { pos: alvo.clone().addScaledVector(dir, d), alvo };
  }
  enquadrar(instantaneo) {
    if (!this.camera) return;
    if (this.est.modo === 'esforcos') { this._cameraPortico(!instantaneo); return; }
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const e = this._calcEnquadramento(this._caixaVisivel(), dir, FOV_3D, this.W, this.H);
    this._voar(e.pos, e.alvo, instantaneo, FOV_3D);
  }
  vista(nome, instantaneo) {
    if (!this.camera) return;
    const n = String(nome || '3d').toLowerCase();
    if (this.est.modo === 'esforcos' && n === 'frente') { this._cameraPortico(!instantaneo); return; }
    const d = new THREE.Vector3(...(DIRECOES[n] || DIRECOES['3d'])).normalize();
    const e = this._calcEnquadramento(this._caixaVisivel(), d, FOV_3D, this.W, this.H);
    this._voar(e.pos, e.alvo, instantaneo, FOV_3D);
  }
  _caixaPortico() {
    const P = this.D.porticos.find(p => p.k === this.est.esf.k); if (!P) return null;
    const box = new THREE.Box3();
    for (const B of P.barras) { box.expandByPoint(new THREE.Vector3(...B.p0)); box.expandByPoint(new THREE.Vector3(...B.p1)); }
    if (this.cena && this.cena.caixaDiag && !this.cena.caixaDiag.isEmpty()) box.union(this.cena.caixaDiag);
    const vao = num(this.D.layout.vao, 10);
    box.min.x -= 0.06 * vao; box.max.x += 0.06 * vao; box.max.y += 0.05 * vao; box.min.y -= 0.09 * vao;   /* folga para os rótulos e as bolhas dos eixos */
    return box;
  }
  _cameraPortico(animar) {
    const box = this._caixaPortico(); if (!box) return;
    const e = this._calcEnquadramento(box, new THREE.Vector3(0, 0.0, 1), FOV_PORTICO, this.W, this.H);
    this._voar(e.pos, e.alvo, !animar, FOV_PORTICO);
  }
  _voar(pos, alvo, instantaneo, fov) {
    const f1 = fov || this.camera.fov;
    this.camera.up.set(0, 1, 0);
    if (instantaneo) {
      this.camera.position.copy(pos); this.controls.target.copy(alvo);
      if (f1 !== this.camera.fov) { this.camera.fov = f1; this.camera.updateProjectionMatrix(); }
      this.controls.update(); this.voo = null; this.sujo = true; return;
    }
    this.voo = { p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: pos.clone(), t1: alvo.clone(), f0: this.camera.fov, f1, ini: performance.now(), dur: 600 };
  }
  _zoomRoda(e) {
    e.preventDefault();
    if (!this.camera) return;
    const r = this.canvas.getBoundingClientRect(), nx = ((e.clientX - r.left) / r.width) * 2 - 1, ny = -((e.clientY - r.top) / r.height) * 2 + 1;
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const dirV = new THREE.Vector3(); this.camera.getWorldDirection(dirV);
    const plano = new THREE.Plane().setFromNormalAndCoplanarPoint(dirV, this.controls.target), P = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plano, P)) P.copy(this.controls.target);
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    let k = Math.exp(lim(dy, -300, 300) * 0.0013);
    const dist = this.camera.position.distanceTo(this.controls.target), dmin = 0.4, dmax = this.D.diag * 12;
    if (dist * k < dmin) k = dmin / dist; if (dist * k > dmax) k = dmax / dist;
    this.camera.position.sub(P).multiplyScalar(k).add(P);
    this.controls.target.sub(P).multiplyScalar(k).add(P);
    this.voo = null; this.sujo = true;
  }

  /* ============================================================== INTERAÇÃO */
  _ligarEventos() {
    const cv = this.canvas;
    this._ev = [];
    const on = (alvo, ev, fn, op) => { alvo.addEventListener(ev, fn, op); this._ev.push([alvo, ev, fn, op]); };
    on(cv, 'wheel', e => { e.stopImmediatePropagation(); this._zoomRoda(e); }, { passive: false, capture: true });
    on(cv, 'pointerdown', e => { this._pd = { x: e.clientX, y: e.clientY, t: performance.now() }; this.voo = null; });
    on(cv, 'pointermove', e => { this._ultimoMouse = e; if (e.buttons) { this._esconderDica(); return; } if (!this._rafHover) this._rafHover = requestAnimationFrame(() => { this._rafHover = 0; this._hover(this._ultimoMouse); }); });
    on(cv, 'pointerleave', () => { this._definirHover(-1); this._esconderDica(); });
    on(cv, 'pointerup', e => {
      const p = this._pd; this._pd = null;
      if (!p || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 5 || performance.now() - p.t > 600) return;
      const ch = this._escolher(e);
      if (ch < 0) { this.selecionar(null); return; }
      const A = this._alvo(ch);
      this.selecionar(A.ref.id, { toggle: true });
    });
    on(cv, 'dblclick', e => { const ch = this._escolher(e); if (ch >= 0) this.selecionar(this._alvo(ch).ref.id, { enquadrar: true }); });
    on(this.raiz, 'keydown', e => {
      if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      const k = e.key;
      if (k === 'Escape') { this.selecionar(null); return; }
      if (k === 'f' || k === 'F') { this.enquadrar(); e.preventDefault(); return; }
      const M = MODOS.find(x => x.tecla === k); if (M) { this.modo(M.id); e.preventDefault(); return; }
      if (k === ' ' && this.est.modo === 'flambagem') { this.animar(!this.est.fla.animar); e.preventDefault(); }
      if (this.est.modo === 'esforcos' && (k === 'ArrowRight' || k === 'ArrowLeft')) {
        const ks = this.D.porticos.map(p => p.k), i = ks.indexOf(this.est.esf.k); this.portico(ks[(i + (k === 'ArrowRight' ? 1 : -1) + ks.length) % ks.length]); e.preventDefault();
      }
    });
    on(this.controls, 'change', () => { this.sujo = true; });
    if (typeof MutationObserver !== 'undefined' && (!this.op.tema || this.op.tema === 'auto')) {
      this.mo = new MutationObserver(() => { const t = escolherTema(); if (t !== this.temaNome) this._aplicarTema(t); });
      this.mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] });
    }
  }
  _hover(e) {
    if (!e || !this.cena) return;
    const ch = this._escolher(e);
    this._definirHover(ch);
    if (ch < 0) { this._esconderDica(); return; }
    const t = this._textoDica(ch); if (!t) { this._esconderDica(); return; }
    const d = this.dica; d.textContent = '';
    d.appendChild(document.createTextNode(t[0] + (t[1] ? ' · ' + t[1] : '') + (t[2] ? '  ' : '')));
    if (t[2]) d.appendChild(h('b', { text: t[2] }));
    d.hidden = false;
    const r = this.raiz.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const w = d.offsetWidth, hh = d.offsetHeight;
    d.style.transform = 'translate(' + Math.round(Math.min(x + 14, this.W - w - 6)) + 'px,' + Math.round(y + 18 + hh > this.H ? y - hh - 10 : y + 18) + 'px)';
  }
  _esconderDica() { if (this.dica) this.dica.hidden = true; }
  _definirHover(ch) {
    if (ch === this.hoverChave) return;
    this.hoverChave = ch; this.U.hover.value = ch; this.canvas.classList.toggle('mcv-sobre', ch >= 0); this.sujo = true;
  }
  /* escolha por distância na tela ao eixo (deformado, na escala atual) das barras.
     Os pontos de todos os alvos ficam num vetor plano; a projeção é refeita só quando a câmera, a escala
     ou o tamanho mudam (passar o mouse com a câmera parada custa só o teste dos segmentos). */
  _planificarAlvos(c) {
    if (c._plano) return c._plano;
    let n = 0; for (const a of c.alvos) n += a.pts.length;
    const xyz = new Float32Array(n * 3), des = new Float32Array(n * 3), seg = [];
    let k = 0;
    for (const a of c.alvos) {
      const i0 = k;
      a.pts.forEach((p, i) => { xyz[k * 3] = p[0]; xyz[k * 3 + 1] = p[1]; xyz[k * 3 + 2] = p[2]; const d = a.des && a.des[i]; if (d) { des[k * 3] = d[0]; des[k * 3 + 1] = d[1]; des[k * 3 + 2] = d[2]; } k++; });
      seg.push(a.chave, i0, a.pts.length);
    }
    return (c._plano = { n, xyz, des, seg: Int32Array.from(seg), tela: new Float32Array(n * 3), chaveProj: '' });
  }
  _escolher(e) {
    if (!this.cena || !this.cena.alvos || !this.cena.alvos.length) return -1;
    const r = this.canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, W = r.width, H = r.height;
    const P = this._planificarAlvos(this.cena), cam = this.camera, s = this.U.escala.value;
    cam.updateMatrixWorld();
    const M = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements;
    const chave = M.join(',') + '|' + s + '|' + W + 'x' + H;
    const T = P.tela;
    if (P.chaveProj !== chave) {
      P.chaveProj = chave;
      const X = P.xyz, Dd = P.des;
      for (let i = 0; i < P.n; i++) {
        const x = X[i * 3] + Dd[i * 3] * s, y = X[i * 3 + 1] + Dd[i * 3 + 1] * s, z = X[i * 3 + 2] + Dd[i * 3 + 2] * s;
        const cw = M[3] * x + M[7] * y + M[11] * z + M[15];
        if (cw <= cam.near) { T[i * 3 + 2] = -1; continue; }
        T[i * 3] = ((M[0] * x + M[4] * y + M[8] * z + M[12]) / cw + 1) / 2 * W;
        T[i * 3 + 1] = (1 - (M[1] * x + M[5] * y + M[9] * z + M[13]) / cw) / 2 * H;
        T[i * 3 + 2] = cw;
      }
    }
    const tol = 7, sg = P.seg;
    let melhor = -1, dMelhor = 1e9, zMelhor = 1e9;
    for (let q = 0; q < sg.length; q += 3) {
      const ch = sg[q], i0 = sg[q + 1], n = sg[q + 2];
      for (let i = i0; i < i0 + n - 1; i++) {
        const pz = T[i * 3 + 2], qz = T[i * 3 + 5]; if (pz < 0 || qz < 0) continue;
        const px = T[i * 3], py = T[i * 3 + 1], dx = T[i * 3 + 3] - px, dy = T[i * 3 + 4] - py;
        if ((mx < Math.min(px, px + dx) - tol) || (mx > Math.max(px, px + dx) + tol) || (my < Math.min(py, py + dy) - tol) || (my > Math.max(py, py + dy) + tol)) continue;
        const l2 = dx * dx + dy * dy;
        let t = l2 > 0 ? ((mx - px) * dx + (my - py) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(px + dx * t - mx, py + dy * t - my), z = pz + (qz - pz) * t;
        if (d <= tol && (d < dMelhor - 2.5 || (Math.abs(d - dMelhor) <= 2.5 && z < zMelhor))) { dMelhor = d; zMelhor = z; melhor = ch; }
      }
    }
    return melhor;
  }

  /* ============================================================== LAÇO */
  _laco(t) {
    if (this.destruida) return;
    this.raf = requestAnimationFrame(this._laco);
    if (document.hidden) return;
    if (this.voo) {
      const v = this.voo, k = lim((performance.now() - v.ini) / v.dur, 0, 1), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this.camera.position.lerpVectors(v.p0, v.p1, e); this.controls.target.lerpVectors(v.t0, v.t1, e);
      if (v.f1 !== v.f0) { this.camera.fov = v.f0 + (v.f1 - v.f0) * e; this.camera.updateProjectionMatrix(); }
      if (k >= 1) this.voo = null;
      this.sujo = true;
    }
    if (this.controls && this.controls.update()) this.sujo = true;
    if (this.est.modo === 'flambagem' && this.est.fla.animar && this.cena && !this.cena.vazio) {
      const fase = ((performance.now() - this.t0) / 1700) * Math.PI * 2;
      this.U.escala.value = (this.est.fla.amp || 0) * Math.sin(fase);
      this.sujo = true;
    }
    if (!this.sujo) return;
    this.sujo = false;
    this._render();
  }
  _render() {
    if (!this.renderer || this.W < 2 || this.H < 2) return;
    this.renderer.render(this.scene, this.camera);
    if (this.rotulos) this.rotulos.atualizar(this.camera, this.W, this.H, this.U.escala.value);
    this._gizmo();
  }
  _gizmo() {
    if (!this.giz) return;
    const q = this.camera.quaternion.clone().invert(), c = 32, L = 20;
    const eixos = [['X', [1, 0, 0], '#d9534f'], ['Y', [0, 1, 0], '#2e9e5b'], ['Z', [0, 0, 1], '#3b7ddd']].map(([n, v, cor]) => { const w = new THREE.Vector3(...v).applyQuaternion(q); return { n, x: w.x, y: w.y, z: w.z, cor }; }).sort((a, b) => a.z - b.z);
    let s = '<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="' + (this.temaNome === 'claro' ? 'rgba(255,255,255,.55)' : 'rgba(20,36,51,.6)') + '"/>';
    for (const a of eixos) {
      const x2 = c + a.x * L, y2 = c - a.y * L, op = a.z < -0.2 ? 0.45 : 1;
      s += '<line x1="32" y1="32" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="' + a.cor + '" stroke-width="2" stroke-linecap="round" opacity="' + op + '"/>';
      s += '<text x="' + (c + a.x * (L + 7)).toFixed(1) + '" y="' + (c - a.y * (L + 7) + 3.5).toFixed(1) + '" font-size="10" font-weight="600" text-anchor="middle" fill="' + a.cor + '" opacity="' + op + '" font-family="system-ui,sans-serif">' + a.n + '</text>';
    }
    this.giz.innerHTML = s + '</svg>';
  }

  /* ============================================================== FOTO (memorial) */
  _baixarFoto() {
    try {
      const url = this.foto(1920, 1200), a = document.createElement('a');
      a.href = url; a.download = 'estrutura-' + this.est.modo + '.png'; document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { console.error('[MetalCalcVista] foto', e); }
  }
  foto(largura, altura, op) {
    if (!this.renderer) return null;
    op = op || {};
    const W = Math.max(64, Math.round(largura || 1600)), H = Math.max(64, Math.round(altura || 1000));
    const temaAnt = this.temaNome, temaFoto = op.tema || 'claro';
    if (temaFoto !== temaAnt) this._trocarTemaFoto(temaFoto);
    const T = TEMAS[this.temaNome];
    const W0 = this.W, H0 = this.H, hov = this.U.hover.value, esc0 = this.U.escala.value, sel0 = this.U.sel.value;
    if (this.est.modo === 'flambagem') this.U.escala.value = this.est.fla.amp || 0;
    this.U.hover.value = -1; this.U.sel.value = -1;   /* o memorial mostra a estrutura toda, sem destaque */
    if (this.halo) this.halo.visible = false;
    this.renderer.setPixelRatio(1); this.renderer.setSize(W, H, false);
    this.camera.aspect = W / H; this.U.res.value.set(W, H); this._aplicarCentro(W, H, true);
    /* a imagem não tem os painéis da tela: reenquadra na MESMA direção de olhar (op.enquadrar = false mantém a câmera) */
    const pos0 = this.camera.position.clone(), tg0 = this.controls.target.clone(), fov0 = this.camera.fov;
    if (op.enquadrar !== false) {
      const el = this.est.modo === 'esforcos', fov = el ? FOV_PORTICO : fov0;
      const box = el ? this._caixaPortico() : this._caixaVisivel();
      if (box) {
        const e = this._calcEnquadramento(box, el ? new THREE.Vector3(0, 0, 1) : pos0.clone().sub(tg0), fov, W, H, true);
        this.camera.fov = fov; this.camera.updateProjectionMatrix();
        this.camera.position.copy(e.pos); this.camera.lookAt(e.alvo);
      }
    }
    this.camera.updateMatrixWorld();
    this.renderer.render(this.scene, this.camera);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const gr = ctx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, T.fundo[0]); gr.addColorStop(1, T.fundo[1]);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(this.renderer.domElement, 0, 0, W, H);
    const k = Math.max(1, Math.min(W, H) / 820);
    this._fotoRotulos(ctx, W, H, k);
    this._fotoMoldura(ctx, W, H, k);
    const url = cv.toDataURL('image/png');
    /* volta tudo */
    this.camera.position.copy(pos0); this.controls.target.copy(tg0); this.camera.lookAt(tg0); this.camera.fov = fov0;
    this.renderer.setPixelRatio(this.dpr); this.renderer.setSize(W0, H0, false);
    this.camera.aspect = W0 / H0; this.U.res.value.set(W0, H0); this._aplicarCentro(W0, H0);
    this.U.hover.value = hov; this.U.escala.value = esc0; this.U.sel.value = sel0;
    if (this.halo) this.halo.visible = true;
    if (temaFoto !== temaAnt) this._trocarTemaFoto(temaAnt);
    this.sujo = true;
    this._render();
    return url;
  }
  _trocarTemaFoto(nome) {
    /* troca leve (sem refazer a UI): cores da cena + geometria do modo no tema */
    this.temaNome = nome;
    const T = TEMAS[nome], f = linear(T.fundo[1]);
    this.U.fundo.value.r = f[0]; this.U.fundo.value.g = f[1]; this.U.fundo.value.b = f[2];
    this.hemi.color.copy(corLinear(T.ceu)); this.hemi.groundColor.copy(corLinear(T.chao)); this.hemi.intensity = T.luzHemi;
    this.sol.intensity = T.luzSol; this.fill.intensity = T.luzFill; this.chao.material.opacity = T.sombra;
    if (this.contato) this.contato.material.opacity = T.contato;
    this._montarGrade();
    if (this.cena && this.cena.grupo.parent) this.scene.remove(this.cena.grupo);
    const c = this._construirCena(); this.cena = c; this.scene.add(c.grupo);
    const f2 = c.grupo.getObjectByName('fantasma'); if (f2) f2.visible = this.est.def.indeformada;
    this._fotoItens = null;
  }
  _fonte() { try { return getComputedStyle(this.raiz).fontFamily || 'system-ui, sans-serif'; } catch (e) { return 'system-ui, sans-serif'; } }
  _fotoRotulos(ctx, W, H, k) {
    const T = TEMAS[this.temaNome], fonte = this._fonte();
    const lista = [];
    if (this.est.modo !== 'esforcos') for (const b of this.bolhas || []) lista.push({ pos: b.pos, texto: b.texto, classe: 'eixo', ancora: 'centro', prioridade: 5, grupo: b.grupo });
    for (const r of this.cena.rotulos || []) lista.push(r);
    const R = new Rotulos(null);
    R.itens = lista.map(x => Object.assign({}, x)).sort((a, b) => (b.prioridade || 0) - (a.prioridade || 0));
    const fs = 11.5 * k, fsS = 10.5 * k, pad = 6 * k;
    const medir = it => {
      if (it._m) return it._m;
      if (it.classe === 'eixo') return (it._m = { w: 22 * k, h: 22 * k });
      ctx.font = '600 ' + fs + 'px ' + fonte; let w = ctx.measureText(it.texto).width;
      if (it.sub) { ctx.font = '400 ' + fsS + 'px ' + fonte; w += 5 * k + ctx.measureText(it.sub).width; }
      if (it.cor) w += 13 * k;
      return (it._m = { w: w + 2 * pad, h: 19 * k });
    };
    const vis = R.layout(this.camera, W, H, this.U.escala.value, medir);
    for (const it of vis) {
      const m = medir(it), x = it.x, y = it.y;
      if (it.classe === 'eixo') {
        ctx.beginPath(); ctx.arc(x + m.w / 2, y + m.h / 2, m.w / 2 - 0.6 * k, 0, Math.PI * 2);
        ctx.fillStyle = T.painel; ctx.fill(); ctx.lineWidth = 1.2 * k; ctx.strokeStyle = T.tinta3; ctx.stroke();
        ctx.fillStyle = T.tinta2; ctx.font = '600 ' + (11 * k) + 'px ' + fonte; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(it.texto, x + m.w / 2, y + m.h / 2 + 0.5 * k); ctx.textAlign = 'left';
        continue;
      }
      ctx.fillStyle = T.painel; ctx.strokeStyle = it.classe === 'forte' ? T.tinta : 'rgba(15,39,64,.18)'; ctx.lineWidth = 1 * k;
      rr(ctx, x, y, m.w, m.h, 5 * k); ctx.fill(); ctx.stroke();
      let cx = x + pad; const cy = y + m.h / 2;
      if (it.cor) { ctx.beginPath(); ctx.arc(cx + 4 * k, cy, 4 * k, 0, Math.PI * 2); ctx.fillStyle = it.cor; ctx.fill(); cx += 13 * k; }
      ctx.textBaseline = 'middle'; ctx.fillStyle = T.tinta; ctx.font = '600 ' + fs + 'px ' + fonte; ctx.fillText(it.texto, cx, cy + 0.5 * k);
      if (it.sub) { cx += ctx.measureText(it.texto).width + 5 * k; ctx.fillStyle = T.tinta2; ctx.font = '400 ' + fsS + 'px ' + fonte; ctx.fillText(it.sub, cx, cy + 0.5 * k); }
    }
  }
  _fotoMoldura(ctx, W, H, k) {
    const T = TEMAS[this.temaNome], fonte = this._fonte(), D = this.D, m = this.est.modo, cn = this.cena;
    /* título e subtítulo */
    let tit = '', sub = '';
    if (m === 'aproveitamento') { tit = 'Aproveitamento das barras'; sub = this.est.apr.criterio === 'els' ? 'Serviço: deslocamento ÷ limite (NBR 8800, Anexo C)' : this.est.apr.criterio === 'elu' ? 'Estados-limite últimos: solicitante ÷ resistente' : 'Solicitante ÷ resistente — o que governa entre ELU e ELS'; }
    else if (m === 'deformada') { const C = D.combPorId.get(cn.comb) || {}; tit = 'Deformada · ' + cn.comb; sub = (C.tipo === 'caso' ? C.nome : D.ventoNomes.has(String(C.descricao)) ? C.descricao + ' (' + D.ventoNomes.get(String(C.descricao)) + ')' : (C.descricao || '')) + ' · deslocamentos ampliados ' + fmtFator(this.est.def.fator) + '× · máximo ' + fmtMm(cn.leituras.umax); }
    else if (m === 'flambagem') { const C = D.combPorId.get(cn.ent.combinacao) || {}; tit = 'Flambagem global · modo ' + (cn.mi + 1) + ' · ' + (cn.mi === 0 ? 'λcr' : 'λ' + (cn.mi + 1)) + ' = ' + fmt(cn.md.lambda, 2); sub = cn.md.lambda > 0 ? 'A combinação ' + cn.ent.combinacao + (C.descricao ? ' (' + C.descricao + ')' : '') + ' teria de ser multiplicada por ' + fmt(cn.md.lambda, 2) + ' para a estrutura flambar' : 'Modo com λ negativo (cargas invertidas)'; }
    else if (m === 'vento' && cn.vc) { tit = 'Vento · ' + cn.vc.idW + ' — ' + cn.vc.nome; sub = 'Pressão líquida por zona, p = (Cpe − Cpi)·q, com q = ' + fmt(cn.vc.q != null ? cn.vc.q : 0, 2) + ' kN/m² · NBR 6123'; }
    else if (m === 'esforcos') { const C = D.combPorId.get(this.est.esf.comb) || {}; tit = (cn.legenda ? cn.legenda.titulo : 'Esforços') + ' · pórtico ' + (this.est.esf.k + 1); sub = this.est.esf.comb + (C.descricao ? ' — ' + C.descricao : '') + ' · valores de cálculo'; }
    const x0 = 24 * k, y0 = 22 * k;
    ctx.textBaseline = 'alphabetic'; ctx.fillStyle = T.tinta; ctx.font = '600 ' + (19 * k) + 'px ' + fonte; ctx.fillText(tit, x0, y0 + 16 * k);
    ctx.fillStyle = T.tinta2; ctx.font = '400 ' + (13 * k) + 'px ' + fonte; ctx.fillText(sub, x0, y0 + 36 * k);
    if (D.aprovado != null && m === 'aproveitamento') {
      const ok = D.aprovado === true, inc = ok && D.incompleto, txt = inc ? 'Incompleto — não verificado: ' + D.nNaoVerif : (ok ? 'Aprovado' : 'Não aprovado — ' + D.falhas + (D.falhas === 1 ? ' limite excedido' : ' limites excedidos'));
      ctx.font = '600 ' + (13 * k) + 'px ' + fonte; const w = ctx.measureText(txt).width + 34 * k, xx = W - 24 * k - w, yy = y0;
      ctx.fillStyle = T.painel; ctx.strokeStyle = 'rgba(15,39,64,.16)'; ctx.lineWidth = k; rr(ctx, xx, yy, w, 28 * k, 7 * k); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(xx + 15 * k, yy + 14 * k, 7 * k, 0, Math.PI * 2); ctx.fillStyle = inc ? STATUS[2].cor : (ok ? STATUS[0].cor : STATUS[3].cor); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '700 ' + (9.5 * k) + 'px ' + fonte; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(inc ? '!' : (ok ? '✓' : '✕'), xx + 15 * k, yy + 14.5 * k);
      ctx.textAlign = 'left'; ctx.fillStyle = T.tinta; ctx.font = '600 ' + (13 * k) + 'px ' + fonte; ctx.fillText(txt, xx + 27 * k, yy + 14.5 * k);
    }
    /* legenda */
    const L = cn.legenda; if (!L) return;
    const linhas = [];
    if (L.tipo === 'status') { STATUS.forEach((s, i) => linhas.push({ cor: s.cor, txt: s.faixa + ' · ' + s.nome, n: String(L.contagens[i] || 0) })); if (L.secundarias && !L.secComVerif) linhas.push({ cor: T.secundaria, txt: 'Terças/travessas (à parte)', n: String(L.secundarias) }); }
    else if (L.tipo === 'esforco') { if (L.desprezivel) linhas.push({ txt: 'Desprezível neste pórtico' }); else if (L.qual === 'N') { linhas.push({ cor: T.tracao, txt: 'tração (+)' }); linhas.push({ cor: T.compressao, txt: 'compressão (' + MENOS + ')' }); } else linhas.push({ cor: T.diagrama, txt: L.qual === 'M' ? 'desenhado do lado tracionado' : L.qual === 'V' ? 'no plano do pórtico' : 'sinal pelos eixos locais' }); }
    const lw = 250 * k, lh = (L.tipo === 'rampa' || L.tipo === 'vento' ? 62 : 30 + linhas.length * 18) * k, lx = 24 * k, ly = H - lh - 22 * k;
    ctx.fillStyle = T.painel; ctx.strokeStyle = 'rgba(15,39,64,.14)'; ctx.lineWidth = k; rr(ctx, lx, ly, lw, lh, 8 * k); ctx.fill(); ctx.stroke();
    ctx.textBaseline = 'alphabetic'; ctx.fillStyle = T.tinta3; ctx.font = '600 ' + (10.5 * k) + 'px ' + fonte;
    ctx.fillText(L.titulo.toUpperCase(), lx + 12 * k, ly + 19 * k, lw - 24 * k);
    if (L.tipo === 'vento') {
      const g = ctx.createLinearGradient(lx + 12 * k, 0, lx + lw - 12 * k, 0); g.addColorStop(0, T.compressao); g.addColorStop(0.5, T.secundaria); g.addColorStop(1, T.tracao);
      ctx.fillStyle = g; rr(ctx, lx + 12 * k, ly + 28 * k, lw - 24 * k, 10 * k, 3 * k); ctx.fill();
      ctx.fillStyle = T.tinta2; ctx.font = '400 ' + (10.5 * k) + 'px ' + fonte;
      ctx.textAlign = 'left'; ctx.fillText('sucção ' + fmt(L.pmin, 2), lx + 12 * k, ly + 53 * k);
      ctx.textAlign = 'center'; ctx.fillText('0', lx + lw / 2, ly + 53 * k);
      ctx.textAlign = 'right'; ctx.fillText('pressão +' + fmt(L.pmax, 2), lx + lw - 12 * k, ly + 53 * k); ctx.textAlign = 'left';
    } else if (L.tipo === 'rampa') {
      const g = ctx.createLinearGradient(lx + 12 * k, 0, lx + lw - 12 * k, 0); L.rampa.forEach((c, i) => g.addColorStop(i / (L.rampa.length - 1), c));
      ctx.fillStyle = g; rr(ctx, lx + 12 * k, ly + 28 * k, lw - 24 * k, 10 * k, 3 * k); ctx.fill();
      const mx = L.max * L.fator, f = v => (L.relativa ? fmt(v, 1) : fmt(v, mx >= 100 ? 0 : 1));
      ctx.fillStyle = T.tinta2; ctx.font = '400 ' + (10.5 * k) + 'px ' + fonte;
      ctx.textAlign = 'left'; ctx.fillText(f(0), lx + 12 * k, ly + 53 * k);
      ctx.textAlign = 'center'; ctx.fillText(f(mx / 2), lx + lw / 2, ly + 53 * k);
      ctx.textAlign = 'right'; ctx.fillText(f(mx) + (L.unidade ? ' ' + L.unidade : ''), lx + lw - 12 * k, ly + 53 * k); ctx.textAlign = 'left';
    } else {
      linhas.forEach((l, i) => {
        const yy = ly + (36 + i * 18) * k;
        if (l.cor) { ctx.fillStyle = l.cor; rr(ctx, lx + 12 * k, yy - 6 * k, 12 * k, 12 * k, 3 * k); ctx.fill(); }
        ctx.fillStyle = T.tinta; ctx.font = '400 ' + (12 * k) + 'px ' + fonte; ctx.textBaseline = 'middle'; ctx.fillText(l.txt, lx + (l.cor ? 31 : 12) * k, yy);
        if (l.n) { ctx.textAlign = 'right'; ctx.fillStyle = T.tinta2; ctx.fillText(l.n, lx + lw - 12 * k, yy); ctx.textAlign = 'left'; }
      });
      ctx.textBaseline = 'alphabetic';
    }
  }

  /* ============================================================== API */
  modo(nome) {
    if (nome === undefined) return this.est.modo;
    if (!this.cena && !this.D.ok) return this.est.modo;
    const n = normalizarModo(nome); if (!n) return this.est.modo;
    this._trocarModo(n);
    return this.est.modo;
  }
  combinacao(id) {
    const m = this.est.modo, D = this.D;
    if (id === undefined) return m === 'deformada' ? this.est.def.comb : m === 'esforcos' ? this.est.esf.comb : m === 'flambagem' ? (D.flamb[this.est.fla.ent] || {}).combinacao : m === 'vento' ? ((D.ventoLista[this.est.ven.caso] || {}).idW || null) : null;
    id = String(id);
    if (m === 'vento') { const i = D.ventoLista.findIndex(v => v.idW === id || v.id === id); if (i < 0) return null; this.est.ven.caso = i; this._trocarModo(m, true); this.enquadrar(); return D.ventoLista[i].idW; }
    if (m === 'flambagem') { const i = D.flamb.findIndex(f => f.combinacao === id); if (i < 0) return null; this.est.fla.ent = i; this.est.fla.modo = 0; this.est.fla.amp = null; this._trocarModo(m, true); return id; }
    if (!D.combPorId.has(id)) return null;
    if (m === 'esforcos') this.est.esf.comb = id;
    else if (m === 'deformada') { this.est.def.comb = id; this.est.def.fator = null; }
    else { this.est.def.comb = id; this.est.def.fator = null; this.est.esf.comb = id; return id; }   /* aproveitamento: vale para quando abrir Deformada/Esforços */
    this._trocarModo(this.est.modo, true);
    return id;
  }
  escala(f) {
    const m = this.est.modo;
    if (f === undefined) return m === 'deformada' ? this.est.def.fator : m === 'flambagem' ? this.est.fla.amp : 0;
    const auto = this.cena ? this.cena.escalaAuto : null;
    const v = f === 'auto' ? auto : Number(f);
    if (!(v >= 0)) return this.escala();
    if (m === 'deformada') { this.est.def.fator = v; this.U.escala.value = v; }
    else if (m === 'flambagem') { this.est.fla.amp = v; if (!this.est.fla.animar) this.U.escala.value = v; }
    else return 0;
    this._montarUI(); if (this.selChave >= 0) this._mostrarCartao(this.selChave);
    this.sujo = true;
    return v;
  }
  _chaveDe(id) {
    if (id == null) return -1;
    const D = this.D, s = String(id), M = D.memPorId.get(s); if (M) return M.chave;
    const B = D.barPorId.get(s); return B ? B.chave : -1;
  }
  /* halo do selecionado: linha grossa e translúcida no eixo (deforma junto), vista através das outras barras */
  _realce() {
    if (this.halo) { this.scene.remove(this.halo); this.halo.geometry.dispose(); this.halo.material.dispose(); this.halo = null; }
    const ch = this.selChave; if (ch < 0 || !this.cena || !this.cena.alvos) return;
    const segs = [], c = linear(TEMAS[this.temaNome].realce);
    for (const a of this.cena.alvos) if (a.chave === ch) for (let i = 0; i < a.pts.length - 1; i++) segs.push({ a: a.pts[i], b: a.pts[i + 1], ca: c, cb: c, da: a.des ? a.des[i] : null, db: a.des ? a.des[i + 1] : null });
    this.halo = this._malhaLinhas(segs, { largura: 9, opacidade: 0.26, semRealce: true, semProfundidade: true, ordem: 20 });
    if (this.halo) this.scene.add(this.halo);
  }
  selecionar(id, op) {
    op = op || {};
    if (!this.D.ok) return null;
    let ch = this._chaveDe(id);
    if (op.toggle && ch === this.selChave) ch = -1;
    this.selChave = ch; this.U.sel.value = ch;
    this._realce();
    if (this.cena) this._definirRotulos();
    if (ch >= 0) { this._mostrarCartao(ch); if (op.enquadrar) this._enquadrarAlvo(ch); }
    else this._esconderCartao();
    this.sujo = true;
    const A = this._alvo(ch);
    if (typeof this.op.aoSelecionar === 'function') { try { this.op.aoSelecionar(A ? A.ref.id : null, A ? { tipo: A.tipo } : null); } catch (e) {} }
    return A ? A.ref.id : null;
  }
  _enquadrarAlvo(ch) {
    const box = new THREE.Box3(), s = this.U.escala.value;
    for (const a of this.cena.alvos) if (a.chave === ch) a.pts.forEach((p, i) => { const d = a.des && a.des[i] ? esc(a.des[i], s) : [0, 0, 0]; box.expandByPoint(new THREE.Vector3(p[0] + d[0], p[1] + d[1], p[2] + d[2])); });
    if (box.isEmpty()) return;
    const sz = box.getSize(new THREE.Vector3()).length(); box.expandByScalar(Math.max(1.5, sz * 0.6));
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const e = this._calcEnquadramento(box, dir, this.camera.fov, this.W, this.H);
    this._voar(e.pos, e.alvo, false, this.camera.fov);
  }
  esforco(nome) {
    if (nome === undefined) return this.est.esf.esforco;
    const n = String(nome).toUpperCase(); if (['N', 'V', 'M', 'T'].indexOf(n) < 0) return this.est.esf.esforco;
    this.est.esf.esforco = n;
    if (this.est.modo !== 'esforcos') { this._trocarModo('esforcos'); return n; }
    this._trocarModo('esforcos', true); return n;
  }
  portico(k) {
    if (k === undefined) return this.est.esf.k;
    k = Number(k); if (!this.D.porticos.some(p => p.k === k)) return this.est.esf.k;
    const mudouComb = this.est.esf.comb === this._combGovernaPortico(this.est.esf.k);
    this.est.esf.k = k;
    if (mudouComb) this.est.esf.comb = this._combGovernaPortico(k);
    if (this.est.modo !== 'esforcos') this._trocarModo('esforcos');
    else { this._trocarModo('esforcos', true); this._cameraPortico(true); }
    return k;
  }
  animar(sim) {
    if (sim === undefined) return this.est.fla.animar;
    this.est.fla.animar = !!sim;
    if (!sim && this.est.modo === 'flambagem') this.U.escala.value = this.est.fla.amp || 0;
    if (sim) this.t0 = performance.now() - 1700 / 4;
    if (this.est.modo === 'flambagem') this._montarUI();
    if (this.selChave >= 0) this._mostrarCartao(this.selChave);
    this.sujo = true;
    return this.est.fla.animar;
  }
  ponto(id) {
    const ch = this._chaveDe(id); if (ch < 0 || !this.cena) return null;
    const alvos = this.cena.alvos.filter(a => a.chave === ch); if (!alvos.length) return null;
    const a = alvos[Math.floor(alvos.length / 2)], i = Math.floor((a.pts.length - 1) / 2), s = this.U.escala.value;
    const p0 = a.des && a.des[i] ? soma(a.pts[i], esc(a.des[i], s)) : a.pts[i], p1 = a.des && a.des[i + 1] ? soma(a.pts[i + 1], esc(a.des[i + 1], s)) : a.pts[i + 1] || a.pts[i];
    const v = new THREE.Vector3(...esc(soma(p0, p1), 0.5)).project(this.camera);
    return { x: (v.x + 1) / 2 * this.W, y: (1 - v.y) / 2 * this.H };
  }
  estado() {
    const inf = this.renderer ? this.renderer.info.render : {};
    return { versao: VERSAO, modo: this.est.modo, combinacao: this.combinacao(), escala: this.escala(), portico: this.est.esf.k, esforco: this.est.esf.esforco,
      selecionado: this._alvo(this.selChave) ? this._alvo(this.selChave).ref.id : null, barras: this.D.barras ? this.D.barras.length : 0,
      drawCalls: inf.calls, triangulos: inf.triangles, tema: this.temaNome, ok: this.D.ok };
  }
  destruir() {
    if (this.destruida) return;
    this.destruida = true;
    cancelAnimationFrame(this.raf);
    if (this._rafHover) cancelAnimationFrame(this._rafHover);
    for (const [a, ev, fn, op] of this._ev || []) a.removeEventListener(ev, fn, op);
    if (this.ro) this.ro.disconnect();
    if (this.mo) this.mo.disconnect();
    if (this.rotulos) this.rotulos.limpar();
    this._limparCache();
    if (this.scene) this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); });
    if (this.controls) this.controls.dispose();
    if (this.renderer) { this.renderer.dispose(); try { this.renderer.forceContextLoss(); } catch (e) {} }
    if (this.raiz && this.raiz.parentNode) this.raiz.parentNode.removeChild(this.raiz);
  }
  controle() {
    const v = this;
    return {
      modo: n => v.modo(n), combinacao: id => v.combinacao(id), escala: f => v.escala(f), selecionar: (id, op) => v.selecionar(id, op),
      foto: (w, hh, op) => v.foto(w, hh, op), destruir: () => v.destruir(),
      esforco: n => v.esforco(n), portico: k => v.portico(k), vista: n => v.vista(n), enquadrar: () => v.enquadrar(), animar: s => v.animar(s),
      ponto: id => v.ponto(id), estado: () => v.estado(), versao: VERSAO,
      /* só para teste/e2e: a instância interna */
      get _vista() { return v; }
    };
  }
}
function rotuloTipo(t) { return t === 'ELU' ? 'última' : t === 'ELS-rara' ? 'serviço, rara' : t === 'ELS-qp' ? 'serviço, quase permanente' : /^ELS/.test(t) ? 'serviço' : t === 'caso' ? 'caso característico' : t; }
function rr(ctx, x, y, w, hh, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

/* ================================================================ ENTRADA */
function abrir(container, r, opcoes) {
  if (!container || !container.appendChild) throw new Error('MetalCalcVista.abrir: container inválido.');
  const v = new Vista(container, r, opcoes);
  return v.controle();
}
const MetalCalcVista = { abrir, versao: VERSAO, _int: { prepararDados, perfilDe, contornoDe, statusDe } };
if (typeof window !== 'undefined') window.MetalCalcVista = MetalCalcVista;
export default MetalCalcVista;
export { abrir };
