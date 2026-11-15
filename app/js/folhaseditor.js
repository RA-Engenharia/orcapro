/* =====================================================================
 * folhaseditor.js — EDITOR DE FOLHAS (motor PURO, ES5, sem DOM, Node-testável). Serve a TODAS as disciplinas do gerador de pranchas
 * (arquitetura agora; hidro, estrutura e elétrica depois): quem gera entrega o CONJUNTO (folhas e blocos já desenhados, em mm) e recebe de volta o que
 * o usuário decidiu (formato por folha, posição dos blocos, o que ficou FIXADO). A tela é js/folhaseditorui.js; aqui só há regra.
 *
 * O CONJUNTO (JSON puro, serializável):
 *   { versao: 1, folhas: [{ id, titulo?, formato: "A0".."A4", orientacao: "paisagem"|"retrato",
 *                           blocos: [{ id, desenho, x, y, w, h, escala?, fixo }] }] }
 *   x e y em mm a partir do canto da ÁREA ÚTIL da folha (a que já exclui moldura, coluna de notas e carimbo RA); w e h = a caixa da tinta do bloco.
 *   O número da folha é a POSIÇÃO dela na lista (1, 2, 3…): é por ele que o gerador entende "o bloco X vai na folha 3".
 *
 * O EDITOR (FolhasEditor.criar(conjunto, opc) → ed): cada operação devolve { ok, erro?, aviso? } e, se ok, entra no histórico (desfazer/refazer).
 *   ed.trocarFormato(folhaId, "A1")        a folha muda de papel: o carimbo vai junto (a área útil vem de opc.areaDe); os blocos que continuam cabendo ficam
 *                                          onde estão, os que saem da área são REACOMODADOS no espaço livre; sem lugar, ficam e o erro aparece (nunca some).
 *   ed.moverBloco(blocoId, folhaId, x?, y?)  move de posição e/ou de folha (x,y omitidos = o primeiro lugar livre); o bloco movido fica FIXADO.
 *   ed.criarFolha(formato?)  ·  ed.apagarFolha(folhaId) (só VAZIA)  ·  ed.reordenar(folhaId, posicao)
 *   ed.fixar(blocoId) / ed.soltar(blocoId)   fixado = o gerador respeita na próxima geração; solto = volta ao arranjo automático
 *   ed.reorganizarAuto()                   solta tudo e repacota (opc.empacotar do gerador, se houver; senão o empacotador por prateleiras daqui)
 *   ed.desfazer() / ed.refazer()
 *   ed.validar() → { ok, erros[], avisos[], porBloco{}, porFolha{} }   ERRO = bloco fora da área útil, bloco × bloco sobreposto, bloco × carimbo; AVISO = menos que o espaço mínimo entre blocos
 *   ed.paraConfig() → { fixos: { id: { folha, x, y } }, formatosFolha: { "2": "A1" }, arranjoFormato }   o que o gerador grava por obra e respeita (idempotente)
 *
 * ⚠ POR QUE ISTO É UM MOTOR E NÃO TELA: o arranjo manual antigo (js/arqpranchasui.js, tabela de números) deixava o usuário colocar bloco em cima de bloco, e o
 *   gerador "voltava ao automático" sem dizer onde estava o erro. Aqui o erro é do conjunto e aparece na hora, com o nome do bloco e da folha.
 * Teste: tools/test-folhaseditor.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var x = Number(v); return v != null && v !== "" && isFinite(x) ? x : d; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function clonar(o) { return JSON.parse(JSON.stringify(o)); }
  var EPS = 1e-6, GAP = 15, MARGEM = 2, MAX_HIST = 100;

  /* NBR 16752: papel em mm (paisagem: largura x altura) */
  var FORMATOS = { A0: [1189, 841], A1: [841, 594], A2: [594, 420], A3: [420, 297], A4: [297, 210] };
  var ORDEM_FORMATOS = ["A0", "A1", "A2", "A3", "A4"];
  function formatoValido(f) { return !!FORMATOS[txt(f).toUpperCase()]; }
  /* a área útil de reserva (padrão RA: moldura 20 mm à esquerda e 10 nas outras, carimbo 180 x 115 que encolhe no A3/A4): o gerador injeta a REAL (areaDe) — esta só
     existe para o motor andar sozinho em teste e em disciplina que ainda não tem geometria própria */
  function areaPadrao(formato, orientacao) {
    var f = formatoValido(formato) ? txt(formato).toUpperCase() : "A1", p = FORMATOS[f], retrato = orientacao === "retrato";
    var W = retrato ? p[1] : p[0], H = retrato ? p[0] : p[1], k = { A0: 1, A1: 1, A2: 1, A3: 0.75, A4: 0.6 }[f], cw = 180 * k, ch = 115 * k;
    var a = retrato ? { w: r2(W - 20 - 10 - 6), h: r2(H - 20 - ch - 6) } : { w: r2(W - 20 - 10 - cw - 6), h: r2(H - 20 - 6) };
    return { w: a.w, h: a.h, carimbo: null };
  }

  /* ------------------------------------------------------------ geometria dos blocos */
  function rect(b) { return { x: b.x, y: b.y, w: b.w, h: b.h }; }
  function inter(a, b, g) { g = g || 0; return a.x < b.x + b.w + g - EPS && a.x + a.w > b.x - g + EPS && a.y < b.y + b.h + g - EPS && a.y + a.h > b.y - g + EPS; }
  function dentro(r, area, m) { return r.x >= m - EPS && r.y >= m - EPS && r.x + r.w <= area.w - m + EPS && r.y + r.h <= area.h - m + EPS; }

  /* ------------------------------------------------------------ o conjunto */
  function normalizar(c0) {
    var c = clonar(c0 || {}), seq = 0;
    c.versao = 1;
    c.folhas = arr(c.folhas).map(function (f) {
      var o = { id: txt(f.id) || ("folha-" + (++seq)), titulo: txt(f.titulo), formato: formatoValido(f.formato) ? txt(f.formato).toUpperCase() : "A1", orientacao: f.orientacao === "retrato" ? "retrato" : "paisagem", blocos: [] };
      o.blocos = arr(f.blocos).map(function (b) {
        return { id: txt(b.id), desenho: txt(b.desenho != null ? b.desenho : (b.titulo != null ? b.titulo : b.id)), x: num(b.x, 0), y: num(b.y, 0), w: Math.max(0, num(b.w, 0)), h: Math.max(0, num(b.h, 0)), escala: txt(b.escala), fixo: !!b.fixo };
      });
      return o;
    });
    return c;
  }
  function acharFolha(c, id) { for (var i = 0; i < c.folhas.length; i++) if (c.folhas[i].id === id) return i; return -1; }
  function acharBloco(c, id) { for (var i = 0; i < c.folhas.length; i++) for (var j = 0; j < c.folhas[i].blocos.length; j++) if (c.folhas[i].blocos[j].id === id) return { fi: i, bi: j, f: c.folhas[i], b: c.folhas[i].blocos[j] }; return null; }

  /* ------------------------------------------------------------ validação */
  function validar(c, areaDe, opc) {
    var o = opc || {}, m = o.margem != null ? o.margem : MARGEM, gap = o.gap != null ? o.gap : GAP, out = { ok: true, erros: [], avisos: [], porBloco: {}, porFolha: {} };
    function pb(id, msg) { (out.porBloco[id] = out.porBloco[id] || []).push(msg); }
    function pf(id, msg) { (out.porFolha[id] = out.porFolha[id] || []).push(msg); }
    function erro(tipo, f, blocos, msg) { out.erros.push({ tipo: tipo, folha: f.id, blocos: blocos, msg: msg }); blocos.forEach(function (id) { pb(id, msg); }); pf(f.id, msg); }
    c.folhas.forEach(function (f, i) {
      var a = areaDe(f.formato, f.orientacao), nome = "folha " + (i + 1) + " (" + f.formato + ")", ret = f.blocos.map(rect);
      f.blocos.forEach(function (b, bi) {
        if (!dentro(ret[bi], a, m)) erro("fora", f, [b.id], 'O bloco "' + b.desenho + '" está fora da área útil da ' + nome + " (" + r2(a.w) + " x " + r2(a.h) + " mm): arraste para dentro ou use um formato maior.");
        if (a.carimbo && inter(ret[bi], a.carimbo, 0)) erro("carimbo", f, [b.id], 'O bloco "' + b.desenho + '" invade o carimbo da ' + nome + ".");
        for (var j = bi + 1; j < f.blocos.length; j++) {
          var q = f.blocos[j];
          if (inter(ret[bi], ret[j], 0)) erro("sobreposicao", f, [b.id, q.id], 'Os blocos "' + b.desenho + '" e "' + q.desenho + '" estão um em cima do outro na ' + nome + ".");
          else if (inter(ret[bi], ret[j], gap - 0.01)) { var av = 'Os blocos "' + b.desenho + '" e "' + q.desenho + '" ficaram a menos de ' + gap + " mm um do outro na " + nome + "."; out.avisos.push({ tipo: "perto", folha: f.id, blocos: [b.id, q.id], msg: av }); }
        }
      });
    });
    out.ok = out.erros.length === 0;
    return out;
  }

  /* ------------------------------------------------------------ achar lugar livre numa folha */
  /* o primeiro canto livre (candidatos = encostado na margem e nas arestas dos blocos já postos, com o espaço mínimo); null se não há */
  function acharLugar(f, w, h, a, ignorarId, opc) {
    var o = opc || {}, m = o.margem != null ? o.margem : MARGEM, gap = o.gap != null ? o.gap : GAP;
    var outros = f.blocos.filter(function (b) { return b.id !== ignorarId; }), xs = [m], ys = [m];
    outros.forEach(function (b) { xs.push(r2(b.x + b.w + gap)); ys.push(r2(b.y + b.h + gap)); xs.push(r2(b.x)); ys.push(r2(b.y)); });
    xs.sort(function (p, q) { return p - q; }); ys.sort(function (p, q) { return p - q; });
    for (var yi = 0; yi < ys.length; yi++) for (var xi = 0; xi < xs.length; xi++) {
      var r = { x: xs[xi], y: ys[yi], w: w, h: h };
      if (!dentro(r, a, m)) continue;
      var livre = true;
      for (var k = 0; k < outros.length && livre; k++) if (inter(r, rect(outros[k]), gap - 0.01)) livre = false;
      if (a.carimbo && inter(r, a.carimbo, 0)) livre = false;
      if (livre) return { x: xs[xi], y: ys[yi] };
    }
    return null;
  }

  /* ------------------------------------------------------------ empacotador por prateleiras (reserva do "Reorganizar automático") */
  /* blocos: [{ id, w, h, ... }] na ordem de leitura; devolve { folhas: [[{ id, x, y }]], naoCabe: [ids] } — as folhas na ordem, cada uma na área de areaPorIndice(i) */
  function prateleiras(blocos, areaPorIndice, opc) {
    var o = opc || {}, m = o.margem != null ? o.margem : MARGEM, gap = o.gap != null ? o.gap : GAP, folhas = [], naoCabe = [];
    function nova() { var i = folhas.length; folhas.push({ a: areaPorIndice(i), itens: [], x: m, y: m, h: 0 }); return folhas[i]; }
    var lista = blocos.slice().sort(function (p, q) { return q.h - p.h || q.w - p.w; });
    nova();
    lista.forEach(function (b) {
      var colocado = false;
      for (var i = 0; i < folhas.length && !colocado; i++) {
        var f = folhas[i];
        if (f.x + b.w > f.a.w - m + EPS) { if (f.y + f.h + gap + b.h <= f.a.h - m + EPS && f.h > 0) { f.y = f.y + f.h + gap; f.x = m; f.h = 0; } }
        if (f.x + b.w <= f.a.w - m + EPS && f.y + b.h <= f.a.h - m + EPS) { f.itens.push({ id: b.id, x: r2(f.x), y: r2(f.y) }); f.x += b.w + gap; f.h = Math.max(f.h, b.h); colocado = true; }
      }
      if (!colocado) {
        var f2 = nova();
        if (b.w <= f2.a.w - 2 * m + EPS && b.h <= f2.a.h - 2 * m + EPS) { f2.itens.push({ id: b.id, x: m, y: m }); f2.x = m + b.w + gap; f2.h = b.h; }
        else { naoCabe.push(b.id); f2.itens.push({ id: b.id, x: m, y: m }); f2.x = f2.a.w; f2.h = b.h; }
      }
    });
    return { folhas: folhas.filter(function (f) { return f.itens.length; }).map(function (f) { return f.itens; }), naoCabe: naoCabe };
  }

  /* ------------------------------------------------------------ o editor */
  function criar(conjunto, opc) {
    var o = opc || {}, areaDe = typeof o.areaDe === "function" ? o.areaDe : areaPadrao, estado = normalizar(conjunto), original = clonar(estado);
    var desfaz = [], refaz = [], seqId = 0;
    var formatoBase = formatoValido(o.formatoBase) ? txt(o.formatoBase).toUpperCase() : (estado.folhas.length ? estado.folhas[0].formato : "A1");
    estado.folhas.forEach(function (f) { var mt = /^folha-(\d+)$/.exec(f.id); if (mt) seqId = Math.max(seqId, +mt[1]); });
    function area(f) { var a = areaDe(f.formato, f.orientacao) || areaPadrao(f.formato, f.orientacao); return a; }
    function opcV() { return { margem: o.margem, gap: o.gap }; }
    function entrar(novo) { desfaz.push(clonar(estado)); if (desfaz.length > MAX_HIST) desfaz.shift(); refaz = []; estado = novo; }
    function ok(extra) { var r = { ok: true }; Object.keys(extra || {}).forEach(function (k) { r[k] = extra[k]; }); return r; }
    function falha(msg) { return { ok: false, erro: msg }; }

    var ed = {
      conjunto: function () { return clonar(estado); },
      area: function (folhaId) { var i = acharFolha(estado, folhaId); return i < 0 ? null : area(estado.folhas[i]); },
      validar: function () { return validar(estado, areaDe, opcV()); },
      pode: function () { return { desfazer: desfaz.length > 0, refazer: refaz.length > 0 }; },
      alterado: function () { return JSON.stringify(estado) !== JSON.stringify(original); },

      trocarFormato: function (folhaId, formato) {
        var F = txt(formato).toUpperCase(), i = acharFolha(estado, folhaId);
        if (i < 0) return falha("A folha " + folhaId + " não existe.");
        if (!formatoValido(F)) return falha('Formato "' + formato + '" inválido: use A0, A1, A2, A3 ou A4.');
        if (estado.folhas[i].formato === F) return ok({ aviso: "A folha já está em " + F + "." });
        var n = clonar(estado), f = n.folhas[i], a = areaDe(F, f.orientacao) || areaPadrao(F, f.orientacao), movidos = [], semLugar = [];
        f.formato = F;
        /* os que continuam inteiros na área nova ficam onde estão; os demais saem e são reacomodados no espaço que sobra (maiores primeiro) */
        var fora = f.blocos.filter(function (b) { return !dentro(rect(b), a, o.margem != null ? o.margem : MARGEM) || (a.carimbo && inter(rect(b), a.carimbo, 0)); });
        var ficam = f.blocos.filter(function (b) { return fora.indexOf(b) < 0; });
        f.blocos = ficam;
        fora.sort(function (p, q) { return q.h * q.w - p.h * p.w; }).forEach(function (b) {
          var p = acharLugar(f, b.w, b.h, a, b.id, opcV());
          if (p) { b.x = p.x; b.y = p.y; movidos.push(b.desenho); } else semLugar.push(b.desenho);
          f.blocos.push(b);
        });
        /* a folha mudou de papel: os blocos dela ficam FIXADOS (o número e o formato só valem se a posição também valer na próxima geração) */
        f.blocos.forEach(function (b) { b.fixo = true; });
        entrar(n);
        var av = [];
        if (movidos.length) av.push(movidos.length + " bloco(s) reacomodado(s) no espaço livre da " + F + ".");
        if (semLugar.length) av.push("Sem lugar na " + F + " para: " + semLugar.join(", ") + " (o erro aparece na folha; use um formato maior ou mova para outra folha).");
        return ok({ aviso: av.join(" "), reacomodados: movidos, semLugar: semLugar });
      },

      moverBloco: function (blocoId, folhaDestinoId, x, y) {
        var n = clonar(estado), ach = acharBloco(n, blocoId), di = acharFolha(n, folhaDestinoId);
        if (!ach) return falha("O bloco " + blocoId + " não existe.");
        if (di < 0) return falha("A folha " + folhaDestinoId + " não existe.");
        var dest = n.folhas[di], a = areaDe(dest.formato, dest.orientacao) || areaPadrao(dest.formato, dest.orientacao), b = ach.b, m = o.margem != null ? o.margem : MARGEM;
        var sx = x, sy = y;
        if (sx == null || sy == null || !isFinite(+sx) || !isFinite(+sy)) {
          var p = acharLugar(dest, b.w, b.h, a, b.id, opcV());
          if (!p) return falha('Não há lugar livre para "' + b.desenho + '" na folha ' + (di + 1) + " (" + dest.formato + "): troque o formato dela ou escolha outra folha.");
          sx = p.x; sy = p.y;
        }
        ach.f.blocos.splice(ach.bi, 1);
        b.x = r2(+sx); b.y = r2(+sy); b.fixo = true;
        dest.blocos.push(b);
        entrar(n);
        return ok({ folha: di + 1, x: b.x, y: b.y });
      },

      criarFolha: function (formato) {
        var n = clonar(estado), F = formatoValido(formato) ? txt(formato).toUpperCase() : (n.folhas.length ? n.folhas[n.folhas.length - 1].formato : formatoBase);
        var id; do { id = "folha-" + (++seqId); } while (acharFolha(n, id) >= 0);
        n.folhas.push({ id: id, titulo: "", formato: F, orientacao: "paisagem", blocos: [] });
        entrar(n);
        return ok({ id: id, numero: n.folhas.length });
      },
      apagarFolha: function (folhaId) {
        var i = acharFolha(estado, folhaId);
        if (i < 0) return falha("A folha " + folhaId + " não existe.");
        if (estado.folhas[i].blocos.length) return falha("A folha " + (i + 1) + " tem " + estado.folhas[i].blocos.length + " bloco(s): mova-os para outra folha antes de apagar (só folha vazia se apaga).");
        var n = clonar(estado); n.folhas.splice(i, 1); entrar(n);
        return ok({});
      },
      reordenar: function (folhaId, posicao) {
        var i = acharFolha(estado, folhaId), p = Math.round(+posicao) - 1;
        if (i < 0) return falha("A folha " + folhaId + " não existe.");
        if (!isFinite(p) || p < 0 || p >= estado.folhas.length) return falha("Posição inválida: use de 1 a " + estado.folhas.length + ".");
        if (p === i) return ok({ aviso: "A folha já está nessa posição." });
        var n = clonar(estado), f = n.folhas.splice(i, 1)[0]; n.folhas.splice(p, 0, f);
        /* a ordem é parte do que o gerador respeita: a folha movida fixa seus blocos (o número dela mudou) */
        f.blocos.forEach(function (b) { b.fixo = true; });
        entrar(n);
        return ok({ numero: p + 1 });
      },
      fixar: function (blocoId) { return mudaFixo(blocoId, true); },
      soltar: function (blocoId) { return mudaFixo(blocoId, false); },

      reorganizarAuto: function () {
        var n = clonar(estado), todos = [];
        n.folhas.forEach(function (f) { f.blocos.forEach(function (b) { b.fixo = false; todos.push(b); }); });
        if (!todos.length) return ok({ aviso: "Não há blocos para reorganizar." });
        var ids = {}; todos.forEach(function (b) { ids[b.id] = b; });
        var res = null;
        if (typeof o.empacotar === "function") { try { res = o.empacotar(n); } catch (e) { return falha("O arranjo automático do gerador falhou: " + (e && e.message ? e.message : String(e))); } }
        if (res && res.folhas) {
          /* o gerador devolveu o arranjo pronto: troca o conjunto inteiro (as folhas podem mudar de número e de quantidade) */
          var nn = normalizar(res); entrar(nn); return ok({ aviso: "Arranjo automático do gerador aplicado: " + nn.folhas.length + " folha(s)." });
        }
        var fmts = n.folhas.map(function (f) { return f.formato; }), ult = fmts.length ? fmts[fmts.length - 1] : formatoBase;
        var pk = prateleiras(todos.slice().sort(function (p, q) { return (p.y - q.y) || (p.x - q.x); }), function (i) { var F = fmts[i] || ult; return areaDe(F, "paisagem") || areaPadrao(F, "paisagem"); }, opcV());
        var folhas = pk.folhas.map(function (itens, i) {
          var F = fmts[i] || ult, base = n.folhas[i] || { id: "folha-" + (++seqId), titulo: "", orientacao: "paisagem" };
          return { id: base.id, titulo: base.titulo, formato: F, orientacao: base.orientacao || "paisagem", blocos: itens.map(function (q) { var b = ids[q.id]; b.x = q.x; b.y = q.y; return b; }) };
        });
        n.folhas = folhas; entrar(n);
        return ok({ aviso: pk.naoCabe.length ? "Não cabem em nenhum formato escolhido: " + pk.naoCabe.join(", ") : "", naoCabe: pk.naoCabe });
      },

      desfazer: function () { if (!desfaz.length) return falha("Nada para desfazer."); refaz.push(clonar(estado)); estado = desfaz.pop(); return ok({}); },
      refazer: function () { if (!refaz.length) return falha("Nada para refazer."); desfaz.push(clonar(estado)); estado = refaz.pop(); return ok({}); },

      /* o que o gerador respeita na próxima geração. Fixados: os que o usuário marcou, moveu ou que estão em folha cujo formato/posição mudou (senão o número deixa de valer) */
      paraConfig: function () {
        var fixos = {}, formatos = {};
        estado.folhas.forEach(function (f, i) {
          var fo = acharFolha(original, f.id), mudouPos = fo !== i, mudouFmt = fo < 0 || original.folhas[fo].formato !== f.formato;
          if (f.formato !== formatoBase) formatos[String(i + 1)] = f.formato;
          f.blocos.forEach(function (b) {
            var ao = acharBloco(original, b.id), mudou = !ao || ao.fi !== i || Math.abs(ao.b.x - b.x) > 0.005 || Math.abs(ao.b.y - b.y) > 0.005;
            if (b.fixo || mudou || mudouPos || mudouFmt) fixos[b.id] = { folha: i + 1, x: r2(b.x), y: r2(b.y) };
          });
          /* ⚠ folha FORA do formato base precisa de ao menos um bloco fixado: é o fixo que amarra o formato ao NÚMERO da folha no gerador (formatosFolha["2"] vale para a
             folha que tem bloco fixado em 2). Sem nenhum, o formato cairia numa folha qualquer. NÃO fixar o resto à toa: salvar de novo o que o gerador devolveu tem de dar o mesmo conjunto. */
          if (f.formato !== formatoBase && f.blocos.length && !f.blocos.some(function (b) { return fixos[b.id] && fixos[b.id].folha === i + 1; })) f.blocos.forEach(function (b) { fixos[b.id] = { folha: i + 1, x: r2(b.x), y: r2(b.y) }; });
        });
        return { fixos: fixos, formatosFolha: formatos, arranjoFormato: formatoBase };
      }
    };
    function mudaFixo(blocoId, valor) {
      var ach = acharBloco(estado, blocoId);
      if (!ach) return falha("O bloco " + blocoId + " não existe.");
      if (ach.b.fixo === valor) return ok({ aviso: valor ? "O bloco já está fixado." : "O bloco já está solto." });
      var n = clonar(estado), a2 = acharBloco(n, blocoId); a2.b.fixo = valor; entrar(n);
      return ok({});
    }
    return ed;
  }

  var FolhasEditor = { VERSAO: 1, FORMATOS: FORMATOS, ORDEM_FORMATOS: ORDEM_FORMATOS, GAP: GAP, MARGEM: MARGEM, criar: criar, validar: validar, normalizar: normalizar, areaPadrao: areaPadrao, acharLugar: acharLugar, prateleiras: prateleiras, formatoValido: formatoValido };
  global.FolhasEditor = FolhasEditor;
  if (typeof module !== "undefined" && module.exports) module.exports = FolhasEditor;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
