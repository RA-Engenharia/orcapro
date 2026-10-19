/* =====================================================================
 * bimfita.js — ORGANIZAÇÃO DA INTERFACE DO BIM (18/10/2026)
 *
 * Pedido do Rogério: "Está ficando muito confuso onde a gente tem que achar
 * cada coisa. Deixa as principais ferramentas de modelagem visíveis, fáceis
 * de encontrar: cotar, tirar medida, selecionar o objeto."
 *
 * O que este arquivo faz, sem reescrever nenhuma ação que já existia:
 *
 *  1. BARRA DE ACESSO RÁPIDO na barra de título (vale em qualquer aba):
 *     Salvar, Modificar, Desfazer/Refazer, Medir (entre dois pontos / ao
 *     longo), Cota alinhada, Rótulo por categoria, Texto, Vista 3D padrão,
 *     Corte, Linhas finas, Fechar inativas, Alternar janelas. Configurável:
 *     o "▾" no fim adiciona/remove; o botão direito em qualquer comando da
 *     fita oferece "Adicionar à barra de acesso rápido". Gravada por aparelho
 *     (`orcapro:bim:acesso-rapido:v1`).
 *  2. ABA "MODIFICAR" logo depois do Arquivo: Selecionar, Área de
 *     transferência, Geometria, Modificar (as ferramentas do editor que
 *     moravam no fim da aba Arquitetura), Vista (ocultar/isolar temporário),
 *     Medir, Criar e a CAIXA DE SELEÇÃO (BX). Com algo selecionado ela vira
 *     "Modificar | Tubos" (ou Conexões, Aparelhos e peças, Paredes…) e ganha
 *     os painéis da categoria.
 *  3. ABA "VISTA" na ordem de trabalho: Gráficos, Apresentação, Criar,
 *     Composição de folha, Janelas — e depois Navegar, Exibir, Exportar.
 *     Planta e Corte (que estavam em Analisar) e Legenda (em Anotar) vão
 *     para Vista › Criar.
 *  4. A ORDEM DAS ABAS segue o fluxo de projeto (ORDEM, abaixo).
 *  5. DICA RICA em todo botão da fita e da barra rápida: nome, atalho, o
 *     que faz e o ícone grande.
 *
 * ⚠ SÓ NA FITA ORGANIZADA (BimRibbon.reorganizado()). A fita de sempre é o
 *   mapa ORIGINAL do js/bimribbon.js (ABAS_ORIG): mexer nela por dentro
 *   faria o `conferirLayout` achar ids que o layout não tem e RECUSAR a
 *   reorganização da próxima vez — a fita nova sumiria inteira.
 * ⚠ NADA DE COMANDO EM DOIS LUGARES: os comandos são MOVIDOS (o mesmo
 *   objeto, o mesmo id, a mesma ação registrada no BimCmd). Onde o desenho
 *   de referência repete de propósito (Medir e Cota alinhada também em
 *   Modificar; os da aba contextual), o botão é um ATALHO com id próprio
 *   (`fx-…`/`ctx-…`) que executa o comando original.
 * ⚠ NENHUM "EM BREVE" NA FITA (regra de 09/10/2026, P3 da junção 18/10/2026):
 *   todo botão daqui executa. O que ainda não dá para fazer com segurança
 *   (cortar geometria, espelhar por eixo, perfil de corte, caixa de escopo,
 *   justificar e desconectar o tubo, segmentar a marca de corte) NÃO está na
 *   fita: fica listado em EM_DESENVOLVIMENTO, que a tela de Atalhos (a ajuda
 *   do BIM, tecla ?) mostra como texto, com o que fazer hoje.
 * ⚠ SÓ COM A PRÉVIA `?previa=hidro` (P8 da junção, 18/10/2026: até o Rogério
 *   decidir): sem ela `registrar` e `antesDePintar` não fazem NADA e a fita é
 *   a do master 0a2e06d2 (prova: tools/e2e-hid-previa.js [4]).
 *
 * Ganchos: js/gestao.js (_bimCascaAcoes → BimFita.registrar(reg, G)),
 * js/bimshell.js (pintarFita → BimFita.antesDePintar()), js/bim.js
 * (BIM.caixaUids). Prova: tools/test-bimfita.js, tools/e2e-bim-fita-org.js.
 * Auditoria: docs/hidro/AUDITORIA-INTERFACE-BIM.md.
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function str(v) { return v == null ? "" : String(v); }
  function esc(s) { return str(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function R() { return global.BimRibbon || null; }
  function SH() { return global.BimShell || null; }
  function CMD() { return global.BimCmd || null; }
  function B() { return global.BIM || null; }
  function SI() { return global.BimSelInst || null; }
  function doc() { return global.document || null; }
  function status(t) { try { var s = SH(); if (s && s.status) s.status(t); } catch (e) {} }
  function toast(t, k) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info"); } catch (e) {} }
  function lsGet(k) { try { return global.localStorage ? global.localStorage.getItem(k) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { if (global.localStorage) { if (v == null) global.localStorage.removeItem(k); else global.localStorage.setItem(k, v); } } catch (e) {} }
  function ico(nome, tam) {
    try { if (global.Icones && global.Icones.get) { var s = global.Icones.get(nome, tam || 15); if (s) return s; } } catch (e) {}
    var t = tam || 15;
    return '<svg viewBox="0 0 24 24" width="' + t + '" height="' + t + '" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>';
  }
  function G() { return global.Gestao || null; }
  /* P8: a fita organizada, a barra de acesso rápido e a aba contextual só com a prévia hidro */
  function hidro() { try { return !!(global.BimPrevia && global.BimPrevia.hidro && global.BimPrevia.hidro()); } catch (e) { return false; } }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function d3(a, b) { var x = b.x - a.x, y = b.y - a.y, z = b.z - a.z; return Math.sqrt(x * x + y * y + z * z); }
  function cp3(p) { return { x: p.x, y: p.y, z: p.z }; }
  var TOL_NO = 0.02;   /* hid:ok o mesmo TOL do js/biminst.js (2 cm: pontas mais perto que isto são o MESMO nó) — não é valor de norma */

  /* ---------------------------------------------------------------
   * A ORDEM DAS ABAS: Modificar logo depois do Arquivo (é a que mais se
   * usa), depois a modelagem por disciplina, documentação e análise.
   * Aba que não está aqui (módulo novo) entra antes do Gerenciar.
   * --------------------------------------------------------------- */
  var ORDEM = ["arquivo", "modificar", "arquitetura", "estrutura", "alvenaria", "acabamentos", "instalacoes", "metalica",
    "marcenaria", "volume", "massa-terreno", "anotar", "vista", "analisar", "quantitativos", "icamento", "gerenciar"];

  /* um comando novo (o mesmo formato do js/bimribbon.js) */
  function c(id, rotulo, icone, dica, extra) {
    var o = { id: id, rotulo: rotulo, icone: icone, dica: dica };
    if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) o[k] = extra[k];
    return o;
  }

  /* ---- os comandos que faltavam (fx-*) ---- */
  var FX = [
    /* Modificar › Selecionar */
    c("fx-modificar", "Modificar", "desSelecionarParedes", "Solta a ferramenta em uso e volta a selecionar: clique seleciona, Ctrl+clique soma, arrastar faz janela.", { grande: true }),
    c("fx-propriedades", "Propriedades", "ajustes", "Mostra ou esconde a janela Propriedades: com seleção, os parâmetros dela; sem seleção, os da vista."),
    c("fx-filtro-selecao", "Filtro", "categorias", "Filtro de seleção: com vários elementos selecionados, marque as categorias que ficam (ex.: só os tubos de uma janela que pegou paredes e louças)."),
    /* Área de transferência */
    c("fx-copiar-area", "Copiar", "copiar", "Copia os elementos selecionados para a área de transferência. Colar pede o ponto base e o destino."),
    c("fx-colar", "Colar", "importar", "Cola o que foi copiado: os elementos ficam selecionados e a ferramenta Copiar pede o ponto base e o destino — dá para colar várias vezes."),
    c("fx-colar-alinhado", "Colar alinhado", "niveis", "Cola o grupo copiado alinhado aos níveis escolhidos, na mesma posição em planta (crie o grupo antes: Modificar › Criar › Criar grupo)."),
    /* Modificar */
    c("fx-excluir", "Excluir", "lixeira", "Apaga os elementos selecionados (um Ctrl+Z desfaz tudo). Peça fixada não sai; parte de peça pronta pergunta antes."),
    /* Vista (temporário) */
    c("fx-ocultar", "Ocultar elemento", "olhoFechado", "Oculta temporariamente os selecionados nesta vista. Redefinir traz de volta."),
    c("fx-isolar", "Isolar elemento", "olho", "Isola temporariamente os selecionados: o resto do modelo some. Redefinir traz de volta."),
    c("fx-restaurar-temp", "Redefinir temporário", "ciclo", "Desfaz o ocultar/isolar temporário: tudo volta a aparecer."),
    c("fx-sobrepor", "Sobrepor gráficos", "paleta", "Sobrepor gráficos: na vista 2D abre Visibilidade/Gráficos (cor, pena e meio-tom por categoria e por filtro)."),
    /* Medir */
    c("fx-medir", "Medir", "medir", "Mede entre dois pontos com snap, no 3D e na planta (a trena). Esc encerra.", { grande: true, alias: "medir" }),
    c("fx-medir-longo", "Medir ao longo", "regua", "Mede ao longo de um caminho: na planta, corte ou elevação, cada clique soma um trecho (Backspace tira o último, Esc encerra); no 3D, soma o comprimento dos tubos selecionados."),
    c("fx-cota", "Cota\nalinhada", "regua", "Cota alinhada presa às peças, no 3D, na planta e no corte — a mesma de Anotar › Cotas.", { grande: true, alias: "p7-cota-alinhada" }),
    /* Caixa de seleção (BX) */
    c("fx-caixa-selecao", "Caixa de\nseleção", "quadrado", "Isola os elementos selecionados na vista 3D com uma caixa de corte justa em volta deles. Selecione em qualquer vista (planta, corte ou 3D) e aperte BX. Para voltar, desligue a Caixa de corte (tecla C).", { grande: true }),
    /* Vista › Gráficos */
    c("fx-filtros", "Filtros", "categorias", "Filtros da vista: as regras de visibilidade e sobreposição por filtro, na Visibilidade/Gráficos da vista 2D ativa."),
    c("fx-linhas-finas", "Linhas finas", "desLinha", "Mostra todas as linhas das vistas 2D com a espessura mínima, para conferir detalhe sem o peso das penas. Não muda a impressão nem o PDF.", { tipo: "alterna" }),
    c("fx-linhas-ocultas-exibir", "Exibir linhas ocultas", "olho", "Mostra tracejadas, no {3D}, as arestas dos elementos selecionados que estão escondidas atrás de outros."),
    c("fx-linhas-ocultas-remover", "Remover linhas ocultas", "olhoFechado", "Tira o tracejado das linhas ocultas dos selecionados (sem seleção: de todos)."),
    /* Vista › Criar */
    c("fx-vista-3d", "Vista 3D", "casa", "Vista 3D padrão: volta para a vista {3D} e enquadra o modelo inteiro.", { grande: true }),
    /* Vista › Composição de folha */
    c("fx-titulo-folha", "Título da vista", "nota", "Título da vista na folha (número, nome e escala debaixo do desenho): com uma vista posicionada selecionada, mostra ou esconde o dela; sem seleção, põe o título em todas as vistas da folha."),
    c("fx-carimbo", "Carimbo", "assinar", "Carimbo da folha: com uma folha aberta, os campos do carimbo (obra, prancha, escala, revisão, responsável) ficam em Propriedades. Sem folha, abre as Pranchas."),
    /* Vista › Janelas */
    c("fx-alternar-janelas", "Alternar\njanelas", "camadas", "Lista as vistas abertas ({3D}, plantas, cortes, folhas) para ir direto a uma.", { grande: true }),
    c("fx-fechar-inativas", "Fechar\ninativas", "fechar", "Fecha todas as vistas abertas menos a ativa (a {3D} principal fica).", { grande: true }),
    c("fx-guia-vistas", "Guia de\nvistas", "lista", "As vistas abertas em guias (uma de cada vez) — o contrário de Vistas lado a lado.", { grande: true }),
    c("fx-interface", "Interface do\nusuário", "ajustes", "Liga e desliga o Navegador de projeto, Propriedades e a barra de status; tamanho da interface, estilo clássico e painéis no padrão.", { grande: true, tipo: "menu", menu: ["tamanho-ui", "pele-revit", "paineis"] })
  ];

  /* ---- a aba contextual (ctx-*): só aparece com algo selecionado ---- */
  var CTX = [
    c("ctx-tipo", "Trocar\ntipo", "editar", "Troca o tipo do elemento selecionado (no tubo: o material; na peça: o tamanho) — em Propriedades, vale para toda a seleção (um Ctrl+Z).", { grande: true }),
    c("ctx-dn", "Diâmetro", "medir", "Diâmetro (DN) do tubo ou tamanho da peça, em Propriedades. O dimensionamento pela norma fica no painel Instalações.", { grande: true }),
    c("ctx-inclinacao", "Inclinação", "angulo", "Muda a inclinação dos trechos selecionados (%): a ponta final desce a partir da inicial e as pontas ligadas nela vão junto (um Ctrl+Z)."),
    c("ctx-isolamento", "Isolamento", "camadas", "Põe ou tira o isolamento dos trechos selecionados, quando o material tem as duas opções (cobre, duto de chapa)."),
    c("ctx-conectar", "Conectar a", "link", "Liga a ponta livre do 1º tubo selecionado ao 2º (Ctrl+clique): na ponta dele ou no meio, que é dividido no nó (um Ctrl+Z)."),
    c("ctx-desconexoes", "Mostrar\ndesconexões", "alerta", "Mostra as pontas livres da rede (o mesmo de Instalações › Sistemas).", { grande: true, alias: "desconexoes" }),
    c("ctx-inspetor", "Inspetor de\nsistema", "buscar", "Confere o sistema da seleção: inclinação mínima, desconexões, diâmetros e o que falta (o mesmo de Instalações › Verificar sistemas).", { grande: true, alias: "verificar-sistemas" }),
    c("ctx-cotar-tubo", "Cotar\ntubo", "regua", "Cota o tubo selecionado (diâmetro, inclinação e comprimento) — o mesmo de Instalações › Rede.", { grande: true, alias: "cota" }),
    c("ctx-sel-tipo", "Selecionar\ndo tipo", "lista", "Seleciona no projeto todos os elementos do mesmo tipo do selecionado.", { grande: true }),
    c("ctx-sel-cat", "Selecionar\na categoria", "categorias", "Seleciona no projeto todos os elementos da mesma categoria do selecionado.", { grande: true })
  ];

  /* EM DESENVOLVIMENTO (P3 da junção, 18/10/2026 — regra de 09/10: nenhum botão sem função): o que a organização
     previa e ainda NÃO dá para fazer com segurança. Não vira botão: a tela de Atalhos (js/bimatalhos.js, tecla ?)
     lista como texto, com o que já dá para fazer no lugar. */
  var EM_DESENVOLVIMENTO = [
    { id: "fx-cortar-geometria", nome: "Cortar geometria (um elemento recorta o outro)", hoje: "Para volumes: Modelar volume › Subtrair corta um pelo outro; para o shaft: Arquitetura › Furo na laje." },
    { id: "fx-espelhar-eixo", nome: "Espelhar por eixo (escolhendo um eixo existente)", hoje: "Espelhar (MM) pela linha de dois cliques: com o snap, clique em cima do eixo que já existe." },
    { id: "fx-perfil-corte", nome: "Perfil de corte (a forma do corte só nesta vista)", hoje: "A hachura e a pena do corte se mudam em Vista › Gráficos › Estilos de objeto." },
    { id: "fx-caixa-escopo", nome: "Caixa de escopo (limitar níveis, eixos e vistas por uma caixa nomeada)", hoje: "Para limitar o 3D: Caixa de corte (tecla C) ou Caixa de seleção (BX)." },
    { id: "ctx-justificar", nome: "Justificar o tubo (geratriz de cima, de baixo ou eixo)", hoje: "O tubo é traçado pelo eixo; para encostar a geratriz use Alinhar (AL)." },
    { id: "ctx-desconectar", nome: "Desconectar o tubo do que está ligado nele", hoje: "Apague o trecho (Delete) ou mova a ponta; Mostrar desconexões lista as pontas livres." },
    { id: "mc-segmentar", nome: "Corte com degrau (segmentar a marca de corte)", hoje: "Faça dois cortes e posicione cada um no trecho que interessa." }
  ];
  /* nada mais é "em breve" aqui; o mapa fica (vazio) para quem lê BimFita.ALTERNATIVA */
  var ALTERNATIVA = {};


  /* as abas reorganizadas: onde cada id mora (o id que não existir nesta fita é pulado) */
  var ABA_MODIFICAR = [
    { nome: "Selecionar", ids: ["fx-modificar", "fx-propriedades", "fx-filtro-selecao"] },
    { nome: "Área de transferência", ids: ["fx-copiar-area", "fx-colar", "fx-colar-alinhado"] },
    { nome: "Geometria", ids: ["unir-geometria", "desunir-geometria", "juntas-parede", "alternar-uniao"] },
    { nome: "Modificar", ids: ["alinhar", "deslocamento", "espelhar", "mover-preciso", "copiar", "girar",
      "aparar-canto", "aparar-varios", "dividir-elemento", "matriz", "escala", "fixar", "desafixar", "fx-excluir", "elevar", "snaps-editor"] },
    { nome: "Vista", ids: ["fx-ocultar", "fx-isolar", "fx-restaurar-temp", "fx-sobrepor"] },
    { nome: "Medir", ids: ["fx-medir", "fx-medir-longo", "fx-cota"] },
    { nome: "Criar", ids: ["criar-similar", "criar-grupo"] },
    { nome: "Caixa de seleção", ids: ["fx-caixa-selecao"] }
  ];
  var ABA_VISTA = [
    { nome: "Gráficos", ids: ["modelos-vista", "vg-vista", "fx-filtros", "fx-linhas-finas", "fx-linhas-ocultas-exibir", "fx-linhas-ocultas-remover",
      "estilos-objeto"] },
    { nome: "Apresentação", ids: ["render-fisico", "render-ia", "galeria-ia"] },
    { nome: "Criar", ids: ["fx-vista-3d", "corte-2d", "chamada-detalhe", "planta-2d", "planta-nova", "planta-forro", "planta-estrutural",
      "elevacao-vista", "elevacao-interior", "vista-desenho", "duplicar-vista", "p7-legenda", "tabela-quantidades", "levantamento-material"] },
    { nome: "Composição de folha", ids: ["nova-folha", "posicionar-vista", "fx-titulo-folha", "fx-carimbo", "gerar-pranchas", "revisoes-folha", "lista-folhas", "lista-vistas"] },
    { nome: "Janelas", ids: ["fx-alternar-janelas", "fx-fechar-inativas", "fx-guia-vistas", "lado-a-lado", "nova-vista", "vistas", "max-3d", "janela-3d",
      "fx-interface"] },
    { nome: "Navegar", ids: ["home", "orbita", "voo", "mesa", "imersivo", "atalhos"] },
    { nome: "Exibir", ids: ["visibilidade", "pavimentos", "disciplinas", "sistemas", "conjuntos", "estilo", "materiais", "ultra", "cores-categoria", "cores-categoria-paleta",
      "caixa-corte", "ortogonal", "grade", "ambientes-3d", "navegador-org"] },
    { nome: "Exportar", ids: ["exportar-dxf", "exportar-dwg", "pdf-lote"] }
  ];
  /* na Vista os botões são pequenos (3 por coluna): são ~60 comandos — fora estes, que são o que mais se usa */
  var GRANDES_VISTA = { "modelos-vista": 1, "vg-vista": 1, "render-fisico": 1, "fx-vista-3d": 1, "corte-2d": 1, "planta-2d": 1, "chamada-detalhe": 1,
    "nova-folha": 1, "posicionar-vista": 1, "fx-alternar-janelas": 1, "fx-fechar-inativas": 1, "fx-guia-vistas": 1, "lado-a-lado": 1, "fx-interface": 1 };

  /* a aba contextual: os painéis por categoria da seleção */
  var CTX_PAINEIS = {
    tubos: [{ nome: "Tubo", ids: ["ctx-tipo", "ctx-dn", "ctx-inclinacao", "ctx-isolamento"] },
      { nome: "Conexões", ids: ["ctx-conectar", "ctx-desconexoes"] },
      { nome: "Sistema", ids: ["ctx-inspetor", "ctx-cotar-tubo", "ctx-sel-tipo"] }],
    pecas: [{ nome: "Peça", ids: ["ctx-tipo", "ctx-dn"] },
      { nome: "Conexões", ids: ["ctx-desconexoes"] },
      { nome: "Sistema", ids: ["ctx-inspetor", "ctx-sel-tipo", "ctx-sel-cat"] }],
    geral: [{ nome: "Tipo", ids: ["ctx-tipo"] }, { nome: "Seleção", ids: ["ctx-sel-tipo", "ctx-sel-cat"] }]
  };

  /* barra de acesso rápido: o padrão (o pedido do Rogério, nesta ordem) */
  var CHAVE_QA = "orcapro:bim:acesso-rapido:v1";
  var QA_PADRAO = ["salvar-modelo", "fx-modificar", "desfazer", "refazer", "fx-medir", "p7-cota-alinhada", "identificar-categoria", "p7-texto",
    "fx-vista-3d", "corte-2d", "fx-linhas-finas", "fx-fechar-inativas", "fx-alternar-janelas"];
  /* os botões que já moravam na barra de título (js/bimshell.js) — continuam os MESMOS nós (ids e cliques) */
  var QA_NATIVOS = { "salvar-modelo": "Salvar no projeto", "desfazer": "Desfazer", "refazer": "Refazer" };
  /* teclas que não vêm dos mapas de duas letras */
  var TECLA_FIXA = { "desfazer": "Ctrl+Z", "refazer": "Ctrl+Y", "fx-modificar": "Esc", "fx-excluir": "Delete", "medir": "M", "fx-medir": "M",
    "caixa-corte": "C", "fx-ocultar": "H", "fx-isolar": "I", "home": "F", "grade": "G", "atalhos": "?", "fx-copiar-area": "Ctrl+C", "fx-colar": "Ctrl+V" };
  /* atalhos de duas letras que este arquivo acrescenta (valem fora e dentro do modo de edição) */
  var ATALHOS_FX = { BX: "fx-caixa-selecao", TL: "fx-linhas-finas" };
  var CHAVE_FINAS = "orcapro:bim:linhas-finas";

  var BimFita = {
    ORDEM: ORDEM, FX: FX, CTX: CTX, ABA_MODIFICAR: ABA_MODIFICAR, ABA_VISTA: ABA_VISTA, CTX_PAINEIS: CTX_PAINEIS,
    QA_PADRAO: QA_PADRAO, ALTERNATIVA: ALTERNATIVA, ATALHOS_FX: ATALHOS_FX, EM_DESENVOLVIMENTO: EM_DESENVOLVIMENTO,
    _clip: null, _ctx: null, _ctxAssin: "", _G: null,

    /* ============================================================ MOTOR (puro sobre a fita) */
    _achar: function (id) {
      var r = R(); if (!r) return null;
      var A = r.ABAS;
      for (var i = 0; i < A.length; i++) {
        var ps = arr(A[i].paineis);
        for (var j = 0; j < ps.length; j++) {
          var cs = arr(ps[j].comandos);
          for (var k = 0; k < cs.length; k++) if (cs[k].id === id) return { aba: A[i], painel: ps[j], i: k, c: cs[k] };
        }
      }
      return null;
    },
    _tirar: function (id) { var f = this._achar(id); if (!f) return null; f.painel.comandos.splice(f.i, 1); return f.c; },
    _novo: function (id) {
      var l = FX.concat(CTX);
      for (var i = 0; i < l.length; i++) if (l[i].id === id) {
        var o = {}; for (var k in l[i]) if (l[i].hasOwnProperty(k)) o[k] = l[i][k];
        /* o atalho herda o TIPO do comando de verdade (alterna acende junto) */
        if (o.alias) { var f = this._achar(o.alias); if (f && f.c.tipo === "alterna") o.tipo = "alterna"; }
        /* comando-menu: os comandos de verdade MORAM dentro dele (itens) — BimRibbon.comando e ids() os acham lá */
        if (o.menu) { var self = this; o.itens = o.menu.map(function (id) { return self._tirar(id); }).filter(Boolean); }
        return o;
      }
      return null;
    },
    /* monta a aba `abaId` com os painéis `paineis` (ids MOVIDOS de onde estiverem, ou novos);
       o que já estava na aba e não foi citado fica no painel "Mais" — nada se perde */
    _montarAba: function (abaId, rotulo, paineis, grandes) {
      var r = R(), self = this, A = r.ABAS, aba = r.aba(abaId);
      var novos = paineis.map(function (p) {
        var cs = [];
        p.ids.forEach(function (id) {
          var cm = self._tirar(id) || self._novo(id);
          if (!cm) return;
          if (grandes) {
            var g = !!grandes[id];
            if (!!cm.grande !== g) { var cp = {}; for (var k in cm) if (cm.hasOwnProperty(k)) cp[k] = cm[k]; cp.grande = g; cm = cp; }
          }
          cs.push(cm);
        });
        return { nome: p.nome, comandos: cs };
      }).filter(function (p) { return p.comandos.length; });
      if (aba) {
        var resto = [];
        arr(aba.paineis).forEach(function (p) { arr(p.comandos).forEach(function (cm) { resto.push(cm); }); });
        if (resto.length) novos.push({ nome: "Mais", comandos: resto });
        aba.paineis = novos; aba.rotulo = rotulo;
      } else {
        aba = { id: abaId, rotulo: rotulo, paineis: novos };
        A.push(aba);
      }
      return aba;
    },
    _limparVazios: function () {
      var r = R(), A = r.ABAS;
      A.forEach(function (a) { if (a.paineis) a.paineis = a.paineis.filter(function (p) { return arr(p.comandos).length; }); });
    },
    _ordenar: function () {
      var r = R(), A = r.ABAS, pos = function (a, i) { var k = ORDEM.indexOf(a.id); return k >= 0 ? k * 100 : (ORDEM.indexOf("gerenciar") * 100 - 50 + i * 0.1); };
      var l = A.map(function (a, i) { return { a: a, p: pos(a, i) }; }).sort(function (x, y) { return x.p - y.p; }).map(function (x) { return x.a; });
      A.length = 0; l.forEach(function (a) { A.push(a); });
    },
    /* ⚠ pela FORMA, não por marca no objeto: o `acrescentar` do js/bimribbon.js copia as abas e perde propriedade extra */
    organizado: function () { var r = R(), m = r && r.aba ? r.aba("modificar") : null; return !!(m && arr(m.paineis).length && m.paineis[0].nome === "Selecionar"); },
    /* a fita inteira (abas, painéis e ids), sem os painéis da seleção e sem o rótulo "Modificar | X" */
    _assinFita: function () {
      var r = R(), self = this; if (!r || !r.ABAS) return "";
      return r.ABAS.map(function (a) { return a.id + ":" + arr(a.paineis).filter(function (p) { return !self._ehCtx(p); }).map(function (p) { return p.nome + "=" + arr(p.comandos).map(function (cm) { return cm.id; }).join(","); }).join(";"); }).join("|");
    },
    _ehCtx: function (p) { return arr(p.comandos).length > 0 && arr(p.comandos).every(function (cm) { return /^ctx-/.test(cm.id); }); },
    /* organiza a fita ATUAL, mexendo nos arrays por dentro (o js/bimribbon.js guarda a referência) */
    organizar: function () {
      var r = R();
      if (!r || !r.ABAS || !r.reorganizado || !r.reorganizado()) return { ok: false, motivo: "fita de sempre" };
      /* módulo que chega DEPOIS (o grupo "bim" carrega aos poucos e o _bimCascaAcoes roda de novo) acrescenta
         comandos na fita já organizada: a assinatura muda e a organização roda de novo (mover é idempotente) */
      if (this._assinFita() === this._orgAssin) return { ok: true, ja: true };
      var ctx = this._ctx;
      if (ctx) this.aplicarContexto(null);
      var antes = r.ids().length;
      this._montarAba("modificar", "Modificar", ABA_MODIFICAR, null);
      this._montarAba("vista", "Vista", ABA_VISTA, GRANDES_VISTA);
      this._limparVazios();
      /* as abas sem painel (Analisar perdeu o Desenho, mas tem mais) somem; Arquivo é backstage */
      var A = r.ABAS;
      for (var i = A.length - 1; i >= 0; i--) if (A[i].tipo !== "backstage" && !arr(A[i].paineis).length) A.splice(i, 1);
      this._ordenar();
      this._orgAssin = this._assinFita();
      if (ctx) this.aplicarContexto(ctx);
      var ids = r.ids(), vistos = {}, rep = [];
      ids.forEach(function (id) { if (vistos[id]) rep.push(id); vistos[id] = 1; });
      return { ok: !rep.length, repetidos: rep, antes: antes, depois: ids.length };
    },

    /* ============================================================ CATEGORIA DA SELEÇÃO */
    _selecao: function () { var b = B(); try { return (b && b.selecao ? b.selecao().uids : []) || []; } catch (e) { return []; } },
    _instEstado: function () { var b = B(); try { var e = b && b.editarEstado ? b.editarEstado() : null; return e && e.estado ? (e.estado.instalacoes || null) : null; } catch (e2) { return null; } },
    /* {chave, rotulo} da categoria de UM uid */
    _catDe: function (uid, itens) {
      var u = str(uid), id = u.replace(/^edit:/, ""), I = global.BimInstUI, inst = null;
      try { inst = I && I.ehInst && I.ehInst(u) ? this._instEstado() : null; } catch (e) { inst = null; }
      if (inst || /^edit:(t|k|ac|cx)\d/.test(u)) {
        var em = function (l) { return arr(l).some(function (x) { return x && x.id === id; }); };
        if (inst && em(inst.trechos)) return { k: "tubos", rot: "Tubos" };
        if (inst && em(inst.acessorios)) return { k: "pecas", rot: "Acessórios de tubo" };
        if (inst && em(inst.pecas)) return { k: "pecas", rot: "Aparelhos e peças" };
        if (/^edit:t\d/.test(u)) return { k: "tubos", rot: "Tubos" };
        return { k: "pecas", rot: "Conexões de tubo" };
      }
      var it = itens ? itens[u] : null, nome = it ? (it.catNome || it.cat || "") : "";
      if (/equip|bomba|tanque|aquecedor|reservat/i.test(nome)) return { k: "pecas", rot: "Equipamentos" };
      return { k: "geral", rot: nome || "Elemento" };
    },
    /* a categoria da seleção inteira (null sem seleção); "Vários" quando mistura */
    categoriaSelecao: function (uids) {
      uids = arr(uids || this._selecao());
      if (!uids.length) return null;
      var itens = null, si = SI();
      if (uids.some(function (u) { return !/^edit:(t|k|ac|cx)\d/.test(u); }) && si && si.itens) {
        try { itens = {}; si.itens(null).forEach(function (it) { itens[it.uid] = it; }); } catch (e) { itens = null; }
      }
      var self = this, cats = uids.map(function (u) { return self._catDe(u, itens); }), r0 = cats[0];
      var mesma = cats.every(function (x) { return x.rot === r0.rot; });
      if (mesma) return { k: r0.k, rot: r0.rot, n: uids.length };
      var mesmoK = cats.every(function (x) { return x.k === r0.k; });
      return { k: mesmoK ? r0.k : "geral", rot: "Vários (" + uids.length + ")", n: uids.length };
    },
    /* a aba Modificar acompanha a seleção: rótulo "Modificar | X" e os painéis da categoria no fim */
    aplicarContexto: function (cat) {
      var r = R(), m = r && r.aba ? r.aba("modificar") : null;
      if (!m) return false;
      var self = this;
      m.paineis = arr(m.paineis).filter(function (p) { return !self._ehCtx(p); });
      if (cat) {
        (CTX_PAINEIS[cat.k] || CTX_PAINEIS.geral).forEach(function (p) {
          var cs = p.ids.map(function (id) { return self._ctxCmd(id); }).filter(Boolean);
          if (cs.length) m.paineis.push({ nome: p.nome, comandos: cs });
        });
        m.rotulo = "Modificar | " + cat.rot;
      } else m.rotulo = "Modificar";
      this._ctx = cat || null;
      return true;
    },
    _ctxObjs: null,
    _ctxCmd: function (id) {
      if (!this._ctxObjs) this._ctxObjs = {};
      if (!this._ctxObjs[id]) this._ctxObjs[id] = this._novo(id);
      return this._ctxObjs[id];
    },

    /* ============================================================ AÇÕES */
    _api: function () { var b = B(); try { return b && b.precisao ? b.precisao() : null; } catch (e) { return null; } },
    _exec: function (id) { var s = SH(); if (s && s.executar) return s.executar(id); var cm = CMD(); return cm ? cm.executar(id) : null; },
    _vx: function () { var g = G(); try { return g && g._bimVxEst ? g._bimVxEst() : null; } catch (e) { return null; } },
    _ativa2d: function () {
      var st = this._vx(), P2 = global.Bim2D;
      try { return st && P2 && P2.ehVista2d && P2.ehVista2d(st.ativa) ? st.ativa : null; } catch (e) { return null; }
    },
    _precisaSel: function (o) {
      var s = this._selecao();
      if (!s.length) { var t = "Selecione um ou mais elementos primeiro (clique; Ctrl+clique soma; arraste em janela)" + (o ? " e use " + o : "") + "."; status(t); toast(t, "aviso"); }
      return s;
    },
    /* foca um campo de Propriedades (o tubo: material e DN) — a edição é a que já existe lá */
    _focarProp: function (ids, texto) {
      var s = SH(), d = doc();
      try { if (s && s.alternarLateralFixa && s._raiz && s._raiz.getAttribute("data-rv-lateral-off") === "1") s.alternarLateralFixa(false); } catch (e) {}
      if (s && s._raiz) s._raiz.removeAttribute("data-fx-sem-props");
      var alvo = null;
      for (var i = 0; d && i < ids.length && !alvo; i++) alvo = d.querySelector('.rv-props [data-rv-p="' + ids[i] + '"]');
      if (!alvo) return false;
      try { alvo.scrollIntoView({ block: "center" }); } catch (e1) {}
      try { alvo.focus(); } catch (e2) {}
      alvo.classList.add("fx-realce");
      setTimeout(function () { try { alvo.classList.remove("fx-realce"); } catch (e3) {} }, 1600);
      status(texto);
      return true;
    },
    acoes: function () {
      var self = this, a = {};
      a["fx-modificar"] = function () {
        var n = 0, cm = CMD(); try { n = cm ? cm.cancelar() : 0; } catch (e) {}
        if (self._m2) { self.medir2d(false); n++; }
        var api = self._api(), d = doc();
        /* a ferramenta do editor (mover, copiar, parede…) sai pelo Esc dela, que não limpa a seleção quando há ferramenta */
        try { if (api && api.ferramenta && api.ferramenta() && d) d.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); } catch (e2) {}
        status((n ? "Ferramenta solta. " : "") + "Modificar: clique seleciona, Ctrl+clique soma, arrastar faz janela; Esc limpa.");
        return true;
      };
      a["fx-propriedades"] = function () {
        var s = SH(); if (!s || !s._raiz) return false;
        var off = s._raiz.getAttribute("data-rv-lateral-off") === "1" || s._raiz.getAttribute("data-fx-sem-props") === "1";
        if (off) { s._raiz.removeAttribute("data-fx-sem-props"); if (s._raiz.getAttribute("data-rv-lateral-off") === "1") s.alternarLateralFixa(false); }
        else { s._raiz.setAttribute("data-fx-sem-props", "1"); if (s._raiz.getAttribute("data-fx-sem-nav") === "1") s.alternarLateralFixa(true); }
        self._relayout();
        status(off ? "Propriedades à vista." : "Propriedades escondida (o botão traz de volta).");
        return true;
      };
      a["fx-filtro-selecao"] = function () { return self.filtroSelecao(); };
      a["fx-copiar-area"] = function () {
        var api = self._api(), ids = [];
        try { ids = api && api.selecao ? api.selecao() : []; } catch (e) { ids = []; }
        if (!ids.length) {
          var t = self._selecao().length ? "A área de transferência leva elementos modelados aqui; a peça do IFC importado não se copia (o arquivo é de outro programa)." : "Selecione o que vai copiar.";
          status(t); toast(t, "aviso"); return true;
        }
        self._clip = { ids: ids.slice(), em: Date.now() };
        status(ids.length + (ids.length === 1 ? " elemento copiado" : " elementos copiados") + " para a área de transferência. Colar pede o ponto base e o destino.");
        return true;
      };
      a["fx-colar"] = function () {
        var clip = self._clip, b = B();
        if (!clip || !clip.ids.length) { var t = "A área de transferência está vazia: selecione e use Copiar (Ctrl+C) antes."; status(t); toast(t, "aviso"); return true; }
        var feitos = []; try { feitos = b.selecionar(clip.ids.map(function (i) { return "edit:" + i; }), "trocar") || []; } catch (e) { feitos = []; }
        if (!feitos.length) { var t2 = "Os elementos copiados não existem mais no modelo (apagados ou desfeitos)."; status(t2); toast(t2, "aviso"); self._clip = null; return true; }
        self._exec("copiar");
        status("Colar: clique o ponto base e depois o destino (" + feitos.length + (feitos.length === 1 ? " elemento" : " elementos") + "). Esc encerra.");
        return true;
      };
      a["fx-colar-alinhado"] = function () {
        var clip = self._clip, b = B();
        if (clip && clip.ids.length) { try { b.selecionar(clip.ids.map(function (i) { return "edit:" + i; }), "trocar"); } catch (e) {} }
        if (!self._selecao().length) { var t = "Copie (ou selecione) o grupo que vai colar nos níveis."; status(t); toast(t, "aviso"); return true; }
        self._exec("colar-niveis");
        return true;
      };
      a["fx-excluir"] = function () {
        var s = self._precisaSel("Excluir"); if (!s.length) return true;
        var si = SI(); if (si && si.apagar) { si.apagar(si.alvos ? si.alvos() : s); return true; }
        return false;
      };
      a["fx-ocultar"] = function () { var si = SI(), s = self._precisaSel("Ocultar"); if (s.length && si) si.ocultar(si.alvos()); return true; };
      a["fx-isolar"] = function () { var si = SI(), s = self._precisaSel("Isolar"); if (s.length && si) si.isolar(si.alvos()); return true; };
      a["fx-restaurar-temp"] = function () { var si = SI(); if (si && si.mostrarTodos) si.mostrarTodos(); else { var b = B(); if (b && b.restaurarVisibilidade) b.restaurarVisibilidade(); status("Tudo visível de novo."); } return true; };
      a["fx-sobrepor"] = function () {
        if (self._ativa2d()) return self._exec("vg-vista") !== false;
        var t = "Sobrepor gráficos vale na vista 2D (planta, corte, elevação): abra uma e use de novo. No 3D, use Vista › Gráficos › Cores por categoria (a sobreposição por elemento ainda não existe).";
        status(t); toast(t, "aviso"); return true;
      };
      a["fx-filtros"] = function () {
        if (self._ativa2d()) return self._exec("vg-vista") !== false;
        var t = "Os filtros da vista ficam na Visibilidade/Gráficos da vista 2D (aba Filtros): abra uma planta, corte ou elevação e use de novo.";
        status(t); toast(t, "aviso"); return true;
      };
      a["fx-caixa-selecao"] = function () { self.caixaSelecao(); return true; };
      /* MEDIR: no 3D é a trena (o comando de sempre); com uma planta/corte/elevação ativa, a medida da vista 2D */
      a["fx-medir"] = function () {
        if (self._ativa2d()) { self.medir2d(!(self._m2 && !self._m2.longo)); return true; }
        if (self._m2) self.medir2d(false);
        var cmd = CMD(), res = cmd ? cmd.executar("medir") : null;
        if (res && !res.ok && res.motivo) { status(res.motivo); toast(res.motivo, "aviso"); }
        return true;
      };
      a["fx-linhas-finas"] = function (e) { self.linhasFinas(e && e.ligado != null ? !!e.ligado : null); return true; };
      a["fx-vista-3d"] = function () {
        var g = G(), b = B();
        try { if (g && g._bimVxAtivar) g._bimVxAtivar("3d"); } catch (e) {}
        try { if (b && b.home) b.home(); } catch (e2) {}
        status("Vista {3D}: o modelo inteiro enquadrado.");
        return true;
      };
      a["fx-carimbo"] = function () {
        var st = self._vx(), v = null, g = G(), s = SH();
        if (st) st.lista.forEach(function (x) { if (x.id === st.ativa && x.tipo === "folha") v = x; });
        if (v) {
          try { if (s._raiz.getAttribute("data-rv-lateral-off") === "1") s.alternarLateralFixa(false); s._raiz.removeAttribute("data-fx-sem-props"); } catch (e) {}
          status("Carimbo da folha \"" + (v.nome || "") + "\": os campos estão em Propriedades (à esquerda).");
          return true;
        }
        try { if (g && g.bimPranchas) g.bimPranchas(); } catch (e2) {}
        status("Abra uma folha nas Pranchas: os campos do carimbo aparecem em Propriedades.");
        return true;
      };
      a["fx-alternar-janelas"] = function () { self.menuJanelas(); return true; };
      a["fx-fechar-inativas"] = function () {
        var st = self._vx(), g = G(); if (!st || !g || !g._bimVxFechar) return false;
        var fora = st.lista.filter(function (v) { return v.id !== st.ativa; }).map(function (v) { return v.id; });
        fora.forEach(function (id) { try { g._bimVxFechar(id); } catch (e) {} });
        var vivas = st.lista.length;
        status(fora.length ? fora.length + (fora.length === 1 ? " vista inativa fechada" : " vistas inativas fechadas") + (vivas ? "." : " — fica a {3D}.") : "Nenhuma vista inativa para fechar.");
        return true;
      };
      a["fx-guia-vistas"] = function () {
        var st = self._vx(), g = G(); if (!st || !g || !g._bimVxLayout) return false;
        st.lado = false; g._bimVxLayout();
        status("Vistas em guias: uma de cada vez (Vistas lado a lado volta à grade).");
        return true;
      };
      a["fx-interface"] = function () { self.menuInterface(); return true; };
      /* contextuais */
      a["ctx-tipo"] = function () {
        if (self._ctx && self._ctx.k !== "geral" && self._focarProp(["itp:material", "it:material", "ik:dn", "ik:material"], "Tipo/material do elemento em Propriedades: a troca vale para a seleção (um Ctrl+Z).")) return true;
        var si = SI(); if (si && si.trocarTipo) { si.trocarTipo(); return true; }
        return false;
      };
      a["ctx-dn"] = function () {
        if (self._focarProp(["it:dn", "ik:dn"], "Diâmetro/tamanho em Propriedades: escolha na lista (um Ctrl+Z desfaz).")) return true;
        var t = "Este elemento não tem diâmetro para trocar."; status(t); toast(t, "aviso"); return true;
      };
      a["ctx-sel-tipo"] = function () { return self._selPor("tipo"); };
      a["ctx-sel-cat"] = function () { return self._selPor("cat"); };
      /* P3 (junção 18/10/2026): os que eram "em breve" e agora fazem */
      a["fx-medir-longo"] = function () { return self.medirAoLongo(); };
      a["fx-linhas-ocultas-exibir"] = function () { return self.linhasOcultas(true); };
      a["fx-linhas-ocultas-remover"] = function () { return self.linhasOcultas(false); };
      a["fx-titulo-folha"] = function () { return self.tituloFolha(); };
      a["ctx-inclinacao"] = function () { return self.inclinacaoTela(); };
      a["ctx-isolamento"] = function () { return self.isolamentoTela(); };
      a["ctx-conectar"] = function () { return self.conectarTela(); };
      /* os atalhos: executam o comando de verdade */
      FX.concat(CTX).forEach(function (cm) {
        if (!cm.alias || a[cm.id]) return;
        a[cm.id] = function () {
          var cmd = CMD(), res = cmd ? cmd.executar(cm.alias) : null;
          if (res && !res.ok && res.motivo) { status(res.motivo); toast(res.motivo, "aviso"); }
          return true;
        };
      });
      return a;
    },
    _selPor: function (k) {
      var si = SI(), s = this._selecao();
      if (!s.length || !si || !si.selecionarPor) { this._precisaSel(); return true; }
      var r = si.selecionarPor(s[s.length - 1], k, "projeto", null, false);
      if (!r || !r.length) status("Nenhum outro elemento com o mesmo " + (k === "tipo" ? "tipo" : "categoria") + " para selecionar.");
      return true;
    },

    /* ---- CAIXA DE SELEÇÃO (BX) ---- */
    caixaSelecao: function () {
      var s = this._precisaSel("a Caixa de seleção (BX)"); if (!s.length) return { ok: false, motivo: "sem selecao" };
      var b = B(), g = G();
      if (!b || !b.caixaUids || !b.caixaCorteEm) { status("A caixa de seleção precisa do visualizador 3D carregado."); return { ok: false }; }
      var cx = b.caixaUids(s);
      if (!cx) { var t = "Os elementos selecionados não têm geometria no 3D (anotação, cota ou vista)."; status(t); toast(t, "aviso"); return { ok: false, motivo: "sem geometria" }; }
      /* folga de 5% (mín. 10 cm) para a peça não encostar no plano de corte */
      var dx = Math.max(0.1, (cx.max[0] - cx.min[0]) * 0.05), dy = Math.max(0.1, (cx.max[1] - cx.min[1]) * 0.05), dz = Math.max(0.1, (cx.max[2] - cx.min[2]) * 0.05);
      var min = [cx.min[0] - dx, cx.min[1] - dy, cx.min[2] - dz], max = [cx.max[0] + dx, cx.max[1] + dy, cx.max[2] + dz];
      try { if (g && g._bimVxAtivar && g._bimVxEst && g._bimVxEst().ativa !== "3d") g._bimVxAtivar("3d"); } catch (e) {}
      var ok = !!b.caixaCorteEm(min, max, [0.62, 0.48, 0.62]);
      try { var r = R(); if (r && ok) { r.setAtivo("caixa-corte", true); } } catch (e2) {}
      status(ok ? "Caixa de seleção: " + s.length + (s.length === 1 ? " elemento isolado" : " elementos isolados") + " na vista {3D} por uma caixa de corte justa. Desligue a Caixa de corte (tecla C) para ver tudo." : "Não consegui ligar a caixa de corte.");
      return { ok: ok, min: min, max: max, n: s.length };
    },

    /* ============================================================ P3 (junção 18/10/2026): os que eram "em breve"
     * Motores PUROS (Node: tools/test-bimfita.js [7]) + a tela de cada um. Nada de número de norma: a inclinação é a
     * que a pessoa digita; o TOL_NO é o mesmo do js/biminst.js. */
    /* comprimento de uma polilinha [{x,y}] (m) */
    comprimentoPolilinha: function (pts) {
      var s = 0, l = arr(pts);
      for (var i = 1; i < l.length; i++) { var dx = l[i].x - l[i - 1].x, dy = l[i].y - l[i - 1].y; s += Math.sqrt(dx * dx + dy * dy); }
      return s;
    },
    /* a soma 3D dos TUBOS (trechos) entre os uids; o resto é contado à parte */
    comprimentoTubos: function (estado, uids) {
      var por = {}; arr(estado && estado.instalacoes && estado.instalacoes.trechos).forEach(function (t) { por["edit:" + t.id] = t; });
      var tot = 0, n = 0, outros = 0;
      arr(uids).forEach(function (u) { var t = por[u]; if (!t || !t.p1 || !t.p2) { outros++; return; } tot += d3(t.p1, t.p2); n++; });
      return { total: tot, n: n, outros: outros };
    },
    /* TÍTULO DA VISTA na folha: ix = o bloco selecionado (−1 = nenhum). Devolve uma CÓPIA da folha. */
    titulosNaFolha: function (folha, ix) {
      var f = JSON.parse(JSON.stringify(folha || {})), bl = arr(f.blocos), vps = [];
      bl.forEach(function (b, i) { if (b && b.tipo === "viewport") vps.push(i); });
      if (!vps.length) return { n: 0, folha: f, msg: "Esta folha não tem vista posicionada: arraste uma planta ou um corte do Navegador para ela (ou Vista › Posicionar vista)." };
      if (ix >= 0 && bl[ix] && bl[ix].tipo === "viewport") {
        var on = bl[ix].mostrarTitulo === false;
        bl[ix].mostrarTitulo = on;
        return { n: 1, folha: f, acao: on ? "mostrar" : "ocultar", msg: "Título da vista \"" + (bl[ix].tituloVista || "") + "\" " + (on ? "posto na folha." : "escondido (o botão traz de volta).") };
      }
      var n = 0; vps.forEach(function (i) { if (bl[i].mostrarTitulo === false) { bl[i].mostrarTitulo = true; n++; } });
      return { n: n, folha: f, acao: "mostrar", msg: n ? "Título posto em " + n + (n === 1 ? " vista" : " vistas") + " da folha." : "Todas as vistas desta folha já mostram o título (selecione uma vista na folha para esconder o dela)." };
    },
    _trechos: function (estado) { var o = {}; arr(estado && estado.instalacoes && estado.instalacoes.trechos).forEach(function (t) { if (t && t.id != null) o[t.id] = t; }); return o; },
    /* INCLINAÇÃO: a ponta final (p2) desce a partir da inicial (p1) — esgoto e pluvial escoam de p1 para p2 — e as
       pontas dos outros trechos que estavam nela vão junto (BimInst.moverCota). Vários trechos: um depois do outro,
       sobre a geometria já mudada (a cadeia acompanha). */
    opsInclinacao: function (BI, estado, ids, pct) {
      var p = Number(String(pct == null ? "" : pct).replace(",", "."));
      if (String(pct == null ? "" : pct).trim() === "" || !isFinite(p) || p < 0 || p > 100) return { ok: false, erro: "Inclinação inválida: digite de 0 a 100 (%).", ops: [] };
      if (!BI || !BI.moverCota) return { ok: false, erro: "O motor das instalações não está carregado.", ops: [] };
      var tr = arr(estado && estado.instalacoes && estado.instalacoes.trechos).map(function (t) { var o = {}; for (var k in t) if (t.hasOwnProperty(k)) o[k] = t[k]; o.p1 = cp3(t.p1); o.p2 = cp3(t.p2); return o; });
      var est = { instalacoes: { trechos: tr } }, por = {}, saida = {}, ordem = [], n = 0;
      tr.forEach(function (t) { por[t.id] = t; });
      for (var i = 0; i < arr(ids).length; i++) {
        var t = por[ids[i]]; if (!t) continue;
        var Lh = Math.sqrt(Math.pow(t.p2.x - t.p1.x, 2) + Math.pow(t.p2.z - t.p1.z, 2));
        if (!(Lh > TOL_NO)) return { ok: false, erro: "O trecho " + t.id + " é vertical (prumada): inclinação não se aplica.", ops: [] };
        var r = BI.moverCota(est, t.id, "p2", r4(t.p1.y - Lh * p / 100));
        if (!r || !r.ok) return { ok: false, erro: (r && r.erro) || "A inclinação não coube.", ops: [] };
        r.ops.forEach(function (o) { var w = por[o.id]; if (w) { w.p1 = cp3(o.p1); w.p2 = cp3(o.p2); } if (!saida[o.id]) ordem.push(o.id); saida[o.id] = o; });
        n++;
      }
      if (!n) return { ok: false, erro: "Selecione um tubo para mudar a inclinação.", ops: [] };
      return { ok: true, n: n, ops: ordem.map(function (k) { return saida[k]; }) };
    },
    /* ISOLAMENTO: o próximo da lista do material (cobre: sem ⇄ com; duto de chapa: sem ⇄ colada). Material sem as duas
       opções não muda e diz por quê (o PVC não tem; o cobre frigorígeno é sempre isolado). */
    opsIsolamento: function (BI, estado, ids) {
      if (!BI || !BI.MATERIAIS) return { ok: false, erro: "O motor das instalações não está carregado.", ops: [], nao: [] };
      var por = this._trechos(estado), ops = [], nao = [], vistos = {};
      arr(ids).forEach(function (id) {
        var t = por[id]; if (!t) return;
        var M = BI.MATERIAIS[t.material] || {}, isos = arr(M.isos), nome = M.nome || t.material;
        if (isos.length < 2) { var m = isos.length ? nome + ": sempre " + (isos[0] === "com" ? "isolado" : isos[0]) : nome + ": não tem opção de isolamento"; if (!vistos[m]) { vistos[m] = 1; nao.push(m); } return; }
        var at = isos.indexOf(t.iso) >= 0 ? t.iso : (isos.indexOf(M.iso) >= 0 ? M.iso : isos[0]);
        ops.push({ op: "instAlterar", id: t.id, iso: isos[(isos.indexOf(at) + 1) % isos.length] });
      });
      if (!ops.length) return { ok: false, erro: nao.length ? "Nada mudou — " + nao.join("; ") + "." : "Selecione um tubo para pôr ou tirar o isolamento.", ops: [], nao: nao };
      return { ok: true, ops: ops, nao: nao };
    },
    /* CONECTAR A: a ponta LIVRE do 1º trecho vai até o 2º — à ponta dele (a mais perto) ou ao MEIO (o 2º é dividido no
       nó, BimInst.dividirTrecho). Mesmo sistema; já ligados (≤ TOL_NO) não faz nada. */
    opsConectar: function (BI, estado, idA, idB) {
      if (!BI || !BI.opDoTrecho || !BI.dividirTrecho) return { ok: false, erro: "O motor das instalações não está carregado.", ops: [] };
      var tr = arr(estado && estado.instalacoes && estado.instalacoes.trechos), por = this._trechos(estado), A = por[idA], Bt = por[idB];
      if (!A || !Bt || A === Bt) return { ok: false, erro: "Selecione dois tubos: o que vai ligar e, com Ctrl+clique, o de destino.", ops: [] };
      if (A.sistema !== Bt.sistema) return { ok: false, erro: "Os tubos são de sistemas diferentes (" + A.sistema + " × " + Bt.sistema + "): não se ligam.", ops: [] };
      /* já têm um nó em comum: não liga de novo (senão a ponta livre do outro lado viraria um triângulo) */
      if (["p1", "p2"].some(function (k) { return d3(A[k], Bt.p1) <= TOL_NO || d3(A[k], Bt.p2) <= TOL_NO; })) return { ok: false, erro: "Os dois tubos já estão ligados.", ops: [] };
      var livre = function (k) { return !tr.some(function (o) { return o.id !== A.id && (d3(o.p1, A[k]) <= TOL_NO || d3(o.p2, A[k]) <= TOL_NO); }); };
      var pontas = ["p1", "p2"].filter(livre);
      if (!pontas.length) return { ok: false, erro: "O 1º tubo não tem ponta livre: as duas já estão ligadas.", ops: [] };
      var mel = null;
      pontas.forEach(function (k) {
        var E = A[k];
        ["p1", "p2"].forEach(function (kb) { var d = d3(E, Bt[kb]); if (!mel || d < mel.d) mel = { k: k, d: d, P: cp3(Bt[kb]), meio: false }; });
        var v = { x: Bt.p2.x - Bt.p1.x, y: Bt.p2.y - Bt.p1.y, z: Bt.p2.z - Bt.p1.z }, L2 = v.x * v.x + v.y * v.y + v.z * v.z;
        if (L2 > 0) {
          var s = ((E.x - Bt.p1.x) * v.x + (E.y - Bt.p1.y) * v.y + (E.z - Bt.p1.z) * v.z) / L2;
          if (s > 0.001 && s < 0.999) { var P = { x: Bt.p1.x + v.x * s, y: Bt.p1.y + v.y * s, z: Bt.p1.z + v.z * s }, dm = d3(E, P); if (dm < mel.d - 1e-9) mel = { k: k, d: dm, P: P, meio: true }; }
        }
      });
      if (mel.d <= TOL_NO) return { ok: false, erro: "Os dois tubos já estão ligados.", ops: [] };
      var ops = [];
      if (mel.meio) {
        var dv = BI.dividirTrecho(estado, Bt.id, mel.P);
        if (!dv || dv.length !== 2) return { ok: false, erro: "Não deu para dividir o 2º tubo nesse ponto (perto demais da ponta).", ops: [] };
        ops = ops.concat(dv); mel.P = cp3(dv[0].p2);
      }
      var oA = BI.opDoTrecho(A); oA[mel.k] = cp3(mel.P);
      if (oA.continua === mel.k) delete oA.continua; else if (oA.continua === "ambos") oA.continua = mel.k === "p1" ? "p2" : "p1";
      if (!(d3(oA.p1, oA.p2) > TOL_NO)) return { ok: false, erro: "O 1º tubo ficaria sem comprimento.", ops: [] };
      ops.push(oA);
      return { ok: true, ops: ops, meio: mel.meio, ponta: mel.k, d: mel.d };
    },
    /* ---- as telas ---- */
    _estadoEd: function () { var b = B(); try { var e = b && b.editarEstado ? b.editarEstado() : null; return e ? e.estado : null; } catch (x) { return null; } },
    _trechosSel: function () { var por = this._trechos(this._estadoEd()), out = []; this._selecao().forEach(function (u) { var id = String(u).replace(/^edit:/, ""); if (/^edit:/.test(u) && por[id] && out.indexOf(id) < 0) out.push(id); }); return out; },
    _despachar: function (ops, rotulo) {
      var PU = global.BimPropsUI, b = B();
      /* op "trecho" (inclinação, conectar) vai SEMPRE em lote: o despachar de uma op só manda pelo b2Op, que não é das instalações */
      var lote = ops.some(function (o) { return o && o.op === "trecho"; });
      try { if (PU && PU.despachar && !lote) return !!PU.despachar(ops, rotulo); } catch (e) {}
      try { return !!(b && b.editarLote && b.editarLote({ op: "lote", id: "fx-" + Date.now().toString(36), origem: "fita", pedido: rotulo, ops: ops })); } catch (e2) { return false; }
    },
    _aviso: function (t) { status(t); toast(t, "aviso"); },
    medirAoLongo: function () {
      if (this._ativa2d()) { this.medir2d(!(this._m2 && this._m2.longo), true); return true; }
      if (this._m2) this.medir2d(false);
      var r = this.comprimentoTubos(this._estadoEd(), this._selecao());
      if (!r.n) { this._aviso("Medir ao longo: abra uma planta, corte ou elevação (cada clique soma um trecho) ou selecione tubos no 3D (soma o comprimento deles)."); return true; }
      var t = "Ao longo: " + (Math.round(r.total * 1000) / 1000).toFixed(3).replace(".", ",") + " m em " + r.n + (r.n === 1 ? " tubo" : " tubos") + (r.outros ? " (" + r.outros + " outro(s) elemento(s) da seleção fora da soma)" : "") + ".";
      this._medLongo = r; status(t);
      return true;
    },
    linhasOcultas: function (on) {
      var b = B(), s = this._selecao(), g = G();
      if (!b || !b.linhasOcultas) { status("As linhas ocultas precisam do visualizador 3D carregado."); return false; }
      if (on) {
        if (!s.length) { this._precisaSel("Exibir linhas ocultas"); return true; }
        try { if (g && g._bimVxAtivar && g._bimVxEst && g._bimVxEst().ativa !== "3d") g._bimVxAtivar("3d"); } catch (e) {}
        var n = b.linhasOcultas(s, true);
        var cortou = false; try { cortou = !!(b.linhasOcultasEstado && b.linhasOcultasEstado().cortou); } catch (eC) {}
        if (n) status("Linhas ocultas: as arestas de " + n + (n === 1 ? " elemento" : " elementos") + " tracejadas no {3D}, também o que está atrás de outro." + (cortou ? " A seleção é grande: o resto ficou de fora (selecione menos)." : "") + " Remover linhas ocultas tira.");
        else this._aviso("Os selecionados não têm geometria no 3D (anotação, cota ou vista).");
        return true;
      }
      var n2 = b.linhasOcultas(s.length ? s : null, false);
      status(n2 ? "Linhas ocultas removidas de " + n2 + (n2 === 1 ? " elemento." : " elementos.") : "Nenhuma linha oculta para remover" + (s.length ? " nos selecionados." : "."));
      return true;
    },
    tituloFolha: function () {
      var st = this._vx(), v = null, g = G(), Fo = global.BimFolhaUI;
      if (st) st.lista.forEach(function (x) { if (x.id === st.ativa && x.tipo === "folha") v = x; });
      var a = v && Fo && Fo.achar ? Fo.achar(v.id) : null;
      if (!a) {
        try { if (g && g.bimPranchas) g.bimPranchas(); } catch (e) {}
        status("Título da vista: abra uma folha. Com uma vista posicionada selecionada, mostra ou esconde o título dela; sem seleção, põe o título em todas.");
        return true;
      }
      var ix = Fo._sel && Fo._sel.id === v.id ? Fo._sel.ix : -1, r = this.titulosNaFolha(a.folha, ix);
      if (r.n) { Fo.gravarFolha(a, r.folha); Fo.pintar(v.id); if (ix >= 0 && Fo._pintarProps) Fo._pintarProps(); }
      status(r.msg);
      return true;
    },
    inclinacaoTela: function () {
      var ids = this._trechosSel(), self = this, est = this._estadoEd();
      if (!ids.length) { this._aviso("Inclinação: selecione um ou mais tubos."); return true; }
      var t = this._trechos(est)[ids[0]], Lh = t ? Math.sqrt(Math.pow(t.p2.x - t.p1.x, 2) + Math.pow(t.p2.z - t.p1.z, 2)) : 0;
      var atual = Lh > TOL_NO ? (Math.round((t.p1.y - t.p2.y) / Lh * 10000) / 100) : 0;
      if (!global.UI || !global.UI.modal) return false;
      global.UI.modal("Inclinação do trecho", '<label style="display:flex;gap:8px;align-items:center">Inclinação (%) <input data-fx-incl type="text" inputmode="decimal" style="width:7em" value="' + esc(String(atual).replace(".", ",")) + '"></label>' +
        '<p class="muted" style="margin:8px 0 0">' + ids.length + (ids.length === 1 ? " trecho" : " trechos") + ". A ponta final desce a partir da inicial (esgoto e pluvial escoam da inicial para a final); as pontas ligadas nela vão junto. Um Ctrl+Z desfaz.</p>", [
        { texto: "Cancelar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } },
        { texto: "Aplicar", onClick: function () { var d = doc(), inp = d && d.querySelector("[data-fx-incl]"), v = inp ? inp.value : ""; global.UI.fecharModal(); self.aplicarInclinacao(ids, v); } }
      ]);
      return true;
    },
    aplicarInclinacao: function (ids, pct) {
      var r = this.opsInclinacao(global.BimInst, this._estadoEd(), ids, pct);
      if (!r.ok) { this._aviso(r.erro); return r; }
      if (!this._despachar(r.ops, "Inclinação")) { this._aviso("O editor recusou a mudança de inclinação."); return { ok: false }; }
      status("Inclinação " + String(pct).replace(".", ",") + " % em " + r.n + (r.n === 1 ? " trecho" : " trechos") + " (" + r.ops.length + " trecho(s) acompanharam). Um Ctrl+Z desfaz.");
      return r;
    },
    isolamentoTela: function () {
      var ids = this._trechosSel();
      if (!ids.length) { this._aviso("Isolamento: selecione um ou mais tubos."); return true; }
      var r = this.opsIsolamento(global.BimInst, this._estadoEd(), ids);
      if (!r.ok) { this._aviso(r.erro); return true; }
      if (!this._despachar(r.ops, "Isolamento")) { this._aviso("O editor recusou a troca do isolamento."); return true; }
      status("Isolamento trocado em " + r.ops.length + (r.ops.length === 1 ? " trecho" : " trechos") + " (" + r.ops.map(function (o) { return o.iso; }).join(", ") + ")" + (r.nao.length ? "; sem mudança — " + r.nao.join("; ") : "") + ".");
      return true;
    },
    conectarTela: function () {
      var ids = this._trechosSel();
      if (ids.length < 2) { this._aviso("Conectar a: selecione o tubo que vai ligar e, com Ctrl+clique, o tubo de destino; depois clique em Conectar a."); return true; }
      var r = this.opsConectar(global.BimInst, this._estadoEd(), ids[0], ids[1]);
      if (!r.ok) { this._aviso(r.erro); return true; }
      if (!this._despachar(r.ops, "Conectar a")) { this._aviso("O editor recusou a ligação."); return true; }
      status("Ligado: a ponta livre do " + ids[0] + " foi " + (r.meio ? "ao meio do " + ids[1] + " (dividido no nó)" : "à ponta do " + ids[1]) + ". Um Ctrl+Z desfaz.");
      return true;
    },

    /* ---- MEDIR NA VISTA 2D ----
     * Dois cliques na planta/corte/elevação ativa: a distância (e o Δ em x e y) na barra de status e um traço
     * provisório com o valor. A coordenada do desenho é a do mundo (m). Snap nas pontas das linhas do próprio
     * desenho (10 px). Esc, Modificar ou trocar de vista encerram; a medida não vai para o modelo. */
    _m2: null,
    /* longo = MEDIR AO LONGO (P3): cada clique soma um trecho à polilinha; Backspace tira o último ponto; Esc encerra */
    medir2d: function (on, longo) {
      var self = this, d = doc(), m = this._m2;
      if (!on) {
        if (m) {
          try { m.cont.removeEventListener("pointerdown", m.down, true); m.cont.removeEventListener("pointermove", m.move, true); } catch (e) {}
          try { d.removeEventListener("keydown", m.tecla, true); } catch (e2) {}
          try { if (m.g && m.g.parentNode) m.g.parentNode.removeChild(m.g); } catch (e3) {}
          try { m.cont.style.cursor = m.cursor || ""; } catch (e4) {}
        }
        this._m2 = null;
        try { var r0 = R(); if (r0 && r0.comando("fx-medir")) r0.setAtivo("fx-medir", false); if (r0 && r0.comando("fx-medir-longo")) r0.setAtivo("fx-medir-longo", false); } catch (e5) {}
        return false;
      }
      if (m) this.medir2d(false);
      var id = this._ativa2d(); if (!id || !d) return false;
      var svg = d.querySelector('.bim-tela[data-ativa="1"] .d2-vista-tela svg'), cont = svg ? svg.parentNode : null;
      if (!svg || !cont) { status("Abra uma planta, corte ou elevação para medir nela."); return false; }
      try { var cm = CMD(); if (cm) cm.cancelar(); } catch (eC) {}
      var NS = "http://www.w3.org/2000/svg";
      var g = d.createElementNS(NS, "g"); g.setAttribute("class", "fx-med2d"); g.setAttribute("pointer-events", "none"); svg.appendChild(g);
      m = { id: id, svg: svg, cont: cont, g: g, a: null, b: null, cursor: cont.style.cursor, pts: null, longo: !!longo, lista: [] };
      this._m2 = m;
      var paraSvg = function (cx, cy) { var M = svg.getScreenCTM(); if (!M) return null; var q = svg.createSVGPoint(); q.x = cx; q.y = cy; q = q.matrixTransform(M.inverse()); return { x: q.x, y: q.y }; };
      var escala = function () { var M = svg.getScreenCTM(); return M ? Math.max(1e-9, Math.sqrt(M.a * M.a + M.b * M.b)) : 1; };
      var pontos = function () {
        if (m.pts) return m.pts;
        var out = [], R0 = svg.getScreenCTM(); if (!R0) return out;
        var inv = R0.inverse();
        var add = function (el, x, y) { var M = el.getScreenCTM(); if (!M) return; var q = svg.createSVGPoint(); q.x = +x; q.y = +y; q = q.matrixTransform(inv.multiply(M)); if (isFinite(q.x) && isFinite(q.y)) out.push({ x: q.x, y: q.y }); };
        [].slice.call(svg.querySelectorAll("line,polyline,polygon,path,rect")).some(function (el) {
          if (el.closest && el.closest(".fx-med2d")) return false;
          var t = el.tagName.toLowerCase();
          try {
            if (t === "line") { add(el, el.getAttribute("x1"), el.getAttribute("y1")); add(el, el.getAttribute("x2"), el.getAttribute("y2")); }
            else if (t === "rect") { var x = +el.getAttribute("x") || 0, y = +el.getAttribute("y") || 0, w = +el.getAttribute("width") || 0, h = +el.getAttribute("height") || 0; add(el, x, y); add(el, x + w, y); add(el, x, y + h); add(el, x + w, y + h); }
            else if (t === "path") { var dd = el.getAttribute("d") || "", rx = /[MLml]\s*(-?[\d.]+(?:e-?\d+)?)[\s,]+(-?[\d.]+(?:e-?\d+)?)/g, k; if (!/[ml]/.test(dd.replace(/[eE]-?\d/g, ""))) while ((k = rx.exec(dd))) add(el, k[1], k[2]); }
            else { var nums = (el.getAttribute("points") || "").trim().split(/[\s,]+/); for (var i = 0; i + 1 < nums.length; i += 2) add(el, nums[i], nums[i + 1]); }
          } catch (eP) {}
          return out.length > 40000;
        });
        m.pts = out;
        return out;
      };
      var snap = function (p) {
        var tol = 10 / escala(), best = null, bd = tol;
        pontos().forEach(function (q) { var dx = q.x - p.x, dy = q.y - p.y, dist = Math.sqrt(dx * dx + dy * dy); if (dist < bd) { bd = dist; best = q; } });
        return best ? { x: best.x, y: best.y, snap: true } : { x: p.x, y: p.y, snap: false };
      };
      var fmt = function (v) { return (Math.round(v * 1000) / 1000).toFixed(3).replace(".", ","); };
      var desenhar = function (a, b) {
        g.innerHTML = "";
        if (!a) return;
        var k = 1 / escala(), el = function (tag, at) { var e = d.createElementNS(NS, tag); for (var n in at) if (at.hasOwnProperty(n)) e.setAttribute(n, at[n]); g.appendChild(e); return e; };
        el("circle", { cx: a.x, cy: a.y, r: 4 * k, fill: "none", stroke: "#d97706", "stroke-width": 1.5 * k });
        if (!b) return;
        el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: "#d97706", "stroke-width": 1.5 * k, "stroke-dasharray": (6 * k) + " " + (3 * k) });
        el("circle", { cx: b.x, cy: b.y, r: 4 * k, fill: "none", stroke: "#d97706", "stroke-width": 1.5 * k });
        var dist = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
        var t = el("text", { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 6 * k, "font-size": 12 * k, "text-anchor": "middle", fill: "#b45309", stroke: "#fff", "stroke-width": 3 * k, "paint-order": "stroke" });
        t.textContent = fmt(dist) + " m";
      };
      /* AO LONGO: a polilinha com o valor de cada trecho e o TOTAL no último ponto */
      var desenharLongo = function (cur) {
        g.innerHTML = "";
        var L = m.lista.concat(cur ? [cur] : []); if (!L.length) return;
        var k = 1 / escala(), el = function (tag, at) { var e = d.createElementNS(NS, tag); for (var n in at) if (at.hasOwnProperty(n)) e.setAttribute(n, at[n]); g.appendChild(e); return e; };
        el("polyline", { points: L.map(function (q) { return q.x + "," + q.y; }).join(" "), fill: "none", stroke: "#d97706", "stroke-width": 1.5 * k, "stroke-dasharray": (6 * k) + " " + (3 * k) });
        m.lista.forEach(function (q) { el("circle", { cx: q.x, cy: q.y, r: 3.5 * k, fill: "none", stroke: "#d97706", "stroke-width": 1.5 * k }); });
        var tot = self.comprimentoPolilinha(L), u = L[L.length - 1];
        if (L.length > 1) { var t = el("text", { x: u.x, y: u.y - 8 * k, "font-size": 12 * k, "text-anchor": "middle", fill: "#b45309", stroke: "#fff", "stroke-width": 3 * k, "paint-order": "stroke" }); t.textContent = "Σ " + fmt(tot) + " m"; }
      };
      m.down = function (ev) {
        if (ev.button !== 0) return;
        ev.preventDefault(); ev.stopPropagation(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
        var p = paraSvg(ev.clientX, ev.clientY); if (!p) return;
        p = snap(p);
        if (m.longo) {
          m.lista.push({ x: p.x, y: p.y }); desenharLongo(null);
          var tl = self.comprimentoPolilinha(m.lista), nt = m.lista.length - 1;
          self._med2d = { d: tl, longo: true, trechos: nt, pts: m.lista.slice(), vista: m.id };
          status(nt ? "Ao longo: " + fmt(tl) + " m em " + nt + (nt === 1 ? " trecho" : " trechos") + ". Clique o próximo ponto; Backspace tira o último; Esc encerra." : "Medir ao longo: clique o 2º ponto (cada clique soma um trecho). Esc encerra.");
          return;
        }
        if (!m.a || m.b) { m.a = p; m.b = null; desenhar(p, null); status("Medir: clique o 2º ponto" + (p.snap ? " (1º ponto na ponta da linha)" : "") + ". Esc encerra."); return; }
        m.b = p; desenhar(m.a, m.b);
        var dx = m.b.x - m.a.x, dy = m.b.y - m.a.y, dist = Math.sqrt(dx * dx + dy * dy);
        self._med2d = { d: dist, dx: dx, dy: dy, a: m.a, b: m.b, vista: m.id };
        status("Medida: " + fmt(dist) + " m (Δx " + fmt(Math.abs(dx)) + " · Δy " + fmt(Math.abs(dy)) + "). Clique de novo para outra; Esc encerra.");
      };
      m.move = function (ev) {
        if (m.longo) { if (!m.lista.length) return; var pl = paraSvg(ev.clientX, ev.clientY); if (pl) desenharLongo(snap(pl)); return; }
        if (!m.a || m.b) return;
        var p = paraSvg(ev.clientX, ev.clientY); if (!p) return;
        desenhar(m.a, snap(p));
      };
      m.tecla = function (ev) {
        if (ev.key === "Escape") { ev.stopPropagation(); var fim = m.longo && self._med2d && self._med2d.longo ? " Ao longo: " + fmt(self._med2d.d) + " m." : ""; self.medir2d(false); status("Medir encerrado." + fim); return; }
        if (m.longo && ev.key === "Backspace" && m.lista.length) { ev.preventDefault(); ev.stopPropagation(); m.lista.pop(); desenharLongo(null); var tb = self.comprimentoPolilinha(m.lista); self._med2d = { d: tb, longo: true, trechos: Math.max(0, m.lista.length - 1), pts: m.lista.slice(), vista: m.id }; status("Ao longo: " + fmt(tb) + " m (último ponto tirado)."); }
      };
      cont.addEventListener("pointerdown", m.down, true);
      cont.addEventListener("pointermove", m.move, true);
      d.addEventListener("keydown", m.tecla, true);
      cont.style.cursor = "crosshair";
      try { var r1 = R(), kA = m.longo ? "fx-medir-longo" : "fx-medir"; if (r1 && r1.comando(kA)) r1.setAtivo(kA, true); } catch (eA) {}
      status(m.longo ? "Medir ao longo na vista 2D: clique o 1º ponto; cada clique soma um trecho (encaixa nas pontas das linhas). Esc encerra." : "Medir na vista 2D: clique o 1º ponto (encaixa nas pontas das linhas). Esc encerra.");
      return true;
    },

    /* ---- LINHAS FINAS ---- */
    linhasFinas: function (on) {
      var s = SH(), raiz = s && s._raiz; if (!raiz) return false;
      var novo = on == null ? raiz.getAttribute("data-fx-linhas-finas") !== "1" : !!on;
      if (novo) raiz.setAttribute("data-fx-linhas-finas", "1"); else raiz.removeAttribute("data-fx-linhas-finas");
      lsSet(CHAVE_FINAS, novo ? "1" : null);
      try { var r = R(); if (r) r.setAtivo("fx-linhas-finas", novo); } catch (e) {}
      status(novo ? "Linhas finas: as vistas 2D com a espessura mínima (a impressão e o PDF continuam com as penas)." : "Linhas finas desligadas: as penas voltam.");
      return novo;
    },

    /* ---- FILTRO DE SELEÇÃO ---- */
    filtroSelecao: function () {
      var self = this, s = this._selecao(), b = B();
      if (!s.length) { this._precisaSel("o Filtro"); return true; }
      var itens = null, si = SI();
      try { if (si && si.itens) { itens = {}; si.itens(null).forEach(function (it) { itens[it.uid] = it; }); } } catch (e) { itens = null; }
      var grupos = {}, ordem = [];
      s.forEach(function (u) { var k = self._catDe(u, itens).rot; if (!grupos[k]) { grupos[k] = []; ordem.push(k); } grupos[k].push(u); });
      if (!global.UI || !global.UI.modal) return false;
      var h = '<p class="muted" style="margin:0 0 8px">Marque as categorias que continuam selecionadas.</p><div data-fx-filtro="lista">' +
        ordem.map(function (k, i) { return '<label style="display:flex;gap:8px;align-items:center;padding:4px 0"><input type="checkbox" checked data-fx-filtro-cat="' + i + '"> ' + esc(k) + ' <span class="muted">(' + grupos[k].length + ")</span></label>"; }).join("") +
        '</div><p class="muted" style="margin:8px 0 0">' + s.length + " selecionado(s) no total.</p>";
      global.UI.modal("Filtro de seleção", h, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } },
        { texto: "Aplicar", onClick: function () {
          var d = doc(), fica = [];
          ordem.forEach(function (k, i) { var cb = d.querySelector('[data-fx-filtro-cat="' + i + '"]'); if (cb && cb.checked) fica = fica.concat(grupos[k]); });
          global.UI.fecharModal();
          try { b.selecionar(fica, "trocar"); } catch (e2) {}
          status(fica.length + " de " + s.length + " ficaram selecionados.");
          try { var sh = SH(); if (sh) sh.pintarFita(); } catch (e3) {}
        } }
      ]);
      return true;
    },

    /* ---- MENUS (janelas, interface, barra rápida) ---- */
    _fecharMenu: function () {
      var m = this._menu; this._menu = null;
      if (m && m.el && m.el.parentNode) m.el.parentNode.removeChild(m.el);
      var d = doc(); if (d && this._menuFora) { d.removeEventListener("pointerdown", this._menuFora, true); d.removeEventListener("keydown", this._menuFora, true); this._menuFora = null; }
    },
    /* itens: [{rot, fn, check, sep, tit, html}] ; ancora: elemento (o menu abre embaixo dele) */
    _abrirMenu: function (ancora, itens, nome) {
      var self = this, d = doc(); if (!d) return null;
      this._fecharMenu();
      var m = d.createElement("div"); m.className = "fx-menu"; m.setAttribute("role", "menu"); m.setAttribute("data-fx-menu", nome || "menu");
      itens.forEach(function (it) {
        if (it.sep) { var sp = d.createElement("div"); sp.className = "fx-sep"; m.appendChild(sp); return; }
        if (it.tit) { var tt = d.createElement("div"); tt.className = "fx-tit"; tt.textContent = it.tit; m.appendChild(tt); return; }
        if (it.no) { m.appendChild(it.no); return; }
        var bt = d.createElement("button"); bt.type = "button";
        bt.setAttribute("role", it.check != null ? "menuitemcheckbox" : "menuitem");
        if (it.check != null) bt.setAttribute("aria-checked", it.check ? "true" : "false");
        if (it.id) bt.setAttribute("data-fx-op", it.id);
        bt.innerHTML = (it.check != null ? '<span class="fx-check">' + (it.check ? "✓" : "") + "</span>" : "") + (it.ico ? ico(it.ico, 14) : "") + "<span>" + esc(it.rot) + "</span>" + (it.dir ? '<span class="fx-dir">' + esc(it.dir) + "</span>" : "");
        bt.onclick = function (ev) { if (ev) ev.stopPropagation(); if (!it.manter) self._fecharMenu(); try { it.fn(); } catch (e) {} };
        m.appendChild(bt);
      });
      d.body.appendChild(m);
      var r = ancora && ancora.getBoundingClientRect ? ancora.getBoundingClientRect() : { left: 80, bottom: 60 };
      var vw = global.innerWidth || 1200;
      m.style.left = Math.max(4, Math.min(r.left, vw - m.offsetWidth - 8)) + "px";
      m.style.top = (r.bottom + 2) + "px";
      this._menu = { el: m, nome: nome };
      this._menuFora = function (ev) {
        if (ev.type === "keydown") { if (ev.key === "Escape") { ev.stopPropagation(); self._fecharMenu(); } return; }
        if (!m.contains(ev.target) && !(ancora && ancora.contains && ancora.contains(ev.target))) self._fecharMenu();
      };
      d.addEventListener("pointerdown", this._menuFora, true);
      d.addEventListener("keydown", this._menuFora, true);
      var pri = m.querySelector("button"); try { if (pri) pri.focus(); } catch (e) {}
      return m;
    },
    _ancora: function (id) {
      var d = doc(); if (!d) return null;
      return d.querySelector('[data-rv-qa="' + id + '"]') || d.querySelector('[data-rv-cmd="' + id + '"]') || d.querySelector(".rv-abas");
    },
    menuJanelas: function () {
      var self = this, st = this._vx(), g = G();
      if (!st || !g) return false;
      var l = [{ id: "3d", nome: "{3D}" }].concat(st.lista.map(function (v) { return { id: v.id, nome: v.nome || v.id }; }));
      var itens = [{ tit: "Vistas abertas (" + l.length + ")" }].concat(l.map(function (v) {
        return { id: "vista:" + v.id, rot: v.nome, check: v.id === st.ativa, fn: function () { try { g._bimVxAtivar(v.id); } catch (e) {} status("Vista ativa: " + v.nome + "."); } };
      }));
      itens.push({ sep: true });
      itens.push({ id: "fechar-inativas", rot: "Fechar inativas", fn: function () { self._exec("fx-fechar-inativas"); } });
      itens.push({ id: "lado", rot: st.lado ? "Vistas em guias" : "Vistas lado a lado", fn: function () { self._exec(st.lado ? "fx-guia-vistas" : "lado-a-lado"); } });
      this._abrirMenu(this._ancora("fx-alternar-janelas"), itens, "janelas");
      return true;
    },
    menuInterface: function () {
      var self = this, s = SH(); if (!s || !s._raiz) return false;
      var raiz = s._raiz, latOff = raiz.getAttribute("data-rv-lateral-off") === "1";
      var nav = !latOff && raiz.getAttribute("data-fx-sem-nav") !== "1", props = !latOff && raiz.getAttribute("data-fx-sem-props") !== "1", st = raiz.getAttribute("data-fx-sem-status") !== "1";
      var trocar = function (attr, ligado) {
        if (ligado) { raiz.setAttribute(attr, "1"); }
        else { raiz.removeAttribute(attr); if (raiz.getAttribute("data-rv-lateral-off") === "1" && attr !== "data-fx-sem-status") s.alternarLateralFixa(false); }
        /* sem Navegador e sem Propriedades, a coluna inteira recolhe (sobra a aba com a seta) */
        if (raiz.getAttribute("data-fx-sem-nav") === "1" && raiz.getAttribute("data-fx-sem-props") === "1") { raiz.removeAttribute("data-fx-sem-nav"); raiz.removeAttribute("data-fx-sem-props"); s.alternarLateralFixa(true); }
        self._relayout();
      };
      this._abrirMenu(this._ancora("fx-interface"), [
        { tit: "Interface do usuário" },
        { id: "nav", rot: "Navegador de projeto", check: nav, fn: function () { trocar("data-fx-sem-nav", nav); status(nav ? "Navegador de projeto escondido." : "Navegador de projeto à vista."); } },
        { id: "props", rot: "Propriedades", check: props, fn: function () { trocar("data-fx-sem-props", props); status(props ? "Propriedades escondida." : "Propriedades à vista."); } },
        { id: "status", rot: "Barra de status", check: st, fn: function () { trocar("data-fx-sem-status", st); } },
        { sep: true }].concat(arr((R().comando("fx-interface") || {}).itens).map(function (it) {
          var al = it.tipo === "alterna";
          return { id: it.id, rot: str(it.rotulo).replace(/\s*\n\s*/g, " "), check: al ? R().ativo(it.id) : null, fn: function () { self._exec(it.id); } };
        })).concat([
        { id: "atalhos", rot: "Atalhos do teclado e do mouse", dir: "?", fn: function () { self._exec("atalhos"); } },
        { id: "padrao-ui", rot: "Tudo à vista de novo", fn: function () { raiz.removeAttribute("data-fx-sem-nav"); raiz.removeAttribute("data-fx-sem-props"); raiz.removeAttribute("data-fx-sem-status"); if (raiz.getAttribute("data-rv-lateral-off") === "1") s.alternarLateralFixa(false); self._relayout(); } }
      ]), "interface");
      return true;
    },
    _relayout: function () {
      var s = SH();
      try { if (s && s._opts && typeof s._opts.onLayout === "function") s._opts.onLayout(); } catch (e) {}
    },

    /* ============================================================ BARRA DE ACESSO RÁPIDO */
    qaLista: function () {
      var v = lsGet(CHAVE_QA), l = null;
      try { l = v ? JSON.parse(v) : null; } catch (e) { l = null; }
      return arr(l).length ? arr(l).filter(function (x) { return typeof x === "string" && x; }) : QA_PADRAO.slice();
    },
    qaGravar: function (l) {
      var u = [], vistos = {};
      arr(l).forEach(function (x) { if (x && !vistos[x]) { vistos[x] = 1; u.push(x); } });
      lsSet(CHAVE_QA, JSON.stringify(u));
      this._qaAssin = "";
      this.pintarQa();
      return u;
    },
    qaAdicionar: function (id) { var l = this.qaLista(); if (l.indexOf(id) < 0) l.push(id); this.qaGravar(l); status("\"" + this._nome(id) + "\" na barra de acesso rápido."); return l; },
    qaRemover: function (id) { var l = this.qaLista().filter(function (x) { return x !== id; }); this.qaGravar(l); status("\"" + this._nome(id) + "\" saiu da barra de acesso rápido."); return l; },
    qaPadrao: function () { lsSet(CHAVE_QA, null); this._qaAssin = ""; this.pintarQa(); status("Barra de acesso rápido no padrão."); return this.qaLista(); },
    _nome: function (id) {
      if (QA_NATIVOS[id]) return QA_NATIVOS[id];
      var r = R(), cm = r ? r.comando(id) : null;
      return cm ? str(cm.rotulo).replace(/\/\s*\n\s*/g, "/").replace(/\s*\n\s*/g, " ") : id;
    },
    montarQa: function () {
      var s = SH(), d = doc(); if (!s || !s._raiz || !d) return null;
      var raiz = s._raiz, qa = raiz.querySelector(".rv-qa");
      if (qa) return qa;
      var nat = raiz.querySelector(".rv-titulo > .rv-qat"); if (!nat) return null;
      qa = d.createElement("div"); qa.className = "rv-qat rv-qa"; qa.setAttribute("role", "toolbar"); qa.setAttribute("aria-label", "Barra de acesso rápido");
      nat.parentNode.insertBefore(qa, nat.nextSibling);
      this._qaAssin = "";
      return qa;
    },
    pintarQa: function () {
      var self = this, s = SH(), d = doc(), r = R(); if (!s || !s._raiz || !d || !r) return;
      var qa = this.montarQa(); if (!qa) return;
      var raiz = s._raiz, nat = raiz.querySelector(".rv-titulo > .rv-qat:not(.rv-qa)");
      var l = this.qaLista().filter(function (id) { return QA_NATIVOS[id] || r.comando(id); });
      var assin = l.join("|");
      if (assin !== this._qaAssin) {
        this._qaAssin = assin;
        /* os nativos voltam para a barra deles (escondidos) antes de remontar */
        Object.keys(QA_NATIVOS).forEach(function (id) { var b = raiz.querySelector('[data-rv-qat="' + id + '"]'); if (b && nat) { b.style.display = "none"; if (b.parentNode !== nat) nat.insertBefore(b, nat.querySelector(".rv-qat-pranchas")); } });
        qa.innerHTML = "";
        l.forEach(function (id) {
          if (QA_NATIVOS[id]) {
            var bn = raiz.querySelector('[data-rv-qat="' + id + '"]');
            if (bn) { bn.style.display = ""; bn.setAttribute("data-rv-qa", id); qa.appendChild(bn); }
            return;
          }
          var cm = r.comando(id);
          var b = d.createElement("button"); b.type = "button"; b.setAttribute("data-rv-qa", id);
          b.innerHTML = ico(cm.icone || "quadrado", 15);
          b.setAttribute("aria-label", self._nome(id));
          b.onclick = function () { self.qaExecutar(id); };
          qa.appendChild(b);
          /* Medir: o "▾" escolhe entre dois pontos e ao longo */
          if (id === "fx-medir") {
            var sb = d.createElement("button"); sb.type = "button"; sb.className = "fx-qa-seta"; sb.setAttribute("data-rv-qa-seta", id);
            sb.setAttribute("aria-label", "Opções de medir"); sb.textContent = "▾";
            sb.onclick = function () {
              self._abrirMenu(sb, [{ tit: "Medir" },
                { id: "medir", ico: "medir", rot: "Medir entre dois pontos", dir: "M", fn: function () { self.qaExecutar("fx-medir"); } },
                { id: "fx-medir-longo", ico: "regua", rot: "Medir ao longo de um elemento", fn: function () { self.qaExecutar("fx-medir-longo"); } }], "medir");
            };
            qa.appendChild(sb);
          }
        });
        var cfg = d.createElement("button"); cfg.type = "button"; cfg.className = "fx-qa-seta"; cfg.setAttribute("data-rv-qa-menu", "1");
        cfg.setAttribute("aria-label", "Personalizar a barra de acesso rápido"); cfg.textContent = "▾";
        cfg.onclick = function () { self.menuQa(cfg); };
        qa.appendChild(cfg);
      }
      /* estado: disponível, em breve, aceso */
      [].slice.call(qa.querySelectorAll("[data-rv-qa]")).forEach(function (b) {
        var id = b.getAttribute("data-rv-qa"); if (QA_NATIVOS[id]) return;
        var cm = r.comando(id), dp = r.disponibilidade(id), alvo = cm && cm.alias ? cm.alias : id;
        b.disabled = !dp.ok && !dp.emBreve;
        if (dp.emBreve) b.setAttribute("data-rv-embreve", "1"); else b.removeAttribute("data-rv-embreve");
        var tit = self._nome(id) + (self.tecla(id) ? " (" + self.tecla(id) + ")" : "") + (dp.ok ? "" : " — " + dp.motivo);
        /* com o mouse em cima, o title está guardado (a dica rica no lugar): atualiza a cópia */
        if (b.getAttribute("data-fx-title") != null) b.setAttribute("data-fx-title", tit); else b.title = tit;
        if (cm && cm.tipo === "alterna") b.setAttribute("aria-pressed", r.ativo(alvo) || r.ativo(id) ? "true" : "false"); else b.removeAttribute("aria-pressed");
      });
    },
    qaExecutar: function (id) {
      var r = R(), s = SH(), cm = r ? r.comando(id) : null;
      if (cm && cm.emBreve && s && s._emBreve) { s._emBreve(cm); return { ok: false, emBreve: true }; }
      return s ? s.executar(id) : null;
    },
    menuQa: function (ancora) {
      var self = this, l = this.qaLista(), cat = QA_PADRAO.concat(l.filter(function (x) { return QA_PADRAO.indexOf(x) < 0; }));
      var d = doc();
      var itens = [{ tit: "Barra de acesso rápido" }].concat(cat.map(function (id) {
        var on = l.indexOf(id) >= 0;
        return { id: "qa:" + id, rot: self._nome(id), check: on, fn: function () { if (on) self.qaRemover(id); else self.qaAdicionar(id); } };
      }));
      /* adicionar qualquer comando da fita pela busca */
      var caixa = d.createElement("div");
      var inp = d.createElement("input"); inp.type = "search"; inp.placeholder = "Adicionar comando… (digite o nome)"; inp.setAttribute("data-fx-qa-busca", "1");
      var res = d.createElement("div");
      inp.oninput = function () {
        res.innerHTML = "";
        var t = inp.value.trim(); if (t.length < 2) return;
        arr(R().buscar(t)).slice(0, 8).forEach(function (x) {
          var b = d.createElement("button"); b.type = "button"; b.setAttribute("data-fx-op", "add:" + x.id);
          b.innerHTML = "<span>" + esc(x.rotulo) + '</span><span class="fx-dir">' + esc(x.abaRotulo + " › " + x.painel) + "</span>";
          b.onclick = function (ev) { if (ev) ev.stopPropagation(); self._fecharMenu(); self.qaAdicionar(x.id); };
          res.appendChild(b);
        });
      };
      inp.addEventListener("keydown", function (ev) { ev.stopPropagation(); if (ev.key === "Escape") self._fecharMenu(); });
      caixa.appendChild(inp); caixa.appendChild(res);
      itens.push({ sep: true }, { no: caixa }, { sep: true },
        { id: "padrao", rot: "Restaurar o padrão", fn: function () { self.qaPadrao(); } });
      var m = this._abrirMenu(ancora, itens, "acesso-rapido");
      try { inp.focus(); } catch (e) {}
      return m;
    },

    /* ============================================================ ATALHO E DICA RICA */
    _mapaTeclas: null,
    tecla: function (id) {
      if (TECLA_FIXA[id]) return TECLA_FIXA[id];
      var m = this._mapaTeclas;
      if (!m) {
        m = {};
        var Pr = global.BimPrecisao, subId = {};
        try { if (Pr && Pr.FITA) Object.keys(Pr.FITA).forEach(function (g) { arr(Pr.FITA[g]).forEach(function (cm) { if (cm && cm.sub && !subId[cm.sub]) subId[cm.sub] = cm.id; }); }); } catch (e) {}
        try { if (Pr && Pr.ATALHOS) Object.keys(Pr.ATALHOS).forEach(function (k) { var v = Pr.ATALHOS[k]; m[subId[v] || v] = m[subId[v] || v] || k; }); } catch (e2) {}
        try { if (Pr && Pr.ATALHOS_CMD) Object.keys(Pr.ATALHOS_CMD).forEach(function (k) { var v = Pr.ATALHOS_CMD[k]; m[v] = m[v] || k; }); } catch (e3) {}
        Object.keys(ATALHOS_FX).forEach(function (k) { m[ATALHOS_FX[k]] = k; });
        if (m["p7-cota-alinhada"] == null && m["cota-alinhada"]) m["p7-cota-alinhada"] = m["cota-alinhada"];
        if (m["fx-cota"] == null && m["p7-cota-alinhada"]) m["fx-cota"] = m["p7-cota-alinhada"];
        this._mapaTeclas = m;
      }
      return m[id] || "";
    },
    _tt: null,
    _ttMostrar: function (b) {
      var d = doc(), r = R(); if (!d || !r || !b) return;
      var id = b.getAttribute("data-rv-cmd") || b.getAttribute("data-rv-qa") || b.getAttribute("data-rv-rap");
      if (!id) return;
      var cm = r.comando(id), dp = cm ? r.disponibilidade(id) : { ok: true }, nome = this._nome(id), tec = this.tecla(id);
      var dica = cm ? str(cm.dica) : (b.getAttribute("data-fx-title") || "");
      if (!cm && QA_NATIVOS[id]) dica = id === "salvar-modelo" ? "Guarda o modelo e as edições dentro da obra." : (id === "desfazer" ? "Desfaz a última alteração do modelo." : "Refaz o que foi desfeito.");
      var tt = this._tt;
      if (!tt) { tt = d.createElement("div"); tt.className = "fx-tt"; tt.setAttribute("role", "tooltip"); this._tt = tt; }
      tt.innerHTML = '<div class="fx-tt-cab"><b>' + esc(nome) + "</b>" + (tec ? ' <kbd>' + esc(tec) + "</kbd>" : "") + "</div>" +
        '<div class="fx-tt-corpo"><div class="fx-tt-ico">' + ico(cm ? (cm.icone || "quadrado") : (id === "desfazer" ? "voltar" : id === "refazer" ? "avancar" : "salvar"), 34) + "</div>" +
        "<div>" + esc(dica) + (dp && !dp.ok && dp.motivo ? '<div class="fx-tt-motivo">' + esc(dp.motivo) + (ALTERNATIVA[id] ? " " + esc(ALTERNATIVA[id]) : "") + "</div>" : "") + "</div></div>" +
        (b.getAttribute("data-rv-cmd") ? '<div class="fx-tt-pe">Botão direito: ' + (this.qaLista().indexOf(id) >= 0 ? "tirar da" : "pôr na") + " barra de acesso rápido</div>" : "");
      if (!tt.parentNode) d.body.appendChild(tt);
      tt.style.display = "block";
      var rb = b.getBoundingClientRect(), vw = global.innerWidth || 1200, vh = global.innerHeight || 800;
      var x = Math.max(6, Math.min(rb.left, vw - tt.offsetWidth - 8)), y = rb.bottom + 6;
      if (y + tt.offsetHeight > vh - 6) y = Math.max(6, rb.top - tt.offsetHeight - 6);
      tt.style.left = x + "px"; tt.style.top = y + "px";
    },
    _ttEsconder: function () { if (this._tt) this._tt.style.display = "none"; },
    _instalarEventos: function (raiz) {
      if (!raiz || raiz._fxEventos) return;
      raiz._fxEventos = true;
      var self = this, timer = null, atual = null;
      var alvoDe = function (t) { return t && t.closest ? t.closest("[data-rv-cmd],[data-rv-qa],[data-rv-rap]") : null; };
      raiz.addEventListener("mouseover", function (ev) {
        var b = alvoDe(ev.target); if (b === atual) return;
        if (atual && atual.getAttribute("data-fx-title") != null) { atual.title = atual.getAttribute("data-fx-title"); atual.removeAttribute("data-fx-title"); }
        atual = b; clearTimeout(timer); self._ttEsconder();
        if (!b) return;
        /* o title nativo sairia por cima da dica rica: fica guardado enquanto o mouse está no botão */
        if (b.title) { b.setAttribute("data-fx-title", b.title); b.title = ""; }
        timer = setTimeout(function () { if (atual === b && b.isConnected) self._ttMostrar(b); }, 450);
      });
      raiz.addEventListener("mouseleave", function () { clearTimeout(timer); self._ttEsconder(); if (atual && atual.getAttribute("data-fx-title") != null) { atual.title = atual.getAttribute("data-fx-title"); atual.removeAttribute("data-fx-title"); } atual = null; });
      raiz.addEventListener("pointerdown", function () { clearTimeout(timer); self._ttEsconder(); }, true);
      /* botão direito num comando da fita: pôr/tirar da barra de acesso rápido */
      raiz.addEventListener("contextmenu", function (ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest(".rv-fita [data-rv-cmd]") : null; if (!b) return;
        ev.preventDefault();
        var id = b.getAttribute("data-rv-cmd"), on = self.qaLista().indexOf(id) >= 0;
        self._abrirMenu(b, [{ id: on ? "qa-tirar" : "qa-por", rot: on ? "Tirar da barra de acesso rápido" : "Adicionar à barra de acesso rápido", fn: function () { if (on) self.qaRemover(id); else self.qaAdicionar(id); } }], "fita");
      });
      /* a seleção mudou por clique/teclado: a aba Modificar acompanha (pintarFita já chama antesDePintar) */
      var refazer = function () { setTimeout(function () { if (self._assinSel() !== self._ctxAssin) { try { var s = SH(); if (s) s.pintarFita(); } catch (e) {} } }, 90); };
      raiz.addEventListener("pointerup", refazer, true);
      raiz.addEventListener("keyup", refazer, true);
    },
    _teclado: function () {
      var d = doc(); if (!d || this._ouvindo) return;
      this._ouvindo = true;
      var self = this, buf = "", t0 = 0;
      d.addEventListener("keydown", function (e) {
        var t = e.target || {};
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || "") || t.isContentEditable) return;
        if (d.getElementById("modal-bg")) return;
        var s = SH(), raiz = s && s._raiz;
        if (!raiz || !d.body.contains(raiz) || raiz.offsetParent === null) return;
        if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && /^[cv]$/i.test(e.key || "")) {
          var txt = ""; try { txt = String(global.getSelection ? global.getSelection() : ""); } catch (eS) {}
          if (txt) return;
          var api = self._api(), selEd = []; try { selEd = api && api.selecao ? api.selecao() : []; } catch (eA) {}
          if (/c/i.test(e.key) && selEd.length) { e.preventDefault(); s.executar("fx-copiar-area"); }
          else if (/v/i.test(e.key) && self._clip) { e.preventDefault(); s.executar("fx-colar"); }
          return;
        }
        if (e.ctrlKey || e.metaKey || e.altKey || !/^[a-zA-Z]$/.test(e.key || "")) return;
        var agora = Date.now(); buf = (agora - t0 < 1200 ? buf : "") + e.key.toUpperCase(); t0 = agora;
        var id = ATALHOS_FX[buf.slice(-2)];
        if (!id) return;
        buf = ""; e.preventDefault();
        s.executar(id);
      });
    },
    _css: function () {
      var d = doc(); if (!d || d.getElementById("fx-css")) return;
      var st = d.createElement("style"); st.id = "fx-css";
      st.textContent = [
        ".rv-qa{margin-left:6px;padding-left:6px;border-left:1px solid var(--rv-linha-forte)}",
        ".rv-qa .fx-qa-seta{min-width:14px;width:14px;padding:0;font-size:var(--t-micro,10px);line-height:1}",
        ".rv-qa button[aria-pressed=\"true\"]{background:var(--rv-ativo);color:var(--rv-fita-tx);opacity:1}",
        ".rv-qa button[data-rv-embreve=\"1\"]{opacity:.5}",
        ".fx-menu{position:fixed;z-index:100001;min-width:230px;max-width:380px;max-height:70vh;overflow:auto;background:var(--rv-painel-bg,var(--card,#fff));color:var(--rv-painel-tx,var(--texto,#1a1a1a));border:1px solid var(--rv-linha-forte,var(--linha,#b4b4b4));box-shadow:0 8px 24px var(--rv-sombra,rgba(0,0,0,.18));border-radius:6px;padding:4px;font-size:var(--t-mini,11.5px)}",
        ".fx-menu button{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:6px 8px;background:transparent;border:0;border-radius:4px;color:inherit;cursor:pointer;font:inherit}",
        ".fx-menu button:hover,.fx-menu button:focus-visible{background:var(--rv-hover,var(--aco-claro,#d8e6f2));outline:none}",
        ".fx-menu .fx-check{display:inline-block;width:14px;text-align:center}",
        ".fx-menu .fx-dir{margin-left:auto;color:var(--rv-tx-fraco,var(--texto-2,#6a6a6a));padding-left:12px}",
        ".fx-menu .fx-sep{height:1px;background:var(--rv-linha,var(--linha,#d4d4d4));margin:4px 2px}",
        ".fx-menu .fx-tit{padding:6px 8px 2px;font-weight:600;color:var(--rv-tx-fraco,var(--texto-2,#6a6a6a))}",
        ".fx-menu input[type=search]{width:100%;box-sizing:border-box;margin:2px 0 4px;padding:5px 7px;border:1px solid var(--rv-linha-forte,var(--linha,#b4b4b4));border-radius:4px;font:inherit;background:var(--rv-tela,#fff);color:inherit}",
        ".fx-tt{position:fixed;z-index:100002;max-width:360px;display:none;background:var(--rv-painel-bg,#f7f7f7);color:var(--rv-painel-tx,#1a1a1a);border:1px solid var(--rv-linha-forte,#b4b4b4);box-shadow:0 8px 22px var(--rv-sombra,rgba(0,0,0,.2));border-radius:5px;padding:8px 10px;font-size:var(--t-mini,11.5px);line-height:1.45;pointer-events:none}",
        ".fx-tt-cab{margin-bottom:6px}.fx-tt kbd{font:inherit;font-weight:600;border:1px solid var(--rv-linha-forte,#b4b4b4);border-radius:3px;padding:0 4px;margin-left:4px}",
        ".fx-tt-corpo{display:flex;gap:10px;align-items:flex-start}.fx-tt-ico{flex:0 0 auto;width:44px;height:44px;display:flex;align-items:center;justify-content:center;border:1px solid var(--rv-linha,#d4d4d4);border-radius:4px;background:var(--rv-tela,#fff)}",
        ".fx-tt-motivo{margin-top:6px;color:var(--rv-tx-fraco,#6a6a6a)}.fx-tt-pe{margin-top:6px;padding-top:5px;border-top:1px solid var(--rv-linha,#d4d4d4);color:var(--rv-tx-fraco,#6a6a6a)}",
        ".bim-revit[data-fx-ctx=\"1\"] .rv-abas [data-rv-aba=\"modificar\"]{box-shadow:inset 0 -3px 0 var(--verde,#2e9d5b);font-weight:600}",
        ".bim-revit .rv-painel[data-fx-ctx-painel] {background:color-mix(in srgb, var(--verde,#2e9d5b) 9%, transparent)}",
        ".bim-revit[data-fx-linhas-finas=\"1\"] .bim-tela svg:not(.ic-svg) *:not(text):not(tspan){stroke-width:1px !important;vector-effect:non-scaling-stroke}",
        ".bim-revit[data-fx-sem-nav=\"1\"] .rv-nav,.bim-revit[data-fx-sem-nav=\"1\"] .rv-split-h,.bim-revit[data-fx-sem-props=\"1\"] .rv-props,.bim-revit[data-fx-sem-props=\"1\"] .rv-split-h{display:none !important}",
        ".bim-revit[data-fx-sem-props=\"1\"] .rv-nav,.bim-revit[data-fx-sem-nav=\"1\"] .rv-props{flex:1 1 auto !important;height:auto !important}",
        ".bim-revit[data-fx-sem-status=\"1\"] .rv-status{display:none !important}",
        ".bim-revit .rv-painel[data-fx-compacto] .rv-cmd-sm .rv-cmd-rot{display:none}",
        ".bim-revit .rv-painel[data-fx-compacto] .rv-cmd-sm{width:auto;min-width:28px;padding:3px 5px}",
        ".rv-props .fx-realce{outline:2px solid var(--rv-foco,#1a6cb5);outline-offset:1px}"
      ].join("\n");
      (d.head || d.documentElement).appendChild(st);
    },

    /* ============================================================ GANCHOS */
    /* js/gestao.js _bimCascaAcoes: depois de TODOS os módulos acrescentarem à fita, antes do BimCmd.registrar(reg) */
    registrar: function (reg, Gest) {
      this._G = Gest || this._G;
      if (!hidro()) return false;   /* P8: sem a prévia hidro, a fita do master */
      var r = R(); if (!r) return false;
      var org = this.organizar();
      if (!org.ok) return false;
      var a = this.acoes(), self = this;
      FX.forEach(function (cm) { if (a[cm.id] && r.comando(cm.id)) reg[cm.id] = a[cm.id]; });
      /* a aba contextual só existe com seleção: os comandos dela entram na fita só para registrar e saem */
      this.aplicarContexto({ k: "tubos", rot: "—" });
      var extra = {};
      CTX.forEach(function (cm) { if (a[cm.id]) extra[cm.id] = a[cm.id]; });
      ["pecas", "geral"].forEach(function (k) { CTX_PAINEIS[k].forEach(function (p) { p.ids.forEach(function (id) { if (!r.comando(id)) { var m = r.aba("modificar"); m.paineis.push({ nome: "_reg", comandos: [self._ctxCmd(id)] }); } }); }); });
      try { var cmd = CMD(); if (cmd) cmd.registrar(extra); } catch (e) {}
      this.aplicarContexto(null);
      this._ctxAssin = "";
      /* disciplina: tudo daqui é comum a todas */
      try { var D = global.BimDisciplinas; if (D && D.declarar) D.declarar(FX.concat(CTX).map(function (cm) { return cm.id; }), D.COMUM || "comum"); } catch (eD) {}
      /* em breve: o clique conta a alternativa */
      try { var s = SH(); if (s) { s._ALTERNATIVA = s._ALTERNATIVA || {}; Object.keys(ALTERNATIVA).forEach(function (k) { s._ALTERNATIVA[k] = ALTERNATIVA[k]; }); } } catch (eA) {}
      /* atalhos de duas letras: o modo de edição (js/bimprecisaoui.js) e a tela de atalhos também os conhecem */
      try { var Pr = global.BimPrecisao; if (Pr) { Pr.ATALHOS_CMD = Pr.ATALHOS_CMD || {}; Object.keys(ATALHOS_FX).forEach(function (k) { if (!Pr.ATALHOS_CMD[k] && !(Pr.ATALHOS && Pr.ATALHOS[k])) Pr.ATALHOS_CMD[k] = ATALHOS_FX[k]; }); } } catch (eP) {}
      this._mapaTeclas = null;
      this._css();
      this._teclado();
      return true;
    },
    _assinSel: function () { return this._selecao().join(","); },
    /* js/bimshell.js pintarFita: antes de desenhar (não chama pintarFita — está dentro dela) */
    antesDePintar: function () {
      if (!hidro()) return;   /* P8: sem a prévia hidro, nada daqui (nem barra rápida, nem aba contextual, nem dica rica) */
      var s = SH(), r = R(); if (!s || !s._raiz || !r) return;
      if (r.reorganizado && r.reorganizado()) this.organizar();
      if (this.organizado()) {
        var assin = this._assinSel();
        if (assin !== this._ctxAssin) {
          this._ctxAssin = assin;
          var cat = assin ? this.categoriaSelecao() : null;
          this.aplicarContexto(cat);
          if (cat) s._raiz.setAttribute("data-fx-ctx", "1"); else s._raiz.removeAttribute("data-fx-ctx");
        }
        /* os atalhos (alias) acendem junto com o comando de verdade */
        var self0 = this;
        if (this._m2 && this._ativa2d() !== this._m2.id) this.medir2d(false);   /* trocou de vista: a medida 2D sai */
        FX.concat(CTX).forEach(function (cm) { if (cm.alias && r.comando(cm.id)) { var on = r.ativo(cm.alias) || (cm.id === "fx-medir" && !!self0._m2 && !self0._m2.longo); if (r.ativo(cm.id) !== on) r.setAtivo(cm.id, on); } });
        if (r.comando("fx-linhas-finas")) r.setAtivo("fx-linhas-finas", s._raiz.getAttribute("data-fx-linhas-finas") === "1");
        if (r.comando("fx-medir-longo")) r.setAtivo("fx-medir-longo", !!(this._m2 && this._m2.longo));
      }
      this._css();
      this._instalarEventos(s._raiz);
      if (lsGet(CHAVE_FINAS) === "1" && s._raiz.getAttribute("data-fx-linhas-finas") !== "1" && !this._finasLidas) { this._finasLidas = true; s._raiz.setAttribute("data-fx-linhas-finas", "1"); }
      try { this.pintarQa(); } catch (eQ) {}
      /* depois do desenho (síncrono): os painéis da categoria ganham a marca */
      var self = this;
      Promise.resolve().then(function () { self._marcarCtx(); });
    },
    _marcarCtx: function () {
      var s = SH(); if (!s || !s._raiz) return;
      var self = this, nomes = {}; arr((R().aba("modificar") || {}).paineis).forEach(function (p) { if (self._ehCtx(p)) nomes[p.nome] = 1; });
      [].slice.call(s._raiz.querySelectorAll(".rv-fita .rv-painel")).forEach(function (pn) {
        var n = pn.querySelector(".rv-painel-nome"), on = R().abaAtiva() === "modificar" && n && nomes[n.textContent];
        if (on) pn.setAttribute("data-fx-ctx-painel", "1"); else pn.removeAttribute("data-fx-ctx-painel");
        /* Modificar › Modificar: 17 ferramentas só com o ícone (o nome e o atalho estão na dica) — a aba cabe na tela */
        if (R().abaAtiva() === "modificar" && n && n.textContent === "Modificar") pn.setAttribute("data-fx-compacto", "1"); else pn.removeAttribute("data-fx-compacto");
      });
    }
  };

  global.BimFita = BimFita;
  if (typeof module !== "undefined" && module.exports) module.exports = BimFita;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
