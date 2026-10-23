/* =====================================================================
 * metalui.js — a TELA da disciplina METÁLICA & MECÂNICA do OrçaPRO
 * Modela (prévia `?previa=modelador`). Fina: quem calcula a geometria, as
 * ligações, o galpão e os arquivos são os motores puros
 *   js/metalnorma.js  (furos, parafusos, distâncias da NBR 8800, solda)
 *   js/metalpeca.js   (chapa, perfil cortado, parafuso, peça mecânica)
 *   js/metalligacao.js (as macros de ligação)
 *   js/metalgalpao.js (o assistente de galpão)
 *   js/metalfab.js    (marcas, DSTV, DXF, listas, desenho de fabricação)
 * Aqui: a fita (painéis Peças, Ligações, Galpão, Cálculo, Fabricação), os
 * diálogos e a entrega dos arquivos. Sem a prévia NADA daqui aparece.
 *
 * ⚠ A tela diz, em todo diálogo de Peças/Ligações/Galpão/Fabricação: isto
 *   é MODELAGEM, DETALHAMENTO e FABRICAÇÃO — não é cálculo estrutural.
 *   O CÁLCULO (painel "Cálculo") é outra tela: js/metalcalcui.js (assistente
 *   endereço → vento → fechamentos → telha → perfis, cálculo num Web Worker,
 *   resultado com as decisões do sistema, normas configuradas).
 * ===================================================================== */
