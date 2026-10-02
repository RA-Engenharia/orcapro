/* =====================================================================
 * docobra.js — MOTOR do arquivo de documentos da obra.
 *
 * Puro: sem DOM, sem Store, sem rede. Roda no gate em Node. A tela é o
 * js/docobraui.js; a assinatura digital é do assinador local, chamado pelo
 * servidor (server/assinador.js).
 *
 * O QUE UM DOCUMENTO GUARDA (entidade `obra_docs`, sincroniza):
 *   ficha  — obra, tipo, disciplina, título, código, revisão, data, situação
 *   arquivo — {chave, nome, tipo, tam, sha256}: os BYTES moram no IndexedDB
 *            do aparelho que adicionou (não viajam; a lista viaja). É a regra
 *            das pranchas e dos anexos do içamento — ver js/nuvem.js.
 *   versoes — todo arquivo que já foi o atual (original, assinado, reassinado),
 *            com SHA-256, quando e por quem. O original nunca se perde.
 *   assinaturas — o que a VERIFICAÇÃO achou dentro do PDF (titular, CNPJ/CPF,
 *            emissor, data, íntegra, cadeia confiável). Nunca o que alguém
 *            digitou: assinatura se lê do arquivo ou não se afirma.
 *   manuscritas — imagem de assinatura AUTORIZADA aplicada, com a autorização.
 *   historico — quem fez o quê e quando (rastreio).
 *
 * ⚠ ASSINATURA SE LÊ DO ARQUIVO. A tela nunca marca "assinado" por clique:
 *   o estado sai de `assinaturas`, que só a verificação preenche. Recado que
 *   mente é pior que recado nenhum.
 * ⚠ SEM MATERIAL DE CLIENTE AQUI (nem em comentário): este arquivo vai para
 *   o PWA público e para o pacote de todo cliente.
 * ===================================================================== */
