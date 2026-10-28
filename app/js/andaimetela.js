/* =====================================================================
 * andaimetela.js — A LÓGICA PURA DA TELA DO ANDAIME (E5, 27/10/2026). Motor puro, ES5, sem DOM, Node-testável.
 * A fiação (cliques, 3D, painel) mora em js/andaimeui.js; TUDO que se pode provar sem navegador mora aqui:
 *
 *   · a SESSÃO de traçado (cliques, Backspace, lado por Tab, altura digitada, Enter) e a PRÉVIA ao vivo: o andaime
 *     montado pelo mesmo Andaime.montar do resultado final, em arame, subindo até a altura (níveis desenhados);
 *   · o resultado final (Montar inteligente ligado por padrão) com a lista de MUDANÇAS e o DESFAZER de cada uma;
 *   · as pendências do RT (V0, categoria, tela, faceAte, sigmaSolo, capacidade da ancoragem) e como entram no par;
 *   · a pintura da simulação (verde / amarelo / vermelho / cinza) e as primitivas que o 3D desenha;
 *   · a CÓPIA do componente: duplicar zera a aprovação (rascunho) — andaime copiado não herda o cartão verde.
 *
 * ⚠ REGRAS QUE NÃO PODEM SER "SIMPLIFICADAS":
 *   1. A prévia usa Andaime.validar/montar — o mesmo motor da criação. Nunca um segundo cálculo de geometria.
 *   2. Nada é aplicado em silêncio: cada mudança do Montar inteligente aparece na lista e tem desfazer próprio.
 *   3. Cópia do componente = rascunho. O cartão verde é do andaime INSPECIONADO; a cópia é outro andaime (NR-18 18.12.4).
 *   4. Estado "nao_verificado" é CINZA, nunca verde: dado faltando não é aprovação.
 *   5. Os parâmetros do cálculo (V0, categoria…) moram DENTRO do par (par.calc): mudar um deles muda o hash e cancela
 *      a liberação — o cálculo que a liberação pressupõe deixou de valer.
 *   6. (M4-A, 27/10/2026) MULTIDIRECIONAL: a sessão leva `sistema`/`linha`; a prévia, o resultado e o Montar inteligente são os MESMOS
 *      (Andaime.validar/montar/montarInteligente despacham por par.sistema). As pendências do RT do multi são lidas de forma GENÉRICA
 *      (calc.pendenciasRT da frente de cálculo; sem ela, a tabela de reserva PENDENCIAS_RT_MULTI daqui) — sem lista fixa na tela.
 * Teste: node tools/test-andaimeui.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function AN() { return dep("Andaime", "./andaime.js"); }
  function AC() { return dep("AndaimeCalc", "./andaimecalc.js"); }
  function AD() { return dep("AndaimeDocs", "./andaimedocs.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function r3(v) { return Math.round(v * 1e3) / 1e3; }
  function brf(v, c) { c = c == null ? 2 : c; if (v == null || !isFinite(v)) return "—"; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function hyp(a, b) { return Math.sqrt(a * a + b * b); }

  var LADOS = { polilinha: ["esquerda", "direita"], contorno: ["fora", "dentro"] };
  var ROT_LADO = { esquerda: "à esquerda do traçado", direita: "à direita do traçado", fora: "por fora do contorno", dentro: "por dentro do contorno" };
  var ALTURA_MIN = 0.5, ALTURA_MAX = 60;      /* Andaime.validar: "Altura do piso de trabalho de 0,5 a 60 m" */
  var TRECHO_MIN = 0.30;                       /* Andaime.validar: trecho de menos de 0,30 m é "dois pontos quase no mesmo lugar" */
  var DEDUP = 0.05;                            /* dois cliques a menos de 5 cm contam como um */
  var VEL_SUBIDA = 6;                          /* m/s da animação de subida (só efeito visual: o resultado não depende dela) */

  /* ================================================================ SESSÃO DE TRAÇADO */
  /* modo: "polilinha" (face a trabalhar: cliques e Enter) ou "contorno" (fechado, em volta de equipamento) */
  function novo(opc) {
    opc = opc || {}; var modo = opc.modo === "contorno" ? "contorno" : "polilinha";
    var lado = opc.lado && LADOS[modo].indexOf(opc.lado) >= 0 ? opc.lado : LADOS[modo][0];
    var h = num(opc.altura, 4), multi = opc.sistema === "multidirecional";
    return { sistema: multi ? "multidirecional" : "tuboroll", linha: multi ? (opc.linha === "estribo" ? "estribo" : "roseta") : null, modo: modo, pts: [], lado: lado, altura: h, inteligente: opc.inteligente !== false, par: clone(opc.par || {}), hVis: 0, y0: num(opc.y0, 0), fechada: false, vento: clone(opc.vento || {}) };
  }
  function nMin(s) { return s.modo === "contorno" ? 3 : 2; }
  /* o clique: ignora o duplicado (< 5 cm do anterior); devolve true se entrou */
  function clicar(s, p) {
    if (!s || !p) return false;
    var u = s.pts[s.pts.length - 1];
    if (u && hyp(p[0] - u[0], p[2] - u[2]) < DEDUP) return false;
    if (!s.pts.length) s.y0 = num(p[1], s.y0);
    s.pts.push([num(p[0], 0), num(p[1], s.y0), num(p[2], 0)]); s.hVis = 0; return true;
  }
  function voltar(s) { if (!s || !s.pts.length) return false; s.pts.pop(); s.hVis = 0; return true; }
  function alternarLado(s) { var L = LADOS[s.modo], i = L.indexOf(s.lado); s.lado = L[(i + 1) % L.length]; return s.lado; }
  /* altura digitada: devolve o texto do erro (ou null). Só muda o que é válido (0,5 a 60 m, a mesma régua do Andaime.validar). */
  function setAltura(s, v) {
    var h = num(v, NaN);
    if (!isFinite(h)) return "Altura inválida: digite um número em metros (ex.: 4 ou 4,5).";
    if (!(h >= ALTURA_MIN && h <= ALTURA_MAX)) return "Altura do piso de trabalho de " + brf(ALTURA_MIN, 1) + " a " + ALTURA_MAX + " m.";
    s.altura = h; s.hVis = 0; return null;
  }
  /* "tuboroll" | "multi-roseta" | "multi-estribo" (o rótulo do seletor) — a prévia refaz o andaime com o outro motor */
  function setSistema(s, v) {
    if (!s) return false;
    if (v === "multi-roseta" || v === "multi-estribo") { s.sistema = "multidirecional"; s.linha = v === "multi-estribo" ? "estribo" : "roseta"; }
    else { s.sistema = "tuboroll"; s.linha = null; }
    s.hVis = 0; return true;
  }
  function sistemaDe(x) { return x && String(x.sistema) === "multidirecional" ? (String(x.linha) === "estribo" ? "multi-estribo" : "multi-roseta") : "tuboroll"; }
  var ROT_SISTEMA = { "tuboroll": "Tubo-roll", "multi-roseta": "Multidirecional (roseta)", "multi-estribo": "Multidirecional (estribo)" };
  function podeFechar(s) { return !!s && s.pts.length >= nMin(s); }
  function cancelar(s) { if (!s) return false; s.pts.length = 0; s.hVis = 0; return true; }   /* length = 0 (e não pts = []): o editor guarda a MESMA lista */

  /* os pontos do trecho: os clicados + o cursor (se andou além da deduplicação) */
  function pontosComCursor(s, cursor) {
    var pts = s.pts.slice();
    if (cursor) { var u = pts[pts.length - 1]; if (!u || hyp(cursor[0] - u[0], cursor[2] - u[2]) >= DEDUP) pts.push([cursor[0], cursor[1] == null ? s.y0 : cursor[1], cursor[2]]); }
    return pts;
  }
  function caminhoTxt(pts) { var a = pts[0]; return pts.map(function (q) { return r3(q[0] - a[0]) + " " + r3(q[2] - a[2]); }).join("; "); }
  /* o par do Andaime para estes pontos: origem = o 1º ponto, giro 0, o campo NÃO usado vai vazio (DUVIDAS 21: o contorno antigo
     "voltava" quando se usava a polilinha depois dele) */
  function parDe(s, pts) {
    var base = clone(s.par || {}), a = pts[0];
    base.x0 = r3(a[0]); base.y0 = r3(num(a[1], s.y0)); base.z0 = r3(a[2]); base.giro = 0; base.altura = s.altura; base.lado = s.lado;
    if (s.sistema === "multidirecional") { base.sistema = "multidirecional"; base.linha = s.linha === "estribo" ? "estribo" : "roseta"; }   /* tubo-roll: nenhuma chave nova no par (o hash dele não muda) */
    if (s.modo === "contorno") { base.contorno = caminhoTxt(pts); base.caminho = ""; base.fechado = true; }
    else { base.caminho = caminhoTxt(pts); base.contorno = ""; base.fechado = false; }
    return base;
  }

  /* ================================================================ PRÉVIA
   * { ok, esperando, motivo, par, modelo, medidas, texto:{t,s,cls}, falta:{trecho,altura}, segs, hTopo } */
  var _cache = { k: null, v: null };
  function previa(s, cursor) {
    var An = AN(); var pts = pontosComCursor(s, cursor), n = nMin(s);
    if (!An) return { ok: false, motivo: "O módulo do andaime (js/andaime.js) não carregou.", texto: { t: "Andaime indisponível", s: "js/andaime.js não carregou", cls: "falta" } };
    if (!s.pts.length) return { ok: false, esperando: true, texto: { t: s.modo === "contorno" ? "Clique o 1º canto do contorno em volta do equipamento" : "Clique o começo da face a trabalhar", s: "Altura " + brf(s.altura, 2) + " m · andaime " + ROT_LADO[s.lado] + " (Tab troca o lado)", cls: "" }, falta: { trecho: TRECHO_MIN, altura: s.altura } };
    if (pts.length < n) {
      var ult = s.pts[s.pts.length - 1], falta1 = Math.max(0, TRECHO_MIN - (cursor && ult ? hyp(cursor[0] - ult[0], cursor[2] - ult[2]) : 0));
      return { ok: false, esperando: true, texto: { t: "Mexa o mouse e clique o próximo ponto", s: s.modo === "contorno" ? "O contorno precisa de 3 cantos ou mais" : "Faltam pontos para formar a face", cls: "falta" }, falta: { trecho: r3(falta1), altura: s.altura } };
    }
    var par = parDe(s, pts), k = JSON.stringify(par);
    var u0 = pts[pts.length - 1], pen = pts[pts.length - 2], lUlt = hyp(u0[0] - pen[0], u0[2] - pen[2]);
    var falta = { trecho: r3(Math.max(0, TRECHO_MIN - lUlt)), altura: 0 };
    var e = An.validar(par);
    if (e) {
      falta.altura = s.altura;
      return { ok: false, motivo: e, par: par, texto: { t: falta.trecho > 0 ? "Faltam " + brf(falta.trecho, 2) + " m neste trecho (mínimo " + brf(TRECHO_MIN, 2) + " m)" : "O andaime não monta assim", s: e, cls: "falta" }, falta: falta };
    }
    var mod;
    if (_cache.k === k) mod = _cache.v; else { mod = An.montar(par); _cache.k = k; _cache.v = mod; }
    if (!mod || !mod.ok) { falta.altura = s.altura; return { ok: false, motivo: (mod && mod.erro) || "não montou", par: par, texto: { t: "O andaime não monta assim", s: (mod && mod.erro) || "", cls: "falta" }, falta: falta }; }
    var hT = alturaTotal(mod), vis = Math.min(s.hVis, hT), sobe = vis < hT - 1e-6;
    var M = mod.medidas, pn = mod.par || par, alcance = Math.min(vis, s.altura);   /* o que já subiu, contado até a altura pedida */
    falta.altura = r3(Math.max(0, s.altura - alcance));
    var t, sub = (s.sistema === "multidirecional" ? ROT_SISTEMA[sistemaDe(s)] + " · " : "") + M.nVaos + (M.nVaos === 1 ? " vão" : " vãos") + " de até " + brf(pn.vaoMax, 2) + " m × " + M.nLevantes + (M.nLevantes === 1 ? " levante" : " levantes") + " de até " + brf(pn.levanteMax, 2) + " m · " + brf(M.comprimento, 2) + " m de comprimento · andaime " + ROT_LADO[s.lado] + (s.inteligente ? " · ao fechar, o Montar inteligente ajusta o que não passar" : "");
    if (sobe && vis < s.altura - 1e-6) t = "Subindo: " + brf(alcance, 2) + " de " + brf(s.altura, 2) + " m — faltam " + brf(falta.altura, 2) + " m";
    else if (sobe) t = "Subindo o guarda-corpo e a tela (piso a " + brf(s.altura, 2) + " m já montado)";
    else t = "Pronto até " + brf(s.altura, 2) + " m: " + M.nVaos + (M.nVaos === 1 ? " vão" : " vãos") + " × " + M.nLevantes + (M.nLevantes === 1 ? " levante" : " levantes");
    if (falta.trecho > 0) t = "Faltam " + brf(falta.trecho, 2) + " m neste trecho (mínimo " + brf(TRECHO_MIN, 2) + " m)";
    return { ok: true, par: par, modelo: mod, medidas: M, hTopo: hT, hVis: vis, subindo: sobe, falta: falta, texto: { t: t, s: sub, cls: falta.trecho > 0 ? "falta" : (sobe ? "" : "ok") }, segs: segmentos(mod, [par.x0, par.y0, par.z0], vis) };
  }
  function alturaTotal(mod) { var h = 0; arr(mod.barras).forEach(function (b) { h = Math.max(h, b.a[1], b.b[1]); }); return h; }
  /* a cota do piso mais alto já "montado" até a altura visível (a animação) */
  function alturaAlcancada(mod, vis) {
    var h = 0; arr(mod.niveis).forEach(function (n) { var y = n.yPiso != null ? n.yPiso : n.y; if (n.piso || n.yPiso != null) { if (y <= vis + 1e-6) h = Math.max(h, y); } });
    if (vis >= alturaTotal(mod) - 1e-6) h = Math.max(h, num(mod.medidas && mod.medidas.alturaPiso, h));
    return h;
  }
  /* a subida: avança hVis por dt segundos; true enquanto ainda sobe */
  function avancar(s, dt, hTopo) { s.hVis = Math.min(hTopo, s.hVis + AndaimeTela.VEL_SUBIDA * Math.max(0, dt)); return s.hVis < hTopo - 1e-6; }

  /* ================================================================ ARAME (prévia) */
  /* segmentos do modelo em coordenadas do mundo, cortados na altura visível. Grupos: tubos, guarda (guarda-corpo, rodapé, tela),
     piso, ancor. Cada um é uma lista plana [x1,y1,z1,x2,y2,z2, …]. */
  function segmentos(mod, org, hVis) {
    var out = { tubos: [], guarda: [], piso: [], ancor: [] }, yo = num(mod.yOffCalco, 0);
    function W(p) { return [p[0] + org[0], p[1] + yo + org[1], p[2] + org[2]]; }
    function empurrar(g, a, b) {
      var ya = a[1], yb = b[1];
      if (Math.min(ya, yb) > hVis + 1e-6) return;
      if (Math.max(ya, yb) > hVis + 1e-6) { var t = (hVis - ya) / (yb - ya); if (yb > ya) b = [a[0] + (b[0] - a[0]) * t, hVis, a[2] + (b[2] - a[2]) * t]; else a = [b[0] + (a[0] - b[0]) * (1 - t), hVis, b[2] + (a[2] - b[2]) * (1 - t)]; }
      var A = W(a), B = W(b); out[g].push(A[0], A[1], A[2], B[0], B[1], B[2]);
    }
    arr(mod.barras).forEach(function (b) {
      var g = b.papel === "guarda" || b.papel === "intermediaria" || b.papel === "posteGuarda" ? "guarda" : (b.papel === "ancoragem" ? "ancor" : "tubos");
      empurrar(g, b.a, b.b);
    });
    arr(mod.pranchas).concat(arr(mod.rodapes)).forEach(function (x) {
      var dx = x.b[0] - x.a[0], dz = x.b[2] - x.a[2], L = hyp(dx, dz) || 1, u = [dx / L, dz / L], hw = (x.larg || x.esp || 0.2) / 2;
      var y = x.yTopo; if (x.alt != null) y = x.yTopo;
      var n = [-u[1] * hw, u[0] * hw], A = [x.a[0] + n[0], y, x.a[2] + n[1]], B = [x.b[0] + n[0], y, x.b[2] + n[1]], C = [x.b[0] - n[0], y, x.b[2] - n[1]], D = [x.a[0] - n[0], y, x.a[2] - n[1]];
      var g = x.cod === "rodapeMadeira" ? "guarda" : "piso";
      if (x.cod === "rodapeMadeira") { empurrar("guarda", [x.a[0], x.yTopo, x.a[2]], [x.b[0], x.yTopo, x.b[2]]); empurrar("guarda", [x.a[0], x.yTopo - (x.alt || 0.2), x.a[2]], [x.b[0], x.yTopo - (x.alt || 0.2), x.b[2]]); return; }
      empurrar(g, A, B); empurrar(g, B, C); empurrar(g, C, D); empurrar(g, D, A);
    });
    return out;
  }

  /* ================================================================ RESULTADO FINAL */
  /* o cálculo lê par.calc (V0, categoria…). Chaves sempre em ordem: o hash do par não pode depender da ordem de digitação. */
  function calcDe(par) { var c = (par && par.calc && typeof par.calc === "object") ? par.calc : {}, o = {}; Object.keys(c).sort().forEach(function (k) { if (c[k] != null && c[k] !== "") o[k] = c[k]; }); return o; }
  /* ⚠ o par que vai para o Andaime.montar NÃO leva `calc` (não é geometria); o par guardado no componente leva */
  function parSemCalc(par) { var p = clone(par); delete p.calc; return p; }
  function resultado(par, opc) {
    opc = opc || {}; var An = AN(), Ac = AC();
    if (!An || !Ac) return { ok: false, erro: "Os módulos do andaime (js/andaime.js, js/andaimecalc.js) não carregaram." };
    var calcP = calcDe(par), pg = parSemCalc(par);
    var erro = An.validar(pg); if (erro) return { ok: false, erro: erro };
    var r;
    if (opc.inteligente !== false && An.montarInteligente) {
      r = An.montarInteligente(pg, { calc: calcP });
      if (r.erro) return { ok: false, erro: r.erro };
      var pf = clone(r.par); var cc = calcDe(par); if (Object.keys(cc).length) pf.calc = cc;
      return { ok: true, inteligente: true, par: pf, parOriginal: clone(par), modelo: r.modelo, calc: r.calc, passou: !!r.passou, mudancas: mudancasLista(r.mudancas), faltam: arr(r.faltam), falhas: arr(r.falhas), atencao: arr(r.atencao), pendencias: arr(r.pendencias), pendenciasTexto: arr(r.pendenciasTexto), maiorUso: r.maiorUso };
    }
    var m = An.montar(pg); if (!m.ok) return { ok: false, erro: m.erro || "não montou" };
    var c = Ac.calcular(m, calcP);
    var fal = c.verificacoes.filter(function (v) { return v.estado === "falha"; });
    return { ok: true, inteligente: false, par: clone(par), parOriginal: clone(par), modelo: m, calc: c, passou: fal.length === 0, mudancas: [], faltam: fal.map(function (v) { return v.titulo + " (uso " + brf(Math.min(v.uso == null ? 99 : v.uso, 99), 2) + ")"; }),
      falhas: fal.map(function (v) { return { id: v.id, titulo: v.titulo, uso: v.uso, corrigir: v.corrigir }; }), atencao: c.verificacoes.filter(function (v) { return v.estado === "atencao"; }).map(function (v) { return { id: v.id, titulo: v.titulo, uso: v.uso }; }),
      pendencias: c.verificacoes.filter(function (v) { return v.estado === "nao_verificado"; }).map(function (v) { return { id: v.id, titulo: v.titulo, motivo: (v.ressalvas && v.ressalvas[0]) || v.texto || "" }; }), pendenciasTexto: arr(c.pendencias) };
  }
  /* o mesmo par, só refeito (montar + calcular), sem o gerador: usado ao ligar/desligar mudanças e informar pendências */
  function recalcular(par) { return resultado(par, { inteligente: false }); }

  function fmtV(v) { return typeof v === "number" ? brf(v, 2) : (v === true ? "sim" : (v === false ? "não" : (v == null || v === "" ? "(vazio)" : String(v)))); }
  function mudancasLista(mud) {
    return arr(mud).map(function (m, i) {
      return { id: "m" + i, campo: m.campo, de: m.de, para: m.para, motivo: m.motivo || "", passos: m.passos || 1, desfeita: false, texto: m.campo + ": " + fmtV(m.de) + " → " + fmtV(m.para) };
    });
  }
  /* desfazer UMA mudança: devolve o par com o campo de volta ao valor `de`. Idempotente. Não mexe nas outras. */
  function desfazerMudanca(par, mud) {
    var p = clone(par); if (!mud || !mud.campo) return p;
    if (mud.de === undefined) delete p[mud.campo]; else p[mud.campo] = clone(mud.de);
    return p;
  }

  /* ================================================================ PENDÊNCIAS DO RT
   * Cada uma é um dado que o cálculo precisa e que o sistema NÃO inventa. Sem valor → o item correspondente fica «não verificado»
   * (cinza), nunca verde. `onde`: "calc" (par.calc.<campo>) ou "par" (par.<campo>). */
  var PENDENCIAS_RT = [
    { campo: "V0", rotulo: "V0 — velocidade básica do vento (m/s)", tipo: "num", min: 20, max: 60, onde: "calc", dica: "Das isopletas da NBR 6123:2023 pelo local da obra. Sem V0 o vento não entra e o montante fica NÃO VERIFICADO." },
    { campo: "categoria", rotulo: "Categoria de rugosidade do terreno", tipo: "sel", ops: ["I", "II", "III", "IV", "V"], onde: "calc", dica: "NBR 6123:2023 5.3.1. Sem informar, vale a pior (I) com a pendência visível." },
    { campo: "telaSombreamento", rotulo: "Tela: fração fechada (0,30 a 1,00)", tipo: "num", min: 0.05, max: 1, onde: "calc", dica: "1,00 = lona. Sem informar vale 0,75 (pior caso). Vento sobre a tela é o que mais pesa na ancoragem." },
    { campo: "faceAte", rotulo: "Face onde ancorar vai até a cota (m)", tipo: "num", min: 0, max: 200, onde: "par", dica: "Até que altura existe estrutura/fachada para ancorar. Vazio = hipótese «face até o topo», que o RT confirma." },
    { campo: "sigmaSolo", rotulo: "Tensão admissível do apoio (kPa)", tipo: "num", min: 1, max: 5000, onde: "calc", confirma: "sigmaSoloConfirmado", dica: "Do laudo/ensaio do solo ou da laje. Sem fonte no sistema: o RT informa e confirma." },
    { campo: "capAncoragem", rotulo: "Capacidade da ancoragem (kN)", tipo: "num", min: 0.5, max: 200, onde: "calc", dica: "Do chumbador/ensaio. O padrão (6,25 kN) é referência estrangeira, não norma." },
    /* C-T1.1: o sistema NÃO calcula o vento paralelo à fachada (atrito na tela e cabeceiras nas diagonais e giratórias): o RT confere e justifica por escrito (>= 15 caracteres não brancos) */
    { campo: "ventoParaleloRT", rotulo: "Vento paralelo à fachada conferido pelo RT", tipo: "marca", onde: "calc", justificativa: "ventoParaleloJustificativa", dica: "O sistema não calcula o atrito do vento na tela e nas cabeceiras sobre as diagonais e giratórias. Marque só depois de conferir, e escreva a justificativa (mínimo 15 caracteres): ela vai para o memorial." }
  ];
  /* ---- MULTIDIRECIONAL: o que o RT informa (tabela de RESERVA, usada só se o cálculo do multi não trouxer a própria lista em calc.pendenciasRT).
     Faixas = sanidade da digitação (não são valores de norma). Cada campo vale só com o dado/justificativa do RT; sem fonte pública = pendência. */
  var JUST_MARCA = "Justificativa do RT (mínimo 15 caracteres): ela vai para o memorial.";
  var PENDENCIAS_RT_MULTI = PENDENCIAS_RT.filter(function (d) { return d.campo !== "capAncoragem"; }).concat([
    { campo: "capAncoragem", rotulo: "Capacidade da ancoragem (kN)", tipo: "num", min: 0.5, max: 200, onde: "calc", dica: "Do chumbador/ensaio. O padrão (6,25 kN) é referência estrangeira, não norma." },
    { campo: "capNoKgf", rotulo: "Carga admissível da ligação travessa–roseta, vertical (kgf)", tipo: "num", min: 1, max: 100000, onde: "calc", dica: "Da tabela do fabricante do locador (sem fonte pública). Sem ela a ligação (cunha) fica NÃO VERIFICADA." },
    { campo: "capLigAxialKgf", rotulo: "Capacidade axial da ligação travessa–roseta (kgf)", tipo: "num", min: 1, max: 100000, onde: "calc", dica: "Da tabela do fabricante do locador. Libera a travessa longitudinal e o elo transversal; sem o número a ligação nunca fica «ok»." },
    { campo: "capDiagKgf", rotulo: "Carga axial admissível da diagonal e da ligação (kgf)", tipo: "num", min: 1, max: 100000, onde: "calc", dica: "Da tabela do fabricante do locador. Sem ela a diagonal fica NÃO VERIFICADA (o tubo é verificado)." },
    { campo: "capBaseMultiKgf", rotulo: "Carga admissível da base regulável do multidirecional (kgf)", tipo: "num", min: 1, max: 100000, onde: "calc", dica: "Da tabela do fabricante do locador: a tabela do tubo-roll NÃO vale para outro sistema. Sem ela a base fica NÃO VERIFICADA." },
    { campo: "cunhaContinua", rotulo: "Cunha contínua (a fiada de travessas é viga contínua)", tipo: "marca", onde: "calc", justificativa: "cunhaContinuaJustificativa", rotuloMarca: "Cunha contínua conferida pelo RT", dica: "Padrão = rótula (cada estação vale pelas próprias ancoragens). Marque só com a tabela da ligação do fabricante. " + JUST_MARCA },
    { campo: "espigaoRigido", rotulo: "Espigão (emenda do poste) contínuo", tipo: "marca", onde: "calc", justificativa: "espigaoJustificativa", rotuloMarca: "Espigão contínuo conferido pelo RT", dica: "Padrão = rótula (sem fonte da rigidez da emenda). " + JUST_MARCA },
    { campo: "espigaoTracaoRT", rotulo: "Capacidade do espigão/pino trava à tração", tipo: "marca", onde: "calc", justificativa: "espigaoTracaoJustificativa", rotuloMarca: "Capacidade à tração conferida pelo RT", dica: "Sem fonte pública: o RT confere a do fabricante do locador. " + JUST_MARCA },
    { campo: "paraleloInternoRT", rotulo: "Poste interno travado no plano da fachada", tipo: "marca", onde: "calc", justificativa: "paraleloInternoJustificativa", rotuloMarca: "Travamento da linha interna conferido pelo RT", dica: "O diafragma do piso ou a diagonal interna que trava a linha interna no plano da fachada. " + JUST_MARCA }
  ]);
  /* um item da lista do cálculo (calc.pendenciasRT) ou da tabela de reserva → o formato que a tela lê */
  function defNorm(d) {
    var o = {}; Object.keys(d).forEach(function (k) { o[k] = d[k]; });
    o.rotulo = d.rotulo || d.titulo || d.label || d.campo;
    if (o.tipo === "numero") o.tipo = "num";
    o.dica = d.dica || d.fonte || d.texto || "";
    if (!o.onde) o.onde = "calc";
    if (o.tipo === "marca" && !o.justificativa) o.justificativa = d.campoJustificativa || (String(d.campo).replace(/RT$/, "") + "Justificativa");
    if (o.tipo === "confirma") { o.tipo = o.ops ? "sel" : "num"; if (!o.confirma) o.confirma = d.campo + "Confirmado"; }
    if (o.tipo === "num") { if (o.min == null) o.min = 0; if (o.max == null) o.max = 1e9; }
    return o;
  }
  function ehMulti(par) { return !!par && String(par.sistema) === "multidirecional"; }
  /* as definições que valem para ESTE par: tubo-roll = a tabela fixa; multi = a lista do cálculo (genérica) ou, sem ela, a tabela de reserva */
  function defsRT(par, calc) {
    if (!ehMulti(par)) return PENDENCIAS_RT;
    var lista = calc && Array.isArray(calc.pendenciasRT) ? calc.pendenciasRT : null;
    if (!lista) { var MC = dep("AndaimeMultiCalc", "./andaimemulticalc.js"); try { if (MC && typeof MC.pendenciasRT === "function") lista = MC.pendenciasRT(par); } catch (e) { lista = null; } }
    lista = arr(lista).filter(function (d) { return d && typeof d === "object" && d.campo; });
    return (lista.length ? lista : PENDENCIAS_RT_MULTI).map(defNorm);
  }
  function justOk(t) { return String(t == null ? "" : t).replace(/\s/g, "").length >= 15; }
  function valorPend(par, def) {
    if (def.onde === "par") return par ? par[def.campo] : null;
    var c = calcDe(par); if (def.tipo === "marca") return c[def.campo] === true ? true : null;
    return c[def.campo] != null ? c[def.campo] : null;
  }
  function pendenciasRT(par, calc) {
    return defsRT(par, calc).map(function (d) {
      var v = valorPend(par, d), inf = v != null && v !== "";
      var conf = d.confirma ? (calcDe(par)[d.confirma] === true) : true;
      if (d.tipo === "marca") { var jt = calcDe(par)[d.justificativa] || ""; return { campo: d.campo, rotulo: d.rotulo, tipo: d.tipo, ops: null, dica: d.dica, onde: d.onde, valor: inf ? true : null, informado: inf && justOk(jt), confirma: null, confirmado: true, justificativa: jt, campoJustificativa: d.justificativa, rotuloMarca: d.rotuloMarca || (d.campo === "ventoParaleloRT" ? "Vento paralelo à fachada conferido pelo RT" : "Conferido pelo RT") }; }
      return { campo: d.campo, rotulo: d.rotulo, tipo: d.tipo, ops: d.ops || null, min: d.min, max: d.max, dica: d.dica, onde: d.onde, valor: inf ? v : null, informado: inf && conf, confirma: d.confirma || null, confirmado: conf };
    });
  }
  /* aplica uma pendência ao par: devolve { ok, par } ou { ok:false, erro }. Vazio limpa (volta a ser pendência). */
  function aplicarPendencia(par, campo, valor, confirmado, justificativa, defs) {
    var d = arr(defs).map(defNorm).concat(ehMulti(par) ? PENDENCIAS_RT_MULTI : [], PENDENCIAS_RT).filter(function (x) { return x.campo === campo; })[0];
    if (!d) return { ok: false, erro: "Campo desconhecido: " + campo };
    var p = clone(par), v = valor, c = calcDe(p);
    if (d.tipo === "marca") {   /* caixa + justificativa: desmarcada limpa as duas; marcada exige a justificativa escrita */
      if (v === true || v === "true") {
        if (!justOk(justificativa)) return { ok: false, erro: "Informe a justificativa do RT para " + (d.campo === "ventoParaleloRT" ? "o vento paralelo" : "«" + d.rotulo + "»") + " (mínimo 15 caracteres)." };
        c[campo] = true; c[d.justificativa] = String(justificativa).trim();
      } else { delete c[campo]; delete c[d.justificativa]; }
    } else if (v === "" || v == null) {
      if (d.onde === "par") delete p[campo]; else { delete c[campo]; if (d.confirma) delete c[d.confirma]; }
    } else {
      if (d.tipo === "num") {
        v = num(v, NaN);
        if (!isFinite(v)) return { ok: false, erro: d.rotulo + ": digite um número." };
        if (v < d.min || v > d.max) return { ok: false, erro: d.rotulo + ": valor entre " + brf(d.min, 2) + " e " + brf(d.max, 2) + "." };
      } else if (d.ops.indexOf(String(v)) < 0) return { ok: false, erro: d.rotulo + ": escolha " + d.ops.join(", ") + "." };
      if (d.onde === "par") p[campo] = v; else { c[campo] = v; if (d.confirma) c[d.confirma] = confirmado === true; }
    }
    if (d.onde === "calc") { if (Object.keys(c).length) { var o = {}; Object.keys(c).sort().forEach(function (k) { o[k] = c[k]; }); p.calc = o; } else delete p.calc; }
    return { ok: true, par: p };
  }


  /* ================================================================ SISTEMA E PARÂMETROS DO MULTIDIRECIONAL (M4-A)
   * trocarSistema: o MESMO traçado (caminho, contorno, lado, altura, origem) e os dados do RT (par.calc, faceAte, tela) no outro sistema; o resto volta ao
   * padrão do sistema novo (nada de parâmetro do tubo-roll vazando para o multi: 0,20 de afastamento do tubo-roll NÃO é o 0,15 do manual do multi). */
  var GEO_CHAVES = ["x0", "y0", "z0", "giro", "caminho", "contorno", "fechado", "comprimento", "lado", "altura", "faceAte", "tela", "calc"];
  function trocarSistema(par, destino) {
    var p = clone(par || {}), o = {}, multi = destino === "multi-roseta" || destino === "multi-estribo";
    GEO_CHAVES.forEach(function (k) { if (p[k] !== undefined && p[k] !== null && p[k] !== "") o[k] = clone(p[k]); });
    if (multi) { o.sistema = "multidirecional"; o.linha = destino === "multi-estribo" ? "estribo" : "roseta"; }
    else { o.sistema = "tuboroll"; }
    return o;
  }
  /* os campos do formulário do multi; `onde`: chave do par. As opções de largura vêm das travessas da linha. */
  var PARAMETROS_MULTI = [
    { id: "larguraModulo", rotulo: "Largura do módulo (m) — uma travessa da linha", tipo: "sel", dica: "A largura sai da travessa transversal da linha; o piso de 0,32 m cobre o módulo (M02 §8.3)." },
    { id: "vaoMax", rotulo: "Vão longitudinal máximo (m)", tipo: "num", dica: "Até 2,50 m no padrão; a carga do piso cai de 600 para 450 kgf/m² em 2,50 m e 300 kgf/m² em 3,00 m (M02 Tabela 01)." },
    { id: "levanteMax", rotulo: "Levante máximo (m) — múltiplo de 0,50", tipo: "num", passo: 0.5, dica: "Distância entre níveis; o manual limita o andar a 2,00 m (Anexo A item 16). A roseta anda de 0,50 em 0,50 m." },
    { id: "pisos", rotulo: "Pisos de trabalho", tipo: "sel", ops: [["todos", "Todos os níveis"], ["topo", "Só o piso de cima"]], dica: "O manual manda instalar as plataformas em todos os níveis (M02 §8.3)." },
    { id: "acesso", rotulo: "Acesso", tipo: "sel", ops: [["alcapao", "Alçapão com escada incorporada"], ["escada", "Escada externa"], ["nenhum", "Nenhum (só piso até 1,0 m)"]], dica: "Alçapão intercalado de um nível para o outro (M02 §8.3.1); NR-18 18.12.14: escada quando o piso passa de 1,00 m." },
    { id: "tela", rotulo: "Tela na face externa (NR-18 18.12.15)", tipo: "check", dica: "Da 1ª plataforma até 2,00 m acima da última." },
    { id: "ancoragem", rotulo: "Ancoragem", tipo: "sel", ops: [["tubo", "Automática (gancho ou tubo pelo afastamento)"], ["nenhuma", "Nenhuma (só anel fechado ou torre que passa no 4×)"]], dica: "Pontos conforme o projeto; sem ancoragem o andaime só passa se a relação altura ÷ base ≤ 4 (NR-18 18.12.3)." },
    { id: "diagCada", rotulo: "Torre de diagonais a cada N vãos", tipo: "num", int: true, dica: "No mínimo um conjunto de diagonais em torre a cada 5 módulos (M02 §8.5)." },
    { id: "base", rotulo: "Base", tipo: "sel", ops: [["regulavel", "Regulável (rosca até 0,25 m)"], ["articulada", "Articulada (piso inclinado)"]], dica: "Rosca máxima de 0,25 m (M02 Anexo A item 15); piso inclinado exige base articulada travada (M02 §8.1.1)." },
    { id: "calco", rotulo: "Calço de madeira sob a base", tipo: "check", dica: "Distribui a carga no solo e evita o deslizamento (M02 §8.1.1)." },
    { id: "afastamento", rotulo: "Travessa a (m) da fachada", tipo: "num", dica: "O manual manda 15 cm (M02 §8.1); o vão entre a fachada e o piso tem de ficar < 0,20 m (Anexo A item 8)." }
  ];
  /* larguras (travessas da linha) disponíveis */
  function largurasDaLinha(linha) {
    var AM = dep("AndaimeMulti", "./andaimemulti.js"), L = AM && AM.linhaDe ? AM.linhaDe(linha || "roseta") : null;
    return L ? arr(L.pecas.travessa).map(function (t) { return t.medidas.vao; }) : [];
  }
  /* o valor da linha de montagem do tubo-roll que o multi trocaria em silêncio (DUVIDAS-M1 3: o normalizar trata «igual ao padrão do tubo-roll» como «não passado»):
     quando o RT digitou exatamente esse valor, vai 1 µm acima — o mesmo número para a obra, sem a troca calada. */
  function fugirDoPadraoTubo(o, k, v) {
    var An = AN(), P0 = An && An.PADRAO ? An.PADRAO : {};
    if (typeof v === "number" && P0[k] != null && num(P0[k], NaN) === v) return v + 1e-6;
    return v;
  }
  /* aplica o formulário do multi ao par: devolve { ok, par } ou { ok:false, erro } (a validação é a do próprio Andaime.validar) */
  function aplicarParametrosMulti(par, v) {
    var An = AN(), p = clone(par || {}); v = v || {};
    if (!ehMulti(p)) return { ok: false, erro: "Este andaime não é multidirecional." };
    var i, d, x;
    for (i = 0; i < PARAMETROS_MULTI.length; i++) {
      d = PARAMETROS_MULTI[i]; x = v[d.id]; if (x === undefined) continue;
      if (d.tipo === "check") { p[d.id] = x === true || x === "true" || x === "on"; continue; }
      if (x === "" || x == null) continue;
      if (d.tipo === "num") {
        var n = num(x, NaN); if (!isFinite(n)) return { ok: false, erro: d.rotulo + ": digite um número." };
        if (d.id === "levanteMax" && Math.abs(n / 0.5 - Math.round(n / 0.5)) > 1e-6) return { ok: false, erro: "Levante máximo de " + brf(n, 2) + " m: use múltiplo de 0,50 m (a roseta anda de 0,50 em 0,50 m)." };
        if (d.int) n = Math.round(n);
        p[d.id] = fugirDoPadraoTubo(p, d.id, n);
      } else if (d.id === "larguraModulo") { p.larguraModulo = num(x, NaN); }
      else if (d.id === "pisos") { p.pisos = x === "topo" ? brf(num(p.altura, 6), 2) : "todos"; }   /* «só o de cima» = a lista de alturas com a do topo (o multi sempre inclui o piso de cima): «topo» seria trocado pelo padrão */
      else p[d.id] = x;
    }
    var e = An && An.validar ? An.validar(p) : null; if (e) return { ok: false, erro: e };
    return { ok: true, par: p };
  }

  /* ================================================================ LOCAL E VENTO (E5.1)
   * V0 pela localização da obra (cadastro: lat/lon) via AcoIsopletas — a fonte vai escrita junto. Sem local (ou fora do mapa) o V0 NÃO é
   * inventado: fica a pendência. `faceAte` vazio = hipótese «até o topo», com o aviso «confirmar». */
  function v0DoLocal(local) {
    var I = dep("AcoIsopletas", "./acoisopletas.js"); if (!local || local.lat == null || local.lon == null || !I || !I.v0) return null;
    var r = null; try { r = I.v0(local.lat, local.lon); } catch (e) { r = null; }
    if (!r || !(r.v0Adotado > 0) || r.foraDoMapa) return null;
    return { v0: r.v0Adotado, fonte: "mapa de isopletas da NBR 6123:2023 (Figura 1) em " + brf(num(local.lat, 0), 4) + "; " + brf(num(local.lon, 0), 4) + " — " + (local.fonte || "local da obra") };
  }
  /* aplica Local e vento ao par: { V0, categoria, telaSombreamento, faceAte } (vazio = não informado); `local` {lat,lon,fonte} preenche o V0 sozinho */
  function aplicarLocalVento(par, v, local) {
    var p = clone(par), campos = [["categoria", v && v.categoria], ["telaSombreamento", v && v.telaSombreamento], ["faceAte", v && v.faceAte]], fonte = null;
    var v0 = v && v.V0 != null && v.V0 !== "" ? v.V0 : null;
    if (v0 == null) { var d = v0DoLocal(local); if (d) { v0 = d.v0; fonte = d.fonte; } } else fonte = "informado pelo responsável técnico";
    var r = aplicarPendencia(p, "V0", v0 == null ? "" : v0); if (!r.ok) return r; p = r.par;
    for (var i = 0; i < campos.length; i++) { if (campos[i][1] == null || campos[i][1] === "") continue; r = aplicarPendencia(p, campos[i][0], campos[i][1]); if (!r.ok) return r; p = r.par; }
    return { ok: true, par: p, fonteV0: fonte };
  }
  /* ⚠ informar/alterar uma pendência do cálculo pode REPROVAR o que antes estava «não verificado». Nunca calado: recalcula; se falhar e o
     Montar inteligente estiver ligado, roda-o sobre o par atual e devolve as mudanças NOVAS (ids depois das que já existem) num aviso único;
     se nem assim passar, `passou:false` com a lista do que falta. */
  function reagirAoDado(par, mudancasAntes, opc) {
    opc = opc || {}; var base = arr(mudancasAntes).length;
    var r0 = recalcular(par); if (!r0.ok) return { ok: false, erro: r0.erro };
    if (r0.passou) return { ok: true, par: r0.par, res: r0, novas: [], passou: true, faltam: [], aviso: "" };
    if (opc.inteligente === false) return { ok: true, par: r0.par, res: r0, novas: [], passou: false, faltam: r0.faltam, aviso: "Com o dado informado o andaime NÃO passa: " + r0.faltam.join("; ") + ". Montar inteligente desligado — use «Refazer com Montar inteligente»." };
    var r1 = resultado(par, { inteligente: true }); if (!r1.ok) return { ok: false, erro: r1.erro };
    var novas = r1.mudancas.map(function (m, i) { var o = clone(m); o.id = "m" + (base + i); o.motivo = "Com o vento informado — " + o.motivo; return o; });
    var txt = novas.length ? "Com o vento informado, o andaime foi ajustado: " + novas.map(function (m) { return m.texto; }).join("; ") + "." : "";
    if (!r1.passou) txt += (txt ? " " : "") + "Mesmo assim NÃO passa: falta " + r1.faltam.join("; ") + ".";
    return { ok: true, par: r1.par, res: r1, novas: novas, passou: r1.passou, faltam: r1.faltam, aviso: txt };
  }

  /* ================================================================ VERIFICAÇÕES, PROBLEMAS E SIMULAÇÃO */
  var COR_ESTADO = { ok: "#1f9d55", atencao: "#e0a800", falha: "#d62d20", nao_verificado: "#8a94a3" };
  var ROT_ESTADO = { ok: "passa", atencao: "atenção", falha: "NÃO passa", nao_verificado: "não verificado" };
  function verificacoes(calc) {
    return arr(calc && calc.verificacoes).map(function (v) {
      return { id: v.id, titulo: v.titulo, tipo: v.tipo, estado: v.estado, rotulo: ROT_ESTADO[v.estado] || v.estado, uso: v.uso == null ? null : v.uso, usoTxt: v.uso == null ? "—" : brf(Math.min(v.uso, 99), 2), pecas: arr(v.pecas), texto: v.texto || "", fonte: v.fonte || "", confirmarRT: arr(v.confirmarRT), temCorrigir: arr(v.corrigir).length > 0 };
    });
  }
  /* cartões de problema (js/problemacard.js): o que é + Corrigir (só com par proposto) + Mostrar no 3D */
  function problemas(calc) {
    var out = [];
    arr(calc && calc.verificacoes).forEach(function (v) {
      if (v.estado !== "falha" && v.estado !== "atencao") return;
      var sols = [];
      arr(v.corrigir).forEach(function (c, i) { if (c && c.par && Object.keys(c.par).length) sols.push({ id: "c" + i, texto: c.texto || "Aplicar a correção proposta", muda: Object.keys(c.par), pecas: arr(v.pecas).slice(0, 12) }); });
      out.push({ tipo: "andaime-" + v.id, vid: v.id, gravidade: v.estado === "falha" ? "erro" : "aviso", titulo: v.titulo + " — " + (ROT_ESTADO[v.estado] || v.estado) + " (uso " + brf(Math.min(v.uso == null ? 99 : v.uso, 99), 2) + ")",
        texto: v.texto || "", pecas: arr(v.pecas).slice(0, 40), solucoes: sols });
    });
    return out;
  }
  /* o par proposto por «Corrigir»: o par atual com os campos da correção. Devolve null se a solução não existe. */
  function aplicarCorrecao(par, calc, vid, solId) {
    var v = arr(calc && calc.verificacoes).filter(function (x) { return x.id === vid; })[0]; if (!v) return null;
    var i = num(String(solId).replace(/^c/, ""), -1), c = arr(v.corrigir)[i]; if (!c || !c.par) return null;
    var p = clone(par); Object.keys(c.par).forEach(function (k) { p[k] = clone(c.par[k]); });
    return p;
  }
  function pintura(sim) {
    var por = {}, cont = { ok: 0, atencao: 0, falha: 0, nao_verificado: 0 };
    Object.keys(sim || {}).forEach(function (id) { var e = sim[id], est = e && e.estado ? e.estado : "nao_verificado"; if (!COR_ESTADO[est]) est = "nao_verificado"; por[id] = { estado: est, cor: COR_ESTADO[est], uso: e ? e.uso : null, verificacao: e ? e.verificacao : null }; cont[est]++; });
    return { porId: por, contagem: cont, total: Object.keys(por).length };
  }
  /* as primitivas do overlay 3D (a fiação desenha): cilindros para os tubos, caixas para pranchas/rodapés, esferas para as conexões.
     Coordenadas do mundo; `id` é o do modelo (B…, P…, RD…, C…). */
  function primitivas(mod, org, pint) {
    var o = [], yo = num(mod.yOffCalco, 0), P = (pint && pint.porId) || {};
    function W(p) { return [p[0] + org[0], p[1] + yo + org[1], p[2] + org[2]]; }
    arr(mod.barras).forEach(function (b) { if (P[b.id]) o.push({ k: "cil", id: b.id, a: W(b.a), b: W(b.b), r: 0.0275, estado: P[b.id].estado, cor: P[b.id].cor }); });
    arr(mod.pranchas).concat(arr(mod.rodapes)).forEach(function (x) {
      if (!P[x.id]) return;
      var dx = x.b[0] - x.a[0], dz = x.b[2] - x.a[2], L = hyp(dx, dz);
      var alt = x.alt != null, esp = x.esp || 0.04, larg = alt ? esp : (x.larg || 0.3), hh = alt ? x.alt : esp, yc = alt ? x.yTopo - x.alt / 2 : x.yTopo - esp / 2;
      o.push({ k: "caixa", id: x.id, c: W([(x.a[0] + x.b[0]) / 2, yc, (x.a[2] + x.b[2]) / 2]), L: L, larg: larg + 0.01, h: hh + 0.01, giro: Math.atan2(-dz, dx), estado: P[x.id].estado, cor: P[x.id].cor });
    });
    arr(mod.conexoes).forEach(function (c) { if (P[c.id] && c.pos) o.push({ k: "esf", id: c.id, c: W(c.pos), r: 0.05, estado: P[c.id].estado, cor: P[c.id].cor }); });
    arr(mod.bases).forEach(function (b) { if (P[b.id] && b.pos) o.push({ k: "esf", id: b.id, c: W([b.pos[0], b.y0 + b.h / 2, b.pos[2]]), r: 0.07, estado: P[b.id].estado, cor: P[b.id].cor }); });
    arr(mod.calcos).forEach(function (c) { if (P[c.id] && c.pos) o.push({ k: "caixa", id: c.id, c: W(c.pos), L: c.L, larg: c.larg, h: c.esp, giro: Math.atan2(-c.u[1], c.u[0]), estado: P[c.id].estado, cor: P[c.id].cor }); });
    return o;
  }
  /* centro e raio para a câmera olhar uma lista de ids do modelo («Mostrar no 3D») */
  function caixaDe(mod, org, ids) {
    var set = {}; arr(ids).forEach(function (i) { set[i] = 1; });
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], n = 0, yo = num(mod.yOffCalco, 0);
    function pt(p) { var w = [p[0] + org[0], p[1] + yo + org[1], p[2] + org[2]]; for (var k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], w[k]); mx[k] = Math.max(mx[k], w[k]); } }
    arr(mod.barras).forEach(function (b) { if (set[b.id]) { pt(b.a); pt(b.b); n++; } });
    arr(mod.pranchas).concat(arr(mod.rodapes)).forEach(function (x) { if (set[x.id]) { pt(x.a); pt(x.b); n++; } });
    arr(mod.conexoes).concat(arr(mod.bases)).concat(arr(mod.calcos)).forEach(function (c) { if (set[c.id] && c.pos) { pt(c.pos); n++; } });
    if (!n) return null;
    var c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
    return { centro: c, raio: Math.max(1.5, hyp(hyp(mx[0] - mn[0], mx[1] - mn[1]), mx[2] - mn[2]) / 2), n: n };
  }

  /* ================================================================ CÓPIA DO COMPONENTE
   * A cópia do editor (Copiar/Matriz/Colar) clona as caixas COM o prontaInfo: a aprovação viria junto, com o cartão verde de
   * um andaime que ninguém inspecionou. A cabeça da cópia se reconhece por prontaInfo.ref.id ≠ o id dela (o ref guarda a 1ª
   * peça do ORIGINAL). Duplicar = rascunho, com a anotação no histórico de quem é a origem. */
  function aprovacaoDaCopia(info, quando, quem) {
    var Ad = AD(), A = Ad && Ad.Aprovacao; if (!A) return null;
    var orig = info && info.aprovacao ? A.ler(info.aprovacao) : null, n = A.nova();
    n.historico.push({ quando: quando || A.relogio(), quem: quem || "sistema (cópia do componente)", acao: "copia", de: orig ? orig.estado : null, para: "rascunho", obs: "andaime copiado: a aprovação e o cartão do original NÃO valem para a cópia" + (orig && orig.estado && orig.estado !== "rascunho" ? " (o original estava " + orig.estado.replace("_", " ") + ")" : "") });
    return n;
  }
  function duplicarInfo(info, quando, quem) {
    var i = clone(info || {}); i.aprovacao = aprovacaoDaCopia(info, quando, quem); i.copiaDe = info && info.id ? info.id : null;
    return i;
  }
  /* as caixas-cabeça que são cópias ainda não tratadas */
  function copiasDe(caixas) {
    return arr(caixas).filter(function (c) {
      if (!c || !c.prontaInfo || c.prontaInfo.tipo !== "andaime") return false;
      var rf = c.prontaInfo.ref; return !!(rf && rf.id != null && String(rf.id) !== String(c.id));
    });
  }
  /* as ops que tratam as cópias: apagar + criar a cabeça com o prontaInfo novo (rascunho, ref e origem do par no lugar da cópia).
     Idempotente: depois disto ref.id == id e a cabeça deixa de ser cópia. */
  function opsDeCopias(caixas, quando) {
    var ops = [];
    copiasDe(caixas).forEach(function (c) {
      var inf = duplicarInfo(c.prontaInfo, quando), rf = c.prontaInfo.ref, par = clone(inf.par || {});
      par.x0 = r3(num(par.x0, 0) + num(c.cx, 0) - num(rf.cx, 0)); par.y0 = r3(num(par.y0, 0) + num(c.cy, 0) - num(rf.cy, 0)); par.z0 = r3(num(par.z0, 0) + num(c.cz, 0) - num(rf.cz, 0));
      inf.par = par; inf.ref = { id: c.id, cx: c.cx, cy: c.cy, cz: c.cz };
      var nc = clone(c); nc.prontaInfo = inf;
      ops.push({ op: "apagar", id: c.id }, { op: "criar", id: c.id, caixa: nc });
    });
    return ops;
  }

  /* ================================================================ CHECKLIST, APROVAÇÃO (cola com o AndaimeDocs) */
  /* ⚠ o cartão confere o HASH do par com o da liberação. O modelo (Andaime.montar) é montado SEM `calc`; o par guardado no componente
     (prontaInfo.par) leva o `calc`. Com o par do modelo o cartão de um andaime com V0 informado saía VERMELHO («alterado depois da
     liberação») mesmo liberado — medido no e2e. O cartão tem de ler o par DO COMPONENTE. */
  function cartaoHtmlDe(ap, modelo, parComp, cab, opc) {
    var Ad = AD(); if (!Ad) return ""; var m = Object.assign({}, modelo); m.par = parComp;
    return Ad.cartaoHtml(ap, m, cab, opc);
  }
  /* o cabeçalho dos documentos: o que a pessoa já preencheu; o resto vira placeholder vermelho nos documentos */
  function cabPadrao(cab) {
    var c = clone(cab || {}); ["obra", "local", "andaime", "revisao", "data", "responsavel", "empresa", "registro", "art", "tituloProfissional", "proprietario"].forEach(function (k) { if (c[k] == null) c[k] = ""; });
    if (c.reserva == null || c.reserva === "") c.reserva = 0; return c;
  }
  /* O CABEÇALHO que vale AGORA (carimbo das pranchas, memorial, cartão). Campo vazio é preenchido, nesta ordem:
     1) registro/ART da APROVAÇÃO do projeto (ap.projeto, NR-18 18.12.2); 2) o cadastro da empresa do usuário (Empresa.dados: nome, responsável,
     título, CREA) — a mesma fonte das pranchas da Metálica. Nunca inventa: sem fonte, fica vazio (o carimbo mostra o campo em branco).
     Por quê: o RT informava CREA/ART só na aprovação e o carimbo das 5 folhas saía sem eles. */
  function cabPreenchido(cab, ap, empresa) {
    var c = cabPadrao(cab), pj = (ap && ap.projeto) || {}, e = empresa || {};
    function vazio(k) { return String(c[k] == null ? "" : c[k]).trim() === ""; }
    function pega(k, v) { if (vazio(k) && v != null && String(v).trim() !== "") c[k] = String(v).trim(); }
    pega("registro", pj.registro); pega("art", pj.art);
    pega("empresa", e.nome); pega("responsavel", e.responsavel); pega("tituloProfissional", e.titulo); pega("registro", e.crea);
    return c;
  }
  /* o estado de cada item do checklist «antes»: {id, resposta, obs} cruzando a lista do AndaimeDocs com as respostas gravadas */
  function checklistComRespostas(modelo, par, ap) {
    var Ad = AD(); if (!Ad) return { ok: false, itens: [] };
    var A = Ad.Aprovacao, a = A.ler(ap), ck = Ad.checklist(modelo, par, {});
    if (!ck.ok) return ck;
    var itens = ck.itens.map(function (it) {
      var o = clone(it), R = a.respostas && a.respostas.antes ? a.respostas.antes[it.id] : null;
      o.resposta = R ? R.resposta : null; o.obsResp = R ? R.obs : ""; return o;
    });
    var pend = A.pendencias(a, ck.itens);
    return { ok: true, itens: itens, grupos: ck.grupos, naoConformes: pend.nc.length, semResposta: pend.semResposta.length };
  }

  var AndaimeTela = {
    LADOS: LADOS, ROT_LADO: ROT_LADO, ALTURA_MIN: ALTURA_MIN, ALTURA_MAX: ALTURA_MAX, TRECHO_MIN: TRECHO_MIN, PENDENCIAS_RT: PENDENCIAS_RT, COR_ESTADO: COR_ESTADO, ROT_ESTADO: ROT_ESTADO, VEL_SUBIDA: VEL_SUBIDA,
    novo: novo, clicar: clicar, voltar: voltar, alternarLado: alternarLado, setAltura: setAltura, podeFechar: podeFechar, cancelar: cancelar, nMin: nMin,
    pontosComCursor: pontosComCursor, parDe: parDe, previa: previa, avancar: avancar, segmentos: segmentos, alturaTotal: alturaTotal,
    resultado: resultado, recalcular: recalcular, calcDe: calcDe, mudancasLista: mudancasLista, desfazerMudanca: desfazerMudanca,
    pendenciasRT: pendenciasRT, defsRT: defsRT, PENDENCIAS_RT_MULTI: PENDENCIAS_RT_MULTI, aplicarPendencia: aplicarPendencia,
    setSistema: setSistema, sistemaDe: sistemaDe, ROT_SISTEMA: ROT_SISTEMA, trocarSistema: trocarSistema, PARAMETROS_MULTI: PARAMETROS_MULTI, largurasDaLinha: largurasDaLinha, aplicarParametrosMulti: aplicarParametrosMulti, v0DoLocal: v0DoLocal, aplicarLocalVento: aplicarLocalVento, reagirAoDado: reagirAoDado, verificacoes: verificacoes, problemas: problemas, aplicarCorrecao: aplicarCorrecao,
    pintura: pintura, primitivas: primitivas, caixaDe: caixaDe,
    cartaoHtmlDe: cartaoHtmlDe, aprovacaoDaCopia: aprovacaoDaCopia, duplicarInfo: duplicarInfo, copiasDe: copiasDe, opsDeCopias: opsDeCopias, cabPadrao: cabPadrao, cabPreenchido: cabPreenchido, checklistComRespostas: checklistComRespostas
  };
  global.AndaimeTela = AndaimeTela;
  if (typeof module !== "undefined" && module.exports) module.exports = AndaimeTela;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
