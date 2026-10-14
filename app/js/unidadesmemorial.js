/* =====================================================================
 * unidadesmemorial.js — A ABA DE UNIDADES DO MEMORIAL (pós-processador
 * único, ES5). 14/10/2026.
 *
 * Pedido do Rogério: "nos memoriais de cálculo, uma abinha que mostra em
 * quilo ou tonelada, porque muitos leitores de memorial não têm total
 * conhecimento de unidade de medida — fica mais didático."
 *
 * COMO FUNCIONA. Nenhum gerador de memorial muda: o HTML pronto passa aqui
 * (UnidadesMemorial.preparar) no ponto em que a tela o mostra ou baixa. O
 * processador lê o HTML em pedaços (tags × texto), acha os NÚMEROS SEGUIDOS
 * DE UNIDADE SI (kN, kN·m, kN/m, kN/m², kN/m³, kN·m/m, kPa, MPa, GPa, N,
 * N/mm, N/mm², N/m², kN/cm², kN·cm) e embrulha cada um em dois spans:
 *     <span class="un-si">19,61 kN</span><span class="un-tc">2,00 tf</span>
 * A aba no topo ("Unidades: SI (kN) | Técnica (kgf / tf)") troca a classe do
 * <html> e o CSS mostra um ou outro — a impressão/PDF sai na aba escolhida e
 * a capa diz qual. Conversão pelo js/unidades.js (g = 9,80665 m/s²).
 *
 * REGRAS (cada uma com controle negativo no tools/test-unidades-memorial.js):
 *  · só converte número COLADO a unidade de força: "6.3.3.3", "W 310 x 38,7",
 *    datas, coordenadas, "kN" sem número e "kN" dentro de palavra ficam;
 *  · fórmula simbólica fica como está (não tem número com unidade);
 *  · CONTA NUMÉRICA: "0,613 × 29,298² = 526,2 N/m²" — o coeficiente só vale
 *    em SI, então o resultado fica em SI e ganha a conversão entre
 *    parênteses: "526,2 N/m² (53,7 kgf/m²)";
 *  · LISTA com a unidade só no fim ("Nex = 5658,6; Ney = 728,2; Nez =
 *    1479,3 kN"): todos os números da lista convertem;
 *  · TABELA com a unidade no cabeçalho ("N máx. (kN)") ou na legenda
 *    ("Cargas características (kN/m)"): as células só com número convertem e
 *    o cabeçalho troca a unidade; uma unidade por coluna (kgf ou tf pela
 *    maior célula); coluna de razão/coeficiente/% nunca herda a da legenda;
 *  · mesma linha/parágrafo, mesma grandeza → mesma unidade técnica (kgf ou
 *    tf pelo maior valor), para "Sd ≤ Rd" comparar na mesma unidade;
 *  · figuras (SVG), <script>, <style> e <head> não são tocados — a capa
 *    avisa que os diagramas ficam em kN;
 *  · idempotente: um HTML já preparado volta igual.
 *
 * API: UnidadesMemorial.processar(html, op) → { html, convertidos, tabelas,
 *        colunas, mantidos (contas numéricas) }
 *      UnidadesMemorial.preparar(html, op) → string (nunca lança: no erro
 *        devolve o HTML original e registra no console)
 * ===================================================================== */
