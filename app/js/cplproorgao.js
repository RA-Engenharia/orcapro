/* =====================================================================
 * cplproorgao.js — CPLPRO: CADASTRO DO ÓRGÃO e PADRÕES DE ROTINA (motor PURO).
 *
 * PURO: sem DOM, sem Store, sem rede. A tela (js/cplproui.js, aba «Órgão») lê e grava o registro; aqui mora só a decisão testável.
 *
 * O CADASTRO É UM SÓ POR CONTA. Os dados administrativos que o modelo oficial (AGU/SEGES) deixa em branco para o órgão
 * (endereço, e-mail de impugnação, setor, representante, foro, portal, cadastro de fornecedores) eram redigitados em TODO processo.
 * Aqui são cadastrados uma vez e entram em cada processo com o selo «sugerido — confira» (mesmo mecanismo do índice de reajuste:
 * `p.preparo.campos[caminho]` guarda o que o sistema escreveu; o que a pessoa editou não é sobrescrito — ver cplpropreparo.js).
 *
 * OS PADRÕES DE ROTINA (`padroes`) são o que o órgão repete em todo edital: hora da sessão, modo de disputa, intervalo de lances,
 * multas, prazos de resposta, habilitação, vigência. Cada um é só SUGESTÃO (selo + «Por quê?»).
 *   ⚠ NUNCA INVENTA. Só entram os valores pedidos pelo Rogério em 13/11/2026 e artigos da Lei 14.133 que o próprio módulo já cita
 *   (cplprohab.js: art. 66 jurídica, 67 técnica, 68 fiscal/social/trabalhista, 69 econômico-financeira; cplprodocs.js: «arts. 62 a 70»).
 * ES5 puro.
 * ===================================================================== */
