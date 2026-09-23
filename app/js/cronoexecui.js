/* =====================================================================
 * cronoexecui.js — A TELA do cronograma executivo (aba Cronograma do
 * orçamento). Desenho PURO: recebe dados prontos, devolve HTML. Não lê o
 * DOM, não grava, não chama rede — roda em Node (tools/test-cronoexecui.js).
 *
 * POR QUE ISTO É UM MÓDULO À PARTE (espec v2, Fase 2, 11/09/2026)
 * A aba Cronograma passou de uma tabela por etapa para quatro leituras do
 * mesmo cronograma (Cronograma · Físico-financeiro · Parâmetros, e o
 * Previsto × Realizado que chega com o planejamento da obra). Colocar isso
 * dentro do ui.js (3.000 linhas) deixaria o desenho sem teste: aqui ele é
 * função pura, e o ui.js só junta os dados (fiação fina). O que o ui.js
 * continua dono: o cartão de parâmetros de hoje (ids cron-*), o Gantt por
 * etapa (UI._gantt — proposta e PDF dependem dele) e a tabela físico-
 * financeira por etapa (a MESMA função da aba Relatórios).
 *
 * ⚠ AS REGRAS QUE ESTE DESENHO NÃO PODE QUEBRAR
 *  1) A linha de ETAPA da tabela preserva o `<tr>` puro, `data-cron-dur`,
 *     `data-cron-pred` e a célula "codigo nome"(+pílula de marco)`</td>`, e
 *     as 8 colunas NA ORDEM DE HOJE (Etapa · Categoria · Eq-dias · Duração ·
 *     Depende de · Folga · Início · Fim): tools/e2e-cronograma-gantt.js lê a
 *     coluna pela POSIÇÃO (tds[5] = Folga) e test-cronograma-render acha a
 *     linha por `lastIndexOf("<tr>")`. Linha filha usa `<tr class=…>`.
 *  2) Nenhum número de dinheiro vem de custo direto: a camada detalhada do
 *     físico-financeiro só distribui VALOR DE VENDA (Orcamento.valoresEAP);
 *     sem ele, recado — nunca o custo no lugar (margem do escritório virando
 *     curva do cliente).
 *  3) Estado de tela (sub-aba, detalhe, etapas recolhidas) NUNCA vai para o
 *     orçamento: mora em App._cronoSub/_cronoDet/_cronoAbertas/_cronoFF.
 *     Gravar no orçamento a cada clique de visualização mudaria o
 *     `atualizadoEm`, sincronizaria à toa e esbarraria na trava do aprovado.
 *  4) Gantt é PAPEL BRANCO (fundo #fff cravado, como ui.js _gantt): as cores
 *     das categorias foram calibradas para fundo claro, e token de tema
 *     trocaria a tinta do texto para a do tema escuro sobre o papel branco.
 * ===================================================================== */
(function (global) {
  "use strict";

  function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function ehArr(v) { return Object.prototype.toString.call(v) === "[object Array]"; }
  function arr(v) { return ehArr(v) ? v : []; }
  function G(nome) { return (typeof global[nome] !== "undefined") ? global[nome] : null; }
  function C() { return (typeof Cronograma !== "undefined") ? Cronograma : G("Cronograma"); }
  function Ut() { return (typeof Util !== "undefined") ? Util : G("Util"); }
  /* o MOTOR do Gantt interativo (js/ganttui.js): zoom, janela visível, régua e
     arrasto. ⚠ No navegador ele vem pelo index.html (depois deste arquivo, mas
     antes de qualquer chamada); em Node, `tools/test-cronoexecui.js` carrega só
     este módulo — sem o require abaixo o desenho interativo sairia MUDO no
     teste e verde, que é a definição de assert decorativo. */
  function GU() {
    if (typeof GanttUI !== "undefined") return GanttUI;
    var g = G("GanttUI"); if (g) return g;
    if (typeof require === "function" && typeof module !== "undefined") { try { return require("./ganttui.js"); } catch (e) { return null; } }
    return null;
  }
  /* MOTOR RESOLVIDO NA HORA DA CHAMADA (mesma receita do GU acima). No
     navegador o global basta — o index.html carrega os seis motores do
     cronograma pro; em Node a suíte carrega só este arquivo, e sem o
     `require` o desenho sairia MUDO no teste e VERDE, que é a definição de
     assert decorativo.
     ⚠ NUNCA resolver isto no topo do IIFE: o js/histograma.js e o
     js/execucao.js carregam DEPOIS deste arquivo no index.html (a ordem do
     bloco é motor-raiz → tela → provedores), e um `var H = global.Histograma`
     de carregamento congelaria `undefined` para sempre. */
  function MOD(nome, arq) {
    if (typeof global[nome] !== "undefined" && global[nome]) return global[nome];
    if (typeof require === "function" && typeof module !== "undefined") { try { return require(arq); } catch (e) { return null; } }
    return null;
  }
  /* o motor do TAMANHO dos painéis (js/paineis.js, F3 crono-janelas). Sem ele
     (cache antigo, suíte que não o carrega) tudo cai na fórmula da 1.2.77:
     preferência que não se consegue prender à tela não se usa. */
  function PN() { var p = MOD("Paineis", "./paineis.js"); return (p && typeof p.limitar === "function") ? p : null; }
  function num0(v) { var x = Number(v); return isFinite(x) ? x : 0; }
  function esc(s) {
    var u = Ut();
    if (u && u.esc) return u.esc(s);
    /* ⚠ `\x22` (aspas) e `\x27` (apóstrofo) NO LUGAR DOS CARACTERES: o
       comportamento é o mesmo, mas as varreduras de ES5 desta base (que tiram
       comentários e strings por máquina de estados simples, sem entender
       expressão regular — tools/fixtures/crono-obra-bancada.js) liam o `"` de
       dentro do `/"/g` como ABERTURA DE STRING e perdiam o compasso daí em
       diante: comentário virava código e a guarda acusava "template literal"
       num arquivo sem nenhuma crase de código. Achado em 12/09/2026, quando um
       comentário novo caiu do lado errado dessa paridade. */
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\x22/g, "&quot;").replace(/\x27/g, "&#39;");
  }
  /* ⚠ NOME DE CAMPO DO MOTOR NÃO VAI À CARA DO CLIENTE. Roteiro do defeito
     (lido nas fotos de 12/09/2026): as frases que os motores escrevem para a
     tela copiar vinham com o identificador cru entre crases — "na ordem em que
     saem em `ops`", "as companheiras de `dependeDe`" (4 ocorrências no modal da
     sequência). O engenheiro de obra não sabe o que é `ops`, e a frase perde
     justamente a parte que ela existe para explicar. É a mesma classe do
     "atraso.dias" que saía no cabeçalho do modal do replanejamento.
     ⚠ A TRADUÇÃO É POR TERMO CONHECIDO, e o que NÃO estiver aqui continua
     aparecendo de propósito: é assim que a suíte (test-cronoexecui, bloco do
     vocabulário) acusa o termo novo em vez de deixá-lo passar calado. A
     PENDÊNCIA é dos motores que escrevem as frases — js/cronoseq.js (`escopo`,
     `porqueNaoMedido`, `avisos`): enquanto elas saírem com o identificador,
     esta tradução é a única barreira.
     ⚠ Só se aplica a texto DE MOTOR (escM), nunca ao esc() geral: passar o
     texto do usuário por um dicionário reescreveria o nome da etapa dele. */
  /* ⚠ `\x60` É A CRASE, e ela vai assim de propósito: a guarda de ES5 desta
     base (tools/test-cronoexecui.js, bloco 0) reprova QUALQUER crase no código
     depois de tirar os comentários — ela não sabe distinguir literal de
     template de crase dentro de expressão regular, e uma guarda que erra para
     o lado seguro é melhor que uma que deixa passar template literal em
     WebView velha. */
  var JARGAO = [
    [/\bem\s+\x60ops\x60/g, "na lista"], [/\bde\s+\x60ops\x60/g, "da lista"], [/\x60ops\x60/g, "a lista"],
    /* a mais longa primeiro: o motor do replanejamento manda a pessoa "ver
       `CronoSeq.sugerir().ligacoes[].dependeDe`", que é instrução para quem
       liga o motor na tela — não recado para o engenheiro de obra */
    [/\x60CronoSeq\.sugerir\(\)\.ligacoes\[\]\.dependeDe\x60/g, "as ligações que precisam vir antes, na sugestão de sequência de obra"],
    [/\bde\s+\x60dependeDe\x60/g, "que precisam vir antes"], [/\x60dependeDe\x60/g, "as ligações que precisam vir antes"],
    /* a FÓRMULA DA NOTA (CronoSaude) cita a tabela interna de limites e o
       campo `nota.itens` — o que a pessoa vê na tela é a coluna "pior" de cada
       checagem, e é assim que a frase passa a apontar para o que existe */
    [/\bem\s+\x60limites\x60/g, "na tabela de limites"], [/\x60limites\x60/g, "a tabela de limites"],
    [/\bde\s+nota\.itens\b/g, "de cada checagem"], [/\bnota\.itens\b/g, "a lista de checagens"]
  ];
  function semJargao(s) {
    var t = String(s == null ? "" : s), i;
    for (i = 0; i < JARGAO.length; i++) t = t.replace(JARGAO[i][0], JARGAO[i][1]);
    return t;
  }
  // texto escrito por MOTOR, indo para a tela: escapado E sem nome de campo
  function escM(s) { return esc(semJargao(s)); }
  function moeda(v) {
    var u = Ut();
    if (u && u.fmtMoeda) return u.fmtMoeda(v);
    return "R$ " + (Math.round((v || 0) * 100) / 100).toFixed(2).replace(".", ",");
  }
  function pct(v, casas) {
    var u = Ut();
    if (u && u.fmtPct) return u.fmtPct(v, casas == null ? 1 : casas);
    return (Math.round((v || 0) * 10) / 10).toFixed(casas == null ? 1 : casas).replace(".", ",") + "%";
  }
  function ic(nome) { var I = (typeof Icones !== "undefined") ? Icones : G("Icones"); try { return I && I.get ? I.get(nome, 15) : ""; } catch (e) { return ""; } }
  function dd(n) { return ("0" + n).slice(-2); }
  function ehData(d) { return !!d && typeof d.getTime === "function" && !isNaN(d.getTime()); }
  function dma(d) { return ehData(d) ? dd(d.getDate()) + "/" + dd(d.getMonth() + 1) + "/" + d.getFullYear() : "—"; }
  /* dd/mm com o ano no CABEÇALHO (espec 2.3). Obra que atravessa o ano ganha
     o ano curto em cada data: "05/01" sozinho seria de qual dos dois anos? */
  function dm(d, multiAno) { return ehData(d) ? dd(d.getDate()) + "/" + dd(d.getMonth() + 1) + (multiAno ? "/" + String(d.getFullYear()).slice(2) : "") : "—"; }
  function f1(x) { return (Math.round(x * 10) / 10).toFixed(1); }
  // número de TELA (vírgula decimal): "769.9" na coluna Eq-dias se lia como milhar
  function nBR(x, casas) {
    var u = Ut(), v = Number(x) || 0;
    if (u && u.fmtNum) return u.fmtNum(v, casas);
    return (Math.round(v * Math.pow(10, casas)) / Math.pow(10, casas)).toFixed(casas).replace(".", ",");
  }
  /* código da etapa que JÁ É o nº da linha ("1", "01", "1.0"): mostrar os dois
     dava "1 1.0 Serviços preliminares" (6 de 6 orçamentos do backup usam N.0) */
  function codNum(c) { var m = /^0*(\d+)(?:\.0+)?$/.exec(String(c == null ? "" : c).trim()); return m ? String(parseInt(m[1], 10)) : null; }
  function corta(s, n) { s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  /* data "AAAA-MM-DD" (como o CronoPlan grava) → texto, SEM passar por Date:
     `new Date("2026-05-04")` é meia-noite UTC e, no Brasil, vira o dia 03.
     Carimbo ISO com hora ("…T12:00:00Z") é instante: esse vai pelo Date local. */
  function dmaS(s) {
    s = String(s == null ? "" : s);
    if (/T\d/.test(s)) { var d = new Date(s); if (ehData(d)) return dma(d); }
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    return m ? m[3] + "/" + m[2] + "/" + m[1] : "—";
  }
  function dmS(s, multi) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s == null ? "" : s));
    return m ? m[3] + "/" + m[2] + (multi ? "/" + m[1].slice(2) : "") : "—";
  }
  /* percentual de TELA; null (não se sabe) sai "—", nunca "0%" — "não sei" e
     "zero" são respostas diferentes para quem pergunta quanto andou */
  function pctOu(v, casas) { var x = Number(v); return (v == null || v === "" || !isFinite(x)) ? "—" : pct(x, casas == null ? 1 : casas); }
  function ppTxt(v) { var x = Number(v); if (v == null || !isFinite(x)) return "—"; return (x > 0 ? "+" : (x < 0 ? "−" : "")) + nBR(Math.abs(x), 1) + " p.p."; }
  // desvio de término em dias úteis (+ = atraso), contra a linha de base
  function termTxt(d) {
    var x = Number(d);
    if (d == null || !isFinite(x)) return "";
    if (x === 0) return "término no dia da linha de base";
    return "término " + Math.abs(x) + " dia(s) útil(eis) " + (x > 0 ? "depois" : "antes") + " da linha de base";
  }
  function sitHtml(s) {
    if (!s) return '<span class="muted">—</span>';
    var x = own(SIT, s) ? SIT[s] : [s, "#64748b"];
    return '<span class="cx-sit" style="background:' + x[1] + '1a;color:' + x[1] + '">' + esc(x[0]) + '</span>';
  }
  /* previsto / real / desvio numa célula, com a mini-barra (barra = real;
     traço = previsto na data) */
  function celPR(n) {
    var pv = n.previstoPct, rl = n.realPct, d = n.desvioPP;
    if (pv == null && rl == null) return '<span class="muted">—</span>';
    function cl(v) { var x = Number(v); return isFinite(x) ? Math.max(0, Math.min(100, x)) : 0; }
    var cor = d == null ? "" : (d < 0 ? "color:#b91c1c" : "color:#15803d");
    /* ⚠ O REAL VEM COM A ORIGEM (planejador 2B, E-MC5): "real 60% (digitado)"
       e "real 60% (medição 01a)" se discutem de formas diferentes. Sem a
       origem, o número aparece sem dono e quem lê não sabe se pode contestá-lo
       nem onde ele foi lançado. */
    var org = n.realOrigem ? ' <span class="muted cx-pr-org">(' + esc(String(n.realOrigem)) + ')</span>' : '';
    return '<span>previsto ' + pctOu(pv) + ' · real ' + pctOu(rl) + org + (d != null ? ' · <b style="' + cor + '">' + esc(ppTxt(d)) + '</b>' : '') + '</span>' +
      '<div class="cx-mb" title="barra = executado; traço = previsto na data">' + (rl != null ? '<i style="width:' + f1(cl(rl)) + '%"></i>' : '') + (pv != null ? '<em style="left:' + f1(cl(pv)) + '%"></em>' : '') + '</div>';
  }
  /* número digitado pela pessoa: "5", "5,5", "1.500" (milhar BR com vírgula
     decimal). Texto que não é número vira NaN — e NaN nunca é gravado. */
  function numTxt(s) {
    s = String(s == null ? "" : s).trim();
    if (!s) return NaN;
    if (s.indexOf(",") > -1) s = s.replace(/\./g, "").replace(",", ".");
    return /^[+\-]?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN;
  }

  // rótulo curto de mês para as marcas dos gráficos de baixo (histograma e LOB)
  var MES3 = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

  var DETALHES = ["etapa", "subetapa", "servico"];
  var CAMADAS = ["etapa", "folha", "servico"];   // camadas do físico-financeiro (Cronograma.periodos)
  var DET_ROT = { etapa: "Etapa", subetapa: "Subetapa", servico: "Serviço" };
  /* "real" (Previsto × Realizado) chegou com o planejamento da obra (Fase 3).
     ⚠ Ela só aparece com a Gestão de Obras (plano Plus): sem Gestão não há
     obra, nem diário, nem medição — a sub-aba seria porta que não leva a lugar
     nenhum (memória "porta prometida precisa existir"), e a faixa já diz a
     linha honesta. Quem esconde é o `render` (est.semReal), não o FASE. */
  var SUBS = [
    { id: "cronograma", nome: "Cronograma" },
    { id: "fisico", nome: "Físico-financeiro" },
    { id: "real", nome: "Previsto × Realizado", fase: 3 },
    { id: "parametros", nome: "Parâmetros" }
  ];
  var FASE = 3;
  /* estados do painel (CronoPlan.montarPainel) que vêm COM números; os
     outros são erro com a frase do motor */
  var PR_OK = { ok: 1, "sem-diarios": 1, "sem-inicio": 1 };
  /* situação do nó → [rótulo de gente, cor]. O que não está aqui (sem valor
     orçado, opcional fora, fora da linha de base…) sai com o próprio texto */
  var SIT = {
    "concluida": ["concluída", "#15803d"], "adiantada": ["adiantada", "#0d6ebd"], "no prazo": ["no prazo", "#15803d"],
    "atrasada": ["atrasada", "#b91c1c"], "nao iniciada": ["não iniciada", "#64748b"], "atrasada (não iniciada)": ["atrasada (não iniciada)", "#b91c1c"]
  };
  /* fonte da duração → [marca curta, explicação]. I7: a tela diz o que é
     heurística de categoria e o que é custo de MO ÷ R$/dia-equipe. */
  var FONTES = {
    usuario: ["✎", "Duração digitada por você"],
    ia: ["IA", "Duração sugerida pela IA"],
    exec: ["Hh", "Duração do Hh SINAPI (aba Execução → Enviar ao cronograma)"],
    subetapas: ["∑", "Duração = vão das subetapas (modo executivo)"],
    estimado: ["≈", "Estimada pelo agente: equipe-dias ÷ equipes"],
    semBase: ["—", "Sem serviço com quantidade: 1 dia"],
    categoria: ["≈", "Produtividade da categoria (heurística do agente)"],
    custoMO: ["R$", "Custo de mão de obra ÷ R$/dia-equipe informado por você"],
    custoEstimado: ["R$", "Sem categoria nem MO: 35% do custo como mão de obra ÷ R$/dia-equipe (estimativa)"]
  };
  var CRIT = "#b91c1c", CINZA = "#94a3b8", HOJE = "#b45309", RESUMO = "#1e293b", INTERNA = "#64748b";
  /* ⚠ o azul do ponto de LIGAR é cravado, não `var(--aco)`: ele é desenhado
     sobre o papel branco do Gantt (regra 4 do cabeçalho), e um token de tema
     deixaria o ponto quase invisível no tema escuro do resto do app. */
  var AZUL_ELO = "#0d6ebd";
  /* ⚠ (planejador 2A) O ROXO DA TAREFA SEM PREÇO. Cravado como as outras
     tintas deste arquivo: o Gantt é papel branco nos dois temas (regra 4 do
     cabeçalho), e um token de tema deixaria a barra tracejada quase invisível
     no tema escuro. Roxo, e não a cor de uma categoria, porque tarefa sem
     preço NÃO é serviço do orçamento — e o contraste está medido em
     tools/test-contraste.js. */
  var ROXO_T = "#6d28d9";
  function fin(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function ehObj(v) { return !!v && typeof v === "object" && !ehArr(v); }
  /* a chave "AAAA-MM-DD" do dia LOCAL (a mesma do CronoCal): `toISOString`
     daria o dia anterior no Brasil */
  function chDia2A(ms) { var d = new Date(ms); return d.getFullYear() + "-" + dd(d.getMonth() + 1) + "-" + dd(d.getDate()); }

  /* ⚠ A RÉGUA DO CONTROLE TAMBÉM MORA AQUI, E NÃO SÓ NO app.css (14/09/2026).
     Esta folha é injetada pelo `render` DENTRO da aba, depois do app.css: com
     especificidade igual, ela VENCE. Um `.cx-sub`, `.cx-seg button` ou `.gx-zb`
     com os valores antigos aqui continuaria fora da régua mesmo com o app.css
     certo (memória "regra de unificação nasce perdendo").
     A régua: controle 32 px (lh 18 + 6 + 6 + 1 + 1), raio 8; chip 24 px, raio
     999; controle dentro do papel do Gantt 28 px, raio 8; letra 12 · 13,5 · 15
     · 17 · 20 e pesos 400/500/600 (o Plex Sans não tem 700/800 e o Mono não
     passa de 500 — pedir mais desenha igual e mente a hierarquia).
     ⚠ Os tokens levam o valor claro como reserva (`var(--raio-ctl,8px)`): a
     ficha da obra e o módulo "Cronograma da obra" usam partes desta tela sem
     garantia de que o token existe no documento.
     tools/e2e-padrao-cronograma.js lista, com seletor e valor, quem sai. */
  var CSS =
    ".cx-barra{display:flex;justify-content:space-between;align-items:center;gap:4px 8px;flex-wrap:wrap;margin:0 0 6px}" +
    ".cx-subs,.cx-acoes{display:flex;gap:6px;flex-wrap:wrap;align-items:center}" +
    /* a linha 1 é SÓ segmentado (esquerda) e ícones N3 (direita): as ações
       ficam juntas (2 px) e empurradas para a borda direita */
    ".cx-acoes{gap:2px;margin-left:auto}" +
    ".cx-sub{border:1px solid var(--linha,#c9d6e4);background:transparent;color:inherit;border-radius:var(--raio-ctl,8px);padding:6px 12px;font:inherit;font-size:13.5px;line-height:18px;font-weight:400;cursor:pointer}" +
    ".cx-sub:not(.on):hover{background:var(--surface-2,#eef2f7);border-color:var(--linha-forte,#7e95aa)}" +
    ".cx-sub.on{background:var(--aco,#0d6ebd);border-color:var(--aco,#0d6ebd);color:#fff;font-weight:600}" +
    ".cx-faixa{font-size:12px;margin:0 0 6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}" +
    /* ⚠ O CHIP É SÓ TEXTO, NUNCA EMBRULHA BOTÃO (a raiz dos dois defeitos da
       1.2.77: botão dentro do texto que encolhe) — ver faixaObra */
    ".cx-chip{display:inline-flex;align-items:center;border:1px solid var(--linha,#c9d6e4);border-radius:999px;padding:2px 10px;line-height:18px}" +
    /* SEGMENTADO: as peças têm a forma das sub-abas que o dono aprovou — cada
       uma com a sua borda e raio 8, juntas por 4 px — e o grupo é o `role`.
       O Detalhe (Etapa/Subetapa/Serviço) era outro componente: 27,4 px,
       12,5 px e raio 0 dentro de uma moldura; lado a lado com as sub-abas,
       dois segmentados que não pareciam o mesmo. */
    ".cx-seg{display:inline-flex;gap:4px;flex-wrap:wrap;vertical-align:middle}" +
    ".cx-seg button{border:1px solid var(--linha,#c9d6e4);background:transparent;border-radius:var(--raio-ctl,8px);padding:6px 12px;font:inherit;font-size:13.5px;line-height:18px;font-weight:400;cursor:pointer;color:inherit}" +
    ".cx-seg button:not(.on):hover{background:var(--surface-2,#eef2f7);border-color:var(--linha-forte,#7e95aa)}" +
    ".cx-seg button.on{background:var(--aco,#0d6ebd);border-color:var(--aco,#0d6ebd);color:#fff;font-weight:600}" +
    ".cx-toggle{display:inline-flex;gap:8px;align-items:center;border:1px solid var(--linha,#c9d6e4);background:transparent;color:inherit;border-radius:var(--raio-ctl,8px);padding:6px 12px 6px 6px;font:inherit;font-size:13.5px;line-height:18px;font-weight:400;cursor:pointer}" +
    /* ⚠ no dedo o segmentado e o interruptor seguem o alvo do `.btn` (40 px,
       app.css @media 820): eles não são `.btn` e a régua de 32 não chegaria lá */
    "@media (max-width:820px){.cx-sub,.cx-seg button,.cx-toggle{min-height:40px}}" +
    ".cx-prazo{font-size:var(--t-med,17px);font-weight:600}" +
    ".cx-rotulo{font-size:12px;font-weight:500}" +
    ".cx-nota{font-size:12px}" +
    /* pills da linha do prazo e da tabela: cor por TOKEN (o hex cravado em
       linha dava 2,41:1 no escuro para "com as opcionais") */
    ".cx .pill.cx-pill-crit{background:rgba(185,28,28,.08);color:var(--graf-alerta,#b91c1c)}" +
    ".cx .pill.cx-pill-ciclo{background:rgba(245,158,11,.13);color:var(--graf-aviso,#b45309)}" +
    ".cx .pill.cx-pill-opc{background:rgba(100,116,139,.12);color:var(--texto-fraco,#516375)}" +
    ".cx .pill.cx-pill-marco{background:rgba(100,116,139,.12);color:var(--texto,#111d2b)}" +
    /* ⚠ o badge de categoria leva a COR da categoria no fundo e o texto em
       --texto: com o texto na cor da categoria, o cinza da Demolição dava
       ~2,5:1 no branco (e a 11 px, em linha) */
    ".cx .pill.cx-cat{color:var(--texto,#111d2b)}" +
    ".cx-mini{font-size:12px}" +
    ".cx-toggle .cx-knob{width:28px;height:16px;border-radius:99px;background:var(--linha,#c9d6e4);position:relative;flex:none}" +
    ".cx-toggle .cx-knob:after{content:'';position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff}" +
    ".cx-toggle.on{border-color:var(--aco,#0d6ebd)}" +
    ".cx-toggle.on .cx-knob{background:var(--aco,#0d6ebd)}" +
    ".cx-toggle.on .cx-knob:after{left:14px}" +
    ".cx-gantt{overflow-x:auto;max-width:100%}" +
    /* ------------------------------------------------------------------
       SAÚDE DO CRONOGRAMA (.cs). Ao contrário do Gantt e dos dois gráficos de
       baixo, este cartão NÃO é papel branco: ele é tela do app e segue os
       tokens do tema (a régua 4 do cabeçalho vale para o desenho encostado no
       Gantt, não para um cartão de texto). ⚠ As tintas de severidade vão
       inline, calculadas do motor — aqui só a moldura. */
    ".cx .cs{padding:12px 14px;margin:0 0 10px}" +
    ".cs-cab{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap}" +
    ".cs-nota{flex:0 0 auto;border:2px solid var(--linha,#c9d6e4);border-radius:12px;padding:8px 14px;text-align:center;min-width:132px}" +
    ".cs-num{font-size:var(--t-hero,32px);font-weight:600;line-height:1;font-variant-numeric:tabular-nums}" +
    ".cs-den{font-size:13.5px;color:var(--texto-fraco,#64748b)}" +
    ".cs-rot{display:block;font-size:12px;font-weight:600;margin-top:2px}" +
    ".cs-sub{display:block;font-size:12px;color:var(--texto-fraco,#64748b);margin-top:2px}" +
    /* ⚠ a fórmula ocupa a COLUNA QUE SOBRA e não some num "ver mais": é ela
       que impede a pessoa de ler 87 como "87% da obra pronta" */
    ".cs-formula{flex:1 1 320px;min-width:0;font-size:12px;line-height:1.45}" +
    ".cs-f{color:var(--texto-fraco,#64748b);margin:2px 0 6px}" +
    ".cs-teto{color:var(--graf-alerta,#b91c1c);font-weight:600;margin:4px 0}" +
    ".cs-res,.cs-na,.cs-crit{margin:6px 0 0;padding:6px 10px;border-radius:8px;background:var(--surface-2,#eef2f7)}" +
    ".cs-acoes{flex:0 0 auto;display:flex;flex-direction:column;gap:6px;align-items:stretch}" +
    ".cs-piores{margin-top:10px;border-top:1px solid var(--linha,#c9d6e4);padding-top:8px}" +
    ".cs-piores h5{margin:0 0 2px;font-size:13.5px}" +
    ".cs-criterio{margin:0 0 6px;font-size:12px;color:var(--texto-fraco,#64748b)}" +
    ".cs-lista{margin:0;padding-left:20px;font-size:13.5px}" +
    ".cs-lista li{margin-bottom:7px;line-height:1.45}" +
    ".cs-pill{display:inline-block;border-radius:999px;padding:0 7px;font-size:12px;font-weight:600;vertical-align:middle}" +
    ".cs-ir{border:0;background:transparent;color:var(--aco,#0d6ebd);font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;padding:0;text-decoration:underline}" +
    ".cs-dias{white-space:nowrap;font-variant-numeric:tabular-nums}" +
    ".cs-acao,.cs-heu{font-size:12px;color:var(--texto-fraco,#64748b)}" +
    /* ⚠ FECHADO, O CARTÃO NÃO EXISTE: quem fica é o CHIP, na linha do prazo
       (ver CronoExecUI.csChip). Aberto, ele ocupa quase uma tela e empurra a
       1ª barra do Gantt para y=1723 numa janela de 768 px (medido no navegador
       a 1366×768, 12/09/2026) — por isso ele nasce fechado. E fechado não é
       calado: o chip leva a nota e quantos avisos existem, e o `title` leva a
       frase inteira. */
    ".cx .cs-chip{border:1px solid var(--linha,#c9d6e4);background:transparent;font:inherit;font-size:12px;font-weight:600;line-height:18px;cursor:pointer;padding:2px 10px;font-variant-numeric:tabular-nums}" +
    ".cs-chip:hover{background:rgba(13,110,189,.08)}" +
    /* ⚠ O `wrap` E O `min-width:0` NÃO SÃO ENFEITE. Roteiro do defeito (medido
       a 390×844 em 12/09/2026): com a fila de ações em linha e o `nowrap` que
       o flex usa por padrão, as três ações somavam 486 px dentro de um
       `.cs-cab` de 366 — o botão [Replanejar depois de um atraso] nascia com
       `right` 498 numa janela de 390 (56% dele fora), e a aba inteira ganhava
       rolagem lateral (div.cx: scrollWidth 486 × clientWidth 366), que a régua
       do projeto proíbe. O `flex-wrap` do PAI não resolve: o filho sozinho já
       é maior que o contêiner. */
    ".cs-acoes{flex-wrap:wrap;min-width:0}" +
    ".cs-tog{border:0;background:transparent;color:inherit;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;padding:0;margin-right:8px}" +
    ".cs-det{margin:2px 0 4px}" +
    ".cs-det>summary{cursor:pointer;font-size:12px;font-weight:600;color:var(--aco,#0d6ebd)}" +
    /* ⚠ os DIAS vêm antes do texto, e em caixa própria: é por eles que a
       lista está ordenada, e no fim de um parágrafo de 3 linhas (como saíam na
       1ª foto) o número que ordena a lista some do olho */
    ".cs-dias{display:inline-block;background:var(--surface-2,#eef2f7);border-radius:6px;padding:0 6px;font-weight:600;margin-right:4px}" +
    /* NARRATIVA EXECUTIVA (.nr) — o parágrafo em português acima dos KPIs */
    ".nr{margin:0 0 10px;padding:9px 12px;border-left:3px solid var(--aco,#0d6ebd);border-radius:0 8px 8px 0;background:var(--surface-2,#eef2f7)}" +
    ".nr-cab{font-size:12px;font-weight:600;margin-bottom:3px}" +
    ".nr-txt{margin:0;font-size:13.5px;line-height:1.55}" +
    ".nr-falta{margin-top:6px;font-size:11.5px;color:var(--texto-fraco,#64748b)}" +
    ".nr-sem{border-left-color:#b45309;font-size:12.5px}" +
    /* ⚠ A ETIQUETA ".mpp" NÃO É `.cx-rot`: abaixo de 1600 px o rótulo dos
       botões da barra é escondido, e [MS Project (XML)] e [Gerar .mpp] usam o
       MESMO ícone de exportar — medido na foto a 1500 px, os dois viravam
       botões idênticos lado a lado. A etiqueta fica sempre. */
    ".cx-mpp-tag{font-weight:600;font-size:12px;letter-spacing:.2px}" +
    /* SEQUÊNCIA CONSTRUTIVA (.sq) e REPLANEJAMENTO (.rp): moram em UI.modal,
       fora do `.cx` — por isso os seletores não são aninhados nele. */
    ".sq-carimbo,.sq-eco{font-size:12.5px;margin:0 0 8px;padding:7px 10px;border-radius:8px;background:var(--surface-2,#eef2f7);line-height:1.45}" +
    ".sq-lista{display:flex;flex-direction:column;gap:6px;max-height:46vh;overflow:auto}" +
    ".sq-item{display:flex;gap:9px;align-items:flex-start;border:1px solid var(--linha,#c9d6e4);border-radius:8px;padding:7px 10px;cursor:pointer;font-size:12.5px}" +
    /* ⚠ a ligação que fecha laço sozinha nasce MARCADA VISUALMENTE como
       diferente: sem isso a pessoa marca a caixa, aplica e o produto recusa */
    ".sq-item.laco{border-color:#b4530955;background:rgba(245,158,11,.08)}" +
    ".sq-corpo{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto}" +
    ".sq-cat,.sq-niv{font-size:10.5px;border:1px solid var(--linha,#c9d6e4);border-radius:99px;padding:0 6px;color:var(--texto-fraco,#64748b)}" +
    ".sq-porque{color:var(--texto-fraco,#64748b);line-height:1.4}" +
    ".sq-linha{display:flex;gap:10px;flex-wrap:wrap;align-items:baseline;font-size:11.5px}" +
    ".sq-dias{font-weight:600}.sq-dias.bom{color:#15803d}.sq-dias.ruim{color:#b45309}" +
    ".sq-nd,.sq-conf,.sq-hoje{color:var(--texto-fraco,#64748b)}" +
    ".sq-laco{color:#b45309;font-weight:600}" +
    ".sq-dep,.sq-aviso,.sq-espera{font-size:11.5px;color:#b45309}" +
    ".sq-mais,.rp-mais{margin-top:8px;font-size:12.5px}" +
    ".sq-mais summary,.rp-mais summary{cursor:pointer;font-weight:600}" +
    ".rp-cab{font-size:13px;margin:0 0 8px}" +
    ".rp-ord{font-size:12.5px;margin:0 0 6px}" +
    ".rp-lista{display:flex;flex-direction:column;gap:6px;max-height:44vh;overflow:auto}" +
    ".rp-item{display:flex;gap:9px;align-items:flex-start;border:1px solid var(--linha,#c9d6e4);border-radius:8px;padding:7px 10px;cursor:pointer;font-size:12.5px}" +
    ".rp-corpo{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto}" +
    ".rp-tipo{font-size:10.5px;border:1px solid var(--linha,#c9d6e4);border-radius:99px;padding:0 6px}" +
    ".rp-dias{color:#15803d}" +
    ".rp-crit,.rp-porque,.rp-custo,.rp-parcial{font-size:11.5px;color:var(--texto-fraco,#64748b);line-height:1.4}" +
    ".rp-custo,.rp-parcial{color:#b45309}" +
    ".rp-comb{margin-top:8px;padding:7px 10px;border-radius:8px;background:var(--surface-2,#eef2f7);font-size:12.5px;line-height:1.45}" +
    /* DOCUMENTOS (.dx) — também dentro de UI.modal */
    ".dx-lista{display:flex;flex-direction:column;gap:8px}" +
    ".dx-item{border:1px solid var(--linha,#c9d6e4);border-radius:8px;padding:9px 12px}" +
    ".dx-item.off{opacity:.75;background:var(--surface-2,#eef2f7)}" +
    ".dx-nome{font-size:13px}" +
    ".dx-o{font-size:12px;color:var(--texto-fraco,#64748b);margin:2px 0 6px;line-height:1.4}" +
    ".dx-acao{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px}" +
    ".dx-bloq{font-size:12px;color:#b45309}" +
    ".dx-relato{margin:8px 0;padding:8px 11px;border-radius:8px;background:var(--surface-2,#eef2f7);font-size:12.5px;line-height:1.45}" +
    ".cx-mpp-sem{font-size:12px;color:var(--texto-fraco,#64748b);max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".cx-aviso{font-size:12px;margin:6px 0;padding:6px 10px;border-radius:8px;background:rgba(245,158,11,.10);border:1px solid rgba(245,158,11,.35)}" +
    ".cx-tabela{overflow:auto;max-width:100%}" +
    "table.tbl.cx-eap th,table.tbl.cx-eap td,table.tbl.cx-ff th,table.tbl.cx-ff td{padding:6px 8px;white-space:nowrap}" +
    "table.tbl.cx-eap td.cx-nome{width:100%;min-width:300px;white-space:normal}" +
    "table.tbl.cx-eap tr.cx-f td{font-size:13.5px}" +
    "table.tbl.cx-eap tr.cx-s td{font-size:12px;color:var(--texto-fraco,#64748b)}" +
    "table.tbl.cx-ff tr.cx-grupo td{font-weight:600;background:var(--surface-2,#eef2f7)}" +
    ".cx-n{color:var(--texto-fraco,#64748b);font-variant-numeric:tabular-nums;margin-right:4px}" +
    ".cx-chev{border:0;background:transparent;cursor:pointer;color:inherit;font:inherit;font-size:12px;width:20px;padding:0;margin-right:2px}" +
    /* ⚠ a porta "Detalhar em subetapas" é um RÓTULO, não um "+" solto na
       coluna do chevron: ali ela parecia "expandir" e o clique saía da aba */
    ".cx-detsub{border:1px dashed var(--aco,#0d6ebd);background:transparent;color:var(--aco,#0d6ebd);border-radius:999px;font:inherit;font-size:12px;line-height:18px;padding:0 7px;margin-right:6px;cursor:pointer;white-space:nowrap}" +
    /* ⚠ campo editável da subetapa com borda EM REPOUSO: com a borda
       transparente do .cell ele parecia texto, igual à etapa só leitura — e
       editar a folha é o que o modo executivo existe para fazer */
    "table.tbl.cx-eap tr.cx-f input.cell{border-color:var(--linha-forte,#b9c7d6);background:var(--surface,#fff)}" +
    "table.tbl.cx-eap input.cell[readonly]{border-color:transparent;background:var(--surface-2,#eef2f7);cursor:not-allowed}" +
    /* coluna do nome FIXA ao rolar os meses (obra de 13 meses não cabe a 1366) */
    "table.tbl.cx-ff th:first-child,table.tbl.cx-ff td:first-child{position:sticky;left:0;z-index:1;background:var(--surface,#fff)}" +
    "table.tbl.cx-ff tr.cx-grupo td:first-child{background:var(--surface-2,#eef2f7)}" +
    ".cx-barra .cx-faixa{margin:0;flex:1 1 100%;min-width:0}" +
    /* ⚠ A FAIXA DA OBRA É A LINHA 2 DA BARRA (decisão D1 do dono, 14/09/2026).
       Roteiro do defeito que isto fecha (medido na 1.2.77): a faixa dividia a
       linha com as 4 sub-abas e as 4 ações, e os botões [Passar a obra] e
       [Cadastro da obra] moravam DENTRO do chip, cujo texto tinha `width:0` e
       ficava só com a sobra. A 1366 o nome da obra tinha 48 px ("Obra: G…",
       o `min-width:4em`), justo antes de uma ação que mexe em medição; e a
       1600 o `@media (max-width:1599px)` devolvia os rótulos das ações, a
       `.cx-acoes` saltava de 181 para 535 px NUM PIXEL e o chip, que não
       encolhia abaixo do conteúdo, deixava [Cadastro da obra] POR BAIXO de
       [Imprimir / PDF] entre 1600 e ~1700 px (e a 1280): o clique no terço
       direito ia para o PDF.
       Agora: linha 1 = segmentado + ícones N3 (sem rótulo em largura nenhuma,
       sem degrau); linha 2 = o chip (só texto, nome inteiro, no mínimo 16 em)
       e os botões FORA dele, que quebram de linha antes de cobrir alguém.
       Custa ~38 px acima do Gantt, devolvidos pelo cartão de parâmetros numa
       linha só (campos de 32 px e o `.cx-fer` abaixo). */
    ".cx-faixa{row-gap:6px}" +
    ".cx-faixa .btn{flex:0 0 auto;white-space:nowrap}" +
    ".cx-chip{flex:0 1 auto;min-width:0;max-width:100%}" +
    ".cx-chip-txt{min-width:16em;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".cx-modo{flex:1 1 100%;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".cx-faixa-nota{flex:0 1 auto;min-width:8em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    /* cartão compacto: campo de 32 px e 13,5 px só com mouse (acima de 820 px)
       — o alvo de 44 px do toque (app.css) continua valendo no celular. Era
       31, 33 e 35 px com 15 px dentro (número, select e data). */
    "@media (min-width:821px){.cx .card.cx-cartao .field input:not([type=checkbox]),.cx .card.cx-cartao .field select{padding:6px 8px;height:32px;font-size:13.5px;line-height:18px;border-radius:var(--raio-ctl,8px)}}" +
    /* ⚠ a seta do select (12 px) a 7 px da borda e 20 px de vão à direita:
       com 26 px sobravam 64 px de texto no Paralelismo de 100 px e "Médio 30%"
       (69 px em 13,5) saía "Médio 309" — o % cortado lia como um 9 (achado
       na foto da revisão da F5). Agora 72 px; e2e-padrao-cronograma mede cada
       opção contra a área útil. Largura do campo igual: o cartão continua
       numa linha a 1366. */
    ".cx .card.cx-cartao .field select{padding-right:20px;background-position:right 7px center}" +
    "@media (min-width:821px){.cx .card.cx-cartao .field select{padding-left:6px}}" +
    ".cx .card.cx-cartao .field label.cx-lb{font-size:12px;font-weight:500;margin-bottom:2px}" +
    /* as larguras que moravam em `style=` no ui.js (_cronCartao): em linha elas
       escapavam de toda folha */
    ".cx .card.cx-cartao .field .cx-c-ini{width:130px}.cx .card.cx-cartao .field .cx-c-eq{width:52px}.cx .card.cx-cartao .field .cx-c-dias{width:50px}" +
    ".cx .card.cx-cartao .field .cx-c-paral{width:100px}.cx .card.cx-cartao .field .cx-c-custo{width:72px}" +
    /* ⚠ FERIADOS LOCAIS: um botão com a contagem que abre as datas UMA POR
       LINHA. Era um campo de 108 px que mostrava 1 de 4 datas
       ("2026-10-11;") — a pessoa não conferia o que tinha digitado.
       `<details>` e não modal: a MESMA `#cron-feriados-extras` continua no DOM
       (fechada, só não é desenhada) e o Recalcular a lê como sempre — o
       `split(/[;,\n]+/)` de App._cronDoForm já aceita uma data por linha.
       Nada de fiação nova no app.js, nada gravado sem [Recalcular]. */
    /* ⚠ O QUADRO SE ANCORA NA ESQUERDA DO GRUPO, NUNCA NA DIREITA DO BOTÃO.
       `.cx-fer-grupo` = [N datas] + [Recalcular] [Limpar] [IA], sem quebra por
       dentro: o grupo tem ~312 px e o quadro 260, então ancorado em `left:0`
       dele o quadro não passa da borda direita do cartão, e como o grupo
       começa dentro do cartão, não entra por baixo do menu lateral.
       Com `right:0` no `.cx-fer` (a 1ª entrega) o botão que quebrava para o
       começo da linha, a 1024–1100 px com o menu aberto, jogava o quadro para
       x 67–327 e o menu (até 212) cobria as datas (medido na revisão).
       e2e-padrao-cronograma clica de verdade a 1024 e 1100 e confere com
       elementFromPoint que o pixel da 1ª data é a textarea. */
    ".cx-fer-grupo{display:flex;align-items:flex-end;flex-wrap:nowrap;gap:6px;position:relative}" +
    ".cx-fer{display:inline-block}" +
    ".cx-fer>summary{list-style:none}" +
    ".cx-fer>summary::-webkit-details-marker{display:none}" +
    ".cx-fer-quadro{position:absolute;z-index:30;top:calc(100% + 4px);left:0;width:260px;background:var(--surface,#fff);color:var(--texto,#111d2b);border:1px solid var(--linha,#c9d6e4);border-radius:10px;box-shadow:var(--sombra-lg,0 10px 24px rgba(15,39,64,.15));padding:10px}" +
    ".cx .cx-fer-quadro textarea{display:block;width:100%;min-height:128px;font:inherit;font-family:var(--fonte-num,monospace);font-size:13.5px;line-height:1.5;padding:6px 8px;border:1px solid var(--linha-forte,#7e95aa);border-radius:var(--raio-ctl,8px);background-color:var(--surface,#fff);color:var(--texto,#111d2b)}" +
    ".cx-fer-dica{font-size:12px;color:var(--texto-fraco,#516375);margin:6px 0 0;line-height:1.45}" +
    /* celular: o grupo se desfaz (`display:contents`, os quatro voltam a ser
       itens da linha do cartão, como na 1ª entrega) e o quadro abre em fluxo */
    "@media (max-width:820px){.cx-fer-grupo{display:contents}.cx-fer{display:block}.cx-fer-quadro{position:static;width:auto;margin-top:6px}}" +
    /* os 5 campos da tabela (a fatia F6 troca o `style=` deles por estas
       classes): UMA borda só em repouso (--linha-forte) e --aco quando o valor
       foi digitado. Na 1.2.77 saíam três azuis na mesma linha (#7e95aa a 60%,
       #2563eb e #0d6ebd). Especificidade acima de `tr.cx-f input.cell` e do
       `[readonly]` desta folha — e o foco reescrito por isso. */
    "table.tbl.cx-eap input.cell.cx-in{box-sizing:border-box;height:32px;padding:6px 7px;font-size:13.5px;line-height:18px;text-align:right;border:1px solid var(--linha-forte,#7e95aa);border-radius:var(--raio-ctl,8px);background:var(--surface,#fff)}" +
    "table.tbl.cx-eap input.cell.cx-in.cx-in-dig{border-color:var(--aco,#0d6ebd)}" +
    "table.tbl.cx-eap input.cell.cx-in[readonly]{border-color:transparent;background:var(--surface-2,#eef2f7)}" +
    "table.tbl.cx-eap input.cell.cx-in:focus{border-color:var(--aco,#0d6ebd);box-shadow:0 0 0 3px rgba(46,111,158,.13);outline:none}" +
    "table.tbl.cx-eap input.cx-in[data-cron-dur],table.tbl.cx-eap input.cx-in[data-crono-sub-dur]{width:60px}" +
    "table.tbl.cx-eap input.cx-in[data-crono-sub-eq]{width:48px}" +
    "table.tbl.cx-eap input.cx-in[data-cron-pred]{width:84px}table.tbl.cx-eap input.cx-in[data-crono-sub-pred]{width:96px}" +
    ".cx-legenda{font-size:12px;margin-top:6px}" +
    ".cx-legenda .cx-fonte{cursor:default;margin:0 3px 0 0}" +
    /* ------------------------------------------------------------------
       GANTT INTERATIVO (.gx) — duas camadas: a coluna de NOMES fixa e a área
       do TEMPO que rola. ⚠ TUDO AQUI É PAPEL BRANCO, com as tintas cravadas
       (#fff, #f8fafc, #0f172a…) e não em token de tema: é a mesma regra 4 do
       cabeçalho deste arquivo — as cores das categorias das barras foram
       calibradas para fundo claro, e no tema escuro um token trocaria o fundo
       da coluna de nomes mantendo a barra clara ao lado.
       ⚠ `--gx-lw` (largura da coluna de nomes) é declarada na `.gx` e usada
       pelo cabeçalho e pelo corpo: sem a MESMA variável nos dois, o canto do
       zoom e a coluna dos nomes saem com larguras diferentes e a régua nasce
       deslocada dos dias — desalinhamento que o olho lê como data errada. */
    /* ⚠ a MOLDURA não recorta (`overflow:visible`): a dica do arrasto é filha
       da `.gx` e precisa poder passar da borda de baixo. Com o recorte aqui, um
       Gantt de 5 linhas (120 px de altura) cortava a última linha da dica —
       justamente a que diz quantos dias a barra andou (visto na foto do
       navegador). Quem recorta são os painéis, cada um com o seu overflow, e o
       arredondamento volta no cabeçalho e no corpo. */
    ".gx{--gx-lw:300px;position:relative;border:1px solid var(--linha,#e2e8f0);border-radius:8px;background:#fff;color:#0f172a;margin:0 0 2px}" +
    ".gx [hidden]{display:none!important}" +
    /* `position:relative` por causa da faixa fixa do mês (.gx-fixa): ela é
       ABSOLUTA sobre o cabeçalho, que é o único ancestral do Gantt que NÃO
       rola de lado. Presa ao painel que rola, ela rolaria junto e voltaria a
       sumir — que é o defeito que ela existe para fechar. */
    ".gx-cab{display:flex;align-items:stretch;background:#f8fafc;border-bottom:1px solid #e2e8f0;border-radius:7px 7px 0 0;overflow:hidden;position:relative}" +
    /* o mesmo tamanho, peso e cor do rótulo da faixa de cima do SVG (font-size
       9.5, 600, #334155): é o MESMO dado, e dois estilos leriam como dois */
    ".gx-fixa{position:absolute;left:var(--gx-lw);top:0;height:15px;line-height:15px;padding:0 6px 0 3px;font-size:9.5px;font-weight:600;color:#334155;background:#f8fafc;border-right:1px solid #e2e8f0;border-bottom-right-radius:4px;pointer-events:none;white-space:nowrap;z-index:2}" +
    /* ⚠ `overflow:hidden` no canto: no celular a coluna cai para ~138 px e os
       três controles somam ~166 — sem o recorte eles vazavam POR CIMA da régua
       de datas (visto na foto do aparelho). O seletor encolhe junto (`flex`
       com `min-width:0`) em vez de empurrar. */
    ".gx-canto{flex:0 0 var(--gx-lw);box-sizing:border-box;display:flex;gap:4px;align-items:center;padding:4px 6px;border-right:1px solid #e2e8f0;min-width:0;overflow:hidden}" +
    ".gx-regua{flex:1 1 auto;min-width:0;overflow:hidden}" +
    ".gx-regua-in{height:30px}" +
    ".gx-corpo{display:flex;align-items:stretch;position:relative;border-radius:0 0 7px 7px;overflow:hidden}" +
    ".gx-nomes{flex:0 0 var(--gx-lw);box-sizing:border-box;overflow:hidden;border-right:1px solid #e2e8f0;background:#fff}" +
    /* ⚠ `overflow:auto` no painel do tempo e em NENHUM antepassado: é este
       elemento que rola, e é o scrollLeft DELE que o motor lê. Com a rolagem
       num pai, arrastar uma barra até a borda rolaria a página inteira. */
    ".gx-plot{flex:1 1 auto;min-width:0;overflow:auto;outline:none;background:#fff}" +
    ".gx-plot:focus-visible{box-shadow:inset 0 0 0 2px var(--aco,#0d6ebd)}" +
    ".gx-plot-in{position:relative}" +
    ".gx-pegando{cursor:grabbing}" +
    /* ⚠ no dedo, só a ALÇA rouba o gesto do navegador: sem isto o toque na
       barra viraria rolagem e o arrasto nunca começava; e marcando o painel
       inteiro, a rolagem da obra (que é como se lê o cronograma no celular)
       morreria para ganhar um arrasto que quase ninguém faz no telefone */
    ".gx-hit[data-gx-drag],.gx-alca,.gx-liga{touch-action:none}" +
    ".gx-fantasma{position:absolute;z-index:3;pointer-events:none;border:1.5px dashed #0f172a;background:rgba(15,23,42,.10);border-radius:3px;box-sizing:border-box}" +
    ".gx-dica{position:absolute;z-index:5;pointer-events:none;background:#0f172a;color:#fff;font-size:11.5px;line-height:1.4;padding:4px 8px;border-radius:6px;white-space:pre-line;max-width:300px;box-shadow:0 2px 8px rgba(15,23,42,.35)}" +
    /* ⚠ o canto do Gantt é o controle "dentro do papel": 28 px e raio 8 (a
       régua de 32 não cabe no cabeçalho de 36 px sem crescer o cabeçalho, e o
       corpo do Gantt desceria). `.gx .gx-zs` com duas classes porque
       `select:not(.cell)` do app.css (0,1,1) ganhava o padding e a altura
       (medido 30,1 px com 11,5 px dentro). */
    ".gx-zb{flex:0 0 auto;border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:var(--raio-ctl,8px);width:28px;height:28px;padding:0;line-height:1;font:inherit;font-size:15px;cursor:pointer}" +
    ".gx .gx-zs{flex:1 1 auto;min-width:0;border:1px solid #cbd5e1;background-color:#fff;color:#0f172a;border-radius:var(--raio-ctl,8px);font:inherit;font-size:12px;line-height:18px;height:28px;min-height:0;padding:0 22px 0 8px;background-position:right 7px center;max-width:98px}" +
    ".gx-undo{flex:1 1 auto;min-width:0;border:1px solid var(--aco,#0d6ebd);background:#fff;color:var(--aco,#0d6ebd);border-radius:var(--raio-ctl,8px);font:inherit;font-size:12px;line-height:18px;height:28px;padding:0 8px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    /* ⚠ durante o arrasto o cursor é o mesmo em TODA a página: sem o !important
       o `cursor:grab` da alça de baixo do ponteiro vencia, e a mão continuava
       "aberta" enquanto a barra já estava sendo arrastada. */
    "body.gx-arrastando,body.gx-arrastando *{cursor:grabbing!important;-webkit-user-select:none;user-select:none}" +
    /* ⚠ A COLUNA DE NOMES ENCOLHE PELO JS (CronoExecUI.ganttProLabelW), NÃO
       por media query. O `--gx-lw` é escrito no atributo `style` da .gx — e
       atributo vence media query. A regra `@media{.gx{--gx-lw:150px}}` que
       estava aqui NUNCA valeu: num telefone de 390 px a coluna ficava com os
       300 px e sobravam 64 px para a obra inteira (medido no navegador). O
       número tem de sair de um lugar só porque é o MESMO em dois: a largura da
       coluna no CSS e a largura do SVG dos nomes. */
    ".cx-fonte{display:inline-block;min-width:14px;font-family:var(--fonte,sans-serif);font-size:12px;font-weight:600;color:var(--aco,#0d6ebd);cursor:help;margin-left:3px}" +
    ".cx-card{margin-bottom:12px}" +
    ".cx-card h4{margin:0 0 8px;font-size:15px}" +
    ".cx-lista{margin:4px 0 0;padding-left:18px;font-size:13.5px;line-height:1.6}" +
    /* ⚠ a faixa "editando o PLANO DE EXECUÇÃO" tem de se ver: editar o plano
       achando que é a proposta (ou o contrário) é o erro que ela impede */
    ".cx-modo{background:rgba(13,110,189,.10);border:1px solid rgba(13,110,189,.40);border-radius:8px;padding:2px 8px}" +
    ".cx-chipnum{font-variant-numeric:tabular-nums}" +
    /* ------------------------------------------------------------------
       HISTOGRAMA DE MÃO DE OBRA (.hx) e LINHA DE BALANÇO (.lx) — os dois
       painéis que moram ABAIXO do Gantt e compartilham a escala de tempo
       DELE. ⚠ MESMO PAPEL BRANCO do Gantt (regra 4 do cabeçalho): as tintas
       são cravadas porque o desenho é o mesmo papel, encostado embaixo.
       ⚠ `--gx-lw` é a MESMA variável da `.gx`: é ela que faz a coluna da
       esquerda ter a largura exata da coluna de nomes do Gantt — sem isso o
       dia 0 do histograma cai num x diferente do dia 0 da barra logo acima,
       e o olho lê como "a semana do pico não é a semana da etapa".
       ⚠ O painel do tempo aqui NÃO rola sozinho (`overflow:hidden`): quem
       manda no scrollLeft é o Gantt (App._gxPintar). Dois painéis rolando por
       conta própria dessincronizam no primeiro toque de roda, e um gráfico
       de gente deslocado do cronograma é pior que gráfico nenhum. */
    ".hx{--gx-lw:300px;position:relative;border:1px solid var(--linha,#e2e8f0);border-radius:8px;background:#fff;color:#0f172a;margin:6px 0 0}" +
    ".hx-cab{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:4px 8px;background:#f8fafc;border-bottom:1px solid #e2e8f0;border-radius:7px 7px 0 0;font-size:12px;color:#0f172a}" +
    ".hx-cab.so{border-bottom:0;border-radius:7px}" +
    ".hx-tog{border:0;background:transparent;color:inherit;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;padding:2px 4px;border-radius:6px}" +
    ".hx-tog:hover{background:rgba(13,110,189,.10)}" +
    ".hx-corpo{display:flex;align-items:stretch;border-radius:0 0 7px 7px;overflow:hidden}" +
    ".hx-eixo{flex:0 0 var(--gx-lw);box-sizing:border-box;overflow:hidden;border-right:1px solid #e2e8f0;background:#fff}" +
    ".hx-plot{flex:1 1 auto;min-width:0;overflow:hidden;background:#fff}" +
    ".hx-plot.rola{overflow-x:auto}" +
    ".hx-plot-in{position:relative}" +
    /* a régua de honestidade: o pico e as DUAS fontes, sempre visíveis. ⚠ Não
       é um aviso — aviso que sobe em 100% dos casos a pessoa desliga. */
    ".hx-regua{font-size:11.5px;line-height:1.55;margin:4px 0 0;padding:6px 9px;border:1px solid var(--linha,#c9d6e4);border-radius:8px;background:var(--surface-2,#eef2f7)}" +
    ".hx-regua b{font-variant-numeric:tabular-nums}" +
    /* ⚠ O MACROFLUXO ROLA NO PRÓPRIO QUADRO, nunca na página: rede larga é
       normal (a de 8 etapas já dá 728 px, a de 85 nós dá 2.728) e deixar a
       página rolar de lado é o que a régua do projeto proíbe. `max-width:100%`
       no quadro e a largura real no filho. */
    ".fx-plot{overflow:auto;max-width:100%;border:1px solid var(--linha,#e2e8f0);border-radius:8px;background:#fff;margin:6px 0 0}" +
    ".fx-in{position:relative}" +
    ".hx-f{display:block;color:var(--texto-fraco,#64748b)}" +
    ".hx-f b{color:inherit;font-weight:600}" +
    ".hx-leg{display:flex;gap:10px;flex-wrap:wrap;font-size:11px;margin:4px 0 0;color:var(--texto-fraco,#64748b);align-items:center}" +
    ".hx-am{display:inline-block;width:11px;height:11px;border-radius:2px;vertical-align:-1px;margin-right:4px}" +
    ".hx-link{border:0;background:transparent;color:var(--aco,#0d6ebd);font:inherit;font-size:11.5px;text-decoration:underline;cursor:pointer;padding:0}" +
    ".hx-cx{font-size:12px;line-height:1.6;margin:6px 0 0;padding:8px 10px;border:1px solid var(--linha,#c9d6e4);border-radius:8px}" +
    ".hx-cx h5{margin:0 0 4px;font-size:12.5px}" +
    ".hx-cx ul{margin:4px 0 0;padding-left:18px}" +
    ".hx-cx li{margin-bottom:2px}" +
    ".hx-tab{width:100%;border-collapse:collapse;font-size:11.5px;margin-top:4px}" +
    ".hx-tab th,.hx-tab td{text-align:left;padding:3px 6px;border-bottom:1px solid var(--linha,#e2e8f0);white-space:nowrap}" +
    ".hx-tab td.w{white-space:normal;width:100%}" +
    ".hx-rolagem{max-height:230px;overflow:auto}";

  /* CSS do painel previsto × realizado — emitido pelo próprio painelPR, porque
     a ficha da obra (outra tela, sem o <style> da aba) também o desenha */
  var CSS_PR =
    ".cx-pr{font-size:13px}" +
    /* ⚠ o nº EAP antes do nome precisa do espaço AQUI também: a ficha da obra
       não tem o <style> da aba, e na foto saía "2.gServiços" e "3Piscina" */
    ".cx-pr .cx-n{color:var(--texto-fraco,#64748b);font-variant-numeric:tabular-nums;margin-right:5px}" +
    ".cx-pr-cab{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;margin:0 0 8px;font-size:12.5px}" +
    ".cx-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:0 0 10px}" +
    ".cx-pr-comp .cx-kpis{grid-template-columns:repeat(auto-fit,minmax(118px,1fr))}" +
    ".cx-kpi{border:1px solid var(--linha,#c9d6e4);border-radius:10px;padding:8px 10px;background:var(--surface,#fff);min-width:0}" +
    ".cx-kpi-rot{font-size:11px;color:var(--texto-fraco,#64748b);line-height:1.3}" +
    ".cx-kpi-v{font-size:19px;font-weight:600;font-variant-numeric:tabular-nums;margin-top:2px}" +
    ".cx-kpi-sub{font-size:11px;color:var(--texto-fraco,#64748b);margin-top:2px;line-height:1.3}" +
    ".cx-pr-acoes{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 4px}" +
    ".cx-pr-sec{margin:14px 0 6px;font-size:13px}" +
    ".cx-curva{display:block;width:100%;height:auto;background:#fff;border:1px solid var(--linha,#e2e8f0);border-radius:8px}" +
    ".cx-leg{display:flex;gap:14px;flex-wrap:wrap;font-size:11px;margin-top:4px;color:var(--texto-fraco,#64748b)}" +
    /* ⚠ ROLAGEM DENTRO DO PRÓPRIO CONTÊINER (revisão 3, lente UX): o
       `.cx-tabela{overflow:auto}` morava só no CSS da ABA do orçamento; no
       módulo "Cronograma da obra" e na ficha — que só recebem este CSS_PR — a
       tabela (1192 px) e o Gantt (1448 px) empurravam o #main para o lado a
       1366 (scrollLeft 328, a coluna Nº sumia ao rolar). */
    ".cx-pr .cx-tabela,.cx-pr .cx-gantt{overflow-x:auto;max-width:100%}" +
    "table.tbl.cx-pr-tab th,table.tbl.cx-pr-tab td{padding:5px 8px;white-space:nowrap;vertical-align:top}" +
    "table.tbl.cx-pr-tab td.cx-nome{white-space:normal;min-width:220px;width:100%}" +
    "table.tbl.cx-pr-tab tr.cx-pr-et td{font-weight:600}" +
    ".cx-mb{position:relative;height:6px;border-radius:3px;background:var(--surface-2,#eef2f7);margin-top:3px;min-width:120px}" +
    ".cx-mb i{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:#0d6ebd}" +
    ".cx-mb em{position:absolute;top:-2px;bottom:-2px;width:2px;margin-left:-1px;background:#0f172a}" +
    ".cx-sit{display:inline-block;border-radius:99px;padding:1px 8px;font-size:11.5px;font-weight:600}";

  function normDet(d) { return DETALHES.indexOf(d) > -1 ? d : "subetapa"; }
  /* ⚠ REGISTROS DO PLANEJADOR (Onda 0, T8 e T20). As fatias acrescentam
     sub-abas e ações na linha do prazo POR REGISTRO — ninguém edita o
     `render`, a `barra` nem o `cronograma`. Vazios = a tela de sempre, byte a
     byte (tools/test-crono-tomadas.js). Moram no módulo, e não no App: o
     desenho é puro e roda em Node sem ele. */
  var _subsReg = [];
  var _prazoReg = [];
  var _dBarra = null;   // os dados do render corrente, para o `quando` das sub-abas registradas (ver `render`)
  function subReg(id) {
    for (var i = 0; i < _subsReg.length; i++) if (_subsReg[i].id === id) return _subsReg[i];
    return null;
  }
  function subVisivel(id) { for (var i = 0; i < SUBS.length; i++) if (SUBS[i].id === id) return !(SUBS[i].fase && SUBS[i].fase > FASE); return !!subReg(id); }
  /* a sub-aba registrada vale nesta tela? `quando` que lança = não vale (um
     registro com defeito não derruba a aba inteira) */
  function subVale(s, d, est) {
    if (!s) return false;
    if (typeof s.quando !== "function") return true;
    try { return !!s.quando(d, est); } catch (e) { return false; }
  }

  /* resultado com Date NOVOS: o memo entrega o mesmo cálculo a mais de um
     leitor no mesmo render, e um `setDate` num deles (addDiasUteis muda a
     própria data de trabalho) moveria a data do outro calado. */
  function cpNo(n) {
    var c = {}, k, v;
    for (k in n) if (own(n, k)) { v = n[k]; c[k] = ehData(v) ? new Date(v.getTime()) : v; }
    return c;
  }
  function copiaR(r) {
    if (!r) return r;
    var c = cpNo(r);
    c.etapas = arr(r.etapas).map(cpNo);
    if (ehArr(r.atividades)) c.atividades = r.atividades.map(cpNo);
    return c;
  }
  var _memo = { chave: null, v: null };
  /* memos do HISTOGRAMA e da LINHA DE BALANÇO. ⚠ Existem porque `Histograma.montar`
     desce recursivamente na composição analítica de CADA serviço (medido: centenas
     de ms num orçamento grande com a base MG carregada) e `LOB.locaisDe` tokeniza
     TODOS os nomes da EAP. A aba redesenha a cada tecla digitada na tabela; sem
     memo, cada tecla pagaria os dois. */
  var _hmemo = { chave: null, v: null };
  var _lmemo = { chave: null, v: null };
  /* memo da SAÚDE do cronograma: o `CronoSaude.checar` roda a régua inteira a
     cada render da sub-aba, e a 18ª checagem chama o `CronoSeq.conferir` por
     cima. A chave leva o `fundo` porque com o teste do caminho crítico ligado
     o resultado é OUTRO (e custa até 21 `Cronograma.estimar` — medido: 98% do
     custo). Sem o memo, trocar de detalhe ou abrir uma etapa repagaria tudo. */
  var _smemo = { chave: null, v: null };
  /* ASSINATURA DE CONTEÚDO do cálculo do cronograma. ⚠ NÃO é a identidade do
     objeto `r` (o memo do `preparar` devolve CÓPIAS ao 2º leitor do mesmo
     render) e não basta `totalDias`: mudar a duração de uma etapa FORA do
     caminho crítico não move o total, mas move as barras — e move o pico do
     histograma. Número na interface que envelhece calado é o defeito que esta
     linha impede. */
  function assinaR(r) {
    var a = arr(r && r.atividades), i, x, s = 0, n = a.length;
    for (i = 0; i < n; i++) {
      x = a[i];
      s += num0(x.inicio) * 7 + num0(x.fim) * 13 + num0(x.equipeDias) * 3 + num0(x.quantidade) * 0.5 +
        String(x.nome == null ? "" : x.nome).length + String(x.codigo == null ? "" : x.codigo).length * 11;
    }
    return n + ":" + Math.round(s * 100) + ":" + num0(r && r.totalDias) + ":" + ((r && r.dataInicio && r.dataInicio.getTime) ? r.dataInicio.getTime() : 0);
  }

  var CronoExecUI = {
    DETALHES: DETALHES,
    SUBS: SUBS,
    FASE: FASE,
    CSS: CSS,

    /* ------------------------------------------------------------------
       DADOS — o cálculo que a aba precisa, UMA vez por render.
       ⚠ DESEMPENHO: estimar com a árvore EAP + Orcamento.calcular +
       Orcamento.valoresEAP custam dezenas de ms num orçamento grande, e a
       aba chamava o motor várias vezes por render. `opts.tok` é o contador
       de App.render: dentro do mesmo render o cálculo é reaproveitado; no
       render seguinte (algo mudou) é refeito. Sem token, sem memo.
       Nenhuma DATA depende do ctx (I4): `r.etapas` é o de `estimar(orc)`.
       ------------------------------------------------------------------ */
    preparar: function (orc, opts) {
      opts = opts || {};
      // ⚠ o id do orçamento na chave: dois orçamentos no mesmo render não podem receber o mesmo cronograma
      var chave = (opts.tok != null && orc) ? String(opts.tok) + "|" + orc.id : null;
      /* ⚠ o PLANO DE EXECUÇÃO da obra (CronoBase.orcComPlano) tem o MESMO id do
         orçamento: sem a marca na chave, a proposta e o plano desenhados no
         mesmo render receberiam um o cronograma do outro */
      if (chave && orc._planoDaObra) chave += "|plano:" + orc._planoDaObra;
      if (chave && _memo.chave === chave) return this._copiaDados(_memo.v);
      var v = this._calcular(orc);
      if (!chave) return v;
      /* ⚠ cópia só no ACERTO do memo: copiar no 1º acesso custava ~5 ms por
         render (+32%) para um memo que hoje não tem segundo leitor (medido na
         revisão da Fase 2). O 1º leitor recebe o ORIGINAL — ⚠ não mutar as
         datas do resultado (o desenho só lê); os leitores seguintes do mesmo
         render recebem cópias com Date novos. */
      _memo.chave = chave; _memo.v = v;
      return v;
    },
    _copiaDados: function (v) { return { r: copiaR(v.r), valores: v.valores, ms: v.ms, memo: true }; },
    _calcular: function (orc) {
      var Cr = C(), O = (typeof Orcamento !== "undefined") ? Orcamento : G("Orcamento");
      var t0 = Date.now(), calc = null, valores = null;
      try { if (O && O.calcular) calc = O.calcular(orc); } catch (e) { calc = null; }
      try { if (O && O.valoresEAP) valores = O.valoresEAP(orc); }
      catch (e2) { valores = { ok: false, motivo: "não consegui calcular o valor de venda por subetapa (" + String((e2 && e2.message) || e2) + ")" }; }
      var ctx = { eap: true };
      if (calc) ctx.calc = calc;
      /* ⚠ valores com ok:false NÃO vão ao motor: ele poria o aviso "a coluna
         de valor fica em branco" em toda aba, e a tabela nem tem coluna de
         valor — o motivo aparece onde o valor é usado (Físico-financeiro). */
      if (valores && valores.ok === true) ctx.valores = valores;
      var r = Cr.estimar(orc, null, ctx);
      return { r: r, valores: valores, ms: Date.now() - t0 };
    },

    /* estado de TELA (nunca do orçamento) lido do App; tudo com padrão.
       `chave` (planejador, 1C) = o alvo ("orc:<id>" | "plano:<obraId>"): a
       busca, o filtro e a pilha são POR ALVO — o orçamento e o plano da obra
       têm o mesmo id, e a pilha de um não pode desfazer o outro (achado 12.1
       do desenho USO). */
    estado: function (app, orc, chave) {
      var id = orc && orc.id, ex = (orc && orc.cronograma && orc.cronograma.exec) || {};
      function de(m) { return (app && app[m] && typeof app[m] === "object" && own(app[m], id)) ? app[m][id] : null; }
      var sub = de("_cronoSub"); if (!subVisivel(sub)) sub = "cronograma";
      var det = de("_cronoDet");
      if (DETALHES.indexOf(det) < 0) det = DETALHES.indexOf(ex.detalhe) > -1 ? ex.detalhe : "subetapa";
      var ab = de("_cronoAbertas"); if (!ab || typeof ab !== "object" || ehArr(ab)) ab = {};
      var ff = de("_cronoFF") || {};
      /* ⚠ a camada do físico-financeiro é "etapa" | "folha" | "servico" (o
         nome do Cronograma.periodos), NÃO a lista de detalhes: validada contra
         DETALHES, "folha" virava "etapa" e o botão Subetapa não fazia nada
         (achado pela suíte, 11/09/2026) */
      /* ZOOM / linha escolhida / desfazer do arrasto — estado de TELA, como
         tudo nesta função (regra 3 do cabeçalho). ⚠ O nível de zoom NUNCA vai
         para o orçamento: ele é de quem está olhando, não da proposta — gravado
         ali, mudaria o `atualizadoEm` a cada roda do mouse, sincronizaria à toa
         e esbarraria na trava do aprovado. */
      var zm = de("_cronoZoom"); if (!zm || typeof zm !== "object" || ehArr(zm)) zm = {};
      /* o desfazer de UM nível (`_cronoDesf`) virou a pilha por alvo (1C): o
         rótulo do próximo desfazer vem dela e só serve de chave de forma ao
         desenho (o ↶ saiu do canto e foi para a barra de uso) */
      var uso = this.estadoUso(app, chave || (id != null ? "orc:" + id : ""));
      var Pi = MOD("CronoPilha", "./cronopilha.js");
      var df = (uso.pilha && Pi && uso.pilha.cursor > 0) ? { resumo: Pi.rotulo(uso.pilha, "desfazer") } : null;
      /* HISTOGRAMA e LINHA DE BALANÇO — estado de TELA como todo o resto desta
         função (regra 3 do cabeçalho). ⚠ `aberto:false` é o padrão de
         propósito: montar o histograma exige a base analítica de ~18 MB, e
         quem só quer ver o cronograma não pode pagar essa franquia por ter
         passado pela aba. O `teto` fica em TEXTO — o motor aceita "3,5" em BR
         e é ele quem recusa o que não é número, com o motivo. */
      var hs = de("_cronoHist"); if (!hs || typeof hs !== "object" || ehArr(hs)) hs = {};
      /* SAÚDE DO CRONOGRAMA — estado de TELA. `fundo` é o pedido explícito do
         teste do caminho crítico: ele custa até 21 `Cronograma.estimar`
         inteiros (medido: 4.839 ms de 4.854 ms num orçamento de 2.400
         serviços, 98% do custo), e por isso NUNCA nasce ligado no render.
         Quem o liga é o botão [Conferir a fundo]. */
      var sa = de("_cronoSaude"); if (!sa || typeof sa !== "object" || ehArr(sa)) sa = {};
      /* ⚠ A PONTE .mpp é da MÁQUINA, não do orçamento: o estado mora no app
         inteiro (App._cronoMpp), e por isso é lido fora do `de(...)`. */
      var mp = (app && app._cronoMpp && typeof app._cronoMpp === "object") ? app._cronoMpp : null;
      return { sub: sub, detalhe: det, abertas: ab, mpp: mp, uso: uso,
        saude: { aberto: sa.aberto === true, fundo: sa.fundo === true, calculando: sa.calculando === true },
        zoom: { nivel: zm.nivel || "auto", sel: zm.sel == null ? -1 : zm.sel, desfazer: (df && df.resumo) ? String(df.resumo) : "",
          // a escala do "Ajustar" mantida enquanto se edita (ver GanttUI.estado): estado de TELA, como o nível
          diasAjuste: (Number(zm.diasAjuste) >= 1) ? Number(zm.diasAjuste) : null },
        /* ⚠ `lob` é TRI-ESTADO (true / false / null): o padrão dele depende do
           que o motor achou — aberto quando HÁ repetição, fechado quando não
           há. Com um booleano, "nunca clicou" e "clicou para fechar" seriam a
           mesma coisa, e o painel não fecharia nunca na obra repetitiva. */
        hist: { aberto: hs.aberto === true, periodo: hs.periodo === "mes" ? "mes" : "semana",
          teto: hs.teto == null ? "" : String(hs.teto), carregando: hs.carregando === true,
          fora: hs.fora === true, lob: (hs.lob === true || hs.lob === false) ? hs.lob : null,
          /* o macrofluxo mora no mesmo saco (é o 3º painel de baixo). ⚠ Booleano
             seco, e não o tri-estado do `lob`: aqui não há "abrir sozinho
             quando há o que mostrar" — a rede sempre tem o que desenhar, e
             aberta ela ocupa centenas de px. */
          fluxo: hs.fluxo === true },
        ff: { camada: CAMADAS.indexOf(ff.camada) > -1 ? ff.camada : "etapa", modo: ff.modo === "pct" ? "pct" : "valor" } };
    },

    /* ------------------------------------------------------------------
       OBRA do orçamento — pela CADEIA `revisaoDe` (espec 3.2): a obra pode
       estar ligada a este orçamento ou a qualquer revisão anterior dele.
       ⚠ Sem a cadeia, a revisão -R1 de um orçamento com obra aparecia "sem
       obra" — e a porta natural seria criar outra obra, com a medição em
       dobro (o avanço anterior é por obra). `podeVer(obra)` filtra o que o
       usuário não pode ver (RBAC por módulo e por obra): o nome não aparece.
       ------------------------------------------------------------------ */
    obraDaCadeia: function (orc, orcamentos, obras, podeVer) {
      var porId = {}, ids = {}, cadeia = [], vistos = {}, cur = orc, n = 0;
      arr(orcamentos).forEach(function (o) { if (o && o.id) porId[o.id] = o; });
      while (cur && cur.id && !own(vistos, cur.id) && n++ < 60) {
        vistos[cur.id] = true; ids[cur.id] = cadeia.length; cadeia.push(cur);
        var pai = cur.revisaoDe;
        if (!pai) break;
        /* ancestral apagado da lista: o id dele ainda casa a obra */
        if (!own(porId, pai)) { if (!own(ids, pai)) ids[pai] = cadeia.length; break; }
        cur = porId[pai];
      }
      /* ⚠ A FAMÍLIA INTEIRA DE REVISÕES, não só a subida (revisão 3 da Fase 3,
         lente dinheiro). Com a obra passada para a R1 — que é exatamente o que
         [Passar a obra para esta revisão] produz —, abrir a R0 subia a cadeia
         a partir da R0, não achava obra e oferecia [Criar obra]: a segunda obra
         nascia com o acumulado anterior ZERADO nos itens que a primeira já
         mediu (Gestao._pctAnterioresPorItem é por obra), medição em dobro.
         O mesmo com revisões irmãs (R1 e R2 da mesma R0). Então: toda obra
         ligada a QUALQUER revisão da família (descendentes dos ancestrais,
         o próprio orçamento incluído) conta — só não vira alvo de edição (ela
         planeja e mede pelo orçamento ligado a ela). */
      var filhos = {}, familia = {}, fila = [], desc = {}, g = 0, k;
      arr(orcamentos).forEach(function (o) { if (o && o.id && o.revisaoDe) (filhos[o.revisaoDe] = filhos[o.revisaoDe] || []).push(o.id); });
      for (k in ids) if (own(ids, k)) { familia[k] = true; fila.push(k); }
      while (fila.length && g++ < 5000) {
        var pk = fila.shift();
        arr(filhos[pk]).forEach(function (fid) { if (!own(familia, fid)) { familia[fid] = true; fila.push(fid); } });
      }
      // as MAIS NOVAS (descendentes deste orçamento): o recado diz "revisão mais nova"
      if (orc && orc.id) { fila = [orc.id]; g = 0; while (fila.length && g++ < 5000) { var dk = fila.shift(); arr(filhos[dk]).forEach(function (fid) { if (!own(desc, fid)) { desc[fid] = true; fila.push(fid); } }); } }
      var achadas = [], ocultas = 0, outras = [], ocultasOutras = 0;
      arr(obras).forEach(function (ob) {
        if (!ob || !ob.orcamentoId) return;
        if (own(ids, ob.orcamentoId)) {
          if (podeVer && !podeVer(ob)) { ocultas++; return; }
          var nv = ids[ob.orcamentoId];
          achadas.push({ obra: ob, nivel: nv, orcNumero: cadeia[nv] ? (cadeia[nv].numero || "") : "" });
          return;
        }
        if (!own(familia, ob.orcamentoId)) return;
        if (podeVer && !podeVer(ob)) { ocultasOutras++; return; }
        var oo = porId[ob.orcamentoId];
        outras.push({ obra: ob, orcId: String(ob.orcamentoId), orcNumero: oo ? (oo.numero || "") : "", maisNova: own(desc, ob.orcamentoId) });
      });
      achadas.sort(function (a, b) { return a.nivel - b.nivel; });
      return { obras: achadas, ocultas: ocultas, cadeia: cadeia.length, cadeiaIds: Object.keys(ids),
        outras: outras, ocultasOutras: ocultasOutras };
    },
    /* os ids do orçamento e dos ancestrais dele (a cadeia `revisaoDe`), para
       saber se um plano/linha de base "é deste orçamento" — as revisões
       conservam os ids das etapas; um orçamento de fora da cadeia, não */
    cadeiaIds: function (orc, orcamentos) { return this.obraDaCadeia(orc, orcamentos, [], null).cadeiaIds; },

    /* ------------------------------------------------------------------
       LINHAS VISÍVEIS — o que o Gantt e a tabela mostram, pelo TIPO do nó
       (nunca pela profundidade: serviço solto de etapa sem subetapa fica na
       mesma profundidade de uma subetapa, e filtrar por nível punha 40
       serviços no Gantt de todo orçamento sem subetapa).
         etapa    → etapas
         subetapa → etapas + subetapas/"serviços gerais" (folhas)
         servico  → tudo
       `abertas[etapaId] === false` recolhe a etapa (estado de tela).
       ------------------------------------------------------------------ */
    /* ⚠ TOMADAS DO PLANEJADOR (Onda 0, T7), as duas AUSENTES = a lista de
       sempre, byte a byte:
         opts.intercalar(lista, r) → a lista com linhas a mais (a 2A põe as
           tarefas sem preço depois do bloco da etapa `apos`); devolver algo
           que não é lista = ignorado;
         opts.manter = {id: true} → descarta as linhas cujo id não está nele (o
           filtro da 1C). Roda DEPOIS do intercalar: o filtro vale também para
           as linhas intercaladas.
       ⚠ O Gantt, a tabela e a fiação do arrasto usam ESTA lista (o nó é achado
       pelo índice da linha): filtrar em um só dos três faria a pessoa arrastar
       uma barra e outra se mover. */
    linhas: function (r, opts) {
      opts = opts || {};
      var det = normDet(opts.detalhe), ab = opts.abertas || {}, out = [], nos = arr(r && r.atividades);
      if (!nos.length || det === "etapa") {
        arr(r && r.etapas).forEach(function (e, i) { out.push({ tipo: "etapa", i: i, et: e, no: null }); });
        return CronoExecUI._linhasTomadas(out, r, opts);
      }
      var aberta = true;
      nos.forEach(function (n) {
        if (n.tipo === "etapa") { aberta = ab[n.id] !== false; out.push({ tipo: "etapa", i: n.etapaIdx, et: r.etapas[n.etapaIdx], no: n }); return; }
        if (!aberta) return;
        if (n.tipo === "subetapa" || n.tipo === "soltos") { out.push({ tipo: "folha", no: n }); return; }
        if (n.tipo === "servico" && det === "servico") out.push({ tipo: "servico", no: n });
      });
      return CronoExecUI._linhasTomadas(out, r, opts);
    },
    _linhasTomadas: function (out, r, opts) {
      if (typeof opts.intercalar === "function") {
        var ic = opts.intercalar(out, r);
        if (ehArr(ic)) out = ic;
      }
      var mt = opts.manter;
      if (mt && typeof mt === "object") {
        out = out.filter(function (l) {
          var n = l && (l.no || l.et);
          return !!n && own(mt, n.id) && !!mt[n.id];
        });
      }
      return out;
    },
    temFolhas: function (r) {
      var nos = arr(r && r.atividades);
      for (var i = 0; i < nos.length; i++) if (nos[i].tipo === "subetapa" || nos[i].tipo === "soltos") return true;
      return false;
    },
    /* há linha abaixo da etapa nesse detalhe (com tudo aberto)? */
    temFilhos: function (r, detalhe) {
      var L = this.linhas(r, { detalhe: detalhe, abertas: {} });
      for (var i = 0; i < L.length; i++) if (L[i].tipo !== "etapa") return true;
      return false;
    },

    /* ------------------------------------------------------------------
       GANTT HIERÁRQUICO (tela e PDF). opts:
         detalhe, abertas — como `linhas`;
         papel  — versão de documento: largura fixa, sem rolagem;
         de, ate — fatia de linhas (paginar o PDF: cada página redesenha a
                   régua de tempo);
         hoje   — Date ou "AAAA-MM-DD" (linha hoje; sem ele, hoje);
         limpo  — versão do CLIENTE: sem folga, setas, crítico e hoje (ver o
                  porquê em UI._gantt: "folga de 3 dias" na proposta é
                  convite a negociar a reserva de chuva);
         semLegenda.
       ⚠ ESCALA EM PX POR DIA ÚTIL com piso: obra longa não pode espremer um
       ano em 700 px (uma semana virava 13 px e a subetapa de 2 dias sumia).
       Abaixo do piso o desenho ganha largura mínima e o CONTÊINER rola na
       horizontal — a página nunca rola de lado.
       ------------------------------------------------------------------ */
    gantt: function (r, opts) {
      opts = opts || {};
      var Cr = C(), self = this;
      if (!r || !arr(r.etapas).length) return "";
      var papel = !!opts.papel, limpo = !!opts.limpo, det = normDet(opts.detalhe);
      /* ⚠ MODO PRO (12/09/2026) — o MESMO desenho servindo à tela de DUAS
         CAMADAS (`ganttPro`): `opts.pro` é o que o `ganttProEstado` monta
         (estado do GanttUI + janela visível + permissões de arrasto por linha).
         O que ele muda: a coluna de nomes SAI daqui (vai para o painel fixo), a
         escala deixa de ser "cabe na largura" e passa a ser o px/dia do nível
         de zoom, só as linhas da janela são desenhadas, e as ALÇAS do arrasto
         entram por cima. Uma segunda cópia do desenho apodreceria contra o PDF
         (é o mesmo motivo de `réplica de parser apodrece`) — e é o PDF que o
         cliente recebe. ⚠ SEM `opts.pro` a saída é a de sempre, byte a byte: é
         o que a suíte `ganttSemOptsIgual` cobra e o que segura as 38
         instalações, o PDF, a proposta e o painel da obra. */
      var pro = (opts.pro && typeof opts.pro === "object" && opts.pro.e) ? opts.pro : null;
      /* ⚠ TOMADAS DO PLANEJADOR (Onda 0, T7) — cada uma AUSENTE = o desenho de
         sempre, byte a byte (tools/test-crono-tomadas.js e `ganttSemOptsIgual`):
           opts.manter / opts.intercalar → repassados ao `linhas` (filtro da 1C,
             linhas das tarefas sem preço da 2A);
           opts.camadas = {antes(ctx), depois(ctx)} → SVG por baixo e por cima
             das barras (sombreamento, linha do corte, folgas, marcadores);
           opts.barraDe(no, geo) → devolve o SVG que SUBSTITUI a barra daquela
             linha, ou null para a barra de sempre.
         Quem desenha o novo chama estas portas; ninguém edita este corpo. */
      var L = pro ? arr(pro.L) : this.linhas(r, { detalhe: det, abertas: opts.abertas, manter: opts.manter, intercalar: opts.intercalar });
      var gCam = (opts.camadas && typeof opts.camadas === "object") ? opts.camadas : null;
      var gBarraDe = typeof opts.barraDe === "function" ? opts.barraDe : null;
      if (!pro && (opts.de != null || opts.ate != null)) L = L.slice(opts.de || 0, opts.ate == null ? L.length : opts.ate);
      /* PREVISTO × REALIZADO (Fase 3): `opts.base` = {id: {ini, fim}} (datas
         "AAAA-MM-DD" da linha de base) desenha a barra FANTASMA atrás da barra
         de hoje; `opts.realizado` = {id: pct} desenha a fração executada dentro
         dela. As datas da base viram índice de dia útil no calendário DESTE
         cálculo (com feriado — a régua das barras). ⚠ Base que termina depois
         do plano de hoje ALARGA o desenho: cortada na borda, a obra que
         recuperou o atraso pareceria ter prometido menos. Sem os dois opts o
         desenho é o de antes, byte a byte. */
      var gBase = (opts.base && typeof opts.base === "object") ? opts.base : null;
      var gReal = (opts.realizado && typeof opts.realizado === "object") ? opts.realizado : null;
      var janB = {}, maxB = 0;
      if (gBase) {
        var calG = null;
        try { calG = Cr && Cr.calendario ? Cr.calendario(r) : null; } catch (eCg) { calG = null; }
        var limG = Math.ceil((r.totalDias || 1) * 4) + 400;
        var idxG = function (sd) {
          var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(sd || ""));
          if (!m || !calG) return null;
          var jg = calG.indice(new Date(+m[1], +m[2] - 1, +m[3]).getTime(), limG);
          return jg < 0 ? 0 : jg;
        };
        L.forEach(function (l) {
          var idB = l.no ? l.no.id : l.et.id, b = own(gBase, idB) ? gBase[idB] : null;
          if (!b || !b.ini) return;
          var bi = idxG(b.ini), bf = idxG(b.fim || b.ini);
          if (bi == null || bf == null) return;
          if (bf < bi) bf = bi;
          janB[idB] = { i: bi, f: bf, di: b.ini, df: b.fim || b.ini };
          if (bf > maxB) maxB = bf;
        });
      }
      var dias = Math.max(r.totalDias || 1, maxB), rowH = papel ? 20 : 24, top = 30, labelW = papel ? 250 : 300;
      var W0 = 1000, pxMin = papel ? 0 : 3;
      var W = Math.max(W0, labelW + 14 + Math.ceil(dias * pxMin));
      var plotW = W - labelW - 14, pxDia = plotW / dias;
      var h = top + L.length * rowH + 10, dpw = (r.params && r.params.diasUteisSemana) || 5;
      /* JANELA VISÍVEL: fora do modo pro é o desenho inteiro (o PDF não rola).
         ⚠ O recorte de DIAS vale só para a GRADE; a barra de uma linha visível
         se desenha INTEIRA — recortada pelos dias, a barra que começa antes da
         janela sumiria justo quando a pessoa rola até ela (regra do GanttUI). */
      var lin0 = 0, lin1 = L.length - 1;
      if (pro) {
        rowH = pro.e.rowH; top = 0; labelW = 0;
        dias = pro.e.dias; pxDia = pro.e.pxDia;
        W = Math.max(1, pro.e.larguraConteudo); plotW = W;
        h = Math.max(rowH, pro.e.alturaConteudo);
        lin0 = pro.jan.primeiraLinha; lin1 = pro.jan.ultimaLinha;
      }
      var yTopo = pro ? 0 : top - 2, yBase = pro ? h : h - 6;
      function X(d) { return labelW + Math.max(0, Math.min(dias, d || 0)) * pxDia; }
      function yRow(i) { return top + i * rowH; }
      function yc(i) { return yRow(i) + rowH / 2; }
      var idx = {}, numEt = {};
      r.etapas.forEach(function (e, i) { numEt[e.id] = i + 1; });
      L.forEach(function (l, i) { idx[l.no ? l.no.id : l.et.id] = i; });
      /* ⚠ no modo pro o SVG tem o tamanho REAL do conteúdo em px (é ele que o
         navegador rola) — `width:100%` o encolheria de volta para a janela e a
         rolagem morreria. Moldura e cantos são do painel `.gx`, não do SVG.
         E `gantt-exec` só com detalhe abaixo da etapa: é assim que a aba por
         etapa continua sendo lida como o desenho por etapa (test-cronoexecui,
         `etapaUsaAntigo`). */
      var s = pro
        ? '<svg class="gantt' + (det !== "etapa" ? ' gantt-exec' : '') + '" data-gx="plot-svg" width="' + f1(W) + '" height="' + f1(h) +
          '" viewBox="0 0 ' + f1(W) + ' ' + f1(h) + '" style="display:block;background:#fff;font-family:inherit">'
        : '<svg class="gantt gantt-exec" viewBox="0 0 ' + W + ' ' + h + '" style="width:100%;' + (W > W0 ? 'min-width:' + W + 'px;' : '') +
          'background:#fff;border:1px solid var(--linha,#e2e8f0);border-radius:8px;font-family:inherit">';
      // faixa das linhas de ETAPA: o olho acha o começo de cada bloco sem ler número
      L.forEach(function (l, i) { if (i >= lin0 && i <= lin1 && l.tipo === "etapa" && L.length > r.etapas.length) s += '<rect x="0" y="' + yRow(i) + '" width="' + W + '" height="' + rowH + '" fill="#f1f5f9"/>'; });
      // a linha ESCOLHIDA pelo teclado (setas): sem realce, navegar por teclado é andar no escuro
      if (pro && pro.sel >= lin0 && pro.sel <= lin1) s += '<rect x="0" y="' + yRow(pro.sel) + '" width="' + f1(W) + '" height="' + f1(rowH) + '" fill="#0d6ebd" fill-opacity="0.08"/>';
      // régua: meses (calendário real, com feriado) em cima, semanas embaixo
      var cal = pro ? pro.cal : null;
      if (!pro) { try { cal = Cr && Cr.calendario ? Cr.calendario(r) : null; } catch (eC) { cal = null; } }
      if (pro) {
        /* ⚠ A GRADE SAI DAS MESMAS MARCAS DA RÉGUA (GanttUI.regua), não de uma
           conta própria: o rótulo do mês mora no painel de cima e a linha aqui
           embaixo — calculados por caminhos diferentes, ficavam alguns pixels
           um ao lado do outro, e o olho lê a linha da grade como se fosse a
           data do rótulo. */
        var mg = pro.Gu ? pro.Gu.regua(pro.e, pro.cal) : null;
        arr(mg && mg.marcas).forEach(function (m) {
          s += '<line x1="' + f1(m.x) + '" y1="0" x2="' + f1(m.x) + '" y2="' + f1(h) + '" stroke="' + (m.forte ? "#cbd5e1" : "#eef2f7") + '" stroke-width="1"/>';
        });
      } else if (cal) {
        var MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"], mAnt = -1, xAnt = -999;
        for (var k = 0; k <= dias; k++) {
          var dk = cal.dia(k); if (!ehData(dk)) break;
          var mk = dk.getFullYear() * 12 + dk.getMonth();
          if (mk !== mAnt) {
            var xm = X(k);
            s += '<line x1="' + f1(xm) + '" y1="2" x2="' + f1(xm) + '" y2="' + (h - 6) + '" stroke="#cbd5e1" stroke-width="1"/>';
            if (xm - xAnt >= 34) { s += '<text x="' + f1(xm + 3) + '" y="11" font-size="9" fill="#475569">' + MES[dk.getMonth()] + '/' + String(dk.getFullYear()).slice(2) + '</text>'; xAnt = xm; }
            mAnt = mk;
          }
        }
      }
      if (!pro) {
        var nSem = Math.max(1, Math.ceil(dias / dpw)), passo = Math.max(1, Math.ceil(nSem / Math.max(1, Math.floor(plotW / 34))));
        for (var sm = 0; sm <= nSem; sm += passo) {
          var gx = X(sm * dpw);
          s += '<line x1="' + f1(gx) + '" y1="' + (top - 4) + '" x2="' + f1(gx) + '" y2="' + (h - 6) + '" stroke="#e2e8f0" stroke-width="1"/>';
          if (sm < nSem) s += '<text x="' + f1(gx + 3) + '" y="' + (top - 7) + '" font-size="8.5" fill="#94a3b8">S' + (sm + 1) + '</text>';
        }
      }
      // linha de HOJE com feriado (Cronograma.diaUtilDoCorte, a mesma régua das barras)
      var hojeX = null;
      if (!limpo) {
        var j = null;
        try { j = Cr.diaUtilDoCorte(r, opts.hoje); } catch (eH) { j = null; }
        if (j != null && j <= dias) hojeX = X(j);
      }
      // no previsto × realizado a linha é a DATA DE CORTE (o dia que os números descrevem), não hoje
      var rotHoje = opts.rotHoje || "hoje";
      if (hojeX != null) s += '<line x1="' + f1(hojeX) + '" y1="' + yTopo + '" x2="' + f1(hojeX) + '" y2="' + yBase + '" stroke="' + HOJE + '" stroke-width="1.2" stroke-dasharray="4,3"><title>' + esc(rotHoje) + '</title></line>';

      function numF(n) { return n && n.numero ? n.numero : ""; }
      var porIdNo = {};
      arr(r.atividades).forEach(function (n) { porIdNo[n.id] = n; });
      function textoPreds(n, ehEtapa) {
        if (!n.preds || !n.preds.length) return ehEtapa ? "início da obra" : "início da etapa";
        if (ehEtapa) return Cr.predsTexto(n, numEt);
        var mp = {}; n.preds.forEach(function (p) { mp[p] = numF(porIdNo[p]); });
        return Cr.predsTextoSub(n, mp);
      }
      function tituloBarra(n, rot, ehEtapa) {
        var t = rot + (n.marco ? " — MARCO (sem duração) · " + dma(n.dataInicio)
          : " — " + n.duracao + " dia(s) útil(eis) · " + dma(n.dataInicio) + " → " + dma(n.dataFim));
        if (!limpo && n.tipo !== "servico") t += n.critico ? " · CRÍTICA (sem folga)" : " · folga de " + (n.folga || 0) + " dia(s)" + (ehData(n.dataLimite) ? ", até " + dma(n.dataLimite) : "");
        if (!limpo && n.tipo !== "servico") t += " · depende de: " + textoPreds(n, ehEtapa);
        if (n.tipo === "subetapa" || n.tipo === "soltos") {
          if (n.escala === "escalada" && n.duracaoRede !== n.duracao) t += " · a rede das subetapas pede " + n.duracaoRede + " d; desenhada dentro da duração da etapa";
          if (n.comprimida) t += " · ⚠ etapa curta demais: sobrepõe outra subetapa";
        }
        if (n.tipo === "servico" && FONTES[n.fonte]) t += " · " + FONTES[n.fonte][1];
        return esc(t);
      }
      /* rótulos (recuo por nível, nº EAP, até 48 caracteres com o nome inteiro
         no <title>). ⚠ No modo pro eles NÃO saem daqui: moram no painel fixo
         da esquerda (ganttProNomes), que é o que não rola quando a área do
         tempo rola de lado. */
      if (!pro) L.forEach(function (l, i) {
        var n = l.no || l.et, prof = l.no ? (l.no.prof || 0) : 0;
        var num = l.no ? l.no.numero : String(l.i + 1), nome = n.nome || "";
        var txt = corta(num + " " + nome, 48), y = yRow(i) + rowH / 2 + 3.5;
        var peso = l.tipo === "etapa" ? ' font-weight="600"' : (n.critico && !limpo ? ' font-weight="600"' : "");
        var cor = l.tipo === "servico" ? "#64748b" : (l.tipo === "etapa" ? "#0f172a" : "#334155");
        s += '<text x="' + (6 + prof * 14) + '" y="' + y + '" font-size="' + (l.tipo === "servico" ? 9.5 : 10) + '" fill="' + cor + '"' + peso + '><title>' + esc(num + " " + nome) + '</title>' + esc(txt) + '</text>';
      });
      /* a LINHA DE BASE atrás da barra: tracejada e sem a cor da categoria —
         é o combinado, não o plano de hoje; a barra de hoje vem por cima */
      if (gBase) L.forEach(function (l, i) {
        if (i < lin0 || i > lin1) return;
        var idB = l.no ? l.no.id : l.et.id, jb = own(janB, idB) ? janB[idB] : null;
        if (!jb) return;
        s += '<rect class="gantt-base" x="' + f1(X(jb.i)) + '" y="' + (yRow(i) + 2) + '" width="' + f1(Math.max(3, (jb.f - jb.i) * pxDia)) + '" height="' + (rowH - 4) +
          '" rx="3" fill="#cbd5e1" fill-opacity="0.35" stroke="#475569" stroke-width="1" stroke-dasharray="4,2"><title>' + esc("linha de base: " + dmaS(jb.di) + " → " + dmaS(jb.df)) + '</title></rect>';
      });
      /* fração EXECUTADA (realPct do nó — a régua do confronto) numa faixa
         escura no pé da barra: quem lê o Gantt vê quanto da janela já foi feito */
      function realBar(n, x, w, y, hh) {
        if (!gReal || !own(gReal, n.id) || gReal[n.id] == null) return "";
        var pr = Math.max(0, Math.min(100, Number(gReal[n.id]) || 0));
        if (!(pr > 0)) return "";
        return '<rect class="gantt-real" x="' + f1(x) + '" y="' + y + '" width="' + f1(Math.max(1, w * pr / 100)) + '" height="' + hh + '" fill="#0f172a" opacity="0.6"><title>' + esc("executado: " + pct(pr, 1)) + '</title></rect>';
      }
      /* a GEOMETRIA que as camadas e o `barraDe` recebem (planejador, T7): as
         mesmas funções de posição deste desenho — uma camada que calculasse o
         x por conta própria sairia deslocada da barra no primeiro zoom */
      var gGeo = (gCam || gBarraDe) ? { r: r, L: L, X: X, yRow: yRow, yc: yc, rowH: rowH, pxDia: pxDia, dias: dias, W: W, h: h,
        lin0: lin0, lin1: lin1, pro: pro, papel: papel, limpo: limpo, labelW: labelW, top: top, cal: cal, idx: idx, detalhe: det } : null;
      if (gCam && typeof gCam.antes === "function") s += String(gCam.antes(gGeo) || "");
      /* barras. ⚠ Os números de duração ("61d") vão para `rotDur` e são
         desenhados DEPOIS das setas, com contorno branco: desenhados antes, a
         seta crítica vertical passava por cima do "61d" de Pilares e cortava o
         "65d" do resumo na borda do papel (foto do e2e, tela e PDF). */
      var rotDur = "", HALO = ' stroke="#fff" stroke-width="2.4" paint-order="stroke"';
      /* ⚠ AS ALÇAS DO ARRASTO SÃO DESENHADAS POR ÚLTIMO, por cima de TUDO
         (setas e números inclusive): são retângulos transparentes, e é neles
         que o ponteiro bate. Desenhadas junto com a barra, uma seta de
         dependência que cruzasse a barra roubaria o mousedown da barra que a
         pessoa quer arrastar — e o arrasto simplesmente "não pegava" em
         algumas linhas, calado. Sem `pro` nenhuma alça é desenhada: o PDF não
         tem mouse. */
      var gxAlca = "";
      L.forEach(function (l, i) {
        if (i < lin0 || i > lin1) return;
        var n = l.no || l.et, y0 = yRow(i), cor = n.cor || (Cr.cat(n.categoria) || {}).cor || CINZA;
        var rot = (l.no ? l.no.numero : String(l.i + 1)) + " " + (n.nome || "");
        var ehEtapa = l.tipo === "etapa", resumo = ehEtapa && l.no && l.no.papel === "resumo" && det !== "etapa";
        var crit = !!n.critico && !limpo;
        if (l.tipo === "servico" && (n.semBase || n.inicio == null)) {
          s += '<text x="' + (labelW + 4) + '" y="' + (y0 + rowH / 2 + 3) + '" font-size="8.5" fill="#94a3b8">sem quantidade — sem barra</text>';
          return;
        }
        var x = X(n.inicio), w = Math.max(3, (Math.min(dias, n.fim) - Math.max(0, n.inicio)) * pxDia);
        if (pro) gxAlca += self._gxAlcas(pro, l, n, i, x, w, y0, rowH, tituloBarra(n, rot, ehEtapa));
        /* a barra SUBSTITUÍDA por quem a registrou (planejador, T7): a alça do
           arrasto já saiu acima (ela é por linha, não por desenho) */
        if (gBarraDe) {
          var subst = gBarraDe(n, { geo: gGeo, l: l, i: i, x: x, w: w, y0: y0, rot: rot, ehEtapa: ehEtapa, resumo: resumo, crit: crit, titulo: tituloBarra(n, rot, ehEtapa) });
          if (subst != null) { s += String(subst); return; }
        }
        if (n.marco) {
          var cy = y0 + rowH / 2, rr = l.tipo === "servico" ? 5 : 7;
          s += '<polygon class="gantt-marco' + (crit ? ' gantt-critica' : '') + '" points="' + f1(x) + ',' + (cy - rr) + ' ' + f1(x + rr) + ',' + cy + ' ' + f1(x) + ',' + (cy + rr) + ' ' + f1(x - rr) + ',' + cy + '" fill="' + (crit ? CRIT : '#0f172a') + '"><title>' + tituloBarra(n, rot, ehEtapa) + '</title></polygon>';
          return;
        }
        if (resumo) {
          // barra de RESUMO estilo MS Project: fina, escura, colchetes nas pontas
          var yr = y0 + rowH / 2 - 4, x1 = x + w;
          s += '<rect class="gantt-resumo' + (crit ? ' gantt-critica' : '') + '" x="' + f1(x) + '" y="' + yr + '" width="' + f1(w) + '" height="5" fill="' + RESUMO + '"' + (crit ? ' stroke="' + CRIT + '" stroke-width="1.2"' : '') + '><title>' + tituloBarra(n, rot, true) + '</title></rect>';
          s += realBar(n, x, w, yr + 5, 3);
          s += '<polygon class="gantt-colchete" points="' + f1(x) + ',' + yr + ' ' + f1(x + 6) + ',' + yr + ' ' + f1(x) + ',' + (yr + 10) + '" fill="' + RESUMO + '"/>';
          s += '<polygon class="gantt-colchete" points="' + f1(x1 - 6) + ',' + yr + ' ' + f1(x1) + ',' + yr + ' ' + f1(x1) + ',' + (yr + 10) + '" fill="' + RESUMO + '"/>';
          rotDur += '<text x="' + f1(Math.min(W - 26, x1 + 4)) + '" y="' + (yr + 6) + '" font-size="8.5" fill="#475569"' + HALO + ' pointer-events="none">' + n.duracao + 'd</text>';
          return;
        }
        var hb = l.tipo === "servico" ? 7 : (ehEtapa ? 16 : 13), yb = y0 + (rowH - hb) / 2;
        var folga = n.folga || 0;
        if (folga > 0 && !limpo && l.tipo !== "servico") {
          var wF = Math.max(2, Math.min(folga, dias - n.fim) * pxDia);
          if (wF > 0) s += '<rect class="gantt-folga" x="' + f1(x + w) + '" y="' + yb + '" width="' + f1(wF) + '" height="' + hb + '" rx="3" fill="' + cor + '" fill-opacity="0.13" stroke="' + cor + '" stroke-opacity="0.55" stroke-dasharray="3,3"><title>folga: pode ir até ' + dma(n.dataLimite) + ' sem atrasar a obra</title></rect>';
        }
        var cls = l.tipo === "servico" ? "gantt-serv" : ("gantt-barra" + (l.tipo === "folha" ? " gantt-folha" : "") + (crit ? " gantt-critica" : ""));
        s += '<rect class="' + cls + '" x="' + f1(x) + '" y="' + yb + '" width="' + f1(w) + '" height="' + hb + '" rx="' + (l.tipo === "servico" ? 2 : 3) + '" fill="' + cor + '" opacity="' + (l.tipo === "servico" ? 0.55 : 0.92) + '"' +
          (crit && l.tipo !== "servico" ? ' stroke="' + CRIT + '" stroke-width="1.4"' : '') + '><title>' + tituloBarra(n, rot, ehEtapa) + '</title></rect>';
        if (l.tipo !== "servico") s += realBar(n, x, w, yb + hb - 4, 4);
        if (l.tipo !== "servico") {
          if (w >= 30) rotDur += '<text x="' + f1(x + w - 4) + '" y="' + (yb + hb / 2 + 3) + '" font-size="8.5" font-weight="600" fill="#fff" text-anchor="end" pointer-events="none">' + n.duracao + 'd</text>';
          else rotDur += '<text x="' + f1(Math.min(W - 24, x + w + 3)) + '" y="' + (yb + hb / 2 + 3) + '" font-size="8.5" fill="#64748b"' + HALO + ' pointer-events="none">' + n.duracao + 'd</text>';
        }
      });
      // setas, por cima das barras (como no MS Project)
      /* ⚠ O CAMINHO DA SETA MORA EM `caminhoElo` (planejador, T7), extraído
         SEM MUDAR UM BYTE: é lá que a 2A acrescenta TT, IT, cruzado e extra, e
         o SVG das setas TI/II continua o de hoje em todas as ondas. */
      function seta(px, py, sx, sy, cor, cls, larg, tracejada) {
        return self.caminhoElo("TI", px, py, sx, sy, { cor: cor, cls: cls, larg: larg, tracejada: tracejada, labelW: labelW, rowH: rowH });
      }
      /* ⚠ no modo pro a seta sai quando QUALQUER uma das duas pontas está na
         janela — não só a sucessora. Cortada pela sucessora, a seta que vem de
         uma etapa lá em cima desaparecia ao rolar, e a linha visível ficava
         parecendo solta na rede. */
      function foraDaJanela(si, pi) { return pro && (si < lin0 || si > lin1) && (pi < lin0 || pi > lin1); }
      /* ⚠ PLANEJADOR 2A — OS QUATRO TIPOS, O ELO CRUZADO E A TAREFA SEM PREÇO.
         Sem `predTipoRede`, sem `porExtras` e sem linha T, TUDO abaixo cai nos
         mesmos dois ramos de sempre (TI entre etapas, TI/II entre folhas) e o
         SVG sai byte a byte o de hoje — é o que a `test-crono-tomadas` compara
         com o desenho da 1.2.81 e a fixtura `ui-gantt-pre2a.js` confere.
         De onde a seta SAI e onde ela CHEGA (O6):
           TI → fim da predecessora → início da sucessora
           II → início              → início
           TT → fim                 → FIM
           IT → início              → FIM
         ⚠ O RÓTULO DO TI NÃO MUDA UM BYTE (é o de hoje, "+7d"). Os outros levam
         o TIPO na frente ("TT+2d"), e a espera é a DIGITADA (`predLagTipo`, a
         régua do tipo) — não a equivalente de TI que a sombra grava (O20).
         Mostrar a equivalente faria a pessoa copiar da tela, para o campo, um
         número que ela nunca digitou (O23).
         `opts.eloRotulos === false` (a camada "Rótulos das ligações"
         desligada, D30) tira TODOS os rótulos. */
      var eloRot = opts.eloRotulos !== false, GuS = GU();
      function pontaTipo(tp, p, sn) { return { px: X(tp === "II" || tp === "IT" ? p.inicio : p.fim), sx: X(tp === "TT" || tp === "IT" ? sn.fim : sn.inicio) }; }
      function geomDe(tp, interna) { return (tp === "TT" || tp === "IT") ? tp : (interna && tp === "II" ? "II" : "TI"); }
      function rotuloElo(tp, lagTipo, lagTI, px2, sx2) {
        if (!eloRot) return null;
        if (tp === "TI") return (lagTI != null && sx2 >= px2 + 12) ? ((lagTI >= 0 ? "+" : "") + lagTI + "d") : null;
        var L2 = lagTipo != null ? lagTipo : 0;
        return tp + (L2 > 0 ? "+" + L2 + "d" : (L2 < 0 ? L2 + "d" : ""));
      }
      function textoElo(txt, x1, x2, yy, cor2) {
        return '<text class="gantt-lag" x="' + f1((x1 + x2) / 2) + '" y="' + (yy - 4) + '" font-size="8.5" fill="' + cor2 + '" text-anchor="middle" pointer-events="none">' + esc(txt) + '</text>';
      }
      if (!limpo) L.forEach(function (l, si) {
        var sN = l.no || l.et;
        if (l.tipo === "etapa" || l.tipo === "extra") {
          // EXTERNA etapa → etapa: fica vermelho só o elo que APERTA duas críticas (ver UI._gantt)
          (sN.preds || []).forEach(function (pid) {
            var pi = idx[pid]; if (pi == null || foraDaJanela(si, pi)) return;
            var pL = L[pi], p = pL.no || pL.et;
            var tp = (sN.predTipoRede && sN.predTipoRede[pid]) || ((l.tipo === "extra" && sN.predTipo && sN.predTipo[pid]) || "TI");
            var verm = (GuS ? GuS.eloAperta(sN, p, pid, r.params)
              : sN.inicio === Math.max(0, p.fim + ((sN.predDesloc && sN.predDesloc[pid] != null) ? sN.predDesloc[pid] : -Math.floor(((r.params && r.params.paralelismo) || 0) * p.duracao)))) && sN.critico && p.critico;
            var ehT = l.tipo === "extra" || pL.tipo === "extra";
            var cor = verm ? CRIT : (ehT ? ROXO_T : CINZA);
            var pt = pontaTipo(tp, p, sN);
            s += self.caminhoElo(geomDe(tp, false), pt.px, yc(pi), pt.sx, yc(si),
              { cor: cor, cls: "gantt-dep" + (verm ? " gantt-dep-critica" : "") + (ehT ? " cx-dep-t" : ""), larg: verm ? 1.8 : 1.1, tracejada: ehT, labelW: labelW, rowH: rowH, limite: W - 2 });
            var lagE = sN.predLag && sN.predLag[pid];
            var lagT = (sN.predLagTipo && sN.predLagTipo[pid] != null) ? sN.predLagTipo[pid] : null;
            var rt = rotuloElo(tp, lagT, lagE == null ? null : lagE, pt.px, pt.sx);
            if (rt) s += textoElo(rt, pt.px, pt.sx, yc(pi), cor);
          });
          /* O ELO CRUZADO (O26): a chave de `predTipoRede` que NÃO está em
             `preds` é o id da SUBETAPA predecessora — o motor guarda o tipo
             pela folha e o deslocamento pela etapa. A seta sai da linha da
             subetapa, para a pessoa ver de onde vem o piso. */
          if (sN.predTipoRede || sN.predLagTipo) {
            var vistosC = {};
            [sN.predTipoRede, sN.predLagTipo].forEach(function (mp) {
              if (!mp) return;
              Object.keys(mp).forEach(function (fid) {
                if (own(vistosC, fid) || (sN.preds || []).indexOf(fid) > -1) return;
                vistosC[fid] = 1;
                var fi = idx[fid]; if (fi == null || foraDaJanela(si, fi)) return;
                var pf = L[fi].no || L[fi].et; if (!pf || pf.inicio == null) return;
                var tpc = (sN.predTipoRede && sN.predTipoRede[fid]) || "TI";
                var ptc = pontaTipo(tpc, pf, sN);
                s += self.caminhoElo(geomDe(tpc, false), ptc.px, yc(fi), ptc.sx, yc(si),
                  { cor: AZUL_ELO, cls: "gantt-dep cx-dep-cruz", larg: 1.2, tracejada: true, labelW: labelW, rowH: rowH, limite: W - 2 });
                var rtc = rotuloElo(tpc, sN.predLagTipo ? sN.predLagTipo[fid] : null, null, ptc.px, ptc.sx);
                if (rtc) s += textoElo(rtc, ptc.px, ptc.sx, yc(fi), AZUL_ELO);
              });
            });
          }
          /* A TAREFA SEM PREÇO QUE SEGURA A ETAPA (`porExtras`): a seta sai da
             linha T. Sem ela, a etapa andaria e nada na tela diria por quê —
             que é exatamente o defeito da data fixada invisível. */
          arr(sN.porExtras).forEach(function (q) {
            if (!q || q.id == null) return;
            var qi = idx[q.id]; if (qi == null || foraDaJanela(si, qi)) return;
            var qn = L[qi].no || L[qi].et; if (!qn || qn.inicio == null) return;
            var tpx = q.tipo || "TI", ptx = pontaTipo(tpx, qn, sN);
            s += self.caminhoElo(geomDe(tpx, false), ptx.px, yc(qi), ptx.sx, yc(si),
              { cor: ROXO_T, cls: "gantt-dep cx-dep-t", larg: 1.2, tracejada: true, labelW: labelW, rowH: rowH, limite: W - 2 });
            var rtx = rotuloElo(tpx, q.lag != null ? q.lag : null, null, ptx.px, ptx.sx);
            if (rtx) s += textoElo(rtx, ptx.px, ptx.sx, yc(qi), ROXO_T);
          });
          return;
        }
        if (l.tipo !== "folha") return;
        // INTERNA folha → folha (mesma etapa), tracejada; II sai do INÍCIO da predecessora
        (sN.preds || []).forEach(function (pid) {
          var pi = idx[pid]; if (pi == null || foraDaJanela(si, pi)) return;
          var p = L[pi].no; if (!p || p.inicio == null) return;
          var tpf = (sN.predTipoRede && sN.predTipoRede[pid]) || ((sN.predTipo && sN.predTipo[pid] === "II") ? "II" : "TI");
          var verm = sN.critico && p.critico, cor = verm ? CRIT : INTERNA;
          if (tpf === "II") {
            var px = X(p.inicio), sx = X(sN.inicio), py = yRow(pi) + rowH - 4, sy = yc(si);
            s += self.caminhoElo("II", px, py, sx, sy, { cor: cor, cls: "gantt-dep gantt-dep-int", larg: 1, tracejada: true, labelW: labelW, rowH: rowH });
          } else if (tpf === "TI") s += seta(X(p.fim), yc(pi), X(sN.inicio), yc(si), cor, "gantt-dep gantt-dep-int", 1, true);
          else {
            var ptf = pontaTipo(tpf, p, sN);
            s += self.caminhoElo(geomDe(tpf, true), ptf.px, yc(pi), ptf.sx, yc(si),
              { cor: cor, cls: "gantt-dep gantt-dep-int", larg: 1, tracejada: true, labelW: labelW, rowH: rowH, limite: W - 2 });
          }
          /* ⚠ O RÓTULO DO TIPO SÓ SAI COM A REDE DESTA VERSÃO (`predTipoRede`).
             Roteiro do defeito (medido em 21/09/2026 contra o desenho da
             1.2.81): o II LEGADO (o de `sub.tipos`, que existe desde sempre)
             passou a ganhar um rótulo "II" que nunca existiu — 6.914 bytes
             contra 6.790 no mesmo orçamento. Dado velho desenha igual ao de
             ontem; só o que foi digitado NESTA versão ganha marca nova. */
          var tpNovo = (sN.predTipoRede && sN.predTipoRede[pid]) || null;
          if (tpNovo && tpNovo !== "TI") {
            var rtf = rotuloElo(tpNovo, sN.predLagTipo ? sN.predLagTipo[pid] : null, null, X(p.fim), X(sN.inicio));
            if (rtf) s += textoElo(rtf, X(p.fim), X(sN.inicio), yc(pi), cor);
          }
        });
      });
      // a camada POR CIMA das barras e das setas, e ainda por baixo dos números e das alças (planejador, T7)
      if (gCam && typeof gCam.depois === "function") s += String(gCam.depois(gGeo) || "");
      s += rotDur + gxAlca + '</svg>';   // os números de duração por cima das setas (ver `rotDur`), e as alças por cima de tudo
      // no modo pro quem monta a moldura, a régua e a legenda é o `ganttPro`
      if (pro) return s;
      var envolto = papel ? s : '<div class="cx-gantt">' + s + '</div>';
      if (limpo || opts.semLegenda) return envolto;
      function amostra(css) { return '<span style="display:inline-block;width:16px;' + css + ';vertical-align:middle;margin-right:5px"></span>'; }
      return envolto + '<div class="muted" style="font-size:11px;margin-top:4px;display:flex;gap:16px;flex-wrap:wrap;align-items:center">' +
        '<span>' + amostra('height:0;border-top:2px solid ' + CRIT) + 'caminho crítico (sem folga)</span>' +
        '<span>' + amostra('height:0;border-top:2px solid ' + CINZA) + 'dependência entre etapas</span>' +
        '<span>' + amostra('height:0;border-top:2px dashed ' + INTERNA) + 'dependência entre subetapas</span>' +
        '<span>' + amostra('height:5px;background:' + RESUMO) + 'resumo da etapa</span>' +
        '<span>' + amostra('width:12px;height:10px;border:1px dashed ' + CINZA + ';border-radius:2px') + 'folga</span>' +
        (gBase ? '<span>' + amostra('width:12px;height:10px;border:1px dashed #475569;background:rgba(203,213,225,.35);border-radius:2px') + 'linha de base (o combinado)</span>' : '') +
        (gReal ? '<span>' + amostra('height:4px;background:#0f172a;opacity:.6') + 'executado (faixa escura no pé da barra)</span>' : '') +
        (hojeX != null ? '<span>' + amostra('height:0;border-top:2px dashed ' + HOJE) + esc(rotHoje) + '</span>' : '') +
        (W > W0 ? '<span>role o desenho para o lado para ver a obra inteira</span>' : '') +
        '</div>';
    },

    /* O CAMINHO DE UMA SETA DE DEPENDÊNCIA (planejador, Onda 0, T7; ramos
       TT e IT da 2A), com a ponta. Extraído do `gantt` SEM MUDAR UM BYTE
       (crítica 2, achado 15: não há exceção de bytes): "TI" é o `seta()` de
       sempre (sai do FIM da predecessora; volta pelo corredor quando a
       sucessora começa antes) e "II" é o caminho entre subetapas que sai do
       INÍCIO. Tipo desconhecido → "".
       `geo` = {cor, cls, larg, tracejada, labelW, rowH, corredor?, limite?}.

       ⚠ Para dado só com TI/II legado o SVG das setas é o de hoje em TODAS as
       ondas: tools/test-crono-tomadas.js o compara com o motor da 1.2.81,
       tools/test-ganttui.js compara o `UI._gantt` inteiro com a fixture
       tools/fixtures/ui-gantt-pre2a.js (capturada ANTES da 2A) e a e2e
       `e2e-gantt-rede` confere o SVG da tela.

       ⚠ POR QUE TT E IT ENTRAM PELA DIREITA, COM A PONTA PARA A ESQUERDA
       Os dois terminam no FIM da sucessora, não no início dela. Com a ponta
       do TI (que aponta para a direita), a seta entraria por dentro da barra
       da sucessora e o olho leria "começa aqui" no lugar de "termina junto" —
       era o desenho do MS Project ao contrário. Por isso o caminho é o
       espelho do TI: corre até 6 px à direita do ponto mais à direita dos
       dois, desce (ou sobe) e volta para a ponta.
       `geo.corredor` = o deslocamento vertical do corredor do TI (ausente =
       `rowH / 2`, o valor de sempre — é assim que o `UI._gantt`, que tem
       rowH 30 e conta 15 na mão, sai byte a byte). `geo.limite` = a borda
       direita do desenho, para o corredor do TT não sair do SVG.

       ⚠ "cruzado" e "extra" NÃO são geometria: um elo que sai da subetapa de
       outra etapa, ou de uma tarefa sem preço, é um TI/II/TT/IT como qualquer
       outro — o que muda é a CLASSE (`cls`) e o rótulo, e isso é de quem
       chama. Um quinto ramo aqui seria um apelido de TI que apodreceria
       contra ele (memória "réplica de parser apodrece"). */
    caminhoElo: function (tipo, px, py, sx, sy, geo) {
      geo = geo || {};
      var cor = geo.cor, cls = geo.cls, larg = geo.larg, d, pta;
      var corr = (geo.corredor != null && isFinite(Number(geo.corredor))) ? Number(geo.corredor) : geo.rowH / 2;
      if (tipo === "II") d = "M" + f1(px) + "," + py + " V" + sy + " H" + f1(sx - 1);
      else if (tipo === "TI") {
        if (sx >= px + 12) d = "M" + f1(px) + "," + py + " H" + f1(sx - 5) + " V" + sy + " H" + f1(sx - 1);
        else {
          var faixa = py + (sy > py ? corr : -corr), volta = Math.max(geo.labelW + 2, sx - 6);
          d = "M" + f1(px) + "," + py + " H" + f1(px + 5) + " V" + faixa + " H" + f1(volta) + " V" + sy + " H" + f1(sx - 1);
        }
      } else if (tipo === "TT" || tipo === "IT") {
        if (sx <= px - 12) d = "M" + f1(px) + "," + py + " H" + f1(sx + 5) + " V" + sy + " H" + f1(sx + 1);
        else {
          var volT = Math.max(sx, px) + 6, lim = Number(geo.limite);
          if (isFinite(lim) && lim > sx + 6) volT = Math.min(lim, volT);
          d = "M" + f1(px) + "," + py + " H" + f1(volT) + " V" + sy + " H" + f1(sx + 1);
        }
        pta = '<polygon points="' + f1(sx) + ',' + sy + ' ' + f1(sx + 5) + ',' + (sy - 3) + ' ' + f1(sx + 5) + ',' + (sy + 3) + '" fill="' + cor + '"/>';
      } else return "";
      return '<path class="' + cls + '" d="' + d + '" fill="none" stroke="' + cor + '" stroke-width="' + larg + '"' + (geo.tracejada ? ' stroke-dasharray="3,2"' : '') + ' opacity="0.9"/>' +
        (pta || '<polygon points="' + f1(sx) + ',' + sy + ' ' + f1(sx - 5) + ',' + (sy - 3) + ' ' + f1(sx - 5) + ',' + (sy + 3) + '" fill="' + cor + '"/>');
    },

    /* ==================================================================
       GANTT INTERATIVO (ganttPro) — arrastar, zoom e rolagem
       ==================================================================
       O pedido do dono (12/09/2026): "onde mostra as barras do cronograma
       precisa ter a opção de edição por arrastar e opção de dar zoom, rolar
       para um lado e para o outro". Aqui está o DESENHO; a conta é do
       js/ganttui.js e a fiação (mouse, teclado, gravar) é do App._gx*.

       ⚠ POR QUE DUAS CAMADAS, E NÃO UM SVG SÓ
       O Gantt de sempre desenha o nome e a barra no MESMO SVG. Rolar de lado
       leva o nome junto: a pessoa chega no mês 9 da obra e não sabe mais de
       que etapa é a barra que está olhando. Por isso a coluna de nomes é um
       painel PRÓPRIO, que só rola na vertical, e o tempo é outro, que rola nos
       dois sentidos — com a MESMA altura de linha e o MESMO scrollTop. Quem
       mantém os dois casados é a fiação (App._gxPintar), e quem garante que a
       linha `i` cai no mesmo y nos dois é `rowH` sair de um lugar só
       (GX_ROWH → estado do GanttUI → os dois desenhos).

       ⚠ O QUE NÃO MUDA: o PDF, a proposta, o MS Project, o desembolso e o
       painel previsto × realizado continuam chamando `gantt()` SEM `opts.pro`
       — e essa saída é byte a byte a de antes.
       ------------------------------------------------------------------ */
    GX_ROWH: 24,
    GX_LABELW: 300,
    GX_REGUA: 30,
    /* altura padrão da área do tempo quando a tela ainda não foi medida (o
       desenho é puro: no 1º pintar não existe DOM para perguntar). ⚠ 520 não é
       gosto: é ~21 linhas, perto do que o Gantt de hoje ocupa com 18 linhas
       (30 + 18×24 + 10 = 472) — maior que isso e a 1ª barra de quem tem pouca
       etapa passaria a nascer com um vazio embaixo. */
    GX_ALTURA: 520,
    // a calha da barra de rolagem horizontal do painel do tempo (ver `caixa`)
    GX_BARRA: 14,
    /* AS COLUNAS Dur. e Depende de, à direita dos nomes (quem as desenha é a
       grade da F6; a LARGURA é daqui, porque é ela que empurra o dia 0). */
    GX_GRADE_DUR: 50,
    GX_GRADE_PRED: 84,
    // abaixo desta largura de widget as colunas não cabem ao lado do tempo
    GX_GRADE_LARGURA: 1000,
    // o cabeçalho do Gantt (canto + régua) e a legenda: o que não é corpo
    /* ⚠ +GX_USO (1C): a barra de uso (busca, filtro, ↶ ↷, Histórico) é a 1ª
       faixa DENTRO da moldura. Sem somar aqui, o modo "preencher" da janela
       destacada e a faixa da alça de altura contariam 40 px a menos e a
       legenda sairia da tela (as regressões D2/M3 da 1.2.80 nasceram assim). */
    GX_USO: 40,
    GX_CABECALHO: 78,
    GX_LEGENDA: 50,

    /* o detalhe que o Gantt REALMENTE desenha: sem árvore (ou sem nenhuma
       linha abaixo da etapa) cai para "etapa".
       ⚠ DONO ÚNICO de propósito: a tela decide a lista de linhas e a fiação do
       arrasto acha o nó pelo ÍNDICE DE LINHA. Duas contas de detalhe = duas
       listas de linha = a pessoa arrasta uma barra e outra se move. */
    detalheEfetivo: function (r, det) {
      if (!ehArr(r && r.atividades) || (r.exec && r.exec.erro)) return "etapa";
      var d = normDet(det);
      return (d !== "etapa" && this.temFilhos(r, d)) ? d : "etapa";
    },

    /* A LARGURA DA COLUNA DE NOMES, pela largura do WIDGET inteiro.
       ⚠ DONO ÚNICO: este número é usado em dois lugares que precisam bater no
       pixel — a variável CSS `--gx-lw` (a coluna e o canto do zoom) e a
       largura do SVG dos nomes. Decidido em dois lugares, o rótulo sai cortado
       no meio ou flutuando por cima da barra.
       ⚠ E ele encolhe: num telefone de 390 px, 300 px de nome deixavam 64 px
       para a obra inteira — o cronograma virava uma faixa cinza. O nome
       completo continua no <title> de cada rótulo.
       ⚠ `preferido` (a largura que a pessoa arrastou, F7) passa SEMPRE por
       `Paineis.limitar` contra a largura de AGORA; abaixo de 560 ela é
       ignorada (a proporção manda no celular) e sem medida também (aba
       oculta mede 0: o padrão é melhor que uma conta sobre zero).
       ⚠ Isto é a largura do NOME. Onde começa o dia 0 é `colW` (nome +
       colunas Dur./Depende de): ver `ganttProEstado`. */
    ganttProLabelW: function (larguraWidget, preferido, gradeW) {
      var w = Number(larguraWidget);
      if (!isFinite(w) || w <= 0) return this.GX_LABELW;
      if (w < 560) return Math.max(96, Math.round(w * 0.38));
      var P = (preferido != null) ? PN() : null;
      if (P) {
        var v = P.limitar("gxNomes", preferido, { larguraWidget: w, gradeW: Number(gradeW) > 0 ? Number(gradeW) : 0 });
        if (v != null && isFinite(v) && v > 0) return v;
      }
      if (w < 920) return 200;
      return this.GX_LABELW;
    },
    /* A LARGURA DAS COLUNAS Dur./Depende de: 0 sem a grade ou abaixo de
       GX_GRADE_LARGURA. Sem medida (1ª pintura, pura) assume a tela de mesa —
       a fiação remede antes de o quadro ser pintado (_cronoGanttLigar). */
    ganttProGradeW: function (colunas, larguraWidget, cols) {
      if (colunas !== true) return 0;
      var w = Number(larguraWidget);
      if (isFinite(w) && w > 0 && w < this.GX_GRADE_LARGURA) return 0;
      var l = ehArr(cols) ? cols : this.colunasGrade(null, null), t = 0, i;
      for (i = 0; i < l.length; i++) t += Number(l[i].larg) || 0;
      return t;
    },

    /* AS COLUNAS DA GRADE, POR MODO (planejador 2A).
         Planejar: Dur. · Depende de · Calendário
         Avançar:  % · Início real · Fim real
       ⚠ NO MODO AVANÇAR, "Dur." E "Depende de" SAEM. A pessoa está lançando
       o que ACONTECEU; editar o plano na mesma linha em que se lança o real
       é a origem do "eu só ia digitar 60%" — e o plano de uma obra em
       andamento é o que sustenta medição e contrato. A faixa do modo diz
       onde elas voltam.
       ⚠ A COLUNA CALENDÁRIO SÓ NASCE COM CALENDÁRIO CRIADO: vazia, seriam 78
       px roubados do tempo em toda obra do mundo que nunca vai usar frente
       própria.
       ⚠ DONO ÚNICO: o canto (títulos), as células do SVG, a posição do campo
       sobreposto e o Tab leem ESTA lista. Em quatro lugares, uma coluna a
       mais sairia com o cabeçalho de uma e o valor de outra. */
    GX_GRADE_CAL: 78,
    GX_GRADE_PCT: 46,
    GX_GRADE_DATA: 66,
    COL_DUR: { campo: "dur", titulo: "Dur.", dica: "Duração em dias úteis (0 = marco)" },
    COL_PRED: { campo: "pred", titulo: "Depende de", dica: "Nº das etapas (ou subetapas) que precisam terminar antes" },
    colunasGrade: function (r, o) {
      o = o || {};
      if (o.modoAv === "avancar") return [
        { campo: "pct", larg: this.GX_GRADE_PCT, corte: 6, titulo: "%", dica: "% concluído na data de corte (0 a 100)" },
        { campo: "ir", larg: this.GX_GRADE_DATA, corte: 10, titulo: "Início real", dica: "O dia em que a tarefa começou de verdade (dd/mm/aaaa)" },
        { campo: "fr", larg: this.GX_GRADE_DATA, corte: 10, titulo: "Fim real", dica: "O ÚLTIMO DIA TRABALHADO. Preencher aqui marca a tarefa como concluída (100%)" }
      ];
      var cols = [
        { campo: "dur", larg: this.GX_GRADE_DUR, corte: 6, titulo: this.COL_DUR.titulo, dica: this.COL_DUR.dica },
        { campo: "pred", larg: this.GX_GRADE_PRED, corte: 13, titulo: this.COL_PRED.titulo, dica: this.COL_PRED.dica }
      ];
      /* ⚠ A COLUNA NASCE COM O CALENDÁRIO CRIADO, não com ele ATRIBUÍDO. O
         motor só publica `r.calendarios` quando existe atribuição válida (I2:
         sem dado, o código de hoje) — e, sem a coluna, não haveria de onde
         atribuir o primeiro. Medido em 21/09/2026: calendário criado, coluna
         ausente, e a única porta era o menu ⋯. `o.cron` é o cronograma
         GRAVADO, que é quem sabe da lista. */
      var temCalCron = !!(o && o.cron && o.cron.cal && ehArr(o.cron.cal.lista) && o.cron.cal.lista.length);
      if (temCalCron || (r && r.calendarios && arr(r.calendarios.lista).length))
        cols.push({ campo: "cal", larg: this.GX_GRADE_CAL, corte: 12, titulo: "Calendário", dica: "A frente em que esta linha trabalha (vazio = a régua da obra)" });
      return cols;
    },
    /* o modo da grade (planejador 2A): "planejar" (o de sempre) ou "avancar".
       ⚠ SÓ EXISTE NO PLANO: sem obra não há registro de avanço onde gravar
       (§1.4), e um seletor que leva a uma coluna que recusa tudo é porta que
       não abre. */
    modoGrade: function (r, o) {
      if (!o || !o.plano) return "planejar";
      return o.modoAv === "avancar" ? "avancar" : "planejar";
    },
    /* onde começa o dia 0 num `pro` qualquer (inclusive um montado fora do
       ganttProEstado, sem `colW`): colW → labelW → padrão */
    ganttProColW: function (pro) {
      if (pro && Number(pro.colW) > 0) return Number(pro.colW);
      if (pro && Number(pro.labelW) > 0) return Number(pro.labelW);
      return this.GX_LABELW;
    },
    // quantos caracteres cabem na coluna (fonte 10px: ~6,25 px por caractere)
    ganttProCorte: function (labelW) { return Math.max(12, Math.round(Number(labelW) / 6.25)); },

    /* O ESTADO do desenho interativo: estado do GanttUI + janela visível +
       permissões de arrasto das linhas visíveis. Puro (roda em Node).
       opts: detalhe, abertas, travado, hoje, nivel, scrollLeft, scrollTop,
             largura, altura (a JANELA em px — no 1º pintar, o padrão),
             alturaCaixa (a altura em CSS do corpo), labelW, sel, desfazer.
       F3 (crono-janelas): labelPref (largura do nome que a pessoa escolheu),
             colunas (true = há as colunas Dur./Depende de), alturaPref,
             janelaAltura, modo ("px" | "preencher"), alcas, alcaNomes,
             hxAltura, fxAltura, topoCorpo, legenda.
       Devolve, além do de sempre: labelW (NOME), gradeW (colunas), colW
       (= labelW + gradeW: ONDE COMEÇA O DIA 0), hxAltura, fxPref, alcas. */
    ganttProEstado: function (r, o) {
      o = o || {};
      var Gu = GU(), Cr = C(), P = PN(), i;
      var det = this.detalheEfetivo(r, o.detalhe);
      /* ⚠ `manter` (o filtro da 1C) entra AQUI, na mesma lista que a fiação do
         arrasto e a tabela usam (ver `filtroDoRender`) */
      /* ⚠ UMA LISTA SÓ (T7): o `intercalar` da 2A (as linhas das tarefas sem
         preço) entra AQUI, na mesma lista que a fiação do arrasto, a grade e a
         tabela usam — filtrado em um só dos três, a pessoa arrastaria uma
         barra e outra se moveria. */
      var L = ehArr(o.L) ? o.L : this.linhas(r, { detalhe: det, abertas: o.abertas, intercalar: o.intercalar,
        manter: (o.manter && typeof o.manter === "object") ? o.manter : null });
      var cal = null;
      try { cal = (Cr && Cr.calendario) ? Cr.calendario(r) : null; } catch (eC) { cal = null; }
      var ids = [];
      for (i = 0; i < L.length; i++) ids.push(L[i].no ? L[i].no.id : L[i].et.id);
      /* PLANEJADOR 2A: o MODO da grade e as colunas dele. Sem plano e sem
         calendário, `cols` é [Dur., Depende de] e `gradeW` dá os mesmos 134
         px de sempre — a paridade da 1.2.77 (test-crono-geometria) sai
         disso. */
      var modoAv = this.modoGrade(r, o), cols = this.colunasGrade(r, { modoAv: modoAv, cron: o.cron });
      var gradeW = this.ganttProGradeW(o.colunas === true, o.larguraWidget, cols);
      var labelW = (Number(o.labelW) > 0) ? Number(o.labelW) : this.ganttProLabelW(o.larguraWidget, o.labelPref, gradeW);
      /* ⚠ DUAS LARGURAS, DOIS DONOS DE LEITURA. `labelW` é quanto cabe de NOME
         (o corte do texto); `colW` é onde começa o DIA 0 — a moldura
         (`--gx-lw`), o eixo do histograma e o da linha de balanço. Roteiro do
         defeito (experimento E′ da REDIMENSIONAR.md, medido no navegador):
         com a coluna mudada só no CSS e o estado ainda em 300, o dia 0 do
         histograma saía 160 px fora do dia 0 do Gantt logo acima — o pico de
         gente apontando para a semana errada. Quem quer "onde começa o
         tempo" lê `colW`; nunca `labelW`. */
      var colW = labelW + gradeW;
      /* ⚠ +GX_BARRA na altura: quando a obra não cabe na largura nasce uma
         barra de rolagem horizontal DENTRO do painel do tempo, e ela come
         altura — sem a folga, a ÚLTIMA linha do cronograma ficava cortada ao
         meio por ela (visto na foto do navegador, com o zoom em "Dia"). O
         gasto quando não há barra é uma calha em branco de 14 px; o gasto sem
         a folga é uma etapa que a pessoa não vê. */
      var natural = Math.min(this.GX_ALTURA, Math.max(3, L.length) * this.GX_ROWH + this.GX_BARRA);
      /* A ALTURA ESCOLHIDA (F3). ⚠ `alturaCaixa` medido vence tudo: é a altura
         que o corpo TEM na tela agora (a fiação passa o offsetHeight). Sem
         medida: janela destacada → preenche a janela; preferência da pessoa →
         presa à janela de agora e às linhas da obra, em linha inteira. Roteiro
         do defeito que isto fecha (experimento C): o corpo arrastado para 700
         voltava a 520 no primeiro render, porque o desenho puro não sabia da
         escolha — digitar uma duração desfazia o tamanho. */
      var escolhida = null;
      if (!(Number(o.alturaCaixa) > 0) && P) {
        if (o.modo === "preencher") {
          escolhida = P.alturaPreencher({ janelaAltura: o.janelaAltura, linhas: L.length, rowH: this.GX_ROWH, barra: this.GX_BARRA,
            topoCorpo: o.topoCorpo != null ? o.topoCorpo : this.GX_CABECALHO, legenda: o.legenda != null ? o.legenda : this.GX_LEGENDA });
        } else if (o.alturaPref != null) {
          escolhida = P.limitar("gxAltura", o.alturaPref, { linhas: L.length, rowH: this.GX_ROWH, barra: this.GX_BARRA,
            janelaAltura: o.janelaAltura, cabecalho: this.GX_CABECALHO });
        } else if (o.modo === "tela") {
          /* a janela inteira menos o cabeçalho do Gantt, a legenda e uma folga
             para as sub-abas: rolando até o Gantt, ele e a legenda cabem */
          escolhida = P.alturaPreencher({ janelaAltura: o.janelaAltura, linhas: L.length, rowH: this.GX_ROWH, barra: this.GX_BARRA,
            topoCorpo: this.GX_TELA_TOPO, legenda: this.GX_LEGENDA });
        }
      }
      var caixa = Math.max(120, Math.round(Number(o.alturaCaixa) > 0 ? Number(o.alturaCaixa)
        : (Number(escolhida) > 0 ? Number(escolhida) : natural)));
      var hxAlt = P ? P.limitar("hxAltura", o.hxAltura) : null;
      var out = { e: null, L: L, cal: cal, det: det, labelW: labelW, gradeW: gradeW, colW: colW, alturaCaixa: caixa,
        /* 2A: a grade, o modo e o que as células precisam para decidir a trava
           (o plano da obra e o cronograma GRAVADO, que diz a origem de cada
           restrição e o calendário de cada linha) */
        cols: cols, modoAv: modoAv, plano: !!o.plano, cron: (o.cron && typeof o.cron === "object" && !ehArr(o.cron)) ? o.cron : null,
        barraDe: typeof o.barraDe === "function" ? o.barraDe : null, cam2A: typeof o.camadas2A === "function" ? o.camadas2A : null,
        /* ⚠ A CAMADA "Rótulos das ligações" É A ÚNICA QUE NÃO CABE NUMA
           CAMADA DE SVG: o rótulo é desenhado JUNTO com a seta, dentro do
           `gantt`, e uma camada por cima não tem como apagá-lo. Ela desce
           como opção até lá (`opts.eloRotulos`). Medido em 21/09/2026 pela
           e2e-crono-camadas: sem esta linha, "Apresentar" deixava os 4
           rótulos "+7d" na tela — e um modo que esconde quase tudo é pior que
           um que não esconde nada, porque a pessoa acredita nele. */
        eloRotulos: o.eloRotulos !== false,
        hxAltura: (Number(hxAlt) > 0) ? Number(hxAlt) : this.HX_ALTURA,
        // o macrofluxo prende contra o tamanho NATURAL do desenho, que só ele conhece
        fxPref: (o.fxAltura != null) ? o.fxAltura : null,
        alcas: o.alcas === true, alcaNomes: o.alcaNomes !== false,
        janelaAltura: (Number(o.janelaAltura) > 0) ? Number(o.janelaAltura) : null, modo: o.modo === "preencher" ? "preencher" : "px",
        sel: (o.sel == null || !isFinite(Number(o.sel))) ? -1 : Math.round(Number(o.sel)),
        /* ⚠ `travado` sobe para o estado porque a LEGENDA precisa dele: sem
           saber que o orçamento está aprovado, ela escreveria "nenhuma barra
           se arrasta" sem dizer a porta (criar revisão / plano da obra) */
        travado: !!o.travado,
        desfazer: String(o.desfazer == null ? "" : o.desfazer), Gu: Gu, perm: {}, ctx: {}, ids: ids, temHoje: false };
      /* o REALCE da busca e o CINZA do contexto (1C): desenhados pela camada
         de uso (`camadaUso`, por baixo das barras), sem editar o `gantt` */
      if (o.realce || o.contexto || o.fora) {
        out.uso = { achados: (o.realce && typeof o.realce === "object") ? o.realce : null, atual: o.atual == null ? null : String(o.atual),
          contexto: (o.contexto && typeof o.contexto === "object" && Object.keys(o.contexto).length) ? o.contexto : null,
          fora: (o.fora && typeof o.fora === "object" && Object.keys(o.fora).length) ? o.fora : null };
        out.camadas = this.camadaUso(out);
      }
      /* as DUAS camadas num objeto só: a da busca (1C) desenha POR BAIXO das
         barras (`antes`) e a do planejador (2A) por CIMA delas (`depois`).
         Duas chamadas de `gantt` seriam dois desenhos. */
      if (out.cam2A) out.camadas = { antes: out.camadas ? out.camadas.antes : null, depois: out.cam2A };
      if (!Gu) { out.motivo = "O motor do Gantt interativo (js/ganttui.js) não carregou — o cronograma está sendo desenhado no modo simples."; return out; }
      var e = Gu.estado({
        nivel: o.nivel, diasAjuste: o.diasAjuste, dias: Math.max(1, Math.round(r.totalDias || 1)), linhas: L.length, rowH: this.GX_ROWH,
        largura: o.largura, altura: (Number(o.altura) > 0 ? o.altura : caixa), labelW: colW,
        dpw: (r.params && r.params.diasUteisSemana) || 5, cal: cal, idPorLinha: ids,
        scrollLeft: o.scrollLeft, scrollTop: o.scrollTop
      });
      out.e = e;
      out.jan = Gu.janela(e);
      /* a linha de HOJE existe? (só para a legenda não prometer uma marca que
         o desenho não tem — recado que mente é pior que recado nenhum) */
      try { var jH = Cr.diaUtilDoCorte(r, o.hoje); out.temHoje = jH != null && jH <= e.dias; } catch (eH) { out.temHoje = false; }
      /* ⚠ PERMISSÕES SÓ DAS LINHAS VISÍVEIS. `ctxDoNo` varre r.atividades a
         cada nó: calcular as 300 linhas de um orçamento com serviços a cada
         quadro de rolagem é O(n²) — exatamente o que a virtualização existe
         para não pagar (medido em tools/test-crono-gantt-fiacao.js). */
      for (i = out.jan.primeiraLinha; i <= out.jan.ultimaLinha; i++) {
        var l = L[i]; if (!l) continue;
        var no = l.no || l.et, ctx = Gu.ctxDoNo(r, no, det);
        ctx.travado = !!o.travado;
        out.ctx[String(ids[i])] = ctx;
        out.perm[String(ids[i])] = Gu.arrastavel(no, ctx);
      }
      return out;
    },

    /* AS ALÇAS de uma linha (chamadas de dentro do `gantt()` em modo pro).
       ⚠ O retângulo de cima existe MESMO quando nada se arrasta: ele carrega o
       <title> com o motivo e a porta. Barra que não responde e não diz por quê
       é lida como app quebrado — e a pessoa vai procurar a saída errada. */
    _gxAlcas: function (pro, l, n, i, x, w, y0, rowH, titulo) {
      var id = String(n.id), p = pro.perm[id] || { motivo: "" };
      var cy = y0 + rowH / 2, marco = !!n.marco;
      var hx = marco ? x - 9 : x, hw = marco ? 18 : Math.max(8, w);
      var dica = p.mover ? " · arraste para mover" : (p.motivo ? " · " + p.motivo : "");
      var dd2 = ' data-gx-id="' + esc(id) + '" data-gx-lin="' + i + '"';
      var s = '<rect class="gx-hit"' + dd2 + (p.mover ? ' data-gx-drag="mover" style="cursor:grab"' : '') +
        ' x="' + f1(hx) + '" y="' + f1(y0) + '" width="' + f1(hw) + '" height="' + f1(rowH) + '" fill="transparent">' +
        '<title>' + titulo + esc(dica) + '</title></rect>';
      if (p.inicio) s += '<rect class="gx-alca"' + dd2 + ' data-gx-drag="inicio" style="cursor:ew-resize" x="' + f1(x - 3) + '" y="' + f1(y0 + 2) +
        '" width="7" height="' + f1(rowH - 4) + '" fill="transparent"><title>Arraste esta borda para mudar o INÍCIO (a duração acompanha).</title></rect>';
      if (p.fim) s += '<rect class="gx-alca"' + dd2 + ' data-gx-drag="fim" style="cursor:ew-resize" x="' + f1(x + w - 4) + '" y="' + f1(y0 + 2) +
        '" width="7" height="' + f1(rowH - 4) + '" fill="transparent"><title>Arraste esta borda para mudar a DURAÇÃO.</title></rect>';
      /* o ponto de LIGAR é a única alça VISÍVEL: ninguém descobre sozinho que
         a ponta direita cria dependência (no MS Project também é um ponto) */
      if (p.ligar) s += '<circle class="gx-liga"' + dd2 + ' data-gx-drag="ligar" style="cursor:crosshair" cx="' + f1(x + w + 6) + '" cy="' + f1(cy) +
        '" r="3.6" fill="#fff" stroke="' + AZUL_ELO + '" stroke-width="1.4"><title>Arraste daqui até outra barra para dizer que ela depende desta.</title></circle>';
      return s;
    },

    // as três peças que a fiação troca a cada quadro (rolar, zoom, soltar)
    ganttProPartes: function (r, pro, o) {
      o = o || {};
      return {
        regua: this.ganttProRegua(pro),
        nomes: this.ganttProNomes(r, pro),
        /* `camadas` (T7) só quando o estado as montou (o realce da busca, 1C):
           sem elas, a chamada de sempre */
        plot: (pro.camadas || pro.barraDe)
          ? this.gantt(r, { detalhe: pro.det, abertas: o.abertas, hoje: o.hoje, rotHoje: o.rotHoje, pro: pro, semLegenda: true,
            camadas: pro.camadas || null, barraDe: pro.barraDe || null, eloRotulos: pro.eloRotulos !== false })
          : this.gantt(r, { detalhe: pro.det, abertas: o.abertas, hoje: o.hoje, rotHoje: o.rotHoje, pro: pro, semLegenda: true }),
        larguraConteudo: Math.max(1, pro.e ? pro.e.larguraConteudo : 1),
        alturaConteudo: Math.max(pro.e ? pro.e.rowH : 24, pro.e ? pro.e.alturaConteudo : 24)
      };
    },

    /* A COLUNA DE NOMES — o painel que NÃO rola de lado. Mesma altura de linha
       e mesmo y absoluto do desenho do tempo (linha i em i × rowH): é isso que
       faz o nome ficar na frente da barra dele. */
    /* ⚠ AS COLUNAS Dur./Depende de MORAM AQUI DENTRO (F6, crono-janelas).
       O SVG tem a largura de ONDE COMEÇA O DIA 0 (`colW` = nome + colunas), e
       não a do nome: com o SVG em `labelW` e a coluna CSS em `colW` sobrava
       uma faixa branca de 134 px entre o nome e o tempo (foto da F3,
       "geometria-1366-colunas-falsas-gantt"). O texto do nome continua
       cortado pela largura do NOME (`labelW`) — é quanto cabe dele.
       ⚠ As células são TEXTO no SVG virtualizado, nunca `<input>`: o painel
       é recriado a cada 24 px de rolagem (medido na EDICAO.md: sempre um nó
       novo em 24, 48, 72, 120 e 240) e um campo aqui dentro morreria no meio
       da digitação. O campo é UM só, sobreposto (js/ganttgradeui.js). */
    ganttProNomes: function (r, pro) {
      if (!pro || !pro.e) return "";
      var e = pro.e, L = pro.L, jan = pro.jan, W = this.ganttProColW(pro), NW = pro.labelW;
      var gradeW = Number(pro.gradeW) > 0 ? Number(pro.gradeW) : 0;
      var H = Math.max(e.rowH, e.alturaConteudo), temFilhos = L.length > arr(r.etapas).length, i;
      // o corte do texto acompanha a coluna: o SVG recorta no pixel, sem reticências
      var menu = !!G("GanttGradeUI") && NW >= 150;
      var corteN = this.ganttProCorte(NW) - (menu ? 2 : 0);
      var s = '<svg class="gantt gx-nomes-svg" data-gx="nomes-svg" width="' + f1(W) + '" height="' + f1(H) +
        '" viewBox="0 0 ' + f1(W) + ' ' + f1(H) + '" style="display:block;background:#fff;font-family:inherit">';
      for (i = jan.primeiraLinha; i <= jan.ultimaLinha; i++) {
        var l = L[i]; if (!l) continue;
        var n = l.no || l.et, prof = l.no ? (l.no.prof || 0) : 0, y0 = i * e.rowH;
        if (l.tipo === "etapa" && temFilhos) s += '<rect x="0" y="' + f1(y0) + '" width="' + f1(W) + '" height="' + f1(e.rowH) + '" fill="#f1f5f9"/>';
        if (i === pro.sel) s += '<rect x="0" y="' + f1(y0) + '" width="' + f1(W) + '" height="' + f1(e.rowH) + '" fill="#0d6ebd" fill-opacity="0.10"/>';
        var nome = n.nome || "";
        /* ⚠ O RÓTULO É O MESMO DE ANTES EM CADA DETALHE: por etapa, `código
           nome` (o que o Gantt por etapa sempre mostrou, e o que está na 1ª
           coluna da tabela); abaixo da etapa, o nº EAP + nome (o que a rede das
           subetapas usa). Trocar a régua do rótulo entre a tabela e o desenho é
           o que faz a pessoa procurar na tabela a barra que viu no Gantt e não
           achar. ⚠ E código AUSENTE (etapa importada do BIM) não vira
           "undefined " na frente do nome — a foto de um e2e já pegou isso. */
        var rot = (l.no ? (l.no.numero ? l.no.numero + " " : "") : (n.codigo ? n.codigo + " " : "")) + nome;
        var peso = (l.tipo === "etapa" || n.critico) ? ' font-weight="600"' : "";
        /* 2A: a linha T em ROXO, a mesma tinta da barra tracejada — é o que
           diz, sem ler, que aquela linha não é serviço do orçamento */
        var cor = l.tipo === "servico" ? "#64748b" : (l.tipo === "etapa" ? "#0f172a" : (l.tipo === "extra" ? ROXO_T : "#334155"));
        s += '<text x="' + (6 + prof * 14) + '" y="' + f1(y0 + e.rowH / 2 + 3.5) + '" font-size="' + (l.tipo === "servico" ? 9.5 : 10) +
          '" fill="' + cor + '"' + peso + '><title>' + esc(rot) + '</title>' + esc(corta(rot, corteN)) + '</text>';
        /* O MENU ⋯ DA LINHA (2A, crítica 2, achado 17). Ele existe porque
           "Restrição…", "Calendário…" e "Tarefa sem preço abaixo" não têm
           onde morar: a restrição de data só se via arrastando a barra (um
           campo que a tabela não mostra), e a tecla Ins não se descobre
           sozinha. Fica na borda do NOME, onde o olho já está — não no ponto
           morto entre o cabeçalho e a grade (memória "ação mora no card do
           número"). ⚠ Só com a fiação (GanttGradeUI) carregada: sem ela
           seria três pontinhos que não abrem nada. */
        if (menu && l.tipo !== "servico") {
          var xm = NW - 13;
          s += '<g class="gx-menu" data-gx-menu="' + esc(String(n.id)) + '" data-gx-linha="' + i + '" style="cursor:pointer">' +
            '<rect x="' + f1(xm - 6) + '" y="' + f1(y0 + 3) + '" width="18" height="' + f1(e.rowH - 6) + '" rx="4" fill="transparent"/>' +
            '<text x="' + f1(xm + 3) + '" y="' + f1(y0 + e.rowH / 2 + 4) + '" font-size="13" fill="#64748b" text-anchor="middle" pointer-events="none">⋯</text>' +
            '<title>' + esc("Mais opções desta linha: restrição de data, calendário da frente e tarefa sem preço abaixo.") + '</title></g>';
        }
        /* as células vêm DEPOIS do nome e com fundo opaco: o corte do nome é
           por caractere (≈6,25 px), e um nome em negrito que passasse do
           `labelW` escreveria por cima do número da duração */
        if (gradeW > 0) s += this._gxCelulasSvg(r, l, i, pro, NW, y0, e.rowH, (l.tipo === "etapa" && temFilhos) ? "#f1f5f9" : "#fff");
      }
      return s + '</svg>';
    },

    /* A CÉLULA Dur. ou Depende de de UMA linha — {valor, vazio, dig, ro,
       motivo, porta, portaId, dica, id, alvo}. Dono único do que a grade do
       Gantt mostra E do que o campo sobreposto abre (js/ganttgradeui.js lê
       daqui o valor inicial e a trava): dois lugares decidindo "o que esta
       célula mostra" dariam o campo abrindo com um número e a célula
       mostrando outro.
       ⚠ O VALOR E A SINTAXE SÃO OS DA TABELA (a mesma regra de `tabela`,
       logo abaixo): duração da etapa = `e.duracao`; da subetapa no modo
       executivo = a da REDE (`duracaoRede`, marco = 0); "Depende de" pelos
       formatadores do motor (`predsTexto`/`predsTextoSub`). Um formatador
       próprio aqui divergiria da tabela na primeira manutenção.
       ⚠ A TRAVA É A DO MOTOR DA DIGITAÇÃO (`GanttUI.celulaEditavel`), a
       mesma que recusa ao gravar: célula que parece editável e recusa ao
       digitar é trava sem aviso; célula cinza que gravaria é porta escondida.
       Sem o motor carregado: só leitura, com o motivo dito. */
    ganttProCelula: function (r, l, campo, pro) {
      var Cr = C(), Gu = (pro && pro.Gu) || GU(), self = this;
      var out = { valor: "", vazio: "", dig: false, ro: true, motivo: "", porta: "", portaId: null, dica: "", id: null, alvo: "etapa" };
      if (!l || !r || !Cr) { out.motivo = "O motor do cronograma não carregou nesta tela."; return out; }
      var nos = arr(r.atividades), m = this._gxNums(r);
      var et = l.tipo === "etapa" ? l.et : null, no = l.no || null;
      // a etapa no detalhe "Etapa" vem sem nó: o da árvore ainda diz a fonte (a trava do vão lê `fonte`)
      if (et && !no && own(m.noEtapa, et.id)) no = m.noEtapa[et.id];
      var alvoNo = no || et;
      if (!alvoNo) { out.motivo = "Esta linha não existe mais neste cronograma."; return out; }
      out.id = alvoNo.id;
      var rede = !!(r.exec && r.exec.rede === true);
      /* ------ PLANEJADOR 2A: as colunas novas ------
         ⚠ O VALOR SAI DO MOTOR, sempre. O % e as datas reais vêm de
         `no.avanco` (que a 1A montou a partir do registro `avanco_<obraId>`,
         já validado: `f` preenchido = concluída, O24), e o calendário de
         `no.calendarioId`. Ler o registro cru aqui daria uma segunda leitura
         do avanço, com outra validação — e a célula mostraria 60% numa
         tarefa que o motor desenhou como concluída. */
      if (campo === "cal" || campo === "pct" || campo === "ir" || campo === "fr") {
        out.alvo = l.tipo === "extra" ? "extra" : (l.tipo === "folha" ? "folha" : (l.tipo === "servico" ? "servico" : "etapa"));
        if (campo === "cal") {
          var cid = alvoNo.calendarioId ? String(alvoNo.calendarioId) : "";
          var nomeC = "";
          arr(r.calendarios && r.calendarios.lista).forEach(function (c2) { if (c2 && String(c2.id) === cid) nomeC = String(c2.nome || cid); });
          out.valor = cid ? (nomeC || cid) : "";
          out.vazio = "obra";
          out.dig = !!cid;
        } else {
          var av = alvoNo.avanco || null;
          if (campo === "pct") { out.valor = av && av.estado !== "nao-iniciada" ? nBR(fin(av.pct, 0), 1) + "%" : ""; out.dig = !!av && av.estado !== "nao-iniciada"; }
          else if (campo === "ir") { out.valor = (av && av.iniReal) ? dmaS(av.iniReal) : ""; out.dig = !!(av && av.iniReal); }
          else { out.valor = (av && av.fimReal) ? dmaS(av.fimReal) : ""; out.dig = !!(av && av.fimReal); }
          out.vazio = "—";
        }
        var celN = null;
        try {
          celN = Gu && typeof Gu.celulaEditavel === "function"
            ? Gu.celulaEditavel(alvoNo, campo, { travado: !!(pro && pro.travado), plano: !!(pro && pro.plano), exec: rede })
            : { ok: false, motivo: "O motor da digitação (js/ganttui.js) não carregou — digite na tabela abaixo." };
        } catch (eN) { celN = { ok: false, motivo: "Não consegui conferir se esta célula se edita — por segurança ela fica só leitura." }; }
        if (celN && celN.ok) {
          out.ro = false;
          out.dica = campo === "cal" ? "Escolha a frente desta linha · vazio = a régua da obra."
            : (campo === "pct" ? "% concluído na data de corte (0 a 100) · vazio = apaga o lançamento."
              : (campo === "ir" ? "O dia em que começou de verdade (dd/mm/aaaa) · vazio = apaga."
                : "O ÚLTIMO DIA TRABALHADO (dd/mm/aaaa). Ao preencher, a tarefa fica concluída (100%) — o recado mostra isso antes de gravar."));
        } else {
          out.dig = false;
          out.motivo = String((celN && celN.motivo) || "Esta célula não se edita.");
          out.porta = String((celN && celN.porta) || "");
          out.portaId = (celN && celN.portaId != null) ? celN.portaId : null;
        }
        return out;
      }
      /* a LINHA T (tarefa sem preço): nome, duração e "Depende de" próprios.
         ⚠ Ela NÃO passa pelo ramo da etapa: não tem `duracaoRede`, não tem
         irmãs e o "Depende de" dela aceita etapa E outra T (`_textoRede` com
         os números T). */
      if (l.tipo === "extra") {
        out.alvo = "extra";
        var nmsX = {}, ordemX = arr(r.etapas).map(function (e3) { return e3 && e3.id; });
        ordemX.forEach(function (eid, ix) { nmsX[eid] = ix + 1; });
        arr(r.extras).forEach(function (x2) { if (x2) nmsX[x2.id] = x2.numero; });
        if (campo === "nome") { out.valor = String(alvoNo.nome || ""); out.dig = true; }
        else if (campo === "dur") { out.valor = String(alvoNo.marco ? 0 : (alvoNo.duracao == null ? "" : alvoNo.duracao)); out.dig = true; }
        else {
          var elosX = arr(alvoNo.preds).map(function (p2) {
            return { i: p2, t: (alvoNo.predTipo && alvoNo.predTipo[p2]) || "TI", l: (alvoNo.predLag && alvoNo.predLag[p2]) || 0, x: true };
          });
          out.valor = (Cr && Cr._textoRede) ? String(Cr._textoRede(elosX, nmsX, { vazioExplicito: false }) || "") : "";
          out.vazio = "início da obra";
          out.dig = elosX.length > 0;
        }
        var celX = null;
        try { celX = Gu && typeof Gu.celulaEditavel === "function" ? Gu.celulaEditavel(alvoNo, campo, { travado: !!(pro && pro.travado) }) : null; } catch (eX) { celX = null; }
        if (celX && celX.ok) {
          out.ro = false;
          out.dica = campo === "nome" ? "O nome da tarefa sem preço (até 80 caracteres)."
            : (campo === "dur" ? "Dias úteis · 0 = marco. A tarefa sem preço não tem estimativa: o número é seu."
              : "Nº da etapa (1, 3), de outra tarefa sem preço (T1) · espera 3+5 · tipo 3TT · vazio = começa no início da obra.");
        } else {
          out.dig = false;
          out.motivo = String((celX && celX.motivo) || "Esta célula não se edita.");
          out.porta = String((celX && celX.porta) || "");
        }
        return out;
      }
      if (et) {
        var i = own(m.numEt, et.id) ? m.numEt[et.id] - 1 : 0;
        if (campo === "dur") { out.valor = String(et.duracao == null ? "" : et.duracao); out.dig = !!(et.editado || et.marco); }
        /* ⚠ a T que segura a etapa entra no texto (Cronograma.textoDependeDe):
           sem ela, devolver a célula corrigida soltava a T calada */
        else {
          var temXE = arr(et.porExtras).length > 0;
          out.valor = (typeof Cr.textoDependeDe === "function") ? Cr.textoDependeDe(et, m.numEt) : (et.predsExplicito ? Cr.predsTexto(et, m.numEt) : "");
          out.vazio = i > 0 ? String(i) : "—"; out.dig = !!et.predsExplicito || temXE;
        }
      } else if (l.tipo === "folha") {
        out.alvo = "folha";
        var durRede = no.marco ? 0 : (no.duracaoRede != null ? no.duracaoRede : no.duracao);
        var irmas = m.folhas[no.etapaId] || [], pos = irmas.indexOf(no);
        if (campo === "dur") { out.valor = String(rede ? durRede : (no.duracao == null ? "" : no.duracao)); out.dig = rede && !!(no.editado || no.marco); }
        else if (rede) { out.valor = no.predsExplicito ? Cr.predsTextoSub(no, m.numF) : ""; out.vazio = pos > 0 ? String(irmas[pos - 1].numero) : "—"; out.dig = !!no.predsExplicito; }
        // no modo padrão a tabela mostra o que a rede usa, em cinza (só leitura): o mesmo aqui
        else out.valor = (no.preds && no.preds.length) ? Cr.predsTextoSub(no, m.numF) : "início";
      } else {
        out.alvo = "servico";
        var sb = no.semBase || no.inicio == null;
        out.valor = campo === "dur" ? (sb ? "—" : String(no.duracao == null ? "" : no.duracao)) : "—";
      }
      if (!Gu || typeof Gu.celulaEditavel !== "function") {
        out.motivo = "O motor da digitação (js/ganttui.js) não carregou — digite na tabela abaixo.";
        return out;
      }
      var cel = null;
      try {
        cel = Gu.celulaEditavel(alvoNo, campo, { travado: !!(pro && pro.travado), cron: { exec: { rede: rede } }, nos: nos,
          motivoEtapaTravada: function (c, n2, id) { return self.motivoEtapaTravada(c, n2, id); } });
      } catch (eC) { cel = { ok: false, motivo: "Não consegui conferir se esta célula se edita — por segurança ela fica só leitura." }; }
      if (cel && cel.ok) {
        out.ro = false;
        out.dica = campo === "dur"
          ? "Dias úteis · 0 = marco · vazio = volta à estimativa. Clique (ou Enter na linha) para digitar."
          : (out.alvo === "folha"
            ? "Nº de subetapas da MESMA etapa: 2.1, 2.g; 2.1+3 espera; 2.1-1 avanço; 2.1II começa junto; 0 = início da etapa; vazio = a anterior."
            : "Nº das etapas que precisam terminar antes (ex.: 1,3). Vazio = a anterior; 0 = começa no início da obra. 1+7 = espera 7 dias úteis; 1-3 = começa 3 dias antes.");
      } else {
        out.dig = false;
        out.motivo = String((cel && cel.motivo) || "Esta célula não se edita.");
        out.porta = String((cel && cel.porta) || "");
        out.portaId = (cel && cel.portaId != null) ? cel.portaId : null;
      }
      return out;
    },
    /* os números de linha que o "Depende de" escreve (etapa = posição; folha =
       nº EAP) e os nós por etapa, UMA vez por resultado do motor: a grade pede
       isso por célula visível, e varrer as 2.400 atividades de um orçamento
       grande por célula a cada 24 px de rolagem é a conta que a virtualização
       existe para não pagar */
    _gxNumsMemo: null,
    _gxNums: function (r) {
      var mm = this._gxNumsMemo;
      if (mm && mm.r === r && mm.v) return mm.v;
      var v = { numEt: {}, numF: {}, folhas: {}, noEtapa: {} };
      arr(r && r.etapas).forEach(function (e, i) { if (e) v.numEt[e.id] = i + 1; });
      arr(r && r.atividades).forEach(function (n) {
        if (!n) return;
        if (n.tipo === "etapa") v.noEtapa[n.id] = n;
        if (n.numero) v.numF[n.id] = n.numero;
        if (n.tipo === "subetapa" || n.tipo === "soltos") { if (!own(v.folhas, n.etapaId)) v.folhas[n.etapaId] = []; v.folhas[n.etapaId].push(n); }
      });
      this._gxNumsMemo = { r: r, v: v };
      return v;
    },
    /* O SVG das duas células de uma linha. ⚠ Tintas CRAVADAS (regra 4 do
       cabeçalho: o Gantt é papel branco nos dois temas) — com os tokens, o
       número estimado sairia com a tinta clara do tema escuro sobre o papel
       branco. As mesmas do resto do papel: #0f172a texto, #0d6ebd digitado
       (o --aco do claro), #64748b só leitura, #94a3b8 o implícito.
       ⚠ `esc()` em TUDO: o id da etapa vem de pacote, backup e sincronização. */
    _gxCelulasSvg: function (r, l, i, pro, x0, y0, rowH, fundo) {
      var s = '<rect x="' + f1(x0) + '" y="' + f1(y0) + '" width="' + f1(Number(pro.gradeW)) + '" height="' + f1(rowH) + '" fill="' + fundo + '"/>';
      if (i === pro.sel) s += '<rect x="' + f1(x0) + '" y="' + f1(y0) + '" width="' + f1(Number(pro.gradeW)) + '" height="' + f1(rowH) + '" fill="#0d6ebd" fill-opacity="0.10"/>';
      s += '<line x1="' + f1(x0 + 0.5) + '" y1="' + f1(y0) + '" x2="' + f1(x0 + 0.5) + '" y2="' + f1(y0 + rowH) + '" stroke="#e2e8f0" stroke-width="1"/>';
      /* as colunas são as do MODO (2A, `colunasGrade`): sem plano e sem
         calendário, as duas de sempre, com as mesmas larguras */
      var cols = ehArr(pro.cols) ? pro.cols : this.colunasGrade(r, null), k, cx = x0;
      for (k = 0; k < cols.length; k++) {
        var campo = cols[k].campo, cw = Number(cols[k].larg) || 0, c = this.ganttProCelula(r, l, campo, pro);
        var cls = "gx-cel" + (c.ro ? " gx-cel-ro" : (c.dig ? " gx-cel-dig" : ""));
        var txt = c.valor !== "" ? c.valor : c.vazio;
        var tinta = c.ro ? "#64748b" : (c.valor === "" ? "#94a3b8" : (c.dig ? "#0d6ebd" : "#0f172a"));
        s += '<g class="' + cls + '" data-gx-cel="' + campo + '" data-gx-id="' + esc(c.id == null ? "" : c.id) + '" data-gx-linha="' + i + '"' + (c.ro ? '' : ' style="cursor:text"') + '>' +
          '<rect x="' + f1(cx + 2) + '" y="' + f1(y0 + 3) + '" width="' + f1(cw - 4) + '" height="' + f1(rowH - 6) + '" rx="4" fill="' + (c.ro ? "transparent" : "#fff") + '"' +
          (c.ro ? '' : ' stroke="' + (c.dig ? "#0d6ebd" : "#cbd5e1") + '" stroke-width="1"') + '/>' +
          '<text x="' + f1(cx + cw - 7) + '" y="' + f1(y0 + rowH / 2 + 3.5) + '" font-size="10" text-anchor="end" fill="' + tinta + '"' + (c.dig ? ' font-weight="600"' : '') + '>' +
          esc(corta(txt, Number(cols[k].corte) > 0 ? Number(cols[k].corte) : 13)) + '</text>' +
          '<title>' + esc(c.ro ? c.motivo : (c.valor !== "" ? c.valor + " · " : "") + c.dica) + '</title></g>';
        cx += cw;
      }
      return s;
    },

    /* A RÉGUA DE TEMPO em duas faixas (a de cima mais larga que a de baixo):
       mês sobre semana, trimestre sobre mês. ⚠ As marcas saem do GanttUI —
       daqui não sai nenhuma conta de data: uma segunda régua de dias úteis e a
       barra deixaria de casar com a data que vai na proposta. */
    /* AS DUAS FAIXAS da régua num lugar só (dono único): mês sobre semana,
       trimestre sobre mês. O rótulo fixo da borda usa a MESMA faixa de cima —
       em dois lugares, um dia alguém troca uma e o rótulo da borda passaria a
       dizer "nov/26" numa régua de trimestres. */
    ganttProUnidades: function (pro) {
      var Gu = (pro && pro.Gu) || GU();
      if (!Gu || !pro || !pro.e) return { topo: "mes", baixo: null };
      var uni = Gu.unidadeDe(pro.e.nivel, pro.e.pxDia);
      return { topo: (uni === "mes" || uni === "trimestre") ? "trimestre" : "mes", baixo: uni === "trimestre" ? null : uni };
    },

    /* O RÓTULO FIXO da borda esquerda da régua (o mês — ou o trimestre — do
       primeiro dia visível), em TEXTO PURO.
       ⚠ Quem desenha é a fiação, num elemento FORA do painel que rola: dentro
       do SVG ele andaria junto com o desenho e sumiria de novo. O porquê
       inteiro está em `GanttUI.regua` (campo `fixa`). Devolve "" quando já há
       um rótulo de verdade colado na borda — ali ele seria repetição. */
    ganttProRotuloFixo: function (pro) {
      if (!pro || !pro.e || !pro.cal) return "";
      var Gu = pro.Gu || GU(); if (!Gu) return "";
      var fx = Gu.regua(pro.e, pro.cal, this.ganttProUnidades(pro).topo).fixa;
      return (fx && fx.rotulo) ? String(fx.rotulo) : "";
    },

    ganttProRegua: function (pro) {
      if (!pro || !pro.e) return "";
      var e = pro.e, Gu = pro.Gu || GU(), W = Math.max(1, e.larguraConteudo), H = this.GX_REGUA;
      var s = '<svg class="gx-regua-svg" data-gx="regua-svg" width="' + f1(W) + '" height="' + H + '" viewBox="0 0 ' + f1(W) + ' ' + H +
        '" style="display:block;background:#f8fafc;font-family:inherit">';
      if (!Gu || !pro.cal) return s + '<text x="6" y="19" font-size="10" fill="#94a3b8">' + esc("sem calendário — não consigo desenhar a régua de datas") + '</text></svg>';
      var u = this.ganttProUnidades(pro), topo = u.topo, baixo = u.baixo;
      arr(Gu.regua(e, pro.cal, topo).marcas).forEach(function (m) {
        s += '<line x1="' + f1(m.x) + '" y1="0" x2="' + f1(m.x) + '" y2="' + H + '" stroke="#cbd5e1" stroke-width="1"/>';
        if (m.rotulo) s += '<text x="' + f1(m.x + 3) + '" y="11" font-size="9.5" font-weight="600" fill="#334155">' + esc(m.rotulo) + '</text>';
      });
      if (baixo) arr(Gu.regua(e, pro.cal, baixo).marcas).forEach(function (m) {
        s += '<line x1="' + f1(m.x) + '" y1="15" x2="' + f1(m.x) + '" y2="' + H + '" stroke="#e2e8f0" stroke-width="1"/>';
        if (m.rotulo) s += '<text x="' + f1(m.x + 3) + '" y="26" font-size="8.5" fill="#64748b">' + esc(m.rotulo) + '</text>';
      });
      return s + '</svg>';
    },

    /* O CANTO (a caixa vazia acima da coluna de nomes) leva o zoom e o
       desfazer. ⚠ É ali de propósito: é o único lugar da aba que já existia
       vazio. Numa barra própria seriam ~32 px a mais acima do Gantt, e o
       critério de aceite desta aba é a 1ª barra aparecer sem rolar a 1366×768
       (e2e-cronograma-executivo / e2e-planejamento-obra). */
    /* ⚠ "AJUSTAR" NÃO PROMETE O QUE NÃO CUMPRE. Roteiro do defeito (medido no
       navegador a 1366×768 na OBRA TESTE, 12/09/2026): com o zoom em "auto" o
       painel do tempo ficava com clientWidth 784 e scrollWidth 1410 — 3 das 6
       barras 100% fora da janela, e nada na tela dizendo que o desenho
       continuava à direita. Enquanto isso o `title` do seletor afirmava
       "Ajustar faz a obra inteira caber na largura da tela". O comportamento é
       deliberado (PX_AUTO_MIN = 3 px/dia em js/ganttui.js: abaixo disso uma
       barra de 2 dias vira um fio de 4 px), quem mentia era o texto. Uma obra
       de 2 anos a 1366 px já estoura esse piso — não é caso de borda. */
    ganttProCabe: function (pro) {
      var e = pro && pro.e;
      if (!e || !(e.larguraConteudo > 0) || !(e.largura > 0)) return true;
      return e.larguraConteudo <= e.largura + 2;
    },
    ganttProTopo: function (pro) {
      var Gu = pro.Gu || GU(), niv = (pro.e && pro.e.nivel) || "auto", ns = Gu ? Gu.NIVEIS : [], i;
      var cabe = this.ganttProCabe(pro);
      var quanto = cabe ? "" : (" Nesta largura a obra inteira NÃO cabe: cabem " + nBR(Math.round(pro.e.largura / Math.max(0.0001, pro.e.pxDia)), 0) +
        " dos " + nBR(pro.e.dias, 0) + " dias úteis, e o desenho continua à direita (role o painel do tempo).");
      var h = '<button type="button" class="gx-zb" data-acao="crono-zoom" data-dir="-1" aria-label="Afastar o cronograma" title="Afastar — ver mais tempo na tela (também: Ctrl + roda do mouse, ou a tecla −)">−</button>' +
        '<button type="button" class="gx-zb" data-acao="crono-zoom" data-dir="1" aria-label="Aproximar o cronograma" title="Aproximar — ver menos tempo, com mais detalhe (também: Ctrl + roda do mouse, ou a tecla +)">+</button>';
      /* ⚠ NO CELULAR O SELETOR VIRA UM BOTÃO. Num aparelho de 390 px a coluna
         de nomes tem ~138, e o seletor espremido saía com "A ▾" — um controle
         que ninguém consegue ler não é um controle. Os três botões (afastar,
         aproximar, ajustar) cabem, e "Ajustar" continua a um toque: sem ele,
         quem afastou até o trimestre não tinha como voltar (no telefone não há
         Ctrl + roda). */
      /* ⚠ ESCALA MANTIDA DEPOIS DE EDITAR (ver GanttUI.estado, `diasAjuste`):
         o desenho segue na escala de quando a edição começou, e o seletor diz
         isso em vez de afirmar "Ajustar". Com "Ajustar" já marcado, escolher
         "Ajustar" de novo não dispara `change` — sem a opção própria a pessoa
         não teria como reajustar pela escala. Texto puro (só números). */
      var mantida = !!(pro.e && pro.e.escalaMantida);
      var txMant = mantida ? ("Escala mantida enquanto você edita: ela foi ajustada para " + nBR(pro.e.diasAjuste, 0) + " dias úteis, e a obra agora tem " +
        nBR(pro.e.dias, 0) + " — as barras não saem de baixo do mouse. Escolha Ajustar para caber a obra de agora.") : "";
      if (pro.labelW < 200) {
        h += '<button type="button" class="gx-zb" data-acao="crono-zoom" data-dir="auto" aria-label="' +
          esc(mantida ? "Ajustar o cronograma à obra de agora (a escala está mantida desde a última edição)"
            : (cabe ? "Ajustar o cronograma à largura da tela" : "Ajustar — o máximo que cabe nesta largura; a obra inteira não cabe, role para o lado")) +
          '" title="' + esc(mantida ? txMant : (cabe ? "Ajustar — a obra inteira cabe na largura da tela"
            : "Ajustar — o máximo que cabe sem a barra de um dia sumir." + quanto)) + '">⤢</button>';
      } else {
        h += '<select class="gx-zs" data-crono-zoom="1" aria-label="Escala de tempo do cronograma" title="' +
          esc(mantida ? txMant : (cabe ? "Escala de tempo: Ajustar faz a obra inteira caber na largura da tela"
            : "Escala de tempo. Ajustar mostra o máximo que cabe sem a barra de um dia sumir." + quanto)) + '">' +
          (mantida ? '<option value="mantida" selected>Mantida</option>' : '') +
          '<option value="auto"' + (niv === "auto" && !mantida ? ' selected' : '') + '>Ajustar</option>';
        for (i = 0; i < ns.length; i++) h += '<option value="' + esc(ns[i].id) + '"' + (niv === ns[i].id ? ' selected' : '') + '>' + esc(ns[i].nome) + '</option>';
        h += '</select>';
      }
      /* ⚠ O "↶ Desfazer" SAIU DAQUI (1C): o desfazer virou pilha de vários
         níveis, com ↶ ↷ na barra de uso, acima deste canto (USO §1.1: o canto
         de 290 px não cabia os dois botões com o rótulo). */
      return this._gxCantoGrade(pro, h);
    },
    /* O CANTO COM A GRADE Dur./Depende de (F6). ⚠ Sem o js/ganttgradeui.js
       carregado devolve o canto de sempre, byte a byte (paridade com a 1.2.77
       em tools/test-crono-geometria.js): o botão [Colunas] sem a fiação seria
       porta que não abre.
       ⚠ O CRITÉRIO DO SELETOR × BOTÃO CONTINUA SENDO A LARGURA DO NOME
       (`labelW < 200`), e não a do canto inteiro (`colW`). A F3 deixou anotado
       que "o canto agora mede colW" — mas os controles NÃO usam o canto
       inteiro: acima das colunas moram os títulos "Dur." e "Depende de",
       alinhados às células. Decidir por colW (434 a 1366) desenharia o
       seletor espremido nos 300 px de cima do nome, junto com [Colunas], e
       ele empurraria os títulos para fora do alinhamento. O `_gxPintar` (F3)
       usa a MESMA regra na chave `forma`: se mudar aqui, mude lá.
       ⚠ O botão só aparece com o Gantt a partir de GX_GRADE_LARGURA (1000 px):
       abaixo disso as colunas não cabem ligadas nem desligadas, e o botão
       mudaria uma preferência sem mudar nada na tela. Ali o duplo clique na
       barra abre o cartão com os dois campos. */
    _gxCantoGrade: function (pro, h) {
      if (!G("GanttGradeUI")) return h;
      var gradeW = Number(pro.gradeW) > 0 ? Number(pro.gradeW) : 0;
      var ww = (pro.e && Number(pro.e.largura) > 0) ? Number(pro.e.largura) + this.ganttProColW(pro) : 0;
      var cabe = gradeW > 0 || !(ww > 0) || ww >= this.GX_GRADE_LARGURA;
      if (!cabe) return h;
      var liga = gradeW > 0;
      var ico = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style="display:block;margin:auto"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
        '<line x1="8" y1="2.5" x2="8" y2="13.5" stroke="currentColor" stroke-width="1.3"/><line x1="11" y1="2.5" x2="11" y2="13.5" stroke="currentColor" stroke-width="1.3"/></svg>';
      /* ⚠ O RÓTULO LISTA AS COLUNAS DO MODO ATIVO. Ele dizia "Dur. e Depende
         de" sempre — e no modo Avançar o botão esconde % · Início real · Fim
         real, e com calendário esconde também Calendário. Número (e nome) na
         interface envelhece: a pessoa clicava esperando uma coisa e sumia
         outra. A lista vem do MESMO `pro.cols` que desenha as células. */
      var nomesCols = arr(pro.cols).map(function (c) { return String(c.titulo || c.campo); });
      var rot = "Mostrar ou esconder " + (nomesCols.length
        ? "as colunas " + (nomesCols.length > 1
          ? nomesCols.slice(0, -1).join(", ") + " e " + nomesCols[nomesCols.length - 1]
          : nomesCols[0])
        : "as colunas da grade");
      var bt = '<button type="button" class="gx-zb gx-col-bt" data-acao="gx-colunas" data-ligar="' + (liga ? "0" : "1") + '" aria-pressed="' + (liga ? "true" : "false") +
        '" aria-label="' + esc(rot) + '" title="' + esc(rot + (liga ? " (ligadas: clique para dar a largura ao tempo)" : " (escondidas: duplo clique na barra abre os dois campos)")) + '">' + ico + '</button>';
      if (!liga) return h + bt;
      /* os controles ficam na largura do NOME (menos o recuo do canto) e os
         títulos começam EXATAMENTE em labelW: o `margin-right` negativo come
         o recuo direito e a borda do canto, que são da coluna e não do título */
      /* PLANEJADOR 2A: os títulos saem da MESMA lista que desenha as células
         (`pro.cols`). Escritos à mão aqui, a coluna Calendário (ou o modo
         Avançar) apareceria com o cabeçalho de Dur. sobre o valor de outra
         coisa — e um cabeçalho que mente é pior que nenhum. */
      var cols = ehArr(pro.cols) ? pro.cols : this.colunasGrade(null, null), i, th = "";
      for (i = 0; i < cols.length; i++) {
        th += '<span class="gx-cab-t" style="width:' + (Number(cols[i].larg) || 0) + 'px" title="' + esc(String(cols[i].dica || "")) + '">' + esc(String(cols[i].titulo || "")) + '</span>';
      }
      return '<span class="gx-canto-ctl" style="width:' + f1(Math.max(0, pro.labelW - 10)) + 'px">' + h + bt + '</span>' +
        '<span class="gx-cab-cols" style="width:' + f1(gradeW) + 'px">' + th + '</span>';
    },

    /* O RECADO do arrasto em andamento, em TEXTO PURO (a dica é escrita por
       textContent — uma tag aqui sairia literal na tela do cliente, como já
       aconteceu no UI.toast). Diz as duas datas novas e quanto andou em dias
       ÚTEIS; recusando, diz o motivo — que é exatamente a hora em que a pessoa
       precisa lê-lo, e não depois de soltar. */
    ganttProDica: function (res, no) {
      if (!res) return "";
      var nome = no ? corta(String((no.numero ? no.numero + " " : "") + (no.nome || "")).trim(), 34) : "";
      if (res.tipo === "ligar") {
        if (!res.valido) return res.motivo || "Solte em cima de outra barra.";
        return (nome ? nome + "\n" : "") + "solte para dizer que a barra de baixo do ponteiro depende desta";
      }
      var d = Math.round(Number(res.deltaDias) || 0), t = [];
      if (nome) t.push(nome);
      t.push(dmaS(res.dataInicio) + " → " + dmaS(res.dataFim));
      if (res.tipo === "fim" || res.tipo === "inicio") t.push(res.novaDuracao + " dia(s) útil(eis) de duração");
      t.push((d > 0 ? "+" : "") + d + " dia(s) útil(eis)");
      /* ⚠ LINHA COM CALENDÁRIO PRÓPRIO (planejador 2A): o número acima está
         em dias úteis da OBRA — é a régua do desenho. A duração na régua da
         FRENTE (7×7, 4×3, turnos) é outra, e quem a recalcula é o motor ao
         soltar. A dica DIZ isso em vez de converter aqui: uma conversão de
         tela seria uma segunda conta de duração, e o número que a pessoa lê
         enquanto arrasta não seria o que o motor grava.
         (A conversão ao vivo pede `Cronograma.diasDaFrente`, que o motor
         ainda não publica — pendência declarada da 1A.) */
      if (no && no.calendarioId) t.push("⚠ esta linha tem calendário próprio: o número acima está em dias úteis da OBRA; a duração na régua da frente é refeita ao soltar");
      if (!res.valido && res.motivo) t.push(res.motivo);
      return t.join("\n");
    },

    /* AS ALÇAS DE REDIMENSIONAR do Gantt (F3 desenha, F7 liga os eventos por
       delegação em [data-pn-alca]).
       ⚠ SÓ COM `pro.alcas === true` — que só é verdade com a fiação da F7
       carregada (Paineis.opcoesGantt). Pega desenhada sem ninguém ouvindo é
       porta que não abre: a pessoa arrasta, nada acontece, e ela conclui que o
       app travou. Sem alça, o HTML é byte a byte o da 1.2.77
       (tools/test-crono-geometria.js).
       ⚠ A alça de NOMES fica na borda do NOME (labelW), não em colW: ela mora
       entre o nome e as colunas Dur./Depende de. A fiação reposiciona o
       `left` quando a largura real muda (_gxPintar). */
    ganttProAlcas: function (pro) {
      var P = PN();
      if (!pro || pro.alcas !== true || !P || typeof P.alcaHtml !== "function") return "";
      var fA = (typeof P.faixa === "function") ? P.faixa("gxAltura", { linhas: pro.L ? pro.L.length : 0, rowH: this.GX_ROWH, barra: this.GX_BARRA,
        janelaAltura: pro.janelaAltura, cabecalho: this.GX_CABECALHO }) : null;
      /* ⚠ SEM FAIXA, SEM ALÇA DE ALTURA (F7, achado da revisão da F3). Obra
         que cabe inteira no mínimo (até 5 linhas: 14 + 5×24 = 134 px) não tem
         altura para escolher — a pega aparecia, a pessoa arrastava e nada se
         mexia: porta que não abre. E na janela destacada (modo "preencher")
         quem manda na altura é a janela: o `_gxRemedir` desfaria o arrasto no
         quadro seguinte. */
      var s = (fA && fA.max > fA.min && pro.modo !== "preencher")
        ? P.alcaHtml("gxAltura", "horizontal", "Altura do cronograma", pro.alturaCaixa, fA.min, fA.max) : "";
      if (pro.alcaNomes !== false) {
        var n = P.alcaHtml("gxNomes", "vertical", "Largura da coluna de nomes", pro.labelW, P.NOMES_MIN, P.NOMES_TETO);
        s += n.replace('<div class="pn-alca pn-alca-v"', '<div class="pn-alca pn-alca-v" style="left:' + f1(pro.labelW) + 'px"');
      }
      return s;
    },

    /* A CASCA: cabeçalho (canto + régua) e corpo (nomes + tempo). A 1ª pintura
       sai daqui já desenhada — a fiação só remede a janela e repinta.
       ⚠ Sem o motor carregado cai no Gantt de sempre: a aba não pode ficar sem
       cronograma porque um arquivo novo não veio no cache. */
    ganttPro: function (r, o) {
      o = o || {};
      if (!r || !arr(r.etapas).length) return "";
      var pro = (o.pro && o.pro.e) ? o.pro : this.ganttProEstado(r, o);
      if (!pro || !pro.e) return this.gantt(r, { detalhe: o.detalhe, abertas: o.abertas, hoje: o.hoje, rotHoje: o.rotHoje });
      var e = pro.e, p = this.ganttProPartes(r, pro, o);
      var lc = f1(p.larguraConteudo) + "px", ac = f1(p.alturaConteudo) + "px", fixo = this.ganttProRotuloFixo(pro);
      /* ⚠ `--gx-lw` é ONDE COMEÇA O DIA 0 (colW), não a largura do nome: a
         régua, o mês fixo da borda e o painel do tempo começam depois das
         colunas Dur./Depende de. Sem colunas, colW === labelW (a 1.2.77). */
      /* ⚠ A BARRA DE USO (1C: busca, filtro, ↶ ↷, Histórico) é a PRIMEIRA
         faixa DENTRO da moldura (USO §1.1): `o.topoUso`. Sem ela, a moldura de
         sempre, byte a byte. A altura dela entra em GX_USO. */
      var h = '<div class="gx" data-gx-wrap="1" style="--gx-lw:' + f1(this.ganttProColW(pro)) + 'px">' + (o.topoUso ? String(o.topoUso) : "") +
        '<div class="gx-cab"><div class="gx-canto">' + this.ganttProTopo(pro) + '</div>' +
        '<div class="gx-regua" data-gx="regua"><div class="gx-regua-in" style="width:' + lc + '">' + p.regua + '</div></div>' +
        /* ⚠ O MÊS DA BORDA ESQUERDA mora AQUI, no cabeçalho que NÃO rola — e
           não dentro do SVG da régua. Rolando para dentro de um mês, a janela
           ficava sem mês e sem ano nenhum (37 de 58 posições numa tela de
           390 px no zoom "Dia"); dentro do SVG o rótulo andaria com o desenho
           e sumiria igual. É a "faixa de período" do MS Project. */
        '<div class="gx-fixa" data-gx="fixa"' + (fixo ? '' : ' hidden') + '>' + esc(fixo) + '</div></div>' +
        '<div class="gx-corpo" style="height:' + pro.alturaCaixa + 'px">' +
        '<div class="gx-nomes" data-gx="nomes"><div class="gx-nomes-in" style="height:' + ac + '">' + p.nomes + '</div></div>' +
        '<div class="gx-plot" data-gx="plot" tabindex="0" role="application" aria-label="' +
        esc("Cronograma: arraste as barras para mudar as datas, Ctrl com a roda do mouse para o zoom, setas para navegar, Home e End para o início e o fim da obra") + '">' +
        '<div class="gx-plot-in" style="width:' + lc + ';height:' + ac + '">' + p.plot +
        '<div class="gx-fantasma" hidden></div></div></div></div>' +
        this.ganttProAlcas(pro) +
        // ⚠ a dica é filha da .gx (não do corpo): o corpo recorta, e ela precisa sair por baixo
        '<div class="gx-dica" hidden></div></div>';
      return h + (pro.motivo ? '<div class="cx-aviso">' + esc(pro.motivo) + '</div>' : '') + this.ganttProLegenda(pro, o);
    },

    /* A LEGENDA. ⚠ Com detalhe "etapa" as palavras são as MESMAS do Gantt por
       etapa de sempre ("dependência", "folga"): é o mesmo desenho lido pela
       mesma pessoa, e trocar a palavra por "dependência entre etapas" numa
       tela sem subetapa nenhuma só inventaria uma distinção que não existe. */
    // a frase da grade na legenda: só fala das colunas quando elas EXISTEM na tela (texto puro, sem dado do cliente)
    ganttProLegGrade: function (gradeW) {
      return Number(gradeW) > 0
        ? "digite a duração e o Depende de nas colunas do Gantt (duplo clique na barra) ou na tabela"
        : "duplo clique na barra abre a duração e o Depende de dela (ou digite na tabela)";
    },
    ganttProLegenda: function (pro, o) {
      o = o || {};
      if (o.semLegenda) return "";
      function amostra(css) { return '<span style="display:inline-block;width:16px;' + css + ';vertical-align:middle;margin-right:5px"></span>'; }
      var hier = pro.det !== "etapa";
      var h = '<div class="muted" style="font-size:11px;margin-top:4px;display:flex;gap:16px;flex-wrap:wrap;align-items:center">' +
        '<span>' + amostra('height:0;border-top:2px solid ' + CRIT) + 'caminho crítico (sem folga)</span>' +
        '<span>' + amostra('height:0;border-top:2px solid ' + CINZA) + (hier ? 'dependência entre etapas' : 'dependência') + '</span>';
      if (hier) h += '<span>' + amostra('height:0;border-top:2px dashed ' + INTERNA) + 'dependência entre subetapas</span>' +
        '<span>' + amostra('height:5px;background:' + RESUMO) + 'resumo da etapa</span>';
      h += '<span>' + amostra('width:12px;height:10px;border:1px dashed ' + CINZA + ';border-radius:2px') + 'folga</span>';
      if (pro.temHoje) h += '<span>' + amostra('height:0;border-top:2px dashed ' + HOJE) + esc(o.rotHoje || "hoje") + '</span>';
      /* ⚠ A LEGENDA SÓ ENSINA O QUE ESTA TELA DESENHA (a regra de baixo, na
         mesma função): cada símbolo novo da 2A só entra quando EXISTE no
         desenho. Um "⌧ = data guardada pelo app" numa obra sem sombra manda
         a pessoa procurar um símbolo que não está lá — e ensina a não ler a
         legenda. Os quatro saem do próprio `r` desta renderização. */
      var rL = pro.L, temT2A = false, temAv2A = false, temCal2A = false, iL;
      for (iL = 0; iL < rL.length && !(temT2A && temAv2A && temCal2A); iL++) {
        var nL = rL[iL] && (rL[iL].no || rL[iL].et);
        if (!nL) continue;
        if (rL[iL].tipo === "extra") temT2A = true;
        if (nL.avanco && nL.avanco.estado !== "nao-iniciada") temAv2A = true;
        if (nL.calendarioId || (rL[iL].et && rL[iL].et.calendarioId)) temCal2A = true;
      }
      if (temT2A) h += '<span>' + amostra('width:12px;height:10px;border:1.5px dashed ' + ROXO_T + ';border-radius:2px') + 'tarefa sem preço (T) — prazo sem custo no orçamento</span>';
      if (temAv2A) h += '<span>' + amostra('height:8px;background:' + CINZA + ';opacity:.35') + 'o que falta · ' + amostra('height:8px;background:' + CINZA) + 'o que já foi feito</span>' +
        '<span>' + amostra('height:0;border-top:2px dashed #b45309') + 'data de corte do avanço (não é hoje)</span>';
      if (temCal2A) h += '<span>' + amostra('width:12px;height:10px;background:rgba(15,23,42,.10)') + 'dia em que a frente daquela linha não trabalha</span>';
      /* ⚠ A LEGENDA SÓ ENSINA O QUE ESTA TELA FAZ. Roteiro do defeito (medido
         no navegador em 12/09/2026, orçamento APROVADO): o Gantt desenhava 6
         barras, `data-gx-drag` em ZERO delas, 0 alças e 0 pontos de ligar — e
         a legenda continuava dizendo "arraste a barra para mover · as bordas
         mudam a duração · o ponto da ponta liga uma dependência". Três das
         quatro instruções descreviam ações que a tela não oferecia. O `title`
         da barra explica a trava, mas `title` não existe no toque e ninguém
         passa o mouse antes de tentar arrastar: quem tenta conclui que o app
         quebrou e vai procurar a saída errada. */
      var podeArrastar = false, k;
      for (k in pro.perm) { if (own(pro.perm, k) && (pro.perm[k].mover || pro.perm[k].inicio || pro.perm[k].fim || pro.perm[k].ligar)) { podeArrastar = true; break; } }
      h += podeArrastar
        ? '<span>arraste a barra para mover · as bordas mudam a duração · o ponto da ponta liga uma dependência · Ctrl + roda = zoom</span>'
        : '<span>' + esc(pro.travado
          ? "cronograma aprovado — as barras não se movem aqui: crie uma revisão (ou, se a obra existe, replaneje pelo plano de execução dela) · Ctrl + roda = zoom"
          : "nenhuma barra desta tela se arrasta — o motivo de cada uma está no toque/parada do ponteiro sobre ela · Ctrl + roda = zoom") + '</span>';
      /* ⚠ A GRADE Dur./Depende de SÓ É ENSINADA QUANDO EXISTE (F6): com o
         js/ganttgradeui.js ausente a legenda é a da 1.2.77 (paridade em
         tools/test-crono-geometria.js); no aprovado as células são só leitura
         e a frase mandaria digitar onde nada se grava. */
      /* ⚠ `data-gx-leg-grade`: o desenho puro ainda não sabe a largura medida
         do Gantt. A 1280 px (998 px de Gantt, sem colunas e sem [Colunas]) a
         frase mandava digitar "nas colunas do Gantt", que não existiam — o
         GanttGradeUI._conferirCanto a reescreve pela `gradeW` MEDIDA. */
      if (G("GanttGradeUI") && !pro.travado) {
        h += '<span data-gx-leg-grade="1">' + this.ganttProLegGrade(pro.gradeW) + '</span>';
      }
      /* ⚠ E DIZ QUANDO O DESENHO CONTINUA À DIREITA: com o zoom em "auto" e a
         obra maior que o piso de 3 px/dia, 3 de 6 barras ficavam 100% fora da
         janela e a tela não dizia nada (medido a 1366×768 na OBRA TESTE). */
      if (!this.ganttProCabe(pro)) {
        h += '<span style="color:var(--graf-alerta,#b91c1c)">⚠ a obra não cabe nesta largura: cabem ' +
          esc(nBR(Math.round(pro.e.largura / Math.max(0.0001, pro.e.pxDia)), 0)) + ' dos ' + esc(nBR(pro.e.dias, 0)) +
          ' dias úteis — role o painel do tempo para o lado para ver o resto</span>';
      }
      return h + '</div>';
    },

    /* ==================================================================
       HISTOGRAMA DE MÃO DE OBRA (.hx) — o gráfico que mora ABAIXO do Gantt
       ==================================================================
       A pergunta que o Gantt não responde: "quantas pessoas eu preciso ter
       na obra em cada semana?". É com este número que se dimensiona
       alojamento, refeição, EPI e ônibus.

       ⚠ A RÉGUA DE HONESTIDADE É O PONTO MAIS IMPORTANTE DESTE DESENHO, e
       por isso ela é RÓTULO FIXO ao lado do pico — nunca um aviso. O TOTAL de
       horas vem do analítico SINAPI (medido, recursivo nas sub-composições);
       a DISTRIBUIÇÃO dessas horas no tempo vem da DURAÇÃO ESTIMADA da barra.
       Medido em 11/09/2026, MESMO serviço, MESMOS 80 Hh de composição: com
       custoMO de R$ 20/m² a barra dá 3 dias e o pico 3,33 pessoas; com
       R$ 5/m², 1 dia e 10,00 pessoas; pela descrição, 8 dias e 1,25 pessoa.
       OITO VEZES de diferença no número que dimensiona alojamento. Nos 51
       orçamentos reais dos backups, 752 de 752 serviços que viram pessoa têm
       a barra dimensionada por heurística.
       Um aviso que sobe em 100% dos casos vira formalidade que a pessoa
       desliga; um rótulo colado no número, não. Por isso as duas coberturas
       (`cobertura.fonteHh` e `cobertura.prazo.pctHeuristica`) saem SEMPRE,
       lado a lado, mesmo quando a fração heurística é zero.

       ⚠ E `cobertura.hhHeuristicos` NÃO VAI À TELA SOZINHO: ele é zero por
       construção (mede Hh que entrou sem vir de composição), e a pessoa leria
       "nada neste gráfico é estimativa".

       ⚠ O MESMO EIXO DE TEMPO DO GANTT, não um segundo. `pxDia`,
       `larguraConteudo` e o `scrollLeft` saem do GanttUI pela mão do
       `ganttProEstado` — um segundo cálculo de escala aqui e a semana do pico
       cairia num x diferente da barra da etapa logo acima.
       ------------------------------------------------------------------ */
    /* O ÚLTIMO modelo desenhado de cada painel (o do memo). Existe para a
       fiação REPINTAR os dois gráficos quando o zoom muda o `pxDia`, sem
       refazer a conta cara e sem precisar remontar o `d` da aba — que é do
       js/ui.js, não desta camada. ⚠ Sem isto, zoom no Gantt deixava o
       histograma na escala anterior: as barras de gente deslocadas das barras
       das etapas, que é o defeito que "mesma escala de tempo" existe para não
       ter. */
    hxUltimo: function () { return _hmemo.v; },
    lxUltimo: function () { return _lmemo.v; },

    // altura do desenho (a faixa de cima, HX_TOPO, é do rótulo do pico)
    HX_ALTURA: 142,
    HX_TOPO: 14,
    // 12 px embaixo para o rótulo de mês (ver hxMarcasSvg)
    HX_BASE: 12,
    /* ⚠ tintas CRAVADAS (não token de tema): é o mesmo papel branco do Gantt,
       encostado embaixo dele — regra 4 do cabeçalho deste arquivo. */
    HX_CORES: ["#0d6ebd", "#15803d", "#b45309", "#7c3aed", "#0e7490", "#be123c", "#4d7c0f", "#9d174d"],
    HX_OUTRAS: "#94a3b8",
    HX_MAXPROF: 8,
    HX_TETO_COR: "#b91c1c",
    /* a ALTURA do desenho do histograma: a preferência da pessoa (já presa a
       [100, 420] pelo ganttProEstado) ou os 142 de sempre. ⚠ Ela entra no
       SVG como parâmetro, e não por CSS: medido (experimento G), o quadro
       esticado para 320 px deixava o SVG com height=142 — o gráfico não
       estica, tem de ser redesenhado com a altura. */
    hxAlt: function (pro) {
      var a = pro ? Number(pro.hxAltura) : NaN;
      return (isFinite(a) && a > 0) ? a : this.HX_ALTURA;
    },

    /* O MODELO do histograma, memoizado pela assinatura de conteúdo.
       Estados possíveis (cada um com a sua frase e a sua PORTA):
         sem-motor  — o js/histograma.js ou o js/execucao.js não carregaram
         sem-base   — a base analítica da UF não está na máquina (porta: baixar)
         falhou     — o motor lançou (a mensagem dele vai à tela)
         recusou    — {ok:false} do motor (o `erro` dele vai à tela)
         vazio      — montou e não há hora-homem (o motor diz QUAL dos 4 motivos)
         ok         — há gráfico */
    hxDados: function (d, est) {
      var r = d && d.r, e = (est && est.hist) || {};
      var out = { estado: "sem-motor", motivo: "", h: null, ext: null, cores: null, escala: null };
      var H = MOD("Histograma", "./histograma.js"), E = MOD("Execucao", "./execucao.js"), A = MOD("Analitico", "./analitico.js"), Cr = C();
      if (!H || typeof H.montar !== "function") {
        out.motivo = "O motor do histograma (js/histograma.js) não está carregado nesta instalação — sem ele não dá para dizer quantas pessoas a obra pede. Atualize o OrçaPRO.";
        return out;
      }
      if (!E || typeof E.hhDoItem !== "function") {
        out.motivo = "O provedor de hora-homem (js/execucao.js) não está carregado — e este gráfico não inventa gente a partir de R$. Atualize o OrçaPRO.";
        return out;
      }
      if (!A || !A.carregado) {
        out.estado = "sem-base";
        out.motivo = "As pessoas deste gráfico saem da HORA-HOMEM da composição analítica (SINAPI), lida serviço a serviço. A base analítica do estado ainda não está nesta máquina — são ~18 MB, baixados uma vez só.";
        return out;
      }
      var chave = assinaR(r) + "|" + e.periodo + "|" + e.teto + "|" + num0(d.jornada) + "|" + num0(A._total);
      if (_hmemo.chave === chave && _hmemo.v) return _hmemo.v;
      var cal = null;
      try { cal = (Cr && Cr.calendario) ? Cr.calendario(r) : null; } catch (eC) { cal = null; }
      /* ⚠ A BASE DECLARADA DO ITEM VAI JUNTO (revisão 3, 13/09/2026). O serviço
         do cronograma não carrega `baseFonte`, e o `hhDoItem` só deixa de
         procurar na base própria o item de OUTRA base declarada (SETOP, ORSE…).
         Sem isto, numa máquina com base própria, todo código estadual fora do
         analítico saía "nem na base própria desta máquina — restaure o backup",
         sobre um item que nunca foi próprio. Liga pelo ID do item no orçamento,
         nunca pelo código ou pela descrição. */
      var baseDoItem = {};
      try {
        ((d && d.orc && d.orc.etapas) || []).forEach(function (et) {
          ((et && et.itens) || []).forEach(function (it) {
            if (it && it.id != null) baseDoItem[String(it.id)] = it.baseFonte || it.origem || "";
          });
        });
      } catch (eBf) { baseDoItem = {}; }
      var h = null;
      try {
        h = H.montar(r, {
          /* ⚠ CLOSURE, e NUNCA `Execucao.hhDoItem` solto: passado direto como
             valor, o `this` de dentro do provedor vira o próprio `opc` e a
             busca do analítico (`this._A()`) lança TypeError no 1º serviço. */
          hhDoItem: function (it, an) {
            var bf = (it && it.id != null) ? baseDoItem[String(it.id)] : "";
            if (bf && it && !it.baseFonte) { var c = {}; for (var k in it) if (Object.prototype.hasOwnProperty.call(it, k)) c[k] = it[k]; c.baseFonte = bf; it = c; }
            return E.hhDoItem(it, an || A);
          },
          analitico: A,
          periodo: e.periodo,
          jornadaH: d.jornada,
          /* texto BR direto ao motor: é ELE quem valida "3,5" e quem recusa o
             que não é número, com o motivo — um parser a mais aqui seria a
             34ª réplica do parseNum (memória "réplica de parser apodrece") */
          tetoPessoas: (e.teto === "" || e.teto == null) ? null : e.teto,
          calendario: cal
        });
      } catch (ex) {
        out.estado = "falhou";
        out.motivo = "Não consegui montar o histograma: " + String((ex && ex.message) || ex) + ". O cronograma acima continua valendo.";
        return out;
      }
      if (!h || h.ok !== true) {
        out.estado = "recusou";
        out.motivo = (h && h.erro) || "O motor do histograma recusou o cálculo e não disse por quê.";
        return out;
      }
      out.h = h;
      out.estado = h.vazio ? "vazio" : "ok";
      if (!h.vazio) {
        out.ext = this.hxExt(r, h, cal);
        out.cores = this.hxCores(h);
        out.escala = this.hxEscala(h);
      }
      _hmemo.chave = chave; _hmemo.v = out;
      return out;
    },

    /* O PRIMEIRO e o ÚLTIMO dia útil de cada balde, em ÍNDICE DE DIA — que é a
       unidade do eixo do Gantt. ⚠ Sai da MESMA partição que o `montar` usou
       (`Histograma.baldes`), não de uma segunda conta de semana: duas
       partições e a barra da semana 7 cairia sobre o dia da semana 8. */
    hxExt: function (r, h, cal) {
      var H = MOD("Histograma", "./histograma.js");
      if (!H || typeof H.baldes !== "function" || !cal || typeof cal.dia !== "function") return null;
      var B, i, bi, ext = [];
      try { B = H.baldes(r, h.periodo, cal); } catch (e) { return null; }
      if (!B || !ehArr(B.lista) || B.lista.length !== arr(h.baldes).length) return null;
      for (i = 0; i < B.lista.length; i++) ext.push({ k0: -1, k1: -1 });
      for (i = 0; i < B.doDia.length; i++) {
        bi = B.doDia[i];
        if (bi < 0 || bi >= ext.length) continue;
        if (ext[bi].k0 < 0) ext[bi].k0 = i;
        ext[bi].k1 = i;
      }
      return ext;
    },

    /* Cor por profissão. As HX_MAXPROF maiores (o motor já ordena por Hh)
       ganham cor própria; o resto vira uma faixa "outras", contada no rótulo —
       nunca omitida, senão a barra ficaria mais baixa que o número ao lado. */
    hxCores: function (h) {
      var profs = arr(h.profissoes), cor = {}, ordem = [], i;
      var n = Math.min(profs.length, this.HX_MAXPROF);
      for (i = 0; i < n; i++) { cor[profs[i].nome] = this.HX_CORES[i % this.HX_CORES.length]; ordem.push(profs[i].nome); }
      return { cor: cor, ordem: ordem, outras: profs.length - n, corOutras: this.HX_OUTRAS };
    },

    /* Escala do eixo Y com topo "redondo". ⚠ O TETO ENTRA NO MÁXIMO: com um
       teto acima do pico, a linha vermelha cairia fora do desenho e a pessoa
       leria "não passo do teto em lugar nenhum" olhando um gráfico que não
       mostra o teto. */
    hxEscala: function (h) {
      var m = 0, i, curva = arr(h.curva);
      for (i = 0; i < curva.length; i++) if (num0(curva[i]) > m) m = num0(curva[i]);
      if (h.teto != null && num0(h.teto) > m) m = num0(h.teto);
      if (!(m > 0)) m = 1;
      var cand = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];
      var passo = cand[cand.length - 1];
      for (i = 0; i < cand.length; i++) if (m / cand[i] <= 4) { passo = cand[i]; break; }
      var topo = Math.ceil(m / passo) * passo;
      if (!(topo > 0)) topo = passo;
      var ticks = [], t = 0, giros = 0;
      while (t <= topo + 1e-9 && giros++ < 20) { ticks.push(Math.round(t * 1000) / 1000); t += passo; }
      return { topo: topo, passo: passo, ticks: ticks, max: m };
    },

    /* geometria do eixo X: a do Gantt quando ele está de pé; um fallback com
       largura fixa quando o motor interativo não carregou (a tela não pode
       ficar sem histograma porque um arquivo novo não veio no cache) */
    hxGeo: function (pro, nDias) {
      if (pro && pro.e && pro.e.pxDia > 0) return { pxDia: pro.e.pxDia, W: Math.max(1, pro.e.larguraConteudo), doGantt: true };
      var dias = Math.max(1, Math.round(num0(nDias) || 1));
      return { pxDia: 900 / dias, W: 900, doGantt: false };
    },

    /* AS VIRADAS DE MÊS no eixo de dia útil, para os gráficos de baixo.
       ⚠ Existe porque estes painéis são LIDOS SOZINHOS: a régua de datas está
       no cabeçalho do Gantt, e quem rola a página até o histograma deixa o
       Gantt para trás — um gráfico de pico de gente sem nenhuma âncora de
       tempo obriga a pessoa a rolar para cima e contar barras.
       ⚠ As datas saem do CALENDÁRIO DO MOTOR (`pro.cal`), nunca de uma conta
       de dia útil daqui: uma segunda régua e as marcas deixariam de casar com
       o Gantt logo acima justamente onde há feriado. Sem calendário, devolve
       lista vazia — nada é inventado. */
    hxMeses: function (pro) {
      var out = [];
      if (!pro || !pro.e || !pro.cal || typeof pro.cal.dia !== "function") return out;
      var n = Math.max(1, Math.round(pro.e.dias)), k, ant = null, d, iu;
      for (k = 0; k < n && k < 4000; k++) {
        d = pro.cal.dia(k);
        if (!ehData(d)) break;
        iu = d.getFullYear() * 12 + d.getMonth();
        if (ant === null || iu !== ant) { out.push({ k: k, rotulo: MES3[d.getMonth()] + "/" + String(d.getFullYear()).slice(2) }); ant = iu; }
      }
      return out;
    },
    /* as marcas de mês desenhadas (linha + rótulo), em px de conteúdo. O
       rótulo só sai quando cabe: a menos de 34 px do anterior ele vira borrão
       (o mesmo corte que o GanttUI faz na régua de cima). */
    hxMarcasSvg: function (pro, pxDia, altura, yTexto) {
      var s = "", ultimo = -1e9;
      this.hxMeses(pro).forEach(function (m) {
        var x = m.k * pxDia;
        /* a linha do dia 0 não se desenha (ela cairia em cima da borda do
           painel), mas o RÓTULO sai: sem ele o primeiro mês da obra ficava
           sem nome e a leitura começava em branco */
        if (x > 0.5) s += '<line x1="' + f1(x) + '" y1="0" x2="' + f1(x) + '" y2="' + f1(altura) + '" stroke="#e2e8f0" stroke-width="1"/>';
        if (x - ultimo < 34) return;
        ultimo = x;
        s += '<text x="' + f1(x + 3) + '" y="' + f1(yTexto) + '" font-size="8.5" fill="#94a3b8">' + esc(m.rotulo) + '</text>';
      });
      return s;
    },
    // casas decimais do eixo Y pelo PASSO (nunca pelo valor: "0,00 5,0 10 15" mistura três réguas na mesma coluna)
    hxCasas: function (passo) {
      var p = num0(passo);
      if (p >= 1) return (Math.abs(p - Math.round(p)) < 1e-9) ? 0 : 1;
      return (p >= 0.1) ? 1 : 2;
    },

    // AS BARRAS EMPILHADAS, em px de CONTEÚDO (o mesmo sistema do `gantt()` pro)
    hxPlot: function (hx, pro) {
      var self = this, h = hx && hx.h;
      if (!h || !hx.escala) return "";
      /* ⚠ `sc`, NUNCA `esc`: `esc` é o ESCAPADOR de HTML deste arquivo. Uma
         variável local com esse nome sombreia a função dentro de todo o corpo
         (e dos callbacks), e a primeira chamada a `esc(texto)` vira
         "esc is not a function" — o render inteiro da aba estoura e a tela
         fica com o DESENHO ANTERIOR, sem erro visível. Custou uma sonda. */
      var g = this.hxGeo(pro, h.diasUteis), sc = hx.escala;
      var A = this.hxAlt(pro), T = this.HX_TOPO, Bt = this.HX_BASE, plotH = A - T - Bt;
      var cor = hx.cores.cor, ordem = hx.cores.ordem, ext = hx.ext;
      function Y(v) { return T + plotH * (1 - (num0(v) / sc.topo)); }
      var s = '<svg class="hx-svg" data-hx="plot-svg" width="' + f1(g.W) + '" height="' + A + '" viewBox="0 0 ' + f1(g.W) + ' ' + A +
        '" style="display:block;background:#fff;font-family:inherit">';
      s += this.hxMarcasSvg(pro, g.pxDia, Y(0), A - 2);
      sc.ticks.forEach(function (t) {
        s += '<line x1="0" y1="' + f1(Y(t)) + '" x2="' + f1(g.W) + '" y2="' + f1(Y(t)) + '" stroke="' + (t === 0 ? "#cbd5e1" : "#eef2f7") + '" stroke-width="1"/>';
      });
      arr(h.baldes).forEach(function (b, i) {
        var ex = ext ? ext[i] : null;
        /* ⚠ balde sem dia no calendário NÃO é desenhado no lugar de outro: o
           motor já contou esse caso em `avisos` e um retângulo chutado aqui
           mentiria sobre QUANDO o pico acontece. */
        var x0, x1;
        if (!(ex && ex.k0 >= 0)) return;
        x0 = ex.k0 * g.pxDia; x1 = (ex.k1 + 1) * g.pxDia;
        var w = Math.max(1, x1 - x0 - (g.pxDia > 4 ? 1 : 0));
        var acc = 0, pp = b.porProfissao || {}, usados = {}, k, outras = 0, partes = [];
        ordem.forEach(function (nome) {
          var v = own(pp, nome) ? num0(pp[nome].pessoas) : 0;
          usados[nome] = 1;
          if (!(v > 0)) return;
          var yT = Y(acc + v), yB = Y(acc);
          s += '<rect x="' + f1(x0) + '" y="' + f1(yT) + '" width="' + f1(w) + '" height="' + f1(Math.max(0.6, yB - yT)) +
            '" fill="' + cor[nome] + '"/>';
          acc += v; partes.push(nome + " " + nBR(v, 2));
        });
        for (k in pp) if (own(pp, k) && !own(usados, k)) outras += num0(pp[k].pessoas);
        if (outras > 0) {
          var yTo = Y(acc + outras), yBo = Y(acc);
          s += '<rect x="' + f1(x0) + '" y="' + f1(yTo) + '" width="' + f1(w) + '" height="' + f1(Math.max(0.6, yBo - yTo)) +
            '" fill="' + self.HX_OUTRAS + '"/>';
          acc += outras; partes.push("outras " + nBR(outras, 2));
        }
        if (b.acimaDoTeto) s += '<rect x="' + f1(x0) + '" y="' + f1(Y(acc)) + '" width="' + f1(w) + '" height="' + f1(Math.max(0.6, Y(0) - Y(acc))) +
          '" fill="none" stroke="' + self.HX_TETO_COR + '" stroke-width="1.5"/>';
        var tit = b.rotuloLongo + "\n" + nBR(b.pessoas, 2) + " pessoas/dia · " + nBR(b.hh, 1) + " Hh em " + b.diasUteis + " dia(s) útil(eis)" +
          (b.acimaDoTeto ? "\nACIMA do teto informado (" + nBR(num0(h.teto), 2) + ")" : "") +
          (partes.length ? "\n" + partes.slice(0, 8).join(" · ") : "");
        s += '<rect x="' + f1(x0) + '" y="' + T + '" width="' + f1(w) + '" height="' + f1(plotH) + '" fill="transparent"><title>' + esc(tit) + '</title></rect>';
      });
      /* TETO: linha tracejada vermelha. Está no gráfico E no rótulo — a cor
         sozinha não é recado para quem não a distingue. */
      if (h.teto != null) {
        s += '<line x1="0" y1="' + f1(Y(h.teto)) + '" x2="' + f1(g.W) + '" y2="' + f1(Y(h.teto)) + '" stroke="' + this.HX_TETO_COR +
          '" stroke-width="1.5" stroke-dasharray="6 4"/>';
      }
      // o PICO marcado no desenho (o número exato fica na régua de honestidade)
      if (h.pico && ext && ext[h.pico.i] && ext[h.pico.i].k0 >= 0) {
        var px = (ext[h.pico.i].k0 + (ext[h.pico.i].k1 + 1 - ext[h.pico.i].k0) / 2) * g.pxDia;
        s += '<text x="' + f1(px) + '" y="10" font-size="9" font-weight="700" fill="#0f172a" text-anchor="middle">▲ pico ' + esc(nBR(h.pico.pessoas, 1)) + '</text>';
      }
      return s + '</svg>';
    },

    // A COLUNA DA ESQUERDA: a escala de pessoas, na largura da coluna de nomes
    hxEixo: function (hx, pro) {
      if (!hx || !hx.escala) return "";
      /* ⚠ a coluna da esquerda tem a largura de ONDE COMEÇA O DIA 0 do Gantt
         (colW), não a do nome: com as colunas Dur./Depende de, largura de nome
         aqui poria o dia 0 do histograma 134 px antes do dia 0 da barra */
      var W = this.ganttProColW(pro);
      // ⚠ `sc` e não `esc`: ver o porquê em `hxPlot`
      var A = this.hxAlt(pro), T = this.HX_TOPO, Bt = this.HX_BASE, plotH = A - T - Bt, sc = hx.escala;
      function Y(v) { return T + plotH * (1 - (num0(v) / sc.topo)); }
      var s = '<svg class="hx-eixo-svg" data-hx="eixo-svg" width="' + f1(W) + '" height="' + A + '" viewBox="0 0 ' + f1(W) + ' ' + A +
        '" style="display:block;background:#fff;font-family:inherit">';
      s += '<text x="6" y="10" font-size="9.5" font-weight="600" fill="#334155">pessoas/dia (equivalente)</text>';
      var casas = this.hxCasas(sc.passo);
      sc.ticks.forEach(function (t) {
        s += '<line x1="' + f1(W - 5) + '" y1="' + f1(Y(t)) + '" x2="' + f1(W) + '" y2="' + f1(Y(t)) + '" stroke="#cbd5e1" stroke-width="1"/>' +
          '<text x="' + f1(W - 8) + '" y="' + f1(Y(t) + 3) + '" font-size="9" fill="#64748b" text-anchor="end">' + esc(nBR(t, casas)) + '</text>';
      });
      if (hx.h && hx.h.teto != null) {
        s += '<text x="6" y="' + f1(Y(hx.h.teto) - 3) + '" font-size="9" font-weight="700" fill="' + this.HX_TETO_COR + '">teto ' + esc(nBR(num0(hx.h.teto), 2)) + '</text>';
      }
      return s + '</svg>';
    },

    /* A RÉGUA DE HONESTIDADE — rótulo FIXO ao lado do pico. Ver o ⚠ grande no
       topo deste bloco: é a peça mais importante do histograma. */
    hxRegua: function (hx) {
      var h = hx.h, c = h.cobertura || {}, pz = c.prazo || {};
      var s = '<div class="hx-regua">';
      s += '<b>Pico: ' + esc(nBR(num0(h.pico && h.pico.pessoas), 2)) + ' pessoas/dia</b>' +
        (h.pico ? ' <span class="muted">· ' + esc(h.pico.rotuloLongo) + ' · ' + esc(nBR(h.pico.hh, 1)) + ' Hh em ' + h.pico.diasUteis + ' dia(s) útil(eis)</span>' : '') +
        ' <span class="muted">· média ' + esc(nBR(num0(h.media), 2)) + ' · total ' + esc(nBR(num0(h.totalHh), 1)) + ' Hh</span>';
      /* ⚠ AS DUAS FONTES, SEMPRE E SEPARADAS. Uma só esconderia que o pico é
         "medido ÷ estimado" — e é o pico que dimensiona alojamento. */
      s += '<span class="hx-f"><b>horas (numerador):</b> ' + esc(c.fonteHh || "") + '</span>';
      s += '<span class="hx-f"><b>prazo (denominador):</b> ' + esc(num0(pz.heuristicos)) + ' de ' + esc(num0(pz.servicos)) +
        ' serviços (' + esc(nBR(num0(pz.pctHeuristica), 1)) + '%) têm a barra dimensionada por estimativa — ' + esc(pz.fonte || c.fontePrazo || "") + '</span>';
      s += '<span class="hx-f"><b>jornada:</b> ' + esc(h.fonteJornada || "") + ' · <b>cobertura:</b> ' + esc(c.msg || "") + '</span>';
      var fora = arr(h.semBase).length;
      if (fora) {
        s += '<button type="button" class="hx-link" data-acao="crono-hist-fora" title="Abre a lista dos serviços que não entraram no gráfico, com o motivo de cada um">' +
          fora + ' serviço(s) fora do gráfico — ver a lista e o motivo</button>';
      }
      return s + '</div>';
    },

    // A LISTA do que ficou fora, com o MOTIVO de cada um (nunca um total mudo)
    hxFora: function (hx) {
      var h = hx.h, lista = arr(h.semBase), porMotivo = {}, ordem = [], i, m;
      for (i = 0; i < lista.length; i++) {
        m = String(lista[i].motivo || "—");
        if (!own(porMotivo, m)) { porMotivo[m] = 0; ordem.push(m); }
        porMotivo[m]++;
      }
      var s = '<div class="hx-cx"><h5>' + lista.length + ' serviço(s) fora do histograma</h5>' +
        '<div class="muted" style="font-size:11.5px">Um serviço só vira pessoa aqui quando a composição dele tem hora-homem rastreável. Os motivos abaixo pedem ações diferentes — “fora da base analítica” é base para baixar, “sem quantidade” é levantamento para fechar.</div><ul class="cx-lista">';
      ordem.forEach(function (k) { s += '<li>' + esc(String(porMotivo[k]) + " × ") + esc(k) + '</li>'; });
      s += '</ul><div class="hx-rolagem"><table class="hx-tab"><thead><tr><th>Nº</th><th>Serviço</th><th>Código</th><th>Motivo</th></tr></thead><tbody>';
      lista.slice(0, 300).forEach(function (x) {
        s += '<tr><td>' + esc(x.numero || "") + '</td><td class="w">' + esc(x.nome || "") + '</td><td>' + esc(x.codigo == null ? "—" : x.codigo) +
          '</td><td>' + esc(x.motivo || "") + '</td></tr>';
      });
      s += '</tbody></table></div>';
      if (lista.length > 300) s += '<div class="muted" style="font-size:11.5px;margin-top:4px">Mostrando os 300 primeiros de ' + lista.length + '.</div>';
      return s + '</div>';
    },

    // a legenda (profissões) + a linha de equipamento, com o critério do motor
    hxLegenda: function (hx) {
      var self = this, h = hx.h, s = '<div class="hx-leg">';
      arr(h.profissoes).slice(0, this.HX_MAXPROF).forEach(function (p, i) {
        s += '<span title="' + esc(p.nome + " — " + nBR(p.hh, 1) + " Hh no total, média de " + nBR(p.pessoasMedia, 2) + " pessoa(s)/dia" +
          (p.pico ? "; pico de " + nBR(p.pico.pessoas, 2) + " em " + p.pico.rotulo : "")) + '"><i class="hx-am" style="background:' +
          self.HX_CORES[i % self.HX_CORES.length] + '"></i>' + esc(p.nome) + ' <span class="cx-chipnum">' + esc(nBR(p.pessoasMedia, 2)) + '</span></span>';
      });
      if (hx.cores && hx.cores.outras > 0) {
        s += '<span title="As demais profissões, somadas numa faixa só."><i class="hx-am" style="background:' + this.HX_OUTRAS + '"></i>outras ' + hx.cores.outras + ' profissão(ões)</span>';
      }
      if (h.teto != null) s += '<span><i class="hx-am" style="background:transparent;border:1.5px solid ' + this.HX_TETO_COR + '"></i>acima do teto (' + esc(nBR(num0(h.teto), 2)) + ')</span>';
      s += '</div>';
      /* EQUIPAMENTO: a tela imprime o MOTIVO do motor. ⚠ `ok:false` tem três
         portas (sem provedor, leitura falhou, base não carregada) e NENHUMA
         delas quer dizer "esta obra não tem máquina". */
      var eq = h.equipamento || {};
      s += '<div class="hx-f hx-eq" style="font-size:11px;margin-top:3px">';
      if (eq.ok) {
        s += '<b>Equipamento:</b> ' + esc(nBR(num0(eq.totalH), 1)) + ' h de máquina' +
          (eq.pico ? ', pico de ' + esc(nBR(num0(eq.pico.maquinas), 2)) + ' máquina(s)/dia em ' + esc(eq.pico.rotulo) : '') +
          (eq.motivo ? ' — ' + esc(eq.motivo) : '') + ' · ' + esc(eq.observacao || "");
      } else {
        s += '<b>Equipamento:</b> ' + esc(eq.motivo || "não foi possível separar as horas de equipamento.");
      }
      return s + '</div>';
    },

    /* O PAINEL INTEIRO. Fechado por padrão (ver o ⚠ da base de 18 MB em
       `estado`): uma linha com a porta, e nada mais. */
    histogramaPainel: function (d, est, pro) {
      var e = (est && est.hist) || {}, r = d && d.r;
      var lw = this.ganttProColW(pro);
      var cab = '<button type="button" class="hx-tog" data-acao="crono-hist" data-hx-abrir="' + (e.aberto ? '0' : '1') + '" aria-expanded="' + (e.aberto ? 'true' : 'false') +
        '" title="Quantas pessoas de cada profissão a obra pede em cada semana (ou mês) — o gráfico com que se dimensiona alojamento, refeição, EPI e ônibus. Abrir baixa a base analítica do estado (~18 MB), uma vez só.">' +
        (e.aberto ? '▾' : '▸') + ' Mão de obra (histograma)</button>';
      if (!e.aberto) {
        return '<div class="hx" style="--gx-lw:' + f1(lw) + 'px"><div class="hx-cab so">' + cab +
          /* ⚠ A FONTE SAI DIVIDIDA JÁ NA LINHA FECHADA. Roteiro do defeito: o
             painel nasce fechado (é assim que quase todo mundo o lê) e a única
             frase visível creditava o gráfico inteiro ao SINAPI — enquanto a
             caixa "Sobre este gráfico", que só quem abre vê, diz o contrário:
             o TOTAL de horas vem do analítico, mas a DISTRIBUIÇÃO no tempo (e
             portanto o PICO, que é o número que dimensiona alojamento) depende
             do prazo ESTIMADO do cronograma. Quem decide alojamento pela linha
             fechada não via a ressalva. */
          '<span class="muted">quantas pessoas por semana, por profissão — horas do analítico SINAPI, distribuídas pelo prazo ESTIMADO do cronograma</span></div></div>';
      }
      var hx = e.carregando ? { estado: "carregando" } : this.hxDados(d, est);
      var ctrl = '<span class="cx-seg" role="group" aria-label="Período do histograma">' +
        '<button class="' + (e.periodo === "semana" ? 'on' : '') + '" data-acao="crono-hist-per" data-per="semana" aria-pressed="' + (e.periodo === "semana" ? 'true' : 'false') + '">Semana</button>' +
        '<button class="' + (e.periodo === "mes" ? 'on' : '') + '" data-acao="crono-hist-per" data-per="mes" aria-pressed="' + (e.periodo === "mes" ? 'true' : 'false') + '">Mês</button></span>' +
        '<label style="display:inline-flex;gap:5px;align-items:center">Teto de pessoas' +
        '<input type="text" inputmode="decimal" data-crono-hist-teto="1" value="' + esc(e.teto) + '" placeholder="ex.: 12" style="width:70px" ' +
        'title="Quantas pessoas a obra comporta (alojamento, refeitório, frente de serviço). Aceita 12 ou 12,5. Os períodos acima do teto saem marcados em vermelho.">' +
        '</label>';
      var corpo = '', pe = '';
      if (hx.estado === "carregando") {
        corpo = '<div class="hx-cx">Baixando a base analítica do estado (~18 MB, uma vez só) e lendo a composição de cada serviço… O cronograma acima continua valendo.</div>';
      } else if (hx.estado === "sem-base") {
        corpo = '<div class="hx-cx">' + esc(hx.motivo) +
          '<div style="margin-top:6px"><button class="btn sm primary" data-acao="crono-hist-base" title="Baixa a base analítica da UF ativa e monta o histograma. Nada é gravado no orçamento.">Baixar a base analítica e montar o histograma</button></div></div>';
      } else if (hx.estado === "sem-motor" || hx.estado === "falhou" || hx.estado === "recusou") {
        corpo = '<div class="hx-cx">' + esc(hx.motivo) + '</div>';
      } else if (hx.estado === "vazio") {
        /* ⚠ "não tem" é diferente de "não deu para conferir": as quatro frases
           do motor pedem quatro ações diferentes, e só uma fala do orçamento.
           Por isso saem as frases DELE, não uma reescrita. */
        corpo = '<div class="hx-cx"><h5>Sem histograma de mão de obra para mostrar</h5><ul class="cx-lista">';
        arr(hx.h.avisos).forEach(function (a) { corpo += '<li>' + esc(a) + '</li>'; });
        corpo += '</ul></div>';
      } else if (!hx.ext) {
        /* ⚠ SEM A POSIÇÃO DOS BALDES NO EIXO DE DIA ÚTIL, NÃO SE DESENHA.
           Espalhar as barras igualmente pela largura poria o pico numa semana
           em que ele não acontece — e é justamente o pico que dimensiona
           alojamento e contratação. Números sem desenho, e o motivo. */
        corpo = '<div class="hx-cx"><h5>Não consigo casar as semanas com o calendário do cronograma</h5>' +
          '<div>Os números existem (' + esc(nBR(num0(hx.h.totalHh), 1)) + ' Hh, média de ' + esc(nBR(num0(hx.h.media), 2)) +
          ' pessoa(s)/dia), mas sem a posição de cada período no eixo de dias úteis o gráfico apontaria o pico para a semana errada — e é o pico que dimensiona alojamento e contratação. Confira a data de início do cronograma.</div></div>';
      } else {
        var g = this.hxGeo(pro, hx.h.diasUteis);
        pe = '<div class="hx-corpo">' +
          '<div class="hx-eixo" data-hx="eixo"><div class="hx-eixo-in">' + this.hxEixo(hx, pro) + '</div></div>' +
          '<div class="hx-plot' + (g.doGantt ? '' : ' rola') + '" data-hx="plot" aria-hidden="true"><div class="hx-plot-in" style="width:' + f1(g.W) + 'px">' +
          this.hxPlot(hx, pro) + '</div></div></div>';
        corpo = this.hxRegua(hx) + this.hxLegenda(hx) + (e.fora ? this.hxFora(hx) : "");
        /* os avisos do motor entram DEPOIS da régua fixa: a régua é o rótulo
           que sempre se lê; o aviso é o que mudou nesta obra */
        var avs = arr(hx.h.avisos);
        if (avs.length) {
          corpo += '<div class="cx-aviso"><b>Sobre este gráfico:</b><ul class="cx-lista">';
          avs.slice(0, 4).forEach(function (a) { corpo += '<li>' + esc(a) + '</li>'; });
          if (avs.length > 4) corpo += '<li>e mais ' + (avs.length - 4) + ' aviso(s)</li>';
          corpo += '</ul></div>';
        }
      }
      /* a alça de altura só existe com desenho (pe) e com a fiação da F7
         (pro.alcas): sem gráfico não há o que esticar */
      var PNx = (pe && pro && pro.alcas === true) ? PN() : null;
      var alcaHx = PNx ? PNx.alcaHtml("hxAltura", "horizontal", "Altura do histograma", this.hxAlt(pro), PNx.HX[0], PNx.HX[1]) : "";
      return '<div class="hx" data-hx-wrap="mo" style="--gx-lw:' + f1(lw) + 'px"><div class="hx-cab">' + cab + ctrl + '</div>' + pe + alcaHx + '</div>' + corpo;
    },

    /* ==================================================================
       LINHA DE BALANÇO (.lx) — a outra leitura do MESMO cronograma
       ==================================================================
       ⚠ ELA SÓ EXISTE EM OBRA REPETITIVA, e o OrçaPRO NÃO TEM CADASTRO DE
       LOCAIS: o motor descobre pavimento/torre/casa no PRÓPRIO NOME da EAP.
       Nos 22 orçamentos reais dos backups o motor aceita ZERO locais (recusa
       um, com o motivo) — ou seja, "esta obra não tem repetição detectável" é
       o estado NORMAL desta tela, não um erro. Por isso ele é desenhado como
       explicação (o que foi procurado, o que quase passou, o que foi vetado e
       por quê), nunca como falha.
       ⚠ E NUNCA um gráfico vazio: reta traçada por cima de lacuna é
       exatamente o "local inventado" que o js/lob.js existe para impedir. */
    LX_ROWH: 20,
    LX_TOPO: 6,
    LX_MAXLIN: 12,
    LX_CORES: ["#0d6ebd", "#15803d", "#b45309", "#7c3aed", "#0e7490", "#be123c", "#4d7c0f", "#9d174d"],

    lxDados: function (d) {
      var r = d && d.r, out = { estado: "sem-motor", motivo: "", plano: null, m: null };
      var L = MOD("LOB", "./lob.js"), Cr = C();
      if (!L || typeof L.locaisDe !== "function") {
        out.motivo = "O motor da linha de balanço (js/lob.js) não está carregado nesta instalação. Atualize o OrçaPRO.";
        return out;
      }
      var chave = assinaR(r);
      if (_lmemo.chave === chave && _lmemo.v) return _lmemo.v;
      var cal = null;
      try { cal = (Cr && Cr.calendario) ? Cr.calendario(r) : null; } catch (eC) { cal = null; }
      var plano = null, m = null;
      try { plano = L.locaisDe(d.orc || r, {}); } catch (ex) {
        out.estado = "falhou";
        out.motivo = "Não consegui procurar repetição por local: " + String((ex && ex.message) || ex);
        return out;
      }
      out.plano = plano;
      if (plano && plano.temLocais) {
        try {
          // ⚠ a função vai EMBRULHADA: `cal.dia` solto perde o `this` do calendário
          m = L.montar(r, plano, { dia: (cal && cal.dia) ? function (k) { return cal.dia(k); } : null });
        } catch (ex2) { m = null; }
      }
      out.m = m;
      out.estado = (m && m.temLob) ? "ok" : "sem-repeticao";
      if (out.estado === "sem-repeticao") out.motivo = (m && m.motivo) || (plano && plano.motivo) || "";
      _lmemo.chave = chave; _lmemo.v = out;
      return out;
    },

    // AS LINHAS (uma por serviço), no MESMO eixo de tempo do Gantt
    lxPlot: function (lx, pro) {
      var self = this, m = lx && lx.m;
      if (!m || !m.temLob) return "";
      var locais = arr(m.locais), servicos = arr(m.servicos).slice(0, this.LX_MAXLIN);
      var g = this.hxGeo(pro, num0(m.janela && m.janela.dias) || 1);
      var rowH = this.LX_ROWH, T = this.LX_TOPO, corpoH = Math.max(1, locais.length) * rowH, A = T + corpoH + 12;
      function Y(idx) { return T + idx * rowH + rowH / 2; }
      var s = '<svg class="lx-svg" data-hx="plot-svg" width="' + f1(g.W) + '" height="' + f1(A) + '" viewBox="0 0 ' + f1(g.W) + ' ' + f1(A) +
        '" style="display:block;background:#fff;font-family:inherit">';
      locais.forEach(function (L, i) {
        if (i % 2 === 1) s += '<rect x="0" y="' + f1(T + i * rowH) + '" width="' + f1(g.W) + '" height="' + f1(rowH) + '" fill="#f8fafc"/>';
      });
      // a mesma âncora de tempo do histograma (ver hxMarcasSvg)
      s += this.hxMarcasSvg(pro, g.pxDia, T + corpoH, A - 2);
      servicos.forEach(function (S, si) {
        var cor = self.LX_CORES[si % self.LX_CORES.length], pts = arr(S.pontos), ant = null;
        pts.forEach(function (p) {
          var x0 = num0(p.inicio) * g.pxDia, x1 = (num0(p.fim) + 1) * g.pxDia, y = Y(p.idx);
          s += '<line x1="' + f1(x0) + '" y1="' + f1(y) + '" x2="' + f1(Math.max(x0 + 1.5, x1)) + '" y2="' + f1(y) + '" stroke="' + cor +
            '" stroke-width="3.5" stroke-linecap="round"><title>' + esc(S.nome + "\n" + p.local + ": " + p.de + " → " + p.ate + " (" + (num0(p.dias) + 1) + " dia(s) útil(eis))") + '</title></line>';
          /* ⚠ O CONECTOR SÓ LIGA LOCAIS VIZINHOS. Pulando um local ele
             atravessaria uma LACUNA — e uma reta por cima de buraco é a
             interpolação que este módulo existe para não fazer. */
          if (ant && p.idx - ant.idx === 1) {
            s += '<line x1="' + f1((num0(ant.fim) + 1) * g.pxDia) + '" y1="' + f1(Y(ant.idx)) + '" x2="' + f1(num0(p.inicio) * g.pxDia) + '" y2="' + f1(y) +
              '" stroke="' + cor + '" stroke-width="1.2" stroke-opacity="0.55"/>';
          }
          ant = p;
        });
        arr(S.lacunas).forEach(function (lc) {
          var y = Y(lc.idx);
          s += '<circle cx="' + f1(6 + si * 9) + '" cy="' + f1(y) + '" r="2.6" fill="none" stroke="' + cor + '" stroke-width="1" stroke-dasharray="1.6 1.4">' +
            '<title>' + esc(S.nome + " — " + lc.rotulo + ": lacuna, " + lc.motivo + ". Nada foi interpolado.") + '</title></circle>';
        });
      });
      return s + '</svg>';
    },

    lxEixo: function (lx, pro) {
      var m = lx && lx.m;
      if (!m || !m.temLob) return "";
      // a coluna dos locais começa e acaba onde a do Gantt: dia 0 em colW
      var W = this.ganttProColW(pro), locais = arr(m.locais);
      // ⚠ a MESMA altura do `lxPlot` (T + corpo + 12): eixo e desenho com
      // alturas diferentes deslocam o rótulo do local da linha dele
      var rowH = this.LX_ROWH, T = this.LX_TOPO, A = T + Math.max(1, locais.length) * rowH + 12;
      var corte = this.ganttProCorte(W);
      var s = '<svg class="lx-eixo-svg" data-hx="eixo-svg" width="' + f1(W) + '" height="' + f1(A) + '" viewBox="0 0 ' + f1(W) + ' ' + f1(A) +
        '" style="display:block;background:#fff;font-family:inherit">';
      locais.forEach(function (L, i) {
        if (i % 2 === 1) s += '<rect x="0" y="' + f1(T + i * rowH) + '" width="' + f1(W) + '" height="' + f1(rowH) + '" fill="#f8fafc"/>';
        s += '<text x="6" y="' + f1(T + i * rowH + rowH / 2 + 3.5) + '" font-size="10" fill="#334155"><title>' + esc(L.rotulo) + '</title>' +
          esc(corta(L.rotulo, corte)) + '</text>';
      });
      return s + '</svg>';
    },

    /* O painel da linha de balanço. Duas telas muito diferentes:
       - com repetição: o gráfico, as duas parcelas da confiança e o resumo;
       - sem repetição (o caso NORMAL): a explicação do que foi procurado. */
    lobPainel: function (d, est, pro) {
      var self = this, e = (est && est.hist) || {}, lw = this.ganttProColW(pro);
      /* ⚠ O MOTOR RODA MESMO COM O PAINEL FECHADO, de propósito: é o que
         permite a linha de uma linha só dizer o ESTADO ("esta obra não tem
         repetição por local detectável") em vez de um rótulo mudo que obriga
         a pessoa a abrir para descobrir que não há nada. CUSTO MEDIDO
         (12/09/2026, orçamento sintético de 2.400 serviços / 2.680 nós):
         `LOB.locaisDe` 15 ms na 1ª vez; com o memo, o render inteiro da
         sub-aba passou de 19,8 ms para 24,0 ms — +4,2 ms por render, com o
         histograma fechado. Se um dia isto pesar, o caminho NÃO é sortear o
         rótulo: é memoizar por orçamento fora do render. */
      var lx = this.lxDados(d), tem = lx.estado === "ok";
      var resumoCurto = tem ? ((lx.m.locais || []).length + " locais · " + (lx.m.servicos || []).length + " serviços que repetem")
        : (lx.estado === "sem-motor" || lx.estado === "falhou" ? "motor indisponível" : "esta obra não tem repetição por local detectável nos nomes");
      var aberto = (e.lob === true || e.lob === false) ? e.lob : tem;
      var cab = '<button type="button" class="hx-tog" data-acao="crono-lob" data-hx-abrir="' + (aberto ? '0' : '1') + '" aria-expanded="' + (aberto ? 'true' : 'false') +
        '" title="Eixo Y = local (pavimento, torre, casa), eixo X = tempo. Mostra em que RITMO as equipes sobem e onde elas se atropelam. Só existe em obra repetitiva.">' +
        (aberto ? '▾' : '▸') + ' Linha de balanço</button>';
      var cabHtml = '<div class="hx-cab' + (aberto && tem ? '' : ' so') + '">' + cab + '<span class="muted">' + esc(resumoCurto) + '</span></div>';
      if (!aberto) return '<div class="hx" style="--gx-lw:' + f1(lw) + 'px">' + cabHtml + '</div>';
      if (!tem) {
        /* ⚠ ESTADO NORMAL, NÃO ERRO. O motivo do motor CONTA o que foi visto
           ("achei Pavimento em 2 nomes e preciso de 3"), e é ele que manda a
           pessoa renomear em vez de procurar defeito no app. */
        var p = lx.plano || {}, corpoS = '<div class="hx-cx"><h5>Esta obra não tem repetição por local detectável</h5>' +
          '<div>' + esc(lx.motivo || p.motivo || "") + '</div>';
        if (arr(p.quase).length) {
          corpoS += '<div style="margin-top:6px"><b>O que quase passou:</b><ul class="cx-lista">';
          arr(p.quase).slice(0, 4).forEach(function (q) {
            corpoS += '<li>' + esc((q.palavra ? "“" + q.palavra + "” (" + (q.eixo || "") + "): " : "") + (q.motivo || "")) + '</li>';
          });
          corpoS += '</ul></div>';
        }
        if (arr(p.vetados).length) {
          corpoS += '<div style="margin-top:6px"><b>Trechos que PARECEM local e não são</b> <span class="muted">(' + num0(p.vetadosTotal) +
            ' no total; “4 PAVIMENTOS” é quantidade, “BLOCO E SAPATA” é conjunção):</span><ul class="cx-lista">';
          arr(p.vetados).slice(0, 5).forEach(function (v) {
            corpoS += '<li>' + esc("“" + (v.trecho || "") + "” em " + corta(v.nome || "", 48) + " — " + (v.motivo || "")) + '</li>';
          });
          corpoS += '</ul></div>';
        }
        /* ⚠ duas LINHAS, não uma frase colada: o `rotulo` do motor não termina
           em ponto, e emendado na frase seguinte saía "…não tem cadastro de
           locais Para usar a linha de balanço…" (visto na foto do navegador) */
        corpoS += '<div class="muted" style="margin-top:6px;font-size:11.5px">' + esc(p.rotulo || "") + '</div>' +
          '<div class="muted" style="margin-top:2px;font-size:11.5px">Para usar a linha de balanço, nomeie o que repete com o local (ex.: “Alvenaria — Pavimento 1”, “Pavimento 2”, “Pavimento 3”): bastam ' +
          num0(p.minLocais || 3) + ' locais com o mesmo serviço.</div></div>';
        return '<div class="hx" style="--gx-lw:' + f1(lw) + 'px">' + cabHtml + '</div>' + corpoS;
      }
      var m = lx.m, g = this.hxGeo(pro, num0(m.janela && m.janela.dias) || 1);
      var pe = '<div class="hx-corpo">' +
        '<div class="hx-eixo" data-hx="eixo"><div class="hx-eixo-in">' + this.lxEixo(lx, pro) + '</div></div>' +
        '<div class="hx-plot' + (g.doGantt ? '' : ' rola') + '" data-hx="plot" aria-hidden="true"><div class="hx-plot-in" style="width:' + f1(g.W) + 'px">' +
        this.lxPlot(lx, pro) + '</div></div></div>';
      var corpo = '<div class="hx-regua">' + esc(m.resumo || "") +
        /* ⚠ AS DUAS PARCELAS DA CONFIANÇA, SEPARADAS: a do plano vem dos NOMES
           (não viu o cronograma) e a cobertura de pontos vem das datas. Só a
           do plano, ao lado de um gráfico furado, sairia "alta". */
        '<span class="hx-f"><b>confiança ' + esc(nBR(num0(m.confianca) * 100, 0)) + '% (' + esc(m.nivel || "") + ')</b> = ' +
        esc(nBR(num0(m.confiancaDoPlano) * 100, 0)) + '% do plano (lido dos NOMES) × ' + esc(nBR(num0(m.coberturaPontos) * 100, 0)) +
        '% de cobertura (' + num0(m.pontosComData) + ' de ' + num0(m.pontosDoPlano) + ' pontos têm data no cronograma)</span>' +
        // ⚠ o `rotulo` do motor não termina em ponto: sem o separador ele emenda na frase seguinte
        '<span class="hx-f">' + esc(m.rotulo || "") + ' · Eixo “' + esc(m.palavra || "") + '” (' + esc(m.eixo || "") + '). ' +
        'Ponto que falta é LACUNA declarada — a linha se interrompe, nada é interpolado.</span>';
      if (arr(m.servicos).length > this.LX_MAXLIN) {
        corpo += '<span class="hx-f">Desenhando as ' + this.LX_MAXLIN + ' primeiras linhas de ' + arr(m.servicos).length + ' serviços que repetem.</span>';
      }
      corpo += '</div>';
      var leg = '<div class="hx-leg">';
      arr(m.servicos).slice(0, this.LX_MAXLIN).forEach(function (S, i) {
        leg += '<span title="' + esc(S.nome + " — " + (S.ritmoTexto || "")) + '"><i class="hx-am" style="background:' + self.LX_CORES[i % self.LX_CORES.length] +
          '"></i>' + esc(corta(S.nome, 30)) + '</span>';
      });
      leg += '</div>';
      var avs = arr(m.avisos);
      if (avs.length) {
        leg += '<div class="cx-aviso"><b>Sobre esta leitura:</b><ul class="cx-lista">';
        avs.slice(0, 4).forEach(function (a) { leg += '<li>' + esc((a && a.msg) || "") + '</li>'; });
        if (avs.length > 4) leg += '<li>e mais ' + (avs.length - 4) + ' aviso(s)</li>';
        leg += '</ul></div>';
      }
      return '<div class="hx" data-hx-wrap="lob" style="--gx-lw:' + f1(lw) + 'px">' + cabHtml + pe + '</div>' + corpo + leg;
    },

    /* ==================================================================
       MACROFLUXO (.fx) — a rede desenhada como REDE (js/fluxograma.js)
       ==================================================================
       O Gantt responde "quando"; esta figura responde "o que segura o quê".
       ⚠ NADA DE PRAZO SE CALCULA AQUI. Camada, posição e o caminho de cada
       seta vêm prontos do motor (`Fluxograma.montar`), que por sua vez COPIA
       duração, datas, folga e caminho crítico do `Cronograma.estimar`. Duas
       réguas para a mesma grandeza é o defeito que esta base já pagou caro
       (o engenheiro via 50% e o cliente via 80% do mesmo avanço).
       ⚠ E ELE NASCE FECHADO, como o histograma e a linha de balanço: aberto,
       a figura tem centenas de px de altura e empurraria a tabela para longe.
       Fechado custa uma linha — que JÁ DIZ o estado da rede (quantas caixas,
       quantos elos, e o recado de "rede em corrente" quando ninguém declarou
       dependência), porque rótulo mudo obriga a abrir para descobrir que não
       há nada. */
    FX_MAXNOS: 60,
    fxDados: function (d, est) {
      var r = d && d.r, out = { estado: "sem-motor", motivo: "", m: null };
      var F = MOD("Fluxograma", "./fluxograma.js");
      if (!F || typeof F.montar !== "function") {
        out.motivo = "O motor do macrofluxo (js/fluxograma.js) não está carregado nesta instalação. Atualize o OrçaPRO.";
        return out;
      }
      if (!r || !arr(r.etapas).length) { out.estado = "sem-dados"; out.motivo = "Sem etapas no cronograma — não há rede para desenhar."; return out; }
      /* ⚠ O NÍVEL SEGUE O DETALHE DA ABA, MAS SÓ QUANDO HÁ SUBETAPA DE VERDADE.
         Medido na OBRA TESTE (6 etapas, nenhuma com subetapa): no detalhe
         "Subetapa" o motor caía no nível folha, cada etapa entrava como folha
         dela mesma e os 5 elos saíam marcados como DERIVADOS — com o aviso "5
         seta(s) deste desenho não foram declaradas por ninguém", que ali é
         falso: as setas são exatamente os elos que a pessoa escreveu. */
      var temF = false;
      try { temF = ehArr(r.atividades) && this.temFolhas(r); } catch (eF) { temF = false; }
      var nivel = (est && est.detalhe && est.detalhe !== "etapa" && temF) ? "folha" : "etapa";
      var m = null;
      try { m = F.montar(r, { nivel: nivel }); } catch (ex) {
        out.estado = "falhou";
        out.motivo = "Não consegui montar o macrofluxo: " + String((ex && ex.message) || ex) + ". O cronograma acima continua valendo.";
        return out;
      }
      if (!m || m.ok !== true) { out.estado = "recusou"; out.motivo = (m && m.motivo) || "O motor do macrofluxo recusou o desenho e não disse por quê."; return out; }
      out.estado = "ok"; out.m = m; out.nivel = nivel;
      return out;
    },
    /* O DESENHO. Percorre a lista do motor e nada mais: cada caixa já vem com
       x/y/w/h e cada aresta com o caminho resolvido em `pontos`. */
    fxSvg: function (m) {
      var self = this, W = Math.max(1, num0(m.largura)), A = Math.max(1, num0(m.altura));
      var s = '<svg class="fx-svg" width="' + f1(W) + '" height="' + f1(A) + '" viewBox="0 0 ' + f1(W) + ' ' + f1(A) +
        '" style="display:block;background:#fff;font-family:inherit">' +
        '<defs><marker id="fx-seta" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">' +
        '<path d="M0,0 L6,3 L0,6 z" fill="' + CINZA + '"/></marker>' +
        '<marker id="fx-seta-c" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">' +
        '<path d="M0,0 L6,3 L0,6 z" fill="' + CRIT + '"/></marker></defs>';
      arr(m.arestas).forEach(function (a) {
        var pts = arr(a.pontos).map(function (p) { return f1(p.x) + "," + f1(p.y); }).join(" ");
        if (!pts) return;
        var cor = a.cicloDep ? "#b45309" : (a.critico ? CRIT : CINZA);
        /* ⚠ TRACEJADA = ARESTA DERIVADA (o elo é de ETAPA, e o motor o desenhou
           entre as folhas das pontas). Quem lê precisa saber que não foi uma
           pessoa que desenhou aquela seta. */
        s += '<polyline points="' + pts + '" fill="none" stroke="' + cor + '" stroke-width="' + (a.critico ? 2 : 1.3) + '"' +
          (a.derivada || a.cicloDep ? ' stroke-dasharray="5,3"' : '') +
          ' marker-end="url(#' + (a.critico ? 'fx-seta-c' : 'fx-seta') + ')"><title>' +
          esc((a.cicloDep ? "ELO QUE FECHA O LAÇO (ignorado no cálculo) — " : "") + (a.derivada ? "elo derivado do elo entre as etapas — " : "") +
            "tipo " + String(a.tipo || "TI") + (a.lag == null ? "" : ", lag " + nBR(num0(a.lag), 0) + " dia(s) úteis")) + '</title></polyline>';
      });
      arr(m.nos).forEach(function (n) {
        var x = num0(n.x), y = num0(n.y), w = num0(n.w), h = num0(n.h);
        var corBorda = n.critico ? CRIT : (n.cat && n.cat.cor ? n.cat.cor : "#94a3b8");
        var dica = (n.numero ? n.numero + " " : "") + (n.nome || "") +
          " — " + num0(n.duracao) + " dia(s) úteis" +
          (n.dataInicio ? ", " + dma(n.dataInicio) + " → " + dma(n.dataFim) : "") +
          (n.critico ? " · CAMINHO CRÍTICO (sem folga)" : " · folga " + nBR(num0(n.folga), 0) + " dia(s)") +
          (n.predsExplicito === false ? " · sem “Depende de” declarado: segue a sequência automática" : "") +
          (n.cicloDep ? " · ⚠ entra numa dependência circular" : "");
        s += '<g><title>' + esc(dica) + '</title>' +
          '<rect x="' + f1(x) + '" y="' + f1(y) + '" width="' + f1(w) + '" height="' + f1(h) + '" rx="6" fill="#fff" stroke="' + corBorda +
          '" stroke-width="' + (n.critico ? 2.2 : 1.2) + '"' + (n.opcional ? ' stroke-dasharray="4,3"' : '') + '/>' +
          '<rect x="' + f1(x) + '" y="' + f1(y) + '" width="5" height="' + f1(h) + '" rx="2" fill="' + (n.cat && n.cat.cor ? n.cat.cor : "#cbd5e1") + '"/>' +
          '<text x="' + f1(x + 12) + '" y="' + f1(y + 19) + '" font-size="11" font-weight="700" fill="#0f172a">' +
          esc(corta((n.numero ? n.numero + " " : "") + (n.nome || ""), 26)) + '</text>' +
          '<text x="' + f1(x + 12) + '" y="' + f1(y + 35) + '" font-size="10" fill="#475569">' +
          esc(num0(n.duracao) + " dia(s) úteis" + (n.marco ? " · marco" : "")) + '</text>' +
          '<text x="' + f1(x + 12) + '" y="' + f1(y + 50) + '" font-size="9.5" fill="' + (n.critico ? CRIT : "#64748b") + '">' +
          esc(n.dataInicio ? dma(n.dataInicio) + " → " + dma(n.dataFim) : "sem data") + (n.critico ? esc(" · crítico") : "") + '</text></g>';
      });
      return s + '</svg>';
    },
    /* O QUADRO do macrofluxo (rola no próprio quadro) e, com a fiação da F7,
       a altura escolhida + a alça.
       ⚠ SEM `pro.alcas` o quadro é o da 1.2.77 (altura natural, sem `style`).
       O teto de 60% da janela só entra JUNTO com a alça: uma rede de 4.000 px
       empurra a tabela para longe, mas prender a altura sem dar a pega para
       esticar de volta seria trava sem porta.
       ⚠ `natural` soma a calha da barra de rolagem horizontal (GX_BARRA): a
       rede é quase sempre mais larga que a tela, e sem a folga a última fileira
       de caixas nasceria cortada pela barra. */
    fxQuadro: function (m, pro) {
      var inner = '<div class="fx-in" style="width:' + f1(m.largura) + 'px">' + this.fxSvg(m) + '</div>';
      var P = (pro && pro.alcas === true) ? PN() : null;
      if (!P || typeof P.alcaHtml !== "function") return '<div class="fx-plot">' + inner + '</div>';
      var natural = Math.max(1, Math.round(num0(m.altura))) + this.GX_BARRA;
      var H = (pro.fxPref != null) ? P.limitar("fxAltura", pro.fxPref, { natural: natural }) : null;
      if (H == null && pro.janelaAltura > 0) {
        var teto = Math.round(0.6 * pro.janelaAltura);
        if (natural > teto) H = Math.max(P.FX[0], teto);
      }
      return '<div class="fx-plot"' + (H != null ? ' style="height:' + Math.round(H) + 'px"' : '') + '>' + inner + '</div>' +
        P.alcaHtml("fxAltura", "horizontal", "Altura do macrofluxo", H != null ? H : natural, P.FX[0], Math.max(P.FX[0], Math.min(P.FX[1], natural)));
    },
    fluxoPainel: function (d, est, pro) {
      var e = (est && est.hist) || {}, lw = this.ganttProColW(pro);
      var aberto = e.fluxo === true;
      var fx = aberto ? this.fxDados(d, est) : null;
      /* fechado, a linha diz o ESTADO da rede sem montar o layout: a contagem
         sai do próprio cronograma que já está na tela (nada é recalculado) */
      var r = d && d.r, nEt = arr(r && r.etapas).length;
      var nElos = 0, semRede = 0;
      arr(r && r.etapas).forEach(function (et) {
        nElos += arr(et.preds).length;
        if (et.predsExplicito === false) semRede++;
      });
      var resumo = aberto && fx && fx.estado === "ok"
        ? (num0(fx.m.contagem.nos) + " caixas · " + num0(fx.m.contagem.arestas) + " elos · " + num0(fx.m.contagem.camadas) + " camadas")
        : (nEt + " etapas · " + nElos + " elo(s) declarado(s)" + (semRede ? " · " + semRede + " seguem a sequência automática (sem “Depende de”)" : ""));
      var cab = '<button type="button" class="hx-tog" data-acao="crono-fluxo" data-hx-abrir="' + (aberto ? '0' : '1') + '" aria-expanded="' + (aberto ? 'true' : 'false') +
        '" title="O macrofluxo da obra: a rede de precedência desenhada como rede (caixas e setas), que é onde se discute SEQUÊNCIA. O Gantt responde “quando”; esta figura responde “o que segura o quê” — e mostra o nó por onde passa metade da obra, que no Gantt fica escondido atrás das setas cruzadas.">' +
        (aberto ? '▾' : '▸') + ' Macrofluxo (rede de precedência)</button>';
      var cabHtml = '<div class="hx-cab' + (aberto ? '' : ' so') + '">' + cab + '<span class="muted">' + esc(resumo) + '</span></div>';
      if (!aberto) return '<div class="hx" style="--gx-lw:' + f1(lw) + 'px">' + cabHtml + '</div>';
      if (!fx || fx.estado !== "ok") {
        return '<div class="hx" style="--gx-lw:' + f1(lw) + 'px">' + cabHtml + '</div><div class="cx-aviso">' + esc(fx ? fx.motivo : "") + '</div>';
      }
      var m = fx.m, h = '<div class="hx" style="--gx-lw:' + f1(lw) + 'px">' + cabHtml + '</div>';
      /* ⚠ TEIA ILEGÍVEL SE DECLARA, NÃO SE ENTREGA CALADA: o motor carimba
         `denso` com o motivo medido, e a tela diz qual é a saída (ver no
         detalhe Etapa, que desenha uma caixa por etapa). */
      if (m.denso) {
        h += '<div class="cx-aviso"><b>Esta rede é grande demais para ser lida como figura.</b> ' + esc(String(m.motivoDenso || "")) +
          (fx.nivel === "folha" ? ' Troque o <b>Detalhe</b> para <b>Etapa</b>: o macrofluxo passa a desenhar uma caixa por etapa.' : '') + '</div>';
      }
      h += this.fxQuadro(m, pro);
      /* AS LEITURAS DA REDE — o que a figura mostra em números. O gargalo é o
         nó por onde passa mais de um caminho: é ele que, atrasando, atrasa
         duas frentes de uma vez. */
      var garg = arr(m.gargalos);
      h += '<div class="hx-regua">';
      if (garg.length) {
        h += '<b>Por onde passa mais de um caminho (' + garg.length + '):</b> ' +
          esc(garg.slice(0, 5).map(function (g) { return (g.numero ? g.numero + " " : "") + corta(g.nome || "", 24) + " (" + num0(g.caminhos) + (g.aproximado ? "+" : "") + " caminhos)"; }).join(" · ")) +
          (garg.length > 5 ? " e mais " + (garg.length - 5) : "") + ".";
      }
      arr(m.avisos).forEach(function (a) { h += '<span class="hx-f">' + escM((a && a.msg) || "") + '</span>'; });
      h += '<span class="hx-f">Camada = distância em ELOS até o nó, e não data: uma caixa da coluna 3 pode começar antes de uma da coluna 1 (lag negativo, paralelismo, data fixada). Quem lê tempo lê o Gantt acima. ' +
        'Seta tracejada = elo derivado do elo entre as etapas (não foi desenhado por ninguém). Vermelho = caminho crítico.</span>';
      /* ⚠ DESENHO QUE CONTINUA FORA DO QUADRO SE DECLARA. A rede tem largura
         própria (a de 6 etapas já dá 1.478 px) e o quadro recorta: lido na
         FOTO a 1366, a última caixa saía cortada na borda sem nada dizendo que
         havia mais à direita — a mesma classe do "Ajustar" que prometia caber
         a obra inteira e não cabia. */
      h += '<span class="hx-f">O desenho tem ' + esc(nBR(Math.round(num0(m.largura)), 0)) + ' px de largura: se ele não couber no quadro, role o quadro para o lado — a rede continua à direita.</span>';
      h += '</div>';
      return h;
    },

    /* ------------------------------------------------------------------
       TELA
       ------------------------------------------------------------------ */
    /* ==================================================================
       SAÚDE DO CRONOGRAMA (.cs) — a nota, a fórmula ao lado dela e os três
       achados que mais custam prazo, cada um com a porta até o nó.
       ==================================================================
       ⚠ NOTA 100 NÃO QUER DIZER "CRONOGRAMA BOM". Quer dizer "nada do que
       esta régua mede está quebrado" — ela não mede se a rede foi DECIDIDA
       por alguém. Medido pelo motor nos 55 orçamentos reais: 44 deles têm a
       mediana de 100% dos elos herdados da ordem da planilha e ainda assim
       tiram 90+. É por isso que as `nota.ressalvas[]` e a lista de
       `naoAvaliado[]` saem SEMPRE ao lado do número, e não escondidas atrás
       de um "ver detalhes": número grande sozinho é lido como aprovação.

       ⚠ O TESTE DO CAMINHO CRÍTICO NÃO RODA NO RENDER. Ele custa até 21
       `Cronograma.estimar` inteiros — medido pelo motor: 4.839 ms de 4.854 ms
       num orçamento de 2.400 serviços, 98% do custo. Pago a cada abertura da
       aba, ele travaria a tela por 5 s em quem só queria olhar o Gantt. Sai
       NÃO AVALIADO, com a ressalva ao lado da nota, e a porta é o botão
       [Conferir a fundo].

       ⚠ E "não avaliado" NUNCA vira "passou": `naoAvaliado[]` carrega o
       motivo de cada checagem que não rodou, e ele vai à tela. */
    CS_SEV: { alta: ["#b91c1c", "grave"], media: ["#b45309", "média"], baixa: ["#64748b", "baixa"] },

    /* cor da nota: é a mesma régua do motor (teto 60 com falha grave), e não
       uma segunda escala inventada aqui */
    csCor: function (v) {
      var x = Number(v);
      if (!isFinite(x)) return "#64748b";
      return x >= 85 ? "#15803d" : (x >= 60 ? "#b45309" : "#b91c1c");
    },

    /* O MODELO da saúde, memoizado pela assinatura de conteúdo + `fundo`.
       Estados: sem-motor · recusou · falhou · ok */
    csDados: function (d, est) {
      var r = d && d.r, e = (est && est.saude) || {};
      var out = { estado: "sem-motor", motivo: "", s: null, fundo: !!e.fundo };
      var S = MOD("CronoSaude", "./cronosaude.js");
      if (!S || typeof S.checar !== "function") {
        out.motivo = "O motor da saúde do cronograma (js/cronosaude.js) não está carregado nesta instalação — sem ele não há nota. Atualize o OrçaPRO.";
        return out;
      }
      var chave = assinaR(r) + "|" + (e.fundo ? "F" : "-") + "|" + (d && d.orc ? d.orc.id : "");
      if (_smemo.chave === chave && _smemo.v) return _smemo.v;
      /* ⚠ O REALIZADO SAI DO MESMO PAINEL QUE A ABA JÁ MONTOU (`d.pr.painel`,
         de App._cronoPainelDados). Uma segunda apuração divergiria na data de
         corte — é a memória "conserto que para no segundo consumidor". Sem
         painel, `realizado` fica nulo e a checagem "já devia ter começado"
         sai NÃO AVALIADA com o motivo do motor: nunca "tudo certo". */
      var real = null;
      var nosP = arr(d && d.pr && d.pr.painel && d.pr.painel.nos);
      if (nosP.length) {
        real = {};
        nosP.forEach(function (n) { if (n && n.id && n.realPct != null) real[n.id] = Number(n.realPct); });
      }
      var s = null;
      try {
        s = S.checar(d.orc, r, { realizado: real, hoje: new Date(), criticoTeste: !!e.fundo });
      } catch (ex) {
        out.estado = "falhou";
        out.motivo = "Não consegui medir a saúde do cronograma: " + String((ex && ex.message) || ex) + ". O cronograma acima continua valendo.";
        return out;
      }
      if (!s || s.ok !== true) {
        out.estado = "recusou";
        out.motivo = (s && s.motivo) || "O motor da saúde recusou a medição e não disse por quê.";
        return out;
      }
      out.estado = "ok"; out.s = s;
      _smemo.chave = chave; _smemo.v = out;
      return out;
    },
    // o último modelo desenhado (a fiação lê para achar o nó de um achado)
    csUltimo: function () { return _smemo.v; },

    /* a linha do teste do caminho crítico. ⚠ NUNCA "caminho crítico
       verificado" quando `naoPedido` — é afirmar o que ninguém rodou. E o
       "passou (2 de 2)" sem denominador real também mente: o empurrão vai por
       `restricoes`, que só existe para ETAPA, e no modo executivo as
       subetapas críticas ficam de fora. Por isso `camadaTestada` e
       `criticasNaoTestadas` saem sempre. */
    csCritico: function (tc, fundo) {
      if (!tc || tc.naoPedido === true || !fundo) {
        return '<div class="cs-crit"><b>Teste do caminho crítico: não foi pedido nesta nota.</b> ' +
          'Ele empurra cada tarefa crítica e confere se o fim da obra anda junto — é o que mais pega defeito, e é caro ' +
          '(o motor roda o cronograma inteiro até 21 vezes). Use <b>Conferir a fundo</b> para rodá-lo. ' +
          'Esta nota <b>não</b> diz que o caminho crítico foi verificado.</div>';
      }
      if (!tc.ok) {
        return '<div class="cs-crit"><b>Teste do caminho crítico: não concluído.</b> ' + esc(tc.motivo || "o motor não disse por quê") + '</div>';
      }
      var h = '<div class="cs-crit"><b>Teste do caminho crítico</b> — camada testada: <b>' + esc(String(tc.camadaTestada || "—")) + '</b>. ' +
        'Empurrei ' + num0(tc.testadasCriticas) + ' de ' + num0(tc.criticasTotais) + ' tarefa(s) crítica(s) em ' + num0(tc.empurrao) + ' dia(s)' +
        ' e ' + num0(tc.controles) + ' controle(s) dentro da folga (o lado que torna isto uma prova, e não uma cerimônia). ';
      h += num0(tc.falhas) + ' falha(s) no empurrão e ' + num0(tc.controlesFalhos) + ' no controle.';
      var nt = num0(tc.criticasNaoTestadas);
      /* ⚠ O DENOMINADOR QUE FALTA VAI JUNTO: "passou (2 de 2)" numa obra de 30
         críticas se lê como obra inteira conferida. */
      if (nt) h += ' <b>' + nt + ' tarefa(s) crítica(s) ficaram FORA do teste</b> — a data fixada (restrição) só existe para etapa, e no modo executivo a subetapa crítica não pode ser empurrada.';
      return h + '</div>';
    },

    /* O RESUMO do que a nota NÃO diz — usado no chip (fechado) e no cartão.
       ⚠ POR QUE O CARTÃO NASCE FECHADO. Medido no navegador a 1366×768 em
       12/09/2026, com o cartão aberto: ele ocupava 995 px e empurrava a 1ª
       barra do Gantt para y=1723 — mil pixels abaixo da dobra. Esta aba já
       reprovou uma mudança de 42 px pelo mesmo critério (o comentário da
       faixa da obra, em `cronograma()`), e 995 é vinte e quatro vezes isso.
       ⚠ MAS FECHADO NÃO É CALADO: o chip leva o número e quantos avisos
       existem, e o `title` leva a frase inteira (ressalvas, checagens não
       avaliadas, teste do crítico e o pior achado com os dias). Nota alta
       sozinha se lê como aprovação — é isso que o alarme do chip impede. */
    csPartes: function (s, fundo) {
      var nt = s.nota || {}, p = arr(s.piores && s.piores.lista)[0], partes = [];
      var nR = arr(nt.ressalvas).length, nA = arr(s.naoAvaliado).length;
      if (nR) partes.push(nR + " ressalva(s) sobre o que a nota NÃO diz");
      if (nA) partes.push(nA + " checagem(ns) não avaliada(s)");
      if (!fundo || !s.criticoTeste || s.criticoTeste.naoPedido === true) partes.push("teste do caminho crítico NÃO feito");
      else if (num0(s.criticoTeste.criticasNaoTestadas)) partes.push(num0(s.criticoTeste.criticasNaoTestadas) + " crítica(s) fora do teste");
      /* o pior achado NÃO entra na contagem de avisos: ele é o achado, e
         somá-lo aos avisos daria um número que não bate com a lista de baixo */
      return { avisos: partes, pior: p ? (num0(p.diasCriticos) + " dia(s) em " + String((p.no && p.no.numero) || "") + " " + corta((p.no && p.no.nome) || "", 26)) : "" };
    },

    /* O CHIP DA SAÚDE — a nota e o alarme na MESMA LINHA do prazo.
       ⚠ POR QUE ELE EXISTE (medido no navegador a 1366×768, 12/09/2026, no
       cenário da suíte e2e-cronograma-executivo): fechado, o cartão ainda
       abria um BLOCO PRÓPRIO de 36 px + 6 de folga entre a linha do prazo e a
       linha do detalhe, e isso empurrava a 1ª barra do Gantt para y=781–797
       numa janela de 768 — o assert "a 1ª barra aparece sem rolar" reprovava.
       A linha do prazo tinha 209 px livres à direita (medido: 877 de 1086
       usados), e o chip cabe neles: o número e quantos avisos existem sobem
       para a linha que já existia, e o bloco some. Zero px a mais acima do
       Gantt.
       ⚠ E FECHADO NÃO É CALADO: o `title` leva a frase inteira (ressalvas,
       checagens não avaliadas, teste do crítico e o pior achado com os dias) e
       o número de avisos fica à vista. Nota alta sozinha se lê como aprovação;
       "68/100 · 4 avisos" não.
       ⚠ AS TRÊS AÇÕES (conferir a fundo, sugerir a sequência, replanejar)
       ficam DENTRO do cartão, a um clique daqui — não cabiam na linha (486 px
       contra 209 livres) e um botão solto entre a linha do prazo e o Gantt é o
       ponto morto onde ação nova não é encontrada. O `title` diz o que abre. */
    csChip: function (d, est) {
      var e = (est && est.saude) || {}, cs = this.csDados(d, est), aberto = e.aberto === true;
      var dica, txt, cor = "", n = 0;
      if (cs.estado !== "ok" || !cs.s) {
        txt = "Saúde do cronograma: sem nota";
        dica = String(cs.motivo || "") + " Clique para abrir o cartão.";
      } else {
        var nt = cs.s.nota || {}, pt = this.csPartes(cs.s, cs.fundo);
        n = pt.avisos.length;
        cor = this.csCor(nt.valor);
        txt = "Saúde " + nBR(num0(nt.valor), 0) + "/100 · " + (n ? n + " aviso(s)" : "sem ressalva");
        dica = (n ? pt.avisos.join(" · ") + ". " : "") + (pt.pior ? "Pior achado: " + pt.pior + ". " : "") +
          (aberto ? "Clique para fechar o cartão (aberto ele empurra o Gantt para baixo da dobra)."
            : "Clique para abrir a nota inteira: a fórmula, todas as ressalvas, as checagens que não deram para avaliar, os três achados que mais custam prazo — e as três ações (conferir a fundo, sugerir a sequência de obra, replanejar depois de um atraso).");
      }
      /* ⚠ A TINTA DO CHIP VAI POR TOKEN (14/09/2026). O `csCor` devolve o hex
         do tema claro (é o mesmo da nota dentro do cartão), e cravado aqui o
         #b45309 dava 3,63:1 sobre o fundo do tema escuro — o chip que resume a
         saúde ficava apagado justo no escuro. O token tem o par do escuro
         (--graf-aviso #e8a75c), e o hex fica de reserva. */
      var TINTA = { "#15803d": "var(--verde,#15803d)", "#b45309": "var(--graf-aviso,#b45309)", "#b91c1c": "var(--graf-alerta,#b91c1c)", "#64748b": "var(--texto-fraco,#64748b)" };
      if (cor && own(TINTA, cor)) cor = TINTA[cor];
      return '<button type="button" class="pill cs-chip" data-acao="crono-saude" data-cs-abrir="' + (aberto ? '0' : '1') +
        '" aria-expanded="' + (aberto ? 'true' : 'false') + '" title="' + esc(dica) + '"' +
        (cor ? ' style="border-color:' + cor + ';color:' + cor + '"' : '') + '>' +
        (aberto ? '▾ ' : '▸ ') + esc(txt) + '</button>';
    },

    saudePainel: function (d, est) {
      var self = this, e = (est && est.saude) || {};
      var cs = this.csDados(d, est), s = cs.s;
      var aberto = e.aberto === true;
      var tog = '<button type="button" class="cs-tog" data-acao="crono-saude" data-cs-abrir="' + (aberto ? '0' : '1') + '" aria-expanded="' + (aberto ? 'true' : 'false') + '" title="' +
        esc(aberto ? "Fechar — o cartão inteiro ocupa quase uma tela e empurra o Gantt para baixo da dobra."
          : "Abrir a nota inteira: a fórmula, todas as ressalvas, as checagens que não deram para avaliar e os três achados que mais custam prazo, cada um com a porta até o nó.") +
        '">' + (aberto ? '▾' : '▸') + ' Saúde do cronograma</button>';
      var acoes = '<div class="cs-acoes">' +
        (e.calculando
          ? '<button class="btn sm" disabled>Conferindo a fundo…</button>'
          : '<button class="btn sm' + (e.fundo ? '' : ' primary') + '" data-acao="crono-saude-fundo" data-fundo="' + (e.fundo ? '0' : '1') + '" title="' +
            (e.fundo
              ? 'Refaz a nota SEM o teste do caminho crítico (mais rápido).'
              : 'Empurra cada tarefa crítica e confere se o fim da obra anda junto — e empurra tarefas dentro da folga para conferir que NÃO andam. O motor roda o cronograma inteiro até 21 vezes: em orçamento grande demora alguns segundos.') +
            '">' + (e.fundo ? 'Nota rápida (sem o teste do crítico)' : 'Conferir a fundo') + '</button>') +
        '<button class="btn sm" data-acao="crono-seq" title="Compara a rede de hoje com a matriz de precedência de obra (fundação antes de estrutura, revestimento antes de pintura…) e propõe as ligações que faltam — com o ganho em dias MEDIDO pelo motor. Nada é gravado sem você marcar e aplicar.">Sugerir a sequência de obra</button>' +
        '<button class="btn sm" data-acao="crono-replan" title="Depois de um atraso: mostra as opções de recuperação com o efeito MEDIDO em dias (o motor roda o cronograma com e sem cada uma) e o que entra no caminho crítico depois.">Replanejar depois de um atraso</button>' +
        '</div>';
      /* ⚠ FECHADO NÃO DESENHA BLOCO NENHUM — quem fica na tela é o CHIP, na
         linha do prazo (ver csChip). Roteiro do defeito: a linha fechada,
         mesmo sem a moldura do `.card`, custava 36 px + 6 de folga e punha a
         1ª barra do Gantt em y=781–797 numa janela de 768 (medido a 1366×768
         no cenário da suíte e2e-cronograma-executivo, 12/09/2026). Devolver ""
         aqui é o que devolve os 42 px. */
      if (!aberto) return "";
      if (cs.estado !== "ok") {
        return '<div class="card cx-card cs"><div class="cs-cab"><div class="cs-nota cs-sem"><span class="cs-rot">Saúde do cronograma</span></div>' +
          '<div class="cs-formula">' + tog + esc(cs.motivo) + '</div>' + acoes + '</div></div>';
      }
      var nt = s.nota || {}, cor = this.csCor(nt.valor);
      var h = '<div class="card cx-card cs"><div class="cs-cab">';
      h += '<div class="cs-nota" style="border-color:' + cor + '"><span class="cs-num" style="color:' + cor + '">' + esc(nBR(num0(nt.valor), 0)) + '</span>' +
        '<span class="cs-den">/100</span><span class="cs-rot">Saúde do cronograma</span>' +
        '<span class="cs-sub">' + num0(nt.avaliadas) + ' de ' + num0(nt.pontuaveis) + ' checagens avaliadas · ' + num0(nt.reprovadas) + ' reprovada(s)</span></div>';
      /* A FÓRMULA AO LADO DA NOTA, com o texto do motor — nunca reescrita: é
         ela que impede a pessoa de ler 87 como "87% pronto".
         ⚠ Ela fica num <details>, e as RESSALVAS não: a fórmula é método (lê-se
         uma vez); a ressalva é a advertência que tem de ser lida junto com o
         número, toda vez. Esconder a advertência é o "erro educado". */
      h += '<div class="cs-formula">' + tog +
        /* ⚠ "(fonte: CronoSaude.FORMULA_NOTA)" era nome de constante do motor
           na cara do cliente — a mesma classe do "atraso.dias". O que importa
           dizer é que a frase abaixo NÃO foi reescrita pela tela: ela é a que
           o motor publica. */
        '<details class="cs-det"><summary>Como esta nota é feita <span class="muted">(a fórmula é a que o motor publica, palavra por palavra)</span></summary>' +
        '<div class="cs-f">' + escM(nt.formula || "") + '</div></details>';
      if (nt.teto) h += '<div class="cs-teto">⚠ nota limitada a ' + esc(nBR(num0(nt.teto.valor), 0)) + ' por falha grave: ' + esc(String(nt.teto.por)) + '</div>';
      var res = arr(nt.ressalvas);
      if (res.length) {
        h += '<div class="cs-res"><b>O que esta nota NÃO diz:</b><ul class="cx-lista">';
        res.forEach(function (t) { h += '<li>' + esc(String(t)) + '</li>'; });
        h += '</ul></div>';
      }
      var na = arr(s.naoAvaliado);
      if (na.length) {
        /* ⚠ não avaliada ≠ passou. O AVISO e os NOMES ficam à vista; o motivo
           de cada uma (três linhas do motor, cada) fica a um clique. */
        h += '<div class="cs-na"><b>' + na.length + ' checagem(ns) não avaliada(s)</b> — não avaliada não quer dizer que passou: ' +
          esc(na.map(function (x) { return String(x.nome || x.check); }).join(", ")) + '.' +
          '<details class="cs-det"><summary>por que cada uma não deu para avaliar</summary><ul class="cx-lista">';
        na.forEach(function (x) { h += '<li>' + esc(String(x.nome || x.check)) + ': ' + esc(String(x.motivo || "sem motivo declarado")) + '</li>'; });
        h += '</ul></details></div>';
      }
      h += this.csCritico(s.criticoTeste, cs.fundo);
      h += '</div>' + acoes + '</div>';
      // ---- os três que mais custam prazo ----
      var pio = s.piores || {}, lista = arr(pio.lista);
      h += '<div class="cs-piores"><h5>Os ' + (lista.length || 3) + ' problemas que mais custam prazo</h5>';
      h += '<p class="cs-criterio">' + esc(String(pio.criterio || "")) + '</p>';
      if (!lista.length) {
        h += '<p class="muted" style="font-size:12.5px;margin:0">Nenhum achado tocou o caminho crítico nesta medição. ' +
          (arr(s.achados).length ? 'Há ' + arr(s.achados).length + ' achado(s) fora do caminho crítico.' : 'A régua não encontrou achado nenhum.') + '</p>';
      } else {
        h += '<ol class="cs-lista">';
        lista.forEach(function (x) {
          var no = x.no || {}, sev = self.CS_SEV[x.severidade] || self.CS_SEV.baixa;
          var achado = null;
          arr(s.achados).forEach(function (a) { if (a.id === x.achadoId) achado = a; });
          /* ⚠ O NÚMERO QUE ORDENA A LISTA VEM NA FRENTE. Na 1ª foto (12/09/2026,
             1500 px) os dias saíam no FIM de um parágrafo de três linhas com o
             texto do motor — a lista dizia ser "os 3 que mais custam prazo" e o
             custo de cada um só aparecia depois de ler tudo. */
          h += '<li><span class="cs-pill" style="background:' + sev[0] + '18;color:' + sev[0] + '">' + sev[1] + '</span> ' +
            '<b class="cs-dias" title="' + esc(String(pio.criterio || "")) + '">' + num0(x.diasCriticos) + ' d</b>';
          if (no.id) {
            h += '<button class="cs-ir" data-acao="crono-ir-no" data-no="' + esc(String(no.id)) + '" data-etapa="' + esc(String(no.etapaId || no.id)) + '" ' +
              'title="Levar o cronograma até esta linha (expande a etapa e centraliza a barra no Gantt)">' +
              esc(String(no.numero == null ? "" : no.numero)) + ' ' + esc(corta(no.nome, 44)) + ' ↗</button> ';
          }
          /* o texto do motor é longo (até 3 linhas); na lista sai cortado, e o
             inteiro fica no `title` — a lista é para escolher qual abrir */
          var txt = String(x.texto || "");
          h += '<span class="cs-txt" title="' + esc(txt) + '">' + esc(corta(txt, 150)) + '</span>';
          if (achado && achado.acao) h += '<div class="cs-acao">→ ' + esc(String(achado.acao)) + '</div>';
          if (achado && achado.heuristica && achado.porque) h += '<div class="cs-heu" title="' + esc(String(achado.porque)) + '">heurística: ' + esc(corta(String(achado.porque), 90)) + '</div>';
          h += '</li>';
        });
        h += '</ol>';
      }
      var rm = s.resumo || {};
      h += '<p class="muted" style="font-size:11.5px;margin:6px 0 0">Régua sobre ' + num0(rm.nos) + ' nó(s) — ' + num0(rm.etapas) + ' etapa(s), ' + num0(rm.folhas) + ' folha(s), camada <b>' + esc(String(s.camada || "")) + '</b>' +
        (num0(rm.servicosForaDaRegua) ? ' · ' + num0(rm.servicosForaDaRegua) + ' serviço(s) ficam fora da régua de rede por construção (o motor distribui serviço sem predecessora)' : '') +
        ' · ' + arr(s.achados).length + ' achado(s) ao todo.</p></div></div>';
      return h;
    },

    /* ==================================================================
       SEQUÊNCIA CONSTRUTIVA (.sq) — o conteúdo do modal do CronoSeq
       ==================================================================
       ⚠ A REGRA QUE NÃO PODE CAIR: a ligação que, SOZINHA, fecha laço
       (`sozinha.fechaLaco === true`) não publica ganho próprio e não nasce
       marcada — ou arrasta as companheiras de `dependeDe`. Medido pelo motor:
       65 de 174 ligações fechavam laço aplicadas sozinhas, em 27 de 55
       orçamentos. Sem isto, a pessoa desmarca a op 1, a op 5 segue marcada,
       é aplicada e o produto a recusa com "cria dependência circular" — uma
       trava sem porta, que é o que faz procurar saída errada.

       ⚠ E A ECONOMIA CARIMBADA `soValeComTodas` SÓ APARECE COM TODAS
       MARCADAS. Ela foi medida com as N ligações escritas de uma vez; marcar
       metade não entrega metade dos dias, e o próprio motor manda o `escopo`
       escrito para a tela copiar. */
    sqConf: function (g) {
      /* as DUAS metades, separadas de propósito: `conf` é peso editorial
         escrito à mão (não é estatística) e só a `pureza` é medida */
      var t = "confiança " + nBR(num0(g.conf) * 100, 0) + "% (peso editorial da matriz — não é estatística)";
      if (g.purezaMedida) t += " × pureza " + nBR(num0(g.pureza) * 100, 0) + "% (medida: quanto do valor da etapa é mesmo desta categoria)";
      else t += " · pureza não medida nesta etapa";
      return t;
    },
    /* O "1-5" POR EXTENSO, para o `title` da linha: a gramática é do produto
       (a coluna "Depende de"), mas quem lê a caixa pela primeira vez não a
       conhece. Montado dos campos NUMÉRICOS do motor (`preds` × `predsNum`
       casam por posição — js/cronoseq.js), nunca de um texto reescrito. */
    sqPredPorExtenso: function (g) {
      var preds = arr(g.preds), nums = arr(g.predsNum), lags = g.lags || {}, tipos = g.tipos || {}, out = [], i;
      for (i = 0; i < preds.length; i++) {
        var id = preds[i], n = nums[i] == null ? "?" : String(nums[i]);
        var l = own(lags, id) ? num0(lags[id]) : null;
        var ii = own(tipos, id) && String(tipos[id]).toUpperCase() === "II";
        if (ii) out.push(l ? "começa " + nBR(Math.abs(l), 0) + " dia(s) úteis depois de " + n + " COMEÇAR" : "começa junto com " + n);
        else if (l == null) out.push("começa quando " + n + " terminar");
        else if (l < 0) out.push("começa " + nBR(-l, 0) + " dia(s) úteis ANTES de " + n + " acabar");
        else if (l === 0) out.push("começa quando " + n + " acabar, sem a sobreposição automática do paralelismo");
        else out.push("começa " + nBR(l, 0) + " dia(s) úteis DEPOIS de " + n + " acabar");
      }
      return out.length ? out.join(" · ") : "sem predecessora: começa no início da obra";
    },
    sqGanho: function (g) {
      var s = g && g.sozinha;
      if (!s) return '<span class="sq-nd">ganho sozinha: não medido</span>';
      if (s.fechaLaco === true) {
        return '<span class="sq-laco" title="' + escM(s.porqueNaoMedido || "") + '">⚠ sozinha fecha laço — sem ganho próprio</span>';
      }
      if (!s.medido) return '<span class="sq-nd" title="' + escM(s.porqueNaoMedido || "") + '">ganho sozinha: não medido</span>';
      var dd = num0(s.dias);
      return '<span class="sq-dias' + (dd > 0 ? ' bom' : (dd < 0 ? ' ruim' : '')) + '" title="Medido pelo motor: o cronograma foi calculado com e sem ESTA ligação sozinha.">' +
        (dd > 0 ? '−' + nBR(dd, 0) + ' dia(s)' : (dd < 0 ? '+' + nBR(-dd, 0) + ' dia(s)' : 'sem mudança de prazo')) + '</span>';
    },
    seqHtml: function (sug, marc, opts) {
      opts = opts || {};
      var self = this;
      if (!sug || sug.ok !== true) {
        return '<p style="font-size:13px">' + esc(String((sug && sug.erro) || "Não consegui montar as sugestões de sequência.")) + '</p>';
      }
      marc = marc || {};
      var ligs = arr(sug.ligacoes), h = "";
      h += '<p class="sq-carimbo"><b>HEURÍSTICA — confira antes de aplicar.</b> Estas ligações saem de uma matriz de precedência de obra escrita à mão ' +
        '(fundação antes de estrutura, revestimento antes de pintura). Ela não conhece a sua obra: é palpite de engenharia, não regra do sistema.</p>';
      // ---- a economia do CONJUNTO ----
      var ec = sug.economia || {};
      var todas = ligs.length > 0 && ligs.every(function (g, i) { return marc[i] === true; });
      h += '<div class="sq-eco">';
      if (!ec.medido) {
        h += '<b>Economia do conjunto: não medida.</b> ' + escM(ec.porque || "");
      } else if (!todas) {
        /* ⚠ o número existe, mas NÃO pode ser mostrado como ganho do que está
           marcado: ele foi medido com TODAS. Dizer o escopo é obrigação. */
        h += '<b>A economia medida vale só para o conjunto inteiro.</b> O motor mediu ' + escM(ec.escopo || "") +
          ' — marcar parte da lista não entrega parte dos dias, e por isso o número só aparece com <b>todas</b> marcadas.';
      } else {
        var dd = num0(ec.dias);
        h += '<b>Com as ' + ligs.length + ' ligações aplicadas JUNTAS: ' +
          (ec.sentido === "encurta" ? 'a obra encurta ' + nBR(dd, 0) + ' dia(s)'
            : (ec.sentido === "alonga" ? 'a obra ALONGA ' + nBR(-dd, 0) + ' dia(s)' : 'o prazo não muda')) + '.</b> ' +
          num0(ec.diasAntes) + ' → ' + num0(ec.diasDepois) + ' dias úteis. ' + escM(ec.porque || "") +
          ' <span class="muted">(' + escM(ec.escopo || "") + ')</span>';
      }
      h += '</div>';
      arr(sug.avisos).forEach(function (a) { h += '<div class="cx-aviso">' + escM(a) + '</div>'; });
      if (!ligs.length) return h + '<p style="font-size:13px">Nenhuma ligação a propor.</p>';
      h += '<div class="sq-lista">';
      ligs.forEach(function (g, i) {
        var laco = !!(g.sozinha && g.sozinha.fechaLaco === true);
        var dep = arr(g.dependeDe);
        var mk = marc[i] === true;
        var num = String(g.alvoNum == null ? "" : g.alvoNum);
        h += '<label class="sq-item' + (laco ? ' laco' : '') + '">' +
          '<input type="checkbox" data-sq-idx="' + i + '"' + (mk ? ' checked' : '') + '>' +
          '<span class="sq-corpo">';
        /* ⚠ O PREDECESSOR SAI COM O LAG, NA MESMA GRAMÁTICA DO RODAPÉ DA ABA
           ("1-5" = começa 5 dias úteis antes de 1 acabar; "3+0" = sem a
           sobreposição do paralelismo). Roteiro do defeito (medido na OBRA
           TESTE, 12/09/2026): esta caixa — a ÚNICA tela em que a pessoa decide
           — imprimia `predsNum` puro e dizia "2 Fundações passa a depender de
           1", enquanto a tela SEGUINTE (o diff do IAEdit) mostrava o que
           realmente seria gravado: "1-5". O mesmo em 4 de 5 ligações. O `-5` é
           exatamente o que produz o "−4 dia(s)" anunciado ao lado; escondê-lo
           é esconder a mudança. `g.token` é o motor quem escreve (CronoSeq),
           com o MESMO `token()` que o `Cronograma.parsePreds` lê de volta. */
        var predTxt = String(g.token || "") || (arr(g.predsNum).join(", ") || "—");
        if (predTxt === "0") predTxt = "nada (começa no início da obra)";
        h += '<span class="sq-alvo"><b>' + esc(num) + ' ' + esc(corta(g.alvoNome, 46)) + '</b>' +
          ' <span class="muted" title="' + esc(self.sqPredPorExtenso(g)) + '">passa a depender de ' + esc(predTxt) +
          (String(g.tokenHoje || "") && String(g.tokenHoje) !== String(g.token) ? ' <span class="sq-hoje">(hoje: ' + esc(String(g.tokenHoje)) + ')</span>' : '') + '</span>' +
          ' <span class="sq-cat">' + esc(String(g.catNome || g.cat || "")) + '</span>' +
          ' <span class="sq-niv">' + esc(g.nivel === "folha" ? "subetapa" : "etapa") + '</span></span>';
        // o motivo de OBRA por extenso, como o motor escreveu (já vem com o carimbo da heurística)
        h += '<span class="sq-porque">' + escM(g.motivo || (g.op && g.op.motivo) || "") + '</span>';
        h += '<span class="sq-linha">' + self.sqGanho(g) + ' <span class="sq-conf">' + esc(self.sqConf(g)) + '</span></span>';
        /* ⚠ A COMPANHEIRA VAI ESCRITA NA CAIXA. Sem isto, a pessoa vê "fecha
           laço" e não sabe o que fazer — trava sem porta. Com isto, marcar
           esta caixa marca as companheiras junto (o `dependeDe` do IAEdit). */
        if (dep.length) {
          var nomes = [];
          dep.forEach(function (p) { var o = ligs[p]; if (o) nomes.push(String(o.alvoNum)); });
          h += '<span class="sq-dep">precisa das ligações ' + esc(nomes.join(", ")) + ' aplicadas antes — marcar esta marca aquelas junto</span>';
        }
        if (laco) h += '<span class="sq-aviso">' + escM(g.sozinha.porqueNaoMedido || "") + '</span>';
        arr(g.espera).forEach(function (x) {
          if (x && x.msg) h += '<span class="sq-espera">' + escM(x.msg) + '</span>';
        });
        h += '</span></label>';
      });
      h += '</div>';
      // o que a matriz NÃO soube decidir
      var pend = arr(sug.pendentes);
      if (pend.length) {
        h += '<details class="sq-mais"><summary>' + pend.length + ' nó(s) que a matriz não decide</summary><ul class="cx-lista">';
        pend.slice(0, 12).forEach(function (p) {
          h += '<li>' + esc(String(p.num || p.alvoNum || "")) + ' ' + esc(corta(p.nome || p.alvoNome, 40)) + ' — ' + escM(p.porque || p.motivo || "sem motivo declarado") + '</li>';
        });
        if (pend.length > 12) h += '<li>e mais ' + (pend.length - 12) + '</li>';
        h += '</ul></details>';
      }
      var par = arr(sug.paralelismos);
      if (par.length && opts.comParalelos !== false) {
        h += '<details class="sq-mais"><summary>' + par.length + ' frente(s) hoje em fila que poderiam andar juntas</summary><ul class="cx-lista">';
        par.slice(0, 10).forEach(function (p) {
          /* ⚠ "fora-da-matriz" NÃO diz que as duas podem andar juntas — diz
             que a matriz não conhece a categoria. Por isso sai sem dia. */
          h += '<li><b>' + esc(String(p.aNum)) + ' × ' + esc(String(p.bNum)) + '</b> ' + esc(corta(p.bNome, 34)) + ' — ' + escM(p.porque || "") +
            (p.medido && p.dias != null ? ' <b>(' + nBR(num0(p.dias), 0) + ' d medidos)</b>' : ' <span class="muted">(sem dia medido' + (p.porqueNaoMedido ? ': ' + escM(p.porqueNaoMedido) : '') + ')</span>') + '</li>';
        });
        if (par.length > 10) h += '<li>e mais ' + (par.length - 10) + '</li>';
        h += '</ul></details>';
      }
      return h;
    },

    /* ==================================================================
       NARRATIVA EXECUTIVA (CronoIA.narrativa) — no topo do previsto × real
       ==================================================================
       ⚠ Ela é a leitura EM PORTUGUÊS dos números que já estão na tela, e o
       motor confere na saída que nenhum número do texto nasceu dentro dele.
       O que ele NÃO conseguiu dizer sai em `naoDaParaDizer[]` — e isso vai à
       tela: parágrafo que cala o que faltou é o "erro educado" que se lê como
       normalidade. */
    /* ⚠ A NARRATIVA SAI DO MESMO `painel` QUE OS KPIs DE BAIXO. Chamada aqui
       (e não numa segunda montagem) porque duas apurações divergiriam na data
       de corte — e o parágrafo em português diria um número e a tabela ao lado
       diria outro, que é o pior defeito possível numa tela de acompanhamento.
       Sem o motor: devolve null e o parágrafo simplesmente não existe (o
       painel continua). */
    nrDados: function (painel) {
      if (!painel) return null;
      var I = MOD("CronoIA", "./cronoia.js");
      if (!I || typeof I.narrativa !== "function") return null;
      try { return I.narrativa(painel, {}); } catch (e) {
        return { ok: false, erro: "não consegui escrever a leitura executiva: " + String((e && e.message) || e) + ". Os números abaixo continuam valendo." };
      }
    },
    /* ⚠ A DATA DE ONDE ESTE TEXTO CONTA VAI CARIMBADA. Roteiro do defeito
       (medido na OBRA TESTE em 12/09/2026): esta leitura dizia "o cronograma
       do orçamento termina em 15/05/2028" e a sub-aba Cronograma, dois cliques
       ao lado, dizia 31/07/2028 — 2,5 meses de diferença, as duas chamando a
       mesma coisa de "cronograma do orçamento". A conta não está errada: o
       painel REPLANEJA a partir do início da OBRA (`painel.ancora`, 29/06/2026)
       e a aba parte do início gravado no orçamento (14/09/2026). Errado estava
       o rótulo — e é o rótulo que o cliente lê. Sem a âncora do painel, não se
       escreve nada (carimbo inventado seria pior que carimbo nenhum). */
    nrBase: function (painel, r) {
      var a = painel && painel.ancora;
      if (!a || !a.data) return "";
      var fonte = a.fonte === "obra" ? "do início da obra" : (a.fonte === "base" ? "do início congelado na linha de base" : "do início do plano/orçamento");
      var t = "as datas desta leitura saem do cronograma recalculado a partir " + fonte + " (" + dmaS(a.data) + ")";
      var ini = r && r.dataInicio ? dma(r.dataInicio) : "";
      if (ini && ini !== dmaS(a.data)) t += " — a sub-aba Cronograma parte de " + ini + " (o início gravado no orçamento) e por isso termina em outra data";
      return t;
    },
    /* ⚠ A LEITURA VEM ACIMA DOS NÚMEROS; AS RESSALVAS, ABAIXO. E isso é
     * medição, não gosto (12/09/2026).
     *
     * A leitura em português dos MESMOS números lida DEPOIS deles vira
     * repetição — por isso o texto fica em cima. Mas o bloco inteiro (texto +
     * "o que não deu para dizer" + avisos) empurrou os três números da régua
     * para y 742–893 numa janela de 768: `tools/e2e-planejamento-obra.js`
     * reprovou "os três números aparecem sem rolar" (1 de 102), verde no
     * master e vermelha aqui — regressão minha, medida alternando as duas
     * árvores na mesma janela.
     *
     * Os três números SÃO a resposta de "quanto da obra está feito". Uma
     * leitura executiva que joga a resposta para fora da tela deixa de ser
     * leitura. As ressalvas, por outro lado, qualificam os números — elas se
     * leem melhor logo DEPOIS deles, que é para onde foram (narrativaRessalvas).
     * ⚠ Não junte os dois de volta sem medir a altura de novo. */
    narrativaHtml: function (nar, painel, r) {
      if (!nar) return "";
      if (nar.ok !== true) {
        return '<div class="nr nr-sem"><b>Leitura executiva indisponível.</b> ' + esc(String(nar.erro || "o motor não disse por quê")) + '</div>';
      }
      var base = this.nrBase(painel, r);
      var h = '<div class="nr"><div class="nr-cab">Leitura executiva <span class="muted">— escrita a partir de ' + esc(arr(nar.fontes).join(", ") || "CronoPlan.painel") + ', sem número novo</span></div>';
      h += '<p class="nr-txt">' + esc(String(nar.texto || "")) + '</p>';
      if (base) h += '<p class="nr-falta" style="margin-top:4px">' + esc(base) + '</p>';
      return h + '</div>';
    },
    /* o que a leitura NÃO pôde afirmar, e os avisos — logo abaixo dos números
       que eles qualificam. Sem isto o texto acima promete mais do que o dado
       sustenta, que é o defeito que o js/cronoia.js existe para não cometer. */
    narrativaRessalvas: function (nar) {
      if (!nar || nar.ok !== true) return "";
      var h = "", nd = arr(nar.naoDaParaDizer);
      if (nd.length) {
        h += '<div class="nr nr-ress"><div class="nr-falta"><b>O que a leitura executiva não pôde dizer:</b><ul class="cx-lista">';
        nd.slice(0, 4).forEach(function (x) { h += '<li>' + esc(String(x)) + '</li>'; });
        if (nd.length > 4) h += '<li>e mais ' + (nd.length - 4) + '</li>';
        h += '</ul></div></div>';
      }
      arr(nar.avisos).forEach(function (a) { h += '<div class="cx-aviso">' + esc(String(a)) + '</div>'; });
      return h;
    },

    /* ==================================================================
       REPLANEJAMENTO DEPOIS DE UM ATRASO (CronoIA.replanejar)
       ==================================================================
       ⚠ NUNCA MOSTRAR RECUPERAÇÃO QUE O MOTOR NÃO MEDIU. `inertes[]` e
       `naoMedidos[]` não recuperam prazo nenhum: os primeiros foram medidos e
       não mexeram na data, os segundos nem rodaram (e carregam
       `porqueNaoMedido`, com `dias` nulo). "Recupera 12 dias" que ninguém
       rodou é exatamente o defeito que o js/cronoia.js existe para não
       cometer — e por isso os dois grupos saem em lista separada, sem número.

       ⚠ SOMAR `diasRecuperados` DE DUAS OPÇÕES NÃO DÁ A SOMA (é o erro
       clássico de comprimir duas frentes do mesmo caminho crítico). O
       `combinado` é medido DE NOVO pelo motor, e os dois números vão à tela
       lado a lado, nunca um no lugar do outro. */
    /* Os nós que entraram/saíram do caminho crítico vêm do motor como
       `{id, nome}` — SEM número. ⚠ Roteiro do defeito (achado na FOTO da e2e,
       12/09/2026): a tela tentava `x.num || x.numero || x` e, como nenhum dos
       dois existe, caía no `String(objeto)` e escrevia
       "sai(em): [object Object], [object Object]" para o cliente. Assert de
       "a lista tem N itens" passa nos dois mundos; só a foto lida por gente
       pega isto. Sem nome e sem id, a entrada é DESCARTADA — nome errado
       manda a pessoa conferir a etapa que não mudou. */
    rpNomes: function (lista) {
      var out = [];
      arr(lista).forEach(function (x) {
        if (!x) return;
        var nm = (typeof x === "string") ? x : String(x.nome || "");
        if (!nm && x.id != null) nm = String(x.id);
        if (nm) out.push(corta(nm, 34));
      });
      return out.length ? out.join(", ") : "(o motor não nomeou)";
    },
    /* O RÓTULO DO TIPO em português de obra. ⚠ `duracao` (sem acento) é o
       NOME DO CAMPO do motor; num chip na cara do cliente ele é erro de
       português, não informação — a mesma classe do "atraso.dias" que esta
       aba já consertou no cabeçalho do modal. */
    RP_TIPO: { duracao: "duração", equipes: "equipes", paralelismo: "paralelismo" },
    /* O QUE MUDA, escrito de um jeito que não se contradiz.
       ⚠ Roteiro do defeito (FOTO 91-replan-medido.png, 12/09/2026): para a
       opção "2 Fundações [paralelismo]" o motor devolve `de:"1"` e `para:"1"`
       (os NÚMEROS das predecessoras, sem o lag) e `diasRecuperados:4`, e a
       tela imprimia, na mesma linha, "1 → 1 · −4 dia(s) medido". A mudança
       real é o lag −5 (o elo passa a entrar 5 dias úteis antes), e ele não
       aparecia em lugar nenhum. Par idêntico ao lado de um ganho medido faz a
       pessoa concluir que o número está errado — e é nesta tela que ela marca
       a caixa que muda o prazo da obra.
       Aqui o par é remontado a partir do `op` (preds × lags × tipos casam por
       posição com os números de `para`), na MESMA gramática da coluna
       "Depende de". Sem conseguir remontar, não se imprime par nenhum: o
       `porque` do motor, logo abaixo, já diz o que muda. */
    rpDePara: function (o) {
      var de = o.de == null ? "" : String(o.de), para = o.para == null ? "" : String(o.para);
      /* ⚠ SEM REPETIR O CHIP. Lido na foto: o chip do tipo já diz "duração", e
         a linha saía "3 Estrutura duração duração 350 → 325 dias úteis". Aqui
         vai só o que o chip NÃO diz — os números e a unidade. */
      if (o.tipo === "duracao") return de === para ? "" : esc(de) + " → " + esc(para) + " dias úteis";
      if (o.tipo === "equipes") return de === para ? "" : esc(de) + " → " + esc(para) + " equipe(s)";
      var op = o.op || {}, preds = arr(op.preds), lags = op.lags || {}, tipos = op.tipos || {};
      var nums = para ? para.split(",") : [], alvo = [], i;
      for (i = 0; i < preds.length; i++) {
        var id = preds[i], n = (nums[i] == null ? "?" : String(nums[i])).replace(/^\s+|\s+$/g, "");
        var l = own(lags, id) ? num0(lags[id]) : null;
        var ii = own(tipos, id) && String(tipos[id]).toUpperCase() === "II";
        alvo.push(n + (ii ? "II" : "") + (l == null ? "" : (l < 0 ? "-" + (-l) : "+" + l)));
      }
      var novo = alvo.join(",");
      if (!novo || novo === de) return "";   // não sei dizer o que mudou: calo, e o `porque` explica
      return "depende de " + esc(de || "—") + " → " + esc(novo);
    },
    replanHtml: function (rep) {
      var self = this;
      if (!rep) return '<p style="font-size:13px">Não consegui montar o replanejamento.</p>';
      if (rep.ok !== true) return '<p style="font-size:13px">' + esc(String(rep.erro || "o motor não disse por quê")) + '</p>';
      var h = '', alvo = rep.alvo || {}, base = rep.base || {};
      /* ⚠ `alvo.fonte` É IDENTIFICADOR TÉCNICO ("atraso.dias", "número
         passado"), não frase. Roteiro do defeito (achado na FOTO da e2e,
         12/09/2026): a tela imprimia `porque || fonte`, e como `porque` vem
         VAZIO no caminho normal, o cabeçalho do modal saía
         "Atraso a recuperar: 12 dia(s) úteis. atraso.dias" — nome de campo do
         motor na cara do cliente. O `porque` só existe quando há o que
         explicar; sem ele, não se escreve nada. */
      h += '<div class="rp-cab"><b>Atraso a recuperar: ' + num0(alvo.dias) + ' dia(s) úteis.</b>' +
        (alvo.porque ? ' <span class="muted">' + esc(String(alvo.porque)) + '</span>' : '');
      if (alvo.foraDaFaixa) h += '<div class="cx-aviso">' + esc(String(alvo.foraDaFaixa)) + '</div>';
      h += '<div class="muted" style="font-size:12px">Hoje o plano tem ' + num0(base.dias) + ' dia(s) úteis e ' + num0(base.criticos) + ' tarefa(s) no caminho crítico. ' +
        num0(rep.medicoes) + ' medição(ões) rodadas pelo motor (cada uma é um cálculo inteiro do cronograma).</div></div>';
      var ops = arr(rep.opcoes);
      if (!ops.length) {
        h += '<p style="font-size:13px"><b>Nenhuma opção MEDIDA recuperou prazo.</b> Isto não quer dizer que não há saída — quer dizer que nenhuma das que o motor conseguiu medir mexeu na data de entrega.</p>';
      } else {
        h += '<p class="rp-ord">As opções abaixo estão ordenadas pelo <b>efeito medido</b> — o motor rodou o cronograma inteiro com e sem cada uma. Marque as que vão ao orçamento.</p>';
        h += '<div class="rp-lista">';
        ops.forEach(function (o, i) {
          h += '<label class="rp-item"><input type="checkbox" data-rp-idx="' + i + '"><span class="rp-corpo">';
          var mud = self.rpDePara(o);
          h += '<span class="rp-tit"><b>' + esc(String(o.num == null ? "" : o.num)) + ' ' + esc(corta(o.nome, 44)) + '</b> ' +
            '<span class="rp-tipo">' + esc(self.RP_TIPO[String(o.tipo)] || String(o.tipo || "")) + '</span> ' +
            (mud ? '<span class="muted">' + mud + '</span>' : '') + '</span>';
          h += '<span class="rp-num"><b class="rp-dias">−' + nBR(num0(o.diasRecuperados), 0) + ' dia(s)</b> ' +
            '<span class="muted">medido: o plano passa a ' + num0(o.diasDepois) + ' dias úteis' + (o.fimDepois ? ' (término ' + esc(dma(o.fimDepois)) + ')' : '') + '</span></span>';
          /* o que vira crítico DEPOIS: comprimir uma frente muda o caminho, e
             a próxima pessoa a apertar tem de saber qual é */
          var ent = arr(o.entraramNoCritico), sai = arr(o.sairamDoCritico);
          if (ent.length || sai.length) {
            h += '<span class="rp-crit">';
            if (ent.length) h += '<b>entra(m) no caminho crítico:</b> ' + esc(self.rpNomes(ent)) + '. ';
            if (sai.length) h += '<b>sai(em):</b> ' + esc(self.rpNomes(sai)) + '.';
            h += '</span>';
          }
          h += '<span class="rp-porque">' + escM(o.porque || "") + '</span>';
          if (o.exigeContratar) h += '<span class="rp-custo">⚠ exige contratar mais gente ou mais equipe — o prazo encurta no papel, o custo não está medido aqui</span>';
          if (o.atendeSozinha === false) h += '<span class="rp-parcial">sozinha NÃO cobre o atraso inteiro</span>';
          h += '</span></label>';
        });
        h += '</div>';
      }
      /* ⚠ O CAMPO É `diasRecuperados`, E O MOTOR JÁ ESCREVEU O PORQUÊ. Roteiro
         do defeito (achado pela e2e, 12/09/2026): a tela lia `cb.dias`, que
         não existe, caía no ramo do "não medido" e anunciava **"Efeito de
         todas juntas: não medido"** ao lado do `porque` do motor — que dizia,
         na mesma linha, quantos dias elas recuperam JUNTAS. Recado que
         contradiz o número ao lado é pior que recado nenhum.
         ⚠ E a soma é a do MOTOR (`somaDosIndividuais`, sobre as `quantas` que
         ele combinou), não uma soma de toda a lista: o combinado é das N do
         topo, e somar as 11 daria um terceiro número na mesma tela. */
      var cb = rep.combinado;
      if (cb && cb.medido === true && cb.diasRecuperados != null) {
        h += '<div class="rp-comb"><b>As ' + num0(cb.quantas) + ' melhores JUNTAS: ' + nBR(num0(cb.diasRecuperados), 0) + ' dia(s) recuperados</b> — ' +
          '<b>medido de novo</b> pelo motor, não somado' +
          (cb.somaDosIndividuais != null ? ' (a soma dos ganhos individuais daria ' + nBR(num0(cb.somaDosIndividuais), 0) + ' dia(s))' : '') + '. ' +
          esc(String(cb.porque || "")) +
          (cb.fimDepois ? ' Término ' + esc(dma(cb.fimDepois)) + '.' : '') + '</div>';
      } else if (cb && cb.porque) {
        h += '<div class="rp-comb"><b>Efeito de todas juntas: não medido.</b> ' + esc(String(cb.porque)) + '</div>';
      }
      var inert = arr(rep.inertes), nmed = arr(rep.naoMedidos);
      if (inert.length) {
        h += '<details class="rp-mais"><summary>' + inert.length + ' opção(ões) medida(s) que NÃO recuperam prazo</summary><ul class="cx-lista">';
        inert.slice(0, 10).forEach(function (o) {
          h += '<li>' + esc(String(o.num == null ? "" : o.num)) + ' ' + esc(corta(o.nome, 40)) + ' — ' + escM(o.porque || "o motor mediu e a data não mudou") + '</li>';
        });
        if (inert.length > 10) h += '<li>e mais ' + (inert.length - 10) + '</li>';
        h += '</ul></details>';
      }
      if (nmed.length) {
        /* ⚠ SEM NÚMERO, SEMPRE. `dias` é null aqui de propósito. */
        h += '<details class="rp-mais"><summary>' + nmed.length + ' opção(ões) que o motor NÃO mediu (nenhum dia é prometido)</summary><ul class="cx-lista">';
        nmed.slice(0, 10).forEach(function (o) {
          h += '<li>' + esc(String(o.num == null ? "" : o.num)) + ' ' + esc(corta(o.nome, 40)) + ' — ' + escM(o.porqueNaoMedido || "sem motivo declarado") + '</li>';
        });
        if (nmed.length > 10) h += '<li>e mais ' + (nmed.length - 10) + '</li>';
        h += '</ul></details>';
      }
      arr(rep.avisos).forEach(function (a) { h += '<div class="cx-aviso">' + esc(String(a)) + '</div>'; });
      arr(rep.pendentes).forEach(function (p) {
        h += '<div class="cx-aviso">' + esc(String((p && (p.porque || p.motivo)) || p)) + '</div>';
      });
      return h;
    },

    /* ==================================================================
       DOCUMENTOS DO CRONOGRAMA (CronoDocs → CronoPDF.gerarDocumento)
       ==================================================================
       ⚠ TRÊS DOS QUATRO SÃO DA OBRA, não do orçamento: relatório mensal,
       lookahead e resumo executivo só existem com obra ligada A ESTA revisão
       (a mesma guarda da sub-aba Previsto × Realizado). Sem obra, o item
       aparece COM O MOTIVO — some calado é a porta prometida que não existe.
       O físico-financeiro é do orçamento e vale sempre. */
    DOCS: [
      { id: "fisico-financeiro", nome: "Físico-financeiro em matriz", papel: "a4-paisagem", publico: "cliente",
        o: "As etapas nas linhas e os meses nas colunas, com o valor e o percentual de cada mês e o acumulado. É o quadro que a fiscalização pede.", obra: false },
      { id: "relatorio-mensal", nome: "Relatório mensal da obra", papel: "a4-paisagem", publico: "cliente",
        o: "O mês fechado: avanço, diários, medições, fotos, clima, restrições e o que ficou de fora — com a verificação item a item.", obra: true },
      { id: "lookahead", nome: "Lookahead de 3 semanas", papel: "a4-paisagem", publico: "canteiro",
        o: "As tarefas das próximas 3 semanas, o que está comprometido, o que está travado por restrição e o PPC da semana que passou.", obra: true },
      { id: "resumo-executivo", nome: "Resumo executivo (1 página)", papel: "a4-retrato", publico: "interno",
        o: "Uma folha: avanço, prazo, situação, IDP, marcos e os pontos de atenção. É o que vai ao diretor.", obra: true }
    ],
    PAPEIS_ROT: [["a4-retrato", "A4 retrato"], ["a4-paisagem", "A4 paisagem"], ["a3-retrato", "A3 retrato"], ["a3-paisagem", "A3 paisagem"]],
    /* ⚠ QUEM VAI LER É ESCOLHA, NÃO PADRÃO ESCONDIDO. O mesmo documento em
       "interno" e em "cliente" são documentos DIFERENTES: o motor tira do
       papel de fora o que é recado ao engenheiro da RA, e imprimir o interno
       no quadro da fiscalização já aconteceu (cicatriz escrita no
       js/cronodocs.js). O padrão de cada documento é o do MOTOR — lookahead
       nasce "canteiro", resumo executivo nasce "interno" —, e forçar
       "cliente" nos três, como esta tela fazia na 1ª rodada, corta informação
       de um papel que nem sai da empresa. */
    PUBLICOS_ROT: [["interno", "Interno (a equipe da empresa)"], ["canteiro", "Canteiro (a equipe da obra)"],
      ["fiscalizacao", "Fiscalização"], ["cliente", "Cliente / contratante"]],
    docsHtml: function (d) {
      var self = this, temObra = !!(d && d.pr && d.pr.painel && d.obra && d.obra.alvo && d.obra.alvo.obra && d.obra.alvo.nivel === 0);
      var motivoSemObra = (d && d.obra && !d.obra.podeGestao)
        ? "Estes três documentos são da OBRA em andamento (diários, medições, restrições) — e a obra é da Gestão de Obras."
        : "Nenhuma obra desta revisão está ligada a este orçamento. Ligue a obra (linha de cima da aba) para estes três documentos existirem.";
      var h = '<p style="font-size:13px;margin:0 0 10px">Cada documento sai pelo mesmo caminho de impressão do resto do app: abre pronto na tela, com <b>Imprimir / Salvar PDF</b> no topo.</p>';
      h += '<div class="dx-lista">';
      this.DOCS.forEach(function (x) {
        var bloq = x.obra && !temObra;
        h += '<div class="dx-item' + (bloq ? ' off' : '') + '"><div class="dx-nome"><b>' + esc(x.nome) + '</b></div>' +
          '<div class="dx-o">' + esc(x.o) + '</div>';
        if (bloq) {
          h += '<div class="dx-bloq">' + esc(motivoSemObra) + '</div>';
        } else {
          h += '<div class="dx-acao"><label>Papel <select data-dx-papel="' + esc(x.id) + '">';
          self.PAPEIS_ROT.forEach(function (p) {
            h += '<option value="' + p[0] + '"' + (p[0] === x.papel ? ' selected' : '') + '>' + esc(p[1]) + '</option>';
          });
          h += '</select></label><label title="' +
            esc("Quem vai ler decide o que entra no papel: o motor tira do documento de fora o que é recado interno à equipe da empresa. O padrão é o deste documento.") +
            '">Para quem <select data-dx-publico="' + esc(x.id) + '">';
          self.PUBLICOS_ROT.forEach(function (p) {
            h += '<option value="' + p[0] + '"' + (p[0] === x.publico ? ' selected' : '') + '>' + esc(p[1]) + '</option>';
          });
          h += '</select></label><button class="btn sm primary" data-acao="crono-doc" data-doc="' + esc(x.id) + '">Gerar</button></div>';
        }
        h += '</div>';
      });
      return h + '</div>';
    },

    /* ==================================================================
       MS PROJECT — o RELATO do que entrou no arquivo, e a ponte .mpp
       ==================================================================
       ⚠ `opts.relato` é a ÚNICA fonte do que entrou. Sem lê-lo, a tela promete
       um arquivo completo e entrega um pobre: `gerarXML` devolvendo string não
       quer dizer que o detalhe, o custo, o recurso, a base ou o avanço saíram
       (detalhe pedido com plano que não fecha cai no XML por etapa, CALADO). */
    /* as cinco partes do relato, na ordem em que a pessoa pergunta */
    MSP_RELATO: [["recursos", "Gente (profissões e horas)"], ["custo", "Dinheiro (preço de VENDA)"],
      ["base", "Linha de base (a barra cinza)"], ["avanco", "Avanço da obra"], ["restricoes", "Datas fixadas e prazos-limite"]],
    mspRelatoHtml: function (rel) {
      if (!rel || typeof rel !== "object") return "";
      var self = this, entrou = [], fora = [], temAlgo = false;
      /* ⚠ RELATO VAZIO NÃO VIRA QUADRO. Quando nenhuma opção foi pedida, o
         motor não escreve nada em `relato` — e um quadro dizendo "nada foi
         pedido" cinco vezes é ruído que ensina a pessoa a não ler o quadro
         quando ele tiver conteúdo de verdade. */
      this.MSP_RELATO.forEach(function (par) { if (rel[par[0]] != null) temAlgo = true; });
      /* ⚠ AS ETAPAS OPCIONAIS OMITIDAS SÃO A PARTE QUE NÃO PODE FALTAR, e ela
         não entra na lista das cinco: as outras são OPÇÕES que a pessoa pediu,
         esta é uma OMISSÃO que o arquivo sofreu. O engenheiro manda este .xml
         ao cliente; se a tela não disser que uma etapa inteira ficou de fora,
         ele descobre pelo cliente. Por isso ela força o quadro a aparecer
         mesmo quando nenhuma opção foi pedida. */
      var opc = rel.opcionais;
      if (opc && opc.fora > 0) temAlgo = true;
      if (!temAlgo) return "";
      this.MSP_RELATO.forEach(function (par) {
        var x = rel[par[0]];
        /* ⚠ `null` = a OPÇÃO não foi pedida; `{ok:false}` = foi pedida e não
           saiu (com o motivo do motor). Os dois casos são diferentes, e
           misturá-los é o que faz a tela prometer o que o arquivo não tem. */
        if (x == null) { fora.push(par[1] + ": não foi pedido nesta exportação."); return; }
        var m = String(x.motivo || "");
        if (x.ok === true) entrou.push('<b>' + esc(par[1]) + ':</b> ' + esc(m));
        else fora.push(par[1] + ": " + (m || "não saiu, e o motor não disse por quê."));
      });
      var h = '<div class="dx-relato">';
      /* A omissão vem PRIMEIRO, em destaque: é a única linha deste quadro que
         muda o que a pessoa faz a seguir (avisar o cliente, ou ligar o
         interruptor e gerar de novo). */
      if (opc && opc.fora > 0) {
        h += '<div style="background:#f59e0b1f;border-left:3px solid #b45309;padding:6px 10px;margin-bottom:8px;font-size:12.5px">' +
          '<b>' + esc(String(opc.fora)) + ' etapa' + (opc.fora === 1 ? '' : 's') + ' opcional' + (opc.fora === 1 ? '' : 'is') +
          ' não entra' + (opc.fora === 1 ? '' : 'm') + ' neste arquivo:</b> ' +
          esc(arr(opc.etapas).map(function (e) { return (e.numero ? e.numero + " " : "") + (e.nome || ""); }).join(" · ")) +
          '. O prazo e o valor deste arquivo são os do escopo contratado — o mesmo da proposta.' +
          '</div>';
      }
      h += '<b>O que foi neste arquivo</b> <span class="muted">(medido pelo motor no próprio XML — MSProject opts.relato)</span><ul class="cx-lista">';
      if (!entrou.length) h += '<li>Nada além das tarefas, das datas e das dependências.</li>';
      entrou.forEach(function (t) { h += '<li>' + t + '</li>'; });
      h += '</ul>';
      if (fora.length) {
        h += '<b>O que NÃO foi</b><ul class="cx-lista">';
        fora.forEach(function (t) { h += '<li>' + esc(t) + '</li>'; });
        h += '</ul>';
      }
      return h + '</div>';
    },

    /* O que a PONTE mediu dentro do .mpp reaberto, e o que ela não leva.
       ⚠ 200 não quer dizer "o arquivo tem tudo": `X-Mpp-Faltou` é a lista do
       que a ponte não leva, e sem ela a tela promete um arquivo completo. */
    MPP_CONF: [["tarefas", "tarefas"], ["datas", "datas conferidas"], ["elos", "dependências"],
      ["feriados", "feriados"], ["recursos", "profissões"], ["alocacoes", "alocações"],
      ["custoTotal", "custo total (R$)"], ["horas", "horas"], ["bases", "linhas de base"], ["avancos", "avanços"]],
    mppConferidoHtml: function (tarefas, conf, faltou) {
      var h = '<div class="dx-relato"><b>O que o MS Project leu de volta do arquivo</b> ' +
        '<span class="muted">(números medidos DENTRO do .mpp reaberto, não prometidos)</span><ul class="cx-lista">';
      h += '<li><b>' + num0(tarefas) + '</b> tarefa(s) no arquivo.</li>';
      var c = (conf && typeof conf === "object") ? conf : {};
      this.MPP_CONF.forEach(function (par) {
        if (c[par[0]] == null) return;
        h += '<li>' + esc(par[1]) + ': <b>' + esc(nBR(num0(c[par[0]]), (par[0] === "custoTotal" || par[0] === "horas") ? 2 : 0)) + '</b></li>';
      });
      h += '</ul>';
      var f = arr(faltou);
      if (f.length) {
        h += '<b>O que a ponte NÃO leva para o .mpp</b><ul class="cx-lista">';
        f.forEach(function (t) { h += '<li>' + esc(String(t)) + '</li>'; });
        h += '</ul><p class="muted" style="font-size:12px;margin:0">Tudo isto existe no arquivo <b>XML</b> — se precisar de algum deles, use o XML.</p>';
      }
      return h + '</div>';
    },

    /* A PONTE .mpp em `div.cx-acoes`.
       ⚠ O BOTÃO ".mpp" SÓ EXISTE COM `temProject && automacao === "ok"` — é o
       contrato escrito no server/mpp.js. Enquanto o status não voltar, o que
       existe é [verificar], que promete só o que faz.
       ⚠ E `verificou === false` NÃO É "não tem MS Project": são dois campos
       diferentes de propósito. Transformar "não sei" em "este computador não
       tem" manda o cliente procurar o defeito no lugar errado. */
    mppAcoes: function (mp) {
      /* ⚠ N3 COM TEXTO (14/09/2026): a etiqueta ".mpp" é o rótulo inteiro, e o
         resto da frase mora no `title` e no `aria-label`. O " verificar" /
         " Gerar" em `.cx-rot` sumia abaixo de 1600 px e voltava acima — era
         metade do degrau que fazia a linha saltar 354 px num pixel. A
         etiqueta continua existindo porque [MS Project (XML)] e o .mpp usam o
         MESMO ícone de exportar (e2e-crono-pro cobra a etiqueta visível). */
      if (!mp) {
        return '<button class="btn sm n3" data-acao="crono-mpp-status" aria-label="Gerar .mpp — verificar" ' +
          'title="Gerar .mpp — verificar: este computador pode gerar o .mpp nativo do MS Project, se o Project estiver instalado aqui. Verificar sobe um Project invisível por alguns segundos — por isso não é feito sozinho ao abrir a aba.">' +
          '<span class="cx-mpp-tag">.mpp?</span></button>';
      }
      if (mp.carregando) return '<button class="btn sm n3" disabled><span class="cx-mpp-tag">.mpp</span> verificando o MS Project…</button>';
      if (mp.erro) {
        return '<span class="cx-mpp-sem" title="' + esc(String(mp.erro)) + '">.mpp: ' + esc(corta(String(mp.erro), 70)) + '</span>' +
          '<button class="btn sm n3" data-acao="crono-mpp-status">tentar de novo</button>';
      }
      if (mp.temProject && mp.automacao === "ok") {
        return '<button class="btn sm n3" data-acao="crono-mpp" aria-label="Gerar .mpp" title="' +
          esc("Gerar .mpp — gera o arquivo .mpp nativo com o MS Project" + (mp.versao ? " " + mp.versao : "") + " deste computador. Demora cerca de 20 segundos.") + '">' +
          '<span class="cx-mpp-tag">.mpp</span></button>';
      }
      /* ⚠ o `motivo` do servidor é o que a pessoa lê — ele nunca vem vazio, e
         com `verificou:false` ele já diz "não consegui verificar" */
      var mot = String(mp.motivo || (mp.verificou === false ? "não consegui verificar se este computador tem o MS Project." : "a automação do MS Project não respondeu neste computador."));
      return '<span class="cx-mpp-sem" title="' + esc(mot + " O arquivo XML ao lado abre no Project, no ProjectLibre e no GanttProject.") + '">.mpp indisponível: ' + esc(corta(mot, 70)) + '</span>' +
        '<button class="btn sm n3" data-acao="crono-mpp-status" title="Verificar de novo (a resposta anterior vale por 10 minutos)">verificar de novo</button>';
    },

    /* topo reservado no modo "tela": cabeçalho do Gantt + sub-abas visíveis */
    /* 150 + GX_USO (a barra de uso da 1C, dentro da moldura) */
    GX_TELA_TOPO: 190,

    render: function (d, est) {
      est = est || this.estado(null, d.orc);
      // sem Gestão de Obras não há obra para comparar: a sub-aba some (ver SUBS)
      if (!(d.obra && d.obra.podeGestao)) { est.semReal = true; if (est.sub === "real") est.sub = "cronograma"; }
      /* JANELA DESTACADA (js/janelas.js): só o painel pedido — o Gantt sem a
         barra de sub-abas e sem o cartão de parâmetros; Físico-financeiro e
         Previsto × Realizado sozinhos. Quem quer mexer nos parâmetros usa a
         janela principal. */
      if (d.painel === "gantt" || d.painel === "fisico" || d.painel === "real" || d.painel === "parametros") {
        var hp = '<style>' + CSS + '</style><div class="cx cx-painel-so" data-cx-sub="' + esc(d.painel) + '">';
        if (d.painel === "fisico") hp += this.fisico(d, est);
        else if (d.painel === "real") hp += this.real(d, { janela: true });
        else if (d.painel === "parametros") hp += this.parametros(d, est);
        else { d.cartao = ""; hp += this.cronograma(d, est); }
        return hp + '</div>';
      }
      var html = '<style>' + CSS + '</style><div class="cx" data-cx-sub="' + esc(est.sub) + '">';
      /* ⚠ a faixa da obra mora NA LINHA das sub-abas: numa linha própria ela
         empurrava o Gantt 42 px para baixo — medido a 1366×768, a 1ª barra
         ficava em y=898, abaixo da dobra (critério de aceite da espec 2) */
      /* os dados deste render vão ao `quando` das sub-abas registradas (T8) por
         uma variável do módulo, e não por argumento: a chamada da barra fica a
         de sempre (tools/test-cronoexecui.js a sabota por este texto) */
      _dBarra = d;
      try { html += this.barra(est, this.faixaObra(d.obra)); } finally { _dBarra = null; }
      if (est.sub === "fisico") html += this.fisico(d, est);
      else if (est.sub === "parametros") html += this.parametros(d, est);
      else if (est.sub === "real") html += this.real(d);
      else {
        /* a sub-aba REGISTRADA por uma fatia (planejador, T8), consultada
           DEPOIS das três de sempre; sem registro (ou `quando` falso), o
           cronograma, como hoje */
        var sr = subReg(est.sub);
        if (sr && subVale(sr, d, est) && typeof sr.render === "function") html += String(sr.render(d, est) || "");
        else html += this.cronograma(d, est);
      }
      return html + '</div>';
    },

    /* Sub-aba Previsto × Realizado do orçamento: o MESMO painel da ficha da
       obra (painelPR completo), com os dados de App._cronoPainelDados. Sem
       painel, diz por quê e a porta que existe — nunca um quadro vazio. */
    /* `opts.janela` (janela destacada, só o painel): ali não há "linha de
       cima" nem troca de orçamento — o recado manda à janela principal, e a
       porta que abriria OUTRO orçamento dentro da janela some (ela trocaria
       o conteúdo que o endereço da janela promete). */
    real: function (d, opts) {
      var info = d.obra || {}, a = info.alvo || {}, jan = !!(opts && opts.janela);
      if (jan && !info.podeGestao) {
        return '<div class="card cx-card"><p style="margin:0 0 8px;font-size:13px">' + esc("O previsto × realizado compara o cronograma com a obra, e isso é da Gestão de Obras — que não está liberada nesta conta. O Gantt e o físico-financeiro continuam valendo.") + '</p></div>';
      }
      /* ⚠ A NARRATIVA VEM ACIMA DOS KPIs: ela é a leitura em português dos
         MESMOS números que estão logo abaixo, e lida depois deles vira
         repetição. `d.narrativa` é montada pela fiação (App._cronoPainelDados
         → CronoIA.narrativa sobre o MESMO painel) — uma segunda montagem
         divergiria na data de corte. */
      if (d.pr && d.pr.painel) {
        var nr = this.nrDados(d.pr.painel);
        return this.painelPR(d.pr, { completo: true, origem: "orc",
          aposKpis: this.narrativaHtml(nr, d.pr.painel, d.r) + this.narrativaRessalvas(nr) });
      }
      var msg, porta = "";
      var outs = arr(info.outras);
      if (!arr(info.obras).length && !info.ocultas && outs.length) {
        // a obra é de outra revisão da família: o previsto × realizado dela mora no orçamento ligado a ela
        msg = "A obra " + (outs[0].obra.nome || "") + " está ligada à revisão " + (outs[0].maisNova ? "mais nova " : "") + (outs[0].orcNumero || outs[0].orcId) + " deste orçamento — o previsto × realizado dela é medido sobre aquele orçamento.";
        porta = jan ? "" : '<button class="btn sm" data-acao="crono-abrir-orc" data-orc="' + esc(outs[0].orcId) + '">Abrir o orçamento ligado à obra</button>';
        if (jan) msg += " Abra aquele orçamento na janela principal.";
      } else if (!arr(info.obras).length) {
        msg = info.ocultas || info.ocultasOutras ? (Number(info.ocultas) || 0) + (Number(info.ocultasOutras) || 0) + " obra(s) ligada(s) a este orçamento (ou a uma revisão dele) que o seu usuário não vê — o previsto × realizado é da obra, e fica com quem pode vê-la."
          : "Nenhuma obra ligada a este orçamento. O previsto × realizado compara o planejado com os diários e as medições de uma obra: crie a obra deste orçamento (" + (jan ? "na janela principal, aba Cronograma" : "botão na linha de cima") + ") para acompanhar.";
      } else if (!a.obra) msg = arr(info.obras).length + " obras ligadas a este orçamento — escolha " + (jan ? "na janela principal (aba Cronograma)" : "na linha de cima") + " qual acompanhar.";
      else if (a.nivel > 0) {
        msg = "A obra " + (a.obra.nome || "") + " está ligada a uma revisão anterior deste orçamento — o previsto × realizado mede sobre o orçamento ligado a ela. Passe a obra para esta revisão (" + (jan ? "na janela principal" : "linha de cima") + ") ou abra o orçamento ligado a ela.";
        if (a.obra.orcamentoId && !jan) porta = '<button class="btn sm" data-acao="crono-abrir-orc" data-orc="' + esc(a.obra.orcamentoId) + '">Abrir o orçamento ligado à obra</button>';
      } else msg = "Não consegui montar o previsto × realizado da obra " + (a.obra.nome || "") + " agora — a sub-aba Cronograma continua valendo. Se persistir, avise o suporte.";
      return '<div class="card cx-card"><p style="margin:0 0 8px;font-size:13px">' + esc(msg) + '</p>' + porta + '</div>';
    },

    /* Faixa da obra (1 linha). Fase 2: a obra ligada — pela cadeia de
       revisões — e a porta até ela. O previsto × realizado por nó chega com
       o planejamento da obra (Fase 3) e NÃO é inventado aqui.
       Sem Gestão (plano base): nenhuma porta de obra, uma linha honesta. */
    faixaObra: function (info) {
      info = info || {};
      if (!info.podeGestao) {
        return '<div class="cx-faixa muted" title="Aqui fica o cronograma da proposta; o acompanhamento da obra (executado × previsto) é feito na Gestão de Obras.">Previsto × realizado da obra é da <b>Gestão de Obras</b>.</div>';
      }
      var obs = arr(info.obras), dec = info.alvo || {}, html = '<div class="cx-faixa">';
      var outs = arr(info.outras), oOut = Number(info.ocultasOutras) || 0;
      /* ⚠ obra ligada a OUTRA revisão da família (mais nova ou irmã): nunca
         [Criar obra] — a porta é o orçamento ligado a ela (ver obraDaCadeia) */
      if (!obs.length && !info.ocultas && (outs.length || oOut)) return html + this._faixaOutras(outs, oOut) + '</div>';
      if (!obs.length && !info.ocultas) {
        return html + '<span class="muted" title="O acompanhamento previsto × realizado começa quando uma obra for vinculada a este orçamento (Gestão → Obras).">Nenhuma obra ligada a este orçamento.</span>' +
          (info.podeCriar ? '<button class="btn sm" data-acao="crono-obra-criar" title="Abre o cadastro de obra já preenchido com este orçamento, o início do cronograma e o término que ele calcula. Nada é gravado sem você salvar.">Criar obra deste orçamento</button>' : '') + '</div>';
      }
      /* ⚠ NUNCA "Criar obra" com obra na CADEIA de revisões — nem com a que o
         usuário não vê. O acumulado já medido de cada item é por obra (e por
         orçamento): uma segunda obra começaria a medição do zero nos itens já
         medidos na primeira — faturamento em dobro (crítica dinheiro #2). */
      if (!obs.length) return html + '<span class="muted">' + info.ocultas + ' obra(s) ligada(s) que o seu usuário não vê</span></div>';
      var a = null;
      if (dec.obra) obs.forEach(function (x) { if (x.obra && x.obra.id === dec.obra.id) a = x; });
      if (!a && obs.length === 1) a = obs[0];
      if (!a) {
        // várias obras e nenhuma escolhida: a escolha é da pessoa (estado de tela), nunca da ordem da lista
        html += '<span><b>' + obs.length + ' obras</b> ligadas a este orçamento — escolha qual acompanhar:</span>';
        obs.slice(0, 6).forEach(function (x) {
          html += '<button class="btn sm" data-acao="crono-obra-sel" data-obra="' + esc(x.obra.id) + '" title="' + esc(x.obra.nome || "") + '">' + esc(corta(x.obra.nome || "sem nome", 28)) +
            (x.nivel > 0 ? ' <span class="muted">(revisão ' + esc(x.orcNumero || "anterior") + ')</span>' : '') + '</button>';
        });
        if (obs.length > 6) html += '<span class="muted">e mais ' + (obs.length - 6) + '</span>';
        if (info.ocultas) html += '<span class="muted">' + info.ocultas + ' obra(s) ligada(s) que o seu usuário não vê</span>';
        return html + '</div>';
      }
      /* ⚠ O NOME INTEIRO (14/09/2026): era `corta(…, 32)` e, dentro do chip
         espremido, sobravam 48 px. A pessoa precisa ler QUAL obra vai passar
         antes de [Passar a obra], que mexe em quantidade medida; o corte, se
         faltar espaço, é do CSS (reticências depois de 16 em) e o `title` tem
         o nome todo. */
      var ob = a.obra, nomeC = esc(ob.nome || "sem nome");
      if (dec.tipo === "plano") html += '<span class="cx-modo" title="Este orçamento está aprovado: o que se edita aqui (durações, dependências, parâmetros, modo executivo, Execução → Enviar) vai para o plano de execução da obra. A proposta aprovada, o PDF da proposta e o desembolso dela ficam como foram.">Editando o <b>PLANO DE EXECUÇÃO</b> da obra <b>' + nomeC + '</b> — a proposta aprovada não muda.</span>';
      /* ⚠ O CHIP É SÓ TEXTO; OS BOTÕES VÊM DEPOIS DELE, NUNCA DENTRO. Botão
         dentro do texto que encolhe foi a raiz dos dois defeitos da 1.2.77 (o
         nome sumindo e [Cadastro da obra] por baixo de [Imprimir / PDF]). Fora
         do chip, o botão que não cabe QUEBRA A LINHA em vez de cobrir alguém.
         [Passar a obra] é N2-forte (`acao-forte`) e não azul cheio (decisão D2):
         o azul cheio fica para a sub-aba ativa e o primário da área. */
      if (a.nivel > 0) {
        html += '<span class="cx-chip" title="' + esc(ob.nome || "") + '"><span class="cx-chip-txt">Obra: <b>' + nomeC + '</b>';
        html += ' <span class="muted">· ligada à revisão anterior ' + esc(a.orcNumero || "") + '</span></span></span>';
        if (info.podeEditarObra) html += '<button class="btn sm acao-forte" data-acao="crono-obra-passar" data-obra="' + esc(ob.id) + '" title="Mostra o antes → depois das quantidades e pede confirmação. Diários e medições continuam na mesma obra.">Passar a obra para esta revisão</button>';
        html += '<button class="btn sm" data-gopen="obras:' + esc(ob.id) + '" title="Abrir cadastro da obra — na Gestão de Obras">Cadastro da obra</button>';
      } else {
        /* os NÚMEROS primeiro: na linha que encolhe com reticências é o que
           ainda aparece; o texto inteiro (com as três réguas) vai no title do
           chip. A porta [Informar início] fica FORA do texto que encolhe (um
           botão dentro do texto cortado sumiria junto). */
        html += '<span class="cx-chip" title="' + esc("Obra " + (ob.nome || "") + (info.chipTitulo ? " — " + info.chipTitulo : "")) + '"><span class="cx-chip-txt">' +
          (info.chip ? '<span class="cx-chipnum">' + info.chip + '</span> <span class="muted">·</span> ' : '') + 'Obra <b>' + nomeC + '</b></span></span>';
        html += (info.chipPorta || '') + '<button class="btn sm" data-acao="crono-planejamento" data-obra="' + esc(ob.id) + '" title="Abrir planejamento da obra — o cronograma da obra: previsto × realizado, linha de base e histórico">Abrir planejamento</button>';
        if (dec.planoIlegivel) {
          /* ⚠ PLANEJAMENTO DAS OBRAS ILEGÍVEL (revisão adversarial da Onda 0 do
             planejador, achado 1). A lista chega vazia, e sem este ramo a faixa
             do aprovado oferecia [Iniciar plano de execução da obra] — um plano
             que pode existir, na quarentena. A porta aqui é a da quarentena, a
             mesma do aviso da lista de orçamentos (UI.renderAvisoIlegivel):
             restaurar o backup ou guardar à parte e recomeçar. Sem ser o
             administrador, só ele pode (o recado no title diz isso). O texto
             inteiro vem da fiação (App._cronoDecisao), já montado pelo Store. */
          html += '<span class="cx-faixa-nota" role="alert" data-cx-ilegivel="1" title="' + esc(dec.planoIlegivel.recado || "") + '">⚠ Planejamento da obra ilegível neste aparelho — nada dele é mostrado nem gravado aqui</span>';
          if (dec.planoIlegivel.admin) {
            html += '<button class="btn sm acao-forte" data-acao="backup" title="Abre o backup: restaure o arquivo de antes do problema — o planejamento das obras volta inteiro.">Restaurar um backup</button>' +
              '<button class="btn sm" data-acao="liberar-ilegivel" title="Guarda o conteúdo ilegível à parte (nada é apagado) e deixa o planejamento das obras recomeçar vazio. Use quando não houver backup — com a nuvem ligada, ela traz de volta o que tem.">Guardar à parte e recomeçar</button>';
          } else html += '<span class="muted">Avise o administrador da conta.</span>';
        } else if (dec.planoAlheio) {
          /* ⚠ plano iniciado sobre OUTRO orçamento (a obra foi religada pelo
             cadastro): as etapas não são as mesmas, e editar aqui gravaria
             durações em ids que este orçamento não tem. A porta é reiniciar,
             com confirmação que diz o que se perde (App.cronoIniciarPlano). */
          html += '<span class="muted cx-faixa-nota" title="O plano de execução da obra foi iniciado a partir do orçamento ' + esc(dec.planoAlheio.orcNumero || dec.planoAlheio.orcamentoId || "") + ', que não é este nem uma revisão dele.">Plano da obra: de outro orçamento (' + esc(corta(dec.planoAlheio.orcNumero || dec.planoAlheio.orcamentoId || "", 20)) + ')</span>';
          /* N2-forte pelo mesmo motivo do [Passar a obra]: ação consequente da faixa, não o primário da tela */
          if (info.podeEditarObra) html += '<button class="btn sm acao-forte" data-acao="crono-plano-iniciar" data-obra="' + esc(ob.id) + '" data-reiniciar="1" title="Copia o cronograma deste orçamento para o plano da obra. Mostra antes o que se perde e pede confirmação.">Reiniciar plano a partir deste orçamento</button>';
        } else if (dec.travado && !dec.plano) {
          html += '<span class="muted cx-faixa-nota" title="Aprovado: o cronograma da proposta não muda — para replanejar a obra, inicie o plano de execução dela.">Aprovado: o cronograma da proposta não muda.</span>';
          if (info.podeEditarObra) html += '<button class="btn sm acao-forte" data-acao="crono-plano-iniciar" data-obra="' + esc(ob.id) + '" title="Copia este cronograma para a obra: a partir daí as edições desta aba vão para o plano da obra e a proposta aprovada fica intacta.">Iniciar plano de execução da obra</button>';
        } else if (!dec.aprovado && !dec.travado && dec.plano) {
          /* ⚠ só SEM aprovação (revisão 3, lente UX): no aprovado o decidirAlvo
             destrava (o alvo é o plano) e o seletor aparecia com [Proposta]
             mudo — o clique não tinha para onde ir, porque a proposta aprovada
             não se edita. Porta que não abre é pior que porta nenhuma. */
          // não aprovado com plano: as duas coisas existem e a pessoa escolhe qual edita (estado de tela)
          var emPlano = dec.tipo === "plano";
          html += '<span class="cx-seg" role="group" aria-label="O que esta aba edita"><button class="' + (emPlano ? '' : 'on') + '" data-acao="crono-editar" data-modo="orc" aria-pressed="' + (emPlano ? 'false' : 'true') + '" title="O cronograma da proposta (PDF, desembolso)">Proposta</button>' +
            '<button class="' + (emPlano ? 'on' : '') + '" data-acao="crono-editar" data-modo="plano" aria-pressed="' + (emPlano ? 'true' : 'false') + '" title="O plano de execução da obra (previsto × realizado)">Plano da obra</button></span>';
        }
      }
      if (obs.length > 1) html += '<button class="btn sm ghost" data-acao="crono-obra-sel" data-obra="" title="Este orçamento tem ' + obs.length + ' obras ligadas — escolher outra">trocar obra (' + obs.length + ')</button>';
      if (info.ocultas) html += '<span class="muted">' + info.ocultas + ' obra(s) ligada(s) que o seu usuário não vê</span>';
      return html + '</div>';
    },
    /* a obra está ligada a OUTRA revisão da família (mais nova ou irmã): diz
       qual e oferece a porta que existe — abrir o orçamento ligado a ela */
    _faixaOutras: function (outs, oOut) {
      var h = '', a = outs[0];
      if (a) {
        h += '<span title="' + esc(a.obra.nome || "") + '">Obra <b>' + esc(corta(a.obra.nome || "sem nome", 28)) + '</b> <span class="muted">· ligada à revisão ' + (a.maisNova ? 'mais nova ' : '') + '<b>' + esc(a.orcNumero || a.orcId) +
          '</b> — é por ela que a obra planeja e mede</span></span>';
        h += '<button class="btn sm" data-acao="crono-abrir-orc" data-orc="' + esc(a.orcId) + '" title="Abre o orçamento ligado à obra na aba Cronograma">Abrir o orçamento ligado à obra</button>';
        if (outs.length > 1) h += '<span class="muted">e mais ' + (outs.length - 1) + ' obra(s) em outras revisões</span>';
      }
      if (oOut) h += '<span class="muted">' + oOut + ' obra(s) ligada(s) a outra revisão deste orçamento que o seu usuário não vê</span>';
      return h;
    },

    barra: function (est, faixa) {
      var html = '<div class="cx-barra"><div class="cx-subs" role="tablist">', d = _dBarra;
      function botao(s) {
        return '<button class="cx-sub' + (est.sub === s.id ? ' on' : '') + '" role="tab" aria-selected="' + (est.sub === s.id ? 'true' : 'false') + '" data-acao="crono-sub" data-sub="' + esc(s.id) + '">' + esc(s.nome) + '</button>';
      }
      /* as sub-abas REGISTRADAS (planejador, T8) entram logo depois da que
         elas pedem (`depoisDe`), e em cadeia; `depoisDe` que não existe → no
         fim. Sem registro, a barra de sempre, byte a byte. */
      var postas = {};
      function depoisDe(id) {
        _subsReg.forEach(function (x) {
          if (x.depoisDe !== id || postas[x.id] || !subVale(x, d, est)) return;
          postas[x.id] = 1; html += botao(x); depoisDe(x.id);
        });
      }
      SUBS.forEach(function (s) {
        (function () {
          if (!subVisivel(s.id)) return;
          if (s.id === "real" && est.semReal) return;   // sem Gestão de Obras: ver render
          html += '<button class="cx-sub' + (est.sub === s.id ? ' on' : '') + '" role="tab" aria-selected="' + (est.sub === s.id ? 'true' : 'false') + '" data-acao="crono-sub" data-sub="' + s.id + '">' + esc(s.nome) + '</button>';
        })();
        if (_subsReg.length) depoisDe(s.id);
      });
      _subsReg.forEach(function (x) { if (!postas[x.id] && subVale(x, d, est)) { postas[x.id] = 1; html += botao(x); depoisDe(x.id); } });
      /* ⚠ DUAS LINHAS (decisão D1, 14/09/2026). Linha 1: o segmentado e as
         ações N3 (só ícone, SEMPRE — o `title` e o `aria-label` dizem o nome;
         o rótulo que voltava a partir de 1600 px era o degrau que fazia a
         linha saltar 354 px num pixel). Linha 2: a faixa da obra, com o nome
         inteiro e os botões dela (o CSS dá `flex-basis:100%` à `.cx-faixa`).
         A faixa vem DEPOIS de `.cx-acoes` no HTML: é a ordem de leitura e de
         Tab (sub-aba → ações da aba → a obra). Ver o CSS da `.cx-faixa`. */
      html += '</div><div class="cx-acoes">' +
        '<button class="btn sm icone" data-acao="cron-pdf" aria-label="Imprimir / PDF" title="Imprimir / PDF — abre o cronograma pronto para imprimir ou salvar em PDF (A4 paisagem), no detalhe que está na tela">' + ic('imprimir') + '</button>' +
        /* os QUATRO PAPÉIS do js/cronodocs.js. Ficam num botão próprio, e não
           dentro do [Imprimir / PDF]: aquele imprime O QUE ESTÁ NA TELA (o
           Gantt), estes são documentos de obra com público e papel próprios. */
        '<button class="btn sm icone" data-acao="crono-docs" aria-label="Documentos" title="Documentos — físico-financeiro em matriz, relatório mensal da obra, lookahead de 3 semanas e resumo executivo de 1 página, com papel e orientação escolhíveis.">' + ic('relatorio') + '</button>' +
        '<button class="btn sm icone" data-acao="cron-msproject" aria-label="MS Project (XML)" title="MS Project (XML) — exporta as etapas, durações e dependências, no detalhe que está na tela, com o dinheiro (preço de venda), as profissões e horas, a linha de base, o avanço da obra e as datas fixadas. Abre também no Project Libre e no GanttProject.">' + ic('exportar') + '</button>' +
        this.mppAcoes(est.mpp) +
        '</div>' + (faixa || '') + '</div>';
      return html;
    },

    seletorDetalhe: function (det) {
      var html = '<span class="muted cx-rotulo">Detalhe:</span> <span class="cx-seg" role="group" aria-label="Detalhe do cronograma">';
      DETALHES.forEach(function (k) {
        html += '<button class="' + (det === k ? 'on' : '') + '" data-acao="crono-det" data-det="' + k + '" aria-pressed="' + (det === k ? 'true' : 'false') + '">' + DET_ROT[k] + '</button>';
      });
      return html + '</span>';
    },

    interruptor: function (r) {
      var rede = !!(r.exec && r.exec.rede);
      return '<button class="cx-toggle' + (rede ? ' on' : '') + '" data-acao="crono-exec" data-ligar="' + (rede ? '0' : '1') + '" role="switch" aria-checked="' + (rede ? 'true' : 'false') + '" title="' +
        (rede ? 'LIGADO: a duração de cada etapa com subetapas é o vão da rede das subetapas (e é esse prazo que vai ao PDF, à proposta e ao desembolso). Clique para ver o antes → depois de desligar.'
          : 'DESLIGADO: as subetapas são desenhadas dentro da duração de cada etapa. Clique para ver o antes → depois de ligar — nada é gravado sem você confirmar.') +
        '"><span class="cx-knob"></span>Detalhar o prazo pelas subetapas (cronograma executivo)</button>';
    },

    /* OS DOIS PRAZOS LADO A LADO — o contratado e o que inclui as opcionais.
     *
     * ⚠ POR QUE ISTO EXISTE (defeito D4, 12/09/2026). A etapa marcada como
     * OPCIONAL fica fora do "Valor total" que a proposta cobra (`precoObrigatorio`,
     * js/orcamento.js), mas entrava no PRAZO e até no caminho crítico. Medido numa
     * fixture: 59 dias úteis com ela, 20 sem. Ou seja: a data de entrega impressa
     * na proposta contava um escopo que o cliente não comprou.
     *
     * ⚠ E POR QUE OS DOIS, em vez de trocar o número calado. Mostrar só o menor
     * faria a pessoa ver um prazo encurtar sem saber o que ficou de fora — que é
     * a cicatriz de `feriado-liga-por-padrao` (a entrega de orçamentos antigos
     * mudou sozinha e ninguém sabia responder a quem estranhasse). Com os dois na
     * mesma linha, o número menor vem acompanhado do que ele deixou de fora.
     *
     * Só aparece quando o motor devolve a segunda conta, ou seja, quando existe
     * etapa opcional E o interruptor está desligado. Medido em 11/09/2026:
     * ZERO de 51 orçamentos reais têm etapa opcional — hoje esta linha não
     * aparece para ninguém, e é de propósito que ela não invente ocasião. */
    pillOpcionais: function (r) {
      if (!r || r.totalDiasComOpcionais == null || r.totalDiasComOpcionais === r.totalDias) return "";
      var fora = [];
      arr(r.etapas).forEach(function (e) { if (e && e.foraDoPrazo) fora.push(e.numero ? (e.numero + " " + (e.nome || "")) : (e.nome || "")); });
      var quais = fora.length ? fora.join(" · ") : "";
      var dFim = r.dataFimComOpcionais && r.dataFimComOpcionais.toLocaleDateString
        ? r.dataFimComOpcionais.toLocaleDateString("pt-BR") : "";
      /* ⚠ classe e não `style=` (14/09/2026): o #475569 cravado dava 2,41:1 no
         tema escuro; o token --texto-fraco tem o par do escuro */
      return '<span class="pill cx-pill-opc" title="' +
        esc("O prazo acima é o do escopo que o Valor total cobra. Com a" + (fora.length === 1 ? "" : "s") +
            " etapa" + (fora.length === 1 ? "" : "s") + " opcional" + (fora.length === 1 ? "" : "is") +
            (quais ? " (" + quais + ")" : "") + " a obra iria a " + r.totalDiasComOpcionais + " dias úteis" +
            (dFim ? ", terminando em " + dFim : "") +
            ". Para contá-la no prazo, marque “Contar opcionais no prazo” em Parâmetros e clique em Recalcular.") +
        '">com as opcionais: ' + esc(String(r.totalDiasComOpcionais)) + ' dias úteis' +
        (dFim ? ' (' + esc(dFim) + ')' : '') + '</span>';
    },

    cronograma: function (d, est) {
      var r = d.r, det = est.detalhe, html = d.cartao || "";
      var temArv = ehArr(r.atividades) && !(r.exec && r.exec.erro), temF = temArv && this.temFolhas(r);
      if (!temArv) det = "etapa";
      var nCrit = (r.caminhoCritico || []).length;
      // cabeçalho de sempre (as e2e e a suíte de render leem estes textos)
      /* ⚠ o prazo é 17/600 por CLASSE (era `<b style="font-size:16px">`: 16 não
         existe na régua e o `<b>` pedia 700, que desenha 600).
         ⚠ `gap: 6px 12px`, e não `18px`. (1) Quando a linha quebra, o `gap`
         único abria 18 px ENTRE AS LINHAS. (2) Com o prazo em 17 px, na OBRA
         TESTE a 1366 o chip da Saúde deixava de caber e descia — 30 px a mais.
         Somados à 2ª linha da barra (D1), punham a 1ª barra do Gantt a 2 px da
         dobra a 1366×768 (medido 750–766; na 1.2.77, 666–682). */
      html += '<div class="flex" style="gap:6px 12px;margin-bottom:4px;align-items:baseline;flex-wrap:wrap"><b class="cx-prazo">⏱ ' + r.totalDias + ' dias úteis (~' + r.totalSemanas + ' semanas)</b>' +
        '<span class="muted">' + r.dataInicio.toLocaleDateString("pt-BR") + ' → ' + r.dataFim.toLocaleDateString("pt-BR") + '</span>' +
        '<span class="pill cx-pill-crit" title="Etapas sem folga: atrasar qualquer uma delas atrasa a entrega da obra.">caminho crítico: ' + nCrit + ' de ' + r.etapas.length + ' etapa' + (r.etapas.length === 1 ? '' : 's') + '</span>' +
        (r.temCiclo ? '<span class="pill cx-pill-ciclo" title="Uma etapa depende de outra que, por sua vez, depende dela. O elo que fecha o laço foi ignorado no cálculo.">dependência circular — elo ignorado; revise a coluna “Depende de”</span>' : '') +
        (d.pillFeriados || '') +
        this.pillOpcionais(r) +
        /* ⚠ O CHIP DA SAÚDE MORA AQUI, e não num bloco próprio: esta linha
           tinha 209 px livres à direita a 1366 (medido: 877 de 1086), e o
           bloco fechado custava 42 px que puseram a 1ª barra do Gantt abaixo
           da dobra. Ver csChip. */
        this.csChip(d, est) +
        /* PLANEJADOR 2A: o segundo número do prazo (tarefas sem preço), a
           pílula das frentes, o avanço até a data de corte e o chip de
           compatibilidade. Sem nenhuma extensão, tudo isso é "" e a linha
           sai byte a byte a de hoje. */
        this.prazoExtensoes(d, est) +
        this.compatChip(d, est) +
        /* as ações REGISTRADAS na linha do prazo (planejador, T20), DEPOIS do
           conteúdo de hoje e na ordem do registro; sem registro, "" — a linha
           de sempre, byte a byte */
        this._prazoRegistrados(d, est) + '</div>';
      /* a faixa D-PENDENTE fica SEMPRE à vista (ela muda as datas NESTA
         versão: sem início fixo, tarefa sem preço, calendário, "o mais tarde
         possível" e avanço não ficam gravados para quem tem versão anterior).
         A de compatibilidade só abre pelo chip. */
      if (d.portaInicio) html += '<div class="cx-aviso cx-pendente">' + d.portaInicio + '</div>';
      html += this.compatFaixa(d, est);
      /* A SAÚDE DO CRONOGRAMA VEM ANTES DO GANTT, e não depois: ela é a
         resposta a "este cronograma fecha?", que é a pergunta de quem abre a
         aba. Embaixo do Gantt e da tabela, o cartão cairia abaixo da dobra a
         1366×768 e viraria número que ninguém lê. E as três ações que ele
         resolve (conferir a fundo, sugerir a sequência, replanejar) moram
         DENTRO dele — botão solto entre o cabeçalho e a tabela é o ponto morto
         onde ação nova não é encontrada (memória "ação mora no card do número"). */
      html += this.saudePainel(d, est);
      /* seletor + interruptor + a nota do agente numa linha só: em três
         linhas (medido por foto a 1366×768) o Gantt começava abaixo da dobra */
      /* ⚠ (1C, auditoria A2) a nota "estimado pelo agente · edite duração e
         dependências na tabela" SAIU: ela ignorava a grade do Gantt e mandava
         editar só na tabela. A origem de cada duração está na legenda de
         baixo (∑ ✎ ≈ R$), que sai das mesmas FONTES da célula. */
      /* PLANEJADOR 2A: "Camadas ▾" e o seletor Planejar | Avançar entram
         NESTA linha, ao lado do seletor de detalhe — e não numa barra nova:
         a 1366 uma linha a mais punha a 1ª barra do Gantt abaixo da dobra
         (o mesmo motivo do chip da Saúde morar na linha do prazo). */
      html += '<div class="flex" style="gap:6px 12px;margin-bottom:4px;align-items:center;flex-wrap:wrap">' + (temArv ? this.seletorDetalhe(det) + (temF ? this.interruptor(r) : '') : '') +
        this.modoAvancoBotoes(d, est) + this.camadasBotao(d.camadas) + '</div>';
      html += this.modoAvancoFaixa(d, est);
      if (r.exec && r.exec.erro) html += '<div class="cx-aviso">' + esc(r.exec.erro) + '</div>';
      /* ⚠ os avisos das subetapas vão LOGO ABAIXO do Gantt, antes da tabela:
         em cima dele custavam ~60 px e, somados à faixa e ao cartão, a 1ª barra
         caía abaixo da dobra a 1366×768 (medido: y=898). */
      /* ⚠ O AVISO DO APROVADO VAI NA FRENTE DA FILA, E A PORTA É DECIDIDA SOBRE
         A LISTA INTEIRA. Roteiro do defeito (medido na revisão de 11/09/2026):
         num aprovado com 6 etapas em dependência circular, os avisos saíam
         `ciclo × 6, comprimida, aprovado-gravado` — o do aprovado era o 8º,
         caía no "e mais 3 aviso(s)", e como `temAprov` só era marcado DENTRO
         do `slice(0, 5)` o botão [Criar revisão] nem era desenhado. A pessoa
         ficava com a data divergindo, sem recado e sem porta: trava sem saída
         é o que faz a pessoa procurar saída errada (skill dinheiro, regra 6).
         Sem `sort` de propósito — ordenação estável não é garantida em ES5, e
         a ordem relativa dos outros avisos é a do motor. */
      var todosAv = arr(r.exec && r.exec.avisos), htmlAv = "", temAprov = false;
      var avisos = [], _outros = [];
      todosAv.forEach(function (a) {
        if (a && a.tipo === "aprovado-gravado") { temAprov = true; avisos.push(a); }
        else _outros.push(a);
      });
      avisos = avisos.concat(_outros);
      /* a frase da obra só sai quando a faixa da obra EXISTE nesta tela: sem
         Gestão (ou sem obra ligada) ela é desenhada como texto morto e manda
         por um caminho que não está ali (memória "porta prometida precisa
         existir") */
      var _temFaixaObra = !!(d.obra && d.obra.podeGestao && arr(d.obra.obras).length);
      if (avisos.length) {
        htmlAv += '<div class="cx-aviso"><b>Subetapas:</b><ul class="cx-lista">';
        avisos.slice(0, 5).forEach(function (a) {
          var msg = a.msg;
          /* ⚠ APROVADO: a data é a GRAVADA e ela NÃO muda (o motor congela —
             Cronograma.congeladoPorAprovacao, 12/09/2026). O recado do motor
             já diz os dois números; aqui entra só a PORTA que existe, porque
             recado de trava sem saída faz a pessoa procurar saída errada.
             Antes deste passo a tela dizia "esta tela usa o vão novo, mas os
             outros aparelhos imprimem o gravado" — duas entregas para a mesma
             proposta aprovada; agora é uma só, a do contrato. */
          if (a.tipo === "aprovado-gravado") {
            msg = String(a.msg || "") + " Para trabalhar com o prazo novo, crie uma revisão" +
              (_temFaixaObra ? " (com obra ligada, a porta de replanejar a obra está na linha de cima)." : ".");
          }
          htmlAv += '<li>' + esc(msg) + '</li>';
        });
        if (avisos.length > 5) htmlAv += '<li>e mais ' + (avisos.length - 5) + ' aviso(s)</li>';
        htmlAv += '</ul>' + (temAprov ? '<button class="btn sm" data-acao="crono-revisao" title="Cria a revisão deste orçamento aprovado (o aprovado fica intacto) e abre ela">Criar revisão</button>' : '') + '</div>';
      }
      /* ⚠ OS AVISOS DAS DATAS FIXADAS (o mapa `restricoes`, escrito pelo
         arrasto no Gantt) TÊM CAIXA PRÓPRIA. O motor os produz em
         `r.restricoes.avisos` desde 12/09/2026 e NENHUMA tela os desenhava:
         arrastar uma barra e depois apagar a etapa deixava a data fixada
         apontando para o vazio, o motor a ignorava e ninguém era avisado —
         o cronograma simplesmente não obedecia a data que a pessoa fixou.
         Caixa separada, e não a de "Subetapas:", porque o assunto não é
         subetapa: rótulo que mente manda procurar no lugar errado. */
      var avRest = arr(r.restricoes && r.restricoes.avisos), htmlRest = "";
      /* ⚠ A DATA FIXADA QUE MANDA TAMBÉM ENTRA NA CAIXA, COM A PORTA (F6).
         Roteiro do defeito (EDICAO.md, foto 09, OBRA TESTE): arrastar a etapa 4
         gravou "não iniciar antes de 12/01/2028" — um campo que a tabela não
         mostra —, e digitar "Depende de = 1" gravou, mas a etapa CONTINUOU em
         12/01/2028, sem recado e sem caixa (a data era válida, então não havia
         aviso). Quem digita acha que o campo não funciona. O recado da
         digitação cita [Soltar a data] "na caixa abaixo do Gantt": a porta
         prometida tem de existir (memória "porta prometida precisa existir").
         No aprovado não há botão: a soltura seria recusada pela trava. */
      var fixas = [], GuR = GU();
      if (GuR && typeof GuR.dataFixadaDomina === "function") {
        arr(r.etapas).forEach(function (et, ix) {
          var dom = null;
          try { dom = et ? GuR.dataFixadaDomina(r, et.id) : null; } catch (eDF) { dom = null; }
          if (dom) fixas.push({ et: et, n: ix + 1, dom: dom });
        });
      }
      if (avRest.length || fixas.length) {
        htmlRest += '<div class="cx-aviso"><b>Datas fixadas no Gantt:</b><ul class="cx-lista">';
        avRest.slice(0, 5).forEach(function (a) { htmlRest += '<li>' + esc((a && a.msg) || "") + '</li>'; });
        if (avRest.length > 5) htmlRest += '<li>e mais ' + (avRest.length - 5) + ' aviso(s)</li>';
        fixas.forEach(function (fx) {
          htmlRest += '<li>' + esc(fx.n + " " + String(fx.et.nome || "") + ": começa em " + fx.dom.dataBR + " porque a data foi fixada no Gantt (não iniciar antes de " + fx.dom.dataBR +
            "). Sem ela, a etapa seguiria o “Depende de”.") +
            (d.travado ? '' : ' <button type="button" class="btn sm" data-acao="crono-soltar-data" data-id="' + esc(fx.et.id) + '" title="' +
              esc("Apaga a data fixada de " + fx.n + " " + String(fx.et.nome || "") + ": a etapa volta para onde a rede (o “Depende de” e as durações) a põe.") + '">Soltar a data</button>') + '</li>';
        });
        htmlRest += '</ul></div>';
      }
      /* GANTT INTERATIVO (12/09/2026): a aba passou a desenhar o `ganttPro` —
         duas camadas, zoom, rolagem e arrasto — nos DOIS detalhes. O desenho
         das barras continua sendo o mesmo `gantt()`; o que muda é a moldura.
         ⚠ O PDF, a proposta, o MS Project e o painel previsto × realizado
         seguem no `gantt()` sem `opts.pro` (e `d.ganttEtapa`/UI._gantt), que
         é a saída de sempre — o documento não tem mouse nem rolagem.
         ⚠ Sem o motor do Gantt interativo o próprio `ganttPro` cai no desenho
         de sempre: a aba nunca fica sem cronograma por causa de um arquivo
         novo que o cache não trouxe. */
      /* ⚠ O ESTADO DO GANTT É MONTADO AQUI E REAPROVEITADO nos dois painéis de
         baixo: é dele que saem `pxDia`, `larguraConteudo` e a largura da coluna
         de nomes. Montado duas vezes (um para o Gantt, outro para o
         histograma), um zoom aplicado no primeiro deixaria o segundo na escala
         anterior — e o gráfico de gente sairia deslocado do cronograma. */
      /* ⚠ AS PREFERÊNCIAS DE TAMANHO ENTRAM AQUI, NO DESENHO PURO (F3). Roteiro
         do defeito (experimento C da REDIMENSIONAR.md): o corpo arrastado para
         700 px voltava a 520 no primeiro render — digitar uma duração redesenha
         a aba e o desenho puro não sabia da escolha. `d.gx` é montado pelo
         ui.js com `Paineis.opcoesGantt` (a MESMA conta que a fiação usa ao
         remedir); sem as fatias que criam PaineisUI/GanttGradeUI/App._janela
         tudo aqui é vazio e o desenho é o da 1.2.77. */
      var og = (d.gx && typeof d.gx === "object") ? d.gx : {};
      /* PLANEJADOR 2A — as TOMADAS (T7). Cada uma `null`/ausente = o desenho
         de sempre, byte a byte: `intercalarExtras` devolve null sem tarefa
         sem preço, `barraDoPlanejador` devolve null sem extra e sem avanço, e
         `camadaDoPlanejador` devolve null quando nenhuma camada tem o que
         desenhar. */
      var cam2A = d.camadas;
      var oGx = { detalhe: det, abertas: est.abertas, hoje: est.hoje,
        intercalar: this.intercalarExtras(r), barraDe: this.barraDoPlanejador(r, cam2A),
        camadas2A: this.camadaDoPlanejador(r, cam2A, { cron: d.cron }),
        eloRotulos: cam2A == null ? true : this.camadasNorm(cam2A).rotulos,
        modoAv: d.modoAv, plano: !!d.plano, cron: d.cron,
        travado: !!d.travado, nivel: est.zoom.nivel, diasAjuste: est.zoom.diasAjuste, sel: est.zoom.sel, desfazer: est.zoom.desfazer,
        labelPref: og.labelPref, alturaPref: og.alturaPref, colunas: d.colunas === true, janelaAltura: d.janelaAltura,
        modo: d.modo, alcas: d.alcas === true, alcaNomes: og.alcaNomes, hxAltura: og.hxAltura, fxAltura: og.fxAltura };
      /* A BUSCA E O FILTRO (1C). `d.filtroUso` é montado pelo ui.js com o
         painel da obra (`filtroDoRender`); ⚠ a MESMA resolução vai ao Gantt,
         à tabela e à fiação do arrasto (memo por render). Sem ele (o PDF, a
         ficha, as suítes do desenho), nada muda. */
      var fu = d.filtroUso || null, uso = est.uso || null;
      if (fu) {
        oGx.manter = fu.manter; oGx.contexto = fu.contexto; oGx.fora = fu.fora;
        var bIds = fu.busca ? arr(fu.busca.ids) : [];
        if (bIds.length) {
          var rl = {}, Fn = MOD("CronoFiltro", "./cronofiltro.js");
          /* o ATUAL é da lista que a navegação visita (só os da tela) */
          var navI = Fn ? Fn.navegaveis(fu.busca, fu.manter).ids : bIds;
          bIds.forEach(function (x) { rl[x] = true; });
          oGx.realce = rl;
          oGx.atual = navI.length ? navI[Math.min(uso ? uso.busca.idx : 0, navI.length - 1)] : null;
        }
        if (uso) {
          var cats = {}, lsC = this.linhas(r, { detalhe: det, abertas: {} });
          lsC.forEach(function (l) { var n = l.no || l.et; if (n && n.categoria != null && !own(cats, n.categoria)) cats[n.categoria] = n.categoriaNome || ((C() && C().cat) ? (C().cat(n.categoria) || {}).nome : "") || n.categoria; });
          uso.categorias = Object.keys(cats).sort().map(function (k) { return { id: k, nome: String(cats[k]) }; });
          oGx.topoUso = this.ganttBarraUso(uso, null, { fu: fu });
        }
      }
      var proGx = this.ganttProEstado(r, oGx);
      oGx.pro = proGx;
      if (fu && fu.res && fu.res.ativo && !fu.res.visiveis) {
        /* ⚠ FILTRO QUE ZERA A LISTA: a moldura com a barra e o recado com a
           porta — nunca uma moldura vazia (USO §3.1, casos de borda) */
        html += '<div class="gx gx-vazio" data-gx-vazio="1">' + (oGx.topoUso || "") +
          '<div class="gx-vazio-txt">Nenhuma linha passa neste filtro. <button type="button" class="gx-uso-bt" data-acao="crono-filtro-limpar">Limpar filtro</button></div></div>';
      } else html += this.ganttPro(r, oGx);
      /* AS DUAS OUTRAS LEITURAS DO MESMO CRONOGRAMA, encostadas embaixo dele e
         no MESMO eixo de tempo: quantas pessoas por semana (histograma) e em
         que ritmo as equipes sobem (linha de balanço). Ficam aqui, e não em
         sub-aba própria, porque são leituras do desenho que está logo acima —
         sub-aba para algo que só existe em obra repetitiva seria aba morta na
         maioria dos orçamentos. Fechadas, custam uma linha cada. */
      html += this.histogramaPainel(d, est, proGx);
      html += this.lobPainel(d, est, proGx);
      /* ⚠ A TERCEIRA LEITURA DO MESMO CRONOGRAMA: o MACROFLUXO. Ao contrário
         das duas de cima, ele NÃO compartilha o eixo de tempo (não é um
         gráfico de tempo: é a rede em camadas de ELOS), e é por isso que ele
         não recebe a escala do Gantt. Fechado custa uma linha. */
      html += this.fluxoPainel(d, est, proGx);
      html += htmlAv + htmlRest;
      if (temArv && det !== "etapa") {
        var semSub = r.atividades.filter(function (n) { return n.tipo === "etapa" && n.papel === "folha"; }).length;
        if (semSub) html += '<div class="muted cx-legenda" style="margin-top:8px">' + semSub + ' etapa(s) sem subetapas: o cronograma detalha até onde a planilha detalha — use <b>+ subetapa</b> na linha da etapa para criar subetapas na planilha.</div>';
      }
      /* a TABELA mostra a mesma lista filtrada, com a mesma faixa (decisão k2) */
      if (fu && fu.res && fu.res.ativo) html += this.filtroFaixaHtml(fu, "tabela");
      html += this.tabela(r, d, fu && fu.manter ? { detalhe: det, abertas: est.abertas, temF: temF && det !== "etapa", manter: fu.manter }
        : { detalhe: det, abertas: est.abertas, temF: temF && det !== "etapa" });
      /* ⚠ A LEGENDA DOS ÍCONES DA COLUNA DURAÇÃO (14/09/2026): ∑ ✎ ≈ R$ só
         existiam no `title` de cada célula, e ninguém passa o mouse em 40
         linhas para descobrir o que um símbolo quer dizer. Os símbolos e as
         frases saem do próprio FONTES — a legenda não tem como discordar da
         célula. */
      var legF = [["subetapas", "vão das subetapas"], ["usuario", "digitada"], ["estimado", "estimada pelo agente"], ["custoMO", "pelo custo de mão de obra"], ["ia", "sugerida pela IA"], ["exec", "do Hh SINAPI"]]
        .map(function (p) { return '<span class="cx-fonte">' + esc(FONTES[p[0]][0]) + '</span>' + esc(p[1]); }).join(' · ');
      html += '<div class="muted cx-legenda"><b>Duração:</b> ' + legF + '.<br><b>Depende de:</b> nº das etapas que precisam terminar antes (ex.: <code>1,3</code>). Vazio = a etapa anterior · <code>0</code> = começa no início da obra · <code>1+7</code> = espera 7 dias úteis depois da 1ª (cura, secagem) · <code>1-3</code> = começa 3 dias antes de a 1ª acabar · sem lag, vale a sobreposição do paralelismo. <b>Duração 0</b> = marco (◆). <b>Folga:</b> quanto a etapa pode atrasar sem mudar a entrega — folga zero é o caminho crítico.' +
        (temF ? '<br><b>Subetapas:</b> com “Detalhar o prazo pelas subetapas” ligado, duração, equipes e “Depende de” das subetapas são editáveis e a etapa passa a durar o vão delas; desligado, elas são desenhadas dentro da duração da etapa (só leitura). “Depende de” da subetapa usa o nº da MESMA etapa: <code>2.1</code>, <code>2.g</code> (serviços gerais da etapa), <code>2.1+3</code> espera, <code>2.1-1</code> avanço, <code>2.1II</code> começa junto (início-início), <code>0</code> = início da etapa. Não há elo entre subetapas de etapas diferentes — o elo entre etapas fica na linha da etapa.' : '') + '</div>';
      html += '<div class="muted cx-legenda" style="margin-top:8px">A planilha Excel do orçamento leva este cronograma por etapa, com fórmulas vivas (aba Gantt).</div>';
      return html;
    },

    /* Motivo pelo qual a duração da ETAPA não se edita (ou null). ⚠ No modo
       executivo a etapa com subetapas dura o vão delas: um número digitado ali
       seria regravado no próximo salvar — a pessoa veria 10 e o PDF sairia
       com 14. A tela deixa só leitura e o handler recusa com o motivo.
       `nos` = r.atividades de Cronograma.estimar(orc, null, {eap:true}) — é
       a `fonte` do nó que diz se o VÃO manda. ⚠ Não basta "tem subetapa"
       (papel resumo): na etapa cujas subetapas são TODAS marco não há vão, o
       motor usa o que se digita nela, e a trava virava trava sem porta com
       recado falso ("é o vão das subetapas (4 dias)") — achado no navegador. */
    motivoEtapaTravada: function (cron, nos, etapaId) {
      if (!(cron && cron.exec && cron.exec.rede === true)) return null;
      var n = null;
      arr(nos).forEach(function (x) { if (x.tipo === "etapa" && x.id === etapaId) n = x; });
      if (!n || n.fonte !== "subetapas") return null;
      return "No modo executivo a duração da etapa " + n.numero + " (" + corta(n.nome, 40) + ") é o vão das subetapas (" + n.duracao + " dias) — edite a duração das subetapas dela, ou desligue “Detalhar o prazo pelas subetapas”. Nada foi gravado.";
    },

    tabela: function (r, d, o) {
      /* `o.manter` (1C): a MESMA lista filtrada do Gantt; ausente = a de sempre */
      /* ⚠ A MESMA LISTA DO GANTT (T7): com `intercalar`, as linhas das tarefas
         sem preço entram aqui também. Em um só dos dois, a pessoa veria a
         barra T no desenho e não acharia a linha para digitar. */
      var self2A = this;
      var Cr = C(), det = o.detalhe;
      var L = this.linhas(r, { detalhe: det, abertas: o.abertas, intercalar: this.intercalarExtras(r), manter: o.manter || null });
      var rede = !!(r.exec && r.exec.rede);
      var iaM = d.iaMotivos || {}, ab = o.abertas || {}, multi = ehData(r.dataInicio) && ehData(r.dataFim) && r.dataInicio.getFullYear() !== r.dataFim.getFullYear();
      /* PLANEJADOR 2A — as colunas que só nascem quando o dado existe:
           "Data pedida": alguma tarefa com restrição de data;
           % · Início real · Fim real: só no modo Avançar do plano da obra.
         Coluna vazia é largura roubada de quem não usa a função — e a tabela
         sem extensão nenhuma continua a de sempre, byte a byte. */
      var temRestr2A = false, iR, _ets = arr(r.etapas), _nos = arr(r.atividades);
      for (iR = 0; iR < _ets.length && !temRestr2A; iR++) if (_ets[iR] && _ets[iR].restricao) temRestr2A = true;
      for (iR = 0; iR < _nos.length && !temRestr2A; iR++) if (_nos[iR] && _nos[iR].restricao) temRestr2A = true;
      var colAv2A = !!(d.plano && d.modoAv === "avancar");
      /* o ⋯ só com a fiação (`d.camadas` vem do App): três pontinhos que não
         abrem nada são porta que não existe */
      var menu2A = d.camadas != null;
      function menuBt(id, nome) {
        if (!menu2A) return "";
        return ' <button type="button" class="cx-menu-bt" data-acao="crono-extra-menu" data-id="' + esc(String(id)) +
          '" title="' + esc("Mais opções de " + String(nome || "") + ": restrição de data, calendário da frente e tarefa sem preço abaixo.") +
          '" aria-label="Mais opções desta linha">⋯</button>';
      }
      function celRestr(no2) {
        if (!temRestr2A) return "";
        var rs2 = no2 && no2.restricao;
        if (!rs2) return '<td class="num">—</td>';
        var Gu2 = GU(), rot2 = (Gu2 && Gu2._ROT_RESTR && Gu2._ROT_RESTR[rs2.tipo]) ? Gu2._ROT_RESTR[rs2.tipo] : String(rs2.tipo || "");
        var daMaq = !!(d.cron && ehObj(d.cron.restricoes) && ehObj(d.cron.restricoes[no2.id]) && d.cron.restricoes[no2.id].origem === "mat");
        return '<td class="num cx-td-restr"><span class="' + (rs2.estourada ? "cx-restr-nok-tx" : (daMaq ? "cx-restr-mat-tx" : "")) + '" title="' +
          esc(rot2 + " " + (rs2.data ? dmaS(rs2.data) : "—") +
            (rs2.estourada ? " — NÃO é cumprida: o plano de hoje termina depois. A restrição avisa; ela não encurta a tarefa nem empurra as outras." : "") +
            (daMaq ? " — escrita pelo app para que aparelhos de versão anterior desenhem a mesma data; o próximo salvar a reescreve." : "")) + '">' +
          (rs2.estourada ? "⚠ " : (daMaq ? "⧗ " : "")) + esc(rs2.data ? dmaS(rs2.data) : rot2) + '</span></td>';
      }
      function celAv(no2) {
        if (!colAv2A) return "";
        var av2 = no2 && no2.avanco;
        if (!av2 || av2.estado === "nao-iniciada") return '<td class="num">—</td><td class="num">—</td><td class="num">—</td>';
        return '<td class="num" title="' + esc((self2A.AV_FONTE[av2.fonte] || "digitado") + (av2.em ? " · lançado em " + dmaS(av2.em) : "")) + '">' + nBR(fin(av2.pct, 0), 1) + '%</td>' +
          '<td class="num">' + (av2.iniReal ? esc(dmaS(av2.iniReal)) : "—") + '</td>' +
          '<td class="num">' + (av2.fimReal ? esc(dmaS(av2.fimReal)) : "—") + '</td>';
      }
      /* a folga LIVRE ao lado da total: "posso atrasar 8 dias" e "posso
         atrasar 8 dias SEM empurrar ninguém" são decisões diferentes, e é a
         segunda que responde "dá para tirar a equipe daqui?" */
      function celFolga(no2, critFn) {
        if (no2.critico) return '<td class="num">' + critFn(no2) + '</td>';
        var fr2 = fin(no2.folgaReal, 0);
        if (fr2 < 0) return '<td class="num"><span class="cx-folga-neg-tx" title="' +
          esc("folga negativa: a data prometida já não é cumprida por esta cadeia (" + fr2 + " dias úteis)") + '">' + fr2 + ' d</span></td>';
        var fl = fin(no2.folgaLivre, -1), tot = no2.folga || 0;
        return '<td class="num">+' + tot + ' d' +
          (fl >= 0 && fl !== tot ? ' <span class="muted cx-mini" title="' +
            esc("folga livre: atrasar até " + fl + " dia(s) útil(eis) não empurra NENHUMA outra tarefa") + '">(livre ' + fl + ')</span>' : "") + '</td>';
      }
      var ano = multi ? "" : (ehData(r.dataInicio) ? " (" + r.dataInicio.getFullYear() + ")" : "");
      var numPorId = {}, numF = {}, folhasEt = {}, noEtapa = {};
      r.etapas.forEach(function (e, i) { numPorId[e.id] = i + 1; });
      arr(r.atividades).forEach(function (n) {
        if (n.tipo === "etapa") noEtapa[n.id] = n;
        if (n.numero) numF[n.id] = n.numero;
        if (n.tipo === "subetapa" || n.tipo === "soltos") { if (!own(folhasEt, n.etapaId)) folhasEt[n.etapaId] = []; folhasEt[n.etapaId].push(n); }
      });
      /* ⚠ a "crítica" pedia 700 em linha e herdava o Mono do `td.num`: o Mono
         só tem 400–500, e ela desenhava MAIS LEVE que o texto ao lado. Classe
         + `.pill` em Sans (app.css) = 600 de verdade. */
      function crit(n) { return '<span class="pill cx-pill-crit" title="Sem folga: atrasar isto atrasa a obra inteira.">crítica</span>'; }
      /* `base` troca a frase padrão da fonte mantendo o MESMO símbolo: no
         orçamento aprovado o ∑ continua valendo (a duração veio das subetapas),
         mas "Duração = vão das subetapas" passaria a mentir — ali o número é o
         do dia da aprovação, não o de hoje. */
      function fonte(f, extra, base) {
        var F = FONTES[f]; if (!F) return "";
        return ' <span class="cx-fonte" title="' + esc((base || F[1]) + (extra ? " — " + extra : "")) + '">' + esc(F[0]) + '</span>';
      }
      var html = '';
      if (o.temF) html += '<div class="flex" style="gap:8px;margin-top:12px;justify-content:flex-end"><button class="btn sm ghost" data-acao="crono-abrir" data-etapa="*" data-valor="1">Expandir tudo</button><button class="btn sm ghost" data-acao="crono-abrir" data-etapa="*" data-valor="0">Recolher tudo</button></div>';
      html += '<div class="cx-tabela"><table class="tbl cx-eap" style="margin-top:' + (o.temF ? 4 : 12) + 'px"><thead><tr><th>Etapa</th><th>Categoria (agente)</th><th class="num" title="Equipe-dias estimados. Na subetapa, no modo executivo: o nº de equipes trabalhando nela.">Eq-dias</th><th class="num" title="Dias úteis. 0 = marco (entrega, vistoria, liberação): sem barra, um losango no Gantt.">Duração (d)</th>' +
        '<th class="num" title="Nº das etapas que precisam terminar antes desta (ex.: 1,3). Vazio = a anterior; 0 = começa no início da obra. 1+7 = 7 dias úteis depois da 1ª; 1-3 = começa 3 dias antes de a 1ª acabar.">Depende de</th>' +
        (temRestr2A ? '<th class="num" title="A data que alguém pediu para esta tarefa (não iniciar antes de, deve terminar em…). ⚠ = a data NÃO é cumprida pelo plano de hoje; ⧗ = o app escreveu essa data para aparelhos de versão anterior.">Data pedida</th>' : '') +
        '<th class="num" title="Quanto a etapa pode atrasar sem mudar a entrega. Folga zero = caminho crítico.">Folga</th><th>Início' + ano + '</th><th>Fim</th>' +
        (colAv2A ? '<th class="num" title="% concluído na data de corte do avanço (não hoje).">%</th><th class="num" title="O dia em que a tarefa começou de verdade.">Início real</th><th class="num" title="O último dia trabalhado. Preenchido, a tarefa está concluída.">Fim real</th>' : '') +
        '</tr></thead><tbody>';
      L.forEach(function (l) {
        if (l.tipo === "etapa") {
          var e = l.et, i = l.i, no = l.no, c = Cr.cat(e.categoria);
          /* ⚠ com a T que segura a etapa (Cronograma.textoDependeDe) */
          var valPred = (typeof Cr.textoDependeDe === "function") ? Cr.textoDependeDe(e, numPorId) : (e.predsExplicito ? Cr.predsTexto(e, numPorId) : "");
          /* ⚠ no detalhe "Etapa" a linha vem SEM nó (l.no null): o nó da árvore
             ainda diz a fonte — sem ele o campo da etapa com subetapas saía
             com a caixa azul de "editado", parecia o MAIS editável da tabela, e
             digitar era recusado (achado da revisão da Fase 2) */
          var noEt = no || (own(noEtapa, e.id) ? noEtapa[e.id] : null);
          var resumo = no && no.papel === "resumo";
          // ⚠ trava só onde o VÃO manda (fonte "subetapas"): ver motivoEtapaTravada
          var travada = rede && !!noEt && noEt.fonte === "subetapas";
          var ctrl = "";
          if (no && det !== "etapa") {
            if (resumo || (det === "servico" && no.filhos && no.filhos.length))
              ctrl = '<button class="cx-chev" data-acao="crono-abrir" data-etapa="' + esc(e.id) + '" title="' + (ab[e.id] === false ? 'Expandir' : 'Recolher') + ' esta etapa" aria-expanded="' + (ab[e.id] === false ? 'false' : 'true') + '">' + (ab[e.id] === false ? '▸' : '▾') + '</button>';
            if (!resumo) ctrl += '<button class="cx-detsub" data-acao="crono-detalhar" data-etapa="' + esc(e.id) + '" title="Detalhar em subetapas: abre a planilha para criar uma subetapa nesta etapa. O cronograma detalha até onde a planilha detalha." aria-label="Detalhar em subetapas">+ subetapa</button>';
          }
          var numEap = (no && codNum(e.codigo) !== String(i + 1)) ? '<span class="cx-n">' + (i + 1) + '</span>' : '';
          /* ⚠ APROVADO (12/09/2026): a duração da etapa é a data APROVADA, não
             o vão de hoje (o motor marca `congelado`/`vaoHoje`). Sem separar os
             dois casos, a linha que mostra 6 dias dizia "é o vão das subetapas
             (6 dias)" e o ícone dizia "vão de 15 dia(s)" — dois números
             discordando na mesma linha, e o da proposta não era nenhum deles. */
          var congEt = !!(noEt && noEt.congelado);
          /* ⚠ VÃO ZERO NÃO SE ESCREVE COMO NÚMERO. Com todas as subetapas em
             marco o vão é 0, e "as subetapas hoje dariam 0 dias" se lê como
             defeito do sistema — é o caso da etapa aprovada que a revisão de
             11/09/2026 encontrou caindo no recado errado. */
          var _vh = congEt ? (noEt.vaoHoje != null ? noEt.vaoHoje : e.duracao) : 0;
          var vaoHojeTxt = congEt && _vh === 0
            ? "hoje as subetapas são todas marco — elas não dão vão nenhum"
            : "as subetapas hoje dariam " + _vh + " dia(s)";
          /* ⚠ O MOTIVO DA IA SAI DO `CronoPlan.textoIA` (revisão 4, O31), e
             NUNCA de `cronograma.iaMotivos` cru. Roteiro do defeito que isto
             fecha: com a porta (1) do teto de 60 KB, o plano guarda só a
             MARCA — o texto "motivo não guardado (limite do plano)" — e o
             texto de verdade fica no orçamento de origem. Lendo o mapa cru, a
             tela mostraria essa marca como se fosse a justificativa da IA, e
             a pessoa leria "não guardado" numa etapa cujo motivo está a um
             clique. Sem a fiação nova (`d.cron`), `motivoIA` devolve vazio e
             a leitura crua de sempre continua valendo. */
          var iaEt = self2A.motivoIA(d, "etapa", e.id);
          var fonteEt = (iaEt.titulo || iaM[e.id]) ? ' <span title="' + esc(iaEt.titulo || ("🤖 IA: " + String(iaM[e.id]))) + '" style="cursor:help">' + ic('ia') + '</span>'
            : (noEt && (noEt.fonte === "usuario" || noEt.fonte === "exec" || noEt.fonte === "subetapas")
              ? (congEt && noEt.fonte === "subetapas"
                ? fonte("subetapas", vaoHojeTxt,
                  "Duração = a data aprovada (o vão das subetapas no dia em que o orçamento foi aprovado)")
                : fonte(noEt.fonte, noEt.fonte === "subetapas" ? "vão de " + (noEt.vao != null ? noEt.vao : e.duracao) + " dia(s)" : "")) : "");
          var motivoTrava = congEt
            ? "Orçamento aprovado: esta é a data aprovada (" + e.duracao + " dias) e ela não muda — nem aqui, nem na proposta. " +
              (_vh === 0 ? "Hoje as subetapas são todas marco e não dão vão nenhum" : "As subetapas hoje dariam " + _vh + " dias") +
              "; para trabalhar com outro prazo, crie uma revisão."
            : (travada ? "No modo executivo a duração desta etapa é o vão das subetapas (" + e.duracao + " dias). Edite as subetapas abaixo, ou desligue “Detalhar o prazo pelas subetapas”." : "Dias úteis · 0 = marco");
          // ⚠ `<tr>` puro, data-cron-dur/data-cron-pred e a célula "codigo nome"</td>: ver a regra 1 do cabeçalho
          // ⚠ esc no id: ele vem também de pacote, backup e sincronização (dado de outro aparelho)
          /* ⚠ DURAÇÃO EM `type="text" inputmode="numeric"`, NUNCA `type="number"`
             (F6). Roteiro do defeito (medido no navegador na F4): o campo
             number entrega "" ao handler quando a pessoa digita "abc" e troca
             "2,5" por "2.5" antes de alguém ler. Com o contrato único da
             digitação (GanttUI.opsDaDigitacao), "" quer dizer "volta à
             estimativa": o "abc" digitado APAGARIA a duração calado, em vez de
             ser recusado com recado. `inputmode` mantém o teclado numérico no
             celular. A borda e a largura saem das classes `cx-in`/`cx-in-dig`
             da F5 (larguras por [data-*] no CSS); os `data-*` e o `readonly`
             são lidos por 9 suítes e ficam como estavam. */
          html += '<tr><td class="cx-nome">' + ctrl + numEap + esc(e.codigo) + ' ' + esc(e.nome) + (e.marco ? ' <span class="pill cx-pill-marco" title="Marco: evento sem duração (entrega, vistoria, liberação).">◆ marco</span>' : '') + menuBt(e.id, (i + 1) + " " + e.nome) + '</td>' +
            /* ⚠ badge de categoria: a COR vai no fundo e o texto é --texto
               (.cx-cat) — com o texto na cor da categoria, os tons claros
               (Demolição #9ca3af) davam ~2,5:1 */
            '<td><span class="pill cx-cat" style="background:' + c.cor + '22">' + esc(c.nome) + '</span></td>' +
            '<td class="num" title="Equipe-dias estimados da etapa">' + nBR(e.equipeDias, 1) + '</td>' +
            '<td class="num"><input class="cell cx-in' + (travada ? '' : (e.editado || e.marco ? ' cx-in-dig' : '')) + '" type="text" inputmode="numeric" data-cron-dur="' + esc(e.id) + '" value="' + e.duracao + '" title="' + esc(motivoTrava) + '"' + (travada ? ' readonly aria-readonly="true"' : '') + '>' + fonteEt + '</td>' +
            '<td class="num"><input class="cell cx-in' + (e.predsExplicito ? ' cx-in-dig' : '') + '" type="text" data-cron-pred="' + esc(e.id) + '" value="' + esc(valPred) + '" placeholder="' + (i > 0 ? i : '—') + '" title="Nº das etapas que precisam terminar antes (ex.: 1,3). Vazio = a anterior; 0 = começa no início da obra. 1+7 = espera 7 dias úteis; 1-3 = começa 3 dias antes."></td>' +
            celRestr(noEt || e) +
            celFolga(e, crit) +
            '<td>' + dm(e.dataInicio, multi) + '</td><td>' + dm(e.dataFim, multi) + '</td>' + celAv(noEt || e) + '</tr>';
          return;
        }
        var n = l.no, cat = Cr.cat(n.categoria);
        /* A LINHA T (tarefa sem preço, planejador 2A). Ela não é etapa nem
           subetapa: não tem categoria do orçamento (não tem preço), não tem
           Eq-dias e o "Depende de" dela aceita etapa E outra T. O responsável
           vem no lugar da categoria — é a informação que decide se aquele
           prazo é problema da construtora ou do contratante. */
        if (l.tipo === "extra") {
          var nmsT = {}, ordemT = arr(r.etapas).map(function (eT) { return eT && eT.id; });
          ordemT.forEach(function (eid, iT) { nmsT[eid] = iT + 1; });
          arr(r.extras).forEach(function (xT) { if (xT) nmsT[xT.id] = xT.numero; });
          var elosT = arr(n.preds).map(function (pT) {
            return { i: pT, t: (n.predTipo && n.predTipo[pT]) || "TI", l: (n.predLag && n.predLag[pT]) || 0, x: true };
          });
          var predT = (Cr && Cr._textoRede) ? String(Cr._textoRede(elosT, nmsT, { vazioExplicito: false }) || "") : "";
          var respT = self2A.RESP_T[String(n.resp || "")] || "a construtora";
          html += '<tr class="cx-t"><td class="cx-nome"><span class="cx-n cx-n-t">' + esc(String(n.numero || "T")) + '</span>' +
            '<input class="cell cx-in cx-in-nome" type="text" maxlength="80" data-crono-extra-nome="' + esc(n.id) + '" value="' + esc(String(n.nome || "")) +
            '" title="' + esc("O nome desta tarefa sem preço (até 80 caracteres).") + '">' +
            (n.marco ? ' <span class="pill cx-pill-marco">◆ marco</span>' : '') +
            (n.depoisDaEntrega ? ' <span class="pill cx-pill-t" title="' + esc("Esta tarefa termina DEPOIS da entrega da obra: ela não muda o prazo do contrato, mas alguém ainda a deve.") + '">depois da entrega</span>' : '') +
            (n.cicloDep ? ' <span title="Dependência circular — o elo de volta foi ignorado." style="color:#b45309;cursor:help">⟲</span>' : '') +
            menuBt(n.id, String(n.numero || "T") + " " + String(n.nome || "")) + '</td>' +
            '<td><span class="pill cx-pill-t" title="' + esc("Quem deve esta tarefa. Tarefa sem preço não tem custo no orçamento — ela só ocupa prazo." +
              (n.proposta ? " Aparece na proposta comercial." : " NÃO aparece na proposta comercial.")) + '">' + esc(respT) + (n.proposta ? " · na proposta" : "") + '</span></td>' +
            '<td class="num" title="' + esc("Tarefa sem preço não tem equipe-dias: ela não tem serviço no orçamento.") + '">—</td>' +
            '<td class="num"><input class="cell cx-in cx-in-dig" type="text" inputmode="numeric" data-crono-extra-dur="' + esc(n.id) + '" value="' + (n.marco ? 0 : n.duracao) +
            '" title="' + esc("Dias úteis · 0 = marco. A tarefa sem preço não tem estimativa: o número é seu.") + '"></td>' +
            '<td class="num"><input class="cell cx-in' + (elosT.length ? ' cx-in-dig' : '') + '" type="text" data-crono-extra-pred="' + esc(n.id) + '" value="' + esc(predT) +
            '" placeholder="início da obra" title="' + esc("Nº da etapa (1, 3), de outra tarefa sem preço (T1) · espera 3+5 · tipo 3TT · vazio = começa no início da obra.") + '"></td>' +
            celRestr(n) + celFolga(n, crit) +
            '<td>' + dm(n.dataInicio, multi) + '</td><td>' + dm(n.dataFim, multi) + '</td>' + celAv(n) + '</tr>';
          return;
        }
        if (l.tipo === "folha") {
          var irmas = folhasEt[n.etapaId] || [], pos = irmas.indexOf(n), mp = {};
          (n.preds || []).forEach(function (p) { mp[p] = numF[p]; });
          var predTxt = n.predsExplicito ? Cr.predsTextoSub(n, mp) : "";
          var durRede = n.marco ? 0 : (n.duracaoRede != null ? n.duracaoRede : n.duracao);
          var tituloLeitura = "Pela rede das subetapas: " + durRede + " d; desenhada com " + n.duracao + " d dentro da duração da etapa. Só leitura no modo padrão — para a etapa durar o que as subetapas pedem, ligue “Detalhar o prazo pelas subetapas”.";
          /* ⚠ duração DIGITADA na subetapa manda sobre as equipes: o campo
             aceitava 5 e nada acontecia, sem recado — o title diz, e o
             editarFolha devolve o recado ao gravar */
          var durDigF = n.duracaoDigitada != null;
          var celEq = rede
            ? '<input class="cell cx-in" type="number" min="1" max="50" data-crono-sub-eq="' + esc(n.id) + '" value="' + (n.equipes || 1) + '" title="' + esc(durDigF
              ? "A duração digitada nesta subetapa (" + n.duracaoDigitada + " d) manda — as equipes só contam depois de apagar a duração. Equipe-dias: " + nBR(n.equipeDias, 1)
              : "Equipes trabalhando nesta subetapa (vazio = as da obra). Equipe-dias: " + nBR(n.equipeDias, 1)) + '"' + (durDigF ? ' style="opacity:.6"' : '') + '><span class="muted" style="font-size:10px"> eq.</span>'
            : '<span title="' + esc("Equipe-dias: " + nBR(n.equipeDias, 1) + " · equipes: " + (n.equipes || 1)) + '">' + nBR(n.equipeDias, 1) + '</span>';
          var celDur = rede
            ? '<input class="cell cx-in' + (n.editado || n.marco ? ' cx-in-dig' : '') + '" type="text" inputmode="numeric" data-crono-sub-dur="' + esc(n.id) + '" value="' + durRede + '" title="Dias úteis da subetapa · 0 = marco · vazio = volta à estimativa">' + fonte(n.fonte === "estimado" ? "" : n.fonte)
            : '<span title="' + esc(tituloLeitura) + '">' + n.duracao + (n.escala === "escalada" && durRede !== n.duracao ? ' <span class="muted cx-mini">(rede ' + durRede + ')</span>' : '') + '</span>' + fonte(n.fonte === "estimado" ? "" : n.fonte);
          var celPred = rede
            ? '<input class="cell cx-in' + (n.predsExplicito ? ' cx-in-dig' : '') + '" type="text" data-crono-sub-pred="' + esc(n.id) + '" value="' + esc(predTxt) + '" placeholder="' + (pos > 0 ? esc(irmas[pos - 1].numero) : '—') + '" title="Nº de subetapas da MESMA etapa: 2.1, 2.g; 2.1+3 espera; 2.1-1 avanço; 2.1II começa junto; 0 = início da etapa; vazio = a anterior.">'
            : '<span class="muted" title="Só leitura no modo padrão">' + esc((n.preds && n.preds.length) ? Cr.predsTextoSub(n, mp) : "início") + '</span>';
          html += '<tr class="cx-f"><td class="cx-nome"><span style="padding-left:22px"></span><span class="cx-n">' + esc(n.numero) + '</span>' + esc(n.nome) +
            (n.marco ? ' <span class="pill cx-pill-marco">◆ marco</span>' : '') +
            (n.comprimida ? ' <span title="A etapa é curta demais para as subetapas: no desenho elas se sobrepõem além do que a rede pede." style="color:#b45309;cursor:help">⚠</span>' : '') +
            (n.cicloDep ? ' <span title="Dependência circular entre subetapas — o elo de volta foi ignorado." style="color:#b45309;cursor:help">⟲</span>' : '') + menuBt(n.id, n.numero + " " + n.nome) + '</td>' +
            '<td><span class="pill cx-cat" style="background:' + cat.cor + '22">' + esc(cat.nome) + '</span></td>' +
            '<td class="num">' + celEq + '</td><td class="num">' + celDur + '</td><td class="num">' + celPred + '</td>' +
            celRestr(n) + celFolga(n, crit) +
            '<td>' + dm(n.dataInicio, multi) + '</td><td>' + dm(n.dataFim, multi) + '</td>' + celAv(n) + '</tr>';
          return;
        }
        // serviço: sempre só leitura (a duração dele é a parte da janela da subetapa)
        var sb = n.semBase || n.inicio == null;
        html += '<tr class="cx-s"><td class="cx-nome" title="' + esc((n.codigo ? n.codigo + " · " : "") + n.nome) + '"><span style="padding-left:' + (n.prof >= 2 ? 44 : 22) + 'px"></span><span class="cx-n">' + esc(n.numero) + '</span>' + esc(corta(n.nome, 110)) + (sb ? ' <span class="muted cx-mini">(sem quantidade)</span>' : '') + '</td>' +
          '<td><span class="cx-mini">' + esc(cat.nome) + '</span></td>' +
          '<td class="num">' + nBR(n.equipeDias || 0, 1) + '</td>' +
          '<td class="num" title="Parte da janela da subetapa, pelo peso em equipe-dias. Só leitura.">' + (sb ? '—' : n.duracao) + fonte(n.fonte) + '</td>' +
          '<td class="num">—</td>' + (temRestr2A ? '<td class="num">—</td>' : '') + '<td class="num" title="Herdada da subetapa">—</td>' +
          '<td>' + (sb ? '—' : dm(n.dataInicio, multi)) + '</td><td>' + (sb ? '—' : dm(n.dataFim, multi)) + '</td>' +
          (colAv2A ? '<td class="num">—</td><td class="num">—</td><td class="num">—</td>' : '') + '</tr>';
      });
      return html + '</tbody></table></div>';
    },

    /* ------------------------------------------------------------------
       FÍSICO-FINANCEIRO. Nível ETAPA = Orcamento.cronograma (a MESMA função
       da aba Relatórios, com o estouro e o recado dela — d.fisicoEtapa vem
       do ui.js). Camadas subetapa/serviço = Cronograma.periodos por camada,
       com VALOR DE VENDA obrigatório e o rótulo de que mês a mês pode
       diferir do desembolso da proposta (é matemática, não defeito).
       ------------------------------------------------------------------ */
    fisico: function (d, est) {
      var camada = est.ff.camada, modo = est.ff.modo, r = d.r;
      var html = '<div class="flex" style="gap:12px;margin-bottom:10px;align-items:center;flex-wrap:wrap"><span class="muted" style="font-size:12.5px">Distribuir por:</span><span class="cx-seg">';
      [["etapa", "Etapa"], ["folha", "Subetapa"], ["servico", "Serviço"]].forEach(function (k) {
        html += '<button class="' + (camada === k[0] ? 'on' : '') + '" data-acao="crono-ff" data-camada="' + k[0] + '">' + k[1] + '</button>';
      });
      html += '</span><span class="cx-seg">' +
        '<button class="' + (modo === 'valor' ? 'on' : '') + '" data-acao="crono-ff" data-modo="valor">R$</button>' +
        '<button class="' + (modo === 'pct' ? 'on' : '') + '" data-acao="crono-ff" data-modo="pct">%</button></span></div>';
      if (camada === "etapa") return html + (d.fisicoEtapa ? d.fisicoEtapa(modo) : '<div class="vazio card">Físico-financeiro por etapa indisponível.</div>');
      return html + this.fisicoCamada(d, camada, modo);
    },

    fisicoCamada: function (d, camada, modo) {
      var Cr = C(), r = d.r, nomeC = camada === "folha" ? "subetapa" : "serviço";
      function aviso(t) { return '<div class="cx-aviso">' + t + '</div>'; }
      if (!ehArr(r.atividades) || (r.exec && r.exec.erro))
        return aviso("A distribuição por " + nomeC + " precisa da árvore do cronograma, que não pôde ser montada" + (r.exec && r.exec.erro ? ": " + esc(r.exec.erro) : "") + ". A distribuição por etapa continua valendo.");
      if (!d.valores || d.valores.ok !== true)
        return aviso("A distribuição por " + nomeC + " usa o <b>valor de venda</b> de cada " + nomeC + ", e ele não pôde ser calculado" +
          (d.valores && d.valores.motivo ? ": " + esc(d.valores.motivo) : "") + ". Custo direto não é mostrado no lugar. A distribuição por etapa continua valendo.");
      var per;
      try { per = Cr.periodos(r, { camada: camada, valores: d.valores }); } catch (e) { per = { erro: String((e && e.message) || e) }; }
      if (per.erro) return aviso(esc(per.erro));
      var lista = arr(per.lista), total = per.total || 0, porNo = per.porNo || {};
      if (!lista.length) return aviso("Sem data de início válida — não há meses para distribuir.");
      function cel(v) {
        if (modo === "pct") return total ? pct((v / total) * 100, 1) : "—";
        return Math.abs(v) > 0.005 ? moeda(v) : "—";
      }
      var html = '<div class="muted" style="font-size:11.5px;margin:0 0 8px">' + ic('cronograma') + ' ' + esc(per.rotulo || "") +
        '. O desembolso de registro (proposta, contrato, Portal do cliente) continua por <b>etapa</b>.</div>';
      html += '<div class="cx-tabela"><table class="tbl cx-ff"><thead><tr><th>' + (camada === "folha" ? "Subetapa" : "Serviço") + '</th>';
      lista.forEach(function (p) { html += '<th class="num">' + esc(p.rotulo) + '</th>'; });
      html += '<th class="num">Total</th></tr></thead><tbody>';
      var etAtual = null, nEt = {};
      r.etapas.forEach(function (e, i) { nEt[e.id] = (i + 1) + " " + (e.nome || ""); });
      arr(r.atividades).forEach(function (n) {
        if (!own(porNo, n.id)) return;
        if (n.etapaId !== etAtual && !(n.tipo === "etapa")) {
          etAtual = n.etapaId;
          html += '<tr class="cx-grupo"><td colspan="' + (lista.length + 2) + '">' + esc(corta(nEt[n.etapaId] || "", 90)) + '</td></tr>';
        } else if (n.tipo === "etapa") etAtual = n.etapaId;
        var col = porNo[n.id], soma = 0;
        col.forEach(function (v) { soma += v; });
        var rot = (n.numero ? n.numero + " " : "") + (n.nome || "");
        html += '<tr><td title="' + esc(rot) + '">' + esc(corta(rot, 70)) + '</td>';
        col.forEach(function (v) { html += '<td class="num">' + cel(v) + '</td>'; });
        html += '<td class="num"><b>' + cel(soma) + '</b></td></tr>';
      });
      html += '</tbody><tfoot><tr class="etapa-row"><td>Total mensal</td>';
      var picoV = null;
      lista.forEach(function (p) { html += '<td class="num">' + cel(p.valor) + '</td>'; if (!picoV || p.valor > picoV.valor) picoV = p; });
      html += '<td class="num">' + cel(total) + '</td></tr><tr><td class="muted">Acumulado %</td>';
      lista.forEach(function (p) { html += '<td class="num muted">' + pct(p.acumPct, 1) + '</td>'; });
      html += '<td class="num muted">' + pct(total ? 100 : 0, 0) + '</td></tr><tr><td class="muted" title="Dias-equipe do mês ÷ dias úteis do mês. É o nº de FRENTES abertas ao mesmo tempo, não o nº de pessoas.">Frentes (média do mês)</td>';
      lista.forEach(function (p) { html += '<td class="num muted">' + (p.frentes || 0) + '</td>'; });
      html += '<td></td></tr></tfoot></table></div>';
      html += '<div class="muted" style="font-size:11.5px;margin-top:6px">' +
        /* ⚠ "maior desembolso" é o nome do pico do desembolso de REGISTRO (por
           etapa, o da proposta); aqui é outra distribuição e o pico pode cair
           em outro mês (medido: dez/26 aqui × set/26 lá) — o rótulo diz qual */
        (picoV ? 'Mês de maior valor nesta distribuição por ' + nomeC + ': <b>' + esc(picoV.rotulo) + '</b> (' + cel(picoV.valor) + ') — o desembolso de registro, por etapa, pode ter o pico em outro mês. ' : '') +
        (per.mesPico ? 'Pico de frentes: <b>' + esc(per.mesPico.rotulo) + '</b> (' + per.mesPico.frentes + ' frente(s) em média) — frentes = dias-equipe ÷ dias úteis, não é número de pessoas.' : '') + '</div>';
      return html;
    },

    /* ------------------------------------------------------------------
       PARÂMETROS (avançados). ⚠ Nada aqui é regravado pelo "Recalcular" do
       cartão da sub-aba Cronograma: aquele botão grava só os inputs que
       existem na tela (Cronograma.mesclarParams), e os daqui só existem
       aqui. Os parâmetros novos moram em `exec` (fora de `params`), porque o
       Recalcular das versões ANTIGAS substitui `params` inteiro (I5).
       ------------------------------------------------------------------ */
    parametros: function (d, est) {
      var r = d.r, p = r.params || {}, ex = d.exec || {}, rede = ex.rede === true;
      var temF = ehArr(r.atividades) && this.temFolhas(r);
      var paralObra = Math.round(((p.paralelismo != null ? p.paralelismo : 0.15) || 0) * 100);
      function opt(v, txt, sel) { return '<option value="' + v + '"' + (String(sel) === String(v) ? ' selected' : '') + '>' + txt + '</option>'; }
      var parSub = (ex.paralelismoSub != null && ex.paralelismoSub !== "") ? ex.paralelismoSub : "";
      var html = '<div class="card cx-card"><h4>Modo executivo</h4>';
      if (!temF) {
        html += '<p class="muted" style="font-size:12.5px;margin:0">A planilha deste orçamento não tem subetapas — o cronograma fica por etapa. O cronograma detalha até onde a planilha detalha: crie subetapas na aba Planilha (ou pelo <b>+ subetapa</b> na linha da etapa, sub-aba Cronograma).</p>';
      } else {
        html += '<div class="flex" style="gap:12px;align-items:center;flex-wrap:wrap">' + this.interruptor(r) + '</div>' +
          '<p class="muted" style="font-size:12.5px;margin:8px 0 0">' + (rede
            ? '<b>Ligado:</b> a duração de cada etapa com subetapas é o vão da rede das subetapas — e é esse prazo que vai ao PDF, à proposta, ao desembolso e à versão antiga do app (fica gravado na etapa com a marca ∑).'
            : '<b>Desligado:</b> as subetapas são desenhadas dentro da duração de cada etapa (só visual). Ao ligar, você vê o prazo antes → depois e confirma — nada é gravado sem isso.') + '</p>';
      }
      html += '</div>';
      /* os CALENDÁRIOS DAS FRENTES logo abaixo do modo executivo (planejador
         2B; calendario.md passo 1): as duas respostas para "em que régua esta
         linha é contada" ficam uma embaixo da outra */
      var Crp = C();
      if (!(Crp && typeof Crp.recursos === "function" && Crp.recursos().cal === false)) html += this.calCartao(d, est);
      html += '<div class="card cx-card"><h4>Subetapas e acompanhamento</h4><div class="flex" style="gap:14px;flex-wrap:wrap;align-items:flex-end">' +
        '<div class="field" style="margin:0"><label title="Quanto uma subetapa começa antes de a anterior da mesma etapa terminar (cascata padrão). Vale só entre subetapas.">Paralelismo entre subetapas</label><select id="cronx-parsub">' +
          opt("", "igual ao da obra (" + paralObra + "%)", parSub) + opt(0, "Nenhum", parSub) + opt(0.15, "Leve 15%", parSub) + opt(0.3, "Médio 30%", parSub) + opt(0.5, "Alto 50%", parSub) + '</select></div>' +
        '<div class="field" style="margin:0"><label title="Diferença, em pontos percentuais, entre executado e previsto que ainda conta como “no prazo”.">Tolerância (p.p.)</label><input id="cronx-tol" type="number" min="0.1" max="50" step="0.5" value="' + (Number(ex.toleranciaPP) > 0 ? ex.toleranciaPP : 1) + '" style="width:80px"></div>' +
        '<div class="field" style="margin:0"><label title="Com que detalhe a aba abre neste orçamento. Trocar o detalhe na sub-aba Cronograma não grava nada.">Detalhe padrão da aba</label><select id="cronx-detalhe">' +
          opt("etapa", "Etapa", ex.detalhe || "subetapa") + opt("subetapa", "Subetapa", ex.detalhe || "subetapa") + opt("servico", "Serviço", ex.detalhe || "subetapa") + '</select></div>' +
        '<div class="field" style="margin:0"><label>Pontos facultativos</label><label style="display:flex;align-items:center;gap:6px;font-weight:400;cursor:pointer" title="Carnaval e Corpus Christi são ponto facultativo, mas param a maioria das obras. Desmarque se a sua obra trabalha nesses dias.">' +
          '<input id="cron-facult" type="checkbox"' + (p.feriadosFacultativos !== false ? ' checked' : '') + '> contar como dia parado</label></div>' +
        '<button class="btn sm primary" data-acao="crono-params">Salvar parâmetros</button></div>' +
        '<p class="muted" style="font-size:11.5px;margin:8px 0 0">A tolerância vale para o previsto × realizado da obra (Gestão de Obras). Os pontos facultativos só contam com “Feriados: descontar” ligado no cartão da sub-aba Cronograma.</p></div>';
      html += '<div class="card cx-card"><h4>De onde vêm os números</h4><ul class="cx-lista">' +
        '<li><b>R$/dia-equipe: ' + moeda(p.custoDiaEquipe || 700) + '</b> — informado por você (cartão da sub-aba Cronograma). Converte custo de mão de obra em equipe-dias quando o serviço não tem categoria.</li>' +
        '<li><b>Jornada: ' + (d.jornada != null ? esc(d.jornada) + ' h/dia' : 'a da aba Execução') + '</b> — da aba Execução, que transforma o Hh SINAPI em duração (<a role="button" tabindex="0" style="cursor:pointer;text-decoration:underline" data-aba="execucao">abrir Execução</a>).</li>' +
        '<li><b>Produtividade por categoria</b> — heurística do agente (≈ na tabela); a duração digitada por você (✎), pela IA ou pelo Hh da Execução (Hh) manda sobre ela.</li></ul></div>';
      /* ⚠ O CARTÃO DIZ O QUE A TELA NÃO FAZ — E SÓ ISSO. Roteiro do defeito
         (auditoria da 1.2.80, sub-aba Parâmetros): desde o arrasto (1.2.76) a
         etapa arrastada grava "não iniciar antes de" (Cronograma._restricoes,
         a caixa "Datas fixadas no Gantt" com [Soltar a data]), e este cartão
         seguia dizendo que restrição de data não existia e que "a data sai da
         rede". Recado que mente sobre o próprio sistema faz a pessoa não
         procurar o que existe. O que continua faltando está listado. */
      /* ⚠ AS CINCO LINHAS QUE SAÍRAM DAQUI (planejador 2B, espec §3.4): sábado
         meio período, turnos, restrição de data, TT/IT e elo cruzado DEIXARAM
         de ser verdade nesta versão — os calendários das frentes fazem os dois
         primeiros, a rede faz os três últimos. Recado que mente sobre o próprio
         sistema faz a pessoa não procurar o que existe: foi esse o defeito que
         criou este cartão (auditoria da 1.2.80), e é por isso que ele encolhe
         agora em vez de ficar como estava. O que continua faltando está aqui. */
      html += '<div class="card cx-card cx-nao-modelado"><h4>Não modelado nesta versão</h4><ul class="cx-lista">' +
        '<li>' + esc("Nivelamento de recursos: o cronograma não corta a duração por falta de equipe nem redistribui gente entre frentes.") + '</li>' +
        '<li>' + esc("Histograma, Last Planner e físico-financeiro contam pelo dia útil da obra, e não pelo dia real de cada frente em calendário próprio.") + '</li>' +
        '<li>' + esc("Importar cronograma do MS Project (exportar já existe, em Documentos do cronograma).") + '</li>' +
        '<li>' + esc("A IA sugere duração e dependência entre etapas; ela não edita tipos de ligação, calendários das frentes nem tarefas sem preço.") + '</li>' +
        '<li>' + esc("Biblioteca de calendários da empresa: cada orçamento guarda os calendários dele.") + '</li></ul></div>';
      /* o cartão da COMPATIBILIDADE fecha a sub-aba: é a última pergunta de
         quem vai mandar este cronograma para a equipe (crítica 2, achado 17) */
      html += this.compatCartao(d, est);
      return html;
    },

    /* Campos de `exec` que o formulário de Parâmetros tem NA TELA (el(id)
       devolve o elemento ou null). Chave ausente = input ausente (conserva o
       gravado); null = apagar a chave (volta ao padrão). `rede` nunca vem
       daqui: só pelo interruptor, que mostra o antes → depois. */
    execDoForm: function (el) {
      var f = {}, x;
      x = el("cronx-parsub");
      if (x) { var v = String(x.value == null ? "" : x.value).trim(); f.paralelismoSub = v === "" ? null : Math.max(0, Math.min(0.9, numTxt(v) || 0)); }
      x = el("cronx-tol");
      if (x) { var t = numTxt(x.value); f.toleranciaPP = t > 0 ? Math.min(50, t) : null; }
      x = el("cronx-detalhe");
      if (x) f.detalhe = DETALHES.indexOf(x.value) > -1 ? x.value : null;
      return f;
    },
    mesclarExec: function (atual, doForm) {
      var out = {}, k;
      if (atual && typeof atual === "object" && !ehArr(atual)) for (k in atual) if (own(atual, k)) out[k] = atual[k];
      if (doForm) for (k in doForm) if (own(doForm, k) && k !== "rede") { if (doForm[k] === null) delete out[k]; else if (doForm[k] !== undefined) out[k] = doForm[k]; }
      return out;
    },

    /* ------------------------------------------------------------------
       EDIÇÃO DE UMA FOLHA (subetapa ou "serviços gerais") pela tabela —
       a DECISÃO pura; o app.js só chama isto no alvo único (App._cronoAlvo)
       e salva. `nos` = Cronograma.eap(orc). Muta `cron` só quando ok.
       ⚠ Só no modo executivo: no padrão a folha é desenhada dentro da
       duração da etapa, e a pessoa digitaria 10 e veria 4.
       ⚠ Inválido NUNCA vira "sem predecessora" nem "1 dia": nada é gravado
       e a tela devolve o valor anterior (como a etapa faz hoje).
       Devolve {ok, mudou, msg?}.
       ⚠ DURAÇÃO E "DEPENDE DE" NÃO SE DECIDEM MAIS AQUI (14/09/2026): este
       método DELEGA para `GanttUI.opsDaDigitacao` + `GanttUI.aplicarOps`, o
       contrato único da digitação (etapa, subetapa e a grade do Gantt). O
       roteiro do defeito está lá: eram dois contratos para o mesmo campo, e
       uma cópia do parser aqui voltaria a divergir na primeira manutenção
       (memória "réplica de parser apodrece"). Só as EQUIPES ficam aqui.
       Mudanças visíveis na subetapa, declaradas: decimal na duração é
       RECUSADO com recado (antes "2,5" gravava 3 calado); "1.000" é mil e é
       recusado (antes gravava 1); "2.1 + 2" com espaços grava a espera
       (antes era recusado); o recado nomeia "2.2 Tapume" (antes "a subetapa
       2.2 (Tapume)"). A forma gravada é a mesma.
       ------------------------------------------------------------------ */
    editarFolha: function (cron, nos, campo, id, valor) {
      var Cr = C(), no = null;
      arr(nos).forEach(function (n) { if (n.id === id && (n.tipo === "subetapa" || n.tipo === "soltos")) no = n; });
      if (!no) return { ok: false, mudou: false, msg: "Essa subetapa não existe mais neste orçamento — nada foi gravado. A tela foi atualizada." };
      if (campo === "dur" || campo === "pred") {
        var Gu = GU();
        // ⚠ motor ausente não vira "grava do jeito antigo": não grava e diz por quê
        if (!Gu || typeof Gu.opsDaDigitacao !== "function" || typeof Gu.aplicarOps !== "function")
          return { ok: false, mudou: false, msg: "O motor da digitação (js/ganttui.js) não carregou nesta tela — nada foi gravado. Recarregue a página (Ctrl+F5)." };
        var dig = Gu.opsDaDigitacao({ atividades: arr(nos), etapas: [] }, no, campo, valor, { travado: false, cron: cron, Cronograma: Cr, CronoExecUI: this });
        if (!dig.ok) return { ok: false, mudou: false, msg: dig.msg };
        if (!dig.ops.length) return { ok: true, mudou: false };
        return { ok: true, mudou: Gu.aplicarOps(cron, dig.ops).mudou };
      }
      if (!(cron && cron.exec && cron.exec.rede === true))
        return { ok: false, mudou: false, msg: "As subetapas só se editam com “Detalhar o prazo pelas subetapas” ligado (aba Cronograma). No modo padrão elas são desenhadas dentro da duração da etapa — nada foi gravado." };
      if (!cron.sub || typeof cron.sub !== "object" || ehArr(cron.sub)) cron.sub = {};
      var sub = cron.sub;
      function mapa(k) { if (!sub[k] || typeof sub[k] !== "object" || ehArr(sub[k])) sub[k] = {}; return sub[k]; }
      var antes = JSON.stringify(sub), s = String(valor == null ? "" : valor).trim(), nome = no.numero + " (" + corta(no.nome, 40) + ")";
      if (campo === "eq") {
        var q = numTxt(s);
        if (s !== "" && (isNaN(q) || q < 1 || q > 50 || Math.round(q) !== q)) return { ok: false, mudou: false, msg: "“" + s + "” não é nº de equipes válido para a subetapa " + nome + " — use um inteiro de 1 a 50 (vazio = as equipes da obra). Nada foi gravado." };
        var eq = mapa("equipes");
        if (s === "") delete eq[id]; else eq[id] = q;
        /* ⚠ gravou, mas NÃO muda o prazo enquanto houver duração digitada na
           subetapa (a duração manda sobre as equipes): sem o recado, o campo
           mostrava 5 e o prazo ficava igual — a pessoa achava que tinha valido */
        var dg = sub.duracoes && typeof sub.duracoes === "object" && own(sub.duracoes, id) ? sub.duracoes[id] : null;
        if (s !== "" && dg != null && JSON.stringify(sub) !== antes)
          return { ok: true, mudou: true, msg: "Equipes gravadas (" + q + ") na subetapa " + nome + ", mas a duração digitada nela (" + dg + " d) continua mandando — apague a duração da subetapa para o prazo sair das equipes." };
      } else return { ok: false, mudou: false, msg: "campo desconhecido: " + campo };
      return { ok: true, mudou: JSON.stringify(sub) !== antes };
    },

    /* ------------------------------------------------------------------
       ALVO DAS EDIÇÕES — a DECISÃO pura do App._cronoAlvo (espec 3.2).
       p = {info (obraDaCadeia + podeGestao), travado (orçamento aprovado),
       escolha (obraId da tela, com várias obras), editaPlano (tela; só vale
       sem aprovação), lista (entidade crono_obra), CronoBase}.
       Devolve {tipo:"orc"|"plano", travado, obra, nivel, plano, multi, opcoes}.
       ⚠ O plano só é alvo com a obra ligada A ESTE orçamento (nivel 0): obra
         numa revisão anterior se PASSA antes (esta revisão pode ter outras
         quantidades), e com várias obras sem escolha nada vai para plano
         nenhum — a ordem da lista não decide qual obra se replaneja.
       ------------------------------------------------------------------ */
    decidirAlvo: function (p) {
      p = p || {};
      var info = p.info || {}, obs = arr(info.obras), a = null;
      /* `aprovado` guarda o estado REAL do orçamento: `travado` vira false quando
         o alvo é o plano (a aba destrava), e a faixa precisava saber que a
         proposta continua aprovada para não oferecer [Proposta] mudo */
      var out = { tipo: "orc", travado: !!p.travado, aprovado: !!p.travado, obra: null, nivel: null, plano: null, planoAlheio: null, multi: false, opcoes: [] };
      if (!info.podeGestao) return out;
      if (obs.length === 1) a = obs[0];
      else if (obs.length > 1) {
        obs.forEach(function (x) { if (p.escolha != null && p.escolha !== "" && x && x.obra && String(x.obra.id) === String(p.escolha)) a = x; });
        if (!a) { out.multi = true; out.opcoes = obs; return out; }
      }
      if (!a || !a.obra) return out;
      out.obra = a.obra; out.nivel = a.nivel;
      if (a.nivel !== 0) return out;
      var CB = p.CronoBase, pl = (CB && typeof CB.plano === "function") ? CB.plano(p.lista, a.obra.id) : null;
      /* ⚠ PLANO DE OUTRO ORÇAMENTO (revisão 3, lente sync): a obra religada pelo
         cadastro a um orçamento de fora da cadeia de revisões ficava editando o
         plano copiado do orçamento antigo — durações gravadas em ids de etapa
         que este orçamento não tem, e o [Iniciar plano] recusado ("já existe").
         Esse plano não é alvo: a faixa oferece reiniciá-lo a partir daqui. */
      var cadIds = arr(info.cadeiaIds);
      if (pl && pl.orcamentoId && cadIds.length && cadIds.indexOf(String(pl.orcamentoId)) < 0) { out.planoAlheio = pl; pl = null; }
      out.plano = pl || null;
      if (pl && (p.travado || p.editaPlano === true)) { out.tipo = "plano"; out.travado = false; }
      return out;
    },

    /* os números da obra no CHIP da faixa: executado × previsto, base vN e
       IDP — ⚠ o IDP SÓ COM BASE (sem ela ele muda a cada edição do plano e
       chega perto de 1 sozinho depois de reprogramar). As três réguas vão no
       title, cada uma com o rótulo dela. HTML com todo dado escapado. */
    _chipMontar: function (p, lead) {
      if (!p || !p.kpis) return { txt: "", porta: "", titulo: "" };
      if (!p.estado || (p.erro && !own(PR_OK, p.estado))) return { txt: '<span class="muted" title="' + esc(p.erro || "") + '">' + lead + 'previsto × realizado indisponível</span>', porta: "", titulo: String(p.erro || "") };
      var K = p.kpis, ex = K.executadoOrcamento || {}, pv = K.previstoNaData, partes = [], tit = [];
      /* ⚠ O PAR QUE SE COMPARA É DA MESMA RÉGUA (revisão 3, lente dinheiro).
         O chip juntava o "executado sobre o orçamento" (cada serviço pelo valor
         de HOJE) com o previsto (cada subetapa pelo valor da BASE): depois de
         uma revisão de quantidades saía "executado 17,1% × previsto 60%" — 43
         pontos de atraso quando a comparação que vale (a do IDP e da situação)
         dava 33,3% × 60%. Com previsto, o executado do chip é o da régua dele
         (`previstoNaData.realPct`); o outro número vai no title, rotulado. */
      var exCmp = (pv && pv.pct != null && pv.realPct != null) ? pv.realPct : ex.pct;
      partes.push("executado " + pctOu(exCmp) + (pv && pv.pct != null ? " × previsto " + pctOu(pv.pct) : ""));
      /* o ESTADO da base ativa (fatia 1B): "base v2 (aprovada)", "base v3
         (interna — sem aprovação)". Vem de `p.baseEstado`, que a fiação
         (App._cronoPainelDados) lê do selo; sem ele, o chip de sempre. Os
         números não mudam: a ativa continua a de maior versão (a regra da
         1.2.81 — outra régua daria dois IDPs para a mesma obra). */
      var ROT_BE = { contratual: "contratual", aprovada: "aprovada", interna: "interna — sem aprovação", anulada: "aprovação anulada" };
      var bEst = p.base && p.baseEstado && ROT_BE[p.baseEstado.estado] ? " (" + ROT_BE[p.baseEstado.estado] + ")" : "";
      partes.push(p.base ? "base v" + p.base.versao + bEst : (p.baseAlheia ? "base v" + p.baseAlheia.versao + " de outro orçamento" : "sem linha de base"));
      if (p.base && K.idp && K.idp.valor != null) partes.push("IDP " + nBR(K.idp.valor, 2));
      /* ---- TÉRMINO PREVISTO no chip (planejador 3C, decisão D3) ----
         ⚠ A DATA QUE RESPONDE "QUANDO ENTREGA" É A DA REDE, COM O AVANÇO
         DENTRO (`kpis.previsaoTermino`, publicado pela 2B). O chip da faixa
         mostrava executado, base e IDP — três números de DESEMPENHO — e
         nenhum de PRAZO: quem passava pela faixa não via a data, e a única
         data à mão era a da reta do ritmo dos diários, que é outra conta.
         O "+N DU base" é o desvio em dias úteis do calendário congelado na
         linha de base; sem base ele não existe, e a data sai sozinha. */
      var pvT = K.previsaoTermino;
      if (pvT && pvT.data) {
        var dvT = (pvT.desvioDU == null) ? null : Math.round(num0(pvT.desvioDU));
        partes.push("término " + dmaS(pvT.data) + (dvT == null ? "" : " (" + (dvT > 0 ? "+" : "") + dvT + " DU base)"));
        tit.push("Término previsto pela rede" + (pvT.comAvanco && pvT.corte ? ", com o avanço lançado até " + dmaS(pvT.corte) : " (sem avanço lançado)") +
          ": " + dmaS(pvT.data) +
          (pvT.base && pvT.base.data ? " · linha de base v" + pvT.base.versao + ": " + dmaS(pvT.base.data) : "") +
          (dvT == null ? "" : " · " + Math.abs(dvT) + " dia(s) útil(eis) " + (dvT > 0 ? "depois" : (dvT < 0 ? "antes" : "em cima")) + " da base"));
      }
      if (exCmp !== ex.pct && pv) tit.push("executado na régua do previsto (" + (pv.rotulo || "previsto na data").replace(/^Previsto na data /, "") + "): " + pctOu(exCmp));
      tit.push((ex.rotulo || "Executado sobre o orçamento") + ": " + pctOu(ex.pct));
      if (K.portal) tit.push((K.portal.rotulo || "no Portal do cliente") + ": " + pctOu(K.portal.pct));
      if (K.medido) tit.push((K.medido.rotulo || "Medido") + ": " + pctOu(K.medido.pct, 0));
      if (pv) tit.push((pv.rotulo || "Previsto na data") + ": " + pctOu(pv.pct));
      if (p.dataCorte) tit.push("data de corte: " + dmaS(p.dataCorte));
      var h = '<span title="' + esc(tit.join(" · ")) + '">' + lead + esc(partes.join(" · ")) + '</span>';
      // "Início: obra dd/mm (a proposta dizia dd/mm)": a frase do painel, sem o resto
      // "Início: obra dd/mm (a proposta dizia dd/mm)" e "Término: cadastro da obra dd/mm": a 1ª metade da frase do painel
      arr(p.avisos).forEach(function (a) { if (a && (a.tipo === "inicio-diverge" || a.tipo === "termino-diverge")) { h += ' <span class="muted" title="' + esc(a.msg) + '">· ' + esc(String(a.msg || "").split(/ — |; /)[0]) + '</span>'; tit.push(String(a.msg || "")); } });
      var obI = p.obra || {}, porta = "";
      if (obI.id != null && obI.id !== "" && !obI.inicio) porta = '<button class="btn sm" data-gopen="obras:' + esc(obI.id) + '" title="Informar início da obra — ela não tem data de início, e é dela que o plano, a linha de base e o previsto contam">Informar início</button>';
      return { txt: h, porta: porta, titulo: tit.join(" · ") };
    },
    /* o chip num HTML só (texto + porta), como sempre foi */
    chipNumeros: function (p) { var c = this._chipMontar(p, "· "); return c.txt + (c.porta ? " " + c.porta : ""); },
    /* as partes, para a faixa: o TEXTO encolhe com reticências, a PORTA não */
    chipPartes: function (p) { return this._chipMontar(p, ""); },

    /* ------------------------------------------------------------------
       PREVISTO × REALIZADO DA OBRA — o desenho do CronoPlan.montarPainel.
       UM desenho para os três lugares (espec 3.2; adendo A2):
         {compacto:true} — aba "cronograma" da FICHA DA OBRA: as réguas, base e
                           data, mini-curva, até 5 nós em atenção, [Congelar]/
                           [Reprogramar] e [Abrir cronograma completo];
         {completo:true} — sub-aba do orçamento e módulo "Cronograma da obra":
                           + seletor de data de corte, curva S, Gantt com a base
                           fantasma, tabela por nó e o que ficou fora da conta.
       dados = {painel (saída do montarPainel), r? (o plano atual com a árvore,
       para o Gantt — App._cronoPainelDados com comGantt), bases, podeEditar,
       podeMedicoes}. opts.origem "obra" acrescenta [Abrir cronograma no
       orçamento]. Estado de tela (data de corte) mora no App, nunca aqui.
       ⚠ AS TRÊS RÉGUAS LADO A LADO E ROTULADAS (memória "seis réguas para o
         avanço"): o engenheiro responde ao cliente que liga com o número da
         tela DELE — e o Portal mostra outro. Esconder uma é criar a pergunta
         sem resposta.
       ⚠ Todo texto de dado passa por esc: nome de obra e de subetapa, motivo
         e aviso vêm de outro aparelho pela nuvem.
       ------------------------------------------------------------------ */
    painelPR: function (dados, opts) {
      dados = dados || {}; opts = opts || {};
      var p = dados.painel || {}, K = p.kpis || {}, comp = !!opts.compacto && !opts.completo;
      var ob = p.obra || dados.obra || {}, obId = ob.id != null ? String(ob.id) : "";
      var html = '<style>' + CSS_PR + '</style><div class="cx-pr ' + (comp ? 'cx-pr-comp' : 'cx-pr-full') + '" data-cx-pr="' + esc(obId) + '">';
      if (!p.estado || (p.erro && !own(PR_OK, p.estado))) {
        return html + '<div class="cx-aviso">' + esc(p.erro || "O previsto × realizado desta obra não pôde ser montado.") + '</div>' + this._prAcoes(p, dados, opts, comp, true) + '</div>';
      }
      var eixo = arr(p.curva && p.curva.eixo), multi = eixo.length > 1 && String(eixo[0]).slice(0, 4) !== String(eixo[eixo.length - 1]).slice(0, 4);
      // CABEÇALHO: de onde vêm os números (plano, linha de base, data de corte)
      var cab = [];
      if (!opts.semNomeObra) cab.push('Obra <b>' + esc(corta(ob.nome || "sem nome", 48)) + '</b>');
      if (p.orcamento) cab.push('orçamento ' + esc(p.orcamento.numero || ""));
      cab.push(p.plano && p.plano.fonte === "plano" ? 'plano de execução da obra' + (p.plano.atualizadoEm ? ' <span class="muted">(gravado ' + esc(dmaS(p.plano.atualizadoEm)) + ')</span>' : '') : 'plano: cronograma do orçamento');
      cab.push(p.base ? 'linha de base <b>v' + esc(p.base.versao) + '</b> de ' + esc(dmaS(p.base.criadaEm)) + (p.base.motivo ? ' <span class="muted">— ' + esc(corta(p.base.motivo, 80)) + '</span>' : '') : '<b>sem linha de base</b>');
      var FCo = { informada: "escolhida", ultimoDiario: "último diário publicado", hoje: "hoje — nenhum diário publicado" }, fc = FCo[p.fonteCorte] || "";
      if (comp || !obId) cab.push('até <b>' + esc(dmaS(p.dataCorte)) + '</b>' + (fc ? ' <span class="muted">(' + fc + ')</span>' : ''));
      else cab.push('<label style="display:inline-flex;gap:6px;align-items:center;font-weight:400">Data de corte <input type="date" data-crono-corte="' + esc(obId) + '" value="' + esc(p.dataCorte || "") +
        '" title="O dia que os números descrevem: executado, Portal e previsto saem todos desta data. Apague para voltar ao último diário publicado." style="width:140px"></label>' + (fc ? '<span class="muted">(' + fc + ')</span>' : ''));
      html += '<div class="cx-pr-cab">' + cab.join('<span class="muted">·</span>') + '</div>';
      html += this._prKpis(p, dados, comp);
      /* ⚠ `opts.aposKpis` entra AQUI, e o lugar é medido. A leitura executiva
         ficava ACIMA do painel e empurrava a faixa dos três números para
         y 742–893 numa janela de 768 (medido com o layout despejado: o bloco
         `.nr` tem 157 px, e faltavam 126). Os três números são a resposta de
         "quanto da obra está feito" — a leitura explica a resposta, então ela
         vem logo DEPOIS dela e antes dos gráficos. `tools/e2e-planejamento-obra.js`
         guarda a posição; não mova sem medir de novo. */
      if (opts.aposKpis) html += opts.aposKpis;
      var avs = arr(p.avisos);
      if (avs.length) {
        var lim = comp ? 3 : 12;
        html += '<div class="cx-aviso"><ul class="cx-lista" style="margin:0">';
        avs.slice(0, lim).forEach(function (a) { html += '<li>' + esc(a && a.msg) + '</li>'; });
        if (avs.length > lim) html += '<li>e mais ' + (avs.length - lim) + ' aviso(s)' + (comp ? ' — veja no cronograma completo' : '') + '</li>';
        html += '</ul></div>';
      }
      if (comp) {
        html += this.curvaS(p.curva, { mini: true });
        var at = arr(p.atencao);
        if (at.length) {
          html += '<div class="cx-pr-sec"><b>Pedem atenção</b> <span class="muted">(até 5, da mais atrasada)</span></div><ul class="cx-lista cx-pr-atencao">';
          at.slice(0, 5).forEach(function (n) { html += '<li><span class="cx-n">' + esc(n.numero) + '</span>' + esc(corta(n.nome, 60)) + ' — previsto ' + pctOu(n.previstoPct) + ', real ' + pctOu(n.realPct) + ' (' + esc(ppTxt(n.desvioPP)) + ')</li>'; });
          html += '</ul>';
        } else if (p.estado === "ok" && K.situacao) html += '<div class="muted" style="font-size:12px;margin-top:6px">Nenhuma subetapa atrasada nesta data.</div>';
        return html + this._prAcoes(p, dados, opts, comp, false) + '</div>';
      }
      html += '<div class="cx-pr-sec"><b>Curva S</b> <span class="muted">— acumulado mensal, % do valor de venda</span></div>' + this.curvaS(p.curva, {});
      var r = dados.r;
      if (r && arr(r.atividades).length) {
        var mB = {}, mR = {};
        arr(p.nos).forEach(function (n) {
          if (n.base && n.base.ini) mB[n.id] = { ini: n.base.ini, fim: n.base.fim || n.base.ini };
          if (n.realPct != null) mR[n.id] = n.realPct;
        });
        html += '<div class="cx-pr-sec"><b>Gantt</b> <span class="muted">— barra = plano atual' + (p.base ? '; tracejado = linha de base v' + esc(p.base.versao) : '') + '; faixa escura = executado; linha laranja = data de corte</span></div>' +
          this.gantt(r, { detalhe: "subetapa", base: p.base ? mB : null, realizado: mR, hoje: p.dataCorte || null, rotHoje: "data de corte" });
      }
      html += this._prTabela(p, multi) + this._prFora(p, dados);
      return html + this._prAcoes(p, dados, opts, comp, false) + '</div>';
    },
    _prKpis: function (p, dados, comp) {
      var K = p.kpis || {}, ex = K.executadoOrcamento || {}, po = K.portal || {}, me = K.medido || {}, pv = K.previstoNaData, idp = K.idp;
      /* ⚠ SEM DINHEIRO (dados.semDinheiro — quem não pode Medições nem
         Financeiro; o removedor da ficha zera os valores): os percentuais
         ficam, nenhum R$ sai — nem "R$ 0,00" de um valor apagado, que se lê
         como "não tem valor" */
      var semD = !!dados.semDinheiro;
      function rs(v) { return (semD || v == null || !isFinite(Number(v))) ? "" : moeda(v); }
      function kpi(rot, v, sub, cls) {
        return '<div class="cx-kpi ' + cls + '"><div class="cx-kpi-rot">' + esc(rot) + '</div><div class="cx-kpi-v">' + esc(v) + '</div>' + (sub ? '<div class="cx-kpi-sub">' + esc(sub) + '</div>' : '') + '</div>';
      }
      var h = kpi(ex.rotulo || "Executado sobre o orçamento (diários publicáveis)", pctOu(ex.pct),
        ex.base === "financeira" ? "pesado pelo valor de venda de cada serviço" : (ex.base === "simples" ? "média simples — menos de 60% dos serviços têm valor" : ""), "cx-kpi-exec");
      /* ⚠ O NÚMERO DO PORTAL COM O DENOMINADOR DELE (revisão 3, lente UX): "89,3%
         no Portal" ao lado de "34,4% executado" sem dizer que o Portal é a
         média dos serviços JÁ LANÇADOS (11 de 24) fazia o engenheiro achar que o
         cliente vê a obra quase pronta sem saber por quê — e é ele quem atende
         o telefone. A régua do Portal não muda (I11): a tela só diz o que ela é. */
      var subPortal = "";
      if (po.fonte === "diario") {
        var nL = Number(po.servicos) || 0, nO = Number(po.doOrcamento) || 0;
        /* "o orçamento tem M", e não "de M": o Portal também pondera linha de
           diário que não é item do orçamento — N pode não ser parte de M */
        subPortal = (po.base === "simples" ? "média simples" : (po.base === "financeira" ? "pesado pelo valor" : "sobre")) + (nL ? " dos " + nL + " serviço(s) já lançado(s) nos diários" + (nO ? " (o orçamento tem " + nO + ")" : "") : "") +
          (po.ate ? " — é o que o cliente vê até " + dmaS(po.ate) : "");
      } else if (po.fonte) subPortal = "é o número de hoje (não foi cortado na data)";
      h += kpi(po.rotulo || "no Portal do cliente", pctOu(po.pct), subPortal, "cx-kpi-portal");
      /* ⚠ com data de corte ESCOLHIDA o medido continua o de hoje (boletim não
         entra na conta pela data): o card diz isso quando algum boletim contado
         é depois do corte — senão a obra parecia medida à frente do executado
         naquela data (revisão 3: corte 30/06, 42% contando o boletim de 31/07) */
      var subMed = me.pct == null && (me.emValor || semD) ? "boletins só em valor" + (rs(me.emValor) ? " (" + rs(me.emValor) + ")" : "") + ", sem % — não dá para dizer quanto da obra é" : (me.boletins ? me.boletins + " boletim(ns) aprovado(s) ou pago(s)" : "nenhum boletim aprovado");
      if (me.depoisDoCorte) subMed = "acumulado de hoje — inclui " + me.depoisDoCorte + " boletim(ns) com data depois de " + dmaS(p.dataCorte);
      if (dados.podeMedicoes === false) h += kpi(me.rotulo || "Medido (boletins aprovados)", "—", "seu usuário não vê medições", "cx-kpi-medido");
      else h += kpi(me.rotulo || "Medido (boletins aprovados)", pctOu(me.pct, 0), subMed, "cx-kpi-medido");
      if (pv) h += kpi(pv.rotulo || "Previsto na data", pctOu(pv.pct), pv.realPct != null ? "executado na mesma régua: " + pctOu(pv.realPct) : "", "cx-kpi-prev");
      else h += kpi("Previsto na data", "—", p.estado === "sem-inicio" ? "sem data de início — não dá para dizer se está atrasada" : "sem previsto nesta data", "cx-kpi-prev");
      // ⚠ IDP SÓ COM LINHA DE BASE: o montarPainel já não o entrega sem ela; a tela repete a regra
      /* no compacto (ficha) o IDP vinha sem explicação nenhuma: "2,65" solto.
         A frase curta diz como ler; o completo diz a conta (quem vê dinheiro) */
      if (p.base && idp && idp.valor != null) h += kpi("IDP " + (idp.rotulo || ""), nBR(idp.valor, 2), (comp || !rs(idp.va) || !rs(idp.vp)) ? "acima de 1 = à frente da linha de base; abaixo de 1 = atrás" : "valor agregado " + rs(idp.va) + " ÷ previsto " + rs(idp.vp), "cx-kpi-idp");
      if (K.situacao) h += kpi("Situação" + (K.situacaoContra ? " — contra " + K.situacaoContra : ""), (SIT[K.situacao] || [K.situacao])[0], termTxt(K.desvioTerminoDias), "cx-kpi-sit");
      /* ==================================================================
         "TÉRMINO PREVISTO" (planejador 2B; avanco.md passo 6)

         ⚠ UM TÉRMINO EM DESTAQUE, NÃO DOIS. A tela mostrava "10 DU depois"
           (a rede) e "25 dias antes da base" (o ritmo medido nos diários)
           com o mesmo peso e sem dizer que são contas diferentes — e quem
           lia escolhia o número que preferia. A rede sabe as dependências e
           o que já aconteceu; o ritmo é uma reta sobre a curva executada.
           O card responde "quando entrega"; o ritmo desce para a linha
           secundária, rotulado como outra conta.
         ⚠ A AÇÃO MORA NO CARD DO NÚMERO QUE ELA MUDA: [Atualizar avanço]
           fica aqui dentro, e não numa barra de ações longe do número.
         ================================================================== */
      var pt = K.previsaoTermino;
      if (pt && pt.data) {
        var sub = [];
        sub.push(pt.comAvanco ? "pela rede, com o avanço até " + dmaS(pt.corte) : "pela rede do plano atual");
        if (pt.base && pt.base.data) {
          sub.push("linha de base v" + pt.base.versao + ": " + dmaS(pt.base.data) +
            (pt.desvioDU != null && pt.desvioDU !== 0 ? " (" + (pt.desvioDU > 0 ? "+" : "") + pt.desvioDU + " dias úteis)" : ""));
        }
        var obPT = (p.obra && p.obra.id != null) ? String(p.obra.id) : "";
        var acao = (!comp && obPT && dados.podeEditar !== false)
          ? '<div class="cx-kpi-acao"><button class="btn sm" data-acao="crono-avanco-abrir" data-obra="' + esc(obPT) + '">' +
            (pt.comAvanco ? "Atualizar avanço" : "Lançar avanço") + '</button></div>' : "";
        h += '<div class="cx-kpi cx-kpi-termino"><div class="cx-kpi-rot">Término previsto</div><div class="cx-kpi-v">' + esc(dmaS(pt.data)) +
          '</div><div class="cx-kpi-sub">' + esc(sub.join(" · ")) + '</div>' + acao + '</div>';
      }
      return '<div class="cx-kpis">' + h + '</div>';
    },
    _prTabela: function (p, multi) {
      var nos = arr(p.nos);
      if (!nos.length) return '<div class="muted" style="font-size:12px">Sem etapas para comparar.</div>';
      function jan(o) { return o && o.ini ? dmS(o.ini, multi) + "–" + (o.fim ? dmS(o.fim, multi) : "…") : "—"; }
      var h = '<div class="cx-pr-sec"><b>Por etapa e subetapa</b> <span class="muted">— janela da linha de base · do plano atual · real (1º lançamento → último serviço concluído); previsto × real na data de corte</span></div>' +
        '<div class="cx-tabela"><table class="tbl cx-pr-tab"><thead><tr><th>Nº</th><th>Etapa / subetapa</th><th>Base</th><th>Atual</th><th>Real</th><th>Previsto × real</th><th>Situação</th></tr></thead><tbody>';
      nos.forEach(function (n) {
        var et = n.tipo === "etapa";
        h += '<tr class="' + (et ? 'cx-pr-et' : 'cx-pr-f') + '" data-no="' + esc(n.id) + '"><td class="cx-n">' + esc(n.numero) + '</td>' +
          '<td class="cx-nome" title="' + esc(n.nome + (n.nomeBase ? " (na linha de base: " + n.nomeBase + ")" : "")) + '">' + (et ? '' : '<span style="padding-left:14px"></span>') + esc(corta(n.nome, 80)) + '</td>' +
          '<td>' + jan(n.base) + '</td><td>' + jan(n.atual) + '</td><td>' + jan(n.real) + '</td>' +
          '<td>' + celPR(n) + '</td><td>' + sitHtml(n.situacao) + '</td></tr>';
      });
      return h + '</tbody></table></div>';
    },
    _prFora: function (p, dados) {
      var F = p.foraDaConta || {}, li = [];
      var na = arr(F.naoApropriadas), sq = arr(F.semQuantidade), ef = arr(F.escopoForaDaBase);
      // ⚠ sem dinheiro, nenhum R$ (nem o "(R$ X)" que o motor escreve na frase) — ver _prKpis
      var semDF = !!(dados && dados.semDinheiro);
      function rsF(v) { return (semDF || v == null || !isFinite(Number(v))) ? "" : moeda(v); }
      function it(x, n) { return '<span class="cx-n">' + esc(x.numero) + '</span>' + esc(corta(x.nome || x.descricao, n)); }
      if (na.length) li.push('<b>' + na.length + ' linha(s) de diário fora do avanço sobre o orçamento</b> (sem vínculo com item, item fora do orçamento ligado ou unidade diferente): ' +
        na.slice(0, 5).map(function (x) { return esc(corta(x.descricao || x.refId || "linha", 50)) + (x.msg ? ' <span class="muted">(' + esc(corta(x.msg, 110)) + ')</span>' : ''); }).join("; ") + (na.length > 5 ? "; e mais " + (na.length - 5) : ""));
      if (sq.length) li.push('<b>' + sq.length + ' serviço(s) sem quantidade no orçamento</b> com lançamento nos diários (não entram no %): ' + sq.slice(0, 5).map(function (x) { return it(x, 50); }).join("; ") + (sq.length > 5 ? "; e mais " + (sq.length - 5) : ""));
      arr(F.opcionaisFora).forEach(function (x) { li.push(it(x, 50) + (rsF(x.valor) ? ' (' + esc(rsF(x.valor)) + ')' : '') + ': ' + esc(x.msg)); });
      if (F.msgForaDaBase) li.push(esc(semDF ? "escopo fora da linha de base — não entra no IDP." : F.msgForaDaBase) + (ef.length ? ' ' + ef.slice(0, 5).map(function (x) { return it(x, 40); }).join("; ") : ''));
      arr(F.sumiramDoAtual).forEach(function (x) { li.push(it(x, 50) + ': ' + esc(x.msg)); });
      arr(F.reagrupadas).forEach(function (x) { li.push(it(x, 50) + ': ' + esc(x.msg)); });
      if (!li.length) return '<div class="muted" style="font-size:12px;margin-top:8px">Nada ficou fora da conta.</div>';
      return '<div class="cx-pr-sec"><b>O que ficou fora da conta</b></div><ul class="cx-lista cx-pr-fora">' + li.map(function (x) { return '<li>' + x + '</li>'; }).join("") + '</ul>';
    },
    /* ⚠ só as portas que EXISTEM (memória "porta prometida precisa existir"):
       congelar pede orçamento ligado e permissão; histórico só com base */
    _prAcoes: function (p, dados, opts, comp, erro) {
      var ob = p.obra || dados.obra || {}, obId = ob.id != null ? String(ob.id) : "", h = "", nB = arr(dados.bases).length;
      if (!erro && obId && dados.podeEditar !== false && p.orcamento) {
        if (!p.base && p.baseAlheia) h += '<button class="btn sm primary" data-acao="crono-congelar" data-obra="' + esc(obId) + '" data-reprogramar="1" title="A linha de base ativa foi congelada sobre outro orçamento e não vale para este: grava a versão seguinte, a partir do plano atual, com motivo.">Reprogramar (nova base)</button>';
        else if (!p.base) h += '<button class="btn sm primary" data-acao="crono-congelar" data-obra="' + esc(obId) + '" title="Congela o plano como está agora: é contra ele que a obra passa a ser comparada (previsto na data e IDP). Linha de base não se regrava — reprogramar cria a versão seguinte.">Congelar linha de base</button>';
        else h += '<button class="btn sm" data-acao="crono-congelar" data-obra="' + esc(obId) + '" data-reprogramar="1" title="Grava a versão seguinte da linha de base, com motivo. A atual fica no histórico.">Reprogramar (nova base)</button>';
      }
      /* fatia 1B: "Histórico de bases" vira "Linhas de base (N)" — a porta
         abre a sub-aba (no orçamento) ou o histórico (na ficha compacta) */
      if (!erro && obId && (p.base || nB)) h += '<button class="btn sm ghost" data-acao="crono-historico" data-obra="' + esc(obId) + '" title="As versões da linha de base desta obra: a contratual, as aprovações e a comparação entre elas.">Linhas de base' + (nB ? ' (' + nB + ')' : '') + '</button>';
      if (comp && obId) h += '<button class="btn sm" data-acao="crono-planejamento" data-obra="' + esc(obId) + '">Abrir cronograma completo</button>';
      /* as portas da quarentena onde o painel é o único recado: a ficha e o
         módulo da obra (a aba do orçamento, origem "orc", já as tem na
         faixa de cima) — ver App._cronoPainelDados */
      if (erro && dados.planoIlegivel && dados.planoIlegivel.admin && opts.origem !== "orc") h += '<button class="btn sm acao-forte" data-acao="backup">Restaurar um backup</button><button class="btn sm" data-acao="liberar-ilegivel" title="Guarda o conteúdo ilegível à parte (nada é apagado) e deixa o planejamento das obras recomeçar vazio.">Guardar à parte e recomeçar</button>';
      if (opts.origem === "obra" && p.orcamento && p.orcamento.id) h += '<button class="btn sm ghost" data-acao="crono-abrir-orc" data-orc="' + esc(p.orcamento.id) + '" title="Abre o orçamento da obra na aba Cronograma">Abrir cronograma no orçamento</button>';
      return h ? '<div class="cx-pr-acoes">' + h + '</div>' : '';
    },

    /* CURVA S: base × plano atual × executado, no eixo do painel.
       ⚠ O executado chega TRUNCADO (acaba no último mês com lançamento) e é
       desenhado só até onde tem valor, com o x calculado sobre o eixo INTEIRO
       — "daqui para frente ninguém mediu", sem a queda a pique que um zero ou
       null desenham (memória "portal lê null como zero"). Papel branco, como
       o Gantt. */
    curvaS: function (c, o) {
      o = o || {}; c = c || {};
      var rot = arr(c.rotulos), n = rot.length, mini = !!o.mini;
      if (!n) return '<div class="muted" style="font-size:12px">Sem meses para a curva S (sem data de início, ou sem valor de venda nos serviços).</div>';
      var W = mini ? 300 : 820, H = mini ? 78 : 230, L = mini ? 4 : 36, R = mini ? 4 : 12, T = 8, B = mini ? 6 : 30;
      function X(i) { return n === 1 ? L + (W - L - R) / 2 : L + i * (W - L - R) / (n - 1); }
      function Y(v) { var x = Number(v); if (!isFinite(x)) x = 0; x = Math.max(0, Math.min(100, x)); return T + (H - T - B) * (1 - x / 100); }
      function path(a) { var d = ""; arr(a).forEach(function (v, i) { if (v == null || i >= n) return; d += (d ? " L" : "M") + f1(X(i)) + "," + f1(Y(v)); }); return d; }
      var s = '<svg class="cx-curva' + (mini ? ' cx-curva-mini' : '') + '" viewBox="0 0 ' + W + ' ' + H + '" style="max-width:' + W + 'px" role="img" aria-label="Curva S: linha de base, plano atual e executado">';
      [0, 50, 100].forEach(function (g) {
        s += '<line x1="' + L + '" y1="' + f1(Y(g)) + '" x2="' + (W - R) + '" y2="' + f1(Y(g)) + '" stroke="#e2e8f0" stroke-width="1"/>';
        if (!mini) s += '<text x="' + (L - 4) + '" y="' + f1(Y(g) + 3) + '" font-size="9" fill="#94a3b8" text-anchor="end">' + g + '%</text>';
      });
      if (!mini) {
        var passo = Math.max(1, Math.ceil(n / 12));
        rot.forEach(function (rt, i) { if (i % passo && i !== n - 1) return; s += '<text x="' + f1(X(i)) + '" y="' + (H - 12) + '" font-size="9" fill="#475569" text-anchor="middle">' + esc(rt) + '</text>'; });
      }
      var pb = path(c.base), pa = path(c.atual), pe = path(c.executado);
      if (pb) s += '<path class="cx-c-base" d="' + pb + '" fill="none" stroke="#64748b" stroke-width="1.6" stroke-dasharray="5,3"/>';
      if (pa) s += '<path class="cx-c-atual" d="' + pa + '" fill="none" stroke="#0d6ebd" stroke-width="1.8"/>';
      if (pe) {
        var ue = arr(c.executado).length - 1;
        s += '<path class="cx-c-exec" d="' + pe + '" fill="none" stroke="#15803d" stroke-width="2.6"/>';
        if (ue >= 0 && ue < n) s += '<circle cx="' + f1(X(ue)) + '" cy="' + f1(Y(c.executado[ue])) + '" r="' + (mini ? 2.5 : 3.5) + '" fill="#15803d"><title>' + esc("executado até " + rot[ue] + ": " + pctOu(c.executado[ue])) + '</title></circle>';
      }
      s += '</svg>';
      if (mini) return s;
      function am(css) { return '<span style="display:inline-block;width:18px;height:0;vertical-align:middle;margin-right:5px;' + css + '"></span>'; }
      return s + '<div class="cx-leg">' +
        (pb ? '<span>' + am('border-top:2px dashed #64748b') + esc(c.fonteBase || "linha de base") + '</span>' : '<span>sem linha de base</span>') +
        '<span>' + am('border-top:2px solid #0d6ebd') + esc(c.fonteAtual || "plano atual") + '</span>' +
        '<span>' + am('border-top:3px solid #15803d') + 'executado (diários publicados' + (pe ? '' : ' — nada lançado ainda') + ')</span></div>';
    },

    /* ------------------------------------------------------------------
       PASSAR A OBRA PARA A REVISÃO (espec 3.2) — as duas decisões puras.
       diffQuantidades(de, para): o antes → depois das quantidades pelos ids
       (a revisão clona o orçamento, os ids ficam iguais). Nº = o da planilha
       (Orcamento.calcular). {mudaram, novos, removidos, iguais}; null sem um
       dos dois.
       ------------------------------------------------------------------ */
    diffQuantidades: function (de, para) {
      if (!de || !para) return null;
      var O = (typeof Orcamento !== "undefined") ? Orcamento : G("Orcamento"), U = Ut();
      function num(v) { return U && U.num ? U.num(v) : (Number(v) || 0); }
      function idx(o) {
        var m = {}, ordem = [], numero = {};
        try { if (O && O.calcular) arr(O.calcular(o).linhas).forEach(function (l) { if (l && l.itemId != null && !own(numero, l.itemId)) numero[l.itemId] = l.numero; }); } catch (eC) {}
        arr(o.etapas).forEach(function (e, ie) {
          arr(e && e.itens).forEach(function (it, ii) {
            if (!it || it.id == null || own(m, it.id)) return;
            m[it.id] = it; ordem.push(it.id);
            if (!own(numero, it.id)) numero[it.id] = (ie + 1) + "." + (ii + 1);
          });
        });
        return { m: m, ordem: ordem, numero: numero };
      }
      var A = idx(de), B = idx(para), out = { mudaram: [], novos: [], removidos: [], iguais: 0 };
      B.ordem.forEach(function (id) {
        var b = B.m[id], lin = { id: id, numero: B.numero[id], descricao: b.descricao || "", unidade: b.unidade || "", de: null, para: num(b.quantidade) };
        if (!own(A.m, id)) { out.novos.push(lin); return; }
        var a = A.m[id];
        lin.de = num(a.quantidade);
        if (Math.abs(lin.de - lin.para) > 1e-9 || String(a.unidade || "") !== String(b.unidade || "")) { lin.unidadeDe = a.unidade || ""; out.mudaram.push(lin); }
        else out.iguais++;
      });
      A.ordem.forEach(function (id) {
        if (own(B.m, id)) return;
        var a = A.m[id];
        out.removidos.push({ id: id, numero: A.numero[id], descricao: a.descricao || "", unidade: a.unidade || "", de: num(a.quantidade), para: null });
      });
      return out;
    },
    /* bloqueioPassarObra(obra, medicoes, destinoId, numeros?) → null | {n,
       valor, orcamentos, msg}.
       ⚠ DINHEIRO: o acumulado já medido de cada item é contado por obra E POR
       ORÇAMENTO (Gestao._pctAnterioresPorItem: `x.orcamentoId !== orcamentoId`
       sai da conta; pendente CONTA, só rejeitada não). Com boletim sobre outro
       orçamento, passar a obra faria o próximo boletim sobre esta revisão
       começar do zero nos itens já medidos — medição em dobro. Boletim por
       valor ou por atividades (sem orçamento) não entra na trava. */
    bloqueioPassarObra: function (obra, medicoes, destinoId, numeros) {
      if (!obra) return null;
      var U = Ut(), n = 0, v = 0, orcs = {}, ks = [];
      arr(medicoes).forEach(function (m) {
        if (!m || String(m.obraId) !== String(obra.id) || m.status === "rejeitada" || !m.orcamentoId || String(m.orcamentoId) === String(destinoId)) return;
        n++; v += U && U.num ? U.num(m.valor) : (Number(m.valor) || 0);
        if (!own(orcs, m.orcamentoId)) { orcs[m.orcamentoId] = 1; ks.push(String(m.orcamentoId)); }
      });
      if (!n) return null;
      var nomes = ks.map(function (id) { return (numeros && numeros[id]) || id; }).join(", ");
      return { n: n, valor: Math.round(v * 100) / 100, orcamentos: ks,
        msg: "A obra " + String(obra.nome || "") + " tem " + n + " boletim(ns) de medição feitos sobre o orçamento " + nomes + " (" + moeda(v) + "). O acumulado já medido de cada item é contado por orçamento: com a obra nesta revisão, o próximo boletim começaria do zero nos itens já medidos — medição em dobro. Nada foi mudado: a obra continua ligada ao " + nomes + ". Planeje e meça pelo orçamento ligado a ela; para trocar de orçamento uma obra que já tem medição, fale com o suporte da RA." };
    },
    passarObraHtml: function (d) {
      d = d || {};
      var ob = d.obra || {}, para = d.para || {}, df = d.diff, h = '';
      h += '<p style="font-size:13px;margin:0 0 8px">A obra <b>' + esc(ob.nome || "") + '</b> está ligada ao <b>' + esc(d.deNumero || "orçamento anterior") + '</b>. Passando para o <b>' + esc(para.numero || "") +
        '</b>, os diários e o planejamento da obra passam a medir sobre esta revisão. Os diários e as medições já feitos continuam na mesma obra.</p>';
      if (!df) h += '<div class="cx-aviso">O ' + esc(d.deNumero || "orçamento anterior") + ' não está neste aparelho — não dá para mostrar o antes → depois das quantidades.</div>';
      else {
        h += '<p style="font-size:12.5px;margin:0 0 6px">Quantidades, pelos mesmos itens: <b>' + df.mudaram.length + '</b> mudam, <b>' + df.novos.length + '</b> entram, <b>' + df.removidos.length + '</b> saem e ' + df.iguais + ' ficam iguais.</p>';
        var lin = df.mudaram.concat(df.novos, df.removidos);
        if (lin.length) {
          h += '<div class="cx-tabela" style="max-height:280px"><table class="tbl" style="font-size:12px"><thead><tr><th>Nº</th><th>Serviço</th><th>Un.</th><th class="num">' + esc(d.deNumero || "antes") + '</th><th class="num">' + esc(para.numero || "depois") + '</th></tr></thead><tbody>';
          lin.slice(0, 40).forEach(function (x) {
            h += '<tr><td class="cx-n">' + esc(x.numero) + '</td><td style="white-space:normal">' + esc(corta(x.descricao, 80)) + '</td><td>' + esc(x.unidade) +
              (x.unidadeDe != null && x.unidadeDe !== x.unidade ? ' <span class="muted">(era ' + esc(x.unidadeDe) + ')</span>' : '') + '</td>' +
              '<td class="num">' + (x.de == null ? '<span class="muted">entra</span>' : esc(nBR(x.de, 2))) + '</td><td class="num">' + (x.para == null ? '<span class="muted">sai</span>' : esc(nBR(x.para, 2))) + '</td></tr>';
          });
          if (lin.length > 40) h += '<tr><td colspan="5" class="muted">e mais ' + (lin.length - 40) + ' item(ns)</td></tr>';
          h += '</tbody></table></div>';
        }
        if (df.removidos.length) h += '<div class="cx-aviso">O que foi lançado nos diários nos ' + df.removidos.length + ' item(ns) que saem fica fora do avanço sobre o orçamento ("item fora do orçamento vinculado").</div>';
      }
      if (d.temPlano) h += '<p class="muted" style="font-size:12px;margin:6px 0 0">O plano de execução da obra passa junto (as etapas e subetapas têm os mesmos ids).</p>';
      /* ⚠ planejamento ilegível: sem este aviso, a falta da linha acima lia como "a obra não tem plano" (App._cronoLerPlanejamento) */
      else if (d.planoIlegivel) h += '<div class="cx-aviso">O planejamento das obras deste aparelho está ilegível: se a obra tem plano de execução, ele NÃO passa junto — continua marcado com o orçamento anterior até o backup ser restaurado.</div>';
      /* ⚠ O PORTAL DO CLIENTE MUDA JUNTO (revisão 3, lente dinheiro): o snapshot
         lê o cronograma, a curva planejada e os pesos do orçamento LIGADO à
         obra, e se republica sozinho a cada diário publicado. Esta porta se
         apresentava como segura ("os diários continuam") e trocava, sem aviso,
         o que o contratante vê. O recado diz o que muda e quando. */
      var pz = d.prazo || null;
      h += '<div class="cx-aviso">O <b>Portal do cliente</b> passa a mostrar o cronograma e a curva planejada do <b>' + esc(para.numero || "orçamento novo") + '</b> na próxima publicação (ela é refeita sozinha a cada diário publicado)' +
        (pz && pz.de != null && pz.para != null ? (pz.de === pz.para ? ' — o prazo do cronograma continua ' + esc(pz.para) + ' dias úteis.' : ': o prazo do cronograma vai de <b>' + esc(pz.de) + '</b> para <b>' + esc(pz.para) + '</b> dias úteis.') : '.') + '</div>';
      return h + '<p class="muted" style="font-size:12px;margin:6px 0 0">Fica registrado na obra quem passou e quando.</p>';
    },

    /* ------------------------------------------------------------------
       CONGELAR / REPROGRAMAR — o diálogo e a leitura dele (puros).
       d = {obra, inicio ("AAAA-MM-DD" do cadastro), inicioPlano, versao,
       ativa (base ativa | null), opcionais [{id, numero, nome}], sim (a base
       que sairia, ou {erro}), fontePlano "plano"|"orcamento", orcNumero}.
       ⚠ Opcional DESMARCADA por padrão (segue a proposta, que imprime a
         opcional fora do total — decisão de produto pendente do Rogério).
       ⚠ Os ids das opcionais não vão para o id do elemento (vêm de fora):
         `congelarDoForm` lê pela POSIÇÃO na mesma lista.
       ------------------------------------------------------------------ */
    congelarForm: function (d) {
      d = d || {};
      var v = d.versao || 1, sim = d.sim, h = '';
      h += '<p style="font-size:13px;margin:0 0 10px">' + (v > 1
        ? 'Reprogramar grava a <b>linha de base v' + v + '</b>: a obra passa a ser comparada com ela. A v' + (v - 1) + ' fica no histórico — linha de base não se apaga nem se regrava.'
        : 'A linha de base é o combinado com que a obra passa a ser comparada (previsto na data e IDP). Ela congela ' + (d.fontePlano === "plano" ? 'o <b>plano de execução da obra</b>' : 'o <b>cronograma do orçamento ' + esc(d.orcNumero || "") + '</b>') +
          ' como está agora e não se regrava: reprogramar cria a versão seguinte.') + '</p>';
      h += '<div class="field"><label>Início da obra *</label><input type="date" id="cxb-inicio" value="' + esc(d.inicio || "") + '" style="width:160px">' +
        '<div class="muted" style="font-size:11.5px;margin-top:3px">' + (d.inicio ? 'O do cadastro da obra.' : 'A obra ainda não tem início.') + ' A linha de base conta dele; mudando aqui, o cadastro da obra passa a ter esta data.' +
        (d.inicioPlano && d.inicio && d.inicioPlano !== d.inicio ? ' (O ' + (d.fontePlano === "plano" ? 'plano' : 'orçamento') + ' dizia ' + esc(dmaS(d.inicioPlano)) + '.)' : '') + '</div></div>';
      var opc = arr(d.opcionais);
      if (opc.length) {
        h += '<div class="field"><label>Etapas opcionais no avanço</label>';
        opc.forEach(function (x, i) { h += '<label style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" id="cxb-opc-' + i + '"> ' + esc(x.numero) + ' ' + esc(corta(x.nome, 60)) + '</label>'; });
        h += '<div class="muted" style="font-size:11.5px;margin-top:3px">Desmarcada = fora do avanço, do previsto e do IDP, como a proposta, que imprime a opcional fora do total. Marque só a que o cliente contratou.</div></div>';
      }
      h += '<div class="field"><label>Motivo' + (v > 1 ? ' * <span class="muted" style="font-weight:400">(obrigatório: a v' + v + ' substitui a v' + (v - 1) + ')</span>' : ' <span class="muted" style="font-weight:400">(opcional)</span>') +
        '</label><textarea id="cxb-motivo" rows="2" maxlength="200" placeholder="' + (v > 1 ? 'Ex.: chuva atrasou a fundação 10 dias' : 'Ex.: plano assinado com o cliente') + '"></textarea></div>';
      /* ⚠ A CONTRATUAL E A APROVAÇÃO (planejador, fatia 1B; D15, D20). Os
         blocos só existem quando a fiação os pede (`d.contratual`,
         `d.aprovacao`): sem eles o diálogo é o de sempre, byte a byte.
         ⚠ A CAIXA SÓ NASCE MARCADA NA v1 (`d.contratual.marcada`, decidido na
         fiação): na REPROGRAMAÇÃO marcar a contratual tem de ser um ato. Ela
         vinha marcada em toda versão, e a v2 de um atraso do próprio
         construtor virava, sem ninguém decidir, a base contra a qual o pleito
         é medido — o mesmo atributo que o texto abaixo diz que não se apaga
         nem se regrava (medido na revisão final de 22/09/2026).
         Só o administrador muda a marca; para os outros ela aparece travada,
         dizendo por quê. */
      var ct = d.contratual;
      if (ct && ct.mostrar) {
        h += '<div class="field cxb-f-contratual"><label style="display:flex;gap:8px;align-items:center;font-weight:600"><input type="checkbox" id="cxb-contratual"' + (ct.marcada ? ' checked' : '') + (ct.admin ? '' : ' disabled') + '> ' +
          'Esta é a linha de base CONTRATUAL (a do contrato assinado)</label>' +
          '<div class="muted" style="font-size:11.5px;margin-top:3px">Ela não se apaga, não se regrava e nunca é resumida para caber na nuvem. É contra ela que o comparativo de pleito mede.' +
          /* ⚠ na reprogramação a caixa nasce DESMARCADA, e a frase diz quando
             marcar — padrão sem explicação a pessoa desfaz no escuro */
          (v > 1 ? ' Marque apenas se esta reprogramação foi acordada com o contratante e passou a ser o contrato.' : '') +
          (ct.admin ? '' : ' Só o administrador da conta muda esta marca.') + '</div></div>';
      } else if (ct && ct.atual) {
        h += '<p class="muted" style="font-size:12px;margin:0 0 8px">A contratual desta obra é a <b>v' + esc(ct.atual.versao) + '</b>' + (ct.atual.gemeas ? ' (há ' + esc(ct.atual.gemeas) + ' gêmea(s) — vale esta)' : '') + '. A nova versão é uma reprogramação.</p>';
      }
      var ap = d.aprovacao;
      if (ap) {
        var aps = arr(ap.aditivos);
        h += '<div class="field cxb-f-aprov"><label>Aprovação desta ' + (v > 1 ? 'reprogramação' : 'linha de base') + '</label>' +
          '<label style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="radio" name="cxb-aprov" id="cxb-aprov-c"' + (ap.padrao === "contratante" ? ' checked' : '') + '> Aprovada pelo contratante</label>' +
          '<label style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="radio" name="cxb-aprov" id="cxb-aprov-i"' + (ap.padrao === "contratante" ? '' : ' checked') + '> Interna — ainda sem aprovação do contratante</label>' +
          '<div class="cxb-f-linha"><label>Aprovada por <input type="text" id="cxb-aprov-por" maxlength="80" placeholder="nome e cargo de quem aprovou"></label>' +
          '<label>Em <input type="date" id="cxb-aprov-em" style="width:160px"></label></div>' +
          '<div class="cxb-f-linha"><label>Documento <input type="text" id="cxb-aprov-doc" maxlength="120" placeholder="ex.: Termo aditivo 01, carta 023/2026, e-mail de 18/09"></label>' +
          (aps.length ? '<label>Termo aditivo <select id="cxb-aprov-adt"><option value="">— nenhum —</option>' + aps.map(function (x, i) { return '<option value="' + i + '">' + esc(corta(x.rotulo, 60)) + '</option>'; }).join("") + '</select></label>' : '') + '</div>' +
          (v > 1 ? '<div class="muted" style="font-size:11.5px;margin-top:3px">Interna: a v' + v + ' passa a ser a base do previsto × realizado e do IDP, mas sai marcada como INTERNA no chip e no impresso — o contratante não a aprovou. A aprovação pode ser registrada depois, na sub-aba Linhas de base.</div>' : '') + '</div>';
      }
      /* ⚠ SEM DINHEIRO (quem não pode Medições nem Financeiro — a regra do
         painel da obra, Gestao._cronoDinheiro): prazo e datas ficam, o valor de
         venda sai. O diálogo vazava "R$ 4.500,00" pela porta da própria ficha
         que já escondia o dinheiro (revisão 3, lentes dinheiro e código). */
      var semD = !!d.semDinheiro;
      if (sim && sim.erro) h += '<div class="cx-aviso">Com o início ' + (d.inicio ? esc(dmaS(d.inicio)) + ' ' : '') + 'a linha de base não sai: ' + esc(sim.erro) + '</div>';
      else if (sim) {
        var mq = (v > 1 && d.ativa) ? this.oQueMuda(d.ativa, sim) : null;
        /* a coluna "contra a contratual" só quando a ativa NÃO é a contratual
           (fatia 1B): o pleito mede contra a promessa do contrato */
        var mqC = (mq && d.contratualBase && d.contratualBase.id !== d.ativa.id) ? this.oQueMuda(d.contratualBase, sim) : null;
        if (mq) h += this._oQueMudaHtml(mq, v, semD, mqC ? { mq: mqC, versao: d.contratualBase.versao } : null);
        else h += '<p class="muted" style="font-size:12px;margin:6px 0 0">Com o início acima e as opcionais desmarcadas: ' + esc(sim.totalDias) + ' dias úteis, término ' + esc(dmaS(sim.dataFim)) + (semD ? '' : ', ' + esc(moeda(sim.valor))) + '.</p>';
        /* ⚠ O TÉRMINO DO CADASTRO (revisão 3, lente UX): a obra de 04/05 a 18/12
           congelava uma base de 378 dias úteis (até 11/2027) sem nenhuma
           menção ao término digitado — e a mesma ficha passava a dar duas
           respostas de prazo (Resumo: 18/12/2026; Cronograma: "adiantada"
           contra 2027). O diálogo mostra os dois e deixa a pessoa decidir se o
           cadastro passa a ter o término da linha de base. Desmarcado: nada
           muda no cadastro. */
        var tObra = /^\d{4}-\d{2}-\d{2}$/.test(String(d.termino || "")) ? String(d.termino) : "";
        if (sim.dataFim && tObra !== sim.dataFim) {
          h += '<div class="cx-aviso">' + (tObra ? 'Término: o cadastro da obra diz <b>' + esc(dmaS(tObra)) + '</b>; esta linha de base termina em <b>' + esc(dmaS(sim.dataFim)) + '</b> (com o início acima).'
            : 'A obra não tem término no cadastro; esta linha de base termina em <b>' + esc(dmaS(sim.dataFim)) + '</b> (com o início acima).') +
            '<label style="display:flex;gap:8px;align-items:center;font-weight:400;margin-top:6px"><input type="checkbox" id="cxb-termino"> ' +
            (tObra ? 'Atualizar o término do cadastro da obra para o fim desta linha de base' : 'Gravar no cadastro da obra o término desta linha de base') + '</label></div>';
        }
      }
      return h;
    },
    /* o diálogo → {dataInicio, motivo, opcionaisIncluidos, erro?}.
       `el(id)` = o elemento ou null; opcIds na MESMA ordem do congelarForm */
    congelarDoForm: function (el, opcIds, versao, extra) {
      extra = extra || {};
      var ini = el("cxb-inicio"), mot = el("cxb-motivo");
      var f = { dataInicio: ini ? String(ini.value == null ? "" : ini.value).trim() : "",
        motivo: mot ? String(mot.value == null ? "" : mot.value).replace(/\s+/g, " ").trim().slice(0, 200) : "", opcionaisIncluidos: [] };
      arr(opcIds).forEach(function (id, i) { var c = el("cxb-opc-" + i); if (c && c.checked) f.opcionaisIncluidos.push(id); });
      var tb = el("cxb-termino");
      f.atualizarTermino = !!(tb && tb.checked);
      /* fatia 1B: a contratual (null = o diálogo não perguntou) e a aprovação
         (null = interna). O aditivo é lido pela POSIÇÃO na lista que a
         fiação passou — o id vem de fora e nunca vai para o elemento. */
      var cc = el("cxb-contratual");
      f.contratual = cc ? !!cc.checked : null;
      var apC = el("cxb-aprov-c");
      f.aprovacao = null;
      if (apC && apC.checked) {
        var por = el("cxb-aprov-por"), em = el("cxb-aprov-em"), doc = el("cxb-aprov-doc"), adt = el("cxb-aprov-adt");
        var ia = adt && adt.value !== "" && adt.value != null ? parseInt(adt.value, 10) : -1;
        f.aprovacao = { tipo: "contratante", por: por ? String(por.value == null ? "" : por.value).replace(/\s+/g, " ").trim().slice(0, 80) : "",
          em: em ? String(em.value == null ? "" : em.value).trim() : "", documento: doc ? String(doc.value == null ? "" : doc.value).replace(/\s+/g, " ").trim().slice(0, 120) : "",
          aditivoId: (ia >= 0 && arr(extra.aditivos)[ia] != null) ? String(arr(extra.aditivos)[ia]) : null };
      }
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f.dataInicio), ok = false;
      if (m) { var dt = new Date(+m[1], +m[2] - 1, +m[3]); ok = dt.getFullYear() === +m[1] && dt.getMonth() === +m[2] - 1 && dt.getDate() === +m[3]; }
      if (!ok) f.erro = "Informe a data de início da obra — a linha de base congela as datas a partir dela. Nada foi gravado.";
      else if (versao > 1 && !f.motivo) f.erro = "Informe o motivo da reprogramação — a v" + versao + " substitui a v" + (versao - 1) + " na comparação da obra. Nada foi gravado.";
      else if (f.aprovacao) {
        var CSm = MOD("CronoSelo", "./cronoselo.js"), va = CSm && CSm.validarAprovacao ? CSm.validarAprovacao(f.aprovacao, extra.hoje) : null;
        if (va && va.erro) f.erro = "Aprovação: " + va.erro;
        else if (va) f.aprovacao = va.aprovacao;
      }
      return f;
    },
    /* o que muda da base ativa para a que sairia: prazo, término, valor e as
       janelas por nó — comparadas em DATA (CronoPlan.dataDaBase), porque o
       offset de cada base conta do início dela */
    oQueMuda: function (ativa, nova) {
      if (!ativa || !nova || nova.erro) return null;
      var P = (typeof CronoPlan !== "undefined") ? CronoPlan : G("CronoPlan");
      function dat(b, k) { if (P && P.dataDaBase) { try { return P.dataDaBase(b, k); } catch (e) { return null; } } return null; }
      var porId = {}, vistos = {}, mud = [], novos = 0, sairam = 0;
      arr(ativa.nos).forEach(function (n) { if (n && n.id != null) porId[n.id] = n; });
      arr(nova.nos).forEach(function (n) {
        if (!n) return;
        vistos[n.id] = true;
        var a = own(porId, n.id) ? porId[n.id] : null;
        if (!a) { novos++; return; }
        var ai = dat(ativa, a.i), af = dat(ativa, a.f), ni = dat(nova, n.i), nf = dat(nova, n.f);
        if (ai == null || ni == null) { if (a.i !== n.i || a.f !== n.f) mud.push({ numero: n.n, nome: n.nm, de: null, para: null }); return; }
        if (ai !== ni || af !== nf) mud.push({ numero: n.n, nome: n.nm, de: [ai, af], para: [ni, nf] });
      });
      arr(ativa.nos).forEach(function (n) { if (n && !own(vistos, n.id)) sairam++; });
      return { prazo: [ativa.totalDias, nova.totalDias], termino: [ativa.dataFim, nova.dataFim], valor: [ativa.valor, nova.valor],
        inicio: [ativa.cal && ativa.cal.dataInicio, nova.cal && nova.cal.dataInicio], mudaram: mud, novos: novos, sairam: sairam };
    },
    _oQueMudaHtml: function (mq, v, semDinheiro, contra) {
      /* `contra` (fatia 1B) = {mq, versao}: a coluna "contra a contratual",
         com o início/prazo/término/valor da contratual ao lado — a v1 do
         contrato, e não só a versão anterior, é o que o pleito compara */
      var cC = contra && contra.mq ? contra.mq : null, rotC = cC ? 'v' + esc(contra.versao) + ' (contratual)' : '';
      function colC(k, fmt) { return cC ? '<td class="num">' + esc(fmt(cC[k][0])) + '</td>' : ''; }
      function du(x) { return x + " dias úteis"; }
      var h = '<div style="font-size:12.5px;margin-top:6px"><b>O que muda da v' + (v - 1) + ' para a v' + v + '</b> <span class="muted">(com o início acima e as opcionais desmarcadas)</span>' +
        '<table class="tbl cx-muda" style="font-size:12px;margin:4px 0"><thead><tr><th></th>' + (cC ? '<th class="num">' + rotC + '</th>' : '') + '<th class="num">v' + (v - 1) + '</th><th class="num">v' + v + '</th></tr></thead><tbody>' +
        '<tr><td>Início</td>' + colC("inicio", dmaS) + '<td class="num">' + esc(dmaS(mq.inicio[0])) + '</td><td class="num">' + esc(dmaS(mq.inicio[1])) + '</td></tr>' +
        '<tr><td>Prazo</td>' + colC("prazo", du) + '<td class="num">' + esc(mq.prazo[0]) + ' dias úteis</td><td class="num">' + esc(mq.prazo[1]) + ' dias úteis</td></tr>' +
        '<tr><td>Término</td>' + colC("termino", dmaS) + '<td class="num">' + esc(dmaS(mq.termino[0])) + '</td><td class="num">' + esc(dmaS(mq.termino[1])) + '</td></tr>' +
        // ⚠ sem dinheiro: a linha do valor de venda não existe (ver congelarForm)
        (semDinheiro ? '' : '<tr><td>Valor</td>' + colC("valor", moeda) + '<td class="num">' + esc(moeda(mq.valor[0])) + '</td><td class="num">' + esc(moeda(mq.valor[1])) + '</td></tr>') + '</tbody></table>';
      if (cC) h += '<div class="muted" style="font-size:11.5px">Contra a contratual (v' + esc(contra.versao) + '): ' + cC.mudaram.length + ' etapa(s)/subetapa(s) mudam de janela; o prazo vai de ' + esc(cC.prazo[0]) + ' para ' + esc(cC.prazo[1]) + ' dias úteis.</div>';
      if (mq.mudaram.length) {
        h += mq.mudaram.length + ' etapa(s)/subetapa(s) mudam de janela:<ul class="cx-lista">';
        mq.mudaram.slice(0, 8).forEach(function (x) { h += '<li><span class="cx-n">' + esc(x.numero) + '</span>' + esc(corta(x.nome, 50)) + (x.de ? ': ' + esc(dmaS(x.de[0]) + "–" + dmaS(x.de[1]) + " → " + dmaS(x.para[0]) + "–" + dmaS(x.para[1])) : '') + '</li>'; });
        if (mq.mudaram.length > 8) h += '<li>e mais ' + (mq.mudaram.length - 8) + '</li>';
        h += '</ul>';
      } else h += 'Nenhuma etapa ou subetapa muda de janela.';
      if (mq.novos || mq.sairam) h += ' <span class="muted">' + (mq.novos ? mq.novos + ' nó(s) entram' : '') + (mq.novos && mq.sairam ? ', ' : '') + (mq.sairam ? mq.sairam + ' saem' : '') + '.</span>';
      return h + '</div>';
    },
    /* HISTÓRICO DE BASES: da mais nova para a mais velha, dizendo o que cada
       versão ainda guarda (ativa completa; antigas resumidas ou arquivadas
       pela porta do espaço do CronoBase, com o que saiu). */
    historicoBases: function (bases, ativaId, ocup, opts) {
      opts = opts || {};
      // ⚠ sem dinheiro: a coluna Valor não existe (ver congelarForm)
      var semD = !!opts.semDinheiro;
      var bs = arr(bases).slice().reverse();
      if (!bs.length) return '<p style="font-size:13px">Esta obra ainda não tem linha de base. Use <b>Congelar linha de base</b> no previsto × realizado da obra.</p>';
      /* ⚠ MUDANÇA DECLARADA (planejador, fatia 1B; D15, D16): o texto dizia
         "a v1 (a contratual) por último" — a tela prometia que a contratual
         seria resumida um dia. Ela nunca é: a porta do espaço não tem mais as
         fases da v1. `opts.estados` = {baseId: {estado, selo}} traz as
         colunas Estado e Selo (a verdade da contratual e da aprovação mora
         no selo); sem ele, a tabela de sempre. */
      var ests = (opts.estados && typeof opts.estados === "object") ? opts.estados : null;
      var ROT_E = { contratual: "contratual", aprovada: "aprovada", interna: "interna — sem aprovação", anulada: "aprovação anulada" };
      var h = '<p class="muted" style="font-size:12px;margin:0 0 8px">Linha de base não se apaga nem se regrava: reprogramar grava a versão seguinte. Para caber no limite da nuvem, as versões antigas são resumidas sozinhas — nunca a ativa. A contratual nunca é resumida.</p>';
      /* duas bases da MESMA versão = congeladas ao mesmo tempo em aparelhos
         diferentes (o id é único por gravação, nenhuma some no merge): vale a
         ativa (CronoBase.ativa — a mais recente, a mesma em todo aparelho), e
         a outra fica aqui dita, com quem e quando */
      var ativaB = null, porV = {};
      bs.forEach(function (b) { if (b.id === ativaId) ativaB = b; porV[b.versao] = (porV[b.versao] || 0) + 1; });
      h += '<div class="cx-tabela"><table class="tbl cx-hist" style="font-size:12.5px"><thead><tr><th>Versão</th>' + (ests ? '<th>Estado</th>' : '') + '<th>Congelada em</th><th>Por</th><th>Motivo</th><th class="num">Prazo</th><th>Término</th>' + (semD ? '' : '<th class="num">Valor</th>') + '<th>O que ficou guardado</th>' + (ests ? '<th>Selo</th>' : '') + '</tr></thead><tbody>';
      bs.forEach(function (b) {
        var guard = b.id === ativaId ? '<b>ativa</b> — completa'
          : (b.arquivada ? 'arquivada: só o cabeçalho (saíram ' + (Number(b.etapasArquivadas) || 0) + ' etapa(s), ' + (Number(b.folhasResumidas) || 0) + ' subetapa(s) e ' + (Number(b.mesesResumidos) || 0) + ' mês(es) de curva)'
            : (b.resumida ? 'resumida: sem ' + (Number(b.folhasResumidas) || 0) + ' subetapa(s) e sem a curva de ' + (Number(b.mesesResumidos) || 0) + ' mês(es)' : 'completa'));
        if (b.id !== ativaId && porV[b.versao] > 1 && ativaB && ativaB.versao === b.versao) {
          guard = '<b>não vale</b>: outra v' + esc(b.versao) + ' foi congelada ao mesmo tempo em outro aparelho (' + esc(dmaS(ativaB.criadaEm)) + (ativaB.por ? ', por ' + esc(corta(ativaB.por, 30)) : '') + ') e é ela que vale — para mudar, reprograme. ' + guard;
        }
        var eb = ests ? (ests[b.id] || null) : null;
        var celE = ests ? '<td>' + esc(eb ? (ROT_E[eb.estado] || eb.estado) : "—") + '</td>' : '';
        var celS = ests ? '<td style="white-space:normal">' + esc(eb && eb.seloTexto ? eb.seloTexto : "sem selo") + '</td>' : '';
        h += '<tr><td><b>v' + esc(b.versao) + '</b></td>' + celE + '<td>' + esc(dmaS(b.criadaEm)) + '</td><td>' + esc(corta(b.por || "—", 30)) + '</td><td style="white-space:normal">' + esc(b.motivo || "—") +
          '</td><td class="num">' + esc(b.totalDias) + ' d</td><td>' + esc(dmaS(b.dataFim)) + '</td>' + (semD ? '' : '<td class="num">' + esc(moeda(b.valor)) + '</td>') + '<td style="white-space:normal">' + guard + '</td>' + celS + '</tr>';
      });
      h += '</tbody></table></div>';
      if (ocup && ocup.bytes != null && ocup.teto) h += '<p class="muted" style="font-size:11.5px;margin:6px 0 0">Planejamento das obras desta empresa: ' + esc(nBR(ocup.bytes / 1024, 0)) + ' KB de ' + esc(nBR(ocup.teto / 1024, 0)) + ' KB (a nuvem guarda tudo num documento só, de 1 MiB).' +
        (opts.ocupSelo && opts.ocupSelo.bytes != null ? ' Linhas de base seladas: ' + esc(nBR(opts.ocupSelo.bytes / 1024, 0)) + ' KB de ' + esc(nBR((opts.ocupSelo.teto || 921600) / 1024, 0)) + ' KB.' : '') + '</p>';
      return h;
    },

    /* O "antes → depois" do interruptor, em HTML (Cronograma.simularExec).
       Os números vêm do motor; a tela só os escreve — e separa o que é
       arredondamento (piso de 1 dia por subetapa) do que é a rede, senão
       "+4 dias" se lia como obra mais realista quando era só arredondar. */
    textoSimulacao: function (sim, nomes) {
      nomes = nomes || {};
      var liga = !!sim.ligar, a = sim.antes || {}, b = sim.depois || {}, dif = (b.totalDias || 0) - (a.totalDias || 0);
      // de onde vinha a duração que muda: "digitada" para a da IA ou do Hh escondia uma duração rastreável (I7)
      var ORIG = { ia: "sugerida pela IA", exec: "do Hh SINAPI (aba Execução)" };
      function orig(ag) { return ORIG[ag] || "digitada"; }
      var html = '<p style="margin:0 0 10px;font-size:13px">' + (liga
        ? 'Ligando, a duração de cada etapa com subetapas passa a ser o <b>vão da rede das subetapas</b> — e o PDF, a proposta, o desembolso e o MS Project passam a usar esse prazo. A duração que cada etapa tem hoje fica <b>guardada</b> e volta se você desligar.'
        : 'Desligando, as etapas com subetapas voltam à duração que tinham <b>antes de ligar</b> (a guardada — se ninguém editou a etapa depois) ou, sem ela, à estimada pelo agente; as subetapas continuam desenhadas dentro delas.') + '</p>';
      html += '<table class="tbl" style="margin-bottom:10px"><tbody>' +
        '<tr><td>Hoje</td><td class="num"><b>' + a.totalDias + ' dias úteis</b></td><td>término ' + dma(a.dataFim) + '</td></tr>' +
        '<tr><td>' + (liga ? 'Pelas subetapas' : 'Sem o modo executivo') + '</td><td class="num"><b>' + b.totalDias + ' dias úteis</b></td><td>término ' + dma(b.dataFim) + '</td></tr>' +
        '</tbody></table>';
      html += '<p style="margin:0 0 8px;font-size:13px">' + (dif === 0 ? 'O prazo total não muda.' : 'O prazo ' + (dif > 0 ? 'aumenta' : 'diminui') + ' <b>' + Math.abs(dif) + ' dia(s) útil(eis)</b>.') + '</p>';
      if (liga && sim.arredondamento > 0 && sim.semPiso)
        html += '<p style="margin:0 0 8px;font-size:12.5px">Desses ' + b.totalDias + ' dias, <b>' + sim.arredondamento + '</b> vêm só do arredondamento — cada subetapa dura no mínimo 1 dia inteiro; sem ele a rede daria ' + sim.semPiso.totalDias + ' dias úteis. Não é a obra que ficou mais lenta.</p>';
      var et = arr(sim.etapas);
      if (et.length) {
        html += '<div style="font-size:12.5px"><b>Etapas que mudam:</b><ul class="cx-lista">';
        et.slice(0, 8).forEach(function (x) { html += '<li>' + esc(nomes[x.etapaId] || "etapa") + ': ' + x.antes + ' → ' + x.depois + ' dia(s)</li>'; });
        if (et.length > 8) html += '<li>e mais ' + (et.length - 8) + '</li>';
        html += '</ul></div>';
      }
      arr(sim.avisos).forEach(function (x) {
        html += '<div class="cx-aviso">' + esc(nomes[x.etapaId] || "Etapa") + ' tinha a duração <b>' + x.digitado + ' dia(s)</b> ' + orig(x.agente) + ' e passa a durar o vão das subetapas: <b>' + x.vao + ' dia(s)</b>. Os ' + x.digitado + ' dia(s) ficam guardados e voltam se o modo for desligado.</div>';
      });
      arr(sim.restauradas).forEach(function (x) {
        html += '<div class="cx-aviso">' + esc(nomes[x.etapaId] || "Etapa") + ' volta a ' + (x.dur != null ? '<b>' + x.dur + ' dia(s)</b> ' + orig(x.agente) : 'a duração de antes') + ' — o valor de antes de ligar o modo executivo.</div>';
      });
      if (arr(sim.semVao).length) html += '<div class="muted" style="font-size:12px">' + sim.semVao.length + ' etapa(s) só com subetapas marco: a duração delas não vem das subetapas.</div>';
      var pt = sim.prazoTexto;
      if (pt && pt.msg && (pt.difere || pt.ambiguo))
        html += '<div class="cx-aviso">' + esc(pt.msg) + ' O texto da proposta <b>não</b> é alterado — ajuste o campo “Prazo de execução” dos dados comerciais do orçamento.</div>';
      html += '<p class="muted" style="font-size:12px;margin:8px 0 0">Nada é gravado até você confirmar.</p>';
      return html;
    },

    /* =====================================================================
     * PLANEJADOR — TOMADAS DA ONDA 0 (dono MOTOR). Nada visível muda sem
     * registro. Espec: ESPEC-planejador.md §3.2 (T8, T20).
     * ===================================================================== */

    /* SUB-ABA REGISTRÁVEL (T8): {id, nome, depoisDe, quando(d, est),
       render(d, est)}. O `render` a consulta DEPOIS das três de sempre, e a
       `barra` a desenha logo depois de `depoisDe`. Mesmo id → substitui (o
       módulo recarregado não duplica a aba). Id de sub-aba de sempre →
       recusado (false): uma fatia não troca a aba de outra por aqui. */
    registrarSub: function (s) {
      if (!s || typeof s !== "object" || typeof s.id !== "string" || !s.id) return false;
      for (var i = 0; i < SUBS.length; i++) if (SUBS[i].id === s.id) return false;
      var reg = { id: s.id, nome: String(s.nome == null ? s.id : s.nome), depoisDe: s.depoisDe == null ? null : String(s.depoisDe),
        quando: typeof s.quando === "function" ? s.quando : null, render: typeof s.render === "function" ? s.render : null };
      for (i = 0; i < _subsReg.length; i++) if (_subsReg[i].id === s.id) { _subsReg[i] = reg; return true; }
      _subsReg.push(reg);
      return true;
    },
    subsRegistradas: function () { return _subsReg.map(function (x) { return { id: x.id, nome: x.nome, depoisDe: x.depoisDe }; }); },

    /* AÇÕES DA LINHA DO PRAZO (T20): {id, ordem, quando(d, est), html(d, est)}.
       O `cronograma` acrescenta, DEPOIS do conteúdo de hoje, o html de cada
       registro cujo `quando` vale, na ordem (`ordem`, depois `id`). Mesmo id →
       substitui. É onde a 2B põe [Lançar avanço]/[Atualizar avanço] e
       [Calendários (N)] sem editar a linha que a 2A desenha.
       ⚠ Registro que lança não derruba a aba: some só ele. */
    registrarPrazo: function (p) {
      if (!p || typeof p !== "object" || typeof p.id !== "string" || !p.id || typeof p.html !== "function") return false;
      var reg = { id: p.id, ordem: isFinite(Number(p.ordem)) ? Number(p.ordem) : 0, quando: typeof p.quando === "function" ? p.quando : null, html: p.html }, i;
      for (i = 0; i < _prazoReg.length; i++) if (_prazoReg[i].id === p.id) { _prazoReg.splice(i, 1); break; }
      _prazoReg.push(reg);
      /* ⚠ `sort` estável não é garantido em ES5: o desempate por id torna a
         ordem a mesma em todo navegador */
      _prazoReg.sort(function (a, b) { return (a.ordem - b.ordem) || (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0)); });
      return true;
    },
    _prazoRegistrados: function (d, est) {
      if (!_prazoReg.length) return "";
      var out = "";
      _prazoReg.forEach(function (p) {
        try {
          if (p.quando && !p.quando(d, est)) return;
          var h = p.html(d, est);
          if (h != null) out += String(h);
        } catch (e) { /* registro com defeito: só ele some */ }
      });
      return out;
    },
    /* só para as suítes: tira um registro (o módulo é global e as suítes rodam
       vários cenários no mesmo processo) */
    _desregistrar: function (tipo, id) {
      var l = tipo === "sub" ? _subsReg : (tipo === "prazo" ? _prazoReg : null), i;
      if (!l) return false;
      for (i = 0; i < l.length; i++) if (l[i].id === id) { l.splice(i, 1); return true; }
      return false;
    },

    /* ===== PLANEJADOR: bases (1B) ===== */
    _regBases: 1,
    /* ------------------------------------------------------------------
       SUB-ABA "LINHAS DE BASE" (planejador, fatia 1B; espec §3.3; desenho
       BASES §a). O desenho é PURO: `dados` vem de App._cronoBasesDados
       (a leitura do disco, a comparação e as permissões). Nada aqui grava.
       dados = {erro?, obra, bases: [cartão], contratual, ativaId, podeEditar,
       admin, veDinheiro, obraConcluida, comp (CronoComp.comparar), escolha
       ({a, b, detalhe, filtro, busca}), opcoesA, opcoesB, r (plano atual),
       real ({id: pct}), corte, ocupacao ({crono, selo}), orfaos,
       seloNaoChegou (n), recursosDesligados}.
       ⚠ Todo texto de dado passa por `esc`: nome de etapa, motivo, quem
         aprovou e documento vêm de outro aparelho pela nuvem.
       ⚠ Sem dinheiro (dados.veDinheiro false) nenhum R$ sai daqui.
       ------------------------------------------------------------------ */
    _BASE_ESTADO: { contratual: "CONTRATUAL", aprovada: "APROVADA PELO CONTRATANTE", interna: "INTERNA (sem aprovação)", anulada: "APROVAÇÃO ANULADA" },
    basesPainel: function (dados) {
      dados = dados || {};
      var self = this, h = '<div class="cxb" data-cx-bases="' + esc(dados.obra && dados.obra.id || "") + '">';
      if (dados.erro) return h + '<div class="cx-aviso">' + esc(dados.erro) + '</div></div>';
      var ob = dados.obra || {}, obId = String(ob.id == null ? "" : ob.id), bases = arr(dados.bases);
      /* o topo: o que é a tela, e as portas da obra */
      h += '<div class="cxb-topo"><div class="cxb-tit">Linhas de base da obra <b>' + esc(corta(ob.nome || "sem nome", 60)) + '</b>' +
        '<span class="muted"> · ' + bases.length + ' versão(ões)' + (dados.contratual ? ' · contratual v' + esc(dados.contratual.versao) : ' · sem contratual marcada') + '</span></div>';
      h += '<div class="cxb-acoes">';
      if (dados.podeEditar && dados.podeCongelar) {
        h += '<button class="btn sm ' + (bases.length ? '' : 'primary') + '" data-acao="crono-congelar" data-obra="' + esc(obId) + '"' + (bases.length ? ' data-reprogramar="1"' : '') + '>' +
          (bases.length ? 'Reprogramar (nova base)' : 'Congelar linha de base') + '</button>';
      }
      if (dados.admin && dados.contratual && bases.length > 1) h += '<button class="btn sm ghost" data-acao="crono-bases-trocar" data-obra="' + esc(obId) + '" title="Só o administrador: troca qual versão é a contratual, com motivo e confirmação digitada. A marca antiga fica no histórico.">Trocar a contratual</button>';
      if (dados.admin && dados.obraConcluida && dados.temSelo) h += '<button class="btn sm acao-forte" data-acao="crono-bases-encerrar" data-obra="' + esc(obId) + '" title="Obra concluída: gera o resumo e o pacote de conferência e libera o espaço do detalhe por serviço das linhas de base desta obra (a contratual inclusive).">Encerrar planejamento</button>';
      h += '</div></div>';
      if (dados.recursosDesligados) h += '<div class="cx-aviso">' + esc(dados.recursosDesligados) + '</div>';
      if (dados.seloNaoChegou) h += '<div class="cx-aviso">' + esc(dados.seloNaoChegou + " versão(ões) desta obra estão resumidas aqui e o selo delas ainda não chegou a este aparelho — sincronize para ver as subetapas.") + '</div>';
      if (!bases.length) {
        return h + '<p class="cxb-vazio">Esta obra ainda não tem linha de base. ' + (dados.podeEditar ? 'Use <b>Congelar linha de base</b>: a v1 nasce como a contratual.' : 'Quem planeja a obra congela a primeira.') + '</p>' + self._basesRodape(dados) + '</div>';
      }
      h += self._basesCartoes(dados);
      h += self._basesBarra(dados);
      var comp = dados.comp;
      if (!comp) h += '<p class="cxb-vazio">' + (bases.length < 2 ? 'Com uma versão só, a comparação é com o <b>plano atual</b> — escolha acima.' : 'Escolha as duas versões acima.') + '</p>';
      else if (!comp.ok) h += '<div class="cx-aviso">' + esc(comp.erro) + '</div>';
      else {
        h += self._basesResumo(comp, dados);
        if (dados.r) h += '<div class="cxb-sec"><b>Gantt comparativo</b> <span class="muted">— faixa de cima: ' + esc(comp.cab.rotA) + ' · faixa de baixo: ' + esc(comp.cab.rotB) +
          ' · barra: plano atual · faixa escura: executado · linha laranja: data de corte</span></div>' + self.ganttComparar(dados.r, comp, { realizado: dados.real, corte: dados.corte });
        h += self._basesTabela(comp, dados);
        var avs = arr(comp.avisos);
        if (avs.length) h += '<div class="cxb-sec"><b>O que não entrou na comparação</b></div><ul class="cx-lista cxb-fora">' + avs.map(function (a) { return '<li>' + esc(a.msg) + '</li>'; }).join("") + '</ul>';
        h += '<p class="muted cxb-rodape">' + arr(comp.rodape).map(esc).join(" ") + '</p>';
      }
      return h + self._basesRodape(dados) + '</div>';
    },
    _basesCartoes: function (dados) {
      var self = this, ob = dados.obra || {}, obId = esc(ob.id == null ? "" : ob.id), h = '<div class="cxb-versoes" role="list">';
      arr(dados.bases).forEach(function (b) {
        var est = b.estado || "interna", ativa = b.id === dados.ativaId;
        var cls = "cxb-card cxb-" + est + (ativa ? " cxb-ativa" : "") + (b.gemea ? " cxb-gemea" : "");
        h += '<div class="' + cls + '" role="listitem" data-base="' + esc(b.id) + '">';
        h += '<div class="cxb-card-cab"><b>v' + esc(b.versao) + '</b> <span class="cxb-est">' + esc(self._BASE_ESTADO[est] || est) + '</span>' + (ativa ? ' <span class="cxb-selo-ativa" title="É contra ela que o previsto × realizado e o IDP comparam.">ATIVA</span>' : '') + '</div>';
        if (b.gemea) h += '<div class="cxb-aviso-linha">' + esc(b.gemea) + '</div>';
        h += '<div class="cxb-card-l">congelada ' + esc(dmaS(b.criadaEm)) + (b.por ? ' por ' + esc(corta(b.por, 40)) : '') + '</div>';
        /* ⚠ término = ÚLTIMO DIA TRABALHADO (a convenção do comparativo, D9).
           O recado do congelamento, o histórico e a grade mostram o dia
           seguinte (o que o motor guarda) — o título diz isso, para a mesma
           v1 não parecer ter duas datas sem explicação. */
        h += '<div class="cxb-card-l" title="Término = último dia trabalhado, como no MS Project. O recado do congelamento e o histórico mostram o dia útil seguinte a ele.">' + esc(b.totalDias) + ' dias úteis · ' + esc(dmaS(b.inicio)) + ' → ' + esc(dmaS(b.termino)) + ' (último dia)</div>';
        if (b.motivo) h += '<div class="cxb-card-l muted" title="' + esc(b.motivo) + '">motivo: ' + esc(corta(b.motivo, 70)) + '</div>';
        if (b.aprovacao) h += '<div class="cxb-card-l">aprovada por ' + esc(corta(b.aprovacao.por, 40)) + ' em ' + esc(dmaS(b.aprovacao.em)) + (b.aprovacao.documento ? ' · ' + esc(corta(b.aprovacao.documento, 40)) : '') + '</div>';
        if (b.anulada) h += '<div class="cxb-card-l muted">' + esc(b.anulada) + '</div>';
        h += '<div class="cxb-card-l cxb-selo-txt">' + esc(b.seloTexto || "") + '</div>';
        h += '<div class="cxb-card-bt">' +
          '<button class="btn sm ghost' + (dados.escolha && dados.escolha.a === b.id ? ' on' : '') + '" data-acao="crono-bases-comp" data-lado="a" data-obra="' + obId + '" data-base="' + esc(b.id) + '" aria-pressed="' + (dados.escolha && dados.escolha.a === b.id ? 'true' : 'false') + '">Comparar como A</button>' +
          '<button class="btn sm ghost' + (dados.escolha && dados.escolha.b === b.id ? ' on' : '') + '" data-acao="crono-bases-comp" data-lado="b" data-obra="' + obId + '" data-base="' + esc(b.id) + '" aria-pressed="' + (dados.escolha && dados.escolha.b === b.id ? 'true' : 'false') + '">Comparar como B</button>';
        if (dados.podeEditar && (est === "interna" || est === "anulada")) h += '<button class="btn sm" data-acao="crono-bases-aprovar" data-obra="' + obId + '" data-base="' + esc(b.id) + '">Registrar aprovação</button>';
        if (dados.admin && b.aprovacaoId) h += '<button class="btn sm ghost" data-acao="crono-bases-anular" data-obra="' + obId + '" data-base="' + esc(b.id) + '" data-evento="' + esc(b.aprovacaoId) + '">Anular aprovação</button>';
        if (dados.admin && !dados.contratual) h += '<button class="btn sm ghost" data-acao="crono-bases-marcar" data-obra="' + obId + '" data-base="' + esc(b.id) + '">Marcar como contratual</button>';
        h += '</div></div>';
      });
      return h + '</div>';
    },
    _basesBarra: function (dados) {
      var e = dados.escolha || {}, ob = dados.obra || {}, obId = esc(ob.id == null ? "" : ob.id);
      function opcoes(lista, valor) {
        return arr(lista).map(function (o) { return '<option value="' + esc(o.id) + '"' + (o.id === valor ? ' selected' : '') + '>' + esc(o.rotulo) + '</option>'; }).join("");
      }
      function seg(nome, valor, itens) {
        return '<span class="cx-seg" role="group">' + itens.map(function (it) {
          var on = it[0] === valor;
          return '<button class="' + (on ? 'on' : '') + '" data-acao="crono-bases-' + nome + '" data-obra="' + obId + '" data-valor="' + it[0] + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(it[1]) + '</button>';
        }).join("") + '</span>';
      }
      var h = '<div class="cxb-barra">';
      h += '<label>Comparar <select data-acao="crono-bases-a" data-obra="' + obId + '" aria-label="Linha de base A">' + opcoes(dados.opcoesA, e.a) + '</select></label>';
      h += '<label>com <select data-acao="crono-bases-b" data-obra="' + obId + '" aria-label="Linha de base B">' + opcoes(dados.opcoesB, e.b) + '</select></label>';
      h += '<span class="muted">realizado até ' + esc(dmaS(dados.corte)) + '</span>';
      h += '<span class="cxb-grupo">Detalhe ' + seg("det", e.detalhe, [["etapa", "Etapa"], ["folha", "Subetapa"], ["servico", "Serviço"]]) + '</span>';
      h += '<span class="cxb-grupo">Mostrar ' + seg("filtro", e.filtro, [["tudo", "Tudo"], ["mudou", "Só o que mudou"], ["critico", "Caminho crítico da A"], ["atrasadas", "Atrasadas"]]) + '</span>';
      h += '<label class="cxb-busca">Buscar <input type="search" data-acao="crono-bases-busca" data-obra="' + obId + '" value="' + esc(e.busca || "") + '" placeholder="nº ou nome"></label>';
      return h + '</div>';
    },
    _basesResumo: function (comp, dados) {
      var T = comp.totais || {}, A = comp.cab.rotA, B = comp.cab.rotB;
      function sn(v) { return v == null ? "—" : (v > 0 ? "+" : (v < 0 ? "−" : "")) + Math.abs(v); }
      function card(tit, corpo) { return '<div class="cxb-kpi"><div class="cxb-kpi-rot">' + esc(tit) + '</div><div class="cxb-kpi-v">' + corpo + '</div></div>'; }
      var h = '<div class="cxb-resumo">';
      var real = T.real ? (T.real.fim ? 'Realizado ' + esc(dmaS(T.real.fim)) : (T.real.fimProj ? 'Plano atual ' + esc(dmaS(T.real.fimProj)) + ' <span class="muted">(' + esc(T.real.rotulo || "") + ')</span>' : '')) : '<span class="muted">sem diário publicado</span>';
      h += card("Término", esc(A) + ' <b>' + esc(dmaS(T.A && T.A.fim)) + '</b> · ' + esc(B) + ' <b>' + esc(dmaS(T.B && T.B.fim)) + '</b><br>Δ B−A: <b>' + sn(T.difTermino && T.difTermino.dc) + ' dia(s) corrido(s)</b> (' + sn(T.difTermino && T.difTermino.du) + ' útil(eis))<br>' + real +
        (T.difRealA != null ? '<br>Δ realizado−A: ' + sn(T.difRealA) + ' dia(s) corrido(s)' : ''));
      h += card("Prazo", esc(A) + ' ' + esc(T.A && T.A.du) + ' dias úteis · ' + esc(B) + ' ' + esc(T.B && T.B.du) + ' dias úteis');
      h += card("Tarefas", esc(T.mudaram) + ' de ' + esc(T.total) + ' mudaram de janela · ' + esc(T.terminamDepois) + ' terminam depois na ' + esc(B) + ' · ' + esc(T.soB) + ' só na ' + esc(B) + ' · ' + esc(T.soA) + ' só na ' + esc(A) +
        (comp.omitidas ? '<br><span class="muted">' + esc(comp.omitidas) + ' linha(s) fora do filtro</span>' : ''));
      var ma = T.critico && T.critico.maiorAtraso;
      h += card("Caminho crítico da " + A, esc(T.critico ? T.critico.n : 0) + ' tarefa(s)' + (ma && ma.du > 0 ? '<br>maior atraso no fim: <b>+' + esc(ma.du) + ' dia(s) útil(eis)</b> (' + esc(ma.numero) + ' ' + esc(corta(ma.nome, 36)) + ')' : '<br>nenhuma termina depois'));
      if (T.cobertura) h += card("Cobertura contratual", esc(T.cobertura.texto));
      return h + '</div>';
    },
    _basesTabela: function (comp, dados) {
      var L = arr(comp.linhas), A = comp.cab.rotA, B = comp.cab.rotB;
      function sn(v) { return v == null ? "—" : (v > 0 ? "+" : (v < 0 ? "−" : "")) + Math.abs(v); }
      var h = '<div class="cxb-sec"><b>Variações</b> <span class="muted">— ' + L.length + ' linha(s)</span></div>';
      if (!L.length) return h + '<p class="muted cxb-vazio">Nenhuma linha com este filtro.</p>';
      h += '<div class="cx-tabela cxb-tabela"><table class="tbl cxb-tab"><thead><tr><th>Nº</th><th>Etapa / subetapa / serviço</th>' +
        '<th>' + esc(A) + ' início</th><th>' + esc(A) + ' término</th><th>' + esc(B) + ' início</th><th>' + esc(B) + ' término</th>' +
        '<th class="num" title="dias corridos">Δ início</th><th class="num" title="dias corridos (dias úteis no calendário da ' + esc(A) + ')">Δ término</th><th class="num" title="dias úteis">Δ duração</th>' +
        '<th>Real início</th><th>Real término</th><th class="num" title="dias corridos do término da ' + esc(A) + ' ao real (ou ao previsto pelo plano atual)">Δ real × ' + esc(A) + '</th><th>Situação</th></tr></thead><tbody>';
      L.forEach(function (l) {
        var sit = [];
        if (l.presenca === "so-A") sit.push("só na " + A + (l.opcional ? " (opcional fora da " + B + ")" : " (saiu do escopo)"));
        if (l.presenca === "so-B") sit.push("só na " + B + (l.opcional ? " (opcional incluída só na " + B + ")" : ""));
        if (l.semServico) sit.push("a " + (l.semServico === "B" ? B : A) + " não guarda serviço");
        if (l.mudouDeEtapa) sit.push("mudou de etapa");
        if (l.mudouDeFolha) sit.push("mudou de subetapa: " + (l.mudouDeFolha[0] || "?") + " → " + (l.mudouDeFolha[1] || "?"));
        if (!sit.length && l.presenca === "ambas") sit.push(l.mudou ? (l.dFimDC > 0 ? "termina depois" : (l.dFimDC < 0 ? "termina antes" : "mudou")) : "igual");
        if (l.atrasada) sit.push("atrasada");
        var real = l.R ? (l.R.fim ? esc(dmaS(l.R.fim)) : (l.R.fimProj ? '<span class="muted" title="' + esc(l.R.rotulo || "") + '">em andamento — ' + esc(dmaS(l.R.fimProj)) + ' pelo plano atual</span>' : '<span class="muted">em andamento</span>')) : (l.tipo === "servico" ? '<span class="muted" title="O realizado por serviço aparece por subetapa no Previsto × Realizado.">—</span>' : '—');
        h += '<tr class="cxb-l-' + esc(l.tipo) + (l.mudou ? ' cxb-mudou' : '') + '" data-no="' + esc(l.id) + '"><td class="cx-n">' + esc(l.numero) + '</td>' +
          '<td class="cx-nome" title="' + esc(l.nome) + '">' + (l.tipo === "etapa" ? '' : '<span class="cxb-rec' + (l.tipo === "servico" ? '2' : '') + '"></span>') + esc(corta(l.nome, 80)) + '</td>' +
          '<td>' + (l.A ? esc(dmaS(l.A.ini)) : '—') + '</td><td>' + (l.A ? esc(dmaS(l.A.fim)) : '—') + '</td>' +
          '<td>' + (l.B ? esc(dmaS(l.B.ini)) : '—') + '</td><td>' + (l.B ? esc(dmaS(l.B.fim)) : '—') + '</td>' +
          '<td class="num">' + sn(l.dIniDC) + '</td><td class="num">' + sn(l.dFimDC) + (l.dFimDU != null && l.dFimDU !== l.dFimDC ? ' <span class="muted">(' + sn(l.dFimDU) + ' út.)</span>' : '') + '</td>' +
          '<td class="num">' + sn(l.dDurDU) + '</td>' +
          '<td>' + (l.R && l.R.ini ? esc(dmaS(l.R.ini)) : '—') + '</td><td>' + real + '</td>' +
          '<td class="num">' + sn(l.dRealA) + '</td><td>' + esc(sit.join(" · ")) + '</td></tr>';
      });
      return h + '</tbody></table></div>';
    },
    _basesRodape: function (dados) {
      var oc = dados.ocupacao || {}, h = '';
      function kbs(b) { return b == null ? "?" : nBR(b / 1024, 0); }
      if (oc.crono || oc.selo) {
        h += '<p class="muted cxb-rodape">A contratual nunca é resumida nem perde o detalhe para caber na nuvem. Espaço: planejamento das obras ' + esc(kbs(oc.crono && oc.crono.bytes)) + ' de 900 KB' +
          ' · linhas de base seladas ' + esc(kbs(oc.selo && oc.selo.bytes)) + ' de 900 KB' + (oc.selo && oc.selo.comServico != null ? ' (' + esc(oc.selo.comServico) + ' com detalhe por serviço)' : '') + '.</p>';
      }
      if (dados.orfaos && dados.orfaos.n) {
        h += '<div class="cx-aviso">' + esc(dados.orfaos.n + " registro(s) de linha de base selada de obra(s) que não existem mais neste aparelho ocupam " + kbs(dados.orfaos.bytes) + " KB. Nada é apagado sozinho.") +
          (dados.admin ? ' <button class="btn sm" data-acao="crono-bases-orfaos" data-obra="' + esc(dados.obra && dados.obra.id || "") + '">Ver e decidir</button>' : ' <span class="muted">O administrador da conta decide o que fazer com eles.</span>') + '</div>';
      }
      return h;
    },
    /* GANTT COMPARATIVO — o `gantt` de sempre (NUNCA editado), com as duas
       faixas desenhadas pela tomada `opts.camadas.depois` (T7): A em cima, B
       embaixo, a barra do plano atual no meio. As datas viram índice no
       calendário do `r` (a régua das barras), como a base fantasma faz.
       ⚠ A faixa vai até o FIM do último dia trabalhado (índice + 1): a janela
       das barras é [início, fim), e o término da comparação é o último dia.
       ⚠ Base que termina depois do plano ALARGA o desenho (cópia rasa do `r`
       com `totalDias` maior): cortada na borda, a obra que recuperou o atraso
       pareceria ter prometido menos. */
    ganttComparar: function (r, comp, opts) {
      opts = opts || {};
      var Cr = C(), CCm = MOD("CronoComp", "./cronocomp.js");
      if (!r || !arr(r.etapas).length || !comp || !comp.ok || !Cr || !CCm) return "";
      var jan = CCm.janelas(comp), cal = null;
      try { cal = Cr.calendario(r); } catch (e) { cal = null; }
      if (!cal) return "";
      var lim = Math.ceil((r.totalDias || 1) * 4) + 400, maxK = r.totalDias || 1;
      function idx(sd) {
        var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(sd || ""));
        if (!m) return null;
        var k = cal.indice(new Date(+m[1], +m[2] - 1, +m[3]).getTime(), lim);
        return k < 0 ? 0 : k;
      }
      function faixas(J) {
        var out = {}, id;
        for (id in J) if (own(J, id)) {
          var i0 = idx(J[id].ini), i1 = idx(J[id].fim);
          if (i0 == null || i1 == null) continue;
          var f = J[id].marco ? i0 : Math.max(i0, i1) + 1;
          out[id] = { i: i0, f: f, marco: !!J[id].marco, ini: J[id].ini, fim: J[id].fim };
          if (f > maxK) maxK = f;
        }
        return out;
      }
      var FA = faixas(jan.A), FB = faixas(jan.B);
      var rG = r;
      if (maxK > (r.totalDias || 0)) { rG = {}; var k; for (k in r) if (own(r, k)) rG[k] = r[k]; rG.totalDias = maxK; }
      var rotA = comp.cab.rotA, rotB = comp.cab.rotB;
      function depois(g) {
        var s = "";
        g.L.forEach(function (l, i) {
          if (i < g.lin0 || i > g.lin1) return;
          var id = l.no ? l.no.id : l.et.id, y0 = g.yRow(i);
          [["A", FA, y0 + 1, "gantt-base-a", "#334155", rotA], ["B", FB, y0 + g.rowH - 4, "gantt-base-b", "#0d6ebd", rotB]].forEach(function (q) {
            var x = q[1][id];
            if (!x) return;
            var tit = '<title>' + esc(q[5] + ": " + dmaS(x.ini) + (x.marco ? " (marco)" : " → " + dmaS(x.fim))) + '</title>';
            if (x.marco) {
              var cx = g.X(x.i), cy = q[2] + 1.5;
              s += '<polygon class="' + q[3] + ' gantt-base-marco" points="' + f1(cx) + ',' + f1(cy - 3.5) + ' ' + f1(cx + 3.5) + ',' + f1(cy) + ' ' + f1(cx) + ',' + f1(cy + 3.5) + ' ' + f1(cx - 3.5) + ',' + f1(cy) + '" fill="#fff" stroke="' + q[4] + '" stroke-width="1.2">' + tit + '</polygon>';
            } else {
              s += '<rect class="' + q[3] + '" x="' + f1(g.X(x.i)) + '" y="' + f1(q[2]) + '" width="' + f1(Math.max(2, (x.f - x.i) * g.pxDia)) + '" height="3" fill="' + q[4] + '">' + tit + '</rect>';
            }
          });
        });
        return s;
      }
      var det = comp.detalhe === "etapa" ? "etapa" : (comp.detalhe === "servico" ? "servico" : "subetapa");
      return '<div class="cxb-gantt">' + this.gantt(rG, { detalhe: det, camadas: { depois: depois }, realizado: opts.realizado || null, hoje: opts.corte || null, rotHoje: "data de corte" }) +
        '<div class="cx-leg cxb-leg"><span><i class="cxb-leg-a"></i>faixa de cima: ' + esc(rotA) + '</span><span><i class="cxb-leg-b"></i>faixa de baixo: ' + esc(rotB) + '</span>' +
        '<span>barra: plano atual</span><span>faixa escura: executado</span><span>linha laranja: data de corte</span></div></div>';
    },
    /* a sub-aba só existe onde o previsto × realizado existe: Gestão de Obras
       e a obra ligada A ESTE orçamento (a mesma regra da "real"), e com o
       recurso `bases` ligado (§6.2) */
    _basesQuando: function (d) {
      var info = d && d.obra, a = info && info.alvo;
      if (!(info && info.podeGestao && a && a.obra && a.nivel === 0)) return false;
      var Cr = C();
      try { if (Cr && typeof Cr.recursos === "function" && Cr.recursos().bases === false) return false; } catch (e) {}
      return true;
    },
    _basesRender: function (d, est) {
      var A = G("App"), ob = d && d.obra && d.obra.alvo && d.obra.alvo.obra;
      var dados = null;
      try { dados = (A && typeof A._cronoBasesDados === "function" && ob) ? A._cronoBasesDados(ob.id, est) : null; } catch (e) { dados = { erro: "Não consegui montar as linhas de base desta obra (" + String((e && e.message) || e) + ") — a sub-aba Cronograma continua valendo." }; }
      if (!dados) dados = { erro: "As linhas de base desta obra não puderam ser lidas agora — recarregue o app." };
      return this.basesPainel(dados);
    },
    /* o registro da sub-aba (T8), feito UMA vez, ao carregar o módulo: a
       tomada guarda o registro no próprio módulo, e o `barra`/`render` o
       consultam. Entre "Previsto × Realizado" e "Parâmetros" (BASES §a). */
    _regBasesSub: (function () {
      _subsReg.push({ id: "bases", nome: "Linhas de base", depoisDe: "real",
        quando: function (d, est) { return CronoExecUI._basesQuando(d, est); },
        render: function (d, est) { return CronoExecUI._basesRender(d, est); } });
      return 1;
    })(),
    /*
     * ↑ região da fatia 1B: `basesPainel`, `ganttComparar`, o registro da
     * sub-aba "Linhas de base" (registrarSub). Quatro linhas entre regiões:
     * mudanças de fatias diferentes nunca ficam em linhas vizinhas.
     */
    /* ===== PLANEJADOR: uso (1C) ===== */
    _regUso: 1,
    /* O ESTADO DE USO de um alvo (busca, filtro, pilha), lido da memória do
       App por `chave` ("orc:<id>" | "plano:<obraId>"). ⚠ Estado de TELA: nada
       daqui vai ao orçamento, ao plano ou às `prefs` (USO §7-1). Sem App (o
       PDF, as suítes do desenho) → tudo desligado. */
    estadoUso: function (app, chave) {
      function de(m) { return (app && chave && app[m] && typeof app[m] === "object" && own(app[m], chave)) ? app[m][chave] : null; }
      var b = de("_cronoBusca") || {}, f = de("_cronoFiltro") || {};
      var Cr = C(), rec = (Cr && typeof Cr.recursos === "function") ? Cr.recursos() : {};
      return {
        chave: chave ? String(chave) : "",
        busca: { texto: String(b.texto == null ? "" : b.texto), idx: Math.max(0, Math.floor(Number(b.idx) || 0)), soAchados: b.soAchados === true },
        filtro: { critico: f.critico === true, atrasadas: f.atrasadas === true, naoConcluidas: f.naoConcluidas === true,
          periodo: (f.periodo === "semana" || f.periodo === "2semanas") ? f.periodo : "tudo", marcos: f.marcos === true, fixadas: f.fixadas === true,
          categorias: arr(f.categorias).slice(), extras: (f.extras === "so" || f.extras === "esconder") ? f.extras : null,
          soAchados: b.soAchados === true, fixos: (f.fixos && typeof f.fixos === "object" && !ehArr(f.fixos)) ? f.fixos : {} },
        pilha: de("_cronoPilha"),
        filtroAberto: !!(app && app._cronoFiltroAberto === chave && chave),
        atual: null,
        ligado: { filtro: rec.filtro !== false, pilha: rec.pilha !== false, historico: rec.historico !== false }
      };
    },

    /* O FILTRO DO RENDER — UMA resolução por render, lida por quem desenha o
       Gantt, a tabela e pela fiação do arrasto (`App._cronoGanttCtx`,
       `App._gxNLinhas`). ⚠ Sem isto, a altura sairia de um número de linhas
       e o arrasto de outra lista: "a pessoa arrasta uma barra e vê outra se
       mexer" (USO §3.1). O memo é pelo contador de render (`app._rtok`) e
       pelo alvo; `pd` (a montagem única do painel da obra) dá a situação e o
       realizado de cada nó — o 2º leitor do mesmo render recebe o memo.
       Devolve null sem estado de uso. */
    _filtroMemo: null,
    filtroDoRender: function (app, r, est, pd) {
      var F = MOD("CronoFiltro", "./cronofiltro.js");
      var u = est && est.uso;
      if (!F || !u || !r) return null;
      var det = this.detalheEfetivo(r, est.detalhe), ab = est.abertas || {};
      var tok = (app && app._rtok != null) ? app._rtok : null;
      var ch = [tok, u.chave, det, JSON.stringify(ab), F.chave(u.filtro, u.busca)].join("#");
      var mm = this._filtroMemo;
      if (tok != null && mm && mm.ch === ch) return mm.v;
      var L = this.linhas(r, { detalhe: det, abertas: ab });
      var Ltodas = this.linhas(r, { detalhe: det, abertas: {} });
      var busca = u.busca.texto ? F.buscar(r, u.busca.texto, Ltodas, { detalhe: det }) : null;
      var sit = null, real = null, P = pd && pd.painel;
      if (P && (P.estado === "ok" || P.estado === "sem-diarios")) {
        sit = {}; real = {};
        arr(P.nos).forEach(function (n) { if (n && n.id != null) { sit[String(n.id)] = n.situacao || ""; if (n.realPct != null) real[String(n.id)] = n.realPct; } });
      }
      var res = F.resolver(r, u.filtro, { L: L, detalhe: det, hoje: u.hojeData || new Date(), situacao: sit, real: real,
        restricoes: (u.restricoes && typeof u.restricoes === "object") ? u.restricoes : null, busca: busca });
      var v = { chave: u.chave, det: det, res: res, busca: busca, manter: res.ativo ? res.manter : null,
        contexto: res.contexto || {}, fora: res.fora || {}, comSituacao: !!sit };
      if (tok != null) this._filtroMemo = { ch: ch, v: v };
      return v;
    },

    /* a CAMADA de uso no desenho (T7: `opts.camadas.antes`, por baixo das
       barras): faixa âmbar com contorno nos achados, mais forte no atual, e
       cinza nas linhas que só situam. ⚠ Nunca edita `gantt`. Tintas CRAVADAS
       (o Gantt é papel branco nos dois temas); contorno #b45309 sobre branco
       = 5,0:1 (≥ 3:1 exigido para realce, USO §9.2-a5), e o do ATUAL #92400e.
       ⚠ CONTORNO DE 2 px NOS DOIS. Com 1 px na borda inteira da linha o traço
       caía em meio pixel, o navegador o espalhava por duas linhas de pixels a
       50% e o contraste medido no print era 2,06:1 (e2e-crono-busca,
       17/09/2026). 2 px têm sempre uma linha de pixels cheia, em qualquer
       deslocamento da página. */
    camadaUso: function (pro) {
      var uso = pro && pro.uso;
      if (!uso || (!uso.achados && !uso.contexto && !uso.fora)) return null;
      return {
        antes: function (g) {
          var s = "", i;
          for (i = g.lin0; i <= g.lin1; i++) {
            var l = g.L[i]; if (!l) continue;
            var n = l.no || l.et, id = String(n && n.id), y = g.yRow(i);
            if (uso.contexto && own(uso.contexto, id)) s += '<rect class="gx-uso-ctx" x="0" y="' + f1(y) + '" width="' + f1(g.W) + '" height="' + f1(g.rowH) + '" fill="#e2e8f0" fill-opacity="0.55"/>';
            if (uso.fora && own(uso.fora, id)) s += '<rect class="gx-uso-fora" x="0.5" y="' + f1(y + 0.5) + '" width="' + f1(g.W - 1) + '" height="' + f1(g.rowH - 1) + '" fill="none" stroke="#64748b" stroke-width="1" stroke-dasharray="4,3"><title>fora do filtro depois da edição — [Reaplicar filtro] na faixa acima</title></rect>';
            if (uso.achados && own(uso.achados, id)) {
              var at = uso.atual != null && String(uso.atual) === id;
              s += '<rect class="gx-achado' + (at ? ' gx-atual' : '') + '" x="1" y="' + f1(y + 1) + '" width="' + f1(g.W - 2) + '" height="' + f1(g.rowH - 2) + '" rx="3" fill="#fde68a" fill-opacity="' + (at ? '0.85' : '0.45') +
                '" stroke="' + (at ? '#92400e' : '#b45309') + '" stroke-width="2"/>';
            }
          }
          return s;
        }
      };
    },

    /* A BARRA DE USO — a primeira faixa DENTRO da moldura do Gantt (USO §1.1),
       40 px (+GX_USO). Fica colada ao que ela muda (memória "ação mora no
       card do número"): botão solto fora da moldura não é encontrado.
       ⚠ `data-rel-livre` no campo de busca: o foco nele não segura a
       releitura de outra janela (não há edição do cronograma ali). */
    ganttBarraUso: function (uso, pro, o) {
      if (!uso) return "";
      o = o || {};
      var Pi = MOD("CronoPilha", "./cronopilha.js"), h = '<div class="gx-uso" data-gx-uso="1">';
      if (uso.ligado.filtro) {
        /* ⚠ o contador e os ‹ › contam a lista que a NAVEGAÇÃO visita (com o
           filtro ligado, só os achados da tela — `CronoFiltro.navegaveis`) */
        var Fb = MOD("CronoFiltro", "./cronofiltro.js"), b = uso.busca, fr = o.fu && o.fu.busca;
        var navB = (Fb && fr) ? Fb.navegaveis(fr, o.fu.manter) : { ids: [], fora: 0 }, tot = navB.ids.length;
        var cont = Fb ? Fb.textoContador(b.texto, b.idx, navB) : "";
        h += '<span class="gx-uso-busca" role="search">' +
          '<input type="search" class="gx-uso-in" data-crono-busca="1" data-rel-livre="1" autocomplete="off" spellcheck="false" value="' + esc(b.texto) +
          '" placeholder="Buscar no cronograma (nº, código ou nome) — Ctrl+F" aria-label="Buscar no cronograma por nº, código ou nome (Ctrl+F com o foco no Gantt)" title="Enter ou F3: próximo · Shift+Enter: anterior · Esc: limpar">' +
          '<span class="gx-uso-cont" data-gx-busca-cont="1" aria-live="polite">' + esc(cont) + '</span>' +
          '<button type="button" class="gx-zb" data-acao="crono-busca-ant" aria-label="Achado anterior" title="Achado anterior (Shift+Enter)"' + (tot > 1 ? '' : ' disabled') + '>‹</button>' +
          '<button type="button" class="gx-zb" data-acao="crono-busca-prox" aria-label="Próximo achado" title="Próximo achado (Enter ou F3)"' + (tot > 1 ? '' : ' disabled') + '>›</button>' +
          '<label class="gx-uso-so" title="Mostra só as linhas achadas (a mãe de cada uma aparece em cinza, para situar)"><input type="checkbox" data-acao="crono-busca-so"' + (b.soAchados ? ' checked' : '') + '> Só os achados</label>' +
          '</span>';
        var res = o.fu && o.fu.res, nAtivos = 0, chips = "";
        arr(res && res.rotulos).forEach(function (x) {
          if (x.k === "soAchados") return;
          nAtivos++;
          chips += '<button type="button" class="gx-uso-chip' + (x.indisponivel ? ' gx-uso-chip-ind' : '') + '" data-acao="crono-filtro-tirar" data-crit="' + esc(x.k) + '" title="' +
            esc(x.indisponivel ? "Este critério não está valendo: " + ((res.indisponivel || {})[x.k] || "") + " Clique para tirar." : "Tirar este critério do filtro") + '">' + esc(x.rot) + ' ×</button>';
        });
        h += '<span class="gx-uso-filtro"><button type="button" class="gx-uso-bt" data-acao="crono-filtro-abrir" aria-expanded="' + (uso.filtroAberto ? 'true' : 'false') + '" title="Filtrar as linhas do Gantt e da tabela (só nesta janela)">Filtrar ▾' + (nAtivos ? ' (' + nAtivos + ')' : '') + '</button>' + chips +
          (uso.filtroAberto ? this.filtroPainelHtml(uso, o.fu) : '') + '</span>';
      }
      h += '<span class="gx-uso-dir">';
      if (uso.ligado.pilha && Pi) {
        var p = uso.pilha, at = uso.atual;
        var impD = Pi.impedimento(p, at, "desfazer"), impR = Pi.impedimento(p, at, "refazer");
        var tD = Pi.tituloBotao(p, at, "desfazer"), tR = Pi.tituloBotao(p, at, "refazer");
        /* ⚠ o botão desligado continua lendo o título (a trava diz por quê) —
           `aria-disabled`, e não `disabled`, para o título aparecer */
        h += '<button type="button" class="gx-zb gx-uso-pilha" data-acao="crono-pilha-desfazer" aria-label="Desfazer" aria-disabled="' + (impD ? 'true' : 'false') + '" title="' + esc(tD) + '">↶</button>' +
          '<button type="button" class="gx-zb gx-uso-pilha" data-acao="crono-pilha-refazer" aria-label="Refazer" aria-disabled="' + (impR ? 'true' : 'false') + '" title="' + esc(tR) + '">↷</button>';
      }
      h += '<button type="button" class="gx-uso-bt" data-acao="crono-alt-abrir" title="Histórico de alterações deste cronograma: quem mudou o quê, quando e por onde (sincroniza entre aparelhos)">' + ic("relogio") + ' Histórico</button>';
      h += '</span></div>';
      var rec = o.fu && o.fu.busca ? (MOD("CronoFiltro", "./cronofiltro.js") || { recadoBusca: function () { return { texto: "" }; } }).recadoBusca(o.fu.busca, o.fu.det) : { texto: "" };
      if (uso.ligado.filtro && rec.texto) {
        h += '<div class="gx-uso-recado" data-gx-busca-recado="1">' + esc(rec.texto) +
          (rec.porta ? ' <button type="button" class="gx-uso-link" data-acao="crono-busca-detalhe" data-det="' + esc(rec.porta) + '">Ver em ' + (rec.porta === "servico" ? "Serviço" : "Subetapa") + '</button>' : '') + '</div>';
      }
      if (uso.ligado.filtro && o.fu && o.fu.res && o.fu.res.ativo) h += this.filtroFaixaHtml(o.fu, "gantt");
      return h;
    },

    /* O PAINEL DO FILTRO (não é modal; USO §1.3): quantas linhas cada opção
       deixaria, e a opção sem dado DESLIGADA com o motivo. */
    filtroPainelHtml: function (uso, fu) {
      var s = uso.filtro, res = (fu && fu.res) || {}, cnt = res.contagem || {}, ind = res.indisponivel || {};
      var F = MOD("CronoFiltro", "./cronofiltro.js");
      function cx(k, rot, extra) {
        var dis = own(ind, k) && (k === "atrasadas" || k === "naoConcluidas" || cnt[k] === 0 || k === "extras");
        var nn = cnt[k] == null ? "" : (cnt[k] + " linha" + (cnt[k] === 1 ? "" : "s"));
        var marcado = k === "extras" ? !!s.extras : s[k] === true;
        return '<label class="gx-fp-lin' + (dis && !marcado ? ' gx-fp-off' : '') + '"' + (dis ? ' title="' + esc(ind[k]) + '"' : '') + '><input type="checkbox" data-acao="crono-filtro-marcar" data-crit="' + k + '"' +
          (marcado ? ' checked' : '') + (dis && !marcado ? ' disabled' : '') + '> <span>' + esc(rot) + '</span><span class="gx-fp-n">' + esc(dis && !marcado ? ind[k] : nn) + '</span>' + (extra || '') + '</label>';
      }
      var j1 = F ? F.janela(uso.hojeData || new Date(), "semana") : null, j2 = F ? F.janela(uso.hojeData || new Date(), "2semanas") : null;
      function per(v, rot) {
        var nk = v === "tudo" ? null : cnt["periodo:" + v];
        return '<label class="gx-fp-lin"><input type="radio" name="gx-fp-per" data-acao="crono-filtro-periodo" data-per="' + v + '"' + (s.periodo === v ? ' checked' : '') + '> <span>' + esc(rot) + '</span>' +
          '<span class="gx-fp-n">' + (nk == null ? '' : esc(nk + " linha" + (nk === 1 ? "" : "s"))) + '</span></label>';
      }
      var cats = arr(uso.categorias);
      var h = '<div class="gx-fp" role="dialog" aria-label="Filtrar o cronograma" data-rel-livre="1">' +
        '<div class="gx-fp-tit">Mostrar só</div>' +
        cx("critico", "Caminho crítico") +
        cx("atrasadas", "Atrasadas no previsto × realizado", fu && fu.comSituacao ? ' <span class="gx-fp-dica">(corte do último diário)</span>' : '') +
        cx("naoConcluidas", "Não concluídas") +
        '<div class="gx-fp-tit">Período</div>' + per("tudo", "Toda a obra") + per("semana", "Esta semana" + (j1 ? " (" + j1.rotulo + ")" : "")) +
        per("2semanas", "Próximas 2 semanas" + (j2 ? " (" + j2.rotulo + ")" : "")) +
        cx("marcos", "Marcos") + cx("fixadas", "Com data fixada no Gantt");
      if (!own(ind, "extras")) {
        h += '<div class="gx-fp-tit">Tarefas sem preço</div>' +
          '<label class="gx-fp-lin"><input type="radio" name="gx-fp-ext" data-acao="crono-filtro-extras" data-ext=""' + (!s.extras ? ' checked' : '') + '> <span>Mostrar junto</span></label>' +
          '<label class="gx-fp-lin"><input type="radio" name="gx-fp-ext" data-acao="crono-filtro-extras" data-ext="so"' + (s.extras === "so" ? ' checked' : '') + '> <span>Só tarefas sem preço</span><span class="gx-fp-n">' + esc((cnt.extras || 0) + " linha" + (cnt.extras === 1 ? "" : "s")) + '</span></label>' +
          '<label class="gx-fp-lin"><input type="radio" name="gx-fp-ext" data-acao="crono-filtro-extras" data-ext="esconder"' + (s.extras === "esconder" ? ' checked' : '') + '> <span>Esconder tarefas sem preço</span></label>';
      }
      if (cats.length) {
        h += '<div class="gx-fp-tit">Categoria</div><div class="gx-fp-cats">';
        cats.forEach(function (c) {
          h += '<label class="gx-fp-lin"><input type="checkbox" data-acao="crono-filtro-cat" data-cat="' + esc(c.id) + '"' + (s.categorias.indexOf(String(c.id)) > -1 ? ' checked' : '') + '> <span>' + esc(c.nome) + '</span></label>';
        });
        h += '</div>';
      }
      return h + '<div class="gx-fp-acoes"><button type="button" class="gx-uso-bt" data-acao="crono-filtro-limpar">Limpar filtro</button>' +
        '<button type="button" class="gx-uso-bt" data-acao="crono-filtro-fechar">Fechar</button></div></div>';
    },

    /* A FAIXA ÂMBAR, SEMPRE VISÍVEL COM O FILTRO LIGADO — acima do Gantt e
       acima da tabela. ⚠ Sem ela a pessoa acha que a tarefa sumiu. */
    filtroFaixaHtml: function (fu, onde) {
      var F = MOD("CronoFiltro", "./cronofiltro.js");
      if (!F || !fu || !fu.res || !fu.res.ativo) return "";
      var extra = onde === "gantt" ? "O histograma e os painéis abaixo somam a obra inteira; o PDF e os documentos saem inteiros." : "";
      var temFora = Object.keys(fu.res.fora || {}).length > 0;
      return '<div class="gx-faixa-filtro" data-gx-faixa="' + esc(onde || "") + '" role="status"><span>⚑ ' + esc(F.textoFaixa(fu.res, extra)) + '</span>' +
        (temFora ? '<button type="button" class="gx-uso-bt" data-acao="crono-filtro-reaplicar">Reaplicar filtro</button>' : '') +
        '<button type="button" class="gx-uso-bt" data-acao="crono-filtro-limpar">Limpar filtro</button></div>';
    },

    /* O HISTÓRICO (modal largo; USO §1.5). dados = {titulo, eventos (do mais
       novo ao mais velho), lacunas (CronoAlt.lacunas), r (o resultado de
       hoje: o nº atual das tarefas sem preço), nomes, soLinha {id, n},
       semLeitura (recado da quarentena)}. Texto puro em tudo o que vem do
       disco (o nome da pessoa, o texto do evento). */
    altHtml: function (dados) {
      var A = MOD("CronoAlt", "./cronoalt.js"), d = dados || {};
      if (d.semLeitura) return '<div class="cx-aviso">' + esc(d.semLeitura) + '</div>';
      var evs = arr(d.eventos), lac = arr(d.lacunas), r = d.r, nomes = d.nomes || {};
      function quando(iso) {
        var t = new Date(String(iso || ""));
        if (isNaN(t.getTime())) return "—";
        return dd(t.getDate()) + "/" + dd(t.getMonth() + 1) + " " + dd(t.getHours()) + ":" + dd(t.getMinutes());
      }
      function prazo(pz) {
        if (!ehArr(pz) || pz[0] == null || pz[1] == null) return "—";
        if (pz[0] === pz[1]) return nBR(pz[1], 0) + " d.u. (sem mudança)";
        return nBR(pz[0], 0) + " → " + nBR(pz[1], 0) + " d.u." + (pz[2] ? " (entrega " + dmaS(pz[2]) + ")" : "");
      }
      function linhaLacuna(l) {
        return '<tr class="cx-alt-lac"><td>⚠ entre ' + esc(quando(l.de)) + ' e ' + esc(l.ate ? quando(l.ate) : "agora") + '</td><td>—</td><td><b>Alteração sem registro.</b> ' +
          /* ⚠ sem número de versão no texto: o número que vai ao ar não é
             decisão desta tela, e número cravado na interface envelhece
             (o `ver` de cada evento já diz a versão de quem gravou) */
          esc("Foi feita num aparelho com o app desatualizado (sem este histórico), em outra janela, por restauração de backup ou por um caminho que não registra. O histórico não sabe o que mudou nem quem mudou.") +
          '</td><td>—</td><td>—</td></tr>';
      }
      var lacDepois = {};
      lac.forEach(function (l) { if (l.depoisDe) (lacDepois[l.depoisDe] = lacDepois[l.depoisDe] || []).push(l); });
      if (!evs.length) {
        return '<p class="muted cx-alt-vazio">' + esc("Nenhuma alteração registrada ainda. O histórico começa a ser gravado com a atualização que o trouxe — o que foi feito antes dela não aparece aqui.") + '</p>';
      }
      var h = (d.soLinha ? '<p class="cx-alt-so">Só esta linha (' + esc(d.soLinha.n || d.soLinha.id) + ') · <button type="button" class="gx-uso-link" data-acao="crono-alt-tudo">ver tudo</button></p>' : '') +
        '<div class="cx-tabela"><table class="tbl cx-alt"><thead><tr><th>Quando</th><th>Quem</th><th>O que mudou</th><th>Prazo da obra</th><th>Por onde</th></tr></thead><tbody>';
      evs.forEach(function (e) {
        /* a lacuna DEPOIS deste evento aparece ACIMA dele (a lista vai do mais
           novo ao mais velho) */
        arr(lacDepois[e.id]).forEach(function (l) { h += linhaLacuna(l); });
        var ms = arr(e.m).map(function (x) {
          var nh = null;
          if (A && x.id && /^x_/.test(String(x.id))) {
            var q = A.numeroHoje(r, x.id);
            if (q && q.excluida) nh = "(excluída)";
            else if (q && q.n && q.n !== x.n) nh = "hoje " + q.n;
          }
          return '<li>' + esc(A ? A.textoMudanca(x, nomes, nh) : String(x.c || "")) + '</li>';
        }).join("");
        if (Number(e.x) > 0) ms += '<li class="muted">e mais ' + nBR(Number(e.x), 0) + ' alteraç' + (Number(e.x) === 1 ? 'ão' : 'ões') + ' nesta sessão</li>';
        var porOnde = (A && A.ORIGENS[e.o]) || String(e.o || "");
        var ver = "";
        var alvoNo = arr(e.m).filter(function (x) { return x && x.id; })[0];
        if (alvoNo) ver = ' · <button type="button" class="gx-uso-link" data-acao="crono-alt-ver" data-no="' + esc(alvoNo.id) + '">Ver linha</button>';
        h += '<tr><td>' + esc(quando(e.atualizadoEm)) + '</td><td>' + esc(e.por || "—") + '</td><td><div>' + esc(e.r || "") + '</div>' + (ms ? '<ul class="cx-lista cx-alt-m">' + ms + '</ul>' : '') +
          '</td><td>' + esc(prazo(e.pz)) + '</td><td>' + esc(porOnde) + (e.ver ? ' <span class="muted">(' + esc(e.ver) + ')</span>' : '') + ver + '</td></tr>';
      });
      h += '</tbody></table></div>';
      return h + '<p class="muted cx-alt-rodape">' + esc("O histórico guarda as 60 últimas sessões de alteração deste cronograma (e até 800 na empresa) e viaja pela nuvem. Não guarda valores em R$. Para voltar uma alteração, use Desfazer (nesta janela) ou ajuste pela grade.") + '</p>';
    },
    /*
     * ↑ região da fatia 1C: busca, filtro, pilha, sino e histórico.
     *
     *
     */
    /* ===== PLANEJADOR: gantt (2A) ===== */
    _regGantt: 1,
    /* ==================================================================
       PLANEJADOR — FATIA 2A: O QUE O GANTT DESENHA DAS QUATRO FUNÇÕES
       ==================================================================
       Aqui moram as CAMADAS (D30), as linhas das tarefas sem preço, a barra
       que o avanço substitui e os pedaços novos da linha do prazo. Tudo puro:
       recebe o resultado do motor e o estado de tela, devolve HTML ou SVG.
       Nada grava — quem grava é a região `gantt` do js/app.js.

       ⚠ POR QUE PELAS TOMADAS, E NÃO EDITANDO O `gantt`
       O `gantt()` é o mesmo desenho do PDF, da proposta, do painel da obra e
       do previsto × realizado. Cada função nova que escrevesse dentro dele
       deixaria as 38 instalações a um `if` de distância de um desenho
       diferente no papel do cliente. Por isso a Onda 0 abriu as portas
       (`opts.intercalar`, `opts.barraDe`, `opts.camadas`) e a 2A só as
       preenche: sem dado novo, nenhuma delas é passada e o SVG é byte a byte
       o de hoje (tools/test-crono-tomadas.js).
       ------------------------------------------------------------------ */

    /* AS CAMADAS (D30, §1.7, crítica 2, achado 17). Cada uma some do DESENHO
       quando desligada — o motor, a tabela e o papel não mudam.
       ⚠ "Apresentar" desliga todas de uma vez E esconde o chip de
       compatibilidade: é o Gantt que o cliente vê numa reunião, e nada de
       planejamento interno ("folga de 3 dias", "aparelhos 1.2.81") pode
       aparecer ali. Mas o botão passa a DIZER "Camadas: apresentar", porque
       informação escondida sem aviso é a pessoa decidindo sobre um desenho
       que ela acha completo. */
    CAMADAS_2A: [
      /* ⚠ "Folgas" cobre a folga LIVRE e a NEGATIVA — as duas que a 2A
         desenhou. A folga tracejada depois da barra é o desenho de sempre,
         o mesmo das 38 instalações e o mesmo do PDF: esconder ela por aqui
         faria o desenho da tela divergir do papel sem ninguém pedir. Quem a
         tira é o `limpo` do Gantt do cliente (ver `UI._gantt`). O rótulo diz
         isso, porque caixa que promete mais do que faz é recado que mente. */
      ["folgas", "Folga livre e folga negativa", "quanto a tarefa atrasa sem empurrar ninguém, e a folga negativa (a tracejada de sempre não muda)"],
      ["restricoes", "Datas e restrições", "os colchetes das datas fixadas e o ⧗ do piso escrito pelo app"],
      ["cal", "Calendários das frentes", "os dias em que a frente daquela linha não trabalha"],
      ["avanco", "Avanço lançado", "os três trechos da barra e a linha da data de corte"],
      ["rotulos", "Rótulos das ligações", "o tipo e a espera em cada seta (TT+2d)"],
      ["base", "Linha de base", "a barra do combinado atrás da barra de hoje"]
    ],
    CAMADAS_PADRAO: { folgas: true, restricoes: true, cal: true, avanco: true, rotulos: true, base: true, apresentar: false },
    /* {escolhidas, apresentar, folgas…} — `apresentar` zera TODAS as camadas
       na leitura, sem apagar a escolha de cada uma (sair de "Apresentar"
       devolve o que a pessoa tinha ligado). */
    camadasNorm: function (c) {
      var o = (c && typeof c === "object" && !ehArr(c)) ? c : {}, out = { escolhidas: {} }, i, k;
      var ap = o.apresentar === true;
      for (i = 0; i < this.CAMADAS_2A.length; i++) {
        k = this.CAMADAS_2A[i][0];
        var v = own(o, k) ? o[k] !== false : this.CAMADAS_PADRAO[k];
        out.escolhidas[k] = v;
        out[k] = ap ? false : v;
      }
      out.apresentar = ap;
      return out;
    },
    /* o botão + a caixa das camadas.
       ⚠ `cam` AUSENTE = nenhum botão, e a aba sai byte a byte a de sempre
       (tools/test-crono-tomadas.js, bloco [3]). Quem passa o objeto é a
       fiação do ui.js, lendo `App._cronoCamadas`; sem App ninguém grava a
       escolha, e um botão que esquece o que a pessoa marcou é pior que
       botão nenhum (“porta prometida precisa existir”). */
    camadasBotao: function (cam) {
      if (cam == null) return "";
      var c = this.camadasNorm(cam), i, lig = 0;
      for (i = 0; i < this.CAMADAS_2A.length; i++) if (c.escolhidas[this.CAMADAS_2A[i][0]]) lig++;
      var rot = c.apresentar ? "Camadas: apresentar"
        : (lig < this.CAMADAS_2A.length ? "Camadas (" + lig + " de " + this.CAMADAS_2A.length + ")" : "Camadas");
      var tit = c.apresentar
        ? "Modo apresentar: folgas, datas, calendários, avanço, rótulos e linha de base estão ESCONDIDOS no desenho, e o chip de compatibilidade também. Os números da tabela e do papel não mudaram. Clique para escolher."
        : "Escolha o que o Gantt desenha. Camada desligada some só do desenho — a tabela, os documentos e o cálculo não mudam.";
      var h = '<details class="cx-cam"><summary class="btn sm' + (c.apresentar ? " cx-cam-ap" : "") + '" title="' + esc(tit) + '">' + esc(rot) + ' ▾</summary>' +
        '<div class="cx-cam-caixa">';
      for (i = 0; i < this.CAMADAS_2A.length; i++) {
        var k = this.CAMADAS_2A[i][0];
        h += '<label class="cx-cam-lin" title="' + esc(this.CAMADAS_2A[i][2]) + '">' +
          '<input type="checkbox" data-acao="crono-camadas-uma" data-camada="' + esc(k) + '"' + (c.escolhidas[k] ? ' checked' : '') + (c.apresentar ? ' disabled' : '') + '> ' +
          esc(this.CAMADAS_2A[i][1]) + '</label>';
      }
      h += '<label class="cx-cam-lin cx-cam-ap-lin" title="' + esc("Esconde todas as camadas de uma vez e o chip de compatibilidade — o desenho que o cliente vê numa apresentação. Fica lembrado neste aparelho.") + '">' +
        '<input type="checkbox" data-acao="crono-camadas-apresentar" data-ligar="' + (c.apresentar ? "0" : "1") + '"' + (c.apresentar ? ' checked' : '') + '> Apresentar</label>' +
        '<p class="cx-cam-nota">' + esc("Camada desligada some do desenho. A tabela, o PDF e o cálculo do prazo não mudam.") + '</p>' +
        '</div></details>';
      return h;
    },

    /* AS LINHAS DAS TAREFAS SEM PREÇO (`opts.intercalar`, T7). Cada uma entra
       DEPOIS do bloco da etapa em que foi pendurada (`x.apos`); as soltas vão
       ao fim. Sem `r.extras` devolve `null` — e aí a tomada nem é passada, e a
       lista é a de sempre, byte a byte.
       ⚠ CÓPIA, nunca o objeto de `r.extras`: a tela marca `tipo:"extra"` para
       o `gantt`, o `ctxDoNo` e a grade, e marcar o objeto do motor faria a
       chave vazar para o resultado que a 1B congela em linha de base e a 3A
       imprime (é a mesma razão do `GanttUI.acharNo`). */
    intercalarExtras: function (r) {
      var xs = arr(r && r.extras);
      if (!xs.length) return null;
      var self = this;
      return function (lista) {
        var porApos = {}, soltas = [], i, k;
        for (i = 0; i < xs.length; i++) {
          var lx = { tipo: "extra", i: -1, et: null, no: self._linhaExtra(xs[i]) };
          k = (xs[i] && xs[i].apos != null) ? String(xs[i].apos) : "";
          if (k) { if (!own(porApos, k)) porApos[k] = []; porApos[k].push(lx); }
          else soltas.push(lx);
        }
        var out = [], pend = null;
        for (i = 0; i < lista.length; i++) {
          var l = lista[i];
          /* o BLOCO da etapa acabou quando começa a próxima etapa: é aí que a
             linha T entra, e não colada na linha da etapa — pendurada no meio
             das subetapas ela pareceria uma subetapa daquela etapa */
          if (l && l.tipo === "etapa") {
            if (pend) { out = out.concat(pend); pend = null; }
            var idE = l.et ? l.et.id : (l.no ? l.no.id : null);
            if (idE != null && own(porApos, String(idE))) { pend = porApos[String(idE)]; delete porApos[String(idE)]; }
          }
          out.push(l);
        }
        if (pend) out = out.concat(pend);
        // as que apontam para uma etapa fora da lista (recolhida, filtrada) e as soltas
        for (k in porApos) if (own(porApos, k)) out = out.concat(porApos[k]);
        return out.concat(soltas);
      };
    },
    _linhaExtra: function (x) {
      var c = {}, k;
      for (k in x) if (own(x, k)) c[k] = x[k];
      c.tipo = "extra";
      return c;
    },

    /* A BARRA QUE SUBSTITUI A DE SEMPRE (`opts.barraDe`, T7). Devolve `null`
       para deixar a barra de hoje intacta — é o que acontece em toda linha
       sem tarefa sem preço e sem avanço, e é o que segura a paridade.
         - tarefa sem preço: barra TRACEJADA (ou losango no marco). Tracejada
           porque ela não tem preço no orçamento: cheia, ela se lê como
           serviço vendido, e é o contrário — o cliente precisa ver que aquilo
           é prazo que alguém deve, não serviço contratado.
         - avanço lançado: o feito (cheio), o que falta (a mesma cor clara) e,
           na tarefa empurrada, o pedaço entre o planejado e o corte.
       ⚠ A alça do arrasto NÃO sai daqui: ela é por linha e o `gantt` já a
       desenhou antes de chamar esta porta. */
    barraDoPlanejador: function (r, cam) {
      var c = this.camadasNorm(cam), self = this;
      var temX = arr(r && r.extras).length > 0, temAv = !!(r && r.avanco);
      if (!temX && !(temAv && c.avanco)) return null;
      return function (n, ctx) {
        if (n && n.tipo === "extra") return self._barraExtra(r, n, ctx, c);
        if (c.avanco && n && n.avanco && n.avanco.estado !== "nao-iniciada") return self._barraAvanco(r, n, ctx, c);
        return null;
      };
    },
    RESP_T: { cliente: "o contratante", construtora: "a construtora", terceiro: "um terceiro" },
    _barraExtra: function (r, n, ctx, cam) {
      var x = ctx.x, w = ctx.w, y0 = ctx.y0, rowH = ctx.geo.rowH, cor = n.critico ? CRIT : ROXO_T;
      var resp = this.RESP_T[String(n.resp || "")] || "a construtora";
      var t = String(n.numero || "T") + " " + String(n.nome || "") + " — tarefa sem preço, " + resp +
        (n.marco ? " · MARCO (sem duração) · " + dma(n.dataInicio)
          : " · " + n.duracao + " dia(s) útil(eis) · " + dma(n.dataInicio) + " → " + dma(n.dataFim)) +
        (cam.folgas ? (n.critico ? " · CRÍTICA (sem folga)" : " · folga de " + (n.folga || 0) + " dia(s)") : "") +
        (n.depoisDaEntrega ? " · termina DEPOIS da entrega da obra" : "") +
        (n.proposta ? " · aparece na proposta" : " · não aparece na proposta");
      if (n.marco) {
        var cy = y0 + rowH / 2, rr = 7;
        return '<polygon class="cx-t-marco' + (n.critico ? ' gantt-critica' : '') + '" points="' + f1(x) + ',' + f1(cy - rr) + ' ' + f1(x + rr) + ',' + f1(cy) + ' ' + f1(x) + ',' + f1(cy + rr) + ' ' + f1(x - rr) + ',' + f1(cy) +
          '" fill="#fff" stroke="' + cor + '" stroke-width="1.6"><title>' + esc(t) + '</title></polygon>';
      }
      var hb = 13, yb = y0 + (rowH - hb) / 2, s = "";
      if (cam.folgas && (n.folga || 0) > 0) {
        var wF = Math.max(2, Math.min(n.folga, Math.max(0, ctx.geo.dias - n.fim)) * ctx.geo.pxDia);
        /* ⚠ classe PRÓPRIA (`cx-t-folga`) além da de sempre: a folga da linha
           T é desenhada por ESTA camada e some com a caixa "Folgas", enquanto
           a folga tracejada das etapas é o desenho de sempre e fica. Com a
           mesma classe nas duas, a e2e contava 16 e 15 sem saber qual sumiu
           (medido em 21/09/2026) — e o CSS também não teria como distinguir. */
        if (wF > 0) s += '<rect class="gantt-folga cx-t-folga" x="' + f1(x + w) + '" y="' + f1(yb) + '" width="' + f1(wF) + '" height="' + hb + '" rx="3" fill="' + cor + '" fill-opacity="0.10" stroke="' + cor + '" stroke-opacity="0.45" stroke-dasharray="3,3"/>';
      }
      return s + '<rect class="cx-t-barra' + (n.critico ? ' gantt-critica' : '') + '" x="' + f1(x) + '" y="' + f1(yb) + '" width="' + f1(w) + '" height="' + hb +
        '" rx="3" fill="#fff" stroke="' + cor + '" stroke-width="1.6" stroke-dasharray="5,3"><title>' + esc(t) + '</title></rect>' +
        '<text x="' + f1(x + 4) + '" y="' + f1(yb + hb / 2 + 3) + '" font-size="8.5" font-weight="600" fill="' + cor + '" pointer-events="none">T</text>';
    },
    AV_EST: { concluida: "concluída", andamento: "em andamento", empurrada: "empurrada pelo corte", "nao-iniciada": "não iniciada" },
    AV_FONTE: { digitado: "digitado", diario: "aceito dos diários", medicao: "lançado pela medição" },
    _barraAvanco: function (r, n, ctx, cam) {
      var av = n.avanco, x = ctx.x, w = ctx.w, y0 = ctx.y0, rowH = ctx.geo.rowH, X = ctx.geo.X;
      var Cr = C(), cor = n.cor || ((Cr && Cr.cat ? Cr.cat(n.categoria) : null) || {}).cor || CINZA;
      var hb = ctx.ehEtapa ? 16 : 13, yb = y0 + (rowH - hb) / 2;
      var pct = Math.max(0, Math.min(100, fin(av.pct, 0)));
      var t = String(ctx.rot) + " — " + (this.AV_EST[av.estado] || av.estado) + " · " + nBR(pct, 1) + "% (" + (this.AV_FONTE[av.fonte] || "digitado") + ")" +
        (av.iniReal ? " · começou em " + dmaS(av.iniReal) : "") + (av.fimReal ? " · terminou em " + dmaS(av.fimReal) : "") +
        (av.empurradoDias > 0 ? " · empurrada " + av.empurradoDias + " dia(s) útil(eis) pelo corte" : "") +
        (av.foraSeq ? " · começou ANTES do que a rede deixava (fora de sequência)" : "") +
        (av.naoAtualizado && av.em ? " · sem lançamento novo desde " + dmaS(av.em) : "") +
        " · " + dma(n.dataInicio) + " → " + dma(n.dataFim);
      var s = "";
      /* o trecho ENTRE o planejado e o corte: é o atraso que a tarefa
         empurrada já acumulou, e ele precisa ser visível — sem ele a barra só
         "andou para a direita" e ninguém sabe quanto */
      if (fin(av.empurradoDias, 0) > 0) {
        var xp = X(Math.max(0, n.inicio - av.empurradoDias));
        if (x > xp) s += '<rect class="cx-av-atraso" x="' + f1(xp) + '" y="' + f1(yb + 2) + '" width="' + f1(x - xp) + '" height="' + (hb - 4) +
          '" fill="' + CRIT + '" fill-opacity="0.10" stroke="' + CRIT + '" stroke-opacity="0.45" stroke-dasharray="2,2"><title>' +
          esc("empurrada " + av.empurradoDias + " dia(s) útil(eis): a data de corte do avanço passou e esta tarefa ainda não tinha terminado") + '</title></rect>';
      }
      var wFeito = Math.max(0, Math.min(w, w * pct / 100));
      s += '<rect class="cx-av-total" x="' + f1(x) + '" y="' + f1(yb) + '" width="' + f1(w) + '" height="' + hb + '" rx="3" fill="' + cor + '" opacity="0.35"' +
        (ctx.crit ? ' stroke="' + CRIT + '" stroke-width="1.4"' : '') + '><title>' + esc(t) + '</title></rect>';
      if (wFeito > 0) s += '<rect class="cx-av-feito" x="' + f1(x) + '" y="' + f1(yb) + '" width="' + f1(wFeito) + '" height="' + hb + '" rx="3" fill="' + cor + '" opacity="0.95"><title>' + esc(t) + '</title></rect>';
      if (av.estado === "concluida") s += '<text x="' + f1(x + w - 4) + '" y="' + f1(yb + hb / 2 + 3) + '" font-size="8.5" font-weight="600" fill="#fff" text-anchor="end" pointer-events="none">✓</text>';
      else if (w >= 30) s += '<text x="' + f1(x + w - 4) + '" y="' + f1(yb + hb / 2 + 3) + '" font-size="8.5" font-weight="600" fill="#0f172a" text-anchor="end" pointer-events="none">' + nBR(pct, 0) + '%</text>';
      if (av.foraSeq) s += '<circle class="cx-av-foraseq" cx="' + f1(x) + '" cy="' + f1(y0 + 4) + '" r="3" fill="#b45309"><title>' + esc("começou antes do que a rede deixava (fora de sequência)") + '</title></circle>';
      return s;
    },

    /* A CAMADA POR CIMA DAS BARRAS (`opts.camadas.depois`, T7): a linha da
       data de corte, o sombreado dos dias em que cada frente não trabalha, o
       marcador das restrições e as folgas livre e negativa.
       ⚠ Cada pedaço respeita A SUA caixa (D30): uma camada que desenhasse
       ignorando a escolha faria "Apresentar" mentir, e é justamente o modo em
       que o cliente está olhando a tela. */
    camadaDoPlanejador: function (r, cam, opts) {
      var c = this.camadasNorm(cam), self = this;
      opts = opts || {};
      var temCal = !!(r && r.calendarios && arr(r.calendarios.usados).length);
      var temAv = !!(r && r.avanco), temRestr = false, temFolga = false, i;
      var nos = arr(r && r.atividades), ets = arr(r && r.etapas);
      for (i = 0; i < ets.length && !temRestr; i++) if (ets[i] && ets[i].restricao) temRestr = true;
      for (i = 0; i < nos.length && !temRestr; i++) if (nos[i] && nos[i].restricao) temRestr = true;
      for (i = 0; i < nos.length && !temFolga; i++) if (nos[i] && (fin(nos[i].folgaLivre, 0) > 0 || fin(nos[i].folgaReal, 0) < 0)) temFolga = true;
      for (i = 0; i < ets.length && !temFolga; i++) if (ets[i] && fin(ets[i].folgaReal, 0) < 0) temFolga = true;
      if (!(temCal && c.cal) && !(temAv && c.avanco) && !(temRestr && c.restricoes) && !(temFolga && c.folgas)) return null;
      return function (geo) {
        var s = "";
        if (temCal && c.cal) s += self._camadaCal(r, geo);
        if (temFolga && c.folgas) s += self._camadaFolgas(r, geo);
        if (temRestr && c.restricoes) s += self._camadaRestricoes(r, geo, opts.cron);
        if (temAv && c.avanco) s += self._camadaCorte(r, geo);
        return s;
      };
    },
    /* os dias em que a frente DAQUELA linha não trabalha, sombreados na
       própria linha. ⚠ É por LINHA, não uma faixa da tela inteira: cada
       frente tem o seu calendário, e um sombreado global diria que a obra
       inteira parou no sábado em que a montagem estava trabalhando. */
    _camadaCal: function (r, geo) {
      var CC = MOD("CronoCal", "./cronocal.js");
      if (!CC || typeof CC.contexto !== "function" || !r.calendarios) return "";
      var cal = geo.cal, s = "";
      if (!cal || typeof cal.dia !== "function") return "";
      /* ⚠ o CONTEXTO de consumo (dia cheio + feriado da obra) é remontado do
         `r.calendarios` que o motor publicou, e NUNCA reimplementado aqui: a
         régua de "a frente trabalha neste dia?" tem de ser a mesma que
         calculou a duração, senão o sombreado diria uma coisa e a barra
         outra (memória "réplica de parser apodrece"). */
      var mapaF = (r.feriados && r.feriados.mapa) || {}, cc = null;
      try { cc = CC.contexto(r.calendarios, function (ms) { return !!mapaF[chDia2A(ms)]; }, null); } catch (eCt) { cc = null; }
      if (!cc || !cc.ctxDe) return "";
      var ctxs = cc.ctxDe, nomes = {};
      arr(r.calendarios.lista).forEach(function (it) { if (it && it.id != null) nomes[String(it.id)] = String(it.nome || it.id); });
      var dias = [], k;
      for (k = 0; k <= geo.dias; k++) { var dk = cal.dia(k); if (!ehData(dk)) break; dias.push(dk); }
      geo.L.forEach(function (l, i) {
        if (i < geo.lin0 || i > geo.lin1) return;
        /* ⚠ NA LINHA DE ETAPA O CALENDÁRIO MORA EM `l.et`, NÃO EM `l.no`. A
           linha da etapa carrega OS DOIS objetos (o nó da árvore e a etapa do
           resultado), e o motor publica `calendarioId` na ETAPA de `r.etapas`
           — `l.no || l.et` pegava o nó, que não o tem, e o sombreado nunca
           saía. Medido em 21/09/2026: etapa e1 com `cal_x` e ZERO retângulos
           na tela. */
        var n = l.no || l.et, calId = (n && n.calendarioId) || (l.et && l.et.calendarioId);
        if (!calId || !own(ctxs, String(calId))) return;
        n = (n && n.calendarioId) ? n : (l.et || n);
        var ini = Math.max(0, Math.floor(fin(n.inicio, 0))), fim = Math.min(dias.length, Math.ceil(fin(n.fim, 0)));
        var y0 = geo.yRow(i), j, ct = ctxs[String(calId)], nm = nomes[String(calId)] || String(calId);
        for (j = ini; j < fim; j++) {
          var cap = 1;
          try { cap = CC.capacidade(ct, dias[j].getTime()); } catch (e2) { cap = 1; }
          if (cap > 0) continue;
          s += '<rect class="cx-cal-parado" x="' + f1(geo.X(j)) + '" y="' + f1(y0 + 2) + '" width="' + f1(Math.max(1, geo.pxDia)) + '" height="' + f1(geo.rowH - 4) +
            '" fill="#0f172a" fill-opacity="0.10"><title>' + esc(dma(dias[j]) + ": " + nm + " não trabalha") + '</title></rect>';
        }
      });
      return s;
    },
    /* a folga LIVRE (quanto a tarefa atrasa sem empurrar a seguinte) e a
       folga NEGATIVA (o teto que já não é cumprido). ⚠ A folga negativa é a
       única coisa vermelha que não é caminho crítico: ela quer dizer "a data
       prometida já passou", e some do desenho do cliente por "Apresentar". */
    _camadaFolgas: function (r, geo) {
      var s = "";
      geo.L.forEach(function (l, i) {
        if (i < geo.lin0 || i > geo.lin1) return;
        var n = l.no || l.et;
        if (!n || n.inicio == null) return;
        var y0 = geo.yRow(i), h = Math.max(3, geo.rowH - 18);
        if (fin(n.folgaReal, 0) < 0) {
          var neg = Math.min(-n.folgaReal, geo.dias);
          s += '<rect class="cx-folga-neg" x="' + f1(geo.X(Math.max(0, n.fim - neg))) + '" y="' + f1(y0 + geo.rowH - h - 1) + '" width="' + f1(Math.max(2, neg * geo.pxDia)) + '" height="' + f1(h) +
            '" fill="' + CRIT + '" fill-opacity="0.18" stroke="' + CRIT + '" stroke-opacity="0.6" stroke-dasharray="2,2"><title>' +
            esc("folga negativa: " + n.folgaReal + " dia(s) útil(eis) — a data prometida já não é cumprida por esta cadeia") + '</title></rect>';
          return;
        }
        if (fin(n.folgaLivre, 0) > 0) {
          var liv = Math.min(n.folgaLivre, Math.max(0, geo.dias - n.fim));
          if (liv <= 0) return;
          s += '<line class="cx-folga-livre" x1="' + f1(geo.X(n.fim)) + '" y1="' + f1(y0 + geo.rowH - 3.5) + '" x2="' + f1(geo.X(n.fim + liv)) + '" y2="' + f1(y0 + geo.rowH - 3.5) +
            '" stroke="#0f766e" stroke-width="2" stroke-linecap="round" opacity="0.75"><title>' +
            esc("folga livre: " + n.folgaLivre + " dia(s) útil(eis) — atrasar até aí não empurra NENHUMA outra tarefa") + '</title></line>';
        }
      });
      return s;
    },
    /* o colchete da data fixada pela pessoa e o ⧗ do piso que o APP escreveu
       (`origem:"mat"`). São dois marcadores diferentes de propósito: a
       primeira a pessoa solta; o segundo a projeção reescreve no próximo
       salvar, e oferecer [Soltar] nele seria porta falsa. */
    _camadaRestricoes: function (r, geo, cron) {
      var Gu = GU(), s = "";
      if (!Gu || typeof Gu.dataFixadaDomina !== "function") return "";
      geo.L.forEach(function (l, i) {
        if (i < geo.lin0 || i > geo.lin1) return;
        var n = l.no || l.et;
        if (!n || n.inicio == null) return;
        var dom = null;
        try { dom = Gu.dataFixadaDomina(r, n.id, cron); } catch (e) { dom = null; }
        var rs = n.restricao, y0 = geo.yRow(i), cy = y0 + geo.rowH / 2;
        if (dom) {
          var xr = geo.X(n.inicio);
          s += '<path class="cx-restr" d="M' + f1(xr - 4) + ',' + f1(cy - 8) + ' H' + f1(xr) + ' V' + f1(cy + 8) + ' H' + f1(xr - 4) + '" fill="none" stroke="#0f172a" stroke-width="1.6"><title>' +
            esc(dom.rotulo + " " + dom.dataBR + " — esta data manda no início desta tarefa") + '</title></path>';
          return;
        }
        if (rs && rs.estourada) {
          var xt = geo.X(Math.max(0, Math.min(geo.dias, fin(rs.indice, n.fim))));
          s += '<text class="cx-restr-nok" x="' + f1(xt) + '" y="' + f1(cy + 4) + '" font-size="11" fill="' + CRIT + '" text-anchor="middle" pointer-events="none">⚑</text>' +
            '<rect x="' + f1(xt - 6) + '" y="' + f1(cy - 8) + '" width="12" height="16" fill="transparent"><title>' +
            esc("a restrição “" + (Gu._ROT_RESTR && Gu._ROT_RESTR[rs.tipo] ? Gu._ROT_RESTR[rs.tipo] : rs.tipo) + " " + dmaS(rs.data) +
              "” não é cumprida — o plano termina depois. A restrição avisa; ela não encurta a tarefa nem empurra as outras.") + '</title></rect>';
          return;
        }
        // o piso escrito pelo app: o ⧗, com o MOTIVO que sai do motor (O29)
        var rd = (cron && ehObj(cron.restricoes) && ehObj(cron.restricoes[n.id])) ? cron.restricoes[n.id] : null;
        if (!rd || rd.origem !== "mat" || !rs) return;
        var mot = "";
        try { mot = Gu.motivoDoPiso(r, n.id) || ""; } catch (e3) { mot = ""; }
        s += '<text class="cx-restr-mat" x="' + f1(geo.X(n.inicio) - 7) + '" y="' + f1(cy + 4) + '" font-size="10" fill="' + ROXO_T + '" text-anchor="middle" pointer-events="none">⧗</text>' +
          '<rect x="' + f1(geo.X(n.inicio) - 13) + '" y="' + f1(cy - 8) + '" width="12" height="16" fill="transparent"><title>' +
          esc("o app guardou “não iniciar antes de " + dmaS(rs.data) + "” aqui para que aparelhos de versão anterior desenhem a mesma data" +
            (mot ? " — " + mot : " — não consegui dizer o motivo nesta renderização") + ". Não é uma data que você fixou: o próximo salvar a reescreve.") + '</title></rect>';
      });
      return s;
    },

    /* ------------------------------------------------------------------
       A LINHA DO PRAZO (2A) — o que as quatro funções acrescentam nela.
       ⚠ O QUE **NÃO** ESTÁ AQUI, DE PROPÓSITO (crítica 2, achado 17): o
       recado informativo "aparelhos com a versão 1.2.81 veem…". A linha do
       prazo é o que o cliente lê numa apresentação, e um aviso de versão de
       app ali vira dúvida sobre o prazo. Ele mora no recado do salvar e no
       cartão "Compatibilidade" da sub-aba Parâmetros (2B); aqui fica só o
       CHIP, que a pessoa abre quando quiser — e que some no modo Apresentar.
       ------------------------------------------------------------------ */
    prazoExtensoes: function (d, est) {
      var r = d.r, h = "";
      if (!r) return "";
      /* (D2) o segundo número do prazo: o das tarefas sem preço. NUNCA no
         lugar do primeiro — o prazo da obra é o que vai ao contrato; o das
         tarefas sem preço é o que o contratante também precisa cumprir. */
      if (r.dataFimComExtras && fin(r.totalDiasComExtras, 0) > fin(r.totalDias, 0)) {
        var difX = r.totalDiasComExtras - r.totalDias;
        h += '<span class="pill cx-pill-t" title="' + esc("O prazo da obra é " + r.totalDias + " dias úteis. Com as tarefas sem preço (as que dependem do contratante ou de terceiros) a última tarefa do cronograma termina " +
          difX + " dia(s) útil(eis) depois, em " + dma(r.dataFimComExtras) + ". O prazo do contrato continua sendo o da obra.") + '">+' + difX + ' d com as tarefas sem preço</span>';
      }
      var us = arr(r.calendarios && r.calendarios.usados);
      if (us.length) {
        var nomesC = [];
        arr(r.calendarios.lista).forEach(function (c) { if (c && us.indexOf(c.id) > -1) nomesC.push(String(c.nome || c.id)); });
        h += '<span class="pill cx-pill-cal" title="' + esc(nomesC.join(" · ") + " — estas frentes trabalham num calendário próprio (7×7, turnos, sábado). O prazo continua contado na régua da obra.") +
          '">' + us.length + ' frente' + (us.length === 1 ? '' : 's') + ' em calendário próprio</span>';
      }
      if (r.avanco) {
        var ct = r.avanco.contagem || {};
        h += '<span class="pill cx-pill-av" title="' + esc("Os % lançados descrevem o dia " + dmaS(r.avanco.corte) + " (a data de corte), não hoje. " +
          fin(ct.concluidas, 0) + " concluída(s), " + fin(ct.andamento, 0) + " em andamento, " + fin(ct.empurradas, 0) + " empurrada(s) pelo corte.") +
          '">Avanço até ' + dmaS(r.avanco.corte) + (fin(ct.empurradas, 0) ? ' · ' + ct.empurradas + ' empurrada' + (ct.empurradas === 1 ? '' : 's') : '') + '</span>';
      }
      return h;
    },

    /* O CHIP "Compatibilidade (N)" e a faixa que ele abre.
       ⚠ Ele conta o que EXISTE, nunca um número redondo: N é a soma dos
       recados da §1.3.1 (o que um aparelho antigo mexeu), dos códigos de
       `mat.div` e das pendências. Chip com número que não bate com a lista é
       a pessoa abrindo para procurar o que não está lá.
       ⚠ Some no modo "Apresentar" (D30). */
    compatItens: function (d) {
      var r = d && d.r, out = [], vistos = {};
      var av = arr(r && r.compat && r.compat.avisos), CAT = (C() && C().CATALOGO_DIV) || [];
      av.forEach(function (a) {
        if (!a) return;
        var t = typeof a === "string" ? a : String(a.tipo || a.cod || "");
        if (!t || own(vistos, t + (a.id || ""))) return;
        vistos[t + (a.id || "")] = 1;
        out.push({ tipo: t, id: a.id || null, msg: typeof a === "string" ? "" : String(a.msg || "") });
      });
      var mat = (d && d.cron && ehObj(d.cron.mat)) ? d.cron.mat : null;
      var cods = (mat && ehObj(mat.div) && ehArr(mat.div.cods)) ? mat.div.cods : [];
      cods.forEach(function (c) {
        if (!c || own(vistos, "cod:" + c)) return;
        vistos["cod:" + c] = 1;
        out.push({ tipo: "cod", cod: String(c), conhecido: CAT.indexOf(String(c)) > -1 });
      });
      var pend = (mat && ehObj(mat.pend)) ? Object.keys(mat.pend) : [];
      pend.forEach(function (id) { if (!own(vistos, "pend:" + id)) { vistos["pend:" + id] = 1; out.push({ tipo: "pend", id: id }); } });
      /* ⚠ `D-AVANCO-PENDENTE` É CONFERIDO AQUI, NA TELA, e não lido de
         `mat.div`. Motivo medido em 21/09/2026: `mat.avEm` só é ESCRITO pela
         projeção (no salvar do plano) e ninguém o LÊ para produzir o aviso no
         `estimar`. Como o lançamento de avanço NÃO regrava o plano (O17), a
         janela em que aparelhos de versão anterior mostram as datas do
         último salvar começa exatamente aí — e ficaria MUDA até o próximo
         salvar, que é quando ela já fechou. A conta é a da §1.11, com os dois
         campos que a tela já tem em mãos (nenhuma segunda leitura do avanço:
         o `atualizadoEm` vem do registro que o alvo carregou).
         Pendência declarada para a 1A: publicar o código em
         `r.compat.avisos`, para o papel e o cartão "Compatibilidade" da 2B
         não precisarem repetir esta comparação. */
      if (d && d.plano && d.avancoEm && !own(vistos, "cod:D-AVANCO-PENDENTE")) {
        var avEm = mat ? mat.avEm : null;
        if (String(avEm || "") !== String(d.avancoEm)) {
          vistos["cod:D-AVANCO-PENDENTE"] = 1;
          out.push({ tipo: "cod", cod: "D-AVANCO-PENDENTE", conhecido: true });
        }
      }
      return out;
    },
    /* ⚠ O CATÁLOGO `TXT_DIV` MORA NUM LUGAR SÓ, mais abaixo, junto do cartão
       "Compatibilidade" (fatia 2B). A fusão da Onda 2 achou DUAS definições
       da mesma chave neste objeto — a 2A tinha copiado a sua daqui do toast
       do salvar (`App._cronoRecadoProjecao`) e a 2B escrito a dela no cartão.
       Duas venciam em silêncio pela ordem do literal (a última ganha): código
       novo escrito só na primeira sairia CRU na tela, sem reprovar nada.
       O chip e a faixa daqui leem `self.TXT_DIV`, que é o de lá. */
    /* A RÉGUA DE QUEM PODE PERDER (21/09/2026): o item cuja única porta é o
       [Atualizar as datas para aparelhos de versão anterior] grava o plano
       INTEIRO, e por isso pode perder uma edição feita em outro aparelho que
       ainda não chegou (R10) — o próprio modal do botão avisa. Enquanto esse
       item estiver na lista, nem o chip nem a faixa prometem que nada se
       perde. Mora aqui porque os dois leem a MESMA lista de itens. */
    compatPerdePorta: function (itens) {
      var perde = false;
      (itens || []).forEach(function (x) { if (x && (x.cod === "D-AVANCO-PENDENTE" || x.tipo === "avanco-pendente")) perde = true; });
      return perde;
    },
    compatChip: function (d, est) {
      var c = this.camadasNorm(d && d.camadas);
      if (c.apresentar) return "";
      var itens = this.compatItens(d);
      if (!itens.length) return "";
      /* ⚠ o "aberto" e o MODO moram em `d` (a fiação do ui.js os lê do
         App), e não no `est` do `CronoExecUI.estado` — que é da fatia 1C. Duas
         fatias escrevendo no mesmo objeto de estado é merge perdido (§3.7). */
      var aberto = !!(d && d.compatAberto);
      /* ⚠ o title repetia “Nenhum dado se perde” para TODO item, pelo mesmo
         motivo que a faixa (veja o bloco do `compatFaixa`) */
      var perde = this.compatPerdePorta(itens);
      return '<button type="button" class="pill cx-chip-compat' + (aberto ? " cx-chip-on" : "") + '" data-acao="crono-camadas-compat" data-ligar="' + (aberto ? "0" : "1") +
        '" aria-expanded="' + (aberto ? "true" : "false") + '" title="' +
        esc("O que aparelhos com uma versão anterior do app veem diferente deste cronograma, e o que espera uma escolha sua." +
          (perde ? "" : " Nenhum dado se perde.")) +
        '">Compatibilidade (' + itens.length + ')</button>';
    },
    /* a faixa que o chip abre, LOGO ABAIXO da linha do prazo. As portas de
       escolha são as da 1A (`crono-compat-escolher`), que já gravam; a porta
       [Atualizar as datas…] é da 2B e só aparece quando a fiação a passa
       (`d.portaAtualizarDatas`) — botão desenhado sem quem o ouça é porta que
       não abre. Sem ele, a faixa diz o caminho que existe de verdade: o
       próximo salvar do plano. */
    compatFaixa: function (d, est) {
      void est;
      if (!d || !d.compatAberto) return "";
      var itens = this.compatItens(d), self = this;
      if (!itens.length) return "";
      var linhas = itens.map(function (x) {
        if (x.tipo === "cod") {
          var t = self.TXT_DIV[x.cod];
          return '<li>' + esc(t ? t : ("código " + x.cod + " — não consigo explicar este código nesta versão; avise o suporte da RA")) +
            (t ? '' : ' <b>' + esc(x.cod) + '</b>') + '</li>';
        }
        if (x.tipo === "pend") return '<li>' + esc("uma alteração feita num aparelho de versão anterior espera a sua escolha — abra o quadro pelo salvar, ou escolha aqui: ") +
          '<button class="btn sm" data-acao="crono-compat-escolher" data-id="' + esc(String(x.id)) + '" data-escolha="manter">Manter o planejado</button></li>';
        return '<li>' + esc(x.msg || self.TXT_COMPAT[x.tipo] || x.tipo) + '</li>';
      }).join("");
      var porta = (d && typeof d.portaAtualizarDatas === "string") ? d.portaAtualizarDatas : "";
      var temAv = this.compatPerdePorta(itens);
      return '<div class="cx-compat-faixa"><b>' + esc("Compatibilidade com aparelhos de versão anterior") + '</b><ul class="cx-lista">' + linhas + '</ul>' +
        (temAv ? (porta || '<p class="muted">' + esc("As datas que o avanço lançado mudou entram no próximo salvar deste plano — até lá, aparelhos de versão anterior mostram as datas do último salvar.") + '</p>') : "") +
        /* ⚠ A PROMESSA E POR ITEM, NUNCA GENERICA (revisao adversarial da
           Onda 2, 21/09/2026). Esta frase ficava no FIM da faixa e valia para
           todos os itens — inclusive o `D-AVANCO-PENDENTE`, cuja unica porta e
           o [Atualizar as datas para aparelhos de versao anterior] logo acima
           dela, e o modal DESSE botao diz, com todas as letras: “Uma edicao do
           plano feita em outro aparelho que ainda nao chegou aqui SE PERDE”.
           Lido na tela, um em cima do outro. Recado que mente e pior que
           recado nenhum: a pessoa le “nada se perde” como formalidade e clica.
           Os itens que de fato nao perdem nada (D-INICIAR-1281, D-IA-TEXTO)
           continuam com a frase. */
        (temAv ? "" : '<p class="muted">' + esc("Nada se perde: o valor planejado desta versão continua gravado, e o desta tela é o certo.") + '</p>') + '</div>';
    },
    TXT_COMPAT: {
      "avanco-nao-carregado": "o avanço desta obra não foi carregado nesta tela — as datas mostradas são as do último salvar",
      "avanco-fim-sem-100": "uma tarefa tem fim real com menos de 100%: ela foi lida como concluída",
      "avanco-100-sem-fim": "uma tarefa está em 100% sem fim real: marque o último dia trabalhado",
      "avanco-origem-desconhecida": "uma entrada de avanço veio com uma origem que esta versão não conhece — ela vale como digitada",
      "avanco-medicao-sem-lastro": "uma entrada veio da medição sem o boletim que a sustenta — ela vale como digitada",
      "editado-versao-anterior": "uma duração foi alterada num aparelho de versão anterior e espera a sua escolha",
      "restricao-1281": "uma data fixada foi substituída num aparelho de versão anterior e espera a sua escolha",
      "limpeza-1281": "as edições do cronograma foram limpas num aparelho de versão anterior",
      "rede-substituida": "uma ligação TT/IT foi alterada num aparelho de versão anterior: vale o que ficou gravado lá"
    },

    /* O MOTIVO DA IA QUE A TELA MOSTRA (revisão 4, O31).
       ⚠ SAI SÓ DO `CronoPlan.textoIA`, nunca de `cronograma.iaMotivos` cru.
       Roteiro do defeito que isto fecha: com a porta (1) do teto (O30), o
       plano guarda só a MARCA ("motivo não guardado (limite do plano)") e o
       texto fica no orçamento de origem. Lendo o mapa cru, a tela mostraria
       essa marca como se fosse a justificativa — a pessoa leria "não
       guardado" numa etapa cujo motivo está a um clique de distância.
       Devolve {texto, fonte, titulo} — `titulo` é o que vai no `title`. */
    motivoIA: function (d, nivel, id) {
      var vazio = { texto: "", fonte: null, titulo: "" };
      if (!d || id == null) return vazio;
      var CP = MOD("CronoPlan", "./cronoplan.js");
      var cronP = (d.cron && typeof d.cron === "object" && !ehArr(d.cron)) ? d.cron : null;
      if (!CP || typeof CP.textoIA !== "function" || !cronP) {
        /* sem o módulo não se INVENTA leitura crua: a marca do limite do plano
           sairia como motivo. Melhor não mostrar o ícone do que mostrar um
           motivo que não é o motivo. */
        return vazio;
      }
      var res = null;
      try { res = CP.textoIA(cronP, d.cronOrc || null, nivel, id); } catch (e) { res = null; }
      if (!res || !res.texto) {
        if (res && res.motivo === "orcamento-mudou") return { texto: "", fonte: null,
          titulo: "🤖 IA: motivo não guardado no plano (o orçamento de origem mudou desde então)" };
        return vazio;
      }
      var org = (d.orcOrigemNumero ? String(d.orcOrigemNumero) : "");
      var suf = res.fonte === "orcamento" ? " (texto do orçamento" + (org ? " " + org : "") + ")" : "";
      return { texto: res.texto, fonte: res.fonte, titulo: "🤖 IA: " + res.texto + suf };
    },

    /* A FAIXA DO MODO AVANÇAR. ⚠ Ela existe porque as colunas Dur. e
       "Depende de" SOMEM nesse modo: uma coluna que desaparece sem recado é
       lida como app quebrado, e a pessoa procura a edição na tabela de baixo
       (que também está no modo). O botão de voltar é o próprio recado. */
    modoAvancoFaixa: function (d, est) {
      if (!d || !d.plano) return "";
      void est;
      var modo = d.modoAv === "avancar" ? "avancar" : "planejar";
      if (modo !== "avancar") return "";
      return '<div class="cx-modo-av"><b>Modo Avançar</b> ' +
        esc("— as colunas Dur. e “Depende de” voltam em") +
        ' <button type="button" class="btn sm" data-acao="crono-camadas-modo" data-modo="planejar">Voltar a Planejar</button>' +
        (d.r && d.r.avanco ? ' <span class="muted">' + esc("os % descrevem " + dmaS(d.r.avanco.corte) + ", a data de corte") + '</span>' : "") + '</div>';
    },
    /* o seletor Planejar | Avançar (só no plano da obra) */
    modoAvancoBotoes: function (d, est) {
      if (!d || !d.plano) return "";
      void est;
      var modo = d.modoAv === "avancar" ? "avancar" : "planejar";
      return '<div class="cx-modo-bt" role="group" aria-label="Modo do cronograma">' +
        '<button type="button" class="btn sm' + (modo === "planejar" ? " primary" : "") + '" data-acao="crono-camadas-modo" data-modo="planejar" aria-pressed="' + (modo === "planejar") + '" title="' +
        esc("Planejar: duração, ligações e calendário das frentes.") + '">Planejar</button>' +
        '<button type="button" class="btn sm' + (modo === "avancar" ? " primary" : "") + '" data-acao="crono-camadas-modo" data-modo="avancar" aria-pressed="' + (modo === "avancar") + '" title="' +
        esc("Avançar: o que já aconteceu — % concluído, início real e fim real na data de corte.") + '">Avançar</button></div>';
    },

    /* a linha da DATA DE CORTE do avanço. ⚠ Ela não é "hoje": é o dia que os
       números descrevem. Com as duas confundidas, quem lança avanço na
       sexta-feira e olha na segunda lê o fim de semana como atraso real. */
    _camadaCorte: function (r, geo) {
      var av = r.avanco, j = fin(av.indiceCorte, -1);
      if (!(j >= 0) || j > geo.dias) return "";
      var x = geo.X(j), y1 = geo.pro ? 0 : geo.top - 2, y2 = geo.pro ? geo.h : geo.h - 6;
      return '<line class="cx-av-corte" x1="' + f1(x) + '" y1="' + f1(y1) + '" x2="' + f1(x) + '" y2="' + f1(y2) + '" stroke="#b45309" stroke-width="1.6" stroke-dasharray="6,3"><title>' +
        esc("data de corte do avanço: " + dmaS(av.corte) + " (os % lançados descrevem este dia, não hoje)") + '</title></line>' +
        '<text class="cx-av-corte-rot" x="' + f1(x + 3) + '" y="' + f1(y1 + 9) + '" font-size="8.5" fill="#b45309" pointer-events="none">' + esc("corte " + dmaS(av.corte)) + '</text>';
    },
    /*
     * ↑ região da fatia 2A: camadas, `barraDe`, linhas das tarefas sem preço.
     *
     *
     */
    /* ===== PLANEJADOR: paineis (2B) ===== */
    _regPaineis: 1,

    /* ------------------------------------------------------------------
       O CATÁLOGO DE DIVERGÊNCIAS EM PT-BR (espec §1.11), para o cartão
       "Compatibilidade". Cada código diz O QUE um aparelho 1.2.81 vê de
       diferente — nunca o código sozinho: "D-FOLHA-INI" na tela é o mesmo que
       não dizer nada.
       ⚠ O toast do salvar (`App._cronoRecadoProjecao`, 1A) escreve só os três
         que mudam o DESENHO; este cartão é o catálogo inteiro, porque é onde
         a pessoa vem quando quer conferir. Código que entre no
         `Cronograma.CATALOGO_DIV` e não aqui sai CRU na tela, e a
         `test-crono-fiacao` reprova — de propósito: recado com código de
         programador é o mesmo que recado nenhum.
       ------------------------------------------------------------------ */
    TXT_DIV: {
      "D-FOLHA-INI": "o início desenhado de subetapas empurradas pelo corte ou por frente própria (o fim é o mesmo)",
      "D-INICIO-FRENTE": "nada nas datas: a frente em calendário próprio aparece começando no dia útil da obra",
      "D-TETO": "o aviso de “terminar até” estourado não aparece (as datas são as mesmas)",
      "D-CRIT": "a folga e o caminho crítico de cadeias que passam por tarefa sem preço ou por teto de data",
      "D-VAO0": "frente que só trabalha em dia sem obra aparece como marco (losango)",
      "D-VELHA": "as datas das sucessoras de uma tarefa que um aparelho de versão anterior editou depois do último salvar daqui",
      /* ⚠ NÃO É DATA (`Cronograma.DIV_NAO_DATA`): as datas são as MESMAS nas
         duas versões. O que muda é a espera escrita no "Depende de" de uma
         tarefa que começou fora de sequência — custo declarado da âncora do
         início real (O16), que js/cronograma.js escreve com todas as letras.
         Sem código no catálogo, TODA obra com avanço lançado via, a cada
         salvar, "não consegui garantir que vejam as mesmas datas
         (sem-codigo) … avise o suporte da RA" — assustando com "outras
         datas" quando as datas são iguais (revisão adversarial da Onda 2). */
      "D-ESPERA-AVANCO": "nada nas datas: a espera mostrada no “Depende de” de uma tarefa que começou antes do que a rede permitia",
      "D-AVANCO-PENDENTE": "as datas reprogramadas pelo avanço lançado depois do último salvar do plano",
      "D-INICIO-VELHO": "as datas fixadas ficam na posição do início antigo da obra",
      "D-PENDENTE": "o efeito das tarefas sem preço, dos calendários, do “o mais tarde possível” e do avanço nas datas",
      "D-SEM-SOMBRA": "as datas das subetapas (este plano foi gravado sem elas, por escolha)",
      "D-175": "em aparelhos até a 1.2.75, as tarefas sem preço e o avanço não empurram nenhuma data",
      "D-INICIAR-1281": "nenhuma data: “Iniciar plano de execução” e “Reiniciar a partir deste orçamento” recusam com “Avise o suporte”",
      "D-IA-TEXTO": "nenhuma data: a etapa cujo texto da IA ficou no orçamento mostra “motivo não guardado (limite do plano)”"
    },
    /* ==================================================================
       O CARTÃO "COMPATIBILIDADE COM APARELHOS DE VERSÃO ANTERIOR"
       (crítica 2, achado 17; espec §3.4-2B)

       ⚠ POR QUE ESTE TEXTO SAIU DA LINHA DO PRAZO: a linha do prazo é o que o
         cliente vê numa apresentação. "Aparelhos com o OrçaPRO anterior à
         1.2.8x veem…" ao lado do prazo da obra é conversa interna da RA
         exibida na reunião. Aqui, na sub-aba Parâmetros, é onde quem planeja
         vem conferir — e é aqui que ficam as portas de escolha.
       ⚠ RECADO QUE MENTE É PIOR QUE RECADO NENHUM: sem conferência gravada
         (`mat` ausente) o cartão diz que o cronograma não usa função nenhuma
         das novas, em vez de afirmar "tudo certo" sobre algo que não mediu.
       ================================================================== */
    compatCartao: function (d, est) {
      void est;
      var Cr = C(), self = this;
      var orc = (d && d.orc) || null, cron = (orc && orc.cronograma && typeof orc.cronograma === "object") ? orc.cronograma : {};
      var mat = (cron.mat && typeof cron.mat === "object" && !ehArr(cron.mat)) ? cron.mat : null;
      var plano = (d && d.obra && d.obra.alvo && d.obra.alvo.plano) || null;
      var noPlano = !!(d && d.obra && d.obra.alvo && d.obra.alvo.tipo === "plano");
      var li = [], cab = [];

      /* 1) O RECADO INFORMATIVO dos calendários (calendario.md passo 6), só
         enquanto houver frente em calendário próprio: a diferença é real e
         está declarada no catálogo (`D-INICIO-FRENTE`). */
      /* ⚠ `r.calendarios` É OBJETO, não lista (`{v, lista, usados, padrao, de,
         avisos}`, js/cronograma.js:4224). Lido como lista, `.length` dava
         `undefined`, a contagem virava 0 e o recado dos calendários NUNCA
         aparecia — medido no navegador com duas etapas em 7×7. O número que
         interessa é o de FRENTES (nós atribuídos), não o de calendários. */
      var cc = (d && d.r && d.r.calendarios && typeof d.r.calendarios === "object" && !ehArr(d.r.calendarios)) ? d.r.calendarios : null;
      var nFrentes = (cc && cc.de && typeof cc.de === "object" && !ehArr(cc.de)) ? Object.keys(cc.de).length : 0;
      if (nFrentes) {
        li.push(esc("Aparelhos com o OrçaPRO anterior à " + ((Cr && Cr.VERSAO_RECURSO && Cr.VERSAO_RECURSO.cal) || "1.2.82") +
          " veem o mesmo prazo e o mesmo término; as " + nFrentes + " frente(s) em calendário próprio aparecem neles começando no dia útil da obra (segunda-feira, e não sábado). Atualize os aparelhos da equipe."));
      }

      /* 2) OS CÓDIGOS DA ÚLTIMA CONFERÊNCIA (`mat.div`), com o texto do
         catálogo. Código fora do catálogo é DEFEITO e sai em vermelho. */
      var div = (mat && mat.div && typeof mat.div === "object") ? mat.div : null;
      var cods = (div && ehArr(div.cods)) ? div.cods : [];
      if (cods.length) {
        cods.forEach(function (c) {
          var t = own(self.TXT_DIV, c) ? self.TXT_DIV[c] : null;
          if (!t) li.push('<span class="cx-compat-ruim">' + esc(String(c)) + esc(" — não consegui dizer o que muda nesses aparelhos. Avise o suporte da RA com este código.") + '</span>');
          else li.push(esc(String(c) + " — " + t));
        });
      }
      /* `D-INICIAR-1281` escolhido (a porta da O30) vale mesmo sem `mat.div`:
         ele não é data, então a conferência C1 não o vê (§1.11). */
      if (mat && mat.semIniciar1281 === 1 && cods.indexOf("D-INICIAR-1281") < 0) {
        li.push(esc("D-INICIAR-1281 — " + self.TXT_DIV["D-INICIAR-1281"] + " (escolhido por você nesta obra, para o cronograma caber)."));
      }
      /* `D-IA-TEXTO`: a escolha mora no REGISTRO DO PLANO (`plano.iaResumo`),
         fora do motor — o cartão a lê de lá, com a data em que foi feita. */
      var ia = (plano && plano.iaResumo && typeof plano.iaResumo === "object") ? plano.iaResumo : null;
      if (ia && (ia.texto || ia.origem)) {
        li.push(esc("D-IA-TEXTO — " + self.TXT_DIV["D-IA-TEXTO"] +
          (ia.texto ? " · os textos da IA iguais aos do orçamento ficam só lá" : "") +
          (ia.origem ? " · a origem das ligações da IA não fica no plano" : "") +
          (ia.em ? " (escolhido em " + dmaS(String(ia.em).slice(0, 10)) + ")" : "") + "."));
      }

      /* 3) AS PENDÊNCIAS DA §1.3.1 com a porta: enquanto existirem, vale o
         planejado desta versão e nada do outro aparelho se perde. */
      var pend = (mat && mat.pend && typeof mat.pend === "object" && !ehArr(mat.pend)) ? mat.pend : null;
      var nPend = pend ? Object.keys(pend).length : 0;
      if (nPend) {
        cab.push('<p class="cx-compat-pend">' + esc(nPend + " tarefa(s) foram alteradas num aparelho de versão anterior e esperam a sua escolha. Até você escolher, vale o planejado desta versão — nada do que o outro aparelho gravou se perde.") + '</p>');
      }

      /* 4) O TETO DO AVANÇO OCUPADO (E-MC6), só no plano e só com avanço: é o
         número que a pessoa precisa ANTES de a gravação ser recusada. */
      var A = G("CronoAvanco"), rec = (orc && orc._avancoDaObra) || null;
      if (noPlano && A && rec && typeof A.bytes === "function") {
        var bA = A.bytes(rec), kbA = String(Math.round(bA / 102.4) / 10).replace(".", ","), kbT = Math.round(A.TETO / 1024);
        li.push(esc("Avanço lançado: " + kbA + " KB de " + kbT + " KB por obra (" + arr(rec.nos).length +
          " tarefa(s)). Perto do limite, use [Resumir o avanço das etapas concluídas] — o realizado nunca é apagado por falta de espaço."));
      }

      /* 5) AS CHAVES DESLIGADAS (T12): função desligada neste aparelho é a
         primeira explicação para "por que a data não mudou". */
      var R = (Cr && typeof Cr.recursos === "function") ? Cr.recursos() : {};
      var ROTR = { motor: "as quatro funções de data (a leitura inteira)", rede: "tipos de ligação e restrições de data", cal: "calendários das frentes",
        extras: "tarefas sem preço", avanco: "avanço lançado", bases: "linhas de base", historico: "histórico de alterações",
        seloTardio: "selo das linhas de base", filtro: "filtros do Gantt", pilha: "desfazer e refazer", sino: "avisos do cronograma" };
      var desl = [], k;
      for (k in ROTR) if (own(ROTR, k) && R[k] === false) desl.push(ROTR[k]);
      if (desl.length) li.push('<span class="cx-compat-ruim">' + esc("Desligado neste aparelho: " + desl.join("; ") + ". As datas desta tela não contam com essas funções.") + '</span>');
      /* 6) MEDCC 6B (EM-9): AS CHAVES DA LEVA "medição × centros de custo"
         (`CONFIG.medccRecursos`), ACRESCENTADAS à lista — nunca no lugar
         dela. As linhas do planejador acima (`D-INICIAR-1281`, `D-IA-TEXTO`
         e o teto do avanço ocupado) continuam: substituir a lista faria a
         pessoa perder justamente o número que ela vem aqui conferir.
         ⚠ E O TEXTO DIZ QUE NADA FOI APAGADO. Chave desligada esconde porta
           e impede dado novo; `lancarAvanco`, `avancoMedicao` e as entradas
           `o:"medicao"` gravadas continuam valendo e sincronizando (§11.3).
           Sem essa frase, "o lançamento do avanço pela medição está
           desligado" se lê como "o que já foi lançado sumiu". */
      var Ge = G("Gestao"), ROTM = {
        medAvanco: "o lançamento do avanço pela medição", medAvancoAuto: "o lançamento automático ao aprovar o boletim",
        medOrigem: "a procedência “medição” nas entradas de avanço", ccGerar: "gerar centros de custo do orçamento",
        ccAgente: "a apropriação automática dos centros de custo", ccDocumentos: "o centro de custo nos documentos de compra",
        ccSino: "o aviso de lançamentos sem centro de custo", ccIA: "a sugestão de centro por IA"
      };
      if (Ge && typeof Ge._medccDesligadas === "function") {
        var dm = [], km;
        try { dm = Ge._medccDesligadas() || []; } catch (eM) { dm = []; }
        var rot = [];
        for (km = 0; km < dm.length; km++) if (own(ROTM, dm[km]) && dm[km] !== "ccIA") rot.push(ROTM[dm[km]]);
        if (rot.length) {
          li.push('<span class="cx-compat-ruim">' + esc("Desligado nesta instalação: " + rot.join("; ") +
            ". Nenhum dado gravado foi apagado — o que já está no avanço e nos centros continua valendo.") + '</span>');
        }
      }

      var h = '<div class="card cx-card cx-compat"><h4>Compatibilidade com aparelhos de versão anterior</h4>';
      if (!mat && !li.length && !cab.length) {
        return h + '<p class="muted cx-compat-nada">' +
          esc("Este cronograma ainda não usa nenhuma das funções novas (tarefas sem preço, calendários das frentes, tipos de ligação ou avanço lançado): aparelhos com a versão anterior veem exatamente as mesmas datas.") + '</p></div>';
      }
      h += cab.join("");
      if (li.length) {
        h += '<p class="muted cx-compat-lead">' + esc("O que um aparelho que ainda não atualizou vê de diferente neste cronograma:") + '</p><ul class="cx-lista">';
        li.forEach(function (x) { h += '<li>' + x + '</li>'; });
        h += '</ul>';
      } else {
        h += '<p class="muted cx-compat-nada">' + esc("Nenhuma diferença na última conferência: aparelhos com a versão anterior veem as mesmas datas.") + '</p>';
      }
      if (mat && mat.em) h += '<p class="muted cx-compat-em">' + esc("Última conferência ao salvar: " + dmaS(String(mat.em).slice(0, 10)) + ".") + '</p>';
      return h + '</div>';
    },
    /* ------------------------------------------------------------------
       O CARTÃO "CALENDÁRIOS DAS FRENTES" (calendario.md passo 1).
       ⚠ A PRIMEIRA LINHA É A RÉGUA DA OBRA, e é só leitura: uma fonte só para
         "quantos dias por semana". Repetir aqui o campo Dias/sem. daria dois
         lugares para a mesma resposta, e o segundo envelhece.
       ------------------------------------------------------------------ */
    calCartao: function (d, est) {
      void est;
      var orc = (d && d.orc) || null, cron = (orc && orc.cronograma && typeof orc.cronograma === "object") ? orc.cronograma : {};
      var cal = (cron.cal && typeof cron.cal === "object" && !ehArr(cron.cal)) ? cron.cal : null;
      var lista = cal ? arr(cal.lista) : [], de = (cal && cal.de && typeof cal.de === "object" && !ehArr(cal.de)) ? cal.de : {};
      var p = (d && d.r && d.r.params) || {}, dias = p.diasUteisSemana || 5;
      var usos = {}, id;
      for (id in de) if (own(de, id)) usos[de[id]] = (usos[de[id]] || 0) + 1;
      var h = '<div class="card cx-card cx-cal-painel"><h4>Calendários das frentes</h4>' +
        '<p class="muted cx-cal-lead">' + esc("O prazo da obra é contado em dias úteis da obra (" + dias +
          " por semana, com os feriados descontados). Uma frente que trabalha em outro regime — 7 dias por semana, dois turnos, sábado até o meio-dia, só no fim de semana da parada da planta — ganha um calendário próprio: a duração dela passa a ser contada nos dias de trabalho dela.") + '</p>' +
        '<table class="tbl cx-cal-tab"><thead><tr><th>Calendário</th><th>Regime</th><th>Frentes</th><th></th></tr></thead><tbody>' +
        '<tr class="cx-cal-obra"><td><b>Calendário da obra</b></td><td>' + esc((dias === 7 ? "todos os dias" : (dias === 6 ? "seg a sáb" : "seg a sex")) +
        " · " + (p.descontarFeriados === false ? "não desconta feriados" : "segue os feriados da obra")) + '</td><td class="muted">' + esc("as demais") +
        '</td><td class="muted">' + esc("muda em Dias/sem. e Feriados locais, na sub-aba Cronograma") + '</td></tr>';
      lista.forEach(function (c) {
        if (!c || typeof c !== "object") return;
        var hh = ehArr(c.h) ? c.h : [], n = 0, i;
        for (i = 0; i < hh.length; i++) if (Number(hh[i]) > 0) n++;
        h += '<tr data-cal-id="' + esc(String(c.id)) + '"><td>' + esc(corta(String(c.nome || c.id), 40)) + '</td>' +
          '<td>' + esc(n + " dia(s)/semana" + (Number(c.turnos) > 1 ? " · " + Number(c.turnos) + " turnos" : "") +
            (c.fer === "trabalha" ? " · trabalha em feriado" : " · segue os feriados da obra") + (arr(c.exc).length ? " · " + arr(c.exc).length + " parada(s)" : "")) + '</td>' +
          '<td>' + (usos[c.id] || 0) + '</td>' +
          '<td><button class="btn sm ghost" data-acao="crono-cal-abrir" data-cal="' + esc(String(c.id)) + '">Editar</button></td></tr>';
      });
      h += '</tbody></table><div class="flex" style="gap:8px;margin-top:8px;flex-wrap:wrap">' +
        '<button class="btn sm primary" data-acao="crono-cal-abrir">' + esc(lista.length ? "Calendários (" + lista.length + ")" : "+ Novo calendário") + '</button></div>';
      return h + '</div>';
    },

    /* ==================================================================
       O MODAL DOS CALENDÁRIOS (calendario.md passos 1 a 3). Só HTML: quem
       grava é `App._acoesCrono_cal`, com as guardas na função.
       `dados` = {lista, de, nos, editando, novo, travado, erro}.
       ================================================================== */
    CAL_MODELOS: [
      { id: "7x7", nome: "Montagem 7x7", h: [8, 8, 8, 8, 8, 8, 8], turnos: 1, fer: "obra", rot: "7 dias por semana (7×7)" },
      { id: "2t", nome: "Dois turnos", h: [0, 8, 8, 8, 8, 8, 0], turnos: 2, fer: "obra", rot: "Dois turnos, seg a sex" },
      { id: "sab", nome: "Com sabado ate 12h", h: [0, 8, 8, 8, 8, 8, 4], turnos: 1, fer: "obra", rot: "Seg a sex + sábado até 12h" },
      { id: "par", nome: "Parada da planta", h: [10, 0, 0, 0, 0, 0, 10], turnos: 2, fer: "trabalha", rot: "Só fim de semana (parada da planta)" },
      { id: "branco", nome: "", h: [0, 8, 8, 8, 8, 8, 0], turnos: 1, fer: "obra", rot: "Em branco" }
    ],
    DIAS_SEM: ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
    calModalHtml: function (dados) {
      dados = dados || {};
      var self = this, lista = arr(dados.lista), de = (dados.de && typeof dados.de === "object" && !ehArr(dados.de)) ? dados.de : {};
      function nomeCal(cid) {
        var n = String(cid || "");
        lista.forEach(function (c) { if (c && String(c.id) === String(cid)) n = String(c.nome || c.id); });
        return n;
      }
      var h = '<div class="cx-cal-modal">';
      if (dados.travado) h += '<div class="cx-aviso">' + esc(String(dados.travado)) + '</div>';
      if (dados.erro) h += '<div class="cx-aviso cx-compat-ruim">' + esc(String(dados.erro)) + '</div>';
      var ed = dados.novo || null, i;
      if (!ed && dados.editando) lista.forEach(function (c) { if (c && String(c.id) === String(dados.editando)) ed = c; });
      if (ed) {
        h += '<h4 class="cx-cal-tit">' + esc("Calendário: " + (ed.nome || "novo")) + '</h4>' +
          '<div class="field"><label>Nome</label><input id="cal-nome" class="input" maxlength="60" value="' + esc(String(ed.nome || "")) + '"></div>' +
          '<div class="field"><label>Horas por dia (0 = não trabalha)</label><div class="flex" style="gap:6px;flex-wrap:wrap">';
        for (i = 0; i < 7; i++) {
          h += '<label class="cx-cal-dia">' + esc(self.DIAS_SEM[i]) +
            '<input id="cal-h' + i + '" type="number" min="0" max="24" step="0.5" value="' + esc(String((ehArr(ed.h) && ed.h[i] != null) ? ed.h[i] : 0)) + '"></label>';
        }
        h += '</div></div><div class="flex" style="gap:14px;flex-wrap:wrap;align-items:flex-end">' +
          '<div class="field" style="margin:0"><label title="' + esc("Com 2 turnos, a duração ESTIMADA pelo agente cai pela metade; a que você digitou não muda.") + '">Turnos por dia</label>' +
          '<select id="cal-turnos"><option value="1"' + (Number(ed.turnos) > 1 ? '' : ' selected') + '>1</option>' +
          '<option value="2"' + (Number(ed.turnos) === 2 ? ' selected' : '') + '>2</option>' +
          '<option value="3"' + (Number(ed.turnos) === 3 ? ' selected' : '') + '>3</option></select></div>' +
          '<div class="field" style="margin:0"><label>Feriados</label><select id="cal-fer">' +
          '<option value="obra"' + (ed.fer === "trabalha" ? '' : ' selected') + '>segue os feriados da obra</option>' +
          '<option value="trabalha"' + (ed.fer === "trabalha" ? ' selected' : '') + '>trabalha em feriado</option></select></div></div>' +
          '<p class="muted cx-cal-nota">' + esc("Um dia com menos horas que o dia cheio conta como fração: sábado de 4 h num calendário de 8 h vale meio dia de trabalho.") + '</p>';
        if (arr(ed.exc).length) {
          h += '<div class="cx-pr-sec"><b>Paradas e dias extras</b></div><ul class="cx-lista">';
          arr(ed.exc).forEach(function (x) {
            h += '<li>' + esc(dmaS(x.de) + (x.ate && x.ate !== x.de ? " a " + dmaS(x.ate) : "") + " · " + String(x.h) + " h" + (x.m ? " · " + String(x.m) : "")) + '</li>';
          });
          h += '</ul>';
        }
        h += '<div class="flex" style="gap:8px;margin-top:10px;flex-wrap:wrap">' +
          '<button class="btn sm primary" data-acao="crono-cal-salvar" data-cal="' + esc(String(ed.id || "")) + '">Salvar calendário</button>' +
          (dados.novo ? '' : '<button class="btn sm ghost" data-acao="crono-cal-excluir" data-cal="' + esc(String(ed.id || "")) + '">Excluir</button>') +
          '<button class="btn sm ghost" data-acao="crono-cal-abrir">Voltar à lista</button></div>';
        return h + '</div>';
      }
      h += '<p class="muted cx-cal-lead">' + esc("A frente com calendário próprio tem a duração contada nos dias de trabalho dela. O prazo da obra continua em dias úteis da obra.") + '</p>';
      if (!lista.length) h += '<p class="muted cx-cal-vazio">' + esc("Nenhum calendário criado ainda.") + '</p>';
      else {
        var usos = {}, id;
        for (id in de) if (own(de, id)) usos[de[id]] = (usos[de[id]] || 0) + 1;
        h += '<table class="tbl"><thead><tr><th>Calendário</th><th>Frentes</th><th></th></tr></thead><tbody>';
        lista.forEach(function (c) {
          if (!c) return;
          h += '<tr><td>' + esc(corta(String(c.nome || c.id), 40)) + '</td><td>' + (usos[c.id] || 0) + '</td>' +
            '<td><button class="btn sm ghost" data-acao="crono-cal-abrir" data-cal="' + esc(String(c.id)) + '">Editar</button></td></tr>';
        });
        h += '</tbody></table>';
      }
      h += '<div class="cx-pr-sec"><b>Novo calendário</b></div><div class="flex" style="gap:6px;flex-wrap:wrap">';
      this.CAL_MODELOS.forEach(function (m) {
        h += '<button class="btn sm ghost" data-acao="crono-cal-novo" data-modelo="' + esc(m.id) + '">' + esc(m.rot) + '</button>';
      });
      h += '</div>';
      var nos = arr(dados.nos);
      if (lista.length && nos.length) {
        /* A ATRIBUIÇÃO EM LOTE (passo 3). O antes → depois é mostrado PELA
           AÇÃO, antes de gravar — como o interruptor do modo executivo. */
        h += '<div class="cx-pr-sec"><b>Aplicar a</b> <span class="muted">' + esc("— o antes → depois aparece antes de gravar") + '</span></div>' +
          '<div class="flex" style="gap:8px;flex-wrap:wrap;align-items:flex-end"><div class="field" style="margin:0"><label>Frentes</label>' +
          /* ⚠ `size="6"` LITERAL, e nunca calculado. Isto era
             o size calculado por Math.min(6, nos.length), e com UMA frente saía
             um multiple de tamanho 1 — o campo morto do macOS: lá um
             `multiple` é SEMPRE lista, nunca menu, e uma lista de uma linha
             não tem para onde abrir. O cliente vê uma caixinha sem seta que
             não responde (relato de 30/08/2026, com print, no seletor de obra
             do Painel). ⚠ E o número é LITERAL porque quem guarda isto é a
             `test-select-no-mac`, que lê o texto do arquivo: size calculado
             ela não consegue conferir, e o defeito volta calado — não há como
             vê-lo aqui, onde só existe Windows. Com poucas frentes a lista
             nasce com linhas vazias, e é o preço certo a pagar. */
          '<select id="cal-lote-nos" multiple size="6" class="cx-cal-lote">';
        nos.forEach(function (n) {
          h += '<option value="' + esc(String(n.id)) + '">' + esc(corta(String(n.numero || "") + " " + String(n.nome || ""), 48) +
            (own(de, n.id) ? " (" + nomeCal(de[n.id]) + ")" : "")) + '</option>';
        });
        h += '</select></div><div class="field" style="margin:0"><label>Calendário</label><select id="cal-lote-cal"><option value="">Calendário da obra</option>';
        lista.forEach(function (c) { if (c) h += '<option value="' + esc(String(c.id)) + '">' + esc(corta(String(c.nome || c.id), 40)) + '</option>'; });
        h += '</select></div><button class="btn sm primary" data-acao="crono-cal-lote">Aplicar</button></div>';
      }
      return h + '</div>';
    },
    /* ==================================================================
       O MODAL DO AVANÇO LANÇADO (avanco.md passos 1 e 2). Só HTML.
       `dados` = {corte, hoje, proximoUtil, ultimoDiario, anterior {corte, nos},
       fontes, antesDepois, semBase, semInicio, erro}.
       ⚠ A PORTA [Fixar início] VEM PRONTA DA 1A (`App._cronoPortaInicioHtml`),
         em `dados.semInicio`: uma segunda porta aqui gravaria o início por
         outro caminho, e as duas divergiriam na primeira manutenção (a espec
         dá UMA porta, §3.1 "2A × 2B").
       ================================================================== */
    avancoModalHtml: function (dados) {
      dados = dados || {};
      var h = '<div class="cx-avanco-painel">';
      if (dados.erro) h += '<div class="cx-aviso cx-compat-ruim">' + esc(String(dados.erro)) + '</div>';
      if (dados.semInicio) {
        /* ⚠ SEM INÍCIO FIXO NÃO HÁ AVANÇO (O14/I13): o avanço lançado vira
           piso de data ABSOLUTA na sombra. Com o início em "hoje", a 1.2.81
           recalcularia amanhã com o piso de hoje e mostraria outra data,
           calada. Por isso a porta vem antes de qualquer campo. */
        return h + '<p>' + esc("O avanço lançado vira data fixa no cronograma. Sem o início da obra fixado, aparelhos com a versão anterior calculariam outra data a cada dia.") +
          '</p>' + dados.semInicio + '</div>';
      }
      h += '<div class="field"><label>Data de corte</label><input id="av-corte" type="date" value="' + esc(String(dados.corte || "")) + '"' +
        (dados.hoje ? ' max="' + esc(String(dados.hoje)) + '"' : '') + '></div>' +
        '<p class="muted cx-av-nota">' + esc("O avanço descreve a obra até o FIM deste dia. O que falta recomeça no dia útil seguinte" +
          (dados.proximoUtil ? " (" + dmaS(dados.proximoUtil) + ")." : ".")) + '</p>';
      var ctx = [];
      if (dados.ultimoDiario) ctx.push("Último diário publicado: " + dmaS(dados.ultimoDiario));
      if (dados.anterior && dados.anterior.corte) ctx.push("Avanço anterior: " + dmaS(dados.anterior.corte) + " (" + (dados.anterior.nos || 0) + " tarefa(s))");
      if (ctx.length) h += '<p class="muted cx-av-ctx">' + esc(ctx.join(" · ")) + '</p>';
      h += this.avancoSugestoesHtml(dados.fontes, { corte: dados.corte });
      if (dados.antesDepois) h += '<div class="cx-aviso cx-av-diff">' + esc(String(dados.antesDepois)) + '</div>';
      if (dados.semBase) {
        h += '<div class="cx-aviso">' + esc("Esta obra ainda não tem linha de base. Reprogramando agora, o prazo original só fica visível na proposta.") + '</div>';
      }
      return h + '</div>';
    },

    /* ------------------------------------------------------------------
       AS SUGESTÕES, UMA TABELA POR FONTE (E-MC5).

       ⚠ `fontes` é uma LISTA de `{fonte, linhas}`, e não uma lista de linhas.
         Hoje só a do diário é montada; a da medição chega pela fiação da
         ESPEC-medicao-cc (mc-6B) SEM EDITAR ESTA FUNÇÃO. Com uma lista só, a
         medição entraria misturada às linhas do diário — e a tabela diria "os
         diários dizem" sobre um número que veio de um boletim aprovado. Duas
         fontes, dois títulos, duas tabelas.
       ------------------------------------------------------------------ */
    ROT_FONTE: { diario: "Os diários publicados dizem", medicao: "As medições aprovadas dizem" },
    avancoSugestoesHtml: function (fontes, opts) {
      opts = opts || {};
      var self = this, l = arr(fontes), h = "", n = 0;
      l.forEach(function (f) {
        if (!f || typeof f !== "object") return;
        var linhas = arr(f.linhas);
        if (!linhas.length) return;
        n++;
        var fid = String(f.fonte == null ? "" : f.fonte);
        var rot = own(self.ROT_FONTE, fid) ? self.ROT_FONTE[fid] : ("Sugestões de " + (fid || "outra fonte"));
        h += '<div class="cx-pr-sec cx-av-fonte"><b>' + esc(rot + (opts.corte ? " até " + dmaS(opts.corte) : "") + ":") + '</b></div>' +
          '<table class="tbl cx-av-sug" data-fonte="' + esc(fid) + '"><thead><tr><th>Tarefa</th><th>No avanço</th><th>' +
          esc(fid === "medicao" ? "Nas medições" : "Nos diários") + '</th><th>Usar</th></tr></thead><tbody>';
        linhas.forEach(function (x) {
          if (!x || !x.id) return;
          h += '<tr><td>' + esc(corta(String(x.numero || "") + " " + String(x.nome || x.id), 46)) + '</td>' +
            '<td>' + esc(x.atual == null ? "—" : String(x.atual)) + '</td>' +
            '<td>' + esc(x.novo == null ? "—" : String(x.novo)) + (x.rotulo ? ' <span class="muted">(' + esc(String(x.rotulo)) + ')</span>' : '') + '</td>' +
            '<td><input type="checkbox" data-av-sug="' + esc(String(x.id)) + '" data-av-fonte="' + esc(fid) + '"' + (x.marcada ? ' checked' : '') + '></td></tr>';
        });
        h += '</tbody></table>';
      });
      if (!n) return '<p class="muted cx-av-semsug">' + esc("Nenhuma sugestão nesta data: os lançamentos já estão no avanço, ou ainda não há lançamento.") + '</p>';
      return h;
    },

    /* a confirmação de [Limpar o avanço] (avanco.md passo 7) — com os DOIS
       términos, porque é isso que a pessoa precisa para decidir */
    avancoLimparHtml: function (dados) {
      dados = dados || {};
      return '<p>' + esc("Apagar o avanço lançado em " + (dados.nos || 0) + " tarefa(s) (até " + dmaS(dados.corte) +
        ") e voltar o plano ao que era antes das datas reais?" +
        (dados.de && dados.para ? " O término volta de " + dmaS(dados.de) + " para " + dmaS(dados.para) + "." : "")) + '</p>' +
        '<p class="muted">' + esc("Os diários e as medições não mudam.") + '</p>';
    },

    /* ==================================================================
       OS REGISTROS DA LINHA DO PRAZO (T20) — [Lançar/Atualizar avanço] e
       [Calendários (N)].

       ⚠ A AÇÃO MORA NO CARD DO NÚMERO QUE ELA MUDA (memória "ação mora no
         card do número"): o botão do avanço fica ao lado do prazo, que é o
         número que ele altera. Na sub-aba Parâmetros ninguém o encontraria —
         já aconteceu nesta base, com quatro recados apontando para um lugar
         que o clique seguinte fechava.
       ⚠ A 2A DESENHA A LINHA; a 2B só registra pela tomada. Sem estes dois
         registros a linha sai byte a byte a de hoje — é o controle negativo
         da `e2e-crono-calendario-painel` (registro removido → o link some).
       ================================================================== */
    _regPrazo2B: (function () {
      _prazoReg.push({
        id: "avanco", ordem: 20,
        quando: function (d) {
          var Cr = C();
          if (Cr && typeof Cr.recursos === "function" && Cr.recursos().avanco === false) return false;
          /* SÓ NO PLANO DA OBRA: o avanço é o que aconteceu na obra, não uma
             hipótese da proposta. No orçamento a porta já é [Iniciar plano]. */
          return !!(d && d.obra && d.obra.alvo && d.obra.alvo.tipo === "plano" && d.obra.alvo.obra);
        },
        html: function (d) {
          var ob = d.obra.alvo.obra, av = (d.r && d.r.avanco) || null;
          var cont = (av && av.contagem) || {}, nAv = (cont.concluidas || 0) + (cont.andamento || 0);
          var sel = "";
          if (av && av.corte) {
            sel = '<span class="pill cx-pill-avanco" title="' + esc("O avanço descreve a obra até o fim de " + dmaS(av.corte) +
              ". O que falta foi reprogramado a partir do dia útil seguinte.") + '">📍 Avanço até ' + esc(dmaS(av.corte)) +
              (nAv ? esc(" · " + nAv + " tarefa(s)") : "") + '</span>';
          }
          return sel + '<button class="btn sm' + (av && av.corte ? '' : ' primary') + '" data-acao="crono-avanco-abrir" data-obra="' + esc(String(ob.id)) +
            '" title="' + esc("Lançar o % concluído, o início e o fim reais de cada tarefa, e reprogramar o que falta a partir de uma data de corte. A proposta aprovada não muda.") +
            '">' + (av && av.corte ? "Atualizar avanço" : "Lançar avanço") + '</button>';
        }
      });
      _prazoReg.push({
        id: "cal", ordem: 30,
        quando: function (d) {
          var Cr = C();
          if (Cr && typeof Cr.recursos === "function" && Cr.recursos().cal === false) return false;
          return !!(d && d.r);
        },
        html: function (d) {
          var cron = (d.orc && d.orc.cronograma && typeof d.orc.cronograma === "object") ? d.orc.cronograma : {};
          var cal = (cron.cal && typeof cron.cal === "object" && !ehArr(cron.cal)) ? cron.cal : null;
          var n = cal ? arr(cal.lista).length : 0;
          /* sem calendário nenhum o link CONTINUA: é por ele que se cria o
             primeiro — a sub-aba Parâmetros é o caminho longo */
          /* ⚠ `pill`, E NÃO `gx-uso-link`: a régua do cronograma
             (e2e-padrao-cronograma) mede TODO clicável acima do Gantt e
             aceita 32 px/raio 8 para botão e 24 px/raio 999 para pill. O
             `gx-uso-link` — que é da barra de uso, abaixo — sai com 18,6 px e
             raio 0: medido em 21/09/2026 na fusão da Onda 2, reprovou nos
             cinco tamanhos e nos dois temas, e na base do branch a lista
             estava vazia. A linha do prazo já é feita de pills (caminho
             crítico, feriados, com as opcionais, Saúde), então a pill também
             é o que mantém a intenção da espec: mais leve que o botão
             [Lançar avanço] ao lado, sem inventar um sexto jeito de clicável. */
          return '<button type="button" class="pill cx-pill-cal-bt" data-acao="crono-cal-abrir" title="' +
            esc(n ? "Frentes em calendário próprio: a duração delas é contada nos dias de trabalho da frente."
                  : "Uma frente que trabalha em outro regime (7×7, dois turnos, sábado até 12h) ganha um calendário próprio.") +
            '">' + (n ? "Calendários (" + n + ")" : "Calendários") + '</button>';
        }
      });
      _prazoReg.sort(function (a, b) { return (a.ordem - b.ordem) || (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0)); });
      return 1;
    })(),
    /*
     * ↑ região da fatia 2B: modais, cartão "Compatibilidade" e os registros da
     * linha do prazo (registrarPrazo). A âncora abaixo fecha o objeto.
     *
     */

    /* ===== MEDCC 6B ===== */
    _regMedcc6B: 1,

    /* ==================================================================
       AS FAIXAS DA MEDIÇÃO NA LINHA DO PRAZO (ESPEC-medicao-cc §3.1)

       Quatro recados, todos DERIVADOS (nada disto é gravado):
         · sugestão       — "as medições aprovadas dizem mais que o avanço"
         · aprovada sem lançar (D-MX1) — o boletim foi aprovado e os números
           não chegaram ao avanço (é o que uma 1.2.81 deixa para trás, e o
           que sobra quando a gravação foi recusada)
         · sem lastro     — o boletim que sustenta N tarefas deixou de contar
         · diário chegou  — o diário passou a ter a tarefa que a medição tinha

       ⚠ ELAS MORAM NA LINHA DO PRAZO, pelo registro T20 — e não na sub-aba
         Parâmetros. A ação mora no card do NÚMERO que ela muda (memória
         "ação mora no card do número"): o prazo é o número que o avanço
         altera. Quatro recados desta base já apontaram para um lugar que o
         clique seguinte fechava.
       ⚠ E ELAS SOMEM NO MODO "APRESENTAR" DAS CAMADAS (R3-4, D30 do
         planejador). "A medição 01a foi reaberta" é conversa interna da RA;
         o modo "Apresentar" existe justamente para mostrar o Gantt ao
         cliente na reunião. O modal e o previsto × realizado NÃO mudam: eles
         não estão na tela que se projeta.
       ================================================================== */
    _medccApresentando: function () {
      var A = G("App");
      if (!A) return false;
      var cam = null;
      try { cam = (typeof A._cronoCamadasLer === "function") ? A._cronoCamadasLer() : A._cronoCamadas; } catch (e) { cam = null; }
      return !!(cam && cam.apresentar);
    },
    /* o texto de cada faixa, puro (a suíte mede daqui, sem navegador) */
    medFaixasHtml: function (f) {
      if (!f) return "";
      var h = "", o = esc(String(f.obraId || ""));
      var porta = '<button class="btn sm ghost cx-med-puxar" data-acao="crono-avanco-med-puxar" data-obra="' + o + '">Puxar das medições</button>';
      var precisaPorta = false;
      if (f.sugerir) {
        h += '<span class="pill cx-pill-med cx-med-sugere" title="' +
          esc("O avanço lançado é atualizado só por quem planeja. Estas tarefas são as que os boletins aprovados completam — o diário continua mandando onde ele fala.") + '">📋 ' +
          esc(f.sugerir + " tarefa(s) nas medições" + (f.corte ? " até " + dmaS(f.corte) : "")) + '</span> ';
        precisaPorta = true;
      }
      /* ⚠ A FAIXA "APROVADA SEM LANÇAR" (D-MX1, §3.1) — a quarta da espec, e
         a que DOIS recados do canal já prometiam pelo nome ("abra o
         Cronograma da obra: a faixa “aprovada sem lançar” tem [Puxar das
         medições]"). Até 22/09/2026 ela era apurada em `App._medccFaixas` e
         não era desenhada em lugar nenhum: quem seguisse o recado procuraria
         por um nome que a tela não tem. Porta prometida precisa existir. */
      if (f.aprovadaSemLancar && f.aprovadaSemLancar.length) {
        var nB = arr(f.aprovadaSemLancar).map(function (x) { return String(x.numero || x.id); });
        nB.sort();
        h += '<span class="pill cx-pill-med cx-med-semlancar" title="' +
          esc("O boletim foi aprovado com “usar no avanço” e os números dele ainda não estão no avanço lançado. Nada se perde: [Puxar das medições] lança o que ele mede.") + '">📥 ' +
          esc("medição " + nB.join(", ") + " aprovada sem lançar") + '</span> ';
        precisaPorta = true;
      }
      if (precisaPorta) h += porta;
      if (f.conflito) {
        h += '<span class="pill cx-pill-med cx-med-conflito" title="' +
          esc("Você lançou um número e a medição aprovada diz outro. Nada foi mudado: abra [Atualizar avanço] para ver os dois lado a lado.") + '">⚖ ' +
          esc(f.conflito + " tarefa(s) com número diferente da medição") + '</span>';
      }
      /* ⚠ o nome da tarefa vem do mapa de nós (`f.nomes`), nunca das
         sugestões: quando o boletim é reaberto a tarefa some das sugestões e
         a faixa sairia com o id cru do nó */
      /* ⚠ CORTADO EM 40: a linha do prazo é uma fila de pills, e o nome
         inteiro de uma subetapa ("Projeto estrutural executivo (fundacao +
         detalhamento da metalica)") empurrava os dois botões da decisão para
         a linha de baixo — medido na foto da e2e a 1366 px. O número vem
         antes, que é por ele que a pessoa acha a tarefa. */
      var nomeNo = function (id) {
        var nm = (f.nomes && f.nomes[id]) || null;
        if (!nm) return String(id);
        return (nm.numero ? nm.numero + " " : "") + corta(String(nm.nome || id), 40);
      };
      if (f.semLastro && f.semLastro.length) {
        /* ⚠ O NÚMERO DO BOLETIM, NUNCA O ID: "a medição demo-galpao-med-01
           foi reaberta" não é recado, é despejo de banco de dados. Quando o
           mapa não conhece o boletim, o id sai — feio, mas verdadeiro. */
        var b0 = f.semLastro[0], quantos = {}, k, nomes = [];
        arr(f.semLastro).forEach(function (x) { quantos[String(x.bNumero || x.b)] = (quantos[String(x.bNumero || x.b)] || 0) + 1; });
        for (k in quantos) if (own(quantos, k)) nomes.push(k);
        nomes.sort();
        h += '<span class="pill cx-pill-med cx-med-semlastro" title="' +
          esc("Nada foi mudado no avanço: o número pode estar certo — a obra pode ter sido feita e o boletim recusado por preço. Use [Rever] para decidir tarefa a tarefa.") + '">⚠ ' +
          esc(f.semLastro.length + " tarefa(s) com avanço da medição " + nomes.join(", ") + " (" + (b0.situacao === "reaberta" ? "reaberta" : (b0.situacao === "rejeitada" ? "rejeitada" : (b0.situacao === "excluida" ? "excluída" : "fora da conta"))) + ")") +
          '</span> <button class="btn sm ghost cx-med-rever" data-acao="crono-avanco-med-rever" data-obra="' + o + '">Rever</button>';
      }
      /* ⚠ "NÃO CONSEGUI PERGUNTAR AOS DIÁRIOS" — e a faixa diz isso, sem
         porta. Antes, a leitura falha dos diários virava `false` no motor
         ("o diário TEM o nó") e a linha do prazo escrevia "📓 3.1 passou a
         ter lançamento nos diários" com [Usar o diário] ao lado — que no
         clique respondia "Os diários ainda não apuram esta tarefa". O app
         afirmava um fato e o desmentia no clique seguinte. Uma faixa só, com
         a contagem: N linhas repetindo a mesma falha seria despejo. */
      if (f.diarioIlegivel) {
        h += '<span class="pill cx-pill-med cx-med-ilegivel" title="' +
          esc("A medição não completa tarefa sobre a qual não conseguiu perguntar ao diário. Nada foi lançado e nada foi apagado. Se os diários desta obra abrem normalmente, recarregue o app.") + '">📓 ' +
          esc("não consegui ler os diários desta obra: " + f.diarioIlegivel + " tarefa(s) ficaram como estão") + '</span> ';
      }
      arr(f.diarioChegou).forEach(function (s) {
        h += '<span class="pill cx-pill-med cx-med-diario" title="' +
          esc("O diário mede o que foi FEITO; a medição, o que foi aprovado para pagamento. Quando os dois falam da mesma tarefa, quem planeja costuma querer o do diário.") + '">📓 ' +
          esc(nomeNo(s.id) + " passou a ter lançamento nos diários") + '</span> ' +
          '<button class="btn sm ghost" data-acao="crono-avanco-med-usar-diario" data-obra="' + o + '" data-no="' + esc(String(s.id)) + '">Usar o diário</button> ' +
          '<button class="btn sm ghost" data-acao="crono-avanco-med-manter-medicao" data-obra="' + o + '" data-no="' + esc(String(s.id)) + '">Manter a medição</button>';
      });
      return h;
    },
    _regPrazoMedcc: (function () {
      _prazoReg.push({
        id: "med-avanco", ordem: 25,
        /* ⚠ `quando` FALSO NO MODO "APRESENTAR" (R3-4). Sem esta linha, "a
           medição 01a foi reaberta em 12/08" apareceria ao lado do prazo
           numa apresentação ao cliente. O registro que lança não derruba a
           linha (o `_prazoRegistrados` cerca cada um), mas um `quando` que
           ignora as camadas não dá erro nenhum — ele só expõe. */
        quando: function (d) {
          var Cr = C();
          if (Cr && typeof Cr.recursos === "function" && Cr.recursos().avanco === false) return false;
          if (CronoExecUI._medccApresentando()) return false;
          return !!(d && d.obra && d.obra.alvo && d.obra.alvo.tipo === "plano" && d.obra.alvo.obra);
        },
        html: function (d) {
          var A = G("App"), ob = d.obra.alvo.obra;
          if (!A || typeof A._medccFaixas !== "function") return "";
          var f = null;
          try { f = A._medccFaixas(String(ob.id)); } catch (e) { f = null; }
          if (!f) return "";
          return CronoExecUI.medFaixasHtml(f);
        }
      });
      _prazoReg.sort(function (a, b) { return (a.ordem - b.ordem) || (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0)); });
      return 1;
    })(),
    /*
     * ↑ região da fatia MEDCC 6B (faixas da medição na linha do prazo e as
     * chaves `medcc` no cartão "Compatibilidade"). A âncora abaixo fecha o
     * objeto.
     *
     */
    _regFim: 1
  };

  global.CronoExecUI = CronoExecUI;
  if (typeof module !== "undefined" && module.exports) module.exports = CronoExecUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
