/* =====================================================================
 * blocokmemorial.js — MEMORIAL DE CÁLCULO da edificação em Blocok (A4
 * retrato, HTML imprimível). Motor PURO, ES5, sem DOM, Node-testável.
 * Mesmo molde do js/madmemorial.js (estrutura, CSS, estilo de escrita).
 *
 *   BlocokMemorial.gerar(resultado, opcoes) → { ok, html, secoes, avisos }
 *
 *   resultado  o do BlocokCalc.calcular (js/blocokcalc.js): paredes, vento,
 *              fundacao, consolidado, parametros, normas, cargas, memoria,
 *              pendencias, erros, avisos.
 *   opcoes     obra { nome, cliente, local, edificacao{comprimento,largura,
 *              altura,areaPlanta} } · documento { numero, revisao, data,
 *              situacao } · responsavel { nome, abrev, conselho, crea,
 *              empresa } · versao.
 *
 * REGRAS (registro formal de engenharia — não afrouxar):
 *   · NADA INVENTADO. O que não veio no resultado aparece como
 *     "[a definir]" (vermelho). Responsável técnico sem dado:
 *     "[RESPONSÁVEL TÉCNICO — CREA]" em vermelho.
 *   · O painel é verificado pelo ENSAIO SIMULADO RA (js/blocokensaio.js:
 *     faces de microconcreto + núcleo de EPS + junta de argamassa), que já
 *     vale; o valor do ensaio do fabricante, quando informado, vale por
 *     cima. Não há pendência de ensaio nem de compressão do painel.
 *   · Número sempre com vírgula decimal e unidade. Cada valor de norma com
 *     a edição citada pelo motor de cálculo (campo resultado.normas).
 *   · Status com cor E com símbolo/borda (legível em preto e branco):
 *     ✓ atende (borda cheia) · ! pendente (borda tracejada) · ✗ não atende
 *     (fundo escuro).
 *   · Texto do motor com undefined/NaN/null vira "[valor indefinido]" e
 *     entra em `avisos` (esconder o defeito seria pior).
 * Teste: node tools/test-blocokmemorial.js
 * ===================================================================== */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory((function () { try { return require("./blocokexec.js"); } catch (e) { return null; } })(), (function () { try { return require("./blocokensaio.js"); } catch (e) { return null; } })());
  else root.BlocokMemorial = factory(root.BlocokExec || null, root.BlocokEnsaio || null);
})(typeof self !== "undefined" ? self : this, function (BlocokExec, BlocokEnsaio) {
  "use strict";

  var NB = String.fromCharCode(160), MENOS = "−";
  var COR = { azul: "#00406A", marrom: "#6F5F48", verde: "#3F7818", areia: "#A89868", falha: "#a3352b", alerta: "#c27c2c" };
  var RE_INDEF = /\b(undefined|nan|null|infinity)\b/i;

  function fin(v) { return typeof v === "number" && isFinite(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function br(v, c) {
    if (!fin(v)) return null;
    c = c == null ? 2 : c;
    var s = Math.abs(v).toFixed(c), p = s.split("."), i = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (v < 0 && Number(s) !== 0 ? MENOS : "") + i + (p.length > 1 ? "," + p[1] : "");
  }
  var PH = '<span class="ph">[a definir]</span>';
  /* referências do sistema construtivo (as mesmas de js/blocokref.js FONTES) */
  var REFS = {
    artigo: "MARTINS, C. M. P.; KRAUSE, M. O.; MARINHO, F. J. E.; LINS, I. O. Estudo comparativo do método de construção da casa pré-moldada em relação ao de alvenaria convencional, um estudo de caso em Itacaré, Bahia. Brazilian Journal of Development, Curitiba, v. 10, n. 11, p. 01-22, 2024.",
    doi: "10.34117/bjdv10n11-037",
    site: "Fabricante: Blocok Paredes Prontas ORIGINAL (Franquia Blocok, Nova Friburgo/RJ), site oficial https://blocok.vercel.app/ (acesso em 14/10/2026) — duas placas de microconcreto de 15 mm e EPS tipo F antichama, peça de 90 × 90 cm, espessuras de 10, 13, 15 e 20 cm; o site diz “alta resistência de 12MPa” sem dizer de quê e sem laudo (tratado como valor declarado) e lista ensaios sem resultado numérico."
  };
  /* número com unidade; não finito → [a definir] */
  function N(v, c, u) { var s = br(v, c); return s == null ? PH : s + (u ? NB + u : ""); }
  /* texto livre; vazio → [a definir]; "[...]" inteiro → vermelho */
  function T(v) {
    if (v == null || v === "" || (typeof v === "number" && !isFinite(v))) return PH;
    var s = String(v);
    if (/^\[.*\]$/.test(s)) return '<span class="ph">' + esc(s) + "</span>";
    return esc(s);
  }
  function pctTxt(v) { return fin(v) ? br(v * 100, 0) + NB + "%" : PH; }

  var ROT_FACE = { frente: "frente", fundo: "fundos", esquerda: "lateral esquerda", direita: "lateral direita", interna: "interna" };
  var ROT_LAJE = { nenhuma: "sem laje", macica: "laje maciça", "pre-moldada": "laje pré-moldada", trelicada: "laje treliçada" };

  function stat(k, txt) {
    if (k === "atende") return '<span class="st st-ok">✓ ' + (txt || "atende") + "</span>";
    if (k === "pendente") return '<span class="st st-pend">! ' + (txt || "pendente") + "</span>";
    if (k === "nao") return '<span class="st st-nao">✗ ' + (txt || "não atende") + "</span>";
    return '<span class="st st-na">— ' + (txt || "não verificado") + "</span>";
  }
  function statOk(ok) { return ok === true ? stat("atende") : (ok === false ? stat("nao") : stat("na")); }

  function mat(fck, fyk) {
    var fcd = fck / 1.4, fctm = 0.3 * Math.pow(fck, 2 / 3), Eci = 5600 * Math.sqrt(fck);
    return { fcd: fcd, fyd: fyk / 1.15, fctm: fctm, fctkInf: 0.7 * fctm, fctkSup: 1.3 * fctm, Eci: Eci, Ecs: Math.min(1, 0.8 + 0.2 * fck / 80) * Eci };
  }

  /* ----------------------------------------------------------------- CSS */
  function css(c) {
    var A = COR.azul, mb = "font: 7.3pt 'Segoe UI', Helvetica, Arial, sans-serif; color: #5b6774;";
    function cssStr(s) { return '"' + String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ").replace(/</g, "\\3c ") + '"'; }
    return "@page { size: A4; margin: 20mm 14mm 17mm 18mm;" +
      " @top-left { content: " + cssStr(c.topoE) + "; " + mb + " vertical-align: bottom; padding-bottom: 3mm; border-bottom: 0.6pt solid " + COR.areia + "; }" +
      " @top-right { content: " + cssStr(c.topoD) + "; " + mb + " vertical-align: bottom; padding-bottom: 3mm; border-bottom: 0.6pt solid " + COR.areia + "; }" +
      " @bottom-left { content: " + cssStr(c.rodE) + "; " + mb + " vertical-align: top; padding-top: 3mm; }" +
      " @bottom-right { content: \"Página \" counter(page) \" de \" counter(pages); " + mb + " vertical-align: top; padding-top: 3mm; } }" +
      "@page :first { @top-left { content: none; border: none; } @top-right { content: none; border: none; } @bottom-left { content: none; } @bottom-right { content: none; } }" +
      "html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }" +
      "body { font: 9.2pt/1.42 'Segoe UI', Helvetica, Arial, sans-serif; color: #1d2733; background: #ffffff; margin: 0; }" +
      "@media screen { body { max-width: 182mm; margin: 10mm auto; padding: 0 10mm; } .sec { border-top: 1px dashed #c9d2dc; margin-top: 8mm; padding-top: 5mm; } }" +
      "h1 { font-size: 20pt; font-weight: 600; margin: 2mm 0 2mm; color: " + A + "; letter-spacing: -0.01em; }" +
      "h2 { font-size: 13.5pt; font-weight: 600; margin: 0 0 4mm; padding-bottom: 1.6mm; border-bottom: 1.4pt solid " + A + "; color: #1d2733; break-after: avoid; }" +
      "h2 .num { color: " + A + "; margin-right: 3mm; }" +
      "h3 { font-size: 10.4pt; font-weight: 600; margin: 5mm 0 2mm; color: " + A + "; break-after: avoid; } h3 .sn { margin-right: 2mm; }" +
      "p { margin: 0 0 2.2mm; text-align: justify; } ul, ol { margin: 0 0 2.4mm; padding-left: 5mm; } li { margin-bottom: 0.8mm; }" +
      ".sec { break-before: page; } .sec.cont { break-before: auto; margin-top: 8mm; }" +
      "table.t { width: 100%; border-collapse: collapse; margin: 1.5mm 0 4mm; font-size: 7.7pt; line-height: 1.3; font-variant-numeric: tabular-nums; }" +
      "table.t caption { caption-side: top; text-align: left; font-size: 8.1pt; padding-bottom: 1.2mm; color: #1d2733; }" +
      "table.t th { background: #e6edf3; color: " + A + "; font-weight: 600; text-align: left; border: 0.5pt solid #b8c4d0; padding: 1mm 1.3mm; vertical-align: bottom; }" +
      "table.t td { border: 0.5pt solid #ccd5de; padding: 0.85mm 1.3mm; vertical-align: top; overflow-wrap: break-word; }" +
      "table.t tbody tr:nth-child(even) td { background: #f6f8fa; }" +
      "table.t th.n, table.t td.n { text-align: right; white-space: nowrap; }" +
      "table.compacta { font-size: 7pt; } table.compacta td, table.compacta th { padding: 0.6mm 0.9mm; }" +
      "table.ficha td:first-child { width: 28%; color: #3a4654; }" +
      "thead { display: table-header-group; } tr { break-inside: avoid; } caption { break-after: avoid; }" +
      ".eq { font-family: 'Cambria Math', Cambria, 'Times New Roman', serif; font-size: 8.6pt; }" +
      ".ref { font-size: 7.2pt; color: #4a5664; }" +
      ".ph { color: #b3261e; font-weight: 600; } .na { color: #6b5d45; font-style: italic; }" +
      ".st { display: inline-block; font-weight: 700; font-size: 7.2pt; padding: 0 1.4mm; border-radius: 0.8mm; white-space: nowrap; }" +
      ".st-ok { color: " + COR.verde + "; border: 0.8pt solid " + COR.verde + "; background: #eef6ea; }" +
      ".st-pend { color: #8a5a00; border: 0.8pt dashed #8a5a00; background: #fbf3dc; }" +
      ".st-nao { color: #ffffff; border: 0.8pt solid " + COR.falha + "; background: " + COR.falha + "; }" +
      ".st-na { color: #4a5664; border: 0.8pt dotted #8a97a6; background: #f1f3f5; font-weight: 600; }" +
      ".caixa { border: 0.6pt solid #b8c4d0; border-left: 2.4pt solid " + A + "; background: #f3f6f9; padding: 2.2mm 3mm; margin: 2mm 0 4mm; break-inside: avoid; }" +
      ".caixa.alerta { border-left-color: " + COR.alerta + "; background: #fbf6ea; border-left-style: dashed; } .caixa.erro { border-left-color: " + COR.falha + "; background: #fbf1ef; border-left-width: 4pt; } .caixa ul, .caixa ol { margin: 1.5mm 0 0; }" +
      ".caixa .cx-t { font-weight: 700; margin-bottom: 1mm; }" +
      ".capa { padding-top: 4mm; } .capa-faixa { display: flex; height: 1.3mm; margin: 4mm 0 6mm; } .capa-faixa span { display: block; height: 100%; } .capa-faixa .f1 { flex: 6; background: " + A + "; } .capa-faixa .f2 { flex: 2; background: " + COR.areia + "; } .capa-faixa .f3 { flex: 1; background: " + COR.verde + "; }" +
      ".capa .sobre { font-size: 8.5pt; letter-spacing: 0.2em; color: " + COR.marrom + "; font-weight: 600; text-transform: uppercase; } .capa .sub { color: #4a5664; font-size: 9.6pt; margin-bottom: 5mm; }" +
      ".sumario { margin: 5mm 0 0; } ol.sum { list-style: none; padding: 0; margin: 2mm 0 4mm; font-size: 9.6pt; columns: 2; column-gap: 8mm; }" +
      "ol.sum li { padding: 1mm 0; border-bottom: 0.5pt solid #e1e7ed; break-inside: avoid; } ol.sum .sn { display: inline-block; width: 8mm; color: " + A + "; font-weight: 600; } ol.sum a { color: #1d2733; text-decoration: none; }" +
      ".assin-grade { display: flex; justify-content: space-between; gap: 6mm; margin: 18mm 0 4mm; break-inside: avoid; } .assin { flex: 1; text-align: center; font-size: 8.2pt; }" +
      ".assin-linha { border-top: 0.7pt solid #1d2733; margin-bottom: 2mm; }" +
      ".mem-passo { margin-bottom: 0; }";
  }

  /* --------------------------------------------------------------- GERAR */
  function gerar(r, opcoes) {
    opcoes = opcoes || {};
    var avisos = [], nTab = 0;
    if (!r || typeof r !== "object" || !arr(r.paredes).length) {
      return { ok: false, html: "", secoes: [], avisos: ["Memorial não gerado: falta o resultado do cálculo (BlocokCalc.calcular) com ao menos uma parede."] };
    }
    var P = obj(r.parametros), V = obj(r.vento), FUND = obj(r.fundacao), CONS = obj(r.consolidado), TOT = obj(CONS.totais);
    var paredes = arr(r.paredes), obraO = obj(opcoes.obra), docO = obj(opcoes.documento), rtO = obj(opcoes.responsavel);
    var CAT = (BlocokExec && BlocokExec.CATALOGO) || {}, DIR = (BlocokExec && BlocokExec.DIRETRIZ) || {};
    var matl = mat(fin(P.fck) ? P.fck : 25, fin(P.fyk) ? P.fyk : 500);

    function tab(cap, cab, linhas, o) {
      o = o || {}; nTab++;
      var num = o.num || [], h = '<table class="t ' + (o.cls || "") + '">';
      h += "<caption><b>Tabela " + nTab + "</b> — " + cap + "</caption>";
      if (o.larg) h += "<colgroup>" + o.larg.map(function (w) { return '<col style="width:' + w + '">'; }).join("") + "</colgroup>";
      h += "<thead><tr>" + cab.map(function (c, i) { return '<th class="' + (num.indexOf(i) >= 0 ? "n" : "") + '">' + c + "</th>"; }).join("") + "</tr></thead><tbody>";
      linhas.forEach(function (l) { h += "<tr>" + l.map(function (c, i) { return '<td class="' + (num.indexOf(i) >= 0 ? "n" : "") + '">' + c + "</td>"; }).join("") + "</tr>"; });
      return h + "</tbody></table>";
    }
    function caixa(tipo, tit, itens, textoLivre) {
      return '<div class="caixa ' + tipo + '"><div class="cx-t">' + tit + "</div>" + (textoLivre ? "<div>" + textoLivre + "</div>" : "") +
        (itens && itens.length ? "<ul>" + itens.map(function (i) { return "<li>" + i + "</li>"; }).join("") + "</ul>" : "") + "</div>";
    }
    function nomeParede(w) { return esc(w.id || "") + (w.nome ? " — " + esc(w.nome) : ""); }
    function cmDe(m) { return fin(m) ? br(m * 100, m * 100 === Math.round(m * 100) ? 0 : 1) : null; }
    function secBxH(b, h) { var a = cmDe(b), c = cmDe(h); return a == null || c == null ? PH : a + "×" + c; }
    function ref(s) { return '<span class="ref">' + esc(s) + "</span>"; }
    function subt(num, txt) { return '<h3><span class="sn">' + num + "</span>" + txt + "</h3>"; }

    /* ======================= 1 Identificação */
    function s1() {
      var ed = obj(obraO.edificacao);
      var dim = (fin(ed.comprimento) && fin(ed.largura)) ? br(ed.comprimento, 2) + NB + "m × " + br(ed.largura, 2) + NB + "m" + (fin(ed.altura) ? ", pé-direito " + br(ed.altura, 2) + NB + "m" : "") + (fin(ed.areaPlanta) ? " (área " + br(ed.areaPlanta, 1) + NB + "m²)" : "") : PH;
      var rtTxt = (rtO.nome || rtO.crea) ? esc(((rtO.abrev ? rtO.abrev + " " : "") + (rtO.nome || "")).trim()) + (rtO.crea ? " — " + esc(rtO.conselho || "CREA") + " " + esc(rtO.crea) : "") : '<span class="ph">[RESPONSÁVEL TÉCNICO — CREA]</span>';
      var dataTxt = r.data ? esc(String(r.data).split("-").reverse().join("/")) : PH;
      var linhas = [
        ["Obra", T(obraO.nome)], ["Cliente", T(obraO.cliente)], ["Local", T(obraO.local)], ["Edificação", dim],
        ["Documento", "Memorial de cálculo" + (docO.numero ? " " + esc(docO.numero) : "") + (docO.revisao ? " — revisão " + esc(docO.revisao) : "")],
        ["Data do cálculo", dataTxt],
        ["Responsável técnico", rtTxt],
        ["Situação do cálculo", (r.ok ? stat("atende", "sem erros de cálculo") : stat("nao", "com erros — ver seção 14"))]
      ];
      return '<p>Este memorial registra o cálculo e a verificação da edificação em painéis Blocok. Cada resultado traz a fórmula, a norma e a edição usadas; o que depende de dado não informado está marcado como pendência.</p>' +
        tab("Identificação da obra e do documento", ["Item", "Dado"], linhas, { cls: "ficha", larg: ["28%", "72%"] });
    }

    /* ======================= 2 Objeto e sistema construtivo */
    function s2() {
      var ks = Object.keys(CAT).sort(function (a, b) { return a - b; });
      var usadas = {}; arr(CONS.porEspessura).forEach(function (e) { usadas[e.espessura] = e; });
      var linhas = ks.map(function (k) {
        var c = CAT[k], u = usadas[k];
        return [esc(k), N(c.nucleo * 100, 0), N(c.peso, 0), c.concreto > 0 ? N(c.concreto * 100, 0) : "não aceita", N(c.tuboMax, 0), u ? esc(u.pecas) + " peças" : "—"];
      });
      return "<p>O Blocok é um painel pré-fabricado de 90 × 90 cm, com núcleo de EPS e duas faces de microconcreto de 1,5 cm, assentado em fiadas com junta de 1,5 cm e amarração (junta vertical nunca alinhada com a da fiada de baixo). A parede é montada sobre a fundação, e os pilaretes, as vergas, as contravergas e a cinta de respaldo são moldados dentro das próprias peças: retira-se todo o EPS da faixa (o concreto ocupa o núcleo inteiro, 7, 10, 12 ou 17 cm conforme a peça), arma-se e concreta-se, e as faces servem de fôrma.</p>" +
        tab("Peças do catálogo (espessura nominal) e uso nesta obra", ["Espessura (cm)", "Núcleo EPS (cm)", "Peso da peça (kg)", "Concreto útil embutido (cm)", "Tubo máx. (mm)", "Uso na obra"], linhas, { num: [0, 1, 2, 3, 4], larg: ["14%", "14%", "16%", "20%", "14%", "22%"] }) +
        caixa("alerta", "O painel não é elemento estrutural", [
          "Os laudos UFMG/LAEES (2022) aprovam o painel como <b>vedação</b>. Não há documento de avaliação técnica (DATec) que o autorize como parede portante.",
          "A estrutura desta edificação são os <b>pilaretes, vergas e cintas de concreto armado</b> moldados dentro das peças, calculados pela NBR 6118. O painel não é considerado elemento resistente; a cinta, porém, é concretada sobre ele e transmite parte da carga por contato. Essa parcela é limitada pela rigidez da cinta (flecha de ℓ/500 e 10 mm); a compressão por contato é verificada no painel como se ele recebesse toda a carga do topo (seção 8).",
          "Diretriz SiNAT nº 019 (maio/2026): transpasse mínimo da amarração de " + pctTxt(DIR.transpasseMin) + " da peça; elemento estrutural a cada " + N(DIR.espacamentoEstruturaMax, 1, "m") + " no máximo; ligação à estrutura a cada fiada, ancorada " + N(DIR.ancoragemLigacao * 100, 0, "cm") + " no mínimo; encunhamento sob a estrutura de " + N(DIR.encunhamentoMin * 1000, 0, "mm") + " no mínimo."
        ]) +
        '<p class="ref">Fontes do catálogo: ' + esc((BlocokExec && BlocokExec.FONTES && BlocokExec.FONTES.peca) || "[a definir]") + "; pesos: " + esc((BlocokExec && BlocokExec.FONTES && BlocokExec.FONTES.peso) || "[a definir]") + ".</p>" +
        '<p class="ref">Referências do sistema construtivo: ' + esc(REFS.artigo) + ' DOI <span class="ref">' + esc(REFS.doi) + "</span> — casa de Itacaré/BA construída com Blocok: placa de 10 cm, 3 fiadas até a laje, equipe de 3 profissionais, juntas com argamassa AC3, pilares e vergas embutidos na peça. " + esc(REFS.site) + "</p>";
    }

    /* ======================= 3 Normas */
    var USO = { nbr6118: "Pilaretes, vergas e cintas de concreto armado", nbr6120: "Cargas variáveis e pesos específicos", nbr6123: "Ação do vento", nbr8681: "Combinações de ações e coeficientes", nbr15575: "Deslocamento da vedação ao vento (h/350)", sinat019: "Paginação, amarração e espaçamento de elementos estruturais", nbr16868: "Resistência à flexão da junta — analogia, só informativa" };
    /* NORMA LIMPA (pedido do gerente, 14/10/2026): o documento do cliente traz
       número:ano e título — a nota interna de edição ("texto da biblioteca;
       vigente … — conferir") NÃO sai aqui; a dúvida da edição mora no arquivo
       interno docs/blocok/DUVIDAS-REFERENCIA.md. O parêntese com "conferir" de
       um resultado antigo (gravado antes desta revisão) também é tirado. */
    function normaLimpa(t) { return String(t).replace(/\s*\([^)]*conferir[^)]*\)/gi, "").replace(/\s*—\s*conferir\b/gi, "").trim(); }
    function s3() {
      var N0 = obj(r.normas), ks = Object.keys(N0);
      var linhas = ks.map(function (k) { return [T(normaLimpa(N0[k])), esc(USO[k] || "—")]; });
      if (r.fundacao && FUND.ref) linhas.push([esc(normaLimpa(String(FUND.ref).split(" (")[0])), "Fundações — o projeto de fundação é específico"]);
      return tab("Normas e documentos de referência", ["Norma", "Uso neste memorial"], linhas, { larg: ["54%", "46%"] });
    }

    /* ======================= 4 Modelo estrutural e hipóteses */
    function s4() {
      var dia = P.diafragma == null ? "automático (laje maciça, pré-moldada ou treliçada trava o topo)" : (P.diafragma ? "sim, informado" : "não, informado");
      return subt("4.1", "Modelo") +
        "<ol>" +
        "<li><b>Painel: vedação.</b> Verificado à ação do vento fora do plano como placa simplesmente apoiada nos quatro lados (base, cinta de respaldo e os dois pilaretes que o delimitam), por momentos elásticos de Navier (Timoshenko &amp; Woinowsky-Krieger, <i>Theory of Plates and Shells</i>, cap. 5), com ν = 0,2. A resistência do painel vem do <b>ensaio simulado</b> pelos materiais da peça (seção 7); o valor do ensaio do fabricante (NBR 15575-2, Anexo A, ou Diretriz SiNAT), quando informado, vale por cima.</li>" +
        "<li><b>Estrutura: pilaretes, vergas e cintas de concreto armado</b>, dimensionados pela NBR 6118 — flexão simples, cisalhamento pelo modelo I, flecha por Branson com fluência, flexo-compressão com efeitos de 2ª ordem pelo pilar-padrão de curvatura aproximada.</li>" +
        "<li><b>Pilarete estrutural</b> (recebe laje ou cobertura) só se cumprir a NBR 6118, 13.2.3: menor dimensão de 14 cm ou mais, com γn = 1,95 − 0,05·b para b entre 14 e 19 cm, e área de 360 cm² ou mais. Na prática, só a peça de 20 cm (concreto de 17 cm). Nas peças de 13 e 15 cm o pilarete é de <b>travamento</b> (vento) e não recebe carga vertical. A peça de 10 cm (concreto de 7 cm) não comporta verga, pilarete nem cinta.</li>" +
        "</ol>" +
        subt("4.2", "Hipóteses de cálculo") +
        "<ul>" +
        "<li>Vigas e cintas biapoiadas. Vão efetivo da verga: l<sub>ef</sub> = vão + 2·mín(apoio/2; 0,3·h). Cinta: vão entre eixos de pilaretes consecutivos.</li>" +
        "<li>Cargas verticais no topo das paredes de apoio: reação de meio vão, (g + q)·l/2 por metro, somada ao peso próprio do painel acima da verga ou da cinta (peso por m² do painel e concreto a 25 kN/m³).</li>" +
        "<li>Pilarete: bi-rotulado, l<sub>e</sub> = altura útil da parede; faixa tributária do vento = metade da distância aos elementos vizinhos; três combinações verificadas, vale a de maior armadura. O momento de vento do pilarete é o <b>característico</b>; o coeficiente 1,4 entra nas combinações (q<sub>wd</sub> = 1,4·q<sub>wk</sub>). N<sub>k</sub> inclui a reação da cinta e das vergas apoiadas no pilarete.</li>" +
        "<li>Cinta contínua sobre os pilaretes: momento positivo no vão (armadura inferior) e momento negativo nos apoios (armadura superior); com vento horizontal, armadura lateral. Verga que está sob a cinta (na cinta) usa a armadura da própria cinta, sem barras próprias.</li>" +
        "<li>Flecha de verga e cinta limitada a ℓ/500 e 10 mm (NBR 6118, Tabela 13.3, paredes de alvenaria após a construção).</li>" +
        "<li>Cinta sem diafragma no topo (sem laje) verifica também a flexão horizontal pelo vento entre as paredes transversais. Diafragma neste cálculo: " + esc(dia) + ".</li>" +
        "<li>Verga ou cinta que não passa na altura de 15 cm tem a altura elevada em passos de 5 cm (verga até 45 cm, cinta até 60 cm); a parede é então paginada de novo com essa altura e todos os resultados deste memorial já são os da segunda passada.</li>" +
        "<li>O painel não é considerado elemento resistente à carga vertical. A cinta é concretada sobre ele e transmite parte da carga por contato; essa parcela é limitada pela rigidez da cinta. A verificação do painel à compressão por contato considera, por segurança, a carga inteira do topo.</li>" +
        "<li>Rigidez do painel para o deslocamento: sanduíche de composição total com faces de f<sub>ck</sub> = " + N(P.fckFace, 0, "MPa") + " (declarado pelo fabricante, sem laudo; atribuído só ao microconcreto da face) — abaixo do escopo da NBR 6118 (C20); a rigidez EI vem do ensaio simulado e é substituída pela do fabricante, quando informada.</li>" +
        "<li>Fundação: pré-dimensionamento por carga linear característica, com 10 % a mais para o peso da própria fundação. O projeto de fundação é específico (NBR 6122).</li>" +
        "</ul>";
    }

    /* ======================= 5 Materiais */
    function s5() {
      var cobT = { I: 25, II: 30, III: 40, IV: 50 };
      var porCaa = {}; paredes.forEach(function (w) { if (w.caa) { (porCaa[w.caa] = porCaa[w.caa] || []).push(w.id); } });
      var caaTxt = Object.keys(porCaa).map(function (k) { return "CAA " + esc(k) + " (" + esc(porCaa[k].join(", ")) + ")"; }).join(" · ");
      var cobTxt = Object.keys(porCaa).map(function (k) { return N(cobT[k], 0, "mm"); }).join(" / ");
      var linhas = [
        ["Concreto de preenchimento", "C" + (fin(P.fck) ? P.fck : "?"), "f<sub>ck</sub> = " + N(P.fck, 0, "MPa") + " · f<sub>cd</sub> = f<sub>ck</sub>/1,4 = " + N(matl.fcd, 2, "MPa") + " · f<sub>ctm</sub> = 0,3·f<sub>ck</sub><sup>2/3</sup> = " + N(matl.fctm, 2, "MPa") + " · E<sub>cs</sub> = " + N(matl.Ecs / 1000, 1, "GPa")],
        ["Aço longitudinal", "CA-50", "f<sub>yk</sub> = " + N(P.fyk, 0, "MPa") + " · f<sub>yd</sub> = f<sub>yk</sub>/1,15 = " + N(matl.fyd, 1, "MPa") + " · E<sub>s</sub> = " + N(P.Es / 1000, 0, "GPa")],
        ["Estribos", "φ" + (fin(P.estribo) ? br(P.estribo, 1) : "?") + " mm", "f<sub>ywk</sub> = " + N(P.fywk, 0, "MPa") + " (f<sub>ywd</sub> limitada a 435 MPa)"],
        ["Bitolas longitudinais", "φ" + N(P.barraViga, 0) + " mm (vergas e cintas) · φ" + N(P.barraPilar, 0) + " mm (pilaretes)", "Mínimo de 4 φ" + N(P.barraPilar, 0) + " no pilarete estrutural (NBR 6118, 18.4.2)"],
        ["Classe de agressividade", caaTxt || ("CAA " + T(P.caa)), "Fachadas com a CAA do projeto (" + T(P.caa) + "); parede interna com classe mais branda (NBR 6118:2014, Tabela 6.1, nota a). Cobrimento nominal de viga e pilar: " + (cobTxt || PH) + " (NBR 6118, Tabela 7.2)"],
        ["Faces do painel", "Microconcreto de 1,5 cm", "f<sub>ck</sub> " + N(P.fckFace, 0, "MPa") + " — declarado pelo fabricante, sem laudo (site oficial: “alta resistência de 12MPa”, sem dizer de quê); usado só como f<sub>ck</sub> da face no ensaio simulado (seção 7), nunca como resistência do painel"],
        ["Núcleo", "EPS", "Sem função resistente; retirado nas faixas de concreto"],
        ["Argamassa de assentamento", "Junta de 1,5 cm cheia nos dois sentidos", "Consumo <b>estimado</b> — parâmetro editável, a confirmar com o fabricante"]
      ];
      return tab("Materiais adotados", ["Material", "Especificação", "Propriedades"], linhas, { larg: ["22%", "26%", "52%"] });
    }

    /* ======================= 6 Ações */
    function s6() {
      var C0 = obj(r.cargas), rot = { residencial: "Residencial (dormitório, sala, copa, cozinha, sanitário)", servico: "Despensa, área de serviço e lavanderia", forro: "Forro acessível só para manutenção", lajeCobertura: "Laje de cobertura com acesso só para manutenção", telhado: "Telhado (mínimo)" };
      var lc = Object.keys(C0).map(function (k) { return [esc(rot[k] || k), N(C0[k].q, 2), ref(C0[k].ref)]; });
      var lj = obj(P.laje), cb = obj(P.cobertura);
      var linhasP = [
        ["Laje (" + esc(ROT_LAJE[lj.tipo] || lj.tipo || "") + ")", lj.tipo === "nenhuma" ? "—" : N(lj.g, 2), lj.tipo === "nenhuma" ? "—" : N(lj.q, 2), lj.tipo === "nenhuma" ? "—" : N(lj.vao, 2), lj.tipo === "nenhuma" ? "—" : N((lj.g + lj.q) * lj.vao / 2, 2)],
        ["Cobertura", N(cb.g, 2), N(cb.q, 2), N(cb.vao, 2), N((cb.g + cb.q) * cb.vao / 2, 2)]
      ];
      var s = subt("6.1", "Cargas verticais — NBR 6120:2019") +
        tab("Cargas variáveis de referência (NBR 6120:2019)", ["Uso", "q (kN/m²)", "Referência"], lc, { num: [1], larg: ["44%", "12%", "44%"] }) +
        tab("Cargas adotadas nesta obra e reação nas paredes de apoio", ["Elemento", "g (kN/m²)", "q (kN/m²)", "Vão (m)", "(g + q)·l/2 (kN/m)"], linhasP, { num: [1, 2, 3, 4] });
      s += subt("6.2", "Vento — NBR 6123");
      if (V.ok) {
        var fk = Object.keys(obj(V.porFace)), cf = obj(V.coef);
        var lv = fk.map(function (f) { return [esc(ROT_FACE[f] || f), fin(cf[f]) ? N(cf[f], 2) : "—", N(V.porFace[f], 3), N(1.4 * V.porFace[f], 3)]; });
        if (fin(V.externa)) lv.push(["fachada — pior face (adotada em toda fachada)", "—", N(V.externa, 3), N(1.4 * V.externa, 3)]);
        if (fin(V.bordaLocal)) lv.push(["faixa de borda (cpe médio, informativa)", "—", N(V.bordaLocal, 3), N(1.4 * V.bordaLocal, 3)]);
        lv.push(["parede interna", "—", N(V.interna, 3), N(1.4 * V.interna, 3)]);
        s += "<p>V<sub>0</sub> = " + (fin(V.v0) ? N(V.v0, 1, "m/s") : PH) + " · V<sub>k</sub> = " + (fin(V.vk) ? N(V.vk, 2, "m/s") : PH) + " · categoria " + T(obj(P.vento).categoria) + " · grupo S3 " + T(obj(P.vento).grupoS3) + " · q da vedação = " + N(V.qVed, 3, "kN/m²") + " · vento nas 4 direções, com faces permeáveis (NBR 6123, 6.2.5) e faixas de borda" + (fin(V.dcpi) ? " · Δc<sub>pi</sub> = " + N(V.dcpi, 2) : "") + ".</p>" +
          tab("Pressão de vento de projeto por face da vedação", ["Face", "Coeficiente máx. |c<sub>pe</sub> − c<sub>pi</sub>|", "p<sub>k</sub> (kN/m²)", "p<sub>d</sub> = 1,4·p<sub>k</sub> (kN/m²)"], lv, { num: [1, 2, 3] }) +
          '<p class="ref">' + esc(V.fonte || "") + ". As quatro direções do vento foram verificadas e a pior face governa toda a fachada. Parede interna: q·Δc<sub>pi</sub>.</p>";
      } else {
        s += caixa("erro", "Vento não calculado", [], "Sem V<sub>0</sub> ou sem a localização da obra o motor não calcula o vento; as pressões entram como zero e as verificações ao vento <b>não valem</b> até a pendência ser resolvida (seção 14).");
      }
      s += subt("6.3", "Combinações de ações — NBR 8681") +
        "<ul><li>Vigas, cintas e pilaretes: γ<sub>g</sub> = γ<sub>q</sub> = γ<sub>w</sub> = 1,4; ψ<sub>0</sub> = 0,5 (cargas de uso residencial) e 0,6 (vento); ação permanente favorável com γ = 1,0.</li>" +
        "<li>Pilarete estrutural — 1,4G + 1,4(W + 0,5Q); 1,4G + 1,4(Q + 0,6W); 1,0G + 1,4W.</li>" +
        "<li>Flecha das vigas e cintas: combinação quase permanente, G + 0,3Q.</li>" +
        "<li>Deslocamento do painel ao vento: 0,9G + 0,8W (NBR 15575-4), limite h/350.</li></ul>";
      return s;
    }

    /* ======================= 7 Ensaio simulado do painel */
    function s7e() {
      var porEsp = {}, ordem = [];
      paredes.forEach(function (w) {
        var en = obj(obj(w.painel).ensaio);
        if (arr(en.modos).length && !porEsp[w.espessura]) { porEsp[w.espessura] = { en: en, ids: [] }; ordem.push(w.espessura); }
        if (porEsp[w.espessura]) porEsp[w.espessura].ids.push(w.id);
      });
      ordem.sort(function (a, b) { return a - b; });
      if (!ordem.length) return "<p>Esta revisão do cálculo não traz o ensaio simulado do painel.</p>";
      var PA = (BlocokEnsaio && BlocokEnsaio.PARAM) || null, prm = [];
      if (PA) {
        var fc = obj(PA.face), gc = obj(PA.gamaCSimples), ep = obj(PA.eps), ge = obj(PA.gamaEps), ju = obj(PA.junta), pp = obj(PA.proporcaoParalela);
        prm = [
          ["Faces de microconcreto", "t = " + N(fc.t * 100, 1, "cm") + " · f<sub>ck</sub> = " + N(fc.fck, 0, "MPa"), esc(fc.fonte || "")],
          ["Coeficiente do concreto simples", "γ<sub>c</sub> = " + N(gc.valor, 2), esc(gc.fonte || "")],
          ["Núcleo de EPS", "τ<sub>k</sub> = " + N(ep.tauK * 1000, 0, "kPa") + " · G = " + N(ep.Gc, 1, "MPa") + " · E<sub>c</sub> = " + N(ep.Ec, 1, "MPa") + " · aderência face–EPS ≥ " + N(ep.fTperp, 2, "MPa"), esc(ep.fonte || "")],
          ["Coeficiente do EPS", "γ<sub>m</sub> = " + N(ge.valor, 1), esc(ge.fonte || "")],
          ["Junta de argamassa", "f<sub>bk</sub> (aderência) = " + N(ju.fbk, 2, "MPa") + " · f<sub>k</sub> argamassa = " + N(ju.fArg, 0, "MPa") + " · γ<sub>m</sub> = " + N(ju.gamaM, 1), esc(ju.fonte || "")],
          ["Flexão paralela à fiada", N(pp.valor, 1) + " × a perpendicular", esc(pp.fonte || "")]
        ];
      } else {
        arr(porEsp[ordem[0]].en.memoria).forEach(function (p) { prm.push([esc(p.passo || ""), esc(p.formula || ""), esc(p.referencia || "")]); });
      }
      var s = "<p>O painel Blocok é um <b>sanduíche</b>: duas faces de microconcreto de 1,5 cm, núcleo de EPS e junta de argamassa entre as peças. Como o fabricante não publica a resistência do painel, o sistema faz um <b>ensaio simulado</b> pelos materiais da peça (modelo analítico de painel sanduíche — Allen; EN 14509) e o resultado já vale para a verificação da seção 8. Os modos de ruptura de flexão (por metro de painel, nas duas direções), de cisalhamento do núcleo e de compressão são calculados para cada espessura usada na obra; governa o menor.</p>" +
        tab("Parâmetros adotados no ensaio simulado e fonte de cada um", ["Parâmetro", "Valor adotado", "Fonte"], prm, { cls: "compacta", larg: ["20%", "30%", "50%"] });
      ordem.forEach(function (e) {
        var en = porEsp[e].en, fl = [], nn = [];
        arr(en.modos).forEach(function (m) {
          var gv = [];
          if (m.modo === en.governaX) gv.push("x");
          if (m.modo === en.governaY) gv.push("y");
          fl.push([esc(m.modo), m.direcao ? (m.direcao === "x" ? "horizontal (x)" : "vertical (y)") : "ambas", N(m.MRd, 3), gv.length ? "<b>governa " + gv.join(" e ") + "</b>" : "—"]);
        });
        arr(en.modosN).forEach(function (m) { nn.push([esc(m.modo), N(m.NRd, 1), m.modo === en.governaN ? "<b>governa</b>" : "—"]); });
        s += subt("7." + (ordem.indexOf(e) + 1), "Peça de " + N(e, 0, "cm") + " (" + esc(porEsp[e].ids.join(", ")) + ")") +
          tab("Peça de " + N(e, 0, "cm") + " — modos de flexão fora do plano (M<sub>Rd</sub> de projeto)", ["Modo", "Direção", "M<sub>Rd</sub> (kN·m/m)", "Governa"], fl, { num: [2], larg: ["52%", "16%", "16%", "16%"] }) +
          tab("Peça de " + N(e, 0, "cm") + " — modos de compressão (N<sub>Rd</sub>) e cisalhamento", ["Modo", "Resistência (kN/m)", "Governa"], nn.concat([["cisalhamento do núcleo (V<sub>Rd</sub>)", N(en.VRd, 2), "—"]]), { num: [1], larg: ["60%", "20%", "20%"] }) +
          "<p>Resistência de projeto adotada: M<sub>Rd,x</sub> = " + N(en.MRdX, 3, "kN·m/m") + " (governa: " + esc(en.governaX || "") + "); M<sub>Rd,y</sub> = " + N(en.MRdY, 3, "kN·m/m") + " (governa: " + esc(en.governaY || "") + "); V<sub>Rd</sub> = " + N(en.VRd, 2, "kN/m") + "; N<sub>Rd</sub> = " + N(en.NRd, 1, "kN/m") + " (governa: " + esc(en.governaN || "") + ").</p>";
      });
      s += caixa("alerta", "Limite do modelo", [], "O f<sub>ck</sub> de 12 MPa das faces está <b>abaixo do escopo da NBR 6118</b> (concreto C20 ou superior): as fórmulas do concreto simples são <b>extrapoladas</b> para esse valor e o resultado é de ensaio simulado, não de laboratório. Os valores do ensaio do fabricante, quando informados, substituem os simulados.");
      var EF = BlocokEnsaio && BlocokEnsaio.ENSAIOS_FABRICANTE;
      if (EF && arr(EF.nomes).length) s += "<p>Ensaios que o fabricante <b>lista</b> no site oficial, só pelo nome — o site não publica o resultado de nenhum, e nada disso entra neste cálculo: " + EF.nomes.map(esc).join("; ") + '. <span class="ref">Fonte: ' + esc(EF.fonte) + ".</span></p>";
      return s;
    }

    /* ======================= 8 Painel */
    function s7() {
      var A = [], B = [];
      paredes.forEach(function (w) {
        var p = obj(w.painel), vt = obj(w.vento);
        if (!fin(p.vaoHorizontal) || p.MSdX == null) { A.push([nomeParede(w), N(w.espessura, 0), "—", "—", "—", "—", "—", stat("na", "sem campo de painel")]); return; }
        var vf = obj(p.verificacoes), st = p.status === "atende" ? stat("atende") : (p.status === "nao-atende" ? stat("nao") : stat("na"));
        var fm = fin(p.flechaMm) ? p.flechaMm : (fin(p.flecha) ? p.flecha * 1000 : null);
        var fmTxt = fm == null ? PH : (fm < 0.005 ? "&lt; 0,01" : br(fm, 2));
        var aj = obj(w.ajustePainel), ajTxt = fin(aj.espMaxPilaretes) ? "pilaretes a " + N(aj.espMaxPilaretes, 1, "m") + (aj.cintaIntermediaria ? " + cinta intermediária" : "") : "—";
        var mrdx = p.MRdX != null ? N(p.MRdX, 3) : PH, mrdy = p.MRdY != null ? N(p.MRdY, 3) : PH;
        A.push([nomeParede(w), N(w.espessura, 0), esc(ROT_FACE[vt.face] || vt.face || "—"), N(vt.pk, 3), N(p.vaoHorizontal, 2) + " × " + N(p.vaoVertical, 2),
          N(p.MSdX, 3) + " / " + mrdx + " " + (vf.flexaoX === false ? stat("nao") : stat("atende")), N(p.MSdY, 3) + " / " + mrdy + " " + (vf.flexaoY === false ? stat("nao") : stat("atende")),
          vf.flexaoX === false || vf.flexaoY === false ? stat("nao") : stat("atende")]);
        B.push([nomeParede(w), N(p.VSd, 2) + " / " + N(p.VRd, 2) + " " + (vf.cisalhamento === false ? stat("nao") : stat("atende")), N(p.NSd, 1) + " / " + N(p.NRd, 1) + " " + (vf.compressao === false ? stat("nao") : stat("atende")),
          fmTxt + " / " + N(p.flechaLim * 1000, 1) + " " + (p.flechaOk === false ? stat("nao") : stat("atende")), esc(p.fonte || ""), ajTxt, st]);
      });
      return "<p>Cada campo de painel é a faixa de parede entre dois elementos estruturais consecutivos (pilaretes ou apoios nas paredes ortogonais), limitada em baixo pela base e em cima pela cinta de respaldo. Os momentos são de projeto (p<sub>d</sub> = 1,4·p<sub>k</sub>), por metro de painel, nas duas direções: <b>M<sub>Sd,x</sub></b> na direção horizontal (vão maior do campo) e <b>M<sub>Sd,y</sub></b> na vertical. A resistência é a do ensaio simulado (seção 7), ou a do fabricante quando informada.</p>" +
        tab("Painel ao vento fora do plano — flexão, maior campo de cada parede (M<sub>Sd</sub> / M<sub>Rd</sub>, kN·m/m)", ["Parede", "Esp. (cm)", "Face", "p<sub>k</sub> (kN/m²)", "Vão h × v (m)", "x: M<sub>Sd</sub> / M<sub>Rd</sub>", "y: M<sub>Sd</sub> / M<sub>Rd</sub>", "Flexão"], A, { cls: "compacta", num: [1, 3, 4, 5, 6], larg: ["16%", "5%", "9%", "8%", "11%", "19%", "19%", "13%"] }) +
        tab("Painel — cisalhamento, compressão por contato e deslocamento", ["Parede", "V<sub>Sd</sub> / V<sub>Rd</sub> (kN/m)", "N<sub>Sd</sub> / N<sub>Rd</sub> (kN/m)", "Deslocamento / limite h/350 (mm)", "Fonte da resistência", "Ajuste aplicado", "Situação"], B, { cls: "compacta", num: [1, 2, 3], larg: ["13%", "15%", "15%", "17%", "20%", "12%", "8%"] }) +
        '<p class="ref">N<sub>Sd</sub>: compressão por contato verificada como se o painel recebesse toda a carga do topo (hipótese a favor da segurança). Deslocamento: 0,9G + 0,8W sobre o vão vertical do campo, com a rigidez EI do ensaio simulado; valores abaixo de 0,01 mm aparecem como “&lt; 0,01”. Ajuste aplicado: quando o painel não passava, o sistema aproximou os pilaretes e/ou pôs cinta intermediária até ele passar.</p>';
    }

    /* ======================= 8 Vergas */
    function s8() {
      var g1 = [], g2 = [], aj = [];
      paredes.forEach(function (w) {
        arr(w.vergas).forEach(function (v) {
          var f = obj(v.flexao), c = obj(v.cisalhamento), fl = v.flecha;
          var ajusta = obj(w.ajustes).vergaAltura || v.hRecomendada;
          if (ajusta) aj.push(esc(v.id) + " (" + esc(w.id) + "): h = " + N(ajusta * 100, 0, "cm") + " no cálculo");
          g1.push([esc(v.id) + (v.viga ? " (viga)" : ""), esc(w.id), N(v.vao, 2), N(v.lef, 2), secBxH(v.b, v.h), N(v.d * 100, 1), N(v.gk, 2) + " / " + N(v.qk, 2), N(v.Md, 2), N(v.Vd, 2)]);
          g2.push([esc(v.id), f.ok ? N(f.AsCalc, 2) + " / " + N(f.AsMin, 2) : "—", v.naCinta ? "na cinta (armadura da cinta)" : (f.ok ? esc(v.armadura || "") : '<span class="ph">sem solução</span>'),
            c.ok ? "φ" + N(c.phi, 1) + " c/ " + N(c.s * 100, 0, "cm") + " <span class='ref'>(V<sub>Rd2</sub> " + N(c.VRd2, 1, "kN") + ")</span>" : "—",
            fl ? N(fl.total, 2) + " / " + N(fl.limite, 2) : "—", v.ok ? stat("atende") : stat("nao"), ajusta ? N(ajusta * 100, 0, "cm") : "—"]);
        });
      });
      if (!g1.length) return "<p>Nenhuma parede tem vão com verga neste cálculo.</p>";
      return "<p>Verga sobre cada porta e janela, com apoio de max(30 cm; 20 % do vão) de cada lado; vão superior a 2,00 m é dimensionado como viga. A largura é a do concreto útil da peça. Carga: peso próprio do painel acima, peso do concreto da verga e, quando a verga está sob a cinta de respaldo, a reação da laje e da cobertura.</p>" +
        tab("Vergas — vãos, seção e esforços de cálculo", ["Verga", "Parede", "Vão (m)", "l<sub>ef</sub> (m)", "b × h (cm)", "d (cm)", "g<sub>k</sub> / q<sub>k</sub> (kN/m)", "M<sub>d</sub> (kN·m)", "V<sub>d</sub> (kN)"], g1, { cls: "compacta", num: [2, 3, 4, 5, 6, 7, 8] }) +
        tab("Vergas — armadura e verificações (flexão: NBR 6118, 17.2.2 e 17.3.5.2.1; cisalhamento: 17.4.2.2; flecha: 17.3.2.1 e Tabela 13.3)", ["Verga", "A<sub>s</sub> calc. / mín. (cm²)", "Armadura longitudinal", "Estribos", "Flecha total / limite ℓ/500 e 10 mm (mm)", "Status", "h adotado"], g2, { cls: "compacta", num: [1, 4, 6] }) +
        (aj.length ? caixa("neutra", "Alturas elevadas pelo cálculo", aj, "A verga de 15 cm não passou; a altura foi elevada e a faixa de EPS retirado, o concreto, o aço e a prancha já saem com a altura final:") : "");
    }

    /* ======================= 9 Cintas */
    function s9() {
      var g = [], aj = [];
      paredes.forEach(function (w) {
        var c = w.cinta; if (!c) return;
        var f = obj(c.flexao), q = obj(c.cisalhamento), ajusta = obj(w.ajustes).cintaAltura || c.hRecomendada;
        if (ajusta) aj.push(esc(w.id) + ": h = " + N(ajusta * 100, 0, "cm"));
        var vh = c.ventoHorizontal;
        var fn = obj(c.flexaoNeg);
        g.push([esc(w.id) + (c.continua ? " (contínua)" : ""), N(c.vaoEntrePilaretes, 2), N(c.h * 100, 0), N(c.gk, 2) + " / " + N(c.qk, 2), N(c.Md, 2) + (fin(c.MdNeg) ? " / " + MENOS + N(c.MdNeg, 2) : ""), f.ok ? N(f.AsCalc, 2) + " / " + N(f.AsMin, 2) + (fn.ok ? " · neg. " + N(fn.AsCalc, 2) + " / " + N(fn.AsMin, 2) : "") : "—",
          c.armadura ? esc(c.armadura) : '<span class="ph">sem solução</span>', q.ok ? "φ" + N(q.phi, 1) + " c/ " + N(q.s * 100, 0, "cm") : "—",
          c.flecha ? N(c.flecha.total, 2) + " / " + N(c.flecha.limite, 2) : "—",
          c.diafragma ? "sim" : (vh ? "não — M<sub>d,h</sub> " + N(vh.Md, 2) + " kN·m (armadura lateral)" + (obj(vh.flexao).ok ? "" : " ✗") : "não"), c.ok ? stat("atende") : stat("nao")]);
      });
      if (!g.length) return "<p>Nenhuma parede tem cinta de respaldo neste cálculo.</p>";
      return "<p>A cinta de respaldo corre no topo de cada parede. Calculada como viga contínua sobre os pilaretes, com o peso do próprio concreto e a reação da laje e da cobertura: armadura inferior para o momento positivo do vão e armadura superior nos apoios para o momento negativo. Sem laje no topo (sem diafragma), verifica-se também a flexão horizontal pelo vento entre as paredes transversais, com armadura lateral. A flecha é limitada a ℓ/500 e 10 mm (NBR 6118, Tabela 13.3), o que reduz a parcela de carga transmitida ao painel por contato (ver a verificação do painel, seção 8).</p>" +
        tab("Cintas de respaldo — esforços, armadura e verificações", ["Parede", "Vão entre pilaretes (m)", "h (cm)", "g<sub>k</sub> / q<sub>k</sub> (kN/m)", "M<sub>d</sub> vão / apoio (kN·m)", "A<sub>s</sub> calc. / mín. (cm²)", "Armadura (inferior · superior nos apoios · lateral)", "Estribos", "Flecha total / ℓ/500 e 10 mm (mm)", "Diafragma no topo", "Status"], g, { cls: "compacta", num: [1, 2, 3, 4, 5, 8], larg: ["6%", "8%", "6%", "9%", "7%", "10%", "11%", "11%", "10%", "10%", "12%"] }) +
        (aj.length ? caixa("neutra", "Alturas elevadas pelo cálculo", aj, "A cinta de 15 cm não passou nas paredes que recebem laje ou cobertura; a altura foi elevada:") : "");
    }

    /* ======================= 10 Pilaretes */
    function s10() {
      var es = [], tv = [];
      paredes.forEach(function (w) {
        arr(w.pilaretes).forEach(function (p) {
          if (p.estrutural) {
            var c = obj(p.combos), sec = obj(c.sec);
            es.push([esc(p.id), esc(w.id), esc(p.motivo || ""), N(p.trib, 2), secBxH(p.b, p.h), N(p.Nk, 1), esc((c.nome || "—").replace(/ /g, NB)), N(c.Nd, 1), N(c.M1d, 2) + " / " + N(c.Md, 2), N(c.lambda, 1) + " / " + N(c.lambda1, 1), N(c.gn, 2),
              sec.ok ? N(sec.AsCalc, 2) + " / " + N(sec.AsMin, 2) : "—", p.armadura ? esc(p.armadura) : '<span class="ph">sem solução</span>', p.ok ? stat("atende") : stat("nao")]);
          } else {
            var f = obj(p.flexao), q = obj(p.cisalhamento);
            tv.push([esc(p.id), esc(w.id), esc(p.motivo || ""), N(p.trib, 2), secBxH(p.b, p.h), N(p.qwd, 3), N(p.Mvento, 2), N(f.Md, 2), q.Vd != null ? N(q.Vd, 2) : "—",
              f.ok ? N(f.AsCalc, 2) + " / " + N(f.AsMin, 2) : "—", p.armadura ? esc(p.armadura) : '<span class="ph">sem solução</span>', q.ok ? "φ" + N(q.phi, 1) + " c/ " + N(q.s * 100, 0, "cm") : "—", p.ok ? stat("atende") : stat("nao")]);
          }
        });
      });
      var s = "<p>Pilaretes moldados dentro das peças, nos cantos, nas bordas de porta e janela, nas extremidades livres e a cada " + N(DIR.espacamentoEstruturaMax, 1, "m") + " no máximo (Diretriz SiNAT 019). A largura é a da faixa retirada do EPS; a outra dimensão é o concreto útil da peça.</p>";
      s += subt("11.1", "Pilaretes estruturais (recebem laje ou cobertura)");
      s += es.length ? "<p>Flexo-compressão pela NBR 6118 (17.2, diagrama retangular, ε<sub>cu</sub> = 3,5 ‰), 2ª ordem pelo pilar-padrão de curvatura aproximada (15.8.3.3.2), γ<sub>n</sub> pela 13.2.3. Mostra-se a combinação que governa a armadura.</p>" +
        tab("Pilaretes estruturais — esforços de cálculo na combinação governante", ["Pilarete", "Parede", "Motivo", "Faixa trib. (m)", "b × h (cm)", "N<sub>k</sub> (kN)", "Combinação", "N<sub>d</sub> (kN)", "M<sub>1d</sub> / M<sub>d,tot</sub> (kN·m)", "λ / λ<sub>1</sub>", "γ<sub>n</sub>", "A<sub>s</sub> calc. / mín. (cm²)", "Armadura", "Status"], es, { cls: "compacta", num: [3, 4, 5, 7, 8, 9, 10, 11] })
        : "<p>Nenhum pilarete estrutural: nenhuma parede recebe laje ou cobertura, ou a peça é a de 13 ou 15 cm (ver 4.1).</p>";
      s += subt("11.2", "Pilaretes de travamento (só vento, sem carga vertical)");
      s += tv.length ? "<p>Flexão simples com o vento nos dois sentidos (armadura simétrica, por face) e cisalhamento pelo modelo I. A armadura mínima segue a NBR 6118, 17.3.5.2.1.</p>" +
        tab("Pilaretes de travamento — esforços e armadura", ["Pilarete", "Parede", "Motivo", "Faixa trib. (m)", "b × h (cm)", "q<sub>wd</sub> = 1,4·q<sub>wk</sub> (kN/m)", "M<sub>vento,k</sub> característico (kN·m)", "M<sub>d</sub> = 1,4·M<sub>k</sub> (kN·m)", "V<sub>d</sub> (kN)", "A<sub>s</sub> calc. / mín. (cm²)", "Armadura", "Estribos", "Status"], tv, { cls: "compacta", num: [3, 4, 5, 6, 7, 8] })
        : "<p>Nenhum pilarete de travamento neste cálculo.</p>";
      return s;
    }

    /* ======================= 11 Fundação */
    function s11() {
      var lin = paredes.map(function (w) { var f = obj(w.fundacao); return [nomeParede(w), N(f.L, 2), N(f.gParede, 2), N(f.gTopo, 2), N(f.qTopo, 2), N(f.qk, 2)]; });
      var s = "<p><b>Recomendação:</b> " + T(FUND.recomendacao) + ".</p>";
      if (arr(FUND.justificativa).length) s += "<p><b>Justificativa:</b></p><ul>" + FUND.justificativa.map(function (j) { return "<li>" + esc(j) + "</li>"; }).join("") + "</ul>";
      var dados = [
        ["Tensão admissível do solo", fin(FUND.tensaoAdm) ? N(FUND.tensaoAdm, 0, "kPa") + (P.solo && P.solo.descricao ? " — " + esc(P.solo.descricao) : "") : PH],
        ["Carga linear máxima (característica)", N(FUND.qMax, 2, "kN/m")], ["Carga total das paredes", N(FUND.cargaTotal, 1, "kN") + " em " + N(FUND.comprimentoParedes, 1, "m") + " de parede"],
        ["Largura de sapata corrida necessária", fin(FUND.larguraSapata) ? N(FUND.larguraSapata, 2, "m") + " (mínimo construtivo de 0,30 m)" : "—"],
        ["Taxa de ocupação da planta por sapatas corridas", fin(FUND.taxaOcupacao) ? pctTxt(FUND.taxaOcupacao) + " da planta de " + N(FUND.areaPlanta, 1, "m²") : "—"]
      ];
      s += tab("Dados do pré-dimensionamento da fundação", ["Item", "Valor"], dados, { cls: "ficha", larg: ["40%", "60%"] });
      s += tab("Carga linear característica por parede (peso próprio + laje/cobertura)", ["Parede", "Comprimento (m)", "Peso próprio (kN/m)", "g no topo (kN/m)", "q no topo (kN/m)", "Total (kN/m)"], lin, { num: [1, 2, 3, 4, 5] });
      s += '<p class="ref">' + esc(FUND.ref || "NBR 6122:2022") + ". O peso próprio inclui peças, concreto de preenchimento e argamassa.</p>";
      return s;
    }

    /* ======================= 12 Paginação e amarração */
    var NOME_PROB = { transpasse: "transpasse abaixo do mínimo", "junta-canto-vao": "junta no canto de vão", "recorte-fino": "recorte mais fino que o mínimo", "faixa-fina-vao": "tira fina no vão", "espacamento-estrutura": "trecho sem elemento estrutural acima do máximo" };
    function s12() {
      var lin = [], probs = [], avs = [];
      paredes.forEach(function (w) {
        var pg = obj(w.pag), q = obj(pg.quant), v = obj(pg.validacao), pt = obj(q.porTipo), placa = obj(pg.cfg).placa;
        lin.push([nomeParede(w), N(w.espessura, 0), N(arr(pg.fiadas).length, 0), N(q.pecas, 0), N(pt.inteira, 0) + " / " + N((pt.meia || 0), 0) + " / " + N(pt.recorte, 0) + " / " + N(pt["recorte-L"], 0), N(q.placasCompra, 0),
          v.menorTranspasse != null ? N(v.menorTranspasse, 3, "m") + (fin(placa) ? " (" + pctTxt(v.menorTranspasse / placa) + ")" : "") : "—", N(v.transpasseMin, 3, "m"), v.ok ? stat("atende") : stat("nao")]);
        arr(v.problemas).forEach(function (p) { probs.push(esc(w.id) + ", fiada " + esc(p.fiada != null ? p.fiada : "—") + ": " + esc(p.texto || NOME_PROB[p.tipo] || p.tipo)); });
        arr(pg.avisos).forEach(function (a) { if (avs.indexOf(esc(w.id) + ": " + esc(a)) < 0) avs.push(esc(w.id) + ": " + esc(a)); });
      });
      var s = "<p>Cada parede é paginada fiada a fiada, a partir da fundação, com peças de " + N(0.9, 2, "m") + " e junta de 1,5 cm. A primeira fiada começa inteira e as seguintes começam em meia peça ou recorte, de modo que nenhuma junta vertical fique alinhada com a da fiada de baixo. O transpasse mínimo exigido é de " + pctTxt(DIR.transpasseMin) + " da peça (Diretriz SiNAT 019); a junta é afastada ao menos 15 cm do canto de todo vão, e o canto de vão é feito com peça em L. Nos cantos e encontros em T a amarração alterna a cada fiada; o T recebe grampo de ligação a cada fiada, ancorado " + N(DIR.ancoragemLigacao * 100, 0, "cm") + " no mínimo.</p>";
      s += tab("Paginação por parede e validação da amarração", ["Parede", "Esp. (cm)", "Fiadas", "Peças", "Inteira / meia / recorte / em L", "Placas p/ compra", "Menor transpasse obtido", "Mínimo exigido", "Validação"], lin, { cls: "compacta", num: [1, 2, 3, 5, 6, 7], larg: ["17%", "5%", "6%", "6%", "15%", "8%", "17%", "10%", "16%"] });
      if (probs.length) s += caixa("erro", "Problemas de paginação", probs);
      if (avs.length) s += caixa("alerta", "Avisos da paginação", avs);
      var po = arr(CONS.porEspessura);
      if (po.length) s += tab("Consolidado das peças por espessura (a comprar = placas inteiras após o plano de corte)", ["Espessura (cm)", "Peças", "Placas p/ compra", "Área (m²)", "Peso das peças (kg)", "Inteira", "Meia", "Recorte", "Em L"], po.map(function (e) { return [N(e.espessura, 0), N(e.pecas, 0), N(e.placasCompra, 0), N(e.area, 2), N(e.peso, 0), N(e.inteira, 0), N(e.meia, 0), N(e.recorte, 0), N(e["recorte-L"], 0)]; }), { cls: "compacta", num: [0, 1, 2, 3, 4, 5, 6, 7, 8] });
      var ac = arr(CONS.aco);
      var acoCalc = paredes.length > 0 && paredes.every(function (w) { var q = obj(obj(w.pag).quant); return q.acoConstrutivo === false; });
      if (fin(TOT.pecas)) s += tab("Totais da obra", ["Item", "Quantidade"], [
        ["Peças assentadas", N(TOT.pecas, 0)], ["Placas inteiras a comprar", N(TOT.placasCompra, 0)], ["Concreto de preenchimento", N(TOT.concretoM3, 2, "m³")],
        [acoCalc ? "Aço (armadura calculada, CA-50 e estribos)" : "Aço (armadura construtiva do motor executivo, CA-50 e estribos)", N(TOT.acoKg, 1, "kg") + (ac.length ? " — " + ac.map(function (a) { return "φ" + br(a.bitola, a.bitola % 1 ? 1 : 0) + ": " + br(a.kg, 1) + NB + "kg"; }).join("; ") : "")],
        ["Argamassa de assentamento (estimada)", N(TOT.argamassaM3, 2, "m³")], ["Peso total das paredes", N(TOT.pesoTotalKg, 0, "kg")]
      ], { cls: "ficha", larg: ["46%", "54%"] }) +
        (acoCalc ? '<p class="ref">O aço dos quantitativos é a armadura calculada nas seções 9 a 11 (contraverga e porta-estribo seguem construtivos); na compra, vale o detalhamento das pranchas.</p>'
          : '<p class="ref">O aço dos quantitativos é a armadura construtiva do motor executivo (2 barras por elemento); a armadura calculada nas seções 9 a 11 prevalece onde for maior e deve ser conferida contra o detalhamento antes da compra.</p>');
      return s;
    }

    /* ======================= 13 Pendências e erros */
    function s13() {
      var s = "";
      var pend = arr(r.pendencias), er = arr(r.erros), av = arr(r.avisos);
      s += pend.length ? caixa("alerta", "Pendências (" + pend.length + ")", pend.map(function (p) { return esc(p.texto || p); }), "O cálculo não pode ser dado como definitivo enquanto estes itens estiverem abertos:") : "<p>Nenhuma pendência.</p>";
      s += er.length ? caixa("erro", "Erros do cálculo (" + er.length + ")", er.map(esc), "Itens que o motor de cálculo não atende; resolver antes da emissão para obra:") : caixa("neutra", "Erros do cálculo", [], "Nenhum erro registrado.");
      s += av.length ? caixa("alerta", "Avisos (" + av.length + ")", av.map(esc)) : "";
      s += caixa("neutra", "Parâmetros estimados (editáveis)", [
        "Resistência do painel: ensaio simulado RA pelos materiais da peça (seção 7); o ensaio do fabricante, quando informado, substitui os valores simulados.",
        "Consumo de argamassa de assentamento, consumo do tratamento de juntas (selador, argamassa AC-III, tela) e produtividade de assentamento (fiadas por dia): o fabricante ainda não publicou; os valores do motor executivo estão marcados como estimados.",
        "Pesos das peças: tabela de franqueado (38 / 45 / 50 / 62 kg); confirmar com a fábrica."]);
      return s;
    }

    /* ======================= 14 Memória de cálculo */
    function s14() {
      var m = arr(r.memoria), s = "<p>Passo a passo do motor de cálculo, na ordem em que foi executado. Cada passo traz a fórmula, os valores, o resultado e a norma de origem.</p>";
      if (!m.length) return s + "<p>Memória não informada no resultado.</p>";
      s += tab("Memória de cálculo", ["Nº", "Passo", "Fórmula", "Valores", "Resultado", "Referência"],
        m.map(function (p, i) { return [esc("15." + (i + 1)), esc(p.passo || ""), '<span class="eq">' + esc(p.formula || "") + "</span>", esc(p.valores || "—"), esc(p.resultado || "—"), ref(p.referencia || "")]; }),
        { cls: "compacta", larg: ["5%", "15%", "29%", "13%", "19%", "19%"] });
      var refs = [];
      function pega(x) { if (x && x.ref && refs.indexOf(x.ref) < 0) refs.push(x.ref); }
      paredes.forEach(function (w) {
        arr(w.vergas).forEach(function (v) { pega(v.flexao); pega(v.cisalhamento); pega(v.flecha); });
        if (w.cinta) { pega(w.cinta.flexao); pega(w.cinta.cisalhamento); pega(w.cinta.flecha); }
        arr(w.pilaretes).forEach(function (p) { pega(p.flexao); pega(p.cisalhamento); pega(p.combos && p.combos.sec); if (p.ref && refs.indexOf(p.ref) < 0) refs.push(p.ref); });
      });
      if (refs.length) s += "<h3>Métodos usados nas verificações (seções 9 a 11)</h3><ul>" + refs.map(function (x) { return "<li>" + ref(x) + "</li>"; }).join("") + "</ul>";
      return s;
    }

    /* ------------------------------------------------ montagem do documento */
    var SECOES = [
      { id: "identificacao", titulo: "Identificação", f: s1 }, { id: "objeto", titulo: "Objeto e sistema construtivo", f: s2 }, { id: "normas", titulo: "Normas", f: s3 },
      { id: "modelo", titulo: "Modelo estrutural e hipóteses", f: s4 }, { id: "materiais", titulo: "Materiais", f: s5 }, { id: "acoes", titulo: "Ações", f: s6 },
      { id: "ensaio", titulo: "Ensaio simulado do painel", f: s7e }, { id: "painel", titulo: "Verificação do painel por parede", f: s7 }, { id: "vergas", titulo: "Vergas", f: s8 }, { id: "cintas", titulo: "Cintas de respaldo", f: s9 },
      { id: "pilaretes", titulo: "Pilaretes", f: s10 }, { id: "fundacao", titulo: "Fundação", f: s11 }, { id: "paginacao", titulo: "Paginação e amarração", f: s12 },
      { id: "pendencias", titulo: "Pendências, avisos e erros", f: s13 }, { id: "memoria", titulo: "Memória de cálculo passo a passo", f: s14 }
    ];
    // seções curtas seguem na mesma página da anterior; as de tabela grande abrem página
    var NOVA_PAG = { objeto: 0, ensaio: 1, painel: 1, vergas: 1, pilaretes: 1, fundacao: 0, paginacao: 1, memoria: 1 };

    var corpo = SECOES.map(function (s, i) {
      var h;
      try { h = s.f(); } catch (e) { avisos.push("Seção " + (i + 1) + " (" + s.titulo + ") não gerada: " + String(e && e.message || e)); h = caixa("erro", "Seção não gerada", [], esc(String(e && e.message || e))); }
      return '<section class="sec' + (NOVA_PAG[s.id] ? "" : " cont") + '" id="sec-' + s.id + '"><h2><span class="num">' + (i + 1) + "</span>" + esc(s.titulo) + "</h2>" + h + "</section>";
    }).join("");

    var obraNome = obraO.nome || "[OBRA]";
    var rt = (rtO.nome || rtO.crea) ? ((rtO.abrev ? rtO.abrev + " " : "") + (rtO.nome || "")).trim() + (rtO.crea ? " — " + (rtO.conselho || "CREA") + " " + rtO.crea : "") : "[RESPONSÁVEL TÉCNICO — CREA]";
    var c = { topoE: obraNome + " — Alvenaria Blocok", topoD: "Memorial de cálculo" + (docO.numero ? " " + docO.numero : "") + (docO.revisao ? " " + docO.revisao : ""), rodE: (rtO.empresa || "RA Engenharia") + " · Resp. técnico: " + rt };
    var sit = r.ok ? "" : '<div class="caixa erro"><div class="cx-t">Cálculo com erros</div>O cálculo tem itens não atendidos; este memorial não libera a execução.</div>';
    var capa = '<div class="capa"><div class="capa-faixa"><span class="f1"></span><span class="f2"></span><span class="f3"></span></div>' +
      '<div class="sobre">Memorial de cálculo</div><h1>Edificação em painéis Blocok</h1><div class="sub">' + T(obraO.nome) + " — " + paredes.length + " paredes, pilaretes, vergas e cintas de concreto armado" + "</div>" + sit +
      '<div class="sumario"><h3>Sumário</h3><ol class="sum">' + SECOES.map(function (s, i) { return '<li><a href="#sec-' + s.id + '"><span class="sn">' + (i + 1) + "</span>" + esc(s.titulo) + "</a></li>"; }).join("") + "</ol></div></div>";
    var fecho = '<div class="assin-grade"><div class="assin"><div class="assin-linha"></div><div>' + (rtO.nome ? esc(rt) : '<span class="ph">[RESPONSÁVEL TÉCNICO — CREA]</span>') + '</div><div class="ref">Responsável técnico</div></div>' +
      '<div class="assin"><div class="assin-linha"></div><div>' + T(obraO.cliente) + '</div><div class="ref">Contratante</div></div></div>';

    var html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="generator" content="OrçaPRO — BlocokMemorial"><title>' + esc("Memorial de cálculo — " + obraNome) + "</title><style>" + css(c) + "</style></head><body>" + capa + corpo + fecho + "</body></html>";

    // varredura: texto de motor com undefined/NaN/null
    var texto = html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");
    var ach = texto.match(new RegExp(RE_INDEF.source, "gi"));
    if (ach) {
      avisos.push("O memorial continha " + ach.length + " valor(es) indefinido(s) (" + ach.slice(0, 5).join(", ") + "), trocado(s) por “[valor indefinido]”.");
      html = html.replace(/(>[^<]*?)\b(undefined|NaN|null|Infinity)\b/gi, function (m0, a) { return a + '<span class="ph">[valor indefinido]</span>'; });
      var guarda = 0;
      while (new RegExp(RE_INDEF.source, "i").test(html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ")) && guarda++ < 50) html = html.replace(/(>[^<]*?)\b(undefined|NaN|null|Infinity)\b/gi, function (m0, a) { return a + '<span class="ph">[valor indefinido]</span>'; });
    }
    arr(r.avisos).forEach(function (a) { avisos.push(a); });
    return { ok: true, html: html, secoes: SECOES.map(function (s, i) { return { id: s.id, numero: i + 1, titulo: s.titulo }; }), avisos: avisos };
  }

  return { gerar: gerar };
});
