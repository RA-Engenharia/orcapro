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

    /* ==================================================================
     * COPIAR DE UM ORÇAMENTO EXISTENTE
     *
     * Duas obras parecidas têm 80% da planilha igual. Refazer etapa por
     * etapa é o trabalho que faz o orçamentista abrir o Excel em vez do
     * sistema.
     *
     * O QUE NÃO VEM JUNTO, e por quê — é aqui que uma cópia inocente vira
     * problema de dinheiro:
     *  • número: o novo é ORC próprio. Dois orçamentos com o mesmo número
     *    é rastreabilidade perdida em licitação.
     *  • aprovação / boletim aprovado / assinatura: o novo nasce ABERTO. Um
     *    orçamento que já nasce "aprovado" porque copiou o carimbo do outro
     *    é o pior defeito possível neste módulo.
     *  • cliente e obra: só vêm se quem copiou pedir — o mais comum é a
     *    mesma planilha para OUTRO cliente.
     *  • datas de criação/atualização: são do novo.
     *
     * O QUE VEM: etapas, sub etapas, itens com quantidade, BDI e todos os
     * parâmetros (encargos, arredondamento, competência, UF) — copiar a
     * planilha sem os parâmetros dela daria outro total, em silêncio.
     * ================================================================== */
    copiarDe: function (origem, dados) {
      var o = origem || {}, d = dados || {};
      var copia = JSON.parse(JSON.stringify(o));   /* fundo, para não dividir
                                                      etapas/itens com a origem */
      copia.id = Util.uid("orc");
      copia.numero = d.numero || ("ORC-" + new Date().getFullYear() + "-" + Math.floor(Math.random() * 9000 + 1000));
      copia.nome = d.nome || ("Cópia de " + (o.nome || "orçamento"));
      copia.criadoEm = Util.agoraISO();
      copia.atualizadoEm = Util.agoraISO();
      copia.copiadoDe = o.id || "";
      copia.copiadoDeNumero = o.numero || "";

      /* cliente/obra: em branco por padrão; só herda se pedirem */
      if (!d.manterCliente) copia.cliente = { nome: d.cliente || "", doc: "", contato: "" };
      else if (d.cliente) copia.cliente = { nome: d.cliente, doc: (o.cliente || {}).doc || "", contato: (o.cliente || {}).contato || "" };
      if (!d.manterObra) copia.obra = { nome: d.obra || "", local: "", regime: (o.obra || {}).regime || "Empreitada" };

      /* nasce ABERTO — nenhum carimbo de aprovação atravessa a cópia
         ⚠ v1.1.236 — esta lista tinha SÓ os nomes legados. A máquina de
         estados atual grava em `estadoAprovacao`/`historicoAprovacao`, e esses
         dois passavam direto: a cópia nascia aprovada e TRAVADA (qualquer
         edição recusada por App.persistir, o usuário digitando sem gravar), e
         o histórico herdado ainda contava a cópia como enviada e aprovada nos
         indicadores da carteira — inflando a taxa de conversão com um
         orçamento que nunca foi ao cliente. É o defeito que o comentário
         acima chama de "o pior possível neste módulo", entrando por outra
         porta. `fechamento` também sai: o desfazer da cópia restauraria
         preços de um snapshot tirado no orçamento de origem. */
      ["aprovado", "aprovadoEm", "aprovadoPor", "aprovacao", "assinatura",
       "boletimAprovado", "travado", "status", "estado", "propostaGerada",
       "propostaEm", "propostaCanal", "propostaPor", "propostaResposta",
       "propostaHistorico", "obraId", "contratoId", "medicoes",
       "estadoAprovacao", "historicoAprovacao", "revisaoMotivo", "revisaoPor",
       "revisaoEm", "aprovadoPeloProprioAutor", "revisaoDe", "revisaoNumero",
       "fechamento"].forEach(function (k) {
        if (copia[k] !== undefined) delete copia[k];
      });

      /* itens sem quantidade: útil para reaproveitar SÓ a estrutura de
         serviços quando a obra nova tem metragem diferente */
      if (d.semQuantidades) {
        (copia.etapas || []).forEach(function (e) {
          (e.itens || []).forEach(function (it) { it.quantidade = 0; });
          (e.subetapas || []).forEach(function (se) {
            (se.itens || []).forEach(function (it) { it.quantidade = 0; });
          });
        });
      }
      return copia;
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
        /* ⚠ A FRASE ACIMA NÃO É UMA DATA. Enquanto a validade foi só texto, o
           sistema não sabia dizer se a proposta ainda valia: não avisava o
           vendedor véspera do vencimento e imprimia como válida uma proposta
           de dois meses atrás. `validadeDias` é o número que permite calcular
           a data — a frase segue para quem tem condição fora do comum. */
        validadeDias: 15,
        garantia: "Garantia legal de 5 (cinco) anos para a solidez e segurança da obra, nos termos do art. 618 do Código Civil.",
        incluso: "Fornecimento de materiais e mão de obra dos serviços orçados;\nLeis sociais e encargos trabalhistas;\nFerramentas e equipamentos de execução;\nLimpeza periódica e final da obra.",
        excluso: "Projetos complementares e taxas de aprovação;\nLigações definitivas de água, energia e esgoto;\nMobiliário, paisagismo e itens de decoração;\nServiços não descritos expressamente nesta proposta.",
        /* endereço (URL) da planilha desta proposta — vira o botão "Abrir planilha"
           no PDF quando o modelo de proposta pede. Vazio = sem botão. */
        linkPlanilha: ""
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
    // Mantido por compatibilidade; a numeração VIVA (que enxerga sub etapa) sai
    // de calcular() em L.numero — é ela que os entregáveis leem.
    itemNumero: function (etapaIdx, itemIdx) { return (etapaIdx + 1) + "." + (itemIdx + 1); },

    /* ================= SUB ETAPAS (etapa > sub etapa > item) =================
     * O dado é ADITIVO e opcional: a etapa ganha `subetapas: [{id, nome}]` e o
     * item ganha `subEtapaId`. Ausentes = orçamento de hoje, numerado 1 / 1.1 /
     * 1.2, bit a bit igual.
     *
     * Os itens continuam TODOS em `e.itens`. Isso não é detalhe: há 30+ lugares
     * que leem `e.itens` direto, sem passar pelo motor (Excel, laudo, cronograma,
     * previsto×real, export Revit, round-trip). Aninhar item dentro da sub etapa
     * faria item SUMIR do total — sem erro, sem aviso, só um total menor.
     * ===================================================================== */
    subEtapas: function (e) { return Util.arr(e && e.subetapas); },

    addSubEtapa: function (orc, etapaId, nome, moverItensSoltos) {
      var e = this._etapa(orc, etapaId); if (!e) return null;
      if (!Array.isArray(e.subetapas)) e.subetapas = [];
      var s = { id: Util.uid("sub"), nome: Util.fixEnc(String(nome == null ? "" : nome).trim()) || "Nova sub etapa" };
      e.subetapas.push(s);
      // Etapa que JÁ tinha itens: o padrão é levá-los para dentro da sub etapa —
      // senão "1.1" significaria duas coisas (item solto e grupo) no mesmo lugar.
      if (moverItensSoltos) Util.arr(e.itens).forEach(function (it) { if (!it.subEtapaId) it.subEtapaId = s.id; });
      this._normalizarEtapa(e);
      return s;
    },
    renomearSubEtapa: function (orc, etapaId, subId, nome) {
      var e = this._etapa(orc, etapaId); if (!e) return orc;
      var s = this.subEtapas(e).filter(function (x) { return x.id === subId; })[0];
      if (s && Util.naoVazio(nome)) s.nome = String(nome).trim();
      return orc;
    },
    // Remover a sub etapa NUNCA apaga item: os itens voltam a soltos na etapa.
    // O agrupamento é organização; o serviço orçado é conteúdo.
    removerSubEtapa: function (orc, etapaId, subId) {
      var e = this._etapa(orc, etapaId); if (!e) return orc;
      e.subetapas = this.subEtapas(e).filter(function (x) { return x.id !== subId; });
      Util.arr(e.itens).forEach(function (it) { if (it.subEtapaId === subId) it.subEtapaId = ""; });
      this._normalizarEtapa(e);
      return orc;
    },
    moverSubEtapa: function (orc, etapaId, subId, dir) {
      var e = this._etapa(orc, etapaId); if (!e) return orc;
      var arr = this.subEtapas(e), i = -1;
      for (var k = 0; k < arr.length; k++) { if (arr[k].id === subId) { i = k; break; } }
      if (i < 0) return orc;
      var j = i + (dir < 0 ? -1 : 1);
      if (j < 0 || j >= arr.length) return orc;
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      this._normalizarEtapa(e);
      return orc;
    },
    // Move um item entre grupos da MESMA etapa. subId vazio = solto na etapa.
    moverItemParaSub: function (orc, etapaId, itemId, subId) {
      var e = this._etapa(orc, etapaId); if (!e) return orc;
      var it = Util.arr(e.itens).filter(function (x) { return x.id === itemId; })[0];
      if (!it) return orc;
      var existe = this.subEtapas(e).filter(function (s) { return s.id === subId; }).length > 0;
      it.subEtapaId = (subId && existe) ? subId : "";
      this._normalizarEtapa(e);
      return orc;
    },
    /* ORDEM CANÔNICA de e.itens: soltos primeiro, depois um bloco CONTÍGUO por
     * sub etapa, na ordem de e.subetapas. É essa contiguidade que faz a
     * numeração impressa e o desenho da planilha baterem — e é ela que repara
     * dado misto vindo do importador, do round-trip do Excel ou do agente EAP.
     * Também limpa `subEtapaId` órfão (sub etapa que não existe mais).
     * Idempotente. NUNCA é chamada de dentro de calcular(), que fica puro. */
    _normalizarEtapa: function (e) {
      if (!e) return e;
      var subs = this.subEtapas(e);
      if (!subs.length) {
        // etapa sem sub etapa: sem carimbo órfão, e nada mais muda
        Util.arr(e.itens).forEach(function (it) { if (it.subEtapaId) it.subEtapaId = ""; });
        return e;
      }
      var valido = {}, blocos = {}, soltos = [];
      subs.forEach(function (s) { valido[s.id] = true; blocos[s.id] = []; });
      Util.arr(e.itens).forEach(function (it) {
        var sid = (it.subEtapaId && valido[it.subEtapaId]) ? it.subEtapaId : "";
        if (!sid) { if (it.subEtapaId) it.subEtapaId = ""; soltos.push(it); }
        else blocos[sid].push(it);
      });
      var novo = soltos.slice();
      subs.forEach(function (s) { novo = novo.concat(blocos[s.id]); });
      e.itens = novo;
      return e;
    },
    normalizarSubEtapas: function (orc) {
      var self = this;
      Util.arr(orc && orc.etapas).forEach(function (e) { self._normalizarEtapa(e); });
      return orc;
    },
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
      // FRONTEIRA DO BLOCO: subir o 1º item de uma sub etapa o arrancaria dela e
      // a numeração sairia 1.1.1, 1.2, 1.1.2. Só troca com vizinho do mesmo grupo;
      // para trocar de grupo existe moverItemParaSub.
      if ((arr[i].subEtapaId || "") !== (arr[j].subEtapaId || "")) return orc;
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      return orc;
    },
    // Renomeia uma etapa sem recriá-la (mantém itens e código).
    /* =====================================================================
     * ETAPA OPCIONAL — o "adicional" que o cliente pode incluir
     *
     * ⚠ NÃO É UMA ETAPA DESLIGADA. Ela continua no orçamento, no Excel, na
     *   curva ABC e no total do sistema: se o cliente aceitar, o serviço já
     *   está orçado com o mesmo critério do resto. O que a marca muda é o
     *   PAPEL — na proposta ela sai fora do total, num bloco de adicionais,
     *   com o preço à vista para quem quiser incluir.
     * ===================================================================== */
    marcarEtapaOpcional: function (orc, etapaId, valor) {
      var e = this._etapa(orc, etapaId);
      if (!e) return orc;
      if (valor) e.opcional = true; else delete e.opcional;
      return orc;
    },

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
        Util.arr(e.subetapas).forEach(function (s) { fix(s, "nome"); });
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
    /* ===== "SINAPI" SÃO DUAS FONTES, UMA BASE =====
     * `SINAPI_DES` é a MESMA SINAPI no regime desonerado — mesmos códigos e
     * estrutura, só o encargo social muda. Entrou no multi-base como fonte
     * separada, e todo lugar que perguntava `=== "SINAPI"` para decidir "tem
     * analítico oficial?" dizia NÃO para o desonerado. Esta é a pergunta certa,
     * num lugar só; `baseFonte` continua guardando o regime para a etiqueta. */
    ehSinapi: function (fonte) {
      var f = String(fonte || "").toUpperCase();
      return f === "SINAPI" || f === "SINAPI_DES";
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
          if (!self.ehSinapi(it.origem)) return;
          var fonteReal = (it.baseFonte && !self.ehSinapi(it.baseFonte)) ? it.baseFonte : null;
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
      /* ⚠ O DOCUMENTO TEM DE DECLARAR A VARIANTE, não só a sigla.
       * O Passo 3 deixa escolher região do SETOP (6 opções, com preços
       * diferentes em 910 das 3.977 composições) e regime da GOINFRA (527 dos
       * 566 códigos divergem). Enquanto o laudo dizia só "SETOP-MG", dois
       * orçamentos com preços diferentes emitiam o MESMO texto de base — e em
       * licitação a peça tem de dizer de onde saiu o número.
       * A fonte da verdade é o registro DO ORÇAMENTO (config.bases e
       * config.basesV2), nunca o que está carregado agora: reemitir um laudo
       * meses depois não pode reescrever a base que aquela peça declarou. */
      var cfgB = (orc.config && orc.config.bases) || [];
      var v2 = (orc.config && orc.config.basesV2) || null;
      function registroDe(f) {
        for (var i = 0; i < cfgB.length; i++) { if (String(cfgB[i].fonte).toUpperCase() === f) return cfgB[i]; }
        return null;
      }
      function varianteDe(f) {
        if (!v2 || !v2.extras) return "";
        for (var i = 0; i < v2.extras.length; i++) {
          if (String(v2.extras[i].catId).toUpperCase() !== f) continue;
          var sel = v2.extras[i].sel; if (!sel) return "";
          var e = (typeof BasesCat !== "undefined") ? BasesCat.get(f) : null;
          var partes = [];
          Object.keys(sel).forEach(function (k) {
            var rot = sel[k];
            if (e) {
              (e.eixos || []).forEach(function (ex) {
                if (ex.id !== k) return;
                (ex.opcoes || []).forEach(function (o) { if (String(o.v) === String(sel[k])) rot = o.r; });
              });
            }
            if (rot) partes.push(rot);
          });
          return partes.join(" · ");
        }
        return "";
      }
      function comp(c) {
        return (typeof BasesCat !== "undefined" && BasesCat.fmtVersao) ? BasesCat.fmtVersao(c) : c;
      }
      var out = Object.keys(cont).map(function (f) {
        var label = (f === "PROPRIO") ? "Composição própria" : (f === "OUTRA" ? "Outra base" : ((META[f] && META[f].label) || f));
        var texto = label;
        if (f === "SINAPI") texto = "SINAPI " + (orc.competenciaSinapi || "") + (orc.uf ? "/" + orc.uf : "");
        else if (f === "SINAPI_DES") {
          var regD = registroDe(f) || {};
          texto = "SINAPI " + comp(regD.competencia || orc.competenciaSinapi || "") +
            ((regD.uf || orc.uf) ? "/" + (regD.uf || orc.uf) : "") + " (desonerado)";
        }
        else if (f !== "PROPRIO" && f !== "OUTRA") {
          var reg = registroDe(f), vr = varianteDe(f);
          if (reg && reg.competencia) texto += " " + comp(reg.competencia);
          if (vr) texto += " (" + vr + ")";
        }
        /* ⚠ A IDADE VIAJA JUNTO COM A BASE. O documento já dizia qual base e de
           que competência; não dizia que aquele preço tem quase três anos, e a
           ressalva morava só na tela de tabelas. Quem orça e entrega estava
           assinando preço velho sem saber. */
        var _v = (f === "SINAPI") ? (orc.competenciaSinapi || "") : ((registroDe(f) || {}).competencia || "");
        var _meses = (typeof BasesCat !== "undefined" && BasesCat.idadeMeses) ? BasesCat.idadeMeses(_v) : null;
        var _idade = (typeof BasesCat !== "undefined" && BasesCat.idadeTexto) ? BasesCat.idadeTexto(_v) : "";
        return { fonte: f, label: label, texto: texto, n: cont[f],
                 competencia: _v, idadeMeses: _meses, idadeTexto: _idade };
      });
      out.sort(function (a, b) {
        if (a.fonte === "SINAPI") return -1; if (b.fonte === "SINAPI") return 1;
        if (a.fonte === "SINAPI_DES") return -1; if (b.fonte === "SINAPI_DES") return 1;
        if (a.fonte === "PROPRIO") return 1; if (b.fonte === "PROPRIO") return -1;
        return String(a.label).localeCompare(String(b.label));
      });
      return out;
    },
    // Texto das bases p/ cabeçalhos/documentos: "SINAPI 05/2026/MG · AGETOP-GO".
    // Sem itens (orçamento vazio) cai no rótulo SINAPI padrão só p/ não quebrar.
    /* ⚠ RESSALVA DE BASE DESATUALIZADA, para ir NO DOCUMENTO.
     *
     * Devolve só as bases cuja competência passou do limite — e devolve texto
     * pronto, para o Excel, o laudo e a proposta dizerem a MESMA coisa. Réplica
     * de regra em três lugares é como os três divergem.
     *
     * ⚠ Base sem competência legível NÃO entra: afirmar "desatualizada" sem
     *   saber a data seria inventar ressalva, e ressalva falsa num documento
     *   que vai a licitação é pior que ressalva nenhuma.
     * Limite de 12 meses porque é o ponto em que qualquer base referencial já
     * passou por reajuste de insumo relevante no Brasil. */
    basesDesatualizadas: function (orc, mesesLimite) {
      var lim = typeof mesesLimite === "number" ? mesesLimite : 12;
      return this.basesUsadas(orc).filter(function (b) {
        return b.fonte !== "PROPRIO" && b.fonte !== "OUTRA"
          && typeof b.idadeMeses === "number" && b.idadeMeses >= lim;
      });
    },
    /* Frase única para o cabeçalho dos documentos. "" quando não há o que
       ressalvar — nunca imprime aviso vazio. */
    ressalvaBasesTexto: function (orc, mesesLimite) {
      var v = this.basesDesatualizadas(orc, mesesLimite);
      if (!v.length) return "";
      return "Atenção: " + v.map(function (b) {
        return b.label + " " + ((typeof BasesCat !== "undefined" && BasesCat.fmtVersao) ? BasesCat.fmtVersao(b.competencia) : b.competencia)
          + " (" + b.idadeTexto + ")";
      }).join(" · ") + ". Preço de referência dessa data — confira com o mercado antes de assinar.";
    },

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
    addItem: function (orc, etapaId, sinapiItem, quantidade, subEtapaId) {
      var etapa = this._etapa(orc, etapaId);
      if (!etapa) return orc;
      var origem = this._origemDe(sinapiItem.codigo, sinapiItem.baseFonte || null);
      /* ===== QUANTIDADE PENDENTE (v1.1.226) =====
         Aqui era `Util.num(quantidade) || 1`. Vazio, 0, texto e negativo viravam
         1 CALADOS — um metro quadrado que ninguém digitou entrando no total do
         orçamento. O Parede-Cebola já tinha um guard próprio para não cair
         nisso (js/paredecebola.js), o que mostra que o buraco era conhecido.

         Agora o item pode nascer SEM quantidade, de propósito: é o fluxo de
         trazer a composição primeiro e calcular a metragem depois, no memorial.
         Quem nasce assim fica com quantidade 0 e `qtdPendente: true`, aparece
         marcado na planilha e NÃO soma no total — some do total é mentira
         menor que somar um número inventado.

         `qtdPendente` some sozinho no instante em que uma quantidade real
         entra (ver atualizarItem e aplicarMemoriaQuantidade). */
      var _q = Util.num(quantidade);
      var _pendente = !(_q > 0);
      var it = {
        id: Util.uid("itm"),
        origem: origem,
        baseFonte: sinapiItem.baseFonte || (origem === "PROPRIO" ? null : origem),
        codigo: sinapiItem.codigo || "—",
        descricao: Util.fixEnc(sinapiItem.descricao || "Item próprio"),
        unidade: Util.fixEnc(sinapiItem.unidade || "un"),
        quantidade: _pendente ? 0 : _q,
        custoUnitario: Util.num(sinapiItem.custoUnitario),
        custoMO: Util.num(sinapiItem.custoMO),
        custoMAT: Util.num(sinapiItem.custoMAT),
        custoEQ: Util.num(sinapiItem.custoEQ)
      };
      /* o modo escolhido e o custo cheio VIAJAM com o item — sem isto a
         escolha se perde no lançamento e o item volta a somar tudo */
      /* ===== O REGIME VIAJA COM O ITEM =====
       *
       * `regimeDe()` sempre soube ler `it.desonerado` — mas NINGUÉM gravava:
       * esta função monta o item com lista branca de campos e o flag ficava
       * de fora, então o ramo "por item" era código morto e o regime saía
       * sempre do flag do orçamento inteiro.
       *
       * Passou a importar de verdade quando a base "SINAPI desonerada" virou
       * instalável: um orçamento pode misturar os dois regimes sem que nada
       * no documento diga isso — e a Lei 14.133 manda declarar o regime. É
       * também o que deixa o detalhamento recusar abrir com encargo trocado.
       *
       * Só grava o que a BASE declarou: item sem marca continua sem marca,
       * porque inventar regime é pior que não saber. */
      if (typeof sinapiItem.desonerado === "boolean") it.desonerado = sinapiItem.desonerado;
      if (sinapiItem.modoCusto && sinapiItem.modoCusto !== "total") it.modoCusto = sinapiItem.modoCusto;
      if (sinapiItem.custoBase != null) it.custoBase = Util.num(sinapiItem.custoBase);
      /* a memória de cálculo nasce COM o item quando veio da calculadora —
         justificar a metragem depois é o que ninguém volta para fazer */
      if (sinapiItem.memoriaCalculo) it.memoriaCalculo = String(sinapiItem.memoriaCalculo);
      if (_pendente) it.qtdPendente = true;
      // destino opcional: sub etapa da MESMA etapa (id desconhecido vira solto)
      if (subEtapaId && this.subEtapas(etapa).filter(function (s) { return s.id === subEtapaId; }).length) it.subEtapaId = subEtapaId;
      etapa.itens.push(it);
      if (this.subEtapas(etapa).length) this._normalizarEtapa(etapa);
      return orc;
    },
    /* REPRECIFICAR OS ITENS QUE VIERAM DE UMA COMPOSIÇÃO EDITADA.
     * O item lançado é um snapshot (decisão consciente: orçamento não muda
     * sozinho quando a base gira) — mas quando o USUÁRIO edita a própria
     * composição, o snapshot congelado vira mentira: o detalhamento lê a
     * base ao vivo e mostra o preço novo enquanto a planilha soma o velho.
     * Medido: coeficiente 10→20 dobrou o CU no modal e a planilha seguiu
     * com R$ 7,80. Esta função varre o orçamento e atualiza os itens que
     * apontam para o código editado; quem chama decide (com confirmação)
     * e persiste. codigoAntigo cobre edição que renomeia o código.
     * Devolve quantos itens mudaram. */
    reprecificarPorCodigo: function (orc, codigoAntigo, novo) {
      var n = 0;
      /* ⚠ ORÇAMENTO APROVADO NÃO SE REPRECIFICA (v1.1.232). A varredura de
         cpSalvar/_propriaPropagarInsumo passava por TODOS os orçamentos da
         empresa — inclusive os aprovados, que a trava de aprovação promete
         congelar. Editar uma composição mudava por baixo o preço de um
         orçamento já aceito pelo cliente. Preço aprovado é contrato: quem
         quiser o preço novo cria uma revisão. */
      if (this.travadoPorAprovacao && this.travadoPorAprovacao(orc)) return 0;
      ((orc && orc.etapas) || []).forEach(function (et) {
        (et.itens || []).forEach(function (it) {
          var deProprio = String(it.baseFonte || it.origem || "").toUpperCase() === "PROPRIA" ||
                          String(it.origem || "").toUpperCase() === "PROPRIO";
          if (!deProprio) return;
          if (String(it.codigo) !== String(codigoAntigo) && String(it.codigo) !== String(novo.codigo)) return;
          it.codigo = novo.codigo;
          it.descricao = Util.fixEnc(novo.descricao || it.descricao);
          it.unidade = novo.unidade || it.unidade;
          it.custoMO = Util.num(novo.custoMO);
          it.custoMAT = Util.num(novo.custoMAT);
          it.custoEQ = Util.num(novo.custoEQ);
          /* ⚠ RESPEITA O MODO DE CUSTO (v1.1.232). Aqui se gravava sempre o
             preço CHEIO da composição: um item lançado como "só mão de obra"
             passava a cobrar MO+MAT+EQ na primeira edição da composição — o
             material que o cliente forneceria voltava a ser cobrado dele, em
             silêncio. O item que tem modo guarda o cheio em custoBase e fatura
             só a parcela escolhida. */
          if (it.modoCusto === "mo" || it.modoCusto === "matEq") {
            it.custoBase = Util.num(novo.custoUnitario);
            var parcela = it.modoCusto === "mo" ? Util.num(novo.custoMO)
                                                : Util.num(novo.custoMAT) + Util.num(novo.custoEQ);
            /* a composição editada deixou de publicar a parcela? Cai para o
               cheio AVISANDO pelo próprio número (não zera calado) e solta o
               modo, que não tem mais base para existir. */
            if (parcela > 0) { it.custoUnitario = parcela; }
            else { it.custoUnitario = Util.num(novo.custoUnitario); delete it.modoCusto; delete it.custoBase; }
          } else {
            it.custoUnitario = Util.num(novo.custoUnitario);
            if (it.custoBase != null) it.custoBase = Util.num(novo.custoUnitario);
          }
          n++;
        });
      });
      return n;
    },
    atualizarItem: function (orc, etapaId, itemId, campos) {
      var etapa = this._etapa(orc, etapaId);
      if (!etapa) return orc;
      var it = etapa.itens.filter(function (x) { return x.id === itemId; })[0];
      if (!it) return orc;
      // LOTE 2: quantidade ≤ 0 vira item fantasma silencioso — rejeita e mantém o valor
      if (campos.quantidade != null) {
        var q = Util.num(campos.quantidade);
        // quantidade real chegou: o item deixa de ser pendente e volta a somar
        if (q > 0) { it.quantidade = q; delete it.qtdPendente; }
        else { try { if (global.UI && global.UI.toast) global.UI.toast("Quantidade deve ser maior que zero — valor anterior mantido.", "erro"); } catch (e) {} }
      }
      if (campos.custoUnitario != null) {
        var novo = Util.num(campos.custoUnitario);
        /* ANTES de gravar: registra o desvio em relação ao preço da base. Na
           primeira edição o valor que está no item AINDA é o da base — é ele
           que vira a referência congelada (ver regra 2 do ajustes.js). */
        this._registrarAjuste(orc, it, "custoUnitario", it.custoUnitario, novo);
        var antesU = Util.num(it.custoUnitario);
        it.custoUnitario = novo;
        /* ⚠ v1.1.236 — E AS PARCELAS VÃO JUNTO. Gravar só o unitário deixava
           MO/MAT/EQ com os números da base: o item cotado a 80,00 continuava
           com parcelas somando 50,00. Isso não ficava escondido — vazava para
           fora em documento assinado (o laudo imprimia "Custo direto 8.000" e
           logo abaixo uma "Composição do custo" de 5.000) e envenenava o
           fechamento em um valor, que reconstrói o unitário a partir delas. */
        this.repartirParcelas(it, novo, this.garantirConfig(orc).arredondamento, antesU);
      }
      if (campos.descricao != null) it.descricao = campos.descricao;
      return orc;
    },

    /* =================================================================
     * AS PARCELAS DO ITEM (MO / MAT / EQ)
     *
     * INVARIANTE DA CASA: quando o item traz as parcelas discriminadas, o
     * custo unitário É a soma das parcelas ATIVAS — as que o modo de custo
     * do item realmente fatura. Item "só mão de obra" fatura custoMO; item
     * "só material+equipamento" fatura custoMAT+custoEQ.
     *
     * Quem escreve o unitário sozinho quebra esse invariante em silêncio, e
     * o estrago aparece longe de onde nasceu: no laudo pericial, na pizza do
     * xlsx e, pior, no fechamento em um valor — que reconstruía o unitário a
     * partir das parcelas velhas e derrubava o preço que o usuário tinha
     * cotado à mão, empurrando o dinheiro para os outros itens sem avisar.
     * ================================================================= */
    PARCELAS: ["custoMO", "custoMAT", "custoEQ"],
    parcelasAtivas: function (it) {
      if (it && it.modoCusto === "mo") return ["custoMO"];
      if (it && it.modoCusto === "matEq") return ["custoMAT", "custoEQ"];
      return this.PARCELAS;
    },

    /* Reparte um CUSTO TOTAL (qtd × unitário) entre MO/MAT/EQ na proporção das
     * parcelas ATIVAS do item. Devolve null quando o item não tem parcelas
     * discriminadas — aí quem chama decide o fallback (o xlsx usa a razão da
     * composição analítica; o laudo joga em material).
     *
     * Existe para que os ENTREGÁVEIS parem de refazer esta conta cada um do
     * seu jeito: a pizza do xlsx, o Resumo do xlsx e o laudo pericial tinham
     * três implementações, e as três ignoravam o modo de custo. Um item "só
     * mão de obra" — em que o material é justamente o que o CONTRATANTE
     * fornece — saía com 60% de material no documento assinado, enquanto a
     * tela mostrava 100% MO. Ratear sempre dentro do custo total garante, de
     * quebra, que MO+MAT+EQ feche com o Custo Direto impresso acima. */
    repartirCusto: function (it, ct) {
      if (!it) return null;
      var ativas = this.parcelasAtivas(it), soma = 0;
      ativas.forEach(function (p) { soma += Util.num(it[p]); });
      if (!(soma > 0)) return null;
      var r = { mo: 0, mat: 0, eq: 0 }, c = Util.num(ct);
      if (ativas.indexOf("custoMO") >= 0) r.mo = c * (Util.num(it.custoMO) / soma);
      if (ativas.indexOf("custoMAT") >= 0) r.mat = c * (Util.num(it.custoMAT) / soma);
      if (ativas.indexOf("custoEQ") >= 0) r.eq = c * (Util.num(it.custoEQ) / soma);
      return r;
    },

    /* Rateia `novoUnit` entre as parcelas ativas na proporção em que elas
     * estavam. O resíduo do truncamento vai para a MAIOR parcela, de forma
     * que a soma feche EXATAMENTE com o unitário — e não por sorte de
     * arredondamento. Item sem parcelas discriminadas não ganha parcela
     * inventada: devolve false e o unitário fica sozinho, como já era.
     * `antesUnit` (opcional) é a referência para escalar custoBase — o item
     * com modo de custo guarda ali o unitário CHEIO da composição. */
    repartirParcelas: function (it, novoUnit, modo, antesUnit) {
      if (!it) return false;
      var A0 = A(), u = Util.num(novoUnit);
      var ativas = this.parcelasAtivas(it), soma = 0, usadas = [];
      ativas.forEach(function (p) { var v = Util.num(it[p]); if (v > 0) { soma += v; usadas.push(p); } });
      if (!(soma > 0)) return false;
      /* unitário zerado (desconto que levou o item a zero): as parcelas ativas
         vão a zero junto, senão sobra um item de preço 0 com composição cheia */
      if (!(u > 0)) { usadas.forEach(function (p) { it[p] = 0; }); return true; }

      var acum = 0;
      usadas.forEach(function (p) {
        var v = A0.unitario(u * Util.num(it[p]) / soma, modo);
        it[p] = v; acum += v;
      });
      var maior = usadas[0];
      usadas.forEach(function (p) { if (Util.num(it[p]) > Util.num(it[maior])) maior = p; });
      var resto = u - acum;
      if (Math.abs(resto) > 1e-9) {
        var v2 = Util.num(it[maior]) + resto;
        /* 1e-6 mata o ruído de ponto flutuante sem estragar o modo "nenhum",
           que é o único onde o unitário pode ter mais de 2 casas */
        it[maior] = v2 < 0 ? 0 : Math.round(v2 * 1e6) / 1e6;
      }
      /* custoBase é o unitário CHEIO da composição (item lançado como só MO
         ou só MAT+EQ). Escala junto, senão o "voltar ao custo cheio" devolve
         o preço da base em vez do preço que o usuário negociou. */
      if (it.custoBase != null) {
        var ref = Util.num(antesUnit);
        if (ref > 0) it.custoBase = A0.unitario(Util.num(it.custoBase) * (u / ref), modo);
      }
      return true;
    },

    /* Um único ponto de entrada para o selo de "alterado por você": todo
       caminho que grava preço passa por aqui (edição na planilha, reimportação
       do Excel, ajuste de coeficiente). Espalhar isso pelas telas garantiria
       que um dos caminhos ficasse de fora e a alteração sumisse em silêncio. */
    _registrarAjuste: function (orc, item, campo, antes, depois) {
      if (typeof Ajustes === "undefined" || !Ajustes.registrar) return;
      try {
        Ajustes.registrar(item, campo, antes, depois, {
          fonte: item.fonte || item.origem || "",
          competencia: (orc && orc.competenciaSinapi) || "",
          uf: (orc && orc.uf) || "",
          por: (typeof Auth !== "undefined" && Auth.usuario && Auth.usuario()) ? (Auth.usuario().email || "") : ""
        });
      } catch (e) { /* o selo é informativo: nunca pode impedir a gravação */ }
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
      var linhas = [], grupos = [], custoDireto = 0, somaVenda = 0, mo = 0, mat = 0, eq = 0, nSub = 0;
      /* ⚠ ETAPA OPCIONAL É SEPARAÇÃO DE PAPEL, NÃO DE CONTA. `precoVenda`
         continua somando TUDO — é ele que o Excel, o laudo, a medição, o
         contrato e a curva ABC leem, e mudar o seu significado aqui trocaria
         o total de doze telas para resolver um problema de uma. O que nasce
         aqui são DOIS acumuladores a mais, que só quem quiser usa: a proposta
         imprime o obrigatório no total e os opcionais como "adicionais". */
      var vendaOpc = 0, custoOpc = 0;
      var self = this;
      Util.arr(orc && orc.etapas).forEach(function (e, ei) {
        /* NUMERAÇÃO DO 2º NÍVEL — um contador só, compartilhado: os itens SOLTOS
         * ocupam 1..N e cada sub etapa vem depois, na ordem de e.subetapas.
         * Sem sub etapa isso DEGENERA no número de sempre (1.1, 1.2, 1.3) — não é
         * um "if de legado", é o mesmo algoritmo com zero grupos. */
        var subs = self.subEtapas(e), valido = {}, gRef = {}, numSub = {}, cntSub = {}, nomeSub = {};
        subs.forEach(function (s) { valido[s.id] = true; });
        /* Conta os itens de cada grupo ANTES de numerar. Sub etapa VAZIA não gasta
         * número: ela existe na tela (para o usuário lançar dentro) mas não é uma
         * linha do orçamento, e os entregáveis imprimem grupo varrendo ITENS. Se ela
         * consumisse o número, a planilha entregue pularia de 1.1 para 1.3 — um
         * buraco que o leitor do edital lê como item omitido. Ganha número no
         * instante em que recebe o primeiro item. */
        var nSoltos = 0, nItensSub = {};
        subs.forEach(function (s) { nItensSub[s.id] = 0; });
        Util.arr(e.itens).forEach(function (it) {
          if (it.subEtapaId && valido[it.subEtapaId]) nItensSub[it.subEtapaId]++;
          else nSoltos++;
        });
        var seq2 = nSoltos;
        subs.forEach(function (s, si) {
          var vazia = !nItensSub[s.id];
          if (!vazia) { seq2++; numSub[s.id] = (ei + 1) + "." + seq2; }
          else numSub[s.id] = "";
          nomeSub[s.id] = s.nome || "Sub etapa"; cntSub[s.id] = 0;
          var g = { etapaIdx: ei, etapaId: e.id, etapaNome: e.nome || "", subIdx: si,
            subEtapaId: s.id, nome: nomeSub[s.id], numero: numSub[s.id], vazia: vazia,
            qtdItens: 0, custoTotal: 0, precoTotal: 0 };
          grupos.push(g); gRef[s.id] = g;
        });
        nSub += subs.length;
        var seq = 0;
        Util.arr(e.itens).forEach(function (it, ii) {
          var sid = (it.subEtapaId && valido[it.subEtapaId]) ? it.subEtapaId : "";
          var numero;
          if (!sid) { seq++; numero = (ei + 1) + "." + seq; }
          else { cntSub[sid]++; numero = numSub[sid] + "." + cntSub[sid]; }
          var q = Util.num(it.quantidade);
          var cu = A0.unitario(it.custoUnitario, modo);
          var ct = A0.valor(q * cu, modo);
          // PU faturável: com BDI embutido quando a incidência é no unitário
          var pu = bdiNoPU ? A0.unitario(Util.num(it.custoUnitario) * (1 + pct / 100), modo) : cu;
          var pt = A0.valor(q * pu, modo);
          custoDireto += ct; somaVenda += pt;
          if (e.opcional) { vendaOpc += pt; custoOpc += ct; }
          /* v1.1.233 — MO/MAT/EQ do orçamento respeitam o modo de custo do
             item: "só MO" não soma o material que o cliente fornece. É este
             agregado que alimenta o Resumo, a pizza do xlsx e o laudo — somar
             a parcela que NÃO está no preço fazia o gráfico contradizer a
             planilha. */
          if (it.modoCusto !== "matEq") mo += q * Util.num(it.custoMO);
          if (it.modoCusto !== "mo") { mat += q * Util.num(it.custoMAT); eq += q * Util.num(it.custoEQ); }
          if (sid) { var g2 = gRef[sid]; g2.qtdItens++; g2.custoTotal += ct; g2.precoTotal += pt; }
          linhas.push({
            etapaIdx: ei, etapaId: e.id, etapaCodigo: e.codigo || "", etapaNome: e.nome || "",
            itemIdx: ii, numero: numero, item: it, itemId: it.id,
            // hierarquia (vazios em item solto — quem não usa sub etapa não vê diferença)
            subEtapaId: sid, subEtapaNome: sid ? nomeSub[sid] : "", subNumero: sid ? numSub[sid] : "",
            nivel: sid ? 3 : 2,
            codigo: it.codigo || "", descricao: it.descricao || "", unidade: it.unidade || "un",
            origem: it.origem, baseFonte: it.baseFonte,
            quantidade: q, custoUnitario: cu, custoTotal: ct,
            precoUnit: pu, precoTotal: pt,
            /* a linha carrega a marca da etapa: quem desenha não precisa
               voltar ao orçamento para saber se aquilo é um adicional */
            opcional: !!e.opcional
          });
        });
      });
      // subtotal do grupo no MESMO critério de arredondamento das linhas
      grupos.forEach(function (g) { g.custoTotal = A0.valor(g.custoTotal, modo); g.precoTotal = A0.valor(g.precoTotal, modo); });
      vendaOpc = A0.valor(vendaOpc, modo); custoOpc = A0.valor(custoOpc, modo);
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
        /* separação para a PROPOSTA (ver a nota dos acumuladores lá em cima).
           Sem nenhuma etapa opcional, `precoObrigatorio === precoVenda` e
           `precoOpcional` é zero — tudo continua exatamente como era. */
        precoOpcional: vendaOpc,
        precoObrigatorio: Math.round((precoVenda - vendaOpc) * 100) / 100,
        custoOpcional: custoOpc,
        mo: A0.valor(mo, modo), mat: A0.valor(mat, modo), eq: A0.valor(eq, modo),
        // cabeçalho de sub etapa NÃO entra em `linhas` (senão qtdItens mentiria e a
        // curva ABC ganharia linha fantasma): vai aqui, com o subtotal do bloco.
        grupos: grupos,
        qtdItens: linhas.length, qtdEtapas: Util.arr(orc && orc.etapas).length, qtdSubEtapas: nSub
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
        precoOpcional: c.precoOpcional,
        precoObrigatorio: c.precoObrigatorio,
        qtdItens: c.qtdItens,
        qtdEtapas: c.qtdEtapas, qtdSubEtapas: c.qtdSubEtapas,
        arredondamento: c.modo, bdiIncidencia: c.incidencia, bdiNoPU: c.bdiNoPU
      };
    },

    /* Linhas já calculadas (mesma conta da tela, do Excel e do laudo). */
    linhas: function (orc) { return this.calcular(orc).linhas; },

    /* Itens SEM PREÇO (custo unitário zerado). Orçamento com pendência destas
     * não pode ser FINALIZADO (proposta/apresentação): zero não é preço, é
     * lacuna — o usuário precisa cotar e preencher antes de entregar. */
    itensSemPreco: function (orc) {
      var out = [];
      this.calcular(orc).linhas.forEach(function (L) {
        if (!(L.custoUnitario > 0)) out.push({ numero: L.numero, codigo: L.codigo, descricao: L.descricao, etapa: L.etapaNome });
      });
      return out;
    },

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
        /* ===== FECHAR 100% FECHA AO CENTAVO (v1.1.232) =====
           O caso especial antigo só valia para 100% NUM boletim só. Medido por
           parciais (30% + 40% + 30%), cada período truncava o próprio valor e
           os centavos perdidos nunca voltavam: o acumulado batia 100% com o
           faturado ABAIXO do contratado — dinheiro do empreiteiro que ficava
           na mesa, um pouco em cada item, para sempre.
           No boletim que FECHA o item, o valor sai por DIFERENÇA: contratado
           menos o que a regra dos períodos anteriores já faturou. */
        /* ===== MÉTODO DA POSIÇÃO ACUMULADA (v1.1.232) =====
           Cada boletim fatura a DIFERENÇA entre a posição acumulada de agora e
           a anterior: valor = F(ant+p) − F(ant), com F(100%) = o contratado.
           A soma dos períodos vira telescópica — F(100) − F(0) — e fecha AO
           CENTAVO com o contratado POR CONSTRUÇÃO, não importa em quantos
           boletins nem com que percentuais o item foi medido.
           Antes, cada período truncava o próprio valor isoladamente: medir
           3 × 33,33% deixava centavos sem faturar em cada item, para sempre —
           provado: 2 itens em 3 boletins já perdiam R$ 0,02 do contratado. */
        var F = function (x) {
          if (x >= 99.9999) return L.precoTotal;
          if (x <= 0.0001) return 0;
          return A0.valor(L.quantidade * x / 100 * L.precoUnit, modo);
        };
        var bruto = F(ant + p) - F(ant);
        /* no modo "nenhum" NADA se arredonda — forçar centavos criaria a
           diferença que o próprio critério do orçamento proíbe */
        var valor = (modo === "nenhum") ? bruto : Math.round(bruto * 100) / 100;
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

    /* ===== O REGIME DOS ITENS, sem a declaração do orçamento =====
     *
     * ⚠ `orc.desonerado` NÃO SERVE para escolher o analítico. Ele é a INTENÇÃO
     *   de quem montou (o wizard grava `orc.desonerado = true` sempre que os
     *   encargos ficam no padrão, e o padrão é "desonerado"), enquanto os
     *   preços vêm da base que a pessoa realmente usou — a SINAPI do pacote,
     *   que é NÃO desonerada. Confiar na declaração faria a maioria dos
     *   orçamentos pedir um analítico desonerado que não existe e ficar sem
     *   detalhamento nenhum.
     *
     * Aqui só valem os FATOS: o que cada item gravou da base de onde veio.
     * Devolve true, false, "misto" ou null (nenhum item declara — orçamento
     * antigo, ou tudo lançado à mão).
     * =================================================================== */
    regimeDosItens: function (orc) {
      var des = false, one = false;
      Util.arr(orc && orc.etapas).forEach(function (e) {
        Util.arr(e.itens).forEach(function (it) {
          if (it.desonerado === true) des = true;
          else if (it.desonerado === false) one = true;
        });
      });
      if (des && one) return "misto";
      if (des) return true;
      if (one) return false;
      return null;
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
        return { codigo: e.codigo, nome: e.nome, qtdItens: Util.arr(e.itens).length, custoDireto: 0, precoVenda: 0, peso: 0, opcional: !!e.opcional };
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
          subEtapa: L.subEtapaNome || "",
          numero: L.numero,
          origem: L.origem, codigo: L.codigo, descricao: L.descricao,
          // unidade JA formatada p/ o documento; a crua fica em unidadeFonte
          unidade: Util.unidadeDe(L.unidade, orc), unidadeFonte: L.unidade,
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
      var head = ["Item", "Etapa", "Sub etapa", "Origem", "Codigo", "Descricao", "Unid", "Qtd", "Custo Unit", "Custo Total", "Preco Unit", "Preco Total"];
      var rows = [head.join(";")];
      this.analitico(orc).forEach(function (l) {
        rows.push([
          l.numero, '"' + l.etapa + '"', '"' + (l.subEtapa || "") + '"', l.origem, l.codigo, '"' + l.descricao + '"', l.unidade,
          Util.fmtNum(l.quantidade, 2), n(l.custoUnitario), n(l.custoTotal),
          n(l.precoUnitario), n(l.precoVenda)
        ].join(";"));
      });
      rows.push("");
      rows.push(["CUSTO DIRETO", "", "", "", "", "", "", "", "", n(c.custoDireto), "", ""].join(";"));
      // com BDI apartado a soma das linhas é o custo: o BDI PRECISA aparecer como
      // linha própria, senão o arquivo não fecha consigo mesmo
      if (!c.bdiNoPU) rows.push(["BDI " + Util.fmtNum(c.pct, 2) + "%", "", "", "", "", "", "", "", "", "", "", n(c.bdiValor)].join(";"));
      rows.push(["PRECO DE VENDA", "", "", "", "", "", "", "", "", "", "", n(c.precoVenda)].join(";"));
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
      var mesesPedido = meses != null && meses !== "";
      meses = parseInt(meses || orc.cronogramaMeses || 6, 10);
      if (meses < 1) meses = 1;
      var sint = this.sintetico(orc);
      var total = sint.reduce(function (s, e) { return s + e.precoVenda; }, 0) || 1;

      var etapas = [], cum = 0, base = "proporcional", rotulos = null, estouro = 0;

      /* ⚠ O DESEMBOLSO SEGUE O GANTT quando existe um. A régua abaixo (a
       * antiga, que continua de reserva) fatia o valor pela ORDEM e pelo PESO
       * das etapas, ignorando quanto cada uma dura: uma estrutura de 350 dias e
       * uma limpeza de 6 recebiam fatia do mesmo tamanho. O resultado punha
       * dinheiro em mês sem serviço e deslocava o mês de pico — e é justamente
       * este número que o cliente usa para planejar o caixa dele.
       * O fallback fica porque orçamento sem etapas datadas (rede circular,
       * módulo ausente) ainda precisa de uma linha do tempo; `base` diz qual
       * régua respondeu, para a tela não afirmar o que não sabe. */
      var porGantt = null, rG = null;
      try {
        if (typeof Cronograma !== "undefined" && Cronograma.estimar && Cronograma.periodos && Util.arr(orc && orc.etapas).length) {
          rG = Cronograma.estimar(orc);
          if (rG && rG.totalDias > 0 && !rG.temCiclo && rG.etapas.length === sint.length) {
            var vals = {};
            rG.etapas.forEach(function (e, i) { vals[e.id] = sint[i].precoVenda; });
            porGantt = Cronograma.periodos(rG, { valores: vals });
          }
        }
      } catch (e) { porGantt = null; }

      if (porGantt && porGantt.lista.length) {
        base = "gantt";
        var nG = porGantt.lista.length;
        /* ⚠ O PRAZO PEDIDO CONTINUA MANDANDO NO Nº DE COLUNAS. Numa 1ª versão
         * o número de meses passou a vir só do Gantt, e o campo "Prazo (meses)"
         * da tela virou enfeite: a pessoa digitava 6, via 23 colunas e não
         * tinha como saber por quê. Controle que não controla é pior que
         * controle nenhum. Aqui, quando o prazo foi TRAVADO (ou pedido por
         * quem chamou), o eixo continua sendo o dele: o que passa do último
         * mês se acumula nele — e `estouro` conta quantos meses foram
         * dobrados, para a tela poder dizer isso em vez de esconder. */
        var pedido = (mesesPedido || orc.cronogramaMesesManual) ? meses : nG;
        meses = Math.max(1, pedido);
        estouro = Math.max(0, nG - meses);
        /* rótulo de mês/ano de verdade ("set/26"), e não "Mês 1": a coluna É
           um mês do calendário desde que a distribuição passou a seguir o
           Gantt. Pedido MAIOR que a obra continua a contagem em vez de
           imprimir travessão — coluna sem nome faz o leitor achar que faltou dado. */
        var MESR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
        var p0 = porGantt.lista[0];
        rotulos = [];
        for (var mr = 0; mr < meses; mr++) {
          var pr = porGantt.lista[mr], rot;
          if (pr) rot = pr.rotulo;
          else { var dRef = new Date(p0.ano, p0.mes + mr, 1); rot = MESR[dRef.getMonth()] + "/" + String(dRef.getFullYear()).slice(2); }
          rotulos.push(mr === meses - 1 && estouro ? rot + "+" : rot);
        }
        /* uma linha por etapa: a distribuição por etapa sai da MESMA passada
           (`porEtapa`). Chamar `periodos` uma vez por etapa custava N+2
           estimativas de CPM numa obra de 30 etapas — a aba do orçamento
           travava por segundos a cada render. */
        sint.forEach(function (e, i) {
          var col = (porGantt.porEtapa[rG.etapas[i].id] || []).slice();
          while (col.length < meses) col.push(0);
          if (col.length > meses) {   // o excedente se acumula no último mês visível
            var resto = 0;
            for (var q = meses; q < col.length; q++) resto += col[q];
            col = col.slice(0, meses);
            col[meses - 1] += resto;
          }
          etapas.push({ codigo: e.codigo, nome: e.nome, total: e.precoVenda, meses: col });
        });
      } else {
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
      }

      var totaisMes = [], acum = [], soma = 0;
      for (var m2 = 0; m2 < meses; m2++) {
        var tm = etapas.reduce(function (s, e) { return s + (e.meses[m2] || 0); }, 0);
        soma += tm; totaisMes.push(tm); acum.push((soma / total) * 100);
      }
      return { meses: meses, etapas: etapas, totaisMes: totaisMes, acumPct: acum, total: total,
        base: base, rotulos: rotulos, estouro: estouro,
        frentes: porGantt ? porGantt.lista.slice(0, meses).map(function (p) { return p.frentes; }) : null };
    },

    /* ==================================================================
     * GESTÃO DA CARTEIRA (fases 1 e 2 do PLANO-GESTAO-ORCAMENTOS.md)
     * Funções PURAS: a tela só desenha o que sai daqui. Nenhuma delas
     * grava nada — filtro é estado de tela, nunca do orçamento.
     * ================================================================== */

    /* Prazo de elaboração. Só existe quando o usuário PEDIU controle:
     * `config.controlarPrazo`. Semáforo que ninguém ligou vira vermelho de
     * enfeite, e vermelho de enfeite ensina a ignorar alerta de verdade.
     * `hoje` entra por parâmetro — data do sistema dentro de função pura
     * é teste que quebra sozinho na virada do dia. */
    prazoDe: function (orc, hoje) {
      var cfg = (orc && orc.config) || {};
      var data = String(cfg.prazoEntrega || "").slice(0, 10);
      if (!cfg.controlarPrazo || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return { controla: false };
      var d0 = new Date(String(hoje || "").slice(0, 10) + "T12:00:00");
      if (isNaN(d0.getTime())) d0 = new Date();
      var d1 = new Date(data + "T12:00:00");
      var dias = Math.round((d1 - new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), 12)) / 86400000);
      var estado = dias < 0 ? "vencido" : (dias === 0 ? "hoje" : (dias <= 3 ? "proximo" : "ok"));
      return { controla: true, data: data, dias: dias, estado: estado };
    },

    /* Tempo de elaboração: do nascimento à última edição. É duração de
     * calendário, e o rótulo diz isso — não fingimos medir esforço com
     * dado que não temos (esforço real é a fase 3 do plano). */
    tempoElaboracao: function (orc) {
      var ini = new Date(String((orc && orc.criadoEm) || "")), fim = new Date(String((orc && orc.atualizadoEm) || ""));
      var trab = Array.isArray(orc && orc.diasEditados) ? orc.diasEditados.length : null;
      if (isNaN(ini.getTime()) || isNaN(fim.getTime())) return { dias: null, diasTrabalhados: trab };
      var dias = Math.max(0, Math.round((fim - ini) / 86400000));
      return { dias: dias, horas: Math.max(0, Math.round((fim - ini) / 3600000)), diasTrabalhados: trab };
    },

    /* FASE 3 — registra o DIA em que o usuário mexeu. Guarda a data (não o
     * horário): o que interessa é "em quantos dias este orçamento foi
     * trabalhado", e data é 10 bytes contra um carimbo por clique.
     * Idempotente: salvar 50 vezes no mesmo dia conta 1.
     * O teto de 400 existe para o campo não virar um vetor infinito num
     * orçamento que acompanha uma obra por anos — perder o dia 401 não muda
     * nenhuma decisão, e um blob que só cresce, sim. */
    marcarDiaEdicao: function (orc, agoraISO) {
      if (!orc) return null;
      var dia = String(agoraISO || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
      if (!Array.isArray(orc.diasEditados)) orc.diasEditados = [];
      if (orc.diasEditados.indexOf(dia) >= 0) return orc.diasEditados.length;
      orc.diasEditados.push(dia);
      if (orc.diasEditados.length > 400) orc.diasEditados = orc.diasEditados.slice(-400);
      return orc.diasEditados.length;
    },

    /* ==================================================================
     * MEMORIAL DE CÁLCULO — calculadoras e leitura da descrição
     *
     * A memória já existia (`item.memoriaCalculo`, texto livre, sai no laudo).
     * O que faltava era COMO chegar no número: o orçamentista fazia a conta
     * fora e digitava só o resultado — e número sem conta não justifica
     * metragem nenhuma numa auditoria.
     *
     * ⚠ A MEMÓRIA MOSTRA A CONTA, não o resultado. É esse texto que dá ao
     * orçamentista confiança para lançar, que é o objetivo declarado.
     * ================================================================== */
    FORMAS_MEMORIA: {
      retangulo: { rotulo: "Área retangular", unidade: "m2", campos: [
        { id: "comprimento", rotulo: "Comprimento (m)" },
        { id: "altura", rotulo: "Altura / largura (m)" },
        { id: "repeticoes", rotulo: "Repetições", padrao: 1 }
      ] },
      areaDesconto: { rotulo: "Área com descontos", unidade: "m2", campos: [
        { id: "comprimento", rotulo: "Comprimento (m)" },
        { id: "altura", rotulo: "Altura (m)" },
        { id: "repeticoes", rotulo: "Repetições", padrao: 1 },
        { id: "descontos", rotulo: "Descontar vãos (m²)", padrao: 0 }
      ] },
      volume: { rotulo: "Volume", unidade: "m3", campos: [
        { id: "area", rotulo: "Área (m²)" },
        { id: "espessura", rotulo: "Espessura (m)" }
      ] },
      linear: { rotulo: "Comprimento linear", unidade: "m", campos: [
        { id: "comprimento", rotulo: "Comprimento de cada trecho (m)" },
        { id: "repeticoes", rotulo: "Quantos trechos", padrao: 1 }
      ] },
      contagem: { rotulo: "Contagem", unidade: "un", campos: [
        { id: "itens", rotulo: "Quantos" },
        { id: "repeticoes", rotulo: "Por ambiente / pavimento", padrao: 1 }
      ] },
      /* ===== v1.1.226 — as formas que faltavam =====
         As cinco de cima cobriam o caso simples. Estas cobrem o que aparece
         no dia a dia de quem orça e obrigava a fazer a conta na calculadora
         do celular e digitar só o resultado — que é exatamente como memória
         de cálculo deixa de existir. */
      perimetro: { rotulo: "Perímetro de ambiente", unidade: "m", campos: [
        { id: "comprimento", rotulo: "Comprimento do ambiente (m)" },
        { id: "largura", rotulo: "Largura do ambiente (m)" },
        { id: "repeticoes", rotulo: "Quantos ambientes", padrao: 1 }
      ] },
      paredeVaos: { rotulo: "Parede com vãos (portas/janelas)", unidade: "m2", campos: [
        { id: "comprimento", rotulo: "Comprimento da parede (m)" },
        { id: "altura", rotulo: "Pé-direito (m)" },
        { id: "repeticoes", rotulo: "Quantas paredes iguais", padrao: 1 },
        { id: "portas", rotulo: "Quantas portas", padrao: 0 },
        { id: "portaL", rotulo: "Largura da porta (m)", padrao: 0.8 },
        { id: "portaA", rotulo: "Altura da porta (m)", padrao: 2.1 },
        { id: "janelas", rotulo: "Quantas janelas", padrao: 0 },
        { id: "janelaL", rotulo: "Largura da janela (m)", padrao: 1.2 },
        { id: "janelaA", rotulo: "Altura da janela (m)", padrao: 1.2 }
      ] },
      duasFaces: { rotulo: "Serviço nas duas faces (chapisco/reboco)", unidade: "m2", campos: [
        { id: "area", rotulo: "Área de uma face (m²)" },
        { id: "faces", rotulo: "Quantas faces", padrao: 2 }
      ] },
      pintura: { rotulo: "Pintura por demãos", unidade: "m2", campos: [
        { id: "area", rotulo: "Área a pintar (m²)" },
        { id: "demaos", rotulo: "Quantas demãos", padrao: 2 }
      ] },
      escavacao: { rotulo: "Escavação / vala", unidade: "m3", campos: [
        { id: "comprimento", rotulo: "Comprimento da vala (m)" },
        { id: "largura", rotulo: "Largura (m)" },
        { id: "profundidade", rotulo: "Profundidade (m)" },
        { id: "repeticoes", rotulo: "Quantas valas", padrao: 1 }
      ] },
      telhado: { rotulo: "Telhado (área inclinada)", unidade: "m2", campos: [
        { id: "area", rotulo: "Área em planta (m²)" },
        { id: "inclinacao", rotulo: "Inclinação (%)", padrao: 30 }
      ] },
      perdas: { rotulo: "Área/volume com perdas", unidade: "m2", campos: [
        { id: "area", rotulo: "Quantidade líquida" },
        { id: "perda", rotulo: "Perda (%)", padrao: 10 }
      ] }
    },

    /* Calcula e REDIGE. Devolve { ok, qtd, unidade, texto } ou { ok:false }. */
    calcularMemoria: function (forma, d) {
      var F = this.FORMAS_MEMORIA[forma];
      if (!F) return { ok: false, erro: "Forma de cálculo desconhecida." };
      d = d || {};
      var n = function (k, pad) { var v = Util.num(d[k]); return v > 0 ? v : (pad != null ? pad : 0); };
      var fm = function (v, casas) { return Util.fmtNum(v, casas == null ? 2 : casas); };
      var qtd = 0, texto = "";
      var rep = n("repeticoes", 1);
      if (forma === "retangulo" || forma === "areaDesconto") {
        var c = n("comprimento"), a = n("altura"), desc = n("descontos", 0);
        if (!(c > 0 && a > 0)) return { ok: false, erro: "Informe comprimento e altura." };
        var bruta = c * a * rep;
        qtd = Math.max(0, bruta - desc);
        texto = fm(c) + " m × " + fm(a) + " m" + (rep > 1 ? " × " + fm(rep, 0) + " (repetições)" : "") +
          " = " + fm(bruta) + " m²" + (desc > 0 ? "\nDescontos de vãos: −" + fm(desc) + " m²\nTotal: " + fm(qtd) + " m²" : "");
      } else if (forma === "volume") {
        var ar = n("area"), esp = n("espessura");
        if (!(ar > 0 && esp > 0)) return { ok: false, erro: "Informe área e espessura." };
        qtd = ar * esp;
        texto = fm(ar) + " m² × " + fm(esp, 3) + " m (espessura) = " + fm(qtd, 3) + " m³";
      } else if (forma === "linear") {
        var cl = n("comprimento");
        if (!(cl > 0)) return { ok: false, erro: "Informe o comprimento." };
        qtd = cl * rep;
        texto = fm(cl) + " m" + (rep > 1 ? " × " + fm(rep, 0) + " trecho(s)" : "") + " = " + fm(qtd) + " m";
      } else if (forma === "perimetro") {
        var pc = n("comprimento"), pl = n("largura");
        if (!(pc > 0 && pl > 0)) return { ok: false, erro: "Informe comprimento e largura do ambiente." };
        var umP = 2 * (pc + pl);
        qtd = umP * rep;
        texto = "Perímetro = 2 × (" + fm(pc) + " m + " + fm(pl) + " m) = " + fm(umP) + " m" +
          (rep > 1 ? "\n" + fm(umP) + " m × " + fm(rep, 0) + " ambiente(s) = " + fm(qtd) + " m" : "");
      } else if (forma === "paredeVaos") {
        /* a conta que mais se faz em obra e a que mais se erra na pressa:
           área bruta menos os vãos, com os vãos DISCRIMINADOS um a um — é o
           detalhe que o fiscal cobra e que o orçamentista não lembra depois */
        var wc = n("comprimento"), wa = n("altura");
        if (!(wc > 0 && wa > 0)) return { ok: false, erro: "Informe o comprimento e o pé-direito da parede." };
        var nP = n("portas", 0), pL = n("portaL", 0.8), pA = n("portaA", 2.1);
        var nJ = n("janelas", 0), jL = n("janelaL", 1.2), jA = n("janelaA", 1.2);
        var brutaW = wc * wa * rep;
        var areaP = nP > 0 ? nP * pL * pA : 0, areaJ = nJ > 0 ? nJ * jL * jA : 0;
        qtd = Math.max(0, brutaW - areaP - areaJ);
        texto = "Área bruta: " + fm(wc) + " m × " + fm(wa) + " m" +
          (rep > 1 ? " × " + fm(rep, 0) + " parede(s)" : "") + " = " + fm(brutaW) + " m²";
        if (nP > 0) texto += "\nPortas: " + fm(nP, 0) + " × (" + fm(pL) + " × " + fm(pA) + ") = −" + fm(areaP) + " m²";
        if (nJ > 0) texto += "\nJanelas: " + fm(nJ, 0) + " × (" + fm(jL) + " × " + fm(jA) + ") = −" + fm(areaJ) + " m²";
        if (nP > 0 || nJ > 0) texto += "\nÁrea líquida: " + fm(qtd) + " m²";
      } else if (forma === "duasFaces") {
        var af = n("area"), nf = n("faces", 2);
        if (!(af > 0)) return { ok: false, erro: "Informe a área de uma face." };
        qtd = af * nf;
        texto = fm(af) + " m² × " + fm(nf, 0) + " face(s) = " + fm(qtd) + " m²";
      } else if (forma === "pintura") {
        var ap = n("area"), dm = n("demaos", 2);
        if (!(ap > 0)) return { ok: false, erro: "Informe a área a pintar." };
        /* ⚠ DEMÃO NÃO MULTIPLICA ÁREA. A composição de pintura da SINAPI já
           traz o consumo das demãos no coeficiente da tinta — multiplicar aqui
           cobraria a mesma parede duas vezes. A quantidade é a área; as demãos
           entram como registro. */
        qtd = ap;
        texto = fm(ap) + " m² (" + fm(dm, 0) + " demão(s))" +
          "\nA quantidade é a ÁREA: o consumo das demãos já está no coeficiente da tinta na composição.";
      } else if (forma === "escavacao") {
        var ec = n("comprimento"), el = n("largura"), ep = n("profundidade");
        if (!(ec > 0 && el > 0 && ep > 0)) return { ok: false, erro: "Informe comprimento, largura e profundidade." };
        var umaV = ec * el * ep;
        qtd = umaV * rep;
        texto = fm(ec) + " m × " + fm(el) + " m × " + fm(ep) + " m = " + fm(umaV, 3) + " m³" +
          (rep > 1 ? "\n" + fm(umaV, 3) + " m³ × " + fm(rep, 0) + " vala(s) = " + fm(qtd, 3) + " m³" : "");
      } else if (forma === "telhado") {
        var at = n("area"), inc = n("inclinacao", 30);
        if (!(at > 0)) return { ok: false, erro: "Informe a área em planta." };
        /* área real do plano inclinado = área em planta × √(1 + i²) */
        var i = inc / 100, fator = Math.sqrt(1 + i * i);
        qtd = at * fator;
        texto = "Área em planta: " + fm(at) + " m²\nInclinação " + fm(inc, 0) + "% → fator √(1 + " +
          fm(i, 2) + "²) = " + fm(fator, 4) + "\nÁrea real do telhado: " + fm(at) + " × " + fm(fator, 4) + " = " + fm(qtd) + " m²";
      } else if (forma === "perdas") {
        var aq = n("area"), pp = n("perda", 10);
        if (!(aq > 0)) return { ok: false, erro: "Informe a quantidade líquida." };
        qtd = aq * (1 + pp / 100);
        texto = "Líquido: " + fm(aq) + "\nPerda de " + fm(pp, 1) + "%: +" + fm(aq * pp / 100) +
          "\nTotal com perda: " + fm(qtd);
      } else {
        var it = n("itens");
        if (!(it > 0)) return { ok: false, erro: "Informe a quantidade." };
        qtd = it * rep;
        texto = fm(it, 0) + (rep > 1 ? " × " + fm(rep, 0) : "") + " = " + fm(qtd, 0) + " un";
      }
      return { ok: true, qtd: Math.round(qtd * 10000) / 10000, unidade: F.unidade, texto: texto };
    },

    /* AGENTE DE QUANTITATIVO — lê a descrição em português e propõe a conta.
     *
     * ⚠ RODA LOCAL, sem rede. É determinístico e conferível: a mesma frase dá
     * sempre a mesma conta, e o teste consegue provar. O backend de IA entra
     * depois como reforço para frase que este parser não entende — nunca como
     * o piso, senão o recurso morre offline (obra é onde a internet falha).
     *
     * ⚠ PROPÕE, não lança. Quem confere é o orçamentista. */
    lerDescricaoQuantitativo: function (texto) {
      var t = String(texto == null ? "" : texto).toLowerCase();
      try { t = t.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
      if (t.trim().length < 3) return { ok: false, erro: "Descreva o serviço com as medidas." };
      /* números em pt-BR: 2,20 e 2.20 são o mesmo; 1.500,00 é mil e quinhentos */
      var achados = [];
      t.replace(/(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(m2|m²|m3|m³|metros? quadrados?|metros? cubicos?|metros? lineares?|metros?|ml|cm|un|unidades?|pecas?|pontos?)?/g,
        function (todo, num, uni, pos) {
          var v = num.indexOf(",") >= 0 ? num.replace(/\./g, "").replace(",", ".") : num;
          var x = parseFloat(v);
          if (!(x > 0)) return todo;
          var u = String(uni || "");
          var tipo = /m2|m²|quadrado/.test(u) ? "area" : (/m3|m³|cubico/.test(u) ? "volume"
                   : (/cm/.test(u) ? "cm" : (/un|unidade|peca|ponto/.test(u) ? "un" : (u ? "m" : ""))));
          /* `pos` (v1.1.226): a POSIÇÃO do número na frase. Sem ela, um número
             que já foi lido como CONTADOR continuava valendo como MEDIDA —
             "4 paredes de 3,20 por 2,70" calculava 4 × 3,20 em vez de
             3,20 × 2,70 × 4. O contador tem de sair da lista de medidas. */
          achados.push({ valor: x, tipo: tipo, unidade: u, pos: pos });
          return todo;
        });
      if (!achados.length) return { ok: false, erro: "Não encontrei medidas na descrição. Ex.: “alvenaria 100 m por 2,20 de altura”." };
      /* área direta: "220 m2" */
      var direta = achados.filter(function (a) { return a.tipo === "area" || a.tipo === "volume" || a.tipo === "un"; })[0];
      var lineares = achados.filter(function (a) { return a.tipo === "m" || a.tipo === ""; });

      /* ===== v1.1.226 — o que a frase diz ALÉM das medidas =====
         O parser antigo só via números. Estas leituras são o que separa
         "100 × 2,2 = 220" de uma memória que o fiscal aceita. Cada uma é uma
         pergunta que o orçamentista responderia de cabeça lendo a frase. */
      /* Todo número lido como contador é MARCADO como consumido pela posição,
         e some da lista de medidas logo abaixo. */
      var consumidos = {};
      var _int = function (re) {
        var m = t.match(re);
        if (!m) return 0;
        // posição do número dentro do trecho casado (m.index é o início do trecho)
        var desloc = m[0].indexOf(m[1]);
        consumidos[m.index + (desloc < 0 ? 0 : desloc)] = 1;
        return parseInt(m[1], 10);
      };
      // "4 paredes", "3 ambientes", "2 pavimentos", "5 trechos", "3 valas"
      var vezes = _int(/(\d+)\s*(?:x\s*)?(?:paredes?|ambientes?|comodos?|pavimentos?|andares?|trechos?|valas?|pecas?|panos?)/);
      // "2 portas", "descontando 3 janelas"
      var portas = _int(/(\d+)\s*portas?/);
      var janelas = _int(/(\d+)\s*janelas?/);
      // "duas faces", "ambos os lados", "frente e verso"
      var duasFaces = /(?:duas|2)\s*faces|ambos os lados|frente e verso|dois lados/.test(t);
      // "2 demãos", "duas demaos"
      var demaos = _int(/(\d+)\s*demaos?/) || (/duas demaos?/.test(t) ? 2 : 0);
      // "10% de perda", "perda de 15%"
      var mPerda = t.match(/(?:perda|quebra)\D{0,12}(\d+(?:[.,]\d+)?)\s*%/) || t.match(/(\d+(?:[.,]\d+)?)\s*%\s*de\s*(?:perda|quebra)/);
      var perda = mPerda ? parseFloat(String(mPerda[1]).replace(",", ".")) : 0;
      // espessura em cm ("laje de 12 cm", "contrapiso 5cm") — vira volume
      var emCm = achados.filter(function (a) { return a.tipo === "cm"; })[0];
      // a palavra manda: escavação/vala é volume, não área
      var ehEscavacao = /escavac|vala|vala|trincheira|bota-?fora|aterro/.test(t);
      var ehTelhado = /telhad|cobertura|telha/.test(t) && /inclinac|caimento|%/.test(t);
      /* serviço que corre pela BORDA do ambiente é linear, não de área. Sem
         isto, "rodapé de 2 ambientes de 5 × 4" virava 20 m² em vez de 36 m. */
      var ehPerimetro = /rodape|meia-?cana|cordao|guarda-?corpo|testeira|arremate de borda|moldura/.test(t);

      // ⚠ tira da lista de MEDIDAS tudo que já foi lido como CONTADOR
      var _vale = function (a) { return !consumidos[a.pos]; };
      achados = achados.filter(_vale);
      direta = achados.filter(function (a) { return a.tipo === "area" || a.tipo === "volume" || a.tipo === "un"; })[0];
      lineares = achados.filter(function (a) { return a.tipo === "m" || a.tipo === ""; });

      var self = this, res = null, comoLi = [];

      // 0) perímetro: serviço de borda com as duas medidas do ambiente
      if (ehPerimetro && lineares.length >= 2) {
        res = this.calcularMemoria("perimetro", { comprimento: lineares[0].valor, largura: lineares[1].valor, repeticoes: vezes || 1 });
        if (res.ok) { res.forma = "perimetro"; res.confianca = "alta";
                      comoLi.push("li como serviço de borda: a quantidade é o PERÍMETRO, não a área"); }
      }

      // 1) escavação: três medidas lineares = volume, não área
      if (!res && ehEscavacao && lineares.length >= 3) {
        res = this.calcularMemoria("escavacao", { comprimento: lineares[0].valor, largura: lineares[1].valor,
                                                  profundidade: lineares[2].valor, repeticoes: vezes || 1 });
        if (res.ok) { res.forma = "escavacao"; res.confianca = "alta"; comoLi.push("li como escavação (volume)"); }
      }
      // 2) parede com vãos — o caso mais comum e o que mais se erra
      if (!res && lineares.length >= 2 && (portas > 0 || janelas > 0)) {
        res = this.calcularMemoria("paredeVaos", { comprimento: lineares[0].valor, altura: lineares[1].valor,
                                                   repeticoes: vezes || 1, portas: portas, janelas: janelas });
        if (res.ok) { res.forma = "paredeVaos"; res.confianca = "alta";
                      comoLi.push("descontei " + (portas ? portas + " porta(s)" : "") +
                                  (portas && janelas ? " e " : "") + (janelas ? janelas + " janela(s)" : "") +
                                  " nas medidas padrão — ajuste na calculadora se forem outras"); }
      }
      // 3) dois comprimentos = área (o caso original: 100 m × 2,20 de altura)
      if (!res && lineares.length >= 2) {
        res = this.calcularMemoria("retangulo", { comprimento: lineares[0].valor, altura: lineares[1].valor, repeticoes: vezes || 1 });
        if (res.ok) { res.forma = "retangulo"; res.confianca = "alta";
                      if (vezes > 1) comoLi.push("entendi " + vezes + " repetições"); }
      }
      // 4) medida direta em m²/m³/un
      if (!res && direta) {
        var un = direta.tipo === "area" ? "m2" : (direta.tipo === "volume" ? "m3" : "un");
        res = { ok: true, qtd: direta.valor, unidade: un, forma: "direta", confianca: "alta",
                texto: Util.fmtNum(direta.valor, 2) + " " + (un === "m2" ? "m²" : (un === "m3" ? "m³" : "un")) + " (informado na descrição)" };
      }
      // 5) um comprimento só
      if (!res && lineares.length === 1) {
        res = this.calcularMemoria("linear", { comprimento: lineares[0].valor, repeticoes: vezes || 1 });
        if (res.ok) { res.forma = "linear"; res.confianca = vezes > 1 ? "alta" : "media"; }
      }
      if (!res || !res.ok) return { ok: false, erro: "Entendi as medidas, mas não a forma do cálculo. Use a calculadora abaixo." };

      /* ===== camadas que se aplicam DEPOIS da conta base =====
         A ordem importa e é a da obra: primeiro a área, depois as faces,
         depois a espessura (que troca a unidade), por último a perda. */
      var aplicar = function (forma, dados, rotulo) {
        var r2 = self.calcularMemoria(forma, dados);
        if (!r2.ok) return;
        r2.texto = res.texto + "\n\n" + rotulo + "\n" + r2.texto;
        r2.forma = res.forma + "+" + forma;
        r2.confianca = res.confianca;
        res = r2;
      };
      if (duasFaces && res.unidade === "m2") aplicar("duasFaces", { area: res.qtd, faces: 2 }, "Nas duas faces:");
      if (emCm && res.unidade === "m2") {
        aplicar("volume", { area: res.qtd, espessura: emCm.valor / 100 },
                "Espessura de " + Util.fmtNum(emCm.valor, 0) + " cm (" + Util.fmtNum(emCm.valor / 100, 3) + " m):");
        comoLi.push("converti " + Util.fmtNum(emCm.valor, 0) + " cm em espessura — o resultado virou m³");
      }
      if (ehTelhado && res.unidade === "m2") {
        var mInc = t.match(/(\d+(?:[.,]\d+)?)\s*%/);
        if (mInc) aplicar("telhado", { area: res.qtd, inclinacao: parseFloat(String(mInc[1]).replace(",", ".")) }, "Correção da inclinação:");
      }
      if (perda > 0) aplicar("perdas", { area: res.qtd, perda: perda }, "Perda declarada na descrição:");
      if (demaos > 1 && res.unidade === "m2") {
        res.texto += "\n\n" + demaos + " demãos: a quantidade continua sendo a ÁREA — o consumo das demãos já está no coeficiente da tinta.";
        comoLi.push("as demãos NÃO multiplicaram a área (o coeficiente da tinta já as considera)");
      }
      if (comoLi.length) res.comoLi = comoLi;
      return res;
    },

    /* Sobe a quantidade calculada para o item, junto com a memória que a
     * justifica. As duas coisas andam juntas de propósito: número sem conta é
     * o que ninguém consegue defender depois, e é o que a Lei 14.133 cobra.
     * Devolve { ok, erro? } — recusa unidade incompatível em vez de converter
     * no chute (m³ entrando em item de m² multiplica preço em silêncio). */
    aplicarMemoriaQuantidade: function (orc, etapaId, itemId, r) {
      if (!r || !r.ok || !(r.qtd > 0)) return { ok: false, erro: "Não há quantidade calculada para subir." };
      var etapa = this._etapa(orc, etapaId);
      var it = etapa && (etapa.itens || []).filter(function (x) { return x.id === itemId; })[0];
      if (!it) return { ok: false, erro: "Item não encontrado." };
      if (it.unidade && r.unidade && !this.unidadeCompativel(it.unidade, r.unidade)) {
        return { ok: false, erro: "A conta deu " + Util.fmtNum(r.qtd, 2) + " " + Util.unidadeExibir(r.unidade) +
                 ", mas este item é em " + Util.unidadeExibir(it.unidade) + ". Ajuste a descrição ou a unidade do item." };
      }
      it.quantidade = Util.num(r.qtd);
      delete it.qtdPendente;
      if (r.texto) it.memoriaCalculo = String(r.texto);
      return { ok: true, qtd: it.quantidade };
    },

    /* Itens que entraram sem quantidade e continuam esperando. Espelha o
     * itensSemPreco que já existe — é o que a tela usa para avisar antes de
     * alguém mandar a proposta com um item valendo zero. */
    itensSemQuantidade: function (orc) {
      var fora = [];
      ((orc && orc.etapas) || []).forEach(function (et) {
        (et.itens || []).forEach(function (it) {
          if (it.qtdPendente || !(Util.num(it.quantidade) > 0)) fora.push({ etapa: et, item: it });
        });
      });
      return fora;
    },

    /* A unidade proposta bate com a do item? Divergência aqui multiplica preço
     * sem ninguém perceber — m³ lançado onde o item é m² passa despercebido. */
    unidadeCompativel: function (unidadeItem, unidadeCalc) {
      var k = function (u) {
        return (typeof Util !== "undefined" && Util.unidadeChave) ? Util.unidadeChave(u) : String(u || "").toLowerCase();
      };
      return k(unidadeItem) === k(unidadeCalc);
    },

    /* ==================================================================
     * COMPOSIÇÃO POR CATEGORIA (MO × MAT+EQ)
     * Quem faz empreitada só de mão de obra tinha de refazer a composição na
     * mão. O dado já estava no item: custoMO, custoMAT e custoEQ vêm
     * separados da base e alimentam a curva. Escolher o modo NÃO recalcula
     * nada da base — escolhe QUAL das parcelas vira o custo unitário. Por
     * isso é reversível: as três parcelas ficam intactas no item.
     * ================================================================== */
    MODOS_CUSTO: {
      total: { rotulo: "Completa", curto: "", ajuda: "Mão de obra + material + equipamento" },
      mo: { rotulo: "Só mão de obra", curto: "só MO", ajuda: "Empreitada de mão de obra: o material fica por conta do contratante" },
      matEq: { rotulo: "Só material e ferramental", curto: "só MAT+EQ", ajuda: "Fornecimento: a mão de obra fica por conta do contratante" }
    },

    /* Quanto o item vale em cada modo. Puro. */
    parcelasDe: function (item) {
      var it = item || {};
      var mo = Util.num(it.custoMO), mat = Util.num(it.custoMAT), eq = Util.num(it.custoEQ);
      return {
        total: Util.num(it.custoBase != null ? it.custoBase : it.custoUnitario),
        mo: mo, matEq: mat + eq, temBreakdown: (mo + mat + eq) > 0
      };
    },

    /* Aplica o modo NO ITEM. Devolve { ok } ou { ok:false, erro }.
     * ⚠ Item de base que não publica a separação (MO/MAT/EQ zerados) não pode
     * virar item de R$ 0,00 calado — a recusa é explícita e diz o motivo. */
    aplicarModoCusto: function (item, modo) {
      if (!item) return { ok: false, erro: "Item inválido." };
      modo = this.MODOS_CUSTO[modo] ? modo : "total";
      var p = this.parcelasDe(item);
      /* guarda o cheio na PRIMEIRA troca: é o que permite voltar */
      if (item.custoBase == null) item.custoBase = Util.num(item.custoUnitario);
      if (modo !== "total" && !p.temBreakdown) {
        return { ok: false, erro: "Esta base não publica a separação entre mão de obra e material neste item — não dá para lançar só uma parte sem inventar número." };
      }
      var novo = modo === "mo" ? p.mo : (modo === "matEq" ? p.matEq : Util.num(item.custoBase));
      if (modo !== "total" && !(novo > 0)) {
        return { ok: false, erro: "Neste item a parcela escolhida é zero — lançar assim seria um item de R$ 0,00 sem explicação." };
      }
      item.modoCusto = modo;
      item.custoUnitario = novo;
      return { ok: true, valor: novo };
    },

    /* FASE 5 — os números que o dono olha. Conversão conta DOCUMENTO, não
     * evento: um orçamento enviado três vezes é um enviado só. */
    indicadoresCarteira: function (orcamentos, hoje, diasParado) {
      var arr = Array.isArray(orcamentos) ? orcamentos : [];
      var lim = Number(diasParado) > 0 ? Number(diasParado) : 15;
      var d0 = new Date(String(hoje || "").slice(0, 10) + "T12:00:00");
      if (isNaN(d0.getTime())) d0 = new Date();
      /* ⚠ AQUI HAVIA UM NÚMERO QUE MEDIA OUTRA COISA. "Enviados" contava o
         orçamento mandado para APROVAÇÃO INTERNA (`historicoAprovacao` com
         ação "enviar") e "aprovados" contava o aval do gestor — então a
         "conversão" dizia quanto do que o orçamentista fez o chefe aprovou,
         e não quanto do que foi ao CLIENTE virou obra. Numa empresa que não
         usa aprovação interna (a maioria), o painel mostrava conversão zero
         para sempre; numa que usa, mostrava 100% sem nenhuma venda.
         Agora o funil é o comercial: enviada ao cliente → aceita/recusada
         (js/proposta.js registra). Os números da aprovação interna continuam
         saindo, com o nome do que são. */
      var enviadas = 0, aceitas = 0, recusadas = 0, aprovados = 0, enviadosAprov = 0;
      var parados = [], semResposta = [];
      arr.forEach(function (o) {
        var hist = Util.arr(o && o.historicoAprovacao);
        if (hist.some(function (h) { return h && h.acao === "enviar"; })) enviadosAprov++;
        var est = "rascunho";
        try { if (typeof Aprovacao !== "undefined") est = Aprovacao.estadoDe(o); } catch (e) {}
        if (est === "aprovado") aprovados++;

        var envio = String((o && o.propostaEm) || "").slice(0, 10);
        var resp = (o && o.propostaResposta) || {};
        var rEst = String(resp.estado || "");
        if (envio) {
          enviadas++;
          if (rEst === "aceita") aceitas++;
          else if (rEst === "recusada") recusadas++;
          else {
            /* enviada e calada: é ESTE o orçamento que precisa de telefonema */
            var de = new Date(envio + "T12:00:00");
            if (!isNaN(de.getTime())) {
              var dEnv = Math.floor((d0 - de) / 86400000);
              if (dEnv >= lim) semResposta.push({ orc: o, dias: dEnv });
            }
          }
        } else if (est !== "aprovado") {
          /* parado = ninguém mexeu há N dias E ainda não foi ao cliente */
          var ult = new Date(String((o && o.atualizadoEm) || ""));
          if (!isNaN(ult.getTime())) {
            var dias = Math.floor((d0 - ult) / 86400000);
            if (dias >= lim) parados.push({ orc: o, dias: dias });
          }
        }
      });
      parados.sort(function (a, b) { return b.dias - a.dias; });
      semResposta.sort(function (a, b) { return b.dias - a.dias; });
      return {
        enviadas: enviadas, aceitas: aceitas, recusadas: recusadas,
        conversao: enviadas ? (aceitas / enviadas) * 100 : null,   // null ≠ 0%: funil que não começou
        semResposta: semResposta,
        /* aprovação INTERNA — mesmo nome de antes, para quem já lia */
        enviados: enviadosAprov, aprovados: aprovados,
        parados: parados, limiteParado: lim
      };
    },

    /* FASE 4 — ORCAMENTO APROVADO NAO SE EDITA POR BAIXO.
     * O aprovado e o preco que foi ao cliente e virou contrato. Deixar
     * editar depois destroi a rastreabilidade: o documento entregue e o que
     * esta na tela passam a ser coisas diferentes, sem nada registrando a
     * troca. O caminho para consertar existe e e a REVISAO, que nasce como
     * documento proprio e deixa o aprovado intacto. */
    travadoPorAprovacao: function (orc) {
      var e = String((orc && orc.estadoAprovacao) || "").trim();
      return e === "aprovado";
    },

    /* Cria a REVISAO de um orcamento aprovado: copia o conteudo, ganha
     * numero -R1 (-R2, -R3...), volta para rascunho e aponta para a origem.
     * O original NAO e tocado - e isso que separa revisao de edicao. */
    novaRevisao: function (orc, agoraISO) {
      if (!orc) return null;
      var copia;
      try { copia = JSON.parse(JSON.stringify(orc)); } catch (e) { return null; }
      var base = String(orc.numero || ""), m = base.match(/^(.*)-R(\d+)$/);
      var raiz = m ? m[1] : base, n = m ? (parseInt(m[2], 10) || 1) + 1 : 1;
      copia.id = Util.uid("orc");
      copia.numero = raiz + "-R" + n;
      copia.revisaoDe = orc.id;
      copia.revisaoNumero = n;
      /* o ciclo recomeca: revisao nao herda carimbo de aprovacao nenhum */
      copia.estadoAprovacao = "rascunho";
      delete copia.aprovadoPor; delete copia.aprovadoEm; delete copia.aprovadoPeloProprioAutor;
      delete copia.historicoAprovacao; delete copia.revisaoMotivo; delete copia.revisaoPor; delete copia.revisaoEm;
      copia.criadoEm = agoraISO || copia.criadoEm;
      copia.atualizadoEm = agoraISO || copia.atualizadoEm;
      copia.diasEditados = [];
      return copia;
    },

    /* Faixa de valor — rótulos fixos para o filtro não mentir quando a
     * carteira muda de tamanho. */
    /* ordem de leitura do gestor: o que espera decisao primeiro */
    ORDEM_ESTADO: ["em_aprovacao", "em_revisao", "rascunho", "aprovado", "rejeitado"],

    FAIXAS: [
      { id: "ate50", rotulo: "até R$ 50 mil", min: 0, max: 50000 },
      { id: "50a200", rotulo: "R$ 50 mil a 200 mil", min: 50000, max: 200000 },
      { id: "acima200", rotulo: "acima de R$ 200 mil", min: 200000, max: Infinity }
    ],

    /* FILTRA E ORDENA a lista. Devolve { lista, kpis, clientes, tipos }.
     * `f` é estado de tela: { busca, cliente, tipo, faixa, prazo, ordem }.
     * Nunca modifica os orçamentos recebidos. */
    filtrarLista: function (orcamentos, f, hoje) {
      f = f || {};
      var self = this, arr = Array.isArray(orcamentos) ? orcamentos.slice() : [];
      var norm = function (s) {
        s = String(s == null ? "" : s).toLowerCase();
        try { s = s.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
        return s.replace(/\s+/g, " ").trim();
      };
      /* calcula UMA vez por orçamento: totais() varre etapas e itens, e
         chamar dentro de sort() faria isso N·log N vezes numa carteira
         grande — a lista é justamente quem tem muitos orçamentos */
      var meta = arr.map(function (o) {
        var t; try { t = self.totais(o); } catch (e) { t = { precoVenda: 0, qtdItens: 0, qtdEtapas: 0, bdiPercentual: 0 }; }
        /* FASE 4 — o estado sai da máquina que já existe (aprovacao.js), não
           de um campo paralelo. Sem ela carregada (Node puro do teste), tudo
           é "rascunho" — que é exatamente o default dela. */
        var est = "rascunho";
        try { if (typeof Aprovacao !== "undefined" && Aprovacao.estadoDe) est = Aprovacao.estadoDe(o); } catch (e2) {}
        return { orc: o, tot: t, prazo: self.prazoDe(o, hoje), estado: est };
      });
      var clientes = {}, tipos = {};
      meta.forEach(function (m) {
        var c = String((m.orc.cliente && m.orc.cliente.nome) || "").trim();
        if (c) clientes[c] = (clientes[c] || 0) + 1;
        var tp = String((m.orc.config && m.orc.config.categoria) || "").trim();
        if (tp) tipos[tp] = (tipos[tp] || 0) + 1;
      });
      var busca = norm(f.busca);
      var vis = meta.filter(function (m) {
        var o = m.orc;
        if (busca) {
          var alvo = norm([o.nome, o.numero, (o.cliente || {}).nome, (o.obra || {}).nome].join(" "));
          if (alvo.indexOf(busca) < 0) return false;
        }
        if (f.cliente && String((o.cliente || {}).nome || "").trim() !== f.cliente) return false;
        if (f.tipo && String((o.config || {}).categoria || "").trim() !== f.tipo) return false;
        if (f.faixa) {
          var fx = self.FAIXAS.filter(function (x) { return x.id === f.faixa; })[0];
          if (fx && !(m.tot.precoVenda >= fx.min && m.tot.precoVenda < fx.max)) return false;
        }
        if (f.estado && m.estado !== f.estado) return false;
        if (f.prazo === "avencer" && !(m.prazo.controla && m.prazo.estado !== "vencido")) return false;
        if (f.prazo === "vencidos" && !(m.prazo.controla && m.prazo.estado === "vencido")) return false;
        return true;
      });
      var ordem = f.ordem || "atualizado";
      vis.sort(function (a, b) {
        if (ordem === "valor") return b.tot.precoVenda - a.tot.precoVenda;
        if (ordem === "estado") { var oe = self.ORDEM_ESTADO;
          var ia = oe.indexOf(a.estado), ib = oe.indexOf(b.estado);
          if (ia !== ib) return ia - ib; }
        if (ordem === "nome") return String(a.orc.nome || "").localeCompare(String(b.orc.nome || ""), "pt-BR");
        if (ordem === "prazo") {
          /* sem prazo controlado vai para o FIM: quem ligou o controle quer
             ver os dele primeiro, não uma lista embaralhada com os outros */
          var pa = a.prazo.controla ? a.prazo.dias : Infinity;
          var pb = b.prazo.controla ? b.prazo.dias : Infinity;
          if (pa !== pb) return pa - pb;
        }
        return String(b.orc.atualizadoEm || "").localeCompare(String(a.orc.atualizadoEm || ""));
      });
      var soma = vis.reduce(function (s, m) { return s + m.tot.precoVenda; }, 0);
      return {
        lista: vis,
        total: meta.length,
        kpis: {
          qtd: vis.length,
          carteira: soma,
          medio: vis.length ? soma / vis.length : 0,
          aVencer: meta.filter(function (m) { return m.prazo.controla && m.prazo.estado !== "vencido"; }).length,
          vencidos: meta.filter(function (m) { return m.prazo.controla && m.prazo.estado === "vencido"; }).length,
          comControle: meta.filter(function (m) { return m.prazo.controla; }).length,
          /* carteira por estado: o gestor quer saber quanto esta parado esperando
             aprovacao, nao so quantos orcamentos existem */
          porEstado: meta.reduce(function (acc, m) {
            var e = acc[m.estado] || { qtd: 0, valor: 0 };
            e.qtd++; e.valor += m.tot.precoVenda; acc[m.estado] = e; return acc;
          }, {})
        },
        clientes: Object.keys(clientes).sort(function (a, b) { return a.localeCompare(b, "pt-BR"); }),
        tipos: Object.keys(tipos).sort(function (a, b) { return a.localeCompare(b, "pt-BR"); })
      };
    }
  };

  global.Orcamento = Orcamento;
})(window);
