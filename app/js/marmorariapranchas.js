/* =====================================================================
 * marmorariapranchas.js — EXECUTIVO DE MARMORARIA (motor puro, sem tela)
 *
 * MarmorariaPranchas.gerar(bancadas, opcoes) → { ok, folhas:[…], avisos, plano }
 *   bancadas = [{ rotulo ("B1"), nome ("Bancada do banheiro social"), def (Marmoraria.montar) }]
 *   opcoes   = os do carimbo (empresa, responsavel, registro, obra, proprietario, contratante, local, codigo "MAR", revisao, data)
 * Uma folha por bancada (A3; A2 quando não cabe), no Padrão RA de detalhamento (carimbo RA INTOCADO de js/prancha.js,
 * primitivas, tabelas e conferência de sobreposição do js/blocokpranchas.js — o mesmo desenho sai em SVG e em DXF pelo
 * BlocokDxf.folhaParaDxf):
 *   PLANTA DA PEÇA    contorno, recortes pelo gabarito, furos; cotas em cadeia A PARTIR DAS BORDAS (esquerda e frente),
 *                     medida do recorte e o tipo dele (furo para sobrepor / corte com borda polida / rebaixo esculpido)
 *   VISTA FRONTAL     tampo, saia, rodabanca e a cuba (tracejada), com as alturas
 *   DETALHE DA BORDA  seção da frente (1:2): perfil escolhido, meia-esquadria da saia
 *   PLANO DE CHAPA    as peças na chapa comercial da pedra (aproveitamento)
 *   LISTA DE PEÇAS    peça, dimensões, área (m²), borda (m), furos e recortes (un)
 * MARMORARIA não tem seção no padrao_detalhamento_ra.json: o que está aqui foi CRIADO coerente com ele (penas, layers,
 * textos e cotas da v2.x via BlocokPranchas.PADRAO) — levar para o JSON como seção "marmoraria".
 * ⚠ Nenhum texto sobre texto ou sobre cota e nenhum texto fora da sua caixa: BlocokPranchas.sobreposicoes confere.
 * ES5 (UMD), Node-testável. Teste: node tools/test-marmoraria.js
 * ===================================================================== */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./prancha.js"), require("./blocokpranchas.js"), require("./marmoraria.js"));
  else root.MarmorariaPranchas = factory(root.Prancha, root.BlocokPranchas, root.Marmoraria);
})(typeof self !== "undefined" ? self : this, function (Prancha, BP, Marmoraria) {
  "use strict";
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var n = +v; return isFinite(n) ? n : (d == null ? 0 : d); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function mm(v) { return Math.round(v * 1000); }
  function br(v, c) { var p = Math.pow(10, c == null ? 2 : c); return (Math.round(v * p) / p).toFixed(c == null ? 2 : c).replace(".", ","); }
  function dois(n) { return (n < 10 ? "0" : "") + n; }
  var T = BP.PADRAO.textos, ESCALAS = [10, 15, 20, 25, 50];
  var TIPO_REC = { sobrepor: "FURO P/ CUBA DE SOBREPOR", embutir: "FURO P/ CUBA DE EMBUTIR", undermount: "CORTE C/ BORDA POLIDA (CUBA POR BAIXO)", semi_encaixe: "ENTALHE P/ SEMI-ENCAIXE", esculpida: "REBAIXO ESCULPIDO", tanque: "FURO P/ TANQUE" };

  /* cota que não cabe o número entre as linhas: a linha sai sem número e o número vai DEITADO ao lado (fora das chamadas
     das vizinhas) — o "girar 90°" do padrão faria o número passar da linha e cruzar a chamada da cota do lado */
  function cotaH(D, xa, xb, y, yRef, s) {
    if (BP.larg(s, T.cota) <= Math.abs(xb - xa) - 1) return D.cotaH(xa, xb, y, yRef, s);
    var g = D.cotaH(xa, xb, y, yRef, ""); D.texto(Math.max(xa, xb) + 1.2, y - BP.PADRAO.cotas.textoFolga, s, T.cota, "EST-COTA", { al: "E", g: g }); return g;
  }
  function cotaV(D, ya, yb, x, xRef, s) {
    if (BP.larg(s, T.cota) <= Math.abs(yb - ya) - 1) return D.cotaV(ya, yb, x, xRef, s);
    var g = D.cotaV(ya, yb, x, xRef, ""); D.texto(x - 1.2, (ya + yb) / 2 + T.cota * 0.35, s, T.cota, "EST-COTA", { al: "D", g: g }); return g;
  }
  /* ------------------------------------------------------------ PLANTA */
  function planta(D, def, x0, y0, esc) {
    var k = 1000 / esc, L = def.L * k, P = def.P * k, g = D.novoGrupo("pl");
    /* papel: x da borda ESQUERDA, y de cima (fundo/parede) para baixo (frente) */
    function X(xL) { return x0 + xL * k; } function Y(zFrente) { return y0 + P - zFrente * k; }
    D.ret(x0, y0, L, P, "EST-FORMA-CORTE");
    if (def.rodabanca.h > 0 && def.rodabanca.lados.fundo) D.linha(x0, y0 + def.e * k, x0 + L, y0 + def.e * k, "EST-OCULTA");
    if (def.rodabanca.h > 0 && def.rodabanca.lados.esq) D.linha(x0 + def.e * k, y0, x0 + def.e * k, y0 + P, "EST-OCULTA");
    if (def.rodabanca.h > 0 && def.rodabanca.lados.dir) D.linha(x0 + L - def.e * k, y0, x0 + L - def.e * k, y0 + P, "EST-OCULTA");
    if (def.saia.h > 0) D.linha(x0, y0 + P - def.e * k, x0 + L, y0 + P - def.e * k, "EST-OCULTA");
    var xsCot = [0, def.L], zsCot = [0, def.P], xsF = [], zsF = [], rotulos = [];
    def.cubas.forEach(function (c) {
      var rec = c.rec, cx = c.xL, cz = c.zFrente;
      if (c.instalacao !== "apoio") {
        var pts = Marmoraria.contorno(rec, 40).map(function (p) { return [X(cx + p[0]), Y(cz - p[1])]; });
        if (c.instalacao === "semi_encaixe") { var a = X(cx - rec.L / 2), b = X(cx + rec.L / 2), yb = Y(rec.P); D.poli([[a, y0 + P], [a, yb], [b, yb], [b, y0 + P]], "EST-FORMA-CORTE", false); }
        else D.poli(pts, "EST-FORMA-CORTE", true);
        if (c.instalacao === "undermount" || c.instalacao === "esculpida") {   /* a cuba por baixo: contorno externo tracejado */
          var ex = Marmoraria.contorno({ forma: rec.forma, L: c.ext.L, P: c.ext.P, raio: rec.raio }, 40).map(function (p) { return [X(cx + p[0]), Y(cz - p[1])]; });
          D.poli(ex, "EST-OCULTA", true);
        }
        /* REVISOR A3: a cadeia arredondava as DUAS bordas do recorte cada uma ao mm (92,5 → 92 e 422,5 → 423) e o recorte de
           gabarito 330 saía cotado 331. A borda de partida vai ao mm e a outra = partida + a medida do gabarito em mm. */
        var x0r = mm(cx - rec.L / 2) / 1000, z0r = mm(cz - rec.P / 2) / 1000;
        xsCot.push(x0r, x0r + mm(rec.L) / 1000);
        if (c.instalacao !== "semi_encaixe") zsCot.push(z0r, z0r + mm(rec.P) / 1000); else zsCot.push(rec.P);
        rotulos.push({ x: X(cx), y: Y(cz), w: rec.L * k, h: rec.P * k, linhas: ["R" + (c.i + 1)],
          nota: "R" + (c.i + 1) + ": " + (TIPO_REC[c.instalacao] || "RECORTE") + " " + mm(rec.L) + " x " + mm(rec.P) + (rec.raio > 0.002 && rec.forma === "retangular" ? " R" + mm(rec.raio) : "") + (rec.forma !== "retangular" ? " (" + rec.forma.toUpperCase() + ")" : "") + " - " + (rec.fonte === "fabricante" ? "GABARITO DO FABRICANTE" : (rec.fonte === "loja" ? "GABARITO DA FICHA (LOJA)" : "A CONFERIR NA CUBA")) });
      } else {
        var ex2 = Marmoraria.contorno({ forma: c.cat.formato === "retangular" ? "retangular" : "oval", L: c.ext.L, P: c.ext.P, raio: 0.02 }, 40).map(function (p) { return [X(cx + p[0]), Y(cz - p[1])]; });
        D.poli(ex2, "EST-OCULTA", true);
        rotulos.push({ x: X(cx), y: Y(cz) - Math.min(c.ext.P * k / 2 - 4, 8), w: c.ext.L * k, h: c.ext.P * k * 0.45, linhas: ["C" + (c.i + 1)], nota: "C" + (c.i + 1) + ": CUBA DE APOIO " + mm(c.ext.L) + " x " + mm(c.ext.P) + " (PROJEÇÃO) - FURO DA VÁLVULA NO EIXO" });
      }
    });
    def.furos.forEach(function (f) {
      D.circ(X(f.xL), Y(f.zFrente), Math.max(0.6, f.d * k / 2), "EST-FORMA-CORTE", false);
      D.linha(X(f.xL) - f.d * k * 0.8, Y(f.zFrente), X(f.xL) + f.d * k * 0.8, Y(f.zFrente), "EST-EIXO"); D.linha(X(f.xL), Y(f.zFrente) - f.d * k * 0.8, X(f.xL), Y(f.zFrente) + f.d * k * 0.8, "EST-EIXO");
      xsF.push(f.xL); zsF.push(f.zFrente);
    });
    function uniq(a) { a = a.map(function (v) { return Math.round(v * 1000) / 1000; }).sort(function (p, q) { return p - q; }); var o = []; a.forEach(function (v) { if (!o.length || v - o[o.length - 1] > 0.0005) o.push(v); }); return o; }
    xsCot = uniq(xsCot); zsCot = uniq(zsCot); xsF = uniq(xsF); zsF = uniq(zsF);
    /* cotas horizontais ACIMA da peça (o fundo), de dentro para fora: (1) os furos a partir da borda esquerda, (2) a cadeia
       dos recortes, (3) a total — cada uma na sua linha, sem número de uma cair em cima do de outra */
    var yy = y0 - 7;
    xsF.forEach(function (xf, n) { cotaH(D, X(0), X(xf), yy - n * 7, y0, String(mm(xf))); });
    if (xsF.length) yy -= 7 * xsF.length;
    if (xsCot.length > 2) { for (var i = 0; i + 1 < xsCot.length; i++) cotaH(D, X(xsCot[i]), X(xsCot[i + 1]), yy, y0, String(mm(xsCot[i + 1] - xsCot[i]))); yy -= 7; }
    cotaH(D, X(0), X(def.L), yy, y0, String(mm(def.L)));
    var topo = yy - 6;
    /* cotas verticais à ESQUERDA, da frente para o fundo: (1) os furos a partir da borda frontal, (2) os recortes, (3) a total */
    var xx = x0 - 7;
    zsF.forEach(function (zf, n) { cotaV(D, Y(zf), Y(0), xx - n * 7, x0, String(mm(zf))); });
    if (zsF.length) xx -= 7 * zsF.length;
    if (zsCot.length > 2) { for (var j = 0; j + 1 < zsCot.length; j++) cotaV(D, Y(zsCot[j + 1]), Y(zsCot[j]), xx, x0, String(mm(zsCot[j + 1] - zsCot[j]))); xx -= 7; }
    cotaV(D, Y(def.P), Y(0), xx, x0, String(mm(def.P)));
    /* furos: Ø abaixo da peça, chamados pela posição */
    var yF = y0 + P + 6;
    /* o Ø ao lado do furo (no vão entre o recorte e o fundo), sem chamada atravessando o recorte */
    def.furos.forEach(function (f) {
      var r = Math.max(0.6, f.d * k / 2);
      if (f.tipo === "valvula") return;
      D.texto(X(f.xL) + r + 1.2, Y(f.zFrente) + T.nota * 0.35, "Ø" + mm(f.d), T.nota, "EST-TEXTO", { al: "E" });
    });
    var nT = def.furos.filter(function (f) { return f.tipo === "torneira"; });
    if (nT.length) D.texto(x0, yF, nT.length + " FURO(S) Ø" + mm(nT[0].d) + " P/ TORNEIRA DE MESA, NO EIXO DA CUBA", T.nota, "EST-TEXTO", { al: "E" });
    if (def.furos.some(function (f) { return f.tipo === "valvula"; })) D.texto(x0, yF + (nT.length ? 5 : 0), "FURO DA VÁLVULA DA CUBA DE APOIO NO EIXO DA CUBA", T.nota, "EST-TEXTO", { al: "E" });
    var nLinF = (nT.length ? 1 : 0) + (def.furos.some(function (f) { return f.tipo === "valvula"; }) ? 1 : 0);
    /* rótulos dos recortes, dentro, se couberem */
    rotulos.forEach(function (r) {
      var h = T.nota;
      if (BP.larg(r.linhas[0], h) < r.w - 2 && h < r.h - 1) D.texto(r.x, r.y + h * 0.35, r.linhas[0], h, "EST-TEXTO", { al: "C" });
    });
    /* a descrição de cada recorte embaixo da peça (o tipo, a medida e a fonte do gabarito) */
    var yN = yF + nLinF * 5 + 1;
    rotulos.forEach(function (r) { D.texto(x0, yN, r.nota, T.nota, "EST-TEXTO", { al: "E" }); yN += 5; });
    return { w: L, h: P, topo: topo, base: yN };
  }

  /* ------------------------------------------------------------ VISTA FRONTAL */
  function frontal(D, def, x0, y0, esc) {
    var k = 1000 / esc, L = def.L * k, e = def.e * k, rb = def.rodabanca.h * k, sa = Math.max(def.saia.h * k, e), ytop = y0 + rb;
    if (rb > 0 && def.rodabanca.lados.fundo) D.ret(x0, y0, L, rb, "EST-FORMA-VISTA");
    D.ret(x0, ytop, L, e, "EST-FORMA-CORTE");
    if (def.saia.h > 0) D.ret(x0, ytop + e, L, sa - e, "EST-FORMA-CORTE");
    def.cubas.forEach(function (c) {
      var cx = x0 + c.xL * k, w = c.ext.L * k, hc = c.ext.H * k;
      if (c.instalacao === "apoio") D.ret(cx - w / 2, ytop - hc, w, hc, "EST-OCULTA");
      else D.ret(cx - w / 2, ytop + (c.instalacao === "undermount" ? e : 0), w, hc, "EST-OCULTA");
    });
    var xd = x0 + L + 7, g;
    if (rb > 0) D.cotaV(y0, ytop, xd, x0 + L, String(mm(def.rodabanca.h)));
    var xs2 = rb > 0 ? xd + 9 : xd;
    if (def.saia.h > 0) D.cotaV(ytop, ytop + sa, x0 - 7, x0, String(mm(def.saia.h)));   /* a saia do outro lado: as linhas de chamada não cruzam o número da rodabanca */
    /* a espessura (2 a 3 mm de papel) não cabe o número entre as linhas: vai como texto ao lado */
    D.texto(xs2 + 1, ytop + e / 2 + T.nota * 0.35, "e = " + mm(def.e), T.nota, "EST-TEXTO", { al: "E" });
    var base = ytop + Math.max(sa, Math.max.apply(null, [0].concat(def.cubas.map(function (c) { return c.instalacao === "apoio" ? 0 : c.ext.H * k + e; }))));
    D.texto(x0, base + 6, "TOPO DO TAMPO A " + br(def.H, 2) + " M DO PISO ACABADO", T.nota, "EST-TEXTO", { al: "E" });
    return { w: L + 40, h: base + 7 - y0 };
  }

  /* ------------------------------------------------------------ DETALHE DA BORDA (1:2) */
  function detalheBorda(D, def, x0, y0) {
    var k = 500, e = def.e * k, sa = def.saia.h > 0 ? def.saia.h * k : 0, w = 46, xf = x0 + w;   /* 92 mm de tampo até a frente */
    var top = [[x0, y0], [xf, y0], [xf, y0 + e], [x0, y0 + e]], b = def.borda, r = e * 0.5;
    /* o perfil na quina de cima da frente */
    var prof = [];
    if (b === "Chanfro") prof = [[x0, y0], [xf - r * 0.6, y0], [xf, y0 + r * 0.6]];
    else if (b === "Meia-cana" || b === "Boleado") {
      var rr = b === "Boleado" ? e / 2 : r * 0.8, cx = xf - rr, cy = y0 + rr;
      prof = [[x0, y0]]; for (var i = 0; i <= 8; i++) { var a = -Math.PI / 2 + (Math.PI / 2) * i / 8; prof.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
      if (b === "Boleado") for (var j = 1; j <= 8; j++) { var a2 = (Math.PI / 2) * j / 8; prof.push([cx + Math.cos(a2) * rr, cy + Math.sin(a2) * rr]); }
    } else prof = [[x0, y0], [xf, y0]];
    var fim = prof[prof.length - 1], cont = prof.slice();
    if (sa > 0) { cont.push([xf, y0 + sa], [xf - e, y0 + sa], [xf - e, y0 + e], [x0, y0 + e]); D.linha(xf - e, y0 + e, xf, y0, "EST-FORMA-VISTA"); }   /* a junta em 45° (meia-esquadria) */
    else { if (fim[1] < y0 + e - 0.01) cont.push([xf, y0 + e]); cont.push([x0, y0 + e]); }
    D.poli(cont, "EST-FORMA-CORTE", false); D.linha(x0, y0, x0, y0 + e, "EST-OCULTA");
    D.hach(cont.concat([[x0, y0 + e]]), "EST-HACHURA", 1.0);
    D.cotaV(y0, y0 + e, xf + 6, xf, String(mm(def.e)));
    if (sa > 0) D.cotaV(y0, y0 + sa, xf + 14, xf, String(mm(def.saia.h)));
    var ty = y0 + Math.max(e, sa) + 6;
    D.texto(x0, ty, "BORDA: " + b.toUpperCase() + (sa > 0 ? " - SAIA EM MEIA-ESQUADRIA" : ""), T.nota, "EST-TEXTO", { al: "E" });
    D.texto(x0, ty + 4.5, "ACABAMENTO: " + def.superficie.toUpperCase(), T.nota, "EST-TEXTO", { al: "E" });
    return { w: w + 22, h: ty + 6 - y0 };
  }

  /* ------------------------------------------------------------ PLANO DE CHAPA */
  function planoDesenho(D, pl, x0, y0, wMax, hMax) {
    if (!pl || !pl.ok || !arr(pl.chapas).length) {
      D.texto(x0, y0 + 4, pl && pl.motivo ? "PLANO DE CHAPA: " + pl.motivo.toUpperCase() : "PLANO DE CHAPA: SEM TAMANHO DE CHAPA", T.nota, "EST-TEXTO", { al: "E" });
      return { w: wMax, h: 8 };
    }
    var ch = pl.chapa, esc = 0;
    [20, 25, 30, 40, 50, 75, 100].some(function (s) { if (ch.comprimento / s <= wMax && ch.largura / s * pl.chapas.length + 8 * pl.chapas.length <= hMax) { esc = s; return true; } return false; });
    if (!esc) esc = 100;
    var y = y0;
    pl.chapas.forEach(function (s, n) {
      var W = ch.comprimento / esc, H = ch.largura / esc;
      D.ret(x0, y, W, H, "EST-FORMA-VISTA");
      s.pecas.forEach(function (p) {
        var px = x0 + p.x / esc, py = y + p.y / esc, pw = p.w / esc, ph = p.h / esc;
        D.ret(px, py, pw, ph, "EST-FORMA-CORTE");
        var cod = txt(p.codigo).replace(/^.*-/, ""), h = 1.8;
        if (BP.larg(cod, h) < pw - 1 && ph > h + 1) D.texto(px + pw / 2, py + ph / 2 + h * 0.35, cod, h, "EST-TEXTO", { al: "C" });
      });
      D.texto(x0, y + H + 4, "CHAPA " + (n + 1) + ": " + ch.comprimento + " x " + ch.largura + " MM - APROVEITAMENTO " + br(s.aproveitamento, 0) + "%", 2.0, "EST-TEXTO", { al: "E" });
      y += H + 8;
    });
    return { w: wMax, h: y - y0, esc: esc };
  }

  /* ------------------------------------------------------------ COLUNA: ESPECIFICAÇÃO E NOTAS */
  function coluna(D, geo, b, pl) {
    var C = geo.coluna, x = C.x + 3, w = C.w - 6, y = C.y + 6, h = T.nota, def = b.def, zona = D.zona;
    D.zona = "coluna";
    function par(s, peso) { BP.quebrar(s, h, w).forEach(function (l) { D.texto(x, y, l, h, peso ? "EST-TITULO" : "EST-TEXTO", { al: "E", peso: peso ? 0.12 : null }); y += h * 1.45; }); }
    function tit(s) { y += 1.5; par(s, true); y += 0.5; }
    tit("PEDRA");
    par(def.pedra.nome + " (" + def.pedra.tipo + "), " + def.superficie.toLowerCase() + ", e = " + mm(def.e) + " mm.");
    if (pl && pl.chapa) par("Chapa " + pl.chapa.comprimento + " x " + pl.chapa.largura + " mm" + (pl.chapa.generica ? " (chapa usual da classe)" : "") + ".");
    def.cubas.forEach(function (c, i) {
      tit("CUBA " + (i + 1));
      par(c.rotulo + ".");
      par("Recorte " + mm(c.rec.L) + " x " + mm(c.rec.P) + " mm: " + (c.rec.fonte === "fabricante" ? "gabarito do fabricante" : c.rec.texto) + ".");
      if (c.torneira) par("Torneira: " + Marmoraria.rotuloTorneira(c.torneira) + (c.furosTorneira.length ? " - furo Ø" + mm(c.furosTorneira[0].d) + " mm." : " - de parede, sem furo na pedra."));
    });
    tit("NOTAS");
    ["Cotas em milímetros, a partir da borda ESQUERDA e da borda FRONTAL da peça.", "Conferir o gabarito com a cuba e a torneira na obra antes do corte.",
     "Recorte de cuba por baixo e rebaixo esculpido com borda polida.", "Pontos de água e esgoto pelo projeto hidrossanitário (sobre o eixo de cada cuba)."].forEach(function (s) { par("- " + s); });
    D.zona = zona;
  }

  /* ------------------------------------------------------------ LISTA DE PEÇAS */
  function lista(def, q) {
    var cab = ["PEÇA", "DESCRIÇÃO", "DIMENSÕES (MM)", "ÁREA (M²)", "FUROS/REC."], linhas = [];
    def.pecas.forEach(function (p) { linhas.push([p.codigo, p.nome.toUpperCase(), p.comprimento + " x " + p.largura + " x " + p.espessura, br(p.area, 3), p.codigo === "P1" ? (p.recortes + " / " + p.furos) : "-"]); });
    linhas.push({ total: ["", "TOTAL", "", br(q.m2, 3), (q.unRecorte + q.unRecorteUndermount) + " / " + q.unFuro] });
    var cab2 = ["SERVIÇO", "UN", "QUANT."], l2 = [
      ["ACABAMENTO DE BORDA " + def.borda.toUpperCase(), "m", br(q.mlBorda, 2)], ["POLIMENTO RETO DE TOPO", "m", br(q.mlPolimentoReto, 2)], ["MEIA-ESQUADRIA DA SAIA", "m", br(q.mlMeiaEsquadria, 2)],
      ["POLIMENTO DO RECORTE", "m", br(q.mlPolidoRecorte, 2)], ["RECORTE DE CUBA", "un", String(q.unRecorte + q.unRecorteUndermount)], ["FURO (TORNEIRA/VÁLVULA)", "un", String(q.unFuro)]];
    if (q.maosFrancesas) l2.push(["MÃO-FRANCESA", "un", String(q.maosFrancesas)]);
    return { cab: cab, linhas: linhas, cab2: cab2, linhas2: l2.filter(function (l) { return l[2] !== "0,00" && l[2] !== "0"; }) };
  }

  /* ------------------------------------------------------------ GERAR */
  function gerar(bancadas, op) {
    op = op || {}; var avisos = [], folhas = [];
    bancadas = arr(bancadas).filter(function (b) { return b && b.def; });
    if (!bancadas.length) return { ok: false, folhas: [], avisos: ["Nenhuma bancada de pedra no modelo."] };
    if (!Prancha || !Prancha.carimboRA) return { ok: false, folhas: [], avisos: ["Motor de pranchas (js/prancha.js) não carregado."] };
    var plano = Marmoraria.planoChapa(bancadas.map(function (b) { var d = b.def; d.rotulo = b.rotulo; return d; }));
    var codigo = txt(op.codigo).trim() || "MAR", rev = (txt(op.revisao).trim() || "R00").toUpperCase(), data = BP.dataBR(op.data), revNum = rev.replace(/^R/i, "") || "00";
    var E = op.empresa && typeof op.empresa === "object" ? op.empresa : {}, pend = [];
    function ou(v, ph, nome) { if (v) return v; pend.push(nome); return ph; }
    var resp = txt(op.responsavel).trim() || txt(E.responsavel).trim(), reg = txt(op.registro).trim() || (E.crea && Prancha.fmtRegistro ? Prancha.fmtRegistro(E.crea, txt(E.titulo)) : "");
    var cliente = txt(op.contratante).trim() || txt(op.cliente).trim() || txt(op.proprietario).trim();
    var car = { modelo: "RA", empresa: txt(E.nome).trim() ? "" : ou(txt(op.empresa && typeof op.empresa !== "object" ? op.empresa : ""), "[EMPRESA]", "empresa"), titulo: txt(E.titulo),
      responsavel: ou(resp, "[RESPONSÁVEL TÉCNICO]", "responsável técnico"), registro: ou(reg, "[REGISTRO CREA/CAU]", "registro profissional"),
      obra: ou(txt(op.obra).trim(), "[OBRA]", "obra"), proprietario: ou(txt(op.proprietario).trim() || cliente, "[PROPRIETÁRIO]", "proprietário"),
      contratante: ou(cliente, "[CONTRATANTE]", "contratante"), local: ou(txt(op.local).trim(), "[LOCAL DA OBRA]", "local da obra"),
      codigo: codigo, data: data, revisoes: [[revNum, txt(op.descricaoRevisao) || "EMISSÃO INICIAL - EXECUTIVO DE MARMORARIA", data]] };
    if (pend.length) avisos.push("Carimbo com placeholder em vermelho (sem dado no cadastro): " + pend.join(", ") + ".");
    var M = BP.MODELOS.ra, nTot = bancadas.length;
    bancadas.forEach(function (b, i) {
      var def = b.def, q = Marmoraria.quantitativo(def), pl = plano.filter(function (p) { return p.pedra === def.pedra.nome; })[0] || null;
      var nRot = def.furos.length + (def.cubas.length ? 1 : 0) + 1;   /* linhas de cota acima e à esquerda da planta */
      var lt = lista(def, q), mt1 = BP.medirTabela(lt.cab, lt.linhas, { al: ["C", "E", "C", "D", "C"] }), mt2 = BP.medirTabela(lt.cab2, lt.linhas2, { al: ["E", "C", "D"] });
      /* escolhe formato e escala DESENHANDO: a primeira combinação (A3 → A2, escala maior → menor) em que tudo cabe
         dentro da área de desenho — a planta na largura e o pé das tabelas acima do fim da área */
      function montar(fmt0, esc0) {
        var g0 = Prancha.geometria(fmt0, "paisagem", "RA"); g0.formato = fmt0;
        var D0 = new BP.Desenho(M), A = g0.area, x = A.x + 8 + nRot * 7, y = A.y + 4;
        if (def.L * 1000 / esc0 + nRot * 7 + 24 > A.w) return null;
        var th = BP.tituloDesenho(D0, A.x + 2, y, "PLANTA DA PEÇA - " + b.rotulo + (b.nome ? " - " + txt(b.nome).toUpperCase() : ""), "ESCALA 1:" + esc0, A.w - 4);
        y += th + nRot * 7 + 6;
        var pp = planta(D0, def, x, y, esc0);
        y = pp.base + 10;
        th = BP.tituloDesenho(D0, A.x + 2, y, "VISTA FRONTAL", "ESCALA 1:" + esc0); y += th + 4;
        var vf = frontal(D0, def, x, y, esc0);
        y += vf.h + 8;
        /* faixa de baixo: (1) detalhe da borda | plano de chapa; (2) lista de peças | serviços */
        var yB = y, xB = A.x + 2;
        th = BP.tituloDesenho(D0, xB, yB, "DETALHE DA BORDA", "ESCALA 1:2"); var db = detalheBorda(D0, def, xB + 4, yB + th + 4);
        var xP = xB + Math.max(db.w, 76) + 8;
        var th2 = BP.tituloDesenho(D0, xP, yB, "PLANO DE CHAPA", "SEM ESCALA (PROPORCIONAL)"), pd = planoDesenho(D0, pl, xP, yB + th2 + 3, A.x + A.w - xP - 4, 44);
        var yT = yB + Math.max(th + db.h + 6, th2 + 3 + pd.h + 4);
        var tt = BP.tituloDesenho(D0, xB, yT, "LISTA DE PEÇAS", "");
        var t1 = BP.tabela(D0, xB, yT + tt + 1, lt.cab, lt.linhas, { al: ["C", "E", "C", "D", "C"] });
        var lado = xB + mt1.w + 8 + mt2.w <= A.x + A.w - 2, xS = lado ? xB + mt1.w + 8 : xB, yS = lado ? yT : yT + tt + 1 + t1.h + 4;
        var ts = BP.tituloDesenho(D0, xS, yS, "SERVIÇOS DE MARMORARIA", "");
        var t2 = BP.tabela(D0, xS, yS + ts + 1, lt.cab2, lt.linhas2, { al: ["E", "C", "D"] });
        var fundo = Math.max(yT + tt + 1 + t1.h, yS + ts + 1 + t2.h);
        if (fundo > A.y + A.h - 2) return null;
        /* e nenhum número de cota cruzando outra cota nesta escala (senão tenta a próxima combinação) */
        if (BP.sobreposicoes({ caixasTexto: D0.cx, segmentosCota: D0.cs }).length) return null;
        return { D: D0, geo: g0 };
      }
      var esc = null, fmt = null, geo = null, D = null;
      ["A3", "A2"].some(function (f0) { return ESCALAS.some(function (s0) { var r0 = montar(f0, s0); if (r0) { esc = s0; fmt = f0; geo = r0.geo; D = r0.D; } return !!r0; }); });
      if (!geo) { fmt = "A2"; esc = 50; var rr = montar("A2", 50) || { D: new BP.Desenho(M), geo: Prancha.geometria("A2", "paisagem", "RA") }; D = rr.D; geo = rr.geo; geo.formato = "A2"; avisos.push("Bancada " + b.rotulo + ": não coube no A2 em 1:50 — conferir a folha."); }
      coluna(D, geo, b, pl);
      var pr = Prancha.normalizar({ id: "marmoraria", nome: "Executivo de marmoraria", formato: fmt, orientacao: "paisagem", origem: "marmoraria", carimbo: car,
        folhas: bancadas.map(function (bb, j) { return { id: "marm-" + bb.rotulo, n: j + 1, conteudo: "EXECUTIVO DE MARMORARIA - " + bb.rotulo, escala: "INDICADA", numero: codigo + "-" + dois(j + 1) + " " + rev }; }) });
      var fl = pr.folhas[i]; fl.escala = "INDICADA";
      var rotulo = dois(i + 1), numero = codigo + "-" + rotulo, cs = BP.carimboSvg(pr, fl, geo, E.nome ? E : null, op.logo || null, rotulo + "/" + dois(nTot), M);
      var W = geo.papel.w, H = geo.papel.h, Mo = geo.moldura;
      var frame = '<rect x="' + Mo.x + '" y="' + Mo.y + '" width="' + Mo.w + '" height="' + Mo.h + '" fill="none" stroke="#000" stroke-width="0.5"/>' +
        '<line x1="' + geo.coluna.x + '" y1="' + geo.coluna.y + '" x2="' + geo.coluna.x + '" y2="' + geo.carimbo.y + '" stroke="#000" stroke-width="0.5"/>';
      var titulo = "EXECUTIVO DE MARMORARIA - " + b.rotulo;
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + 'mm" height="' + H + 'mm" viewBox="0 0 ' + W + " " + H + '" font-family="' + BP.PADRAO.fonte + '" text-rendering="geometricPrecision" data-folha="marm-' + b.rotulo + '" data-numero="' + numero + '" data-formato="' + fmt + '">' +
        "<title>" + numero + " - " + titulo + " - " + rev + "</title>" + '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fff"/>' + '<g data-corpo="1">' + D.svg() + "</g>" + frame + cs.svg + "</svg>";
      var f = { id: "marm-" + b.rotulo, rotulo: rotulo, numero: numero, titulo: titulo, formato: fmt, modelo: "ra", escala: "1:" + esc, svg: svg,
        entidades: D.e, caixasTexto: D.cx, segmentosCota: D.cs, caixasCarimbo: cs.caixas, linhasCarimbo: cs.linhas, _pr: pr, _folhaPr: fl, _geo: geo, quantitativo: q };
      f.sobreposicoes = BP.sobreposicoes(f);
      if (f.sobreposicoes.length) avisos.push("Folha " + numero + ": " + f.sobreposicoes.length + " sobreposição(ões)/texto fora da caixa (ex.: '" + f.sobreposicoes[0].a + "' x '" + f.sobreposicoes[0].b + "').");
      if (/NaN|undefined/.test(svg)) avisos.push("Folha " + numero + ": valor inválido (NaN/undefined) no desenho.");
      def.avisos.concat(def.pendencias).forEach(function (s) { avisos.push("Bancada " + b.rotulo + ": " + s); });
      folhas.push(f);
    });
    return { ok: true, folhas: folhas, avisos: avisos, plano: plano };
  }
  /* DXF de cada folha (o mesmo desenho), pelo conversor das pranchas do Blocok */
  function dxf(res, op) {
    var G = typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : {}), BD = G.BlocokDxf || (typeof require === "function" ? require("./blocokdxf.js") : null), BX = G.BimDxf || (typeof require === "function" ? require("./bimdxf.js") : null);
    if (!BD || !BX) return { ok: false, arquivos: [], avisos: ["conversor de DXF não carregado"] };
    if (!G.Prancha) G.Prancha = Prancha;
    var arquivos = [];
    arr(res && res.folhas).forEach(function (f) { var doc = BD.folhaParaDxf(f, op || {}); arquivos.push({ nome: f.numero.replace(/[^A-Za-z0-9_-]+/g, "_") + "-" + f.id + ".dxf", texto: BX.escrever(doc), folha: f.numero }); });
    return { ok: arquivos.length > 0, arquivos: arquivos, avisos: ["DWG: abrir o DXF no AutoCAD e Salvar como DWG (o sistema não gera DWG nativo)."] };
  }
  return { gerar: gerar, dxf: dxf, htmlImpressao: BP.htmlImpressao };
});
