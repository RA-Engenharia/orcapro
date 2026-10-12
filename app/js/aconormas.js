/* =====================================================================
 * aconormas.js — as NORMAS que o cálculo da metálica usa: edição em vigor,
 * edição que o motor aplica, se o texto está na biblioteca da RA e a
 * situação de cada uma (dados PUROS, ES5, sem DOM, Node-testável). É o
 * conteúdo do painel "Normas" da tela (js/metalcalcui.js) e do memorial.
 *
 * DE ONDE VEM: docs/metalica/PLANO-METALICA-CALCULO.md (tabela "Normas —
 * edição em vigor × texto disponível", vigencia.json da biblioteca de
 * normas em 05/10/2026) e docs/metalica/CONTRATO.md (seção Normas). Nada
 * aqui é decidido na tela: quando o motor estiver carregado, `doMotor()`
 * lê a edição que CADA motor declara (AcoDim8800.ED, AcoCargas.EDICAO,
 * AcoVento.EDICAO, AcoIsopletas.FONTE, AcoMateriais.GAMA.fonte) — o painel
 * mostra a frase do próprio motor, e não uma cópia que pode envelhecer.
 *
 * Situações:
 *   ok        em vigor e com o texto oficial na biblioteca (conferido)
 *   vigente   o motor usa a edição em vigor, mas o texto ainda não está na
 *             biblioteca (conferir quando chegar)
 *   conferir  o motor usa a edição ANTERIOR (a vigente não está na
 *             biblioteca): o memorial cita a edição usada em cada item
 *   planejada entra na próxima etapa
 * ===================================================================== */
