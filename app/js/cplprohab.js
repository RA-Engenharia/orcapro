/* =====================================================================
 * cplprohab.js — CPLPRO, leva E1: a HABILITAÇÃO dos licitantes, ligada ao serviço de análise do CertamePRO.
 *
 * MOTOR + CLIENTE, sem DOM e sem Store (a tela é js/cplproui.js). Roda no gate em Node: o `fetch` e o `FormData` entram
 * por parâmetro, então o contrato da API é provado contra um servidor falso.
 *
 * Contrato do serviço: RA-Equipe\licitacoes\contrato-analise-orgao-v1.md (POST /api/orgao/analisar). Pareamento: o mesmo da
 * fila do OrçaPRO no CertamePRO (POST /api/integracao/orcapro/parear/previa e /parear), com escopo "orgao".
 *
 * REGRAS QUE NÃO CEDEM
 *  - QUEM DECIDE É O SERVIDOR PÚBLICO. O serviço só prepara a análise com prova (arquivo, página, trecho). Nada muda sozinho:
 *    cada exigência tem confirmar/alterar, pelo papel que pode `analisar_propostas`, e o histórico grava quem confirmou.
 *  - SEM PROVA, NUNCA «NÃO ATENDE». Resposta do serviço com «não atende» sem arquivo+página é tratada como «conferir» (e
 *    avisada). «Não atende» só se confirma com prova OU com o motivo escrito pela pessoa; «não apresentou» é só da pessoa.
 *  - CAMPO QUE O EDITAL NÃO DEFINE = exigência SEM regra (o serviço só confere presença, legibilidade e CNPJ). Nunca um
 *    número inventado: os índices vêm do texto do edital padrão (js/cplprodocs.js), as parcelas vêm da lista que o edital
 *    imprime, com quantidade mínima de até 50% (art. 67, §2º).
 *  - O TOKEN DE PAREAMENTO FICA SÓ NESTE APARELHO (localStorage da origem). Nunca no processo, nunca na nuvem, nunca em log
 *    (nenhuma função daqui escreve token em mensagem de erro).
 *  - LGPD: CPF e RG nunca em nome de arquivo, log ou telemetria. O trecho de prova que volta do serviço já vem mascarado;
 *    aqui ele é cortado em 200 caracteres e mascarado DE NOVO (cinto e suspensório).
 *  - Prazo de diligência não tem padrão escondido: sem data escolhida pela pessoa, o documento sai com «[PREENCHER]».
 * ES5 puro.
 * ===================================================================== */
