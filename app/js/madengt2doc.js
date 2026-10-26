/* =====================================================================
 * madengt2doc.js — MEMORIAL, MANUAL DE MONTAGEM e EXPORTAÇÕES (IFC, SketchUp .dae, CYPE) da tipologia T2 (casa/pavilhão de duas águas, E4 r3).
 * Motor PURO, ES5, sem DOM, Node-testável. Mesmo caminho da T1: memorial no molde do js/madmemorial.js (MadMemorial._i), manual em A3 no molde do
 * js/madengmanual.js, IFC pelo escritor do BIM (js/ifcsaida.js), .dae/CYPE pelo js/madengexport.js. A fonte da T2 agrupa as peças por marca; aqui cada
 * MEMBRO vira uma peça com posição (MadEngT2.pecasMembros), por isso o IFC conta uma peça por elemento.
 *   MadEngT2Doc.memorial(res, op) → { ok, html, titulo, secoes, tabelas, avisos, conferencias, anexoInterno, situacao }
 *   MadEngT2Doc.manual(res, op)   → { ok, html, paginas, etapas, avisos }
 *   MadEngT2Doc.ifc(res, opts) / .dae(res, opts) / .cype(res, opts) / .cotacao(EJ, res, d)
 * Teste: node tools/test-mad-eng-t2-saidas.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } } return null; }
  var MM = dep("MadMemorial", "./madmemorial.js"), I = MM && MM._i, T2 = function () { return dep("MadEngT2", "./madengt2pranchas.js"); }, SA = function () { return dep("MadEngSaidas", "./madengsaidas.js"); }, EX = function () { return dep("MadEngExport", "./madengexport.js"); };
  var MPE = dep("MadEngPranchas", "./madengpranchas.js");
  var FAIXA = "Documento gerado pelo sistema — emissão somente após conferência e ART do responsável técnico";
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function n2(v) { return String(Math.round(v * 100) / 100); }
  var NOME_G = { P: "Pilares do perímetro", PO: "Pilares de oitão", PC: "Pilares de cumeeira", FR: "Frechais", BS: "Banzos superiores", BI: "Banzos inferiores (tirantes)", PD: "Pendurais", DG: "Diagonais", T: "Terças", CM: "Viga de cumeeira", CB: "Caibros principais", RP: "Ripas (travamento)" };
  var NOME_L = { noBanzoSuperior: "TS-1 — nó do banzo superior", noBanzoInferior: "TS-2 — nó do banzo inferior", noPendural: "TS-3 — nó do pendural", noDiagonal: "TS-4 — nó da diagonal", tesouraPilar: "TS-5 — tesoura sobre o pilar (garfo)", tercaTesoura: "TS-6 — terça sobre o banzo (rosca total)",
    cumeeiraPilar: "CP-1 — cumeeira sobre o pilar", caibroCumeeira: "CP-2 — caibro na cumeeira (rosca total)", caibroFrechal: "CP-3 — caibro no frechal (assento deslizante)", frechalPilar: "CP-4 — frechal sobre o pilar (garfo)", contravDiagonal: "CV-1 — ponta da diagonal de madeira do contraventamento", contravParede: "CV-2 — ponta da diagonal de madeira do painel da parede", contravLB: "CV-3 — ligação da linha de travamento LB ao banzo inferior", fita: "TI — fita de contraventamento (paredes)" };
  var NOME_A90 = { apoioTesouraFrechal: "TS-5a — banzo inferior sobre o frechal (compressão ⊥ às fibras)", apoioFrechalPilar: "TS-5b — frechal sobre o pilar (compressão ⊥ às fibras)", apoioCumeeiraPilar: "CP-1 — viga de cumeeira sobre o pilar (compressão ⊥ às fibras)", apoioCaibroFrechal: "CP-3 — caibro sobre o frechal, assento (compressão ⊥ às fibras)" };

  /* ================================================================ MEMORIAL */
  function memorial(res, op) {
    op = op || {};
    if (!I) return { ok: false, motivo: "js/madmemorial.js não carregou.", html: "" };
    I.reset();
    if (!res || !res.ligacoes || !res.ligacoesT2 || !res.grupos || !res.t2) return { ok: false, motivo: "Resultado do cálculo da T2 incompleto: sem memorial.", html: "", secoes: [], tabelas: 0, avisos: [], conferencias: [] };
    var d = new I.Doc(), br = I.br, t = I.t, td = I.td, trw = I.trw, caixa = I.caixa, sit = SA() ? SA().situacao(res) : { atende: false, itens: [], premissas: [] };
    function clAv(a) { var S0 = SA(); return S0 && S0.classeAviso ? S0.classeAviso(typeof a === "string" ? a : (a && (a.mensagem || a.texto)) || JSON.stringify(a)).classe : "bloqueante"; }
    function premissasHtml(st) { return st.premissas && st.premissas.length ? d.tab("Premissas adotadas (informativas: não impedem a emissão)", [I.thn("#"), "Código", "Premissa", "Por que não bloqueia"], st.premissas.map(function (x, i) { return trw([td(String(i + 1), "n"), td(I.esc(x.cod || "")), td(I.esc(x.texto)), td(I.esc(x.porque || ""))]); }), {}) : ""; }
    var ob = obj(op.obra), dc = obj(op.documento), rp = obj(op.responsavel), rev = dc.revisao || "R00", data = I.dataTxt(dc.data), nome = ob.nome || "[OBRA]", anexo = [];
    var c = { rp: rp, obraNome: nome, num: dc.numero || "", rev: rev }, M = obj(res.memoria), V = obj(M.vento), L = res.ligacoes, L2 = res.ligacoesT2, P = res.t2.params, inf = res.t2.info, CT = obj(res.cargasTotais), S = [];
    var SEC = ["Objeto e premissas", "Ações permanentes e variáveis", "Vento (NBR 6123, duas águas)", "Combinações de ações", "Análise estrutural", "Verificações por grupo e flechas", "Ligações", "Reações para a fundação", "Auditoria e pendências", "Responsabilidade técnica"];
    var sis = res.sistema === "tesoura" ? "tesouras (tipo Pratt) a cada " + br(P.tesoura.sTes, 1) + " m, terças sobre os nós do banzo superior" : "cumeeira portante: viga de cumeeira sobre pilares, caibros principais a cada ≤ " + br(P.cumeeira.sCaibro, 1) + " m, assento " + P.cumeeira.assento;
    var h = "<p>Este memorial apresenta o cálculo da estrutura de madeira engenharada (MLC) da casa de duas águas <b>" + esc(nome) + "</b>, opção <b>" + esc(res.opcao || "") + "</b> — " + esc(res.nomeOpcao || "") + ". Planta " + br(P.a, 2) + " × " + br(P.b, 2) + " m, pé-direito " + br(P.peDireito, 2) + " m, inclinação " + br(P.incl * 100, 1) + " %, beirais " + [P.beiral.frente, P.beiral.fundo, P.beiral.esq, P.beiral.dir].map(function (x) { return br(x, 2); }).join(" / ") + " m. Sistema: " + esc(sis) + ".</p>";
    h += d.tab("Premissas de cálculo", [I.thn("Item"), "Valor"], [trw([td("Classe de resistência do MLC"), td(esc(M.classe || "mlc:GL24h"))]), trw([td("Classe de umidade"), td(esc(String(M.umidade || ""))) ]), trw([td("Telha (com ripas)"), td(br(P.telha.peso, 2) + " kN/m² — " + esc(P.telha.descricao || ""))]),
      trw([td("Seções adotadas (m)"), td(esc(JSON.stringify(res.secoes)))]), trw([td("Iterações de crescimento da seção"), td(br(res.iteracoes, 0))]), trw([td("Combinações verificadas"), td(br(res.combinacoes, 0))])], { classe: "ficha" });
    h += sit.atende ? caixa("<b>Situação:</b> <span class=\"ok\">atende</span> — sem achado, reprovação nem pendência bloqueante" + (sit.premissas && sit.premissas.length ? "; as " + I.plural(sit.premissas.length, "premissa adotada", "premissas adotadas") + " estão na seção 9." : ".")) : caixa("<b>Situação: NÃO ATENDE / COM PENDÊNCIAS</b> — " + I.plural(sit.itens.length, "item aberto", "itens abertos") + " (ver seção 9). Enquanto não forem resolvidos e o cálculo refeito, este memorial não pode ser usado para execução.", "alerta");
    S.push(h);
    h = "<p>Cargas permanentes: peso próprio do MLC (aplicado pelo modelo) e telha com ripas " + br(P.telha.peso, 2) + " kN/m² sobre a área inclinada. Resultantes aplicadas (valores característicos, kN): G2 (telha) = <b>" + br(-(CT.G2 && CT.G2[1]), 2) + "</b>; sobrecarga de cobertura Q = <b>" + br(-(CT.Q && CT.Q[1]), 2) + "</b> (NBR 6120:2019, por m² de planta).</p>";
    if (res.QCOB) h += "<p class=\"eq\">Q<sub>cob</sub> = " + br(res.QCOB.q, 2) + " kN/m² × área em planta " + br((P.a + P.beiral.esq + P.beiral.dir) * (P.b + P.beiral.frente + P.beiral.fundo), 2) + " m² = " + br(res.QCOB.q * (P.a + P.beiral.esq + P.beiral.dir) * (P.b + P.beiral.frente + P.beiral.fundo), 2) + " kN.</p>";
    S.push(h);
    h = "";
    if (V.memoria) {
      h += "<p>V<sub>0</sub> = " + br(V.v0, 0) + " m/s; V<sub>k</sub> = V<sub>0</sub>·S<sub>1</sub>·S<sub>2</sub>·S<sub>3</sub> = " + br(V.vk, 1) + " m/s; q = 0,613·V<sub>k</sub>² = " + br(V.q, 0) + " N/m². Cobertura de <b>duas águas</b> (Tabela 5): duas zonas de pressão por água (junto à cumeeira/beiral e no restante) e a pressão sob o beiral a barlavento; casos ortogonais (4 direções × cpi) e abertura dominante como ação excepcional; vento oblíquo NÃO montado (a Tabela 5 não traz coeficientes oblíquos para duas águas). A soma das forças aplicadas nas barras (terças, frechais, caibros) foi conferida com a integral da pressão sobre a planta (ver T2-REFERENCIA.md).</p>";
      h += d.tab("Vento passo a passo (NBR 6123)", [I.thn("#"), "Passo", "Fórmula", "Valores", "Resultado"], arr(V.memoria).map(function (m, i) { return trw([td(String(i + 1), "n"), td(esc(m.passo)), td('<span class="eq">' + esc(m.formula) + "</span>"), td(esc(m.valores)), td(m.resultado != null ? esc(typeof m.resultado === "number" ? br(m.resultado, 3) : JSON.stringify(m.resultado)) : "")]); }), { classe: "compacta" });
      h += d.tab("Casos de vento considerados", [I.thn("Caso"), "Direção (°)", "cpi", "q (kN/m²)"], arr(V.casos).map(function (k) { return trw([td(esc(k.nome || k.id)), td(String(k.direcao), "n"), td(esc(k.cpi == null ? "" : (typeof k.cpi === "number" ? br(k.cpi, 2) : JSON.stringify(k.cpi)))), td(br(k.q, 3), "n")]); }), { classe: "compacta" });
    } else { h += caixa("<b>Não abrangido nesta emissão.</b> O resultado não traz a memória do vento.", "neutra"); d.naoAbrangido("memória do vento"); }
    S.push(h);
    S.push("<p>Combinações últimas normais e excepcionais (NBR 8681:2003): ΣγG·G + γQ·(Q1 + Σψ0·Qj), com o vento como variável principal ou secundária e a abertura dominante como ação excepcional (γ = 1,0). Foram verificadas <b>" + br(res.combinacoes, 0) + " combinações</b>. Vento oblíquo: NÃO montado (a Tabela 5 não traz coeficientes oblíquos para duas águas; ficam os 4 ortogonais × 2 cpi); torção por excentricidade (6.6) modelada como na T1 (M13); vergas de vidro e caibros secundários não são modelados.</p>");
    h = "<p>Análise de 2ª ordem em modelo espacial de barras: " + (res.sistema === "tesoura" ? inf.nCol + 1 + " tesouras tipo Pratt (banzos contínuos, montantes e diagonais rotulados), linhas longitudinais LB nos nós do banzo inferior, diagonais de madeira em X nas águas (painel a painel) e nos planos verticais entre tesouras (NBR 7190-1:2022, 6.6.2 a 6.6.4), " + (inf.nH * 2 - 1 + 2) + " linhas de terça/cumeeira" : "viga de cumeeira multiapoiada, caibros rotulados nos dois eixos na cumeeira e assento próprio no frechal (preso ao longo da parede e na vertical; livre transversalmente: sem empuxo)") + "; pilares engastados na base com mola de rotação (Kθ = " + br(obj(res.rigidezBase).Ktheta, 0) + " kN·m/rad, da ligação dimensionada); fita só-tração nas paredes.</p>";
    var av = arr(res.avisos).concat(arr(res.avisosAnalise)), avB = av.filter(function (a) { return clAv(a) === "bloqueante"; }), avP = av.filter(function (a) { return clAv(a) !== "bloqueante"; }), li = function (a) { return "<li>" + esc(typeof a === "string" ? a : JSON.stringify(a)) + "</li>"; };
    if (avB.length) h += caixa("<b>Avisos em aberto da análise (bloqueantes):</b><ul>" + avB.map(li).join("") + "</ul>", "alerta");
    if (avP.length) h += caixa("<b>Premissas adotadas na análise (informativas, ver seção 9):</b><ul>" + avP.map(li).join("") + "</ul>", "neutra");
    S.push(h);
    h = d.tab("Utilização η por grupo (NBR 7190-1:2022; η ≤ 1)", [I.thn("Grupo"), "Peças", "η máx.", "Situação"], Object.keys(res.grupos).map(function (g) { var e = res.grupos[g].eta; return trw([td(g, "n"), td(esc(NOME_G[g] || g)), td(br(e, 3), "n"), td(I.situ(e <= 1 + 1e-9))], e > 1 ? "linha-falha" : ""); }), {});
    var FM = res.flechasMm || {}, sg = function (v) { return (v >= 0 ? "+" : "−") + br(Math.abs(v), 2); };
    h += d.tab("Flechas e deslocamentos (η = deslocamento ÷ limite; sinal: + sobe, − desce)", [I.thn("Verificação"), "Deslocamento (mm)", "Limite (mm)", "η"], Object.keys(res.flechas || {}).map(function (k) {
      var f = FM[k], e = res.flechas[k], mmTxt = f && f.mm != null ? sg(f.mm) + (f.sentido ? " (" + (f.sentido === "sobe" ? "SOBE" : "DESCE") + ")" : "") : "—", limTxt = f && f.limite_mm != null ? br(f.limite_mm, 2) : "—";
      return trw([td(esc(k)), td(mmTxt, "n"), td(limTxt, "n"), td(br(e, 3), "n")], e > 1 + 1e-9 ? "linha-falha" : "");
    }), {});
    h += "<p>Em cada grupo, η = max(η de flexão composta, cisalhamento, compressão ⊥ às fibras e estabilidade) pela envoltória das combinações. Travamento inferior de terças/caibros = vão (ou metade do vão do caibro), a favor da segurança, até o RT definir os bloqueadores.</p>";
    S.push(h);
    h = "";
    Object.keys(L2.ligacoes).forEach(function (k) { var g = L2.ligacoes[k]; h += I.tabVerif(d, (NOME_L[k] || k) + " — " + (g.descricao || ""), arr(g.passos).length ? g.passos : [g.descricao || "sem passos"], g.eta, "lig"); });
    Object.keys(res.ligacoesT2.apoios90 || {}).forEach(function (k) { var g = res.ligacoesT2.apoios90[k]; h += I.tabVerif(d, (NOME_A90[k] || k) + " — " + (g.descricao || ""), arr(g.passos), g.eta, "lig"); });      /* apoios ⊥ às fibras (6.3.3, Tabela 6): uma linha de memorial por apoio */
    if (L.base) h += I.tabVerif(d, "LG01 — base em cruz: pinos", arr(L.base.passos), L.base.eta, "lig");
    if (L.base && L.base.cruz) h += I.tabVerif(d, "LG01 — base em cruz: distância à fenda da outra chapa", arr(L.base.cruz.passos), L.base.cruz.eta, "lig");
    if (L.base && L.base.chapa) h += I.tabVerif(d, "LG01 — chapa de aço da base", arr(L.base.chapa.passos), L.base.chapa.eta, "lig");
    if (L.placaBase) { var PB = L.placaBase; h += d.tab("Placa de base e chumbadores", [I.thn("Item"), "Valor"], [trw([td("Placa"), td(esc(PB.dimensoes_mm.join(" × ") + " × " + PB.espessura_mm + " mm"))]), trw([td("Chumbadores"), td(esc(PB.chumbadores.tipo) + " — " + br(PB.chumbadores.total, 0) + " un")]),
      trw([td("Flexão da placa"), td("η " + br(PB.flexao && PB.flexao.eta, 3))]), trw([td("Solda chapa–placa"), td(esc(PB.solda && PB.solda.tipo === "penetracao-total" ? "penetração total" : "filete") + " — η " + br(PB.solda && PB.solda.eta, 3))])].concat(arr(PB.passos).map(function (p) { return trw([td("Passo"), td(t(p, "lig"))]); })), {}); }
    arr(L2.avisos).concat(arr(L.avisos)).forEach(function (a) { h += clAv(a) === "bloqueante" ? caixa("<b>Aviso do motor:</b> " + esc(a), "alerta") : caixa("<b>Premissa adotada:</b> " + esc(a), "neutra"); });
    S.push(h);
    var rl = Object.keys(res.reacoes || {}), rr = res.reacoes || {};
    S.push(d.tab("Reações na base de cada pilar — valores de cálculo (kN; kN·m)", [I.thn("Base"), "Pilar", "N máx (compressão)", "N mín (tração < 0)", "H máx", "M máx"], rl.map(function (k) { var q = rr[k]; return trw([td(k, "n"), td(esc(q.mem || "")), td(br(q.Nmax, 2), "n"), td(br(q.Nmin, 2), "n"), td(br(q.Hmax, 2), "n"), td(br(q.Mmax, 2), "n")], q.Nmin < 0 ? "linha-alerta" : ""); }), {}));
    h = "";
    if (sit.itens.length) h += "<p>Itens abertos que BLOQUEIAM a emissão (todos precisam ser resolvidos antes):</p>" + d.tab("Pendências bloqueantes e reprovações", [I.thn("#"), "Tipo", "O que é", "Correção"], sit.itens.map(function (x, i) { return trw([td(String(i + 1), "n"), td(esc(x.tipo)), td(esc(x.texto)), td(esc(x.correcao || ""))], "linha-falha"); }), {});
    else h += "<p>Nenhuma pendência bloqueante, achado ou reprovação aberta.</p>";
    h += premissasHtml(sit);
    S.push(h);
    S.push("<p>Responsável técnico: " + I.ph(rp.abrev || rp.titulo, "TÍTULO") + " " + I.ph(rp.nome, "NOME DO RESPONSÁVEL TÉCNICO") + ", " + esc(rp.conselho || "CREA") + " nº " + I.ph(rp.crea, "Nº DO REGISTRO") + " — " + I.ph(rp.empresa, "EMPRESA") + ".</p>" + caixa("<b>" + FAIXA + ".</b>", "alerta") +
      '<div class="assin-grade"><div class="assin"><div class="assin-linha"></div><div><b>' + I.ph(rp.nome, "NOME") + '</b></div><div class="assin-tit">Responsável técnico</div></div></div><p class="local">' + I.ph(op.local || ob.cidade, "LOCAL") + ", " + esc(data) + ".</p>");
    var mx = Math.max.apply(null, Object.keys(res.grupos).map(function (g) { return res.grupos[g].eta; }));
    d.conferir("grupos", isFinite(mx), "η máximo dos grupos = " + br(mx, 3)); d.conferir("ligacoes", Object.keys(L2.ligacoes).length > 0, "ligações dos nós: " + Object.keys(L2.ligacoes).length); d.conferir("reacoes", rl.length > 0, "reações na base: " + rl.length);
    var corpo = SEC.map(function (s, i) { return '<section class="sec" id="sec-s' + (i + 1) + '"><h2><span class="num">' + (i + 1) + "</span>" + esc(s) + '<span class="de">seção ' + (i + 1) + " de " + SEC.length + " · " + esc(rev) + "</span></h2>" + S[i] + "</section>"; }).join("");
    var capa = '<section class="capa" id="sec-capa"><div class="capa-logos">' + I.logoBox(obj(op.logos).ra, "Projeto e cálculo", "RA Engenharia") + '</div><div class="capa-faixa"><span class="f1"></span><span class="f2"></span><span class="f3"></span></div><div class="capa-tit"><div class="sobre">MEMORIAL DE CÁLCULO</div><h1>Casa de duas águas em madeira engenharada — ' + esc(nome) + '</h1><div class="sub">Cargas, vento duas águas, combinações, análise, verificações, ligações e reações — opção ' + esc(res.opcao || "") + '</div></div><div class="capa-sit">' + esc(FAIXA) + "</div>" +
      '<table class="capa-ficha"><tbody><tr><td>Documento</td><td><b>' + I.ph(c.num, "Nº DO DOCUMENTO") + " " + esc(rev) + "</b> — " + esc(data) + "</td></tr><tr><td>Obra</td><td>" + I.ph(ob.nome, "OBRA") + "</td></tr><tr><td>Situação do cálculo</td><td" + (sit.atende ? "" : ' class="sit-falha"') + ">" + (sit.atende ? '<span class="ok">Atende</span>' : '<span class="falha">NÃO ATENDE — ' + I.plural(sit.itens.length, "item aberto", "itens abertos") + "</span>") + "</td></tr></tbody></table></section>";
    var titulo = "Memorial de cálculo — Casa de duas águas (T2) — " + nome, cssx = I.css(c) + "@page { @top-center { content: " + JSON.stringify(FAIXA) + "; font: 6.5pt sans-serif; color: #a3352b; } } .faixa { border: 0.8pt solid #a3352b; color: #a3352b; text-align: center; font-weight: 600; font-size: 8pt; padding: 1mm; margin-bottom: 3mm; }";
    var html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="generator" content="OrçaPRO — MadEngT2Doc"><title>' + esc(titulo) + "</title><style>" + cssx + '</style></head><body><div class="faixa" data-faixa="1">' + esc(FAIXA) + "</div>" + capa + corpo + "</body></html>";
    return { ok: true, html: html, titulo: titulo, secoes: SEC.map(function (s, i) { return { numero: i + 1, titulo: s }; }), tabelas: d.nTab, avisos: d.avisos.slice(), conferencias: d.conf.slice(), anexoInterno: "ANEXO INTERNO — valores de norma conferidos por fonte secundária; texto da norma paga não lido: conferir antes da emissão.", situacao: sit, naoAbrangidos: d.naoAbr.slice() };
  }

  /* ================================================================ MANUAL DE MONTAGEM */
  function camera(az, el) { var a = az * Math.PI / 180, e = el * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), ce = Math.cos(e), se = Math.sin(e); return function (P) { var x = P[0] * ca - P[1] * sa, y = P[0] * sa + P[1] * ca; return [x, -(P[2] * ce + y * se), y * ce - P[2] * se]; }; }
  function manual(res, op) {
    op = op || {};
    var Z = T2(); if (!Z || !MPE || !I) return { ok: false, html: "", avisos: ["js/madengt2pranchas.js não carregou."] };
    if (!res || !res.t2 || !arr(res.fonte && res.fonte.pecas).length) return { ok: false, html: "", etapas: [], paginas: 0, avisos: ["Resultado sem fonte de peças: sem manual."] };
    var ctx = Z.contexto(res), pcs = ctx.pcs, mk = ctx.marcas, sis = res.sistema, L2 = res.ligacoesT2.ligacoes, L = res.ligacoes;
    function g() { var gs = Array.prototype.slice.call(arguments); return pcs.filter(function (p) { return gs.indexOf(p.g) >= 0; }); }
    function tx(lista) { var o = {}; lista.forEach(function (p) { o[p.marca] = (o[p.marca] || 0) + 1; }); return Object.keys(o).sort().map(function (m) { return o[m] + " × " + m; }).join(", "); }
    var bases = ctx.pilares.map(function (p) { var l = L.placaBase.dimensoes_mm[0] / 1000, e = L.placaBase.espessura_mm / 1000; return { id: "BA", p0: [p.p0[0], p.p0[1], p.p0[2] - e], p1: [p.p0[0], p.p0[1], p.p0[2]], dl: [1, 0, 0], ext: [e, l, l], b: l, h: l }; });
    var fitas = ctx.fitas.filter(function (m) { return m.g === "FX" || m.g === "FP"; }), diag = g("DX", "DV", "DP"), temDX = diag.length > 0;
    var ET = [{ id: "bases", titulo: "Bases e chumbadores", pecas: bases, qtd: bases.length + " placas de base BA-01", frases: ["Confira chumbadores e nível das " + bases.length + " placas antes de chegar qualquer peça: a fundação é de outra empresa.", "Cada base leva placa " + L.placaBase.dimensoes_mm[0] + "×" + L.placaBase.dimensoes_mm[1] + "×" + L.placaBase.espessura_mm + " mm e " + L.placaBase.chumbadores.total + " chumbadores M20."] },
      { id: "pilares", titulo: "Pilares PL", pecas: g("P", "PO", "PC"), qtd: tx(g("P", "PO", "PC")), frases: ["Posicione os " + ctx.pilares.length + " pilares nas placas, no prumo nos dois planos, antes de apertar.", "A chapa em cruz da base entra nas fendas do pilar; fixe com os " + (2 * L.base.n) + " pinos inox Ø" + Math.round(L.base.d * 1000) + " por pilar (LG01)."] },
      { id: "frechais", titulo: sis === "tesoura" ? "Frechais FR" : "Frechais FR e viga de cumeeira CM", pecas: g("FR", "CM").filter(function (p) { return sis !== "tesoura" || p.g === "FR"; }), qtd: tx(g("FR", "CM").filter(function (p) { return sis !== "tesoura" || p.g === "FR"; })), frases: ["Apoie os frechais no topo dos pilares, no garfo (impede o rolamento), com os pinos da ligação CP-4/TS-5.", sis === "cumeeira" ? "Monte a viga de cumeeira sobre os pilares de cumeeira com chapa em T e garfo (CP-1); confira o vão máximo entre apoios." : "Confira o nível e o alinhamento dos frechais antes de içar as tesouras."] }];
    if (sis === "tesoura") ET.push({ id: "tesouras", titulo: "Tesouras BS, BI, PD e DG", pecas: g("BI", "BS", "PD", "DG"), qtd: tx(g("BI", "BS", "PD", "DG")), frases: ["Monte cada tesoura no chão: banzo inferior, banzos superiores, pendurais e diagonais, cada nó com chapa interna de 8 mm e pinos inox (TS-1 a TS-4).", "Içe as " + (res.t2.info.nCol + 1) + " tesouras uma a uma e fixe no topo dos pilares (TS-5); escore provisoriamente até a fita e as terças.", "Atenção: não corte nem fure as peças em obra."] }, { id: "tercas", titulo: "Terças TL e cumeeira CM", pecas: g("T", "CM"), qtd: tx(g("T", "CM")), frases: ["Apoie cada terça no banzo superior com " + (L2.tercaTesoura ? L2.tercaTesoura.porApoio : "") + " parafusos de rosca total WT-T 8,2×300 cruzados a 45 gr (TS-6).", "A terça de topo é a viga de cumeeira CM."] });
    else ET.push({ id: "caibros", titulo: "Caibros CB", pecas: g("CB"), qtd: tx(g("CB")), frases: ["Apoie os caibros no frechal pelo assento deslizante (chapa de apoio com folga transversal de 20 mm) e fixe na cumeeira com rosca total a 45 gr (CP-2, CP-3).", "Um caibro sobre cada pilar; confira o espaçamento do projeto.", "Atenção: o assento deslizante não pode ser travado transversalmente: a folga é o que evita empuxo na parede."] });
    ET.push({ id: "fita", titulo: temDX ? "Contraventamento: diagonais de madeira em X" : "Contraventamento: fita em X", pecas: temDX ? diag.concat(fitas) : fitas, qtd: temDX ? tx(diag) + (fitas.length ? "; " + fitas.length + " trechos de fita (TI-02 paredes)" : "") : fitas.length + " trechos (TI-01 águas, TI-02 paredes)", frases: temDX ? ["Fixe as diagonais de madeira DX em X no plano das águas (vãos extremos, painel a painel, de terça a terça) e DV nos planos verticais entre tesouras, cada ponta com chapa interna e pinos (CV-1).", "Monte as linhas longitudinais LB nos nós do banzo inferior antes de apertar as diagonais; não corte nem fure as peças em obra." + (diag.some(function (p) { return p.g === "DP"; }) ? " Nos painéis das paredes (mínimo de 2 por fachada), fixe as diagonais DP em X do pé do pilar ao frechal, cada ponta com chapa interna e pinos (CV-2)." : "") + (L2.fita ? " Nas paredes, estenda a fita 60×2,0 mm em X com " + L2.fita.parafusosPorPonta + " parafusos 5×50 por ponta e tensor." : "")] : ["Estenda a fita metálica perfurada 60×2,0 mm em X nas águas (vãos extremos) e nas paredes, com tensor.", "Cada ponta leva " + (L2.fita ? L2.fita.parafusosPorPonta : "") + " parafusos 5×50; estique o tensor depois de montar a cobertura."] },
      { id: "cobertura", titulo: "Lambri e telha", pecas: [], qtd: "telha " + n2(res.t2.params.telha.peso) + " kN/m² (ver E10)", frases: ["Instale o lambri e a ripa, de baixo para cima, e a telha a seguir, fixada nas ripas.", "Peso da telha adotado no cálculo: " + n2(res.t2.params.telha.peso) + " kN/m² com ripas; telha mais pesada exige recalcular."] });
    var f = camera(op.azimute != null ? op.azimute : -32, op.elevacao != null ? op.elevacao : 27), tudo = [];
    function cantos(p) { return MPE._p.I.caixaPeca(p).cantos; }
    pcs.forEach(function (p) { tudo = tudo.concat(cantos(p).map(f)); }); bases.forEach(function (p) { tudo = tudo.concat(cantos(p).map(f)); });
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; tudo.forEach(function (q) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); });
    var W = 1000, s = Math.min((W - 40) / (x1 - x0), (560 - 40) / (y1 - y0)), ox = 20 - x0 * s + ((W - 40) - (x1 - x0) * s) / 2, oy = 20 - y0 * s;
    function pts(p) { return p.map(function (q) { return n2(q[0]) + "," + n2(q[1]); }).join(" "); }
    function poli(p, cor, tipo) {
      if (p.g === "FX" || p.g === "FP") { var a = f(p.p0), b = f(p.p1); return '<line x1="' + n2(a[0] * s + ox) + '" y1="' + n2(a[1] * s + oy) + '" x2="' + n2(b[0] * s + ox) + '" y2="' + n2(b[1] * s + oy) + '" stroke="' + cor + '" stroke-width="1.4"/>'; }
      var pp = MPE._p.I.casco(cantos(p).map(function (q) { var gg = f(q); return [gg[0] * s + ox, gg[1] * s + oy]; }));
      return '<polygon points="' + pts(pp) + '" fill="' + cor + '" fill-opacity="' + (tipo === "etapa" ? "0.9" : "0.55") + '" stroke="#fff" stroke-width="0.5"/>';
    }
    function prof(p) { return f(p.p0)[2]; }
    var feitos = [], paginas = [], etapasOut = [];
    ET.forEach(function (e, i) {
      var corpo = "", ordem = feitos.map(function (p) { return { p: p, t: "montado" }; }).concat(e.pecas.map(function (p) { return { p: p, t: "etapa" }; }));
      ordem.sort(function (a, b) { return prof(b.p) - prof(a.p); });
      ordem.forEach(function (o) { corpo += poli(o.p, o.t === "etapa" ? (o.p.g === "FX" || o.p.g === "FP" ? "#3F7818" : "#00406A") : "#b8c0c8", o.t); });
      e.pecas.forEach(function (p) { feitos.push(p); });
      etapasOut.push({ id: e.id, titulo: e.titulo, pecas: e.pecas.length, n: i + 1 });
      paginas.push('<section class="pg"><div class="faixa">' + esc(FAIXA) + '</div><h2><span class="n">' + (i + 1) + "</span>" + esc(e.titulo) + '</h2><div class="cols"><svg viewBox="0 0 ' + W + ' 560" class="ill" data-etapa="' + e.id + '">' + corpo + '</svg><div class="tx"><p class="qtd"><b>Peças:</b> ' + esc(e.qtd || "") + "</p>" +
        e.frases.map(function (t0) { return "<p" + (/^Atenção/.test(t0) ? ' class="atencao"' : "") + ">" + esc(t0) + "</p>"; }).join("") + "</div></div></section>");
    });
    var nome = (op.obra && op.obra.nome) || "obra", rev = (op.documento && op.documento.revisao) || "R00";
    var capa = '<section class="pg capa"><div class="faixa">' + esc(FAIXA) + '</div><div class="sobre">MANUAL DE MONTAGEM</div><h1>Casa de duas águas em madeira engenharada — ' + esc(nome) + "</h1><p>Opção " + esc(res.opcao || "") + " · revisão " + esc(rev) + " · RA Engenharia</p></section>";
    var leia = '<section class="pg"><div class="faixa">' + esc(FAIXA) + '</div><h2>Como ler</h2><ul><li>Uma etapa por página, na ordem de montagem: bases, pilares, frechais/cumeeira, ' + (sis === "tesoura" ? "tesouras, terças" : "caibros") + ", contraventamento, lambri e telha.</li><li>Azul = peças da etapa; cinza = o que já está montado; verde = fita.</li><li>Cada ligação tem o detalhe na folha E06 das pranchas.</li></ul></section>";
    var tab = '<section class="pg"><div class="faixa">' + esc(FAIXA) + '</div><h2>Resumo das etapas</h2><table><tr><th>#</th><th>Etapa</th><th>Peças / quantidade</th></tr>' + ET.map(function (e, i) { return "<tr><td>" + (i + 1) + "</td><td>" + esc(e.titulo) + "</td><td>" + esc(e.qtd || "") + "</td></tr>"; }).join("") + "</table></section>";
    var css = "@page{size:A3 landscape;margin:12mm}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{margin:0;font:12pt/1.4 'Segoe UI',Arial,sans-serif;color:#1d2733}.pg{page-break-after:always;break-after:page;height:270mm;position:relative}.faixa{border:.8pt solid #a3352b;color:#a3352b;text-align:center;font-weight:600;font-size:8pt;padding:1mm;margin-bottom:4mm}h1{color:#00406A;font-size:30pt;margin:8mm 0 2mm}h2{color:#00406A;font-size:20pt;margin:0 0 4mm}h2 .n{display:inline-block;background:#00406A;color:#fff;border-radius:50%;width:11mm;height:11mm;text-align:center;line-height:11mm;margin-right:4mm}.cols{display:flex;gap:8mm}.ill{width:68%;height:auto}.tx{width:32%;font-size:13pt}.tx .atencao{color:#a3352b;font-weight:600}.qtd{background:#f3f6f9;padding:2mm;border-left:2mm solid #00406A}table{border-collapse:collapse;font-size:12pt}td,th{border:1px solid #ccd3da;padding:2mm 4mm;text-align:left}";
    var html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Manual de montagem — ' + esc(nome) + "</title><style>" + css + "</style></head><body>" + capa + leia + paginas.join("") + tab + "</body></html>";
    return { ok: true, html: html, paginas: 3 + paginas.length, etapas: etapasOut, avisos: [], marcas: mk.tab.length };
  }

  /* ================================================================ EXPORTAÇÕES */
  function ifc(res, opts) { opts = opts || {}; return SA().gerarIfc(T2().pecasMembros(res), { projeto: opts.projeto || (res.nomeOpcao || "Casa de duas águas"), opcao: res.opcao, semente: opts.semente, agora: opts.agora }); }
  function dae(res, opts) { return EX().gerarDae(T2().pecasMembros(res), opts || {}); }
  function cotacao(EJ, res, d) { d = d || {}; return SA().xlsxCotacao(EJ, { obra: d.obra, opcao: res.opcao, nome: res.nomeOpcao, pecas: res.fonte.pecas }); }
  var ETIQ = { P: "PILARES", PO: "PILARES_OITAO", PC: "PILARES_CUMEEIRA", FR: "FRECHAIS", BS: "BANZOS_SUPERIORES", BI: "BANZOS_INFERIORES", PD: "PENDURAIS", DG: "DIAGONAIS", T: "TERCAS", CM: "CUMEEIRA", CB: "CAIBROS" };
  /** CYPE 3D: um arquivo NUDOS/BARRAS por etiqueta (mesmo formato da T1) + séries/materiais + roteiro */
  function cype(res, opts) {
    opts = opts || {};
    var pm = T2().pecasMembros(res); if (!pm.length) return { ok: false, erro: "a fonte não tem peças com posição" };
    var pil = pm.filter(function (p) { return /^P/.test(p.g); }), X0 = Math.min.apply(null, pm.map(function (p) { return Math.min(p.p0[0], p.p1[0]); })), Y0 = Math.min.apply(null, pm.map(function (p) { return Math.min(p.p0[1], p.p1[1]); })), nos = {}, lista = [], cont = 0, arqs = {}, series = [];
    function noDe(P) { var k = [Math.round((P[0] - X0) * 1000), Math.round((P[1] - Y0) * 1000), Math.round(P[2] * 1000)].join("|"); if (!nos[k]) { nos[k] = { id: ++cont, c: [P[0] - X0, P[1] - Y0, P[2]] }; lista.push(nos[k]); } return nos[k].id; }
    Object.keys(ETIQ).forEach(function (gk) {
      var bs = pm.filter(function (p) { return p.g === gk; }); if (!bs.length) return;
      var ids = {}, barras = bs.map(function (p) { var a = noDe(p.p0), b = noDe(p.p1); ids[a] = 1; ids[b] = 1; return p.id.replace(/[^\w]/g, "_") + " " + a + " " + b; }), byId = {}; lista.forEach(function (n) { byId[n.id] = n; });
      var ns = Object.keys(ids).map(Number).sort(function (a, b) { return a - b; }), linhas = ["NUDOS"]; ns.forEach(function (i) { var c = byId[i].c; linhas.push(i + " X=" + c[0].toFixed(4) + " Y=" + c[1].toFixed(4) + " Z=" + c[2].toFixed(4)); });
      linhas.push("BARRAS"); barras.forEach(function (b) { linhas.push(b); });
      arqs["c3d_" + ETIQ[gk] + ".txt"] = { texto: linhas.join("\r\n") + "\r\n", latin1: true };
      var s0 = bs[0].secao; series.push([ETIQ[gk], bs.length, Math.round(s0.b * 100) + "x" + Math.round(s0.h * 100)]);
    });
    arqs["series_materiais.csv"] = { texto: ["etiqueta;barras;secao_cm;material_no_CYPE;classe_no_sistema"].concat(series.map(function (r) { return r.join(";") + ";MLC GL24h - escolher a madeira equivalente no CYPE;" + (res.secoes ? "MLC" : ""); })).join("\r\n") + "\r\n", latin1: true };
    var rl = Object.keys(res.reacoes || {}).map(function (k) { var q = res.reacoes[k]; return "- " + k + " (" + (q.mem || "") + "): N máx " + SA().br(q.Nmax, 1) + " kN · N mín " + SA().br(q.Nmin, 1) + " kN · H máx " + SA().br(q.Hmax, 1) + " kN · M máx " + SA().br(q.Mmax, 1) + " kN·m"; });
    arqs["ROTEIRO_CYPE.md"] = { texto: ["# Roteiro — " + ((opts.obra && opts.obra.nome) || "obra") + " (casa de duas águas, T2) no CYPE 3D", "", "Recurso exclusivo: reservar o CYPE na RA-Central (`travar`) antes e `destravar` depois (skill cype-motor).", "", "## 1. Geometria", "- Origem no menor X e Y; Z = cota. Unidades m / kN.", "- Geometria → Importar → Ficheiro de texto, um arquivo por etiqueta: " + Object.keys(arqs).filter(function (k) { return /^c3d_/.test(k); }).join(", ") + ".", "- " + lista.length + " nós.",
      "", "## 2. Séries e materiais", "- Ver `series_materiais.csv` (nomenclatura NBR 7190:1997 no CYPE; o sistema verifica pela 7190-1:2022: diferença de η é esperada).", "", "## 3. Apoios e liberações", "- Pilares engastados na base com mola de rotação (memorial); banzos e frechais contínuos; pendurais, diagonais e caibros rotulados; fita só tração.",
      "", "## 4. Cargas", "- Telha " + (res.t2 ? res.t2.params.telha.peso : "") + " kN/m² com ripas, sobrecarga e vento duas águas (ortogonal, abertura dominante, torção 6.6; oblíquo não montado): valores e combinações no memorial (seções 2 a 4).", "", "## 5. Depois de calcular", "- Comparar as reações na base com o sistema (esperado até 10 %):", rl.join("\n")].join("\n"), latin1: false };
    return { ok: true, arquivos: arqs, series: series, nos: lista.length, avisos: [] };
  }

  var MadEngT2Doc = { memorial: memorial, manual: manual, ifc: ifc, dae: dae, cype: cype, cotacao: cotacao, FAIXA: FAIXA };
  global.MadEngT2Doc = MadEngT2Doc;
  if (typeof module !== "undefined" && module.exports) module.exports = MadEngT2Doc;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
