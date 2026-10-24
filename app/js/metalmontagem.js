/* =====================================================================
 * metalmontagem.js — METÁLICA: PLANO DE MONTAGEM AUTOMÁTICO (motor puro, ES5)
 *
 * Pedido (23/10/2026, "deixa pronta a parte de estrutura metálica … e o
 * içamento pode finalizar"): a estrutura de aço desenhada vira, sozinha, a
 * lista de IÇAMENTOS do plano de içamento (js/icarplano.js), já na ordem de
 * montagem. Daí em diante é o caminho que já existe e já é conferido:
 *   o agente do equipamento (js/icaragente.js) escolhe guindaste/munck e
 *   posição pela TABELA DE CARGA (capacidade × raio × altura do gancho, com
 *   contingência, fator dinâmico e moitão — as premissas do plano), o plano
 *   calcula o TEMPO de cada içamento e o orçamento por peso
 *   (js/metalorc.js) cobra as HORAS do plano no equipamento SINAPI
 *   equivalente. Aqui NADA se grava e NENHUM número de capacidade nasce:
 *   este módulo só agrupa e ordena.
 *
 * COMO AGRUPA (premissas de método, impressas no plano e editáveis):
 *   1. CONJUNTO DE FÁBRICA = 1 içamento: a peça principal e tudo o que é
 *      soldado nela (js/metalfab.js `numerar().conjuntos` — a placa de base
 *      soldada sobe com o pilar).
 *   2. ACESSÓRIO SOLTO de ligação (chapa, gusset, clip, tala, parafuso,
 *      porca, arruela) NÃO tem içamento próprio: o peso dele entra no
 *      içamento da peça principal mais próxima (vai junto, na mesma
 *      viagem do gancho) — nunca some do peso.
 *   3. CHUMBADOR fica FORA: é concretado com a fundação, antes da montagem.
 *   4. PEÇAS LEVES DO VÃO (terças, travessas, tirantes, correntes,
 *      contraventos) sobem EM FEIXE por vão, por função e por lado (cada
 *      água) — o feixe é largado na estrutura e distribuído à mão. Sem o
 *      feixe (opção `feixe: false`), uma peça por içamento.
 *
 * COMO ORDENA (a regra da montagem estável):
 *   - as LINHAS de montagem são as filas de pilares na direção em que elas
 *     se repetem (a direção com MAIS filas; empate: a de maior extensão);
 *   - começa pelo VÃO CONTRAVENTADO (o que tem mais contraventos): pilares
 *     das duas linhas, vigas das duas linhas, depois o vão (vigas do vão,
 *     contraventos, peças leves) — a estrutura fica estável no 1º módulo;
 *   - segue linha a linha para um lado e depois para o outro, cada linha
 *     seguida do vão que ela fecha;
 *   - dentro de cada grupo: de baixo para cima, depois ao longo da linha.
 *   ⚠ Sem nenhum contravento o plano AVISA: o 1º módulo precisa de
 *     contraventamento provisório (escoras/cabos) antes de soltar o gancho.
 *     Estabilidade durante a montagem é do montador (AISC 303-16, Code of
 *     Standard Practice, 7.10 — referência de prática, não norma brasileira;
 *     a NBR 8800 não traz sequência de montagem).
 *
 * Entrada (coordenadas do MOTOR do içamento: metros, x e y em planta, z
 * para cima — as mesmas do BIM.icarGeometria):
 *   unidades: [{ id, uids:[…], nome, papel, kg, geo:{min:{x,y,z}, max, cg} }]
 *   opcoes:   { feixe: true, tolLinha_m: 0.5 }
 * Saída: { ok, eixo, linhas, vaoContraventado, icamentos:[{ chave, ordem,
 *   etapa, etapaNome, nome, tipo, uids, kg, papeis, pecas, geo }], etapas,
 *   fora:[{ uids, nome, motivo }], avisos, premissas }
 *
 * Teste: node tools/test-metal-montagem.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var PREMISSAS = {
    feixe: true,           // peças leves do vão sobem em feixe (por vão, função e lado)
    tolLinha_m: 0.5        // pilares a até 0,5 m da mesma coordenada estão na mesma fila (tolerância de desenho, não de norma)
  };
  var FONTE_ORDEM = "começar pelo vão contraventado e fechar módulo a módulo (prática de montagem; estabilidade provisória a cargo do montador — AISC 303-16, 7.10)";

  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function semAcento(s) { s = txt(s).toLowerCase(); return s.normalize ? s.normalize("NFD").replace(/[̀-ͯ]/g, "") : s; }
  function br(v, c) { c = c == null ? 0 : c; var s = (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c), neg = s.charAt(0) === "-"; if (neg) s = s.slice(1); var p = s.split("."); return (neg ? "-" : "") + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (p[1] ? "," + p[1] : ""); }
  function prem(o) { var r = {}, k; for (k in PREMISSAS) r[k] = PREMISSAS[k]; if (o) for (k in o) if (o[k] != null && o[k] !== "") r[k] = o[k]; return r; }

  /* ---------------- o que cada peça É na montagem (pela função escrita no modelo) ---------------- */
  /* ⚠ a ORDEM dos testes importa: "Chapa de extremidade" é acessório, "Contravento da parede" é contravento,
     "Viga de cobertura" é viga; "Clip de terça" é acessório ANTES de cair em "terça". */
  function classe(papel) {
    var p = semAcento(papel);
    if (/chumbador/.test(p)) return "chumbador";
    /* acessório pelo COMEÇO do nome ("Chapa de extremidade", "Placa de base", "Clip de terça"): "Pilar com placa de base",
       "Terça em chapa dobrada" e "Viga soldada de chapas" são peças principais (revisor, 23/10/2026) */
    if (/^(parafuso|porca|arruela|chapa|gusset|clip|tala|cobrejunta|enrijecedor|calco|cantoneira de liga|placa)/.test(p)) return "acessorio";
    /* coluna de TAPAMENTO/oitão não é pilar de pórtico: contada como pilar, ela criava filas na outra direção e virava o eixo
       das linhas de montagem (revisor: galpão com tapamentos começava pela parede lateral, com a cumeeira solta) */
    if (/tapamento|oitao|empena/.test(p) && /coluna|pilar|montante/.test(p)) return "outro";
    if (/pilar|coluna|montante de portico/.test(p)) return "pilar";
    /* mão-francesa e escora ligam viga a pilar/terça: sobem DEPOIS das peças que ligam e não fazem o vão "contraventado" */
    if (/mao.francesa|escora/.test(p)) return "maofrancesa";
    if (/contravent|diagonal/.test(p)) return "contravento";
    if (/terca|travessa|tirante|corrente|longarina de fechamento|cantoneira de travamento|frechal/.test(p)) return "leve";
    if (/viga|tesoura|trelica|banzo|caibro|cumeeira|consolo/.test(p)) return "viga";
    return "outro";
  }
  var RANK = { pilar: 0, viga: 1, contravento: 2, leve: 3, maofrancesa: 4, outro: 5 };

  /* ---------------- geometria ---------------- */
  function g3(p) { return p ? { x: num(p.x, 0), y: num(p.y, 0), z: num(p.z, 0) } : null; }
  function geoOk(g) { return g && g.min && g.max && isFinite(+g.min.x) && isFinite(+g.max.z); }
  function uniao(gs) {
    var o = null, kg = 0, sx = 0, sy = 0, sz = 0;
    gs.forEach(function (it) {
      var g = it.geo; if (!geoOk(g)) return;
      if (!o) o = { min: g3(g.min), max: g3(g.max) };
      ["x", "y", "z"].forEach(function (k) { o.min[k] = Math.min(o.min[k], +g.min[k]); o.max[k] = Math.max(o.max[k], +g.max[k]); });
      var c = g.cg ? g3(g.cg) : { x: (+g.min.x + +g.max.x) / 2, y: (+g.min.y + +g.max.y) / 2, z: (+g.min.z + +g.max.z) / 2 }, w = Math.max(num(it.kg, 0), 1e-6);
      sx += c.x * w; sy += c.y * w; sz += c.z * w; kg += w;
    });
    if (o) o.cg = { x: sx / kg, y: sy / kg, z: sz / kg };
    return o;
  }
  /* distância entre duas caixas (0 se se tocam) */
  function distCaixas(a, b) {
    var d = 0;
    ["x", "y", "z"].forEach(function (k) { var g = Math.max(0, +a.min[k] - +b.max[k], +b.min[k] - +a.max[k]); d += g * g; });
    return Math.sqrt(d);
  }
  /* filas: valores agrupados com a tolerância (ordem crescente; centro = média) */
  function filas(vals, tol) {
    var v = vals.slice().sort(function (a, b) { return a - b; }), out = [];
    v.forEach(function (x) { var u = out[out.length - 1]; if (u && x - u.max <= tol) { u.max = x; u.s += x; u.n++; } else out.push({ min: x, max: x, s: x, n: 1 }); });
    return out.map(function (f) { return Math.round(f.s / f.n * 1000) / 1000; });
  }

  /* ================================================================ O PLANO */
  function planejar(ent, opcoes) {
    var pp = prem(opcoes), out = { ok: false, eixo: null, linhas: [], vaoContraventado: null, icamentos: [], etapas: [], fora: [], avisos: [], premissas: pp, regraOrdem: FONTE_ORDEM };
    var us = arr(ent && ent.unidades).filter(function (u) { return u && arr(u.uids).length; });
    if (!us.length) { out.avisos.push("Nenhuma peça de aço no modelo: desenhe a estrutura (ou gere o galpão) antes do plano de montagem."); return out; }
    var principais = [], acess = [];
    us.forEach(function (u) {
      var c = classe(u.papel);
      if (u.foraMotivo) { out.fora.push({ uids: u.uids.slice(), nome: u.nome || u.papel, motivo: u.foraMotivo }); return; }
      if (c === "chumbador") { out.fora.push({ uids: u.uids.slice(), nome: u.nome || u.papel, motivo: "chumbador: concretado com a fundação, antes da montagem — não é içado" }); return; }
      if (!(num(u.kg, 0) > 0)) { out.fora.push({ uids: u.uids.slice(), nome: u.nome || u.papel, motivo: "sem peso — informe o peso da peça (peso desconhecido não se iça, NR-18 18.10.1.29)" }); return; }
      if (!geoOk(u.geo)) { out.fora.push({ uids: u.uids.slice(), nome: u.nome || u.papel, motivo: "a peça não está no 3D aberto (sem posição para o gancho)" }); return; }
      var x = { u: u, c: c, kg: num(u.kg, 0), anexos: [] };
      (c === "acessorio" ? acess : principais).push(x);
    });
    if (!principais.length) {
      /* só acessórios: cada um é a sua própria peça (melhor que perder o peso) */
      principais = acess.map(function (a) { a.c = "outro"; return a; }); acess = [];
    }
    /* 2. ACESSÓRIO SOLTO → a peça principal mais próxima (empate: a mais pesada) */
    acess.forEach(function (a) {
      var melhor = null, dm = Infinity;
      principais.forEach(function (p) {
        var d = distCaixas(a.u.geo, p.u.geo);
        if (d < dm - 1e-9 || (Math.abs(d - dm) <= 1e-9 && melhor && p.kg > melhor.kg)) { dm = d; melhor = p; }
      });
      melhor.anexos.push(a);
    });

    /* LINHAS DE MONTAGEM: as filas de pilares na direção em que se repetem */
    var pil = principais.filter(function (p) { return p.c === "pilar"; });
    var cgOf = function (p) { var g = p.u.geo; return g.cg ? g3(g.cg) : { x: (g.min.x + g.max.x) / 2, y: (g.min.y + g.max.y) / 2, z: (g.min.z + g.max.z) / 2 }; };
    var eixo = null, linhas = [];
    if (pil.length >= 2) {
      var fx = filas(pil.map(function (p) { return cgOf(p).x; }), pp.tolLinha_m), fy = filas(pil.map(function (p) { return cgOf(p).y; }), pp.tolLinha_m);
      var ex = fx[fx.length - 1] - fx[0], ey = fy[fy.length - 1] - fy[0];
      eixo = fx.length > fy.length ? "x" : fy.length > fx.length ? "y" : (ey > ex + 1e-6 ? "y" : "x");
      linhas = eixo === "x" ? fx : fy;
    }
    var trans = eixo === "x" ? "y" : "x";
    out.eixo = eixo; out.linhas = linhas;
    if (!eixo) out.avisos.push(pil.length ? "Um pilar só: sem linhas de montagem — a ordem é pilar, vigas, contraventos, peças leves." : "Sem pilar na estrutura: a ordem é vigas, contraventos e peças leves, de baixo para cima.");

    /* posição de cada principal: na linha k (|s − linha| ≤ tol) ou no vão k (entre a linha k e a k+1) */
    function lugar(p) {
      if (!linhas.length) return { linha: null, vao: 0 };
      var s = cgOf(p)[eixo];
      for (var i = 0; i < linhas.length; i++) if (Math.abs(s - linhas[i]) <= pp.tolLinha_m) return { linha: i, vao: null };
      if (linhas.length < 2) return { linha: 0, vao: null };
      if (s < linhas[0]) return { linha: null, vao: 0 };
      for (var k = 0; k < linhas.length - 1; k++) if (s > linhas[k] && s < linhas[k + 1]) return { linha: null, vao: k };
      return { linha: null, vao: linhas.length - 2 };
    }
    principais.forEach(function (p) {
      var L = lugar(p); p.linha = L.linha; p.vao = L.vao;
      /* viga e peça leve "na linha" de quem não é pilar continuam na linha (viga do pórtico); o resto do vão */
      if (p.linha != null && (p.c === "contravento" || p.c === "leve" || p.c === "maofrancesa") && linhas.length >= 2) {
        /* contravento/terça exatamente sobre a linha (raro): fica no vão que começa nela (ou no último) */
        p.vao = Math.min(p.linha, linhas.length - 2); p.linha = null;
      }
    });
    var nVaos = Math.max(1, linhas.length - 1);
    /* VÃO CONTRAVENTADO: o de mais contraventos (empate: o primeiro) */
    var contV = []; for (var v0 = 0; v0 < nVaos; v0++) contV.push(0);
    /* conta os contraventos VERTICAIS (parede/fachada) — são eles que deixam o módulo em pé; sem nenhum vertical, todos */
    var ehVert = function (p) { var g = p.u.geo, dz = g.max.z - g.min.z, dh = Math.max(g.max.x - g.min.x, g.max.y - g.min.y); return p.c === "contravento" && (/parede|fachada|vertical|lateral/.test(semAcento(p.u.papel)) || dz > 0.5 * dh); };
    var temVert = principais.some(ehVert);
    principais.forEach(function (p) { if (p.c === "contravento" && p.vao != null && (!temVert || ehVert(p))) contV[p.vao]++; });
    var vc = 0; for (var v1 = 1; v1 < nVaos; v1++) if (contV[v1] > contV[vc]) vc = v1;
    out.vaoContraventado = linhas.length >= 2 ? vc : null;
    if (!principais.some(function (p) { return p.c === "contravento"; }) && linhas.length >= 2)
      out.avisos.push("A estrutura não tem contravento desenhado: o 1º módulo (linhas 1 e 2) precisa de contraventamento PROVISÓRIO (cabos ou escoras) antes de soltar o gancho — a estabilidade durante a montagem é do montador.");
    else if (linhas.length >= 2 && contV[vc] > 0)
      out.avisos.push("Começa pelo vão contraventado (entre as linhas " + (vc + 1) + " e " + (vc + 2) + ", " + String(eixo).toUpperCase() + " = " + br(linhas[vc], 2) + " a " + br(linhas[vc + 1], 2) + " m): a estrutura fica estável no 1º módulo e as próximas linhas se apoiam nele.");

    /* ORDEM DAS LINHAS: as duas do vão contraventado, depois para o lado mais longo, depois o outro */
    var ordemL = [];
    if (linhas.length >= 2) {
      ordemL.push({ linha: vc, vao: null }); ordemL.push({ linha: vc + 1, vao: vc });
      var dir = (linhas.length - 1 - (vc + 1)) >= vc ? [1, -1] : [-1, 1];
      dir.forEach(function (d) {
        if (d > 0) for (var a = vc + 2; a < linhas.length; a++) ordemL.push({ linha: a, vao: a - 1 });
        else for (var b = vc - 1; b >= 0; b--) ordemL.push({ linha: b, vao: b });
      });
    } else ordemL.push({ linha: linhas.length ? 0 : null, vao: 0 });

    /* grupos de içamento a partir das principais */
    function ordenar(lst) {
      return lst.sort(function (a, b) {
        var ca = cgOf(a), cb = cgOf(b);
        return (RANK[a.c] - RANK[b.c]) || (a.u.geo.min.z - b.u.geo.min.z) || ((trans ? ca[trans] - cb[trans] : 0)) || ((eixo ? ca[eixo] - cb[eixo] : 0)) || (txt(a.u.id) < txt(b.u.id) ? -1 : 1);
      });
    }
    function lado(p) {
      if (!trans) return 0;
      var mn = Infinity, mx = -Infinity;
      principais.forEach(function (q) { var c = cgOf(q)[trans]; if (c < mn) mn = c; if (c > mx) mx = c; });
      var meio = (mn + mx) / 2, c0 = cgOf(p)[trans];
      return Math.abs(c0 - meio) < 1e-6 ? 0 : (c0 < meio ? -1 : 1);
    }
    function grupos(lst) {
      /* peças leves e contraventos em FEIXE por função e por lado; o resto, uma por içamento */
      var res = [], feixes = {};
      ordenar(lst).forEach(function (p) {
        if (pp.feixe && (p.c === "leve" || p.c === "contravento")) {
          var k = p.c + "|" + semAcento(p.u.papel) + "|" + lado(p);
          if (!feixes[k]) { feixes[k] = { tipo: p.c, membros: [], papel: p.u.papel, lado: lado(p) }; res.push(feixes[k]); }
          feixes[k].membros.push(p);
        } else res.push({ tipo: p.c, membros: [p], papel: p.u.papel });
      });
      return res;
    }
    var etapaN = 0, ordem = 0, usados = {};
    function emitir(lst, nomeEtapa) {
      if (!lst.length) return;
      etapaN++;
      var et = { n: etapaN, nome: nomeEtapa, icamentos: [] };
      grupos(lst).forEach(function (gr) {
        var uids = [], pecas = [], kg = 0, papeis = [], itensGeo = [];
        gr.membros.forEach(function (m) {
          usados[m.u.id] = 1;
          [m].concat(m.anexos).forEach(function (x) {
            x.u.uids.forEach(function (id) { if (uids.indexOf(id) < 0) uids.push(id); });
            kg += x.kg; itensGeo.push({ geo: x.u.geo, kg: x.kg });
            if (papeis.indexOf(x.u.papel) < 0) papeis.push(x.u.papel);
          });
          pecas.push(m.u.nome || m.u.papel);
        });
        ordem++;
        var nm = gr.membros.length === 1 ? (gr.membros[0].u.nome || gr.membros[0].u.papel)
          : (gr.tipo === "leve" ? "Feixe de " + semAcento(gr.papel).replace(/^\w/, function (c) { return c.toUpperCase(); }) + "s" : "Contraventos — " + txt(gr.papel)) + " (" + gr.membros.length + ")";
        var chave = "montagem:" + uids.slice().sort()[0] + ":" + uids.length;
        var ic = { chave: chave, ordem: ordem, etapa: etapaN, etapaNome: nomeEtapa, nome: ordem + ". " + nm, tipo: gr.tipo, uids: uids, kg: Math.round(kg * 100) / 100, papeis: papeis, pecas: pecas, n: gr.membros.length, geo: uniao(itensGeo) };
        et.icamentos.push(ic); out.icamentos.push(ic);
      });
      out.etapas.push(et);
    }
    /* contravento VERTICAL (de parede/fachada): mais alto que largo — trava os pilares do vão ANTES das vigas subirem;
       o da cobertura (no plano do telhado) entra depois das vigas, com as terças */
    var vertical = ehVert;
    function vaoLivre(v) { return principais.filter(function (p) { return p.vao === v && p.linha == null && !usados[p.u.id]; }); }
    /* a linha leva a COORDENADA no nome: a numeração é pela posição (1 = menor coordenada), não a do pórtico no desenho */
    var coord = function (i) { return String(eixo || "").toUpperCase() + " = " + br(linhas[i], 2) + " m"; };
    var nomeL = function (i) { return (i + 1) + " (" + coord(i) + ")"; };
    var nomeVao = function (v) { return "vão entre as linhas " + nomeL(v) + " e " + nomeL(v + 1); };
    if (linhas.length >= 2) {
      /* MÓDULO INICIAL (o vão contraventado): pilares das duas linhas → contraventos verticais do vão (o módulo fica
         em pé sozinho) → vigas das duas linhas → o resto do vão (vigas do vão, contraventos da cobertura, peças leves) */
      var L0 = ordemL[0].linha, L1 = ordemL[1].linha;
      emitir(principais.filter(function (p) { return (p.linha === L0 || p.linha === L1) && p.c === "pilar"; }), "Módulo inicial — pilares das linhas " + nomeL(L0) + " e " + nomeL(L1));
      emitir(vaoLivre(vc).filter(vertical), "Módulo inicial — contraventos verticais do " + nomeVao(vc));
      emitir(principais.filter(function (p) { return (p.linha === L0 || p.linha === L1) && !usados[p.u.id]; }), "Módulo inicial — vigas das linhas " + nomeL(L0) + " e " + nomeL(L1));
      emitir(vaoLivre(vc), "Módulo inicial — " + nomeVao(vc) + " (vigas do vão, contraventos da cobertura e peças leves)");
      /* as outras linhas, cada uma seguida do vão que ela fecha */
      ordemL.slice(2).forEach(function (o) {
        emitir(principais.filter(function (p) { return p.linha === o.linha && p.c === "pilar" && !usados[p.u.id]; }), "pilares da linha " + nomeL(o.linha));
        emitir(vaoLivre(o.vao).filter(vertical), "contraventos verticais do " + nomeVao(o.vao));
        emitir(principais.filter(function (p) { return p.linha === o.linha && !usados[p.u.id]; }), "vigas da linha " + nomeL(o.linha));
        emitir(vaoLivre(o.vao), nomeVao(o.vao) + " (vigas do vão, contraventos e peças leves)");
      });
    }
    var resto = principais.filter(function (p) { return !usados[p.u.id]; });
    if (resto.length) {
      /* sem linhas (ou peças que não caíram em linha nem vão): pela função, de baixo para cima */
      var porTipo = {}; resto.forEach(function (p) { (porTipo[p.c] = porTipo[p.c] || []).push(p); });
      ["pilar", "viga", "contravento", "leve", "maofrancesa", "outro"].forEach(function (t) { if (porTipo[t]) emitir(porTipo[t], { pilar: "pilares", viga: "vigas", contravento: "contraventos", leve: "peças leves", maofrancesa: "mãos-francesas e escoras", outro: "demais peças" }[t]); });
    }
    var kgIc = 0; out.icamentos.forEach(function (i) { kgIc += i.kg; });
    out.kg = Math.round(kgIc * 100) / 100;
    out.ok = out.icamentos.length > 0;
    if (out.fora.length) out.avisos.push(out.fora.length + " peça(s) fora do plano (" + out.fora.map(function (f) { return f.motivo.split(":")[0]; }).filter(function (m, i, a) { return a.indexOf(m) === i; }).join("; ") + ").");
    return out;
  }

  /* ================================================================ DO MODELO (o estado do editor) ÀS UNIDADES
   * Fab = js/metalfab.js; geoDe(uids) → { uid: {min, max, cg} } (BIM.icarGeometria na tela; geometria própria no teste);
   * kgDe(caixa) → kg (padrão: a massa da peça). As unidades são os CONJUNTOS da fábrica + os parafusos soltos. */
  function unidadesDoEstado(estado, Fab, geoDe, kgDe) {
    var caixas = {}; arr(estado && estado.caixas).forEach(function (c) { if (c && c.id != null) caixas[String(c.id)] = c; });
    var n = Fab && Fab.numerar ? Fab.numerar(estado) : null, us = [];
    if (!n) return us;
    var kg = function (id) { var c = caixas[String(id)]; if (!c) return 0; return kgDe ? num(kgDe(c), 0) : num(c.massa, 0); };
    var papel = function (id) { var c = caixas[String(id)]; return c ? (c.metal ? txt(c.metal.papel) : (c.tipo === "pilar" ? "Pilar" : c.tipo === "viga" ? "Viga" : txt(c.tipo))) : ""; };
    var nome = function (id) { var c = caixas[String(id)]; return c ? (c.metal && c.metal.nome) || papel(id) + " " + id : String(id); };
    var todos = [];
    arr(n.conjuntos).forEach(function (g) {
      arr(g.conjuntos).forEach(function (k) {
        var ids = arr(k.ids).map(String), soma = 0, semKg = 0; ids.forEach(function (id) { var q = kg(id); soma += q; if (!(q > 0)) semKg++; });
        /* uma peça soldada SEM peso não vira zero calado: o conjunto inteiro fica sem peso e sai do plano com o motivo (NR-18 18.10.1.29) */
        if (semKg) soma = 0;
        us.push({ id: String(k.principal), uids: ids.map(function (id) { return "edit:" + id; }), nome: nome(k.principal) + (ids.length > 1 ? " + " + (ids.length - 1) + " soldada(s)" : ""), papel: papel(k.principal), kg: soma, marca: g.marca });
        ids.forEach(function (id) { todos.push("edit:" + id); });
      });
    });
    arr(n.parafusos).forEach(function (b) {
      us.push({ id: String(b.id), uids: ["edit:" + b.id], nome: nome(b.id), papel: txt(b.papel) || "Parafuso", kg: kg(b.id) });
      todos.push("edit:" + b.id);
    });
    /* o que é de aço no modelo e a FÁBRICA não lista (telha, rufo, cumeeira do fechamento; perfil não reconhecido) fica fora
       COM o motivo — nunca some calado (o mesmo critério do orçamento por peso, que também parte da numeração) */
    var naFab = {}; todos.forEach(function (u) { naFab[u] = 1; });
    arr(estado && estado.caixas).forEach(function (c) {
      if (!c || c.tipo !== "metal" || naFab["edit:" + c.id]) return;
      var fech = /telha|rufo|cumeeira|calha|fechamento|tapamento|cobertura de/.test(semAcento(papel(c.id))) && !/viga|terca|travessa|pilar/.test(semAcento(papel(c.id)));
      us.push({ id: String(c.id), uids: ["edit:" + c.id], nome: nome(c.id), papel: papel(c.id), kg: kg(c.id),
        foraMotivo: fech ? "fechamento (telha, rufo, cumeeira): não é peça da estrutura — sobe com a montagem do fechamento, à parte" : "a fabricação não reconhece esta peça (fora da numeração e do orçamento por peso) — confira o perfil" });
    });
    var geos = geoDe ? (geoDe(todos) || {}) : {};
    us.forEach(function (u) {
      var itens = u.uids.map(function (id) { var cId = id.replace(/^edit:/, ""); return { geo: geos[id], kg: Math.max(kg(cId), 1e-6) }; }).filter(function (x) { return geoOk(x.geo); });
      /* a posição do içamento vem das peças que estão no 3D; o peso, de TODAS (uma chapa soldada sem malha não tira o pilar do plano) */
      u.geo = itens.length ? uniao(itens) : null;
    });
    return us;
  }

  /* ================================================================ RESUMO para a conferência e o plano impresso */
  function resumo(r) {
    if (!r || !r.ok) return r && r.avisos && r.avisos[0] ? r.avisos[0] : "Sem plano de montagem.";
    return r.icamentos.length + " içamento(s) em " + r.etapas.length + " etapa(s), " + br(r.kg, 0) + " kg" + (r.linhas.length >= 2 ? " — " + r.linhas.length + " linhas de montagem ao longo de " + r.eixo.toUpperCase() : "");
  }

  var MetalMontagem = { VERSAO: 1, PREMISSAS: PREMISSAS, FONTE_ORDEM: FONTE_ORDEM, classe: classe, planejar: planejar, unidadesDoEstado: unidadesDoEstado, resumo: resumo, _filas: filas, _distCaixas: distCaixas };
  global.MetalMontagem = MetalMontagem;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalMontagem;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
