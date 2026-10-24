/* =====================================================================
 * elecircauditor.js — AUDITOR DOS CIRCUITOS ELÉTRICOS (frente E2, 21/10/2026). Motor PURO, ES5, Node-testável.
 *
 * Confere o PROJETO GRAVADO no quadro (parâmetro Projeto_eletrico da família ra-quadro-distribuicao — o que o "Circuitos e quadro"
 * gravou ou o que o usuário mudou à mão: Circuito do ponto, seção, disjuntor, DR) contra a NBR 5410:2004 (cópia NÃO licenciada à
 * RA, sem a Errata 1/2008 — só valores com o item, js/eletabelas.js), SEM confiar no lançador: a corrente, o agrupamento, a queda e
 * a ocupação são refeitos pelas rotas reais dos eletrodutos do modelo. Regra do dono (problema sempre com solução): cada achado no
 * formato do js/problemacard.js — o que é, "Corrigir: …" (ops prontas, um lote com Ctrl+Z) e "Mostrar no 3D" (as peças).
 *
 *   EleCircAuditor.auditar({ estado, avaliarFam, criterios }) → { problemas[], porCodigo{}, analise, aviso, norma }
 *
 * CÓDIGOS (gravidade · nível):
 *   ELE_CIRC_SEM_PROJETO   erro  · C  há pontos e nenhum quadro/projeto de circuitos
 *   ELE_CIRC_SEM_CIRCUITO  erro  · C  ponto fora de qualquer circuito do projeto
 *   ELE_CIRC_MISTURA       erro  · N  iluminação e tomada no mesmo circuito (4.2.5.5; o motor não usa a exceção da 9.5.3.3)
 *   ELE_CIRC_COZINHA       erro  · N  tomada de cozinha/copa/serviço em circuito com outro ambiente ou outra função (9.5.3.2)
 *   ELE_CIRC_TUE           erro  · N  aparelho > 10 A sem circuito independente (9.5.3.1)
 *   ELE_CIRC_SOBRECARGA    erro  · N  IB > In ou In > Iz corrigida (5.3.4.1 a) com a seção e o disjuntor GRAVADOS
 *   ELE_CIRC_SECAO_MINIMA  erro  · N  seção abaixo da Tabela 47 (1,5 mm² iluminação; 2,5 mm² força)
 *   ELE_CIRC_QUEDA         erro  · N  queda de tensão acima de 4 % no terminal ou 5 % com o alimentador (6.2.7)
 *   ELE_CIRC_LIMITE        aviso · C  circuito acima do critério RA (IB/pontos)
 *   ELE_CIRC_DR_FALTA      erro  · N  circuito que a 5.1.3.2.2 manda proteger por DR 30 mA sem DR
 *   ELE_CIRC_DR_SOBRECARGA erro  · C  DR gravado menor que a soma dos disjuntores a jusante (limitada ao geral) — 6.3.6.2.2 (integração n23)
 *   ELE_CIRC_DPS_FALTA     erro  · N  sem DPS no quadro com linha aérea em AQ2 (5.4.2.1.1 a — AQ2 é critério RA, conferir)
 *   ELE_CIRC_220_1F        erro  · A  aparelho em 220 V num fornecimento de uma fase (CEMIG ND-5.1 4.5.1.1)
 *   ELE_CIRC_GERAL         erro  · N  disjuntor geral sem corrente/acima do da entrada, ou alimentador sem seção (5.3.4.1, 6.2.7)
 *   ELE_ELETRODUTO_LOTADO  erro  · A  condutores demais para o DN do eletroduto (6.2.11.1.6 a, pelo fabricante)
 *   ELE_ELETRODUTO_LONGO   aviso · N  eletroduto contínuo acima de 15 m sem caixa (6.2.11.1.6 b)
 *   ELE_PONTO_SEM_ROTA     aviso · C  ponto sem eletroduto até o quadro (comprimento e agrupamento estimados)
 *   ELE_QUADRO_LOCAL       aviso · C  quadro em banheiro, área de serviço, varanda ou área externa
 *   ELE_QUADRO_ESPACO      aviso · N  quadro sem espaço para os dispositivos e a reserva da Tabela 59 (6.5.4.7)
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function TB() { return dep("EleTabelas", "./eletabelas.js"); }
  function EC() { return dep("EleCircuitos", "./elecircuitos.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return v != null && v !== "" && isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  /* o estado com ops por cima (para refazer o lançador depois de uma correção parcial) */
  function aplicarOps(estado, ops) {
    var e = copia(estado), EC0 = EC();
    var famPor = {}; arr(e.familias).forEach(function (f) { famPor[String(f.id)] = f; });
    var resto = [];
    ops.forEach(function (o) {
      if (o.op === "instancia" && famPor[String(o.id)]) { var f = famPor[String(o.id)]; f.inst = f.inst || {}; Object.keys(o.inst || {}).forEach(function (k) { if (o.inst[k] === "" || o.inst[k] == null) delete f.inst[k]; else f.inst[k] = copia(o.inst[k]); }); }
      else if (o.op === "instAlterar") { arr(e.instalacoes && e.instalacoes.trechos).forEach(function (t) { if (String(t.id) === String(o.id)) Object.keys(o).forEach(function (k) { if (k !== "op" && k !== "id") t[k] = o[k]; }); }); }
      else resto.push(o);
    });
    return resto.length ? EC0._baseMaisOps(e, resto) : e;
  }

  function auditar(o) {
    o = o || {};
    var T = TB(), E = EC(), est = o.estado, aval = o.avaliarFam, probs = [];
    function p(cod, grav, nivel, titulo, texto, pecas, solucoes) {
      probs.push({ tipo: cod, codigo: cod, gravidade: grav, nivel: nivel, nivelRotulo: rotNivel(nivel), titulo: titulo, texto: texto, pecas: arr(pecas).filter(function (x) { return x != null; }).map(String), solucoes: arr(solucoes) });
    }
    function rotNivel(n) { var R = dep("EleRegras", "./eleregras.js"); return R ? R.rotuloNivel(n) : n; }
    var A = E.analisar({ estado: est, avaliarFam: aval, criterios: o.criterios });
    if (!A.ok) return { problemas: [], porCodigo: {}, analise: A, aviso: A.motivo, norma: T.NORMA };
    var C = A.criterios, qd = A.quadro, G = A.projetoGravado;
    /* a solução que refaz o lançador (o que atende fica; o que não atende é redimensionado — idempotente) */
    var cacheRel = null;   /* o "refazer" do estado atual é o mesmo para todo achado: calcula uma vez */
    function relancar(estX) {
      if (!estX && cacheRel) return JSON.parse(JSON.stringify(cacheRel));
      var r = E.lancar({ estado: estX || est, avaliarFam: aval, criterios: o.criterios, loteId: "corr" }), ops = r.ok ? r.ops : [];
      if (!estX) cacheRel = JSON.parse(JSON.stringify(ops));
      return ops;
    }
    function solRelancar(texto) { return { id: "relancar", texto: texto || "Refazer circuitos, quadro e eletrodutos (o que atende fica)", ops: relancar() }; }
    /* dividir de novo: tira o circuito do projeto e o parâmetro Circuito dos pontos dele, e refaz */
    function solRedividir(c) {
      var ops = [];
      /* na luminária o circuito mora em Circuito_quadro (o `Circuito` dela é o legado do render — contrato da iluminação) */
      c.pontos.forEach(function (id) { var pt = A.existe[id]; if (!pt || !pt.familia) return; var ins = {}; ins[E.campoCircuito ? E.campoCircuito(pt.kind) : "Circuito"] = ""; ops.push({ op: "instancia", id: id, inst: ins }); });
      if (qd && qd.existente && G) { var g2 = copia(G); g2.circuitos = arr(g2.circuitos).filter(function (x) { return x.id !== c.id; }); ops.push({ op: "instancia", id: qd.id, inst: { Projeto_eletrico: JSON.stringify(g2) } }); }
      var st2 = aplicarOps(est, ops), mais = relancar(st2);
      return { id: "redividir", texto: "Dividir de novo os pontos do " + c.id + " pelas regras (luz × tomada, cozinha/serviço, aparelho > 10 A, limite RA)", ops: ops.concat(mais) };
    }
    var pontosIds = A.pontos.filter(function (q) { return q.kind !== "interruptor"; }).map(function (q) { return q.id; });
    if (!qd || !qd.existente || !G) {
      p("ELE_CIRC_SEM_PROJETO", "erro", "C", "Pontos elétricos sem circuitos nem quadro", "Há " + A.pontos.length + " pontos elétricos e nenhum quadro com o projeto dos circuitos: o modelo fica sem disjuntor, cabo, DR e DPS no orçamento.", pontosIds.slice(0, 20),
        [solRelancar("Lançar circuitos, quadro e eletrodutos")]);
      return fim();
    }
    var noProjeto = {}; arr(G.circuitos).forEach(function (g) { arr(g.pontos).forEach(function (id) { noProjeto[id] = g.id; }); });
    var semCirc = A.pontos.filter(function (q) { return !noProjeto[q.id] && !q.circManual; });
    if (semCirc.length) p("ELE_CIRC_SEM_CIRCUITO", "erro", "C", semCirc.length + " ponto(s) fora dos circuitos do quadro", "Pontos lançados depois dos circuitos (ou apagados do projeto): sem circuito, ficam sem disjuntor e sem cabo no orçamento.", semCirc.map(function (q) { return q.id; }),
      [solRelancar("Pôr os pontos novos nos circuitos (e traçar os eletrodutos deles)")]);
    /* ---------- por circuito (o GRAVADO) */
    var fT = T.fatorTemperatura(C.tempAmbiente.valor);
    A.circuitos.forEach(function (c) {
      var g = c.guardado, ps = c.pontos.map(function (id) { return A.existe[id]; }).filter(Boolean), rot = c.id + " (" + c.nome + ")";
      var ids = c.pontos.slice().concat(qd ? [qd.id] : []);
      var temLuz = ps.some(function (q) { return q.kind === "luz"; }), temTom = ps.some(function (q) { return q.kind === "tug" || q.kind === "tue"; });
      if (temLuz && temTom) p("ELE_CIRC_MISTURA", "erro", "N", rot + ": luz e tomada no mesmo circuito", "Circuitos terminais distintos para pontos de iluminação e de tomada — " + T.n5410("4.2.5.5") + " (o projeto RA não usa a exceção da 9.5.3.3).", ids, [solRedividir(c)]);
      var coz = ps.filter(function (q) { return q.kind === "tug" && q.grupo === "cozinha_servico"; });
      if (coz.length && ps.some(function (q) { return q.kind !== "interruptor" && !(q.kind === "tug" && q.grupo === "cozinha_servico"); }))
        p("ELE_CIRC_COZINHA", "erro", "N", rot + ": tomada de cozinha/serviço junto de outra carga", "As tomadas de cozinhas, copas, áreas de serviço e lavanderias ficam em circuitos só delas — " + T.n5410("9.5.3.2") + ".", ids, [solRedividir(c)]);
      var tue = ps.filter(function (q) { return q.kind === "tue" && q.va / (q.tensao || C.tensaoFN.valor) > 10 + 1e-9; });
      if (tue.length && ps.length > 1) p("ELE_CIRC_TUE", "erro", "N", rot + ": aparelho acima de 10 A sem circuito independente", tue.map(function (q) { return q.aparelhoNome; }).join(", ") + ": todo ponto de equipamento com corrente nominal acima de 10 A constitui circuito independente — " + T.n5410("9.5.3.1") + ".", ids, [solRedividir(c)]);
      /* revisão 21/10/2026: o aparelho de 220 V posto à mão num circuito de tomadas de 127 V (ou o inverso) passava calado quando
         tinha até 10 A — o circuito era calculado e ligado na tensão errada */
      var tErr = ps.filter(function (q) { return q.kind === "tue" && Math.abs(num(q.tensao, C.tensaoFN.valor) - num(c.tensao, C.tensaoFN.valor)) > 1; });
      if (tErr.length) p("ELE_CIRC_TUE", "erro", "N", rot + ": aparelho em " + tErr[0].tensao + " V num circuito de " + c.tensao + " V", tErr.map(function (q) { return q.aparelhoNome + " (" + q.tensao + " V)"; }).join(", ") + ": o aparelho fica num circuito independente na tensão dele (2 fases para 220 V; o dispositivo secciona todas as fases — " + T.n5410("9.5.3.1 e 9.5.4") + ").", ids, [solRedividir(c)]);
      if (!c.fases) p("ELE_CIRC_220_1F", "erro", "A", rot + ": 220 V num fornecimento de uma fase", "O fornecimento tipo A da CEMIG é fase-neutro em 127 V (ND-5.1 4.5.1.1): aparelho em 220 V pede o tipo B (2 fases).", ids, [solRelancar("Refazer com o fornecimento de 2 fases")]);
      var lim = c.tipo === "luz" ? C.luzIbMax.valor : (c.tipo === "tug" ? C.tugIbMax.valor : null);
      if (lim != null && c.dim.ib > lim + 1e-9) p("ELE_CIRC_LIMITE", "aviso", "C", rot + ": " + f2(c.dim.ib) + " A (critério RA: até " + f2(lim) + " A)", "Acima do limite de projeto RA para o circuito (" + (c.tipo === "luz" ? C.luzIbMax.fonte : C.tugIbMax.fonte) + ").", ids, [solRedividir(c)]);
      /* revisão 21/10/2026: o limite de PONTOS do critério RA (8) não era conferido — o circuito montado à mão com 12 tomadas passava */
      var nPt = c.tipo === "luz" ? ps.filter(function (q) { return q.kind === "luz"; }).length : (c.tipo === "tug" ? ps.filter(function (q) { return q.kind !== "interruptor"; }).length : 0);
      var limPt = c.tipo === "luz" ? C.luzPontosMax : (c.tipo === "tug" ? C.tugPontosMax : null);
      if (limPt && nPt > limPt.valor + 1e-9) p("ELE_CIRC_LIMITE", "aviso", "C", rot + ": " + nPt + " pontos (critério RA: até " + limPt.valor + ")", "Acima do número de pontos do critério RA para o circuito (" + limPt.fonte + ").", ids, [solRedividir(c)]);
      if (!g) return;
      var S = num(g.secao, null), In = num(g.disjuntor, null), secMin = c.tipo === "luz" ? T.T47.iluminacao : T.T47.forca;
      if (S != null && S < secMin - 1e-9) p("ELE_CIRC_SECAO_MINIMA", "erro", "N", rot + ": condutor de " + String(S).replace(".", ",") + " mm² abaixo do mínimo", "Seção mínima de cobre para circuito de " + (c.tipo === "luz" ? "iluminação: 1,5 mm²" : "força (tomadas): 2,5 mm²") + " — " + T.n5410(T.T47.item) + ".", ids, [solRelancar("Redimensionar o " + c.id)]);
      if (S != null && In != null) {
        var iz0 = T.iz(c.dim.metodo.ref, 2, S), fa = T.fatorAgrupamento(c.dim.nAgrup), izc = iz0 != null ? iz0 * fT * fa : null;
        if (c.dim.ib > In + 1e-9 || (izc != null && In > izc + 1e-9))
          p("ELE_CIRC_SOBRECARGA", "erro", "N", rot + ": " + (c.dim.ib > In + 1e-9 ? "corrente de projeto " + f2(c.dim.ib) + " A acima do disjuntor de " + In + " A" : "disjuntor de " + In + " A acima da capacidade do condutor (" + f2(izc) + " A)"),
            "Coordenação IB ≤ In ≤ Iz — " + T.n5410(T.COORD.item) + "; Iz = " + iz0 + " A (Tabela 36, método " + c.dim.metodo.ref + ", 2 condutores carregados) × " + fT + " (Tabela 40) × " + fa + " (Tabela 42, " + c.dim.nAgrup + " circuito(s) no eletroduto mais cheio).", ids,
            [solRelancar("Redimensionar o " + c.id + " (seção e disjuntor)"), solRedividir(c)]);
        var r = T.r70(S), dv = r != null ? 200 * (r / 1000) * c.dim.L * c.dim.ib / c.tensao : null, limQ = c.dim.limiteQueda;
        if (dv != null && dv > limQ + 1e-9) p("ELE_CIRC_QUEDA", "erro", "N", rot + ": queda de tensão de " + f2(dv) + " % (limite " + f2(limQ) + " %)", "No máximo 4 % no circuito terminal e 5 % do ponto de entrega com o alimentador — " + T.n5410(T.QUEDA.item) + "; " + f2(c.dim.L) + " m até o ponto mais longe" + (c.dim.estimado ? " (ESTIMADO: falta eletroduto)" : "") + ", cobre a 70 °C (" + T.RESISTENCIA.fonte + ").", ids,
          [solRelancar("Aumentar a seção do " + c.id), solRedividir(c)]);
      }
      if (c.dr.length && !g.dr) p("ELE_CIRC_DR_FALTA", "erro", "N", rot + ": sem DR de 30 mA", "Proteção adicional por DR de alta sensibilidade (≤ 30 mA) obrigatória — " + T.n5410(T.DR.item + " " + c.dr.map(function (k) { return k + ")"; }).join(", ")) + ": " + c.dr.map(function (k) { return T.DR.casos[k]; }).join("; ") + ".", ids, [solRelancar("Pôr o " + c.id + " sob um DR de 30 mA")]);
      if (c.semRota.length) p("ELE_PONTO_SEM_ROTA", "aviso", "C", rot + ": " + c.semRota.length + " ponto(s) sem eletroduto até o quadro", "Sem o eletroduto, o comprimento (queda de tensão), o agrupamento e o cabo do orçamento saem ESTIMADOS (em L pelo teto).", c.semRota.concat(qd ? [qd.id] : []), [solRelancar("Traçar os eletrodutos que faltam")]);
    });
    /* ---------- DR sem proteção de sobrecarga (integração n23): o DR GRAVADO menor que a soma dos disjuntores a jusante (limitada ao
       geral) pode aquecer além do nominal sem que nada desarme — 6.3.6.2.2 a); critério RA conservador */
    var inGer = A.geral && A.geral.In, disjDe = {}; arr(G.circuitos).forEach(function (x) { disjDe[x.id] = Number(x.disjuntor) || 0; });
    arr(G.drs).forEach(function (g) {
      var soma = arr(g.circuitos).reduce(function (s, id) { return s + (disjDe[id] || 0); }, 0), req = inGer != null ? Math.min(soma, inGer) : soma;
      if (Number(g.In) + 1e-9 < req) p("ELE_CIRC_DR_SOBRECARGA", "erro", "C", g.id + ": DR de " + g.In + " A atrás de " + soma + " A de disjuntores", "O interruptor DR não se protege contra sobrecarga: a corrente nominal dele deve cobrir a soma dos disjuntores a jusante (" + soma + " A" + (inGer != null && inGer < soma ? ", limitada ao geral de " + inGer + " A" : "") + ") — " + T.n5410("6.3.6.2.2 a)") + " (critério RA conservador). Sem DR em série no quadro, a seletividade entre DR (6.3.6.3) não se aplica; um DR geral a montante precisaria de IΔn de pelo menos 3 × 30 mA e de não atuar antes do de 30 mA — o tipo S é a forma usual (6.3.6.3.2 e a NOTA).",
        [qd.id].concat(arr(g.circuitos).reduce(function (acc, id) { var c0 = A.circuitos.filter(function (x) { return x.id === id; })[0]; return acc.concat(c0 ? c0.pontos : []); }, [])), [solRelancar("Refazer o quadro: DR de " + (TB_drAcima(req) || "?") + " A ou dividir o grupo")]);
    });
    function TB_drAcima(r0) { var Ls = T.DR_A; for (var i = 0; i < Ls.length; i++) if (Ls[i] >= r0 - 1e-9) return Ls[i]; return null; }
    /* ---------- DPS */
    if (A.dps.exigido && !G.dps) p("ELE_CIRC_DPS_FALTA", "erro", "N", "Quadro sem DPS", "Com a linha da distribuidora aérea em região AQ2 a proteção contra sobretensões é obrigatória — " + T.n5410(T.DPS.item) + " (" + C.dpsAQ2.fonte + ").", [qd.id], [solRelancar("Pôr os DPS no quadro")]);
    /* ---------- geral e alimentador (revisão 21/10/2026: antes o geral > 63 A e o alimentador > 16 mm² saíam sem disjuntor e sem
       cabo, e o auditor ficava em silêncio) */
    var ent = A.demanda && A.demanda.entrada, gIn = A.geral && A.geral.In, alS = A.alimentador && A.alimentador.secao;
    var gTxt = [];
    if (gIn == null) gTxt.push("disjuntor geral sem corrente nominal (" + f2(A.geral.ib) + " A por fase passa de 250 A)");
    else if (ent && gIn > ent.disjuntor_A) gTxt.push("disjuntor geral de " + gIn + " A acima do disjuntor da entrada CEMIG (" + ent.disjuntor_A + " A, " + ent.tabela + " faixa " + ent.faixa + ")");
    if (gIn != null && alS == null) gTxt.push("alimentador sem seção: nenhuma até 95 mm² atende " + gIn + " A e a queda de " + f2(C.quedaAlimentadorMax.valor) + " % em " + f2(A.alimentador.comprimento) + " m");
    if (gTxt.length) p("ELE_CIRC_GERAL", "erro", "N", "Quadro: " + gTxt.join("; "), "O disjuntor geral protege o alimentador (IB ≤ In ≤ Iz — " + T.n5410(T.COORD.item) + ", queda pela " + T.n5410(T.QUEDA.item) + ") e não passa do disjuntor do padrão de entrada (critério RA, seletividade).", [qd.id],
      [{ id: "nota-geral", texto: "Confira a distância real do medidor ao quadro em Critérios dos circuitos (o alimentador de " + f2(A.alimentador.comprimento) + " m é " + (A.alimentador.provisorio ? "PROVISÓRIO" : "o informado") + "), ponha o quadro mais perto do medidor ou reveja o tipo de fornecimento; depois rode Circuitos e quadro de novo." }]);
    /* ---------- eletrodutos */
    Object.keys(A.eletrodutos).forEach(function (t) {
      var e = A.eletrodutos[t]; if (!e.lotado) return;
      var sols = [];
      if (e.dnMinimo != null) sols.push({ id: "dn", texto: "Trocar o eletroduto " + t + " para DN " + e.dnMinimo, ops: [{ op: "instAlterar", id: t, dn: e.dnMinimo }] });
      else {
        /* outro eletroduto ao lado, com metade dos circuitos (o projeto grava a divisão) */
        var tr = A.grafo.trechos[t], meio = Math.ceil(e.circuitos.length / 2), dup = { op: "trecho", id: t + "-b", sistema: "eletrica", material: tr.material, dn: 32, p1: copia(tr.p1), p2: copia(tr.p2), aplicacao: tr.aplicacao };
        var dx = num(tr.p2.x, 0) - num(tr.p1.x, 0), dz = num(tr.p2.z, 0) - num(tr.p1.z, 0), l = Math.sqrt(dx * dx + dz * dz) || 1, nx = -dz / l * 0.04, nz = dx / l * 0.04;
        if (l < 0.05) { nx = 0.04; nz = 0; }
        dup.p1.x += nx; dup.p1.z += nz; dup.p2.x += nx; dup.p2.z += nz;
        var g2 = copia(G); g2.eletrodutos = g2.eletrodutos || {}; g2.eletrodutos[t] = e.circuitos.slice(0, meio); g2.eletrodutos[t + "-b"] = e.circuitos.slice(meio);
        sols.push({ id: "paralelo", texto: "Passar um eletroduto DN 32 ao lado (" + t + "-b) com " + (e.circuitos.length - meio) + " dos " + e.circuitos.length + " circuitos — confira as pontas nas caixas", ops: [dup, { op: "instAlterar", id: t, dn: 32 }, { op: "instancia", id: qd.id, inst: { Projeto_eletrico: JSON.stringify(g2) } }] });
      }
      p("ELE_ELETRODUTO_LOTADO", "erro", "A", "Eletroduto " + t + " lotado: " + e.condutores + " condutores em DN " + e.dn, "Pela ficha do fabricante (" + T.OCUPACAO.fonte + "), " + e.condutores + " condutores de " + String(e.secaoMaior).replace(".", ",") + " mm² pedem " + (e.dnMinimo ? "DN " + e.dnMinimo : "mais que um DN 32") + " — taxa de ocupação da " + T.n5410("6.2.11.1.6 a)") + " (40 % para 3 ou mais condutores). Circuitos: " + e.circuitos.join(", ") + ".", [t], sols);
    });
    arr(A.grafo && A.grafo.trechos ? Object.keys(A.grafo.trechos) : []).forEach(function (t) {
      var tr = A.grafo.trechos[t], L = num(tr.comprimento, null); if (L == null) return;
      if (L > T.ELETRODUTO.trechoInterno_m + 1e-6) {
        var m = { x: (num(tr.p1.x, 0) + num(tr.p2.x, 0)) / 2, y: (num(tr.p1.y, 0) + num(tr.p2.y, 0)) / 2, z: (num(tr.p1.z, 0) + num(tr.p2.z, 0)) / 2 };
        p("ELE_ELETRODUTO_LONGO", "aviso", "N", "Eletroduto " + t + " com " + f2(L) + " m sem caixa", "Trecho contínuo sem caixa até 15 m (interno), menos 3 m por curva — " + T.n5410("6.2.11.1.6 b)") + ".", [t],
          [{ id: "caixa", texto: "Partir o eletroduto ao meio com uma caixa de passagem", ops: [{ op: "apagar", id: t }, { op: "trecho", id: t + "-1", sistema: "eletrica", material: tr.material, dn: tr.dn, p1: copia(tr.p1), p2: m, aplicacao: tr.aplicacao }, { op: "trecho", id: t + "-2", sistema: "eletrica", material: tr.material, dn: tr.dn, p1: copia(m), p2: copia(tr.p2), aplicacao: tr.aplicacao },
            { op: "peca", id: "elecp-" + t, peca: tr.aplicacao === "parede" ? "caixa_4x4" : "caixa_octogonal", sistema: "eletrica", material: "pvc", x: m.x, y: m.y, z: m.z, rotY: 0 }] }]);
      }
    });
    /* ---------- quadro */
    var ambQ = A.leitura.ambDe ? A.leitura.ambDe([qd.p[0] + qd.dir[0] * 0.3, qd.p[2] + qd.dir[1] * 0.3], 0) : null, aQ = A.leitura.ambientes.filter(function (a) { return a.id === ambQ; })[0];
    if (aQ && (aQ.cls.grupo === "banheiro" || aQ.tipo.id === "area_servico" || aQ.cls.grupo === "externa" || aQ.cls.grupo === "varanda"))
      p("ELE_QUADRO_LOCAL", "aviso", "C", "Quadro em \"" + aQ.nome + "\"", "O quadro fica em local de fácil acesso (" + T.n5410("6.5.4.8") + ") e, pelo critério RA, fora de área molhada, sujeita a lavagem ou externa.", [qd.id],
        [{ id: "nota-mover", texto: "Arraste o quadro para a circulação ou a sala e rode \"Circuitos e quadro\" de novo (os eletrodutos novos saem do lugar novo)." }]);
    var esp = num(qd.f && qd.f.inst && qd.f.inst.$tipo && qd.f.inst.$tipo.Disjuntores, null);
    if (esp != null && A.modulos > esp) p("ELE_QUADRO_ESPACO", "aviso", "N", "Quadro com " + esp + " espaços para " + A.modulos + " módulos", "Disjuntores, DR, DPS, geral e a reserva para ampliação (" + A.reserva + " — " + T.n5410(T.T59.item) + ") não cabem no quadro.", [qd.id],
      [A.quadroModelo ? { id: "quadro", texto: "Trocar o quadro pelo de " + A.quadroModelo.espacos + " espaços", ops: [{ op: "instancia", id: qd.id, inst: { $tipo: { Material_quadro: A.quadroModelo.material, Instalacao: A.quadroModelo.instalacao, Disjuntores: A.quadroModelo.espacos, Corrente: A.quadroModelo.corrente, Largura: 0.40, Altura: 0.50, Profundidade: 0.12 } } }] } : { id: "nota-quadro", texto: "Divida a instalação em dois quadros." }]);
    return fim();
    function fim() {
      probs.forEach(function (q) { q.solucoes.forEach(function (s) { if (s.ops && !s.ops.length) { delete s.ops; s.id = "nota-" + s.id; s.texto = "Nada a refazer automaticamente: ajuste à mão e rode o auditor de novo."; } }); });
      var porCod = {}; probs.forEach(function (q) { porCod[q.codigo] = (porCod[q.codigo] || 0) + 1; });
      return { problemas: probs, porCodigo: porCod, analise: A, norma: T.NORMA, aviso: T.NORMA.ressalva };
    }
  }

  var EleCircAuditor = { auditar: auditar, aplicarOps: aplicarOps };
  global.EleCircAuditor = EleCircAuditor;
  if (typeof module !== "undefined" && module.exports) module.exports = EleCircAuditor;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
