/* =====================================================================
 * docx.js — A PROPOSTA EM WORD (.docx), do mesmo HTML que vai para o PDF
 *
 * POR QUE ISTO EXISTE (13/10/2026). O cliente que recebe a proposta em PDF
 * pede "manda em Word" para ajustar uma frase, anexar ao contrato dele ou
 * pôr no padrão da empresa. Até aqui a saída era só a impressão do
 * navegador. Agora o MESMO HTML que o motor do modelo (js/proptpl.js) e o
 * documento clássico (js/proposta.js) desenham vira um .docx de verdade:
 * texto editável, tabelas, listas, fotos embutidas, uma página por seção.
 *
 * ⚠ É .DOCX DE VERDADE (OOXML dentro de um ZIP), NÃO HTML COM EXTENSÃO .DOC.
 *   O ".doc" que é HTML abre em "Layout da Web", perde as imagens em data:
 *   URI e assusta o Word com aviso de formato. O Rogério não aceita CSV no
 *   lugar de planilha (memória "entregáveis"); vale o mesmo aqui.
 *
 * ⚠ SEM BIBLIOTECA. O produto não vendoriza zip (ver js/pacoteobra.js), e
 *   o gravador de ZIP do js/bimbcf.js mora no grupo BIM — que o núcleo não
 *   pode chamar (tools/test-carregar.js reprova). O ZIP aqui é "stored"
 *   (sem compressão): 80 linhas, CRC-32 e dois cabeçalhos, e o Word abre.
 *   Um .docx de proposta com três fotos fica em ~1,5 MB; aceitável.
 *
 * ⚠ O CONVERSOR É GENÉRICO E PURO: recebe o HTML como texto, monta a árvore
 *   com o próprio tokenizador (o HTML é nosso, bem formado — não precisa de
 *   DOMParser, e assim o motor roda no Node, onde tools/test-docx.js o
 *   executa). Não conhece bloco nenhum do modelo: conhece tags (h1–h3, p,
 *   ul/li, table, img, b/i, br) e algumas CLASSES do desenho (capa cheia,
 *   total, legenda, colunas, assinatura). Bloco novo no motor sai no Word
 *   sem ninguém tocar aqui.
 *
 * ⚠ O QUE NÃO VAI PARA O WORD, de propósito: o ornamento de curvas e o
 *   Gantt (SVG), a marca d'água e o carimbo de vencida (ficam só no papel
 *   impresso), o fundo escuro das páginas internas (texto preto em branco
 *   imprime em qualquer impressora). A capa cheia vira a foto em faixa + o
 *   título numa caixa na cor da marca.
 *
 * ⚠ NENHUM NÚMERO NASCE AQUI. O que está no HTML é o que sai; a auditoria
 *   de custo (Proposta.auditar) já rodou em cima do HTML antes de ele
 *   chegar — o Word é outro formato do MESMO documento auditado.
 * ===================================================================== */
