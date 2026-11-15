/* =====================================================================
 * piscinaderiv.js — O QUE A PISCINA E A CASA DE MÁQUINAS LEVAM JUNTO (motor PURO, ES5, Node-testável). 04/11/2026.
 *
 * Pedido do Rogério (04/11/2026): "clicar na piscina e ela rotacionar 90 graus, arrastar para onde eu quiser dentro do
 * lote e ela já fazer o corte onde eu preciso. E arrastar a casa de máquina, com bomba, com motor, com tudo."
 *
 * A REGRA: nada aqui grava op. O recorte do piso e os tubos são DERIVADOS a cada replay (extensão do js/bimedit.js),
 * a partir da posição das duas famílias. Por isso não existe recorte ou tubo "velho": moveu, girou, desfez, o que depende
 * vem junto, sem lote nenhum. O defeito que isso impede: na 1ª versão (lote R17, 03/11) o furo do deck e os tubos eram
 * peças soltas, e arrastar a piscina deixava o buraco e a tubulação no lugar antigo.
 *
 *  1. RECORTE: todo volume com `recortavel: true` (deck, terreno) perde o retângulo externo da borda atérmica de cada
 *     piscina, pelos `furos` da extrusão (js/bimvolume.js). Serve para qualquer contorno e para a piscina que passar da
 *     borda do deck. Volume que a piscina não toca fica intacto, com a receita de antes.
 *  2. TUBOS: cada casa de máquinas liga na piscina mais perto. Saem do dispositivo, descem à vala, contornam a piscina a
 *     `AFASTA` da borda de fibra (dentro da folga da cava) e seguem em L até a casa de máquinas. Viram volumes de varredura.
 *     ⚠ Traçado INDICATIVO: não desvia de fundação nem entra no cálculo do módulo de instalações. O kit e a instalação
 *     hidráulica da Tradicional são do fabricante ("Parte Hidráulica Completa", splashpiscinas.com, 03/11/2026).
 *
 * Os níveis da vala e os diâmetros são critério de desenho (declarado nos parâmetros da família, não é norma):
 * sucção ~40 mm e bico do registro ~26 mm foram lidos do desenho da Dry Pump.
 * ===================================================================== */
