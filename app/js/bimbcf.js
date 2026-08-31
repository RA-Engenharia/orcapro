/* =====================================================================
 * bimbcf.js — BCF 2.1: LEVAR O APONTAMENTO DE VOLTA A QUEM PROJETA (D11)
 *
 * O QUE ESTE ARQUIVO RESOLVE
 * O modelo do cliente vem de um projetista que usa Revit, Navisworks ou
 * Solibri. Sem BCF, tudo que o coordenador acha no OrçaPRO morre aqui: vira
 * print no WhatsApp, e o projetista tem de reencontrar a peça na mão. BCF é o
 * formato que a indústria usa para esse vaivém, e o casamento dele é por
 * `IfcGuid` — o que só funciona por causa do B0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ⚠ VALIDAÇÃO DE INTEROPERABILIDADE: PENDENTE, E DECLARADA
 *
 * A especificação é explícita: "não afirmar conformidade com a 2.1 sem ter
 * aberto o arquivo gerado em outra ferramenta. Registrar como pendência de
 * validação até que isso seja feito."
 *
 * Não há Revit nem Solibri aqui, e não existe no repositório um `.bcfzip` de
 * referência gerado por terceiro (a seção 11.2 o lista como fixture
 * NECESSÁRIA, e ela não existe). Então o que está provado é o que dá para
 * provar: o ZIP é lido de volta byte a byte, o XML é lido de volta campo a
 * campo, e o ponto de vista sobrevive à ida e à volta. O que NÃO está provado
 * é que o Revit abre. Até alguém abrir, isto é experimental — e a interface
 * tem de dizer isso.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ⚠ SEM BIBLIOTECA DE ZIP, E POR QUÊ ISSO É SEGURO
 *
 * O produto não vendoriza JSZip nem pako. Escrever é o caso fácil: entradas
 * STORED (sem compressão) formam um ZIP perfeitamente válido, que qualquer
 * ferramenta abre — troca-se tamanho por não depender de nada. Ler o arquivo
 * de terceiro precisa de inflate, e por isso ele é INJETADO: o navegador
 * entrega `DecompressionStream('deflate-raw')` de graça e o gate usa o `zlib`
 * do Node. Assim o motor continua puro e testável fora do navegador.
 * ===================================================================== */
