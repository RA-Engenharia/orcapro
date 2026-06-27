/* =====================================================================
 * cronograma.js — "Cérebro" do Cronograma (agente de planejamento)
 * Lê cada composição, classifica por categoria de serviço, estima o tempo
 * (produtividade por categoria + custo de mão de obra) e monta um Gantt
 * PARAMETRIZADO e EDITÁVEL (o usuário ajusta durações/parâmetros).
 * Lógica pura/testável — sem dependências externas.
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v) { return (typeof Util !== "undefined" && Util.num) ? Util.num(v) : (parseFloat(String(v == null ? 0 : v).replace(",", ".")) || 0); }
  function norm(s) { return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

  // Base de produtividade (unidades por EQUIPE-DIA) + cor p/ o Gantt
  var CATS = [
    { id: "preliminares", nome: "Preliminares/Canteiro", cor: "#64748b", prod: 20, kw: ["barracao", "tapume", "placa de obra", "ligacao provis", "mobiliz", "administ", "canteiro", "limpeza do terreno", "locacao de obra", "gabarito"] },
    { id: "demolicao", nome: "Demolição/Remoção", cor: "#9ca3af", prod: 22, kw: ["demolic", "remoc", "remoç", "retirada", "demol"] },
    { id: "terraplenagem", nome: "Movimento de terra", cor: "#a16207", prod: 28, kw: ["escava", "aterro", "reaterro", "terraplen", "bota-fora", "bota fora", "compactac", "apiloamento"] },
    { id: "fundacao", nome: "Fundação", cor: "#7c3aed", prod: 6, kw: ["fundac", "sapata", "estaca", "baldrame", "broca", "tubulao", "tubulão", "coroamento", "radier", "viga baldrame"] },
    { id: "estrutura", nome: "Estrutura/Concreto", cor: "#2563eb", prod: 9, kw: ["concreto", "pilar", "viga", "laje", "forma", "fôrma", "armadura", "aco ca", "aço ca", "armacao", "ferragem", "escoramento"] },
    { id: "alvenaria", nome: "Alvenaria", cor: "#dc2626", prod: 14, kw: ["alvenaria", "parede", "bloco ceram", "bloco de concreto", "tijolo", "vedacao", "vedação", "mureta", "muro"] },
    { id: "cobertura", nome: "Cobertura", cor: "#0891b2", prod: 24, kw: ["cobertura", "telha", "telhado", "madeiramento", "trama", "cumeeira", "rufo", "calha"] },
    { id: "impermeabilizacao", nome: "Impermeabilização", cor: "#0d9488", prod: 20, kw: ["impermeabiliz", "manta asf", "membrana", "asfaltic", "asfáltic"] },
    { id: "instalacoes", nome: "Instalações", cor: "#ca8a04", prod: 16, kw: ["instalac", "eletric", "elétric", "hidraul", "hidrául", "tubo", "eletrod", "fio", "cabo", "tomada", "ponto de", "esgoto", "agua fria", "água fria", "dreno", "quadro de", "disjuntor", "luminaria", "luminária"] },
    { id: "revestimento", nome: "Revestimentos", cor: "#16a34a", prod: 16, kw: ["revestiment", "reboco", "emboco", "emboço", "chapisco", "massa unica", "massa única", "ceramic", "cerâmic", "porcelanato", "azulejo", "piso", "contrapiso", "regulariz", "rodape", "rodapé", "soleira"] },
    { id: "esquadrias", nome: "Esquadrias", cor: "#db2777", prod: 6, kw: ["porta", "janela", "esquadria", "caixilho", "vidro", "batente", "fechadura", "portao", "portão", "guarda-corpo", "corrimao", "corrimão"] },
    { id: "loucas", nome: "Louças/Metais", cor: "#8b5cf6", prod: 8, kw: ["louca", "louça", "bacia", "lavator", "lavató", "metais", "torneira", "registro", "sifao", "sifão", "valvula", "válvula", "cuba", "pia", "tanque", "ducha", "chuveiro"] },
    { id: "pintura", nome: "Pintura", cor: "#f59e0b", prod: 34, kw: ["pintura", "tinta", "textura", "massa corrida", "selador", "verniz", "esmalte", "latex", "látex", "fundo prepar"] },
    { id: "limpeza", nome: "Limpeza final", cor: "#22c55e", prod: 60, kw: ["limpeza final", "limpeza geral", "limpeza permanente", "entrega da obra"] }
  ];

  var Cronograma = {
    CATS: CATS,
    DEFAULTS: { equipes: 1, diasUteisSemana: 5, custoDiaEquipe: 700, paralelismo: 0.15, dataInicio: null },

    classificar: function (desc) {
      var d = norm(desc);
      for (var i = 0; i < CATS.length; i++) { var c = CATS[i]; for (var k = 0; k < c.kw.length; k++) { if (d.indexOf(c.kw[k]) !== -1) return c; } }
      return null;
    },
    cat: function (id) { for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i]; return { id: "outros", nome: "Outros", cor: "#94a3b8", prod: 12 }; },

    // Tempo de 1 item em EQUIPE-DIAS
    estimarItem: function (it, params) {
      var cat = this.classificar(it.descricao);
      var qtd = num(it.quantidade), ed;
      if (cat && cat.prod && qtd > 0 && !/^(vb|verba|%)$/i.test(String(it.unidade || "").trim())) {
        ed = qtd / cat.prod;
      } else {
        var mo = num(it.custoMO) * qtd;
        if (!mo) mo = num(it.custoUnitario) * qtd * 0.35; // sem quebra: assume 35% MO
        ed = mo / (params.custoDiaEquipe || 700);
      }
      return { equipeDias: ed, categoria: cat ? cat.id : "outros" };
    },

    _params: function (orc, p) {
      var d = {}, k;
      for (k in this.DEFAULTS) d[k] = this.DEFAULTS[k];
      if (orc && orc.cronograma && orc.cronograma.params) for (k in orc.cronograma.params) if (orc.cronograma.params[k] != null) d[k] = orc.cronograma.params[k];
      if (p) for (k in p) if (p[k] != null) d[k] = p[k];
      return d;
    },

    addDiasUteis: function (start, n, diasSemana) {
      diasSemana = diasSemana || 5;
      var d = new Date(start.getTime()), add = 0;
      while (add < n) { d.setDate(d.getDate() + 1); var wd = d.getDay(); if (diasSemana >= 7) add++; else if (diasSemana === 6) { if (wd !== 0) add++; } else { if (wd !== 0 && wd !== 6) add++; } }
      return d;
    },

    // Estima o cronograma inteiro. Retorna etapas com duração/início/fim + datas.
    estimar: function (orc, override) {
      var params = this._params(orc, override), self = this;
      var manual = (orc.cronograma && orc.cronograma.duracoes) || {};
      var etapas = (orc.etapas || []).map(function (e) {
        var ed = 0, catCusto = {}, custo = 0;
        (e.itens || []).forEach(function (it) {
          var r = self.estimarItem(it, params); ed += r.equipeDias;
          var ct = num(it.quantidade) * num(it.custoUnitario); custo += ct;
          catCusto[r.categoria] = (catCusto[r.categoria] || 0) + ct;
        });
        var catPred = Object.keys(catCusto).sort(function (a, b) { return catCusto[b] - catCusto[a]; })[0] || "outros";
        var catO = self.cat(catPred);
        var dur = (manual[e.id] != null) ? num(manual[e.id]) : Math.max(1, Math.ceil(ed / (params.equipes || 1)));
        return { id: e.id, codigo: e.codigo, nome: e.nome, categoria: catPred, categoriaNome: catO.nome, cor: catO.cor, custo: custo, equipeDias: Math.round(ed * 10) / 10, duracao: dur, editado: manual[e.id] != null };
      });
      // sequenciamento em cascata com sobreposição (paralelismo)
      etapas.forEach(function (et, i) {
        if (i === 0) et.inicio = 0;
        else { var prev = etapas[i - 1]; var ov = Math.floor((params.paralelismo || 0) * prev.duracao); et.inicio = Math.max(0, prev.inicio + prev.duracao - ov); }
        et.fim = et.inicio + et.duracao;
      });
      var totalDias = etapas.reduce(function (m, e) { return Math.max(m, e.fim); }, 0);
      var ini = params.dataInicio ? new Date(params.dataInicio + (String(params.dataInicio).length <= 10 ? "T00:00:00" : "")) : new Date();
      etapas.forEach(function (et) { et.dataInicio = self.addDiasUteis(ini, et.inicio, params.diasUteisSemana); et.dataFim = self.addDiasUteis(ini, et.fim, params.diasUteisSemana); });
      return {
        etapas: etapas, totalDias: totalDias,
        totalSemanas: Math.max(1, Math.ceil(totalDias / (params.diasUteisSemana || 5))),
        dataInicio: ini, dataFim: self.addDiasUteis(ini, totalDias, params.diasUteisSemana), params: params
      };
    }
  };

  global.Cronograma = Cronograma;
  if (typeof module !== "undefined" && module.exports) module.exports = Cronograma;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
