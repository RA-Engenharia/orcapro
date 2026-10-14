/* =====================================================================
 * metalacessosui.js — a TELA dos ACESSOS INDUSTRIAIS (aba Metálica &
 * Mecânica › grupo "Acessos"; só com a prévia do modelador). 14/10/2026.
 *
 * Quem desenha é o js/metalacessos.js (tipos registrados nas peças prontas)
 * e quem confere a norma e dimensiona é o js/acoacessos.js. Aqui:
 *   · os comandos do grupo Acessos: Escolher o acesso, Escada, Escada de
 *     marinheiro, Plataforma, Plataforma anelar, Passarela, Guarda-corpo,
 *     Piso, Verificar acesso — e as dicas ilustradas deles;
 *   · os CAMPOS do diálogo de cada tipo novo (o diálogo, a prévia, o
 *     posicionar por clique e o editar no lugar são os das peças prontas,
 *     js/metalprontasui.js, que mostra a conformidade ao vivo);
 *   · ESCOLHER O ACESSO: desnível, espaço em planta, uso → o tipo de acesso
 *     com o motivo e a norma, e o botão que abre o diálogo dele;
 *   · VERIFICAR ACESSO: a peça de acesso selecionada → conformidade item a
 *     item (norma + item + correção), verificações e o MEMORIAL (outra aba).
 * Cores: tokens do css/app.css (tema claro e escuro).
 * ===================================================================== */
