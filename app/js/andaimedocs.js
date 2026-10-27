/* =====================================================================
 * andaimedocs.js — DOCUMENTOS DO ANDAIME (motor PURO, ES5, sem DOM, Node-testável).
 * Frente "Andaimes", etapa E3 (27/10/2026). A tela é a E5; o cálculo é a E4.
 *
 * O que sai daqui (tudo lido do MESMO modelo de Andaime.montar — nunca um segundo cálculo de quantidade):
 *   listaLocacao(modelo, cab)   lista de pedido de locação (+ reserva, + .xlsx)
 *   planoMontagem(modelo, p)    passos com as quantidades de cada um, desmontagem inversa, requisitos NR-18 / NBR 6494
 *   checklist(modelo, p, opc)   itens NR-18 + catálogo, agrupados, por momento (antes / periódica / evento)
 *   Aprovacao                   estado puro: rascunho → em_revisao → aprovado → liberado, cartão verde/amarelo/vermelho
 *   cartaoHtml(ap, modelo, cab) cartão A5 para prender no acesso
 *   memorialHtml(modelo, calc, cab)  esqueleto do memorial; o cálculo (E4) entra em `calc`
 *
 * ⚠ REGRAS QUE NÃO PODEM SER "SIMPLIFICADAS" (cada uma impede um defeito que mata gente):
 *   1. Andaime ALTERADO depois de aprovado/liberado perde a liberação (Aprovacao.aoAlterar → em_revisao + vermelho).
 *      Sem isso o cartão verde continua no acesso de um andaime que não é mais o que foi inspecionado
 *      (NR-18 18.12.4: a liberação é do andaime que está montado). O cartão ainda confere o hash na hora de
 *      desenhar — se alguém esquecer de chamar aoAlterar, o cartão sai vermelho do mesmo jeito.
 *   2. Memorial sem cálculo NUNCA diz "ok": diz "cálculo ainda não executado — não liberar".
 *      Recado que mente é pior que recado nenhum (CLAUDE.md §7).
 *   3. Histórico só cresce. Nenhuma transição apaga entrada; resposta de checklist descartada por alteração vai
 *      para dentro da entrada do histórico (não some).
 *   4. Toda trava tem porta (CLAUDE.md §3): do vermelho sai por "corrigido — reinspecionar"; o amarelo e o vermelho
 *      pedem texto (o que não pode / por que) para a pessoa não "se livrar" da trava com um clique em branco.
 *   5. Liberar exige o checklist "antes da liberação" RESPONDIDO e sem "nc". Item sem resposta bloqueia também:
 *      não inspecionado não é conforme.
 *
 * Valor sem norma brasileira continua "confirmar pelo responsável técnico" (a marca vai para o memorial).
 * Sem preço: custo fica para depois (Rogério 26/10/2026).
 *
 * API: AndaimeDocs.listaLocacao · exportarXlsx · construirXlsx · planoMontagem · checklist · Aprovacao ·
 *      cartaoHtml · memorialHtml · notasGerais · hashPar
 * Teste: node tools/test-andaimedocs.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function AN() { return dep("Andaime", "./andaime.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function r3(v) { return Math.round(v * 1e3) / 1e3; }
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function brf(v, c) { c = c == null ? 2 : c; return (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  /* placeholder vermelho do padrão RA (memória ra-propostas-padrao): o que falta aparece, nunca some */
  function ph(v, rot) { var s = v == null ? "" : String(v).trim(); return s ? esc(s) : '<span class="ph">[' + esc(rot) + "]</span>"; }
  function dataBR(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(iso || ""));
    return m ? m[3] + "/" + m[2] + "/" + m[1] + (m[4] ? " " + m[4] + ":" + m[5] : "") : String(iso || "");
  }
  function agoraISO() { return new Date().toISOString(); }
  var INSPECAO_DIAS = 7;   /* HSA 4 / checklist 2 (secundária): a cada 7 dias; confirmarRT */

  /* ================================================================ TEXTOS FIXOS (fontes) */
  var F = {
    NR18: "NR-18 (texto 2026, Portaria MTE 836/2026)",
    NR35: "NR-35 35.1.1",
    N6494: "NBR 6494:1990 (exemplar não licenciado; vigência não confirmada — conferir)",
    HSA: "HSA Irlanda, Code of Practice for Access and Working Scaffolds (2007) — referência estrangeira, não norma BR",
    R1: "apostila de montador / material de empresa de andaimes — fonte secundária, conferir"
  };
  /* "o que é" em uma linha, PT-BR claro. Chave: papel do tubo (Pontalete…) ou o código da peça */
  var OQUE = {
    "Pontalete": "tubo vertical que leva a carga ao chão",
    "Longitudinal": "tubo horizontal ao longo do andaime: liga os pontaletes, apoia as transversais e forma o guarda-corpo",
    "Transversal": "tubo horizontal no sentido da largura, sob o piso, que apoia os pranchões",
    "Diagonal": "tubo inclinado que trava o andaime contra deformação (contraventamento)",
    "Tubo de Amarração": "tubo curto que liga o andaime ao olhal fixado na estrutura (ancoragem)",
    "Poste de Guarda-corpo": "tubo curto vertical no meio do vão que divide o guarda-corpo e o apoia na longitudinal do piso",
    "Tubo": "tubo de aço do andaime",
    bracFixa: "abraçadeira de 90° que prende um tubo ao outro em ângulo reto (travessa no pontalete, transversal na longitudinal)",
    bracGiratoria: "abraçadeira que prende um tubo ao outro em qualquer ângulo (diagonais)",
    luva: "peça que emenda dois tubos ponta a ponta",
    baseRegulavel: "placa de apoio com haste rosqueada, sob o pontalete, para nivelar",
    baseFixa: "placa de apoio fixa, sob o pontalete",
    rodizio: "roda com trava, para andaime móvel (nunca deslocar com gente em cima)",
    calco: "pedaço de pranchão sob a base, que espalha a carga no solo",
    pranchaMadeira: "tábua grossa do piso de trabalho (pranchão)",
    pisoMetalico: "piso de aço com gancho que engata na transversal",
    alcapao: "abertura no piso, com tampa, por onde passa a escada de acesso",
    rodapeMadeira: "tábua em pé na borda do piso, que impede a queda de ferramenta e material",
    abracRodape: "abraçadeira que prende a tábua do rodapé ao pontalete",
    presilhaPrancha: "presilha que trava o pranchão e impede o desencaixe",
    escadaMao: "escada de acesso entre os pisos, presa ao andaime",
    escadaMarinheiro: "escada fixa vertical (marinheiro), em módulos de 2,00 m",
    olhal: "ponto fixado na estrutura, por onde passa o tubo de amarração",
    tela: "tela de proteção da fachada (em m²), contra queda de material"
  };
  function oQue(l) { var k = l.cod === "tubo" ? (l.papelTubo || "Tubo") : l.cod; return OQUE[k] || l.descricao || ""; }

  /* ================================================================ 3.1 LISTA DE LOCAÇÃO */
  /* reserva em PERCENTUAL (10 = 10 %). Arredonda PARA CIMA: peça faltando na obra é andaime parado.
     ⚠ qtd × 1,10 em ponto flutuante dá 55,00000000000001 para 50 peças (Math.ceil → 56; também 90 → 100, 100 → 111):
     a multiplicação é feita como qtd × (100 + pct) / 100 e o produto arredondado a 6 casas antes do teto. */
  function trazer(qtd, reservaPct) { var v = qtd * (100 + reservaPct) / 100; return Math.ceil(Math.round(v * 1e6) / 1e6); }
  function listaLocacao(modelo, cab, opc) {
    var A = AN(); cab = cab || {}; opc = opc || {};
    if (!A || !modelo || !modelo.ok) return { ok: false, motivo: "Sem modelo de andaime montado.", linhas: [], totais: { pecas: 0, pesoKg: 0, m2Tela: 0 }, html: "" };
    var reserva = num(cab.reserva != null ? cab.reserva : opc.reserva, 0); if (reserva < 0) reserva = 0; if (reserva > 100) reserva = 100;
    var base = A.pecasLocacao(modelo), pecas = 0, peso = 0, pesoTrazer = 0, pecasTrazer = 0, semPeso = [];
    var linhas = base.map(function (l) {
      var isTela = l.cod === "tela", t = reserva > 0 ? (isTela ? Math.ceil(Math.round(l.qtd * (100 + reserva) / 100 * 1e6) / 1e6) : trazer(l.qtd, reserva)) : null;
      if (!isTela) { pecas += l.qtd; if (t != null) pecasTrazer += t; }
      if (l.pesoTotal != null) { peso += l.pesoTotal; if (t != null && l.pesoUnit != null) pesoTrazer += l.pesoUnit * t; } else semPeso.push(l.nomeLocacao);
      return { item: l.item, cod: l.cod, nome: l.nomeLocacao, peca: l.peca, dimensoes: l.dimensoes, oQueE: oQue(l), un: l.un, qtd: l.qtd, trazer: t, comp: l.comp, area: l.area,
        pesoUnit: l.pesoUnit, pesoTotal: l.pesoTotal, pesoTrazer: t != null && l.pesoUnit != null ? r3(l.pesoUnit * t) : null, fonte: l.fonte, confirmarRT: !!l.confirmarRT };
    });
    var totais = { pecas: pecas, pesoKg: r3(peso), m2Tela: modelo.tela && modelo.tela.area > 0 ? modelo.tela.area : 0, reservaPct: reserva,
      pecasTrazer: reserva > 0 ? pecasTrazer : null, pesoTrazerKg: reserva > 0 ? r3(pesoTrazer) : null, linhasSemPeso: semPeso };
    var r = { ok: true, cab: clone(cab), reserva: reserva, linhas: linhas, totais: totais };
    r.html = htmlLista(r);
    return r;
  }
  function cabHtml(cab) {
    return '<table class="cab"><tr><td><b>Obra</b></td><td>' + ph(cab.obra, "OBRA") + "</td><td><b>Local</b></td><td>" + ph(cab.local, "LOCAL") + "</td></tr>" +
      "<tr><td><b>Andaime</b></td><td>" + ph(cab.andaime, "NOME / CÓDIGO DO ANDAIME") + "</td><td><b>Revisão / data</b></td><td>" + ph(cab.revisao, "REVISÃO") + " — " + ph(cab.data, "DATA") + "</td></tr>" +
      "<tr><td><b>Responsável</b></td><td colspan=\"3\">" + ph(cab.responsavel, "RESPONSÁVEL TÉCNICO") + "</td></tr></table>";
  }
  var CSS_BASE = "body{font-family:Arial,Helvetica,sans-serif;color:#1d2733;font-size:10pt;margin:14mm} h1{font-size:15pt;margin:0 0 4px} h2{font-size:12pt;margin:14px 0 4px;border-bottom:1px solid #9fb0c3}" +
    "table{border-collapse:collapse;width:100%;margin:4px 0} td,th{border:1px solid #9fb0c3;padding:3px 5px;vertical-align:top} th{background:#e7eef6;text-align:left}" +
    ".n{text-align:right;white-space:nowrap} .ph{color:#b3261e;font-weight:600} .aviso{color:#b3261e;font-weight:600} .nota{font-size:8pt;color:#4a5664} .ok{color:#2e6b3f;font-weight:600}" +
    ".rt{color:#a86a10;font-size:8pt} table.cab td{border:0;padding:1px 6px 1px 0} .tot td{font-weight:700;background:#f1f6fb}";
  function htmlLista(r) {
    var res = r.reserva > 0, h = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Lista de locação do andaime</title><style>' + CSS_BASE + "</style></head><body>";
    h += "<h1>Lista de pedido de locação — andaime</h1>" + cabHtml(r.cab);
    h += '<p class="nota">Sem preço (custo é outra etapa). Nome da peça como a locadora escreve; confira com o pedido real da locadora. ' + (res ? "Reserva de " + brf(r.reserva, 0) + " % sobre cada linha, arredondada para cima (coluna TRAZER)." : "Sem reserva (o responsável técnico decide).") + "</p>";
    h += "<table><tr><th>ITEM</th><th>QNT</th>" + (res ? "<th>TRAZER</th>" : "") + "<th>PEÇA</th><th>O QUE É</th><th>UN</th><th>COMP. (m)</th><th>ÁREA (m²)</th><th>PESO UNIT (kg)</th><th>PESO TOTAL (kg)</th></tr>";
    r.linhas.forEach(function (l) {
      h += "<tr><td class=\"n\">" + l.item + '</td><td class="n">' + brf(l.qtd, l.un === "m²" ? 2 : 0) + "</td>" + (res ? '<td class="n"><b>' + brf(l.trazer, l.un === "m²" ? 2 : 0) + "</b></td>" : "") +
        "<td>" + esc(l.nome) + (l.confirmarRT ? ' <span class="rt">(confirmar RT)</span>' : "") + "</td><td>" + esc(l.oQueE) + "</td><td>" + esc(l.un) + '</td><td class="n">' + (l.comp == null ? "" : brf(l.comp, 2)) +
        '</td><td class="n">' + (l.area == null ? "" : brf(l.area, 2)) + '</td><td class="n">' + (l.pesoUnit == null ? '<span class="ph">[sem peso de fonte]</span>' : brf(l.pesoUnit, 2)) +
        '</td><td class="n">' + (l.pesoTotal == null ? "" : brf(l.pesoTotal, 2)) + "</td></tr>";
    });
    h += '<tr class="tot"><td></td><td class="n">' + r.totais.pecas + "</td>" + (res ? '<td class="n">' + r.totais.pecasTrazer + "</td>" : "") + "<td>Total geral (peças, sem a tela)</td><td></td><td></td><td></td><td></td><td></td>" +
      '<td class="n">' + brf(r.totais.pesoKg, 2) + "</td></tr></table>";
    h += "<p>Tela de proteção: <b>" + brf(r.totais.m2Tela, 2) + " m²</b>." + (res ? " Peso a transportar com a reserva: <b>" + brf(r.totais.pesoTrazerKg, 2) + " kg</b>." : "") + "</p>";
    if (r.totais.linhasSemPeso.length) h += '<p class="aviso">Peso sem fonte (não somado no total): ' + esc(r.totais.linhasSemPeso.join("; ")) + ".</p>";
    return h + "</body></html>";
  }
  /* ---- planilha .xlsx — nunca CSV (memória entregaveis-planilha-e-dwg). Mesmo padrão de js/bimtuboxls.js:
     construirXlsx(ExcelJS, …) é montável/testável com a lib injetada; exportarXlsx baixa pelo carregador do app. */
  function construirXlsx(ExcelJS, lista, cab) {
    cab = cab || (lista && lista.cab) || {};
    var wb = new ExcelJS.Workbook(), ws = wb.addWorksheet("Lista de locação"), res = lista.reserva > 0;
    var cols = ["ITEM", "QNT"].concat(res ? ["TRAZER"] : []).concat(["PEÇA", "O QUE É", "UN", "COMP. (m)", "ÁREA (m²)", "PESO UNIT (kg)", "PESO TOTAL (kg)"]);
    ws.columns = cols.map(function (c, i) { return { key: "c" + i, width: c === "PEÇA" ? 46 : (c === "O QUE É" ? 56 : 13) }; });
    ws.mergeCells(1, 1, 1, cols.length);
    var t = ws.getCell(1, 1); t.value = "Lista de pedido de locação — andaime"; t.font = { bold: true, size: 13 };
    var info = [["Obra", cab.obra], ["Local", cab.local], ["Andaime", cab.andaime], ["Revisão", cab.revisao], ["Data", cab.data], ["Responsável", cab.responsavel],
      ["Reserva", res ? lista.reserva + " %" : "sem reserva"]];
    var r = 2;
    info.forEach(function (p) { ws.getCell(r, 1).value = p[0]; ws.getCell(r, 1).font = { bold: true }; ws.getCell(r, 2).value = p[1] == null || p[1] === "" ? "[PREENCHER]" : p[1]; r++; });
    r++;
    var hr = ws.getRow(r); cols.forEach(function (c, i) { var cell = hr.getCell(i + 1); cell.value = c; cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2740" } }; });
    r++;
    lista.linhas.forEach(function (l) {
      var v = [l.item, l.qtd].concat(res ? [l.trazer] : []).concat([l.nome, l.oQueE, l.un, l.comp, l.area, l.pesoUnit, l.pesoTotal]), row = ws.getRow(r);
      v.forEach(function (x, i) { var cell = row.getCell(i + 1); cell.value = x == null ? null : x; if (typeof x === "number") cell.numFmt = "#,##0.00"; });
      r++;
    });
    var tr = ws.getRow(r); tr.getCell(1).value = "TOTAL"; tr.getCell(2).value = lista.totais.pecas; if (res) tr.getCell(3).value = lista.totais.pecasTrazer;
    tr.getCell(res ? 4 : 3).value = "Total geral (peças, sem a tela)"; tr.getCell(cols.length).value = lista.totais.pesoKg; tr.font = { bold: true };
    r += 2; ws.getCell(r, 1).value = "Tela de proteção (m²)"; ws.getCell(r, 2).value = lista.totais.m2Tela;
    r++; ws.getCell(r, 1).value = "Sem preço: custo é outra etapa. Confirme os nomes no pedido real da locadora."; ws.getCell(r, 1).font = { italic: true, color: { argb: "FFB45309" } };
    if (lista.totais.linhasSemPeso.length) { r++; ws.getCell(r, 1).value = "Peso sem fonte (fora do total): " + lista.totais.linhasSemPeso.join("; "); ws.getCell(r, 1).font = { italic: true, color: { argb: "FFB3261E" } }; }
    return wb;
  }
  function exportarXlsx(lista, cab, hooks) {
    hooks = hooks || {};
    var EX = global.ExcelOrc || global.Excel;
    if (!EX || !EX.ensureExcelJS) { if (hooks.erro) hooks.erro(new Error("Excel indisponível")); return; }
    EX.ensureExcelJS(function () {
      try {
        Promise.resolve(construirXlsx(global.ExcelJS, lista, cab)).then(function (wb) { return wb.xlsx.writeBuffer(); }).then(function (buf) {
          var blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), url = URL.createObjectURL(blob), a = document.createElement("a");
          a.href = url; a.download = String(hooks.nome || "Lista de locacao do andaime").replace(/[\\\/:*?"<>|]/g, "-") + ".xlsx"; a.click();
          setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
          if (hooks.ok) hooks.ok();
        }).catch(function (e) { if (hooks.erro) hooks.erro(e); });
      } catch (e) { if (hooks.erro) hooks.erro(e); }
    });
  }

  /* ================================================================ 3.2 PLANO DE MONTAGEM */
  /* Regras com a fonte e a CLASSE dela. classe: "norma" = NR/NBR (regra); "estrangeira" = HSA (referência); "secundaria" = apostila (conferir). */
  var REGRA = {
    m01: { texto: "Inspecionar o material antes do uso (na chegada); separar e sinalizar o que estiver defeituoso.", fonte: "HSA 3.2.1 (catálogo F22 p.35); checklist 'antes da liberação'", classe: "estrangeira" },
    m02: { texto: "Apoio: base sobre calço de madeira (≥ 35 mm de espessura, ≥ 220 mm de largura, ≥ 1 000 cm²) em solo; placa direto só em concreto, aço ou asfalto duro; base regulável não estendida além do limite do fabricante.", fonte: "HSA 3.3.1 (F22 p.38-39); NR-18 18.12.13 a) exige sapata sobre base rígida e nivelada, com ajuste de nivelamento", classe: "norma" },
    m02b: { texto: "Montantes apoiados em bases compatíveis com a resistência do solo.", fonte: "NBR 6494 4.5.1 (exemplar não licenciado — conferir)", classe: "norma" },
    m03: { texto: "A 1ª travessa (varredor) fica o mais perto possível do pé dos pontaletes; omitir reduz muito a capacidade.", fonte: "HSA 3.2.3 e 3.2.4 (F22 p.35-36)", classe: "estrangeira" },
    m03b: { texto: "Pontaletes aprumados; esquadrejar a planta pelo triângulo 3-4-5.", fonte: "NBR 6494 4.5.2 (aprumados); apostila (3-4-5) — conferir", classe: "secundaria" },
    m04: { texto: "Levante de referência de 2,00 m; 1º levante sem contraventamento cruzado só até 2,7 m, com perda de capacidade.", fonte: "HSA 3.3.4.2 (F22 p.51); 2,0 m via TG20/Orguel — fonte secundária, confirmar RT", classe: "secundaria" },
    m05: { texto: "Emenda de tubo por luva; uma emenda só por vão; luva não recomendada em tubo tracionado.", fonte: "HSA 3.2.2; apostila — conferir", classe: "secundaria" },
    m06: { texto: "Contraventamento cruzado em pares alternados de montantes, formando triângulos completos do pé ao topo; diagonal sob carga até 45°.", fonte: "HSA 3.3.4 (F22 p.51); apostila — conferir", classe: "secundaria" },
    m07: { texto: "Ancorar à medida que sobe: amarrações a no máximo 6,00 m entre si nas duas direções e ao menos 1 a cada 36,00 m²; tubo acoplado ao pontalete e à travessa, a ≤ 0,30 m de um nó.", fonte: "NBR 6494 4.5.2 (REGRA do motor); HSA 3.3.2 (F22 p.40) para o acoplamento", classe: "norma" },
    m08: { texto: "Piso: forração completa, antiderrapante, nivelada e travada; pranchões lado a lado sem vão e com a espessura do projeto (1½\" = 38 mm; pranchão mais fino não vale este projeto); balanço ≤ 0,20 m além do apoio; piso fixado contra o vento.", fonte: "NR-18 18.12.5; NBR 6494 3.1.8, 3.1.8.1, 3.1.8.4, 3.1.10", classe: "norma" },
    m08b: { texto: "Travamento contra desencaixe de pisos, montantes e painéis.", fonte: "NR-18 18.12.7", classe: "norma" },
    m09: { texto: "Guarda-corpo a 1,20 m, intermediário a 0,70 m e rodapé ≥ 0,15 m em todo o perímetro, menos a face de trabalho. (As alturas 0,50/1,00 m da NBR 6494 não valem: vale a NR-18, mais nova e mais exigente.)", fonte: "NR-18 18.9.4.2 e 18.12.1 d)", classe: "norma" },
    m10: { texto: "Acesso seguro: escada quando o piso passa de 1,00 m (de mão ≥ 0,40 m com degraus de 0,25 a 0,30 m, ou coletiva ≥ 0,60 m); acesso seguro quando o desnível passa de 0,40 m.", fonte: "NR-18 18.12.1 e) e 18.12.14", classe: "norma" },
    m10b: { texto: "Tela de proteção da fachada: da 1ª plataforma até 2,00 m acima da última; malha ≤ 25 mm.", fonte: "NR-18 18.12.15; NBR 6494 3.2.4.1", classe: "norma" },
    m11: { texto: "Inspeção final, retirar o aviso de 'andaime incompleto', registrar a carga de serviço e liberar com registro formal assinado por profissional qualificado em segurança do trabalho ou pelo responsável pela frente/obra.", fonte: "NR-18 18.12.4; HSA seção 4 (F22 p.70-71)", classe: "norma" }
  };
  var REQUISITOS = [
    { texto: "Montagem e desmontagem por trabalhadores capacitados, com treinamento específico.", fonte: "NR-18 18.12.6", classe: "norma" },
    { texto: "SPIQ (sistema de proteção individual contra quedas) para quem monta e desmonta; trabalho acima de 2,00 m é trabalho em altura.", fonte: "NR-18 18.12.6; NR-35 35.1.1", classe: "norma" },
    { texto: "Ferramentas amarradas ao corpo ou ao andaime.", fonte: "NR-18 18.12.6", classe: "norma" },
    { texto: "Área isolada e sinalizada embaixo e ao redor.", fonte: "NR-18 18.12.6", classe: "norma" },
    { texto: "Içar as peças por corda (ou roldana): nada em queda livre.", fonte: "NBR 6494 3.3.3 (exemplar não licenciado — conferir)", classe: "norma" },
    { texto: "Parar com chuva ou vento forte (apostila: acima de 40 km/h — confirmar RT).", fonte: "NBR 6494 3.3.4; apostila (40 km/h) — fonte secundária", classe: "secundaria" },
    { texto: "Nunca um montador só.", fonte: "NBR 6494 3.3.5 (exemplar não licenciado — conferir)", classe: "norma" }
  ];
  var GRUPOS_ETAPA = [
    { id: "estrutura", titulo: "Estrutura (pontaletes, longitudinais, transversais)", regras: ["m03", "m03b", "m04", "m05"] },
    { id: "contraventamento", titulo: "Contraventamento (diagonais)", regras: ["m06"] },
    { id: "ancoragem", titulo: "Ancoragens", regras: ["m07"] },
    { id: "piso", titulo: "Piso", regras: ["m08", "m08b"] },
    { id: "guarda", titulo: "Guarda-corpo e rodapé", regras: ["m09"] },
    { id: "acesso", titulo: "Acesso", regras: ["m10"] }
  ];
  function regras(ids) { return ids.map(function (k) { return clone(REGRA[k]); }); }

  /* nível (índice em modelo.niveis) do tubo/peça pela cota: o maior nível cuja cota é ≤ y (+5 cm). */
  function nivelDe(niveis, y) { var k = 0, i; for (i = 0; i < niveis.length; i++) if (niveis[i].y <= y + 0.05) k = i; return k; }
  function nomeLevante(modelo, n) {
    var nv = modelo.niveis, de = n <= 1 ? 0 : (nv[n - 1] && nv[n - 1].yPiso != null ? nv[n - 1].yPiso : nv[n - 1].y), ate = nv[n] && nv[n].yPiso != null ? nv[n].yPiso : (nv[n] ? nv[n].y : modelo.par.altura);
    return { de: de, ate: ate, rotulo: "Levante " + n + " (de " + brf(de, 2) + " a " + brf(ate, 2) + " m)" };
  }
  function subModelo(modelo, b) {
    var nc = { fixa: 0, giratoria: 0, luva: 0, base: 0, rodape: 0, prancha: 0 };
    arr(b.conexoes).forEach(function (c) { if (nc[c.tipo] != null) nc[c.tipo]++; });
    var med = clone(modelo.medidas); med.nConexoes = nc;
    return { ok: true, par: modelo.par, tubo: modelo.tubo, niveis: modelo.niveis, barras: arr(b.barras), bases: arr(b.bases), calcos: arr(b.calcos), pranchas: arr(b.pranchas), rodapes: arr(b.rodapes),
      acessos: arr(b.acessos), ancoragens: arr(b.ancoragens), tela: { area: b.tela || 0 }, medidas: med, acessoInfo: b.acessoInfo || null,
      torre: arr(b.torreAcessos).length ? { barras: [], conexoes: [], pranchas: [], bases: [], calcos: [], acessos: arr(b.torreAcessos) } : null };
  }
  function resumoPecas(lista) {
    return lista.filter(function (l) { return l.cod !== "tela"; }).map(function (l) { return l.qtd + " × " + l.nomeLocacao; }).join("; ") + (lista.some(function (l) { return l.cod === "tela"; }) ? "; " + brf(lista.filter(function (l) { return l.cod === "tela"; })[0].qtd, 2) + " m² de tela" : "");
  }
  function planoMontagem(modelo, p) {
    var A = AN();
    if (!A || !modelo || !modelo.ok) return { ok: false, motivo: "Sem modelo de andaime montado.", passos: [], html: "" };
    var nv = arr(modelo.niveis), nLev = Math.max(1, nv.length - 1);
    function lev(k) { return Math.max(1, Math.min(nLev, k)); }
    /* 1) cada elemento do modelo cai em UM balde (levante × grupo) — a soma dos baldes é a lista, por construção */
    var B = {}, papel = {}, nivBarra = {};
    function bal(chave) { if (!B[chave]) B[chave] = { barras: [], conexoes: [], bases: [], calcos: [], pranchas: [], rodapes: [], acessos: [], ancoragens: [], tela: 0, torreAcessos: [], acessoInfo: null }; return B[chave]; }
    function chaveL(n, g) { return "L" + n + "|" + g; }
    modelo.barras.forEach(function (b) {
      papel[b.id] = b.papel; var k = b.papel === "montante" || b.nivel == null ? nivelDe(nv, Math.min(b.a[1], b.b[1])) : b.nivel; nivBarra[b.id] = lev(k);
      var g = b.papel === "diagonal" || b.papel === "diagonalTransv" ? "contraventamento" : (b.papel === "guarda" || b.papel === "intermediaria" || b.papel === "posteGuarda" ? "guarda" : (b.papel === "ancoragem" ? "ancoragem" : "estrutura"));
      bal(chaveL(nivBarra[b.id], g)).barras.push(b);
    });
    var nivPeca = {};
    modelo.pranchas.forEach(function (x) { nivPeca[x.id] = lev(x.nivel); bal(chaveL(lev(x.nivel), "piso")).pranchas.push(x); });
    modelo.rodapes.forEach(function (x) { nivPeca[x.id] = lev(x.nivel); bal(chaveL(lev(x.nivel), "guarda")).rodapes.push(x); });
    modelo.acessos.forEach(function (x) { bal(chaveL(lev(x.nivel), "acesso")).acessos.push(x); });
    modelo.ancoragens.forEach(function (x) { bal(chaveL(lev(x.nivel), "ancoragem")).ancoragens.push(x); });
    /* E9: plataformas de descanso, fixações e cancelas do acesso entram no passo do acesso do levante do topo; a torre coletiva é um passo à parte */
    if (modelo.acessoInfo && (arr(modelo.acessoInfo.plataformas).length || arr(modelo.acessoInfo.fixacoes).length || arr(modelo.acessoInfo.cancelas).length))
      bal(chaveL(lev(nLev), "acesso")).acessoInfo = { plataformas: arr(modelo.acessoInfo.plataformas), fixacoes: arr(modelo.acessoInfo.fixacoes), cancelas: arr(modelo.acessoInfo.cancelas) };
    if (modelo.torre) {
      var Bt = bal("torre"), Tt = modelo.torre;
      Tt.barras.forEach(function (b0) { Bt.barras.push(b0); }); Tt.conexoes.forEach(function (c0) { Bt.conexoes.push(c0); }); Tt.pranchas.forEach(function (x0) { Bt.pranchas.push(x0); });
      Tt.bases.forEach(function (x0) { Bt.bases.push(x0); }); Tt.calcos.forEach(function (x0) { Bt.calcos.push(x0); }); Bt.torreAcessos = Tt.acessos.slice();
    }
    modelo.conexoes.forEach(function (c) {
      if (c.tipo === "base") { bal("bases").conexoes.push(c); return; }
      var g = "estrutura", k = null, ids = arr(c.barras), i;
      if (c.tipo === "prancha") { g = "piso"; k = nivPeca[ids[0]]; }
      else if (c.tipo === "rodape") { g = "guarda"; k = nivPeca[ids[0]]; }
      else {
        for (i = 0; i < ids.length; i++) { var pp = papel[ids[i]];
          if (pp === "ancoragem") { g = "ancoragem"; k = nivBarra[ids[i]]; break; }
          if (pp === "diagonal" || pp === "diagonalTransv") { g = "contraventamento"; k = nivBarra[ids[i]]; break; }
          if (pp === "guarda" || pp === "intermediaria") { g = "guarda"; k = nivBarra[ids[i]]; break; } }
        if (k == null) for (i = 0; i < ids.length; i++) if (papel[ids[i]] && papel[ids[i]] !== "montante") { k = nivBarra[ids[i]]; break; }
      }
      if (k == null) k = lev(nivelDe(nv, c.pos[1]));
      bal(chaveL(k, g)).conexoes.push(c);
    });
    modelo.bases.forEach(function (b) { bal("bases").bases.push(b); });
    modelo.calcos.forEach(function (c) { bal("calcos").calcos.push(c); });
    bal("tela").tela = modelo.tela && modelo.tela.area > 0 ? modelo.tela.area : 0;
    function lista(b) { return A.pecasLocacao(subModelo(modelo, b)); }
    function somaLista(l) { var q = 0, ps = 0; l.forEach(function (x) { if (x.cod !== "tela") q += x.qtd; if (x.pesoTotal != null) ps += x.pesoTotal; }); return { pecas: q, pesoKg: r3(ps) }; }
    function uniao(chaves) {
      var u = { barras: [], conexoes: [], bases: [], calcos: [], pranchas: [], rodapes: [], acessos: [], ancoragens: [], tela: 0 };
      u.torreAcessos = []; u.acessoInfo = null;
      chaves.forEach(function (k) {
        var b = B[k]; if (!b) return;
        Object.keys(u).forEach(function (f) { if (f === "tela") u.tela += b.tela; else if (f === "acessoInfo") { if (b.acessoInfo) { u.acessoInfo = u.acessoInfo || { plataformas: [], fixacoes: [], cancelas: [] }; ["plataformas", "fixacoes", "cancelas"].forEach(function (g) { u.acessoInfo[g] = u.acessoInfo[g].concat(b.acessoInfo[g]); }); } } else u[f] = u[f].concat(b[f]); });
      });
      return u;
    }
    /* 2) os passos, na ordem do JSON `montagem` */
    var passos = [], n = 0;
    function passo(id, titulo, fazer, pl, rg, extra) {
      var l = pl ? lista(pl) : [], s = somaLista(l), o = { n: ++n, id: id, titulo: titulo, fazer: fazer, pecas: l, quantidades: resumoPecas(l), totalPecas: s.pecas, pesoKg: s.pesoKg, regras: rg };
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      passos.push(o); return o;
    }
    passo("inspecao", "Inspeção do material", "Conferir cada peça da lista de locação na chegada (" + (arr(modelo.barras).length) + " tubos, " + modelo.conexoes.length + " conexões do modelo): sem amassado, empeno, trinca, rosca espanada ou corrosão; separar e sinalizar o defeituoso.", null, regras(["m01"]));
    passo("apoio", "Apoio / fundação", modelo.calcos.length ? "Verificar o apoio (nivelado, rígido, sem água) e posicionar " + modelo.calcos.length + " calço(s) de pranchão sob as bases, ≥ 0,15 m das pontas." : "Verificar o apoio (nivelado, rígido, sem água): sem calço no projeto, a base apoia direto em concreto, aço ou asfalto duro.", B.calcos ? B.calcos : null, regras(["m02", "m02b"]));
    passo("bases", "Bases e calços nivelados", "Assentar as " + modelo.bases.length + " base(s) sobre os calços, na marcação da planta, e nivelar todas (rosca exposta de " + brf(modelo.medidas.roscaBase != null ? modelo.medidas.roscaBase : 0, 2) + " m no projeto; nunca além do limite do fabricante).", B.bases, regras(["m02"]));
    var l, g;
    for (l = 1; l <= nLev; l++) {
      var nm = nomeLevante(modelo, l), chaves = GRUPOS_ETAPA.map(function (x) { return chaveL(l, x.id); }).filter(function (k) { return !!B[k]; });
      var et = [], ids = {}, rg = [];
      GRUPOS_ETAPA.forEach(function (ge) {
        var k = chaveL(l, ge.id); if (!B[k]) return; var li = lista(B[k]); if (!li.length) return;
        var txt = { estrutura: (l === 1 ? "Erguer os pontaletes sobre as bases e fixar o varredor rente ao pé; depois travessas e transversais. " : "Emendar os pontaletes e fixar as travessas e transversais deste levante. ") + "Esquadrejar e aprumar antes de apertar.",
          contraventamento: "Fixar as diagonais deste levante, em pares alternados, antes de subir o piso.", ancoragem: "Ancorar este nível agora, antes de montar o levante de cima (não subir sem a ancoragem do projeto).",
          piso: "Forrar o piso completo, sem vão, e travar os pranchões.", guarda: "Montar guarda-corpo, intermediário e rodapé em todo o perímetro, menos a face de trabalho.", acesso: "Instalar a escada de acesso deste levante." }[ge.id];
        et.push({ grupo: ge.id, titulo: ge.titulo, fazer: txt, pecas: li, quantidades: resumoPecas(li) });
        ge.regras.forEach(function (r) { if (!ids[r]) { ids[r] = 1; rg.push(clone(REGRA[r])); } });
      });
      passo("levante" + l, nm.rotulo, "Montar na ordem: estrutura, contraventamento, ancoragens, piso, guarda-corpo e rodapé, acesso — e só então subir para o próximo levante.", uniao(chaves), rg, { levante: l, de: nm.de, ate: nm.ate, etapas: et });
    }
    if (modelo.torre) passo("torre", "Torre de escada de uso coletivo", "Montar a torre ao lado da cabeceira (bases niveladas, pontaletes, travessas, diagonais), ligá-la ao andaime nos níveis das travessas, forrar os patamares, fixar os lances de escada (largura 0,60 m, espelho ≤ 0,20 m, corrimão dos dois lados), montar o guarda-corpo dos patamares e instalar a cancela de chegada a cada piso de trabalho. Só então liberar o acesso.", uniao(["torre"]), regras(["m10"]));
    passo("tela", "Tela de proteção", modelo.tela && modelo.tela.area > 0 ? "Instalar " + brf(modelo.tela.area, 2) + " m² de tela da 1ª plataforma até 2,00 m acima da última, presa ao guarda-corpo e aos pontaletes." : "Sem tela no projeto (confirme com o responsável técnico se a fachada exige).", B.tela, regras(["m10b"]));
    passo("liberacao", "Inspeção final e liberação", "Percorrer o checklist 'antes da liberação' (nenhum item não conforme), retirar o aviso de andaime incompleto, registrar a carga de serviço e só então liberar com o registro formal assinado e o cartão verde no acesso.", null, regras(["m11"]));
    /* 3) desmontagem: ordem inversa, mesmos baldes — e o aviso que mais mata */
    var desm = passos.slice().reverse().filter(function (x) { return x.id !== "inspecao" && x.id !== "liberacao"; }).map(function (x) {
      var o = { n: 0, id: "d-" + x.id, titulo: "Desmontar: " + x.titulo, pecas: x.pecas, quantidades: x.quantidades, totalPecas: x.totalPecas, de: x.id };
      if (x.etapas) o.etapas = x.etapas.slice().reverse();
      return o;
    });
    desm.unshift({ id: "d-preparo", titulo: "Antes de começar a desmontar", pecas: [], quantidades: "", totalPecas: 0, de: null,
      fazer: "Cartão vermelho no acesso ('andaime em desmontagem — não usar'), área isolada e sinalizada, retirar material e ferramentas dos pisos, SPIQ e ferramentas amarradas." });
    desm.forEach(function (x, i) { x.n = i; });
    var desmontagem = { passos: desm, avisos: [
      "⚠ Ordem inversa da montagem, de cima para baixo: nunca retirar uma ancoragem antes de desmontar o levante de cima dela.",
      "Descer as peças por corda (nada em queda livre), nunca um desmontador só, parar com chuva ou vento forte."
    ], regras: REQUISITOS.map(clone) };
    var totais = { pecas: 0, pesoKg: 0 }; passos.forEach(function (x) { totais.pecas += x.totalPecas; totais.pesoKg = r3(totais.pesoKg + x.pesoKg); });
    var r = { ok: true, aviso: "Não existe, nas fontes lidas, um procedimento numerado de montagem de tubo-roll: a sequência é uma compilação da ordem lógica dos componentes e dos requisitos de cada fonte. O projeto do engenheiro prevalece.",
      requisitos: REQUISITOS.map(clone), passos: passos, desmontagem: desmontagem, totais: totais, nLevantes: nLev };
    r.html = htmlPlano(r, modelo);
    return r;
  }
  function tabPecas(l) {
    if (!l || !l.length) return "";
    return '<table><tr><th>QNT</th><th>PEÇA</th><th>COMP. (m)</th><th>PESO TOTAL (kg)</th></tr>' + l.map(function (x) {
      return '<tr><td class="n">' + brf(x.qtd, x.un === "m²" ? 2 : 0) + "</td><td>" + esc(x.nomeLocacao) + '</td><td class="n">' + (x.comp == null ? "" : brf(x.comp, 2)) + '</td><td class="n">' + (x.pesoTotal == null ? "—" : brf(x.pesoTotal, 2)) + "</td></tr>";
    }).join("") + "</table>";
  }
  function regraHtml(rg) { return '<li>' + esc(rg.texto) + ' <span class="nota">[' + esc(rg.fonte) + (rg.classe === "norma" ? "" : " — " + (rg.classe === "estrangeira" ? "referência estrangeira, conferir" : "fonte secundária, conferir")) + "]</span></li>"; }
  function htmlPlano(r, modelo) {
    var h = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Plano de montagem do andaime</title><style>' + CSS_BASE + "</style></head><body><h1>Plano de montagem e desmontagem</h1>";
    h += '<p class="nota">' + esc(r.aviso) + "</p><h2>Requisitos fixos (valem em todos os passos)</h2><ul>" + r.requisitos.map(regraHtml).join("") + "</ul>";
    r.passos.forEach(function (x) {
      h += "<h2>" + x.n + ". " + esc(x.titulo) + "</h2><p>" + esc(x.fazer) + "</p>";
      if (x.etapas) x.etapas.forEach(function (e) { h += "<p><b>" + esc(e.titulo) + ":</b> " + esc(e.fazer) + "</p>" + tabPecas(e.pecas); }); else h += tabPecas(x.pecas);
      if (x.regras.length) h += "<ul>" + x.regras.map(regraHtml).join("") + "</ul>";
      if (x.totalPecas) h += '<p class="nota">Neste passo: ' + x.totalPecas + " peças, " + brf(x.pesoKg, 2) + " kg (sem as peças sem peso de fonte).</p>";
    });
    h += "<h2>Desmontagem (ordem inversa)</h2>" + r.desmontagem.avisos.map(function (a) { return '<p class="aviso">' + esc(a) + "</p>"; }).join("");
    h += "<ol>" + r.desmontagem.passos.map(function (x) { return "<li><b>" + esc(x.titulo) + "</b>" + (x.fazer ? " — " + esc(x.fazer) : "") + (x.totalPecas ? ' <span class="nota">(recolher ' + x.totalPecas + " peças)</span>" : "") + "</li>"; }).join("") + "</ol>";
    h += '<p class="nota">Total montado: ' + r.totais.pecas + " peças, " + brf(r.totais.pesoKg, 2) + " kg.</p></body></html>";
    return h;
  }

  /* ================================================================ 3.3 CHECKLIST */
  var GRUPOS_CHK = ["Apoio", "Estrutura", "Conexões", "Pisos", "Proteção", "Acesso", "Ancoragem", "Sinalização"];
  var MOMENTOS = {
    antes: { rotulo: "Antes da liberação (1º uso)", fonte: "NR-18 18.12.4; HSA checklist 1 (F22 p.83)" },
    periodica: { rotulo: "Periódica (a cada {dias} dias)", fonte: "HSA seção 4 (F22 p.73) — fonte estrangeira, secundária; o intervalo é parâmetro (confirmar RT)", confirmarRT: true },
    evento: { rotulo: "Após alteração, tempo parado, chuva/vento forte ou dano", fonte: "HSA seção 4 (F22 p.73); OSHA — fonte secundária; confirmar RT", confirmarRT: true }
  };
  function checklist(modelo, p, opc) {
    var A = AN(); opc = opc || {};
    if (!A || !modelo || !modelo.ok) return { ok: false, motivo: "Sem modelo de andaime montado.", itens: [], grupos: [], html: "" };
    p = p || modelo.par; var M = modelo.medidas, dias = num(opc.intervaloDias, INSPECAO_DIAS), resp = opc.respostas || {}, itens = [];
    var TODOS = ["antes", "periodica", "evento"], AP = ["antes"];
    function add(id, grupo, texto, fonte, momentos) { itens.push({ id: id, grupo: grupo, texto: texto, fonte: fonte, momentos: momentos || TODOS, resposta: null, obs: "" }); }
    var nPisos = M.nPisos || 0, nL = M.nLevantes || 0, anc = modelo.ancoragens.length;
    /* Apoio */
    add("ap1", "Apoio", modelo.calcos.length ? modelo.calcos.length + " calço(s) de madeira sob as bases (≥ 35 mm de espessura, ≥ 220 mm de largura, ≥ 1 000 cm²), em apoio nivelado e rígido, sem água acumulada." : "Apoio rígido e nivelado (concreto, aço ou asfalto duro) sob as " + modelo.bases.length + " base(s); sem calço no projeto.", "HSA 3.3.1 (F22 p.38); NR-18 18.12.13 a)");
    add("ap2", "Apoio", modelo.bases.length + " base(s) com rosca exposta dentro do limite do fabricante (projeto: " + brf(M.roscaBase != null ? M.roscaBase : 0, 2) + " m) e todas apoiadas.", "NR-18 18.12.13 a); HSA 3.3.1");
    add("ap3", "Apoio", "Material conferido na chegada: nada amassado, empenado, trincado ou corroído; tubo com parede ≥ 2,65 mm e Ø ≥ 42,2 mm.", "HSA 3.2.1 (checklist 1); NBR 6494 4.5.5", AP);
    /* Estrutura */
    add("es1", "Estrutura", M.nMontantes + " prumada(s) de pontaletes, aprumadas, sem empeno; emendas por luva (" + (M.nConexoes ? M.nConexoes.luva : 0) + " luva(s)) desencontradas e fora de tubo tracionado.", "NBR 6494 4.5.2; HSA 3.2.2; apostila — conferir");
    add("es2", "Estrutura", "Varredor (1ª travessa) rente ao pé dos pontaletes, nos " + (M.nVaos || 0) + " vão(s) do projeto.", "HSA 3.2.3 (F22 p.35)");
    add("es3", "Estrutura", "Travessas e transversais conforme o projeto (vão máximo " + brf(p.vaoMax, 2) + " m, " + nL + " levante(s) de até " + brf(p.levanteMax, 2) + " m).", "HSA 3.2.4; fonte secundária — confirmar RT");
    add("es4", "Estrutura", "Contraventamento: " + (M.nDiagonais || 0) + " diagonal(is) de fachada e " + (M.nDiagonaisTransv || 0) + " transversal(is), em pares alternados do pé ao topo, nenhuma retirada.", "HSA 3.3.4 (F22 p.51)");
    add("es5", "Estrutura", "Montantes e painéis com travamento contra desencaixe.", "NR-18 18.12.7");
    add("es6", "Estrutura", "Nenhuma alteração não autorizada no andaime desde a última inspeção (peça tirada, trocada ou acrescentada).", "HSA checklist 2 (F22 p.84)", ["periodica", "evento"]);
    /* Conexões */
    add("co1", "Conexões", (M.nConexoes ? M.nConexoes.fixa : 0) + " abraçadeira(s) fixa(s) e " + (M.nConexoes ? M.nConexoes.giratoria : 0) + " giratória(s) apertadas conforme o manual do locador; nenhuma folgada ou faltando.", "HSA checklist 1 e 2; manual do locador (NR-18 18.12.1 c)");
    add("co2", "Conexões", "Manual de montagem do fabricante/locador, em português, disponível na frente de trabalho; projeto por profissional legalmente habilitado.", "NR-18 18.12.1 a) e c), 18.12.2", AP);
    /* Pisos */
    modelo.niveis.forEach(function (nvk) { if (nvk.piso) add("pi" + nvk.k, "Pisos", "Piso a " + brf(nvk.yPiso != null ? nvk.yPiso : nvk.y, 2) + " m com forração completa, antiderrapante, nivelada e travada.", "NR-18 18.12.5; NBR 6494 3.1.8.1"); });
    add("pi-b", "Pisos", "Pranchões lado a lado sem vão; balanço de cada ponta ≤ 0,20 m; " + (M.nConexoes ? M.nConexoes.prancha : 0) + " presilha(s) de pranchão instaladas.", "NBR 6494 3.1.8, 3.1.8.4; NR-18 18.12.7");
    add("pi-l", "Pisos", "Plataforma com largura ≥ 0,60 m (projeto: " + brf(M.largura, 2) + " m) e altura livre ≥ 1,75 m entre pisos forrados.", "NBR 6494 4.5.6", AP);
    add("pi-v", "Pisos", "Piso fixado contra o vento (andaime externo); pranchão sem trinca, nó passante ou podridão.", "NBR 6494 3.1.10; apostila — conferir");
    /* Proteção */
    add("pr1", "Proteção", "Guarda-corpo a " + brf(p.guarda, 2) + " m e intermediário a " + brf(p.intermediaria, 2) + " m em todo o perímetro, menos a face de trabalho.", "NR-18 18.9.4.2; 18.12.1 d)");
    add("pr2", "Proteção", "Rodapé de " + brf(p.rodape, 2) + " m (mínimo 0,15 m) rente ao piso, em todo o perímetro, menos a face de trabalho (" + modelo.rodapes.length + " tábua(s)).", "NR-18 18.9.4.2 c); 18.12.1 d)");
    if (modelo.tela && modelo.tela.area > 0) add("pr3", "Proteção", "Tela de proteção (" + brf(modelo.tela.area, 2) + " m²) da 1ª plataforma até 2,00 m acima da última, malha ≤ 25 mm, presa e sem rasgo.", "NR-18 18.12.15; NBR 6494 3.2.4.1");
    add("pr4", "Proteção", "Carregamento conforme o projeto: sem material empilhado nem sobrecarga; número de pisos carregados ao mesmo tempo respeitado.", "NBR 6494 3.1.4; HSA checklist 2", ["periodica", "evento"]);
    /* Acesso */
    function vaoDe(a) {
      var tr = modelo.trechos && modelo.trechos[a.trecho], e0 = tr && modelo.estacoes && modelo.estacoes[tr.est[0]]; if (!tr || !e0) return null;
      var s = e0.s + (a.a[0] - e0.pe[0]) * tr.u[0] + (a.a[2] - e0.pe[1]) * tr.u[1], v = null;
      arr(modelo.vaos).forEach(function (w) { if (w.trecho === a.trecho && s >= w.s0 - 0.3 && s <= w.s1 + 0.3 && v == null) v = w.idx + 1; });
      return v;
    }
    modelo.acessos.forEach(function (a, i) {
      var v = vaoDe(a), vTxt = v ? "vão " + v : "ponto indicado na planta";
      if (a.tipo === "escada") add("ac" + (i + 1), "Acesso", "Lance " + (a.lance || a.nivel) + " (escada de mão no " + vTxt + "), nível " + a.nivel + ": largura ≥ 0,40 m, degraus a cada 0,25–0,30 m, inclinação de " + brf(a.angulo || 75, 0) + "° (entre 50° e 75°), extensão de " + brf(a.L, 2) + " m (máximo 7 m), ultrapassando o piso em " + brf(a.ultrapasse || 1, 2) + " m (mínimo 1,00 m).", "NR-18 18.12.14 a); 18.8.6.13; 18.8.2 b); 18.12.1 e)");
      else add("ac" + (i + 1), "Acesso", "Módulo " + (a.modulo || i + 1) + " da escada marinheiro (" + vTxt + ", lance " + (a.lance || 1) + "), nível " + a.nivel + ": largura 0,40 a 0,60 m, degraus a cada 0,25–0,30 m, primeira barra a no máximo 0,40 m do piso, afastamento ≥ 0,15 m da estrutura.", "NR-18 18.8.6.2; 18.12.14; 18.12.1 e)");
    });
    if (modelo.acessos.some(function (a) { return a.tipo === "escada"; })) {
      add("acx1", "Acesso", "Portinhola (alçapão) do piso FECHADA após a passagem; nenhuma escada apoiada sobre portinhola (o pé do lance de cima fica no trecho maciço do piso).", "NR-18 18.12.14; boa prática de checklist");
      add("acx2", "Acesso", "Cada escada de mão ultrapassa o piso superior em pelo menos 1,00 m e tem degraus rígidos; não há escada com montante único.", "NR-18 18.8.6.13; 18.8.6.14");
      add("acx3", "Acesso", "Cada escada está fixada na base e no topo (não escorrega nem tomba) e sem emenda improvisada.", "NR-18 18.8.6.13; 18.8.6.15");
    }
    if (modelo.acessos.some(function (a) { return a.tipo === "marinheiro"; })) {
      add("acx4", "Acesso", "SPIQ (sistema de proteção individual contra quedas) instalado e usado em toda subida acima de 2 m na escada marinheiro.", "NR-18 18.8.6.3");
      add("acx5", "Acesso", "Escada marinheiro fixada a cada 3 m e no topo, com plataforma de descanso 0,60 × 0,60 m com guarda-corpo entre lances de até 6 m, e ultrapassando o piso de chegada em 1,10 a 1,20 m.", "NR-18 18.8.6.2");
    }
    if (modelo.torre) {
      add("acx6", "Acesso", "Torre de escada de uso coletivo: lances de 0,60 m, corrimão dos dois lados, degraus antiderrapantes, espelho ≤ 0,20 m, patamar a cada meio levante, guarda-corpo nos patamares, torre ligada ao andaime e apoiada em bases niveladas.", "NR-18 18.12.14 b); 18.8.6.1");
      add("acx7", "Acesso", "Cancela na chegada da torre ao piso de trabalho, fechada em uso (boa prática; a NR-18 não traz item para a cancela).", "boa prática (sem item de norma) — confirmar com o responsável técnico");
    }
    if (!modelo.acessos.length) add("ac0", "Acesso", "Acesso seguro a todos os níveis (desnível > 0,40 m exige acesso seguro; piso > 1,00 m exige escada).", "NR-18 18.12.1 e); 18.12.14");
    /* Ancoragem */
    if (anc) {
      add("an1", "Ancoragem", anc + " ancoragem(ns) nos pontos do projeto, no máximo 6,00 m entre si nas duas direções e ao menos 1 a cada 36,00 m².", "NBR 6494 4.5.2");
      add("an2", "Ancoragem", "Tubo de amarração acoplado ao pontalete e à travessa, a ≤ 0,30 m de um nó; olhal firme na estrutura.", "HSA 3.3.2 (F22 p.40) — referência estrangeira");
      var ens = Math.min(anc, Math.max(3, Math.ceil(anc * 0.05)));
      add("an3", "Ancoragem", "Ensaio de arrancamento dos olhais com 1,5 × a carga de projeto em ao menos 3 e 5 % do total (" + ens + " de " + anc + " ancoragem(ns)); sem movimento aparente. Resultados registrados.", "HSA 3.3.2 (F22 p.43) — referência estrangeira; confirmar RT", AP);
    } else {
      add("an1", "Ancoragem", "Andaime sem ancoragem: altura ÷ menor base ≤ 4 (projeto: " + (M.relacaoTorre != null ? brf(M.relacaoTorre, 2) : "conferir") + ").", "NR-18 18.12.3");
    }
    /* Sinalização */
    add("si1", "Sinalização", "Área de montagem isolada e sinalizada; aviso de 'andaime incompleto' retirado só após a liberação.", "NR-18 18.12.6; HSA seção 4");
    add("si2", "Sinalização", "Cartão (verde/amarelo/vermelho) afixado no acesso, com data, quem liberou, carga de serviço e validade da inspeção. (Convenção de fornecedor; a NR-18 não exige etiqueta colorida.)", "NR-18 18.12.4 (registro formal); catálogo F43 (convenção)");
    add("si3", "Sinalização", "Registro formal de liberação de uso assinado por profissional qualificado em segurança do trabalho ou pelo responsável pela frente/obra.", "NR-18 18.12.4", AP);
    add("si4", "Sinalização", "Trabalhadores em altura (acima de 2,00 m) com treinamento e SPIQ.", "NR-35 35.1.1; NR-18 18.12.6");
    add("si5", "Sinalização", "Perigos previstos para os próximos " + dias + " dias (tráfego, público, eletricidade, vento) avaliados.", "HSA checklist 2 (F22 p.84) — secundária", ["periodica", "evento"]);
    var mom = opc.momento;
    var todos = itens.slice(), filtrados = mom ? itens.filter(function (it) { return it.momentos.indexOf(mom) >= 0; }) : itens;
    filtrados.forEach(function (it) { var rr = resp[mom || "antes"] && resp[mom || "antes"][it.id]; if (rr) { it.resposta = rr.resposta; it.obs = rr.obs || ""; } });
    var grupos = GRUPOS_CHK.map(function (gn) { return { grupo: gn, itens: filtrados.filter(function (it) { return it.grupo === gn; }) }; }).filter(function (gp) { return gp.itens.length; });
    var momentos = {}; Object.keys(MOMENTOS).forEach(function (k) { var o = clone(MOMENTOS[k]); o.rotulo = o.rotulo.replace("{dias}", dias); o.itens = todos.filter(function (it) { return it.momentos.indexOf(k) >= 0; }).length; if (k === "periodica") o.intervaloDias = dias; momentos[k] = o; });
    var r = { ok: true, itens: filtrados, grupos: grupos, momentos: momentos, momento: mom || null, intervaloDias: dias };
    r.html = htmlChecklist(r);
    return r;
  }
  function htmlChecklist(r) {
    var h = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Checklist de inspeção do andaime</title><style>' + CSS_BASE + "</style></head><body><h1>Checklist de inspeção do andaime</h1>";
    h += "<p>" + Object.keys(r.momentos).map(function (k) { return "<b>" + esc(r.momentos[k].rotulo) + "</b> (" + r.momentos[k].itens + " itens) — " + esc(r.momentos[k].fonte); }).join("<br>") + "</p>";
    r.grupos.forEach(function (gp) {
      h += "<h2>" + esc(gp.grupo) + "</h2><table><tr><th>OK</th><th>NC</th><th>N/A</th><th>Item</th><th>Fonte</th><th>Obs.</th></tr>";
      gp.itens.forEach(function (it) { h += "<tr><td>" + (it.resposta === "ok" ? "✔" : "☐") + "</td><td>" + (it.resposta === "nc" ? "✔" : "☐") + "</td><td>" + (it.resposta === "na" ? "✔" : "☐") + "</td><td>" + esc(it.texto) + '</td><td class="nota">' + esc(it.fonte) + "</td><td>" + esc(it.obs) + "</td></tr>"; });
      h += "</table>";
    });
    return h + "</body></html>";
  }

  /* ================================================================ 3.4 APROVAÇÃO E LIBERAÇÃO */
  /* Chaves que NÃO mudam o andaime físico: o desenho das braçadeiras no 3D e o rótulo do aço do editor. */
  var HASH_FORA = { conexoes3d: 1, aco: 1, em: 1 };
  function parCanon(par) {
    var A = AN(), p = A && A.normalizar ? A.normalizar(par || {}) : clone(par || {}), o = {};
    ["x0", "y0", "z0", "giro"].forEach(function (k) { if (p[k] == null || p[k] === "") p[k] = 0; });
    Object.keys(p).forEach(function (k) {
      if (HASH_FORA[k]) return; var v = p[k];
      if (typeof v === "number") v = r4(v); else if (typeof v === "string") v = v.replace(/\s+/g, " ").trim();
      o[k] = v;
    });
    return o;
  }
  function canonStr(o) { return JSON.stringify(Object.keys(o).sort().map(function (k) { return [k, o[k]]; })); }
  function hashPar(par) {   /* FNV-1a 32 bits do par normalizado: barato, estável, sem dependência */
    var s = canonStr(parCanon(par)), h = 0x811c9dc5, i;
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
    return ("00000000" + h.toString(16)).slice(-8);
  }
  function fmtVal(v) { return typeof v === "number" ? String(r4(v)).replace(".", ",") : (v === true ? "sim" : (v === false ? "não" : (v == null || v === "" ? "(vazio)" : String(v)))); }
  function difPar(a, b) {
    var ca = parCanon(a), cb = parCanon(b), ks = {}, out = [];
    Object.keys(ca).concat(Object.keys(cb)).forEach(function (k) { ks[k] = 1; });
    Object.keys(ks).sort().forEach(function (k) { if (JSON.stringify(ca[k]) !== JSON.stringify(cb[k])) out.push({ campo: k, de: ca[k] == null ? null : ca[k], para: cb[k] == null ? null : cb[k] }); });
    return out;
  }
  function textoDif(campos) {
    if (!campos.length) return "";
    if (campos.length === 1) return "campo " + campos[0].campo + " de " + fmtVal(campos[0].de) + " para " + fmtVal(campos[0].para);
    return campos.length + " campos: " + campos.map(function (c) { return c.campo + " de " + fmtVal(c.de) + " para " + fmtVal(c.para); }).join("; ");
  }
  var Aprovacao = {
    ESTADOS: ["rascunho", "em_revisao", "aprovado", "liberado"],
    CARTOES: ["verde", "amarelo", "vermelho"],
    hash: hashPar, diff: difPar,
    relogio: function () { return agoraISO(); },
    nova: function () { return { versao: 1, estado: "rascunho", cartao: null, motivo: "", parHash: null, parSnap: null, projeto: null, liberacao: null, respostas: {}, respostasHash: null, inspecoes: [], historico: [], solucoes: [] }; },
    /* lê uma aprovação gravada (pode vir de versão antiga/ausente) sem nunca travar */
    ler: function (ap) { var b = Aprovacao.nova(); if (!ap || typeof ap !== "object") return b; var o = clone(ap); Object.keys(b).forEach(function (k) { if (o[k] === undefined) o[k] = b[k]; }); return o; },
    _quando: function (d) { return (d && d.quando) || Aprovacao.relogio(); },
    _quem: function (d) { var q = d && d.quem != null ? String(d.quem).trim() : ""; return q; },
    _falha: function (erro) { return { ok: false, erro: erro }; },
    /* grava a entrada no histórico (só cresce) e devolve a cópia nova */
    _reg: function (ap, e) { ap.historico.push(e); return ap; },
    _passo: function (ap0, acao, d, deEstados, paraEstado, extra) {
      var ap = Aprovacao.ler(ap0), q = Aprovacao._quem(d);
      if (!q) return Aprovacao._falha("Informe o nome de quem está fazendo isto (" + acao + "): toda mudança de estado do andaime tem autor.");
      if (deEstados.indexOf(ap.estado) < 0) return Aprovacao._falha("Não dá para '" + acao + "' com o andaime em '" + ap.estado + "' (só a partir de: " + deEstados.join(", ") + ").");
      var de = ap.estado; ap.estado = paraEstado;
      Aprovacao._reg(ap, { quando: Aprovacao._quando(d), quem: q, acao: acao, de: de, para: paraEstado, obs: (d && d.obs) || "" });
      if (extra) extra(ap);
      return { ok: true, ap: ap };
    },
    enviarRevisao: function (ap, d) { return Aprovacao._passo(ap, "enviar_revisao", d, ["rascunho"], "em_revisao"); },
    /* projeto aprovado por profissional legalmente habilitado (NR-18 18.12.2): nome, registro CREA/CAU e ART.
       ART obrigatória no campo, mas com PORTA: "dispensada — <motivo>" (a NR-18 2026 não repete a ART; o CREA decide). */
    aprovar: function (ap0, d, par) {
      var a = Aprovacao.ler(ap0);
      if (a.cartao === "vermelho") return Aprovacao._falha("Há interdição em aberto (" + (a.motivo || "sem motivo") + "). Registre 'corrigido — reinspecionar' antes de aprovar de novo.");
      if (!d || !String(d.registro || "").trim()) return Aprovacao._falha("Informe o registro profissional (CREA/CAU) de quem aprova o projeto.");
      if (!String(d.art || "").trim()) return Aprovacao._falha("Informe o número da ART — ou escreva 'dispensada — <motivo>' se o CREA dispensa neste caso.");
      if (par == null) return Aprovacao._falha("Falta o conjunto de parâmetros do andaime para travar a aprovação.");
      return Aprovacao._passo(a, "aprovar", d, ["em_revisao"], "aprovado", function (n) {
        n.parHash = hashPar(par); n.parSnap = parCanon(par); n.projeto = { quem: String(d.quem).trim(), registro: String(d.registro).trim(), art: String(d.art).trim(), quando: n.historico[n.historico.length - 1].quando };
        n.historico[n.historico.length - 1].obs = ("registro " + n.projeto.registro + "; ART " + n.projeto.art + (d.obs ? "; " + d.obs : "")).trim();
      });
    },
    /* d = { momento, id, resposta, quem, obs, quando }. A resposta do checklist "antes" fica amarrada ao hash do par em que foi dada:
       se o andaime mudar no meio da inspeção, as respostas velhas vão para o histórico e a inspeção recomeça.
       ⚠ Sem isso um "ok" dado a um andaime de 4 m liberava o de 8 m. */
    responder: function (ap0, d, par) {
      var ap = Aprovacao.ler(ap0); d = d || {};
      if (["antes", "periodica", "evento"].indexOf(d.momento) < 0) return Aprovacao._falha("Momento de inspeção desconhecido: " + d.momento + ".");
      if (["ok", "nc", "na"].indexOf(d.resposta) < 0) return Aprovacao._falha("Resposta inválida (use ok, nc ou na).");
      if (!String(d.quem || "").trim()) return Aprovacao._falha("Informe quem respondeu o item do checklist.");
      if (d.resposta === "nc" && !String(d.obs || "").trim()) return Aprovacao._falha("Item não conforme precisa de observação: o que está errado.");
      var hp = par != null ? hashPar(par) : null, q = d.quando || Aprovacao.relogio();
      if (d.momento === "antes" && ap.respostasHash && hp && ap.respostasHash !== hp) Aprovacao._arquivar(ap, q, String(d.quem).trim(), "checklist recomeçado: o andaime mudou durante a inspeção");
      if (d.momento === "antes") ap.respostasHash = hp;
      if (!ap.respostas[d.momento]) ap.respostas[d.momento] = {};
      var ant = ap.respostas[d.momento][d.id] ? ap.respostas[d.momento][d.id].resposta : null;
      ap.respostas[d.momento][d.id] = { resposta: d.resposta, obs: d.obs || "", quem: String(d.quem).trim(), quando: q };
      Aprovacao._reg(ap, { quando: q, quem: String(d.quem).trim(), acao: "checklist", de: ant, para: d.resposta, obs: d.id + (d.obs ? ": " + d.obs : "") });
      return { ok: true, ap: ap };
    },
    /* descarta as respostas do checklist SEM perdê-las: vão para dentro de uma entrada nova do histórico (só cresce) */
    _arquivar: function (ap, quando, quem, motivo) {
      var tem = ap.respostas && Object.keys(ap.respostas).some(function (m) { return Object.keys(ap.respostas[m] || {}).length; });
      if (tem) ap.historico.push({ quando: quando, quem: quem, acao: "checklist_descartado", de: null, para: null, obs: motivo, respostasDescartadas: clone(ap.respostas) });
      ap.respostas = {}; ap.respostasHash = null;
    },
    /* quem impede a liberação: nc ou sem resposta, só nos itens do momento "antes" */
    pendencias: function (ap0, itens) {
      var ap = Aprovacao.ler(ap0), R = ap.respostas.antes || {}, nc = [], sem = [];
      arr(itens).forEach(function (it) { if (it.momentos && it.momentos.indexOf("antes") < 0) return; var r = R[it.id] ? R[it.id].resposta : null; if (r === "nc") nc.push(it); else if (r == null) sem.push(it); });
      return { nc: nc, semResposta: sem };
    },
    liberar: function (ap0, d, par, itens) {
      var a = Aprovacao.ler(ap0), cor = d && d.cartao === "amarelo" ? "amarelo" : "verde";
      if (a.estado !== "aprovado") return Aprovacao._falha("Só se libera andaime APROVADO (estado atual: " + a.estado + ").");
      if (par == null || hashPar(par) !== a.parHash) return Aprovacao._falha("O andaime foi alterado depois da aprovação: aprove de novo antes de liberar.");
      if (!itens || !itens.length) return Aprovacao._falha("Sem o checklist 'antes da liberação' não há como liberar.");
      var pe = Aprovacao.pendencias(a, itens);
      if (pe.nc.length) return Aprovacao._falha("Não dá para liberar: " + pe.nc.length + " item(ns) do checklist 'antes da liberação' NÃO CONFORME (" + pe.nc.slice(0, 3).map(function (i) { return i.id; }).join(", ") + (pe.nc.length > 3 ? "…" : "") + "). Corrija, reinspecione e responda de novo.");
      if (pe.semResposta.length) return Aprovacao._falha("Não dá para liberar: " + pe.semResposta.length + " item(ns) do checklist 'antes da liberação' sem resposta. Item não inspecionado não é conforme.");
      if (a.respostasHash !== a.parHash) return Aprovacao._falha("As respostas do checklist 'antes da liberação' foram dadas a outra versão do andaime: refaça a inspeção do andaime como está montado.");
      if (cor === "amarelo" && !String(d.restricao || "").trim()) return Aprovacao._falha("Liberação com restrição: escreva o que NÃO pode ser feito no andaime.");
      return Aprovacao._passo(a, "liberar", d, ["aprovado"], "liberado", function (n) {
        n.cartao = cor; n.motivo = cor === "amarelo" ? String(d.restricao).trim() : "";
        n.liberacao = { quem: String(d.quem).trim(), funcao: d.funcao || "", quando: n.historico[n.historico.length - 1].quando, cartao: cor, restricao: n.motivo };
        n.historico[n.historico.length - 1].obs = ("cartão " + cor + (n.motivo ? " — restrição: " + n.motivo : "") + (d.funcao ? "; " + d.funcao : "")).trim();
      });
    },
    restringir: function (ap, d) {
      if (!d || !String(d.restricao || "").trim()) return Aprovacao._falha("Escreva a restrição: o que NÃO pode ser feito no andaime.");
      return Aprovacao._passo(ap, "restringir", d, ["liberado"], "liberado", function (n) { n.cartao = "amarelo"; n.motivo = String(d.restricao).trim(); n.liberacao.cartao = "amarelo"; n.liberacao.restricao = n.motivo; n.historico[n.historico.length - 1].obs = "restrição: " + n.motivo; });
    },
    /* interdição: vermelho com MOTIVO obrigatório; o estado volta a em_revisao (só se libera de novo reinspecionando) */
    interditar: function (ap, d) {
      if (!d || !String(d.motivo || "").trim()) return Aprovacao._falha("Escreva o motivo da interdição.");
      return Aprovacao._passo(ap, "interditar", d, ["em_revisao", "aprovado", "liberado"], "em_revisao", function (n) { var u = n.historico.pop(); n.cartao = "vermelho"; n.motivo = String(d.motivo).trim(); n.parHash = null; Aprovacao._arquivar(n, u.quando, u.quem, "checklist descartado pela interdição"); u.obs = "interditado: " + n.motivo; n.historico.push(u); });
    },
    /* a PORTA de saída do vermelho (CLAUDE.md §3): corrigido — reinspecionar. Continua em revisão; precisa aprovar e liberar de novo. */
    corrigido: function (ap0, d) {
      var a = Aprovacao.ler(ap0);
      if (a.cartao !== "vermelho") return Aprovacao._falha("Não há interdição (cartão vermelho) para encerrar.");
      if (!d || !String(d.obs || "").trim()) return Aprovacao._falha("Descreva o que foi corrigido.");
      return Aprovacao._passo(a, "corrigido_reinspecionar", d, ["em_revisao"], "em_revisao", function (n) { var u = n.historico.pop(); n.cartao = null; n.motivo = ""; Aprovacao._arquivar(n, u.quando, u.quem, "checklist descartado: reinspeção depois da correção"); n.historico.push(u); });
    },
    /* reabrir de propósito (para editar o projeto): aprovado → revisão; liberado → revisão com cartão vermelho */
    reabrir: function (ap0, d) {
      var a = Aprovacao.ler(ap0), eraLib = a.estado === "liberado";
      if (!d || !String(d.obs || "").trim()) return Aprovacao._falha("Diga por que está reabrindo o projeto.");
      return Aprovacao._passo(a, "reabrir", d, ["aprovado", "liberado"], "em_revisao", function (n) { var u = n.historico.pop(); if (eraLib) { n.cartao = "vermelho"; n.motivo = "projeto reaberto: " + String(d.obs).trim(); } n.parHash = null; Aprovacao._arquivar(n, u.quando, u.quem, "checklist descartado: projeto reaberto"); n.historico.push(u); });
    },
    /* E4.1: o RT registra a SOLUÇÃO ADOTADA para o que o cálculo reprova (ex.: guarda-corpo ensaiado — exige o nº do laudo). Só cresce; nunca liberta sozinho:
       o cálculo continua mostrando o uso real e o estado fica em «atenção» com o laudo escrito. */
    registrarSolucao: function (ap0, d) {
      var ap = Aprovacao.ler(ap0), q = Aprovacao._quem(d);
      if (!q) return Aprovacao._falha("Informe quem registra a solução adotada.");
      var tipos = ["laudo_guarda_corpo", "poste_guarda", "escora", "ancoragem_topo", "outra"];
      if (!d || tipos.indexOf(d.tipo) < 0) return Aprovacao._falha("Tipo de solução inválido (use: " + tipos.join(", ") + ").");
      if (d.tipo === "laudo_guarda_corpo" && !String(d.laudo || "").trim()) return Aprovacao._falha("Guarda-corpo ensaiado só vale com o nº do laudo: informe o laudo.");
      if (!String(d.obs || d.laudo || "").trim()) return Aprovacao._falha("Descreva a solução adotada.");
      var quando = Aprovacao._quando(d), e = { quando: quando, quem: q, tipo: d.tipo, laudo: String(d.laudo || "").trim(), obs: String(d.obs || "").trim() };
      ap.solucoes = arr(ap.solucoes); ap.solucoes.push(e);
      Aprovacao._reg(ap, { quando: quando, quem: q, acao: "solucao_registrada", de: ap.estado, para: ap.estado, obs: d.tipo + (e.laudo ? " — laudo nº " + e.laudo : "") + (e.obs ? "; " + e.obs : "") });
      return { ok: true, ap: ap };
    },
    /* o nº do último laudo de guarda-corpo registrado ("" se não há) — vai para AndaimeCalc.calcular(modelo, { guardaLaudo }) */
    laudoGuarda: function (ap0) { var l = arr(Aprovacao.ler(ap0).solucoes).filter(function (x) { return x.tipo === "laudo_guarda_corpo" && x.laudo; }); return l.length ? l[l.length - 1].laudo : ""; },
    /* inspeção periódica / após evento: registra; qualquer nc interdita (vermelho) com o motivo */
    registrarInspecao: function (ap0, d, par) {
      var ap = Aprovacao.ler(ap0), q = Aprovacao._quem(d), mom = d && d.momento;
      if (!q) return Aprovacao._falha("Informe quem inspecionou.");
      if (mom !== "periodica" && mom !== "evento") return Aprovacao._falha("Inspeção registrada aqui é 'periodica' ou 'evento' (a de antes da liberação é o checklist).");
      if (ap.estado !== "liberado") return Aprovacao._falha("Só há inspeção periódica de andaime liberado (estado atual: " + ap.estado + ").");
      if (par != null && hashPar(par) !== ap.parHash) return Aprovacao._falha("O andaime foi alterado depois da liberação: reinspecione pelo fluxo de revisão.");
      var R = d.respostas || {}, nc = Object.keys(R).filter(function (k) { return R[k] === "nc"; }), quando = Aprovacao._quando(d);
      ap.inspecoes.push({ quando: quando, quem: q, momento: mom, respostas: clone(R), obs: d.obs || "" });
      Aprovacao._reg(ap, { quando: quando, quem: q, acao: "inspecao_" + mom, de: ap.estado, para: ap.estado, obs: (nc.length ? "NÃO CONFORME: " + nc.join(", ") + (d.obs ? "; " + d.obs : "") : "sem não conformidade" + (d.obs ? "; " + d.obs : "")) });
      if (nc.length) { var de = ap.estado; ap.estado = "em_revisao"; ap.cartao = "vermelho"; ap.motivo = "inspeção " + (mom === "periodica" ? "periódica" : "após evento") + " com não conformidade (" + nc.join(", ") + ")"; ap.parHash = null; Aprovacao._arquivar(ap, quando, q, "checklist descartado pela interdição");
        Aprovacao._reg(ap, { quando: quando, quem: q, acao: "interditar", de: de, para: "em_revisao", obs: ap.motivo }); }
      return { ok: true, ap: ap, interditado: nc.length > 0 };
    },
    /* ⚠ chamado pelo refazer do componente (js/metalprontas.js identidade): andaime aprovado/liberado que mudou volta
       para revisão com cartão vermelho e o histórico diz QUAL campo mudou, de quê para quê. Idempotente. */
    aoAlterar: function (ap0, parNovo, quem, quando) {
      var ap = Aprovacao.ler(ap0);
      if ((ap.estado !== "aprovado" && ap.estado !== "liberado") || ap.parHash == null) return ap;
      if (hashPar(parNovo) === ap.parHash) return ap;
      var campos = ap.parSnap ? difPar(ap.parSnap, parNovo) : [], de = ap.estado, q = quando || Aprovacao.relogio();
      var txt = "liberação cancelada: andaime alterado depois da " + (de === "liberado" ? "liberação" : "aprovação") + (campos.length ? " (" + textoDif(campos) + ")" : " (parâmetros diferentes dos aprovados)");
      var descartadas = ap.respostas && Object.keys(ap.respostas).length ? clone(ap.respostas) : null;
      ap.estado = "em_revisao"; ap.cartao = "vermelho"; ap.motivo = txt; ap.parHash = null; ap.respostas = {}; ap.respostasHash = null;
      var e = { quando: q, quem: String(quem || "").trim() || "sistema (alteração no editor)", acao: "alteracao_cancela_liberacao", de: de, para: "em_revisao", campos: campos, obs: txt };
      if (campos.length) { e.campo = campos[0].campo; e.valorDe = campos[0].de; e.valorPara = campos[0].para; }
      if (descartadas) e.respostasDescartadas = descartadas;
      ap.historico.push(e);
      return ap;
    },
    /* o cartão que vale AGORA. Confere o hash na hora: se aoAlterar foi esquecido, nunca sai verde. */
    cartaoEfetivo: function (ap0, parAtual) {
      var ap = Aprovacao.ler(ap0);
      if (ap.estado === "liberado" && parAtual != null && hashPar(parAtual) !== ap.parHash)
        return { cor: "vermelho", motivo: "liberação cancelada: andaime alterado depois da liberação", cancelado: true };
      if (ap.estado === "liberado") return { cor: ap.cartao === "amarelo" ? "amarelo" : "verde", motivo: ap.motivo || "" };
      if (ap.cartao === "vermelho") return { cor: "vermelho", motivo: ap.motivo || "" };
      return { cor: null, motivo: "" };
    },
    validade: function (ap0, dias) {
      var ap = Aprovacao.ler(ap0), ult = ap.liberacao ? ap.liberacao.quando : null, i;
      for (i = 0; i < ap.inspecoes.length; i++) if (ap.inspecoes[i].quando > (ult || "")) ult = ap.inspecoes[i].quando;
      if (!ult) return null; var d = new Date(ult); if (isNaN(d.getTime())) return null; d.setUTCDate(d.getUTCDate() + num(dias, INSPECAO_DIAS)); return d.toISOString();
    }
  };

  /* ---- cartão A5 */
  function cartaoHtml(ap0, modelo, cab, opc) {
    cab = cab || {}; opc = opc || {};
    var ap = Aprovacao.ler(ap0), par = modelo && modelo.par ? modelo.par : null, ef = Aprovacao.cartaoEfetivo(ap, par), dias = num(opc.intervaloDias, INSPECAO_DIAS);
    var cor = ef.cor, cores = { verde: "#1f7a3d", amarelo: "#d9a400", vermelho: "#b3261e", null: "#5b6673" };
    var titulo = cor === "verde" ? "LIBERADO PARA USO" : (cor === "amarelo" ? "LIBERADO COM RESTRIÇÃO" : (cor === "vermelho" ? "NÃO USAR — INTERDITADO" : "SEM LIBERAÇÃO — NÃO USAR"));
    var q = opc.qServ != null ? opc.qServ : cab.qServ, liberou = ap.liberacao, val = cor === "verde" || cor === "amarelo" ? Aprovacao.validade(ap, dias) : null;
    var h = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Cartão do andaime</title><style>@page{size:A5;margin:8mm}' +
      "body{font-family:Arial,Helvetica,sans-serif;color:#1d2733;margin:0;font-size:10.5pt} .faixa{background:" + cores[cor] + ";color:#fff;text-align:center;padding:14px 6px;font-size:21pt;font-weight:800;letter-spacing:.5px}" +
      " table{border-collapse:collapse;width:100%;margin-top:6px} td{border:1px solid #9fb0c3;padding:5px 7px;vertical-align:top} td.k{width:34%;background:#eef3f8;font-weight:700} .ph{color:#b3261e;font-weight:700}" +
      " .restr{border:3px solid " + cores[cor] + ";padding:6px 8px;margin-top:6px;font-weight:700} .nota{font-size:7.5pt;color:#4a5664;margin-top:8px}</style></head><body>";
    h += '<div class="faixa">' + titulo + "</div><table>";
    h += '<tr><td class="k">Andaime</td><td>' + ph(cab.andaime, "NOME / CÓDIGO DO ANDAIME") + "</td></tr>";
    h += '<tr><td class="k">Obra / local</td><td>' + ph(cab.obra, "OBRA") + " — " + ph(cab.local, "LOCAL") + "</td></tr>";
    h += '<tr><td class="k">Estado</td><td>' + esc(ap.estado.replace("_", " ")) + "</td></tr>";
    if (cor === "verde" || cor === "amarelo") {
      h += '<tr><td class="k">Liberado em / por</td><td>' + esc(dataBR(liberou && liberou.quando)) + " — " + esc(liberou ? liberou.quem : "") + (liberou && liberou.funcao ? " (" + esc(liberou.funcao) + ")" : "") + "</td></tr>";
      h += '<tr><td class="k">Carga de serviço do piso</td><td>' + (q != null && q !== "" ? brf(q, 2) + " kN/m² (" + brf(num(q, 0) * 101.97, 0) + " kgf/m²)" : '<span class="ph">[CARGA DE SERVIÇO — vem do cálculo]</span>') + "</td></tr>";
      h += '<tr><td class="k">Validade da inspeção</td><td>' + (val ? esc(dataBR(val)) + " (a cada " + dias + " dias, confirmar RT)" : ph("", "DATA DA PRÓXIMA INSPEÇÃO")) + "</td></tr>";
    }
    h += "</table>";
    if (cor === "verde" || cor === "amarelo") h += '<div class="restr">Não deixar material sobre o andaime fora do horário de trabalho.</div>';
    if (cor === "amarelo") h += '<div class="restr">RESTRIÇÕES — não pode: ' + esc(ap.motivo) + "</div>";
    if (cor === "vermelho") h += '<div class="restr">MOTIVO: ' + esc(ef.motivo) + "</div>";
    if (!cor) h += '<div class="restr">Andaime ainda sem registro formal de liberação de uso (NR-18 18.12.4). Não use.</div>';
    h += '<div class="nota">Convenção de cartão de fornecedor (verde = liberado, amarelo = liberado com restrição, vermelho = incompleto ou interditado) — <b>não é norma</b>. A NR-18 não exige etiqueta colorida: exige o registro formal de liberação assinado (18.12.4). O cartão só vale com a assinatura da liberação arquivada na obra.</div>';
    return h + "</body></html>";
  }

  /* ================================================================ 3.5 MEMORIAL (esqueleto; o cálculo vem da E4) */
  /* texto das notas gerais da prancha `andaime` do Padrão RA (padrao_detalhamento_ra.json › andaime › notas_gerais) */
  function notasGerais(modelo, opc) {
    opc = opc || {}; var q = opc.qServ, n = opc.pisosCarregados, T = modelo && modelo.tubo ? modelo.tubo : null, t = AN() && AN().CATALOGO ? AN().CATALOGO.tubo.paredeNominalMm : 3.0;
    var qs = q != null && q !== "" ? brf(q, 2) : '<span class="ph">[q]</span>', kg = q != null && q !== "" ? brf(num(q, 0) * 101.97, 0) : '<span class="ph">[kgf]</span>', ns = n != null && n !== "" ? esc(n) : '<span class="ph">[n]</span>';
    return [
      "Nunca alterar o andaime sem comunicação prévia ao responsável técnico; qualquer problema na montagem → consultar para revisão do projeto.",
      "Todas as medidas em milímetros e níveis em metros, salvo indicação. Não medir no desenho.",
      "Carga de trabalho admissível: " + qs + " kN/m² (" + kg + " kgf/m²) por piso, " + ns + " piso(s) carregado(s) ao mesmo tempo (NBR 6494 3.1.4). Não empilhar material.",
      "Montagem e desmontagem por trabalhadores capacitados, com SPIQ, ferramentas amarradas e área isolada e sinalizada (NR-18 18.12.6); nunca um montador só (NBR 6494 3.3.5).",
      "Uso somente após o registro formal de liberação assinado (NR-18 18.12.4) e cartão verde no acesso.",
      "Andaime tipo " + (opc.tipo || "tubo-roll") + ": tubo Ø48,3 x " + brf(t, 1) + " mm, abraçadeiras forjadas/prensadas conforme catálogo do locador.",
      "Ancoragens conforme planta, no máximo 6,00 m entre si e uma a cada 36 m² (NBR 6494 4.5.2); não retirar ancoragem antes de desmontar o levante de cima."
    ];
  }
  var NAO_VERIFICADO_BASE = [
    "Resistência do solo, da laje ou do piso onde o andaime apoia (depende de dado do local).",
    "Resistência da estrutura onde os olhais são fixados e ensaio de arrancamento em campo.",
    "Estado real do material do locador (certificados, manual em português, inspeção de recebimento).",
    "Montagem em campo: conferência de prumo, esquadro, torque e travamentos (checklist 'antes da liberação').",
    "Material armazenado sobre o andaime durante a tempestade (o vento é verificado sem Q): não deixar material sobre o andaime fora do horário de trabalho."
  ];
  var VERIFS_E4 = ["Montante (compressão com flambagem entre levantes, flexocompressão)", "Travessa (flexão e flecha)", "Transversal (flexão e flecha)", "Pranchão do piso (flexão e flecha L/200)", "Guarda-corpo (NR-18 18.9.4.2: 90 kgf/m, flecha ≤ 76 mm; carga pontual de 350 N)", "Abraçadeira fixa e giratória (deslizamento)", "Base regulável (carga admissível pela rosca)", "Apoio / calço (pressão no solo)", "Ancoragem (vento, NBR 6123:2023)", "Estabilidade sem ancoragem (torre ≤ 4 × a menor base; tombamento)"];
  function memorialHtml(modelo, calc, cab, opc) {
    cab = cab || {}; opc = opc || {};
    if (!modelo || !modelo.ok) return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Memorial</title></head><body><p class="aviso">Sem modelo de andaime montado.</p></body></html>';
    var A = AN(), M = modelo.medidas, P = modelo.par || {}, ver = calc && arr(calc.verificacoes).length ? calc.verificacoes : null, lista = listaLocacao(modelo, cab, opc), plano = planoMontagem(modelo, P);
    var h = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Memorial de cálculo do andaime</title><style>' + CSS_BASE + " @page{size:A4;margin:18mm 15mm}</style></head><body>";
    h += "<h1>Memorial de cálculo — andaime tubo-roll</h1>" + cabHtml(cab);
    h += "<h2>1. Finalidade</h2><p>Projeto de andaime para trabalho em altura (acima de 2,00 m — NR-35 35.1.1): descrição, hipóteses, verificações, lista de locação, plano de montagem e liberação de uso. Não trata de fabricação nem de custo.</p>";
    h += "<h2>2. Descrição do andaime</h2><table><tr><th>Medida</th><th>Valor</th></tr>" + [
      ["Comprimento traçado", brf(M.comprimento, 2) + " m"], ["Largura da plataforma", brf(M.largura, 2) + " m"], ["Altura do piso do topo", brf(M.alturaPiso, 2) + " m"],
      ["Vãos / levantes / pisos", M.nVaos + " / " + M.nLevantes + " / " + M.nPisos], ["Pontaletes (prumadas)", M.nMontantes], ["Ancoragens", M.nAncoragens], ["Área de piso", brf(M.areaPiso, 2) + " m²"], ["Tela", brf(modelo.tela ? modelo.tela.area : 0, 2) + " m²"],
      ["Tubo", "Ø" + brf(modelo.tubo ? modelo.tubo.Dmm : 48.3, 1) + " mm"]].map(function (x) { return "<tr><td>" + x[0] + '</td><td class="n">' + esc(x[1]) + "</td></tr>"; }).join("") + "</table>";
    h += "<h2>3. Normas e fontes</h2><ul><li>" + esc(F.NR18) + ": 18.9.4.2 (guarda-corpo), 18.12.1, 18.12.2, 18.12.3, 18.12.4 (liberação), 18.12.5, 18.12.6, 18.12.7, 18.12.13, 18.12.14, 18.12.15.</li><li>NR-35 35.1.1 (trabalho em altura &gt; 2,00 m).</li>" +
      '<li>ABNT NBR 8800:2008; NBR 6123:2023 (vento); NBR 8681 (ações e segurança); critério NB-14 (tensões admissíveis) só como conferência do montante, fonte secundária.</li><li><span class="ph">ABNT NBR 6494:1990 — exemplar não licenciado; vigência não confirmada; conferir antes da emissão.</span> As alturas de guarda-corpo da NBR 6494 (0,50/1,00 m) não são usadas: vale a NR-18 (1,20/0,70 m).</li>' +
      "<li>Valores de fonte secundária (apostilas, catálogo de locador, HSA Irlanda, EN 12811) aparecem marcados e são confirmados pelo responsável técnico.</li></ul>";
    h += "<h2>4. Hipóteses e parâmetros</h2><table><tr><th>Parâmetro</th><th>Valor</th><th>Situação</th></tr>";
    arr(modelo.parametrosRT).forEach(function (x) {
      var def = A && A.PARAMETROS_RT ? A.PARAMETROS_RT[x.chave] : null, regra = def && def.regra;
      h += "<tr><td>" + esc(x.chave) + '</td><td class="n">' + esc(fmtVal(x.valor)) + "</td><td>" + (regra ? "regra de norma" : '<span class="rt">confirmar pelo responsável técnico</span>') + '<div class="nota">' + esc(x.obs || "") + "</div></td></tr>";
    });
    h += "</table>";
    var qCalc = calc && calc.parametros && calc.parametros.qServ != null ? calc.parametros.qServ : opc.qServ;
    h += "<h2>5. Cargas e combinações</h2><p>Carga de serviço do piso: " + (qCalc != null && qCalc !== "" ? brf(qCalc, 2) + " kN/m² (" + brf(num(qCalc, 0) * 101.9716, 0) + " kgf/m²)" : '<span class="ph">[CARGA DE SERVIÇO — definir no cálculo]</span>') + ". Combinações (NBR 8681), a pior vale: (1) 1,25 G + 1,5 Q + 1,4 × 0,6 W; (2) 1,25 G + 1,4 W (vento principal SEM Q — a NBR 6494 3.3.4 manda parar com vento forte); ancoragem: força de SERVIÇO do vento; tombamento: 1,0 G + 1,4 W; ELS = G + Q — <span class=\"rt\">confirmar pelo responsável técnico</span>. Vento: NBR 6123:2023 com a velocidade básica do local.</p>";
    if (calc && calc.parametros) {
      var cp = calc.parametros, vv = calc.vento;
      h += "<table><tr><th>Parâmetro do cálculo</th><th>Valor</th></tr>" + [
        ["Pisos carregados", cp.pisosCarregados], ["Fator estatístico S3", vv && vv.ok ? (vv.grupoS3 === 5 ? "0,83 (NBR 6123:2023 Tabela 4, grupo 5) — decisão do RT: " + cp.s3Justificativa : "1,00 (NBR 6123:2023 Tabela 4, grupo 3: estrutura desmontável com vistas a reutilização)") : "—"], ["Sombreamento da tela (NBR 6123:2023 7.5)", cp.telaSombreamento != null ? brf(cp.telaSombreamento, 2) : "NÃO informado — pior caso 0,75"], ["Luva da longitudinal", cp.luvaRigida ? "contínua (RT confirmou)" : "rótula (conservador)"], ["Categoria de rugosidade (NBR 6123:2023)", cp.categoria != null ? cp.categoria : "NÃO informada — pior caso (I)"], ["Aço do tubo (fy / fu)", brf(cp.fy, 0) + " / " + brf(cp.fu, 0) + " MPa"], ["Coeficiente de flambagem K (KL = K × levante)", brf(cp.K, 2)], ["Excentricidade da abraçadeira", brf(cp.eAbrac, 3) + " m"],
        ["Abraçadeira fixa / giratória (admissível ao deslizamento)", brf(cp.capFixaKgf, 0) + " / " + brf(cp.capGiratoriaKgf, 0) + " kgf"], ["Capacidade da ancoragem", brf(cp.capAncoragem, 2) + " kN"],
        ["Tensão admissível do solo", cp.sigmaSolo != null ? brf(cp.sigmaSolo, 0) + " kPa" + (cp.sigmaSoloConfirmado ? " (confirmada pelo RT)" : " (NÃO confirmada)") : "não informada"],
        ["Vento paralelo à fachada (atrito na tela e cabeceiras)", cp.ventoParaleloRT && String(cp.ventoParaleloJustificativa || "").replace(/\s/g, "").length >= 15 ? "conferido pelo responsável técnico: " + cp.ventoParaleloJustificativa : "NÃO calculado — o RT confere"],
        ["Velocidade básica V0", vv && vv.ok ? brf(vv.V0, 0) + " m/s — " + vv.fonteV0 : "não informada (vento não verificado)"]].map(function (x) { return "<tr><td>" + esc(x[0]) + '</td><td class="n">' + esc(x[1]) + "</td></tr>"; }).join("") + "</table>";
    }
    if (calc && arr(calc.pendencias).length) h += '<h3>Pendências do cálculo</h3><ul>' + calc.pendencias.map(function (t) { return '<li class="aviso">' + esc(t) + "</li>"; }).join("") + "</ul>";
    h += "<h2>6. Verificações</h2>";
    if (!ver) {
      h += '<p class="aviso">CÁLCULO AINDA NÃO EXECUTADO — NÃO LIBERAR. Nenhuma verificação foi feita; este documento não atesta a segurança do andaime.</p><ul>' + VERIFS_E4.map(function (v) { return "<li>" + esc(v) + ': <span class="ph">[não executado]</span></li>'; }).join("") + "</ul>";
    } else {
      h += (calc.resumo ? "<p><b>" + esc(calc.resumo) + "</b></p>" : "");
      h += "<table><tr><th>Verificação</th><th>Fórmula e valores</th><th>Solicitante</th><th>Resistente</th><th>Uso</th><th>Estado</th></tr>";
      ver.forEach(function (v) {
        var est = v.estado === "ok" ? '<span class="ok">atende</span>' : (v.estado === "nao_verificado" ? '<span class="ph">não verificado</span>' : (v.estado === "atencao" ? '<span class="aviso">atenção</span>' : '<span class="aviso">NÃO ATENDE</span>'));
        var det = (v.texto ? '<div class="nota">' + esc(v.texto) + "</div>" : (v.valores && typeof v.valores === "string" ? '<div class="nota">' + esc(v.valores) + "</div>" : ""));
        arr(v.ressalvas).forEach(function (r) { det += '<div class="nota aviso">' + esc(r) + "</div>"; });
        arr(v.confirmarRT).length && (det += '<div class="nota"><span class="rt">confirmar pelo responsável técnico:</span> ' + esc(v.confirmarRT.join("; ")) + "</div>");
        h += "<tr><td>" + esc(v.titulo || v.id) + "</td><td>" + esc(v.formula || "") + det + '<div class="nota">Fonte: ' + esc(v.fonte || "") + '</div></td><td class="n">' + esc(v.solicitante == null ? "" : v.solicitante) + '</td><td class="n">' + esc(v.resistente == null ? "" : v.resistente) + '</td><td class="n">' + (v.uso == null ? "" : brf(v.uso * 100, 0) + " %") + "</td><td>" + est + "</td></tr>";
      });
      h += "</table>";
      if (calc.caminho && arr(calc.caminho.transversais).length) {
        h += "<h3>Caminho de carga do piso (serviço): pranchão contínuo → transversal → longitudinal contínua (luva = rótula) → montante</h3><table><tr><th>Transversal</th><th>Nível</th><th>s (m)</th><th>G recebido (kN)</th><th>Q recebido (kN)</th></tr>" +
          calc.caminho.transversais.filter(function (t) { return t.RG_kN > 0 || t.RQ_kN > 0; }).map(function (t) { return "<tr><td>" + esc(t.id) + "</td><td>" + t.nivel + '</td><td class="n">' + brf(t.s, 2) + '</td><td class="n">' + brf(t.RG_kN, 3) + '</td><td class="n">' + brf(t.RQ_kN, 3) + "</td></tr>"; }).join("") + "</table>";
        h += "<table><tr><th>Longitudinal</th><th>Nível</th><th>Linha</th><th>Reações nos montantes: G + Q (kN)</th><th>Luvas (m)</th></tr>" +
          calc.caminho.longitudinais.map(function (L) { return "<tr><td>" + esc(L.corrida) + "</td><td>" + L.nivel + "</td><td>" + esc(L.linha) + "</td><td>" + L.reacoes.map(function (r) { return esc(r.poste) + ": " + brf(r.RG_kN, 3) + " + " + brf(r.RQ_kN, 3); }).join("; ") + "</td><td>" + L.luvas.map(function (x) { return brf(x, 2); }).join("; ") + "</td></tr>"; }).join("") + "</table>";
      }
      if (arr(calc.reacoes).length) {
        h += "<h3>Reações nas bases (carga de serviço e de cálculo)</h3><table><tr><th>Base</th><th>Montante</th><th>Serviço (kN)</th><th>Serviço (kgf)</th><th>ELU1 (kN)</th><th>ELU1 (kgf)</th></tr>" +
          calc.reacoes.map(function (r) { return "<tr><td>" + esc(r.base) + "</td><td>" + esc(r.poste) + '</td><td class="n">' + brf(r.servico_kN, 2) + '</td><td class="n">' + brf(r.servico_kgf, 0) + '</td><td class="n">' + brf(r.elu_kN, 2) + '</td><td class="n">' + brf(r.elu_kgf, 0) + "</td></tr>"; }).join("") + "</table>";
      }
    }
    h += "<h2>7. O que NÃO foi verificado</h2><ul>" + NAO_VERIFICADO_BASE.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + arr(calc && calc.naoVerificado).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + (ver ? "" : '<li class="aviso">Todas as verificações do item 6 (cálculo não executado).</li>') + "</ul>";
    h += "<h2>8. Lista de locação (resumo)</h2><p>" + lista.totais.pecas + " peças, " + brf(lista.totais.pesoKg, 2) + " kg" + (lista.totais.m2Tela ? ", " + brf(lista.totais.m2Tela, 2) + " m² de tela" : "") + ".</p><table><tr><th>QNT</th><th>PEÇA</th></tr>" +
      lista.linhas.map(function (l) { return '<tr><td class="n">' + brf(l.qtd, l.un === "m²" ? 2 : 0) + "</td><td>" + esc(l.nome) + "</td></tr>"; }).join("") + "</table>";
    h += "<h2>9. Plano de montagem (resumo)</h2><ol>" + plano.passos.map(function (x) { return "<li>" + esc(x.titulo) + (x.totalPecas ? " — " + x.totalPecas + " peças" : "") + "</li>"; }).join("") + "</ol>";
    h += "<h2>10. Notas gerais</h2><ul>" + notasGerais(modelo, opc).map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>";
    h += "<h2>11. Responsável técnico e liberação</h2><table><tr><td>Responsável técnico</td><td>" + ph(cab.responsavel, "NOME DO RESPONSÁVEL TÉCNICO") + "</td><td>Registro (CREA/CAU)</td><td>" + ph(cab.registro, "Nº DO REGISTRO") + "</td><td>ART</td><td>" + ph(cab.art, "Nº DA ART") + "</td></tr>" +
      "<tr><td>Assinatura</td><td colspan=\"5\" style=\"height:30px\"></td></tr><tr><td>Liberação de uso (NR-18 18.12.4)</td><td colspan=\"5\">" + ph(opc.liberadoPor, "NOME DE QUEM LIBEROU — profissional de SST ou responsável pela frente/obra") + " — " + ph("", "DATA E ASSINATURA") + "</td></tr></table>";
    return h + "</body></html>";
  }

  var AndaimeDocs = {
    versao: "E3-1", INSPECAO_DIAS: INSPECAO_DIAS, REGRAS: REGRA, REQUISITOS: REQUISITOS,
    listaLocacao: listaLocacao, construirXlsx: construirXlsx, exportarXlsx: exportarXlsx, planoMontagem: planoMontagem, checklist: checklist,
    Aprovacao: Aprovacao, cartaoHtml: cartaoHtml, memorialHtml: memorialHtml, notasGerais: notasGerais, hashPar: hashPar, trazer: trazer
  };
  global.AndaimeDocs = AndaimeDocs;
  if (typeof module !== "undefined" && module.exports) module.exports = AndaimeDocs;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
