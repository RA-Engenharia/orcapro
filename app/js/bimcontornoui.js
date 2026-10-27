/* =====================================================================
 * bimcontornoui.js — a TELA do CONTORNO LIVRE (laje/piso, forro e telhado; prévia `?previa=modelador`).
 *
 * O motor é o js/bimcontorno.js (puro). Aqui só:
 *   · os MODOS novos de criar, no "Desenho" das Propriedades da ferramenta (laje, forro, telhado):
 *       - "Escolher paredes": clique nas paredes (Tab pega a cadeia que encosta) e Enter — o contorno sai
 *         das faces (Alinhar em: face externa / eixo / face interna);
 *       - "Contorno da edificação (1 clique)": o contorno externo de todas as paredes que delimitam ambiente
 *         no nível (sem mureta e divisa). Piso e forro por face interna saem UM POR AMBIENTE;
 *     (o "Retângulo" e o "Contorno — clique os cantos" que já existiam continuam);
 *   · o telhado de UMA água por contorno: depois do contorno, clique a aresta do beiral (Enter = a mais
 *     comprida); duas e várias águas usam o "Águas" que já existe;
 *   · o botão "Editar contorno" (Arquitetura › Modelador): com a laje, o forro ou o telhado selecionado,
 *     alças nos vértices (arrastar), nas arestas (arrastar = paralela; clicar = inserir vértice) e Delete
 *     no vértice. Concluir (Enter) grava UMA op — um Ctrl+Z desfaz tudo; Esc cancela.
 *
 * Quem coleta o clique é o js/bim.js (gancho "CONTORNO LIVRE": S._ctr), quem registra é o js/bimarqui.js.
 * Sem a prévia NADA daqui roda.
 * ===================================================================== */
