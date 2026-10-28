/* =====================================================================
 * perfildesenho.js — DESENHO COTADO DA SEÇÃO de um perfil do catálogo (BACKLOG #61, 16/10/2026)
 *
 * Para quem escolhe o perfil ver a forma e as medidas antes de lançar a peça: na lista do campo Perfil da
 * ferramenta de criar (js/metalcriarui.js), nas Propriedades e no Catálogo BR (js/metalcatalogobrui.js).
 *
 *   PerfilDesenho.dados(nome)        → { ok, forma, nome, contorno, furos, cotas:[…], espessuras:[…], extra:[…] } | { ok:false, motivo }
 *   PerfilDesenho.svg(nome, op)      → '<svg …>' cotado (string; "" se o perfil não tem seção desenhável)
 *   PerfilDesenho.ficha(nome)        → { massa (kg/m), A (cm²), Ix (cm⁴), Wx (cm³), fonte } | null
 *   PerfilDesenho.fichaHtml(nome)    → a ficha em html curto (massa, A, Ix, Wx e a fonte)
 *   PerfilDesenho.blocoHtml(nome,op) → desenho + ficha juntos (o que as 3 telas mostram)
 *
 * ⚠ O CONTORNO É O DO MOTOR DA PEÇA (BimMetal.secao, js/metalpeca.js), o mesmo que vira o sólido no 3D — com
 *   os raios de concordância e o furo dos tubos. O desenho nunca é uma imagem baixada nem um esquema à parte:
 *   se o motor mudar a seção, o desenho muda junto. As COTAS são as medidas do CATÁLOGO (js/perfisaco.js, em mm),
 *   não medidas tiradas do contorno.
 * ⚠ Todo texto que entra no SVG passa por esc(): o nome do perfil vem do catálogo, mas o catálogo pode ser
 *   importado (Catálogo BR) e o SVG vai por innerHTML.
 * Paleta igual à das tipologias de ligação (js/acoligtipos.js): traço #1d2733, aço #c5d0dc / #4f6275.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global && global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function Aco() { return dep("PerfisAco", "./perfisaco.js"); }
  function Peca() { return dep("BimMetal", "./metalpeca.js"); }

  var INK = "#1d2733", ACO = "#c5d0dc", ACOL = "#4f6275", AUX = "#8a94a3", FUNDO = "#ffffff";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  /* número em pt-BR, sem zeros à direita: 566 → "566", 38.6 → "38,6", 2.66 → "2,66" */
  function br(v, c) {
    if (!fin(v)) return "—";
    c = c == null ? 2 : c;
    var s = (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c);
    if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
    var p = s.split("."); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return p.join(",");
  }
  function r2(v) { return Math.round(v * 100) / 100; }

  /* ================================================================ DADOS
   * A seção (contorno do motor, em m, centrada; y para cima) e o que cotar, por forma:
   *   cotas      = medidas de conjunto, com linha de cota: { eixo: "h" | "v", de, ate (m, na coordenada do eixo), lado, valor (mm), rot }
   *   espessuras = chapas finas, com chamada: { alvo:[x,y] (m), valor (mm), rot }
   *   extra      = o que não cabe no desenho (raio), vai em texto embaixo */
  function retangulo(b, h) { return [[-b / 2, -h / 2], [b / 2, -h / 2], [b / 2, h / 2], [-b / 2, h / 2]]; }
  function dados(nome) {
    var A = Aco(), B = Peca();
    if (!A) return { ok: false, motivo: "O catálogo de perfis (js/perfisaco.js) não carregou." };
    var o = nome ? A.obter(nome) : null; if (!o) return { ok: false, motivo: "Perfil fora do catálogo: " + (nome || "?") + "." };
    var p = A.paraPerfil(o.nome); if (!p) return { ok: false, motivo: "O perfil " + o.nome + " não tem seção desenhável." };
    var s = B && B.secao ? B.secao(p) : null, contorno = null, furos = [];
    if (s && s.ok && s.contorno && s.contorno.length >= 3) { contorno = s.contorno; furos = (s.furos || []).filter(function (f) { return Array.isArray(f) && f.length >= 3; }); }
    else if (p.forma === "ret" && p.b > 0 && p.h > 0) contorno = retangulo(p.b, p.h);   /* barra chata: o motor não desenha, o retângulo é exato */
    else return { ok: false, motivo: (s && s.motivo) || "O motor da peça (js/metalpeca.js) não desenhou a seção de " + o.nome + "." };
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    contorno.forEach(function (q) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; });
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;   /* o desenho é centrado na caixa (o U e a cantoneira não são simétricos) */
    function C(q) { return [q[0] - cx, q[1] - cy]; }
    contorno = contorno.map(C); furos = furos.map(function (f) { return f.map(C); });
    var W = x1 - x0, H = y1 - y0, L = -W / 2, R = W / 2, T = H / 2, Bt = -H / 2;
    var cotas = [], esp = [], extra = [], f = p.forma;
    function ch(eixo, v, rot) { cotas.push({ eixo: eixo, de: eixo === "h" ? L : Bt, ate: eixo === "h" ? R : T, valor: v, rot: rot }); }
    if (f === "I" || f === "U") {
      ch("h", o.bf, "bf"); ch("v", o.d, "d");
      var tw = o.tw / 1000, tf = o.tf / 1000;
      var xw = f === "I" ? 0 : L + tw / 2;   /* o U do motor tem a alma à esquerda (contorno de js/bimarq.js) */
      esp.push({ alvo: [xw, 0], valor: o.tw, rot: "tw" });
      esp.push({ alvo: [f === "I" ? W / 4 : (xw + R) / 2, T - tf / 2], valor: o.tf, rot: "tf" });
      if (fin(o.r) && o.r > 0) extra.push("r = " + br(o.r) + " mm");
    } else if (f === "frio") {
      var t = o.t / 1000, tf = p.tipoFrio;
      if (tf === "Z90" || tf === "Z") {
        /* Z e Ze: a alma no centro, a mesa de cima para a direita e a de baixo para a esquerda; bf da face externa da alma à ponta da mesa */
        ch("v", o.bw, "bw");
        cotas.push({ eixo: "h", de: -t / 2, ate: -t / 2 + o.bf / 1000, valor: o.bf, rot: "bf" });
        esp.push({ alvo: [0, 0], valor: o.t, rot: "t" });
        if (fin(o.D) && o.D > 0) cotas.push({ eixo: "v", de: T - o.D / 1000, ate: T, valor: o.D, rot: "D", direita: true });
      } else if (tf === "Cr") {
        /* cartola: bf é o topo externo; D é a aba de baixo, da face interna da perna até a ponta */
        ch("v", o.bw, "bw");
        cotas.push({ eixo: "h", de: -o.bf / 2000, ate: o.bf / 2000, valor: o.bf, rot: "bf" });
        if (fin(o.D)) cotas.push({ eixo: "h", de: L, ate: -o.bf / 2000 + t, valor: o.D, rot: "D", baixo: true });
        esp.push({ alvo: [-o.bf / 2000 + t / 2, 0], valor: o.t, rot: "t" });
      } else {
        ch("h", o.bf, "bf"); ch("v", o.bw, "bw");
        esp.push({ alvo: [L + t / 2, 0], valor: o.t, rot: "t" });
        if (tf === "Ue" && fin(o.D)) cotas.push({ eixo: "v", de: T - o.D / 1000, ate: T, valor: o.D, rot: "D", direita: true });
      }
      if (fin(o.ri) && o.ri > 0) extra.push("raio interno " + br(o.ri) + " mm");
    } else if (f === "L") {
      ch("h", o.b, "b"); ch("v", o.a, "a");
      esp.push({ alvo: [L + (o.t / 1000) / 2, 0], valor: o.t, rot: "t" });
      if (fin(o.r) && o.r > 0) extra.push("r = " + br(o.r) + " mm");
    } else if (f === "tubo-ret") {
      ch("h", o.b, "B"); ch("v", o.h, "H");
      esp.push({ alvo: [R - (o.t / 1000) / 2, 0], valor: o.t, rot: "t" });
      if (fin(o.ro) && o.ro > 0) extra.push("raio externo " + br(o.ro) + " mm");
    } else if (f === "tubo-circ") {
      ch("h", o.D, "D");
      esp.push({ alvo: [R - (o.t / 1000) / 2, 0], valor: o.t, rot: "t" });
    } else if (f === "circ") {
      ch("h", o.d, "Ø");
    } else if (f === "ret") {
      ch("h", o.b, "b"); ch("v", o.h, "h");
    }
    return { ok: true, nome: o.nome, forma: f, tipoFrio: p.tipoFrio || "", contorno: contorno, furos: furos, larg: W, alt: H, cotas: cotas, espessuras: esp, extra: extra };
  }

  /* ================================================================ SVG
   * op = { largura (px na tela, padrão 240), titulo: false (sem o nome no topo) }
   * Folga fixa à esquerda (cota vertical), em cima (horizontal) e à direita (chamadas das espessuras); a seção
   * ocupa o resto, na escala que couber — a escala sai escrita embaixo para ninguém medir no papel. */
  var VW = 260, VH = 246, ME = 46, MT = 50, MD = 70, MB = 34;
  function svg(nome, op) {
    op = op || {};
    var d = dados(nome); if (!d.ok) return "";
    var mbx = d.cotas.some(function (c) { return c.baixo; }) ? 56 : MB;   /* cota por baixo (cartola): mais folga embaixo */
    var aw = VW - ME - MD, ah = VH - MT - mbx;
    var esc0 = Math.min(aw / Math.max(d.larg, 1e-6), ah / Math.max(d.alt, 1e-6));
    var ox = ME + aw / 2, oy = MT + ah / 2;
    function X(x) { return r2(ox + x * esc0); }
    function Y(y) { return r2(oy - y * esc0); }   /* y da seção para cima; o do SVG para baixo */
    function caminho(pts) { return "M" + pts.map(function (q) { return X(q[0]) + " " + Y(q[1]); }).join("L") + "Z"; }
    var h = [], L = -d.larg / 2, R = d.larg / 2, T = d.alt / 2, B = -d.alt / 2;
    h.push('<rect x="0.5" y="0.5" width="' + (VW - 1) + '" height="' + (VH - 1) + '" rx="8" fill="' + FUNDO + '" stroke="#d9dee5"/>');
    if (op.titulo !== false) h.push('<text x="' + (VW / 2) + '" y="15" font-size="11" font-weight="600" font-family="sans-serif" fill="' + INK + '" text-anchor="middle">' + esc(d.nome) + "</text>");
    /* eixos de simetria, tracejados finos */
    h.push('<line x1="' + X(0) + '" y1="' + (Y(T) - 6) + '" x2="' + X(0) + '" y2="' + (Y(B) + 6) + '" stroke="' + AUX + '" stroke-width="0.6" stroke-dasharray="6 2 1 2"/>');
    h.push('<line x1="' + (X(L) - 6) + '" y1="' + Y(0) + '" x2="' + (X(R) + 6) + '" y2="' + Y(0) + '" stroke="' + AUX + '" stroke-width="0.6" stroke-dasharray="6 2 1 2"/>');
    h.push('<path d="' + [caminho(d.contorno)].concat(d.furos.map(caminho)).join(" ") + '" fill="' + ACO + '" fill-rule="evenodd" stroke="' + ACOL + '" stroke-width="1.2" stroke-linejoin="round"/>');
    function tique(x, y) { return '<line x1="' + r2(x - 3) + '" y1="' + r2(y + 3) + '" x2="' + r2(x + 3) + '" y2="' + r2(y - 3) + '" stroke="' + INK + '" stroke-width="1.1"/>'; }
    function linha(x1, y1, x2, y2, w) { return '<line x1="' + r2(x1) + '" y1="' + r2(y1) + '" x2="' + r2(x2) + '" y2="' + r2(y2) + '" stroke="' + INK + '" stroke-width="' + (w || 0.7) + '"/>'; }
    function texto(x, y, s, ancora, giro) {
      return '<text x="' + r2(x) + '" y="' + r2(y) + '" font-size="10" font-family="sans-serif" fill="' + INK + '" text-anchor="' + (ancora || "middle") + '"' +
        (giro ? ' transform="rotate(' + giro + " " + r2(x) + " " + r2(y) + ')"' : "") + ">" + s + "</text>";
    }
    d.cotas.forEach(function (c) {
      var rot = esc(c.rot) + " " + esc(br(c.valor));
      if (c.eixo === "h") {
        var xa = X(c.de), xb = X(c.ate);
        if (c.baixo) {   /* cota por baixo da seção (a aba da cartola) */
          var yd = Y(B) + 14;
          h.push(linha(xa, Y(B) + 3, xa, yd + 4), linha(xb, Y(B) + 3, xb, yd + 4), linha(xa - 4, yd, xb + 4, yd), tique(xa, yd), tique(xb, yd), texto((xa + xb) / 2, yd + 11, rot));
        } else {
          var yc = Y(T) - 14;
          h.push(linha(xa, Y(T) - 3, xa, yc - 4), linha(xb, Y(T) - 3, xb, yc - 4), linha(xa - 4, yc, xb + 4, yc), tique(xa, yc), tique(xb, yc), texto((xa + xb) / 2, yc - 4, rot));
        }
      } else {
        var dir = !!c.direita, xs = dir ? X(R) : X(L), xc = dir ? xs + 12 : xs - 14, ya = Y(c.ate), yb = Y(c.de), sg = dir ? 1 : -1;
        h.push(linha(xs + 3 * sg, ya, xc + 4 * sg, ya), linha(xs + 3 * sg, yb, xc + 4 * sg, yb), linha(xc, ya - 4, xc, yb + 4), tique(xc, ya), tique(xc, yb),
          dir ? texto(xc + 4, (ya + yb) / 2 + 3, rot, "start") : texto(xc - 4, (ya + yb) / 2, rot, "middle", -90));
      }
    });
    /* chamadas das espessuras: do ponto na chapa até a coluna da direita, uma embaixo da outra se colidirem */
    var ocupado = [], xt = VW - MD + 12;
    d.espessuras.slice().sort(function (a, b) { return b.alvo[1] - a.alvo[1]; }).forEach(function (e) {
      var px = X(e.alvo[0]), py = Y(e.alvo[1]), ty = py;
      ocupado.forEach(function (u) { if (Math.abs(ty - u) < 13) ty = u + 13; });
      ocupado.push(ty);
      h.push('<circle cx="' + px + '" cy="' + py + '" r="1.8" fill="' + INK + '"/>', linha(px, py, xt - 3, ty, 0.6), texto(xt, ty + 3.5, esc(e.rot) + " " + esc(br(e.valor)), "start"));
    });
    var rod = ["medidas em mm"].concat(d.extra).join(" · ");
    h.push(texto(VW / 2, VH - 10, esc(rod)));
    var lw = Math.max(120, Math.round(op.largura || 240));
    return '<svg xmlns="http://www.w3.org/2000/svg" class="pfd-svg" viewBox="0 0 ' + VW + " " + VH + '" width="' + lw + '" height="' + Math.round(lw * VH / VW) + '" role="img" aria-label="' + esc("Seção cotada do perfil " + d.nome) + '"><title>' + esc("Seção do perfil " + d.nome) + "</title>" + h.join("") + "</svg>";
  }

  /* ================================================================ FICHA
   * as propriedades que quem escolhe o perfil compara: massa, área, Ix e Wx (o catálogo guarda mm, mm², mm⁴, mm³)
   * e a FONTE — o fabricante e o começo do texto da fonte (o texto inteiro, com hash, fica no Catálogo BR) */
  function fonteCurta(o) {
    var f = String(o.fonte || "").split(/ — | \(/)[0].trim();
    if (f.length > 70) f = f.slice(0, 68).replace(/\s+\S*$/, "") + "…";
    var fab = String(o.fabricante || "").trim();
    if (fab && f.toLowerCase().indexOf(fab.toLowerCase()) === 0) return f;
    return [fab, f].filter(Boolean).join(" — ");
  }
  function ficha(nome) {
    var A = Aco(), o = A && nome ? A.obter(nome) : null; if (!o) return null;
    return { nome: o.nome, massa: fin(o.massa) ? o.massa : null, A: fin(o.A) ? o.A / 100 : null, Ix: fin(o.Ix) ? o.Ix / 1e4 : null, Wx: fin(o.Wx) ? o.Wx / 1e3 : null, fonte: fonteCurta(o) };
  }
  function fichaHtml(nome) {
    var f = ficha(nome); if (!f) return "";
    function item(rot, v, un, c) { return v == null ? "" : '<span class="pfd-it"><b>' + rot + "</b> " + esc(br(v, c)) + " " + un + "</span>"; }
    return '<div class="pfd-ficha" data-pfd="ficha">' + item("massa", f.massa, "kg/m", 2) + item("A", f.A, "cm²", 2) + item("Ix", f.Ix, "cm⁴", f.Ix >= 100 ? 0 : 2) + item("Wx", f.Wx, "cm³", f.Wx >= 100 ? 0 : 2) +
      (f.fonte ? '<span class="pfd-fonte" title="Fonte dos valores">Fonte: ' + esc(f.fonte) + "</span>" : "") + "</div>";
  }
  function css() {
    if (typeof document === "undefined" || !document.head || document.getElementById("pfd-estilo")) return;
    var st = document.createElement("style"); st.id = "pfd-estilo";
    st.textContent = ".pfd-bloco{display:flex;flex-direction:column;gap:6px;align-items:stretch;width:100%;max-width:100%;box-sizing:border-box;white-space:normal}.pfd-svg{max-width:100%;height:auto;display:block}" +
      ".pfd-ficha{display:flex;flex-wrap:wrap;gap:4px 10px;min-width:0;max-width:100%;overflow-wrap:anywhere;font-size:12px;line-height:1.35;color:var(--texto,#1d2733)}.pfd-ficha b{font-weight:600}" +
      ".pfd-fonte{flex-basis:100%;font-size:11px;color:var(--texto-fraco,#5b6573)}";
    document.head.appendChild(st);
  }
  function blocoHtml(nome, op) {
    var s = svg(nome, op); if (!s) return "";
    css();
    return '<div class="pfd-bloco" data-pfd="bloco" data-pfd-nome="' + esc(nome) + '">' + s + fichaHtml(nome) + "</div>";
  }

  var PerfilDesenho = { dados: dados, svg: svg, ficha: ficha, fichaHtml: fichaHtml, blocoHtml: blocoHtml, _br: br };
  global.PerfilDesenho = PerfilDesenho;
  if (typeof module !== "undefined" && module.exports) module.exports = PerfilDesenho;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
