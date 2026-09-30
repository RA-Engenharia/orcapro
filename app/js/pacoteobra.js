/* =====================================================================
 * pacoteobra.js — o PACOTE DA OBRA (motor puro, sem tela)
 *
 * Um arquivo .json gerado junto com o modelo IFC que traz, de uma vez, o
 * que o projeto preparou para a obra:
 *   • vistas   — pontos de vista pré-configurados (câmera, cortes, peças
 *                por GlobalId, cores, cotas), em pastas, com o desenho
 *                original do projetista de cada uma;
 *   • pranchas — as folhas do projeto (A1…A4) e o PDF;
 *   • sondagens — o boletim SPT completo e o relatório em PDF;
 *   • detalhes — a ficha de cada peça pelo carimbo OrcaPRO_Detalhe (o que
 *                o "Detalhe da peça" abre quando não há projeto de concreto);
 *   • imagens / arquivos — o que mora no IndexedDB (recortes, PDFs).
 *
 * O ARQUIVO DA OBRA (.zip) leva o pacote e o modelo .ifc juntos: um arquivo
 * só, para mandar no grupo da obra — quem recebe abre e o sistema abre o
 * modelo e importa o resto (lerObraCompleta).
 *
 * ⚠ VALIDA ANTES DE GRAVAR. Arquivo de outra obra, de outro modelo ou
 *   truncado não pode entrar pela metade: a tela mostra o resumo, a pessoa
 *   confirma, e só então grava. Reimportar o mesmo pacote ATUALIZA (casa
 *   por origemId/id), não duplica.
 * ⚠ Nada de dado de cliente mora aqui: o pacote é da obra e entra na conta.
 * ===================================================================== */