(function (global) {
  "use strict";

  var ENTIDADE = "cplpro_orgao", ID = "orgao";

  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function trim(s) { return String(s === null || s === undefined ? "" : s).replace(/^\s+|\s+$/g, ""); }
  function vazio(v) { return trim(v) === ""; }

  /* o cadastro: `obrig` = sem ele alguma minuta sai com [PREENCHER] (timbrado não: é só o cabeçalho do documento) */
  var CAMPOS = [
    { id: "enderecoOrgao", grupo: "Órgão", rotulo: "Endereço completo (sede)", dica: "Rua, número, bairro, cidade/UF e CEP", obrig: true },
    { id: "emailImpugnacao", grupo: "Órgão", rotulo: "E-mail para impugnação e pedido de esclarecimento", dica: "e-mail oficial do setor de licitações", obrig: true, tipo: "email" },
    { id: "setorNome", grupo: "Setor de licitações", rotulo: "Setor responsável pelas licitações", dica: "Ex.: Comissão Permanente de Licitação", obrig: true },
    { id: "setorSala", grupo: "Setor de licitações", rotulo: "Sala / andar", dica: "", obrig: false },
    { id: "setorTelefone", grupo: "Setor de licitações", rotulo: "Telefone do setor", dica: "(00) 0000-0000", obrig: false },
    { id: "representanteNome", grupo: "Representante legal", rotulo: "Nome do representante legal do contratante", dica: "", obrig: true },
    { id: "representanteCargo", grupo: "Representante legal", rotulo: "Cargo", dica: "Ex.: Prefeito Municipal", obrig: true },
    { id: "representanteAto", grupo: "Representante legal", rotulo: "Ato de nomeação", dica: "Ex.: Termo de posse de 01/01/2025", obrig: true },
    { id: "foro", grupo: "Contrato", rotulo: "Foro (comarca)", dica: "Ex.: Foro da Comarca de ...", obrig: true },
    { id: "portalNome", grupo: "Portal de disputa", rotulo: "Portal / plataforma eletrônica", dica: "Ex.: Compras.gov.br", obrig: true },
    { id: "portalUrl", grupo: "Portal de disputa", rotulo: "Endereço (URL) do portal", dica: "https://...", obrig: true, tipo: "url" },
    { id: "cadastro", grupo: "Cadastro de fornecedores", rotulo: "Cadastro de fornecedores", tipo: "select", opcoes: [["sicaf", "SICAF (Compras.gov.br)"], ["proprio", "Cadastro próprio do órgão"]], obrig: true },
    { id: "cadastroProprio", grupo: "Cadastro de fornecedores", rotulo: "Nome do cadastro próprio", dica: "Só se for cadastro próprio", obrig: false, quando: function (o) { return o && o.cadastro === "proprio"; } }
  ];

  function exige(c, o) { return c.obrig || (c.id === "cadastroProprio" && o && o.cadastro === "proprio"); }

  function novo(dados) {
    var o = { id: ID, timbrado: null };
    CAMPOS.forEach(function (c) { o[c.id] = ""; });
    if (dados) Object.keys(dados).forEach(function (k) { o[k] = dados[k]; });
    o.id = ID;
    return o;
  }

  /* o que falta para as minutas saírem sem [PREENCHER] por dado do órgão: [{id, rotulo}] */
  function faltantes(o) {
    var out = [];
    CAMPOS.forEach(function (c) {
      if (!exige(c, o)) return;
      if (vazio(o && o[c.id])) out.push({ id: c.id, rotulo: c.rotulo });
    });
    return out;
  }
  function vazioTotal(o) {
    var t = true;
    CAMPOS.forEach(function (c) { if (!vazio(o && o[c.id])) t = false; });
    return t && !(o && o.timbrado);
  }

  /* ---------- validação (formato, nunca existência) ---------- */
  function emailOk(v) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trim(v)); }
  function urlOk(v) { return /^https?:\/\/[^\s/]+\.[^\s]{2,}$/i.test(trim(v)) || /^https?:\/\/localhost/i.test(trim(v)); }
  function validar(o) {
    var erros = [];
    if (!vazio(o && o.emailImpugnacao) && !emailOk(o.emailImpugnacao)) erros.push({ id: "emailImpugnacao", msg: "E-mail de impugnação inválido." });
    if (!vazio(o && o.portalUrl) && !urlOk(o.portalUrl)) erros.push({ id: "portalUrl", msg: "O endereço do portal deve começar com http:// ou https://." });
    return erros;
  }

  /* ---------- os campos do edital/contrato que o cadastro alimenta: { id do campo em p.edital: valor } ---------- */
  function paraEdital(o) {
    var r = {};
    if (!o) return r;
    var s = trim(o.setorNome);
    if (s) {
      var extra = [];
      if (!vazio(o.setorSala)) extra.push("sala " + trim(o.setorSala).replace(/^sala\s+/i, ""));
      if (!vazio(o.setorTelefone)) extra.push("telefone " + trim(o.setorTelefone));
      r.setorLicitacoes = s + (extra.length ? " (" + extra.join(", ") + ")" : "");
    }
    if (!vazio(o.enderecoOrgao)) r.enderecoOrgao = trim(o.enderecoOrgao);
    if (!vazio(o.emailImpugnacao)) r.emailImpugnacao = trim(o.emailImpugnacao);
    if (!vazio(o.foro)) r.foro = trim(o.foro);
    if (!vazio(o.representanteNome) && !vazio(o.representanteCargo) && !vazio(o.representanteAto)) {
      r.representante = trim(o.representanteNome) + ", " + trim(o.representanteCargo) + ", nomeado(a) pelo ato: " + trim(o.representanteAto);
    }
    if (!vazio(o.portalNome)) r.portal = trim(o.portalNome) + (!vazio(o.portalUrl) ? " — " + trim(o.portalUrl) : "");
    if (o.cadastro === "sicaf" || o.cadastro === "proprio") {
      r.cadastro = o.cadastro;
      if (o.cadastro === "proprio" && !vazio(o.cadastroProprio)) r.cadastroProprio = trim(o.cadastroProprio);
    }
    return r;
  }
  /* de qual campo do CADASTRO vem cada campo do edital (para o «Preencher no Cadastro do órgão» apontar o lugar certo) */
  var ORIGEM_NO_CADASTRO = { setorLicitacoes: "setorNome", enderecoOrgao: "enderecoOrgao", emailImpugnacao: "emailImpugnacao", foro: "foro",
    representante: "representanteNome", portal: "portalNome", cadastro: "cadastro", cadastroProprio: "cadastroProprio" };

  /* ---------- numeração do edital: «NNN/AAAA», sequencial por ÓRGÃO (a conta), ANO e MODALIDADE ---------- */
  var ROTULO_MODALIDADE = { "pregão": "Pregão Eletrônico", "pregao": "Pregão Eletrônico", "concorrência": "Concorrência Eletrônica", "concorrencia": "Concorrência Eletrônica" };
  function rotuloModalidade(m) { var k = trim(m).toLowerCase(); return ROTULO_MODALIDADE[k] || null; }
  function pad3(n) { var s = String(n); while (s.length < 3) s = "0" + s; return s; }
  /* `processos` = todos os processos da conta; `p` é excluído da contagem; só conta o que já tem número no formato NNN/AAAA da mesma modalidade */
  function proximoNumero(processos, p, modalidade, ano) {
    var mod = trim(modalidade).toLowerCase().replace("ã", "a").replace("ê", "e"), max = 0;
    arr(processos).forEach(function (q) {
      if (!q || (p && q.id === p.id)) return;
      var n = q.edital && q.edital.numero ? trim(q.edital.numero) : "";
      var m = /^(\d{1,6})\/(\d{4})$/.exec(n);
      if (!m || Number(m[2]) !== Number(ano)) return;
      var mqq = trim(modalidadeDe(q)).toLowerCase().replace("ã", "a").replace("ê", "e");
      if (mqq && mod && mqq !== mod) return;
      if (Number(m[1]) > max) max = Number(m[1]);
    });
    return pad3(max + 1) + "/" + ano;
  }
  function valorParametro(p, id) {
    var x = p && p.parametros ? p.parametros[id] : null;
    return x && x.valor !== null && x.valor !== undefined ? x.valor : null;
  }
  /* modalidade para numerar/nomear: a DECIDIDA; sem decisão, a SUGERIDA (a pessoa confirma depois, e o número é dessa sugestão) */
  function modalidadeDe(p) {
    var x = p && p.parametros ? p.parametros.modalidade : null;
    if (!x) return null;
    return !vazio(x.valor) ? x.valor : (!vazio(x.sugerido) ? x.sugerido : null);
  }

  var HAB_TEXTO = "Habilitação (arts. 62 a 70 da Lei 14.133/2021): (I) habilitação jurídica (art. 66); (II) habilitação fiscal, social e trabalhista (art. 68); " +
    "(III) habilitação econômico-financeira (art. 69); (IV) qualificação técnica (art. 67).";
  var REGRA_ROTINA = "Padrão de rotina do órgão.";

  /* ---------- os padrões: devolve [{ caminho, valor, regra }] — só o que TEM valor ---------- */
  /* ctx: { orgao (cadastro), processos (todos da conta), ano (número) } */
  function padroes(p, ctx) {
    ctx = ctx || {};
    var o = ctx.orgao || null, out = [];
    function add(caminho, valor, regra) { if (valor !== null && valor !== undefined && trim(valor) !== "") out.push({ caminho: caminho, valor: valor, regra: regra }); }

    /* 1. do CADASTRO */
    var ed = paraEdital(o), RC = "Cadastro do órgão (aba «Órgão»).";
    Object.keys(ed).forEach(function (k) { add("edital." + k, ed[k], RC); });

    /* 2. de ROTINA */
    var mod = modalidadeDe(p), rot = rotuloModalidade(mod);
    if (mod && rot && ctx.ano && !ctx.semNumero) {
      add("edital.numero", proximoNumero(ctx.processos, p, mod, ctx.ano),
        rot + " nº NNN/" + ctx.ano + ": numeração sequencial por órgão, ano e modalidade (próximo número livre entre os processos desta conta).");
    }
    add("edital.habilitacao", HAB_TEXTO, "Os quatro grupos de habilitação da Lei 14.133/2021, arts. 62 a 70 (os mesmos que o módulo já cita no edital).");
    var meses = p && p.cronogramaFisico && p.cronogramaFisico.meses ? Number(p.cronogramaFisico.meses) : 0;
    if (meses > 0) {
      var tr_ = (p && p.tr) || {}, dProv = parseInt(tr_.prazoRecProvisorio, 10), dDef = parseInt(tr_.prazoRecDefinitivo, 10);
      var temRec = dProv > 0 && dDef > 0, m_ = meses + (meses === 1 ? " mês" : " meses");
      add("edital.vigencia", "execução em " + m_ + ", a contar da ordem de serviço; vigência de " + m_ + (temRec ? " mais " + (dProv + dDef) + " dias (recebimento provisório de " + dProv + " dias e definitivo de " + dDef + " dias)" : "") + ", a contar da assinatura do contrato",
        temRec ? "Prazo de execução do cronograma físico (" + m_ + ") somado aos prazos de recebimento declarados no processo (" + dProv + " + " + dDef + " dias)."
               : "Prazo de execução do cronograma físico (" + m_ + "). O processo não declara os prazos de recebimento provisório e definitivo: falta somá-los à vigência.");
    }
    add("edital.sessaoHora", "09:00", REGRA_ROTINA + " Hora da sessão pública: 09:00 (horário de Brasília).");
    add("edital.modoDisputa", "aberto", REGRA_ROTINA + " Modo de disputa: aberto.");
    add("edital.intervaloLances", "0,5%", REGRA_ROTINA + " Intervalo mínimo entre lances: 0,5%.");
    if (!ed.cadastro) add("edital.cadastro", "sicaf", REGRA_ROTINA + " Cadastro de fornecedores: SICAF (quando o cadastro do órgão não diz outro).");
    add("edital.multaContrato", "multa moratória de 0,5% ao dia, limitada a 30 dias de atraso, e multa compensatória de até 10% do valor do contrato",
      REGRA_ROTINA + " Multa moratória de 0,5% ao dia até 30 dias; compensatória de até 10%.");
    add("edital.prazoRepactuacao", "30 dias", REGRA_ROTINA + " Pedido de repactuação analisado em até 30 dias.");
    add("edital.prazoReequilibrio", "30 dias", REGRA_ROTINA + " Pedido de reequilíbrio analisado em até 30 dias.");
    var email = ed.emailImpugnacao || null;
    add("edital.visitaAgendamento", "por e-mail" + (email ? " (" + email + ")" : " ao setor de licitações") + ", com 2 dias úteis de antecedência",
      REGRA_ROTINA + " Vistoria facultativa agendada por e-mail com 2 dias úteis de antecedência.");
    return out;
  }

  /* ---------- timbrado: só aceita imagem; o tamanho é limitado pela tela (reduz antes de gravar) ---------- */
  function timbradoOk(dataUrl) { return /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(String(dataUrl || "")); }

  var API = { ENTIDADE: ENTIDADE, ID: ID, CAMPOS: CAMPOS, ORIGEM_NO_CADASTRO: ORIGEM_NO_CADASTRO, novo: novo, faltantes: faltantes, vazioTotal: vazioTotal, validar: validar,
    paraEdital: paraEdital, padroes: padroes, proximoNumero: proximoNumero, modalidadeDe: modalidadeDe, rotuloModalidade: rotuloModalidade, timbradoOk: timbradoOk, HAB_TEXTO: HAB_TEXTO };
  global.CplproOrgao = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
