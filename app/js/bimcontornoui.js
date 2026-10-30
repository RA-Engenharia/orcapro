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
          dica: "Com a laje, o piso, o forro ou o telhado selecionado: arraste um vértice, arraste uma aresta (ela anda paralela), clique numa aresta para inserir um vértice e Delete no vértice para tirá-lo. Enter conclui (um Ctrl+Z desfaz tudo); Esc cancela. Contorno que se cruza ou aresta menor que 1 cm não grava." },
        { id: "ajustar-paredes", rotulo: "Ajustar às\nparedes", icone: "telhado", grande: true, requer: "selecao",
          dica: "Com o telhado, o forro (por contorno) ou a laje/piso selecionado: liga cada aresta à face da parede paralela mais perto (até 1,5 m) e leva a peça até ela. Depois disso a peça SEGUE as paredes: esticou ou moveu a parede, ela vai junto e as medidas (área, perímetro, quantitativo, sanca) saem do contorno novo. É o botão para a peça de antes, que ficou para trás quando a sala cresceu. Um Ctrl+Z desfaz." },
        { id: "ajustar-tudo-paredes", rotulo: "Ajustar TUDO\nàs paredes", icone: "telhado", grande: true,
          dica: "Projeto antigo: liga TODOS os telhados, forros por contorno e lajes/pisos por contorno do nível ativo às paredes de uma vez (a aresta sem parede paralela perto fica como está e o balão lista quais). Um Ctrl+Z desfaz tudo." }
      ]);
      reg["editar-contorno"] = function () {
        var B = global.BIM;
        if (!B || !B.contornoEditar) return false;
        return B.contornoEditar();
      };
      reg["ajustar-tudo-paredes"] = function () {
        var B = global.BIM;
        if (!B || !B.contornoAjustarTudo) return false;
        return B.contornoAjustarTudo();
      };
      reg["ajustar-paredes"] = function () {
        var B = global.BIM;
        if (!B || !B.contornoAjustarParedes) return false;
        return B.contornoAjustarParedes();
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
      var concluindo = false;                  /* gravando a op: a reconstrução do editor não reabre as alças por cima */
      /* o contorno do telhado com a inclinação por aresta (texto `inclinacoes`) fundida: regravar o contorno apaga o texto */
      function contornoDoTelhado(te) { var BT = global.BimTelhado; return BT && BT.contornoComInclinacoes ? BT.contornoComInclinacoes(te) : clone(te.contorno); }
      /* TUDO SEGUE AS PAREDES: a peça por contorno (laje/piso, forro por contorno ou telhado por perímetro) dona do id.
         soSegue: o forro AUTOMÁTICO (por ponto) fica de fora — ele já se refaz pelas paredes. */
      function pecaPorId(st, id, soSegue) {
        var cx = arr(st.caixas).filter(function (c) { return String(c.id) === id && c.tipo === "laje" && arr(c.contorno).length >= 3; })[0];
        if (cx) return { tipo: "laje", p: cx, pts: clone(cx.contorno), alinhar: M.alinharDaLaje ? M.alinharDaLaje(cx) : "externa", y: (+cx.cy || 0) + (+cx.altura || 0) / 2, rot: "Laje" };
        var fo = arr(st.forros).filter(function (f) { return String(f.id) === id && f.ok && arr(f.contorno).length >= 3 && (!soSegue || f.modo === "contorno"); })[0];
        if (fo) return { tipo: "forro", p: fo, pts: clone(fo.contorno), alinhar: "interna", y: +fo.cota || 0, rot: "Forro" };
        var te = arr(st.telhados).filter(function (t) { return String(t.id) === id && t.modo !== "extrusao" && arr(t.contorno).length >= 3; })[0];
        if (te) return { tipo: "telhado", p: te, pts: contornoDoTelhado(te), alinhar: "externa", y: +te.cotaApoio || 0, rot: "Telhado" };
        return null;
      }
      function opDoContorno(tipo, id, C) {
        var L = C.map(function (q) { var o = { x: q.x, z: q.z }; if (q.pr != null && q.pr !== "") { o.pr = q.pr; if (q.pf) o.pf = q.pf; if (q.po != null && fin(Number(q.po))) o.po = Number(q.po); } return o; });
        if (tipo === "laje") return { op: "ajustar", id: id, campos: { contorno: L } };
        if (tipo === "forro") return { op: "forro", id: id, contorno: L };
        return { op: "telhado", id: id, contorno: C };
      }
      function mudouSessao() { return !!sessao && JSON.stringify(sessao.cur) !== JSON.stringify(sessao.orig); }
      function nLig(L) { return arr(L).filter(function (q) { return q && q.pr != null && q.pr !== ""; }).length; }

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
        extra = extra || {};
        if (r.alinhar) extra.vincular = r.alinhar;   /* TUDO SEGUE AS PAREDES (telhado, forro, laje/piso): a aresta que veio de parede nasce ligada a ela */
        var feitos = api.criar(sub, r.contornos.map(function (c) { return c.pts; }), extra);
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
        editar: function (uidsDados, auto) {
          if (sessao) return true;
          if (!edit || !edit.on || !edit.estado) { if (!auto) api.hint("Ligue o Editor (Modelador) e selecione a laje, o forro ou o telhado."); return false; }
          var uids = uidsDados || (api.selecao ? api.selecao() : []), st = edit.estado, achou = null;
          uids.forEach(function (u) {
            if (achou) return;
            var pc = pecaPorId(st, String(u).replace(/^edit:/, ""), !!auto);
            if (pc) achou = { tipo: pc.tipo, id: pc.p.id, pts: pc.pts, y: pc.y, rot: pc.rot };
          });
          if (!achou) { if (!auto) api.hint("Selecione uma laje por contorno, um forro ou um telhado por perímetro (clique nele) e use \"Editar contorno\"."); return false; }
          if (achou.pts.some(function (p) { return p && p.m; })) { if (!auto) api.hint("Este contorno tem aresta em arco: a edição de vértices é só para contorno reto."); return false; }
          sessao = { alvo: achou, orig: clone(achou.pts), cur: clone(achou.pts), selV: -1, drag: null, erro: null, auto: !!auto, cota: null };
          montarCamada();
          var nl = nLig(achou.pts);
          if (auto) {   /* o clique abriu as alças: dica curta (a longa cobria o painel) */
            api.hint(achou.rot + ": arraste os vértices e as arestas. " + (nl ? "A aresta que você arrastar se solta da parede. " : "Use \"Ajustar às paredes\" para " + (achou.tipo === "laje" ? "ela seguir" : "ele seguir") + " as paredes. ") + "Enter conclui, Esc cancela.");
            return true;
          }
          api.hint(achou.rot + ": arraste os vértices (quadrados) e as arestas (círculos, com seta); clique numa aresta para inserir um vértice; Delete tira o vértice escolhido. Enter conclui, Esc cancela." +
            (nl ? " " + nl + " de " + achou.pts.length + " arestas seguem as paredes: a aresta que você arrastar se solta da parede (as outras continuam seguindo)." : " Esta peça não segue as paredes: use \"Ajustar às paredes\" para ligá-la."));
          return true;
        },
        /* CLIQUE NO TELHADO = ALÇAS (29/10/2026): o telhado por perímetro selecionado (modelador ligado) mostra as alças do contorno JÁ, sem procurar
           botão. Selecionar outra coisa conclui (se mexeu e vale) ou fecha sem gravar (se nada mudou). Chamado por js/bim.js › selAplicar. */
        aoSelecionar: function (uids) {
          uids = arr(uids);
          if (concluindo) return false;
          /* ÍMÃ DA ESTRUTURA: a sessão de alças da viga/chapa/pilar fecha ao selecionar outra coisa */
          if (sE) {
            if (uids.length === 1 && uids[0] === "edit:" + sE.id) return true;
            fecharE();   /* trocar a seleção (ou o Esc que a limpa) CANCELA o que não foi confirmado com Enter */
          }
          if (sessao) {
            if (!sessao.auto) return false;
            if (uids.length === 1 && uids[0] === "edit:" + sessao.alvo.id) return true;
            if (mudouSessao() && !sessao.erro && M.validar(sessao.cur).ok) concluirSessao(); else fecharSessao();
          }
          if (!edit || !edit.on || edit.sub || !edit.estado || uids.length !== 1 || !/^edit:/.test(uids[0])) return false;
          var id = uids[0].replace(/^edit:/, "");
          return pecaPorId(edit.estado, id, true) ? self.editar(uids, true) : abrirE(id);   /* ÍMÃ DA ESTRUTURA: viga/perfil, chapa e pilar já ligados abrem as alças das partes */   /* TUDO SEGUE AS PAREDES: telhado, forro por contorno e laje abrem as alças no clique */
        },
        /* "Ajustar às paredes agora": liga as arestas do telhado, do forro por contorno ou da laje/piso selecionado às faces de parede paralelas e grava UMA op */
        ajustarParedes: function () {
          if (!edit || !edit.on || !edit.estado) { api.hint("Ligue o Editor (Modelador) e selecione um telhado, um forro por contorno ou uma laje."); return false; }
          if (sessao) {
            if (mudouSessao()) { api.hint("Conclua (Enter) ou cancele (Esc) a edição do contorno antes de ajustar às paredes."); return false; }
            fecharSessao();
          }
          var st = edit.estado, uids = api.selecao ? api.selecao() : [], pc = null;
          uids.forEach(function (u) { if (!pc) pc = pecaPorId(st, String(u).replace(/^edit:/, ""), true); });
          if (!pc) {
            /* ÍMÃ DA ESTRUTURA (29/10/2026, js/bimima.js): viga/perfil, chapa horizontal ou pilar selecionado → liga pontas / arestas / canto às paredes (UMA op ima; Ctrl+Z desfaz) */
            var BIm = (typeof window !== "undefined" ? window.BimIma : null), selI = null;
            uids.forEach(function (u) { if (!selI && BIm && BIm.ajustarPeca) { var idI = String(u).replace(/^edit:/, ""); var ci = arr(st.caixas).filter(function (x) { return x && String(x.id) === idI; })[0]; if (ci && BIm.tipoDe(ci)) selI = ci; } });
            if (selI) {
              var rI = BIm.ajustarPeca(st, selI.id);
              if (!rI.ok) { api.hint((rI.motivo || "Não deu para ligar às paredes.") + " " + (rI.corrigir || "")); return false; }
              api.op(rI.op);
              api.hint("Peça " + selI.id + ": " + rI.resumo + " Puxou a parede, a peça se refaz. Ctrl+Z desfaz.");
              return true;
            }
            api.hint("Selecione um telhado por perímetro, um forro por contorno, uma laje, ou uma viga, chapa ou pilar (clique nele) e use \"Ajustar às paredes\"."); return false;
          }
          var RP = M.ROT_PECA ? M.ROT_PECA[pc.tipo] : null, nome = pc.rot + " " + pc.p.id;
          var v = M.vincularArestas(arr(st.caixas), pc.pts, { alinhar: pc.alinhar, nome: RP && RP.nome, de: RP && RP.de, rot: RP && RP.rot });
          if (!v.ok) { api.hint(nome + ": " + (v.motivo || "não deu para ligar às paredes.") + " " + (v.corrigir || "")); return false; }
          if (JSON.stringify(v.contorno) === JSON.stringify(pc.pts)) { api.hint(nome + ": " + v.resumo + " Já está nas paredes — nada para ajustar."); return true; }
          concluindo = true;
          try { api.op(opDoContorno(pc.tipo, pc.p.id, v.contorno)); if (api.fechou) api.fechou(); } finally { concluindo = false; }
          var msgA = nome + ": " + v.resumo + " " + (v.mudou ? "O contorno foi levado até as faces das paredes e agora acompanha as paredes." : "O contorno já estava nas paredes e agora as acompanha.") + " Ctrl+Z desfaz.";
          api.hint(msgA);
          setTimeout(function () { try { self.aoSelecionar(api.selecao ? api.selecao() : []); } catch (e) {} api.hint(msgA); }, 0);   /* as alças reabrem sobre a peça nova; o balão fica com o resumo */
          return true;
        },
        /* "AJUSTAR TUDO ÀS PAREDES" (projeto antigo): liga TODOS os telhados, forros por contorno e lajes do nível ativo (o.todos = todos os níveis)
           numa op de LOTE só (um Ctrl+Z desfaz tudo) e diz "N peças, M de K arestas ligadas" + o que não ligou. */
        ajustarTudo: function (o) {
          o = o || {};
          if (!edit || !edit.on || !edit.estado) { api.hint("Ligue o Editor (Modelador) para ajustar tudo às paredes."); return false; }
          if (sessao) {
            if (mudouSessao()) { api.hint("Conclua (Enter) ou cancele (Esc) a edição do contorno antes de ajustar tudo às paredes."); return false; }
            fecharSessao();
          }
          var niv = !o.todos && api.nivel ? api.nivel() : null;
          var r = M.ajustarTudo(edit.estado, { nivelId: niv && niv.id != null ? niv.id : null, contornoTelhado: contornoDoTelhado });
          if (!r.nPecas && !r.naoLigou.length) { api.hint("Nenhum telhado, forro, laje por contorno ou peça de estrutura (viga, chapa, pilar)" + (niv ? " neste nível" : "") + " para ajustar."); return false; }
          if (!r.ops.length) { api.hint("Ajustar tudo às paredes: " + r.resumo + " Nada mudou: as peças já estão nas paredes."); return true; }
          concluindo = true;
          try { api.op(r.ops.length === 1 ? r.ops[0] : { op: "lote", id: "ap" + Date.now().toString(36), origem: "modificar", pedido: "Ajustar TUDO às paredes", ops: r.ops }); if (api.fechou) api.fechou(); } finally { concluindo = false; }
          api.hint("Ajustar tudo às paredes: " + r.resumo + " Ctrl+Z desfaz tudo.");
          self.ultimoAjusteTudo = r;
          return true;
        },
        sessaoEstado: function () { return sessao ? { id: sessao.alvo.id, tipo: sessao.alvo.tipo, pts: clone(sessao.cur), erro: sessao.erro, selV: sessao.selV, auto: !!sessao.auto, cota: sessao.cota ? clone(sessao.cota) : null, ligadas: nLig(sessao.cur), ligadasAntes: nLig(sessao.orig) } : null; },
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
        /* TELHADO SEGUE AS PAREDES: a seta de cada aresta aponta para FORA (verde = segue a parede, laranja = solta/à mão) */
        if (true) {
          var sgn = M.areaSinal(P) < 0 ? -1 : 1;
          for (i = 0; i < n; i++) {
            var a0 = P[i], b0 = P[(i + 1) % n], dx0 = b0.x - a0.x, dz0 = b0.z - a0.z, L0 = Math.sqrt(dx0 * dx0 + dz0 * dz0) || 1;
            var mx0 = (a0.x + b0.x) / 2, mz0 = (a0.z + b0.z) / 2, p0 = pos(mx0, mz0), p1 = pos(mx0 + sgn * dz0 / L0 * 0.5, mz0 - sgn * dx0 / L0 * 0.5);
            if (!p0 || !p1) continue;
            var ux = p1.x - p0.x, uy = p1.y - p0.y, ul = Math.sqrt(ux * ux + uy * uy) || 1; ux /= ul; uy /= ul;
            var cor = P[i].pr != null && P[i].pr !== "" ? "#22c55e" : "#f59e0b", sx = p0.x + ux * 11, sy = p0.y + uy * 11, ex = p0.x + ux * 31, ey = p0.y + uy * 31;
            h += '<g stroke="' + cor + '" stroke-width="2.5" stroke-linecap="round" fill="none"><line x1="' + sx.toFixed(1) + '" y1="' + sy.toFixed(1) + '" x2="' + ex.toFixed(1) + '" y2="' + ey.toFixed(1) + '"/>' +
              '<polyline points="' + (ex - ux * 7 - uy * 5).toFixed(1) + ',' + (ey - uy * 7 + ux * 5).toFixed(1) + ' ' + ex.toFixed(1) + ',' + ey.toFixed(1) + ' ' + (ex - ux * 7 + uy * 5).toFixed(1) + ',' + (ey - uy * 7 - ux * 5).toFixed(1) + '"/></g>';
            if (sessao.drag && sessao.drag.k === "a" && sessao.drag.i === i && sessao.cota) {
              h += '<text x="' + (ex + ux * 8 + 4).toFixed(1) + '" y="' + (ey + uy * 8 + 4).toFixed(1) + '" fill="#fff" stroke="#0f172a" stroke-width="3" paint-order="stroke" font-size="13" font-weight="700" font-family="system-ui,sans-serif">' +
                (sessao.cota.encaixou ? "na face da parede" : n2(sessao.cota.dd) + " m da parede") + '</text>';
            }
          }
        }
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
        var infoLig = "";
        if (true) {
          var nl1 = nLig(sessao.cur), nl0 = nLig(sessao.orig);
          infoLig = '<br><span data-ct="vinculo" style="color:' + (nl1 ? '#86efac' : '#fcd34d') + '">' + (nl1 ? nl1 + ' de ' + sessao.cur.length + ' arestas seguem as paredes' : 'Não segue as paredes (use "Ajustar às paredes")') + '</span>' +
            (nl0 > nl1 ? '<br><span data-ct="solta" style="color:#fcd34d">' + (nl0 - nl1) + ' aresta(s) solta(s) da parede</span>' : '') +
            (sessao.drag && sessao.drag.k === "a" && sessao.cota ? '<br><span data-ct="cota">' + (sessao.cota.encaixou ? 'Encaixada na face da parede' : 'Distância até a parede mais próxima: ' + n2(sessao.cota.dd) + ' m') + '</span>' : '');
        }
        painel.innerHTML = '<b>' + sessao.alvo.rot + ' — editar contorno</b><br>' + (v.ok ? n2(v.area) + ' m² · perímetro ' + n2(v.perimetro) + ' m · ' + sessao.cur.length + ' vértices' : '<span style="color:#fca5a5">' + (sessao.erro || v.motivo) + '</span>') + infoLig +
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
        /* TELHADO: a COTA da aresta que anda até a parede mais perto; a menos de 5 cm ela ENCAIXA na face (Alt solta o encaixe) */
        sessao.cota = null;
        if (d.k === "a" && edit.estado) {
          var P1 = r.ok ? r.pts : r.bruto, fc = P1 ? M.faceDaAresta(arr(edit.estado.caixas), P1, d.i, { alinhar: "auto", tol: 1.5 }) : null;
          if (fc) {
            sessao.cota = { dd: fc.dd, pr: fc.pr, pf: fc.pf, encaixou: false };
            if (fc.dd <= 0.05 && fc.dd > 1e-4 && !ev.altKey) {
              var r2 = M.editar(d.base, { tipo: "aresta", i: d.i, p: { x: q.x - fc.s * fc.nf[0], z: q.z - fc.s * fc.nf[1] } });
              if (r2.ok) { r = r2; sessao.cota = { dd: 0, pr: fc.pr, pf: fc.pf, encaixou: true }; }
            }
          }
        }
        sessao.cur = r.ok ? r.pts : (r.bruto || d.base);
        sessao.erro = r.ok ? null : (r.motivo + " " + (r.corrigir || ""));
        desenhar();
      }
      function soltar(ev) {
        var d = sessao && sessao.drag; if (!d) return;
        sessao.drag = null;
        var cotaFim = sessao.cota; sessao.cota = null;
        if (!d.moved && d.k === "a") {
          var q = ptDe(ev, false);
          if (q) aplicarAcao({ tipo: "inserir", i: d.i, p: q });
        } else {
          desenhar();
          if (d.moved && nLig(sessao.cur) < nLig(d.base)) {
            api.hint("Aresta solta da parede: ela não acompanha mais a parede (as outras continuam seguindo)." + (cotaFim && cotaFim.encaixou ? " Ficou na face da parede; use \"Ajustar às paredes\" para ligá-la de novo." : "") + " Enter conclui, Esc desfaz.");
          }
        }
      }
      function tecla(ev) {
        if (!sessao) return;
        if (ev.key === "Enter") { ev.preventDefault(); ev.stopPropagation(); concluirSessao(); }
        else if (ev.key === "Escape") {
          if (sessao.auto && !mudouSessao()) { fecharSessao(); return; }   /* nada mudou: o Esc segue para limpar a seleção */
          ev.stopPropagation(); fecharSessao(); api.hint("Edição do contorno cancelada.");
        }
        else if ((ev.key === "Delete" || ev.key === "Backspace") && sessao.selV >= 0) { ev.preventDefault(); ev.stopPropagation(); aplicarAcao({ tipo: "remover", i: sessao.selV }); }
      }
      function a0tipoTel() { return !!sessao; }   /* TUDO SEGUE AS PAREDES: telhado, forro e laje levam o vínculo */
      function concluirSessao() {
        if (!sessao) return false;
        var v = M.validar(sessao.cur);
        if (!v.ok || sessao.erro) { api.hint("Não grava: " + (sessao.erro || (v.motivo + " " + v.corrigir))); return false; }
        if (sessao.auto && !mudouSessao()) { fecharSessao(); return true; }   /* alças abertas pelo clique e nada mexido: não suja o desfazer */
        var a = sessao.alvo, C2 = sessao.cur.map(function (q) {
          var o = { x: Math.round(q.x * 1e4) / 1e4, z: Math.round(q.z * 1e4) / 1e4 }; if (q.d === false) o.d = false; if (q.i != null && fin(Number(q.i))) o.i = Number(q.i);
          if (a0tipoTel() && q.pr != null && q.pr !== "") { o.pr = q.pr; if (q.pf) o.pf = q.pf; if (q.po != null && fin(Number(q.po))) o.po = Number(q.po); }   /* TELHADO SEGUE AS PAREDES: a aresta ainda ligada continua ligada */
          return o;
        });
        var op = opDoContorno(a.tipo, a.id, C2);   /* TUDO SEGUE AS PAREDES: laje e forro também levam o pr/pf/po das arestas que continuam ligadas */
        var rot = a.rot;
        fecharSessao();
        concluindo = true;
        try { api.op(op); if (api.fechou) api.fechou(); } finally { concluindo = false; }
        api.hint(rot + ": contorno gravado (" + n2(v.area) + " m², perímetro " + n2(v.perimetro) + " m). Ctrl+Z desfaz.");
        return true;
      }

      /* ---------------- ÍMÃ DA ESTRUTURA (29/10/2026, js/bimima.js): as alças da viga/perfil (pontas), da chapa (arestas) e do pilar (canto)
         que JÁ seguem paredes. Alça verde = segue a parede; laranja = solta. ARRASTAR uma alça solta SÓ aquela parte (a peça não se move:
         quem quer reposicionar usa as ferramentas de sempre). Enter grava UMA op `ima`; Esc cancela; clicar sem arrastar não faz nada. */
      var sE = null, camE = null, painelE = null, rafE = 0, alcasE = [];
      function BImE() { return global.BimIma || null; }
      function escE(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
      function abrirE(id) {
        var BI = BImE(); if (!BI || !BI.alcas || !edit || !edit.on || !edit.estado) return false;
        var c = arr(edit.estado.caixas).filter(function (x) { return x && String(x.id) === String(id); })[0];
        if (!c || !BI.tipoDe(c) || !BI.temIma(c)) return false;
        var h = api.host(); if (!h) return false;
        sE = { id: String(id), c: clone(c), partes: [], drag: null };
        camE = document.createElement("div"); camE.setAttribute("data-bim", "ima-edicao");
        camE.style.cssText = "position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:40";
        painelE = document.createElement("div"); painelE.setAttribute("data-bim", "ima-painel");
        painelE.style.cssText = "position:absolute;left:12px;top:12px;pointer-events:auto;background:rgba(15,23,42,.92);color:#fff;padding:8px 10px;border-radius:8px;font:12px/1.35 system-ui,sans-serif;max-width:340px";
        camE.appendChild(painelE); h.appendChild(camE);
        window.addEventListener("keydown", teclaE, true);
        document.addEventListener("pointermove", moverE, true); document.addEventListener("pointerup", soltarE, true);
        var r = BI.resumo(c);
        api.hint("Peça " + c.id + ": " + r.ligadas + " de " + r.total + " ligações seguem as paredes. Arraste uma alça verde para SOLTAR só aquela parte da parede; Enter grava, Esc cancela.");
        loopE();
        return true;
      }
      function fecharE() {
        sE = null;
        window.removeEventListener("keydown", teclaE, true);
        document.removeEventListener("pointermove", moverE, true); document.removeEventListener("pointerup", soltarE, true);
        if (rafE) { cancelAnimationFrame(rafE); rafE = 0; }
        if (camE && camE.parentNode) camE.parentNode.removeChild(camE);
        camE = painelE = null; alcasE = [];
      }
      function loopE() { if (!sE) return; desenharE(); rafE = requestAnimationFrame(loopE); }
      function desenharE() {
        if (!sE || !camE) return;
        var BI = BImE(), L = BI.alcas(sE.c), hr = api.host().getBoundingClientRect();
        while (alcasE.length > L.length) { var d = alcasE.pop(); if (d.el.parentNode) d.el.parentNode.removeChild(d.el); }
        L.forEach(function (a, j) {
          var t = api.telaDe(a.x, a.y, a.z), el = alcasE[j] && alcasE[j].el;
          if (!el) { el = document.createElement("div"); alcasE[j] = { el: el }; (function (parte) { el.addEventListener("pointerdown", function (ev) { descerE(ev, parte); }); })(a.parte); camE.appendChild(el); }
          var solta = sE.partes.indexOf(a.parte) >= 0, ok = a.ligada && !solta, vis = t && !t.atras;
          el.setAttribute("data-alca", "ima-" + a.parte); el.setAttribute("data-ligada", ok ? "1" : "0");
          el.title = a.rotulo + (ok ? " — segue a parede (arraste para soltar)" : " — solta");
          el.style.cssText = "position:absolute;pointer-events:" + (vis ? "auto" : "none") + ";cursor:pointer;width:16px;height:16px;margin:-8px 0 0 -8px;box-sizing:border-box;border:2px solid #fff;border-radius:" + (typeof a.parte === "number" ? "50%" : "3px") + ";background:" + (ok ? "#22c55e" : "#f59e0b") + ";left:" + (t ? (t.x - hr.left).toFixed(1) : -99) + "px;top:" + (t ? (t.y - hr.top).toFixed(1) : -99) + "px;display:" + (vis ? "block" : "none");
        });
        var r0 = BI.resumo(sE.c), nSol = sE.partes.filter(function (p) { return L.some(function (a) { return a.parte === p && a.ligada; }); }).length, lig = Math.max(0, r0.ligadas - nSol);
        painelE.innerHTML = "<b>" + escE(sE.c.id) + " — segue as paredes</b><br><span data-im=\"resumo\" style=\"color:" + (lig ? "#86efac" : "#fcd34d") + "\">" + lig + " de " + r0.total + " ligações seguem as paredes</span>" +
          (nSol ? "<br><span data-im=\"solta\" style=\"color:#fcd34d\">" + nSol + " parte(s) solta(s) da parede</span>" : "") +
          "<div style=\"margin-top:6px;display:flex;gap:6px\"><button type=\"button\" data-im=\"concluir\" style=\"cursor:pointer\">Concluir (Enter)</button><button type=\"button\" data-im=\"cancelar\" style=\"cursor:pointer\">Cancelar (Esc)</button></div>";
        var bc = painelE.querySelector('[data-im="concluir"]'), bx = painelE.querySelector('[data-im="cancelar"]');
        if (bc) bc.onclick = function () { concluirE(); };
        if (bx) bx.onclick = function () { fecharE(); api.hint("Alças da estrutura canceladas."); };
      }
      function descerE(ev, parte) { if (!sE) return; ev.preventDefault(); ev.stopPropagation(); sE.drag = { parte: parte, x0: ev.clientX, y0: ev.clientY, moved: false }; }
      function moverE(ev) {
        var d = sE && sE.drag; if (!d) return;
        if (d.moved || Math.abs(ev.clientX - d.x0) + Math.abs(ev.clientY - d.y0) < 4) return;
        d.moved = true;
        if (sE.partes.indexOf(d.parte) < 0) sE.partes.push(d.parte);
        api.hint("Parte solta da parede: ela não acompanha mais a parede (as outras continuam seguindo). Enter grava, Esc desfaz.");
        desenharE();
      }
      function soltarE() { if (sE) sE.drag = null; }
      function teclaE(ev) {
        if (!sE) return;
        if (ev.key === "Enter") { ev.preventDefault(); ev.stopPropagation(); concluirE(); }
        else if (ev.key === "Escape") {
          if (!sE.partes.length) { fecharE(); return; }   /* nada mudou: o Esc segue para limpar a seleção */
          ev.stopPropagation(); fecharE(); api.hint("Alças da estrutura canceladas.");
        }
      }
      function concluirE() {
        if (!sE) return false;
        var BI = BImE(), op = sE.partes.length ? BI.soltarPartes(sE.c, sE.partes) : null, id = sE.id;
        fecharE();
        if (!op) return true;   /* nada solto: não suja o desfazer */
        concluindo = true;
        try { api.op(op); if (api.fechou) api.fechou(); } finally { concluindo = false; }
        api.hint("Peça " + id + ": parte(s) solta(s) da parede. Ctrl+Z desfaz.");
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
