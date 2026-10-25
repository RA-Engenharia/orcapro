/* =====================================================================
 * bimcenaobjsmotor.js — os OBJETOS DA CENA dentro do render ao vivo (OrçaPRO Cena, Entrega 1, 23/10/2026)
 *
 * Módulo ES, importado por js/bimrendervivo.js (`this.objetos = new ObjetosCena(this)`). O que ESTÁ nos objetos
 * (catálogo, geometria, luz) é js/bimcenaobjs.js — puro e testado em node; aqui só se coloca isso na cena three r186.
 *
 * ⚠ OBJETO DA CENA ≠ PEÇA DO PROJETO. Entram na cena sem recalcular a luz assada nem as sondas:
 *    · as malhas levam `userData.entorno = true` (fora do cálculo da luz e da chave do cache — arrastar um sofá não
 *      invalida 40 s de luz) e `userData.cenaObj = <id>`; elas RECEBEM a luz das sondas (sem uv1) e a sombra do sol,
 *      e PROJETAM sombra do sol (o mapa do sol é refeito ao mudar algo: shadow.needsUpdate). Não escurecem a luz
 *      indireta já assada — o que é a escolha certa para mobiliário solto (um sofá não fecha a sala).
 *    · luminária de objeto acende SÓ no tempo real (limite de 12 do motor, ver _luzesDoDia): não entra no atlas nem
 *      nos comandos (circuitos) do projeto. info().luzes.noAtlas diz isso à tela. O 1º ponto de luz novo recompila os
 *      materiais (a quantidade de luzes faz parte do shader) — alguns segundos, uma vez.
 *    · árvores/arbustos plantados à mão vão ao Entorno (js/bimentorno.js, `definirManual`): LOD, vento e sombra do jeito
 *      das automáticas; só os baldes de instâncias são refeitos, a grama não.
 *  Materiais: o MESMO `vivo._material(p)` da cena (mesmo ambiente de sondas, mesmas texturas), reaproveitados por
 *  (id, cor, textura); objeto sempre no 1K (sem 2K): não mexe na fila de materiais 2K nem estoura o teto de 16 texturas.
 *
 * COORDENADAS: a API recebe/devolve BIM (metros, y para cima); o motor trabalha em BIM − origem (vivo._origemCena).
 * ===================================================================== */
import * as CORE from '../bim/vendor/jsm/pathtracer/three/three.core.js';
import * as GPU from '../bim/vendor/jsm/pathtracer/three/three.webgpu.js';

const THREE = Object.assign({}, CORE, GPU);
const COR_SEL = 0x34d399;

function corLin(c) { return new THREE.Color().setRGB(c[0], c[1], c[2], THREE.LinearSRGBColorSpace); }
function B() { return typeof window !== 'undefined' ? window.BimCenaObjs : null; }

export class ObjetosCena {
  constructor(vivo) {
    this.vivo = vivo;
    this.grupo = new THREE.Group(); this.grupo.name = 'objetos-cena';
    this.itens = new Map();        // id → { sig, gkey, meshes:[], luzes:[], arvore:bool, obj }
    this.geos = new Map();         // gkey → { geos:[{geo, matKey}], refs }
    this.mats = new Map();         // chave do material → material three
    this._semeado = false;
    this._sel = null; this._caixaSel = null;
    this.ultimo = null;
  }

