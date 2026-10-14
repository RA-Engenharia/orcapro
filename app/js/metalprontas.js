/* =====================================================================
 * metalprontas.js — METÁLICA & MECÂNICA: PEÇAS PRONTAS PARAMÉTRICAS
 * (motor PURO, ES5, sem DOM, Node-testável). 13/10/2026.
 *
 * Pedido do Rogério: "peças prontas paramétricas de estrutura metálica
 * para engenheiro civil, mecânico e arquiteto: o usuário escolhe o tipo,
 * digita poucas medidas, clica onde fica, e sai a estrutura inteira com
 * perfis do catálogo, editável depois."
 *
 * OS SEIS TIPOS (cada um gera um LOTE do editor — um Ctrl+Z desfaz tudo):
 *   trelica    treliça plana Howe, Pratt, Warren (com ou sem montantes);
 *              banzos paralelos, trapezoidal ou triangular; cantoneira
 *              simples ou DUPLA (2L, a gusset entre as duas), U ou tubo;
 *              nós com chapa gusset aparafusada (js/metalligacao.js);
 *   escada     reta, em L, em U (patamar) e caracol; longarinas em U ou
 *              chapa, degraus em chapa xadrez ou grade, espelho opcional,
 *              guarda-corpo e corrimão; degrau pelas regras do tipo ou
 *              Blondel (js/bimarq.js escadaCalc — o mesmo da escada da
 *              arquitetura, sem conta repetida);
 *   mezanino   retângulo por dois cantos, vãos nas duas direções, vigas
 *              principais e secundárias, pilares com placa de base, piso
 *              (grade, chapa xadrez ou steel deck), guarda-corpo nas bordas
 *              livres e contraventamento em X nos vãos de canto — pronto
 *              para o cálculo da estrutura desenhada (as pontas das barras
 *              coincidem nos nós: o pilar vai da base ao topo do aço e a
 *              viga tem o topo na linha que liga os topos dos pilares);
 *   rolamento  viga de rolamento de ponte rolante: viga + trilho + consoles
 *              nos pilares SELECIONADOS (só a geometria: o cálculo da ponte
 *              rolante NÃO entra — a tela avisa);
 *   rack       rack de tubulação: pórticos repetidos com N níveis de
 *              travessa, longarinas e contraventamento longitudinal;
 *   skid       base de equipamento: quadro de perfis U com travessas,
 *              chapa de piso e pontos de fixação (furos do equipamento).
 *
 * IDENTIDADE (o mesmo padrão do galpão, js/metalui.js): TODA peça criada
 * leva `caixa.pronta = id` (inclusive chapas e parafusos das ligações) e a
 * 1ª guarda `caixa.prontaInfo = { id, tipo, par, em, ref }`. "Editar" lê o
 * par, refaz NO LUGAR e manda apagar + criar num lote só. `ref` = o centro
 * da 1ª peça quando nasceu: se o conjunto foi movido, o refazer acompanha.
 *
 * PEÇAS ACESSÓRIAS (guarda-corpo, corrimão): levam `metal.acessorio` e um
 * `metal.lig` próprio ("gc-…"): o leitor do cálculo da estrutura desenhada
 * trata peça com `lig` como CONJUNTO de ligação, não como barra — o
 * guarda-corpo não vira pilar em balanço nem viga no modelo de cálculo.
 * Piso (chapa, grade, steel deck) é chapa: o leitor já não a lê como barra.
 *
 * COORDENADAS: cada peça pronta tem um referencial LOCAL (u ao longo, y para
 * cima, w de lado) com a origem no ponto clicado (x0, y0, z0) e o giro em
 * volta de +Y (graus, convenção do editor: X local → (cos θ, 0, −sen θ)).
 * Metros; ângulos em graus na tela.
 *
 * ⚠ NÃO DIMENSIONA: os perfis são os escolhidos (valores de PARTIDA). O
 *   peso da GRADE sai da geometria da grade (barra portante h × t a cada a,
 *   travessa s × s a cada b): valores de partida a conferir com o fabricante.
 *
 * API
 *   MetalProntas.TIPOS                 { id: { rotulo, cliques, PADRAO } }
 *   MetalProntas.padrao(tipo)          cópia do PADRAO
 *   MetalProntas.validar(tipo, par)    null | texto
 *   MetalProntas.gerar(tipo, par, novoId, ctx) → { ok, op (lote), pecas,
 *        contagem, resumo, avisos, linhas, par, medidas } | { ok:false, motivo }
 *        ctx = { pilares: [caixas] } (rolamento)
 *   MetalProntas.identidade(r, gid, info, alvo) marca o lote (e apaga o alvo)
 *   MetalProntas.prontas(caixas)       [{ id, tipo, pecas, info, n }]
 *   MetalProntas.retangulo(A, B, giro) dois cantos → { x0, z0, Lx, Lz }
 *   MetalProntas.gradeKgM2(par)        kg/m² da grade pela geometria
 *   MetalProntas.desenho(tipo)         SVG (texto) da dica ilustrada
 *   MetalProntas.esquema(r)            SVG (texto) da prévia do diálogo
 * Teste: node tools/test-metal-prontas.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function M() { return dep("BimMetal", "./metalpeca.js"); }
  function Lg() { return dep("BimMetalLig", "./metalligacao.js"); }
  function MC() { return dep("MetalCriar", "./metalcriar.js"); }
  function Aco() { return dep("PerfisAco", "./perfisaco.js"); }
  function Arq() { return dep("BimArq", "./bimarq.js"); }
  function Est() { return dep("BimEstrut", "./bimestrut.js"); }
  function Acs() { return dep("AcoAcessos", "./acoacessos.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function r2(v) { return Math.round(v * 100) / 100; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function br(v, c) { c = c == null ? 2 : c; return (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function cm(v) { return br(v * 100, 1); }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var l = len(a); return l > 1e-12 ? mul(a, 1 / l) : null; }
  function rotY(v, th) { var c = Math.cos(th), s = Math.sin(th); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; }
  var UP = [0, 1, 0], RHO = 7850, GRAU = Math.PI / 180;

  /* --------------------------------------------- alturas do guarda-corpo
   * guarda-corpo 1,10 m: o padrão do guarda-corpo do modelador (js/bimarq.js);
   * corrimão em duas alturas (0,92 e 0,70 m): o da rampa NBR 9050 do
   * js/bimestrut.js. Sem o js/bimestrut.js os números são os mesmos, marcados
   * "conferir na norma". */
  function alturasGuarda() {
    var E = Est(), n = E && E.NBR9050 && Array.isArray(E.NBR9050.corrimaos) ? E.NBR9050.corrimaos : null;
    return { guarda: 1.10, corrimaos: n ? n.slice() : [0.92, 0.70], fonte: n ? "corrimão nas alturas da NBR 9050 (js/bimestrut.js) — conferir na norma" : "conferir na norma (NBR 9050 / NBR 9077)" };
  }

  /* ================================================================ TIPOS */
  var TIPOS = {
    trelica: { id: "trelica", rotulo: "Treliça plana", cliques: 1, PADRAO: {
      tipo: "pratt", forma: "paralelos", vao: 12, altura: 1.2, alturaApoio: 0.5, paineis: 8,
      banzo: "L64X64X6.4", diagonal: "L51X51X4.8", montante: "L51X51X4.8", arranjo: "simples",
      ligacoes: true, tGusset: 0.0095, parafuso: "M16", parafusos: 2, aco: "ASTM A36",
      x0: 0, y0: 0, z0: 0, giro: 0 } },
    escada: { id: "escada", rotulo: "Escada metálica", cliques: 1, PADRAO: {
      forma: "reta", desnivel: 3.0, largura: 1.0, regra: "blondel", virar: "esquerda", vao: 0.10,
      longarina: "C200X17.1", longarinaTipo: "perfil", tLongarina: 0.0125, hLongarina: 0.25,
      degrau: "xadrez", tDegrau: 0.00635, espelho: false, tEspelho: 0.003,
      gradeH: 0.025, gradeT: 0.003, gradeA: 0.030, gradeB: 0.100, gradeS: 0.005,
      guarda: "dois", montante: "HSS73X5.2", corrimao: "HSS48.3X3.7", espac: 1.0,
      patamarPerfil: "C150X12.2", pilarete: "HSS76.2X76.2X6.4",
      raio: 0.9, mastro: "HSS168.3X7.1", raioLinha: 0.55, sentido: "anti-horario",
      norma: "", rodape: false, hRodape: 0.20, tRodape: 0.00475, patamarComp: 0, lanceMax: 0, paredeLados: 0, patamarTopo: 0, apoioBase: false, usoGuarda: "industrial", usoPiso: "escada-sem-publico",
      aco: "ASTM A36", x0: 0, y0: 0, z0: 0, giro: 0 } },
    mezanino: { id: "mezanino", rotulo: "Mezanino / plataforma", cliques: 2, PADRAO: {
      Lx: 6, Lz: 4, vaosX: 2, vaosZ: 1, altura: 3.0, direcao: "x",
      principal: "W250X25.3", secundaria: "W150X13", pilar: "W150X22.5", espSec: 1.5,
      piso: "xadrez", tPiso: 0.00635, tDeck: 0.0008, painelMax: 3.0,
      gradeH: 0.025, gradeT: 0.003, gradeA: 0.030, gradeB: 0.100, gradeS: 0.005,
      frente: true, fundo: true, esquerda: true, direita: true,
      montante: "HSS73X5.2", corrimao: "HSS48.3X3.7", espac: 1.0, travessas: 2,
      contraventar: true, contravento: "L51X51X4.8", placaBase: true,
      rodape: false, hRodape: 0.20, tRodape: 0.00475, intermediaria: 0, semPilares: false, abertura: "", aberturaPos: 0.5, aberturaLarg: 0.9, contraventoPlano: false,
      aco: "ASTM A572 Gr.50", x0: 0, y0: 0, z0: 0, giro: 0 } },
    rolamento: { id: "rolamento", rotulo: "Viga de rolamento", cliques: 1, pedeSelecao: true, PADRAO: {
      capacidade: 5, vaoPonte: 15, cotaTrilho: 0, excentricidade: 0.5,
      viga: "W310X38.7", console: "W250X32.7", trilhoB: 0.05, trilhoH: 0.03, lado: 1, pilares: [],
      aco: "ASTM A572 Gr.50", x0: 0, y0: 0, z0: 0, giro: 0 } },
    rack: { id: "rack", rotulo: "Rack de tubulação", cliques: 1, PADRAO: {
      porticos: 4, espacamento: 6, largura: 4, niveis: "3; 4,5",
      pilar: "W200X26.6", travessa: "W200X22.5", longarinas: true, longarina: "W150X13",
      contraventados: "extremos", contravento: "L64X64X6.4", placaBase: true,
      aco: "ASTM A572 Gr.50", x0: 0, y0: 0, z0: 0, giro: 0 } },
    skid: { id: "skid", rotulo: "Base de equipamento", cliques: 1, PADRAO: {
      comprimento: 3.0, largura: 1.5, folga: 0.1, perfil: "C150X12.2", travessa: "C150X12.2", espTravessas: 0.8,
      chapa: true, tChapa: 0.008, pontos: 4, entreFurosX: 2.6, entreFurosZ: 1.2, parafuso: "M16",
      aco: "ASTM A36", x0: 0, y0: 0, z0: 0, giro: 0 } }
  };
  var ORDEM = ["trelica", "escada", "mezanino", "rolamento", "rack", "skid"];
  var NUMS = { trelica: ["vao", "altura", "alturaApoio", "paineis", "tGusset", "parafusos"],
    escada: ["desnivel", "largura", "vao", "tLongarina", "hLongarina", "tDegrau", "tEspelho", "gradeH", "gradeT", "gradeA", "gradeB", "gradeS", "espac", "raio", "raioLinha", "hRodape", "tRodape", "patamarComp", "lanceMax", "paredeLados", "patamarTopo"],
    mezanino: ["Lx", "Lz", "vaosX", "vaosZ", "altura", "espSec", "tPiso", "tDeck", "painelMax", "gradeH", "gradeT", "gradeA", "gradeB", "gradeS", "espac", "travessas", "hRodape", "tRodape", "intermediaria", "aberturaPos", "aberturaLarg"],
    rolamento: ["capacidade", "vaoPonte", "cotaTrilho", "excentricidade", "trilhoB", "trilhoH", "lado"],
    rack: ["porticos", "espacamento", "largura"],
    skid: ["comprimento", "largura", "folga", "espTravessas", "tChapa", "pontos", "entreFurosX", "entreFurosZ"] };
  var BOOLS = { trelica: ["ligacoes"], escada: ["espelho", "rodape", "apoioBase"], mezanino: ["frente", "fundo", "esquerda", "direita", "contraventar", "placaBase", "rodape", "semPilares", "contraventoPlano"], rolamento: [], rack: ["longarinas", "placaBase"], skid: ["chapa"] };

  function padrao(tipo) { var T = TIPOS[tipo]; return T ? clone(T.PADRAO) : null; }
  function bool(v) { return !(v === false || v === "false" || v === 0 || v === "0" || v === "nao" || v === "não"); }
  /* o par completo (padrão + o que veio), com os números lidos (vírgula vale) */
  function normalizar(tipo, par) {
    var T = TIPOS[tipo]; if (!T) return null;
    var p = clone(T.PADRAO);
    Object.keys(par || {}).forEach(function (k) { if (par[k] != null && par[k] !== "") p[k] = clone(par[k]); });
    NUMS[tipo].concat(["x0", "y0", "z0", "giro"]).forEach(function (k) { p[k] = num(p[k], T.PADRAO[k]); });
    BOOLS[tipo].forEach(function (k) { p[k] = bool(p[k]); });
    return p;
  }
  function cat(nome) { var C = MC(); return C ? C.perfilCat(nome) : null; }
  function perfilDe(nome) { var c = cat(nome), A = Aco(); return c && A ? A.paraPerfil(c) : null; }
  function faltam(p, ks) { return ks.filter(function (k) { return !cat(p[k]); }).map(function (k) { return k + " = " + p[k]; }); }
  function lerNiveis(t) {
    var o = [];
    String(t == null ? "" : t).split(/[;\s]+/).forEach(function (s) { var v = num(s, NaN); if (fin(v) && v > 0.2) o.push(r4(v)); });
    o.sort(function (a, b) { return a - b; });
    return o.filter(function (v, i) { return i === 0 || v - o[i - 1] > 0.05; });
  }

  function validar(tipo, par) {
    var p = normalizar(tipo, par); if (!p) return "Tipo de peça pronta desconhecido: " + tipo + ".";
    var f = [];
    if (EXT[tipo]) {
      f = faltam(p, arr(EXT[tipo].perfis).filter(function (k) { return !EXT[tipo].perfisSe || EXT[tipo].perfisSe(p, k); }));
      if (f.length) return "Perfil não encontrado no catálogo: " + f.join(", ") + ".";
      return EXT[tipo].validar ? EXT[tipo].validar(p, ajudantes()) : null;
    }
    if (tipo === "trelica") {
      if (!(p.vao >= 2 && p.vao <= 40)) return "Vão da treliça entre 2 e 40 m.";
      if (!(p.altura >= 0.3 && p.altura <= 6)) return "Altura da treliça entre 0,30 e 6 m.";
      var n = Math.round(p.paineis); if (!(n >= 2 && n <= 40)) return "Número de painéis entre 2 e 40.";
      if (p.forma !== "paralelos" && n % 2) return "Treliça " + p.forma + ": o número de painéis tem de ser PAR (o meio é a cumeeira).";
      if (p.forma === "trapezoidal" && !(p.alturaApoio >= 0.15 && p.alturaApoio < p.altura)) return "Trapezoidal: a altura no apoio fica entre 0,15 m e a altura no meio.";
      if (["pratt", "howe", "warren", "warren-montantes"].indexOf(p.tipo) < 0) return "Tipo de treliça: Pratt, Howe, Warren ou Warren com montantes.";
      if (p.vao / n < 0.3) return "Painéis curtos demais (menos de 30 cm): diminua o número de painéis.";
      f = faltam(p, ["banzo", "diagonal", "montante"]);
      if (!f.length && p.arranjo === "dupla" && [p.banzo, p.diagonal, p.montante].some(function (k) { var q = perfilDe(k); return !q || q.forma !== "L"; })) return "Cantoneira dupla: os três perfis (banzo, diagonal, montante) têm de ser cantoneiras (L).";
    } else if (tipo === "escada") {
      if (["reta", "L", "U", "caracol", "patamares"].indexOf(p.forma) < 0) return "Escada: reta, reta com patamares, em L, em U ou caracol.";
      if (p.norma && !Acs()) return "As regras de acesso (js/acoacessos.js) não carregaram.";
      if (p.norma && Acs() && !Acs().REGRA_DEG[p.norma]) return "Norma da escada desconhecida: " + p.norma + ".";
      if (!(p.desnivel >= 0.5 && p.desnivel <= 8)) return "Desnível da escada entre 0,50 e 8 m.";
      if (!(p.largura >= 0.5 && p.largura <= 3)) return "Largura da escada entre 0,50 e 3 m.";
      if (p.forma === "caracol" && !(p.raio >= 0.5 && p.raio <= 2)) return "Caracol: raio externo entre 0,50 e 2 m.";
      var ks = ["montante", "corrimao"];
      if (p.forma === "caracol") ks.push("mastro"); else { if (p.longarinaTipo !== "chapa") ks.push("longarina"); if (p.forma !== "reta") ks.push("patamarPerfil", "pilarete"); }
      if (p.norma && p.forma !== "caracol") { var dg0 = Acs().degraus(p.desnivel, p.norma); if (!dg0.ok) return dg0.motivo; }
      f = faltam(p, ks);
      if (!f.length && p.longarinaTipo !== "chapa" && p.forma !== "caracol" && perfilDe(p.longarina).forma !== "U") return "Longarina em perfil: use um U (C, U Gerdau ou Ue) — ou escolha longarina em chapa.";
      if (p.forma === "caracol") { var mq = perfilDe(p.mastro); if (mq && (mq.D || mq.b || 0.1) / 2 >= p.raio - 0.3) return "Caracol: o mastro ocupa o degrau — aumente o raio."; if (!(p.raioLinha > (mq ? (mq.D || mq.b || 0.1) / 2 : 0.05) && p.raioLinha < p.raio)) return "Caracol: a linha de percurso fica entre o mastro e a borda."; }
    } else if (tipo === "mezanino") {
      if (!(p.Lx >= 1 && p.Lx <= 60 && p.Lz >= 1 && p.Lz <= 60)) return "Mezanino: cada lado entre 1 e 60 m (clique dois cantos opostos).";
      if (!(Math.round(p.vaosX) >= 1 && Math.round(p.vaosZ) >= 1 && p.vaosX <= 20 && p.vaosZ <= 20)) return "Vãos entre pilares: de 1 a 20 em cada direção.";
      if (!(p.altura >= 1.5 && p.altura <= 12)) return "Altura do mezanino (topo do aço) entre 1,50 e 12 m.";
      if (!(p.espSec >= 0.3 && p.espSec <= 6)) return "Espaçamento máximo das secundárias entre 0,30 e 6 m.";
      if (p.Lx / Math.round(p.vaosX) > 15 || p.Lz / Math.round(p.vaosZ) > 15) return "Vão entre pilares acima de 15 m: aumente o número de vãos.";
      f = faltam(p, ["principal", "secundaria", "pilar", "montante", "corrimao"].concat(p.contraventar ? ["contravento"] : []));
    } else if (tipo === "rolamento") {
      if (!(p.excentricidade >= 0.1 && p.excentricidade <= 3)) return "Distância do eixo do pilar ao eixo do trilho entre 0,10 e 3 m.";
      if (!(p.trilhoB >= 0.02 && p.trilhoB <= 0.2 && p.trilhoH >= 0.015 && p.trilhoH <= 0.25)) return "Trilho: largura de 2 a 20 cm e altura de 1,5 a 25 cm.";
      f = faltam(p, ["viga", "console"]);
    } else if (tipo === "rack") {
      if (!(Math.round(p.porticos) >= 2 && p.porticos <= 60)) return "Rack: de 2 a 60 pórticos.";
      if (!(p.espacamento >= 1 && p.espacamento <= 15)) return "Espaçamento dos pórticos entre 1 e 15 m.";
      if (!(p.largura >= 0.5 && p.largura <= 15)) return "Largura do pórtico entre 0,50 e 15 m.";
      var nv = lerNiveis(p.niveis); if (!nv.length) return "Níveis das travessas: alturas em metros separadas por ponto e vírgula (3; 4,5).";
      if (nv[nv.length - 1] > 20) return "Nível mais alto acima de 20 m.";
      f = faltam(p, ["pilar", "travessa"].concat(p.longarinas ? ["longarina"] : []).concat(p.contraventados !== "nenhum" ? ["contravento"] : []));
    } else if (tipo === "skid") {
      if (!(p.comprimento >= 0.3 && p.comprimento <= 20 && p.largura >= 0.3 && p.largura <= 8)) return "Equipamento: comprimento de 0,30 a 20 m e largura de 0,30 a 8 m.";
      if (!(p.folga >= 0 && p.folga <= 1)) return "Folga da base além do equipamento entre 0 e 1 m.";
      if (!(p.espTravessas >= 0.2 && p.espTravessas <= 3)) return "Espaçamento das travessas entre 0,20 e 3 m.";
      if (p.chapa && !(p.tChapa >= 0.003 && p.tChapa <= 0.05)) return "Chapa de piso entre 3 e 50 mm.";
      if ([0, 4, 6].indexOf(Math.round(p.pontos)) < 0) return "Pontos de fixação: 0, 4 ou 6.";
      if (Math.round(p.pontos) > 0 && (p.entreFurosX > p.comprimento + 2 * p.folga - 0.06 || p.entreFurosZ > p.largura + 2 * p.folga - 0.06)) return "A furação do equipamento passa da base.";
      f = faltam(p, ["perfil", "travessa"]);
      if (!f.length && perfilDe(p.perfil).forma !== "U") return "Quadro da base: use um perfil U (C, U Gerdau ou Ue).";
    }
    if (f.length) return "Perfil não encontrado no catálogo: " + f.join(", ") + ".";
    return null;
  }

  /* ============================================================ REFERENCIAL */
  function quadroLocal(P0, giroGraus) {
    var th = num(giroGraus, 0) * GRAU, O = [num(P0[0], 0), num(P0[1], 0), num(P0[2], 0)];
    var F = { O: O, th: th, giro: num(giroGraus, 0) };
    F.W = function (l) { return add(O, rotY(l, th)); };
    F.D = function (d) { return rotY(d, th); };
    /* um referencial-filho: origem local `o` e giro a mais (graus) */
    F.filho = function (o, gExtra) { return quadroLocal(F.W(o), F.giro + num(gExtra, 0)); };
    return F;
  }
  /* dois cantos → retângulo no referencial girado (origem no canto de menor u e w) */
  function retangulo(A, B, giro) {
    var th = num(giro, 0) * GRAU, d = rotY(sub([B[0], 0, B[2]], [A[0], 0, A[2]]), -th);
    var u0 = Math.min(0, d[0]), w0 = Math.min(0, d[2]), o = add([A[0], num(A[1], 0), A[2]], rotY([u0, 0, w0], th));
    return { x0: r4(o[0]), y0: r4(num(A[1], 0)), z0: r4(o[2]), Lx: r4(Math.abs(d[0])), Lz: r4(Math.abs(d[2])) };
  }

  /* ============================================================ CONSTRUTOR
   * K: as peças, as ops do lote, as linhas (prévia), a contagem e as ligações */
  function construtor(novoId, F, tipo) {
    var K = { pecas: [], ops: [], avisos: [], linhas: [], cont: {}, ligs: [], atual: {}, F: F, tipo: tipo };
    K.nova = function (cx, rot, conta) {
      if (!cx || cx.erro) { K.avisos.push((rot || "peça") + ": " + (cx ? cx.erro : "falhou")); return null; }
      cx.id = String(novoId()); K.pecas.push(cx); K.ops.push({ op: "criar", id: cx.id, caixa: cx }); K.atual[cx.id] = cx;
      if (conta) K.cont[conta] = (K.cont[conta] || 0) + 1;
      if (cx.metal && cx.metal.kind === "perfil") { var mb = M().membro(cx); if (mb) K.linhas.push({ a: mb.P0, b: add(mb.P0, mul(mb.X, mb.L)), p: cx.metal.papel }); }
      else if (cx.metal && cx.metal.kind === "chapa") K.linhas = K.linhas.concat(contornoMundo(cx));
      return cx;
    };
    /* barra pela LINHA (receita do js/metalcriar.js: o cálculo lê a linha) */
    K.barra = function (aL, bL, o, conta) {
      var q = {}; Object.keys(o || {}).forEach(function (k) { q[k] = o[k]; });
      var a = K.F.W(aL), b = K.F.W(bL), vert = Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[2] - b[2]) < 1e-9;
      if (vert) q.giro = num(q.giro, 0) + K.F.giro;   /* pilar: a alma acompanha o giro do conjunto */
      return K.nova(MC().barra(a, b, q), q.nome || q.papel, conta);
    };
    /* perfil e chapa pelo referencial local */
    K.perfil = function (o, conta) {
      var q = {}; Object.keys(o).forEach(function (k) { q[k] = o[k]; });
      q.origem = K.F.W(o.origem); q.ex = K.F.D(o.ex); q.ey = K.F.D(o.ey);
      return K.nova(M().perfil(q), o.nome || o.papel, conta);
    };
    K.chapa = function (o, conta) {
      var q = {}; Object.keys(o).forEach(function (k) { q[k] = o[k]; });
      q.origem = K.F.W(o.origem); q.ex = K.F.D(o.ex); q.ey = K.F.D(o.ey);
      return K.nova(M().chapa(q), o.nome || o.papel, conta);
    };
    /* ligação padrão (lote dentro do lote) — o mesmo mecanismo do js/metalgalpao.js */
    K.cur = function (q) { return q && q.id != null && K.atual[q.id] ? K.atual[q.id] : q; };
    K.ligar = function (tipoL, sel, parL) {
      var L = Lg(); if (!L) { K.avisos.push("As ligações (js/metalligacao.js) não carregaram."); return null; }
      var lid = String(novoId()), pr = {}; Object.keys(parL || {}).forEach(function (k) { pr[k] = parL[k] && parL[k].tipo ? K.cur(parL[k]) : parL[k]; }); pr.lig = lid;
      var r = L.aplicar(tipoL, sel.map(K.cur), pr);
      K.ligs.push({ tipo: tipoL, ok: r.ok, resumo: r.ok ? r.resumo : r.motivo, avisos: r.ok ? r.avisos : [] });
      if (!r.ok) { K.avisos.push(L.MACROS[tipoL].rotulo + ": " + r.motivo); return null; }
      var lote = L.ops(r, novoId);
      lote.ops.forEach(function (o) {
        K.ops.push(o);
        if (o.op === "criar") { o.caixa.id = o.id; if (K.atual[o.id]) { K.atual[o.id] = clone(o.caixa); } else if (o.caixa.metal && o.caixa.metal.kind !== "parafuso") K.linhas = K.linhas.concat(contornoMundo(o.caixa)); }
        if (o.op === "metalFuros" && K.atual[o.id]) { var q = K.atual[o.id]; q.metalFuros = arr(q.metalFuros).filter(function (f) { return f.lig !== o.lig; }).concat(o.furos.map(function (f) { var h = clone(f); h.lig = o.lig; return h; })); }
      });
      return lote;
    };
    return K;
  }
  /* o contorno de uma chapa no mundo (para a prévia) */
  function contornoMundo(c) {
    var out = []; try {
      M().solidos(c).forEach(function (s) { var n = s.poli.length; for (var i = 0; i < n; i++) { var q = s.poli[i], r = s.poli[(i + 1) % n]; out.push({ a: s.ponto(q[0], q[1], s.z0), b: s.ponto(r[0], r[1], s.z0), p: "chapa" }); } });
    } catch (e) {}
    return out;
  }
  /* o corte da ponta (graus, na alma e na aba) para o plano de normal nc */
  function corteDe(X, Y, nc) {
    var Z = cross(X, Y), kx = dot(nc, X); if (Math.abs(kx) < 1e-6) return { alma: 0, aba: 0 };
    var cl = function (g) { return Math.max(-75, Math.min(75, g)); };
    return { alma: cl(Math.atan(-dot(nc, Y) / kx) / GRAU), aba: cl(Math.atan(-dot(nc, Z) / kx) / GRAU) };
  }
  /* GRADE (piso gradeado): kg/m² pela geometria — barras portantes h × t a cada a e travessas s × s a cada b */
  function gradeKgM2(p) {
    var h = num(p.gradeH, 0.025), t = num(p.gradeT, 0.003), a = num(p.gradeA, 0.03), b = num(p.gradeB, 0.1), s = num(p.gradeS, 0.005);
    if (!(a > 0 && b > 0)) return 0;
    return r2(RHO * (h * t / a + s * s / b));
  }
  /* a chapa que representa a grade: espessura = a altura da barra portante; o PESO é o da grade (kg/m² × área) */
  function aplicarGrade(c, p) {
    if (!c || !c.metal) return c;
    var kg = gradeKgM2(p), A = c.metal.dim ? num(c.metal.dim.areaLiq, 0) : 0, ms = r4(kg * A);
    c.metal.grade = { h: num(p.gradeH, 0.025), t: num(p.gradeT, 0.003), a: num(p.gradeA, 0.03), b: num(p.gradeB, 0.1), s: num(p.gradeS, 0.005), kgm2: kg, partida: true };
    c.metal.papel = "Piso em grade";
    c.massa = ms; c.volume = r4(ms / RHO * 1e2) / 1e2;
    c.medidas = c.medidas || {}; c.medidas.massa = ms; c.medidas.volume = c.volume;
    return c;
  }

  /* guarda-corpo (montantes + travessas/corrimãos) ao longo de um caminho LOCAL
   * pts = [[u, y, w]…] a linha de BASE (onde o montante nasce); alturas: as travessas
   * (acima da base); os montantes nas pontas e a no máximo `espac` ao longo do caminho */
  function guardaCorpo(K, pts, o) {
    var lig = "gc-" + o.gid, pm = perfilDe(o.montante), pc = perfilDe(o.corrimao), Hg = o.altura, sgs = [];
    if (!pm || !pc || pts.length < 2) return 0;
    var n0 = K.pecas.length, posts = [];
    for (var i = 0; i + 1 < pts.length; i++) {
      var a = pts[i], b = pts[i + 1], d = sub(b, a), Lh = Math.sqrt(d[0] * d[0] + d[2] * d[2]), L = len(d); if (!(L > 0.05)) continue;
      var nS = Math.max(1, Math.ceil(L / o.espac - 1e-9));
      for (var k = 0; k <= nS; k++) { if (k === 0 && i > 0) continue; posts.push(add(a, mul(d, k / nS))); }
      sgs.push({ a: a, b: b, Lh: Lh });
    }
    posts.forEach(function (P, k) {
      K.perfil({ origem: P, ex: UP, ey: [1, 0, 0], perfil: pm, L: Hg, papel: "Montante do guarda-corpo", ifc: "IFCMEMBER", aco: o.aco || "ASTM A36", lig: lig, nome: "Montante do guarda-corpo " + (k + 1) }, "guarda");
    });
    o.alturas.forEach(function (h) {
      sgs.forEach(function (s, j) {
        var A = add(s.a, [0, h, 0]), B = add(s.b, [0, h, 0]), u = unit(sub(B, A)); if (!u) return;
        var ey = Math.abs(u[1]) > 0.99 ? [1, 0, 0] : UP;
        K.perfil({ origem: A, ex: u, ey: ey, perfil: pc, L: len(sub(B, A)), papel: Math.abs(h - Hg) < 1e-6 ? "Travessa superior do guarda-corpo" : (o.corrimao2 && o.corrimao2.indexOf(h) >= 0 ? "Corrimão" : "Travessa do guarda-corpo"),
          ifc: "IFCRAILING", aco: o.aco || "ASTM A36", lig: lig, nome: (Math.abs(h - Hg) < 1e-6 ? "Guarda-corpo" : "Corrimão") + " a " + br(h) + " m — trecho " + (j + 1) }, "guarda");
      });
    });
    /* RODAPÉ (NR-12, Anexo III, 7 e — js/metalacessos.js, 14/10/2026): chapa ao longo de cada trecho, do piso para cima */
    if (o.rodape > 0) sgs.forEach(function (s, j) {
      var u = unit(sub(s.b, s.a)); if (!u) return;
      var ey = unit(sub(UP, mul(u, dot(u, UP)))) || UP, Lr = len(sub(s.b, s.a));
      K.chapa({ origem: s.a, ex: u, ey: ey, t: num(o.tRodape, 0.00475), ret: { L: Lr, B: o.rodape }, papel: "Rodapé", aco: o.aco || "ASTM A36", lig: lig, nome: "Rodapé — trecho " + (j + 1) }, "rodape");
    });
    for (var q = n0; q < K.pecas.length; q++) K.pecas[q].metal.acessorio = "guarda-corpo";
    return K.pecas.length - n0;
  }

  /* ============================================================== TRELIÇA */
  function trelica(p, K, novoId) {
    var pb = perfilDe(p.banzo), pd = perfilDe(p.diagonal), pm = perfilDe(p.montante);
    var n = Math.round(p.paineis), L = p.vao, H = p.altura, h0 = p.forma === "trapezoidal" ? p.alturaApoio : (p.forma === "triangular" ? 0 : H);
    function ht(x) { return p.forma === "paralelos" ? H : h0 + (H - h0) * (1 - Math.abs(2 * x / L - 1)); }
    var xs = []; for (var i = 0; i <= n; i++) xs.push(L * i / n);
    var dupla = p.arranjo === "dupla" && [pb, pd, pm].every(function (q) { return q.forma === "L"; });
    var comGusset = p.ligacoes && [pb, pd, pm].every(function (q) { return q.forma === "L" || q.forma === "U"; });
    var tG = num(p.tGusset, 0.0095);
    function off(perf) { return perf.forma === "L" ? perf.b / 2 : (perf.forma === "U" ? perf.bf / 2 : 0); }
    var nos = {}, barras = [];
    function chave(t, i2) { return t === "T" && ht(xs[i2]) < 1e-6 ? "B" + i2 : t + i2; }
    function P(t, i2) { return [xs[i2], t === "T" ? ht(xs[i2]) : 0, 0]; }
    function no(k) { return nos[k] || (nos[k] = { k: k, barras: [] }); }
    function barra(ka, kb, Pa, Pb, perf, papel, conta, passa) {
      var d = sub(Pb, Pa), Lb = len(d); if (!(Lb > 0.05)) return null;
      var u = mul(d, 1 / Lb), ey = cross([0, 0, 1], u), w = off(perf);
      var cx = K.perfil({ origem: [Pa[0], Pa[1], w], ex: u, ey: ey, perfil: perf, L: Lb, papel: papel, ifc: "IFCMEMBER", aco: p.aco, nome: papel + " " + (barras.length + 1) }, conta);
      if (!cx) return null;
      var b = { cx: cx, perf: perf, papel: papel }; barras.push(b);
      no(ka).barras.push(b); no(kb).barras.push(b); (passa || []).forEach(function (k) { no(k).barras.push(b); });
      return b;
    }
    /* BANZOS: em trechos de no máximo 12 m, partidos nos nós (o superior sempre na cumeeira) */
    function banzo(t, i0, i1) {
      var Lt = len(sub(P(t, i1), P(t, i0))), k = Math.max(1, Math.ceil(Lt / 12 - 1e-9)), cortes = [i0];
      for (var j = 1; j < k; j++) cortes.push(i0 + Math.round((i1 - i0) * j / k));
      cortes.push(i1);
      for (var c = 0; c + 1 < cortes.length; c++) {
        var a = cortes[c], b = cortes[c + 1], passa = []; if (b <= a) continue;
        for (var m = a + 1; m < b; m++) passa.push(chave(t, m));
        barra(chave(t, a), chave(t, b), P(t, a), P(t, b), pb, t === "T" ? "Banzo superior" : "Banzo inferior", "banzos", passa);
      }
    }
    banzo("B", 0, n);
    if (p.forma === "paralelos") banzo("T", 0, n); else { banzo("T", 0, n / 2); banzo("T", n / 2, n); }
    /* MONTANTES */
    for (var i3 = 0; i3 <= n; i3++) {
      var h = ht(xs[i3]); if (h < 0.15) continue;
      if (p.tipo === "warren" && i3 > 0 && i3 < n) continue;
      barra(chave("B", i3), chave("T", i3), P("B", i3), P("T", i3), pm, "Montante", "montantes");
    }
    /* DIAGONAIS — Pratt: descem para o meio (tracionadas com a carga de gravidade); Howe: sobem para o meio;
       Warren: alternadas */
    for (var j3 = 0; j3 < n; j3++) {
      var esq = (xs[j3] + xs[j3 + 1]) / 2 < L / 2, a, b;
      if (p.tipo === "pratt") { a = esq ? ["T", j3] : ["B", j3]; b = esq ? ["B", j3 + 1] : ["T", j3 + 1]; }
      else if (p.tipo === "howe") { a = esq ? ["B", j3] : ["T", j3]; b = esq ? ["T", j3 + 1] : ["B", j3 + 1]; }
      else { var sobe = j3 % 2 === 0; if (p.forma !== "paralelos" && !esq) sobe = !sobe; a = sobe ? ["B", j3] : ["T", j3]; b = sobe ? ["T", j3 + 1] : ["B", j3 + 1]; }
      var Pa = P(a[0], a[1]), Pb = P(b[0], b[1]);
      if (Math.abs(Pa[1] - Pb[1]) < 0.05) continue;   /* deitada sobre o banzo (ponta da triangular): não existe */
      barra(chave(a[0], a[1]), chave(b[0], b[1]), Pa, Pb, pd, "Diagonal", "diagonais");
    }
    /* NÓS com chapa gusset aparafusada */
    var nNos = 0;
    if (comGusset) {
      Object.keys(nos).forEach(function (k) {
        var bs = nos[k].barras; if (bs.length < 2) return;
        var naoPar = false;
        for (var x = 0; x < bs.length && !naoPar; x++) for (var y = x + 1; y < bs.length; y++) { var mx = M().membro(K.cur(bs[x].cx)), my = M().membro(K.cur(bs[y].cx)); if (mx && my && len(cross(mx.X, my.X)) > 0.05) { naoPar = true; break; } }
        if (!naoPar) { K.avisos.push("Emenda do banzo no nó " + k + ": a detalhar (cobrejunta ou solda)"); return; }
        /* o banzo primeiro (a chapa toma o plano dele) */
        var ord = bs.slice().sort(function (q1, q2) { return (/Banzo/.test(q1.papel) ? 0 : 1) - (/Banzo/.test(q2.papel) ? 0 : 1); });
        if (K.ligar("noTrelica", ord.map(function (q) { return q.cx; }), { t: tG, parafuso: p.parafuso, parafusos: p.parafusos })) nNos++;
      });
    } else if (p.ligacoes) K.avisos.push("Treliça de tubo: nós soldados direto (sem chapa) — detalhar a solda");
    /* CANTONEIRA DUPLA: a segunda cantoneira de cada barra é o ESPELHO da primeira pelo plano do meio da gusset
       (os furos vão junto); os parafusos ganham a espessura da segunda cantoneira no aperto */
    var nDup = 0;
    if (dupla) {
      var Q = K.F.W([0, 0, -tG / 2]), nW = K.F.D([0, 0, 1]);
      var R = function (P2) { return sub(P2, mul(nW, 2 * dot(sub(P2, Q), nW))); }, Rd = function (d) { return sub(d, mul(nW, 2 * dot(d, nW))); };
      barras.slice().forEach(function (b) {
        var c = K.cur(b.cx), m = c.metal, q = M().quadro(c), Lb = num(m.L, 0), xr = num(m.xRef, 0);
        var furos = M().furosDe(c).map(function (f) { var h = clone(f); h.x = r4(Lb + xr - num(f.x, 0)); delete h.lig; return h; });
        var tw = M().perfil({ origem: add(R(q.O), mul(Rd(q.X), Lb)), ex: mul(Rd(q.X), -1), ey: Rd(q.Y), perfil: m.perfil, L: Lb, furos: furos, papel: m.papel, ifc: "IFCMEMBER", aco: m.aco, nome: (m.nome || m.papel) + " (2ª cantoneira)" });
        if (K.nova(tw, "2ª cantoneira")) nDup++;
      });
      /* o aperto dos parafusos dos nós: + a espessura da 2ª cantoneira */
      K.ops.forEach(function (o, ix) {
        if (o.op !== "criar" || !o.caixa || !o.caixa.metal || o.caixa.metal.kind !== "parafuso") return;
        var pz = o.caixa.metal, qz = M().quadro(o.caixa), tL = 0;
        barras.forEach(function (b) { if (tL) return; var mb = M().membro(K.cur(b.cx)); if (mb && M().furosDoEixo(mb, qz.O, qz.X, 0, num(pz.aperto, 0), 0.003).length) tL = num(b.perf.t, 0); });
        if (!tL) return;
        var nv = M().parafuso({ origem: qz.O, eixo: qz.X, aperto: num(pz.aperto, 0) + tL, id: pz.id, classe: pz.classe, arrCabeca: pz.arrCabeca, arrPorca: pz.arrPorca, lig: pz.lig });
        if (nv.erro) return; nv.id = o.id; K.ops[ix] = { op: "criar", id: o.id, caixa: nv };
      });
    }
    var cont = K.cont;
    return { resumo: "Treliça " + ({ pratt: "Pratt", howe: "Howe", warren: "Warren", "warren-montantes": "Warren com montantes" })[p.tipo] + " " + p.forma + " — vão " + br(L) + " m, altura " + br(H) + " m, " + n + " painéis: " +
      (cont.banzos || 0) + " banzos, " + (cont.diagonais || 0) + " diagonais, " + (cont.montantes || 0) + " montantes" + (dupla ? " (cantoneira dupla: +" + nDup + " cantoneiras)" : "") + (nNos ? ", " + nNos + " nós com gusset" : ""),
      medidas: { paineis: n, nos: Object.keys(nos).length, nosGusset: nNos, dupla: dupla, alturaMeio: ht(L / 2), alturaApoio: ht(0) } };
  }

  /* =============================================================== ESCADA */
  function escada(p, K, novoId) {
    var A = Arq(); if (!A || !A.escadaCalc) return { erro: "As regras da escada (js/bimarq.js) não carregaram." };
    var W = p.largura, G = alturasGuarda(), gid = String(novoId()), AC = p.norma && p.forma !== "caracol" ? Acs() : null, dgN = null, calc;
    if (AC) {
      /* degrau pela NORMA do acesso (js/acoacessos.js, 14/10/2026): NR-12 (industrial), NBR 9050 (rota acessível), NBR 9077 (emergência) */
      dgN = AC.degraus(p.desnivel, p.norma); if (!dgN.ok) return { erro: dgN.motivo };
      calc = { ok: true, n: dgN.n, e: dgN.e, p: dgN.p, blondel: dgN.blondel, regra: p.norma, avisos: [] };
    } else calc = A.escadaCalc(p.desnivel, { regra: p.regra === "blondel" ? "blondel" : "tipo", largura: p.forma === "caracol" ? null : W });
    if (!calc.ok) return { erro: calc.motivo };
    var n = calc.n, e = calc.e, pp = calc.p, al = Math.atan(e / pp), ca = Math.cos(al);
    calc.avisos.forEach(function (a) { K.avisos.push(a); });
    var degXadrez = p.degrau !== "grade", tD = degXadrez ? num(p.tDegrau, 0.00635) : num(p.gradeH, 0.025), tAuto = null;
    /* escada COM norma de acesso e degrau de chapa: a espessura sai da verificação (flexão e flecha), não do padrão */
    if (dgN && degXadrez && Acs() && Acs().espessuraDegrau && p.tDegrauAuto !== false && p.forma !== "caracol") {
      var esD = Acs().espessuraDegrau(W, pp);
      if (esD.ok) { tAuto = esD.t; tD = esD.t; K.avisos.unshift("Degrau em chapa: " + br(tD * 1000, 2) + " mm escolhida para passar a flexão (2,5 kN) e a flecha (W/300) com " + br(W) + " m de largura"); }
      else K.avisos.unshift("SUGESTÃO: degrau em GRADE — " + esD.motivo);
    }
    var longU = p.longarinaTipo !== "chapa", pl = longU ? perfilDe(p.longarina) : null;
    var dL = longU ? pl.d : num(p.hLongarina, 0.25), bL = longU ? pl.bf : num(p.tLongarina, 0.0125);
    var alt = [G.guarda].concat(G.corrimaos), gOpt = function (gid2) { return { gid: gid2, montante: p.montante, corrimao: p.corrimao, altura: G.guarda, alturas: alt, corrimao2: G.corrimaos, espac: p.espac, aco: p.aco, rodape: p.rodape ? num(p.hRodape, 0.2) : 0, tRodape: p.tRodape }; };
    var prolonga = p.norma === "nbr9050" ? 0.30 : 0, corrInterm = false;
    var lados = p.guarda === "nenhum" ? [] : (p.guarda === "um" ? [1] : [1, -1]);
    var nLance = 0;
    function degrauChapa(F, o, rot) {
      var KK = K.F; K.F = F;
      var c = K.chapa(o, "degraus"); K.F = KK;
      if (c && !degXadrez) aplicarGrade(c, p);
      if (c) c.metal.papel = degXadrez ? (rot || "Degrau em chapa xadrez") : "Degrau em grade";
      return c;
    }
    /* UM LANCE no referencial F (u sobe, origem no pé do 1º espelho, no meio da largura; y0 = 0) */
    function lance(F, nR, guardaLados) {
      nLance++;
      var Fk = K.F; K.F = F;
      var uTop = (nR - 1) * pp;
      for (var k = 1; k < nR; k++) {
        degrauChapa(F, { origem: [(k - 1) * pp, k * e, -W / 2], ex: [1, 0, 0], ey: [0, 0, 1], t: tD, ret: { L: pp, B: W }, papel: "Degrau", aco: p.aco, nome: "Degrau " + k + " — lance " + nLance });
        if (p.espelho && k * e - tD - (k - 1) * e > 0.02) K.chapa({ origem: [(k - 1) * pp, (k - 1) * e, -W / 2], ex: [0, 1, 0], ey: [0, 0, 1], t: num(p.tEspelho, 0.003), ret: { L: e - tD, B: W }, papel: "Espelho", aco: p.aco, nome: "Espelho " + k + " — lance " + nLance }, "espelhos");
      }
      /* LONGARINAS: o topo na linha dos bocéis; corte horizontal no pé e de prumo no topo */
      var X = [Math.cos(al), Math.sin(al), 0], Y = [-Math.sin(al), Math.cos(al), 0];
      var yEixo = function (u) { return e + e / pp * u - dL / (2 * ca); };
      var uA = (dL / (2 * ca) - e) * pp / e, Pa = [uA, 0, 0], Pb = [uTop, yEixo(uTop), 0], Ll = len(sub(Pb, Pa));
      [1, -1].forEach(function (s) {
        if (longU) {
          var w = s * (W / 2 + pl.bf / 2), org = s > 0 ? [Pa[0], Pa[1], w] : [Pb[0], Pb[1], w], ex = s > 0 ? X : mul(X, -1);
          var cIni = corteDe(ex, Y, s > 0 ? UP : [1, 0, 0]), cFim = corteDe(ex, Y, s > 0 ? [1, 0, 0] : UP);
          K.perfil({ origem: org, ex: ex, ey: Y, perfil: pl, L: Ll, cortes: { almaIni: cIni.alma, almaFim: cFim.alma }, papel: "Longarina", ifc: "IFCMEMBER", aco: p.aco, nome: "Longarina " + (s > 0 ? "esquerda" : "direita") + " — lance " + nLance }, "longarinas");
          /* APOIO DA LONGARINA no piso (1º lance): chapa chumbada com 2 furos, debaixo do corte horizontal do pé */
          if (p.apoioBase && nLance === 1) K.chapa({ origem: [Pa[0] - 0.05, 0, w - 0.10], ex: [1, 0, 0], ey: [0, 0, 1], t: 0.0125, ret: { L: 0.25, B: 0.20 }, furos: [{ u: 0.18, v: 0.05, db: 18, tipo: "padrao" }, { u: 0.18, v: 0.15, db: 18, tipo: "padrao" }], papel: "Chapa de apoio da longarina", aco: "ASTM A36", nome: "Chapa de apoio da longarina " + (s > 0 ? "esquerda" : "direita") }, "apoios");
        } else {
          var hL = dL, u0 = -pp, u1 = (hL / ca - e) * pp / e, yLo = function (u) { return e + e / pp * u - hL / ca; };
          var C = [[u0, 0], [u1, 0], [uTop, yLo(uTop)], [uTop, e + e / pp * uTop]];
          K.chapa({ origem: [0, 0, s > 0 ? W / 2 : -W / 2 - bL], ex: [1, 0, 0], ey: UP, t: bL, contorno: C, papel: "Longarina em chapa", aco: p.aco, nome: "Longarina em chapa " + (s > 0 ? "esquerda" : "direita") + " — lance " + nLance }, "longarinas");
        }
      });
      /* GUARDA-CORPO sobre a longarina, paralelo aos bocéis */
      (guardaLados || []).forEach(function (s) {
        var w = s * (W / 2 + bL / 2), uS = 0.1, uE = uTop - 0.1;
        if (uE - uS < 0.2) return;
        /* NBR 9050: o corrimão passa 0,30 m do 1º e do último bocel, na horizontal */
        var cam = prolonga > 0 ? [[-pp - prolonga, 0, w], [-pp, 0, w], [uTop, nR * e, w], [uTop + prolonga, nR * e, w]] : [[uS, e + e / pp * uS, w], [uE, e + e / pp * uE, w]];
        guardaCorpo(K, cam, gOpt(gid + "-" + nLance + (s > 0 ? "e" : "d")));
      });
      /* CORRIMÃO INTERMEDIÁRIO (NBR 9050, 6.9.4): largura acima de 2,40 m → corrimão no meio, nas duas alturas */
      if (p.norma === "nbr9050" && W > 2.40 + 1e-9) {
        var n0c = K.pecas.length;
        guardaCorpo(K, [[-pp - prolonga, 0, 0], [-pp, 0, 0], [uTop, nR * e, 0], [uTop + prolonga, nR * e, 0]], { gid: gid + "-ci" + nLance, montante: p.corrimao, corrimao: p.corrimao, altura: G.corrimaos[0], alturas: G.corrimaos.slice(), corrimao2: G.corrimaos.slice(), espac: Math.max(p.espac, 1.5), aco: p.aco });
        for (var qc = n0c; qc < K.pecas.length; qc++) K.pecas[qc].metal.papel = /Montante/.test(K.pecas[qc].metal.papel) ? "Montante do corrimão intermediário" : "Corrimão intermediário";
        corrInterm = true;
      }
      K.F = Fk;
      return { uTop: uTop, yTopo: nR * e };
    }
    /* PATAMAR: quadro de U, chapa por cima (topo no nível), pilaretes nos cantos de fora, guarda-corpo nas bordas de fora */
    function patamar(u0, u1, w0, w1, y, cantos, bordas) {
      var pq = perfilDe(p.patamarPerfil), pr = perfilDe(p.pilarete), yV = y - tD;
      [[u0, w0, u1, w0], [u1, w1, u0, w1], [u0, w1, u0, w0], [u1, w0, u1, w1]].forEach(function (s, i) {
        K.barra([s[0], yV, s[1]], [s[2], yV, s[3]], { ferr: "viga", cat: pq ? pq.cat : p.patamarPerfil, just: "topo", lado: "esquerda", papel: "Viga do patamar", aco: p.aco, nome: "Viga do patamar " + (i + 1) }, "patamar");
      });
      var c = degrauChapa(K.F, { origem: [u0, y, w0], ex: [1, 0, 0], ey: [0, 0, 1], t: tD, ret: { L: u1 - u0, B: w1 - w0 }, papel: "Piso do patamar", aco: p.aco, nome: "Piso do patamar" }, "Piso do patamar em chapa xadrez");
      if (c) c.metal.papel = degXadrez ? "Piso do patamar em chapa xadrez" : "Piso do patamar em grade";
      var yB = yV - (pq ? pq.d : 0.15);
      cantos.forEach(function (q, i) { K.barra([q[0], 0, q[1]], [q[0], yB, q[1]], { ferr: "pilar", cat: pr ? pr.cat : p.pilarete, papel: "Pilarete do patamar", aco: p.aco, nome: "Pilarete do patamar " + (i + 1) }, "pilaretes"); });
      if (p.guarda !== "nenhum") bordas.forEach(function (b, i) { guardaCorpo(K, [[b[0], y, b[1]], [b[2], y, b[3]]], gOpt(gid + "-pt" + i)); });
    }
    var F0 = K.F, info = {}, nLances = 1, hLanceMax = p.desnivel, patC = 0, patL = 0;
    if (p.forma === "reta") {
      info = lance(F0, n, lados);
    } else if (p.forma === "patamares") {
      /* RETA COM PATAMARES (14/10/2026): lances em série com plataforma de descanso entre eles, no limite de altura
         por lance da norma (NR-12 3,00 m; NBR 9050 3,20 m; NBR 9077 3,70 m — ou o digitado) */
      var hMax = p.lanceMax > 0 ? p.lanceMax : (p.norma === "nbr9050" ? 3.20 : (p.norma === "emergencia" ? 3.70 : 3.00));
      var nL = Math.max(1, Math.ceil(p.desnivel / hMax - 1e-9));
      while (nL < n && Math.ceil(n / nL) * e > hMax + 1e-9) nL++;
      var nBase = Math.floor(n / nL), resto = n % nL, Lp = p.patamarComp > 0 ? p.patamarComp : Math.max(W, p.norma === "nbr9050" ? 1.20 : (p.norma === "emergencia" ? 1.10 : 0.80));
      if (nBase < 2) return { erro: "Lances curtos demais (menos de 2 espelhos): aumente a altura máxima por lance ou use a escada reta." };
      var uC = 0, yC = 0;
      hLanceMax = 0;
      for (var iL = 0; iL < nL; iL++) {
        var nR = nBase + (iL < resto ? 1 : 0), li = lance(F0.filho([uC, yC, 0], 0), nR, lados);
        yC += nR * e; hLanceMax = Math.max(hLanceMax, nR * e);
        if (iL < nL - 1) {
          var ua = uC + li.uTop, ub = ua + Lp;
          patamar(ua, ub, -W / 2, W / 2, yC, [[ua, -W / 2], [ua, W / 2], [ub, -W / 2], [ub, W / 2]], lados.map(function (sg2) { return [ua, sg2 * W / 2, ub, sg2 * W / 2]; }));
          uC = ub;
        } else uC += li.uTop;
      }
      nLances = nL; patC = Lp; patL = W;
      info = { uTop: uC, yTopo: n * e };
    }
    /* PATAMAR SUPERIOR (opcional, reta e com patamares): a chegada no nível de cima, com guarda-corpo nos lados */
    if ((p.forma === "reta" || p.forma === "patamares") && p.patamarTopo > 0.2) {
      var uT0 = info.uTop, uT1 = uT0 + p.patamarTopo, yT = n * e;
      patamar(uT0, uT1, -W / 2, W / 2, yT, [[uT1, -W / 2], [uT1, W / 2]], lados.map(function (sg3) { return [uT0, sg3 * W / 2, uT1, sg3 * W / 2]; }));
    }
    if (p.forma === "reta" || p.forma === "patamares") {
      /* (nada: os ramos acima já montaram) */
    } else if (p.forma === "L" || p.forma === "U") {
      var n1 = Math.ceil(n / 2), n2 = n - n1;
      if (n2 < 2) return { erro: "Desnível pequeno para escada em " + p.forma + ": use a reta." };
      var esqV = p.virar !== "direita", sg = esqV ? 1 : -1, y1 = n1 * e;
      nLances = 2; hLanceMax = Math.max(n1, n2) * e; patC = W; patL = p.forma === "U" ? 2 * W + p.vao : W;
      var l1 = lance(F0, n1, lados.length === 2 ? [1, -1] : (lados.length ? [-sg] : []));
      if (p.forma === "L") {
        var uL = l1.uTop + W;
        /* lance 2 sai pela borda do patamar do lado da virada, subindo para +w (esquerda) ou −w (direita) */
        var F2 = F0.filho([l1.uTop + W / 2, y1, sg * W / 2], -sg * 90);
        lance(F2, n2, lados.length === 2 ? [1, -1] : (lados.length ? [sg > 0 ? -1 : 1] : []));
        patamar(l1.uTop, uL, -W / 2, W / 2, y1, [[uL, -sg * W / 2]], [[uL, -sg * W / 2, uL, sg * W / 2], [l1.uTop, -sg * W / 2, uL, -sg * W / 2]]);
      } else {
        var Wp = W, wFar = sg * (W / 2 + p.vao + W), uP = l1.uTop + Wp;
        var F3 = F0.filho([l1.uTop, y1, sg * (W + p.vao)], 180);
        lance(F3, n2, lados.length === 2 ? [1, -1] : (lados.length ? [sg > 0 ? -1 : 1] : []));
        var wa = Math.min(-sg * W / 2, wFar), wb = Math.max(-sg * W / 2, wFar);
        patamar(l1.uTop, uP, wa, wb, y1, [[uP, wa], [uP, wb]], [[uP, wa, uP, wb], [l1.uTop, wa, uP, wa], [l1.uTop, wb, uP, wb]]);
      }
      info = { uTop: l1.uTop, yTopo: n * e };
    } else {
      /* CARACOL: mastro no centro, degraus em setor soldados no mastro, guarda-corpo na borda de fora */
      var pmz = perfilDe(p.mastro), rm = (pmz.D || pmz.b || 0.15) / 2, R = p.raio, beta = pp / p.raioLinha, s2 = p.sentido === "horario" ? -1 : 1;
      var mast = K.perfil({ origem: [0, 0, 0], ex: UP, ey: [1, 0, 0], perfil: pmz, L: p.desnivel + G.guarda, papel: "Mastro", ifc: "IFCCOLUMN", aco: p.aco, nome: "Mastro da escada caracol" }, "mastro");
      var postes = [];
      for (var k2 = 1; k2 < n; k2++) {
        var a0 = s2 * (k2 - 1) * beta, a1 = s2 * k2 * beta, C2 = [], j;
        for (j = 0; j <= 4; j++) { var aa = a0 + (a1 - a0) * j / 4; C2.push([R * Math.cos(aa), R * Math.sin(aa)]); }
        for (j = 2; j >= 0; j--) { var ab = a0 + (a1 - a0) * j / 2; C2.push([rm * Math.cos(ab), rm * Math.sin(ab)]); }
        var cd = degrauChapa(F0, { origem: [0, k2 * e, 0], ex: [1, 0, 0], ey: [0, 0, 1], t: tD, contorno: C2, papel: "Degrau", aco: p.aco, nome: "Degrau " + k2 + " (caracol)" });
        if (cd && mast) { cd.metal.soldadaEm = mast.id; cd.metal.solda = { tipo: "filete", perna: 5, lados: "ambos", comprimento: r4(2 * (tD + rm * Math.abs(a1 - a0))), campo: false }; }
        var am = (a0 + a1) / 2; postes.push([(R - 0.04) * Math.cos(am), k2 * e, (R - 0.04) * Math.sin(am)]);
      }
      if (p.guarda !== "nenhum" && postes.length >= 2) guardaCorpo(K, postes, gOpt(gid + "-c"));
      info = { voltas: r3((n - 1) * beta / (2 * Math.PI)), angulo: r2((n - 1) * beta / GRAU) };
      if ((n - 1) * beta > 2 * Math.PI * 1.05) K.avisos.push("Caracol com " + br((n - 1) * beta / GRAU, 0) + "° de giro: confira a passagem livre (altura de cabeça) sobre os degraus de baixo");
    }
    K.avisos.push("Guarda-corpo a " + br(G.guarda) + " m e corrimão a " + br(G.corrimaos[0]) + " e " + br(G.corrimaos[1]) + " m: " + G.fonte);
    if (dgN) K.avisos.push("Degrau pela norma: " + dgN.ref + (dgN.conferir ? " (conferir no texto da norma)" : ""));
    if (!degXadrez) K.avisos.push("Grade: " + br(gradeKgM2(p), 1) + " kg/m² pela geometria (barra portante " + cm(p.gradeH) + " × " + br(p.gradeT * 1000, 1) + " mm a cada " + cm(p.gradeA) + " cm) — valor de partida, conferir com o fabricante");
    K.avisos.push("Fixação dos degraus nas longarinas (cantoneira ou solda): a detalhar");
    var cont = K.cont, med = { tDegrauEscolhida: tAuto, n: n, e: e, p: pp, blondel: r4(2 * e + pp), dentroBlondel: 2 * e + pp >= 0.63 - 1e-9 && 2 * e + pp <= 0.64 + 1e-9, regra: calc.regra, angulo: info.angulo, voltas: info.voltas, guarda: G.guarda, corrimaos: G.corrimaos, lances: nLances };
    /* a GEOMETRIA DO ACESSO para o verificador de norma e o DIMENSIONAMENTO (js/acoacessos.js, 14/10/2026) */
    var pcr = perfilDe(p.corrimao), qPiso = Acs() ? Acs().sobrecarga(p.usoPiso).q : 2.5;
    med.acesso = { tipo: p.norma === "nr12-ingreme" ? "escada-ingreme" : "escada", perfil: p.norma || "nr12", forma: p.forma, desnivel: p.desnivel, largura: W, e: e, p: pp, n: n, lances: nLances,
      desnivelEntrePatamares: r4(hLanceMax), patamar: nLances > 1 ? { comprimento: patC, largura: patL } : null, alturaLivre: null,
      guarda: { ladosLivres: Math.max(0, 2 - Math.round(num(p.paredeLados, 0))), ladosProtegidos: lados.length, altura: G.guarda, alturas: G.corrimaos.slice(), rodape: p.rodape ? num(p.hRodape, 0.2) : 0, espacMontantes: p.espac, superiorPlano: pcr ? pcr.forma !== "tubo-circ" : null },
      corrimao: { alturas: G.corrimaos.slice(), lados: lados.length, diametro: pcr && pcr.forma === "tubo-circ" ? pcr.D : null, prolongamento: prolonga, intermediario: corrInterm } };
    var its = [], nvs = [];
    if (p.forma !== "caracol") {
      if (longU) its.push({ tipo: "longarina", perfil: p.longarina, aco: p.aco, e: e, p: pp, Lh: (Math.ceil(n / Math.max(1, nLances)) - 1) * pp, largura: W, gPiso: degXadrez ? 78.5 * tD * 1.07 : gradeKgM2(p) * 9.81 / 1000, q: qPiso, qRef: "NBR 6120:2019, Tabela 10" });
      else nvs.push("não verificado: longarina em chapa (verificar a chapa como viga inclinada à parte)");
      its.push({ tipo: "degrau", material: degXadrez ? "chapa" : "grade", aco: "ASTM A36", t: tD, vao: W, p: pp, gradeH: p.gradeH, gradeT: p.gradeT, gradeA: p.gradeA, q: qPiso });
      if (nLances > 1 && perfilDe(p.patamarPerfil)) its.push({ tipo: "viga", nome: "Viga do patamar", perfil: p.patamarPerfil, aco: p.aco, L: Math.max(patC, patL), faixa: Math.min(patC, patL) / 2, q: qPiso, gPiso: 0.6, travadaPeloPiso: true });
      nvs.push("não verificado: ligação degrau × longarina e base da escada (chumbadores)");
      if (nLances > 1) nvs.push("não verificado: pilaretes do patamar (compressão) e as ligações do patamar");
    } else nvs.push("não verificado: escada caracol — mastro, degraus em balanço e a solda no mastro");
    if (lados.length && perfilDe(p.montante)) its.push({ tipo: "montante", perfil: p.montante, corrimao: p.corrimao, aco: p.aco, uso: p.usoGuarda, espac: p.espac });
    med.dim = { itens: its, naoVerificados: nvs };
    return { resumo: "Escada " + ({ reta: "reta", patamares: "reta com " + (nLances - 1) + " patamar(es)", L: "em L", U: "em U", caracol: "caracol" })[p.forma] + " — desnível " + br(p.desnivel) + " m: " + n + " espelhos de " + cm(e) + " cm, piso de " + cm(pp) + " cm (2e + p = " + cm(2 * e + pp) + " cm" +
      (dgN ? ", " + dgN.ref : (calc.blondel >= 0.63 - 1e-9 && calc.blondel <= 0.64 + 1e-9 ? ", dentro de Blondel" : ", fora de 63 a 64 cm")) + "); " + (cont.degraus || 0) + " degraus" + (cont.longarinas ? ", " + cont.longarinas + " longarinas" : "") + (cont.guarda ? ", " + cont.guarda + " peças de guarda-corpo" : ""),
      medidas: med };
  }

  /* ============================================================= MEZANINO
   * canônico: s ao longo das vigas PRINCIPAIS, t de lado; P(s, y, t) → local */
  function mezanino(p, K, novoId) {
    var dx = p.direcao !== "z", S = dx ? p.Lx : p.Lz, T = dx ? p.Lz : p.Lx, nS = Math.round(dx ? p.vaosX : p.vaosZ), nT = Math.round(dx ? p.vaosZ : p.vaosX), H = p.altura;
    function P(s, y, t) { return dx ? [s, y, t] : [t, y, s]; }
    var ss = [], ts = [], i, j;
    for (i = 0; i <= nS; i++) ss.push(r4(S * i / nS));
    for (j = 0; j <= nT; j++) ts.push(r4(T * j / nT));
    var pil = {}, acoP = p.aco;
    /* PILARES: a linha do eixo, da base ao topo do aço (o nó das vigas) */
    for (i = 0; i <= nS; i++) for (j = 0; j <= nT; j++) {
      if (p.semPilares) continue;   /* passarela apoiada nas pontas (js/metalacessos.js) */
      pil[i + ":" + j] = K.barra(P(ss[i], 0, ts[j]), P(ss[i], H, ts[j]), { ferr: "pilar", cat: p.pilar, giro: dx ? 0 : 90, papel: "Pilar", ifc: "IFCCOLUMN", aco: acoP, nome: "Pilar " + (i + 1) + "-" + String.fromCharCode(65 + j) }, "pilares");
    }
    /* VIGAS PRINCIPAIS: em cada linha t de pilares, um trecho por vão (de topo de pilar a topo de pilar) */
    for (j = 0; j <= nT; j++) for (i = 0; i < nS; i++)
      K.barra(P(ss[i], H, ts[j]), P(ss[i + 1], H, ts[j]), { ferr: "viga", cat: p.principal, just: "topo", papel: "Viga principal", ifc: "IFCBEAM", aco: acoP, nome: "Viga principal " + String.fromCharCode(65 + j) + (i + 1) }, "principais");
    /* SECUNDÁRIAS: nas linhas dos pilares (pilar a pilar) e no meio dos vãos a no máximo espSec (apoiadas nas principais) */
    var sSec = [];
    for (i = 0; i < nS; i++) {
      var Lv = ss[i + 1] - ss[i], k = Math.max(1, Math.ceil(Lv / p.espSec - 1e-9));
      for (var q = 0; q < k; q++) sSec.push(r4(ss[i] + Lv * q / k));
    }
    sSec.push(ss[nS]);
    sSec.forEach(function (s, si) {
      for (var jj = 0; jj < nT; jj++)
        K.barra(P(s, H, ts[jj]), P(s, H, ts[jj + 1]), { ferr: "viga", cat: p.secundaria, just: "topo", papel: "Viga secundária", ifc: "IFCBEAM", aco: acoP, nome: "Viga secundária " + (si + 1) + "-" + String.fromCharCode(65 + jj) }, "secundarias");
    });
    /* PISO: chapas sobre as vigas (de secundária a secundária, partidas em painéis de no máximo painelMax) */
    var tP = p.piso === "grade" ? p.gradeH : (p.piso === "deck" ? p.tDeck : p.tPiso), nPiso = 0;
    if (p.piso !== "nenhum") {
      for (var a = 0; a + 1 < sSec.length; a++) for (var b = 0; b < nT; b++) {
        var t0 = ts[b], t1 = ts[b + 1], nPz = Math.max(1, Math.ceil((t1 - t0) / p.painelMax - 1e-9));
        for (var z = 0; z < nPz; z++) {
          var ta = t0 + (t1 - t0) * z / nPz, tb = t0 + (t1 - t0) * (z + 1) / nPz, o = P(sSec[a], H + tP, ta);
          /* a chapa no plano: u e w locais; a espessura desce (u × w = −y) */
          var c = K.chapa({ origem: o, ex: [1, 0, 0], ey: [0, 0, 1], t: tP, ret: dx ? { L: sSec[a + 1] - sSec[a], B: tb - ta } : { L: tb - ta, B: sSec[a + 1] - sSec[a] },
            papel: p.piso === "deck" ? "Steel deck" : "Piso em chapa xadrez", aco: p.piso === "deck" ? "ZAR 280" : "ASTM A36", nome: "Piso " + (++nPiso) }, "piso");
          if (c && p.piso === "grade") aplicarGrade(c, p);
        }
      }
      if (p.piso === "deck") K.avisos.push("Steel deck: a chapa entra PLANA (peso da chapa lisa de " + br(p.tDeck * 1000, 2) + " mm); a fôrma trapezoidal, o concreto e a armadura vêm do catálogo do fabricante — conferir");
      if (p.piso === "grade") K.avisos.push("Grade: " + br(gradeKgM2(p), 1) + " kg/m² pela geometria (barra portante " + cm(p.gradeH) + " × " + br(p.gradeT * 1000, 1) + " mm a cada " + cm(p.gradeA) + " cm) — valor de partida, conferir com o fabricante");
    }
    /* GUARDA-CORPO nas bordas livres (local: frente w = 0, fundo w = Lz, esquerda u = 0, direita u = Lx) */
    var G = alturasGuarda(), gid = String(novoId()), yG = H + (p.piso !== "nenhum" ? tP : 0), nTrav = Math.max(0, Math.round(p.travessas)), alts = [G.guarda];
    if (p.intermediaria > 0) { alts.push(r3(p.intermediaria)); nTrav = 1; }   /* NR-12, Anexo III, 7 e: intermediária a 0,70 m */
    else for (var it = 1; it <= nTrav; it++) alts.push(r3(G.guarda * it / (nTrav + 1)));
    var bordas = { frente: [[0, 0], [p.Lx, 0]], fundo: [[0, p.Lz], [p.Lx, p.Lz]], esquerda: [[0, 0], [0, p.Lz]], direita: [[p.Lx, 0], [p.Lx, p.Lz]] }, nG = 0;
    var abre = null;
    Object.keys(bordas).forEach(function (k) {
      if (!p[k]) return; var bd = bordas[k], go = { montante: p.montante, corrimao: p.corrimao, altura: G.guarda, alturas: alts, espac: p.espac, aco: "ASTM A36", rodape: p.rodape ? num(p.hRodape, 0.2) : 0, tRodape: p.tRodape };
      var A0 = [bd[0][0], yG, bd[0][1]], B0 = [bd[1][0], yG, bd[1][1]], Lb = len(sub(B0, A0)), segs = [[A0, B0]];
      /* ABERTURA de acesso (chegada da escada/marinheiro) no meio do lado: o guarda-corpo para e recomeça */
      if (p.abertura === k && Lb > num(p.aberturaLarg, 0.9) + 0.2) {
        var dd = mul(sub(B0, A0), 1 / Lb), c0 = Math.max(0.1, Math.min(Lb - 0.1 - p.aberturaLarg, num(p.aberturaPos, 0.5) * Lb - p.aberturaLarg / 2));
        var Pa = add(A0, mul(dd, c0)), Pb = add(A0, mul(dd, c0 + p.aberturaLarg));
        segs = [[A0, Pa], [Pb, B0]]; abre = { lado: k, a: Pa, b: Pb, largura: p.aberturaLarg };
      }
      segs.forEach(function (sg, si) { if (len(sub(sg[1], sg[0])) > 0.05) { var o2 = clone(go); o2.gid = gid + "-" + k + si; nG += guardaCorpo(K, [sg[0], sg[1]], o2); } });
    });
    if (nG) K.avisos.push("Guarda-corpo a " + br(G.guarda) + " m com " + nTrav + " travessa(s) intermediária(s): conferir a norma do uso (NBR 14718, NR-12…)");
    /* CONTRAVENTAMENTO em X nos vãos de canto das quatro faces (da base de um pilar ao topo do outro) */
    var nCv = 0;
    if (p.contraventar && !p.semPilares) {
      var xis = function (A0, A1, B0, B1, nome) {
        [[A0, B1], [B0, A1]].forEach(function (par, q2) { if (K.barra(par[0], par[1], { ferr: "diagonal", cat: p.contravento, papel: "Contraventamento", ifc: "IFCMEMBER", aco: "ASTM A36", nome: nome + " " + (q2 + 1) }, "contraventos")) nCv++; });
      };
      var vaosC = function (nn) { return nn >= 3 ? [0, nn - 1] : [0]; };
      [0, nT].forEach(function (jt) { vaosC(nS).forEach(function (iv) { xis(P(ss[iv], 0, ts[jt]), P(ss[iv], H, ts[jt]), P(ss[iv + 1], 0, ts[jt]), P(ss[iv + 1], H, ts[jt]), "Contraventamento da face " + String.fromCharCode(65 + jt)); }); });
      [0, nS].forEach(function (is) { vaosC(nT).forEach(function (jv) { xis(P(ss[is], 0, ts[jv]), P(ss[is], H, ts[jv]), P(ss[is], 0, ts[jv + 1]), P(ss[is], H, ts[jv + 1]), "Contraventamento da face " + (is + 1)); }); });
      /* CONTRAVENTAMENTO NO PLANO DO PISO (14/10/2026, js/metalacessos.js): X horizontal em cada vão, no nível das vigas —
         com ligações rotuladas o piso vira diafragma e leva a força horizontal até os vãos contraventados (sem ele, o nó
         do pilar intermediário fica numa corrente de rótulas e o modelo vira MECANISMO) */
      var todos = function (nn) { var o = []; for (var q4 = 0; q4 < nn; q4++) o.push(q4); return o; };   /* em TODOS os vãos: com tudo rotulado, cada painel do piso precisa do seu X */
      if (p.contraventoPlano) todos(nS).forEach(function (iv) { todos(nT).forEach(function (jv) {
        [[P(ss[iv], H, ts[jv]), P(ss[iv + 1], H, ts[jv + 1])], [P(ss[iv + 1], H, ts[jv]), P(ss[iv], H, ts[jv + 1])]].forEach(function (par, q3) { if (K.barra(par[0], par[1], { ferr: "diagonal", cat: p.contravento, papel: "Contraventamento no plano do piso", ifc: "IFCMEMBER", aco: "ASTM A36", nome: "Contraventamento do piso " + (iv + 1) + "-" + (jv + 1) + "." + (q3 + 1) }, "contraventos")) nCv++; });
      }); });
    } else if (!p.semPilares) K.avisos.push("Sem contraventamento: com as ligações rotuladas o conjunto é um mecanismo — contraventar, engastar as bases ou usar ligações rígidas (o cálculo da estrutura desenhada mostra)");
    /* PLACA DE BASE em cada pilar */
    var nPb = 0;
    if (p.placaBase) Object.keys(pil).forEach(function (k) { if (pil[k] && K.ligar("placaBase", [pil[k]], {})) nPb++; });
    var cont = K.cont;
    return { resumo: "Mezanino " + br(p.Lx) + " × " + br(p.Lz) + " m a " + br(H) + " m (" + nS + " × " + nT + " vãos): " + (cont.pilares || 0) + " pilares, " + (cont.principais || 0) + " vigas principais, " + (cont.secundarias || 0) + " secundárias" +
      (nPiso ? ", " + nPiso + " painéis de piso" : "") + (nCv ? ", " + nCv + " diagonais" : "") + (nPb ? ", " + nPb + " placas de base" : "") + (cont.guarda ? ", " + cont.guarda + " peças de guarda-corpo" : ""),
      medidas: { ss: ss, ts: ts, sSec: sSec, nPiso: nPiso, area: r4(p.Lx * p.Lz), placas: nPb, contraventos: nCv, abertura: abre, alturasGuarda: alts, yPiso: yG } };
  }

  /* ============================================================ ROLAMENTO
   * os pilares da seleção (metálicos ou do modelador com perfil): base, topo e a meia
   * largura da seção do lado da ponte. A viga, o trilho e os consoles saem no MUNDO
   * (o referencial é o da fila de pilares). */
  function lerPilar(c) {
    var mb = M().membro(c); if (!mb) return null;
    var X = mb.X; if (Math.abs(X[1]) < 0.995) return null;
    var P0 = mb.P0, P1 = add(P0, mul(X, mb.L)), lo = P0[1] <= P1[1] ? P0 : P1, hi = P0[1] <= P1[1] ? P1 : P0;
    var li = c.metal && MC() && MC().linhaAtual ? MC().linhaAtual(c) : null;
    if (li && Math.abs(li.a[0] - li.b[0]) < 1e-6 && Math.abs(li.a[2] - li.b[2]) < 1e-6) { lo = [li.a[0], Math.min(li.a[1], li.b[1]), li.a[2]]; hi = [li.a[0], Math.max(li.a[1], li.b[1]), li.a[2]]; }
    return { id: String(c.id), base: lo, topo: hi, mb: mb };
  }
  /* a FILA de pilares: ordenados ao longo dela, a direção canônica (+X; na fila em Z, +Z) e o lado "+1"
     (nrm0 = cima × direção). Mesma resposta em qualquer ordem de seleção. */
  function fila(pilares) {
    var ps = arr(pilares).map(lerPilar).filter(Boolean);
    if (ps.length < 2) return { erro: "Viga de rolamento: selecione 2 ou mais PILARES de aço da fila (Ctrl soma à seleção)." };
    var mx = 0, a0 = ps[0], b0 = ps[1];
    ps.forEach(function (q) { ps.forEach(function (r) { var d = sub(r.base, q.base); d[1] = 0; if (len(d) > mx) { mx = len(d); a0 = q; b0 = r; } }); });
    var d0 = sub(b0.base, a0.base); d0[1] = 0;
    var dd = unit(d0); if (!dd) return { erro: "Os pilares selecionados estão no mesmo lugar." };
    if (dd[0] < -1e-9 || (Math.abs(dd[0]) <= 1e-9 && dd[2] < 0)) dd = mul(dd, -1);
    ps.sort(function (a, b) { return dot(a.base, dd) - dot(b.base, dd); });
    var desv = 0; ps.forEach(function (q) { var r = sub(q.base, ps[0].base); r[1] = 0; desv = Math.max(desv, len(sub(r, mul(dd, dot(r, dd))))); });
    if (desv > 0.25) return { erro: "Os pilares selecionados não estão em fila (desvio de " + cm(desv) + " cm): a viga de rolamento corre numa fila reta." };
    return { ps: ps, dd: dd, nrm0: [dd[2], 0, -dd[0]] };
  }
  /* de que lado da fila caiu o clique (+1 | −1) */
  function ladoDoClique(pilares, P) {
    var f = fila(pilares); if (f.erro || !P) return 1;
    var r = sub([num(P[0], 0), 0, num(P[2], 0)], [f.ps[0].base[0], 0, f.ps[0].base[2]]);
    return dot(r, f.nrm0) >= 0 ? 1 : -1;
  }
  function rolamento(p, K, novoId, ctx) {
    var f = fila(ctx && ctx.pilares); if (f.erro) return f;
    var ps = f.ps, nrm0 = f.nrm0, lado = num(p.lado, 1) >= 0 ? 1 : -1, nrm = mul(nrm0, lado);
    var pv = perfilDe(p.viga), pcn = perfilDe(p.console), hTr = p.trilhoH;
    var topoMin = Math.min.apply(null, ps.map(function (q) { return q.topo[1]; }));
    var yR = p.cotaTrilho > 0 ? p.cotaTrilho : r3(topoMin - 0.3), yV = yR - hTr, yC = yV - pv.d;
    if (yC - pcn.d < Math.max.apply(null, ps.map(function (q) { return q.base[1]; })) + 0.5) return { erro: "A cota do trilho deixa o console a menos de 0,50 m da base do pilar: suba a cota do trilho." };
    if (yR > topoMin + 1e-6) K.avisos.push("O topo do trilho (" + br(yR) + " m) fica acima do topo do pilar mais baixo (" + br(topoMin) + " m): confira a continuidade do pilar acima do console");
    var R = ps.map(function (q) { return add([q.base[0], 0, q.base[2]], mul(nrm, p.excentricidade)); });
    /* CONSOLES: da face do pilar até passar meia mesa do eixo da viga (topo = fundo da viga), soldados no pilar */
    ps.forEach(function (q, i) {
      var mb = q.mb, meia = Math.abs(dot(nrm, mb.B)) * mb.s.alt / 2 + Math.abs(dot(nrm, mb.A)) * mb.s.larg / 2;
      var a = add([q.base[0], yC, q.base[2]], mul(nrm, meia)), b = add([R[i][0], yC, R[i][2]], mul(nrm, pv.bf / 2 + 0.05));
      if (dot(sub(b, a), nrm) < 0.05) { K.avisos.push("Console do pilar " + q.id + ": a viga fica dentro da seção do pilar — aumente a distância do eixo"); return; }
      var c = K.nova(MC().barra(a, b, { ferr: "viga", cat: pcn.cat, just: "topo", papel: "Console", ifc: "IFCMEMBER", aco: p.aco, nome: "Console do pilar " + (i + 1) }), "console", "consoles");
      if (c) { c.metal.soldadaEm = q.id; c.metal.solda = { tipo: "filete", perna: 6, lados: "ambos", comprimento: r4(2 * (pcn.d + pcn.bf)), campo: false }; }
    });
    /* VIGA DE ROLAMENTO (biapoiada em cada vão) e o TRILHO por cima */
    for (var i = 0; i + 1 < ps.length; i++) {
      K.nova(MC().barra([R[i][0], yV, R[i][2]], [R[i + 1][0], yV, R[i + 1][2]], { ferr: "viga", cat: pv.cat, just: "topo", papel: "Viga de rolamento", ifc: "IFCBEAM", aco: p.aco, nome: "Viga de rolamento " + (i + 1) }), "viga", "vigas");
      K.nova(MC().barra([R[i][0], yR, R[i][2]], [R[i + 1][0], yR, R[i + 1][2]], { ferr: "viga", perfil: { forma: "ret", b: p.trilhoB, h: hTr }, just: "topo", papel: "Trilho", ifc: "IFCMEMBER", aco: "ASTM A36", nome: "Trilho " + (i + 1) }), "trilho", "trilhos");
    }
    K.avisos.push("Ponte rolante: SÓ A GEOMETRIA (viga, trilho e consoles). O cálculo da ponte rolante — cargas de roda, impacto, frenagem, fadiga, flecha — NÃO entra aqui; capacidade " + br(p.capacidade, 1) + " t e vão da ponte " + br(p.vaoPonte) + " m ficam só como dado");
    K.avisos.push("Trilho: barra retangular " + cm(p.trilhoB) + " × " + cm(hTr) + " cm de partida — trocar pelo trilho do fabricante da ponte; fixação do trilho, batentes e fim de curso a detalhar");
    var cont = K.cont;
    return { resumo: "Viga de rolamento em " + ps.length + " pilares (" + (ps.length - 1) + " vãos), trilho no topo a " + br(yR) + " m, a " + br(p.excentricidade) + " m do eixo dos pilares: " + (cont.consoles || 0) + " consoles, " + (cont.vigas || 0) + " vigas, " + (cont.trilhos || 0) + " trilhos",
      medidas: { pilares: ps.map(function (q) { return q.id; }), yTrilho: yR, yViga: yV, yConsole: yC, nrm: nrm, lado: lado } };
  }

  /* ================================================================= RACK */
  function rack(p, K) {
    var nP = Math.round(p.porticos), esp = p.espacamento, B = p.largura, nv = lerNiveis(p.niveis), Ht = nv[nv.length - 1], k, j;
    var cols = [];
    for (k = 0; k < nP; k++) {
      var u = esp * k, par = [];
      [0, B].forEach(function (w, s) { par.push(K.barra([u, 0, w], [u, Ht, w], { ferr: "pilar", cat: p.pilar, papel: "Pilar", ifc: "IFCCOLUMN", aco: p.aco, nome: "Pilar " + (s ? "B" : "A") + (k + 1) }, "pilares")); });
      cols.push(par);
      nv.forEach(function (h, i) { K.barra([u, h, 0], [u, h, B], { ferr: "viga", cat: p.travessa, just: "topo", papel: "Travessa", ifc: "IFCBEAM", aco: p.aco, nome: "Travessa nível " + (i + 1) + " — pórtico " + (k + 1) }, "travessas"); });
    }
    if (p.longarinas) for (k = 0; k + 1 < nP; k++) [0, B].forEach(function (w, s) { nv.forEach(function (h, i) {
      K.barra([esp * k, h, w], [esp * (k + 1), h, w], { ferr: "viga", cat: p.longarina, just: "topo", papel: "Longarina", ifc: "IFCBEAM", aco: p.aco, nome: "Longarina " + (s ? "B" : "A") + " nível " + (i + 1) + " — vão " + (k + 1) }, "longarinas");
    }); });
    var vaos = p.contraventados === "todos" ? (function () { var o = []; for (var q = 0; q + 1 < nP; q++) o.push(q); return o; })() : (p.contraventados === "nenhum" ? [] : (nP >= 4 ? [0, nP - 2] : [0]));
    var cotas = [0].concat(nv);
    vaos.forEach(function (b) { [0, B].forEach(function (w) { for (j = 0; j + 1 < cotas.length; j++) {
      K.barra([esp * b, cotas[j], w], [esp * (b + 1), cotas[j + 1], w], { ferr: "diagonal", cat: p.contravento, papel: "Contraventamento", ifc: "IFCMEMBER", aco: "ASTM A36", nome: "Contraventamento longitudinal — vão " + (b + 1) }, "contraventos");
      K.barra([esp * (b + 1), cotas[j], w], [esp * b, cotas[j + 1], w], { ferr: "diagonal", cat: p.contravento, papel: "Contraventamento", ifc: "IFCMEMBER", aco: "ASTM A36", nome: "Contraventamento longitudinal — vão " + (b + 1) }, "contraventos");
    } }); });
    if (!vaos.length) K.avisos.push("Sem contraventamento longitudinal: a estabilidade ao longo do rack fica por conta de outra coisa (a decidir no projeto)");
    K.avisos.push("Pórtico transversal: ligação travessa × pilar rígida (chapa de extremidade) ou contraventar — decisão do projeto");
    var nPb = 0;
    if (p.placaBase) cols.forEach(function (par) { par.forEach(function (c) { if (c && K.ligar("placaBase", [c], {})) nPb++; }); });
    var cont = K.cont;
    return { resumo: "Rack de tubulação: " + nP + " pórticos a cada " + br(esp) + " m, largura " + br(B) + " m, " + nv.length + " nível(is) (" + nv.map(function (v) { return br(v); }).join("; ") + " m): " +
      (cont.pilares || 0) + " pilares, " + (cont.travessas || 0) + " travessas" + (cont.longarinas ? ", " + cont.longarinas + " longarinas" : "") + (cont.contraventos ? ", " + cont.contraventos + " diagonais" : "") + (nPb ? ", " + nPb + " placas de base" : ""),
      medidas: { niveis: nv, vaosContraventados: vaos, placas: nPb } };
  }

  /* ================================================================= SKID */
  function skid(p, K) {
    var pf = perfilDe(p.perfil), pt = perfilDe(p.travessa), Lx = p.comprimento + 2 * p.folga, Lz = p.largura + 2 * p.folga, d = pf.d, bf = pf.bf;
    /* o QUADRO: U com a alma para fora e as abas para dentro; o topo na cota d */
    K.barra([0, d, 0], [Lx, d, 0], { ferr: "viga", cat: pf.cat, just: "topo", lado: "esquerda", papel: "Longarina do skid", ifc: "IFCMEMBER", aco: p.aco, nome: "Longarina do skid 1" }, "quadro");
    K.barra([Lx, d, Lz], [0, d, Lz], { ferr: "viga", cat: pf.cat, just: "topo", lado: "esquerda", papel: "Longarina do skid", ifc: "IFCMEMBER", aco: p.aco, nome: "Longarina do skid 2" }, "quadro");
    K.barra([0, d, Lz - bf], [0, d, bf], { ferr: "viga", cat: pf.cat, just: "topo", lado: "esquerda", papel: "Cabeceira do skid", ifc: "IFCMEMBER", aco: p.aco, nome: "Cabeceira do skid 1" }, "quadro");
    K.barra([Lx, d, bf], [Lx, d, Lz - bf], { ferr: "viga", cat: pf.cat, just: "topo", lado: "esquerda", papel: "Cabeceira do skid", ifc: "IFCMEMBER", aco: p.aco, nome: "Cabeceira do skid 2" }, "quadro");
    /* TRAVESSAS a no máximo espTravessas, e uma debaixo de cada linha de furos do equipamento */
    var cx = Lx / 2, cz = Lz / 2, nPt = Math.round(p.pontos), us = [];
    var nT = Math.max(1, Math.ceil((Lx - 2 * bf) / p.espTravessas - 1e-9));
    for (var i = 1; i < nT; i++) us.push(r4(bf + (Lx - 2 * bf) * i / nT));
    var fx = nPt ? [cx - p.entreFurosX / 2, cx + p.entreFurosX / 2].concat(nPt === 6 ? [cx] : []) : [];
    fx.forEach(function (u) { if (u > bf + 0.05 && u < Lx - bf - 0.05) us.push(r4(u)); });
    us.sort(function (a, b) { return a - b; });
    us = us.filter(function (u, i2) { return i2 === 0 || u - us[i2 - 1] > pt.bf + 0.02; });
    us.forEach(function (u, i2) { K.barra([u, d, bf], [u, d, Lz - bf], { ferr: "viga", cat: pt.cat, just: "topo", papel: "Travessa do skid", ifc: "IFCMEMBER", aco: p.aco, nome: "Travessa do skid " + (i2 + 1) }, "travessas"); });
    /* PONTOS DE FIXAÇÃO: os furos do equipamento (Ø do parafuso + folga da NBR 8800) na chapa de piso — ou chapinhas de apoio */
    var N = dep("BimMetalNorma", "./metalnorma.js"), pz = N ? N.parafuso(p.parafuso) : null, db = pz ? pz.d : 16;
    var furos = [];
    fx.forEach(function (u) { [cz - p.entreFurosZ / 2, cz + p.entreFurosZ / 2].forEach(function (w) { furos.push({ u: r4(u), v: r4(w), db: db, tipo: "padrao" }); }); });
    if (p.chapa) {
      K.chapa({ origem: [0, d + p.tChapa, 0], ex: [1, 0, 0], ey: [0, 0, 1], t: p.tChapa, ret: { L: Lx, B: Lz }, furos: furos, papel: "Chapa de piso do skid", aco: p.aco, nome: "Chapa de piso do skid" }, "chapa");
    } else {
      furos.forEach(function (f, i3) {
        K.chapa({ origem: [f.u - 0.1, d + 0.0125, f.v - 0.1], ex: [1, 0, 0], ey: [0, 0, 1], t: 0.0125, ret: { L: 0.2, B: 0.2 }, furos: [{ u: 0.1, v: 0.1, db: db, tipo: "padrao" }], papel: "Chapa de fixação", aco: p.aco, nome: "Chapa de fixação " + (i3 + 1) }, "fixacoes");
      });
      if (furos.length) K.avisos.push("Chapas de fixação: confira se cada uma assenta numa travessa ou longarina");
    }
    K.avisos.push("Içamento do skid (olhais) e fixação da base na fundação: a detalhar");
    var cont = K.cont;
    return { resumo: "Base de equipamento " + br(Lx) + " × " + br(Lz) + " m (equipamento " + br(p.comprimento) + " × " + br(p.largura) + " m): " + (cont.quadro || 0) + " perfis do quadro, " + (cont.travessas || 0) + " travessas" +
      (p.chapa ? ", chapa de piso de " + br(p.tChapa * 1000, 1) + " mm" : "") + (furos.length ? ", " + furos.length + " pontos de fixação Ø " + db + " mm" : ""),
      medidas: { Lx: Lx, Lz: Lz, travessas: us, furos: furos.length } };
  }

  /* ================================================================ GERAR */
  var GERADORES = { trelica: trelica, escada: escada, mezanino: mezanino, rolamento: rolamento, rack: rack, skid: skid };

  /* ============================================================ TIPOS DE FORA (14/10/2026)
   * outro arquivo (js/metalacessos.js: marinheiro, plataforma, anelar, passarela, guarda-corpo, piso)
   * registra um tipo com o mesmo contrato: PADRAO, nums, bools, perfis (chaves que são perfil do catálogo),
   * validar(p, H) → texto | null, gerar(p, K, novoId, ctx, H) → { resumo, medidas } | { erro }.
   * O tipo ganha TUDO das peças prontas: identidade, editar no lugar, posicionar por clique, prévia. */
  var EXT = {}, EXTRA = [];
  function ajudantes() {
    return { perfilDe: perfilDe, cat: cat, guardaCorpo: guardaCorpo, aplicarGrade: aplicarGrade, gradeKgM2: gradeKgM2, alturasGuarda: alturasGuarda, quadroLocal: quadroLocal,
      corteDe: corteDe, contornoMundo: contornoMundo, geradores: GERADORES, normalizar: normalizar, validar: validar, num: num, fin: fin, r2: r2, r3: r3, r4: r4, br: br, cm: cm, clone: clone, arr: arr,
      add: add, sub: sub, mul: mul, dot: dot, cross: cross, len: len, unit: unit, rotY: rotY, UP: UP, GRAU: GRAU, RHO: RHO, M: M, MC: MC, Lg: Lg, Aco: Aco, Acs: Acs };
  }
  function registrarTipo(id, def) {
    if (!id || !def || typeof def.gerar !== "function") return false;
    TIPOS[id] = { id: id, rotulo: def.rotulo || id, cliques: def.cliques || 1, modo: def.modo || null, calcula: !!def.calcula, PADRAO: clone(def.PADRAO || {}) };
    ["x0", "y0", "z0", "giro"].forEach(function (k) { if (TIPOS[id].PADRAO[k] == null) TIPOS[id].PADRAO[k] = 0; });
    if (TIPOS[id].PADRAO.aco == null) TIPOS[id].PADRAO.aco = "ASTM A36";
    NUMS[id] = arr(def.nums).slice(); BOOLS[id] = arr(def.bools).slice();
    EXT[id] = def; GERADORES[id] = function (p, K, novoId, ctx) { return def.gerar(p, K, novoId, ctx, ajudantes()); };
    if (def.dica) DICAS[id] = def.dica;
    if (EXTRA.indexOf(id) < 0) EXTRA.push(id);
    return true;
  }
  function gerar(tipo, par, novoId, ctx) {
    if (!GERADORES[tipo] || !TIPOS[tipo]) return { ok: false, motivo: "Tipo de peça pronta desconhecido: " + tipo + "." };
    if (!M() || !MC() || !Aco()) return { ok: false, motivo: "Os motores da metálica (js/metalpeca.js, js/metalcriar.js, js/perfisaco.js) não carregaram." };
    if (typeof novoId !== "function") return { ok: false, motivo: "Sem gerador de id." };
    var e = validar(tipo, par); if (e) return { ok: false, motivo: e };
    var p = normalizar(tipo, par), F = quadroLocal([p.x0, p.y0, p.z0], tipo === "rolamento" ? 0 : p.giro), K = construtor(novoId, F, tipo);
    var r = GERADORES[tipo](p, K, novoId, ctx || {});
    if (!r || r.erro) return { ok: false, motivo: r ? r.erro : "falhou" };
    if (!K.pecas.length) return { ok: false, motivo: "Nenhuma peça foi criada." + (K.avisos.length ? " " + K.avisos.join("; ") : "") };
    if (tipo === "rolamento") { p.pilares = r.medidas.pilares.slice(); p.lado = r.medidas.lado; }
    var avL = []; K.ligs.forEach(function (l) { l.avisos.forEach(function (a) { if (avL.indexOf(a) < 0) avL.push(a); }); });
    var massa = 0; K.ops.forEach(function (o) { if (o.op === "criar" && o.caixa) massa += num(o.caixa.massa, 0); });
    /* as caixas finais (depois dos ajustes das ligações) */
    var finais = {}; K.ops.forEach(function (o) { if (o.op === "criar" && o.caixa) finais[o.id] = o.caixa; });
    return { ok: true, tipo: tipo, op: { op: "lote", id: String(novoId()), origem: "metal-pronta", pedido: TIPOS[tipo].rotulo, ops: K.ops }, pecas: K.pecas, finais: finais, contagem: K.cont, ligacoes: K.ligs,
      avisos: K.avisos, avisosLigacoes: avL, linhas: K.linhas, par: p, resumo: r.resumo + (K.ligs.length ? "; " + K.ligs.filter(function (l) { return l.ok; }).length + " ligações" : "") + " — " + br(massa, 1) + " kg.",
      medidas: r.medidas || {}, massa: r2(massa) };
  }

  /* ============================================================ IDENTIDADE
   * todas as peças criadas (também as das ligações) levam a marca; a 1ª (e quem a
   * substitui num ajuste de ligação) leva o prontaInfo. alvo = a peça pronta
   * antiga ({ pecas }): o lote começa apagando as peças dela. */
  function identidade(r, gid, info, alvo) {
    if (!r || !r.ok) return r;
    var primeiraId = null;
    (function marcar(ops) { arr(ops).forEach(function (o) {
      if (!o) return;
      if (o.op === "criar" && o.caixa) { o.caixa.pronta = gid; if (primeiraId == null && o.caixa.metal && o.caixa.metal.kind !== "parafuso") primeiraId = o.id; }
      if (o.op === "lote") marcar(o.ops);
    }); })(r.op.ops);
    var pr = r.finais && r.finais[primeiraId], inf = clone(info || {}); inf.id = gid;
    if (pr) inf.ref = { id: primeiraId, cx: pr.cx, cy: pr.cy, cz: pr.cz };
    (function info2(ops) { arr(ops).forEach(function (o) { if (o && o.op === "criar" && o.id === primeiraId) o.caixa.prontaInfo = clone(inf); if (o && o.op === "lote") info2(o.ops); }); })(r.op.ops);
    if (alvo && arr(alvo.pecas).length) {
      r.op.ops = alvo.pecas.map(function (id) { return { op: "apagar", id: id }; }).concat(r.op.ops);
      r.op.pedido = "Atualizar " + (TIPOS[r.tipo] ? TIPOS[r.tipo].rotulo.toLowerCase() : "peça pronta") + " (" + alvo.pecas.length + " peças refeitas)";
    }
    r.prontaId = gid; r.atualizou = !!alvo;
    return r;
  }
  /* as peças prontas do modelo, agrupadas pela marca */
  function prontas(caixas) {
    var por = {}, ordem = [];
    arr(caixas).forEach(function (c) {
      if (!c || !c.pronta) return; var g = String(c.pronta);
      if (!por[g]) { por[g] = { id: g, pecas: [], info: null }; ordem.push(g); }
      por[g].pecas.push(String(c.id)); if (c.prontaInfo) { por[g].info = c.prontaInfo; por[g].refAgora = { cx: c.cx, cy: c.cy, cz: c.cz }; }
    });
    return ordem.map(function (g) { var o = por[g]; o.n = o.pecas.length; o.tipo = o.info ? o.info.tipo : null; return o; });
  }
  /* o par para REFAZER no lugar: se o conjunto andou (a 1ª peça mudou de centro), a origem anda junto */
  function parParaRefazer(pr) {
    if (!pr || !pr.info || !pr.info.par) return null;
    var p = clone(pr.info.par), rf = pr.info.ref, ag = pr.refAgora;
    if (rf && ag && pr.tipo !== "rolamento") { p.x0 = r4(num(p.x0, 0) + num(ag.cx, 0) - num(rf.cx, 0)); p.y0 = r4(num(p.y0, 0) + num(ag.cy, 0) - num(rf.cy, 0)); p.z0 = r4(num(p.z0, 0) + num(ag.cz, 0) - num(rf.cz, 0)); }
    return p;
  }

  /* ============================================================== DESENHOS
   * as DICAS ILUSTRADAS (js/dicarica.js): o mesmo padrão do js/metaldicas.js —
   * viewBox 0 0 320 200, traço #1d2733, aço #c5d0dc / #4f6275, destaque #e9a23b */
  var INK = "#1d2733", ACO = "#c5d0dc", ACOL = "#4f6275", DST = "#e9a23b", DSTL = "#a86a10", AUX = "#8a94a3";
  function ln(x1, y1, x2, y2, c, w, da) { return '<line x1="' + r2(x1) + '" y1="' + r2(y1) + '" x2="' + r2(x2) + '" y2="' + r2(y2) + '" stroke="' + (c || INK) + '" stroke-width="' + (w || 1.6) + '"' + (da ? ' stroke-dasharray="' + da + '"' : "") + "/>"; }
  function mem(x1, y1, x2, y2, h, t) { t = t || 5; return ln(x1, y1, x2, y2, h ? DSTL : ACOL, t + 2.2) + ln(x1, y1, x2, y2, h ? DST : ACO, t); }
  function tx(x, y, s, a) { return '<text x="' + x + '" y="' + y + '" font-size="11" font-family="sans-serif" fill="' + INK + '" text-anchor="' + (a || "start") + '">' + s + "</text>"; }
  function svg(c) { return '<svg viewBox="0 0 320 200" width="320" height="200" role="img">' + c + "</svg>"; }
  function desenho(tipo) {
    var s = "", i;
    if (EXT[tipo] && EXT[tipo].desenho) { try { return svg(EXT[tipo].desenho({ ln: ln, mem: mem, tx: tx, INK: INK, ACO: ACO, ACOL: ACOL, DST: DST, DSTL: DSTL, AUX: AUX, r2: r2 })); } catch (e) { return svg(""); } }
    if (tipo === "trelica") {
      var x0 = 30, x1 = 290, yb = 150, yt = 70, n = 6, xs = [];
      for (i = 0; i <= n; i++) xs.push(x0 + (x1 - x0) * i / n);
      s += mem(x0, yb, x1, yb, false, 6) + mem(x0, yt, x1, yt, false, 6);
      for (i = 0; i <= n; i++) s += mem(xs[i], yb, xs[i], yt, false, 4);
      for (i = 0; i < n; i++) { var esq = i < n / 2; s += esq ? mem(xs[i], yt, xs[i + 1], yb, true, 4) : mem(xs[i], yb, xs[i + 1], yt, true, 4); }
      for (i = 0; i <= n; i++) { s += '<circle cx="' + xs[i] + '" cy="' + yb + '" r="4" fill="' + DST + '" stroke="' + DSTL + '"/>'; }
      s += ln(x0, yb + 8, x0 - 8, yb + 20) + ln(x0, yb + 8, x0 + 8, yb + 20) + ln(x1, yb + 8, x1 - 8, yb + 20) + ln(x1, yb + 8, x1 + 8, yb + 20);
      s += tx(160, 185, "Pratt: diagonais descem para o meio", "middle") + tx(160, 30, "vão · altura · nº de painéis", "middle");
    } else if (tipo === "escada") {
      var bx = 40, by = 170, e = 18, p = 28;
      var pts = []; for (i = 0; i < 7; i++) { pts.push([bx + i * p, by - (i + 1) * e]); }
      for (i = 0; i < 7; i++) s += '<rect x="' + (bx + i * p) + '" y="' + (by - (i + 1) * e) + '" width="' + p + '" height="4" fill="' + DST + '" stroke="' + DSTL + '"/>';
      s += mem(bx - 10, by, bx + 7 * p, by - 7 * e - 8, false, 7);
      s += ln(bx + 10, by - e - 60, bx + 7 * p, by - 7 * e - 60, ACOL, 3) + ln(bx + 10, by - e - 40, bx + 7 * p, by - 7 * e - 40, AUX, 2, "4 3");
      for (i = 0; i < 4; i++) s += ln(bx + 10 + i * 60, by - e - 6 - i * 38, bx + 10 + i * 60, by - e - 60 - i * 38 + (i ? 0 : 0), ACOL, 3);
      s += tx(240, 190, "2e + p = 63 a 64 cm", "middle") + tx(250, 40, "guarda-corpo", "middle");
    } else if (tipo === "mezanino") {
      s += '<polygon points="40,90 200,60 290,100 130,135" fill="' + DST + '" fill-opacity="0.35" stroke="' + DSTL + '"/>';
      [[40, 90], [200, 60], [290, 100], [130, 135]].forEach(function (q) { s += mem(q[0], q[1], q[0], q[1] + 55, false, 5); });
      s += mem(40, 90, 200, 60, false, 5) + mem(130, 135, 290, 100, false, 5) + mem(85, 112, 245, 80, false, 3) + mem(120, 75, 210, 117, false, 3);
      s += ln(40, 90, 40, 62, ACOL, 2) + ln(130, 135, 130, 107, ACOL, 2) + ln(40, 62, 130, 107, ACOL, 2) + ln(130, 107, 290, 72, ACOL, 2) + ln(290, 100, 290, 72, ACOL, 2);
      s += tx(160, 190, "2 cliques: dois cantos opostos", "middle");
    } else if (tipo === "rolamento") {
      s += mem(60, 190, 60, 30, false, 10) + mem(260, 190, 260, 30, false, 10);
      s += mem(64, 95, 110, 95, true, 6) + mem(264, 95, 310, 95, true, 6);
      s += '<rect x="96" y="70" width="28" height="22" fill="' + ACO + '" stroke="' + ACOL + '"/><rect x="104" y="62" width="12" height="8" fill="' + DST + '" stroke="' + DSTL + '"/>';
      s += ln(110, 40, 230, 40, AUX, 1, "4 3") + tx(170, 34, "ponte (cálculo à parte)", "middle") + tx(110, 120, "console", "middle") + tx(120, 56, "trilho", "start");
    } else if (tipo === "rack") {
      for (i = 0; i < 3; i++) { var o = i * 70; s += mem(40 + o, 180, 40 + o, 50, false, 5) + mem(100 + o, 170, 100 + o, 40, false, 5) + mem(40 + o, 110, 100 + o, 100, true, 4) + mem(40 + o, 60, 100 + o, 50, true, 4); }
      s += mem(40, 180, 110, 110, false, 3) + mem(110, 180, 40, 110, false, 3);
      s += '<circle cx="85" cy="92" r="9" fill="none" stroke="' + ACOL + '" stroke-width="2"/><circle cx="160" cy="80" r="9" fill="none" stroke="' + ACOL + '" stroke-width="2"/>';
      s += tx(160, 196, "pórticos repetidos · N níveis", "middle");
    } else if (tipo === "skid") {
      s += '<polygon points="50,120 210,90 280,120 120,150" fill="' + ACO + '" stroke="' + ACOL + '" stroke-width="2"/>';
      s += mem(85, 135, 245, 105, false, 3) + mem(70, 128, 230, 98, false, 3);
      s += '<rect x="120" y="70" width="90" height="45" fill="' + DST + '" fill-opacity="0.5" stroke="' + DSTL + '"/>';
      [[125, 118], [205, 103], [140, 128], [220, 112]].forEach(function (q) { s += '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="3.5" fill="' + INK + '"/>'; });
      s += tx(160, 180, "quadro U · chapa · pontos de fixação", "middle");
    }
    return svg(s);
  }
  var DICAS = {
    trelica: { titulo: "Treliça plana", oQueE: "Treliça montada de uma vez: banzos, diagonais e montantes com os perfis do catálogo e os nós em chapa gusset aparafusada.", ondeUsa: "Cobertura, passarela, viga treliçada de grande vão, suporte de equipamento.", dica: "Pratt: as diagonais descem para o meio (trabalham tracionadas com a carga para baixo). Howe: sobem para o meio. Banzo trapezoidal ou triangular para cobertura." },
    escada: { titulo: "Escada metálica", oQueE: "Escada inteira: longarinas, degraus (chapa xadrez ou grade), espelho opcional, patamar e guarda-corpo com corrimão.", ondeUsa: "Acesso a mezanino, plataforma de máquina, escada de emergência, caracol de serviço.", dica: "O degrau sai pelo desnível com a fórmula de Blondel (2e + p entre 63 e 64 cm) ou pelas regras do tipo; o resultado aparece no resumo." },
    mezanino: { titulo: "Mezanino / plataforma", oQueE: "Piso elevado completo: pilares com placa de base, vigas principais e secundárias, piso, guarda-corpo nas bordas livres e contraventamento.", ondeUsa: "Mezanino de loja ou galpão, plataforma de manutenção, área técnica.", dica: "Clique dois cantos opostos. Sai pronto para o Cálculo › Estrutura desenhada: as barras se encontram nos nós." },
    rolamento: { titulo: "Viga de rolamento", oQueE: "Viga de rolamento com trilho por cima e consoles soldados nos pilares selecionados.", ondeUsa: "Galpão com ponte rolante.", dica: "Selecione os pilares da fila e clique do lado da ponte. Só a geometria: o cálculo da ponte rolante não entra." },
    rack: { titulo: "Rack de tubulação", oQueE: "Pórticos repetidos com vários níveis de travessa, longarinas e contraventamento longitudinal.", ondeUsa: "Pipe rack de indústria, suporte de bandejas de cabos e dutos.", dica: "Os níveis são as alturas das travessas: 3; 4,5. Contraventamento nos vãos das pontas ou em todos." },
    skid: { titulo: "Base de equipamento (skid)", oQueE: "Quadro de perfis U com travessas, chapa de piso e furos de fixação nas medidas do equipamento.", ondeUsa: "Bomba, compressor, gerador, painel, tanque pequeno.", dica: "Digite o comprimento e a largura do equipamento e o entre-furos: as travessas caem debaixo das linhas de furos." }
  };
  function dica(tipo) { var d = DICAS[tipo]; if (!d) return null; var o = clone(d); o.svg = desenho(tipo); return o; }

  /* ESQUEMA: a prévia do diálogo — planta (u, w) e elevação (u, y) das linhas
   * geradas, encaixadas em 2 quadros. Linhas com classe; a cor é da tela (tokens). */
  function esquema(r) {
    var Ls = arr(r && r.linhas); if (!Ls.length) return "";
    function caixa(f) { var mn = [Infinity, Infinity], mx = [-Infinity, -Infinity]; Ls.forEach(function (l) { [l.a, l.b].forEach(function (q) { var v = f(q); mn[0] = Math.min(mn[0], v[0]); mn[1] = Math.min(mn[1], v[1]); mx[0] = Math.max(mx[0], v[0]); mx[1] = Math.max(mx[1], v[1]); }); }); return { mn: mn, mx: mx }; }
    function vista(f, X0, rot) {
      var bx = caixa(f), w = 150, h = 120, dx = Math.max(bx.mx[0] - bx.mn[0], 1e-3), dy = Math.max(bx.mx[1] - bx.mn[1], 1e-3), k = Math.min((w - 16) / dx, (h - 24) / dy);
      var ox = X0 + (w - dx * k) / 2, oy = 12 + (h - 12 - dy * k) / 2, out = '<text x="' + (X0 + w / 2) + '" y="10" class="mpr-esq-rot" text-anchor="middle">' + rot + "</text>";
      Ls.forEach(function (l) { var a = f(l.a), b = f(l.b); var cl = /chapa|Piso|Degrau|Espelho|Steel/.test(l.p) ? "mpr-esq-chapa" : (/guarda|Corrim|Montante do/.test(l.p) ? "mpr-esq-guarda" : "mpr-esq-barra");
        out += '<line class="' + cl + '" x1="' + r2(ox + (a[0] - bx.mn[0]) * k) + '" y1="' + r2(oy + (bx.mx[1] - a[1]) * k) + '" x2="' + r2(ox + (b[0] - bx.mn[0]) * k) + '" y2="' + r2(oy + (bx.mx[1] - b[1]) * k) + '"/>'; });
      return out;
    }
    return '<svg viewBox="0 0 320 130" class="mpr-esq" role="img" aria-label="Prévia">' + vista(function (q) { return [q[0], -q[2]]; }, 4, "planta") + vista(function (q) { return [q[0], q[1]]; }, 166, "elevação") + "</svg>";
  }

  var MetalProntas = {
    TIPOS: TIPOS, ORDEM: ORDEM, DICAS: DICAS, EXTRA: EXTRA, registrarTipo: registrarTipo, ajudantes: ajudantes,
    padrao: padrao, normalizar: normalizar, validar: validar, gerar: gerar, identidade: identidade, prontas: prontas, parParaRefazer: parParaRefazer,
    retangulo: retangulo, ladoDoClique: ladoDoClique, gradeKgM2: gradeKgM2, lerNiveis: lerNiveis, alturasGuarda: alturasGuarda, lerPilar: lerPilar,
    desenho: desenho, dica: dica, esquema: esquema, corteDe: corteDe
  };
  global.MetalProntas = MetalProntas;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalProntas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
