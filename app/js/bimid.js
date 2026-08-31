/* =====================================================================
 * bimid.js — IDENTIDADE DURÁVEL DO ELEMENTO BIM
 *
 * O QUE ESTE ARQUIVO RESOLVE
 * Tudo que o produto guarda sobre uma peça do modelo — tarefa 4D, item de
 * orçamento, status de conflito, patologia — apontava para `expressID`, que é
 * o número da LINHA no arquivo IFC. Ele muda quando o projetista reexporta,
 * mesmo sem mudar nada no projeto. E o `uid` (`mid + ':' + expressID`) é pior:
 * `mid` é um handle do WASM (0, 1, 2…) atribuído na ordem em que os arquivos
 * foram abertos NAQUELA sessão — não sobrevive nem a fechar e reabrir o mesmo
 * arquivo na mesma ordem, se o usuário abrir um terceiro modelo antes.
 *
 * Resultado prático: o projetista manda a segunda versão do modelo — e ele
 * SEMPRE manda — e todo vínculo salvo aponta para a peça errada, ou para
 * nenhuma. Apontar para a peça errada é o pior dos dois: apaga do orçamento
 * uma coisa que existe e mantém outra que não.
 *
 * ⚠ A CORREÇÃO DE UMA CONTRADIÇÃO DO PLANO ORIGINAL
 * A especificação pedia `chave = hashDoConteúdoDoArquivo :: globalId`, e no
 * mesmo bloco exigia que "reexportar o IFC preserve os vínculos". As duas
 * coisas não podem ser verdade juntas: reexportar muda o conteúdo, muda o
 * hash, muda a chave — e quebra exatamente o que o bloco existe para proteger.
 *
 * São DUAS perguntas diferentes, e por isso dois identificadores:
 *
 *   modeloId   — o LUGAR na federação ("a estrutura desta obra"). Nasce uma
 *                vez, quando o arquivo entra na obra, e não muda quando chega
 *                versão nova. É o que ancora o vínculo.
 *   versaoId   — o hash do CONTEÚDO. Muda a cada reexportação, de propósito:
 *                é ele que invalida o cache e alimenta a comparação entre
 *                versões. Nunca entra na chave do elemento.
 *
 *   chave = modeloId + '::' + globalId
 *
 * ⚠ POR QUE PURO
 * É a âncora de tudo que o BIM salva. Âncora de dado salvo não pode ser código
 * sem teste, e `js/bim.js` não entra no gate.
 * ===================================================================== */
