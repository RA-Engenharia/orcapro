/* =====================================================================
 * cplpro.js — CPLPRO: MOTOR PURO do processo de licitação de obra do ÓRGÃO
 * (sem DOM, sem rede, sem localStorage). A tela é outra camada (fiação fina).
 *
 * Dados e regras: js/cplproregras.js (cada regra com fonte e `conferir`).
 * Plano: RA-Equipe\orcapro\PLANO-MODULO-PREFEITURAS.md (§3, §3b, §4, §5, §10–§13).
 *
 * REGRAS QUE NÃO CEDEM
 *  - Nenhum valor padrão escondido: campo de parâmetro sem valor = null + pendência.
 *    (Um teste lê ESTE arquivo e reprova `|| <número>`; por isso os números vêm
 *    de funções de conversão, nunca de "ou zero" solto.)
 *  - Nunca inventar código, preço, quantidade ou artigo: toda sugestão leva `regra` e `fonte`.
 *  - Dinheiro em centavos inteiros, com a mesma régua do orçamento (js/arredondamento.js,
 *    padrão TCU = truncar em 2 casas). Total = soma das linhas ao centavo.
 *  - Idempotente: as funções não alteram a entrada; devolvem cópia. Repetir = mesmo resultado.
 *  - Datas são LOCAIS ("AAAA-MM-DD" montado de getFullYear/getMonth/getDate); nunca
 *    toISOString para dia (das 21h à meia-noite o ISO já é o dia seguinte).
 * ES5 puro.
 * ===================================================================== */
