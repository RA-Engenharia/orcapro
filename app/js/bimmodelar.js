/* =====================================================================
 * bimmodelar.js — MODELAGEM POR COMANDO (B8, 08/10/2026) — o VALIDADOR
 *
 * Pedido do Rogério (PLANO-BIM-MODELADOR.md, fase B8): o usuário escreve
 * "casa térrea 8×10 com 2 quartos…" (ou manda o croqui) e a IA devolve a
 * LISTA DE OPERAÇÕES do js/bimedit.js — o mesmo JSON que o editor grava.
 * O app mostra a prévia e só grava no "Aplicar ao modelo".
 *
 * ESTE ARQUIVO É O MESMO NO SERVIDOR E NO APP. O servidor de IA
 * (server/ia-modelar.js) faz `require` dele para recusar resposta ruim antes
 * de devolver (e pedir correção à IA); o app roda de novo ao receber (defesa:
 * servidor velho ou trocado). Uma regra, um lugar — como o js/familia.js na
 * /ia/familia. Motor puro, ES5, Node-testável.
 *
 * O QUE A IA PODE MANDAR (forma de CONSTRUÇÃO — conta menos para a IA errar;
 * a geometria canônica quem calcula é o BimEdit):
 *   parede    {op,id,de:{x,z},ate:{x,z},espessura,altura,base}
 *   laje      {op,id,de,ate,espessura,topo}
 *   pilar     {op,id,em:{x,z},secao,altura,base}
 *   viga      {op,id,de,ate,b,h,topo}
 *   cobertura {op,id,de,ate,inclinacao(%),aguas,beiral,base}
 *   familia   {op,id,famId,tipoId, host:{id,aoLongo|t}} (porta/janela) | {…,x,z,giro}
 *   anotar    {op,id,x,z,texto}
 * e também a forma CANÔNICA do editor ({op:'criar',caixa}, {op:'cobertura',
 * cobertura}, familia/anotar canônicas) — que é RECALCULADA do mesmo jeito.
 *
 * ⚠ A IA SÓ CRIA. apagar, apagarIfc, mover, instancia, desanotar, orcar e
 *   lote são RECUSADOS com o motivo: mexer no que já existe (inclusive o IFC
 *   do cliente) e orçar (código SINAPI) é com o usuário.
 * ⚠ NADA É "CONSERTADO" CALADO. Medida fora da faixa do editor (as mesmas
 *   travas dos campos dele: espessura 0,05–1,00 m, altura 0,30–8,00 m…) é
 *   recusada com o número — não grampeada. A recusa volta para a IA corrigir
 *   (no servidor) e aparece na prévia (no app).
 * ⚠ QUANTITATIVO EXATO: área e volume de cada peça saem do BimEdit (nunca da
 *   IA). Uma parede que a IA mande com "area: 999" sai com L × H.
 * ===================================================================== */
