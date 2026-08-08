/* =====================================================================
 * triagem.js — A ANÁLISE DA FILA DE RELATOS
 *
 * Roda de hora em hora dentro do n8n. Lê o que os clientes mandaram e:
 *   - AGRUPA o que é a mesma coisa dita de jeitos diferentes;
 *   - MEDE gravidade pelo estrago descrito, não pelo tom;
 *   - separa PROBLEMA (fila de conserto) de MELHORIA (decisão do Rogério);
 *   - monta UMA mensagem de WhatsApp por rodada.
 *
 * ⚠ POR QUE DETERMINÍSTICO, E NÃO IA
 * Não existe chave de API disponível para o n8n hoje (o login do Claude Code
 * não serve para isso). Mas o motivo maior é outro: esta rotina decide o que
 * acorda o dono no WhatsApp. Um classificador que às vezes inventa vira ou
 * ruído — e ruído faz a pessoa parar de ler, justo no dia em que a mensagem
 * importava. Regra escrita é conferível e erra sempre do mesmo jeito.
 * Quando houver IA, ela entra NA FRENTE disto para reescrever o resumo, e
 * estas regras continuam sendo a rede embaixo.
 *
 * ⚠ E POR QUE UMA MENSAGEM POR RODADA, NUNCA UMA POR ITEM
 * Em julho uma automação mandou milhares de mensagens repetidas ao dono
 * porque cada item virava um envio e a marca de "já avisei" nunca fechava.
 * Aqui a rodada inteira vira UM texto. Se dez clientes escreverem na mesma
 * hora, chega uma mensagem com dez linhas — não dez mensagens.
 * ===================================================================== */