  /* o motor já tem materiais da cena: as chaves deles entram no cache para um objeto da mesma pintura reaproveitar (e não compilar de novo) */
  _semear() {
    if (this._semeado) return; this._semeado = true;
    const v = this.vivo, cm = v._cenaMats;
    if (!cm || !cm.params) return;
    cm.params.forEach((p, i) => { if (p && cm.mats[i]) this.mats.set(this._chaveMat(p), cm.mats[i]); });
  }
  _chaveMat(p) {
    const tx = p.textura;
    return JSON.stringify([p.id, (p.corSrgb || p.cor || []).map((x) => Math.round(x * 1000)), tx ? [tx.slug || tx.tipo, tx.tinta ? tx.tinta.map((x) => Math.round(x * 1000)) : 0, tx.escala || 0] : 0]);
  }
  _material(p) {
    const k = this._chaveMat(p);
    let m = this.mats.get(k);
    if (!m) {
      /* sem `slug` o registro do 2K (mat2k.registrar) recusa e o material fica no 1K que o próprio _material monta */
      const q = Object.assign({}, p); if (q.textura && q.textura.slug) { q.textura = Object.assign({}, q.textura); delete q.textura.slug; }
      m = this.vivo._material(q); m.userData.cenaObj = true; this.mats.set(k, m);
    }
    return m;
  }
  /* o contexto do BimCenaObjs: o mesmo caminho nome → material de render → parâmetros que o BimRender usa para as peças do projeto */
  _ctx() {
    const RM = window.RenderMat, BR = window.BimRender;
    return {
      origem: [0, 0, 0], RM,
      mapear: (pc) => RM.mapear(pc, {}),
      params: (id, peca, nome) => (BR && BR._params ? BR._params(id, peca, nome) : RM.parametros(id, { cor: peca && peca.cor, nome }))
    };
  }
  _origem() { const o = this.vivo._origemCena; return o && o.length >= 3 ? o : [0, 0, 0]; }

  /* SINCRONIZAR: objetos = lista do JSON da cena ([{id,item,pos,rotY,esc,par,comando}], pos em BIM). Diff por id.
     Devolve { ok, motivo?, n, triangulos, criados, atualizados, removidos, arvores, luzes, recusados:[{id,motivo}] }. */
  async sincronizar(objetos, opc) {
    opc = opc || {}; if (Array.isArray(objetos)) this._lista = objetos;
    const v = this.vivo, Bc = B(); if (!Bc) throw new Error('js/bimcenaobjs.js não carregou');
    if (!v.scene) return { ok: false, motivo: 'a cena ainda não existe' };
    this._semear();
    if (!this.grupo.parent) v.scene.add(this.grupo);
    const lista = (objetos || []).map((o) => Bc.normalizar(o));
    const orc = Bc.orcamento(lista);
    if (!orc.ok) return { ok: false, motivo: orc.motivo, n: orc.n, triangulos: orc.triangulos };
    const O = this._origem(), r = { ok: true, criados: 0, atualizados: 0, removidos: 0, recusados: [], luzes: { total: 0, acesas: 0, semFotometria: [] } };
    const ids = new Set(lista.map((o) => o.id));
    this.itens.forEach((it, id) => { if (!ids.has(id)) { this._remover(id); r.removidos++; } });
    const arvores = [];
    for (const o of lista) {
      const it = Bc.item(o.item);
      if (!it) { r.recusados.push({ id: o.id, motivo: 'item desconhecido: ' + o.item }); continue; }
      const px = o.pos[0] - O[0], py = o.pos[1] - O[1], pz = o.pos[2] - O[2];
      if (it.tipo === 'arvore') {
        arvores.push({ sp: it.ref.sp, x: px, y: py, z: pz, yaw: o.rotY, esc: o.esc, ref: o.id });
        const ja = this.itens.get(o.id); if (!ja) r.criados++; else r.atualizados++;
        this.itens.set(o.id, { arvore: true, sig: JSON.stringify(o), obj: o, meshes: [], luzes: [] });
        continue;
      }
      const gkey = o.item + '|' + JSON.stringify(o.par), sig = JSON.stringify([o.item, o.pos, o.rotY, o.esc, o.par, o.comando]);
      let reg = this.itens.get(o.id);
      if (reg && reg.sig === sig && !opc.forcar) continue;
      if (reg && reg.gkey !== gkey) { this._remover(o.id); reg = null; }
      if (!reg) {
        const g = this._geometria(it, o, gkey);
        if (!g.ok) { r.recusados.push({ id: o.id, motivo: g.motivo }); continue; }
        reg = { gkey, meshes: [], luzes: [], arvore: false };
        const geoE = this.geos.get(gkey); geoE.refs++;
        geoE.geos.forEach((ge) => {
          const ms = new THREE.Mesh(ge.geo, this._material(ge.params));
          ms.castShadow = !(ms.material.transmission > 0); ms.receiveShadow = true;
          ms.userData.entorno = true; ms.userData.cenaObj = o.id; ms.matrixAutoUpdate = true;
          /* ⚠ INVISÍVEL ATÉ AS TEXTURAS CHEGAREM: o laço de desenho já está rodando; uma malha nova com o mapa ainda sem imagem derruba o
             quadro ("Cannot read properties of null (reading 'complete')" em Textures.updateTexture) e o pipeline nasce inválido
             ("Color target has no corresponding fragment stage output") — o erro seguia a cada quadro (e2e-cena, 24/10/2026) */
          ms.visible = false; ms.userData.cenaEsperando = true;
          this.grupo.add(ms); reg.meshes.push(ms);
        });
        r.criados++;
      } else r.atualizados++;
      reg.sig = sig; reg.obj = o;
      reg.meshes.forEach((ms) => { ms.position.set(px, py, pz); ms.rotation.set(0, o.rotY, 0); ms.scale.setScalar(o.esc); ms.updateMatrixWorld(true); });
      if (it.tipo === 'luz') this._luzes(reg, it, o, r);
      this.itens.set(o.id, reg);
    }
    this.itens.forEach((it) => { r.luzes.total += it.luzes.length; r.luzes.acesas += it.luzes.filter((l) => l.userData.ligada).length; });
    /* árvores à mão: o Entorno refaz só os baldes */
    r.arvores = arvores.length;
    if (arvores.length || this._tinhaArvores) {
      try { r.entorno = await this._arvores(arvores); } catch (e) { r.entorno = { erro: String(e && e.message || e) }; try { console.warn('árvores da cena:', e); } catch (x) { /* sem console */ } }
      this._tinhaArvores = arvores.length > 0;
    }
    v._luzesDoDia();
    if (v.sol) v.sol.shadow.needsUpdate = true;
    if (this._sel && !this.itens.has(this._sel)) this.realcar(null);
    else if (this._sel) this.realcar(this._sel);
    v.mexeu();
    r.n = lista.length; r.triangulos = Bc.orcamento(lista).triangulos;
    // textura dos materiais novos
    await this._esperarTexturas();
    this.ultimo = r;
    return r;
  }

