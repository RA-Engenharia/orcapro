/* =====================================================================
 * acodimlivre.js — O CÁLCULO DA ESTRUTURA DE AÇO DESENHADA (motor PURO,
 * ES5, sem DOM, Node-testável). 13/10/2026.
 *
 * O mesmo caminho do galpão (js/acodimensionar.js), para QUALQUER estrutura
 * que o engenheiro desenhou com as ferramentas da Metálica:
 *   1. lê as peças e monta o modelo (js/acomodelolivre.js) — sem perfil do
 *      catálogo, peça solta, conjunto sem apoio ou MECANISMO: para e diz o
 *      que fazer (soluções), nunca calcula com número chutado;
 *   2. ações (peso próprio + revestimentos + sobrecarga da NBR 6120 por
 *      área, distribuída às vigas por faixas; cargas pontuais; vento da NBR
 *      6123 quando a estrutura é fechada/coberta) e combinações da NBR 8681
 *      (js/acocargas.js, as mesmas do galpão);
 *   3. análise de 1ª e 2ª ordem (js/acoanalise.js) → deslocabilidade
 *      (Δ2/Δ1, NBR 8800:2024 4.10: 1,13 / 1,55); média → rigidez a 80 %;
 *   4. verificação de TODAS as barras: laminadas/soldadas/tubos/barras pela
 *      NBR 8800 (js/acodim8800.js), formados a frio pela NBR 14762
 *      (js/acodim14762.js, método da resistência direta);
 *   5. deslocamentos (NBR 8800, Anexo C, Tabela C.1 — os limites já
 *      transcritos no docs/metalica/gabarito-normas.md, seção 12): vigas de
 *      piso L/350, de cobertura L/250, que suportam pilar L/500, terças
 *      L/180, balanço L = 2 × o comprimento; topo dos pilares H/300 (um
 *      pavimento) ou h/500 entre pisos — combinações raras;
 *   6. reações (cargas na fundação por caso e envoltória), peso, flambagem
 *      global (λcr);
 *   7. OTIMIZAÇÃO opcional por GRUPO de peças iguais (mesmo papel e mesmo
 *      perfil): o perfil mais leve da família que passa, refazendo a análise
 *      (rigidez e peso mudam) — volta atrás no que falhar.
 * Saída: o formato do galpão (docs/metalica/CONTRATO.md) — a vista 3D
 * (js/metalcalcvista.js) e a exportação CYPE (js/acocype.js) leem igual —
 * mais `tipo: "livre"`, `pecas` (de → para de cada peça) e o que NÃO foi
 * verificado em `naoAbrangidos`.
 *   AcoDimLivre.calcular(entrada, op) → r
 *   AcoDimLivre.opsAplicar(r, caixas, novoId) → op "lote" (um Ctrl+Z) que
 *     troca o perfil das peças NO LUGAR (op metalAjustar — nunca cópia)
 * Teste: node tools/test-aco-livre.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function ML() { return dep("AcoModeloLivre", "./acomodelolivre.js"); }
  function Car() { return dep("AcoCargas", "./acocargas.js"); }
  function Ana() { return dep("AcoAnalise", "./acoanalise.js"); }
  function D8800() { return dep("AcoDim8800", "./acodim8800.js"); }
  function D14762() { return dep("AcoDim14762", "./acodim14762.js"); }
  function Dim() { return dep("AcoDimensionar", "./acodimensionar.js"); }
  function Cat() { return dep("PerfisAco", "./perfisaco.js"); }
  function Mod() { return dep("AcoModelo", "./acomodelo.js"); }
  function Met() { return dep("BimMetal", "./metalpeca.js"); }
  function Cri() { return dep("MetalCriar", "./metalcriar.js"); }
  function Env() { return dep("AcoEnvoltorio", "./acoenvoltorio.js"); }   /* FRENTE S5 (14/10/2026): faces e fechamentos → vento */

  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function br(v, c) { if (v == null || !isFinite(v)) return "—"; c = c == null ? 2 : c; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }

  /* deslocamentos-limite: NBR 8800:2008, Anexo C, Tabela C.1 (docs/metalica/gabarito-normas.md, seção 12: DL-03 a DL-09);
     na 2024 viraram o Anexo B — os destas linhas não mudaram (fonte secundária); conferir no texto oficial */
  var REF_C1 = "NBR 8800:2008, Anexo C, Tabela C.1 (conferir na 2024, Anexo B)";
  var LIMITES = {
    piso: { div: 350, nome: "vigas de piso" }, cobertura: { div: 250, nome: "vigas de cobertura" }, suportaPilar: { div: 500, nome: "vigas que suportam pilares" },
    terca: { div: 180, nome: "terças de cobertura (combinação rara, variáveis no sentido do permanente)" },
    umPav: { div: 300, nome: "edifícios de um pavimento e galpões: deslocamento horizontal do topo dos pilares em relação à base" },
    entrePisos: { div: 500, nome: "edifícios de dois ou mais pavimentos: deslocamento relativo entre dois pisos consecutivos" }
  };

  /* o que este motor NÃO verifica (vai para o memorial, sempre) */
  var NAO_ABRANGIDOS = [
    "Dimensionamento das LIGAÇÕES (parafusos, soldas, chapas de ligação) e das PLACAS DE BASE e chumbadores: o memorial traz os esforços nas pontas das barras e nas bases para o detalhamento; a ligação desenhada no modelo define só a condição de cálculo (rígida/rotulada).",
    "Classificação da rigidez das ligações (NBR 8800, 6.1.2): a ligação considerada rígida ou rotulada é a do modelo; a rigidez real não foi verificada.",
    "VIBRAÇÃO DE PISO (NBR 8800, Anexo L): não verificada — o motor ainda não tem a base (frequência natural e aceleração de pico).",
    "Forças horizontais de guarda-corpo (NBR 6120:2019, Tabela 12) e cargas concentradas isoladas da Tabela 10: só entram se lançadas como carga pontual.",
    "Redução de sobrecarga (NBR 6120:2019, 6.12): não aplicada (a favor da segurança).",
    "Fundações, lajes/steel deck (a placa), escadas, guarda-corpos e a estrutura existente que recebe apoios: responsabilidade de terceiros/projeto próprio.",
    "Efeitos dinâmicos de máquinas, impacto, fadiga, incêndio (NBR 14323) e corrosão: fora do escopo."
  ];

  /* ================================================================ VERIFICAR UMA BARRA */
  function verificarMembro(m, est, elu) {
    var D = D8800(), F = D14762();
    if (m.frio) {
      if (!F) return { ok: false, razao: Infinity, motivo: "NBR 14762 não carregada", verificacoes: [], avisos: ["Motor da NBR 14762 (js/acodim14762.js) não carregado."] };
      var reg = m.reg || {}, sec = { tipo: reg.tipoFrio, bw: reg.bw, bf: reg.bf, D: reg.D, t: reg.t, ri: num(reg.ri, reg.t) };
      var comp = { Lx: m.flambagem.Lx * 1000, Ly: m.flambagem.Ly * 1000, Lt: m.flambagem.Lz * 1000, Cb: 1.0 };
      var pior = null, todos = [];
      var porComb = {}; est.forEach(function (e) { (porComb[e.comb] = porComb[e.comb] || []).push(e); });
      Object.keys(porComb).forEach(function (cid) {
        var es = porComb[cid], cand = {};
        function maxPor(f) { var b = null; es.forEach(function (e) { if (!b || f(e) > f(b)) b = e; }); return b; }
        [maxPor(function (e) { return Math.abs(e.Mz); }), maxPor(function (e) { return -e.N; }), maxPor(function (e) { return e.N; }), maxPor(function (e) { return Math.abs(e.My); }), maxPor(function (e) { return Math.abs(e.Vy); })]
          .forEach(function (e) { if (e) cand[e.x.toFixed(4)] = e; });
        Object.keys(cand).forEach(function (k) {
          var e = cand[k];
          [1, -1].forEach(function (sg) {
            var v = F.verificar(sec, { fy: m.aco.fy, fu: m.aco.fu }, { N: e.N, Mx: e.Mz, My: sg * (e.My || 0), Vx: e.Vz || 0, Vy: e.Vy || 0 }, comp, {});
            /* a esbeltez L/r ≤ 300 da TRAÇÃO (9.6.3) é recomendação para barra tracionada: numa viga/pilar com a tração
               de décimos de kN das forças nocionais ela reprovava viga longa sem motivo — vira aviso (o tirante mantém) */
            if (m.papel !== "tirante" && m.papel !== "contravento") {
              var esb = arr(v.verificacoes).filter(function (q) { return /esbeltez máxima \(recomendação\)/.test(q.nome) && /Tração/.test(q.nome); });
              if (esb.length) {
                v.verificacoes = v.verificacoes.filter(function (q) { return esb.indexOf(q) < 0; });
                v.avisos = arr(v.avisos).concat(esb.filter(function (q) { return q.razao > 1; }).map(function (q) { return "Tração (nocional/pequena): L/r = " + br(q.solicitante, 0) + " > 300 — recomendação da 9.6.3 para barra tracionada, não aplicada a esta " + (m.papel === "pilar" ? "coluna" : "viga"); }));
                v.aproveitamento = 0; v.governante = null; v.verificacoes.forEach(function (q) { if (q.razao > v.aproveitamento) { v.aproveitamento = q.razao; v.governante = q.nome; } });
              }
            }
            var rz = num(v.aproveitamento, Infinity);
            if (!pior || rz > pior.razao) pior = { razao: rz, v: v, comb: cid, x: e.x, N: e.N, Mz: e.Mz, My: sg * (e.My || 0), Vy: e.Vy, Vz: e.Vz };
          });
        });
      });
      if (!pior) return { ok: true, razao: 0, governante: null, verificacoes: [], avisos: ["sem esforços"], edicao: "NBR 14762:2010" };
      var vs = arr(pior.v.verificacoes).map(function (q) { return { nome: q.nome, item: q.item, passos: arr(q.passos), resistencia: q.resistencia, unidade: q.unidade, solicitante: q.solicitante, razao: q.razao, formula: q.formula }; });
      return { ok: pior.razao <= 1 + 1e-9, razao: pior.razao, governante: pior.v.governante, pior: { comb: pior.comb, x: pior.x, N: pior.N, Mz: pior.Mz, My: pior.My, Vy: pior.Vy, Vz: pior.Vz },
               verificacoes: vs, avisos: arr(pior.v.avisos).concat(["Formado a frio pela NBR 14762:2010 (MRD): Cb = 1,0 (a favor da segurança); My testado nos dois sentidos (seção assimétrica)."]), edicao: "NBR 14762:2010", norma: "NBR 14762" };
    }
    return D.verificarBarra({ secao: m.secao.mm, aco: m.aco, estacoes: est, L: m.L, flambagem: m.flambagem, travamentos: m.travamentos, papel: m.papel, cb: m.cb });
  }

  /* ================================================================ LIMITES DE ESBELTEZ (EXIGÊNCIA)
   * Decisão do Rogério (14/10/2026, rodada 2 da simulação): L/r ≤ 200 na barra COMPRIMIDA e ≤ 300 na TRACIONADA são
   * EXIGÊNCIA no OrçaPRO — reprovam a barra e o "perfil mais leve" não pode furá-los. Na NBR 8800:2008 o limite da
   * compressão é obrigatório (5.3.4.1: "não deve ser superior a 200"); na 2024 virou recomendação (5.3.7); o da tração
   * é recomendação nas duas (5.2.8.1), EXCETO tirantes de barra redonda pré-tensionados ou barras montadas com pré-tensão.
   * Achado que motivou: num X de cantoneira o otimizador desceu a L 22 × 3 com KL/r = 1.268 (força de 0,25 kN).
   * ISENTAS: barra redonda e cabo (premissa: tracionados e montados com pré-tensão — esticador).
   * QUANDO a barra é "comprimida"/"tracionada": DIAGONAIS (de perfil) sempre — as duas exigências, porque a força de
   * contraventamento troca de sinal com o sentido da ação (no X do piso do mezanino ela era de centésimos de kN e a
   * cantoneira passava sem a exigência); pilares com qualquer força axial (> 0,1 % de Ag·fy/γa1);
   * vigas e terças só com força axial de pelo menos 5 % de Ag·fy/γa1 — as forças nocionais e numéricas (décimos de kN)
   * não fazem de uma viga uma barra comprimida (critério do sistema, declarado nas decisões). */
  var REF_ESB_C = "NBR 8800:2008, 5.3.4.1 (na 2024, 5.3.7, é recomendação — o OrçaPRO adota como EXIGÊNCIA)";
  var REF_ESB_T = "NBR 8800:2008 e 2024, 5.2.8.1 (recomendação — o OrçaPRO adota como EXIGÊNCIA; barra redonda pré-tensionada isenta)";
  /* REVISÃO M4 C2 (15/10/2026): isenta PELA SEÇÃO (barra redonda e cabo), não pelo papel — o X de CANTONEIRA só à tração
     (papel "tirante") escapava do L/r ≤ 300: L 51 × 51 × 3,2 com 8,5 m (L/r 540 a 850) saía aprovado */
  function isentaEsbeltez(m) { return (m.secao && (m.secao.forma === "circ" || m.secao.forma === "cabo")) || /cabo/i.test(String((m.secao && m.secao.nome) || "")); }
  function esbeltezMembro(m) {
    var s = (m.secao && m.secao.mm) || {}, fl = m.flambagem || {}, A = num(s.A, 0); if (!(A > 0)) return null;
    var rx = num(s.rx, Math.sqrt(num(s.Ix, 0) / A)), ry = num(s.ry, Math.sqrt(num(s.Iy, 0) / A)), Lx = num(fl.Lx, m.L) * 1000, Ly = num(fl.Ly, m.L) * 1000;
    var lam = Math.max(rx > 0 ? Lx / rx : 0, ry > 0 ? Ly / ry : 0), txt = "máx(Lx/rx; Ly/ry) = máx(" + br(Lx, 0) + "/" + br(rx, 1) + "; " + br(Ly, 0) + "/" + br(ry, 1) + ")";
    if (s.forma === "L" && num(s.rz, 0) > 0) { var lz = Math.min(Lx, Ly) / s.rz; if (lz > lam) { lam = lz; txt += "; cantoneira: mín(Lx; Ly)/rz = " + br(Math.min(Lx, Ly), 0) + "/" + br(s.rz, 1); } }
    return { lam: lam, txt: txt };
  }
  function aplicarEsbeltez(v, m, est) {
    if (!v || isentaEsbeltez(m)) return v;
    var e = esbeltezMembro(m); if (!e) return v;
    var s = m.secao.mm, Ny = num(s.A, 0) * num(m.aco && m.aco.fy, 250) / 1.10 / 1000, diag = m.papelLivre === "diagonal", sempre = m.papelLivre === "pilar" || m.papel === "pilar" || m.papel === "tapamento" || diag, lim = (sempre ? 0.001 : 0.05) * Ny;
    var Nc = 0, Nt = 0; arr(est).forEach(function (q) { var N = num(q.N, 0); if (-N > Nc) Nc = -N; if (N > Nt) Nt = N; });
    var vs = arr(v.verificacoes);
    function add(nome, item, limite, N) {
      var q = { nome: nome, item: item, passos: [{ rotulo: "Comprimentos de flambagem (K = 1) e raios de giração", formula: e.txt, valor: br(e.lam, 0) }, { rotulo: "Força axial que faz dela uma barra " + (limite === 200 ? "comprimida" : "tracionada"), formula: diag ? "diagonal de contraventamento: sempre (a força troca de sinal com a ação)" : sempre ? "pilar: qualquer força axial" : "viga/terça: ≥ 5 % de Ag·fy/γa1 = " + br(lim, 1) + " kN", valor: br(N, 2) + " kN" }, { rotulo: "Limite", formula: "L/r ≤ " + limite, valor: e.lam <= limite ? "atende" : "NÃO atende" }],
               resistencia: limite, solicitante: e.lam, unidade: "", razao: e.lam / limite };
      vs.push(q);
      if (q.razao > num(v.razao, 0)) { v.razao = q.razao; v.governante = nome; }
    }
    /* barra SÓ DE TRAÇÃO (sai do modelo quando comprimida): só o L/r ≤ 300, sempre. ESCORA declarada (a do banzo de baixo e a
       da coluna treliçada — REVISÃO M4 alto b): pode comprimir com qualquer força → L/r ≤ 200 sempre, sem o gatilho de 5 % */
    var soTracao = m.papel === "tirante", escora = !!(m.calc && m.calc.escora);
    if (!soTracao && (Nc > lim || diag || escora)) add("Esbeltez da barra comprimida (L/r ≤ 200)", REF_ESB_C, 200, Nc);
    if (Nt > lim || diag || soTracao) add("Esbeltez da barra tracionada (L/r ≤ 300)", REF_ESB_T, 300, Nt);
    v.verificacoes = vs; v.ok = num(v.razao, 0) <= 1 + 1e-9; v.esbeltez = e.lam;
    return v;
  }

  /* ================================================================ UMA RODADA */
  /* cada rodada leva a foto dos perfis com que foi feita (para voltar a ela) */
  function rodada(lido, entrada, op) { var r = rodada0(lido, entrada, op); r._perfis = perfisAtuais(lido); return r; }
  function restaurar(lido, r) { if (!r || !r._perfis) return; lido.pecas.forEach(function (p) { var n = r._perfis[p.id]; if (n && n !== p.cat) trocarPerfil(p, n); }); }
  function rodada0(lido, entrada, op) {
    var M = ML(), C = Car(), A = Ana(), Dm = Dim();
    var ap = entrada.apoios || {}, lg = entrada.ligacoes || {}, cg = entrada.cargas || {};
    var pontos = arr(cg.pontuais); pontos.forEach(function (p) { p.no = null; });
    var G = M.montar(lido, { bases: ap.bases, basePadrao: ap.basePadrao, apoios: ap.extras, ligacoes: lg.pontas, vigaPilar: lg.vigaPilar, vigaViga: lg.vigaViga, pontos: pontos });
    G.membros.forEach(function (m) { var p = lido.pecas.filter(function (x) { return x.id === m.peca; })[0]; if (p) m.reg = p.reg; });
    var base = { ok: false, modelo: G, decisoes: G.decisoes, avisos: G.avisos, tipo: "livre" };
    var est = M.estabilidade(G);
    if (!est.ok) { base.problemas = est.problemas; base.motivo = est.problemas[0].texto; return base; }
    /* REVISÃO C2 (14/10/2026): a ESCADA (pé apoiado no piso) não pode ser o único travamento da estrutura sem ninguém saber —
       a estabilidade é refeita SEM as longarinas: se aí for mecanismo, a escada está travando a estrutura e o cálculo REPROVA
       com o N do pé e do topo para detalhar (achado: mezanino sem o X que trava z saía aprovado só por causa da escada) */
    var escTrava = null, mEsc = G.membros.filter(function (m) { return /pé da escada/.test(String((m.pontas.ini || {}).motivo || "")) || /pé da escada/.test(String((m.pontas.fim || {}).motivo || "")); });
    if (mEsc.length) {
      var ids0 = {}; mEsc.forEach(function (m) { ids0[m.peca] = true; });
      var lido2 = {}; Object.keys(lido).forEach(function (k) { lido2[k] = lido[k]; }); lido2.pecas = lido.pecas.filter(function (q) { return !ids0[q.id]; });
      var G2 = lido2.pecas.length ? M.montar(lido2, { bases: ap.bases, basePadrao: ap.basePadrao, apoios: ap.extras, ligacoes: lg.pontas, vigaPilar: lg.vigaPilar, vigaViga: lg.vigaViga, pontos: [] }) : null;
      var est2 = G2 ? M.estabilidade(G2) : { ok: true };
      if (!est2.ok && arr(est2.problemas).some(function (q) { return q.tipo === "mecanismo" || q.tipo === "sem-apoio"; })) escTrava = { membros: mEsc.map(function (m) { return m.id; }) };
    }
    var CG = M.cargas(G, cg);
    if (G.problemas.length) { base.problemas = G.problemas.slice(); base.motivo = G.problemas[0].texto; return base; }
    var casos = CG.casos;
    /* vigas que recebem área marcada como COBERTURA (limite de flecha L/250) */
    G.cobertura = [];
    arr(CG.resumo.areas).forEach(function (a) { if (!a.cobertura || !a.distribuicao) return; arr(a.distribuicao.vigas).forEach(function (mid) { var m = G.membros.filter(function (x) { return x.id === mid; })[0]; if (m && G.cobertura.indexOf(m.peca) < 0) G.cobertura.push(m.peca); }); });
    var combs = C.combinacoes(casos, { segundaOrdem: true, nocional: true });
    var elu = combs.filter(function (c) { return c.tipo === "ELU"; }), els = combs.filter(function (c) { return c.tipo !== "ELU"; });
    var res = A.analisar(G.modelo, { combinacoes: elu.concat(els.map(function (c) { return { id: c.id, fatores: c.fatores }; })).concat(casos.map(function (c) { var f = {}; f[c.id] = 1; return { id: "caso_" + c.id, fatores: f }; })), estacoes: 7 });
    if (!res.ok) {
      var tr = G.modelo.barras.some(function (b) { return b.tracao; });
      var tx = "A análise não fechou (" + res.motivo + ")." + (tr && /mecanismo|instável/i.test(res.motivo) ? " Com barra redonda (só tração), a diagonal fica frouxa quando comprimida: sem a do outro sentido (X), o plano vira mecanismo nessa combinação — desenhe o X ou use cantoneira/tubo." : (/instável|mecanismo/i.test(res.motivo) ? " A 2ª ordem pode ter passado da carga crítica de flambagem global: aumente a rigidez (perfis maiores, bases engastadas, contraventamento)." : ""));
      /* SIMULAÇÃO S3 (14/10/2026): piso de vigas ROTULADAS sem X no plano horizontal — os pilares internos ficam presos só por
         vigas articuladas e o piso (chapa/deck) não é diafragma no modelo: quase mecanismo, que a 2ª ordem acusa (achado no
         mezanino de peças prontas: λcr = 0,05) */
      var horiz = G.membros.filter(function (m) { return m.papelLivre === "diagonal" && Math.abs(m.X[1]) < 0.2; }).length, vigasRot = G.membros.filter(function (m) { return (m.papelLivre === "viga" || m.papelLivre === "terca") && m.pontas.ini.tipo === "rotulada" && m.pontas.fim.tipo === "rotulada"; }).length;
      var solP = [];
      /* o nó que perdeu a rigidez é de uma DIAGONAL (sub-nó "D1_1#3"): é ela que flamba — o recado do piso não serve */
      var noRuim = (/nó ([^,\s]+)/.exec(String(res.motivo || "")) || [])[1] || "", mDiag = G.membros.filter(function (m) { return m.papelLivre === "diagonal" && noRuim.indexOf(m.id + "_") === 0; })[0];
      /* REVISÃO M4 (14/10/2026): o recado do piso só quando há base ROTULADA — com todas as bases engastadas cada pilar é um
         balanço e o piso rotulado não vira mecanismo no plano; a causa é outra (pilar fraco, carga acima da crítica — r4f
         do test-aco-livre: W 150 × 13,5 com depósito recebia o recado do piso) */
      var basesRot = arr(G.bases).filter(function (b) { return b.tipo !== "engastada"; }).length;
      if (mDiag) { var eD = esbeltezMembro(mDiag); tx += " Quem perde a rigidez é a diagonal " + mDiag.id + " (" + mDiag.secao.nome + (eD ? ", L/r = " + br(eD.lam, 0) : "") + "): ela flamba sob a compressão — use barra redonda (só tração, em X) ou um perfil mais robusto."; }
      else if (/instável|mecanismo/i.test(res.motivo) && !horiz && vigasRot >= 3 && basesRot > 0) { tx += " Provável causa: as vigas do piso são ROTULADAS e não há contraventamento no PLANO do piso — o piso (chapa/steel deck) não entra como diafragma; os pilares internos ficam soltos no plano. Contravente o plano do piso (X horizontal; no mezanino ou na plataforma: 'Contraventamento no plano do piso') ou use ligações rígidas."; solP.push({ id: "contraventar-plano", texto: "Contraventar o plano do piso (X horizontal)" }); }
      base.problemas = [{ tipo: "analise", texto: tx, solucoes: solP }]; base.motivo = tx; base.casos = casos; base.combinacoes = combs; return base;
    }
    /* deslocabilidade: Δ2/Δ1 por direção nos topos dos pilares (ou em todos os nós) */
    var pils = G.membros.filter(function (m) { return m.papelLivre === "pilar"; }), topos = pils.length ? pils.map(function (m) { return m.nos[m.nos.length - 1]; }) : G.modelo.nos.map(function (n) { return n.id; });
    var H = Math.max(1, G.layout.H), razaoDesl = 1, minDesl = H / 5000;
    elu.forEach(function (c) {
      var d2 = res.combinacoes[c.id]; if (!d2 || !d2.ok || !d2.desloc1) return;
      [0, 2].forEach(function (dir) { var m1 = 0, m2 = 0; topos.forEach(function (n) { var a = d2.desloc1[n], b = d2.desloc[n]; if (!a || !b) return; m1 = Math.max(m1, Math.abs(a[dir])); m2 = Math.max(m2, Math.abs(b[dir])); }); if (m1 > minDesl) razaoDesl = Math.max(razaoDesl, m2 / m1); });
    });
    var classe = razaoDesl <= 1.13 ? "pequena" : razaoDesl <= 1.55 ? "média" : "grande";
    G.decisoes.push({ tema: "Esbeltez", decisao: "L/r ≤ 200 nas barras comprimidas e ≤ 300 nas tracionadas como EXIGÊNCIA (reprova a barra e limita o perfil mais leve); barra redonda e cabo isentos",
      motivo: "NBR 8800:2008, 5.3.4.1 (compressão; na 2024, 5.3.7, recomendação) e 5.2.8.1 (tração; recomendação, exceto barra redonda pré-tensionada) — o OrçaPRO adota os dois como exigência. Premissa: barras redondas e cabos montados com pré-tensão (esticador). Comprimida/tracionada: diagonais de perfil sempre; pilares com qualquer força axial; vigas e terças com força axial ≥ 5 % de Ag·fy/γa1" });
    G.decisoes.push({ tema: "Análise estrutural", decisao: "2ª ordem (P-Δ e P-δ) com forças nocionais de 0,3 % das cargas gravitacionais em x e em z; deslocabilidade " + classe + " (Δ2/Δ1 máx. = " + br(razaoDesl, 3) + ")", motivo: "NBR 8800:2024, 4.10 (limites 1,13 e 1,55)" + (classe !== "pequena" ? " — rigidez reduzida a 80 % (imperfeição de material)" : "") });
    if (classe !== "pequena") {
      var r80 = A.analisar(G.modelo, { combinacoes: elu.map(function (c) { return { id: c.id, fatores: c.fatores, segundaOrdem: true, nocional: c.nocional, reducaoRigidez: 0.8 }; }), estacoes: 7 });
      if (r80.ok) Object.keys(r80.combinacoes).forEach(function (k) { res.combinacoes[k] = r80.combinacoes[k]; });
    }
    var avisos = G.avisos.concat(res.avisos || []);
    /* GRANDE deslocabilidade REPROVA: a NBR 8800 (4.10) pede análise rigorosa (não linearidade física e geométrica) — fora
       do método deste cálculo. Só avisar deixou a otimização descer os pilares até Δ2/Δ1 = 3,3 e o mezanino sair
       "aprovado" (achado no e2e de 13/10/2026). */
    var estabGlobal = { ok: classe !== "grande", razao: razaoDesl, classe: classe,
      texto: classe === "grande" ? "Estrutura de GRANDE deslocabilidade (Δ2/Δ1 = " + br(razaoDesl, 2) + " > 1,55): a NBR 8800 (4.10) exige análise rigorosa, fora do método deste cálculo — aumente a rigidez lateral (pilares maiores, bases engastadas, ligações rígidas ou contraventamento)." : null };
    if (classe === "grande") avisos.push(estabGlobal.texto);
    /* verificação das barras */
    var resultadosM = {}, grupos = {}, falhas = estabGlobal.ok ? 0 : 1;
    G.membros.forEach(function (m) {
      var est2 = []; elu.forEach(function (c) { est2 = est2.concat(Dm.estacoesMembro(res, m, c.id)); });
      var v = aplicarEsbeltez(verificarMembro(m, est2, elu), m, est2);
      resultadosM[m.id] = v;
      arr(v.avisos).forEach(function (a) { var t = m.id + " (" + m.secao.nome + "): " + a; if (avisos.indexOf(t) < 0) avisos.push(t); });
      var g = grupos[m.grupo] || (grupos[m.grupo] = { razao: 0, razaoELU: 0, membro: null, perfil: m.secao.nome, papel: m.papelLivre, membros: [] });
      g.membros.push(m.id);
      if (v.razao > g.razao) { g.razao = v.razao; g.membro = m.id; }
      g.razaoELU = Math.max(g.razaoELU, v.razao);
      if (!v.ok) falhas++;
    });
    if (escTrava) {
      var nPe = 0, nTopo = 0;
      escTrava.membros.forEach(function (mid) { var m = G.membros.filter(function (x) { return x.id === mid; })[0]; if (!m) return; elu.forEach(function (c) { var e = Dm.estacoesMembro(res, m, c.id); if (!e.length) return; var baixo = m.a[1] <= m.b[1]; nPe = Math.max(nPe, Math.abs((baixo ? e[0] : e[e.length - 1]).N)); nTopo = Math.max(nTopo, Math.abs((baixo ? e[e.length - 1] : e[0]).N)); }); });
      escTrava.npe = nPe; escTrava.ntopo = nTopo;
      escTrava.texto = "A estrutura só é estável por causa da ESCADA (" + escTrava.membros.join(", ") + "): sem as longarinas ela é MECANISMO — a escada está travando a estrutura. Contravente a estrutura (X na direção que falta) ou projete o pé e o topo da escada como travamento: N = " + br(nPe, 1) + " kN no pé e " + br(nTopo, 1) + " kN no topo (ELU).";
      falhas++; avisos.push(escTrava.texto);
      G.decisoes.push({ tema: "Escada como travamento", decisao: "REPROVA: a estrutura sem a escada é mecanismo", motivo: "a escada não é elemento de contraventamento previsto; o pé e o topo não foram dimensionados para N = " + br(nPe, 1) + " / " + br(nTopo, 1) + " kN" });
    }
    /* tirantes (barra redonda): a barra que nunca traciona fica frouxa — informação */
    G.membros.filter(function (m) { return m.papel === "tirante"; }).forEach(function (m) {
      var trac = elu.some(function (c) { var cb = res.combinacoes[c.id]; return cb && cb.ok && m.segs.some(function (s) { var b = cb.barras[s]; return b && !b.inativa && b.estacoes[0].N > 1e-6; }); });
      if (!trac) avisos.push(m.id + " (" + m.secao.nome + "): barra só de tração FROUXA em todas as combinações últimas — não trabalha (confira se o X está completo).");
    });
    /* ELS */
    var servico = servicoDe(G, res, els), falhasELS = servico.filter(function (s) { return s.razao > 1; }).length;
    servico.forEach(function (s) { var m = G.membros.filter(function (x) { return x.id === s.membro; })[0]; if (!m) return; var g = grupos[m.grupo]; if (g) { g.razaoELS = Math.max(g.razaoELS || 0, s.razao); if (s.razao > g.razao) { g.razao = s.razao; g.membro = m.id; g.governaELS = true; } } });
    falhas += falhasELS;
    /* reações */
    var reacoes = {};
    G.modelo.apoios.forEach(function (a) {
      var b = a.no, o = { porCaso: {}, envELU: { Fx: [Infinity, -Infinity], Fy: [Infinity, -Infinity], Fz: [Infinity, -Infinity], Mx: [Infinity, -Infinity], My: [Infinity, -Infinity], Mz: [Infinity, -Infinity] }, combEnv: {} };
      casos.forEach(function (c) { var cb = res.combinacoes["caso_" + c.id]; if (cb && cb.ok && cb.reacoes[b]) o.porCaso[c.id] = cb.reacoes[b].slice(); });
      elu.forEach(function (c) {
        var cb = res.combinacoes[c.id]; if (!cb || !cb.ok || !cb.reacoes[b]) return; var r = cb.reacoes[b];
        [["Fx", 0], ["Fy", 1], ["Fz", 2], ["Mx", 3], ["My", 4], ["Mz", 5]].forEach(function (p) {
          var e = o.envELU[p[0]], ce = o.combEnv[p[0]] || (o.combEnv[p[0]] = [null, null]);
          if (r[p[1]] < e[0]) { e[0] = r[p[1]]; ce[0] = c.id; } if (r[p[1]] > e[1]) { e[1] = r[p[1]]; ce[1] = c.id; }
        });
      });
      var ai = G.apoiosNo[b] || {}; o.peca = ai.peca; o.membro = ai.mid; o.tipo = ai.tipo;
      reacoes[b] = o;
    });
    /* peso */
    var peso = 0, pesoG = {};
    G.membros.forEach(function (m) { var kg = m.L * num(m.secao.massa, 0); peso += kg; pesoG[m.grupo] = (pesoG[m.grupo] || 0) + kg; });
    var areaT = 0; arr(CG.resumo.areas).forEach(function (a) { areaT += num(a.area, 0); });
    /* flambagem global: a ELU gravitacional mais carregada e a de vento */
    var flamb = [];
    if (!op.semFlambagem) {
      var gravRef = elu.filter(function (c) { return !Object.keys(c.fatores).some(function (k) { return /^W/.test(k); }); })[0] || elu[0], ventoRef = elu.filter(function (c) { return Object.keys(c.fatores).some(function (k) { return /^W/.test(k); }); })[0] || null;
      [gravRef, ventoRef].forEach(function (c) {
        if (!c) return;
        var fb = A.flambagem(G.modelo, { combinacao: { id: c.id, fatores: c.fatores, nocional: c.nocional }, modos: 2 });
        if (fb.ok) flamb.push({ combinacao: c.id, nome: c.nome, lambda: fb.lambdaCritico, modos: fb.modos });
      });
      if (flamb.length) {
        var lmin = Math.min.apply(null, flamb.map(function (f) { return f.lambda > 0 ? f.lambda : 1e9; }));
        if (lmin < 1e9) G.decisoes.push({ tema: "Flambagem global", decisao: "fator de carga crítica λcr = " + br(lmin, 2), motivo: "análise de autovalor da rigidez geométrica; com λcr > 10 os efeitos globais de 2ª ordem são pequenos" });
        if (lmin < 3) avisos.push("λcr = " + br(lmin, 2) + " < 3: estrutura muito flexível em 2ª ordem — aumentar a rigidez.");
      }
    }
    /* sugestão para quem não passa: o próximo da família que deve passar */
    Object.keys(resultadosM).forEach(function (id) {
      var v = resultadosM[id], m = G.membros.filter(function (x) { return x.id === id; })[0];
      var sv = servico.filter(function (s) { return s.membro === id && s.razao > 1; });
      if (!m || (v.ok && !sv.length)) return;
      var rz = Math.max(v.razao, sv.length ? Math.max.apply(null, sv.map(function (s) { return s.razao; })) : 0);
      var fam = familia(m.secao.nome), i = fam.indexOf(m.secao.nome);
      for (var k = i + 1; k < fam.length; k++) { var e = rz * massaDe(m.secao.nome) / massaDe(fam[k]); if (e <= 0.95) { v.sugestao = "Trocar " + m.secao.nome + " por " + fam[k] + " (estimativa; o cálculo confirma)"; break; } }
      if (!v.sugestao) v.sugestao = "Nenhum perfil da família " + String(m.secao.nome).split(" ")[0] + " resolve: perfil maior/soldado, travar mais a barra ou reduzir o vão.";
    });
    return {
      ok: true, tipo: "livre", aprovado: falhas === 0, falhas: falhas, modelo: G, casos: casos, combinacoes: combs, analise: res,
      deslocabilidade: { razao: razaoDesl, classe: classe }, estabilidadeGlobal: estabGlobal, escadaTrava: escTrava, membros: resultadosM, grupos: grupos, contravento: null, servico: servico, reacoes: reacoes,
      peso: peso, pesoGrupos: pesoG, pesoTotal: peso, taxa: areaT > 0 ? peso / areaT : null, areaCarregada: areaT, cargasResumo: CG.resumo,
      vento: CG.resumo.vento ? CG.resumo.vento.resultado : null, ventoCasos: CG.resumo.vento ? CG.resumo.vento.casos : null,
      decisoes: G.decisoes, avisos: avisos, flambagem: flamb, naoAbrangidos: NAO_ABRANGIDOS.slice()
    };
  }

  /* ================================================================ DESLOCAMENTOS (ELS)
   * Vigas: cada VÃO (entre os apoios da peça: pontas apoiadas e pilares no meio) — deslocamento vertical em relação à
   * corda das pontas do vão; balanço — da ponta em relação ao apoio, L = 2 × o balanço. Pilares: topo × base. */
  function servicoDe(G, res, els) {
    var raras = els.filter(function (c) { return c.tipo === "ELS-rara"; }), Dm = Dim(), out = [];
    /* SIMULAÇÃO S1 (14/10/2026): só com ações PERMANENTES não há combinação rara — e a flecha saía 0,0 mm ("aprovado"
       sem verificar). Sem variável, a rara (ΣFg + Fq1 + ΣΨ1·Fq) é a própria ΣFg = a quase permanente: usa-se ela. */
    if (!raras.length) { raras = els.filter(function (c) { return c.tipo === "ELS-qp"; }); if (raras.length) G.decisoes.push({ tema: "Deslocamentos", decisao: "flechas e deslocamentos com a combinação quase permanente", motivo: "só há ações permanentes: a combinação rara (NBR 8681) é ΣFg, igual à quase permanente" }); }
    var topos = {}; G.membros.forEach(function (m) { if (m.papelLivre === "pilar") topos[Math.round(Math.max(m.a[1], m.b[1]) * 10) / 10] = true; });
    var umPav = Object.keys(topos).length <= 1 && !G.membros.some(function (m) { return m.papelLivre === "pilar" && (m.pontas.ini.tipo === "continua" || m.pontas.fim.tipo === "continua") && G.membros.some(function (o) { return o !== m && o.papelLivre === "pilar" && o.nos.some(function (n) { return m.nos.indexOf(n) >= 0; }); }); });
    /* PÓRTICOS M4 (14/10/2026): o GALPÃO de um pavimento declarado pela tipologia (js/metalporticos.js, metal.calc.umPavimento
       em TODAS as peças): a coluna de tapamento do oitão, o pilar interno que vai à cumeeira e o pilar alto do shed têm topos em
       alturas diferentes, e a regra acima os lia como prédio de vários pisos (h/500 em vez de H/300 — Tabela C.1: "galpões em
       geral e edifícios de um pavimento") */
    var empilhado = G.membros.some(function (m) { return m.papelLivre === "pilar" && (m.pontas.ini.tipo === "continua" || m.pontas.fim.tipo === "continua") && G.membros.some(function (o) { return o !== m && o.papelLivre === "pilar" && o.nos.some(function (n) { return m.nos.indexOf(n) >= 0; }); }); });
    var declUm = !empilhado && arr(G.pecas).length > 0 && arr(G.pecas).every(function (p) { return p.calc && p.calc.umPavimento; });   /* pilar sobre pilar é prédio de pisos: a declaração não vale */
    if (declUm && !umPav) { umPav = true; G.decisoes.push({ tema: "Deslocamentos", decisao: "topo dos pilares H/300 (galpão de um pavimento — declarado pela tipologia do pórtico paramétrico)", motivo: "NBR 8800:2008, Tabela C.1: galpões em geral e edifícios de um pavimento; os pilares de alturas diferentes (tapamento do oitão, pilar interno, shed) não são pisos" }); }
    var cobPecas = {}, suporta = {};
    arr(G.cobertura).forEach(function (id) { cobPecas[id] = true; });
    /* viga que SUPORTA pilar: o PÉ de um pilar (a ponta de baixo) cai no meio dela — L/500 (o pilar que só encosta por
       baixo numa viga contínua é apoio dela, não carga) */
    G.membros.forEach(function (m) {
      if (m.papelLivre !== "pilar") return;
      var n0 = m.nos[0], n1 = m.nos[m.nos.length - 1], I = G.noInfo[G.noInfo[n0].P[1] <= G.noInfo[n1].P[1] ? n0 : n1];
      if (I) I.passa.forEach(function (ip) { var p = G.pecas[ip]; if (p && p.papel !== "pilar") suporta[p.id] = true; });
    });
    G.membros.forEach(function (m) {
      if (m.papelLivre === "pilar") {
        var nb = m.nos[0], nt = m.nos[m.nos.length - 1];
        if (G.noInfo[nb].P[1] > G.noInfo[nt].P[1]) { var t = nb; nb = nt; nt = t; }
        var mx = 0, onde = null;
        raras.forEach(function (c) { var cb = res.combinacoes[c.id]; if (!cb || !cb.ok) return; var a = cb.desloc[nt], b = cb.desloc[nb] || [0, 0, 0]; if (!a) return; var h = Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[2] - b[2], 2)); if (h > mx) { mx = h; onde = c.id; } });
        var Lm = umPav ? LIMITES.umPav : LIMITES.entrePisos, lim = m.L / Lm.div;
        out.push({ membro: m.id, tipo: "pilarTopo", valor: mx, limite: lim, razao: lim > 0 ? mx / lim : 0, comb: onde, texto: Lm.nome + ": " + (umPav ? "H" : "h") + "/" + Lm.div, ref: REF_C1 });
        return;
      }
      if (m.papelLivre === "diagonal") return;
      var tipoL = m.papelLivre === "terca" ? LIMITES.terca : (suporta[m.peca] ? LIMITES.suportaPilar : (cobPecas[m.peca] ? LIMITES.cobertura : LIMITES.piso));
      var sup = arr(m.apoiosVao).slice().sort(function (a, b) { return a - b; });
      if (!sup.length) return;
      var vaos = [];
      for (var k = 0; k + 1 < sup.length; k++) if (sup[k + 1] - sup[k] > 1e-3) vaos.push({ a: sup[k], b: sup[k + 1], tipo: "vao" });
      if (sup[0] > 1e-3) vaos.push({ a: 0, b: sup[0], tipo: "balanco", apoio: sup[0], ponta: 0 });
      if (sup[sup.length - 1] < m.L - 1e-3) vaos.push({ a: sup[sup.length - 1], b: m.L, tipo: "balanco", apoio: sup[sup.length - 1], ponta: m.L });
      vaos.forEach(function (v) {
        var fmax = 0, cmax = null;
        raras.forEach(function (c) {
          var est = Dm.estacoesMembro(res, m, c.id); if (est.length < 2) return;
          function uEm(x) { var b = null; est.forEach(function (e) { if (!b || Math.abs(e.x - x) < Math.abs(b.x - x)) b = e; }); return b ? b.u : null; }
          if (v.tipo === "vao") {
            var u0 = uEm(v.a), u1 = uEm(v.b); if (!u0 || !u1) return;
            est.forEach(function (e) { if (e.x < v.a - 1e-6 || e.x > v.b + 1e-6) return; var s = (e.x - v.a) / (v.b - v.a), dv = e.u[1] - (u0[1] + (u1[1] - u0[1]) * s); if (Math.abs(dv) > Math.abs(fmax)) { fmax = dv; cmax = c.id; } });
          } else {
            var ua = uEm(v.apoio), up = uEm(v.ponta); if (!ua || !up) return;
            var dv2 = up[1] - ua[1]; if (Math.abs(dv2) > Math.abs(fmax)) { fmax = dv2; cmax = c.id; }
          }
        });
        var Lref = v.tipo === "balanco" ? 2 * (v.b - v.a) : (v.b - v.a), lim2 = Lref / tipoL.div;
        out.push({ membro: m.id, tipo: v.tipo === "balanco" ? "balanco" : "viga", valor: Math.abs(fmax), limite: lim2, razao: lim2 > 0 ? Math.abs(fmax) / lim2 : 0, comb: cmax, vao: [v.a, v.b],
                   texto: tipoL.nome + ": L/" + tipoL.div + (v.tipo === "balanco" ? " (balanço: L = 2 × " + br(v.b - v.a, 2) + " m)" : " (vão " + br(v.b - v.a, 2) + " m, em relação à corda dos apoios)"), ref: REF_C1 });
      });
    });
    return out;
  }

  /* ================================================================ FAMÍLIA / OTIMIZAÇÃO */
  function massaDe(nome) { var C = Cat(), c = C && C.obter(nome); return c ? num(c.massa, 1) : 1; }
  function familia(nome) {
    var C = Cat(), D = Dim(), MC = Cri(); if (!C) return [];
    var c = C.obter(nome); if (!c) return [];
    var lista = D ? D.familia(nome) : [];
    if (c.forma === "frio") lista = C.listar(c.serie).map(function (n) { return C.obter(n); }).filter(function (x) { return x && x.tipoFrio === c.tipoFrio && x.massa > 0; }).sort(function (a, b) { return a.massa - b.massa; }).map(function (x) { return x.nome; });
    if (MC && MC.desenhavel) lista = lista.filter(function (n) { return MC.desenhavel(n); });
    if (lista.indexOf(c.nome) < 0) lista.push(c.nome);
    return lista;
  }
  function info(nome) { var C = Cat(), c = C && C.obter(nome); return c ? { nome: c.nome, massa: num(c.massa, 0), Wx: num(c.Wx, 0), Ix: num(c.Ix, 0), Iy: num(c.Iy, 0) } : null; }
  function trocarPerfil(p, nome) {
    var C = Cat(), Mo = Mod(), BM = Met(), reg = C.obter(nome), sec = reg ? Mo.secaoDe(reg.nome) : null;
    if (!sec) return false;
    var pf = C.paraPerfil(reg.nome), ds = BM && pf ? BM.secao(pf) : null;
    p.cat = reg.nome; p.reg = reg; p.sec = sec;
    if (ds && ds.ok !== false) { p.alt = num(ds.alt, p.alt); p.larg = num(ds.larg, p.larg); p.h = Math.max(p.alt, p.larg); }
    p.tracao = sec.forma === "circ";
    return true;
  }
  function chaveGrupo(p) { return p.papel + "|" + p.cat; }

  function calcular(entrada, op) {
    entrada = entrada || {}; op = op || {};
    var t0 = Date.now(), M = ML();
    if (!M || !Car() || !Ana() || !D8800() || !Dim()) return { ok: false, motivo: "Motores do cálculo não carregados.", tipo: "livre" };
    /* FRENTE S5 (14/10/2026, js/acoenvoltorio.js): com o ENVOLTÓRIO (faces + fechamento escolhido), o vento sai das faces
       lidas da geometria e a cobertura de telha vira área de cobertura; o que a norma/o motor não cobre volta como
       "não verificado" e a situação fica "incompleto" (nunca "aprovado" com o vento sem verificar) */
    var PE = entrada.envoltorio && Env() ? Env().prepararEntrada(entrada) : null;
    if (PE) entrada = PE.entrada;
    if (PE && PE.problemas && PE.problemas.length) return { ok: false, tipo: "livre", problemas: PE.problemas, motivo: PE.problemas[0].texto };
    var lido = M.ler(entrada.caixas, { ids: entrada.ids, acoEstrutura: entrada.acoEstrutura });
    var probs = [];
    if (lido.motivo) return { ok: false, motivo: lido.motivo, tipo: "livre" };
    if (lido.semPerfil.length) probs.push({ tipo: "perfil", texto: lido.semPerfil.length + " peça(s) sem perfil do catálogo — o cálculo precisa das propriedades da seção: " + lido.semPerfil.map(function (s) { return s.nome + " (" + s.motivo + ")"; }).join("; ") + ".", pecas: lido.semPerfil.map(function (s) { return s.id; }), solucoes: [{ id: "perfil", texto: "Escolha o perfil do catálogo nas Propriedades da peça" }] });
    if (lido.semAco.length) probs.push({ tipo: "aco", texto: lido.semAco.length + " peça(s) com aço desconhecido: " + lido.semAco.map(function (s) { return s.nome + " (" + s.aco + ")"; }).join("; ") + ".", pecas: lido.semAco.map(function (s) { return s.id; }), solucoes: lido.semAco.some(function (q) { return q.estrutura; }) ? [{ id: "aco-estrutura", texto: "Usar ASTM A572 Gr.50 (o padrão de pilar e viga da Metálica) nas peças de aço da aba Estrutura" }] : [{ id: "aco", texto: "Escolha o aço (ASTM A572 Gr.50, A36…) nas Propriedades" }] });
    if (!lido.pecas.length && !probs.length) probs.push({ tipo: "vazio", texto: "Nenhuma barra de aço desenhada" + (arr(entrada.ids).length ? " na seleção" : "") + ": desenhe pilares, vigas e diagonais com as ferramentas da Metálica (Peças).", solucoes: [] });
    if (probs.length) return { ok: false, tipo: "livre", problemas: probs, motivo: probs[0].texto, lido: { pecas: lido.pecas.length, semPerfil: lido.semPerfil, ignoradas: lido.ignoradas } };
    var avisosLeitura = [];
    if (lido.curtas.length) avisosLeitura.push(lido.curtas.length + " peça(s) com menos de 5 cm ficaram de fora: " + lido.curtas.map(function (c) { return c.nome; }).join("; ") + ".");
    if (lido.ignoradas.length) avisosLeitura.push(lido.ignoradas.length + " chapa(s)/peça(s) mecânica(s) fora de ligação não entram no modelo de barras (o peso delas não está no peso próprio).");
    /* perfis trocados à mão por grupo (tela): { "papel|perfil": novo } */
    var orig = {}; lido.pecas.forEach(function (p) { orig[p.id] = p.cat; });
    Object.keys(entrada.perfisGrupo || {}).forEach(function (gk) { lido.pecas.forEach(function (p) { if (chaveGrupo(p) === gk) trocarPerfil(p, entrada.perfisGrupo[gk]); }); });
    var r = rodada(lido, entrada, op), log = [], r0 = r;
    /* otimização */
    var alvo = entrada.otimizar === true ? null : (arr(entrada.otimizar).length ? entrada.otimizar : (entrada.otimizar ? null : []));
    if (r.ok && !(alvo && !alvo.length)) {
      var proib = {}, maxIt = num(op.maxIteracoes, 10), it = 0, hist = [{ perfis: perfisAtuais(lido), falhas: r.falhas, peso: r.peso }];
      /* grupos-alvo pela chave ORIGINAL (a chave muda quando o perfil muda: o grupo é o conjunto de peças) */
      var conj = {}; lido.pecas.forEach(function (p) { var gk = p.papel + "|" + orig[p.id]; if (!alvo || alvo.indexOf(gk) >= 0 || alvo.indexOf(chaveGrupo(p)) >= 0) (conj[gk] = conj[gk] || []).push(p); });
      var razoes = function (res, ps) {
        var o = { e: 0, s: 0 };
        ps.forEach(function (p) { var mm = res.modelo.membros.filter(function (m) { return m.peca === p.id; })[0]; if (!mm) return; o.e = Math.max(o.e, num((res.membros[mm.id] || {}).razao, 0)); res.servico.forEach(function (sv) { if (sv.membro === mm.id) o.s = Math.max(o.s, sv.razao); }); });
        return o;
      };
      /* o perfil estimado pela razão: Wx (resistência) e Ix (deslocamento) na proporção, com margem */
      var estimar = function (gk, sobe) {
        var ps = conj[gk], atual = ps[0].cat, i0 = info(atual); if (!i0) return null;
        var q = razoes(r, ps), falha = q.e > 1 || q.s > 1;
        /* grande deslocabilidade: os PILARES sobem pela rigidez (Ix e Iy × 1,5 — a deslocabilidade é dos dois eixos) */
        if (sobe && !falha && r.estabilidadeGlobal && !r.estabilidadeGlobal.ok && ps[0].papel === "pilar") {
          var rig = familia(atual).map(info).filter(function (x) { return x && x.Ix >= 1.5 * i0.Ix && x.Iy >= 1.5 * i0.Iy && !(proib[gk] && proib[gk][x.nome]); }).sort(function (a, b) { return a.massa - b.massa; })[0];
          return rig ? { gk: gk, de: atual, para: rig.nome, motivo: "deslocabilidade grande (Δ2/Δ1 = " + br(r.estabilidadeGlobal.razao, 2) + ")" } : null;
        }
        if (sobe !== falha) return null;
        if (!sobe && Math.max(q.e, q.s) > 0.85) return null;   /* sem folga para estimar a descida: fica para a descida conferida */
        var wReq = q.e > 1 ? i0.Wx * q.e / 0.95 : i0.Wx * q.e / 0.85, iReq = q.s > 1 ? i0.Ix * q.s / 0.95 : i0.Ix * q.s / 0.9;
        var fam = familia(atual).map(info).filter(function (x) { return x && !(proib[gk] && proib[gk][x.nome]); });
        var esc = fam.filter(function (x) { return x.Wx >= wReq && x.Ix >= iReq && (sobe ? x.massa >= i0.massa : x.massa < i0.massa); }).sort(function (a, b) { return a.massa - b.massa; })[0] || null;
        if (sobe && (!esc || esc.nome === atual)) esc = fam.filter(function (x) { return x.Wx > i0.Wx * 1.02 && x.Ix >= i0.Ix; }).sort(function (a, b) { return a.massa - b.massa; })[0] || null;
        if (!esc || esc.nome === atual) return null;
        return { gk: gk, de: atual, para: esc.nome, motivo: q.e > 1 ? "resistência " + br(q.e, 2) : q.s > 1 ? "deslocamento " + br(q.s, 2) : "folga " + br(Math.max(q.e, q.s), 2) + " — mais leve" };
      };
      var aplicar = function (lista, rot) { lista.forEach(function (x) { conj[x.gk].forEach(function (p) { trocarPerfil(p, x.para); }); log.push("Rodada " + rot + ": " + conj[x.gk].length + " peça(s) " + x.gk.split("|")[0] + " " + x.de + " → " + x.para + " (" + x.motivo + ")"); }); };
      /* FASE 1 — até passar: SÓ sobe os grupos que falham (descer junto já desestabilizou a 2ª ordem num mezanino de
         teste: pilar e viga mais leves ao mesmo tempo que a secundária subia — 13/10/2026) */
      while (it < maxIt && r.ok && !r.aprovado) {
        var sobe = Object.keys(conj).map(function (gk) { return estimar(gk, true); }).filter(Boolean);
        if (!sobe.length) { log.push("Nenhum perfil maior na família resolve o que falha — fica o último calculado."); break; }
        it++; aplicar(sobe, it + 1);
        var rn = rodada(lido, entrada, op); hist.push({ perfis: perfisAtuais(lido), falhas: rn.falhas, peso: rn.peso });
        if (!rn.ok) { log.push("A rodada " + (it + 1) + " não fechou (" + (rn.motivo || "análise") + ") — volta à anterior."); restaurar(lido, r); break; }
        r = rn;
      }
      /* FASE 2 — estimativa para DESCER os grupos com folga (até 3 passadas); a que reprovar volta inteira */
      for (var k2 = 0; k2 < 3 && r.ok && r.aprovado && it < maxIt; k2++) {
        var desce = Object.keys(conj).map(function (gk) { return estimar(gk, false); }).filter(Boolean);
        if (!desce.length) break;
        it++; aplicar(desce, it + 1);
        var rd = rodada(lido, entrada, op); hist.push({ perfis: perfisAtuais(lido), falhas: rd.falhas, peso: rd.peso });
        if (rd.ok && rd.aprovado) { r = rd; continue; }
        desce.forEach(function (x) { (proib[x.gk] = proib[x.gk] || {})[x.para] = true; });
        log.push("Rodada " + (it + 1) + ": a descida estimada não passou (" + (rd.ok ? rd.falhas + " falha(s)" : rd.motivo) + ") — volta; a descida conferida, grupo a grupo, segue.");
        restaurar(lido, r);
      }
      /* DESCIDA conferida: a estimativa por Wx/Ix erra (a FLT, a flecha e a 2ª ordem não caem na proporção) — cada grupo
         tenta o VIZINHO mais leve da família com o cálculo completo; passa → fica e tenta o próximo; reprova → volta e
         para. No fim, o vizinho mais leve de cada grupo REPROVA (é o que o teste confere). */
      /* a reprovação na descida vale enquanto os OUTROS grupos não mudam: um grupo mais leve alivia os demais (o peso
         próprio desce) e o vizinho que reprovou antes pode passar — o peso total só cai, então a busca termina */
      var proibD = {}, saltoFeito = {}, tent = 0, maxDesc = num(op.maxDescida, 60), tMax = num(op.tempoMaxMs, 25000), limpou = false;
      while (r.ok && r.aprovado && tent < maxDesc && Date.now() - t0 < tMax) {
        var aceitou = false;
        Object.keys(conj).forEach(function (gk) {
          var ps = conj[gk], atual = ps[0].cat, fam = familia(atual), j = fam.indexOf(atual) - 1, i0 = info(atual);
          if (j < 0 || !i0) return;
          /* candidatos: o SALTO (o mais leve que a razão atual deixa — Wx e Ix na proporção exata; uma vez a cada
             mudança do grupo) e o VIZINHO */
          var q = razoes(r, ps), cands = [];
          if (!saltoFeito[gk]) {
            var salto = fam.slice(0, j).map(info).filter(function (x) { return x && x.Wx >= i0.Wx * q.e && x.Ix >= i0.Ix * q.s && !(proibD[gk] && proibD[gk][x.nome]); }).sort(function (a2, b2) { return a2.massa - b2.massa; })[0];
            if (salto) cands.push({ nome: salto.nome, salto: true });
          }
          if (!(proibD[gk] && proibD[gk][fam[j]]) && !cands.some(function (c0) { return c0.nome === fam[j]; })) cands.push({ nome: fam[j] });
          for (var c = 0; c < cands.length; c++) {
            if (tent >= maxDesc || Date.now() - t0 >= tMax || !r.aprovado) return;
            var prox = cands[c].nome; tent++;
            if (cands[c].salto) saltoFeito[gk] = true;
            ps.forEach(function (p) { trocarPerfil(p, prox); });
            var r2 = rodada(lido, entrada, op);
            if (r2.ok && r2.aprovado) { r = r2; aceitou = true; saltoFeito[gk] = false; log.push("Descida: " + ps.length + " peça(s) " + gk.split("|")[0] + " " + atual + " → " + prox + " passa (" + br(r2.peso, 0) + " kg)"); return; }
            (proibD[gk] = proibD[gk] || {})[prox] = true; ps.forEach(function (p) { trocarPerfil(p, atual); }); log.push("Descida: " + gk.split("|")[0] + " " + prox + " não passa — fica " + atual);
          }
        });
        /* nenhum grupo desceu: uma passada de CONFERÊNCIA com as reprovações zeradas (os outros grupos mudaram desde
           que elas aconteceram); se nada desce nela também, acabou */
        if (!aceitou) { if (limpou) break; proibD = {}; limpou = true; }
        else limpou = false;
      }
      if (tent >= maxDesc || Date.now() - t0 >= tMax) log.push("A descida parou pelo limite de " + (tent >= maxDesc ? tent + " rodadas" : Math.round(tMax / 1000) + " s") + ": pode haver perfil mais leve — rode de novo a partir deste.");
      if (r.ok) r.otimizacao = { iteracoes: it + tent, log: log, historico: hist.map(function (h) { return { falhas: h.falhas, peso: h.peso }; }) };
    }
    if (r.ok) {
      avisosLeitura.forEach(function (x) { r.avisos.unshift(x); });
      /* o de → para de cada peça (o que a tela aplica no modelo) */
      var pecas = {};
      r.modelo.membros.forEach(function (m) { pecas[m.peca] = { membro: m.id, de: orig[m.peca], para: m.secao.nome, mudou: orig[m.peca] !== m.secao.nome }; });
      r.pecas = pecas;
      r.trocas = Object.keys(pecas).filter(function (k) { return pecas[k].mudou; }).length;
      r.ligacoesDesenhadas = Object.keys(lido.ligacoes).map(function (k) { var L = lido.ligacoes[k]; return { id: k, tipo: L.tipo, membros: L.membros.slice(), papeis: Object.keys(L.papeis) }; });
      /* enxugar: deslocamento local das estações e 1ª ordem não são lidos fora daqui */
      if (r.analise && r.analise.combinacoes) Object.keys(r.analise.combinacoes).forEach(function (k) { var cb = r.analise.combinacoes[k]; if (!cb) return; delete cb.desloc1; Object.keys(cb.barras || {}).forEach(function (id) { arr(cb.barras[id].estacoes).forEach(function (e) { delete e.ul; }); }); });
      r.parametros = { apoios: entrada.apoios || {}, ligacoes: entrada.ligacoes || {}, cargas: semFuncoes(entrada.cargas || {}), otimizar: entrada.otimizar || false, ids: entrada.ids || null };
    }
    if (r.modelo) { delete r.modelo.lido; r.modelo.pecas = (r.modelo.pecas || []).map(function (p) { return { id: p.id, mid: p.mid, nome: p.nome, papel: p.papel, cat: p.cat }; }); }
    delete r._perfis;
    if (PE) Env().completarResultado(r, PE);
    /* PÓRTICOS M4 (14/10/2026): sem envoltório, os "não verificados" declarados pelas peças da tipologia (js/metalporticos.js —
       a mísula cônica, a fadiga da viga de rolamento…) valem do mesmo jeito: a situação fica "incompleto" */
    else if (arr(lido.naoVerificados).length && Env()) {
      r.naoVerificados = lido.naoVerificados.map(function (x) { return { tema: x.tema, motivo: x.motivo }; });
      if (r.ok) r.naoVerificados.forEach(function (x) { var t = "NÃO VERIFICADO — " + x.tema + ": " + x.motivo; if (arr(r.avisos).indexOf(t) < 0) r.avisos.unshift(t); if (r.naoAbrangidos && r.naoAbrangidos.indexOf(t) < 0) r.naoAbrangidos.unshift(t); });
      r.situacao = Env().situacao(r, r.naoVerificados);
    }
    /* REVISÃO F6 (15/10/2026, crítico do revisor): terças/travessas desenhadas nas faixas de borda/canto ficam SEM o cpe
       médio (o vento da estrutura desenhada é global) — isso é NÃO VERIFICADO e a situação fica INCOMPLETO, nunca aprovado
       (antes só saía no aviso e a estrutura passava como aprovada) */
    var cmL = r.cargasResumo && r.cargasResumo.vento && arr(r.cargasResumo.vento.cpeMedioNaoAplicado);
    if (cmL && cmL.length && Env()) {
      var nvC = { tema: "Vento — cpe médio nas terças/travessas de borda (NBR 6123:2023 6.1.2/6.1.3)",
                  motivo: cmL.length + " peça(s) nas faixas de borda/canto verificadas só com o cpe da zona, sem o cpe médio: " + cmL.map(function (q) { return q.peca + " (" + q.zona + ", cpe médio " + String(q.cpe).replace(".", ",") + ")"; }).join("; ") };
      r.naoVerificados = arr(r.naoVerificados).slice();
      if (!r.naoVerificados.some(function (q) { return q.tema === nvC.tema; })) r.naoVerificados.push(nvC);
      if (r.ok) { var tC = "NÃO VERIFICADO — " + nvC.tema + ": " + nvC.motivo; r.avisos = arr(r.avisos); if (r.avisos.indexOf(tC) < 0) r.avisos.unshift(tC); if (r.naoAbrangidos && r.naoAbrangidos.indexOf(tC) < 0) r.naoAbrangidos.unshift(tC); }
      r.situacao = Env().situacao(r, r.naoVerificados);
    }
    if (arr(lido.tipologias).length) r.tipologias = lido.tipologias.slice();
    if (r.ok) {
      /* REVISÃO S5 M2 (14/10/2026): o aço adotado para as peças da aba Estrutura (que não guarda a classe) é PREMISSA */
      if (entrada.acoEstrutura && lido.estrutura && lido.estrutura.adotado) r.decisoes.push({ tema: "Aço adotado (aba Estrutura)", decisao: "aço ADOTADO pelo engenheiro: " + entrada.acoEstrutura + " em " + lido.estrutura.adotado + " pilar(es)/viga(s) da aba Estrutura (a aba Estrutura não guarda a classe do aço)", motivo: "premissa: confirmar a classe do aço com o fornecedor/projeto antes de emitir" });
      /* REVISÃO S5 C3: os apoios declarados (parede/estrutura existente) */
      var ex = (entrada.apoios && entrada.apoios.extras) || {}, kx = Object.keys(ex);
      if (kx.length) {
        var Gx = r.modelo, ptos = kx.map(function (k) { var pc = k.split(":")[0], lado = k.split(":")[1], m = arr(Gx.membros).filter(function (q) { return String(q.peca) === pc; })[0]; if (!m) return k; var no = lado === "fim" ? m.nos[m.nos.length - 1] : m.nos[0], I = Gx.noInfo && Gx.noInfo[no]; return m.id + " " + (lado === "fim" ? "fim" : "início") + (I ? " (" + br(I.P[0], 2) + "; " + br(I.P[1], 2) + "; " + br(I.P[2], 2) + ")" : ""); });
        r.decisoes.push({ tema: "Apoios declarados", decisao: kx.length + " apoio(s) " + ex[kx[0]] + " declarado(s) pelo engenheiro: " + ptos.join("; "), motivo: "a estrutura se apoia numa parede/estrutura existente nesses pontos — confirmar na obra que ela recebe as reações do quadro de cargas" });
      }
    }
    r.tempoMs = Date.now() - t0;
    return r;
  }
  function perfisAtuais(lido) { var o = {}; lido.pecas.forEach(function (p) { o[p.id] = p.cat; }); return o; }
  function semFuncoes(o) { try { return copia(o); } catch (e) { return {}; } }

  /* ================================================================ APLICAR NO MODELO
   * As peças cujo perfil mudou são REFEITAS no lugar (MetalCriar.editar → op metalAjustar, a mesma das Propriedades):
   * a linha clicada, o giro e a justificação ficam; o id, a marca, os furos e os serviços também. Um lote = um Ctrl+Z. */
  function opsAplicar(r, caixas, novoId) {
    var MC = Cri(); if (!r || !r.ok || !r.pecas || !MC) return null;
    var por = {}; arr(caixas).forEach(function (c) { if (c) por[String(c.id)] = c; });
    var ops = [], erros = [];
    Object.keys(r.pecas).forEach(function (id) {
      var t = r.pecas[id]; if (!t.mudou) return;
      var c = por[id]; if (!c) { erros.push("peça " + id + " não está mais no modelo"); return; }
      /* FRENTE S5 (14/10/2026): pilar/viga de aço da aba Estrutura — troca o perfil pela op `ajustar` (a mesma das
         Propriedades da peça: campos perfil + material) */
      if ((c.tipo === "pilar" || c.tipo === "viga") && !c.metal) {
        var C0 = Cat(), pf = C0 && C0.paraPerfil ? C0.paraPerfil(t.para) : null;
        if (!pf) { erros.push(t.para + " sem perfil no catálogo"); return; }
        ops.push({ op: "ajustar", id: id, campos: { perfil: pf, material: "aco" } }); return;
      }
      var cat = MC.perfilCat(t.para); if (!cat) { erros.push(t.para + " não é desenhável no 3D"); return; }
      var e = MC.editar(c, { cat: cat });
      if (!e || e.erro) { erros.push((c.metal && c.metal.papel) + " " + id + ": " + (e && e.erro)); return; }
      ops.push(MC.opAjustar(id, e.caixa));
    });
    if (!ops.length) return { lote: null, n: 0, erros: erros };
    return { lote: { op: "lote", id: String(typeof novoId === "function" ? novoId() : "lote-" + Date.now()), origem: "metal-calc-livre", ops: ops }, n: ops.length, erros: erros };
  }

  var AcoDimLivre = { aplicarEsbeltez: aplicarEsbeltez, esbeltezMembro: esbeltezMembro, calcular: calcular, opsAplicar: opsAplicar, LIMITES: LIMITES, NAO_ABRANGIDOS: NAO_ABRANGIDOS, familia: familia, verificarMembro: verificarMembro, REF_C1: REF_C1 };
  global.AcoDimLivre = AcoDimLivre;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoDimLivre;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