(function (global) {
  "use strict";
  function UN() { return global.Unidades || (typeof require === "function" ? require("./unidades.js") : null); }
  var MARCA = 'data-un-processado="1"';

  /* símbolo SI no texto → grandeza, fator para a interna da grandeza e (opcional) as técnicas */
  var SI = {
    "kN": { g: "forca", f: 1 }, "N": { g: "forca", f: 0.001 },
    "kN·m": { g: "momento", f: 1 }, "kN.m": { g: "momento", f: 1, u: "kN·m" }, "kN·cm": { g: "momento", f: 0.01, tec: ["kgf·cm", "tf·cm"] },
    "N·m": { g: "momento", f: 0.001 }, "N·mm": { g: "momento", f: 1e-6, tec: ["kgf·cm", "kgf·cm"] },
    "kN/m": { g: "linear", f: 1 }, "N/mm": { g: "linear", f: 1, tec: ["kgf/mm", "kgf/mm"] }, "N/m": { g: "linear", f: 0.001 },
    "kN/m²": { g: "superficie", f: 1 }, "kN/m2": { g: "superficie", f: 1, u: "kN/m²" }, "kPa": { g: "superficie", f: 1 }, "N/m²": { g: "superficie", f: 0.001 }, "Pa": { g: "superficie", f: 0.001 },
    "kN/cm²": { g: "tensao", f: 10 }, "MPa": { g: "tensao", f: 1 }, "N/mm²": { g: "tensao", f: 1 }, "GPa": { g: "tensao", f: 1000 },
    "kN/m³": { g: "peso", f: 1 }, "kN·m/m": { g: "momentoLinear", f: 1 }
  };
  var SIMBOLOS = Object.keys(SI).sort(function (a, b) { return b.length - a.length; });
  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&"); }
  var NUM = "[+\\-−]?(?:\\d{1,3}(?:\\.\\d{3})+|\\d+)(?:,\\d+)?";
  var ESP = "(?:\\s|&nbsp;|&#160;|\\u00a0|\\u202f)*";
  var UNI = "(" + SIMBOLOS.map(reEsc).join("|") + ")";
  var FIM = "(?![A-Za-zÀ-ÿ0-9²³·/_µ])";
  /* o caractere antes do número não pode ser letra, dígito, ponto, vírgula, barra ou outro sinal (6.3.3.3, x1,5, a/2) */
  var RE_Q = new RegExp("(^|[^\\wÀ-ÿ.,\\-−/·])(" + NUM + ")" + ESP + UNI + FIM, "g");
  var RE_NUM_G = new RegExp("(^|[^\\wÀ-ÿ.,\\-−/·])(" + NUM + ")(?![\\d.,]*\\d)", "g");
  var RE_SO_NUM = new RegExp("^\\s*" + NUM + "(?:\\s*(?:;|/|–|—| a | e )\\s*" + NUM + ")*\\s*$");
  var RE_FRASE = /(Unidades:|[Vv]alores em)\s+((?:kN(?:·m|\/m²|\/m)?|MPa|kPa|m)(?:(?:,\s*|\s+e\s+)(?:kN(?:·m|\/m²|\/m)?|MPa|kPa|m))*(?:\s*\(tensões em MPa\))?)(?![\wÀ-ÿ·\/²])/g;
  var RE_LIDER = new RegExp("^\\s*(" + NUM + ")\\s+\\(");
  var RE_UNI_CAB = new RegExp("\\(\\s*" + UNI + "\\s*\\)");
  var RE_PAREN = /\(([^()]{1,24})\)/g;
  var NAO_HERDA = /raz[aã]o|η|coef|fator|γ|ψ|%|n\.?\s*º|quant|índice|λ|χ|aproveit|esbelt|perfil|barra|caso|comb|ação|descri|norma|item|tipo|nó|apoio/i;
  var BLOCO = /^(tr|li|p|div|h[1-6]|caption|table|thead|tbody|tfoot|section|ul|ol|dl|dd|dt|blockquote|figure|figcaption|header|footer|article|aside|main|body|details|summary)$/;
  var CELULA = /^(td|th)$/;
  var PULAR = /^(script|style|head|title|svg|textarea|code|pre|math|template|noscript)$/;

  function lerN(s) { var U = UN(); return U.lerNumero(String(s).replace(/−/g, "-")); }
  function fmtN(x, u, op) { var U = UN(); return U.numeroBR(x, U.casasAuto(u, x), { menos: (op && op.menos) || "−" }); }
  function escTxt(s) { return String(s).replace(/&(?!(?:[a-z]+|#\d+);)/gi, "&amp;").replace(/</g, "&lt;"); }

  /* a unidade técnica de um grupo (kgf ou tf) pelo maior |valor| */
  function escolher(tecs, g, maxInterna) {
    var U = UN(), Gd = U.GRANDEZAS[g]; if (!tecs[1] || tecs[0] === tecs[1]) return tecs[0];
    return Math.abs(U.converter(maxInterna, g, Gd.interna, tecs[0])) >= 999.995 ? tecs[1] : tecs[0];
  }
  function tecsDe(d) { var U = UN(); return d.tec || U.GRANDEZAS[d.g].tecnicas; }
  function conv(vInterna, g, u) { var U = UN(); return U.converter(vInterna, g, U.GRANDEZAS[g].interna, u); }

  /* ------------------------------------------------------------ tokens */
  function tokenizar(html) {
    var re = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|<![^>]*>|[^<]+|</g, out = [], m;
    while ((m = re.exec(html))) {
      var t = m[0], k = { s: t };
      if (t.charAt(0) === "<" && t.length > 1 && t !== "<") {
        if (t.slice(0, 4) === "<!--" || t.charAt(1) === "!") k.tipo = "outro";
        else { var mm = /^<(\/?)([a-zA-Z][\w-]*)/.exec(t); k.tipo = "tag"; k.fecha = !!mm[1]; k.nome = mm[2].toLowerCase(); k.auto = /\/>$/.test(t); }
      } else k.tipo = "txt";
      out.push(k);
    }
    return out;
  }
  function attr(tag, nome) { var m = new RegExp("\\s" + nome + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i").exec(tag); return m ? (m[2] != null ? m[2] : m[3] != null ? m[3] : m[4]) : null; }
  function textoPuro(s) { return s.replace(/&nbsp;|&#160;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"); }

  /* ------------------------------------------------------------ processar */
  function processar(html, op) {
    op = op || {}; html = String(html == null ? "" : html);
    var U = UN(); if (!U) return { html: html, convertidos: 0, motivo: "js/unidades.js não carregou" };
    if (html.indexOf(MARCA) >= 0) return { html: html, convertidos: 0, ja: true };
    var tk = tokenizar(html);

    /* PASSO 1 — achar os valores, os grupos e as colunas */
    var pular = 0, cru = null, grupo = 0, ctx = "", tabelas = [], pilha = [], celula = null;
    var grupos = {};          /* "grupo|g|tec0" → max */
    var itens = [];           /* por token: lista de ações */
    var nConv = 0, nMant = 0;
    function grupoMax(chave, v) { var a = Math.abs(v); if (!(chave in grupos) || a > grupos[chave]) grupos[chave] = a; }
    function tabAtual() { return pilha.length ? pilha[pilha.length - 1] : null; }
    function colunaDe(tb, idx) { if (!tb.cols[idx]) tb.cols[idx] = { cab: null, uni: null, herda: true, max: 0, n: 0, cabTok: [] }; return tb.cols[idx]; }

    for (var i = 0; i < tk.length; i++) {
      var t = tk[i];
      if (t.tipo === "tag") {
        if (cru) { if (t.fecha && t.nome === cru) cru = null; continue; }
        if (PULAR.test(t.nome) && !t.auto) {
          if (t.nome === "svg" || t.nome === "math") { if (t.fecha) pular = Math.max(0, pular - 1); else pular++; }
          else if (!t.fecha) { cru = t.nome; }
          continue;
        }
        if (pular) continue;
        if (BLOCO.test(t.nome) || t.nome === "br") { grupo++; ctx = ""; }
        if (CELULA.test(t.nome)) ctx = "";
        var tb = tabAtual();
        if (t.nome === "table") {
          if (!t.fecha) pilha.push({ cols: [], cap: null, capTok: [], emCap: false, emHead: false, temHead: false, linha: -1, col: 0, linhaTh: true, linhaCelulas: [], idx: tabelas.length });
          else if (tb) { tabelas.push(pilha.pop()); }
          continue;
        }
        if (!tb) continue;
        if (t.nome === "caption") { tb.emCap = !t.fecha; if (t.fecha) { var cm = RE_UNI_CAB.exec(tb.capTexto || ""); if (cm) tb.cap = { uni: cm[1], d: SI[cm[1]], max: 0, n: 0 }; } continue; }
        if (t.nome === "thead") { tb.emHead = !t.fecha; if (!t.fecha) tb.temHead = true; continue; }
        if (t.nome === "tr") {
          if (!t.fecha) { tb.linha++; tb.col = 0; tb.linhaTh = true; tb.linhaCelulas = []; }
          else {
            /* sem <thead>: a 1ª linha só de <th> é o cabeçalho */
            var ehCab = tb.emHead || (!tb.temHead && tb.linha === 0 && tb.linhaTh && tb.linhaCelulas.length);
            tb.linhaCelulas.forEach(function (c) { c.cab = !!ehCab; });
            if (ehCab) tb.linhaCelulas.forEach(function (c) {
              var txt = c.texto, mU = RE_UNI_CAB.exec(txt), col;
              for (var k = 0; k < c.span; k++) {
                col = colunaDe(tb, c.col + k);
                if (mU) { col.uni = mU[1]; col.d = SI[mU[1]]; col.cabTok = c.toks; col.herda = false; }
                else {
                  var outra = false, mp; RE_PAREN.lastIndex = 0;
                  while ((mp = RE_PAREN.exec(txt))) { if (/[a-zA-Z%°²³]/.test(mp[1])) outra = true; }
                  if (outra || NAO_HERDA.test(txt)) col.herda = false;
                }
              }
            });
            /* as células de dado já marcadas como candidatas ficam com a coluna */
          }
          continue;
        }
        if (CELULA.test(t.nome)) {
          if (!t.fecha) {
            if (t.nome === "td") tb.linhaTh = false;
            var sp = Math.max(1, parseInt(attr(t.s, "colspan"), 10) || 1);
            celula = { col: tb.col, span: sp, texto: "", toks: [], tb: tb, num: [] };
            tb.col += sp; tb.linhaCelulas.push(celula);
          } else celula = null;
          continue;
        }
        continue;
      }
      if (t.tipo !== "txt" || pular || cru) continue;
      var s = t.s, tb2 = tabAtual();
      if (tb2 && tb2.emCap) tb2.capTexto = (tb2.capTexto || "") + textoPuro(s);
      if (tb2 && tb2.emCap) tb2.capTok.push(i);
      if (celula) { celula.texto += textoPuro(s); celula.toks.push(i); }

      /* valores com unidade no próprio texto */
      var acoes = [], m, ultimoFim = 0;
      RE_Q.lastIndex = 0;
      while ((m = RE_Q.exec(s))) {
        var ini = m.index + m[1].length, numTxt = m[2], simb = m[3], d = SI[simb], fim = m.index + m[0].length;
        var v = lerN(numTxt); if (!isFinite(v)) continue;
        var vi = v * d.f, tecs = tecsDe(d), chave = grupo + "|" + d.g + "|" + tecs[0];
        /* conta numérica antes do "=" (sem unidade convertível): o resultado fica em SI + a conversão */
        var antes = textoPuro(ctx + s.slice(0, ini)), manter = false;
        if (/=\s*$/.test(antes)) {
          var expr = antes.replace(/=\s*$/, ""), corte = Math.max(expr.lastIndexOf("="), expr.lastIndexOf(";"), expr.lastIndexOf(":"));
          expr = expr.slice(corte + 1);
          if (/\d\s*[×x·*\/+−\-]\s*\(?\s*\d/.test(expr) && !new RegExp(NUM + ESP + UNI + FIM).test(expr)) manter = true;
        }
        /* lista com a unidade só no fim */
        var lista = [];
        var trecho = s.slice(ultimoFim, ini), NOME = "[A-Za-zΣΔ][A-Za-z0-9_,.À-ÿ]{0,14}";
        var reLN = new RegExp("((?:" + NOME + "\\s*=\\s*" + NUM + "\\s*;\\s*)+)(" + NOME + "\\s*=\\s*)$");
        var reLB = new RegExp("(?:^|\\s)((?:" + NUM + "\\s*;\\s*){2,})$");
        var mlN = reLN.exec(trecho), ml = mlN || reLB.exec(trecho);
        /* nomeada: todos os nomes com a mesma inicial do último (Nex; Ney; Nez · Rx; Ry; Rz) — "L = 6,00; q = 2,5 kN/m" não vira lista */
        if (mlN) { var ini0 = mlN[2].charAt(0), nomes = mlN[1].match(new RegExp(NOME + "(?=\\s*=)", "g")) || []; if (nomes.some(function (nm) { return nm.charAt(0) !== ini0; })) ml = null; }
        if (ml) {
          var base = ultimoFim + ml.index + ml[0].indexOf(ml[1]), bloco = ml[1], mn;
          /* nos nomeados, só o número depois de cada "=" */
          var reItem = mlN ? new RegExp("=\\s*(" + NUM + ")", "g") : new RegExp("(" + NUM + ")", "g");
          while ((mn = reItem.exec(bloco))) {
            var posN = base + mn.index + mn[0].indexOf(mn[1]), vv = lerN(mn[1]);
            if (isFinite(vv)) { lista.push({ ini: posN, fim: posN + mn[1].length, num: mn[1], vi: vv * d.f }); grupoMax(chave, vv * d.f); }
          }
        }
        grupoMax(chave, vi);
        lista.forEach(function (x) { acoes.push({ tipo: "num", ini: x.ini, fim: x.fim, orig: x.num, vi: x.vi, g: d.g, chave: chave, tecs: tecs }); });
        acoes.push({ tipo: manter ? "manter" : "q", ini: ini, fim: fim, orig: s.slice(ini, fim), vi: vi, g: d.g, chave: chave, tecs: tecs });
        if (manter) nMant++;
        ultimoFim = fim;
      }
      /* célula de tabela só com número(s): candidata à unidade da coluna/legenda */
      if (!acoes.length && celula && !celula.toks.slice(0, -1).some(function (it) { return /\S/.test(tk[it].s); })) {
        var nums = [], mm2, so = RE_SO_NUM.test(textoPuro(s)), lider = !so ? RE_LIDER.exec(s) : null;
        if (so) { RE_NUM_G.lastIndex = 0; while ((mm2 = RE_NUM_G.exec(s))) { var p0 = mm2.index + mm2[1].length, vn = lerN(mm2[2]); if (isFinite(vn)) nums.push({ ini: p0, fim: p0 + mm2[2].length, num: mm2[2], v: vn }); } }
        /* "1,00 (G-geral; revestimento…)": só o número do começo da célula */
        else if (lider) { var p1 = lider[0].indexOf(lider[1]), vl = lerN(lider[1]); if (isFinite(vl)) nums.push({ ini: p1, fim: p1 + lider[1].length, num: lider[1], v: vl }); }
        if (nums.length) acoes.push({ tipo: "cel", celula: celula, nums: nums });
      }
      /* frase que declara a unidade das tabelas ("Valores em kN.", "Unidades: kN e kN·m."): na leitura técnica, avisa a conversão */
      RE_FRASE.lastIndex = 0; var mf;
      while ((mf = RE_FRASE.exec(s))) {
        var fi = mf.index + mf[0].length - mf[2].length, ff = fi + mf[2].length;
        if (!acoes.some(function (a) { return a.ini != null && a.ini < ff && a.fim > fi; })) acoes.push({ tipo: "frase", ini: fi, fim: ff, orig: mf[2] });
      }
      if (acoes.length) itens[i] = acoes;
      ctx += s;
      if (ctx.length > 400) ctx = ctx.slice(-400);
    }
    while (pilha.length) tabelas.push(pilha.pop());

    /* PASSO 2 — colunas: unidade, maior valor, unidade técnica */
    var colPorTok = {}, nCols = 0;
    itens.forEach(function (acoes, iTok) {
      if (!acoes) return;
      acoes.forEach(function (a) {
        if (a.tipo !== "cel") return;
        var c = a.celula, tb = c.tb; if (c.cab) return;
        var col = tb.cols[c.col], alvo = null;
        if (col && col.d) alvo = col;
        else if (tb.cap && tb.cap.d && (!col || col.herda) && c.span === 1) alvo = tb.cap;
        if (!alvo) return;
        a.alvo = alvo;
        a.nums.forEach(function (x) { var vi = x.v * alvo.d.f; x.vi = vi; if (Math.abs(vi) > alvo.max) alvo.max = Math.abs(vi); });
        alvo.n++;
      });
    });
    tabelas.forEach(function (tb) {
      var lst = tb.cols.filter(Boolean).concat(tb.cap ? [tb.cap] : []);
      lst.forEach(function (al) { if (al.d && al.n) { al.tecU = escolher(tecsDe(al.d), al.d.g, al.max); nCols++; } });
      tb.cols.forEach(function (col) { if (col && col.d && col.n && col.cabTok) col.cabTok.forEach(function (it) { colPorTok[it] = (colPorTok[it] || []).concat([col]); }); });
      if (tb.cap && tb.cap.d && tb.cap.n) tb.capTok.forEach(function (it) { colPorTok[it] = (colPorTok[it] || []).concat([tb.cap]); });
    });

    /* PASSO 3 — escrever */
    var out = [];
    function par(si, tc) { nConv++; return '<span class="un-si">' + si + '</span><span class="un-tc">' + tc + "</span>"; }
    for (var j = 0; j < tk.length; j++) {
      var tt = tk[j], acs = itens[j], cols = colPorTok[j];
      if (!acs && !cols) { out.push(tt.s); continue; }
      var s2 = tt.s, pedacos = [], pos = 0;
      var lista2 = [];
      (acs || []).forEach(function (a) {
        if (a.tipo === "frase") { lista2.push({ ini: a.ini, fim: a.fim, html: par(a.orig, a.orig + " (nesta leitura, convertidos para kgf e tf)") }); return; }
        if (a.tipo === "cel") { if (!a.alvo || !a.alvo.tecU) return; a.nums.forEach(function (x) { lista2.push({ ini: x.ini, fim: x.fim, html: par(x.num, escTxt(fmtN(conv(x.vi, a.alvo.d.g, a.alvo.tecU), a.alvo.tecU))) }); }); return; }
        var u = escolher(a.tecs, a.g, grupos[a.chave] || Math.abs(a.vi)), x2 = conv(a.vi, a.g, u), tx = fmtN(x2, u);
        if (a.tipo === "num") lista2.push({ ini: a.ini, fim: a.fim, html: par(a.orig, escTxt(tx)) });
        else if (a.tipo === "manter") lista2.push({ ini: a.ini, fim: a.fim, html: par(a.orig, a.orig + " (" + escTxt(tx + " " + u) + ")") });
        else lista2.push({ ini: a.ini, fim: a.fim, html: par(a.orig, escTxt(tx + " " + u)) });
      });
      if (cols) cols.forEach(function (al) {
        RE_UNI_CAB.lastIndex = 0; var mc = new RegExp("\\(\\s*" + reEsc(al.uni) + "\\s*\\)").exec(s2);
        if (mc && !lista2.some(function (q) { return q.ini < mc.index + mc[0].length && q.fim > mc.index; })) {
          var ab = mc.index + mc[0].indexOf(al.uni);
          lista2.push({ ini: ab, fim: ab + al.uni.length, html: par(al.uni, escTxt(al.tecU)) });
        }
      });
      lista2.sort(function (a, b) { return a.ini - b.ini; });
      lista2.forEach(function (q) { if (q.ini < pos) return; pedacos.push(s2.slice(pos, q.ini)); pedacos.push(q.html); pos = q.fim; });
      pedacos.push(s2.slice(pos));
      out.push(pedacos.join(""));
    }
    var corpo = out.join("");
    return { html: embrulhar(corpo, op), convertidos: nConv, mantidos: nMant, tabelas: tabelas.length, colunas: nCols };
  }

  /* ------------------------------------------------------------ a aba, a nota da capa, o CSS e o script */
  var CSS = "html .un-tc{display:none!important}html.un-tec .un-si{display:none!important}html.un-tec .un-tc{display:inline!important}" +
    ".un-aba{position:sticky;top:0;z-index:60;display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0 0 10px;padding:7px 10px;background:#f3f6f9;border:1px solid #c9d3dd;border-radius:0 0 8px 8px;font:12.5px/1.3 system-ui,'Segoe UI',Arial,sans-serif;color:#1d2733}" +
    ".un-aba b{font-weight:600;margin-right:2px}.un-aba button{font:inherit;padding:5px 12px;min-height:30px;border:1px solid #9fb0c0;background:#fff;color:#1d2733;border-radius:6px;cursor:pointer}" +
    ".un-aba button[aria-selected=true]{background:#1f4f78;border-color:#1f4f78;color:#fff}.un-aba button:focus-visible{outline:2px solid #0d6ebd;outline-offset:2px}" +
    ".un-aba .un-dica{color:#4a5866;font-size:11.5px;flex:1 1 260px}" +
    ".un-capa{margin-top:10px;font-size:9.5pt;color:#33414f;border-left:3px solid #1f4f78;padding:4px 8px;background:#f7f9fb}" +
    "@media print{.un-aba{display:none!important}}";
  function nota(U) {
    return '<p class="un-capa" data-un="capa"><b>Unidades deste documento:</b> <span class="un-si">Sistema Internacional — kN, kN·m, kN/m, kN/m² e MPa (as do cálculo).</span>' +
      '<span class="un-tc">técnicas — kgf e tf (kgf·m, tf·m, kgf/m, kgf/m², kgf/cm²), convertidas dos valores do cálculo, que foi feito em SI. ' + U.NOTA_BASE.replace(/^Conversão/, "Conversão") + " As figuras e diagramas ficam em kN.</span></p>";
  }
  var SCRIPT = "(function(){var K='orcapro:memorial:unidades',d=document,h=d.documentElement;" +
    "function por(m){h.className=h.className.replace(/\\s*\\bun-tec\\b/g,'')+(m==='tec'?' un-tec':'');var b=d.querySelectorAll('[data-un-modo]');for(var i=0;i<b.length;i++)b[i].setAttribute('aria-selected',b[i].getAttribute('data-un-modo')===m?'true':'false');try{localStorage.setItem(K,m)}catch(e){}}" +
    "var m0=/\\bun-tec\\b/.test(h.className)?'tec':'si';try{m0=localStorage.getItem(K)||m0}catch(e){}try{var q=/[?&]unidades=(tec|si)/.exec(location.search);if(q)m0=q[1]}catch(e){}" +
    "d.addEventListener('click',function(ev){var b=ev.target.closest&&ev.target.closest('[data-un-modo]');if(b){ev.preventDefault();por(b.getAttribute('data-un-modo'))}});" +
    "d.addEventListener('keydown',function(ev){var b=ev.target.closest&&ev.target.closest('[data-un-modo]');if(b&&(ev.key==='ArrowLeft'||ev.key==='ArrowRight')){var o=b.getAttribute('data-un-modo')==='si'?'tec':'si';por(o);var n=d.querySelector('[data-un-modo='+o+']');if(n)n.focus()}});" +
    "window.OrcaUnidades={modo:por,atual:function(){return /\\bun-tec\\b/.test(h.className)?'tec':'si'}};por(m0==='tec'?'tec':'si')})();";
  function embrulhar(corpo, op) {
    var U = UN(), modo = op.modo === "tec" ? "tec" : "si";
    var aba = '<div class="un-aba" role="tablist" aria-label="Unidades do memorial" ' + MARCA + '><b>Unidades:</b>' +
      '<button type="button" role="tab" data-un-modo="si" aria-selected="' + (modo === "si") + '">SI (kN)</button>' +
      '<button type="button" role="tab" data-un-modo="tec" aria-selected="' + (modo === "tec") + '">Técnica (kgf / tf)</button>' +
      '<span class="un-dica">A técnica mostra força, momento, carga e tensão em quilograma-força e tonelada-força (g = 9,80665 m/s²); o cálculo é o mesmo, em SI. A impressão sai na unidade escolhida.</span></div>';
    var estilo = '<style id="un-css">' + CSS + "</style>", scr = "<script>" + SCRIPT + "</script>";
    var h = corpo;
    /* <html class="un-tec"> quando pedido de saída (op.modo) */
    if (modo === "tec") h = /<html\b[^>]*>/i.test(h) ? h.replace(/<html\b([^>]*)>/i, function (a, at) { return /class=/.test(at) ? a.replace(/class=(["'])/, "class=$1un-tec ") : "<html" + at + ' class="un-tec">'; }) : h;
    if (/<\/head>/i.test(h)) h = h.replace(/<\/head>/i, estilo + "</head>"); else h = estilo + h;
    if (/<body\b[^>]*>/i.test(h)) h = h.replace(/<body\b[^>]*>/i, function (b) { return b + aba; }); else h = aba + h;
    /* a nota na capa (antes do fim da 1ª <section class="capa">), senão depois do 1º </h1>, senão logo depois da aba */
    var iCapa = h.search(/<section\b[^>]*class=["'][^"']*\bcapa\b/i), nt = nota(U), feito = false;
    if (iCapa >= 0) { var iFim = h.indexOf("</section>", iCapa); if (iFim > 0) { h = h.slice(0, iFim) + nt + h.slice(iFim); feito = true; } }
    if (!feito) { var iH1 = h.search(/<\/h1>/i); if (iH1 >= 0) { h = h.slice(0, iH1 + 5) + nt + h.slice(iH1 + 5); feito = true; } }
    if (!feito) { var iA = h.indexOf("</div>", h.indexOf(MARCA)); h = h.slice(0, iA + 6) + nt + h.slice(iA + 6); }
    if (/<\/body>/i.test(h)) h = h.replace(/<\/body>(?![\s\S]*<\/body>)/i, scr + "</body>"); else h += scr;
    return h;
  }

  function preparar(html, op) {
    try { var r = processar(html, op); return r && typeof r.html === "string" && r.html ? r.html : html; }
    catch (e) { try { if (global.console) console.error("[unidades] memorial sem a aba de unidades:", e && e.message); } catch (e2) {} return html; }
  }

  var UnidadesMemorial = { processar: processar, preparar: preparar, SI: SI, CSS: CSS, MARCA: MARCA, _tokenizar: tokenizar };
  global.UnidadesMemorial = UnidadesMemorial;
  if (typeof module !== "undefined" && module.exports) module.exports = UnidadesMemorial;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
