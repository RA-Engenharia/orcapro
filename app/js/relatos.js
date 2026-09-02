/* =====================================================================
 * relatos.js — FALAR COM O SUPORTE
 *
 * O cliente conta um problema que encontrou ou sugere uma melhoria. Uma
 * rotina horária lê o que chegou: problema vira fila de conserto; melhoria
 * vira uma mensagem no WhatsApp do Rogério, que decide se faz sentido.
 *
 * ⚠ A REGRA DE PRIVACIDADE, E POR QUE ELA É LISTA BRANCA
 *
 * A política de privacidade do OrçaPRO promete uma lista FECHADA do que sai
 * do aparelho, e diz com todas as letras que conteúdo de orçamento, de obra
 * e de cliente NÃO sai. Uma tela de suporte é exatamente onde isso vaza sem
 * ninguém querer: basta anexar "o estado da tela" ou o erro cru.
 *
 * Por isso o payload é MONTADO CAMPO A CAMPO, a partir de uma lista branca.
 * Não existe "manda o objeto e tira o que não pode" — filtro por exclusão
 * erra calado quando alguém acrescenta um campo novo lá na frente. Aqui, o
 * campo que ninguém escreveu explicitamente simplesmente não existe no que
 * viaja.
 *
 * O que vai: o tipo, o título, o texto QUE O CLIENTE ESCREVEU, o nome da
 * tela em que ele estava e a versão. Nada mais.
 * O que não vai, nem por acidente: orçamento, obra, cliente, colaborador,
 * CPF, PIX, valor, foto, e o despejo do armazenamento local.
 *
 * E vai SÓ NO CLIQUE dele, com a prévia do que será enviado na tela antes —
 * a política separa o que é automático do que é acionado, e isto é acionado.
 * ===================================================================== */