(function (global) {
  "use strict";

  var VERSAO_BCF = "2.1";

  function txt(s) { return String(s == null ? "" : s); }
  function num(x) { var n = +x; return isFinite(n) ? n : 0; }

  /* ---------------------------------------------------------------
   * bytes e texto (UTF-8), sem depender de TextEncoder
   * ------------------------------------------------------------- */
  function paraBytes(s) {
    s = txt(s);
    var out = [], i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 63)); }
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
        var c2 = s.charCodeAt(i + 1);
        var u = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00); i++;
        out.push(0xf0 | (u >> 18), 0x80 | ((u >> 12) & 63), 0x80 | ((u >> 6) & 63), 0x80 | (u & 63));
      } else { out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
    }
    return new Uint8Array(out);
  }
  function deBytes(b) {
    var s = "", i = 0, c;
    while (i < b.length) {
      c = b[i++];
      if (c < 0x80) s += String.fromCharCode(c);
      else if (c < 0xe0) s += String.fromCharCode(((c & 31) << 6) | (b[i++] & 63));
      else if (c < 0xf0) s += String.fromCharCode(((c & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63));
      else {
        var u = ((c & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
        u -= 0x10000;
        s += String.fromCharCode(0xd800 + (u >> 10), 0xdc00 + (u & 1023));
      }
    }
    return s;
  }

  /* CRC-32 (tabela gerada uma vez) — o ZIP exige, e um CRC errado faz a
     ferramenta do outro lado recusar o arquivo inteiro sem dizer por quê */
  var _crcTab = null;
  function crcTab() {
    if (_crcTab) return _crcTab;
    _crcTab = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      _crcTab[n] = c >>> 0;
    }
    return _crcTab;
  }
  function crc32(b) {
    var t = crcTab(), c = 0xffffffff;
    for (var i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /* ---------------------------------------------------------------
   * ZIP — escrita (STORED) e leitura (STORED + DEFLATE injetado)
   * ------------------------------------------------------------- */
  function u16(a, p, v) { a[p] = v & 255; a[p + 1] = (v >> 8) & 255; }
  function u32(a, p, v) { a[p] = v & 255; a[p + 1] = (v >>> 8) & 255; a[p + 2] = (v >>> 16) & 255; a[p + 3] = (v >>> 24) & 255; }
  function r16(a, p) { return a[p] | (a[p + 1] << 8); }
  function r32(a, p) { return (a[p] | (a[p + 1] << 8) | (a[p + 2] << 16) | (a[p + 3] << 24)) >>> 0; }

  function zipEscrever(arquivos) {
    var itens = [], total = 0, cdTam = 0;
    Object.keys(arquivos || {}).sort().forEach(function (nome) {
      var v = arquivos[nome];
      var dados = (v instanceof Uint8Array) ? v : paraBytes(v);
      var nb = paraBytes(nome);
      itens.push({ nome: nb, dados: dados, crc: crc32(dados), off: 0 });
      total += 30 + nb.length + dados.length;
      cdTam += 46 + nb.length;
    });
    var out = new Uint8Array(total + cdTam + 22), p = 0;
    itens.forEach(function (it) {
      it.off = p;
      u32(out, p, 0x04034b50); u16(out, p + 4, 20);
      /* 0x0800: o nome vai em UTF-8. Sem isto, "Térreo.png" chega torto do
         outro lado — e nome de arquivo torto é o tipo de coisa que faz a
         ferramenta do projetista recusar o pacote. */
      u16(out, p + 6, 0x0800); u16(out, p + 8, 0);
      u16(out, p + 10, 0); u16(out, p + 12, 0);
      u32(out, p + 14, it.crc); u32(out, p + 18, it.dados.length); u32(out, p + 22, it.dados.length);
      u16(out, p + 26, it.nome.length); u16(out, p + 28, 0);
      p += 30;
      out.set(it.nome, p); p += it.nome.length;
      out.set(it.dados, p); p += it.dados.length;
    });
    var cdIni = p;
    itens.forEach(function (it) {
      u32(out, p, 0x02014b50); u16(out, p + 4, 20); u16(out, p + 6, 20);
      u16(out, p + 8, 0x0800); u16(out, p + 10, 0);
      u16(out, p + 12, 0); u16(out, p + 14, 0);
      u32(out, p + 16, it.crc); u32(out, p + 20, it.dados.length); u32(out, p + 24, it.dados.length);
      u16(out, p + 28, it.nome.length); u16(out, p + 30, 0); u16(out, p + 32, 0);
      u16(out, p + 34, 0); u16(out, p + 36, 0); u32(out, p + 38, 0);
      u32(out, p + 42, it.off);
      p += 46;
      out.set(it.nome, p); p += it.nome.length;
    });
    u32(out, p, 0x06054b50); u16(out, p + 4, 0); u16(out, p + 6, 0);
    u16(out, p + 8, itens.length); u16(out, p + 10, itens.length);
    u32(out, p + 12, p - cdIni); u32(out, p + 16, cdIni); u16(out, p + 20, 0);
    return out;
  }

  /* `inflar(bytes)` pode devolver Uint8Array ou Promise dela. Sem ele, entrada
     comprimida vira erro DECLARADO — nunca conteúdo pela metade. */
  function zipLer(bytes, opts) {
    opts = opts || {};
    var b = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes || []);
    var fim = -1;
    for (var i = b.length - 22; i >= 0 && i > b.length - 66000; i--) {
      if (r32(b, i) === 0x06054b50) { fim = i; break; }
    }
    if (fim < 0) return Promise.reject(new Error("não é um arquivo .bcfzip válido (falta o índice do ZIP)"));
    var n = r16(b, fim + 10), cdIni = r32(b, fim + 16);
    var entradas = [], p = cdIni;
    for (var k = 0; k < n; k++) {
      if (r32(b, p) !== 0x02014b50) return Promise.reject(new Error("índice do ZIP corrompido"));
      var metodo = r16(b, p + 10), csize = r32(b, p + 20), usize = r32(b, p + 24);
      var nlen = r16(b, p + 28), elen = r16(b, p + 30), clen = r16(b, p + 32), off = r32(b, p + 42);
      var nome = deBytes(b.subarray(p + 46, p + 46 + nlen));
      entradas.push({ nome: nome, metodo: metodo, csize: csize, usize: usize, off: off });
      p += 46 + nlen + elen + clen;
    }
    var saida = {}, seq = Promise.resolve();
    entradas.forEach(function (e) {
      seq = seq.then(function () {
        if (r32(b, e.off) !== 0x04034b50) throw new Error("entrada corrompida: " + e.nome);
        var nl = r16(b, e.off + 26), el = r16(b, e.off + 28);
        var ini = e.off + 30 + nl + el;
        var bruto = b.subarray(ini, ini + e.csize);
        if (e.metodo === 0) { saida[e.nome] = bruto.slice(0); return; }
        if (e.metodo !== 8) throw new Error("compressão não suportada no arquivo (" + e.nome + ")");
        if (typeof opts.inflar !== "function") throw new Error("o arquivo está comprimido e não recebi como descomprimir");
        return Promise.resolve(opts.inflar(bruto.slice(0))).then(function (r) {
          saida[e.nome] = (r instanceof Uint8Array) ? r : new Uint8Array(r);
        });
      });
    });
    return seq.then(function () { return saida; });
  }

  /* ---------------------------------------------------------------
   * XML mínimo — só o que o BCF usa
   *
   * ⚠ NÃO É UM PARSER DE XML DE PROPÓSITO GERAL, e é bom que não seja: um
   * parser incompleto que ACEITA tudo devolve dado errado calado. Este recusa
   * o que não entende, e o que ele entende cobre a 2.1: elemento, atributo,
   * texto, vazio, comentário, declaração e CDATA.
   * ------------------------------------------------------------- */
  function esc(s) {
    return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }
  function desesc(s) {
    return txt(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(+d); })
      .replace(/&amp;/g, "&");
  }
  function tag(nome, attrs, dentro) {
    var a = "";
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] == null || attrs[k] === "") return;
      a += " " + k + '="' + esc(attrs[k]) + '"';
    });
    if (dentro == null || dentro === "") return "<" + nome + a + "/>";
    return "<" + nome + a + ">" + dentro + "</" + nome + ">";
  }

  function xmlLer(s) {
    s = txt(s);
    var i = 0, raiz = null, pilha = [];
    function no(nome) { return { nome: nome, attrs: {}, filhos: [], texto: "" }; }
    while (i < s.length) {
      var lt = s.indexOf("<", i);
      if (lt < 0) break;
      if (lt > i && pilha.length) pilha[pilha.length - 1].texto += desesc(s.slice(i, lt));
      if (s.substr(lt, 4) === "<!--") { i = s.indexOf("-->", lt); if (i < 0) break; i += 3; continue; }
      if (s.substr(lt, 9) === "<![CDATA[") {
        var f = s.indexOf("]]>", lt); if (f < 0) break;
        if (pilha.length) pilha[pilha.length - 1].texto += s.slice(lt + 9, f);
        i = f + 3; continue;
      }
      if (s.charAt(lt + 1) === "?" || s.charAt(lt + 1) === "!") { i = s.indexOf(">", lt); if (i < 0) break; i++; continue; }
      var gt = s.indexOf(">", lt); if (gt < 0) break;
      var corpo = s.slice(lt + 1, gt).trim();
      if (corpo.charAt(0) === "/") {
        pilha.pop(); i = gt + 1; continue;
      }
      var vazio = corpo.charAt(corpo.length - 1) === "/";
      if (vazio) corpo = corpo.slice(0, -1).trim();
      var m = /^([\w:.\-]+)/.exec(corpo);
      if (!m) return null;                       /* não entendi: recusa */
      var el = no(m[1]);
      var re = /([\w:.\-]+)\s*=\s*"([^"]*)"|([\w:.\-]+)\s*=\s*'([^']*)'/g, ma;
      while ((ma = re.exec(corpo))) el.attrs[ma[1] || ma[3]] = desesc(ma[2] != null ? ma[2] : ma[4]);
      if (pilha.length) pilha[pilha.length - 1].filhos.push(el); else if (!raiz) raiz = el;
      if (!vazio) pilha.push(el);
      i = gt + 1;
    }
    return raiz;
  }
  /* busca em profundidade pelo nome, ignorando prefixo de namespace */
  function acha(no, nome) {
    if (!no) return null;
    for (var i = 0; i < no.filhos.length; i++) {
      var f = no.filhos[i], n = f.nome.replace(/^.*:/, "");
      if (n === nome) return f;
      var d = acha(f, nome);
      if (d) return d;
    }
    return null;
  }
  function todos(no, nome) {
    var out = [];
    (function anda(x) {
      (x.filhos || []).forEach(function (f) {
        if (f.nome.replace(/^.*:/, "") === nome) out.push(f);
        anda(f);
      });
    })(no || { filhos: [] });
    return out;
  }
  function txtDe(no, nome) { var f = acha(no, nome); return f ? txt(f.texto).trim() : ""; }
  function xyz(no) {
    if (!no) return [0, 0, 0];
    return [num(txtDe(no, "X")), num(txtDe(no, "Y")), num(txtDe(no, "Z"))];
  }

  /* ---------------------------------------------------------------
   * GUID no formato que o BCF espera para Topic/Comment/Viewpoint
   *
   * ⚠ Determinístico a partir de uma semente: exportar duas vezes o mesmo
   * tópico tem de dar o mesmo Guid, senão a ferramenta do outro lado trata a
   * segunda exportação como um problema NOVO e o projetista vê tudo duplicado.
   * ------------------------------------------------------------- */
  function guidDe(semente) {
    var s = txt(semente), h1 = 0x811c9dc5, h2 = 0x01000193, h3 = 0x9e3779b9, h4 = 0x85ebca6b;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 = ((h1 ^ c) * 16777619) >>> 0;
      h2 = ((h2 + c) * 2654435761) >>> 0;
      h3 = ((h3 ^ (c + i)) * 2246822519) >>> 0;
      h4 = ((h4 + (c * (i + 1))) * 3266489917) >>> 0;
    }
    function hx(v, n) { var t = (v >>> 0).toString(16); while (t.length < 8) t = "0" + t; return t.slice(0, n); }
    return hx(h1, 8) + "-" + hx(h2, 4) + "-4" + hx(h2, 3).slice(0, 3) + "-a" + hx(h3, 3) + "-" + hx(h3, 4) + hx(h4, 8);
  }

  /* ---------------------------------------------------------------
   * o IfcGuid dentro da chave do B0 (`modeloId::globalId`)
   * ------------------------------------------------------------- */
  function guidDaChave(chave) {
    var s = txt(chave), i = s.indexOf("::");
    return i < 0 ? s : s.slice(i + 2);
  }

  /* ---------------------------------------------------------------
   * EXPORTAR
   * ------------------------------------------------------------- */
  function bcfvDe(v) {
    var cam = v.camera;
    var pos = global.BimVista ? global.BimVista.cenaParaIfc(cam.pos) : cam.pos;
    var dir = global.BimVista ? global.BimVista.cenaParaIfc(global.BimVista.direcaoDe(cam)) : [0, 0, -1];
    var up = global.BimVista ? global.BimVista.cenaParaIfc(cam.up) : [0, 0, 1];
    function pt(nome, a) { return tag(nome, null, tag("X", null, a[0]) + tag("Y", null, a[1]) + tag("Z", null, a[2])); }

    var sel = (v.visibilidade.isolados || []).map(function (k) { return tag("Component", { IfcGuid: guidDaChave(k) }, null); }).join("");
    var exc = (v.visibilidade.ocultos || []).map(function (k) { return tag("Component", { IfcGuid: guidDaChave(k) }, null); }).join("");
    var comps = tag("Components", null,
      (sel ? tag("Selection", null, sel) : "") +
      tag("Visibility", { DefaultVisibility: "true" }, exc ? tag("Exceptions", null, exc) : "") +
      ((v.aparencias || []).length ? tag("Coloring", null, (v.aparencias || []).map(function (a) {
        function h(x) { var t = Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16); return t.length < 2 ? "0" + t : t; }
        return tag("Color", { Color: h(a.cor[0]) + h(a.cor[1]) + h(a.cor[2]) }, tag("Component", { IfcGuid: guidDaChave(a.chave) }, null));
      }).join("")) : ""));

    var camXml = cam.orto
      ? tag("OrthogonalCamera", null, pt("CameraViewPoint", pos) + pt("CameraDirection", dir) + pt("CameraUpVector", up) + tag("ViewToWorldScale", null, num(cam.fov) || 10))
      : tag("PerspectiveCamera", null, pt("CameraViewPoint", pos) + pt("CameraDirection", dir) + pt("CameraUpVector", up) + tag("FieldOfView", null, num(cam.fov) || 60));

    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      tag("VisualizationInfo", { Guid: guidDe("vp:" + v.id + ":" + v.nome) }, comps + camXml);
  }

  function markupDe(v) {
    var g = guidDe("topico:" + v.id + ":" + v.nome);
    var coms = (v.comentarios || []).map(function (c, i) {
      return tag("Comment", { Guid: guidDe("com:" + g + ":" + i) },
        tag("Date", null, c.em || v.criadoEm) + tag("Author", null, c.autor || v.autor) +
        tag("Comment", null, c.texto) +
        tag("Viewpoint", { Guid: guidDe("vp:" + v.id + ":" + v.nome) }, null));
    }).join("");
    var topico = tag("Topic", { Guid: g, TopicType: "Issue", TopicStatus: (v.comentarios && v.comentarios[0] && v.comentarios[0].status === "resolvido") ? "Closed" : "Open" },
      tag("Title", null, v.nome) +
      tag("CreationDate", null, v.criadoEm) +
      tag("CreationAuthor", null, v.autor));
    var vps = tag("Viewpoints", { Guid: guidDe("vp:" + v.id + ":" + v.nome) },
      tag("Viewpoint", null, "viewpoint.bcfv") + (v.miniatura ? tag("Snapshot", null, "snapshot.png") : ""));
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + tag("Markup", null, topico + coms + vps);
  }

  /* `vistas` = registros do BimVista. `snapshots` = { idDaVista: Uint8Array } */
  function exportar(vistas, snapshots) {
    var arq = {};
    arq["bcf.version"] = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      tag("Version", { VersionId: VERSAO_BCF }, tag("DetailedVersion", null, VERSAO_BCF));
    var n = 0;
    (vistas || []).forEach(function (v) {
      if (!v || !v.nome) return;
      var g = guidDe("topico:" + v.id + ":" + v.nome);
      arq[g + "/markup.bcf"] = markupDe(v);
      arq[g + "/viewpoint.bcfv"] = bcfvDe(v);
      var snap = snapshots && snapshots[v.id];
      if (snap) arq[g + "/snapshot.png"] = snap;
      n++;
    });
    if (!n) return { ok: false, erro: "não há ponto de vista para exportar" };
    return { ok: true, arquivos: arq, bytes: zipEscrever(arq), topicos: n };
  }

  /* ---------------------------------------------------------------
   * IMPORTAR
   *
   * ⚠ TÓPICO SEM `viewpoint.bcfv` ENTRA MESMO ASSIM. Ferramenta de terceiro
   * exporta tópico sem vista o tempo todo (um comentário solto). Descartar
   * faria o coordenador receber cinco dos oito problemas e não saber dos três.
   *
   * ⚠ E COMPONENTE CUJO GUID NÃO ESTÁ NO MODELO ABERTO ENTRA COMO "NÃO
   * LOCALIZADO", não some: pode ser o modelo errado aberto, pode ser uma peça
   * apagada — e as duas coisas o usuário precisa saber.
   * ------------------------------------------------------------- */
  function importar(arquivos, opts) {
    opts = opts || {};
    var byModel = {};
    (opts.elementos || []).forEach(function (e) { if (e && e.chave) byModel[guidDaChave(e.chave)] = e.chave; });

    var nomes = Object.keys(arquivos || {});
    var temVersao = nomes.some(function (n) { return /(^|\/)bcf\.version$/i.test(n); });
    var topicos = [], erros = [];

    var porPasta = {};
    nomes.forEach(function (n) {
      var m = /^([^/]+)\/(.+)$/.exec(n);
      if (!m) return;
      (porPasta[m[1]] = porPasta[m[1]] || {})[m[2].toLowerCase()] = arquivos[n];
    });

    Object.keys(porPasta).sort().forEach(function (pasta) {
      var f = porPasta[pasta];
      var mk = f["markup.bcf"];
      if (!mk) return;                       /* pasta sem markup não é tópico */
      var raiz = xmlLer(typeof mk === "string" ? mk : deBytes(mk));
      if (!raiz) { erros.push("não consegui ler o markup do tópico " + pasta); return; }
      var t = acha(raiz, "Topic");
      var nome = txtDe(t, "Title") || pasta;
      var coms = todos(raiz, "Comment").filter(function (c) { return c.filhos.length || c.texto; })
        .map(function (c) {
          /* o elemento <Comment> aparece aninhado dentro de si mesmo no BCF:
             o de fora é o registro, o de dentro é o texto */
          var interno = acha(c, "Comment");
          return {
            autor: txtDe(c, "Author"), em: txtDe(c, "Date"),
            texto: interno ? txt(interno.texto).trim() : txt(c.texto).trim(),
            status: /closed|resolv/i.test(txt(t && t.attrs && t.attrs.TopicStatus)) ? "resolvido" : "aberto"
          };
        }).filter(function (c) { return !!c.texto; });

      var vp = f["viewpoint.bcfv"];
      var cam = null, isolados = [], ocultos = [], naoLocalizados = [];
      if (vp) {
        var rv = xmlLer(typeof vp === "string" ? vp : deBytes(vp));
        if (rv) {
          var per = acha(rv, "PerspectiveCamera"), ort = acha(rv, "OrthogonalCamera");
          var c3 = per || ort;
          if (c3) {
            var pos = xyz(acha(c3, "CameraViewPoint"));
            var dir = xyz(acha(c3, "CameraDirection"));
            var up = xyz(acha(c3, "CameraUpVector"));
            var V = global.BimVista;
            cam = V ? V.camera({
              pos: V.ifcParaCena(pos), dir: V.ifcParaCena(dir), up: V.ifcParaCena(up),
              fov: per ? num(txtDe(per, "FieldOfView")) : num(txtDe(ort, "ViewToWorldScale")),
              orto: !!ort
            }) : null;
          }
          var selNo = acha(rv, "Selection"), excNo = acha(rv, "Exceptions");
          function colhe(no, destino) {
            todos(no || { filhos: [] }, "Component").forEach(function (comp) {
              var g = txt(comp.attrs.IfcGuid || comp.attrs.ifcGuid);
              if (!g) return;
              if (byModel[g]) destino.push(byModel[g]);
              else naoLocalizados.push(g);
            });
          }
          colhe(selNo, isolados);
          colhe(excNo, ocultos);
        } else erros.push("não consegui ler o ponto de vista do tópico " + nome);
      }

      topicos.push({
        pasta: pasta, nome: nome,
        autor: txtDe(t, "CreationAuthor"), criadoEm: txtDe(t, "CreationDate"),
        camera: cam, semVista: !vp,
        isolados: isolados, ocultos: ocultos, naoLocalizados: naoLocalizados,
        comentarios: coms,
        snapshot: f["snapshot.png"] || null
      });
    });

    return { ok: topicos.length > 0, temVersao: temVersao, topicos: topicos, erros: erros };
  }

  var BimBcf = {
    VERSAO: VERSAO_BCF,
    /* ⚠ enquanto ninguém abrir o arquivo gerado noutra ferramenta, isto é
       experimental — e a interface tem de dizer isso ao usuário */
    VALIDADO_EM_OUTRA_FERRAMENTA: false,
    paraBytes: paraBytes, deBytes: deBytes, crc32: crc32,
    zipEscrever: zipEscrever, zipLer: zipLer,
    xmlLer: xmlLer, esc: esc, tag: tag,
    guidDe: guidDe, guidDaChave: guidDaChave,
    exportar: exportar, importar: importar
  };

  global.BimBcf = BimBcf;
  if (typeof module !== "undefined" && module.exports) module.exports = BimBcf;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
