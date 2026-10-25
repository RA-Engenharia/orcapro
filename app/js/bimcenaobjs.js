/* =====================================================================
 * bimcenaobjs.js — a BIBLIOTECA DE OBJETOS do OrçaPRO Cena (Entrega 1, 23/10/2026)
 *
 * O que a pessoa ARRASTA para dentro da cena de render ao vivo: móveis, luminárias e vegetação.
 * ⚠ SÃO OBJETOS DA CENA, NÃO DO PROJETO: não entram no BIM, não entram no quantitativo nem no
 * orçamento (a árvore que o cliente pediu para a apresentação não vira linha de custo). Moram no
 * JSON da cena (`objetos`), que a Cena grava junto da obra.
 *
 * MÓDULO PURO (ES5, sem DOM, sem three): o catálogo, a geometria já transformada e a luz saem como
 * DADOS — a mesma forma que o BimRender.extrair entrega ao render ao vivo (grupos pos/nor/uv/idx +
 * parâmetros de material). Quem desenha é o js/bimcenaobjsmotor.js (WebGPU). Assim tudo aqui roda em
 * node e é provado por tools/test-bimcenaobjs.js.
 *
 * DE ONDE VÊM OS ITENS (nada inventado):
 *  · MOBILIÁRIO = as 64 famílias por categoria do js/familiascat.js, um item por TIPO (peça comercial
 *    do js/mobcatalogodados.js, com a fonte). A geometria é a do gerador (js/mobgeo.js) via Familia.avaliar.
 *  · LUMINÁRIAS = as 8 famílias do js/familiasluz.js (números do catálogo I1). Peça sem fluxo (lm) ou
 *    sem temperatura de cor desenha, mas NÃO acende: o item traz `falta` dizendo o que o catálogo não publica.
 *  · VEGETAÇÃO = as espécies do Entorno (EZ-Tree, MIT) — a tabela VEGETACAO abaixo repete id e
 *    altura do ESPECIES de js/bimentorno.js e o tools/test-bimcenaobjs.js LÊ aquele arquivo e
 *    reprova se divergirem (o entorno é módulo ES de three e não dá para importá-lo daqui).
 *  · PESSOAS: nenhuma. Ver pendencias().
 *
 * COORDENADAS: `pos` do objeto está nas coordenadas do BIM (metros, y para cima); o motor do render
 * trabalha em BIM − origem (ctx.origem). rotY em radianos, mesma convenção da luz das famílias
 * (js/familiasluz.js: x' = x·cos + z·sin; z' = −x·sin + z·cos).
 * ===================================================================== */
