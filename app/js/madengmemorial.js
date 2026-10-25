/* =====================================================================
 * madengmemorial.js — MEMORIAL DE CÁLCULO DA MADEIRA ENGENHARADA (E3). Motor PURO, ES5, sem DOM, Node-testável.
 * Mesma identidade e CSS do memorial padrão RA (js/madmemorial.js, reaproveitado por MadMemorial._i); conteúdo próprio:
 * cargas, vento (NBR 6123, oblíquo, beiral, abertura dominante), combinações, análise, verificações por grupo, flechas, ligações, reações, auditoria.
 * Cada verificação: fórmula → números → resultado (os "passos" do próprio motor). FONTE SECUNDÁRIA vai no ANEXO INTERNO (campo anexoInterno,
 * fora do corpo do documento — regra RA "memorial aprovável").
 *   MadEngMemorial.gerar(res, opcoes) → { ok, html, titulo, secoes, tabelas, avisos, conferencias, anexoInterno, situacao }
 *   opcoes = { obra {nome, endereco, cidade, proprietario, contratante}, documento {numero, revisao, data}, responsavel {nome, abrev, conselho, crea, empresa}, logos {ra}, nomeOpcao }
 * Teste: node tools/test-mad-eng-memorial.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } } return null; }
  var MM = dep("MadMemorial", "./madmemorial.js"), I = MM && MM._i;
  var SA = function () { return dep("MadEngSaidas", "./madengsaidas.js"); };
  var FAIXA = "Documento gerado pelo sistema — emissão somente após conferência e ART do responsável técnico";
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  var NOME_G = { T: "Terças", BL: "Bloqueadores", V: "Vigas V (altura variável)", ES: "Escoras", P: "Pilares", VG: "Vergas", TR: "Travessas", PD: "Pendurais" };
  var NOME_F = { tercaVao: "Terça, vão", tercaBalanco: "Terça, balanço", vigaV: "Viga V", vigaVBalanco: "Viga V, balanço", topoPilarVentoFreq_H300: "Topo do pilar, vento frequente (H/300)", vergaVentoFreq_L300: "Verga, vento frequente (L/300)", vergaVertical_20mm: "Verga, vertical (limite 20 mm)", vigaV_fragil_L500_15mm: "Viga V sobre o vidro, só variáveis (L/500 e 15 mm, item 8.2)", vergaFragil_L500_15mm: "Verga sobre o vidro, só variáveis (L/500 e 15 mm, item 8.2)" };

  function gerar(res, op) {
    op = op || {};
    if (!I) return { ok: false, motivo: "js/madmemorial.js não carregou.", html: "" };
    I.reset();
    if (!res || !res.ligacoes || !res.grupos) return { ok: false, motivo: "Resultado do cálculo incompleto: sem memorial.", html: "", secoes: [], tabelas: 0, avisos: [], conferencias: [] };
    var d = new I.Doc(), esc = I.esc, br = I.br, t = I.t, td = I.td, trw = I.trw, caixa = I.caixa, sit = SA() ? SA().situacao(res) : { atende: false, itens: [] };
    var ob = obj(op.obra), dc = obj(op.documento), rp = obj(op.responsavel), rev = dc.revisao || "R00", data = I.dataTxt(dc.data), nome = ob.nome || "[OBRA]";
    var c = { rp: rp, obraNome: nome, num: dc.numero || "", rev: rev };
    var M = obj(res.memoria), V = obj(M.vento), L = res.ligacoes, anexo = [];
    var SEC = ["Objeto e premissas", "Ações permanentes e variáveis", "Vento (NBR 6123)", "Combinações de ações", "Análise estrutural", "Verificações por grupo e flechas", "Ligações", "Reações para a fundação", "Auditoria e pendências", "Responsabilidade técnica"];
    var S = [];

    /* 1 objeto */
    var h = "<p>Este memorial apresenta o cálculo da estrutura de madeira engenharada (MLC) da obra <b>" + esc(nome) + "</b>, opção <b>" + esc(res.opcao || "") + "</b> — " + esc(res.nomeOpcao || op.nomeOpcao || "") + ". Cada verificação traz a expressão, os valores e o resultado.</p>";
    h += I.tabVerif ? "" : "";
    h += d.tab("Premissas de cálculo", [I.thn("Item"), "Valor"], [
      trw([td("Classe de resistência do MLC"), td(esc(M.classe || "mlc:GL24h"))]), trw([td("Classe de umidade"), td(esc(String(M.umidade || 3)))]), trw([td("Peso específico do MLC"), td(br(M.pesoMLC, 1) + " kN/m³")]),
      trw([td("Limite de flecha no vão / balanço"), td("L/" + br(M.limVao, 0) + " · L/" + br(M.limBalanco, 0))]), trw([td("Seções adotadas"), td(esc(JSON.stringify(res.secoes)))]),
      trw([td("Iterações de crescimento da seção"), td(br(res.iteracoes, 0))]), trw([td("Número de combinações verificadas"), td(br(res.combinacoes, 0))])], { classe: "ficha" });
    if (sit.atende) h += caixa("<b>Situação:</b> <span class=\"ok\">atende</span> — todas as verificações desta emissão atendem e não há achado nem aviso aberto.");
    else h += caixa("<b>Situação: NÃO ATENDE / COM PENDÊNCIAS</b> — " + I.plural(sit.itens.length, "item aberto", "itens abertos") + " (ver seção 9). Enquanto não forem resolvidos e o cálculo refeito, este memorial não pode ser usado para execução.", "erro");
    S.push(h);

    /* 2 ações */
    var cg = obj(M.cargas), tx = res.secoes.T ? res.secoes.T.b * res.secoes.T.h : null;
    h = "<p>Cargas permanentes: peso próprio do MLC (γ = " + br(M.pesoMLC, 1) + " kN/m³ × área da seção de cada peça, aplicado pelo modelo), telha " + br(cg.telha, 2) + " kN/m², lambri " + br(cg.lambriPeso, 1) + " kN/m³ × espessura, demais " + br(cg.outros, 2) + " kN/m².</p>";
    if (tx) h += "<p class=\"eq\">Exemplo — terça: g<sub>pp</sub> = γ · b · h = " + br(M.pesoMLC, 1) + " × " + br(res.secoes.T.b, 2) + " × " + br(res.secoes.T.h, 2) + " = " + br(M.pesoMLC * tx, 3) + " kN/m.</p>";
    h += "<p>Sobrecarga de cobertura e as demais ações variáveis são aplicadas conforme a NBR 6120:2019 pelo motor de cargas; o vento está na seção 3.</p>";
    S.push(h);

    /* 3 vento */
    h = "";
    if (V.memoria) {
      h += "<p>V<sub>0</sub> = " + br(V.v0, 0) + " m/s; V<sub>k</sub> = V<sub>0</sub>·S<sub>1</sub>·S<sub>2</sub>·S<sub>3</sub> = " + br(V.vk, 1) + " m/s; q = 0,613·V<sub>k</sub>² = " + br(V.q, 0) + " N/m². Casos ortogonais e <b>oblíquos (±45°)</b>, pressão <b>de beiral</b> a barlavento (+0,8·q por baixo) e <b>abertura dominante</b> (ação excepcional, γ = 1,0).</p>";
      h += d.tab("Vento passo a passo (NBR 6123)", [I.thn("#"), "Passo", "Fórmula", "Valores", "Resultado"], arr(V.memoria).map(function (m, i) {
        return trw([td(String(i + 1), "n"), td(esc(m.passo)), td('<span class="eq">' + esc(m.formula) + "</span>"), td(esc(m.valores)), td(m.resultado != null ? esc(typeof m.resultado === "number" ? br(m.resultado, 3) : JSON.stringify(m.resultado)) + " " + esc(m.unidade || "") : "")]);
      }), { classe: "compacta" });
      h += d.tab("Casos de vento considerados", [I.thn("Caso"), "Direção (°)", "cpi", "q (kN/m²)"], arr(V.casos).map(function (k) { return trw([td(esc(k.nome || k.id)), td(String(k.direcao), "n"), td(esc(k.cpi == null ? "" : (typeof k.cpi === "number" ? br(k.cpi, 2) : JSON.stringify(k.cpi))), "n"), td(br(k.q, 3), "n")]); }), { classe: "compacta" });
      arr(V.memoria).forEach(function (m) { if (m.referencia) anexo.push("Vento — " + m.passo + ": " + m.referencia); });
    } else h += I.caixa("<b>Não abrangido nesta emissão.</b> O resultado não traz a memória do vento.", "neutra"), d.naoAbrangido("memória do vento");
    S.push(h);

    /* 4 combinações */
    h = "<p>Combinações últimas normais e excepcionais (NBR 8681:2003): ΣγG·G + γQ·(Q1 + Σψ0·Qj) com o vento como variável principal ou secundária; abertura dominante como ação excepcional (γ = 1,0). Foram verificadas <b>" + br(res.combinacoes, 0) + " combinações</b>; k<sub>mod</sub> da combinação governante conforme a duração (vento: curta duração, umidade " + br(M.umidade || 3, 0) + " = " + br(L.cfg && L.cfg.kmod, 2) + "). Flechas pelas combinações quase permanentes e frequentes (φ, ψ2).</p>";
    S.push(h);

    /* 5 análise */
    h = "<p>Análise de 2ª ordem (P-Δ) em modelo espacial de barras: pilares com mola na base (rigidez de rotação adotada), topo rotulado na V; V de altura variável; " + br(res.nTercas, 0) + " terças contínuas; escoras e bloqueadores como barras; fita só-tração; verga, travessa e pendural. Deslocamento de topo: DZ = " + br(res.DZ, 0) + ".</p>";
    var avTodos = arr(res.avisos).concat(arr(res.avisosAnalise));
    if (avTodos.length) h += caixa("<b>Avisos da análise (N1, N5, M1, M4, M7, M13 e os do solver):</b><ul>" + avTodos.map(function (a) { return "<li>" + esc(typeof a === "string" ? a : JSON.stringify(a)) + "</li>"; }).join("") + "</ul>", "alerta");
    S.push(h);

    /* 6 verificações */
    h = d.tab("Utilização η por grupo (NBR 7190-1:2022; η ≤ 1)", [I.thn("Grupo"), "Peças", "η máx.", "Situação"], Object.keys(res.grupos).map(function (g) {
      var e = res.grupos[g].eta; return trw([td(g, "n"), td(esc(NOME_G[g] || g)), td(br(e, 3), "n"), td(I.situ(e <= 1 + 1e-9))], e > 1 ? "linha-falha" : "");
    }), {});
    var FM = res.flechasMm || {}, sg = function (v) { return (v >= 0 ? "+" : "−") + br(Math.abs(v), 2); };
    h += d.tab("Flechas e deslocamentos (η = deslocamento ÷ limite)", [I.thn("Verificação"), "Deslocamento (mm)", "Limite (mm)", "η"], Object.keys(res.flechas || {}).map(function (k) {
      var f = FM[k], e = res.flechas[k], mmTxt = f ? br(f.mm, 2) + (f.sentido ? " (" + (f.sentido === "sobe" ? "SOBE" : "DESCE") + ")" : "") : "—", limTxt = f ? br(f.limite_mm, 2) : "—";
      return trw([td(esc(NOME_F[k] || k)), td(mmTxt, "n"), td(limTxt, "n"), td(br(e, 3), "n")], e > 1 + 1e-9 ? "linha-falha" : "");
    }), {});
    if (FM.vigaVBalanco && arr(FM.vigaVBalanco.extremidades).length) h += "<p><b>Viga V em balanço — deslocamento final COM SINAL (+ = sobe), módulo comparado a L/" + br(M.limBalanco || 150, 0) + ":</b> " + arr(FM.vigaVBalanco.extremidades).filter(Boolean).map(function (x) { return "ponta " + x.ponta + " (balanço " + br(x.Lb, 2) + " m): de " + sg(x.baixo_mm) + " a " + sg(x.cima_mm) + " mm, limite " + br(x.limite_mm, 2) + " mm, η " + br(x.eta, 3); }).join("; ") + ". O nó que governa fica a " + br(FM.vigaVBalanco.balanco_m, 2) + " m do apoio (a regra L/150 vale em cada nó do balanço).</p>";
    h += "<p>Em cada grupo, η = max(η<sub>flexão composta</sub>, η<sub>cisalhamento</sub>, η<sub>compressão ⊥</sub>, η<sub>estabilidade</sub>) pela envoltória das combinações; o fator de seção variável da EN 14080 reduz o cisalhamento da V. Esforços de ligação (envoltória): " + esc(JSON.stringify(L.esforcos)) + ".</p>";
    var cf = res.contraflechaV;
    if (cf && cf.altura) {
      var al = cf.altura, e3 = function (x) { return br(x, 3); }, dsl = cf.deslocamentoLiquido, dss = cf.deslocamentoSem, sobe = dss && dss.mecanismo === "sobe";
      h += "<p><b>R21 — flecha da V em balanço, com sinal (NBR 7190-1:2022, 8.2 e Tabela 21).</b> Limite do deslocamento líquido em balanço, |δ<sub>net,fin</sub>| ≤ " + esc(cf.limiteFlecha || "L/150") + " (Tabela 21, p. 67 impressa / PDF 79: L/125 a L/175), verificado em MÓDULO nos dois sentidos (sobe e desce); sobrecarga em padrão (só onde piora). ";
      if (dss) h += "Sem contraflecha o que governa é a ponta " + esc(dss.ponta) + " <b>" + (sobe ? "SUBINDO" : "DESCENDO") + " " + br(Math.abs(dss.desloc_mm), 1) + " mm</b> (limite " + br(dss.limite_mm, 1) + " mm no nó a " + br(dss.balanco_m, 2) + " m do apoio; η " + e3(cf.etaSemContraflecha) + "). " + (sobe ? "A ponta SOBE pela rotação da V sobre o pilar: o vão principal cede sob as cargas permanentes e gira a V, e o balanço curto sobe quase como corpo rígido. Aumentar a rigidez da V no VÃO (altura entre o vidro e a telha, largura), a contraflecha no vão ou um apoio intermediário resolvem; reduzir o beiral não ajuda. " : "A ponta DESCE (balanço longo ou sobrecarga só no balanço): beiral menor, altura na ponta ou escora resolvem. ");
      h += "Passo 1 — altura na ponta: a V parte de " + br(al.inicial_m * 100, 0) + " cm na ponta do balanço e o cálculo pode subir até " + br(al.max_m * 100, 0) + " cm (altura máxima atrás da testeira/faixa da arquitetura, adotada pelo projeto, a validar pelo RT), em passos de 4 cm; adotado: <b>" + br(al.atual_m * 100, 0) + " cm</b> na ponta" + (al.cresceu ? " (subiu para fechar a flecha do balanço)" : "") + (al.inutil ? " (com a ponta SUBINDO, a altura na ponta não muda o resultado: não é usada)" : "") + " (alturas reais nas pontas: " + br(al.pontas_m[0] * 100, 1) + " e " + br(al.pontas_m[1] * 100, 1) + " cm). ";
      if (cf.aplicada) h += "Passo 2 — contraflecha de fábrica (item 8.2: ≤ 2/3 do deslocamento instantâneo das ações PERMANENTES; só compensa DESCIDA): " + (cf.vao && cf.vao.contraflecha_mm ? "no VÃO da V <b>" + cf.vao.contraflecha_mm + " mm</b> (wG,inst do vão = " + br(cf.vao.gInst_mm, 1) + " mm, limite 2/3 = " + br(cf.vao.limiteNorma_mm, 1) + " mm; como consequência a ponta sobe menos) " : "") + (arr(cf.pontas).some(function (p) { return p && p.contraflecha_mm > 0; }) ? "; na ponta que DESCE: A " + (cf.pontas[1] ? cf.pontas[1].contraflecha_mm : 0) + " mm, B " + (cf.pontas[0] ? cf.pontas[0].contraflecha_mm : 0) + " mm " : "") + "(arredondada para baixo ao mm). Deslocamento líquido: ponta " + esc(dsl.ponta) + " " + (dsl.mecanismo === "sobe" ? "sobe" : "desce") + " " + br(Math.abs(dsl.desloc_mm), 1) + " mm, η = <b>" + e3(cf.etaLiquida) + "</b> " + (cf.etaLiquida <= 1 ? "≤ 1" : "&gt; 1 (REPROVA)") + "." + (cf.excedeNorma ? " <b style=\"color:#b00000\">ATENÇÃO: contraflecha ACIMA do limite da norma (modo acimaNorma, escolha explícita); o RT precisa assumir o desvio.</b>" : "");
      else h += "Contraflecha de fábrica: <b>não necessária</b> — com a altura adotada, o deslocamento do balanço dá η = <b>" + e3(res.flechas && res.flechas.vigaVBalanco != null ? res.flechas.vigaVBalanco : cf.etaSemContraflecha) + "</b> ≤ 1 sem contraflecha (e a contraflecha, se fosse usada, só compensaria DESCIDA e ficaria limitada a 2/3 de wG,inst, item 8.2).";
      if (cf.recusa) h += " <b style=\"color:#b00000\">" + esc(cf.recusa) + "</b>";
      h += " Fonte da transcrição: NBR7190-2022_valores.json (item 8.2 e Tabela 21, p. 67 impressa / PDF 79; cópia de consulta, exemplar não licenciado).</p>";
    }
    if (res.fragil) {
      h += caixa("<b>Materiais frágeis (vidro) — NBR 7190-1:2022, 8.2, p. 67 impr. (PDF 79):</b> deslocamento instantâneo só das ações variáveis ≤ L/500 e ≤ 15 mm. V sobre o vidro: " + br(res.fragil.V.delta_mm, 1) + " mm de " + br(res.fragil.V.limite_mm, 1) + " mm (η " + br(res.fragil.V.eta, 3) + "); verga sobre o vidro: " + br(res.fragil.VG.delta_mm, 1) + " mm de " + br(res.fragil.VG.limite_mm, 1) + " mm (η " + br(res.fragil.VG.eta, 3) + "). Variáveis = sobrecarga de cobertura e vento (a principal inteira + ψ0 da outra, soma dos módulos).");
    }
    S.push(h);

    /* 7 ligações */
    h = "";
    var ORD = [["base", "LG01 — base em cruz: pinos"], ["topo", "LG02 — topo, pinos no pilar"], ["topoV", "LG02 — topo, pinos na V"], ["reforcoV", "LG11 — reforço Ft,90 na V"], ["apoioV", "LG02 — apoio da V no pilar"], ["tercaV", "LG06 — terça sobre a V"], ["escora", "LG10 — escora"], ["bloqueador", "LG03 — bloqueador"], ["verga", "LG03 — verga"], ["fita", "LG10 — fita"]];
    ORD.forEach(function (o) { var g = L[o[0]]; if (!g) return; h += I.tabVerif(d, o[1] + (g.especificacao ? " — " + g.especificacao : (g.nome ? " — " + g.nome : "")), arr(g.passos).length ? g.passos : [g.descricao || g.especificacao || "sem passos no resultado"], g.eta, "lig"); });
    if (L.base && L.base.cruz) h += I.tabVerif(d, "LG01 — base em cruz: distância à fenda da outra chapa", L.base.cruz.passos, L.base.cruz.eta, "lig");
    if (L.base && L.base.chapa) h += I.tabVerif(d, "LG01 — chapa de aço da base", L.base.chapa.passos, L.base.chapa.eta, "lig");
    if (L.placaBase) {
      var PB = L.placaBase, chv = PB.chumbadores.verificacao, fx = PB.flexao, sd = PB.solda;
      var etaTxt = function (e, ok) { return br(e, 3) + (ok === false || e > 1 + 1e-9 ? " — NÃO ATENDE" : " — atende"); };
      var linhasPB = [trw([td("Placa"), td(esc(PB.dimensoes_mm.join(" × ") + " × " + PB.espessura_mm + " mm"))]), trw([td("Chumbadores"), td(esc(PB.chumbadores.tipo) + " — " + br(PB.chumbadores.total, 0) + " un")]),
        trw([td("Tração por lado / Ft,Rd"), td(br(PB.chumbadores.Tlado_d, 1) + " kN / " + br(PB.chumbadores.Ft_Rd, 1) + " kN")])];
      if (chv) linhasPB.push(trw([td("Chumbador: tração, cortante, interação (NBR 8800 6.3.3)"), td(br(chv.tracao_por_chumbador, 1) + " kN (η " + br(chv.eta_tracao, 3) + "); " + br(chv.cortante_por_chumbador, 1) + " kN de " + br(PB.chumbadores.Fv_Rd, 1) + " kN (η " + br(chv.eta_cortante, 3) + "); interação linear η = " + etaTxt(chv.eta, chv.ok))]));
      if (fx) linhasPB.push(trw([td("Flexão da placa (NBR 8800 5.4)"), td("t = " + fx.espessura_mm + " mm; M tração = " + br(fx.M_tracao, 2) + " kN·m de " + br(fx.MRd_tracao, 2) + " (η " + br(fx.eta_tracao, 3) + "); compressão η " + br(fx.eta_compressao, 3) + " — " + etaTxt(fx.eta, fx.ok))]));
      if (sd) linhasPB.push(trw([td("Solda chapa–placa (NBR 8800 6.2.5)"), td(esc(sd.tipo === "penetracao-total" ? "penetração total" : "filete" + (sd.mw_mm ? " " + sd.mw_mm + " mm" : "")) + ", " + br(sd.nChapas, 0) + " chapas de " + br(sd.hp_mm, 0) + " mm — η " + etaTxt(sd.eta, sd.ok) + (sd.nota ? ". " + esc(sd.nota) : ""))]));
      if (PB.notaAcoZ) linhasPB.push(trw([td("Especificação do aço (N9)"), td(esc(PB.notaAcoZ))]));
      h += d.tab("Placa de base e chumbadores", [I.thn("Item"), "Valor"], linhasPB.concat(arr(PB.passos).map(function (p) { return trw([td("Passo"), td(t(p, "lig"))]); })), {});
    }
    if (L.verga && L.verga.excentricidade) h += caixa("<b>Verga — excentricidade da chapa em T (A8):</b> e = " + br(L.verga.excentricidade.e_m * 100, 1) + " cm, M = " + br(L.verga.excentricidade.M_kNm, 2) + " kN·m entra no grupo de pinos Ø12. " + esc(L.verga.excentricidade.nota || ""));
    if (L.verga && L.verga.naV) { var nv = L.verga.naV; h += caixa("<b>Verga → V, fendilhamento (N2):</b> modo " + esc(nv.modoF90 || "direto") + (nv.reforcoF90 ? " — reforço de rosca total: " + esc(typeof nv.reforcoF90 === "string" ? nv.reforcoF90 : JSON.stringify(nv.reforcoF90)) : "") + (L.verga.parafusosReforcoVerga ? " — " + br(L.verga.parafusosReforcoVerga, 0) + " parafuso(s) de reforço na verga" : "") + "."); }
    if (L.rigidezBase && L.rigidezBase.Ktheta) h += caixa("<b>Rigidez da base (N6):</b> Kθ = " + br(L.rigidezBase.Ktheta, 0) + " kN·m/rad, calculada pela ligação dimensionada (" + esc(L.rigidezBase.nota || "") + "; K_u = ⅔·K_ser, NBR 7190-1:2022, 7.1.12). " + esc(L.rigidezBase.declarado || ""));
    arr(L.notas).forEach(function (a) { h += caixa("<b>Nota de especificação:</b> " + esc(a), "alerta"); });
    arr(L.avisos).forEach(function (a) { h += caixa("<b>Aviso do motor:</b> " + esc(a), "alerta"); });
    S.push(h);

    /* 8 reações */
    var rl = Object.keys(res.reacoes || {}).sort();
    h = d.tab("Reações na base de cada pilar — valores de cálculo (kN; kN·m)", [I.thn("Base"), "N máx (compressão)", "N mín (tração < 0)", "H máx", "M máx"], rl.map(function (k) { var q = res.reacoes[k]; return trw([td(k, "n"), td(br(q.Nmax, 2), "n"), td(br(q.Nmin, 2), "n"), td(br(q.Hmax, 2), "n"), td(br(q.Mmax, 2), "n")]); }), { nota: "Base engastada; N < 0 é arrancamento — a fundação resiste à tração. Os mesmos valores constam do quadro da folha E01 das pranchas." });
    S.push(h);

    /* 9 auditoria */
    h = "";
    if (sit.itens.length) {
      h += "<p>Itens abertos (todos precisam ser resolvidos antes da emissão):</p>" + d.tab("Pendências, avisos e reprovações", [I.thn("#"), "Tipo", "O que é", "Correção"], sit.itens.map(function (x, i) { return trw([td(String(i + 1), "n"), td(esc(x.tipo)), td(esc(x.texto)), td(esc(x.correcao || ""))], "linha-falha"); }), {});
    } else h += "<p>Nenhuma pendência, aviso ou achado aberto.</p>";
    S.push(h);

    /* 10 termo */
    h = "<p>Responsável técnico: " + I.ph(rp.abrev || rp.titulo, "TÍTULO") + " " + I.ph(rp.nome, "NOME DO RESPONSÁVEL TÉCNICO") + ", " + esc(rp.conselho || "CREA") + " nº " + I.ph(rp.crea, "Nº DO REGISTRO") + " — " + I.ph(rp.empresa, "EMPRESA") + ".</p>" + caixa("<b>" + FAIXA + ".</b>", "alerta");
    h += '<div class="assin-grade"><div class="assin"><div class="assin-linha"></div><div><b>' + I.ph(rp.nome, "NOME") + '</b></div><div class="assin-tit">Responsável técnico</div></div></div><p class="local">' + I.ph(op.local || ob.cidade, "LOCAL") + ", " + esc(data) + ".</p>";
    S.push(h);

    /* conferências internas */
    var somaEta = Math.max.apply(null, Object.keys(res.grupos).map(function (g) { return res.grupos[g].eta; }));
    d.conferir("grupos", isFinite(somaEta), "η máximo dos grupos = " + br(somaEta, 3));
    d.conferir("ligacoes", L.verificacoes && L.verificacoes.length > 0, "verificações de ligação no resultado: " + (L.verificacoes || []).length);
    d.conferir("reacoes", rl.length > 0, "reações na base: " + rl.length);
    var corpo = SEC.map(function (s, i) { return '<section class="sec" id="sec-s' + (i + 1) + '"><h2><span class="num">' + (i + 1) + "</span>" + esc(s) + '<span class="de">seção ' + (i + 1) + " de " + SEC.length + " · " + esc(rev) + "</span></h2>" + S[i] + "</section>"; }).join("");
    var capa = '<section class="capa" id="sec-capa"><div class="capa-logos">' + I.logoBox(obj(op.logos).ra, "Projeto e cálculo", "RA Engenharia") + '</div><div class="capa-faixa"><span class="f1"></span><span class="f2"></span><span class="f3"></span></div>' +
      '<div class="capa-tit"><div class="sobre">MEMORIAL DE CÁLCULO</div><h1>Estrutura de madeira engenharada — ' + esc(nome) + '</h1><div class="sub">Cargas, vento, combinações, análise, verificações, ligações e reações — opção ' + esc(res.opcao || "") + '</div></div>' +
      '<div class="capa-sit">' + esc(FAIXA) + "</div>" +
      '<table class="capa-ficha"><tbody><tr><td>Documento</td><td><b>' + I.ph(c.num, "Nº DO DOCUMENTO") + " " + esc(rev) + "</b> — " + esc(data) + "</td></tr><tr><td>Obra</td><td>" + I.ph(ob.nome, "OBRA") + "</td></tr><tr><td>Situação do cálculo</td><td" + (sit.atende ? "" : ' class="sit-falha"') + ">" +
      (sit.atende ? '<span class="ok">Atende</span>' : '<span class="falha">NÃO ATENDE — ' + I.plural(sit.itens.length, "item aberto", "itens abertos") + "</span>") + "</td></tr></tbody></table></section>";
    var titulo = "Memorial de cálculo — Madeira engenharada — " + nome;
    var cssx = I.css(c) + "@page { @top-center { content: " + JSON.stringify(FAIXA) + "; font: 6.5pt sans-serif; color: #a3352b; } } .faixa { border: 0.8pt solid #a3352b; color: #a3352b; text-align: center; font-weight: 600; font-size: 8pt; padding: 1mm; margin-bottom: 3mm; }";
    var html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="generator" content="OrçaPRO — MadEngMemorial"><title>' + esc(titulo) + "</title><style>" + cssx + '</style></head><body><div class="faixa" data-faixa="1">' + esc(FAIXA) + "</div>" + capa + corpo + "</body></html>";
    var anexoTxt = "ANEXO INTERNO (fora do memorial) — fontes secundárias e conferências:\n" + anexo.concat(["Valores de norma (NBR 7190-1:2022, EN 14080, EN 1995-1-1): conferidos por fonte secundária; texto da norma paga não lido — conferir antes da emissão."]).join("\n");
    return { ok: true, html: html, titulo: titulo, secoes: SEC.map(function (s, i) { return { numero: i + 1, titulo: s }; }), tabelas: d.nTab, avisos: d.avisos.slice(), conferencias: d.conf.slice(), anexoInterno: anexoTxt, situacao: sit, naoAbrangidos: d.naoAbr.slice() };
  }
  var MadEngMemorial = { gerar: gerar, FAIXA: FAIXA };
  global.MadEngMemorial = MadEngMemorial;
  if (typeof module !== "undefined" && module.exports) module.exports = MadEngMemorial;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
