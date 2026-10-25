/* =====================================================================
 * bimcenamat.js — MATERIAIS EDITÁVEIS do OrçaPRO Cena (módulo ES, três r186 WebGPU;
 * importado por js/bimcenaui.js só quando a Cena abre).
 *
 * A pessoa clica numa superfície (ou escolhe na lista) e mexe em cor, rugosidade, metal, verniz,
 * relevo e escala da textura, e vê na hora — sem refazer a cena nem a luz. O que ela mexeu volta
 * como `{ <idMaterialRender>: {cor, rugosidade, metal, verniz, relevo, escala} }` (BimCena.estado.materiais)
 * e é reaplicado ao reabrir.
 *
 * COMO CADA CAMPO É APLICADO (a cena tem três famílias de material; cada uma tem um caminho):
 *   · liso (pintura, vidro, metal sem foto): `m.color/roughness/metalness` direto — uniforme, sem recompilar.
 *   · com foto 1K (mapa da biblioteca CC0): `m.color` é a TINTA que multiplica a foto; a cor pedida vira
 *     tinta = cor original da tinta × (alvo ÷ cor do material). `m.roughness` multiplica o mapa de rugosidade.
 *   · com foto 2K (grafo do js/bimmat2k.js: colorNode/roughnessNode/normalNode já construídos): a cor entra como um
 *     MULTIPLICADOR (uniform vec3) em volta do colorNode, e a rugosidade como outro em volta do roughnessNode.
 *     Criar esse envoltório recompila o material UMA vez (centenas de ms); depois é só mudar o uniform.
 *
 * ⚠ A ORIGEM VALE POR MATERIAL DE RENDER, não por peça: todas as peças com "madeira_carvalho" mudam juntas.
 *   É o comportamento esperado de "editar o material" e é o que o JSON consegue guardar com estabilidade
 *   (o índice do grupo muda quando o modelo muda; o id do material de render não).
 * ⚠ O relevo e a escala só existem onde há mapa (1K). No 2K o grafo guarda a escala dentro das UVs: o campo vem
 *   marcado como indisponível (`cap`) e a tela desabilita o controle em vez de fingir que funciona.
 * ===================================================================== */
import * as CORE from '../bim/vendor/jsm/pathtracer/three/three.core.js';
import * as GPU from '../bim/vendor/jsm/pathtracer/three/three.webgpu.js';
import { uniform, vec3, float } from '../bim/vendor/jsm/pathtracer/three/three.tsl.js';

const THREE = Object.assign({}, CORE, GPU);

function linearDe(srgb) { return srgb.map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))); }
function srgbDe(lin) { return lin.map((c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)); }
function hexDe(srgb) { return '#' + srgb.map((c) => ('0' + Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16)).slice(-2)).join(''); }
function srgbDoHex(h) { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '')); return m ? [1, 3, 5].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255) : null; }

/* PURO (testado em node): o multiplicador de tinta que leva a cor ORIGINAL do material à cor PEDIDA, canal a canal em linear.
   Preso em 0,02..8 — mais que isso é divisão por uma cor quase preta (o "azul sobre madeira escura" estourava em branco). */
export function razaoDeCor(origLin, alvoLin) {
  return [0, 1, 2].map((i) => Math.max(0.02, Math.min(8, alvoLin[i] / Math.max(0.01, origLin[i]))));
}

export class MateriaisCena {
  constructor(vivo) {
    this.vivo = vivo; this.itens = new Map();   // id → { id, nome, ms:[{m, p, orig}], cap, valores, usaTinta }
    this._monta = false;
  }

