/* =====================================================================
 * cplprodocs.js — CPLPRO, leva B: os DOCUMENTOS do processo (HTML → .docx pelo js/docx.js).
 *
 * Puro: devolve texto HTML, sem DOM e sem rede; roda no gate em Node.
 *
 * REGRAS QUE NÃO CEDEM
 *  - O texto dos modelos é NOSSO (curto, citando o artigo). Nada copiado de modelo de terceiro.
 *    Artigo citado vem do motor (js/cplproregras.js, com seu selo "conferir") ou é de texto
 *    de lei estável (art. 6º XXIII/XXV, 22, 23, 24, 25, 53, 54, 55, 92). Quando a casa não sabe,
 *    o campo vira «[PREENCHER: …]» em vermelho — nunca um texto inventado.
 *  - Campo vazio = «[PREENCHER: …]». O passo "Minuta" só fica pronto sem nenhum.
 *  - ⚠ SIGILO (art. 24). Documento PÚBLICO (edital, TR, minuta do contrato, matriz de riscos)
 *    NUNCA imprime valor estimado, preço unitário de referência nem total do orçamento enquanto
 *    o orçamento é sigiloso. A decisão é de Cplpro.sigilo.campoPublico — não de um "if" daqui.
 *    Os documentos INTERNOS (DFD, ETP, mapa da pesquisa) levam os valores e a tarja "interno".
 *  - Sem identidade de cliente aqui dentro: nome, logo e timbrado vêm do ctx (a conta).
 * ES5 puro.
 * ===================================================================== */