(function (global) {
  "use strict";

  var R = global.CplproRegras;
  var Arred = global.Arred;
  var Feriados = global.Feriados;
  if (typeof require === "function" && typeof module !== "undefined") {
    if (!R) R = require("./cplproregras.js");
    if (!Arred) Arred = require("./arredondamento.js");
    if (!Feriados) Feriados = require("./feriados.js");
  }

  /* ------------------------------------------------------------------ *
   * Helpers
   * ------------------------------------------------------------------ */
  function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
  function ehNum(v) { return typeof v === "number" && isFinite(v); }
  function numOuNull(v) {
    if (ehNum(v)) return v;
    if (typeof v === "string" && v.replace(/\s/g, "") !== "") {
      var n = Number(v.replace(/\s/g, "").replace(",", "."));
      return isFinite(n) ? n : null;
    }
    return null;
  }
  function vazio(v) { return v === null || v === undefined || (typeof v === "string" && v.replace(/\s/g, "") === ""); }
  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function norm(s) {
    return String(s === null || s === undefined ? "" : s).toLowerCase()
      .replace(/[áàâãä]/g, "a").replace(/[éèêë]/g, "e").replace(/[íìîï]/g, "i")
      .replace(/[óòôõö]/g, "o").replace(/[úùûü]/g, "u").replace(/ç/g, "c").replace(/ñ/g, "n");
  }
  function normNome(s) { return norm(s).replace(/[_\-.\/\\]+/g, " ").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, ""); }
  function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  /* Dinheiro: centavos inteiros. Leitura em centavos arredonda o ruído de float
   * (7499.00 * 100 = 749900.0000000001), nunca a terceira casa de um valor legítimo
   * — os valores aqui já são de preço (2 casas). */
  function cent(v) { var n = numOuNull(v); return n === null ? null : Math.round(Number(n.toPrecision(15)) * 100); }
  function deCent(c) { return c / 100; }
  function modoArred(ctx) { return Arred.normalizar(ctx && ctx.modoArredondamento); }
  function valorArred(v, ctx) { return Arred.valor(v, modoArred(ctx)); }
  function somaCent(lista) { var t = 0; arr(lista).forEach(function (c) { t += c; }); return t; }

  /* ---- datas locais ---- */
  function dd(n) { return (n < 10 ? "0" : "") + n; }
  function dataISO(d) { return d.getFullYear() + "-" + dd(d.getMonth() + 1) + "-" + dd(d.getDate()); }
  function lerData(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s === null || s === undefined ? "" : s));
    if (!m) return null;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
    return dataISO(d) === m[1] + "-" + m[2] + "-" + m[3] ? d : null;
  }
  function somaMeses(d, n) {
    var y = d.getFullYear(), m = d.getMonth() + n, dia = d.getDate();
    var alvo = new Date(y, m, 1, 12, 0, 0);
    var ult = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0, 12, 0, 0).getDate();
    return new Date(alvo.getFullYear(), alvo.getMonth(), dia > ult ? ult : dia, 12, 0, 0);
  }
  function agoraLocalISO() {
    var d = new Date();
    return dataISO(d) + "T" + dd(d.getHours()) + ":" + dd(d.getMinutes()) + ":" + dd(d.getSeconds());
  }
  function quemNome(quem) { return quem && typeof quem === "object" ? (quem.nome !== undefined ? quem.nome : null) : (quem === undefined ? null : quem); }
  function quemPapel(quem) { return quem && typeof quem === "object" && quem.papel ? quem.papel : null; }

  /* ------------------------------------------------------------------ *
   * RBAC
   * ------------------------------------------------------------------ */
  function pode(papel, acao) {
    var p = R.PAPEIS[papel];
    if (!p || R.ACOES.indexOf(acao) < 0) return false;
    return p.acoes.indexOf(acao) >= 0;
  }
  function exigir(papel, acao) {
    if (!R.PAPEIS[papel]) throw new Error("Perfil «" + papel + "» não existe. Peça ao administrador do órgão para conferir o seu login.");
    if (R.ACOES.indexOf(acao) < 0) throw new Error("Ação «" + acao + "» não existe no CPLPRO.");
    if (!pode(papel, acao)) {
      throw new Error("O perfil «" + R.PAPEIS[papel].nome + "» não pode " + (R.ACOES_ROTULO[acao] || acao) + ". Peça a quem tem esse perfil ou ao administrador do órgão.");
    }
    return true;
  }
  function exigirSePapel(quem, acao) { var pp = quemPapel(quem); if (pp) exigir(pp, acao); }

  /* ------------------------------------------------------------------ *
   * Processo e trilho de 10 passos
   * ------------------------------------------------------------------ */
  var PASSOS = [
    { id: "demanda", ordem: 1, nome: "Demanda (DFD)" },
    { id: "acervo", ordem: 2, nome: "Acervo do processo" },
    { id: "quantitativos", ordem: 3, nome: "Quantitativos" },
    { id: "etp", ordem: 4, nome: "ETP" },
    { id: "riscos", ordem: 5, nome: "Riscos" },
    { id: "orcamento", ordem: 6, nome: "Orçamento de referência" },
    { id: "tr", ordem: 7, nome: "TR / Projeto básico" },
    { id: "parametros", ordem: 8, nome: "Parâmetros do edital" },
    { id: "minuta", ordem: 9, nome: "Minuta e anexos" },
    { id: "conformidade", ordem: 10, nome: "Conformidade e publicação" }
  ];

  function hash8(s) {
    var h = 5381, i, str = String(s);
    for (i = 0; i < str.length; i++) { h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; }   /* >>> 0: sem sinal. Com `%` o hash ia a negativo e o código saía «Processo -E18D4» (10/11/2026). O id é GRAVADO ao criar o processo (e o código exibido só recorta o id), então processo existente não muda; só os novos ids saem sem o sinal. */
    var x = h.toString(16);
    while (x.length < 8) x = "0" + x;
    return x;
  }

  function novoProcesso(dados, quem, agoraISO) {
    var d = dados && typeof dados === "object" ? dados : {};
    var passos = {};
    PASSOS.forEach(function (ps) { passos[ps.id] = { conferido: false }; });
    var id = !vazio(d.id) ? String(d.id) : "prc-" + hash8(String(agoraISO) + "|" + String(d.objeto) + "|" + String(d.secretaria));
    var p = {
      id: id, versao: 1,
      obraId: vazio(d.obraId) ? null : d.obraId,
      orcamentoId: vazio(d.orcamentoId) ? null : d.orcamentoId,
      criadoEm: vazio(agoraISO) ? null : agoraISO, atualizadoEm: vazio(agoraISO) ? null : agoraISO,
      autor: quemNome(quem),
      tipoObjeto: vazio(d.tipoObjeto) ? null : d.tipoObjeto,
      secretaria: vazio(d.secretaria) ? null : d.secretaria,
      objeto: vazio(d.objeto) ? null : d.objeto,
      justificativa: vazio(d.justificativa) ? null : d.justificativa,
      pca: vazio(d.pca) ? null : d.pca,
      regulamentoId: vazio(d.regulamentoId) ? null : d.regulamentoId,
      recursoFederal: d.recursoFederal === true ? true : (d.recursoFederal === false ? false : null),
      feriadosLocais: arr(d.feriadosLocais).slice(),
      dataPrevistaEdital: vazio(d.dataPrevistaEdital) ? null : d.dataPrevistaEdital,
      passos: passos,
      documentos: [], quantitativos: [],
      etp: { campos: {}, justificativas: {}, lacunas: [] },
      riscos: [],
      orcamentoRef: { base: null, competencia: null },
      tr: { objeto: null, medicao: null, recebimento: null },
      parametros: {},
      sigiloso: d.sigiloso === true ? true : (d.sigiloso === false ? false : null),
      pacote: null, parecer: null, pareceresAnteriores: [], status: "rascunho",
      historico: []
    };
    R.PARAMETROS_ORDEM.forEach(function (pid) { p.parametros[pid] = { valor: null, sugerido: null, regra: null, fonte: null, conferido: false }; });
    if (p.sigiloso !== null) p.parametros.sigiloso.valor = p.sigiloso;
    return p;
  }

  /* ---- progresso e pendências ---- */
  function pend(passo, campo, msg) { return { passo: passo, campo: campo, msg: msg, corrigir: { passo: passo, campo: campo } }; }

  function progressoPasso(p, id) {
    var pend_ = [], total = 0, feitos = 0;
    function campo(nome, valor, msg) { total++; if (vazio(valor)) pend_.push(pend(id, nome, msg)); else feitos++; }
    var t = p.tipoObjeto && R.TIPOS_OBJETO[p.tipoObjeto] ? R.TIPOS_OBJETO[p.tipoObjeto] : null;
    if (id === "demanda") {
      campo("objeto", p.objeto, "Descreva o objeto por inteiro.");
      campo("secretaria", p.secretaria, "Informe a secretaria requisitante.");
      campo("tipoObjeto", t ? p.tipoObjeto : null, "Escolha o tipo de objeto.");
      campo("justificativa", p.justificativa, "Escreva a justificativa da necessidade (interesse público).");
      campo("pca", p.pca, "Informe a previsão no plano de contratações anual (ou justifique a ausência).");
    } else if (id === "acervo") {
      if (!t) { total = 1; pend_.push(pend(id, "tipoObjeto", "Sem o tipo de objeto não há checklist do acervo.")); }
      else {
        checklistAcervo(p).forEach(function (c) {
          total++;
          if (c.situacao === "ok") feitos++; else pend_.push(pend(id, c.exigencia, "Falta: " + c.nome + " (" + c.porque + ")."));
        });
      }
    } else if (id === "quantitativos") {
      var qs = arr(p.quantitativos);
      if (!qs.length) { total = 1; pend_.push(pend(id, "quantitativos", "Nenhum quantitativo lançado.")); }
      else {
        total = qs.length;
        pendenciasQuantitativos(p).forEach(function (x) { pend_.push(x); });
        feitos = total - pend_.length;
      }
    } else if (id === "etp") {
      var ec = (p.etp && p.etp.campos) ? p.etp.campos : {}, ej = (p.etp && p.etp.justificativas) ? p.etp.justificativas : {};
      R.ETP_ELEMENTOS.forEach(function (el) {
        total++;
        if (!vazio(ec[el.id]) || (!el.obrigatorio && !vazio(ej[el.id]))) feitos++;
        else pend_.push(pend(id, el.id, el.obrigatorio ? "ETP, elemento " + el.id + " é obrigatório (art. 18, §2º): " + el.nome + "." : "ETP, elemento " + el.id + ": preencha ou justifique por que não se aplica."));
      });
    } else if (id === "riscos") {
      var rs = arr(p.riscos);
      if (!rs.length) { total = 1; pend_.push(pend(id, "riscos", "Nenhum risco avaliado; use a biblioteca do tipo de objeto.")); }
      else {
        rs.forEach(function (r, i) {
          total++;
          if (vazio(r.alocacao) || !ehNum(r.prob) || !ehNum(r.impacto)) pend_.push(pend(id, "riscos." + i, "Risco «" + r.descricao + "»: falta alocação, probabilidade ou impacto."));
          else feitos++;
        });
      }
    } else if (id === "orcamento") {
      campo("orcamentoId", p.orcamentoId, "Vincule o orçamento de referência.");
      campo("base", p.orcamentoRef ? p.orcamentoRef.base : null, "Declare a base de preços do orçamento.");
      campo("competencia", p.orcamentoRef ? p.orcamentoRef.competencia : null, "Declare a competência (data-base) do orçamento.");
      /* leva L: o que o «Montar a partir da pasta» deixou para a pessoa conferir (nunca some sozinho) */
      var po = p.preparo && p.preparo.orcamento ? p.preparo.orcamento : null;
      if (po && po.leituraPdf && po.leituraPdf.ok !== true && po.leituraPdf.conferida !== true) {
        total++; pend_.push(pend(id, "leituraPdf", "Conferir a leitura do PDF da planilha (nota " + po.leituraPdf.nota + "): " + (po.leituraPdf.motivos && po.leituraPdf.motivos.length ? po.leituraPdf.motivos.join("; ") : "a leitura automática não passou na conferência") + "."));
      }
      if (p.preparo && p.preparo.oferta && p.preparo.oferta.escopo && vazio(p.orcamentoId)) {
        total++; pend_.push(pend(id, "orcamentoPeloEscopo", "A pasta não tem planilha orçamentária: use «Orçar pelo escopo (IA)» (a cobrança por uso é confirmada antes de qualquer IA) ou salve a planilha em .xlsx e monte de novo."));
      }
    } else if (id === "tr") {
      campo("objeto", p.tr ? p.tr.objeto : null, "TR/PB: falta a descrição do objeto.");
      campo("medicao", p.tr ? p.tr.medicao : null, "TR/PB: falta o critério de medição.");
      campo("recebimento", p.tr ? p.tr.recebimento : null, "TR/PB: falta o critério de recebimento.");
    } else if (id === "parametros") {
      R.PARAMETROS_ORDEM.forEach(function (pid) {
        var v = p.parametros && p.parametros[pid] ? p.parametros[pid].valor : null;
        if (pid === "sigiloso" && vazio(v)) v = p.sigiloso;
        total++;
        if (vazio(v)) pend_.push(pend(id, pid, "Parâmetro «" + R.PARAMETROS[pid].nome + "» sem valor: " + R.PARAMETROS[pid].fonte + "."));
        else feitos++;
      });
    } else if (id === "minuta") {
      total = 1;
      if (p.pacote && p.pacote.geradoEm) feitos = 1; else pend_.push(pend(id, "pacote", "A minuta e os anexos ainda não foram gerados."));
    } else if (id === "conformidade") {
      total = 2;
      if (p.parecer) feitos++; else pend_.push(pend(id, "parecer", "Falta o parecer jurídico (art. 53)."));
      if (fluxoJuridico.podePublicar(p)) feitos++; else pend_.push(pend(id, "publicacao", "Publicação trancada: parecer ausente, desfavorável ou com ressalva sem resposta/ciência."));
    }
    var pct = total ? Math.floor(feitos * 100 / total) : 0;
    var conf = p.passos && p.passos[id] ? p.passos[id].conferido === true : false;
    return { id: id, pct: pct, pendencias: pend_, conferido: conf };
  }

  function progresso(p) {
    var porPasso = {}, soma = 0, todas = [], pronto = true;
    PASSOS.forEach(function (ps) {
      var r = progressoPasso(p, ps.id);
      porPasso[ps.id] = r; soma += r.pct;
      r.pendencias.forEach(function (x) { todas.push(x); });
      if (r.pct < 100 || !r.conferido) pronto = false;
    });
    return { passos: porPasso, geral: Math.floor(soma / PASSOS.length), pendencias: todas, pronto: pronto };
  }

  /* ------------------------------------------------------------------ *
   * Tipo de objeto pelo texto do DFD
   * ------------------------------------------------------------------ */
  function sugerirTipoObjeto(texto) {
    var t = normNome(texto), out = [], ordem = 0;
    if (!t) return out;
    Object.keys(R.TIPOS_OBJETO).forEach(function (id) {
      var termos = [], pontos = 0;
      R.TIPOS_OBJETO[id].palavras.forEach(function (w) {
        var re = new RegExp("(^| )" + esc(normNome(w)) + "(s|es)?( |$)");
        if (re.test(t)) { termos.push(w); pontos += (w.indexOf(" ") >= 0 ? 2 : 1); }
      });
      if (pontos) out.push({ tipo: id, pontos: pontos, termos: termos, _o: ordem });
      ordem++;
    });
    out.sort(function (a, b) { return b.pontos - a.pontos || a._o - b._o; });
    out.forEach(function (x) { delete x._o; });
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Acervo: classificação, dedupe, revisão, checklist
   * ------------------------------------------------------------------ */
  var RE_REV = /(?:^| )(?:rev(?:isao)?|r) ?(\d{1,2})(?= |$)/;
  function lerRevisao(nomeNorm) {
    var m = RE_REV.exec(nomeNorm);
    if (!m) return { revisao: null, revisaoNum: null, trecho: null };
    var n = parseInt(m[1], 10);
    return { revisao: "R" + (n < 10 ? "0" : "") + n, revisaoNum: n, trecho: m[0] };
  }
  var RE_CACHE = {};
  function reTipo(id) {
    if (!RE_CACHE[id]) RE_CACHE[id] = R.ACERVO_TIPOS[id].regex ? new RegExp(R.ACERVO_TIPOS[id].regex, "i") : null;
    return RE_CACHE[id];
  }

  /* Classificação PELO TEXTO (páginas 1 e 2 do PDF, já lidas por quem chama; este motor é puro). Soma o peso das frases
     de carimbo de cada tipo (R.ACERVO_TEXTO); só sugere com soma >= R.LIMITE_TEXTO — palavra solta não classifica. */
  var RE_TEXTO_CACHE = {};
  function reFrase(f) {
    if (!RE_TEXTO_CACHE[f]) RE_TEXTO_CACHE[f] = new RegExp("(^| )" + esc(f).replace(/ /g, " ") + "( |$)");
    return RE_TEXTO_CACHE[f];
  }
  function classificarTexto(textoBruto) {
    var t = normNome(String(textoBruto === undefined || textoBruto === null ? "" : textoBruto).substring(0, 60000)), melhor = null;
    if (!t) return null;
    Object.keys(R.ACERVO_TEXTO).forEach(function (id) {
      var soma = 0, frases = [];
      R.ACERVO_TEXTO[id].forEach(function (par) {
        if (reFrase(par[0]).test(t)) { soma += par[1]; frases.push(par[0]); }
      });
      if (soma < R.LIMITE_TEXTO) return;
      if (!melhor || soma > melhor.soma || (soma === melhor.soma && R.ACERVO_TIPOS[id].prioridade > R.ACERVO_TIPOS[melhor.tipo].prioridade)) melhor = { tipo: id, soma: soma, frases: frases };
    });
    return melhor;
  }

  function classificarArquivo(arq) {
    var a = arq || {};
    var nomeBruto = String(a.nome === undefined || a.nome === null ? "" : a.nome);
    var ext = !vazio(a.ext) ? String(a.ext).replace(/^\./, "").toLowerCase() : (/\.([A-Za-z0-9]+)$/.exec(nomeBruto) ? /\.([A-Za-z0-9]+)$/.exec(nomeBruto)[1].toLowerCase() : "");
    var semExt = nomeBruto.replace(/\.[A-Za-z0-9]{1,5}$/, "");
    var nome = normNome(semExt), porTexto = null;
    var rev = lerRevisao(nome);
    var base = rev.trecho ? nome.replace(rev.trecho, " ") : nome;
    var melhor = null;
    Object.keys(R.ACERVO_TIPOS).forEach(function (id) {
      var re = reTipo(id);
      if (!re) return;
      var tipo = R.ACERVO_TIPOS[id], score = 0, motivo = null, mn = re.exec(nome);
      if (mn) { score = 10 + mn[0].length / 100; motivo = "nome contém «" + mn[0] + "»"; }
      if (!score) return;
      if (tipo.extensoes.indexOf(ext) >= 0) score += 0.5;
      if (!melhor || score > melhor.score || (score === melhor.score && tipo.prioridade > R.ACERVO_TIPOS[melhor.tipo].prioridade)) {
        melhor = { tipo: id, score: score, motivo: motivo, doNome: !!mn };
      }
    });
    /* o nome não bastou: o texto das páginas 1 e 2 do PDF decide (sempre confiança baixa — a pessoa confirma) */
    if (!melhor && !vazio(a.texto)) {
      porTexto = classificarTexto(a.texto);
      if (porTexto) melhor = { tipo: porTexto.tipo, score: 4, motivo: "classificado pelo conteúdo do PDF (páginas 1 e 2): " + porTexto.frases.map(function (f) { return "«" + f + "»"; }).join(", "), doNome: false, doConteudo: true };
    }
    if (!melhor && R.ACERVO_TIPOS.fotos.extensoes.indexOf(ext) >= 0) melhor = { tipo: "fotos", score: 1, motivo: "extensão de imagem", doNome: false };
    var tipoId = melhor ? melhor.tipo : "outros";
    var conf = !melhor ? "baixa" : (melhor.doNome && R.ACERVO_TIPOS[tipoId].extensoes.indexOf(ext) >= 0 ? "alta" : (melhor.doNome ? "media" : "baixa"));
    return {
      tipo: tipoId, disciplina: R.ACERVO_TIPOS[tipoId].disciplina,
      revisao: rev.revisao, revisaoNum: rev.revisaoNum, confianca: conf,
      motivo: melhor ? melhor.motivo : "nenhuma regra do acervo reconheceu o nome",
      porConteudo: !!(melhor && melhor.doConteudo),
      nomeBase: base.replace(/\s+/g, " ").replace(/^ | $/g, ""), ext: ext
    };
  }

  function docVigente(d) { return vazio(d.superadoPor); }

  function recalcularSuperados(docs) {
    docs.forEach(function (d) { if (d.superadoMotivo === "revisao") { d.superadoPor = null; d.superadoMotivo = null; } });
    var grupos = {};
    docs.forEach(function (d) {
      if (!docVigente(d)) return;
      var k = d.tipo + "|" + d.nomeBase;
      (grupos[k] = grupos[k] || []).push(d);
    });
    Object.keys(grupos).forEach(function (k) {
      var g = grupos[k];
      if (g.length < 2) return;
      var max = null;
      g.forEach(function (d) { var n = d.revisaoNum === null ? -1 : d.revisaoNum; if (max === null || n > max) max = n; });
      var vencedores = g.filter(function (d) { return (d.revisaoNum === null ? -1 : d.revisaoNum) === max; });
      var venc = vencedores[0];
      g.forEach(function (d) {
        var n = d.revisaoNum === null ? -1 : d.revisaoNum;
        if (n < max) { d.superadoPor = venc.id; d.superadoMotivo = "revisao"; }
      });
    });
  }

  function adicionarDocumentos(p, arqs) {
    var q = clone(p);
    q.documentos = arr(q.documentos);
    arr(arqs).forEach(function (a) {
      var nome = a && a.nome !== undefined ? String(a.nome) : "";
      var sha = vazio(a && a.sha) ? null : String(a.sha);
      var ja = q.documentos.filter(function (d) { return d.nome === nome && d.sha === sha; })[0];
      if (ja) return;                                   // mesma operação 2x = mesmo resultado
      var c = classificarArquivo(a);
      var id = "doc-" + (sha ? sha.substring(0, 12) : hash8(nome));
      var primeiro = sha ? q.documentos.filter(function (d) { return d.sha === sha && d.superadoMotivo !== "repetido"; })[0] : null;
      var doc = {
        id: id, nome: nome, sha: sha, tipo: c.tipo, disciplina: c.disciplina, revisao: c.revisao, revisaoNum: c.revisaoNum,
        nomeBase: c.nomeBase, confianca: c.confianca, motivo: c.motivo, porConteudo: c.porConteudo,
        rt: a && !vazio(a.rt) ? a.rt : null, origem: a && !vazio(a.origem) ? a.origem : null, data: a && !vazio(a.data) ? a.data : null,
        superadoPor: null, superadoMotivo: null
      };
      if (primeiro) {
        doc.id = id + "-" + (q.documentos.filter(function (d) { return d.sha === sha; }).length + 1);
        doc.superadoPor = primeiro.id; doc.superadoMotivo = "repetido";
      }
      q.documentos.push(doc);
    });
    recalcularSuperados(q.documentos);
    return q;
  }

  function checklistAcervo(p) {
    var t = p && R.TIPOS_OBJETO[p.tipoObjeto];
    if (!t) return [];
    var docs = arr(p.documentos).filter(docVigente);
    return t.documentosExigidos.map(function (id) {
      var tem = docs.filter(function (d) { return d.tipo === id; }).map(function (d) { return d.id; });
      return { exigencia: id, nome: R.ACERVO_TIPOS[id].nome, porque: t.porque[id], tem: tem, situacao: tem.length ? "ok" : "falta" };
    });
  }

  /* ------------------------------------------------------------------ *
   * Quantitativos e ETP
   * ------------------------------------------------------------------ */
  function temOrigem(it) {
    var o = it && it.origem;
    /* leva F: quantidade lida de planilha (xlsx) tem origem em ARQUIVO + LINHA; de projeto em PDF, ARQUIVO + PÁGINA */
    return !!(o && !vazio(o.arquivo) && (!vazio(o.pagina) || !vazio(o.linha)));
  }
  function pendenciasQuantitativos(p, itensOrcamento) {
    var itens = itensOrcamento !== undefined ? arr(itensOrcamento) : arr(p && p.quantitativos);
    var out = [];
    itens.forEach(function (it, i) {
      if (!temOrigem(it)) {
        var ref = !vazio(it.item) ? it.item : (!vazio(it.itemRef) ? it.itemRef : i + 1);
        out.push({ passo: "quantitativos", campo: "origem", item: ref,
          msg: "Item " + ref + ": quantidade sem origem (arquivo e página). Sem origem não entra no ETP nem no TR.",
          corrigir: { passo: "quantitativos", campo: "origem", item: ref } });
      }
    });
    return out;
  }
  function quantitativosValidos(p) { return arr(p && p.quantitativos).filter(temOrigem); }

  function etpCampos(p, ctx) {
    var c = ctx || {}, man = (p.etp && p.etp.campos) ? p.etp.campos : {}, just = (p.etp && p.etp.justificativas) ? p.etp.justificativas : {};
    var campos = {}, lacunas = [];
    R.ETP_ELEMENTOS.forEach(function (el) { campos[el.id] = vazio(man[el.id]) ? null : man[el.id]; });
    if (campos.I === null && !vazio(p.justificativa)) campos.I = p.justificativa;
    if (campos.VII === null && !vazio(p.objeto)) campos.VII = p.objeto;
    var qs = arr(p.quantitativos), validos = qs.filter(temOrigem);
    var qtdPend = qs.length - validos.length;
    if (campos.IV === null && validos.length) {
      campos.IV = { itens: validos.length, comOrigem: validos.length, semOrigem: qtdPend, memoria: validos.map(function (q2) { return { item: q2.itemRef !== undefined ? q2.itemRef : q2.item, qtd: q2.qtd, un: q2.un, origem: q2.origem }; }) };
    }
    var orc = c.orcamento || {};
    if (campos.VI === null && ehNum(orc.total)) campos.VI = { total: orc.total, base: vazio(orc.base) ? null : orc.base, competencia: vazio(orc.competencia) ? null : orc.competencia };
    R.ETP_ELEMENTOS.forEach(function (el) {
      if (campos[el.id] === null) {
        if (el.obrigatorio) lacunas.push({ elemento: el.id, nivel: "vermelho", msg: "Obrigatório (art. 18, §2º): " + el.nome + "." });
        else if (vazio(just[el.id])) lacunas.push({ elemento: el.id, nivel: "justificar", msg: "Preencha ou justifique por que não se aplica: " + el.nome + "." });
      }
    });
    if (qtdPend > 0) lacunas.push({ elemento: "IV", nivel: "vermelho", msg: qtdPend + " quantitativo(s) sem origem ficam de fora da estimativa (art. 18, §1º, IV)." });
    return { campos: campos, lacunas: lacunas, fonte: R.ETP_FONTE };
  }

  /* ------------------------------------------------------------------ *
   * Riscos
   * ------------------------------------------------------------------ */
  function riscosSugeridos(tipo) {
    var t = R.TIPOS_OBJETO[tipo];
    if (!t) return [];
    return t.riscos.map(function (id) {
      var r = clone(R.BIBLIOTECA_RISCOS[id]);
      r.fonte = "Biblioteca RA de riscos (texto sugerido — conferir); matriz de riscos: Lei 14.133/2021, art. 22";
      r.sugerido = true;
      return r;
    });
  }
  /* escala 5x5: 1–4 baixo · 5–9 médio · 10–14 alto · 15–25 crítico (escala da casa; o órgão pode adotar outra) */
  function nivelRisco(prob, impacto) {
    var a = numOuNull(prob), b = numOuNull(impacto);
    if (a === null || b === null || a < 1 || a > 5 || b < 1 || b > 5 || Math.floor(a) !== a || Math.floor(b) !== b) return null;
    var v = a * b;
    return { valor: v, nivel: v >= 15 ? "critico" : (v >= 10 ? "alto" : (v >= 5 ? "medio" : "baixo")) };
  }

  /* ------------------------------------------------------------------ *
   * Pesquisa de preços
   * ------------------------------------------------------------------ */
  function regulamentoEfetivo(p) {
    if (p && p.recursoFederal === true) return R.REGULAMENTOS["federal-14133"];
    return p && p.regulamentoId && R.REGULAMENTOS[p.regulamentoId] ? R.REGULAMENTOS[p.regulamentoId] : null;
  }

  function mediana(vals) {
    var s = vals.slice().sort(function (x, y) { return x - y; }), n = s.length;
    if (!n) return null;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }

  /* valida UMA fonte contra a regra do nível do regulamento. Devolve {ok, motivo, vermelho, valor} */
  function validarFonte(f, regra, ctx) {
    var v = numOuNull(f.valor);
    if (v === null || v <= 0) return { ok: false, motivo: "valor ausente ou inválido", vermelho: false };
    var valor = v;
    if (regra.tipo === "sistema_oficial" && regra.bases && regra.bases.indexOf(String(f.base).toUpperCase()) < 0) {
      return { ok: false, motivo: "base «" + f.base + "» não é a base oficial do regulamento (" + regra.bases.join("/") + ")", vermelho: false };
    }
    if (regra.exigeDataHora) {
      var dh = lerData(f.dataAcesso);
      if (!dh || !/^([01]\d|2[0-3]):[0-5]\d/.test(String(f.horaAcesso === undefined || f.horaAcesso === null ? "" : f.horaAcesso))) {
        return { ok: false, motivo: "sem data e hora de acesso (exigido por " + regra.fonte + ")", vermelho: true };
      }
    }
    if (regra.validade && regra.validade.ref === "dataPrevistaEdital") {
      var ed = lerData(ctx.dataPrevistaEdital), col = lerData(f.dataColeta);
      if (!ed) return { ok: false, motivo: "sem data prevista do edital para conferir a validade da cotação", vermelho: true, pendencia: "Informe a data prevista do edital." };
      if (!col) return { ok: false, motivo: "cotação sem data de coleta", vermelho: true };
      var lim = somaMeses(col, regra.validade.meses);
      if (lim.getTime() < ed.getTime()) return { ok: false, motivo: "cotação de " + dataISO(col) + " vencida: passa de " + regra.validade.meses + " meses até a data prevista do edital (" + dataISO(ed) + ")", vermelho: true };
    }
    if (regra.validade && regra.validade.ref === "dataPesquisa") {
      var pesq = lerData(ctx.dataPesquisa);
      if (!pesq) return { ok: false, motivo: "sem data da pesquisa para conferir a validade da contratação similar", vermelho: true, pendencia: "Informe a data da pesquisa de preços." };
      if (f.emExecucao !== true) {
        var fim = lerData(f.dataConclusao);
        if (!fim) return { ok: false, motivo: "contratação similar sem data de conclusão (e não marcada em execução)", vermelho: true };
        if (somaMeses(fim, 12).getTime() < pesq.getTime()) return { ok: false, motivo: "contratação concluída em " + dataISO(fim) + ": passa de 1 ano antes da data da pesquisa (" + dataISO(pesq) + ")", vermelho: true };
      }
      if (regra.exigeIndice) {
        var fator = numOuNull(f.fatorAtualizacao);
        if (fator === null || fator <= 0) return { ok: false, motivo: "contratação similar sem índice de atualização de preços", vermelho: true };
        valor = deCent(cent(valor * fator));
      }
    }
    return { ok: true, motivo: null, vermelho: false, valor: valor };
  }

  function avaliarItem(item, fontes, regulamento, ctx) {
    var c = ctx || {}, reg = regulamento, lista = arr(fontes);
    var res = {
      item: item && item.item !== undefined ? item.item : null, regulamentoId: reg ? reg.id : null,
      valor: null, metodo: null, fontesUsadas: [], descartadas: [], vermelhas: [], pendencias: [],
      justificativaObrigatoria: false, regraDescarte: null, avisoDescarte: null, situacao: "pendente", fonte: reg ? reg.fonte : null
    };
    if (!reg) { res.pendencias.push("Regulamento de pesquisa de preços não definido para o processo."); return res; }
    var minimo = reg.calculo.minimoPrecos;

    /* 1) base oficial: item com código numa base do regulamento → 1 fonte basta */
    var regraOficial = reg.ordem[0];
    if (regraOficial.umaFonteBasta && item && !vazio(item.codigo)) {
      var oficiais = lista.map(function (f, i) { return { f: f, i: i }; }).filter(function (x) {
        return x.f.tipo === "sistema_oficial" && regraOficial.bases.indexOf(String(x.f.base).toUpperCase()) >= 0 && numOuNull(x.f.valor) !== null && numOuNull(x.f.valor) > 0;
      });
      if (oficiais.length) {
        res.valor = numOuNull(oficiais[0].f.valor); res.metodo = "base_oficial";
        res.fontesUsadas.push({ indice: oficiais[0].i, tipo: "sistema_oficial", base: oficiais[0].f.base, valor: res.valor, regra: regraOficial.fonte });
        res.situacao = "ok";
        return res;
      }
    }

    /* 2) percorre as fontes na ORDEM do regulamento, valida e acumula */
    var validos = [], parar = false;
    res.naoUsadas = [];
    reg.ordem.forEach(function (regra) {
      if (parar) {
        lista.forEach(function (f, i) { if (f.tipo === regra.tipo) res.naoUsadas.push({ indice: i, tipo: f.tipo, motivo: "o conjunto já estava completo em nível anterior da ordem do regulamento" }); });
        return;
      }
      lista.forEach(function (f, i) {
        if (f.tipo !== regra.tipo) return;
        var v = validarFonte(f, regra, c);
        if (v.ok) {
          validos.push({ indice: i, tipo: f.tipo, valor: v.valor, nivel: regra.ordem, regra: regra.fonte, fornecedor: vazio(f.fornecedor) ? null : f.fornecedor, link: vazio(f.link) ? null : f.link });
        } else {
          res.descartadas.push({ indice: i, tipo: f.tipo, motivo: v.motivo, vermelho: v.vermelho, regra: regra.fonte });
          if (v.vermelho) res.vermelhas.push({ indice: i, tipo: f.tipo, motivo: v.motivo });
          if (v.pendencia && res.pendencias.indexOf(v.pendencia) < 0) res.pendencias.push(v.pendencia);
        }
      });
      if (validos.length >= minimo) parar = true;
    });
    lista.forEach(function (f, i) {
      var previsto = reg.ordem.some(function (r) { return r.tipo === f.tipo; });
      if (!previsto) res.descartadas.push({ indice: i, tipo: f.tipo, motivo: "fonte do tipo «" + f.tipo + "» não é prevista no regulamento " + reg.id, vermelho: false, regra: reg.fonte });
    });

    /* 3) regra de descarte configurável (relativa à mediana); sem regra = não descarta e diz isso */
    var rd = c.regraDescarte;
    if (rd && (ehNum(rd.abaixoPct) || ehNum(rd.acimaPct)) && validos.length) {
      var med = mediana(validos.map(function (x) { return x.valor; }));
      res.regraDescarte = { abaixoPct: ehNum(rd.abaixoPct) ? rd.abaixoPct : null, acimaPct: ehNum(rd.acimaPct) ? rd.acimaPct : null, mediana: med };
      var mantidos = [];
      validos.forEach(function (x) {
        var abaixo = ehNum(rd.abaixoPct) && x.valor < med * (1 - rd.abaixoPct / 100) - 1e-9;
        var acima = ehNum(rd.acimaPct) && x.valor > med * (1 + rd.acimaPct / 100) + 1e-9;
        if (abaixo || acima) {
          res.descartadas.push({ indice: x.indice, tipo: x.tipo, motivo: (abaixo ? "abaixo de " + rd.abaixoPct + "% da mediana (" : "acima de " + rd.acimaPct + "% da mediana (") + med + ")", vermelho: false, regra: "regra de descarte configurada pelo órgão" });
        } else mantidos.push(x);
      });
      validos = mantidos;
    } else {
      res.avisoDescarte = "Nenhuma regra de descarte configurada: nenhum preço foi descartado por discrepância.";
    }
    res.fontesUsadas = validos;

    /* 4) mínimo de preços */
    if (validos.length < minimo) {
      res.justificativaObrigatoria = true;
      res.pendencias.push("Menos de " + minimo + " preços válidos (" + validos.length + "): justificativa obrigatória aprovada pela autoridade (" + reg.calculo.fonte + ").");
    }
    if (!validos.length) { res.situacao = "sem_fonte"; res.pendencias.push("Nenhuma fonte válida para o item."); return res; }

    /* 5) método de cálculo escolhido (sem método = pendência) */
    var m = c.metodo, vals = validos.map(function (x) { return x.valor; });
    if (reg.calculo.metodos.indexOf(m) < 0) {
      res.pendencias.push("Escolha o método de cálculo do preço de referência (média, mediana ou menor valor).");
      res.situacao = "pendente";
      return res;
    }
    var bruto = m === "media" ? somaCent(vals.map(cent)) / vals.length / 100 : (m === "mediana" ? mediana(vals) : Math.min.apply(null, vals));
    res.valor = valorArred(bruto, c); res.metodo = m;
    res.situacao = res.justificativaObrigatoria || res.pendencias.length ? "justificativa" : "ok";
    return res;
  }

  /* Mapa da pesquisa de preços: total = soma das linhas ao centavo. */
  function mapaPrecos(itens, avaliacoes, ctx) {
    var linhas = [], cs = [];
    arr(itens).forEach(function (it, i) {
      var av = arr(avaliacoes)[i];
      var unit = av && ehNum(av.valor) ? av.valor : null, qtd = numOuNull(it.qtd), tot = null;
      if (unit !== null && qtd !== null) { tot = valorArred(qtd * unit, ctx); cs.push(cent(tot)); }
      linhas.push({ item: it.item, descricao: it.descricao, un: it.un, qtd: qtd, unitario: unit, total: tot, situacao: av ? av.situacao : "sem_avaliacao", metodo: av ? av.metodo : null });
    });
    return { linhas: linhas, total: deCent(somaCent(cs)), semPreco: linhas.filter(function (l) { return l.total === null; }).length };
  }

  var pesquisaPrecos = { avaliarItem: avaliarItem, regulamentoEfetivo: regulamentoEfetivo, mapa: mapaPrecos };

  /* ------------------------------------------------------------------ *
   * Parâmetros do edital
   * ------------------------------------------------------------------ */
  function parcelasRelevancia(linhas, total) {
    var tc = cent(total), out = [];
    if (tc === null || tc <= 0) return out;
    arr(linhas).forEach(function (l) {
      var vc = cent(l.total !== undefined ? l.total : l.valor);
      if (vc === null) return;
      if (vc * 100 >= 4 * tc) {                    // ≥ 4% do total, em centavos inteiros (4,00% entra; 3,99% fora)
        var q = numOuNull(l.qtd);
        out.push({ item: l.item, descricao: l.descricao, valor: deCent(vc), pct: Arred.valor(vc * 100 / tc, "truncar2"), qtd: q, un: l.un,
          qtdMaxExigivel: q === null ? null : q / 2, fonte: "Lei 14.133/2021, art. 67, §§1º e 2º" });
      }
    });
    return out;
  }

  function sug(p, id, sugerido, regra) {
    var cur = p && p.parametros && p.parametros[id] ? p.parametros[id].valor : null;
    var def = R.PARAMETROS[id];
    return { id: id, valor: vazio(cur) ? null : cur, sugerido: sugerido, regra: regra, fonte: def.fonte, conferir: def.conferir === true, pendencias: [] };
  }

  var parametros = {
    sugerir: function (p, ctx) {
      var c = ctx || {}, tipoId = c.tipoObjeto !== undefined ? c.tipoObjeto : (p ? p.tipoObjeto : null);
      var t = R.TIPOS_OBJETO[tipoId] || null, out = {}, semTipo = "Informe o tipo de objeto para o sistema sugerir.";
      var x;
      x = sug(p, "modalidade", t ? (t.servicoComumEngenharia ? "pregão ou concorrência" : "concorrência") : null,
        t ? (t.servicoComumEngenharia ? "Serviço comum de engenharia admite pregão ou concorrência." : "Obra e serviço especial de engenharia: concorrência; pregão não se aplica.") : semTipo);
      if (!t) x.pendencias.push(semTipo);
      out.modalidade = x;
      x = sug(p, "criterio_julgamento", t && tipoId !== "servico_engenharia_especial" ? "menor preço" : null,
        t ? (tipoId === "servico_engenharia_especial" ? "Serviço especial: menor preço, maior desconto ou técnica e preço; decisão do órgão (art. 36 exige justificativa para técnica)." : "Obra e serviço comum: menor preço é o critério usual; alternativas: maior desconto, técnica e preço (justificar).") : semTipo);
      x.opcoes = R.PARAMETROS.criterio_julgamento.opcoes; out.criterio_julgamento = x;
      x = sug(p, "regime_execucao", null, "Sem padrão: decisão do órgão. Contratação integrada parte de anteprojeto.");
      x.opcoes = R.PARAMETROS.regime_execucao.opcoes; out.regime_execucao = x;
      x = sug(p, "sigiloso", null, "Escolha explícita, sem padrão. Sim liga a trava de vazamento do valor estimado.");
      if (vazio(x.valor) && p && (p.sigiloso === true || p.sigiloso === false)) x.valor = p.sigiloso;
      x.opcoes = [true, false]; out.sigiloso = x;
      var pr = ehNum(c.totalEstimado) && arr(c.linhas).length ? parcelasRelevancia(c.linhas, c.totalEstimado) : null;
      x = sug(p, "parcelas_relevancia", pr, "Itens com valor igual ou maior que 4% do total estimado; quantidade mínima exigível até 50% da parcela.");
      if (pr === null) x.pendencias.push("Informe o total estimado e as linhas do orçamento para calcular as parcelas de maior relevância.");
      out.parcelas_relevancia = x;
      var gv = ehNum(c.valorGrandeVulto) && ehNum(c.totalEstimado) ? c.totalEstimado >= c.valorGrandeVulto : null;
      x = sug(p, "garantia_contrato", { pctMax: 5, pctMaxComJustificativa: 10, grandeVulto: gv, seguroGarantiaRetomadaPctMax: 30 },
        "Garantia até 5%; até 10% com justificativa de complexidade e risco; obra de grande vulto: seguro-garantia com cláusula de retomada até 30%.");
      if (gv === null) { x.conferir = true; x.pendencias.push("Valor de obra de grande vulto não informado: é atualizado por decreto (conferir); sem ele não se sabe se vale o seguro-garantia com retomada."); }
      out.garantia_contrato = x;
      out.exequibilidade = sug(p, "exequibilidade", { inexequivelAbaixoPct: 75, garantiaAdicionalAbaixoPct: 85 }, "Abaixo de 75% do orçado: inexequível; abaixo de 85%: garantia adicional igual à diferença.");
      x = sug(p, "reajuste", { indice: null, dataBase: vazio(c.dataBaseOrcamento) ? null : c.dataBaseOrcamento }, "Índice sem padrão (decisão do órgão); data-base igual à data do orçamento estimado.");
      x.pendencias.push("Escolha o índice de reajuste." );
      if (x.sugerido.dataBase === null) x.pendencias.push("Informe a data do orçamento estimado (data-base do reajuste).");
      out.reajuste = x;
      x = sug(p, "aditivo_teto", t ? { acrescimoPct: t.reforma ? 50 : 25, supressaoPct: 25 } : null, t ? (t.reforma ? "Reforma de edifício ou equipamento: acréscimo até 50%; supressão até 25%." : "Acréscimos e supressões até 25%.") : semTipo);
      if (!t) x.pendencias.push(semTipo);
      out.aditivo_teto = x;
      out.recurso_prazo = sug(p, "recurso_prazo", { diasUteis: 3 }, "Prazo de recurso: 3 dias úteis.");
      ["visita_tecnica", "consorcio", "subcontratacao", "amostra", "me_epp"].forEach(function (id) {
        var y = sug(p, id, null, R.PARAMETROS[id].como);
        y.opcoes = [true, false]; y.pendencias.push("Responda sim ou não: o sistema não tem valor padrão."); out[id] = y;
      });
      return out;
    },
    parcelasRelevancia: parcelasRelevancia
  };

  /* ------------------------------------------------------------------ *
   * Prazo mínimo de publicação (dias úteis)
   * ------------------------------------------------------------------ */
  function ehFeriadoNacional(d, cacheAno) {
    var ano = d.getFullYear();
    if (!cacheAno[ano]) {
      cacheAno[ano] = {};
      Feriados.doAno(ano).forEach(function (f) { if (f.tipo === "nacional") cacheAno[ano][f.data] = f.nome; });
    }
    return !!cacheAno[ano][dataISO(d)];
  }

  /* Contagem (art. 183): exclui o dia da publicação, inclui o do vencimento; pula sábado,
   * domingo, feriado NACIONAL (Feriados.doAno, tipo "nacional") e os locais do processo.
   * Ponto facultativo (Carnaval, Corpus Christi) NÃO é pulado — conferir com o regulamento
   * do órgão; `opcoes.pularFacultativos = true` pula. A data mínima de ABERTURA é o último
   * dia do prazo (o dia útil de ordem N depois da publicação). */
  function diasUteisDepois(iso, n, feriadosLocais, opcoes) {
    var d = lerData(iso);
    if (!d || !ehNum(n)) return null;
    var cache = {}, locais = {}, pular = opcoes && opcoes.pularFacultativos === true, contados = 0;
    arr(feriadosLocais).forEach(function (s) { if (lerData(s)) locais[String(s).substring(0, 10)] = true; });
    var guarda = 0;
    while (contados < n && guarda < 4000) {
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12, 0, 0);
      guarda++;
      var dow = d.getDay();
      if (dow === 0 || dow === 6) continue;
      if (locais[dataISO(d)]) continue;
      if (ehFeriadoNacional(d, cache)) continue;
      if (pular) {
        var ano = d.getFullYear(), fac = Feriados.doAno(ano).some(function (f) { return f.tipo === "facultativo" && f.data === dataISO(d); });
        if (fac) continue;
      }
      contados++;
    }
    return dataISO(d);
  }

  function prazoPublicacao(dataPublicacaoISO, criterio, regime, natureza, feriadosLocais, opcoes) {
    var regras = {}, dias = null, regraId = null;
    R.PRAZO_PUBLICACAO.regras.forEach(function (r) { regras[r.id] = r; });
    var cr = norm(criterio).replace(/[ -]+/g, "_"), rg = norm(regime).replace(/[ -]+/g, "_"), nat = norm(natureza).replace(/[ -]+/g, "_");
    if (/integrada/.test(rg) && !/semi/.test(rg)) regraId = "contratacao_integrada";
    else if (/semi/.test(rg)) regraId = "semi_integrada";
    else if (cr === "maior_lance") regraId = "maior_lance";
    else if (cr === "tecnica_e_preco" || cr === "melhor_tecnica" || cr === "tecnica_preco") regraId = "tecnica_preco";
    else if (cr === "menor_preco" || cr === "maior_desconto") {
      if (/comum/.test(nat)) regraId = "menor_preco_comum";
      else if (/especial/.test(nat)) regraId = "menor_preco_especial";
    }
    var res = { diasUteis: null, dataMinimaAbertura: null, regra: null, fonte: R.PRAZO_PUBLICACAO.fonte, conferir: true,
      contagem: R.PRAZO_PUBLICACAO.contagem, pendencias: [] };
    if (!regraId) { res.pendencias.push("Critério, regime ou natureza (comum/especial) insuficientes para definir o prazo mínimo do art. 55: informe-os."); return res; }
    dias = regras[regraId].dias; res.regra = regras[regraId];
    res.diasUteis = dias; res.fonte = regras[regraId].fonte; res.conferir = true;
    if (!lerData(dataPublicacaoISO)) { res.pendencias.push("Informe a data de publicação do edital."); return res; }
    res.dataMinimaAbertura = diasUteisDepois(dataPublicacaoISO, dias, feriadosLocais, opcoes);
    return res;
  }

  /* ------------------------------------------------------------------ *
   * Exequibilidade (art. 59, §§4º e 5º)
   * ------------------------------------------------------------------ */
  function exequibilidade(valorProposta, valorOrcado) {
    var pc = cent(valorProposta), oc = cent(valorOrcado);
    var res = { inexequivel: null, garantiaAdicional: null, pct: null, fonte: "Lei 14.133/2021, art. 59, §§4º e 5º", conferir: true };
    if (pc === null || oc === null || oc <= 0 || pc < 0) { res.erro = "Valor da proposta ou orçado ausente/inválido."; return res; }
    res.pct = Arred.valor(pc * 100 / oc, "truncar2");
    res.inexequivel = pc * 100 < 75 * oc;                       // < 75% do orçado (centavos inteiros)
    res.garantiaAdicional = pc * 100 < 85 * oc ? deCent(oc - pc) : 0; // < 85%: garantia igual à diferença
    return res;
  }

  /* ------------------------------------------------------------------ *
   * Análise da proposta contra a referência (F4) — não decide, sugere.
   * Casa pelo NÚMERO DO ITEM, nunca pela descrição.
   * Mapeamento achado → sugestão é da casa (conferir com o jurídico): só o que a lei
   * manda desclassificar (art. 59, III e §4º) sugere desclassificar; o resto, diligência.
   * ------------------------------------------------------------------ */
  var TOLERANCIA_CENTAVOS = 1;   // erro aritmético: diferença de até 1 centavo é arredondamento, não erro
  var F_LEI = "Lei 14.133/2021";

  function analisarProposta(referenciaLinhas, propostaLinhas, ctx) {
    var c = ctx || {}, achados = [], refs = {}, props = {}, vistos = {};
    function achado(item, tipo, grav, esperado, encontrado, fonte, sugestao) {
      achados.push({ item: item, tipo: tipo, gravidade: grav, esperado: esperado, encontrado: encontrado, fonte: fonte, sugestao: sugestao });
    }
    arr(referenciaLinhas).forEach(function (l) { refs[String(l.item).replace(/^\s+|\s+$/g, "")] = l; });
    arr(propostaLinhas).forEach(function (l) {
      var k = String(l.item).replace(/^\s+|\s+$/g, "");
      if (vistos[k]) achado(k, "item_duplicado", "alta", "uma linha por item", "item repetido na proposta", "Edital/TR (planilha da proposta)", "diligencia");
      vistos[k] = true; props[k] = l;
    });
    Object.keys(refs).forEach(function (k) {
      if (!props[k]) achado(k, "item_faltando", "alta", refs[k].descricao, "item ausente na proposta", "Edital/TR (planilha de referência é item travado)", "diligencia");
    });
    Object.keys(props).forEach(function (k) {
      var pr = props[k], rf = refs[k];
      if (!rf) { achado(k, "item_a_mais", "alta", "item não consta da referência", pr.descricao, "Edital/TR (planilha de referência é item travado)", "diligencia"); return; }
      if (normNome(pr.descricao) !== normNome(rf.descricao)) achado(k, "descricao_alterada", "alta", rf.descricao, pr.descricao, "Edital/TR (descrição do item é travada)", "diligencia");
      if (normNome(pr.un) !== normNome(rf.un)) achado(k, "unidade_alterada", "alta", rf.un, pr.un, "Edital/TR (unidade do item é travada)", "diligencia");
      var qr = numOuNull(rf.qtd), qp = numOuNull(pr.qtd);
      if (qr !== null && (qp === null || Math.abs(qp - qr) > 1e-9)) achado(k, "quantidade_alterada", "alta", qr, pr.qtd, "Edital/TR (quantidade do item é travada)", "diligencia");
      var ur = cent(rf.unitario), up = cent(pr.unitario);
      if (ur !== null && up !== null && up > ur) achado(k, "sobrepreco_unitario", "media", deCent(ur), deCent(up), "Edital/TR (preço unitário máximo) — conferir a cláusula do edital", "diligencia");
      var tp = cent(pr.total);
      if (qp !== null && up !== null && tp !== null) {
        var esperadoC = cent(valorArred(qp * deCent(up), c));
        if (Math.abs(tp - esperadoC) > TOLERANCIA_CENTAVOS) achado(k, "erro_aritmetico", "media", deCent(esperadoC), deCent(tp), "Planilha da proposta: quantidade × unitário ≠ total", "diligencia");
      }
    });
    var somaProp = somaCent(arr(propostaLinhas).map(function (l) { return cent(l.total) === null ? 0 : cent(l.total); }));
    var somaRef = somaCent(arr(referenciaLinhas).map(function (l) { return cent(l.total) === null ? 0 : cent(l.total); }));
    var totalDecl = cent(c.totalProposta);
    if (totalDecl !== null && totalDecl !== somaProp) achado("TOTAL", "total_difere_da_soma", "media", deCent(somaProp), deCent(totalDecl), "Planilha da proposta: total declarado ≠ soma das linhas", "diligencia");
    var totalProp = totalDecl !== null ? totalDecl : somaProp;
    var totalRef = cent(c.totalReferencia) !== null ? cent(c.totalReferencia) : somaRef;
    var exq = null;
    if (totalRef > 0 && arr(propostaLinhas).length) {
      if (totalProp > totalRef) achado("TOTAL", "total_acima_da_referencia", "alta", deCent(totalRef), deCent(totalProp), F_LEI + ", art. 59, III (acima do orçamento estimado)", "desclassificar");
      exq = exequibilidade(deCent(totalProp), deCent(totalRef));
      if (exq.inexequivel) achado("TOTAL", "inexequivel", "alta", ">= 75% de " + deCent(totalRef), deCent(totalProp) + " (" + exq.pct + "%)", F_LEI + ", art. 59, III e §4º", "desclassificar");
      else if (exq.garantiaAdicional > 0) achado("TOTAL", "garantia_adicional", "baixa", "garantia adicional de " + exq.garantiaAdicional, deCent(totalProp) + " (" + exq.pct + "%)", F_LEI + ", art. 59, §5º", "ok");
    }
    var sug_ = achados.some(function (a) { return a.sugestao === "desclassificar"; }) ? "desclassificar" : (achados.some(function (a) { return a.sugestao === "diligencia"; }) ? "diligencia" : "ok");
    return { achados: achados, sugestao: sug_, decisao: "do agente de contratação / comissão (o motor só sugere)",
      resumo: { totalReferencia: deCent(totalRef), totalProposta: deCent(totalProp), somaProposta: deCent(somaProp) }, exequibilidade: exq };
  }

  /* ------------------------------------------------------------------ *
   * Fluxo jurídico (art. 53): a CPL envia, o jurídico emite, a CPL responde,
   * o jurídico dá ciência; só então publica. Cada mudança grava histórico.
   * `quem` = nome (string) OU {nome, papel}; havendo papel, a trava de RBAC é aplicada.
   * ------------------------------------------------------------------ */
  function registrar(q, acao, antes, depois, quem, agoraISO) {
    q.historico = arr(q.historico).concat([{ em: vazio(agoraISO) ? agoraLocalISO() : agoraISO, quem: quemNome(quem), acao: acao, antes: antes, depois: depois }]);
    if (!vazio(agoraISO)) q.atualizadoEm = agoraISO;
  }
  var RESULTADOS = ["favoravel", "com_ressalvas", "desfavoravel"];

  var fluxoJuridico = {
    enviar: function (p, quem, agoraISO) {
      exigirSePapel(quem, "enviar_juridico");
      if (p.status === "em_analise_juridica") return clone(p);
      if (p.status !== "rascunho" && p.status !== "devolvido") throw new Error("O processo está «" + p.status + "» e não pode ser enviado ao jurídico agora.");
      var q = clone(p), antes = q.status;
      if (q.parecer) { q.pareceresAnteriores = arr(q.pareceresAnteriores).concat([q.parecer]); q.parecer = null; }
      q.status = "em_analise_juridica";
      registrar(q, "enviar_juridico", antes, q.status, quem, agoraISO);
      return q;
    },
    emitirParecer: function (p, parecer, quem, agoraISO) {
      exigirSePapel(quem, "emitir_parecer");
      var pa = parecer || {};
      if (RESULTADOS.indexOf(pa.resultado) < 0) throw new Error("Resultado do parecer inválido: use favoravel, com_ressalvas ou desfavoravel.");
      if (vazio(pa.texto)) throw new Error("O parecer precisa de texto (art. 53).");
      var ress = arr(pa.ressalvas);
      if (pa.resultado === "com_ressalvas" && !ress.length) throw new Error("Parecer com ressalvas precisa listar ao menos uma ressalva.");
      if (pa.resultado !== "com_ressalvas" && ress.length) throw new Error("Só o parecer «com ressalvas» pode listar ressalvas.");
      if (p.parecer && p.parecer.resultado === pa.resultado && p.parecer.texto === pa.texto && p.status !== "em_analise_juridica") return clone(p);
      if (p.status !== "em_analise_juridica") throw new Error("O parecer só pode ser emitido com o processo «em análise jurídica» (hoje: «" + p.status + "»).");
      var q = clone(p), antes = q.status;
      q.parecer = { resultado: pa.resultado, texto: pa.texto, emitidoPor: quemNome(quem), emitidoEm: vazio(agoraISO) ? agoraLocalISO() : agoraISO,
        ressalvas: ress.map(function (r, i) { return { idx: i, texto: typeof r === "string" ? r : r.texto, respondida: false, resposta: null, respondidoPor: null }; }),
        ciencia: null };
      q.status = pa.resultado === "favoravel" ? "parecer_favoravel" : (pa.resultado === "desfavoravel" ? "devolvido" : "com_ressalvas");
      registrar(q, "emitir_parecer:" + pa.resultado, antes, q.status, quem, agoraISO);
      return q;
    },
    responderRessalva: function (p, idx, texto, quem, agoraISO) {
      exigirSePapel(quem, "responder_ressalva");
      if (!p.parecer || p.parecer.resultado !== "com_ressalvas") throw new Error("Não há parecer com ressalvas para responder.");
      var r = p.parecer.ressalvas[idx];
      if (!r) throw new Error("Ressalva " + idx + " não existe.");
      if (vazio(texto)) throw new Error("A resposta à ressalva não pode ficar em branco.");
      if (r.respondida && r.resposta === texto) return clone(p);
      var q = clone(p), antes = q.parecer.ressalvas[idx].respondida;
      q.parecer.ressalvas[idx].respondida = true; q.parecer.ressalvas[idx].resposta = texto; q.parecer.ressalvas[idx].respondidoPor = quemNome(quem);
      q.parecer.ciencia = null;                                // resposta nova exige nova ciência
      registrar(q, "responder_ressalva:" + idx, antes, true, quem, agoraISO);
      return q;
    },
    darCiencia: function (p, quem, agoraISO) {
      exigirSePapel(quem, "emitir_parecer");
      if (!p.parecer || p.parecer.resultado !== "com_ressalvas") throw new Error("Só há ciência a dar quando o parecer tem ressalvas.");
      if (p.parecer.ressalvas.some(function (r) { return !r.respondida; })) throw new Error("Ainda há ressalva sem resposta: a ciência só vem depois de todas respondidas.");
      if (p.parecer.ciencia) return clone(p);
      var q = clone(p), antes = q.status;
      q.parecer.ciencia = { por: quemNome(quem), em: vazio(agoraISO) ? agoraLocalISO() : agoraISO };
      q.status = "parecer_favoravel";
      registrar(q, "dar_ciencia", antes, q.status, quem, agoraISO);
      return q;
    },
    podePublicar: function (p) {
      var pa = p && p.parecer;
      if (!pa) return false;
      if (pa.resultado === "desfavoravel") return false;
      if (pa.resultado === "favoravel") return true;
      if (pa.resultado !== "com_ressalvas") return false;
      if (arr(pa.ressalvas).some(function (r) { return !r.respondida; })) return false;
      return !!pa.ciencia;
    }
  };

  /* processo em análise jurídica fica trancado para edição das peças */
  function editavel(p) { return !(p && p.status === "em_analise_juridica"); }

  /* ------------------------------------------------------------------ *
   * Sigilo do orçamento (art. 24) e LGPD
   * ------------------------------------------------------------------ */
  var CAMPOS_SIGILOSOS = ["valorEstimado", "totalEstimado", "orcamentoSintetico", "orcamentoAnalitico", "planilhaOrcamentaria", "mapaPesquisaPrecos", "curvaAbc", "composicoes"];
  var NUNCA_PUBLICO = ["historico", "auditoria", "parecer.rascunho", "cpfSocio", "rgSocio", "enderecoResidencial", "cotacoesFornecedores.contato"];
  var sigilo = {
    CAMPOS_SIGILOSOS: CAMPOS_SIGILOSOS, NUNCA_PUBLICO: NUNCA_PUBLICO, fonte: "Lei 14.133/2021, art. 24; LGPD (Lei 13.709/2018)",
    /* sigiloso === null (ainda não decidido) é tratado como sigiloso: na dúvida, não sai. */
    campoPublico: function (p, campo) {
      if (NUNCA_PUBLICO.indexOf(campo) >= 0) return false;
      if (CAMPOS_SIGILOSOS.indexOf(campo) >= 0) {
        if (p && p.julgamentoConcluido === true) return true;   // o sigilo cai depois do julgamento
        return !!p && p.sigiloso === false;
      }
      return true;
    }
  };

  var Cplpro = {
    PASSOS: PASSOS,
    novoProcesso: novoProcesso, progresso: progresso,
    sugerirTipoObjeto: sugerirTipoObjeto, classificarArquivo: classificarArquivo, classificarTexto: classificarTexto,
    adicionarDocumentos: adicionarDocumentos, checklistAcervo: checklistAcervo,
    pendenciasQuantitativos: pendenciasQuantitativos, quantitativosValidos: quantitativosValidos,
    etpCampos: etpCampos, riscosSugeridos: riscosSugeridos, nivelRisco: nivelRisco,
    pesquisaPrecos: pesquisaPrecos, parametros: parametros,
    prazoPublicacao: prazoPublicacao, exequibilidade: exequibilidade, analisarProposta: analisarProposta,
    pode: pode, exigir: exigir, fluxoJuridico: fluxoJuridico, editavel: editavel, sigilo: sigilo,
    /* usado pela tela (leva B) para o prazo de recurso: a MESMA contagem do art. 183 da data mínima de abertura */
    diasUteisDepois: diasUteisDepois,
    TOLERANCIA_CENTAVOS: TOLERANCIA_CENTAVOS
  };

  global.Cplpro = Cplpro;
  if (typeof module !== "undefined" && module.exports) module.exports = Cplpro;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