  /* junta os materiais da cena por id de render. As malhas do entorno e dos objetos soltos não entram (o objeto tem os seus). */
  varrer() {
    const v = this.vivo, sc = v.scene; this.itens.clear(); if (!sc) return this;
    const cm = v._cenaMats, parm = new Map();
    if (cm && cm.mats) cm.mats.forEach((m, i) => { if (m && cm.params[i]) parm.set(m, cm.params[i]); });
    const RM = typeof window !== 'undefined' ? window.RenderMat : null;
    sc.traverse((o) => {
      if (!o.isMesh || !o.material || (o.userData && (o.userData.entorno || o.userData.cenaObj || o.userData.verso))) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material, id = m && m.userData && m.userData.id;
      if (!id || id === 'espelho' || m.userData.planar) return;
      let it = this.itens.get(id);
      if (!it) { it = { id, nome: id, ms: [], seen: new Set() }; this.itens.set(id, it); }
      if (it.seen.has(m)) return; it.seen.add(m);
      const p = parm.get(m) || null;
      if (p && p.nome && it.nome === id) it.nome = p.nome;
      if (RM && it.nome === id && RM.material) { try { const d = RM.material(id); if (d && d.nome) it.nome = d.nome; } catch (e) { /* sem nome bonito */ } }
      it.ms.push({ m, p, orig: null });
    });
    this.itens.forEach((it) => this._capacidades(it));
    return this;
  }
  _capacidades(it) {
    const tem = (f) => it.ms.some(f);
    const textura = tem((x) => x.p && x.p.textura && x.p.textura.tipo === 'cc0');
    const dois = tem((x) => x.m.userData && x.m.userData.mat2k);
    const rejunte = tem((x) => x.p && x.p.textura && x.p.textura.tipo === 'rejunte');
    it.textura = textura ? ((it.ms.find((x) => x.p && x.p.textura && x.p.textura.slug) || {}).p || {}).textura.slug : '';
    it.cap = {
      cor: !rejunte, rugosidade: true, metal: true, verniz: true,
      relevo: textura && !dois, escala: textura && !dois
    };
    it.vidro = tem((x) => x.m.transmission > 0);
    const x0 = it.ms[0];
    it.valores = { cor: hexDe(x0.p ? x0.p.corSrgb : srgbDe([x0.m.color.r, x0.m.color.g, x0.m.color.b])), rugosidade: +(x0.p ? x0.p.rugosidade : x0.m.roughness).toFixed(3),
      metal: +(x0.p ? x0.p.metalicidade : x0.m.metalness).toFixed(3), verniz: +(x0.m.clearcoat || 0).toFixed(3), relevo: x0.p && x0.p.relevo != null ? +x0.p.relevo : 0, escala: 1 };
  }

