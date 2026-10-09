/* =====================================================================
 * bimgrupos.js — GRUPOS DE MODELO (motor puro, ES5, Node-testável).
 *
 * Fase P10, Frente B do plano do BIM (Modificar › Criar
 * grupo, Colar alinhado aos níveis selecionados, Desagrupar, Editar grupo).
 * O uso que paga a frente: o BANHEIRO TIPO e o APARTAMENTO TIPO — modelar
 * uma vez e colar nos pavimentos; mudar o grupo muda todos.
 *
 * COMO FICA NA LISTA DE OPERAÇÕES (sem lista dentro de lista — a nuvem
 * recusa; forma conferida em BimEdit.opP10Valida, gancho "P10"):
 *   {op:"grupo", acao:"criar", id:"G1", nome:"Banheiro", membros:[id…], nivelId?}
 *       as peças (já criadas) passam a ser o grupo — a instância ORIGINAL;
 *   {op:"grupo", acao:"colar", id:"G1", inst:"G1.2", dx?, dz?, dy?, nivelId?}
 *       mais uma instância: deslocada (dx, dz) e, com nivelId, no NÍVEL
 *       (Colar alinhado aos níveis selecionados = uma op por nível, num lote);
 *   {op:"grupo", acao:"editar", id, nome?, membros?}   renomear / pôr e tirar peças;
 *   {op:"grupo", acao:"moverInst", id, inst, dx, dz}   onde a instância fica;
 *   {op:"grupo", acao:"apagarInst", id, inst}          tira uma instância;
 *   {op:"grupo", acao:"desagrupar", id, inst?}         ver abaixo;
 *   {op:"grupo", acao:"apagar", id}                    o grupo sai, as peças ficam.
 *
 * EDITAR GRUPO VALE PARA TODAS AS INSTÂNCIAS — por construção: as peças das
 * instâncias coladas NÃO estão na lista; são CÓPIAS refeitas a cada replay a
 * partir das peças do grupo (gancho `antesNiveis` do BimEdit.aplicar, antes
 * das restrições por nível — a cópia no pavimento 2 vai para a altura dele).
 * Mexer numa peça do grupo (tipo, altura, comentário, orçamento) muda todas
 * as cópias. A cópia tem id "<inst>:<id da peça>" (ex.: "G1.2:w3"); uma
 * edição feita NA CÓPIA pela tela é redirecionada à peça do grupo
 * (redirecionar — é o "Editar grupo").
 *
 * DESAGRUPAR: numa instância colada, as cópias dela viram
 * peças SOLTAS no ponto da lista (fotografadas como estão nessa hora) e
 * deixam de seguir o grupo; no grupo inteiro (sem inst), todas as cópias
 * viram soltas e o grupo deixa de existir — as peças originais ficam.
 *
 * O que entra em grupo: peças do editor (parede, laje, pilar, viga, escada,
 * guarda-corpo), coberturas e famílias (a porta/janela hospedada vai junto
 * se a parede dela é do grupo). Forro, ambiente e volume livre ficam fora
 * nesta fase (aviso no estado).
 *
 * Teste: node tools/test-bimgrupos.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  var SEP = ":";

  /* mapa de níveis [{id, elevacao}] → {id: elev} e a lista em ordem de altura */
  function niveisMapa(niveis) {
    var m = {}; arr(niveis).forEach(function (n) { if (n && n.id != null && fin(Number(n.elevacao))) m[String(n.id)] = Number(n.elevacao); });
    return m;
  }
  function niveisOrdem(niveis) {
    return arr(niveis).filter(function (n) { return n && n.id != null && fin(Number(n.elevacao)); }).slice().sort(function (a, b) { return Number(a.elevacao) - Number(b.elevacao); }).map(function (n) { return String(n.id); });
  }
  /* o nível da peça (P1-B: nivelBase; v:1: nivelId) */
  function nivelDe(c) { return c ? (c.nivelBase != null && c.nivelBase !== "" ? String(c.nivelBase) : (c.nivelId != null && c.nivelId !== "" ? String(c.nivelId) : null)) : null; }

  /* sobe/desce a geometria ABSOLUTA da peça (a que vale sem os níveis) */
  function deslocarY(c, dy) {
    if (!c || !fin(dy) || Math.abs(dy) < 1e-12) return c;
    if (fin(c.cy)) c.cy = r6(c.cy + dy);
    if (fin(c.y)) c.y = r6(c.y + dy);                       /* família livre */
    if (fin(c.basePilar)) c.basePilar = r6(c.basePilar + dy);
    if (fin(c.topoViga)) c.topoViga = r6(c.topoViga + dy);
    if (Array.isArray(c.planos)) {                            /* cobertura */
      if (fin(c.base)) c.base = r6(c.base + dy);
      if (fin(c.cumeeira)) c.cumeeira = r6(c.cumeeira + dy);
      c.planos.forEach(function (p) { if (fin(p.cy)) p.cy = r6(p.cy + dy); });
    }
    if (c.escada && c.escada.par && fin(c.escada.par.base)) c.escada.par.base = r6(c.escada.par.base + dy);
    if (c.guarda) arr(c.guarda.pts).forEach(function (p) { if (fin(p.y)) p.y = r6(p.y + dy); });
    return c;
  }
  /* anda no plano (x, z): caixa (cx/cz + contorno, escada, caminho), cobertura, família livre */
  function deslocarXZ(c, dx, dz) {
    if (!c || (!dx && !dz)) return c;
    var A = dep("BimArq", "./bimarq.js");
    if (Array.isArray(c.planos)) {
      ["x0", "x1"].forEach(function (k) { if (fin(c[k])) c[k] = r6(c[k] + dx); });
      ["z0", "z1"].forEach(function (k) { if (fin(c[k])) c[k] = r6(c[k] + dz); });
      c.planos.forEach(function (p) { p.cx = r6(num(p.cx, 0) + dx); p.cz = r6(num(p.cz, 0) + dz); });
      return c;
    }
    if (c.famId != null) { if (!c.host) { c.x = r6(num(c.x, 0) + dx); c.z = r6(num(c.z, 0) + dz); } return c; }
    c.cx = r6(num(c.cx, 0) + dx); c.cz = r6(num(c.cz, 0) + dz);
    if (A && A.transladar) A.transladar(c, dx, dz);
    return c;
  }

  /* o deslocamento vertical da instância e a troca de nível de cada peça */
  function nivelAlvo(g, inst, NIV) {
    var M = niveisMapa(NIV);
    if (inst.nivelId != null && g.nivelId != null && M.hasOwnProperty(String(inst.nivelId)) && M.hasOwnProperty(String(g.nivelId)))
      return { dy: M[String(inst.nivelId)] - M[String(g.nivelId)], alvo: String(inst.nivelId), base: String(g.nivelId) };
    return { dy: num(inst.dy, 0), alvo: null, base: null };
  }
  /* a CÓPIA de uma peça para a instância: id novo, deslocada, no nível de lá.
     Restrição superior: o nível que fica o MESMO número de níveis acima
     (Térreo→Superior no grupo = Superior→Cobertura colado no Superior); se
     não existe, a peça fica com a altura não conectada que tinha. */
  function copiar(c, g, inst, NIV, novoId) {
    var k = clone(c), na = nivelAlvo(g, inst, NIV);
    k.id = novoId;
    delete k.marca;                      /* a marca não se repete: a cópia ganha a automática */
    delete k._grupo;
    deslocarXZ(k, num(inst.dx, 0), num(inst.dz, 0));
    deslocarY(k, na.dy);
    if (na.alvo != null && nivelDe(k) != null) {
      var ordem = niveisOrdem(NIV), ib = ordem.indexOf(nivelDe(k)), ia = ordem.indexOf(na.alvo), ig = ordem.indexOf(na.base);
      var novoBase = ib >= 0 && ia >= 0 && ig >= 0 ? ordem[ib + (ia - ig)] : null;
      if (novoBase != null) { if (k.nivelBase != null) k.nivelBase = novoBase; if (k.nivelId != null) k.nivelId = novoBase; }
      if (k.restricaoSuperior != null && k.restricaoSuperior !== "") {
        var is = ordem.indexOf(String(k.restricaoSuperior)), ns = is >= 0 && ia >= 0 && ig >= 0 ? ordem[is + (ia - ig)] : null;
        if (ns != null) k.restricaoSuperior = ns;
        else { if (!(fin(k.alturaNaoConectada) && k.alturaNaoConectada >= 0.1)) k.alturaNaoConectada = num(k.altura, 2.8); k.restricaoSuperior = null; }
      }
    }
    k._grupo = { id: g.id, inst: inst.id, membro: String(c.id) };
    return k;
  }
  /* a peça de id `id` nos mapas do replay: { mapa, ordem, el } */
  function acharNoCtx(ctx, id) {
    var s = String(id), L = [["caixas", "ordem"], ["fams", "ordemF"], ["cobs", "ordemC"]];
    for (var i = 0; i < L.length; i++) { var m = ctx[L[i][0]] || {}; if (m[s]) return { mapa: L[i][0], ordem: L[i][1], el: m[s] }; }
    return null;
  }
  function estadoGrupos(ctx) { return ctx.ext.grupos || (ctx.ext.grupos = { porId: {}, ordem: [] }); }

  /* põe as cópias de UMA instância nos mapas do replay (ids "<inst>:<peça>") */
  function materializarInst(ctx, g, inst, NIV, marcar) {
    var criados = [], remap = {};
    g.membros.forEach(function (mid) { if (!inst.excluidos || !inst.excluidos[mid]) remap[mid] = inst.id + SEP + mid; });
    g.membros.forEach(function (mid) {
      if (!remap[mid]) return;
      var a = acharNoCtx(ctx, mid); if (!a) return;
      var nid = remap[mid], k = copiar(a.el, g, inst, NIV, nid);
      /* hospedada: a cópia vai na cópia da parede (sem a parede no grupo, não vai) */
      if (k.host && k.host.id != null) { if (!remap[String(k.host.id)]) return; k.host.id = remap[String(k.host.id)]; }
      if (k.guarda && k.guarda.host && k.guarda.host.id != null && remap[String(k.guarda.host.id)]) k.guarda.host.id = remap[String(k.guarda.host.id)];
      if (marcar === false) delete k._grupo;
      ctx[a.mapa][nid] = k;
      if (ctx[a.ordem].indexOf(nid) < 0) ctx[a.ordem].push(nid);
      criados.push(nid);
    });
    return criados;
  }

  var BimGrupos = {
    SEP: SEP,
    deslocarY: deslocarY, deslocarXZ: deslocarXZ,

    /* --------------------------------------------- ops (as da tela) */
    /* criar: o grupo com as peças selecionadas. O nível do grupo é o da 1ª peça presa a nível. */
    opCriar: function (estado, ids, nome, gid) {
      var porId = {}, alvo = [], fora = [];
      arr(estado && estado.caixas).concat(arr(estado && estado.coberturas)).concat(arr(estado && estado.familias)).forEach(function (c) { if (c && c.id != null) porId[String(c.id)] = c; });
      arr(ids).map(String).forEach(function (id) {
        var c = porId[id];
        if (!c) { fora.push(id); return; }
        if (c._grupo && c._grupo.inst !== c._grupo.id) { fora.push(id); return; }     /* cópia de outra instância */
        if (alvo.indexOf(id) < 0) alvo.push(id);
      });
      /* as portas e janelas das paredes vão junto (a hospedada segue a hospedeira) */
      arr(estado && estado.familias).forEach(function (f) { if (f && f.host && alvo.indexOf(String(f.host.id)) >= 0 && alvo.indexOf(String(f.id)) < 0) alvo.push(String(f.id)); });
      if (!alvo.length) return { ok: false, motivo: "Selecione peças criadas no OrçaPRO (parede, laje, pilar, viga, escada, guarda-corpo, cobertura ou família)." };
      if (!txt(nome).trim()) return { ok: false, motivo: "O grupo precisa de nome." };
      var usados = {}; arr(estado && estado.grupos).forEach(function (g) { usados[g.id] = 1; });
      var id = gid || (function () { var n = 1; while (usados["G" + n]) n++; return "G" + n; })();
      var nivel = null;
      alvo.some(function (i) { var c = porId[i]; nivel = nivelDe(c); return nivel != null; });
      var op = { op: "grupo", acao: "criar", id: id, nome: txt(nome).trim().slice(0, 80), membros: alvo };
      if (nivel != null) op.nivelId = nivel;
      return { ok: true, op: op, ids: alvo, fora: fora };
    },
    /* COLAR ALINHADO AOS NÍVEIS SELECIONADOS: uma instância por nível (o grupo
       no nível dele não se repete), num lote — um Ctrl+Z tira todas */
    opColarNiveis: function (estado, gid, niveisIds, novoId) {
      var g = arr(estado && estado.grupos).filter(function (x) { return x.id === gid; })[0];
      if (!g) return { ok: false, motivo: "Grupo não encontrado: " + gid + "." };
      if (g.nivelId == null) return { ok: false, motivo: "O grupo \"" + g.nome + "\" não está preso a nível: cole com Copiar/Mover, ou prenda as peças a um nível antes." };
      var usados = {}; arr(g.instancias).forEach(function (i) { usados[i.id] = 1; });
      var n = 2, ops = [];
      arr(niveisIds).map(String).forEach(function (nv) {
        if (nv === String(g.nivelId)) return;
        while (usados[g.id + "." + n]) n++;
        var inst = g.id + "." + n; usados[inst] = 1;
        ops.push({ op: "grupo", acao: "colar", id: g.id, inst: inst, nivelId: nv, dx: 0, dz: 0 });
      });
      if (!ops.length) return { ok: false, motivo: "Escolha pelo menos um nível diferente do nível do grupo." };
      var op = ops.length === 1 ? ops[0] : { op: "lote", id: typeof novoId === "function" ? String(novoId()) : "colar-" + g.id + "-" + ops.length, origem: "colar-niveis", ops: ops };
      return { ok: true, op: op, instancias: ops.map(function (o) { return o.inst; }) };
    },
    /* a op de desagrupar o que está selecionado: cópia → a instância dela; peça do grupo → o grupo */
    opDesagrupar: function (estado, id) {
      var info = BimGrupos.deQuem(estado, id);
      if (!info) return { ok: false, motivo: "A peça não é de grupo." };
      if (info.inst !== info.grupo) return { ok: true, op: { op: "grupo", acao: "desagrupar", id: info.grupo, inst: info.inst } };
      return { ok: true, op: { op: "grupo", acao: "desagrupar", id: info.grupo } };
    },
    /* de que grupo/instância é a peça (null = solta) */
    deQuem: function (estado, id) {
      var s = String(id), l = arr(estado && estado.caixas).concat(arr(estado && estado.coberturas)).concat(arr(estado && estado.familias));
      for (var i = 0; i < l.length; i++) if (l[i] && String(l[i].id) === s && l[i]._grupo) return { grupo: l[i]._grupo.id, inst: l[i]._grupo.inst, membro: l[i]._grupo.membro };
      return null;
    },

    /* EDITAR GRUPO pela cópia: a op que a tela manda sobre uma CÓPIA vai para a
       peça do grupo (todas as instâncias mudam). mover/apagar de uma cópia
       viram mover/tirar a INSTÂNCIA. Devolve a op (a mesma, se não é cópia). */
    redirecionar: function (o, estado) {
      if (!o || !estado) return o;
      function mapId(id) { var q = BimGrupos.deQuem(estado, id); return q && q.inst !== q.grupo ? q : null; }
      if (o.op === "lote" && Array.isArray(o.ops)) { var l = clone(o); l.ops = l.ops.map(function (x) { return BimGrupos.redirecionar(x, estado); }); return l; }
      if (o.op === "ajustarTipo" && Array.isArray(o.ids)) {
        var r = clone(o); r.ids = o.ids.map(function (id) { var q = mapId(id); return q ? q.membro : id; }).filter(function (x, i, a) { return a.indexOf(x) === i; }); return r;
      }
      if (o.id == null) return o;
      var q = mapId(o.id); if (!q) return o;
      if (o.op === "apagar") return { op: "grupo", acao: "apagarInst", id: q.grupo, inst: q.inst };
      if (o.op === "mover" && fin(o.cx) && fin(o.cz)) {
        var g = arr(estado.grupos).filter(function (x) { return x.id === q.grupo; })[0], i0 = g && arr(g.instancias).filter(function (x) { return x.id === q.inst; })[0];
        var copia = arr(estado.caixas).concat(arr(estado.familias)).filter(function (c) { return String(c.id) === String(o.id); })[0];
        if (!i0 || !copia) return o;
        var cx = fin(copia.cx) ? copia.cx : num(copia.x, 0), cz = fin(copia.cz) ? copia.cz : num(copia.z, 0);
        return { op: "grupo", acao: "moverInst", id: q.grupo, inst: q.inst, dx: r6(num(i0.dx, 0) + o.cx - cx), dz: r6(num(i0.dz, 0) + o.cz - cz) };
      }
      var r2 = clone(o); r2.id = q.membro; return r2;
    },

    /* --------------------------------------------- replay (BimEdit.estender) */
    _aplicar: function (o, ctx) {
      /* mover/apagar uma CÓPIA pelo editor (Mover, Delete): a cópia não está nos mapas
         na hora da op (nasce no fim do replay) — move a INSTÂNCIA / tira a instância,
         como o redirecionar faz para a tela */
      if (o && (o.op === "mover" || o.op === "apagar") && typeof o.id === "string" && o.id.indexOf(SEP) > 0 && ctx.ext.grupos) {
        var iidC = o.id.slice(0, o.id.indexOf(SEP)), midC = o.id.slice(o.id.indexOf(SEP) + 1), GC = ctx.ext.grupos, gC = null;
        GC.ordem.forEach(function (k) { if (GC.porId[k].inst[iidC]) gC = GC.porId[k]; });
        if (!gC || gC.membros.indexOf(midC) < 0) return false;
        if (o.op === "apagar") { delete gC.inst[iidC]; gC.ordemInst = gC.ordemInst.filter(function (x) { return x !== iidC; }); return true; }
        var aC = acharNoCtx(ctx, midC); if (!aC || !fin(o.cx) || !fin(o.cz)) return false;
        var el = aC.el, mx = Array.isArray(el.planos) ? (num(el.x0, 0) + num(el.x1, 0)) / 2 : (el.famId != null ? num(el.x, 0) : num(el.cx, 0)),
            mz = Array.isArray(el.planos) ? (num(el.z0, 0) + num(el.z1, 0)) / 2 : (el.famId != null ? num(el.z, 0) : num(el.cz, 0));
        if (el.famId != null && el.host) return false;   /* a hospedada anda com a parede */
        gC.inst[iidC].dx = r6(o.cx - mx); gC.inst[iidC].dz = r6(o.cz - mz);
        return true;
      }
      if (!o || o.op !== "grupo") return false;
      var E = dep("BimEdit", "./bimedit.js");
      if (E && E.opP10Valida && !E.opP10Valida(o)) return false;
      var G = estadoGrupos(ctx), gid = String(o.id), g = G.porId[gid];
      if (o.acao === "criar") {
        var membros = arr(o.membros).map(String).filter(function (id, i, a) { return a.indexOf(id) === i && !!acharNoCtx(ctx, id); });
        if (!membros.length) return false;
        G.porId[gid] = { id: gid, nome: txt(o.nome).trim().slice(0, 80), membros: membros, nivelId: o.nivelId != null ? String(o.nivelId) : null, inst: {}, ordemInst: [] };
        if (G.ordem.indexOf(gid) < 0) G.ordem.push(gid);
        return true;
      }
      if (!g) return false;
      if (o.acao === "colar") {
        var iid = String(o.inst);
        if (iid === gid) return false;
        g.inst[iid] = { id: iid, dx: num(o.dx, 0), dz: num(o.dz, 0), dy: num(o.dy, 0), nivelId: o.nivelId != null ? String(o.nivelId) : null, excluidos: {} };
        if (g.ordemInst.indexOf(iid) < 0) g.ordemInst.push(iid);
        return true;
      }
      if (o.acao === "editar") {
        if (o.nome != null) g.nome = txt(o.nome).trim().slice(0, 80) || g.nome;
        if (o.membros != null) { var m2 = arr(o.membros).map(String).filter(function (id, i, a) { return a.indexOf(id) === i && !!acharNoCtx(ctx, id); }); if (!m2.length) return false; g.membros = m2; }
        return true;
      }
      if (o.acao === "moverInst") { var im = g.inst[String(o.inst)]; if (!im) return false; im.dx = num(o.dx, 0); im.dz = num(o.dz, 0); return true; }
      if (o.acao === "apagarInst") { if (!g.inst[String(o.inst)]) return false; delete g.inst[String(o.inst)]; g.ordemInst = g.ordemInst.filter(function (x) { return x !== String(o.inst); }); return true; }
      if (o.acao === "apagar") { delete G.porId[gid]; G.ordem = G.ordem.filter(function (x) { return x !== gid; }); return true; }
      if (o.acao === "desagrupar") {
        /* as cópias viram peças SOLTAS agora (fotografadas como estão nesta hora) */
        var NIV = ctx.niveis || null;
        var alvos = o.inst != null ? [String(o.inst)] : g.ordemInst.slice();
        if (o.inst != null && !g.inst[String(o.inst)]) return false;
        alvos.forEach(function (iid2) { materializarInst(ctx, g, g.inst[iid2], NIV, false); delete g.inst[iid2]; });
        g.ordemInst = g.ordemInst.filter(function (x) { return alvos.indexOf(x) < 0; });
        if (o.inst == null) { delete G.porId[gid]; G.ordem = G.ordem.filter(function (x) { return x !== gid; }); }
        return true;
      }
      return false;
    },
    /* depois das ops e ANTES das restrições por nível: as cópias das instâncias */
    _antesNiveis: function (ctx, NIV) {
      var G = ctx.ext.grupos; if (!G) return;
      G.ordem.forEach(function (gid) {
        var g = G.porId[gid];
        g.membros = g.membros.filter(function (mid) { return !!acharNoCtx(ctx, mid); });   /* peça apagada sai do grupo */
        g.membros.forEach(function (mid) { var a = acharNoCtx(ctx, mid); if (a) a.el._grupo = { id: gid, inst: gid, membro: mid }; });
        g.ordemInst.forEach(function (iid) { g.inst[iid].ids = materializarInst(ctx, g, g.inst[iid], NIV, true); });
      });
    },
    _fim: function (ctx, out) {
      var G = ctx.ext.grupos; if (!G) return;
      out.grupos = G.ordem.map(function (gid) {
        var g = G.porId[gid];
        return { id: gid, nome: g.nome, membros: g.membros.slice(), nivelId: g.nivelId,
                 instancias: g.ordemInst.map(function (iid) { var i = g.inst[iid]; return { id: iid, nivelId: i.nivelId, dx: i.dx, dz: i.dz, dy: i.dy, ids: arr(i.ids).slice() }; }) };
      });
      out.gruposAvisos = [];
      out.grupos.forEach(function (g) { if (!g.membros.length) out.gruposAvisos.push("Grupo \"" + g.nome + "\" ficou sem peças (todas apagadas): use Limpar não utilizados."); });
      if (!out.gruposAvisos.length) delete out.gruposAvisos;
    }
  };

  var E0 = dep("BimEdit", "./bimedit.js");
  if (E0 && E0.estender) E0.estender({
    nome: "P10-grupos",
    aplicar: function (o, ctx) {
      /* o desagrupar precisa dos níveis na hora da op (o replay os guarda no ctx) */
      return BimGrupos._aplicar(o, ctx);
    },
    antesNiveis: function (ctx, NIV) { BimGrupos._antesNiveis(ctx, NIV); },
    fim: function (ctx, out) { BimGrupos._fim(ctx, out); },
    valida: function (o) { if (!o || o.op !== "grupo") return undefined; var E = dep("BimEdit", "./bimedit.js"); return E && E.opP10Valida ? E.opP10Valida(o) : true; }
  });

  global.BimGrupos = BimGrupos;
  if (typeof module !== "undefined" && module.exports) module.exports = BimGrupos;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
