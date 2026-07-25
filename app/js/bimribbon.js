/* =====================================================================
 * bimribbon.js — Motor da FAIXA DE OPÇÕES (ribbon) do módulo BIM.
 *
 * O BIM do OrçaPRO virou um AMBIENTE de trabalho, não uma página: a
 * organização é a mesma que o engenheiro já conhece do Revit — abas de
 * contexto, cada uma com painéis nomeados, cada painel com seus comandos.
 *
 * Este arquivo é o MODELO, não o desenho: descreve quais abas existem,
 * que comandos moram em cada painel, e — o que faltava — guarda o ESTADO
 * de cada comando em memória.
 *
 * Por que o estado importa: até aqui o "ligado/desligado" de cada
 * ferramenta do BIM só existia no style.background do botão. Quem
 * quisesse saber se a trena estava ativa tinha que ler uma cor. Ao
 * trocar a fita por uma ribbon isso quebraria calado. Aqui o estado é
 * dado (ativo, desabilitado, motivo), a cor é consequência.
 *
 * PURO e Node-testável: não toca no DOM, não conhece three.js, não
 * chama o BIM. Quem desenha é js/bimribbonui.js; quem executa é o app.
 * Teste: node tools/test-bimribbon.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function str(v) { return v == null ? "" : String(v); }

  /* ---------------------------------------------------------------
   * O MAPA DE COMANDOS.
   * Cada aba tem painéis; cada painel tem comandos. Um comando é:
   *   id       — identificador estável (é o que o app recebe no clique)
   *   rotulo   — vai em DUAS linhas embaixo do ícone, como no Revit;
   *              use "\n" para escolher onde quebra
   *   icone    — nome no registry de ícones (js/icones.js)
   *   dica     — tooltip; texto de engenheiro, não de programador
   *   tipo     — "botao" (padrão) | "alterna" (liga/desliga) | "menu"
   *   itens    — para tipo "menu": subcomandos
   *   grande   — false = botão pequeno, empilha 3 por coluna
   *   requer   — pré-condição: "modelo" (algo carregado) | "selecao" | "obra"
   *   pro      — true = recurso de plano pago
   * --------------------------------------------------------------- */
  var ABAS = [
    {
      id: "arquivo", rotulo: "Arquivo", tipo: "backstage",
      paineis: [
        { nome: "Projeto", comandos: [
          { id: "novo-projeto", emBreve: true, rotulo: "Novo\nprojeto", icone: "obra", grande: true, dica: "Começa um projeto do zero: define os níveis e desenha as paredes aqui mesmo." },
          { id: "abrir-ifc", rotulo: "Abrir\nIFC", icone: "abrir", grande: true, dica: "Abre um modelo IFC exportado do Revit, ArchiCAD, SketchUp ou do nosso plugin." },
          { id: "gerar-volumetria", rotulo: "Gerar de\ndesenho", icone: "importar", grande: true, dica: "Levanta a volumetria a partir de PDF, DWG/DXF, foto de prancha ou croqui feito à mão." },
          { id: "modelos", rotulo: "Modelos\nabertos", icone: "camadas", requer: "modelo", dica: "Federação: vários arquivos abertos juntos, com visibilidade e transparência por disciplina." }
        ] },
        { nome: "Salvar e sair", comandos: [
          { id: "salvar-modelo", rotulo: "Salvar\nno projeto", icone: "salvar", requer: "modelo", dica: "Guarda o modelo e as edições dentro da obra." },
          { id: "exportar-ifc", emBreve: true, rotulo: "Exportar\nIFC", icone: "exportar", requer: "modelo", pro: true, dica: "Gera um IFC do que está aqui, para abrir em outro programa." },
          { id: "exportar-revit", rotulo: "Enviar ao\nRevit", icone: "revit", requer: "modelo", pro: true, dica: "Manda o orçamento e o avanço para o plugin OrçaPRO dentro do Revit." }
        ] }
      ]
    },
    {
      id: "arquitetura", rotulo: "Arquitetura",
      paineis: [
        { nome: "Construir", comandos: [
          { id: "parede", rotulo: "Parede", icone: "parede", grande: true, tipo: "alterna", dica: "Desenha parede clicando dois pontos. O tipo de parede define espessura e camadas." },
          { id: "piso", rotulo: "Piso", icone: "laje", grande: true, tipo: "alterna", dica: "Cria laje/contrapiso por dois cantos." },
          { id: "pilar", rotulo: "Pilar", icone: "pilar", grande: true, tipo: "alterna", dica: "Lança pilar pela seção definida no tipo." },
          { id: "porta", emBreve: true, rotulo: "Porta", icone: "porta", grande: true, tipo: "alterna", requer: "modelo", dica: "Abre vão de porta na parede — o vão desconta da alvenaria e do revestimento." },
          { id: "janela", emBreve: true, rotulo: "Janela", icone: "janela", grande: true, tipo: "alterna", requer: "modelo", dica: "Abre vão de janela com peitoril; desconta do quantitativo e gera verga e contraverga." },
          { id: "cobertura", emBreve: true, rotulo: "Cobertura", icone: "telhado", grande: true, tipo: "alterna", requer: "modelo", dica: "Telhado por inclinação e tipo de telha." }
        ] },
        { nome: "Tipo", comandos: [
          { id: "tipos-parede", rotulo: "Tipos de\nparede", icone: "camadas", grande: true, dica: "Biblioteca de paredes: bloco, espessura e as camadas de acabamento de cada face." },
          { id: "editar-tipo", rotulo: "Editar\ntipo", icone: "editar", requer: "selecao", dica: "Muda o tipo do que está selecionado — vale para todos os elementos daquele tipo." },
          { id: "combinar", emBreve: true, rotulo: "Igualar\ntipo", icone: "copiar", requer: "selecao", dica: "Aplica o tipo de um elemento em outro." }
        ] },
        { nome: "Nível", comandos: [
                    { id: "niveis", rotulo: "Níveis", icone: "niveis", grande: true, dica: "Cria e edita os níveis do projeto. Cada elemento pertence a um nível." },
          { id: "nivel-atual", rotulo: "Nível\natual", icone: "alvo", tipo: "menu", dica: "Escolhe em que nível o próximo elemento vai nascer." },
          { id: "plano-trabalho", emBreve: true, rotulo: "Plano de\ntrabalho", icone: "planta", dica: "Altura de referência para desenhar." }
        ] }
      ]
    },
    {
      id: "alvenaria", rotulo: "Alvenaria",
      paineis: [
        { nome: "Bloco", comandos: [
          { id: "familia-bloco", rotulo: "Família\ndo bloco", icone: "bloco", grande: true, dica: "Escolhe a família modular de bloco de concreto e as peças disponíveis." },
          { id: "modular", rotulo: "Modular\nparedes", icone: "regua", grande: true, requer: "modelo", dica: "Ajusta os comprimentos para fechar em bloco inteiro, evitando recorte." },
          { id: "junta", rotulo: "Junta e\ncompensador", icone: "ajustes", requer: "modelo", dica: "Afina a junta dentro da faixa aceitável para dispensar bolacha; se não fechar, encaixa a bolacha." }
        ] },
        { nome: "Paginação", comandos: [
          { id: "paginar-alvenaria", emBreve: true, rotulo: "Paginar\nalvenaria", icone: "grade", grande: true, requer: "modelo", dica: "Distribui as peças fiada a fiada, com amarração nos encontros em L, T e X." },
          { id: "elevacoes", emBreve: true, rotulo: "Elevações\nde parede", icone: "prancha", grande: true, requer: "modelo", dica: "Gera a prancha de elevação de cada parede, com peças numeradas e lista de material." },
          { id: "graute", emBreve: true, rotulo: "Graute e\narmadura", icone: "estrutura", requer: "modelo", dica: "Alvenaria estrutural: pontos de graute e armadura vertical, com m³ e kg." }
        ] },
        { nome: "Conferência", comandos: [
          /* sem `requer` de propósito: os dois são paramétricos puros — não
             leem o modelo em momento nenhum. Exigir um IFC aberto para saber
             quanto pesa um bloco é obstáculo sem motivo. */
          { id: "conferir-modulacao", rotulo: "Conferir\nmodulação", icone: "checklist", grande: true, dica: "Aponta onde a parede não fecha na modulação e o que fazer. Não precisa de modelo aberto." },
          { id: "peso-alvenaria", rotulo: "Peso por\nparede", icone: "balanca", dica: "Peso das peças por parede. Vem pré-definido de catálogo e você troca pelo peso do seu fornecedor." }
        ] }
      ]
    },
    {
      id: "acabamentos", rotulo: "Acabamentos",
      paineis: [
        { nome: "Parede", comandos: [
          /* sem `requer` de propósito: é o painel de CONFIGURAÇÃO, e o
             usuário precisa dele antes de existir qualquer parede. */
          { id: "parede-cebola", rotulo: "Camadas\nda parede", icone: "cebola", grande: true, dica: "Transforma a parede crua em parede executiva: chapisco, emboço, reboco, massa, pintura ou revestimento, face por face. Mexeu numa espessura, a parede recalcula na hora." },
          { id: "presets-acabamento", rotulo: "Padrões\nprontos", icone: "estrela", grande: true, dica: "Os acabamentos mais usados no Brasil, prontos para aplicar." },
          { id: "aplicar-ambiente", emBreve: true, rotulo: "Aplicar por\nambiente", icone: "ambiente", requer: "modelo", dica: "Define o acabamento de um ambiente inteiro de uma vez." }
        ] },
        { nome: "Piso e revestimento", comandos: [
          { id: "paginar-piso", emBreve: true, rotulo: "Paginar\npiso", icone: "grade", grande: true, requer: "modelo", dica: "Escolhe o melhor ponto de partida para o menor recorte e nenhum recorte fino na entrada." },
          { id: "paginar-parede", emBreve: true, rotulo: "Paginar\nrevestimento", icone: "azulejo", grande: true, requer: "modelo", dica: "Paginação do azulejo por parede, alinhada com o piso." },
          { id: "pranchas-paginacao", emBreve: true, rotulo: "Pranchas de\npaginação", icone: "prancha", requer: "modelo", dica: "Gera as pranchas executivas de paginação para o pedreiro." }
        ] }
      ]
    },
    {
      id: "anotar", rotulo: "Anotar",
      paineis: [
        { nome: "Medir", comandos: [
          { id: "medir", rotulo: "Trena", icone: "medir", grande: true, tipo: "alterna", requer: "modelo", dica: "Mede a distância entre dois pontos do modelo." },
          { id: "area", rotulo: "Área", icone: "area", grande: true, tipo: "alterna", requer: "modelo", dica: "Mede área por um contorno de pontos." },
          { id: "angulo", rotulo: "Ângulo", icone: "angulo", grande: true, tipo: "alterna", requer: "modelo", dica: "Mede o ângulo entre duas direções." },
          { id: "snap", rotulo: "Snap", icone: "ima", tipo: "menu", dica: "Onde a medição se agarra: vértice, meio da aresta, aresta, interseção." }
        ] },
        { nome: "Documentar", comandos: [
          { id: "cotas-auto", rotulo: "Cotas\nautomáticas", icone: "regua", grande: true, requer: "modelo", dica: "Gera as cadeias de cota da planta." },
          { id: "anotacao", rotulo: "Anotação", icone: "nota", tipo: "alterna", requer: "modelo", dica: "Marca um ponto do modelo com um texto." },
          { id: "foto", rotulo: "Foto da\nvista", icone: "camera", requer: "modelo", dica: "Captura a vista atual com carimbo para relatório." }
        ] }
      ]
    },
    {
      id: "analisar", rotulo: "Analisar",
      paineis: [
        { nome: "Compatibilizar", comandos: [
          { id: "clash", rotulo: "Interfe-\nrências", icone: "clash", grande: true, requer: "modelo", dica: "Acha choque entre disciplinas: hidráulica x elétrica x estrutura." },
          { id: "planta", rotulo: "Planta\nbaixa", icone: "planta", grande: true, tipo: "alterna", requer: "modelo", dica: "Corta o modelo na altura da planta." },
          { id: "corte", rotulo: "Corte", icone: "corte", grande: true, tipo: "alterna", requer: "modelo", dica: "Plano de corte livre, em qualquer ângulo." },
          { id: "corte-tecnico", rotulo: "Corte\ntécnico", icone: "prancha", requer: "modelo", dica: "Vira o corte num desenho técnico em preto e branco, com hachura." }
        ] },
        { nome: "Tempo e custo", comandos: [
          { id: "quatro-d", rotulo: "4D\nCronograma", icone: "calendario", grande: true, requer: "modelo", dica: "Vê a obra subindo semana a semana, ligada ao cronograma." },
          { id: "seis-d", rotulo: "6D/7D\nCiclo de vida", icone: "ciclo", grande: true, requer: "modelo", pro: true, dica: "Operação e manutenção do que foi construído." },
          { id: "curva-s", rotulo: "Curva S", icone: "grafico", requer: "modelo", dica: "Avanço previsto x realizado." }
        ] }
      ]
    },
    {
      id: "quantitativos", rotulo: "Quantitativos",
      paineis: [
        { nome: "Levantar", comandos: [
          { id: "qto", rotulo: "Quantitativos\ndo modelo", icone: "calculadora", grande: true, requer: "modelo", dica: "Levanta as quantidades direto da geometria, por categoria." },
          { id: "eap", rotulo: "Gerar\norçamento", icone: "ia", grande: true, requer: "modelo", dica: "O agente monta a EAP e casa cada serviço com a base de preços — sem inventar código." },
          { id: "insumos-modelo", rotulo: "Insumos\ndo modelo", icone: "insumo", requer: "modelo", dica: "Todo insumo gasto: blocos, argamassa, graute, aço, tinta, cerâmica, rejunte." }
        ] },
        { nome: "Conferir", comandos: [
          { id: "peso-total", rotulo: "Peso por\nnível", icone: "balanca", grande: true, requer: "modelo", dica: "Peso por parede, por nível e total." },
          { id: "rastrear", rotulo: "Rastrear no\norçamento", icone: "buscar", requer: "selecao", dica: "Do elemento 3D até a linha do orçamento — e de volta." }
        ] }
      ]
    },
    {
      id: "vista", rotulo: "Vista",
      paineis: [
        { nome: "Navegar", comandos: [
          { id: "home", rotulo: "Enquadrar\ntudo", icone: "casa", grande: true, requer: "modelo", dica: "Volta a ver o modelo inteiro." },
          { id: "voo", rotulo: "Modo de\nvoo", icone: "voo", grande: true, tipo: "alterna", requer: "modelo", dica: "Anda pelo modelo com o teclado, como num jogo." },
          { id: "imersivo", rotulo: "Realidade\nvirtual", icone: "vr", grande: true, requer: "modelo", pro: true, dica: "Entra no modelo em escala 1:1, pelo celular ou visor." }
        ] },
        { nome: "Exibir", comandos: [
          { id: "visibilidade", rotulo: "Visibilidade", icone: "olho", grande: true, requer: "modelo", dica: "Isola, oculta e usa raio-X na seleção." },
          { id: "pavimentos", rotulo: "Pavimentos", icone: "niveis", grande: true, requer: "modelo", dica: "Isola um pavimento do modelo importado." },
          { id: "sistemas", rotulo: "Cores por\nsistema", icone: "paleta", requer: "modelo", dica: "Pinta por sistema hidrossanitário ou disciplina." },
          { id: "estilo", rotulo: "Estilo de\nexibição", icone: "pincel", tipo: "menu", dica: "Sombreado, linhas, desenho técnico." }
        ] },
        { nome: "Colaborar", comandos: [
          { id: "reuniao", rotulo: "Reunião no\nmodelo", icone: "obra", grande: true, requer: "modelo", pro: true, dica: "Várias pessoas dentro do mesmo modelo, com voz." },
          { id: "compartilhar", rotulo: "Compartilhar\nlink", icone: "link", requer: "modelo", dica: "Manda o modelo por link ou QR para abrir no celular." }
        ] }
      ]
    }
  ];

  var Ribbon = {
    ABAS: ABAS,

    /* estado vivo — a cor do botão passa a ser CONSEQUÊNCIA disto, nunca a fonte */
    _st: { aba: "arquitetura", ativos: {}, desabilitados: {}, ctx: { modelo: false, selecao: false, obra: false, pro: false } },

    /* ---- leitura ---- */
    abas: function () {
      return ABAS.map(function (a) { return { id: a.id, rotulo: a.rotulo, tipo: a.tipo || "normal" }; });
    },
    abaAtiva: function () { return this._st.aba; },
    aba: function (id) {
      for (var i = 0; i < ABAS.length; i++) if (ABAS[i].id === id) return ABAS[i];
      return null;
    },
    comando: function (id) {
      for (var i = 0; i < ABAS.length; i++) {
        var ps = arr(ABAS[i].paineis);
        for (var j = 0; j < ps.length; j++) {
          var cs = arr(ps[j].comandos);
          for (var k = 0; k < cs.length; k++) {
            if (cs[k].id === id) return cs[k];
            var its = arr(cs[k].itens);
            for (var m = 0; m < its.length; m++) if (its[m].id === id) return its[m];
          }
        }
      }
      return null;
    },
    /* todos os ids, para o gate de RBAC e para os testes não deixarem comando órfão */
    ids: function () {
      var out = [];
      ABAS.forEach(function (a) {
        arr(a.paineis).forEach(function (p) {
          arr(p.comandos).forEach(function (c) {
            out.push(c.id);
            arr(c.itens).forEach(function (i) { out.push(i.id); });
          });
        });
      });
      return out;
    },

    /* ---- estado ---- */
    irPara: function (abaId) {
      if (!this.aba(abaId)) return false;
      this._st.aba = abaId; return true;
    },
    ativo: function (id) { return !!this._st.ativos[id]; },
    setAtivo: function (id, on) {
      var c = this.comando(id);
      if (!c) return false;
      /* "alterna" é o único tipo que guarda ligado/desligado; botão comum não fica aceso */
      if ((c.tipo || "botao") !== "alterna") return false;
      if (on) this._st.ativos[id] = true; else delete this._st.ativos[id];
      return true;
    },
    /* ferramentas que se excluem: ligar a trena desliga a área e o ângulo */
    _EXCLUSIVOS: ["medir", "area", "angulo", "parede", "piso", "pilar", "porta", "janela", "cobertura", "anotacao"],
    ligarExclusivo: function (id) {
      var self = this, mudou = false;
      this._EXCLUSIVOS.forEach(function (o) { if (o !== id && self._st.ativos[o]) { delete self._st.ativos[o]; mudou = true; } });
      if (this.setAtivo(id, true)) mudou = true;
      return mudou;
    },
    desligarTodas: function () {
      var self = this, n = 0;
      Object.keys(this._st.ativos).forEach(function (k) { delete self._st.ativos[k]; n++; });
      return n;
    },

    /* contexto: o que existe agora na tela (modelo aberto? algo selecionado? plano pago?) */
    setContexto: function (ctx) {
      var c = this._st.ctx;
      if (!ctx) return c;
      ["modelo", "selecao", "obra", "pro"].forEach(function (k) { if (ctx[k] != null) c[k] = !!ctx[k]; });
      return c;
    },
    contexto: function () { return this._st.ctx; },

    /* Um comando está disponível? Devolve o MOTIVO quando não está — a dica do
     * botão desabilitado explica o que fazer, em vez de só ficar cinza. */
    disponibilidade: function (id) {
      var c = this.comando(id);
      if (!c) return { ok: false, motivo: "Comando não existe." };
      if (this._st.desabilitados[id]) return { ok: false, motivo: this._st.desabilitados[id] };
      /* `emBreve` é o comando que ainda NÃO existe. Fica na fita de propósito
       * — é o roteiro do que vem, e o engenheiro precisa saber que está no
       * caminho — mas diz isso de frente, em vez de responder "ainda não está
       * disponível nesta versão" só depois do clique. */
      if (c.emBreve) return { ok: false, emBreve: true,
        motivo: "Ainda não está pronto — está no roteiro. Clique para ver o que já dá para fazer no lugar." };
      var ctx = this._st.ctx;
      if (c.pro && !ctx.pro) return { ok: false, motivo: "Disponível no plano PRO." };
      if (c.requer === "modelo" && !ctx.modelo) return { ok: false, motivo: "Abra ou gere um modelo primeiro." };
      if (c.requer === "selecao" && !ctx.selecao) return { ok: false, motivo: "Selecione um elemento no modelo (dois cliques)." };
      if (c.requer === "obra" && !ctx.obra) return { ok: false, motivo: "Escolha a obra no alto da tela." };
      return { ok: true, motivo: "" };
    },
    desabilitar: function (id, motivo) {
      if (!this.comando(id)) return false;
      if (motivo) this._st.desabilitados[id] = String(motivo); else delete this._st.desabilitados[id];
      return true;
    },

    /* ---- o que a camada de desenho consome ----
     * Devolve a aba inteira já resolvida: cada comando com ativo/disponível/motivo,
     * para o desenho ser burro (só pinta o que recebe). */
    render: function (abaId) {
      var self = this;
      var a = this.aba(abaId || this._st.aba);
      if (!a) return null;
      return {
        id: a.id, rotulo: a.rotulo, tipo: a.tipo || "normal",
        paineis: arr(a.paineis).map(function (p) {
          return {
            nome: p.nome,
            comandos: arr(p.comandos).map(function (c) {
              var d = self.disponibilidade(c.id);
              return {
                id: c.id, rotulo: str(c.rotulo), linhas: str(c.rotulo).split("\n"),
                icone: c.icone || "quadrado", dica: str(c.dica),
                tipo: c.tipo || "botao", grande: c.grande !== false && !!c.grande,
                pro: !!c.pro, ativo: self.ativo(c.id), habilitado: d.ok, motivo: d.motivo,
                emBreve: !!c.emBreve,
                itens: arr(c.itens).map(function (i) {
                  var di = self.disponibilidade(i.id);
                  return { id: i.id, rotulo: str(i.rotulo), icone: i.icone || "", dica: str(i.dica), ativo: self.ativo(i.id), habilitado: di.ok, motivo: di.motivo };
                })
              };
            })
          };
        })
      };
    },

    /* busca de comando pelo nome — alimenta o Ctrl+K dentro do BIM */
    buscar: function (termo) {
      var t = str(termo).toLowerCase().trim();
      if (!t) return [];
      var out = [], self = this;
      ABAS.forEach(function (a) {
        arr(a.paineis).forEach(function (p) {
          arr(p.comandos).forEach(function (c) {
            var alvo = (str(c.rotulo).replace(/\n/g, " ") + " " + str(c.dica) + " " + a.rotulo + " " + p.nome).toLowerCase();
            if (alvo.indexOf(t) >= 0) {
              out.push({ id: c.id, rotulo: str(c.rotulo).replace(/\n/g, " "), aba: a.id, abaRotulo: a.rotulo, painel: p.nome, habilitado: self.disponibilidade(c.id).ok });
            }
          });
        });
      });
      return out;
    },

    /* zera tudo (troca de obra, novo modelo) */
    limpar: function () {
      this._st.ativos = {}; this._st.desabilitados = {};
      this._st.ctx = { modelo: false, selecao: false, obra: false, pro: false };
      this._st.aba = "arquitetura";
    }
  };

  global.BimRibbon = Ribbon;
  if (typeof module !== "undefined" && module.exports) module.exports = Ribbon;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