  lista() {
    if (!this.itens.size) this.varrer();
    const out = [];
    this.itens.forEach((it) => out.push({ id: it.id, nome: it.nome, textura: it.textura, cap: it.cap, vidro: it.vidro, n: it.ms.length, valores: Object.assign({}, it.valores), editado: !!it.editado }));
    return out.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  _guardar(x) {
    if (x.orig) return x.orig; const m = x.m;
    x.orig = { cor: m.color.clone(), rug: m.roughness, metal: m.metalness, coat: m.clearcoat || 0, ns: m.normalScale ? m.normalScale.clone() : null, repeat: null,
      colorNode: m.colorNode || null, roughnessNode: m.roughnessNode || null };
    return x.orig;
  }

  /* aplica props (subconjunto de {cor, rugosidade, metal, verniz, relevo, escala}) ao material de render `id`.
     Devolve { ok, aplicado:[campos], ignorado:[campos], recompilou:bool }. Nunca lança. */
  aplicar(id, props) {
    if (!this.itens.size) this.varrer();
    const it = this.itens.get(id); if (!it) return { ok: false, motivo: 'material ' + id + ' não está na cena' };
    const r = { ok: true, aplicado: [], ignorado: [], recompilou: false }, q = props || {};
    for (const x of it.ms) {
      try {
        const m = x.m, o = this._guardar(x), p = x.p, dois = !!(m.userData && m.userData.mat2k);
        if (q.cor !== undefined) {
          const alvo = srgbDoHex(q.cor);
          if (!alvo || !it.cap.cor) { if (!r.ignorado.includes('cor')) r.ignorado.push('cor'); }
          else {
            const alvoLin = linearDe(alvo), baseLin = p ? p.cor : [o.cor.r, o.cor.g, o.cor.b];
            const razao = razaoDeCor(baseLin, alvoLin);
            if (dois) {
              if (!x.uTinta) {
                x.uTinta = uniform(new THREE.Vector3(1, 1, 1));
                if (m.colorNode) { m.colorNode = m.colorNode.mul(x.uTinta); m.needsUpdate = true; r.recompilou = true; }
              }
              x.uTinta.value.set(razao[0], razao[1], razao[2]);
            } else if (p && p.textura && p.textura.tipo === 'cc0') {
              m.color.setRGB(Math.min(8, o.cor.r * razao[0]), Math.min(8, o.cor.g * razao[1]), Math.min(8, o.cor.b * razao[2]), THREE.LinearSRGBColorSpace);
            } else m.color.setRGB(alvoLin[0], alvoLin[1], alvoLin[2], THREE.LinearSRGBColorSpace);
            if (!r.aplicado.includes('cor')) r.aplicado.push('cor');
          }
        }
        if (q.rugosidade !== undefined) {
          const t = Math.max(0, Math.min(1, +q.rugosidade));
          if (dois && m.roughnessNode) {
            if (!x.uRug) { x.uRug = uniform(1); m.roughnessNode = (o.roughnessNode || m.roughnessNode).mul(x.uRug); m.needsUpdate = true; r.recompilou = true; }
            x.uRug.value = Math.max(0.05, Math.min(8, t / Math.max(0.05, p ? p.rugosidade : o.rug)));
          } else m.roughness = t;
          if (!r.aplicado.includes('rugosidade')) r.aplicado.push('rugosidade');
        }
        if (q.metal !== undefined) { m.metalness = Math.max(0, Math.min(1, +q.metal)); if (!r.aplicado.includes('metal')) r.aplicado.push('metal'); }
        if (q.verniz !== undefined) {
          const t = Math.max(0, Math.min(1, +q.verniz)), antes = (m.clearcoat || 0) > 0;
          m.clearcoat = t; if (m.clearcoatRoughness == null || m.clearcoatRoughness === 0) m.clearcoatRoughness = 0.08;
          if (antes !== t > 0) { m.needsUpdate = true; r.recompilou = true; }
          if (!r.aplicado.includes('verniz')) r.aplicado.push('verniz');
        }
        if (q.relevo !== undefined) {
          if (it.cap.relevo && m.normalMap && m.normalScale) { const t = Math.max(0, Math.min(2, +q.relevo)); m.normalScale.set(t, t); if (!r.aplicado.includes('relevo')) r.aplicado.push('relevo'); }
          else if (!r.ignorado.includes('relevo')) r.ignorado.push('relevo');
        }
        if (q.escala !== undefined) {
          if (it.cap.escala && m.map) {
            const k = Math.max(0.25, Math.min(4, +q.escala));
            [m.map, m.normalMap, m.roughnessMap].forEach((t) => {
              if (!t) return; if (!t.userData.cenaRep0) t.userData.cenaRep0 = [t.repeat.x, t.repeat.y];
              t.repeat.set(t.userData.cenaRep0[0] / k, t.userData.cenaRep0[1] / k);
            });
            if (!r.aplicado.includes('escala')) r.aplicado.push('escala');
          } else if (!r.ignorado.includes('escala')) r.ignorado.push('escala');
        }
      } catch (e) { r.ok = false; r.motivo = String(e && e.message || e); try { console.warn('material da cena:', e); } catch (x) { /* sem console */ } }
    }
    it.editado = true;
    Object.keys(q).forEach((k) => { if (r.aplicado.includes(k)) it.valores[k] = q[k]; });
    this.vivo.mexeu();
    return r;
  }

  /* o que o motor tem de fato (para teste e suporte): a cor do 1º material do id e, no 2K, a razão de tinta que o envolve */
  inspecionar(id) {
    const it = this.itens.get(id); if (!it || !it.ms.length) return null;
    const x = it.ms[0], m = x.m;
    return { cor: m.color.toArray(), tinta: x.uTinta ? x.uTinta.value.toArray() : null, rugosidade: m.roughness, rugK: x.uRug ? x.uRug.value : null, metal: m.metalness, verniz: m.clearcoat || 0, editado: !!it.editado, dois: !!(m.userData && m.userData.mat2k) };
  }

  /* volta ao que o projeto tinha */
  restaurar(id) {
    const it = this.itens.get(id); if (!it) return false;
    it.ms.forEach((x) => {
      const o = x.orig; if (!o) return; const m = x.m;
      m.color.copy(o.cor); m.roughness = o.rug; m.metalness = o.metal;
      if ((m.clearcoat || 0) > 0 !== o.coat > 0) m.needsUpdate = true;
      m.clearcoat = o.coat; if (o.ns && m.normalScale) m.normalScale.copy(o.ns);
      if (x.uTinta) x.uTinta.value.set(1, 1, 1);
      if (x.uRug) x.uRug.value = 1;
      [m.map, m.normalMap, m.roughnessMap].forEach((t) => { if (t && t.userData.cenaRep0) t.repeat.set(t.userData.cenaRep0[0], t.userData.cenaRep0[1]); });
    });
    it.editado = false; this._capacidades(it); this.vivo.mexeu(); return true;
  }

  /* reaplica o que está no estado e restaura o que saiu dele (a lista inteira: o desfazer chega aqui) */
  sincronizar(mapa) {
    if (!this.itens.size) this.varrer();
    const m = mapa || {}, rel = {};
    this.itens.forEach((it, id) => {
      if (m[id]) { rel[id] = this.aplicar(id, m[id]); }
      else if (it.editado) { this.restaurar(id); }
    });
    return rel;
  }

  /* o material de render sob um ponto da tela (fx, fy ∈ 0..1, canto de cima) — o clique "editar este material" */
  materialSob(fx, fy) {
    const v = this.vivo; if (!v.scene || !v.camera) return null;
    const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(fx * 2 - 1, 1 - fy * 2), v.camera);
    const alvos = []; v.scene.traverse((o) => {
      if (!o.isMesh || !o.visible || o.isInstancedMesh || !o.material || (o.userData && (o.userData.entorno || o.userData.cenaObj || o.userData.verso))) return;
      alvos.push(o);
    });
    const hs = rc.intersectObjects(alvos, false);
    for (const h of hs) { const m = Array.isArray(h.object.material) ? h.object.material[0] : h.object.material, id = m && m.userData && m.userData.id; if (id && id !== 'espelho') return id; }
    return null;
  }
  descartar() { this.itens.clear(); }
}
