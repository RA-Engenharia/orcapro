/* =====================================================================
 * cfb.js — LEITOR MÍNIMO do formato composto da Microsoft (CFB / OLE2)
 *          (motor puro, Node-testável, sem dependência)
 *
 * Por que existe (09/10/2026, pedido do Rogério: "reconhecer as famílias que
 * já existem no mercado"): o .rfa do Revit é um arquivo CFB — o mesmo
 * "contêiner de fluxos" dos .doc/.xls antigos. Dentro dele há o fluxo
 * "PartAtom" (XML Atom com a família, a categoria, os tipos e os parâmetros
 * da tabela de tipos) e "RevitPreview4.0" (a miniatura em PNG). A GEOMETRIA
 * fica em fluxos binários proprietários (Global/, Contents) que ninguém de
 * fora lê por inteiro — por isso o .rfa entra com tipos e parâmetros e uma
 * caixa, e a geometria vem pelo plugin (js/familiamalha.js).
 *
 * Só LEITURA, só o que a especificação [MS-CFB] exige para achar e ler um
 * fluxo: cabeçalho, DIFAT (inclusive a cadeia de setores DIFAT), FAT,
 * diretório (árvore vermelho-preta, percorrida em ordem), mini-FAT e
 * miniStream (fluxo < 4096 bytes mora lá). Versões 3 (setor de 512) e 4
 * (setor de 4096).
 *
 * ⚠ Arquivo hostil: toda cadeia de setores é limitada pelo número de setores
 *   do arquivo e um setor repetido na cadeia é ciclo → erro com o motivo,
 *   nunca laço infinito nem leitura fora do buffer.
 *
 * API:
 *   Cfb.ler(bytes)            → { ok, erro?, versao, entradas:[{caminho, nome, tipo, tamanho}], fluxo(caminho) → Uint8Array|null }
 *   Cfb.ehCfb(bytes)          → true se começa com a assinatura D0 CF 11 E0 A1 B1 1A E1
 * Teste: node tools/test-rfa-partatom.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var ASSINATURA = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  var FREESECT = 0xffffffff, ENDOFCHAIN = 0xfffffffe, FATSECT = 0xfffffffd, DIFSECT = 0xfffffffc;

  function u8(b) { return b instanceof Uint8Array ? b : new Uint8Array(b || []); }
  function ehCfb(bytes) {
    var b = u8(bytes); if (b.length < 512) return false;
    for (var i = 0; i < 8; i++) if (b[i] !== ASSINATURA[i]) return false;
    return true;
  }
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

  function ler(bytes) {
    var b = u8(bytes);
    function falha(m) { return { ok: false, erro: m, entradas: [], fluxo: function () { return null; } }; }
    if (!ehCfb(b)) return falha("o arquivo não é um documento composto (CFB/OLE) — assinatura ausente");
    if (u16(b, 0x1c) !== 0xfffe) return falha("ordem de bytes inválida no cabeçalho CFB");
    var maior = u16(b, 0x1a), shift = u16(b, 0x1e), miniShift = u16(b, 0x20);
    if (!((maior === 3 && shift === 9) || (maior === 4 && shift === 12))) return falha("versão do CFB não suportada (versão " + maior + ", setor 2^" + shift + ")");
    if (miniShift !== 6) return falha("tamanho de mini-setor inválido (2^" + miniShift + ")");
    var tamSetor = 1 << shift, tamMini = 1 << miniShift;
    var nSetores = Math.floor((b.length - tamSetor) / tamSetor);   /* o cabeçalho ocupa o "setor −1" */
    if (nSetores < 1) return falha("o arquivo CFB está truncado");
    var nFat = u32(b, 0x2c), dirIni = u32(b, 0x30), corte = u32(b, 0x38), miniFatIni = u32(b, 0x3c), nMiniFat = u32(b, 0x40), difatIni = u32(b, 0x44), nDifat = u32(b, 0x48);
    if (corte !== 4096) return falha("corte do mini-fluxo inválido (" + corte + ")");
    function offSetor(s) { return (s + 1) * tamSetor; }
    function setorOk(s) { return s < nSetores && offSetor(s) + tamSetor <= b.length; }

    /* ---- DIFAT: os setores da FAT ---- */
    var fatSetores = [], i, s;
    for (i = 0; i < 109 && fatSetores.length < nFat; i++) { s = u32(b, 0x4c + i * 4); if (s !== FREESECT) fatSetores.push(s); }
    s = difatIni; var vistosD = {}, porSetorD = tamSetor / 4 - 1;
    for (var k = 0; k < nDifat && s !== ENDOFCHAIN && s !== FREESECT; k++) {
      if (!setorOk(s) || vistosD[s]) return falha("cadeia DIFAT inválida");
      vistosD[s] = 1;
      var o = offSetor(s);
      for (i = 0; i < porSetorD && fatSetores.length < nFat; i++) { var fs = u32(b, o + i * 4); if (fs !== FREESECT) fatSetores.push(fs); }
      s = u32(b, o + porSetorD * 4);
    }
    if (fatSetores.length < nFat) return falha("a FAT declarada (" + nFat + " setores) não está toda no arquivo");
    /* ---- FAT ---- */
    var porSetor = tamSetor / 4, fat = new Uint32Array(fatSetores.length * porSetor);
    for (i = 0; i < fatSetores.length; i++) {
      if (!setorOk(fatSetores[i])) return falha("setor da FAT fora do arquivo");
      var of = offSetor(fatSetores[i]);
      for (var j = 0; j < porSetor; j++) fat[i * porSetor + j] = u32(b, of + j * 4);
    }
    function cadeia(ini, tabela, limite) {
      var out = [], vistos = {}, x = ini;
      while (x !== ENDOFCHAIN) {
        if (x === FREESECT || x === FATSECT || x === DIFSECT || x >= tabela.length || x >= limite) throw new Error("cadeia de setores quebrada (setor " + x + ")");
        if (vistos[x]) throw new Error("cadeia de setores em ciclo (setor " + x + ")");
        vistos[x] = 1; out.push(x); x = tabela[x];
      }
      return out;
    }
    function lerCadeia(ini, tamanho) {
      var sets = cadeia(ini, fat, nSetores), out = new Uint8Array(tamanho == null ? sets.length * tamSetor : tamanho), p = 0;
      for (var q = 0; q < sets.length && p < out.length; q++) {
        if (!setorOk(sets[q])) throw new Error("setor " + sets[q] + " fora do arquivo");
        var n = Math.min(tamSetor, out.length - p), o2 = offSetor(sets[q]);
        out.set(b.subarray(o2, o2 + n), p); p += n;
      }
      if (p < out.length) throw new Error("fluxo mais curto que o tamanho declarado");
      return out;
    }

    try {
      /* ---- diretório ---- */
      var dir = lerCadeia(dirIni, null), ents = [];
      for (var e = 0; e + 128 <= dir.length; e += 128) {
        var nl = u16(dir, e + 0x40), tipo = dir[e + 0x42], nome = "";
        for (var c = 0; c + 1 < Math.min(nl, 64) - 1; c += 2) nome += String.fromCharCode(u16(dir, e + c));
        var tamanho = u32(dir, e + 0x78) + (maior === 4 ? u32(dir, e + 0x7c) * 4294967296 : 0);
        ents.push({ nome: nome, tipo: tipo, esq: u32(dir, e + 0x44), dir: u32(dir, e + 0x48), filho: u32(dir, e + 0x4c), inicio: u32(dir, e + 0x74), tamanho: tamanho });
      }
      if (!ents.length || ents[0].tipo !== 5) return falha("o diretório do CFB não começa pela raiz");
      var raiz = ents[0];
      /* ---- mini-FAT e miniStream ---- */
      var miniFat = new Uint32Array(0), miniStream = new Uint8Array(0);
      if (nMiniFat && miniFatIni !== ENDOFCHAIN) {
        var mfb = lerCadeia(miniFatIni, null); miniFat = new Uint32Array(mfb.length / 4);
        for (i = 0; i < miniFat.length; i++) miniFat[i] = u32(mfb, i * 4);
      }
      if (raiz.inicio !== ENDOFCHAIN && raiz.tamanho > 0) miniStream = lerCadeia(raiz.inicio, raiz.tamanho);
      var nMini = Math.floor(miniStream.length / tamMini);
      function lerMini(ini, tamanho) {
        var sets = cadeia(ini, miniFat, nMini), out = new Uint8Array(tamanho), p = 0;
        for (var q = 0; q < sets.length && p < tamanho; q++) { var n = Math.min(tamMini, tamanho - p), o3 = sets[q] * tamMini; out.set(miniStream.subarray(o3, o3 + n), p); p += n; }
        if (p < tamanho) throw new Error("mini-fluxo mais curto que o tamanho declarado");
        return out;
      }
      /* ---- caminhos: árvore vermelho-preta de cada armazenamento, em ordem ---- */
      var entradas = [], porCaminho = {}, visitados = {};
      function andar(idx, pai, prof) {
        if (idx === FREESECT || idx >= ents.length) return;
        if (visitados[idx] || prof > 64) throw new Error("diretório do CFB em ciclo");
        visitados[idx] = 1;
        var en = ents[idx];
        andar(en.esq, pai, prof + 1);
        var cam = pai ? pai + "/" + en.nome : en.nome;
        if (en.tipo === 2 || en.tipo === 1) {
          var item = { caminho: cam, nome: en.nome, tipo: en.tipo === 1 ? "armazenamento" : "fluxo", tamanho: en.tamanho, _e: en };
          entradas.push(item); porCaminho[cam.toLowerCase()] = item;
          if (en.tipo === 1) andar(en.filho, cam, prof + 1);
        }
        andar(en.dir, pai, prof + 1);
      }
      andar(raiz.filho, "", 0);
      return {
        ok: true, versao: maior, tamanhoSetor: tamSetor,
        entradas: entradas.map(function (x) { return { caminho: x.caminho, nome: x.nome, tipo: x.tipo, tamanho: x.tamanho }; }),
        /* o conteúdo de um fluxo pelo caminho ("PartAtom", "Global/Latest"); null se não existe */
        fluxo: function (caminho) {
          var it = porCaminho[String(caminho || "").toLowerCase()];
          if (!it || it.tipo !== "fluxo") return null;
          var en2 = it._e;
          if (en2.tamanho === 0) return new Uint8Array(0);
          if (en2.tamanho > b.length * 2 + 1e6) throw new Error("fluxo \"" + it.caminho + "\" declara " + en2.tamanho + " bytes — maior que o arquivo");
          return en2.tamanho < corte ? lerMini(en2.inicio, en2.tamanho) : lerCadeia(en2.inicio, en2.tamanho);
        }
      };
    } catch (ex) { return falha("CFB inválido: " + ex.message); }
  }

  var Cfb = { ler: ler, ehCfb: ehCfb };
  global.Cfb = Cfb;
  if (typeof module !== "undefined" && module.exports) module.exports = Cfb;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
