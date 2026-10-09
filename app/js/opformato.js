/* =====================================================================
 * opformato.js — OS ARQUIVOS DO ORÇAPRO (motor puro, Node-testável)
 *
 * Pedido do Rogério, 07/10/2026: "o nosso tem
 * que ter uma sigla e um tipo de arquivo, para compartilhar com outros
 * usuários o que foi criado aqui dentro". Ver PLANO-BIM-FAMILIAS-FORMATOS.md.
 *
 *   .opbim  Projeto OrçaPRO  (≈ .rvt) — ZIP: manifesto + modelo + famílias + IFC vinculados
 *   .optpl  Template OrçaPRO (≈ .rte) — JSON: níveis, tipos, famílias, estilos das vistas
 *   .opfam  Família OrçaPRO  (≈ .rfa) — JSON: uma família paramétrica (js/familia.js)
 *
 * Os três têm o MESMO cabeçalho: formato, versao, app, criadoEm, autor e
 * hash (SHA-256 do conteúdo). Na leitura:
 *   • formato errado ou JSON quebrado → recusa com o motivo;
 *   • hash não confere → recusa ("o arquivo foi alterado ou corrompido");
 *   • versão MAIS NOVA que a deste app → recusa ("atualize o OrçaPRO");
 *   • versão mais antiga → MIGRA e avisa.
 * ⚠ Família e template nunca levam preço nem dado de cliente; o projeto
 *   leva o que é do MODELO (geometria, parâmetros, vistas), não o orçamento.
 * ===================================================================== */