(function (global) {
  "use strict";

  var SEP = "::";
  var PREFIXO_SINTETICO = "ORC";   /* elemento criado no editor do OrçaPRO */

  function txt(s) { return String(s == null ? "" : s).trim(); }

  /* ---------------------------------------------------------------
   * versaoId — hash do CONTEÚDO do arquivo
   *
   * FNV-1a de 32 bits sobre uma AMOSTRA + o tamanho exato. Amostra, e não o
   * arquivo inteiro, porque IFC de obra tem 50–300 MB e varrer tudo em JS
   * trava a aba — o mesmo motivo pelo qual o parse foi para fora da linha
   * principal.
   *
   * ⚠ E A AMOSTRA É ESPALHADA, não só o começo. Dois exports do mesmo modelo
   * compartilham o cabeçalho inteiro (schema, autor, ferramenta) e diferem no
   * meio; amostrar só o início daria o MESMO hash para versões diferentes, e o
   * cache serviria geometria velha para um arquivo novo — o pior erro possível
   * aqui, porque é silencioso.
   *
   * ⚠ E POR QUE SÃO 64 BITS, E NÃO 32. Este valor deixou de ser só um carimbo
   * de versão: no B1 ele é a CHAVE do cache de geometria em IndexedDB. Colisão
   * aqui não é um número errado num painel — é servir a geometria de OUTRO
   * modelo achando que é este, sem erro nenhum na tela. Duas pistas FNV-1a
   * independentes (offsets diferentes) custam o mesmo laço e tiram a colisão
   * do terreno do plausível.
   * ------------------------------------------------------------- */
  function versaoId(bytes, tamanho) {
    var n = (typeof tamanho === "number" && tamanho >= 0)
      ? tamanho
      : (bytes && (bytes.length || bytes.byteLength)) || 0;
    /* duas pistas: mesmos bytes, constantes diferentes → 64 bits de saída */
    var h1 = 0x811c9dc5;                     /* offset basis FNV-1a padrão */
    var h2 = 0x01000193;                     /* segunda pista, offset próprio */
    function comer(b) {
      var x = b & 0xff;
      h1 ^= x;
      /* h *= 16777619, em 32 bits, sem estourar o double */
      h1 = (h1 + ((h1 << 1) + (h1 << 4) + (h1 << 7) + (h1 << 8) + (h1 << 24))) >>> 0;
      /* a segunda pista mistura a posição de forma diferente: sem isso ela
         seria uma função da primeira e os 64 bits seriam 32 disfarçados */
      h2 = (h2 ^ (x + 0x9e3779b9 + ((h2 << 6) >>> 0) + (h2 >>> 2))) >>> 0;
      h2 = (h2 + ((h2 << 1) + (h2 << 4) + (h2 << 7) + (h2 << 8) + (h2 << 24))) >>> 0;
    }
    /* o tamanho entra primeiro: dois arquivos com a mesma amostra e tamanhos
       diferentes não podem colidir */
    var t = n;
    for (var k = 0; k < 8; k++) { comer(t & 0xff); t = Math.floor(t / 256); }

    if (bytes && n > 0) {
      /* ⚠ O NÚMERO DE JANELAS ACOMPANHA O TAMANHO. Com 64 janelas fixas, um IFC
       * de 120 MB tinha 0,2% do conteúdo olhado — e uma edição por script que
       * não mude o tamanho (trocar um valor de pset por outro do mesmo
       * comprimento, acertar um carimbo) cai fora de todas as janelas e produz
       * o MESMO id. O cache então serve a geometria antiga para o arquivo novo,
       * calado. Uma janela a cada 256 KB não torna a colisão impossível — nada
       * aquém de ler o arquivo inteiro tornaria —, mas tira o caso realista do
       * terreno. Ler 120 MB em JS a cada abertura custaria mais do que a
       * decisão vale; o teto de 1024 janelas segura o custo em ~4 MB. */
      var TAM = 4096;
      var TRECHOS = Math.floor(n / 262144);
      if (TRECHOS < 64) TRECHOS = 64;
      if (TRECHOS > 1024) TRECHOS = 1024;
      var lidos = 0;
      for (var i = 0; i < TRECHOS; i++) {
        var ini = Math.floor((n - TAM) * (i / (TRECHOS - 1 || 1)));
        if (ini < 0) ini = 0;
        var fim = Math.min(ini + TAM, n);
        for (var p = ini; p < fim; p++) { comer(bytes[p]); lidos++; }
        if (fim >= n && ini === 0) break;    /* arquivo menor que um trecho */
      }
      /* arquivo pequeno: come tudo, não há por que amostrar */
      if (lidos === 0) for (var q = 0; q < n; q++) comer(bytes[q]);
    }
    /* o tamanho vai junto, legível: ajuda a diagnosticar e afasta colisão */
    return hex8(h1) + hex8(h2) + "-" + n.toString(36);
  }
  function hex8(h) {
    var s = (h >>> 0).toString(16);
    while (s.length < 8) s = "0" + s;
    return s;
  }

  /* ---------------------------------------------------------------
   * modeloId — o LUGAR do arquivo na federação da obra
   *
   * Precisa ser o mesmo na sessão de hoje e na de daqui a três meses, e
   * sobreviver a versão nova do arquivo. Por isso NÃO é o hash do conteúdo
   * (muda a cada export) nem o `mid` do WASM (é ordem de abertura).
   *
   * É derivado de `obraId` + nome do arquivo normalizado. Determinístico:
   * abrir "ESTRUTURA.ifc" na obra X dá sempre a mesma âncora, sem depender de
   * nada gravado — o que faz o B0 valer sozinho, antes de existir a federação
   * salva.
   *
   * ⚠ LIMITE CONHECIDO, E DECLARADO: renomear o arquivo muda o modeloId, e os
   * vínculos daquele modelo passam a apontar para um lugar que ninguém abre.
   * Não é perda de dado (nada é apagado), é vínculo órfão. O conserto é o
   * `bim_modelos` do B1: com a federação salva, o `modeloId` passa a ser um id
   * gravado uma vez, e renomear vira só trocar o rótulo. Até lá, a interface
   * deve avisar quando um modelo abre e nenhum vínculo casa.
   *
   * Normalização: sem caminho, sem extensão, sem acento, minúsculas, espaços
   * e pontuação viram "_". "Estrutura Bloco A.ifc" e "estrutura bloco a.IFC"
   * são o mesmo arquivo para quem trabalha — e passam a ser para o produto.
   * ------------------------------------------------------------- */
  function normalizarNome(nome) {
    var s = txt(nome);
    var barra = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
    if (barra >= 0) s = s.slice(barra + 1);
    s = s.replace(/\.ifc$/i, "");
    /* acento fora: o mesmo arquivo copiado por outro sistema pode chegar com
       a acentuação decomposta, e viraria outro modelo */
    if (s.normalize) s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
    s = s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return s;
  }
  function modeloId(obraId, nomeArquivo) {
    var o = txt(obraId), a = normalizarNome(nomeArquivo);
    if (!a) return "";
    return (o ? o : "sem_obra") + "/" + a;
  }

  /* ---------------------------------------------------------------
   * chave — o que se GRAVA
   * ------------------------------------------------------------- */
  function chave(modeloId, globalId) {
    var m = txt(modeloId), g = txt(globalId);
    if (!m || !g) return "";
    return m + SEP + g;
  }

  function parse(ch) {
    var s = txt(ch);
    var i = s.indexOf(SEP);
    if (i < 0) return null;
    var m = s.slice(0, i), g = s.slice(i + SEP.length);
    if (!m || !g) return null;
    return { modeloId: m, globalId: g };
  }

  /* ---------------------------------------------------------------
   * globalId sintético — para o que o OrçaPRO cria, e não veio de IFC
   *
   * Formato próprio com prefixo, para NUNCA colidir com GlobalId de arquivo
   * (que é base64 IFC de 22 caracteres). Se colidisse, uma peça desenhada aqui
   * herdaria o vínculo de uma peça do projetista.
   * ------------------------------------------------------------- */
  function sintetico(id) {
    var s = txt(id);
    return s ? (PREFIXO_SINTETICO + "_" + s) : "";
  }
  function ehSintetico(globalId) {
    return txt(globalId).indexOf(PREFIXO_SINTETICO + "_") === 0;
  }

  /* ---------------------------------------------------------------
   * doElemento — a regra única de "qual é a chave desta peça"
   *
   * ⚠ SEM GlobalId, DIZ QUE NÃO SABE. IFC de campo vem com linha corrompida, e
   * exportador ruim existe. A tentação é cair para `expressID` em silêncio —
   * e aí o vínculo é gravado parecendo estável, some na versão seguinte, e
   * ninguém sabe por quê. Aqui ele volta marcado `instavel: true`, para a tela
   * poder avisar que aquele vínculo não sobrevive.
   * ------------------------------------------------------------- */
  function doElemento(modeloId, el) {
    var m = txt(modeloId);
    var g = txt(el && el.globalId);
    if (m && g) return { chave: chave(m, g), globalId: g, instavel: false };
    var eid = (el && (el.id != null)) ? String(el.id) : "";
    if (!m || !eid) return { chave: "", globalId: "", instavel: true };
    /* último recurso, e declarado: expressID não sobrevive a reexportação */
    return { chave: m + SEP + "eid:" + eid, globalId: "", instavel: true };
  }

  /* ---------------------------------------------------------------
   * migrarUid — o dado que já está gravado
   *
   * `bim_edicoes` guarda `mid:expressID` em "removidos na edição". Migrar é
   * resolver o expressID para GlobalId NAQUELA abertura e regravar.
   *
   * ⚠ SÓ MIGRA SE O ARQUIVO FOR O MESMO. Se o conteúdo mudou, o expressID já
   * aponta para outra peça — e reaplicar "removido" na peça errada apagaria do
   * modelo (e do orçamento) uma coisa que o usuário quer. Na dúvida, devolve
   * `null` com motivo, para a tela pedir revínculo em vez de adivinhar.
   * ------------------------------------------------------------- */
  function migrarUid(uidAntigo, ctx) {
    var u = txt(uidAntigo);
    var i = u.indexOf(":");
    if (i < 0) return { ok: false, motivo: "uid sem separador" };
    var eid = u.slice(i + 1);
    if (!ctx || !txt(ctx.modeloId)) return { ok: false, motivo: "sem modelo de destino" };
    if (txt(ctx.versaoIdSalva) && txt(ctx.versaoIdAtual) && txt(ctx.versaoIdSalva) !== txt(ctx.versaoIdAtual)) {
      return { ok: false, motivo: "o arquivo mudou desde que o vínculo foi salvo — o expressID já aponta para outra peça" };
    }
    var g = ctx.gidPorExpressId && ctx.gidPorExpressId[eid];
    if (!txt(g)) return { ok: false, motivo: "expressID não existe mais neste modelo" };
    return { ok: true, chave: chave(ctx.modeloId, g), globalId: txt(g) };
  }

  var BimId = {
    SEP: SEP,
    modeloId: modeloId,
    normalizarNome: normalizarNome,
    PREFIXO_SINTETICO: PREFIXO_SINTETICO,
    versaoId: versaoId,
    chave: chave,
    parse: parse,
    sintetico: sintetico,
    ehSintetico: ehSintetico,
    doElemento: doElemento,
    migrarUid: migrarUid
  };

  global.BimId = BimId;
  if (typeof module !== "undefined" && module.exports) module.exports = BimId;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