(function (global) {
  "use strict";

  function texto(s) { return String(s == null ? "" : s).trim(); }
  function normal(s) {
    return texto(s).normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  }

  /* palavras que não distinguem um relato do outro */
  var VAZIAS = ("a o e de da do em um uma para por com que nao sim os as dos das no na "
    + "ao aos quando onde como isso isto esse essa este esta ele ela eu voce meu minha "
    + "esta estao ser ter fazer fica ficou muito mais menos ja so tambem se mas").split(" ");

  function palavras(s) {
    return normal(s).split(" ").filter(function (p) { return p.length > 3 && VAZIAS.indexOf(p) === -1; });
  }

  /* Semelhança por palavras em comum (Jaccard). Simples de propósito: o que
     precisa acontecer é "cinco pessoas falaram da folha" virar um item só,
     não uma classificação semântica fina. */
  function semelhanca(a, b) {
    var pa = palavras(a), pb = palavras(b);
    if (!pa.length || !pb.length) return 0;
    var setB = {}; pb.forEach(function (p) { setB[p] = 1; });
    var comuns = 0, vistos = {};
    pa.forEach(function (p) { if (setB[p] && !vistos[p]) { comuns++; vistos[p] = 1; } });
    var uniao = {};
    pa.concat(pb).forEach(function (p) { uniao[p] = 1; });
    return comuns / Object.keys(uniao).length;
  }

  /* GRAVIDADE — pelo estrago, não pela emoção.
     "urgente!!!" não sobe nada; "sumiu o que eu tinha lançado" sobe tudo. */
  var GRAVE = [
    { re: /\b(sumiu|sumiram|perdi|perdeu|perdemos|apagou|apagado|desapareceu|zerou|zerado)\b/, peso: 3, por: "perda de dado" },
    { re: /\b(nao salva|nao salvou|nao grava|nao gravou|nao guarda)\b/, peso: 3, por: "não salva" },
    { re: /\b(valor errado|total errado|nao bate|conta errada|calculo errado|somando errado|a mais|a menos)\b/, peso: 3, por: "erro de dinheiro" },
    { re: /\b(nao abre|nao carrega|travou|travando|congelou|tela branca|fecha sozinho|nao entra)\b/, peso: 2, por: "sistema parado" },
    { re: /\b(erro|falha|bug|quebrou|deu problema)\b/, peso: 1, por: "erro relatado" },
    { re: /\b(lento|demora|devagar|travadinho)\b/, peso: 1, por: "lentidão" }
  ];
  function gravidade(t) {
    var n = normal(t), pontos = 0, motivos = [];
    GRAVE.forEach(function (g) { if (g.re.test(n)) { pontos += g.peso; motivos.push(g.por); } });
    return { pontos: pontos, motivos: motivos, nivel: pontos >= 3 ? "alta" : (pontos >= 1 ? "media" : "baixa") };
  }

  /* --------------------------------------------------------------------
   * AGRUPAR: junta o que é a mesma coisa. O grupo herda a maior gravidade
   * e conta quantas CONTAS distintas relataram — é a contagem de contas,
   * não de mensagens, que diz se o problema é geral ou de um usuário só.
   * ------------------------------------------------------------------ */
  function agrupar(itens, limiar) {
    var lim = typeof limiar === "number" ? limiar : 0.34;
    var grupos = [];
    (itens || []).forEach(function (i) {
      var assunto = texto(i.titulo) + " " + texto(i.texto);
      var achou = null;
      for (var g = 0; g < grupos.length; g++) {
        if (grupos[g].tipo !== i.tipo) continue;      // problema nunca agrupa com melhoria
        if (semelhanca(grupos[g].assunto, assunto) >= lim) { achou = grupos[g]; break; }
      }
      if (!achou) {
        achou = { tipo: i.tipo, assunto: assunto, titulo: texto(i.titulo) || texto(i.texto).slice(0, 60),
          itens: [], contas: {}, telas: {}, gravidade: { pontos: 0, motivos: [], nivel: "baixa" } };
        grupos.push(achou);
      }
      achou.itens.push(i);
      if (i.conta) achou.contas[i.conta] = 1;
      if (i.tela) achou.telas[i.tela] = 1;
      var g2 = gravidade(assunto);
      if (g2.pontos > achou.gravidade.pontos) achou.gravidade = g2;
    });
    grupos.forEach(function (g) {
      g.nContas = Object.keys(g.contas).length;
      g.nRelatos = g.itens.length;
      g.telasLista = Object.keys(g.telas).filter(Boolean);
      g.ids = g.itens.map(function (i) { return i.id; });
      /* mais gente relatando é sinal mais forte que um texto dramático */
      g.prioridade = g.gravidade.pontos + (g.nContas - 1) * 2;
    });
    return grupos.sort(function (a, b) { return b.prioridade - a.prioridade; });
  }

  /* --------------------------------------------------------------------
   * A RODADA. Devolve o que gravar de volta e o texto do WhatsApp.
   * `novos` = itens em estado "novo" vindos de /api/relato/fila.
   * ------------------------------------------------------------------ */
  function rodada(novos, opc) {
    var o = opc || {};
    var itens = (novos || []).filter(function (i) { return i && i.estado === "novo"; });
    var grupos = agrupar(itens);
    var problemas = grupos.filter(function (g) { return g.tipo === "problema"; });
    var melhorias = grupos.filter(function (g) { return g.tipo === "melhoria"; });

    return {
      houve: itens.length > 0,
      nItens: itens.length,
      problemas: problemas,
      melhorias: melhorias,
      /* o que marcar no servidor: problema entra direto na fila de conserto;
         melhoria fica esperando a decisão de gente */
      marcar: [
        { estado: "para-corrigir", ids: [].concat.apply([], problemas.map(function (g) { return g.ids; })) },
        { estado: "aguardando-decisao", ids: [].concat.apply([], melhorias.map(function (g) { return g.ids; })) }
      ].filter(function (m) { return m.ids.length; }),
      mensagem: mensagem(problemas, melhorias, o)
    };
  }

  /* UMA mensagem por rodada. Vazia quando não há nada — e quem chama tem de
     respeitar isso: mandar "nenhuma novidade" de hora em hora é como o
     alarme que toca todo dia, que ninguém mais escuta. */
  function mensagem(problemas, melhorias, o) {
    if (!problemas.length && !melhorias.length) return "";
    var L = [];
    L.push("*OrçaPRO — relatos dos clientes*");
    if (problemas.length) {
      var graves = problemas.filter(function (g) { return g.gravidade.nivel === "alta"; });
      L.push("");
      L.push("🐞 *" + problemas.length + " problema(s)* — já entraram na fila de conserto"
        + (graves.length ? ", " + graves.length + " grave(s)" : "") + ":");
      problemas.slice(0, 8).forEach(function (g) {
        L.push("• " + (g.gravidade.nivel === "alta" ? "‼️ " : "") + g.titulo
          + (g.nContas > 1 ? "  (" + g.nContas + " clientes)" : "")
          + (g.gravidade.motivos.length ? "  [" + g.gravidade.motivos[0] + "]" : ""));
      });
      if (problemas.length > 8) L.push("• …e mais " + (problemas.length - 8));
    }
    if (melhorias.length) {
      L.push("");
      L.push("💡 *" + melhorias.length + " sugestão(ões)* — *você decide se faz sentido*:");
      melhorias.slice(0, 8).forEach(function (g, i) {
        L.push("");
        L.push((i + 1) + ") " + g.titulo + (g.nContas > 1 ? "  (" + g.nContas + " clientes pediram)" : ""));
        L.push("   _" + texto(g.itens[0].texto).slice(0, 220).replace(/\n+/g, " ") + "_");
      });
      if (melhorias.length > 8) L.push("");
      if (melhorias.length > 8) L.push("…e mais " + (melhorias.length - 8) + " sugestão(ões) na fila.");
      L.push("");
      L.push("Responda dizendo quais fazem sentido e como quer o texto — eu passo para programar.");
    }
    if (o.painel) { L.push(""); L.push(o.painel); }
    return L.join("\n");
  }

  var Triagem = {
    normal: normal, palavras: palavras, semelhanca: semelhanca,
    gravidade: gravidade, agrupar: agrupar, rodada: rodada, mensagem: mensagem
  };
  global.Triagem = Triagem;
  if (typeof module !== "undefined" && module.exports) module.exports = Triagem;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
