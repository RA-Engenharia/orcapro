/* =====================================================================
 * epi.js — Catálogo de EPI (NR-6) para o módulo de EPI da Gestão.
 * O catálogo (tipos de EPI de obra + valor de referência + vida útil)
 * é EMBUTIDO aqui — sempre disponível offline e viaja no update de código
 * (o pacote de atualização não leva a pasta data/). O CA é específico do
 * modelo comprado — preenchido na entrega (🔎 Consultar CA online).
 * Lógica de busca é pura/testável (Node).
 * ===================================================================== */
(function (global) {
  "use strict";

  var CATALOGO = {
    atualizado: "2026-07",
    categorias: [
      ["cabeca", "Proteção da cabeça"], ["visao", "Olhos e face"], ["auditiva", "Auditiva"],
      ["respiratoria", "Respiratória"], ["maos", "Mãos e braços"], ["pes", "Pés e pernas"],
      ["tronco", "Tronco"], ["alturas", "Proteção contra quedas"], ["corpo", "Vestimenta / sinalização"]
    ],
    itens: [
      { id: "epi-cap-aba", categoria: "cabeca", nome: "Capacete de segurança aba frontal", descricao: "Capacete classe B, com suspensão e jugular, para construção civil", unidade: "un", valorRef: 22.90, vidaUtilDias: 1825, ca: "" },
      { id: "epi-cap-abatot", categoria: "cabeca", nome: "Capacete aba total", descricao: "Capacete aba total classe B, proteção contra sol e impacto", unidade: "un", valorRef: 29.90, vidaUtilDias: 1825, ca: "" },
      { id: "epi-jugular", categoria: "cabeca", nome: "Jugular / carneira para capacete", descricao: "Jugular de reposição com fixação no capacete", unidade: "un", valorRef: 6.50, vidaUtilDias: 365, ca: "" },
      { id: "epi-touca", categoria: "cabeca", nome: "Touca árabe / balaclava", descricao: "Proteção da nuca e pescoço contra sol", unidade: "un", valorRef: 12.00, vidaUtilDias: 365, ca: "" },
      { id: "epi-oculos-inc", categoria: "visao", nome: "Óculos de proteção incolor", descricao: "Óculos de segurança lente incolor antirrisco/antiembaçante", unidade: "un", valorRef: 8.90, vidaUtilDias: 365, ca: "" },
      { id: "epi-oculos-esc", categoria: "visao", nome: "Óculos de proteção fumê (solar)", descricao: "Óculos de segurança lente escura, proteção UV", unidade: "un", valorRef: 9.90, vidaUtilDias: 365, ca: "" },
      { id: "epi-oculos-ampla", categoria: "visao", nome: "Óculos ampla visão (sobrepor)", descricao: "Óculos ampla visão, uso sobre óculos de grau, respingos", unidade: "un", valorRef: 18.00, vidaUtilDias: 365, ca: "" },
      { id: "epi-protetor-facial", categoria: "visao", nome: "Protetor facial (viseira)", descricao: "Protetor facial incolor com coroa, esmerilhadeira/respingos", unidade: "un", valorRef: 24.00, vidaUtilDias: 730, ca: "" },
      { id: "epi-mascara-solda", categoria: "visao", nome: "Máscara de solda", descricao: "Máscara de solda com visor, escurecimento fixo ou automático", unidade: "un", valorRef: 45.00, vidaUtilDias: 1095, ca: "" },
      { id: "epi-plug", categoria: "auditiva", nome: "Protetor auditivo tipo plug", descricao: "Protetor auricular de inserção (plug) silicone, com cordão", unidade: "par", valorRef: 3.50, vidaUtilDias: 180, ca: "" },
      { id: "epi-concha", categoria: "auditiva", nome: "Protetor auditivo tipo concha", descricao: "Abafador de ruído tipo concha, arco ajustável", unidade: "un", valorRef: 32.00, vidaUtilDias: 1095, ca: "" },
      { id: "epi-pff1", categoria: "respiratoria", nome: "Máscara descartável PFF1", descricao: "Respirador descartável PFF1 (poeiras e névoas)", unidade: "un", valorRef: 2.80, vidaUtilDias: 30, ca: "" },
      { id: "epi-pff2", categoria: "respiratoria", nome: "Máscara descartável PFF2", descricao: "Respirador descartável PFF2 (poeiras finas, sílica)", unidade: "un", valorRef: 4.20, vidaUtilDias: 30, ca: "" },
      { id: "epi-semifacial", categoria: "respiratoria", nome: "Respirador semifacial", descricao: "Peça semifacial reutilizável para filtros (químico/mecânico)", unidade: "un", valorRef: 55.00, vidaUtilDias: 1095, ca: "" },
      { id: "epi-filtro-quimico", categoria: "respiratoria", nome: "Filtro químico (par)", descricao: "Cartucho/filtro para respirador (vapores orgânicos)", unidade: "par", valorRef: 38.00, vidaUtilDias: 90, ca: "" },
      { id: "epi-luva-raspa", categoria: "maos", nome: "Luva de raspa (couro)", descricao: "Luva de raspa cano curto, uso geral em obra", unidade: "par", valorRef: 9.90, vidaUtilDias: 60, ca: "" },
      { id: "epi-luva-vaqueta", categoria: "maos", nome: "Luva de vaqueta", descricao: "Luva de vaqueta, melhor tato para manuseio", unidade: "par", valorRef: 14.00, vidaUtilDias: 90, ca: "" },
      { id: "epi-luva-nitrilica", categoria: "maos", nome: "Luva nitrílica", descricao: "Luva revestida em nitrílica, boa aderência", unidade: "par", valorRef: 6.50, vidaUtilDias: 30, ca: "" },
      { id: "epi-luva-latex", categoria: "maos", nome: "Luva de látex", descricao: "Luva de látex natural para concreto/argamassa", unidade: "par", valorRef: 4.50, vidaUtilDias: 30, ca: "" },
      { id: "epi-luva-pigmentada", categoria: "maos", nome: "Luva tricotada pigmentada", descricao: "Luva de algodão tricotada com pigmento antiderrapante", unidade: "par", valorRef: 3.20, vidaUtilDias: 30, ca: "" },
      { id: "epi-luva-pvc", categoria: "maos", nome: "Luva de PVC", descricao: "Luva de PVC cano longo, produtos químicos/umidade", unidade: "par", valorRef: 8.00, vidaUtilDias: 90, ca: "" },
      { id: "epi-luva-anticorte", categoria: "maos", nome: "Luva anticorte", descricao: "Luva resistente ao corte (nível conforme necessidade)", unidade: "par", valorRef: 16.00, vidaUtilDias: 90, ca: "" },
      { id: "epi-mangote", categoria: "maos", nome: "Mangote de raspa", descricao: "Mangote/manga de raspa para proteção do antebraço", unidade: "par", valorRef: 15.00, vidaUtilDias: 180, ca: "" },
      { id: "epi-botina-pvc", categoria: "pes", nome: "Botina de couro bico PVC", descricao: "Botina de segurança couro, biqueira de PVC, elástico", unidade: "par", valorRef: 69.00, vidaUtilDias: 365, ca: "" },
      { id: "epi-botina-aco", categoria: "pes", nome: "Botina de couro bico de aço", descricao: "Botina de segurança couro, biqueira de aço", unidade: "par", valorRef: 89.00, vidaUtilDias: 365, ca: "" },
      { id: "epi-bota-pvc", categoria: "pes", nome: "Bota de PVC / borracha", descricao: "Bota impermeável cano longo para concreto/água", unidade: "par", valorRef: 39.00, vidaUtilDias: 365, ca: "" },
      { id: "epi-perneira", categoria: "pes", nome: "Perneira", descricao: "Perneira de segurança (proteção da canela)", unidade: "par", valorRef: 28.00, vidaUtilDias: 730, ca: "" },
      { id: "epi-avental-raspa", categoria: "tronco", nome: "Avental de raspa", descricao: "Avental de raspa para solda/esmerilhamento", unidade: "un", valorRef: 26.00, vidaUtilDias: 730, ca: "" },
      { id: "epi-avental-pvc", categoria: "tronco", nome: "Avental de PVC", descricao: "Avental impermeável de PVC", unidade: "un", valorRef: 14.00, vidaUtilDias: 365, ca: "" },
      { id: "epi-colete", categoria: "corpo", nome: "Colete refletivo", descricao: "Colete de sinalização com faixas refletivas", unidade: "un", valorRef: 15.00, vidaUtilDias: 365, ca: "" },
      { id: "epi-capa-chuva", categoria: "corpo", nome: "Capa de chuva", descricao: "Capa de chuva PVC com capuz", unidade: "un", valorRef: 22.00, vidaUtilDias: 365, ca: "" },
      { id: "epi-uniforme", categoria: "corpo", nome: "Uniforme (calça + camisa)", descricao: "Conjunto de uniforme de obra (controle de entrega)", unidade: "conj", valorRef: 65.00, vidaUtilDias: 180, ca: "" },
      { id: "epi-cinturao", categoria: "alturas", nome: "Cinturão paraquedista", descricao: "Cinturão de segurança tipo paraquedista, trabalho em altura", unidade: "un", valorRef: 95.00, vidaUtilDias: 1825, ca: "" },
      { id: "epi-talabarte-y", categoria: "alturas", nome: "Talabarte em Y com absorvedor", descricao: "Talabarte duplo (Y) com absorvedor de energia e ganchos", unidade: "un", valorRef: 120.00, vidaUtilDias: 1825, ca: "" },
      { id: "epi-talabarte-simples", categoria: "alturas", nome: "Talabarte simples", descricao: "Talabarte de posicionamento regulável", unidade: "un", valorRef: 65.00, vidaUtilDias: 1825, ca: "" },
      { id: "epi-trava-quedas", categoria: "alturas", nome: "Trava-quedas", descricao: "Trava-quedas deslizante para corda/cabo", unidade: "un", valorRef: 85.00, vidaUtilDias: 1825, ca: "" }
    ]
  };

  function norm(s) {
    s = String(s == null ? "" : s).toLowerCase();
    return s.normalize ? s.normalize("NFD").replace(/[̀-ͯ]/g, "") : s;
  }

  var Epi = {
    carregado: false,
    carregando: false,
    _itens: [],
    _cats: [],

    carregarDe: function (pacote) {
      this._itens = (pacote && pacote.itens) || [];
      this._cats = (pacote && pacote.categorias) || [];
      this.carregado = this._itens.length > 0;
      this.carregando = false;
      return this._itens.length;
    },

    // Catálogo embutido → resolve na hora (sem depender de arquivo/servidor).
    carregar: function () {
      if (this.carregado) return Promise.resolve(this._itens.length);
      return Promise.resolve(this.carregarDe(CATALOGO));
    },

    categorias: function () { return this._cats.slice(); },
    rotuloCategoria: function (id) { for (var i = 0; i < this._cats.length; i++) { if (this._cats[i][0] === id) return this._cats[i][1]; } return id || ""; },
    itens: function () { return this._itens.slice(); },
    item: function (id) { for (var i = 0; i < this._itens.length; i++) { if (this._itens[i].id === id) return this._itens[i]; } return null; },

    /* Busca por nome/descrição/categoria. opts: {categoria, max}. */
    buscar: function (texto, opts) {
      if (!this.carregado) this.carregarDe(CATALOGO);
      opts = opts || {};
      var cat = opts.categoria || null, max = opts.max || 100;
      var termos = norm(texto).split(" ").filter(Boolean), out = [];
      for (var i = 0; i < this._itens.length && out.length < max; i++) {
        var it = this._itens[i];
        if (cat && it.categoria !== cat) continue;
        if (termos.length) {
          var hay = norm(it.nome + " " + (it.descricao || "") + " " + this.rotuloCategoria(it.categoria)), ok = true;
          for (var t = 0; t < termos.length; t++) { if (hay.indexOf(termos[t]) === -1) { ok = false; break; } }
          if (!ok) continue;
        }
        out.push(it);
      }
      return out;
    },

    /* URL de consulta pública do CA — aberta no navegador (o servidor não faz scrape). */
    consultaCaUrl: function (numero) { var n = String(numero || "").replace(/\D/g, ""); return n ? "https://consultaca.com/" + n : "https://consultaca.com/"; },

    resumo: function () {
      if (!this.carregado) this.carregarDe(CATALOGO);
      var cats = {}; this._itens.forEach(function (it) { cats[it.categoria] = (cats[it.categoria] || 0) + 1; });
      return { carregado: this.carregado, total: this._itens.length, categorias: this._cats.length, porCategoria: cats };
    }
  };

  if (global) global.Epi = Epi;
  if (typeof module !== "undefined" && module.exports) module.exports = Epi;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
