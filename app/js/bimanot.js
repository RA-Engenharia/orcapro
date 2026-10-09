/* =====================================================================
 * bimanot.js — ANOTAÇÃO 2D do BIM (plano do BIM, fase P5 frente C e fase P7).
 * Arquivo dividido por fase, blocos lado a lado (IIFE própria cada um):
 *   · P5 (identificadores) — cria o objeto BimAnot (BimAnot.parte(...));
 *   · P7 (cotas, texto, símbolos, nuvem, linhas e regiões) — DEPOIS do da P5:
 *     pendura BimAnot.P7 / BimAnotP7 no objeto que a P5 criou (a ordem importa).
 * ===================================================================== */

/* =====================================================================
 * bimanot.js — ANOTAÇÃO do BIM (prévia
 * `?previa=modelador`). Plano do BIM, seção 3.8: um módulo
 * por assunto, motor puro + tela fina.
 *
 * ⚠ ARQUIVO EM PARTES. Cada fase acrescenta o seu BLOCO, sem mexer no dos
 * outros:
 *   · P5 (parte 1) — IDENTIFICADORES: "Identificar por categoria" e
 *     "Identificar todos não identificados" (porta, janela, parede,
 *     ambiente, pilar, viga), o texto vindo do REGISTRO (js/bimparam.js:
 *     Marca, Marca de tipo, Nome do tipo…), desenhados na planta 2D.
 *   · P7 (partes 2 e 3) — cotas, texto, símbolos, linhas e regiões: entram
 *     em blocos próprios, abaixo do bloco P5, com as ops deles registradas
 *     num `BimEdit.estender` próprio (nome diferente).
 * O objeto BimAnot é a raiz comum; cada parte só ACRESCENTA chaves nele.
 *
 * Teste da parte 1: node tools/test-bimanot-ident.js
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ------------------------------------------------ utilidades comuns */
  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function n4(v) { return Math.round(v * 10000) / 10000; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, tipo) { try { if (global.UI && global.UI.toast) global.UI.toast(t, tipo || "info"); } catch (e) {} }

  /* A RAIZ: cada parte (P5, P7…) se inscreve com `parte({ nome, ativo,
     fita(reg, G), planta(d, estilo) → dados|null, svg(dados, estilo, pena),
     clique2d(idVista, ev, ponto) → true se tratou })`. Os ganchos de fora
     (js/bim2dui.js, js/desenho2d.js, js/gestao.js) chamam SÓ a raiz —
     parte nova não precisa de gancho novo. */
  var BimAnot = {
    _partes: [],
    parte: function (p) {
      if (!p || !p.nome) return false;
      this._partes = this._partes.filter(function (x) { return x.nome !== p.nome; }).concat([p]);
      return true;
    },
    ativo: function () { return this._partes.some(function (p) { try { return !!(p.ativo && p.ativo()); } catch (e) { return false; } }); },
    /* fita (gestao.js, junto do BimAmbienteUI.registrar) */
    registrar: function (reg, G) {
      var algum = false;
      this._partes.forEach(function (p) { try { if (p.fita && p.fita(reg, G)) algum = true; } catch (e) {} });
      return algum;
    },
    /* o que a planta leva (gancho no Bim2D._anotar): { <parte>: dados } ou null */
    anotarPlanta: function (d, estilo) {
      var o = null;
      this._partes.forEach(function (p) {
        var x = null; try { x = p.planta ? p.planta(d, estilo) : null; } catch (e) { x = null; }
        if (x) { o = o || {}; o[p.nome] = x; }
      });
      return o;
    },
    /* o SVG de tudo o que as partes puseram (gancho no Desenho2D.svg) */
    svgPlanta: function (dados, estilo, pena) {
      var s = "";
      this._partes.forEach(function (p) { if (dados && dados[p.nome] && p.svg) { try { s += p.svg(dados[p.nome], estilo, pena) || ""; } catch (e) {} } });
      return s;
    },
    /* clique na planta (gancho no Bim2D): a primeira parte que tratar leva */
    clique2d: function (id, ev, ponto) {
      for (var i = 0; i < this._partes.length; i++) { var p = this._partes[i]; try { if (p.clique2d && p.clique2d(id, ev, ponto)) return true; } catch (e) {} }
      return false;
    }
  };

  /* ==================================================================
   * P5 — IDENTIFICADORES (parte 1)
   *
   * O que é: o "Identificador" — a etiqueta na planta que mostra
   * um parâmetro da peça (a Marca da porta "P01", a Marca de tipo da
   * parede "PA-1"…). O TEXTO SAI DO REGISTRO (BimParam.resolver: o mesmo
   * `texto` que a paleta de Propriedades mostra); mudou a Marca, o
   * identificador muda sozinho. Valor vazio mostra "?" (parâmetro sem valor).
   *
   * Onde mora: na lista de operações do editor, POR VISTA (a planta é a
   * vista, id "d2p-<nível>") — desfazer/refazer e nuvem como qualquer edição:
   *   {op:"identificar",   vista, alvos:{<idPeça>: "<idParâmetro>"}}
   *   {op:"desidentificar", vista, alvos:{<idPeça>: 1}}
   * Mapas, nunca lista dentro de lista (a nuvem recusa). A peça apagada
   * leva o identificador junto (o identificador é da peça).
   *
   * AMBIENTE: o identificador de ambiente da P2-D (js/bimambienteui.js —
   * nome; número · área) é REAPROVEITADO: identificar ambientes liga o
   * "Identificadores de ambiente" das plantas. Não há segundo desenho.
   * ================================================================== */
  (function P5(AN) {
    function BP() { return dep("BimParam", "./bimparam.js"); }
    var VISTA_RE = /^d2p-[\w\-]{1,80}$/, PARAM_RE = /^[A-Za-z0-9_:]{1,60}$/, MAX_ALVOS = 3000;

    /* as categorias que se identificam e o parâmetro de cada uma por padrão.
       Padrão da RA (projeto brasileiro): esquadria e estrutura pela MARCA
       (P01, J01, P01/V01 — a planta de fôrma numera pilar e viga), parede
       pela MARCA DE TIPO (PA-1, o tipo de alvenaria). Trocável no diálogo. */
    var CATS = {
      porta: { rotulo: "Portas", param: "ALL_MODEL_MARK", forma: "oval" },
      janela: { rotulo: "Janelas", param: "ALL_MODEL_MARK", forma: "hexagono" },
      parede: { rotulo: "Paredes", param: "ALL_MODEL_TYPE_MARK", forma: "losango" },
      ambiente: { rotulo: "Ambientes", param: "ROOM_NUMBER", ambiente: true },
      pilar: { rotulo: "Pilares estruturais", param: "ALL_MODEL_MARK", forma: "texto" },
      viga: { rotulo: "Quadro estrutural", param: "ALL_MODEL_MARK", forma: "texto" }
    };
    var ORDEM = ["porta", "janela", "parede", "ambiente", "pilar", "viga"];
    /* os parâmetros que o identificador pode mostrar (os ids do registro) */
    var PARAMS = ["ALL_MODEL_MARK", "ALL_MODEL_TYPE_MARK", "ELEM_TYPE_PARAM", "ALL_MODEL_INSTANCE_COMMENTS", "ALL_MODEL_DESCRIPTION"];

    /* o rótulo do parâmetro pelo registro ("Marca", "Marca de tipo"…) */
    function rotuloParam(cat, id) {
      var B = BP(), d = B && B.REGISTRO[cat] ? B.definicao(cat, id) : null;
      return d ? d.nome : id;
    }
    function opcoesParam(cat) {
      var B = BP();
      return PARAMS.filter(function (id) { return !B || !B.REGISTRO[cat] || !!B.definicao(cat, id); }).map(function (id) { return { id: id, rotulo: rotuloParam(cat, id) }; });
    }

    /* ----------------------------------------------- ops */
    function validaOp(o) {
      if (!o || (o.op !== "identificar" && o.op !== "desidentificar")) return undefined;
      if (typeof o.vista !== "string" || !VISTA_RE.test(o.vista)) return false;
      if (!o.alvos || typeof o.alvos !== "object" || Array.isArray(o.alvos)) return false;
      var ks = Object.keys(o.alvos);
      if (!ks.length || ks.length > MAX_ALVOS) return false;
      return ks.every(function (k) {
        if (!k || k.length > 80) return false;
        var v = o.alvos[k];
        return o.op === "identificar" ? (typeof v === "string" && PARAM_RE.test(v)) : (v === 1 || v === true);
      });
    }
    function aplicarOp(o, ctx) {
      if (!o || (o.op !== "identificar" && o.op !== "desidentificar")) return false;
      if (validaOp(o) !== true) return false;
      if (!ctx.ext.idents) { ctx.ext.idents = {}; ctx.ext.ordemIdents = []; }
      var I = ctx.ext.idents, O = ctx.ext.ordemIdents, feitos = 0;
      Object.keys(o.alvos).forEach(function (alvo) {
        var k = o.vista + "|" + alvo;
        if (o.op === "desidentificar") { if (I[k]) { delete I[k]; O.splice(O.indexOf(k), 1); feitos++; } return; }
        I[k] = { id: k, vista: o.vista, alvo: String(alvo), param: o.alvos[alvo] };
        if (O.indexOf(k) < 0) O.push(k);
        feitos++;
      });
      return feitos > 0;
    }
    /* o identificador da peça que sumiu sai junto (o identificador é da peça) */
    function fimOp(ctx, out) {
      if (!ctx.ext.idents) return;
      var vivos = {};
      arr(out.caixas).forEach(function (c) { if (c) vivos[String(c.id)] = 1; });
      arr(out.familias).forEach(function (f) { if (f) vivos[String(f.id)] = 1; });
      out.identificadores = ctx.ext.ordemIdents.map(function (k) { return ctx.ext.idents[k]; }).filter(function (x) { return x && vivos[x.alvo]; });
    }
    function registrar(BimEdit) {
      if (!BimEdit || typeof BimEdit.estender !== "function") return false;
      BimEdit.estender({ nome: "anot-p5", aplicar: aplicarOp, fim: fimOp, valida: validaOp });
      return true;
    }

    /* ----------------------------------------------- o que a planta enxerga */
    function dirDe(rot) { return { ux: Math.cos(rot || 0), uz: -Math.sin(rot || 0) }; }
    function caixaPorId(estado) { var m = {}; arr(estado && estado.caixas).forEach(function (c) { if (c) m[String(c.id)] = c; }); return m; }
    function catFam(f, deps) {
      var c = null;
      try { if (deps && typeof deps.categoriaFam === "function") c = deps.categoriaFam(f.famId); } catch (e) { c = null; }
      return c === "porta" || c === "janela" ? c : null;
    }
    /* cortada pelo plano da planta? (y0..y1 contém o corte) */
    function corta(y0, y1, yc) { return y0 <= yc + 1e-6 && y1 >= yc - 1e-6; }
    /* as peças que a planta MOSTRA e se identificam: { id, cat, x, y (planta),
       ux, uy (eixo), meia (meia espessura), r (raio do pilar), L } —
       plantaDef = { id, nivel:{y}, altura } (Bim2D.def) */
    function pecasNaPlanta(estado, plantaDef, deps) {
      var out = [], cx = caixaPorId(estado);
      var y0 = num(plantaDef && plantaDef.nivel && plantaDef.nivel.y, 0), yc = y0 + num(plantaDef && plantaDef.altura, 1.2);
      var parVis = {};
      arr(estado && estado.caixas).forEach(function (c) {
        if (!c) return;
        var d = dirDe(c.rotY);
        if (c.tipo === "parede") {
          var b = num(c.cy, 0) - num(c.altura, 0) / 2;
          if (!corta(b, b + num(c.altura, 0), yc)) return;
          parVis[String(c.id)] = 1;
          out.push({ id: String(c.id), cat: "parede", x: num(c.cx, 0), y: num(c.cz, 0), ux: d.ux, uy: d.uz, meia: num(c.espessura, 0.15) / 2, L: num(c.comprimento, 0) });
        } else if (c.tipo === "pilar") {
          var bp = c.basePilar != null ? num(c.basePilar, 0) : num(c.cy, 0) - num(c.altura, 0) / 2, hp = num(c.comprimentoPilar, num(c.altura, 0));
          if (!corta(bp, bp + hp, yc)) return;
          out.push({ id: String(c.id), cat: "pilar", x: num(c.cx, 0), y: num(c.cz, 0), ux: d.ux, uy: d.uz, r: Math.max(num(c.comprimento, 0.2), num(c.espessura, 0.2)) / 2 });
        } else if (c.tipo === "viga") {
          var tv = c.topoViga != null ? num(c.topoViga, 0) : num(c.cy, 0) + num(c.altura, 0) / 2;
          /* a viga do teto deste pavimento: acima do corte, até 3,5 m (a faixa das instalações) */
          if (!(tv > y0 + 0.05 && tv <= yc + 3.5)) return;
          out.push({ id: String(c.id), cat: "viga", x: num(c.cx, 0), y: num(c.cz, 0), ux: d.ux, uy: d.uz, meia: num(c.espessura, 0.15) / 2, L: num(c.comprimento, 0) });
        }
      });
      arr(estado && estado.familias).forEach(function (f) {
        if (!f || !f.host || !parVis[String(f.host.id)]) return;
        var cat = catFam(f, deps); if (!cat) return;
        var h = cx[String(f.host.id)], d = dirDe(h ? h.rotY : f.rotY);
        /* a largura do VÃO (Familia.avaliar, a mesma do quantitativo): o clique dentro do vão é da porta */
        var av = null; try { av = deps && typeof deps.avaliarFam === "function" ? deps.avaliarFam(f.famId, f.tipoId, f.inst) : null; } catch (eAv) { av = null; }
        var larg = av && av.abertura && fin(Number(av.abertura.largura)) ? Number(av.abertura.largura) : 0.8;
        out.push({ id: String(f.id), cat: cat, x: num(f.x, 0), y: num(f.z, 0), ux: d.ux, uy: d.uz, meia: h ? num(h.espessura, 0.15) / 2 : 0.075, host: String(f.host.id), larg: larg });
      });
      return out;
    }
    /* onde a etiqueta fica (planta, m): k = metros por mm de papel */
    function posicao(p, k) {
      var nx = -p.uy, ny = p.ux;   /* normal à esquerda do eixo */
      if (p.cat === "pilar") return { x: p.x + p.r + 1.5 * k, y: p.y - p.r - 1.5 * k, ancora: "start" };
      var off = p.cat === "parede" ? p.meia + 6 * k : (p.cat === "viga" ? p.meia + 3.5 * k : p.meia + 4.5 * k);
      /* parede: um quarto do comprimento, para não cair em cima da porta do meio */
      var al = p.cat === "parede" && p.L > 0 ? -p.L / 4 : 0;
      return { x: p.x + nx * off + p.ux * al, y: p.y + ny * off + p.uy * al, ancora: "middle" };
    }
    /* o texto do identificador pelo REGISTRO; vazio = "?" (parâmetro sem valor) */
    function textoDe(res, alvo, param) {
      var p = res && res.porId && res.porId[alvo];
      if (!p) return "?";
      var it = p.porId && p.porId[param];
      var t = it ? txt(it.texto).trim() : "";
      return t || "?";
    }
    /* os identificadores da vista que se desenham: [{ id, alvo, cat, x, y, texto, forma, ancora }] */
    function planta(estado, res, plantaDef, estilo, deps) {
      var k = num(estilo && estilo.escala, 50) / 1000, vista = plantaDef && plantaDef.id;
      var mapa = {}; pecasNaPlanta(estado, plantaDef, deps).forEach(function (p) { mapa[p.id] = p; });
      var itens = [];
      arr(estado && estado.identificadores).forEach(function (ide) {
        if (ide.vista !== vista) return;
        var p = mapa[ide.alvo]; if (!p) return;   /* a peça não aparece nesta planta */
        var q = posicao(p, k);
        itens.push({ id: ide.id, alvo: ide.alvo, cat: p.cat, param: ide.param, x: n4(q.x), y: n4(q.y), ancora: q.ancora, texto: textoDe(res, ide.alvo, ide.param), forma: (CATS[p.cat] || {}).forma || "texto" });
      });
      return itens.length ? { itens: itens } : null;
    }
    /* as peças da planta SEM identificador nesta vista, por categoria */
    function naoIdentificados(estado, plantaDef, deps) {
      var tem = {}, out = {};
      arr(estado && estado.identificadores).forEach(function (x) { if (x.vista === (plantaDef && plantaDef.id)) tem[x.alvo] = 1; });
      ORDEM.forEach(function (c) { if (!CATS[c].ambiente) out[c] = []; });
      pecasNaPlanta(estado, plantaDef, deps).forEach(function (p) { if (!tem[p.id] && out[p.cat]) out[p.cat].push(p.id); });
      return out;
    }
    /* "Identificar todos não identificados": uma op para as categorias
       marcadas ({cat: idParâmetro}). → { ok, op, n, porCat } */
    function opIdentificarTodos(estado, plantaDef, escolha, deps) {
      if (!plantaDef || !VISTA_RE.test(String(plantaDef.id))) return { ok: false, motivo: "Abra uma planta: o identificador é da vista." };
      var falta = naoIdentificados(estado, plantaDef, deps), alvos = {}, n = 0, porCat = {};
      Object.keys(escolha || {}).forEach(function (cat) {
        if (!falta[cat]) return;
        var prm = PARAM_RE.test(txt(escolha[cat])) ? escolha[cat] : CATS[cat].param;
        porCat[cat] = falta[cat].length;
        falta[cat].forEach(function (id) { alvos[id] = prm; n++; });
      });
      if (!n) return { ok: false, motivo: "Nada a identificar: as peças dessas categorias já têm identificador nesta planta (ou não aparecem nela).", n: 0, porCat: porCat };
      return { ok: true, op: { op: "identificar", vista: String(plantaDef.id), alvos: alvos }, n: n, porCat: porCat };
    }
    function opIdentificarUm(plantaDef, id, cat, param) {
      if (!plantaDef || !VISTA_RE.test(String(plantaDef.id)) || !CATS[cat] || CATS[cat].ambiente) return { ok: false, motivo: "Peça sem identificador nesta vista." };
      var a = {}; a[String(id)] = PARAM_RE.test(txt(param)) ? param : CATS[cat].param;
      return { ok: true, op: { op: "identificar", vista: String(plantaDef.id), alvos: a } };
    }
    function opRemover(estado, plantaDef, cats, deps) {
      var vista = plantaDef && plantaDef.id, alvos = {}, n = 0, catDe = {};
      pecasNaPlanta(estado, plantaDef, deps).forEach(function (p) { catDe[p.id] = p.cat; });
      arr(estado && estado.identificadores).forEach(function (x) {
        if (x.vista !== vista) return;
        if (cats && !cats[catDe[x.alvo]]) return;
        alvos[x.alvo] = 1; n++;
      });
      if (!n) return { ok: false, motivo: "Esta planta não tem identificador dessas categorias." };
      return { ok: true, op: { op: "desidentificar", vista: String(vista), alvos: alvos }, n: n };
    }
    /* a peça identificável mais perto do clique (planta, m) — parede pela
       distância ao eixo, o resto pelo centro; null se nenhuma no raio */
    function maisProxima(pecas, x, y, raio) {
      var melhor = null, dm = Infinity;
      arr(pecas).forEach(function (p) {
        var d;
        if ((p.cat === "parede" || p.cat === "viga") && p.L > 0) {
          var t = (x - p.x) * p.ux + (y - p.y) * p.uy; t = Math.max(-p.L / 2, Math.min(p.L / 2, t));
          var qx = p.x + p.ux * t, qy = p.y + p.uy * t;
          d = Math.sqrt(Math.pow(x - qx, 2) + Math.pow(y - qy, 2)) - p.meia;
        } else if (p.cat === "pilar") d = Math.sqrt(Math.pow(x - p.x, 2) + Math.pow(y - p.y, 2)) - p.r;
        else {
          /* porta/janela: fora do VÃO ao longo da parede + fora da espessura */
          var al = (x - p.x) * p.ux + (y - p.y) * p.uy, pe = Math.abs((x - p.x) * (-p.uy) + (y - p.y) * p.ux);
          d = Math.max(Math.abs(al) - num(p.larg, 0.8) / 2, 0) + Math.max(pe - num(p.meia, 0.075), 0);
        }
        /* porta e janela ganham da parede onde estão (estão "em cima" dela): sem a folga, o clique
           dentro do vão caía na parede, que está mais perto do eixo */
        if (p.cat === "porta" || p.cat === "janela") d -= 0.1;
        if (d < dm) { dm = d; melhor = p; }
      });
      return melhor && dm <= raio ? melhor : null;
    }

    /* ----------------------------------------------- desenho (SVG da planta)
       Tamanho de PAPEL: texto de 2,5 mm na escala da vista (1:50 → 0,125 m),
       como as cotas do js/desenho2d.js. A moldura muda por categoria (oval na
       porta, hexágono na janela, losango na parede; estrutura só o texto). */
    function svgTexto(x, y, h, conteudo, cls, ancora) {
      var s = h / 100;
      return '<text x="0" y="0" font-size="100" text-anchor="' + (ancora || "middle") + '" dominant-baseline="central" transform="translate(' + n4(x) + " " + n4(y) + ") scale(" + (Math.round(s * 1e7) / 1e7) + ')" class="' + cls + '">' + conteudo + "</text>";
    }
    function svgIdentificadores(dados, estilo, pena) {
      if (!dados || !arr(dados.itens).length) return "";
      var k = num(estilo && estilo.escala, 50) / 1000, h = 2.5 * k, lw = (pena && pena.cota) || 0.8, s = "";
      dados.itens.forEach(function (it) {
        var t = txt(it.texto), w = Math.max(t.length * h * 0.62, h * 1.2), x = it.x, y = it.y, mold = "";
        var ex = it.ancora === "start" ? x + w / 2 : x;   /* centro da moldura */
        if (it.forma === "oval") mold = '<rect x="' + n4(ex - w / 2 - 1.2 * k) + '" y="' + n4(y - h / 2 - 1 * k) + '" width="' + n4(w + 2.4 * k) + '" height="' + n4(h + 2 * k) + '" rx="' + n4((h + 2 * k) / 2) + '"';
        else if (it.forma === "hexagono") {
          var a = w / 2 + 1.2 * k, b = h / 2 + 1 * k, c = 1.2 * k;
          mold = '<path d="M' + n4(ex - a - c) + " " + n4(y) + "L" + n4(ex - a) + " " + n4(y - b) + "L" + n4(ex + a) + " " + n4(y - b) + "L" + n4(ex + a + c) + " " + n4(y) + "L" + n4(ex + a) + " " + n4(y + b) + "L" + n4(ex - a) + " " + n4(y + b) + 'Z"';
        } else if (it.forma === "losango") {
          var a2 = w / 2 + 2.2 * k, b2 = h / 2 + 1.6 * k;
          mold = '<path d="M' + n4(ex - a2) + " " + n4(y) + "L" + n4(ex) + " " + n4(y - b2) + "L" + n4(ex + a2) + " " + n4(y) + "L" + n4(ex) + " " + n4(y + b2) + 'Z"';
        }
        s += '<g class="d2-ident d2-ident-' + esc(it.cat) + (it.texto === "?" ? " d2-ident-vazio" : "") + '" data-d2-ident="' + esc(it.alvo) + '" data-d2-ident-cat="' + esc(it.cat) + '">' +
          '<rect x="' + n4(ex - w / 2 - 2 * k) + '" y="' + n4(y - h / 2 - 1.6 * k) + '" width="' + n4(w + 4 * k) + '" height="' + n4(h + 3.2 * k) + '" class="d2-ident-alvo"/>' +
          (mold ? mold + ' class="d2-ident-moldura" stroke-width="' + lw + '" vector-effect="non-scaling-stroke"/>' : "") +
          svgTexto(it.ancora === "start" ? x : x, y, h, esc(t), "d2-ident-tx", it.ancora) + "</g>";
      });
      return s ? '<g class="d2-identificadores">' + s + "</g>" : "";
    }

    /* =============================================================== TELA */
    var tela = {
      _G: null, _ferr: false, _tecla: null,
      ativoP5: function () { try { return !!(global.BimPrevia && global.BimPrevia.modelador() && BP() && global.BIM && global.BIM.editarEstado); } catch (e) { return false; } },
      _estado: function () { var b = global.BIM, e = b && b.editarEstado ? b.editarEstado() : null; return e ? e.estado : null; },
      /* o registro resolvido com as dependências da tela (as mesmas da paleta) */
      _res: function () {
        try { var U = global.BimPropsUI, c = U && U.contextoTela ? U.contextoTela() : null; if (c && c.res) return { res: c.res, deps: c.deps }; } catch (e) {}
        var st = this._estado(), B = BP();
        return { res: st && B ? B.resolver(st, {}) : null, deps: {} };
      },
      /* gancho P5 no Bim2D._anotar (js/bim2dui.js) */
      anotarPlanta: function (d, estilo) {
        if (!this.ativoP5() || !d || d.tipo !== "planta") return null;
        var st = this._estado(); if (!st || !arr(st.identificadores).length) return null;
        var r = this._res();
        return planta(st, r.res, d, estilo, r.deps);
      },
      _plantaAtiva: function (abrir) {
        var G = this._G, P = global.Bim2D, id = null;
        try { var at = G && G._bimVxEst ? G._bimVxEst().ativa : null; if (at && /^d2p-/.test(at)) id = at; } catch (e) {}
        if (!id && G && G._d2PlantaPadrao) { try { id = G._d2PlantaPadrao(); if (id && abrir && G._d2Abrir) G._d2Abrir(id, (P.def(id) || {}).nome || "Planta baixa"); } catch (e2) {} }
        return id && P ? P.def(id) : null;
      },
      _redesenhar: function (id) { var P = global.Bim2D; try { if (P && P._cache[id]) P.redesenhar(id, false); } catch (e) {} },
      _op: function (o) {
        var b = global.BIM; if (!b || !b.b2Op) return false;
        var ok = b.b2Op(o);
        if (ok !== false) this._redesenhar(o.vista);
        return ok !== false;
      },
      /* ------------------------------------------ fita */
      registrarP5: function (reg, G) {
        this._G = G || this._G;
        if (!this.ativoP5() || !global.BimRibbon) return false;
        var self = this, R = global.BimRibbon;
        R.acrescentar("anotar", "Anotar", "Identificador", [
          { id: "identificar-categoria", rotulo: "Identificar por\ncategoria", icone: "nota", grande: true, tipo: "alterna", dica: "Identificar por categoria: com uma planta aberta, clique numa porta, janela, parede, pilar ou viga — a etiqueta aparece com o parâmetro da categoria (Marca da porta: P01). O texto vem das Propriedades: mudou a Marca, a etiqueta muda. Esc encerra." },
          { id: "identificar-todos", rotulo: "Identificar\ntodos", icone: "lista", grande: true, dica: "Identificar todos não identificados: escolha as categorias (portas, janelas, paredes, ambientes, pilares, vigas) e o parâmetro de cada uma; todas as peças da planta sem etiqueta ganham a sua, de uma vez (um Ctrl+Z desfaz)." }
        ]);
        reg["identificar-categoria"] = function (e) { return self.armar(!(e && e.ligado === false)); };
        reg["identificar-todos"] = function () { self.dialogoTodos(); return true; };
        try { if (global.BimPrecisao && global.BimPrecisao.ATALHOS && !global.BimPrecisao.ATALHOS.TG) global.BimPrecisao.ATALHOS.TG = "identificar-categoria"; } catch (eA) {}
        return true;
      },
      armar: function (on) {
        var self = this;
        this._ferr = !!on;
        try { if (global.BimRibbon) global.BimRibbon.setAtivo("identificar-categoria", this._ferr); if (global.BimShell) global.BimShell.pintarFita(); } catch (e) {}
        if (this._ferr) {
          /* UMA FERRAMENTA POR VEZ: a de modelar (parede, laje…) que ficou armada vem ANTES no
             clique da planta (js/bim2dui.js) — o clique na parede para identificar virava o 1º
             ponto de uma parede nova, e o clique na etiqueta não selecionava (achado pela e2e-bim-p5) */
          try { var pa = global.BIM && global.BIM.planta2d ? global.BIM.planta2d() : null; if (pa && pa.desarmar) pa.desarmar(); } catch (eD) {}
          var d = this._plantaAtiva(true);
          status(d ? "Identificar por categoria: clique numa porta, janela, parede, pilar ou viga da " + d.nome + ". Esc encerra." : "Identificar por categoria: abra uma planta (Vista › Planta baixa) e clique na peça.");
          if (!this._tecla && typeof document !== "undefined") {
            this._tecla = function (ev) { if (ev.key === "Escape" && self._ferr) self.armar(false); };
            document.addEventListener("keydown", this._tecla, true);
          }
        } else {
          if (this._tecla && typeof document !== "undefined") { document.removeEventListener("keydown", this._tecla, true); this._tecla = null; }
          status("Identificar por categoria encerrado.");
        }
        return true;
      },
      /* gancho P5 no clique da planta (js/bim2dui.js): com a ferramenta,
         identifica a peça mais perto; sem ela, clicar na etiqueta seleciona */
      clique2d: function (id, ev, p) {
        if (!this.ativoP5() || !/^d2p-/.test(String(id))) return false;
        var alvo = ev && ev.target && ev.target.closest ? ev.target.closest("[data-d2-ident]") : null;
        if (!this._ferr) {
          if (!alvo) return false;
          this.selecionar(alvo.getAttribute("data-d2-ident"));
          return true;
        }
        if (!p) return true;
        var P = global.Bim2D, d = P ? P.def(id) : null, st = this._estado(); if (!d || !st) return true;
        var r = this._res(), k = num(P.estilo(id).escala, 50) / 1000;
        var pc = maisProxima(pecasNaPlanta(st, d, r.deps), p[0], p[1], Math.max(0.25, 4 * k));
        if (!pc) { status("Nenhuma porta, janela, parede, pilar ou viga perto do clique."); return true; }
        var ja = arr(st.identificadores).some(function (x) { return x.vista === d.id && x.alvo === pc.id; });
        if (ja) { status("Esta peça já tem identificador nesta planta."); return true; }
        var o = opIdentificarUm(d, pc.id, pc.cat, CATS[pc.cat].param);
        if (o.ok && this._op(o.op)) status((CATS[pc.cat].rotulo.replace(/s$/, "") + " identificada: " + textoDe(this._res().res, pc.id, o.op.alvos[pc.id]) + ". Clique em outra peça, ou Esc."));
        return true;
      },
      selecionar: function (alvo) {
        var b = global.BIM;
        try { if (b && b._selecionarUid && b._selecionarUid("edit:" + alvo)) { status("Selecionado pelo identificador. As propriedades estão em Propriedades."); return true; } } catch (e) {}
        return false;
      },
      /* ------------------------------------------ "Identificar todos" */
      dialogoTodos: function () {
        var self = this, d = this._plantaAtiva(true), st = this._estado();
        if (!d || !st) { toast("Abra uma planta (Vista › Planta baixa): o identificador é da vista.", "aviso"); return false; }
        var r = this._res(), falta = naoIdentificados(st, d, r.deps);
        var AU = global.BimAmbienteUI, ambsN = 0, identAmb = true;
        try { if (AU && AU.ativo()) { ambsN = AU.ambientesDoNivel(arr(st.ambientes), AU.niveisObra(), d.nivel.id).length; identAmb = AU.identLigado(); } } catch (eA) {}
        if (!global.UI || !global.UI.modal) return false;
        var h = '<p class="muted" style="margin:0 0 10px">Na <b>' + esc(d.nome) + "</b>, as peças de cada categoria marcada que ainda não têm etiqueta ganham a sua. O texto vem das Propriedades.</p>" +
          '<table class="tbl p5i-tab"><thead><tr><th></th><th>Categoria</th><th>Sem identificador</th><th>Mostrar</th></tr></thead><tbody>';
        ORDEM.forEach(function (cat) {
          var C = CATS[cat], n = C.ambiente ? (identAmb ? 0 : ambsN) : falta[cat].length;
          var sel = C.ambiente ? '<span class="muted">nome; número · área</span>' :
            '<select data-p5i-param="' + cat + '">' + opcoesParam(cat).map(function (o) { return '<option value="' + esc(o.id) + '"' + (o.id === C.param ? " selected" : "") + ">" + esc(o.rotulo) + "</option>"; }).join("") + "</select>";
          h += '<tr><td><input type="checkbox" data-p5i-cat="' + cat + '"' + (n ? " checked" : " disabled") + ' aria-label="' + esc(C.rotulo) + '"></td><td>' + esc(C.rotulo) + '</td><td data-p5i-n="' + cat + '">' + n + "</td><td>" + sel + "</td></tr>";
        });
        h += "</tbody></table>";
        global.UI.modal("Identificar todos não identificados", h, [
          { texto: "Remover os desta planta", classe: "ghost", onClick: function () {
            var o = opRemover(self._estado(), d, null, self._res().deps);
            global.UI.fecharModal();
            if (!o.ok) { toast(o.motivo, "aviso"); return; }
            if (self._op(o.op)) status(o.n + " identificador(es) removido(s) da " + d.nome + ". Ctrl+Z desfaz.");
          } },
          { texto: "Cancelar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } },
          { texto: "Identificar", classe: "primary", onClick: function () {
            var esc2 = {}, amb = false;
            Array.prototype.forEach.call(document.querySelectorAll("[data-p5i-cat]"), function (c) {
              if (!c.checked) return;
              var cat = c.getAttribute("data-p5i-cat");
              if (CATS[cat].ambiente) { amb = true; return; }
              var s = document.querySelector('[data-p5i-param="' + cat + '"]');
              esc2[cat] = s ? s.value : CATS[cat].param;
            });
            global.UI.fecharModal();
            self.identificarTodos(esc2, amb, d);
          } }
        ]);
        return true;
      },
      identificarTodos: function (escolha, ambientes, d) {
        d = d || this._plantaAtiva(true);
        var st = this._estado(); if (!d || !st) return { ok: false, motivo: "Abra uma planta." };
        var msgs = [], res = { ok: false, n: 0 };
        if (ambientes && global.BimAmbienteUI && global.BimAmbienteUI.ativo()) { global.BimAmbienteUI.definirPlantas({ identAmbiente: true }); msgs.push("ambientes identificados"); res.ok = true; }
        if (escolha && Object.keys(escolha).length) {
          var o = opIdentificarTodos(st, d, escolha, this._res().deps);
          if (o.ok && this._op(o.op)) {
            res = { ok: true, n: o.n, op: o.op };
            msgs.unshift(Object.keys(o.porCat).filter(function (c) { return o.porCat[c]; }).map(function (c) { return o.porCat[c] + " " + CATS[c].rotulo.toLowerCase(); }).join(", "));
          } else if (!o.ok && !msgs.length) { toast(o.motivo, "aviso"); return o; }
        }
        status("Identificar todos (" + d.nome + "): " + msgs.join("; ") + ". Ctrl+Z desfaz.");
        return res;
      }
    };

    AN.P5 = {
      CATS: CATS, ORDEM: ORDEM, PARAMS: PARAMS, VISTA_RE: VISTA_RE,
      validaOp: validaOp, aplicarOp: aplicarOp, registrar: registrar,
      rotuloParam: rotuloParam, opcoesParam: opcoesParam,
      pecasNaPlanta: pecasNaPlanta, posicao: posicao, textoDe: textoDe, planta: planta,
      naoIdentificados: naoIdentificados, opIdentificarTodos: opIdentificarTodos, opIdentificarUm: opIdentificarUm, opRemover: opRemover,
      maisProxima: maisProxima, svgIdentificadores: svgIdentificadores
    };
    /* a tela da parte 1 (AN.P5UI) e a inscrição na raiz */
    AN.P5UI = tela;
    AN.parte({
      nome: "identificadores",
      ativo: function () { return tela.ativoP5(); },
      fita: function (reg, G) { return tela.registrarP5(reg, G); },
      planta: function (d, estilo) { return tela.anotarPlanta(d, estilo); },
      svg: svgIdentificadores,
      clique2d: function (id, ev, p) { return tela.clique2d(id, ev, p); }
    });
    var BE = dep("BimEdit", "./bimedit.js"); if (BE) registrar(BE);
  })(BimAnot);

  /* ==================================================================
   * (P7 — cotas, texto, símbolos, linhas e regiões: o bloco entra aqui,
   *  acrescentando chaves no BimAnot e com o seu BimEdit.estender próprio)
   * ================================================================== */

  global.BimAnot = BimAnot;
  if (typeof module !== "undefined" && module.exports) module.exports = BimAnot;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * P7 — ANOTAÇÃO (09/10/2026). Frentes A (cotas), B (texto e símbolos) e
 * C (linhas e regiões). A tela é o js/bimanot2dui.js; o desenho entra no
 * SVG do js/desenho2d.js por um gancho "P7".
 *
 * O QUE VEM DA CONVENÇÃO E O QUE A RA DÁ. Da convenção de mercado (inventário
 * de parâmetros: tiposCota/tiposTexto/elementos.cota/texto) vêm os
 * NOMES — dos tipos ("Linear - … mm Arial"), dos parâmetros ("Tamanho do
 * texto", "Prefixo do dimensionamento", "Texto de igualdade"…, conferidos
 * BuiltInParameter a BuiltInParameter no teste) — e o COMPORTAMENTO: a cota
 * se prende a REFERÊNCIAS (face, eixo, ponta da peça) e acompanha quando a
 * peça anda; cota em cadeia; EQ; travar; anotação é da VISTA. Os VALORES
 * visuais (altura de texto, marca de cota, penas, padrões de hachura) são do
 * padrão RA de detalhamento (js/padraodet.js — NBR 10126, 6492, 8403):
 * texto 2,5 mm, traço oblíquo 1,5 mm, extensão 1,5 mm, afastamento 1 mm,
 * penas do CTB da RA. Nenhum .pat, ícone ou texto de ajuda da Autodesk.
 *
 * ONDE MORA. Anotação é POR VISTA: cada item leva `vista`
 * (o id da vista 2D do js/bim2dui.js: "d2p-<nível>" ou "d2c-<corte>") e vai
 * nas OPS do editor (js/bimedit.js, gancho `estender`) — por obra, com o
 * desfazer de sempre. Coordenadas = as da VISTA em metros (na planta, x e z
 * do mundo; no corte, as do desenho do corte). Nada de lista dentro de
 * lista (a nuvem recusa): pontos são [{x, y}], referências [{el, r, s, x, y}].
 *
 * OPS
 *   { op:"anot2d", id, vista, tipo, …campos }  cria/substitui um item:
 *       tipo = cota | texto | simbolo | notaChave | nuvem | linha | regiao |
 *              componente | legenda
 *   { op:"anot2dAjustar", id, campos:{…} }     muda campos (Propriedades)
 *   { op:"anot2dTipo", id, cat:"cota"|"texto", nome, base, valores:{…} }
 *       tipo de cota/texto do PROJETO (Duplicar / Editar tipo)
 *   { op:"revisao", id, numero, data, descricao, emitidoPor }
 *       revisão do projeto (a P8 mostra no carimbo: `revisoes(estado)`)
 *   { op:"mover", id, dx, dy } / { op:"apagar", id }  sobre itens daqui
 *   A saída do replay ganha `estado.anot2d = { itens, revisoes, tipos,
 *   violadas, orfas }` (um OBJETO: o snap do js/bimprecisao.js só percorre
 *   listas do estado).
 *
 * Teste: node tools/test-bimanot-cotas.js · node tools/test-bimanot-texto.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Array.isArray(v) ? v : []; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function txt(v) { return v == null ? "" : String(v); }
  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function D2() { return dep("Desenho2D", "./desenho2d.js"); }

  /* ------------------------------------------------------------ vetores */
  function V(x, y) { return [x, y]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function mul(a, k) { return [a[0] * k, a[1] * k]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  function len(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1]); }
  function unit(a) { var L = len(a); return L > 1e-12 ? [a[0] / L, a[1] / L] : null; }
  function perp(a) { return [-a[1], a[0]]; }
  function pt(p) { return p && fin(+p.x) && fin(+p.y) ? [+p.x, +p.y] : null; }
  function ptObj(p) { return { x: r6(p[0]), y: r6(p[1]) }; }

  /* ===================================================== PENAS DA RA
   * O CTB do padrão RA (js/padraodet.js, cor_pena_ctb): pena → mm de papel.
   * Na tela vira px (non-scaling-stroke), na proporção do jogo da vista. */
  var PENAS_RA = { 1: 0.13, 2: 0.18, 3: 0.25, 4: 0.35, 5: 0.50, 6: 0.70, 7: 0.25, 8: 0.13, 9: 0.09 };
  var JOGO = { fina: 0.75, media: 1, grossa: 1.35 };
  function penaPx(pena, jogo) {
    var mm = PENAS_RA[Math.round(num(pena, 1))] || 0.13;
    return Math.round(Math.max(0.45, mm * 5.5) * (JOGO[jogo] || 1) * 100) / 100;
  }

  /* ===================================================== TIPOS DE COTA
   * Nomes no formato de mercado "Linear - 2,5 mm Arial" (o número é a
   * altura do texto, que aqui é a da RA). `estilo` é o
   * DimensionStyleType (Linear, Angular, Radial, Diâmetro,
   * ComprimentoDoArco, CotaDeElevação, InclinaçãoDePonto). */
  var BASE_COTA = { fonte: "Arial", texto: 2.5, pena: 1, penaMarca: 4, marca: "obliquo", tamMarca: 1.5,
                    extLinha: 1.5, extChamada: 1.5, intervalo: 1.0, deslocTexto: 0.8, unidade: "m", casas: 2,
                    prefixo: "", sufixo: "", textoEq: "EQ", fundo: "Opaco", sequencia: "Contínuo",
                    negrito: false, italico: false, sublinhado: false, fatorLargura: 1, cor: "" };
  function tipoC(id, nome, estilo, extra) {
    var o = clone(BASE_COTA); o.id = id; o.nome = nome; o.estilo = estilo; o.ra = true;
    Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  var TIPOS_COTA = [
    tipoC("linear", "Linear - 2,5 mm Arial", "Linear"),
    tipoC("linear-cm", "Linear - 2 mm Arial (cm)", "Linear", { texto: 2.0, unidade: "cm", casas: 0 }),
    tipoC("linear-centro", "Linear com centro - 2,5 mm Arial", "Linear", { centro: true }),
    tipoC("angular", "Angular - 2,5 mm Arial", "Angular", { casas: 2 }),
    tipoC("radial", "Radial - 2,5 mm Arial", "Radial", { marca: "seta", prefixo: "R " }),
    tipoC("diametro", "Diâmetro - 2,5 mm Arial", "Diametro", { marca: "seta", prefixo: "Ø " }),
    tipoC("arco", "Comprimento do arco - 2,5 mm Arial", "ComprimentoDoArco"),
    tipoC("elevacao", "Cota de elevação - Triângulo RA", "CotaDeElevacao", { simbolo: "triangulo", casas: 2 }),
    tipoC("elevacao-alvo", "Alvo (Projeto)", "CotaDeElevacao", { simbolo: "alvo", casas: 2 }),
    tipoC("inclinacao", "Inclinação - Seta", "InclinacaoDePonto", { casas: 1, sufixo: "%" })
  ];
  /* que tipo de cota (op) usa que estilo de tipo */
  var ESTILO_DA_COTA = { linear: "Linear", alinhada: "Linear", angular: "Angular", radial: "Radial", diametro: "Diametro",
                         arco: "ComprimentoDoArco", elevacao: "CotaDeElevacao", inclinacao: "InclinacaoDePonto" };
  var TIPO_PADRAO_COTA = { linear: "linear", alinhada: "linear", angular: "angular", radial: "radial", diametro: "diametro",
                           arco: "arco", elevacao: "elevacao", inclinacao: "inclinacao" };
  var MARCAS = { obliquo: "Diagonal (traço oblíquo)", seta: "Seta preenchida", ponto: "Ponto", nenhuma: "Nenhuma" };
  /* campo do tipo ↔ parâmetro (código BuiltInParameter + nome PT-BR, conferidos no teste contra o inventário) */
  var PARAMS_TIPO_COTA = [
    { campo: "texto", bip: "TEXT_SIZE", nome: "Tamanho do texto", grupo: "Texto", dado: "numero", un: "mm" },
    { campo: "fonte", bip: "TEXT_FONT", nome: "Fonte do texto", grupo: "Texto", dado: "texto" },
    { campo: "negrito", bip: "TEXT_STYLE_BOLD", nome: "Negrito", grupo: "Texto", dado: "simnao" },
    { campo: "italico", bip: "TEXT_STYLE_ITALIC", nome: "Itálico", grupo: "Texto", dado: "simnao" },
    { campo: "sublinhado", bip: "TEXT_STYLE_UNDERLINE", nome: "Sublinhado", grupo: "Texto", dado: "simnao" },
    { campo: "fatorLargura", bip: "TEXT_WIDTH_SCALE", nome: "Fator da largura", grupo: "Texto", dado: "numero" },
    { campo: "deslocTexto", bip: "TEXT_DIST_TO_LINE", nome: "Deslocamento do texto", grupo: "Texto", dado: "numero", un: "mm" },
    { campo: "fundo", bip: "DIM_TEXT_BACKGROUND", nome: "Texto do plano de fundo", grupo: "Texto", dado: "lista", opcoes: ["Opaco", "Transparente"] },
    { campo: "pena", bip: "LINE_PEN", nome: "Espessura da linha", grupo: "Gráficos", dado: "pena" },
    { campo: "penaMarca", bip: "TICK_MARK_PEN", nome: "Espessura da linha de marcas de revisão", grupo: "Gráficos", dado: "pena" },
    { campo: "marca", bip: "DIM_LEADER_ARROWHEAD", nome: "Marca de revisão", grupo: "Gráficos", dado: "lista", opcoes: Object.keys(MARCAS) },
    { campo: "extLinha", bip: "DIM_LINE_EXTENSION", nome: "Extensão da linha de cota", grupo: "Gráficos", dado: "numero", un: "mm" },
    { campo: "extChamada", bip: "WITNS_LINE_EXTENSION", nome: "Extensão de linha de chamada de cota", grupo: "Gráficos", dado: "numero", un: "mm" },
    { campo: "intervalo", bip: "WITNS_LINE_GAP_TO_ELT", nome: "Intervalo na linha de chamada de cota para elemento", grupo: "Gráficos", dado: "numero", un: "mm" },
    { campo: "sequencia", bip: "LINEAR_DIM_TYPE", nome: "Tipo de seqüência de cota", grupo: "Gráficos", dado: "lista", opcoes: ["Contínuo"] },
    { campo: "cor", bip: "LINE_COLOR", nome: "Cor", grupo: "Gráficos", dado: "cor" },
    { campo: "textoEq", bip: "EQUALITY_TEXT_FOR_CONTINUOUS_LINEAR_DIM", nome: "Texto de igualdade", grupo: "Outros", dado: "texto" },
    { campo: "unidade", bip: "DIM_STYLE_LINEAR_UNITS", nome: "Formato das unidades", grupo: "Unidades primárias", dado: "lista", opcoes: ["m", "cm", "mm"] },
    { campo: "prefixo", bip: "DIM_PREFIX", nome: "Prefixo do dimensionamento", grupo: "Unidades primárias", dado: "texto" },
    { campo: "sufixo", bip: "DIM_SUFFIX", nome: "Sufixo do dimensionamento", grupo: "Unidades primárias", dado: "texto" }
  ];
  /* parâmetros de INSTÂNCIA da cota (elementos.cota.instancia) */
  var PARAMS_INST_COTA = [
    { campo: "valor", bip: "DIM_VALUE_LENGTH", nome: "Valor", grupo: "Texto", leitura: true },
    { campo: "total", bip: "DIM_TOTAL_LENGTH", nome: "Comprimento total", grupo: "Outros", leitura: true },
    { campo: "contagem", bip: "DIM_REFERENCE_COUNT", nome: "Contagem", grupo: "Outros", leitura: true },
    { campo: "chamada", bip: "DIM_LEADER", nome: "Chamada de detalhe", grupo: "Gráficos" }
  ];

  /* ===================================================== TIPOS DE TEXTO
   * Série de alturas da NBR 10126 / padrão RA (2,5 · 3,5 · 5 · 7 mm) e a
   * nota de 2 mm do padrão estrutural. Nomes no formato de mercado ("2.5mm Arial"). */
  var BASE_TEXTO = { fonte: "Arial", texto: 2.5, negrito: false, italico: false, sublinhado: false, fatorLargura: 1,
                     fundo: "Opaco", borda: false, seta: "seta", pena: 7, deslocChamada: 2.0, guia: 12.7, cor: "" };
  function tipoT(id, nome, h, extra) {
    var o = clone(BASE_TEXTO); o.id = id; o.nome = nome; o.texto = h; o.ra = true;
    Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  var TIPOS_TEXTO = [
    tipoT("t2", "2 mm Arial (nota)", 2.0),
    tipoT("t25", "2,5 mm Arial", 2.5),
    tipoT("t35", "3,5 mm Arial", 3.5),
    tipoT("t5", "5 mm Arial", 5.0, { negrito: true }),
    tipoT("t7", "7 mm Arial", 7.0, { negrito: true })
  ];
  var SETAS = { seta: "Seta 30 graus", ponto: "Ponto", nenhuma: "Nenhuma" };
  var PARAMS_TIPO_TEXTO = [
    { campo: "texto", bip: "TEXT_SIZE", nome: "Tamanho do texto", grupo: "Texto", dado: "numero", un: "mm" },
    { campo: "fonte", bip: "TEXT_FONT", nome: "Fonte do texto", grupo: "Texto", dado: "texto" },
    { campo: "negrito", bip: "TEXT_STYLE_BOLD", nome: "Negrito", grupo: "Texto", dado: "simnao" },
    { campo: "italico", bip: "TEXT_STYLE_ITALIC", nome: "Itálico", grupo: "Texto", dado: "simnao" },
    { campo: "sublinhado", bip: "TEXT_STYLE_UNDERLINE", nome: "Sublinhado", grupo: "Texto", dado: "simnao" },
    { campo: "fatorLargura", bip: "TEXT_WIDTH_SCALE", nome: "Fator da largura", grupo: "Texto", dado: "numero" },
    { campo: "guia", bip: "TEXT_TAB_SIZE", nome: "Tamanho da guia", grupo: "Texto", dado: "numero", un: "mm" },
    { campo: "fundo", bip: "TEXT_BACKGROUND", nome: "Plano de fundo", grupo: "Gráficos", dado: "lista", opcoes: ["Opaco", "Transparente"] },
    { campo: "borda", bip: "TEXT_BOX_VISIBILITY", nome: "Exibir borda", grupo: "Gráficos", dado: "simnao" },
    { campo: "seta", bip: "LEADER_ARROWHEAD", nome: "Seta da chamada de detalhe", grupo: "Gráficos", dado: "lista", opcoes: Object.keys(SETAS) },
    { campo: "pena", bip: "LINE_PEN", nome: "Espessura da linha", grupo: "Gráficos", dado: "pena" },
    { campo: "deslocChamada", bip: "LEADER_OFFSET_SHEET", nome: "Deslocamento da linha chamada de detalhe/borda", grupo: "Gráficos", dado: "numero", un: "mm" },
    { campo: "cor", bip: "LINE_COLOR", nome: "Cor", grupo: "Gráficos", dado: "cor" }
  ];
  var PARAMS_INST_TEXTO = [
    { campo: "alinhH", bip: "TEXT_ALIGN_HORZ", nome: "Alinhar na horizontal", grupo: "Gráficos", opcoes: ["Esquerda", "Centro", "Direita"] },
    { campo: "alinhV", bip: "TEXT_ALIGN_VERT", nome: "Alinhar na vertical", grupo: "Gráficos", opcoes: ["Topo", "Meio", "Inferior"] },
    { campo: "legivel", bip: "KEEP_READABLE", nome: "Manter legível", grupo: "Gráficos" },
    { campo: "chamadaArco", bip: "ARC_LEADER_PARAM", nome: "Chamada de detalhe de arco", grupo: "Gráficos" }
  ];

  /* ===================================================== ESTILOS DE LINHA
   * Nomes dos estilos de linha (inventário, estilosLinha); pena e
   * traço da RA (NBR 8403: tracejada 3/−1,5; traço-ponto 9,6/−1,6/0/−1,6). */
  var ESTILOS_LINHA = {
    "<Linhas finas>":    { pena: 1, traco: null },
    "<Linhas>":          { pena: 2, traco: null },
    "<Linhas médias>":   { pena: 3, traco: null },
    "<Linhas grossas>":  { pena: 5, traco: null },
    "<Linhas ocultas>":  { pena: 2, traco: [3.0, 1.5] },
    "<Linha de centro>": { pena: 1, traco: [9.6, 1.6, 0.01, 1.6] },
    "<Demolido>":        { pena: 2, traco: [1.5, 1.0] },
    "<Projeção>":        { pena: 2, traco: [6.0, 1.5] },
    "<Linhas invisíveis>": { pena: 1, traco: null, invisivel: true }
  };
  /* ===================================================== PADRÕES DE PREENCHIMENTO
   * Nomes dos padrões de desenho (inventário, padroesPreenchimento,
   * alvo Drafting); o DESENHO é da RA (NBR 6492), em mm de papel: nada de .pat. */
  var PADROES = {
    "<Preenchimento sólido>": { solido: true },
    "Cinza claro (RA)": { cinza: true },
    "Diagonal ascendente": { linhas: [45], passo: 1.5 },
    "Diagonal descendente": { linhas: [-45], passo: 1.5 },
    "Hachura cruzada": { linhas: [0, 90], passo: 2.0 },
    "Hachura cruzada diagonal": { linhas: [45, -45], passo: 2.0 },
    "Alvenaria - Tijolo": { linhas: [45], passo: 1.0 },
    "Concreto": { concreto: true, passo: 4.0 },
    "Areia": { pontos: true, passo: 1.6 },
    "Terra": { terra: true, passo: 3.0 },
    "Madeira 1": { madeira: true, passo: 2.4 },
    "Aço": { linhas: [45], passo: 0.6 },
    "Isolamento - Rígido": { linhas: [60, -60], passo: 3.0 },
    "Argamassa-Gesso": { pontos: true, passo: 0.9 }
  };
  /* ===================================================== SÍMBOLOS (RA) */
  var SIMBOLOS = {
    norte: { nome: "Norte" },
    seta: { nome: "Seta (sentido)" },
    referencia: { nome: "Ponto de referência" },
    "escala-grafica": { nome: "Escala gráfica" }
  };
  /* ===================================================== COMPONENTES DE DETALHE (biblioteca RA simples)
   * Paramétricos (largura × altura em m), desenhados em coordenadas locais
   * (origem no canto de cima à esquerda, y para baixo). */
  var COMPONENTES = {
    "retangulo": { nome: "Retângulo hachurado", larg: 0.20, alt: 0.10, padrao: "Concreto" },
    "bloco-ceramico": { nome: "Bloco cerâmico (corte)", larg: 0.14, alt: 0.19, padrao: "Alvenaria - Tijolo" },
    "bloco-concreto": { nome: "Bloco de concreto (corte)", larg: 0.14, alt: 0.19, padrao: "Concreto" },
    "madeira": { nome: "Peça de madeira (corte)", larg: 0.06, alt: 0.12, padrao: null },
    "perfil-u": { nome: "Perfil U (corte)", larg: 0.075, alt: 0.040, esp: 0.003, padrao: null },
    "junta": { nome: "Junta de dilatação", larg: 0.02, alt: 0.15, padrao: null }
  };

  var TIPOS_ITEM = { cota: 1, texto: 1, simbolo: 1, notaChave: 1, nuvem: 1, linha: 1, regiao: 1, componente: 1, legenda: 1 };
  var TIPOS_DE_COTA = { linear: 1, alinhada: 1, angular: 1, radial: 1, diametro: 1, arco: 1, elevacao: 1, inclinacao: 1 };
  var OPS = { anot2d: 1, anot2dAjustar: 1, anot2dTipo: 1, revisao: 1 };
  /* campos que o anot2dAjustar aceita (o resto é do tipo do item ou fixo) */
  var AJUSTAVEIS = { tipoCota: 1, tipoTexto: 1, off: 1, orient: 1, prefixo: 1, sufixo: 1, eq: 1, travada: 1, valorTravado: 1, chamada: 1,
                     texto: 1, x: 1, y: 1, lx: 1, ly: 1, comLider: 1, alinhH: 1, alinhV: 1, rot: 1, legivel: 1, simbolo: 1, escalaSimb: 1,
                     chave: 1, revisao: 1, estilo: 1, padrao: 1, mascara: 1, comp: 1, larg: 1, alt: 1, titulo: 1, refs: 1, pts: 1, ang: 1, base: 1 };

  /* ===================================================== tipos efetivos (RA + projeto) */
  function tiposProjeto(estado) { var a = estado && estado.anot2d; return (a && a.tipos) || { cota: [], texto: [] }; }
  function tiposCota(estado) { return TIPOS_COTA.concat(arr(tiposProjeto(estado).cota)); }
  function tiposTexto(estado) { return TIPOS_TEXTO.concat(arr(tiposProjeto(estado).texto)); }
  function acharTipo(lista, id) { for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i]; return null; }
  function tipoCotaDe(estado, it) {
    var L = tiposCota(estado), t = acharTipo(L, it && it.tipoCota);
    if (t && ESTILO_DA_COTA[it.cota] && t.estilo !== ESTILO_DA_COTA[it.cota] && !(t.estilo === "Linear" && ESTILO_DA_COTA[it.cota] === "Linear")) t = null;
    return t || acharTipo(TIPOS_COTA, TIPO_PADRAO_COTA[(it && it.cota) || "linear"]) || TIPOS_COTA[0];
  }
  function tipoTextoDe(estado, it) { return acharTipo(tiposTexto(estado), it && it.tipoTexto) || TIPOS_TEXTO[1]; }

  /* ===================================================== NÚMEROS */
  function fmtNum(v, casas) {
    var D = D2(); if (D && D.fmtNum) return D.fmtNum(v, casas);
    var s = (Math.round(v * Math.pow(10, casas)) / Math.pow(10, casas)).toFixed(casas), neg = s.charAt(0) === "-"; if (neg) s = s.slice(1);
    var p = s.split("."); return (neg ? "-" : "") + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (p[1] ? "," + p[1] : "");
  }
  /* comprimento (m) na unidade do tipo */
  function fmtComp(m, t) {
    var c = Math.max(0, Math.min(3, Math.round(num(t.casas, 2))));
    if (t.unidade === "cm") return fmtNum(m * 100, c > 1 ? 0 : c);
    if (t.unidade === "mm") return fmtNum(m * 1000, 0);
    return fmtNum(m, c);
  }
  function fmtElev(y, t) { var c = Math.max(0, Math.min(3, Math.round(num(t.casas, 2)))); var z = Math.abs(y) < 0.5 * Math.pow(10, -c) ? 0 : y; return (z > 0 ? "+" : z < 0 ? "−" : "±") + fmtNum(Math.abs(z), c); }
  /* o texto que a cota mostra: prefixo + valor + sufixo (instância antes do tipo), ou o texto de igualdade */
  function textoCota(it, t, valor, eq) {
    if (eq) return txt(t.textoEq || "EQ");
    var pre = it.prefixo != null && it.prefixo !== "" ? it.prefixo : txt(t.prefixo), suf = it.sufixo != null && it.sufixo !== "" ? it.sufixo : txt(t.sufixo);
    var v;
    if (it.cota === "angular") v = fmtNum(valor, Math.max(0, Math.min(3, Math.round(num(t.casas, 2))))) + "°";
    else if (it.cota === "elevacao") v = fmtElev(valor, t);
    else if (it.cota === "inclinacao") v = fmtNum(valor, Math.max(0, Math.min(3, Math.round(num(t.casas, 1)))));
    else v = fmtComp(valor, t);
    return pre + v + suf;
  }

  /* ===================================================== REFERÊNCIAS
   * Uma referência é { el, r, s, x, y }: o id da peça, que parte dela (face+,
   * face−, eixo, fim0, fim1, centro, contorno, aresta, topo, plano, seg,
   * arco, nivel, ponto), a posição AO LONGO da linha (s, relativa à base da
   * referência — anda com a peça) e o ponto do clique (x, y — o que vale se a
   * peça sumir ou se a referência é um ponto solto).
   * resolver → { ok, p:[x,y] (o ponto na referência), d:[dx,dy] (direção da
   * linha da referência; null = ponto), c/r (círculo/arco), a0/a1, y (elevação) }. */
  function eixoU(r) { return [Math.cos(r), -Math.sin(r)]; }
  function eixoN(r) { return [Math.sin(r), Math.cos(r)]; }
  function indice(estado) {
    var I = { caixa: {}, familia: {}, eixo: {}, cobertura: {}, anot: {} };
    arr(estado && estado.caixas).forEach(function (c) { if (c && c.id != null) I.caixa[c.id] = c; });
    arr(estado && estado.familias).forEach(function (f) { if (f && f.id != null) I.familia[f.id] = f; });
    arr(estado && estado.eixos).forEach(function (e) { if (e && e.id != null) I.eixo[e.id] = e; });
    arr(estado && estado.coberturas).forEach(function (c) { if (c && c.id != null) I.cobertura[c.id] = c; });
    var a = estado && estado.anot2d; arr(a && a.itens).forEach(function (x) { if (x && x.id != null) I.anot[x.id] = x; });
    return I;
  }
  function secaoCirc(c) {
    var p = c && c.perfil; if (!p) return null;
    if (p.forma === "circ") return num(p.d, 0) / 2 || null;
    if (p.forma === "tubo-circ") return num(p.D, 0) / 2 || null;
    return null;
  }
  /* base e direção de uma referência linear de uma caixa (parede, viga, pilar, laje) */
  function linhaCaixa(c, r, i) {
    var C = [num(c.cx, 0), num(c.cz, 0)], rot = num(c.rotY, 0), u = eixoU(rot), n = eixoN(rot), L = num(c.comprimento, 0), E = num(c.espessura, 0);
    if (r === "eixo") return { b: C, d: u };
    if (r === "face+") return { b: add(C, mul(n, E / 2)), d: u };
    if (r === "face-") return { b: add(C, mul(n, -E / 2)), d: u };
    if (r === "fim0") return { b: add(C, mul(u, -L / 2)), d: n };
    if (r === "fim1") return { b: add(C, mul(u, L / 2)), d: n };
    if (r === "eixoN") return { b: C, d: n };
    if (r === "aresta" && Array.isArray(c.contorno) && c.contorno.length >= 2) {
      var k = Math.round(num(i, 0)), q = c.contorno, a = q[((k % q.length) + q.length) % q.length], b = q[(k + 1) % q.length];
      var dd = unit([b.x - a.x, b.z - a.z]); if (!dd) return null;
      return { b: [a.x, a.z], d: dd };
    }
    return null;
  }
  function resolverRef(I, ref, opc) {
    opc = opc || {};
    if (!ref) return { ok: false };
    var cl = fin(+ref.x) && fin(+ref.y) ? [+ref.x, +ref.y] : null, s = num(ref.s, 0), el = ref.el;
    function ponto() { return cl ? { ok: true, p: cl, d: null, solto: true } : { ok: false }; }
    if (ref.r === "ponto" || el == null || el === "") {
      if (ref.r === "nivel") return cl ? { ok: true, p: cl, d: null, y: num(opc.nivelY, num(ref.yRef, 0)) } : { ok: false };
      return ponto();
    }
    var c = I.caixa[el];
    if (c) {
      /* CURVA: a parede curva dá o CÍRCULO (centro, raio, ângulos) — cota radial, diâmetro e comprimento do arco */
      if (c.arco && (ref.r === "eixo" || ref.r === "face+" || ref.r === "face-" || ref.r === "contorno")) {
        var BCr = dep("BimCurva", "./bimcurva.js"), ra = BCr ? BCr.refArco(c, ref.r) : null; if (ra) return ra;
      }
      if (ref.r === "topo") {
        var topo = c.tipo === "viga" && c.topoViga != null ? num(c.topoViga, 0) : num(c.cy, 0) + num(c.altura, 0) / 2;
        return { ok: true, p: cl || [num(c.cx, 0), num(c.cz, 0)], d: null, y: topo };
      }
      if (ref.r === "centro") return { ok: true, p: [num(c.cx, 0), num(c.cz, 0)], d: null };
      if (ref.r === "contorno") {
        var R = secaoCirc(c); if (!R) return { ok: false };
        return { ok: true, p: [num(c.cx, 0), num(c.cz, 0)], d: null, c: [num(c.cx, 0), num(c.cz, 0)], r: R, circulo: true };
      }
      var ln = linhaCaixa(c, ref.r, ref.i); if (!ln) return { ok: false };
      return { ok: true, p: add(ln.b, mul(ln.d, s)), d: ln.d, base: ln.b };
    }
    var f = I.familia[el];
    if (f) {
      var fr = num(f.rotY, 0), fc = [num(f.x, 0), num(f.z, 0)];
      if (ref.r === "centro") { var nd = eixoN(fr); return { ok: true, p: add(fc, mul(nd, s)), d: nd, base: fc }; }
      if (ref.r === "topo") return { ok: true, p: fc, d: null, y: num(f.y, 0) };
      return { ok: true, p: fc, d: null };
    }
    var e = I.eixo[el];
    if (e) {
      var eb = [num(e.x0, 0), num(e.z0, 0)], ed = unit([num(e.x1, 0) - eb[0], num(e.z1, 0) - eb[1]]); if (!ed) return { ok: false };
      return { ok: true, p: add(eb, mul(ed, s)), d: ed, base: eb };
    }
    var cb = I.cobertura[el];
    if (cb && ref.r === "plano") {
      var pl = arr(cb.planos)[Math.round(num(ref.i, 0))]; if (!pl) return { ok: false };
      var rx = num(pl.rotX, 0), desce = mul(eixoN(num(pl.rotY, 0)), rx >= 0 ? 1 : -1);
      /* a inclinação do TIPO (o "30%" digitado); o rotX do plano é arredondado e daria 30,005 */
      return { ok: true, p: cl || [num(pl.cx, 0), num(pl.cz, 0)], d: null, incl: fin(cb.inclinacao) ? cb.inclinacao : Math.tan(Math.abs(rx)) * 100, desce: desce };
    }
    var an = I.anot[el];
    if (an && an.tipo === "linha") {
      if (an.arco) {
        var A = an.arco; return { ok: true, p: [num(A.cx, 0), num(A.cy, 0)], d: null, c: [num(A.cx, 0), num(A.cy, 0)], r: num(A.r, 0), a0: num(A.a0, 0), a1: num(A.a1, 0), circulo: !(fin(A.a0) && fin(A.a1)) };
      }
      var P = arr(an.pts), k = Math.round(num(ref.i, 0)); if (!P[k] || !P[k + 1]) return { ok: false };
      var pa = [P[k].x, P[k].y], dd = unit(sub([P[k + 1].x, P[k + 1].y], pa)); if (!dd) return { ok: false };
      return { ok: true, p: add(pa, mul(dd, s)), d: dd, base: pa };
    }
    /* a peça sumiu: a cota que dependia dela some junto */
    return { ok: false, orfa: true };
  }

  /* ===================================================== MEDIR UMA COTA
   * → { ok, valor (total), segs:[{a, b, valor, eq}], geo (para o desenho) } */
  function intersecaoRetas(p, d, q, e) {
    var den = d[0] * e[1] - d[1] * e[0]; if (Math.abs(den) < 1e-9) return null;
    var t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den;
    return add(p, mul(d, t));
  }
  function medirCota(I, it, opc) {
    var R = arr(it.refs).map(function (r) { return resolverRef(I, r, opc); });
    if (!R.length || R.some(function (x) { return !x.ok; })) return { ok: false, orfa: R.some(function (x) { return x.orfa; }) };
    var k = it.cota;
    if (k === "linear" || k === "alinhada") {
      if (R.length < 2) return { ok: false };
      var n = null;
      if (it.orient === "h") n = [1, 0]; else if (it.orient === "v") n = [0, 1];
      else if (k === "alinhada") {
        /* direção da cota: perpendicular à 1ª referência que é linha; entre dois pontos, a reta deles */
        for (var i = 0; i < R.length && !n; i++) if (R[i].d) n = perp(R[i].d);
        if (!n) n = unit(sub(R[R.length - 1].p, R[0].p));
        if (!n && it.dir) n = unit([num(it.dir.x, 1), num(it.dir.y, 0)]);
      }
      if (!n) n = [1, 0];
      /* sentido estável: o 1º → o último cresce */
      if (dot(sub(R[R.length - 1].p, R[0].p), n) < 0) n = mul(n, -1);
      var tt = perp(n), ts = R.map(function (x) { return dot(x.p, n); });
      var segs = [];
      for (var j = 0; j + 1 < ts.length; j++) segs.push({ valor: r6(Math.abs(ts[j + 1] - ts[j])) });
      var total = r6(Math.abs(ts[ts.length - 1] - ts[0]));
      var eqOk = segs.length >= 2 ? segs.every(function (s) { return Math.abs(s.valor - segs[0].valor) < 0.0005; }) : true;
      var lineT = dot(R[0].p, tt) + num(it.off, 0.6);
      return { ok: true, tipo: k, valor: segs.length === 1 ? segs[0].valor : total, total: total, segs: segs, eqOk: eqOk,
               geo: { n: n, t: tt, ts: ts, lineT: lineT, pts: R.map(function (x) { return x.p; }) } };
    }
    if (k === "angular") {
      if (R.length < 2 || !R[0].d || !R[1].d) return { ok: false };
      var O = intersecaoRetas(R[0].p, R[0].d, R[1].p, R[1].d); if (!O) return { ok: false, paralelas: true };
      var v1 = unit(sub(R[0].p, O)) || R[0].d, v2 = unit(sub(R[1].p, O)) || R[1].d;
      var ang = Math.acos(Math.max(-1, Math.min(1, dot(v1, v2)))) * 180 / Math.PI;
      return { ok: true, tipo: k, valor: r6(ang), total: r6(ang), segs: [{ valor: r6(ang) }], eqOk: true, geo: { O: O, v1: v1, v2: v2, raio: Math.max(0.05, num(it.off, 0.8)) } };
    }
    if (k === "radial" || k === "diametro" || k === "arco") {
      var C = R[0]; if (!C.c || !(C.r > 0)) return { ok: false };
      var a = num(it.ang, Math.PI / 4), val;
      if (k === "radial") val = C.r; else if (k === "diametro") val = 2 * C.r;
      else { if (!fin(C.a0) || !fin(C.a1)) return { ok: false }; var da = C.a1 - C.a0; while (da < 0) da += 2 * Math.PI; val = C.r * da; }
      return { ok: true, tipo: k, valor: r6(val), total: r6(val), segs: [{ valor: r6(val) }], eqOk: true, geo: { c: C.c, r: C.r, ang: a, a0: C.a0, a1: C.a1, off: num(it.off, 0.3) } };
    }
    if (k === "elevacao") {
      var E = R[0], y = null;
      if (fin(E.y)) y = E.y;
      else if (opc.corte) y = -E.p[1];
      else if (fin(opc.nivelY)) y = opc.nivelY;
      if (!fin(y)) return { ok: false };
      return { ok: true, tipo: k, valor: r6(y), total: r6(y), segs: [{ valor: r6(y) }], eqOk: true, geo: { p: E.p } };
    }
    if (k === "inclinacao") {
      var S = R[0], incl = null, desce = null;
      if (fin(S.incl)) { incl = S.incl; desce = S.desce; }
      else if (R.length >= 2) {
        var dv = sub(R[1].p, R[0].p);
        if (opc.corte && Math.abs(dv[0]) > 1e-6) { incl = Math.abs(dv[1] / dv[0]) * 100; desce = unit(dv[1] > 0 ? dv : mul(dv, -1)); }
      } else if (fin(+it.inclManual)) { incl = +it.inclManual; desce = unit([num(it.dir && it.dir.x, 1), num(it.dir && it.dir.y, 0)]); }
      if (!fin(incl)) return { ok: false };
      return { ok: true, tipo: k, valor: r6(incl), total: r6(incl), segs: [{ valor: r6(incl) }], eqOk: true, geo: { p: S.p, desce: desce || [1, 0] } };
    }
    return { ok: false };
  }

  /* ===================================================== REPLAY (extensão do BimEdit) */
  function ctxA(ctx) {
    if (!ctx.ext.anot7) ctx.ext.anot7 = { itens: {}, ordem: [], revs: {}, ordemR: [], tipos: { cota: {}, texto: {} }, ordemT: [] };
    return ctx.ext.anot7;
  }
  function ptsOk(L, min) { return Array.isArray(L) && L.length >= (min || 1) && L.every(function (p) { return !!p && fin(+p.x) && fin(+p.y); }); }
  function refsOk(L) { return Array.isArray(L) && L.length >= 1 && L.length <= 60 && L.every(function (r) { return !!r && typeof r === "object" && !Array.isArray(r) && (r.el != null || (fin(+r.x) && fin(+r.y))); }); }
  function itemValido(o) {
    if (!o || o.id == null || typeof o.vista !== "string" || !o.vista || !TIPOS_ITEM[o.tipo]) return false;
    switch (o.tipo) {
      case "cota": return !!TIPOS_DE_COTA[o.cota] && refsOk(o.refs) && (o.off == null || fin(+o.off)) &&
        (o.cota === "linear" || o.cota === "alinhada" || o.cota === "angular" ? o.refs.length >= 2 : true);
      case "texto": return fin(+o.x) && fin(+o.y) && String(o.texto || "").trim().length > 0;
      case "simbolo": return fin(+o.x) && fin(+o.y) && !!SIMBOLOS[o.simbolo];
      case "notaChave": return fin(+o.x) && fin(+o.y) && String(o.chave || "").trim().length > 0;
      case "nuvem": return ptsOk(o.pts, 3) && o.revisao != null && o.revisao !== "";
      case "linha": return o.arco ? (fin(+o.arco.cx) && fin(+o.arco.cy) && +o.arco.r > 0) : ptsOk(o.pts, 2);
      case "regiao": return ptsOk(o.pts, 3);
      case "componente": return fin(+o.x) && fin(+o.y) && !!COMPONENTES[o.comp];
      case "legenda": return fin(+o.x) && fin(+o.y);
    }
    return false;
  }
  function limparItem(o) {
    var it = clone(o); delete it.op;
    if (it.texto != null) it.texto = String(it.texto).slice(0, 2000);
    if (it.chave != null) it.chave = String(it.chave).slice(0, 20);
    return it;
  }
  function validaOp(o) {
    if (!o || !OPS[o.op]) return undefined;
    if (o.op === "anot2d") return itemValido(o);
    if (o.op === "anot2dAjustar") return o.id != null && !!o.campos && typeof o.campos === "object" && !Array.isArray(o.campos) &&
      Object.keys(o.campos).length > 0 && Object.keys(o.campos).every(function (k) { return AJUSTAVEIS[k]; }) &&
      (o.campos.refs == null || refsOk(o.campos.refs)) && (o.campos.pts == null || ptsOk(o.campos.pts, 2));
    if (o.op === "anot2dTipo") return o.id != null && (o.cat === "cota" || o.cat === "texto") && String(o.nome || "").trim().length > 0 &&
      (o.valores == null || (typeof o.valores === "object" && !Array.isArray(o.valores)));
    if (o.op === "revisao") return o.id != null && String(o.numero || "").trim().length > 0;
    return undefined;
  }
  function aplicarOp(o, ctx) {
    if (!o || !o.op) return false;
    var A = ctx.ext.anot7;
    if (o.op === "anot2d") {
      if (!itemValido(o)) return false;
      A = ctxA(ctx);
      A.itens[o.id] = limparItem(o); A.itens[o.id].id = o.id;
      if (A.ordem.indexOf(o.id) < 0) A.ordem.push(o.id);
      return true;
    }
    if (o.op === "anot2dAjustar") {
      if (!A || !A.itens[o.id] || validaOp(o) !== true) return false;
      var it = A.itens[o.id], novo = clone(it);
      Object.keys(o.campos).forEach(function (k) { novo[k] = clone(o.campos[k]); });
      if (!itemValido(novo)) return false;   /* ajuste que estragaria o item (cota sem referência): recusado */
      A.itens[o.id] = novo;
      return true;
    }
    if (o.op === "anot2dTipo") {
      if (validaOp(o) !== true) return false;
      A = ctxA(ctx);
      var lista = o.cat === "cota" ? TIPOS_COTA : TIPOS_TEXTO;
      var base = A.tipos[o.cat][o.base] || acharTipo(lista, o.base) || A.tipos[o.cat][o.id] || acharTipo(lista, o.id) || lista[o.cat === "cota" ? 0 : 1];
      var t = clone(base); t.id = String(o.id); t.nome = String(o.nome).trim().slice(0, 80); t.ra = false;
      Object.keys(o.valores || {}).forEach(function (k) { if (k !== "id" && k !== "estilo" && k !== "ra") t[k] = clone(o.valores[k]); });
      if (acharTipo(lista, t.id)) t.id = t.id + "-p";   /* nunca sobrescreve o tipo da RA */
      A.tipos[o.cat][t.id] = t; if (A.ordemT.indexOf(o.cat + ":" + t.id) < 0) A.ordemT.push(o.cat + ":" + t.id);
      return true;
    }
    if (o.op === "revisao") {
      if (validaOp(o) !== true) return false;
      A = ctxA(ctx);
      A.revs[o.id] = { id: o.id, numero: String(o.numero).trim().slice(0, 12), data: txt(o.data).slice(0, 20), descricao: txt(o.descricao).slice(0, 300), emitidoPor: txt(o.emitidoPor).slice(0, 80) };
      if (A.ordemR.indexOf(o.id) < 0) A.ordemR.push(o.id);
      return true;
    }
    if (o.op === "mover" && A && A.itens[o.id]) {
      var dx = num(o.dx, 0), dy = num(o.dy, 0), m = A.itens[o.id];
      if (!dx && !dy) return true;
      ["x", "lx"].forEach(function (k) { if (fin(+m[k])) m[k] = r6(+m[k] + dx); });
      ["y", "ly"].forEach(function (k) { if (fin(+m[k])) m[k] = r6(+m[k] + dy); });
      arr(m.pts).forEach(function (p) { p.x = r6(+p.x + dx); p.y = r6(+p.y + dy); });
      if (m.arco) { m.arco.cx = r6(+m.arco.cx + dx); m.arco.cy = r6(+m.arco.cy + dy); }
      arr(m.refs).forEach(function (r) { if (r.el == null || r.el === "") { if (fin(+r.x)) r.x = r6(+r.x + dx); if (fin(+r.y)) r.y = r6(+r.y + dy); } });
      return true;
    }
    if (o.op === "apagar" && A && A.itens[o.id]) {
      delete A.itens[o.id]; A.ordem.splice(A.ordem.indexOf(o.id), 1); return true;
    }
    if (o.op === "apagar" && A && A.revs[o.id]) {
      /* revisão com nuvem não se apaga (o histórico da prancha não pode perder o que mudou) */
      var usada = A.ordem.some(function (id) { var x = A.itens[id]; return x && x.tipo === "nuvem" && String(x.revisao) === String(o.id); });
      if (usada) return false;
      delete A.revs[o.id]; A.ordemR.splice(A.ordemR.indexOf(o.id), 1); return true;
    }
    return false;
  }
  function cmpRev(a, b) {
    var na = parseInt(String(a.numero).replace(/\D+/g, ""), 10), nb = parseInt(String(b.numero).replace(/\D+/g, ""), 10);
    if (isFinite(na) && isFinite(nb) && na !== nb) return na - nb;
    return String(a.numero) < String(b.numero) ? -1 : String(a.numero) > String(b.numero) ? 1 : 0;
  }
  function fimOp(ctx, out) {
    var A = ctx.ext.anot7; if (!A) return;
    var tipos = { cota: [], texto: [] };
    A.ordemT.forEach(function (k) { var p = k.split(":"), cat = p.shift(), id = p.join(":"); if (A.tipos[cat] && A.tipos[cat][id]) tipos[cat].push(A.tipos[cat][id]); });
    var itens = A.ordem.map(function (id) { return A.itens[id]; });
    var revs = A.ordemR.map(function (id) { return clone(A.revs[id]); }).sort(cmpRev);
    var res = { itens: itens, revisoes: revs, tipos: tipos, violadas: [], orfas: [] };
    out.anot2d = res;
    /* valor de cada cota AGORA (a peça pode ter andado) + travas e igualdade */
    var I = indice(out);
    itens.forEach(function (it) {
      if (it.tipo !== "cota") return;
      var m = medirCota(I, it, { corte: /^d2c-/.test(it.vista) });
      it.calc = m.ok ? { valor: m.valor, total: m.total, segs: m.segs.map(function (s) { return s.valor; }), eqOk: m.eqOk } : { erro: true, orfa: !!m.orfa };
      if (!m.ok && m.orfa) res.orfas.push(it.id);
      if (m.ok && it.travada && fin(+it.valorTravado) && Math.abs(m.valor - +it.valorTravado) > 0.0005)
        res.violadas.push({ id: it.id, valor: m.valor, travado: +it.valorTravado, motivo: "travada" });
      if (m.ok && it.eq && !m.eqOk) res.violadas.push({ id: it.id, valor: m.valor, motivo: "igualdade" });
    });
    revs.forEach(function (r) {
      var vs = {}, n = 0;
      itens.forEach(function (it) { if (it.tipo === "nuvem" && String(it.revisao) === String(r.id)) { n++; vs[it.vista] = 1; } });
      r.nuvens = n; r.vistas = Object.keys(vs);
    });
  }
  var BE = null;
  function registrar(BimEdit) {
    if (!BimEdit || typeof BimEdit.estender !== "function") return false;
    BE = BimEdit;
    BimEdit.estender({ nome: "anotacaoP7", aplicar: aplicarOp, fim: fimOp, valida: validaOp });
    return true;
  }

  /* ===================================================== LEITURA DO ESTADO */
  function itensDaVista(estado, vista) { var a = estado && estado.anot2d; return arr(a && a.itens).filter(function (x) { return x && x.vista === vista; }); }
  function item(estado, id) { var a = estado && estado.anot2d; var L = arr(a && a.itens); for (var i = 0; i < L.length; i++) if (String(L[i].id) === String(id)) return L[i]; return null; }
  /* REVISÕES DO PROJETO — o formato que a P8 (carimbo, tabela de revisões) lê:
     [{ id, numero, data, descricao, emitidoPor, nuvens, vistas }], em ordem de número */
  function revisoes(estado) { var a = estado && estado.anot2d; return arr(a && a.revisoes).map(clone); }
  function revisaoAtual(estado) { var L = revisoes(estado); return L.length ? L[L.length - 1] : null; }
  function proximoNumero(estado) {
    var mx = 0; revisoes(estado).forEach(function (r) { var n = parseInt(String(r.numero).replace(/\D+/g, ""), 10); if (isFinite(n) && n > mx) mx = n; });
    var n2 = revisoes(estado).length ? mx + 1 : 1;
    return "R" + (n2 < 10 ? "0" : "") + n2;
  }
  function violacoes(estado) { var a = estado && estado.anot2d; return arr(a && a.violadas).map(clone); }

  /* ===================================================== ACHAR REFERÊNCIA (clique na planta)
   * p = ponto do clique na vista, tol = metros. filtro: 'linha' (cota linear,
   * angular), 'circulo' (radial, diâmetro, arco), 'topo' (elevação), 'plano'
   * (inclinação). → { ref, dist, rotulo } ou null. */
  function distSeg(p, a, b) {
    var d = sub(b, a), L2 = dot(d, d); if (L2 < 1e-12) return len(sub(p, a));
    var t = Math.max(0, Math.min(1, dot(sub(p, a), d) / L2)); return len(sub(p, add(a, mul(d, t))));
  }
  function dentroRet(p, c) {
    var C = [num(c.cx, 0), num(c.cz, 0)], rot = num(c.rotY, 0), u = eixoU(rot), n = eixoN(rot), v = sub(p, C);
    return Math.abs(dot(v, u)) <= num(c.comprimento, 0) / 2 + 1e-9 && Math.abs(dot(v, n)) <= num(c.espessura, 0) / 2 + 1e-9;
  }
  function dentroPoli(p, P) {
    var dentro = false;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
      var a = P[i], b = P[j];
      if (((a[1] > p[1]) !== (b[1] > p[1])) && (p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0])) dentro = !dentro;
    }
    return dentro;
  }
  function acharRef(estado, p, tol, filtro, vista) {
    var melhor = null, I = indice(estado);
    function cand(ref, dist, rot) { if (dist <= tol && (!melhor || dist < melhor.dist - 1e-9)) melhor = { ref: ref, dist: dist, rotulo: rot }; }
    function sOf(b, d) { return r6(dot(sub(p, b), d)); }
    var ptRef = { x: r6(p[0]), y: r6(p[1]) };
    if (filtro === "topo") {
      /* a peça de cima (laje/piso) que contém o ponto; senão, o nível da vista */
      var alvo = null;
      arr(estado && estado.caixas).forEach(function (c) {
        if (!c || (c.tipo !== "laje" && c.tipo !== "pilar" && c.tipo !== "viga" && c.tipo !== "parede")) return;
        var ok = c.contorno ? dentroPoli(p, c.contorno.map(function (q) { return [q.x, q.z]; })) : dentroRet(p, c);
        if (!ok) return;
        var top = num(c.cy, 0) + num(c.altura, 0) / 2;
        if (!alvo || top > alvo.top) alvo = { c: c, top: top };
      });
      if (alvo) return { ref: { el: alvo.c.id, r: "topo", x: ptRef.x, y: ptRef.y }, dist: 0, rotulo: "topo da " + (alvo.c.tipo || "peça") };
      return { ref: { r: "nivel", x: ptRef.x, y: ptRef.y }, dist: 0, rotulo: "nível da vista" };
    }
    if (filtro === "plano") {
      var ach = null;
      arr(estado && estado.coberturas).forEach(function (cb) {
        arr(cb.planos).forEach(function (pl, i) {
          var q = { cx: pl.cx, cz: pl.cz, rotY: pl.rotY, comprimento: pl.comprimento, espessura: num(pl.largura, 0) * Math.cos(num(pl.rotX, 0)) };
          if (dentroRet(p, q)) ach = { ref: { el: cb.id, r: "plano", i: i, x: ptRef.x, y: ptRef.y }, dist: 0, rotulo: "água " + (i + 1) + " da cobertura" };
        });
      });
      return ach;
    }
    arr(estado && estado.caixas).forEach(function (c) {
      if (!c || c.id == null) return;
      var R = secaoCirc(c);
      if (R) {
        var C = [num(c.cx, 0), num(c.cz, 0)], dc = Math.abs(len(sub(p, C)) - R);
        if (filtro === "circulo") cand({ el: c.id, r: "contorno", x: ptRef.x, y: ptRef.y }, dc, "contorno do pilar");
        else cand({ el: c.id, r: "centro", x: ptRef.x, y: ptRef.y }, len(sub(p, C)), "centro do pilar");
        return;
      }
      /* CURVA: a parede curva é CÍRCULO — as faces e o eixo dela entram na cota radial, de diâmetro e de
         comprimento do arco; nas cotas de reta ela fica de fora (a caixa dela é a corda, não a parede) */
      if (c.arco) {
        var BCq = filtro === "circulo" ? dep("BimCurva", "./bimcurva.js") : null;
        if (BCq) ["face+", "face-", "eixo"].forEach(function (rr) { var ra = BCq.refArco(c, rr); if (ra) cand({ el: c.id, r: rr, x: ptRef.x, y: ptRef.y }, Math.abs(len(sub(p, ra.c)) - ra.r) * (rr === "eixo" ? 1.6 : 1), (rr === "eixo" ? "eixo" : "face") + " da parede curva"); });
        return;
      }
      if (filtro === "circulo") return;
      if (Array.isArray(c.contorno) && c.contorno.length >= 3) {
        c.contorno.forEach(function (q, i) {
          var a = [q.x, q.z], b = [c.contorno[(i + 1) % c.contorno.length].x, c.contorno[(i + 1) % c.contorno.length].z], dd = unit(sub(b, a)); if (!dd) return;
          cand({ el: c.id, r: "aresta", i: i, s: sOf(a, dd), x: ptRef.x, y: ptRef.y }, distSeg(p, a, b), "aresta da laje");
        });
        return;
      }
      var Cc = [num(c.cx, 0), num(c.cz, 0)], rot = num(c.rotY, 0), u = eixoU(rot), n = eixoN(rot), L = num(c.comprimento, 0), E = num(c.espessura, 0);
      var nome = c.tipo === "parede" ? "parede" : (c.tipo || "peça");
      /* na planta a laje fica ABAIXO do plano de corte: a borda dela perde para a parede cortada
         que passa no mesmo lugar (a borda da laje no eixo da parede é o caso comum) */
      var peso = c.tipo === "laje" ? 2 : 1;
      [["face+", E / 2], ["face-", -E / 2]].forEach(function (f) {
        var b0 = add(Cc, mul(n, f[1])), a = add(b0, mul(u, -L / 2)), b = add(b0, mul(u, L / 2));
        cand({ el: c.id, r: f[0], s: sOf(b0, u), x: ptRef.x, y: ptRef.y }, distSeg(p, a, b) * peso, (c.tipo === "laje" ? "borda da " : "face da ") + nome);
      });
      [["fim0", -L / 2], ["fim1", L / 2]].forEach(function (f) {
        var b0 = add(Cc, mul(u, f[1])), a = add(b0, mul(n, -E / 2)), b = add(b0, mul(n, E / 2));
        cand({ el: c.id, r: f[0], s: sOf(b0, n), x: ptRef.x, y: ptRef.y }, distSeg(p, a, b) * peso, (c.tipo === "laje" ? "borda da " : "ponta da ") + nome);
      });
      /* o eixo (linha de centro) só ganha da face quando o clique está bem no meio */
      if (c.tipo === "parede" || c.tipo === "viga") {
        var ea = add(Cc, mul(u, -L / 2)), eb = add(Cc, mul(u, L / 2));
        cand({ el: c.id, r: "eixo", s: sOf(Cc, u), x: ptRef.x, y: ptRef.y }, distSeg(p, ea, eb) * 1.6, "eixo da " + nome);
      }
    });
    if (filtro !== "circulo") {
      arr(estado && estado.familias).forEach(function (f) {
        if (!f || f.id == null) return;
        var fc = [num(f.x, 0), num(f.z, 0)], nd = eixoN(num(f.rotY, 0));
        cand({ el: f.id, r: "centro", s: sOf(fc, nd), x: ptRef.x, y: ptRef.y }, len(sub(p, fc)) * 1.2, "centro da " + (f.host ? "abertura" : "família"));
      });
      arr(estado && estado.eixos).forEach(function (e) {
        var a = [num(e.x0, 0), num(e.z0, 0)], b = [num(e.x1, 0), num(e.z1, 0)], dd = unit(sub(b, a)); if (!dd) return;
        cand({ el: e.id, r: "eixo", s: sOf(a, dd), x: ptRef.x, y: ptRef.y }, distSeg(p, a, b), "eixo " + (e.nome || ""));
      });
    }
    /* linhas de detalhe DESTA vista */
    itensDaVista(estado, vista).forEach(function (it) {
      if (it.tipo !== "linha") return;
      if (it.arco) {
        var A = it.arco, dc = Math.abs(len(sub(p, [num(A.cx, 0), num(A.cy, 0)])) - num(A.r, 0));
        if (filtro === "circulo") cand({ el: it.id, r: "arco", x: ptRef.x, y: ptRef.y }, dc, "arco de detalhe");
        return;
      }
      if (filtro === "circulo") return;
      var P = arr(it.pts);
      for (var i = 0; i + 1 < P.length; i++) {
        var a = [P[i].x, P[i].y], b = [P[i + 1].x, P[i + 1].y], dd = unit(sub(b, a)); if (!dd) continue;
        cand({ el: it.id, r: "seg", i: i, s: sOf(a, dd), x: ptRef.x, y: ptRef.y }, distSeg(p, a, b), "linha de detalhe");
      }
    });
    return melhor;
  }

  /* ===================================================== CONSTRUTORES DE OP (puros) */
  function opCota(o) {
    var it = { op: "anot2d", id: o.id, vista: o.vista, tipo: "cota", cota: o.cota || "alinhada", refs: clone(arr(o.refs)), off: r4(num(o.off, 0.6)) };
    if (o.tipoCota) it.tipoCota = o.tipoCota;
    if (o.orient === "h" || o.orient === "v") it.orient = o.orient;
    if (o.prefixo) it.prefixo = String(o.prefixo); if (o.sufixo) it.sufixo = String(o.sufixo);
    if (o.eq) it.eq = true;
    if (fin(+o.ang)) it.ang = r4(+o.ang);
    if (fin(+o.lx) && fin(+o.ly)) { it.lx = r4(+o.lx); it.ly = r4(+o.ly); }
    if (o.dir) it.dir = { x: r6(num(o.dir.x, 1)), y: r6(num(o.dir.y, 0)) };
    if (fin(+o.inclManual)) it.inclManual = +o.inclManual;
    return itemValido(it) ? { ok: true, op: it } : { ok: false, motivo: "Cota incompleta: faltam referências." };
  }
  /* desloca a linha de cota até passar pelo ponto q (o 3º clique posiciona a linha) */
  function offsetPara(estado, it, q, opc) {
    var m = medirCota(indice(estado), it, opc || {}); if (!m.ok) return num(it.off, 0.6);
    if (m.geo && m.geo.t) return r4(dot(q, m.geo.t) - dot(m.geo.pts[0], m.geo.t));
    if (m.geo && m.geo.O) return r4(Math.max(0.05, len(sub(q, m.geo.O))));
    if (m.geo && m.geo.c) return r4(len(sub(q, m.geo.c)) - m.geo.r);
    return num(it.off, 0.6);
  }
  function opTexto(o) {
    var it = { op: "anot2d", id: o.id, vista: o.vista, tipo: "texto", x: r4(+o.x), y: r4(+o.y), texto: String(o.texto || "").trim(), tipoTexto: o.tipoTexto || "t25" };
    if (o.comLider && fin(+o.lx) && fin(+o.ly)) { it.comLider = true; it.lx = r4(+o.lx); it.ly = r4(+o.ly); }
    if (o.alinhH) it.alinhH = o.alinhH; if (fin(+o.rot)) it.rot = r4(+o.rot);
    return itemValido(it) ? { ok: true, op: it } : { ok: false, motivo: "Escreva o texto." };
  }
  function opSimbolo(o) {
    var it = { op: "anot2d", id: o.id, vista: o.vista, tipo: "simbolo", x: r4(+o.x), y: r4(+o.y), simbolo: o.simbolo || "norte", rot: r4(num(o.rot, 0)) };
    return itemValido(it) ? { ok: true, op: it } : { ok: false, motivo: "Símbolo desconhecido." };
  }
  function opNotaChave(o) {
    var it = { op: "anot2d", id: o.id, vista: o.vista, tipo: "notaChave", x: r4(+o.x), y: r4(+o.y), chave: String(o.chave || "").trim(), texto: String(o.texto || "").trim() };
    if (fin(+o.lx) && fin(+o.ly)) { it.comLider = true; it.lx = r4(+o.lx); it.ly = r4(+o.ly); }
    return itemValido(it) ? { ok: true, op: it } : { ok: false, motivo: "A nota-chave precisa da chave (ex.: 02.01)." };
  }
  function opNuvem(o) {
    var it = { op: "anot2d", id: o.id, vista: o.vista, tipo: "nuvem", pts: arr(o.pts).map(function (p) { return { x: r4(+p.x), y: r4(+p.y) }; }), revisao: o.revisao };
    return itemValido(it) ? { ok: true, op: it } : { ok: false, motivo: "A nuvem precisa de 3 pontos e de uma revisão." };
  }
  function opLinha(o) {
    var it = { op: "anot2d", id: o.id, vista: o.vista, tipo: "linha", estilo: ESTILOS_LINHA[o.estilo] ? o.estilo : "<Linhas finas>" };
    if (o.arco) it.arco = { cx: r4(+o.arco.cx), cy: r4(+o.arco.cy), r: r4(+o.arco.r), a0: fin(+o.arco.a0) ? r6(+o.arco.a0) : undefined, a1: fin(+o.arco.a1) ? r6(+o.arco.a1) : undefined };
    else it.pts = arr(o.pts).map(function (p) { return { x: r4(+p.x), y: r4(+p.y) }; });
    if (it.arco) { if (it.arco.a0 === undefined) delete it.arco.a0; if (it.arco.a1 === undefined) delete it.arco.a1; }
    return itemValido(it) ? { ok: true, op: it } : { ok: false, motivo: "A linha precisa de 2 pontos." };
  }
  function opRegiao(o) {
    var it = { op: "anot2d", id: o.id, vista: o.vista, tipo: "regiao", pts: arr(o.pts).map(function (p) { return { x: r4(+p.x), y: r4(+p.y) }; }),
               mascara: !!o.mascara, padrao: o.mascara ? null : (PADROES[o.padrao] ? o.padrao : "Diagonal ascendente"),
               estilo: ESTILOS_LINHA[o.estilo] ? o.estilo : (o.mascara ? "<Linhas invisíveis>" : "<Linhas finas>") };
    if (it.padrao == null) delete it.padrao;
    return itemValido(it) ? { ok: true, op: it } : { ok: false, motivo: "A região precisa de 3 pontos." };
  }
  function opComponente(o) {
    var c = COMPONENTES[o.comp];
    var it = { op: "anot2d", id: o.id, vista: o.vista, tipo: "componente", comp: o.comp, x: r4(+o.x), y: r4(+o.y), rot: r4(num(o.rot, 0)),
               larg: r4(num(o.larg, c ? c.larg : 0.2)), alt: r4(num(o.alt, c ? c.alt : 0.1)) };
    return itemValido(it) ? { ok: true, op: it } : { ok: false, motivo: "Componente desconhecido." };
  }
  function opLegenda(o) {
    var it = { op: "anot2d", id: o.id, vista: o.vista, tipo: "legenda", x: r4(+o.x), y: r4(+o.y), titulo: String(o.titulo || "LEGENDA").slice(0, 80) };
    return itemValido(it) ? { ok: true, op: it } : { ok: false, motivo: "Posição inválida." };
  }
  function opRevisao(o) {
    var it = { op: "revisao", id: o.id, numero: String(o.numero || "").trim(), data: txt(o.data), descricao: txt(o.descricao), emitidoPor: txt(o.emitidoPor) };
    return validaOp(it) === true ? { ok: true, op: it } : { ok: false, motivo: "A revisão precisa de número (ex.: R01)." };
  }
  /* TRAVAR: grava o valor de agora (o cadeado) */
  function opTravar(estado, id, travar) {
    var it = item(estado, id); if (!it || it.tipo !== "cota") return { ok: false, motivo: "Selecione uma cota." };
    if (!travar) return { ok: true, op: { op: "anot2dAjustar", id: id, campos: { travada: false } } };
    var c = it.calc || {}; if (!fin(c.valor)) return { ok: false, motivo: "A cota não está medindo nada agora." };
    return { ok: true, op: { op: "anot2dAjustar", id: id, campos: { travada: true, valorTravado: c.valor } } };
  }
  /* o deslocamento (no plano) que leva cada referência de uma cota linear a
     uma posição nova t (ao longo da direção da cota): ops "mover" */
  function moverRef(I, ref, delta, n) {
    var d = mul(n, delta);
    if (I.caixa[ref.el]) { var c = I.caixa[ref.el]; return { op: "mover", id: c.id, cx: r4(num(c.cx, 0) + d[0]), cz: r4(num(c.cz, 0) + d[1]) }; }
    if (I.familia[ref.el]) { var f = I.familia[ref.el]; return { op: "mover", id: f.id, cx: r4(num(f.x, 0) + d[0]), cz: r4(num(f.z, 0) + d[1]) }; }
    if (I.eixo[ref.el]) { var e = I.eixo[ref.el]; return { op: "mover", id: e.id, cx: r4((num(e.x0, 0) + num(e.x1, 0)) / 2 + d[0]), cz: r4((num(e.z0, 0) + num(e.z1, 0)) / 2 + d[1]) }; }
    return null;
  }
  /* EQ: as referências do meio vão para posições iguais (ao clicar EQ) */
  function opsIgualar(estado, id) {
    var it = item(estado, id); if (!it || it.tipo !== "cota" || (it.cota !== "linear" && it.cota !== "alinhada")) return { ok: false, motivo: "EQ vale para cota linear ou alinhada." };
    if (arr(it.refs).length < 3) return { ok: false, motivo: "EQ precisa de 3 referências ou mais (cota em cadeia)." };
    var I = indice(estado), m = medirCota(I, it, {}); if (!m.ok) return { ok: false, motivo: "A cota não está medindo." };
    var ts = m.geo.ts, N = ts.length, passo = (ts[N - 1] - ts[0]) / (N - 1), ops = [], vistos = {};
    for (var i = 1; i < N - 1; i++) {
      var delta = ts[0] + passo * i - ts[i]; if (Math.abs(delta) < 1e-6) continue;
      var ref = it.refs[i]; if (vistos[ref.el]) continue; vistos[ref.el] = 1;
      var op = moverRef(I, ref, delta, m.geo.n);
      if (!op) return { ok: false, motivo: "Uma referência do meio não é uma peça que se move (ponto solto ou linha de detalhe)." };
      ops.push(op);
    }
    return { ok: true, ops: ops };
  }
  /* COTA TRAVADA violada: leva a OUTRA ponta junto (mantém a restrição) —
     a referência que não andou anda o mesmo tanto */
  function opsManterTrava(estado, id, refMovida) {
    var it = item(estado, id); if (!it || !it.travada || (it.cota !== "linear" && it.cota !== "alinhada")) return { ok: false, motivo: "A cota não está travada." };
    var I = indice(estado), m = medirCota(I, it, {}); if (!m.ok) return { ok: false, motivo: "A cota não está medindo." };
    var refs = arr(it.refs), ia = 0, ib = refs.length - 1;
    var mexeu = refMovida != null ? (String(refs[ib].el) === String(refMovida) ? ib : ia) : ib;
    var outra = mexeu === ib ? ia : ib, sinal = outra === ia ? 1 : -1;
    var delta = sinal * (m.valor - +it.valorTravado);
    var op = moverRef(I, refs[outra], delta, m.geo.n);
    return op ? { ok: true, ops: [op] } : { ok: false, motivo: "A outra ponta da cota não é uma peça que se move." };
  }

  /* ===================================================== DESENHO (SVG) */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function n4(v) { return Math.round(v * 10000) / 10000; }
  var NS = 'vector-effect="non-scaling-stroke"';
  function corOk(c) { return /^#[0-9a-fA-F]{3,8}$/.test(String(c || "")) ? c : ""; }
  function stroke(cor) { var c = corOk(cor); return c ? ' stroke="' + c + '"' : ""; }
  function lnS(a, b, w, cls, extra) { return '<line x1="' + n4(a[0]) + '" y1="' + n4(a[1]) + '" x2="' + n4(b[0]) + '" y2="' + n4(b[1]) + '" stroke-width="' + w + '" ' + NS + (cls ? ' class="' + cls + '"' : "") + (extra || "") + "/>"; }
  /* texto em corpo 100 encolhido (o motivo está no js/desenho2d.js: corpo < 1 espaça as letras) */
  function txS(p, h, conteudo, cls, ancora, rot, t, base) {
    var s = h / 100, fw = t && t.negrito ? ' font-weight="700"' : "", fi = t && t.italico ? ' font-style="italic"' : "", fu = t && t.sublinhado ? ' text-decoration="underline"' : "";
    var sx = t && fin(+t.fatorLargura) && +t.fatorLargura > 0 ? s * +t.fatorLargura : s;
    return '<text x="0" y="0" font-size="100"' + (ancora ? ' text-anchor="' + ancora + '"' : "") + (base ? ' dominant-baseline="' + base + '"' : "") + fw + fi + fu +
      (t && t.fonte ? ' font-family="' + esc(t.fonte) + ', Arial, sans-serif"' : "") +
      ' transform="translate(' + n4(p[0]) + " " + n4(p[1]) + ")" + (rot ? " rotate(" + n4(rot) + ")" : "") + " scale(" + n4(sx * 1e3) / 1e3 + " " + n4(s * 1e3) / 1e3 + ')" class="' + cls + '">' + conteudo + "</text>";
  }
  function largTexto(s, h, t) { return String(s).length * h * 0.56 * (t && +t.fatorLargura > 0 ? +t.fatorLargura : 1); }
  function angLegivel(v) { var a = Math.atan2(v[1], v[0]) * 180 / Math.PI; if (a > 90.001 || a <= -90) a += 180; if (a > 180) a -= 360; return a; }
  function fundoTexto(p, w, h, rot, ancora) {
    var x0 = ancora === "middle" ? -w / 2 : ancora === "end" ? -w : 0;
    return '<rect x="' + n4(x0 - h * 0.15) + '" y="' + n4(-h * 0.95) + '" width="' + n4(w + h * 0.3) + '" height="' + n4(h * 1.25) + '" class="a7-fundo" transform="translate(' + n4(p[0]) + " " + n4(p[1]) + ")" + (rot ? " rotate(" + n4(rot) + ")" : "") + '"/>';
  }
  function marcaS(q, dir, t, k, w) {
    var m = t.marca, tk = num(t.tamMarca, 1.5) * k;
    if (m === "nenhuma") return "";
    if (m === "ponto") return '<circle cx="' + n4(q[0]) + '" cy="' + n4(q[1]) + '" r="' + n4(0.5 * k) + '" class="a7-cheio"/>';
    if (m === "seta") {
      var L = 2.6 * k, W = 0.8 * k, nn = perp(dir), b = sub(q, mul(dir, L));
      return '<path d="M' + n4(q[0]) + " " + n4(q[1]) + "L" + n4(b[0] + nn[0] * W) + " " + n4(b[1] + nn[1] * W) + "L" + n4(b[0] - nn[0] * W) + " " + n4(b[1] - nn[1] * W) + 'Z" class="a7-cheio"/>';
    }
    var o = unit(add(dir, perp(dir))) || dir;   /* traço a 45° da linha de cota */
    return lnS(sub(q, mul(o, tk / 2)), add(q, mul(o, tk / 2)), w, "a7-marca");
  }
  /* uma COTA → SVG */
  function svgCota(it, m, t, k, jogo, sel) {
    var wL = penaPx(t.pena, jogo), wM = penaPx(t.penaMarca, jogo), h = num(t.texto, 2.5) * k, s = "", cor = stroke(t.cor);
    var gap = num(t.intervalo, 1) * k, extC = num(t.extChamada, 1.5) * k, extL = num(t.extLinha, 1.5) * k, dT = num(t.deslocTexto, 0.8) * k;
    var opaco = t.fundo !== "Transparente";
    if (m.tipo === "linear" || m.tipo === "alinhada") {
      var g = m.geo, n = g.n, tt = g.t, qs = g.ts.map(function (tv) { return add(mul(n, tv), mul(tt, g.lineT)); });
      g.pts.forEach(function (p, i) {
        var q = qs[i], v = sub(q, p), L = len(v); if (L < 1e-9) return;
        var dv = mul(v, 1 / L);
        s += lnS(add(p, mul(dv, Math.min(gap, L * 0.5))), add(q, mul(dv, extC)), wL, "a7-l");
      });
      var ini = qs[0], fim = qs[qs.length - 1], dl = unit(sub(fim, ini)) || n;
      s += lnS(sub(ini, mul(dl, t.marca === "obliquo" ? extL : 0)), add(fim, mul(dl, t.marca === "obliquo" ? extL : 0)), wL, "a7-l");
      qs.forEach(function (q, i) { s += marcaS(q, i === 0 ? mul(dl, -1) : dl, t, k, wM); });
      var rot = angLegivel(dl);
      /* "acima da linha": o lado -y da tela depois de girar para leitura */
      var acima = mul(perp([Math.cos(rot * Math.PI / 180), Math.sin(rot * Math.PI / 180)]), -1);
      m.segs.forEach(function (sg, i) {
        var mid = mul(add(qs[i], qs[i + 1]), 0.5), tx = textoCota(it, t, sg.valor, it.eq && m.segs.length >= 2), p = add(mid, mul(acima, dT));
        if (opaco) s += fundoTexto(p, largTexto(tx, h, t), h, rot, "middle");
        s += txS(p, h, esc(tx), "a7-tx", "middle", rot, t);
      });
      if (it.travada) {   /* o cadeado: um quadradinho no meio da linha */
        var mc = mul(add(ini, fim), 0.5), cs = 1.2 * k, ab = add(mc, mul(acima, -1.6 * k));
        s += '<rect x="' + n4(ab[0] - cs / 2) + '" y="' + n4(ab[1] - cs / 2) + '" width="' + n4(cs) + '" height="' + n4(cs) + '" class="a7-trava" stroke-width="' + wL + '" ' + NS + "/>";
      }
    } else if (m.tipo === "angular") {
      var G = m.geo, R = G.raio, a1 = Math.atan2(G.v1[1], G.v1[0]), a2 = Math.atan2(G.v2[1], G.v2[0]);
      var da = a2 - a1; while (da <= -Math.PI) da += 2 * Math.PI; while (da > Math.PI) da -= 2 * Math.PI;
      var p1 = add(G.O, mul(G.v1, R)), p2 = add(G.O, mul(G.v2, R));
      s += '<path d="M' + n4(p1[0]) + " " + n4(p1[1]) + "A" + n4(R) + " " + n4(R) + " 0 0 " + (da > 0 ? 1 : 0) + " " + n4(p2[0]) + " " + n4(p2[1]) + '" fill="none" stroke-width="' + wL + '" ' + NS + ' class="a7-l"/>';
      s += lnS(G.O, add(G.O, mul(G.v1, R + extC)), wL, "a7-l") + lnS(G.O, add(G.O, mul(G.v2, R + extC)), wL, "a7-l");
      s += marcaS(p1, perp(G.v1), t, k, wM) + marcaS(p2, perp(G.v2), t, k, wM);
      var am = a1 + da / 2, pm = add(G.O, mul([Math.cos(am), Math.sin(am)], R + dT + h * 0.4)), txA = textoCota(it, t, m.valor, false), ra = angLegivel(perp([Math.cos(am), Math.sin(am)]));
      if (opaco) s += fundoTexto(pm, largTexto(txA, h, t), h, ra, "middle");
      s += txS(pm, h, esc(txA), "a7-tx", "middle", ra, t);
    } else if (m.tipo === "radial" || m.tipo === "diametro" || m.tipo === "arco") {
      var Gr = m.geo, dir = [Math.cos(Gr.ang), Math.sin(Gr.ang)], borda = add(Gr.c, mul(dir, Gr.r)), txR = textoCota(it, t, m.valor, false);
      if (m.tipo === "arco") {
        var Ra = Gr.r + Math.max(0.05, Gr.off), q0 = add(Gr.c, mul([Math.cos(Gr.a0), Math.sin(Gr.a0)], Ra)), q1 = add(Gr.c, mul([Math.cos(Gr.a1), Math.sin(Gr.a1)], Ra));
        var dA = Gr.a1 - Gr.a0; while (dA < 0) dA += 2 * Math.PI;
        s += '<path d="M' + n4(q0[0]) + " " + n4(q0[1]) + "A" + n4(Ra) + " " + n4(Ra) + " 0 " + (dA > Math.PI ? 1 : 0) + " 1 " + n4(q1[0]) + " " + n4(q1[1]) + '" fill="none" stroke-width="' + wL + '" ' + NS + ' class="a7-l"/>';
        s += lnS(add(Gr.c, mul([Math.cos(Gr.a0), Math.sin(Gr.a0)], Gr.r + gap)), add(q0, mul([Math.cos(Gr.a0), Math.sin(Gr.a0)], extC)), wL, "a7-l");
        s += lnS(add(Gr.c, mul([Math.cos(Gr.a1), Math.sin(Gr.a1)], Gr.r + gap)), add(q1, mul([Math.cos(Gr.a1), Math.sin(Gr.a1)], extC)), wL, "a7-l");
        s += marcaS(q0, perp([Math.cos(Gr.a0), Math.sin(Gr.a0)]), t, k, wM) + marcaS(q1, mul(perp([Math.cos(Gr.a1), Math.sin(Gr.a1)]), -1), t, k, wM);
        var amid = Gr.a0 + dA / 2, pt2 = add(Gr.c, mul([Math.cos(amid), Math.sin(amid)], Ra + dT + h * 0.4)), r2 = angLegivel(perp([Math.cos(amid), Math.sin(amid)]));
        if (opaco) s += fundoTexto(pt2, largTexto(txR, h, t), h, r2, "middle");
        s += txS(pt2, h, esc(txR), "a7-tx", "middle", r2, t);
      } else {
        var a = m.tipo === "diametro" ? add(Gr.c, mul(dir, -Gr.r)) : Gr.c, fora = add(borda, mul(dir, Math.max(0, Gr.off)));
        s += lnS(a, fora, wL, "a7-l");
        s += marcaS(borda, dir, { marca: "seta" }, k, wM);
        if (m.tipo === "diametro") s += marcaS(a, mul(dir, -1), { marca: "seta" }, k, wM);
        /* o texto acima da linha, no meio do raio (ou do diâmetro) */
        var rr = angLegivel(dir), acR = mul(perp([Math.cos(rr * Math.PI / 180), Math.sin(rr * Math.PI / 180)]), -1);
        var pT = add(mul(add(a, borda), 0.5), mul(acR, dT));
        if (opaco) s += fundoTexto(pT, largTexto(txR, h, t), h, rr, "middle");
        s += txS(pT, h, esc(txR), "a7-tx", "middle", rr, t);
      }
    } else if (m.tipo === "elevacao") {
      var P = m.geo.p, txE = textoCota(it, t, m.valor, false), lp = fin(+it.lx) && fin(+it.ly) ? [+it.lx, +it.ly] : add(P, [6 * k, -6 * k]);
      if (t.simbolo === "alvo") {
        var rA = 1.6 * k;
        s += '<circle cx="' + n4(P[0]) + '" cy="' + n4(P[1]) + '" r="' + n4(rA) + '" fill="none" stroke-width="' + wL + '" ' + NS + ' class="a7-l"/>';
        s += '<path d="M' + n4(P[0]) + " " + n4(P[1]) + "L" + n4(P[0] + rA) + " " + n4(P[1]) + "A" + n4(rA) + " " + n4(rA) + " 0 0 1 " + n4(P[0]) + " " + n4(P[1] + rA) + 'Z" class="a7-cheio"/>';
        s += '<path d="M' + n4(P[0]) + " " + n4(P[1]) + "L" + n4(P[0] - rA) + " " + n4(P[1]) + "A" + n4(rA) + " " + n4(rA) + " 0 0 1 " + n4(P[0]) + " " + n4(P[1] - rA) + 'Z" class="a7-cheio"/>';
      } else {
        var tr = 1.4 * k;
        s += '<path d="M' + n4(P[0]) + " " + n4(P[1]) + "L" + n4(P[0] - tr) + " " + n4(P[1] - tr * 1.5) + "L" + n4(P[0] + tr) + " " + n4(P[1] - tr * 1.5) + 'Z" fill="none" stroke-width="' + wL + '" ' + NS + ' class="a7-l"/>';
      }
      var wE = largTexto(txE, h, t);
      s += lnS(P, lp, wL, "a7-l") + lnS(lp, add(lp, [wE + 1 * k, 0]), wL, "a7-l");
      var pE = add(lp, [0.5 * k, -dT]);
      if (opaco) s += fundoTexto(pE, wE, h, 0, "start");
      s += txS(pE, h, esc(txE), "a7-tx", "start", 0, t);
    } else if (m.tipo === "inclinacao") {
      var Pi = m.geo.p, ds = unit(m.geo.desce) || [1, 0], Ls = 12 * k, a0 = sub(Pi, mul(ds, Ls / 2)), b0 = add(Pi, mul(ds, Ls / 2)), txI = textoCota(it, t, m.valor, false);
      s += lnS(a0, b0, wL, "a7-l") + marcaS(b0, ds, { marca: "seta" }, k, wM);
      var ri = angLegivel(ds), acI = mul(perp([Math.cos(ri * Math.PI / 180), Math.sin(ri * Math.PI / 180)]), -1), pI = add(Pi, mul(acI, dT));
      if (opaco) s += fundoTexto(pI, largTexto(txI, h, t), h, ri, "middle");
      s += txS(pI, h, esc(txI), "a7-tx", "middle", ri, t);
    }
    var cls = "a7-item a7-cota a7-cota-" + m.tipo + (sel ? " a7-sel" : "") + (it.violada ? " a7-violada" : "");
    return '<g class="' + cls + '" data-a7="' + esc(it.id) + '"' + cor + ">" + s + "</g>";
  }
  /* ---- texto com chamada (líder) */
  function svgTexto(it, t, k, jogo, sel, linhas) {
    var h = num(t.texto, 2.5) * k, w = penaPx(t.pena, jogo), L = linhas || String(it.texto || "").split(/\r?\n/), s = "", p = [num(it.x, 0), num(it.y, 0)];
    var anc = it.alinhH === "Centro" ? "middle" : it.alinhH === "Direita" ? "end" : "start", rot = num(it.rot, 0), lh = h * 1.45;
    var wMax = 0; L.forEach(function (l) { wMax = Math.max(wMax, largTexto(l, h, t)); });
    var x0 = anc === "middle" ? -wMax / 2 : anc === "end" ? -wMax : 0;
    if (it.comLider && fin(+it.lx) && fin(+it.ly)) {
      var alvo = [+it.lx, +it.ly], des = num(t.deslocChamada, 2) * k;
      var ancora = [p[0] + (alvo[0] < p[0] ? x0 - des : x0 + wMax + des), p[1] - h * 0.35];
      if (alvo[0] >= p[0] + x0 && alvo[0] <= p[0] + x0 + wMax) ancora = [p[0] + x0 + wMax / 2, alvo[1] < p[1] ? p[1] - h * 1.2 : p[1] + (L.length - 1) * lh + h * 0.5];
      s += lnS(ancora, alvo, w, "a7-l");
      var dS = unit(sub(alvo, ancora)) || [1, 0];
      if (t.seta === "ponto") s += '<circle cx="' + n4(alvo[0]) + '" cy="' + n4(alvo[1]) + '" r="' + n4(0.5 * k) + '" class="a7-cheio"/>';
      else if (t.seta !== "nenhuma") s += marcaS(alvo, dS, { marca: "seta" }, k, w);
    }
    if (t.fundo !== "Transparente" || t.borda) {
      s += '<rect x="' + n4(p[0] + x0 - h * 0.3) + '" y="' + n4(p[1] - h * 1.05) + '" width="' + n4(wMax + h * 0.6) + '" height="' + n4(L.length * lh + h * 0.2) + '" class="' + (t.fundo !== "Transparente" ? "a7-fundo" : "") + (t.borda ? " a7-borda" : "") + '"' +
        (t.borda ? ' stroke-width="' + w + '" ' + NS : "") + (rot ? ' transform="rotate(' + n4(rot) + " " + n4(p[0]) + " " + n4(p[1]) + ')"' : "") + "/>";
    }
    L.forEach(function (l, i) { s += txS([p[0], p[1] + i * lh], h, esc(l), "a7-tx", anc, rot, t); });
    return '<g class="a7-item a7-texto' + (sel ? " a7-sel" : "") + '" data-a7="' + esc(it.id) + '"' + stroke(t.cor) + ">" + s + "</g>";
  }
  function svgSimbolo(it, k, jogo, sel, e) {
    var p = [num(it.x, 0), num(it.y, 0)], rot = num(it.rot, 0), w = penaPx(3, jogo), s = "", R = 5 * k;
    var tr = ' transform="translate(' + n4(p[0]) + " " + n4(p[1]) + ")" + (rot ? " rotate(" + n4(rot) + ")" : "") + '"';
    if (it.simbolo === "norte") {
      s += '<circle cx="0" cy="0" r="' + n4(R) + '" fill="none" stroke-width="' + w + '" ' + NS + ' class="a7-l"/>';
      s += '<path d="M0 ' + n4(-R) + "L" + n4(R * 0.45) + " " + n4(R * 0.6) + "L0 " + n4(R * 0.25) + 'Z" class="a7-cheio"/>';
      s += '<path d="M0 ' + n4(-R) + "L" + n4(-R * 0.45) + " " + n4(R * 0.6) + "L0 " + n4(R * 0.25) + 'Z" fill="none" stroke-width="' + w + '" ' + NS + ' class="a7-l"/>';
      s += txS([0, -R - 1.2 * k], 3.5 * k, "N", "a7-tx", "middle", 0, { negrito: true });
    } else if (it.simbolo === "seta") {
      s += lnS([-R * 1.4, 0], [R * 1.4, 0], w, "a7-l") + marcaS([R * 1.4, 0], [1, 0], { marca: "seta" }, k, w);
    } else if (it.simbolo === "referencia") {
      s += '<circle cx="0" cy="0" r="' + n4(R * 0.6) + '" fill="none" stroke-width="' + w + '" ' + NS + ' class="a7-l"/>' + lnS([-R, 0], [R, 0], w, "a7-l") + lnS([0, -R], [0, R], w, "a7-l");
    } else if (it.simbolo === "escala-grafica") {
      /* 5 trechos de 1 m (ou de 0,5 m em escala grande), alternados */
      var passo = e && e.escala <= 25 ? 0.25 : e && e.escala <= 50 ? 0.5 : 1, hh = 1.6 * k;
      for (var i = 0; i < 4; i++) s += '<rect x="' + n4(i * passo) + '" y="0" width="' + n4(passo) + '" height="' + n4(hh) + '" class="' + (i % 2 ? "a7-fundo" : "a7-cheio") + '" stroke-width="' + w + '" ' + NS + "/>";
      for (var j = 0; j <= 4; j++) s += txS([j * passo, -1 * k], 2 * k, fmtNum(j * passo, passo < 1 ? 2 : 0), "a7-tx", "middle", 0, null);
      s += txS([4 * passo + 1.5 * k, hh], 2 * k, "m", "a7-tx", "start", 0, null);
    }
    return '<g class="a7-item a7-simbolo' + (sel ? " a7-sel" : "") + '" data-a7="' + esc(it.id) + '"' + tr + ">" + s + "</g>";
  }
  function svgNotaChave(it, k, jogo, sel) {
    var p = [num(it.x, 0), num(it.y, 0)], h = 2.5 * k, w = penaPx(1, jogo), ch = String(it.chave || ""), bw = Math.max(largTexto(ch, h, null) + 1.6 * k, 6 * k), bh = h * 1.7, s = "";
    if (it.comLider && fin(+it.lx) && fin(+it.ly)) { var alvo = [+it.lx, +it.ly], a = [p[0] + (alvo[0] < p[0] ? -bw / 2 : bw / 2), p[1]]; s += lnS(a, alvo, w, "a7-l") + marcaS(alvo, unit(sub(alvo, a)) || [1, 0], { marca: "seta" }, k, w); }
    s += '<rect x="' + n4(p[0] - bw / 2) + '" y="' + n4(p[1] - bh / 2) + '" width="' + n4(bw) + '" height="' + n4(bh) + '" class="a7-fundo a7-borda" stroke-width="' + w + '" ' + NS + "/>";
    s += txS([p[0], p[1] + h * 0.36], h, esc(ch), "a7-tx", "middle", 0, null);
    return '<g class="a7-item a7-nota' + (sel ? " a7-sel" : "") + '" data-a7="' + esc(it.id) + '">' + s + "</g>";
  }
  function areaSinal(P) { var a = 0; for (var i = 0; i < P.length; i++) { var p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
  /* NUVEM DE REVISÃO: arcos para FORA ao longo do contorno + o identificador (triângulo com o número da revisão) */
  function svgNuvem(it, rev, k, jogo, sel) {
    var P = arr(it.pts).map(pt).filter(Boolean); if (P.length < 3) return "";
    var ccw = areaSinal(P) > 0, corda = 5 * k, d = "M" + n4(P[0][0]) + " " + n4(P[0][1]), w = penaPx(3, jogo);
    for (var i = 0; i < P.length; i++) {
      var a = P[i], b = P[(i + 1) % P.length], L = len(sub(b, a)), nseg = Math.max(1, Math.round(L / corda));
      for (var j = 1; j <= nseg; j++) { var q = add(a, mul(sub(b, a), j / nseg)), rr = (L / nseg) * 0.62; d += "A" + n4(rr) + " " + n4(rr) + " 0 0 " + (ccw ? 0 : 1) + " " + n4(q[0]) + " " + n4(q[1]); }
    }
    var s = '<path d="' + d + 'Z" fill="none" stroke-width="' + w + '" ' + NS + ' class="a7-nuvem-l"/>';
    var top = P[0]; P.forEach(function (q) { if (q[1] < top[1] || (q[1] === top[1] && q[0] > top[0])) top = q; });
    var num0 = rev ? rev.numero : "?", T = 3.2 * k, c = add(top, [3 * k, -3.5 * k]);
    s += '<path d="M' + n4(c[0]) + " " + n4(c[1] - T) + "L" + n4(c[0] + T * 1.05) + " " + n4(c[1] + T * 0.75) + "L" + n4(c[0] - T * 1.05) + " " + n4(c[1] + T * 0.75) + 'Z" class="a7-fundo a7-nuvem-tag" stroke-width="' + w + '" ' + NS + "/>";
    s += txS([c[0], c[1] + T * 0.52], 1.9 * k, esc(String(num0).replace(/^R/i, "")), "a7-tx a7-nuvem-tx", "middle", 0, { negrito: true });
    return '<g class="a7-item a7-nuvem' + (sel ? " a7-sel" : "") + '" data-a7="' + esc(it.id) + '" data-a7-rev="' + esc(num0) + '">' + s + "</g>";
  }
  function dashDe(est, k) { return est && est.traco ? ' stroke-dasharray="' + est.traco.map(function (v) { return n4(Math.max(0.0001, v * k)); }).join(" ") + '"' : ""; }
  function svgLinha(it, k, jogo, sel) {
    var est = ESTILOS_LINHA[it.estilo] || ESTILOS_LINHA["<Linhas finas>"], w = penaPx(est.pena, jogo), d = "";
    if (it.arco) {
      var A = it.arco, r = num(A.r, 0), c = [num(A.cx, 0), num(A.cy, 0)];
      if (fin(A.a0) && fin(A.a1)) {
        var da = A.a1 - A.a0; while (da < 0) da += 2 * Math.PI;
        var p0 = add(c, mul([Math.cos(A.a0), Math.sin(A.a0)], r)), p1 = add(c, mul([Math.cos(A.a1), Math.sin(A.a1)], r));
        d = "M" + n4(p0[0]) + " " + n4(p0[1]) + "A" + n4(r) + " " + n4(r) + " 0 " + (da > Math.PI ? 1 : 0) + " 1 " + n4(p1[0]) + " " + n4(p1[1]);
      } else d = "M" + n4(c[0] - r) + " " + n4(c[1]) + "A" + n4(r) + " " + n4(r) + " 0 1 0 " + n4(c[0] + r) + " " + n4(c[1]) + "A" + n4(r) + " " + n4(r) + " 0 1 0 " + n4(c[0] - r) + " " + n4(c[1]);
    } else arr(it.pts).forEach(function (p, i) { d += (i ? "L" : "M") + n4(+p.x) + " " + n4(+p.y); });
    return '<g class="a7-item a7-linha' + (sel ? " a7-sel" : "") + '" data-a7="' + esc(it.id) + '" data-a7-estilo="' + esc(it.estilo) + '"><path d="' + d + '" fill="none" stroke-width="' + w + '" ' + NS + dashDe(est, k) +
      ' class="a7-l' + (est.invisivel ? " a7-invisivel" : "") + '"/></g>';
  }
  /* PADRÕES DE PREENCHIMENTO desenhados pela RA (mm de papel × k) — id por escala */
  function idPadrao(nome, escala) { return "a7p-" + String(nome).replace(/[^a-z0-9]+/gi, "_") + "-" + escala; }
  function defPadrao(nome, k, escala) {
    var P = PADROES[nome]; if (!P || P.solido || P.cinza) return "";
    var g = num(P.passo, 1.5) * k, wq = n4(0.09 * 5.5 * k * 0.2 + 0.06 * k), id = idPadrao(nome, escala), s = "";
    if (P.linhas) {
      return P.linhas.map(function (ang, i) {
        return '<pattern id="' + id + (i ? "-" + i : "") + '" patternUnits="userSpaceOnUse" width="' + n4(g) + '" height="' + n4(g) + '" patternTransform="rotate(' + ang + ')"><line x1="0" y1="0" x2="0" y2="' + n4(g) + '" class="a7-hach" stroke-width="' + wq + '"/></pattern>';
      }).join("");
    }
    if (P.concreto) s = '<circle cx="' + n4(g * 0.2) + '" cy="' + n4(g * 0.3) + '" r="' + n4(g * 0.05) + '" class="a7-hach-p"/><circle cx="' + n4(g * 0.7) + '" cy="' + n4(g * 0.75) + '" r="' + n4(g * 0.04) + '" class="a7-hach-p"/>' +
      '<path d="M' + n4(g * 0.55) + " " + n4(g * 0.15) + "l" + n4(g * 0.16) + " " + n4(g * 0.05) + "l" + n4(-g * 0.1) + " " + n4(g * 0.13) + 'Z" fill="none" class="a7-hach" stroke-width="' + wq + '"/>' +
      '<path d="M' + n4(g * 0.12) + " " + n4(g * 0.7) + "l" + n4(g * 0.12) + " " + n4(-g * 0.06) + "l" + n4(g * 0.02) + " " + n4(g * 0.14) + 'Z" fill="none" class="a7-hach" stroke-width="' + wq + '"/>';
    else if (P.pontos) s = [[0.15, 0.2], [0.6, 0.1], [0.4, 0.55], [0.85, 0.5], [0.2, 0.85], [0.7, 0.85]].map(function (q) { return '<circle cx="' + n4(q[0] * g) + '" cy="' + n4(q[1] * g) + '" r="' + n4(g * 0.04) + '" class="a7-hach-p"/>'; }).join("");
    else if (P.terra) s = '<path d="M' + n4(g * 0.1) + " " + n4(g * 0.3) + "h" + n4(g * 0.3) + "M" + n4(g * 0.15) + " " + n4(g * 0.42) + "h" + n4(g * 0.2) + "M" + n4(g * 0.55) + " " + n4(g * 0.78) + "h" + n4(g * 0.3) + "M" + n4(g * 0.6) + " " + n4(g * 0.9) + "h" + n4(g * 0.2) + '" class="a7-hach" stroke-width="' + wq + '"/>';
    else if (P.madeira) s = '<path d="M0 ' + n4(g * 0.3) + "Q" + n4(g * 0.25) + " " + n4(g * 0.1) + " " + n4(g * 0.5) + " " + n4(g * 0.3) + "T" + n4(g) + " " + n4(g * 0.3) + "M0 " + n4(g * 0.8) + "Q" + n4(g * 0.25) + " " + n4(g * 0.6) + " " + n4(g * 0.5) + " " + n4(g * 0.8) + "T" + n4(g) + " " + n4(g * 0.8) + '" fill="none" class="a7-hach" stroke-width="' + wq + '"/>';
    return '<pattern id="' + id + '" patternUnits="userSpaceOnUse" width="' + n4(g) + '" height="' + n4(g) + '">' + s + "</pattern>";
  }
  function preencher(nome, escala) {
    var P = PADROES[nome]; if (!P) return [];
    if (P.solido) return ['class="a7-solido"'];
    if (P.cinza) return ['class="a7-cinza"'];
    if (P.linhas) return P.linhas.map(function (a, i) { return 'fill="url(#' + idPadrao(nome, escala) + (i ? "-" + i : "") + ')"'; });
    return ['fill="url(#' + idPadrao(nome, escala) + ')"'];
  }
  function caminhoPts(P) { var d = ""; P.forEach(function (p, i) { d += (i ? "L" : "M") + n4(p[0]) + " " + n4(p[1]); }); return d + "Z"; }
  function svgRegiao(it, k, jogo, sel, escala) {
    var P = arr(it.pts).map(pt).filter(Boolean); if (P.length < 3) return "";
    var d = caminhoPts(P), s = "", est = ESTILOS_LINHA[it.estilo] || ESTILOS_LINHA[it.mascara ? "<Linhas invisíveis>" : "<Linhas finas>"];
    if (it.mascara) s += '<path d="' + d + '" class="a7-mascara"/>';
    else preencher(it.padrao, escala).forEach(function (f) { s += '<path d="' + d + '" ' + f + ' fill-rule="evenodd"/>'; });
    if (!est.invisivel) s += '<path d="' + d + '" fill="none" stroke-width="' + penaPx(est.pena, jogo) + '" ' + NS + dashDe(est, k) + ' class="a7-l"/>';
    else if (sel) s += '<path d="' + d + '" fill="none" stroke-width="1" ' + NS + ' class="a7-l a7-contorno-sel"/>';
    return '<g class="a7-item a7-regiao' + (it.mascara ? " a7-mascarado" : "") + (sel ? " a7-sel" : "") + '" data-a7="' + esc(it.id) + '"' + (it.padrao ? ' data-a7-padrao="' + esc(it.padrao) + '"' : "") + ">" + s + "</g>";
  }
  function svgComponente(it, k, jogo, sel, escala) {
    var c = COMPONENTES[it.comp]; if (!c) return "";
    var W = num(it.larg, c.larg), H = num(it.alt, c.alt), w = penaPx(3, jogo), wf = penaPx(1, jogo), s = "";
    var rect = function (x, y, ww, hh, f, cls) { return '<rect x="' + n4(x) + '" y="' + n4(y) + '" width="' + n4(ww) + '" height="' + n4(hh) + '" ' + (f || 'fill="none"') + ' stroke-width="' + w + '" ' + NS + ' class="' + (cls || "a7-l") + '"/>'; };
    if (it.comp === "madeira") s += rect(0, 0, W, H) + lnS([0, 0], [W, H], wf, "a7-l") + lnS([W, 0], [0, H], wf, "a7-l");
    else if (it.comp === "perfil-u") {
      var t = num(c.esp, 0.003);
      s += '<path d="M' + n4(W) + " 0H0V" + n4(H) + "H" + n4(W) + "V" + n4(H - t) + "H" + n4(t) + "V" + n4(t) + "H" + n4(W) + 'Z" class="a7-solido" stroke-width="' + wf + '" ' + NS + "/>";
    } else if (it.comp === "junta") {
      s += lnS([0, 0], [0, H], w, "a7-l") + lnS([W, 0], [W, H], w, "a7-l");
      var zz = "M0 0", nz = Math.max(2, Math.round(H / Math.max(W, 0.005)));
      for (var i = 1; i <= nz; i++) zz += "L" + n4(i % 2 ? W : 0) + " " + n4(H * i / nz);
      s += '<path d="' + zz + '" fill="none" stroke-width="' + wf + '" ' + NS + ' class="a7-l"/>';
    } else {
      preencher(c.padrao, escala).forEach(function (f) { s += rect(0, 0, W, H, f, "a7-semtraco"); });
      s += rect(0, 0, W, H);
      if (it.comp === "bloco-ceramico" || it.comp === "bloco-concreto") {
        var m = Math.min(W, H) * 0.18, f2 = it.comp === "bloco-ceramico" ? 3 : 2, hi = (H - m * (f2 + 1)) / f2;
        for (var j = 0; j < f2; j++) s += rect(m, m + j * (hi + m), W - 2 * m, hi, 'class="a7-fundo"', "a7-l a7-fundo");
      }
    }
    var tr = ' transform="translate(' + n4(num(it.x, 0)) + " " + n4(num(it.y, 0)) + ")" + (num(it.rot, 0) ? " rotate(" + n4(num(it.rot, 0)) + ")" : "") + '"';
    return '<g class="a7-item a7-comp' + (sel ? " a7-sel" : "") + '" data-a7="' + esc(it.id) + '" data-a7-comp="' + esc(it.comp) + '"' + tr + ">" + s + "</g>";
  }
  /* LEGENDA: o que a vista USA — estilos de linha, padrões das regiões, componentes e notas-chave */
  function conteudoLegenda(itens) {
    var est = {}, pad = {}, comp = {}, notas = {}, ordem = [];
    itens.forEach(function (it) {
      if (it.tipo === "linha" && !est[it.estilo]) { est[it.estilo] = 1; ordem.push({ k: "linha", nome: it.estilo, rotulo: it.estilo.replace(/[<>]/g, "") }); }
      if (it.tipo === "regiao" && !it.mascara && it.padrao && !pad[it.padrao]) { pad[it.padrao] = 1; ordem.push({ k: "regiao", nome: it.padrao, rotulo: it.padrao }); }
      if (it.tipo === "componente" && !comp[it.comp]) { comp[it.comp] = 1; ordem.push({ k: "componente", nome: it.comp, rotulo: (COMPONENTES[it.comp] || {}).nome || it.comp }); }
      if (it.tipo === "notaChave" && !notas[it.chave]) { notas[it.chave] = 1; ordem.push({ k: "nota", nome: it.chave, rotulo: it.chave + " — " + (it.texto || "") }); }
    });
    return ordem;
  }
  function svgLegenda(it, linhas, k, jogo, sel, escala) {
    var p = [num(it.x, 0), num(it.y, 0)], h = 2.5 * k, w = penaPx(1, jogo), s = "", lh = 6 * k;
    s += txS([p[0], p[1]], 3.5 * k, esc(String(it.titulo || "LEGENDA").toUpperCase()), "a7-tx", "start", 0, { negrito: true });
    if (!linhas.length) s += txS([p[0], p[1] + lh], h, "(nada a listar nesta vista)", "a7-tx a7-fraco", "start", 0, null);
    linhas.forEach(function (l, i) {
      var y = p[1] + (i + 1) * lh, a = [p[0], y - h * 0.4], b = [p[0] + 10 * k, y - h * 0.4];
      if (l.k === "linha") { var est = ESTILOS_LINHA[l.nome] || {}; s += '<path d="M' + n4(a[0]) + " " + n4(a[1]) + "L" + n4(b[0]) + " " + n4(b[1]) + '" stroke-width="' + penaPx(est.pena, jogo) + '" ' + NS + dashDe(est, k) + ' class="a7-l"/>'; }
      else if (l.k === "regiao") preencher(l.nome, escala).concat(['fill="none" stroke-width="' + w + '" ' + NS + ' class="a7-l"']).forEach(function (f) { s += '<rect x="' + n4(p[0]) + '" y="' + n4(y - h * 1.1) + '" width="' + n4(10 * k) + '" height="' + n4(h * 1.4) + '" ' + f + "/>"; });
      else if (l.k === "componente") s += '<rect x="' + n4(p[0] + 2 * k) + '" y="' + n4(y - h * 1.1) + '" width="' + n4(6 * k) + '" height="' + n4(h * 1.4) + '" fill="none" stroke-width="' + w + '" ' + NS + ' class="a7-l"/>';
      s += txS([p[0] + 13 * k, y], h, esc(l.rotulo), "a7-tx", "start", 0, null);
    });
    return '<g class="a7-item a7-legenda' + (sel ? " a7-sel" : "") + '" data-a7="' + esc(it.id) + '">' + s + "</g>";
  }

  /* ===================================================== A VISTA (gancho do js/desenho2d.js)
   * anotarVista(estado, vistaId, opc) → { vista, itens:[{it, m}], revs, tipos } —
   * vai em d.anotP7; svg(d.anotP7, estilo, pena) desenha. opc = { nivelY, sel } */
  function anotarVista(estado, vista, opc) {
    opc = opc || {};
    var L = itensDaVista(estado, vista); if (!L.length) return null;
    var I = indice(estado), corte = /^d2c-/.test(String(vista)), revs = {}, violadas = {};
    revisoes(estado).forEach(function (r) { revs[r.id] = r; });
    violacoes(estado).forEach(function (v) { violadas[v.id] = 1; });
    var itens = L.map(function (it) {
      var x = clone(it); if (violadas[it.id]) x.violada = true;
      var o = { it: x };
      if (it.tipo === "cota") { o.m = medirCota(I, it, { corte: corte, nivelY: opc.nivelY }); o.t = tipoCotaDe(estado, it); }
      if (it.tipo === "texto") o.t = tipoTextoDe(estado, it);
      return o;
    });
    return { vista: vista, itens: itens, revs: revs, sel: opc.sel || null, legenda: conteudoLegenda(L) };
  }
  /* parte: "fundo" = regiões e mascaramento (vão POR BAIXO da anotação do
     desenho: cotas automáticas, eixos, marcas), "frente" = o resto; sem
     parte, tudo */
  function svgVista(a, e, pena, parte) {
    if (!a || !a.itens) return "";
    var k = (e && e.escala ? e.escala : 50) / 1000, jogo = (e && e.pena) || "media", escala = (e && e.escala) || 50, s = "", defs = {}, regioes = "", resto = "", mascaras = "";
    function usar(nome) { if (nome && !defs[nome]) defs[nome] = defPadrao(nome, k, escala); }
    a.itens.forEach(function (o) {
      var it = o.it, sel = a.sel != null && String(a.sel) === String(it.id);
      if (it.tipo === "regiao") { if (!it.mascara) usar(it.padrao); if (it.mascara) mascaras += svgRegiao(it, k, jogo, sel, escala); else regioes += svgRegiao(it, k, jogo, sel, escala); }
      else if (it.tipo === "componente") { usar((COMPONENTES[it.comp] || {}).padrao); resto += svgComponente(it, k, jogo, sel, escala); }
      else if (it.tipo === "cota") { if (o.m && o.m.ok) resto += svgCota(it, o.m, o.t, k, jogo, sel); }
      else if (it.tipo === "texto") resto += svgTexto(it, o.t, k, jogo, sel);
      else if (it.tipo === "simbolo") resto += svgSimbolo(it, k, jogo, sel, e);
      else if (it.tipo === "notaChave") resto += svgNotaChave(it, k, jogo, sel);
      else if (it.tipo === "nuvem") resto += svgNuvem(it, a.revs[it.revisao], k, jogo, sel);
      else if (it.tipo === "linha") resto += svgLinha(it, k, jogo, sel);
      else if (it.tipo === "legenda") { (a.legenda || []).forEach(function (l) { if (l.k === "regiao") usar(l.nome); }); resto += svgLegenda(it, a.legenda || [], k, jogo, sel, escala); }
    });
    var d = Object.keys(defs).map(function (kk) { return defs[kk]; }).join("");
    /* ordem de empilhamento: região preenchida embaixo, mascaramento por cima do modelo, o resto da anotação em cima */
    if (parte === "fundo") resto = "";
    else if (parte === "frente") { regioes = ""; mascaras = ""; }
    s = (d ? "<defs>" + d + "</defs>" : "") + regioes + mascaras + resto;
    return s ? '<g class="a7-anot' + (parte ? " a7-" + parte : "") + '" data-a7-vista="' + esc(a.vista) + '">' + s + "</g>" : "";
  }
  /* caixa (m) do que a anotação ocupa — o papel cresce para caber */
  function caixaVista(a, e) {
    if (!a || !a.itens || !a.itens.length) return null;
    var k = (e && e.escala ? e.escala : 50) / 1000, b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    function P(p, m) { m = m || 0; if (!p || !fin(p[0]) || !fin(p[1])) return; b.x0 = Math.min(b.x0, p[0] - m); b.y0 = Math.min(b.y0, p[1] - m); b.x1 = Math.max(b.x1, p[0] + m); b.y1 = Math.max(b.y1, p[1] + m); }
    a.itens.forEach(function (o) {
      var it = o.it;
      if (fin(+it.x)) P([+it.x, +it.y], 12 * k);
      if (fin(+it.lx)) P([+it.lx, +it.ly], 4 * k);
      arr(it.pts).forEach(function (q) { P([+q.x, +q.y], 4 * k); });
      if (it.arco) P([+it.arco.cx, +it.arco.cy], +it.arco.r + 2 * k);
      if (it.tipo === "legenda") P([+it.x + 60 * k, +it.y + (a.legenda || []).length * 6 * k + 8 * k]);
      if (o.m && o.m.ok && o.m.geo) {
        var g = o.m.geo;
        if (g.pts && g.t) g.ts.forEach(function (tv) { P(add(mul(g.n, tv), mul(g.t, g.lineT)), 5 * k); });
        if (g.O) P(g.O, g.raio + 6 * k);
        if (g.c) P(g.c, g.r + Math.max(0, g.off || 0) + 6 * k);
        if (g.p) P(g.p, 14 * k);
      }
    });
    return b.x0 === Infinity ? null : b;
  }

  var P7 = {
    PENAS_RA: PENAS_RA, TIPOS_COTA: TIPOS_COTA, TIPOS_TEXTO: TIPOS_TEXTO, PARAMS_TIPO_COTA: PARAMS_TIPO_COTA, PARAMS_INST_COTA: PARAMS_INST_COTA,
    PARAMS_TIPO_TEXTO: PARAMS_TIPO_TEXTO, PARAMS_INST_TEXTO: PARAMS_INST_TEXTO, ESTILOS_LINHA: ESTILOS_LINHA, PADROES: PADROES,
    SIMBOLOS: SIMBOLOS, COMPONENTES: COMPONENTES, MARCAS: MARCAS, SETAS: SETAS, ESTILO_DA_COTA: ESTILO_DA_COTA, TIPOS_DE_COTA: TIPOS_DE_COTA,
    ehOp: function (nome) { return !!OPS[nome]; },
    penaPx: penaPx, fmtComp: fmtComp, fmtElev: fmtElev, textoCota: textoCota,
    tiposCota: tiposCota, tiposTexto: tiposTexto, tipoCotaDe: tipoCotaDe, tipoTextoDe: tipoTextoDe,
    indice: indice, resolverRef: resolverRef, medirCota: function (estado, it, opc) { return medirCota(indice(estado), it, opc || {}); },
    acharRef: acharRef, offsetPara: offsetPara,
    validaOp: validaOp, aplicarOp: aplicarOp, fimOp: fimOp, registrar: registrar,
    itensDaVista: itensDaVista, item: item, revisoes: revisoes, revisaoAtual: revisaoAtual, proximoNumero: proximoNumero, violacoes: violacoes,
    opCota: opCota, opTexto: opTexto, opSimbolo: opSimbolo, opNotaChave: opNotaChave, opNuvem: opNuvem, opLinha: opLinha, opRegiao: opRegiao,
    opComponente: opComponente, opLegenda: opLegenda, opRevisao: opRevisao, opTravar: opTravar, opsIgualar: opsIgualar, opsManterTrava: opsManterTrava,
    anotarVista: anotarVista, svg: svgVista, caixa: caixaVista, conteudoLegenda: conteudoLegenda
  };
  if (global.BimEdit) registrar(global.BimEdit);
  else if (typeof require === "function") { try { var BEr = require("./bimedit.js"); if (BEr) registrar(BEr); } catch (eR) {} }
  global.BimAnotP7 = P7;
  (global.BimAnot = global.BimAnot || {}).P7 = P7;
  if (typeof module !== "undefined" && module.exports) { module.exports.P7 = P7; module.exports.BimAnotP7 = P7; }
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