(function (global) {
  "use strict";

  var EXT = { projeto: ".opbim", template: ".optpl", familia: ".opfam" };
  var FORMATO = { projeto: "OrcaPRO-Projeto", template: "OrcaPRO-Template", familia: "OrcaPRO-Familia" };
  var VERSAO = { projeto: 1, template: 1, familia: 1 };
  var NOMES = { projeto: "Projeto OrçaPRO", template: "Template OrçaPRO", familia: "Família OrçaPRO" };

  function txt(v) { return v == null ? "" : String(v); }

  /* ------------------------------------------------- SHA-256 (síncrono) */
  function utf8(s) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s);
    var out = [], i = 0; s = txt(s);
    for (; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { c = 0x10000 + ((c - 0xd800) << 10) + (s.charCodeAt(++i) - 0xdc00); }
      if (c < 0x80) out.push(c); else if (c < 0x800) out.push(0xc0 | c >> 6, 0x80 | c & 63);
      else if (c < 0x10000) out.push(0xe0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63);
      else out.push(0xf0 | c >> 18, 0x80 | c >> 12 & 63, 0x80 | c >> 6 & 63, 0x80 | c & 63);
    }
    return new Uint8Array(out);
  }
  var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function sha256(dados) {
    var b = typeof dados === "string" ? utf8(dados) : (dados instanceof Uint8Array ? dados : new Uint8Array(dados || []));
    var n = b.length, total = ((n + 9 + 63) >> 6) << 6, m = new Uint8Array(total);
    m.set(b); m[n] = 0x80;
    var bits = n * 8; m[total - 4] = (bits >>> 24) & 255; m[total - 3] = (bits >>> 16) & 255; m[total - 2] = (bits >>> 8) & 255; m[total - 1] = bits & 255;
    m[total - 8] = Math.floor(n / 0x20000000) & 255;
    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], w = new Array(64);
    for (var o = 0; o < total; o += 64) {
      for (var i = 0; i < 16; i++) w[i] = (m[o + i * 4] << 24) | (m[o + i * 4 + 1] << 16) | (m[o + i * 4 + 2] << 8) | m[o + i * 4 + 3];
      for (i = 16; i < 64; i++) {
        var s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
        var s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = h[0], bb = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (i = 0; i < 64; i++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var t1 = (hh + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var t2 = (S0 + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + bb) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    return h.map(function (x) { return ("00000000" + (x >>> 0).toString(16)).slice(-8); }).join("");
  }

  /* ---------------------------------------------------------- cabeçalho */
  function cabecalho(tipo, meta) {
    meta = meta || {};
    return { formato: FORMATO[tipo], versao: VERSAO[tipo], app: txt(meta.app) || "OrçaPRO",
             criadoEm: meta.criadoEm || new Date().toISOString(), autor: txt(meta.autor), descricao: txt(meta.descricao) };
  }
  /* confere o cabeçalho; devolve null se ok ou o motivo */
  function conferir(tipo, obj, corpo) {
    if (!obj || typeof obj !== "object") return "o arquivo não é um " + NOMES[tipo] + " (conteúdo vazio ou ilegível)";
    if (obj.formato !== FORMATO[tipo]) {
      var outro = null; Object.keys(FORMATO).forEach(function (k) { if (FORMATO[k] === obj.formato) outro = k; });
      return outro ? "este arquivo é um " + NOMES[outro] + " (" + EXT[outro] + "), não um " + NOMES[tipo] + " (" + EXT[tipo] + ")"
                   : "o arquivo não é um " + NOMES[tipo] + " (formato \"" + txt(obj.formato) + "\")";
    }
    if (!(obj.versao >= 1)) return "versão do arquivo ausente";
    if (obj.versao > VERSAO[tipo]) return "o arquivo é da versão " + obj.versao + " do formato; este OrçaPRO lê até a " + VERSAO[tipo] + ". Atualize o OrçaPRO para abrir.";
    if (corpo !== undefined && obj.hash && obj.hash !== sha256(JSON.stringify(corpo))) return "o arquivo foi alterado fora do OrçaPRO ou está corrompido (a conferência de integridade não bate)";
    return null;
  }
  /* MIGRAÇÕES por formato e versão: fn(obj) → obj na versão seguinte. Vazio na v1;
     a próxima mudança de formato entra aqui e o teste cobra que a v1 continue abrindo. */
  var MIGRAR = { projeto: {}, template: {}, familia: {} };
  function migrar(tipo, obj) {
    var avisos = [];
    while (obj.versao < VERSAO[tipo]) {
      var fn = MIGRAR[tipo][obj.versao];
      if (!fn) throw new Error("não sei atualizar " + NOMES[tipo] + " da versão " + obj.versao);
      obj = fn(obj); avisos.push(NOMES[tipo] + " atualizado da versão " + (obj.versao - 1) + " para a " + obj.versao);
    }
    return { obj: obj, avisos: avisos };
  }
  function lerJson(texto) {
    var s = txt(texto); if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
    try { return JSON.parse(s); } catch (e) { return null; }
  }

  /* ------------------------------------------------------------ FAMÍLIA */
  function semPreco(fam) {
    var f = JSON.parse(JSON.stringify(fam || {}));
    if (f.quantitativo) { delete f.quantitativo.preco; delete f.quantitativo.custo; delete f.quantitativo.valor; }
    /* F1: o tipo e os serviços também levam código (nunca o preço) */
    var tira = function (o) { if (o && typeof o === "object") ["preco", "custo", "valor", "custoUnitario", "custoMO", "custoMAT", "custoEQ"].forEach(function (k) { delete o[k]; }); };
    (Array.isArray(f.tipos) ? f.tipos : []).forEach(tira);
    (Array.isArray(f.servicos) ? f.servicos : []).forEach(tira);
    return f;
  }
  function familiaParaArquivo(fam, meta) {
    var corpo = semPreco(fam), o = cabecalho("familia", meta);
    o.hash = sha256(JSON.stringify(corpo)); o.familia = corpo;
    return JSON.stringify(o, null, 1);
  }
  function lerFamilia(texto, validar) {
    var o = lerJson(texto);
    var motivo = conferir("familia", o, o && o.familia);
    if (motivo) return { ok: false, erros: [motivo] };
    var mg; try { mg = migrar("familia", o); } catch (e) { return { ok: false, erros: [e.message] }; }
    var fam = mg.obj.familia;
    var v = typeof validar === "function" ? validar(fam) : { ok: true, erros: [], avisos: [] };
    if (!v.ok) return { ok: false, erros: ["a família tem problemas: " + v.erros.join("; ")] };
    return { ok: true, familia: fam, meta: { autor: o.autor, criadoEm: o.criadoEm, app: o.app }, avisos: mg.avisos.concat(v.avisos || []) };
  }

  /* ----------------------------------------------------------- TEMPLATE
   * template = { nome, niveis:[{nome, elevacao}], tiposParede:[…], familias:[família…],
   *              estilos2d:{ planta:{…}, corte:{…} }, unidades:{…} } */
  function templateParaArquivo(tpl, meta) {
    var corpo = JSON.parse(JSON.stringify(tpl || {}));
    corpo.familias = (corpo.familias || []).map(semPreco);
    var o = cabecalho("template", meta); o.hash = sha256(JSON.stringify(corpo)); o.template = corpo;
    return JSON.stringify(o, null, 1);
  }
  function lerTemplate(texto, validarFamilia) {
    var o = lerJson(texto);
    var motivo = conferir("template", o, o && o.template);
    if (motivo) return { ok: false, erros: [motivo] };
    var mg; try { mg = migrar("template", o); } catch (e) { return { ok: false, erros: [e.message] }; }
    var t = mg.obj.template || {}, avisos = mg.avisos.slice(), fams = [];
    (t.familias || []).forEach(function (f) {
      var v = typeof validarFamilia === "function" ? validarFamilia(f) : { ok: true };
      if (v.ok) fams.push(f); else avisos.push("família \"" + txt(f.nome) + "\" ficou de fora: " + v.erros.join("; "));
    });
    t.familias = fams;
    return { ok: true, template: t, meta: { autor: o.autor, criadoEm: o.criadoEm, app: o.app }, avisos: avisos };
  }

  /* ------------------------------------------------------------ PROJETO
   * proj = { nome, modelo:{ edicao:[ops], niveis:[…], desenho2d:{…}, … },
   *          familias:[família…], ifcs:[{ nome, bytes:Uint8Array }],
 *          malhas:[{ nome, bytes }] (glb/obj/… e o .json do SketchUp; opções em modelo.malhas),
   *          extras:{ "<nome>.json": objeto } }   (extras: parâmetros de famílias importadas, atributos do SketchUp…)
   * ZIP: manifesto.json (cabeçalho + lista de arquivos com sha256 e tamanho),
   *      modelo.json, familias/<id>.opfam, ifc/<nome>, malhas/<nome>, extras/<nome>.json */
  function nomeSeguro(s) { return txt(s).replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "arquivo"; }
  function projetoParaZip(proj, meta, zipEscrever) {
    if (typeof zipEscrever !== "function") throw new Error("sem o gravador de ZIP");
    proj = proj || {};
    var arq = {}, lista = [];
    function por(nome, bytes) { arq[nome] = bytes; lista.push({ nome: nome, bytes: bytes.length, sha256: sha256(bytes) }); }
    por("modelo.json", utf8(JSON.stringify({ nome: txt(proj.nome), modelo: proj.modelo || {} })));
    (proj.familias || []).forEach(function (f) { por("familias/" + nomeSeguro(f.id || f.nome) + EXT.familia, utf8(familiaParaArquivo(f, meta))); });
    (proj.ifcs || []).forEach(function (x) { por("ifc/" + nomeSeguro(x.nome), x.bytes instanceof Uint8Array ? x.bytes : utf8(txt(x.bytes))); });
    (proj.malhas || []).forEach(function (x) { por("malhas/" + nomeSeguro(x.nome), x.bytes instanceof Uint8Array ? x.bytes : utf8(txt(x.bytes))); });
    Object.keys(proj.extras || {}).forEach(function (k) { por("extras/" + nomeSeguro(k), utf8(JSON.stringify(proj.extras[k]))); });
    var man = cabecalho("projeto", meta); man.nome = txt(proj.nome); man.arquivos = lista;
    man.hash = sha256(JSON.stringify(lista));
    arq["manifesto.json"] = utf8(JSON.stringify(man, null, 1));
    return zipEscrever(arq);
  }
  function deUtf8(b) {
    if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8").decode(b);
    var s = ""; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
  }
  function lerProjeto(bytes, zipLer, opts) {
    if (typeof zipLer !== "function") return Promise.resolve({ ok: false, erros: ["sem o leitor de ZIP"] });
    opts = opts || {};
    return zipLer(bytes, opts).then(function (arq) {
      var manB = arq["manifesto.json"];
      if (!manB) return { ok: false, erros: ["o arquivo não é um Projeto OrçaPRO (.opbim): falta o manifesto"] };
      var man = lerJson(deUtf8(manB));
      var motivo = conferir("projeto", man, man && man.arquivos);
      if (motivo) return { ok: false, erros: [motivo] };
      /* cada arquivo do pacote confere com o manifesto: tamanho e SHA-256 */
      var faltando = [], alterados = [];
      (man.arquivos || []).forEach(function (a) {
        var b = arq[a.nome];
        if (!b) faltando.push(a.nome);
        else if (b.length !== a.bytes || sha256(b) !== a.sha256) alterados.push(a.nome);
      });
      if (faltando.length || alterados.length) return { ok: false, erros: ["o projeto está incompleto ou foi alterado: " + faltando.concat(alterados).join(", ")] };
      var mg; try { mg = migrar("projeto", man); } catch (e) { return { ok: false, erros: [e.message] }; }
      var mod = lerJson(deUtf8(arq["modelo.json"] || new Uint8Array(0))) || {};
      var avisos = mg.avisos.slice(), familias = [], ifcs = [], malhas = [], extras = {};
      Object.keys(arq).sort().forEach(function (nome) {
        if (/^familias\//.test(nome)) {
          var r = lerFamilia(deUtf8(arq[nome]), opts.validarFamilia);
          if (r.ok) familias.push(r.familia); else avisos.push(nome + ": " + r.erros.join("; "));
        } else if (/^ifc\//.test(nome)) ifcs.push({ nome: nome.slice(4), bytes: arq[nome] });
        else if (/^malhas\//.test(nome)) malhas.push({ nome: nome.slice(7), bytes: arq[nome] });
        else if (/^extras\//.test(nome)) extras[nome.slice(7)] = lerJson(deUtf8(arq[nome]));
      });
      return { ok: true, nome: mod.nome || man.nome || "", modelo: mod.modelo || {}, familias: familias, ifcs: ifcs, malhas: malhas, extras: extras,
               meta: { autor: man.autor, criadoEm: man.criadoEm, app: man.app }, avisos: avisos };
    }).catch(function (e) { return { ok: false, erros: ["não consegui ler o projeto: " + e.message] }; });
  }

  /* que arquivo é este? pela extensão e, na dúvida, pelo conteúdo */
  function tipoDoArquivo(nome, primeirosBytes) {
    var n = txt(nome).toLowerCase(), t = null;
    Object.keys(EXT).forEach(function (k) { if (n.slice(-EXT[k].length) === EXT[k]) t = k; });
    if (t) return t;
    if (primeirosBytes && primeirosBytes[0] === 0x50 && primeirosBytes[1] === 0x4b) return "zip";
    return null;
  }

  var OpFormato = {
    EXT: EXT, FORMATO: FORMATO, VERSAO: VERSAO, NOMES: NOMES, _MIGRAR: MIGRAR,
    sha256: sha256, utf8: utf8,
    familiaParaArquivo: familiaParaArquivo, lerFamilia: lerFamilia,
    templateParaArquivo: templateParaArquivo, lerTemplate: lerTemplate,
    projetoParaZip: projetoParaZip, lerProjeto: lerProjeto, tipoDoArquivo: tipoDoArquivo, nomeSeguro: nomeSeguro
  };
  global.OpFormato = OpFormato;
  if (typeof module !== "undefined" && module.exports) module.exports = OpFormato;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
