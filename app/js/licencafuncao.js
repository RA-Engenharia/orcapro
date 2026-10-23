/* =====================================================================
 * licencafuncao.js — A TRAVA DE LICENÇA NA FUNÇÃO (Metálica e Madeira; 21/10/2026)
 *
 * ⚠ A trava é na FUNÇÃO, não no botão. A fita esconde o grupo da disciplina que não está liberada (js/bimdisciplinas.js),
 *   mas o cálculo e os documentos também são chamados pelo botão de dentro da janela, por atalho, pela API da tela e pelo
 *   "Corrigir" de cartões de problema — por isso cada função que calcula ou entrega confere sozinha. É o padrão que a
 *   elétrica já usava (js/eleautoui.js, `liberada()`), do Blocok (js/blocokexecui.js) e da Marmoraria
 *   (js/marmorariaui.js, `porta`), agora num lugar só para as duas disciplinas que ainda dependiam da fita.
 *
 * COMO RESPONDE (nesta ordem; a regra do teste de 1 hora mora no js/testemodulo.js — aqui só se PERGUNTA a ele):
 *   vencido / pausado  → recusa e mostra a oferta de compra do teste (TesteModuloUI.oferta). O trabalho continua salvo e
 *                        visível (consulta); calcular, gerar documento e exportar ficam para depois da compra;
 *   sem licença        → recusa (BimDisciplinas.trancada: a disciplina não está liberada nesta conta);
 *   em teste (1 hora)  → LIBERA e CONTA (TesteModulo.tocar: o relógio só anda com uso ativo da função);
 *   comprado / 7 dias / vitrine → libera, como antes.
 * O ENTREGÁVEL em teste sai com a marca "Versão de teste" e o vencido não sai: isso é do TesteModulo.marcarArquivo /
 * marcarHtml, que os `baixar` das telas já chamam com o módulo dono — não se repete aqui.
 *
 * ⚠ Sem o js/bimdisciplinas.js ou o js/testemodulo.js carregados a função NÃO trava (o mesmo que a elétrica faz): o app
 *   inteiro sem o módulo de licença é o app de antes. O index.html carrega os dois no núcleo e o teste confere a fiação.
 * Teste: node tools/test-licenca-funcao.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function TM() { return global.TesteModulo || null; }
  function BD() { return global.BimDisciplinas || null; }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) { /* sem a casca */ } }
  function toast(t) { try { if (global.UI && global.UI.toast) global.UI.toast(t, "erro", 9000); } catch (e) { /* sem a tela */ } }

  var NOMES = { metalica: "Metálica & Mecânica", marcenaria: "Carpintaria & Marcenaria" };

  var LicencaFuncao = {
    NOMES: NOMES,
    ultima: null,

    /* O ESTADO da disciplina, sem efeito colateral: { ok, motivo, modulo }
       motivo: "liberado" | "teste-1h" | "vencido" | "pausado" | "sem-licenca" */
    estado: function (disc) {
      var t = TM(), id = "", est = "fora";
      try { id = t && t.idDisciplina ? t.idDisciplina(disc) : ""; } catch (e) { id = ""; }
      try { est = id && t && t.estado ? t.estado(id) : "fora"; } catch (e2) { est = "fora"; }
      if (est === "vencido" || est === "pausado") return { ok: false, motivo: est, modulo: id };
      var tr = false;
      try { tr = !!(BD() && BD().trancada && BD().trancada(disc)); } catch (e3) { tr = false; }
      if (tr) return { ok: false, motivo: "sem-licenca", modulo: id };
      return { ok: true, motivo: est === "teste" ? "teste-1h" : "liberado", modulo: id };
    },

    /* A PORTA: true = pode executar `acao`; false = recusou (a mensagem e a oferta já estão na tela).
       disc: "metalica" | "marcenaria"; acao: o que a pessoa pediu, em palavras ("calcular a estrutura") */
    guarda: function (disc, acao) {
      var e = this.estado(disc);
      this.ultima = { disc: disc, acao: String(acao || ""), motivo: e.motivo, modulo: e.modulo, ok: e.ok, em: Date.now() };
      if (e.ok) {
        /* em teste: a função usada põe o relógio do módulo para andar (o relógio só conta uso ativo — js/testemodulo.js) */
        if (e.motivo === "teste-1h") { try { if (TM() && TM().tocar) TM().tocar(e.modulo); } catch (x) { /* sem relógio */ } }
        return true;
      }
      this.recusar(e, disc, acao);
      return false;
    },

    /* A PORTA DOS COMANDOS DA FITA (js/bimcmd.js chama, logo depois do TesteModulo.guardaComando). Revisão adversarial
       (21/10/2026): a trava das três telas de cálculo não cobria o resto da Metálica e da Marcenaria — tanque (calcular,
       memorial, folha em PDF), fabricação, DSTV/DXF, listas, IFC, pacote, peso e içamento. Fora do regime do teste de 1 hora
       o TesteModulo deixa todo comando passar, e o único freio era a fita esconder o grupo. Roteiro do defeito: quem comprou
       só a Civil testou os 7 dias do Modela, pôs "Pacote" da Metálica na barra de acesso rápido (botão direito no comando) e,
       com o teste encerrado, o botão continuava na barra (ela não filtra por disciplina) e entregava o pacote. Agora o
       comando cujas disciplinas estão TODAS trancadas e que é da Metálica ou da Marcenaria recusa aqui, venha da fita, da barra
       de acesso rápido, do atalho, do menu de contexto, do "repetir" ou da IA. Basta UMA disciplina do comando liberada
       (pilar e viga são também da Estrutura) — a mesma regra do TesteModulo.guardaComando.
       opts: { aba, rotulo, mostrar:false (sem oferta nem recado na tela) } · true = pode */
    disciplinasDoComando: function (cmdId, aba) {
      var D = BD(), de = null, a = aba || "";
      if (!a) { try { a = TM() && TM()._abaDe ? TM()._abaDe(cmdId) : ""; } catch (e) { a = ""; } }
      try { de = D && D.disciplinasDe ? D.disciplinasDe(cmdId, a) : null; } catch (e2) { de = null; }
      return Object.prototype.toString.call(de) === "[object Array]" ? de : [];
    },
    guardaComando: function (cmdId, opts) {
      opts = opts || {};
      var de = this.disciplinasDoComando(cmdId, opts.aba), self = this;
      var nossas = de.filter(function (d) { return Object.prototype.hasOwnProperty.call(NOMES, d); });
      if (!nossas.length) return true;
      var livre = de.some(function (d) {
        if (Object.prototype.hasOwnProperty.call(NOMES, d)) return self.estado(d).ok;
        try { return !(BD() && BD().trancada && BD().trancada(d)); } catch (e) { return true; }
      });
      if (livre) return true;
      var acao = opts.rotulo ? "usar “" + String(opts.rotulo).replace(/\s+/g, " ") + "”" : "usar este comando";
      if (opts.mostrar === false) {
        var e = this.estado(nossas[0]);
        this.ultima = { disc: nossas[0], acao: acao, motivo: e.motivo, modulo: e.modulo, ok: false, em: Date.now(), cmd: cmdId };
        return false;
      }
      var ok = this.guarda(nossas[0], acao);
      if (this.ultima) this.ultima.cmd = cmdId;
      return ok;
    },

    /* o texto da recusa (também usado pelo teste) */
    mensagem: function (e, disc, acao) {
      var nome = NOMES[disc] || String(disc || ""), a = acao ? " para " + acao : "";
      if (e.motivo === "pausado") return "O teste de 1 hora de " + nome + " está pausado: conecte à internet para continuar" + a + ".";
      if (e.motivo === "vencido") return "O teste de 1 hora de " + nome + " terminou. O que você fez continua salvo e visível; compre o módulo" + a + ".";
      return nome + " não está liberado nesta conta: contrate o módulo (OrçaPRO Modela)" + a + ".";
    },
    recusar: function (e, disc, acao) {
      var msg = this.mensagem(e, disc, acao), mostrou = false;
      status(msg);
      if (e.modulo && (e.motivo === "vencido" || e.motivo === "pausado")) {
        /* a oferta (modal, ou o recado quando há um formulário aberto) já leva a mensagem: só sem ela o toast entra */
        try { if (global.TesteModuloUI && global.TesteModuloUI.oferta) { global.TesteModuloUI.oferta(e.modulo, msg); mostrou = true; } } catch (x) { /* sem a oferta */ }
      } else {
        /* sem licença: o aviso de compra do Modela abre, e o recado desta função (o que foi pedido e por que não rodou) vai junto no toast */
        try { if (global.Modela && global.Modela.oferta) global.Modela.oferta(disc); } catch (x2) { /* sem o Modela */ }
      }
      if (!mostrou) toast(msg);
      return msg;
    }
  };

  global.LicencaFuncao = LicencaFuncao;
  if (typeof module !== "undefined" && module.exports) module.exports = LicencaFuncao;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