(function (global) {
  "use strict";

  var Cplpro = global.Cplpro, R = global.CplproRegras;
  if (typeof require === "function" && typeof module !== "undefined") {
    if (!R) R = require("./cplproregras.js");
    if (!Cplpro) Cplpro = require("./cplpro.js");
  }

  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function vazio(v) { return v === null || v === undefined || (typeof v === "string" && v.replace(/\s/g, "") === ""); }
  function esc(s) { return String(s === null || s === undefined ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function nl2br(s) { return esc(s).replace(/\r?\n/g, "<br>"); }

  /* campo em branco: vermelho, com o que falta. A classe é lida pelo js/docx.js (cor vermelha no Word). */
  function pre(rotulo) { return '<span class="cpl-pre" style="color:#b91c1c;font-weight:bold">[PREENCHER: ' + esc(rotulo) + "]</span>"; }
  function val(v, rotulo) { return vazio(v) ? pre(rotulo) : nl2br(v); }
  function valLinha(v, rotulo) { return vazio(v) ? pre(rotulo) : esc(v); }

  function dataBR(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso === null || iso === undefined ? "" : iso));
    return m ? m[3] + "/" + m[2] + "/" + m[1] : "";
  }
  function numBR(n, casas) {
    if (typeof n !== "number" || !isFinite(n)) return "";
    var neg = n < 0, s = Math.abs(n).toFixed(casas === undefined ? 2 : casas), parts = s.split("."), int = parts[0], out = "";
    while (int.length > 3) { out = "." + int.slice(-3) + out; int = int.slice(0, -3); }
    return (neg ? "-" : "") + int + out + (parts[1] ? "," + parts[1] : "");
  }
  function brl(n) { return typeof n === "number" && isFinite(n) ? "R$ " + numBR(n, 2) : ""; }
  function sn(v) { return v === true ? "Sim" : (v === false ? "Não" : null); }

  var NIVEL_ROTULO = { baixo: "Baixo", medio: "Médio", alto: "Alto", critico: "Crítico" };
  var ALOC_ROTULO = { contratante: "Contratante (órgão)", contratada: "Contratada", compartilhado: "Compartilhado" };

  /* ---------- peças de HTML ---------- */
  function cab(p, ctx, titulo, tarja) {
    var o = (ctx && ctx.orgao) || {}, h = "";
    h += (o.logoHtml ? "<p>" + o.logoHtml + "</p>" : "");
    h += "<p><b>" + valLinha(o.nome, "nome do órgão") + "</b></p>";
    if (p && p.secretaria) h += "<p>" + esc(p.secretaria) + "</p>";
    h += "<h1>" + esc(titulo) + "</h1>";
    h += "<p>Processo " + esc(codigo(p)) + (ctx && ctx.hoje ? " — " + dataBR(ctx.hoje) : "") + "</p>";
    if (!parecerFavoravel(p)) h += "<p><b>Minuta — sujeita a parecer jurídico (art. 53 da Lei 14.133/2021).</b></p>";
    if (tarja) h += "<p><b>" + esc(tarja) + "</b></p>";
    return h;
  }
  function codigo(p) { return String((p && p.id) || "").replace(/^prc-/, "").substring(0, 6).toUpperCase(); }
  function parecerFavoravel(p) { return !!(p && p.parecer && Cplpro.fluxoJuridico.podePublicar(p)); }
  function secao(n, titulo, corpo) { return "<h2>" + (n ? n + ". " : "") + esc(titulo) + "</h2>" + corpo; }
  function par(texto) { return "<p>" + texto + "</p>"; }
  function lista(itens) { return "<ul>" + itens.map(function (i) { return "<li>" + i + "</li>"; }).join("") + "</ul>"; }
  function tabela(cabecalho, linhas) {
    return "<table><thead><tr>" + cabecalho.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      linhas.map(function (l) { return "<tr>" + l.map(function (c) { return "<td>" + c + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>";
  }
  function assinatura(rotulo) { return '<p> </p><p class="linha-assin">' + esc(rotulo) + "</p>"; }

  /* ---------- parâmetros ---------- */
  function pv(p, id) {
    var x = p && p.parametros ? p.parametros[id] : null, v = x ? x.valor : null;
    if (id === "sigiloso" && vazio(v)) v = p ? p.sigiloso : null;
    return vazio(v) ? null : v;
  }
  function descParam(p, id) {
    var v = pv(p, id);
    if (v === null) return null;
    if (typeof v === "boolean") return sn(v);
    if (typeof v === "string") return v;
    if (id === "garantia_contrato") {
      var t = v.pct === undefined || v.pct === null ? "Sem garantia exigida" : "Garantia de " + numBR(Number(v.pct), 2) + "% do valor do contrato";
      return t + (v.seguroRetomada ? "; seguro-garantia com cláusula de retomada" : "") + (v.justificativa ? ". Justificativa: " + v.justificativa : "");
    }
    if (id === "reajuste") return "Índice: " + (v.indice || "—") + "; data-base: " + (dataBR(v.dataBase) || "—");
    if (id === "aditivo_teto") return "Acréscimos até " + numBR(v.acrescimoPct, 0) + "% e supressões até " + numBR(v.supressaoPct, 0) + "% do valor inicial";
    if (id === "recurso_prazo") return numBR(v.diasUteis, 0) + " dias úteis";
    if (id === "exequibilidade") return "Inexequível abaixo de " + numBR(v.inexequivelAbaixoPct, 0) + "% do valor orçado; garantia adicional abaixo de " + numBR(v.garantiaAdicionalAbaixoPct, 0) + "%";
    if (id === "parcelas_relevancia") return arr(v).length ? arr(v).length + " parcela(s) de maior relevância" : "Nenhuma parcela atinge 4% do valor estimado";
    return JSON.stringify(v);
  }
  function parOuPre(p, id, rotulo) { var d = descParam(p, id); return d === null ? pre(rotulo) : esc(d); }

  function publico(p, campo) { return Cplpro.sigilo.campoPublico(p, campo); }
  var TEXTO_SIGILO = "O orçamento estimado desta contratação é sigiloso, nos termos do art. 24 da Lei 14.133/2021, e só será tornado público após o julgamento das propostas.";

  /* ---------- quantitativos (sem preço) ---------- */
  function tabQuantitativos(p) {
    var qs = arr(p.quantitativos);
    if (!qs.length) return par(pre("quantitativos do objeto"));
    return tabela(["Item", "Descrição", "Un.", "Quantidade", "Origem (arquivo, página)"], qs.map(function (q) {
      var o = q.origem || {};
      return [esc(q.item === undefined ? q.itemRef : q.item), esc(q.descricao), esc(q.un), esc(numBR(Number(q.qtd), 2)),
        (vazio(o.arquivo) || vazio(o.pagina)) ? pre("origem do item " + (q.item === undefined ? q.itemRef : q.item)) : esc(o.arquivo + ", p. " + o.pagina)];
    }));
  }

  /* ================================================================== *
   * Os sete documentos
   * ================================================================== */
  function dfd(p, ctx) {
    var h = cab(p, ctx, "Documento de formalização da demanda (DFD)", "Documento INTERNO do processo.");
    var tipo = R.TIPOS_OBJETO[p.tipoObjeto];
    h += secao(1, "Unidade requisitante", par("Secretaria: " + valLinha(p.secretaria, "secretaria requisitante") + ". Responsável pela demanda: " + valLinha(p.requisitante, "nome do responsável pela demanda") + "."));
    h += secao(2, "Objeto", par(val(p.objeto, "descrição completa do objeto")) + par("Tipo de objeto: " + (tipo ? esc(tipo.nome) : pre("tipo de objeto")) + "."));
    h += secao(3, "Justificativa da necessidade", par(val(p.justificativa, "justificativa da necessidade (interesse público)")));
    h += secao(4, "Previsão no plano de contratações anual", par(val(p.pca, "referência no plano de contratações anual, ou a justificativa da ausência") + " (Lei 14.133/2021, art. 18, caput)."));
    h += secao(5, "Prazo desejado", par(valLinha(p.prazoDesejado, "data ou prazo desejado para a contratação")));
    h += secao(6, "Fonte dos recursos", par("Recurso federal: " + (sn(p.recursoFederal) || pre("informar se há recurso federal (muda o regulamento da pesquisa de preços)")) + "."));
    return h + assinatura("Responsável pela demanda") + assinatura("Autoridade competente");
  }

  function etp(p, ctx) {
    var h = cab(p, ctx, "Estudo técnico preliminar (ETP)", "Documento INTERNO do processo — contém o valor estimado.");
    var man = (p.etp && p.etp.campos) || {}, just = (p.etp && p.etp.justificativas) || {};
    h += par("Elementos do art. 18, §1º, da Lei 14.133/2021. Obrigatórios (art. 18, §2º): I, IV, VI, VIII e XIII; os demais, se não contemplados, exigem justificativa.");
    R.ETP_ELEMENTOS.forEach(function (el) {
      var v = man[el.id], corpo;
      if (vazio(v)) {
        if (!el.obrigatorio && !vazio(just[el.id])) corpo = par("Não se aplica. Justificativa: " + nl2br(just[el.id]));
        else corpo = par(pre(el.nome + (el.obrigatorio ? " (obrigatório)" : "")));
      } else corpo = par(nl2br(v));
      h += "<h2>" + esc(el.id) + " — " + esc(el.nome) + "</h2>" + corpo;
      if (el.id === "IV") h += tabQuantitativos(p);
    });
    return h + assinatura("Responsável pelo estudo");
  }

  function riscos(p, ctx) {
    var h = cab(p, ctx, "Mapa e matriz de riscos", null);
    var rs = arr(p.riscos);
    h += par("Matriz de alocação de riscos — Lei 14.133/2021, art. 22. Escala 5×5 da casa: probabilidade × impacto (1–4 baixo, 5–9 médio, 10–14 alto, 15–25 crítico).");
    if (!rs.length) return h + par(pre("riscos da contratação (use a biblioteca do tipo de objeto)"));
    h += secao(1, "Mapa de riscos", tabela(["Risco", "Categoria", "Prob.", "Impacto", "Nível", "Mitigação"], rs.map(function (r) {
      var n = Cplpro.nivelRisco(r.prob, r.impacto);
      return [esc(r.descricao), esc(r.categoria || ""), esc(r.prob), esc(r.impacto), n ? esc(NIVEL_ROTULO[n.nivel] + " (" + n.valor + ")") : pre("probabilidade e impacto"), val(r.mitigacao, "mitigação do risco")];
    })));
    var grupos = {};
    rs.forEach(function (r) { var a = r.alocacao || "sem"; (grupos[a] = grupos[a] || []).push(r); });
    var corpo = "";
    ["contratante", "contratada", "compartilhado", "sem"].forEach(function (a) {
      if (!grupos[a]) return;
      corpo += "<h3>" + (a === "sem" ? "Sem alocação definida" : esc(ALOC_ROTULO[a] || a)) + "</h3>" +
        (a === "sem" ? par(pre("alocação de cada risco abaixo")) : "") + lista(grupos[a].map(function (r) { return esc(r.descricao); }));
    });
    h += secao(2, "Matriz de alocação", corpo);
    return h + par("Sugestões da biblioteca da casa: texto a conferir pelo órgão antes da adoção.");
  }

  function mapaPrecos(p, ctx) {
    var h = cab(p, ctx, "Mapa da pesquisa de preços", "Documento INTERNO — preços e fontes; sigiloso até o julgamento quando o orçamento é sigiloso (art. 24).");
    var pq = ctx && ctx.pesquisa;
    if (!pq) return h + par(pre("orçamento de referência e pesquisa de preços (passo 6)"));
    var reg = pq.regulamento;
    h += par("Regulamento aplicado: " + (reg ? esc(reg.nome) + " — " + esc(reg.fonte) : pre("regulamento de pesquisa de preços")) + ".");
    h += par("Data da pesquisa: " + valLinha(dataBR((p.pesquisa || {}).dataPesquisa), "data da pesquisa de preços") + ". Método de cálculo: " + valLinha(((p.pesquisa || {}).metodo || "") && ({ media: "média", mediana: "mediana", menor: "menor valor" }[(p.pesquisa || {}).metodo]), "método de cálculo (média, mediana ou menor valor)") + ".");
    var rd = (p.pesquisa || {}).regraDescarte;
    h += par("Regra de descarte por discrepância: " + (rd && (typeof rd.abaixoPct === "number" || typeof rd.acimaPct === "number") ? "preços abaixo de " + numBR(rd.abaixoPct || 0, 0) + "% ou acima de " + numBR(rd.acimaPct || 0, 0) + "% da mediana são descartados" : "nenhuma configurada — nenhum preço foi descartado por discrepância") + ".");
    var linhas = pq.mapa.linhas;
    h += secao(1, "Preço de referência por item", tabela(["Item", "Descrição", "Un.", "Qtd.", "Preço unitário", "Total", "Situação"], linhas.map(function (l, i) {
      var av = pq.avaliacoes[i] || {};
      return [esc(l.item), esc(l.descricao), esc(l.un), esc(numBR(l.qtd, 2)), l.unitario === null ? pre("preço do item " + l.item) : esc(numBR(l.unitario, 2)), l.total === null ? "—" : esc(numBR(l.total, 2)),
        esc(av.comBase ? "base oficial" : ({ ok: "ok", ok_justificado: "ok com justificativa", justificativa: "justificativa pendente", sem_fonte: "sem fonte", pendente: "pendente" }[av.situacao] || av.situacao || ""))];
    })) + par("<b>Total do mapa (sem BDI): " + esc(brl(pq.mapa.total)) + "</b>" + (pq.mapa.semPreco ? " — " + pq.mapa.semPreco + " item(ns) sem preço fechado" : "") + "."));
    var corpo = "";
    pq.avaliacoes.forEach(function (av, i) {
      if (av.comBase) return;
      var it = linhas[i];
      corpo += "<h3>Item " + esc(it.item) + " — " + esc(it.descricao) + "</h3>";
      var cfg = ((p.pesquisa || {}).itens || {})[it.item] || {};
      var us = arr(av.fontesUsadas);
      corpo += us.length ? tabela(["Fonte", "Detalhe", "Valor", "Regra"], us.map(function (u) {
        var f = arr(cfg.fontes)[u.indice] || {};
        return [esc(u.tipo), esc([f.base, f.fornecedor, f.link, f.dataAcesso ? "acesso " + dataBR(f.dataAcesso) + " " + (f.horaAcesso || "") : "", f.dataColeta ? "coleta " + dataBR(f.dataColeta) : ""].filter(Boolean).join(" · ")), esc(numBR(u.valor, 2)), esc(u.regra)];
      })) : par("Nenhuma fonte válida.");
      if (arr(av.descartadas).length) corpo += par("<b>Descartadas:</b>") + lista(av.descartadas.map(function (d) { return esc("Fonte " + (d.indice + 1) + " (" + d.tipo + "): " + d.motivo + " — " + d.regra); }));
      if (av.avisoDescarte) corpo += par(esc(av.avisoDescarte));
      if (av.justificativaObrigatoria) corpo += par("Menos preços do que o mínimo. Justificativa: " + (av.justificativa ? nl2br(av.justificativa) : pre("justificativa aprovada pela autoridade (item " + it.item + ")")));
      arr(av.pendencias).forEach(function (m) { corpo += par(esc(m)); });
    });
    if (corpo) h += secao(2, "Fontes por item sem base oficial", corpo);
    return h + assinatura("Responsável pela pesquisa");
  }

  function tr(p, ctx) {
    var h = cab(p, ctx, "Termo de referência / projeto básico", null);
    var t = p.tr || {}, tipo = R.TIPOS_OBJETO[p.tipoObjeto];
    h += par("Elementos do art. 6º, XXIII (termo de referência) e XXV (projeto básico) da Lei 14.133/2021.");
    h += secao(1, "Definição do objeto", par(val(t.objeto || p.objeto, "descrição do objeto")));
    h += secao(2, "Fundamentação da contratação", par(val(p.justificativa, "fundamentação (referência ao ETP)")));
    var req = arr(p.documentos).filter(function (d) { return !d.superadoPor; });
    h += secao(3, "Elementos de projeto que integram o objeto", req.length ? lista(req.map(function (d) { return esc((R.ACERVO_TIPOS[d.tipo] ? R.ACERVO_TIPOS[d.tipo].nome : d.tipo) + " — " + d.nome + (d.revisao ? " (" + d.revisao + ")" : "")); })) : par(pre("projetos e documentos técnicos do objeto")));
    h += secao(4, "Quantitativos", tabQuantitativos(p));
    h += secao(5, "Modelo de execução", par("Regime de execução: " + parOuPre(p, "regime_execucao", "regime de execução") + (tipo ? "." : "")));
    h += secao(6, "Modelo de gestão e fiscalização", par(val(t.gestao, "modelo de gestão e fiscalização do contrato")));
    h += secao(7, "Critérios de medição e de pagamento", par(val(t.medicao, "critério de medição")) + par("Pagamento: " + valLinha(t.pagamento, "condições e prazo de pagamento")));
    h += secao(8, "Critérios de recebimento", par(val(t.recebimento, "critério de recebimento provisório e definitivo")));
    h += secao(9, "Forma e critério de seleção do fornecedor", par("Modalidade: " + parOuPre(p, "modalidade", "modalidade") + ". Critério de julgamento: " + parOuPre(p, "criterio_julgamento", "critério de julgamento") + "."));
    var pr = pv(p, "parcelas_relevancia");
    if (arr(pr).length) {
      /* parcela de relevância: item, descrição e quantidade mínima exigível. Valor e % ficam FORA (sigilo). */
      h += secao(10, "Parcelas de maior relevância (qualificação técnica)", par("Quantidade mínima exigível: até 50% da quantidade da parcela (Lei 14.133/2021, art. 67, §§1º e 2º).") +
        tabela(["Item", "Descrição", "Un.", "Quantidade mínima exigível"], pr.map(function (x) { return [esc(x.item), esc(x.descricao), esc(x.un), esc(numBR(x.qtdMaxExigivel, 2))]; })));
    }
    var vEst = publico(p, "valorEstimado") && ctx && ctx.orc ? brl(ctx.orc.total) : null;
    h += secao(11, "Estimativa do valor da contratação", par(publico(p, "valorEstimado") ? (vEst ? "Valor estimado: " + esc(vEst) + "." : pre("valor estimado")) : TEXTO_SIGILO));
    h += secao(12, "Adequação orçamentária", par(val(t.dotacao, "dotação orçamentária")));
    return h + assinatura("Responsável pelo termo de referência");
  }

  function edital(p, ctx) {
    var h = cab(p, ctx, "Minuta de edital", null);
    var tipo = R.TIPOS_OBJETO[p.tipoObjeto], pz = (ctx && ctx.prazo) || {};
    h += par("Modalidade: " + parOuPre(p, "modalidade", "modalidade") + ". Edital nº " + valLinha((p.edital || {}).numero, "número do edital") + ".");
    h += secao(1, "Objeto", par(val(p.objeto, "objeto da licitação")) + par("Descrição completa, projetos e quantitativos no termo de referência (anexo)."));
    h += secao(2, "Valor estimado e sigilo", par(publico(p, "valorEstimado") ? (ctx && ctx.orc ? "Valor estimado da contratação: " + esc(brl(ctx.orc.total)) + "." : pre("valor estimado")) : TEXTO_SIGILO));
    h += secao(3, "Critério de julgamento e regime de execução", par("Critério: " + parOuPre(p, "criterio_julgamento", "critério de julgamento") + " (art. 33). Regime: " + parOuPre(p, "regime_execucao", "regime de execução") + " (art. 46)."));
    h += secao(4, "Participação", lista([
      "Consórcio: " + parOuPre(p, "consorcio", "participação de consórcio (sim/não)") + " (art. 15).",
      "Subcontratação: " + parOuPre(p, "subcontratacao", "subcontratação (sim/não)") + " (art. 122).",
      "Tratamento de ME/EPP: " + parOuPre(p, "me_epp", "tratamento de ME/EPP (sim/não)") + " (LC 123/2006).",
      "Visita técnica: " + parOuPre(p, "visita_tecnica", "visita técnica (sim/não)") + " (art. 63, §2º).",
      "Amostra ou prova de conceito: " + parOuPre(p, "amostra", "amostra (sim/não)") + "."
    ]));
    h += secao(5, "Prazos", par("Publicação do edital: " + valLinha(dataBR(p.dataPrevistaEdital), "data de publicação") + " (art. 54: divulgação no PNCP). Abertura das propostas: " + valLinha(dataBR(pz.dataAbertura), "data de abertura") +
      ". Prazo mínimo entre publicação e abertura: " + (pz.diasUteis ? esc(pz.diasUteis) + " dias úteis (art. 55), isto é, a partir de " + esc(dataBR(pz.dataMinimaAbertura)) : pre("prazo mínimo do art. 55")) + "."));
    h += secao(6, "Habilitação", par(val((p.edital || {}).habilitacao, "documentos de habilitação jurídica, técnica, fiscal, social, trabalhista e econômico-financeira exigidos")) +
      (arr(pv(p, "parcelas_relevancia")).length ? par("Qualificação técnica: atestados das parcelas de maior relevância indicadas no termo de referência (art. 67).") : ""));
    h += secao(7, "Proposta e planilha de preços", par("A planilha de preços do licitante preserva, sem alteração, a numeração, a descrição, a unidade e a quantidade de cada item do orçamento do órgão; só o preço unitário é do licitante. Serão desclassificadas as propostas acima do valor orçado pela Administração e as inexequíveis (art. 59). " + parOuPre(p, "exequibilidade", "exequibilidade") + "."));
    h += secao(8, "Garantia", par(parOuPre(p, "garantia_contrato", "garantia do contrato") + " (arts. 96 a 99)."));
    h += secao(9, "Reajuste", par(parOuPre(p, "reajuste", "índice e data-base do reajuste") + " (art. 25, §7º)."));
    h += secao(10, "Recursos", par("Prazo de recurso: " + parOuPre(p, "recurso_prazo", "prazo de recurso") + " (art. 165)."));
    h += secao(11, "Sanções e penalidades", par(val((p.edital || {}).sancoes, "regime de sanções aplicável (lei e regulamento do órgão)")));
    h += secao(12, "Anexos", lista(["Termo de referência / projeto básico", "Matriz de riscos", "Minuta do contrato", "Planilha de quantitativos (sem preços, quando o orçamento é sigiloso)"]));
    return h + assinatura("Agente de contratação / presidente da comissão") + assinatura("Autoridade competente");
  }

  function contrato(p, ctx) {
    var h = cab(p, ctx, "Minuta de contrato", null);
    h += par("Cláusulas necessárias: Lei 14.133/2021, art. 92. Contrato nº: numeração atribuída pelo órgão na assinatura.");
    h += secao(1, "Partes", par("Contratante: " + valLinha(((ctx && ctx.orgao) || {}).nome, "nome do órgão") + ". Contratada: a licitante vencedora, qualificada na ata de julgamento e na assinatura."));
    h += secao(2, "Objeto", par(val(p.objeto, "objeto do contrato")));
    h += secao(3, "Vigência e prazo de execução", par(val((p.edital || {}).vigencia, "prazo de vigência e prazo de execução, em meses ou dias")));
    h += secao(4, "Preço", par("O preço é o da proposta vencedora, aceito pela Administração e registrado na ata de julgamento. " + (publico(p, "valorEstimado") ? "" : "O orçamento estimado é sigiloso até o julgamento (art. 24).")));
    h += secao(5, "Regime de execução, medição e pagamento", par("Regime: " + parOuPre(p, "regime_execucao", "regime de execução") + ". Medição: " + valLinha((p.tr || {}).medicao, "critério de medição") + ". Pagamento: " + valLinha((p.tr || {}).pagamento, "condições e prazo de pagamento") + "."));
    h += secao(6, "Reajuste", par(parOuPre(p, "reajuste", "índice e data-base do reajuste") + " (art. 25, §7º)."));
    h += secao(7, "Garantia", par(parOuPre(p, "garantia_contrato", "garantia do contrato") + " (arts. 96 a 99)."));
    h += secao(8, "Alterações do contrato", par(parOuPre(p, "aditivo_teto", "limites de acréscimos e supressões") + " (art. 125)."));
    h += secao(9, "Fiscalização e recebimento", par("Gestão e fiscalização: " + valLinha((p.tr || {}).gestao, "fiscal e gestor do contrato") + ". Recebimento: " + valLinha((p.tr || {}).recebimento, "critério de recebimento") + "."));
    h += secao(10, "Matriz de riscos", par("A alocação de riscos é a do anexo «Mapa e matriz de riscos» (art. 22)."));
    h += secao(11, "Rescisão, sanções e foro", par(val((p.edital || {}).rescisaoForo, "hipóteses de extinção, sanções e foro")));
    return h + assinatura("Contratante") + assinatura("Contratada");
  }

  var DOCS = [
    { id: "dfd", nome: "DFD — Documento de formalização da demanda", arquivo: "DFD", publico: false, fn: dfd },
    { id: "etp", nome: "ETP — Estudo técnico preliminar", arquivo: "ETP", publico: false, fn: etp },
    { id: "riscos", nome: "Mapa e matriz de riscos", arquivo: "Mapa e matriz de riscos", publico: true, fn: riscos },
    { id: "pesquisa", nome: "Mapa da pesquisa de preços", arquivo: "Mapa da pesquisa de precos", publico: false, fn: mapaPrecos },
    { id: "tr", nome: "TR / Projeto básico", arquivo: "TR - Projeto basico", publico: true, fn: tr },
    { id: "edital", nome: "Minuta do edital", arquivo: "Minuta do edital", publico: true, fn: edital },
    { id: "contrato", nome: "Minuta do contrato", arquivo: "Minuta do contrato", publico: true, fn: contrato }
  ];

  function contarPre(html) { var m = String(html).match(/\[PREENCHER:/g); return m ? m.length : 0; }

  var CplproDocs = {
    DOCS: DOCS.map(function (d) { return { id: d.id, nome: d.nome, publico: d.publico }; }),
    TEXTO_SIGILO: TEXTO_SIGILO,
    contarPre: contarPre,
    nomeArquivo: function (doc, p) { return doc.arquivo + " - " + codigo(p); },

    /* gera TODOS os documentos do processo. ctx = { orgao:{nome, logoHtml}, orc:{total,…}, pesquisa, prazo, hoje } */
    gerar: function (p, ctx) {
      var out = [], total = 0;
      DOCS.forEach(function (d) {
        var html = d.fn(p, ctx || {}), n = contarPre(html);
        total += n;
        out.push({ id: d.id, nome: d.nome, arquivo: d.arquivo, publico: d.publico, html: html, pendentes: n });
      });
      return { docs: out, pendentes: total };
    },

    /* ---------- propostas (pós-publicação) ---------- */
    gerarProposta: function (tipo, p, prop, ctx) {
      var an = prop.analise || { achados: [], sugestao: "ok" };
      var nomeLic = valLinha(prop.licitante, "nome do licitante");
      var sugRot = { ok: "sem achado que exija providência", diligencia: "diligência", desclassificar: "desclassificação" };
      var h, fonteLinha = function (a) { return esc(a.fonte); };
      if (tipo === "parecer") {
        h = cab(p, ctx, "Parecer de análise da proposta", "Documento INTERNO.");
        h += par("Licitante: " + nomeLic + ". Proposta importada de «" + esc(prop.arquivo || "") + "» em " + esc(dataBR(prop.importadoEm)) + ".");
        h += par("O sistema compara a proposta com a planilha de referência congelada na publicação e <b>apenas sugere</b>; a decisão é do agente de contratação ou da comissão. Sugestão do sistema: <b>" + esc(sugRot[an.sugestao] || an.sugestao) + "</b>.");
        if (an.resumo) h += par("Total da referência: " + esc(brl(an.resumo.totalReferencia)) + " · total da proposta: " + esc(brl(an.resumo.totalProposta)) + (an.exequibilidade && an.exequibilidade.pct !== null ? " (" + esc(numBR(an.exequibilidade.pct, 2)) + "% da referência)" : "") + ".");
        h += an.achados.length ? tabela(["Item", "Achado", "Esperado", "Encontrado", "Fundamento", "Sugestão"], an.achados.map(function (a) {
          return [esc(a.item), esc(a.tipo.replace(/_/g, " ")), esc(a.esperado), esc(a.encontrado), fonteLinha(a), esc(sugRot[a.sugestao] || a.sugestao)];
        })) : par("Nenhum achado.");
        h += par("Decisão do servidor: " + (prop.decisao ? esc(prop.decisao.acao) + " por " + esc(prop.decisao.por) + " em " + esc(dataBR(prop.decisao.em)) + (prop.decisao.motivo ? " — " + esc(prop.decisao.motivo) : "") : pre("decisão do agente de contratação")) + ".");
        return h + assinatura("Agente de contratação / comissão");
      }
      if (tipo === "diligencia") {
        h = cab(p, ctx, "Termo de diligência", null);
        h += par("Ao licitante: " + nomeLic + ".");
        h += par("A proposta foi analisada e há pontos a esclarecer ou corrigir, sem alterar o preço global nem a substância da oferta. Prazo para resposta: " + valLinha(dataBR(prop.decisao && prop.decisao.prazo), "prazo para resposta") + ".");
        var itens = an.achados.filter(function (a) { return a.sugestao === "diligencia"; });
        h += itens.length ? tabela(["Item", "Ponto a esclarecer", "Esperado", "Encontrado", "Fundamento"], itens.map(function (a) { return [esc(a.item), esc(a.tipo.replace(/_/g, " ")), esc(a.esperado), esc(a.encontrado), fonteLinha(a)]; })) : par(pre("pontos a esclarecer"));
        if (prop.decisao && prop.decisao.motivo) h += par("Observação: " + nl2br(prop.decisao.motivo));
        return h + assinatura("Agente de contratação / comissão");
      }
      /* comunicado de desclassificação: SÓ depois do clique do servidor que decidiu desclassificar */
      h = cab(p, ctx, "Comunicado de desclassificação", null);
      h += par("Ao licitante: " + nomeLic + ".");
      h += par("Comunicamos a desclassificação da proposta, pelo(s) motivo(s) abaixo, com o respectivo fundamento. Cabe recurso no prazo de " + parOuPre(p, "recurso_prazo", "prazo de recurso") + " (art. 165).");
      var base = an.achados.filter(function (a) { return a.sugestao === "desclassificar"; });
      var citados = prop.decisao && arr(prop.decisao.itens).length ? an.achados.filter(function (a) { return prop.decisao.itens.indexOf(a.item + ":" + a.tipo) >= 0; }) : base;
      h += citados.length ? tabela(["Item", "Motivo", "Esperado", "Encontrado", "Fundamento"], citados.map(function (a) { return [esc(a.item), esc(a.tipo.replace(/_/g, " ")), esc(a.esperado), esc(a.encontrado), fonteLinha(a)]; })) : par(pre("item e motivo da desclassificação"));
      h += par("Motivação do servidor: " + (prop.decisao && prop.decisao.motivo ? nl2br(prop.decisao.motivo) : pre("motivação")));
      return h + assinatura("Agente de contratação / comissão");
    }
  };

  global.CplproDocs = CplproDocs;
  if (typeof module !== "undefined" && module.exports) module.exports = CplproDocs;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