  async _esperarTexturas() {
    const v = this.vivo;
    if (v._pend && v._pend.length) { const p = v._pend.splice(0); await Promise.all(p); }
    v.scene.traverse((o) => {
      if (!(o.userData && o.userData.cenaObj) || !o.material) return;
      const m = o.material; ['map', 'normalMap', 'roughnessMap'].forEach((k) => { if (m[k] && (m[k].userData.erro || !m[k].image)) { m[k] = null; m.needsUpdate = true; } });
      if (o.userData.cenaEsperando) { o.userData.cenaEsperando = false; o.visible = true; }   /* agora todos os mapas têm imagem (ou foram tirados) */
    });
  }

  /* a geometria de um item (em torno da origem do objeto, sem escala/giro: isso vai na matriz da malha) — dividida entre as cópias */
  _geometria(it, o, gkey) {
    let e = this.geos.get(gkey);
    if (e) return { ok: true };
    const Bc = B(), base = Bc.normalizar({ id: o.id, item: o.item, pos: [0, 0, 0], rotY: 0, esc: 1, par: o.par });
    const g = Bc.grupos(base, this._ctx());
    if (!g.grupos.length) return { ok: false, motivo: (g.erros && g.erros[0]) || 'sem geometria' };
    e = { geos: [], refs: 0 };
    g.grupos.forEach((gr) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(gr.pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(gr.nor, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(gr.uv, 2)); geo.setIndex(new THREE.BufferAttribute(gr.idx, 1));
      geo.computeBoundingBox(); geo.computeBoundingSphere();
      e.geos.push({ geo, params: g.materiais[gr.mat] });
    });
    e.caixa = g.caixa;
    this.geos.set(gkey, e);
    return { ok: true };
  }

