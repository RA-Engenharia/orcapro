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

  var Relatos = {
    TIPOS: TIPOS, ESTADOS: ESTADOS, estadoDe: estadoDe,
    montar: montar, validar: validar, previa: previa, enviar: enviar, meus: meus
  };
  global.Relatos = Relatos;
  if (typeof module !== "undefined" && module.exports) module.exports = Relatos;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
