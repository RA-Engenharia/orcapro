/* =====================================================================
 * acomemoriallivre.js — MEMORIAL DE CÁLCULO DA ESTRUTURA DE AÇO DESENHADA
 * (motor PURO, ES5, sem DOM, Node-testável). 13/10/2026.
 *
 *   AcoMemorialLivre.gerar(r, opcoes) → { ok, html, titulo, secoes, avisos }
 *     r        resultado do AcoDimLivre.calcular (tipo "livre")
 *     opcoes   empresa { nome, cnpj, endereco, logoDataUrl } · responsavel
 *              { nome, titulo, crea } · obra { nome, endereco, cidade,
 *              cliente } · revisao · data · art · versao · imagens
 *              { perspectiva, deformada, flambagem } (PNG da vista 3D)
 *
 * As mesmas seções do memorial do galpão (js/acomemorial.js), para a
 * estrutura que o engenheiro desenhou: objeto, normas, materiais, modelo
 * (barras, ligações, apoios, flambagem), ações (NBR 6120 com a tabela e a
 * página, áreas por faixas, pontuais, vento), combinações, análise (2ª
 * ordem, deslocabilidade, λcr) com a CONFERÊNCIA DE EQUILÍBRIO de cada caso
 * (Σ cargas aplicadas × Σ reações), esforços, verificação de cada barra
 * passo a passo, deslocamentos, reações na fundação, esforços nas pontas
 * das barras (para as ligações), lista de materiais, decisões do sistema e
 * ITENS NÃO ABRANGIDOS. Registro formal: nada inventado (o que o motor não
 * calculou está dito), número com unidade e vírgula; texto indefinido do
 * motor vira "[valor indefinido]" e é acusado nas conferências.
 * Teste: node tools/test-aco-livre.js
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
    var z = Number(s) === 0;
    return (v < 0 && !z ? MENOS : "") + i + (c ? "," + p[1] : "");
  }
  function un(v, c, u) { return br(v, c) + NB + u; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function t(s, onde) { var x = String(s == null ? "" : s); if (/\b(undefined|NaN|null|Infinity)\b/.test(x)) { indef.push((onde || "texto") + ": " + x.slice(0, 120)); x = x.replace(/\b(undefined|NaN|null|Infinity)\b/g, "[valor indefinido]"); } return esc(x); }
  function ph(v, rot) { var s = v == null ? "" : String(v).trim(); return s ? esc(s) : '<span class="ph">[' + esc(rot) + "]</span>"; }
  function td(h, cls) { return "<td" + (cls ? ' class="' + cls + '"' : "") + ">" + (h == null ? "" : h) + "</td>"; }
  function tabela(cab, linhas, o) {
    o = o || {};
    return '<table class="t' + (o.cls ? " " + o.cls : "") + '">' + (o.legenda ? "<caption>" + o.legenda + "</caption>" : "") + "<thead><tr>" + cab.map(function (c) { var n = typeof c === "object"; return "<th" + (n && c.n ? ' class="n"' : "") + ">" + (n ? c.t : c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      linhas.map(function (l) { var cls = l.cls; var cel = l.c || l; return "<tr" + (cls ? ' class="' + cls + '"' : "") + ">" + cel.map(function (x, k) { var c0 = cab[k], n = typeof c0 === "object" && c0.n; return td(x, n ? "n" : ""); }).join("") + "</tr>"; }).join("") + "</tbody></table>";
  }
  function caixa(h, alerta) { return '<div class="caixa' + (alerta ? " alerta" : "") + '">' + h + "</div>"; }
  function sit(ok) { return ok ? '<span class="ok">atende</span>' : '<span class="falha">não atende</span>'; }
  function f1(v) { return fin(v) ? String(Math.round(v * 10) / 10) : "0"; }
  function dataTxt(d) { if (d instanceof Date) { var z = function (n) { return (n < 10 ? "0" : "") + n; }; return z(d.getDate()) + "/" + z(d.getMonth() + 1) + "/" + d.getFullYear(); } return d ? String(d) : (function () { var x = new Date(), z = function (n) { return (n < 10 ? "0" : "") + n; }; return z(x.getDate()) + "/" + z(x.getMonth() + 1) + "/" + x.getFullYear(); })(); }

  var NOMES = { pilar: "Pilar", viga: "Viga", terca: "Terça", diagonal: "Diagonal" };
  var COND = { rigida: "rígida", rotulada: "rotulada", continua: "contínua", livre: "livre (balanço)", apoio: "apoio" };
  var NORMAS = [
    ["ABNT NBR 8800", "Projeto de estruturas de aço e de estruturas mistas de aço e concreto de edifícios", "2024 (errata 02/2025)", "2008 nas expressões sem mudança confirmada; 2024 onde a mudança foi confirmada (compressão por área efetiva, Cb, deslocabilidade 1,13/1,55) — conferir no texto oficial"],
    ["ABNT NBR 14762", "Dimensionamento de estruturas de aço constituídas por perfis formados a frio", "2010", "2010 (método da resistência direta, Anexo C)"],
    ["ABNT NBR 6120", "Ações para o cálculo de estruturas de edificações", "2019", "2019 (texto oficial na biblioteca técnica)"],
    ["ABNT NBR 8681", "Ações e segurança nas estruturas — procedimento", "2025", "coeficientes γf e ψ das Tabelas 1 e 2 da NBR 8800:2008 — conferir na 8681:2025"],
    ["ABNT NBR 6123", "Forças devidas ao vento em edificações", "2023", "1988 (mapa de isopletas igual na 2023) — só quando o vento foi considerado"]
  ];

  /* ================================================================ FIGURA (isométrica) */
  function svgModelo(r, op) {
    var G = r.modelo, nos = {}; arr(G.modelo.nos).forEach(function (n) { nos[n.id] = n; });
    var c30 = Math.cos(Math.PI / 6), s30 = 0.5;
    function pj(n) { return [(n.x - n.z) * c30, -(n.y + (n.x + n.z) * s30)]; }
    var pts = arr(G.modelo.nos).map(pj); if (!pts.length) return "";
    var mn = [Infinity, Infinity], mx = [-Infinity, -Infinity]; pts.forEach(function (p) { mn[0] = Math.min(mn[0], p[0]); mn[1] = Math.min(mn[1], p[1]); mx[0] = Math.max(mx[0], p[0]); mx[1] = Math.max(mx[1], p[1]); });
    var W = 640, H = op && op.alturaMax || 380, m = 30, esc0 = Math.min((W - 2 * m) / Math.max(1e-6, mx[0] - mn[0]), (H - 2 * m) / Math.max(1e-6, mx[1] - mn[1]));
    function xy(n) { var p = pj(n); return [m + (p[0] - mn[0]) * esc0, m + (p[1] - mn[1]) * esc0]; }
    var memDe = {}; arr(G.membros).forEach(function (mm) { arr(mm.segs).forEach(function (s) { memDe[s] = mm; }); });
    var COR = { pilar: "#1f4f78", viga: "#2d6a9c", terca: "#4f86b8", diagonal: "#8a6d1f" };
    var h = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" font-family="Segoe UI, Arial" font-size="9">';
    arr(G.modelo.barras).forEach(function (b) {
      var a = nos[b.i], c = nos[b.j]; if (!a || !c) return;
      var pa = xy(a), pc = xy(c), mm = memDe[b.id], v = mm && r.membros ? r.membros[mm.id] : null, cor = v && v.razao > 1 ? "#b3261e" : (COR[mm ? mm.papelLivre : ""] || "#555");
      h += '<line x1="' + f1(pa[0]) + '" y1="' + f1(pa[1]) + '" x2="' + f1(pc[0]) + '" y2="' + f1(pc[1]) + '" stroke="' + cor + '" stroke-width="' + (b.tracao ? 1 : 2.4) + '"' + (b.tracao ? ' stroke-dasharray="4 3"' : "") + "/>";
    });
    arr(G.membros).forEach(function (mm) {
      var a = nos[mm.nos[0]], c = nos[mm.nos[mm.nos.length - 1]]; if (!a || !c) return;
      var pa = xy(a), pc = xy(c);
      h += '<text x="' + f1((pa[0] + pc[0]) / 2 + 3) + '" y="' + f1((pa[1] + pc[1]) / 2 - 3) + '" fill="#1d2733">' + esc(mm.id) + "</text>";
    });
    arr(G.modelo.apoios).forEach(function (ap) { var n = nos[ap.no]; if (!n) return; var p = xy(n); h += '<path d="M' + f1(p[0]) + " " + f1(p[1]) + " l-6 9 h12 z\" fill=\"" + (ap.rz && ap.rx ? "#1d2733" : "#ffffff") + '" stroke="#1d2733" stroke-width="0.8"/>'; });
    return h + "</svg>";
  }

  /* ================================================================ CONFERÊNCIA DE EQUILÍBRIO */
  function somaCargas(r, caso) {
    var G = r.modelo, nos = {}, bar = {}, s = [0, 0, 0];
    arr(G.modelo.nos).forEach(function (n) { nos[n.id] = n; });
    arr(G.modelo.barras).forEach(function (b) { bar[b.id] = b; });
    function geo(b) { var a = nos[b.i], c = nos[b.j], d = [c.x - a.x, c.y - a.y, c.z - a.z], L = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]); return { L: L, fh: L > 0 ? Math.sqrt(d[0] * d[0] + d[2] * d[2]) / L : 0 }; }
    arr(caso.cargas).forEach(function (q) {
      if (q.tipo === "no") { for (var k = 0; k < 3; k++) s[k] += num((q.F || [])[k], 0); return; }
      if (q.tipo === "barra") {
        var b = bar[q.barra]; if (!b || q.sistema === "local") return; var g = geo(b), qa = q.q || [0, 0, 0], qb = q.q2 || qa, ab = (num(q.b, 1) - num(q.a, 0)) * g.L * (q.projetada ? g.fh : 1);
        for (var k2 = 0; k2 < 3; k2++) s[k2] += (num(qa[k2], 0) + num(qb[k2], 0)) / 2 * ab;
        return;
      }
      if (q.tipo === "pesoProprio") arr(G.modelo.barras).forEach(function (b2) { if (q.barras && q.barras.indexOf(b2.id) < 0) return; s[1] -= 78.5 * num(b2.secao.A, 0) * geo(b2).L * num(q.fator, 1); });
    });
    return s;
  }
  function somaReacoes(r, caso) {
    var cb = r.analise && r.analise.combinacoes ? r.analise.combinacoes["caso_" + caso.id] : null, s = [0, 0, 0];
    if (!cb || !cb.reacoes) return null;
    Object.keys(cb.reacoes).forEach(function (n) { for (var k = 0; k < 3; k++) s[k] += num(cb.reacoes[n][k], 0); });
    return s;
  }

  /* ================================================================ ESFORÇOS (envoltória ELU por barra) */
  function envoltoria(r, m) {
    var Dm = dep("AcoDimensionar", "./acodimensionar.js"), e = { Nmin: 0, Nmax: 0, V: 0, Mz: 0, My: 0, pontas: { ini: { N: 0, V: 0, M: 0 }, fim: { N: 0, V: 0, M: 0 } } };
    arr(r.combinacoes).forEach(function (c) {
      if (c.tipo !== "ELU" || !Dm) return;
      var est = Dm.estacoesMembro(r.analise, m, c.id); if (!est.length) return;
      est.forEach(function (s) { e.Nmin = Math.min(e.Nmin, s.N); e.Nmax = Math.max(e.Nmax, s.N); e.V = Math.max(e.V, Math.sqrt(s.Vy * s.Vy + s.Vz * s.Vz)); e.Mz = Math.max(e.Mz, Math.abs(s.Mz)); e.My = Math.max(e.My, Math.abs(s.My)); });
      [["ini", est[0]], ["fim", est[est.length - 1]]].forEach(function (q) { var p = e.pontas[q[0]], s2 = q[1]; if (Math.abs(s2.N) > Math.abs(p.N)) p.N = s2.N; p.V = Math.max(p.V, Math.sqrt(s2.Vy * s2.Vy + s2.Vz * s2.Vz)); p.M = Math.max(p.M, Math.sqrt(s2.Mz * s2.Mz + s2.My * s2.My)); });
    });
    return e;
  }

  /* ================================================================ SEÇÕES */
  function gerar(r, opcoes) {
    indef = [];
    opcoes = opcoes || {};
    if (!r || !r.ok || r.tipo !== "livre") return { ok: false, motivo: "O memorial sai de um cálculo da estrutura desenhada que fechou." };
    var G = r.modelo, ob = obj(opcoes.obra), em = obj(opcoes.empresa), rp = obj(opcoes.responsavel), img = obj(opcoes.imagens), rev = opcoes.revisao || "R00", data = dataTxt(opcoes.data);
    var obraNome = ob.nome || "Obra", avisos = [], secs = [], nFig = 0, nTab = 0;
    var membros = arr(G.membros), CR = obj(r.cargasResumo);
    function fig(h, leg) { nFig++; return '<figure class="fig">' + h + "<figcaption>Figura " + nFig + " — " + leg + "</figcaption></figure>"; }
    function leg(t0) { nTab++; return "Tabela " + nTab + " — " + t0; }
    function sec(id, titulo, corpo) { secs.push({ id: id, titulo: titulo, html: corpo }); }
    var cont = {}; membros.forEach(function (m) { cont[m.papelLivre] = (cont[m.papelLivre] || 0) + 1; });
    var L = obj(G.layout), dims = fin(L.vao) ? un(L.vao, 2, "m") + " × " + un(L.Lt, 2, "m") + " em planta, altura " + un(L.H, 2, "m") : "";
    var descr = Object.keys(cont).map(function (k) { return cont[k] + " " + (NOMES[k] || k).toLowerCase() + (cont[k] > 1 ? (k === "viga" ? "s" : k === "pilar" ? "es" : "s") : ""); }).join(", ");

    /* 1. objeto */
    sec("objeto", "Objeto, escopo e premissas",
      "<p>Este memorial apresenta o cálculo da estrutura de aço <b>modelada no OrçaPRO</b> peça a peça (" + esc(descr) + "; " + esc(dims) + "), com as ações da NBR 6120:2019 lançadas por área e por ponto" + (r.vento ? ", e o vento da NBR 6123" : "") + ". A análise é de 2ª ordem (P-Δ e P-δ) com imperfeições, e cada barra é verificada pela NBR 8800 (perfis laminados, soldados, tubos e barras) ou pela NBR 14762 (formados a frio).</p>" +
      "<p>O modelo de cálculo é lido da geometria desenhada: as pontas que se tocam formam os nós, a peça que passa por um nó continua por ele, os apoios são as bases dos pilares e os pontos indicados pelo engenheiro; a condição de cada ligação vem da ligação desenhada ou, sem ela, do padrão informado na seção " + "4" + ". Unidades: kN, m, kN·m (tensões em MPa). Eixos: X e Z horizontais, Y vertical para cima; nos esforços, N > 0 é tração.</p>" +
      tabela(["Item", "Valor"], [
        ["Barras do modelo", membros.length + " (" + esc(descr) + ")"], ["Nós", String(arr(G.modelo.nos).length)], ["Apoios", String(arr(G.modelo.apoios).length)],
        ["Peso de aço dos perfis", un(r.peso, 0, "kg") + (fin(r.taxa) ? " (" + un(r.taxa, 1, "kg/m²") + " da área carregada de " + un(r.areaCarregada, 1, "m²") + ")" : "")],
        ["Situação", r.aprovado ? '<span class="ok">todas as verificações do cálculo atendem</span>' : '<span class="falha">' + r.falhas + " verificação(ões) não atende(m)</span>"]
      ], { legenda: leg("Resumo da estrutura calculada") }) +
      (img.perspectiva ? fig('<img src="' + esc(img.perspectiva) + '" alt="Perspectiva">', "Perspectiva do modelo calculado (aproveitamento das barras)") : fig(svgModelo(r), "Modelo de cálculo em perspectiva isométrica (barras e apoios; em vermelho as que não atendem)")));

    /* 2. normas */
    sec("normas", "Normas e edições", tabela(["Norma", "Título", "Edição vigente", "Edição usada no cálculo"], NORMAS.filter(function (n) { return n[0] !== "ABNT NBR 6123" || r.vento; }).map(function (n) { return [esc(n[0]), esc(n[1]), esc(n[2]), esc(n[3])]; }), { legenda: leg("Normas aplicadas") }) +
      '<p class="nota">A NBR 8800:2024, a NBR 6123:2023 e a NBR 8681:2025 ainda não estão no texto oficial da biblioteca técnica: cada verificação cita o item e a edição usados.</p>');

    /* 3. materiais */
    var acos = {}; membros.forEach(function (m) { var a = obj(m.aco); if (!acos[a.id]) acos[a.id] = { a: a, ps: [] }; acos[a.id].ps.push(m.id); });
    sec("materiais", "Materiais", tabela(["Aço", { t: "fy (MPa)", n: 1 }, { t: "fu (MPa)", n: 1 }, "Barras"], Object.keys(acos).map(function (k) { var a = acos[k].a; return [esc(a.id), br(a.fy, 0), br(a.fu, 0), esc(acos[k].ps.join(", "))]; }), { legenda: leg("Aços das barras") }) +
      "<p>Constantes do aço (NBR 8800:2008, 4.5.2.9): E = 200.000 MPa, G = 77.000 MPa, ν = 0,3; peso específico 78,5 kN/m³ (NBR 6120:2019, Tabela 1). Coeficientes das resistências: γa1 = 1,10 e γa2 = 1,35 (NBR 8800:2008, Tabela 3).</p>");

    /* 4. modelo */
    var linhasM = membros.map(function (m) {
      var fl = obj(m.flambagem), tr = obj(m.travamentos), p0 = obj(m.pontas).ini || {}, p1 = obj(m.pontas).fim || {};
      return [esc(m.id), t(m.nome, "peça " + m.id), esc(NOMES[m.papelLivre] || m.papel) + (m.papel === "tirante" ? " (só tração)" : ""), esc(m.secao && m.secao.nome), br(m.L, 2),
              esc(COND[p0.tipo] || p0.tipo) + " / " + esc(COND[p1.tipo] || p1.tipo), br(fl.Lx, 2) + " / " + br(fl.Ly, 2) + " / " + br(fl.Lz, 2),
              (arr(tr.mais).length || arr(tr.menos).length) ? esc(arr(tr.mais).map(function (x) { return br(x, 2); }).join("; ") || "—") : "pontas"];
    });
    var aps = arr(G.modelo.apoios).map(function (a) { var ai = obj(G.apoiosNo)[a.no] || {}, n = arr(G.modelo.nos).filter(function (x) { return x.id === a.no; })[0] || {};
      var res = ["ux", "uy", "uz", "rx", "ry", "rz"].filter(function (k) { return a[k] === true; }).join(", ");
      return [esc(a.no), esc(ai.mid || "—"), br(n.x, 2) + "; " + br(n.y, 2) + "; " + br(n.z, 2), esc(ai.tipo || "—"), esc(res), t(ai.motivo || "", "apoio")]; });
    var ligs = arr(r.ligacoesDesenhadas).filter(function (l) { return l.tipo; });
    sec("modelo", "Modelo estrutural",
      "<p>O modelo tem " + arr(G.modelo.barras).length + " barras de análise (" + membros.length + " peças divididas nos nós intermediários) e " + arr(G.modelo.nos).length + " nós. Cada barra usa as propriedades do perfil do catálogo; o eixo local y é a altura da seção, como foi desenhada (giro da peça).</p>" +
      tabela(["Barra", "Peça", "Papel", "Perfil", { t: "L (m)", n: 1 }, "Pontas (início / fim)", "Flambagem Lx / Ly / Lz (m)", "Mesa travada em (m)"], linhasM, { legenda: leg("Barras, ligações nas pontas e comprimentos de flambagem decididos pelo sistema"), cls: "compacta" }) +
      '<p class="nota">Lx: flambagem em torno do eixo de maior inércia; Ly: do de menor; Lz: torção. K = 1 entre os pontos travados de cada direção (análise de 2ª ordem com imperfeições — NBR 8800, 4.9.7); trecho com ponta livre = 2 × o comprimento. "Mesa travada em": posições, ao longo da barra, onde outra peça trava a mesa comprimida (flambagem lateral com torção); as pontas sempre contam.</p>' +
      tabela(["Nó", "Pilar/peça", "Coordenadas x; y; z (m)", "Tipo", "Restrições", "Motivo"], aps, { legenda: leg("Apoios") }) +
      (ligs.length ? tabela(["Ligação", "Tipo considerado", "Peças"], ligs.map(function (l) { return [esc(l.id), esc(COND[l.tipo] || l.tipo), esc(l.membros.join(", "))]; }), { legenda: leg("Ligações desenhadas no modelo (definem a condição de cálculo)") }) : "<p>Nenhuma ligação desenhada no modelo: as condições das pontas são as do padrão (Tabela anterior).</p>"));

    /* 5. ações */
    var ar = arr(CR.areas).map(function (a) {
      var d = obj(a.distribuicao), u = obj(a.uso);
      return [t(a.nome, "área"), br(a.area, 2), a.g ? br(a.g, 2) + " (" + esc(a.gCategoria || "") + (a.gTexto ? "; " + t(a.gTexto, "área") : "") + ")" : "—",
              u.q != null ? br(u.q, 2) + "<br><span class=\"nota\">" + t(u.texto, "uso") + " — " + t(u.referencia, "uso") + "</span>" : "—",
              d.vaoPlaca ? br(d.vaoPlaca, 2) + " m" : "—", esc(arr(d.vigas).join(", ")),
              Object.keys(obj(d.aplicada)).map(function (k) { return k + ": " + br(d.aplicada[k], 2) + " kN" + (fin(obj(d.esperada)[k]) ? " (q × A = " + br(d.esperada[k], 2) + ")" : ""); }).join("<br>")];
    });
    var pt = arr(CR.pontuais).map(function (p) { return [t(p.nome, "pontual"), esc(p.no), br(p.F[0], 2) + "; " + br(p.F[1], 2) + "; " + br(p.F[2], 2), esc(p.caso)]; });
    var vt = r.vento ? (function (V) { return "<h3>Vento (NBR 6123)</h3>" + tabela(["Grandeza", "Valor"], [["V0", un(V.v0, 1, "m/s") + (V.v0Info ? " — " + t(V.v0Info.texto || V.v0Info.motivo || "", "vento") : "")], ["S1", br(obj(V.s1).valor, 2)], ["S2", br(obj(V.s2).valor, 3)], ["S3", br(obj(V.s3).valor, 2)], ["q", un(V.q, 3, "kN/m²")], ["Casos", String(arr(r.ventoCasos).length)]], { legenda: leg("Vento") }) +
      '<p class="nota">Paredes fechadas → pilares da face por faixa de influência; cobertura → vigas das áreas de cobertura por faixas (normal à cobertura). Coeficientes da NBR 6123:1988 (conferir na 2023).</p>'; })(r.vento) : "<p>Vento: não considerado (estrutura interna/coberta por outra edificação, ou não indicado pelo engenheiro) — ver itens não abrangidos.</p>";
    sec("acoes", "Ações",
      "<h3>Permanentes</h3><p>Peso próprio dos perfis: 78,5 kN/m³ × área da seção × " + br(1 + num(CR.acrescimo, 0.05), 2) + " (acréscimo de " + br(num(CR.acrescimo, 0.05) * 100, 0) + " % de chapas, parafusos e soldas das ligações — premissa de projeto), caso G (γ 1,25).</p>" +
      "<h3>Ações por área (permanentes de revestimento e sobrecarga de uso)</h3>" +
      (ar.length ? tabela(["Área", { t: "A (m²)", n: 1 }, "g (kN/m²)", "q de uso (kN/m²) — NBR 6120:2019, Tabela 10", "Vão da placa", "Vigas que recebem", "Carga aplicada × esperada"], ar, { legenda: leg("Áreas carregadas e distribuição às vigas por faixas"), cls: "compacta" }) : "<p>Nenhuma área carregada.</p>") +
      '<p class="nota">Distribuição por faixas: cada viga paralela à direção da placa leva a faixa até a metade da distância às vizinhas, recortada pelo contorno da área, estação a estação (cargas em projeção horizontal). A sobrecarga não foi reduzida (6.12).</p>' +
      (pt.length ? "<h3>Cargas pontuais</h3>" + tabela(["Carga", "Nó", "F x; y; z (kN)", "Caso"], pt, { legenda: leg("Cargas pontuais") }) : "") + vt +
      "<h3>Casos de carga</h3>" + tabela(["Caso", "Tipo", "Nome", "Categoria (γf / ψ)"], arr(r.casos).map(function (c) { return [esc(c.id), esc(c.tipo), t(c.nome, "caso"), esc(c.categoria || (c.tipo === "W" ? "vento" : ""))]; }), { legenda: leg("Casos de carga") }));

    /* 6. combinações */
    sec("combinacoes", "Combinações de ações", "<p>Combinações últimas normais e de serviço (raras e quase permanentes) com os γf e ψ da NBR 8800:2008, Tabelas 1 e 2 (os da NBR 8681); as últimas levam as forças nocionais de 0,3 % das cargas gravitacionais (4.9.7.1.1) nas direções x e z.</p>" +
      tabela(["Id", "Tipo", "Combinação"], arr(r.combinacoes).map(function (c) { return [esc(c.id), esc(c.tipo), t(c.descricao || c.nome, "combinação") + (c.nocional ? ' <span class="nota">(nocional ' + (c.nocional.dir && c.nocional.dir[0] ? "x" : "z") + ")</span>" : "")]; }), { legenda: leg("Combinações"), cls: "compacta" }));

    /* 7. análise + equilíbrio */
    var eq = arr(r.casos).map(function (c) {
      var s = somaCargas(r, c), R = somaReacoes(r, c); if (!R) return null;
      var e = [0, 1, 2].map(function (k) { return Math.abs(s[k] + R[k]); }), ref = Math.max(1, Math.abs(s[0]), Math.abs(s[1]), Math.abs(s[2])), okq = e.every(function (x) { return x <= 0.005 * ref + 0.01; });
      if (!okq) avisos.push("Equilíbrio do caso " + c.id + ": Σ cargas (" + s.map(function (x) { return br(x, 2); }).join("; ") + ") × Σ reações (" + R.map(function (x) { return br(x, 2); }).join("; ") + ") não fecham.");
      return [esc(c.id), s.map(function (x) { return br(x, 2); }).join("; "), R.map(function (x) { return br(x, 2); }).join("; "), sit(okq)];
    }).filter(Boolean);
    var fl = arr(r.flambagem);
    sec("analise", "Análise estrutural",
      "<p>Método dos deslocamentos, pórtico espacial (6 graus de liberdade por nó), barras subdivididas para o efeito local P-δ. Análise de 2ª ordem iterada com o esforço normal; barras redondas só trabalham à tração. Deslocabilidade pela relação Δ2/Δ1 dos deslocamentos horizontais (NBR 8800:2024, 4.10): <b>Δ2/Δ1 = " + br(obj(r.deslocabilidade).razao, 3) + " — " + esc(obj(r.deslocabilidade).classe) + " deslocabilidade</b>" + (obj(r.deslocabilidade).classe !== "pequena" ? " (rigidez reduzida a 80 % nas combinações últimas)" : "") + ".</p>" +
      (r.estabilidadeGlobal && !r.estabilidadeGlobal.ok ? caixa("<b>Não atende:</b> " + t(r.estabilidadeGlobal.texto, "estabilidade"), true) : "") +
      (fl.length ? "<p>Flambagem global (autovalor da rigidez geométrica): " + fl.map(function (f) { return "λcr = " + br(f.lambda, 2) + " na combinação " + esc(f.combinacao); }).join("; ") + ".</p>" : "") +
      (img.deformada ? fig('<img src="' + esc(img.deformada) + '" alt="Deformada">', "Deformada (ampliada)") : "") + (img.flambagem ? fig('<img src="' + esc(img.flambagem) + '" alt="Modo de flambagem">', "Primeiro modo de flambagem global") : "") +
      "<h3>Conferência de equilíbrio (cada caso, característico)</h3>" + tabela(["Caso", "Σ cargas aplicadas Fx; Fy; Fz (kN)", "Σ reações Rx; Ry; Rz (kN)", "Σ = 0"], eq, { legenda: leg("Equilíbrio global por caso") }));

    /* 8. esforços */
    var envs = {}; membros.forEach(function (m) { envs[m.id] = envoltoria(r, m); });
    sec("esforcos", "Esforços solicitantes de cálculo", tabela(["Barra", "Perfil", { t: "N mín. (kN)", n: 1 }, { t: "N máx. (kN)", n: 1 }, { t: "V máx. (kN)", n: 1 }, { t: "Mx máx. (kN·m)", n: 1 }, { t: "My máx. (kN·m)", n: 1 }],
      membros.map(function (m) { var e = envs[m.id]; return [esc(m.id), esc(m.secao.nome), br(e.Nmin, 2), br(e.Nmax, 2), br(e.V, 2), br(e.Mz, 2), br(e.My, 2)]; }), { legenda: leg("Envoltória das combinações últimas (2ª ordem)"), cls: "compacta" }) +
      '<p class="nota">Mx: momento em torno do eixo de maior inércia (o "z" da análise); My: do de menor. N &lt; 0: compressão.</p>');

    /* 9. dimensionamento */
    var dim = membros.map(function (m) {
      var v = obj(r.membros[m.id]), vs = arr(v.verificacoes), pr = obj(v.pior);
      var h = "<h3>" + esc(m.id) + " — " + t(m.nome, "peça") + " — " + esc(m.secao.nome) + " (" + esc(obj(m.aco).id) + ")</h3>" +
        "<p>Razão máxima <b>" + br(v.razao, 3) + "</b> — " + sit(v.ok) + (v.governante ? "; governa: " + t(v.governante, m.id) : "") + (pr.comb ? " (combinação " + esc(pr.comb) + ", x = " + br(pr.x, 2) + " m)" : "") + ". Norma: " + esc(v.edicao || "NBR 8800") + ".</p>" +
        tabela(["Verificação", "Item", { t: "Solicitante", n: 1 }, { t: "Resistente", n: 1 }, { t: "Razão", n: 1 }], vs.map(function (q) { return { c: [t(q.nome, m.id), t(q.item, m.id), br(q.solicitante, 2) + (q.unidade ? NB + esc(q.unidade) : ""), br(q.resistencia, 2) + (q.unidade ? NB + esc(q.unidade) : ""), br(q.razao, 3)], cls: q.razao > 1 ? "linha-falha" : "" }; }), { cls: "compacta" });
      var gov = vs.filter(function (q) { return q.nome === v.governante; })[0];
      if (gov && arr(gov.passos).length) h += "<h4>Passos — " + t(gov.nome, m.id) + "</h4><ul>" + arr(gov.passos).slice(0, 18).map(function (p) { return "<li>" + t(p.rotulo, m.id) + (p.formula ? ' <span class="eq">' + t(p.formula, m.id) + "</span>" : "") + (p.valor != null ? " = <b>" + t(typeof p.valor === "number" ? br(p.valor, 3) : p.valor, m.id) + "</b>" : "") + (p.extra ? ' <span class="nota">' + t(p.extra, m.id) + "</span>" : "") + "</li>"; }).join("") + "</ul>";
      if (arr(v.avisos).length) h += '<p class="nota">' + arr(v.avisos).map(function (a) { return t(a, m.id); }).join(" · ") + "</p>";
      if (v.sugestao) h += caixa("<b>Sugestão:</b> " + t(v.sugestao, m.id), true);
      return h;
    }).join("");
    sec("dimensionamento", "Verificação das barras", "<p>Cada barra é verificada em todas as estações de todas as combinações últimas: tração, compressão (flambagem por flexão, torção e flexo-torção; flambagem local), flexão (escoamento, flambagem lateral com torção nos trechos entre os travamentos da mesa comprimida, flambagem local da mesa e da alma), cortante e a interação força axial + momentos.</p>" +
      tabela(["Barra", "Perfil", { t: "Razão", n: 1 }, "Governa", "Situação"], membros.map(function (m) { var v = obj(r.membros[m.id]); return { c: [esc(m.id), esc(m.secao.nome), br(v.razao, 3), t(v.governante || "—", m.id), sit(v.ok)], cls: v.ok ? "" : "linha-falha" }; }), { legenda: leg("Resumo das verificações (estado-limite último)") }) + dim);

    /* 10. deslocamentos */
    sec("servico", "Deslocamentos (estado-limite de serviço)", tabela(["Barra", "Verificação", { t: "Valor (mm)", n: 1 }, { t: "Limite (mm)", n: 1 }, { t: "Razão", n: 1 }, "Comb.", "Situação"],
      arr(r.servico).map(function (s) { return { c: [esc(s.membro), t(s.texto, "serviço"), br(s.valor * 1000, 2), br(s.limite * 1000, 2), br(s.razao, 3), esc(s.comb || "—"), sit(s.razao <= 1)], cls: s.razao > 1 ? "linha-falha" : "" }; }), { legenda: leg("Deslocamentos nas combinações raras — " + esc(dep("AcoDimLivre", "./acodimlivre.js") ? AcoDimLivreRef() : "NBR 8800, Anexo C")), cls: "compacta" }) +
      '<p class="nota">Vigas: deslocamento vertical de cada vão em relação à corda dos apoios (balanço: da ponta em relação ao apoio, L = 2 × o balanço). Pilares: deslocamento horizontal do topo em relação à base.</p>');

    /* 11. reações */
    var reac = obj(r.reacoes), casosIds = arr(r.casos).map(function (c) { return c.id; });
    sec("reacoes", "Reações de apoio (cargas na fundação)",
      "<p>Reação = força do apoio na estrutura: Fy &gt; 0 comprime a fundação. Valores característicos por caso (para o projeto da fundação combinar) e a envoltória das combinações últimas.</p>" +
      Object.keys(reac).map(function (no) {
        var R = reac[no];
        return "<h4>Apoio " + esc(no) + " — " + esc(R.membro || "") + " (" + esc(R.tipo || "") + ")</h4>" + tabela(["Caso", { t: "Fx (kN)", n: 1 }, { t: "Fy (kN)", n: 1 }, { t: "Fz (kN)", n: 1 }, { t: "Mx (kN·m)", n: 1 }, { t: "My (kN·m)", n: 1 }, { t: "Mz (kN·m)", n: 1 }],
          casosIds.filter(function (c) { return R.porCaso[c]; }).map(function (c) { var v = R.porCaso[c]; return [esc(c), br(v[0], 2), br(v[1], 2), br(v[2], 2), br(v[3], 2), br(v[4], 2), br(v[5], 2)]; }).concat([["ELU mín./máx.", br(R.envELU.Fx[0], 1) + " / " + br(R.envELU.Fx[1], 1), br(R.envELU.Fy[0], 1) + " / " + br(R.envELU.Fy[1], 1), br(R.envELU.Fz[0], 1) + " / " + br(R.envELU.Fz[1], 1), br(R.envELU.Mx[0], 1) + " / " + br(R.envELU.Mx[1], 1), br(R.envELU.My[0], 1) + " / " + br(R.envELU.My[1], 1), br(R.envELU.Mz[0], 1) + " / " + br(R.envELU.Mz[1], 1)]]), { cls: "compacta" });
      }).join(""));

    /* 12. esforços nas pontas (para as ligações) */
    sec("ligacoes", "Esforços nas pontas das barras (para o detalhamento das ligações)", "<p>As ligações NÃO foram dimensionadas por este cálculo (ver itens não abrangidos): a tabela traz, para cada ponta, o maior esforço normal, a maior cortante e o maior momento das combinações últimas, para o projeto das ligações.</p>" +
      tabela(["Barra", "Ponta", "Condição", { t: "N (kN)", n: 1 }, { t: "V (kN)", n: 1 }, { t: "M (kN·m)", n: 1 }], [].concat.apply([], membros.map(function (m) { var e = envs[m.id]; return ["ini", "fim"].map(function (k) { var p = e.pontas[k], c = obj(m.pontas)[k] || {}; return [esc(m.id), k === "ini" ? "início" : "fim", esc(COND[c.tipo] || c.tipo || "—"), br(p.N, 2), br(p.V, 2), br(p.M, 2)]; }); })), { legenda: leg("Esforços de cálculo nas pontas"), cls: "compacta" }));

    /* METÁLICA › L (14/10/2026, js/acoligsugere.js): as ligações escolhidas e dimensionadas pela ligação inteligente
       (opcoes.ligacoes = [{ id, titulo, resultado }]; na tela, as do modelo — js/metalligsugui.js) */
    var LSg = dep("AcoLigSugere", "./acoligsugere.js"), ligsDim = arr(opcoes.ligacoes).length ? opcoes.ligacoes : (global.MetalLigSugUI && global.MetalLigSugUI.ligacoesDoModelo ? global.MetalLigSugUI.ligacoesDoModelo() : []);
    var secLig = LSg && LSg.secaoMemorial ? LSg.secaoMemorial(ligsDim) : null;
    if (secLig) sec(secLig.id, secLig.titulo, secLig.html);

    /* 13. materiais (lista) */
    var lista = {}; membros.forEach(function (m) { var k = m.secao.nome; if (!lista[k]) lista[k] = { n: 0, L: 0, kg: 0, massa: num(m.secao.massa, 0) }; lista[k].n++; lista[k].L += m.L; lista[k].kg += m.L * num(m.secao.massa, 0); });
    var tot = 0; Object.keys(lista).forEach(function (k) { tot += lista[k].kg; });
    sec("pesos", "Lista de materiais e peso", tabela(["Perfil", { t: "Peças", n: 1 }, { t: "Comprimento (m)", n: 1 }, { t: "kg/m", n: 1 }, { t: "Peso (kg)", n: 1 }],
      Object.keys(lista).map(function (k) { var x = lista[k]; return [esc(k), String(x.n), br(x.L, 2), br(x.massa, 1), br(x.kg, 1)]; }).concat([{ c: ["Total", "", "", "", br(tot, 1)], cls: "tot" }]), { legenda: leg("Perfis (sem chapas, parafusos e soldas — o acréscimo de " + br(num(CR.acrescimo, 0.05) * 100, 0) + " % entrou só nas cargas)") }) +
      (Math.abs(tot - num(r.peso, tot)) > 0.5 ? (avisos.push("Peso da lista (" + br(tot, 1) + " kg) diferente do resultado (" + br(r.peso, 1) + " kg)."), "") : ""));

    /* 14. decisões, avisos, não abrangidos */
    var naoAb = arr(r.naoAbrangidos).slice(); if (!r.vento) naoAb.unshift("Ação do VENTO (NBR 6123): não considerada neste cálculo.");
    sec("decisoes", "Decisões do sistema", tabela(["Tema", "Decisão", "Motivo"], arr(r.decisoes).map(function (d) { return [t(d.tema, "decisão"), t(d.decisao, "decisão"), t(d.motivo, "decisão")]; }), { legenda: leg("O que o sistema decidiu e por quê"), cls: "decisoes" }) +
      (r.otimizacao && arr(r.otimizacao.log).length ? "<h3>Otimização dos perfis</h3><ul>" + r.otimizacao.log.map(function (x) { return "<li>" + t(x, "otimização") + "</li>"; }).join("") + "</ul>" : ""));
    sec("avisos", "Avisos, conferências e itens não abrangidos",
      "<h3>Itens não abrangidos por este cálculo</h3><ul>" + naoAb.map(function (x) { return "<li>" + t(x, "não abrangido") + "</li>"; }).join("") + "</ul>" +
      "<h3>Avisos do cálculo</h3>" + (arr(r.avisos).length ? "<ul>" + arr(r.avisos).map(function (x) { return "<li>" + t(x, "aviso") + "</li>"; }).join("") + "</ul>" : "<p>Nenhum.</p>") +
      "<h3>Conferências internas</h3>@@CONF@@");
    sec("termo", "Responsabilidade técnica", "<p>Este memorial é parte do projeto estrutural e vale com a ART do responsável técnico. As premissas (ligações, apoios, cargas de uso e permanentes) são do projeto e devem ser confirmadas na obra.</p>" +
      '<div class="assin"><div class="linha"></div><div>' + ph(rp.nome, "NOME DO RESPONSÁVEL TÉCNICO") + "</div><div>" + ph(rp.titulo, "TÍTULO PROFISSIONAL") + " — CREA " + ph(rp.crea, "Nº DO CREA") + "</div><div>ART " + ph(opcoes.art, "Nº DA ART") + "</div></div>");

    indef.forEach(function (x) { avisos.push("Texto do motor com valor indefinido — " + x); });
    var corpo = secs.map(function (s, i) { return '<section class="sec" id="sec-' + s.id + '"><h2><span class="num">' + (i + 1) + "</span>" + esc(s.titulo) + "</h2>" + s.html + "</section>"; }).join("");
    corpo = corpo.replace("@@CONF@@", avisos.length ? caixa("<b>Divergências:</b><ul>" + avisos.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>", true) : caixa("Todas as conferências passaram: equilíbrio de cada caso (Σ cargas × Σ reações), peso da lista × peso do resultado e textos do cálculo."));
    var titulo = "Memorial de cálculo — Estrutura metálica — " + obraNome;
    var capa = '<section class="capa"><div class="capa-topo">' + (em.logoDataUrl && /^data:image\//.test(em.logoDataUrl) ? '<img class="logo" src="' + esc(em.logoDataUrl) + '" alt="Logotipo">' : ph("", "LOGOTIPO")) + '<div class="emp"><b>' + ph(em.nome, "EMPRESA") + "</b>" + (em.cnpj ? "<br>CNPJ " + esc(em.cnpj) : "") + "</div></div>" +
      '<div class="faixa"></div><div class="sobre">MEMORIAL DE CÁLCULO</div><h1>Estrutura metálica</h1><div class="obra">' + esc(obraNome) + "</div>" + (ob.endereco || ob.cidade ? '<div class="end">' + esc([ob.endereco, ob.cidade].filter(Boolean).join(" — ")) + "</div>" : "") +
      '<div class="arte">' + (img.perspectiva ? '<img src="' + esc(img.perspectiva) + '" alt="Perspectiva">' : svgModelo(r, { alturaMax: 320 })) + "</div>" +
      tabela(["Item", ""], [["Cliente", ph(ob.cliente, "CLIENTE")], ["Estrutura", esc(descr) + (dims ? " — " + esc(dims) : "") + "; " + un(r.peso, 0, "kg") + " de aço"], ["Situação", r.aprovado ? '<span class="ok">todas as verificações atendem</span>' : '<span class="falha">' + r.falhas + " verificação(ões) não atende(m)</span>"],
        ["Responsável técnico", ph(rp.nome, "NOME DO RESPONSÁVEL TÉCNICO") + " — CREA " + ph(rp.crea, "Nº DO CREA")], ["Revisão / data", esc(rev) + " — " + esc(data)]]) + "</section>";
    var sum = '<section class="sum"><h2>Sumário</h2><ol>' + secs.map(function (s, i) { return '<li><a href="#sec-' + s.id + '">' + (i + 1) + ". " + esc(s.titulo) + "</a></li>"; }).join("") + "</ol></section>";
    var html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="generator" content="OrçaPRO — AcoMemorialLivre"><title>' + esc(titulo) + "</title><style>" + CSS(obraNome, rev, em, rp) + "</style></head><body>" + capa + sum + corpo + "</body></html>";
    return { ok: true, html: html, titulo: titulo, secoes: secs.map(function (s, i) { return { id: s.id, numero: i + 1, titulo: s.titulo }; }), figuras: nFig, tabelas: nTab, avisos: avisos };
  }
  function AcoDimLivreRef() { var D = dep("AcoDimLivre", "./acodimlivre.js"); return D && D.REF_C1 ? D.REF_C1 : "NBR 8800, Anexo C"; }
  function cssStr(s) { return '"' + String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ").replace(/</g, "\\3c ") + '"'; }
  function CSS(obra, rev, em, rp) {
    var mb = "font: 7.5pt 'Segoe UI', Helvetica, Arial, sans-serif; color: #5b6774;";
    return "@page { size: A4; margin: 20mm 15mm 18mm 20mm; @top-left { content: " + cssStr(obra) + "; " + mb + " } @top-right { content: " + cssStr("Memorial de cálculo — Estrutura metálica — " + rev) + "; " + mb + " }" +
      " @bottom-left { content: " + cssStr((em.nome || "") + (rp.nome ? " — Resp. técnico: " + rp.nome : "")) + "; " + mb + " } @bottom-right { content: \"Página \" counter(page) \" de \" counter(pages); " + mb + " } }" +
      "@page :first { @top-left { content: none; } @top-right { content: none; } @bottom-left { content: none; } @bottom-right { content: none; } }" +
      "html { -webkit-print-color-adjust: exact; print-color-adjust: exact; } body { font: 9.4pt/1.42 'Segoe UI', Helvetica, Arial, sans-serif; color: #1d2733; background: #ffffff; margin: 0; }" +
      "@media screen { body { max-width: 182mm; margin: 10mm auto; padding: 0 10mm; } .sec, .sum { border-top: 1px dashed #c9d2dc; margin-top: 10mm; padding-top: 6mm; } }" +
      "h1 { font-size: 22pt; font-weight: 600; margin: 1mm 0 2mm; } h2 { font-size: 14pt; font-weight: 600; margin: 0 0 4mm; padding-bottom: 1.6mm; border-bottom: 1.4pt solid #2d6a9c; break-after: avoid; } h2 .num { color: #2d6a9c; margin-right: 3mm; }" +
      "h3 { font-size: 11pt; font-weight: 600; margin: 5mm 0 2mm; break-after: avoid; } h4 { font-size: 9.6pt; font-weight: 600; color: #2d6a9c; margin: 4mm 0 1.6mm; break-after: avoid; }" +
      "p { margin: 0 0 2.2mm; text-align: justify; } ul { margin: 0 0 2.4mm; padding-left: 5mm; } li { margin-bottom: 0.8mm; } .sec { break-before: page; }" +
      "table.t { width: 100%; border-collapse: collapse; margin: 1.5mm 0 4mm; font-size: 8pt; line-height: 1.32; font-variant-numeric: tabular-nums; } table.t caption { caption-side: top; text-align: left; font-size: 8.2pt; padding-bottom: 1.2mm; }" +
      "table.t th { background: #e8eef4; font-weight: 600; text-align: left; border: 0.5pt solid #b8c4d0; padding: 1.1mm 1.4mm; vertical-align: bottom; } table.t td { border: 0.5pt solid #ccd5de; padding: 0.9mm 1.4mm; vertical-align: top; overflow-wrap: break-word; }" +
      "table.t tbody tr:nth-child(even) td { background: #f6f8fa; } table.t tr.tot td { background: #eef3f8; border-top: 0.9pt solid #8a97a6; font-weight: 600; } table.t tr.linha-falha td { background: #fbefed; }" +
      "table.t th.n, table.t td.n { text-align: right; white-space: nowrap; } table.compacta { font-size: 7.4pt; } table.decisoes td:first-child { width: 16%; font-weight: 600; } thead { display: table-header-group; } tr { break-inside: avoid; }" +
      ".eq { font-family: 'Cambria Math', Cambria, 'Times New Roman', serif; } .nota { font-size: 7.8pt; color: #4a5664; } .ok { color: #2e6b3f; font-weight: 600; } .falha { color: #a3352b; font-weight: 600; } .ph { color: #b3261e; }" +
      ".fig { margin: 2mm 0 5mm; text-align: center; break-inside: avoid; } .fig svg, .fig img { max-width: 100%; height: auto; } .fig img { max-height: 120mm; border: 0.5pt solid #ccd5de; } figcaption { font-size: 8pt; color: #3a4654; margin-top: 1.5mm; }" +
      ".caixa { border: 0.6pt solid #b8c4d0; border-left: 2.4pt solid #2d6a9c; background: #f3f6f9; padding: 2.4mm 3mm; margin: 2mm 0 4mm; break-inside: avoid; } .caixa.alerta { border-left-color: #a3352b; background: #fbf1ef; }" +
      ".capa { min-height: 250mm; display: flex; flex-direction: column; break-after: page; } .capa-topo { display: flex; justify-content: space-between; align-items: center; font-size: 8.4pt; } .capa-topo .emp { text-align: right; } .capa .logo { max-height: 18mm; }" +
      ".capa .faixa { height: 1.2mm; background: #2d6a9c; margin: 5mm 0 10mm; } .capa .sobre { font-size: 8.5pt; letter-spacing: 0.18em; color: #2d6a9c; font-weight: 600; } .capa .obra { font-size: 13pt; } .capa .end { color: #5b6774; } .capa .arte { flex: 1; display: flex; align-items: center; justify-content: center; margin: 4mm 0; } .capa .arte svg, .capa .arte img { max-width: 100%; max-height: 95mm; height: auto; }" +
      ".sum { break-after: page; } .sum ol { list-style: none; padding: 0; font-size: 10.5pt; } .sum li { padding: 1.4mm 0; border-bottom: 0.5pt solid #e1e7ed; } .sum a { color: #1d2733; text-decoration: none; }" +
      ".assin { margin: 22mm auto 0; width: 95mm; text-align: center; font-size: 9pt; break-inside: avoid; } .assin .linha { border-top: 0.6pt solid #1d2733; margin-bottom: 2mm; }";
  }

  var AcoMemorialLivre = { gerar: gerar, _int: { somaCargas: somaCargas, somaReacoes: somaReacoes, svgModelo: svgModelo } };
  global.AcoMemorialLivre = AcoMemorialLivre;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoMemorialLivre;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
