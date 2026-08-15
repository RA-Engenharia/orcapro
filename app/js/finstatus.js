/* =====================================================================
 * finstatus.js — O CICLO DE VIDA DE UM LANÇAMENTO FINANCEIRO
 *
 * POR QUE ISTO EXISTE (15/08/2026):
 * O lançamento tinha DOIS estados, `pago` e `pendente`, e todo o resto do
 * app perguntava pelo estado errado: quem queria saber "isto já foi
 * realizado?" testava `status !== "pendente"`, e quem queria "está em
 * aberto?" testava `status === "pendente"`. Com dois estados as duas
 * perguntas funcionam por acidente — `!== "pendente"` é o mesmo que
 * `=== "pago"` quando não existe terceiro estado.
 *
 * ⚠ E É EXATAMENTE AÍ QUE O AGENDAMENTO DE PAGAMENTO EXPLODIRIA.
 *   Bastava existir um `agendado` para o MESMO registro ser contado como
 *   dinheiro já realizado no Painel, no resultado por obra e no custo por
 *   etapa (js/gestao.js:830, 936, 937, 1112, 1199 — todos com o pivô em
 *   `pendente`) e, ao mesmo tempo, SUMIR de "A Pagar" e do alerta de contas
 *   a vencer (js/gestao.js:832, 1127, 1237). Uma conta agendada apareceria
 *   como paga e desapareceria da fila de pagamento no mesmo instante.
 *
 *   Por isso este módulo vem ANTES dos estados novos, e não junto: primeiro
 *   o pivô passa de `pendente` para `pago`, o que hoje NÃO muda resultado
 *   nenhum (com dois estados as duas formas são equivalentes — e há teste
 *   provando a equivalência caso a caso). Só depois os estados entram.
 *
 * ⚠ `vencido` NÃO É ESTADO GRAVADO, é pergunta. Ele depende de que dia é
 *   hoje: gravá-lo obrigaria alguém a varrer a base todo dia para carimbar,
 *   e dois aparelhos carimbariam em horas diferentes — o merge da nuvem
 *   trataria isso como conflito e o registro ficaria oscilando. Estado que
 *   muda sozinho com o relógio se calcula, não se guarda.
 *
 * Módulo PURO: sem DOM, sem Store, sem rede. Testável no Node.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* Os estados que um lançamento pode TER GRAVADO. `vencido` não está aqui
     de propósito — ver a nota do cabeçalho. */
  var ESTADOS = {
    previsto:  { rotulo: "Previsto",  cor: "#64748b", aberto: true },
    pendente:  { rotulo: "Pendente",  cor: "#d97706", aberto: true },
    agendado:  { rotulo: "Agendado",  cor: "#2563eb", aberto: true },
    pago:      { rotulo: "Pago / Recebido", cor: "#16a34a", aberto: false },
    falhou:    { rotulo: "Falhou",    cor: "#dc2626", aberto: true },
    cancelado: { rotulo: "Cancelado", cor: "#94a3b8", aberto: false }
    /* ⚠ NÃO EXISTE ESTADO `estornado`, e a ausência é decisão.
       Eu tinha planejado "marca o original como estornado E cria o espelho".
       Isso conta a reversão DUAS VEZES: o original sai do realizado (−1.000)
       e o espelho entra (−1.000), somando −2.000 para uma reversão de 1.000.
       Estorno é MOVIMENTO, não mudança de estado — a mesma doutrina que o
       almoxarifado já usa (js/gestao.js:12743). O original continua `pago`,
       porque ele FOI pago e o mês em que isso aconteceu não pode passar a
       mentir; o espelho, de sinal oposto e datado do dia da reversão, faz o
       par somar zero e mostra a devolução no mês em que ela ocorreu.
       "Estornado" é BADGE derivado do vínculo `estornoId`, como `vencido` é
       derivado da data: ver Gestao.finEstornar. */
  };

  /* Para onde cada estado pode ir. Transição que não está aqui é recusada —
     e a recusa é o ponto: "pago -> previsto" apagaria a baixa de uma conta
     conciliada sem deixar rastro. Para desfazer um pagamento existe estorno,
     que cria registro espelho em vez de reescrever a história. */
  var TRANSICOES = {
    previsto:  ["pendente", "agendado", "pago", "cancelado"],
    pendente:  ["agendado", "pago", "cancelado"],
    agendado:  ["pago", "falhou", "pendente", "cancelado"],
    falhou:    ["agendado", "pendente", "pago", "cancelado"],
    /* `pago` é TERMINAL, e isso é o desenho, não uma lacuna. Baixa de conta
       conciliada não se reescreve: para desfazer, o Financeiro lança o
       estorno — registro novo, de sinal oposto, que soma zero com o original
       e deixa os dois visíveis. Permitir "pago → qualquer coisa" apagaria a
       história sem rastro, e é exatamente o que o botão Estornar evita. */
    pago:      [],
    cancelado: ["pendente"]
  };

  /* ⚠ DUAS AUSÊNCIAS DIFERENTES, E CONFUNDI-LAS MOVE DINHEIRO.
   *
   *   SEM status (undefined, null, "") é registro LEGADO — e o histórico do
   *   app diz o que ele sempre significou: o pivô antigo era
   *   `status !== "pendente"`, então um registro sem status SEMPRE contou
   *   como realizado; e o formulário abre com `f.status || "pago"`. Logo:
   *   ausente = `pago`. Mandá-lo para `pendente` tirava dinheiro já
   *   contabilizado do resultado — o gate pegou na hora (test-gap1 acusou
   *   custo/m² errado, test-gap5 perdeu o donut de categorias), e eu tinha
   *   escrito um teste de equivalência que só cobria "pago" e "pendente".
   *
   *   Status DESCONHECIDO e não-vazio é outra coisa: registro de uma versão
   *   futura, ou dado torto. Esse cai em `pendente` de propósito — é o balde
   *   que aparece na tela e cobra atenção humana, e nunca vira dinheiro
   *   realizado. Chutar o contrário inflaria o caixa com o que não entrou. */
  function norm(s) {
    if (s == null || String(s).trim() === "") return "pago";
    var v = String(s).trim().toLowerCase();
    return ESTADOS[v] ? v : "pendente";
  }

  /* ---- as perguntas que o resto do app faz ---------------------------- */

  /* Dinheiro que ENTROU ou SAIU de verdade. É o que alimenta receitas,
     despesas, resultado, custo por etapa e margem. Só `pago` é realizado —
     agendado não é, previsto não é, e cancelado/estornado nunca foram. */
  function realizado(f) { return norm(f && f.status) === "pago"; }

  /* Dinheiro que ainda se espera receber ou pagar. Cancelado e estornado
     NÃO entram: não são dívida nem crédito, são registro morto. */
  function emAberto(f) {
    var e = ESTADOS[norm(f && f.status)];
    return !!(e && e.aberto);
  }

  /* Já passou do vencimento e ainda está em aberto. `hojeISO` entra por
     parâmetro para o módulo continuar puro e o teste conseguir fixar o dia.
     A data de referência é o vencimento; sem ele, a data de lançamento —
     mesma regra do resto do app (`f.vencimento || f.data`). */
  function vencido(f, hojeISO) {
    if (!emAberto(f)) return false;
    var d = String((f && (f.vencimento || f.data)) || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    return d < String(hojeISO || "");
  }

  /* Vence dentro de N dias (inclusive hoje e inclusive o que já venceu — o
     alerta da casa junta os dois de propósito, ver js/gestao.js). */
  function venceAte(f, limiteISO) {
    if (!emAberto(f)) return false;
    var d = String((f && (f.vencimento || f.data)) || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    return d <= String(limiteISO || "");
  }

  function podeIr(de, para) {
    var a = norm(de), b = norm(para);
    if (a === b) return true;                       // salvar sem mexer no estado
    return (TRANSICOES[a] || []).indexOf(b) > -1;
  }

  function rotulo(s) { return (ESTADOS[norm(s)] || {}).rotulo || "—"; }
  function cor(s) { return (ESTADOS[norm(s)] || {}).cor || "#64748b"; }

  /* Para alimentar o <select> do formulário na ordem do ciclo de vida. */
  function opcoes() {
    return ["previsto", "pendente", "agendado", "pago", "falhou", "cancelado"]
      .map(function (k) { return [k, ESTADOS[k].rotulo]; });
  }

  /* O par original + estorno tem de somar ZERO. Esta é a invariante do
     estorno, e ela mora aqui para que o teste a exercite sem precisar do DOM.
     Recebe centavos (js/dinheiro.js) e devolve os centavos do espelho. */
  function valorDoEstorno(centavosOriginais) {
    var c = Number(centavosOriginais);
    return isFinite(c) ? -Math.round(c) : 0;
  }

  var FinStatus = {
    ESTADOS: ESTADOS, TRANSICOES: TRANSICOES,
    norm: norm, realizado: realizado, emAberto: emAberto,
    vencido: vencido, venceAte: venceAte, podeIr: podeIr,
    rotulo: rotulo, cor: cor, opcoes: opcoes,
    valorDoEstorno: valorDoEstorno
  };

  global.FinStatus = FinStatus;
  if (typeof module !== "undefined" && module.exports) module.exports = FinStatus;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
