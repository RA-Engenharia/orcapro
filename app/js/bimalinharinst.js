/* =====================================================================
 * bimalinharinst.js — ALINHAR (AL) para as PEÇAS DE INSTALAÇÃO (18/10/2026). Motor PURO, ES5, Node-testável.
 *
 * Pedido do Rogério: "Tem a opção de alinhar a peça? No software de referência tem o AL: clico numa peça, depois na outra, e
 * ela fica alinhada. Quero alinhar tudo."
 *
 * O Alinhar de sempre (js/bimprecisao.js opAlinhar + js/bimprecisaoui.js) já alinha paredes, vigas, famílias, grade e eixo
 * pelas linhas de snap. Este módulo acrescenta, só para o Alinhar/Aparar (segmentoPerto):
 *   · as LINHAS das instalações: eixo do tubo (na planta), os dois eixos (x e z) de cada peça (caixa, ralo), os dois eixos de
 *     cada CONECTOR de aparelho, e os dois EIXOS de cada família (pelo ponto de inserção, no giro dela);
 *   · o MOVIMENTO com a rede acompanhando, pela lógica do arraste que já existe (js/biminstarr.js BimInstArr.arrastar):
 *       tubo → anda paralelo, os vizinhos esticam/giram; peça (caixa, ralo) → anda e os tubos dela acompanham;
 *       família (louça, equipamento) → a família anda e os tubos presos nos conectores dela andam junto. Se a família tem
 *       KIT do projeto inteligente, só ela anda: o kit e as ligações se refazem sozinhos (js/hidkitui.js) — mexer no tubo
 *       do kit contaria como "edição à mão" e o kit perguntaria;
 *   · tudo num LOTE (um Ctrl+Z).
 * O contexto da tela (avaliar a família, a lista de ops) vem do BIM; no Node, de BimAlinharInst.contexto = {...}.
 * Teste: node tools/test-bim-alinhar-inst.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function ARR() { return dep("BimInstArr", "./biminstarr.js"); }
  function HK() { return dep("HidKit", "./hidkit.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function P(x, z) { return { x: x, z: z }; }
  function d2(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
  /* ⚠ GEOMETRIA DE DESENHO (não é norma) */
  var GEO = {
    meiaCruz: 0.25,    // hid:ok meio comprimento das linhas de eixo de peça/conector/tubo vertical (o clique precisa achar a linha)
    vertical: 0.02,    // hid:ok tubo com menos de 2 cm na planta = vertical (a linha dele é a cruz no ponto)
    folgaTrava: 0.0001, // hid:ok 0,1 mm: abaixo disso a trava está cumprida
    tempoCadeado: 10000 // hid:ok o botão do cadeado fica 10 s na tela depois do Alinhar
  };

  var A = {
    GEO: GEO,
    contexto: null,
    _ctx: function () {
      if (A.contexto) return A.contexto;
      var b = global.BIM;
      return b ? { avaliar: function (f, t, i) { return b.familiaAvaliar(f, t, i); }, ops: b.editarOps ? b.editarOps() : [], kitLigado: !!(global.HidKitUI && global.HidKitUI.ligado) } : {};
    },
    ehInst: function (estado, id) {
      var I = estado && estado.instalacoes; if (!I || id == null) return null;
      if (arr(I.trechos).some(function (t) { return t.id === id; })) return "trecho";
      if (arr(I.pecas).some(function (k) { return k.id === id; })) return "peca";
      if (arr(I.acessorios).some(function (k) { return k.id === id; })) return "acessorio";
      return null;
    },
    /* as linhas que o Alinhar enxerga além da geometria de sempre: [{ a, b, id, k }] */
    linhas: function (estado, avaliar) {
      var segs = [], m = GEO.meiaCruz, I = estado && estado.instalacoes;
      function cruz(c, id, k, u) { u = u || P(1, 0); var n = P(-u.z, u.x); segs.push({ a: P(c.x - u.x * m, c.z - u.z * m), b: P(c.x + u.x * m, c.z + u.z * m), id: id, k: k }, { a: P(c.x - n.x * m, c.z - n.z * m), b: P(c.x + n.x * m, c.z + n.z * m), id: id, k: k }); }
      if (I) {
        arr(I.trechos).forEach(function (t) {
          if (d2(t.p1, t.p2) > GEO.vertical) segs.push({ a: P(t.p1.x, t.p1.z), b: P(t.p2.x, t.p2.z), id: t.id, k: "eixo-tubo" });
          else cruz(t.p1, t.id, "eixo-tubo");
        });
        arr(I.pecas).forEach(function (k) {
          cruz(k, k.id, "eixo-peca");
          /* as FACES da peça (o quadrado do corpo): "a caixa encostada na parede" é face com face */
          var Pk = (BI() && BI().PECAS[k.peca]) || {}, h = num(Pk.r, num(Pk.w, 0) / 2);
          if (h > 0) [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]].forEach(function (q) { segs.push({ a: P(k.x + q[0] * h, k.z + q[1] * h), b: P(k.x + q[2] * h, k.z + q[3] * h), id: k.id, k: "face-peca" }); });
        });
      }
      arr(estado && estado.familias).forEach(function (f) {
        if (!f || !f.famId || !isFinite(num(f.x, NaN))) return;
        var r = num(f.rotY, 0), u = P(Math.cos(r), -Math.sin(r));
        cruz(P(num(f.x, 0), num(f.z, 0)), f.id, "eixo-familia", u);
      });
      var B = BI();
      if (B && B.conectoresDoEstado) { try { B.conectoresDoEstado(estado, avaliar).forEach(function (k) { if (k.famInst != null) cruz(k, k.famInst, "conector"); }); } catch (e) {} }
      return segs;
    },
    /* o movimento v = {x, z} da peça `id`, com a rede acompanhando → { op } | { erro } | null (não é de instalação) */
    alinhar: function (estado, id, v, el) {
      var tipo = A.ehInst(estado, id), C = A._ctx(), Ar = ARR(), d = { x: r4(v.x), y: 0, z: r4(v.z) };
      if (tipo === "acessorio") return { erro: "Alinhar: o registro anda com o tubo dele — alinhe o tubo." };
      /* a peça de um ambiente TRAÇADO (projeto inteligente): o traçado se refaz com ela no lugar novo (js/hidkitui.js) */
      var HKU = global.HidKitUI;
      if (tipo === "peca" && HKU && HKU.religarDepois) {
        var opsP = HKU.religarDepois(id, function (est) { var k = arr(est.instalacoes && est.instalacoes.pecas).filter(function (x) { return x.id === id; })[0]; return k ? [{ op: "mover", id: id, cx: r4(k.x + d.x), cz: r4(k.z + d.z) }] : []; });
        if (opsP && opsP.length) return { op: A._lote(opsP, "Alinhar " + id), refeito: true };
      }
      if (tipo === "trecho" || tipo === "peca") {
        if (!Ar) return { erro: "Alinhar: o motor do arraste (js/biminstarr.js) não carregou." };
        var R = A._arrastar(estado, C.avaliar, [id], d);
        if (!R.ok) return { erro: "Alinhar: " + (R.erro || (arr(R.conflitos)[0] || {}).texto || "a rede não acompanha esse movimento") };
        return { op: A._lote(R.ops, "Alinhar " + id), avisos: R.avisos };
      }
      if (!el || !el.famId) return null;
      /* FAMÍLIA: os tubos presos nos conectores dela (na pose de antes) */
      var B = BI(), cs = [], TOLC = B ? B.TOL + B.TOL_CONECTOR : 0;
      try { cs = B ? B.conectoresDe(C.avaliar ? C.avaliar(el.famId, el.tipoId, el.inst) : null, { id: el.id, x: el.x, y: el.y, z: el.z, rotY: el.rotY }) : []; } catch (e) { cs = []; }
      var presos = arr(estado.instalacoes && estado.instalacoes.trechos).filter(function (t) { return cs.some(function (k) { return [t.p1, t.p2].some(function (p) { return Math.abs(p.x - k.x) + Math.abs(p.y - k.y) + Math.abs(p.z - k.z) <= TOLC * 2; }); }); }).map(function (t) { return t.id; });
      var K = HK(), temKit = false;
      if (K && C.ops) { var ks = K.kitsDoModelo(C.ops); temKit = !!(ks[String(el.id)] && ks[String(el.id)].vivos.length); }
      return { familia: true, presos: presos, d: d, kit: temKit };
    },
    /* a família: o "mover" de sempre + os tubos presos arrastados (na pose nova da família a ponta deles fica livre e anda) */
    comFamilia: function (estado, opMover, info) {
      var BE = dep("BimEdit", "./bimedit.js"), Ar = ARR(), C = A._ctx(), HKU = global.HidKitUI;
      /* o aparelho de um ambiente TRAÇADO: o kit e o traçado se refazem com ele no lugar novo (js/hidkitui.js) */
      var fid = opMover.ids && opMover.ids.length === 1 ? opMover.ids[0] : null;
      if (fid != null && HKU && HKU.religarDepois) {
        var opsF = HKU.religarDepois(fid, function () { return [opMover]; });
        if (opsF && opsF.length) return { op: A._lote(opsF, "Alinhar " + fid), refeito: true };
      }
      if (!info || !info.presos.length || !BE || !Ar) return { op: opMover };
      var est1 = BE.aplicar(arr(C.ops).concat([opMover]));
      var R = A._arrastar(est1, C.avaliar, info.presos, info.d);
      if (!R.ok) return { op: opMover, avisos: ["os tubos ligados não acompanharam: " + (R.erro || "conflito na rede") + " — confira as pontas"] };
      return { op: A._lote([opMover].concat(R.ops), "Alinhar " + (opMover.ids || []).join(",")), avisos: R.avisos };
    },
    /* o arraste como o usuário resolveria o conflito: mantendo a inclinação; se a saída fixa não deixa, aceitando a
       inclinação menor (até a mínima do DN); por fim descendo a saída (a espera ainda não está ligada a nada) */
    _arrastar: function (estado, avaliar, alvos, d) {
      var Ar = ARR(), R = null, modos = ["manter", "aceitar", "mudarSaida"];
      for (var i = 0; i < modos.length; i++) {
        R = Ar.arrastar(estado, avaliar, alvos, d, { confirmar: true, inclinacao: modos[i] });
        if (R.ok) { if (i) R.avisos = arr(R.avisos).concat([modos[i] === "aceitar" ? "a inclinação a jusante ficou menor (dentro da mínima do DN) para caber" : "a cota da saída desceu para caber a inclinação"]); return R; }
      }
      return R;
    },
    _lote: function (ops, pedido) {
      if (ops.length === 1) return ops[0];
      return { op: "lote", id: "al" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), origem: "modificar", pedido: pedido, ops: ops };
    }
  };
  /* ================================================================= O CADEADO (manter alinhado)
   * Depois de alinhar, o cadeado grava {op:"travaAlinhar", id, ref:{id, a, b}, alvo:{id, a, b}} — cada linha no referencial
   * LOCAL da peça dona dela (centro + giro), então a trava vale mesmo depois que as duas andam. Quando a referência anda (op
   * da pessoa), a peça travada é realinhada pelo MESMO caminho do Alinhar (a rede acompanha), num lote marcado "trava".
   * ⚠ Ctrl+Z não "briga": quando a lista de ops DIMINUI, a trava aceita a pose de agora (como o kit do projeto inteligente).
   * {op:"travaAlinhar", id, solto:true} tira a trava. */
  function pose(estado, id) {
    var l, i;
    l = arr(estado && estado.caixas); for (i = 0; i < l.length; i++) if (l[i] && l[i].id === id) return { c: P(num(l[i].cx, 0), num(l[i].cz, 0)), r: num(l[i].rotY, 0) };
    l = arr(estado && estado.familias); for (i = 0; i < l.length; i++) if (l[i] && l[i].id === id) return { c: P(num(l[i].x, 0), num(l[i].z, 0)), r: num(l[i].rotY, 0) };
    var I = estado && estado.instalacoes;
    l = arr(I && I.pecas); for (i = 0; i < l.length; i++) if (l[i] && l[i].id === id) return { c: P(l[i].x, l[i].z), r: 0 };
    l = arr(I && I.trechos); for (i = 0; i < l.length; i++) if (l[i] && l[i].id === id) { var t = l[i]; return { c: P(t.p1.x, t.p1.z), r: d2(t.p1, t.p2) > GEO.vertical ? -Math.atan2(t.p2.z - t.p1.z, t.p2.x - t.p1.x) : 0 }; }
    l = arr(estado && estado.eixos); for (i = 0; i < l.length; i++) if (l[i] && l[i].id === id) { var e = l[i]; return { c: P(num(e.x0, 0), num(e.z0, 0)), r: -Math.atan2(num(e.z1, 0) - num(e.z0, 0), num(e.x1, 0) - num(e.x0, 0)) }; }
    return null;
  }
  function paraLocal(q, ps) { var dx = q.x - ps.c.x, dz = q.z - ps.c.z, c = Math.cos(ps.r), s = Math.sin(ps.r); return P(r4(dx * c - dz * s), r4(dx * s + dz * c)); }
  function paraMundo(q, ps) { var c = Math.cos(ps.r), s = Math.sin(ps.r); return P(ps.c.x + q.x * c + q.z * s, ps.c.z - q.x * s + q.z * c); }
  function linhaLocal(estado, L) { var ps = pose(estado, L.id); return ps ? { id: L.id, a: paraLocal(L.a, ps), b: paraLocal(L.b, ps) } : null; }
  function linhaMundo(estado, T) { var ps = pose(estado, T.id); return ps ? { id: T.id, a: paraMundo(T.a, ps), b: paraMundo(T.b, ps) } : null; }
  A.travaOp = function (estadoAntes, ref, alvo, idNovo) {
    if (!ref || !alvo || ref.id == null || alvo.id == null) return null;
    var lr = linhaLocal(estadoAntes, ref), la = linhaLocal(estadoAntes, alvo); if (!lr || !la) return null;
    return { op: "travaAlinhar", id: idNovo || ("tv" + Date.now().toString(36)), ref: lr, alvo: la };
  };
  /* as travas violadas no estado → [{ trava, ref, alvo, d }] (linhas no mundo) */
  A.violadas = function (estado) {
    var out = [];
    arr(estado && estado.travas).forEach(function (t) {
      var R = linhaMundo(estado, t.ref), L = linhaMundo(estado, t.alvo); if (!R || !L) return;
      var ux = R.b.x - R.a.x, uz = R.b.z - R.a.z, Lr = Math.sqrt(ux * ux + uz * uz); if (!(Lr > 1e-9)) return;
      var dd = ((L.a.x - R.a.x) * uz - (L.a.z - R.a.z) * ux) / Lr;
      if (Math.abs(dd) > GEO.folgaTrava) out.push({ trava: t, ref: R, alvo: L, d: dd });
    });
    return out;
  };
  /* o gancho da tela (js/hidkitui.js aoReconstruir): realinha o que a referência deixou para trás */
  A._len = null; A._ocupado = false;
  A.conferir = function (estado) {
    var b = global.BIM, Pr = global.BimPrecisao; if (!b || !b.editarOps || !b.editarLote || !Pr || A._ocupado) return 0;
    var n = b.editarOps().length, antes = A._len; A._len = n;
    if (antes == null || n !== antes + 1) return 0;   /* abriu, desfez ou importou: a pose de agora vale */
    var ult = b.editarOps()[n - 1]; if (ult && ult.origem === "trava") return 0;
    var vs = A.violadas(estado); if (!vs.length) return 0;
    var ops = [];
    vs.forEach(function (v) { var r = Pr.opAlinhar(estado, v.ref, v.alvo); if (r && r.op) { if (r.op.op === "lote") r.op.ops.forEach(function (o) { ops.push(o); }); else ops.push(r.op); } });
    if (!ops.length) return 0;
    A._ocupado = true;
    try { b.editarLote({ op: "lote", id: "trava" + Date.now().toString(36), origem: "trava", pedido: "Manter alinhado (cadeado)", ops: ops }); } finally { A._ocupado = false; }
    A._len = b.editarOps().length;
    try { if (global.BimShell && global.BimShell.status) global.BimShell.status("Cadeado: " + vs.map(function (v) { return v.trava.alvo.id; }).join(", ") + " acompanhou a referência (Ctrl+Z desfaz)."); } catch (e) {}
    return vs.length;
  };
  /* depois do Alinhar: o botão do cadeado (some em 10 s) */
  A.oferecerTrava = function (estadoAntes, ref, alvo) {
    var d = global.document, b = global.BIM; if (!d || !b) { A._diag = "sem tela"; return false; }
    var op = A.travaOp(estadoAntes, ref, alvo); if (!op) { A._diag = "sem linha local: " + (ref && ref.id) + " / " + (alvo && alvo.id); return false; }
    var el = d.getElementById("al-cadeado");
    if (!el) { el = d.createElement("button"); el.id = "al-cadeado"; el.type = "button"; el.className = "btn sm"; el.setAttribute("style", "position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:100000;min-height:32px;box-shadow:0 6px 18px rgba(0,0,0,.2)"); d.body.appendChild(el); }
    el.textContent = "Cadeado: manter " + alvo.id + " alinhado a " + ref.id;
    el.title = "Trava o alinhamento: quando a referência andar, a peça acompanha (Ctrl+Z desfaz)";
    el.style.display = "block";
    el.onclick = function () {
      el.style.display = "none";
      var ok = false; try { ok = b.editarLote({ op: "lote", id: "tvl" + Date.now().toString(36), origem: "trava", pedido: "Cadeado", ops: [op] }); } catch (e) { ok = false; }
      A._len = b.editarOps ? b.editarOps().length : null;
      try { if (global.BimShell && global.BimShell.status) global.BimShell.status(ok ? "Cadeado: " + alvo.id + " fica alinhado a " + ref.id + "." : "O editor recusou o cadeado."); } catch (e2) {}
    };
    clearTimeout(A._tCad); A._tCad = setTimeout(function () { if (el) el.style.display = "none"; }, GEO.tempoCadeado);
    return true;
  };
  /* a op no BimEdit (extensão do replay): o estado ganha `travas` */
  (function () {
    var BE = dep("BimEdit", "./bimedit.js"); if (!BE || !BE.estender) return;
    BE.estender({ nome: "travaAlinhar",
      valida: function (o) { if (!o || o.op !== "travaAlinhar") return undefined; return o.id != null && (o.solto === true || !!(o.ref && o.alvo && o.ref.id != null && o.alvo.id != null && o.ref.a && o.ref.b && o.alvo.a && o.alvo.b)); },
      aplicar: function (o, ctx) { if (!o || o.op !== "travaAlinhar") return false; var m = ctx.ext.travas || (ctx.ext.travas = {}); if (o.solto) delete m[o.id]; else m[o.id] = { id: o.id, ref: o.ref, alvo: o.alvo }; return true; },
      fim: function (ctx, saida) { var m = ctx.ext.travas || {}; saida.travas = Object.keys(m).map(function (k) { return m[k]; }); } });
  })();
  /* AL também FORA do modo de edição (o 3D só olhando, a planta): o atalho de duas letras da fita executa o comando "alinhar"
     da aba Modificar, que arma a ferramenta. Dentro do modo de edição quem atende é o js/bimprecisaoui.js (BimPrecisao.ATALHOS). */
  function atalhoAL() { try { var Fi = global.BimFita; if (Fi && Fi.ATALHOS_FX && !Fi.ATALHOS_FX.AL) Fi.ATALHOS_FX.AL = "alinhar"; } catch (eFi) {} }
  /* ⚠ RESERVA do teclado: o atalho de duas letras da fita (js/bimfita.js _teclado) sai quando a raiz do BIM está em
     position:fixed (offsetParent null) — no 3D sem o modo de edição o AL não armava (e2e-hid-tracar [f]). Aqui, por último
     (fase de bolha) e só se ninguém tratou a tecla (defaultPrevented), AL arma o Alinhar e TA abre o Traçar automaticamente. */
  var RESERVA = { AL: "alinhar", TA: "tracar-auto" };
  function teclaReserva() {
    var d = global.document; if (!d || A._ouvindo) return; A._ouvindo = true;
    var buf = "", t0 = 0;
    d.addEventListener("keydown", function (e) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || !/^[a-zA-Z]$/.test(e.key || "")) return;
      var t = e.target || {}; if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || "") || t.isContentEditable || d.getElementById("modal-bg")) return;
      var Sh = global.BimShell; if (!Sh || !Sh._raiz || !d.body.contains(Sh._raiz) || !Sh._raiz.getClientRects().length) return;
      var agora = Date.now(); buf = (agora - t0 < 1200 ? buf : "") + e.key.toUpperCase(); t0 = agora;   // hid:ok janela das duas letras (a mesma da fita)
      var id = RESERVA[buf.slice(-2)]; if (!id) return;
      var R = global.BimRibbon; if (!R || !R.comando || !R.comando(id)) return;
      buf = ""; e.preventDefault();
      try { Sh.executar(id); } catch (eX) {}
    });
  }
  if (global.document) teclaReserva();
  A.atalhoAL = atalhoAL;
  atalhoAL(); if (global.document && global.setTimeout) global.setTimeout(atalhoAL, 0);   /* o js/bimfita.js carrega depois deste (e o js/hidkitui.js chama de novo ao registrar a fita) */
  global.BimAlinharInst = A;
  if (typeof module !== "undefined" && module.exports) module.exports = A;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
