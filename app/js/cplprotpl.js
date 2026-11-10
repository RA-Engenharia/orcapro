/* =====================================================================
 * cplprotpl.js — CPLPRO: MODELOS DO PRÓPRIO ÓRGÃO (.docx com campos {{campo}}).
 *
 * POR QUE EXISTE: pelo Decreto Municipal SP 62.100/2022, art. 16, quem define as minutas de edital e a
 * padronização dos contratos é a PROCURADORIA. O órgão que tem o seu modelo não pode ser obrigado a usar o
 * nosso — e o texto do órgão reduz o risco jurídico. Aqui: o administrador do órgão importa o .docx dele,
 * com campos {{campo}}, e o sistema SUBSTITUI os campos dentro do próprio arquivo, preservando a formatação.
 * O modelo padrão (js/cplprodocs.js) continua como reserva.
 *
 * PURO: sem DOM, sem rede, sem Store. Roda no gate em Node. Quem lê/descomprime o ZIP recebe `inflar` de fora
 * (navegador: DecompressionStream; Node: zlib) — sem ele, entrada comprimida vira erro DECLARADO, nunca
 * conteúdo pela metade. Quem grava o ZIP é o Docx.zip (js/docx.js).
 *
 * ⚠ CAMPO PARTIDO EM VÁRIOS <w:r> — o defeito que este arquivo existe para vencer. O Word parte «{{objeto}}» em
 *   runs («{{», «obj», «eto}}») por revisão ortográfica, troca de formatação e salvamentos sucessivos. Substituir
 *   por regex no XML deixa o campo intacto no documento, calado. Aqui o texto do PARÁGRAFO é concatenado, o campo
 *   é achado no texto inteiro e o valor entra no run onde o campo começa; o resto dos runs mantém a formatação.
 * ⚠ CAMPO SEM VALOR vira «[PREENCHER: rótulo]» em vermelho — nunca fica o {{campo}} cru nem um texto inventado.
 *   Campo que o sistema não conhece vira «[CAMPO DESCONHECIDO: x]» e é devolvido em `desconhecidos`.
 * ⚠ SIGILO: os valores vêm de CplproDocs.valoresModelo, que só devolve o valor estimado depois do julgamento.
 * ES5 puro.
 * ===================================================================== */