(function (global) {
  "use strict";
  function C() { return global.BimContorno || null; }
  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function n2(v) { var x = Number(v); return isFinite(x) ? x.toFixed(2).replace(".", ",") : "—"; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  var SUBS = { laje: 1, forro: 1, telhado: 1 };
  var cfg = { alinhar: { laje: "externa", forro: "interna", telhado: "externa" } };
  var ROT_AL = { externa: "Face externa", eixo: "Eixo da parede", interna: "Face interna" };

  /* o texto de cada modo (a dica do balão e das Propriedades) */
  function dicaModo(sub, modo) {
    var al = ROT_AL[cfg.alinhar[sub]] || "";
    if (modo === "paredes") return (sub === "laje" ? "Laje" : (sub === "forro" ? "Forro" : "Telhado")) + " por paredes: clique nas paredes (Tab pega a cadeia que encosta nela) e confirme com Enter. O contorno sai da " + al.toLowerCase() + ". Esc limpa a escolha.";
    if (modo === "edificacao") return (sub === "laje" ? "Laje" : (sub === "forro" ? "Forro" : "Telhado")) + " pelo contorno da edificação: UM clique em qualquer lugar do nível — sai o contorno das paredes que delimitam ambiente (" + al.toLowerCase() + "; mureta e divisa ficam de fora)." + (sub === "forro" || (sub === "laje" && cfg.alinhar.laje === "interna") ? " Pela face interna sai uma peça por ambiente." : "");
    return "";
  }

  var modoDeFn = null;
  var BimContornoUI = {
    ativo: previa,
    /* a planta (js/bimplantamodelar.js) NÃO desenha forma quando a ferramenta está num modo daqui: o clique é das paredes/da edificação */
    modoNovo: function (sub) { try { var m = modoDeFn ? modoDeFn(sub) : ""; return m === "paredes" || m === "edificacao"; } catch (e) { return false; } },
    cfg: function () { return clone(cfg); },
    dicaModo: dicaModo,
    ALINHAR_OPC: [{ id: "externa", rotulo: "Face externa" }, { id: "eixo", rotulo: "Eixo da parede" }, { id: "interna", rotulo: "Face interna" }],
    OPC_MODO: [{ id: "paredes", rotulo: "Escolher paredes (contorno pelas faces)" }, { id: "edificacao", rotulo: "Contorno da edificação (1 clique)" }],

    /* as linhas extras das Propriedades da ferramenta: "Alinhar em" (só quando o modo usa as paredes) */
    paramsAlinhar: function (sub, modo) {
      if (!SUBS[sub] || (modo !== "paredes" && modo !== "edificacao")) return [];
      return [{ id: "b2f:ct:alinhar", rotulo: "Alinhar em", tipo: "lista", valor: cfg.alinhar[sub], opcoes: BimContornoUI.ALINHAR_OPC }];
    },
    /* o valor veio das Propriedades da ferramenta. → true se era daqui */
    mudar: function (sub, k, valor) {
      if (k !== "ct:alinhar" || !SUBS[sub]) return false;
      if (valor === "externa" || valor === "eixo" || valor === "interna") cfg.alinhar[sub] = valor;
      return true;
    },

    /* PURO (testável): o contorno de um modo para o estado dado.
       { modo:"paredes", ids:[…] } | { modo:"edificacao" }; peca: "laje"|"piso"|"forro"|"telhado" → { ok, contornos|motivo,corrigir } */
    resolver: function (estado, sub, dados, o) {
      var M = C(); o = o || {};
      if (!M) return { ok: false, motivo: "O motor do contorno (js/bimcontorno.js) não carregou.", corrigir: "Recarregue o aplicativo." };
      var al = o.alinhar || cfg.alinhar[sub] || "externa", porAmb = (sub === "forro" || sub === "piso") && o.porAmbiente !== false;
      var cx = estado && estado.caixas || [];
      if (dados && dados.modo === "paredes") return M.contornoDeParedes(cx, dados.ids, { alinhar: al, porAmbiente: porAmb });
      return M.contornoDaEdificacao(cx, { alinhar: al, cota: o.cota, nivelId: o.nivelId, porAmbiente: porAmb });
    },

    /* ------------------------------------------------------------ a fita */
    registrar: function (reg, arqui, opts) {
      var pv = opts && opts.previa != null ? !!opts.previa : previa();
      var R = global.BimRibbon;
      if (!pv || !R || !C() || !reg) return false;
      R.acrescentar("arquitetura", "Arquitetura", "Modelador", [
        { id: "editar-contorno", rotulo: "Editar\ncontorno", icone: "editar", grande: true, requer: "selecao",
          dica: "Com a laje, o piso, o forro ou o telhado selecionado: arraste um vértice, arraste uma aresta (ela anda paralela), clique numa aresta para inserir um vértice e Delete no vértice para tirá-lo. Enter conclui (um Ctrl+Z desfaz tudo); Esc cancela. Contorno que se cruza ou aresta menor que 1 cm não grava." }
      ]);
      reg["editar-contorno"] = function () {
        var B = global.BIM;
        if (!B || !B.contornoEditar) return false;
        return B.contornoEditar();
      };
      return true;
    },

    /* ------------------------------------------------------------ o 3D / a planta */
    montar3d: function (api) {
      var M = C(); if (!M || !previa()) return null;
      modoDeFn = api.modoDe;
      var edit = api.edit, pend = null;        /* pend: { sub, ids:[] } — as paredes escolhidas */
      var pendBeiral = null;                   /* { contorno, extra } — telhado de 1 água esperando o clique do beiral */
      var sessao = null;                       /* a edição do contorno de uma peça */

      function ligado(sub) { return !!(edit && edit.on && SUBS[sub] && edit.sub === sub); }
      function modoDe(sub) { try { return api.modoDe(sub); } catch (e) { return ""; } }
      function ehNovo(sub) { var m = modoDe(sub); return m === "paredes" || m === "edificacao"; }
      function nivel() { return api.nivel ? api.nivel() : null; }

      /* A PAREDE DO CLIQUE. Diagnóstico instrumentado (27/10/2026): com o forro o clique no topo da parede (y 2,8) caía no plano do
         chão em z = −3,8 (perspectiva) e o raio acertava o TELHADO por cima — nem o ponto nem o alvo eram da parede. Por isso:
         1) todo objeto do raio que seja parede (não só o primeiro);
         2) o raio do clique contra o plano da ALTURA MÉDIA de cada parede (planta x, z contra a pegada dela, qualquer que seja o y do
            plano da ferramenta); 3) na planta (sem pixel) o ponto p já é o da planta. */
      function folgaPegada(c, q) {
        var F = global.BimForro, R = F.retangulo(c), folga = 1e9, k;
        for (k = 0; k < 4; k++) {
          var a = R[k], b = R[(k + 1) % 4], L = Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2)) || 1;
          folga = Math.min(folga, ((b[0] - a[0]) * (q.z - a[1]) - (b[1] - a[1]) * (q.x - a[0])) / L);   /* distância assinada à borda: >= 0 = dentro */
        }
        return folga;
      }
      function paredeEm(p, e) {
        var st = edit.estado || {}, cx = arr(st.caixas).filter(function (c) { return c.tipo === "parede" && c.comprimento > 0.01; }), F = global.BimForro;
        if (!F || !F.retangulo) return null;
        var alvos = api.alvos ? api.alvos() : [], i, j;
        for (i = 0; i < alvos.length; i++) for (j = 0; j < cx.length; j++) if (String(cx[j].id) === String(alvos[i])) return cx[j].id;
        var melhor = null, dm = -1e9;
        function tenta(c, q) { if (!q) return; var f = folgaPegada(c, q); if (f >= -0.12 && f > dm) { dm = f; melhor = c.id; } }
        var temPixel = e && isFinite(e.clientX) && isFinite(e.clientY) && api.planoEm;
        cx.forEach(function (c) {
          if (temPixel) tenta(c, api.planoEm(e.clientX, e.clientY, +c.cy || 0));
          else if (p) tenta(c, p);
        });
        return melhor;
      }

      /* cria a(s) peça(s) do(s) contorno(s) achado(s) — pelo caminho de SEMPRE de cada ferramenta (as Propriedades valem) */
      function criarDe(sub, r, extra) {
        if (!r || !r.ok) { api.hint((r && r.motivo ? r.motivo + " " : "Contorno inválido. ") + (r && r.corrigir ? r.corrigir : "")); return true; }
        var feitos = api.criar(sub, r.contornos.map(function (c) { return c.pts; }), extra || {});
        if (feitos > 0 && r.contornos.length > 1) api.hint(feitos + " peças criadas, uma por ambiente (" + r.contornos.map(function (c) { return n2(c.area) + " m²"; }).join(", ") + "). Ctrl+Z desfaz cada uma.");
        return true;
      }
      function opcoes() { var nv = nivel(); return { cota: api.base ? api.base() : null, nivelId: nv && nv.id != null ? nv.id : null }; }

      /* o telhado de 1 água: o contorno espera o clique na aresta do beiral */
      function seguirTelhado(sub, r) {
        var c = api.aguasTelhado ? api.aguasTelhado() : 4;
        if (sub === "telhado" && c === 1 && r && r.ok && r.contornos.length === 1) {
          pendBeiral = { r: r };
          api.hint("Telhado de UMA água (" + n2(r.contornos[0].area) + " m²): clique perto da aresta do BEIRAL (a mais baixa — dali o telhado sobe). Enter = a aresta mais comprida. Esc cancela.");
          return true;
        }
        return criarDe(sub, r, {});
      }

      function ids() { return pend ? pend.ids.slice() : []; }

      var self = {
        dica: function (sub) {
          if (!ligado(sub)) return "";
          if (pendBeiral) return "Clique perto da aresta do BEIRAL (a mais baixa); Enter = a mais comprida.";
          var m = modoDe(sub);
          return dicaModo(sub, m);
        },
        cancelar: function () { pend = null; pendBeiral = null; },
        aoSub: function () { pend = null; pendBeiral = null; },
        clique: function (sub, e, hit, p) {
          if (sessao) return true;      /* editando: o clique do 3D não cria nada */
          if (!ligado(sub)) return false;
          if (pendBeiral && sub === "telhado") {
            if (!p) return true;
            var k = M.arestaMaisPerto(pendBeiral.r.contornos[0].pts, { x: p.x, z: p.z });
            var r1 = pendBeiral.r; pendBeiral = null;
            return criarDe(sub, r1, { arestaSobe: k });
          }
          var modo = modoDe(sub);
          if (modo === "edificacao") {
            var r = self.resolver(sub, { modo: "edificacao" });
            return r.ok ? seguirTelhado(sub, r) : criarDe(sub, r);
          }
          if (modo === "paredes") {
            var id = paredeEm(p, e);
            if (id == null) { api.hint("Clique em cima de uma parede" + (pend && pend.ids.length ? " (" + pend.ids.length + " escolhida(s); Enter conclui)." : ".")); return true; }
            if (!pend || pend.sub !== sub) pend = { sub: sub, ids: [] };
            var ix = pend.ids.indexOf(String(id));
            if (ix >= 0) pend.ids.splice(ix, 1); else pend.ids.push(String(id));
            pend.ultima = String(id);
            api.hint(pend.ids.length + " parede(s) escolhida(s)" + (pend.ids.length ? " — Tab pega a cadeia, Enter conclui, clique de novo numa parede para tirá-la." : "."));
            if (api.destacar) api.destacar(pend.ids);
            return true;
          }
          return false;
        },
        resolver: function (sub, dados) { return BimContornoUI.resolver(edit.estado, sub, dados, opcoes()); },
        concluirParedes: function () {
          if (!pend || !pend.ids.length) { api.hint("Escolha as paredes primeiro."); return false; }
          var sub = pend.sub, r = self.resolver(sub, { modo: "paredes", ids: pend.ids });
          pend = null; if (api.destacar) api.destacar([]);
          return r.ok ? seguirTelhado(sub, r) : criarDe(sub, r);
        },
        cadeia: function () {
          if (!pend || !pend.ultima) return false;
          var L = M.cadeiaDeParedes(arr(edit.estado && edit.estado.caixas), pend.ultima);
          L.forEach(function (x) { if (pend.ids.indexOf(String(x)) < 0) pend.ids.push(String(x)); });
          api.hint(pend.ids.length + " parede(s) escolhida(s) (a cadeia inteira). Enter conclui.");
          if (api.destacar) api.destacar(pend.ids);
          return true;
        },
        concluirBeiral: function () {
          if (!pendBeiral) return false;
          var r1 = pendBeiral.r; pendBeiral = null;
          return criarDe("telhado", r1, {});
        },
        pendentes: function () { return { paredes: ids(), beiral: !!pendBeiral, sessao: !!sessao }; },

        /* ------------------------------------------------ EDITAR CONTORNO de uma peça pronta */
        editar: function () {
          if (sessao) return true;
          if (!edit || !edit.on || !edit.estado) { api.hint("Ligue o Editor (Modelador) e selecione a laje, o forro ou o telhado."); return false; }
          var uids = api.selecao ? api.selecao() : [], st = edit.estado, achou = null;
          uids.forEach(function (u) {
            if (achou) return;
            var id = String(u).replace(/^edit:/, "");
            var cx = arr(st.caixas).filter(function (c) { return String(c.id) === id && c.tipo === "laje" && arr(c.contorno).length >= 3; })[0];
            if (cx) { achou = { tipo: "laje", id: cx.id, pts: clone(cx.contorno), y: (+cx.cy || 0) + (+cx.altura || 0) / 2, rot: "Laje" }; return; }
            var fo = arr(st.forros).filter(function (f) { return String(f.id) === id && f.ok && arr(f.contorno).length >= 3; })[0];
            if (fo) { achou = { tipo: "forro", id: fo.id, pts: clone(fo.contorno), y: +fo.cota || 0, rot: "Forro" }; return; }
            var te = arr(st.telhados).filter(function (t) { return String(t.id) === id && t.modo !== "extrusao" && arr(t.contorno).length >= 3; })[0];
            if (te) achou = { tipo: "telhado", id: te.id, pts: clone(te.contorno), y: +te.cotaApoio || 0, rot: "Telhado" };
          });
          if (!achou) { api.hint("Selecione uma laje por contorno, um forro ou um telhado por perímetro (clique nele) e use \"Editar contorno\"."); return false; }
          if (achou.pts.some(function (p) { return p && p.m; })) { api.hint("Este contorno tem aresta em arco: a edição de vértices é só para contorno reto."); return false; }
          sessao = { alvo: achou, orig: clone(achou.pts), cur: clone(achou.pts), selV: -1, drag: null, erro: null };
          montarCamada();
          api.hint(achou.rot + ": arraste os vértices (quadrados) e as arestas (círculos); clique numa aresta para inserir um vértice; Delete tira o vértice escolhido. Enter conclui, Esc cancela.");
          return true;
        },
        sessaoEstado: function () { return sessao ? { id: sessao.alvo.id, tipo: sessao.alvo.tipo, pts: clone(sessao.cur), erro: sessao.erro, selV: sessao.selV } : null; },
        /* para o teste/e2e: as mesmas ações das alças, sem o mouse */
        aplicar: function (acao) { return aplicarAcao(acao); },
        concluir: function () { return concluirSessao(); },
        cancelarSessao: function () { fecharSessao(); }
      };

      /* ---------------- a camada das alças (DOM sobre o 3D) */
      var cam = null, svg = null, painel = null, raf = 0, alcas = [];
      function aplicarAcao(a) {
        if (!sessao) return { ok: false };
        var r = M.editar(sessao.cur, a);
        sessao.cur = r.ok ? r.pts : (r.bruto || sessao.cur);
        sessao.erro = r.ok ? null : (r.motivo + " " + (r.corrigir || ""));
        if (a.tipo === "inserir" && r.ok) sessao.selV = Math.round(a.i) + 1;
        if (a.tipo === "remover" && r.ok) sessao.selV = -1;
        desenhar();
        return r;
      }
      function montarCamada() {
        var h = api.host(); if (!h) return;
        cam = document.createElement("div"); cam.setAttribute("data-bim", "contorno-edicao");
        cam.style.cssText = "position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:40";
        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("width", "100%"); svg.setAttribute("height", "100%"); svg.style.cssText = "position:absolute;left:0;top:0;pointer-events:none";
        cam.appendChild(svg);
        painel = document.createElement("div"); painel.setAttribute("data-bim", "contorno-painel");
        painel.style.cssText = "position:absolute;left:12px;top:12px;pointer-events:auto;background:rgba(15,23,42,.92);color:#fff;padding:8px 10px;border-radius:8px;font:12px/1.35 system-ui,sans-serif;max-width:340px";
        cam.appendChild(painel);
        h.appendChild(cam);
        window.addEventListener("keydown", tecla, true);
        document.addEventListener("pointermove", mover, true); document.addEventListener("pointerup", soltar, true);
        loop();
      }
      function fecharSessao() {
        sessao = null;
        window.removeEventListener("keydown", tecla, true);
        document.removeEventListener("pointermove", mover, true); document.removeEventListener("pointerup", soltar, true);
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        if (cam && cam.parentNode) cam.parentNode.removeChild(cam);
        cam = svg = painel = null; alcas = [];
      }
      function loop() { if (!sessao) return; desenhar(); raf = requestAnimationFrame(loop); }
      function pos(x, z) {
        var t = api.telaDe(x, sessao.alvo.y, z), hr = api.host().getBoundingClientRect();
        return t && !t.atras ? { x: t.x - hr.left, y: t.y - hr.top } : null;
      }
      function desenhar() {
        if (!sessao || !cam) return;
        var P = sessao.cur, n = P.length, S2 = P.map(function (q) { return pos(q.x, q.z); }), i, h = "";
        if (S2.every(Boolean)) h += '<polygon points="' + S2.map(function (q) { return q.x.toFixed(1) + "," + q.y.toFixed(1); }).join(" ") + '" fill="' + (sessao.erro ? "rgba(239,68,68,.18)" : "rgba(34,197,94,.16)") + '" stroke="' + (sessao.erro ? "#ef4444" : "#22c55e") + '" stroke-width="2.5"/>';
        svg.innerHTML = h;
        /* as alças: reaproveita os elementos (o arrasto precisa do mesmo nó) */
        var quer = [];
        for (i = 0; i < n; i++) quer.push({ k: "v", i: i, p: S2[i] });
        for (i = 0; i < n; i++) { var a = S2[i], b = S2[(i + 1) % n]; quer.push({ k: "a", i: i, p: a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null }); }
        while (alcas.length > quer.length) { var d = alcas.pop(); if (d.el.parentNode) d.el.parentNode.removeChild(d.el); }
        quer.forEach(function (q, j) {
          var al = alcas[j];
          if (!al) { al = alcas[j] = { el: document.createElement("div") }; al.el.addEventListener("pointerdown", function (ev) { descer(ev, al); }); cam.appendChild(al.el); }
          al.k = q.k; al.i = q.i;
          var sel = q.k === "v" && q.i === sessao.selV;
          al.el.setAttribute("data-alca", q.k + q.i);
          al.el.style.cssText = "position:absolute;pointer-events:auto;cursor:" + (q.k === "v" ? "move" : "pointer") + ";width:14px;height:14px;margin:-7px 0 0 -7px;box-sizing:border-box;border:2px solid #fff;background:" + (q.k === "v" ? (sel ? "#f59e0b" : "#2563eb") : "#22c55e") + ";border-radius:" + (q.k === "v" ? "2px" : "50%") + ";display:" + (q.p ? "block" : "none") + ";" + (q.p ? "left:" + q.p.x.toFixed(1) + "px;top:" + q.p.y.toFixed(1) + "px" : "");
        });
        var v = M.validar(sessao.cur);
        painel.innerHTML = '<b>' + sessao.alvo.rot + ' — editar contorno</b><br>' + (v.ok ? n2(v.area) + ' m² · perímetro ' + n2(v.perimetro) + ' m · ' + sessao.cur.length + ' vértices' : '<span style="color:#fca5a5">' + (sessao.erro || v.motivo) + '</span>') +
          '<div style="margin-top:6px;display:flex;gap:6px"><button type="button" data-ct="concluir" style="cursor:pointer">Concluir (Enter)</button><button type="button" data-ct="cancelar" style="cursor:pointer">Cancelar (Esc)</button></div>';
        var bc = painel.querySelector('[data-ct="concluir"]'), bx = painel.querySelector('[data-ct="cancelar"]');
        if (bc) bc.onclick = function () { concluirSessao(); }; if (bx) bx.onclick = function () { fecharSessao(); api.hint("Edição do contorno cancelada."); };
      }
      function ptDe(ev, snap) {
        var q = api.planoEm(ev.clientX, ev.clientY, sessao.alvo.y); if (!q) return null;
        if (snap !== false && !ev.altKey) { q = { x: Math.round(q.x * 20) / 20, z: Math.round(q.z * 20) / 20 }; }
        return q;
      }
      function descer(ev, al) {
        if (!sessao) return;
        ev.preventDefault(); ev.stopPropagation();
        sessao.drag = { k: al.k, i: al.i, base: clone(sessao.cur), moved: false, x0: ev.clientX, y0: ev.clientY };
        if (al.k === "v") sessao.selV = al.i;
        try { al.el.setPointerCapture(ev.pointerId); } catch (e) {}
      }
      function mover(ev) {
        var d = sessao && sessao.drag; if (!d) return;
        if (!d.moved && Math.abs(ev.clientX - d.x0) + Math.abs(ev.clientY - d.y0) < 4) return;
        d.moved = true;
        var q = ptDe(ev); if (!q) return;
        var r = M.editar(d.base, { tipo: d.k === "v" ? "mover" : "aresta", i: d.i, p: q });
        sessao.cur = r.ok ? r.pts : (r.bruto || d.base);
        sessao.erro = r.ok ? null : (r.motivo + " " + (r.corrigir || ""));
        desenhar();
      }
      function soltar(ev) {
        var d = sessao && sessao.drag; if (!d) return;
        sessao.drag = null;
        if (!d.moved && d.k === "a") {
          var q = ptDe(ev, false);
          if (q) aplicarAcao({ tipo: "inserir", i: d.i, p: q });
        } else desenhar();
      }
      function tecla(ev) {
        if (!sessao) return;
        if (ev.key === "Enter") { ev.preventDefault(); ev.stopPropagation(); concluirSessao(); }
        else if (ev.key === "Escape") { ev.stopPropagation(); fecharSessao(); api.hint("Edição do contorno cancelada."); }
        else if ((ev.key === "Delete" || ev.key === "Backspace") && sessao.selV >= 0) { ev.preventDefault(); ev.stopPropagation(); aplicarAcao({ tipo: "remover", i: sessao.selV }); }
      }
      function concluirSessao() {
        if (!sessao) return false;
        var v = M.validar(sessao.cur);
        if (!v.ok || sessao.erro) { api.hint("Não grava: " + (sessao.erro || (v.motivo + " " + v.corrigir))); return false; }
        var a = sessao.alvo, C2 = sessao.cur.map(function (q) { var o = { x: Math.round(q.x * 1e4) / 1e4, z: Math.round(q.z * 1e4) / 1e4 }; if (q.d === false) o.d = false; if (q.i != null && fin(Number(q.i))) o.i = Number(q.i); return o; });
        var op = a.tipo === "laje" ? { op: "ajustar", id: a.id, campos: { contorno: C2.map(function (q) { return { x: q.x, z: q.z }; }) } }
          : (a.tipo === "forro" ? { op: "forro", id: a.id, contorno: C2.map(function (q) { return { x: q.x, z: q.z }; }) } : { op: "telhado", id: a.id, contorno: C2 });
        var rot = a.rot;
        fecharSessao();
        api.op(op); if (api.fechou) api.fechou();
        api.hint(rot + ": contorno gravado (" + n2(v.area) + " m², perímetro " + n2(v.perimetro) + " m). Ctrl+Z desfaz.");
        return true;
      }

      /* Enter / Tab / Esc das escolhas (captura: o Enter da casca repetiria o comando da fita) */
      window.addEventListener("keydown", function (ev) {
        if (sessao || !edit || !edit.on || !SUBS[edit.sub]) return;
        if (ev.key === "Enter" && (pend || pendBeiral)) {
          ev.preventDefault(); ev.stopPropagation();
          if (pendBeiral) self.concluirBeiral(); else self.concluirParedes();
        } else if (ev.key === "Tab" && pend && pend.ids.length) { ev.preventDefault(); ev.stopPropagation(); self.cadeia(); }
        else if (ev.key === "Escape" && (pend || pendBeiral)) { pend = null; pendBeiral = null; if (api.destacar) api.destacar([]); }
      }, true);

      return self;
    }
  };

  global.BimContornoUI = BimContornoUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimContornoUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
