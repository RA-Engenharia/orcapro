/* =====================================================================
 * madengmanual.js — MANUAL DE MONTAGEM DA MADEIRA ENGENHARADA (E3 / folha E12 do Padrão RA). Livro enxuto A3 paisagem, no molde aprovado do
 * Quiosque (js/madmanual.js): capa, como ler, UMA ETAPA POR PÁGINA, ilustração grande e limpa com a MESMA câmera em todas (peças da etapa em cor,
 * o já montado em cinza), 3 a 5 frases por etapa, tabela resumida no fim. Motor PURO, ES5, sem DOM.
 * Ordem real: bases → pilares → vigas V → vergas, travessas e pendurais → terças → travamentos (bloqueadores e escoras) → fita → lambri e telha → deck e escada → guarda-corpo.
 *   MadEngManual.gerar(res, opcoes) → { ok, html, paginas, etapas: [{ id, titulo, pecas, n }], camera, avisos }
 * Teste: node tools/test-mad-eng-manual.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } } return null; }
  var MPE = dep("MadEngPranchas", "./madengpranchas.js");
  var MP = dep("MadPranchas", "./madpranchas.js"), I = MP && MP._i;
  var FAIXA = "Documento gerado pelo sistema — emissão somente após conferência e ART do responsável técnico";
  function arr(v) { return Array.isArray(v) ? v : []; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function n2(v) { return String(Math.round(v * 100) / 100); }
  var COR = { etapa: "#00406A", montado: "#b8c0c8", fita: "#3F7818", fundo: "#ffffff" };

  /* câmera única: azimute/elevação em graus; devolve f(P3) → [x, y, profundidade] */
  function camera(az, el) {
    var a = az * Math.PI / 180, e = el * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), ce = Math.cos(e), se = Math.sin(e);
    return function (P) { var x = P[0] * ca - P[1] * sa, y = P[0] * sa + P[1] * ca; return [x, -(P[2] * ce + y * se), y * ce - P[2] * se]; };
  }
  function cantosDe(p) {
    if (p.perfil) { var out = []; [-1, 1].forEach(function (sg) { p.perfil.forEach(function (q) { out.push([p.p0[0] + sg * p.b / 2, q[0], q[1]]); }); }); return out; }
    return I.caixaPeca(p).cantos;
  }
  function caixaBase(pc, L, esp) { return { id: "BA", p0: [pc.p0[0], pc.p0[1], pc.p0[2] - esp], p1: [pc.p0[0], pc.p0[1], pc.p0[2]], dl: [1, 0, 0], ext: [esp, L, L], b: L, h: L }; }
  function gerar(res, op) {
    op = op || {};
    if (!MPE || !I) return { ok: false, html: "", avisos: ["js/madengpranchas.js não carregou."] };
    if (!res || !res.fonte || !arr(res.fonte.pecas).length || !res.ligacoes) return { ok: false, html: "", etapas: [], paginas: 0, avisos: ["Resultado sem fonte de peças: sem manual."] };
    var pcs = MPE.desenhaveis(res.fonte.pecas), mk = MPE.marcar(pcs), por = function (re) { return pcs.filter(function (p) { return re.test(p.id); }); };
    var L = res.ligacoes, avisos = [], bases = por(/^P\d/).map(function (p) { return caixaBase(p, (L.placaBase && L.placaBase.dimensoes_mm[0] || 400) / 1000, (L.placaBase && L.placaBase.espessura_mm || 25) / 1000); });
    function tx(re) { var o = {}; por(re).forEach(function (p) { o[p.marca] = (o[p.marca] || 0) + p.qtd; }); return Object.keys(o).sort().map(function (m) { return o[m] + " × " + m; }).join(", "); }
    var P_ = por(/^P\d/), V_ = por(/^V\d/), TL = por(/^T\d/), VG = por(/^(VG|TR|PD)/), BQ = por(/^(BL|ES\d)/), TI = por(/^FX\d/), DK = pcs.filter(function (p) { return /^(DS-|DI-|ESC-)/.test(p.id); });
    var ET = [
      { id: "bases", titulo: "Bases e chumbadores", pecas: bases, qtd: bases.length + " placas de base BA-01", frases: ["Confira os chumbadores e o nível das " + bases.length + " placas antes de chegar qualquer peça: a fundação é de outra empresa.", "Cada base leva placa " + (L.placaBase ? L.placaBase.dimensoes_mm.join("x") + "x" + L.placaBase.espessura_mm : "") + " mm e " + (L.placaBase ? L.placaBase.chumbadores.total : "") + " chumbadores inox M20.", "A madeira não toca o concreto: o pé do pilar fica elevado sobre a placa (detalhe LG01, folha E06A).", "Atenção: o embutimento do chumbador é definido pela fundação."] },
      { id: "pilares", titulo: "Pilares PL", pecas: P_, qtd: tx(/^P\d/), frases: ["Posicione os " + P_.length + " pilares nas placas, prumo nos dois planos, antes de apertar.", "A chapa em cruz da base entra nas fendas de 18 mm do pilar; fixe com os " + (L.base ? 2 * L.base.n : "") + " pinos inox Ø16 e feche com os tampões de madeira.", "Escore cada pilar com travamento provisório até a V estar montada.", "Atenção: engastado na base, o pilar não aceita carga lateral sem escora."] },
      { id: "vigas", titulo: "Vigas V (altura variável)", pecas: V_, qtd: tx(/^V\d/), frases: ["Içar cada viga V (peso próprio acima de " + n2(V_.length ? V_[0].vol * 5 : 0) + " kN) pelos pontos de içamento, ponta A (beiral) voltada para a frente.", "A V apoia no topo do pilar; a chapa em T com forquilha abraça a face de baixo da V e trava a torção (LG02).", "Fixe com os pinos Ø16 e os " + (L.reforcoV ? L.reforcoV.parafusos : "") + " parafusos WT-T 8,2×300 de reforço sobre cada pilar (LG11).", "Atenção: confira a marca e o sentido das pontas A e B antes de içar."] },
      { id: "vergas", titulo: "Vergas, travessas e pendurais", pecas: VG, qtd: tx(/^(VG|TR|PD)/), frases: ["Monte as " + por(/^VG/).length + " vergas entre os pilares, na face lateral da V, com a chapa em T de inox (LG03).", "Os pinos Ø12 vão na fenda da verga e os " + (L.verga ? L.verga.parafusosNaV : "") + " parafusos Ø16 na V, com arruela.", "Travessas e pendurais só depois das terças vizinhas.", "Atenção: parafuso Ø16 em corte simples — não troque por prego."] },
      { id: "tercas", titulo: "Terças TL", pecas: TL, qtd: tx(/^T\d/), frases: ["Apoie cada uma das " + TL.length + " terças contínuas sobre as duas V, respeitando o espaçamento do projeto.", "Fixe cada apoio com " + (L.tercaV ? L.tercaV.porApoio : "") + " parafusos SFS WT-T 8,2×300 cruzados a 45 gr (LG06).", "Os balanços laterais ficam livres até os travamentos.", "Atenção: parafuso inclinado a 45 gr, com o comprimento efetivo de cada lado."] },
      { id: "travamentos", titulo: "Travamentos: bloqueadores e escoras", pecas: BQ, qtd: tx(/^(BL|ES\d)/), frases: ["Coloque os bloqueadores BQ entre as terças: travam a borda de baixo na sucção do vento.", "Cada ponta leva " + (L.bloqueador ? L.bloqueador.parafusosPorPonta : "") + " parafusos WT-T 8,2×190 atravessando a terça (LG03).", "As escoras ES vão da terça à borda de baixo da V, com duas chapas inox e " + (L.escora ? L.escora.parafusosPorPonta : "") + " parafusos Ø16 por ponta (LG10).", "Atenção: o contraventamento só vale com todos os bloqueadores e escoras fixados."] },
      { id: "fita", titulo: "Fita de contraventamento em X", pecas: TI, qtd: TI.length + " trechos (TI-01)", frases: ["Estenda a fita metálica perfurada 60×2,0 mm em X sobre as terças, sob o lambri.", "Cada ponta leva " + (L.fita ? L.fita.parafusosPorPonta : "") + " parafusos 5×50 e tensor (LG10).", "Estique com o tensor até ficar sem folga, sem pré-tensão excessiva.", "Atenção: a fita trabalha só à tração; não corte nem emende fora dos pontos do projeto."] },
      { id: "cobertura", titulo: "Lambri e telha", pecas: [], qtd: "lambri 129,3 m², telha 119,7 m² (ver E10)", frases: ["Pregue ou parafuse o lambri macho-fêmea 25×100 mm nas terças, de baixo para cima.", "Instale a telha termoacústica PIR em peça inteira na água, fixada com parafuso autobrocante e vedação EPDM, inox no litoral.", "Rufos, calha e condutores por último.", "Atenção: inclinação de 4,8 %: conferir o mínimo do fabricante da telha."] },
      { id: "deck", titulo: "Decks e escada", pecas: DK, qtd: tx(/^(DS-|DI-|ESC-)/), frases: ["Monte pilaretes e pilares, depois as vigas sobre os apoios (chapa inox em U, chumbadores M12 e calço de neoprene).", "Barrotes sobre as vigas e, por fim, as tábuas do deck superior e do inferior.", "A escada liga o deck inferior ao superior: longarinas e degraus conforme a folha E02.", "Atenção: o cálculo não verifica o deck e há achados abertos — resolver antes de executar."] },
      { id: "guarda", titulo: "Guarda-corpo", pecas: [], qtd: "ver folha E06B (LG13)", frases: ["Fixe os montantes 9×9 cm a cada 1,20 m em suporte de chapa inox em U, com dois parafusos Ø12 passantes.", "Altura final 1,10 m, corrimão 4×14 cm.", "Atenção: a carga horizontal de 1,0 kN/m ainda precisa de verificação [PENDENTE]."] }
    ];
    var f = camera(op.azimute != null ? op.azimute : -32, op.elevacao != null ? op.elevacao : 27);
    var tudo = []; pcs.forEach(function (p) { tudo = tudo.concat(cantosDe(p).map(f)); });
    bases.forEach(function (p) { tudo = tudo.concat(I.caixaPeca(p).cantos.map(f)); });
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; tudo.forEach(function (q) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); });
    var W = 1000, s = Math.min((W - 40) / (x1 - x0), (560 - 40) / (y1 - y0)), ox = 20 - x0 * s + ((W - 40) - (x1 - x0) * s) / 2, oy = 20 - y0 * s;
    function poli(p, cor, tipo) {
      var pp = I.casco(cantosDe(p).map(function (q) { var g = f(q); return [g[0] * s + ox, g[1] * s + oy]; }));
      if (TI.indexOf(p) >= 0) { var a = f(p.p0), b = f(p.p1); return '<line x1="' + n2(a[0] * s + ox) + '" y1="' + n2(a[1] * s + oy) + '" x2="' + n2(b[0] * s + ox) + '" y2="' + n2(b[1] * s + oy) + '" stroke="' + cor + '" stroke-width="1.4"/>'; }
      return '<polygon points="' + pts(pp) + '" fill="' + cor + '" fill-opacity="' + (tipo === "etapa" ? "0.9" : "0.55") + '" stroke="#fff" stroke-width="0.5"/>';
    }
    function pts0(p) { return p; } function pts(p) { return p.map(function (q) { return n2(q[0]) + "," + n2(q[1]); }).join(" "); }
    function prof(p) { var g = f(p.p0 ? (p.p0.length ? p.p0 : [0, 0, 0]) : [0, 0, 0]); return g[2]; }
    var feitos = [], paginas = [], etapasOut = [];
    ET.forEach(function (e, i) {
      var corpo = "", todos = feitos.concat(e.pecas.map(function (p) { return { p: p, t: "etapa" }; }));
      var ordem = feitos.map(function (p) { return { p: p, t: "montado" }; }).concat(e.pecas.map(function (p) { return { p: p, t: "etapa" }; }));
      ordem.sort(function (a, b) { return prof(b.p) - prof(a.p); });
      ordem.forEach(function (o) { corpo += poli(o.p, o.t === "etapa" ? (TI.indexOf(o.p) >= 0 ? COR.fita : COR.etapa) : COR.montado, o.t); });
      if (e.id === "cobertura") { var topo = TL.map(function (p) { return p.p0; }).concat(TL.map(function (p) { return p.p1; })).map(function (q) { var g = f([q[0], q[1], q[2] + 0.2]); return [g[0] * s + ox, g[1] * s + oy]; }); corpo += '<polygon points="' + pts(I.casco(topo)) + '" fill="#d9a441" fill-opacity="0.55" stroke="#9a6a10" stroke-width="0.8"/>'; }
      e.pecas.forEach(function (p) { feitos.push(p); });
      etapasOut.push({ id: e.id, titulo: e.titulo, pecas: e.pecas.length, n: i + 1 });
      paginas.push('<section class="pg"><div class="faixa">' + esc(FAIXA) + '</div><h2><span class="n">' + (i + 1) + "</span>" + esc(e.titulo) + '</h2><div class="cols"><svg viewBox="0 0 ' + W + ' 560" class="ill" data-etapa="' + e.id + '">' + corpo + '</svg><div class="tx"><p class="qtd"><b>Peças:</b> ' + esc(e.qtd || "—") + "</p>" +
        e.frases.map(function (t0) { return "<p" + (/^Atenção/.test(t0) ? ' class="atencao"' : "") + ">" + esc(t0) + "</p>"; }).join("") + "</div></div></section>");
    });
    var nome = (op.obra && op.obra.nome) || "obra", rev = (op.documento && op.documento.revisao) || "R00";
    var capa = '<section class="pg capa"><div class="faixa">' + esc(FAIXA) + '</div><div class="sobre">MANUAL DE MONTAGEM</div><h1>Estrutura de madeira engenharada — ' + esc(nome) + "</h1><p>Opção " + esc(res.opcao || "") + " · revisão " + esc(rev) + ' · RA Engenharia</p><svg viewBox="0 0 ' + W + ' 560" class="ill">' + pcs.map(function (p) { return poli(p, COR.montado, "montado"); }).join("") + "</svg></section>";
    var leia = '<section class="pg"><div class="faixa">' + esc(FAIXA) + '</div><h2>Como ler</h2><ul><li>Uma etapa por página, na ordem de montagem; a câmera é a mesma em todas.</li><li><span class="sw" style="background:' + COR.etapa + '"></span> peças da etapa · <span class="sw" style="background:' + COR.montado + '"></span> já montado · <span class="sw" style="background:' + COR.fita + '"></span> fita.</li><li>Marca da peça = a das pranchas (folha E10); ligações LG = folhas E06A/B.</li><li>Cuidados saem como “Atenção”. Cada peça: conferir marca, classe e sentido das pontas.</li><li>Armazene seco, coberto e afastado do solo; proteja da chuva durante a obra (umidade acima de 20 % fissura o MLC). Tolerância de montagem e torque: conforme o responsável técnico [PENDENTE].</li></ul></section>';
    var tab = '<section class="pg"><div class="faixa">' + esc(FAIXA) + '</div><h2>Resumo das etapas</h2><table><tr><th>#</th><th>Etapa</th><th>Peças / quantidade</th></tr>' + ET.map(function (e, i) { return "<tr><td>" + (i + 1) + "</td><td>" + esc(e.titulo) + "</td><td>" + esc(e.qtd || "") + "</td></tr>"; }).join("") + "</table></section>";
    var css = "@page{size:A3 landscape;margin:12mm}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{margin:0;font:12pt/1.4 'Segoe UI',Arial,sans-serif;color:#1d2733}.pg{page-break-after:always;break-after:page;height:270mm;position:relative}.faixa{border:.8pt solid #a3352b;color:#a3352b;text-align:center;font-weight:600;font-size:9pt;padding:1mm;margin-bottom:4mm}" +
      "h1{color:#00406A;font-size:30pt;margin:8mm 0 2mm}h2{color:#00406A;font-size:20pt;margin:0 0 4mm}h2 .n{display:inline-block;background:#00406A;color:#fff;border-radius:50%;width:11mm;height:11mm;text-align:center;line-height:11mm;margin-right:4mm}.sobre{letter-spacing:.2em;color:#6F5F48;font-weight:600}" +
      ".cols{display:flex;gap:8mm}.ill{width:68%;height:auto}.tx{width:32%;font-size:13pt}.tx .atencao{color:#a3352b;font-weight:600}.qtd{background:#f3f6f9;padding:2mm;border-left:2mm solid #00406A}.sw{display:inline-block;width:6mm;height:4mm;vertical-align:middle}table{border-collapse:collapse;font-size:12pt}td,th{border:.5pt solid #9aa5b1;padding:1.5mm 3mm}th{background:#e6edf3}";
    var html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Manual de montagem — ' + esc(nome) + "</title><style>" + css + "</style></head><body>" + capa + leia + paginas.join("") + tab + "</body></html>";
    return { ok: true, html: html, paginas: 3 + paginas.length, etapas: etapasOut, camera: { azimute: op.azimute != null ? op.azimute : -32, elevacao: op.elevacao != null ? op.elevacao : 27 }, avisos: avisos, marcas: mk.tab.length };
  }
  var MadEngManual = { gerar: gerar, FAIXA: FAIXA };
  global.MadEngManual = MadEngManual;
  if (typeof module !== "undefined" && module.exports) module.exports = MadEngManual;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
