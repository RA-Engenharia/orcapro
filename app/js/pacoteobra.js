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
 *   • imagens / arquivos — o que mora no IndexedDB (recortes, PDFs).
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
    if (!vistas.length && !pranchas.length && !sond.length) erros.push('o pacote não traz vistas, pranchas nem sondagem');
    return {
      ok: !erros.length, erros: erros, avisos: avisos,
      resumo: { nome: txt(p.nome), modelo: txt(p.modelo && p.modelo.arquivo), revisao: txt(p.modelo && p.modelo.revisao),
                vistas: vistas.length - semNome, pastas: Object.keys(pastas).length, referencias: refs,
                pranchas: pranchas.length, folhas: folhas, sondagens: sond.length,
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

  var PacoteObra = { TIPO: TIPO, validar: validar, conferirModelo: conferirModelo, casar: casar, base64ParaBytes: base64ParaBytes };
  global.PacoteObra = PacoteObra;
  if (typeof module !== 'undefined' && module.exports) module.exports = PacoteObra;
})(typeof window !== 'undefined' ? window : this);