  /* LUZES do item de luz — mesmo desenho do `preparar` do motor; vivem em vivo.luzes (a pré-exposição já mexe nelas) */
  _luzes(reg, it, o, r) {
    const v = this.vivo, Bc = B(), O = this._origem();
    const res = Bc.luz(o, Object.assign(this._ctx(), { origem: O }));
    if (!res.luzes.length) { r.luzes.semFotometria.push({ id: o.id, motivo: res.motivo }); return; }
    reg.luzDados = res.luzes; r.luzes.guardadas = (r.luzes.guardadas || 0) + 1;
    /* ⚠ LUZ REAL É OPCIONAL (medido 23/10/2026, Casa 487, Ultra, 55 materiais): a PRIMEIRA luz de objeto muda a quantidade de luzes de todo shader e a
       placa recompila a cena — 2 qps por mais de 2 minutos. Por isso o padrão é só DESENHAR a luminária; luzesReais(true) acende (e a tela avisa o custo). */
    if (!this.luzTempoReal) { reg.luzes.forEach((lz) => this._tirarLuz(lz)); reg.luzes = []; return; }
    const sc = v.scene;
    // mesma quantidade: atualiza no lugar (arrastar uma luminária não pode recompilar o shader)
    if (reg.luzes.length === res.luzes.length) {
      res.luzes.forEach((l, i) => this._ajustarLuz(reg.luzes[i], l));
      return;
    }
    reg.luzes.forEach((lz) => this._tirarLuz(lz)); reg.luzes = [];
    res.luzes.forEach((l) => {
      let lz;
      if (l.tipo === 'painel') {
        lz = new THREE.RectAreaLight(corLin(l.cor), l.intensidade, l.circular ? l.largura * 0.886 : l.largura, l.circular ? l.largura * 0.886 : l.profundidade);
      } else if (l.tipo === 'spot') {
        lz = new THREE.SpotLight(corLin(l.cor), l.intensidade, 0, l.angulo / 2 * Math.PI / 180, 0.3, 2); sc.add(lz.target);
      } else lz = new THREE.PointLight(corLin(l.cor), l.intensidade, 0, 2);
      this._ajustarLuz(lz, l);
      lz.userData.id = l.id; lz.userData.base = l.intensidade; lz.userData.ligada = l.ligada !== false; lz.userData.cena = true; lz.userData.objeto = o.id;
      lz.visible = lz.userData.ligada;
      v.luzes[l.id] = lz; sc.add(lz); reg.luzes.push(lz);
    });
  }
  _ajustarLuz(lz, l) {
    const p = l.posicao;
    if (l.tipo === 'painel') { lz.position.set(p[0], p[1], p[2]); lz.rotation.order = 'YXZ'; lz.rotation.y = l.rotY || 0; lz.rotation.x = l.rotX == null ? -Math.PI / 2 : l.rotX; }
    else if (l.tipo === 'spot') { lz.position.set(p[0], p[1], p[2]); const d = l.dir || [0, -1, 0]; lz.target.position.set(p[0] + d[0], p[1] + d[1], p[2] + d[2]); lz.target.updateMatrixWorld(); }
    else lz.position.set(p[0], p[1] - 0.05, p[2]);
    lz.userData.base = l.intensidade;
  }
  _tirarLuz(lz) {
    const v = this.vivo; if (lz.parent) lz.parent.remove(lz); if (lz.target && lz.target.parent) lz.target.parent.remove(lz.target);
    delete v.luzes[lz.userData.id]; try { lz.dispose && lz.dispose(); } catch (e) { /* já */ }
  }
  /* liga/desliga a luz REAL dos objetos (tempo real; recompila os materiais da cena — ver o aviso em _luzes). Devolve o resultado da sincronização. */
  async luzesReais(on) { this.luzTempoReal = !!on; return this.sincronizar(this._lista || [], { forcar: true }); }
  /* acender/apagar as luzes de um objeto (a tela do Cena chama; não passa pelos comandos do projeto) */
  ligar(id, on) {
    const reg = this.itens.get(id); if (!reg) return false;
    reg.luzes.forEach((l) => { l.userData.ligada = !!on; }); this.vivo._luzesDoDia(); this.vivo.mexeu(); return !!on;
  }