(function (global) {
  "use strict";

  var Docx = global.Docx;
  if (typeof require === "function" && typeof module !== "undefined") {
    if (!Docx) { try { Docx = require("./docx.js"); } catch (e) { Docx = null; } }
  }

  var TIPOS = {
    edital:   { id: "edital",   nome: "Edital" },
    tr:       { id: "tr",       nome: "TR / Projeto básico" },
    contrato: { id: "contrato", nome: "Contrato" },
    etp:      { id: "etp",      nome: "ETP — Estudo técnico preliminar" },
    dfd:      { id: "dfd",      nome: "DFD — Documento de formalização da demanda" }
  };
  var TIPOS_ORDEM = ["edital", "tr", "contrato", "etp", "dfd"];
  var MAX_BYTES = 8 * 1024 * 1024;
  var VERMELHO = "B91C1C";

  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function vazio(v) { return v === null || v === undefined || (typeof v === "string" && v.replace(/\s/g, "") === ""); }
  function r16(a, p) { return a[p] | (a[p + 1] << 8); }
  function r32(a, p) { return (a[p] | (a[p + 1] << 8) | (a[p + 2] << 16) | (a[p + 3] << 24)) >>> 0; }
  function deUtf8(b) {
    if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8").decode(b);
    var s = "", i; for (i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
  }
  function paraUtf8(s) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s);
    var u = unescape(encodeURIComponent(s)), o = new Uint8Array(u.length), i; for (i = 0; i < u.length; i++) o[i] = u.charCodeAt(i);
    return o;
  }
  function decEnt(s) {
    return String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(+d); })
      .replace(/&#x([0-9a-fA-F]+);/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); }).replace(/&amp;/g, "&");
  }
  function encEnt(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  }

  /* ------------------------------------------------------------------ *
   * ZIP — leitura (a escrita é do Docx.zip)
   * `inflar(bytes)` devolve Uint8Array ou Promise dela.
   * ------------------------------------------------------------------ */
  function lerZip(bytes, inflar) {
    var b = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes || []);
    var fim = -1, i;
    for (i = b.length - 22; i >= 0 && i > b.length - 66000; i--) { if (r32(b, i) === 0x06054b50) { fim = i; break; } }
    if (fim < 0) return Promise.reject(new Error("O arquivo não é um .docx válido (não achei o índice do ZIP). Salve o modelo como «Documento do Word (.docx)»."));
    var n = r16(b, fim + 10), cdIni = r32(b, fim + 16), entradas = [], p = cdIni, k;
    for (k = 0; k < n; k++) {
      if (r32(b, p) !== 0x02014b50) return Promise.reject(new Error("O índice do arquivo está corrompido."));
      var nlen = r16(b, p + 28), elen = r16(b, p + 30), clen = r16(b, p + 32);
      entradas.push({ nome: deUtf8(b.subarray(p + 46, p + 46 + nlen)), metodo: r16(b, p + 10), csize: r32(b, p + 20), off: r32(b, p + 42) });
      p += 46 + nlen + elen + clen;
    }
    var saida = {}, ordem = [], seq = Promise.resolve();
    entradas.forEach(function (e) {
      seq = seq.then(function () {
        if (r32(b, e.off) !== 0x04034b50) throw new Error("Entrada corrompida no arquivo: " + e.nome);
        var nl = r16(b, e.off + 30 - 4), el = r16(b, e.off + 30 - 2), ini = e.off + 30 + nl + el, bruto = b.subarray(ini, ini + e.csize);
        ordem.push(e.nome);
        if (/\/$/.test(e.nome)) return;
        if (e.metodo === 0) { saida[e.nome] = bruto.slice(0); return; }
        if (e.metodo !== 8) throw new Error("O arquivo usa uma compressão que não leio (" + e.nome + ").");
        if (typeof inflar !== "function") throw new Error("O arquivo está comprimido e este aparelho não sabe descomprimir.");
        return Promise.resolve(inflar(bruto.slice(0))).then(function (r) { saida[e.nome] = (r instanceof Uint8Array) ? r : new Uint8Array(r); });
      });
    });
    return seq.then(function () { return { arquivos: saida, ordem: ordem.filter(function (nm) { return saida[nm]; }) }; });
  }

  /* ------------------------------------------------------------------ *
   * O texto do parágrafo: runs consecutivos «simples» (rPr + um <w:t>) formam um GRUPO; o campo é achado no texto
   * do grupo inteiro, mesmo partido em vários runs.
   * ------------------------------------------------------------------ */
  var RE_CAMPO = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
  var RE_RUN = /<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g;
  var RE_RUN_SIMPLES = /^(<w:r(?:\s[^>]*)?>)(<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t(?:\s[^>]*)?>([^<]*)<\/w:t><\/w:r>$/;
  var RE_ENTRE = /^(\s|<w:proofErr[^>]*\/>|<w:bookmark(?:Start|End)[^>]*\/>)*$/;

  function runVermelho(rPr) {
    var cor = '<w:color w:val="' + VERMELHO + '"/>', neg = "<w:b/>";
    if (!rPr) return "<w:rPr>" + neg + cor + "</w:rPr>";
    var x = rPr.replace(/<w:color\s[^>]*\/>/g, "");
    if (!/<w:b[\s/>]/.test(x)) x = x.replace("</w:rPr>", neg + "</w:rPr>");
    return x.replace("</w:rPr>", cor + "</w:rPr>");
  }
  function emitirRun(open, rPr, texto, vermelho) {
    if (texto === "") return "";
    return open + (vermelho ? runVermelho(rPr) : (rPr || "")) + '<w:t xml:space="preserve">' + encEnt(texto) + "</w:t></w:r>";
  }

  /* texto → [{ini, fim, id}] dos campos achados */
  function acharCampos(texto) {
    var out = [], m, re = new RegExp(RE_CAMPO.source, "g");
    while ((m = re.exec(texto)) !== null) out.push({ ini: m.index, fim: m.index + m[0].length, id: m[1].toLowerCase() });
    return out;
  }

  /* um grupo de runs simples → { xml, achados } */
  function reescreverGrupo(runs, resolver) {
    var full = "", marcas = [];
    runs.forEach(function (r, i) { marcas.push(full.length); full += r.texto; });
    var campos = acharCampos(full);
    if (!campos.length) return null;
    function runDe(pos) { var k = 0; while (k + 1 < runs.length && marcas[k + 1] <= pos) k++; return k; }
    var xml = "", cursor = 0;
    function literal(de, ate) {
      var pos = de;
      while (pos < ate) {
        var k = runDe(pos), fimRun = k + 1 < runs.length ? marcas[k + 1] : full.length, corte = Math.min(ate, fimRun);
        xml += emitirRun(runs[k].open, runs[k].rPr, full.substring(pos, corte), false);
        pos = corte;
      }
    }
    campos.forEach(function (c) {
      literal(cursor, c.ini);
      var r0 = runs[runDe(c.ini)], res = resolver(c.id);
      xml += emitirRun(r0.open, r0.rPr, res.texto, res.vermelho);
      cursor = c.fim;
    });
    literal(cursor, full.length);
    return { xml: xml, campos: campos.map(function (c) { return c.id; }) };
  }

  /* um XML de parte do Word → { xml, campos:[ids na ordem] } */
  function processarXml(xml, resolver) {
    var achados = [];
    var novo = xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, function (par) {
      /* lista os runs com suas posições dentro do parágrafo */
      var itens = [], m, re = new RegExp(RE_RUN.source, "g");
      while ((m = re.exec(par)) !== null) {
        var simples = RE_RUN_SIMPLES.exec(m[0]);
        itens.push({ ini: m.index, fim: m.index + m[0].length, xml: m[0], simples: !!simples, open: simples ? simples[1] : null, rPr: simples ? (simples[2] || "") : null, texto: simples ? decEnt(simples[3]) : null });
      }
      /* agrupa runs simples vizinhos (só marcas inertes entre eles) */
      var grupos = [], atual = null;
      itens.forEach(function (it) {
        if (!it.simples) { atual = null; return; }
        if (atual && RE_ENTRE.test(par.substring(atual[atual.length - 1].fim, it.ini))) atual.push(it);
        else { atual = [it]; grupos.push(atual); }
      });
      var saida = par;
      for (var g = grupos.length - 1; g >= 0; g--) {
        var gr = grupos[g], rg = reescreverGrupo(gr, resolver);
        if (!rg) continue;
        saida = saida.substring(0, gr[0].ini) + rg.xml + saida.substring(gr[gr.length - 1].fim);
        achados = rg.campos.concat(achados);
      }
      return saida;
    });
    return { xml: novo, campos: achados };
  }

  function partesDoTexto(nome) { return /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(nome); }

  /* ------------------------------------------------------------------ *
   * API
   * ------------------------------------------------------------------ */
  var CplproTpl = {
    TIPOS: TIPOS, TIPOS_ORDEM: TIPOS_ORDEM, MAX_BYTES: MAX_BYTES,

    /* leva F: texto corrido de um .docx (memorial descritivo da pasta). → Promise { ok, erro, texto } ; um parágrafo por linha */
    textoDocx: function (bytes, inflar) {
      if (!bytes || !bytes.length) return Promise.resolve({ ok: false, erro: "O arquivo está vazio." });
      return lerZip(bytes, inflar).then(function (z) {
        if (!z.arquivos["word/document.xml"]) return { ok: false, erro: "O arquivo não é um documento do Word (.docx): falta o texto principal." };
        var xml = deUtf8(z.arquivos["word/document.xml"]);
        var paras = xml.split(/<\/w:p>/), linhas = [];
        paras.forEach(function (pp) {
          var t = "", re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g, m;
          while ((m = re.exec(pp)) !== null) t += m[1] !== undefined ? m[1] : " ";
          t = t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
          linhas.push(t);
        });
        return { ok: true, texto: linhas.join("\n") };
      }, function (e) { return { ok: false, erro: e && e.message ? e.message : String(e) }; });
    },

    /* memorial (.docx ou .pdf) -> texto INTEIRO para o campo do Escopo, tudo no navegador (nenhuma rede).
       nome: nome do arquivo; bytes: Uint8Array (docx); lerPdf: function(cb) que devolve o texto do PDF (Gestao._pdfTexto).
       -> Promise { ok, erro, texto } */
    memorialParaEscopo: function (nome, bytes, inflar, lerPdf) {
      var ext = ((/\.([A-Za-z0-9]+)$/.exec(String(nome || "")) || [])[1] || "").toLowerCase();
      if (ext === "docx") {
        return CplproTpl.textoDocx(bytes, inflar).then(function (r) {
          if (!r.ok) return r;
          var t = String(r.texto || "").replace(/\n{3,}/g, "\n\n").trim();
          return t ? { ok: true, texto: t } : { ok: false, erro: "O documento não tem texto legível." };
        });
      }
      if (ext === "pdf") {
        if (typeof lerPdf !== "function") return Promise.resolve({ ok: false, erro: "Leitor de PDF indisponível." });
        return new Promise(function (res) {
          try {
            lerPdf(function (texto) {
              var t = String(texto || "").trim();
              res(t ? { ok: true, texto: t } : { ok: false, erro: "Não consegui extrair texto deste PDF — se for imagem escaneada, não há texto para ler." });
            });
          } catch (e) { res({ ok: false, erro: "Falha ao ler o PDF: " + ((e && e.message) || e) }); }
        });
      }
      return Promise.resolve({ ok: false, erro: "Anexe um memorial em .docx ou .pdf." });
    },

    /* lê o .docx e diz que campos {{...}} ele traz, quais o sistema conhece e quais não.
       → Promise { ok, erro, campos:[ids], conhecidos:[ids], desconhecidos:[ids] } */
    analisar: function (bytes, idsConhecidos, inflar) {
      var conhecidos = arr(idsConhecidos);
      if (!bytes || !bytes.length) return Promise.resolve({ ok: false, erro: "O arquivo está vazio." });
      if (bytes.length > MAX_BYTES) return Promise.resolve({ ok: false, erro: "O arquivo passa de " + Math.round(MAX_BYTES / 1048576) + " MB; um modelo de documento não precisa disso." });
      return lerZip(bytes, inflar).then(function (z) {
        if (!z.arquivos["word/document.xml"]) return { ok: false, erro: "O arquivo não é um documento do Word (.docx): falta o texto principal." };
        var ids = [];
        Object.keys(z.arquivos).forEach(function (nome) {
          if (!partesDoTexto(nome)) return;
          processarXml(deUtf8(z.arquivos[nome]), function (id) { if (ids.indexOf(id) < 0) ids.push(id); return { texto: "", vermelho: false }; });
        });
        return { ok: true, campos: ids, conhecidos: ids.filter(function (i) { return conhecidos.indexOf(i) >= 0; }), desconhecidos: ids.filter(function (i) { return conhecidos.indexOf(i) < 0; }) };
      }, function (e) { return { ok: false, erro: e && e.message ? e.message : String(e) }; });
    },

    /* preenche o modelo. `valores`: { id: texto|null }; `rotulos`: { id: rótulo }.
       → Promise { ok, erro, bytes, pendentes, faltando:[{id, rotulo}], desconhecidos:[ids], usados:[ids] } */
    preencher: function (bytes, valores, rotulos, inflar) {
      valores = valores || {}; rotulos = rotulos || {};
      if (!Docx || typeof Docx.zip !== "function") return Promise.resolve({ ok: false, erro: "O gerador de .docx não carregou." });
      return lerZip(bytes, inflar).then(function (z) {
        if (!z.arquivos["word/document.xml"]) return { ok: false, erro: "O arquivo não é um documento do Word (.docx): falta o texto principal." };
        var faltando = [], desconhecidos = [], usados = [], pendentes = 0;
        function resolver(id) {
          if (!Object.prototype.hasOwnProperty.call(valores, id)) {
            if (desconhecidos.indexOf(id) < 0) desconhecidos.push(id);
            pendentes++;
            return { texto: "[CAMPO DESCONHECIDO: " + id + "]", vermelho: true };
          }
          if (usados.indexOf(id) < 0) usados.push(id);
          if (vazio(valores[id])) {
            var rot = rotulos[id] || id;
            if (!faltando.some(function (f) { return f.id === id; })) faltando.push({ id: id, rotulo: rot });
            pendentes++;
            return { texto: "[PREENCHER: " + rot + "]", vermelho: true };
          }
          return { texto: String(valores[id]), vermelho: false };
        }
        var lista = z.ordem.map(function (nome) {
          var dados = z.arquivos[nome];
          if (partesDoTexto(nome)) {
            var r = processarXml(deUtf8(dados), resolver);
            dados = paraUtf8(r.xml);
          }
          return { nome: nome, dados: dados };
        });
        return { ok: true, bytes: Docx.zip(lista), pendentes: pendentes, faltando: faltando, desconhecidos: desconhecidos, usados: usados };
      }, function (e) { return { ok: false, erro: e && e.message ? e.message : String(e) }; });
    },

    /* modelo de exemplo: um .docx simples com os campos disponíveis e, se vierem, os títulos das seções do
       modelo padrão. `campos`: [{id, rotulo, exemplo}]; `secoes`: ["Do objeto", ...]. → HTML para Docx.deHtml */
    exemploHtml: function (tipo, campos, secoes, nomeOrgao) {
      var t = TIPOS[tipo] ? TIPOS[tipo].nome : tipo, h = "";
      h += "<h1>" + encEnt(t) + " — modelo do órgão</h1>";
      h += "<p><b>Como usar:</b> apague este bloco, escreva aqui o texto da procuradoria do órgão e, onde o sistema deve entrar com o dado do processo, digite o nome do campo com duas chaves de cada lado (veja a coluna «Campo» da tabela no fim deste arquivo). Esta explicação e a tabela são só orientação: apague-as antes de usar o modelo. Mantenha a formatação do órgão: o sistema só troca os campos.</p>";
      h += "<p><b>" + encEnt(nomeOrgao || "{{orgao}}") + "</b></p>";
      h += "<p>Processo nº {{processo}} — " + encEnt(t) + " nº {{numero_edital}}</p>";
      h += "<p>Objeto: {{objeto}}</p>";
      arr(secoes).forEach(function (s) { h += "<h2>" + encEnt(s) + "</h2><p>[texto da procuradoria para esta seção]</p>"; });
      h += "<h2>Campos disponíveis</h2><table><thead><tr><th>Campo</th><th>O que entra</th><th>Exemplo</th></tr></thead><tbody>" +
        arr(campos).map(function (c) { return "<tr><td>{{" + encEnt(c.id) + "}}</td><td>" + encEnt(c.rotulo) + "</td><td>" + encEnt(c.exemplo || "") + "</td></tr>"; }).join("") + "</tbody></table>";
      return h;
    },

    /* funções internas expostas só para o teste */
    _lerZip: lerZip, _processarXml: processarXml
  };

  global.CplproTpl = CplproTpl;
  if (typeof module !== "undefined" && module.exports) module.exports = CplproTpl;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
