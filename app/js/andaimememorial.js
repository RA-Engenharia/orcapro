/* =====================================================================
 * andaimememorial.js — MEMORIAL DE CÁLCULO COMPLETO DO ANDAIME TUBO-ROLL (E8, 27/10/2026). Motor PURO, ES5, sem DOM.
 *
 *   AndaimeMemorial.gerar(modelo, calc, docs, opcoes) → { ok, html, titulo, secoes[], figuras, tabelas, avisos[], liberado }
 *   HTML A4 no formato do js/acomemorial.js (@page com "Página X de Y", figuras SVG inline, imprime em PDF).
 *
 * ⚠ UMA FONTE SÓ: os números de cada verificação (esforço, resistência, uso, situação), as reações e os dados do projeto vêm das MESMAS
 *   funções que desenham o quadro da prancha (AndaimePranchas.quadroVerificacoes / quadroReacoes / dadosProjeto) e do MESMO cálculo
 *   (AndaimeCalc.calcular). Nada é refeito aqui. Por quê: memorial e prancha com números diferentes é o defeito que reprova a obra na fiscalização.
 * ⚠ Memorial de andaime com verificação que FALHA (ou sem cálculo) sai com a faixa «NÃO LIBERADO» na capa e no rodapé de cada seção.
 * Teste: node tools/test-andaimepranchas.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } } return null; }
  function AN() { return dep("Andaime", "./andaime.js"); }
  function AD() { return dep("AndaimeDocs", "./andaimedocs.js"); }
  function PA() { return dep("AndaimePranchas", "./andaimepranchas.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function br(v, c) {
    if (v == null || typeof v !== "number" || !isFinite(v)) return "-";
    c = c == null ? 2 : c; var s = (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c), neg = s.charAt(0) === "-"; if (neg) s = s.slice(1);
    var p = s.split("."); return (neg ? "-" : "") + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (p[1] ? "," + p[1] : "");
  }
  function ph(v, rot) { var s = txt(v).trim(); return s ? esc(s) : '<span class="ph">[' + esc(rot) + "]</span>"; }
  function hoje() { var d = new Date(); function z(k) { return ("0" + k).slice(-2); } return z(d.getDate()) + "/" + z(d.getMonth() + 1) + "/" + d.getFullYear(); }

  var NORMAS = [
    ["NR-18 (Portaria MTE 836/2026)", "18.9.4.2 (guarda-corpo 1,20 / 0,70 m, rodapé ≥ 0,15 m), 18.12.1 a 18.12.15 (andaimes: projeto, torre 4×, liberação formal 18.12.4, escada 18.12.14, tela 18.12.15). Fonte primária."],
    ["NR-35", "35.1.1: trabalho em altura acima de 2,00 m."],
    ["ABNT NBR 6494:1990", "Segurança nos andaimes. ⚠ EXEMPLAR NÃO LICENCIADO (cópia sem autorização): só valores com o número do item; vigência não confirmada em fonte oficial; conferir no exemplar licenciado antes de emitir. As alturas de guarda-corpo desta norma (0,50 / 1,00 m) não são usadas: vale a NR-18 (1,20 / 0,70 m), mais nova e mais exigente."],
    ["ABNT NBR 8800:2008", "Projeto de estruturas de aço (resistência do tubo, flambagem do montante, flexão)."],
    ["ABNT NBR 6123:2023", "Forças devidas ao vento (S1, S2 por faixa de altura, S3 = 1,00 — Tabela 4, grupo 3, estrutura desmontável com vistas a reutilização; coeficientes da tela e do tubo)."],
    ["ABNT NBR 8681", "Ações e segurança nas estruturas (combinações)."],
    ["Critério NB-14 (tensões admissíveis)", "Usado SÓ como conferência do montante (fonte secundária: material de cálculo de empresa de andaimes)."]
  ];
  var CSS = "@page { size: A4; margin: 20mm 15mm 18mm 20mm; @bottom-right { content: \"Página \" counter(page) \" de \" counter(pages); font: 7.5pt Arial, sans-serif; color: #5b6774; } @bottom-left { content: \"Memorial de cálculo do andaime\"; font: 7.5pt Arial, sans-serif; color: #5b6774; } }" +
    "@page :first { @bottom-right { content: none; } @bottom-left { content: none; } }" +
    "html { -webkit-print-color-adjust: exact; print-color-adjust: exact; } body { font: 9.4pt/1.42 'Segoe UI', Helvetica, Arial, sans-serif; color: #1d2733; margin: 0; }" +
    "@media screen { body { max-width: 182mm; margin: 10mm auto; padding: 0 10mm; } }" +
    "h1 { font-size: 21pt; margin: 2mm 0 3mm; } h2 { font-size: 14pt; margin: 0 0 4mm; padding-bottom: 1.6mm; border-bottom: 1.4pt solid #2d6a9c; break-after: avoid; } h2 .num { color: #2d6a9c; margin-right: 3mm; } h3 { font-size: 10.5pt; margin: 4mm 0 1.5mm; break-after: avoid; }" +
    "p { margin: 0 0 2.2mm; text-align: justify; } ul { margin: 0 0 2.4mm; padding-left: 5mm; } li { margin-bottom: 0.8mm; } .sec { break-before: page; }" +
    "table.t { width: 100%; border-collapse: collapse; margin: 1.5mm 0 4mm; font-size: 8pt; line-height: 1.32; } table.t th { background: #e8eef4; text-align: left; border: 0.5pt solid #b8c4d0; padding: 1.1mm 1.4mm; } table.t td { border: 0.5pt solid #ccd5de; padding: 0.9mm 1.4mm; vertical-align: top; overflow-wrap: break-word; }" +
    "table.t td.n { text-align: right; white-space: nowrap; } thead { display: table-header-group; } tr { break-inside: avoid; }" +
    ".nota { font-size: 7.8pt; color: #4a5664; } .ok { color: #2e6b3f; font-weight: 600; } .falha { color: #a3352b; font-weight: 600; } .ph, .verm { color: #b3261e; } .rt { color: #a86a10; font-size: 8pt; }" +
    ".faixa { border: 2pt solid #b3261e; color: #b3261e; font-weight: 700; text-align: center; padding: 2mm; margin: 3mm 0; font-size: 12pt; }" +
    ".caixa { border: 0.6pt solid #b8c4d0; border-left: 2.4pt solid #2d6a9c; background: #f3f6f9; padding: 2.4mm 3mm; margin: 2mm 0 4mm; } .fig { text-align: center; margin: 2mm 0 5mm; break-inside: avoid; } .fig svg { max-width: 100%; height: auto; }" +
    ".capa { height: 250mm; break-after: page; } .capa .sobre { font-size: 8.5pt; letter-spacing: 0.18em; color: #2d6a9c; font-weight: 600; } .assin { margin: 18mm auto 0; width: 95mm; text-align: center; font-size: 9pt; } .assin .linha { border-top: 0.6pt solid #1d2733; margin-bottom: 2mm; }";

  function tabela(cab, linhas, cls) {
    return '<table class="t ' + (cls || "") + '"><thead><tr>' + cab.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      linhas.map(function (r) { return "<tr>" + r.map(function (c) { var o = (c && typeof c === "object") ? c : { t: c }; return "<td" + (o.n ? ' class="n"' : "") + ">" + (o.h ? o.t : esc(o.t)) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>";
  }
  var FMT_KEY = /_kN$|_kNm$|_m$|_kgf|_kPa|_MPa|_mm$/;
  function valoresTab(v) {
    if (!v || typeof v !== "object") return "";
    var ks = Object.keys(v).filter(function (k) { return typeof v[k] === "number" || typeof v[k] === "string" || typeof v[k] === "boolean"; });
    if (!ks.length) return "";
    return tabela(["Grandeza", "Valor"], ks.map(function (k) { var x = v[k]; return [k.replace(/_/g, " "), { t: typeof x === "number" ? br(x, Math.abs(x) >= 100 ? 1 : 3) : (x === true ? "sim" : (x === false ? "não" : x)), n: true }]; }), "compacta");
  }

  function gerar(modelo, calc, docs, opcoes) {
    opcoes = opcoes || {}; docs = docs || {};
    var An = AN(), Ad = AD(), Pa = PA(), avisos = [];
    if (!modelo || !modelo.ok) return { ok: false, motivo: "Sem modelo de andaime montado.", html: "", titulo: "", secoes: [], figuras: 0, tabelas: 0, avisos: [] };
    if (!An || !Pa) return { ok: false, motivo: "Módulos do andaime não carregados.", html: "", titulo: "", secoes: [], figuras: 0, tabelas: 0, avisos: [] };
    var M = modelo.medidas || {}, P = modelo.par || {}, sit = Pa.situacao(calc, modelo), cc = (calc && calc.calc && !calc.verificacoes) ? calc.calc : calc, ver = Pa.quadroVerificacoes(calc), rea = Pa.quadroReacoes(calc);
    var lista = Ad ? Ad.listaLocacao(modelo, opcoes.cab || {}, opcoes) : { linhas: [], totais: { pecas: 0, pesoKg: 0 } }, plano = docs.plano || (Ad ? Ad.planoMontagem(modelo, P) : { passos: [], desmontagem: { avisos: [] } }), chk = docs.checklist || (Ad ? Ad.checklist(modelo, P, {}) : { itens: [] });
    var dados = Pa.dadosProjeto(modelo, calc, opcoes), obra = txt(opcoes.obra) || "Obra", rev = txt(opcoes.revisao) || "R00", data = txt(opcoes.data) || hoje(), nTab = 0, nFig = 0, secs = [];
    function T(cab, l, c) { nTab++; return tabela(cab, l, c); }
    function sec(id, titulo, corpo) { secs.push({ id: id, titulo: titulo, html: corpo }); }
    var faixaH = sit.liberado ? "" : '<div class="faixa">' + esc(sit.faixa.replace(/ - /, " — ")) + "</div>";

    sec("objeto", "Objeto", "<p>Projeto de andaime tubo-roll (tubo e abraçadeira) para trabalho em altura (acima de 2,00 m — NR-35 35.1.1): descrição, normas, hipóteses, cargas, verificações de cada peça, reações nas bases, o que não foi verificado, lista de locação, plano de montagem, checklist e liberação de uso. Não trata de fabricação nem de custo.</p>" +
      T(["Medida", "Valor"], [["Comprimento traçado", { t: br(M.comprimento, 2) + " m", n: true }], ["Largura da plataforma (entre eixos)", { t: br(M.largura, 2) + " m", n: true }], ["Piso do topo", { t: br(M.alturaPiso, 2) + " m", n: true }], ["Vãos / levantes / pisos", { t: M.nVaos + " / " + M.nLevantes + " / " + M.nPisos, n: true }],
        ["Pontaletes (prumadas)", { t: String(M.nMontantes), n: true }], ["Ancoragens", { t: String(M.nAncoragens), n: true }], ["Área de piso", { t: br(M.areaPiso, 2) + " m²", n: true }], ["Tela", { t: br(modelo.tela ? modelo.tela.area : 0, 2) + " m²", n: true }]]) + faixaH);
    var iso = ""; try { iso = Pa.isometricoSvg(modelo, 170, 118, {}); } catch (e) { avisos.push("Isométrico do memorial não gerado: " + (e && e.message)); }
    if (iso) { nFig++; secs[0].html += '<div class="fig">' + iso + "<br><span class=\"nota\">Figura 1 — isométrico do andaime (arame, linhas ocultas removidas; as mesmas da prancha).</span></div>"; }
    sec("normas", "Normas e fontes", "<ul>" + NORMAS.map(function (x) { return "<li><b>" + esc(x[0]) + ".</b> " + (/NÃO LICENCIADO/.test(x[1]) ? '<span class="ph">' + esc(x[1]) + "</span>" : esc(x[1])) + "</li>"; }).join("") +
      "</ul><p class=\"nota\">Valores de fonte secundária (apostilas de montador, material de cálculo e catálogo de locador, HSA Irlanda, EN 12811) aparecem marcados e são confirmados pelo responsável técnico.</p>");
    var hip = "";
    arr(modelo.parametrosRT).forEach(function (x) { var def = An.PARAMETROS_RT ? An.PARAMETROS_RT[x.chave] : null; hip += "<tr><td>" + esc(x.chave) + '</td><td class="n">' + esc(typeof x.valor === "number" ? br(x.valor, 3) : x.valor) + "</td><td>" + (def && def.regra ? "regra de norma" : '<span class="rt">confirmar pelo responsável técnico</span>') + '<div class="nota">' + esc(x.obs || "") + "</div></td></tr>"; });
    nTab++;
    sec("dados", "Dados do projeto e hipóteses", T(["Dado", "Valor"], dados.map(function (d) { var o = d[1] && typeof d[1] === "object"; return [d[0], { t: Pa.textoDado(d), h: false, n: false }].map(function (c, i) { return (i && o) ? { t: '<span class="verm">' + esc(c.t) + "</span>", h: true } : c; }); })) +
      '<h3>Parâmetros de projeto <span class="rt">(confirmar pelo responsável técnico)</span></h3><table class="t"><thead><tr><th>Parâmetro</th><th>Valor</th><th>Situação</th></tr></thead><tbody>' + hip + "</tbody></table>" +
      (cc && cc.parametros ? "<p class=\"nota\">Parâmetros do cálculo: aço fy = " + br(cc.parametros.fy, 0) + " MPa, fu = " + br(cc.parametros.fu, 0) + " MPa; K = " + br(cc.parametros.K, 2) + " (só na conferência NB-14); excentricidade da abraçadeira " + br(cc.parametros.eAbrac, 3) + " m; abraçadeira fixa/giratória " + br(cc.parametros.capFixaKgf, 0) + " / " + br(cc.parametros.capGiratoriaKgf, 0) + " kgf (ao deslizamento); luva da longitudinal " + (cc.parametros.luvaRigida ? "contínua (RT confirmou)" : "como rótula (conservador)") + ".</p>" : ""));
    var ct = Pa.cargaTrabalho(calc, opcoes);
    sec("cargas", "Cargas e combinações", "<p>Carga de trabalho admissível (NBR 6494 3.1.4): " + (ct.q == null ? '<span class="ph">[CARGA DE SERVIÇO — definir no cálculo]</span>' : br(ct.q, 2) + " kN/m² (" + br(ct.kgf, 0) + " kgf/m²) por piso, " + esc(Pa.textoPisos(ct.pisos))) + (ct.q == null ? "" : ".") + " Peso próprio pelo modelo (lista de locação); vento pela NBR 6123:2023 com a velocidade básica do local.</p>" +
      "<p>Combinações (NBR 8681), vale a pior: (1) 1,25 G + 1,5 Q + 1,4 × 0,6 W; (2) 1,25 G + 1,4 W (vento principal SEM Q — a NBR 6494 3.3.4 manda parar com vento forte); ancoragem: força de SERVIÇO do vento; tombamento: 1,0 G + 1,4 W; ELS = G + Q. <span class=\"rt\">Confirmar pelo responsável técnico.</span></p>" +
      (cc && cc.vento && cc.vento.ok ? "<p>Vento: V0 = " + br(cc.vento.V0, 0) + " m/s (" + esc(cc.vento.fonteV0 || "") + "), categoria " + esc(cc.vento.categoria) + ".</p>" : '<p class="verm"><b>Vento NÃO verificado:</b> ' + esc(cc && cc.vento ? cc.vento.motivo : "cálculo não executado") + "</p>"));
    /* verificações: o texto da prancha (quadro) + fórmula e valores do cálculo */
    var vh = "";
    if (!cc || !arr(cc.verificacoes).length) vh = '<p class="faixa">CÁLCULO AINDA NÃO EXECUTADO — NÃO LIBERAR. Nenhuma verificação foi feita; este documento não atesta a segurança do andaime.</p>';
    else {
      vh += "<p><b>" + esc(cc.resumo || "") + "</b></p>";
      vh += T(["Verificação", "Esforço solicitante", "Resistência", "Uso", "Situação"], ver.map(function (q) { return [q.peca, q.esforco, q.resistencia, { t: q.uso, n: true }, { t: '<span class="' + (q.estado === "ok" ? "ok" : "falha") + '">' + esc(q.situacao) + "</span>", h: true }]; }));
      arr(cc.verificacoes).forEach(function (v, i) {
        var q = ver[i];
        vh += "<h3>" + (i + 1) + ". " + esc(v.titulo || v.id) + "</h3><p><b>Fórmula:</b> " + esc(v.formula || "—") + "</p>" + (v.texto ? "<p>" + esc(v.texto) + "</p>" : "") +
          "<p><b>Resultado:</b> esforço " + esc(q.esforco || "—") + "; resistência " + esc(q.resistencia || "—") + "; uso " + esc(q.uso) + " — <span class=\"" + (q.estado === "ok" ? "ok" : "falha") + "\">" + esc(q.situacao) + "</span>. <span class=\"nota\">Fonte: " + esc(v.fonte || "") + "</span></p>" + valoresTab(v.valores);
        arr(v.ressalvas).forEach(function (r) { vh += '<p class="nota verm">' + esc(r) + "</p>"; });
        if (arr(v.confirmarRT).length) vh += '<p class="nota"><span class="rt">confirmar pelo responsável técnico:</span> ' + esc(v.confirmarRT.join("; ")) + "</p>";
        if (arr(v.corrigir).length) vh += '<p class="nota">Como corrigir (refeito para provar): ' + v.corrigir.map(function (c0) { return esc(c0.texto); }).join("; ") + "</p>";
      });
    }
    sec("verificacoes", "Verificações (peça por peça)", faixaH + vh);
    /* montante: autovalor e conferência NB-14 */
    var mt = arr(cc && cc.verificacoes).filter(function (v) { return v.id === "montante"; })[0], mh = "";
    if (mt && mt.valores) mh += "<p>O montante é verificado pelo <b>autovalor</b> do montante sobre as molas reais dos nós (NBR 8800 Anexo E): Ne = " + br(mt.valores.Ne_kN, 2) + " kN, KL equivalente = " + br(mt.valores.KL_m, 2) + " m, χ = " + br(mt.valores.chi, 3) + ", Nc,Rd = " + br(mt.valores.NcRd_kN, 2) + " kN. <b>Conferência NB-14</b> (fonte secundária; o cálculo é a NBR 8800): σ = " + br(mt.valores.NB14_sigma_kgfcm2, 0) + " kgf/cm², Nadm = " + br(mt.valores.NB14_Nadm_kgf, 0) + " kgf, uso " + br(mt.valores.NB14_uso, 3) + ".</p>";
    var pr = arr(cc && cc.verificacoes).filter(function (v) { return v.id === "prancha" || v.id === "prancha_pontual"; });
    pr.forEach(function (v) { mh += "<p><b>" + esc(v.titulo) + ":</b> " + esc(v.texto || "") + "</p>"; });
    if (!mh) mh = "<p>Sem cálculo executado: nada a conferir.</p>";
    sec("montante", "Montante (autovalor e conferência NB-14) e pranchão", mh);
    var rh = rea.length ? T(["Base", "Montante", "Serviço (kN)", "Serviço (kgf)", "ELU1 (kN)", "ELU1 (kgf)"], rea.map(function (r) { return [r.base, r.poste, { t: r.servico_kN, n: true }, { t: r.servico_kgf, n: true }, { t: r.elu_kN, n: true }, { t: r.elu_kgf, n: true }]; })) : '<p class="verm">Sem reações (cálculo não executado).</p>';
    sec("reacoes", "Reações nas bases", rh);
    var nv = ["Resistência do solo, da laje ou do piso onde o andaime apoia (depende de dado do local).", "Resistência da estrutura onde os olhais são fixados e ensaio de arrancamento em campo.", "Estado real do material do locador (certificados, manual em português, inspeção de recebimento).", "Montagem em campo: conferência de prumo, esquadro, torque e travamentos (checklist antes da liberação)."];
    arr(cc && cc.naoVerificado).forEach(function (x) { nv.push(x); });
    ver.forEach(function (q) { if (q.estado === "nao_verificado") nv.push("Não verificado: " + q.peca + "."); });
    sec("naoverif", "O que NÃO foi verificado", "<ul>" + nv.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>");
    var pend = arr(cc && cc.pendencias).concat(arr(modelo.pendencias)), ph2 = pend.length ? "<ul>" + pend.map(function (x) { return '<li class="verm">' + esc(x) + "</li>"; }).join("") + "</ul>" : "<p>Nenhuma pendência registrada no cálculo.</p>";
    arr(modelo.avisos).forEach(function (a) { ph2 += '<p class="nota verm">Aviso do modelo: ' + esc(a) + "</p>"; });
    var cl = sit.pendencias.length ? T(["Nº", "Pendência (o que falta)", "Campo a preencher", "Item da norma", "Feito"], sit.pendencias.map(function (p, i) { return [{ t: String(i + 1), n: true }, { t: '<span class="verm">' + esc(p.texto) + "</span>", h: true }, p.campo, p.norma, "[   ]"]; })) : "<p>Nenhuma pendência aberta.</p>";
    sec("pendencias", "Pendências para o responsável técnico — como liberar", ph2 + "<h3>COMO LIBERAR O ANDAIME</h3>" + cl + "<p class=\"nota\">Depois de preencher os campos: refazer o cálculo, conferir que nenhuma verificação falha nem fica não verificada, reemitir as pranchas em revisão nova e assinar a liberação (NR-18 18.12.4).</p>");
    sec("lista", "Lista de locação (resumo)", "<p>" + lista.totais.pecas + " peças, " + br(lista.totais.pesoKg, 2) + " kg" + (lista.totais.m2Tela ? ", " + br(lista.totais.m2Tela, 2) + " m² de tela" : "") + ".</p>" +
      T(["Item", "Qnt.", "Peça"], arr(lista.linhas).map(function (l) { return [{ t: String(l.item), n: true }, { t: br(l.qtd, l.un === "m²" ? 2 : 0), n: true }, l.nome]; })));
    sec("plano", "Plano de montagem (resumo)", "<ol>" + arr(plano.passos).map(function (x) { return "<li>" + esc(x.titulo) + (x.totalPecas ? " — " + x.totalPecas + " peças" : "") + "</li>"; }).join("") + "</ol>" + arr(plano.desmontagem && plano.desmontagem.avisos).map(function (a) { return '<p class="verm">' + esc(a) + "</p>"; }).join(""));
    var gr = {}, ordem = []; arr(chk.itens).filter(function (i) { return arr(i.momentos).indexOf("antes") >= 0; }).forEach(function (i) { if (!gr[i.grupo]) { gr[i.grupo] = []; ordem.push(i.grupo); } gr[i.grupo].push(i); });
    sec("checklist", "Checklist de liberação (antes do 1º uso)", ordem.map(function (g) { return "<h3>" + esc(g) + "</h3><ul style=\"list-style:none;padding-left:0\">" + gr[g].map(function (i) { return "<li>☐ " + esc(i.texto) + ' <span class="nota">[' + esc(i.fonte || "") + "]</span></li>"; }).join("") + "</ul>"; }).join(""));
    sec("assinatura", "Responsável técnico e liberação", faixaH + "<table class=\"t\"><tbody><tr><td>Responsável técnico</td><td>" + ph(opcoes.responsavel, "NOME DO RESPONSÁVEL TÉCNICO") + "</td><td>CREA/CAU</td><td>" + ph(opcoes.registro, "Nº DO REGISTRO") + "</td><td>ART</td><td>" + ph(opcoes.art, "Nº DA ART") + "</td></tr>" +
      "<tr><td>Assinatura</td><td colspan=\"5\" style=\"height:12mm\"></td></tr><tr><td>Liberação de uso (NR-18 18.12.4)</td><td colspan=\"5\">" + ph(opcoes.liberadoPor, "NOME DE QUEM LIBEROU — profissional de SST ou responsável pela frente/obra") + " — " + ph("", "DATA E ASSINATURA") + "</td></tr></tbody></table>" +
      '<div class="assin"><div class="linha"></div><div>' + ph(opcoes.responsavel, "NOME DO RESPONSÁVEL TÉCNICO") + "</div></div>");
    var corpo = secs.map(function (s, i) { return '<section class="sec" id="sec-' + s.id + '"><h2><span class="num">' + (i + 1) + "</span>" + esc(s.titulo) + "</h2>" + s.html + "</section>"; }).join("");
    var capa = '<section class="capa" id="sec-capa"><div class="sobre">MEMORIAL DE CÁLCULO</div><h1>Memorial de cálculo — Andaime tubo-roll</h1><p>' + esc(obra) + "</p>" + faixaH +
      "<table class=\"t\"><tbody><tr><td>Estrutura</td><td>Andaime tubo-roll, " + br(M.comprimento, 2) + " m × " + br(M.largura, 2) + " m, piso do topo a " + br(M.alturaPiso, 2) + " m; " + lista.totais.pecas + " peças, " + br(lista.totais.pesoKg, 0) + " kg</td></tr>" +
      "<tr><td>Situação do cálculo</td><td>" + (cc && cc.resumo ? esc(cc.resumo) : '<span class="verm">cálculo não executado</span>') + "</td></tr><tr><td>Empresa</td><td>" + ph(opcoes.empresa, "EMPRESA") + "</td></tr><tr><td>Contratante / proprietário</td><td>" + ph(opcoes.proprietario, "CONTRATANTE / PROPRIETÁRIO") + "</td></tr><tr><td>Responsável técnico</td><td>" + ph(opcoes.responsavel, "NOME DO RESPONSÁVEL TÉCNICO") + " — " + ph(opcoes.tituloProfissional, "TÍTULO PROFISSIONAL") + " — CREA " + ph(opcoes.registro, "Nº DO CREA") + "</td></tr><tr><td>ART</td><td>" + ph(opcoes.art, "Nº DA ART") + "</td></tr>" +
      "<tr><td>Revisão / data</td><td>" + esc(rev) + " / " + esc(data) + "</td></tr></tbody></table></section>";
    var titulo = "Memorial de cálculo — Andaime tubo-roll — " + obra;
    var html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="generator" content="OrçaPRO — AndaimeMemorial"><title>' + esc(titulo) + "</title><style>" + CSS + "</style></head><body>" + capa + corpo + "</body></html>";
    return { ok: true, html: html, titulo: titulo, secoes: [{ id: "capa", numero: null, titulo: "Capa" }].concat(secs.map(function (s, i) { return { id: s.id, numero: i + 1, titulo: s.titulo }; })), figuras: nFig, tabelas: nTab, avisos: avisos, liberado: sit.liberado };
  }
  var AndaimeMemorial = { gerar: gerar, NORMAS: NORMAS };
  global.AndaimeMemorial = AndaimeMemorial;
  if (typeof module !== "undefined" && module.exports) module.exports = AndaimeMemorial;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
