/* =====================================================================
 * metalprontasui.js — a TELA das PEÇAS PRONTAS da Metálica (aba Metálica &
 * Mecânica › grupo "Peças prontas"; só com a prévia do modelador). 13/10/2026.
 *
 * Quem calcula é o js/metalprontas.js (motor puro). Aqui:
 *   · os comandos da fita (treliça, escada, mezanino, viga de rolamento,
 *     rack, base de equipamento, editar) e as DICAS ILUSTRADAS deles;
 *   · o DIÁLOGO de cada tipo: poucos campos, a prévia ao vivo (planta e
 *     elevação, com o resumo e o peso) e os botões "Posicionar no modelo"
 *     (clique no 3D ou na planta) e "Criar nas coordenadas";
 *   · a ferramenta de POSICIONAR (sub do editor "met-pronta-colocar"): a
 *     peça inteira em arame segue o cursor, encaixa nos eixos e nas pontas,
 *     Espaço gira 90°, Esc cancela; o mezanino pede dois cantos; a viga de
 *     rolamento pede o lado da ponte;
 *   · EDITAR: com uma peça de uma peça pronta selecionada, o comando do tipo
 *     (ou "Editar peça pronta") abre o diálogo com os dados dela e refaz NO
 *     LUGAR — apagar + criar num lote só (um Ctrl+Z volta).
 * Ganchos no js/bim.js (S._metp): pointermove, clique (3D e planta, pela
 * editClique de sempre), Esc e troca de ferramenta.
 * Cores: tokens do css/app.css (tema claro e escuro). Não é cálculo
 * estrutural: o diálogo diz isso.
 * ===================================================================== */