(function (global) {
  "use strict";

  function MP() { return global.MetalProntas || null; }
  function PU() { return global.MetalProntasUI || null; }
  function MA() { return global.MetalAcessos || null; }
  function AC() { return global.AcoAcessos || null; }
  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function br(v, c) { c = c == null ? 2 : c; return (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, k, ms) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info", ms || 6000); } catch (e) {} }

  /* a escada industrial da fita Acessos: a escada das peças prontas com a norma NR-12 e o que ela pede */
  var ESCADA_NR12 = { norma: "nr12", forma: "patamares", desnivel: 3.0, largura: 0.8, degrau: "grade", gradeH: 0.030, gradeT: 0.005, gradeA: 0.030, rodape: true, hRodape: 0.20,
    guarda: "dois", montante: "HSS73X5.2", corrimao: "HSS48.3X3.7", espac: 1.0, usoGuarda: "industrial", usoPiso: "escada-sem-publico", longarina: "C200X17.1" };
  var PRESETS = {
    nr12: ESCADA_NR12,
    "nr12-ingreme": { norma: "nr12-ingreme", forma: "patamares", desnivel: 2.5, largura: 0.6, degrau: "grade", gradeH: 0.030, gradeT: 0.005, rodape: true, montante: "HSS73X5.2", usoGuarda: "industrial", longarina: "C150X12.2" },
    nbr9050: { norma: "nbr9050", forma: "patamares", desnivel: 3.0, largura: 1.2, degrau: "xadrez", tDegrau: 0.0095, espelho: true, rodape: false, guarda: "dois", montante: "HSS73X5.2", corrimao: "HSS42.2X3.6", usoGuarda: "industrial", usoPiso: "escada-publico", longarina: "C250X22.8" },
    emergencia: { norma: "emergencia", forma: "U", desnivel: 3.0, largura: 1.2, degrau: "xadrez", tDegrau: 0.0095, espelho: true, rodape: false, guarda: "dois", montante: "HSS73X5.2", corrimao: "HSS48.3X3.7", usoGuarda: "industrial", usoPiso: "escada-publico", longarina: "C250X22.8" }
  };

  /* ------------------------------------------------------------ fita: grupo Acessos */
  var COMANDOS = [
    { id: "met-ac-escolher", rotulo: "Escolher o\nacesso", icone: "alvo", grande: true, dica: "Desnível, espaço em planta e o uso → o meio de acesso pela norma (rampa, escada, escada de degraus, marinheiro; rota acessível; saída de emergência), com o motivo e o item — e o botão que abre o diálogo dele." },
    { id: "met-ac-escada", tipo: "escada", rotulo: "Escada\nindustrial", icone: "niveis", grande: true, dica: "Escada pela norma escolhida (NR-12 industrial, NBR 9050 acessível, saída de emergência): degrau calculado, patamares de descanso, guarda-corpo com intermediária e rodapé; conformidade e cálculo da longarina, do degrau e do montante ao vivo." },
    { id: "met-ac-marinheiro", tipo: "marinheiro", rotulo: "Escada de\nmarinheiro", icone: "regua", grande: true, dica: "Escada fixa tipo marinheiro (NR-12, 13): gaiola acima de 3,50 m, lances de até 6 m com plataforma de descanso acima de 10 m, montantes passando 1,10 m no topo e cancela de autofechamento. Clique no pé da escada." },
    { id: "met-ac-helicoidal", tipo: "helicoidal", rotulo: "Escada no\ntanque", icone: "ciclo", grande: true, dica: "Escada helicoidal enrolada no costado do tanque: degrau pela NR-12 na linha de percurso, patamar de descanso a cada 3,00 m, consoles radiais e guarda-corpo do lado de fora. Clique o centro do tanque." },
    { id: "met-ac-rampa", tipo: "rampa", rotulo: "Rampa", icone: "desLinha", grande: true, dica: "Rampa de aço pela NR-12 (até 20°, peças transversais acima de 10°) ou pela NBR 9050 (até 8,33 %, patamar entre segmentos, corrimão duplo com prolongamento). Clique o pé da rampa." },
    { id: "met-ac-plataforma", tipo: "plataforma", rotulo: "Plataforma\nde manutenção", icone: "laje", grande: true, dica: "Plataforma retangular por dois cantos: pilares, vigas, piso em grade, guarda-corpo NR-12 (1,10 m, intermediária a 0,70 m, rodapé 0,20 m) e a abertura de acesso com cancela." },
    { id: "met-ac-anelar", tipo: "anelar", rotulo: "Plataforma\nanelar", icone: "desCirculo", grande: true, dica: "Plataforma em volta de tanque ou equipamento cilíndrico: consoles radiais no costado com mão-francesa, viga de borda, piso em setores de grade e guarda-corpo. Clique o centro do tanque." },
    { id: "met-ac-passarela", tipo: "passarela", rotulo: "Passarela", icone: "desLinha", grande: true, dica: "Passarela reta por dois cliques (começo e fim), apoiada nas pontas ou em pilares, piso em grade e guarda-corpo NR-12 dos dois lados." },
    { id: "met-ac-guarda", tipo: "guardacorpo", rotulo: "Guarda-\ncorpo", icone: "grade", grande: true, dica: "Guarda-corpo avulso por dois cliques: montantes, corrimão sem superfície plana, intermediária e rodapé; a força horizontal da NBR 6120 verificada no montante e na solda da base." },
    { id: "met-ac-corrimao", tipo: "corrimaoparede", rotulo: "Corrimão\nde parede", icone: "regua", grande: true, dica: "Corrimão preso na parede: duas alturas (0,92 e 0,70 m), Ø 30–45 mm, 4 cm da parede, prolongamento de 0,30 m com as pontas recurvadas e suportes verificados com 900 N. Clique o começo e o fim na face da parede." },
    { id: "met-ac-piso", tipo: "piso", rotulo: "Piso\nindustrial", icone: "camadas", grande: true, dica: "Painéis de grade eletrofundida, chapa xadrez, expandida ou perfurada por dois cantos, com o peso do tipo e a verificação do vão." },
    { id: "met-ac-verificar", rotulo: "Verificar\nacesso", icone: "livro", grande: true, dica: "Selecione uma peça de um acesso (escada, marinheiro, plataforma, anelar, passarela, guarda-corpo, piso): a conformidade item a item com a norma e a correção, as verificações e o memorial." }
  ];
  var CMD_DE = {}; COMANDOS.forEach(function (c) { if (c.tipo) CMD_DE[c.tipo] = c.id; });

  /* ------------------------------------------------------------ campos dos tipos novos */
  function camposDe() {
    var U = PU(), UG = U ? U.USO_GUARDA : [], UP = U ? U.USO_PISO : [];
    var piso = [["piso", "Piso", "sel", [["grade", "Grade eletrofundida"], ["xadrez", "Chapa xadrez"]]], ["gradeH", "Grade: altura da barra portante (m)", "num"], ["gradeT", "Grade: espessura da barra (m)", "num"], ["gradeA", "Grade: passo das barras (m)", "num"], ["tPiso", "Chapa xadrez: espessura (mm)", "mm"]];
    var guarda = [["montante", "Montante do guarda-corpo", "cat", ["HSSC", "HSSR"]], ["corrimao", "Corrimão (travessão superior)", "cat", ["HSSC", "HSSR"]], ["espac", "Montantes a cada (m)", "num"], ["intermediaria", "Travessa intermediária (m do piso)", "num"], ["rodape", "Rodapé", "check"], ["hRodape", "Altura do rodapé (m)", "num"], ["usoGuarda", "Força no guarda-corpo (NBR 6120)", "sel", UG]];
    return {
      marinheiro: [["altura", "Altura a vencer (m)", "num"], ["largura", "Largura entre montantes (m)", "num"], ["espac", "Degraus a cada (m, máx.)", "num"], ["afast", "Afastamento da parede (m)", "num"],
        ["diamDegrau", "Degrau: diâmetro/lado (m)", "num"], ["secaoDegrau", "Seção do degrau", "sel", [["redonda", "Barra redonda serrilhada"], ["quadrada", "Barra quadrada"]]], ["antiderrapante", "Degrau antiderrapante (serrilhado/ranhura)", "check"],
        ["gaiola", "Gaiola", "sel", [["auto", "Automática (acima de 3,50 m)"], ["sim", "Sempre"], ["nao", "Sem gaiola"]]], ["gaiolaDiam", "Diâmetro da gaiola (m)", "num"], ["gaiolaInicio", "Gaiola a partir de (m do piso)", "num"], ["arcosEsp", "Arcos a cada (m)", "num"], ["gaiolaVert", "Barras verticais a cada (m, no arco)", "num"],
        ["ultrapassa", "Montantes e gaiola passam do topo (m)", "num"], ["lanceMax", "Altura máx. por lance acima de 10 m (m)", "num"], ["deslocLances", "Deslocamento entre lances (m)", "num"], ["cancela", "Cancela de autofechamento no topo", "check"],
        ["saida", "Saída no topo", "sel", [["frente", "Pela frente (piso de cima atrás da parede)"], ["esquerda", "Pela esquerda (plataforma de desembarque)"], ["direita", "Pela direita (plataforma de desembarque)"]]], ["desembarqueLarg", "Largura da plataforma de desembarque (m)", "num"],
        ["outrosImpossiveis", "Rampa/escada/plataforma tecnicamente impossíveis aqui (NR-12 1.3; NR-35 Anexo III 4.1.2.1)", "check"],
        ["spqDefinido", "SPQ definido pelo item 35.6 com análise de risco (NR-35 Anexo III 5.2.1.1 f)", "check"], ["projetoHabilitado", "Projeto por profissional legalmente habilitado (NR-35 Anexo III 5.2.1.1 g)", "check"]],
      plataforma: [["Lx", "Comprimento em X (m) — ou 2 cliques", "num"], ["Lz", "Largura em Z (m) — ou 2 cliques", "num"], ["altura", "Cota do piso — topo do aço (m)", "num"], ["vaosX", "Vãos em X", "int"], ["vaosZ", "Vãos em Z", "int"], ["espSec", "Secundárias a cada (m)", "num"],
        ["principal", "Vigas principais", "cat", ["W", "GERDAU"]], ["secundaria", "Vigas secundárias", "cat", ["W", "GERDAU", "C"]], ["pilar", "Pilares", "cat", ["W", "GERDAU", "HSSR"]]].concat(piso).concat(guarda).concat([
        ["frente", "Guarda-corpo na frente (Z mín.)", "check"], ["fundo", "Guarda-corpo no fundo (Z máx.)", "check"], ["esquerda", "Guarda-corpo à esquerda (X mín.)", "check"], ["direita", "Guarda-corpo à direita (X máx.)", "check"],
        ["contraventoPlano", "Contraventamento no plano do piso (vários vãos)", "check"],
        ["abertura", "Abertura de acesso", "sel", [["frente", "Na frente"], ["fundo", "No fundo"], ["esquerda", "À esquerda"], ["direita", "À direita"], ["", "Sem abertura"]]], ["aberturaLarg", "Largura da abertura (m)", "num"], ["aberturaPos", "Posição da abertura (0 a 1 no lado)", "num"], ["cancela", "Cancela na abertura", "check"],
        ["abastecimento", "Plataforma de abastecimento/sujidade (guarda 1,00–1,10 m)", "check"], ["usoPiso", "Sobrecarga (NBR 6120)", "sel", UP], ["qInformado", "Sobrecarga do projeto (kN/m², se maior)", "num"], ["contraventar", "Contraventamento em X", "check"], ["placaBase", "Placa de base", "check"]]),
      anelar: [["raioTanque", "Raio EXTERNO do costado (m)", "num"], ["altura", "Cota do piso (m acima da base)", "num"], ["largura", "Largura útil (m)", "num"], ["angIni", "Ângulo inicial (°)", "num"], ["abertura", "Ângulo da plataforma (°; 360 = volta inteira)", "num"],
        ["folga", "Folga entre costado e piso (m)", "num"], ["espConsoles", "Consoles a cada (m, na borda de fora)", "num"], ["console", "Console", "cat", ["C", "GERDAU-U", "W"]], ["vigaBorda", "Viga de borda", "cat", ["C", "GERDAU-U", "L"]],
        ["maoFrancesa", "Mão-francesa nos consoles", "check"], ["diagonal", "Perfil da mão-francesa", "cat", ["L"]], ["acessoPonta", "Ponta aberta para o acesso", "sel", [["inicio", "No ângulo inicial"], ["fim", "No ângulo final"], ["nenhuma", "Nenhuma (fechar as duas)"]]]].concat(piso).concat(guarda).concat([["usoPiso", "Sobrecarga (NBR 6120)", "sel", UP]]),
      passarela: [["comprimento", "Comprimento (m) — ou 2 cliques", "num"], ["largura", "Largura útil (m)", "num"], ["altura", "Cota do piso (m)", "num"], ["apoio", "Apoio", "sel", [["pontas", "Nas pontas (estrutura existente)"], ["pilares", "Em pilares"]]], ["vaos", "Vãos (pilares)", "int"],
        ["viga", "Vigas longitudinais", "cat", ["W", "GERDAU", "C", "GERDAU-U"]], ["travessa", "Travessas", "cat", ["W", "GERDAU", "C", "L"]], ["pilar", "Pilares", "cat", ["W", "GERDAU", "HSSR"]], ["espSec", "Travessas a cada (m)", "num"],
        ["contraventar", "Contraventamento em X (com pilares)", "check"], ["contravento", "Perfil do contraventamento", "cat", ["L"]]].concat(piso).concat(guarda).concat([["usoPiso", "Sobrecarga (NBR 6120)", "sel", UP]]),
      corrimaoparede: [["comprimento", "Comprimento (m) — ou 2 cliques", "num"], ["lado", "Lado do corrimão (olhando do começo para o fim)", "sel", [["esquerda", "À esquerda da parede"], ["direita", "À direita da parede"]]], ["norma", "Norma", "sel", [["nbr9050", "NBR 9050 (rota acessível)"], ["emergencia", "Saída de emergência (IT)"]]],
        ["duplo", "Duas alturas (0,92 e 0,70 m)", "check"], ["alturaSup", "Altura de cima (m)", "num"], ["alturaInf", "Altura de baixo (m)", "num"], ["folga", "Folga até a parede (m)", "num"], ["prolongamento", "Prolongamento nas pontas (m)", "num"],
        ["corrimao", "Tubo do corrimão", "cat", ["HSSC"]], ["espSuportes", "Suportes a cada (m)", "num"], ["suporteD", "Suporte: barra redonda Ø (m)", "num"]],
      guardacorpo: [["caminho", "Caminho livre — x z; x z… (m, relativo; os cliques preenchem)", "txt"], ["comprimento", "Comprimento (m) — sem caminho", "num"], ["retornoIni", "Retorno no começo (m; encontro em L)", "num"], ["retornoFim", "Retorno no fim (m)", "num"], ["ladoRetorno", "Lado dos retornos", "sel", [["esquerda", "À esquerda (do começo para o fim)"], ["direita", "À direita"]]],
        ["travessasExtra", "Travessas a mais entre o rodapé e a intermediária", "int"], ["fixacao", "Fixação do montante", "sel", [["solda", "Soldado na estrutura"], ["chapa", "Chapa de base chumbada (laje)"]]], ["alturaGuarda", "Altura do travessão superior (m)", "num"], ["norma", "Norma", "sel", [["nr12", "NR-12 (industrial)"], ["nbr9050", "NBR 9050 / NBR 14718 (edificação)"]]], ["perna", "Solda da base: perna do filete (mm)", "num"], ["abastecimento", "Plataforma de abastecimento (1,00–1,10 m)", "check"]].concat(guarda),
      rampa: [["norma", "Norma", "sel", [["nr12", "Industrial — NR-12 (até 20°)"], ["nbr9050", "Rota acessível — NBR 9050 (até 8,33 %)"]]], ["desnivel", "Desnível (m)", "num"], ["inclinacao", "Inclinação (%)", "num"], ["largura", "Largura útil (m)", "num"],
        ["segMax", "Desnível máx. por segmento (m; 0 = o da norma)", "num"], ["patamarComp", "Comprimento do patamar (m)", "num"], ["vaoMax", "Apoios (pilaretes) a cada (m)", "num"], ["espTravessas", "Travessas sob o piso a cada (m)", "num"],
        ["longarina", "Longarinas", "cat", ["C", "GERDAU-U"]], ["travessa", "Travessas", "cat", ["C", "L", "GERDAU-U"]], ["pilarete", "Pilaretes", "cat", ["HSSR", "HSSC", "W"]],
        ["piso", "Piso", "sel", [["xadrez", "Chapa xadrez"], ["grade", "Grade"]]], ["tPiso", "Chapa xadrez: espessura (mm)", "mm"], ["pecasTransversais", "Peças transversais acima de 10° (NR-12, 6)", "check"], ["espPecas", "Peças transversais a cada (m)", "num"],
        ["guarda", "Guarda-corpo", "sel", [["dois", "Nos dois lados"], ["um", "Só de um lado"], ["nenhum", "Nenhum"]]]].concat(guarda).concat([["usoPiso", "Sobrecarga (NBR 6120)", "sel", UP]]),
      helicoidal: [["raioTanque", "Raio EXTERNO do costado (m)", "num"], ["altura", "Altura a vencer (m)", "num"], ["largura", "Largura útil (m)", "num"], ["folga", "Folga entre costado e escada (m)", "num"], ["angIni", "Ângulo do pé da escada (°)", "num"],
        ["sentido", "Sobe girando", "sel", [["anti-horario", "Anti-horário"], ["horario", "Horário"]]], ["norma", "Norma do degrau", "sel", [["nr12", "Industrial — NR-12 (20° a 45°)"], ["nr12-ingreme", "NR-12 íngreme (45° a 75°)"], ["emergencia", "Saída de emergência (IT)"]]],
        ["lanceMax", "Altura máx. por lance (m; 0 = a da norma)", "num"], ["patamarComp", "Comprimento do patamar (m, na linha de percurso)", "num"], ["longarina", "Longarinas", "cat", ["C", "GERDAU-U"]], ["console", "Consoles", "cat", ["C", "GERDAU-U", "W"]], ["espConsoles", "Consoles a cada (m)", "num"],
        ["degrau", "Degrau", "sel", [["grade", "Grade"], ["xadrez", "Chapa xadrez"]]], ["gradeH", "Grade: altura da barra (m)", "num"], ["gradeT", "Grade: espessura da barra (m)", "num"]].concat(guarda).concat([["usoPiso", "Sobrecarga (NBR 6120)", "sel", UP]]),
      piso: [["Lx", "Comprimento em X (m) — ou 2 cliques", "num"], ["Lz", "Largura em Z (m) — ou 2 cliques", "num"], ["material", "Tipo", "sel", [["grade", "Grade eletrofundida"], ["xadrez", "Chapa xadrez"], ["expandida", "Chapa expandida"], ["perfurada", "Chapa perfurada"], ["lisa", "Chapa lisa"]]],
        ["t", "Chapa: espessura (m)", "num"], ["gradeH", "Grade: altura da barra portante (m)", "num"], ["gradeT", "Grade: espessura da barra (m)", "num"], ["gradeA", "Grade: passo das barras (m)", "num"], ["gradeB", "Grade: passo das travessas (m)", "num"],
        ["losangoMenor", "Expandida: losango menor (m)", "num"], ["cordao", "Expandida: cordão (m)", "num"], ["furoD", "Perfurada: furo Ø (m)", "num"], ["furoPasso", "Perfurada: passo (m)", "num"], ["painelMax", "Largura máx. do painel (m)", "num"], ["vao", "Vão entre apoios — verificação (m)", "num"], ["usoPiso", "Sobrecarga (NBR 6120)", "sel", UP], ["qInformado", "Sobrecarga do projeto (kN/m², se maior)", "num"]]
    };
  }

  function css() {
    if (typeof document === "undefined" || document.getElementById("mac-css")) return;
    var s = document.createElement("style"); s.id = "mac-css";
    s.textContent = ".mac-form{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px 12px}.mac-form label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--texto)}.mac-form label.ck{flex-direction:row;align-items:center;gap:6px}" +
      ".mac-rk{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}.mac-rk li{border:1px solid var(--linha);border-radius:8px;padding:8px 10px;background:var(--surface);font-size:12px;color:var(--texto)}.mac-rk li.top{border-color:var(--verde)}.mac-rk li.nao{opacity:.65}" +
      ".mac-rk button{margin-top:6px;min-height:30px}.mac-t{width:100%;border-collapse:collapse;font-size:11.5px;color:var(--texto)}.mac-t th,.mac-t td{border-bottom:1px solid var(--linha);padding:4px 6px;text-align:left;vertical-align:top}" +
      ".mac-t tr.falha td{color:var(--vermelho)}.mac-t tr.rec td{color:var(--amarelo)}.mac-ok{color:var(--verde);font-weight:600}.mac-falha{color:var(--vermelho);font-weight:600}.mac-scroll{max-height:56vh;overflow:auto}.mac-av{font-size:11px;color:var(--texto-fraco)}";
    document.head.appendChild(s);
  }

  var MetalAcessosUI = {
    COMANDOS: COMANDOS, PRESETS: PRESETS, ultimaVerificacao: null, ultimaEscolha: null,
    ids: function () { return COMANDOS.map(function (c) { return c.id; }); },
    pronto: function () { return !!(MP() && PU() && MA() && AC() && MA().registrado()); },
    registrar: function (reg) {
      if (!previa() || !this.pronto()) return false;
      var self = this, C = camposDe();
      Object.keys(C).forEach(function (t) { PU().registrarCampos(t, C[t]); });
      COMANDOS.forEach(function (c) {
        reg[c.id] = function () {
          try {
            if (c.id === "met-ac-escolher") self.escolher();
            else if (c.id === "met-ac-verificar") self.verificar();
            else if (c.tipo === "escada") self.escada();
            else PU().comando(c.tipo);
          } catch (e) { toast("Acessos: " + (e && e.message ? e.message : e), "erro", 8000); }
          return true;
        };
      });
      try {
        var D = global.DicaRica;
        if (D && D.item && D.registrar) MA().ORDEM.forEach(function (t) { var d = MP().dica(t); if (d) { D.item("acesso-" + t, d); D.registrar(CMD_DE[t], "acesso-" + t); } });
        if (D && D.item && D.registrar) { var de = MP().dica("escada"); if (de) { de = JSON.parse(JSON.stringify(de)); de.titulo = "Escada industrial"; de.dica = "Escolha a norma: NR-12 (20° a 45°: espelho 20–25 cm, piso ≥ 20 cm, descanso a cada 3,00 m), NBR 9050 (16–18 cm × 28–32 cm, patamar a cada 3,20 m, corrimão duplo) ou saída de emergência (IT do Corpo de Bombeiros)."; D.item("acesso-escada", de); D.registrar("met-ac-escada", "acesso-escada"); } }
      } catch (eD) {}
      return true;
    },
    /* a escada da fita Acessos: com uma escada selecionada, edita; senão abre com a norma NR-12 */
    escada: function (norma) {
      var U = PU(), alvo = U.prontaSelecionada();
      if (alvo && alvo.tipo === "escada" && alvo.info && alvo.info.par) return U.dialogo("escada", { alvo: alvo });
      return U.dialogo("escada", { par: PRESETS[norma || "nr12"] || ESCADA_NR12 });
    },

    /* ------------------------------------------------------------ ESCOLHER O ACESSO */
    escolher: function () {
      if (!global.UI) return false;
      css();
      var self = this, e0 = this._escolha || { desnivel: 3, espacoPlanta: 5, frequencia: "habitual", rotaAcessivel: false, material: false };
      var h = '<div data-mac="escolher"><div class="mac-form">' +
        '<label><span>Desnível a vencer (m)</span><input data-mac-c="desnivel" inputmode="decimal" value="' + esc(br(e0.desnivel)) + '"></label>' +
        '<label><span>Espaço em planta na direção do acesso (m; 0 = sem limite)</span><input data-mac-c="espacoPlanta" inputmode="decimal" value="' + esc(br(e0.espacoPlanta)) + '"></label>' +
        '<label><span>Uso</span><select data-mac-c="frequencia"><option value="habitual"' + (e0.frequencia === "habitual" ? " selected" : "") + '>Habitual (operação, todo dia)</option><option value="eventual"' + (e0.frequencia === "eventual" ? " selected" : "") + '>Eventual (manutenção)</option><option value="emergencia"' + (e0.frequencia === "emergencia" ? " selected" : "") + ">Saída de emergência</option></select></label>" +
        '<label class="ck"><input type="checkbox" data-mac-c="rotaAcessivel"' + (e0.rotaAcessivel ? " checked" : "") + "><span>Rota acessível (NBR 9050)</span></label>" +
        '<label class="ck"><input type="checkbox" data-mac-c="material"' + (e0.material ? " checked" : "") + "><span>Carrega material ou ferramenta</span></label></div>" +
        '<div data-mac="escolha-res"></div></div>';
      UI.modal("Escolher o meio de acesso", h, [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
      var raiz = document.querySelector('[data-mac="escolher"]');
      var ler = function () { var o = {}; ["desnivel", "espacoPlanta", "frequencia", "rotaAcessivel", "material"].forEach(function (k) { var el = raiz.querySelector('[data-mac-c="' + k + '"]'); if (!el) return; o[k] = el.type === "checkbox" ? !!el.checked : (k === "frequencia" ? el.value : num(el.value, 0)); }); return o; };
      var mostrar = function () {
        var e = ler(); self._escolha = e;
        var r = AC().escolher(e); self.ultimaEscolha = r;
        var alvo = raiz.querySelector('[data-mac="escolha-res"]'); if (!alvo) return;
        if (!r.ok) { alvo.innerHTML = '<p class="mac-falha">' + esc(r.motivo) + "</p>"; return; }
        var lista = r.ranking.length ? r.ranking : [{ tipo: r.tipo, perfil: r.perfil, angulo: r.angulo, cabe: true, motivo: r.motivo, ref: "" }];
        alvo.innerHTML = '<ul class="mac-rk">' + lista.map(function (x, i) {
          return '<li class="' + (i === 0 ? "top" : "") + (x.cabe === false ? " nao" : "") + '" data-mac-tipo="' + esc(x.tipo) + '"><b>' + (i === 0 ? "Recomendado: " : "") + esc(nomeTipo(x.tipo, x.perfil)) + "</b>" + (x.angulo != null ? " — " + br(x.angulo, 1) + "°" : "") + (x.projecao != null ? ", projeção ≈ " + br(x.projecao, 2) + " m" : "") + (x.semDegrau ? " (sem degrau uniforme pela NR-12 para esse desnível)" : (x.cabe === false ? " (não cabe)" : "")) +
            '<br><span class="mac-av">' + esc(x.motivo) + (x.ref ? " — " + esc(x.ref) : "") + "</span>" + ("<br><button class=\"secondary\" data-mac-criar=\"" + i + '">Abrir o diálogo deste acesso</button>') + "</li>";
        }).join("") + "</ul>" + (r.avisos.length ? '<ul class="mac-av">' + r.avisos.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>" : "");
        [].slice.call(alvo.querySelectorAll("[data-mac-criar]")).forEach(function (b) { b.addEventListener("click", function () { var x = lista[+b.getAttribute("data-mac-criar")]; UI.fecharModal(); self.abrirTipo(x, e); }); });
      };
      raiz.addEventListener("input", mostrar); raiz.addEventListener("change", mostrar); mostrar();
      return true;
    },
    abrirTipo: function (x, e) {
      var U = PU();
      if (x.tipo === "marinheiro") return U.dialogo("marinheiro", { par: { altura: e.desnivel } });
      if (x.tipo === "escada" || x.tipo === "escada-ingreme") { var b = JSON.parse(JSON.stringify(PRESETS[x.perfil] || ESCADA_NR12)); b.desnivel = e.desnivel; return U.dialogo("escada", { par: b }); }
      if (x.tipo === "rampa") return U.dialogo("rampa", { par: x.perfil === "nbr9050" ? { norma: "nbr9050", desnivel: e.desnivel, inclinacao: 8.33, largura: 1.2, guarda: "dois", corrimao: "HSS42.2X3.6", rodape: true, hRodape: 0.05, usoGuarda: "industrial", usoPiso: "escada-publico" } : { norma: "nr12", desnivel: e.desnivel, inclinacao: Math.max(1, Math.min(36, Math.round(Math.tan((x.angulo || 10) * Math.PI / 180) * 10000) / 100)) } });
      return false;
    },

    /* ------------------------------------------------------------ VERIFICAR ACESSO */
    acessoSelecionado: function () {
      var U = PU(), alvo = U ? U.prontaSelecionada() : null;
      if (!alvo || !alvo.info || !alvo.info.par) return null;
      var tipos = ["escada"].concat(MA().ORDEM);   /* inclui a helicoidal */
      return tipos.indexOf(alvo.tipo) >= 0 ? alvo : null;
    },
    /* o resultado da peça pronta do modelo refeito com o par dela (ids de prévia: nada muda no modelo) */
    refazer: function (alvo) {
      var M = MP(), k = 0, p = M.parParaRefazer(alvo);
      if (alvo.tipo === "escada" && !p.norma) p.norma = "nr12";   /* escada antiga sem norma: confere pela NR-12 (e diz isso) */
      return M.gerar(alvo.tipo, p, function () { return "va" + (++k); }, {});
    },
    verificar: function () {
      var alvo = this.acessoSelecionado();
      if (!alvo) { var t = "Verificar acesso: selecione uma peça de uma escada, escada de marinheiro, plataforma, plataforma anelar, passarela, guarda-corpo ou piso criados pelas Peças prontas/Acessos."; status(t); toast(t, "aviso", 8000); return false; }
      var r = this.refazer(alvo); if (!r.ok) { toast("Verificar acesso: " + r.motivo, "erro", 8000); return false; }
      var av = MA().avaliar(r) || {}, v = av.conformidade, dm = av.dimensionamento, T = MP().TIPOS[alvo.tipo] || {};
      this.ultimaVerificacao = { tipo: alvo.tipo, prontaId: alvo.id, aprovado: v ? v.aprovado : null, naoConformes: v ? v.naoConformes.map(function (i) { return i.id; }) : [], dimAprovado: dm ? dm.aprovado : null, resumo: v ? v.resumo : null, dimResumo: dm ? dm.resumo : null };
      if (!global.UI) return this.ultimaVerificacao;
      css();
      var semNorma = alvo.tipo === "escada" && !(alvo.info.par && alvo.info.par.norma);
      var h = '<div data-mac="verificar" class="mac-scroll">' + (semNorma ? '<p class="mac-av">Esta escada foi criada sem norma de acesso: conferida pela NR-12 (industrial). Edite e escolha a norma para refazer o degrau por ela.</p>' : "") + "<p>" + esc(r.resumo) + "</p>";
      if (v && v.ok) {
        h += '<h4 class="' + (v.aprovado ? "mac-ok" : "mac-falha") + '" data-mac="conf-res">Norma: ' + esc(v.resumo) + "</h4>" + v.avisos.map(function (a) { return '<p class="mac-av">' + esc(a) + "</p>"; }).join("");
        h += '<table class="mac-t"><thead><tr><th>Requisito</th><th>Norma / item</th><th>Limite</th><th>Projeto</th><th>Situação / correção</th></tr></thead><tbody>' + v.itens.map(function (i) {
          return '<tr class="' + (i.ok === false ? (i.sev === "nc" ? "falha" : "rec") : "") + '" data-mac-req="' + esc(i.id) + '"><td>' + esc(i.requisito) + "</td><td>" + esc(i.norma) + (i.conferir ? " <i>[conferir]</i>" : "") + "</td><td>" + esc(i.limite) + "</td><td>" + esc(i.valorTexto) + "</td><td>" + esc(i.situacao) + (i.correcao ? " — " + esc(i.correcao) : "") + "</td></tr>";
        }).join("") + "</tbody></table>";
      } else h += '<p class="mac-av">Sem regra de norma para este tipo (piso avulso): só o cálculo.</p>';
      if (dm && dm.ok) {
        h += '<h4 class="' + (dm.aprovado ? "mac-ok" : "mac-falha") + '" data-mac="dim-res">Cálculo: ' + esc(dm.resumo) + "</h4>";
        h += '<table class="mac-t"><thead><tr><th>Verificação</th><th>Norma</th><th>Aproveitamento</th></tr></thead><tbody>' + dm.verificacoes.filter(function (x) { return !x.info; }).map(function (x) {
          return '<tr class="' + (x.ok === false ? "falha" : "") + '"><td>' + esc(x.nome) + "</td><td>" + esc(x.item) + "</td><td>" + br(num(x.razao, 0) * 100, 0) + " %" + (x.ok === false ? " — não passa" : "") + "</td></tr>";
        }).join("") + "</tbody></table>";
        if (dm.naoVerificados.length) h += '<ul class="mac-av" data-mac="nao-verificados">' + dm.naoVerificados.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>";
      }
      var ec = MA().escopo(alvo.tipo);
      if (ec) h += '<p class="mac-av" data-mac="escopo"><b>Escopo.</b> Verifica: ' + esc(ec.verifica.join("; ")) + ". <b>Não verifica:</b> " + esc(ec.naoVerifica.join("; ")) + ".</p>";
      h += "</div>";
      var self = this;
      var bts = [{ texto: "Memorial", classe: "primary", onClick: function () { self.memorial(r); } }];
      if (alvo.tipo === "plataforma" || alvo.tipo === "passarela") bts.push({ texto: "Calcular a estrutura", onClick: function () { UI.fecharModal(); self.calcularEstrutura(alvo); } });
      UI.modal("Verificar acesso — " + (T.rotulo || alvo.tipo), h, bts.concat([
        { texto: "Editar", onClick: function () { UI.fecharModal(); PU().dialogo(alvo.tipo, { alvo: alvo }); } },
        { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]));
      status("Verificar acesso: " + (v ? v.resumo : "") + (dm ? " · " + dm.resumo : ""));
      return this.ultimaVerificacao;
    },
    /* CALCULAR A ESTRUTURA: a plataforma/passarela selecionada vai para o Cálculo › Estrutura desenhada (o mesmo motor
       do js/acodimlivre.js): seleciona as peças dela, preenche a área de piso, as bases e as ligações e calcula. */
    calcularEstrutura: function (alvo) {
      alvo = alvo || this.acessoSelecionado();
      var L = global.MetalCalcLivreUI, B = global.BIM;
      if (!L || !global.AcoDimLivre) { toast("O cálculo da estrutura desenhada não carregou (js/metalcalclivreui.js / js/acodimlivre.js).", "erro", 8000); return false; }
      var ent = alvo ? MA().entradaCalculo(PU().caixas(), alvo) : { ok: false, motivo: "Selecione uma peça da plataforma ou da passarela." };
      if (!ent.ok) { status("Calcular a estrutura: " + ent.motivo); toast(ent.motivo, "aviso", 8000); return false; }
      try { if (B && B.precisao) B.precisao().selecionar(ent.entrada.ids); } catch (e) {}
      var e = L.estado(); e.soSelecao = true; e.areas = [ent.area]; e.pontuais = ent.pontuais || []; e.apoios = ent.entrada.apoios; e.ligacoes = ent.entrada.ligacoes; e.vento = e.vento || {}; e.vento.ativo = false; e.otimizar = false;
      this.ultimoCalculo = { prontaId: alvo.id, tipo: alvo.tipo, barras: ent.barras, area: ent.area.id, rigida: !!ent.rigida, premissa: ent.premissa };
      var antes = L.resultado();
      L.abrir(3); L.calcular();
      if (ent.rigida) {
        /* o AVISO vai para o resultado e para o memorial da Estrutura desenhada (decisões e avisos do r) */
        toast(ent.aviso, "aviso", 14000);
        var tent = 0, marcar = function () { var r = L.resultado(); if (r && r !== antes && L.tela() === "resultado") { r.avisos = (r.avisos || []).concat([ent.aviso]); r.decisoes = (r.decisoes || []).concat([{ tema: "Ligações (premissa da plataforma)", decisao: ent.premissa, motivo: ent.aviso }]); return; } if (++tent < 100) setTimeout(marcar, 100); };
        setTimeout(marcar, 100);
      }
      status("Calcular a estrutura: " + ent.barras + " barras da " + alvo.tipo + " no Cálculo › Estrutura desenhada (área de piso " + ent.area.uso + "; " + (ent.pontuais || []).length + " forças de guarda-corpo de " + String(ent.forcaGuarda).replace(".", ",") + " kN/m).");
      this.ultimoCalculo.forcas = (ent.pontuais || []).length;
      return true;
    },
    memorial: function (r) {
      var o = {}; try { var G = global.Gestao, ob = G && G._bimObra ? G._bimObra() : null; if (ob) o.obra = ob.nome; } catch (e) {}
      var x = MA().memorial(r, o); this.ultimoMemorial = x && x.ok ? { titulo: x.titulo, secoes: x.secoes.length, bytes: x.html.length } : null;
      if (!x || !x.ok) { toast("Memorial: " + ((x && x.motivo) || "falhou"), "erro"); return null; }
      var w = null; try { w = global.open("", "_blank"); } catch (e) { w = null; }
      if (w && w.document) { w.document.open(); w.document.write(x.html); w.document.close(); toast("Memorial aberto em outra aba: imprima ou salve em PDF (Ctrl+P).", "ok", 7000); }
      else { var U = global.BimMetalUI; if (U && U.baixar) U.baixar("memorial-acesso.html", x.html, "text/html"); toast("Memorial baixado (.html).", "ok", 6000); }
      return x;
    }
  };
  function nomeTipo(t, perfil) {
    if (t === "rampa") return perfil === "nbr9050" ? "Rampa acessível (NBR 9050)" : "Rampa (NR-12)";
    if (t === "escada") return perfil === "nbr9050" ? "Escada NBR 9050 + equipamento eletromecânico" : (perfil === "emergencia" ? "Escada de emergência" : "Escada industrial (NR-12, 20° a 45°)");
    if (t === "escada-ingreme") return "Escada de degraus íngreme (NR-12, 45° a 75°)";
    if (t === "marinheiro") return "Escada de marinheiro (NR-12, 75° a 90°)";
    return t;
  }

  global.MetalAcessosUI = MetalAcessosUI;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalAcessosUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
