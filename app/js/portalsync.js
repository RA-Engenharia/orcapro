/* =====================================================================
 * portalsync.js — A OBRA PUBLICADA SE ATUALIZA SOZINHA
 *
 * POR QUE EXISTE: a v1.1.184 deu ao Portal do Cliente projeção de término,
 * marcos, galeria, documentos, posição financeira e relatórios. Nada disso
 * apareceu para ninguém — porque o Portal mostra o RETRATO que ficou no
 * servidor na última publicação, e 12 das 13 obras publicadas tinham retrato
 * de semanas antes. O recurso estava no ar e invisível.
 *
 * Pior: o dono do sistema não tinha como consertar as obras dos OUTROS
 * clientes licenciados — os dados deles moram nas máquinas deles. Ou cada
 * engenheiro lembrava de clicar "Publicar", ou o painel novo simplesmente
 * não existia para o cliente final. Passo que depende de alguém lembrar é
 * passo que não acontece: foi assim que o `latest.json` ficou 14 versões
 * parado e o instalador 8.
 *
 * ------------------------------------------------------------------
 * AS QUATRO REGRAS
 *
 * 1) SÓ REPUBLICA O QUE JÁ FOI PUBLICADO. `portalUser` é a condição. Este
 *    módulo nunca publica uma obra nova — publicar é decisão de quem
 *    escolhe o que o cliente vai ver, e essa decisão não se automatiza.
 *
 * 2) UMA VEZ POR VERSÃO. A marca é a versão do app que gerou o retrato.
 *    Igual = nada a fazer. Sem marca = retrato anterior a este mecanismo,
 *    republica. Isso torna a operação idempotente: reabrir o app dez vezes
 *    não gera dez publicações.
 *
 * 3) ⚠ A PROJEÇÃO DE TÉRMINO NÃO ENTRA SOZINHA. Ela nasce DESLIGADA aqui,
 *    e só liga quando alguém abriu a tela de publicar e decidiu. O motivo
 *    não é técnico: uma data de término no portal do cliente pode ser lida
 *    como compromisso, e quem conhece o contrato — e a multa por atraso — é
 *    o engenheiro daquela obra, não o programa nem o dono do sistema. Ligar
 *    isso na obra de um cliente licenciado, sem ele saber, seria decidir
 *    sobre um contrato que não é nosso.
 *
 * 4) FALHA NÃO VIRA LAÇO. Tentativa que não confirma NÃO marca a versão
 *    (para tentar de novo depois), mas conta — e depois de MAX_TENTATIVAS a
 *    obra é desistida até a próxima versão. Sem isso, uma obra grande demais
 *    para o envio ficaria tentando para sempre, a cada abertura do app. É a
 *    mesma lição das ~5.500 mensagens repetidas.
 * ===================================================================== */
(function (global) {
  "use strict";

  var MAX_TENTATIVAS = 3;
  /* teto por rodada: uma conta com 40 obras publicadas não pode disparar 40
     envios de ~1 MB ao abrir o app. O resto entra na próxima abertura. */
  var MAX_POR_RODADA = 5;

  function texto(s) { return String(s == null ? "" : s).trim(); }

  /* -------------------------------------------------------------------
   * A obra precisa ser republicada?
   * Devolve { precisa, motivo } — motivo serve para o log e para a tela.
   * ----------------------------------------------------------------- */
  function precisa(obra, versao) {
    var o = obra || {};
    if (!texto(o.portalUser)) return { precisa: false, motivo: "nunca-publicada" };
    if (!texto(versao)) return { precisa: false, motivo: "sem-versao" };
    var marca = texto(o.portalVersao);
    if (marca === texto(versao)) return { precisa: false, motivo: "em-dia" };
    var t = Number(o.portalSyncTentativas || 0);
    /* as tentativas contam POR VERSÃO: versão nova zera a paciência, porque
       o que falhou antes pode muito bem passar agora */
    if (texto(o.portalSyncVersaoTentada) === texto(versao) && t >= MAX_TENTATIVAS) {
      return { precisa: false, motivo: "desistiu", tentativas: t };
    }
    return { precisa: true, motivo: marca ? "versao-antiga" : "sem-marca", de: marca || "(desconhecida)" };
  }

  /* Quais obras entram nesta rodada, na ordem em que devem ir.
     Mais recém-publicadas primeiro: são as que alguém está olhando. */
  function fila(obras, versao, opc) {
    var o = opc || {};
    var teto = o.maxPorRodada || MAX_POR_RODADA;
    var lista = (obras || []).filter(function (ob) { return precisa(ob, versao).precisa; });
    lista.sort(function (a, b) {
      return String(b.portalPublicadoEm || "").localeCompare(String(a.portalPublicadoEm || ""));
    });
    return { fila: lista.slice(0, teto), total: lista.length, sobraram: Math.max(0, lista.length - teto) };
  }

  /* -------------------------------------------------------------------
   * ⚠ A PROJEÇÃO NÃO ENTRA SOZINHA (regra 3).
   *
   * `true` só quando alguém gravou `true` de propósito — o que só acontece
   * ao publicar pela tela, que é onde a escolha é apresentada com o aviso
   * de que projeção pode ser lida como compromisso.
   * `undefined` (nunca decidido) e `false` valem DESLIGADO.
   * ----------------------------------------------------------------- */
  function mostrarPrevisao(obra) {
    return (obra || {}).portalPrevisao === true;
  }

  /* marcas gravadas na obra, sem mutar o registro original */
  function marcarSucesso(obra, versao, quando) {
    var o = obra || {};
    o.portalVersao = texto(versao);
    o.portalPublicadoEm = quando || o.portalPublicadoEm || "";
    o.portalSyncTentativas = 0;
    o.portalSyncVersaoTentada = "";
    return o;
  }
  function marcarFalha(obra, versao) {
    var o = obra || {};
    /* NÃO grava portalVersao: é isso que permite tentar de novo. */
    if (texto(o.portalSyncVersaoTentada) !== texto(versao)) {
      o.portalSyncVersaoTentada = texto(versao);
      o.portalSyncTentativas = 0;
    }
    o.portalSyncTentativas = Number(o.portalSyncTentativas || 0) + 1;
    o.portalSyncDesistiu = o.portalSyncTentativas >= MAX_TENTATIVAS;
    return o;
  }

  /* A frase que o engenheiro lê depois da rodada. Diz o que foi feito E o
     que NÃO foi — a projeção desligada precisa ser dita, senão ele nunca
     descobre que existe. */
  function recado(res) {
    var r = res || {};
    var n = Number(r.ok || 0), f = Number(r.falhou || 0), s = Number(r.sobraram || 0);
    if (!n && !f) return "";
    var p = [];
    if (n) p.push(n + " obra(s) tiveram o Portal do cliente atualizado com os blocos novos");
    if (f) p.push(f + " não conseguiram subir agora (tenta de novo na próxima abertura)");
    if (s) p.push(s + " ficaram para a próxima rodada");
    return p.join(" · ") + ". A <b>projeção de término</b> continua desligada nessas obras — abra <b>Portal do cliente</b> na obra para decidir se o seu cliente deve vê-la.";
  }

  var PortalSync = {
    MAX_TENTATIVAS: MAX_TENTATIVAS, MAX_POR_RODADA: MAX_POR_RODADA,
    precisa: precisa, fila: fila, mostrarPrevisao: mostrarPrevisao,
    marcarSucesso: marcarSucesso, marcarFalha: marcarFalha, recado: recado
  };
  global.PortalSync = PortalSync;
  if (typeof module !== "undefined" && module.exports) module.exports = PortalSync;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