(function (global) {
  "use strict";

  var MAX_OBJ = 300, MAX_TRI = 150000, TETO_TRI_INST = 12000;

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require("./" + arq); } catch (e) { return null; } }
    return null;
  }
  function num(v, d) { var n = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v).replace(",", ".")); return isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function semAcento(s) { var t = txt(s).toLowerCase(); return t.normalize ? t.normalize("NFD").replace(/[̀-ͯ]/g, "") : t; }

  /* ------------------------------------------------------------ VEGETAÇÃO (espelho de ESPECIES, js/bimentorno.js) */
  var VEGETACAO = [
    { id: "carvalho", nome: "Carvalho", tipo: "arvore", alt: [7.5, 10.5] },
    { id: "freixo", nome: "Freixo", tipo: "arvore", alt: [8.5, 12.0] },
    { id: "choupo", nome: "Choupo", tipo: "arvore", alt: [6.5, 9.0] },
    { id: "palmeira", nome: "Palmeira", tipo: "arvore", alt: [5.0, 7.5] },
    { id: "arbusto1", nome: "Arbusto 1", tipo: "arbusto", alt: [1.0, 1.7] },
    { id: "arbusto2", nome: "Arbusto 2", tipo: "arbusto", alt: [0.9, 1.5] }
  ];
  var ROTULO_CAT = { mobiliario: "Mobiliário", luminaria: "Luminárias de decoração", equipamento: "Equipamentos", cozinha: "Cozinha", lazer: "Lazer e jardim", iluminacao: "Iluminação (com luz)", vegetacao: "Vegetação" };

  /* ------------------------------------------------------------ CATÁLOGO */
  var _cat = null, _porId = null, _famLuz = null;
  function famLuzLista() {
    if (!_famLuz) { var FL = dep("FamiliasLuz", "familiasluz.js"); _famLuz = FL ? FL.lista() : []; }
    return _famLuz;
  }
  function montarCatalogo() {
    var itens = [], FC = dep("FamiliasCat", "familiascat.js"), FL = dep("FamiliasLuz", "familiasluz.js");
    /* a busca também acha pelo id da família/espécie ("arbusto1", "ra-cat-poltrona"): quem monta uma cena por roteiro usa o id */
    function item(o) { o.busca = semAcento([o.nome, o.catNome, o.fabricante, o.ref && (o.ref.fam || o.ref.sp)].join(" ")); itens.push(o); }
    if (FC) {
      FC.familias().forEach(function (f) {
        (f.tipos || []).forEach(function (t) {
          var v = t.valores || {};
          item({ id: "fam:" + f.id + "/" + t.id, cat: f.categoria || "mobiliario", catNome: f.nome, nome: txt(t.nome).replace(/\s+—\s+[\d,. ×x]+\s*cm\s*$/, "") || f.nome, tipo: "familia",
                 ref: { fam: f.id, tipo: t.id }, dim: [num(v.Largura, 0), num(v.Profundidade, 0), num(v.Altura, 0)], alt: num(v.Altura, 0),
                 fabricante: txt(v.Fabricante), fonte: txt(t.fonte) || txt(v.Url_ficha) || txt(v.Fonte_preco), falta: "" });
        });
      });
    }
    if (FL) {
      famLuzLista().forEach(function (f) {
        (f.tipos || []).forEach(function (t) {
          /* ⚠ a pendência vem dos valores AVALIADOS: a lâmpada do soquete (E27/G9/GU10) é escolhida no tipo e só o avaliar traz o lm dela —
             pelo valor cru do tipo 13 das 39 luminárias pareciam "sem fluxo" e acendem de verdade */
          var v = t.valores || {}, falta = "", F = dep("Familia", "familia.js");
          if (F && FL.pendenteDe) { var av0 = F.avaliar(f, t.id, {}); falta = av0 && av0.ok ? FL.pendenteDe(av0.valores) : "não avaliou: " + ((av0 && av0.erros) || []).join("; "); }
          else falta = pendenciaLuz(v);
          item({ id: "luz:" + f.id + "/" + t.id, cat: "iluminacao", catNome: f.nome, nome: txt(t.nome) || f.nome, tipo: "luz", ref: { fam: f.id, tipo: t.id },
                 dim: [num(v.Largura, num(v.Diametro, 0)), num(v.Lado, num(v.Largura, num(v.Diametro, 0))), num(v.Altura_corpo, num(v.Comprimento_corpo, num(v.Diametro, 0)))], alt: Math.max(0.02, num(v.Altura_corpo, num(v.Comprimento_corpo, num(v.Diametro, 0)))), fabricante: txt(v.Produto),
                 fonte: txt(t.fonte) || txt(v.Fonte), falta: falta, acende: !falta });
        });
      });
    }
    VEGETACAO.forEach(function (e) {
      var h = (e.alt[0] + e.alt[1]) / 2;
      item({ id: "veg:" + e.id, cat: "vegetacao", catNome: e.tipo === "arvore" ? "Árvores" : "Arbustos", nome: e.nome, tipo: "arvore", ref: { sp: e.id, tipoVeg: e.tipo },
             dim: [h * 0.6, h * 0.6, h], alt: h, fabricante: "EZ-Tree (MIT)", fonte: "EZ-Tree, licença MIT (bim/vendor/jsm/ez-tree); folha e casca do próprio OrçaPRO", falta: "" });
    });
    return itens;
  }
  /* o que falta para a luz acender (a mesma regra do FamiliasLuz.luzes: sem lm ou sem K nunca acende com número inventado) */
  function pendenciaLuz(v) {
    var p = [];
    if (!(num(v.Fluxo_lm, 0) > 0) && !(num(v.Fluxo_lm_m, 0) > 0)) p.push("fluxo (lm)");
    if (!(num(v.Temperatura_K, 0) >= 1800)) p.push("temperatura de cor (K)");
    return p.length ? "sem " + p.join(" e ") + " no catálogo" : "";
  }
  function catalogo() {
    if (!_cat) { _cat = montarCatalogo(); _porId = {}; _cat.forEach(function (i) { _porId[i.id] = i; }); }
    return _cat.slice();
  }
  function item(id) { catalogo(); return _porId[id] || null; }
  /* categorias para a lista da tela: [{cat, nome, n}] na ordem de interesse */
  function categorias() {
    var c = catalogo(), cont = {}, ordem = [];
    c.forEach(function (i) { if (!cont[i.cat]) { cont[i.cat] = 0; ordem.push(i.cat); } cont[i.cat]++; });
    var pref = ["mobiliario", "iluminacao", "luminaria", "cozinha", "equipamento", "lazer", "vegetacao"];
    ordem.sort(function (a, b) { var x = pref.indexOf(a), y = pref.indexOf(b); return (x < 0 ? 99 : x) - (y < 0 ? 99 : y); });
    return ordem.map(function (k) { return { cat: k, nome: ROTULO_CAT[k] || k, n: cont[k] }; });
  }
  function buscar(q, cat) {
    var t = semAcento(q).split(/\s+/).filter(Boolean);
    return catalogo().filter(function (i) { return (!cat || i.cat === cat) && t.every(function (w) { return i.busca.indexOf(w) >= 0; }); });
  }
  function pendencias() {
    return [
      "PESSOAS: nenhuma figura humana entrou. Figura realista só de fonte com licença (CC0 ou comprada) e com a fonte anotada no próprio item; nada baixado de site sem licença clara.",
      "Candidatas a AVALIAR (não baixadas): bibliotecas CC0 de personagens low-poly (ex.: Quaternius, KayKit) servem só para escala e estilo de maquete, não para realismo.",
      "Realismo exige scan licenciado (compra): fica para a Entrega 2, com decisão de preço do Rogério.",
      "Árvores: as espécies são as do EZ-Tree (carvalho, freixo, choupo, palmeira, arbustos); espécies brasileiras próprias (ipê, jabuticabeira, coqueiro-anão…) ficam para a Entrega 2."
    ];
  }

  /* ------------------------------------------------------------ OBJETOS DA CENA */
  var _seq = 0;
  function novo(itemId, pos, rotY, opc) {
    var o = opc || {}, p = pos && pos.length >= 3 ? [num(pos[0], 0), num(pos[1], 0), num(pos[2], 0)] : [0, 0, 0];
    var id = o.id || ("obj-" + Date.now().toString(36) + "-" + (++_seq).toString(36) + Math.floor(Math.random() * 46656).toString(36));
    return { id: id, item: txt(itemId), pos: p, rotY: num(rotY, 0), esc: num(o.esc, 1), par: o.par || {}, comando: txt(o.comando) };
  }
  function normalizar(obj) {
    var o = obj || {};
    var esc = Math.min(5, Math.max(0.2, num(o.esc, 1)));
    var par = {}; if (o.par && typeof o.par === "object") Object.keys(o.par).forEach(function (k) { var v = o.par[k]; if (typeof v === "number" ? isFinite(v) : typeof v === "string") par[k] = v; });
    return { id: txt(o.id) || novo("").id, item: txt(o.item), pos: [num(o.pos && o.pos[0], 0), num(o.pos && o.pos[1], 0), num(o.pos && o.pos[2], 0)],
             rotY: num(o.rotY, 0), esc: esc, par: par, comando: txt(o.comando) };
  }
  function ancorar(obj, y) { var c = normalizar(obj); c.pos[1] = num(y, c.pos[1]); return c; }

  function famDoItem(it) {
    var FC = dep("FamiliasCat", "familiascat.js");
    if (it.tipo === "familia") return FC ? FC.obter(it.ref.fam) : null;
    if (it.tipo === "luz") { var L = famLuzLista(); for (var i = 0; i < L.length; i++) if (L[i].id === it.ref.fam) return L[i]; }
    return null;
  }
  /* avalia a família do item na instância (os parâmetros da instância — acabamento, altura de montagem — vêm de obj.par) */
  function avaliarItem(it, obj) {
    var F = dep("Familia", "familia.js"), fam = famDoItem(it);
    if (!F || !fam) return { ok: false, erros: ["a família do item não carregou"] };
    var inst = {}; Object.keys(obj.par || {}).forEach(function (k) { inst[k] = obj.par[k]; });
    return F.avaliar(fam, it.ref.tipo, inst);
  }

  /* ctx: { origem:[x,y,z], mapear(peca)→{id}, params(id, peca, nome)→parâmetros de material (BimRender._params no navegador) } */
  function ctxPadrao(ctx) {
    var c = ctx || {}, RM = c.RM || dep("RenderMat", "rendermat.js");
    return {
      origem: c.origem && c.origem.length >= 3 ? c.origem : [0, 0, 0],
      mapear: c.mapear || function (pc) { return RM ? RM.mapear(pc, {}) : { id: "" }; },
      params: c.params || function (id, peca, nome) { return RM ? RM.parametros(id, { cor: peca && peca.cor, nome: nome }) : null; },
      RM: RM
    };
  }

  /* a peça pronta: grupos por material, já escalada, girada e levada para a posição (BIM − origem).
     Normais: suaves onde o gerador diz `suave` (copa de almofada, tubo), chatas no resto. UV: projeção por caixa na face dominante,
     em METROS (o material do render repete a textura por metro: p.textura.escala). Triângulos sem área ficam de fora. */
  function grupos(objeto, ctx) {
    var obj = normalizar(objeto), it = item(obj.item), c = ctxPadrao(ctx);
    if (!it || it.tipo === "arvore") return { grupos: [], materiais: [], triangulos: 0, caixa: null, erros: it ? ["vegetação é do Entorno, não tem malha aqui"] : ["item desconhecido: " + obj.item] };
    var av = avaliarItem(it, obj);
    if (!av.ok || !av.solidos) return { grupos: [], materiais: [], triangulos: 0, caixa: null, erros: av.erros || ["não avaliou"] };
    var cs = Math.cos(obj.rotY), sn = Math.sin(obj.rotY), E = obj.esc, O = c.origem, P = obj.pos;
    var porMat = {}, ordem = [], materiais = [], idxMat = {}, tri = 0;
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    av.solidos.forEach(function (s) {
      if (s.forma !== "malha" || !s.v || !s.f) return;
      var nv = Math.floor(s.v.length / 3), nt = Math.floor(s.f.length / 3);
      var L = new Array(nv * 3), i, k;
      for (i = 0; i < nv; i++) { L[i * 3] = (s.x || 0) + s.v[i * 3]; L[i * 3 + 1] = (s.y || 0) + s.v[i * 3 + 1]; L[i * 3 + 2] = (s.z || 0) + s.v[i * 3 + 2]; }
      var nome = txt(s.material) || "pintura";
      if (!idxMat.hasOwnProperty(nome)) {
        var peca = { materiais: [nome], ifc: "IFCFURNISHINGELEMENT", alfa: 1, cor: null, n: 1 }, m = c.mapear(peca), p = m && m.id ? c.params(m.id, peca, nome) : null;
        if (!p) { idxMat[nome] = -1; } else { idxMat[nome] = materiais.length; materiais.push(p); }
      }
      if (idxMat[nome] < 0) return;
      var g = porMat[nome]; if (!g) { g = porMat[nome] = { mat: idxMat[nome], pos: [], nor: [], uv: [], idx: [] }; ordem.push(nome); }
      /* normais suaves por vértice (área ponderada) — só se o gerador marcou a malha como suave */
      var sm = null;
      if (s.suave) {
        sm = new Array(nv * 3); for (i = 0; i < sm.length; i++) sm[i] = 0;
        for (k = 0; k < nt; k++) {
          var a = s.f[k * 3], b = s.f[k * 3 + 1], d = s.f[k * 3 + 2], n = normalTri(L, a, b, d);
          for (var q = 0; q < 3; q++) { var vi = s.f[k * 3 + q]; sm[vi * 3] += n[0]; sm[vi * 3 + 1] += n[1]; sm[vi * 3 + 2] += n[2]; }
        }
      }
      for (k = 0; k < nt; k++) {
        var ia = s.f[k * 3], ib = s.f[k * 3 + 1], ic = s.f[k * 3 + 2];
        if (!(ia < nv && ib < nv && ic < nv)) continue;
        var fn = normalTri(L, ia, ib, ic), area = Math.sqrt(fn[0] * fn[0] + fn[1] * fn[1] + fn[2] * fn[2]);
        if (!(area > 1e-12)) continue;
        var base = g.pos.length / 3, fl = [fn[0] / area, fn[1] / area, fn[2] / area];
        [ia, ib, ic].forEach(function (vi) {
          var lx = L[vi * 3] * E, ly = L[vi * 3 + 1] * E, lz = L[vi * 3 + 2] * E;
          var wx = lx * cs + lz * sn + P[0] - O[0], wy = ly + P[1] - O[1], wz = -lx * sn + lz * cs + P[2] - O[2];
          g.pos.push(wx, wy, wz);
          if (wx < mn[0]) mn[0] = wx; if (wy < mn[1]) mn[1] = wy; if (wz < mn[2]) mn[2] = wz;
          if (wx > mx[0]) mx[0] = wx; if (wy > mx[1]) mx[1] = wy; if (wz > mx[2]) mx[2] = wz;
          var nl = fl;
          if (sm) { var ln = Math.sqrt(sm[vi * 3] * sm[vi * 3] + sm[vi * 3 + 1] * sm[vi * 3 + 1] + sm[vi * 3 + 2] * sm[vi * 3 + 2]); if (ln > 1e-12) nl = [sm[vi * 3] / ln, sm[vi * 3 + 1] / ln, sm[vi * 3 + 2] / ln]; }
          g.nor.push(nl[0] * cs + nl[2] * sn, nl[1], -nl[0] * sn + nl[2] * cs);
          /* UV pela face dominante da NORMAL CHATA do triângulo (não da suave): a costura cai na aresta, não no meio da curva */
          var ax = Math.abs(fl[0]), ay = Math.abs(fl[1]), az = Math.abs(fl[2]);
          if (ay >= ax && ay >= az) g.uv.push(lx, lz); else if (ax >= az) g.uv.push(lz, ly); else g.uv.push(lx, ly);
        });
        g.idx.push(base, base + 1, base + 2); tri++;
      }
    });
    var out = ordem.map(function (n) { var g = porMat[n]; return { mat: g.mat, pos: new Float32Array(g.pos), nor: new Float32Array(g.nor), uv: new Float32Array(g.uv), idx: new Uint32Array(g.idx) }; });
    return { grupos: out, materiais: materiais, triangulos: tri, caixa: tri ? { min: mn, max: mx } : null, erros: [] };
  }
  function normalTri(L, a, b, c) {
    var ux = L[b * 3] - L[a * 3], uy = L[b * 3 + 1] - L[a * 3 + 1], uz = L[b * 3 + 2] - L[a * 3 + 2];
    var vx = L[c * 3] - L[a * 3], vy = L[c * 3 + 1] - L[a * 3 + 1], vz = L[c * 3 + 2] - L[a * 3 + 2];
    return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  }

  /* as luzes do objeto (item de LUZ) no formato de cena.luzes — { luzes:[…], motivo:"" }; sem fotometria publicada: luzes [] e o motivo */
  function luz(objeto, ctx) {
    var obj = normalizar(objeto), it = item(obj.item), c = ctxPadrao(ctx), FL = dep("FamiliasLuz", "familiasluz.js");
    if (!it || it.tipo !== "luz") return { luzes: [], motivo: "o item não é uma luminária" };
    if (it.falta) return { luzes: [], motivo: it.falta };
    var av = avaliarItem(it, obj);
    if (!av.ok) return { luzes: [], motivo: (av.erros || ["não avaliou"]).join("; ") };
    var P = obj.pos, O = c.origem;
    var r = FL.luzes(av.valores, { x: P[0] - O[0], y: P[1] - O[1], z: P[2] - O[2], rotY: obj.rotY }, { id: obj.id, nome: it.nome, comando: obj.comando }, c.RM);
    return { luzes: r.luzes, motivo: r.pendente || "" };
  }

  function orcamento(objetos) {
    var l = objetos || [], tri = 0, n = l.length, motivo = "";
    l.forEach(function (o) { var it = item(o && o.item); if (it && it.tipo !== "arvore") tri += estimaTri(it); else tri += 0; });
    if (n > MAX_OBJ) motivo = "a cena aceita até " + MAX_OBJ + " objetos (tem " + n + ")";
    else if (tri > MAX_TRI) motivo = "a cena aceita até " + MAX_TRI + " triângulos de objetos (tem " + tri + ")";
    return { n: n, triangulos: tri, ok: !motivo, motivo: motivo, maxObjetos: MAX_OBJ, maxTriangulos: MAX_TRI };
  }
  /* triângulos de um item: medido uma vez (avaliar) e guardado; o teto por instância é o das famílias */
  var _triItem = {};
  function estimaTri(it) {
    if (_triItem[it.id] != null) return _triItem[it.id];
    var av = avaliarItem(it, { par: {} }), t = av && av.ok ? (av.mob && av.mob.triangulos || (av.solidos || []).reduce(function (s, q) { return s + (q.f ? q.f.length / 3 : 0); }, 0)) : TETO_TRI_INST;
    return (_triItem[it.id] = t);
  }

  var BimCenaObjs = {
    MAX_OBJ: MAX_OBJ, MAX_TRI: MAX_TRI, TETO_TRI_INST: TETO_TRI_INST, VEGETACAO: VEGETACAO,
    catalogo: catalogo, item: item, categorias: categorias, buscar: buscar, pendencias: pendencias,
    novo: novo, normalizar: normalizar, ancorar: ancorar, grupos: grupos, luz: luz, orcamento: orcamento,
    triangulosDoItem: function (id) { var it = item(id); return it && it.tipo !== "arvore" ? estimaTri(it) : 0; }
  };
  global.BimCenaObjs = BimCenaObjs;
  if (typeof module !== "undefined" && module.exports) module.exports = BimCenaObjs;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
