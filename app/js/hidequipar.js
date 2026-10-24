/* =====================================================================
 * hidequipar.js — "EQUIPAR AMBIENTE" (FRENTE H7, 21/10/2026): as peças sanitárias do cômodo em um clique. Motor PURO, ES5, sem DOM.
 *
 * Pedido do Rogério (21/10/2026): "a modelagem de acordo com o ambiente: ele já entende que precisa de vaso sanitário, cuba,
 * chuveiro… todas as cubas, chuveiro, vaso parametrizados, com o parâmetro para ele conseguir colocar as tubulações."
 *
 *   HidEquipar.gerar({ estado, avaliarFam, ops, ambientes: [ids] | null (todos), padrao: "economico"|"medio"|"alto",
 *                      bacia: "caixa"|"valvula", acessivel: bool, tipos: { ambId: tipo }, comKit: bool })
 *     → { ok, lote ({op:"lote"} — UM Ctrl+Z), itens[], pendencias[], avisos[], porAmbiente{}, resumo }
 *   HidEquipar.auditar({ estado, avaliarFam, ops, aposTracar }) → { problemas[] } (o cartão do js/problemacard.js: o que é +
 *     Corrigir + Mostrar no 3D)
 *   HidEquipar.classificar(nome, area) → { tipo, termo, aviso }
 *
 * O QUE PÕE (programa — docs/arquitetura/interiores/PADROES-AMBIENTES.md):
 *   banheiro / suíte (3.11): box + chuveiro, bacia, lavatório (econômico: com coluna; médio/alto: bancada de pedra com cuba e
 *     torneira — js/marmoraria.js, fabricante › linha › acabamento);  lavabo (3.12): bacia + lavatório pequeno, sem box;
 *   banheiro PNE (NBR 9050:2020 Seção 7, js/hidnormasdados.js ac9050.dimensoes): box ≥ 0,90 × 0,95 (7.12), bacia para PNE (com as
 *     barras de apoio no orçamento, 7.7.2.2), lavatório SEM coluna com a superfície a 0,80 m (7.5/7.8) e o giro de Ø 1,50 (4.3.4);
 *   cozinha (3.4) e área gourmet (3.6): pia com torneira (sobre a base planejada, se houver); área de serviço (3.7): tanque e o
 *     ponto da lavadora (o kit da máquina põe o ralo).
 *   Cada peça é a FAMÍLIA paramétrica que já existe, com os conectores (js/familiasagua.js / js/hidfamilias.js) e o preço dela
 *   (SINAPI da família — js/hidpecasdados.js; a pedra pelo orçamento da marmoraria; o box pela SINAPI do vidro temperado, por m²).
 * COMO POSICIONA (PADROES §2): as paredes do cômodo (js/esqauto.js leitura) menos as portas (e as janelas, para peça alta);
 *   o box no canto mais longe da porta, a bacia e o lavatório na parede molhada; cada peça com a faixa lateral do eixo e a
 *   área livre à frente das regras (REGRAS abaixo: id + fonte) — o recomendado; não cabendo, o mínimo de código (e diz qual);
 *   sem colidir com móvel/louça já posto (caixa da família, na faixa de altura) nem com a folha da porta.
 * ⚠ IDEMPOTENTE: peça que o ambiente já tem (posta à mão ou por este motor) não é posta de novo nem mexida; id "hq-<amb>-<slot>".
 *   O kit de cada peça nova (js/hidkit.js) entra no MESMO lote (ralo do box, esperas): um Ctrl+Z desfaz tudo.
 * ⚠ Nenhum valor de norma inventado: o que não tem fonte (ponto do filtro) sai PENDENTE. Não cita outro programa.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function EA() { return dep("EsqAuto", "./esqauto.js"); }
  function ER() { return dep("EsqRegras", "./esqregras.js"); }
  function HK() { return dep("HidKit", "./hidkit.js"); }
  function HN() { return dep("HidNormas", "./hidnormas.js"); }
  function MM() { return dep("Marmoraria", "./marmoraria.js"); }
  function HP() { return dep("HidPecas", "./hidpecas.js"); }
  function BE() { return dep("BimEdit", "./bimedit.js"); }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return v != null && v !== "" && isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function r4(v) { return Math.round(v * 10000) / 10000; }   // hid:ok geometria/formatação (não é norma)
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  var ORIGEM = "hid-equipar", PREF = "hq-", EPS = 1e-6;   // hid:ok geometria/formatação (não é norma)

  /* hid:fisica-inicio — AS REGRAS (id e fonte de docs/arquitetura/interiores/dados/regras-layout.json; os números copiados de lá —
     tools/test-hid-equipar.js confere a cópia contra o JSON). Nível: [L] literatura (NKBA), [S] prática brasileira, [N] norma. */
  var REGRAS = {
    "ban-nkba-vaso-eixo": { rec: 0.457, cod: 0.381, nivel: "L", texto: "eixo da bacia à parede ou ao aparelho do lado", fonte: "NKBA Bathroom Guideline 20" },
    "ban-nkba-espaco-frontal": { rec: 0.762, cod: 0.533, nivel: "L", texto: "área livre à frente do aparelho", fonte: "NKBA Bathroom Guideline 4" },
    "ban-nkba-lavatorio-eixo-parede": { rec: 0.508, cod: 0.381, nivel: "L", texto: "eixo do lavatório à parede do lado", fonte: "NKBA Bathroom Guideline 5" },
    "ban-nkba-frente-box": { rec: 0.61, cod: 0.61, nivel: "L", texto: "área livre à frente da entrada do box", fonte: "NKBA Bathroom Guideline 4 (código)" },
    "ban-nkba-box-tamanho": { rec: 0.914, cod: 0.762, nivel: "L", texto: "box (lado)", fonte: "NKBA Bathroom Guideline 9" },
    "coz-nkba-pia-apoio": { rec: 0.61, cod: 0.457, nivel: "L", texto: "apoio ao lado da pia (lado maior / menor)", fonte: "NKBA Kitchen Guideline 11" },
    "coz-nkba-corredor-1cozinheiro": { rec: 1.067, cod: 0.914, nivel: "L", texto: "corredor de trabalho à frente da bancada (passagem mínima 0,914)", fonte: "NKBA Kitchen Guideline 6 / 7" },
    "acess-9050-porta-vao": { rec: 0.8, cod: 0.8, nivel: "N", texto: "vão livre da porta", fonte: "NBR 9050:2020 Emenda 1, 6.11.2.1 (cópia não licenciada — só o valor)" }
  };
  /* o box usual no Brasil (0,90 × 0,90, PADROES 3.11 [S]) e a frente do tanque/máquina (PADROES 3.7, [?] conferir no manual) */
  var BOX_BR = 0.90, FRENTE_SERVICO = 0.90;
  /* a ponta da fileira de pontos até a janela: a espera do ramal (registro + folgas do traçado, js/hidambiente.js "gap") — geometria */
  var FOLGA_RAMAL = 0.4;
  /* hid:fisica-fim */
  function cite(id, qual) { var r = REGRAS[id]; return r ? id + " [" + r.nivel + "] " + r.texto + " " + f2(qual === "cod" ? r.cod : r.rec) + " m (" + r.fonte + (qual === "cod" ? ", mínimo de código" : "") + ")" : id; }
  /* NBR 9050:2020 Seção 7 (exemplar licenciado no HidNormas): sanitário acessível */
  function n9050(par) {
    var N = HN(); if (!N || !N.valor) return null;
    try { var mn = N.valor("ac9050.dimensoes", { parametro: par }, "min"), mx = N.valor("ac9050.dimensoes", { parametro: par }, "max"), it = N.valor("ac9050.dimensoes", { parametro: par }, "item");
      return { min: num(mn, null), max: num(mx, null), item: txt(it) }; } catch (e) { return null; }
  }

  /* ---------------------------------------------------------------- TIPO DO AMBIENTE (PADROES 1.2 / 1.3) */
  var GRUPOS = [
    ["banheiro_pne", /\b(pne|pcd|acessivel|adaptado|deficiente)\b/],
    ["lavabo", /\b(lavabo|lavab|toalete|toilette|wc social|banheiro de visitas|banheiro visitas)\b/],
    /* REVISÃO H7: as abreviações de planta ("Banh.", "Sanit. Fem.", "I.S." = instalação sanitária) */
    ["banheiro", /\b(banheiro|banho|banh|bwc|wc|sanitario|sanitarios|sanit|bh|bnh|ducha|is|i s|inst sanitaria|instalacao sanitaria)\b/],
    ["gourmet", /\b(gourmet|churrasqueira|churrasq|edicula)\b/],
    ["cozinha", /\b(cozinha|coz|copa)\b/],
    ["servico", /\b(lavanderia|area de servico|area servico|area serv|a serv|servico|serv|a s|as|tanque)\b/]
  ];
  function normalizar(s) { var R = ER(); if (R && R.normalizar) return R.normalizar(s); s = txt(s).toLowerCase(); return (s.normalize ? s.normalize("NFD").replace(/[̀-ͯ]/g, "") : s).replace(/[^a-z0-9]+/g, " ").trim(); }   // hid:ok geometria/formatação (não é norma)
  function classificar(nome, area) {
    var t = " " + normalizar(nome) + " ";
    if (/ lav /.test(t) && !/lavabo|lavanderia/.test(t)) {
      var ehLavabo = area != null && area <= 3.5 + EPS;   // hid:ok PADROES 1.3 [P]: "Lav" até 3,5 m² = lavabo (prática, ajustável)
      return { tipo: area == null ? null : (ehLavabo ? "lavabo" : "servico"), termo: "lav", aviso: "\"" + nome + "\": decidi pela área (" + (area == null ? "?" : f2(area)) + " m²; até 3,50 m² é lavabo, PADROES 1.3 [P]) — troque o tipo se não for." };
    }
    for (var i = 0; i < GRUPOS.length; i++) {
      if (!GRUPOS[i][1].test(t)) continue;
      if (GRUPOS[i][0] === "banheiro_pne" && !/banh|wc|sanit|lavab|toalet|bwc/.test(t)) continue;   /* "Vaga PNE" não é sanitário */
      /* REVISÃO H7 (21/10/2026): "Quarto de serviço", "Entrada / Escada / Hall de serviço", "Dependência de serviço" NÃO são a área
         de serviço — antes viravam "servico" e ganhavam tanque e o ponto da lavadora no quarto e na escada */
      if (GRUPOS[i][0] === "servico" && / (quarto|qto|dorm|dormitorio|suite|dependencia|dep|entrada|escada|elevador|hall|circulacao|circ|corredor|acesso|garagem|portao|varanda) / .test(t) && !/ (lavanderia|lavand|tanque|area de servico|area servico|area serv|a s) /.test(t)) continue;
      return { tipo: GRUPOS[i][0], termo: GRUPOS[i][1].exec(t)[1] };
    }
    return { tipo: null, termo: "" };
  }
  var NOMES = { banheiro: "Banheiro", lavabo: "Lavabo", banheiro_pne: "Banheiro acessível (PNE)", cozinha: "Cozinha", gourmet: "Área gourmet", servico: "Área de serviço" };

  /* ---------------------------------------------------------------- geometria plana ([x, z]) */
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function add(a, b, k) { return [a[0] + b[0] * k, a[1] + b[1] * k]; }
  function dentro(p, P) { var c = false; for (var i = 0, j = P.length - 1; i < P.length; j = i++) { var a = P[i], b = P[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1] + 1e-15) + a[0]) c = !c; } return c; }   // hid:ok geometria/formatação (não é norma)
  function eixoU(r) { return [Math.cos(r), -Math.sin(r)]; }
  function eixoV(r) { return [Math.sin(r), Math.cos(r)]; }
  /* caixa orientada: c = centro, u/v eixos, hu/hv meias medidas, y0..y1 */
  function obb(c, u, v, hu, hv, y0, y1) { return { c: c, u: u, v: v, hu: hu, hv: hv, y0: y0 == null ? -1e9 : y0, y1: y1 == null ? 1e9 : y1 }; }   // hid:ok geometria/formatação (não é norma)
  function cantos(o) { return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (s) { return [o.c[0] + o.u[0] * o.hu * s[0] + o.v[0] * o.hv * s[1], o.c[1] + o.u[1] * o.hu * s[0] + o.v[1] * o.hv * s[1]]; }); }
  function sobrepoe(a, b, eps) {
    eps = eps == null ? 0.005 : eps;   // hid:ok 5 mm: encostar não é bater
    if (a.y1 <= b.y0 + eps || b.y1 <= a.y0 + eps) return false;
    var ax = [a.u, a.v, b.u, b.v], d = sub(b.c, a.c);
    for (var i = 0; i < 4; i++) {   // hid:ok geometria/formatação (não é norma)
      var e = ax[i], ra = a.hu * Math.abs(dot(a.u, e)) + a.hv * Math.abs(dot(a.v, e)), rb = b.hu * Math.abs(dot(b.u, e)) + b.hv * Math.abs(dot(b.v, e));
      if (Math.abs(dot(d, e)) >= ra + rb - eps) return false;
    }
    return true;
  }
  function dentroDoComodo(o, P) {
    var enc = obb(o.c, o.u, o.v, Math.max(0, o.hu - 0.01), Math.max(0, o.hv - 0.01));   // hid:ok 1 cm: a face encostada na parede conta como dentro
    return cantos(enc).every(function (q) { return dentro(q, P); }) && dentro(o.c, P);
  }

  /* ---------------------------------------------------------------- LEITURA do modelo */
  function avaliar(avaliarFam, f) { try { return typeof avaliarFam === "function" ? avaliarFam(f.famId, f.tipoId, f.inst || {}) : null; } catch (e) { return null; } }
  function caixaDe(av) { return av ? (av.caixaObstaculo || av.caixa) : null; }
  /* a pegada da família colocada (caixa da família girada com a peça) */
  function pegadaFam(f, av) {
    var cx = caixaDe(av); if (!cx || !isFinite(cx.x0)) return null;
    var r = num(f.rotY, 0), u = eixoU(r), v = eixoV(r), lc = [(cx.x0 + cx.x1) / 2, (cx.z0 + cx.z1) / 2], O = [num(f.x, 0), num(f.z, 0)];
    var c = [O[0] + u[0] * lc[0] + v[0] * lc[1], O[1] + u[1] * lc[0] + v[1] * lc[1]], y = num(f.y, 0);
    return obb(c, u, v, (cx.x1 - cx.x0) / 2, (cx.z1 - cx.z0) / 2, y + cx.y0, y + cx.y1);
  }
  /* REVISÃO H7: os pontos de água declarados pela família (js/familiasagua.js põe `pontosAgua` na DEFINIÇÃO da família — o avaliador
     não copia: o "x.av.pontosAgua" do auditor nunca existia e a ilha nunca ganhava o aviso do ponto de piso) */
  function pontosDaFamilia(famId) {
    var HF = dep("HidFamilias", "./hidfamilias.js"), RA = dep("FamiliasRA", "./familiasra.js");
    var f = (RA && RA.obter ? RA.obter(famId, true) : null) || (HF && HF.porId ? HF.porId(famId) : null);
    return f && f.pontosAgua ? f.pontosAgua : null;
  }
  var TXT_ILHA = "a ilha não encosta em parede: os pontos de água e de esgoto sobem pelo PISO, sob a cuba, e o Traçar automaticamente ainda não traça ponto de piso de ilha — trace à mão (Instalações › Tubo de água fria e Tubo de esgoto) do ponto até a parede mais perto, pelo piso";
  /* a classe da peça (o que o ambiente "já tem") */
  function classeDe(f, av) {
    var K = HK(), tp = K && K.tipoDaFamilia ? K.tipoDaFamilia(f.famId, f.tipoId) : null, id = txt(f.famId);
    if (tp === "bacia_valvula" || tp === "bacia_caixa_acoplada") return "bacia";
    if (tp === "lavatorio" || tp === "bancada_banho") return "lavatorio";
    if (tp === "chuveiro") return "chuveiro";
    if (tp === "pia_cozinha" || tp === "bancada_cozinha") return "pia";
    if (tp === "tanque" || tp === "tanque_familia") return "tanque";
    if (tp === "maquina_lavar_roupa") return "maquina";
    /* REVISÃO H7 (merge com o "Mobiliar ambiente"): a LAVA E SECA do catálogo é o aparelho, sem ponto de água nem de esgoto — contava
       como "o ponto da lavadora" e o Equipar não punha a torneira de máquina nem o ralo (a máquina ficava sem água no Traçar) */
    if (id === "ra-cat-lava-seca-maquina") return "lavadora";
    if (id === "ra-banho-box") return "box";
    if (id === "ra-coz-ilha" && av && arr(av.conectores).some(function (k) { return k.sistema === "agua_fria"; })) return "pia";
    if (/^ra-lazer-churrasqueira/.test(id)) return av && arr(av.conectores).some(function (k) { return k.sistema === "agua_fria"; }) ? "pia" : "churrasqueira";
    if (id === "ra-plan-armario" && av && av.valores && String(av.valores.Tipo_modulo).toLowerCase() === "base") return "base";
    return null;
  }
  function leitura(estado, avaliarFam) {
    var E = EA(); if (!E || !E.leitura) return null;
    var L = E.leitura(estado, avaliarFam), fams = arr(estado && estado.familias).map(function (f) { var av = avaliar(avaliarFam, f); return { f: f, av: av, peg: pegadaFam(f, av), classe: classeDe(f, av) }; });
    L.ambientes.forEach(function (a) {
      var P = a.pts;
      a.fams = fams.filter(function (x) {
        var r = num(x.f.rotY, 0), v = eixoV(r), p = [num(x.f.x, 0) + v[0] * 0.10, num(x.f.z, 0) + v[1] * 0.10];   // hid:ok 10 cm à frente da origem (a origem fica na face da parede)
        return x.peg ? dentro(x.peg.c, P) || dentro(p, P) : dentro(p, P);
      });
      a.portas = L.vaos.filter(function (vv) { return vv.tipo === "porta" && a.trechos.some(function (tr) { return tr.paredeId === vv.parede && vv.t >= tr.t0 - 0.02 && vv.t <= tr.t1 + 0.02; }); });   // hid:ok 2 cm: o vão no trecho
      a.janelas = L.vaos.filter(function (vv) { return vv.tipo === "janela" && a.trechos.some(function (tr) { return tr.paredeId === vv.parede && vv.t >= tr.t0 - 0.02 && vv.t <= tr.t1 + 0.02; }); });   // hid:ok idem
    });
    L.fams = fams;
    return L;
  }
  /* a FACE do trecho: ponto no parâmetro t, normal para DENTRO do cômodo, tangente no sentido do X local da peça encostada */
  function faceDe(L, tr) {
    var E = EA(), w = L.porParede[tr.paredeId]; if (!w) return null;
    var n0 = E.eixoN(w.rotY), u0 = E.eixoU(w.rotY), n = [n0[0] * tr.lado, n0[1] * tr.lado], rot = Math.atan2(n[0], n[1]), ul = eixoU(rot);
    var sgn = dot(ul, u0) > 0 ? 1 : -1;   /* o X local da peça anda no sentido de t (lado +1) ou contra (lado −1) */
    return { w: w, tr: tr, n: n, rot: rot, ul: ul, sgn: sgn,
      p: function (t) { return E.ptParede(w, t, tr.lado * w.espessura / 2); },
      /* o início "−X local" do trecho e o fim "+X local", em t */
      tIni: sgn > 0 ? tr.t0 : tr.t1, tFim: sgn > 0 ? tr.t1 : tr.t0 };
  }
  /* zona da folha de cada porta, dentro do cômodo (conservador: a largura da folha à frente, dos dois lados; PADROES §2.1) */
  function zonasPorta(L, a) {
    var E = EA(), out = [];
    a.portas.forEach(function (vv) {
      var w = L.porParede[vv.parede]; if (!w) return;
      var tr = a.trechos.filter(function (t0) { return t0.paredeId === vv.parede; })[0]; if (!tr) return;
      var n0 = E.eixoN(w.rotY), n = [n0[0] * tr.lado, n0[1] * tr.lado], u = E.eixoU(w.rotY), face = E.ptParede(w, vv.t, tr.lado * w.espessura / 2);
      var prof = Math.max(num(vv.folha, vv.largura), REGRAS["acess-9050-porta-vao"].rec);
      out.push({ porta: vv.id, o: obb(add(face, n, prof / 2), u, n, vv.largura / 2 + 0.05, prof / 2), centro: face });   // hid:ok 5 cm de batente
    });
    return out;
  }
  /* trechos livres do trecho (sem as portas; sem as janelas para peça ALTA) — [[a, b]] em t */
  function livres(a, tr, alto, alturaPeca, yRamal, folgaRamal) {
    var sp = [[tr.t0, tr.t1]];
    function tira(x0, x1) { var nv = []; sp.forEach(function (s) { if (x1 <= s[0] || x0 >= s[1]) { nv.push(s); return; } if (x0 > s[0]) nv.push([s[0], x0]); if (x1 < s[1]) nv.push([x1, s[1]]); }); sp = nv; }
    a.portas.forEach(function (vv) { if (vv.parede === tr.paredeId) tira(vv.t - vv.largura / 2 - 0.05, vv.t + vv.largura / 2 + 0.05); });   // hid:ok 5 cm de batente
    if (alto) a.janelas.forEach(function (vv) { if (vv.parede === tr.paredeId && num(vv.peitoril, 0) < alturaPeca) tira(vv.t - vv.largura / 2, vv.t + vv.largura / 2); });
    /* peça de ÁGUA: o ramal corre na parede na altura do registro de gaveta (RG, Tigre p.40) e a espera do ambiente fica na ponta da
       fileira de pontos — a janela que corta essa altura não pode ficar a menos de `folgaRamal` da peça (o ramal atravessaria o vão:
       o Traçar automaticamente recusa, "tubo atravessando … × janela"; achado na casa de teste, 21/10/2026) */
    if (yRamal != null) a.janelas.forEach(function (vv) { if (vv.parede === tr.paredeId && num(vv.peitoril, 0) < yRamal && num(vv.topo, 0) > yRamal) tira(vv.t - vv.largura / 2 - folgaRamal, vv.t + vv.largura / 2 + folgaRamal); });
    return sp.filter(function (s) { return s[1] - s[0] > 0.1; });   // hid:ok 10 cm
  }

  /* ---------------------------------------------------------------- O PROGRAMA (as peças por tipo) */
  function tipoFam(famId, re) {
    var HF = dep("HidFamilias", "./hidfamilias.js"), RA = dep("FamiliasRA", "./familiasra.js");
    var f = (HF && HF.porId ? HF.porId(famId) : null) || (RA && RA.obter ? RA.obter(famId, true) : null); if (!f) return null;
    var t = re ? arr(f.tipos).filter(function (x) { return re.test(txt(x.nome)) || re.test(txt(x.id)); })[0] : null;
    return { fam: f, tipo: t || arr(f.tipos)[0] || null };
  }
  /* catálogo da marmoraria pelo PADRÃO: médio = o de preço mediano, alto = o de maior preço (fabricante › linha › acabamento) */
  function porPadrao(lista, padrao) {
    var cp = lista.filter(function (x) { return x.preco && num(x.preco.valor, 0) > 0; }).sort(function (a, b) { return a.preco.valor - b.preco.valor; });
    if (!cp.length) return lista[0] || null;
    return padrao === "alto" ? cp[cp.length - 1] : (padrao === "economico" ? cp[0] : cp[Math.floor((cp.length - 1) / 2)]);
  }
  /* o padrão do projeto no parâmetro da bancada (js/marmoraria.js Padrao_metais: a torneira provisória do "Sem torneira" é a do padrão) */
  var NOME_PADRAO = { economico: "Econômico", medio: "Médio", alto: "Alto" };
  function rotuloCat(x) { return x ? [x.fabricante, x.linha, x.acabamento || x.material].filter(Boolean).join(" › ") : ""; }
  function bancadaPedra(amb, padrao, L) {
    var M = MM(); if (!M) return null;
    var coz = amb === "cozinha", cs = M.cubasDe(coz ? "cozinha" : "banheiro").filter(function (c) { return (coz ? c.instalacao === "embutir" : (c.instalacao === "embutir" || c.instalacao === "sobrepor")) && c.recorte && (c.n_cubas || 1) === 1; });
    var ts = M.torneirasDe(coz ? "cozinha" : "banheiro").filter(function (t) { return t.instalacao === "mesa"; });
    var cu = porPadrao(cs, padrao), tn = porPadrao(ts, padrao); if (!cu) return null;
    var famId = coz ? "ra-marm-bancada-cozinha" : "ra-marm-bancada-banho", tf = tipoFam(famId);
    return { famId: famId, tipoId: tf && tf.tipo ? tf.tipo.id : "", inst: { Comprimento: L, Cubas: 1, Cuba: cu.id, Torneira: tn ? tn.id : "Sem torneira", Padrao_metais: NOME_PADRAO[padrao] || "Médio" },
      escolha: "cuba " + rotuloCat(cu) + (tn ? "; torneira " + rotuloCat(tn) : "") };
  }
  /* cada SLOT: classe, família/tipo/inst, altura de colocação (y), pegada (larg × prof, do avaliador), faixa lateral do eixo,
     frente livre (rec/cod), alto (fora da frente da janela), canto (box), regras (ids) */
  function programa(tipo, o, A) {
    var padrao = o.padrao || "medio", pne = tipo === "banheiro_pne", out = [], K = HK();
    function alt(famId, nomeTipo) { var a = K && K.alturaInstalacao ? K.alturaInstalacao(famId, nomeTipo) : null; return a && a.ok ? a.valor : 0; }
    if (tipo === "banheiro" || tipo === "banheiro_pne") {
      var bx = tipoFam("ra-banho-box", pne ? /c120/ : /c90/);
      out.push({ slot: "box", classe: "box", nome: "Box do chuveiro", famId: "ra-banho-box", tipoId: bx && bx.tipo ? bx.tipo.id : "", inst: {}, y: 0, canto: true, alto: true, frente: "ban-nkba-frente-box", agua: false,
        regras: pne ? ["NBR 9050 7.12 (boxe ≥ 0,90 × 0,95)"] : ["PADROES 3.11 [S] box usual 0,90 × 0,90", cite("ban-nkba-box-tamanho")], chuveiro: true });
    }
    if (tipo === "banheiro" || tipo === "lavabo" || tipo === "banheiro_pne") {
      var bac = pne ? tipoFam("hid-bacia-caixa-acoplada", /HANDICAP/i) : (o.bacia === "valvula" ? tipoFam("hid-bacia-convencional") : tipoFam("hid-bacia-caixa-acoplada"));
      out.push({ slot: "bacia", classe: "bacia", nome: pne ? "Bacia para PNE (caixa acoplada)" : (o.bacia === "valvula" ? "Bacia com válvula de descarga" : "Bacia com caixa acoplada"), famId: bac.fam.id, tipoId: bac.tipo.id, inst: {}, y: 0,
        lado: "ban-nkba-vaso-eixo", frente: "ban-nkba-espaco-frontal", regras: [cite("ban-nkba-vaso-eixo"), cite("ban-nkba-espaco-frontal")], barras: pne });
      var lav;
      if (pne || tipo === "lavabo") { var ls = tipoFam("hid-lavatorio-suspenso"); lav = { famId: ls.fam.id, tipoId: ls.tipo.id, inst: {}, y: 0, nome: pne ? "Lavatório suspenso sem coluna (PNE)" : "Lavatório suspenso" }; }
      else if (padrao === "economico") { var lc = tipoFam("hid-lavatorio-coluna"); lav = { famId: lc.fam.id, tipoId: lc.tipo.id, inst: {}, y: 0, nome: "Lavatório com coluna" }; }
      else { var bp = bancadaPedra("banheiro", padrao, 1.2); lav = bp ? { famId: bp.famId, tipoId: bp.tipoId, inst: bp.inst, y: 0, nome: "Bancada de pedra com cuba e torneira", escolha: bp.escolha, larguras: [1.2, 0.8] } : null; }   // hid:ok comprimentos da bancada (tipos da família)
      if (lav) out.push({ slot: "lavatorio", classe: "lavatorio", nome: lav.nome, famId: lav.famId, tipoId: lav.tipoId, inst: lav.inst, y: lav.y, escolha: lav.escolha, larguras: lav.larguras,
        lado: "ban-nkba-lavatorio-eixo-parede", frente: "ban-nkba-espaco-frontal", regras: [cite("ban-nkba-lavatorio-eixo-parede"), cite("ban-nkba-espaco-frontal")], pne: pne });
    }
    if (tipo === "cozinha" || tipo === "gourmet") {
      var pia;
      if (padrao === "economico") { var pc = tipoFam("hid-pia-cozinha"); pia = { famId: pc.fam.id, tipoId: pc.tipo.id, inst: {}, y: alt("hid-pia-cozinha", pc.tipo.nome), nome: "Pia de cozinha (inox) — torneira de parede do kit" }; }
      else { var bc = bancadaPedra("cozinha", padrao, 1.6); pia = bc ? { famId: bc.famId, tipoId: bc.tipoId, inst: bc.inst, y: 0, nome: "Bancada de pedra com cuba e torneira", escolha: bc.escolha, larguras: [1.6, 1.2] } : null; }   // hid:ok comprimentos da bancada (tipos da família)
      if (pia) out.push({ slot: "pia", classe: "pia", nome: pia.nome, famId: pia.famId, tipoId: pia.tipoId, inst: pia.inst, y: pia.y, escolha: pia.escolha, larguras: pia.larguras, sobreBase: true,
        lado: "coz-nkba-pia-apoio", frente: "coz-nkba-corredor-1cozinheiro", regras: [cite("coz-nkba-pia-apoio", "cod"), cite("coz-nkba-corredor-1cozinheiro")] });
    }
    if (tipo === "servico") {
      /* a MÁQUINA primeiro, no canto; o tanque ao lado dela, para dentro do cômodo: com o tanque no canto e a máquina entre ele e o
         cômodo, o esgoto do tanque não acha caminho (o ralo da máquina fica na frente) — achado na casa de teste (tools/esq-cenario-casa.js) */
      var tm = tipoFam("hid-torneira", /M[áa]quina/);
      if (tm) out.push({ slot: "maquina", classe: "maquina", nome: "Ponto da lavadora (torneira de máquina; o kit põe o ralo)", famId: tm.fam.id, tipoId: tm.tipo.id, inst: {}, y: 0, reserva: { L: 0.6, P: 0.66 }, frente: "servico",   // hid:ok o lugar da lava e seca (60 × 66 cm, PADROES 3.7)
        regras: ["PADROES 3.7: máquina lado a lado com o tanque; frente livre 0,90 m [?] conferir no manual"] });
      var tq = padrao === "economico" ? tipoFam("hid-tanque-lavar") : null, tqC = null;
      if (!tq) { var RA = dep("FamiliasRA", "./familiasra.js"), fc = RA && RA.obter ? RA.obter("ra-cat-tanque-lavanderia-gabinete", true) : null;
        if (fc) { var tps = arr(fc.tipos).filter(function (t) { return t.valores && num(t.valores.Preco_unitario, 0) > 0 && num(t.valores.Altura, 0) > 0.6; }).sort(function (a, b) { return a.valores.Preco_unitario - b.valores.Preco_unitario; });   // hid:ok tanque de piso (não o suspenso)
          tqC = tps.length ? (padrao === "alto" ? tps[tps.length - 1] : tps[Math.floor((tps.length - 1) / 2)]) : null; } }
      if (tqC) out.push({ slot: "tanque", classe: "tanque", nome: "Tanque com gabinete", famId: "ra-cat-tanque-lavanderia-gabinete", tipoId: tqC.id, inst: {}, y: 0, escolha: [tqC.valores.Fabricante, tqC.nome].filter(Boolean).join(" › "), frente: "servico", regras: ["PADROES 3.7: tanque (ponto hidráulico) → máquina ao lado"] });
      else { var tl = tq || tipoFam("hid-tanque-lavar"); out.push({ slot: "tanque", classe: "tanque", nome: "Tanque de louça — torneira de parede do kit", famId: tl.fam.id, tipoId: tl.tipo.id, inst: {}, y: 0, frente: "servico", regras: ["PADROES 3.7: tanque (ponto hidráulico) → máquina ao lado"] }); }
    }
    return out;
  }

  /* ---------------------------------------------------------------- POSICIONAR um slot */
  function medidas(avaliarFam, s, inst) {
    var av = avaliarFam(s.famId, s.tipoId, inst || s.inst || {}), cx = caixaDe(av);
    if (!cx || !isFinite(cx.x0)) return null;
    var z0 = av.faceParede != null && isFinite(Number(av.faceParede)) ? Number(av.faceParede) : cx.z0;
    return { av: av, x0: cx.x0, x1: cx.x1, z0: z0, z1: cx.z1, y0: cx.y0, y1: cx.y1, larg: cx.x1 - cx.x0, prof: cx.z1 - z0 };
  }
  /* tenta pôr o slot no cômodo; devolve a melhor posição (ou null + o motivo) */
  function posicionar(ctx, s, rank) {
    var A = ctx.amb, L = ctx.L, avaliarFam = ctx.avaliarFam, melhor = null, motivo = "", tentativas = [], todos = [];
    var compr = s.larguras ? s.larguras : [null];
    ["rec", "cod"].forEach(function (qual) {
      if (melhor) return;
      compr.forEach(function (Lb) {
        if (melhor) return;
        var inst = copia(s.inst); if (Lb != null) inst.Comprimento = Lb;
        var m = medidas(avaliarFam, s, inst); if (!m) { motivo = "a família " + s.famId + " não avaliou"; return; }
        var R = s.lado && REGRAS[s.lado] ? REGRAS[s.lado][qual] : 0, F = s.frente === "servico" ? FRENTE_SERVICO : (s.frente && REGRAS[s.frente] ? REGRAS[s.frente][qual] : 0);
        var hw = Math.max(m.larg / 2, R), larg = s.reserva ? Math.max(m.larg, s.reserva.L) : m.larg, prof = s.reserva ? Math.max(m.prof, s.reserva.P) : m.prof;
        if (s.canto && s.slot === "box") { larg = m.larg; prof = m.prof; hw = larg / 2; }
        A.trechos.forEach(function (tr) {
          var fc = faceDe(L, tr); if (!fc) return;
          livres(A, tr, s.alto, m.y1 + num(s.y, 0), s.agua === false || ctx.semRamal ? null : ctx.yRamal, FOLGA_RAMAL).forEach(function (iv) {
            var cands = [];
            if (s.canto) {
              /* o box no canto: o lado −X local do box encosta na parede do lado (o início "−X" do trecho, se é canto do cômodo) */
              var ini = fc.sgn > 0 ? iv[0] : iv[1];
              if (Math.abs(ini - fc.tIni) < 0.02) cands.push(ini + fc.sgn * larg / 2);   // hid:ok 2 cm: o intervalo começa no canto
            } else {
              var a0 = iv[0] + hw, b0 = iv[1] - hw;
              for (var t = a0; t <= b0 + EPS; t += 0.05) cands.push(t);   // hid:ok grade de 5 cm
            }
            cands.forEach(function (t) {
              var P0 = fc.p(t), cP = add(P0, fc.n, prof / 2);
              var peg = obb(cP, fc.ul, fc.n, larg / 2, prof / 2, ctx.base + num(s.y, 0) + m.y0, ctx.base + num(s.y, 0) + m.y1);
              if (!dentroDoComodo(peg, A.pts)) return;
              var lat = obb(cP, fc.ul, fc.n, hw, prof / 2, ctx.base, ctx.base + 1.8);   // hid:ok faixa de uso até 1,80 m (o aéreo acima não bloqueia)
              if (!dentroDoComodo(lat, A.pts)) return;
              var fr = F > 0 ? obb(add(P0, fc.n, prof + F / 2), fc.ul, fc.n, larg / 2, F / 2, ctx.base, ctx.base + 1.8) : null;   // hid:ok idem
              if (fr && !dentroDoComodo(fr, A.pts)) return;
              var bate = false, base = null;
              ctx.ocupado.forEach(function (o) {
                if (bate) return;
                if (s.sobreBase && o.classe === "base") { if (sobrepoe(obb(peg.c, peg.u, peg.v, peg.hu, peg.hv), obb(o.peg.c, o.peg.u, o.peg.v, o.peg.hu, o.peg.hv))) base = o; return; }
                if (sobrepoe(peg, o.peg) || sobrepoe(lat, o.peg) || (fr && sobrepoe(fr, o.peg))) bate = true;
              });
              if (bate) return;
              if (ctx.portas.some(function (z) { return sobrepoe(obb(peg.c, peg.u, peg.v, peg.hu, peg.hv), z.o) || sobrepoe(obb(lat.c, lat.u, lat.v, lat.hu, lat.hv), z.o); })) return;
              /* nota: longe da porta (box e bacia), perto das peças já postas (parede molhada), recomendado vale mais */
              var dP = ctx.portas.length ? Math.min.apply(null, ctx.portas.map(function (z) { var d = sub(cP, z.centro); return Math.sqrt(dot(d, d)); })) : 0;
              var dW = ctx.molhada.length ? Math.min.apply(null, ctx.molhada.map(function (q) { var d = sub(cP, q); return Math.sqrt(dot(d, d)); })) : 0;
              /* parede EXTERNA (sem ambiente do outro lado) vale mais: o esgoto sai por ela para a caixa de fora (docs/hidro/PADRAO-IMPLANTACAO-ESGOTO.md) */
              var nota = (s.slot === "lavatorio" || s.slot === "pia" ? -0.3 * dP : dP) - dW + (ctx.molhadaParede[tr.paredeId] ? 1 : 0) + (tr.vizinho == null ? 0.5 : 0);   // hid:ok pesos da nota (desenho)
              /* REVISÃO H7 (merge com o "Mobiliar ambiente"): a pia SOBRE a base planejada vale mais — o Mobiliar deixa a base da fila da
                 cozinha para a cuba ("a cuba e o tampo de pedra… sobre a base planejada"); antes a bancada ia para outra parede */
              if (s.sobreBase && base) nota += 3;   // hid:ok peso da nota (desenho)
              if (s.slot === "maquina") nota = -Math.min(Math.abs(t - tr.t0), Math.abs(t - tr.t1)) + (tr.vizinho == null ? 0.5 : 0) + 0.1 * dP;   // hid:ok a máquina no canto, longe da porta
              var cand = { nota: nota, t: t, fc: fc, tr: tr, m: m, inst: inst, peg: peg, qual: qual, F: F, R: R, larg: larg, base: base };
              todos.push(cand);
              if (!melhor || nota > melhor.nota) melhor = cand;
            });
          });
        });
        tentativas.push(qual + (Lb != null ? " " + f2(Lb) + " m" : ""));
      });
    });
    if (!melhor) return { ok: false, motivo: motivo || ("não coube em nenhuma parede livre do cômodo (" + tentativas.join(", ") + "; portas, janelas, móveis e as faixas das regras)") };
    /* as ALTERNATIVAS (para a conferência pelo traçado): da melhor nota para a pior, uma a cada 25 cm na mesma parede */
    todos.sort(function (a, b) { return b.nota - a.nota; });
    var lista = [];
    todos.forEach(function (c) { if (lista.length < 8 && !lista.some(function (q) { return q.tr === c.tr && Math.abs(q.t - c.t) < 0.25; })) lista.push(c); });   // hid:ok 8 alternativas a ≥ 25 cm
    return { ok: true, pos: lista[Math.min(rank || 0, lista.length - 1)], alternativas: lista.length };
  }
  /* a op da família na posição achada (origem: a face de trás da família na face da parede, o meio da pegada no t) */
  function opDe(s, P, id, ambId, base) {
    base = num(base, 0);
    var m = P.m, fc = P.fc, lx = (m.x0 + m.x1) / 2, F0 = fc.p(P.t), o = add(add(F0, fc.n, -m.z0), fc.ul, -lx), y = base + num(s.y, 0), inst = copia(P.inst);
    if (P.base) {   /* sobre a base planejada: a bancada de pedra no topo dela, do comprimento da base (apoio no gabinete) */
      var bv = P.base.av && P.base.av.valores ? P.base.av.valores : {}, topo = P.base.peg.y1;
      if (/marm/.test(s.famId)) { inst.Apoio = "Gabinete"; inst.Altura = r4(topo - base + num(inst.Espessura, 0.02)); y = base; }   // hid:ok espessura usual da chapa (20 mm, js/marmoraria.js)
      else y = r4(topo);
      if (bv.Largura_total) inst.Comprimento = Math.min(num(bv.Largura_total, 1.6), 3);   // hid:ok bancada de até 3 m
    }
    return { op: "familia", id: id, famId: s.famId, tipoId: s.tipoId, x: r4(o[0]), y: r4(y), z: r4(o[1]), rotY: r4(fc.rot), inst: inst, equipar: ambId, equiparSlot: s.slot };
  }
  function precoDe(s, av, avaliarFam, inst) {
    var v = av && av.valores ? av.valores : {};
    if (/^ra-marm-/.test(s.famId)) { var M = MM(); try { var d = M.montar(v, { ambiente: /cozinha/.test(s.famId) ? "cozinha" : "banheiro" }), o = M.orcamento(d); return { valor: o.total, fonte: "orçamento da bancada (pedra, cuba, torneira e serviços — js/marmoraria.js; " + o.fonteSinapi + ")", provisorio: o.provisorios > 0 }; } catch (e) { return null; } }
    if (num(v.Preco_unitario, 0) > 0) return { valor: num(v.Preco_unitario, 0), fonte: txt(v.Fonte_preco) || "preço do tipo da família", provisorio: !!v.Preco_provisorio };
    var H = HP(), fc = H && H.familia ? H.familia(s.famId) : null, pr = fc && fc.comercial ? fc.comercial.preco : null;
    if (pr && num(pr.valor, 0) > 0) return { valor: pr.valor, fonte: (pr.codigo ? "SINAPI " + pr.codigo : (pr.codigoReferencia ? "estimativa pela SINAPI " + pr.codigoReferencia : txt(pr.fonte))) + " " + txt(pr.data) + (pr.criterio ? " — " + pr.criterio : ""), provisorio: !!pr.estimativa };
    if (s.famId === "ra-banho-box") return { valor: null, fonte: "SINAPI 102180 (vidro temperado 8 mm em perfil U) × m² do vidro + SINAPI 102189 (jogo de ferragens da porta de vidro) — no Orçamento do modelo (provisório: a SINAPI não tem o kit de correr do box; cotar com o fornecedor)", provisorio: true };
    return null;
  }

  /* ---------------------------------------------------------------- GERAR */
  function gerar(o) {
    o = o || {};
    var estado = o.estado, avaliarFam = o.avaliarFam, L = leitura(estado, avaliarFam);
    var res = { ok: false, lote: null, itens: [], pendencias: [], avisos: [], porAmbiente: {}, resumo: { pecas: 0, ambientes: 0 } };
    if (!L) { res.motivo = "o leitor do modelo (js/esqauto.js) não carregou"; return res; }
    var alvo = o.ambientes ? o.ambientes.map(String) : null, ops = [], usados = {};
    arr(estado && estado.familias).forEach(function (f) { usados[String(f.id)] = 1; });
    L.ambientes.forEach(function (A) {
      if (alvo && alvo.indexOf(String(A.id)) < 0) return;
      var cls = o.tipos && o.tipos[A.id] ? { tipo: o.tipos[A.id] } : classificar(A.nome, A.area), tipo = cls.tipo;
      if (tipo === "banheiro" && o.acessivel) tipo = "banheiro_pne";
      if (cls.aviso) res.avisos.push(cls.aviso);
      if (!tipo) {
        res.porAmbiente[A.id] = { id: A.id, nome: A.nome, tipo: null, itens: [], pendencias: [], jaTem: [] };
        if (alvo) res.pendencias.push({ ambiente: A.id, texto: "\"" + (A.nome || A.id) + "\": tipo de ambiente não reconhecido pelo nome — escolha o tipo (banheiro, lavabo, cozinha, área de serviço, gourmet)" });
        return;
      }
      var slots = programa(tipo, o, A), nSlots = slots.length;
      /* as tentativas: a melhor posição de cada peça; se o TRAÇADO do ambiente não fecha com ela (a conferência pelo js/hidambiente.js,
         o mesmo motor do Traçar automaticamente), a 2ª, a 3ª… de uma peça por vez (as outras na melhor posição que sobra) — até 8 */
      var picks = [[]], i, k;
      for (k = 1; k <= 3; k++) for (i = 0; i < nSlots; i++) { var pk = []; pk[i] = k; picks.push(pk); }   // hid:ok até a 3ª alternativa de cada peça
      var validar = o.validar !== false && HK() && BE() && dep("HidAmbiente", "./hidambiente.js"), melhorR = null, tent = 0, maxT = validar ? 12 : 2, pronto = false;   // hid:ok até 12 layouts por ambiente
      /* 1º com a folga da janela para o ramal (FOLGA_RAMAL: a janela que corta a altura do ramal fica longe das peças de água — o
         Traçar automaticamente na tela recusou o ramal pela janela onde a conferência daqui aprovava, e2e-hid-equipar 21/10/2026);
         não fechando (ou não cabendo), sem a folga — a conferência do traçado decide */
      [false, true].forEach(function (semRamal) {
        for (var pi = 0; pi < picks.length && tent < maxT && !pronto && (validar || pi === 0); pi++) {
          var oo = copia({ padrao: o.padrao, bacia: o.bacia, comKit: o.comKit }); oo.estado = o.estado; oo.avaliarFam = o.avaliarFam; oo.ops = o.ops; oo.semRamal = semRamal;
          var R = montarAmbiente(oo, L, A, tipo, slots, picks[pi], usados);
          if (R.semAlternativa) continue;
          tent++;
          R.nota = R.opsFam.length * 10;   // hid:ok cada peça posta vale mais que a conferência
          if (validar && R.opsFam.length) { R.conferencia = conferirTracado(o, ops.concat(R.ops), R, avaliarFam); if (R.conferencia.ok) R.nota += 5; }   // hid:ok idem
          if (!melhorR || R.nota > melhorR.nota) melhorR = R;
          var faltou = R.pendencias.some(function (p) { return /não coube/.test(p); });
          if ((!validar || (R.conferencia && R.conferencia.ok) || !R.opsFam.length) && !faltou) pronto = true;
        }
      });
      var R0 = melhorR;
      if (validar && R0 && R0.conferencia && !R0.conferencia.ok) R0.pendencias.push("o Traçar automaticamente não fechou o ambiente com as posições tentadas (" + tent + "): " + R0.conferencia.motivo + " — confira o layout ou trace à mão");
      res.porAmbiente[A.id] = { id: A.id, nome: A.nome, tipo: tipo, itens: R0.itens, pendencias: R0.pendencias, jaTem: R0.jaTem, tentativas: tent, conferido: !!(R0.conferencia && R0.conferencia.ok) };
      R0.ops.forEach(function (x) { ops.push(x); if (x.op === "familia") usados[x.id] = 1; });
      R0.itens.forEach(function (it) { res.itens.push(it); });
      res.resumo.pecas += R0.itens.length; if (R0.itens.length) res.resumo.ambientes++;
      /* REVISÃO H7: cada pendência com as peças para o "Mostrar no 3D" (o ambiente e o que o Equipar pôs nele; a peça citada no texto) */
      var idsA = [String(A.id)].concat(R0.opsFam.map(function (x) { return String(x.id); }));
      R0.pendencias.forEach(function (p) {
        var cit = A.fams.filter(function (x) { return p.indexOf(String(x.f.id) + " ") === 0; }).map(function (x) { return String(x.f.id); });
        res.pendencias.push({ ambiente: A.id, texto: (A.nome || A.id) + ": " + p, ids: cit.length ? cit : idsA });
      });
    });
    if (ops.length) res.lote = { op: "lote", id: PREF + "lote-" + Date.now().toString(36), origem: ORIGEM, pedido: "Equipar ambiente", ops: ops };   // hid:ok geometria/formatação (não é norma)
    res.ops = ops; res.ok = true;
    return res;
  }
  /* o kit de cada aparelho novo (o ralo do box, o ponto do chuveiro na altura CH, as esperas) — as ops dele, no mesmo lote */
  function kitsDe(o, opsNovas, avaliarFam) {
    var out = [];
    if (o.comKit === false || !HK() || !BE()) return out;
    var base = arr(o.ops).slice();
    opsNovas.filter(function (x) { return x.op === "familia"; }).forEach(function (x) {
      try {
        var st = BE().aplicar(base.concat([{ op: "lote", id: "previa", ops: opsNovas.concat(out) }]));
        var g = HK().gerar({ estado: st, avaliarFam: avaliarFam, famInst: x.id });
        if (g && g.ops && g.ops.length) out = out.concat(g.ops);
      } catch (e) {}
    });
    return out;
  }
  /* a conferência: o "Ligar ambiente" (o mesmo motor do Traçar automaticamente) fecha com as peças nesta posição? */
  function conferirTracado(o, opsTudo, R, avaliarFam) {
    var HA = dep("HidAmbiente", "./hidambiente.js"), KU = global.HidKitUI, B = global.BIM;
    /* com a tela (ou o palco dos testes): o PRÓPRIO Traçar automaticamente (HidKitUI.planejar) sobre o modelo com as peças novas — o
       BIM devolve, só durante a conta, o estado hipotético (nada é gravado; o desfazer não vê) */
    if (KU && KU.planejar && B && typeof B.editarEstado === "function" && typeof B.editarOps === "function" && BE()) {
      var oE = B.editarEstado, oO = B.editarOps, oS = B.selecao;   /* o familiaAvaliar fica o do BIM (o avaliarFam da tela chama ele: trocar dava laço) */
      try {
        var todosP = arr(o.ops).concat([{ op: "lote", id: "previa-equipar", ops: opsTudo }]), stP = BE().aplicar(todosP);
        B.editarEstado = function () { return { estado: stP, ops: todosP.length }; };
        B.editarOps = function () { return todosP; };
        B.selecao = function () { return { uids: [] }; };
        var PL = KU.planejar({ uids: ["edit:" + R.ambId], perguntarManual: false });
        if (!PL || !PL.ok) return { ok: false, motivo: txt(PL && PL.erro).slice(0, 200) };   // hid:ok corte do texto
        var stF = BE().aplicar(todosP.concat([{ op: "lote", id: "previa-tracado", ops: PL.ops }])), Bi = BI();
        var it = Bi ? Bi.verificar(stF, avaliarFam).itens : [], ids = {};
        R.opsFam.forEach(function (x) { ids[x.id] = 1; });
        var soltosP = it.filter(function (i) { return i.tipo === "conector" && !/quente/.test(txt(i.texto)) && Object.keys(ids).some(function (id) { return txt(i.texto).indexOf(" de " + id + " ") >= 0; }); });
        return soltosP.length ? { ok: false, motivo: soltosP[0].texto } : { ok: true, pelo: "planejar" };
      } catch (eP) { return { ok: false, motivo: "a conferência falhou: " + eP.message }; }
      finally { B.editarEstado = oE; B.editarOps = oO; B.selecao = oS; }
    }
    try {
      var todos = arr(o.ops).concat([{ op: "lote", id: "previa", ops: opsTudo }]), st = BE().aplicar(todos), seed = R.opsFam[0].id;
      var KU = global.HidKitUI, par = KU && KU.parametros ? KU.parametros() : {};
      /* a REDE EXTERNA proposta, como o Traçar automaticamente faz antes de ligar os ambientes (js/hidkitui.js planejar, passo b0):
         sem ela o esgoto ia para outro destino e a conferência aprovava layout que o Traçar recusa */
      var HIm = dep("HidImplantacao", "./hidimplantacao.js"), K = HK(), Bi = BI();
      if (HIm && HIm.redeProposta && K) {
        var aps = arr(st.familias).filter(function (f) { return K.tipoDaFamilia(f.famId, f.tipoId); });
        var rA = aps.length ? HIm.redeProposta(st, aps, { raio: ((Bi && Bi.PECAS) || {}).caixa_inspecao ? Bi.PECAS.caixa_inspecao.r || 0 : 0, parametros: par, baldrame: KU ? KU.modoBaldrame : undefined }) : null;
        if (rA && rA.op) { todos = todos.concat([{ op: "lote", id: "previa-rede", ops: [rA.op] }]); st = BE().aplicar(todos); }
      }
      var G = HA.ligar({ estado: st, avaliarFam: avaliarFam, ops: todos, famInst: seed, parametros: par });
      var soltos = arr(G.avisos).concat(arr(G.pendencias)).filter(function (a) { return /sem tubo \((água fria|esgoto)\)/.test(txt(a.texto || a.motivo)); });
      if (G.ok && G.rota && !soltos.length) return { ok: true };
      var mot = arr(G.descartadas).map(function (d) { return d.motivo; })[0] || (soltos[0] ? soltos[0].texto || soltos[0].motivo : "sem traçado");
      return { ok: false, motivo: txt(mot).slice(0, 200) };   // hid:ok corte do texto
    } catch (e) { return { ok: false, motivo: "a conferência falhou: " + e.message }; }
  }
  /* as peças de UM ambiente, com a escolha pick[i] (a posição alternativa da peça i) */
  function montarAmbiente(o, L, A, tipo, slots, pick, usados0) {
    var avaliarFam = o.avaliarFam, usados = copia(usados0), R = { itens: [], pendencias: [], jaTem: [], ops: [], opsFam: [], ambId: A.id };
    var ocupado = A.fams.filter(function (x) { return x.peg; }).map(function (x) { return { peg: x.peg, classe: x.classe, av: x.av, id: x.f.id }; });
    var aRG = HK() && HK().altura ? HK().altura("RG") : null;
    /* o PISO do cômodo: a base das paredes dele (o ambiente do leitor dá a cota do pavimento, que pode não ser a do piso da parede) */
    var bases = A.trechos.map(function (tr) { var w = L.porParede[tr.paredeId]; return w && isFinite(w.base) ? w.base : null; }).filter(function (b) { return b != null; });
    A.base = bases.length ? Math.min.apply(null, bases) : num(A.base, 0);
    var ctx = { amb: A, L: L, avaliarFam: avaliarFam, ocupado: ocupado, portas: zonasPorta(L, A), molhada: [], molhadaParede: {}, yRamal: aRG && aRG.ok ? aRG.valor : null, semRamal: !!o.semRamal, base: num(A.base, 0) };
    A.fams.forEach(function (x) { if (x.classe && x.classe !== "base") ctx.molhada.push(x.peg ? x.peg.c : [num(x.f.x, 0), num(x.f.z, 0)]); });
    var tem = {}; A.fams.forEach(function (x) { if (x.classe) tem[x.classe] = (tem[x.classe] || 0) + 1; });
    var ops = R.ops, orcPor = {};
    /* REVISÃO H7 (21/10/2026): UM op "orcar" por peça (a lista SUBSTITUI a anterior — js/bimedit.js; dois ops na mesma peça e o 2º
       apagaria o 1º) — juntado aqui e posto no fim, antes do kit */
    function orc(pid, sv) { if (!orcPor[pid]) orcPor[pid] = []; orcPor[pid].push(sv); }
    /* a louça/metal com a composição SINAPI EXATA na ficha (js/hidpecas.js comercial.preco.codigo) leva o código na instância: sem
       ele a família (quantitativo sem código) ficava FORA do Orçamento do modelo — a janela do Equipar mostrava o preço e o
       orçamento não cobrava. Estimativa (sem composição: o chuveiro de parede) não vira código — fica pendente, dita. */
    function composicaoDaFicha(pid, famId, it) {
      var H = HP(), fc = H && H.familia ? H.familia(famId) : null, pr = fc && fc.comercial ? fc.comercial.preco : null;
      if (pr && pr.codigo && !pr.estimativa) { orc(pid, { codigo: String(pr.codigo), medida: "quantidade", fator: 1, rotulo: (it.nome + " (SINAPI " + pr.codigo + ")").slice(0, 80) }); it.orcamento = "SINAPI " + pr.codigo; return; }   // hid:ok 80 = o tamanho do rótulo do serviço
      /* N23 (orçamento 100 %): sem composição do produto, a REFERÊNCIA da ficha (a estimativa com a fonte) vai na instância — o Orçamento do
         modelo a lança marcada PROVISÓRIA (js/orcmodelo.js, REF-MERC). Só nas famílias que têm os campos (hid-chuveiro); as outras, pendência */
      var opF = pr && pr.valor > 0 ? ops.filter(function (o) { return o && o.op === "familia" && String(o.id) === String(pid); })[0] : null, avF = opF && typeof avaliarFam === "function" ? avaliarFam(opF.famId, opF.tipoId, {}) : null;
      if (opF && avF && avF.valores && "Preco_unitario" in avF.valores) {
        opF.inst = opF.inst || {};
        opF.inst.Preco_unitario = Math.round(pr.valor * 100) / 100; opF.inst.Peca_catalogo = String(famId); opF.inst.Preco_provisorio = true; opF.inst.Data_preco = String(pr.data || "");   // hid:ok centavos
        opF.inst.Fonte_preco = "PROVISÓRIO — ficha da peça (SINAPI MG " + String(pr.data || "") + (pr.codigoReferencia ? ", insumo " + pr.codigoReferencia : "") + (pr.mais && pr.mais.codigo ? " + composição " + pr.mais.codigo : "") + "): " + String(pr.criterio || "estimativa").slice(0, 160);   // hid:ok tamanho do texto
        opF.inst.Motivo_preco = "a SINAPI não tem composição do produto escolhido: a estimativa da ficha (o maior insumo da classe), sem a mão de obra da fixação — cotar com o fornecedor";
        it.orcamento = "referência PROVISÓRIA (R$ " + opF.inst.Preco_unitario.toFixed(2).replace(".", ",") + ")";
        return;
      }
      if (pr && pr.valor > 0) R.pendencias.push(it.nome + ": sem composição SINAPI da peça (o preço mostrado é estimativa" + (pr.codigoReferencia ? " pela SINAPI " + pr.codigoReferencia : "") + ") — dê a composição em Propriedades › Orçamento");
    }
    /* o chuveiro no eixo do fundo do box (a origem do box: o meio da largura, na face da parede — familiasmobcoz.js) */
    function chuveiroNoBox(bx) {
      var ch = tipoFam("hid-chuveiro"), cid = PREF + A.id + "-chuveiro"; if (!ch || tem.chuveiro || usados[cid]) return null;
      var mc = medidas(avaliarFam, { famId: ch.fam.id, tipoId: ch.tipo.id, inst: {} }), v = eixoV(bx.rot), oc = add(bx.p, v, -(mc ? mc.z0 : 0));
      var opc = { op: "familia", id: cid, famId: ch.fam.id, tipoId: ch.tipo.id, x: r4(oc[0]), y: r4(ctx.base), z: r4(oc[1]), rotY: r4(bx.rot), inst: {}, equipar: A.id, equiparSlot: "chuveiro" };
      ops.push(opc); R.opsFam.push(opc); usados[cid] = 1; tem.chuveiro = 1;
      var itC = { tipo: "peca", id: cid, ambiente: A.id, ambienteNome: A.nome, slot: "chuveiro", nome: "Chuveiro (o kit põe o registro, o ponto na altura CH e o ralo do box)", famId: ch.fam.id, tipoId: ch.tipo.id,
        regras: ["no eixo do box, na parede do fundo"], preco: precoDe({ famId: ch.fam.id }, null, avaliarFam, {}) };
      R.itens.push(itC); composicaoDaFicha(cid, ch.fam.id, itC);
      return itC;
    }
    slots.forEach(function (s, si) {
      if (tem[s.classe]) {
        R.jaTem.push(s.nome);
        /* REVISÃO H7 (21/10/2026): o box já está (posto à mão, ou o chuveiro foi apagado) e falta o CHUVEIRO — antes o chuveiro só
           nascia junto com o box novo: o auditor acusava "falta chuveiro" e o Corrigir (este motor) não punha nada */
        if (s.chuveiro && !tem.chuveiro) { var bx0 = A.fams.filter(function (x) { return x.classe === "box"; })[0]; if (bx0) chuveiroNoBox({ p: [num(bx0.f.x, 0), num(bx0.f.z, 0)], rot: num(bx0.f.rotY, 0) }); }
        return;
      }
      var id = PREF + A.id + "-" + s.slot; if (usados[id]) { R.jaTem.push(s.nome); return; }
      /* a lava e seca já posta (Mobiliar ambiente ou à mão): o ponto da lavadora vai ATRÁS dela, na parede (a origem da peça do
         catálogo é o meio da largura no fundo, encostado — js/familiascat.js); o kit põe a altura e o ralo */
      var lav0 = s.slot === "maquina" ? A.fams.filter(function (x) { return x.classe === "lavadora"; })[0] : null;
      if (lav0) {
        var opL = { op: "familia", id: id, famId: s.famId, tipoId: s.tipoId, x: r4(num(lav0.f.x, 0)), y: r4(ctx.base + num(s.y, 0)), z: r4(num(lav0.f.z, 0)), rotY: r4(num(lav0.f.rotY, 0)), inst: copia(s.inst), equipar: A.id, equiparSlot: s.slot };
        ops.push(opL); R.opsFam.push(opL); usados[id] = 1;
        var itL = { tipo: "peca", id: id, ambiente: A.id, ambienteNome: A.nome, slot: s.slot, nome: s.nome + " — atrás da lava e seca " + lav0.f.id, famId: s.famId, tipoId: s.tipoId, escolha: "",
          regras: s.regras.concat(["atrás da lava e seca já posta (" + lav0.f.id + ")"]), preco: precoDe(s, avaliarFam(s.famId, s.tipoId, opL.inst), avaliarFam, opL.inst) };
        R.itens.push(itL); composicaoDaFicha(id, s.famId, itL);
        return;
      }
      var rk = pick[si] || 0, P = posicionar(ctx, s, rk);
      if (!P.ok) { R.pendencias.push(s.nome + ": " + P.motivo + " — posicione à mão ou aumente o cômodo"); return; }
      if (rk && rk >= P.alternativas) R.semAlternativa = true;
      var op = opDe(s, P.pos, id, A.id, ctx.base); ops.push(op); R.opsFam.push(op); usados[id] = 1;
      var avN = avaliarFam(op.famId, op.tipoId, op.inst), pegN = pegadaFam(op, avN);
      /* o lugar RESERVADO (a lava e seca, que o "Mobiliar ambiente" ou a pessoa põe) também fica ocupado, não só a torneira */
      if (s.reserva) ocupado.push({ peg: obb(P.pos.peg.c, P.pos.peg.u, P.pos.peg.v, P.pos.peg.hu, P.pos.peg.hv, ctx.base, ctx.base + 0.85), classe: "reserva", id: id });   // hid:ok altura da lava e seca (85 cm, PADROES 3.7)
      else if (pegN) ocupado.push({ peg: pegN, classe: s.classe, av: avN, id: id });
      ctx.molhada.push(pegN ? pegN.c : [op.x, op.z]); ctx.molhadaParede[P.pos.tr.paredeId] = 1;
      var it = { tipo: "peca", id: id, ambiente: A.id, ambienteNome: A.nome, slot: s.slot, nome: s.nome, famId: s.famId, tipoId: s.tipoId, escolha: s.escolha || "",
        regras: s.regras.concat(P.pos.qual === "cod" ? ["não coube o recomendado: usado o MÍNIMO de código"] : []), preco: precoDe(s, avN, avaliarFam, op.inst), parede: P.pos.tr.paredeId };
      R.itens.push(it);
      composicaoDaFicha(id, s.famId, it);
      /* o CHUVEIRO no box: no meio do fundo do box, na parede (o kit leva o ponto à altura CH da Tigre) */
      if (s.chuveiro) {
        var ch = tipoFam("hid-chuveiro"), cid = PREF + A.id + "-chuveiro";
        if (ch && !tem.chuveiro && !usados[cid]) {
          var mc = medidas(avaliarFam, { famId: ch.fam.id, tipoId: ch.tipo.id, inst: {} }), fc = P.pos.fc, F0 = fc.p(P.pos.t), oc = add(F0, fc.n, -(mc ? mc.z0 : 0));
          var opc = { op: "familia", id: cid, famId: ch.fam.id, tipoId: ch.tipo.id, x: r4(oc[0]), y: r4(ctx.base), z: r4(oc[1]), rotY: r4(fc.rot), inst: {}, equipar: A.id, equiparSlot: "chuveiro" };
          ops.push(opc); R.opsFam.push(opc); usados[cid] = 1;
          var itC = { tipo: "peca", id: cid, ambiente: A.id, ambienteNome: A.nome, slot: "chuveiro", nome: "Chuveiro (o kit põe o registro, o ponto na altura CH e o ralo do box)", famId: ch.fam.id, tipoId: ch.tipo.id,
            regras: ["no eixo do box, na parede do fundo"], preco: precoDe({ famId: ch.fam.id }, null, avaliarFam, {}) };
          R.itens.push(itC); composicaoDaFicha(cid, ch.fam.id, itC);
        }
        /* REVISÃO H7 (21/10/2026): o box no Orçamento do modelo = o VIDRO em m² (SINAPI 102180, vidro temperado 8 mm em perfil U, pelos
           serviços medidos da família: a frente e, no de canto, a lateral) + as FERRAGENS da folha (SINAPI 102189, jogo de ferragens
           cromadas da porta de vidro temperado, 1 folha: dobradiças, trinco, fechadura e puxador). Antes: só o vidro, e numa medida
           em "un" × fator m² — a regra 2 do js/orcmodelo.js (unidade da composição = a da quantidade) recusava a linha e o box saía
           SEM custo. A SINAPI não tem o kit de correr do box: a 102189 é a equivalente que há (as ferragens de uma folha de vidro) —
           PROVISÓRIO, cotar o kit com o fornecedor. */
        var vb = avN && avN.valores ? avN.valores : {}, canto = String(vb.Modelo).toLowerCase() === "canto", correr = String(vb.Porta).toLowerCase() !== "abrir";
        var area = r4((num(vb.Largura, 0) + (canto ? num(vb.Profundidade, 0) : 0)) * num(vb.Altura, 0));
        if (area > 0) {
          orc(id, { codigo: "102180", medida: "servico:vidro_frente", fator: 1, rotulo: "Box — vidro temperado 8 mm da frente (SINAPI 102180, m2)" });
          if (canto) orc(id, { codigo: "102180", medida: "servico:vidro_lateral", fator: 1, rotulo: "Box — vidro temperado 8 mm da lateral (SINAPI 102180, m2)" });
          orc(id, { codigo: "102189", medida: "quantidade", fator: 1, rotulo: correr ? "Box — ferragens da folha de correr (SINAPI 102189 equivalente, PROVISÓRIO)" : "Box — ferragens da porta de abrir (SINAPI 102189)" });
          it.regras.push("orçamento: vidro " + f2(area) + " m² (SINAPI 102180) + ferragens (SINAPI 102189" + (correr ? ", equivalente PROVISÓRIA do kit de correr — cotar com o fornecedor" : "") + ")");
        }
      }
      /* PNE: as barras de apoio da bacia (NBR 9050 7.7.2.2: horizontais ≥ 0,80 m na lateral e no fundo, vertical ≥ 0,70 m) */
      if (s.barras) { orc(id, { codigo: "100868", medida: "quantidade", fator: 2, rotulo: "Barras de apoio horizontais da bacia PNE, inox 80 cm (SINAPI 100868) — NBR 9050 7.7.2.2" });
        orc(id, { codigo: "100867", medida: "quantidade", fator: 1, rotulo: "Barra de apoio vertical da bacia PNE, inox 70 cm (SINAPI 100867) — NBR 9050 7.7.2.2" }); }
      /* PNE: o lavatório com a superfície na faixa da NBR 9050 (7.5 e / 7.8: 0,78 a 0,80 m) — a peça desce até lá */
      if (s.pne && s.slot === "lavatorio") {
        var d9 = n9050("lavatorio_superficie"), borda = avN && avN.valores ? num(avN.valores.Altura_borda, 0) : 0;
        if (d9 && d9.max != null && borda > d9.max + EPS) { op.y = r4(ctx.base + d9.max - borda); it.regras.push("NBR 9050 " + d9.item + ": superfície a " + f2(d9.max) + " m (a peça desce " + f2(borda - d9.max) + " m)"); }
        else if (!d9) R.pendencias.push("lavatório PNE: a faixa de altura da NBR 9050 (7.5/7.8) não carregou do HidNormas — confira 0,78 a 0,80 m");
      }
      if (P.pos.base) it.regras.push("sobre a base planejada " + P.pos.base.id + " (o tampo de pedra no topo dela)");
    });
    A.fams.forEach(function (x) { var pa = pontosDaFamilia(x.f.famId); if (pa && pa.piso && x.classe) R.pendencias.push(txt(x.f.id) + " (" + txt(x.f.famId) + "): " + TXT_ILHA); });
    if (tipo === "cozinha" || tipo === "gourmet") R.pendencias.push("ponto do filtro/purificador: sem família e sem altura com fonte no acervo (a tabela da Tigre p.40 não tem a linha) — a torneira da pia atende; para purificador de parede, ponha uma torneira de parede no ponto e confira a altura no manual do purificador");
    if (tipo === "banheiro_pne") {
      var giro = n9050("giro_diametro");
      if (giro && giro.min != null) {
        if (!giroLivre(A, ocupado, giro.min)) R.pendencias.push("NBR 9050 " + giro.item + ": o giro de Ø " + f2(giro.min) + " m não cabe livre no cômodo com as peças — aumente o banheiro ou reveja o layout");
        else R.itens.forEach(function (x) { if (x.slot === "bacia") x.regras.push("NBR 9050 " + giro.item + ": giro de Ø " + f2(giro.min) + " m livre conferido"); });
      }
    }
    Object.keys(orcPor).forEach(function (pid) { ops.push({ op: "orcar", id: pid, servicos: orcPor[pid] }); });
    /* o KIT de cada aparelho novo no mesmo lote */
    kitsDe(o, ops.slice(), avaliarFam).forEach(function (x) { ops.push(x); });
    return R;
  }
  /* o giro de Ø D cabe em algum ponto do cômodo sem bater em peça? (grade de 10 cm) */
  function giroLivre(A, ocupado, D) {
    var P = A.pts, xs = P.map(function (p) { return p[0]; }), zs = P.map(function (p) { return p[1]; }), r = D / 2;
    for (var x = Math.min.apply(null, xs) + r; x <= Math.max.apply(null, xs) - r + EPS; x += 0.1) for (var z = Math.min.apply(null, zs) + r; z <= Math.max.apply(null, zs) - r + EPS; z += 0.1) {   // hid:ok grade de 10 cm
      var b0 = num(A.base, 0), c = obb([x, z], [1, 0], [0, 1], r, r, b0, b0 + 0.3);   // hid:ok o giro é no chão (até 30 cm: a cuba suspensa por cima não bloqueia)
      if (!dentroDoComodo(c, P)) continue;
      if (!ocupado.some(function (o) { return o.peg.y0 < b0 + 0.3 && sobrepoe(c, o.peg); })) return true;   // hid:ok idem
    }
    return false;
  }

  /* ---------------------------------------------------------------- AUDITOR
   * (1) ambiente sanitário sem a peça obrigatória → Corrigir: equipar (as ops do gerar); (2) peça de água sem o conector exigido
   * (sem ponto de água fria; torneira não escolhida) → Corrigir: a torneira padrão / a torneira na parede; (3) conector sem tubo
   * depois do Traçar → Corrigir: traçar o ambiente (a tela roda o Traçar automaticamente). Todos com Mostrar no 3D. */
  var OBRIG = { banheiro: ["bacia", "lavatorio", "chuveiro"], banheiro_pne: ["bacia", "lavatorio", "chuveiro"], lavabo: ["bacia", "lavatorio"], cozinha: ["pia"], gourmet: ["pia"], servico: ["tanque"] };
  var NOME_CLASSE = { bacia: "bacia sanitária", lavatorio: "lavatório / cuba", chuveiro: "chuveiro", pia: "pia / cuba com torneira", tanque: "tanque", maquina: "ponto da lavadora (torneira de máquina e ralo)" };
  function auditar(o) {
    o = o || {};
    var estado = o.estado, avaliarFam = o.avaliarFam, L = leitura(estado, avaliarFam), out = { problemas: [] };
    if (!L) return out;
    var K = HK(), B = BI(), trechos = arr(estado && estado.instalacoes && estado.instalacoes.trechos);
    var temAquecedor = arr(estado && estado.familias).some(function (f) { return /aquecedor|boiler|caldeira/.test(txt(f.famId)); });
    L.ambientes.forEach(function (A) {
      var cls = o.tipos && o.tipos[A.id] ? { tipo: o.tipos[A.id] } : classificar(A.nome, A.area), tipo = cls.tipo; if (!tipo) return;
      var nomeA = A.nome || A.id, tem = {};
      A.fams.forEach(function (x) { if (x.classe) tem[x.classe] = 1; });
      /* (1) peça obrigatória */
      var falta = arr(OBRIG[tipo]).filter(function (c) { return !tem[c]; });
      if (tem.lavadora && !tem.maquina && falta.indexOf("maquina") < 0) falta.push("maquina");   /* a lava e seca sem a torneira de máquina e o ralo */
      if (falta.length) {
        /* o Corrigir sai do mesmo motor; sem a conferência pelo traçado (o auditor responde na hora; o Traçar vem depois) */
        var g = gerar({ estado: estado, avaliarFam: avaliarFam, ops: o.ops, ambientes: [A.id], padrao: o.padrao, bacia: o.bacia, validar: o.validar === true });
        out.problemas.push({ tipo: "hid-equipar-falta", gravidade: "erro", titulo: nomeA + ": falta " + falta.map(function (c) { return NOME_CLASSE[c]; }).join(", "),
          texto: "O " + (NOMES[tipo] || tipo).toLowerCase() + " pede " + arr(OBRIG[tipo]).map(function (c) { return NOME_CLASSE[c]; }).join(", ") + " (docs/arquitetura/interiores/PADROES-AMBIENTES.md §3) e o modelo não tem " + falta.map(function (c) { return NOME_CLASSE[c]; }).join(", ") + ".",
          solucoes: g.ops && g.ops.length ? [{ id: "equipar", texto: "Equipar o ambiente (põe o que falta, com o kit)", ops: g.ops, origem: ORIGEM }] : [{ id: "", texto: "não coube automático: " + g.pendencias.map(function (p) { return p.texto; }).join("; ") }],
          pecas: A.fams.map(function (x) { return String(x.f.id); }), ambiente: A.id });
      }
      /* (2) e (3) cada peça de água do ambiente */
      A.fams.forEach(function (x) {
        if (!x.classe || x.classe === "base" || x.classe === "box" || x.classe === "churrasqueira" || x.classe === "lavadora") return;
        var kt = K && K.tipoDaFamilia ? K.tipoDaFamilia(x.f.famId, x.f.tipoId) : null, kd = kt && K.kits ? K.kits()[kt] : null;
        var cs = B && x.av ? B.conectoresDe(x.av, x.f) : [], af = cs.filter(function (k) { return k.sistema === "agua_fria"; }), nomeP = (x.f.famId || "") + " " + x.f.id;
        var porTorneira = kd && kd.agua && (kd.agua.tipo === "torneira" || kd.agua.tipo === "ancora");
        if (!af.length && !porTorneira && x.classe !== "maquina") {
          var face = cs.filter(function (k) { return k.parede; })[0] || cs[0], tq = tipoFam("hid-torneira", /Cozinha de Parede|Lavat/i);
          var solT = face && tq ? [{ id: "torneira", texto: "Pôr a torneira de parede no ponto (família hid-torneira, atrás da peça)", ops: [{ op: "familia", id: PREF + "tn-" + x.f.id, famId: tq.fam.id, tipoId: tq.tipo.id, x: face.x, y: r4(face.y + 0.2), z: face.z, rotY: num(x.f.rotY, 0), inst: {} }] }] : [];   // hid:ok 20 cm acima do esgoto (provisório: o kit refaz a altura)
          out.problemas.push({ tipo: "hid-equipar-sem-agua", gravidade: "erro", titulo: nomeA + ": " + nomeP + " recebe água e não tem o ponto de água fria",
            texto: "A peça é de água (cuba, lavatório, tanque ou pia) e a família não expõe o conector de água fria: o Traçar automaticamente leva só o esgoto. Troque pela família da biblioteca (que tem o ponto) ou ponha a torneira.", solucoes: solT, pecas: [String(x.f.id)] });
        }
        var paI = pontosDaFamilia(x.f.famId);
        if (paI && paI.piso) out.problemas.push({ tipo: "hid-equipar-ilha", gravidade: "aviso", titulo: nomeA + ": " + nomeP + " — pontos de piso (ilha)", texto: TXT_ILHA.charAt(0).toUpperCase() + TXT_ILHA.slice(1) + ".",
          solucoes: [{ id: "", texto: "traçar à mão: Instalações › Tubo de água fria / Tubo de esgoto, do ponto da ilha até a parede (o Mostrar no 3D leva até a ilha)" }], pecas: [String(x.f.id)], ambiente: A.id });
        arr(x.av && x.av.escolhas).forEach(function (e) {
          /* REVISÃO H7: a torneira do Corrigir é a do PADRÃO da bancada (Padrao_metais; senão o do Equipar) — antes, a 1ª do catálogo */
          var M = MM(), amb = /cozinha/.test(txt(x.f.famId)) ? "cozinha" : "banheiro", ins = {};
          var pdB = M && M.padraoDe && x.av && x.av.valores && x.av.valores.Padrao_metais ? M.padraoDe(x.av.valores.Padrao_metais) : (o.padrao || "medio");
          var t0 = M ? porPadrao(M.torneirasDe(amb).filter(function (t) { return t.instalacao === "mesa"; }), pdB) : null;
          if (t0) ins[e.campo] = t0.id;
          out.problemas.push({ tipo: "hid-equipar-torneira", gravidade: "aviso", titulo: nomeA + ": " + nomeP + " — torneira não escolhida", texto: e.texto,
            solucoes: t0 ? [{ id: "torneira-padrao", texto: "Usar a torneira de mesa " + M.rotuloTorneira(t0), ops: [{ op: "instancia", id: x.f.id, inst: ins }] }] : [], pecas: [String(x.f.id)] });
        });
        /* (3) depois do Traçar: todo ponto de água fria e de esgoto com tubo (a água quente só com aquecedor no modelo) */
        if (!o.aposTracar && !trechos.length) return;
        var soltos = cs.filter(function (k) {
          if (k.sistema !== "agua_fria" && k.sistema !== "esgoto" && !(k.sistema === "agua_quente" && temAquecedor)) return false;
          return !trechos.some(function (t) { return t.sistema === k.sistema && [t.p1, t.p2].some(function (p) { return Math.hypot(p.x - k.x, p.y - k.y, p.z - k.z) <= 0.02; }); });   // hid:ok 2 cm: a ponta no ponto
        });
        if (soltos.length) out.problemas.push({ tipo: "hid-equipar-sem-tubo", gravidade: "erro", titulo: nomeA + ": " + nomeP + " com ponto sem tubo",
          texto: (paI && paI.piso ? TXT_ILHA.charAt(0).toUpperCase() + TXT_ILHA.slice(1) + ". " : "") +
            "Pontos sem tubo: " + soltos.map(function (k) { return k.nome + " (" + k.sistema.replace("_", " ") + ")"; }).join("; ") + ".",
          solucoes: [{ id: "tracar", texto: "Traçar automaticamente o ambiente", acao: "tracar", ambiente: A.id }], pecas: [String(x.f.id)] });
      });
    });
    return out;
  }

  var HidEquipar = { gerar: gerar, auditar: auditar, classificar: classificar, programa: programa, leitura: leitura, posicionar: posicionar, REGRAS: REGRAS, NOMES: NOMES, OBRIG: OBRIG, ORIGEM: ORIGEM, PREF: PREF,
    _int: { sobrepoe: sobrepoe, obb: obb, faceDe: faceDe, livres: livres, giroLivre: giroLivre, classeDe: classeDe } };
  global.HidEquipar = HidEquipar;
  if (typeof module !== "undefined" && module.exports) module.exports = HidEquipar;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
