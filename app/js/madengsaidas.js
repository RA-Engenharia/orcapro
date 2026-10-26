/* =====================================================================
 * madengsaidas.js — SAÍDAS da tela "Estruturas de madeira" (motor PURO, ES5, sem DOM, Node-testável):
 *   · lista de peças e resumo por material/seção (as linhas das planilhas)
 *   · planilha de cotação .xlsx (ExcelJS vem de FORA: o mesmo que o sistema já usa na Metálica e na lista de compra da Madeira)
 *   · IFC4 com Pset por peça (id, grupo, material, especificação, comprimento, volume) — pelo MESMO escritor do BIM (js/ifcsaida.js,
 *     caminho dos volumes livres: a peça vira uma extrusão exata, IfcExtrudedAreaSolid)
 *   · as peças como operações do BIM (volumes livres) — "Mostrar no 3D" / "Enviar ao BIM"
 *   · reações para a fundação (tabela + texto copiável) e o comparativo das opções A/B/C
 * A fonte de peças é a do madtipologias: { id, grupo, descricao, material, especificacao, secao, p0, p1, up, qtd, comprimento_m, volume_m3, unidade }.
 * Coordenadas da fonte: X, Y na planta e Z cota; a cena do BIM é Y para cima: cena = (X, Z, −Y) — uma rotação, preserva os produtos vetoriais.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { return global[nome] || (typeof require === "function" ? (function () { try { return require("./" + arq); } catch (e) { return null; } })() : null); }
  function num(v, d) { var n = Number(v); return v == null || v === "" || !isFinite(n) ? d : n; }
  function r(x, n) { var p = Math.pow(10, n); return Math.round(x * p) / p; }
  function br(x, c) { if (x == null || !isFinite(x)) return "—"; var s = Math.abs(x).toFixed(c == null ? 2 : c).split("."); return (x < 0 ? "−" : "") + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (s[1] ? "," + s[1] : ""); }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cruz(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function unit(a) { var l = Math.sqrt(dot(a, a)); return l > 1e-12 ? mul(a, 1 / l) : null; }
  function cena(p) { return [p[0], p[2], -p[1]]; }

  /* ------------------------------------------------------------ geometria da peça → receita de extrusão (cena do BIM) */
  function matCurto(m) { return String(m || "Madeira").split(/ — | \(/)[0].slice(0, 60); }
  function categoriaDe(p, d) {
    var L = Math.sqrt(dot(d, d)); if (L < 1e-9) return "generico";
    if (/^(P\d|DS-P|DI-P|ESC-L)/.test(p.id) && Math.abs(d[2]) / L > 0.8) return "pilar";
    if (/^FX/.test(p.id)) return "generico";
    if (Math.abs(d[2]) / L > 0.8) return "pilar";
    return /^(ES|PD)/.test(p.id) ? "generico" : "viga";
  }
  /** receita de extrusão da peça (null se não tem corpo: telha, lambri, parafusos…) */
  function corpoPeca(p) {
    var s = p.secao, p0 = p.p0, p1 = p.p1; if (!s || !p0 || !p1) return null;
    if (s.tipo === "perfil" && s.perfil && s.perfil.length >= 3) {
      var x = p0[0], b = s.b;
      return { categoria: "viga", receita: { forma: "extrusao", contorno: s.perfil.map(function (q) { return [r(q[0], 4), r(q[1], 4)]; }), altura: b,
        plano: { o: cena([x - b / 2, 0, 0]), u: cena([0, 1, 0]), v: cena([0, 0, 1]) } } };
    }
    var a = sub(p1, p0), L = Math.sqrt(dot(a, a)); if (L < 1e-6) return null;
    var d = mul(a, 1 / L), up = p.up || [0, 0, 1], v = unit(sub(up, mul(d, dot(up, d))));
    if (!v) { var alt = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]; v = unit(sub(alt, mul(d, dot(alt, d)))); }
    var u = unit(cruz(v, d)), cont;
    if (s.tipo === "circ") { cont = []; for (var i = 0; i < 24; i++) { var t = 2 * Math.PI * i / 24; cont.push([r(s.d / 2 * Math.cos(t), 5), r(s.d / 2 * Math.sin(t), 5)]); } }
    else if (s.tipo === "ret") cont = [[-s.b / 2, -s.h / 2], [s.b / 2, -s.h / 2], [s.b / 2, s.h / 2], [-s.b / 2, s.h / 2]];
    else return null;
    return { categoria: categoriaDe(p, d), receita: { forma: "extrusao", contorno: cont, altura: r(L, 5), plano: { o: cena(p0), u: cena(u), v: cena(v) } } };
  }

  /** os volumes livres da fonte (entrada do IfcSaida.gerar e das operações do BIM) */
  function volumesDaFonte(pecas, opcao) {
    var out = [];
    (pecas || []).forEach(function (p) {
      var c = corpoPeca(p); if (!c) return;
      var psets = { MadEng_Peca: [["Id", "IFCIDENTIFIER", p.id], ["Grupo", "IFCLABEL", p.grupo], ["Material", "IFCLABEL", matCurto(p.material)], ["Especificacao", "IFCTEXT", String(p.especificacao || "").slice(0, 400)],
        ["Comprimento", "IFCLENGTHMEASURE", p.comprimento_m], ["Volume", "IFCVOLUMEMEASURE", p.volume_m3], ["Quantidade", "IFCINTEGER", p.qtd == null ? 1 : p.qtd], ["Opcao", "IFCLABEL", opcao || ""]] };
      out.push({ id: "mad-" + p.id, tipo: "volume", categoria: c.categoria, ifc: { pilar: "IFCCOLUMN", viga: "IFCBEAM", generico: "IFCBUILDINGELEMENTPROXY" }[c.categoria], material: matCurto(p.material),
        nome: p.id + " — " + String(p.descricao || "").slice(0, 60), receita: c.receita, psets: psets });
    });
    return out;
  }
  /** IFC4 do mesmo escritor do BIM. opts = { projeto, opcao, agora } → { ok, texto, resumo, n } */
  function gerarIfc(pecas, opts) {
    opts = opts || {};
    var IS = dep("IfcSaida", "ifcsaida.js"); if (!IS || !IS.gerar) return { ok: false, erro: "o escritor de IFC (js/ifcsaida.js) não carregou" };
    var vols = volumesDaFonte(pecas, opts.opcao);
    if (!vols.length) return { ok: false, erro: "não há peça com corpo para exportar" };
    var res = IS.gerar({ volumes: vols }, { projeto: opts.projeto || "Estrutura de madeira", semente: opts.semente || ("madeng:" + (opts.projeto || "") + ":" + (opts.opcao || "")), agora: opts.agora, edificio: opts.projeto || "Estrutura de madeira" });
    return { ok: true, texto: res.texto, resumo: res.resumo, n: vols.length };
  }
  /** as peças como operações do BIM (volumes livres, um id estável por peça: reenviar substitui) */
  function opsBim(pecas) { return volumesDaFonte(pecas).map(function (v) { return { op: "volume", id: v.id, volume: { receita: v.receita, categoria: v.categoria, material: v.material, nome: v.nome } }; }); }

  /* ------------------------------------------------------------ lista de peças e planilha de cotação */
  function secaoTxt(s) { return !s ? "" : s.tipo === "circ" ? "Ø" + r(s.d * 100, 0) : s.tipo === "ret" ? r(s.b * 100, 0) + "×" + r(s.h * 100, 0) : s.tipo === "perfil" ? r(s.b * 100, 0) + "×variável" : ""; }
  function linhasPecas(pecas) {
    return (pecas || []).map(function (p) { return { id: p.id, grupo: p.grupo, descricao: p.descricao, material: p.material, especificacao: p.especificacao, secao: secaoTxt(p.secao), comprimento: p.comprimento_m == null ? null : p.comprimento_m,
      qtd: p.qtd == null ? 1 : p.qtd, volume: p.volume_m3 == null ? null : p.volume_m3, unidade: p.unidade || "peça", comGeometria: !!(p.secao && p.p0), ligacao: /^Ligações|contraventamento/.test(p.grupo || ""), metros: p.comprimento_m == null ? null : r(p.comprimento_m * (p.qtd == null ? 1 : p.qtd), 2) }; });
  }
  /** resumo por material e seção (a aba "Resumo madeira" da cotação) */
  function resumoMadeira(pecas) {
    var m = {};
    (pecas || []).forEach(function (p) {
      if (!(p.secao && p.p0 && p.volume_m3)) return;
      var k = p.material + "|" + secaoTxt(p.secao), q = p.qtd == null ? 1 : p.qtd;
      var x = m[k] || (m[k] = { material: p.material, secao: secaoTxt(p.secao), pecas: 0, metros: 0, volume: 0, maior: 0, maiorId: "" });
      x.pecas += q; x.metros += (p.comprimento_m || 0) * q; x.volume += p.volume_m3; if ((p.comprimento_m || 0) > x.maior) { x.maior = p.comprimento_m; x.maiorId = p.id; }
    });
    return Object.keys(m).map(function (k) { var x = m[k]; x.metros = r(x.metros, 2); x.volume = r(x.volume, 3); return x; }).sort(function (a, b) { return a.material < b.material ? -1 : a.material > b.material ? 1 : b.volume - a.volume; });
  }
  /** monta o Workbook da cotação com o ExcelJS recebido. d = { obra, opcao, nome, pecas, orcamento? } → o Workbook */
  function xlsxCotacao(EJ, d) {
    var wb = new EJ.Workbook(), L = linhasPecas(d.pecas), neg = { bold: true }, cab = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF5" } };
    wb.creator = "OrçaPRO"; wb.created = new Date();
    function aba(nome, cols, linhas, larg) {
      var ws = wb.addWorksheet(nome, { views: [{ state: "frozen", ySplit: 3 }] });
      ws.getCell("A1").value = "Cotação de madeira — " + (d.obra || "obra") + (d.opcao ? " — opção " + d.opcao + (d.nome ? ": " + d.nome : "") : ""); ws.getCell("A1").font = { bold: true, size: 13 };
      ws.getCell("A2").value = "Gerada pelo OrçaPRO em " + new Date().toLocaleDateString("pt-BR") + " · quantidades do modelo calculado · conferir medidas brutas com o fornecedor";
      ws.getRow(3).values = cols; ws.getRow(3).font = neg; ws.getRow(3).eachCell(function (c) { c.fill = cab; c.border = { bottom: { style: "thin" } }; });
      linhas.forEach(function (l) { ws.addRow(l); });
      larg.forEach(function (w, i) { ws.getColumn(i + 1).width = w; });
      return ws;
    }
    var peca = L.filter(function (x) { return x.comGeometria && !x.ligacao; }), outros = L.filter(function (x) { return !x.comGeometria && !x.ligacao; }), lig = L.filter(function (x) { return x.ligacao; });
    var w1 = aba("Lista de peças", ["Id", "Grupo", "Descrição", "Material", "Especificação", "Seção b×h ou Ø (cm)", "Comprimento (m)", "Qtd", "Volume (m³)"],
      peca.map(function (x) { return [x.id, x.grupo, x.descricao, x.material, x.especificacao, x.secao, x.comprimento, x.qtd, x.volume]; }), [10, 30, 46, 40, 60, 16, 14, 7, 12]);
    w1.eachRow({ includeEmpty: false }, function (row, i) { if (i > 3) { row.getCell(7).numFmt = "#,##0.00"; row.getCell(9).numFmt = "#,##0.0000"; } });
    var res = resumoMadeira(d.pecas), tv = 0, tm = 0, tp = 0;
    var w2 = aba("Resumo madeira", ["Material", "Seção (cm)", "Nº de peças", "Metros lineares (m)", "Volume (m³)", "Maior comprimento (m)", "Peça mais longa"],
      res.map(function (x) { tv += x.volume; tm += x.metros; tp += x.pecas; return [x.material, x.secao, x.pecas, x.metros, x.volume, x.maior, x.maiorId]; }), [60, 16, 12, 18, 14, 18, 16]);
    var tot = w2.addRow(["Total", "", tp, r(tm, 2), r(tv, 3), "", ""]); tot.font = neg;
    aba("Cobertura, forro e deck", ["Id", "Grupo", "Descrição", "Material", "Especificação", "Unidade", "Quantidade"],
      outros.map(function (x) { return [x.id, x.grupo, x.descricao, x.material, x.especificacao, x.unidade, x.qtd]; }), [10, 30, 50, 40, 60, 10, 12]);
    aba("Ferragens e ligações", ["Id", "Grupo", "Descrição", "Material", "Especificação", "Unidade", "Quantidade"],
      lig.map(function (x) { return [x.id, x.grupo, x.descricao, x.material, x.especificacao, x.comGeometria ? "m" : x.unidade, x.comGeometria ? x.metros : x.qtd]; }), [10, 30, 50, 40, 70, 10, 12]);
    return wb;
  }

  /* ------------------------------------------------------------ reações para a fundação */
  /** reacoes = { B00: {Nmax, Nmin, Hmax, Mmax}, … } (kN, kN·m; N>0 compressão, N<0 arrancamento) → { linhas, texto } */
  function reacoesFundacao(reacoes, obra, opcao) {
    var linhas = Object.keys(reacoes || {}).sort().map(function (k) { var x = reacoes[k]; return { no: k, Nmax: x.Nmax, Nmin: x.Nmin, Hmax: x.Hmax, Mmax: x.Mmax }; });
    var t = ["REAÇÕES PARA A FUNDAÇÃO — " + (obra || "obra") + (opcao ? " (opção " + opcao + ")" : ""), "Valores de CÁLCULO (combinações últimas, NBR 8681), na base de cada pilar. N em kN (positivo = compressão; negativo = arrancamento), H em kN, M em kN·m.", ""];
    linhas.forEach(function (l) { t.push(l.no + ": N máx " + br(l.Nmax, 1) + " · N mín " + br(l.Nmin, 1) + " · H máx " + br(l.Hmax, 1) + " · M máx " + br(l.Mmax, 1)); });
    var arr = linhas.filter(function (l) { return l.Nmin < 0; });
    if (arr.length) t.push("", "Atenção: há arrancamento (N negativo) em " + arr.map(function (l) { return l.no; }).join(", ") + ": a fundação precisa de peso próprio ou ancoragem para a tração.");
    t.push("", "Base engastada: o momento M entra no cálculo do bloco/sapata. Os pilaretes dos decks não entram nesta tabela (cargas leves do deck: conferir com o projetista da fundação).");
    return { linhas: linhas, texto: t.join("\n") };
  }

  /** linhas do comparativo A/B/C: cada item { id, nome, volume, pecas, ferragensKg, etaMax, preco } */
  function comparativo(itens) { return (itens || []).map(function (o) { return { id: o.id, nome: o.nome, volume: o.volume, pecas: o.pecas, ferragens: o.ferragens, etaMax: o.etaMax, preco: o.preco, ok: o.ok }; }); }

  /** CLASSIFICAÇÃO DOS AVISOS (E4 r5) — UM lugar só. O que o motor devolve em `avisos` é de dois tipos:
   *   BLOQUEANTE (impede emitir): grupo/ligação com η > 1, recusa, achado do auditor, falta de dado obrigatório, e QUALQUER aviso que não esteja na tabela abaixo
   *     (regra de segurança: aviso novo do motor nasce bloqueante até alguém decidir, com motivo, que é só premissa).
   *   INFORMATIVO / PREMISSA ADOTADA: nota de norma, rigidez da base calculada pela ligação, rosca soberba pela ETA, M4/M13 como premissas — declarado, não reprova nada.
   *  Cada linha: cod (rótulo curto), re (casa o INÍCIO do texto), porque (o motivo de ser só premissa). Casa só avisos (tipo "aviso"): achado, ligação, grupo e recusa são sempre bloqueantes. */
  var PREMISSAS = [
    { cod: "7.1.9", re: /^7\.1\.9/, porque: "rosca soberba d ≥ 9,5 mm: o WT-T-8,2 (d = 8,2 mm, abaixo de 9,5 mm) foi ADOTADO pela ETA do fabricante — A CONFIRMAR PELO RT (não confirmado: a transcrição da norma não esclarece o autoatarraxante de rosca total; terça TS-6 e caibro CP-2 dependem só dele)" },
    { cod: "M2", re: /^M2:/, porque: "Kθ da base calculado pela ligação (pinos em série com os chumbadores), sem a fundação: declarado, a fundação do projeto informa o Kθ real" },
    { cod: "N6", re: /^N6: rigidez da base (= \d+ .*CALCULADA|\d+ kN.*convergida)/, porque: "rigidez da base CALCULADA pela ligação dimensionada e convergida (não é premissa informada nem diagnóstico com base rígida)" },
    { cod: "M4", re: /^M4:/, porque: "abertura dominante em face de sucção montada como excepcional: premissa adotada, a favor da segurança" },
    { cod: "M13", re: /^M13:/, porque: "torção por excentricidade do vento (NBR 6123, 6.6) montada como binário: premissa adotada" },
    { cod: "M6", re: /^M6: a base em cruz reprovava/, porque: "base em cruz resolvida com pino menor, sem aumentar o pilar: decisão do motor, registrada" },
    { cod: "N-incl", re: /^Inclinação abaixo de 5 %/, porque: "nota de norma (NBR 6120:2019, Anexo D): verificar o empoçamento" },
    { cod: "N-dinam", re: /^efeitos dinâmicos \(cap\. 9\)/, porque: "nota de norma (NBR 6123, cap. 9): T1 ≤ 1 s, a resposta flutuante já está no S2" },
    { cod: "N-cob1", re: /^cobertura de uma água: θ/, porque: "nota de norma (NBR 6123, Tabela 6): adotado θ = 5°" },
    { cod: "N-t6", re: /^Tabela 6:/, porque: "nota de norma (NBR 6123, Tabela 6): vento oblíquo declarado" },
    { cod: "N-t5", re: /^Tabela 5, /, porque: "nota de norma (NBR 6123, Tabela 5): valor mantido a favor da segurança" },
    { cod: "N-beiral", re: /^beiral: /, porque: "nota de norma (NBR 6123, Tabela 5, nota a)" },
    { cod: "N-obliquo2", re: /^vento oblíquo na cobertura de duas águas/, porque: "nota de norma (NBR 6123, Tabela 5): caso oblíquo declarado" },
    { cod: "T2-nm", re: /^T2: (não modelados|vergas de vidro)/, porque: "escopo declarado da T2 (vergas de vidro e caibros secundários; a torção do frechal 6.6 já é modelada, M13, e o oblíquo é declarado à parte): entra como premissa do memorial" },
    { cod: "T2-v", re: /^T2: vento com a cobertura/, porque: "vento de duas águas pela Tabela 5: premissa declarada" },
    { cod: "T7-escada", re: /^T7: escada de OUTRO material/, porque: "escopo declarado: a escada de concreto é de outro projeto; só os degraus de madeira entram como item" },
    { cod: "T7-concentrada", re: /^T7: a NBR 6120:2019 \(Tab\. 10, p\. 18\) não fixa carga concentrada/, porque: "a Tab. 10 não dá carga concentrada para varandas; Qk de 1 kN adotada por analogia com a cobertura (6.4) — o RT confirma" },
    { cod: "T7-vento", re: /^T7: vento sobre o deck/, porque: "vento no deck e no guarda-corpo vazado fica como premissa declarada (informar a pressão para incluir)" },
    { cod: "T7-adotado", re: /^T7: adotado \(a confirmar pelo RT\)/, porque: "classe do roliço D40, do cumaru D60 e fu = 500 MPa são adoções a favor da segurança, declaradas no memorial: o RT confirma com o fornecedor/laudo" },
    { cod: "T7-vento-nbr", re: /^T7: vento no deck calculado pela NBR 6123/, porque: "vento do deck calculado pela NBR 6123 na cota do topo (V0, S1, S2, S3 da obra); Ca = 1,0 (conservador) e ψ0 = 0,6 são adoções declaradas — o RT confirma" },
    { cod: "T7-vento-informado", re: /^T7: vento no deck com a pressão informada/, porque: "pressão do vento informada pelo usuário, Ca = 1,0 e ψ0 adotados a favor da segurança — o RT confirma" },
    { cod: "T7-R35", re: /^T7: R35 /, porque: "regra R35 (decisão do coordenador): vigas a menos de 15 cm do terreno apoiam em MURETA da fundação (outra empresa); declarada, nunca silenciosa — confirmar com a fundação; pode ser desligada na entrada do deck" },
    { cod: "T2-topo", re: /^E4 r11: /, porque: "crédito de topo travado do pilar da T2: só quando o K_br,1 da cobertura e das paredes atende; o motor diz se aplicou ou não — premissa declarada, a validar pelo RT" },
    { cod: "T7-regiao", re: /^T7: (região do país|guarda-corpo calculado com a carga da região V)/, porque: "região da NBR 10821-2 não informada: adotada a V (a mais severa), a favor da segurança — informar a região da obra" }
  ];
  /** classe de um aviso: "informativo" (premissa adotada) ou "bloqueante" (padrão) */
  function classeAviso(texto) { var t = String(texto || ""); for (var i = 0; i < PREMISSAS.length; i++) if (PREMISSAS[i].re.test(t)) return { classe: "informativo", cod: PREMISSAS[i].cod, porque: PREMISSAS[i].porque }; return { classe: "bloqueante" }; }

  /** SITUAÇÃO do cálculo (E3; E4 r5 separa bloqueantes e premissas): lê o resultado de forma GENÉRICA — achados do auditor, ligação reprovada (ok === false ou η > 1), grupo com η > 1, falta de solução e
   *  qualquer aviso/recusa que o motor devolver (resultado.avisos, avisosAnalise, ligacoes.avisos, memoria.vento.avisos, motivo/erro). Nunca "atende" com bloqueante aberto.
   *  → { atende, itens: [BLOQUEANTES { tipo, texto, peca?, correcao? }], premissas: [INFORMATIVOS { tipo:"premissa", cod, texto, porque }] } — "atende" quando não há bloqueante. */
  function situacao(res) {
    var it = [], pr = [];
    function txtOf(a) { return typeof a === "string" ? a : (a && (a.mensagem || a.texto || a.msg || a.aviso)) || JSON.stringify(a); }
    function add(tipo, a, extra) { var t = txtOf(a); if (!t) return; if (tipo === "aviso") { var c = classeAviso(t); if (c.classe === "informativo") { if (!pr.some(function (x) { return x.texto === t; })) pr.push({ tipo: "premissa", cod: c.cod, texto: t, porque: c.porque }); return; } } var o = { tipo: tipo, texto: t }; if (extra) for (var k in extra) o[k] = extra[k]; it.push(o); }
    if (!res) return { atende: false, itens: [{ tipo: "recusa", texto: "Sem resultado de cálculo." }], premissas: [] };
    if (res.semSolucao) add("recusa", "O dimensionamento não encontrou solução dentro dos limites: ajustar a tipologia ou os limites de seção.");
    ["motivo", "erro"].forEach(function (k) { if (res[k]) add("recusa", res[k]); });
    (res.auditoria && res.auditoria.achados || []).forEach(function (a) { add("achado", a.mensagem, { peca: a.peca, correcao: a.correcao, regra: a.regra }); });
    var L = res.ligacoes;
    if (L) {
      /* correção por verificação: a base em cruz e a solda chapa-placa (R04) têm saída própria; as demais seguem o texto geral */
      var CORRECAO = {
        "base-cruz": function () { var p = L.base && L.base.cruz && L.base.cruz.passos && L.base.cruz.passos[0]; return "Base em cruz recusada: usar base em garfo, ou aumentar o lado/diâmetro do pilar" + (L.base && L.base.cruz && L.base.cruz.a ? " até a ≥ " + Math.ceil(L.base.cruz.a * 1000 + 4) + " mm" : "") + ", e recalcular." + (p ? " (" + p + ")" : ""); },
        "placa-solda": function () { var sd = L.placaBase && L.placaBase.solda; return "Solda chapa–placa reprovada" + (sd && sd.tipo === "penetracao-total" ? " mesmo em penetração total" : "") + ": usar base em garfo, aumentar o diâmetro/lado do pilar (chapa mais larga) ou a espessura da chapa em cruz, e recalcular."; },
        "placa-flexao": function () { return "Placa de base fletida além do limite: aumentar a espessura da placa ou reduzir o balanço (chapa em cruz mais larga) e recalcular."; },
        "placa-chumbadores": function () { return "Chumbadores reprovados (tração + cortante): aumentar o diâmetro ou o número de chumbadores e recalcular."; }
      };
      (L.verificacoes || []).forEach(function (v) { if (v.ok === false || (isFinite(v.eta) ? v.eta > 1 + 1e-9 : true)) add("ligacao", "Ligação reprovada: " + v.nome + (isFinite(v.eta) ? " (η = " + v.eta.toFixed(3).replace(".", ",") + ")" : " (sem solução)"), { correcao: CORRECAO[v.nome] ? CORRECAO[v.nome]() : "Aumentar fixadores, chapa ou seção e recalcular." }); });
      if (L.ok === false && !it.some(function (x) { return x.tipo === "ligacao"; })) add("ligacao", "Ligações com ok = falso no resultado.", { correcao: "Ver as verificações das ligações e recalcular." });
      (L.avisos || []).forEach(function (a) { add("aviso", a); });
    }
    Object.keys(res.grupos || {}).forEach(function (g) { var e = res.grupos[g] && res.grupos[g].eta; if (isFinite(e) && e > 1 + 1e-9) add("grupo", "Grupo " + g + " reprovado (η = " + e.toFixed(3).replace(".", ",") + ")", { correcao: "Aumentar a seção do grupo ou o limite de crescimento." }); });
    (res.avisos || []).forEach(function (a) { add("aviso", a); });
    (res.avisosAnalise || []).forEach(function (a) { add("aviso", a); });
    var v = res.memoria && res.memoria.vento; if (v) (v.avisos || []).forEach(function (a) { add("aviso", a); });
    return { atende: it.length === 0, itens: it, premissas: pr };
  }

  var MadEngSaidas = { situacao: situacao, classeAviso: classeAviso, PREMISSAS: PREMISSAS, corpoPeca: corpoPeca, volumesDaFonte: volumesDaFonte, gerarIfc: gerarIfc, opsBim: opsBim, linhasPecas: linhasPecas, resumoMadeira: resumoMadeira, xlsxCotacao: xlsxCotacao,
    reacoesFundacao: reacoesFundacao, comparativo: comparativo, secaoTxt: secaoTxt, matCurto: matCurto, br: br };
  if (typeof module !== "undefined" && module.exports) module.exports = MadEngSaidas;
  else global.MadEngSaidas = MadEngSaidas;
})(typeof window !== "undefined" ? window : (typeof self !== "undefined" ? self : this));