(function (global) {
  "use strict";

  var SUB = "met-pronta-colocar";
  function MP() { return global.MetalProntas || null; }
  function B() { return global.BIM || null; }
  function PR() { return global.BimPrecisao || null; }
  function Pl() { return global.BimPlano || null; }
  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function br(v, c) { c = c == null ? 2 : c; return (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, k, ms) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info", ms || 6000); } catch (e) {} }
  function token(nome, reserva) { try { var v = global.getComputedStyle(global.document.documentElement).getPropertyValue(nome).trim(); if (v) return v; } catch (e) {} return reserva; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  var NAO_CALCULO = '<p class="muted mpr-nota" data-mpr="nao-calculo">Modelagem — <b>não é cálculo estrutural</b>. Os perfis vêm de <b>partida</b> (editáveis); quem garante é o projeto. O mezanino sai pronto para Cálculo › Estrutura desenhada.</p>';
  /* ACESSOS (js/metalacessos.js, 14/10/2026): o tipo que tem regras de norma e dimensionamento mostra a conformidade */
  var COM_CALCULO = '<p class="muted mpr-nota" data-mpr="com-calculo">Verificação de <b>norma</b> (NR-12, NBR 9050, NPT/IT de saída de emergência, NBR 14718, NBR 6120) e <b>dimensionamento simplificado</b> das peças principais (NBR 8800) — o que não foi verificado aparece. Memorial completo em <b>Acessos › Verificar acesso</b>.</p>';
  function modoDe(tipo) { var M = global.MetalProntas, T = M && M.TIPOS[tipo]; if (!T) return "ponto"; if (tipo === "mezanino") return "retangulo"; return T.modo || (T.cliques === 2 ? "retangulo" : "ponto"); }
  /* CONTORNO E ESCADA POR LINHA (frente S6, 14/10/2026): o modo da SESSÃO de posicionar manda (o diálogo pode oferecer mais de
     um: piso por retângulo ou por contorno, guarda-corpo por polilinha ou por retângulo); modos de fora (a escada puxada por
     linha, js/metalescadalinhaui.js) registram { ponto, previa, dica, enter, voltar, cancelar } */
  var MODOS = {};
  function modoPos(s) { return s ? (s.modo || modoDe(s.tipo)) : null; }
  var ROT_MODO = { retangulo: "Posicionar (2 cliques)", linha: "Posicionar (começo e fim)", polilinha: "Posicionar (cliques; Enter fecha)", contorno: "Contorno (cliques; Enter fecha)", ponto: "Posicionar no modelo" };
  /* a fixação "auto" da escada (e o resto que depende do modelo) resolvida antes de gerar */
  function resolver(tipo, par, fase) {
    try { var R = global.MetalEscadaLinhaUI; if (R && R.resolverPar) par = R.resolverPar(tipo, par, fase); } catch (e) {}
    /* M5 (14/10/2026, js/metalcomponenteui.js): a FIXAÇÃO AUTOMÁTICA POR MONTANTE do guarda-corpo (o apoio embaixo de cada um) — só ao criar */
    try { var C = global.MetalComponenteUI; if (C && C.resolverPar && fase === "criar") par = C.resolverPar(tipo, par, fase); } catch (e2) {}
    return par;
  }
  function temCalculo(tipo, par) { var M = global.MetalProntas, T = M && M.TIPOS[tipo]; return !!(global.AcoAcessos && global.MetalAcessos && T && (T.calcula || (tipo === "escada" && par && par.norma))); }
  var CAMPOS_EXTRA = {};
  var GRANDEZA = { qInformado: "superficie", usoGuarda: "linear", usoPiso: "superficie" };   /* campos em kN… com seletor de unidade e listas da norma com a equivalência em kgf (js/unidadesui.js); o valor guardado continua em kN */

  /* ------------------------------------------------------------ fita */
  var COMANDOS = [
    { id: "met-pronta-trelica", tipo: "trelica", rotulo: "Treliça\nplana", icone: "telhado", grande: true, dica: "Treliça Howe, Pratt ou Warren, banzos paralelos, trapezoidal ou triangular: vão, altura e painéis; cantoneira simples ou dupla, U ou tubo; nós com chapa gusset. Clique onde fica o apoio." },
    { id: "met-pronta-escada", tipo: "escada", rotulo: "Escada\nmetálica", icone: "niveis", grande: true, dica: "Escada reta, em L, em U ou caracol: longarinas, degraus em chapa xadrez ou grade, espelho, patamar, guarda-corpo e corrimão. Degrau por Blondel (2e + p de 63 a 64 cm). Clique no pé da escada." },
    { id: "met-pronta-mezanino", tipo: "mezanino", rotulo: "Mezanino /\nplataforma", icone: "laje", grande: true, dica: "Mezanino por dois cantos: vãos nas duas direções, vigas principais e secundárias, pilares com placa de base, piso (grade, chapa xadrez ou steel deck) e guarda-corpo nas bordas livres. Sai pronto para o cálculo da estrutura desenhada." },
    { id: "met-pronta-rolamento", tipo: "rolamento", rotulo: "Viga de\nrolamento", icone: "guindaste", grande: true, dica: "Selecione os pilares da fila: viga de rolamento, trilho e consoles soldados nos pilares; clique do lado da ponte. Só a geometria — o cálculo da ponte rolante não entra." },
    { id: "met-pronta-rack", tipo: "rack", rotulo: "Rack de\ntubulação", icone: "grade", grande: true, dica: "Pipe rack: pórticos repetidos com N níveis de travessa, longarinas e contraventamento longitudinal. Clique no 1º pilar." },
    { id: "met-pronta-skid", tipo: "skid", rotulo: "Base de\nequipamento", icone: "bloco", grande: true, dica: "Skid: quadro de perfis U, travessas debaixo das linhas de furos, chapa de piso e os pontos de fixação nas medidas do equipamento. Clique no canto." },
    { id: "met-pronta-editar", rotulo: "Editar peça\npronta", icone: "editar", grande: true, dica: "Selecione uma peça de uma peça pronta (treliça, escada, mezanino…): o diálogo abre com os dados dela e refaz no lugar, num Ctrl+Z só." }
  ];
  var CMD_DE = {}; COMANDOS.forEach(function (c) { if (c.tipo) CMD_DE[c.tipo] = c.id; });

  /* ------------------------------------------------------------ campos de cada tipo
   * [id, rótulo, tipo, opções]: num (m), mm (mostrado em mm), int, sel, cat (perfil), check, txt */
  var MM = { tGusset: 1, tDegrau: 1, tEspelho: 1, tLongarina: 1, tPiso: 1, tChapa: 1, trilhoB: 1, trilhoH: 1 };
  function campos(tipo) {
    var giro = ["giro", "Giro do conjunto (°)", "num"];
    if (tipo === "trelica") return [
      ["tipo", "Tipo", "sel", [["pratt", "Pratt (diagonais descem para o meio)"], ["howe", "Howe (diagonais sobem para o meio)"], ["warren", "Warren"], ["warren-montantes", "Warren com montantes"]]],
      ["forma", "Banzos", "sel", [["paralelos", "Paralelos"], ["trapezoidal", "Trapezoidal (cobertura)"], ["triangular", "Triangular (cobertura)"]]],
      ["vao", "Vão (m)", "num"], ["altura", "Altura no meio (m)", "num"], ["alturaApoio", "Altura no apoio — trapezoidal (m)", "num"], ["paineis", "Nº de painéis", "int"],
      ["arranjo", "Arranjo das barras", "sel", [["simples", "Simples (L, U ou tubo)"], ["dupla", "Cantoneira dupla (2L)"]]],
      ["banzo", "Perfil dos banzos", "cat", ["L", "C", "HSSR", "HSSC"]], ["diagonal", "Perfil das diagonais", "cat", ["L", "C", "HSSR", "HSSC"]], ["montante", "Perfil dos montantes", "cat", ["L", "C", "HSSR", "HSSC"]],
      ["ligacoes", "Chapa gusset nos nós", "check"], ["tGusset", "Espessura da gusset (mm)", "mm"], ["parafuso", "Parafuso", "par"], ["parafusos", "Parafusos por barra", "int"], giro];
    if (tipo === "escada") return [
      ["norma", "Norma do acesso", "sel", [["", "Sem norma de acesso (degrau pela regra abaixo)"], ["nr12", "Industrial — NR-12 (20° a 45°)"], ["nr12-ingreme", "Industrial íngreme — NR-12 (45° a 75°)"], ["nbr9050", "Rota acessível — NBR 9050"], ["emergencia", "Saída de emergência — IT do Corpo de Bombeiros"]]],
      ["forma", "Forma", "sel", [["reta", "Reta"], ["patamares", "Reta com patamares (descanso pela norma)"], ["L", "Em L (patamar de canto)"], ["U", "Em U (patamar de meia-volta)"], ["caracol", "Caracol"]]],
      ["desnivel", "Desnível (m)", "num"], ["largura", "Largura do lance (m)", "num"],
      ["regra", "Degrau (sem norma de acesso)", "sel", [["blondel", "Blondel: 2e + p de 63 a 64 cm"], ["tipo", "Espelho até 18 cm, piso mín. 27,5 cm"]]],
      ["lanceMax", "Altura máx. por lance — com patamares (m; 0 = a da norma)", "num"], ["patamarComp", "Comprimento do patamar (m; 0 = o da norma)", "num"], ["patamarTopo", "Patamar superior — reta (m; 0 = sem)", "num"], ["apoioBase", "Chapa de apoio no pé das longarinas", "check"],
      ["rodape", "Rodapé (NR-12: 0,20 m)", "check"], ["paredeLados", "Lados encostados em parede (0, 1 ou 2)", "int"],
      ["usoGuarda", "Força no guarda-corpo (NBR 6120, Tabela 12)", "sel", USO_GUARDA], ["usoPiso", "Sobrecarga (NBR 6120, Tabela 10)", "sel", USO_PISO],
      /* FIXAÇÃO CONFIGURADA (frente S6, 14/10/2026 — js/metalescadalinha.js): cada ponta dimensionada com os esforços da escada */
      ["fixPe", "Fixação no pé", "sel", FIXACOES], ["fixTopo", "Fixação no topo", "sel", FIXACOES],
      ["concPeEsp", "Concreto no pé: espessura (m; 0 = do modelo)", "num"], ["concPeFck", "Concreto no pé: fck (MPa; 0 = do modelo)", "num"], ["concTopoEsp", "Concreto no topo: espessura (m; 0 = do modelo)", "num"],
      ["concPeBorda", "Concreto no pé: distância até a borda (m; 0 = do contorno da laje desenhada)", "num"], ["concTopoBorda", "Concreto no topo: distância até a borda (m; 0 = do contorno)", "num"],
      /* ESCADA POR LINHA (frente S6): o 1º clique, a altura lida do modelo e a abertura no piso de chegada */
      ["sentidoLinha", "Por linha: o 1º clique é", "sel", [["desce", "O TOPO (borda do piso de cima) — a escada desce"], ["sobe", "O PÉ — a escada sobe"]]], ["alturaDoModelo", "Por linha: ler a altura do piso/laje de chegada (senão o desnível acima)", "check"], ["abrirPiso", "Por linha: abrir o piso/laje de chegada (com guarda-corpo)", "check"],
      ["virar", "Virada (L e U)", "sel", [["esquerda", "Para a esquerda"], ["direita", "Para a direita"]]], ["vao", "Poço entre os lances — U (m)", "num"],
      ["longarinaTipo", "Longarina", "sel", [["perfil", "Perfil U"], ["chapa", "Chapa"]]], ["longarina", "Perfil da longarina", "cat", ["C", "GERDAU-U", "UE"]],
      ["hLongarina", "Altura da longarina em chapa (m)", "num"], ["tLongarina", "Espessura da longarina em chapa (mm)", "mm"],
      ["degrau", "Degrau", "sel", [["xadrez", "Chapa xadrez"], ["dobrada", "Chapa dobrada (bocel na frente e dobra atrás)"], ["grade", "Grade (piso gradeado)"]]], ["tDegrau", "Espessura da chapa xadrez (mm)", "mm"], ["abaDegrau", "Chapa dobrada: aba das dobras (m)", "num"], ["espelho", "Espelho (chapa)", "check"],
      /* M5 (14/10/2026): os modelos — patamar intermediário, escada de navio e o preenchimento do guarda-corpo */
      ["nPatamares", "Patamares intermediários — com patamares (0 = os da norma)", "int"], ["anguloMin", "Escada de navio: ângulo mínimo (°; 0 = o da norma)", "num"],
      ["preenchimento", "Guarda-corpo: preenchimento", "sel", [["travessas", "Travessas"], ["barras", "Barras verticais (vão ≤ 11 cm)"]]], ["vaoBarras", "Barras: vão livre máximo (m)", "num"], ["publico", "Uso público (vão-luz ≤ 0,11 m)", "check"],
      ["guarda", "Guarda-corpo", "sel", [["dois", "Nos dois lados"], ["um", "Só do lado de fora"], ["nenhum", "Nenhum"]]], ["montante", "Montante do guarda-corpo", "cat", ["HSSC", "HSSR"]], ["corrimao", "Corrimão", "cat", ["HSSC", "HSSR"]],
      ["raio", "Caracol: raio externo (m)", "num"], ["mastro", "Caracol: mastro", "cat", ["HSSC"]], ["raioLinha", "Caracol: raio da linha de percurso (m)", "num"],
      ["sentido", "Caracol: sobe girando", "sel", [["anti-horario", "Anti-horário"], ["horario", "Horário"]]], giro];
    if (CAMPOS_EXTRA[tipo]) return CAMPOS_EXTRA[tipo].concat(tipo === "plataforma" || tipo === "piso" ? [] : [giro]);
    if (tipo === "mezanino") return [
      ["Lx", "Comprimento em X (m) — ou 2 cliques", "num"], ["Lz", "Largura em Z (m) — ou 2 cliques", "num"], ["vaosX", "Vãos entre pilares em X", "int"], ["vaosZ", "Vãos entre pilares em Z", "int"],
      ["altura", "Altura do piso — topo do aço (m)", "num"], ["direcao", "Vigas principais", "sel", [["x", "Ao longo de X"], ["z", "Ao longo de Z"]]], ["espSec", "Espaçamento máx. das secundárias (m)", "num"],
      ["principal", "Perfil das principais", "cat", ["W", "GERDAU"]], ["secundaria", "Perfil das secundárias", "cat", ["W", "GERDAU", "C"]], ["pilar", "Perfil dos pilares", "cat", ["W", "GERDAU", "HSSR"]],
      ["piso", "Piso", "sel", [["xadrez", "Chapa xadrez"], ["grade", "Grade (piso gradeado)"], ["deck", "Steel deck"], ["nenhum", "Sem piso"]]], ["tPiso", "Espessura da chapa xadrez (mm)", "mm"],
      ["frente", "Guarda-corpo na frente (Z mínimo)", "check"], ["fundo", "Guarda-corpo no fundo (Z máximo)", "check"], ["esquerda", "Guarda-corpo à esquerda (X mínimo)", "check"], ["direita", "Guarda-corpo à direita (X máximo)", "check"],
      ["contraventar", "Contraventamento em X nos vãos de canto", "check"], ["contravento", "Perfil do contraventamento", "cat", ["L", "BR"]], ["placaBase", "Placa de base nos pilares", "check"],
      /* SIMULAÇÃO S3 (14/10/2026): o motor já fazia — faltavam na tela (sem o X no plano, vigas rotuladas deixam os pilares
         internos soltos no cálculo; a abertura é a chegada da escada) */
      ["contraventoPlano", "Contraventamento no plano do piso (X horizontal)", "check"],
      ["abertura", "Abertura no guarda-corpo (chegada da escada)", "sel", [["", "Sem abertura"], ["frente", "Na frente (Z mínimo)"], ["fundo", "No fundo (Z máximo)"], ["esquerda", "À esquerda (X mínimo)"], ["direita", "À direita (X máximo)"]]],
      ["aberturaPos", "Posição da abertura ao longo da borda (0 a 1)", "num"], ["aberturaLarg", "Largura da abertura (m)", "num"], giro];
    if (tipo === "rolamento") return [
      ["cotaTrilho", "Cota do topo do trilho (m; 0 = 30 cm abaixo do topo do pilar)", "num"], ["excentricidade", "Do eixo dos pilares ao eixo do trilho (m)", "num"],
      ["viga", "Perfil da viga de rolamento", "cat", ["W", "GERDAU"]], ["console", "Perfil do console", "cat", ["W", "GERDAU"]],
      ["trilhoB", "Trilho: largura (mm)", "mm"], ["trilhoH", "Trilho: altura (mm)", "mm"],
      ["capacidade", "Capacidade da ponte (t) — só dado", "num"], ["vaoPonte", "Vão da ponte (m) — só dado", "num"]];
    if (tipo === "rack") return [
      ["porticos", "Nº de pórticos", "int"], ["espacamento", "Espaçamento dos pórticos (m)", "num"], ["largura", "Largura do pórtico (m)", "num"], ["niveis", "Níveis das travessas (m): 3; 4,5", "txt"],
      ["pilar", "Perfil dos pilares", "cat", ["W", "GERDAU", "HSSR"]], ["travessa", "Perfil das travessas", "cat", ["W", "GERDAU", "C"]],
      ["longarinas", "Longarinas entre os pórticos", "check"], ["longarina", "Perfil das longarinas", "cat", ["W", "GERDAU", "C"]],
      ["contraventados", "Contraventamento longitudinal", "sel", [["extremos", "Nos vãos das pontas"], ["todos", "Em todos os vãos"], ["nenhum", "Nenhum"]]], ["contravento", "Perfil do contraventamento", "cat", ["L"]],
      ["placaBase", "Placa de base nos pilares", "check"], giro];
    if (tipo === "skid") return [
      ["comprimento", "Comprimento do equipamento (m)", "num"], ["largura", "Largura do equipamento (m)", "num"], ["folga", "A base passa do equipamento (m, cada lado)", "num"],
      ["perfil", "Perfil do quadro (U)", "cat", ["C", "GERDAU-U", "UE"]], ["travessa", "Perfil das travessas", "cat", ["C", "GERDAU-U", "UE", "W"]], ["espTravessas", "Espaçamento máx. das travessas (m)", "num"],
      ["chapa", "Chapa de piso", "check"], ["tChapa", "Espessura da chapa (mm)", "mm"], ["pontos", "Pontos de fixação", "sel", [["4", "4 furos"], ["6", "6 furos"], ["0", "Nenhum"]]],
      ["entreFurosX", "Entre-furos no comprimento (m)", "num"], ["entreFurosZ", "Entre-furos na largura (m)", "num"], ["parafuso", "Parafuso do equipamento", "par"], giro];
    return [];
  }
  var FIXACOES = [["", "Sem fixação configurada"], ["auto", "Automática pelo que está embaixo/em cima"], ["ancorada", "ANCORADA — placa de base + chumbadores (concreto)"], ["parafusada", "PARAFUSADA — chapa + parafusos (aço)"], ["soldada", "SOLDADA — no aço onde toca"], ["apoiada", "APOIADA — apoio simples (no topo: pés de apoio)"]];
  var USO_GUARDA = [["industrial", "2,0 kN/m — atividade industrial (padrão, NBR 6120 Tabela 12)"], ["manutencao", "0,4 kN/m — SÓ passarela declarada de inspeção e manutenção"], ["sem-publico", "1,0 kN/m — uso NÃO industrial sem acesso público"], ["publico", "1,0 kN/m — uso NÃO industrial com acesso público"], ["fluxo-paralelo", "2,0 kN/m — fluxo de público, paralela"], ["fluxo-perpendicular", "3,0 kN/m — fluxo de público, perpendicular"], ["emergencia", "1,0 kN/m a 1,1 m — escada de emergência em edifícios (NBR 6120, Tabela 12)"]];
  var USO_PISO = [["escada-sem-publico", "2,5 kN/m² — escadas e passarelas sem acesso público"], ["escada-publico", "3,0 kN/m² — escadas e passarelas com acesso público"], ["area-tecnica", "3,0 kN/m² — área técnica"], ["informado", "Valor do projeto (informar)"]];
  var _dl = {};
  function datalist(series) {
    var k = series.join("-"); if (_dl[k]) return _dl[k];
    var A = global.PerfisAco, MC = global.MetalCriar, o = [];
    if (A) series.forEach(function (s) { (A.listar(s) || []).forEach(function (n) { if (!MC || MC.perfilCat(n)) o.push(n); }); });
    _dl[k] = o; return o;
  }
  function parafusos() { var N = global.BimMetalNorma; return N ? N.PARAFUSOS.map(function (p) { return [p.id, p.id + (p.sistema === "POL" ? " (pol.)" : "")]; }) : [["M16", "M16"]]; }

  /* ------------------------------------------------------------ estilo (tokens) */
  function css() {
    if (typeof document === "undefined" || document.getElementById("mpr-css")) return;
    var s = document.createElement("style"); s.id = "mpr-css";
    s.textContent = ".mpr-dlg{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:14px;align-items:start}" +
      ".mpr-campos{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px 12px;max-height:62vh;overflow:auto;padding-right:4px}" +
      ".mpr-campos label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--texto)}.mpr-campos label.mpr-ck{flex-direction:row;align-items:center;gap:6px}" +
      ".mpr-campos input:not([type=checkbox]),.mpr-campos select{min-height:30px}" +
      ".mpr-lado{display:flex;flex-direction:column;gap:8px}.mpr-prev{border:1px solid var(--linha);border-radius:8px;background:var(--surface);padding:6px}" +
      ".mpr-esq{width:100%;height:auto;display:block}.mpr-esq-barra{stroke:var(--aco);stroke-width:1.3}.mpr-esq-chapa{stroke:var(--texto-fraco);stroke-width:.6}.mpr-esq-guarda{stroke:var(--amarelo);stroke-width:.8}" +
      ".mpr-esq-rot{fill:var(--texto-fraco);font-size:9px;font-family:inherit}" +
      ".mpr-res{font-size:12px;color:var(--texto);margin:0}.mpr-av{font-size:11px;color:var(--texto-fraco);margin:0;padding-left:16px;max-height:120px;overflow:auto}" +
      ".mpr-erro{font-size:12px;color:var(--vermelho);margin:0;min-height:1.2em}.mpr-nota{font-size:11px;margin:0}" +
      ".mpr-conf-res{font-size:12px;margin:0 0 4px;font-weight:600}.mpr-conf-res.ok{color:var(--verde)}.mpr-conf-res.falha{color:var(--vermelho)}" +
      ".mpr-escopo{font-size:11px;color:var(--texto-fraco);margin:0 0 6px}.mpr-escopo summary{cursor:pointer;color:var(--texto)}.mpr-escopo p{margin:3px 0}" +
      ".mpr-conf-lista{font-size:11px;margin:0 0 6px;padding-left:16px;max-height:150px;overflow:auto;color:var(--texto)}.mpr-conf-lista li.falha{color:var(--vermelho)}.mpr-conf-lista li.rec{color:var(--amarelo)}" +
      "@media (max-width:760px){.mpr-dlg{grid-template-columns:1fr}.mpr-campos{max-height:none}}";
    document.head.appendChild(s);
  }

  var MetalProntasUI = {
    SUB: SUB, COMANDOS: COMANDOS, _n: 0, ultimo: null, USO_GUARDA: USO_GUARDA, USO_PISO: USO_PISO, modoDe: modoDe,
    /* outro arquivo (js/metalacessosui.js) registra os campos do diálogo de um tipo novo */
    registrarCampos: function (tipo, lista) { if (tipo && Array.isArray(lista)) CAMPOS_EXTRA[tipo] = lista; return true; },
    ids: function () { return COMANDOS.map(function (c) { return c.id; }); },
    /* o js/bimplantamodelar.js pergunta: a ferramenta armada quer os EIXOS da grade no encaixe da planta? */
    querEixos: function (sub) { return sub === SUB; },
    novoId: function () { var U = global.BimMetalUI; if (U && U.novoId) return U.novoId(); this._n++; return "mpr-" + Date.now().toString(36) + "-" + this._n; },
    estado: function () { var b = B(), e = b && b.editarEstado ? b.editarEstado() : null; return e ? e.estado : null; },
    caixas: function () { var st = this.estado(); return (st && st.caixas) || []; },
    selecao: function () { var U = global.BimMetalUI; return U && U.selecao ? U.selecao() : []; },
    selCaixas: function () { var ids = this.selecao().map(String), por = {}; this.caixas().forEach(function (c) { por[String(c.id)] = c; }); return ids.map(function (id) { return por[id]; }).filter(Boolean); },
    prontas: function () { return MP() ? MP().prontas(this.caixas()) : []; },
    pronta: function (id) { return this.prontas().filter(function (p) { return p.id === String(id); })[0] || null; },
    /* a peça pronta da seleção (a 1ª peça selecionada que tem a marca) */
    prontaSelecionada: function () { var c = this.selCaixas().filter(function (x) { return x.pronta; })[0]; return c ? this.pronta(c.pronta) : null; },

    /* ------------------------------------------------------------ fita */
    registrar: function (reg) {
      if (!previa() || !MP()) return false;
      var self = this;
      COMANDOS.forEach(function (c) {
        reg[c.id] = function () { try { if (c.tipo) self.comando(c.tipo); else self.editar(); } catch (e) { toast("Peças prontas: " + (e && e.message ? e.message : e), "erro", 8000); } return true; };
      });
      try { var BBo = global.BimBarraOpcoes; if (BBo && BBo.declarar) BBo.declarar(SUB, { rotulo: "Peça pronta", traco: false }); } catch (eB) {}
      /* as dicas ilustradas (passar o mouse no botão) */
      try {
        var D = global.DicaRica;
        if (D && D.item && D.registrar) MP().ORDEM.forEach(function (t) { D.item("pronta-" + t, MP().dica(t)); D.registrar(CMD_DE[t], "pronta-" + t); });
      } catch (eD) {}
      return true;
    },
    comando: function (tipo) {
      var alvo = this.prontaSelecionada();
      if (alvo && alvo.tipo === tipo && alvo.info && alvo.info.par) return this.dialogo(tipo, { alvo: alvo });
      if (tipo === "rolamento") {
        var pil = this.pilaresSel();
        if (pil.length < 2) { var t = "Viga de rolamento: selecione os PILARES de aço da fila (2 ou mais, Ctrl soma à seleção) e chame de novo."; status(t); toast(t, "aviso", 8000); return false; }
      }
      return this.dialogo(tipo, {});
    },
    pilaresSel: function () {
      var M = MP(); return this.selCaixas().filter(function (c) { return M && M.lerPilar(c); });
    },
    editar: function () {
      var alvo = this.prontaSelecionada();
      if (!alvo || !alvo.info || !alvo.info.par) { var t = "Editar peça pronta: selecione uma peça de uma treliça, escada, mezanino, viga de rolamento, rack ou base de equipamento criada pelas Peças prontas."; status(t); toast(t, "aviso", 8000); return false; }
      return this.dialogo(alvo.tipo, { alvo: alvo });
    },

    /* ------------------------------------------------------------ diálogo */
    _dlg: null,
    dialogo: function (tipo, o) {
      var M = MP(); if (!M || !global.UI) return false;
      css();
      o = o || {};
      var self = this, alvo = o.alvo || null, T = M.TIPOS[tipo];
      var par = alvo ? M.parParaRefazer(alvo) : (o.par ? (function () { var b = M.padrao(tipo); Object.keys(o.par).forEach(function (k) { b[k] = clone(o.par[k]); }); return b; })() : (this._ultimoPar && this._ultimoPar[tipo] ? clone(this._ultimoPar[tipo]) : M.padrao(tipo)));
      if (!alvo && tipo !== "rolamento") { var y = this.cota(); par.y0 = y; }
      var cs = campos(tipo), h = '<div class="mpr-dlg" data-modal-largo data-mpr="dlg" data-mpr-tipo="' + tipo + '"><div class="mpr-campos">';
      cs.forEach(function (c) {
        var id = c[0], v = par[id], ck = c[2] === "check";
        h += '<label' + (ck ? ' class="mpr-ck"' : "") + '>' + (ck ? "" : "<span>" + esc(c[1]) + "</span>");
        if (c[2] === "sel" || c[2] === "par") { var ops = c[2] === "par" ? parafusos() : c[3]; h += '<select data-mpr-c="' + id + '"' + (GRANDEZA[id] ? ' data-grandeza="' + GRANDEZA[id] + '"' : "") + '>' + ops.map(function (op) { return '<option value="' + esc(op[0]) + '"' + (String(op[0]) === String(v) ? " selected" : "") + ">" + esc(op[1]) + "</option>"; }).join("") + "</select>"; }
        else if (c[2] === "cat") h += '<input data-mpr-c="' + id + '" list="mpr-dl-' + id + '" value="' + esc(v) + '" autocomplete="off" spellcheck="false"><datalist id="mpr-dl-' + id + '">' + datalist(c[3]).map(function (n) { return '<option value="' + esc(n) + '">'; }).join("") + "</datalist>";
        else if (ck) h += '<input type="checkbox" data-mpr-c="' + id + '"' + (v ? " checked" : "") + "><span>" + esc(c[1]) + "</span>";
        else h += '<input data-mpr-c="' + id + '"' + (GRANDEZA[id] ? ' data-grandeza="' + GRANDEZA[id] + '"' : "") + ' value="' + esc(MM[id] ? br(num(v, 0) * 1000, 2) : (c[2] === "txt" ? v : br(v, c[2] === "int" ? 0 : 3))) + '"' + (c[2] === "txt" ? "" : ' inputmode="decimal"') + ">";
        h += "</label>";
      });
      if (tipo !== "rolamento") {
        h += '<label><span>Ponto X (m)</span><input data-mpr-c="x0" inputmode="decimal" value="' + esc(br(par.x0, 3)) + '"></label>' +
             '<label><span>Cota (m)</span><input data-mpr-c="y0" inputmode="decimal" value="' + esc(br(par.y0, 3)) + '"></label>' +
             '<label><span>Ponto Z (m)</span><input data-mpr-c="z0" inputmode="decimal" value="' + esc(br(par.z0, 3)) + '"></label>';
      }
      h += '</div><div class="mpr-lado"><div class="mpr-prev" data-mpr="previa"></div><p class="mpr-res" data-mpr="resumo"></p><p class="mpr-erro" data-mpr="erro" role="alert"></p><div class="mpr-conf" data-mpr="conf"></div><ul class="mpr-av" data-mpr="avisos"></ul>' + (T.calcula || tipo === "escada" ? '<div data-mpr="nota">' + (temCalculo(tipo, par) ? COM_CALCULO : NAO_CALCULO) + "</div>" : NAO_CALCULO) + "</div></div>";
      var bts = [];
      if (alvo) bts.push({ texto: "Atualizar no lugar", classe: "primary", onClick: function () { self._confirmar("atualizar"); } });
      else {
        var md = modoDe(tipo), mds = T.modos && T.modos.length ? T.modos : [md];
        mds.forEach(function (m, i) { bts.push({ texto: m === "ponto" && tipo === "rolamento" ? "Clicar o lado da ponte" : (ROT_MODO[m] || (MODOS[m] && MODOS[m].rotulo) || "Posicionar"), classe: i === 0 ? "primary" : "", onClick: function () { self._confirmar("posicionar", m); } }); });
        if (o.modosExtra) o.modosExtra.forEach(function (m) { bts.push({ texto: (MODOS[m] && MODOS[m].rotulo) || m, classe: "primary", onClick: function () { self._confirmar("posicionar", m); } }); });
        bts.push({ texto: tipo === "rolamento" ? "Criar deste lado" : "Criar nas coordenadas", onClick: function () { self._confirmar("coordenadas"); } });
      }
      bts.push({ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); self._dlg = null; } });
      var tit = (alvo ? "Editar — " + T.rotulo + " (" + alvo.n + " peças)" : T.rotulo);
      UI.modal(tit, h, bts);
      var raiz = document.querySelector('[data-mpr="dlg"]');
      this._dlg = { tipo: tipo, alvo: alvo, par: par, raiz: raiz, ctx: tipo === "rolamento" ? { pilares: alvo ? this.pilaresDe(par.pilares) : this.pilaresSel() } : {} };
      var tm = null;
      if (raiz) { raiz.addEventListener("input", function () { clearTimeout(tm); tm = setTimeout(function () { self.previaDialogo(); }, 180); }); raiz.addEventListener("change", function () { self.previaDialogo(); }); }
      this.previaDialogo();
      return true;
    },
    pilaresDe: function (ids) { var por = {}; this.caixas().forEach(function (c) { por[String(c.id)] = c; }); return (ids || []).map(function (id) { return por[String(id)]; }).filter(Boolean); },
    /* os valores do diálogo → par */
    lerDialogo: function () {
      var d = this._dlg; if (!d || !d.raiz) return null;
      var p = clone(d.par), cs = campos(d.tipo), raiz = d.raiz;
      cs.concat([["x0", "", "num"], ["y0", "", "num"], ["z0", "", "num"]]).forEach(function (c) {
        var el = raiz.querySelector('[data-mpr-c="' + c[0] + '"]'); if (!el) return;
        if (c[2] === "check") p[c[0]] = !!el.checked;
        else if (c[2] === "sel" || c[2] === "par" || c[2] === "cat" || c[2] === "txt") p[c[0]] = c[0] === "pontos" ? num(el.value, 4) : String(el.value).trim();
        else { var v = num(global.UnidadesUI ? UnidadesUI.texto(el) : el.value, NaN); if (isFinite(v)) p[c[0]] = MM[c[0]] ? v / 1000 : v; }
      });
      return p;
    },
    previaDialogo: function () {
      var d = this._dlg, M = MP(); if (!d || !M || !d.raiz || !d.raiz.isConnected) return null;
      var p = this.lerDialogo(), q = clone(p); q.x0 = 0; q.y0 = 0; q.z0 = 0; q.giro = 0;
      q = resolver(d.tipo, q);
      var k = 0, r = M.gerar(d.tipo, q, function () { return "pv" + (++k); }, d.ctx);
      var el = function (s) { return d.raiz.querySelector('[data-mpr="' + s + '"]'); };
      d.previa = r;
      if (!r.ok) { el("erro").textContent = r.motivo; el("resumo").textContent = ""; el("previa").innerHTML = ""; el("avisos").innerHTML = ""; return r; }
      el("erro").textContent = "";
      el("previa").innerHTML = M.esquema(r);
      el("resumo").textContent = r.resumo;
      el("avisos").innerHTML = r.avisos.concat(r.avisosLigacoes || []).slice(0, 6).map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("");
      /* CONFORMIDADE de norma e DIMENSIONAMENTO (js/acoacessos.js) ao vivo */
      var cf = el("conf"), nt = el("nota");
      if (nt) nt.innerHTML = temCalculo(d.tipo, p) ? COM_CALCULO : NAO_CALCULO;
      if (cf) cf.innerHTML = temCalculo(d.tipo, p) ? this.htmlConformidade(r) + this.htmlEscopo(d.tipo) : "";
      return r;
    },
    /* AVISO DE ESCOPO: o que a geração verifica e o que não verifica (js/metalacessos.js) */
    htmlEscopo: function (tipo) {
      var MA = global.MetalAcessos, e = MA && MA.escopo ? MA.escopo(tipo) : null; if (!e) return "";
      return '<details class="mpr-escopo" data-mpr="escopo"><summary>Escopo: o que é e o que não é verificado</summary><p><b>Verifica:</b> ' + e.verifica.map(esc).join("; ") + '.</p><p><b>Não verifica:</b> ' + e.naoVerifica.map(esc).join("; ") + ".</p></details>";
    },
    /* o bloco da conformidade (diálogo e Verificar acesso): resumo + as não conformidades com o item e a correção */
    htmlConformidade: function (r, completo) {
      var MA = global.MetalAcessos, av = MA ? MA.avaliar(r) : null; if (!av) return "";
      var v = av.conformidade, dm = av.dimensionamento, h = "";
      if (v && v.ok) {
        h += '<p class="mpr-conf-res ' + (v.aprovado ? "ok" : "falha") + '" data-mpr="conf-res">' + (v.aprovado ? "Norma — atende: " : (v.status === "incompleto" ? "Norma — INCOMPLETO: " : "Norma — NÃO ATENDE: ")) + esc(v.resumo) + "</p>";
        var lista = completo ? v.itens : v.naoConformes.concat(v.recomendacoes).slice(0, 5);
        if (!completo && v.incompletos && v.incompletos.length) lista = v.naoConformes.concat(v.incompletos).concat(v.recomendacoes).slice(0, 6);
        if (lista.length) h += '<ul class="mpr-conf-lista">' + lista.map(function (i) { return '<li class="' + (i.ok === false ? (i.sev === "nc" ? "falha" : "rec") : (i.ok ? "ok" : "")) + '" data-mpr-req="' + esc(i.id) + '"><b>' + esc(i.norma) + "</b> — " + esc(i.requisito) + ": " + esc(i.valorTexto) + " (" + esc(i.limite) + ")" + (i.correcao ? " → " + esc(i.correcao) : "") + "</li>"; }).join("") + "</ul>";   /* M5: sem "[conferir]" na tela (a lista vai para o arquivo interno — AcoAcessos.pendenciasNorma) */
      }
      if (dm && dm.ok) h += '<p class="mpr-conf-res ' + (dm.aprovado ? "ok" : "falha") + '" data-mpr="dim-res">' + (dm.aprovado ? "Cálculo — passa: " : (dm.status === "incompleto" ? "Cálculo — INCOMPLETO: " : "Cálculo — NÃO PASSA: ")) + esc(dm.resumo) + "</p>";
      return h;
    },
    _confirmar: function (modo, modoPosicao) {
      var d = this._dlg, M = MP(); if (!d || !M) return false;
      var p = this.lerDialogo(), e = M.validar(d.tipo, p);
      if (e) { var er = d.raiz && d.raiz.querySelector('[data-mpr="erro"]'); if (er) er.textContent = e; return false; }
      this._ultimoPar = this._ultimoPar || {}; this._ultimoPar[d.tipo] = clone(p);
      UI.fecharModal();
      var tipo = d.tipo, alvo = d.alvo, ctx = d.ctx; this._dlg = null;
      if (modo === "atualizar") return this.colocar(tipo, p, ctx, alvo);
      if (modo === "coordenadas") return this.colocar(tipo, p, ctx, null);
      return this.posicionar(tipo, p, ctx, modoPosicao);
    },

    /* ------------------------------------------------------------ cota e posicionar */
    cota: function () {
      try { var P = Pl(), pa = P && P.ativo ? P.ativo() : null; if (pa && pa.horizontal) return pa.o[1]; } catch (e) {}
      try { var U = global.BimArqUI, n = U && U.nivelAtivo ? U.nivelAtivo() : null; if (n && isFinite(+n.elevacao)) return +n.elevacao; } catch (e2) {}
      var b = B(); try { return b && b.editarBase ? b.editarBase() : 0; } catch (e3) { return 0; }
    },
    _pos: null,
    registrarModo: function (nome, h) { if (nome && h) MODOS[nome] = h; return true; },
    modoPos: modoPos,
    posicionar: function (tipo, par, ctx, modo) {
      var b = B(); if (!b || !b.editarArmar) { toast("Abra o modelo 3D para posicionar.", "aviso"); return false; }
      this._pos = { tipo: tipo, par: clone(par), ctx: ctx || {}, pts: [], modo: modo && modo !== modoDe(tipo) ? modo : null };
      var ok = b.editarArmar(SUB);
      if (ok === false) { this._pos = null; return false; }
      this._dica();
      return true;
    },
    _dica: function () {
      var s = this._pos; if (!s) return "";
      var T = MP().TIPOS[s.tipo], md = modoPos(s);
      if (MODOS[md] && MODOS[md].dica) { var tx = MODOS[md].dica(s); status(tx); if (this._3d && this._3d.hint) this._3d.hint(tx); return tx; }
      var t = md === "retangulo" ? (s.pts.length ? T.rotulo + ": agora o canto OPOSTO." : T.rotulo + ": clique o 1º canto (encaixa nos eixos e nas pontas).")
        : (md === "polilinha" ? T.rotulo + ": clique os pontos (" + s.pts.length + " até agora); Enter termina (2 pontos ou mais), Backspace desfaz o último, Esc cancela."
        : md === "contorno" ? T.rotulo + ": clique os cantos do contorno (" + s.pts.length + " até agora); Enter fecha (3 cantos ou mais), Backspace desfaz o último, Esc cancela."
        : md === "linha" ? (s.pts.length ? T.rotulo + ": agora o FIM." : T.rotulo + ": clique o COMEÇO (encaixa nos eixos e nas pontas).")
        : (s.tipo === "rolamento" ? "Viga de rolamento: clique do lado da fila onde fica a ponte." : T.rotulo + ": clique onde fica (encaixa nos eixos e nas pontas)."));
      t += " Espaço gira 90° (" + br(s.par.giro, 0) + "°), Esc cancela — no 3D ou na planta.";
      status(t); if (this._3d && this._3d.hint) this._3d.hint(t);
      return t;
    },
    /* aceita o ponto (3D ou planta) */
    ponto: function (p) {
      var s = this._pos, M = MP(); if (!s || !M) return false;
      var md = modoPos(s);
      if (MODOS[md] && MODOS[md].ponto) return MODOS[md].ponto(s, p, this);
      if (md === "contorno") {
        var ultC = s.pts[s.pts.length - 1];
        if (s.pts.length >= 3 && Math.hypot(p[0] - s.pts[0][0], p[2] - s.pts[0][2]) < 0.05) return this.fecharPolilinha();   /* clicou no 1º canto: fecha */
        if (!ultC || Math.hypot(p[0] - ultC[0], p[2] - ultC[2]) > 0.05) s.pts.push(p.slice());
        this._dica(); if (this._3d) this._3d.redesenhar();
        return true;
      }
      if (md === "retangulo") {
        if (!s.pts.length) { s.pts.push(p.slice()); this._dica(); return true; }
        var rt = M.retangulo(s.pts[0], p, s.par.giro), mn = s.tipo === "piso" || s.tipo === "guardacorpo" ? 0.2 : 0.5;
        if (!(rt.Lx > mn && rt.Lz > mn)) { status(M.TIPOS[s.tipo].rotulo + ": os dois cantos têm de formar um retângulo (mais de " + br(mn) + " m de cada lado)."); return true; }
        s.par.x0 = rt.x0; s.par.y0 = rt.y0; s.par.z0 = rt.z0; s.par.Lx = rt.Lx; s.par.Lz = rt.Lz;
        if (s.tipo === "guardacorpo" || s.par.contorno != null) this.aplicarRetangulo(s, rt);
      } else if (md === "polilinha") {
        /* GUARDA-CORPO EM POLILINHA: cada clique é um canto; Enter termina (fecharPolilinha) */
        var ult = s.pts[s.pts.length - 1];
        if (!ult || Math.hypot(p[0] - ult[0], p[2] - ult[2]) > 0.05) s.pts.push(p.slice());
        this._dica(); if (this._3d) this._3d.redesenhar();
        return true;
      } else if (md === "linha") {
        if (!s.pts.length) { s.pts.push(p.slice()); this._dica(); return true; }
        var ln = this.linhaDe(s.pts[0], p);
        if (!(ln.comprimento > 0.3)) { status(M.TIPOS[s.tipo].rotulo + ": o fim tem de ficar a mais de 0,30 m do começo."); return true; }
        s.par.x0 = ln.x0; s.par.y0 = ln.y0; s.par.z0 = ln.z0; s.par.comprimento = ln.comprimento; s.par.giro = ln.giro;
      } else if (s.tipo === "rolamento") s.par.lado = M.ladoDoClique(s.ctx.pilares, p);
      else { s.par.x0 = Math.round(p[0] * 1e4) / 1e4; s.par.y0 = Math.round(p[1] * 1e4) / 1e4; s.par.z0 = Math.round(p[2] * 1e4) / 1e4; }
      this._pos = null;
      var b = B(); try { if (b && b.editarArmar) b.editarArmar(null); } catch (e) {}
      return this.colocar(s.tipo, s.par, s.ctx, null);
    },
    /* dois pontos → origem, comprimento e giro (convenção do editor: X local → (cos θ, 0, −sen θ)) */
    linhaDe: function (A, B) {
      var dx = B[0] - A[0], dz = B[2] - A[2], L = Math.sqrt(dx * dx + dz * dz), g = Math.atan2(-dz, dx) * 180 / Math.PI;
      return { x0: Math.round(A[0] * 1e4) / 1e4, y0: Math.round(A[1] * 1e4) / 1e4, z0: Math.round(A[2] * 1e4) / 1e4, comprimento: Math.round(L * 1e4) / 1e4, giro: Math.round(((g % 360) + 360) % 360 * 1e4) / 1e4 };
    },
    /* o caminho da polilinha em texto ("x z; x z", relativo ao 1º ponto, eixos do mundo) */
    caminhoDe: function (pts) { var a = pts[0]; return pts.map(function (q) { return br(q[0] - a[0], 3) + " " + br(q[2] - a[2], 3); }).join("; "); },
    fecharPolilinha: function () {
      var s = this._pos, mdF = modoPos(s); if (!s || (mdF !== "polilinha" && mdF !== "contorno")) return false;
      var nMin = mdF === "contorno" ? 3 : 2;
      if (s.pts.length < nMin) { status(MP().TIPOS[s.tipo].rotulo + ": clique pelo menos " + nMin + " pontos antes do Enter."); return false; }
      var a = s.pts[0]; s.par.x0 = Math.round(a[0] * 1e4) / 1e4; s.par.y0 = Math.round(a[1] * 1e4) / 1e4; s.par.z0 = Math.round(a[2] * 1e4) / 1e4; s.par.giro = 0;
      if (mdF === "contorno") s.par.contorno = this.caminhoDe(s.pts); else s.par.caminho = this.caminhoDe(s.pts);
      this._pos = null;
      var b = B(); try { if (b && b.editarArmar) b.editarArmar(null); } catch (e) {}
      return this.colocar(s.tipo, s.par, s.ctx, null);
    },
    /* BACKSPACE: desfaz o último ponto clicado (polilinha, contorno, linha, retângulo e os modos de fora) */
    voltarPonto: function () {
      var s = this._pos; if (!s) return false;
      var h = MODOS[modoPos(s)]; if (h && h.voltar) { h.voltar(s, this); this._dica(); if (this._3d) this._3d.redesenhar(); return true; }
      if (!s.pts.length) return false;
      s.pts.pop(); this._dica(); if (this._3d) this._3d.redesenhar();
      return true;
    },
    /* o retângulo (2 cantos) do guarda-corpo vira o CAMINHO dos 4 lados (menos o lado aberto); o do piso vira o contorno */
    aplicarRetangulo: function (s, rt) {
      var th = (Number(s.par.giro) || 0) * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th);
      function W(u, w) { return [u * c + w * sn, -u * sn + w * c]; }   /* local → mundo (relativo à origem) */
      var cs = [W(0, 0), W(rt.Lx, 0), W(rt.Lx, rt.Lz), W(0, rt.Lz)], lados = ["frente", "direita", "fundo", "esquerda"], ab = lados.indexOf(String(s.par.ladoAberto || "")), seq = [];
      if (s.tipo === "guardacorpo") {
        if (ab < 0) seq = [0, 1, 2, 3, 0]; else for (var k = 1; k <= 4; k++) seq.push((ab + k) % 4);
        s.par.caminho = seq.map(function (i) { return br(cs[i][0], 3) + " " + br(cs[i][1], 3); }).join("; ");
        if (ab >= 0) { var o0 = cs[seq[0]]; s.par.caminho = seq.map(function (i) { return br(cs[i][0] - o0[0], 3) + " " + br(cs[i][1] - o0[1], 3); }).join("; "); s.par.x0 = Math.round((rt.x0 + o0[0]) * 1e4) / 1e4; s.par.z0 = Math.round((rt.z0 + o0[1]) * 1e4) / 1e4; }
        s.par.giro = 0;
      } else s.par.contorno = "";
      return s.par;
    },
    girar: function () { var s = this._pos; if (!s) return false; s.par.giro = ((Math.round(num(s.par.giro, 0) / 90) * 90 + 90) % 360); this._dica(); if (this._3d) this._3d.redesenhar(); return true; },
    cancelar: function () { if (this._pos) { var h = MODOS[modoPos(this._pos)]; if (h && h.cancelar) try { h.cancelar(this._pos, this); } catch (e) {} this._pos = null; status("Peça pronta: posicionamento cancelado."); } },
    /* a peça (em arame) no ponto do cursor — para o 3D */
    previaEm: function (p) {
      var s = this._pos, M = MP(); if (!s || !M || !p) return null;
      var q = clone(s.par), md = modoPos(s);
      if (MODOS[md] && MODOS[md].previa) return MODOS[md].previa(s, p, this);
      if (md === "contorno") {
        if (!s.pts.length) { q.x0 = p[0]; q.y0 = p[1]; q.z0 = p[2]; q.contorno = ""; }
        else { var ptsC = s.pts.concat([p]); if (Math.hypot(p[0] - s.pts[s.pts.length - 1][0], p[2] - s.pts[s.pts.length - 1][2]) < 0.06) ptsC = s.pts.slice(); if (ptsC.length < 3) return null; q.x0 = ptsC[0][0]; q.y0 = ptsC[0][1]; q.z0 = ptsC[0][2]; q.giro = 0; q.contorno = this.caminhoDe(ptsC); }
      } else if (md === "retangulo") {
        if (!s.pts.length) { q.x0 = p[0]; q.y0 = p[1]; q.z0 = p[2]; }
        else { var rt = M.retangulo(s.pts[0], p, q.giro); if (!(rt.Lx > 0.2 && rt.Lz > 0.2)) return null; q.x0 = rt.x0; q.y0 = rt.y0; q.z0 = rt.z0; q.Lx = rt.Lx; q.Lz = rt.Lz; if (s.tipo === "guardacorpo" || q.contorno != null) this.aplicarRetangulo({ tipo: s.tipo, par: q }, rt); }
      } else if (md === "polilinha") {
        if (!s.pts.length) { q.x0 = p[0]; q.y0 = p[1]; q.z0 = p[2]; }
        else { var pts = s.pts.concat([p]); if (Math.hypot(p[0] - s.pts[s.pts.length - 1][0], p[2] - s.pts[s.pts.length - 1][2]) < 0.06) pts = s.pts.slice(); if (pts.length < 2) return null; q.x0 = pts[0][0]; q.y0 = pts[0][1]; q.z0 = pts[0][2]; q.giro = 0; q.caminho = this.caminhoDe(pts); }
      } else if (md === "linha") {
        if (!s.pts.length) { q.x0 = p[0]; q.y0 = p[1]; q.z0 = p[2]; }
        else { var ln = this.linhaDe(s.pts[0], p); if (!(ln.comprimento > 0.3)) return null; q.x0 = ln.x0; q.y0 = ln.y0; q.z0 = ln.z0; q.comprimento = ln.comprimento; q.giro = ln.giro; }
      } else if (s.tipo === "rolamento") q.lado = M.ladoDoClique(s.ctx.pilares, p);
      else { q.x0 = p[0]; q.y0 = p[1]; q.z0 = p[2]; }
      q.ligacoes = false; q.placaBase = false;   /* a prévia não precisa das chapas (fica leve) */
      q = resolver(s.tipo, q);
      var k = 0, r = M.gerar(s.tipo, q, function () { return "pv" + (++k); }, s.ctx);
      return r.ok ? r : null;
    },

    /* a prévia na PLANTA (js/bimplantamodelar.js): os segmentos em planta da peça no cursor + a linha/contorno clicados */
    previaPlanta: function (x, z) {
      var s = this._pos; if (!s) return null;
      var p = [x, this.cota(), z], r = null; try { r = this.previaEm(p); } catch (e) { r = null; }
      var segs = [];
      if (r) r.linhas.forEach(function (l) { if (segs.length < 1500 && Math.hypot(l.a[0] - l.b[0], l.a[2] - l.b[2]) > 1e-3) segs.push([l.a[0], l.a[2], l.b[0], l.b[2], "pm-forma"]); });
      if (s.pts.length) { var pts = s.pts.concat([p]); for (var i = 1; i < pts.length; i++) segs.push([pts[i - 1][0], pts[i - 1][2], pts[i][0], pts[i][2], "pm-elastico"]); }
      return { segs: segs, falta: !!(r && r.corPrevia) };
    },

    /* ------------------------------------------------------------ criar / atualizar no lugar */
    /* o lote da peça pronta (com a identidade) SEM mandar para o editor — quem junta mais ops num lote só (a escada por linha
       com a abertura no piso) usa este e manda tudo de uma vez */
    preparar: function (tipo, par, ctx, alvo) {
      var M = MP(), self = this; if (!M) return null;
      par = resolver(tipo, par, "criar");
      var r = M.gerar(tipo, par, function () { return self.novoId(); }, ctx || {});
      if (!r.ok) return r;
      var gid = alvo ? alvo.id : "pronta-" + this.novoId();
      M.identidade(r, gid, { tipo: tipo, par: r.par, em: new Date().toISOString() }, alvo);
      return r;
    },
    colocar: function (tipo, par, ctx, alvo, op) {
      var M = MP(), self = this; if (!M) return null;
      if (alvo && alvo.info && alvo.info.par && tipo !== "rolamento") ["x0", "y0", "z0"].forEach(function (k) { if (par[k] == null) par[k] = alvo.info.par[k]; });
      par = resolver(tipo, par, "criar");
      var r = M.gerar(tipo, par, function () { return self.novoId(); }, ctx || {});
      if (!r.ok) { toast(M.TIPOS[tipo].rotulo + ": " + r.motivo, "aviso", 9000); status(r.motivo); return r; }
      var gid = alvo ? alvo.id : "pronta-" + this.novoId();
      M.identidade(r, gid, { tipo: tipo, par: r.par, em: new Date().toISOString() }, alvo);
      var b = B();
      if (!b || !b.editarLote || !b.editarLote(r.op)) { toast("O editor recusou a peça pronta.", "erro"); r.ok = false; return r; }
      this.ultimo = { tipo: tipo, resumo: r.resumo, prontaId: gid, atualizou: !!alvo, n: Object.keys(r.finais).length, avisos: r.avisos.concat(r.avisosLigacoes || []) };
      var t = (alvo ? "Atualizada no lugar — " : "") + r.resumo + " Ctrl+Z desfaz" + (alvo ? " (volta a anterior)." : ".");
      status(t); toast(t, "ok", 9000);
      if (!(op && op.semEnquadrar)) this.enquadrar(r);   /* M5: esticar pela alça não mexe na câmera */
      return r;
    },
    enquadrar: function (r) {
      var b = B(); if (!b || !b.olharPara || !r) return false;
      var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      Object.keys(r.finais || {}).forEach(function (k) { var c = r.finais[k]; [c.cx, c.cy, c.cz].forEach(function (v, i) { v = Number(v); if (isFinite(v)) { mn[i] = Math.min(mn[i], v); mx[i] = Math.max(mx[i], v); } }); });
      if (!isFinite(mn[0])) return false;
      var cam = b.cameraAtual ? b.cameraAtual() : null, fov = cam && cam.fov > 0 ? cam.fov : 50, dx = mx[0] - mn[0], dy = mx[1] - mn[1], dz = mx[2] - mn[2], raio = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz) / 2, 1);
      try { b.olharPara([(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2], raio / Math.sin(fov * Math.PI / 360) * 1.15); return true; } catch (e) { return false; }
    },

    /* ================================================== 3D (gancho S._metp do js/bim.js)
     * api: { THREE, S, edit, scene, raio(cx, cy), marca(sn), marcaEsconder(), hint(t), telaDe(x,y,z) } */
    montar3d: function (api) {
      if (!api || !api.THREE || !api.scene) return null;
      var self = this, THREE = api.THREE, edit = api.edit, st = { t: 0, cur: null, geoPr: null, geoSt: null, ultEv: null };
      var grp = new THREE.Group(); grp.name = "metal-prontas-previa"; api.scene.add(grp);
      function ativo() { return previa() && edit.on && edit.sub === SUB && !!self._pos && api.S.alive !== false; }
      function limpar() { grp.children.slice().forEach(function (o) { grp.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
      function cor(nome, reserva) { var c = new THREE.Color(); try { c.set(token(nome, reserva)); } catch (e) { c.set(reserva); } return c; }
      function linhas(pos, cr, op) {
        if (!pos.length) return null;
        var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        var l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: cr, depthTest: false, transparent: true, opacity: op == null ? 0.95 : op }));
        l.renderOrder = 996; l.frustumCulled = false; l.raycast = function () {}; return l;
      }
      function geoPr() {
        var e0 = self.estado() || { caixas: [] };
        /* ⚠ as peças METÁLICAS ficam fora (o mesmo do js/metalcriarui.js): o canto da pegada de um pilar (meia mesa
           ao lado) ganhava do cruzamento dos eixos e a peça nascia 8 cm fora do eixo */
        if (!st.geoPr || st.geoSt !== e0) { st.geoSt = e0; st.geoPr = PR() ? PR().geometria(e0, { eixos: true, excluir: (e0.caixas || []).filter(function (c) { return c.tipo === "metal"; }).map(function (c) { return c.id; }) }) : null; }
        return st.geoPr;
      }
      function resolver(e) {
        var P = Pl(), r = api.raio(e.clientX, e.clientY); if (!r || !P) return null;
        var y = self.cota(), pl = { o: [0, y, 0], u: [1, 0, 0], v: [0, 0, -1], n: [0, 1, 0], horizontal: true, y: y };
        var q = P.pontoNoPlano(r, pl); if (!q) return null;
        var sn = null, Bo = global.BimBarraOpcoes, liga = function (t) { return !Bo || !Bo.snapLigado || Bo.snapLigado(t); };
        /* PRECISÃO ÚNICA (14/10/2026, barra de baixo — js/bimbarrasnaps.js): o Snap geral e cada tipo
           desligado lá valem aqui (a peça pronta só usa os pontos notáveis e a perpendicular) */
        if (PR() && liga(null)) {
          var p2 = P.pontoNoPlano(api.raio(e.clientX + 14, e.clientY), pl), tol = p2 ? Math.max(0.005, Math.min(2, Math.sqrt(Math.pow(p2[0] - q[0], 2) + Math.pow(p2[2] - q[2], 2)))) : 0.2;
          var s0 = self._pos && self._pos.pts.length ? self._pos.pts[0] : null;
          sn = PR().snap({ x: q[0], z: q[2] }, geoPr(), { tol: tol, tipos: { fim: liga("fim"), intersecao: liga("intersecao"), meio: liga("meio"), centro: liga("centro"), perpendicular: !!s0 && liga("perpendicular"), extensao: false, proximo: false, grade: false }, ref: s0 ? { x: s0[0], z: s0[2] } : null });
          if (sn) q = [sn.p.x, y, sn.p.z];
        }
        /* o próximo ponto da peça em LINHA ou POLILINHA (guarda-corpo, escada, passarela) anda no Orto;
           o 2º canto do retângulo (mezanino) é a diagonal: fica livre */
        var sp = self._pos, md = sp ? modoPos(sp) : null;
        if (sp && sp.pts.length && (md === "polilinha" || md === "linha" || md === "contorno" || (MODOS[md] && MODOS[md].orto)) && Bo && Bo.travar) {
          var b0 = sp.pts[sp.pts.length - 1], aj = Bo.travar({ x: b0[0], z: b0[2] }, { x: q[0], z: q[2] }, { shift: !!e.shiftKey, tipoSnap: sn ? sn.tipo : null });
          if (aj.travado) { q = [aj.p.x, y, aj.p.z]; sn = null; }
        }
        return { p: q, sn: sn };
      }
      function desenhar(p) {
        limpar(); if (!p) return;
        var r = self.previaEm(p);
        var s0 = self._pos, h0 = s0 ? MODOS[modoPos(s0)] : null;
        if (h0 && h0.pintar) { try { h0.pintar(s0, p, r, { linhas: linhas, cor: cor, grp: grp, THREE: THREE }); } catch (eP) {} }
        if (!r) { st.n = grp.children.length; return; }
        var pos = [], posG = [];
        r.linhas.forEach(function (l) { (/guarda|Corrim|Montante do/.test(l.p) ? posG : pos).push(l.a[0], l.a[1], l.a[2], l.b[0], l.b[1], l.b[2]); });
        var l1 = linhas(pos, r.corPrevia ? cor(r.corPrevia, "#c0392b") : cor("--aco-claro", "#5b9bd5")), l2 = linhas(posG, cor("--amarelo", "#d99a1e"), 0.8);
        if (l1) grp.add(l1); if (l2) grp.add(l2);
        var s = self._pos;
        if (s && (modoPos(s) === "polilinha" || modoPos(s) === "contorno") && s.pts.length) { var pp2 = []; s.pts.concat([p]).forEach(function (q, i, l2) { if (i) pp2.push(l2[i - 1][0], l2[i - 1][1], l2[i - 1][2], q[0], q[1], q[2]); }); var lp = linhas(pp2, cor("--verde", "#15803d"), 1); if (lp) grp.add(lp); }
        else if (s && (modoPos(s) === "retangulo" || modoPos(s) === "linha") && s.pts.length) { var a = s.pts[0], lb = linhas([a[0], a[1], a[2], p[0], p[1], p[2]], cor("--verde", "#15803d"), 1); if (lb) grp.add(lb); }
        st.n = grp.children.length; st.resumo = r.resumo;
      }
      document.addEventListener("keydown", function (e) {
        if (!ativo() || e.ctrlKey || e.metaKey || e.altKey) return;
        var t = e.target || {}; if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || "") || t.isContentEditable) return;
        if (e.key === " " || e.code === "Space") { e.preventDefault(); e.stopImmediatePropagation(); self.girar(); }
        else if ((e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter") && self._pos && (modoPos(self._pos) === "polilinha" || modoPos(self._pos) === "contorno")) { e.preventDefault(); e.stopImmediatePropagation(); limpar(); api.marcaEsconder(); self.fecharPolilinha(); }
        else if ((e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter") && self._pos && MODOS[modoPos(self._pos)] && MODOS[modoPos(self._pos)].enter) { e.preventDefault(); e.stopImmediatePropagation(); MODOS[modoPos(self._pos)].enter(self._pos, self); }
        else if ((e.key === "Backspace" || e.code === "Backspace") && self._pos) { e.preventDefault(); e.stopImmediatePropagation(); self.voltarPonto(); }
      }, true);
      var api3 = {
        ativo: ativo,
        mover: function (e) {
          if (!ativo()) return false;
          var tt = (global.performance && performance.now) ? performance.now() : Date.now(); if (tt - st.t < 60) return true; st.t = tt;
          st.ultEv = { clientX: e.clientX, clientY: e.clientY };
          var r = resolver(e); if (!r) { api.marcaEsconder(); limpar(); return true; }
          st.cur = r.p;
          if (r.sn) api.marca({ p: new THREE.Vector3(r.p[0], r.p[1], r.p[2]), tipo: r.sn.tipo, editor: true, cor: r.sn.tipo === "intersecao" ? "var(--vermelho)" : "var(--verde)" }); else api.marcaEsconder();
          desenhar(r.p);
          return true;
        },
        clique: function (e, hit, pForcado) {
          if (!ativo()) return false;
          var p;
          if (pForcado) {
            p = [pForcado.x, self.cota(), pForcado.z];
            /* da planta: o mesmo Orto da barra de baixo no próximo ponto da linha/polilinha */
            var sF = self._pos, mF = sF ? modoPos(sF) : null, BoF = global.BimBarraOpcoes;
            if (sF && sF.pts.length && (mF === "polilinha" || mF === "linha" || mF === "contorno" || (MODOS[mF] && MODOS[mF].orto)) && BoF && BoF.travar) { var bF = sF.pts[sF.pts.length - 1], aF = BoF.travar({ x: bF[0], z: bF[2] }, { x: p[0], z: p[2] }, { shift: !!(e && e.shiftKey) }); if (aF.travado) p = [aF.p.x, p[1], aF.p.z]; }
          } else { var r = resolver(e); if (!r) { api.hint("Não achei o ponto no plano — gire a vista."); return true; } p = r.p; }
          limpar(); api.marcaEsconder();
          self.ponto(p);
          return true;
        },
        cancelar: function () { limpar(); if (self._pos && self._pos.pts.length) { self._pos.pts = []; var hC = MODOS[modoPos(self._pos)]; if (hC && hC.cancelar) try { hC.cancelar(self._pos, self); } catch (eC) {} self._dica(); } },
        aoSub: function (sub) {
          limpar(); st.geoPr = null;
          if (sub === SUB) { self._dica(); return; }
          if (self._pos) self.cancelar();
        },
        redesenhar: function () { if (st.cur) desenhar(st.cur); },
        hint: function (t) { api.hint(t); },
        estado: function () { return { ativo: ativo(), tipo: self._pos ? self._pos.tipo : null, modo: self._pos ? modoPos(self._pos) : null, pts: self._pos ? self._pos.pts.length : 0, previa: grp.children.length, cur: st.cur, resumo: st.resumo || null, giro: self._pos ? self._pos.par.giro : null }; },
        telaDe: function (x, y, z) { return api.telaDe ? api.telaDe(x, y, z) : null; },
        _resolver: function (cx, cy) { var r = resolver({ clientX: cx, clientY: cy }); return r ? { p: r.p, tipo: r.sn ? r.sn.tipo : null } : null; }
      };
      this._3d = api3;
      return api3;
    }
  };

  global.MetalProntasUI = MetalProntasUI;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalProntasUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
