/* =====================================================================
 * madtelhadodesenhado.js — O TELHADO DESENHADO NO BIM VIRA A ESTRUTURA DO MOTOR DE MADEIRA. Motor PURO (ES5, sem DOM, Node-testável).
 *
 * Pedido do Rogério (17/11/2026): "todo telhado desenhado no BIM → motores novos": o telhado desenhado por qualquer método (contorno, paredes, edificação, 1 água por
 * beiral…) gera a estrutura de madeira pelos motores T1/T2/T3/T4 (NBR 7190), com os SÓLIDOS CORTADOS do js/madencaixe.js (encaixe de carpinteiro), no lugar das
 * peças do SINAPI com seção trocada. Decisões, critérios e fontes: docs/madeira/TELHADO-DESENHADO-REFERENCIA.md.
 *
 * O QUE FAZ (sem duplicar o que já existe):
 *   1) escolher()      — a TIPOLOGIA AUTOMÁTICA pela forma e pelo vão (1 água → laço/T1; 2 águas → T2 Fink simples até o limite do painel, Pratt acima; 4 águas → T3) e a
 *                         troca MANUAL (cfg.tesoura), com o critério e a fonte escritos no resultado;
 *   2) payload()       — o que o cálculo guarda para refazer a geometria: a ENTRADA do motor (params) e as seções por grupo (res.secoes) — pequeno, sem lista dentro de lista;
 *   3) geometriaMundo()— refaz os membros do motor (MadTipologias.T2 / MadT3), corta os sólidos (MadEncaixeTip.resolverT3) e leva tudo para o sistema da obra: o frechal
 *                         assenta no TOPO DA PAREDE (a estrutura inteira sobe o que for preciso), a pilha caibro/ripa/telha começa no plano do topo dos banzos/terças
 *                         (terça EMBUTIDA no plano do banzo), peça que cairia dentro da parede (pilar sobre parede, contraventamento da parede) não vira peça;
 *   4) conferirEncontros() — nenhum vértice de peça dentro de parede ou laje (contato face a face é permitido);
 *   5) migrar()        — o telhado que já tinha cálculo da versão 1 ganha a geometria do motor SEM apagar nada (guarda a cópia do cálculo anterior; idempotente).
 * Quem usa: js/bimtelhadoestrut.js (modelar) e js/madcobertura.js (preparar/concluirMotor). Teste: node tools/test-telhado-desenhado-madeira.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function ME() { return dep("MadEncaixe", "./madencaixe.js"); }
  function TP() { return dep("MadEncaixeTip", "./madencaixetip.js"); }
  function MT() { return dep("MadTipologias", "./madtipologias.js"); }
  function T3() { return dep("MadT3", "./madt3.js"); }
  function T3L() { return dep("MadT3L", "./madt3l.js"); }
  function MC() { return dep("MadCobertura", "./madcobertura.js"); }
  function BT() { return dep("BimTelhado", "./bimtelhado.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function virg(v, c) { c = c == null ? 2 : c; var x = Number(v); return isFinite(x) ? x.toFixed(c).replace(".", ",") : "—"; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  var VERSAO = 1;
  /* grupo do motor → papel da peça do BIM (as mesmas palavras que o resto do modelo já usa) */
  var PAPEL = { BS: "perna", MS: "perna", BI: "linha", MI: "linha", PD: "pendural", MP: "pendural", DG: "escora", MG: "escora", T: "terca", E: "espigao", RC: "espigao", FR: "frechal", CM: "cumeeira", CB: "caibro-agua", CUBO: "cubo", CHAPA: "chapa-radial",
    P: "pilar", PO: "pilar", PC: "pilar", LB: "contravento", DX: "contravento", DV: "contravento", DP: "contravento" };
  var TOPO_PLANO = { BS: 1, MS: 1, T: 1 };      /* os grupos cujo TOPO define o plano onde assenta o caibro (a terça é embutida no plano do banzo) */
  var TOL_PAREDE = 0.005;                       /* 5 mm: contato face a face não é interpenetração */
  var FONTE_FINK = "FINK-REFERENCIA.md §2 e §6 (adoção do RT no módulo: painel do banzo superior ≤ 2,5 m; Fink simples = 1 W, a mais econômica medida: −17,2 % sobre a Pratt no caso de referência); USP/NUTAU (fonte secundária): tesoura W para vãos de até 12 m";
  var FONTE_PRATT = "Pratt: padrão do módulo e a mais barata acima do limite da Fink simples (a Howe sai ~1 % mais cara que a Pratt na mesma geometria — HOWE-REFERENCIA/FINK-REFERENCIA §6; a Fink dupla não fechou o caso 12 × 12 m em 16 iterações)";

  /* ======================================================================
   * 1) TIPOLOGIA AUTOMÁTICA
   * ====================================================================== */
  /** vão máximo (m) da Fink SIMPLES: nF = 2 ⇔ (b/2)·√(1+i²) ≤ 2 × 2,5 m  ⇒  b ≤ 10 / √(1+i²). Lê o limite do próprio motor (FINK_PAINEL_MAX). */
  function limiteFinkSimples(inclPct) {
    var M = MT(), pm = M && M.T2 && M.T2.FINK_PAINEL_MAX ? M.T2.FINK_PAINEL_MAX : 2.5, i = num(inclPct, 30) / 100;
    return 4 * pm / Math.sqrt(1 + i * i);     /* nF = 2 painéis de ≤ pm por água ⇒ (b/2)·√(1+i²) ≤ 2·pm ⇒ b ≤ 4·pm/√(1+i²) */
  }
  /**
   * lido = MadCobertura.lerTelhado; ap = detectarApoio; cfg = o que o usuário sobrescreveu; tr = trama (espTerca).
   * → { tipo, apoio, via: "motor"|"laco", variante: "pratt"|"howe"|"fink"|null, auto, criterio, fonte, aviso? }
   */
  function escolher(lido, ap, cfg, tr) {
    cfg = cfg || {};
    var R = { tipo: lido.tipo, apoio: ap && ap.tipo || null, via: "laco", variante: null, auto: true, criterio: "", fonte: "" };
    if (lido.tipo === "T1") {
      R.criterio = "1 água (vão " + virg(lido.b) + " m): sem tesoura — terças contínuas sobre as paredes/pontaletes (laço de cálculo; o T1 do módulo é o quiosque de pilares, não a cobertura de 1 água de parede)";
      R.fonte = "COBERTURA-BIM-REFERENCIA.md (decisão do sistema por apoio)"; return R;
    }
    if (!ap || !(ap.tipo === "paredes" || (ap.tipo === "pilares" && (lido.tipo === "T4" || (lido.tipo === "T2" && cfg._quiosque)))) || cfg.sistema === "laco") {
      R.criterio = (lido.tipo === "T2" ? "2 águas" : "4 águas") + " com apoio " + (ap && ap.tipo || "—") + ": " + (ap && ap.tipo === "laje" ? "terças sobre pontaletes na laje" : "vigas sobre pilares + terças") + " (a tesoura só vence o vão apoiada nas paredes)";
      R.fonte = "COBERTURA-BIM-REFERENCIA.md (apoio detectado no modelo)"; return R;
    }
    R.via = "motor";
    var man = cfg.tesoura === "pratt" || cfg.tesoura === "howe" || cfg.tesoura === "fink";
    if (lido.tipo === "T3L") {
      var vL = man && cfg.tesoura !== "fink" ? cfg.tesoura : "pratt";
      R.variante = vL; R.auto = !(man && cfg.tesoura !== "fink");
      R.criterio = "4 águas em planta em L (asa A " + virg(lido.a) + " × " + virg(lido.b) + " m, asa B " + virg(lido.bb) + " × " + virg(lido.c) + " m): T3L, com RINCÃO no canto côncavo e calha — " + (R.auto ? "tesoura Pratt (a Fink só existe para 2 águas)" : "tesoura " + vL + " escolhida pelo usuário") + (Math.abs(lido.b - lido.bb) < 1e-6 ? "; asas de larguras iguais" : "; cumeeira B mais baixa que a A (asas de larguras diferentes)");
      if (man && cfg.tesoura === "fink") R.aviso = "Tesoura Fink só existe para 2 águas; na planta em L usei Pratt.";
      R.fonte = "T3L-REFERENCIA.md"; return R;
    }
    if (lido.tipo === "T3TU") {
      var vU = man && cfg.tesoura !== "fink" ? cfg.tesoura : "pratt";
      R.variante = vU; R.auto = !(man && cfg.tesoura !== "fink");
      R.criterio = (lido.anel ? "4 águas em ANEL (pátio retangular " + virg(lido.a) + " × " + virg(lido.c) + " m, faixas " + virg(lido.b) + " e " + virg(lido.wV) + " m): T3TU, com um RINCÃO em cada canto do pátio e calha interna — " : "4 águas em planta em " + lido.planta + " (barra " + virg(lido.a) + " × " + virg(lido.b) + " m, " + arr(lido.legs).length + " perna(s)): T3TU, com um RINCÃO em cada canto côncavo e calha — ") + (R.auto ? "tesoura Pratt (a Fink só existe para 2 águas)" : "tesoura " + vU + " escolhida pelo usuário");
      if (man && cfg.tesoura === "fink") R.aviso = "Tesoura Fink só existe para 2 águas; na planta em " + lido.planta + " usei Pratt.";
      R.fonte = "T3TU-REFERENCIA.md"; return R;
    }
    if (lido.tipo === "T3") {
      var vt = man && cfg.tesoura !== "fink" ? cfg.tesoura : "pratt";
      R.variante = vt; R.auto = !(man && cfg.tesoura !== "fink");
      R.criterio = "4 águas retangular (" + virg(lido.a) + " × " + virg(lido.b) + " m): T3 — " + (R.auto ? "tesoura Pratt (a Fink só existe para 2 águas)" : "tesoura " + vt + " escolhida pelo usuário");
      if (man && cfg.tesoura === "fink") R.aviso = "Tesoura Fink só existe para 2 águas; nas 4 águas usei Pratt.";
      R.fonte = "T3-REFERENCIA.md"; return R;
    }
    if (lido.tipo === "T4") {
      var pil = ap.tipo === "pilares", fe = cfg.fechamento === "aberto" || cfg.fechamento === "fechado" ? cfg.fechamento : (pil ? "aberto" : "fechado");
      R.variante = null; R.fechamento = fe; R.auto = cfg.fechamento !== "aberto" && cfg.fechamento !== "fechado";
      R.criterio = (lido.n === 6 ? "Sextavado" : "Oitavado") + " regular (raio " + virg(lido.R) + " m): T4 — " + (R.auto ? (pil ? "cobertura ABERTA (pilares do modelo nos vértices)" : "edificação FECHADA (paredes embaixo; o aberto só por escolha)") : "vento " + fe + " escolhido pelo usuário") + "; ápice em cubo de aço";
      R.fonte = "T4-REFERENCIA.md (o fechamento não tem padrão no módulo: adotado FECHADO sobre paredes)"; return R;
    }
    /* T2 — 2 águas */
    var lim = limiteFinkSimples(lido.incl), MTp = MT(), esp = tr && tr.espTerca ? tr.espTerca : 1.4, nF = MTp && MTp.T2 && MTp.T2.finkPaineis ? MTp.T2.finkPaineis(lido.b, lido.incl / 100, esp).nF : (lido.b <= lim ? 2 : 3);
    if (man) {
      R.variante = cfg.tesoura; R.auto = false;
      R.criterio = "2 águas, vão " + virg(lido.b) + " m: tesoura " + cfg.tesoura + " escolhida pelo usuário (a automática seria " + (nF === 2 ? "Fink simples" : "Pratt") + ")";
      R.fonte = "escolha do usuário";
      if (ap.tipo === "pilares") { R.quiosque = true; R.criterio += " — QUIOSQUE aberto: tesoura apoiada no frechal (viga) sobre os pilares do modelo"; }
      return R;
    }
    if (ap.tipo === "pilares") R.quiosque = true;   /* quiosque aberto: a tesoura assenta no frechal (viga) sobre os pilares do modelo */
    if (nF === 2) {
      R.variante = "fink"; R.criterio = "2 águas, vão " + virg(lido.b) + " m (inclinação " + virg(lido.incl, 1) + " %): nF = " + nF + " painel(is) de alma por água (banzo superior ≤ 2,5 m) ⇒ tesoura FINK simples (W); vale até " + virg(lim) + " m de vão"; R.fonte = FONTE_FINK;
    } else {
      R.variante = "pratt"; R.criterio = "2 águas, vão " + virg(lido.b) + " m (inclinação " + virg(lido.incl, 1) + " %): nF = " + nF + " (> 2: a Fink simples só vai até " + virg(lim) + " m) ⇒ tesoura PRATT"; R.fonte = FONTE_PRATT;
    }
    if (R.quiosque) R.criterio += " — QUIOSQUE aberto: tesoura apoiada no frechal (viga) sobre os pilares do modelo";
    return R;
  }

  /* ======================================================================
   * 2) O QUE O CÁLCULO GUARDA (pequeno, sem lista dentro de lista)
   * ====================================================================== */
  function arred(o) {
    if (typeof o === "number") return Math.round(o * 1e6) / 1e6;
    if (Array.isArray(o)) return o.map(arred);
    if (o && typeof o === "object") { var r = {}; Object.keys(o).forEach(function (k) { r[k] = arred(o[k]); }); return r; }
    return o;
  }
  function payload(prep, res) {
    if (!prep || !prep.lido || !res || !res.secoes || !prep.sol || !prep.sol.proj || !prep.sol.proj.params) return null;
    var tip = prep.lido.tipo; if (tip !== "T2" && tip !== "T3" && tip !== "T3L" && tip !== "T3TU" && tip !== "T4") return null;
    /* `entrada` = os campos do módulo Madeira (est.t2 / est.t3) desta mesma entrada: o módulo, aberto com eles, devolve as pranchas, o memorial e o orçamento IGUAIS aos das tipologias publicadas */
    var campos = prep.estadoMad && prep.estadoMad[tip === "T2" ? "t2" : (tip === "T4" ? "t4" : "t3")];      /* T3L usa os campos est.t3 com planta "L" */
    return { v: VERSAO, tip: tip, variante: prep.tesoura || null, origem: "calculado", apoio: prep.apoio ? prep.apoio.tipo : null, sTes: prep.sTes, params: arred(clone(prep.sol.proj.params)), sec: arred(clone(res.secoes)), entrada: campos ? arred(clone(campos)) : null };
  }
  function payloadValido(m) {
    return !!m && typeof m === "object" && m.v === VERSAO && (m.tip === "T2" || m.tip === "T3" || m.tip === "T3L" || m.tip === "T3TU" || m.tip === "T4") && !!m.params && typeof m.params === "object" && !!m.sec && typeof m.sec === "object" && (m.tip === "T4" ? fin(Number(m.params.R)) : (fin(Number(m.params.a)) && fin(Number(m.params.b)) && (m.tip !== "T3L" || (fin(Number(m.params.c)) && fin(Number(m.params.bb)))) && (m.tip !== "T3TU" || (Array.isArray(m.params.legs) && m.params.legs.length >= 1 && m.params.legs.every(function (L) { return fin(Number(L.x0)) && fin(Number(L.w)) && fin(Number(L.c)); })))));
  }

  /* ======================================================================
   * 3) A GEOMETRIA DO MOTOR NO SISTEMA DA OBRA
   * ====================================================================== */
  var CACHE_R = [], CACHE_M = [];
  function chaveMotor(m) { try { return JSON.stringify([m.tip, m.params, m.sec]); } catch (e) { return null; } }
  /* O CÁLCULO PESADO (geometria do motor + sólidos cortados do madencaixe: 0,35 a 0,8 s a frio) — uma função só, a MESMA no Worker (js/madengworker.js) e na página/Node.
     Só depende do payload do motor (params + sec), por isso roda em qualquer lugar. A `cfg` do resolvedor (funções de posto/folga) não é guardada: ninguém a lê depois do cálculo e função não atravessa o postMessage. */
  function calcularMotor(m) {
    var r;
    if (m.tip === "T4") r = resolverT4(m);
    else {
      var TPp = TP(), Mt = MT(), T3p = T3(); if (!TPp || !Mt || !T3p) throw new Error("os motores de madeira (madencaixetip/madtipologias/madt3) não carregaram");
      var TLp = T3L(), TUp = dep("MadT3TUMembros", "./madt3tumembros.js"); if (m.tip === "T3L" && !TLp) throw new Error("o motor da planta em L (madt3l) não carregou"); if (m.tip === "T3TU" && !TUp) throw new Error("o motor da planta em T/U (madt3tumembros) não carregou");
      var G = m.tip === "T2" ? Mt.T2.geometria(clone(m.params)) : (m.tip === "T3L" ? TLp.geometria(clone(m.params)) : (m.tip === "T3TU" ? TUp.geometriaMembros(clone(m.params)) : T3p.geometria(clone(m.params))));
      r = TPp.resolverT3(G, clone(m.sec)); delete r.cfg;
    }
    return r;
  }
  function guardarMotor(k, r) { if (!k) return; for (var i = CACHE_R.length - 1; i >= 0; i--) if (CACHE_R[i].k === k) CACHE_R.splice(i, 1); CACHE_R.unshift({ k: k, r: r }); if (CACHE_R.length > 4) CACHE_R.length = 4; }
  function emCache(m) { var k = chaveMotor(m); if (k) for (var i = 0; i < CACHE_R.length; i++) if (CACHE_R[i].k === k) return true; return false; }
  function resolverMotor(m) {
    var k = chaveMotor(m);
    if (k) for (var i = 0; i < CACHE_R.length; i++) if (CACHE_R[i].k === k) return CACHE_R[i].r;
    var r = calcularMotor(m); guardarMotor(k, r); return r;
  }
  /* JSON que leva Infinity/NaN ({"$nf":"Infinity"}) e traz de volta; `_espigaoDesceM` (propriedade solta do array de peças do T4) volta de r.espigaoDesceM */
  function paraTexto(r) { return JSON.stringify(r, function (k, v) { return typeof v === "number" && !isFinite(v) ? { "$nf": String(v) } : v; }); }
  function deTexto(t) {
    var r = JSON.parse(t, function (k, v) { return v && typeof v === "object" && !Array.isArray(v) && typeof v["$nf"] === "string" && Object.keys(v).length === 1 ? Number(v["$nf"]) : v; });
    if (r && r.pecas && r.espigaoDesceM != null) r.pecas._espigaoDesceM = r.espigaoDesceM;
    return r;
  }
  /** guarda no cache o resultado que veio do Worker (texto JSON de calcularMotor): a próxima geometriaMundo() acha tudo pronto, igual ao cálculo síncrono */
  function semearMotor(m, texto) { var k = chaveMotor(m); if (!k) return false; guardarMotor(k, deTexto(texto)); return true; }
  function cacheMotor() { return CACHE_R.map(function (c) { return { k: c.k, r: c.r }; }); }

  /* ------ O CÁLCULO EM SEGUNDO PLANO (a tela não para): pede ao Worker (js/madengworker.js, mensagem "geometria"), semeia o cache e avisa. Sem Worker (Node/testes) = a mesma função, síncrona. */
  var PEND = {}, FEITO = {}, CBS = {}, FORCAR = {};
  function assincrono() { return typeof global.Worker === "function" && typeof global.document !== "undefined" && !global.__madSemWorker; }
  function statusTela(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) { /* sem painel */ } }
  function verPagina() { try { var mv = /[?&]v=([^&]+)/.exec(String(global.location && global.location.search || "")); return mv ? "?v=" + mv[1] : ""; } catch (e) { return ""; } }
  function chamarPronto(k, r) { var l = CBS[k] || []; delete CBS[k]; l.forEach(function (cb) { try { cb(r); } catch (e) { /* callback da tela não derruba o cálculo */ } }); }
  /** quantos cálculos de geometria estão em segundo plano agora */
  function pendentes() { return Object.keys(FORCAR).length; }
  /** orçamento, exportação e pranchas NÃO leem a geometria provisória (SINAPI): quem precisa da geometria já chama isto — termina TODOS os cálculos em andamento de forma síncrona (sem refazer a tela: o aviso é descartado). Devolve quantos terminou. */
  function completarAgora() { var ks = Object.keys(FORCAR), n = 0; ks.forEach(function (k) { var f = FORCAR[k]; if (f) { f(); n++; } }); return n; }
  /** true = ficou calculando em segundo plano (aoPronto avisa quando o cache estiver pronto); false = já estava no cache ou foi calculado na hora (aoPronto já foi chamado).
      opc = { criarWorker (injeta o Worker: testes), tempoMs, silencioso }. Uma vez por chave por sessão: depois disso um miss é síncrono, como sempre foi (nunca entra em laço). */
  function aquecer(motor, aoPronto, opc) {
    opc = opc || {};
    var k = chaveMotor(motor);
    if (!k || !payloadValido(motor)) { if (aoPronto) aoPronto({ ok: false, motivo: "sem geometria do motor" }); return false; }
    if (emCache(motor)) { if (aoPronto) aoPronto({ ok: true, cache: true }); return false; }
    if (aoPronto) (CBS[k] = CBS[k] || []).push(aoPronto);
    if (PEND[k]) return true;                       /* já tem um cálculo em andamento para esta chave */
    var fabrica = opc.criarWorker || (assincrono() && !FEITO[k] ? function () { return new global.Worker("js/madengworker.js" + verPagina()); } : null), wk = null, tm = null;
    function fim() { if (tm) { try { clearTimeout(tm); } catch (e) { /* sem timer */ } tm = null; } try { if (wk && wk.terminate) wk.terminate(); } catch (e2) { /* já encerrado */ } wk = null; }
    function sincrono(motivo) {
      fim(); delete PEND[k]; delete FORCAR[k]; FEITO[k] = true;
      var ok = true, msg = null; try { resolverMotor(motor); } catch (e) { ok = false; msg = e && e.message ? e.message : String(e); }
      if (!opc.silencioso) statusTela(ok ? "Madeira do motor: geometria pronta." : "Madeira do motor: " + msg);
      chamarPronto(k, { ok: ok, sincrono: true, motivo: ok ? motivo : msg });
    }
    if (!fabrica) { sincrono(null); return false; }
    PEND[k] = true; FORCAR[k] = function () { delete CBS[k]; sincrono("forçado: alguém precisa da geometria agora"); };
    if (!opc.silencioso) statusTela("Madeira do motor: calculando…");
    try { wk = fabrica(); } catch (eW) { wk = null; }
    if (!wk) { sincrono("o navegador recusou o processo paralelo"); return false; }
    wk.onmessage = function (ev) {
      var m = ev && ev.data || {};
      if (m.tipo === "fim-geometria") {
        var ok = false, msg = null; fim();
        try { ok = semearMotor(motor, m.texto); } catch (e) { ok = false; msg = e && e.message ? e.message : String(e); }
        if (!ok) { sincrono(msg || "resultado do Worker ilegível"); return; }
        delete PEND[k]; delete FORCAR[k]; FEITO[k] = true; if (!opc.silencioso) statusTela("Madeira do motor: geometria pronta.");
        chamarPronto(k, { ok: true, worker: true, ms: m.ms });
      } else if (m.tipo === "erro") sincrono(m.mensagem || "o Worker falhou");
    };
    wk.onerror = function (ev) { if (ev && ev.preventDefault) ev.preventDefault(); sincrono("o processo paralelo falhou"); };
    if (typeof setTimeout === "function") tm = setTimeout(function () { if (PEND[k]) sincrono("o processo paralelo não respondeu em " + Math.round((opc.tempoMs || 60000) / 1000) + " s"); }, opc.tempoMs || 60000);
    try { wk.postMessage({ tipo: "geometria", id: k.length, motor: { v: motor.v, tip: motor.tip, variante: motor.variante, params: motor.params, sec: motor.sec } }); } catch (eP) { sincrono("não consegui enviar ao processo paralelo"); return false; }
    return !!PEND[k];
  }

  /* T4 (sextavado/oitavado): os membros APARADOS do próprio motor (folga ≥ 10 mm do cubo do ápice e dos vizinhos: MadT4Lig.aparar) viram peças prismáticas; a conferência mede o volume comum par a par */
  function resolverT4(m) {
    var Me = ME(), T4m = dep("MadT4", "./madt4.js"), LG = dep("MadT4Lig", "./madt4lig.js"); if (!Me || !T4m || !LG) throw new Error("os motores do T4 (madt4/madt4lig) não carregaram");
    var G = T4m.geometria(clone(m.params)), sec = clone(m.sec), ap = LG.aparar(G, sec), pecas = [], i, j;
    arr(ap.membros).forEach(function (mb) {
      var s = sec[mb.g]; if (!s || !(num(s.b, 0) > 0) || !(num(s.h, 0) > 0) || !PAPEL[mb.g]) return;
      /* frechal e terça vão pelo EIXO (sem o aparo de 10 mm): o resolvedor do madencaixe faz a esquadria do frechal no canto (bico) e corta a terça pela face do espigão (bisel); espigão e caibro ficam aparados (folga do cubo) */
      var eixo = mb.g === "FR" || mb.g === "T", a0 = eixo && mb.eixo0 ? mb.eixo0 : mb.p0, a1 = eixo && mb.eixo1 ? mb.eixo1 : mb.p1;
      var P = Me.criarPeca({ id: String(mb.id), g: mb.g, p0: a0.slice(), p1: a1.slice(), up: T4m.upDe(mb), b: s.b, h: s.h, rank: 50, excent: 0 }); Me.solidoDe(P); pecas.push(P);
    });
    /* ESPIGÃO com o topo no plano das terças: o motor deixa o espigão (12 × 30) acima do plano; desce o que passa (o resolvedor rebaixa o que encostar no frechal) */
    (function () {
      var pr = m.params, I = G.info, n = pr.n, Hp = pr.peDireito + pr.baseZ, ap0 = pr.apotema || I.ap || (pr.R * Math.cos(Math.PI / n)), cx = I.cx, cz = I.cz, be = Math.PI / n;
      function zRoof(x, y) { var dmin = Infinity, k; for (k = 0; k < n; k++) { var psi = -Math.PI / 2 - be + 2 * be * k + be, d = ap0 - ((x - cx) * Math.cos(psi) + (y - cz) * Math.sin(psi)); if (d < dmin) dmin = d; } return Hp + pr.incl * dmin; }
      function topo(g) { var mx = -Infinity; pecas.forEach(function (P) { if (P.g !== g) return; Me.vertices(Me.solidoDe(P)).forEach(function (q) { var d = q[2] - zRoof(q[0], q[1]); if (d > mx) mx = d; }); }); return mx; }
      var dT = topo("T"), dE = topo("E"), dl = dE - dT;
      if (isFinite(dl) && dl > 0.002) pecas.forEach(function (P) { if (P.g === "E") { P.p0 = [P.p0[0], P.p0[1], P.p0[2] - dl]; P.p1 = [P.p1[0], P.p1[1], P.p1[2] - dl]; Me.invalidar(P); Me.solidoDe(P); } });
      pecas._espigaoDesceM = isFinite(dl) && dl > 0.002 ? dl : 0;
    })();
    /* cruzamentos que o aparo do motor não trata (diagonais de contraventamento × espigão, terça × caibro…): o resolvedor do madencaixe corta a convidada de postos menores contra a hospedeira (as regras do T3) */
    /* diagonais em X: a primeira fica no plano e a SEGUNDA é deslocada meia altura de cada uma ao longo da normal do plano (arranjo do T3: uma no plano, a outra encostada) */
    var dxs = pecas.filter(function (P) { return P.g === "DX" || P.g === "DP"; }), movida = {};   /* DX (águas) e DP (painéis de parede sem parede: T4 sobre pilares) */
    function deslocar(B, v, d) { B.p0 = [B.p0[0] + v[0] * d, B.p0[1] + v[1] * d, B.p0[2] + v[2] * d]; B.p1 = [B.p1[0] + v[0] * d, B.p1[1] + v[1] * d, B.p1[2] + v[2] * d]; Me.invalidar(B); Me.solidoDe(B); }
    for (i = 0; i < dxs.length; i++) for (j = i + 1; j < dxs.length; j++) {
      var A0 = dxs[i], B = dxs[j]; if (A0.g !== B.g || movida[B.id] || movida[A0.id] || !(Me.volInterPecas(A0, B) > 1e-8)) continue;
      var d0 = (A0.h + B.h) / 2 + 0.0005, cand = [], ok = false, c, d = d0, fk; [1, 1.25, 1.6, 2.2].forEach(function (f) { [B, A0].forEach(function (alvo) { cand.push([alvo.ey, 1, f, alvo], [alvo.ey, -1, f, alvo], [A0.ey, 1, f, alvo], [A0.ey, -1, f, alvo]); }); });
      cand.sort(function (x, y) { return x[2] - y[2] || (y[0][2] * y[1]) - (x[0][2] * x[1]); });   /* a menor folga primeiro e, nela, para CIMA (nunca para dentro da parede) */
      for (c = 0; c < cand.length && !ok; c++) {
        d = d0 * cand[c][2]; deslocar(cand[c][3], cand[c][0], cand[c][1] * d);
        if (Me.volInterPecas(A0, B) <= 1e-8) { ok = true; movida[cand[c][3].id] = 1; } else deslocar(cand[c][3], cand[c][0], -cand[c][1] * d);
      }
    }
    var RANK = { P: 100, PC: 100, FR: 90, E: 80, CB: 70, T: 60, DX: 40, DP: 40 }, rel = null;
    pecas.forEach(function (P) { P.rank = (RANK[P.g] || 40) + ((P.g === "DX" || P.g === "DP") ? (parseInt(String(P.id).replace(/\D/g, ""), 10) % 2 ? 1 : 0) : 0); });   /* DX de números ímpares hospedam as pares: o par que se cruza no encontro de duas águas não tem postos iguais (sem esquadria) */
    try { rel = Me.resolver(pecas, { rank: function (P) { return P.rank; }, folga: function () { return 0; }, livre: function () { return null; }, apoios: null }); } catch (eR) { rel = null; }
    /* O CUBO DE AÇO DO ÁPICE e as CHAPAS RADIAIS (docs T4 §3): tubo Ø114,3 vertical de Hap−0,40 a Hap+0,15 m e, em cada espigão, a chapa t = 8 mm em fenda no plano vertical do espigão, do tubo até 0,25 m além do fim aparado dele */
    var CB0 = T4m.CUBO, Ia = G.info, hub = [Ia.cx, Ia.cz, Ia.Hap], aco = [];
    var tubo = Me.criarPeca({ id: "CUBO", g: "CUBO", p0: [hub[0], hub[1], hub[2] - CB0.desce], p1: [hub[0], hub[1], hub[2] + CB0.sobe], up: [1, 0, 0], d: CB0.d, rank: 120, excent: 0 }); tubo.aco4 = true; Me.solidoDe(tubo); aco.push(tubo);
    pecas.filter(function (P) { return P.g === "E"; }).forEach(function (E) {
      var ex = Me.v.un(Me.v.sub(E.p0, E.p1)), r0 = CB0.d / 2, fim = Math.sqrt(Math.pow(E.p1[0] - hub[0], 2) + Math.pow(E.p1[1] - hub[1], 2) + Math.pow(E.p1[2] - hub[2], 2)), Lc = fim + 0.25;
      var hz = Math.sqrt(ex[0] * ex[0] + ex[1] * ex[1]) || 1, a0 = Me.v.add(hub, Me.v.mul(ex, r0 / hz)), a1 = Me.v.add(hub, Me.v.mul(ex, r0 / hz + Lc));
      var up = E.ey, pl = Me.criarPeca({ id: "CH-" + E.id, g: "CHAPA", p0: a0, p1: a1, up: up, b: 0.008, h: 0.10, rank: 110, excent: 0 }); pl.aco4 = true; pl.slotEm = E.id; Me.solidoDe(pl); aco.push(pl);
    });
    aco.forEach(function (P) { pecas.push(P); });
    var inter = [];
    for (i = 0; i < pecas.length; i++) for (j = i + 1; j < pecas.length; j++) { if ((pecas[i].slotEm === pecas[j].id) || (pecas[j].slotEm === pecas[i].id) || (pecas[i].g === "CHAPA" && pecas[j].g === "CHAPA") || (pecas[i].aco4 && pecas[j].aco4)) continue;   /* tubo × chapa radial = SOLDA; chapa × chapa se encontram no eixo do tubo */ var v = Me.volInterPecas(pecas[i], pecas[j]); if (v > 1e-8) inter.push({ regra: "interpenetracao", a: pecas[i].id, b: pecas[j].id, volume_mm3: v * 1e9 }); }
    return { pecas: pecas, espigaoDesceM: pecas._espigaoDesceM || 0, conferencia: { ok: inter.length === 0, achados: inter, interpenetracoes: inter, porRegra: inter.length ? { interpenetracao: inter.length } : {} }, resolvedor: { naoResolvidos: rel ? arr(rel.naoResolvidos) : [] }, aparo: ap.resumo || null };
  }

  /* os retângulos das paredes e as lajes do modelo (para o encaixe) */
  function caixasDe(caixas) {
    var par = [], laj = [];
    arr(caixas).forEach(function (c) {
      if (!c) return;
      if (c.tipo === "parede") { var th = num(c.rotY, 0); par.push({ id: String(c.id), cx: num(c.cx, 0), cz: num(c.cz, 0), ux: Math.cos(th), uz: -Math.sin(th), hx: num(c.comprimento, 0) / 2, hz: num(c.espessura, 0.15) / 2, base: num(c.cy, 0) - num(c.altura, 0) / 2, topo: num(c.cy, 0) + num(c.altura, 0) / 2 }); }
      else if (c.tipo === "laje" || c.tipo === "forro") {
        var poli = null;
        if (arr(c.contorno).length >= 3) poli = c.contorno.map(function (q) { return [num(q.x, 0), num(q.z, 0)]; });
        else { var cx = num(c.cx, 0), cz = num(c.cz, 0), hx = num(c.comprimento, 0) / 2, hz = num(c.largura != null ? c.largura : c.profundidade, num(c.espessura, 0)) / 2, th2 = num(c.rotY, 0), ux = Math.cos(th2), uz = -Math.sin(th2); poli = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(function (q) { return [cx + q[0] * ux - q[1] * uz, cz + q[0] * uz + q[1] * ux]; }); }
        laj.push({ id: String(c.id), tipo: c.tipo, poli: poli, base: num(c.cy, 0) - num(c.altura, 0) / 2, topo: num(c.cy, 0) + num(c.altura, 0) / 2 });
      }
    });
    return { paredes: par, lajes: laj };
  }
  function noRet(w, x, z, tol) { var rx = x - w.cx, rz = z - w.cz, lx = rx * w.ux + rz * w.uz, lz = -rx * w.uz + rz * w.ux; return Math.abs(lx) <= w.hx + tol && Math.abs(lz) <= w.hz + tol; }
  /* O pilar do motor só some quando ASSENTA em parede de verdade (revisor 17/11/2026): a tolerância vale só na ESPESSURA (+2 cm), o comprimento é sem folga e o trecho com ABERTURA
     DE PORTA/PORTÃO (vão que parte do piso, peitoril ≤ 5 cm) não é apoio — o pilar do motor fica como peça. vaos = { <id da parede>: [{ x0, x1, y0 }] } (x ao longo da parede, do centro). */
  function apoioParede(w, x, z, vaos) {
    var rx = x - w.cx, rz = z - w.cz, lx = rx * w.ux + rz * w.uz, lz = -rx * w.uz + rz * w.ux;
    if (!(Math.abs(lx) <= w.hx + 0.005 && Math.abs(lz) <= w.hz + 0.02)) return false;   /* 5 mm = só o arredondamento do desenho (r4); o canto de 2 paredes tem o eixo no topo do comprimento */
    var vs = vaos && vaos[w.id]; if (vs) for (var i = 0; i < vs.length; i++) { var v = vs[i]; if (num(v.y0, 0) <= 0.05 && lx >= v.x0 - 1e-6 && lx <= v.x1 + 1e-6) return false; }
    return true;
  }
  function noPoli(p, P) { var c = false, i, j; for (i = 0, j = P.length - 1; i < P.length; j = i++) if (((P[i][1] > p[1]) !== (P[j][1] > p[1])) && (p[0] < (P[j][0] - P[i][0]) * (p[1] - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0])) c = !c; return c; }

  /** o quadro motor → obra: origem O, eixos u (a, ao longo da cumeeira/lado maior) e v (b, para dentro). x=0 é a empena "esq" (lado kA+1); y=0 é o beiral "frente" (lado kA). */
  function quadro(lido) {
    if (lido.tipo === "T4") {   /* o lado 0 do motor (embaixo, paralelo a X) = a aresta 0 do contorno; o centro (R, R) do motor = o centro do polígono */
      var P4 = lido.contorno, dx = P4[1][0] - P4[0][0], dz = P4[1][1] - P4[0][1], Lq = Math.sqrt(dx * dx + dz * dz) || 1, u4 = [dx / Lq, dz / Lq], v4 = [-u4[1], u4[0]];
      if ((lido.centro[0] - P4[0][0]) * v4[0] + (lido.centro[1] - P4[0][1]) * v4[1] < 0) v4 = [-v4[0], -v4[1]];
      return { O: [lido.centro[0] - lido.R * u4[0] - lido.R * v4[0], lido.centro[1] - lido.R * u4[1] - lido.R * v4[1]], u: u4, v: v4, det: -(u4[0] * v4[1] - u4[1] * v4[0]) };
    }
    if (lido.tipo === "T3TU") { var qU = lido.quadroTU; return { O: qU.O, u: qU.u, v: qU.v, det: -(qU.u[0] * qU.v[1] - qU.u[1] * qU.v[0]) }; }      /* T/U: o quadro canônico (barra larga ao longo de u) saiu do contorno em MadT3TUMembros.canonizar */
    if (lido.tipo === "T3L") { var qL = lido.quadroL; return { O: qL.O, u: qL.u, v: qL.v, det: -(qL.u[0] * qL.v[1] - qL.u[1] * qL.v[0]) }; }      /* L: o canto externo é a origem; a asa A ao longo de u e a asa B ao longo de v */
    var P = lido.contorno, kA = lido.kA, k1 = (kA + 1) % 4, k2 = (kA + 2) % 4, d = lido.eixoD || [0, 0, 0, 0];
    function un(a, b) { var dx = b[0] - a[0], dz = b[1] - a[1], L = Math.sqrt(dx * dx + dz * dz) || 1; return [dx / L, dz / L]; }
    var u = un(P[k1], P[kA]), v = un(P[k1], P[k2]);
    /* a origem do motor é o canto entre os EIXOS das paredes: do canto do contorno, d[k1] ao longo de u (para dentro, afastando da empena esq) e d[kA] ao longo de v */
    return { O: [P[k1][0] + u[0] * d[k1] + v[0] * d[kA], P[k1][1] + u[1] * d[k1] + v[1] * d[kA]], u: u, v: v, det: -(u[0] * v[1] - u[1] * v[0]) };
  }

  function volumeAssinado(pos) {
    var v = 0, i; for (i = 0; i + 8 < pos.length; i += 9) {
      var ax = pos[i], ay = pos[i + 1], az = pos[i + 2], bx = pos[i + 3], by = pos[i + 4], bz = pos[i + 5], cx = pos[i + 6], cy = pos[i + 7], cz = pos[i + 8];
      v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    }
    return v;
  }

  /**
   * t = o telhado do BIM (t.arestasCalc…); motor = calcMadeira.motor; opc = { caixas, H0 }.
   * → { ok, pecas:[peças do pacote do BIM], D, s, ... } | { ok:false, motivo }
   * D = distância VERTICAL do plano de referência do telhado (BimTelhado.alturaEm) ao TOPO dos banzos/terças — é onde a pilha caibro/ripa/telha começa.
   */
  function geometriaMundo(t, motor, opc) {
    opc = opc || {};
    if (!payloadValido(motor)) return { ok: false, motivo: "o cálculo não traz a geometria do motor (versão do cálculo antiga): recalcule a madeira" };
    var Mc = MC(), Me = ME(), Bt = BT(); if (!Mc || !Mc.lerTelhadoObj || !Me || !Bt) return { ok: false, motivo: "os módulos da madeira calculada não carregaram" };
    var lido0 = Mc.lerTelhadoObj(t, t && t.id, opc.caixas); if (!lido0.ok) return { ok: false, motivo: lido0.motivo };
    var lido = Mc.axisLido(lido0);   /* dimensões e beirais ENTRE EIXOS de parede (o motor); o contorno pode estar na face externa */
    if (lido.erroEixo) return { ok: false, motivo: lido.erroEixo };
    if (lido.tipo !== motor.tip) return { ok: false, motivo: "o telhado agora é " + lido.tipo + " e o cálculo é da " + motor.tip + " (mudou o nº de águas)" };
    var p = motor.params, be = lido.beiral, dif = [];
    function cmp(nome, a, b, tol) { if (!(Math.abs(num(a, 0) - num(b, 0)) <= tol)) dif.push(nome + " " + virg(a) + " → " + virg(b)); }
    if (motor.tip === "T4") { cmp("raio", p.R, lido.R, 0.011); cmp("lados", p.n, lido.n, 0.1); cmp("beiral", p.beiral, be, 0.006); cmp("inclinação", num(p.incl, 0) * 100, lido.incl, 0.05); }
    else { cmp("comprimento", p.a, lido.a, 0.011); cmp("vão", p.b, lido.b, 0.011); cmp("inclinação", num(p.incl, 0) * 100, lido.incl, 0.05); if (motor.tip === "T3L") { cmp("largura da asa B", p.bb, lido.bb, 0.011); cmp("comprimento da asa B", p.c, lido.c, 0.011); } if (motor.tip === "T3TU") { var lgM = arr(p.legs), lgL = arr(lido.legs); if (lgM.length !== lgL.length) dif.push("pernas " + lgM.length + " → " + lgL.length); else lgM.forEach(function (Lg, j) { cmp("perna " + (j + 1) + ": posição", Lg.x0, lgL[j].x0, 0.011); cmp("perna " + (j + 1) + ": largura", Lg.w, lgL[j].w, 0.011); cmp("perna " + (j + 1) + ": comprimento", Lg.c, lgL[j].c, 0.011); }); } }
    if (motor.tip === "T4") { /* já comparado */ }
    else if (motor.tip === "T3" || motor.tip === "T3L" || motor.tip === "T3TU") cmp("beiral", p.beiral, be, 0.006);
    else { cmp("beiral frente", p.beiral && p.beiral.frente, be.eave[0], 0.006); cmp("beiral fundo", p.beiral && p.beiral.fundo, be.eave[1], 0.006); cmp("beiral esquerdo", p.beiral && p.beiral.esq, be.gable[0], 0.006); cmp("beiral direito", p.beiral && p.beiral.dir, be.gable[1], 0.006); }
    cmp("pé-direito", p.peDireito, Math.max(lido.peDireito, 1.2), 0.011);
    if (dif.length) return { ok: false, motivo: "o telhado mudou depois do cálculo (" + dif.join("; ") + "): recalcule a madeira", desatualizado: true };
    var fr = quadro(lido), cx = caixasDe(opc.caixas), paredes = cx.paredes.filter(function (w) { return w.topo >= lido.cotaApoio - 0.6 && w.base < lido.cotaApoio; });
    var chaveM = chaveMotor(motor), chaveW = chaveM ? chaveM + "|" + JSON.stringify([motor.apoio || null, fr.O, fr.u, fr.v, r3(lido.cotaApoio), paredes.map(function (w) { return [w.cx, w.cz, w.ux, w.uz, w.hx, w.hz, w.base, w.topo]; }), opc.vaos || null,
      /* tudo que o resultado LÊ do modelo: as lajes e as demais paredes (conferirEncontros), os pilares (o motor os descarta no apoio por pilares) e o H0 — mudou qualquer um, a geometria é refeita */
      cx.paredes.map(function (w) { return [w.id, w.cx, w.cz, w.ux, w.uz, w.hx, w.hz, w.base, w.topo]; }), cx.lajes.map(function (l) { return [l.id, l.tipo, l.base, l.topo, l.poli]; }),
      arr(opc.caixas).filter(function (c) { return c && c.tipo === "pilar"; }).map(function (c) { return [c.id, c.cx, c.cy, c.cz, c.comprimento, c.espessura, c.altura, c.material || c.mat || null]; }), opc.H0 == null ? null : r3(num(opc.H0, 0))]) : null;
    if (chaveW) for (var ic = 0; ic < CACHE_M.length; ic++) if (CACHE_M[ic].k === chaveW) return CACHE_M[ic].r;
    var Rm; try { Rm = resolverMotor(motor); } catch (e) { return { ok: false, motivo: "o motor de encaixes falhou: " + (e && e.message ? e.message : e) }; }
    /* 3a) o frechal assenta no topo da parede: sobe a estrutura inteira o que for preciso */
    var frMin = Infinity; Rm.pecas.forEach(function (P) { if (P.g !== "FR" || P.aco) return; arr(Me.vertices(Me.solidoDe(P))).forEach(function (q) { if (q[2] < frMin) frMin = q[2]; }); });
    var avisos = [], s = 0, H0 = lido.cotaApoio;
    if (isFinite(frMin)) s = H0 - frMin; else avisos.push("a estrutura do motor não tem frechal: ficou na cota do cálculo (sem subir até o topo da parede)");
    function W(q) { return [fr.O[0] + q[0] * fr.u[0] + q[1] * fr.v[0], q[2] + s, fr.O[1] + q[0] * fr.u[1] + q[1] * fr.v[1]]; }
    function Wd(d) { return [d[0] * fr.u[0] + d[1] * fr.v[0], d[2], d[0] * fr.u[1] + d[1] * fr.v[1]]; }
    var sobParede = 0, dpParede = 0, pecas = [], descartadas = [], D = -Infinity, dzE = -Infinity, nTri = 0, volTotal = 0;
    var TPp = TP(), nomes = TPp && TPp.NOMES_T3 ? TPp.NOMES_T3 : {};
    Rm.pecas.forEach(function (P) {
      if (P.aco && !P.aco4) return;
      var papel = PAPEL[P.g]; if (!papel) return;
      var ext = Me.extensaoAxial(P); if (!ext) return;
      var pm = [(P.p0[0] + P.p1[0]) / 2, (P.p0[1] + P.p1[1]) / 2, 0], pw = W([pm[0], pm[1], 0]);
      var naParede = paredes.some(function (w) { return noRet(w, pw[0], pw[2], 0.25); });
      if (motor.tip === "T2" && motor.apoio === "pilares" && papel === "pilar") { sobParede++; descartadas.push({ id: P.id, g: P.g, motivo: "usa o pilar do modelo nessa linha (T2 quiosque sobre pilares: o frechal e as tesouras assentam nele)" + (motor.sec && motor.sec.P ? "; pilar calculado " + virg(num(motor.sec.P.b != null ? motor.sec.P.b : motor.sec.P.d, 0) * 100, 0) + "×" + virg(num(motor.sec.P.h != null ? motor.sec.P.h : motor.sec.P.d, 0) * 100, 0) + " cm: o do modelo tem de ser igual ou maior" : "") }); return; }
      if (motor.tip === "T4" && motor.apoio === "pilares" && papel === "pilar") { sobParede++; descartadas.push({ id: P.id, g: P.g, motivo: "usa o pilar do modelo nesse vértice (T4 aberto sobre pilares)" + (motor.sec && motor.sec.P ? "; pilar calculado " + virg(num(motor.sec.P.b != null ? motor.sec.P.b : motor.sec.P.d, 0) * 100, 0) + "×" + virg(num(motor.sec.P.h != null ? motor.sec.P.h : motor.sec.P.d, 0) * 100, 0) + " cm: o do modelo tem de ser igual ou maior" : "") }); return; }
      if (papel === "pilar" && paredes.some(function (w) { return apoioParede(w, pw[0], pw[2], opc.vaos); })) { sobParede++; descartadas.push({ id: P.id, g: P.g, motivo: "pilar sobre parede do modelo: o frechal assenta na parede" }); return; }
      if (naParede && P.g === "DP") { dpParede++; descartadas.push({ id: P.id, g: P.g, motivo: "contraventamento de madeira DENTRO da parede de alvenaria do modelo (a parede contraventa)" }); return; }
      var mesh = Me.malhaPeca(P), V = mesh.v, F = mesh.f, wv = [], i;
      for (i = 0; i < V.length; i += 3) wv.push(W([V[i], -V[i + 2], V[i + 1]]));        /* cena [x, z, −y] → motor [x, y, z] → obra */
      var pos = [];
      for (i = 0; i + 2 < F.length; i += 3) {
        var a = wv[F[i]], b = wv[F[i + 1]], c = wv[F[i + 2]];
        pos.push(r4(a[0]), r4(a[1]), r4(a[2]), r4(b[0]), r4(b[1]), r4(b[2]), r4(c[0]), r4(c[1]), r4(c[2]));
      }
      /* a convenção de face do BIM (a de extrudar() do js/bimtelhadoestrut.js): o volume ASSINADO da malha é NEGATIVO (testado). A malha do motor sai com o sinal que o quadro
         (espelhado ou não) deixar: inverte-se a ordem dos vértices quando o sinal não é o do BIM — nunca se espelha geometria. */
      if (volumeAssinado(pos) > 0) for (i = 0; i + 8 < pos.length; i += 9) { var t1 = pos[i + 3], t2 = pos[i + 4], t3 = pos[i + 5]; pos[i + 3] = pos[i + 6]; pos[i + 4] = pos[i + 7]; pos[i + 5] = pos[i + 8]; pos[i + 6] = t1; pos[i + 7] = t2; pos[i + 8] = t3; }
      nTri += pos.length / 9;
      var A0 = Wd([P.ex[0] * ext[0], P.ex[1] * ext[0], P.ex[2] * ext[0]]), B0 = Wd([P.ex[0] * ext[1], P.ex[1] * ext[1], P.ex[2] * ext[1]]);
      var p0w = W(P.p0), ey = Wd([P.ey[0], P.ey[1], P.ey[2]]), hh = P.h != null ? P.h : P.d, ww = P.b != null ? P.b : P.d;
      var aEixo = [p0w[0] + A0[0], p0w[1] + A0[1], p0w[2] + A0[2]], bEixo = [p0w[0] + B0[0], p0w[1] + B0[1], p0w[2] + B0[2]];
      /* o prisma "de reserva" (IFC, planta, edição) tem a face de baixo no eixo e a altura em `up`: recua meia altura */
      var aP = [aEixo[0] - ey[0] * hh / 2, aEixo[1] - ey[1] * hh / 2, aEixo[2] - ey[2] * hh / 2], bP = [bEixo[0] - ey[0] * hh / 2, bEixo[1] - ey[1] * hh / 2, bEixo[2] - ey[2] * hh / 2];
      var vol = Me.volumePeca(P); volTotal += vol;
      var o = { p: papel, a: [r4(aP[0]), r4(aP[1]), r4(aP[2])], b: [r4(bP[0]), r4(bP[1]), r4(bP[2])], up: [r4(ey[0]), r4(ey[1]), r4(ey[2])], w: ww, h: hh, forma: "ret", mat: P.aco4 ? "aco" : "madeira", calc: true,
        motor: true, idMotor: String(P.id), grupoMotor: P.g, rotuloMotor: nomes[P.g] || P.g, vol: r6(vol), malha: pos };
      if (P.aco4) { o.kg = r4(P.g === "CUBO" ? ((dep("MadT4", "./madt4.js") || {}).CUBO || { kgm: 16.8 }).kgm * (ext[1] - ext[0]) : vol * 7850);   /* tubo OCO: 16,8 kg/m (CUBO.kgm); chapa: volume × 7.850 */ o.perfil = undefined; delete o.perfil; }
      o.L = r4(Math.sqrt(Math.pow(bP[0] - aP[0], 2) + Math.pow(bP[1] - aP[1], 2) + Math.pow(bP[2] - aP[2], 2)));
      pecas.push(o);
      /* 3b) a pilha caibro/ripa/telha começa no topo dos banzos e terças (o espigão passa um pouco do plano: é medido e avisado) */
      if (TOPO_PLANO[P.g] || P.g === "E" || P.g === "RC") {
        for (i = 0; i < wv.length; i++) {
          var yR = Bt.alturaEm(t, wv[i][0], wv[i][2]); if (yR == null) continue;
          var dz = wv[i][1] - yR;
          if (TOPO_PLANO[P.g]) { if (dz > D) D = dz; } else if (dz > dzE) dzE = dz;
        }
      }
    });
    if (!pecas.length) return { ok: false, motivo: "o motor não devolveu peças" };
    if (!isFinite(D)) D = 0;
    if (isFinite(dzE) && dzE > D + 0.01) avisos.push("o espigão passa " + virg((dzE - D) * 100, 1) + " cm do plano das terças (aresta a desbastar no canteiro): os caibros cruzam esse trecho");
    if (sobParede) avisos.push((motor.tip === "T4" || motor.tip === "T2") && motor.apoio === "pilares" ? sobParede + " pilar(es) do motor NÃO viram peça: o frechal assenta nos pilares do modelo, " + (motor.tip === "T4" ? "nos vértices" : "nas linhas das tesouras") : sobParede + " pilar(es) do motor ficam SOBRE parede do modelo: o frechal assenta na parede e não se cria pilar");
    if (dpParede) avisos.push(dpParede + " diagonal(is) de contraventamento da parede (DP) NÃO viram peça: ficariam dentro da parede de alvenaria — a verificação da estabilidade das paredes fica com o RT (PRELIMINAR)");
    avisos.unshift("Cota: a estrutura do motor SOBE " + virg(s * 100, 1) + " cm sobre a cota de apoio (o frechal assenta no topo da parede) e a telha fica " + virg(D * 100, 1) + " cm acima do plano do telhado desenhado — uma superfície só (a telha do pacote É a telha do telhado; nada é desenhado duas vezes).");
    var conf = conferirEncontros(pecas, cx, { H0: H0 });
    var r = { ok: true, pecas: pecas, D: r4(D), s: r4(s), dzE: isFinite(dzE) ? r4(dzE) : null, avisos: avisos, descartadas: descartadas, sobParede: sobParede, dpParede: dpParede, nTri: nTri, volume: r4(volTotal),
      encontros: conf, quadro: { O: fr.O, u: fr.u, v: fr.v }, conferenciaMotor: confMotor(Rm, descartadas) };
    if (!conf.ok) avisos.push(conf.interpenetracoes.length + " peça(s) entram na parede/laje do modelo (primeira: " + conf.interpenetracoes[0].peca + " × " + conf.interpenetracoes[0].elemento + ", " + virg(conf.interpenetracoes[0].prof_mm, 0) + " mm)");
    if (chaveW) { CACHE_M.unshift({ k: chaveW, r: r }); if (CACHE_M.length > 4) CACHE_M.length = 4; }
    return r;
  }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  /* a conferência do motor de encaixes, SEM os achados que só tocam peças que não viraram peça do modelo (pilar/diagonal que cairia dentro da parede) */
  function confMotor(Rm, descartadas) {
    var dr = {}; arr(descartadas).forEach(function (d) { dr[d.id] = 1; });
    var todos = arr(Rm.conferencia && Rm.conferencia.achados), rest = todos.filter(function (x) { return !(dr[x.a] || dr[x.b]); }), porRegra = {};
    rest.forEach(function (x) { porRegra[x.regra] = (porRegra[x.regra] || 0) + 1; });
    return { ok: rest.length === 0, pecas: Rm.pecas.length, achados: rest.slice(0, 12), porRegra: porRegra, ignoradosPorParede: todos.length - rest.length, interpenetracoes: arr(Rm.conferencia && Rm.conferencia.interpenetracoes).length };
  }

  /* ======================================================================
   * 4) ENCAIXE NAS PAREDES E NO FORRO — nenhum vértice de peça dentro do volume de parede ou laje (contato face a face é permitido)
   * ====================================================================== */
  function conferirEncontros(pecas, cx, opc) {
    var par = cx.paredes, laj = cx.lajes, out = [], seen = {};
    arr(pecas).forEach(function (o) {
      var m = o.malha; if (!m) return;
      var i, j;
      for (i = 0; i < m.length; i += 3) {
        var x = m[i], y = m[i + 1], z = m[i + 2];
        for (j = 0; j < par.length; j++) {
          var w = par[j]; if (!(y > w.base + TOL_PAREDE && y < w.topo - TOL_PAREDE)) continue;
          var rx = x - w.cx, rz = z - w.cz, lx = rx * w.ux + rz * w.uz, lz = -rx * w.uz + rz * w.ux, pen = Math.min(w.hx - Math.abs(lx), w.hz - Math.abs(lz), y - w.base, w.topo - y);
          if (pen > TOL_PAREDE) { var k = (o.idMotor || o.p) + "|" + w.id; if (!seen[k]) { seen[k] = 1; out.push({ peca: o.idMotor || o.p, elemento: "parede " + w.id, prof_mm: pen * 1000 }); } else { for (var q = 0; q < out.length; q++) if (out[q].peca === (o.idMotor || o.p) && out[q].elemento === "parede " + w.id && pen * 1000 > out[q].prof_mm) out[q].prof_mm = pen * 1000; } }
        }
        for (j = 0; j < laj.length; j++) {
          var L = laj[j]; if (!(y > L.base + TOL_PAREDE && y < L.topo - TOL_PAREDE) || !noPoli([x, z], L.poli)) continue;
          var pen2 = Math.min(y - L.base, L.topo - y); if (pen2 > TOL_PAREDE) { var k2 = (o.idMotor || o.p) + "|" + L.id; if (!seen[k2]) { seen[k2] = 1; out.push({ peca: o.idMotor || o.p, elemento: L.tipo + " " + L.id, prof_mm: pen2 * 1000 }); } }
        }
      }
    });
    void opc;
    return { ok: out.length === 0, interpenetracoes: out, paredes: par.length, lajes: laj.length };
  }

  /* ======================================================================
   * 5) MIGRAÇÃO — o telhado que já tinha cálculo da versão 1 ganha a geometria do motor, sem apagar nada
   * ====================================================================== */
  var PAPEL_GRUPOS = { perna: ["BS", "MS"], linha: ["BI", "MI"], pendural: ["PD", "MP"], escora: ["DG", "MG"], terca: ["T"], espigao: ["E"] };
  /**
   * estado = BimEdit.aplicar(...) ; id = telhado. Devolve null (nada a fazer: sem cálculo, já migrado ou não é de tesoura) ou
   * { op, aviso } — a op {op:"telhado", id, calcMadeira} com o cálculo antigo GUARDADO em `anterior` (cópia) e o `motor` reconstruído das seções do cálculo.
   * Idempotente: depois de migrado (calc.motor presente e versão 2) devolve null. Não toca em sobrepor, delimitação, beiral, telha nem peças editadas.
   */
  function migrar(estado, id, opc) {
    opc = opc || {};
    var Mc = MC(); if (!Mc) return null;
    var t = arr(estado && estado.telhados).filter(function (x) { return x && String(x.id) === String(id); })[0]; if (!t) return null;
    var c = t.calcMadeira; if (!c || typeof c !== "object") return null;
    if (c.motor && payloadValido(c.motor)) return null;                              /* já migrado / já nasceu com o motor */
    if (!/tesoura/i.test(String(c.sistema || "")) || (c.tipo !== "T2" && c.tipo !== "T3")) return null;   /* o laço de terças/vigas fica como está */
    var lido = Mc.lerTelhadoObj(t, id, estado.caixas); if (!lido.ok || lido.tipo !== c.tipo) return { marcar: true, motivo: lido.ok ? "mudou o nº de águas" : lido.motivo, aviso: "Telhado " + id + ": não deu para migrar a madeira para o motor (" + (lido.motivo || "mudou o nº de águas") + "). Os dados ficaram como estão — use Recalcular." };
    var ap = Mc.detectarApoio(estado, lido, c.cfg || {});
    if (ap.tipo !== "paredes") return { marcar: true, motivo: "apoio mudou", aviso: "Telhado " + id + ": o apoio deixou de ser parede; use Recalcular." };
    /* a variante é a do CÁLCULO ANTIGO (as seções foram calculadas para ela), não a que a regra automática escolheria hoje */
    var mv = /(Pratt|Howe|Fink)/i.exec(String(c.sistema || "")), variante = mv ? mv[1].toLowerCase() : "pratt";
    if (lido.tipo === "T3" && variante === "fink") variante = "pratt";
    var pr = Mc.preparar(estado, id, ext2(c.cfg || {}, { tesoura: variante }), { obra: opc.obra || {} }), P = pr && pr.ok ? pr : (pr && pr.prep ? pr.prep : null);
    var sTes = fin(Number(c.espApoio)) ? Number(c.espApoio) : 3.2, params = null, partida = null, EN = dep("MadEngEntrada", "./madengentrada.js");
    if (P && P.estadoMad && EN && EN.toProj) {
      try { P.sTes = sTes; var est = Mc.montarEstadoMadeira(clone(P.estadoMad), P), tp = EN.toProj(est, "A"); params = tp.proj.params; partida = tp.partida; } catch (eP) { params = null; }
    }
    if (!params) return { marcar: true, motivo: "sem entrada do motor", aviso: "Telhado " + id + ": não consegui montar a entrada do motor a partir do cálculo anterior; os dados ficaram como estão — use Recalcular." };
    /* as seções por grupo: o que o cálculo antigo gravou por PAPEL (+ FR/P/PO/CM em secoesMotor); o que ele nunca calculou (diagonais DG da Pratt/Fink, DX, DP, DV, LB, montantes…) fica na PARTIDA do próprio motor e a migração diz isso */
    var sec = {}, falta = [];
    Object.keys(PAPEL_GRUPOS).forEach(function (papel) { var s2 = c.secoes && c.secoes[papel]; PAPEL_GRUPOS[papel].forEach(function (g) { if (s2 && fin(s2.b) && fin(s2.h)) sec[g] = { b: s2.b, h: s2.h }; }); });
    Object.keys(c.secoesMotor || {}).forEach(function (g) { var s3 = c.secoesMotor[g]; if (s3 && fin(s3.b) && fin(s3.h)) sec[g] = (g === "P" || g === "PO") ? { forma: "quadrado", b: s3.b, h: s3.h } : { b: s3.b, h: s3.h }; });
    Object.keys(partida || {}).forEach(function (g) { if (!sec[g] && partida[g]) { sec[g] = clone(partida[g]); falta.push(g); } });
    if (!sec.BS || !sec.BI) return { marcar: true, motivo: "sem seções", aviso: "Telhado " + id + ": o cálculo anterior não traz as seções do banzo; use Recalcular." };
    var motor = { v: VERSAO, tip: lido.tipo, variante: variante, origem: "migrado", sTes: sTes, params: arred(clone(params)), sec: arred(sec) };
    var novo = JSON.parse(JSON.stringify(c)); delete novo.anterior;
    novo.motor = motor; novo.versao = 2; novo.migradoDe = c.versao || 1; delete novo.pecasMotor;   /* a lista antiga fica só na cópia t.calcMadeiraV1 */
    /* C3: a tesoura do cálculo antigo vira ESCOLHA MANUAL (as seções foram calculadas para ela): a regra automática de hoje só aparece como SUGESTÃO */
    novo.cfg = ext2(c.cfg || {}, { tesoura: variante });
    novo.preliminar = true;
    novo.motivos = arr(c.motivos).concat(["MIGRADO da versão anterior: a geometria agora é a do motor, mas as seções de " + falta.join(", ") + " são as de PARTIDA do motor (o cálculo antigo não as calculava) e o esforço não foi refeito — use Recalcular para fechar o cálculo"]).slice(0, 12);
    var tip2 = Mc.tipologiaDe(lido, ap, ext2(c.cfg || {}, { tesoura: null }));
    novo.chave = Mc.chaveDe(lido, novo.cfg, ap);
    var auto = tip2 && Mc.tipologiaDe(lido, ap, ext2(c.cfg || {}, { tesoura: "auto" }));
    if (auto && auto.variante && auto.variante !== variante) novo.sugestao = "A regra automática de hoje escolheria a tesoura " + auto.variante.toUpperCase() + " para este vão (" + auto.criterio + "). A tesoura " + variante + " do cálculo antigo foi MANTIDA; para trocar: Ajustar › Tesoura: automática pelo vão e Recalcular.";
    novo.tipologia = { tipo: lido.tipo, variante: variante, auto: false, criterio: "migrado: tesoura " + variante + " mantida do cálculo anterior (escolha mantida, não automática)", fonte: "cálculo anterior" };
    /* REVISOR 17/11/2026: as REMOÇÕES e EDIÇÕES de peça da versão 1 (t.sobrepor, por id de peça do SINAPI) que a geometria do motor deixa sem a peça NÃO somem calado: ficam gravadas e o aviso LISTA cada uma pelo nome */
    var perdidas = edicoesV1Perdidas(t, estado, novo);
    var opM = { op: "telhado", id: String(id), calcMadeira: novo }; if (!t.calcMadeiraV1) opM.calcMadeiraV1 = clone(c);   /* C2: a cópia COMPLETA fica fora do calcMadeira e nunca é sobrescrita */
    return { op: opM, aviso: "Telhado " + id + ": a madeira passou para a geometria do motor (cópia do cálculo anterior guardada; seções de partida em " + falta.join(", ") + " — Recalcular fecha)." +
      (perdidas.length ? " Edições/remoções de peça da versão anterior que DEIXARAM DE VALER (continuam gravadas, nenhuma foi apagada): " + perdidas.join("; ") + "." : ""), falta: falta, perdidas: perdidas };
  }
  /* quais entradas de t.sobrepor (a v1) não acham mais a peça no pacote refeito com o cálculo migrado — pelo nome da peça e pelo que o usuário tinha feito */
  function edicoesV1Perdidas(t, estado, novo) {
    var sob = t && t.sobrepor && typeof t.sobrepor === "object" ? t.sobrepor : null; if (!sob) return [];
    var chaves = Object.keys(sob); if (!chaves.length) return [];
    var ES = dep("BimTelhadoEstrut", "./bimtelhadoestrut.js"), orf = null, confere = true;
    try {
      var tn = {}; Object.keys(t).forEach(function (k) { if (k !== "pacote") tn[k] = t[k]; }); tn.calcMadeira = novo;
      var pk = ES && ES.modelar ? ES.modelar(tn, estado, {}) : null;
      if (pk && pk.ok) { var ach = {}; arr(pk.sobreporOrfas).forEach(function (k) { ach[k] = 1; }); orf = chaves.filter(function (k) { return ach[k]; }); }
    } catch (e) { orf = null; }
    if (orf == null) { orf = chaves; confere = false; }
    var velhas = {}; arr(t.pacote && t.pacote.pecas).forEach(function (o) { if (o && o.id != null) velhas[String(o.id)] = o; });
    return orf.map(function (k) {
      var e = sob[k] || {}, o = velhas[k], nome = (o && ES && ES.rotuloPeca ? ES.rotuloPeca(o) + " " : "") + k, q = [];
      if (e.removida) q.push("REMOÇÃO — a peça volta ao desenho do motor");
      else { if (e.secao) q.push("seção " + e.secao); if (e.perfil) q.push("perfil " + e.perfil); if (e.desloc) q.push("deslocamento"); if (e.ext) q.push("alongamento"); }
      return nome + " (" + (q.join(", ") || "edição") + (confere ? "" : "; não consegui conferir se ainda vale") + ")";
    });
  }
  function ext2(a, b) { var o = {}; Object.keys(a || {}).forEach(function (k) { o[k] = a[k]; }); Object.keys(b || {}).forEach(function (k) { o[k] = b[k]; }); return o; }
  function migrarTudo(estado, opc) {
    var out = [], avisos = [];
    arr(estado && estado.telhados).forEach(function (t) {
      if (!t || !t.calcMadeira) return;
      var r = migrar(estado, t.id, opc); if (!r) return;
      if (r.op) out.push(r.op); if (r.aviso) avisos.push(r.aviso);
    });
    return { ops: out, avisos: avisos };
  }


  /* ======================================================================
   * 6) SAÍDAS COMPLETAS DO MÓDULO (pranchas, memorial, manual, orçamento com ligações) — rodando o motor de novo com a MESMA entrada (determinístico)
   * ====================================================================== */
  /** o estado do módulo Madeira (MadEngEntrada) desta cobertura: tipologia, campos est.t2/est.t3 (motor.entrada) e a obra */
  function estadoDoModulo(calc, obra) {
    var EN = dep("MadEngEntrada", "./madengentrada.js"), m = calc && calc.motor; if (!EN || !payloadValido(m) || !m.entrada) return null;
    var e = EN.estadoPadrao(); e.tip = (m.tip === "T3L" || m.tip === "T3TU") ? "T3" : m.tip; e.obra = ext3(e.obra, clone(obra || {})); e[m.tip === "T2" ? "t2" : (m.tip === "T4" ? "t4" : "t3")] = clone(m.entrada);
    return e;
  }
  function ext3(a, b) { var o = {}; Object.keys(a || {}).forEach(function (k) { o[k] = a[k]; }); Object.keys(b || {}).forEach(function (k) { o[k] = b[k]; }); return o; }
  /** a solicitação do worker (a mesma que o módulo monta): { sol } | { motivo } */
  function solicitar(calc, obra) {
    var e = estadoDoModulo(calc, obra); if (!e) return { motivo: "o cálculo não traz a entrada do módulo (recalcule a madeira)" };
    var EN = dep("MadEngEntrada", "./madengentrada.js"), W = dep("MadEngWorker", "./madengworker.js"), v = EN.validar(e);
    if (!v.ok) return { motivo: v.falta.map(function (f) { return f.texto; }).join(" "), pendente: true };
    return { sol: W.solicitacao(e, "A"), estado: e };
  }
  /** as saídas do módulo para o resultado do motor (res): as MESMAS funções que o módulo chama */
  function saidas(res, opc) {
    opc = opc || {}; var o = opc.obra || {}, tip = res && res.tipologia, out = { tipologia: tip };
    var MEM = tip === "T4" ? dep("MadT4Saidas", "./madt4saidas.js") : (tip === "T3TU" ? dep("MadT3TUSaidas", "./madt3tusaidas.js") : (tip === "T3L" ? dep("MadT3LSaidas", "./madt3lsaidas.js") : (tip === "T3" ? dep("MadT3Saidas", "./madt3saidas.js") : dep("MadEngT2Doc", "./madengt2doc.js"))));
    var PR = tip === "T4" ? dep("MadEngT4", "./madt4pranchas.js") : (tip === "T3TU" ? dep("MadEngT3TU", "./madt3tupranchas.js") : (tip === "T3L" ? dep("MadEngT3L", "./madt3lpranchas.js") : (tip === "T3" ? dep("MadEngT3", "./madt3pranchas.js") : dep("MadEngT2", "./madengt2pranchas.js"))));
    if (!MEM) return { ok: false, motivo: "o gerador de saídas da " + tip + " não carregou" };
    out.memorial = MEM.memorial(res, { obra: { nome: o.nome, cidade: o.cidade }, documento: { numero: (opc.codigo || "COB") + "-MEM", revisao: "R00", data: opc.data || "2026-01-01" }, responsavel: {}, nomeOpcao: res.nomeOpcao });
    out.manual = MEM.manual(res, { obra: { nome: o.nome }, documento: { revisao: "R00" }, preliminar: !!opc.preliminar });
    out.pranchas = PR ? PR.gerar(res, { obra: o.nome || "", local: o.cidade || "", codigo: opc.codigo || "COB", revisao: "R00", empresa: "RA Engenharia", nomeOpcao: res.nomeOpcao, preliminar: !!opc.preliminar }) : null;
    out.orcamento = res.orcamento ? { custo_direto: res.orcamento.custo_direto, preco: res.orcamento.preco, itens: arr(res.orcamento.itens).length, ligacoes: arr(res.orcamento.itens).filter(function (i) { return /chapa|pino|ligaç/i.test(String(i.descricao || i.item || "")); }).length } : null;
    out.ok = !!(out.memorial && out.memorial.ok);
    return out;
  }

  var MadTelhadoDes = { VERSAO: VERSAO, PAPEL: PAPEL, escolher: escolher, limiteFinkSimples: limiteFinkSimples, payload: payload, payloadValido: payloadValido, geometriaMundo: geometriaMundo,
    conferirEncontros: conferirEncontros, caixasDe: caixasDe, quadro: quadro, migrar: migrar, migrarTudo: migrarTudo, volumeAssinado: volumeAssinado, resolverMotor: resolverMotor, calcularMotor: calcularMotor, semearMotor: semearMotor, paraTexto: paraTexto, deTexto: deTexto, emCache: emCache, aquecer: aquecer, pendentes: pendentes, completarAgora: completarAgora, assincrono: assincrono, cacheMotor: cacheMotor, estadoDoModulo: estadoDoModulo, solicitar: solicitar, saidas: saidas };
  global.MadTelhadoDes = MadTelhadoDes;
  if (typeof module !== "undefined" && module.exports) module.exports = MadTelhadoDes;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