  async _arvores(lista) {
    const v = this.vivo;
    if (!v.entorno) {
      /* o modelo não montou entorno (sem grama, ou o botão estava desligado): cria um só para as plantadas à mão, sem plantio automático */
      const M = await import('./bimentorno.js');
      const e = new M.Entorno({ qualidade: String(v.qual && v.qual.nome || 'alta').toLowerCase(), aniso: v.aniso, auto: false });
      e._camera = v.camera; v.scene.add(e.grupo); v.entorno = e; e.ligar(true);
    }
    const r = await v.entorno.definirManual(lista);
    v.mexeu();
    if (v.sol) v.sol.shadow.needsUpdate = true;
    return r;
  }
  /* liga/desliga o plantio automático (a grama e as plantadas à mão ficam) */
  arvoresAuto(on) { const e = this.vivo.entorno; if (!e || !e.definirAuto) return false; e.definirAuto(!!on); this.vivo.mexeu(); return !!on; }

  _remover(id) {
    const reg = this.itens.get(id); if (!reg) return;
    reg.meshes.forEach((ms) => { if (ms.parent) ms.parent.remove(ms); });
    reg.luzes.forEach((lz) => this._tirarLuz(lz));
    if (reg.gkey) {
      const e = this.geos.get(reg.gkey);
      if (e && --e.refs <= 0) { e.geos.forEach((g) => { try { g.geo.dispose(); } catch (x) { /* já */ } }); this.geos.delete(reg.gkey); }
    }
    this.itens.delete(id);
  }

