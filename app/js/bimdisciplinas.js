/* =====================================================================
 * bimdisciplinas.js — DISCIPLINAS do modelador (OrçaPRO Modela).
 *
 * Pedido do Rogério (09/10/2026): a fita do modelador separa por
 * DISCIPLINA. Quem está na hidráulica vê só as ferramentas de hidráulica
 * (e as comuns a todo mundo: arquivo, vista, anotar, folhas, orçamento…),
 * sem poluição. Cada disciplina tem a SUA cor — para que, no print da tela,
 * dê para saber de longe em qual módulo de modelagem a pessoa estava.
 * O Içamento vai para Metálica & Mecânica.
 *
 * Este arquivo é o MOTOR (puro, testável em Node): o registro das
 * disciplinas (ids fixos — outras frentes usam estes ids), o mapa
 * comando → disciplinas, a escolha gravada por usuário/aparelho e as
 * perguntas que a fita faz ("este comando aparece agora?", "qual aba abre
 * quando troco para hidráulica?"). Quem desenha é o js/bimshell.js; quem
 * filtra a fita é o BimRibbon.render (js/bimribbon.js), perguntando aqui.
 *
 * REGRA QUE O TESTE COBRA: todo comando da fita tem disciplina declarada —
 * "comum" ou uma lista. Comando novo sem disciplina NÃO some da fita (na
 * tela ele aparece em todas, para ninguém perder botão), mas
 * tools/test-bimdisciplinas.js e tools/e2e-bim-disciplinas.js REPROVAM.
 * Como declarar (frentes de marcenaria, metálica e as próximas):
 *   - aba com o id de uma disciplina (ex. BimRibbon.acrescentar("marcenaria",
 *     "Marcenaria", …)) → os comandos dela são daquela disciplina sozinhos;
 *   - BimDisciplinas.declarar(["cmd-a", "cmd-b"], "metalica") — ou uma
 *     lista: declarar(["viga-x"], ["estrutura", "metalica"]) — ou "comum".
 *
 * Trava por licença: `BimPrevia.disciplina(id)` (outra frente, js/modela.js)
 * diz se a disciplina está liberada; sem essa função, tudo liberado.
 * Teste: node tools/test-bimdisciplinas.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }

  /* ---------------------------------------------------------------
   * O REGISTRO. `cor` é o fundo (aba Arquivo, selo, pílula da aba ativa)
   * e `texto` é a letra sobre ele — contraste AA (≥ 4,5:1) conferido.
   * `acento` é a cor de linha/ícone sobre a fita clara (≥ 3:1 sobre o
   * branco) e `acentoEscuro` a mesma coisa sobre a fita escura (≥ 3:1
   * sobre #383838 e sobre o vidro escuro da cara nova).
   *   civil       #B5532A × branco 4,96 · acento escuro #E8835A 4,37
   *   estrutura   #5F6B78 × branco 5,44 · #9AA7B5 4,78
   *   hidraulica  #1F6FD1 × branco 4,94 · #5AA2F0 4,39
   *   eletrica    #D99A00 × #15181d 7,26 · acento claro #B07600 3,86 · #F2B632 6,43
   *   metalica    #A3392B × branco 6,61 · #ED7A68 4,24
   *   marcenaria  #8A5A2E × branco 5,86 · #D4A373 5,18
   *   completo    #2D6A9C × branco 5,75 · #3FB5E5 5,00 (a cor da marca)
   * --------------------------------------------------------------- */
  var REGISTRO = [
    { id: "completo", nome: "Todas as disciplinas", curto: "Todas", cor: "#2D6A9C", texto: "#FFFFFF", acento: "#2D6A9C", acentoEscuro: "#3FB5E5", icone: "camadas",
      descricao: "A fita inteira, com as ferramentas de todas as disciplinas." },
    { id: "civil", nome: "Arquitetura & Civil", curto: "Civil", cor: "#B5532A", texto: "#FFFFFF", acento: "#B5532A", acentoEscuro: "#E8835A", icone: "parede",
      descricao: "Parede, piso, forro, telhado, escada, ambiente, porta, janela, alvenaria, acabamentos e terreno." },
    { id: "estrutura", nome: "Estrutura", curto: "Estrutura", cor: "#5F6B78", texto: "#FFFFFF", acento: "#5F6B78", acentoEscuro: "#9AA7B5", icone: "estrutura",
      descricao: "Concreto, fundação, armação e fôrma: pilar, viga, laje, sapata, bloco e estaca." },
    { id: "hidraulica", nome: "Hidráulica & Sanitária", curto: "Hidráulica", cor: "#1F6FD1", texto: "#FFFFFF", acento: "#1F6FD1", acentoEscuro: "#5AA2F0", icone: "link",
      descricao: "Tubos, conexões, registros, louças, ralos e caixas — água fria, quente, esgoto e pluvial." },
    { id: "eletrica", nome: "Elétrica & Dados", curto: "Elétrica", cor: "#D99A00", texto: "#15181D", acento: "#B07600", acentoEscuro: "#F2B632", icone: "vento",
      descricao: "Eletrodutos, eletrocalhas, tomadas, interruptores, quadros, luminárias e cabos." },
    { id: "metalica", nome: "Metálica & Mecânica", curto: "Metálica", cor: "#A3392B", texto: "#FFFFFF", acento: "#A3392B", acentoEscuro: "#ED7A68", icone: "guindaste",
      descricao: "Perfis de aço, chapas, ligações, galpões, peças mecânicas e o içamento." },
    { id: "marcenaria", nome: "Carpintaria & Marcenaria", curto: "Carpintaria", cor: "#8A5A2E", texto: "#FFFFFF", acento: "#8A5A2E", acentoEscuro: "#D4A373", icone: "familia",
      descricao: "Estrutura de madeira, móveis em chapa e plano de corte." }
  ];
  var COMUM = "comum";
  var PADRAO = "completo";

  /* ---------------------------------------------------------------
   * O MAPA comando → disciplinas. Comum = aparece em todas.
   * Conferido contra a fita inteira (js/bimribbon.js ABAS, NOVOS, LAYOUT_B1)
   * e contra cada `acrescentar(` dos módulos do modelador.
   * --------------------------------------------------------------- */
  var MAPA = {};
  function def(disc, ids) { ids.forEach(function (id) { MAPA[id] = disc === COMUM ? COMUM : arr(disc).length ? disc.slice() : [disc]; }); }

  /* COMUNS: arquivo, vista, anotar, folhas, render, gerenciar, orçamento, colaborar */
  def(COMUM, [
    /* Arquivo */
    "novo-projeto", "abrir-opbim", "abrir-ifc", "arquivo-obra", "exemplo", "importar-outros", "gerar-volumetria", "p3d",
    "salvar-opbim", "salvar-modelo", "exportar-ifc", "exportar-revit", "modelos", "remover-modelos",
    /* referência e tipo (todo elemento de qualquer disciplina tem nível, plano e tipo) */
    "niveis", "nivel-atual", "plano-trabalho", "editar-tipo", "combinar", "componente", "eixo",
    /* Modificar (js/bimprecisao.js FITA.modificar) */
    "mover-preciso", "copiar", "espelhar", "girar", "matriz", "snaps-editor", "alinhar", "deslocamento",
    "aparar-canto", "aparar-varios", "dividir-elemento", "fixar", "desafixar", "criar-similar", "escala",
    /* grupos, fases e opções (js/bimp10ui.js) */
    "demolir", "criar-grupo", "colar-niveis", "editar-grupo", "desagrupar",
    "fases", "filtro-fase", "opcoes-projeto", "selecionar-id", "localizar-substituir", "advertencias", "limpar-nao-usados", "vista-inicial",
    /* volume livre (peça de qualquer disciplina) */
    "extrusao", "revolucao", "varredura", "unir", "subtrair", "empurrar",
    /* Anotar */
    "medir", "area", "angulo", "snap", "limpar-medidas", "cotas-auto", "anotacao", "foto", "pranchas", "cota-alinhada",
    "identificar-categoria", "identificar-todos",
    "p7-cota-alinhada", "p7-cota-linear", "p7-cota-angular", "p7-cota-radial", "p7-cota-diametro", "p7-cota-arco",
    "p7-cota-elevacao", "p7-cota-inclinacao", "p7-tipos", "p7-texto", "p7-simbolo", "p7-nota-chave",
    "p7-linha-detalhe", "p7-regiao", "p7-mascara", "p7-componente", "p7-legenda", "p7-nuvem", "p7-revisoes",
    /* Analisar (desenho, compatibilização, tempo e custo) */
    "planta-2d", "corte-2d", "corte-tecnico", "clash", "planta", "corte", "quatro-d", "tarefas4d", "curva-s", "seis-d",
    /* Quantitativos e orçamento */
    "qto", "insumos-modelo", "quant-ilustrado", "peso-total", "orc-modelo", "eap", "rastrear", "req-bim",
    /* Vista: navegar, exibir, janelas, criar vistas, gráficos, render */
    "home", "orbita", "voo", "mesa", "imersivo", "ultra",
    "visibilidade", "pavimentos", "disciplinas", "sistemas", "conjuntos", "estilo", "materiais", "caixa-corte", "ortogonal", "grade",
    "nova-vista", "lado-a-lado", "vistas", "max-3d", "janela-3d", "paineis", "tamanho-ui", "pele-revit",
    "render-ia", "galeria-ia", "render-fisico",
    "elevacao-vista", "elevacao-interior", "planta-forro", "planta-estrutural", "chamada-detalhe", "vista-desenho", "duplicar-vista",
    "modelos-vista", "vg-vista", "estilos-objeto", "navegador-org", "tabela-quantidades", "levantamento-material",
    /* Folhas e exportação técnica */
    "nova-folha", "posicionar-vista", "revisoes-folha", "lista-folhas", "lista-vistas", "exportar-dxf", "exportar-dwg", "pdf-lote",
    /* jogo de pranchas no carimbo do escritório (js/bimfolhaui.js; o botão "Pranchas" da barra de título fica fora da fita) */
    "gerar-pranchas",
    /* Gerenciar: biblioteca, materiais, colaborar */
    "familias-param", "editor-familia", "familia-ia", "familias", "templates", "materiais-proj", "reuniao", "compartilhar"
  ]);

  /* ARQUITETURA & CIVIL */
  def("civil", [
    "parede", "porta", "janela", "cobertura", "tipos-parede", "modelar-ia", "forro", "escada", "escada-u", "rampa",
    "telhado-borda", "telhado-unir", "juntas-parede",
    "ambiente", "separador-ambiente", "identificador-ambiente", "esquema-cores", "ambientes-3d",
    /* alvenaria */
    "familia-bloco", "modular", "junta", "paginar-alvenaria", "elevacoes", "blocok", "conferir-modulacao", "peso-alvenaria",
    /* acabamentos */
    "parede-cebola", "presets-acabamento", "aplicar-ambiente", "paginar-piso", "paginar-parede", "pranchas-paginacao",
    "pintar-face", "dividir-face", "remover-pintura",
    /* massa e terreno (js/bimterrenoui.js) */
    "p11-topo", "p11-dxf", "p11-csv", "p11-subregiao", "p11-rotular", "p11-plataforma", "p11-divisa", "p11-norte", "p11-comp"
  ]);
  def(["civil", "estrutura"], ["piso", "editor", "graute", "alternar-uniao", "unir-geometria", "desunir-geometria"]);
  def(["civil", "metalica"], ["guarda-corpo"]);
  /* furo na laje: shaft de tubo e de eletroduto também */
  def(["civil", "estrutura", "hidraulica", "eletrica"], ["furo-laje"]);

  /* ESTRUTURA (concreto, fundação, armação, fôrma) */
  def("estrutura", ["fundacao", "estrutural", "sondagem"]);
  /* pilar e viga: concreto, aço ou madeira — a seção diz o material */
  def(["estrutura", "metalica", "marcenaria"], ["pilar", "viga"]);
  def(["estrutura", "marcenaria"], ["trelica"]);
  /* o detalhe da peça (ficha, cálculo, vista do projeto estrutural) mora na aba
     Estrutura: é da peça estrutural, seja de concreto, aço ou madeira */
  def(["estrutura", "metalica", "marcenaria"], ["detalhe-peca"]);

  /* HIDRÁULICA & SANITÁRIA */
  def("hidraulica", ["tubo", "conexao", "aparelho", "acessorio-tubo", "legenda-mep",
    "cota", "cota-iguais", "cota-todas", "cota-numerar", "cota-planilha", "cota-limpar"]);
  def(["hidraulica", "eletrica"], ["verificar-sistemas", "desconexoes", "tabela-mep"]);

  /* ELÉTRICA & DADOS */
  def("eletrica", ["eletroduto", "dispositivo-eletrico", "luminaria-mep", "quadro-eletrico", "eletrocalha"]);

  /* METÁLICA & MECÂNICA — o içamento inteiro mora aqui (pedido do Rogério) */
  def("metalica", ["peso-pecas", "peso-coletar", "peso-tipo", "peso-relatorio",
    "icar-equipamento", "icar-posicao", "icar-pontos", "icar-vento", "icar-simular", "icar-plano"]);

  /* ---------------------------------------------------------------
   * Abas: a que abre ao trocar de disciplina e o nome da aba quando ela
   * mostra só parte do que tem (Instalações vira "Hidráulica" na
   * hidráulica; Arquitetura vira "Modelar" fora do civil, porque lá só
   * sobram Modificar, Referência e Tipo).
   * --------------------------------------------------------------- */
  var ABA_INICIAL = {
    civil: ["civil", "arquitetura"], estrutura: ["estrutura"], hidraulica: ["hidraulica", "instalacoes"],
    eletrica: ["eletrica", "instalacoes"], metalica: ["metalica", "icamento"], marcenaria: ["marcenaria"]
  };
  var ROTULO_ABA = {
    estrutura: { arquitetura: "Modelar" },
    hidraulica: { arquitetura: "Modelar", instalacoes: "Hidráulica" },
    eletrica: { arquitetura: "Modelar", instalacoes: "Elétrica" },
    metalica: { arquitetura: "Modelar" },
    marcenaria: { arquitetura: "Modelar" }
  };

  var CHAVE = "orcapro:bim:disciplina:v1";
  var memoria = {};   /* sem localStorage (Node, aba anônima bloqueada): fica na memória */

  function porId(id) { for (var i = 0; i < REGISTRO.length; i++) if (REGISTRO[i].id === id) return REGISTRO[i]; return null; }
  function ehDisc(id) { return !!porId(id) && id !== PADRAO; }

  var D = {
    REGISTRO: REGISTRO,
    COMUM: COMUM,
    PADRAO: PADRAO,
    MAPA: MAPA,
    CHAVE: CHAVE,
    _atual: null,
    _ouvintes: [],

    /* ---- registro ---- */
    lista: function () { return REGISTRO.slice(); },
    ids: function () { return REGISTRO.map(function (d) { return d.id; }); },
    get: function (id) { return porId(id); },

    /* ---- declaração (as outras frentes) ----
     * declarar(["cmd-a","cmd-b"], "marcenaria") · declarar([...], ["estrutura","metalica"]) · declarar([...], "comum").
     * Devolve quantos ids entraram; disciplina desconhecida é recusada inteira (0). */
    declarar: function (ids, disc) {
      var lista = disc === COMUM ? COMUM : (typeof disc === "string" ? [disc] : arr(disc).slice());
      if (lista !== COMUM && (!lista.length || lista.some(function (d) { return !ehDisc(d); }))) return 0;
      var n = 0;
      arr(ids).forEach(function (id) { if (id) { MAPA[String(id)] = lista === COMUM ? COMUM : lista.slice(); n++; } });
      return n;
    },

    /* "comum" | [disciplinas] | null (sem declaração — o teste reprova) */
    disciplinasDe: function (cmdId, abaId) {
      if (Object.prototype.hasOwnProperty.call(MAPA, cmdId)) return MAPA[cmdId];
      if (abaId && ehDisc(abaId)) return [abaId];   /* aba com o id da disciplina: é dela */
      return null;
    },

    /* o comando aparece com a disciplina `disc` (padrão: a escolhida)? */
    mostra: function (cmdId, abaId, disc) {
      var d = disc || this.atual();
      if (d === PADRAO || !ehDisc(d)) return true;
      var de = this.disciplinasDe(cmdId, abaId);
      if (de === null || de === COMUM) return true;   /* sem declaração: aparece (e o teste reprova) */
      return de.indexOf(d) >= 0;
    },

    /* comandos da fita sem disciplina: [{id, aba}] — vazio é o único resultado aceito */
    semDisciplina: function (ribbon) {
      var R = ribbon || global.BimRibbon, out = [], self = this;
      if (!R) return out;
      arr(R.ABAS).forEach(function (a) {
        arr(a.paineis).forEach(function (p) {
          arr(p.comandos).forEach(function (c) {
            if (self.disciplinasDe(c.id, a.id) === null) out.push({ id: c.id, aba: a.id });
            arr(c.itens).forEach(function (i) { if (self.disciplinasDe(i.id, a.id) === null && self.disciplinasDe(c.id, a.id) === null) out.push({ id: i.id, aba: a.id }); });
          });
        });
      });
      return out;
    },

    /* ---- trava por licença (js/modela.js) ---- */
    trancada: function (id) {
      try {
        var P = global.BimPrevia;
        if (P && typeof P.disciplina === "function") return !P.disciplina(id);
      } catch (e) {}
      return false;
    },

    /* ---- escolha (gravada por usuário e aparelho) ---- */
    _chave: function () {
      var u = "";
      try { var A = global.Auth, us = A && (A.usuario ? A.usuario() : A._usuario); if (us && (us.email || us.id)) u = ":" + String(us.email || us.id).toLowerCase(); } catch (e) {}
      return CHAVE + u;
    },
    _ler: function () {
      var k = this._chave();
      try { if (global.localStorage) { var v = global.localStorage.getItem(k); return v == null ? null : v; } } catch (e) {}
      return Object.prototype.hasOwnProperty.call(memoria, k) ? memoria[k] : null;
    },
    _gravar: function (id) {
      var k = this._chave();
      memoria[k] = id;
      try { if (global.localStorage) global.localStorage.setItem(k, id); } catch (e) {}
    },
    /* a disciplina valendo agora: a gravada, se existe e está liberada; senão
       "Todas"; se até "Todas" estiver trancada, a primeira liberada */
    atual: function () {
      var self = this, salvo = this._ler();
      if (salvo && porId(salvo) && !this.trancada(salvo)) return salvo;
      if (!this.trancada(PADRAO)) return PADRAO;
      var livre = REGISTRO.filter(function (d) { return !self.trancada(d.id); })[0];
      return livre ? livre.id : PADRAO;
    },
    /* {ok, id} · {ok:false, trancada:true, id} · {ok:false, motivo} */
    escolher: function (id) {
      if (!porId(id)) return { ok: false, motivo: "Disciplina desconhecida: " + id };
      if (this.trancada(id)) return { ok: false, trancada: true, id: id, motivo: "Disponível no OrçaPRO Modela " + porId(id).nome + "." };
      var antes = this.atual();
      this._gravar(id);
      if (antes !== id) this._ouvintes.forEach(function (fn) { try { fn(id, antes); } catch (e) {} });
      return { ok: true, id: id, mudou: antes !== id };
    },
    aoMudar: function (fn) { if (typeof fn === "function") this._ouvintes.push(fn); },
    filtrando: function () { return this.atual() !== PADRAO; },

    /* ---- o que a fita pergunta ---- */
    rotuloAba: function (abaId, rotulo, disc) {
      var t = ROTULO_ABA[disc || this.atual()];
      return (t && t[abaId]) || rotulo;
    },
    /* a aba que abre ao trocar para `disc`: a preferida da disciplina, se
       aparece; senão a 1ª que tem comando PRÓPRIO dela; senão a 1ª visível */
    /* a aba tem comando à vista (proprio = comando DA disciplina, não comum)? */
    temNaAba: function (abaId, disc, proprio, ribbon) {
      var R = ribbon || global.BimRibbon, self = this, a = R && R.aba ? R.aba(abaId) : null;
      if (!a) return false;
      return arr(a.paineis).some(function (p) {
        return arr(p.comandos).some(function (c) {
          if (R.visivel && !R.visivel(c)) return false;
          if (!self.mostra(c.id, a.id, disc)) return false;
          if (!proprio) return true;
          var de = self.disciplinasDe(c.id, a.id);
          return de !== null && de !== COMUM && de.indexOf(disc) >= 0;
        });
      });
    },
    abaInicial: function (disc, ribbon) {
      var R = ribbon || global.BimRibbon, self = this;
      if (!R) return null;
      var abas = arr(R.ABAS).filter(function (a) { return a.id !== "arquivo"; });
      function temVisivel(a, proprio) { return self.temNaAba(a.id, disc, proprio, R); }
      var pref = ABA_INICIAL[disc] || [];
      for (var i = 0; i < pref.length; i++) {
        for (var j = 0; j < abas.length; j++) if (abas[j].id === pref[i] && temVisivel(abas[j], disc !== PADRAO)) return abas[j].id;
      }
      if (disc !== PADRAO) for (var k = 0; k < abas.length; k++) if (temVisivel(abas[k], true)) return abas[k].id;
      for (var m = 0; m < abas.length; m++) if (temVisivel(abas[m], false)) return abas[m].id;
      return abas.length ? abas[0].id : null;
    },

    /* ---- cor e selo ---- */
    cores: function (disc, tema) {
      var d = porId(disc || this.atual()) || porId(PADRAO);
      return { id: d.id, cor: d.cor, texto: d.texto, acento: tema === "escuro" ? d.acentoEscuro : d.acento };
    },
    /* o selo do canto da vista e da foto: "OrçaPRO Modela · Hidráulica & Sanitária" */
    selo: function (disc) {
      var d = porId(disc || this.atual()) || porId(PADRAO);
      return { id: d.id, texto: "OrçaPRO Modela · " + d.nome, cor: d.cor, textoCor: d.texto };
    }
  };

  global.BimDisciplinas = D;
  if (typeof module !== "undefined" && module.exports) module.exports = D;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
