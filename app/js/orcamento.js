/* =====================================================================
 * orcamento.js — Modelo de domínio do Orçamento
 * Estrutura: Orçamento -> Etapas -> Itens (SINAPI ou próprios)
 * Calcula custo direto, BDI e preço de venda; gera analítico e sintético.
 * Lógica pura: não toca no DOM (a UI consome estes resultados).
 * ===================================================================== */
(function (global) {
  "use strict";

  /* Motor de arredondamento (js/arredondamento.js), resolvido SOB DEMANDA.
   * Assim o orçamento nunca quebra se o script não estiver carregado: em Node
   * (testes/ferramentas) ele é carregado por require; num navegador com cache
   * antigo cai num fallback mínimo no padrão do TCU (truncar 2 casas + BDI no
   * unitário), que é justamente o default do produto. */
  var _arredFB = null;
  function A() {
    var M = global.Arred;
    if (M) return M;
    if (typeof require === "function") {
      try { M = require("./arredondamento.js"); if (M) { global.Arred = M; return M; } } catch (e) {}
    }
    if (!_arredFB) {
      var tr = function (v) { var n = Number(v); if (!isFinite(n)) return 0; var s = n < 0 ? -1 : 1; return s * (Math.floor(Math.abs(n) * 100 + 1e-9) / 100); };
      _arredFB = {
        PADRAO: "truncar2", INCIDENCIA_PADRAO: "unitario",
        normalizar: function () { return "truncar2"; },
        normalizarIncidencia: function (i) { return i === "final" ? "final" : "unitario"; },
        valor: tr, unitario: tr, auxiliar: tr,
        puComBdi: function (cu, pct, m, inc) { return inc === "final" ? tr(cu) : tr(Number(cu || 0) * (1 + Number(pct || 0) / 100)); },
        totalItem: function (q, cu, pct, m, inc) { return tr(Number(q || 0) * this.puComBdi(cu, pct, m, inc)); },
        custoItem: function (q, cu) { return tr(Number(q || 0) * tr(cu)); }
      };
      try { console.warn("[OrçaPRO] arredondamento.js ausente — usando padrão do TCU embutido."); } catch (e) {}
    }
    return _arredFB;
  }

  var Orcamento = {

    /* Cria um orçamento novo, já com schema atual. */
    novo: function (dados) {
      dados = dados || {};
      var bdiParams = Bdi.paramsDoModelo("padrao");
      return {
        id: Util.uid("orc"),
        schemaVersao: CONFIG.schemaVersao,
        numero: dados.numero || ("ORC-" + new Date().getFullYear() + "-" + Math.floor(Math.random() * 9000 + 1000)),
        nome: dados.nome || "Novo Orçamento",
        cliente: { nome: dados.cliente || "", doc: "", contato: "" },
        obra: { nome: dados.obra || "", local: "", regime: "Empreitada" },
        competenciaSinapi: Sinapi.competencia || CONFIG.sinapi.competenciaPadrao,
        uf: Sinapi.uf || CONFIG.sinapi.ufPadrao,
        desonerado: false,
        bdi: { modeloId: "padrao", params: bdiParams, percentual: Bdi.calcular(bdiParams) },
        config: this.configPadrao(dados),
        comercial: this.comercialPadrao(),
        cronogramaMeses: 6,
        etapas: [],
        criadoEm: Util.agoraISO(),
        atualizadoEm: Util.agoraISO()
      };
    },

    /* Categorias de obra (tipologias usuais de obra pública/privada) — usadas
     * no Passo 1 do assistente para classificar o orçamento. */
    CATEGORIAS_OBRA: [
      "Calçadas e meio-fio",
      "Construção e ampliação de rede de abastecimento de água",
      "Creches e escolas — Construção", "Creches e escolas — Reforma",
      "Drenagem e esgotamento sanitário",
      "Edificação residencial", "Edificação comercial",
      "Espaços públicos e praças — Construção", "Espaços públicos e praças — Reforma",
      "Galpões",
      "Hospitais e unidades de saúde — Construção", "Hospitais e unidades de saúde — Reforma",
      "Infraestruturas esportivas — Construção", "Infraestruturas esportivas — Reforma",
      "Muros e contenções",
      "Passagens molhadas e pontes — Construção", "Passagens molhadas e pontes — Reforma",
      "Pavimentação asfáltica", "Pavimentação e drenagem",
      "Pavimentação em bloco de concreto intertravado", "Pavimentação em paralelepípedo",
      "Prédios públicos — Construção", "Prédios públicos — Reforma",
      "Reforma e manutenção predial",
      "Terraplenagem", "Outra"
    ],

    /* Parametrização do orçamento (Passos 1 e 2 do assistente).
     * Padrão do produto = PADRÃO DO TCU (truncar 2 casas + BDI no unitário),
     * porque é o que licitação pública exige. */
    configPadrao: function (dados) {
      dados = dados || {};
      return {
        categoria: dados.categoria || "",
        prazoEntrega: dados.prazoEntrega || "",
        arredondamento: A().PADRAO,                  // "truncar2" — Padrão do TCU
        bdiIncidencia: A().INCIDENCIA_PADRAO,        // "unitario" — TCU recomenda
        encargos: { tipo: "desonerado", horista: 0, mensalista: 0 },
        permitirZerado: false,
        licitacao: { ativo: false, tipo: "", abertura: "", processo: "" }
      };
    },

    /* Garante a config em orçamentos ANTIGOS (migração): quem não tinha
     * parametrização passa a calcular pelo padrão TCU — decisão do produto,
     * para que todo orçamento saia no critério aceito em licitação. */
    garantirConfig: function (orc) {
      if (!orc) return this.configPadrao();
      // Marca o orçamento que NASCEU sem parametrização: ele passa a calcular no
      // padrão do TCU e o total pode mudar em centavos em relação ao que já foi
      // impresso. O app avisa isso uma vez ao abrir (nada de mudar em silêncio).
      if (!orc.config || typeof orc.config !== "object") {
        orc.config = this.configPadrao();
        if (Util.arr(orc.etapas).length) orc.config.migradoTcu = true;
      }
      var pad = this.configPadrao();
      for (var k in pad) { if (orc.config[k] == null) orc.config[k] = pad[k]; }
      if (!orc.config.encargos || typeof orc.config.encargos !== "object") orc.config.encargos = { tipo: "desonerado", horista: 0, mensalista: 0 };
      if (!orc.config.licitacao || typeof orc.config.licitacao !== "object") orc.config.licitacao = { ativo: false, tipo: "", abertura: "", processo: "" };
      orc.config.arredondamento = A().normalizar(orc.config.arredondamento);
      orc.config.bdiIncidencia = A().normalizarIncidencia(orc.config.bdiIncidencia);
      // compat: o campo antigo orc.desonerado manda no tipo de encargo
      if (typeof orc.desonerado === "boolean") orc.config.encargos.tipo = orc.desonerado ? "desonerado" : "nao_desonerado";
      return orc.config;
    },

    comercialPadrao: function () {
      return {
        apresentacao: "",
        condicoesPagamento: "Pagamento por medição mensal dos serviços executados, com vencimento em 5 dias úteis após a aprovação da medição.",
        prazoExecucao: "A combinar conforme cronograma físico-financeiro.",
        validadeProposta: "15 dias corridos a contar da data de emissão.",
        garantia: "Garantia legal de 5 (cinco) anos para a solidez e segurança da obra, nos termos do art. 618 do Código Civil.",
        incluso: "Fornecimento de materiais e mão de obra dos serviços orçados;\nLeis sociais e encargos trabalhistas;\nFerramentas e equipamentos de execução;\nLimpeza periódica e final da obra.",
        excluso: "Projetos complementares e taxas de aprovação;\nLigações definitivas de água, energia e esgoto;\nMobiliário, paisagismo e itens de decoração;\nServiços não descritos expressamente nesta proposta."
      };
    },

    garantirComercial: function (orc) {
      if (!orc.comercial || typeof orc.comercial !== "object") orc.comercial = this.comercialPadrao();
      var pad = this.comercialPadrao();
      for (var k in pad) { if (orc.comercial[k] == null) orc.comercial[k] = pad[k]; }
      return orc.comercial;
    },

    // ---- Etapas ----
    addEtapa: function (orc, nome) {
      orc.etapas.push({ id: Util.uid("eta"), codigo: "", nome: nome || "Nova Etapa", itens: [] });
      this._renumerarEtapas(orc);
      return orc;
    },
    // Códigos SEQUENCIAIS por POSIÇÃO (1.0, 2.0, 3.0…) — assim reordenar já renumera e os
    // itens viram 2.1, 2.2… coerentes com a ordem. Só display; os vínculos usam o id.
    _renumerarEtapas: function (orc) {
      Util.arr(orc && orc.etapas).forEach(function (e, i) { e.codigo = String(i + 1) + ".0"; });
      return orc;
    },
    // Número hierárquico do item (derivado da posição): etapa 2, 3º item → "2.3".
    itemNumero: function (etapaIdx, itemIdx) { return (etapaIdx + 1) + "." + (itemIdx + 1); },
    removerEtapa: function (orc, etapaId) {
      orc.etapas = Util.arr(orc.etapas).filter(function (e) { return e.id !== etapaId; });
      this._renumerarEtapas(orc);
      return orc;
    },
    // Sobe (dir<0) ou desce (dir>0) uma ETAPA, trocando com a vizinha, e renumera.
    moverEtapa: function (orc, etapaId, dir) {
      var arr = Util.arr(orc && orc.etapas), i = -1;
      for (var k = 0; k < arr.length; k++) { if (arr[k].id === etapaId) { i = k; break; } }
      if (i < 0) return orc;
      var j = i + (dir < 0 ? -1 : 1);
      if (j < 0 || j >= arr.length) return orc; // já no topo/fundo
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      this._renumerarEtapas(orc);
      return orc;
    },
    // Sobe/desce um ITEM dentro da própria etapa (o número 2.x segue a posição).
    moverItem: function (orc, etapaId, itemId, dir) {
      var e = this._etapa(orc, etapaId); if (!e) return orc;
      var arr = Util.arr(e.itens), i = -1;
      for (var k = 0; k < arr.length; k++) { if (arr[k].id === itemId) { i = k; break; } }
      if (i < 0) return orc;
      var j = i + (dir < 0 ? -1 : 1);
      if (j < 0 || j >= arr.length) return orc;
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      return orc;
    },
    // Renomeia uma etapa sem recriá-la (mantém itens e código).
    renomearEtapa: function (orc, etapaId, nome) {
      var e = this._etapa(orc, etapaId);
      if (e && Util.naoVazio(nome)) e.nome = String(nome).trim();
      return orc;
    },

    // Repara mojibake de encoding (acentos/ç) em todo o texto do orçamento.
    // Idempotente: texto já correto não muda. Retorna nº de campos corrigidos.
    repararTexto: function (orc) {
      if (!orc) return 0;
      var n = 0;
      function fix(o, k) { if (o && typeof o[k] === "string") { var f = Util.fixEnc(o[k]); if (f !== o[k]) { o[k] = f; n++; } } }
      fix(orc, "nome");
      if (orc.cliente) fix(orc.cliente, "nome");
      if (orc.obra) { fix(orc.obra, "nome"); fix(orc.obra, "local"); }
      Util.arr(orc.etapas).forEach(function (e) {
        fix(e, "nome");
        Util.arr(e.itens).forEach(function (it) { fix(it, "descricao"); fix(it, "unidade"); });
      });
      return n;
    },

    // FASE 1.2 — Fonte HONESTA: "SINAPI" só p/ código numérico vindo/confirmado
    // na base SINAPI; código de outra base leva o nome dela (SEINFRA, SUDECAP...);
    // código desconhecido -> "OUTRA". Nunca rotular SINAPI no chute.
    _codigoSinapi: function (codigo) { return /^\d{1,7}$/.test(String(codigo == null ? "" : codigo).trim()); }, // há 33 códigos SINAPI reais de 1-2 dígitos (ex.: 34 = AÇO CA-50)
    _existeNaSinapi: function (codigo) {
      try {
        if (typeof Sinapi !== "undefined" && Sinapi.carregado && Sinapi.obter && Sinapi.obter(codigo)) return true;
        if (typeof Analitico !== "undefined" && Analitico.carregado && Analitico.tem && Analitico.tem(codigo)) return true;
      } catch (e) { }
      return false;
    },
    _origemDe: function (codigo, baseFonte) {
      if (!codigo) return "PROPRIO";
      if (baseFonte && baseFonte !== "SINAPI") return baseFonte; // veio de outra base: badge real
      if (this._codigoSinapi(codigo) && (baseFonte === "SINAPI" || this._existeNaSinapi(codigo))) return "SINAPI";
      return "OUTRA";
    },
    // Conserta a Fonte de orçamentos JÁ salvos (ex.: C1052/02.10.01 rotulados "SINAPI").
    // Conservador: código numérico só é rebaixado com a base carregada e ausente dela.
    // Idempotente. Retorna nº de itens reclassificados.
    repararFontes: function (orc) {
      if (!orc) return 0;
      var self = this, n = 0;
      var baseOk = (typeof Sinapi !== "undefined" && Sinapi.carregado) || (typeof Analitico !== "undefined" && Analitico.carregado);
      Util.arr(orc.etapas).forEach(function (e) {
        Util.arr(e.itens).forEach(function (it) {
          if (it.origem !== "SINAPI") return;
          var fonteReal = (it.baseFonte && it.baseFonte !== "SINAPI") ? it.baseFonte : null;
          if (!self._codigoSinapi(it.codigo)) {              // não-numérico: nunca é SINAPI
            it.origem = fonteReal || "OUTRA"; if (!fonteReal) it.baseFonte = "OUTRA"; n++;
          } else if (fonteReal) {                             // rotulado SINAPI mas a fonte real é outra
            it.origem = fonteReal; n++;
          }
          // numérico sem fonte real: NUNCA rebaixar — as bases variam por UF/competência
          // (1.094 códigos de MG não existem em AC) e o fallback pode ser a AMOSTRA de 30
          // itens; rebaixar aqui destruiria itens legítimos de forma irreversível.
        });
      });
      return n;
    },

    // FONTE HONESTA no NÍVEL DO DOCUMENTO: as bases de preço REALMENTE usadas no
    // orçamento (a partir da origem de cada item) — nunca atribuir tudo à SINAPI.
    // Ex.: itens da GOINFRA -> declara AGETOP-GO; mistos -> lista todas.
    basesUsadas: function (orc) {
      if (!orc) return [];
      var cont = {};
      Util.arr(orc.etapas).forEach(function (e) {
        Util.arr(e.itens).forEach(function (it) {
          var f = String(it.origem || it.baseFonte || "").toUpperCase();
          if (!f || f === "PROPRIA") f = "PROPRIO";
          cont[f] = (cont[f] || 0) + 1;
        });
      });
      var META = (typeof Bases !== "undefined" && Bases.META) || {};
      var out = Object.keys(cont).map(function (f) {
        var label = (f === "PROPRIO") ? "Composição própria" : (f === "OUTRA" ? "Outra base" : ((META[f] && META[f].label) || f));
        var texto = label;
        if (f === "SINAPI") texto = "SINAPI " + (orc.competenciaSinapi || "") + (orc.uf ? "/" + orc.uf : "");
        return { fonte: f, label: label, texto: texto, n: cont[f] };
      });
      out.sort(function (a, b) {
        if (a.fonte === "SINAPI") return -1; if (b.fonte === "SINAPI") return 1;
        if (a.fonte === "PROPRIO") return 1; if (b.fonte === "PROPRIO") return -1;
        return String(a.label).localeCompare(String(b.label));
      });
      return out;
    },
    // Texto das bases p/ cabeçalhos/documentos: "SINAPI 05/2026/MG · AGETOP-GO".
    // Sem itens (orçamento vazio) cai no rótulo SINAPI padrão só p/ não quebrar.
    basesUsadasTexto: function (orc, sep) {
      var l = this.basesUsadas(orc);
      if (!l.length) return "SINAPI " + ((orc && orc.competenciaSinapi) || "—") + "/" + ((orc && orc.uf) || "—");
      return l.map(function (x) { return x.texto; }).join(sep || " · ");
    },

    // FASE 1.4 — Prazo ÚNICO: o nº de meses do cronograma financeiro deriva do
    // agente (Cronograma.estimar -> totalDias -> meses cheios) enquanto o usuário
    // não travar manualmente (orc.cronogramaMesesManual). Fim do xlsx que dizia
    // "15 dias úteis" no Gantt e distribuía 6 meses no Cronograma.
    mesesSugeridos: function (orc) {
      if (typeof Cronograma === "undefined" || !Cronograma.estimar) return 0;
      try {
        var est = Cronograma.estimar(orc);
        if (!est || !est.totalDias) return 0;
        var duSem = (est.params && est.params.diasUteisSemana) || 5;
        return Math.max(1, Math.ceil(est.totalDias / (duSem * 4.345))); // dias úteis/mês
      } catch (e) { return 0; }
    },
    sincronizarPrazo: function (orc) {
      if (!orc) return false;
      // migração: orçamento antigo (sem flag) onde o usuário JÁ escolheu prazo ≠ default(6)
      // é tratado como travado — não destruir escolha histórica. O default 6 sincroniza.
      if (orc.cronogramaMesesManual == null && orc.cronogramaMeses && orc.cronogramaMeses !== 6) { orc.cronogramaMesesManual = true; return false; }
      if (orc.cronogramaMesesManual) return false;
      var m = this.mesesSugeridos(orc);
      if (m > 0 && m !== orc.cronogramaMeses) { orc.cronogramaMeses = m; return true; }
      return false;
    },

    // ---- Itens ----
    // origem: item SINAPI (do motor) OU objeto próprio { descricao, unidade, custoUnitario }
    addItem: function (orc, etapaId, sinapiItem, quantidade) {
      var etapa = this._etapa(orc, etapaId);
      if (!etapa) return orc;
      var origem = this._origemDe(sinapiItem.codigo, sinapiItem.baseFonte || null);
      var it = {
        id: Util.uid("itm"),
        origem: origem,
        baseFonte: sinapiItem.baseFonte || (origem === "PROPRIO" ? null : origem),
        codigo: sinapiItem.codigo || "—",
        descricao: Util.fixEnc(sinapiItem.descricao || "Item próprio"),
        unidade: Util.fixEnc(sinapiItem.unidade || "un"),
        quantidade: Util.num(quantidade) || 1,
        custoUnitario: Util.num(sinapiItem.custoUnitario),
        custoMO: Util.num(sinapiItem.custoMO),
        custoMAT: Util.num(sinapiItem.custoMAT),
        custoEQ: Util.num(sinapiItem.custoEQ)
      };
      etapa.itens.push(it);
      return orc;
    },
    atualizarItem: function (orc, etapaId, itemId, campos) {
      var etapa = this._etapa(orc, etapaId);
      if (!etapa) return orc;
      var it = etapa.itens.filter(function (x) { return x.id === itemId; })[0];
      if (!it) return orc;
      // LOTE 2: quantidade ≤ 0 vira item fantasma silencioso — rejeita e mantém o valor
      if (campos.quantidade != null) {
        var q = Util.num(campos.quantidade);
        if (q > 0) it.quantidade = q;
        else { try { if (global.UI && global.UI.toast) global.UI.toast("Quantidade deve ser maior que zero — valor anterior mantido.", "erro"); } catch (e) {} }
      }
      if (campos.custoUnitario != null) it.custoUnitario = Util.num(campos.custoUnitario);
      if (campos.descricao != null) it.descricao = campos.descricao;
      return orc;
    },
    removerItem: function (orc, etapaId, itemId) {
      var etapa = this._etapa(orc, etapaId);
      if (etapa) etapa.itens = etapa.itens.filter(function (x) { return x.id !== itemId; });
      return orc;
    },
    _etapa: function (orc, etapaId) {
      return Util.arr(orc.etapas).filter(function (e) { return e.id === etapaId; })[0] || null;
    },

    // ---- BDI ----
    aplicarBdi: function (orc, modeloId, paramsCustom) {
      var params = paramsCustom || Bdi.paramsDoModelo(modeloId || "padrao");
      orc.bdi = { modeloId: modeloId || "custom", params: params, percentual: Bdi.calcular(params) };
      return orc;
    },

    // ---- Cálculos / Totais ----
    custoItem: function (it) { return Util.num(it.quantidade) * Util.num(it.custoUnitario); },

    /* =================================================================
     * FONTE ÚNICA DE VALORES.
     *
     * TODA visão do orçamento (planilha da tela, sintético, analítico, CSV,
     * curva ABC, cronograma, medição, relatório, laudo, proposta e Excel)
     * tem que sair daqui. Quando cada tela fazia a sua conta, dois documentos
     * do MESMO orçamento divergiam em centavos — e em licitação isso é
     * impugnação. Aqui o critério de arredondamento e a incidência do BDI são
     * aplicados UMA vez, item a item.
     *
     * Incidência do BDI:
     *   "unitario" (padrão, TCU) — o BDI entra no preço unitário de cada item;
     *                              o total é a SOMA dos itens.
     *   "final"                  — o preço unitário é de CUSTO; o BDI aparece
     *                              como uma parcela única no fim. O total é
     *                              custo direto + BDI (é o que o edital pede
     *                              quando manda "BDI sobre o preço final").
     * ================================================================= */
    calcular: function (orc) {
      var cfg = this.garantirConfig(orc);
      var modo = cfg.arredondamento, inc = cfg.bdiIncidencia, A0 = A();
      var pct = (orc && orc.bdi) ? Util.num(orc.bdi.percentual) : 0;
      var bdiNoPU = (inc !== "final");
      var linhas = [], custoDireto = 0, somaVenda = 0, mo = 0, mat = 0, eq = 0;
      Util.arr(orc && orc.etapas).forEach(function (e, ei) {
        Util.arr(e.itens).forEach(function (it, ii) {
          var q = Util.num(it.quantidade);
          var cu = A0.unitario(it.custoUnitario, modo);
          var ct = A0.valor(q * cu, modo);
          // PU faturável: com BDI embutido quando a incidência é no unitário
          var pu = bdiNoPU ? A0.unitario(Util.num(it.custoUnitario) * (1 + pct / 100), modo) : cu;
          var pt = A0.valor(q * pu, modo);
          custoDireto += ct; somaVenda += pt;
          mo += q * Util.num(it.custoMO); mat += q * Util.num(it.custoMAT); eq += q * Util.num(it.custoEQ);
          linhas.push({
            etapaIdx: ei, etapaId: e.id, etapaCodigo: e.codigo || "", etapaNome: e.nome || "",
            itemIdx: ii, numero: this.itemNumero(ei, ii), item: it, itemId: it.id,
            codigo: it.codigo || "", descricao: it.descricao || "", unidade: it.unidade || "un",
            origem: it.origem, baseFonte: it.baseFonte,
            quantidade: q, custoUnitario: cu, custoTotal: ct,
            precoUnit: pu, precoTotal: pt
          });
        }, this);
      }, this);
      custoDireto = A0.valor(custoDireto, modo);
      somaVenda = A0.valor(somaVenda, modo);
      var precoVenda = bdiNoPU ? somaVenda : A0.valor(Bdi.aplicar(custoDireto, pct), modo);
      return {
        cfg: cfg, modo: modo, incidencia: inc, bdiNoPU: bdiNoPU, pct: pct,
        linhas: linhas,
        custoDireto: custoDireto,
        somaItens: somaVenda,                       // soma das linhas faturáveis
        // venda e custo JÁ estão em centavos exatos: a diferença também é — o round
        // só limpa o ruído de float. Truncar aqui comia 1 centavo e o trio
        // custo + BDI ≠ venda não fechava (o Excel, que subtrai exato, divergia).
        bdiValor: Math.round((precoVenda - custoDireto) * 100) / 100,
        precoVenda: precoVenda,
        mo: A0.valor(mo, modo), mat: A0.valor(mat, modo), eq: A0.valor(eq, modo),
        qtdItens: linhas.length, qtdEtapas: Util.arr(orc && orc.etapas).length
      };
    },

    totais: function (orc) {
      var c = this.calcular(orc);
      return {
        custoDireto: c.custoDireto,
        mo: c.mo, mat: c.mat, eq: c.eq,
        bdiPercentual: c.pct,
        bdiValor: c.bdiValor,
        precoVenda: c.precoVenda,
        qtdItens: c.qtdItens,
        qtdEtapas: c.qtdEtapas,
        arredondamento: c.modo, bdiIncidencia: c.incidencia, bdiNoPU: c.bdiNoPU
      };
    },

    /* Linhas já calculadas (mesma conta da tela, do Excel e do laudo). */
    linhas: function (orc) { return this.calcular(orc).linhas; },

    // ---------- #18: medição vinculada ao orçamento ----------
    // Linhas mediveis: 1 por item, com preço unitário COM BDI (o que se fatura).
    itensMediveis: function (orc) {
      var c = this.calcular(orc);
      return c.linhas.map(function (L) {
        return {
          itemId: L.itemId, etapa: L.etapaNome || L.etapaCodigo || "", codigo: L.codigo,
          descricao: L.descricao, unidade: L.unidade,
          qtdContratada: L.quantidade, precoUnit: L.precoUnit, valorContratado: L.precoTotal,
          bdiNoPU: c.bdiNoPU
        };
      });
    },
    /* Consolida um boletim: % medido no período por item (mapa itemId -> %),
     * com o acumulado anterior por item p/ acusar estouro de 100%.
     *
     * Fecha ao CENTAVO com o orçamento: usa o mesmo arredondamento e, quando o
     * BDI incide sobre o preço final (o PU da planilha é de custo), fatura o
     * BDI como parcela proporcional ao medido — sem isso, medir 100% deixaria
     * o BDI inteiro para trás. */
    medirItens: function (orc, pctPorItem, pctAnteriorPorItem) {
      var c = this.calcular(orc), A0 = A(), modo = c.modo;
      var itens = [], somaItens = 0, avisos = [];
      c.linhas.forEach(function (L) {
        var p = Util.num((pctPorItem || {})[L.itemId]);
        if (p <= 0) return;
        var ant = Util.num((pctAnteriorPorItem || {})[L.itemId]);
        if (ant + p > 100.0001) avisos.push((L.codigo || L.descricao.slice(0, 20)) + " passa de 100% (" + Util.fmtNum(ant + p, 1) + "% acum.)");
        var qtdMed = L.quantidade * p / 100;
        // 100% do item fatura exatamente o valor contratado (sem sobra de centavo)
        var valor = (p >= 99.9999 && ant <= 0.0001) ? L.precoTotal : A0.valor(qtdMed * L.precoUnit, modo);
        somaItens += valor;
        itens.push({
          itemId: L.itemId, etapa: L.etapaNome, codigo: L.codigo, descricao: L.descricao, unidade: L.unidade,
          qtdContratada: L.quantidade, precoUnit: L.precoUnit,
          pctAnterior: A0.valor(ant, modo), pctPeriodo: A0.valor(p, modo),
          qtdMedida: A0.valor(qtdMed, modo), valor: valor
        });
      });
      somaItens = A0.valor(somaItens, modo);
      // BDI apartado: a planilha tem PU de custo, então o boletim fatura o BDI
      // proporcional ao que foi medido (medir 100% = preço de venda, ao centavo).
      // O TOTAL usa a MESMA fórmula do preço de venda (valor(custo×(1+BDI))) e o
      // BDI sai como diferença exata — truncar a diferença solta quebrava com BDI
      // NEGATIVO (desconto): truncar rumo ao zero deixava o boletim 1 centavo
      // ACIMA do contratado.
      var total, bdiMedido;
      if (c.bdiNoPU) { bdiMedido = 0; total = somaItens; }
      else {
        total = A0.valor(Bdi.aplicar(somaItens, c.pct), modo);
        bdiMedido = Math.round((total - somaItens) * 100) / 100;
      }
      return {
        itens: itens, totalItens: somaItens, bdiValor: bdiMedido, bdiPercentual: c.pct,
        bdiNoPU: c.bdiNoPU, total: total,
        pctDoOrcamento: c.precoVenda > 0 ? (total / c.precoVenda * 100) : 0,
        avisos: avisos
      };
    },

    // LOTE 4: regime de composição declarado (Lei 14.133 exige) — olha os itens;
    // sem marcação por item, cai no flag do orçamento. Nunca fica em branco.
    regimeDe: function (orc) {
      var des = false, one = false;
      Util.arr(orc && orc.etapas).forEach(function (e) {
        Util.arr(e.itens).forEach(function (it) {
          if (it.desonerado === true) des = true;
          else if (it.desonerado === false) one = true;
        });
      });
      if (des && one) return "misto (desonerado + onerado)";
      if (des) return "desonerado";
      if (one) return "onerado";
      return (orc && orc.desonerado) ? "desonerado" : "onerado";
    },

    // Resumo sintético: uma linha por etapa — somando as MESMAS linhas da planilha
    sintetico: function (orc) {
      var c = this.calcular(orc), A0 = A(), modo = c.modo;
      var totalGeral = c.precoVenda || 1;
      var rows = Util.arr(orc && orc.etapas).map(function (e) {
        return { codigo: e.codigo, nome: e.nome, qtdItens: Util.arr(e.itens).length, custoDireto: 0, precoVenda: 0, peso: 0 };
      });
      c.linhas.forEach(function (L) {
        var r = rows[L.etapaIdx]; if (!r) return;
        r.custoDireto += L.custoTotal;
        r.precoVenda += L.precoTotal;
      });
      rows.forEach(function (r) {
        r.custoDireto = A0.valor(r.custoDireto, modo);
        // BDI apartado: a etapa mostra o preço de venda com o BDI proporcional
        r.precoVenda = c.bdiNoPU ? A0.valor(r.precoVenda, modo) : A0.valor(Bdi.aplicar(r.custoDireto, c.pct), modo);
      });
      // LOTE 2: reconciliação de centavos — a soma das etapas arredondadas TEM
      // que bater ao centavo com o total geral (licitação rejeita por 1 cent).
      // A diferença residual do arredondamento vai para a maior etapa.
      var somaC = 0, somaV = 0, maior = null;
      rows.forEach(function (r) { somaC += r.custoDireto; somaV += r.precoVenda; if (!maior || r.precoVenda > maior.precoVenda) maior = r; });
      if (maior) {
        // O RESÍDUO é sempre pelo centavo mais próximo, mesmo no modo truncar:
        // truncar uma diferença de 0,00999999 (que é 1 centavo com ruído de float)
        // devolveria 0,00 e a soma das etapas ficaria 1 centavo abaixo do total.
        var _res = function (v) { return Math.round(v * 100) / 100; };
        var difC = _res(c.custoDireto - A0.valor(somaC, modo));
        var difV = _res(c.precoVenda - A0.valor(somaV, modo));
        if (difC) maior.custoDireto = _res(maior.custoDireto + difC);
        if (difV) maior.precoVenda = _res(maior.precoVenda + difV);
      }
      rows.forEach(function (r) { r.peso = (r.precoVenda / totalGeral) * 100; });
      return rows;
    },

    // Linha a linha (analítico) — útil p/ export
    analitico: function (orc) {
      return this.calcular(orc).linhas.map(function (L) {
        return {
          etapa: (L.etapaCodigo ? L.etapaCodigo + " " : "") + L.etapaNome,
          numero: L.numero,
          origem: L.origem, codigo: L.codigo, descricao: L.descricao, unidade: L.unidade,
          quantidade: L.quantidade, custoUnitario: L.custoUnitario,
          custoTotal: L.custoTotal, precoUnitario: L.precoUnit, precoVenda: L.precoTotal
        };
      });
    },

    // Exporta o analítico como CSV (separador ; — padrão Excel BR)
    exportarCSV: function (orc) {
      var c = this.calcular(orc);
      // No modo "não arredondar" o orçamento carrega frações de centavo: imprimir
      // 2 casas faria o arquivo NÃO fechar com o próprio total. Quem escolheu não
      // arredondar recebe o CSV com as casas que o cálculo realmente usa.
      var casas = (c.modo === "nenhum") ? 4 : 2;
      var n = function (v) { return Util.fmtNum(v, casas); };
      var head = ["Item", "Etapa", "Origem", "Codigo", "Descricao", "Unid", "Qtd", "Custo Unit", "Custo Total", "Preco Unit", "Preco Total"];
      var rows = [head.join(";")];
      this.analitico(orc).forEach(function (l) {
        rows.push([
          l.numero, '"' + l.etapa + '"', l.origem, l.codigo, '"' + l.descricao + '"', l.unidade,
          Util.fmtNum(l.quantidade, 2), n(l.custoUnitario), n(l.custoTotal),
          n(l.precoUnitario), n(l.precoVenda)
        ].join(";"));
      });
      rows.push("");
      rows.push(["CUSTO DIRETO", "", "", "", "", "", "", "", n(c.custoDireto), "", ""].join(";"));
      // com BDI apartado a soma das linhas é o custo: o BDI PRECISA aparecer como
      // linha própria, senão o arquivo não fecha consigo mesmo
      if (!c.bdiNoPU) rows.push(["BDI " + Util.fmtNum(c.pct, 2) + "%", "", "", "", "", "", "", "", "", "", n(c.bdiValor)].join(";"));
      rows.push(["PRECO DE VENDA", "", "", "", "", "", "", "", "", "", n(c.precoVenda)].join(";"));
      return "﻿" + rows.join("\r\n"); // BOM p/ acentos no Excel
    },

    // ---- Curva ABC (itens ordenados por custo, classes A/B/C) ----
    curvaABC: function (orc) {
      // custo por item JÁ no critério do orçamento — assim o total da curva
      // fecha com o Custo Direto da planilha (o Excel confere isso e imprime
      // "⚠ verificar" no documento entregue quando não bate)
      var itens = this.calcular(orc).linhas.map(function (L) {
        return { codigo: L.codigo, descricao: L.descricao, unidade: L.unidade,
          quantidade: L.quantidade, custoTotal: L.custoTotal, etapa: L.etapaNome };
      });
      itens.sort(function (a, b) { return b.custoTotal - a.custoTotal; });
      var total = itens.reduce(function (s, x) { return s + x.custoTotal; }, 0) || 1;
      var acum = 0;
      var resumo = { A: { qtd: 0, valor: 0 }, B: { qtd: 0, valor: 0 }, C: { qtd: 0, valor: 0 } };
      itens.forEach(function (x) {
        x.pct = (x.custoTotal / total) * 100;
        acum += x.custoTotal;
        x.acumPct = (acum / total) * 100;
        x.classe = x.acumPct <= 80 ? "A" : (x.acumPct <= 95 ? "B" : "C");
        resumo[x.classe].qtd++;
        resumo[x.classe].valor += x.custoTotal;
      });
      ["A", "B", "C"].forEach(function (k) { resumo[k].pct = (resumo[k].valor / total) * 100; });
      return { linhas: itens, total: total, resumo: resumo };
    },

    // ---- Cronograma físico-financeiro ----
    // Distribui o custo de cada etapa sequencialmente ao longo de N meses,
    // proporcional ao peso da etapa (modelo de "tempo-custo" exato: a soma
    // mensal fecha com o total). Usa preço de venda (com BDI).
    cronograma: function (orc, meses) {
      meses = parseInt(meses || orc.cronogramaMeses || 6, 10);
      if (meses < 1) meses = 1;
      var sint = this.sintetico(orc);
      var total = sint.reduce(function (s, e) { return s + e.precoVenda; }, 0) || 1;

      var etapas = [], cum = 0;
      sint.forEach(function (e) {
        var c0 = cum / total, c1 = (cum + e.precoVenda) / total; cum += e.precoVenda;
        var linha = { codigo: e.codigo, nome: e.nome, total: e.precoVenda, meses: [] };
        for (var m = 0; m < meses; m++) {
          var ms = m / meses, me = (m + 1) / meses;
          var overlap = Math.max(0, Math.min(c1, me) - Math.max(c0, ms));
          linha.meses.push(overlap * total);
        }
        etapas.push(linha);
      });

      var totaisMes = [], acum = [], soma = 0;
      for (var m = 0; m < meses; m++) {
        var tm = etapas.reduce(function (s, e) { return s + e.meses[m]; }, 0);
        soma += tm; totaisMes.push(tm); acum.push((soma / total) * 100);
      }
      return { meses: meses, etapas: etapas, totaisMes: totaisMes, acumPct: acum, total: total };
    }
  };

  global.Orcamento = Orcamento;
})(window);