  /* ---------------------------------------------------------------- seleção e posição */
  _raio(fx, fy) { const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(fx * 2 - 1, 1 - fy * 2), this.vivo.camera); return rc; }
  /* o objeto sob o ponteiro (fx, fy ∈ 0..1 a partir do canto de cima) → id, ou null. Malhas por raio; árvore pela esfera da copa. */
  escolher(fx, fy) {
    const rc = this._raio(fx, fy);
    this.grupo.updateMatrixWorld(true);
    const hs = rc.intersectObjects(this.grupo.children, false).filter((h) => h.object.userData && h.object.userData.cenaObj);
    let melhor = hs.length ? { d: hs[0].distance, id: hs[0].object.userData.cenaObj } : null;
    const e = this.vivo.entorno;
    if (e && e.arvores) {
      e.arvores.forEach((a) => {
        if (!a.manual || !a.ref) return;
        const h = a.h * a.esc, c = new THREE.Vector3(a.x, a.y + h * (a.tipo === 'arvore' ? 0.55 : 0.5), a.z), raio = Math.max(0.5, a.r * a.esc * (a.tipo === 'arvore' ? 0.8 : 0.9));
        const ray = rc.ray, oc = ray.origin.clone().sub(c), b = oc.dot(ray.direction), cc = oc.dot(oc) - raio * raio, disc = b * b - cc;
        if (disc < 0) return; const t = -b - Math.sqrt(disc); if (t < 0) return;
        if (!melhor || t < melhor.d) melhor = { d: t, id: a.ref };
      });
    }
    return melhor ? melhor.id : null;
  }
  /* o ponto da cena sob o ponteiro, sem os objetos nem o entorno: [x,y,z] em BIM, ou null. Prefere superfície voltada para cima (chão, bancada). */
  pontoNoChao(fx, fy) { return this._pontoDoRaio(this._raio(fx, fy)); }
  /* o piso em (x, z) BIM: um raio de cima para baixo (o mesmo filtro) — para soltar um objeto numa posição conhecida (mover pelo painel) */
  pontoAbaixo(x, z, yDe) {
    const O = this._origem(), rc = new THREE.Raycaster(new THREE.Vector3(x - O[0], (yDe == null ? 200 : yDe) - O[1], z - O[2]), new THREE.Vector3(0, -1, 0));
    return this._pontoDoRaio(rc);
  }
  _pontoDoRaio(rc) {
    const v = this.vivo; rc.far = 600;
    v.scene.updateMatrixWorld(true);
    const hs = rc.intersectObjects(v.scene.children, true).filter((h) => {
      const o = h.object; if (!o.isMesh || o.isInstancedMesh || !h.face) return false;
      for (let q = o; q; q = q.parent) if (q.userData && (q.userData.entorno || q.userData.cenaObj || q.userData.verso)) return false;
      const m = Array.isArray(o.material) ? o.material[0] : o.material; if (m && m.transmission > 0) return false;
      return true;
    });
    if (!hs.length) return null;
    const cima = hs.find((h) => h.face.normal.clone().transformDirection(h.object.matrixWorld).y > 0.5) || hs[0];
    const O = this._origem(), p = cima.point;
    return [p.x + O[0], p.y + O[1], p.z + O[2]];
  }

  /* contorno de seleção: uma caixa de linhas em volta do objeto (só a caixa; o material do objeto é compartilhado e não pode ser tingido) */
  realcar(id) {
    if (this._caixaSel) { if (this._caixaSel.parent) this._caixaSel.parent.remove(this._caixaSel); try { this._caixaSel.geometry.dispose(); } catch (e) { /* já */ } this._caixaSel = null; }
    this._sel = id || null; if (!id) { this.vivo.mexeu(); return null; }
    const reg = this.itens.get(id); if (!reg) { this._sel = null; return null; }
    const bx = new THREE.Box3();
    if (reg.arvore) {
      const a = this.vivo.entorno && this.vivo.entorno.arvores.find((q) => q.ref === id); if (!a) return null;
      const h = a.h * a.esc, r = Math.max(0.4, a.r * a.esc * 0.8); bx.set(new THREE.Vector3(a.x - r, a.y, a.z - r), new THREE.Vector3(a.x + r, a.y + h, a.z + r));
    } else { reg.meshes.forEach((ms) => { ms.updateMatrixWorld(true); bx.union(new THREE.Box3().setFromObject(ms)); }); }
    if (bx.isEmpty()) return null;
    const a = bx.min, b = bx.max, P = [[a.x, a.y, a.z], [b.x, a.y, a.z], [b.x, a.y, b.z], [a.x, a.y, b.z], [a.x, b.y, a.z], [b.x, b.y, a.z], [b.x, b.y, b.z], [a.x, b.y, b.z]];
    const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]], arr = [];
    E.forEach(([i, j]) => { arr.push(...P[i], ...P[j]); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3));
    const m = new THREE.LineBasicNodeMaterial({ color: COR_SEL }); m.fog = false;
    const ln = new THREE.LineSegments(g, m); ln.frustumCulled = false; ln.userData.entorno = true; ln.userData.selecao = true; ln.layers.set(1);
    this.vivo.scene.add(ln); this._caixaSel = ln; this.vivo.mexeu();
    return { min: bx.min.toArray(), max: bx.max.toArray() };
  }

  info() {
    const l = { total: 0, acesas: 0, noTempoReal: 0, noAtlas: false, luzReal: !!this.luzTempoReal, nota: 'a luz de objeto acende só no tempo real (limite de 12 luzes) e só com luzesReais(true), que recompila a cena (minutos em cena pesada); não entra no atlas nem nos comandos do projeto' };
    this.itens.forEach((it) => { l.total += it.luzDados ? it.luzDados.length : it.luzes.length; it.luzes.forEach((q) => { if (q.userData.ligada) l.acesas++; if (q.visible) l.noTempoReal++; }); });
    return { objetos: this.itens.size, malhas: this.grupo.children.length, materiais: this.mats.size, luzes: l, entorno: this.vivo.entorno ? { manuais: this.vivo.entorno.info && this.vivo.entorno.info.manuais || 0 } : null, ultimo: this.ultimo };
  }

  aoLimpar() {
    // o motor limpou a cena (preparar de novo): o que era nosso saiu junto
    this.itens.forEach((it) => { it.luzes = []; it.meshes = []; });
    this.itens.clear(); this.geos.forEach((e) => e.geos.forEach((g) => { try { g.geo.dispose(); } catch (x) { /* já */ } })); this.geos.clear();
    this.mats.clear(); this._semeado = false; this._sel = null; this._caixaSel = null;
  }
  descartar() {
    this.itens.forEach((it, id) => this._remover(id));
    if (this._caixaSel) { try { this._caixaSel.geometry.dispose(); } catch (e) { /* já */ } this._caixaSel = null; }
    if (this.grupo.parent) this.grupo.parent.remove(this.grupo);
    this.geos.forEach((e) => e.geos.forEach((g) => { try { g.geo.dispose(); } catch (x) { /* já */ } })); this.geos.clear(); this.mats.clear();
  }
}
