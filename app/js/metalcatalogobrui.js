/* =====================================================================
 * metalcatalogobrui.js — a TELA do CATÁLOGO BR da Metálica (aba "Catálogo
 * BR" do painel de catálogo, js/metalcatalogoui.js). Frente M1, 1.2.145.
 *
 * Fina: só chama o motor (js/acocatalogobr.js). Busca por família, nome e
 * propriedade (mín./máx.); filtro por aço e por fabricante; a FONTE visível em
 * cada item (título, edição, data de acesso, página, link). A escolha ALIMENTA:
 *   · o criar      — perfil → MetalCriarUI.mudarFerramenta(ferr, "mcrf:cat", nome)
 *                    (pilar, viga, diagonal, terça) e o aço da peça, se for da lista dela;
 *   · as ligações  — classe do parafuso, aço do chumbador, aço da chapa/placa →
 *                    MetalLigSugUI.materiais({...}) (o motor recebe por op.materiais);
 *   · o fechamento — telha → MetalCalcUI.usarTelha(id) (cobertura do galpão).
 * Nenhuma nota de dúvida ("conferir", pendência) aparece aqui: ela mora em
 * docs/metalica/CATALOGO-BR-PENDENCIAS.md (arquivo interno).
 * ===================================================================== */
(function (global) {
  "use strict";
  function C() { return global.AcoCatalogoBR || null; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function seguro(url) { return /^https?:\/\//i.test(String(url || "")) ? String(url) : ""; }
  function num(v) { if (v == null || v === "") return null; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : null; }
  function br(v, c) { if (v == null || !isFinite(v)) return "—"; c = c == null ? 2 : c; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function toast(t, k, ms) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info", ms || 5000); } catch (e) {} }
  function dataBR(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? m[3] + "/" + m[2] + "/" + m[1] : ""; }
  function limpar(t) { var K = C(); return K ? K.limparTela(t) : String(t || ""); }

  var PAGINA = 150;
  var PROPS = [["", "—"], ["massa", "massa (kg/m)"], ["A", "área A (cm²)"], ["altura", "altura / diâmetro (mm)"], ["largura", "largura (mm)"], ["t", "espessura (mm)"], ["Ix", "Ix (cm⁴)"], ["Wx", "Wx (cm³)"], ["peso", "peso da telha (kN/m²)"], ["vaoMax", "vão máximo da telha (m)"]];
  var FERRS = [["pilar", "Pilar"], ["viga", "Viga"], ["diagonal", "Diagonal"], ["terca", "Terça"]];
  var E = { familia: "", texto: "", aco: "", fab: "", prop: "", min: "", max: "", mostrar: PAGINA, aberto: "" };

  var CSS = '<style data-cbr-css>' +
    '.cbr .cbr-filtros{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:flex-end;margin:0 0 8px}' +
    '.cbr .cbr-filtros label{display:flex;flex-direction:column;font-size:12px;gap:3px;color:var(--texto-fraco)}' +
    '.cbr .cbr-filtros input[data-cbr-in="min"],.cbr .cbr-filtros input[data-cbr-in="max"]{width:76px;min-width:0}' +
    '.cbr .cbr-filtros input[data-cbr-in="texto"]{min-width:200px}' +
    '.cbr .cbr-conta{font-size:12px;color:var(--texto-fraco);margin:0 0 6px}' +
    '.cbr .cbr-tab{overflow:auto;max-height:54vh;border:1px solid var(--linha);border-radius:var(--raio-sm,6px)}' +
    '.cbr table.tbl td.cbr-nome{min-width:180px}.cbr table.tbl td.cbr-props{min-width:220px;font-variant-numeric:tabular-nums}' +
    '.cbr .cbr-ver{background:none;border:0;padding:0;color:var(--aco);cursor:pointer;font:inherit;text-align:left}' +
    '.cbr .cbr-ver:focus-visible,.cbr .cbr-usar:focus-visible{outline:2px solid var(--aco);outline-offset:2px}' +
    '.cbr .cbr-usar{display:inline-block;margin:1px 3px 1px 0;padding:2px 7px;border:1px solid var(--linha-forte,var(--linha));border-radius:999px;background:var(--surface);color:var(--texto);font-size:11.5px;cursor:pointer;min-height:24px}' +
    '.cbr .cbr-usar:hover{border-color:var(--aco);color:var(--aco)}' +
    '.cbr .cbr-chip{display:inline-block;padding:1px 7px;margin:1px 3px 1px 0;border:1px solid var(--linha);border-radius:999px;font-size:11.5px;white-space:nowrap}' +
    '.cbr .cbr-fonte{font-size:11.5px;color:var(--texto-fraco);max-width:300px}' +
    '.cbr .cbr-fonte a{color:var(--aco)}' +
    '.cbr .cbr-sem{font-size:11.5px;color:var(--texto-fraco)}' +
    '.cbr tr.cbr-det td{background:var(--surface-2,var(--surface))}' +
    '.cbr .cbr-det-tab table.tbl{width:auto;font-size:12px}' +
    '.cbr .cbr-mat{font-size:12px;margin:8px 0 0;color:var(--texto)}' +
    '.cbr .cbr-mais{margin-top:8px}' +
    '</style>';

  /* ------------------------------------------------ peças */
  function opcoes(lista, atual) { return lista.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(atual) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join(""); }
  function linkFonte(f) {
    if (!f) return '<span class="cbr-sem">sem fonte</span>';
    var t = limpar(f.titulo || f.texto || ""), u = seguro(f.url), d = dataBR(f.acesso), p = f.pagina ? (/^p/i.test(String(f.pagina)) ? String(f.pagina) : "p. " + f.pagina) : "";
    var extra = [f.edicao ? limpar(f.edicao) : "", p ? limpar(p) : "", d ? "acesso " + d : ""].filter(Boolean).join(" · ");
    var tc = t.length > 110 ? t.slice(0, 108).replace(/\s+\S*$/, "") + "…" : t;
    return '<div class="cbr-fonte" data-cbr-fonte="1">' + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer" title="' + esc(t) + '">' + esc(tc) + "</a>" : esc(tc)) + (extra ? "<br>" + esc(extra.length > 140 ? extra.slice(0, 138) + "…" : extra) : "") + "</div>";
  }
  function chipsAco(it) {
    var a = arr(it.acos);
    if (!a.length) return it.tipo === "perfil" ? '<span class="cbr-sem">a fonte não informa o aço</span>' : '<span class="cbr-sem">—</span>';
    var MAX = 6, vis = a.slice(0, MAX);
    return vis.map(function (x) {
      var tip = [x.fabricante, x.fornecimento, x.faixa, x.fy ? "fy " + x.fy + " MPa" : "", x.fu ? "fu " + x.fu + " MPa" : "", x.fonte ? limpar(x.fonte.titulo || "") : ""].filter(Boolean).join(" · ");
      return '<span class="cbr-chip" title="' + esc(tip) + '">' + esc(limpar(x.nome || x.id)) + (x.fornecimento && !/pronta/.test(x.fornecimento) ? " *" : "") + "</span>";
    }).join("") + (a.length > MAX ? '<span class="cbr-sem">+' + (a.length - MAX) + " (ver)</span>" : "");
  }
  function podeCriar(nome) { var M = global.BimMetalCriar || global.MetalCriar; try { return !!(M && M.perfilCat && M.perfilCat(nome)); } catch (e) { return false; } }
  function botoesUsar(it) {
    var h = "";
    if (it.tipo === "perfil") {
      if (global.MetalCriarUI && podeCriar(it.nome)) h += FERRS.map(function (f) { return '<button type="button" class="cbr-usar" data-cbr-usar="criar" data-cbr-ferr="' + f[0] + '" data-cbr-id="' + esc(it.id) + '" title="Usar este perfil na ferramenta ' + f[1] + ' do Criar">' + f[1] + "</button>"; }).join("");
      else h += '<span class="cbr-sem">consulta</span>';
    } else if (it.tipo === "telha") {
      if (global.MetalCalcUI && global.MetalCalcUI.usarTelha) h += '<button type="button" class="cbr-usar" data-cbr-usar="telha" data-cbr-id="' + esc(it.id) + '" title="Usar esta telha na cobertura do galpão (Cálculo › Galpão)">Cobertura</button>';
    } else if (it.tipo === "parafuso") {
      if (global.MetalLigSugUI && global.MetalLigSugUI.materiais) h += arr(it.acos).map(function (a) { return '<button type="button" class="cbr-usar" data-cbr-usar="parafuso" data-cbr-classe="' + esc(a.id) + '" title="Classe do parafuso nas ligações (fub ' + esc(a.fu) + ' MPa)">' + esc(a.id.replace(/^ISO (898-1|4016) classe /, "classe ").replace(/^ASTM /, "")) + "</button>"; }).join("");
    } else if ((it.tipo === "chumbador" && !it.posInstalado) || it.tipo === "placa") {
      if (global.MetalLigSugUI && global.MetalLigSugUI.materiais) h += arr(it.acos).filter(function (a) { return a.fy > 0 && a.fu > 0; }).map(function (a) { return '<button type="button" class="cbr-usar" data-cbr-usar="' + (it.tipo === "placa" ? "aco" : "chumbador") + '" data-cbr-aco="' + esc(a.id) + '" data-cbr-fy="' + esc(a.fy) + '" data-cbr-fu="' + esc(a.fu) + '" title="' + (it.tipo === "placa" ? "Aço da chapa das ligações" : "Aço do chumbador nas ligações") + " (fy " + esc(a.fy) + " / fu " + esc(a.fu) + ' MPa)">' + esc(a.id) + "</button>"; }).join("");
    }
    return h || '<span class="cbr-sem">consulta</span>';
  }
  function detalhe(it) {
    var h = '<div class="cbr-det-tab">', K = C();
    var f = it.fonte || {};
    h += "<p><b>Fonte:</b> " + esc(limpar(f.titulo || f.texto || "")) + (f.edicao ? " — " + esc(limpar(f.edicao)) : "") + (f.pagina ? " — " + esc(limpar(/^p/i.test(String(f.pagina)) ? f.pagina : "p. " + f.pagina)) : "") + (f.acesso ? " — acesso em " + esc(dataBR(f.acesso)) : "") +
         (seguro(f.url) ? ' — <a href="' + esc(seguro(f.url)) + '" target="_blank" rel="noopener noreferrer">abrir</a>' : "") + "</p>";
    if (it.norma) h += "<p><b>Norma citada pela fonte:</b> " + esc(it.norma) + "</p>";
    if (it.tipo === "perfil" && global.PerfisAco) {
      var o = global.PerfisAco.obter(it.nome) || {}, org = o.origem || {}, cols = Object.keys(org).filter(function (k) { return typeof o[k] === "number"; });
      if (cols.length) h += '<table class="tbl"><thead><tr><th>Grandeza</th><th class="n">Valor</th><th>Origem</th></tr></thead><tbody>' + cols.map(function (k) { return "<tr><td>" + esc(k) + '</td><td class="n">' + br(o[k], Math.abs(o[k]) >= 1000 ? 0 : 2) + "</td><td>" + (org[k] === "geometria" ? "calculado pela seção" : "tabela do fabricante") + "</td></tr>"; }).join("") + "</tbody></table>";
      var cf = K ? K.conferirSecao(o, K.tolDe(it.serie)) : null;
      if (cf && cf.comparado) h += '<p class="cbr-sem">Conferência: ' + (cf.comparado === "area" ? "área" : "massa") + " da geometria " + br(cf.comparado === "area" ? cf.geo / 100 : cf.geo, 2) + " × tabela " + br(cf.comparado === "area" ? cf.tabela / 100 : cf.tabela, 2) + (cf.comparado === "area" ? " cm²" : " kg/m") + " (diferença " + br(cf.rel * 100, 2) + " %)</p>";
    }
    if (it.tipo === "telha" && K) {
      var t = K.telha(it.ref.telha);
      if (t && t.vaos.length) h += '<table class="tbl"><thead><tr><th>Uso</th><th>Apoios</th><th>Flecha</th><th class="n">Carga (kN/m²)</th><th class="n">Vão máx. (m)</th></tr></thead><tbody>' + t.vaos.map(function (v) { return "<tr><td>" + esc(v.uso) + "</td><td>" + esc(v.apoios.join(", ")) + "</td><td>" + esc(v.flecha) + '</td><td class="n">' + br(v.carga_kN_m2, 3) + '</td><td class="n">' + br(v.vao_m, 2) + "</td></tr>"; }).join("") + "</tbody></table>";
    }
    if (it.tipo === "chumbador" && K) {
      var p = K.chumbador(it.ref.chumbador), ds = p ? arr(p.diametros) : [];
      if (ds.length) {
        var cs = ["d_mm", "d_pol", "comprimentos_mm", "d0_mm", "hef_mm", "Tinst_Nm", "NRd_kN", "VRd_kN", "NRk_kN", "VRk_kN", "concreto", "carga_trabalho_tracao_kN", "carga_ruptura_tracao_kN"].filter(function (c) { return ds.some(function (d) { return d[c] != null && d[c] !== ""; }); });
        h += '<table class="tbl"><thead><tr>' + cs.map(function (c) { return "<th>" + esc(c.replace(/_/g, " ")) + "</th>"; }).join("") + "</tr></thead><tbody>" + ds.map(function (d) { return "<tr>" + cs.map(function (c) { var v = d[c]; return "<td>" + esc(Array.isArray(v) ? v.join(", ") : (typeof v === "number" ? br(v, v % 1 ? 2 : 0) : limpar(v == null ? "" : v))) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>";
      }
      if (it.posInstalado) h += '<p class="cbr-sem">Pós-instalado: a resistência é a do fabricante (avaliação técnica do produto); o sistema não dimensiona a aderência nem o cone deste produto.</p>';
    }
    if (it.tipo === "parafuso" && K) {
      var pf = K.parafuso(it.ref.parafuso);
      if (pf) h += '<table class="tbl"><tbody><tr><td>d (cálculo)</td><td class="n">' + br(pf.d, 3) + " mm</td></tr><tr><td>passo</td><td class=\"n\">" + br(pf.passo, 2) + " mm</td></tr><tr><td>Ab = π·d²/4</td><td class=\"n\">" + br(pf.Ab, 1) + " mm²</td></tr>" +
        (pf.As ? "<tr><td>As (área resistente da rosca)</td><td class=\"n\">" + br(pf.As, 1) + " mm²</td></tr>" : "") + "<tr><td>abertura da chave s</td><td class=\"n\">" + br(pf.s, 1) + " mm</td></tr><tr><td>altura da cabeça k / da porca m</td><td class=\"n\">" + br(pf.k, 1) + " / " + br(pf.m, 1) + " mm</td></tr>" +
        (pf.arruela ? "<tr><td>arruela d1 / d2 / h</td><td class=\"n\">" + br(pf.arruela.d1, 1) + " / " + br(pf.arruela.d2, 1) + " / " + br(pf.arruela.h, 1) + " mm</td></tr>" : "") + "</tbody></table>" +
        "<p class=\"cbr-sem\">Geometria: " + esc(pf.fonteGeometria.titulo) + (pf.fonteAs ? " · As: " + esc(pf.fonteAs.titulo) : "") + "</p>" +
        (pf.conferencia.length ? '<p class="cbr-sem" data-cbr="conf-geo">Desenho × ficha do fabricante: ' + pf.conferencia.filter(function (c) { return c.igual; }).length + " de " + pf.conferencia.length + " medidas iguais (" + esc(pf.conferencia.map(function (c) { return c.peca + " " + c.campo + " " + br(c.desenho, 2) + (c.igual ? "" : " × " + br(c.fonte, 2)); }).join("; ")) + ") — " + esc(pf.conferencia[0].ref ? pf.conferencia[0].ref.titulo : "") + "</p>" : "") +
        pf.comprimentos.map(function (c) { return '<p class="cbr-sem">Comprimentos comerciais — ' + esc(c.fabricante + ", " + c.produto) + ": " + esc((c.L_pol.length ? c.L_pol.map(function (x) { return x + '"'; }) : c.L_mm.map(function (x) { return br(x, 0); })).join(" · ")) + (c.L_pol.length ? "" : " mm") + "</p>"; }).join("") +
        '<table class="tbl"><thead><tr><th>Classe</th><th class="n">fyb (MPa)</th><th class="n">fub (MPa)</th><th>Fonte</th></tr></thead><tbody>' + arr(it.acos).map(function (a) { return "<tr><td>" + esc(a.id) + '</td><td class="n">' + esc(a.fy == null ? "—" : a.fy) + '</td><td class="n">' + esc(a.fu) + "</td><td>" + esc(a.fonte ? a.fonte.titulo : "") + "</td></tr>"; }).join("") + "</tbody></table>";
    }
    if (it.tipo === "apoio" && it.dado) {
      var dims = arr(it.dado.dimensoes);
      if (dims.length) { var cd = Object.keys(dims[0]); h += '<table class="tbl"><thead><tr>' + cd.map(function (c) { return "<th>" + esc(c.replace(/_/g, " ")) + "</th>"; }).join("") + "</tr></thead><tbody>" + dims.map(function (d) { return "<tr>" + cd.map(function (c) { return '<td class="n">' + esc(d[c] == null ? "—" : String(d[c]).replace(".", ",")) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>"; }
    }
    return h + "</div>";
  }
  function linha(it) {
    var K = C(), fam = (K.FAMILIAS.filter(function (f) { return f.id === it.familia; })[0] || {}).nome || it.familia, ab = E.aberto === it.id;
    var h = '<tr data-cbr-item="' + esc(it.id) + '"><td class="cbr-nome"><button type="button" class="cbr-ver" data-cbr-ver="' + esc(it.id) + '" aria-expanded="' + (ab ? "true" : "false") + '" title="Ver todas as propriedades e a fonte">' + esc(it.nome) + "</button></td>" +
      "<td>" + esc(fam) + "</td><td>" + esc(it.fabricante || "") + "</td><td>" + chipsAco(it) + '</td><td class="cbr-props">' + esc(it.propsTexto || "") + "</td><td>" + linkFonte(it.fonte) + "</td><td>" + botoesUsar(it) + "</td></tr>";
    if (ab) h += '<tr class="cbr-det" data-cbr-det="' + esc(it.id) + '"><td colspan="7">' + detalhe(it) + "</td></tr>";
    return h;
  }
  function filtro() { return { familia: E.familia, texto: E.texto, aco: E.aco, fabricante: E.fab, prop: E.prop, min: num(E.min), max: num(E.max) }; }
  function lista() {
    var K = C(), L = K.itens(filtro()), mostra = L.slice(0, E.mostrar);
    var h = '<p class="cbr-conta" data-cbr="conta">' + L.length + (L.length === 1 ? " item" : " itens") + (L.length > mostra.length ? " — mostrando " + mostra.length : "") + "</p>";
    if (!L.length) return h + '<p class="cbr-sem" data-cbr="vazio">Nenhum item com estes filtros. Tente outra família, outro aço ou tire o limite da propriedade.</p>';
    h += '<div class="cbr-tab"><table class="tbl" data-cbr="tabela"><thead><tr><th>Item</th><th>Família</th><th>Fabricante</th><th>Aço</th><th>Propriedades</th><th>Fonte</th><th>Usar</th></tr></thead><tbody>' + mostra.map(linha).join("") + "</tbody></table></div>";
    if (mostra.some(function (it) { return arr(it.acos).some(function (a) { return a.fornecimento && !/pronta/.test(a.fornecimento); }); })) h += '<p class="cbr-sem" data-cbr="legenda">* aço sob encomenda ou sob consulta, como o fabricante declara (o nome completo e a fonte aparecem ao passar o mouse).</p>';
    if (L.length > mostra.length) h += '<button type="button" class="btn sm ghost cbr-mais" data-cbr-act="mais">Mostrar mais ' + Math.min(PAGINA, L.length - mostra.length) + "</button>";
    return h;
  }
  function textoMateriais() {
    var L = global.MetalLigSugUI && global.MetalLigSugUI.materiais ? global.MetalLigSugUI.materiais() : {};
    var p = []; if (L.parafuso) p.push("parafuso " + L.parafuso.id); if (L.chumbador) p.push("chumbador " + L.chumbador.id); if (L.aco) p.push("chapa " + L.aco.id);
    return p.length ? '<p class="cbr-mat" data-cbr="materiais">Nas ligações: ' + esc(p.join(" · ")) + ' <button type="button" class="cbr-usar" data-cbr-act="limpar-mat" title="Voltar aos materiais de partida do cálculo (ASTM A325, ASTM F1554 Gr.36, ASTM A36)">voltar ao padrão</button></p>' : '<p class="cbr-mat cbr-sem" data-cbr="materiais">Nas ligações: os materiais de partida do cálculo (ASTM A325, ASTM F1554 Gr.36, ASTM A36).</p>';
  }
  /* as normas citadas, com a edição vigente conferida (data e fonte); só o que foi conferido */
  function normasHtml() {
    var N = C().normas(); if (!N.length) return "";
    return '<details class="cat-sec" data-cbr="normas"><summary>Normas de referência — edição vigente (' + N.length + ")</summary>" +
      '<div class="cbr-tab" style="max-height:36vh"><table class="tbl"><thead><tr><th>Norma</th><th>Edição</th><th>Situação</th><th>Assunto</th><th>Fonte</th></tr></thead><tbody>' +
      N.map(function (n) { return "<tr><td>" + esc(n.norma) + "</td><td>" + esc(n.edicao) + "</td><td>" + esc(limpar(n.situacao)) + "</td><td>" + esc(n.assunto) + "</td><td>" + linkFonte(n.fonte) + "</td></tr>"; }).join("") +
      "</tbody></table></div></details>";
  }
  function corpo() {
    var K = C();
    if (!K) return '<p class="cat-erro">O Catálogo BR não carregou (js/acocatalogobr.js).</p>';
    var fams = K.familias(), grupos = { perfil: "Perfis", chapa: "Chapas", placa: "Placas", apoio: "Apoios", chumbador: "Chumbadores", parafuso: "Parafusos", telha: "Telhas" };
    var selF = '<option value="">Todas (' + fams.reduce(function (s, f) { return s + f.n; }, 0) + ")</option>" + Object.keys(grupos).map(function (g) {
      var fs = fams.filter(function (f) { return f.grupo === g && f.n > 0; }); if (!fs.length) return "";
      return '<optgroup label="' + esc(grupos[g]) + '">' + fs.map(function (f) { return '<option value="' + esc(f.id) + '"' + (f.id === E.familia ? " selected" : "") + ">" + esc(f.nome) + " (" + f.n + ")</option>"; }).join("") + "</optgroup>";
    }).join("");
    var acos = [["", "Todos"]].concat(K.acos().map(function (a) { return [a, a]; })), fabs = [["", "Todos"]].concat(K.fabricantes().map(function (a) { return [a, a]; }));
    return CSS + '<div class="cbr" data-cbr="raiz">' +
      '<p class="cat-nota">Perfis, chapas, placas, chumbadores, parafusos e telhas fabricados ou vendidos no Brasil, cada um com a fonte (catálogo do fabricante com a data de acesso, ou a norma). Consulta — o dimensionamento é do cálculo.</p>' +
      '<div class="cbr-filtros">' +
        '<label>Família <select data-cbr-in="familia">' + selF + "</select></label>" +
        '<label>Buscar <input data-cbr-in="texto" placeholder="w 250, ue 150, cartola, M20, parabolt, tp40" value="' + esc(E.texto) + '" autocomplete="off"></label>' +
        '<label>Aço <select data-cbr-in="aco">' + opcoes(acos, E.aco) + "</select></label>" +
        '<label>Fabricante <select data-cbr-in="fab">' + opcoes(fabs, E.fab) + "</select></label>" +
        '<label>Propriedade <select data-cbr-in="prop">' + opcoes(PROPS, E.prop) + "</select></label>" +
        '<label>mín. <input data-cbr-in="min" inputmode="decimal" value="' + esc(E.min) + '"></label>' +
        '<label>máx. <input data-cbr-in="max" inputmode="decimal" value="' + esc(E.max) + '"></label>' +
      "</div>" +
      '<div data-cbr="lista">' + lista() + "</div>" + textoMateriais() + normasHtml() + "</div>";
  }

  /* ------------------------------------------------ ações */
  function raiz() { return global.document ? global.document.querySelector('[data-cbr="raiz"]') : null; }
  function repintarLista() { var r = raiz(); if (!r) return; var l = r.querySelector('[data-cbr="lista"]'); if (l) l.innerHTML = lista(); }
  function repintarMat() { var r = raiz(); if (!r) return; var m = r.querySelector('[data-cbr="materiais"]'); if (m) m.outerHTML = textoMateriais(); }
  function usar(btn) {
    var K = C(), tipo = btn.getAttribute("data-cbr-usar"), it = K.item(btn.getAttribute("data-cbr-id") || "");
    if (tipo === "criar") {
      var U = global.MetalCriarUI, ferr = btn.getAttribute("data-cbr-ferr"); if (!U || !it) return false;
      U.mudarFerramenta(ferr, "mcrf:cat", it.nome);
      toast("Criar › " + (FERRS.filter(function (f) { return f[0] === ferr; })[0] || [0, ferr])[1] + ": perfil " + it.nome + ".", "ok");
      return true;
    }
    if (tipo === "telha") {
      var ok = global.MetalCalcUI && global.MetalCalcUI.usarTelha ? global.MetalCalcUI.usarTelha(it && it.ref.telha) : false;
      toast(ok ? "Cobertura do galpão: " + it.nome + "." : "Não deu para usar esta telha na cobertura.", ok ? "ok" : "aviso");
      return ok;
    }
    var L = global.MetalLigSugUI; if (!L || !L.materiais) return false;
    if (tipo === "parafuso") {
      var cid = btn.getAttribute("data-cbr-classe"), cl = K.classesParafuso().filter(function (c) { return c.id === cid; })[0];
      if (!cl) return false;
      L.materiais({ parafuso: { id: cl.id, fub: cl.fub } }); toast("Ligações: parafuso " + cl.id + " (fub " + cl.fub + " MPa).", "ok");
    } else if (tipo === "chumbador" || tipo === "aco") {
      var m = { id: btn.getAttribute("data-cbr-aco"), fy: Number(btn.getAttribute("data-cbr-fy")), fu: Number(btn.getAttribute("data-cbr-fu")) }, o = {};
      o[tipo] = m; L.materiais(o); toast("Ligações: " + (tipo === "aco" ? "chapa" : "chumbador") + " " + m.id + " (fy " + m.fy + " / fu " + m.fu + " MPa).", "ok");
    }
    repintarMat();
    return true;
  }
  function ligar(r) {
    r = r || raiz(); if (!r || r.getAttribute("data-cbr-ligado")) return;
    r.setAttribute("data-cbr-ligado", "1");
    var t0 = null;
    function mudou(el) {
      var k = el.getAttribute("data-cbr-in"); if (!k) return;
      E[k] = el.value; E.mostrar = PAGINA; E.aberto = "";
      if (k === "texto" || k === "min" || k === "max") { if (t0) clearTimeout(t0); t0 = setTimeout(repintarLista, 160); }
      else repintarLista();
    }
    r.addEventListener("input", function (ev) { if (ev.target && ev.target.getAttribute("data-cbr-in")) mudou(ev.target); });
    r.addEventListener("change", function (ev) { if (ev.target && ev.target.tagName === "SELECT" && ev.target.getAttribute("data-cbr-in")) mudou(ev.target); });
    r.addEventListener("click", function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest("[data-cbr-usar],[data-cbr-ver],[data-cbr-act]") : null; if (!b) return;
      if (b.hasAttribute("data-cbr-usar")) { usar(b); return; }
      if (b.hasAttribute("data-cbr-ver")) { var id = b.getAttribute("data-cbr-ver"); E.aberto = E.aberto === id ? "" : id; repintarLista(); return; }
      var a = b.getAttribute("data-cbr-act");
      if (a === "mais") { E.mostrar += PAGINA; repintarLista(); }
      else if (a === "limpar-mat" && global.MetalLigSugUI && global.MetalLigSugUI.materiais) { global.MetalLigSugUI.materiais(null); repintarMat(); toast("Ligações: materiais de partida do cálculo.", "info"); }
    });
  }

  var MetalCatalogoBRUI = {
    corpo: corpo, ligar: ligar, estado: function () { return E; },
    /* para a e2e e para outras telas: aplica filtros e redesenha (sem digitar) */
    filtrar: function (f) { Object.keys(f || {}).forEach(function (k) { if (k in E) E[k] = f[k] == null ? "" : String(f[k]); }); E.mostrar = PAGINA; E.aberto = ""; repintarLista(); return C() ? C().itens(filtro()).length : 0; },
    limpar: function () { E.familia = E.texto = E.aco = E.fab = E.prop = E.min = E.max = ""; E.mostrar = PAGINA; E.aberto = ""; }
  };
  global.MetalCatalogoBRUI = MetalCatalogoBRUI;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalCatalogoBRUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
