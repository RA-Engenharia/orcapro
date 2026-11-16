/* =====================================================================
 * concmemorial.js — MEMORIAL DE CÁLCULO ESTRUTURAL de concreto armado (fase C6, 16/11/2026). Motor PURO, ES5, sem DOM, Node-testável.
 * Cálculo de apoio — o engenheiro responsável confere e assina (ART). NÃO é prancha (C8).
 *
 *   ConcMemorial.gerar(pacote, opc)   → { ok, html, titulo, secoes, tabelas, avisos, conferencias, classeConsequencia, taxaParcial }
 *   ConcMemorial.xlsx(ExcelJS, pacote, opc) → workbook (tabela de aço: resumo, por bitola, por posição, por elemento, pendências)
 *   ConcMemorial.classeConsequencia({ nPavimentos, uso }) → { cc, motivo, atp, dispensa } (NBR 6118:2023/Em1:2026, 5.3 e Tabela 5.1)
 *   ConcMemorial.pacoteDe(resultadoCalcular) → o pacote a partir de ConcCalcular.rodar/iniciar (campo `motor`)
 *
 *   pacote = { an: ConcAnalise.rodar, dv: ConcViga.dimensionarDeAnalise, dp: ConcPilar.dimensionarDeAnalise, lajes: [{ res: ConcLaje.dimensionarLaje, lm: laje do modelo }],
 *              projeto: { fck, caa, nPavimentos?, uso ("unifamiliar"|"multifamiliar"|"comercial"|outro), permitirPilar12?, memorialPilar12? }, det?: ConcDetalhe.detalharDeAnalise }
 *   opc    = { obra {nome, endereco, cidade, proprietario, contratante}, documento {numero, revisao, data, situacao}, responsavel {nome, titulo, abrev, conselho, crea, empresa},
 *              bimManager, contratanteAssinatura, local, logos {ra, contratante, proprietario}, revisoes }
 *
 * REGRA: nenhum número do cálculo é reescrito aqui — toda tabela lê o campo do resultado dos motores (C1 a C5) e só FORMATA (mesmo formatador do memorial da madeira). O estilo, a capa, o
 * cabeçalho/rodapé com "Página N de M" e as 3 assinaturas são os do documento técnico RA (js/madmemorial.js, via MadMemorial._i). A taxa de aço sai marcada PARCIAL.
 * Ressalva da norma: "conferido no texto; a RA precisa do exemplar próprio" — o nome de quem aparece na marca d'água do exemplar de terceiro NÃO é gravado em lugar nenhum.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function MM() { var m = dep("MadMemorial", "./madmemorial.js"); return m && m._i ? m._i : null; }
  function DC() { return dep("ConcDadosCalc", "./concdadoscalc.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  var ROTULO = "Cálculo de apoio — o engenheiro responsável confere e assina (ART)";
  var RESSALVA = "Conferido no texto da norma; a RA precisa do exemplar próprio. Os critérios marcados “norma-lida” foram conferidos na NBR 6118:2023 e na Emenda 1:2026, cuja cópia é de uso exclusivo de terceiro: o memorial não reproduz o nome do titular do exemplar.";

  /* PREDICADO ÚNICO de peça reprovada (capa, tabelas, liberação, xlsx): não atende, incompleta (ancoragem não conferida), ok === false (o motor não fechou), pilar sem armadura ou laje do modelo sem
   * cálculo. tipo: "viga" | "laje" | "pilar" | "laje-sem-calculo". Nada de "atende" por omissão: só atende === true. */
  function reprovada(p, tipo) {
    if (!p || tipo === "laje-sem-calculo") return true;
    if (p.ok === false || p.atende !== true || p.incompleto === true) return true;
    if (tipo === "pilar" && !p.armadura) return true;
    return false;
  }
  /* as peças reprovadas do pacote, com o nome (para a faixa da capa e para a lista) */
  function reprovadasDe(pac) {
    var an = obj(pac.an), dv = obj(pac.dv), dp = obj(pac.dp), out = [], feitas = {};
    arr(dv.vigas).forEach(function (v) { if (reprovada(v, "viga")) out.push({ tipo: "viga", nome: v.marca || v.id }); });
    arr(dp.pilares).forEach(function (q) { if (reprovada(q, "pilar")) out.push({ tipo: "pilar", nome: q.marca || q.id }); });
    arr(pac.lajes).forEach(function (L) { feitas[String(obj(L.res).id)] = 1; if (reprovada(L.res, "laje")) out.push({ tipo: "laje", nome: obj(L.res).marca || obj(L.res).id }); });
    arr(an.modelo && an.modelo.lajes).forEach(function (l) { if (!feitas[String(l.id)]) out.push({ tipo: "laje-sem-calculo", nome: l.marca || l.id }); });
    return out;
  }
  /* nome de arquivo sugerido: NAO-LIBERADO enquanto houver reprovação */
  function nomeArquivo(pac, ext, bloqueado) { return "memorial-calculo-estrutural" + (bloqueado ? "-NAO-LIBERADO" : "") + "." + (ext || "html"); }

  /* ---------------------------------------------------------------- classe de consequência (NBR 6118:2023/Em1:2026, 5.3 e Tabela 5.1, Em1 PDF 5-7, p. 1-3) */
  function usoNorm(u) {
    var s = String(u == null ? "" : u).toLowerCase(); if (s.normalize) s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (/unifamiliar/.test(s)) return "unifamiliar";
    if (/multifamiliar/.test(s)) return "multifamiliar";
    if (/comercial/.test(s)) return "comercial";
    if (/agricola/.test(s)) return "agricola";
    return "outro";
  }
  /* CC1: residencial unifamiliar com até 2 pavimentos habitáveis (e agrícola não ocupado permanentemente); CC2: residencial multifamiliar e comercial com até 5 pavimentos habitáveis;
   * CC3: os demais casos (inclui residencial/comercial com mais de 5 pavimentos) e, havendo dúvida, CC3 (5.3.3). Unifamiliar com 3 ou mais pavimentos não consta da tabela: dúvida → CC3. */
  function classeConsequencia(o) {
    o = o || {};
    var n = num(o.nPavimentos, NaN), u = usoNorm(o.uso), cc, motivo;
    if (!(n >= 1)) { cc = "CC3"; motivo = "número de pavimentos habitáveis não informado: na dúvida, CC3 (5.3.3)"; }
    else if (u === "unifamiliar" && n <= 2) { cc = "CC1"; motivo = "edifício residencial unifamiliar com até dois pavimentos habitáveis (Tabela 5.1)"; }
    else if (u === "agricola") { cc = "CC1"; motivo = "edifício agrícola normalmente não ocupado permanentemente por pessoas (Tabela 5.1)"; }
    else if ((u === "multifamiliar" || u === "comercial") && n <= 5) { cc = "CC2"; motivo = "edifício residencial multifamiliar ou comercial com até cinco pavimentos habitáveis (Tabela 5.1)"; }
    else if ((u === "multifamiliar" || u === "comercial") && n > 5) { cc = "CC3"; motivo = "edifício residencial ou comercial com mais de cinco pavimentos habitáveis (Tabela 5.1)"; }
    else if (u === "unifamiliar") { cc = "CC3"; motivo = "unifamiliar com mais de dois pavimentos habitáveis não consta como CC1 nem CC2: na dúvida, CC3 (5.3.3)"; }
    else { cc = "CC3"; motivo = "uso fora dos casos de CC1 e CC2: demais casos e, na dúvida, CC3 (5.3.3)"; }
    return { cc: cc, motivo: motivo, nPavimentos: n, uso: u, atp: "obrigatória (5.3.1)", dispensa: cc !== "CC3",
             dispensaTexto: cc === "CC3" ? "NÃO há dispensa da ATP em CC3." : "A ATP só pode ser dispensada em CC1 e CC2, por comum acordo entre o projetista e o contratante, formalizado e integrante da documentação do projeto (5.3.5)." };
  }

  /* ---------------------------------------------------------------- pacote a partir do ConcCalcular */
  function pacoteDe(r) {
    var m = r && r.motor; if (!m || !m.an) return null;
    return { an: m.an, dv: m.dv, dp: m.dp, lajes: arr(m.lajes), projeto: { fck: r.fck, caa: r.caa, permitirPilar12: r.permitirPilar12 === true, memorialPilar12: r.memorialPilar12 || null, nPavimentos: arr(m.an.modelo && m.an.modelo.niveis).length || null }, assinaturaModelo: r.assinaturaModelo || null };
  }
  function detDe(p) {
    if (p.det) return p.det;
    var DT = dep("ConcDetalhe", "./concdetalhe.js"); if (!DT) return null;
    var lj = arr(p.lajes).map(function (L) { return { res: L.res, g: L.lm ? DT.gDeLajeModelo(p.an, L.lm) : null }; }).filter(function (x) { return x.g; });
    return DT.detalharDeAnalise(p.an, p.dv, p.dp, lj, { caa: obj(p.projeto).caa });
  }

  var SECOES = [
    { id: "objeto", titulo: "Objeto e identificação do projeto" },
    { id: "normas", titulo: "Normas e ressalva do exemplar" },
    { id: "premissas", titulo: "Premissas e materiais" },
    { id: "cc", titulo: "Classe de consequência e avaliação técnica de projeto (ATP)" },
    { id: "acoes", titulo: "Ações e combinações" },
    { id: "analise", titulo: "Análise estrutural: γz, desaprumo e 15.7.3" },
    { id: "vigas", titulo: "Vigas" },
    { id: "lajes", titulo: "Lajes" },
    { id: "pilares", titulo: "Pilares" },
    { id: "detalhe", titulo: "Detalhamento e tabela de aço" },
    { id: "pendencias", titulo: "Pendências, decisões do produto e itens sem fonte" },
    { id: "conferencias", titulo: "Conferências internas" },
    { id: "termo", titulo: "Responsabilidade técnica" }
  ];

  /* ---------------------------------------------------------------- GERAR */
  function gerar(pac, opc) {
    opc = opc || {};
    var I = MM(); if (!I) return { ok: false, motivo: "O documento padrão RA (madmemorial.js) não carregou.", html: "" };
    if (!pac || !pac.an || !pac.an.ok) return { ok: false, motivo: "Sem resultado do cálculo (rode o Calcular antes).", html: "" };
    if (pac.assinaturaModelo && opc.assinaturaAtual && pac.assinaturaModelo !== opc.assinaturaAtual) return { ok: false, antigo: true, motivo: "O modelo mudou depois do Calcular: o memorial seria de um cálculo antigo. Recalcule a estrutura (Calcular) e gere o memorial de novo.", html: "" };
    I.reset();
    var D = DC(), V = dep("ConcViga", "./concviga.js"), an = pac.an, dv = obj(pac.dv), dp = obj(pac.dp), pr = obj(pac.projeto), det = detDe(pac), d = new I.Doc();
    var esc = I.esc, br = I.br, un = I.un, td = I.td, trw = I.trw, thn = I.thn, caixa = I.caixa, ph = I.ph, plural = I.plural;
    var ob = obj(opc.obra), dc = obj(opc.documento), rp = obj(opc.responsavel), bm = obj(opc.bimManager), ct = obj(opc.contratanteAssinatura), lg = obj(opc.logos);
    var c = { rp: rp, obraNome: ob.nome || "[OBRA]", num: dc.numero || "", rev: dc.revisao || "R00", data: I.dataTxt(dc.data) };
    var fck = num(pr.fck, num(an.modelo && an.modelo.fck, 25)), caa = num(pr.caa, 2), mat = V ? V.material(fck, undefined, {}) : { ok: false };
    var nPav = pr.nPavimentos != null ? pr.nPavimentos : arr(an.modelo && an.modelo.niveis).length, ccr = classeConsequencia({ nPavimentos: nPav, uso: pr.uso });
    var vigas = arr(dv.vigas), pilares = arr(dp.pilares), lajes = arr(pac.lajes), lajesModelo = arr(an.modelo && an.modelo.lajes);
    var TOT = an.cargas && an.cargas.totais ? an.cargas.totais : {}, secHtml = {}, repro = reprovadasDe(pac), confFalsas = 0;
    function t3(legenda, cab, linhas, op) { return d.tab(legenda, cab, linhas, op); }
    function sit(ok) { return I.situ(ok); }
    function lista(itens) { itens = arr(itens); return itens.length ? "<ul>" + itens.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : ""; }
    function kv(legenda, linhas) { return t3(legenda, [thn("Item"), "Valor"], linhas.map(function (l) { return trw([td(esc(l[0])), td(l[1])]); }), { classe: "ficha" }); }

    /* ---- 1. objeto */
    function sObjeto() {
      var h = "<p>Este memorial reúne, num só documento, o cálculo de apoio da estrutura de concreto armado lançada no modelo: análise do pórtico (C1), vigas (C2), lajes (C3), pilares (C4) e detalhamento das armaduras com a tabela de aço (C5). Os números abaixo são os resultados dos motores, copiados sem reescrita.</p>";
      h += caixa("<b>" + esc(ROTULO) + ".</b> O documento NÃO substitui a revisão e a assinatura do responsável técnico, nem as plantas de fôrma e de armação (pranchas: fase C8).", "alerta");
      h += kv("Identificação", [["Obra", ph(ob.nome, "OBRA")], ["Endereço", ph([ob.endereco, ob.cidade].filter(Boolean).join(" — "), "ENDEREÇO")], ["Contratante", ph(ob.contratante, "CONTRATANTE")], ["Proprietário", ph(ob.proprietario, "PROPRIETÁRIO")],
        ["Documento", ph(c.num, "Nº DO DOCUMENTO") + " " + esc(c.rev) + " — " + esc(c.data)], ["Pavimentos no modelo", br(arr(an.modelo && an.modelo.niveis).length, 0)],
        ["Peças calculadas", plural(vigas.length, "viga", "vigas") + ", " + plural(pilares.length, "pilar", "pilares") + ", " + plural(lajes.length, "laje maciça", "lajes maciças") + " (de " + br(lajesModelo.length, 0) + " lajes do modelo)"]]);
      return h;
    }
    /* ---- 2. normas */
    function sNormas() {
      var N = obj(D && D.normas), linhas = [];
      ["NBR6118", "NBR6120", "NBR6123", "N7480"].forEach(function (k) { var n = N[k]; if (n) linhas.push(trw([td(esc(n.titulo)), td(esc(n.vigente || "—")), td(esc(n.lida || "—"))])); });
      linhas.push(trw([td("ABNT NBR 8681 — Ações e segurança nas estruturas"), td("conforme a biblioteca técnica"), td("NÃO aberta: combinações pelos γ e ψ da 6118 (Tabelas 11.1 e 11.2) — pendência")]));
      var h = t3("Normas, edição vigente e o que foi lido", ["Norma", "Vigente", "Lida / situação"], linhas, { classe: "normas" });
      h += caixa("<b>Ressalva do exemplar.</b> " + esc(RESSALVA), "alerta");
      h += "<p>Fontes de literatura aberta (Bastos, UNESP; Carvalho e Paccola, EESC-USP): usadas só onde a norma não fixa o número, sempre marcadas como tal na seção 11.</p>";
      return h;
    }
    /* ---- 3. premissas */
    function sPremissas() {
      var vida = (function () { var CD = dep("ConcDados", "./concdados.js"); return CD && CD.criterios && CD.criterios.vidaUtilAnos ? CD.criterios.vidaUtilAnos.valor : 50; })();
      var cobV = V ? V.cobrimento(caa, fck, false) : null, cobL = D ? (D.v("lajeCobrimentoCAAmm", [20, 25, 35, 45])[Math.max(1, Math.min(4, Math.round(caa))) - 1] / 10) : null;
      var h = kv("Materiais e durabilidade", [["Classe de agressividade ambiental (CAA)", "CAA " + br(caa, 0) + " (Tabela 6.1)"], ["Concreto", "C" + br(fck, 0) + " — fck = " + un(fck, 0, "MPa") + (mat.ok ? "; fcd = " + un(mat.fcd * 10, 2, "MPa") + "; fctm = " + un(mat.fctm * 10, 2, "MPa") + "; Ecs = " + un(mat.Ecs * 10, 0, "MPa") : "")],
        ["Aço", "CA-50 (fyk = " + (mat.ok ? un(mat.fyk, 0, "MPa") + "; fyd = " + un(mat.fyd * 10, 1, "MPa") : "—") + ") nas barras; CA-60 de 5 mm nos estribos. fyk SEM FONTE (NBR 7480 fora da biblioteca)"],
        ["Coeficientes", mat.ok ? "γc = " + br(mat.gammaC, 2) + "; γs = " + br(mat.gammaS, 2) : "—"], ["Vida útil de projeto", br(vida, 0) + " anos (Em1:2026, 6.2.4)"],
        ["Cobrimento nominal — vigas e pilares", cobV != null ? un(cobV * 10, 0, "mm") + " (Tabela 7.2, CAA " + br(caa, 0) + ", com a redução de 5 mm por fck acima do mínimo da Tabela 7.1 quando couber)" : "—"],
        ["Cobrimento nominal — lajes", cobL != null ? un(cobL * 10, 0, "mm") + " (Tabela 7.2)" : "—"], ["Agregado", ph(an.modelo && an.modelo.material && an.modelo.material.agregado, "AGREGADO") + " (módulo de elasticidade)"]]);
      h += "<p>Modelo: pilares engastados na fundação (sem interação solo-estrutura), eixo da viga no nível do pavimento, lajes distribuindo a carga às vigas pelas tabelas de Bares/charneiras. Premissas do modelo registradas pelo C1:</p>" + lista(an.premissas);
      if (pr.permitirPilar12) h += caixa("<b>Opção do projeto ligada:</b> pilar de 12 a 14 cm (fora da NBR 6118:2023, 13.2.3) — decisão do responsável técnico; ver a seção 9.", "alerta");
      return h;
    }
    /* ---- 4. CC e ATP */
    function sCC() {
      var h = caixa("<b>Classe de consequência: " + ccr.cc + "</b> — " + esc(ccr.motivo) + " (" + esc(br(ccr.nPavimentos, 0)) + " pavimento(s) habitável(is); uso: " + esc(ccr.uso) + ").", ccr.cc === "CC3" ? "alerta" : "");
      h += t3("Classes de consequência (NBR 6118:2023/Em1:2026, Tabela 5.1)", ["Classe", "Casos típicos (resumo da Tabela 5.1)"], [
        trw([td("<b>CC1</b>"), td("Edifícios residenciais unifamiliares com até dois pavimentos habitáveis; edifícios agrícolas normalmente não ocupados permanentemente por pessoas.")], ccr.cc === "CC1" ? "tot" : ""),
        trw([td("<b>CC2</b>"), td("Edifícios residenciais multifamiliares e comerciais com até cinco pavimentos habitáveis; muros de contenção até 2,5 m; pequenas reformas sem eliminação de pilares e acréscimos de carga de até 5 %.")], ccr.cc === "CC2" ? "tot" : ""),
        trw([td("<b>CC3</b>"), td("Demais casos: edifícios residenciais e comerciais com mais de cinco pavimentos, estruturas especiais (obras industriais, pontes, galpões de grande porte etc.). Havendo dúvida, adotar CC3 (5.3.3).")], ccr.cc === "CC3" ? "tot" : "")], { classe: "ficha" });
      h += caixa("<b>ATP — avaliação técnica de projeto: OBRIGATÓRIA (5.3.1).</b> Deve ser realizada antes da construção, por profissional habilitado e independente do projetista (5.3.6), que emite parecer integrante do projeto (5.3.9). Em CC1 e CC2 o avaliador analisa este memorial e revisa os cálculos; em CC3 desenvolve modelos e análises independentes (5.3.4-b). " + esc(ccr.dispensaTexto) + " O autor do projeto deve alertar o contratante sobre a obrigatoriedade da ATP e este informar quem é o responsável por ela (5.3.10).", "alerta");
      h += "<p class=\"nota\">Fonte: NBR 6118:2023/Em1:2026, 5.3 e Tabela 5.1 (Em1 PDF 5 a 7, p. 1 a 3). " + esc(RESSALVA) + "</p>";
      return h;
    }
    /* ---- 5. ações */
    function sAcoes() {
      var h = "<p>Cargas do C1 (valores característicos totais do modelo, em kN): peso próprio, revestimentos, alvenaria sobre vigas/lajes e sobrecarga de uso (NBR 6120:2019, por ambiente). Vento (NBR 6123): " + esc((an.cargas && an.cargas.vento && an.cargas.vento.status) || "—") + ".</p>";
      h += t3("Totais das ações permanentes e variáveis do modelo", [thn("Caso"), thn("Total (kN)")], ["PP", "REV", "ALV", "SC"].filter(function (k) { return fin(TOT[k]); }).map(function (k) { return trw([td(esc({ PP: "PP — peso próprio", REV: "REV — revestimentos", ALV: "ALV — alvenaria", SC: "SC — sobrecarga de uso" }[k])), td(br(TOT[k], 2), "n")]); }), { classe: "compacta" });
      h += t3("Combinações (NBR 6118 11.8; γ e ψ das Tabelas 11.1 e 11.2)", ["Combinação", "Nome", "Tipo", "Fonte"], arr(an.combinacoes).map(function (k) { return trw([td(esc(k.id)), td(esc(k.nome)), td(esc(k.tipo)), td(esc(k.norma || ""))]); }), { classe: "compacta" });
      h += lista(arr(an.cargas && an.cargas.premissas).slice(0, 12));
      return h;
    }
    /* ---- 6. análise */
    function sAnalise() {
      var h = "", gz = arr(an.gammaZ), ds = obj(an.cargas && an.cargas.desaprumo);
      h += t3("γz por combinação (NBR 6118 15.5.3)", ["Combinação", "Nome", thn("M1 (kN·m)"), thn("ΔM (kN·m)"), thn("γz"), "Nós fixos", "γz aplicável"], gz.map(function (g) { return trw([td(esc(g.combinacao)), td(esc(g.nome)), td(br(g.M1, 2), "n"), td(br(g.dM, 2), "n"), td(br(g.gammaZ, 4), "n"), td(sit(g.nosFixos)), td(g.aplicavel ? "sim" : "não (informativo)")]); }), { classe: "compacta", vazio: "γz não calculado (sem combinação com ação horizontal)." });
      h += "<p>Desaprumo global (11.3.3.4.1, Em1:2026 Fig. 11.1: θ1 = 1/(100·√H), 1/300 ≤ θ1 ≤ 1/200; θa = θ1·√((1 + 1/n)/2)): " + (ds.status === "calculado" ? "H = " + un(ds.H, 2, "m") + "; n = " + br(ds.n, 0) + " prumadas; θ1 = " + br(ds.theta1, 5) + " rad; θa = " + br(ds.thetaA, 5) + " rad" : esc(String(ds.status || "—") + (ds.motivo ? " — " + ds.motivo : ""))) + ".</p>";
      h += caixa("<b>15.7.3 (Em1:2026):</b> " + (arr(an.avisos).filter(function (a) { return /15\.7\.3/.test(a); })[0] ? esc(arr(an.avisos).filter(function (a) { return /15\.7\.3/.test(a); })[0]) : "edificação com quatro pavimentos ou mais: sem este aviso."), "alerta");
      h += "<p>Avisos da análise:</p>" + lista(an.avisos) + (arr(an.pendencias).length ? "<p>Pendências da análise:</p>" + lista(an.pendencias) : "");
      return h;
    }
    /* ---- 7. vigas */
    function sVigas() {
      var linhas = vigas.map(function (v) {
        var t = obj(v.tramos && v.tramos[0]), e = obj(t.entrada), tr = obj(t.trechos), es = obj(obj(t.cisalhamento).meio).estribo, el = obj(t.els), ok = v.ok !== false && t.ok !== false, rep = reprovada(v, "viga"), fl = el.flecha && el.flecha.ok ? el.flecha.razao : null;
        function b(x) { return x && x.barras ? esc(x.barras.texto) : "—"; }
        return trw([td(esc(v.marca || v.id)), td(br(e.bw, 0) + "×" + br(e.h, 0), "n"), td(br(num(e.L, NaN) / 100, 2), "n"), td(b(tr.positivo)), td(b(tr.negEsq) + " / " + b(tr.negDir)), td(es ? "φ " + br(es.phi, 1) + " c/" + br(es.s, 1) : "—"),
          td(fin(fl) ? (fl > 1 + 1e-9 ? '<span class="falha">' + br(fl, 2) + "</span>" : br(fl, 2)) : "—", "n"), td(ok ? br(t.aproveitamento, 2) : "—", "n"), td(ok ? esc(t.governa || "") : esc(t.motivo || v.avisos && v.avisos[0] || "sem cálculo")), td(sit(!rep))], rep ? "linha-falha" : "");
      });
      var nao = vigas.filter(function (v) { return reprovada(v, "viga"); }).length;
      var h = "<p>Dimensionamento do C2 (flexão ELU, As,mín/As,máx, cisalhamento modelo I, decalagem, ancoragem, flecha com Branson e fluência, fissuração). Aproveitamento = maior razão ação/resistência (≤ 1 atende). " + (nao ? "<b>" + plural(nao, "viga não atende", "vigas não atendem") + " ou ficou incompleta(s) (linhas em vermelho).</b>" : "Todas as vigas atendem.") + "</p>";
      h += t3("Vigas — resultado por elemento (kN, cm)", ["Marca", thn("b×h (cm)"), thn("Vão (m)"), "Positiva", "Negativas (esq / dir)", "Estribo", thn("Flecha η"), thn("Aprov."), "Governa", "Situação"], linhas, { classe: "compacta", vazio: "Sem vigas no resultado." });
      var cE = D && D.criterios && D.criterios.apoioIntermediarioSemFsdEm1;
      if (cE) h += caixa("<b>Armadura no apoio (Em1:2026, 18.3.2.4, " + esc(String(cE.pagina).replace("Em1 ", "")) + ").</b> A alínea b) (Fsd = MSd/z + (aℓ/d)·VSd + NSd, para a ancoragem da diagonal comprimida) vale “em apoios extremos”; no apoio intermediário valem a alínea a) (armadura do momento positivo, se houver) e a c) (1/3 ou 1/4 de As,vão, “em apoios extremos e intermediários”). Conferido no texto da Emenda, " + esc(String(cE.pagina).replace("Em1 ", "")) + "; a RA precisa do exemplar próprio.", "neutra");
      var avs = []; vigas.forEach(function (v) { arr(v.avisos).slice(0, 2).forEach(function (a) { avs.push((v.marca || v.id) + ": " + a); }); });
      if (avs.length) h += "<p>Avisos do C2 (primeiros de cada viga):</p>" + lista(avs.slice(0, 30));
      return h;
    }
    /* ---- 8. lajes */
    function sLajes() {
      var feitas = {}; lajes.forEach(function (L) { feitas[String(obj(L.res).id)] = 1; });
      var linhas = lajes.map(function (L) {
        var r = obj(L.res), en = obj(r.entrada), cg = obj(r.cargas), ok = r.ok !== false, rep = reprovada(r, "laje"), fl = r.flecha && r.flecha.ok ? r.flecha.razao : null;
        var arm = arr(r.armaduras).filter(function (a) { return a.ok && a.barras; }).map(function (a) { return esc(a.id + ": " + a.barras.texto); }).join("<br>");
        return trw([td(esc(r.marca || r.id)), td(esc(r.tipoLaje || "—")), td(br(en.lx, 2) + "×" + br(en.ly, 2), "n"), td(br(en.h, 0), "n"), td(br(cg.g, 2) + " + " + br(cg.q, 2), "n"), td(arm || "—"), td(fin(fl) ? (fl > 1 + 1e-9 ? '<span class="falha">' + br(fl, 2) + "</span>" : br(fl, 2)) : "—", "n"), td(ok ? br(r.aproveitamento, 2) : "—", "n"), td(ok ? esc(r.governa || "") : esc(r.motivo || "")), td(sit(!rep))], rep ? "linha-falha" : "");
      });
      var sem = lajesModelo.filter(function (l) { return !feitas[String(l.id)]; });
      var h = "<p>Lajes maciças retangulares pelo C3 (tabelas de Bares, faixa de 1 m dimensionada como viga com as funções do C2; flecha e fissuração).</p>";
      h += t3("Lajes — resultado por elemento (m, cm, kN/m²)", ["Marca", "Tipo", thn("lx×ly (m)"), thn("h (cm)"), thn("g + q (kN/m²)"), "Armaduras", thn("Flecha η"), thn("Aprov."), "Governa", "Situação"], linhas, { classe: "compacta", vazio: "Sem lajes calculadas." });
      if (sem.length) h += caixa("<b>Lajes sem cálculo neste memorial:</b> " + esc(sem.map(function (l) { return (l.marca || l.id) + " (" + l.tipo + ")"; }).join("; ")) + " — fora do motor (treliçada, mista ou não retangular): o fabricante/engenheiro define.", "alerta");
      return h;
    }
    /* ---- 9. pilares */
    function sPilares() {
      var linhas = pilares.map(function (q) {
        var rep = reprovada(q, "pilar"), ok = !rep, s = obj(q.secao), a = obj(q.armadura), e = obj(q.estribos), Nd = arr(q.casos).reduce(function (m, k) { return Math.max(m, num(k.Nd, 0)); }, 0);
        return trw([td(esc(q.marca || q.id)), td(br(s.hy, 0) + "×" + br(s.hx, 0), "n"), td(esc(q.posicao || "—")), td(fin(Nd) && Nd > 0 ? br(Nd, 0) : "—", "n"), td(ok ? esc(a.texto) : "—"), td(ok && e.phiT ? "φ " + br(e.phiT, 1) + " c/" + br(e.s, 1) + (e.grampos ? " + " + br(e.grampos, 0) + " grampo(s)" : "") : "—"), td(fin(q.aproveitamento) ? br(q.aproveitamento, 2) : "—", "n"),
          td(ok ? esc(q.governa ? (q.governa.caso + " (" + q.governa.tipo + ")") : "") : esc(q.motivo || "")), td(q.foraNorma && ok ? '<span class="alerta-tx">fora da norma</span>' : sit(ok))], ok && !q.foraNorma ? "" : "linha-falha");
      });
      var h = "<p>Dimensionamento do C4 (flexão composta normal/oblíqua por integração da seção, 2ª ordem local pelo pilar-padrão, nós fixos, λ ≤ 90). Nd = maior força normal de cálculo (com γn).</p>";
      h += t3("Pilares — resultado por lance (kN, cm)", ["Marca", thn("Seção (cm)"), "Posição", thn("Nd máx (kN)"), "Armadura", "Estribos", thn("Aprov."), "Governa", "Situação"], linhas, { classe: "compacta", vazio: "Sem pilares no resultado." });
      var m12 = pr.memorialPilar12 || dp.memorialPilar12;
      if (m12) {
        var tx = typeof m12 === "string" ? m12 : m12.texto;
        h += "<h3>Pilar de 12 a 14 cm — opção do projeto (fora da NBR 6118:2023, 13.2.3)</h3>" + caixa("<b>Seção própria do memorial.</b> " + esc(String(tx)), "erro");
        if (m12 && m12.itens) h += t3("Pilares de 12 a 14 cm verificados (decisão do responsável técnico)", ["Marca", thn("Seção"), thn("Nd (kN)"), thn("Md (kN·m)"), thn("γn"), thn("Taxa de aço"), "Atende"], arr(m12.itens).map(function (i) { return trw([td(esc(i.marca)), td(esc(i.secao), "n"), td(br(i.NdKN, 0), "n"), td(br(i.MdKNm, 1), "n"), td(br(i.gammaN, 3), "n"), td(fin(i.taxaAco) ? br(100 * i.taxaAco, 2) + " %" : "—", "n"), td(sit(i.atende))]); }), { classe: "compacta" });
        h += caixa("<b>NÃO LIBERADO sem a assinatura do responsável técnico:</b> o uso desta seção é decisão do RT, assumida com a assinatura deste memorial e da ART.", "alerta");
      } else if (arr(dp.foraNorma).length) h += caixa("<b>" + plural(dp.foraNorma.length, "pilar", "pilares") + " fora da norma (12 a 14 cm)</b> habilitados pela opção do projeto: " + esc(dp.foraNorma.join(", ")) + ".", "erro");
      return h;
    }
    /* ---- 10. detalhamento */
    function sDetalhe() {
      if (!det || !det.tabela) return caixa("<b>Detalhamento indisponível:</b> o módulo da C5 não carregou.", "erro");
      var T = det.tabela, h = "<p>Detalhamento da C5: posições N1… por elemento, com comprimentos (trecho reto + pontas, sem acréscimo de curva), ganchos de 135° nos estribos e a massa linear φ²·0,006165 kg/m (Tabela A-3 do Bastos — a NBR 7480 está fora da biblioteca). Perda de " + br(100 * T.perda, 0) + " % (parâmetro do projeto).</p>";
      h += t3("Resumo do aço por bitola e classe", [ "Aço", thn("φ (mm)"), thn("kg/m"), thn("Comprimento (m)"), thn("Massa (kg)"), thn("Com perda (kg)")], T.resumo.map(function (r) { return trw([td(esc(r.aco)), td(br(r.phi, 1), "n"), td(br(r.massaLinear, 3), "n"), td(br(r.comprimentoM, 1), "n"), td(br(r.kg, 1), "n"), td(br(r.kgComPerda, 1), "n")]); })
        .concat([trw([td("<b>Total</b>"), td(""), td(""), td(""), td("<b>" + br(T.totalKg, 1) + "</b>", "n"), td("<b>" + br(T.totalKgComPerda, 1) + "</b>", "n")], "tot")]), { classe: "compacta" });
      var porEl = [];
      function pe(rs, tipo) { arr(rs).forEach(function (r) { porEl.push(trw([td(esc(tipo)), td(esc((arr(r.posicoes)[0] && r.posicoes[0].elemento) || r.id)), td(br(arr(r.posicoes).length, 0), "n"), td(br(r.tabela.totalKg, 1), "n")])); }); }
      pe(det.vigas, "Viga"); pe(det.pilares, "Pilar"); pe(det.lajes, "Laje");
      h += t3("Aço por elemento (massa líquida)", ["Tipo", "Elemento", thn("Posições"), thn("Massa (kg)")], porEl, { classe: "compacta" });
      h += caixa("<b>TAXA PARCIAL — NÃO é a taxa do projeto.</b> " + (fin(det.taxaParcialKgM3) ? "Aço líquido " + un(T.totalKg, 0, "kg") + " ÷ " + un(det.volumeDetalhadoM3, 2, "m³") + " de concreto das peças detalhadas = <b>" + br(det.taxaParcialKgM3, 1) + " kg/m³</b> (" + br(det.taxaParcialKgM3ComPerda, 1) + " com perda). " : "") + "Volume bruto, sem descontar interseções. Falta: " + esc(arr(det.faltou).join("; ")) + ". O orçamento usa 100 kg/m³ até a fase C10; este número NÃO deve substituí-lo.", "erro");
      h += "<p>A tabela completa por posição (N, φ, quantidade, comprimento, massa) acompanha este memorial na planilha .xlsx.</p>";
      return h;
    }
    /* ---- 11. pendências e decisões */
    function sPend() {
      var P = [];
      function add(o, texto) { texto = String(texto); if (!P.some(function (x) { return x[1] === texto; })) P.push([o, texto]); }
      arr(an.pendencias).forEach(function (x) { add("C1 — pórtico e cargas", x); });
      arr(dv.pendencias).forEach(function (x) { if (!/^SEM FONTE/.test(x)) add("C2 — vigas", x); });
      arr(dp.pendencias).forEach(function (x) { if (!/^SEM FONTE/.test(x)) add("C4 — pilares", x); });
      lajes.forEach(function (L) { arr(obj(L.res).pendencias).forEach(function (x) { if (!/^SEM FONTE/.test(x)) add("C3 — lajes", x); }); });
      if (det) { arr(det.avisos).forEach(function (x) { add("C5 — detalhamento", x); }); [].concat(arr(det.vigas), arr(det.pilares), arr(det.lajes)).forEach(function (r) { arr(r.pendencias).forEach(function (x) { add("C5 — detalhamento", x); }); }); }
      var h = t3("Pendências abertas e a origem de cada uma", [thn("#"), "Origem", "Pendência"], P.map(function (p, i) { return trw([td(br(i + 1, 0), "n"), td(esc(p[0])), td(esc(p[1]))]); }), { classe: "compacta", vazio: "Nenhuma." });
      var sf = D ? D.semFonte() : [];
      h += t3("Números SEM FONTE (não conferidos na biblioteca de normas)", ["Chave", "Item", "Observação"], sf.map(function (x) { return trw([td(esc(x.chave)), td(esc(x.item)), td(esc(x.obs))]); }), { classe: "compacta" });
      h += caixa("<b>Itens da Em1:2026 ainda NÃO verificados por este memorial:</b> 13.2.5.1-b (furo em viga ≤ 12×12 cm ou Ø 12,5 cm, limitado a h/3); 18.3.4 (estribo de torção: o motor não calcula torção); 19.5.2.3 (punção em pilar de borda); 23.3 (frequência natural do piso ≥ 3 Hz); 17.4.1.1.3 não se aplica (só estribos).", "alerta");
      function crit(status) { var L = []; if (!D) return L; Object.keys(D.criterios).forEach(function (k) { var c = D.criterios[k]; if (c.status === status) L.push(trw([td(esc(k)), td(esc(c.item || "")), td(esc(D.fontes[c.fonte] ? c.fonte : (c.fonte || "")))])); }); return L; }
      h += t3("Decisões do produto (sem fonte de norma; o engenheiro responsável confere)", ["Chave", "O que é", "Origem"], crit("decisao-produto"), { classe: "compacta resumo" });
      h += t3("Números de literatura aberta (usados onde a norma não fixa o valor)", ["Chave", "Item", "Fonte"], crit("literatura-aberta"), { classe: "compacta resumo" });
      h += "<p class=\"nota\">" + esc(RESSALVA) + "</p>";
      return h;
    }
    /* ---- 12. conferências */
    function sConf() {
      var T = det && det.tabela, somaEl = 0;
      if (det) [].concat(arr(det.vigas), arr(det.pilares), arr(det.lajes)).forEach(function (r) { somaEl += r.tabela.totalKg; });
      d.conferir("vigas", vigas.length === arr(dv.vigas).length, "vigas na tabela (" + vigas.length + ") = vigas do C2 (" + arr(dv.vigas).length + ")");
      d.conferir("pilares", pilares.length === arr(dp.pilares).length, "pilares na tabela (" + pilares.length + ") = lances do C4 (" + arr(dp.pilares).length + ")");
      d.conferir("lajes", lajes.length <= lajesModelo.length, "lajes calculadas (" + lajes.length + ") ≤ lajes do modelo (" + lajesModelo.length + "); as demais estão listadas como sem cálculo");
      if (T) { d.conferir("kg-elementos", Math.abs(somaEl - T.totalKg) <= 1e-9 * Math.max(1, T.totalKg), "Σ aço por elemento (" + br(somaEl, 3) + " kg) = total da tabela (" + br(T.totalKg, 3) + " kg)"); d.conferir("kg-bitola", Math.abs(T.resumo.reduce(function (s2, r) { return s2 + r.kg; }, 0) - T.totalKg) <= 1e-9 * Math.max(1, T.totalKg), "Σ resumo por bitola = total da tabela"); }
      /* lido do HTML da seção 10 que acabou de sair (não do objeto que a gerou): a taxa tem de aparecer PARCIAL, sem o número solto como taxa do projeto */
      d.conferir("taxa-parcial", !det || (det.taxaKgM3 == null && /TAXA PARCIAL/.test(secHtml.detalhe || "") && !/Taxa de aço</.test(secHtml.detalhe || "")), "a taxa de aço aparece PARCIAL no texto da seção 10 e não é publicada como taxa do projeto");
      var eqOk = true; Object.keys(obj(an.equilibrio)).forEach(function (k) { var e = an.equilibrio[k]; if (e && e.residuo && e.somaCargas && Math.abs(e.residuo[1]) > 1e-6 * Math.max(1, Math.abs(e.somaCargas[1]))) eqOk = false; });
      d.conferir("equilibrio", eqOk, "equilíbrio ΣFy do pórtico fecha em todas as combinações");
      d.conferir("cc", classeConsequencia({ nPavimentos: nPav, uso: pr.uso }).cc === ccr.cc, "classe de consequência " + ccr.cc + " reproduzida a partir de " + br(ccr.nPavimentos, 0) + " pavimento(s) e uso " + ccr.uso);
      d.conferir("rotulo", (secHtml.objeto || "").indexOf(ROTULO) >= 0, "rótulo “" + ROTULO + "” presente no texto da seção 1");
      d.conferir("textos", I.estado.indefinidos.length === 0, "textos sem valor indefinido");
      confFalsas = d.conf.filter(function (k) { return !k.ok; }).length;
      return "@@CONFERENCIAS@@";
    }
    /* ---- 13. termo */
    function sTermo() {
      var h = "<p>Este memorial apresenta o cálculo de apoio da estrutura de concreto armado descrita na seção 1. Os valores são os dos motores C1 a C5 e dependem das premissas e pendências da seção 11. " + esc(ROTULO) + ".</p>";
      h += caixa("<b>A estrutura só pode ser executada após a ATP (seção 4), a revisão e a assinatura do responsável técnico, com a ART.</b>", "erro");
      if (dc.situacao) h += caixa("<b>" + esc(dc.situacao) + ".</b>", "alerta");
      var bloqueado = repro.length > 0 || confFalsas > 0;
      function bloco(titulo, linhas) { return '<div class="assin"><div class="assin-linha"></div>' + linhas.map(function (l) { return "<div>" + l + "</div>"; }).join("") + '<div class="assin-tit">' + titulo + "</div></div>"; }
      if (bloqueado) h += caixa("<b>ASSINATURA BLOQUEADA até zerar as reprovações.</b> " + plural(repro.length, "peça reprovada, incompleta ou sem cálculo", "peças reprovadas, incompletas ou sem cálculo") + (confFalsas ? " e " + plural(confFalsas, "conferência falsa", "conferências falsas") : "") + ". O memorial NÃO está liberado: os blocos de assinatura (responsável técnico, BIM Manager e contratante) só aparecem quando todas as peças atendem e as conferências fecham.", "erro");
      else h += '<div class="assin-grade">' + bloco("Responsável técnico", ["<b>" + ph(rp.nome, "NOME DO RESPONSÁVEL TÉCNICO") + "</b>", ph(rp.titulo, "TÍTULO PROFISSIONAL") + " — " + esc(rp.conselho || "CREA") + " nº " + ph(rp.crea, "Nº"), ph(rp.empresa, "EMPRESA")]) +
        bloco("BIM Manager", ["<b>" + ph(bm.nome, "NOME DO BIM MANAGER") + "</b>", ph(bm.titulo, "TÍTULO"), ph(bm.empresa, "EMPRESA")]) +
        bloco("Contratante", ["<b>" + ph(ct.nome, "REPRESENTANTE DA CONTRATANTE") + "</b>", ph(ct.cargo, "CARGO"), ph(ct.empresa || ob.contratante, "CONTRATANTE")]) + "</div>";
      h += '<p class="local">' + ph(opc.local || ob.cidade, "LOCAL") + ", " + esc(c.data) + ".</p>";
      return h;
    }
    var FN = { objeto: sObjeto, normas: sNormas, premissas: sPremissas, cc: sCC, acoes: sAcoes, analise: sAnalise, vigas: sVigas, lajes: sLajes, pilares: sPilares, detalhe: sDetalhe, pendencias: sPend, conferencias: sConf, termo: sTermo };
    var corpo = SECOES.map(function (s, i) {
      var h; try { h = FN[s.id](); secHtml[s.id] = h; } catch (e) { d.aviso("Seção " + (i + 1) + " (" + s.titulo + ") gerada com erro: " + (e && e.message)); h = caixa("<b>Esta seção não pôde ser gerada:</b> " + esc(e && e.message) + ".", "erro"); }
      return '<section class="sec" id="sec-' + s.id + '"><h2><span class="num">' + (i + 1) + "</span>" + esc(s.titulo) + '<span class="de">seção ' + (i + 1) + " de " + SECOES.length + " · " + esc(c.rev) + "</span></h2>" + h + "</section>";
    }).join("");
    var confHtml = '<ul class="conf">' + d.conf.map(function (k) { return "<li>" + (k.ok ? '<span class="ok">verdadeira</span>' : '<span class="falha">FALSA</span>') + " — " + esc(k.texto) + "</li>"; }).join("") + "</ul>";
    confHtml += d.avisos.length ? caixa("<b>Divergências encontradas:</b><ul>" + d.avisos.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>", "erro") : caixa("Todas as conferências internas passaram.");
    corpo = corpo.replace("@@CONFERENCIAS@@", confHtml);
    /* capa */
    function logoBox(src, rot, alt) { return '<div class="logo-box">' + (/^data:image\//i.test(String(src || "")) ? '<img class="logo" src="' + esc(src) + '" alt="' + esc(alt) + '">' : '<div class="logo-ph"><span class="ph">[LOGO]</span></div>') + '<div class="logo-rot">' + esc(rot) + "</div></div>"; }
    var naoAtendem = repro.length, bloqueado = naoAtendem > 0 || confFalsas > 0;
    var sitTxt = naoAtendem ? '<span class="falha">NÃO ATENDE — ' + plural(naoAtendem, "peça não atende", "peças não atendem") + " (seções 7 a 9)</span>" : '<span class="ok">Atende nas verificações do motor</span>; pendências na seção 11';
    var revs = arr(opc.revisoes); if (!revs.length) revs = [{ rev: c.rev, data: c.data, descricao: "Emissão inicial" }];
    var capa = '<section class="capa" id="sec-capa"><div class="capa-logos">' + logoBox(lg.ra, "Projeto e cálculo", "RA Engenharia") + logoBox(lg.contratante, "Contratante", "Contratante") + logoBox(lg.proprietario, "Proprietário", "Proprietário") + "</div>" +
      '<div class="capa-faixa"><span class="f1"></span><span class="f2"></span><span class="f3"></span></div>' +
      '<div class="capa-tit"><div class="sobre">MEMORIAL DE CÁLCULO ESTRUTURAL</div><h1>Estrutura de concreto armado — ' + esc(c.obraNome) + '</h1><div class="sub">Ações, análise, vigas, lajes, pilares, detalhamento das armaduras e tabela de aço — ' + esc(ROTULO) + "</div></div>" +
      (bloqueado ? '<div class="capa-sit nao-liberado">NÃO LIBERADO — ' + (naoAtendem ? plural(naoAtendem, "peça não atende / incompleta", "peças não atendem / incompletas") : "") + (naoAtendem && confFalsas ? " e " : "") + (confFalsas ? plural(confFalsas, "conferência falsa", "conferências falsas") : "") + "</div>" : '<div class="capa-sit liberado-nota">' + esc(ccr.cc) + " · ATP obrigatória · taxa de aço PARCIAL</div>") + '<div class="capa-arte"></div>' +
      '<table class="capa-ficha"><tbody><tr><td>Documento</td><td><b>' + ph(c.num, "Nº DO DOCUMENTO") + " " + esc(c.rev) + "</b> — " + esc(c.data) + "</td></tr><tr><td>Obra</td><td>" + ph(ob.nome, "OBRA") + "</td></tr>" +
      "<tr><td>Endereço</td><td>" + ph([ob.endereco, ob.cidade].filter(Boolean).join(" — "), "ENDEREÇO") + "</td></tr><tr><td>Contratante</td><td>" + ph(ob.contratante, "CONTRATANTE") + "</td></tr>" +
      "<tr><td>Responsável técnico</td><td>" + ph(rp.abrev || rp.titulo, "TÍTULO") + " " + ph(rp.nome, "NOME") + " — " + esc(rp.conselho || "CREA") + " nº " + ph(rp.crea, "Nº") + " — " + ph(rp.empresa, "EMPRESA") + "</td></tr>" +
      "<tr><td>Classe de consequência</td><td>" + esc(ccr.cc) + " — " + esc(ccr.motivo) + "</td></tr><tr><td>Situação do cálculo</td><td" + (naoAtendem ? ' class="sit-falha"' : "") + ">" + sitTxt + "</td></tr></tbody></table>" +
      '<table class="capa-rev"><caption>Quadro de revisões</caption><thead><tr><th>Rev.</th><th>Data</th><th>Descrição</th><th>Por</th></tr></thead><tbody>' + revs.map(function (x) { return "<tr><td>" + esc(x.rev) + "</td><td>" + esc(x.data) + "</td><td>" + esc(x.descricao) + "</td><td>" + esc(x.por || "") + "</td></tr>"; }).join("") + "</tbody></table></section>";
    var sum = '<section class="sumario" id="sumario"><h2 class="sem-num">Sumário</h2><ol class="sum">' + SECOES.map(function (s, i) { return '<li><a href="#sec-' + s.id + '"><span class="sn">' + (i + 1) + "</span>" + esc(s.titulo) + "</a></li>"; }).join("") + "</ol>" +
      '<p class="nota">Este memorial contém ' + SECOES.length + " seções numeradas e " + d.nTab + " tabelas. Documento " + esc(c.num) + " " + esc(c.rev) + " de " + esc(c.data) + ".</p></section>";
    var estilo = I.css(c).split(" — Estrutura de madeira").join(" — Estrutura de concreto armado") + ".marca-dagua { position: fixed; top: 45%; left: 50%; transform: translate(-50%, -50%) rotate(-32deg); font: 700 50pt Helvetica, Arial, sans-serif; color: rgba(163, 53, 43, 0.15); white-space: nowrap; z-index: 9999; pointer-events: none; letter-spacing: 0.06em; } .capa-sit.nao-liberado { background: #fbefed; font-size: 11pt; }";
    var titulo = "Memorial de cálculo estrutural — concreto armado — " + c.obraNome + (bloqueado ? " — NAO-LIBERADO" : "");
    var html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="generator" content="OrçaPRO — ConcMemorial"><title>' + esc(titulo) + "</title><style>" + estilo + "</style></head><body>" + (bloqueado ? '<div class="marca-dagua">NÃO LIBERADO</div>' : "") + capa + sum + corpo + "</body></html>";
    return { ok: true, html: html, titulo: titulo, secoes: SECOES.map(function (s, i) { return { id: s.id, numero: i + 1, titulo: s.titulo }; }), tabelas: d.nTab, avisos: d.avisos.slice(), conferencias: d.conf.slice(), classeConsequencia: ccr,
             taxaParcial: det ? det.taxaParcial === true : null, rotulo: ROTULO, bloqueado: bloqueado, reprovadas: repro, conferenciasFalsas: confFalsas, nomeArquivo: nomeArquivo(pac, "html", bloqueado) };
  }

  /* ---------------------------------------------------------------- XLSX (nunca CSV): ExcelJS entra como argumento (o app o carrega por ExcelOrc.ensureExcelJS) */
  function xlsx(ExcelJS, pac, opc) {
    opc = opc || {};
    var det = pac && detDe(pac); if (!det || !det.tabela) return null;
    var bloq = opc.bloqueado != null ? opc.bloqueado : reprovadasDe(pac).length > 0;
    var wb = new ExcelJS.Workbook(), T = det.tabela, AZ = "FF12314F", ZB = "FFF1F6FB", BR = "FFFFFFFF";
    wb.creator = "OrçaPRO — memorial de cálculo (C6)"; wb.created = new Date();
    function cab(ws, cols, titulo, sub) {
      ws.getCell(1, 1).value = titulo; ws.getCell(1, 1).font = { bold: true, size: 13, color: { argb: AZ } };
      ws.getCell(2, 1).value = sub; ws.getCell(2, 1).font = { italic: true, size: 9, color: { argb: "FFB26A00" } };
      cols.forEach(function (c, i) { var x = ws.getCell(4, i + 1); x.value = c.h; x.font = { bold: true, color: { argb: BR } }; x.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZ } }; x.alignment = { vertical: "middle", horizontal: c.num ? "right" : "left", wrapText: true }; ws.getColumn(i + 1).width = c.w || 14; });
      ws.views = [{ state: "frozen", ySplit: 4 }];
      if (bloq) { ws.headerFooter = { oddHeader: '&C&"Arial,Bold"&20&K A3352B NÃO LIBERADO', evenHeader: '&C&"Arial,Bold"&20&K A3352B NÃO LIBERADO', oddFooter: "&LNÃO LIBERADO — " + ROTULO }; ws.getCell(3, 1).value = "NÃO LIBERADO"; ws.getCell(3, 1).font = { bold: true, size: 12, color: { argb: "FFA3352B" } }; }
    }
    function linha(ws, r, cols, vals) { cols.forEach(function (c, i) { var x = ws.getCell(r, i + 1); x.value = vals[i]; if (c.fmt) x.numFmt = c.fmt; if (r % 2 === 0) x.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZB } }; }); }
    var AV = (bloq ? "NÃO LIBERADO — " : "") + ROTULO + " — taxa de aço PARCIAL (ver aba Resumo)";
    wb.nomeArquivo = nomeArquivo(pac, "xlsx", bloq); wb.bloqueado = bloq;
    /* Resumo */
    var w1 = wb.addWorksheet("Resumo"), c1 = [{ h: "Item", w: 44 }, { h: "Valor", w: 60 }];
    cab(w1, c1, "Memorial de cálculo estrutural — tabela de aço", AV);
    var R = [["Aço líquido (kg)", T.totalKg], ["Perda (fração)", T.perda], ["Aço com perda (kg)", T.totalKgComPerda], ["Volume de concreto das peças detalhadas (m³, bruto)", det.volumeDetalhadoM3], ["TAXA PARCIAL (kg/m³ líquidos) — NÃO é taxa do projeto", det.taxaParcialKgM3],
      ["Taxa parcial com perda (kg/m³)", det.taxaParcialKgM3ComPerda], ["Falta no cálculo", arr(det.faltou).join("; ")], ["Massa linear", T.massa], ["Ressalva da norma", RESSALVA]];
    R.forEach(function (x, i) { linha(w1, 5 + i, c1, x); if (typeof x[1] === "number") w1.getCell(5 + i, 2).numFmt = "#,##0.000"; w1.getCell(5 + i, 2).alignment = { wrapText: true, vertical: "top" }; });
    /* Resumo por bitola, com fórmulas */
    var w2 = wb.addWorksheet("Resumo por bitola"), c2 = [{ h: "Aço", w: 10 }, { h: "φ (mm)", w: 10, num: true }, { h: "Massa linear (kg/m)", w: 18, num: true, fmt: "0.000" }, { h: "Comprimento (m)", w: 16, num: true, fmt: "#,##0.00" }, { h: "Massa (kg)", w: 14, num: true, fmt: "#,##0.00" }, { h: "Com perda (kg)", w: 16, num: true, fmt: "#,##0.00" }];
    cab(w2, c2, "Resumo do aço por bitola e classe", AV);
    T.resumo.forEach(function (r, i) { var x = 5 + i; linha(w2, x, c2, [r.aco, r.phi, r.massaLinear, r.comprimentoM, { formula: "D" + x + "*C" + x, result: r.comprimentoM * r.massaLinear }, { formula: "E" + x + "*(1+" + T.perda + ")", result: r.comprimentoM * r.massaLinear * (1 + T.perda) }]); });
    var ult = 4 + T.resumo.length, tr = ult + 1;
    w2.getCell(tr, 1).value = "TOTAL"; w2.getCell(tr, 1).font = { bold: true };
    w2.getCell(tr, 5).value = { formula: "SUM(E5:E" + ult + ")", result: T.totalKg }; w2.getCell(tr, 6).value = { formula: "SUM(F5:F" + ult + ")", result: T.totalKgComPerda }; w2.getCell(tr, 5).numFmt = w2.getCell(tr, 6).numFmt = "#,##0.00"; w2.getCell(tr, 5).font = w2.getCell(tr, 6).font = { bold: true };
    /* Por posição */
    var w3 = wb.addWorksheet("Tabela de aço"), c3 = [{ h: "Elemento", w: 22 }, { h: "N", w: 7 }, { h: "Descrição", w: 44 }, { h: "Aço", w: 8 }, { h: "φ (mm)", w: 8, num: true }, { h: "Quant.", w: 8, num: true }, { h: "C unit. (cm)", w: 12, num: true, fmt: "#,##0.0" }, { h: "Total (m)", w: 12, num: true, fmt: "#,##0.00" }, { h: "Massa (kg)", w: 12, num: true, fmt: "#,##0.00" }];
    cab(w3, c3, "Tabela de aço por posição (todos os elementos)", AV);
    T.linhas.forEach(function (l, i) { var x = 5 + i; linha(w3, x, c3, [l.elemento, l.id, l.nome, l.aco, l.phi, l.qtd, l.comprimentoCm, { formula: "F" + x + "*G" + x + "/100", result: l.totalM }, { formula: "H" + x + "*" + (0.006165 * l.phi * l.phi), result: l.kg }]); });
    var u3 = 4 + T.linhas.length; w3.getCell(u3 + 1, 1).value = "TOTAL"; w3.getCell(u3 + 1, 1).font = { bold: true };
    w3.getCell(u3 + 1, 9).value = { formula: "SUM(I5:I" + u3 + ")", result: T.totalKg }; w3.getCell(u3 + 1, 9).numFmt = "#,##0.00"; w3.getCell(u3 + 1, 9).font = { bold: true };
    w3.autoFilter = { from: { row: 4, column: 1 }, to: { row: u3, column: 9 } };
    /* Por elemento */
    var w4 = wb.addWorksheet("Por elemento"), c4 = [{ h: "Tipo", w: 10 }, { h: "Elemento", w: 26 }, { h: "Posições", w: 10, num: true }, { h: "Massa (kg)", w: 14, num: true, fmt: "#,##0.00" }];
    cab(w4, c4, "Aço por elemento", AV);
    var k4 = 5;
    [["Viga", det.vigas], ["Pilar", det.pilares], ["Laje", det.lajes]].forEach(function (g) { arr(g[1]).forEach(function (r) { linha(w4, k4, c4, [g[0], (arr(r.posicoes)[0] && r.posicoes[0].elemento) || r.id, arr(r.posicoes).length, r.tabela.totalKg]); k4++; }); });
    w4.getCell(k4, 1).value = "TOTAL"; w4.getCell(k4, 1).font = { bold: true }; w4.getCell(k4, 4).value = { formula: "SUM(D5:D" + (k4 - 1) + ")", result: T.totalKg }; w4.getCell(k4, 4).numFmt = "#,##0.00"; w4.getCell(k4, 4).font = { bold: true };
    /* Pendências */
    var w5 = wb.addWorksheet("Pendências"), c5 = [{ h: "#", w: 6, num: true }, { h: "Pendência / aviso do detalhamento", w: 120 }];
    cab(w5, c5, "Pendências do detalhamento (C5)", AV);
    var vistos = {}, n5 = 0; [].concat(arr(det.avisos)).concat([].concat(arr(det.vigas), arr(det.pilares), arr(det.lajes)).reduce(function (a, r) { return a.concat(arr(r.pendencias)); }, [])).forEach(function (x) { if (vistos[x]) return; vistos[x] = 1; n5++; linha(w5, 4 + n5, c5, [n5, x]); w5.getCell(4 + n5, 2).alignment = { wrapText: true, vertical: "top" }; });
    return wb;
  }

  var ConcMemorial = { reprovada: reprovada, reprovadasDe: reprovadasDe, nomeArquivo: nomeArquivo, gerar: gerar, xlsx: xlsx, classeConsequencia: classeConsequencia, pacoteDe: pacoteDe, SECOES: SECOES, RESSALVA: RESSALVA, ROTULO: ROTULO };
  global.ConcMemorial = ConcMemorial;
  if (typeof module !== "undefined" && module.exports) module.exports = ConcMemorial;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
