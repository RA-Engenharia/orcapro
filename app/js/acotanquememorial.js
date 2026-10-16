/* =====================================================================
 * acotanquememorial.js — MEMORIAL DE CÁLCULO DO TANQUE METÁLICO (motor
 * PURO, ES5, sem DOM, Node-testável). Frente T, 14/10/2026.
 *
 *   AcoTanqueMemorial.gerar(r, opcoes) → { ok, html, titulo, secoes, figuras, tabelas, avisos }
 *     r        resultado do AcoTanque.calcular (ok = true)
 *     opcoes   empresa { nome, cnpj, logoDataUrl } · responsavel { nome,
 *              titulo, crea } · obra { nome, endereco, cidade, cliente } ·
 *              revisao · data · art · imagens { perspectiva } (PNG do 3D)
 *
 * O mesmo padrão dos memoriais da Metálica (js/acomemoriallivre.js): capa,
 * sumário, seções numeradas, tabelas com legenda, cada verificação PASSO A
 * PASSO (rótulo, fórmula com os números, valor), as decisões do sistema com
 * o motivo, as cargas na fundação por caso, o quantitativo e os itens NÃO
 * VERIFICADOS ("não verificado: …") e as PENDÊNCIAS de conferência de norma.
 * Registro formal: nada inventado; texto indefinido do motor vira
 * "[valor indefinido]" e é acusado nas conferências. Imprime em A4 (Ctrl+P
 * → PDF), como os outros memoriais.
 * Teste: node tools/test-aco-tanque.js (bloco do memorial)
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  var NB = String.fromCharCode(160), MENOS = "−", indef = [];
  function br(v, c) {
    if (!fin(v)) return "—";
    c = c == null ? 2 : c;
    var s = Math.abs(v).toFixed(c), p = s.split("."), i = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (v < 0 && Number(s) !== 0 ? MENOS : "") + i + (c ? "," + p[1] : "");
  }
  function un(v, c, u) { return br(v, c) + NB + u; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  /* AJUSTE DA GERENTE (14/10/2026): o símbolo de PERFIL vai com índice no HTML do memorial — t<sub>f</sub>, t<sub>w</sub>,
     b<sub>f</sub>, h<sub>w</sub> e afins (b<sub>w</sub>, t<sub>fs</sub>, b<sub>fi</sub>…): na aba de unidades (kgf/tf) "tf" é
     tonelada-força e "Ff = M/(d − tf) = 4,06 tf" ficava ambíguo. SÓ no HTML do memorial: o dado do motor (a fórmula em
     texto) não muda — a tela, a prancha e o DXF continuam com "tf" sem tag. Recebe texto JÁ escapado. */
  var RE_IX = /(^|[^A-Za-z_\u00C0-\u024F])([tbh])([fw])(s|i|1|2)?(?![A-Za-z0-9_\u00C0-\u024F])/g;
  function ix(h) { return String(h == null ? "" : h).replace(RE_IX, function (m0, a, l, s, k) { return a + l + "<sub>" + s + (k || "") + "</sub>"; }); }
  function t(s, onde) { var x = String(s == null ? "" : s); if (/\b(undefined|NaN|null|Infinity)\b/.test(x)) { indef.push((onde || "texto") + ": " + x.slice(0, 120)); x = x.replace(/\b(undefined|NaN|null|Infinity)\b/g, "[valor indefinido]"); } return esc(x); }
  function ph(v, rot) { var s = v == null ? "" : String(v).trim(); return s ? esc(s) : '<span class="ph">[' + esc(rot) + "]</span>"; }
  function tabela(cab, linhas, o) {
    o = o || {};
    return '<table class="t' + (o.cls ? " " + o.cls : "") + '">' + (o.legenda ? "<caption>" + o.legenda + "</caption>" : "") + "<thead><tr>" + cab.map(function (c) { var n = typeof c === "object"; return "<th" + (n && c.n ? ' class="n"' : "") + ">" + (n ? c.t : c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      linhas.map(function (l) { var cel = l.c || l; return "<tr" + (l.cls ? ' class="' + l.cls + '"' : "") + ">" + cel.map(function (x, k) { var c0 = cab[k], n = typeof c0 === "object" && c0.n; return "<td" + (n ? ' class="n"' : "") + ">" + (x == null ? "" : x) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>";
  }
  function caixa(h, alerta) { return '<div class="caixa' + (alerta ? " alerta" : "") + '">' + h + "</div>"; }
  function sit(v) { return v.info ? '<span class="info">informativo</span>' : (v.ok ? '<span class="ok">atende</span>' : '<span class="falha">não atende</span>'); }
  function dataTxt(d) { var z = function (n) { return (n < 10 ? "0" : "") + n; }; if (d instanceof Date) return z(d.getDate()) + "/" + z(d.getMonth() + 1) + "/" + d.getFullYear(); if (d) return String(d); var x = new Date(); return z(x.getDate()) + "/" + z(x.getMonth() + 1) + "/" + x.getFullYear(); }
  var TIPO = { vertical: "Tanque vertical cilíndrico de fundo plano", horizontal: "Tanque horizontal cilíndrico sobre selas", elevado: "Reservatório elevado sobre torre metálica" };

  function gerar(r, opcoes) {
    indef = [];
    opcoes = opcoes || {};
    if (!r || !r.ok || !r.par || !r.quantitativo) return { ok: false, motivo: "O memorial sai de um cálculo de tanque que fechou." };
    var p = r.par, g = obj(r.geometria), q = obj(r.quantitativo), ob = obj(opcoes.obra), em = obj(opcoes.empresa), rp = obj(opcoes.responsavel), img = obj(opcoes.imagens), rev = opcoes.revisao || "R00", data = dataTxt(opcoes.data);
    var obraNome = ob.nome || "Obra", avisos = [], secs = [], nFig = 0, nTab = 0, MT = dep("MetalTanque", "./metaltanque.js"), ISO = dep("AcoIsopletas", "./acoisopletas.js");
    function fig(h, lg) { nFig++; return '<figure class="fig">' + h + "<figcaption>Figura " + nFig + " — " + lg + "</figcaption></figure>"; }
    function leg(t0) { nTab++; return "Tabela " + nTab + " — " + t0; }
    function sec(id, titulo, corpo) { secs.push({ id: id, titulo: titulo, html: corpo }); }
    var nomeT = p.nome || TIPO[p.tipo], dims = p.tipo === "horizontal" ? "Ø " + un(g.D, 2, "m") + " × " + un(g.L, 2, "m") : "Ø " + un(g.D, 2, "m") + " × " + un(g.H, 2, "m") + (p.tipo === "elevado" ? " sobre torre de " + un(p.alturaTorre, 1, "m") : "");
    var esquema = MT && MT.esquema ? MT.esquema(r) : "";
    var situacao = r.aprovado ? '<span class="ok">aprovado — todas as verificações feitas atendem</span>' : (r.situacaoTexto ? '<span class="falha">' + esc(r.situacaoTexto) + "</span>" : '<span class="falha">NÃO APROVADO — ' + (r.falhas + arr(r.problemas).length) + " pendência(s) de cálculo</span>");   /* 1.2.149 */

    /* 1. objeto */
    sec("objeto", "Objeto, escopo e premissas",
      "<p>Este memorial apresenta o cálculo do " + esc(TIPO[p.tipo].toLowerCase()) + (p.nome ? " <b>" + esc(p.nome) + "</b>" : "") + " (" + esc(dims) + "), para armazenamento atmosférico de <b>" + esc(r.produto.nome.toLowerCase()) + "</b> (densidade relativa G = " + br(r.produto.G, 2) + "). " +
      (p.tipo === "horizontal" ? "O costado é dimensionado pela tensão circunferencial do líquido com o tanque cheio, os tampos planos pela flexão de placa e as selas pelo método de Zick; o vento pela NBR 6123 a partir do endereço da obra (tombamento transversal com o tanque vazio); as cargas por sela para a fundação; e os meios de acesso pela NR-12 (Anexo III).</p>"
        : "O costado é dimensionado anel por anel pelo método de um pé da API 650 (condição de projeto com o produto e a corrosão, e condição de teste hidrostático com água), com a espessura mínima construtiva por diâmetro e o limite de espessura do aço; o fundo, o teto, a junção teto-costado e as aberturas pela mesma norma; o vento pela NBR 6123 a partir do endereço da obra; a estabilidade ao tombamento e ao deslizamento, a ancoragem e as cargas na fundação" + (p.tipo === "elevado" ? "; o fundo da cuba sobre a grelha e a torre (pórtico espacial)" : "") + "; e os meios de acesso pela NR-12 (Anexo III).</p>") +
      "<p>Unidades: m, mm, kN, kN·m, kPa e MPa. Os esforços na fundação são <b>característicos</b>, por caso, para o projeto de fundação. O que o cálculo não cobre está listado na seção de itens não verificados — nenhum item é dado como atendido sem verificação.</p>" +
      tabela(["Item", "Valor"], [
        ["Tipo", esc(TIPO[p.tipo])], ["Produto", esc(r.produto.nome) + " — G = " + br(r.produto.G, 2) + (r.produto.inflamavel ? " (inflamável)" : (r.produto.combustivel ? " (combustível)" : ""))],
        ["Dimensões", esc(dims) + (g.HD ? " — H/D = " + br(g.HD, 2) : "")], ["Volume nominal / útil", un(q.volumeNominal, 1, "m³") + " / " + un(q.volumeUtil, 1, "m³")],
        ["Aço do costado", esc(p.aco) + " (fy = " + br(r.aco.fy, 0) + " MPa, fu = " + br(r.aco.fu, 0) + " MPa)"], ["Sobreespessura de corrosão", "costado " + un(p.CA, 1, "mm") + (p.CAfundo != null ? ", fundo " + un(p.CAfundo, 1, "mm") : "") + (p.CAteto != null ? ", teto " + un(p.CAteto, 1, "mm") : "")],
        ["Peso de aço", un(q.pesos.total, 0, "kg")], ["Situação", situacao]
      ], { legenda: leg("Resumo do tanque") }) +
      (img.perspectiva ? fig('<img src="' + esc(img.perspectiva) + '" alt="Perspectiva">', "Perspectiva do tanque no modelo") : (esquema ? fig(esquema, "Esquema do tanque: anéis do costado (espessura em mm), teto, anéis de contraventamento, nível de projeto e planta") : "")));

    /* 2. normas */
    var ns = arr(r.normas).map(function (n) { return [esc(n.id), esc(n.titulo), esc(n.edicao), esc(n.usada) + (n.conferir ? ' <span class="ph">(conferir)</span>' : "")]; });
    sec("normas", "Normas e edições", tabela(["Norma", "Título", "Edição vigente", "Edição / uso neste cálculo"], ns, { legenda: leg("Normas aplicadas") }) +
      '<p class="nota">As fórmulas da API 650 foram conferidas no texto oficial da 11ª edição (2007, com o adendo 3 de 2011), público por estar incorporado ao 49 CFR 195 dos EUA; a edição vigente é a 14ª (2025) — cada item marcado "conferir" deve ser confirmado nela. A NBR 6123 usada é o texto de 1988 da biblioteca técnica (o mapa de isopletas é o mesmo na edição de 2023).</p>' +
      (r.produto && (p.produto === "agua" || p.produto === "agua-potavel") ? '<p class="nota">Tanque de água: no Brasil não há norma específica de tanque metálico para água; os fabricantes usam a API 650 (inteira ou em parte) ou a AWWA D100. Este cálculo segue a API 650, com a AWWA D100 como referência.</p>' : "") +
      (arr(r.normas).some(function (n) { return n.id === "NR-13"; }) ? '<p class="nota">NR-13 (texto atualizado 2023): tanque metálico de armazenamento de fluido inflamável ou combustível com Ø externo acima de 3 m e mais de 20.000 L está no escopo da norma desde 04/07/2026 (Portaria MTP 1.846/2022) — inspeção inicial, periódica e pós-construção (a NR cita a API 653) são obrigações do proprietário.</p>' : ""));

    /* 3. materiais */
    var ad = r.costado && r.costado.Sd ? r.costado : null;
    sec("materiais", "Produto e materiais",
      tabela(["Material", { t: "fy (MPa)", n: 1 }, { t: "fu (MPa)", n: 1 }, { t: "Sd (MPa)", n: 1 }, { t: "St (MPa)", n: 1 }, "Fonte"], [[esc(p.aco), br(r.aco.fy, 0), br(r.aco.fu, 0), ad ? br(ad.Sd, 1) : "—", ad && ad.St ? br(ad.St, 1) : "—", esc(r.aco.fonte)]], { legenda: leg("Aço do costado e tensões admissíveis (API 650, 5.6.2: Sd = mín(2/3·fy; 2/5·fu), St = mín(3/4·fy; 3/7·fu))") }) +
      "<p>Peso específico do aço 78,5 kN/m³ (7.850 kg/m³). Água: 9,81 kN/m³; produto: 9,81·G kN/m³. Chapas em espessuras comerciais (" + esc(arr(dep("AcoTanque", "./acotanque.js") ? dep("AcoTanque", "./acotanque.js").espessuras() : []).map(function (x) { return br(x, x % 1 ? 2 : 0); }).join("; ")) + " mm — conferir com o fornecedor).</p>" +
      (r.produto.inflamavel || r.produto.combustivel ? caixa("<b>Produto " + (r.produto.inflamavel ? "inflamável" : "combustível") + ":</b> o arranjo, as distâncias, a bacia de contenção, o respiro de emergência e o aterramento seguem a ABNT NBR 17505 e a NR-20 — não verificados neste memorial.", true) : ""));

    /* 4. geometria e costado */
    if (p.tipo !== "horizontal") {
      var la = arr(r.costado.aneis).map(function (a) { return [String(a.i), br(a.largura, 3), br(a.z0, 3), br(a.Hl, 3), br(a.td, 2), br(a.tt, 2), br(a.tmin, 1), "<b>" + br(a.t, 2) + "</b>", esc(a.governa), br(a.massa, 0)]; });
      sec("geometria", "Geometria e costado",
        tabela(["Item", "Valor"], [["Diâmetro nominal (linha média do 1º anel)", un(g.D, 3, "m")], ["Altura do costado", un(g.H, 3, "m") + " (" + r.costado.n + " anéis de chapa de " + un(p.larguraChapa, 2, "m") + ")"], ["Nível de projeto do líquido", un(g.nivel, 3, "m") + " (borda livre " + un(p.bordaLivre, 2, "m") + ")"], ["Fundo morto (até a saída)", un(p.hMorto, 2, "m")], ["Teto", esc(r.teto.rotulo) + (r.teto.flecha ? " — flecha " + un(r.teto.flecha, 3, "m") : "")]], { legenda: leg("Geometria") }) +
        tabela(["Anel", { t: "Largura (m)", n: 1 }, { t: "Cota do pé (m)", n: 1 }, { t: "H líquido (m)", n: 1 }, { t: "td (mm)", n: 1 }, { t: "tt (mm)", n: 1 }, { t: "tmín (mm)", n: 1 }, { t: "t adotada (mm)", n: 1 }, "Governa", { t: "Massa (kg)", n: 1 }], la, { legenda: leg("Costado anel por anel — método de um pé (API 650, 5.6.3.2)"), cls: "compacta" }) +
        "<p>Fundo: chapa de " + un(r.fundo.t, 1, "mm") + " (" + esc(r.fundo.ref) + "); " + (r.fundo.anular ? "anel anular de " + un(r.fundo.anular.t, 1, "mm") + " com largura de " + un(r.fundo.anular.largura * 1000, 0, "mm") : "sem anel anular") + "; inclinação " + esc(r.fundo.inclinacao) + ". Cantoneira de topo " + esc(r.teto.cantoneira.nome) + ".</p>");
    } else {
      sec("geometria", "Geometria e costado", tabela(["Item", "Valor"], [["Diâmetro", un(g.D, 3, "m")], ["Comprimento do costado", un(g.L, 3, "m")], ["Costado", un(r.costado.aneis[0].t, 1, "mm")], ["Tampos planos", un(r.costado.tampo, 1, "mm")], ["Selas", r.selas.n + " de " + r.selas.angulo + "°, largura " + un(r.selas.b, 2, "m") + ", a " + un(r.selas.A, 3, "m") + " dos tampos; carga por sela " + un(r.selas.Q, 1, "kN")]], { legenda: leg("Geometria") }));
    }

    /* 5. vento */
    var v = obj(r.vento), vt = obj(v.tanque), mapa = "";
    if (ISO && ISO.svgMapa && fin(v.lat) && fin(v.lon)) { try { mapa = ISO.svgMapa(v.lat, v.lon, { zoomKm: 600 }); } catch (e) { mapa = ""; } }
    sec("vento", "Ação do vento (NBR 6123)",
      "<p>" + t(v.v0Info && v.v0Info.texto ? v.v0Info.texto : "V0 = " + br(v.v0, 0) + " m/s.", "V0") + "</p>" +
      '<p class="nota">Edição: a NBR 6123 vigente é a de 2023 (versão corrigida 2025), mas a biblioteca técnica só tem o texto de 1988 — os fatores S1, S2 e S3 e o coeficiente de arrasto do cilindro (Tabela 10) usados aqui são os da edição de 1988 (o mapa de isopletas é o mesmo nas duas). Conferir na edição de 2023.</p>' +
      (mapa ? fig(mapa, "Mapa de isopletas da NBR 6123 com a posição da obra") : "") +
      tabela(["Parâmetro", "Valor", "Referência"], [
        ["V0", un(v.v0, 1, "m/s"), "NBR 6123, 5.1 e Figura 1"], ["S1 (topografia)", br(v.s1, 3), t(v.s1Texto || "5.2", "S1")], ["S2 (rugosidade e altura)", "categoria " + esc(v.categoria) + ", classe " + esc(v.classe), "5.3 e Tabela 1"], ["S3 (estatístico)", br(v.S3, 2), "5.4 e Tabela 3"],
        ["Vk no topo", un(vt.vkTopo, 2, "m/s"), "4.2"], ["Ca (cilindro)", br(vt.Ca && vt.Ca.Ca, 2) + " — " + t(vt.Ca && vt.Ca.texto, "Ca"), "6.3 e Tabela 10"], ["Força horizontal total", un(vt.F, 1, "kN"), "6.3.6"], p.tipo === "horizontal" ? ["Momento de tombamento transversal", un(vt.Mw, 1, "kN·m"), "Fa × altura do eixo (tanque vazio)"] : ["Momento na base do costado", un(vt.Mw, 1, "kN·m"), "inclui a sucção no teto (API 650, 5.2.1-k)"]
      ], { legenda: leg("Vento") }));

    /* 6. verificações */
    var vh = arr(r.verificacoes).map(function (x, i) {
      return "<h3>" + (i + 1) + ". " + ix(t(x.nome, "verificação")) + " — " + sit(x) + "</h3><p class=\"nota\">" + ix(t(x.item, "item")) + (x.conferir ? ' <span class="ph">(conferir na edição vigente)</span>' : "") + "</p>" +
        tabela(["Passo", "Fórmula / critério", "Valor"], arr(x.passos).map(function (s) { return [ix(t(s.rotulo, x.nome)), '<span class="eq">' + ix(t(s.formula, x.nome)) + "</span>", "<b>" + ix(t(s.valor, x.nome)) + "</b>"]; }), { cls: "compacta" }) +
        (fin(x.razao) && !x.info ? '<p class="nota">Razão solicitante/resistente = ' + br(x.razao, 3) + "</p>" : "");
    }).join("");
    var nOk = arr(r.verificacoes).filter(function (x) { return x.ok && !x.info; }).length, nF = arr(r.verificacoes).filter(function (x) { return !x.ok && !x.info; }).length;
    sec("verificacoes", "Verificações passo a passo", "<p>" + nOk + " verificação(ões) atendem" + (nF ? ", <span class=\"falha\">" + nF + " não atende(m)</span>" : "") + ". Razão máxima " + br(r.razao, 3) + (r.governante ? " (" + t(r.governante, "governante") + ")" : "") + ".</p>" + vh +
      (arr(r.problemas).length ? caixa("<b>Problemas e soluções propostas:</b><ul>" + r.problemas.map(function (x) { return "<li>" + t(x.texto, "problema") + " → " + arr(x.solucoes).map(function (s) { return t(s.texto, "solução"); }).join("; ") + "</li>"; }).join("") + "</ul>", true) : ""));

    /* 7. estabilidade */
    if (r.estabilidade) {
      var es = r.estabilidade, ch = es.chumbadores;
      sec("estabilidade", "Estabilidade e ancoragem", tabela(["Item", "Valor"], [["MDL (costado)", un(es.MDL, 1, "kN·m")], ["MDLR (teto)", un(es.MDLR, 1, "kN·m")], ["MF (líquido)", un(es.MF, 1, "kN·m")], ["Mw (vento)", un(es.Mw, 1, "kN·m")],
        ["Critério 1 / 2 (API 650, 5.11.2)", (es.criterio1 ? "atende" : "não atende") + " / " + (es.criterio2 ? "atende" : "não atende")], ["Deslizamento (atrito 0,40)", es.deslizamento ? "atende" : "não atende"],
        ["Ancoragem", ch ? ch.n + " chumbadores " + esc(ch.nome) + " (" + esc(ch.aco) + ") no círculo de " + un(ch.dc, 2, "m") + " — tração " + un(ch.tB, 1, "kN") + " por chumbador" : "não necessária"]], { legenda: leg("Estabilidade ao vento") }));
    }
    if (r.torre) {
      var tw = r.torre;
      sec("torre", "Torre do reservatório elevado", tabela(["Item", "Valor"], [["Pilares", tw.pilares + " × " + esc(tw.pilar) + " (raio no topo " + un(tw.raioTopo, 2, "m") + ", na base " + un(tw.raioBase, 2, "m") + ")"], ["Painéis", tw.paineis + " de " + un(tw.hPainel, 2, "m") + " com diagonais " + esc(tw.diagonal) + " em X"], ["Grelha do fundo", esc(tw.viga)],
        ["Peso total na torre (água + aço)", un(tw.Wtotal, 1, "kN")], ["Momento do vento na base", un(tw.M, 1, "kN·m")], ["Pilar mais carregado / arrancamento", un(tw.Nmax, 1, "kN") + " / " + un(tw.Nmin, 1, "kN")]], { legenda: leg("Torre (equilíbrio de painel)") }));
    }

    /* 8. fundação */
    var fu = obj(r.fundacao), lf = [];
    if (fu.G && fu.G.linha != null) lf.push(["G — peso próprio", un(fu.G.linha, 2, "kN/m") + " no anel; fundo " + un(fu.G.fundo, 3, "kPa") + (fu.G.colunaCentral ? "; coluna central " + un(fu.G.colunaCentral, 1, "kN") : ""), un(fu.G.total, 1, "kN")]);
    else if (fu.G) lf.push(["G — peso próprio", "", un(fu.G.total, 1, "kN")]);
    if (fu.L) lf.push(["L — líquido de projeto", fu.L.pressao != null ? un(fu.L.pressao, 2, "kPa") + " sobre o fundo" : "", un(fu.L.total, 1, "kN")]);
    if (fu.T) lf.push(["T — teste hidrostático", un(fu.T.pressao, 2, "kPa") + " sobre o fundo", un(fu.T.total, 1, "kN")]);
    if (fu.W) lf.push(["W — vento", "M = " + un(fu.W.M, 1, "kN·m") + ", V = " + un(fu.W.V, 1, "kN") + (fu.W.linhaMax != null ? "; ±" + un(fu.W.linhaMax, 2, "kN/m") + " no anel" : ""), ""]);
    if (fu.chumbadores) lf.push(["Chumbadores", fu.chumbadores.n + " no círculo de " + un(fu.chumbadores.dc, 2, "m") + "; tração " + un(fu.chumbadores.tracao, 1, "kN") + ", cortante " + un(fu.chumbadores.cortante, 1, "kN") + " por chumbador", ""]);
    if (fu.porPilar) lf.push(["Por pilar (pior)", "compressão " + un(fu.porPilar.compressao, 1, "kN") + "; tração " + un(fu.porPilar.tracao, 1, "kN") + "; cortante " + un(fu.porPilar.cortante, 1, "kN"), ""]);
    if (fu.porSela) lf.push(["Por sela", "vertical " + un(fu.porSela.vertical, 1, "kN") + "; horizontal (vento) " + un(fu.porSela.horizontalVento, 1, "kN"), ""]);
    sec("fundacao", "Cargas na fundação", tabela(["Caso", "Distribuição", { t: "Total", n: 1 }], lf, { legenda: leg("Cargas características por caso — base " + esc(fu.tipo || "")) }) + "<p>" + t(fu.nota, "fundação") + "</p>");

    /* 9. acessórios */
    var ac = obj(r.acessorios);
    sec("acessorios", "Acessórios e meios de acesso", tabela(["Acessório", { t: "Massa (kg)", n: 1 }, { t: "Pintura (m²)", n: 1 }], arr(ac.itens).map(function (x) { return [t(x.nome, "acessório"), br(x.massa, 1), br(x.area, 1)]; }), { legenda: leg("Acessórios gerados com o tanque") }) +
      "<p>Meios de acesso pela NR-12, Anexo III: guarda-corpo com travessão superior de 1,10 m, intermediário a 0,70 m e rodapé de 0,20 m (item 7); escada de marinheiro com gaiola acima de 3,50 m, a partir de 2,00 m do piso, degraus a 0,30 m, largura 0,45 m (itens 13 e 13.1); escada de degraus sem espelho com 600 ≤ g + 2h ≤ 660 mm e plataforma de descanso a cada 3,00 m (item 11). A NR-12 é adotada por analogia (item 1.2), a favor da segurança.</p>" +
      tabela(["Bocal", "DN", "Posição"], arr(ac.bocais).map(function (b) { return [esc(b.nome), String(b.dn), b.onde === "teto" ? "teto" : "costado, cota " + un(num(b.cota, 0), 2, "m")]; }), { legenda: leg("Bocais (diâmetros de partida — o processo define a vazão)") }));

    /* 9b. aberturas e fabricação (API 650, 5.7 / 5.8 / 5.1.5.2) */
    var abL = arr(r.aberturas && r.aberturas.lista), plc = q.planoChapas, msd = q.mapaSoldas;
    if (abL.length || plc) {
      sec("fabricacao", "Aberturas, plano de chapas e soldas",
        (abL.length ? tabela(["Abertura", "DN / NPS", "Posição", "Furo (mm)", "Chapa de reforço", { t: "A exigida (mm²)", n: 1 }, { t: "A disponível (mm²)", n: 1 }, "Situação"], abL.map(function (a) {
          return [esc(a.nome), String(a.dn) + " / " + a.nps, a.onde === "teto" ? "teto" : "anel " + a.anel + ", " + un(a.cota, 3, "m") + ", " + br(a.ang, 0) + "°", br(a.furo, 0), a.reforco ? "Ø " + br(a.reforco.Do, 0) + " × " + br(a.reforco.t, 1) + " mm, filete " + a.reforco.solda + " mm" : "não precisa", a.Areq ? br(a.Areq, 0) : "—", a.Adisp ? br(a.Adisp, 0) : "—", a.ok ? '<span class="ok">atende</span>' : '<span class="falha">não atende</span>'];
        }), { legenda: leg("Aberturas: reforço (API 650, 5.7.2; teto 5.8 e Tabelas 5-13a/5-14a) e afastamentos (5.7.3) — o cálculo de cada uma está nas verificações"), cls: "compacta" }) : "") +
        (plc ? tabela(["Anel", { t: "t (mm)", n: 1 }, { t: "Chapas", n: 1 }, { t: "Comprimento (mm)", n: 1 }, { t: "Sobra por chapa (mm)", n: 1 }, { t: "Defasagem (°)", n: 1 }], plc.aneis.map(function (a) { return [String(a.i), br(a.t, 1), String(a.n), br(a.comprimento * 1000, 0), br(a.sobra * 1000, 0), br(a.defasagem, 2)]; }), { legenda: leg("Plano de chapas do costado — chapas de " + br(plc.comprimentoComercial * 1000, 0) + " mm (" + esc(plc.fonte) + "); juntas verticais defasadas ≥ 5·t (API 650, 5.1.5.2-b)") }) : "") +
        (msd ? tabela(["Tipo de junta", { t: "Comprimento (m)", n: 1 }, "Onde"], msd.tipos.map(function (x) { return [esc(x.tipo), br(x.m, 1), t(x.itens.slice(0, 4).join("; ") + (x.itens.length > 4 ? "…" : ""), "solda")]; }).concat([{ c: ["Total", br(msd.total, 1), ""], cls: "tot" }]), { legenda: leg("Mapa de soldas (comprimento por tipo de junta — estimativa pela geometria)") }) : ""));
    }

    /* 10. quantitativo */
    var pz = obj(q.pesos), lp = Object.keys(pz).filter(function (k) { return k !== "total" && fin(pz[k]) && pz[k] > 0; }).map(function (k) { return [esc({ costado: "Costado", fundo: "Fundo", teto: "Teto (chapas)", estruturaTeto: "Estrutura do teto", cantoneira: "Cantoneira de topo", aneisVento: "Anéis de contraventamento", acessorios: "Acessórios", chumbadores: "Chumbadores", torre: "Torre e grelha", tampos: "Tampos", selas: "Selas", reforcos: "Chapas de reforço" }[k] || k), br(pz[k], 1)]; });
    lp.push({ c: ["Total", br(pz.total, 1)], cls: "tot" });
    sec("quantitativo", "Quantitativo",
      tabela(["Parte", { t: "Peso (kg)", n: 1 }], lp, { legenda: leg("Pesos" + (q.pesosFonte ? " — das " + q.pesosFonte + ": o mesmo peso do quantitativo do BIM" : "")) }) +
      tabela(["Item", { t: "t (mm)", n: 1 }, "Chapa (m)", { t: "Qtd.", n: 1 }, { t: "Massa (kg)", n: 1 }, "Obs."], arr(q.chapas).map(function (c) { return [t(c.item, "chapa"), br(c.t, 2), br(c.L, 2) + " × " + br(c.B, 2), String(c.qtd), br(c.massa, 1), t(c.obs, "chapa")]; }), { legenda: leg("Lista de chapas"), cls: "compacta" }) +
      tabela(["Solda", { t: "Comprimento (m)", n: 1 }], arr(q.solda).map(function (s) { return [t(s.item, "solda"), br(s.m, 1)]; }).concat([{ c: ["Total", br(q.soldaTotal, 1)], cls: "tot" }]), { legenda: leg("Comprimento de solda (estimativa pela geometria)") }) +
      tabela(["Pintura", { t: "Área (m²)", n: 1 }], arr(q.pintura).map(function (s) { return [t(s.item, "pintura"), br(s.m2, 1)]; }), { legenda: leg("Áreas de pintura — interna " + br(q.pinturaInterna, 1) + " m², externa " + br(q.pinturaExterna, 1) + " m²") }) +
      "<p>Volume nominal " + un(q.volumeNominal, 2, "m³") + "; volume útil " + un(q.volumeUtil, 2, "m³") + ".</p>" +
      (q.sistemaPintura ? '<p class="nota">Sistema de pintura externa de partida (catálogo industrial): ' + t(q.sistemaPintura.id, "pintura") + (q.sistemaPintura.eps ? ", espessura seca total " + br(q.sistemaPintura.eps, 0) + " µm" : "") + " — ambiente " + t(q.sistemaPintura.ambiente, "pintura") + ".</p>" : ""));

    /* 11. decisões */
    sec("decisoes", "Decisões do sistema", tabela(["Tema", "Decisão", "Motivo"], arr(r.decisoes).map(function (d) { return [t(d.tema, "decisão"), t(d.decisao, "decisão"), t(d.motivo, "decisão")]; }), { legenda: leg("O que o sistema decidiu e por quê"), cls: "decisoes" }));

    /* 12. não verificado, avisos, pendências */
    sec("pendencias", "Itens não verificados, avisos e pendências de norma",
      "<h3>Não verificado neste cálculo</h3><ul>" + arr(r.naoVerificado).map(function (x) { return "<li>não verificado: " + t(x, "não verificado") + "</li>"; }).join("") + "</ul>" +
      "<h3>Avisos</h3>" + (arr(r.avisos).length ? "<ul>" + r.avisos.map(function (x) { return "<li>" + t(x, "aviso") + "</li>"; }).join("") + "</ul>" : "<p>Nenhum.</p>") +
      "<h3>Itens de norma a conferir na edição vigente</h3><ul>" + arr(r.pendencias).map(function (x) { return "<li>" + t(x, "pendência") + "</li>"; }).join("") + "</ul>" +
      "<h3>Conferências internas</h3>@@CONF@@");
    sec("termo", "Responsabilidade técnica", "<p>Este memorial é parte do projeto do tanque e vale com a ART do responsável técnico. As premissas (produto, densidade, corrosão, nível de projeto, endereço e terreno para o vento) são do projeto e devem ser confirmadas.</p>" +
      '<div class="assin"><div class="linha"></div><div>' + ph(rp.nome, "NOME DO RESPONSÁVEL TÉCNICO") + "</div><div>" + ph(rp.titulo, "TÍTULO PROFISSIONAL") + " — CREA " + ph(rp.crea, "Nº DO CREA") + "</div><div>ART " + ph(opcoes.art, "Nº DA ART") + "</div></div>");

    /* conferências */
    var somaCh = 0; arr(q.chapas).filter(function (c) { return /^Costado/.test(c.item); }).forEach(function (c) { somaCh += c.massa; });
    if (p.tipo !== "horizontal" && pz.costado && Math.abs(somaCh - pz.costado) > Math.max(1, pz.costado * 0.005)) avisos.push("Peso das chapas do costado (" + br(somaCh, 1) + " kg) diferente do peso do costado (" + br(pz.costado, 1) + " kg).");
    indef.forEach(function (x) { avisos.push("Texto do motor com valor indefinido — " + x); });
    var corpo = secs.map(function (s, i) { return '<section class="sec" id="sec-' + s.id + '"><h2><span class="num">' + (i + 1) + "</span>" + esc(s.titulo) + "</h2>" + s.html + "</section>"; }).join("");
    corpo = corpo.replace("@@CONF@@", avisos.length ? caixa("<b>Divergências:</b><ul>" + avisos.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>", true) : caixa("Todas as conferências passaram: lista de chapas × peso do costado e textos do cálculo."));
    var titulo = "Memorial de cálculo — " + nomeT + " — " + obraNome;
    var capa = '<section class="capa"><div class="capa-topo">' + (em.logoDataUrl && /^data:image\//.test(em.logoDataUrl) ? '<img class="logo" src="' + esc(em.logoDataUrl) + '" alt="Logotipo">' : ph("", "LOGOTIPO")) + '<div class="emp"><b>' + ph(em.nome, "EMPRESA") + "</b>" + (em.cnpj ? "<br>CNPJ " + esc(em.cnpj) : "") + "</div></div>" +
      '<div class="faixa"></div><div class="sobre">MEMORIAL DE CÁLCULO</div><h1>' + esc(nomeT) + '</h1><div class="obra">' + esc(obraNome) + "</div>" + (ob.endereco || ob.cidade ? '<div class="end">' + esc([ob.endereco, ob.cidade].filter(Boolean).join(" — ")) + "</div>" : "") +
      '<div class="arte">' + (img.perspectiva ? '<img src="' + esc(img.perspectiva) + '" alt="Perspectiva">' : esquema) + "</div>" +
      tabela(["Item", ""], [["Cliente", ph(ob.cliente, "CLIENTE")], ["Tanque", esc(dims) + " — " + un(q.volumeUtil, 1, "m³") + " úteis de " + esc(r.produto.nome.toLowerCase())], ["Situação", situacao],
        ["Responsável técnico", ph(rp.nome, "NOME DO RESPONSÁVEL TÉCNICO") + " — CREA " + ph(rp.crea, "Nº DO CREA")], ["Revisão / data", esc(rev) + " — " + esc(data)]]) + "</section>";
    var sum = '<section class="sum"><h2>Sumário</h2><ol>' + secs.map(function (s, i) { return '<li><a href="#sec-' + s.id + '">' + (i + 1) + ". " + esc(s.titulo) + "</a></li>"; }).join("") + "</ol></section>";
    var html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="generator" content="OrçaPRO — AcoTanqueMemorial"><title>' + esc(titulo) + "</title><style>" + CSS(obraNome, rev, em, rp, nomeT) + "</style></head><body>" + capa + sum + corpo + "</body></html>";
    return { ok: true, html: html, titulo: titulo, secoes: secs.map(function (s, i) { return { id: s.id, numero: i + 1, titulo: s.titulo }; }), figuras: nFig, tabelas: nTab, avisos: avisos };
  }
  function cssStr(s) { return '"' + String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ").replace(/</g, "\\3c ") + '"'; }
  function CSS(obra, rev, em, rp, nomeT) {
    var mb = "font: 7.5pt 'Segoe UI', Helvetica, Arial, sans-serif; color: #5b6774;";
    return "@page { size: A4; margin: 20mm 15mm 18mm 20mm; @top-left { content: " + cssStr(obra) + "; " + mb + " } @top-right { content: " + cssStr("Memorial de cálculo — " + nomeT + " — " + rev) + "; " + mb + " }" +
      " @bottom-left { content: " + cssStr((em.nome || "") + (rp.nome ? " — Resp. técnico: " + rp.nome : "")) + "; " + mb + " } @bottom-right { content: \"Página \" counter(page) \" de \" counter(pages); " + mb + " } }" +
      "@page :first { @top-left { content: none; } @top-right { content: none; } @bottom-left { content: none; } @bottom-right { content: none; } }" +
      "html { -webkit-print-color-adjust: exact; print-color-adjust: exact; } body { font: 9.4pt/1.42 'Segoe UI', Helvetica, Arial, sans-serif; color: #1d2733; background: #ffffff; margin: 0; }" +
      "@media screen { body { max-width: 182mm; margin: 10mm auto; padding: 0 10mm; } .sec, .sum { border-top: 1px dashed #c9d2dc; margin-top: 10mm; padding-top: 6mm; } }" +
      "h1 { font-size: 22pt; font-weight: 600; margin: 1mm 0 2mm; } h2 { font-size: 14pt; font-weight: 600; margin: 0 0 4mm; padding-bottom: 1.6mm; border-bottom: 1.4pt solid #2d6a9c; break-after: avoid; } h2 .num { color: #2d6a9c; margin-right: 3mm; }" +
      "h3 { font-size: 10.4pt; font-weight: 600; margin: 5mm 0 1.5mm; break-after: avoid; } p { margin: 0 0 2.2mm; text-align: justify; } ul { margin: 0 0 2.4mm; padding-left: 5mm; } li { margin-bottom: 0.8mm; } .sec { break-before: page; }" +
      "table.t { width: 100%; border-collapse: collapse; margin: 1.5mm 0 4mm; font-size: 8pt; line-height: 1.32; font-variant-numeric: tabular-nums; } table.t caption { caption-side: top; text-align: left; font-size: 8.2pt; padding-bottom: 1.2mm; }" +
      "table.t th { background: #e8eef4; font-weight: 600; text-align: left; border: 0.5pt solid #b8c4d0; padding: 1.1mm 1.4mm; vertical-align: bottom; } table.t td { border: 0.5pt solid #ccd5de; padding: 0.9mm 1.4mm; vertical-align: top; overflow-wrap: break-word; }" +
      "table.t tbody tr:nth-child(even) td { background: #f6f8fa; } table.t tr.tot td { background: #eef3f8; border-top: 0.9pt solid #8a97a6; font-weight: 600; } table.t th.n, table.t td.n { text-align: right; white-space: nowrap; } table.compacta { font-size: 7.4pt; }" +
      "table.decisoes td:first-child { width: 16%; font-weight: 600; } thead { display: table-header-group; } tr { break-inside: avoid; }" +
      ".eq { font-family: 'Cambria Math', Cambria, 'Times New Roman', serif; } .nota { font-size: 7.8pt; color: #4a5664; } .ok { color: #2e6b3f; font-weight: 600; } .falha { color: #a3352b; font-weight: 600; } .info { color: #2d6a9c; font-weight: 600; } .ph { color: #b3261e; }" +
      ".fig { margin: 2mm 0 5mm; text-align: center; break-inside: avoid; } .fig svg, .fig img { max-width: 100%; height: auto; } .fig img { max-height: 120mm; border: 0.5pt solid #ccd5de; } figcaption { font-size: 8pt; color: #3a4654; margin-top: 1.5mm; }" +
      ".mtq-esq-anel { fill: #9fb6cc; stroke: #4f6275; stroke-width: 0.8; } .mtq-esq-teto { fill: none; stroke: #4f6275; stroke-width: 1.4; } .mtq-esq-vento { stroke: #e9a23b; stroke-width: 2; } .mtq-esq-nivel { stroke: #2d6a9c; stroke-width: 1.2; stroke-dasharray: 4 2; }" +
      ".mtq-esq-chao { stroke: #1d2733; stroke-width: 1.2; } .mtq-esq-torre { stroke: #4f6275; stroke-width: 1.2; } .mtq-esq-sela { fill: #e9a23b; } .mtq-esq-chumb { fill: #a3352b; } .mtq-esq-rot { font: 9px sans-serif; fill: #1d2733; } .mtq-esq-t { font: 8px sans-serif; fill: #1d2733; }" +
      ".caixa { border: 0.6pt solid #b8c4d0; border-left: 2.4pt solid #2d6a9c; background: #f3f6f9; padding: 2.4mm 3mm; margin: 2mm 0 4mm; break-inside: avoid; } .caixa.alerta { border-left-color: #a3352b; background: #fbf1ef; }" +
      ".capa { min-height: 250mm; display: flex; flex-direction: column; break-after: page; } .capa-topo { display: flex; justify-content: space-between; align-items: center; font-size: 8.4pt; } .capa-topo .emp { text-align: right; } .capa .logo { max-height: 18mm; }" +
      ".capa .faixa { height: 1.2mm; background: #2d6a9c; margin: 5mm 0 10mm; } .capa .sobre { font-size: 8.5pt; letter-spacing: 0.18em; color: #2d6a9c; font-weight: 600; } .capa .obra { font-size: 13pt; } .capa .end { color: #5b6774; } .capa .arte { flex: 1; display: flex; align-items: center; justify-content: center; margin: 4mm 0; } .capa .arte svg, .capa .arte img { max-width: 100%; max-height: 95mm; height: auto; }" +
      ".sum { break-after: page; } .sum ol { list-style: none; padding: 0; font-size: 10.5pt; } .sum li { padding: 1.4mm 0; border-bottom: 0.5pt solid #e1e7ed; } .sum a { color: #1d2733; text-decoration: none; }" +
      ".assin { margin: 22mm auto 0; width: 95mm; text-align: center; font-size: 9pt; break-inside: avoid; } .assin .linha { border-top: 0.6pt solid #1d2733; margin-bottom: 2mm; }";
  }

  var AcoTanqueMemorial = { gerar: gerar };
  global.AcoTanqueMemorial = AcoTanqueMemorial;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoTanqueMemorial;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