(function (global) {
  "use strict";

  var SITUACOES = {
    ok:        { rotulo: "Em vigor — texto oficial conferido", curto: "Conferida", tom: "ok" },
    vigente:   { rotulo: "Em vigor — texto a incluir na biblioteca", curto: "Em vigor", tom: "info" },
    conferir:  { rotulo: "Motor na edição anterior — conferir na vigente", curto: "Conferir", tom: "aviso" },
    planejada: { rotulo: "Próxima etapa", curto: "Próxima etapa", tom: "neutro" }
  };

  /* as normas de PROJETO (o cálculo) — Brasil primeiro, na ordem em que o cálculo as usa */
  var LISTA = [
    { id: "nbr6120", norma: "ABNT NBR 6120", titulo: "Ações para o cálculo de estruturas de edificações",
      tema: "Pesos dos materiais (telhas, alvenarias, aço) e sobrecarga de cobertura (6.4: q = 0,25 a 0,50 kN/m² pela inclinação; 1 kN concentrado na terça)",
      vigente: "2019", usada: "2019", texto: "sim (texto oficial)", situacao: "ok", motor: ["js/acocargas.js", "js/acofechamentos.js"] },
    { id: "nbr6123", norma: "ABNT NBR 6123", titulo: "Forças devidas ao vento em edificações",
      tema: "V0 pelo mapa de isopletas (Figura 1), S1, S2, S3, coeficientes de pressão externa e interna, casos de vento",
      vigente: "2023", usada: "1988 (o mapa de isopletas é o mesmo na 2023)", texto: "só a de 1988", situacao: "conferir", motor: ["js/acovento.js", "js/acoisopletas.js"] },
    { id: "nbr8681", norma: "ABNT NBR 8681", titulo: "Ações e segurança nas estruturas — Procedimento",
      tema: "Combinações últimas e de serviço; coeficientes γf e fatores ψ (aplicados pelas Tabelas 1 e 2 da NBR 8800)",
      vigente: "2025", usada: "2003, pelos coeficientes da NBR 8800:2008 (Tabelas 1 e 2)", texto: "só a de 2003", situacao: "conferir", motor: ["js/acocargas.js"] },
    { id: "nbr8800", norma: "ABNT NBR 8800", titulo: "Projeto de estruturas de aço e de estruturas mistas de aço e concreto de edificações",
      tema: "Análise de 2ª ordem e deslocabilidade, dimensionamento das barras (tração, compressão, flexão, cortante, interação), deslocamentos-limite, ligações",
      vigente: "2024 (errata 02/2025)", usada: "2008 em tabela de parâmetros; da 2024, os itens com mudança confirmada em fonte secundária (compressão por área efetiva, Cb sem teto, deslocabilidade 1,13/1,55, parafusos 0,45/0,56)",
      texto: "não", situacao: "conferir", motor: ["js/acodim8800.js", "js/acodimensionar.js", "js/acoanalise.js", "js/acoligcalc.js"] },
    { id: "nbr14762", norma: "ABNT NBR 14762", titulo: "Dimensionamento de estruturas de aço constituídas por perfis formados a frio",
      tema: "Terças e travessas de chapa dobrada: faixas finitas (flambagem local, distorcional e global) e método da resistência direta",
      vigente: "2010", usada: "2010", texto: "não", situacao: "vigente", motor: ["js/acofsm.js", "js/acodim14762.js"] }
  ];

  /* normas de PRODUTO — o que os catálogos seguem; o cálculo usa as propriedades publicadas pelo fabricante */
  var PRODUTO = [
    { norma: "ABNT NBR 5884", titulo: "Perfis I estruturais de aço soldados por arco elétrico (CS, CVS, VS)", uso: "catálogo de perfis soldados" },
    { norma: "ABNT NBR 6355", titulo: "Perfis estruturais de aço formados a frio (U, Ue, Z, cartola, cantoneira)", uso: "catálogo de terças e travessas" },
    { norma: "ABNT NBR 7007 · ASTM A572 · ASTM A36", titulo: "Aços para perfis laminados e chapas", uso: "fy e fu mínimos dos aços (catálogos dos fabricantes)" },
    { norma: "ABNT NBR 6650 · NBR 6649", titulo: "Chapas finas de aço para uso estrutural (formados a frio)", uso: "aço das terças e travessas" },
    { norma: "ABNT NBR 14513 · NBR 14514", titulo: "Telhas de aço revestido (ondulada e trapezoidal)", uso: "telhas dos fabricantes (peso, vão por sobrecarga)" }
  ];

  /* a próxima etapa (pensada desde já — PLANO, item 15) */
  var PROXIMAS = [
    { norma: "NR-35", titulo: "Trabalho em altura", uso: "linha de vida e pontos de ancoragem da cobertura, com memorial próprio" },
    { norma: "ABNT NBR 16325-1 e 16325-2", titulo: "Dispositivos e linhas de ancoragem", uso: "força de retenção, flecha do cabo e ancoragens na estrutura" }
  ];

  var PENDENCIA = "Comprar ou visualizar pelo convênio Confea a NBR 8800:2024, a NBR 6123:2023, a NBR 8681:2025 e a NBR 14762:2010. Até lá, o memorial mostra, em cada passo, a edição que foi usada.";

  /* o que cada MOTOR carregado declara (a frase é do próprio motor) */
  function doMotor() {
    var g = global, o = [];
    function add(nome, arq, txt) { if (txt) o.push({ motor: nome, arquivo: arq, texto: String(txt) }); }
    try { if (g.AcoDim8800 && g.AcoDim8800.ED) add("Dimensionamento das barras", "js/acodim8800.js", g.AcoDim8800.ED + " — itens sem mudança confirmada na 2024; os que mudaram citam a 2024"); } catch (e) {}
    try { if (g.AcoCargas && g.AcoCargas.EDICAO) add("Ações e combinações", "js/acocargas.js", g.AcoCargas.EDICAO); } catch (e) {}
    try { if (g.AcoVento && g.AcoVento.NORMA) add("Vento", "js/acovento.js", g.AcoVento.NORMA + (g.AcoVento.EDICAO ? " — " + g.AcoVento.EDICAO : "")); } catch (e) {}
    try { if (g.AcoIsopletas && g.AcoIsopletas.FONTE) { var F = g.AcoIsopletas.FONTE; add("Mapa de isopletas (V0)", "js/acoisopletas.js", typeof F === "string" ? F : (F.citacao || F.norma || F.titulo || "NBR 6123, Figura 1")); } } catch (e) {}
    try { if (g.AcoMateriais && g.AcoMateriais.GAMA && g.AcoMateriais.GAMA.fonte) add("Coeficientes das resistências", "js/acomateriais.js", g.AcoMateriais.GAMA.fonte); } catch (e) {}
    try { if (g.AcoDim14762 && (g.AcoDim14762.ED || g.AcoDim14762.EDICAO)) add("Formados a frio", "js/acodim14762.js", g.AcoDim14762.ED || g.AcoDim14762.EDICAO); } catch (e) {}
    return o;
  }

  /* a situação de uma norma: a da lista, ajustada pelo que está carregado
     (formados a frio "em implantação" enquanto o js/acodim14762.js não existir) */
  function lista() {
    var g = global;
    return LISTA.map(function (n) {
      var c = {}; Object.keys(n).forEach(function (k) { c[k] = n[k]; });
      c.sit = SITUACOES[c.situacao] || SITUACOES.vigente;
      if (c.id === "nbr14762" && !g.AcoDim14762) c.usada = "2010 — em implantação (terças e travessas: faixas finitas prontas; resistência direta a seguir)";
      return c;
    });
  }

  function resumo() {
    var l = lista(), n = { ok: 0, vigente: 0, conferir: 0, planejada: 0 };
    l.forEach(function (x) { n[x.situacao] = (n[x.situacao] || 0) + 1; });
    return { total: l.length, porSituacao: n, texto: l.length + " normas de projeto: " + n.ok + " conferida(s), " + n.vigente + " em vigor sem o texto na biblioteca, " + n.conferir + " com a edição anterior no motor (conferir)." };
  }

  var AcoNormas = { SITUACOES: SITUACOES, LISTA: LISTA, PRODUTO: PRODUTO, PROXIMAS: PROXIMAS, PENDENCIA: PENDENCIA, lista: lista, resumo: resumo, doMotor: doMotor };
  global.AcoNormas = AcoNormas;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoNormas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