(function (global) {
  "use strict";

  var Docx = {};
  Docx.MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  function txt(v) { return String(v == null ? "" : v).trim(); }
  function num(v) { var n = +v; return isFinite(n) ? n : 0; }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }
  /* caractere que o XML 1.0 não aceita (controle) sai, senão o Word recusa o arquivo */
  function xmlSeguro(s) { return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, ""); }

  /* =====================================================================
   * 1. BYTES: UTF-8, base64 e o ZIP "stored"
   * ===================================================================== */
  function utf8(s) {
    s = String(s == null ? "" : s);
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s);
    var out = [], i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
        var d = s.charCodeAt(i + 1);
        if (d >= 0xDC00 && d <= 0xDFFF) { c = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00); i++; }
      }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }
  Docx.utf8 = utf8;

  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var B64_INV = null;
  function deBase64(b64) {
    var s = String(b64 || "").replace(/[^A-Za-z0-9+\/=]/g, "");
    if (!B64_INV) { B64_INV = {}; for (var q = 0; q < 64; q++) B64_INV[B64.charAt(q)] = q; }
    var n = s.length, pad = 0;
    if (n && s.charAt(n - 1) === "=") pad++;
    if (n > 1 && s.charAt(n - 2) === "=") pad++;
    var out = new Uint8Array(Math.floor((n * 3) / 4) - pad), o = 0, i;
    for (i = 0; i < n; i += 4) {
      var a = B64_INV[s.charAt(i)] || 0, b = B64_INV[s.charAt(i + 1)] || 0,
          c = B64_INV[s.charAt(i + 2)] || 0, d = B64_INV[s.charAt(i + 3)] || 0;
      var tri = (a << 18) | (b << 12) | (c << 6) | d;
      if (o < out.length) out[o++] = (tri >> 16) & 255;
      if (o < out.length) out[o++] = (tri >> 8) & 255;
      if (o < out.length) out[o++] = tri & 255;
    }
    return out;
  }
  Docx.deBase64 = deBase64;

  /* CRC-32 (tabela gerada uma vez) — o ZIP exige, e CRC errado faz o Word
     dizer que o arquivo está corrompido */
  var CRC_T = null;
  function crc32(b) {
    if (!CRC_T) {
      CRC_T = new Int32Array(256);
      for (var i = 0; i < 256; i++) { var c = i; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); CRC_T[i] = c; }
    }
    var crc = -1;
    for (var j = 0; j < b.length; j++) crc = CRC_T[(crc ^ b[j]) & 255] ^ (crc >>> 8);
    return (crc ^ -1) >>> 0;
  }
  Docx.crc32 = crc32;

  function u16(a, p, v) { a[p] = v & 255; a[p + 1] = (v >>> 8) & 255; }
  function u32(a, p, v) { a[p] = v & 255; a[p + 1] = (v >>> 8) & 255; a[p + 2] = (v >>> 16) & 255; a[p + 3] = (v >>> 24) & 255; }
  /* data/hora DOS fixa (01/01/2026 00:00): o arquivo não muda de bytes por
     causa do relógio — o teste compara saídas, e o cliente não lê a data
     interna do ZIP (a do documento está no docProps/core.xml) */
  var DOS_DATA = ((2026 - 1980) << 9) | (1 << 5) | 1, DOS_HORA = 0;

  /* `arquivos`: [{ nome, dados: Uint8Array | string }] → Uint8Array do ZIP */
  Docx.zip = function (arquivos) {
    var itens = [], total = 0;
    (arquivos || []).forEach(function (a) {
      var dados = (typeof a.dados === "string") ? utf8(a.dados) : (a.dados || new Uint8Array(0));
      var nome = utf8(a.nome);
      itens.push({ nome: nome, dados: dados, crc: crc32(dados), off: 0 });
      total += 30 + nome.length + dados.length + 46 + nome.length;
    });
    var out = new Uint8Array(total + 22), p = 0, i, it;
    for (i = 0; i < itens.length; i++) {
      it = itens[i]; it.off = p;
      u32(out, p, 0x04034b50); u16(out, p + 4, 20); u16(out, p + 6, 0x0800); u16(out, p + 8, 0);
      u16(out, p + 10, DOS_HORA); u16(out, p + 12, DOS_DATA); u32(out, p + 14, it.crc);
      u32(out, p + 18, it.dados.length); u32(out, p + 22, it.dados.length);
      u16(out, p + 26, it.nome.length); u16(out, p + 28, 0);
      p += 30; out.set(it.nome, p); p += it.nome.length; out.set(it.dados, p); p += it.dados.length;
    }
    var cd = p;
    for (i = 0; i < itens.length; i++) {
      it = itens[i];
      u32(out, p, 0x02014b50); u16(out, p + 4, 20); u16(out, p + 6, 20); u16(out, p + 8, 0x0800); u16(out, p + 10, 0);
      u16(out, p + 12, DOS_HORA); u16(out, p + 14, DOS_DATA); u32(out, p + 16, it.crc);
      u32(out, p + 20, it.dados.length); u32(out, p + 24, it.dados.length);
      u16(out, p + 28, it.nome.length); u16(out, p + 30, 0); u16(out, p + 32, 0); u16(out, p + 34, 0); u16(out, p + 36, 0);
      u32(out, p + 38, 0); u32(out, p + 42, it.off);
      p += 46; out.set(it.nome, p); p += it.nome.length;
    }
    u32(out, p, 0x06054b50); u16(out, p + 4, 0); u16(out, p + 6, 0); u16(out, p + 8, itens.length); u16(out, p + 10, itens.length);
    u32(out, p + 12, p - cd); u32(out, p + 16, cd); u16(out, p + 20, 0);
    return out;
  };

  /* dimensões da imagem, lidas do cabeçalho — sem elas a foto sairia
     esticada; formato que não se lê recebe a proporção 3:2 */
  function dimensoes(b, tipo) {
    try {
      if (tipo === "png" && b.length > 24) return { w: (b[16] << 24 | b[17] << 16 | b[18] << 8 | b[19]) >>> 0, h: (b[20] << 24 | b[21] << 16 | b[22] << 8 | b[23]) >>> 0 };
      if (tipo === "gif" && b.length > 10) return { w: b[6] | (b[7] << 8), h: b[8] | (b[9] << 8) };
      if (tipo === "jpeg") {
        var p = 2;
        while (p + 9 < b.length) {
          if (b[p] !== 0xFF) { p++; continue; }
          var m = b[p + 1];
          if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { p += 2; continue; }
          var len = (b[p + 2] << 8) | b[p + 3];
          if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
            return { h: (b[p + 5] << 8) | b[p + 6], w: (b[p + 7] << 8) | b[p + 8] };
          }
          p += 2 + len;
        }
      }
    } catch (e) {}
    return { w: 3, h: 2 };
  }
  Docx.dimensoes = dimensoes;

  /* =====================================================================
   * 2. O HTML VIRA ÁRVORE
   *
   * Tokenizador mínimo para HTML bem formado (o nosso): tags em minúsculas,
   * atributos entre aspas, elementos vazios conhecidos, <style>/<script>/
   * <svg> pulados inteiros, entidades decodificadas.
   * ===================================================================== */
  var VAZIOS = { br: 1, img: 1, hr: 1, input: 1, meta: 1, link: 1, source: 1, wbr: 1, col: 1 };
  var PULAR = { script: 1, style: 1, svg: 1, template: 1, head: 1, noscript: 1, canvas: 1, video: 1, audio: 1, iframe: 1 };
  var ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·", ndash: "–", mdash: "—",
    hellip: "…", laquo: "«", raquo: "»", copy: "©", reg: "®", deg: "°", times: "×", bull: "•", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”" };
  function decodeEnt(s) {
    return String(s).replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, function (m, e) {
      if (e.charAt(0) === "#") {
        var cp = (e.charAt(1) === "x" || e.charAt(1) === "X") ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        if (!isFinite(cp) || cp < 0 || cp > 0x10FFFF) return m;
        if (cp > 0xFFFF) { cp -= 0x10000; return String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF)); }
        return String.fromCharCode(cp);
      }
      return ENT.hasOwnProperty(e) ? ENT[e] : m;
    });
  }
  function atributos(s) {
    var out = {}, re = /([a-zA-Z_:][-\w:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g, m;
    while ((m = re.exec(s))) out[m[1].toLowerCase()] = decodeEnt(m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : "")));
    return out;
  }
  Docx.arvore = function (html) {
    var s = String(html == null ? "" : html);
    var raiz = { tag: "#root", attrs: {}, filhos: [] }, pilha = [raiz], i = 0, n = s.length;
    function topo() { return pilha[pilha.length - 1]; }
    function texto(t) { if (t) topo().filhos.push({ tag: "#text", texto: decodeEnt(t) }); }
    while (i < n) {
      var lt = s.indexOf("<", i);
      if (lt < 0) { texto(s.slice(i)); break; }
      texto(s.slice(i, lt));
      if (s.substr(lt, 4) === "<!--") { var fim = s.indexOf("-->", lt + 4); i = fim < 0 ? n : fim + 3; continue; }
      if (s.substr(lt, 2) === "<!") { var gt0 = s.indexOf(">", lt); i = gt0 < 0 ? n : gt0 + 1; continue; }
      var gt = s.indexOf(">", lt);
      if (gt < 0) { texto(s.slice(lt)); break; }
      var dentro = s.slice(lt + 1, gt);
      i = gt + 1;
      if (dentro.charAt(0) === "/") {
        var fecha = dentro.slice(1).trim().toLowerCase();
        for (var k = pilha.length - 1; k > 0; k--) { if (pilha[k].tag === fecha) { pilha.length = k; break; } }
        continue;
      }
      var auto = /\/\s*$/.test(dentro);
      if (auto) dentro = dentro.replace(/\/\s*$/, "");
      var mt = dentro.match(/^([a-zA-Z][\w:-]*)([\s\S]*)$/);
      if (!mt) continue;
      var tag = mt[1].toLowerCase();
      var no = { tag: tag, attrs: atributos(mt[2] || ""), filhos: [] };
      if (PULAR[tag]) {
        /* pula o conteúdo inteiro, até o fechamento correspondente */
        var fe = s.indexOf("</" + tag, i);
        var gt2 = fe < 0 ? -1 : s.indexOf(">", fe);
        i = gt2 < 0 ? n : gt2 + 1;
        continue;
      }
      topo().filhos.push(no);
      if (!auto && !VAZIOS[tag]) pilha.push(no);
    }
    return raiz;
  };

  function classes(no) { return (" " + String((no && no.attrs && no.attrs["class"]) || "") + " "); }
  function temClasse(no, c) { return classes(no).indexOf(" " + c + " ") > -1; }
  function estiloDe(no, prop) {
    var st = String((no && no.attrs && no.attrs.style) || "");
    var re = new RegExp("(?:^|;)\\s*" + prop.replace(/[-]/g, "\\-") + "\\s*:\\s*([^;]+)", "i");
    var m = st.match(re);
    return m ? m[1].trim() : "";
  }
  function textoDe(no) {
    if (!no) return "";
    if (no.tag === "#text") return no.texto;
    var s = "";
    (no.filhos || []).forEach(function (f) { s += (f.tag === "br") ? "\n" : textoDe(f); });
    return s;
  }
  function hex6(c) {
    var s = txt(c);
    var m = s.match(/^#([0-9a-fA-F]{6})$/);
    if (m) return m[1].toUpperCase();
    m = s.match(/^#([0-9a-fA-F]{3})$/);
    if (m) return (m[1].charAt(0) + m[1].charAt(0) + m[1].charAt(1) + m[1].charAt(1) + m[1].charAt(2) + m[1].charAt(2)).toUpperCase();
    m = s.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) return [m[1], m[2], m[3]].map(function (x) { var h = (+x).toString(16); return (h.length < 2 ? "0" : "") + h; }).join("").toUpperCase();
    return "";
  }
  /* o nome da família para o Word: a primeira da pilha CSS */
  function familia(stack) {
    var s = txt(stack);
    if (!s) return "";
    var m = s.match(/^\s*["']([^"']+)["']/) || s.match(/^\s*([^,]+)/);
    var f = m ? m[1].trim() : "";
    return /^(serif|sans-serif|monospace|system-ui)$/i.test(f) ? "" : f;
  }

  /* =====================================================================
   * 3. A ÁRVORE VIRA OOXML
   * ===================================================================== */
  var TW_A4 = { w: 11906, h: 16838, mt: 1021, mb: 1021, ml: 907, mr: 907 };       /* 210×297 mm, margens 18/16 mm */
  var TW_VERT = { w: 6803, h: 12076, mt: 794, mb: 794, ml: 680, mr: 680 };        /* 120×213 mm, margens 14/12 mm */
  var EMU_TW = 635;

  function Gerador(op) {
    op = op || {};
    this.op = op;
    this.pg = (op.formato === "vertical") ? TW_VERT : TW_A4;
    this.largura = this.pg.w - this.pg.ml - this.pg.mr;        /* twips úteis */
    this.cores = {
      titulo: hex6(op.corTitulo) || "0F2740", texto: hex6(op.corTexto) || "1A2632",
      destaque: hex6(op.corDestaque) || "2E6F9E", escuro: hex6(op.corFundoEscuro) || "143454"
    };
    this.fontes = { titulo: familia(op.fonteTitulo) || familia(op.fonteTexto) || "Calibri", texto: familia(op.fonteTexto) || "Calibri" };
    this.corpo = [];          /* trechos XML do <w:body> */
    this.media = [];          /* { nome, dados, rId } */
    this.rels = [];
    this.avisos = [];
    this.idImg = 0;
    this.usaBullet = false; this.usaNumero = false;
  }

  Gerador.prototype.rId = function () { return "rId" + (100 + this.rels.length); };

  /* ---------- runs ---------- */
  function rPr(f) {
    var s = "";
    if (f.fonte) s += '<w:rFonts w:ascii="' + esc(f.fonte) + '" w:hAnsi="' + esc(f.fonte) + '" w:cs="' + esc(f.fonte) + '"/>';
    if (f.negrito) s += "<w:b/><w:bCs/>";
    if (f.italico) s += "<w:i/><w:iCs/>";
    if (f.caixaAlta) s += "<w:caps/>";
    if (f.cor) s += '<w:color w:val="' + f.cor + '"/>';
    if (f.tamanho) s += '<w:sz w:val="' + Math.round(f.tamanho * 2) + '"/><w:szCs w:val="' + Math.round(f.tamanho * 2) + '"/>';
    if (f.espaco) s += '<w:spacing w:val="' + f.espaco + '"/>';
    return s ? "<w:rPr>" + s + "</w:rPr>" : "";
  }
  function run(texto, f) {
    var t = xmlSeguro(String(texto == null ? "" : texto));
    if (!t) return "";
    var partes = t.split("\n"), out = "";
    for (var i = 0; i < partes.length; i++) {
      if (i) out += "<w:r>" + rPr(f) + "<w:br/></w:r>";
      if (partes[i]) out += "<w:r>" + rPr(f) + '<w:t xml:space="preserve">' + esc(partes[i]) + "</w:t></w:r>";
    }
    return out;
  }
  function herda(f, extra) { var o = {}; for (var k in f) if (Object.prototype.hasOwnProperty.call(f, k)) o[k] = f[k]; for (var k2 in extra) if (Object.prototype.hasOwnProperty.call(extra, k2)) o[k2] = extra[k2]; return o; }

  /* ---------- parágrafos ---------- */
  function pPr(p) {
    var s = "";
    if (p.estilo) s += '<w:pStyle w:val="' + p.estilo + '"/>';
    if (p.numId) s += '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="' + p.numId + '"/></w:numPr>';
    if (p.bordaBaixo || p.bordaCima || p.bordaEsq) {
      s += "<w:pBdr>";
      if (p.bordaCima) s += '<w:top w:val="single" w:sz="' + (p.bordaCima.sz || 6) + '" w:space="1" w:color="' + (p.bordaCima.cor || "000000") + '"/>';
      if (p.bordaEsq) s += '<w:left w:val="single" w:sz="' + (p.bordaEsq.sz || 18) + '" w:space="8" w:color="' + (p.bordaEsq.cor || "000000") + '"/>';
      if (p.bordaBaixo) s += '<w:bottom w:val="single" w:sz="' + (p.bordaBaixo.sz || 8) + '" w:space="1" w:color="' + (p.bordaBaixo.cor || "000000") + '"/>';
      s += "</w:pBdr>";
    }
    if (p.fundo) s += '<w:shd w:val="clear" w:color="auto" w:fill="' + p.fundo + '"/>';
    s += '<w:spacing w:before="' + (p.antes != null ? p.antes : 0) + '" w:after="' + (p.depois != null ? p.depois : 120) + '"' + (p.entrelinha ? ' w:line="' + p.entrelinha + '" w:lineRule="auto"' : "") + "/>";
    if (p.numId) s += '<w:ind w:left="567" w:hanging="283"/>';
    else if (p.recuo) s += '<w:ind w:left="' + p.recuo + '"/>';
    if (p.alinha) s += '<w:jc w:val="' + p.alinha + '"/>';
    if (p.juntos) s += "<w:keepNext/>";
    return "<w:pPr>" + s + "</w:pPr>";
  }
  function paragrafo(p, runs) { return "<w:p>" + pPr(p || {}) + (runs || "") + "</w:p>"; }
  var QUEBRA = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

  /* ---------- imagem ---------- */
  Gerador.prototype.imagem = function (no, maxW, maxH, alinha) {
    var src = String((no.attrs && no.attrs.src) || "");
    var m = src.match(/^data:image\/(png|jpe?g|gif|webp);base64,([\s\S]+)$/i);
    if (!m) { if (src) this.avisos.push("imagem fora do formato embutido foi deixada de fora"); return ""; }
    var tipo = m[1].toLowerCase() === "jpg" ? "jpeg" : m[1].toLowerCase();
    if (tipo === "webp") { this.avisos.push("uma imagem WebP ficou de fora (o Word não a abre)"); return ""; }
    var dados = deBase64(m[2]);
    if (!dados.length) return "";
    var dim = dimensoes(dados, tipo);
    var razao = (dim.w > 0 && dim.h > 0) ? dim.w / dim.h : 1.5;
    var w = maxW, h = w / razao;
    if (maxH && h > maxH) { h = maxH; w = h * razao; }
    this.idImg++;
    var rid = this.rId();
    var nome = "image" + this.idImg + "." + (tipo === "jpeg" ? "jpg" : tipo);
    this.media.push({ nome: nome, dados: dados, tipo: tipo });
    this.rels.push({ id: rid, tipo: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image", alvo: "media/" + nome });
    var cx = Math.round(w * EMU_TW), cy = Math.round(h * EMU_TW);
    var desenho = "<w:r><w:drawing><wp:inline distT=\"0\" distB=\"0\" distL=\"0\" distR=\"0\"><wp:extent cx=\"" + cx + "\" cy=\"" + cy + "\"/>"
      + '<wp:docPr id="' + this.idImg + '" name="Imagem ' + this.idImg + '"/>'
      + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
      + '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
      + '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="' + this.idImg + '" name="' + esc(nome) + '"/><pic:cNvPicPr/></pic:nvPicPr>'
      + '<pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
      + '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>'
      + "</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>";
    return paragrafo({ alinha: alinha || "center", depois: 120 }, desenho);
  };

  /* ---------- runs de um nó com conteúdo inline ---------- */
  Gerador.prototype.inline = function (no, f, saida) {
    var self = this;
    (no.filhos || []).forEach(function (c) {
      if (c.tag === "#text") { saida.runs += run(c.texto.replace(/\s+/g, " "), f); return; }
      if (c.tag === "br") { saida.runs += "<w:r>" + rPr(f) + "<w:br/></w:r>"; return; }
      if (c.tag === "img") { saida.imagens.push(c); return; }
      var g = f;
      if (c.tag === "b" || c.tag === "strong") g = herda(f, { negrito: true });
      else if (c.tag === "i" || c.tag === "em") g = herda(f, { italico: true });
      else if (c.tag === "small" || temClasse(c, "tp-qtd") || temClasse(c, "tp-cc-nota") || temClasse(c, "tp-opc-nota")) g = herda(f, { tamanho: Math.max(7, (f.tamanho || 11) - 2), cor: f.cor === "FFFFFF" ? "FFFFFF" : "6B7280" });
      else if (c.tag === "span" && temClasse(c, "tp-cr-v")) g = herda(f, { tamanho: 7.5 });
      if (c.tag === "span" && (temClasse(c, "tp-cr-b") || temClasse(c, "tp-gt-b") || temClasse(c, "tp-gt-marco") || temClasse(c, "tp-gt-trilho"))) {
        /* a barra do cronograma é desenho; no Word vira um traço proporcional */
        if (temClasse(c, "tp-gt-trilho")) {
          var barra = (c.filhos || []).filter(function (x) { return x.tag === "span"; })[0];
          var larg = barra ? num(estiloDe(barra, "width").replace("%", "")) : 0;
          var pos = barra ? num(estiloDe(barra, "left").replace("%", "")) : 0;
          var nTr = 24, ini = Math.round((pos / 100) * nTr), fim = Math.max(ini + 1, Math.round(((pos + (temClasse(barra || {}, "tp-gt-marco") ? 2 : larg)) / 100) * nTr));
          var tr = ""; for (var q = 0; q < nTr; q++) tr += (q >= ini && q < fim) ? "█" : "░";
          saida.runs += run(tr, herda(f, { cor: self.cores.destaque, tamanho: 7, fonte: "Consolas" }));
          return;
        }
        var w2 = num(estiloDe(c, "width").replace("%", ""));
        var nB = Math.max(1, Math.round((w2 / 100) * 8)), bb = ""; for (var r = 0; r < nB; r++) bb += "█";
        saida.runs += run(bb, herda(f, { cor: self.cores.destaque, tamanho: 7 }));
        return;
      }
      if (c.tag === "a") { self.inline(c, g, saida); return; }
      self.inline(c, g, saida);
    });
  };

  var BLOCOS = { div: 1, section: 1, article: 1, header: 1, footer: 1, main: 1, p: 1, h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1, ul: 1, ol: 1, li: 1, table: 1, figure: 1, figcaption: 1, blockquote: 1, pre: 1, hr: 1, nav: 1 };
  function temBlocoDentro(no) { return (no.filhos || []).some(function (c) { return c.tag !== "#text" && (BLOCOS[c.tag] || (c.filhos && c.filhos.length && temBlocoDentro(c))); }); }

  /* ---------- o nó vira parágrafos (recursivo) ---------- */
  Gerador.prototype.bloco = function (no, ctx) {
    var self = this;
    if (!no) return;
    if (no.tag === "#text") { var t = no.texto.replace(/\s+/g, " ").trim(); if (t) this.corpo.push(paragrafo({ alinha: ctx.alTxt, depois: 120 }, run(t, ctx.f))); return; }
    var tag = no.tag;
    /* o que não vai para o Word */
    if (temClasse(no, "tp-wm") || temClasse(no, "wm") || temClasse(no, "tp-orn") || temClasse(no, "tp-sombra") || temClasse(no, "no-print") || temClasse(no, "prop-toolbar")) return;
    if (tag === "img") { this.corpo.push(this.imagemBloco(no, ctx)); return; }
    if (tag === "hr" || temClasse(no, "tp-rule")) { this.corpo.push(paragrafo({ bordaBaixo: { cor: ctx.corTitulo || this.cores.titulo, sz: 8 }, depois: 160, antes: 0 }, "")); return; }
    if (tag === "table") { this.tabela(no, ctx); return; }
    if (tag === "ul" || tag === "ol") { this.lista(no, ctx, tag === "ol"); return; }
    if (temClasse(no, "tp-cols") || temClasse(no, "cols") || temClasse(no, "tp-assin") || temClasse(no, "assinaturas")) { this.colunas(no, ctx); return; }
    if (temClasse(no, "tp-cc") || temClasse(no, "tp-full")) { this.capa(no, ctx); return; }

    var cab = /^h[1-6]$/.test(tag);
    if (cab || tag === "p" || tag === "figcaption" || tag === "li" || (!temBlocoDentro(no) && (no.filhos || []).length)) {
      var p = this.estiloParagrafo(no, ctx), f = this.estiloRun(no, ctx, cab);
      var saida = { runs: "", imagens: [] };
      this.inline(no, f, saida);
      saida.imagens.forEach(function (im) { self.corpo.push(self.imagemBloco(im, ctx)); });
      if (saida.runs) this.corpo.push(paragrafo(p, saida.runs));
      return;
    }
    /* contêiner: cada filho por sua vez; texto solto vira parágrafo */
    var ctx2 = this.contexto(no, ctx);
    (no.filhos || []).forEach(function (c) { self.bloco(c, ctx2); });
  };

  Gerador.prototype.contexto = function (no, ctx) {
    var c2 = herda(ctx, {});
    var at = estiloDe(no, "--tp-al-tit"), ax = estiloDe(no, "--tp-al-txt");
    if (at) c2.alTit = (at === "left" ? "left" : at === "right" ? "right" : at === "center" ? "center" : c2.alTit);
    if (ax) c2.alTxt = (ax === "justify" ? "both" : ax === "right" ? "right" : ax === "center" ? "center" : "left");
    if (temClasse(no, "tp-bloco") || temClasse(no, "bloco")) c2.bloco = true;
    if (temClasse(no, "tp-serv-card")) c2.cartao = true;
    if (temClasse(no, "tp-ci-row") || temClasse(no, "ci-row") || temClasse(no, "tp-cc-row")) c2.linhaInfo = true;
    return c2;
  };

  Gerador.prototype.estiloParagrafo = function (no, ctx) {
    var tag = no.tag, p = { alinha: ctx.alTxt, depois: 120 };
    var cl = classes(no);
    if (/^h[1-6]$/.test(tag)) { p.estilo = "Heading" + Math.min(3, +tag.charAt(1)); p.juntos = true; p.antes = tag === "h1" ? 0 : 200; p.depois = 120; p.alinha = ctx.alTit || (temClasse(no, "tp-h1c") || temClasse(no, "tp-vazado") || temClasse(no, "tp-cc-h1") ? "center" : undefined); }
    if (/ tp-total | tp-pag | tp-opc-tot | tp-opc-txt | tp-contatos | tp-fim-p /.test(cl)) p.alinha = "center";
    if (/ tp-total | tp-opc-tot /.test(cl)) { p.antes = 160; }
    if (/ tp-leg | nota | tp-cc-rod | tp-rodape | capa-rod | pg-rod /.test(cl)) { p.depois = 80; }
    if (/ tp-rodape | pg-rod | capa-rod /.test(cl)) { p.alinha = "center"; p.antes = 240; p.bordaCima = { cor: this.cores.destaque, sz: 4 }; }
    if (/ tp-cc-kicker | kicker /.test(cl)) { p.depois = 60; }
    if (/ tp-linha | linha-assin /.test(cl)) { p.bordaCima = { cor: ctx.corTexto || this.cores.texto, sz: 6 }; p.antes = 480; p.depois = 40; }
    if (temClasse(no, "tp-cc-row") || temClasse(no, "ci-row")) { p.bordaBaixo = { cor: "FFFFFF", sz: 2 }; p.depois = 60; }
    if (ctx.bloco && /^h[1-6]$/.test(tag)) { p.antes = 120; }
    if (ctx.bloco && tag === "p") { p.bordaEsq = { cor: this.cores.destaque, sz: 18 }; p.recuo = 0; p.depois = 200; }
    if (ctx.cartao) { p.bordaEsq = { cor: this.cores.destaque, sz: 18 }; p.depois = 60; }
    if (ctx.alTxt && tag === "p" && !p.alinha) p.alinha = ctx.alTxt;
    if (ctx.fundo) p.fundo = ctx.fundo;
    return p;
  };

  Gerador.prototype.estiloRun = function (no, ctx, cab) {
    var cl = classes(no), f = herda(ctx.f, {});
    if (cab) {
      f.negrito = true; f.fonte = this.fontes.titulo; f.cor = ctx.branco ? "FFFFFF" : this.cores.titulo;
      f.tamanho = no.tag === "h1" ? 26 : no.tag === "h2" ? 17 : 12.5;
      if (temClasse(no, "tp-h1c") || temClasse(no, "tp-vazado")) { f.tamanho = 22; f.caixaAlta = true; }
      if (temClasse(no, "tp-cc-h1") || temClasse(no, "tp-h1")) { f.tamanho = 26; }
      if (temClasse(no, "pg-tit")) { f.tamanho = 18; }
    }
    if (/ tp-cc-kicker | kicker /.test(cl)) { f.tamanho = 10; f.espaco = 60; f.caixaAlta = true; f.negrito = true; }
    if (/ tp-chamada /.test(cl)) { f.tamanho = 13; f.caixaAlta = true; f.fonte = this.fontes.titulo; }
    if (/ tp-cli | tp-num-capa /.test(cl)) { f.tamanho = 12; f.espaco = 40; f.caixaAlta = true; }
    if (/ tp-cc-obra | capa-obra /.test(cl)) { f.tamanho = 13; }
    if (/ tp-total | tp-opc-tot /.test(cl)) { f.tamanho = 14; f.cor = ctx.branco ? "FFFFFF" : this.cores.titulo; }
    if (/ tp-pag | tp-contatos /.test(cl)) { f.cor = ctx.branco ? "FFFFFF" : this.cores.titulo; }
    if (/ tp-leg | nota | tp-cc-rod | tp-rodape | capa-rod | pg-rod | tp-fig | tp-opc-nota /.test(cl)) { f.tamanho = 9.5; f.cor = ctx.branco ? "FFFFFF" : "4B5563"; }
    if (/ tp-marca /.test(cl)) { f.tamanho = 11; f.espaco = 40; f.caixaAlta = true; f.cor = this.cores.titulo; }
    if (/ tp-sobre-p | tp-fim-p /.test(cl)) { f.tamanho = 12.5; }
    if (/ tp-rot /.test(cl)) { f.negrito = true; }
    if (ctx.cartao && no.tag === "span") { f.tamanho = 10.5; }
    return f;
  };

  Gerador.prototype.imagemBloco = function (no, ctx) {
    var cl = classes(no);
    if (/ tp-logo | logo /.test(cl) || (no.attrs && /logo/i.test(no.attrs.alt || ""))) return this.imagem(no, Math.min(2600, this.largura), 1400, ctx.alTit === "center" ? "center" : "left");
    if (/ tp-bg | tp-gal | tp-contato-img /.test(cl)) return this.imagem(no, this.largura, Math.round(this.pg.h * 0.4), "center");
    return this.imagem(no, Math.round(this.largura * 0.8), Math.round(this.pg.h * 0.45), "center");
  };

  Gerador.prototype.lista = function (no, ctx, numerada) {
    var self = this;
    if (numerada) this.usaNumero = true; else this.usaBullet = true;
    (no.filhos || []).forEach(function (li) {
      if (li.tag !== "li") return;
      var saida = { runs: "", imagens: [] };
      self.inline(li, ctx.f, saida);
      self.corpo.push(paragrafo({ numId: numerada ? 2 : 1, alinha: ctx.alTxt, depois: 60 }, saida.runs));
    });
  };

  /* duas colunas (incluso / não incluso, responsabilidades, assinaturas):
     uma tabela sem bordas com uma célula por coluna */
  Gerador.prototype.colunas = function (no, ctx) {
    var self = this;
    var cols = (no.filhos || []).filter(function (c) { return c.tag !== "#text"; });
    if (!cols.length) return;
    var larg = Math.floor(this.largura / cols.length);
    var xml = '<w:tbl><w:tblPr><w:tblW w:w="' + this.largura + '" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="60" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>';
    cols.forEach(function () { xml += '<w:gridCol w:w="' + larg + '"/>'; });
    xml += "</w:tblGrid><w:tr>";
    var assinatura = temClasse(no, "tp-assin") || temClasse(no, "assinaturas");
    cols.forEach(function (c) {
      var g = new Gerador(self.op); g.cores = self.cores; g.fontes = self.fontes; g.media = self.media; g.rels = self.rels; g.idImg = self.idImg; g.avisos = self.avisos;
      var ctx2 = herda(ctx, {});
      if (assinatura) { ctx2.alTxt = "center"; }
      (c.filhos || []).forEach(function (f) { g.bloco(f, ctx2); });
      self.idImg = g.idImg; self.usaBullet = self.usaBullet || g.usaBullet; self.usaNumero = self.usaNumero || g.usaNumero;
      var celula = g.corpo.join("") || paragrafo({}, "");
      if (assinatura && !/<w:pBdr>/.test(celula)) celula = paragrafo({ bordaCima: { cor: self.cores.texto, sz: 6 }, antes: 480, alinha: "center" }, run(textoDe(c).replace(/\s+/g, " ").trim(), herda(ctx.f, { tamanho: 10.5 })));
      xml += '<w:tc><w:tcPr><w:tcW w:w="' + larg + '" w:type="dxa"/></w:tcPr>' + celula + "</w:tc>";
    });
    xml += "</w:tr></w:tbl>" + paragrafo({ depois: 120 }, "");
    this.corpo.push(xml);
  };

  /* a capa cheia (foto + texto por cima) e a capa clássica (cor da marca):
     a foto sai em faixa e o texto numa caixa na cor escura, em branco */
  Gerador.prototype.capa = function (no, ctx) {
    var self = this;
    var fundo = hex6(estiloDe(no, "background-color")) || this.cores.escuro;
    var imgs = [], textos = [];
    function colher(n) {
      (n.filhos || []).forEach(function (c) {
        if (c.tag === "#text") { if (c.texto.trim()) textos.push(c); return; }
        if (c.tag === "img" && temClasse(c, "tp-bg")) { imgs.push(c); return; }
        if (temClasse(c, "tp-sombra") || temClasse(c, "tp-orn") || temClasse(c, "tp-bg-cor") || temClasse(c, "tp-vazio")) return;
        textos.push(c);
      });
    }
    colher(no);
    imgs.forEach(function (im) { self.corpo.push(self.imagem(im, self.largura, Math.round(self.pg.h * 0.42), "center")); });
    var g = new Gerador(this.op); g.cores = this.cores; g.fontes = this.fontes; g.media = this.media; g.rels = this.rels; g.idImg = this.idImg; g.avisos = this.avisos;
    var ctx2 = herda(ctx, { branco: true, f: herda(ctx.f, { cor: "FFFFFF" }), fundo: fundo, alTit: ctx.alTit });
    textos.forEach(function (t) { g.bloco(t, ctx2); });
    this.idImg = g.idImg;
    var dentro = g.corpo.join("") || paragrafo({}, "");
    var xml = '<w:tbl><w:tblPr><w:tblW w:w="' + this.largura + '" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="500" w:type="dxa"/><w:left w:w="500" w:type="dxa"/><w:bottom w:w="500" w:type="dxa"/><w:right w:w="500" w:type="dxa"/></w:tblCellMar></w:tblPr>'
      + '<w:tblGrid><w:gridCol w:w="' + this.largura + '"/></w:tblGrid><w:tr><w:trPr><w:trHeight w:val="' + Math.round((this.pg.h - this.pg.mt - this.pg.mb) * (imgs.length ? 0.42 : 0.85)) + '" w:hRule="atLeast"/></w:trPr>'
      + '<w:tc><w:tcPr><w:tcW w:w="' + this.largura + '" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="' + fundo + '"/><w:vAlign w:val="center"/></w:tcPr>' + dentro + "</w:tc></w:tr></w:tbl>";
    this.corpo.push(xml + paragrafo({ depois: 0 }, ""));
  };

  /* ---------- tabela ---------- */
  Gerador.prototype.tabela = function (no, ctx) {
    var self = this;
    var linhas = [];
    function colher(n) {
      (n.filhos || []).forEach(function (c) {
        if (c.tag === "tr") linhas.push({ tr: c, pai: n.tag });
        else if (c.tag === "thead" || c.tag === "tbody" || c.tag === "tfoot") colher(c);
      });
    }
    colher(no);
    if (!linhas.length) return;
    var nCols = 0;
    linhas.forEach(function (l) { var k = 0; (l.tr.filhos || []).forEach(function (c) { if (c.tag === "td" || c.tag === "th") k += Math.max(1, num(c.attrs.colspan) || 1); }); if (k > nCols) nCols = k; });
    if (!nCols) return;
    /* largura das colunas: a numérica é estreita; a primeira leva o resto */
    var cab = linhas[0].tr, numerica = [], i;
    for (i = 0; i < nCols; i++) numerica.push(false);
    var k0 = 0;
    (cab.filhos || []).forEach(function (c) { if (c.tag !== "td" && c.tag !== "th") return; var sp = Math.max(1, num(c.attrs.colspan) || 1); if (temClasse(c, "tp-num") || temClasse(c, "r") || temClasse(c, "tp-cr-m") || temClasse(c, "tp-gt-c")) for (var q = 0; q < sp; q++) numerica[k0 + q] = true; k0 += sp; });
    var nNum = numerica.filter(Boolean).length, nTx = nCols - nNum;
    var largNum = Math.round(this.largura * (nNum >= 4 ? 0.1 : 0.2)), largTx = nTx ? Math.floor((this.largura - largNum * nNum) / nTx) : 0;
    var larguras = numerica.map(function (b) { return b ? largNum : largTx; });
    var corB = ctx.corTitulo || this.cores.titulo;
    var semBorda = temClasse(no, "tp-cols");
    var xml = '<w:tbl><w:tblPr><w:tblW w:w="' + this.largura + '" w:type="dxa"/><w:tblLayout w:type="fixed"/>'
      + (semBorda ? "" : '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="' + corB + '"/><w:left w:val="single" w:sz="4" w:color="' + corB + '"/><w:bottom w:val="single" w:sz="4" w:color="' + corB + '"/><w:right w:val="single" w:sz="4" w:color="' + corB + '"/><w:insideH w:val="single" w:sz="4" w:color="' + corB + '"/><w:insideV w:val="single" w:sz="4" w:color="' + corB + '"/></w:tblBorders>')
      + '<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>';
    larguras.forEach(function (w) { xml += '<w:gridCol w:w="' + w + '"/>'; });
    xml += "</w:tblGrid>";
    var tamanho = (temClasse(no, "tp-cr") || temClasse(no, "tp-gt") || temClasse(no, "tp-ana")) ? 9 : 10;
    linhas.forEach(function (l) {
      var grupo = temClasse(l.tr, "tp-grupo"), rodape = l.pai === "tfoot";
      xml += "<w:tr>" + (l.pai === "thead" ? "<w:trPr><w:tblHeader/></w:trPr>" : "");
      var col = 0;
      (l.tr.filhos || []).forEach(function (c) {
        if (c.tag !== "td" && c.tag !== "th") return;
        var sp = Math.max(1, num(c.attrs.colspan) || 1), w = 0;
        for (var q = 0; q < sp; q++) w += larguras[col + q] || 0;
        var th = c.tag === "th";
        var fill = th ? corB : (grupo ? "E5E7EB" : (rodape ? "EEF4FA" : ""));
        var f = herda(ctx.f, { tamanho: tamanho, negrito: th || grupo || rodape, cor: th ? "FFFFFF" : ctx.f.cor, caixaAlta: grupo });
        var alinha = (temClasse(c, "tp-num") || temClasse(c, "r") || numerica[col]) ? "right" : (temClasse(c, "tp-cr-c") || temClasse(c, "tp-gt-c") ? "center" : "left");
        var saida = { runs: "", imagens: [] };
        if (temBlocoDentro(c)) {
          var g = new Gerador(self.op); g.cores = self.cores; g.fontes = self.fontes; g.media = self.media; g.rels = self.rels; g.idImg = self.idImg; g.avisos = self.avisos;
          (c.filhos || []).forEach(function (fh) { g.bloco(fh, herda(ctx, { f: f, alTxt: alinha })); });
          self.idImg = g.idImg;
          saida.runs = g.corpo.join("");
        } else {
          self.inline(c, f, saida);
          saida.runs = paragrafo({ alinha: alinha, depois: 0 }, saida.runs);
        }
        xml += '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' + (sp > 1 ? '<w:gridSpan w:val="' + sp + '"/>' : "")
          + (fill ? '<w:shd w:val="clear" w:color="auto" w:fill="' + fill + '"/>' : "") + "<w:vAlign w:val=\"center\"/></w:tcPr>" + saida.runs + "</w:tc>";
        col += sp;
      });
      while (col < nCols) { xml += '<w:tc><w:tcPr><w:tcW w:w="' + (larguras[col] || 0) + '" w:type="dxa"/></w:tcPr>' + paragrafo({ depois: 0 }, "") + "</w:tc>"; col++; }
      xml += "</w:tr>";
    });
    xml += "</w:tbl>" + paragrafo({ depois: 120 }, "");
    this.corpo.push(xml);
  };

  /* ---------- as seções (uma página cada) ---------- */
  Gerador.prototype.documento = function (raiz) {
    var self = this;
    var secoes = [];
    function achar(n) {
      (n.filhos || []).forEach(function (c) {
        if (c.tag === "section" || temClasse(c, "pg") || temClasse(c, "tp-pg")) secoes.push(c);
        else if (c.tag !== "#text" && c.filhos && c.filhos.length) achar(c);
      });
    }
    achar(raiz);
    var ctx = { f: { fonte: this.fontes.texto, tamanho: 11, cor: this.cores.texto }, alTxt: undefined, alTit: undefined, corTitulo: this.cores.titulo, corTexto: this.cores.texto };
    if (!secoes.length) { (raiz.filhos || []).forEach(function (c) { self.bloco(c, ctx); }); return; }
    secoes.forEach(function (s, i) {
      if (i) self.corpo.push(QUEBRA);
      var c2 = self.contexto(s, ctx);
      var cheia = temClasse(s, "tp-cheia") || temClasse(s, "capa");
      if (cheia && !(s.filhos || []).some(function (c) { return temClasse(c, "tp-full") || temClasse(c, "tp-cc"); })) {
        /* a capa clássica do js/proposta.js: a seção inteira é a caixa */
        self.capa(s, c2);
        return;
      }
      (s.filhos || []).forEach(function (c) { self.bloco(c, c2); });
    });
  };

  /* =====================================================================
   * 4. O PACOTE .DOCX
   * ===================================================================== */
  /* ⚠ UM NAMESPACE POR LINHA. São identificadores do padrão OOXML, não
     endereços buscados — mas tools/test-privacidade.js varre o código atrás de
     ".open" seguido de um host na mesma linha, e "schemas.OPENxmlformats" duas
     vezes numa linha parece chamada de rede para ele. */
  var NS_W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
    + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
    + 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
    + 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
    + 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  var XMLH = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  function stylesXml(g) {
    function cab(id, nome, tam, antes) {
      return '<w:style w:type="paragraph" w:styleId="' + id + '"><w:name w:val="' + nome + '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>'
        + '<w:pPr><w:keepNext/><w:spacing w:before="' + antes + '" w:after="120"/></w:pPr>'
        + '<w:rPr><w:rFonts w:ascii="' + esc(g.fontes.titulo) + '" w:hAnsi="' + esc(g.fontes.titulo) + '" w:cs="' + esc(g.fontes.titulo) + '"/><w:b/><w:bCs/><w:color w:val="' + g.cores.titulo + '"/><w:sz w:val="' + (tam * 2) + '"/><w:szCs w:val="' + (tam * 2) + '"/></w:rPr></w:style>';
    }
    return XMLH + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
      + '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="' + esc(g.fontes.texto) + '" w:hAnsi="' + esc(g.fontes.texto) + '" w:cs="' + esc(g.fontes.texto) + '" w:eastAsia="' + esc(g.fontes.texto) + '"/><w:color w:val="' + g.cores.texto + '"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault>'
      + '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
      + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
      + cab("Heading1", "heading 1", 26, 0) + cab("Heading2", "heading 2", 17, 200) + cab("Heading3", "heading 3", 12.5, 160)
      + '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>'
      + "</w:styles>";
  }
  function numberingXml() {
    return XMLH + '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
      + '<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#8226;"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="567" w:hanging="283"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr></w:lvl></w:abstractNum>'
      + '<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="567" w:hanging="283"/></w:pPr></w:lvl></w:abstractNum>'
      + '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>';
  }
  function contentTypes(g) {
    var tipos = {};
    g.media.forEach(function (m) { tipos[m.tipo] = 1; });
    var defaults = '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>';
    if (tipos.png) defaults += '<Default Extension="png" ContentType="image/png"/>';
    if (tipos.jpeg) defaults += '<Default Extension="jpg" ContentType="image/jpeg"/>';
    if (tipos.gif) defaults += '<Default Extension="gif" ContentType="image/gif"/>';
    return XMLH + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' + defaults
      + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
      + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
      + '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
      + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
      + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
      + "</Types>";
  }
  function relsRaiz() {
    return XMLH + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
      + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
      + "</Relationships>";
  }
  function relsDoc(g) {
    var s = XMLH + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>';
    g.rels.forEach(function (r) { s += '<Relationship Id="' + r.id + '" Type="' + r.tipo + '" Target="' + esc(r.alvo) + '"/>'; });
    return s + "</Relationships>";
  }
  function coreXml(op) {
    /* W3CDTF sem milissegundos: "2026-10-13T15:00:00Z" — o Word recusa o
       arquivo inteiro por uma data fora do formato nas propriedades */
    var agora = (txt(op.data) || "2026-01-01T00:00:00Z").replace(/\.\d+Z$/, "Z");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(agora)) agora = "2026-01-01T00:00:00Z";
    return XMLH + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
      + "<dc:title>" + esc(txt(op.titulo) || "Proposta") + "</dc:title><dc:creator>" + esc(txt(op.criador) || "") + "</dc:creator>"
      + '<dcterms:created xsi:type="dcterms:W3CDTF">' + esc(agora) + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + esc(agora) + "</dcterms:modified>"
      + "</cp:coreProperties>";
  }
  function appXml(op) {
    return XMLH + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" '
      + 'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>' + esc(txt(op.aplicativo) || "OrçaPRO") + "</Application></Properties>";
  }

  /* HTML da proposta → { bytes (Uint8Array do .docx), avisos, partes } */
  Docx.deHtml = function (html, op) {
    op = op || {};
    var g = new Gerador(op);
    g.documento(Docx.arvore(html));
    var corpo = g.corpo.join("");
    if (!corpo) corpo = paragrafo({}, run("(documento vazio)", g.fontes.texto ? { fonte: g.fontes.texto } : {}));
    var sectPr = '<w:sectPr><w:pgSz w:w="' + g.pg.w + '" w:h="' + g.pg.h + '"/><w:pgMar w:top="' + g.pg.mt + '" w:right="' + g.pg.mr + '" w:bottom="' + g.pg.mb + '" w:left="' + g.pg.ml + '" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>';
    var documento = XMLH + "<w:document " + NS_W + "><w:body>" + corpo + sectPr + "</w:body></w:document>";
    var partes = [
      { nome: "[Content_Types].xml", dados: contentTypes(g) },
      { nome: "_rels/.rels", dados: relsRaiz() },
      { nome: "word/document.xml", dados: documento },
      { nome: "word/styles.xml", dados: stylesXml(g) },
      { nome: "word/numbering.xml", dados: numberingXml() },
      { nome: "word/_rels/document.xml.rels", dados: relsDoc(g) },
      { nome: "docProps/core.xml", dados: coreXml(op) },
      { nome: "docProps/app.xml", dados: appXml(op) }
    ];
    g.media.forEach(function (m) { partes.push({ nome: "word/media/" + m.nome, dados: m.dados }); });
    return { bytes: Docx.zip(partes), avisos: g.avisos, partes: partes.map(function (p) { return p.nome; }), imagens: g.media.length };
  };

  /* "Proposta — 0007/26" → "Proposta - 0007-26.docx" (sem caractere que o
     sistema de arquivos recusa) */
  Docx.nomeArquivo = function (titulo) {
    var s = txt(titulo).replace(/\s+/g, " ").replace(/[\\\/:*?"<>|]+/g, "-").replace(/\s*[—–]\s*/g, " - ").replace(/^-+|-+$/g, "").trim();
    if (!s) s = "Proposta";
    if (s.length > 120) s = s.slice(0, 120);
    return s + ".docx";
  };

  global.Docx = Docx;
  if (typeof module !== "undefined" && module.exports) module.exports = Docx;
})(typeof window !== "undefined" ? window : this);
