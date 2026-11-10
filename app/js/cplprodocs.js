/* =====================================================================
 * cplprodocs.js — CPLPRO, leva B: os DOCUMENTOS do processo (HTML → .docx pelo js/docx.js).
 *
 * Puro: devolve texto HTML, sem DOM e sem rede; roda no gate em Node.
 *
 * REGRAS QUE NÃO CEDEM
 *  - MODELO PADRÃO (10/11/2026, pedido do Rogério: "um padrão estabelecido, a partir de um modelo bom"):
 *    edital, TR/PB e contrato seguem a ESTRUTURA E A ORDEM dos modelos públicos AGU/SEGES da Lei 14.133 do
 *    kit de licitação do Novo PAC (RA-Equipe\orcapro\pesquisas\REF-*.txt, fontes em FONTES.md), adaptados
 *    de órgão federal para município. Os blocos "OU" do modelo viram opções escolhidas pelos PARÂMETROS do
 *    processo. Artigo citado = o que o modelo cita (ou texto de lei estável); sem certeza, cita só a lei.
 *    Redação que NÃO está no modelo de referência (contrato) leva a marca «[conferir com o jurídico]».
 *  - Quando o órgão tem o PRÓPRIO modelo (Decreto SP 62.100, art. 16: a procuradoria define as minutas), o
 *    js/cplprotpl.js preenche o .docx dele; este padrão é a reserva. Os campos {{...}} saem de CAMPOS_MODELO.
 *  - Artigo citado vem do motor (js/cplproregras.js, com seu selo "conferir") ou é de texto
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
    return tabela(["Item", "Descrição", "Un.", "Quantidade", "Origem (arquivo, página ou linha)"], qs.map(function (q) {
      var o = q.origem || {};
      /* leva F: quantidade lida de planilha tem origem em ARQUIVO + LINHA (de projeto em PDF: ARQUIVO + PÁGINA) */
      return [esc(q.item === undefined ? q.itemRef : q.item), esc(q.descricao), esc(q.un), esc(numBR(Number(q.qtd), 2)),
        (vazio(o.arquivo) || (vazio(o.pagina) && vazio(o.linha))) ? pre("origem do item " + (q.item === undefined ? q.itemRef : q.item)) : esc(o.arquivo + (vazio(o.pagina) ? ", linha " + o.linha : ", p. " + o.pagina))];
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

  /* ================================================================== *
   * CAMPOS que o ÓRGÃO informa e que o modelo oficial (AGU/SEGES) deixa em branco
   * (XXXX, "...", [INDICAR ...]). Uma lista só: a tela monta os formulários a partir dela e o
   * texto dos documentos lê dela. Sem valor = «[PREENCHER: rótulo]» — nunca um padrão escondido.
   * `onde`: "edital" (p.edital) ou "tr" (p.tr) — os dois entram na assinatura do conteúdo.
   * `quando(p)`: o campo só existe quando o bloco "OU" do modelo que o usa foi escolhido pelos parâmetros.
   * ================================================================== */
  function ehLances(p) { var c = pv(p, "criterio_julgamento"); return c === "menor preço" || c === "maior desconto"; }
  var CAMPOS = [
    { id: "portal", onde: "edital", grupo: "Sessão pública e portal", rotulo: "portal ou plataforma eletrônica da licitação", dica: "Ex.: o portal que o órgão adota (Compras.gov.br ou outro)." },
    { id: "sessaoHora", onde: "edital", grupo: "Sessão pública e portal", rotulo: "hora da sessão pública (horário de Brasília)", dica: "Ex.: 09:00" },
    { id: "modoDisputa", onde: "edital", grupo: "Sessão pública e portal", rotulo: "modo de disputa", tipo: "select", opcoes: ["aberto", "aberto e fechado", "fechado e aberto"], quando: ehLances },
    { id: "intervaloLances", onde: "edital", grupo: "Sessão pública e portal", rotulo: "intervalo mínimo de diferença entre lances (valor ou percentual)", dica: "Discricionário do órgão. Ex.: 0,15%", quando: ehLances },
    { id: "cadastro", onde: "edital", grupo: "Sessão pública e portal", rotulo: "cadastro de fornecedores usado pelo órgão", tipo: "select", opcoes: [["sicaf", "SICAF (Compras.gov.br)"], ["proprio", "Cadastro próprio do órgão"]] },
    { id: "cadastroProprio", onde: "edital", grupo: "Sessão pública e portal", rotulo: "nome do cadastro próprio de fornecedores", quando: function (p) { return (p.edital || {}).cadastro === "proprio"; } },
    { id: "setorLicitacoes", onde: "edital", grupo: "Órgão", rotulo: "setor responsável pelas licitações", dica: "Ex.: Comissão Permanente de Licitação" },
    { id: "enderecoOrgao", onde: "edital", grupo: "Órgão", rotulo: "endereço do órgão (sede)" },
    { id: "emailImpugnacao", onde: "edital", grupo: "Órgão", rotulo: "e-mail institucional para impugnações e pedidos de esclarecimento" },
    { id: "representante", onde: "edital", grupo: "Órgão", rotulo: "nome, cargo e ato de nomeação do representante do contratante", dica: "Vai na qualificação das partes do contrato." },
    { id: "foro", onde: "edital", grupo: "Contrato", rotulo: "foro da sede da Administração (art. 92, §1º)", dica: "Ex.: Foro da Comarca de ..." },
    { id: "multaContrato", onde: "edital", grupo: "Contrato", rotulo: "percentuais da multa moratória e da multa compensatória do contrato" },
    { id: "prazoRepactuacao", onde: "edital", grupo: "Contrato", rotulo: "prazo de resposta ao pedido de repactuação (art. 92, X)", dica: "Ex.: 30 dias" },
    { id: "prazoReequilibrio", onde: "edital", grupo: "Contrato", rotulo: "prazo de resposta ao pedido de reequilíbrio econômico-financeiro (art. 92, XI)", dica: "Ex.: 30 dias" },
    { id: "visitaAgendamento", onde: "edital", grupo: "Condições do certame", rotulo: "forma de agendamento da vistoria", quando: function (p) { return pv(p, "visita_tecnica") === true; } },
    { id: "consorcioAcrescimo", onde: "edital", grupo: "Condições do certame", rotulo: "acréscimo de habilitação econômico-financeira ao consórcio (10% a 30%) ou a justificativa para suprimi-lo", quando: function (p) { return pv(p, "consorcio") === true; } },
    { id: "instrumentoRepasse", onde: "edital", grupo: "Condições do certame", rotulo: "instrumento da transferência de recursos federais (convênio, contrato de repasse...)", quando: function (p) { return p.recursoFederal === true; } },
    { id: "local", onde: "tr", grupo: "Execução", rotulo: "endereço do local da obra" },
    { id: "inicioExecucao", onde: "tr", grupo: "Execução", rotulo: "início da execução (em dias da assinatura do contrato ou da ordem de serviço)", dica: "Ex.: 10 dias da emissão da ordem de serviço" },
    { id: "garantiaServicoMeses", onde: "tr", grupo: "Execução", rotulo: "garantia complementar do serviço, em meses (0 = só a garantia legal)", dica: "Número inteiro. 0 = vale o Código de Defesa do Consumidor e o Código Civil." },
    { id: "prazoRecProvisorio", onde: "tr", grupo: "Recebimento e pagamento", rotulo: "prazo do recebimento provisório (dias)" },
    { id: "prazoRecDefinitivo", onde: "tr", grupo: "Recebimento e pagamento", rotulo: "prazo do recebimento definitivo (dias)" },
    { id: "prazoLiquidacao", onde: "tr", grupo: "Recebimento e pagamento", rotulo: "prazo de liquidação da despesa (dias úteis)" },
    { id: "indiceAtraso", onde: "tr", grupo: "Recebimento e pagamento", rotulo: "índice de correção monetária por atraso de pagamento", dica: "INCC, IPCA ou IGP-M — escolha do órgão." },
    { id: "qualificacaoEconomica", onde: "tr", grupo: "Habilitação", rotulo: "capital mínimo ou patrimônio líquido mínimo exigido (até 10% do valor estimado)", dica: "Exigido só de quem não atinge os índices; limite de 10% do modelo AGU." },
    { id: "subcontratacaoLimite", onde: "tr", grupo: "Habilitação", rotulo: "limite da subcontratação (percentual do valor do contrato)", quando: function (p) { return pv(p, "subcontratacao") === true; } }
  ];
  function campoAplica(c, p) { return typeof c.quando !== "function" || c.quando(p); }
  function valCampo(p, id) {
    var c = null; CAMPOS.forEach(function (x) { if (x.id === id) c = x; });
    var o = c && c.onde === "tr" ? p.tr : p.edital;
    var v = o ? o[id] : null;
    if (c && !campoAplica(c, p)) return "";
    return vazio(v) ? pre(c ? c.rotulo : id) : esc(v);
  }
  /* o rótulo do select por valor ("sicaf" → "SICAF (Compras.gov.br)") */
  function rotuloOpcao(c, v) {
    var r = v; (c.opcoes || []).forEach(function (o) { if (Array.isArray(o) ? o[0] === v : o === v) r = Array.isArray(o) ? o[1] : o; });
    return r;
  }

  /* ---------- o texto numerado (1., 1.1, a) …) — as remissões internas saem do próprio texto ---------- */
  function redigir(montar) {
    var refs = {};
    function passada(prev) {
      var o = { html: "", refs: {}, n: 0, s: 0, m: 0 };
      o.sec = function (t) { o.n++; o.s = 0; o.m = 0; o.html += "<h2>" + o.n + ". " + esc(t) + "</h2>"; };
      o.sub = function (t) { o.s++; o.m = 0; o.html += "<h3>" + o.n + "." + o.s + " " + esc(t) + "</h3>"; };
      o.it = function (txt, chave) {
        o.m++;
        var num = o.n + "." + (o.s ? o.s + "." : "") + o.m;
        if (chave) o.refs[chave] = num;
        o.html += "<p><b>" + num + "</b> " + txt + "</p>";
        return num;
      };
      o.al = function (lista) { lista.forEach(function (t, i) { o.html += "<p>  " + String.fromCharCode(97 + i) + ") " + t + "</p>"; }); };
      o.raw = function (h) { o.html += h; };
      o.r = function (chave) { return prev[chave] || "—"; };
      montar(o);
      return o;
    }
    var a = passada({}), b = passada(a.refs);
    return b.html;
  }

  function nomeCadastro(p) {
    var c = (p.edital || {}).cadastro;
    if (c === "sicaf") return "SICAF";
    if (c === "proprio") return vazio((p.edital || {}).cadastroProprio) ? pre("nome do cadastro próprio de fornecedores") : esc(p.edital.cadastroProprio);
    return pre("cadastro de fornecedores usado pelo órgão (SICAF ou cadastro próprio)");
  }
  function valorOuSigilo(p, ctx) {
    if (!publico(p, "valorEstimado")) return esc(TEXTO_SIGILO);
    return ctx && ctx.orc ? esc(brl(ctx.orc.total)) : pre("valor estimado");
  }
  var REGIMES_GLOBAIS = /global|integral|integrada/;
  function regimeGlobal(p) { var r = pv(p, "regime_execucao"); return r === null ? null : REGIMES_GLOBAIS.test(r); }

  /* ================================================================== *
   * TR / Projeto básico — estrutura do modelo AGU de TR de obras e serviços comuns de engenharia
   * (REF-modelo-TR-obras-comuns-AGU-NovoPAC): condições gerais → fundamentação → solução → requisitos →
   * modelo de execução → modelo de gestão → medição e pagamento → seleção e regime → estimativa →
   * adequação orçamentária → aprovação motivada. Os blocos "OU" do modelo são escolhidos pelos parâmetros.
   * ================================================================== */
  function tr(p, ctx) {
    var h = cab(p, ctx, "Termo de referência / projeto básico", null);
    var t = p.tr || {}, tipo = R.TIPOS_OBJETO[p.tipoObjeto], e = p.edital || {};
    var sig = !publico(p, "valorEstimado");
    var sub = pv(p, "subcontratacao"), gar = pv(p, "garantia_contrato"), vis = pv(p, "visita_tecnica"), cons = pv(p, "consorcio");
    var reg = pv(p, "regime_execucao"), crit = pv(p, "criterio_julgamento"), me = pv(p, "me_epp");
    var req = arr(p.documentos).filter(function (d) { return !d.superadoPor; });
    var pr = arr(pv(p, "parcelas_relevancia"));
    var meses = t.garantiaServicoMeses;
    var nMeses = vazio(meses) ? null : Number(String(meses).replace(",", "."));
    h += par("Elementos do art. 6º, XXIII (termo de referência) e XXV (projeto básico) da Lei 14.133/2021. Estrutura do modelo de termo de referência de obras e serviços comuns de engenharia da AGU/SEGES, adaptada ao município.");
    h += redigir(function (o) {
      /* 1 */
      o.sec("Condições gerais da contratação");
      o.it("Contratação de empresa especializada para a execução de obra de engenharia: " + val(t.objeto || p.objeto, "descrição do objeto") + ", nos termos da tabela abaixo, conforme condições e exigências estabelecidas neste instrumento.");
      o.raw(tabela(["Item", "Especificação", "Unidade", "Quantidade", "Valor total"], [["1", val(t.objeto || p.objeto, "descrição do objeto"), "Obra", "1", sig ? "sigiloso (art. 24)" : (ctx && ctx.orc ? esc(brl(ctx.orc.total)) : pre("valor estimado"))]]));
      o.it(tipo ? (tipo.servicoComumEngenharia ? "O objeto é caracterizado como serviço comum de engenharia, conforme justificativa constante do Estudo Técnico Preliminar." : "O objeto é obra de engenharia, caracterizada no Estudo Técnico Preliminar.") : pre("tipo de objeto"));
      o.it("O prazo de vigência da contratação é de " + valLinha(e.vigencia, "prazo de vigência e prazo de execução, em meses ou dias") + ", contados da assinatura do contrato, na forma do art. 105 da Lei 14.133/2021.");
      o.it("O contrato oferece maior detalhamento das regras que serão aplicadas em relação à vigência da contratação.");
      /* 2 */
      o.sec("Fundamentação e descrição da necessidade da contratação");
      o.it("A fundamentação da contratação e de seus quantitativos encontra-se pormenorizada no Estudo Técnico Preliminar, apêndice deste termo de referência.");
      o.it(val(p.justificativa, "fundamentação (referência ao ETP)"));
      o.it("O objeto da contratação " + (vazio(p.pca) ? pre("referência no plano de contratações anual, ou a justificativa da ausência") : "está previsto no plano de contratações anual: " + esc(p.pca)) + " (art. 18, caput).");
      /* 3 */
      o.sec("Descrição da solução como um todo, considerado o ciclo de vida do objeto");
      o.it("A descrição da solução como um todo encontra-se pormenorizada no Estudo Técnico Preliminar, apêndice deste termo de referência.");
      o.it("Elementos de projeto que integram o objeto:");
      o.raw(req.length ? lista(req.map(function (d) { return esc((R.ACERVO_TIPOS[d.tipo] ? R.ACERVO_TIPOS[d.tipo].nome : d.tipo) + " — " + d.nome + (d.revisao ? " (" + d.revisao + ")" : "")); })) : par(pre("projetos e documentos técnicos do objeto")));
      o.it("Quantitativos (sem preços):");
      o.raw(tabQuantitativos(p));
      /* 4 */
      o.sec("Requisitos da contratação");
      o.sub("Sustentabilidade");
      o.it("Além dos critérios de sustentabilidade inseridos na descrição do objeto, devem ser atendidos os requisitos que se baseiam no Guia Nacional de Contratações Sustentáveis: alinhamento com o plano de gestão e logística sustentável do órgão; incorporação das dimensões ambientais, sociais, econômicas e culturais; e alinhamento com a Política Nacional de Meio Ambiente (Lei 6.938/1981), com a Política Nacional sobre Mudança do Clima (Lei 12.187/2009) e com a Política Nacional de Resíduos Sólidos (Lei 12.305/2010).");
      o.it("A Contratada observará o plano de gerenciamento de resíduos da construção civil, nos termos da Resolução CONAMA 307/2002, a proteção da biodiversidade do local da obra e as práticas para minimizar a poluição durante a construção.");
      o.sub("Indicação de marcas ou modelos (art. 41, I)");
      o.it("Eventual indicação de marca, característica ou modelo observa o art. 41, I, da Lei 14.133/2021 e só é admitida quando formalmente justificada no Estudo Técnico Preliminar.");
      o.sub("Subcontratação");
      if (sub === null) o.it(pre("subcontratação (sim/não)"));
      else if (sub === false) o.it("Não é admitida a subcontratação do objeto contratual.");
      else {
        o.it("É admitida a subcontratação parcial do objeto, até o limite de " + valCampo(p, "subcontratacaoLimite") + " do valor do contrato (art. 122).");
        o.it("É vedada a subcontratação completa ou da parcela principal do objeto da contratação" + (pr.length ? ", que consiste em: " + pr.map(function (x) { return esc(x.descricao); }).join("; ") : "") + ".");
      }
      o.it("O contrato oferece maior detalhamento das regras que serão aplicadas em relação à subcontratação, caso admitida.");
      o.sub("Garantia da contratação");
      if (gar === null) o.it(pre("garantia do contrato"));
      else if (gar.pct === undefined || gar.pct === null) o.it("Não haverá exigência da garantia da contratação dos arts. 96 e seguintes da Lei 14.133/2021, pelas razões constantes do Estudo Técnico Preliminar.");
      else {
        o.it("Será exigida a garantia da contratação de que tratam os arts. 96 e seguintes da Lei 14.133/2021, no percentual de " + esc(numBR(Number(gar.pct), 2)) + "% e condições descritas nas cláusulas do contrato" + (gar.seguroRetomada ? ", na modalidade seguro-garantia com cláusula de retomada (art. 102)" : "") + (gar.justificativa ? ". Justificativa: " + esc(gar.justificativa) : "") + ".");
        o.it("Em caso de opção pelo seguro-garantia, a parte adjudicatária deverá apresentá-lo, no máximo, até a data de assinatura do contrato.");
        o.it("A garantia, nas modalidades caução e fiança bancária, deverá ser prestada em até 10 dias úteis após a assinatura do contrato.");
        o.it("O contrato oferece maior detalhamento das regras que serão aplicadas em relação à garantia da contratação.");
      }
      o.sub("Vistoria");
      if (vis === null) o.it(pre("visita técnica (sim/não)"));
      else if (vis === false) o.it("Não há necessidade de realização de avaliação prévia do local de execução dos serviços.");
      else {
        o.it("A avaliação prévia do local de execução dos serviços é imprescindível para o conhecimento pleno das condições e peculiaridades do objeto a ser contratado, sendo assegurado ao interessado o direito de realização de vistoria prévia, acompanhado por servidor designado para esse fim, nos dias e horários indicados no edital (art. 63, §2º).");
        o.it("Serão disponibilizados data e horário diferentes aos interessados em realizar a vistoria prévia. Forma de agendamento: " + valCampo(p, "visitaAgendamento") + ".");
        o.it("Para a vistoria, o representante legal da empresa ou responsável técnico deverá estar devidamente identificado, apresentando documento de identidade civil e documento expedido pela empresa comprovando sua habilitação para a realização da vistoria.");
        o.it("Caso o licitante opte por não realizar a vistoria, deverá prestar declaração formal assinada pelo responsável técnico do licitante acerca do conhecimento pleno das condições e peculiaridades da contratação.");
        o.it("A não realização da vistoria não poderá embasar posteriores alegações de desconhecimento das instalações, dúvidas ou esquecimentos de quaisquer detalhes dos locais da prestação dos serviços, devendo o contratado assumir os ônus dos serviços decorrentes.");
      }
      /* 5 */
      o.sec("Modelo de execução do objeto");
      o.sub("Condições de execução");
      o.it("A execução do objeto seguirá a seguinte dinâmica: início da execução em " + valCampo(p, "inicioExecucao") + "; etapas, frequência e periodicidade conforme o cronograma físico-financeiro, anexo a este termo de referência.");
      o.sub("Local da prestação dos serviços");
      o.it("Os serviços serão prestados no seguinte endereço: " + valCampo(p, "local") + ".");
      o.sub("Materiais a serem disponibilizados");
      o.it("Para a perfeita execução dos serviços, a Contratada deverá disponibilizar os materiais, equipamentos, ferramentas e utensílios necessários, nas quantidades estimadas e qualidades estabelecidas, promovendo sua substituição quando necessário. Os materiais a serem utilizados devem seguir rigorosamente os memoriais descritivos e as especificações técnicas.");
      o.sub("Informações relevantes para o dimensionamento da proposta");
      o.it("A demanda do órgão tem como base os projetos, os quantitativos e as memórias de cálculo listados na seção 3 deste termo de referência e no Estudo Técnico Preliminar.");
      o.sub("Garantia do serviço (art. 40, §1º, III)");
      if (nMeses === null || !isFinite(nMeses)) o.it(pre("garantia complementar do serviço, em meses (0 = só a garantia legal)"));
      else if (nMeses <= 0) o.it("O prazo de garantia contratual dos serviços é aquele estabelecido na Lei 8.078/1990 (Código de Defesa do Consumidor) e na Lei 10.406/2002 (Código Civil).");
      else o.it("O prazo de garantia contratual dos serviços, complementar à garantia legal, será de, no mínimo, " + numBR(nMeses, 0) + " meses, contado a partir do primeiro dia útil subsequente à data do recebimento definitivo do objeto.");
      o.sub("Procedimentos de transição e finalização do contrato");
      o.it("Não serão necessários procedimentos de transição e finalização do contrato devido às características do objeto (obra de entrega definitiva).");
      /* 6 */
      o.sec("Modelo de gestão do contrato");
      o.it("O contrato deverá ser executado fielmente pelas partes, de acordo com as cláusulas avençadas e as normas da Lei 14.133/2021, e cada parte responderá pelas consequências de sua inexecução total ou parcial.");
      o.it("Em caso de impedimento, ordem de paralisação ou suspensão do contrato, o cronograma de execução será prorrogado automaticamente pelo tempo correspondente, anotadas tais circunstâncias mediante simples apostila.");
      o.it("As comunicações entre o órgão e a contratada devem ser realizadas por escrito sempre que o ato exigir tal formalidade, admitindo-se o uso de mensagem eletrônica para esse fim. O órgão poderá convocar representante da empresa para adoção de providências que devam ser cumpridas de imediato.");
      o.it("Após a assinatura do contrato, o órgão poderá convocar o representante da contratada para reunião inicial de apresentação do plano de fiscalização, com as obrigações contratuais, os mecanismos de fiscalização, as estratégias de execução, o método de aferição dos resultados e as sanções aplicáveis.");
      o.it("Designação do fiscal e do gestor do contrato: " + val(t.gestao, "modelo de gestão e fiscalização do contrato") + ".");
      o.sub("Preposto");
      o.it("A Contratada designará formalmente o preposto da empresa, antes do início da prestação dos serviços, indicando no instrumento os poderes e deveres em relação à execução do objeto contratado, e o manterá no local da execução do objeto. A Contratante poderá recusar, desde que justificadamente, a indicação ou a manutenção do preposto, hipótese em que a Contratada designará outro.");
      o.sub("Fiscalização");
      o.it("A execução do contrato deverá ser acompanhada e fiscalizada pelo(s) fiscal(is) do contrato, ou pelos respectivos substitutos (Lei 14.133/2021, art. 117, caput).");
      o.it("Fiscalização técnica: o fiscal técnico acompanhará a execução para que sejam cumpridas todas as condições do contrato; anotará no histórico de gerenciamento do contrato todas as ocorrências, com a descrição do que for necessário para a regularização das faltas ou dos defeitos observados (art. 117, §1º); emitirá notificações para a correção de inexatidões ou irregularidades, determinando prazo; informará ao gestor, em tempo hábil, a situação que demandar decisão que ultrapasse sua competência, as ocorrências que possam inviabilizar a execução nas datas aprazadas e o término do contrato, para tempestiva renovação ou prorrogação.");
      o.it("Fiscalização administrativa: o fiscal administrativo verificará a manutenção das condições de habilitação da contratada, acompanhará o empenho, o pagamento, as garantias, as glosas e a formalização de apostilamentos e termos aditivos, e atuará tempestivamente na solução de descumprimentos, reportando ao gestor o que ultrapassar a sua competência.");
      o.it("As atribuições detalhadas de fiscais e gestor seguem o regulamento do órgão. A fiscalização observará ainda: Lei 14.133/2021; Lei 5.194/1966 (exercício da Engenharia); Lei 12.378/2010 (exercício da Arquitetura e Urbanismo); Lei 6.496/1977 (Anotação de Responsabilidade Técnica); Resolução CONAMA 307/2002 (resíduos da construção civil); ABNT NBR 9050 (acessibilidade); e as demais normas técnicas aplicáveis ao objeto.");
      o.sub("Gestor do contrato");
      o.it("O gestor do contrato coordenará a atualização do processo de acompanhamento e fiscalização, com todos os registros formais da execução (ordem de serviço, registro de ocorrências, alterações e prorrogações), elaborando relatório com vistas à verificação da necessidade de adequações do contrato; acompanhará os registros dos fiscais e a manutenção das condições de habilitação da contratada, para fins de empenho e pagamento; emitirá documento comprobatório da avaliação do desempenho da contratada na execução contratual; tomará as providências para a formalização de processo administrativo de responsabilização, para fins de aplicação de sanções; elaborará relatório final sobre a consecução dos objetivos que justificaram a contratação; e enviará a documentação pertinente ao setor de contratos para a liquidação e o pagamento, no valor dimensionado pela fiscalização.");
      /* 7 */
      o.sec("Critérios de medição e de pagamento");
      o.sub("Medição");
      o.it("Critério de medição: " + val(t.medicao, "critério de medição") + ".");
      o.it("Ao final de cada etapa da execução contratual, conforme previsto no cronograma físico-financeiro, o Contratado apresentará a medição prévia dos serviços executados no período, por meio de planilha e memória de cálculo detalhada. Uma etapa será considerada efetivamente concluída quando os serviços previstos para aquela etapa estiverem executados em sua totalidade.");
      o.it("Será indicada a retenção ou glosa no pagamento, proporcional à irregularidade verificada, sem prejuízo das sanções cabíveis, caso se constate que a Contratada não produziu os resultados acordados, deixou de executar ou não executou com a qualidade mínima exigida as atividades contratadas, ou deixou de utilizar os materiais e recursos humanos exigidos para a execução do serviço, ou os utilizou com qualidade ou quantidade inferior à demandada.");
      o.sub("Do recebimento");
      o.it("Critério de recebimento: " + val(t.recebimento, "critério de recebimento provisório e definitivo") + ".");
      o.it("Os serviços serão recebidos provisoriamente, no prazo de " + valCampo(p, "prazoRecProvisorio") + " dias, pelos fiscais técnico e administrativo, mediante termos detalhados, quando verificado o cumprimento das exigências de caráter técnico e administrativo (art. 140, I, a), contados do recebimento da comunicação de cobrança do contratado com a comprovação da prestação dos serviços.");
      o.it("O Contratado fica obrigado a reparar, corrigir, remover, reconstruir ou substituir, às suas expensas, no todo ou em parte, o objeto em que se verificarem vícios, defeitos ou incorreções resultantes da execução ou dos materiais empregados. A fiscalização não atestará a última ou única medição de serviços até que sejam sanadas todas as pendências apontadas no recebimento provisório (art. 119 c/c art. 140).");
      o.it("O recebimento provisório fica sujeito, quando cabível, à conclusão dos testes de campo e à entrega dos manuais e instruções exigíveis. Os serviços poderão ser rejeitados, no todo ou em parte, quando em desacordo com as especificações deste termo de referência e da proposta, sem prejuízo das penalidades.");
      o.it("Os serviços serão recebidos definitivamente no prazo de " + valCampo(p, "prazoRecDefinitivo") + " dias, contados do recebimento provisório, por servidor ou comissão designada pela autoridade competente, após a verificação da qualidade e quantidade do serviço e consequente aceitação mediante termo detalhado, que servirá de base para a emissão da nota fiscal com o valor exato dimensionado pela fiscalização.");
      o.it("No caso de controvérsia sobre a execução do objeto, quanto à dimensão, qualidade e quantidade, será observado o art. 143, comunicando-se à empresa para emissão de nota fiscal quanto à parcela incontroversa. Nenhum prazo de recebimento ocorrerá enquanto pendente a solução, pelo contratado, de inconsistências verificadas na execução do objeto ou no instrumento de cobrança.");
      o.it("O recebimento provisório ou definitivo não excluirá a responsabilidade civil pela solidez e pela segurança do serviço nem a responsabilidade ético-profissional pela perfeita execução do contrato.");
      o.sub("Liquidação");
      o.it("Recebida a nota fiscal ou documento de cobrança equivalente, correrá o prazo de " + valCampo(p, "prazoLiquidacao") + " dias úteis para fins de liquidação, prorrogáveis por igual período.");
      o.it("Para fins de liquidação, o setor competente deve verificar se a nota fiscal ou fatura expressa os elementos necessários e essenciais do documento: prazo de validade; data da emissão; dados do contrato e do órgão contratante; período respectivo de execução do contrato; valor a pagar; e eventual destaque do valor de retenções tributárias cabíveis. Havendo erro ou circunstância que impeça a liquidação da despesa, esta ficará sobrestada até que o contratado providencie as medidas saneadoras, reiniciando-se o prazo, sem ônus à contratante.");
      o.it("A nota fiscal deverá ser acompanhada da comprovação da regularidade fiscal, constatada por consulta ao " + nomeCadastro(p) + " ou, na impossibilidade, por consulta aos sítios eletrônicos oficiais ou à documentação mencionada no art. 68 da Lei 14.133/2021. Constatada irregularidade, o contratado será notificado, por escrito, para que, no prazo de 5 dias úteis, regularize sua situação ou apresente sua defesa, prorrogável uma vez por igual período; persistindo a irregularidade, o contratante adotará as medidas necessárias à rescisão contratual, assegurada a ampla defesa. Havendo a efetiva execução do objeto, os pagamentos serão realizados normalmente até que se decida pela rescisão.");
      o.sub("Prazo e forma de pagamento");
      o.it("Condições e prazo de pagamento: " + valLinha(t.pagamento, "condições e prazo de pagamento") + ", contados da finalização da liquidação da despesa.");
      o.it("No caso de atraso pelo Contratante, os valores devidos ao contratado serão atualizados monetariamente entre o termo final do prazo de pagamento e a data de sua efetiva realização, mediante aplicação do índice " + valCampo(p, "indiceAtraso") + ".");
      o.it("O pagamento será realizado por ordem bancária, para crédito em banco, agência e conta corrente indicados pelo contratado, e a data do pagamento será o dia em que constar como emitida a ordem bancária.");
      o.it("Quando do pagamento, será efetuada a retenção tributária prevista na legislação aplicável, independentemente do percentual de tributo inserido na planilha. O contratado optante pelo Simples Nacional (Lei Complementar 123/2006) não sofrerá a retenção quanto aos impostos e contribuições abrangidos por aquele regime, condicionado o pagamento à comprovação, por documento oficial, de que faz jus ao tratamento tributário favorecido.");
      /* 8 */
      o.sec("Forma e critérios de seleção do fornecedor e regime de execução");
      o.sub("Forma de seleção e critério de julgamento da proposta");
      o.it("O fornecedor será selecionado por meio da realização de licitação, na modalidade " + parOuPre(p, "modalidade", "modalidade") + ", sob a forma eletrônica, com adoção do critério de julgamento " + parOuPre(p, "criterio_julgamento", "critério de julgamento") + " (art. 33).");
      o.sub("Regime de execução");
      o.it("O regime de execução do contrato será " + parOuPre(p, "regime_execucao", "regime de execução") + " (art. 46).");
      o.sub("Critérios de aceitabilidade de preços");
      if (reg !== null && !REGIMES_GLOBAIS.test(reg)) {
        o.it("Por se tratar de empreitada por preço unitário, o critério de aceitabilidade de preços será o valor global estimado para a contratação e os custos unitários tidos como relevantes, conforme a planilha anexa ao edital.");
      } else {
        o.it("O critério de aceitabilidade de preços será o valor global estimado para a contratação.");
      }
      o.it("O licitante mais bem colocado na disputa deverá apresentar à Administração, por meio eletrônico, planilha que contenha o preço global, os quantitativos e os preços unitários tidos como relevantes, conforme o modelo de planilha elaborado pela Administração, para efeito de avaliação de exequibilidade (art. 59, §3º).");
      o.sub("Exigências de habilitação");
      o.it("Para fins de habilitação, deverá o licitante comprovar os seguintes requisitos (arts. 62 a 70):");
      o.it("Habilitação jurídica: empresário individual, inscrição no Registro Público de Empresas Mercantis, a cargo da Junta Comercial da respectiva sede; microempreendedor individual, Certificado da Condição de Microempreendedor Individual (CCMEI); sociedade empresária, sociedade limitada unipessoal ou empresa individual de responsabilidade limitada, inscrição do ato constitutivo, estatuto ou contrato social no Registro Público de Empresas Mercantis, acompanhada de documento comprobatório de seus administradores; sociedade simples, inscrição do ato constitutivo no Registro Civil de Pessoas Jurídicas do local de sua sede, acompanhada de documento comprobatório de seus administradores; filial, sucursal ou agência, inscrição do ato constitutivo no registro onde opera, com averbação no registro onde tem sede a matriz. Os documentos devem estar acompanhados de todas as alterações ou da consolidação respectiva.");
      o.it("Habilitação fiscal, social e trabalhista: prova de inscrição no Cadastro Nacional de Pessoas Jurídicas; prova de regularidade perante a Fazenda Nacional, mediante certidão conjunta expedida pela Secretaria da Receita Federal do Brasil e pela Procuradoria-Geral da Fazenda Nacional, referente a todos os créditos tributários federais e à Dívida Ativa da União, inclusive os relativos à Seguridade Social; prova de regularidade com o Fundo de Garantia do Tempo de Serviço (FGTS); prova de inexistência de débitos inadimplidos perante a Justiça do Trabalho (certidão negativa ou positiva com efeito de negativa); prova de inscrição no cadastro de contribuintes municipal relativo ao domicílio ou sede do fornecedor, pertinente ao seu ramo de atividade e compatível com o objeto contratual; prova de regularidade com a Fazenda Municipal do domicílio ou sede do fornecedor. Caso o fornecedor seja isento dos tributos relacionados ao objeto contratual, comprovará tal condição por declaração da Fazenda respectiva.");
      o.it("Qualificação econômico-financeira: certidão negativa de falência expedida pelo distribuidor da sede do fornecedor (art. 69, II); balanço patrimonial, demonstração de resultado do exercício e demais demonstrações contábeis dos 2 últimos exercícios sociais, comprovando índices de Liquidez Geral (LG), Liquidez Corrente (LC) e Solvência Geral (SG) superiores a 1 (um), atestados por declaração assinada por profissional habilitado da área contábil. As empresas criadas no exercício financeiro da licitação poderão substituir os demonstrativos contábeis pelo balanço de abertura (art. 65, §1º); a pessoa jurídica constituída há menos de 2 anos apresentará apenas o último exercício. Caso o licitante apresente resultado igual ou inferior a 1 (um) em qualquer dos índices, será exigido, para fins de habilitação, capital mínimo ou patrimônio líquido mínimo de " + valCampo(p, "qualificacaoEconomica") + ".");
      o.it("Qualificação técnica: declaração de que o licitante tomou conhecimento de todas as informações e das condições locais para o cumprimento das obrigações do objeto da licitação, que poderá ser substituída por declaração formal assinada pelo responsável técnico; registro ou inscrição da empresa no CREA ou no CAU, em plena validade; apresentação do(s) profissional(is) registrado(s) no conselho profissional competente, detentor(es) de atestado de responsabilidade técnica por execução de obra ou serviço de características semelhantes às parcelas de maior relevância abaixo, que deverão participar da obra, admitida a substituição por profissionais de experiência equivalente ou superior, aprovada pela Administração; comprovação de aptidão para execução de serviço de complexidade tecnológica e operacional equivalente ou superior, por certidões ou atestados de pessoas jurídicas de direito público ou privado, ou emitidos pelo conselho profissional competente. Será admitido o somatório de atestados executados de forma concomitante, e os atestados poderão estar em nome da matriz ou da filial.");
      if (pr.length) {
        /* parcela de relevância: item, descrição e quantidade mínima exigível. Valor e % ficam FORA (sigilo). */
        o.it("Parcelas de maior relevância (qualificação técnica). Quantidade mínima exigível: até 50% da quantidade da parcela (art. 67, §§1º e 2º).");
        o.raw(tabela(["Item", "Descrição", "Un.", "Quantidade mínima exigível"], pr.map(function (x) { return [esc(x.item), esc(x.descricao), esc(x.un), esc(numBR(x.qtdMaxExigivel, 2))]; })));
      }
      o.it("Exigências específicas de qualificação técnica e demais exigências do órgão: " + val(e.habilitacao, "documentos de habilitação jurídica, técnica, fiscal, social, trabalhista e econômico-financeira exigidos") + ".");
      if (cons === true) o.it("Admitida a participação de consórcio, a habilitação técnica será feita pelo somatório dos quantitativos de cada consorciado e a econômico-financeira pelo somatório dos valores de cada consorciado (art. 15).");
      else if (cons === null) o.it(pre("participação de consórcio (sim/não)"));
      if (me === true) o.it("O fornecedor enquadrado como microempreendedor individual que pretenda auferir os benefícios do tratamento diferenciado da Lei Complementar 123/2006 estará dispensado da prova de inscrição nos cadastros de contribuintes estadual e municipal.");
      /* 9 */
      o.sec("Estimativa do valor da contratação");
      o.it(sig ? TEXTO_SIGILO : (ctx && ctx.orc ? "O custo estimado total da contratação é de " + esc(brl(ctx.orc.total)) + ", conforme custos unitários constantes do orçamento anexo." : pre("valor estimado")));
      o.it("A estimativa de custo levou em consideração o risco envolvido na contratação e sua alocação entre contratante e contratado, conforme especificado na matriz de riscos constante do contrato.");
      /* 10 */
      o.sec("Adequação orçamentária");
      o.it("As despesas decorrentes da presente contratação correrão à conta de recursos específicos consignados no orçamento do órgão. Dotação: " + valLinha(t.dotacao, "dotação orçamentária") + ".");
      o.it("A dotação relativa aos exercícios financeiros subsequentes será indicada após aprovação da lei orçamentária respectiva e liberação dos créditos correspondentes, mediante apostilamento.");
      /* 11 */
      o.sec("Aprovação motivada do termo de referência pela autoridade competente");
      o.it("Aprovo este termo de referência, por entender atendidos os requisitos legais e motivada a contratação nos termos do Estudo Técnico Preliminar.");
    });
    /* leva F: cronograma físico lido da pasta do projeto — só PERCENTUAIS (o TR é documento público; valor em R$ não entra) */
    if (p.cronogramaFisico && arr(p.cronogramaFisico.etapas).length) {
      var cf = p.cronogramaFisico, cabM = ["Etapa"], mi;
      for (mi = 1; mi <= cf.meses; mi++) cabM.push("Mês " + mi);
      h += "<h2>Anexo — Cronograma físico</h2>" + par("Percentual do valor de cada etapa a executar em cada mês, conforme o cronograma do projeto entregue com o processo. O cronograma físico-financeiro definitivo é o do contrato.");
      h += tabela(cabM, cf.etapas.map(function (e) { return [esc(e.nome)].concat(arr(e.pct).map(function (v) { return v ? esc(numBR(v, 0)) + "%" : "—"; })); }));
    }
    return h + assinatura("Servidor (ou equipe) responsável pelo termo de referência") + assinatura("Autoridade competente");
  }

  /* ================================================================== *
   * MINUTA DO EDITAL — estrutura e ordem do modelo AGU/SEGES de edital de concorrência eletrônica
   * (REF-modelo-edital-concorrencia-AGU-NovoPAC): preâmbulo → 1 Objeto → 2 Participação → 3 Proposta e
   * habilitação → 4 Preenchimento da proposta → 5 Sessão e lances → 6 Julgamento → 7 Habilitação →
   * 8 Recursos → 9 Sanções → 10 Impugnação e esclarecimento → 11 Disposições gerais → Anexos.
   * Os blocos "OU" do modelo são escolhidos pelos parâmetros do processo (sigiloso, ME/EPP, consórcio, visita,
   * amostra, regime, critério, recurso federal). Parâmetro ainda sem valor = «[PREENCHER: …]» no lugar do bloco.
   * Adaptado de órgão federal/UASG/SICAF para o município: cadastro e portal são campos do processo.
   * ================================================================== */
  function edital(p, ctx) {
    var e = p.edital || {}, pz = (ctx && ctx.prazo) || {}, sig = !publico(p, "valorEstimado");
    var modal = pv(p, "modalidade"), crit = pv(p, "criterio_julgamento"), reg = pv(p, "regime_execucao");
    var me = pv(p, "me_epp"), cons = pv(p, "consorcio"), vis = pv(p, "visita_tecnica"), amo = pv(p, "amostra");
    var gar = pv(p, "garantia_contrato"), exe = pv(p, "exequibilidade"), recp = pv(p, "recurso_prazo");
    var fed = p.recursoFederal === true, lances = ehLances(p), desc = crit === "maior desconto";
    var cad = nomeCadastro(p), global_ = regimeGlobal(p);
    var vp = desc ? "percentual de desconto" : "preço";
    var h = cab(p, ctx, "Minuta de edital", null);
    var nome = modal ? modal.toUpperCase() : null;
    h += "<p><b>" + (nome ? esc(nome) : pre("modalidade")) + " ELETRÔNICA Nº " + valLinha(e.numero, "número do edital") + "</b></p>";
    h += par("<b>Processo administrativo nº:</b> " + esc(codigo(p)));
    h += par("<b>Contratante:</b> " + valLinha(((ctx && ctx.orgao) || {}).nome, "nome do órgão") + (p.secretaria ? " — " + esc(p.secretaria) : ""));
    h += par("<b>Objeto:</b> " + val(p.objeto, "objeto da licitação"));
    h += par("<b>Valor total da contratação:</b> " + valorOuSigilo(p, ctx));
    h += par("<b>Data da sessão pública:</b> " + valLinha(dataBR(pz.dataAbertura), "data de abertura das propostas") + " às " + (vazio(e.sessaoHora) ? pre("hora da sessão pública (horário de Brasília)") : esc(e.sessaoHora)) + " (horário de Brasília), no portal " + valLinha(e.portal, "portal ou plataforma eletrônica da licitação") + ".");
    h += par("<b>Critério de julgamento:</b> " + parOuPre(p, "criterio_julgamento", "critério de julgamento") + ". <b>Regime de execução:</b> " + parOuPre(p, "regime_execucao", "regime de execução") + ".");
    h += par("<b>Modo de disputa:</b> " + (lances ? (vazio(e.modoDisputa) ? pre("modo de disputa") : esc(e.modoDisputa)) : (crit ? "não se aplica (critério sem lances)" : pre("critério de julgamento"))));
    h += par("<b>Preferência ME/EPP/equiparadas:</b> " + (me === null ? pre("tratamento de ME/EPP (sim/não)") : (me ? "SIM" : "NÃO")));
    h += par("Torna-se público que o(a) " + valLinha(((ctx && ctx.orgao) || {}).nome, "nome do órgão") + ", por meio do(a) " + valLinha(e.setorLicitacoes, "setor responsável pelas licitações") + ", sediado(a) em " + valLinha(e.enderecoOrgao, "endereço do órgão (sede)") + ", realizará licitação, na modalidade " + (nome ? esc(modal) : pre("modalidade")) + ", na forma ELETRÔNICA, nos termos da Lei 14.133/2021 e demais legislação aplicável e, ainda, de acordo com as condições estabelecidas neste Edital.");
    h += par("Publicação do edital: " + valLinha(dataBR(p.dataPrevistaEdital), "data de publicação") + " (art. 54: divulgação no Portal Nacional de Contratações Públicas — PNCP). Prazo mínimo entre a publicação e a abertura: " + (pz.diasUteis ? esc(pz.diasUteis) + " dias úteis (art. 55), isto é, a partir de " + esc(dataBR(pz.dataMinimaAbertura)) : pre("prazo mínimo do art. 55")) + ".");

    h += redigir(function (o) {
      /* ---------- 1 ---------- */
      o.sec("Do objeto");
      o.it("O objeto da presente licitação é " + val(p.objeto, "objeto da licitação") + ", conforme condições, quantidades e exigências estabelecidas neste Edital e seus anexos.");
      o.it("A licitação será realizada em único item (a obra é contratada como um todo).");
      /* ---------- 2 ---------- */
      o.sec("Da participação na licitação");
      o.it("Poderão participar desta licitação os interessados que estiverem previamente credenciados no " + cad + " e no sistema eletrônico do portal " + valLinha(e.portal, "portal ou plataforma eletrônica da licitação") + ".");
      o.it("Os interessados deverão atender às condições exigidas no cadastramento no " + cad + " até o terceiro dia útil anterior à data prevista para recebimento das propostas.");
      o.it("O licitante responsabiliza-se exclusiva e formalmente pelas transações efetuadas em seu nome, assume como firmes e verdadeiras suas propostas e seus lances, inclusive os atos praticados diretamente ou por seu representante, excluída a responsabilidade do provedor do sistema ou do órgão promotor da licitação por eventuais danos decorrentes de uso indevido das credenciais de acesso, ainda que por terceiros.");
      o.it("É de responsabilidade do cadastrado conferir a exatidão dos seus dados cadastrais nos sistemas relacionados e mantê-los atualizados junto aos órgãos responsáveis pela informação, devendo proceder, imediatamente, à correção ou à alteração dos registros tão logo identifique incorreção ou aqueles se tornem desatualizados. A não observância poderá ensejar desclassificação no momento da habilitação.");
      if (me === true) {
        o.it("Será concedido tratamento favorecido para as microempresas e empresas de pequeno porte, para as sociedades cooperativas mencionadas no art. 16 da Lei 14.133/2021, para o agricultor familiar, o produtor rural pessoa física e para o microempreendedor individual (MEI), nos limites previstos da Lei Complementar 123/2006.", "tratamento");
      } else if (me === false) {
        o.it("Não será concedido, nesta licitação, o tratamento favorecido de que trata a Lei Complementar 123/2006 (decisão do órgão registrada nos parâmetros do processo).", "tratamento");
      } else o.it(pre("tratamento de ME/EPP (sim/não)"), "tratamento");
      o.it("Não poderão disputar esta licitação:", "vedacoes");
      var ved = [
        "aquele que não atenda às condições deste Edital e seu(s) anexo(s);",
        "autor do anteprojeto, do projeto básico ou do projeto executivo, pessoa física ou jurídica, quando a licitação versar sobre serviços ou fornecimento de bens a ele relacionados;",
        "empresa, isoladamente ou em consórcio, responsável pela elaboração do projeto básico ou do projeto executivo, ou empresa da qual o autor do projeto seja dirigente, gerente, controlador, acionista ou detentor de mais de 5% do capital com direito a voto, responsável técnico ou subcontratado, quando a licitação versar sobre serviços ou fornecimento de bens a ela necessários;",
        "pessoa física ou jurídica que se encontre, ao tempo da licitação, impossibilitada de participar da licitação em decorrência de sanção que lhe foi imposta;",
        "aquele que mantenha vínculo de natureza técnica, comercial, econômica, financeira, trabalhista ou civil com dirigente do órgão contratante ou com agente público que desempenhe função na licitação ou atue na fiscalização ou na gestão do contrato, ou que deles seja cônjuge, companheiro ou parente em linha reta, colateral ou por afinidade, até o terceiro grau;",
        "empresas controladoras, controladas ou coligadas, nos termos da Lei 6.404/1976, concorrendo entre si;",
        "pessoa física ou jurídica que, nos 5 anos anteriores à divulgação do edital, tenha sido condenada judicialmente, com trânsito em julgado, por exploração de trabalho infantil, por submissão de trabalhadores a condições análogas às de escravo ou por contratação de adolescentes nos casos vedados pela legislação trabalhista;",
        "agente público do órgão licitante;"
      ];
      if (cons !== true) ved.push("pessoas jurídicas reunidas em consórcio;");
      ved.push("Organizações da Sociedade Civil de Interesse Público (OSCIP), atuando nessa condição.");
      o.al(ved);
      if (cons === true) {
        o.it("É permitida a participação de pessoas jurídicas reunidas em consórcio (art. 15). Para a habilitação técnica será feito o somatório dos quantitativos de cada consorciado e, para a econômico-financeira, o somatório dos valores de cada consorciado. Se o consórcio não for formado integralmente por microempresas ou empresas de pequeno porte, haverá acréscimo de habilitação econômico-financeira para o consórcio em relação ao exigido dos licitantes individuais: " + valCampo(p, "consorcioAcrescimo") + ".");
      } else if (cons === null) o.it(pre("participação de consórcio (sim/não)"));
      o.it("Não poderá participar, direta ou indiretamente, da licitação ou da execução do contrato agente público do órgão contratante, devendo ser observadas as situações que possam configurar conflito de interesses no exercício ou após o exercício do cargo ou emprego, nos termos do art. 9º, §1º, da Lei 14.133/2021.");
      o.it("A critério da Administração e exclusivamente a seu serviço, o autor dos projetos e a empresa a que se referem as alíneas b e c do item " + o.r("vedacoes") + " poderão participar no apoio das atividades de planejamento da contratação, de execução da licitação ou de gestão do contrato, desde que sob supervisão exclusiva de agentes públicos do órgão. Equiparam-se aos autores do projeto as empresas integrantes do mesmo grupo econômico.");
      o.it("O impedimento relativo ao projeto não impede a licitação ou a contratação de serviço que inclua como encargo do contratado a elaboração do projeto executivo (nos demais regimes de execução) ou do projeto básico e do projeto executivo (nas contratações integradas).");
      o.it("Em licitações e contratações realizadas no âmbito de projetos e programas parcialmente financiados por agência oficial de cooperação estrangeira ou organismo financeiro internacional com recursos do financiamento ou da contrapartida nacional, não poderá participar pessoa física ou jurídica que integre o rol de pessoas sancionadas por essas entidades ou que seja declarada inidônea nos termos da Lei 14.133/2021, vedação que se estende a terceiro que auxilie a condução da contratação na qualidade de integrante de equipe de apoio, profissional especializado ou funcionário ou representante de empresa que preste assessoria técnica.");
      /* ---------- 3 ---------- */
      o.sec("Da apresentação da proposta e dos documentos de habilitação");
      o.it("Nesta licitação, a fase de habilitação sucederá as fases de apresentação de propostas e lances e de julgamento. (Adotando-se a modalidade concorrência, o critério de julgamento poderá ser o menor preço ou maior desconto, a melhor técnica, técnica e preço, ou o maior retorno econômico.)");
      o.it("Os licitantes encaminharão, exclusivamente por meio do sistema eletrônico, a proposta com o " + vp + ", conforme o critério de julgamento adotado neste Edital, até a data e o horário estabelecidos para abertura da sessão pública.");
      o.it("Caso a fase de habilitação anteceda as fases de apresentação de propostas e lances, os licitantes encaminharão, na forma e no prazo acima, simultaneamente os documentos de habilitação e a proposta (art. 17, §1º).");
      o.it("No cadastramento da proposta inicial, o licitante declarará, em campo próprio do sistema, que:", "declaracoes");
      o.al([
        "está ciente e concorda com as condições contidas no edital e seus anexos, bem como de que a proposta apresentada compreende a integralidade dos custos para atendimento dos direitos trabalhistas assegurados na Constituição Federal, nas leis trabalhistas, nas normas infralegais, nas convenções coletivas de trabalho e nos termos de ajustamento de conduta vigentes na data de sua entrega em definitivo e que cumpre plenamente os requisitos de habilitação definidos no instrumento convocatório;",
        "não emprega menor de 18 anos em trabalho noturno, perigoso ou insalubre e não emprega menor de 16 anos, salvo menor, a partir de 14 anos, na condição de aprendiz, nos termos do art. 7º, XXXIII, da Constituição;",
        "não possui empregados executando trabalho degradante ou forçado, observando o disposto nos incisos III e IV do art. 1º e no inciso III do art. 5º da Constituição Federal;",
        "cumpre as exigências de reserva de cargos para pessoa com deficiência e para reabilitado da Previdência Social, previstas em lei e em outras normas específicas."
      ]);
      o.it("O licitante organizado em cooperativa deverá declarar, ainda, em campo próprio do sistema, que cumpre os requisitos estabelecidos no art. 16 da Lei 14.133/2021.");
      if (me === true) {
        o.it("O fornecedor enquadrado como microempresa, empresa de pequeno porte ou sociedade cooperativa deverá declarar, ainda, em campo próprio do sistema, que cumpre os requisitos estabelecidos no art. 3º da Lei Complementar 123/2006, estando apto a usufruir do tratamento favorecido estabelecido em seus arts. 42 a 49, observado o disposto nos §§1º a 3º do art. 4º da Lei 14.133/2021.", "declme");
        o.al([
          "no item exclusivo para participação de microempresas e empresas de pequeno porte, a assinalação do campo «não» impedirá o prosseguimento no certame, para aquele item;",
          "nos itens em que a participação não for exclusiva, a assinalação do campo «não» apenas produzirá o efeito de o licitante não ter direito ao tratamento favorecido, mesmo que microempresa, empresa de pequeno porte ou sociedade cooperativa."
        ]);
      }
      o.it("A falsidade das declarações sujeitará o licitante às sanções previstas na Lei 14.133/2021 e neste Edital.");
      o.it("Os licitantes poderão retirar ou substituir a proposta ou, na hipótese de a fase de habilitação anteceder as fases de apresentação de propostas e lances e de julgamento, os documentos de habilitação anteriormente inseridos no sistema, até a abertura da sessão pública.");
      o.it("Não haverá ordem de classificação na etapa de apresentação da proposta e dos documentos de habilitação pelo licitante, o que ocorrerá somente após os procedimentos de abertura da sessão pública e da fase de envio de lances. Serão disponibilizados para acesso público os documentos que compõem a proposta dos licitantes convocados para apresentação de propostas, após a fase de envio de lances.");
      if (lances) {
        o.it("Desde que disponibilizada a funcionalidade no sistema, o licitante poderá parametrizar o seu valor final mínimo ou o seu percentual de desconto máximo quando do cadastramento da proposta, e obedecerá às seguintes regras: a aplicação do intervalo mínimo de diferença de valores ou de percentuais entre os lances, que incidirá tanto em relação aos lances intermediários quanto em relação ao lance que cobrir a melhor oferta; e lances de envio automático pelo sistema, respeitado o valor final mínimo, caso estabelecido, e o intervalo mínimo.");
        o.it("O valor final mínimo ou o percentual de desconto final máximo parametrizado poderá ser alterado pelo fornecedor durante a fase de disputa, sendo vedado valor superior a lance já registrado pelo fornecedor (menor preço) ou percentual de desconto inferior a lance já registrado (maior desconto). Esse parâmetro possui caráter sigiloso para os demais fornecedores e para o órgão, podendo ser disponibilizado estrita e permanentemente aos órgãos de controle externo e interno.");
      }
      o.it("Caberá ao licitante acompanhar as operações no sistema eletrônico durante o processo licitatório e responsabilizar-se pelo ônus decorrente da perda de negócios diante da inobservância de mensagens emitidas pela Administração ou de sua desconexão, e comunicar imediatamente ao provedor do sistema qualquer acontecimento que possa comprometer o sigilo ou a segurança, para imediato bloqueio de acesso.");
      /* ---------- 4 ---------- */
      o.sec("Do preenchimento da proposta");
      o.it("O licitante deverá enviar sua proposta mediante o preenchimento, no sistema eletrônico, do campo do " + vp + " global do item e, quando exigido, da planilha de preços do órgão, com a numeração, a descrição, a unidade e a quantidade de cada item do orçamento do órgão preservadas, sem alteração; só o preço unitário é do licitante.");
      o.it("Todas as especificações do objeto contidas na proposta vinculam o licitante.");
      o.it("Nos valores propostos estarão inclusos todos os custos operacionais, encargos previdenciários, trabalhistas, tributários, comerciais e quaisquer outros que incidam direta ou indiretamente na execução do objeto.");
      o.it("Os preços ofertados, tanto na proposta inicial quanto na etapa de lances, serão de exclusiva responsabilidade do licitante, não lhe assistindo o direito de pleitear qualquer alteração, sob alegação de erro, omissão ou qualquer outro pretexto.");
      o.it("Se o regime tributário da empresa implicar o recolhimento de tributos em percentuais variáveis, a cotação adequada será a que corresponde à média dos efetivos recolhimentos da empresa nos últimos doze meses. Independentemente do percentual de tributo inserido na planilha, no pagamento serão retidos na fonte os percentuais estabelecidos na legislação vigente.");
      if (me === true) o.it("Na presente licitação, a microempresa e a empresa de pequeno porte poderão se beneficiar do regime de tributação pelo Simples Nacional.");
      o.it("A apresentação das propostas implica obrigatoriedade do cumprimento das disposições nelas contidas, em conformidade com o que dispõe o projeto básico / termo de referência, assumindo o proponente o compromisso de executar o objeto licitado nos seus termos, bem como de fornecer os materiais, equipamentos, ferramentas e utensílios necessários, em quantidades e qualidades adequadas à perfeita execução contratual, promovendo, quando requerido, sua substituição.");
      o.it("O prazo de validade da proposta não será inferior a 60 (sessenta) dias, a contar da data de sua apresentação.");
      if (desc) o.it("Como o critério de julgamento é o de maior desconto, o preço já decorrente da aplicação do desconto ofertado deverá respeitar os preços máximos previstos no projeto básico / termo de referência.");
      if (fed) o.it("Os licitantes devem respeitar os preços máximos estabelecidos nas normas de regência de contratações públicas federais, por se tratar de contratação com recursos da União. O descumprimento pode ensejar a responsabilização pelo Tribunal de Contas da União e, após o devido processo legal, a condenação dos agentes públicos responsáveis e da empresa contratada ao pagamento dos prejuízos ao erário, caso verificado superfaturamento por sobrepreço na execução do contrato.");
      /* ---------- 5 ---------- */
      o.sec("Da abertura da sessão, classificação das propostas e formulação de lances");
      o.it("A abertura da presente licitação dar-se-á automaticamente em sessão pública, por meio de sistema eletrônico, na data, horário e local indicados neste Edital.");
      o.it("O sistema disponibilizará campo próprio para troca de mensagens entre o agente de contratação / comissão e os licitantes.");
      if (!lances) {
        o.it(crit === "técnica e preço" ? "O critério é o de técnica e preço (art. 33): a pontuação da proposta técnica e da proposta de preço segue os critérios e a ponderação do termo de referência, e a sessão pública observa a ordem de classificação assim obtida." : pre("critério de julgamento"));
      } else {
        o.it("Iniciada a etapa competitiva, os licitantes deverão encaminhar lances exclusivamente por meio de sistema eletrônico, sendo imediatamente informados do seu recebimento e do valor consignado no registro. O lance deverá ser ofertado pelo valor global do item, e os licitantes poderão oferecer lances sucessivos, observando o horário fixado para abertura da sessão e as regras estabelecidas no Edital.");
        o.it("O licitante somente poderá oferecer lance de valor inferior ou percentual de desconto superior ao último por ele ofertado e registrado pelo sistema.");
        o.it("O intervalo mínimo de diferença de valores ou percentuais entre os lances, que incidirá tanto em relação aos lances intermediários quanto em relação à proposta que cobrir a melhor oferta, deverá ser de " + valCampo(p, "intervaloLances") + ".");
        o.it("O licitante poderá, uma única vez, excluir seu último lance ofertado, no intervalo de quinze segundos após o registro no sistema, na hipótese de lance inconsistente ou inexequível.");
        o.it("O procedimento seguirá de acordo com o modo de disputa adotado: " + (vazio(e.modoDisputa) ? pre("modo de disputa") : esc(e.modoDisputa)) + ".", "modo");
        if (e.modoDisputa === "aberto") {
          o.it("Modo de disputa aberto: os licitantes apresentarão lances públicos e sucessivos, com prorrogações. A etapa de lances terá duração de dez minutos e, após isso, será prorrogada automaticamente pelo sistema quando houver lance ofertado nos últimos dois minutos do período de duração da sessão pública. A prorrogação automática será de dois minutos e ocorrerá sucessivamente sempre que houver lances enviados nesse período, inclusive no caso de lances intermediários. Não havendo novos lances, a sessão pública encerrar-se-á automaticamente, e o sistema ordenará e divulgará os lances conforme a ordem final de classificação.");
          o.it("Definida a melhor proposta, se a diferença em relação à classificada em segundo lugar for de pelo menos 5%, o agente de contratação / comissão, auxiliado pela equipe de apoio, poderá admitir o reinício da disputa aberta, para a definição das demais colocações, convocando os licitantes para apresentar lances intermediários.");
        } else if (e.modoDisputa === "aberto e fechado") {
          o.it("Modo de disputa aberto e fechado: os licitantes apresentarão lances públicos e sucessivos, com lance final e fechado. A etapa de lances terá duração inicial de quinze minutos; após esse prazo, o sistema encaminhará aviso de fechamento iminente dos lances, após o que transcorrerá o período de até dez minutos, aleatoriamente determinado, findo o qual será automaticamente encerrada a recepção de lances.");
          o.it("Encerrado esse prazo, o sistema abrirá oportunidade para que o autor da oferta de valor mais baixo e os das ofertas com preços até 10% superiores àquela possam ofertar um lance final e fechado em até cinco minutos, sigiloso até o encerramento do prazo, podendo o licitante manter o seu último lance da etapa aberta ou ofertar melhor lance. Não havendo pelo menos três ofertas nessas condições, poderão os autores dos melhores lances subsequentes, na ordem de classificação, até o máximo de três, oferecer um lance final e fechado em até cinco minutos. Após os prazos, o sistema ordenará e divulgará os lances segundo a ordem crescente de valores.");
        } else if (e.modoDisputa === "fechado e aberto") {
          o.it("Modo de disputa fechado e aberto: poderão participar da etapa aberta somente os licitantes que apresentarem a proposta de menor preço / maior percentual de desconto e os das propostas até 10% superiores / inferiores àquela, que apresentarão lances públicos e sucessivos, até o encerramento da sessão e eventuais prorrogações. Não havendo pelo menos 3 propostas nessas condições, poderão os licitantes que apresentaram as três melhores propostas, consideradas as empatadas, oferecer novos lances sucessivos.");
          o.it("A etapa de lances terá duração de dez minutos e será prorrogada automaticamente, por dois minutos e sucessivamente, quando houver lance ofertado nos últimos dois minutos do período. Definida a melhor proposta, se a diferença em relação à classificada em segundo lugar for de pelo menos 5%, o agente de contratação / comissão poderá admitir o reinício da disputa aberta, com lances intermediários. Ao término dos prazos, o sistema ordenará e divulgará os lances segundo a ordem crescente de valores.");
        }
        o.it("Não serão aceitos dois ou mais lances de mesmo valor, prevalecendo aquele que for recebido e registrado em primeiro lugar. Durante o transcurso da sessão pública, os licitantes serão informados, em tempo real, do valor do menor lance registrado, vedada a identificação do licitante.");
        o.it("No caso de desconexão com o agente de contratação / comissão, no decorrer da etapa competitiva, o sistema eletrônico poderá permanecer acessível aos licitantes para a recepção dos lances. Quando a desconexão persistir por tempo superior a dez minutos, a sessão pública será suspensa e reiniciada somente após decorridas vinte e quatro horas da comunicação do fato aos participantes, no sítio eletrônico utilizado para divulgação. Caso o licitante não apresente lances, concorrerá com o valor de sua proposta.");
      }
      if (me === true) {
        o.it("Em relação a itens não exclusivos para participação de microempresas e empresas de pequeno porte, uma vez encerrada a etapa de lances será verificado o porte da entidade empresarial. As propostas de microempresas e empresas de pequeno porte que se encontrarem na faixa de até 10% acima da melhor proposta ou melhor lance serão consideradas empatadas com a primeira colocada (arts. 44 e 45 da Lei Complementar 123/2006). A melhor classificada nessa faixa terá o direito de encaminhar uma última oferta para desempate, obrigatoriamente em valor inferior ao da primeira colocada, no prazo de 5 minutos controlados pelo sistema; se desistir ou não se manifestar, serão convocadas as demais microempresas e empresas de pequeno porte na faixa, na ordem de classificação; havendo equivalência de valores, será realizado sorteio entre elas.");
      }
      o.it("Só poderá haver empate entre propostas iguais (não seguidas de lances), ou entre lances finais da fase fechada do modo de disputa aberto e fechado. Havendo empate, o critério de desempate será o do art. 60 da Lei 14.133/2021, nesta ordem:");
      o.al([
        "disputa final, hipótese em que os licitantes empatados poderão apresentar nova proposta em ato contínuo à classificação;",
        "avaliação do desempenho contratual prévio dos licitantes, para a qual deverão preferencialmente ser utilizados registros cadastrais para efeito de atesto de cumprimento de obrigações;",
        "desenvolvimento pelo licitante de ações de equidade entre homens e mulheres no ambiente de trabalho, conforme regulamento;",
        "desenvolvimento pelo licitante de programa de integridade, conforme orientações dos órgãos de controle."
      ]);
      o.it("Persistindo o empate, será assegurada preferência, sucessivamente, aos bens e serviços produzidos ou prestados por: empresas estabelecidas no território do Estado do órgão licitante; empresas brasileiras; empresas que invistam em pesquisa e no desenvolvimento de tecnologia no País; e empresas que comprovem a prática de mitigação, nos termos da Lei 12.187/2009.");
      o.it(sig ? "Encerrada a etapa de envio de lances, o agente de contratação / comissão poderá negociar condições mais vantajosas com o primeiro colocado se a proposta permanecer acima do preço máximo definido pela Administração. " + TEXTO_SIGILO : "Encerrada a etapa de envio de lances, na hipótese de a proposta do primeiro colocado permanecer acima do preço máximo ou inferior ao desconto definido para a contratação, o agente de contratação / comissão poderá negociar condições mais vantajosas, após definido o resultado do julgamento.");
      o.it("A negociação poderá ser feita com os demais licitantes, segundo a ordem de classificação inicialmente estabelecida, quando o primeiro colocado, mesmo após a negociação, for desclassificado em razão de sua proposta permanecer acima do preço máximo definido pela Administração. A negociação será realizada por meio do sistema, podendo ser acompanhada pelos demais licitantes, e o resultado será divulgado a todos e anexado aos autos do processo licitatório.");
      o.it("O agente de contratação / comissão solicitará ao licitante mais bem classificado que, no prazo de 2 (duas) horas, envie a proposta adequada ao último lance ofertado após a negociação, acompanhada, se for o caso, dos documentos complementares necessários à confirmação daqueles exigidos neste Edital e já apresentados. É facultado prorrogar o prazo, a partir de solicitação fundamentada feita no chat pelo licitante, antes de findo o prazo. Após a negociação do preço, iniciar-se-á a fase de aceitação e julgamento da proposta.");
      /* ---------- 6 ---------- */
      o.sec("Da fase de julgamento");
      o.it("Encerrada a etapa de negociação, o agente de contratação / comissão verificará se o licitante provisoriamente classificado em primeiro lugar atende às condições de participação no certame, conforme o art. 14 da Lei 14.133/2021, a legislação correlata e o item " + o.r("vedacoes") + " do edital, especialmente quanto à existência de sanção que impeça a participação ou a futura contratação, mediante consulta aos seguintes cadastros:");
      o.al([cad + ";", "Cadastro Nacional de Empresas Inidôneas e Suspensas (CEIS), mantido pela Controladoria-Geral da União (https://www.portaltransparencia.gov.br/sancoes/ceis); e", "Cadastro Nacional de Empresas Punidas (CNEP), mantido pela Controladoria-Geral da União (https://www.portaltransparencia.gov.br/sancoes/cnep)."]);
      o.it("A consulta aos cadastros será realizada em nome da empresa licitante e também de seu sócio majoritário, por força da vedação do art. 12 da Lei 8.429/1992. Constatada a existência de sanção, o licitante será reputado inabilitado, por falta de condição de participação.");
      o.it("Na hipótese de inversão das fases de habilitação e julgamento, caso atendidas as condições de participação, será iniciado o procedimento de habilitação.");
      if (me === true) o.it("Caso o licitante provisoriamente classificado em primeiro lugar tenha se utilizado de tratamento favorecido às ME/EPP, o agente de contratação / comissão verificará se faz jus ao benefício, em conformidade com os itens " + o.r("tratamento") + " e " + o.r("declme") + " deste edital.");
      o.it("Verificadas as condições de participação, o agente de contratação / comissão examinará a proposta classificada em primeiro lugar quanto à adequação ao objeto e à compatibilidade do preço em relação ao máximo estipulado para contratação neste Edital e em seus anexos. " + (sig ? TEXTO_SIGILO : ""), "aceitabilidade");
      o.it("Será desclassificada a proposta vencedora que:");
      o.al(["contiver vícios insanáveis;", "não obedecer às especificações técnicas contidas no projeto básico / termo de referência;", "apresentar preços inexequíveis ou permanecerem acima do preço máximo definido para a contratação;", "não tiverem sua exequibilidade demonstrada, quando exigido pela Administração;", "apresentar desconformidade com quaisquer outras exigências deste Edital ou seus anexos, desde que insanável."]);
      o.it("No caso de bens e serviços em geral, é indício de inexequibilidade das propostas valores inferiores a 50% do valor orçado pela Administração, que só será considerada após diligência do agente de contratação / comissão, que comprove que o custo do licitante ultrapassa o valor da proposta e que inexistem custos de oportunidade capazes de justificar o vulto da oferta.");
      o.it("Em contratação de serviços de engenharia, além do acima, a análise de exequibilidade e sobrepreço considerará o seguinte:");
      if (global_ === null) o.al([pre("regime de execução (define como se caracteriza o sobrepreço)")]);
      else if (global_) o.al(["no regime de execução " + esc(reg) + ", a caracterização do sobrepreço se dará pela superação do valor global estimado;"]);
      else o.al(["no regime de empreitada por preço unitário, a caracterização do sobrepreço se dará pela superação do valor global estimado e pela superação de custo unitário tido como relevante, conforme a planilha anexa ao edital;"]);
      var inex = exe ? numBR(exe.inexequivelAbaixoPct, 0) : null, gad = exe ? numBR(exe.garantiaAdicionalAbaixoPct, 0) : null;
      o.al([exe ? "serão consideradas inexequíveis as propostas cujos valores forem inferiores a " + inex + "% do valor orçado pela Administração, independentemente do regime de execução (art. 59);" : pre("exequibilidade (percentuais do art. 59)"),
        exe ? "será exigida garantia adicional do licitante vencedor cuja proposta for inferior a " + gad + "% do valor orçado pela Administração, equivalente à diferença entre este último e o valor da proposta, sem prejuízo das demais garantias exigíveis de acordo com a Lei." : pre("garantia adicional (percentual do art. 59)")]);
      o.it("Se houver indícios de inexequibilidade da proposta de preço, ou em caso da necessidade de esclarecimentos complementares, poderão ser efetuadas diligências, para que a empresa comprove a exequibilidade da proposta.");
      o.it("O licitante classificado em primeiro lugar será convocado para apresentar, por meio eletrônico, a planilha com a indicação dos quantitativos e dos custos unitários, seguindo o modelo elaborado pela Administração, com detalhamento das Bonificações e Despesas Indiretas (BDI) e dos Encargos Sociais (ES), com os respectivos valores adequados ao valor final da sua proposta, sob pena de não aceitação da proposta. Nos regimes de preço global, empreitada integral, contratação semi-integrada e contratação integrada, a utilização dos preços unitários é admitida exclusivamente para eventuais adequações indispensáveis no cronograma físico-financeiro e para balizar excepcional aditamento posterior do contrato.");
      o.it("Erros no preenchimento da planilha não constituem motivo para a desclassificação da proposta. A planilha poderá ser ajustada pelo fornecedor, no prazo indicado pelo sistema, desde que não haja majoração do preço e que se comprove que este é o bastante para arcar com todos os custos da contratação; o ajuste limita-se a sanar erros ou falhas que não alterem a substância das propostas. Considera-se erro passível de correção a indicação de recolhimento de impostos e contribuições na forma do Simples Nacional, quando não cabível esse regime.");
      o.it("Para fins de análise da proposta quanto ao cumprimento das especificações do objeto, poderá ser colhida a manifestação escrita do setor requisitante ou da área especializada no objeto.");
      if (amo === true) {
        o.it("O projeto básico / termo de referência exige a apresentação de amostra: o licitante classificado em primeiro lugar deverá apresentá-la, sob pena de não aceitação da proposta. Por mensagem no sistema será divulgado o local e horário do procedimento de avaliação das amostras, cuja presença é facultada a todos os interessados, incluindo os demais licitantes, e os resultados também serão divulgados por mensagem no sistema.");
        o.it("No caso de não haver entrega da amostra ou ocorrer atraso, sem justificativa aceita pelo agente de contratação / comissão, ou havendo entrega de amostra fora das especificações previstas neste Edital, a proposta do licitante será recusada. Se a amostra do primeiro classificado não for aceita, analisar-se-á a aceitabilidade da proposta do segundo classificado e, assim, sucessivamente, até a verificação de uma que atenda às especificações.");
      } else if (amo === null) o.it(pre("amostra ou prova de conceito (sim/não)"));
      /* ---------- 7 ---------- */
      o.sec("Da fase de habilitação");
      o.it("Os documentos previstos no projeto básico / termo de referência, necessários e suficientes para demonstrar a capacidade do licitante de realizar o objeto da licitação, serão exigidos para fins de habilitação, nos termos dos arts. 62 a 70 da Lei 14.133/2021.");
      o.it("A documentação exigida para fins de habilitação jurídica, fiscal, social e trabalhista e econômico-financeira poderá ser substituída pelo registro cadastral no " + cad + ", ou por registro cadastral emitido por órgão ou entidade pública, desde que o registro tenha sido feito em obediência ao disposto na Lei 14.133/2021.");
      o.it("Quando permitida a participação de empresas estrangeiras que não funcionem no País, as exigências de habilitação serão atendidas mediante documentos equivalentes, inicialmente apresentados em tradução livre; sendo vencedora, para fins de assinatura do contrato, os documentos serão traduzidos por tradutor juramentado no País e apostilados, ou consularizados pelos respectivos consulados ou embaixadas.");
      if (cons === true) o.it("Na participação de consórcio, a habilitação técnica será feita por meio do somatório dos quantitativos de cada consorciado e, para a econômico-financeira, o somatório dos valores de cada consorciado, com o acréscimo indicado no item " + o.r("vedacoes") + " quando aplicável.");
      o.it("Os documentos exigidos para fins de habilitação poderão ser apresentados em original ou por cópia autenticada, ou por meio digital admitido pelo sistema. Somente haverá a necessidade de comprovação do preenchimento de requisitos mediante apresentação dos documentos originais não digitais quando houver dúvida em relação à integridade do documento digital ou quando a lei expressamente o exigir.");
      o.it("Será verificado se o licitante apresentou declaração de que atende aos requisitos de habilitação, e o declarante responderá pela veracidade das informações prestadas, na forma da lei (art. 63, I). Será verificado também, sob pena de inabilitação, que apresentou no sistema a declaração de que cumpre as exigências de reserva de cargos para pessoa com deficiência e para reabilitado da Previdência Social, e, sob pena de desclassificação, a declaração de que suas propostas econômicas compreendem a integralidade dos custos para atendimento dos direitos trabalhistas.");
      if (vis === true) {
        o.it("Considerando que, nesta contratação, a avaliação prévia do local de execução é imprescindível para o conhecimento pleno das condições e peculiaridades do objeto, o licitante deve atestar, sob pena de inabilitação, que conhece o local e as condições de realização do serviço, assegurado a ele o direito de realização de vistoria prévia (art. 63, §2º).");
        o.it("O licitante que optar por realizar vistoria prévia terá disponibilizado pela Administração data e horário exclusivos, a ser agendado por " + valCampo(p, "visitaAgendamento") + ", de modo que seu agendamento não coincida com o de outros licitantes. Caso opte por não realizar vistoria, poderá substituir a declaração exigida por declaração formal assinada pelo seu responsável técnico acerca do conhecimento pleno das condições e peculiaridades da contratação.");
      } else if (vis === null) o.it(pre("visita técnica (sim/não)"));
      o.it("A habilitação será verificada por meio do " + cad + ", nos documentos por ele abrangidos. É de responsabilidade do licitante conferir a exatidão dos seus dados cadastrais e mantê-los atualizados, sob pena de desclassificação no momento da habilitação. A verificação, pelo agente de contratação / comissão, em sítios eletrônicos oficiais de órgãos e entidades emissores de certidões constitui meio legal de prova.");
      o.it("Os documentos exigidos para habilitação que não estejam contemplados no " + cad + " serão enviados por meio do sistema, em formato digital, no prazo de, no mínimo, duas horas, prorrogável por igual período, contado da solicitação do agente de contratação / comissão. A verificação ou a exigência dos documentos somente será feita em relação ao licitante vencedor. Os documentos de regularidade fiscal somente serão exigidos em momento posterior ao julgamento das propostas e apenas do licitante mais bem classificado. Quando a fase de habilitação anteceder as fases de apresentação de propostas e lances e de julgamento, a verificação ou exigência ocorrerá em relação a todos os licitantes.");
      o.it("Após a entrega dos documentos para habilitação, não será permitida a substituição ou a apresentação de novos documentos, salvo em sede de diligência (art. 64), para complementação de informações acerca dos documentos já apresentados, desde que necessária para apurar fatos existentes à época da abertura do certame, e para atualização de documentos cuja validade tenha expirado após a data de recebimento das propostas.");
      o.it("Na análise dos documentos de habilitação, a comissão poderá sanar erros ou falhas que não alterem a substância dos documentos e sua validade jurídica, mediante decisão fundamentada, registrada em ata e acessível a todos, atribuindo-lhes eficácia para fins de habilitação e classificação.");
      o.it("Na hipótese de o licitante não atender às exigências para habilitação, o agente de contratação / comissão examinará a proposta subsequente e assim sucessivamente, na ordem de classificação, até a apuração de uma proposta que atenda ao presente edital. Somente serão disponibilizados para acesso público os documentos de habilitação do licitante cuja proposta atenda ao edital, após concluídos os procedimentos.");
      if (me === true) o.it("A comprovação de regularidade fiscal e trabalhista das microempresas e empresas de pequeno porte somente será exigida para efeito de contratação, e não como condição para participação na licitação.");
      o.it("Quando a fase de habilitação anteceder a de julgamento e já tiver sido encerrada, não caberá exclusão de licitante por motivo relacionado à habilitação, salvo em razão de fatos supervenientes ou só conhecidos após o julgamento.");
      /* ---------- 8 ---------- */
      o.sec("Dos recursos");
      o.it("A interposição de recurso referente ao julgamento das propostas, à habilitação ou inabilitação de licitantes, à anulação ou revogação da licitação, observará o disposto no art. 165 da Lei 14.133/2021.");
      o.it("O prazo recursal é de " + (recp ? numBR(recp.diasUteis, 0) + " dias úteis" : pre("prazo de recurso")) + ", contados da data de intimação ou de lavratura da ata.");
      o.it("Quando o recurso impugnar o julgamento das propostas ou o ato de habilitação ou inabilitação do licitante: a intenção de recorrer deverá ser manifestada imediatamente, sob pena de preclusão, e o prazo para a manifestação da intenção de recorrer não será inferior a 10 minutos; o prazo para apresentação das razões recursais será iniciado na data de intimação ou de lavratura da ata de habilitação ou inabilitação; na hipótese de adoção da inversão de fases (art. 17, §1º), o prazo para apresentação das razões recursais será iniciado na data de intimação da ata de julgamento.");
      o.it("Os recursos deverão ser encaminhados em campo próprio do sistema e dirigidos à autoridade que tiver editado o ato ou proferido a decisão recorrida, a qual poderá reconsiderar sua decisão no prazo de 3 dias úteis ou, nesse mesmo prazo, encaminhar o recurso à autoridade superior, que deverá proferir sua decisão no prazo de 10 dias úteis, contado do recebimento dos autos. Os recursos interpostos fora do prazo não serão conhecidos.");
      o.it("O prazo para apresentação de contrarrazões pelos demais licitantes será de 3 dias úteis, contados da data da intimação pessoal ou da divulgação da interposição do recurso, assegurada a vista imediata dos elementos indispensáveis à defesa de seus interesses.");
      o.it("O recurso e o pedido de reconsideração terão efeito suspensivo do ato ou da decisão recorrida até que sobrevenha decisão final da autoridade competente. O acolhimento do recurso invalida tão somente os atos insuscetíveis de aproveitamento.");
      o.it("Os autos do processo permanecerão com vista franqueada aos interessados no sítio eletrônico " + valLinha(e.portal, "portal ou plataforma eletrônica da licitação") + ".");
      /* ---------- 9 ---------- */
      o.sec("Das infrações administrativas e sanções");
      o.it("Comete infração administrativa, nos termos da lei, o licitante que, com dolo ou culpa:", "infracoes");
      o.al([
        "deixar de entregar a documentação exigida para o certame ou não entregar qualquer documento que tenha sido solicitado pelo agente de contratação / comissão durante o certame;",
        "salvo em decorrência de fato superveniente devidamente justificado, não mantiver a proposta, em especial quando não enviar a proposta adequada ao último lance ofertado ou após a negociação, recusar-se a enviar o detalhamento da proposta quando exigível, pedir para ser desclassificado quando encerrada a etapa competitiva, deixar de apresentar amostra ou apresentar proposta ou amostra em desacordo com as especificações do edital;",
        "não celebrar o contrato ou não entregar a documentação exigida para a contratação, quando convocado dentro do prazo de validade de sua proposta;",
        "recusar-se, sem justificativa, a assinar o contrato, ou a aceitar ou retirar o instrumento equivalente no prazo estabelecido pela Administração;",
        "apresentar declaração ou documentação falsa exigida para o certame ou prestar declaração falsa durante a licitação;",
        "fraudar a licitação;",
        "comportar-se de modo inidôneo ou cometer fraude de qualquer natureza, em especial quando induzir deliberadamente a erro no julgamento, apresentar amostra falsificada ou deteriorada ou praticar atos ilícitos com vistas a frustrar os objetivos da licitação;",
        "praticar ato lesivo previsto no art. 5º da Lei 12.846/2013."
      ]);
      o.it("Com fulcro na Lei 14.133/2021, a Administração poderá, garantida a prévia defesa, aplicar aos licitantes e/ou adjudicatários as seguintes sanções, sem prejuízo das responsabilidades civil e criminal: advertência; multa; impedimento de licitar e contratar; e declaração de inidoneidade para licitar ou contratar, enquanto perdurarem os motivos determinantes da punição ou até que seja promovida sua reabilitação perante a própria autoridade que aplicou a penalidade.");
      o.it("Na aplicação das sanções serão considerados a natureza e a gravidade da infração cometida, as peculiaridades do caso concreto, as circunstâncias agravantes ou atenuantes, os danos que dela provierem para a Administração Pública e a implantação ou o aperfeiçoamento de programa de integridade, conforme normas e orientações dos órgãos de controle.");
      o.it("A multa será recolhida em percentual de 0,5% a 30% incidente sobre o valor do contrato licitado, no prazo fixado na comunicação oficial. Para as infrações das alíneas a, b e c do item " + o.r("infracoes") + ", a multa será de 0,5% a 15% do valor do contrato licitado; para as das alíneas d a h, de 15% a 30%.");
      o.it("As sanções de advertência, impedimento de licitar e contratar e declaração de inidoneidade poderão ser aplicadas, cumulativamente ou não, à penalidade de multa. Na aplicação da multa será facultada a defesa do interessado no prazo de 15 dias úteis, contado da data de sua intimação.");
      o.it("A sanção de impedimento de licitar e contratar será aplicada ao responsável em decorrência das infrações das alíneas a, b e c, quando não se justificar a imposição de penalidade mais grave, e impedirá o responsável de licitar e contratar no âmbito da Administração Pública direta e indireta do ente federativo a qual pertencer o órgão, pelo prazo máximo de 3 anos.");
      o.it("Poderá ser aplicada a sanção de declaração de inidoneidade em decorrência das infrações das alíneas d a h, bem como das alíneas a, b e c que justifiquem a imposição de penalidade mais grave que o impedimento, cuja duração observará o prazo do art. 156, §5º, da Lei 14.133/2021.");
      o.it("A recusa injustificada do adjudicatário em assinar o contrato, ou em aceitar ou retirar o instrumento equivalente no prazo estabelecido pela Administração, caracterizará o descumprimento total da obrigação assumida e o sujeitará às penalidades e à imediata perda da garantia de proposta em favor do órgão promotor da licitação.");
      o.it("A apuração de responsabilidade relacionada às sanções de impedimento de licitar e contratar e de declaração de inidoneidade demandará a instauração de processo de responsabilização conduzido por comissão composta por 2 ou mais servidores estáveis, que avaliará fatos e circunstâncias conhecidos e intimará o licitante ou o adjudicatário para, no prazo de 15 dias úteis, contado da data de sua intimação, apresentar defesa escrita e especificar as provas que pretenda produzir.");
      o.it("Caberá recurso no prazo de 15 dias úteis da aplicação das sanções de advertência, multa e impedimento de licitar e contratar, contado da data da intimação, dirigido à autoridade que tiver proferido a decisão recorrida, que, se não a reconsiderar no prazo de 5 dias úteis, encaminhará o recurso com sua motivação à autoridade superior, que deverá decidir no prazo máximo de 20 dias úteis, contado do recebimento dos autos. Caberá pedido de reconsideração da declaração de inidoneidade no prazo de 15 dias úteis, decidido no prazo máximo de 20 dias úteis. O recurso e o pedido de reconsideração terão efeito suspensivo.");
      o.it("A aplicação das sanções previstas neste edital não exclui, em hipótese alguma, a obrigação de reparação integral dos danos causados." + (vazio(e.sancoes) ? "" : " Regime complementar do órgão: " + nl2br(e.sancoes)));
      /* ---------- 10 ---------- */
      o.sec("Da impugnação ao edital e do pedido de esclarecimento");
      o.it("Qualquer pessoa é parte legítima para impugnar este Edital por irregularidade na aplicação da Lei 14.133/2021, devendo protocolar o pedido até 3 (três) dias úteis antes da data da abertura do certame.");
      o.it("A resposta à impugnação ou ao pedido de esclarecimento será divulgada em sítio eletrônico oficial no prazo de até 3 (três) dias úteis, limitado ao último dia útil anterior à data da abertura do certame.");
      o.it("A impugnação e o pedido de esclarecimento poderão ser realizados por forma eletrônica, pelo seguinte meio: " + valLinha(e.emailImpugnacao, "e-mail institucional para impugnações e pedidos de esclarecimento") + ".");
      o.it("As impugnações e pedidos de esclarecimentos não suspendem os prazos previstos no certame. A concessão de efeito suspensivo à impugnação é medida excepcional e deverá ser motivada pelo agente de contratação, nos autos do processo de licitação. Acolhida a impugnação, será definida e publicada nova data para a realização do certame.");
      /* ---------- 11 ---------- */
      o.sec("Das disposições gerais");
      o.it("Será divulgada ata da sessão pública no sistema eletrônico.");
      o.it("Não havendo expediente ou ocorrendo qualquer fato superveniente que impeça a realização do certame na data marcada, a sessão será automaticamente transferida para o primeiro dia útil subsequente, no mesmo horário anteriormente estabelecido, desde que não haja comunicação em contrário, pelo agente de contratação / comissão.");
      o.it("Todas as referências de tempo no Edital, no aviso e durante a sessão pública observarão o horário de Brasília - DF.");
      o.it("A homologação do resultado desta licitação não implicará direito à contratação.");
      o.it("As normas disciplinadoras da licitação serão sempre interpretadas em favor da ampliação da disputa entre os interessados, desde que não comprometam o interesse da Administração, o princípio da isonomia, a finalidade e a segurança da contratação.");
      o.it("Os licitantes assumem todos os custos de preparação e apresentação de suas propostas e a Administração não será, em nenhum caso, responsável por esses custos, independentemente da condução ou do resultado do processo licitatório.");
      o.it("Na contagem dos prazos estabelecidos neste Edital e seus Anexos, excluir-se-á o dia do início e incluir-se-á o do vencimento. Só se iniciam e vencem os prazos em dias de expediente na Administração.");
      o.it("O desatendimento de exigências formais não essenciais não importará o afastamento do licitante, desde que seja possível o aproveitamento do ato, observados os princípios da isonomia e do interesse público.");
      o.it("Em caso de divergência entre disposições deste Edital e de seus anexos ou demais peças que compõem o processo, prevalecerão as deste Edital.");
      if (fed) o.it("A contratação é custeada com recursos da União, por meio de " + valCampo(p, "instrumentoRepasse") + ", e se sujeita às normas do concedente, à fiscalização dos órgãos de controle federais e às demais condições do instrumento de transferência.");
      o.it("O Edital e seus anexos estão disponíveis, na íntegra, no Portal Nacional de Contratações Públicas (PNCP) e no endereço eletrônico " + valLinha(e.portal, "portal ou plataforma eletrônica da licitação") + ".");
      o.it("Integram este Edital, para todos os fins e efeitos, os seguintes anexos:");
      o.raw(lista(["Anexo I — Termo de referência / projeto básico (com o Estudo Técnico Preliminar, como apêndice)", "Anexo II — Planilha orçamentária" + (sig ? " (sem preços, enquanto o orçamento é sigiloso)" : "") + ", composições de custos, BDI e encargos sociais", "Anexo III — Cronograma físico-financeiro", "Anexo IV — Projetos e memoriais descritivos", "Anexo V — Matriz de riscos", "Anexo VI — Minuta do contrato", "Anexo VII — Modelos de declaração e de proposta"]));
    });
    return h + par(valLinha(((ctx && ctx.orgao) || {}).nome, "nome do órgão") + ", " + (ctx && ctx.hoje ? dataBR(ctx.hoje) : pre("data"))) + assinatura("Agente de contratação / presidente da comissão") + assinatura("Autoridade competente");
  }

  /* ================================================================== *
   * MINUTA DO CONTRATO — cláusulas do modelo AGU/SEGES de termo de contrato de obras e serviços comuns de
   * engenharia (REF-minuta-de-contratos-NovoPAC), cada uma com o inciso do art. 92 da Lei 14.133/2021 que a exige:
   * I objeto · II vinculação ao edital e à proposta · III legislação e casos omissos · IV regime de execução ·
   * V preço, pagamento, reajuste · VI medição e liquidação · VII prazos · VIII crédito orçamentário · IX matriz de riscos ·
   * X repactuação · XI reequilíbrio · XII garantias · XIII garantia do objeto · XIV direitos, responsabilidades e penalidades ·
   * XVI manter a habilitação · XVII reserva de cargos · XVIII modelo de gestão · XIX extinção · §1º foro.
   * «[conferir]» marca o que NÃO está no texto de referência (é redação da casa): o jurídico do órgão confirma.
   * ================================================================== */
  var CONFERIR = ' <b>[conferir com o jurídico]</b>';
  function contrato(p, ctx) {
    var e = p.edital || {}, t = p.tr || {}, sig = !publico(p, "valorEstimado");
    var sub = pv(p, "subcontratacao"), gar = pv(p, "garantia_contrato"), aditivo = pv(p, "aditivo_teto"), reaj = pv(p, "reajuste"), reg = pv(p, "regime_execucao");
    var rs = arr(p.riscos), cad = nomeCadastro(p);
    var h = cab(p, ctx, "Minuta de contrato", null);
    h += par("Contrato administrativo nº ____/____ (numeração atribuída pelo órgão na assinatura). Cláusulas necessárias: Lei 14.133/2021, art. 92. Estrutura do modelo de termo de contrato de obras e serviços comuns de engenharia da AGU/SEGES, adaptada ao município. Marcação «[conferir com o jurídico]»: redação que não consta do modelo de referência.");
    h += redigir(function (o) {
      o.sec("Das partes");
      o.it("Contratante: " + valLinha(((ctx && ctx.orgao) || {}).nome, "nome do órgão") + (p.secretaria ? ", por intermédio de " + esc(p.secretaria) : "") + ", com sede em " + valLinha(e.enderecoOrgao, "endereço do órgão (sede)") + ", neste ato representado por " + valLinha(e.representante, "nome, cargo e ato de nomeação do representante do contratante") + ".");
      o.it("Contratada: a licitante vencedora, qualificada na ata de julgamento e na assinatura do contrato.");

      o.sec("Do objeto (art. 92, I e II)");
      o.it("O objeto do presente instrumento é a contratação de empresa especializada para a execução de " + val(p.objeto, "objeto do contrato") + ", nas condições estabelecidas no Termo de Referência.");
      o.it("Vinculam esta contratação, independentemente de transcrição: o Termo de Referência; o Edital da licitação; a proposta do contratado; e eventuais anexos dos documentos supracitados.");
      o.it("O regime de execução é o de " + parOuPre(p, "regime_execucao", "regime de execução") + " (art. 92, IV; art. 46).");

      o.sec("Da vigência e da prorrogação (art. 92, VII)");
      o.it("O prazo de vigência da contratação é de " + valLinha(e.vigencia, "prazo de vigência e prazo de execução, em meses ou dias") + ", contados da assinatura do contrato, na forma do art. 105 da Lei 14.133/2021.");
      o.it("O prazo de vigência será automaticamente prorrogado, independentemente de termo aditivo, quando o objeto não for concluído no período firmado acima, ressalvadas as providências cabíveis no caso de culpa do contratado, previstas neste instrumento.");

      o.sec("Dos modelos de execução e gestão contratuais (art. 92, IV, VII e XVIII)");
      o.it("O regime de execução contratual, os modelos de gestão e de execução, assim como os prazos e condições de conclusão, entrega, observação e recebimento do objeto, constam no Termo de Referência, anexo a este contrato. A execução terá início em " + valCampo(p, "inicioExecucao") + ", e o recebimento seguirá os prazos de " + valCampo(p, "prazoRecProvisorio") + " dias (provisório) e " + valCampo(p, "prazoRecDefinitivo") + " dias (definitivo) do Termo de Referência. Fiscalização e gestão: " + val(t.gestao, "fiscal e gestor do contrato") + ".");

      o.sec("Da matriz de riscos (art. 92, IX; art. 22)");
      if (!rs.length) o.it(pre("riscos da contratação (use a biblioteca do tipo de objeto)"));
      else {
        [["contratante", "Constituem riscos a serem suportados pelo contratante:"], ["contratada", "Constituem riscos a serem suportados pelo contratado:"], ["compartilhado", "Constituem riscos a serem compartilhados pelas partes:"]].forEach(function (g) {
          var lst = rs.filter(function (r) { return r.alocacao === g[0]; });
          if (lst.length) { o.it(g[1]); o.al(lst.map(function (r) { return esc(r.descricao) + ";"; })); }
        });
        var sem = rs.filter(function (r) { return !r.alocacao; });
        if (sem.length) o.it(pre("alocação de cada risco: " + sem.map(function (r) { return r.descricao; }).join("; ")));
        o.it("O detalhamento (causa, impacto, ações preventivas e de contingência) consta do anexo «Mapa e matriz de riscos»." + CONFERIR);
      }

      o.sec("Da subcontratação");
      if (sub === null) o.it(pre("subcontratação (sim/não)"));
      else if (sub === false) o.it("Não será admitida a subcontratação do objeto contratual.");
      else {
        o.it("É permitida a subcontratação parcial do objeto, até o limite de " + valCampo(p, "subcontratacaoLimite") + " do valor total do contrato, vedada a subcontratação completa ou da parcela principal da obrigação.");
        o.it("Em qualquer hipótese de subcontratação, permanece a responsabilidade integral do contratado pela perfeita execução contratual, cabendo-lhe realizar a supervisão e coordenação das atividades do subcontratado, bem como responder perante o contratante pelo rigoroso cumprimento das obrigações correspondentes ao objeto da subcontratação.");
        o.it("A subcontratação depende de autorização prévia do contratante, a quem incumbe avaliar se o subcontratado cumpre os requisitos de qualificação técnica necessários, mediante documentação apresentada pelo contratado e juntada aos autos.");
        o.it("É vedada a subcontratação de pessoa física ou jurídica, se aquela ou os dirigentes desta mantiverem vínculo de natureza técnica, comercial, econômica, financeira, trabalhista ou civil com dirigente do órgão contratante ou com agente público que desempenhe função na contratação ou atue na fiscalização ou na gestão do contrato, ou se deles forem cônjuge, companheiro ou parente em linha reta, colateral ou por afinidade, até o terceiro grau.");
      }

      o.sec("Do preço (art. 92, V)");
      o.it("O valor total da contratação é o da proposta vencedora, aceita pela Administração e registrada na ata de julgamento." + (sig ? " O orçamento estimado é sigiloso até o julgamento (art. 24)." : ""));
      o.it("No valor estão incluídas todas as despesas ordinárias diretas e indiretas decorrentes da execução do objeto, inclusive tributos e/ou impostos, encargos sociais, trabalhistas, previdenciários, fiscais e comerciais incidentes, taxa de administração, frete, seguro e outros necessários ao cumprimento integral do objeto da contratação.");
      o.it(reg !== null && !REGIMES_GLOBAIS.test(reg) ? "O valor é meramente estimativo, de forma que os pagamentos devidos ao contratado dependerão dos quantitativos efetivamente executados (empreitada por preço unitário)." : "Os pagamentos dependerão da medição dos serviços efetivamente executados, conforme o cronograma físico-financeiro." + CONFERIR);

      o.sec("Da medição, da liquidação e do pagamento (art. 92, V e VI)");
      o.it("Medição: " + valLinha(t.medicao, "critério de medição") + ". O prazo de liquidação é de " + valCampo(p, "prazoLiquidacao") + " dias úteis, contados do recebimento da nota fiscal ou documento de cobrança equivalente.");
      o.it("Pagamento: " + valLinha(t.pagamento, "condições e prazo de pagamento") + ". No caso de atraso pelo Contratante, os valores devidos serão atualizados monetariamente pelo índice " + valCampo(p, "indiceAtraso") + ". As demais condições constam do Termo de Referência, anexo a este contrato.");

      o.sec("Do reajuste (art. 92, V)");
      if (reaj === null) o.it(pre("índice e data-base do reajuste"));
      else {
        o.it("Os preços inicialmente contratados são fixos e irreajustáveis no prazo de um ano contado da data-base " + valLinha(dataBR(reaj.dataBase), "data-base do orçamento estimado") + " (art. 25, §7º).");
        o.it("Após o interregno de um ano, e independentemente de pedido do contratado, os preços iniciais serão reajustados, mediante a aplicação, pelo contratante, do índice " + (vazio(reaj.indice) ? pre("índice de reajuste") : esc(reaj.indice)) + ", exclusivamente para as obrigações iniciadas e concluídas após a ocorrência da anualidade. Nos reajustes subsequentes ao primeiro, o interregno mínimo de um ano será contado a partir dos efeitos financeiros do último reajuste.");
        o.it("No caso de atraso ou não divulgação do índice, o contratante pagará a importância calculada pela última variação conhecida, liquidando a diferença tão logo seja divulgado o índice definitivo. O contratado apresentará memória de cálculo do reajustamento. Extinto o índice, será adotado o que vier a ser determinado pela legislação; na ausência de previsão legal, as partes elegerão novo índice oficial, por termo aditivo. O reajuste será realizado por apostilamento.");
      }

      o.sec("Das obrigações do contratante (art. 92, X, XI e XIV)");
      o.it("São obrigações do Contratante: exigir o cumprimento de todas as obrigações assumidas pelo Contratado, de acordo com o contrato e seus anexos; receber o objeto no prazo e condições estabelecidos no Termo de Referência; notificar o Contratado, por escrito, de imperfeições, falhas, vícios, defeitos ou irregularidades constatadas, fixando prazo para a correção; acompanhar e fiscalizar a execução do contrato; comunicar a empresa para emissão de nota fiscal quanto à parcela incontroversa da execução, quando houver controvérsia sobre dimensão, qualidade e quantidade (art. 143); efetuar o pagamento no prazo, forma e condições estabelecidos; aplicar ao Contratado as sanções previstas na lei e neste contrato; fornecer por escrito as informações necessárias ao desenvolvimento dos serviços; realizar avaliações periódicas da qualidade dos serviços, após seu recebimento; comunicar o Contratado na hipótese de posterior alteração do projeto pelo Contratante (art. 93, §2º); e notificar os emitentes das garantias quanto ao início de processo administrativo para apuração de descumprimento de cláusulas contratuais (art. 137, §4º).");
      o.it("O Contratante emitirá decisão explícita sobre todas as solicitações e reclamações relacionadas à execução do contrato, ressalvados os requerimentos manifestamente impertinentes, meramente protelatórios ou de nenhum interesse para a boa execução do ajuste, e responderá aos pedidos de repactuação no prazo de " + valCampo(p, "prazoRepactuacao") + " e de reestabelecimento do equilíbrio econômico-financeiro no prazo de " + valCampo(p, "prazoReequilibrio") + ".");
      o.it("Previamente à expedição da ordem de serviço, o Contratante verificará pendências, liberará áreas e adotará as providências cabíveis para a regularidade do início da execução, e exigirá do Contratado, como condição para o recebimento definitivo, quando for o caso: o projeto «as built»; a comprovação das ligações definitivas de energia, água, telefone e gás; o laudo de vistoria do corpo de bombeiros; o alvará de funcionamento; a carta «habite-se»; a licença ambiental de operação, quando cabível; e a certidão negativa de débitos previdenciários específica para o registro da obra no Cartório de Registro de Imóveis.");
      o.it("O Contratante não responderá por quaisquer compromissos assumidos pelo Contratado com terceiros, ainda que vinculados à execução do contrato, nem por dano causado a terceiros em decorrência de ato do Contratado, de seus empregados, prepostos ou subordinados.");

      o.sec("Das obrigações do contratado (art. 92, XIV, XVI e XVII)");
      o.it("O Contratado deve cumprir todas as obrigações constantes deste contrato e de seus anexos, assumindo como exclusivamente seus os riscos e as despesas decorrentes da boa e perfeita execução do objeto, observando ainda: manter preposto aceito pela Administração no local do serviço; atender às determinações regulares do fiscal do contrato ou autoridade superior (art. 137, II); alocar os empregados necessários, com habilitação adequada, fornecendo materiais, equipamentos, ferramentas e utensílios, cuja quantidade, qualidade e tecnologia atendam às recomendações de boa técnica e à legislação de regência; reparar, corrigir, remover, reconstruir ou substituir, às suas expensas, no prazo fixado pelo fiscal, os serviços com vícios, defeitos ou incorreções; e responsabilizar-se pelos vícios e danos decorrentes da execução do objeto, de acordo com o Código de Defesa do Consumidor (Lei 8.078/1990), sem que a fiscalização reduza essa responsabilidade, ficando o Contratante autorizado a descontar dos pagamentos devidos ou da garantia o valor correspondente aos danos sofridos.");
      o.it("O Contratado deve ainda: comunicar ao Contratante, assim que tiver ciência, a impossibilidade de realização ou finalização do serviço no prazo; não contratar, durante a vigência do contrato, cônjuge, companheiro ou parente em linha reta, colateral ou por afinidade, até o terceiro grau, de dirigente do contratante ou do fiscal ou gestor do contrato (art. 48, parágrafo único); responsabilizar-se pelas obrigações trabalhistas, sociais, previdenciárias, tributárias e as demais previstas em legislação específica, cuja inadimplência não transfere a responsabilidade ao Contratante; comunicar ao fiscal, em 24 horas, qualquer ocorrência anormal ou acidente no local dos serviços; garantir o acesso, a qualquer tempo, aos locais e documentos relativos à execução; paralisar, por determinação do Contratante, qualquer atividade que não esteja sendo executada de acordo com a boa técnica ou que ponha em risco pessoas ou bens de terceiros; promover a guarda e a vigilância de materiais e ferramentas durante a vigência do contrato; manter limpo o local dos serviços e nas melhores condições de segurança, higiene e disciplina; e submeter previamente ao Contratante, por escrito, mudanças nos métodos executivos que fujam às especificações do memorial descritivo.");
      o.it("O Contratado manterá, durante toda a vigência do contrato, em compatibilidade com as obrigações assumidas, todas as condições exigidas para habilitação na licitação (art. 92, XVI); quando não for possível a verificação da regularidade no " + cad + ", entregará ao fiscal, até o dia trinta do mês seguinte ao da prestação dos serviços, a prova de regularidade relativa à Seguridade Social, a certidão conjunta relativa aos tributos federais e à Dívida Ativa da União, as certidões de regularidade perante a Fazenda Municipal, o Certificado de Regularidade do FGTS e a Certidão Negativa de Débitos Trabalhistas.");
      o.it("O Contratado cumprirá, durante todo o período de execução do contrato, a reserva de cargos prevista em lei para pessoa com deficiência, para reabilitado da Previdência Social ou para aprendiz (art. 116; art. 92, XVII), e a comprovará no prazo fixado pelo fiscal do contrato, com a indicação dos empregados que preencheram as vagas (art. 116, parágrafo único).");
      o.it("O Contratado deve, também: não permitir a utilização de trabalho do menor de dezesseis anos, exceto na condição de aprendiz para os maiores de quatorze, nem de menor de dezoito anos em trabalho noturno, perigoso ou insalubre; guardar sigilo sobre as informações obtidas em decorrência do contrato; arcar com o ônus de eventual equívoco no dimensionamento dos quantitativos de sua proposta, exceto nos eventos do art. 124, II, d; estar registrado no conselho profissional competente, em plena validade; obter as licenças e autorizações exigíveis, na forma da legislação aplicável; elaborar o Diário de Obra, com as informações diárias do andamento do empreendimento; observar a gestão dos resíduos da construção civil nos termos da Resolução CONAMA 307/2002, dando destinação ambientalmente adequada aos resíduos; providenciar, conforme o caso, as ligações definitivas das utilidades previstas no projeto; e responder por qualquer acidente de trabalho na execução dos serviços e por danos resultantes de defeitos ou incorreções dos serviços, ainda que ocorridos em via pública junto à obra.");
      o.it("As partes cumprirão a Lei 13.709/2018 (LGPD) quanto aos dados pessoais a que tenham acesso em razão do certame ou do contrato, que somente poderão ser utilizados para as finalidades que justificaram o acesso, vedado o compartilhamento com terceiros fora das hipóteses legais; terminado o tratamento, o contratado os eliminará, ressalvadas as hipóteses do art. 16 da LGPD." + CONFERIR);

      o.sec("Da garantia de execução (art. 92, XII)");
      if (gar === null) o.it(pre("garantia do contrato"));
      else if (gar.pct === undefined || gar.pct === null) o.it("Não haverá exigência de garantia contratual da execução.");
      else {
        o.it("A contratação conta com garantia de execução, nos moldes do art. 96 da Lei 14.133/2021, em valor correspondente a " + esc(numBR(Number(gar.pct), 2)) + "% do valor total do contrato, à escolha do contratado: caução em dinheiro ou em títulos da dívida pública, seguro-garantia ou fiança bancária" + (gar.seguroRetomada ? "; a modalidade seguro-garantia terá cláusula de retomada, conforme o art. 102, devendo a seguradora, em caso de inadimplemento do contratado, assumir a execução e concluir o objeto do contrato" : "") + "." + (gar.justificativa ? " Justificativa: " + esc(gar.justificativa) + "." : ""));
        o.it("O contratado apresentará, no prazo máximo de 10 dias úteis, prorrogáveis por igual período, a critério do contratante, contado da assinatura do contrato, o comprovante de prestação de garantia; na modalidade seguro-garantia, a apólice será apresentada, no máximo, até a data de assinatura e terá validade durante a vigência do contrato e por mais 90 dias após o término desta, permanecendo em vigor mesmo que o contratado não pague o prêmio nas datas convencionadas, e acompanhará as modificações da vigência mediante endosso.");
        o.it("A garantia assegurará, qualquer que seja a modalidade, o pagamento de prejuízos advindos do não cumprimento do objeto e do não adimplemento das demais obrigações; de multas moratórias e punitivas aplicadas pela Administração à contratada; e de obrigações trabalhistas e previdenciárias de qualquer natureza e para com o FGTS, não adimplidas pelo contratado, quando couber.");
        o.it("Na fiança bancária, a instituição financeira será autorizada a operar no País pelo Banco Central do Brasil e renunciará expressamente aos benefícios do art. 827 do Código Civil. No caso de alteração do valor do contrato ou prorrogação de sua vigência, a garantia será ajustada ou renovada nos mesmos parâmetros. Se o valor da garantia for utilizado em pagamento de qualquer obrigação, o contratado a reporá no prazo fixado na notificação." + CONFERIR);
        o.it("A garantia somente será liberada ou restituída após a fiel execução do contrato ou após a sua extinção por culpa exclusiva da Administração e, quando em dinheiro, será atualizada monetariamente. A garantia de execução é independente de eventual garantia do produto ou serviço prevista no Termo de Referência.");
      }

      o.sec("Da garantia do objeto (art. 92, XIII)");
      var nm = Number(String(t.garantiaServicoMeses === undefined ? "" : t.garantiaServicoMeses).replace(",", "."));
      if (vazio(t.garantiaServicoMeses) || !isFinite(nm)) o.it(pre("garantia complementar do serviço, em meses (0 = só a garantia legal)"));
      else if (nm <= 0) o.it("O prazo de garantia do objeto é o estabelecido na Lei 8.078/1990 (Código de Defesa do Consumidor) e na Lei 10.406/2002 (Código Civil).");
      else o.it("O prazo de garantia mínima do objeto, complementar à garantia legal, é de " + numBR(nm, 0) + " meses, contados do primeiro dia útil subsequente ao recebimento definitivo.");

      o.sec("Das infrações e sanções administrativas (art. 92, XIV)");
      o.it("Comete infração administrativa, nos termos da Lei 14.133/2021, o contratado que: der causa à inexecução parcial do contrato; der causa à inexecução parcial que cause grave dano à Administração, ao funcionamento dos serviços públicos ou ao interesse coletivo; der causa à inexecução total; ensejar o retardamento da execução ou da entrega do objeto sem motivo justificado; apresentar documentação falsa ou prestar declaração falsa durante a execução; praticar ato fraudulento na execução; comportar-se de modo inidôneo ou cometer fraude de qualquer natureza; ou praticar ato lesivo previsto no art. 5º da Lei 12.846/2013.");
      o.it("Serão aplicadas as seguintes sanções: advertência, quando o contratado der causa à inexecução parcial, sempre que não se justificar penalidade mais grave (art. 156, §2º); impedimento de licitar e contratar, nas condutas de inexecução parcial com grave dano, inexecução total e retardamento injustificado, quando não se justificar penalidade mais grave (art. 156, §4º); declaração de inidoneidade para licitar e contratar, nas condutas de documentação ou declaração falsa, fraude e comportamento inidôneo ou ato lesivo, bem como nas anteriores que justifiquem penalidade mais grave (art. 156, §5º); e multa.");
      o.it("Multa moratória e compensatória: " + valLinha(e.multaContrato, "percentuais da multa moratória e da multa compensatória do contrato") + ".");
      o.it("A aplicação das sanções não exclui a obrigação de reparação integral do dano causado ao Contratante (art. 156, §9º) e todas poderão ser aplicadas cumulativamente com a multa (art. 156, §7º). Antes da aplicação da multa será facultada a defesa do interessado no prazo de 15 dias úteis, contado da data de sua intimação (art. 157). Se a multa e as indenizações forem superiores ao pagamento eventualmente devido, a diferença será descontada da garantia prestada ou cobrada judicialmente (art. 156, §8º).");
      o.it("A aplicação das sanções realizar-se-á em processo administrativo que assegure o contraditório e a ampla defesa, observado o procedimento do art. 158 para o impedimento de licitar e contratar e a declaração de inidoneidade. Na aplicação serão considerados a natureza e a gravidade da infração, as peculiaridades do caso concreto, as circunstâncias agravantes ou atenuantes, os danos para o Contratante e a implantação ou o aperfeiçoamento de programa de integridade (art. 156, §1º). Os atos que também sejam tipificados como atos lesivos na Lei 12.846/2013 serão apurados e julgados conjuntamente (art. 159). A personalidade jurídica do Contratado poderá ser desconsiderada quando utilizada com abuso do direito para facilitar, encobrir ou dissimular a prática dos atos ilícitos previstos neste contrato (art. 160).");
      o.it("O Contratante informará e manterá atualizados os dados relativos às sanções aplicadas, para fins de publicidade nos cadastros de empresas inidôneas e punidas (art. 161), e as sanções de impedimento e de inidoneidade são passíveis de reabilitação na forma do art. 163." + (vazio(e.rescisaoForo) ? "" : " Complemento do órgão: " + nl2br(e.rescisaoForo)));

      o.sec("Da extinção contratual (art. 92, XIX)");
      o.it("O contrato será extinto quando cumpridas as obrigações de ambas as partes, ainda que isso ocorra antes do prazo estipulado. Se as obrigações não forem cumpridas no prazo estipulado, a vigência ficará prorrogada até a conclusão do objeto, devendo a Administração providenciar a readequação do cronograma; quando a não conclusão decorrer de culpa do contratado, ficará ele constituído em mora, sendo-lhe aplicáveis as sanções administrativas, e poderá a Administração optar pela extinção do contrato e adotar as medidas admitidas em lei para a continuidade da execução.");
      o.it("O contrato poderá ser extinto antes do prazo, sem ônus para o contratante, quando este não dispuser de créditos orçamentários para sua continuidade ou quando entender que o contrato não mais lhe oferece vantagem, na próxima data de aniversário do contrato, mediante notificação com pelo menos 2 meses de antecedência (ou 2 meses da comunicação, se esta ocorrer com menos de 2 meses da data de aniversário).");
      o.it("O contrato poderá ser extinto por algum dos motivos previstos no art. 137 da Lei 14.133/2021, bem como amigavelmente, assegurados o contraditório e a ampla defesa, aplicando-se também os arts. 138 e 139. A extinção do contrato não configura óbice ao reconhecimento do desequilíbrio econômico-financeiro, hipótese em que será concedida indenização por meio de termo indenizatório (art. 131, caput). A alteração social ou a modificação da finalidade ou da estrutura da empresa não ensejará a extinção se não restringir sua capacidade de concluir o contrato; se implicar mudança da pessoa jurídica contratada, será formalizado termo aditivo para alteração subjetiva.");

      o.sec("Da dotação orçamentária (art. 92, VIII)");
      o.it("As despesas decorrentes desta contratação correrão à conta de recursos específicos consignados no orçamento do contratante, na dotação (funcional programática e categoria econômica): " + valLinha(t.dotacao, "dotação orçamentária") + ". A dotação relativa aos exercícios financeiros subsequentes será indicada após aprovação da lei orçamentária respectiva e liberação dos créditos correspondentes, mediante apostilamento.");

      o.sec("Dos casos omissos (art. 92, III)");
      o.it("Os casos omissos serão decididos pelo contratante, segundo as disposições contidas na Lei 14.133/2021 e demais normas aplicáveis e, subsidiariamente, segundo as disposições da Lei 8.078/1990 (Código de Defesa do Consumidor) e as normas e princípios gerais dos contratos.");

      o.sec("Das alterações");
      o.it("Eventuais alterações contratuais reger-se-ão pela disciplina dos arts. 124 e seguintes da Lei 14.133/2021. " + (aditivo ? "O contratado é obrigado a aceitar, nas mesmas condições contratuais, os acréscimos ou supressões que se fizerem necessários, até o limite de " + numBR(aditivo.acrescimoPct, 0) + "% de acréscimo e " + numBR(aditivo.supressaoPct, 0) + "% de supressão do valor inicial atualizado do contrato (art. 125)." : pre("limites de acréscimos e supressões")));
      o.it("As alterações contratuais deverão ser promovidas mediante termo aditivo, submetido à prévia aprovação da assessoria jurídica do contratante, salvo nos casos de justificada necessidade de antecipação de seus efeitos, hipótese em que a formalização do aditivo deverá ocorrer no prazo máximo de 1 (um) mês (art. 132). Registros que não caracterizam alteração do contrato podem ser realizados por simples apostila (art. 136).");

      o.sec("Da publicação");
      o.it("Incumbirá ao contratante divulgar o presente instrumento no Portal Nacional de Contratações Públicas (PNCP), na forma do art. 94 da Lei 14.133/2021, bem como em seu sítio oficial na internet (art. 91, caput).");

      o.sec("Do foro (art. 92, §1º)");
      o.it("Fica eleito o foro da sede da Administração, " + valLinha(e.foro, "foro da sede da Administração (art. 92, §1º)") + ", para dirimir os litígios que decorrerem da execução deste contrato que não puderem ser compostos pela conciliação (art. 92, §1º).");
    });
    return h + par(valLinha(((ctx && ctx.orgao) || {}).nome, "nome do órgão") + ", " + (ctx && ctx.hoje ? dataBR(ctx.hoje) : pre("data"))) + assinatura("Contratante") + assinatura("Contratada") + par("Testemunhas:") + assinatura("1.") + assinatura("2.");
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

  /* ================================================================== *
   * CAMPOS DO MODELO DO ÓRGÃO: os {{campo}} que um .docx do órgão pode trazer. Texto PURO (não HTML).
   * ⚠ Nenhum campo devolve valor de orçamento sigiloso: `valor_estimado` só traz o número quando o
   * sigilo já caiu (Cplpro.sigilo.campoPublico); antes disso devolve o texto do art. 24.
   * null = sem valor → quem preenche escreve «[PREENCHER: rótulo]».
   * ================================================================== */
  function txt(v) { return vazio(v) ? null : String(v); }
  function ed_(p, k) { return txt((p.edital || {})[k]); }
  function tr_(p, k) { return txt((p.tr || {})[k]); }
  var CAMPOS_MODELO = [
    { id: "orgao", rotulo: "nome do órgão", exemplo: "Prefeitura Municipal de Exemplo", v: function (p, c) { return txt(((c && c.orgao) || {}).nome); } },
    { id: "secretaria", rotulo: "secretaria requisitante", exemplo: "Secretaria Municipal de Obras", v: function (p) { return txt(p.secretaria); } },
    { id: "processo", rotulo: "código do processo", exemplo: "A1B2C3", v: function (p) { return txt(codigo(p)); } },
    { id: "numero_edital", rotulo: "número do edital", exemplo: "001/2027", v: function (p) { return ed_(p, "numero"); } },
    { id: "modalidade", rotulo: "modalidade", exemplo: "concorrência", v: function (p) { return txt(pv(p, "modalidade")); } },
    { id: "criterio_julgamento", rotulo: "critério de julgamento", exemplo: "menor preço", v: function (p) { return txt(pv(p, "criterio_julgamento")); } },
    { id: "regime_execucao", rotulo: "regime de execução", exemplo: "empreitada por preço global", v: function (p) { return txt(pv(p, "regime_execucao")); } },
    { id: "objeto", rotulo: "objeto", exemplo: "Construção de uma creche municipal com 6 salas", v: function (p) { return txt(p.objeto); } },
    { id: "data_publicacao", rotulo: "data de publicação do edital", exemplo: "01/12/2026", v: function (p) { return txt(dataBR(p.dataPrevistaEdital)); } },
    { id: "data_abertura", rotulo: "data de abertura das propostas", exemplo: "20/01/2027", v: function (p, c) { return txt(dataBR(((c && c.prazo) || {}).dataAbertura)); } },
    { id: "hora_sessao", rotulo: "hora da sessão pública", exemplo: "09:00", v: function (p) { return ed_(p, "sessaoHora"); } },
    { id: "portal", rotulo: "portal da licitação", exemplo: "www.portal-exemplo.gov.br", v: function (p) { return ed_(p, "portal"); } },
    { id: "valor_estimado", rotulo: "valor estimado", exemplo: "R$ 1.234,56 (ou o texto do sigilo do art. 24)", v: function (p, c) { return !publico(p, "valorEstimado") ? TEXTO_SIGILO : (c && c.orc ? txt(brl(c.orc.total)) : null); } },
    { id: "vigencia", rotulo: "prazo de vigência e de execução", exemplo: "12 meses", v: function (p) { return ed_(p, "vigencia"); } },
    { id: "local_obra", rotulo: "endereço do local da obra", exemplo: "Rua Exemplo, 100", v: function (p) { return tr_(p, "local"); } },
    { id: "inicio_execucao", rotulo: "início da execução", exemplo: "10 dias da ordem de serviço", v: function (p) { return tr_(p, "inicioExecucao"); } },
    { id: "garantia_contrato", rotulo: "garantia do contrato", exemplo: "Garantia de 5% do valor do contrato", v: function (p) { return descParam(p, "garantia_contrato"); } },
    { id: "reajuste", rotulo: "reajuste", exemplo: "Índice: INCC-DI; data-base: 01/10/2026", v: function (p) { return descParam(p, "reajuste"); } },
    { id: "prazo_recurso", rotulo: "prazo de recurso", exemplo: "3 dias úteis", v: function (p) { return descParam(p, "recurso_prazo"); } },
    { id: "dotacao", rotulo: "dotação orçamentária", exemplo: "12.361.0001", v: function (p) { return tr_(p, "dotacao"); } },
    { id: "representante", rotulo: "representante do contratante", exemplo: "Maria Souza, Prefeita, Portaria 10/2026", v: function (p) { return ed_(p, "representante"); } },
    { id: "setor_licitacoes", rotulo: "setor responsável pelas licitações", exemplo: "Comissão Permanente de Licitação", v: function (p) { return ed_(p, "setorLicitacoes"); } },
    { id: "endereco_orgao", rotulo: "endereço do órgão", exemplo: "Praça da Matriz, 1", v: function (p) { return ed_(p, "enderecoOrgao"); } },
    { id: "email_impugnacao", rotulo: "e-mail para impugnações", exemplo: "licitacao@exemplo.com.br", v: function (p) { return ed_(p, "emailImpugnacao"); } },
    { id: "foro", rotulo: "foro da sede da Administração", exemplo: "Foro da Comarca de Exemplo", v: function (p) { return ed_(p, "foro"); } },
    { id: "data_hoje", rotulo: "data de hoje", exemplo: "10/11/2026", v: function (p, c) { return txt(dataBR(c && c.hoje)); } }
  ];
  function valoresModelo(p, ctx) {
    var out = {};
    CAMPOS_MODELO.forEach(function (c) { var v = null; try { v = c.v(p || {}, ctx || {}); } catch (e) { v = null; } out[c.id] = vazio(v) ? null : String(v); });
    return out;
  }

  function contarPre(html) { var m = String(html).match(/\[PREENCHER:/g); return m ? m.length : 0; }

  /* ================================================================== *
   * HABILITAÇÃO DOS LICITANTES (leva E1) — documentos de resposta, no mesmo padrão (timbrado, «[PREENCHER]»).
   * Os dados vêm de p.habilitacao (js/cplprohab.js). REGRAS:
   *  - o texto de CONCLUSÃO, de decisão e de recurso é do SERVIDOR; aqui só se organiza o que ele decidiu. Sem decisão,
   *    a linha sai «[PREENCHER: …]» em vermelho — o documento não afirma o que ninguém decidiu;
   *  - prazo de diligência: o que a pessoa escolheu, nunca um padrão escondido;
   *  - arquivo e página de cada prova vêm do serviço; o trecho já vem mascarado (CPF, RG, e-mail, telefone);
   *  - nome de licitante no CORPO é razão social + CNPJ do processo; no NOME do arquivo é só «Licitante n» (LGPD).
   * ================================================================== */
  var HAB_DOCS = {
    relatorio: { nome: "Relatório de habilitação do licitante", arquivo: "Relatorio de habilitacao" },
    diligencia: { nome: "Termo de diligência (habilitação)", arquivo: "Termo de diligencia da habilitacao" },
    inabilitacao: { nome: "Comunicado de inabilitação", arquivo: "Comunicado de inabilitacao" },
    ata: { nome: "Ata de julgamento e habilitação", arquivo: "Ata de julgamento e habilitacao" },
    recurso: { nome: "Quadro do recurso (alegação × documento × resposta)", arquivo: "Quadro do recurso" },
    adjudicacao: { nome: "Minuta de adjudicação", arquivo: "Minuta de adjudicacao" },
    homologacao: { nome: "Minuta de homologação", arquivo: "Minuta de homologacao" }
  };
  function habH() {
    var H = global.CplproHab;
    if (!H && typeof require === "function" && typeof module !== "undefined") { try { H = require("./cplprohab.js"); } catch (e) { H = null; } }
    return H;
  }
  function habProvas(r) {
    var pv2 = arr(r && r.provas);
    if (!pv2.length) return "—";
    return pv2.map(function (x) { return esc(x.arquivo || "(sem nome)") + (x.pagina ? ", p. " + esc(x.pagina) : "") + (x.trecho ? ": «" + esc(x.trecho) + "»" : ""); }).join("<br>");
  }
  function habProva1(r) {
    var x = arr(r && r.provas).filter(function (z) { return z.arquivo && z.pagina; })[0];
    return x ? esc(x.arquivo) + ", p. " + esc(x.pagina) : null;
  }
  function habQuemQuando(d) { return d ? esc(d.por || "—") + " em " + esc(dataBR(d.em)) : ""; }
  function habCelDecisao(d, H) {
    if (!d) return pre("decisão do agente de contratação");
    return "<b>" + esc(H.DECISOES[d.situacao] ? H.DECISOES[d.situacao].curto : d.situacao) + "</b> (" + (d.origem === "confirmado" ? "resultado do serviço confirmado" : "resultado do serviço ALTERADO") + " por " + habQuemQuando(d) + ")" + (d.motivo ? "<br>Motivo: " + nl2br(d.motivo) : "");
  }
  function habCab(p, ctx, lic, titulo, tarja) {
    var h = cab(p, ctx, titulo, tarja);
    if (lic) h += par("Licitante: <b>" + valLinha(lic.razaoSocial, "razão social do licitante") + "</b> — CNPJ " + esc(habH().mascaraCnpj(lic.cnpj)) + ".");
    return h;
  }
  function habExig(lic, id) { return arr(lic.exigencias).filter(function (e) { return e.id === id; })[0] || { id: id, descricao: id, grupo: "" }; }

  function habilitacaoDoc(tipo, p, licId, ctx) {
    var H = habH(), def = HAB_DOCS[tipo];
    if (!H || !def) throw new Error("Documento de habilitação desconhecido: " + tipo);
    var lic = licId ? H.licPorId(p, licId) : null, c = lic ? H.consolidar(lic) : null, h;
    if (!lic && tipo !== "ata" && tipo !== "adjudicacao" && tipo !== "homologacao") throw new Error("Escolha o licitante.");
    if (tipo === "relatorio") {
      h = habCab(p, ctx, lic, def.nome, "Documento do processo — serve de fundamento da decisão e de defesa em recurso.");
      h += par("Data da sessão: " + valLinha(dataBR(lic.dataSessao), "data da sessão") + " (é nela que a validade das certidões é conferida). Análise do serviço em " + esc(dataBR(arr(lic.analises).length ? lic.analises[lic.analises.length - 1].em : "")) + ".");
      h += par("O sistema leu os documentos enviados e <b>apenas preparou a análise, com a prova</b> (arquivo, página e trecho). A decisão sobre cada exigência é do agente de contratação ou da comissão. A mesma regra foi aplicada a todos os licitantes (tratamento isonômico).");
      var ll = lic.licitanteLido || {};
      h += par("CNPJ lido nos documentos: " + esc(ll.cnpjLido ? H.mascaraCnpj(ll.cnpjLido) : "nenhum") + " — " + (ll.confere === true ? "confere com o do licitante" : (ll.confere === false ? "<b>NÃO confere</b> com o do licitante" : "não foi possível conferir")) + ".");
      if (ll.sancoes) h += par("Sanções (CEIS/CNEP): " + esc(ll.sancoes.situacao || "—") + (ll.sancoes.texto ? " — " + esc(ll.sancoes.texto) : "") + (ll.sancoes.baseAtualizadaEm ? " (base de " + esc(dataBR(ll.sancoes.baseAtualizadaEm)) + ")" : "") + ".");
      h += tabela(["Exigência", "Grupo", "Resultado do serviço", "Regra aplicada", "Prova (arquivo, página, trecho)", "Decisão do servidor"], arr(lic.resultados).map(function (r) {
        var e = habExig(lic, r.id);
        return [esc(r.id) + " — " + esc(e.descricao), esc(H.nomeGrupo(e.grupo)), "<b>" + esc(H.SITUACOES[r.situacao] ? H.SITUACOES[r.situacao].nome : r.situacao) + "</b><br>" + nl2br(r.motivo || ""), esc(r.regra || "—"), habProvas(r), habCelDecisao(lic.decisoes[r.id], H)];
      }));
      h += par("Situação do licitante: <b>" + esc(H.STATUS_ROTULO[c.status]) + "</b>" + (c.pendentes.length ? " — " + pre("decisão sobre " + c.pendentes.length + " exigência(s) pendente(s)") : "") + ".");
      if (arr(lic.avisos).length) h += secao(null, "Avisos do serviço", lista(lic.avisos.map(esc)));
      return h + assinatura("Agente de contratação / comissão");
    }
    if (tipo === "diligencia") {
      if (!c.diligencia.length) throw new Error("Nenhuma exigência está em diligência.");
      h = habCab(p, ctx, lic, def.nome, null);
      h += par("Ao licitante. A documentação de habilitação foi analisada e há pontos a esclarecer ou a atualizar, nos termos do art. 64 da Lei 14.133/2021 (diligência para complementar informações sobre documentos já apresentados ou atualizar documento cuja validade expirou).");
      h += par("Prazo para resposta: " + valLinha(dataBR(lic.diligencia && lic.diligencia.prazo), "prazo para resposta do licitante") + ".");
      h += tabela(["Exigência", "Motivo da diligência", "Regra aplicada", "Documento / página"], c.diligencia.map(function (id) {
        var r = arr(lic.resultados).filter(function (x) { return x.id === id; })[0] || {}, e = habExig(lic, id), d = lic.decisoes[id];
        return [esc(id) + " — " + esc(e.descricao), nl2br((d && d.motivo) || r.motivo || ""), esc(r.regra || "—"), habProva1(r) || "—"];
      }));
      h += par("A resposta deve ser enviada pelo sistema no prazo acima. Não será aceita a substituição ou a apresentação de documento que deveria ter constado originariamente da proposta ou da habilitação.");
      return h + assinatura("Agente de contratação / comissão");
    }
    if (tipo === "inabilitacao") {
      if (!c.inabilita.length) throw new Error("Nenhuma exigência foi decidida como inabilitante.");
      h = habCab(p, ctx, lic, def.nome, null);
      h += par("Comunicamos a <b>inabilitação</b> do licitante, pelo(s) motivo(s) abaixo, com o respectivo fundamento. Cabe recurso no prazo de " + parOuPre(p, "recurso_prazo", "prazo de recurso") + " (Lei 14.133/2021, art. 165).");
      h += tabela(["Exigência", "Item do edital", "Fundamento", "Motivo", "Arquivo / página"], c.inabilita.map(function (id) {
        var r = arr(lic.resultados).filter(function (x) { return x.id === id; })[0] || {}, e = habExig(lic, id), d = lic.decisoes[id];
        return [esc(id) + " — " + esc(e.descricao), pre("número do item do edital"), esc(r.regra || "—"), "<b>" + esc(H.DECISOES[d.situacao].curto) + "</b>: " + nl2br(d.motivo || r.motivo || ""), habProva1(r) || "—"];
      }));
      h += par("Decisão tomada por " + esc(lic.decisoes[c.inabilita[0]].por || "—") + " (" + esc(lic.decisoes[c.inabilita[0]].papel || "") + ") em " + esc(dataBR(lic.decisoes[c.inabilita[0]].em)) + ".");
      return h + assinatura("Agente de contratação / comissão");
    }
    if (tipo === "ata") {
      var ls = arr(p.habilitacao && p.habilitacao.licitantes);
      h = cab(p, ctx, def.nome, null);
      h += par("Objeto: " + val(p.objeto, "objeto da licitação") + ".");
      h += par("Sessão de " + valLinha(dataBR(H.dataSessaoDoProcesso(p) || (ls[0] && ls[0].dataSessao)), "data da sessão") + ", " + pre("hora e local da sessão") + ". Presentes: " + pre("agente de contratação e membros da comissão") + ".");
      h += par("Examinados os documentos de habilitação dos licitantes abaixo, com apoio do relatório de cada um (arquivo, página e trecho de cada prova) e aplicando a mesma regra a todos:" + CONFERIR);
      h += tabela(["Nº", "Licitante", "CNPJ", "Resultado", "Exigências inabilitantes"], ls.map(function (l, i) {
        var cc = H.consolidar(l);
        return [esc(i + 1), valLinha(l.razaoSocial, "razão social"), esc(H.mascaraCnpj(l.cnpj)), "<b>" + esc(H.STATUS_ROTULO[cc.status]) + "</b>" + (cc.pendentes.length ? "<br>" + pre("decisão de " + cc.pendentes.length + " exigência(s)") : ""),
          cc.inabilita.length ? cc.inabilita.map(function (id) { var d = l.decisoes[id]; return esc(id) + ": " + esc(d.motivo || (arr(l.resultados).filter(function (x) { return x.id === id; })[0] || {}).motivo || ""); }).join("<br>") : "—"];
      }));
      ls.forEach(function (l, i) {
        var cc = H.consolidar(l);
        if (cc.diligencia.length) h += par("Licitante " + (i + 1) + ": diligência aberta nos itens " + esc(cc.diligencia.join(", ")) + (l.diligencia ? " com prazo até " + esc(dataBR(l.diligencia.prazo)) : " — " + pre("prazo da diligência")) + ".");
      });
      h += par("Fica aberto o prazo de " + parOuPre(p, "recurso_prazo", "prazo de recurso") + " para a intenção de recorrer, nos termos do art. 165 da Lei 14.133/2021.");
      return h + assinatura("Agente de contratação / comissão") + assinatura("Demais membros da comissão");
    }
    if (tipo === "recurso") {
      var rc = lic.recurso || { itens: [], conclusao: null, intencaoEm: null }, pz = H.prazosRecurso(p);
      h = habCab(p, ctx, lic, def.nome, "Documento INTERNO — organiza os fatos; a conclusão é do servidor.");
      h += par("Resultado divulgado em: " + valLinha(dataBR(p.resultadoEm), "data do resultado (aba Propostas)") + ". Intenção de recorrer manifestada em: " + valLinha(dataBR(rc.intencaoEm), "data da intenção de recurso") + ".");
      h += par("Prazos do art. 165 (dias úteis, contados pelo sistema): razões até " + (pz && pz.razoesAte ? "<b>" + esc(dataBR(pz.razoesAte)) + "</b>" : pre("data do resultado")) + " · contrarrazões até " + (pz && pz.contrarrazoesAte ? "<b>" + esc(dataBR(pz.contrarrazoesAte)) + "</b>" : pre("data do resultado")) + ".");
      h += arr(rc.itens).length ? tabela(["Alegação", "Documento", "Resposta"], rc.itens.map(function (it) {
        var r = it.exigenciaId ? arr(lic.resultados).filter(function (x) { return x.id === it.exigenciaId; })[0] : null;
        var doc = it.documento ? esc(it.documento) : (r ? habProvas(r) : "—");
        return [nl2br(it.alegacao) + (it.exigenciaId ? "<br><i>Exigência " + esc(it.exigenciaId) + "</i>" : ""), doc, it.resposta ? nl2br(it.resposta) : pre("resposta do servidor à alegação")];
      })) : par(pre("alegações do recurso"));
      h += secao(null, "Conclusão", par(rc.conclusao ? nl2br(rc.conclusao) : pre("conclusão do agente de contratação / autoridade (texto do servidor)")));
      return h + assinatura("Agente de contratação / comissão");
    }
    /* adjudicação e homologação: só sem item pendente (a decisão de liberar é de H.podeGerar; aqui só se recusa de novo) */
    var adj = H.licPorId(p, p.habilitacao && p.habilitacao.adjudicatarioId);
    if (!adj || H.pendenciasGerais(p, adj.id).length) throw new Error("A minuta só sai com o licitante a adjudicar escolhido e sem nenhuma exigência pendente ou em diligência.");
    h = cab(p, ctx, def.nome, null);
    h += par("Objeto: " + val(p.objeto, "objeto da licitação") + ".");
    if (tipo === "adjudicacao") {
      h += par("Encerradas as fases de julgamento e de habilitação e exauridos os recursos administrativos, <b>adjudico</b> o objeto da licitação ao licitante <b>" + valLinha(adj.razaoSocial, "razão social do adjudicatário") + "</b>, CNPJ " + esc(H.mascaraCnpj(adj.cnpj)) + ", pelo valor de " + pre("valor da proposta vencedora") + ", nos termos do art. 71, IV, da Lei 14.133/2021." + CONFERIR);
    } else {
      h += par("Verificada a regularidade dos atos do processo licitatório, <b>homologo</b> a licitação, adjudicada ao licitante <b>" + valLinha(adj.razaoSocial, "razão social do adjudicatário") + "</b>, CNPJ " + esc(H.mascaraCnpj(adj.cnpj)) + ", nos termos do art. 71, IV, da Lei 14.133/2021." + CONFERIR);
      h += par("Data da adjudicação: " + pre("data da adjudicação") + ".");
    }
    return h + assinatura("Autoridade competente");
  }

  var CplproDocs = {
    DOCS: DOCS.map(function (d) { return { id: d.id, nome: d.nome, publico: d.publico }; }),
    TEXTO_SIGILO: TEXTO_SIGILO,
    CAMPOS: CAMPOS.map(function (c) { return { id: c.id, onde: c.onde, grupo: c.grupo, rotulo: c.rotulo, dica: c.dica || "", tipo: c.tipo || "texto", opcoes: c.opcoes || null }; }),
    campoAplica: function (id, p) { var r = true; CAMPOS.forEach(function (c) { if (c.id === id) r = campoAplica(c, p); }); return r; },
    CAMPOS_MODELO: CAMPOS_MODELO.map(function (c) { return { id: c.id, rotulo: c.rotulo, exemplo: c.exemplo }; }),
    valoresModelo: valoresModelo,
    contarPre: contarPre,
    nomeArquivo: function (doc, p) { return doc.arquivo + " - " + codigo(p); },
    /* habilitação (leva E1) */
    HAB_DOCS: HAB_DOCS,
    gerarHabilitacao: habilitacaoDoc,
    /* ⚠ LGPD: o nome do arquivo leva «Licitante n», nunca CNPJ, razão social (de MEI pode ter o CPF) ou CPF/RG */
    nomeArquivoHab: function (tipo, p, licId) { var H = habH(), d = HAB_DOCS[tipo]; return d.arquivo + (licId && H ? " - " + H.nomeLicitante(p, licId) : "") + " - " + codigo(p); },

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
