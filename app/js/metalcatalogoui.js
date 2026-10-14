/* =====================================================================
 * metalcatalogoui.js — a TELA do CATÁLOGO INDUSTRIAL da Metálica (aba
 * Metálica & Mecânica › grupo "Catálogo"; só com a prévia do modelador).
 * 14/10/2026. Fina: quem guarda os dados e calcula é o js/acocatalogoind.js
 * (AcoCatalogoInd — motor puro, com a FONTE de cada dado).
 *
 * Painel de consulta com abas — Aços · Chapas e pisos · Pintura e proteção ·
 * Cores · Normas e pendências — e três calculadoras: PESO DE CHAPA,
 * CONSUMO DE TINTA (rendimento teórico = SV% × 10 ÷ EPS) e CARGA DA GRADE.
 * Dado sem fonte confiável aparece como "conferir" com a pendência escrita —
 * a tela nunca preenche o que a pesquisa não achou.
 *
 * Não é cálculo estrutural nem especificação de projeto: é consulta.
 * Cores: tokens do css/app.css (tema claro e escuro).
 * ===================================================================== */
(function (global) {
  "use strict";

  function C() { return global.AcoCatalogoInd || null; }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function br(v, c) { if (v == null || !isFinite(v)) return "—"; c = c == null ? 2 : c; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function brAuto(v) { if (v == null || !isFinite(v)) return "—"; var a = Math.abs(v); return br(v, a >= 100 ? 0 : (a >= 10 ? 1 : 2)); }
  function toast(t, k, ms) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info", ms || 6000); } catch (e) {} }
  function seguro(url) { return /^https?:\/\//i.test(String(url || "")) ? String(url) : ""; }

  var COMANDOS = [
    { id: "met-catalogo", rotulo: "Catálogo\nindustrial", icone: "livro", grande: true,
      dica: "Consulta de materiais industriais com a fonte de cada dado: aços (estruturais, tanques e vasos, inox, tubos), chapas, grade de piso, chumbadores, preparo de superfície, sistemas de pintura, galvanização e cores de segurança e de tubulação. Calcula o peso de chapa e o consumo de tinta." }
  ];
  var ABAS = [
    { id: "acos", rotulo: "Aços" },
    { id: "chapas", rotulo: "Chapas e pisos" },
    { id: "pintura", rotulo: "Pintura e proteção" },
    { id: "cores", rotulo: "Cores" },
    { id: "normas", rotulo: "Normas e pendências" }
  ];
  var E = {
    aba: "acos", grupo: "", texto: "", soConferir: false,
    peso: { esp: "10", area: "1", aco: "" },
    tinta: { area: "100", amb: "C3", dur: "H", metodo: "", geom: "", perda: "", sv: {} },
    galv: { esp: "8" },
    grade: { fab: "", tipo: "", vao: "" },
    aberto: {}, quant: null
  };

  var CSS = '<style data-cat-css>' +
    '.cat-raiz{font-size:var(--t-peq);color:var(--texto)}' +
    '.cat-raiz .tabs{margin-bottom:12px}' +
    '.cat-nota{font-size:12px;color:var(--texto-fraco);margin:0 0 10px}' +
    '.cat-filtros{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:flex-end;margin:0 0 10px}' +
    '.cat-filtros label,.cat-calc label{display:flex;flex-direction:column;font-size:12px;gap:3px;color:var(--texto-fraco)}' +
    '.cat-raiz input,.cat-raiz select{padding:6px 8px;border:1px solid var(--linha);border-radius:var(--raio-sm,6px);background:var(--surface);color:var(--texto);font-size:13px;min-width:90px}' +
    '.cat-tab{overflow:auto;max-height:52vh;border:1px solid var(--linha);border-radius:var(--raio-sm,6px)}' +
    '.cat-raiz table.tbl{font-size:12.5px}.cat-raiz table.tbl th{text-transform:none;letter-spacing:.2px;font-size:12px}' +
    '.cat-raiz input.cat-sv{width:64px;min-width:0;padding:3px 5px;text-align:right}' +
    '.cat-estreita{display:inline-block;max-width:100%;vertical-align:top}.cat-estreita table.tbl{width:auto}' +
    '.cat-raiz table.tbl th,.cat-raiz table.tbl td{padding:6px 9px;vertical-align:top}' +
    '.cat-raiz td.n,.cat-raiz th.n{text-align:right;white-space:nowrap}' +
    '.cat-calc{border:1px solid var(--linha);border-radius:var(--raio,10px);padding:10px 12px;margin:0 0 12px;background:var(--surface-2,var(--surface))}' +
    '.cat-calc h4,.cat-sec h4{margin:0 0 8px;font-size:13px}' +
    '.cat-calc .lin{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:flex-end}' +
    '.cat-res{margin-top:10px;font-size:13px}' +
    '.cat-res b.g{font-size:15px;color:var(--aco)}' +
    '.cat-aviso{color:var(--graf-aviso);font-size:12px;margin-top:4px}' +
    '.cat-erro{color:var(--vermelho);font-size:12.5px;margin-top:4px}' +
    '.cat-sec{margin:0 0 12px}' +
    '.cat-sec>summary{cursor:pointer;font-weight:600;padding:6px 0}' +
    '.cat-conf{background:rgba(180,83,9,.16);color:var(--graf-aviso)}' +
    '.cat-calculo{background:rgba(13,110,189,.14);color:var(--aco)}' +
    '.cat-ok{background:rgba(21,128,61,.14);color:var(--verde)}' +
    '.cat-chip{display:inline-block;padding:1px 7px;margin:1px 3px 1px 0;border:1px solid var(--linha);border-radius:999px;font-size:12px;white-space:nowrap}' +
    '.cat-amostra{display:inline-block;width:18px;height:18px;border-radius:4px;border:1px solid var(--linha-forte);vertical-align:middle;margin-right:6px}' +
    '.cat-raiz a{color:var(--aco)}' +
    '.cat-fonte{font-size:11.5px;color:var(--texto-fraco)}' +
    '</style>';

  /* ------------------------------------------------------------ peças de HTML */
  function host(u) { var m = /^https?:\/\/(?:www\.)?([^\/?#]+)/i.exec(String(u || "")); return m ? m[1] : "fonte"; }
  function fi(x) { return C() ? C().fonteDe(x) : null; }
  function link(f, rotulo) {
    f = obj(f); var u = seguro(f.url), t = rotulo || host(u);
    if (u) return '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer" title="' + esc(f.titulo || f.nome || u) + '">' + esc(t) + '</a>' + (f.pagina ? ' <span class="cat-fonte">p. ' + esc(f.pagina) + "</span>" : "");
    return f.titulo ? '<span class="cat-fonte">' + esc(f.titulo) + "</span>" : '<span class="cat-fonte">sem fonte</span>';
  }
  function fabricantes(lista) {
    var l = arr(lista); if (!l.length) return '<span class="cat-fonte">—</span>';
    return l.map(function (f) { return seguro(f.url) ? '<a href="' + esc(seguro(f.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(f.nome || "site") + "</a>" : esc(f.nome || ""); }).join(" · ");
  }
  function pilulaConferir(c, pend) { return c ? ' <span class="pill cat-conf" title="' + esc(pend || "conferir na fonte") + '">conferir</span>' : ""; }
  function tabela(cab, linhas, vazio, estreita) {
    if (!linhas.length) return '<p class="cat-nota">' + esc(vazio || "Nada para mostrar.") + "</p>";
    return '<div class="cat-tab' + (estreita ? " cat-estreita" : "") + '"><table class="tbl"><thead><tr>' + cab.map(function (c) { return '<th' + (c.n ? ' class="n"' : "") + ">" + esc(c.t) + "</th>"; }).join("") +
      "</tr></thead><tbody>" + linhas.join("") + "</tbody></table></div>";
  }
  function opcoes(lista, atual) {
    return lista.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(atual) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("");
  }
  function secId(t) { return String(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40); }
  /* a seção lembra se a pessoa a abriu ou fechou (o painel se redesenha ao trocar de filtro) */
  function sec(titulo, corpo, aberto) {
    var id = secId(titulo), ab = E.aberto[id] != null ? E.aberto[id] : !!aberto;
    return '<details class="cat-sec" data-cat-sec="' + esc(id) + '"' + (ab ? " open" : "") + "><summary>" + esc(titulo) + "</summary>" + corpo + "</details>";
  }
  function semMotor() { return '<p class="cat-erro">O catálogo industrial não carregou (js/acocatalogoind.js).</p>'; }

  /* ------------------------------------------------------------ ABA Aços */
  function corta(t, n) { t = String(t == null ? "" : t); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : t; }
  /* texto longo (uso, soldabilidade, espessura, observação) numa linha com “ver mais” — a tabela não vira parede de texto */
  function usoSolda(x) {
    var partes = [];
    if (x.uso) partes.push(esc(x.uso));
    if (x.espessura) partes.push('<span class="cat-fonte">Espessura: ' + esc(x.espessura) + "</span>");
    if (x.solda) partes.push('<span class="cat-fonte">Solda: ' + esc(x.solda) + "</span>");
    if (x.obs) partes.push('<span class="cat-fonte">' + esc(x.obs) + "</span>");
    var curto = String(x.uso || x.solda || x.obs || x.espessura || "");
    var total = [x.uso, x.espessura, x.solda, x.obs].join(" ").length;
    if (total <= 110) return partes.join("<br>");
    return '<details><summary>' + esc(curto.length > 90 ? curto.slice(0, 90).replace(/\s+\S*$/, "") + "…" : curto) + "</summary>" + partes.join("<br>") + "</details>";
  }
  function listaAcos() {
    var a = C().acos({ grupo: E.grupo === "calculo" ? "" : E.grupo, origem: E.grupo === "calculo" ? "calculo" : "", texto: E.texto, soConferir: E.soConferir });
    var linhas = a.map(function (x) {
      var ed = x.edicaoVigente || x.edicao;
      return "<tr><td><b>" + esc(x.id) + "</b>" + (x.origem === "calculo" ? ' <span class="pill cat-calculo" title="Já está no cálculo (js/acomateriais.js)">no cálculo</span>' : "") + pilulaConferir(x.conferir, x.pendencia) + "</td>" +
        "<td>" + esc(x.norma || "") + (ed ? ' <span class="cat-fonte" title="' + esc(ed) + '">(' + (x.edicaoVigente ? "vigente: " : "edição: ") + esc(corta(ed, 46)) + ")</span>" : "") + (x.statusNorma && /cancel|substitu|retirad|conferir|hist/i.test(x.statusNorma) ? ' <span class="pill cat-conf" title="' + esc(x.statusNorma) + '">' + esc(corta(x.statusNorma, 26)) + "</span>" : "") + "</td>" +
        '<td class="n">' + (x.fy == null ? "—" : br(x.fy, 0)) + '</td><td class="n">' + (x.fu == null ? "—" : br(x.fu, 0) + (x.fuMax ? "–" + br(x.fuMax, 0) : "")) + '</td><td class="n">' + (x.E ? br(x.E / 1000, 0) : "—") + "</td>" +
        "<td>" + usoSolda(x) + "</td>" +
        "<td>" + fabricantes(x.fabricantes) + "</td><td>" + link(fi(x), "fonte") + "</td></tr>";
    });
    return '<p class="cat-nota">' + a.length + " aço(s). fy e fu são os MÍNIMOS especificados (MPa); E em GPa. “no cálculo” = já está em js/acomateriais.js (o catálogo só acrescenta edição vigente, uso e fabricantes).</p>" +
      tabela([{ t: "Aço" }, { t: "Norma" }, { t: "fy (MPa)", n: 1 }, { t: "fu (MPa)", n: 1 }, { t: "E (GPa)", n: 1 }, { t: "Uso e soldabilidade" }, { t: "Fabricantes" }, { t: "Fonte" }], linhas, "Nenhum aço com este filtro.");
  }
  function abaAcos() {
    var g = [["", "Todos"], ["calculo", "Só os do cálculo"]].concat(C().GRUPOS.map(function (x) { return [x.id, x.nome]; }));
    return '<div class="cat-filtros"><label>Grupo<select data-cat-in="grupo">' + opcoes(g, E.grupo) + "</select></label>" +
      '<label>Buscar<input data-cat-in="texto" value="' + esc(E.texto) + '" placeholder="nome, norma, uso"></label>' +
      '<label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" data-cat-in="soConferir"' + (E.soConferir ? " checked" : "") + ' style="min-width:0"> só “conferir”</label></div>' +
      '<div data-cat-lista="acos">' + listaAcos() + "</div>";
  }

  /* ------------------------------------------------------------ ABA Chapas e pisos */
  function htmlPeso() {
    var acos = [["", "Aço carbono (7 850 kg/m³)"]].concat(C().acos({ grupo: "inox" }).filter(function (a) { return num(a.densidade, 0) > 0; }).map(function (a) { return [a.id, a.id + " (" + br(a.densidade, 0) + " kg/m³)"]; }));
    return '<div class="cat-calc" data-cat-calc="peso"><h4>Peso de chapa</h4><div class="lin">' +
      '<label>Espessura (mm)<input data-cat-in="peso.esp" inputmode="decimal" value="' + esc(E.peso.esp) + '"></label>' +
      '<label>Área (m²)<input data-cat-in="peso.area" inputmode="decimal" value="' + esc(E.peso.area) + '"></label>' +
      '<label>Material<select data-cat-in="peso.aco">' + opcoes(acos, E.peso.aco) + "</select></label></div>" +
      '<div class="cat-res" data-cat-res="peso">' + resPeso() + "</div></div>";
  }
  function resPeso() {
    var e = num(E.peso.esp, null), A = num(E.peso.area, null);
    var kg = C().pesoChapa(e, A, { aco: E.peso.aco || null });
    if (kg == null) return '<span class="cat-erro">Informe espessura e área maiores que zero.</span>';
    var rho = C().RHO; if (E.peso.aco) { var a = C().aco(E.peso.aco); if (a && num(a.densidade, 0) > 0) rho = a.densidade; }
    return "<b class='g'>" + br(kg, 2) + " kg</b> &nbsp; (" + br(e * rho / 1000, 3) + " kg/m² × " + br(A, 3) + " m²) <div class='cat-fonte'>kg = espessura (mm) × área (m²) × ρ ÷ 1000, com ρ = " + br(rho, 0) + " kg/m³ (aço carbono: NBR 8800:2008, 4.5.2.9). Peso teórico, sem tolerância de laminação.</div>";
  }
  function listaChips(l, unid) { return arr(l).map(function (v) { return '<span class="cat-chip">' + br(v, v % 1 ? 2 : 0) + (unid || "") + "</span>"; }).join(""); }
  function semDado(x, o) { x = obj(x); return '<p class="cat-nota">Sem dado publicado nesta pesquisa' + (x.pendencia ? ": " + esc(x.pendencia) : "") + (o ? " " + o : "") + "</p>"; }
  function rodape(x) { return '<p class="cat-fonte">' + (arr(x.fabricantes).length ? "Fabricantes: " + fabricantes(x.fabricantes) + " · " : "") + link(fi(x)) + pilulaConferir(x.conferir, x.pendencia) + "</p>"; }
  function blocoGrossa() {
    var g = obj(C().chapas().chapaGrossa);
    if (!arr(g.espessuras_mm).length) return semDado(g);
    var pol = obj(g.polegadas), lim = arr(g.limitesFabricacaoPorFabricante), la = obj(g.larguras_mm), co = obj(g.comprimentos_mm);
    var h = tabela([{ t: "Espessura (mm)", n: 1 }, { t: "Polegada" }, { t: "kg/m² (× 7,85)", n: 1 }], g.espessuras_mm.map(function (e) {
      var k = e.toFixed(1); return '<tr><td class="n">' + br(e, 2) + "</td><td>" + esc(pol[k] ? pol[k] + '"' : "—") + '</td><td class="n">' + br(e * 7.85, 2) + "</td></tr>";
    }), "", true);
    if (lim.length) h += tabela([{ t: "Fabricante" }, { t: "Largura (mm)" }, { t: "Comprimento (mm)" }, { t: "Espessura (mm)" }, { t: "Fonte" }], lim.map(function (l) {
      return "<tr><td>" + esc(l.fabricante) + "</td><td>" + brAuto(l.larguraMin_mm) + " a " + brAuto(l.larguraMax_mm) + "</td><td>" + brAuto(l.comprimentoMin_mm) + " a " + brAuto(l.comprimentoMax_mm) + "</td><td>" + brAuto(l.espMin_mm) + " a " + brAuto(l.espMax_mm) + "</td><td>" + link(fi(l)) + "</td></tr>";
    }));
    var ls = Object.keys(la);
    if (ls.length) h += '<p class="cat-nota">Chapas de estoque (ArcelorMittal): larguras ' + listaChips(la[ls[0]], " mm") + (co[Object.keys(co)[0]] ? " comprimentos " + listaChips(co[Object.keys(co)[0]], " mm") : "") + "</p>";
    h += '<p class="cat-nota">' + (g.tolerancia ? "" : "Tolerâncias de espessura, largura e planicidade: nenhum fabricante as publica no catálogo — consultar o fabricante (conferir). ") + "Os pares largura × comprimento de estoque variam por usina e pedido.</p>";
    return h + rodape(g);
  }
  function blocoFina() {
    var f = obj(C().chapas().chapaFina);
    if (!arr(f.bitolas).length && !arr(f.espessuras_mm).length) return semDado(f);
    var h = f.padraoUsadoNoBrasil ? '<p class="cat-nota">' + esc(f.padraoUsadoNoBrasil) + "</p>" : "";
    if (arr(f.espessuras_mm).length) h += "<p>" + listaChips(f.espessuras_mm, " mm") + "</p>";
    if (arr(f.bitolas).length) h += tabela([{ t: "Padrão" }, { t: "Produto" }, { t: "Nº", n: 1 }, { t: "mm", n: 1 }, { t: "kg/m²", n: 1 }],
      f.bitolas.map(function (b) { return "<tr><td>" + esc(b.padrao || "") + "</td><td>" + esc(b.produto || "") + '</td><td class="n">' + esc(b.nr) + '</td><td class="n">' + br(b.mm, 2) + '</td><td class="n">' + br(b.kgm2, 2) + "</td></tr>"; }));
    return h + rodape(f);
  }
  function blocoXadrez() {
    var x = obj(C().chapas().chapaXadrez);
    if (!arr(x.itens).length) return semDado(x, "— conferir com o fabricante.");
    return tabela([{ t: "Espessura (mm)", n: 1 }, { t: "kg/m²", n: 1 }, { t: "Fabricante / produto" }, { t: "Larguras (mm)" }, { t: "Comprimentos (mm)" }],
      x.itens.map(function (i) { return '<tr><td class="n">' + br(i.espessura_mm, 2) + '</td><td class="n">' + br(i.kgm2, 2) + "</td><td>" + esc(i.fabricante || "") + "</td><td>" + esc(arr(i.larguras_mm).join("; ")) + "</td><td>" + esc(arr(i.comprimentos_mm).join("; ")) + "</td></tr>"; })) +
      (obj(x.fatorKgM2PorMm).obs ? '<p class="cat-nota">' + esc(x.fatorKgM2PorMm.obs) + "</p>" : "") +
      (x.reliefObs ? '<p class="cat-nota">' + esc(x.reliefObs) + "</p>" : "") + (x.acoObs ? '<p class="cat-nota">' + esc(x.acoObs) + "</p>" : "") + rodape(x);
  }
  function blocoExpandida() {
    var x = obj(C().chapas().chapaExpandida);
    if (!arr(x.itens).length) return semDado(x, "— conferir com o fabricante.");
    var todos = x.itens.concat(arr(x.itensDistribuidor_BepexEXP));
    return '<p class="cat-nota">' + todos.length + " tipos de malha (LD = diagonal menor, CD = diagonal maior, centro a centro; kg/m² da chapa estirada não zincada). Peso e área aberta onde o fabricante publica.</p>" +
      tabela([{ t: "Código" }, { t: "Fabricante" }, { t: "Malha LD × CD (mm)" }, { t: "Cordão (mm)", n: 1 }, { t: "Espessura (mm)", n: 1 }, { t: "kg/m²", n: 1 }, { t: "Zincada kg/m²", n: 1 }, { t: "Área aberta (%)", n: 1 }, { t: "Fonte" }],
        todos.map(function (i) { return "<tr><td>" + esc(i.codigo || "") + pilulaConferir(i.conferir, i.obs || i.pendencia) + "</td><td>" + esc(i.fabricante || "") + "</td><td>" + br(i.malhaLD_mm, 1) + " × " + br(i.malhaCD_mm, 1) + '</td><td class="n">' + (i.cordao_mm == null ? "—" : br(i.cordao_mm, 2)) + '</td><td class="n">' + (i.espessura_mm == null ? "—" : br(i.espessura_mm, 2)) +
          '</td><td class="n">' + (i.kgm2 == null ? "—" : br(i.kgm2, 2)) + '</td><td class="n">' + (i.kgm2Zincada == null ? "—" : br(i.kgm2Zincada, 2)) + '</td><td class="n">' + (i.areaAbertaPct != null ? br(i.areaAbertaPct, 0) : (arr(i.areaAbertaFaixaPct).length ? esc(i.areaAbertaFaixaPct.join("–")) : "—")) + "</td><td>" + link(fi(i)) + "</td></tr>"; })) +
      '<p class="cat-nota">Carga admissível: o fabricante publica só tabela de deflexão × vão × carga (conferir direto com ele antes de usar como piso).</p>' + rodape(x);
  }
  function blocoPerfurada() {
    var x = obj(C().chapas().chapaPerfurada);
    if (!arr(x.itens).length) return semDado(x, "— conferir com o fabricante.");
    var esp = obj(x.espessurasDisponiveis_mm);
    return '<p class="cat-nota">' + x.itens.length + " padrões de furo (passo = distância entre centros). A área aberta é a publicada pelo fabricante." + (arr(esp.valores).length ? " Espessuras que a " + esc(esp.fabricante || "") + " perfura: " + esc(esp.valores.join("; ")) + " mm." : "") + "</p>" +
      tabela([{ t: "Furo" }, { t: "Dimensão (mm)", n: 1 }, { t: "Passo (mm)", n: 1 }, { t: "Disposição" }, { t: "Área aberta (%)", n: 1 }, { t: "Fonte" }],
        x.itens.map(function (i) {
          var dim = i.diametro_mm != null ? br(i.diametro_mm, 1) : (i.ladoDoQuadrado_mm != null ? br(i.ladoDoQuadrado_mm, 1) : (i.larguraDoFuro_mm != null ? br(i.larguraDoFuro_mm, 1) + " × " + br(i.comprimentoDoFuro_mm, 1) : (i.diagonalMenor_mm != null ? br(i.diagonalMenor_mm, 1) + " × " + br(i.diagonalMaior_mm, 1) : "—")));
          return "<tr><td>" + esc(i.furo || "") + pilulaConferir(i.conferir, i.obs) + '</td><td class="n">' + dim + '</td><td class="n">' + (i.passo_mm == null ? "—" : br(i.passo_mm, 1)) + "</td><td>" + esc(i.disposicao ? i.disposicao + "°" + (i.disposicaoInferida ? " (inferida)" : "") : (i.disposicaoTexto || "—")) + '</td><td class="n">' + (i.areaAbertaPct == null ? "—" : br(i.areaAbertaPct, 0)) + "</td><td>" + link(fi(i)) + "</td></tr>";
        })) + rodape(x);
  }
  function nomeFabGrade(t) { return t && t.fabricante ? (typeof t.fabricante === "object" ? t.fabricante.nome : t.fabricante) : ""; }
  function blocoGrade() {
    var g = C().gradePiso(), tipos = arr(g.tipos);
    if (!tipos.length) return '<p class="cat-nota">Sem tipos de grade publicados nesta pesquisa' + (arr(g.pendencias).length ? ": " + esc(g.pendencias.join("; ")) : "") + ".</p>";
    var fabs = [["", "Todos"]].concat(C().fabricantesGrade().map(function (f) { return [f, f]; }));
    var comTab = C().tiposComTabela(E.grade.fab), selT = [["", "—"]].concat(comTab.map(function (t) { return [t.id, (t.codigoFabricante || t.id) + " — malha " + (t.malha_mm || "?") + ", barra " + (t.barraPortante_mm || "?")]; }));
    var lista = tipos.filter(function (t) { return !E.grade.fab || nomeFabGrade(t) === E.grade.fab; });
    var h = '<p class="cat-nota">' + tipos.length + " tipos de grade eletrofundida/eletrosoldada de " + (fabs.length - 1) + " fontes; " + C().tiposComTabela().length + " com tabela de carga × vão publicada. As tabelas dos catálogos brasileiros são antigas e não declaram aço, tensão nem flecha: servem para pré-dimensionamento — conferir com o fabricante antes de especificar.</p>" +
      '<div class="cat-calc" data-cat-calc="grade"><h4>Carga admissível × vão (só da tabela publicada; sem extrapolar)</h4><div class="lin">' +
      '<label>Fonte / fabricante<select data-cat-in="grade.fab">' + opcoes(fabs, E.grade.fab) + "</select></label>" +
      '<label>Tipo (com tabela)<select data-cat-in="grade.tipo" style="max-width:320px">' + opcoes(selT, E.grade.tipo) + "</select></label>" +
      '<label>Vão (mm)<input data-cat-in="grade.vao" inputmode="decimal" value="' + esc(E.grade.vao) + '"></label></div>' +
      '<div class="cat-res" data-cat-res="grade">' + resGrade() + "</div></div>" +
      tabela([{ t: "Código" }, { t: "Fonte" }, { t: "Malha (mm)" }, { t: "Barra portante (mm)" }, { t: "kg/m²", n: 1 }, { t: "Acabamento" }, { t: "Tabela" }, { t: "Fonte" }],
        lista.map(function (t) { return "<tr><td>" + esc(t.codigoFabricante || t.id) + pilulaConferir(t.conferir, t.pendencia) + "</td><td>" + fabricantes(t.fabricante ? [typeof t.fabricante === "object" ? t.fabricante : { nome: t.fabricante }] : []) + "</td><td>" + esc(t.malha_mm || "") + (t.passoPortanteTipo ? '<div class="cat-fonte" title="' + esc(t.passoPortanteTipo) + '">1º número: ' + esc(corta(t.passoPortanteTipo, 38)) + "</div>" : "") + "</td><td>" + esc(t.barraPortante_mm || "") + '</td><td class="n">' + (t.kgm2 == null ? "—" : br(t.kgm2, 1)) + "</td><td>" + esc(String(C().resolverNota(t.acabamento) || "").slice(0, 90)) + "</td><td>" + (C().tiposComTabela().some(function (x) { return x.id === t.id; }) ? "sim" : "—") + "</td><td>" + link(fi(t)) + "</td></tr>"; }), "Nenhum tipo com este filtro.") +
      (arr(g.normasReferencia).length ? '<p class="cat-fonte">Normas de referência: ' + g.normasReferencia.map(function (n) { return esc(n.norma + (n.edicao ? " (" + n.edicao + ")" : "") + (n.status ? " — " + n.status : "")); }).join("; ") + "</p>" : "") +
      (g.fixacao ? '<p class="cat-fonte"><b>Fixação:</b> ' + esc(g.fixacao) + "</p>" : "") + (obj(g.flechaLimite).valor ? '<p class="cat-fonte"><b>Flecha limite:</b> ' + esc(g.flechaLimite.valor) + "</p>" : "");
    return h;
  }
  function resGrade() {
    if (!E.grade.tipo) return '<span class="cat-fonte">Escolha um tipo e digite o vão.</span>';
    var r = C().cargaGrade(E.grade.tipo, num(E.grade.vao, null));
    if (!r.ok) return '<span class="pill cat-conf">conferir</span> ' + esc(r.motivo);
    return "<b class='g'>" + brAuto(r.cargaUniforme) + " " + esc(String(r.unidade || "").split(" (")[0]) + "</b> <span class='cat-fonte'>(interpolação linear na tabela de " + esc(r.fabricante || "fabricante") + "; " + (r.fonte && r.fonte.url ? link(r.fonte) : "ver fonte") + ")</span>" +
      (r.criterio ? '<div class="cat-fonte">Critério: ' + esc(r.criterio) + "</div>" : "") + (r.observacao ? '<div class="cat-fonte">' + esc(r.observacao) + "</div>" : "") + pilulaConferir(r.conferir, r.pendencia);
  }
  function blocoChumbadores() {
    var c = C().chumbadores(), q = arr(c.quimicos), m = arr(c.mecanicos);
    if (!q.length && !m.length) return '<p class="cat-nota">Sem dados de chumbadores nesta pesquisa.</p>';
    function lin(x) {
      return "<tr><td>" + esc(x.produto || x.id) + pilulaConferir(x.conferir, x.pendencia) + "</td><td>" + esc(x.fabricante || "") + "</td><td>" + esc(arr(x.diametros_mm).join("; ")) + "</td><td>" + esc(x.aprovacao || x.tipo || "") + "</td><td>" + link(fi(x)) + "</td></tr>";
    }
    return (arr(c.normasProjeto).length ? '<p class="cat-fonte">Norma de projeto de fixações: ' + c.normasProjeto.map(function (n) { return esc(n.norma + (n.edicao ? " (" + n.edicao + ")" : "") + (n.status ? " — " + n.status : "")); }).join("; ") + "</p>" : "") +
      tabela([{ t: "Produto" }, { t: "Fabricante" }, { t: "Ø (mm)" }, { t: "Aprovação / tipo" }, { t: "Fonte" }], q.map(lin).concat(m.map(lin)), "Sem dados.") +
      '<p class="cat-nota">As cargas características e de projeto de cada diâmetro e profundidade estão na aprovação técnica/ficha do fabricante (concreto fissurado ou não): conferir lá antes de dimensionar. Chumbadores ASTM F1554 e barra A36 já estão no cálculo.</p>';
  }
  function abaChapas() {
    return htmlPeso() +
      sec("Chapa grossa (laminada a quente)", blocoGrossa(), true) + sec("Chapa fina e bitolas", blocoFina()) + sec("Chapa xadrez", blocoXadrez()) +
      sec("Chapa expandida", blocoExpandida()) + sec("Chapa perfurada", blocoPerfurada()) + sec("Grade de piso eletrofundida", blocoGrade()) + sec("Chumbadores (químicos e mecânicos)", blocoChumbadores());
  }

  /* ------------------------------------------------------------ ABA Pintura e proteção */
  var AMBIENTES = [["C1", "C1 — muito baixa"], ["C2", "C2 — baixa"], ["C3", "C3 — média"], ["C4", "C4 — alta"], ["C5", "C5 — muito alta"], ["CX", "CX — extrema"], ["Im1", "Im1 — água doce"], ["Im2", "Im2 — água do mar/salobra"], ["Im3", "Im3 — solo"], ["Im4", "Im4 — água do mar com proteção catódica"]];
  var DURAB = [["L", "Baixa (L)"], ["M", "Média (M)"], ["H", "Alta (H)"], ["VH", "Muito alta (VH)"]];
  var METODOS = [["", "Sem perda (informe abaixo)"], ["trincha", "Trincha (sem percentual publicado)"], ["rolo", "Rolo (sem percentual publicado)"], ["convencional", "Pistola convencional / HVLP (Hempel: ~1/3 se perde no ar)"], ["airless", "Pistola airless (sem percentual publicado)"]];
  function htmlTinta() {
    return '<div class="cat-calc" data-cat-calc="tinta"><h4>Consumo de tinta pelo sistema do ambiente</h4><div class="lin">' +
      '<label>Área a pintar (m²)<input data-cat-in="tinta.area" inputmode="decimal" value="' + esc(E.tinta.area) + '"></label>' +
      '<label>Corrosividade<select data-cat-in="tinta.amb">' + opcoes(AMBIENTES, E.tinta.amb) + "</select></label>" +
      '<label>Durabilidade<select data-cat-in="tinta.dur">' + opcoes(DURAB, E.tinta.dur) + "</select></label>" +
      '<label>Aplicação<select data-cat-in="tinta.metodo">' + opcoes(METODOS, E.tinta.metodo) + "</select></label>" +
      '<label>Perda (%) — sobrepõe a tabela<input data-cat-in="tinta.perda" inputmode="decimal" value="' + esc(E.tinta.perda) + '" placeholder="opcional"></label></div>' +
      '<div class="cat-res" data-cat-res="tinta">' + resTinta() + "</div>" +
      '<div class="lin" style="margin-top:8px"><button type="button" class="btn sm" data-cat-act="quantitativo" title="Usa a área de pintura das peças metálicas do modelo (a mesma da fabricação) e o sistema escolhido acima">Quantitativo de pintura do modelo com este sistema</button></div>' +
      '<div class="cat-res" data-cat-res="quant">' + (E.quant ? htmlQuant(E.quant) : "") + "</div></div>";
  }
  /* o quantitativo de pintura do modelo (js/metalpintura.js quantitativoDoModelo): área das peças metálicas × o sistema de cima → preparo, litros por demão e as
     linhas prontas para o orçamento (descrição + unidade + quantidade; SEM preço e SEM código SINAPI) */
  function quantitativoModelo() {
    var P = global.BimMetalPintura, U = global.BimMetalUI, st = null;
    if (!P || !P.quantitativoDoModelo) return { ok: false, erro: "O motor de pintura não carregou (js/metalpintura.js)." };
    try { st = U && U.estado ? U.estado() : null; } catch (e) { st = null; }
    if (!st) return { ok: false, erro: "Abra o modelador (BIM) para ler as peças metálicas do modelo." };
    var op = { ambiente: E.tinta.amb, durabilidade: E.tinta.dur }, svInf = {};
    if (E.tinta.metodo) op.metodo = E.tinta.metodo;
    if (E.tinta.perda !== "" && num(E.tinta.perda, null) != null) op.perdaPct = num(E.tinta.perda, null);
    Object.keys(E.tinta.sv).forEach(function (i) { if (num(E.tinta.sv[i], null) != null) svInf[i] = num(E.tinta.sv[i], null); });
    if (Object.keys(svInf).length) op.sv = svInf;
    return P.quantitativoDoModelo(st, op);
  }
  function htmlQuant(q) {
    if (!q || !q.ok) return '<span class="cat-erro">' + esc(q && q.erro || "Sem resultado.") + "</span>";
    var h = '<div><b>Quantitativo de pintura do modelo</b> — ' + br(q.area_m2, 2) + " m² em " + q.pecas + " peça(s) de aço (" + br(q.kg, 0) + " kg) · sistema <b>" + esc(q.sistema.id) + "</b>" + pilulaConferir(q.sistema.conferir, q.sistema.pendencia) + "</div>" +
      tabela([{ t: "Descrição" }, { t: "Un." }, { t: "Quantidade", n: 1 }], q.linhas.map(function (l) { return "<tr><td>" + esc(l.descricao) + "</td><td>" + esc(l.unidade) + '</td><td class="n">' + br(l.quantidade, 2) + "</td></tr>"; })) +
      '<div class="cat-fonte">Perda de aplicação ' + br(q.perdaPct, 0) + " % — " + esc(q.perdaOrigem) + ". Sem preço e sem código SINAPI: vincule a composição no orçamento.</div>";
    (q.avisos || []).forEach(function (a) { h += '<div class="cat-aviso">' + esc(a) + "</div>"; });
    (q.pendentes || []).forEach(function (a) { h += '<div class="cat-aviso">Fora das linhas — ' + esc(a) + "</div>"; });
    if (global.App && global.App.criarOrcamentoDoBIM) h += '<div style="margin-top:6px"><button type="button" class="btn sm primary" data-cat-act="orcar">Lançar no orçamento</button></div>';
    return h;
  }
  /* "Sa 2½ (base da durabilidade…) - conferir PDS" → "Sa 2½"; o texto inteiro vai no title */
  function prepCurto(t) { var m = /^(Sa ?[0-3](?:½| 1\/2)?|St ?[23])/i.exec(String(t || "")); return m ? m[1] : String(t || "—").slice(0, 28); }
  function cel(t) { return t ? t.demaosMin + (t.demaosMin === 1 ? " demão" : " demãos") + " / " + br(t.ndftMin_um, 0) + " µm" : "—"; }
  /* o quadro de seleção: clicar numa célula leva o par ambiente/durabilidade para a calculadora */
  function blocoQuadro() {
    var q = C().quadroSistemas(), D = ["L", "M", "H", "VH"], nomes = { L: "Baixa (L)", M: "Média (M)", H: "Alta (H)", VH: "Muito alta (VH)" };
    return '<p class="cat-nota">Sistema típico para aço carbono novo, jateado Sa 2½ (preparo e ligantes por demão na tabela de sistemas). EPS = espessura seca total em µm. Clique numa célula para calcular o consumo de tinta dela. “≡” = vale o sistema de outro par pela equivalência da ISO 12944-5. “—” = sem sistema com fonte neste catálogo (consultar o fabricante da tinta).</p>' +
      tabela([{ t: "Ambiente" }].concat(D.map(function (d) { return { t: nomes[d] }; })), q.map(function (l) {
        return "<tr><td><b>" + esc(l.ambiente) + '</b> <span class="cat-fonte">' + esc(l.nome) + "</span></td>" + D.map(function (d) {
          var c = l.celulas[d]; if (!c) return '<td class="cat-fonte">—</td>';
          return '<td><a href="#" data-cat-quadro="' + l.ambiente + "|" + d + '" title="' + esc(c.preparo || c.id) + '"><b>' + (c.epsTotal_um == null ? "?" : br(c.epsTotal_um, 0) + " µm") + "</b></a> · " + c.nDemaos + (c.nDemaos === 1 ? " demão" : " demãos") +
            (c.via ? ' <span class="cat-fonte">≡ ' + esc(c.via) + "</span>" : "") + (c.conferir ? ' <span class="pill cat-conf" title="sistema marcado para conferir">conferir</span>' : "") + (c.isoMin_um != null ? '<div class="cat-fonte">mín. ISO ' + br(c.isoMin_um, 0) + " µm</div>" : "") + "</td>";
        }).join("") + "</tr>";
      }));
  }
  function blocoMatrizIso() {
    var P = obj(C().DADOS.pinturaSistemas), M = obj(P.matrizIso12944_5), T = obj(M.tabela), linhas = [];
    ["C2", "C3", "C4", "C5"].forEach(function (a) {
      ["L", "M", "H", "VH"].forEach(function (d) {
        var m = C().matrizIso(a, d);
        if (!m) return;
        var tx = obj(m.tipos);
        linhas.push("<tr><td><b>" + a + "</b></td><td>" + d + "</td>" + (m.tipos ? "<td>" + cel(tx.ZnR) + "</td><td>" + cel(tx.miscEP) + "</td><td>" + cel(tx.AKAY) + "</td>" : '<td colspan="3" class="cat-fonte">a ISO não propõe sistema — usar a categoria maior (ver observações)</td>') + "</tr>");
      });
    });
    if (!linhas.length) return '<p class="cat-nota">Sem dados nesta pesquisa.</p>';
    return '<p class="cat-nota">' + esc(M.descricao || "") + "</p>" + tabela([{ t: "Ambiente" }, { t: "Durab." }, { t: "Primer rico em zinco" }, { t: "Outros primers (EP/PU/silicato)" }, { t: "Alquídico / acrílico" }], linhas, "", true) +
      arr(M.observacoes).map(function (o) { return '<p class="cat-fonte">' + esc(o) + "</p>"; }).join("") +
      '<p class="cat-fonte">' + esc(M.edicao || "") + " — " + arr(M.fontes).map(function (f) { return link(f); }).join(" · ") + " (tabela da ISO publicada por fabricantes; a norma é paga)</p>";
  }
  function resTinta() {
    var K = C(), A = num(E.tinta.area, null);
    if (A == null || A < 0) return '<span class="cat-erro">Área inválida: informe um número maior ou igual a zero (m²).</span>';
    var s = K.sistemaPintura(E.tinta.amb, E.tinta.dur);
    if (!s) return '<span class="pill cat-conf">conferir</span> Não há sistema com fonte para ' + esc(E.tinta.amb) + " / " + esc(E.tinta.dur) + " neste catálogo — consulte o fabricante da tinta (ISO 12944-5).";
    var op = {}; if (E.tinta.metodo) op.metodo = E.tinta.metodo; if (E.tinta.perda !== "" && num(E.tinta.perda, null) != null) op.perdaPct = num(E.tinta.perda, null);
    var svInf = {}; Object.keys(E.tinta.sv).forEach(function (i) { if (num(E.tinta.sv[i], null) != null) svInf[i] = num(E.tinta.sv[i], null); }); if (Object.keys(svInf).length) op.sv = svInf;
    var r = K.consumoTinta(A, s, op);
    if (!r.ok) return '<span class="cat-erro">' + esc(r.erro) + "</span>";
    var iso = s.iso && s.iso.tipos ? " · ISO 12944-5 (mínimo, " + esc(s.ambienteSolicitado) + "-" + esc(s.durabilidadeSolicitada) + "): rico em zinco " + cel(s.iso.tipos.ZnR) + "; outros primers " + cel(s.iso.tipos.miscEP) + "; alquídico/acrílico " + cel(s.iso.tipos.AKAY) : "";
    var h = (s.viaEquivalencia ? '<div class="cat-aviso">Não há sistema próprio para ' + esc(s.ambienteSolicitado) + "-" + esc(s.durabilidadeSolicitada) + ": vale o de " + esc(s.viaEquivalencia) + " (equivalência da ISO 12944-5: subir uma categoria e descer uma durabilidade dá o mesmo sistema).</div>" : "") +
      '<div><b>Sistema ' + esc(s.id) + '</b> — preparo: <span title="' + esc(s.preparo || "") + '">' + esc(prepCurto(s.preparo)) + "</span>" + (s.referencia ? " · referência: " + esc(s.referencia) : "") + pilulaConferir(s.conferir, s.pendencia) + iso +
      (s.alternativas && s.alternativas.length ? ' <span class="cat-fonte">(' + s.alternativas.length + " alternativa(s) de outras fontes)</span>" : "") + "</div>";
    h += tabela([{ t: "Demão" }, { t: "Ligante" }, { t: "EPS (µm)", n: 1 }, { t: "SV (%)", n: 1 }, { t: "Rend. teórico (m²/L)", n: 1 }, { t: "Rend. com perda (m²/L)", n: 1 }, { t: "Litros", n: 1 }],
      r.demaos.map(function (d) {
        var svCel = '<input class="cat-sv" data-cat-in="tinta.sv.' + (d.ordem - 1) + '" inputmode="decimal" value="' + esc(E.tinta.sv[d.ordem - 1] != null && E.tinta.sv[d.ordem - 1] !== "" ? E.tinta.sv[d.ordem - 1] : (d.sv_pct == null ? "" : br(d.sv_pct, d.sv_pct % 1 ? 1 : 0))) + '" title="' + esc(d.svOrigem || "digite o SV da ficha técnica do produto") + '" placeholder="SV %">' + (d.svFaixa ? '<div class="cat-fonte">fichas: ' + br(d.svFaixa[0], 0) + "–" + br(d.svFaixa[1], 0) + "</div>" : "");
        return "<tr><td>" + esc(d.funcao) + (obj(arr(s.demaos)[d.ordem - 1]).produto ? '<div class="cat-fonte">ex.: ' + esc(s.demaos[d.ordem - 1].produto) + "</div>" : "") + "</td><td>" + esc(d.ligante || "—") + '</td><td class="n">' + (d.eps_um == null ? "—" : br(d.eps_um, 0)) + '</td><td class="n">' + svCel +
          '</td><td class="n">' + (d.rendTeoricoM2L == null ? "—" : br(d.rendTeoricoM2L, 1)) + '</td><td class="n">' + (d.rendPraticoM2L == null ? "—" : br(d.rendPraticoM2L, 1)) + '</td><td class="n">' + (d.litros == null ? '<span class="pill cat-conf" title="' + esc(d.motivo || "") + '">conferir</span>' : br(d.litros, 1) + (d.litrosFaixa && Math.abs(d.litrosFaixa[1] - d.litrosFaixa[0]) > 0.05 ? '<div class="cat-fonte">' + br(d.litrosFaixa[0], 1) + "–" + br(d.litrosFaixa[1], 1) + "</div>" : "")) + "</td></tr>";
      }));
    h += '<div style="margin-top:6px">EPS total do sistema: <b>' + (s.epsTotal_um == null ? "—" : br(s.epsTotal_um, 0) + " µm") + "</b> · Tinta total: <b class='g'>" + br(r.litrosTotal, 1) + " L</b>" + (r.completo && Math.abs(r.litrosFaixa[1] - r.litrosFaixa[0]) > 0.05 ? ' <span class="cat-fonte">(faixa pelo SV das fichas: ' + br(r.litrosFaixa[0], 1) + "–" + br(r.litrosFaixa[1], 1) + " L)</span>" : "") + (r.completo ? "" : " <span class='pill cat-conf'>incompleto</span>") + "</div>";
    h += '<div class="cat-fonte">Perda de aplicação ' + br(r.perdaPct, 0) + " % — " + esc(r.perdaOrigem) + ". Rendimento teórico = SV(%) × 10 ÷ EPS(µm); litros = área ÷ rendimento ÷ (1 − perda).</div>";
    r.avisos.forEach(function (a) { h += '<div class="cat-aviso">' + esc(a) + "</div>"; });
    h += '<div class="cat-fonte">Fonte do sistema: ' + link(fi(s)) + "</div>";
    return h;
  }
  function htmlGalv() {
    return '<div class="cat-calc" data-cat-calc="galv"><h4>Galvanização a fogo — camada mínima</h4><div class="lin">' +
      '<label>Espessura do aço (mm)<input data-cat-in="galv.esp" inputmode="decimal" value="' + esc(E.galv.esp) + '"></label></div>' +
      '<div class="cat-res" data-cat-res="galv">' + resGalv() + "</div></div>";
  }
  function resGalv() {
    var g = C().galvanizacao(num(E.galv.esp, null));
    if (!g) return '<span class="pill cat-conf">conferir</span> Sem faixa com fonte para esta espessura neste catálogo.';
    return "Camada local mínima <b>" + br(g.local_um, 0) + " µm</b> · média mínima <b class='g'>" + br(g.media_um, 0) + " µm</b>" + (g.mediaGm2 ? " (" + br(g.mediaGm2, 0) + " g/m²)" : "") +
      ' <span class="cat-fonte">' + esc(g.norma) + " — " + link(fi(g)) + "</span>" + pilulaConferir(g.conferir, "tabela de fonte secundária");
  }
  /* rugosidade de preparo: só aparece o que tem fonte; a faixa de 50 a 100 µm vem de norma de EMPRESA (referência de mercado), e o texto diz */
  function rugosidade(r) {
    if (!r || typeof r !== "object") return "—";
    var v = r.min != null && r.max != null ? br(r.min, 0) + "–" + br(r.max, 0) : (r.max != null ? "< " + br(r.max, 0) : "—");
    return '<span title="' + esc((r.origem ? r.origem + ". " : "") + (r.texto || "")) + '">' + v + '</span>' + (r.origem ? '<div class="cat-fonte">' + esc(corta(r.origem, 48)) + "</div>" : "");
  }
  function blocoPreparo() {
    var P = obj(C().DADOS.pinturaSistemas), h = tabela([{ t: "Grau (ISO 8501-1)" }, { t: "Descrição" }, { t: "SSPC" }, { t: "NACE" }, { t: "Rugosidade (µm)" }, { t: "Uso" }, { t: "Fonte" }],
      C().preparos().map(function (p) { return "<tr><td><b>" + esc(p.id) + "</b>" + pilulaConferir(p.conferir, p.pendencia) + "</td><td>" + esc(p.descricao || "") + "</td><td>" + esc(p.sspc || "—") + "</td><td>" + esc(p.nace || "—") + "</td><td>" + rugosidade(p.rugosidade_um) + "</td><td>" + esc(p.uso || "") + "</td><td>" + link(fi(p)) + "</td></tr>"; }),
      "Sem dados de preparo nesta pesquisa.");
    if (arr(P.primersExigencia).length) h += tabela([{ t: "Primer" }, { t: "Grau de preparo" }, { t: "Observação" }, { t: "Fonte" }], P.primersExigencia.map(function (x) {
      return "<tr><td>" + esc(x.primer || "") + pilulaConferir(x.conferir, x.pendencia) + "</td><td>" + esc(x.grauPreparo || "") + "</td><td>" + esc(x.obs || "") + "</td><td>" + link(fi(x)) + "</td></tr>"; }));
    if (arr(P.regrasPreparo).length) h += '<ul class="cat-fonte">' + P.regrasPreparo.map(function (r) { return "<li>" + esc(r.regra || "") + " " + link(fi(r)) + pilulaConferir(r.conferir, r.pendencia) + "</li>"; }).join("") + "</ul>";
    var rg = obj(P.rugosidadeGraus);
    if (arr(rg.graus).length) h += '<p class="cat-nota"><b>Rugosidade Rz (µm), ISO 8503-2 via fabricante:</b> ' + rg.graus.map(function (g) { return esc(g.grau + ": grit " + g.grit_um + ", granalha " + g.shot_um); }).join(" · ") + " " + link(fi(rg)) + "</p>";
    return h;
  }
  function blocoCorrosividade() {
    var P = C().DADOS.pinturaSistemas || {};
    return tabela([{ t: "Categoria" }, { t: "Perda do aço 1º ano" }, { t: "Perda do zinco 1º ano" }, { t: "Exterior" }, { t: "Interior" }, { t: "Fonte" }],
      arr(P.corrosividade).map(function (c) { var a = obj(c.perdaAco), z = obj(c.perdaZinco); return "<tr><td><b>" + esc(c.id) + "</b> " + esc(c.nome || "") + pilulaConferir(c.conferir, c.pendencia) + "</td><td>" + esc((a.gm2 || "—") + " g/m² · " + (a.um || "—") + " µm") + "</td><td>" + esc((z.gm2 || "—") + " g/m² · " + (z.um || "—") + " µm") + "</td><td>" + esc(c.exteriores || "") + "</td><td>" + esc(c.interiores || "") + "</td><td>" + link(fi(c)) + "</td></tr>"; }),
      "Sem dados de corrosividade nesta pesquisa.") +
      tabela([{ t: "Durabilidade" }, { t: "Anos" }, { t: "Edição" }, { t: "Fonte" }],
        arr(P.durabilidade).map(function (d) { return "<tr><td><b>" + esc(d.id) + "</b> " + esc(d.nome || "") + "</td><td>" + esc(d.anos || "") + "</td><td>" + esc(d.edicao || "") + "</td><td>" + link(fi(d)) + "</td></tr>"; }), "") +
      '<p class="cat-fonte">A durabilidade é uma faixa de vida até a 1ª manutenção grande — não é garantia.</p>';
  }
  function blocoSistemas() {
    var P = C().DADOS.pinturaSistemas || {};
    return tabela([{ t: "Ambiente" }, { t: "Durab." }, { t: "Substrato" }, { t: "Preparo" }, { t: "Demãos (EPS µm)" }, { t: "EPS total", n: 1 }, { t: "Referência" }, { t: "Fonte" }],
      arr(P.sistemas).map(function (s) { return "<tr><td><b>" + esc(s.ambiente) + "</b></td><td>" + esc(s.durabilidade) + "</td><td>" + esc(s.substrato || "aço carbono") + "</td><td title=\"" + esc(s.preparo || "") + "\">" + esc(prepCurto(s.preparo)) + "</td><td>" + arr(s.demaos).map(function (d) { return esc((d.funcao || "") + ": " + (d.ligante || "—") + " " + (d.eps_um == null ? (arr(d.eps_faixa_um).length ? d.eps_faixa_um.join("–") : "?") : d.eps_um) + " µm" + (d.produto ? " (ex.: " + d.produto + ")" : "")); }).join("<br>") + '</td><td class="n">' + (s.epsTotal_um == null ? "—" : br(s.epsTotal_um, 0)) + "</td><td>" + esc(s.referencia || "") + pilulaConferir(s.conferir, s.pendencia) + "</td><td>" + link(fi(s)) + "</td></tr>"; }),
      "Sem sistemas nesta pesquisa.");
  }
  function blocoGalvNorma() {
    var GT = obj(C().DADOS.galvanizacaoTinta), G = obj(GT.galvanizacao), M = obj(GT.metalizacao), h = "";
    if (arr(G.faixas).length) h += '<p class="cat-nota">Camada mínima do revestimento de zinco (peças de aço não centrifugadas) — <b>' + esc(G.norma || "") + "</b>. A tabela vem de fonte secundária" + (G.fonteTabela ? " (" + link(G.fonteTabela) + ")" : "") + pilulaConferir(G.conferir, "A NBR 6323:2025 não foi lida (norma paga): conferir a tabela na norma adotada.") + "</p>" +
      tabela([{ t: "Espessura do aço" }, { t: "Local mín. (µm)", n: 1 }, { t: "Média mín. (µm)", n: 1 }, { t: "Local mín. (g/m²)", n: 1 }, { t: "Média mín. (g/m²)", n: 1 }], G.faixas.map(function (f) { return "<tr><td>" + esc(f.rotulo || "") + '</td><td class="n">' + br(f.local_um, 0) + '</td><td class="n">' + br(f.media_um, 0) + '</td><td class="n">' + (f.localGm2 == null ? "—" : br(f.localGm2, 0)) + '</td><td class="n">' + (f.mediaGm2 == null ? "—" : br(f.mediaGm2, 0)) + "</td></tr>"; }), "", true);
    var ant = obj(G.tabelaNBR6323_edicaoAnterior);
    if (arr(ant.linhas).length) h += '<p class="cat-nota"><b>Atenção:</b> a tabela da NBR 6323 de edição anterior a 2016 (citada em artigo da ABRACO) é mais fina que a da ISO 1461:2022 — ' + arr(ant.linhas).slice(1, 4).map(function (l) { return esc(l.peca + ": média " + l.media_um + " µm"); }).join("; ") + ". Conferir a tabela da edição em vigor da NBR 6323 antes de especificar. " + link(fi(ant)) + "</p>";
    if (arr(G.durabilidade).length) h += '<h4 style="margin:10px 0 6px">Durabilidade do zinco por categoria (anos até a 1ª manutenção; ISO 14713-1 / ICZ)</h4>' + tabela([{ t: "Categoria" }, { t: "Perda do zinco (µm/ano)" }, { t: "85 µm" }, { t: "140 µm" }, { t: "200 µm" }], G.durabilidade.map(function (d) { return "<tr><td><b>" + esc(d.categoria) + "</b></td><td>" + esc(d.perda_um_ano || "—") + "</td><td>" + esc(d.vidaAnos_85um || "—") + "</td><td>" + esc(d.vidaAnos_140um || "—") + "</td><td>" + esc(d.vidaAnos_200um || "—") + "</td></tr>"; }), "", true) + '<p class="cat-fonte">' + esc(G.durabilidadeBase || "") + "</p>";
    if (G.duplex) h += '<p class="cat-nota"><b>Duplex (galvanização + pintura):</b> ' + esc(typeof G.duplex === "string" ? G.duplex : G.duplex.texto || "") + "</p>";
    if (obj(G.reparo).texto) h += '<p class="cat-nota"><b>Reparo de peça galvanizada:</b> ' + esc(G.reparo.texto) + "</p>";
    if (arr(G.limitacoes).length) h += '<p class="cat-nota"><b>Limitações do projeto:</b></p><ul class="cat-fonte">' + G.limitacoes.map(function (l) { return "<li>" + (l.tema ? "<b>" + esc(l.tema) + ":</b> " : "") + esc(l.texto || l) + "</li>"; }).join("") + "</ul>";
    if (arr(G.galvanizadoras).length) h += tabela([{ t: "Galvanizadora" }, { t: "Cidade/UF" }, { t: "Banheira (m)" }], G.galvanizadoras.map(function (g) { return "<tr><td>" + fabricantes([g]) + "</td><td>" + esc(g.cidade_uf || "") + "</td><td>" + esc(g.banheira_m || "") + "</td></tr>"; })) + '<p class="cat-fonte">' + esc(G.galvanizadorasNota || "") + "</p>";
    if (arr(M.espessuras).length) h += '<h4 style="margin:10px 0 6px">Metalização (aspersão térmica de Zn/Al)</h4>' + tabela([{ t: "Ambiente" }, { t: "Revestimento" }, { t: "EPS (µm)", n: 1 }, { t: "Observação" }, { t: "Fonte" }], M.espessuras.map(function (e) { return "<tr><td>" + esc(e.ambiente) + "</td><td>" + esc(e.revestimento || "") + '</td><td class="n">' + esc(e.eps_um) + "</td><td>" + esc(e.obs || "") + "</td><td>" + link(fi(e)) + "</td></tr>"; })) + (M.preparo ? '<p class="cat-fonte"><b>Preparo:</b> ' + esc(M.preparo) + "</p>" : "") + (arr(M.observacoes).length ? '<ul class="cat-fonte">' + M.observacoes.map(function (o) { return "<li>" + esc(o) + "</li>"; }).join("") + "</ul>" : "") +
      (arr(M.pendencias).length ? '<p class="cat-fonte"><span class="pill cat-conf">conferir</span> ' + esc(M.pendencias.join(" · ")) + "</p>" : "");
    return h || '<p class="cat-nota">Sem dados nesta pesquisa.</p>';
  }
  function abaPintura() {
    return htmlTinta() +
      sec("Quadro de seleção: sistema por ambiente e durabilidade", blocoQuadro(), true) + htmlGalv() +
      sec("Preparo de superfície (“escova” = limpeza mecânica St 2/St 3; jato Sa 1 a Sa 3)", blocoPreparo(), true) +
      sec("Corrosividade do ambiente e durabilidade (ISO 12944-1/-2)", blocoCorrosividade()) +
      sec("Mínimos da ISO 12944-5 (demãos e EPS por ambiente, durabilidade e tipo de primer)", blocoMatrizIso()) +
      sec("Sistemas de pintura por ambiente e durabilidade", blocoSistemas()) +
      sec("Galvanização a fogo e metalização", blocoGalvNorma());
  }

  /* ------------------------------------------------------------ ABA Cores */
  /* um objeto de regras (texto por chave) em lista; ignora fonte/conferir/pendencia e mostra o resto */
  var ROT = { edicaoBase: "Edição lida", faixaIdentificacao: "Faixa de identificação", inscricoes: "Inscrições", sentidoFluxo: "Sentido do fluxo", legenda: "Legenda", reservatorios: "Reservatórios", tolerancia: "Tolerância de cor",
              largura: "Largura", divisao: "Divisão", aplicacaoParcial: "Aplicação parcial", obrigatoria: "Onde é obrigatória", aguaIncendio: "Água de incêndio", contraste: "Contraste", cor: "Cor das letras", pressao: "Pressão" };
  function regras(o, nivel) {
    var h = "";
    Object.keys(obj(o)).forEach(function (k) {
      if (k === "fonte" || k === "conferir" || k === "pendencia" || k === "fonteSecundaria") return;
      var v = o[k], r = ROT[k] || k;
      if (v && typeof v === "object") h += '<li><b>' + esc(r) + ":</b><ul>" + regras(v, (nivel || 0) + 1) + "</ul></li>";
      else if (v != null && v !== "") h += "<li><b>" + esc(r) + ":</b> " + esc(v) + "</li>";
    });
    return h;
  }
  function amostra(c) { var h = c.hex; return /^#[0-9a-f]{6}$/i.test(String(h || "")) ? '<span class="cat-amostra" style="background:' + esc(h) + '" title="amostra de tela — não substitui o leque Munsell/RAL"></span>' : ""; }
  function abaCores() {
    var K = C(), st = K.statusCores();
    var h = sec("Situação das normas de cor — o que a NR-26 manda e quais normas ABNT valem", '<p style="margin:0">' + esc(st.status || "Sem conclusão registrada.") + "</p>" +
      (st.normas.length ? tabela([{ t: "Norma" }, { t: "Edição" }, { t: "Situação" }, { t: "O que cobre" }, { t: "Fonte" }], st.normas.map(function (n) { return "<tr><td><b>" + esc(n.norma) + "</b>" + pilulaConferir(n.conferir, n.pendencia) + "</td><td>" + esc(n.edicao || "") + "</td><td>" + esc(n.status || "") + (n.substituidaPor ? " → " + esc(n.substituidaPor) : "") + "</td><td>" + esc(n.cobre || "") + (n.reconfirmacao ? '<div class="cat-fonte">' + esc(n.reconfirmacao) + "</div>" : "") + "</td><td>" + link(fi(n)) + "</td></tr>"; })) : ""), false);
    h += sec("Cores de segurança", tabela([{ t: "Cor" }, { t: "Significado e usos" }, { t: "Munsell" }, { t: "RAL" }, { t: "Fonte" }],
      K.coresSeguranca().map(function (c) { return "<tr><td>" + amostra(c) + "<b>" + esc(c.nome || c.id) + "</b>" + pilulaConferir(c.conferir, c.pendencia) + "</td><td>" + esc(c.significado || "") + (arr(c.usos).length ? '<div class="cat-fonte">' + esc(c.usos.join("; ")) + "</div>" : "") + "</td><td>" + esc(c.munsell || "—") + "</td><td>" + esc(c.ral || (c.aproximacaoRal ? "≈ " + c.aproximacaoRal : "—")) + "</td><td>" + link(fi(c)) + "</td></tr>"; }), "Sem dados de cores nesta pesquisa."), true);
    h += sec("Identificação de tubulações por fluido", tabela([{ t: "Fluido" }, { t: "Cor" }, { t: "Munsell" }, { t: "Fonte" }],
      K.coresTubulacao().map(function (c) { return "<tr><td>" + esc(c.fluido) + pilulaConferir(c.conferir, c.pendencia) + "</td><td>" + esc(c.cor || "") + (c.faixa ? ' <span class="cat-fonte">faixa: ' + esc(c.faixa) + "</span>" : "") + "</td><td>" + esc(c.munsell || "—") + "</td><td>" + link(fi(c)) + (c.fonteSecundaria ? ' <span class="cat-fonte">(fonte secundária)</span>' : "") + "</td></tr>"; }), "Sem dados nesta pesquisa."));
    var rt = obj(obj(C().DADOS.cores).tubulacaoRegras);
    if (Object.keys(rt).length) h += sec("Faixa de identificação das tubulações (regras da NBR 6493, edição 1994 lida)", "<ul>" + regras(rt) + "</ul>" + '<p class="cat-fonte">' + link(fi(rt)) + pilulaConferir(rt.conferir, rt.pendencia) + "</p>");
    h += sec("Onde usar: guarda-corpo, escada, plataforma, tanques", tabela([{ t: "Item" }, { t: "Cor" }, { t: "Justificativa" }, { t: "Base" }, { t: "Fonte" }],
      K.coresAplicacoes().map(function (c) { return "<tr><td><b>" + esc(c.item) + "</b>" + pilulaConferir(c.conferir, c.pendencia) + "</td><td>" + esc(c.cor || "") + (c.munsell ? ' <span class="cat-fonte">' + esc(c.munsell) + "</span>" : "") + "</td><td>" + esc(c.justificativa || "") + "</td><td>" + esc({ norma: "norma", regulamento: "regulamento", pratica: "prática de mercado" }[c.tipoFonte] || c.tipoFonte || "") + "</td><td>" + link(fi(c)) + "</td></tr>"; }), "Sem dados nesta pesquisa."));
    return h + '<p class="cat-nota">A amostra de cor na tela não substitui o leque de cores Munsell/RAL nem a ficha da tinta: confirmar o código na norma adotada pelo projeto.</p>';
  }

  /* ------------------------------------------------------------ ABA Normas e pendências */
  function abaNormas() {
    var K = C(), n = K.normas(), p = K.pendencias(), g = K.pendenciasAgrupadas ? K.pendenciasAgrupadas() : null;
    return '<p class="cat-nota">Edição vigente conferida em catálogo oficial (ABNT, ISO, ASTM) e a situação de cada norma citada no catálogo.</p>' +
      tabela([{ t: "Norma" }, { t: "Título" }, { t: "Edição vigente" }, { t: "Situação" }, { t: "Fonte" }],
        n.map(function (x) { return "<tr><td><b>" + esc(x.norma) + "</b></td><td>" + esc(x.titulo || "") + "</td><td>" + esc(corta(x.edicaoVigente || x.edicao || "—", 70)) + "</td><td title=\"" + esc(x.status || "") + "\">" + esc(corta(x.status || "", 64)) + (x.substituidaPor ? " → " + esc(x.substituidaPor) : "") + pilulaConferir(x.status === "conferir", x.observacao) + "</td><td>" + link(fi(x)) + "</td></tr>"; }), "Nenhuma norma registrada.") +
      '<h4 style="margin:12px 0 6px">Pendências (' + p.length + (g ? " itens em " + g.length + " grupos" : "") + ") — o que não pôde ser confirmado em fonte pública</h4>" +
      (g ? pendenciasPorSecao(g) :
      tabela([{ t: "Onde" }, { t: "Item" }, { t: "Pendência" }], p.map(function (x) { return "<tr><td class='cat-fonte'>" + esc(x.caminho) + "</td><td>" + esc(x.item) + "</td><td>" + esc(x.pendencia) + "</td></tr>"; }), "Nenhuma pendência registrada."));
  }
  /* uma seção recolhida por parte do catálogo; uma linha por grupo; os itens do grupo (e as linhas de tabela dentro deles) abrem no clique */
  function pendenciasPorSecao(grupos) {
    if (!grupos.length) return '<p class="cat-nota">Nenhuma pendência registrada.</p>';
    var ordem = [], porSec = {};
    grupos.forEach(function (x) { if (!porSec[x.secao]) { porSec[x.secao] = []; ordem.push(x.secao); } porSec[x.secao].push(x); });
    function sub(s) { return "<li>" + esc(s.item || s.caminho) + (s.pendencia && s.pendencia !== "conferir na fonte" ? ' <span class="cat-fonte">— ' + esc(s.pendencia) + "</span>" : "") + "</li>"; }
    function itens(x) {
      var m = x.membros, nSub = m.reduce(function (s, y) { return s + y.subitens.length; }, 0);
      if (m.length === 1 && !nSub) return esc(m[0].item || "—");
      var rot = m.length > 1 ? m.length + " itens" : esc(m[0].item || "item");
      if (nSub) rot += " · " + nSub + " subite" + (nSub > 1 ? "ns" : "m");
      return "<details><summary>" + rot + "</summary><ul style='margin:4px 0 0 16px;padding:0'>" + m.map(function (y) {
        return "<li><b>" + esc(y.item || y.caminho) + "</b>" + (y.pendencia !== x.pendencia ? ' <span class="cat-fonte">— ' + esc(y.pendencia) + "</span>" : "") +
          (y.subitens.length ? "<ul style='margin:2px 0 0 14px;padding:0'>" + y.subitens.map(sub).join("") + "</ul>" : "") + "</li>";
      }).join("") + "</ul></details>";
    }
    return ordem.map(function (s) {
      var gs = porSec[s], tot = gs.reduce(function (a, x) { return a + x.total; }, 0);
      return sec(s + " — " + tot + " pendência" + (tot > 1 ? "s" : "") + " em " + gs.length + " grupo" + (gs.length > 1 ? "s" : ""),
        tabela([{ t: "Onde" }, { t: "Item" }, { t: "Pendência" }], gs.map(function (x) {
          return "<tr><td class='cat-fonte'>" + esc(x.onde) + "</td><td>" + itens(x) + "</td><td>" + esc(x.pendencia) + "</td></tr>"; })), false);
    }).join("");
  }

  /* ------------------------------------------------------------ casca */
  function corpoAba() {
    if (!C()) return semMotor();
    if (E.aba === "chapas") return abaChapas();
    if (E.aba === "pintura") return abaPintura();
    if (E.aba === "cores") return abaCores();
    if (E.aba === "normas") return abaNormas();
    return abaAcos();
  }
  function casca() {
    var K = C(), r = K ? K.resumo() : null;
    return CSS + '<div class="cat-raiz" data-cat="raiz"><p class="cat-nota" data-cat="nota">Consulta técnica — <b>não é cálculo estrutural nem especificação de projeto</b>. Cada dado traz a fonte; o que não foi confirmado aparece como <span class="pill cat-conf">conferir</span>.' +
      (r ? " Catálogo " + esc(r.versao) + " · " + r.acos + " aços · " + r.sistemas + " sistemas de pintura · " + r.pendencias + " pendência(s)." : "") + '</p>' +
      '<div class="tabs" data-cat="abas">' + ABAS.map(function (a) { return '<div class="tab' + (a.id === E.aba ? " ativa" : "") + '" data-cat-aba="' + a.id + '">' + esc(a.rotulo) + "</div>"; }).join("") + "</div>" +
      '<div data-cat="corpo">' + corpoAba() + "</div></div>";
  }
  function raiz() { return global.document ? global.document.querySelector('[data-cat="raiz"]') : null; }
  function pintarCorpo() {
    var r = raiz(); if (!r) return;
    var c = r.querySelector('[data-cat="corpo"]'); if (c) c.innerHTML = corpoAba();
    [].forEach.call(r.querySelectorAll("[data-cat-aba]"), function (t) { t.classList.toggle("ativa", t.getAttribute("data-cat-aba") === E.aba); });
  }
  function atribui(chave, valor) {
    var p = chave.split(".");
    if (p.length === 3) E[p[0]][p[1]][p[2]] = valor; else if (p.length === 2) E[p[0]][p[1]] = valor; else E[p[0]] = valor;
    if (p[0] === "tinta" && (p[1] === "amb" || p[1] === "dur")) E.tinta.sv = {};   /* outro sistema = outras demãos: o SV digitado não vale mais */
  }
  function aoMudar(el) {
    var k = el.getAttribute("data-cat-in"); if (!k) return;
    atribui(k, el.type === "checkbox" ? el.checked : el.value);
    var r = raiz(); if (!r) return;
    var calc = k.split(".")[0], alvo;
    if (k === "grade.fab") { E.grade.tipo = ""; pintarCorpo(); return; }   /* outro fabricante = outra lista de tipos: redesenha a aba */
    if (calc === "tinta" && E.quant) { E.quant = null; var aq = r.querySelector('[data-cat-res="quant"]'); if (aq) aq.innerHTML = ""; }   /* outro sistema/área/perda: o quantitativo mostrado ficou velho */
    if (calc === "peso" || calc === "tinta" || calc === "galv" || calc === "grade") {
      alvo = r.querySelector('[data-cat-res="' + calc + '"]');
      if (alvo) alvo.innerHTML = calc === "peso" ? resPeso() : calc === "tinta" ? resTinta() : calc === "galv" ? resGalv() : resGrade();
      if (/^tinta\.sv\./.test(k)) {   /* o campo foi redesenhado: devolve o foco ao fim do que a pessoa digitava */
        var novo = r.querySelector('[data-cat-in="' + k + '"]');
        if (novo) { novo.focus(); try { var n = novo.value.length; novo.setSelectionRange(n, n); } catch (eS) {} }
      }
      return;
    }
    var l = r.querySelector('[data-cat-lista="acos"]'); if (l) l.innerHTML = listaAcos();
  }
  function ligar() {
    var r = raiz(); if (!r) return;
    r.addEventListener("click", function (ev) {
      var ac = ev.target && ev.target.closest ? ev.target.closest("[data-cat-act]") : null;
      if (ac) {
        var act = ac.getAttribute("data-cat-act");
        if (act === "quantitativo") { E.quant = quantitativoModelo(); var alvoQ = raiz() && raiz().querySelector('[data-cat-res="quant"]'); if (alvoQ) alvoQ.innerHTML = htmlQuant(E.quant); }
        else if (act === "orcar" && E.quant && E.quant.ok && global.App && global.App.criarOrcamentoDoBIM) {
          var obra = ""; try { obra = global.BimMetalUI && global.BimMetalUI.nomeObra ? global.BimMetalUI.nomeObra() : ""; } catch (eO) {}
          global.UI.fecharModal(); global.App.criarOrcamentoDoBIM(E.quant.orcamento, obra);
        }
        return;
      }
      var q = ev.target && ev.target.closest ? ev.target.closest("[data-cat-quadro]") : null;
      if (q) {   /* célula do quadro de seleção → calculadora de tinta */
        ev.preventDefault(); var par = q.getAttribute("data-cat-quadro").split("|");
        E.tinta.amb = par[0]; E.tinta.dur = par[1]; E.tinta.sv = {}; pintarCorpo();
        var alvo = raiz() && raiz().querySelector('[data-cat-calc="tinta"]'); if (alvo && alvo.scrollIntoView) alvo.scrollIntoView({ block: "nearest" });
        return;
      }
      var t = ev.target && ev.target.closest ? ev.target.closest("[data-cat-aba]") : null;
      if (!t) return;
      E.aba = t.getAttribute("data-cat-aba"); pintarCorpo();
    });
    r.addEventListener("toggle", function (ev) { var d = ev.target; if (d && d.getAttribute && d.getAttribute("data-cat-sec")) E.aberto[d.getAttribute("data-cat-sec")] = !!d.open; }, true);
    r.addEventListener("input", function (ev) { aoMudar(ev.target); });
    r.addEventListener("change", function (ev) { aoMudar(ev.target); });
  }

  var MetalCatalogoUI = {
    COMANDOS: COMANDOS, ABAS: ABAS,
    ids: function () { return COMANDOS.map(function (c) { return c.id; }); },
    registrar: function (reg) {
      if (!C()) return false;
      var self = this;
      reg["met-catalogo"] = function () { try { self.abrir(); } catch (e) { toast("Catálogo industrial: " + (e && e.message ? e.message : e), "erro", 8000); } return true; };
      return true;
    },
    abrir: function (aba) {
      if (!global.UI || !global.UI.modal) return false;
      if (aba) E.aba = aba;
      global.UI.modal("Catálogo industrial — aços, chapas, proteção e cores", casca(), [{ texto: "Fechar", classe: "primary", onClick: function () { global.UI.fecharModal(); } }]);
      if (global.UI.modalConsulta) global.UI.modalConsulta();
      var bg = global.document.getElementById("modal-bg"); if (bg) { var m = bg.querySelector(".modal"); if (m) m.className += " largo"; }
      ligar();
      return true;
    },
    aba: function (id) { E.aba = id; pintarCorpo(); return E.aba; },
    fechar: function () { if (global.UI && global.UI.fecharModal) global.UI.fecharModal(); },
    aberto: function () { return !!raiz(); },
    estado: function () { return E; }
  };
  global.MetalCatalogoUI = MetalCatalogoUI;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalCatalogoUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