(function (global) {
  "use strict";

  var TIPOS = [
    ["proposta", "Proposta comercial"],
    ["contrato", "Contrato"],
    ["aditivo", "Aditivo contratual"],
    ["art_rrt", "ART / RRT"],
    ["projeto", "Projeto / prancha"],
    ["memorial_calculo", "Memorial de cálculo"],
    ["memorial_descritivo", "Memorial descritivo"],
    ["laudo", "Laudo / parecer técnico"],
    ["alvara", "Alvará / licença"],
    ["relatorio", "Relatório"],
    ["rdo", "Diário de obra (RDO)"],
    ["medicao", "Boletim de medição"],
    ["nota", "Nota fiscal / recibo"],
    ["apolice", "Apólice de seguro"],
    ["ata", "Ata de reunião"],
    ["outro", "Outro"]
  ];
  var DISCIPLINAS = [
    ["", "—"], ["arquitetura", "Arquitetura"], ["estrutura", "Estrutura"], ["fundacao", "Fundação"],
    ["hidrossanitario", "Hidrossanitário"], ["eletrico", "Elétrico"], ["climatizacao", "Climatização"],
    ["incendio", "Incêndio"], ["topografia", "Topografia"], ["geotecnia", "Geotecnia / sondagem"],
    ["orcamento", "Orçamento"], ["outra", "Outra"]
  ];
  /* situação que a PESSOA decide. "Assinado" não está aqui de propósito:
     sai da verificação do arquivo (ver `estado`). */
  var SITUACOES = [["rascunho", "Rascunho"], ["emitido", "Emitido"], ["enviado", "Enviado ao cliente"], ["cancelado", "Cancelado"]];

  var MAX_HIST = 60;          // eventos guardados por documento (o registro inteiro viaja num doc de 1 MiB)
  var MAX_VERSOES = 12;

  function rotulo(lista, id) {
    for (var i = 0; i < lista.length; i++) if (lista[i][0] === id) return lista[i][1];
    return "";
  }
  function ids(lista) { var m = {}; lista.forEach(function (p) { m[p[0]] = 1; }); return m; }
  var TIPO_OK = ids(TIPOS), DISC_OK = ids(DISCIPLINAS), SIT_OK = ids(SITUACOES);

  function str(v, max) { v = (v == null) ? "" : String(v); v = v.replace(/[\u0000-\u001f]+/g, " ").trim(); return max ? v.slice(0, max) : v; }
  function dataOk(d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d || "")); }

  /* ---------------------------------------------------------------
   * LEITURA DO NOME DO ARQUIVO — só para PREENCHER a ficha; a pessoa
   * confirma. "ABC-EST_R01_Memorial_de_Calculo.pdf" vira código
   * "ABC-EST", revisão "R01", título "Memorial de Calculo".
   * --------------------------------------------------------------- */
  function semExtensao(nome) { return String(nome || "").replace(/\.[a-z0-9]{1,5}$/i, ""); }

  function revisaoDoNome(nome) {
    var b = semExtensao(nome);
    var m = b.match(/(?:^|[_\s.\-])R(?:EV)?\.?\s?(\d{1,3})(?=$|[_\s.\-])/i);
    if (!m) return "";
    var n = parseInt(m[1], 10);
    return "R" + (n < 10 ? "0" + n : String(n));
  }
  function codigoDoNome(nome) {
    var b = semExtensao(nome);
    var m = b.match(/^([A-Z0-9]{2,}(?:-[A-Z0-9]+)+)/);   // MAIÚSCULAS com hífen: o padrão de código de projeto
    return m ? m[1] : "";
  }
  function tituloDoNome(nome) {
    var b = semExtensao(nome);
    var cod = codigoDoNome(nome);
    if (cod) b = b.slice(cod.length);
    b = b.replace(/(?:^|[_\s.\-])R(?:EV)?\.?\s?\d{1,3}(?=$|[_\s.\-])/i, " ");
    b = b.replace(/[_]+/g, " ").replace(/\s+-\s+/g, " — ").replace(/\s+/g, " ").replace(/^[\s\-—]+|[\s\-—]+$/g, "");
    return b || semExtensao(nome);
  }
  function tipoDoNome(nome) {
    var b = semExtensao(nome).replace(/_/g, " ");
    if (/memorial.{0,6}c[aá]lculo/i.test(b)) return "memorial_calculo";
    if (/memorial/i.test(b)) return "memorial_descritivo";
    if (/aditivo/i.test(b)) return "aditivo";
    if (/contrato/i.test(b)) return "contrato";
    if (/proposta/i.test(b)) return "proposta";
    if (/(^|\W)(ART|RRT)(\W|$)/.test(b)) return "art_rrt";
    if (/laudo|parecer/i.test(b)) return "laudo";
    if (/alvar[aá]|licen[cç]a/i.test(b)) return "alvara";
    if (/(^|\W)RDO(\W|$)|di[aá]rio de obra/i.test(b)) return "rdo";
    if (/boletim|medi[cç][aã]o/i.test(b)) return "medicao";
    if (/prancha|planta|corte|fachada|detalhe|projeto|loca[cç][aã]o/i.test(b)) return "projeto";
    if (/(^|\W)ata(\W|$)/i.test(b)) return "ata";
    if (/ap[oó]lice|seguro/i.test(b)) return "apolice";
    if (/nota fiscal|(^|\W)NF(-?e)?(\W|$)|recibo/i.test(b)) return "nota";
    if (/relat[oó]rio/i.test(b)) return "relatorio";
    return "outro";
  }
  function proximaRevisao(rev) {
    var m = String(rev || "").match(/(\d+)\s*$/);
    if (!m) return "R01";
    var n = parseInt(m[1], 10) + 1;
    return "R" + (n < 10 ? "0" + n : String(n));
  }

  /* ---------------------------------------------------------------
   * REGISTRO
   * --------------------------------------------------------------- */
  function normalizar(r) {
    r = r || {};
    var o = {};
    for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k)) o[k] = r[k];
    o.obraId = str(o.obraId, 80);
    o.obraNome = str(o.obraNome, 160);
    o.tipo = TIPO_OK[o.tipo] ? o.tipo : "outro";
    o.disciplina = DISC_OK[o.disciplina] ? o.disciplina : "";
    o.titulo = str(o.titulo, 200);
    o.codigo = str(o.codigo, 80);
    o.revisao = str(o.revisao, 20);
    o.data = dataOk(o.data) ? o.data : "";
    o.observacao = str(o.observacao, 500);
    o.situacao = SIT_OK[o.situacao] ? o.situacao : "emitido";
    o.arquivo = o.arquivo && typeof o.arquivo === "object" ? o.arquivo : null;
    o.versoes = Array.isArray(o.versoes) ? o.versoes.slice(-MAX_VERSOES) : [];
    o.assinaturas = Array.isArray(o.assinaturas) ? o.assinaturas : [];
    o.manuscritas = Array.isArray(o.manuscritas) ? o.manuscritas : [];
    o.historico = Array.isArray(o.historico) ? o.historico.slice(-MAX_HIST) : [];
    o.substitui = str(o.substitui, 80);
    o.substituidoPor = str(o.substituidoPor, 80);
    o.vinculo = (o.vinculo && o.vinculo.docTipo && o.vinculo.docId) ? { docTipo: str(o.vinculo.docTipo, 40), docId: str(o.vinculo.docId, 80) } : null;
    return o;
  }

  function validar(r) {
    var e = [];
    if (!r.obraId) e.push("Escolha a obra: todo documento pertence a uma obra.");
    if (!r.titulo) e.push("Informe o título do documento.");
    if (r.data && !dataOk(r.data)) e.push("A data precisa estar no formato dia/mês/ano.");
    if (!r.arquivo || !r.arquivo.chave || !r.arquivo.sha256) e.push("Falta o arquivo do documento.");
    return e;
  }

  function evento(r, acao, por, detalhe, agoraISO) {
    r.historico = (r.historico || []).concat([{ em: agoraISO || "", por: str(por, 80), acao: str(acao, 40), detalhe: str(detalhe, 300) }]).slice(-MAX_HIST);
    return r;
  }

  /* arquivo = {chave, nome, tipo, tam, sha256}; o anterior continua nas versões */
  function trocarArquivo(r, arquivo, por, motivo, agoraISO) {
    var a = { chave: str(arquivo.chave, 200), nome: str(arquivo.nome, 200), tipo: str(arquivo.tipo, 80),
      tam: +arquivo.tam || 0, sha256: str(arquivo.sha256, 64).toLowerCase() };
    r.arquivo = a;
    r.versoes = (r.versoes || []).concat([{ chave: a.chave, nome: a.nome, tam: a.tam, sha256: a.sha256,
      em: agoraISO || "", por: str(por, 80), motivo: str(motivo, 120) }]).slice(-MAX_VERSOES);
    return r;
  }

  /* resultado do `/__assinador/verificar` → o que fica no registro.
     ⚠ `ok` é do VERIFICADOR (íntegra + cadeia + sem alteração proibida).
     Nada aqui vira true por padrão: campo ausente é falso. */
  function aplicarVerificacao(r, assinaturas, por, agoraISO) {
    var l = (assinaturas || []).map(function (a) {
      return {
        titular: str(a.titular, 160), documento: str(a.documento, 30), responsavel: str(a.responsavel, 160),
        emissor: str(a.emissor, 160), icp: a.icp_brasil === true || a.icp === true,
        data: str(a.data, 40), integra: a.integra === true, confiavel: a.confiavel === true, ok: a.ok === true,
        problema: str(a.problema_confianca || a.erro || "", 120)
      };
    });
    r.assinaturas = l;
    r.verificadoEm = agoraISO || "";
    r.verificadoPor = str(por, 80);
    return r;
  }

  function estado(r) {
    if (!r) return { codigo: "", rotulo: "" };
    if (r.situacao === "cancelado") return { codigo: "cancelado", rotulo: "Cancelado" };
    if (r.substituidoPor) return { codigo: "substituido", rotulo: "Substituído por revisão" };
    var a = r.assinaturas || [];
    if (a.length) {
      var ok = a.filter(function (x) { return x.ok; }).length;
      if (ok === a.length) return { codigo: "assinado", rotulo: a.length === 1 ? "Assinado" : "Assinado (" + a.length + ")" };
      return { codigo: "pendencia", rotulo: "Assinatura com pendência (" + ok + " de " + a.length + " válidas)" };
    }
    return { codigo: r.situacao || "emitido", rotulo: rotulo(SITUACOES, r.situacao || "emitido") || "Emitido" };
  }

  /* titulares distintos, na ordem em que assinaram — para a coluna da lista */
  function signatarios(r) {
    var vistos = {}, out = [];
    (r.assinaturas || []).forEach(function (a) {
      var k = (a.titular || "") + "|" + (a.documento || "");
      if (vistos[k]) { vistos[k].n++; if (!a.ok) vistos[k].ok = false; return; }
      vistos[k] = { titular: a.titular, documento: a.documento, ok: !!a.ok, n: 1, icp: a.icp };
      out.push(vistos[k]);
    });
    (r.manuscritas || []).forEach(function (m) {
      out.push({ titular: m.nome, documento: "", ok: true, n: (m.paginas || []).length || 1, manuscrita: true });
    });
    return out;
  }

  function duplicado(lista, obraId, sha256) {
    var s = String(sha256 || "").toLowerCase();
    if (!s) return null;
    for (var i = 0; i < (lista || []).length; i++) {
      var d = lista[i];
      if (String(d.obraId) !== String(obraId)) continue;
      var vs = (d.versoes || []).concat(d.arquivo ? [d.arquivo] : []);
      for (var j = 0; j < vs.length; j++) if (String(vs[j].sha256 || "").toLowerCase() === s) return d;
    }
    return null;
  }

  /* revisão nova a partir da anterior: mesma ficha, revisão seguinte, liga as duas */
  function novaRevisao(anterior, rev) {
    var a = normalizar(anterior);
    return normalizar({ obraId: a.obraId, obraNome: a.obraNome, tipo: a.tipo, disciplina: a.disciplina,
      titulo: a.titulo, codigo: a.codigo, revisao: rev || proximaRevisao(a.revisao), situacao: "emitido",
      substitui: anterior.id || "" });
  }

  function filtrar(lista, f) {
    f = f || {};
    var busca = str(f.busca).toLowerCase();
    return (lista || []).filter(function (d) {
      if (f.obraId && f.obraId !== "todas" && String(d.obraId) !== String(f.obraId)) return false;
      if (f.tipo && d.tipo !== f.tipo) return false;
      if (f.situacao) {
        var e = estado(d).codigo;
        if (f.situacao === "vigentes" ? (e === "substituido" || e === "cancelado") : e !== f.situacao) return false;
      }
      if (busca) {
        var t = [d.titulo, d.codigo, d.revisao, d.observacao, d.arquivo && d.arquivo.nome,
          rotulo(TIPOS, d.tipo)].concat((d.assinaturas || []).map(function (a) { return a.titular; })).join(" ").toLowerCase();
        if (t.indexOf(busca) < 0) return false;
      }
      return true;
    });
  }

  function ordenar(lista) {
    return (lista || []).slice().sort(function (a, b) {
      var c = String(a.codigo || "~").localeCompare(String(b.codigo || "~"));
      if (c) return c;
      c = String(a.titulo || "").localeCompare(String(b.titulo || ""));
      if (c) return c;
      return String(b.revisao || "").localeCompare(String(a.revisao || ""));   // revisão mais nova primeiro
    });
  }

  function chaveArquivo(empresaId, obraId, docId, sha256) {
    return "docobra:" + empresaId + ":" + obraId + ":" + docId + ":" + String(sha256 || "").slice(0, 16);
  }

  /* nome para baixar: "<código> <revisão> - <título>.pdf", sem caractere proibido no Windows */
  function nomeParaBaixar(r) {
    var ext = ((r.arquivo && r.arquivo.nome) || "").match(/\.[a-z0-9]{1,5}$/i);
    var base = [r.codigo, r.revisao].filter(Boolean).join(" ");
    base = (base ? base + " - " : "") + (r.titulo || "documento");
    base = base.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 150);
    return base + (ext ? ext[0] : ".pdf");
  }

  /* ---------------------------------------------------------------
   * ASSINANTES (entidade `doc_assinantes`, da EMPRESA, sem obraId)
   *   certificado: quem assina com certificado ICP-Brasil deste computador;
   *                guarda só o CNPJ/CPF e o nome debaixo da linha (âncora).
   *   manuscrita:  imagem de assinatura de quem NÃO tem certificado e
   *                AUTORIZOU o uso. Sem autorização registrada não existe.
   * --------------------------------------------------------------- */
  function normalizarAssinante(a) {
    a = a || {};
    var o = {};
    for (var k in a) if (Object.prototype.hasOwnProperty.call(a, k)) o[k] = a[k];
    o.modo = o.modo === "manuscrita" ? "manuscrita" : "certificado";
    o.nome = str(o.nome, 160);
    o.papel = str(o.papel, 120);
    o.ancora = str(o.ancora, 160);
    o.cert = str(o.cert, 20).replace(/\D/g, "");
    o.imagem = o.imagem && o.imagem.chave ? { chave: str(o.imagem.chave, 200), nome: str(o.imagem.nome, 160) } : null;
    var au = o.autorizacao || {};
    o.autorizacao = { texto: str(au.texto, 400), por: str(au.por, 120), em: dataOk(au.em) ? au.em : "" };
    o.ativo = o.ativo !== false;
    return o;
  }
  function validarAssinante(a) {
    var e = [];
    if (!a.nome) e.push("Informe o nome de quem assina.");
    if (!a.ancora) e.push("Informe o texto que fica debaixo da linha de assinatura (normalmente o nome, como está no documento).");
    if (a.modo === "certificado" && !(a.cert.length === 11 || a.cert.length === 14)) e.push("Escolha o certificado (CPF ou CNPJ).");
    if (a.modo === "manuscrita") {
      if (!a.imagem) e.push("Falta a imagem da assinatura (PNG sem fundo).");
      if (!a.autorizacao.texto) e.push("Registre a autorização: quem autorizou o uso da assinatura e para quê.");
      if (!a.autorizacao.por) e.push("Registre quem confirmou a autorização.");
      if (!a.autorizacao.em) e.push("Registre a data da autorização.");
    }
    return e;
  }
  /* texto que vai ao log do assinador junto com a imagem */
  function textoAutorizacao(a) {
    var au = a.autorizacao || {};
    return [a.nome + " autorizou o uso da assinatura manuscrita", au.texto, "confirmado por " + au.por, "em " + au.em].filter(Boolean).join(" — ");
  }

  /* ---------------------------------------------------------------
   * SHA-256 DE BYTES — sem WebCrypto. `crypto.subtle` não existe quando o
   * app é aberto pelo IP da rede (celular/tablet no canteiro: http sem TLS).
   * O `Util.sha256hex` da casa é de TEXTO (monta um array de bytes JS por
   * caractere): num PDF de 10 MB ele trava a tela. Este trabalha direto no
   * Uint8Array, bloco a bloco. Conferido contra o `crypto` do Node no gate.
   * --------------------------------------------------------------- */
  var K256 = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function sha256Bytes(bytes) {
    var u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var H0 = 0x6a09e667, H1 = 0xbb67ae85, H2 = 0x3c6ef372, H3 = 0xa54ff53a, H4 = 0x510e527f, H5 = 0x9b05688c, H6 = 0x1f83d9ab, H7 = 0x5be0cd19;
    var w = new Int32Array(64);
    var n = u.length, total = ((n + 9 + 63) >> 6) << 6;
    var cauda = new Uint8Array(total - (n & ~63));   // último(s) bloco(s) com o enchimento
    cauda.set(u.subarray(n & ~63));
    cauda[n & 63] = 0x80;
    var bits = n * 8, hi = Math.floor(bits / 0x100000000), lo = bits >>> 0, c = cauda.length;
    cauda[c - 8] = hi >>> 24; cauda[c - 7] = hi >>> 16; cauda[c - 6] = hi >>> 8; cauda[c - 5] = hi;
    cauda[c - 4] = lo >>> 24; cauda[c - 3] = lo >>> 16; cauda[c - 2] = lo >>> 8; cauda[c - 1] = lo;
    function bloco(src, p) {
      var t, a, b, cc, d, e, f, g, h, s0, s1, t1, t2;
      for (t = 0; t < 16; t++, p += 4) w[t] = (src[p] << 24) | (src[p + 1] << 16) | (src[p + 2] << 8) | src[p + 3];
      for (t = 16; t < 64; t++) {
        s0 = ((w[t - 15] >>> 7) | (w[t - 15] << 25)) ^ ((w[t - 15] >>> 18) | (w[t - 15] << 14)) ^ (w[t - 15] >>> 3);
        s1 = ((w[t - 2] >>> 17) | (w[t - 2] << 15)) ^ ((w[t - 2] >>> 19) | (w[t - 2] << 13)) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      a = H0; b = H1; cc = H2; d = H3; e = H4; f = H5; g = H6; h = H7;
      for (t = 0; t < 64; t++) {
        s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        t1 = (h + s1 + ((e & f) ^ (~e & g)) + K256[t] + w[t]) | 0;
        s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        t2 = (s0 + ((a & b) ^ (a & cc) ^ (b & cc))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = cc; cc = b; b = a; a = (t1 + t2) | 0;
      }
      H0 = (H0 + a) | 0; H1 = (H1 + b) | 0; H2 = (H2 + cc) | 0; H3 = (H3 + d) | 0;
      H4 = (H4 + e) | 0; H5 = (H5 + f) | 0; H6 = (H6 + g) | 0; H7 = (H7 + h) | 0;
    }
    var p;
    for (p = 0; p + 64 <= (n & ~63); p += 64) bloco(u, p);
    for (p = 0; p < cauda.length; p += 64) bloco(cauda, p);
    var out = "";
    [H0, H1, H2, H3, H4, H5, H6, H7].forEach(function (x) { out += ("00000000" + (x >>> 0).toString(16)).slice(-8); });
    return out;
  }

  /* base64 de bytes sem estourar a pilha (String.fromCharCode em lotes) */
  function bytesParaBase64(bytes, btoaFn) {
    var u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var partes = [], LOTE = 0x8000;
    for (var i = 0; i < u.length; i += LOTE) partes.push(String.fromCharCode.apply(null, u.subarray(i, i + LOTE)));
    return (btoaFn || global.btoa)(partes.join(""));
  }
  function base64ParaBytes(b64, atobFn) {
    var s = (atobFn || global.atob)(String(b64 || ""));
    var u = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }
  function ehPdf(bytes) {
    var u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    return u.length > 5 && u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46 && u[4] === 0x2d;   // %PDF-
  }

  var DocObra = {
    TIPOS: TIPOS, DISCIPLINAS: DISCIPLINAS, SITUACOES: SITUACOES,
    rotuloTipo: function (id) { return rotulo(TIPOS, id) || "Outro"; },
    rotuloDisciplina: function (id) { return rotulo(DISCIPLINAS, id); },
    rotuloSituacao: function (id) { return rotulo(SITUACOES, id); },
    revisaoDoNome: revisaoDoNome, codigoDoNome: codigoDoNome, tituloDoNome: tituloDoNome, tipoDoNome: tipoDoNome,
    proximaRevisao: proximaRevisao,
    normalizar: normalizar, validar: validar, evento: evento, trocarArquivo: trocarArquivo,
    aplicarVerificacao: aplicarVerificacao, estado: estado, signatarios: signatarios,
    duplicado: duplicado, novaRevisao: novaRevisao, filtrar: filtrar, ordenar: ordenar,
    chaveArquivo: chaveArquivo, nomeParaBaixar: nomeParaBaixar,
    normalizarAssinante: normalizarAssinante, validarAssinante: validarAssinante, textoAutorizacao: textoAutorizacao,
    sha256Bytes: sha256Bytes, bytesParaBase64: bytesParaBase64, base64ParaBytes: base64ParaBytes, ehPdf: ehPdf,
    MAX_HIST: MAX_HIST
  };

  global.DocObra = DocObra;
  if (typeof module !== "undefined" && module.exports) module.exports = DocObra;
})(typeof window !== "undefined" ? window : this);
