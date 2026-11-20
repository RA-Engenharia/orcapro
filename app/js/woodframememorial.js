/* =====================================================================
 * woodframememorial.js — MEMORIAL DE CÁLCULO DAS PAREDES WOOD FRAME (fase 2B). Motor PURO, ES5, sem DOM, Node-testável.
 * Mesma identidade, CSS e peças do memorial padrão da madeira (js/madmemorial.js, reaproveitado por MadMemorial._i — como o madengmemorial.js);
 * conteúdo próprio: premissas, cargas, vento, combinações, montante, verga, contraventamento, ligações e o que NÃO foi verificado.
 *   WoodFrameMemorial.gerar(calc, opcoes) → { ok, html, titulo, secoes, tabelas, avisos, conferencias, naoAbrangidos, preliminar }
 *   calc    = resultado do WoodFrameCalc.calcular (js/woodframecalc.js)
 *   opcoes  = { obra {nome, endereco, cidade, proprietario, contratante}, documento {numero, revisao, data}, responsavel {nome, abrev, conselho, crea, empresa}, logos {ra}, local }
 * REGRAS (as do memorial da madeira): nada inventado; sem η não há "OK"; número com vírgula e unidade; cada valor de norma com item e tabela;
 * PRELIMINAR (reprova ou premissa sem confirmação) vai na faixa do topo, na capa e na seção de situação.
 * Teste: node tools/test-woodframe-calc.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } } return null; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }

  var FAIXA_OK = "Documento gerado pelo sistema — emissão somente após conferência e ART do responsável técnico";

  function gerar(calc, op) {
    op = op || {};
    var MM = dep("MadMemorial", "./madmemorial.js"), I = MM && MM._i;
    if (!I) return { ok: false, motivo: "js/madmemorial.js não carregou.", html: "" };
    if (!calc || !calc.ok) return { ok: false, motivo: "Sem resultado do cálculo do Wood Frame: " + ((calc && calc.motivo) || "nada calculado") + ".", html: "", secoes: [], tabelas: 0, avisos: [], conferencias: [] };
    I.reset();
    var d = new I.Doc(), esc = I.esc, br = I.br, t = I.t, td = I.td, trw = I.trw, caixa = I.caixa, thn = I.thn, ph = I.ph, tabVerif = I.tabVerif;
    var ob = obj(op.obra), dc = obj(op.documento), rp = obj(op.responsavel), rev = dc.revisao || "R00", data = I.dataTxt(dc.data), nome = ob.nome || "[OBRA]";
    var c = { rp: rp, obraNome: nome, num: dc.numero || "", rev: rev };
    var prel = !!calc.preliminar, rs = obj(calc.resumo), ids = Object.keys(calc.paredes);
    var FAIXA = prel ? "PRELIMINAR — " + (rs.nReprovadas || rs.nSemSolucao ? "NÃO ATENDE — " : "PREMISSAS A CONFIRMAR PELO RT — ") + FAIXA_OK : FAIXA_OK;
    function eta3(v) { return br(v, 3); }
    function sit(ok) { return I.situ(ok); }
    function nTxt(v, c2, u) { return I.fin(v) ? br(v, c2) + " " + u : "—"; }
    var S = [], SEC = ["Objeto e situação", "Normas e premissas", "Materiais", "Ações: cargas, vento e combinações", "Montantes", "Vergas e ombreiras", "Contraventamento e ancoragem", "Ligações", "Seções calculadas × modelo", "O que NÃO foi verificado", "Responsabilidade técnica"];
    function L1(x) { return x.map(function (p) { return trw([td(String(p[0]), "n"), td(t(p[1]))]); }); }

    /* ---------------------------------------------------------------- 1 objeto e situação */
    var h = "<p>Este memorial apresenta o cálculo estrutural das paredes de <b>Wood Frame</b> (quadro leve de madeira) da obra <b>" + esc(nome) + "</b>, pela <b>" + esc(calc.norma) + "</b> (madeira), " +
      "com as ações da NBR 6120:2019 e da NBR 6123 e as combinações da NBR 8681:2003. Substitui a tabela de pré-dimensionamento de vergas do quadro (critério RA) por verificação de verdade, e liga o contraventamento por chapa de OSB (MadWoodFrame) ao quadro gerado pelo modelo.</p>";
    h += caixa(prel ? "<b>PRELIMINAR.</b> " + calc.motivosPreliminar.map(esc).join("; ") + ". Não emitir para execução antes de o RT confirmar as premissas (seção 2) e o modelo ser atualizado com as seções calculadas (seção 9)." :
      "Premissas confirmadas pelo RT e todas as verificações atendem.", prel ? "erro" : "");
    var linhas1 = ids.map(function (id) {
      var R = calc.paredes[id], mc = R.montante.calculado, mo = R.montante.modelo;
      return trw([td(esc(id)), td(esc(R.tipo)), td(nTxt(R.L, 2, "m") + " × " + nTxt(R.H, 2, "m")), td("38×" + mo.secao[1] + " c/ " + mo.espac + " — η " + eta3(mo.eta)), td(mc ? "38×" + mc.secao[1] + " c/ " + mc.espac + " — η " + eta3(mc.eta) : "—"), td(eta3(R.eta), "n"), td(sit(!R.reprovaModelo && !R.semSolucao))]);
    });
    h += d.tab("Resumo por parede (η = esforço de cálculo ÷ resistência de cálculo; atende com η ≤ 1,000)", ["Parede", "Tipo", "Comp. × alt.", "Montante do modelo", "Montante calculado", thn("η máx."), "Modelo atende?"], linhas1,
      { nota: "η máx. = o maior entre montante calculado, ligação do montante, contraventamento e ancoragem. 'Modelo atende?' compara a seção/espaçamento/prego do MODELO com o calculado." });
    S.push(h);

    /* ---------------------------------------------------------------- 2 normas e premissas */
    h = d.tab("Normas e fontes", ["Norma", "Uso neste cálculo"], [
      trw([td("ABNT NBR 7190-1:2022"), td("Madeira: classes e propriedades (5.7.1, Tab. 3), kmod (5.8.4, Tab. 4 e 5), γw (5.8.5), E (5.8.7), compressão normal (6.3.3, Tab. 6), vão teórico (6.3.4), flexocompressão (6.3.7), cisalhamento (6.4), estabilidade (6.5), ligações (7.1 e 7.2, Tab. 13 e 18), flecha (8.1 e 8.2, Tab. 20 e 21).")]),
      trw([td("ABNT NBR 6120:2019"), td("Peso das camadas (Tab. 1) e sobrecarga de cobertura (6.4).")]),
      trw([td("ABNT NBR 6123 (" + esc(obj(calc.vento).edicao || "1988") + ")"), td("Vento: V0, S1, S2, S3, pressão dinâmica, coeficientes de pressão das paredes (Tab. 4) e das águas (Tab. 5) e pressão interna — pelo AcoVento.")]),
      trw([td("ABNT NBR 8681:2003"), td("Combinações últimas e coeficientes γ e ψ (a edição 8681:2025 está vigente e não foi conferida).")]),
      trw([td("EN 1995-1-1:2004"), td("Painel pregado (9.2.4.2) e embutimento do prego na chapa (8.3.1.1) — a NBR 7190-1:2022 6.2.5 declara que suas expressões não valem para OSB/compensado.")])
    ].map(function (x) { return x; }), {});
    h += d.tab("Decisões técnicas adotadas (RT)", ["Tema", "Decisão", "Base"], [
      trw([td("Compressão normal às fibras"), td("fc90,d = 0,25·fc0,d·αn, com αn = " + br(obj(calc.opc).alfaN || 1.4, 2) + " (a' = 3,8 cm ≤ 4 cm: a favor). Vale para o montante na guia inferior, a verga sobre a ombreira, o montante de ponta e a arruela do chumbador."), td("NBR 7190-1:2022 6.3.3 e Tab. 6")]),
      trw([td("Classe de umidade"), td("Classe " + esc(String(obj(calc.opc).umidade)) + " para parede protegida (externa com revestimento ventilado), kmod2 " + (obj(calc.opc).umidade === 2 ? "0,90" : "0,80") + "; a classe 3 (kmod2 0,80) fica como opção."), td("NBR 7190-1:2022 5.5 (Tab. 1) e 5.8.4.2 (Tab. 5)")]),
      trw([td("Classe de resistência"), td("Pinus autoclavado C24 CONDICIONADA ao certificado de classificação do lote entregue (classificação visual/mecânica, NBR 7190-2): sem o certificado a classe adotada não vale e o cálculo deve ser refeito com a classe certificada."), td("NBR 7190-1:2022 5.7.1, Tab. 3")]),
      trw([td("Painel de OSB pregado"), td("Resistência e rigidez do painel pelo EN 1995-1-1 (9.2.4.2 e 8.3.1.1) como REFERÊNCIA COMPLEMENTAR; kmod e γlig da NBR 7190-1:2022 aplicados. Premissa para o RT confirmar."), td("EN 1995-1-1:2004; NBR 7190-1:2022 6.2.5 e 7.1.2")]),
      trw([td("Distribuição do vento entre as linhas"), td("Envoltória: para cada linha vale o MAIOR entre o diafragma rígido (∝ rigidez) e o flexível (∝ área de influência); com duas linhas o flexível dá 50 %/50 %."), td("Premissa RA")]),
      trw([td("Força no topo das paredes contraventantes"), td("Metade da altura das paredes + triângulo do oitão + componente horizontal das águas; a base (chumbadores) leva a altura inteira."), td("NBR 6123 Tab. 4 e 5")]),
      trw([td("Revestimento frágil"), td("Classificação explícita (automática: gesso, cimentícia e siding são frágeis). Frágil: flecha do vento ≤ mín(L/500; 15 mm); não frágil: L/300. O memorial mostra η nos dois limites."), td("NBR 7190-1:2022 8.2 e Tab. 21")])
    ]);
    var pr = calc.premissas.map(function (p, i) { return trw([td(String(i + 1), "n"), td(esc(p.id)), td(t(p.texto) + (p.fonte ? " <i>(" + t(p.fonte) + ")</i>" : "")), td(p.confirmada ? '<span class="ok">confirmada</span>' : '<span class="falha">RT CONFIRMA</span>')], p.confirmada ? "" : ""); });
    h += d.tab("Premissas adotadas (o que o repositório e a biblioteca de normas não trazem fica aqui, declarado, até o RT confirmar)", [thn("#"), "Código", "Premissa", "Situação"], pr, { vazio: "Nenhuma premissa." });
    S.push(h);

    /* ---------------------------------------------------------------- 3 materiais */
    var cl = calc.classe, pf = calc.combinacoes;
    h = d.tab("Madeira (Pinus autoclavado, classe " + esc(String(cl.id).replace("peca:", "")) + ")", ["Propriedade", "Valor", "Fonte"], [
      trw([td("fc0,k"), td(nTxt(cl.fc0k, 1, "MPa")), td("NBR 7190-1:2022 5.7.1, Tab. 3")]), trw([td("fm,k"), td(nTxt(cl.fmk, 1, "MPa")), td("Tab. 3")]), trw([td("fv,k"), td(nTxt(cl.fvk, 1, "MPa")), td("Tab. 3")]),
      trw([td("fc90,k"), td(nTxt(cl.fc90k, 1, "MPa")), td("Tab. 3 (informativo: a verificação adota fc90,d = 0,25·fc0,d·αn, 6.3.3 e Tab. 6)")]), trw([td("E0,med"), td(nTxt(cl.Ec0m, 0, "MPa")), td("Tab. 3; E0,med no ELS (5.8.7)")]),
      trw([td("E0,05"), td(nTxt(cl.E005, 0, "MPa")), td("Tab. 3; E0,05 na estabilidade (5.8.7)")]), trw([td("ρk / ρm"), td(nTxt(cl.rhok, 0, "kg/m³") + " / " + nTxt(cl.rhom, 0, "kg/m³")), td("Tab. 3; ρk também na ligação (6.2.5)")]),
      trw([td("γw"), td("1,4 (tensões normais) · 1,8 (cisalhamento) · 1,0 (ELS)"), td("5.8.5")]),
      trw([td("kmod"), td("kmod = kmod1·kmod2 (5.8.4); kmod1 pela variável principal; classe de umidade " + esc(String(obj(calc.opc).umidade))), td("Tab. 4 e Tab. 5")])
    ], { nota: "A classe C24 é premissa herdada do MadWoodFrame; o catálogo Nibra não informa classe de resistência (seção 2)." });
    S.push(h);

    /* ---------------------------------------------------------------- 4 ações */
    h = "";
    var gm = obj(calc.geometria);
    h += "<p>Planta de referência: " + nTxt(gm.a, 2, "m") + " (ao longo da cumeeira, eixo " + esc(gm.eixoCumeeira || "") + ") × " + nTxt(gm.b, 2, "m") + " (vão), altura do beiral " + nTxt(gm.hBeiral, 2, "m") + ".</p>";
    var pcL = [];
    ids.forEach(function (id) { var R = calc.paredes[id]; R.pesoParede.itens.forEach(function (it, k) { pcL.push(trw([td(k === 0 ? esc(id) : ""), td(t(it.rotulo)), td(br(it.kNm2, 3)), td(t(it.fonte || ""))])); }); pcL.push(trw([td(""), td("<b>Total (kN/m²)</b>"), td("<b>" + br(R.pesoParede.total, 3) + "</b>"), td("× altura " + br(R.H, 2) + " m = " + br(R.cargas.pesoParedeTopo, 2) + " kN/m")], "tot")); });
    h += d.tab("Peso próprio das camadas e do quadro por parede (kN/m² de parede)", ["Parede", "Camada", thn("kN/m²"), "Fonte / premissa"], pcL, { nota: "Lã, membranas, ripa da câmara e impermeabilização: peso desprezado (premissa 'peso-desprezado')." });
    var cg = ids.map(function (id) { var R = calc.paredes[id], cc = R.cargas; return trw([td(esc(id)), td(br(cc.tribCob, 2) + " m"), td(br(cc.Gcob, 2)), td(br(cc.Sc, 2)), td(br(cc.Upl, 2)), td(R.vento.aplicavel ? br(R.vento.pv, 3) : "—")]); });
    h += d.tab("Cargas lineares no topo da parede (kN/m, características) e vento na face", ["Parede", "Largura de influência", thn("G cobertura + forro"), thn("Sc"), thn("Sucção (arranc.)"), thn("pv (kN/m²)")], cg,
      { nota: "Largura de influência da cobertura = meia distância entre as linhas de apoio paralelas à cumeeira + beiral (premissa 'apoio-cobertura'). G inclui telha, trama e forro por m² de planta" + (calc.cobertura ? " (" + t(calc.cobertura.fonte) + ")" : " — cobertura NÃO informada") + "; sobrecarga NBR 6120:2019 6.4." });
    var v = obj(calc.vento);
    if (v.ok) {
      h += d.tab("Vento — NBR 6123 (" + esc(v.edicao || "") + ")", ["Item", "Valor"], [
        trw([td("V0 (Figura 1)"), td(nTxt(v.v0, 0, "m/s"))]), trw([td("S1, S2, S3"), td(br(obj(v.s1).valor, 2) + " · " + br(v.s2, 3) + " · " + br(v.s3, 2) + " (categoria " + esc(String(v.categoria)) + ", grupo " + esc(String(v.grupoS3)) + ")")]),
        trw([td("Vk e q"), td(nTxt(v.vk, 1, "m/s") + " · " + nTxt(v.q, 3, "kN/m²"))]), trw([td("Pressão na face (envolvente, |p| máx.)"), td("lateral " + nTxt(obj(v.pFace).lateral, 3, "kN/m²") + " · oitão " + nTxt(obj(v.pFace).oitao, 3, "kN/m²"))]),
        trw([td("Sucção máxima da cobertura"), td(nTxt(v.succaoCobertura, 3, "kN/m²"))]),
        trw([td("Força horizontal característica"), td("ao longo da cumeeira " + nTxt(obj(v.F).ridge, 2, "kN") + " (" + esc(v.casoRidge || "") + ") · através " + nTxt(obj(v.F).across, 2, "kN") + " (" + esc(v.casoAcross || "") + ")")])
      ], { nota: "Força = paredes de barlavento e sotavento + componente horizontal das águas (p·A·tg θ), no pior caso de pressão interna. Memória completa do AcoVento: " + arr(v.memoria).length + " passos guardados no resultado." });
    } else h += caixa("<b>Vento NÃO calculado:</b> " + t(v.motivo || "sem dados") + ". As verificações dependentes do vento não foram feitas.", "erro");
    h += d.tab("Combinações últimas (NBR 8681:2003; classe de carregamento pela variável principal, NBR 7190-1:2022 5.8.4.1)", ["Id", "Combinação", "Classe", thn("kmod")], pf.map(function (x) { return trw([td(esc(x.id)), td(t(x.txt)), td(esc(x.car)), td(br(x.kmod, 3))]); }), { nota: "ELS: flecha instantânea pelo vento com a combinação rara (8.1) e E0,med (5.8.7)." });
    S.push(h);

    /* ---------------------------------------------------------------- 5 montantes */
    h = "<p>Cada montante de campo é uma barra biapoiada entre as guias, com flexocompressão (compressão axial da cobertura, do forro e do peso próprio mais a flexão do vento na face), estabilidade nos dois eixos (eixo fraco travado pelo OSB pregado e pelos bloqueadores), compressão normal às fibras na guia inferior (NBR 7190-1:2022 6.3.3) e flecha pelo vento (8.2, Tab. 21). Se a seção do modelo reprova, o cálculo cresce a seção ou reduz o espaçamento, o que gastar menos madeira, só com as seções do catálogo Nibra.</p>";
    ids.forEach(function (id) {
      var R = calc.paredes[id], mo = R.montante.modelo, mc = R.montante.calculado;
      h += I.h3("5." + (ids.indexOf(id) + 1), "Parede " + esc(id) + " — " + esc(R.tipo));
      h += d.tab("Montante da parede " + esc(id) + ": modelo × calculado", ["", "Seção e espaçamento", thn("η"), "Governa", "Situação"], [
        trw([td("Modelo"), td("38×" + mo.secao[1] + " c/ " + mo.espac + " mm"), td(eta3(mo.eta), "n"), td(t(mo.v.governa)), td(sit(mo.ok))]),
        trw([td("Calculado"), td(mc ? "38×" + mc.secao[1] + " c/ " + mc.espac + " mm (compra " + esc(String(mc.compra || "—")).replace("x", "×") + ")" : "NENHUM do catálogo atende"), td(mc ? eta3(mc.eta) : "—", "n"), td(mc ? t(mc.v.governa) : "—"), td(sit(!!mc))])
      ], { nota: "Comprimento entre guias " + br(R.montante.hMont, 3) + " m; travamento do eixo fraco " + br(R.montante.travamentoFraco, 3) + " m; faixa de influência " + br(R.montante.trib, 2) + " m." });
      var V = (mc || mo).v;
      V.combos.forEach(function (cb) {
        if (cb.id !== V.combos.reduce(function (a, b) { return b.eta > a.eta ? b : a; }).id) return;
        h += tabVerif(d, "Montante " + esc(id) + " — combinação governante " + esc(cb.id) + " (" + t(cb.nome) + "): N = " + br(cb.N, 2) + " kN, M = " + br(cb.M, 3) + " kN·m, V = " + br(cb.V, 2) + " kN", cb.passos, cb.eta, "montante " + id);
      });
      h += d.tab("Montante " + esc(id) + " — todas as combinações", ["Combinação", thn("kmod"), thn("N (kN)"), thn("M (kN·m)"), thn("η"), "Governa"], V.combos.map(function (cb) { return trw([td(esc(cb.id) + " — " + t(cb.nome)), td(br(cb.kmod, 3)), td(br(cb.N, 2)), td(br(cb.M, 3)), td(eta3(cb.eta)), td(t(cb.governa))]); }));
      h += tabVerif(d, "Montante " + esc(id) + " — flecha pelo vento (ELS)", V.els.passos, V.els.eta, "montante " + id);
      h += d.tab("Flecha do vento de " + esc(id) + " nos dois limites (revestimento " + (V.els.fragil ? "classificado como FRÁGIL" : "classificado como NÃO frágil") + ")", ["Limite", thn("Valor (mm)"), thn("δ (mm)"), thn("η"), "Adotado"], [
        trw([td("Frágil: mín(L/500; 15 mm) — 8.2"), td(br(V.els.limFragil, 2)), td(br(V.els.delta, 2)), td(eta3(V.els.etaFragil)), td(V.els.fragil ? "<b>sim</b>" : "")]),
        trw([td("Não frágil: L/300 — Tab. 21"), td(br(V.els.limNaoFragil, 2)), td(br(V.els.delta, 2)), td(eta3(V.els.etaNaoFragil)), td(V.els.fragil ? "" : "<b>sim</b>")])
      ]);
      if (V.apoio && V.apoio.id) h += "<p class=\"nota\">Compressão normal à guia inferior: σc90 = " + br(V.apoio.sig, 3) + " MPa ≤ " + br(V.apoio.lim, 3) + " MPa (fc90,d = 0,25·fc0,d·αn, 6.3.3) → η = " + eta3(V.apoio.eta) + " (combinação " + esc(V.apoio.id) + ").</p>";
    });
    S.push(h);

    /* ---------------------------------------------------------------- 6 vergas */
    h = "<p>A verga é dupla (2 peças de 38 mm, com espaçador), biapoiada nos jacks, com a carga REAL de cima: cobertura, forro, pavimento e o peso da parede acima do vão. A tabela do quadro (WoodFrameQuadro.VERGAS) é só a seção de partida. Verifica-se flexão, cisalhamento e flecha final (vão teórico, 6.3.4), o apoio na ombreira (compressão normal às fibras, 6.3.3), o jack (compressão com estabilidade) e a flecha instantânea da sobrecarga (8.2).</p>";
    var algum = false;
    ids.forEach(function (id) {
      var R = calc.paredes[id];
      R.vergas.forEach(function (vg) {
        algum = true;
        var cc = vg.calculada, tb = vg.tabela;
        h += I.h3("6." + (ids.indexOf(id) + 1), "Parede " + esc(id) + " — vão " + esc(String(vg.vao)) + " (livre " + br(vg.vaoLivre, 2) + " m)");
        h += d.tab("Verga do vão " + esc(String(vg.vao)) + ": tabela do modelo × calculada", ["", "Seção", thn("η"), "Governa", "Situação"], [
          trw([td("Tabela do modelo"), td(vg.pecas + "×38×" + tb.secao[1]), td(eta3(tb.eta), "n"), td(t(tb.v.governa)), td(sit(tb.ok && tb.v.apoioOk))]),
          trw([td("Calculada"), td(vg.pecas + "×38×" + cc.secao[1] + " (compra " + esc(String(cc.compra || "—")).replace("x", "×") + "); " + vg.jacks + " jack(s) por lado"), td(eta3(cc.eta), "n"), td(t(cc.v.governa)), td(sit(cc.ok && cc.cabe))])
        ], { nota: "Espaço livre sob a guia: " + br(vg.disponivel * 1000, 0) + " mm" + (cc.cabe ? "" : " — a verga calculada NÃO cabe") + ". Carga linear: G = " + br(cc.v.qG, 2) + " kN/m; Sc = " + br(cc.v.qQ, 2) + " kN/m. Rei: " + (arr(R.reis).filter(function (r) { return String(r.vao) === String(vg.vao); }).map(function (r) { return r.nReis + " montante(s) rei, η " + (r.eta == null ? "—" : eta3(r.eta)); })[0] || "—") + "." });
        h += tabVerif(d, "Verga " + esc(String(vg.vao)) + " (calculada) — passo a passo", cc.v.passos, cc.eta, "verga " + vg.vao);
      });
    });
    if (!algum) h += "<p>Nenhum vão nas paredes de Wood Frame deste modelo.</p>";
    S.push(h);

    /* ---------------------------------------------------------------- 7 contraventamento */
    h = "<p>O vento horizontal é dividido entre as <b>linhas de parede</b> pela rigidez (MadWoodFrame: painel de OSB pregado girando sobre o perímetro, com 50 % de redução; diafragma rígido, sem torção) e cada painel é verificado pelo EN 1995-1-1 9.2.4.2 (só trechos de altura inteira com largura ≥ h/4). Vd = γq·F; Fv,Rd = Σ Ff,Rd·b·c/s com Ff,Rd = kmod·Fv,Rk/γlig (7.1.2, γlig = 1,4). O espaçamento do prego de borda é escolhido entre " + (calc.opc && calc.opc.prego ? "" : "") + "150, 100, 75 e 50 mm; o hold-down sai do tombamento de cada trecho: T = M/braço − metade do peso (a favor: 1,0G − 1,4 da sucção); C = M/braço + gravidade da faixa do montante de ponta.</p>";
    if (arr(calc.linhas).length) {
      h += d.tab("Distribuição do vento entre as linhas de parede", ["Linha", "Direção", "Paredes", thn("Rigidez (kN/m)"), thn("F rígido (kN)"), thn("F flexível (kN)"), "Vale", thn("F,k (kN)"), thn("Vd (kN)")], calc.linhas.map(function (l) { return trw([td(esc(l.id)), td(esc(l.nome)), td(l.paredes.map(esc).join(", ")), td(br(l.K_kN_m, 1)), td(br(l.Fk_rigido_kN, 2)), td(br(l.Fk_flexivel_kN, 2)), td(esc(l.criterio)), td(br(l.Fk_kN, 2)), td(br(l.Fd_kN, 2))]); }), { nota: "Envoltória: vale o maior entre o diafragma rígido e o flexível (área de influência = faixa entre os pontos médios das linhas e as bordas da planta). F,k é a força no TOPO: meia altura das paredes + triângulo do oitão + componente das águas." });
    }
    ids.forEach(function (id) {
      var R = calc.paredes[id], cv = R.contraventamento;
      if (!cv || !cv.contribui) { h += "<p class=\"nota\">Parede " + esc(id) + ": não contraventa (" + t(cv && cv.motivo || "sem OSB") + ").</p>"; return; }
      h += I.h3("7." + (ids.indexOf(id) + 1), "Parede " + esc(id) + " — painel de OSB, hold-down e base");
      h += d.tab("Prego de borda do OSB — " + esc(id) + " (" + esc(cv.pregoBorda.prego.nome) + ")", ["Espaçamento", thn("Fv,Rd (kN)"), thn("η"), "Situação"], cv.pregoBorda.tentativas.map(function (x) {
        return trw([td(x.s + " mm" + (x.s === cv.pregoBorda.s ? " (adotado)" : "") + (x.s === cv.espModelo ? " (modelo)" : "")), td(br(x.FvRd, 2)), td(eta3(x.eta)), td(sit(x.eta <= 1 + 1e-9))]);
      }), { nota: "Vd da parede = " + br(cv.Vd, 2) + " kN (F,k = " + br(cv.Fk, 2) + " kN × 1,4); rigidez " + br(cv.K, 1) + " kN/m. Fv,Rk do prego por Johansen (EN 1995-1-1 8.2.2) com embutimento da chapa pelo EN 1995-1-1 8.3.1.1 — premissa 'pregos-osb'." });
      h += d.tab("Trechos de altura inteira de " + esc(id) + ": cortante, hold-down e compressão", ["Trecho (m)", thn("b (m)"), thn("V (kN)"), thn("η V"), thn("T hold-down (kN)"), thn("C (kN)"), "Montantes de ponta (modelo → necessários)", thn("η compressão"), thn("Chumb.")],
        cv.trechos.map(function (tr) { return trw([td(br(tr.de, 2) + " a " + br(tr.ate, 2)), td(br(tr.b, 2)), td(br(tr.V, 2)), td(eta3(tr.etaV)), td(tr.hd ? "<b>" + br(tr.T, 2) + "</b>" : "—"), td(br(tr.C, 2)), td(tr.nEnd.join(" / ") + " → " + tr.nEndReq.join(" / ")), td(eta3(tr.etaC)), td(String(tr.nChumb))]); }),
        { nota: "Hold-down: só a força de cálculo Td (kN) nos dois lados de cada trecho; modelo comercial e capacidade pelo fabricante, ancoragem na fundação pelo projeto de fundação (NÃO verificados aqui). Montantes de ponta: se o pacote do modelo reprova na compressão, o necessário vai na coluna seguinte." });
      if (cv.chumbador) h += tabVerif(d, "Chumbador da guia inferior — " + esc(id), cv.chumbador.passos, cv.chumbador.eta, "chumbador " + id, { fim: "(d = " + cv.chumbador.d + " mm; " + cv.chumbador.nBolts + " no trecho mais carregado)" });
    });
    S.push(h);

    /* ---------------------------------------------------------------- 8 ligações */
    h = "<p>Ligações pelo MadLigCalc (modelo de Johansen, NBR 7190-1:2022 7.2, Tab. 18; Rd = kmod·Rk/γlig, 7.1.2; no mínimo 2 pinos, 7.1.1; prego com d ≥ 3,0 mm, 7.1.9). Prego do montante na guia (pregação de topo, 2 por ponta) ao cisalhamento da reação do vento; chumbador ao cisalhamento e à tração (seção 7).</p>";
    h += d.tab("Prego do montante na guia", ["Parede", "Prego", thn("Vd (kN)"), thn("Rd (kN)"), thn("η"), "Penetração"], ids.map(function (id) { var g = calc.paredes[id].ligacoes.montanteGuia; return trw([td(esc(id)), td(esc(g.prego.nome)), td(br(g.Vd, 3)), td(br(g.Rd, 3)), td(eta3(g.eta)), td(br(g.penetracao_d, 1) + "·d " + (g.penetracao_d >= 12 ? "≥ 12·d" : "&lt; 12·d"))]); }),
      { nota: "Pregação de topo (end nailing) não tem a redução de resistência da NBR 7190-1:2022 aplicada (premissa a confirmar pelo RT); a sucção (arrancamento) do montante vai por conector metálico, não pelo prego." });
    var g0 = ids[0] ? calc.paredes[ids[0]].ligacoes.montanteGuia : null;
    if (g0) h += tabVerif(d, "Prego do montante na guia — passo a passo (parede " + esc(ids[0]) + ")", g0.passos, g0.eta, "ligação");
    S.push(h);

    /* ---------------------------------------------------------------- 9 seções calculadas × modelo */
    h = "<p>O que mudar no modelo (Editar tipo › Construção) e nas pranchas. As seções, o espaçamento e o prego calculados valem sobre os do modelo; as pranchas mostram as duas e o orçamento ainda reflete o MODELO enquanto o tipo não for atualizado.</p>";
    h += d.tab("Seções calculadas", ["Parede", "Montante: modelo → calculado", "Vergas: tabela → calculada", "Prego de borda do OSB", thn("Hold-down Td (kN)"), "Chumbador"], ids.map(function (id) {
      var R = calc.paredes[id], mc = R.montante.calculado, mo = R.montante.modelo, cv = R.contraventamento;
      return trw([td(esc(id)), td("38×" + mo.secao[1] + " c/ " + mo.espac + " → " + (mc ? "<b>38×" + mc.secao[1] + " c/ " + mc.espac + "</b>" : "sem solução")),
        td(R.vergas.map(function (vg) { return esc(String(vg.vao)) + ": 38×" + vg.tabela.secao[1] + " → <b>38×" + vg.calculada.secao[1] + "</b> (" + vg.jacks + " jack)"; }).join("<br>") || "—"),
        td(cv && cv.contribui ? (cv.espModelo + " → <b>" + cv.pregoBorda.s + " mm</b>") : "—"), td(cv && cv.contribui ? br(cv.hdMax, 1) : "—"), td(cv && cv.chumbador ? "ø" + cv.chumbador.d + " mm" : "—")]);
    }));
    S.push(h);

    /* ---------------------------------------------------------------- 10 não verificado */
    h = "<p>O que este memorial NÃO cobre — nenhum item daqui aparece como atendido:</p><ul>" + calc.naoVerificado.map(function (x) { d.naoAbrangido(x.texto); return "<li>" + t(x.texto) + "</li>"; }).join("") + "</ul>";
    var fixos = ["Fundação, ancoragem do hold-down e do chumbador no concreto (arrancamento do concreto, fendilhamento) e resistência da laje/baldrame.", "Ligação do quadro com a cobertura (cinta, cantoneira, parafuso de topo) e as seções de tesouras/terças: módulo da cobertura.",
      "Resistência ao cisalhamento da própria chapa de OSB e sua fixação em campo: o catálogo não informa; o painel é limitado pelo prego (EN 1995-1-1 9.2.4.2).", "Estados de serviço de vibração, conforto e deslocamento lateral da edificação; diafragma de forro/piso e torção.", "Resistência ao fogo (NBR 7190-1:2022 11) e durabilidade/tratamento (12): fora do escopo deste memorial.",
      "Ações do pavimento superior sobre as paredes (só entram se informadas) e cargas concentradas de ligação com outras estruturas."];
    h += "<p>Itens fixos desta emissão:</p><ul>" + fixos.map(function (x) { d.naoAbrangido(x); return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    if (calc.avisos && calc.avisos.length) h += caixa("<b>Avisos do cálculo:</b><ul>" + calc.avisos.map(function (a) { return "<li>" + t(a) + "</li>"; }).join("") + "</ul>", "alerta");
    S.push(h);

    /* ---------------------------------------------------------------- 11 responsabilidade */
    h = "<p>Responsável técnico: " + ph(rp.abrev || rp.titulo, "TÍTULO") + " " + ph(rp.nome, "NOME DO RESPONSÁVEL TÉCNICO") + ", " + esc(rp.conselho || "CREA") + " nº " + ph(rp.crea, "Nº DO REGISTRO") + " — " + ph(rp.empresa, "EMPRESA") + ".</p>" + caixa("<b>" + esc(FAIXA) + ".</b>", "alerta");
    h += '<div class="assin-grade"><div class="assin"><div class="assin-linha"></div><div><b>' + ph(rp.nome, "NOME") + '</b></div><div class="assin-tit">Responsável técnico</div></div></div><p class="local">' + ph(op.local || ob.cidade, "LOCAL") + ", " + esc(data) + ".</p>";
    S.push(h);

    /* conferências internas */
    d.conferir("paredes", ids.length > 0, "paredes calculadas: " + ids.length);
    d.conferir("eta-finito", ids.every(function (id) { return I.fin(calc.paredes[id].eta); }), "η de todas as paredes finito");
    d.conferir("situacao", prel === (calc.motivosPreliminar.length > 0), "PRELIMINAR coerente com os motivos (" + calc.motivosPreliminar.length + ")");
    d.conferir("premissas", calc.premissas.every(function (p) { return p.texto && p.id; }), "premissas com código e texto: " + calc.premissas.length);
    var corpo = SEC.map(function (s, i) { return '<section class="sec" id="sec-s' + (i + 1) + '"><h2><span class="num">' + (i + 1) + "</span>" + esc(s) + '<span class="de">seção ' + (i + 1) + " de " + SEC.length + " · " + esc(rev) + "</span></h2>" + S[i] + "</section>"; }).join("");
    var capa = '<section class="capa" id="sec-capa"><div class="capa-logos">' + I.logoBox(obj(op.logos).ra, "Projeto e cálculo", "RA Engenharia") + '</div><div class="capa-faixa"><span class="f1"></span><span class="f2"></span><span class="f3"></span></div>' +
      '<div class="capa-tit"><div class="sobre">MEMORIAL DE CÁLCULO</div><h1>Paredes Wood Frame — ' + esc(nome) + '</h1><div class="sub">Cargas, vento, montantes, vergas, contraventamento, hold-down e ligações — ' + esc(calc.norma) + "</div></div>" +
      '<div class="capa-sit">' + esc(FAIXA) + "</div>" +
      '<table class="capa-ficha"><tbody><tr><td>Documento</td><td><b>' + ph(c.num, "Nº DO DOCUMENTO") + " " + esc(rev) + "</b> — " + esc(data) + "</td></tr><tr><td>Obra</td><td>" + ph(ob.nome, "OBRA") + "</td></tr><tr><td>Situação do cálculo</td><td" + (prel ? ' class="sit-falha"' : "") + ">" +
      (prel ? '<span class="falha">PRELIMINAR — ' + esc(calc.motivosPreliminar.join("; ")) + "</span>" : '<span class="ok">Atende</span>') + "</td></tr></tbody></table></section>";
    var titulo = "Memorial de cálculo — Wood Frame — " + nome;
    var cssx = I.css(c) + "@page { @top-center { content: " + JSON.stringify(FAIXA) + "; font: 6.5pt sans-serif; color: #a3352b; } } .faixa { border: 0.8pt solid #a3352b; color: #a3352b; text-align: center; font-weight: 600; font-size: 8pt; padding: 1mm; margin-bottom: 3mm; }";
    var html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="generator" content="OrçaPRO — WoodFrameMemorial"><title>' + esc(titulo) + "</title><style>" + cssx + '</style></head><body><div class="faixa" data-faixa="1">' + esc(FAIXA) + "</div>" + capa + corpo + "</body></html>";
    return { ok: true, html: html, titulo: titulo, secoes: SEC.map(function (s, i) { return { numero: i + 1, titulo: s }; }), tabelas: d.nTab, avisos: d.avisos.slice(), conferencias: d.conf.slice(), naoAbrangidos: d.naoAbr.slice(), preliminar: prel, faixa: FAIXA };
  }

  var WoodFrameMemorial = { gerar: gerar, FAIXA: FAIXA_OK };
  global.WoodFrameMemorial = WoodFrameMemorial;
  if (typeof module !== "undefined" && module.exports) module.exports = WoodFrameMemorial;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