(function (global) {
  "use strict";

  function texto(s) { return String(s == null ? "" : s).trim(); }

  var TIPOS = { problema: "Problema que encontrei", melhoria: "Sugestão de melhoria" };

  var ESTADOS = {
    novo: { rotulo: "Recebido", cor: "#64748b", diz: "Chegou aqui. Vou olhar." },
    triado: { rotulo: "Em análise", cor: "#0284c7", diz: "Já foi lido e classificado." },
    "para-corrigir": { rotulo: "Na fila de conserto", cor: "#c2410c", diz: "Virou tarefa de correção." },
    "aguardando-decisao": { rotulo: "Em avaliação", cor: "#7c3aed", diz: "Está com a RA Engenharia para decidir." },
    aprovado: { rotulo: "Aprovado", cor: "#0891b2", diz: "Vai ser feito." },
    recusado: { rotulo: "Não vai ser feito", cor: "#6b7280", diz: "Foi avaliado e não entrou." },
    resolvido: { rotulo: "Pronto", cor: "#16a34a", diz: "Já está no sistema." }
  };
  function estadoDe(e) { return ESTADOS[e] || ESTADOS.novo; }

  /* --------------------------------------------------------------------
   * O PAYLOAD — lista branca, ponto final.
   * `ctx` é o que a tela sabe: { tela, versao }.
   * ------------------------------------------------------------------ */
  function montar(dados, ctx) {
    var d = dados || {}, c = ctx || {};
    return {
      tipo: d.tipo === "melhoria" ? "melhoria" : "problema",
      titulo: texto(d.titulo).slice(0, 120),
      texto: texto(d.texto).slice(0, 4000),
      /* nome da TELA, não o conteúdo dela — "orcamentos", não o orçamento */
      tela: texto(c.tela).slice(0, 40),
      versao: texto(c.versao).slice(0, 20)
    };
  }

  function validar(p) {
    p = p || {};
    if (!texto(p.texto)) return { ok: false, erro: "Escreva o que aconteceu." };
    if (texto(p.texto).length < 10) return { ok: false, erro: "Conte um pouco mais — com poucas palavras eu não consigo entender." };
    if (!texto(p.titulo)) return { ok: false, erro: "Dê um título curto ao seu relato." };
    return { ok: true };
  }

  /* A prévia que o cliente vê ANTES de enviar. Existe para a promessa da
     política ser verificável por ele, e não uma frase num documento. */
  function previa(p) {
    p = p || {};
    return [
      { campo: "Tipo", valor: TIPOS[p.tipo] || TIPOS.problema },
      { campo: "Título", valor: p.titulo || "—" },
      { campo: "O que você escreveu", valor: p.texto || "—" },
      { campo: "Tela em que você estava", valor: p.tela || "—" },
      { campo: "Versão do OrçaPRO", valor: p.versao || "—" }
    ];
  }

  /* --------------------------------------------------------------------
   * REDE. Tudo de fora (`d`) para testar sem navegador e sem servidor:
   *   d.url  d.licenca  d.buscar(fetch)
   * ------------------------------------------------------------------ */
  function _base(d) { return String((d && d.url) || "").replace(/\/$/, ""); }

  function enviar(p, d) {
    d = d || {};
    var base = _base(d), lic = String(d.licenca || "");
    if (!base || !lic || typeof d.buscar !== "function") {
      return Promise.resolve({ ok: false, erro: "Isto precisa de licença ativa e internet." });
    }
    var val = validar(p);
    if (!val.ok) return Promise.resolve({ ok: false, erro: val.erro });
    return d.buscar(base + "/api/relato", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-licenca": lic },
      body: JSON.stringify(p)
    }).then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.ok) return { ok: true, id: j.id };
        return { ok: false, erro: (j && j.erro) || "Não consegui enviar agora." };
      })
      .catch(function () { return { ok: false, erro: "Sem conexão com o servidor. Tente de novo daqui a pouco." }; });
  }

  function meus(d) {
    d = d || {};
    var base = _base(d), lic = String(d.licenca || "");
    if (!base || !lic || typeof d.buscar !== "function") return Promise.resolve({ itens: [] });
    return d.buscar(base + "/api/relato/meus?licenca=" + encodeURIComponent(lic))
      .then(function (r) { return r.json(); })
      .then(function (j) { return { itens: (j && j.itens) || [] }; })
      .catch(function () { return { itens: [], erro: true }; });
  }

  /* --------------------------------------------------------------------
   * O LADO DE CA: A FILA DE TODOS OS CLIENTES
   *
   * `meus` acima devolve o que a PROPRIA conta escreveu — e por meses foi so
   * isso que existiu. O resultado pratico: o cliente escrevia, o texto ficava
   * guardado no servidor, e nao havia caminho nenhum ate quem conserta. Um
   * cliente perguntou se o relato dele tinha sido visto e a resposta honesta
   * era "nao sei" — porque a unica forma de ler a fila era uma ferramenta de
   * linha de comando feita para o agente, nao para uma pessoa.
   *
   * ⚠ NENHUMA SENHA MORA AQUI. Quem manda e a licenca que a instalacao ja
   * tem; o servidor compara o e-mail dela com a lista de donos (que vive so
   * no config dele) e responde 401 para todo o resto. Isto e proposital: js/
   * inteira e copiada para o pacote de cada licenciado e para o PWA em URL
   * publica — segredo posto aqui vira segredo publicado.
   * ------------------------------------------------------------------ */

  /* estados que o dono pode aplicar, na ordem em que a decisao acontece */
  var ACOES = [
    { estado: "triado", rotulo: "Em análise" },
    { estado: "para-corrigir", rotulo: "Vou corrigir" },
    { estado: "aguardando-decisao", rotulo: "Em avaliação" },
    { estado: "aprovado", rotulo: "Vou fazer" },
    { estado: "resolvido", rotulo: "Pronto" },
    { estado: "recusado", rotulo: "Não vou fazer" }
  ];

  function fechado(i) { return i && (i.estado === "resolvido" || i.estado === "recusado"); }

  /* Ordem da tela: quem ESPERA HA MAIS TEMPO em cima.
     O instinto e por o mais recente primeiro, mas o relato que envelhece e
     justamente o que some — foi um de 16/08 que passou quinze dias parado
     enquanto o de ontem estava na cara. Fechado desce, e la embaixo o mais
     recente primeiro (historico se le de tras para frente). */
  function ordenar(itens) {
    return (itens || []).slice().sort(function (a, b) {
      var fa = fechado(a) ? 1 : 0, fb = fechado(b) ? 1 : 0;
      if (fa !== fb) return fa - fb;
      if (fa === 1) return (b.criadoEm || 0) - (a.criadoEm || 0);
      return (a.criadoEm || 0) - (b.criadoEm || 0);
    });
  }

  /* Dias de espera de um relato ABERTO. Fechado nao espera nada. */
  function esperaDias(i, agora) {
    if (!i || fechado(i)) return 0;
    var ms = (agora || Date.now()) - (i.criadoEm || 0);
    if (!(ms > 0)) return 0;
    return Math.floor(ms / 86400000);
  }

  /* O cartao de cima. `naoLidos` = ainda em "novo": chegou e ninguem tocou. */
  function resumo(itens, agora) {
    var r = { total: 0, abertos: 0, problemas: 0, melhorias: 0, naoLidos: 0, maisAntigoDias: 0 };
    (itens || []).forEach(function (i) {
      r.total++;
      if (fechado(i)) return;
      r.abertos++;
      if (i.tipo === "melhoria") r.melhorias++; else r.problemas++;
      if (i.estado === "novo") r.naoLidos++;
      var d = esperaDias(i, agora);
      if (d > r.maisAntigoDias) r.maisAntigoDias = d;
    });
    return r;
  }

  function fila(d, opc) {
    d = d || {}; opc = opc || {};
    var base = _base(d), lic = String(d.licenca || "");
    if (!base || !lic || typeof d.buscar !== "function") {
      return Promise.resolve({ ok: false, dono: false });
    }
    var qs = "?licenca=" + encodeURIComponent(lic);
    if (opc.estado) qs += "&estado=" + encodeURIComponent(opc.estado);
    return d.buscar(base + "/api/relato/fila" + qs)
      .then(function (r) {
        /* ⚠ 401 aqui NAO e erro para mostrar: e a resposta normal para quem
           nao e dono, ou seja, para 38 das 39 instalacoes. Tratar como falha
           faria a tela do cliente exibir "senha invalida" sem ele ter pedido
           nada. */
        if (r && r.status === 401) return { ok: false, dono: false };
        return r.json().then(function (j) {
          if (j && j.erro) return { ok: false, dono: false, erro: String(j.erro) };
          return { ok: true, dono: true, itens: ordenar((j && j.itens) || []) };
        });
      })
      .catch(function () { return { ok: false, dono: true, erro: "rede" }; });
  }

  function responder(d, dados) {
    d = d || {}; dados = dados || {};
    var base = _base(d), lic = String(d.licenca || "");
    if (!base || !lic || typeof d.buscar !== "function") {
      return Promise.resolve({ ok: false, erro: "Isto precisa de licença ativa e internet." });
    }
    var ids = (dados.ids || []).map(function (x) { return String(x); }).filter(function (x) { return !!x; });
    if (!ids.length) return Promise.resolve({ ok: false, erro: "Escolha o relato." });
    var corpo = { licenca: lic, ids: ids };
    if (dados.estado) corpo.estado = String(dados.estado);
    /* resposta vazia NAO viaja: mandar "" apagaria a que ja estava escrita,
       porque o servidor grava tudo que vier em `resposta`. Quem quiser
       limpar tem de mandar um espaco de proposito. */
    if (dados.resposta != null && String(dados.resposta) !== "") corpo.resposta = String(dados.resposta).slice(0, 1000);
    if (!corpo.estado && corpo.resposta == null) return Promise.resolve({ ok: false, erro: "Nada para mudar." });
    return d.buscar(base + "/api/relato/estado", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-licenca": lic },
      body: JSON.stringify(corpo)
    }).then(function (r) {
      if (r && r.status === 401) return { ok: false, erro: "Esta conta não responde relatos." };
      return r.json();
    }).then(function (j) {
      if (j && j.ok) return { ok: true, alterados: j.alterados || 0 };
      if (j && j.ok === false) return j;
      return { ok: false, erro: (j && j.erro) || "Não consegui gravar agora." };
    }).catch(function () { return { ok: false, erro: "Sem conexão com o servidor. Tente de novo daqui a pouco." }; });
  }

  var Relatos = {
    TIPOS: TIPOS, ESTADOS: ESTADOS, ACOES: ACOES, estadoDe: estadoDe,
    montar: montar, validar: validar, previa: previa, enviar: enviar, meus: meus,
    fila: fila, responder: responder, ordenar: ordenar, resumo: resumo,
    esperaDias: esperaDias, fechado: fechado
  };
  global.Relatos = Relatos;
  if (typeof module !== "undefined" && module.exports) module.exports = Relatos;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