(function (global) {
  "use strict";
  function B() { return global.BIM; }
  function M() { return global.BimMetal; }
  function L() { return global.BimMetalLig; }
  function F() { return global.BimMetalFab; }
  function NN() { return global.BimMetalNorma; }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function br(v, c) { return (Math.round(num(v, 0) * Math.pow(10, c == null ? 2 : c)) / Math.pow(10, c == null ? 2 : c)).toFixed(c == null ? 2 : c).replace(".", ","); }
  function junta(a, b) { Object.keys(b || {}).forEach(function (k) { a[k] = b[k]; }); return a; }
  function status(t) { try { if (global.BimShell && BimShell.status) BimShell.status(t); } catch (e) {} }
  function toast(t, tipo, ms) { try { if (global.UI) UI.toast(t, tipo || "ok", ms || 6000); } catch (e) {} }
  var NAO_CALCULO = '<p class="muted" style="font-size:12px;margin:0 0 8px" data-met="nao-calculo">Modelagem, detalhamento e fabricação — <b>não é cálculo estrutural</b>. Os valores que vêm preenchidos são de <b>partida</b> (editáveis); quem garante perfis, parafusos, chapas e soldas é o projeto estrutural.</p>';

  function previa() { var P = global.BimPrevia; if (!P || !P.modelador || !P.modelador()) return false; if (P.disciplina) { try { return P.disciplina("metalica") !== false; } catch (e) { return true; } } return true; }

  var BimMetalUI = {
    _G: null, _n: 0, ultimo: null,
    estado: function () { var b = B(), e = b && b.editarEstado ? b.editarEstado() : null; return e ? e.estado : null; },
    novoId: function () { BimMetalUI._n++; return "met-" + Date.now().toString(36) + "-" + BimMetalUI._n; },
    selecao: function () {
      var ids = [], b = B();
      try { var p = b && b.precisao ? b.precisao() : null; if (p) ids = p.selecao().map(String); } catch (e) {}
      if (!ids.length) { var G = this._G || global.Gestao, u = G && G._bimSelecao && G._bimSelecao.uid; if (u && /^edit:/.test(u)) ids = [String(u).slice(5)]; }
      return ids;
    },
    caixas: function (ids) { var st = this.estado(), por = {}; ((st && st.caixas) || []).forEach(function (c) { por[String(c.id)] = c; }); return ids.map(function (id) { return por[String(id)]; }).filter(Boolean); },
    enviar: function (op) {
      var b = B(); if (!b || !op) return false;
      if (op.op === "lote") return !!(b.editarLote && b.editarLote(op));
      return !!(b.b2Op && b.b2Op(op));
    },
    baixar: function (nome, dados, mime) {
      /* teste de 1 hora (js/testemodulo.js): entregável em teste sai com a marca; módulo vencido não sai */
      if (global.TesteModulo && TesteModulo.marcarArquivo) { var wT = TesteModulo.marcarArquivo(nome, dados, mime, (arguments[3] || "modela:metalica")); if (!wT) return false; nome = wT.nome; dados = wT.dados; }
      var G = this._G || global.Gestao;
      if (G && G._opBaixar) return G._opBaixar(nome, dados, mime);
      try { var bl = new Blob([dados], { type: mime || "application/octet-stream" }), u = URL.createObjectURL(bl), a = document.createElement("a"); a.href = u; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 5000); return true; } catch (e) { return false; }
    },
    nomeObra: function () { var G = this._G || global.Gestao, o = null; try { o = G && G._bimSel && global.Store ? Store.obter(Auth.empresaId(), "obras", G._bimSel) : null; } catch (e) {} return (o && o.nome) || "obra"; },
    arqBase: function () { var n = this.nomeObra(); return (global.OpFormato ? OpFormato.nomeSeguro(n) : n.replace(/[^\w.-]+/g, "-")); },

    /* ================================================= FITA */
    COMANDOS: {
      /* CRIAR CLICANDO (js/metalcriarui.js, 12/10/2026): as cinco ferramentas desenham no 3D e na planta,
         no plano de trabalho, com encaixe em eixos, pontas e meios; os diálogos por coordenadas ficam ao lado */
      "Peças": [
        { id: "met-pilar", rotulo: "Pilar", icone: "pilar", grande: true, tipo: "alterna", dica: "Pilar de perfil do catálogo: escolha o perfil (busca por nome, série ou fabricante) e clique onde ele nasce — no 3D ou na planta. Encaixa no cruzamento dos eixos; base e topo pelos níveis (Propriedades)." },
        { id: "met-viga", rotulo: "Viga", icone: "estrutura", grande: true, tipo: "alterna", dica: "Viga de perfil: clique o início e o fim (encaixa no topo dos pilares, nas pontas, nos meios e nos eixos). O topo fica na linha clicada; digite o comprimento e Tab o ângulo." },
        { id: "met-diagonal", rotulo: "Diagonal", icone: "desLinha", grande: true, tipo: "alterna", dica: "Diagonal / contraventamento: clique as duas pontas — encaixa em pontas de barras em cotas diferentes (base de um pilar ao topo do outro). Com plano vertical, desenha no plano do pórtico." },
        { id: "met-vigas-pilares", rotulo: "Vigas entre\npilares", icone: "grade", grande: true, dica: "Selecione os pilares (dois ou mais) e lance as vigas entre eles de uma vez: em X, em Y ou nos dois sentidos, cada viga de eixo a eixo, parada na face do pilar (mesa ou alma) com a ligação parafusada da Ligação inteligente. Prévia antes de aplicar; Ctrl+Z desfaz o lote. Mover o pilar estica a viga." },
        { id: "met-terca", rotulo: "Terça /\ntravessa", icone: "regua", grande: true, tipo: "alterna", dica: "Terça ou travessa (Ue, U, C…): clique o início e o fim; a base da terça fica na linha (apoia em cima da viga). Giro em Propriedades para acompanhar o telhado." },
        { id: "met-chapa-cliques", rotulo: "Chapa", icone: "desRetangulo", grande: true, tipo: "alterna", dica: "Chapa por dois cantos opostos: no plano de trabalho ou na face de uma peça (o 1º clique na face leva a chapa para ela). Espessura e lado em Propriedades." },
        { id: "met-chapa", rotulo: "Chapa\nparamétrica", icone: "quadrado", dica: "Chapa paramétrica por medidas: retângulo ou contorno, espessura, furos em grade (furo-padrão = parafuso + 1,5 mm, NBR 8800), recortes e chanfros. Vai para o DXF de corte e para o DSTV." },
        { id: "met-perfil", rotulo: "Perfil por\ncoordenadas", icone: "regua", dica: "Barra de perfil do catálogo pelas coordenadas do início, com corte reto ou inclinado (ângulo na alma e na aba). Vai para o DSTV (serra e furação)." },
        { id: "met-enrijecedor", rotulo: "Enrijecedor", icone: "estrutura", dica: "Enrijecedor no perfil I/U selecionado: chapas no plano da seção, soldadas na alma e nas mesas, com chanfro para livrar a concordância." },
        { id: "met-mecanica", rotulo: "Peça\nmecânica", icone: "ajustes", dica: "Família paramétrica de peça mecânica: flange (disco com furação), suporte em L, eixo maciço e bucha." }
      ],
      "Referência": [
        { id: "met-plano", rotulo: "Plano de\ntrabalho", icone: "camadas", grande: true, dica: "Onde o próximo clique cai: horizontal no nível da ferramenta, na face de uma peça ou vertical por dois pontos. A grade do plano aparece no 3D com o nome." },
        { id: "met-eixo", rotulo: "Eixo", icone: "grade", grande: true, dica: "Um eixo da grade por dois cliques, com a bolinha e o nome (número na vertical, letra na horizontal). Mover leva o pilar que está sobre ele." },
        { id: "met-grade-eixos", rotulo: "Grade de\neixos", icone: "planta", grande: true, dica: "A grade inteira de uma vez: os vãos entre os eixos numerados e entre os de letra (6; 6; 6 ou 3x6), a origem e a extensão." },
        { id: "met-cotas-eixos", rotulo: "Cotas dos\neixos", icone: "medir", tipo: "alterna", dica: "Cotas entre os eixos paralelos (e a total), no 3D e na planta." },
        { id: "met-niveis-3d", rotulo: "Níveis\nno 3D", icone: "niveis", tipo: "alterna", dica: "Cada nível da obra como um plano no 3D, com o nome e a cota; o nível atual em destaque." }
      ],
      "Ligações": [
        { id: "met-placa-base", rotulo: "Placa\nde base", icone: "pilar", grande: true, dica: "Placa de base no pilar selecionado: placa, chumbadores (comprimento pela placa + ancoragem), furos alargados e solda em volta do pilar." },
        { id: "met-chapa-ext", rotulo: "Chapa de\nextremidade", icone: "bloco", grande: true, dica: "Selecione a VIGA e depois o PILAR (ou a outra viga, na cumeeira): chapa soldada na ponta da viga, parafusos no gage e furos no apoio. A viga encosta na chapa." },
        { id: "met-cant-dupla", rotulo: "Cantoneira\ndupla", icone: "camadas", grande: true, dica: "Selecione a VIGA e o PILAR: duas cantoneiras na alma da viga, aparafusadas na viga e no pilar." },
        { id: "met-emenda", rotulo: "Emenda\ncobrejunta", icone: "link", grande: true, dica: "Selecione as DUAS vigas colineares: talas na alma (dos dois lados) e nas mesas, parafusos dos dois lados da emenda." },
        { id: "met-clip", rotulo: "Clip de\nterça", icone: "ima", grande: true, dica: "Selecione a TERÇA e a VIGA de cobertura: cantoneira soldada na mesa da viga e aparafusada na alma da terça." },
        { id: "met-contravento", rotulo: "Contra-\nventamento", icone: "grade", grande: true, dica: "Selecione a DIAGONAL e o APOIO: chapa gusset soldada no apoio, a diagonal aparafusada no gusset (a ponta recua do apoio)." },
        { id: "met-no", rotulo: "Nó de\ntreliça", icone: "alvo", grande: true, dica: "Selecione as barras que chegam no nó: um gusset aparafusado em todas; as pontas recuam até os grupos de parafusos não se tocarem." },
        { id: "met-conferir", rotulo: "Conferir\nfuros", icone: "checklist", grande: true, dica: "Confere as distâncias de TODOS os furos do modelo (entre furos e às bordas) pela NBR 8800 — aviso, não bloqueio." },
        { id: "met-apagar-lig", rotulo: "Desfazer\nligação", icone: "lixeira", grande: true, dica: "Apaga a ligação inteira da peça selecionada: chapas, parafusos e os furos que ela abriu." }
      ],
      "Galpão": [
        { id: "met-galpao", rotulo: "Assistente\nde galpão", icone: "casa", grande: true, dica: "Galpão de duas águas: pórticos de alma cheia ou treliçados, terças, tirantes, contraventamentos e colunas de tapamento, com os perfis do catálogo que você escolher e as ligações padrão aplicadas. Não dimensiona — para calcular, use Cálculo › Assistente de cálculo." }
      ],
      /* o CÁLCULO (js/metalcalcui.js): os comandos só chamam a tela */
      "Cálculo": [
        { id: "met-calc-assistente", rotulo: "Assistente\nde cálculo", icone: "calculadora", grande: true, dica: "Galpão de aço calculado de ponta a ponta: o endereço dá o vento (NBR 6123); você diz as faces, a telha e os aços. O sistema decide terças, travamentos, flambagem e o perfil mais leve que passa (NBR 8800)." },
        { id: "met-calc-livre", rotulo: "Estrutura\ndesenhada", icone: "estrutura", grande: true, dica: "Calcula QUALQUER estrutura de aço desenhada no modelo (mezanino, passarela, plataforma, pórtico avulso, cobertura simples): o sistema lê as peças, monta os nós, decide flambagem e travamentos; você diz as bases e as cargas por área (NBR 6120) e calcula. O perfil mais leve que passa volta para as peças, no lugar." },
        { id: "met-calc-modelos", rotulo: "Modelos\nprontos", icone: "camadas", grande: true, dica: "Galpões prontos para só ajustar: cobertura aberta, fechado com telha, misto alvenaria + telha, centro logístico, uma água e oficina em bloco." },
        { id: "met-calc-calcular", rotulo: "Calcular", icone: "raio", grande: true, dica: "Calcula o galpão desta obra com os dados do assistente, em paralelo (a tela continua livre), e mostra o resultado." },
        { id: "met-calc-resultados", rotulo: "Resultados", icone: "grafico", grande: true, dica: "Aprovado ou não, peso e kg/m², aproveitamento por grupo, as decisões do sistema com o motivo e os problemas com as soluções." },
        { id: "met-calc-memorial", rotulo: "Memorial", icone: "relatorio", grande: false, dica: "Memorial de cálculo: ações, vento com o mapa, combinações, verificações passo a passo, cargas na fundação e as normas usadas." },
        { id: "met-calc-pranchas", rotulo: "Pranchas", icone: "prancha", grande: false, dica: "Pranchas no padrão da casa: locação, cobertura, elevações, pórtico típico, detalhes e lista de materiais." },
        { id: "met-calc-cype", rotulo: "Para o CYPE 3D", icone: "exportar", grande: false, dica: "Arquivo para o CYPE 3D com os perfis (inclusive os que o CYPE não tem), as cargas e os apoios." },
        { id: "met-calc-normas", rotulo: "Normas", icone: "livro", grande: true, dica: "As normas configuradas: a edição em vigor, a que o motor usa e o que falta conferir." }
      ],
      "Fabricação": [
        { id: "met-numerar", rotulo: "Numerar\npeças", icone: "lista", grande: true, dica: "Marca as peças (iguais = mesma marca: P1, CH12…) e os conjuntos de montagem (peça principal + o que é soldado nela = A1…). Sempre a mesma marca para o mesmo modelo." },
        { id: "met-desenho", rotulo: "Desenho de\nfabricação", icone: "prancha", grande: true, dica: "Uma folha A3 por marca e por conjunto soldado no Padrão RA, com o carimbo: vista com a furação cotada da ponta, cortes, chanfros, dobras, solda AWS A2.4 e a lista de material — caderno em PDF, PDF por marca ou nas Pranchas do projeto." },
        { id: "met-corte", rotulo: "Lista de\ncorte", icone: "regua", grande: true, dica: "Aproveitamento de barras: as peças de cada perfil e aço encaixadas nas barras comerciais (6 m e 12 m), com a serra; barras a comprar, sobras reaproveitáveis e a perda em kg e % — .xlsx e PDF." },
        { id: "met-dobrada", rotulo: "Chapa\ndobrada", icone: "desLinha", grande: true, dica: "Peça de chapa dobrada (L, U, Ue, Z, cartola ou polilinha livre) com espessura e raio interno — no 3D, no peso e no IFC; na fábrica ela é a chapa planificada." },
        { id: "met-planif", rotulo: "Planifi-\ncação", icone: "camadas", grande: true, dica: "O comprimento desenvolvido das chapas dobradas pelo fator K (0,33 de partida, tabela por ri/t ou o da dobradeira), as linhas de dobra com ângulo e sentido e o DXF da planificação." },
        { id: "met-nesting", rotulo: "Nesting de\nchapas", icone: "grade", grande: true, dica: "As chapas planas e planificadas arrumadas nas chapas comerciais (1200 × 3000, 1500 × 3000, 1500 × 6000 — editável) pelo retângulo envolvente, com o aproveitamento % — PDF e .xlsx." },
        { id: "met-pintura", rotulo: "Pintura\ne peso", icone: "calculadora", grande: true, dica: "Área de pintura e peso por peça, por marca e total (perímetro do perfil × comprimento; chapas dos dois lados) e a tinta por demão pelo rendimento — .xlsx e lançar no orçamento." },
        { id: "met-dstv", rotulo: "DSTV\n(.nc1)", icone: "exportar", grande: true, dica: "Arquivos DSTV NC1 para serra, furadeira e corte — um por marca (perfis e chapas), num .zip." },
        { id: "met-dxf", rotulo: "DXF de\nchapas", icone: "baixar", grande: true, dica: "DXF 1:1 em mm para laser/plasma: CUT_OUTSIDE, CUT_INSIDE e ETCH, um por marca, e o aproveitamento numa chapa padrão." },
        { id: "met-listas", rotulo: "Listas\n(.xlsx)", icone: "planilha", grande: true, dica: "Lista de peças, de conjuntos, de parafusos/porcas/arruelas, de chapas e o resumo de peso por material (o mesmo peso do içamento)." },
        { id: "met-ifc", rotulo: "IFC de\nfabricação", icone: "estrutura", grande: true, dica: "IFC4 com IfcPlate, IfcMember, IfcBeam e IfcColumn agrupados em conjuntos (IfcElementAssembly), parafusos como IfcMechanicalFastener e os furos como aberturas." },
        { id: "met-pacote", rotulo: "Pacote da\nfábrica", icone: "pasta", grande: true, dica: "Tudo num .zip: DSTV, DXF, nesting, listas em Excel e o IFC de fabricação." },
        { id: "met-fontes", rotulo: "De onde vem\ncada número", icone: "livro", grande: true, dica: "As fontes de cada regra (NBR 8800, catálogos, DSTV) e o que é valor de partida a conferir." }
      ]
    },
    ids: function () { var o = []; var C = this.COMANDOS; Object.keys(C).forEach(function (k) { C[k].forEach(function (c) { o.push(c.id); }); }); return o; },
    registrar: function (reg, G) {
      this._G = G || this._G;
      var R = global.BimRibbon, self = this;
      if (!previa() || !R || !M() || !L()) return false;
      /* PEÇAS PRONTAS (js/metalprontasui.js, 13/10/2026): o grupo entra logo depois do Galpão */
      var PP = global.MetalProntasUI && global.MetalProntas ? global.MetalProntasUI : null;
      /* PÓRTICOS M4 (14/10/2026, js/metalporticosui.js): a biblioteca de pórticos industriais entra logo depois do Galpão */
      var PO = global.MetalPorticosUI && global.MetalPorticos ? global.MetalPorticosUI : null;
      /* METÁLICA › T — TANQUES (14/10/2026, js/metaltanqueui.js): o grupo entra logo depois das Peças prontas */
      var TQ = global.MetalTanqueUI && global.MetalTanque && global.AcoTanque ? global.MetalTanqueUI : null;
      /* METÁLICA › ACESSOS (14/10/2026, js/metalacessosui.js): o grupo entra logo depois das Peças prontas — só se os motores carregaram */
      var AU = PP && global.MetalAcessosUI && global.MetalAcessosUI.pronto && global.MetalAcessosUI.pronto() ? global.MetalAcessosUI : null;
      /* METÁLICA › L (14/10/2026, js/metalligsugui.js): o grupo "Ligação inteligente" entra antes de "Ligações" */
      var LSU = global.MetalLigSugUI && global.AcoLigSugere && global.AcoLigCalc2 && global.AcoLigTipos ? global.MetalLigSugUI : null;
      Object.keys(this.COMANDOS).forEach(function (pn) {
        if (pn === "Ligações" && LSU) R.acrescentar("metalica", "Metálica & Mecânica", "Ligação inteligente", LSU.COMANDOS.map(function (c) { return { id: c.id, rotulo: c.rotulo, icone: c.icone, grande: c.grande, dica: c.dica }; }));
        R.acrescentar("metalica", "Metálica & Mecânica", pn, self.COMANDOS[pn]);
        if (pn === "Galpão" && PO) R.acrescentar("metalica", "Metálica & Mecânica", "Pórticos", PO.COMANDOS.map(function (c) { return { id: c.id, rotulo: c.rotulo, icone: c.icone, grande: c.grande, dica: c.dica }; }));
        if (pn === "Galpão" && PP) R.acrescentar("metalica", "Metálica & Mecânica", "Peças prontas", PP.COMANDOS.map(function (c) { return { id: c.id, rotulo: c.rotulo, icone: c.icone, grande: c.grande, dica: c.dica }; }));
        if (pn === "Galpão" && AU) R.acrescentar("metalica", "Metálica & Mecânica", "Acessos", AU.COMANDOS.map(function (c) { return { id: c.id, rotulo: c.rotulo, icone: c.icone, grande: c.grande, dica: c.dica }; }));
        if (pn === "Galpão" && TQ) R.acrescentar("metalica", "Metálica & Mecânica", "Tanques", TQ.COMANDOS.map(function (c) { return { id: c.id, rotulo: c.rotulo, icone: c.icone, grande: c.grande, dica: c.dica }; }));   /* METÁLICA › T */
      });
      if (global.BimDisciplinas && global.BimDisciplinas.declarar) { try { global.BimDisciplinas.declarar(this.ids().concat(PO ? PO.ids() : []).concat(PP ? PP.ids() : []).concat(AU ? AU.ids() : []).concat(TQ ? TQ.ids() : []).concat(LSU ? LSU.ids() : []), "metalica"); } catch (e) {} }
      /* METÁLICA › CATÁLOGO INDUSTRIAL (14/10/2026, js/metalcatalogoui.js): o grupo "Catálogo" entra depois da Fabricação; o painel é uma consulta (aços, chapas, pintura, cores) e não mexe no modelo */
      var CAT = global.MetalCatalogoUI && global.AcoCatalogoInd ? global.MetalCatalogoUI : null;
      if (CAT) {
        R.acrescentar("metalica", "Metálica & Mecânica", "Catálogo", CAT.COMANDOS.map(function (c) { return { id: c.id, rotulo: c.rotulo, icone: c.icone, grande: c.grande, dica: c.dica }; }));
        if (global.BimDisciplinas && global.BimDisciplinas.declarar) { try { global.BimDisciplinas.declarar(CAT.ids(), "metalica"); } catch (eCat) {} }
      }
      var h = {
        "met-chapa": function () { self.dlgChapa(); }, "met-perfil": function () { self.dlgPerfil(); }, "met-enrijecedor": function () { self.dlgLigacao("enrijecedor"); }, "met-mecanica": function () { self.dlgMecanica(); },
        "met-placa-base": function () { self.dlgLigacao("placaBase"); }, "met-chapa-ext": function () { self.dlgLigacao("chapaExtremidade"); }, "met-cant-dupla": function () { self.dlgLigacao("cantoneiraDupla"); },
        "met-emenda": function () { self.dlgLigacao("emendaCobrejunta"); }, "met-clip": function () { self.dlgLigacao("clipTerca"); }, "met-contravento": function () { self.dlgLigacao("contraventamento"); }, "met-no": function () { self.dlgLigacao("noTrelica"); },
        "met-conferir": function () { self.conferirTudo(); }, "met-apagar-lig": function () { self.apagarLigacao(); },
        "met-galpao": function () { self.dlgGalpao(); },
        "met-calc-assistente": function () { self.calc("abrir"); }, "met-calc-livre": function () { if (!global.MetalCalcLivreUI) { toast("O cálculo da estrutura desenhada não carregou (js/metalcalclivreui.js).", "erro", 8000); return; } global.MetalCalcLivreUI.abrir(); }, "met-calc-modelos": function () { self.calc("modelos"); }, "met-calc-calcular": function () { self.calcRota("calcular"); },
        "met-calc-resultados": function () { self.calcRota("resultados"); }, "met-calc-memorial": function () { self.calcRota("memorial"); }, "met-calc-pranchas": function () { self.calcRota("pranchas"); },
        "met-calc-cype": function () { self.calcRota("cype"); }, "met-calc-normas": function () { self.calc("normas"); },
        "met-numerar": function () { self.numerar(); }, "met-desenho": function () { self.fab("desenhos"); }, "met-corte": function () { self.fab("corte"); }, "met-dobrada": function () { self.fab("dobrada"); },
        "met-planif": function () { self.fab("planificacao"); }, "met-nesting": function () { self.fab("nesting"); }, "met-pintura": function () { self.fab("pintura"); }, "met-dstv": function () { self.exportar("dstv"); }, "met-dxf": function () { self.exportar("dxf"); },
        "met-listas": function () { self.listas(); }, "met-ifc": function () { self.ifc(); }, "met-pacote": function () { self.pacote(); }, "met-fontes": function () { self.fontes(); }
      };
      Object.keys(h).forEach(function (k) { reg[k] = function () { try { h[k](); } catch (e) { toast("Metálica: " + (e && e.message ? e.message : e), "erro", 8000); } return true; }; });
      if (PP && PP.registrar) { try { PP.registrar(reg); } catch (eP) { toast("Metálica (peças prontas): " + (eP && eP.message ? eP.message : eP), "erro", 8000); } }
      if (PO && PO.registrar) { try { PO.registrar(reg); } catch (eO) { toast("Metálica (pórticos): " + (eO && eO.message ? eO.message : eO), "erro", 8000); } }   /* PÓRTICOS M4 */
      /* METÁLICA › T — TANQUES (14/10/2026, js/metaltanqueui.js) */
      if (TQ && TQ.registrar) { try { TQ.registrar(reg); } catch (eT) { toast("Metálica (tanques): " + (eT && eT.message ? eT.message : eT), "erro", 8000); } }
      if (AU && AU.registrar) { try { AU.registrar(reg); } catch (eA) { toast("Metálica (acessos): " + (eA && eA.message ? eA.message : eA), "erro", 8000); } }   /* METÁLICA › ACESSOS (14/10/2026) */
      if (CAT && CAT.registrar) { try { CAT.registrar(reg); } catch (eK) { toast("Metálica (catálogo industrial): " + (eK && eK.message ? eK.message : eK), "erro", 8000); } }   /* METÁLICA › CATÁLOGO INDUSTRIAL (js/metalcatalogoui.js) */
      if (LSU && LSU.registrar) { try { LSU.registrar(reg); } catch (eL) { toast("Metálica (ligação inteligente): " + (eL && eL.message ? eL.message : eL), "erro", 8000); } }
      /* criar clicando e a referência (plano, eixos, cotas, níveis): js/metalcriarui.js */
      if (global.MetalFabUI && global.MetalFabUI.registrarDicas) { try { global.MetalFabUI.registrarDicas(); } catch (eD) {} }
      /* VIGAS ENTRE PILARES (15/10/2026, js/metalvigaspilaresui.js) */
      if (global.MetalVigasPilaresUI && global.MetalVigasPilaresUI.registrar) { try { global.MetalVigasPilaresUI.registrar(reg); } catch (eV) { toast("Metálica (vigas entre pilares): " + (eV && eV.message ? eV.message : eV), "erro", 8000); } }
      if (global.MetalCriarUI && global.MetalCriarUI.registrar) { try { global.MetalCriarUI.registrar(reg); } catch (eC) { toast("Metálica (criar clicando): " + (eC && eC.message ? eC.message : eC), "erro", 8000); } }
      /* a aba é NOVA: se a casca já estava montada, ela ressincroniza a barra de abas
         (BimShell._sincAbas — o mesmo mecanismo da troca de disciplina, que respeita o
         filtro: escolhida outra disciplina, a aba não aparece). Quando a casca monta
         depois, ela já nasce com a aba. */
      setTimeout(function () {
        try { var sh = global.BimShell; if (sh && sh._raiz && typeof sh._sincAbas === "function") sh._sincAbas(); } catch (e) {}
      }, 0);
      return true;
    },

    /* as ferramentas de FABRICAÇÃO (lista de corte, chapa dobrada, planificação, nesting, pintura e o desenho no Padrão RA): js/metalfabui.js */
    fab: function (qual) {
      var X = global.MetalFabUI;
      if (!X || typeof X[qual] !== "function") { toast("As ferramentas de fabricação não carregaram (js/metalfabui.js).", "erro", 8000); return false; }
      return X[qual]();
    },

    /* METÁLICA › S5 (14/10/2026, js/metalcalclivreui.js): Calcular / Resultados / Memorial / Pranchas / CYPE da fita vão
       para a ESTRUTURA DESENHADA quando o modelo tem barras de aço desenhadas (Metálica, Peças prontas ou a aba Estrutura) e
       nenhum galpão do assistente — antes iam sempre para o assistente do galpão, que calculava um galpão pré-configurado
       (o "não consegui calcular a estrutura desenhada" do Rogério). Com os dois no modelo, a tela pergunta qual. */
    calcRota: function (qual) {
      var L = global.MetalCalcLivreUI, st = this.estado ? this.estado() : null, cx = (st && st.caixas) || [], desenhadas = 0, galpao = 0, antigo = 0;
      cx.forEach(function (c) {
        if (!c) return;
        if (c.galpao) { galpao++; return; }
        if (c.tipo === "metal" && c.metal && c.metal.kind === "perfil" && !c.metal.lig) { desenhadas++; if (/ — (pórtico|vão) \d+/.test(String(c.metal.nome || ""))) antigo++; }
        else if ((c.tipo === "pilar" || c.tipo === "viga") && c.material === "aco") desenhadas++;
      });
      var self = this;
      function livre() {
        if (!L) { toast("O cálculo da estrutura desenhada não carregou (js/metalcalclivreui.js).", "erro", 8000); return false; }
        if (qual === "calcular") return L.abrir(1);
        if (qual === "resultados") return L.abrirResultado() || true;
        if (qual === "memorial") return L.memorial();
        if (qual === "pranchas") return L.pranchas();
        if (qual === "cype") return L.cype();
        return L.abrir();
      }
      if (!desenhadas || !L) return this.calc(qual);
      /* REVISÃO S5 M3 (14/10/2026): o galpão gerado ANTES da marca c.galpao não se distingue das barras desenhadas — se a
         obra tem o estado do assistente salvo (orcapro:metal:calc:<obra>), pergunta também (antes ia direto para a
         estrutura desenhada e calculava o galpão antigo como barras soltas) */
      var salvo = false;
      if (!galpao) { try { var gS = global.Gestao, sS = global.localStorage && JSON.parse(global.localStorage.getItem("orcapro:metal:calc:" + String((gS && gS._bimSel) || "geral")) || "null"); salvo = !!(sS && sS.estado); } catch (eS) { salvo = false; } }
      /* e as peças com o nome que o gerador do galpão dá ("… — pórtico 2", "… — vão 3") também contam como galpão antigo */
      if (!galpao && !salvo && !antigo) return livre();
      if (global.UI && UI.modal) {
        UI.modal("Qual estrutura?", '<p style="font-size:13px;line-height:1.5">' + (galpao ? "O modelo tem um <b>galpão do assistente</b> (" + galpao + " peças) e <b>" + desenhadas + " barra(s) desenhada(s)</b> fora dele." : "O modelo tem <b>" + desenhadas + " barra(s) de aço</b> e " + (antigo ? "<b>" + antigo + "</b> delas têm o nome que o gerador do <b>galpão do assistente</b> dá" : "esta obra tem um <b>galpão do assistente</b> salvo") + " (um galpão gerado antes desta versão não leva a marca de galpão e aparece como barras).") + " Qual você quer " + ({ calcular: "calcular", resultados: "ver", memorial: "no memorial", pranchas: "nas pranchas", cype: "exportar" }[qual] || "abrir") + "?</p>",
          [{ texto: "Estrutura desenhada", classe: "primary", onClick: function () { UI.fecharModal(); livre(); } }, { texto: "Galpão do assistente", onClick: function () { UI.fecharModal(); self.calc(qual); } }]);
        return true;
      }
      return livre();
    },
    /* o painel Cálculo: a tela é o js/metalcalcui.js (que pode ainda não ter carregado) */
    calc: function (qual) {
      var C = global.MetalCalcUI;
      if (!C || typeof C[qual] !== "function") { toast("O cálculo da metálica não carregou nesta tela (js/metalcalcui.js).", "erro", 8000); return false; }
      return C[qual]();
    },

    /* =============================================== DIÁLOGO genérico de campos */
    form: function (titulo, campos, ao, extraHtml, rotuloOk) {
      var h = NAO_CALCULO + (extraHtml || "") + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px 12px">';
      campos.forEach(function (c) {
        h += '<label style="display:flex;flex-direction:column;font-size:12px;gap:3px"><span>' + esc(c.rotulo) + (c.partida ? ' <i class="muted" title="valor de partida, editável">(partida)</i>' : "") + '</span>';
        if (c.opcoes) h += '<select data-met-campo="' + c.id + '">' + c.opcoes.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(c.valor) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>";
        else if (c.lista) h += '<input data-met-campo="' + c.id + '" list="met-dl-' + c.id + '" value="' + esc(c.valor) + '"><datalist id="met-dl-' + c.id + '">' + c.lista.map(function (o) { return '<option value="' + esc(o) + '">'; }).join("") + "</datalist>";
        else if (c.tipo === "check") h += '<input type="checkbox" data-met-campo="' + c.id + '"' + (c.valor ? " checked" : "") + ">";
        else h += '<input data-met-campo="' + c.id + '" value="' + esc(c.valor) + '"' + (c.num ? ' inputmode="decimal"' : "") + ">";
        h += "</label>";
      });
      h += "</div>";
      UI.modal(titulo, h, [
        { texto: rotuloOk || "Aplicar", classe: "primary", onClick: function () {
          var v = {};
          campos.forEach(function (c) { var el = document.querySelector('[data-met-campo="' + c.id + '"]'); if (!el) return; v[c.id] = c.tipo === "check" ? el.checked : el.value; });
          UI.fecharModal(); ao(v);
        } },
        { texto: "Cancelar", onClick: function () { UI.fecharModal(); } }
      ]);
    },
    parafusos: function () { return NN().PARAFUSOS.map(function (p) { return [p.id, p.id + (p.sistema === "POL" ? " (pol.)" : "")]; }); },
    classes: function () { var C = NN().CLASSES; return Object.keys(C).map(function (k) { return [k, C[k].nome]; }); },
    catalogo: function (serie) { var A = global.PerfisAco; if (!A) return []; return serie ? A.listar(serie) : ["W", "C", "L", "HSSR", "HSSC", "GERDAU"].reduce(function (o, s) { return o.concat(A.listar(s)); }, []); },
    pontoPadrao: function () {
      var cx = this.caixas(this.selecao())[0], b = B();
      if (cx) return [num(cx.cx, 0), num(cx.cy, 0), num(cx.cz, 0)];
      return [0, b && b.editarBase ? b.editarBase() : 0, 0];
    },

    /* ============================================================ PEÇAS */
    dlgChapa: function () {
      var self = this, P = this.pontoPadrao();
      this.form("Chapa paramétrica", [
        { id: "L", rotulo: "Comprimento (mm)", valor: 300, num: 1 }, { id: "B", rotulo: "Largura (mm)", valor: 200, num: 1 }, { id: "t", rotulo: "Espessura (mm)", valor: 12.5, num: 1, partida: 1 },
        { id: "plano", rotulo: "Plano", valor: "h", opcoes: [["h", "Horizontal (deitada)"], ["x", "Vertical, ao longo de X"], ["z", "Vertical, ao longo de Z"]] },
        { id: "parafuso", rotulo: "Parafuso dos furos", valor: "M20", opcoes: this.parafusos() }, { id: "furo", rotulo: "Furo", valor: "padrao", opcoes: [["padrao", "Padrão (db + 1,5)"], ["alargado", "Alargado"], ["pouco", "Pouco alongado"], ["muito", "Muito alongado"]] },
        { id: "nx", rotulo: "Furos ao longo (colunas)", valor: 2, num: 1 }, { id: "ny", rotulo: "Furos na largura (linhas)", valor: 2, num: 1 },
        { id: "borda", rotulo: "Borda até o furo (mm)", valor: NN().partida(20, "laminada").borda, num: 1, partida: 1 }, { id: "chanfro", rotulo: "Chanfro nos 4 cantos (mm)", valor: 0, num: 1 },
        { id: "recorte", rotulo: "Recorte central Ø (mm, 0 = sem)", valor: 0, num: 1 },
        { id: "x", rotulo: "Origem X (m)", valor: br(P[0], 3), num: 1 }, { id: "y", rotulo: "Origem Y (m)", valor: br(P[1], 3), num: 1 }, { id: "z", rotulo: "Origem Z (m)", valor: br(P[2], 3), num: 1 },
        { id: "aco", rotulo: "Aço", valor: "ASTM A36", lista: ["ASTM A36", "ASTM A572 Gr.50", "SAE 1020", "SAE 1045", "Inox AISI 304"] }
      ], function (v) { self.criarChapa(v); }, "", "Criar");
    },
    criarChapa: function (v) {
      var Lm = num(v.L, 300) / 1000, Bm = num(v.B, 200) / 1000, e = num(v.borda, 30) / 1000, nx = Math.max(0, Math.round(num(v.nx, 0))), ny = Math.max(0, Math.round(num(v.ny, 0))), p = NN().parafuso(v.parafuso || "M20");
      var furos = [];
      for (var i = 0; i < nx; i++) for (var j = 0; j < ny; j++) furos.push({ u: nx === 1 ? Lm / 2 : e + i * (Lm - 2 * e) / (nx - 1), v: ny === 1 ? Bm / 2 : e + j * (Bm - 2 * e) / (ny - 1), db: p.d, tipo: v.furo || "padrao" });
      var ch = num(v.chanfro, 0) / 1000, rec = num(v.recorte, 0) / 1000;
      var eixos = v.plano === "x" ? { ex: [1, 0, 0], ey: [0, 1, 0] } : (v.plano === "z" ? { ex: [0, 0, 1], ey: [0, 1, 0] } : { ex: [1, 0, 0], ey: [0, 0, -1] });
      var c = M().chapa({ origem: [num(v.x, 0), num(v.y, 0), num(v.z, 0)], ex: eixos.ex, ey: eixos.ey, t: num(v.t, 12.5) / 1000, ret: { L: Lm, B: Bm }, furos: furos, aco: v.aco,
        chanfros: ch > 0 ? [0, 1, 2, 3].map(function (k) { return { i: k, c: ch }; }) : [], recortes: rec > 0 ? [M().pol.circ(Lm / 2, Bm / 2, rec / 2, 48)] : [], papel: "Chapa" });
      if (c.erro) { toast(c.erro, "aviso"); return null; }
      var cf = L().conferirChapa(c);
      return this.criarPecas([c], "Chapa " + Math.round(Lm * 1000) + " × " + Math.round(Bm * 1000) + " × " + br(num(v.t, 12.5), 1) + " mm com " + furos.length + " furo(s)", cf.avisos);
    },
    criarPecas: function (cxs, resumo, avisos) {
      var self = this, ops = cxs.map(function (c) { return { op: "criar", id: self.novoId(), caixa: c }; });
      /* peça soldada em outra peça criada junto (suporte): "@base" vira o id */
      ops.forEach(function (o, i) { if (o.caixa.metal && o.caixa.metal.soldadaEm === "@base" && i > 0) o.caixa.metal.soldadaEm = ops[0].id; });
      var lote = { op: "lote", id: this.novoId(), origem: "metal-peca", ops: ops };
      if (!this.enviar(lote)) { toast("O editor recusou a peça.", "erro"); return null; }
      status(resumo + "." + (avisos && avisos.length ? " Atenção: " + avisos.map(function (a) { return a.texto || a; }).join("; ") + "." : "") + " Ctrl+Z desfaz.");
      if (avisos && avisos.length) this.mostrarAvisos(resumo, avisos.map(function (a) { return a.texto ? a.texto + " — NBR 8800 " + a.item : a; }));
      return lote;
    },
    dlgPerfil: function () {
      var self = this, P = this.pontoPadrao();
      this.form("Perfil cortado", [
        { id: "cat", rotulo: "Perfil (catálogo)", valor: "W200X26.6", lista: this.catalogo() }, { id: "L", rotulo: "Comprimento (mm)", valor: 3000, num: 1 },
        { id: "dir", rotulo: "Direção do eixo", valor: "x", opcoes: [["x", "Ao longo de X"], ["z", "Ao longo de Z"], ["y", "Vertical (Y)"]] },
        { id: "almaIni", rotulo: "Corte na alma, início (°)", valor: 0, num: 1 }, { id: "almaFim", rotulo: "Corte na alma, fim (°)", valor: 0, num: 1 },
        { id: "abaIni", rotulo: "Corte na aba, início (°)", valor: 0, num: 1 }, { id: "abaFim", rotulo: "Corte na aba, fim (°)", valor: 0, num: 1 },
        { id: "x", rotulo: "Início X (m)", valor: br(P[0], 3), num: 1 }, { id: "y", rotulo: "Início Y (m)", valor: br(P[1], 3), num: 1 }, { id: "z", rotulo: "Início Z (m)", valor: br(P[2], 3), num: 1 },
        { id: "aco", rotulo: "Aço", valor: "ASTM A572 Gr.50", lista: ["ASTM A36", "ASTM A572 Gr.50", "ASTM A992"] }
      ], function (v) {
        var ax = v.dir === "z" ? { ex: [0, 0, 1], ey: [0, 1, 0] } : (v.dir === "y" ? { ex: [0, 1, 0], ey: [1, 0, 0] } : { ex: [1, 0, 0], ey: [0, 1, 0] });
        var c = M().perfil({ origem: [num(v.x, 0), num(v.y, 0), num(v.z, 0)], ex: ax.ex, ey: ax.ey, cat: v.cat, L: num(v.L, 3000) / 1000, aco: v.aco, papel: "Perfil", ifc: v.dir === "y" ? "IFCCOLUMN" : "IFCMEMBER",
          cortes: { almaIni: num(v.almaIni, 0), almaFim: num(v.almaFim, 0), abaIni: num(v.abaIni, 0), abaFim: num(v.abaFim, 0) } });
        if (c.erro) { toast(c.erro, "aviso"); return; }
        self.criarPecas([c], "Perfil " + v.cat + " × " + Math.round(num(v.L, 3000)) + " mm");
      }, "", "Criar");
    },
    dlgMecanica: function () {
      var self = this, P = this.pontoPadrao();
      this.form("Peça mecânica", [
        { id: "tipo", rotulo: "Peça", valor: "flange", opcoes: [["flange", "Flange (disco com furação)"], ["suporte", "Suporte em L (2 chapas soldadas)"], ["eixo", "Eixo maciço"], ["bucha", "Bucha (tubo)"]] },
        { id: "D", rotulo: "Diâmetro externo / largura (mm)", valor: 200, num: 1 }, { id: "d", rotulo: "Furo central / interno (mm)", valor: 60, num: 1 },
        { id: "L", rotulo: "Comprimento / espessura (mm)", valor: 16, num: 1 }, { id: "n", rotulo: "Furos na flange", valor: 4, num: 1 }, { id: "Dc", rotulo: "Círculo de furação (mm)", valor: 150, num: 1 },
        { id: "parafuso", rotulo: "Parafuso", valor: "M12", opcoes: this.parafusos() },
        { id: "x", rotulo: "X (m)", valor: br(P[0], 3), num: 1 }, { id: "y", rotulo: "Y (m)", valor: br(P[1], 3), num: 1 }, { id: "z", rotulo: "Z (m)", valor: br(P[2], 3), num: 1 },
        { id: "aco", rotulo: "Material", valor: "SAE 1045", lista: ["SAE 1020", "SAE 1045", "ASTM A36", "Inox AISI 304"] }
      ], function (v) {
        var O = [num(v.x, 0), num(v.y, 0), num(v.z, 0)], mm = function (k, d) { return num(v[k], d) / 1000; }, r;
        if (v.tipo === "flange") r = M().flange({ origem: O, ex: [1, 0, 0], ey: [0, 0, -1], D: mm("D", 200), d: mm("d", 60), t: mm("L", 16), n: num(v.n, 4), Dc: mm("Dc", 150), db: NN().parafuso(v.parafuso).d, aco: v.aco });
        else if (v.tipo === "suporte") r = M().suporte({ origem: O, ex: [1, 0, 0], ey: [0, 0, 1], L: mm("D", 150), B: mm("Dc", 100), H: mm("Dc", 100), t: mm("L", 9.5), db: NN().parafuso(v.parafuso).d, aco: v.aco });
        else r = M().mecanica({ tipoMec: v.tipo, origem: O, ex: [1, 0, 0], ey: [0, 1, 0], D: mm("D", 50), d: mm("d", 20), L: mm("L", 200), aco: v.aco });
        if (r && r.erro) { toast(r.erro, "aviso"); return; }
        self.criarPecas(Array.isArray(r) ? r : [r], "Peça mecânica: " + v.tipo);
      }, "", "Criar");
    },

    /* =========================================================== LIGAÇÕES */
    PARAMS: {
      placaBase: [["t", "Espessura da placa (mm)", 25, 1], ["parafuso", "Chumbador", "3/4\"", 0, "par"], ["nChumb", "Chumbadores", 4, 0, [[4, "4"], [6, "6"]]], ["ancoragem", "Ancoragem no concreto (mm)", 400, 1], ["graute", "Graute (mm)", 25, 1], ["furo", "Furo", "alargado", 1, "furo"]],
      chapaExtremidade: [["t", "Espessura da chapa (mm)", 16, 1], ["parafuso", "Parafuso", "M20", 0, "par"], ["classe", "Classe", "8.8", 0, "classe"], ["linhas", "Linhas (0 = automático)", 0, 1], ["ext", "Chapa estendida além das mesas (mm)", 0, 1]],
      cantoneiraDupla: [["cat", "Cantoneira", "L89X89X7.9", 1, "L"], ["parafuso", "Parafuso", "M20", 0, "par"], ["classe", "Classe", "8.8", 0, "classe"], ["linhas", "Linhas (0 = automático)", 0, 1], ["folga", "Folga da viga ao pilar (mm)", 12.7, 1]],
      emendaCobrejunta: [["tAlma", "Tala da alma (mm)", 8, 1], ["tMesa", "Tala da mesa (mm)", 12.5, 1], ["colunas", "Colunas de parafuso por lado", 2, 1], ["parafuso", "Parafuso", "M20", 0, "par"], ["classe", "Classe", "8.8", 0, "classe"]],
      clipTerca: [["cat", "Cantoneira do clip", "L76X76X6.4", 1, "L"], ["parafuso", "Parafuso", "M12", 0, "par"], ["parafusos", "Parafusos por terça", 2, 1]],
      contraventamento: [["t", "Espessura do gusset (mm)", 9.5, 1], ["parafuso", "Parafuso", "M16", 0, "par"], ["parafusos", "Parafusos na diagonal", 2, 1], ["folga", "Folga da ponta ao apoio (mm)", 20, 1]],
      noTrelica: [["t", "Espessura do gusset (mm)", 9.5, 1], ["parafuso", "Parafuso", "M16", 0, "par"], ["parafusos", "Parafusos por barra", 2, 1]],
      enrijecedor: [["t", "Espessura (mm)", 8, 1], ["x", "Posição a partir do início (mm, vazio = meio)", "", 0], ["lados", "Lados", "ambos", 0, [["ambos", "Os dois lados da alma"], ["um", "Um lado"]]], ["chanfro", "Chanfro (mm, vazio = raio + 5)", "", 1]]
    },
    dlgLigacao: function (tipo) {
      var self = this, mac = L().MACROS[tipo], ids = this.selecao(), cxs = this.caixas(ids);
      var precisa = tipo === "noTrelica" ? 2 : mac.pede.length;
      if (cxs.length < precisa) { toast(mac.rotulo + ": selecione " + mac.pede.join(" e depois ") + " (com Ctrl para somar à seleção).", "aviso", 8000); status(mac.rotulo + ": selecione " + mac.pede.join(" + ") + "."); return; }
      var campos = this.PARAMS[tipo].map(function (p) {
        var c = { id: p[0], rotulo: p[1], valor: p[2], partida: !!p[3] };
        if (p[4] === "par") c.opcoes = self.parafusos(); else if (p[4] === "classe") c.opcoes = self.classes(); else if (p[4] === "L") c.lista = self.catalogo("L");
        else if (p[4] === "furo") c.opcoes = [["padrao", "Padrão (db + 1,5)"], ["alargado", "Alargado"], ["pouco", "Pouco alongado"], ["muito", "Muito alongado"]]; else if (Array.isArray(p[4])) c.opcoes = p[4];
        return c;
      });
      var sel = '<p style="font-size:12px;margin:0 0 8px">Peças: ' + cxs.map(function (c, i) { return "<b>" + esc((mac.pede[i] || "barra") + ": ") + "</b>" + esc(c.tipo === "metal" ? M().nome(c) : (c.tipo === "pilar" ? "Pilar " : "Viga ") + c.id); }).join(" · ") + "</p>";
      this.form(mac.rotulo, campos, function (v) { self.aplicarLigacao(tipo, cxs, self.parDe(tipo, v)); }, sel);
    },
    parDe: function (tipo, v) {
      var p = {}, mmK = ["t", "ext", "folga", "tAlma", "tMesa", "ancoragem", "graute", "x", "chanfro"];
      Object.keys(v).forEach(function (k) {
        if (v[k] === "" || v[k] == null) return;
        p[k] = mmK.indexOf(k) >= 0 ? num(v[k], 0) / 1000 : (/^(linhas|colunas|parafusos|nChumb)$/.test(k) ? num(v[k], 0) : v[k]);
      });
      if (p.linhas === 0) delete p.linhas;
      return p;
    },
    /* aplica (e devolve o resultado — a e2e e o teste usam) */
    aplicarLigacao: function (tipo, cxs, par) {
      var r = L().aplicar(tipo, cxs, junta({ lig: this.novoId() }, par));
      /* a viga e o pilar fora de ordem: tenta ao contrário uma vez */
      if (!r.ok && cxs.length === 2 && /chapaExtremidade|cantoneiraDupla|clipTerca|contraventamento/.test(tipo)) { var r2 = L().aplicar(tipo, [cxs[1], cxs[0]], junta({ lig: this.novoId() }, par)); if (r2.ok) r = r2; }
      if (!r.ok) { toast(L().MACROS[tipo].rotulo + ": " + r.motivo, "aviso", 8000); return r; }
      var op = L().ops(r, this.novoId.bind(this));
      if (!this.enviar(op)) { toast("O editor recusou a ligação.", "erro"); r.ok = false; return r; }
      this.ultimo = { tipo: tipo, resumo: r.resumo, avisos: r.avisos, lig: r.lig };
      status(r.resumo + "." + (r.avisos.length ? " " + r.avisos.length + " aviso(s) da NBR 8800." : " Distâncias conferidas pela NBR 8800.") + " Ctrl+Z desfaz.");
      if (r.avisos.length) this.mostrarAvisos(r.resumo, r.avisos);
      else toast(r.resumo + ".", "ok", 7000);
      return r;
    },
    mostrarAvisos: function (titulo, avisos) {
      UI.modal("Conferência — NBR 8800", NAO_CALCULO + '<p style="font-size:13px"><b>' + esc(titulo) + '</b></p><ul data-met="avisos" style="font-size:12px;max-height:50vh;overflow:auto">' + avisos.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>" +
        '<p class="muted" style="font-size:11px">Aviso, não bloqueio: quem decide é o projeto. As distâncias de partida estão em “De onde vem cada número”.</p>', [{ texto: "Ok", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
    },
    conferirTudo: function () {
      var st = this.estado(); if (!st) { toast("Abra o modelador primeiro.", "aviso"); return; }
      var av = [], nP = 0;
      st.caixas.forEach(function (c) {
        if (c.tipo === "metal" && c.metal && c.metal.kind === "chapa" && c.metal.furos.length) { nP++; av = av.concat(L().conferirChapa(c).avisos.map(function (a) { return a.texto + " — NBR 8800 " + a.item; })); }
        var mb = M().membro(c), fs = M().furosDe(c);
        if (mb && fs.length) { nP++; av = av.concat(L().conferirMembro(mb, fs, c.tipo === "metal" ? M().nome(c) : (c.tipo === "pilar" ? "Pilar " : "Viga ") + c.id).map(function (a) { return a.texto + " — NBR 8800 " + a.item; })); }
      });
      if (!av.length) { toast(nP + " peça(s) com furos conferidas: nenhuma distância fora da NBR 8800.", "ok", 7000); return av; }
      this.mostrarAvisos(nP + " peça(s) com furos conferidas", av);
      return av;
    },
    apagarLigacao: function () {
      var cx = this.caixas(this.selecao())[0], lig = cx && cx.metal && cx.metal.lig;
      if (!lig && cx && cx.metalFuros && cx.metalFuros.length) lig = cx.metalFuros[0].lig;
      if (!lig) { toast("Selecione uma chapa, um parafuso ou uma peça da ligação.", "aviso"); return; }
      if (!this.enviar({ op: "lote", id: this.novoId(), origem: "metal-lig", ops: [{ op: "metalApagarLig", lig: lig }] })) { toast("O editor recusou.", "erro"); return; }
      status("Ligação apagada (chapas, parafusos e furos). Ctrl+Z desfaz.");
    },

    /* ============================================================= GALPÃO */
    dlgGalpao: function () {
      var self = this, G0 = global.BimMetalGalpao.PADRAO, P = this.pontoPadrao();
      /* com uma peça de um galpão selecionada, o assistente EDITA esse galpão (abre com os dados dele e refaz no lugar);
         sem seleção, cria um novo */
      var selC = this.caixas(this.selecao())[0], alvo = selC && selC.galpao ? this.galpao(selC.galpao) : null;
      if (alvo && alvo.info && alvo.info.calc) { toast("Este galpão veio do Cálculo do galpão: edite os dados lá (Metálica › Cálculo) e use “Atualizar o galpão no modelo”.", "aviso", 9000); if (global.MetalCalcUI && MetalCalcUI.abrir) MetalCalcUI.abrir(); return; }
      if (alvo && alvo.info && alvo.info.par) {
        var ap = alvo.info.par, g2 = {}; Object.keys(G0).forEach(function (k) { g2[k] = G0[k]; }); Object.keys(ap).forEach(function (k) { if (ap[k] != null) g2[k] = ap[k]; });
        G0 = g2; P = [num(ap.x0, P[0]), num(ap.base, P[1]), num(ap.z0, P[2])];
      }
      this.form(alvo ? "Editar galpão (" + alvo.n + " peças)" : "Assistente de galpão", [
        { id: "vao", rotulo: "Vão (m, eixo a eixo)", valor: G0.vao, num: 1 }, { id: "comprimento", rotulo: "Comprimento (m)", valor: G0.comprimento, num: 1 }, { id: "espacamento", rotulo: "Espaçamento dos pórticos (m)", valor: G0.espacamento, num: 1 },
        { id: "peDireito", rotulo: "Pé-direito (m)", valor: G0.peDireito, num: 1 }, { id: "inclinacao", rotulo: "Inclinação do telhado (%)", valor: G0.inclinacao, num: 1 },
        { id: "tipo", rotulo: "Pórtico", valor: G0.tipo, opcoes: [["alma-cheia", "Alma cheia"], ["trelicado", "Treliçado"]] },
        { id: "pilar", rotulo: "Perfil do pilar", valor: G0.pilar, lista: this.catalogo(), partida: 1 }, { id: "viga", rotulo: "Perfil da viga (alma cheia)", valor: G0.viga, lista: this.catalogo(), partida: 1 },
        { id: "banzo", rotulo: "Banzos (treliçado)", valor: G0.banzo, lista: this.catalogo("L"), partida: 1 }, { id: "diagonal", rotulo: "Diagonais e montantes", valor: G0.diagonal, lista: this.catalogo("L"), partida: 1 },
        { id: "alturaTrelica", rotulo: "Altura da treliça na ponta (m)", valor: G0.alturaTrelica, num: 1, partida: 1 },
        { id: "terca", rotulo: "Perfil da terça", valor: G0.terca, lista: this.catalogo(), partida: 1 }, { id: "espTercas", rotulo: "Espaçamento máx. das terças (m)", valor: G0.espTercas, num: 1, partida: 1 },
        { id: "contravento", rotulo: "Perfil do contraventamento", valor: G0.contravento, lista: this.catalogo("L"), partida: 1 }, { id: "tirante", rotulo: "Tirante Ø (mm, 0 = sem)", valor: G0.tirante * 1000, num: 1, partida: 1 },
        { id: "tapamentos", rotulo: "Colunas de tapamento por oitão", valor: G0.tapamentos, num: 1 }, { id: "tapamento", rotulo: "Perfil da coluna de tapamento", valor: G0.tapamento, lista: this.catalogo(), partida: 1 },
        { id: "contraventos", rotulo: "Contraventamentos nos vãos extremos", valor: G0.contraventos, tipo: "check" }, { id: "ligacoes", rotulo: "Aplicar as ligações padrão", valor: G0.ligacoes, tipo: "check" },
        { id: "x0", rotulo: "Origem X (m)", valor: br(P[0], 2), num: 1 }, { id: "z0", rotulo: "Origem Z (m)", valor: br(P[2], 2), num: 1 }, { id: "base", rotulo: "Cota da base (m)", valor: br(P[1], 2), num: 1 }
      ].concat(this.camposVedacao(G0)), function (v) { self.gerarGalpao(v, alvo ? { substituir: alvo.id } : {}); }, "", alvo ? "Atualizar este galpão" : "Gerar galpão");
    },
    /* VEDAÇÃO na fita (14/10/2026, js/acovedacao.js): a telha da cobertura e o fechamento das laterais e dos oitões viram
       PEÇAS do modelo — telhas, alvenaria do misto, cumeeira, rufos, contra-rufos, arremates e calha. As telhas e as
       paredes são as do catálogo (js/acofechamentos.js); beiral, portão e medidas dos acessórios são de partida. */
    FECH_FITA: [["aberto", "Aberto (só os pilares)"], ["telha", "Telha"], ["misto", "Alvenaria até h + telha acima"], ["alvenaria", "Alvenaria até o telhado"]],
    camposVedacao: function (G0) {
      var A = global.AcoFechamentos, V = global.AcoVedacao, lt = A && A.telhas ? A.telhas().map(function (t) { return [t.id, A.nome(t)]; }) : [];
      if (!A || !V || !lt.length) return [];
      var pd = V.PARTIDA, val = function (k, d) { return G0[k] != null ? G0[k] : d; };
      return [
        { id: "cobertura", rotulo: "Telha da cobertura", valor: val("cobertura", A.PADRAO_TELHA), opcoes: [["", "Sem telha (só a estrutura)"]].concat(lt) },
        { id: "fechLateral", rotulo: "Fechamento das laterais", valor: val("fechLateral", "aberto"), opcoes: this.FECH_FITA },
        { id: "fechOitao", rotulo: "Fechamento dos oitões", valor: val("fechOitao", "aberto"), opcoes: this.FECH_FITA },
        { id: "alturaAlvenaria", rotulo: "Altura da alvenaria (m, no misto)", valor: br(val("alturaAlvenaria", pd.alturaAlvenaria), 2), num: 1, partida: 1 },
        { id: "telhaFech", rotulo: "Telha do fechamento", valor: val("telhaFech", ""), opcoes: [["", "A mesma da cobertura"]].concat(lt) },
        { id: "portaoL", rotulo: "Portão no oitão da frente — largura (m, 0 = sem)", valor: br(val("portaoL", 0), 2), num: 1 },
        { id: "portaoA", rotulo: "Portão — altura (m)", valor: br(val("portaoA", 4.5), 2), num: 1 },
        { id: "beiral", rotulo: "Beiral lateral (m)", valor: br(val("beiral", pd.beiral), 2), num: 1, partida: 1 },
        { id: "beiralOitao", rotulo: "Beiral no oitão (m)", valor: br(val("beiralOitao", pd.beiralOitao), 2), num: 1, partida: 1 },
        { id: "calha", rotulo: "Calha nos beirais", valor: !!val("calha", false), tipo: "check" }
      ];
    },
    /* os campos da fita → o par.vedacao do js/metalgalpao.js */
    vedacaoDaFita: function (v) {
      var h = num(v.alturaAlvenaria, 3), tf = v.telhaFech || "", cob = v.cobertura ? { telhaId: String(v.cobertura) } : null;
      function face(t) { return { tipo: t || "aberto", alturaAlvenaria: h, telhaId: tf, bloco: "vedacao-concreto", aberturas: [] }; }
      var faces = { esquerda: face(v.fechLateral), direita: face(v.fechLateral), frente: face(v.fechOitao), fundo: face(v.fechOitao) };
      var pl = num(v.portaoL, 0), pa = num(v.portaoA, 0), vao = num(v.vao, 12);
      if (pl > 0 && pa > 0 && faces.frente.tipo !== "aberto") faces.frente.aberturas = [{ s0: Math.max(0, vao / 2 - pl / 2), s1: Math.min(vao, vao / 2 + pl / 2), altura: pa }];
      return { cobertura: cob, faces: faces, beiral: num(v.beiral, null), beiralOitao: num(v.beiralOitao, null), calha: !!v.calha };
    },
    /* v = os campos do diálogo (tirante em MM) ou, com op.doCalculo, o par do
       BimMetalGalpao.parDoCalculo (já em METROS: o modelo do cálculo, com perfis,
       terças, travessas, contraventamento e ligações dimensionadas).
       ⚠ Sem o op.doCalculo, o tirante de 9,5 mm do cálculo virava 0,0095 mm ÷ 1000 e
         o modelador não desenhava corrente nenhuma (exige tirante > 5 mm). */
    /* GALPÕES NO MODELO: cada galpão gerado leva uma identidade (caixa.galpao = id em TODAS as peças dele, inclusive
       chapas das ligações) e a 1ª peça guarda os dados (caixa.galpaoInfo = { id, par, calc, em }). É isso que deixa o
       cálculo ATUALIZAR o galpão que já está no modelo em vez de desenhar outro por cima (pedido do Rogério, 12/10/2026). */
    galpoes: function () {
      var st = this.estado(), por = {}, ordem = [];
      ((st && st.caixas) || []).forEach(function (c) {
        if (!c || !c.galpao) return; var g = String(c.galpao);
        if (!por[g]) { por[g] = { id: g, pecas: [], info: null }; ordem.push(g); }
        por[g].pecas.push(String(c.id)); if (c.galpaoInfo) por[g].info = c.galpaoInfo;
      });
      return ordem.map(function (g) {
        var o = por[g], P = (o.info && o.info.par) || {};
        o.n = o.pecas.length; o.x0 = num(P.x0, 0); o.z0 = num(P.z0, 0); o.base = num(P.base, 0); o.vao = num(P.vao, 0); o.comprimento = num(P.comprimento, 0);
        return o;
      });
    },
    galpao: function (id) { return this.galpoes().filter(function (g) { return g.id === String(id); })[0] || null; },
    gerarGalpao: function (v, op) {
      op = op || {};
      var par = {};
      Object.keys(v || {}).forEach(function (k) { par[k] = v[k]; });
      /* atualizar: o galpão op.substituir é refeito no MESMO lugar (origem guardada nele) */
      var alvo = op.substituir ? this.galpao(op.substituir) : null;
      if (op.substituir && !alvo) { toast("O galpão que este cálculo desenhou não está mais no modelo — use “Gerar o modelo 3D”.", "aviso", 8000); return { ok: false, motivo: "galpão não encontrado" }; }
      if (alvo && alvo.info && alvo.info.par) ["x0", "z0", "base"].forEach(function (k) { if (alvo.info.par[k] != null) par[k] = alvo.info.par[k]; });
      ["vao", "comprimento", "espacamento", "peDireito", "inclinacao", "alturaTrelica", "espTercas", "tapamentos", "x0", "z0", "base"].forEach(function (k) { if (par[k] != null) par[k] = num(par[k], undefined); });
      if (!op.doCalculo) {
        if (par.tirante != null) par.tirante = num(par.tirante, 0) / 1000;
        if (par.tirante === 0) par.tirantes = false;
        /* a vedação da fita (os campos ficam no par: o "Editar galpão" reabre com eles) */
        if (par.cobertura != null || par.fechLateral != null || par.fechOitao != null) par.vedacao = this.vedacaoDaFita(par);
      }
      var r = global.BimMetalGalpao.gerar(par, this.novoId.bind(this));
      if (!r.ok) { toast("Galpão: " + r.motivo, "aviso", 8000); return r; }
      /* identidade: todas as peças criadas (também as das ligações, nos lotes de dentro) levam o id do galpão */
      var gid = alvo ? alvo.id : "galpao-" + this.novoId(), primeira = true, info = { id: gid, par: JSON.parse(JSON.stringify(par)), calc: op.calc ? JSON.parse(JSON.stringify(op.calc)) : null, em: new Date().toISOString() };
      (function marcar(ops) { (ops || []).forEach(function (o) {
        if (!o) return;
        if (o.op === "criar" && o.caixa) { o.caixa.galpao = gid; if (primeira) { o.caixa.galpaoInfo = info; primeira = false; } }
        if (o.op === "lote") marcar(o.ops);
      }); })(r.op.ops);
      /* atualizar = apagar as peças do galpão antigo e criar as novas NUM lote só (um Ctrl+Z volta tudo); as peças
         que o usuário desenhou à parte não têm a marca e ficam */
      if (alvo) {
        r.op.ops = alvo.pecas.map(function (id) { return { op: "apagar", id: id }; }).concat(r.op.ops);
        r.op.pedido = "Atualizar o galpão (" + alvo.n + " peças refeitas)";
      }
      r.galpaoId = gid; r.atualizou = !!alvo;
      if (!this.enviar(r.op)) { toast("O editor recusou o galpão.", "erro"); r.ok = false; return r; }
      this.ultimo = { tipo: "galpao", resumo: r.resumo, avisos: r.avisos.concat(r.avisosLigacoes), doCalculo: !!op.doCalculo, galpaoId: gid };
      status(r.resumo + (op.doCalculo ? " Modelo do cálculo: perfis, terças, travessas, contraventamento e ligações dimensionadas. Ctrl+Z desfaz." : " Não dimensiona: confira os perfis no projeto estrutural. Ctrl+Z desfaz."));
      if (op.doCalculo) { this.enquadrarGalpao(r); return r; }
      if (r.avisos.length || r.avisosLigacoes.length) this.mostrarAvisos(r.resumo, r.avisos.concat(r.avisosLigacoes));
      else toast(r.resumo, "ok", 9000);
      this.enquadrarGalpao(r);
      return r;
    },
    /* depois de gerar, a câmera vai até o galpão. ⚠ O BIM não tem enquadrar() (a chamada antiga
       não fazia nada) e o Enquadrar da barra só mede o modelo IFC (modelRoot): as peças do
       modelador ficavam fora do quadro. BIM.olharPara(centro, distância) voa até o ponto pela
       direção atual da câmera; a distância cabe o galpão inteiro no campo de visão. */
    enquadrarGalpao: function (r) {
      var b = B(); if (!b || !b.olharPara || !r) return false;
      var p = r.par || {}, vao = num(p.vao, 0), L = num(p.comprimento, 0), mn, mx;
      if (vao > 0 && L > 0) {
        var H = num(p.peDireito, 0) + vao / 2 * num(p.inclinacao, 0) / 100;
        mn = [num(p.x0, 0), num(p.base, 0), num(p.z0, 0)]; mx = [mn[0] + vao, mn[1] + H, mn[2] + L];
      } else {
        mn = [Infinity, Infinity, Infinity]; mx = [-Infinity, -Infinity, -Infinity];
        (r.pecas || []).forEach(function (c) { [c.cx, c.cy, c.cz].forEach(function (v, i) { v = Number(v); if (isFinite(v)) { mn[i] = Math.min(mn[i], v); mx[i] = Math.max(mx[i], v); } }); });
        if (!isFinite(mn[0])) return false;
      }
      var cam = b.cameraAtual ? b.cameraAtual() : null, fov = cam && cam.fov > 0 ? cam.fov : 50;
      /* a esfera que envolve o galpão (meia diagonal) cabe no campo de visão VERTICAL (o menor,
         na tela deitada): d = R ÷ sen(fov/2), com 10 % de folga. ⚠ Com a meia maior dimensão
         no lugar de R, o 12 × 24 saía cortado em cima e embaixo (a diagonal passa do quadro). */
      var dx = mx[0] - mn[0], dy = mx[1] - mn[1], dz = mx[2] - mn[2], raio = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz) / 2, 1);
      try { b.olharPara([(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2], raio / Math.sin(fov * Math.PI / 360) * 1.1); return true; } catch (e) { return false; }
    },

    /* ========================================================= FABRICAÇÃO */
    numerar: function () {
      var st = this.estado(); if (!st) { toast("Abra o modelador primeiro.", "aviso"); return null; }
      var n = F().numerar(st), op = F().opNumerar(st);
      if (!op) { toast("Não há peça de aço para numerar.", "aviso"); return n; }
      if (!this.enviar(op)) { toast("O editor recusou a numeração.", "erro"); return n; }
      status(n.grupos.length + " marca(s) de peça para " + n.pecas.length + " peça(s) e " + n.conjuntos.length + " conjunto(s) de montagem. Peças iguais têm a mesma marca. Ctrl+Z desfaz.");
      toast("Numeração: " + n.grupos.length + " marcas de peça, " + n.conjuntos.length + " conjuntos de montagem.", "ok");
      return n;
    },
    zip: function (arqs) {
      var Z = global.BimBcf; if (!Z || !Z.zipEscrever) return null;
      return Z.zipEscrever(arqs);
    },
    exportar: function (qual) {
      var st = this.estado(); if (!st) { toast("Abra o modelador primeiro.", "aviso"); return null; }
      var r = F().arquivos(st, { pedido: this.nomeObra().slice(0, 20) }), sel = {};
      Object.keys(r.arquivos).forEach(function (k) { if (qual === "dstv" ? /^DSTV\//.test(k) : /^DXF\//.test(k)) sel[k] = r.arquivos[k]; });
      var n = Object.keys(sel).length, av = qual === "dstv" ? (r.avisos || []) : [];
      /* DSTV: peça que não passou na validação NÃO vira .nc1 — o aviso diz qual e por quê (nunca um ST inválido na máquina) */
      if (!n) { toast(qual === "dstv" ? (av.length ? "Nenhum .nc1 gerado: " + av[0] + (av.length > 1 ? " (+" + (av.length - 1) + " aviso(s))" : "") : "Não há perfil nem chapa para o DSTV.") : "Não há chapa para o DXF.", "aviso", av.length ? 12000 : 5000); return null; }
      this.ultimo = { tipo: qual, arquivos: sel, nesting: r.nesting, avisos: av };
      var z = this.zip(sel); if (!z) { toast("O gerador de .zip (js/bimbcf.js) não carregou.", "erro"); return null; }
      this.baixar(this.arqBase() + (qual === "dstv" ? "-dstv.zip" : "-dxf-chapas.zip"), z, "application/zip");
      var extra = qual === "dxf" && r.nesting.length ? " Nesting nas chapas comerciais (valores de partida, Fabricação › Nesting de chapas): " + r.nesting.map(function (x) { return x.grupo + " " + x.chapas + " chapa(s), " + br(x.aproveitamento, 1) + " %"; }).join("; ") + "." : "";
      toast((qual === "dstv" ? n + " arquivo(s) DSTV NC1" : n + " DXF de corte") + " no .zip." + extra + " Confira o sentido dos ângulos e o cabeçalho de chapa no pós-processador da máquina." + (av.length ? " ATENÇÃO — " + av.length + " aviso(s): " + av.slice(0, 3).join("; ") + (av.length > 3 ? "; …" : "") + "." : ""), av.length ? "aviso" : "ok", av.length ? 15000 : 10000);
      return sel;
    },
    listas: function () {
      var st = this.estado(), self = this; if (!st) { toast("Abra o modelador primeiro.", "aviso"); return; }
      var Ls = F().listas(st);
      if (!Ls.pecas.length) { toast("Não há peça de aço no modelo.", "aviso"); return; }
      this.ultimo = { tipo: "listas", listas: Ls };
      var go = function () {
        F().xlsx(Ls, global.ExcelJS).xlsx.writeBuffer().then(function (buf) {
          self.baixar(self.arqBase() + "-listas-fabricacao.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
          toast("Listas: " + Ls.pecas.length + " marcas, " + Ls.conjuntos.length + " conjuntos, " + Ls.parafusos.reduce(function (s, p) { return s + p.quantidade; }, 0) + " parafusos — " + br(Ls.totais.peso, 1) + " kg de aço (" + br(Ls.totais.kN, 1) + " kN).", "ok", 9000);
        }, function (e) { toast("Não gerei a planilha: " + e.message, "erro"); });
      };
      if (global.ExcelJS) go(); else if (global.ExcelOrc && ExcelOrc.ensureExcelJS) ExcelOrc.ensureExcelJS(go); else toast("O gerador de Excel não carregou.", "erro");
    },
    ifc: function (soTexto) {
      var b = B(), self = this, G = this._G || global.Gestao; if (!b || !b.ifcSaida) { toast("Abra o BIM primeiro.", "aviso"); return Promise.resolve(null); }
      var niveis = G && G._nivLer ? G._nivLer().map(function (n) { return { id: n.id, nome: n.nome, elevacao: Number(n.elevacao) }; }) : [];
      return b.ifcSaida({ fabricacao: true, niveis: niveis, projeto: this.nomeObra(), semente: "obra:" + ((G && G._bimSel) || "geral"), arquivo: this.arqBase() + "-fabricacao.ifc" }).then(function (r) {
        if (!r || !r.ok) { toast("Não exportei o IFC: " + ((r && r.erro) || "erro"), "aviso"); return null; }
        if (!soTexto) {
          self.baixar(self.arqBase() + "-fabricacao.ifc", r.texto, "application/x-step");
          var pe = r.resumo.porEntidade;
          toast("IFC de fabricação: " + ["IFCELEMENTASSEMBLY", "IFCPLATE", "IFCMEMBER", "IFCBEAM", "IFCCOLUMN", "IFCMECHANICALFASTENER", "IFCOPENINGELEMENT"].filter(function (k) { return pe[k]; }).map(function (k) { return pe[k] + " " + k.replace("IFC", "").toLowerCase(); }).join(", ") + ".", "ok", 9000);
        }
        return r;
      });
    },
    pacote: function () {
      var st = this.estado(), self = this; if (!st) { toast("Abra o modelador primeiro.", "aviso"); return; }
      /* sem peça de aço o pacote saía MUDO (nem .zip nem recado) — os vizinhos da Fabricação já avisavam (auditoria da fita, 12/10/2026) */
      if (!F().listas(st).pecas.length) { toast("Não há peça de aço no modelo para o pacote da fábrica.", "aviso"); return; }
      var r = F().arquivos(st, { pedido: this.nomeObra().slice(0, 20) }), arqs = {};
      Object.keys(r.arquivos).forEach(function (k) { arqs[k] = r.arquivos[k]; });
      /* a lista de corte (aproveitamento de barras) e o caderno de desenhos no Padrão RA (js/metalfabui.js) entram no pacote */
      var X = global.MetalFabUI, CO = global.BimMetalCorte, FDs = global.BimMetalFabDes, plano = null;
      try { if (X && CO && r.numeracao) plano = CO.planoBarras(r.numeracao, X.cfg()); } catch (eP) { plano = null; }
      try { if (X && FDs && global.SvgPdf) { var fl = FDs.folhasFabricacao(st, (function () { var o = X.opFolhas(); o.numeracao = r.numeracao; return o; })()); if (fl.ok && fl.folhas.length) arqs["desenhos-fabricacao.pdf"] = FDs.pdf(fl.folhas, "Desenhos de fabricação"); } } catch (eD) {}
      var fim = function (buf, bufCorte) {
        if (buf) arqs["listas-fabricacao.xlsx"] = new Uint8Array(buf);
        if (bufCorte) arqs["lista-de-corte.xlsx"] = new Uint8Array(bufCorte);
        self.ifc(true).then(function (ri) {
          if (ri && ri.texto) arqs["fabricacao.ifc"] = ri.texto;
          arqs["LEIA-ME.txt"] = "OrcaPRO Modela - Metalica & Mecanica\r\nDSTV/: um .nc1 por marca (DSTV NC1, 7a ed. jul/1998). Conferir no pos-processador da maquina o sentido dos angulos de corte e o cabecalho de chapa.\r\nDXF/: chapas 1:1 em mm (CUT_OUTSIDE, CUT_INSIDE, ETCH; BEND nas chapas dobradas planificadas) e o nesting nas chapas comerciais.\r\nlista-de-corte.xlsx: aproveitamento de barras (barras a comprar, plano de corte, sobras). desenhos-fabricacao.pdf: uma folha por marca e por conjunto (Padrao RA).\r\nNao e calculo estrutural: perfis, parafusos, chapas e soldas de partida devem ser conferidos pelo projeto.\r\n";
          var z = self.zip(arqs); if (!z) { toast("O gerador de .zip não carregou.", "erro"); return; }
          self.ultimo = { tipo: "pacote", arquivos: Object.keys(arqs) };
          self.baixar(self.arqBase() + "-pacote-fabrica.zip", z, "application/zip");
          toast("Pacote da fábrica: " + Object.keys(arqs).length + " arquivos (DSTV, DXF, nesting, listas, lista de corte, desenhos e IFC).", "ok", 9000);
        });
      };
      var Ls = r.listas;
      var go = function () {
        F().xlsx(Ls, global.ExcelJS).xlsx.writeBuffer().then(function (b1) {
          if (!plano || !plano.grupos.length) { fim(b1, null); return; }
          CO.xlsxCorte(plano, global.ExcelJS, { obra: self.nomeObra() }).xlsx.writeBuffer().then(function (b2) { fim(b1, b2); }, function () { fim(b1, null); });
        }, function () { fim(null, null); });
      };
      if (global.ExcelJS) go(); else if (global.ExcelOrc && ExcelOrc.ensureExcelJS) ExcelOrc.ensureExcelJS(go); else fim(null);
    },
    /* DESENHO DE FABRICAÇÃO → as Pranchas do projeto (uma folha A3 por marca de peça e por conjunto); o caderno
       em PDF no Padrão RA (carimbo RA) é o js/metalfabui.js — o botão abre lá e este é o "Enviar às Pranchas" */
    desenhosPrancha: function () {
      var st = this.estado(), G = this._G || global.Gestao; if (!st) { toast("Abra o modelador primeiro.", "aviso"); return null; }
      var n = F().numerar(st); if (!n.grupos.length) { toast("Não há peça de aço no modelo.", "aviso"); return null; }
      var folhas = [], imgs = {}, base = "metfab:" + Date.now().toString(36) + ":";
      function folha(d, i, titulo) {
        if (!d || !d.svg) return;
        var ch = base + i, url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(d.svg);
        imgs[ch] = url;
        folhas.push({ id: "f" + (folhas.length + 1), conteudo: titulo, escala: "1:" + d.escala, blocos: [
          { tipo: "imagem", x: 30, y: 15, w: 270, h: 170, titulo: d.titulo, chave: ch },
          { tipo: "tabela", x: 30, y: 192, w: 270, h: 80, titulo: "Lista", cabecalho: d.tabela.cabecalho, linhas: d.tabela.linhas.slice(0, 24) }
        ] });
      }
      n.grupos.forEach(function (g, i) { var p = g.rep; folha(p.kind === "perfil" ? F().desenhoPerfil(p, g.marca, g.ids.length) : (p.kind === "chapa" ? F().desenhoChapa(p, g.marca, g.ids.length) : null), "p" + i, "Peça " + g.marca); });
      n.conjuntos.forEach(function (c, i) { folha(F().desenhoConjunto(st, c, n), "c" + i, "Conjunto " + c.marca); });
      var pr = { id: "", obraId: String((G && G._bimSel) || ""), nome: "Fabricação — metálica (" + n.grupos.length + " peças, " + n.conjuntos.length + " conjuntos)", formato: "A3", orientacao: "paisagem", origem: "metalica", criadoEm: new Date().toISOString(),
                 carimbo: { projeto: "Desenho de fabricação — estrutura metálica", obra: this.nomeObra(), data: new Date().toLocaleDateString("pt-BR") }, folhas: folhas };
      this.ultimo = { tipo: "desenho", folhas: folhas.length, prancha: pr, imagens: imgs };
      var salvar = function () {
        try { if (global.Store && global.Auth) global.Store.salvar(Auth.empresaId(), "bim_pranchas", global.Prancha ? Prancha.normalizar(pr) : pr); } catch (e) { toast("Não gravei a prancha: " + e.message, "erro"); return; }
        try { if (G && G._bimAbrirPainel) { G._bimAbrirPainel("pranchas"); G._prRender(); } } catch (e2) {}
        toast("Desenho de fabricação: " + folhas.length + " folha(s) A3 em Pranchas do projeto (furação cotada a partir da origem).", "ok", 9000);
      };
      if (global.Idb && Idb.set) Promise.all(Object.keys(imgs).map(function (k) { return Idb.set(k, imgs[k])["catch"](function () {}); })).then(salvar);
      else salvar();
      return pr;
    },
    fontes: function () {
      var f = NN().fontes(), h = NAO_CALCULO + '<table class="tabela" data-met="fontes"><thead><tr><th>Regra</th><th>Fonte</th><th>Situação</th></tr></thead><tbody>' +
        f.map(function (x) { return "<tr><td>" + esc(x.regra) + "</td><td>" + esc(x.item) + "</td><td>" + esc(x.situacao) + "</td></tr>"; }).join("") +
        "<tr><td>Formato DSTV (blocos ST, BO, AK, IK, SI, EN)</td><td>DSTV — Standard Description for Steel Structure Pieces for the Numerical Controls, 7ª ed., jul/1998</td><td>conferido; ângulo de corte, cabeçalho de chapa e oblongo: conferir no pós-processador</td></tr>" +
        "<tr><td>Perfis</td><td>" + esc((global.PerfisAco && PerfisAco.FONTE) || "catálogo") + " · Gerdau (folder técnico 10/18)</td><td>catálogo</td></tr>" +
        "<tr><td>Massa específica do aço</td><td>7 850 kg/m³</td><td>usada no peso de todas as peças</td></tr></tbody></table>" +
        '<p class="muted" style="font-size:11px">A ABNT NBR 8800:2024 já existe: conferir qual edição a obra adota.</p>';
      UI.modal("De onde vem cada número", h, [{ texto: "Ok", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
    }
  };

  global.BimMetalUI = BimMetalUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimMetalUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