(function (global) {
  "use strict";

  var Cplpro = global.Cplpro, R = global.CplproRegras, F = global.CplproFluxo;
  if (typeof require === "function" && typeof module !== "undefined") {
    if (!R) R = require("./cplproregras.js");
    if (!Cplpro) Cplpro = require("./cplpro.js");
    if (!F) F = require("./cplprofluxo.js");
  }

  function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function vazio(v) { return v === null || v === undefined || (typeof v === "string" && v.replace(/\s/g, "") === ""); }
  function ehNum(v) { return typeof v === "number" && isFinite(v); }
  function texto(v, max) { var s = String(v === null || v === undefined ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").replace(/^\s+|\s+$/g, ""); return max ? s.substring(0, max) : s; }
  function agoraISO() {
    function dd(n) { return (n < 10 ? "0" : "") + n; }
    var d = new Date();
    return d.getFullYear() + "-" + dd(d.getMonth() + 1) + "-" + dd(d.getDate()) + "T" + dd(d.getHours()) + ":" + dd(d.getMinutes()) + ":" + dd(d.getSeconds());
  }

  var SERVICO_OFICIAL = "https://app.certamepro.com.br";
  var VERSAO_FICHA = 1;
  var MAX_TRECHO = 200;

  var GRUPOS = [
    { id: "juridica", nome: "Habilitação jurídica" },
    { id: "fiscal", nome: "Regularidade fiscal" },
    { id: "trabalhista", nome: "Regularidade trabalhista" },
    { id: "economica", nome: "Qualificação econômico-financeira" },
    { id: "tecnica", nome: "Qualificação técnica" },
    { id: "declaracao", nome: "Declarações" }
  ];
  function nomeGrupo(id) { var n = id; GRUPOS.forEach(function (g) { if (g.id === id) n = g.nome; }); return n; }

  /* o que o SERVIÇO responde (contrato §2) */
  var SITUACOES = {
    atende: { nome: "Atende", tom: "ok" },
    nao_atende: { nome: "Não atende", tom: "erro" },
    diligencia: { nome: "Diligência", tom: "alerta" },
    conferir: { nome: "Conferir", tom: "alerta" },
    nao_localizado: { nome: "Não localizado", tom: "alerta" }
  };
  /* o que a PESSOA decide. «não apresentou» é só dela: o serviço nunca o diz (contrato §3.1). */
  var DECISOES = {
    atende: { nome: "Atende", curto: "atende" },
    nao_atende: { nome: "Não atende (inabilita)", curto: "não atende" },
    diligencia: { nome: "Pedir diligência (art. 64)", curto: "diligência" },
    nao_apresentou: { nome: "Não apresentou (inabilita)", curto: "não apresentou" }
  };
  var DECISAO_ORDEM = ["atende", "diligencia", "nao_atende", "nao_apresentou"];
  var ABRE_INABILITACAO = { nao_atende: true, nao_apresentou: true };

  /* ------------------------------------------------------------------ *
   * CNPJ (numérico ou alfanumérico, IN RFB 2.229/2024) — só para avisar CEDO; quem manda é o serviço
   * ------------------------------------------------------------------ */
  function limparCnpj(s) { return String(s === null || s === undefined ? "" : s).toUpperCase().replace(/[^0-9A-Z]/g, ""); }
  function dvCnpj(base) {
    var soma = 0, peso = 2, i;
    for (i = base.length - 1; i >= 0; i--) { soma += (base.charCodeAt(i) - 48) * peso; peso = peso === 9 ? 2 : peso + 1; }
    var r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  }
  function cnpjValido(s) {
    var c = limparCnpj(s);
    if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c) || /^(.)\1{13}$/.test(c)) return false;
    var d1 = dvCnpj(c.substring(0, 12)), d2 = dvCnpj(c.substring(0, 12) + d1);
    return c.charAt(12) === String(d1) && c.charAt(13) === String(d2);
  }
  function mascaraCnpj(c) {
    c = limparCnpj(c);
    return c.length === 14 ? c.substring(0, 2) + "." + c.substring(2, 5) + "." + c.substring(5, 8) + "/" + c.substring(8, 12) + "-" + c.substring(12) : c;
  }
  /* o CNPJ aparece em tela e documento (é do processo), mas nunca no NOME do arquivo nem em log: ver nomeLicitante */

  /* ------------------------------------------------------------------ *
   * LGPD: máscara de CPF/RG/CEP/e-mail/telefone no trecho de prova (o serviço já mascara; aqui de novo)
   * ------------------------------------------------------------------ */
  function mascarar(t) {
    var s = String(t === null || t === undefined ? "" : t);
    s = s.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, function (m) { return /^\d{2}\.?\d{3}\.?\d{3}$/.test(m) ? m : "***.***.***-**"; });
    s = s.replace(/\b\d{1,2}\.?\d{3}\.?\d{3}-?[0-9Xx]\b/g, "**.***.***-*");
    s = s.replace(/\b\d{5}-?\d{3}\b/g, "*****-***");
    s = s.replace(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g, "***@***");
    s = s.replace(/\(?\b\d{2}\)?[ .-]?9?\d{4}[ .-]?\d{4}\b/g, "(**) *****-****");
    return s;
  }

  /* ------------------------------------------------------------------ *
   * Endereço do serviço: o oficial por https, ou o local (teste). NUNCA outro host: o token sairia do aparelho.
   * ------------------------------------------------------------------ */
  function destino(url) {
    var u = String(url === null || url === undefined ? "" : url).replace(/\/+$/, "");
    var m = /^(https?):\/\/([^\/@?#:]+)(?::(\d{1,5}))?$/i.exec(u);
    if (!m) return { ok: false, motivo: "Endereço inválido." };
    var proto = m[1].toLowerCase(), host = m[2].toLowerCase(), porta = m[3] || "";
    if (proto === "https" && host === "app.certamepro.com.br" && !porta) return { ok: true, url: SERVICO_OFICIAL, local: false };
    if ((host === "localhost" || host === "127.0.0.1") && proto === "http") return { ok: true, url: proto + "://" + host + (porta ? ":" + porta : ""), local: true };
    return { ok: false, motivo: "O CPLPRO só conversa com o CertamePRO oficial (" + SERVICO_OFICIAL + ")." };
  }

  /* ------------------------------------------------------------------ *
   * Pareamento (token SÓ no aparelho)
   * ------------------------------------------------------------------ */
  function chavePareamento(emp) { return "orcapro:cplpro:certamepro:" + String(emp || "default"); }
  function lerPareamento(storage, emp) {
    try {
      var o = JSON.parse(storage.getItem(chavePareamento(emp)) || "null");
      if (!o || typeof o.token !== "string" || o.token.length < 16) return null;
      return o;
    } catch (e) { return null; }
  }
  function gravarPareamento(storage, emp, o) {
    try { storage.setItem(chavePareamento(emp), JSON.stringify(o)); return true; } catch (e) { return false; }
  }
  function desligar(storage, emp) { try { storage.removeItem(chavePareamento(emp)); return true; } catch (e) { return false; } }
  /* o que a tela pode mostrar (nunca o token) */
  function estadoPareamento(storage, emp) {
    var o = lerPareamento(storage, emp);
    if (!o) return { pareado: false };
    return { pareado: true, usuario: o.usuario || "", pareadoEm: o.pareadoEm || "", servico: o.servico || SERVICO_OFICIAL, escopo: o.escopo || "" };
  }

  /* ------------------------------------------------------------------ *
   * Mensagens de erro (PT-BR, com o que fazer). O token nunca entra aqui.
   * ------------------------------------------------------------------ */
  function mensagemErro(status, corpo, retryAfter) {
    var det = corpo && (corpo.erro || corpo.detail) ? texto(typeof (corpo.erro || corpo.detail) === "string" ? (corpo.erro || corpo.detail) : JSON.stringify(corpo.erro || corpo.detail), 400) : "";
    var espera = retryAfter && /^\d+$/.test(String(retryAfter)) ? " Tente de novo em " + retryAfter + " s." : "";
    var m = {
      401: { msg: "Este OrçaPRO não está conectado ao CertamePRO (a conexão foi revogada, venceu ou é de outro tipo). Desligue e peça um novo código de pareamento ao administrador.", reparear: true },
      400: { msg: "O CertamePRO recusou o pedido.", usaDetalhe: true },
      404: { msg: "O serviço de análise de habilitação não está ligado neste servidor do CertamePRO. Fale com a RA Engenharia." },
      409: { msg: "O CertamePRO não conectou este aparelho.", usaDetalhe: true },
      413: { msg: "Os arquivos passam do limite do serviço (200 MB ou 300 arquivos no total). Envie em duas análises, separando por pasta." },
      422: { msg: "O serviço não aceitou o pedido." + (det ? "" : " Confira o CNPJ, a data da sessão e os arquivos."), usaDetalhe: true },
      429: { msg: "Já há uma análise em andamento com esta conexão, ou foram mais de 3 pedidos por minuto." + (espera || " Aguarde um minuto e tente de novo.") },
      503: { msg: "O serviço está ocupado agora." + (espera || " Tente de novo em alguns minutos.") }
    }[status];
    if (!m) return { status: status, mensagem: "O CertamePRO respondeu com erro " + status + "." + (det ? " " + det : "") + " Nada foi gravado no processo.", reparear: false };
    return { status: status, mensagem: m.msg + (m.usaDetalhe && det ? " " + det : ""), reparear: !!m.reparear };
  }
  function semConexao() {
    return { status: 0, mensagem: "Não consegui falar com o CertamePRO (sem internet ou bloqueio na rede). Confira a conexão e tente de novo. Nada foi gravado no processo.", reparear: false };
  }
  function lerCorpo(r) {
    return r.text().then(function (t) { try { return JSON.parse(t); } catch (e) { return null; } }, function () { return null; });
  }

  /* ------------------------------------------------------------------ *
   * Cliente HTTP. cfg = { fetch, FormData, servico, token }
   * ------------------------------------------------------------------ */
  function postJson(cfg, rota, corpo, comToken) {
    var d = destino(cfg.servico || SERVICO_OFICIAL);
    if (!d.ok) return Promise.reject({ status: 0, mensagem: d.motivo, reparear: false });
    var cab = { "Content-Type": "application/json" };
    if (comToken) { cab.Authorization = "Bearer " + cfg.token; cab["X-Licitacoes"] = "1"; }
    return cfg.fetch(d.url + rota, { method: "POST", headers: cab, body: JSON.stringify(corpo) }).then(function (r) {
      return lerCorpo(r).then(function (j) {
        if (r.ok) return j || {};
        throw mensagemErro(r.status, j, r.headers && r.headers.get ? r.headers.get("Retry-After") : null);
      });
    }, function () { throw semConexao(); });
  }
  function previaPareamento(cfg, codigo) {
    var c = String(codigo || "").replace(/\s/g, "").toUpperCase();
    if (!c) return Promise.reject({ status: 0, mensagem: "Digite o código de pareamento do CertamePRO.", reparear: false });
    return postJson(cfg, "/api/integracao/orcapro/parear/previa", { codigo: c }, false).then(function (j) {
      if (j.escopo !== "orgao") throw { status: 0, mensagem: "Este código é de um OrçaPRO de empresa, não de órgão público. Peça ao administrador um código do tipo «órgão».", reparear: false };
      return { conta: texto(j.conta, 120), papel: texto(j.papel, 40), empresas: arr(j.empresas).map(function (e) { return { id: e.id, nome: texto(e.nome, 160) }; }), escopo: j.escopo };
    });
  }
  function parear(cfg, codigo, nomeAparelho) {
    var c = String(codigo || "").replace(/\s/g, "").toUpperCase();
    return postJson(cfg, "/api/integracao/orcapro/parear", { codigo: c, aparelho: texto(nomeAparelho || "CPLPRO", 60) }, false).then(function (j) {
      if (j.escopo !== "orgao" || typeof j.token !== "string" || j.token.length < 16) throw { status: 0, mensagem: "O CertamePRO devolveu uma conexão que não serve para o CPLPRO (escopo «" + texto(j.escopo, 20) + "»). Nada foi guardado.", reparear: false };
      return { token: j.token, usuario: texto(j.usuario, 120), aparelhoId: j.aparelho_id, escopo: j.escopo, pareadoEm: agoraISO() };
    });
  }

  /* resposta do serviço → a forma que o processo guarda (ou erro se a resposta não bate com a ficha) */
  function validarResposta(ficha, resp) {
    if (!resp || resp.versao !== VERSAO_FICHA || !arr(resp.resultados).length) throw { status: 0, mensagem: "A resposta do CertamePRO veio incompleta (versão ou resultados ausentes). Tente de novo; nada foi gravado.", reparear: false };
    var porId = {}, avisosLocais = [];
    arr(resp.resultados).forEach(function (r) { if (r && typeof r.id === "string" && !porId[r.id]) porId[r.id] = r; });
    var resultados = [];
    arr(ficha.exigencias).forEach(function (ex) {
      var r = porId[ex.id];
      if (!r) throw { status: 0, mensagem: "A resposta do CertamePRO não trouxe a exigência «" + ex.id + "». Tente de novo; nada foi gravado.", reparear: false };
      var sit = SITUACOES[r.situacao] ? r.situacao : "conferir";
      var provas = arr(r.provas).map(function (p) {
        return { arquivo: texto(p && p.arquivo, 200), pagina: (p && ehNum(p.pagina) && p.pagina >= 1) ? Math.floor(p.pagina) : null, trecho: mascarar(texto(p && p.trecho, MAX_TRECHO)).substring(0, MAX_TRECHO) };
      });
      var motivo = texto(r.motivo, 1200);
      /* ⚠ sem prova (arquivo + página), «não atende» NÃO se aceita: vira «conferir» (contrato §3.1) */
      if (sit === "nao_atende" && !provas.some(function (p) { return p.arquivo && p.pagina !== null; })) {
        sit = "conferir";
        motivo = "O serviço apontou «não atende» sem indicar arquivo e página; por regra, sem prova é «conferir». " + motivo;
        avisosLocais.push("Exigência " + ex.id + ": «não atende» sem prova foi tratada como «conferir».");
      }
      resultados.push({ id: ex.id, situacao: sit, motivo: motivo, regra: texto(r.regra, 1200), provas: provas, validade: texto(r.validade, 10) || null, cnpjDoc: limparCnpj(r.cnpjDoc) || null });
    });
    var lic = resp.licitante || {};
    return {
      analisadoEm: texto(resp.analisadoEm, 40) || agoraISO(),
      licitante: { cnpjLido: limparCnpj(lic.cnpjLido) || null, confere: lic.confere === true ? true : (lic.confere === false ? false : null),
        sancoes: lic.sancoes ? { situacao: texto(lic.sancoes.situacao, 40), texto: texto(lic.sancoes.texto, 400), baseAtualizadaEm: texto(lic.sancoes.baseAtualizadaEm, 10) } : null },
      resultados: resultados,
      arquivos: arr(resp.arquivos).map(function (a) { return { nome: texto(a && a.nome, 200), tipoDetectado: a && a.tipoDetectado, paginas: a && ehNum(a.paginas) ? a.paginas : null, sha256: texto(a && a.sha256, 64) }; }),
      avisos: arr(resp.avisos).map(function (a) { return texto(a, 400); }).concat(avisosLocais)
    };
  }

  /* envia a ficha + os arquivos (File/Blob) e devolve a resposta já validada */
  function analisar(cfg, ficha, arquivos) {
    var d = destino(cfg.servico || SERVICO_OFICIAL);
    if (!d.ok) return Promise.reject({ status: 0, mensagem: d.motivo, reparear: false });
    if (!arr(arquivos).length) return Promise.reject({ status: 0, mensagem: "Escolha os arquivos (ou a pasta) do licitante antes de analisar.", reparear: false });
    var fd = new cfg.FormData();
    fd.append("ficha", JSON.stringify(ficha));
    arr(arquivos).forEach(function (f) { fd.append("arquivos", f, f.name); });
    return cfg.fetch(d.url + "/api/orgao/analisar", { method: "POST", headers: { Authorization: "Bearer " + cfg.token, "X-Licitacoes": "1" }, body: fd }).then(function (r) {
      return lerCorpo(r).then(function (j) {
        if (!r.ok) throw mensagemErro(r.status, j, r.headers && r.headers.get ? r.headers.get("Retry-After") : null);
        return validarResposta(ficha, j);
      });
    }, function () { throw semConexao(); });
  }

  /* ------------------------------------------------------------------ *
   * A FICHA DE EXIGÊNCIAS, montada do processo
   * ------------------------------------------------------------------ */
  function pv(p, id) { return F ? F.valorParametro(p, id) : null; }
  function idSeguro(s) { return String(s).replace(/[^A-Za-z0-9._-]/g, "_").substring(0, 40); }

  /* data da sessão do processo (cronograma/publicação); a pessoa pode corrigir antes de analisar */
  function dataSessaoDoProcesso(p) {
    var d = (p && p.publicacao && p.publicacao.dataAbertura) || (p && p.cronograma && p.cronograma.dataAbertura) || null;
    return /^\d{4}-\d{2}-\d{2}$/.test(String(d || "")) ? String(d) : null;
  }

  /* Índices mínimos do EDITAL PADRÃO (js/cplprodocs.js, qualificação econômico-financeira: «LG, LC e SG superiores a 1»).
     ⚠ O serviço compara com «>=»; o edital diz «superior a 1». Em 1,00 exato quem decide é a pessoa (o relatório avisa). */
  var INDICES_DO_EDITAL = [
    { sigla: "LG", nome: "Liquidez Geral", minimo: 1 },
    { sigla: "LC", nome: "Liquidez Corrente", minimo: 1 },
    { sigla: "SG", nome: "Solvência Geral", minimo: 1 }
  ];

  /* devolve { exigencias:[{id, grupo, tipo, descricao, regra?, fonte, semRegra?}], avisos:[texto] }.
     `fonte` é para a tela (de onde veio); não vai ao serviço. */
  function exigenciasDoProcesso(p) {
    var ex = [], avisos = [];
    function add(id, grupo, tipo, descricao, fonte, regra, semRegra) {
      var o = { id: id, grupo: grupo, tipo: tipo, descricao: descricao, fonte: fonte };
      if (regra) o.regra = regra;
      if (semRegra) o.semRegra = semRegra;
      ex.push(o);
    }
    var LEI = "Lei 14.133/2021";
    add("J1", "juridica", "J1", "Ato constitutivo, contrato social ou CCMEI, com as alterações ou a consolidação", LEI + ", art. 66");
    add("C2", "juridica", "C2", "Consulta de sanções (CEIS/CNEP) do licitante", LEI + ", art. 14 e 156");
    add("F-CNPJ", "fiscal", "J2", "Prova de inscrição no CNPJ", LEI + ", art. 68, I");
    add("F2", "fiscal", "F2", "Regularidade federal (certidão conjunta Receita/PGFN, inclusive Seguridade Social)", LEI + ", art. 68, III");
    add("F-INSCMUN", "fiscal", "inscricao_municipal", "Inscrição no cadastro de contribuintes municipal, pertinente ao ramo", LEI + ", art. 68, II");
    add("F4", "fiscal", "F4", "Regularidade com a Fazenda Municipal da sede", LEI + ", art. 68, III");
    add("F5", "trabalhista", "F5", "Regularidade com o FGTS (CRF)", LEI + ", art. 68, IV");
    add("F6", "trabalhista", "F6", "Inexistência de débitos perante a Justiça do Trabalho (CNDT)", LEI + ", art. 68, V");
    add("E2", "economica", "E2", "Certidão negativa de falência e recuperação judicial", LEI + ", art. 69, II");
    add("E1", "economica", "E1", "Balanço patrimonial, DRE e demonstrações dos 2 últimos exercícios", LEI + ", art. 69, I");
    INDICES_DO_EDITAL.forEach(function (ind) {
      add("E3-" + ind.sigla, "economica", "balanco", ind.nome + " (" + ind.sigla + ") não inferior a " + String(ind.minimo).replace(".", ","), "edital padrão (índices superiores a 1)", { indice: ind.sigla, minimo: ind.minimo });
    });
    var cap = p && p.tr && !vazio(p.tr.qualificacaoEconomica) ? texto(p.tr.qualificacaoEconomica, 120) : null;
    add("E3-CAP", "economica", "E3", "Capital mínimo ou patrimônio líquido mínimo" + (cap ? ": " + cap : " (valor não informado no edital)") + ", exigido de quem não atinge os índices", LEI + ", art. 69, §§4º e 5º", null,
      "O serviço não confere capital mínimo: ele só localiza o balanço. A conclusão é do servidor.");
    add("T1", "tecnica", "T1", "Registro da empresa no CREA/CAU (certidão de registro e quitação)", LEI + ", art. 67, I");
    add("T2", "tecnica", "T2", "Registro do responsável técnico no conselho profissional", LEI + ", art. 67, I");
    add("T3", "tecnica", "T3", "Acervo técnico-profissional (CAT do responsável técnico)", LEI + ", art. 67, I");
    add("T5", "tecnica", "T5", "Vínculo do responsável técnico com a empresa", LEI + ", art. 67, §6º");
    var pr = arr(pv(p, "parcelas_relevancia"));
    if (!pr.length) {
      add("T4", "tecnica", "T4", "Atestado de capacidade técnico-operacional (o edital não fixou parcelas de maior relevância)", LEI + ", art. 67, II", null,
        "Sem parcela e quantidade fixadas no edital, o serviço só confere presença e legibilidade.");
      avisos.push("O processo não tem parcelas de maior relevância fixadas (passo 8): os atestados serão conferidos sem quantidade mínima.");
    } else {
      pr.forEach(function (x, i) {
        var q = ehNum(x.qtd) ? x.qtd : null, qm = ehNum(x.qtdMaxExigivel) ? x.qtdMaxExigivel : null;
        var id = "T4-" + idSeguro(vazio(x.item) ? i + 1 : x.item), desc = "Atestado: " + texto(x.descricao, 160) + (vazio(x.un) ? "" : " (" + texto(x.un, 20) + ")");
        var ok = qm !== null && qm > 0 && q !== null && qm <= q / 2 + 1e-9 && !vazio(x.un) && !vazio(x.descricao);
        if (ok) add(id, "tecnica", "atestado", desc, LEI + ", art. 67, §§1º e 2º (até 50% da parcela)", { parcela: texto(x.descricao, 200), unidade: texto(x.un, 20), quantidadeMinima: qm });
        else {
          add(id, "tecnica", "atestado", desc, LEI + ", art. 67, §§1º e 2º", null, "Parcela sem quantidade mínima conferível (acima de 50% da parcela, sem unidade ou sem descrição): o serviço só confere presença.");
          avisos.push("Parcela «" + texto(x.descricao, 80) + "»: quantidade mínima fora do limite de 50% (ou sem unidade); ficou sem regra de quantidade.");
        }
      });
    }
    add("D1", "declaracao", "D1", "Declaração de que atende aos requisitos de habilitação", LEI + ", art. 63, I");
    add("D2", "declaracao", "D2", "Declaração de reserva de cargos para pessoa com deficiência e reabilitado", LEI + ", art. 63, IV");
    add("D3", "declaracao", "D3", "Declaração de que a proposta cobre os custos dos direitos trabalhistas", LEI + ", art. 63");
    if (pv(p, "visita_tecnica") === true) add("D8", "declaracao", "D8", "Declaração de vistoria ou de conhecimento do local", LEI + ", art. 63, §2º");
    if (pv(p, "me_epp") === true) add("D5", "declaracao", "D5", "Declaração de enquadramento como ME/EPP", "LC 123/2006");
    if (p && p.edital && !vazio(p.edital.habilitacao)) avisos.push("O edital tem exigências específicas em texto livre («Exigências específicas…»): elas NÃO entram na ficha automática. Confira à mão.");
    return { exigencias: ex, avisos: avisos };
  }

  /* a ficha que vai ao serviço (contrato §1). Falta dado → erro em PT-BR, sem inventar nada. */
  function montarFicha(p, licitante, dataSessao, ids) {
    var cnpj = limparCnpj(licitante && licitante.cnpj);
    if (!cnpjValido(cnpj)) throw new Error("O CNPJ do licitante não confere (confira os dígitos).");
    var ds = vazio(dataSessao) ? dataSessaoDoProcesso(p) : String(dataSessao);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ds || ""))) throw new Error("Informe a data da sessão: é nela que a validade das certidões é conferida.");
    var base = exigenciasDoProcesso(p).exigencias;
    if (arr(ids).length) base = base.filter(function (e) { return ids.indexOf(e.id) > -1; });
    if (!base.length) throw new Error("Não há exigência para analisar.");
    var f = { versao: VERSAO_FICHA, cnpjLicitante: cnpj, dataSessao: ds, exigencias: base.map(function (e) {
      var o = { id: e.id, grupo: e.grupo, tipo: e.tipo, descricao: e.descricao };
      if (e.regra) o.regra = clone(e.regra);
      return o;
    }) };
    if (!vazio(licitante && licitante.razaoSocial)) f.razaoSocial = texto(licitante.razaoSocial, 200);
    return f;
  }

  /* ------------------------------------------------------------------ *
   * O PROCESSO: licitantes analisados, decisões do servidor, diligência, recurso, adjudicação
   * ------------------------------------------------------------------ */
  function hab(q) { if (!q.habilitacao || typeof q.habilitacao !== "object") q.habilitacao = { licitantes: [], adjudicatarioId: null }; q.habilitacao.licitantes = arr(q.habilitacao.licitantes); return q.habilitacao; }
  function licPorId(p, id) { return arr(p && p.habilitacao && p.habilitacao.licitantes).filter(function (l) { return l.id === id; })[0] || null; }
  function ordem(p, licId) { var l = arr(p && p.habilitacao && p.habilitacao.licitantes); for (var i = 0; i < l.length; i++) if (l[i].id === licId) return i + 1; return 0; }
  /* nome de arquivo: nunca o CNPJ, a razão social (de MEI pode trazer o CPF) nem o CPF/RG de ninguém */
  function nomeLicitante(p, licId) { var n = ordem(p, licId); return n ? "Licitante " + n : "Licitante"; }
  function quemDe(quem, papel) { return { nome: quem && quem.nome !== undefined ? quem.nome : quem, papel: papel }; }

  function idLicitante(cnpj) { return "hab-" + F.hash(limparCnpj(cnpj)).substring(0, 8); }

  /* grava (ou refaz) a análise de UM licitante. Mesmo CNPJ = mesmo licitante: as exigências reanalisadas trocam o resultado e
     perdem a decisão anterior (que continua no histórico); as outras ficam como estavam. */
  function registrarAnalise(p, papeis, dados, quem, agora) {
    var papel = F.exigir(papeis, "analisar_propostas");
    var cnpj = limparCnpj(dados.cnpj);
    if (!cnpjValido(cnpj)) throw new Error("O CNPJ do licitante não confere (confira os dígitos).");
    var q = clone(p), h = hab(q), id = idLicitante(cnpj);
    var lic = h.licitantes.filter(function (l) { return l.id === id; })[0];
    var novo = !lic;
    if (!lic) { lic = { id: id, cnpj: cnpj, razaoSocial: texto(dados.razaoSocial, 200), dataSessao: dados.dataSessao, exigencias: [], resultados: [], decisoes: {}, diligencia: null, recurso: null, analises: [] }; h.licitantes.push(lic); }
    if (!vazio(dados.razaoSocial)) lic.razaoSocial = texto(dados.razaoSocial, 200);
    lic.dataSessao = dados.dataSessao;
    var resp = dados.resposta, fichaEx = {};
    arr(dados.ficha.exigencias).forEach(function (e) { fichaEx[e.id] = e; });
    var ja = {};
    lic.resultados = arr(lic.resultados).map(function (r) {
      var nr = arr(resp.resultados).filter(function (x) { return x.id === r.id; })[0];
      if (nr) { ja[r.id] = true; delete lic.decisoes[r.id]; return nr; }
      return r;
    });
    lic.exigencias = arr(lic.exigencias).map(function (e) { return fichaEx[e.id] ? clone(fichaEx[e.id]) : e; });
    arr(resp.resultados).forEach(function (r) {
      if (ja[r.id]) return;
      lic.resultados.push(r); lic.exigencias.push(clone(fichaEx[r.id]));
    });
    lic.licitanteLido = resp.licitante;
    lic.arquivos = resp.arquivos;
    lic.avisos = resp.avisos;
    lic.analises = arr(lic.analises).concat([{ em: resp.analisadoEm, itens: arr(resp.resultados).length, por: quemDe(quem, papel).nome }]);
    F.registrar(q, "habilitacao:analisar:" + id, novo ? null : "reanálise", arr(resp.resultados).length + " exigência(s)", quemDe(quem, papel), agora);
    return q;
  }

  function mapaDecisao(sitServidor) { return { atende: "atende", nao_atende: "nao_atende", diligencia: "diligencia" }[sitServidor] || null; }
  function temProvaCompleta(res) { return arr(res && res.provas).some(function (p) { return !vazio(p.arquivo) && p.pagina !== null && p.pagina !== undefined; }); }

  /* confirma ou ALTERA o resultado de uma exigência. Quem pode: `analisar_propostas` (a CPL). */
  function decidir(p, papeis, licId, exigId, dec, quem, agora) {
    var papel = F.exigir(papeis, "analisar_propostas");
    if (!dec || !DECISOES[dec.situacao]) throw new Error("Escolha a decisão: atende, diligência, não atende ou não apresentou.");
    var q = clone(p), lic = licPorId(q, licId);
    if (!lic) throw new Error("Licitante não encontrado.");
    var res = arr(lic.resultados).filter(function (r) { return r.id === exigId; })[0];
    if (!res) throw new Error("Exigência não encontrada.");
    var motivo = texto(dec.motivo, 1500);
    var confirma = mapaDecisao(res.situacao) === dec.situacao;
    if (dec.situacao === "nao_apresentou" && !motivo) throw new Error("«Não apresentou» é decisão sua: escreva o motivo (onde procurou e por que não há o documento).");
    if (dec.situacao === "nao_atende" && !temProvaCompleta(res) && !motivo) throw new Error("«Não atende» precisa de prova (arquivo e página) ou do motivo escrito por você. Sem nenhum dos dois, o licitante não pode ser inabilitado.");
    if (!confirma && !motivo) throw new Error("Você está alterando o resultado do serviço («" + (SITUACOES[res.situacao] ? SITUACOES[res.situacao].nome : res.situacao) + "»): escreva o motivo.");
    if (dec.situacao === "diligencia" && !confirma && !motivo) throw new Error("Escreva o motivo da diligência: ele vai no termo enviado ao licitante.");
    var antes = lic.decisoes[exigId] ? lic.decisoes[exigId].situacao : null;
    lic.decisoes[exigId] = { situacao: dec.situacao, origem: confirma ? "confirmado" : "alterado", situacaoServidor: res.situacao, motivo: motivo || null, por: quemDe(quem, papel).nome, papel: papel, em: vazio(agora) ? agoraISO() : agora };
    F.registrar(q, "habilitacao:" + (confirma ? "confirmar" : "alterar") + ":" + licId + ":" + exigId, antes, dec.situacao, quemDe(quem, papel), agora);
    return q;
  }

  /* prazo da diligência: escolhido pela pessoa, sem padrão. Passado = recusado. */
  function definirPrazoDiligencia(p, papeis, licId, prazoISO, quem, agora) {
    var papel = F.exigir(papeis, "analisar_propostas");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(prazoISO || ""))) throw new Error("Escolha a data-limite da resposta do licitante.");
    var q = clone(p), lic = licPorId(q, licId);
    if (!lic) throw new Error("Licitante não encontrado.");
    var antes = lic.diligencia ? lic.diligencia.prazo : null;
    lic.diligencia = { prazo: prazoISO, por: quemDe(quem, papel).nome, em: vazio(agora) ? agoraISO() : agora };
    F.registrar(q, "habilitacao:prazo_diligencia:" + licId, antes, prazoISO, quemDe(quem, papel), agora);
    return q;
  }

  /* o que falta em um licitante e a situação dele (cada exigência: decidida ou pendente) */
  function consolidar(lic) {
    var pend = [], dil = [], inab = [], ok = [];
    arr(lic && lic.resultados).forEach(function (r) {
      var d = lic.decisoes && lic.decisoes[r.id];
      if (!d) pend.push(r.id);
      else if (d.situacao === "diligencia") dil.push(r.id);
      else if (ABRE_INABILITACAO[d.situacao]) inab.push(r.id);
      else ok.push(r.id);
    });
    var status = !arr(lic && lic.resultados).length ? "sem_analise" : (pend.length ? "pendente" : (dil.length ? "em_diligencia" : (inab.length ? "inabilitado" : "habilitado")));
    return { status: status, pendentes: pend, diligencia: dil, inabilita: inab, atendidas: ok };
  }
  var STATUS_ROTULO = { sem_analise: "sem análise", pendente: "pendente de decisão", em_diligencia: "em diligência", inabilitado: "inabilitado", habilitado: "habilitado" };

  /* Itens pendentes ou em diligência. Sem `soLicId`, de todos os licitantes analisados (visão da tela). A TRAVA da adjudicação
     passa o adjudicatário: a habilitação só se exige do vencedor (art. 63, II); os demais licitantes analisados não travam. */
  function pendenciasGerais(p, soLicId) {
    var out = [];
    arr(p && p.habilitacao && p.habilitacao.licitantes).forEach(function (l, i) {
      if (soLicId && l.id !== soLicId) return;
      var c = consolidar(l);
      if (c.pendentes.length) out.push({ licitanteId: l.id, ordem: i + 1, tipo: "pendente", itens: c.pendentes });
      if (c.diligencia.length) out.push({ licitanteId: l.id, ordem: i + 1, tipo: "diligencia", itens: c.diligencia });
    });
    return out;
  }
  function escolherAdjudicatario(p, papeis, licId, quem, agora) {
    var papel = F.exigir(papeis, "adjudicar");
    var q = clone(p), lic = licPorId(q, licId);
    if (!lic) throw new Error("Licitante não encontrado.");
    if (consolidar(lic).status !== "habilitado") throw new Error("Só se adjudica a licitante HABILITADO, com todas as exigências decididas.");
    var antes = hab(q).adjudicatarioId;
    hab(q).adjudicatarioId = licId;
    F.registrar(q, "habilitacao:adjudicatario", antes, licId, quemDe(quem, papel), agora);
    return q;
  }

  /* Recurso (art. 165): o servidor lança as alegações; a CONCLUSÃO é texto dele, nunca do sistema. */
  function registrarRecurso(p, papeis, licId, dados, quem, agora) {
    var papel = F.exigir(papeis, "analisar_propostas");
    var q = clone(p), lic = licPorId(q, licId);
    if (!lic) throw new Error("Licitante não encontrado.");
    var r = lic.recurso || { itens: [], conclusao: null, intencaoEm: null };
    if (dados.alegacao !== undefined) {
      var al = texto(dados.alegacao, 1500);
      if (!al) throw new Error("Escreva a alegação do recorrente.");
      r.itens = arr(r.itens).concat([{ id: "alg-" + F.hash(al + "|" + (arr(r.itens).length + 1)).substring(0, 8), alegacao: al, exigenciaId: texto(dados.exigenciaId, 64) || null, documento: texto(dados.documento, 300) || null, resposta: texto(dados.resposta, 1500) || null }]);
    }
    if (dados.conclusao !== undefined) r.conclusao = texto(dados.conclusao, 3000) || null;
    if (dados.intencaoEm !== undefined) r.intencaoEm = /^\d{4}-\d{2}-\d{2}$/.test(String(dados.intencaoEm)) ? dados.intencaoEm : null;
    lic.recurso = r;
    F.registrar(q, "habilitacao:recurso:" + licId, null, dados.alegacao !== undefined ? "alegação registrada" : "atualizado", quemDe(quem, papel), agora);
    return q;
  }

  /* prazos do art. 165 em dias úteis, contados pelo motor (js/cplpro.js diasUteisDepois) a partir do resultado divulgado */
  function prazosRecurso(p) {
    if (!p || vazio(p.resultadoEm)) return null;
    var x = F.valorParametro(p, "recurso_prazo");
    var n = x && typeof x === "object" && ehNum(x.diasUteis) ? x.diasUteis : 3;
    var razoes = Cplpro.diasUteisDepois(p.resultadoEm, n, p.feriadosLocais);
    var contra = razoes ? Cplpro.diasUteisDepois(razoes, n, p.feriadosLocais) : null;
    return { dias: n, resultadoEm: p.resultadoEm, razoesAte: razoes, contrarrazoesAte: contra, fonte: "Lei 14.133/2021, art. 165" };
  }

  /* o que o servidor pode gerar AGORA (e por que não) */
  function podeGerar(tipo, p, licId, papeis) {
    var lic = licId ? licPorId(p, licId) : null, c = lic ? consolidar(lic) : null;
    function sem(m) { return { ok: false, motivo: m }; }
    function papelDe(acao) { return F.pode(papeis, acao) || F.pode(papeis, "ler_tudo"); }
    if (tipo === "adjudicacao" || tipo === "homologacao") {
      if (!F.pode(papeis, tipo === "adjudicacao" ? "adjudicar" : "homologar")) return sem(F.motivoSemPermissao(papeis, tipo === "adjudicacao" ? "adjudicar" : "homologar"));
      var adj = licPorId(p, p.habilitacao && p.habilitacao.adjudicatarioId);
      if (!adj) return sem("Escolha o licitante a adjudicar (só habilitado, sem item pendente).");
      var pg = pendenciasGerais(p, adj.id);
      if (pg.length) return sem("O licitante a adjudicar (Licitante " + pg[0].ordem + ") tem item pendente de decisão ou em diligência. Decida cada exigência antes das minutas.");
      if (consolidar(adj).status !== "habilitado") return sem("O licitante escolhido não está habilitado.");
      return { ok: true };
    }
    if (tipo === "ata") {
      if (!papelDe("analisar_propostas")) return sem(F.motivoSemPermissao(papeis, "analisar_propostas"));
      return arr(p && p.habilitacao && p.habilitacao.licitantes).length ? { ok: true } : sem("Analise ao menos um licitante.");
    }
    if (!lic) return sem("Escolha o licitante.");
    if (!papelDe("analisar_propostas")) return sem(F.motivoSemPermissao(papeis, "analisar_propostas"));
    if (tipo === "relatorio") return c.status === "sem_analise" ? sem("Analise o licitante antes.") : { ok: true };
    if (tipo === "diligencia") return c.diligencia.length ? { ok: true } : sem("Nenhuma exigência está em diligência: o termo só sai depois da sua decisão.");
    if (tipo === "inabilitacao") return c.inabilita.length ? { ok: true } : sem("Nenhuma exigência foi decidida como «não atende» ou «não apresentou».");
    if (tipo === "recurso") return c.status === "sem_analise" ? sem("Analise o licitante antes.") : { ok: true };
    return sem("Documento desconhecido.");
  }

  var Hab = {
    SERVICO_OFICIAL: SERVICO_OFICIAL, VERSAO_FICHA: VERSAO_FICHA, GRUPOS: GRUPOS, SITUACOES: SITUACOES, DECISOES: DECISOES, DECISAO_ORDEM: DECISAO_ORDEM,
    STATUS_ROTULO: STATUS_ROTULO, INDICES_DO_EDITAL: INDICES_DO_EDITAL, MAX_TRECHO: MAX_TRECHO,
    nomeGrupo: nomeGrupo, limparCnpj: limparCnpj, cnpjValido: cnpjValido, mascaraCnpj: mascaraCnpj, mascarar: mascarar,
    destino: destino, chavePareamento: chavePareamento, lerPareamento: lerPareamento, gravarPareamento: gravarPareamento, desligar: desligar, estadoPareamento: estadoPareamento,
    mensagemErro: mensagemErro, previaPareamento: previaPareamento, parear: parear, analisar: analisar, validarResposta: validarResposta,
    exigenciasDoProcesso: exigenciasDoProcesso, montarFicha: montarFicha, dataSessaoDoProcesso: dataSessaoDoProcesso,
    licPorId: licPorId, ordem: ordem, nomeLicitante: nomeLicitante, idLicitante: idLicitante,
    registrarAnalise: registrarAnalise, decidir: decidir, definirPrazoDiligencia: definirPrazoDiligencia, consolidar: consolidar, pendenciasGerais: pendenciasGerais,
    escolherAdjudicatario: escolherAdjudicatario, registrarRecurso: registrarRecurso, prazosRecurso: prazosRecurso, podeGerar: podeGerar, temProvaCompleta: temProvaCompleta
  };

  global.CplproHab = Hab;
  if (typeof module !== "undefined" && module.exports) module.exports = Hab;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