(function (global) {
  "use strict";
  var FAM_PISCINA = "ra-piscina-splash-tradicional", FAM_CASA = "ra-casa-maquinas-dry-pump";
  var AFASTA = 0.12;       /* da borda de fibra ao eixo da vala (a folga da cava é 0,20) */
  var Y_SUCCAO = -0.66, Y_RETORNO = -0.72, Y_DRENO = -0.30, Y_TAMPADO = -0.05;
  var MAT_SUCCAO = "PVC branco", MAT_RETORNO = "PVC marrom";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function r4(v) { return Math.round(v * 10000) / 10000; }

  /* padrão da família → valores do tipo → o que a obra mudou no tipo → instância */
  var CACHE_FAM = {};
  function famDef(id) {
    if (CACHE_FAM[id]) return CACHE_FAM[id];
    var FP = dep("FamiliasPiscina", "./familiaspiscina.js"), f = FP && FP.obter ? FP.obter(id) : null;
    if (f) CACHE_FAM[id] = f;
    return f;
  }
  function valores(famId, tipoId, inst) {
    var f = famDef(famId), v = {}; if (!f) return v;
    arr(f.parametros).forEach(function (p) { if (!p.formula && p.valor !== undefined) v[p.nome] = p.valor; });
    var t = arr(f.tipos).filter(function (x) { return x.id === tipoId; })[0] || arr(f.tipos)[0];
    if (t && t.valores) Object.keys(t.valores).forEach(function (k) { v[k] = t.valores[k]; });
    var i = inst || {};
    if (i.$tipo) Object.keys(i.$tipo).forEach(function (k) { v[k] = i.$tipo[k]; });
    Object.keys(i).forEach(function (k) { if (k !== "$tipo") v[k] = i[k]; });
    return v;
  }

  /* local da família (x, z do app) ↔ mundo: a mesma rotação do 3D */
  function paraMundo(f, p) {
    var c = Math.cos(f.rotY || 0), s = Math.sin(f.rotY || 0);
    return [r4(f.x + p.x * c + p.z * s), r4((f.y || 0) + p.y), r4(f.z - p.x * s + p.z * c)];
  }
  function paraLocal(f, x, z) {
    var c = Math.cos(f.rotY || 0), s = Math.sin(f.rotY || 0), dx = x - f.x, dz = z - f.z;
    /* ⚠ 0,1 mm: o giro gravado é arredondado (3,141593, não π) e o resto do seno punha o ponto a milésimos de milímetro fora da linha da vala.
       A sucção virava "dobra de 180°" e sumia só em certas posições do arraste (achado no teste na janela do Rogério, 04/11/2026) */
    return { x: r4(dx * c - dz * s), z: r4(dx * s + dz * c) };
  }

  /* ------------------------------------------------------------ recorte */
  function contornoRecorte(f, hC, hL) {
    return [[-hC, -hL], [hC, -hL], [hC, hL], [-hC, hL]].map(function (q) { var m = paraMundo(f, { x: q[0], y: 0, z: q[1] }); return [m[0], -m[2]]; });
  }
  function caixaDe(pts) {
    var c = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    pts.forEach(function (q) { c.x0 = Math.min(c.x0, q[0]); c.x1 = Math.max(c.x1, q[0]); c.y0 = Math.min(c.y0, q[1]); c.y1 = Math.max(c.y1, q[1]); });
    return c;
  }
  function recortar(vol, contorno) {
    var r = vol.receita;
    if (!r || r.forma !== "extrusao" || !arr(r.contorno).length) return false;
    /* o contorno tem de estar no plano do piso: x do mundo, -z do mundo (como o deck e o terreno) */
    var pl = r.plano; if (pl && (!pl.u || !pl.v || pl.u[0] !== 1 || pl.v[2] !== -1)) return false;
    var a = caixaDe(r.contorno), b = caixaDe(contorno);
    if (b.x0 >= a.x1 || b.x1 <= a.x0 || b.y0 >= a.y1 || b.y1 <= a.y0) return false;    /* a piscina não toca: a receita fica como está */
    r.furos = arr(r.furos).concat([contorno]);
    return true;
  }

  /* ------------------------------------------------------------ vala em volta da piscina */
  function Vala(hx, hz) { this.hx = hx; this.hz = hz; this.per = 4 * (hx + hz); }
  /* s = distância ao longo do retângulo, a partir do canto (+x, -z), no sentido +z */
  Vala.prototype.s = function (p) {
    var hx = this.hx, hz = this.hz;
    if (Math.abs(p.x - hx) < 1e-3) return p.z + hz;
    if (Math.abs(p.z - hz) < 1e-3) return 2 * hz + (hx - p.x);
    if (Math.abs(p.x + hx) < 1e-3) return 2 * hz + 2 * hx + (hz - p.z);
    return 4 * hz + 2 * hx + (p.x + hx);
  };
  Vala.prototype.cantos = function () {
    var hx = this.hx, hz = this.hz;
    return [{ x: hx, z: hz, s: 2 * hz }, { x: -hx, z: hz, s: 2 * hz + 2 * hx }, { x: -hx, z: -hz, s: 4 * hz + 2 * hx }, { x: hx, z: -hz, s: this.per }];
  };
  /* o ponto do retângulo mais perto de p */
  Vala.prototype.projeta = function (p) {
    var hx = this.hx, hz = this.hz, x = Math.max(-hx, Math.min(hx, p.x)), z = Math.max(-hz, Math.min(hz, p.z));
    if (Math.abs(p.x) <= hx && Math.abs(p.z) <= hz) {          /* por dentro: sai pelo lado mais perto */
      if (hx - Math.abs(p.x) < hz - Math.abs(p.z)) x = p.x >= 0 ? hx : -hx; else z = p.z >= 0 ? hz : -hz;
    } else if (Math.abs(x) < hx && Math.abs(z) < hz) {
      x = p.x >= 0 ? hx : -hx;
    }
    return { x: x, z: z };
  };
  /* caminho pelo retângulo de a até b, pelo lado mais curto (a e b já em cima dele) */
  Vala.prototype.caminho = function (a, b) {
    var sa = this.s(a), sb = this.s(b), per = this.per, ida = ((sb - sa) % per + per) % per, volta = per - ida;
    var pts = [a], cs = this.cantos(), dir = ida <= volta ? 1 : -1, compr = Math.min(ida, volta);
    var meio = [];
    cs.forEach(function (c) {
      var d = dir > 0 ? ((c.s - sa) % per + per) % per : ((sa - c.s) % per + per) % per;
      if (d > 1e-3 && d < compr - 1e-3) meio.push({ d: d, x: c.x, z: c.z });
    });
    meio.sort(function (q, w) { return q.d - w.d; });
    meio.forEach(function (q) { pts.push({ x: q.x, z: q.z }); });
    pts.push(b);
    return pts;
  };

  function compr(c) { var L = 0; for (var i = 1; i < c.length; i++) L += Math.sqrt(Math.pow(c[i][0] - c[i - 1][0], 2) + Math.pow(c[i][1] - c[i - 1][1], 2) + Math.pow(c[i][2] - c[i - 1][2], 2)); return L; }

  /* ------------------------------------------------------------ as linhas de uma casa até uma piscina */
  function tubosDe(piscina, casa, vP, vC) {
    var G = dep("PiscinaGeo", "./piscinageo.js"); if (!G) return [];
    var pp = G.portasPiscina(vP), pc = G.portasDryPump(vC);
    var V = new Vala(vP.Comprimento / 2 + AFASTA, vP.Largura / 2 + AFASTA);
    /* a porta da casa em coordenadas locais da piscina (a altura segue relativa) */
    function daCasa(p) {
      var m = paraMundo(casa, p), l = paraLocal(piscina, m[0], m[2]);
      return { x: l.x, y: m[1] - (piscina.y || 0), z: l.z };
    }
    function comY(lista, y) { return lista.map(function (q) { return { x: q.x, y: y, z: q.z }; }); }
    /* ponto repetido e dobra de 180° saem: a varredura recusa a dobra, e ela aparece quando a casa fica além do skimmer (a vala passa por ele e volta) */
    function semDobra(l) {
      var c = l.slice(), mudou = true;
      while (mudou) {
        mudou = false;
        for (var i = 1; i < c.length; i++) {
          var a = c[i - 1], b = c[i], e = c[i + 1];
          var ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
          if (Math.abs(ux) + Math.abs(uy) + Math.abs(uz) < 2e-3) { c.splice(i, 1); mudou = true; break; }
          if (!e) continue;
          var vx = e.x - b.x, vy = e.y - b.y, vz = e.z - b.z, dot = ux * vx + uy * vy + uz * vz;
          var cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
          if (dot < 0 && Math.abs(cx) + Math.abs(cy) + Math.abs(cz) < 1e-3) { c.splice(i, 1); mudou = true; break; }
        }
      }
      return c;
    }
    function mundo(lista) { return semDobra(lista).map(function (q) { return paraMundo(piscina, q); }); }
    function ate(porta, y) {           /* porta da casa → desce à vala → L até o retângulo: devolve o trecho e o ponto em que chegou */
      var P = daCasa(porta), E = V.projeta(P), trecho = [{ x: P.x, y: P.y, z: P.z }, { x: P.x, y: y, z: P.z }];
      if (Math.abs(E.x - P.x) > 1e-6 && Math.abs(E.z - P.z) > 1e-6) trecho.push({ x: E.x, y: y, z: P.z });
      trecho.push({ x: E.x, y: y, z: E.z });
      return { trecho: trecho, E: E };
    }
    var lado = pp.lado || -1, zl = lado * V.hz, linhas = [];
    function linha(id, nome, material, dn, pts) { linhas.push({ id: id, nome: nome, material: material, dn: dn, caminho: mundo(pts) }); }

    /* SUCÇÃO: casa → skimmer */
    var dn1 = vP.DN_succao || 0.04, dn2 = vP.DN_retorno || 0.025;
    var S = ate(pc.succao, Y_SUCCAO), Psk = { x: pp.skimmer.x, z: zl };
    var trS = S.trecho.concat(comY(V.caminho(S.E, Psk).slice(1), Y_SUCCAO));
    trS.push({ x: pp.skimmer.x, y: Y_SUCCAO, z: pp.skimmer.z }, { x: pp.skimmer.x, y: pp.skimmer.y, z: pp.skimmer.z });
    linha("succao", "Piscina: sucção DN 40 (skimmer)", MAT_SUCCAO, dn1, trS);
    /* o ralo e a aspiração descem/saem e entram na mesma linha, pelo retângulo até o skimmer */
    var Pr = { x: pp.ralo.x, z: zl }, viaR = V.caminho(Pr, Psk);
    linha("ralo", "Piscina: sucção DN 40 (ralo de fundo)", MAT_SUCCAO, dn1,
      [{ x: pp.ralo.x, y: pp.ralo.y, z: 0 }, { x: pp.ralo.x, y: pp.ralo.y - 0.06, z: 0 }, { x: pp.ralo.x, y: pp.ralo.y - 0.06, z: zl }].concat(comY(viaR, Y_SUCCAO)));
    var Pa = { x: pp.aspiracao.x, z: zl };
    linha("aspiracao", "Piscina: aspiração DN 40", MAT_SUCCAO, dn1, [{ x: pp.aspiracao.x, y: pp.aspiracao.y, z: pp.aspiracao.z }, { x: pp.aspiracao.x, y: pp.aspiracao.y, z: zl }, { x: pp.aspiracao.x, y: Y_SUCCAO, z: zl }]);

    /* RETORNO: casa → 1º bocal → 2º bocal, com a subida de cada um */
    var R = ate(pc.retorno, Y_RETORNO), bocais = arr(pp.retornos).map(function (b) { return { b: b, q: { x: b.x, z: zl } }; });
    bocais.sort(function (a, b) { return Math.abs(V.s(a.q) - V.s(R.E)) - Math.abs(V.s(b.q) - V.s(R.E)); });
    var trR = R.trecho.slice(), atual = R.E;
    bocais.forEach(function (bq) { trR = trR.concat(comY(V.caminho(atual, bq.q).slice(1), Y_RETORNO)); atual = bq.q; });
    linha("retorno", "Piscina: retorno DN 25", MAT_RETORNO, dn2, trR);
    bocais.forEach(function (bq, i) { linha("retorno-" + (i + 1), "Piscina: bocal de retorno " + (i + 1), MAT_RETORNO, dn2, [{ x: bq.q.x, y: Y_RETORNO, z: zl }, { x: bq.q.x, y: bq.b.y, z: zl }, { x: bq.q.x, y: bq.b.y, z: bq.b.z }]); });

    /* DRENAGEM (ponto de descarga: projeto hidráulico) e HIDROTERAPIA (sem jato neste modelo: registro tampado) */
    var Dp = daCasa(pc.drenagem);
    linha("drenagem", "Piscina: drenagem DN 25 (ligar na rede pluvial)", MAT_RETORNO, dn2, [{ x: Dp.x, y: Dp.y, z: Dp.z }, { x: Dp.x, y: Y_DRENO, z: Dp.z }, { x: Dp.x + 0.3, y: Y_DRENO, z: Dp.z }]);
    var Hp = daCasa(pc.hidroterapia);
    linha("hidroterapia", "Piscina: hidroterapia tampada", MAT_RETORNO, dn2, [{ x: Hp.x, y: Hp.y, z: Hp.z }, { x: Hp.x, y: Y_TAMPADO, z: Hp.z }]);
    return linhas;
  }

  var PiscinaDeriv = {
    FAM_PISCINA: FAM_PISCINA, FAM_CASA: FAM_CASA, valores: valores, Vala: Vala, tubosDe: tubosDe,
    /* o que é derivado desta extensão não vira op: quem apaga ou move a peça derivada não acha nada para gravar */
    ehDerivado: function (id) { return /^psc-tubo:/.test(String(id)); },
    aplicar: function (saida) {
      var fams = arr(saida && saida.familias), P = fams.filter(function (f) { return f.famId === FAM_PISCINA; }), C = fams.filter(function (f) { return f.famId === FAM_CASA; });
      if (!P.length && !C.length) return;
      var vols = arr(saida.volumes), G = dep("PiscinaGeo", "./piscinageo.js");
      /* 1) recorte */
      if (G) P.forEach(function (f) {
        var v = valores(f.famId, f.tipoId, f.inst), rc = G.recortePiscina(v), cont = contornoRecorte(f, rc.hC, rc.hL);
        vols.forEach(function (vol) { if (vol.recortavel) recortar(vol, cont); });
      });
      /* 2) tubos: cada casa, a piscina mais perto */
      var BV = dep("BimVolume", "./bimvolume.js");
      if (!G || !BV || !BV.perfilCirculo) return;
      C.forEach(function (c) {
        var melhor = null, dm = Infinity;
        P.forEach(function (f) { var d = Math.pow(f.x - c.x, 2) + Math.pow(f.z - c.z, 2); if (d < dm) { dm = d; melhor = f; } });
        if (!melhor) return;
        var vP = valores(melhor.famId, melhor.tipoId, melhor.inst);
        if (vP.Com_tubulacao === false) return;
        tubosDe(melhor, c, vP, valores(c.famId, c.tipoId, c.inst)).forEach(function (l) {
          saida.volumes.push({ id: "psc-tubo:" + c.id + ":" + l.id, tipo: "volume", categoria: "generico", ifc: "IFCPIPESEGMENT", material: l.material, derivado: true,
            nome: l.nome + " (L = " + (Math.round(compr(l.caminho) * 100) / 100).toFixed(2).replace(".", ",") + " m)",
            receita: { forma: "varredura", perfil: BV.perfilCirculo(l.dn, 10), caminho: l.caminho } });
        });
      });
    }
  };
  function registrar() {
    var BE = global.BimEdit || (typeof require === "function" ? (function () { try { return require("./bimedit.js"); } catch (e) { return null; } })() : null);
    if (BE && BE.estender) BE.estender({ nome: "piscinaDeriv", valida: function () { return undefined; }, aplicar: function () { return false; }, fim: function (ctx, saida) { PiscinaDeriv.aplicar(saida); } });
    return !!BE;
  }
  registrar();
  PiscinaDeriv.registrar = registrar;
  global.PiscinaDeriv = PiscinaDeriv;
  if (typeof module !== "undefined" && module.exports) module.exports = PiscinaDeriv;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