(function (global) {
  'use strict';
  var TIPO = 'orcapro-pacote-obra';

  function txt(v) { return v == null ? '' : String(v); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function tamanhoDataUrl(s) { var i = txt(s).indexOf(','); return i < 0 ? 0 : Math.floor((s.length - i - 1) * 3 / 4); }

  function validar(p) {
    var erros = [], avisos = [];
    if (!p || typeof p !== 'object') return { ok: false, erros: ['o arquivo não é um pacote (JSON vazio ou inválido)'], avisos: [], resumo: null };
    if (p.tipo !== TIPO) erros.push('o arquivo não é um pacote da obra do OrçaPRO (tipo "' + txt(p.tipo) + '")');
    if (!(p.versao >= 1)) erros.push('versão do pacote ausente');
    var vistas = arr(p.vistas), pranchas = arr(p.pranchas), sond = arr(p.sondagens);
    var imgs = p.imagens && typeof p.imagens === 'object' ? p.imagens : {}, arqs = p.arquivos && typeof p.arquivos === 'object' ? p.arquivos : {};
    var bytes = 0; Object.keys(imgs).forEach(function (k) { bytes += tamanhoDataUrl(imgs[k]); });
    Object.keys(arqs).forEach(function (k) { bytes += Math.floor(txt(arqs[k] && arqs[k].base64).length * 3 / 4); });
    // referências quebradas: a vista aponta desenho que o pacote não trouxe
    var refs = 0, refsFaltando = 0;
    vistas.forEach(function (v) { if (v && v.referencia && v.referencia.chave) { refs++; if (!imgs[v.referencia.chave] && !arqs[v.referencia.chave]) refsFaltando++; } });
    if (refsFaltando) avisos.push(refsFaltando + ' vista(s) apontam um desenho que não veio no pacote — elas abrem sem o desenho original');
    var semNome = vistas.filter(function (v) { return !v || !txt(v.nome).trim(); }).length;
    if (semNome) avisos.push(semNome + ' vista(s) sem nome — ficam de fora');
    var pastas = {}; vistas.forEach(function (v) { if (v && v.pasta) pastas[txt(v.pasta)] = 1; });
    var folhas = 0; pranchas.forEach(function (pr) { folhas += arr(pr && pr.folhas).length; });
    var dets = detalhes(p), brutos = arr(p.detalhes).filter(function (d) { return !!chaveDetalhe(d && d.chave); }).length;
    if (brutos > dets.length) avisos.push((brutos - dets.length) + ' ficha(s) de detalhe repetem o carimbo de outra — vale a última');
    var detSemDesenho = dets.filter(function (f) { return f.desenho && !imgs[f.desenho] && !arqs[f.desenho]; }).length;
    if (detSemDesenho) avisos.push(detSemDesenho + ' ficha(s) de detalhe apontam um desenho que não veio no pacote — abrem sem o desenho');
    if (!vistas.length && !pranchas.length && !sond.length && !dets.length) erros.push('o pacote não traz vistas, pranchas, sondagem nem fichas de detalhe');
    return {
      ok: !erros.length, erros: erros, avisos: avisos,
      resumo: { nome: txt(p.nome), modelo: txt(p.modelo && p.modelo.arquivo), revisao: txt(p.modelo && p.modelo.revisao),
                vistas: vistas.length - semNome, pastas: Object.keys(pastas).length, referencias: refs,
                pranchas: pranchas.length, folhas: folhas, sondagens: sond.length, detalhes: dets.length,
                imagens: Object.keys(imgs).length, arquivos: Object.keys(arqs).length, megabytes: Math.round(bytes / 1048576 * 10) / 10 }
    };
  }

  /* quantos GlobalIds do pacote existem no modelo aberto — o sinal de que é o
     modelo certo (o pacote da R09 sobre a R06 acharia metade das peças) */
  function conferirModelo(p, temGid) {
    var todos = {}, n = 0, achados = 0;
    arr(p && p.vistas).forEach(function (v) {
      var vis = (v && v.visibilidade) || {};
      [vis.isolados, vis.ocultos, vis.raioXAlvo].forEach(function (l) { arr(l).forEach(function (g) { todos[g] = 1; }); });
      arr(v && v.aparencias).forEach(function (a) { if (a && a.gid) todos[a.gid] = 1; });
    });
    Object.keys(todos).forEach(function (g) { n++; if (temGid(g)) achados++; });
    return { total: n, achados: achados, fracao: n ? achados / n : 1 };
  }

  /* upsert: o registro novo herda o id do que já existe com a mesma origem */
  function casar(existentes, novos, chave) {
    var mapa = {};
    arr(existentes).forEach(function (e) { var k = txt(e && e[chave]); if (k) mapa[k] = e; });
    var atualizados = 0, criados = 0;
    var out = arr(novos).map(function (n) {
      var k = txt(n && n[chave]), velho = k ? mapa[k] : null;
      if (velho) { atualizados++; n.id = velho.id; if (velho.miniatura && !n.miniatura) n.miniatura = velho.miniatura; if (velho.comentarios && velho.comentarios.length && !(n.comentarios && n.comentarios.length)) n.comentarios = velho.comentarios; }
      else criados++;
      return n;
    });
    return { registros: out, atualizados: atualizados, criados: criados };
  }

  function base64ParaBytes(b64) {
    var s = txt(b64).replace(/^data:[^,]*,/, '');
    if (typeof atob === 'function') {
      var bin = atob(s), u = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return u;
    }
    return typeof Buffer !== 'undefined' ? new Uint8Array(Buffer.from(s, 'base64')) : null;
  }

  /* ---------------------------------------------------------------
   * FICHAS DE DETALHE — o "Detalhe da peça" de quem não tem projeto de
   * concreto (estaca de madeira, painel de wood frame, ligação metálica).
   *
   * O pacote traz `detalhes`: uma ficha por carimbo OrcaPRO_Detalhe — a
   * MESMA chave que o gerador do modelo grava na peça — com as linhas do
   * cálculo, o desenho, a vista do pacote que a mostra e a folha da prancha.
   *
   * ⚠ CASA POR CARIMBO, NUNCA POR SEMELHANÇA: a ficha "E1-1" abre para a
   *   peça carimbada "E1-1"; a "E1-10" não é a "E1-1". Só maiúscula/minúscula
   *   e espaço repetido são ignorados (o carimbo vem digitado no Revit).
   * ------------------------------------------------------------- */
  function chaveDetalhe(s) { return txt(s).replace(/\s+/g, ' ').replace(/^ | $/g, '').toUpperCase(); }
  function detalhes(p) {
    var out = [], vistos = {};
    arr(p && p.detalhes).forEach(function (d) {
      var ch = chaveDetalhe(d && d.chave);
      if (!ch) return;
      var pr = d.prancha && d.prancha.pdf ? { pdf: txt(d.prancha.pdf), pagina: Math.max(1, Math.floor(+d.prancha.pagina) || 1), rotulo: txt(d.prancha.rotulo) } : null;
      var f = { chave: ch, carimbo: txt(d.chave).trim(), titulo: txt(d.titulo).trim() || txt(d.chave).trim(), subtitulo: txt(d.subtitulo),
                grupo: txt(d.grupo), vista: txt(d.vista), desenho: txt(d.desenho), rotuloDesenho: txt(d.rotuloDesenho), prancha: pr,
                linhas: arr(d.linhas).filter(function (l) { return Array.isArray(l) && l.length >= 2 && txt(l[0]).trim(); })
                  .map(function (l) { return [txt(l[0]), txt(l[1])]; }),
                avisos: arr(d.avisos).map(txt).filter(function (a) { return !!a.trim(); }) };
      /* carimbo repetido: vale a ÚLTIMA ficha (a do gerador mais novo), e o
         validar conta — duas fichas para a mesma peça é erro de quem gerou */
      if (vistos[ch] != null) out[vistos[ch]] = f; else { vistos[ch] = out.length; out.push(f); }
    });
    return out;
  }
  function mapaDetalhes(lista) { var m = {}; arr(lista).forEach(function (f) { if (f && f.chave) m[f.chave] = f; }); return m; }
  function ficha(mapa, carimbo) { var ch = chaveDetalhe(carimbo); return ch && mapa && mapa[ch] ? mapa[ch] : null; }

  /* ---------------------------------------------------------------
   * O ARQUIVO ÚNICO DA OBRA (.zip) — pacote.json + o modelo .ifc
   *
   * É o que se manda no grupo da obra: quem recebe abre UM arquivo e o
   * sistema abre o modelo e importa vistas, pranchas, sondagem e fichas.
   *
   * ⚠ zipLer e inflar são INJETADOS (o mesmo acordo do js/bimbcf.js): o
   *   motor fica testável no Node e o produto não vendoriza biblioteca de zip.
   * ⚠ O MODELO DO .ZIP TEM DE SER O DO PACOTE. O pacote aponta peças por
   *   GlobalId de UMA revisão; .zip com o .ifc de outra revisão acharia
   *   metade das peças — recusa aqui, antes de abrir 25 MB de modelo.
   * ------------------------------------------------------------- */
  function ehZip(bytes) {
    var b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    return b.length > 22 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4;
  }
  function utf8(b) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(b);
    if (typeof Buffer !== 'undefined') return Buffer.from(b).toString('utf8');
    throw new Error('este navegador não decodifica texto (TextDecoder)');
  }
  function nomeBase(s) { var t = txt(s), i = Math.max(t.lastIndexOf('/'), t.lastIndexOf('\\')); return i >= 0 ? t.slice(i + 1) : t; }
  function lerObraCompleta(bytes, opts) {
    opts = opts || {};
    var zipLer = opts.zipLer || (global.BimBcf && global.BimBcf.zipLer);
    if (typeof zipLer !== 'function') return Promise.reject(new Error('o leitor de .zip não carregou nesta tela — recarregue o app'));
    if (!ehZip(bytes)) return Promise.reject(new Error('o arquivo não é um .zip'));
    return zipLer(bytes, { inflar: opts.inflar })['catch'](function (e) {
      /* a mensagem do leitor fala de .bcfzip (é o dono dele); aqui é o arquivo da obra.
         ⚠ "download pela metade" só quando o índice/entrada está quebrado — navegador sem
           descompressão NÃO é arquivo ruim, e mandar baixar de novo seria recado que mente */
      var m = txt(e && e.message).replace(/\.bcfzip/g, '.zip');
      if (/índice|corrompid|não é um arquivo/.test(m)) throw new Error('o .zip está incompleto ou corrompido — o download terminou? (' + m + ')');
      throw new Error('não consegui abrir o .zip: ' + m);
    }).then(function (arqs) {
      var nomes = Object.keys(arqs).filter(function (n) { return !/\/$/.test(n) && !/(^|\/)__MACOSX\//.test(n); });
      var jsons = nomes.filter(function (n) { return /\.json$/i.test(n); });
      var ifcs = nomes.filter(function (n) { return /\.ifc$/i.test(n); });
      if (!jsons.length) throw new Error('o .zip não traz o pacote da obra (.json)');
      if (jsons.length > 1) throw new Error('o .zip traz ' + jsons.length + ' arquivos .json — o arquivo da obra leva um pacote só');
      if (ifcs.length > 1) throw new Error('o .zip traz ' + ifcs.length + ' modelos .ifc — o pacote é de um modelo só');
      var p;
      try { p = JSON.parse((opts.decodificar || utf8)(arqs[jsons[0]])); } catch (e) { throw new Error('o pacote dentro do .zip não é um JSON válido (' + txt(e && e.message) + ')'); }
      var ifc = ifcs.length ? { nome: nomeBase(ifcs[0]), bytes: arqs[ifcs[0]] } : null;
      var esperado = nomeBase(p && p.modelo && p.modelo.arquivo);
      if (ifc && esperado && esperado.toLowerCase() !== ifc.nome.toLowerCase())
        throw new Error('o pacote é do modelo "' + esperado + '" e o .zip traz "' + ifc.nome + '" — gere o arquivo da obra de novo');
      return { pacote: p, ifc: ifc };
    });
  }
  /* o modelo do pacote já está aberto no visualizador? (pelo nome do arquivo,
     sem pasta e sem caixa — é o nome que o visualizador guarda) */
  function modeloAberto(arquivo, abertos) {
    var alvo = nomeBase(arquivo).toLowerCase();
    return !!alvo && arr(abertos).some(function (n) { return nomeBase(n).toLowerCase() === alvo; });
  }

  var PacoteObra = { TIPO: TIPO, validar: validar, conferirModelo: conferirModelo, casar: casar, base64ParaBytes: base64ParaBytes,
                     chaveDetalhe: chaveDetalhe, detalhes: detalhes, mapaDetalhes: mapaDetalhes, ficha: ficha,
                     ehZip: ehZip, lerObraCompleta: lerObraCompleta, modeloAberto: modeloAberto };
  global.PacoteObra = PacoteObra;
  if (typeof module !== 'undefined' && module.exports) module.exports = PacoteObra;
})(typeof window !== 'undefined' ? window : this);
