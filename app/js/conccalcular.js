/* =====================================================================
 * conccalcular.js — "CALCULAR" a estrutura lançada: roda C1–C4 sobre o modelo e diz, peça a peça, VERDE / VERMELHO / LARANJA
 * (fase S2, 14/11/2026, docs/concreto/FLUXO-SUGERIR-ESTRUTURA.md etapa 8). Motor PURO, ES5, Node-testável: tools/test-conc-s2.js.
 *
 *   ConcCalcular.rodar(estado, { ops, niveis, fck, caa, permitirPilar12 }) → { ok, motivo, pecas: [{ id, marca, tipo, estado, aproveitamento, secao, motivo, sugestao }], pintura, resumo, avisos, pendencias, rotulo }
 *
 *   C1 = ConcAnalise (pórtico: cargas, combinações, esforços) · C2 = ConcViga · C3 = ConcLaje (maciça retangular) · C4 = ConcPilar.
 *   estado da peça:
 *     "ok"          atende em tudo o que o motor verifica                                        → VERDE
 *     "falha"       reprovada (ou o motor não fechou a conta)                                    → VERMELHO, com a seção sugerida quando há
 *     "fora-norma"  pilar de 12 a 14 cm: atende, mas fora da NBR 6118:2023 13.2.3 (opção do projeto, decisão do RT)  → LARANJA
 *     "sem-calculo" laje treliçada, laje que não é retângulo… o motor não calcula (fica sem cor, listada)
 *   sugestao = { texto, secao, ops: [{ op: "ajustar", id, campos: { perfil } }] } — a mesma operação do auditor: idempotente (a seção é ABSOLUTA, não um acréscimo).
 *   A seção sugerida da VIGA vem de refazer o pórtico com a viga mais alta (de 5 em 5 cm, até +30) e conferir de novo; a do PILAR vem do C4.
 *
 * ⚠ É CÁLCULO DE APOIO (rótulo do C1–C4): o engenheiro responsável (ART) confere, dimensiona e assina. O laranja não é "aprovado": é "atende na conta,
 *   mas a NBR 6118 em vigor não cobre a peça".
 * ⚠ Cores por UID do editor ("edit:<id>"): quem pinta é o BIM.pintarUids (js/bim.js).
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) { /* sem o módulo */ } } return null; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v, d) { var x = Number(v); return v != null && v !== "" && isFinite(x) ? x : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function cm(v) { return Math.round(v * 100); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  var COR = { ok: "#2e9e4f", falha: "#d23c3c", "fora-norma": "#f59e0b" };
  var ROTULO_ESTADO = { ok: "atende", falha: "REPROVADA", "fora-norma": "atende, FORA da NBR 6118:2023 (habilitado pelo RT)", "sem-calculo": "sem cálculo" };

  function opSecao(id, b, h) { return { op: "ajustar", id: id, campos: { perfil: { forma: "ret", b: r4(b), h: r4(h) } } }; }

  /* uma laje maciça retangular do modelo → a entrada do ConcLaje.dimensionarLaje (mesma leitura do ConcLaje.fracoesDoModelo) */
  function entradaLaje(l, an, fck, caa) {
    var ed = arr(l.ed);
    if (l.tipo !== "macica") return { ok: false, motivo: "laje " + (l.tipo === "trelicada" ? "treliçada: a altura certa é a da tabela do fabricante" : "do tipo " + l.tipo + ": fora do motor") };
    if (ed.length !== 4) return { ok: false, motivo: "laje não retangular (" + ed.length + " bordas): fica nas charneiras do C1" };
    var L = ed.map(function (x) { return x.L; });
    if (Math.abs(L[0] - L[2]) > 0.02 * Math.max(L[0], L[2]) || Math.abs(L[1] - L[3]) > 0.02 * Math.max(L[1], L[3])) return { ok: false, motivo: "laje não retangular (lados opostos diferentes)" };
    var curtas = L[0] <= L[1] ? [0, 2] : [1, 3], longas = L[0] <= L[1] ? [1, 3] : [0, 2], lx = Math.min(L[0], L[1]), ly = Math.max(L[0], L[1]), h = num(l.h, 0.1);
    var uso = an.cargas && an.cargas.usos ? an.cargas.usos[l.id] : null;
    if (!uso) return { ok: false, motivo: "sem a sobrecarga de uso da laje" };
    /* ⚠ revisão de cálculo 14/11/2026: a carga permanente vem do ConcCargas (peso próprio + revestimento + alvenaria apoiada direto na laje, por laje: uso.gKNm2); só sem ela cai no
     * 25·h + 1,0 de antes, e AVISA — o número deixou de ser o da carga que o modelo realmente tem. O uso (balanço/cobertura/piso) vai para a espessura mínima da 13.2.4.1. */
    var temG = uso.gKNm2 != null && isFinite(uso.gKNm2);
    return { ok: true, aviso: temG ? null : "laje " + (l.marca || l.id) + ": sem a carga permanente do C1 — usado o padrão 25·h + 1,0 kN/m² (peso próprio + revestimento)", e: { id: l.id, marca: l.marca, lx: lx, ly: ly, h: h, fck: fck, caa: caa, g: temG ? uso.gKNm2 : 25 * h + 1.0, q: uso.qKNm2,
      usoLaje: l.balanco ? "balanco" : (uso.usoLaje || "piso"), balanco: !!l.balanco, umaDirecao: !!l.umaDirecao,
      bordas: { x: [ed[longas[0]].tipo, ed[longas[1]].tipo], y: [ed[curtas[0]].tipo, ed[curtas[1]].tipo] } } };
  }

  /* ⚠ LARGURA DO APOIO (revisão de cálculo 14/11/2026, decisão 1): a ancoragem da armadura no apoio extremo (18.3.2.4.1) precisa do espaço disponível. Ele vem do MODELO: a dimensão do pilar
   * na direção do eixo da viga (projeção da seção retangular no eixo) ou, se a ponta cai no miolo de outra viga, a largura dessa viga cortada pelo eixo (bw / |sen θ|). Ponta que continua em
   * outra viga alinhada (apoio intermediário) não tem ancoragem de extremo; extremidade de barra partida no meio do vão também é intermediária. Sem pilar nem viga sob a ponta, NÃO
   * entra larg: a viga fica "sem-calculo" (nunca verde sem a verificação). Devolve { idBarra: { apoios: { esq:{tipo,larg}, dir:{...} } } }. */
  function apoiosDeModelo(an) {
    var m = an && an.modelo, out = {};
    if (!m) return out;
    var TOL = 0.03, nosId = {}, pil = m.pecas && m.pecas.pilares ? m.pecas.pilares : {}, vig = m.pecas && m.pecas.vigas ? m.pecas.vigas : {};
    arr(m.nos).forEach(function (n) { nosId[n.id] = n; });
    var barras = arr(m.barras);
    function dirDe(P, Q) { var dx = Q.x - P.x, dz = Q.z - P.z, l = Math.sqrt(dx * dx + dz * dz); return l > 1e-9 ? [dx / l, dz / l] : null; }
    var ultPil = null;   /* a peça do pilar que deu a largura (a sugestão "alargar o apoio" precisa saber QUAL pilar) */
    function larguraEm(no, d, idPeca) {
      var melhor = null; ultPil = null;
      Object.keys(pil).forEach(function (k) {
        var p = pil[k]; if (no.y < p.base - 0.05 || no.y > p.top + 0.05) return;
        var dx = no.x - p.cx, dz = no.z - p.cz, u = dx * Math.cos(p.rotY) - dz * Math.sin(p.rotY), w = dx * Math.sin(p.rotY) + dz * Math.cos(p.rotY);
        if (Math.abs(u) > p.comp / 2 + TOL || Math.abs(w) > p.esp / 2 + TOL) return;
        var ud = Math.abs(Math.cos(p.rotY) * d[0] - Math.sin(p.rotY) * d[1]), wd = Math.abs(Math.sin(p.rotY) * d[0] + Math.cos(p.rotY) * d[1]);
        var ext = p.comp * ud + p.esp * wd; if (melhor == null || ext > melhor) { melhor = ext; ultPil = k; }
      });
      if (melhor != null) return melhor;
      ultPil = null;
      Object.keys(vig).forEach(function (k) {
        var v = vig[k]; if (k === idPeca || Math.abs(no.y - v.y) > 0.05) return;
        var ex = v.B.x - v.A.x, ez = v.B.z - v.A.z, l2 = ex * ex + ez * ez; if (l2 < 1e-9) return;
        var t = ((no.x - v.A.x) * ex + (no.z - v.A.z) * ez) / l2; if (t < -0.001 || t > 1.001) return;
        var dist = Math.sqrt(Math.pow(v.A.x + ex * t - no.x, 2) + Math.pow(v.A.z + ez * t - no.z, 2)); if (dist > TOL) return;
        var l = Math.sqrt(l2), sen = Math.abs(d[0] * (ez / l) - d[1] * (ex / l)); if (sen < 0.2) return;
        var ext2 = v.b / sen; if (melhor == null || ext2 > melhor) melhor = ext2;
      });
      return melhor;
    }
    barras.forEach(function (b) {
      if (b.tipo !== "viga" || b.rigida) return;
      var P = nosId[b.ni], Q = nosId[b.nj], dd = P && Q ? dirDe(P, Q) : null; if (!dd) return;
      var o = {};
      [["esq", b.ni, P, dd, b.partida && !b.ptoI], ["dir", b.nj, Q, [-dd[0], -dd[1]], b.partida && !b.ptoJ]].forEach(function (e) {
        if (e[4]) { o[e[0]] = { tipo: "intermediario" }; return; }
        var continua = barras.some(function (x) {
          if (x === b || x.tipo !== "viga" || x.rigida || (x.ni !== e[1] && x.nj !== e[1])) return false;
          var a = nosId[x.ni], c = nosId[x.nj], dx = dirDe(x.ni === e[1] ? a : c, x.ni === e[1] ? c : a); return !!dx && dx[0] * e[3][0] + dx[1] * e[3][1] < -0.99;
        });
        if (continua) { o[e[0]] = { tipo: "intermediario" }; return; }
        var L = larguraEm(e[2], e[3], b.peca);
        o[e[0]] = L != null ? { tipo: "extremo", larg: L, pilar: ultPil, d: e[3] } : { tipo: "extremo" };
      });
      out[b.id] = { apoios: o };
    });
    return out;
  }

  /* roda o pórtico e as vigas; devolve o resultado das vigas por PEÇA */
  function vigasDe(est, fck, p12, caa, AN, VG) {
    var an = AN.rodar(est, { fck: fck, agregado: "granito", estacoes: 21, lajesPorTabela: true, permitirPilar12: p12 });
    if (!an.ok) return { ok: false, motivo: an.motivo, an: an };
    var dv = VG.dimensionarDeAnalise(an, { caa: caa, porBarra: apoiosDeModelo(an) }), porBarra = {};
    an.modelo.barras.forEach(function (b) { porBarra[b.id] = b.peca; });
    var porPeca = {};
    if (dv.ok) arr(dv.vigas).forEach(function (v) { porPeca[porBarra[v.id] || v.id] = v; });
    return { ok: dv.ok, motivo: dv.motivo, an: an, dv: dv, porPeca: porPeca };
  }

  /* ⚠ FATIAS (14/11/2026): o cálculo é uma FILA de passos pequenos (pórtico+vigas · um pilar por passo · uma altura de viga por passo · uma laje por passo · fechamento).
   * rodar() consome a fila de uma vez (o teste e quem não tem tela); a tela usa iniciar() e chama passo() de setTimeout em setTimeout, com progresso e cancelar —
   * antes era um laço síncrono de ~20 s (18 pilares) que congelava o navegador. O resultado é o MESMO nos dois caminhos (o teste S2 compara). */
  function iniciar(estado, opc) {
    opc = opc || {};
    var AN = dep("ConcAnalise", "./concanalise.js"), PL = dep("ConcPilar", "./concpilar.js"), VG = dep("ConcViga", "./concviga.js"), LJ = dep("ConcLaje", "./conclaje.js"), CL = dep("ConcLanc", "./conclanc.js"), BE = dep("BimEdit", "./bimedit.js");
    function pronta(r) { return { feito: true, resultado: r, passo: function () { return this; }, restantes: function () { return 0; }, feitos: 0, rotulo: "" }; }
    if (!AN || !PL || !VG || !LJ) return pronta({ ok: false, motivo: "Os módulos do cálculo de concreto (C1–C4) não carregaram." });
    var caixas = arr(estado && estado.caixas), temEstr = caixas.some(function (c) { return c && c.conc && (c.conc.papel === "pilar" || c.conc.papel === "viga" || c.conc.papel === "laje"); });
    if (!temEstr) return pronta({ ok: false, motivo: "Não há estrutura lançada: rode o Sugerir estrutura antes de calcular." });
    var fck = num(opc.fck, CL && CL.crit ? CL.crit("fckPadraoMPa", 25) : 25), caa = num(opc.caa, 2), p12 = opc.permitirPilar12 === true, avisos = [], pendencias = [], pecas = [];
    var fila = [], T = { feito: false, resultado: null, feitos: 0, rotulo: "" }, base = null, an = null, dp = null, job = null, porId = {}, falhas = [], pend = {}, parar = false;
    function falhar(o) { fila.length = 0; T.resultado = o; }
    function depois(rot, fn) { fila.push({ rot: rot, fn: fn }); }
    function seguinte(lista) { fila = lista.concat(fila); }   /* passos novos entram NA FRENTE do que já estava na fila (a ordem do cálculo original) */

    depois("Pórtico (C1) e vigas (C2)", function () {
      base = vigasDe(estado, fck, p12, caa, AN, VG);
      if (!base.ok && !base.an.ok) return falhar({ ok: false, motivo: "A análise do pórtico (C1) não fechou: " + base.motivo, avisos: arr(base.an && base.an.avisos) });
      an = base.an; avisos = avisos.concat(arr(an.avisos));
      job = PL.dimensionarDeAnalise(an, { caa: caa, permitirPilar12: p12, fatiado: true });
      var novos = [];
      if (job.fatiado) { for (var i = 0; i < job.total; i++) novos.push({ rot: "Pilar " + (i + 1) + " de " + job.total + " (C4)", fn: function () { job.passo(); } }); }
      novos.push({ rot: "Pilares: fechando", fn: passoPilares }, { rot: "Vigas (C2)", fn: passoVigas });
      seguinte(novos);
    });

    /* ---- C4: pilares */
    function passoPilares() {
      dp = job.fatiado ? job.fechar() : job;
      caixas.forEach(function (c) { if (c) porId[String(c.id)] = c; });
      if (!dp.ok) avisos.push("Pilares (C4): " + dp.motivo);
      arr(dp.pilares).forEach(function (q) {
        var cx = porId[String(q.id)], secao = cx ? cm(num(cx.espessura, 0)) + " × " + cm(num(cx.comprimento, 0)) : (q.secao ? Math.round(q.secao.hy) + " × " + Math.round(q.secao.hx) : "");   /* a seção ATUAL da peça (pode ter sido mexida depois do lançamento), não a do rótulo do lançamento */
        var estadoP = q.semCalculo ? "sem-calculo" : (!q.ok || !q.atende ? "falha" : (q.foraNorma ? "fora-norma" : "ok")), p = { id: String(q.id), marca: q.marca || (cx && cx.marca) || "", tipo: "pilar", estado: estadoP, aproveitamento: q.aproveitamento, secao: secao, motivo: q.ok ? "" : q.motivo };
        if (estadoP === "falha" && q.ok && q.sugestao && q.sugestao.ok) {
          p.sugestao = { texto: "passar para " + cm(q.sugestao.hx) + " × " + cm(q.sugestao.hy) + " cm — " + q.sugestao.texto, secao: cm(q.sugestao.hx) + " × " + cm(q.sugestao.hy), ops: [opSecao(q.id, q.sugestao.hx, q.sugestao.hy)] };
        }
        /* o C4 nem calcula pilar abaixo do mínimo da norma (ok:false): a sugestão é a do próprio mínimo — lado ≥ 14 cm e área ≥ 360 cm² (6118:2023 13.2.3), a mesma regra do auditor, com a orientação mantida */
        if (estadoP === "falha" && !q.ok && cx && CL && CL.crit) {
          var comp = cm(num(cx.comprimento, 0)), esp = cm(num(cx.espessura, 0)), menor = Math.min(comp, esp), maior = Math.max(comp, esp), bN = Math.max(menor, CL.crit("pilarLadoEspecialCm", 14)), LN = Math.max(maior, Math.ceil(CL.crit("pilarAreaMinimaCm2", 360) / bN));
          if (menor < CL.crit("pilarLadoEspecialCm", 14) || menor * maior < CL.crit("pilarAreaMinimaCm2", 360)) {
            p.sugestao = { texto: "passar para " + bN + " × " + LN + " cm (o mínimo da NBR 6118:2023, 13.2.3: lado 14 cm e área 360 cm²)", secao: bN + " × " + LN, ops: [opSecao(q.id, comp >= esp ? LN / 100 : bN / 100, comp >= esp ? bN / 100 : LN / 100)] };
          }
        }
        if (estadoP === "fora-norma") p.motivo = "fora da NBR 6118:2023, 13.2.3 — habilitado pelo RT";
        pecas.push(p);
      });
    }

    /* ---- C2: vigas */
    function passoVigas() {
      if (!base.ok) avisos.push("Vigas (C2): " + base.motivo);
      caixas.forEach(function (c) {
        if (!c || !c.conc || c.conc.papel !== "viga") return;
        var v = base.porPeca[String(c.id)];
        /* ⚠ viga incompleta (revisão de cálculo 14/11/2026): sem a largura do apoio a ancoragem não foi conferida — "atende" sem isso era verde sem a verificação. Fica "sem-calculo" (listada, sem cor) com o motivo. */
        var p = { id: String(c.id), marca: c.marca || "", tipo: "viga", estado: v ? (v.atende ? (v.incompleto ? "sem-calculo" : "ok") : "falha") : "sem-calculo", aproveitamento: v ? v.aproveitamento : null, secao: cm(num(c.espessura, 0)) + " × " + cm(num(c.altura, 0)), motivo: v ? (v.atende && v.incompleto ? (arr(v.pendencias).filter(function (t) { return /largura do apoio/.test(t); })[0] || "largura do apoio não informada: a ancoragem não foi conferida") : "") : "a viga não entrou no modelo do pórtico" };
        if (v && !v.atende) { p.motivo = arr(v.avisos)[0] || "reprovada em flexão, cortante, flecha ou fissuração"; falhas.push(p); }
        pecas.push(p);
      });
      /* a seção sugerida da viga: mais alta de 5 em 5 cm (o topo fica), conferida de novo no pórtico — UM passo por altura testada */
      var novos = [], paraAltura = [], porPilar = {};
      /* ⚠ ANCORAGEM NO APOIO (15/11/2026): viga reprovada SÓ porque o gancho/trecho de ancoragem não cabe no apoio extremo não melhora com mais altura (até +30 cm não fechava e a mensagem
       * mandava "aumentar a altura"). A saída é ALARGAR O APOIO: girar o pilar (lado maior ao longo da viga) ou aumentar o lado dele. Aqui separo as vigas e agrupo por pilar. */
      falhas.forEach(function (p) {
        var v = base.porPeca[p.id], anc = v ? ancoragensDe(v) : [];
        if (anc.length && !outraFalha(v)) { anc.forEach(function (a) { if (a.pilar != null) (porPilar[a.pilar] = porPilar[a.pilar] || []).push({ p: p, a: a }); }); }
        else paraAltura.push(p);
      });
      if (paraAltura.length && BE && arr(opc.ops).length) {
        paraAltura.forEach(function (p) { pend[p.id] = p; });
        for (var d = 5; d <= 30; d += 5) novos.push({ rot: "Vigas reprovadas: +" + d + " cm de altura", fn: passoAltura(d) });
        novos.push({ rot: "Vigas reprovadas: fechando", fn: function () { Object.keys(pend).forEach(function (id) { pend[id].motivo += " — até +30 cm de altura não fechou: o engenheiro concebe outra solução"; }); } });
      } else if (paraAltura.length) avisos.push("Sem as operações do editor não dá para sugerir a seção das vigas reprovadas.");
      if (BE && arr(opc.ops).length) Object.keys(porPilar).forEach(function (k) { novos.push({ rot: "Alargar o apoio (pilar " + ((porId[k] && porId[k].marca) || k) + ")", fn: function () { passoApoio(k, porPilar[k]); } }); });
      else if (Object.keys(porPilar).length) avisos.push("Sem as operações do editor não dá para sugerir o alargamento do apoio.");
      /* ---- C3: lajes maciças retangulares — uma por passo */
      arr(an.modelo.lajes).forEach(function (l) { novos.push({ rot: "Laje " + (l.marca || l.id) + " (C3)", fn: function () { passoLaje(l); } }); });
      novos.push({ rot: "Fechando o resultado", fn: fechar });
      seguinte(novos);
    }
    /* apoios extremos desta viga que a ancoragem reprovou: { barra, lado, need (cm de apoio total: ℓb,mín com gancho + cobrimento), pilar, d } — o `pilar` e a direção vêm do MODELO */
    function ancoragensDe(v) {
      var ap = apoiosDeModelo(an), out = [];
      arr(v.tramos).forEach(function (o) {
        ["esq", "dir"].forEach(function (lado) {
          var i = o.apoios && o.apoios[lado]; if (!i || i.tipo !== "extremo" || !i.comGancho || i.comGancho.cabe !== false) return;
          var m = ap[o.id] && ap[o.id].apoios && ap[o.id].apoios[lado];
          out.push({ barra: o.id, lado: lado, need: i.comGancho.trechoMin.valor + (o.entrada ? o.entrada.cobrimento : 0), pilar: m && m.pilar != null ? String(m.pilar) : null, d: m && m.d });
        });
      });
      return out;
    }
    /* a viga reprovou por algo ALÉM da ancoragem (flexão, cortante, flecha...)? então a saída continua sendo a altura */
    function outraFalha(v) {
      return arr(v.tramos).some(function (o) { return !o.ok || arr(o.verificacoes).some(function (x) { return x.valor > 1 + 1e-9 && !/^Ancoragem no apoio/.test(x.nome); }); });
    }
    /* um pilar: tenta (1) GIRAR (troca os lados: o maior fica ao longo da viga) e (2) AUMENTAR o lado ao longo da viga até o apoio que a ancoragem pede; vale o primeiro que, recalculado no pórtico,
     * fecha as vigas daquele pilar SEM reprovar outra que atendia (girar no canto tira a folga da outra viga: por isso a conferência). Operação ABSOLUTA (a seção, não um acréscimo): idempotente. */
    function passoApoio(k, itens) {
      var cx = porId[k], pm = an.modelo && an.modelo.pecas && an.modelo.pecas.pilares ? an.modelo.pecas.pilares[k] : null;
      if (!cx || !pm) return;
      var comp = cm(num(cx.comprimento, 0)), esp = cm(num(cx.espessura, 0)), marca = cx.marca || k, cs = Math.cos(pm.rotY), sn = Math.sin(pm.rotY);
      /* o próprio pilar também reprovou e tem a sua seção sugerida (ex.: área mínima): parte DELA — senão as duas sugestões se atropelam (a última aplicada vence). Aceita a candidata, a seção do
       * pilar passa a ser a candidata (que a contém), e as duas sugestões ficam iguais. */
      var pPil = pecas.filter(function (x) { return x.tipo === "pilar" && x.id === String(cx.id) && x.sugestao && x.sugestao.ops && x.sugestao.ops[0] && x.sugestao.ops[0].campos && x.sugestao.ops[0].campos.perfil; })[0], opBase = null;
      if (pPil) { opBase = pPil.sugestao.ops[0]; comp = cm(opBase.campos.perfil.b); esp = cm(opBase.campos.perfil.h); }
      function proj(it) { return { u: Math.abs(cs * it.a.d[0] - sn * it.a.d[1]), w: Math.abs(sn * it.a.d[0] + cs * it.a.d[1]) }; }
      var cands = [], girar = true, nc = comp, ne = esp, alinhado = true;
      itens.forEach(function (it) {
        var q = proj(it), extG = esp * q.u + comp * q.w;       /* a extensão ao longo da viga com os lados trocados */
        if (extG + 1e-9 < it.a.need) girar = false;
        if (q.u >= 0.99) nc = Math.max(nc, Math.ceil(it.a.need - 1e-9)); else if (q.w >= 0.99) ne = Math.max(ne, Math.ceil(it.a.need - 1e-9)); else alinhado = false;
      });
      if (girar && comp !== esp) cands.push({ b: esp, h: comp, texto: "girar o pilar " + marca + " (" + esp + " × " + comp + " em vez de " + comp + " × " + esp + " cm): o lado maior fica ao longo da viga e o apoio passa a caber a ancoragem" });
      if (alinhado && (nc !== comp || ne !== esp)) cands.push({ b: nc, h: ne, texto: "aumentar o lado do pilar " + marca + " ao longo da viga (seção " + nc + " × " + ne + " cm em vez de " + comp + " × " + esp + " cm): a ancoragem da armadura no apoio extremo pede " + Math.max.apply(null, itens.map(function (it) { return Math.ceil(it.a.need - 1e-9); })) + " cm (NBR 6118:2023, 18.3.2.4.1)" });
      var emFalha = {}; falhas.forEach(function (p) { emFalha[p.id] = 1; });
      for (var ci = 0; ci < cands.length; ci++) {
        var c = cands[ci], op = opSecao(cx.id, c.b / 100, c.h / 100), est2 = null;
        try { est2 = BE.aplicar(clone(arr(opc.ops).concat(opBase ? [opBase] : [], [op])), opc.niveis ? { niveis: opc.niveis } : undefined); } catch (eA) { est2 = null; }
        if (!est2) continue;
        var t2 = vigasDe(est2, fck, p12, caa, AN, VG); if (!t2.porPeca) continue;
        /* o que se confere é o APOIO deste pilar (a viga pode ter o outro extremo em outro pilar, que tem o seu próprio passo) */
        var bom = itens.every(function (it) {
          var v2 = t2.porPeca[it.p.id], o2 = v2 && arr(v2.tramos).filter(function (o) { return o.id === it.a.barra; })[0], i2 = o2 && o2.apoios && o2.apoios[it.a.lado];
          return !!i2 && !(i2.comGancho && i2.comGancho.cabe === false);
        });
        Object.keys(base.porPeca).forEach(function (id) { var v1 = base.porPeca[id], v2 = t2.porPeca[id]; if (v1 && v1.atende && !(v2 && v2.atende)) bom = false; });
        if (!bom) continue;
        itens.forEach(function (it) {
          var sg = { texto: "alargar o apoio: " + c.texto, secao: c.b + " × " + c.h, ops: [op], pecas: [it.p.id, String(cx.id)] };
          if (it.p.sugestao && it.p.sugestao.ops.length) { sg.texto = it.p.sugestao.texto + "; " + sg.texto; sg.ops = it.p.sugestao.ops.concat(sg.ops); sg.secao = it.p.sugestao.secao + "+" + sg.secao; sg.pecas = it.p.sugestao.pecas.concat(sg.pecas); }
          it.p.sugestao = sg;
        });
        if (pPil) { pPil.sugestao = { texto: pPil.sugestao.texto + "; e, para a viga ancorar, " + c.texto, secao: c.b + " × " + c.h, ops: [op] }; }
        return;
      }
      itens.forEach(function (it) { if (!it.p.sugestao && it.p.motivo.indexOf("apoio maior") < 0) it.p.motivo += " — girar ou aumentar o pilar " + marca + " não fechou: o engenheiro concebe outra solução (apoio maior)"; });
    }
    function passoAltura(d) {
      return function () {
        if (parar || !Object.keys(pend).length) return;
        var alvo = {}, ajustes = [];
        caixas.forEach(function (c) {
          if (!c || !pend[String(c.id)]) return;
          var h0 = num(c.altura, 0), b0 = num(c.espessura, 0.15);
          alvo[String(c.id)] = { b: b0, h: h0 + d / 100 }; ajustes.push(opSecao(c.id, b0, h0 + d / 100));
        });
        /* o editor refaz a peça (altura, cy, volume) pelo replay das ops: ajustar a caixa na mão não regenera a geometria */
        var est2 = null; try { est2 = BE.aplicar(clone(arr(opc.ops).concat(ajustes)), opc.niveis ? { niveis: opc.niveis } : undefined); } catch (eA) { est2 = null; }
        if (!est2) { parar = true; return; }
        var t2 = vigasDe(est2, fck, p12, caa, AN, VG);
        if (!t2.ok && !t2.dv) return;
        Object.keys(pend).forEach(function (id) {
          var v2 = t2.porPeca && t2.porPeca[id];
          if (v2 && v2.atende) {
            var a = alvo[id];
            pend[id].sugestao = { texto: "aumentar a altura para " + cm(a.h) + " cm (seção " + cm(a.b) + " × " + cm(a.h) + ", o topo fica; conferida de novo no pórtico)", secao: cm(a.b) + " × " + cm(a.h), ops: [opSecao(id, a.b, a.h)] };
            delete pend[id];
          }
        });
      };
    }
    function passoLaje(l) {
      var cx = porId[String(l.id)], ent = entradaLaje(l, an, fck, caa), p = { id: String(l.id), marca: l.marca || (cx && cx.marca) || "", tipo: "laje", aproveitamento: null, secao: "h " + Math.round(num(l.h, 0) * 100) };
      if (!ent.ok) { p.estado = "sem-calculo"; p.motivo = ent.motivo; pecas.push(p); return; }
      if (ent.aviso && avisos.indexOf(ent.aviso) < 0) avisos.push(ent.aviso);
      var r = null; try { r = LJ.dimensionarLaje(ent.e, { agregado: "granito" }); } catch (e) { r = { ok: false, motivo: String((e && e.message) || e) }; }
      if (!r || !r.ok) { p.estado = "sem-calculo"; p.motivo = (r && r.motivo) || "o motor da laje não fechou"; pecas.push(p); return; }
      p.aproveitamento = r.aproveitamento; p.estado = r.atende ? "ok" : "falha";
      if (!r.atende) p.motivo = arr(r.avisos)[0] || "reprovada (flexão, cortante, flecha ou fissuração)";
      pecas.push(p);
    }
    function fechar() {
      var pintura = {}, resumo = { ok: 0, falha: 0, foraNorma: 0, semCalculo: 0, total: pecas.length };
      pecas.forEach(function (p) {
        if (p.estado === "ok") resumo.ok++; else if (p.estado === "falha") resumo.falha++; else if (p.estado === "fora-norma") resumo.foraNorma++; else resumo.semCalculo++;
        if (COR[p.estado]) pintura["edit:" + p.id] = COR[p.estado];
      });
      arr(dp.pendencias).concat(arr(base.dv && base.dv.pendencias)).forEach(function (x) { if (pendencias.indexOf(x) < 0) pendencias.push(x); });
      var rot = (VG && base.dv && base.dv.rotulo) || (dp && dp.rotulo) || "Cálculo de apoio";
      T.resultado = { ok: true, rotulo: rot, fck: fck, caa: caa, permitirPilar12: p12, pecas: pecas, pintura: pintura, resumo: resumo, avisos: avisos, pendencias: pendencias, memorialPilar12: dp.memorialPilar12 || null,
        gammaZ: arr(an.gammaZ), tempoMs: an.tempoMs };
    }

    T.restantes = function () { return fila.length; };
    /* um passo; devolve T (T.feito quando acabou; T.rotulo = o passo que acabou de rodar) */
    T.passo = function () {
      if (T.feito) return T;
      var s = fila.shift();
      if (s) { T.rotulo = s.rot; try { s.fn(); } catch (e) { falhar({ ok: false, motivo: "O cálculo parou no passo “" + s.rot + "”: " + String((e && e.message) || e) }); } T.feitos++; }
      if (!fila.length) T.feito = true;
      return T;
    };
    return T;
  }

  function rodar(estado, opc) {
    var t = iniciar(estado, opc);
    while (!t.feito) t.passo();
    return t.resultado;
  }

  var ConcCalcular = { VERSAO: 1, COR: COR, ROTULO_ESTADO: ROTULO_ESTADO, rodar: rodar, iniciar: iniciar, entradaLaje: entradaLaje, apoiosDeModelo: apoiosDeModelo };
  global.ConcCalcular = ConcCalcular;
  if (typeof module !== "undefined" && module.exports) module.exports = ConcCalcular;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