(function (global) {
  "use strict";

  function BE() {
    if (global.BimEdit) return global.BimEdit;
    if (typeof module !== "undefined" && typeof require === "function") { try { return require("./bimedit.js"); } catch (e) { return null; } }
    return null;
  }

  /* as travas — as MESMAS dos campos do editor (js/bim.js, painel de edição:
     esp 0,05–1,0; alt 0,3–8; seção 0,1–1) e dos construtores do BimEdit */
  var LIM = {
    maxOps: 150, coord: 200, cota: [-10, 60], texto: 80,
    parede: { espessura: [0.05, 1.0], altura: [0.3, 8], comprimento: [0.1, 100] },
    laje: { espessura: [0.05, 0.4], lado: [0.1, 100] },
    pilar: { secao: [0.1, 1], altura: [0.3, 20] },
    viga: { b: [0.05, 1], h: [0.1, 2], comprimento: [0.1, 30] },
    cobertura: { inclinacao: [1, 300], beiral: [0, 3], lado: [0.3, 100], espessura: [0.02, 0.5] }
  };
  var SO_CRIA = { apagar: 1, apagarIfc: 1, mover: 1, instancia: 1, desanotar: 1, orcar: 1, lote: 1 };
  var CONHECIDAS = { parede: 1, laje: 1, pilar: 1, viga: 1, cobertura: 1, familia: 1, anotar: 1, criar: 1 };

  function num(v) { if (typeof v === "number") return v; if (typeof v === "string" && v.trim() !== "") { var n = Number(v.replace(",", ".")); return n; } return NaN; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function br(v, c) { return String(Math.round(v * Math.pow(10, c == null ? 2 : c)) / Math.pow(10, c == null ? 2 : c)).replace(".", ","); }
  function txt(v) { return v == null ? "" : String(v); }
  function limpaTexto(s, n) { return txt(s).replace(/[\u0000-\u001F\u007F<>]/g, "").trim().slice(0, n); }
  function esc(s) { return txt(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /* lê um ponto {x,z} (aceita [x,z]) dentro da área de trabalho */
  function ponto(p, rot, erros) {
    var x = NaN, z = NaN;
    if (Array.isArray(p)) { x = num(p[0]); z = num(p[1]); } else if (p && typeof p === "object") { x = num(p.x); z = num(p.z); }
    if (!fin(x) || !fin(z)) { erros.push(rot + " sem coordenada x/z numérica"); return null; }
    if (Math.abs(x) > LIM.coord || Math.abs(z) > LIM.coord) { erros.push(rot + " fora da área de trabalho (±" + LIM.coord + " m)"); return null; }
    return { x: x, z: z };
  }
  /* número com padrão e faixa: ausente → padrão; fora da faixa → erro (não grampeia) */
  function medida(v, pad, faixa, nome, erros) {
    var n = (v == null || v === "") ? pad : num(v);
    if (!fin(n)) { erros.push(nome + " não é número"); return NaN; }
    if (faixa && (n < faixa[0] - 1e-9 || n > faixa[1] + 1e-9)) { erros.push(nome + " " + br(n) + " fora de " + br(faixa[0]) + " a " + br(faixa[1])); return NaN; }
    return n;
  }
  function chaveSeg(a, b) { var k1 = br(a.x, 2) + ";" + br(a.z, 2), k2 = br(b.x, 2) + ";" + br(b.z, 2); return k1 < k2 ? k1 + "|" + k2 : k2 + "|" + k1; }

  /* -----------------------------------------------------------------
   * normalizar(ops, ctx) → { ok, ops (canônicas), recusadas, avisos, resumo }
   * ctx = { catalogo: [{id,nome,categoria,hospedagem,tipos:[{id,nome,largura,altura,peitoril}]}],
   *         base (cota do nível, m), peDireito (m), maxOps }
   * ----------------------------------------------------------------- */
  function normalizar(ops, ctx) {
    ctx = ctx || {};
    var B = BE();
    var saida = [], recusadas = [], avisos = [], ids = {}, paredes = {}, segs = {}, vaosPorParede = {};
    if (!B) return { ok: false, ops: [], recusadas: [], avisos: ["sem o motor do editor (js/bimedit.js)"], resumo: null };
    var lista = Array.isArray(ops) ? ops : [];
    var teto = ctx.maxOps > 0 ? Math.min(ctx.maxOps, 1000) : LIM.maxOps;
    if (lista.length > teto) { avisos.push("vieram " + lista.length + " operações; o teto é " + teto + " — as excedentes ficaram de fora"); lista = lista.slice(0, teto); }
    var base0 = fin(num(ctx.base)) ? num(ctx.base) : 0, pe0 = fin(num(ctx.peDireito)) ? num(ctx.peDireito) : 2.8;
    var cat = {}; (Array.isArray(ctx.catalogo) ? ctx.catalogo : []).forEach(function (f) { if (f && f.id) cat[String(f.id)] = f; });
    var codigoIgnorado = false;

    function recusar(i, o, motivo) { recusadas.push({ i: i, op: txt(o && o.op) || "?", id: txt(o && o.id), motivo: motivo }); }
    function idDe(i, o) {
      var s = txt(o.id).trim();
      if (!/^[A-Za-z0-9_.-]{1,40}$/.test(s)) { recusar(i, o, "id \"" + s.slice(0, 40) + "\" inválido (letras, números, . _ -; até 40)"); return null; }
      if (ids[s]) { recusar(i, o, "id \"" + s + "\" repetido"); return null; }
      return s;
    }
    function aceitar(o, id) { ids[id] = 1; saida.push(o); }

    /* 1ª passada: tudo menos família (a porta precisa da parede pronta, venha ela antes ou depois na lista) */
    var familias = [];
    lista.forEach(function (o, i) {
      if (!o || typeof o !== "object" || Array.isArray(o)) { recusar(i, o, "não é uma operação"); return; }
      var op = txt(o.op);
      if (SO_CRIA[op]) { recusar(i, o, "a IA só cria — " + op + " (apagar, mover, trocar, orçar) é com você"); return; }
      if (!CONHECIDAS[op]) { recusar(i, o, "operação \"" + op.slice(0, 30) + "\" desconhecida"); return; }
      if (o.servicos != null || o.codigo != null || (o.caixa && (o.caixa.servicos != null || o.caixa.codigo != null))) codigoIgnorado = true;
      if (op === "familia") { familias.push({ o: o, i: i }); return; }
      var id = idDe(i, o); if (id == null) return;
      var e = [], c = null, nome = op === "criar" ? txt(o.caixa && o.caixa.tipo) || "elemento" : op;
      /* forma CANÔNICA do editor → os mesmos argumentos da forma de construção */
      var a = o;
      if (op === "criar") {
        var cx = o.caixa;
        if (!cx || typeof cx !== "object") { recusar(i, o, "criar sem caixa"); return; }
        var vals = ["cx", "cy", "cz", "comprimento", "altura", "espessura", "rotY"].map(function (k) { return num(cx[k]); });
        if (!vals.every(fin)) { recusar(i, o, "caixa com medida que não é número"); return; }
        if (cx.tipo === "parede" || cx.tipo === "viga") {
          var ex = B.eixoDaCaixa({ cx: vals[0], cz: vals[2], comprimento: vals[3], rotY: vals[6] });
          a = cx.tipo === "parede" ? { de: ex[0], ate: ex[1], espessura: vals[5], altura: vals[4], base: vals[1] - vals[4] / 2 }
                                   : { de: ex[0], ate: ex[1], b: vals[5], h: vals[4], topo: vals[1] + vals[4] / 2 };
          nome = cx.tipo;
        } else if (cx.tipo === "laje") {
          if (Math.abs(vals[6]) > 1e-6) { recusar(i, o, "laje girada não existe no editor (só alinhada aos eixos)"); return; }
          a = { de: { x: vals[0] - vals[3] / 2, z: vals[2] - vals[5] / 2 }, ate: { x: vals[0] + vals[3] / 2, z: vals[2] + vals[5] / 2 }, espessura: vals[4], topo: vals[1] + vals[4] / 2 };
          nome = "laje";
        } else if (cx.tipo === "pilar") {
          if (Math.abs(vals[3] - vals[5]) > 1e-6) { recusar(i, o, "pilar do editor é de seção quadrada"); return; }
          a = { em: { x: vals[0], z: vals[2] }, secao: vals[3], altura: vals[4], base: vals[1] - vals[4] / 2 };
          nome = "pilar";
        } else { recusar(i, o, "tipo de caixa \"" + txt(cx.tipo).slice(0, 20) + "\" desconhecido"); return; }
      } else if (op === "cobertura" && o.cobertura && typeof o.cobertura === "object") {
        var cb = o.cobertura;
        a = { de: { x: num(cb.x0), z: num(cb.z0) }, ate: { x: num(cb.x1), z: num(cb.z1) }, inclinacao: cb.inclinacao, aguas: cb.aguas, beiral: cb.beiral, base: cb.base, espessura: cb.espessura };
      }
      if (nome === "parede") {
        var p1 = ponto(a.de, "início", e), p2 = ponto(a.ate, "fim", e);
        var esp = medida(a.espessura, 0.15, LIM.parede.espessura, "espessura", e), alt = medida(a.altura, pe0, LIM.parede.altura, "altura", e), bs = medida(a.base, base0, LIM.cota, "base", e);
        if (!e.length) {
          var L = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.z - p1.z, 2));
          if (L < LIM.parede.comprimento[0] || L > LIM.parede.comprimento[1]) e.push("comprimento " + br(L) + " m fora de " + br(LIM.parede.comprimento[0]) + " a " + br(LIM.parede.comprimento[1]));
          else if (segs[chaveSeg(p1, p2) + "|" + br(bs)]) e.push("parede repetida (mesmo trecho de \"" + segs[chaveSeg(p1, p2) + "|" + br(bs)] + "\")");
          else c = B.parede(p1, p2, esp, alt, bs);
          if (c) segs[chaveSeg(p1, p2) + "|" + br(bs)] = id;
        }
      } else if (nome === "laje") {
        var q1 = ponto(a.de, "canto 1", e), q2 = ponto(a.ate, "canto 2", e);
        var el = medida(a.espessura, 0.10, LIM.laje.espessura, "espessura", e), tp = medida(a.topo, base0, LIM.cota, "topo", e);
        if (!e.length) {
          var lx = Math.abs(q2.x - q1.x), lz = Math.abs(q2.z - q1.z);
          if (lx < LIM.laje.lado[0] || lz < LIM.laje.lado[0] || lx > LIM.laje.lado[1] || lz > LIM.laje.lado[1]) e.push("lado da laje fora de " + br(LIM.laje.lado[0]) + " a " + br(LIM.laje.lado[1]) + " m");
          else c = B.laje(q1, q2, el, tp);
        }
      } else if (nome === "pilar") {
        var pp = ponto(a.em, "ponto", e);
        var sc = medida(a.secao, 0.2, LIM.pilar.secao, "seção", e), ap = medida(a.altura, pe0, LIM.pilar.altura, "altura", e), bp = medida(a.base, base0, LIM.cota, "base", e);
        if (!e.length) c = B.pilar(pp, sc, ap, bp);
      } else if (nome === "viga") {
        var v1 = ponto(a.de, "início", e), v2 = ponto(a.ate, "fim", e);
        var vb = medida(a.b, 0.14, LIM.viga.b, "base b", e), vh = medida(a.h, 0.40, LIM.viga.h, "altura h", e), vt = medida(a.topo, base0 + pe0, LIM.cota, "topo", e);
        if (!e.length) {
          var Lv = Math.sqrt(Math.pow(v2.x - v1.x, 2) + Math.pow(v2.z - v1.z, 2));
          if (Lv < LIM.viga.comprimento[0] || Lv > LIM.viga.comprimento[1]) e.push("vão " + br(Lv) + " m fora de " + br(LIM.viga.comprimento[0]) + " a " + br(LIM.viga.comprimento[1]));
          else c = B.viga(v1, v2, vb, vh, vt);
        }
      } else if (nome === "cobertura") {
        var k1 = ponto(a.de, "canto 1", e), k2 = ponto(a.ate, "canto 2", e);
        var inc = medida(a.inclinacao, 30, LIM.cobertura.inclinacao, "inclinação (%)", e), bei = medida(a.beiral, 0.5, LIM.cobertura.beiral, "beiral", e),
            bc = medida(a.base, base0 + pe0, LIM.cota, "base", e), ec = medida(a.espessura, 0.08, LIM.cobertura.espessura, "espessura", e);
        var ag = a.aguas == null ? 2 : num(a.aguas);
        if (ag !== 1 && ag !== 2) e.push("águas precisa ser 1 ou 2");
        if (!e.length) {
          var cl = Math.abs(k2.x - k1.x), cz = Math.abs(k2.z - k1.z);
          if (cl < LIM.cobertura.lado[0] || cz < LIM.cobertura.lado[0] || cl > LIM.cobertura.lado[1] || cz > LIM.cobertura.lado[1]) e.push("lado da cobertura fora de " + br(LIM.cobertura.lado[0]) + " a " + br(LIM.cobertura.lado[1]) + " m");
          else {
            var cob = B.cobertura(k1, k2, { base: bc, inclinacao: inc, aguas: ag, beiral: bei, espessura: ec });
            if (!cob) e.push("cobertura sem geometria");
            else { aceitar({ op: "cobertura", id: id, cobertura: cob }, id); return; }
          }
        }
      } else if (op === "anotar") {
        var pa = ponto({ x: o.x, z: o.z }, "ponto", e), tx = limpaTexto(o.texto, LIM.texto);
        if (!tx) e.push("anotação sem texto");
        var ya = o.y == null ? base0 + 1.2 : num(o.y);
        if (!fin(ya)) e.push("y não é número");
        if (!e.length) { aceitar({ op: "anotar", id: id, x: r4(pa.x), y: r4(ya), z: r4(pa.z), texto: tx }, id); return; }
      }
      if (e.length) { recusar(i, o, nome + ": " + e.join("; ")); return; }
      if (!c) { recusar(i, o, nome + " sem geometria"); return; }
      aceitar({ op: "criar", id: id, caixa: c }, id);
      if (c.tipo === "parede") paredes[id] = c;
    });

    /* 2ª passada: famílias (porta/janela precisam da parede, que já está em `paredes`) */
    familias.forEach(function (it) {
      var o = it.o, i = it.i, id = idDe(i, o); if (id == null) return;
      var f = cat[txt(o.famId)];
      if (!f) { recusar(i, o, "família \"" + txt(o.famId).slice(0, 40) + "\" não está na biblioteca deste aparelho"); return; }
      var tipos = Array.isArray(f.tipos) ? f.tipos : [], tipo = null;
      tipos.forEach(function (t) { if (String(t.id) === txt(o.tipoId)) tipo = t; });
      if (!tipo && tipos.length) { if (o.tipoId != null && o.tipoId !== "") avisos.push(f.nome + ": o tipo \"" + txt(o.tipoId).slice(0, 30) + "\" não existe — usei \"" + tipos[0].nome + "\""); tipo = tipos[0]; }
      var inst = {};
      if (o.inst && typeof o.inst === "object" && !Array.isArray(o.inst)) Object.keys(o.inst).slice(0, 12).forEach(function (k) {
        var v = o.inst[k];
        if (/^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_]{0,39}$/.test(k) && (typeof v === "number" ? isFinite(v) : (typeof v === "boolean" || typeof v === "string"))) inst[k] = typeof v === "string" ? limpaTexto(v, 60) : v;
      });
      var out = { op: "familia", id: id, famId: String(f.id), tipoId: tipo ? String(tipo.id) : "", inst: inst };
      if (f.hospedagem === "parede") {
        var h = o.host;
        if (!h || typeof h !== "object") { recusar(i, o, f.nome + " é de parede: falta host {id, aoLongo}"); return; }
        var par = paredes[txt(h.id)];
        if (!par) { recusar(i, o, f.nome + ": a parede \"" + txt(h.id).slice(0, 40) + "\" não foi criada nesta lista"); return; }
        var t = h.t != null && h.t !== "" ? num(h.t) : (h.aoLongo != null ? num(h.aoLongo) - par.comprimento / 2 : NaN);
        if (!fin(t)) { recusar(i, o, f.nome + ": posição na parede (aoLongo) não é número"); return; }
        var larg = tipo && fin(num(tipo.largura)) ? num(tipo.largura) : 0, meia = par.comprimento / 2;
        if (Math.abs(t) + larg / 2 > meia + 1e-3) { recusar(i, o, f.nome + ": o vão (" + br(larg) + " m) não cabe na parede \"" + h.id + "\" (" + br(par.comprimento) + " m) nessa posição"); return; }
        var lista2 = vaosPorParede[h.id] || (vaosPorParede[h.id] = []), x0 = t - larg / 2, x1 = t + larg / 2, choca = null;
        lista2.forEach(function (v) { if (x0 < v.x1 - 1e-3 && x1 > v.x0 + 1e-3) choca = v.id; });
        if (choca) { recusar(i, o, f.nome + ": o vão encavala no de \"" + choca + "\""); return; }
        lista2.push({ id: id, x0: x0, x1: x1 });
        out.host = { id: String(h.id), t: r4(t) };
      } else {
        if (o.host) { recusar(i, o, f.nome + " é peça livre — não vai hospedada em parede"); return; }
        var e2 = [], pf = ponto({ x: o.x, z: o.z }, "ponto", e2);
        var gy = o.y == null ? base0 : num(o.y), rot = o.rotY != null ? num(o.rotY) : (o.giro != null ? num(o.giro) * Math.PI / 180 : 0);
        if (!fin(gy)) e2.push("y não é número"); if (!fin(rot)) e2.push("giro não é número");
        if (e2.length) { recusar(i, o, f.nome + ": " + e2.join("; ")); return; }
        out.x = r4(pf.x); out.y = r4(gy); out.z = r4(pf.z); out.rotY = r4(rot);
      }
      aceitar(out, id);
    });

    if (codigoIgnorado) avisos.push("código de orçamento que veio junto foi ignorado — quem escolhe a composição é você (Propriedades › Orçamento)");
    /* defesa final: o que sai daqui tem de passar na peneira do editor, uma a uma */
    var peneira = B.sanear(saida);
    if (peneira.length !== saida.length) {
      var ok2 = {}; peneira.forEach(function (o) { ok2[o.id] = 1; });
      saida = saida.filter(function (o) { if (ok2[o.id]) return true; recusar(-1, o, "não passou na conferência do editor"); return false; });
    }
    return { ok: saida.length > 0, ops: saida, recusadas: recusadas, avisos: avisos, resumo: resumo(saida, ctx) };
  }

  /* quanto de cada coisa — números do BimEdit (quantitativo exato) */
  function resumo(ops, ctx) {
    var B = BE(); if (!B) return null;
    ctx = ctx || {};
    var st = B.aplicar(ops), q = B.qto(st, ctx.avaliarFam || null), cat = {};
    (Array.isArray(ctx.catalogo) ? ctx.catalogo : []).forEach(function (f) { if (f && f.id) cat[f.id] = f; });
    var porCat = {};
    (st.familias || []).forEach(function (f) { var c = (cat[f.famId] && cat[f.famId].categoria) || "familia"; porCat[c] = (porCat[c] || 0) + 1; });
    return {
      paredes: { n: q.parede.n, comprimento: q.parede.comprimento, area: q.parede.area }, lajes: { n: q.laje.n, area: q.laje.area, volume: q.laje.volume },
      pilares: q.pilar.n, vigas: q.viga.n, coberturas: { n: q.cobertura.n, area: q.cobertura.area }, familias: porCat, anotacoes: (st.anotacoes || []).length,
      total: ops.length
    };
  }
  function textoResumo(r) {
    if (!r) return "";
    var p = [];
    if (r.paredes.n) p.push(r.paredes.n + " parede" + (r.paredes.n > 1 ? "s" : "") + " (" + br(r.paredes.comprimento) + " m, " + br(r.paredes.area) + " m²)");
    if (r.lajes.n) p.push(r.lajes.n + " laje" + (r.lajes.n > 1 ? "s" : "") + " (" + br(r.lajes.area) + " m²)");
    if (r.coberturas.n) p.push(r.coberturas.n + " cobertura" + (r.coberturas.n > 1 ? "s" : "") + " (" + br(r.coberturas.area) + " m² inclinados)");
    if (r.pilares) p.push(r.pilares + " pilar" + (r.pilares > 1 ? "es" : ""));
    if (r.vigas) p.push(r.vigas + " viga" + (r.vigas > 1 ? "s" : ""));
    var NOMES = { porta: ["porta", "portas"], janela: ["janela", "janelas"], loucas: ["louça", "louças"], mobiliario: ["móvel", "móveis"], equipamento: ["equipamento", "equipamentos"] };
    Object.keys(r.familias).forEach(function (k) { var n = r.familias[k], nm = NOMES[k] || ["peça", "peças"]; p.push(n + " " + nm[n > 1 ? 1 : 0]); });
    if (r.anotacoes) p.push(r.anotacoes + " ambiente" + (r.anotacoes > 1 ? "s" : "") + " anotado" + (r.anotacoes > 1 ? "s" : ""));
    return p.join(", ");
  }

  /* a biblioteca que a IA pode usar: compacta, com a largura do vão de cada tipo de porta/janela.
     familias = a biblioteca do aparelho; Familia = js/familia.js */
  function catalogo(familias, Familia, max) {
    var out = [];
    (Array.isArray(familias) ? familias : []).forEach(function (f) {
      if (!f || !f.id || out.length >= (max || 60)) return;
      var tipos = (Array.isArray(f.tipos) && f.tipos.length ? f.tipos : [{ id: "", nome: "Padrão" }]).slice(0, 8).map(function (t) {
        var o = { id: String(t.id), nome: limpaTexto(t.nome, 60) };
        if (f.hospedagem === "parede" && Familia) { try { var av = Familia.avaliar(f, t.id, {}); if (av && av.abertura) { o.largura = r4(av.abertura.largura); o.altura = r4(av.abertura.altura); o.peitoril = r4(av.abertura.peitoril); } } catch (e) {} }
        return o;
      });
      out.push({ id: String(f.id), nome: limpaTexto(f.nome, 80), categoria: txt(f.categoria) || "generico", hospedagem: f.hospedagem === "parede" ? "parede" : "livre", tipos: tipos });
    });
    return out;
  }

  /* ids da IA viram "ia<n>-<id>" — nunca colidem com os do editor (e1, f2…) nem com outro lote */
  function proximoLote(opsExistentes) {
    var B = BE(), mx = 0;
    ((B ? B.achatar(opsExistentes) : opsExistentes) || []).concat(opsExistentes || []).forEach(function (o) {
      var m = /^ia(\d+)(-|$)/.exec(txt(o && o.id)); if (m) mx = Math.max(mx, parseInt(m[1], 10));
    });
    return "ia" + (mx + 1);
  }
  function prefixar(ops, prefixo) {
    var mapa = {};
    (ops || []).forEach(function (o) { if (o && o.id != null) mapa[o.id] = prefixo + "-" + o.id; });
    return (ops || []).map(function (o) {
      var c = JSON.parse(JSON.stringify(o));
      if (c.id != null) c.id = mapa[c.id];
      if (c.host && mapa[c.host.id]) c.host.id = mapa[c.host.id];
      return c;
    });
  }
  function lote(ops, idLote, pedido) {
    return { op: "lote", id: idLote, origem: "ia", pedido: limpaTexto(pedido, 300), ops: prefixar(ops, idLote) };
  }

  /* planta da prévia (SVG, vista de cima): paredes, lajes, cobertura, vãos e nomes dos ambientes */
  function plantaSvg(ops, opts) {
    opts = opts || {};
    var B = BE(); if (!B) return "";
    var st = B.aplicar(ops), x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, polys = [];
    function caixaPoly(c) {
      var co = Math.cos(c.rotY), si = Math.sin(c.rotY), h = c.comprimento / 2, e = c.espessura / 2;
      return [[-h, -e], [h, -e], [h, e], [-h, e]].map(function (q) { return [c.cx + q[0] * co + q[1] * si, c.cz - q[0] * si + q[1] * co]; });
    }
    function inclui(pts) { pts.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }); }
    (st.caixas || []).forEach(function (c) { var p = caixaPoly(c); inclui(p); polys.push({ t: c.tipo, p: p }); });
    (st.coberturas || []).forEach(function (c) { var p = [[c.x0 - c.beiral, c.z0 - c.beiral], [c.x1 + c.beiral, c.z0 - c.beiral], [c.x1 + c.beiral, c.z1 + c.beiral], [c.x0 - c.beiral, c.z1 + c.beiral]]; inclui(p); polys.push({ t: "cobertura", p: p }); });
    if (x0 === Infinity) return "";
    var m = Math.max(x1 - x0, z1 - z0) * 0.06 + 0.3, W = x1 - x0 + 2 * m, H = z1 - z0 + 2 * m, k = 100;
    function pt(p) { return ((p[0] - x0 + m) * k).toFixed(1) + "," + ((p[1] - z0 + m) * k).toFixed(1); }
    var ORDEM = { cobertura: 0, laje: 1, parede: 2, viga: 3, pilar: 4 };
    var ESTILO = { cobertura: 'fill="none" stroke="var(--texto-fraco)" stroke-dasharray="12 8" stroke-width="3"', laje: 'fill="var(--surface-2)" stroke="var(--linha)" stroke-width="2"',
                   parede: 'fill="var(--texto)" stroke="var(--texto)" stroke-width="1"', viga: 'fill="none" stroke="var(--aco)" stroke-width="3"', pilar: 'fill="var(--aco)"' };
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (W * k).toFixed(0) + " " + (H * k).toFixed(0) + '" class="iam-planta" role="img" aria-label="Planta da prévia">';
    polys.sort(function (a, b) { return (ORDEM[a.t] || 0) - (ORDEM[b.t] || 0); }).forEach(function (q) { s += '<polygon points="' + q.p.map(pt).join(" ") + '" ' + (ESTILO[q.t] || ESTILO.parede) + "/>"; });
    /* vãos das hospedadas: um traço claro sobre a parede */
    var porId = {}; (st.caixas || []).forEach(function (c) { porId[c.id] = c; });
    (st.familias || []).forEach(function (f) {
      if (f.host && porId[f.host.id]) {
        var c = porId[f.host.id], larg = (opts.larguraVao && opts.larguraVao(f)) || 0.8, co = Math.cos(c.rotY), si = Math.sin(c.rotY);
        var a = [c.cx + (f.host.t - larg / 2) * co, c.cz - (f.host.t - larg / 2) * si], b = [c.cx + (f.host.t + larg / 2) * co, c.cz - (f.host.t + larg / 2) * si];
        s += '<line x1="' + pt(a).split(",")[0] + '" y1="' + pt(a).split(",")[1] + '" x2="' + pt(b).split(",")[0] + '" y2="' + pt(b).split(",")[1] + '" stroke="var(--surface)" stroke-width="' + (c.espessura * k * 0.8).toFixed(1) + '"/>';
      } else if (!f.host) {
        s += '<rect x="' + ((f.x - x0 + m) * k - 12).toFixed(1) + '" y="' + ((f.z - z0 + m) * k - 12).toFixed(1) + '" width="24" height="24" fill="none" stroke="var(--verde)" stroke-width="3"/>';
      }
    });
    (st.anotacoes || []).forEach(function (a) { s += '<text x="' + ((a.x - x0 + m) * k).toFixed(1) + '" y="' + ((a.z - z0 + m) * k).toFixed(1) + '" text-anchor="middle" font-size="' + Math.max(28, W * k / 40).toFixed(0) + '" fill="var(--texto)">' + esc(a.texto) + "</text>"; });
    return s + "</svg>";
  }

  var BimModelar = {
    LIM: LIM, normalizar: normalizar, resumo: resumo, textoResumo: textoResumo, catalogo: catalogo,
    proximoLote: proximoLote, prefixar: prefixar, lote: lote, plantaSvg: plantaSvg
  };
  global.BimModelar = BimModelar;
  if (typeof module !== "undefined" && module.exports) module.exports = BimModelar;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
