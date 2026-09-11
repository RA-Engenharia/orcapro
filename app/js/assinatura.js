/* =====================================================================
 * assinatura.js — o botão que faz a licença deixar de vencer
 *
 * POR QUE ISTO EXISTE (11/09/2026). A licença mensal era período fechado:
 * vencia, o app parava de salvar e exportar, e não havia UM botão em lugar
 * nenhum do sistema para pagar. O caminho de volta era telefonar para a RA
 * Engenharia — e foi o que um cliente mensal precisou fazer no dia em que a
 * dele venceu, no meio do expediente. Trava sem porta empurra o cliente
 * para o telefone; esta é a porta.
 *
 * O SERVIDOR DECIDE TUDO (server/assinatura-srv.js): se esta licença pode
 * assinar, quanto custa, de quanto em quanto, e o que já está em vigor.
 * Este arquivo só pergunta, desenha e devolve o clique. Nenhuma regra de
 * cobrança mora aqui — regra copiada para a tela é a réplica que apodrece
 * calada, com a tela e o servidor divergindo sem ninguém perceber.
 *
 * ⚠ O CARTÃO NUNCA É DIGITADO AQUI. O cliente cadastra na página do próprio
 *   Asaas, pelo link que o servidor devolve. Este arquivo não tem campo de
 *   cartão, e não deve ganhar um: coletar número de cartão no app traria
 *   para a RA uma responsabilidade que hoje é do Asaas.
 * ⚠ SÓ ABRE LINK DO ASAAS. O endereço chega do servidor, mas é conferido
 *   aqui antes de virar clique — a mesma trava do js/cobranca.js. Servidor
 *   comprometido ou resposta torta não vira link para qualquer lugar.
 * ⚠ TEXTO DO SERVIDOR ENTRA POR textContent, NUNCA innerHTML.
 * ⚠ NENHUM DADO DE CLIENTE NESTE ARQUIVO. Valor, plano e vencimento chegam
 *   em tempo de execução. A pasta js/ viaja nos pacotes de todos os clientes
 *   e numa URL pública sem login (CLAUDE.md §5).
 * ⚠ ASSINAR NÃO TROCA A CHAVE. A renovação estende a MESMA chave, no
 *   servidor. Chave nova seria empresa nova na nuvem, e o cliente abriria o
 *   sistema com os próprios dados "sumidos".
 * ===================================================================== */
(function (global) {
  "use strict";

  var Assinatura = {

    /* ---------------- motor (puro; tools/test-assinatura-app.js) ---------------- */

    brl: function (v) {
      var n = Math.round((Number(v) || 0) * 100), neg = n < 0;
      if (neg) n = -n;
      var inteiro = String(Math.floor(n / 100)), cent = String(n % 100);
      if (cent.length < 2) cent = "0" + cent;
      inteiro = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      return (neg ? "-" : "") + "R$ " + inteiro + "," + cent;
    },

    dataBR: function (iso) {
      var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
      return m ? m[3] + "/" + m[2] + "/" + m[1] : "";
    },

    /* ⚠ O LINK É CONFERIDO, NÃO ACEITO. Só https, e só nos domínios do Asaas
       que emitem fatura. Um endereço que não passe aqui não vira botão — a
       pessoa recebe o recado de falar com a RA, que é honesto, em vez de um
       clique para lugar nenhum. */
    linkValido: function (u) {
      var s = String(u || "");
      return /^https:\/\/(www\.)?(sandbox\.)?asaas\.com\//.test(s);
    },

    /* O que a tela diz, a partir do que o servidor respondeu. Devolve
       { titulo, texto, botao, url, tom } — `botao` vazio = só recado.
       Nenhum valor é calculado aqui: tudo vem do servidor. */
    texto: function (d) {
      var self = this;
      if (!d || !d.ok) {
        /* ⚠ SEM REDE, A PESSOA AINDA PRECISA DE UM CAMINHO. O card de licença
           vencida deixou de mandar "renove com a RA Engenharia" porque a porta
           passou a ser este bloco — então quando o bloco não consegue abrir a
           porta, é ELE que tem de dizer para onde ir. Trava sem saída é o que
           empurra o cliente para o telefone. */
        return { tom: "aviso", titulo: "Renovação automática",
          texto: "Não foi possível consultar agora. Tente de novo com a internet ligada, ou fale com a RA Engenharia para renovar.", botao: "", url: "" };
      }
      if (d.permanente) {
        return { tom: "neutro", titulo: "Licença permanente",
          texto: "Esta licença não vence: não há mensalidade para assinar.", botao: "", url: "" };
      }
      var a = d.assinatura;
      if (a && a.aguardandoCartao) {
        var okUrl = self.linkValido(a.invoiceUrl);
        return { tom: "aviso", titulo: "Falta cadastrar o cartão",
          texto: "Sua renovação automática de " + self.brl(a.valor) + " (" + (a.porExtenso || "") +
            ") já está aberta, mas o cartão ainda não foi cadastrado — enquanto isso ela não cobra e a licença continua vencendo no prazo normal." +
            (okUrl ? "" : " Fale com a RA Engenharia para receber o link."),
          botao: okUrl ? "Cadastrar cartão" : "", url: okUrl ? a.invoiceUrl : "" };
      }
      if (a) {
        return { tom: "ok", titulo: "Renovação automática ativa",
          texto: "Cobramos " + self.brl(a.valor) + " no seu cartão " + (a.porExtenso || "") +
            (a.proximaEm ? ", a próxima em " + self.dataBR(a.proximaEm) : "") +
            ". Sua licença não vence mais sozinha." +
            (a.cobrancas ? " Renovações já feitas: " + a.cobrancas + "." : ""),
          botao: "", url: "" };
      }
      if (!d.podeAssinar) {
        return { tom: "neutro", titulo: "Renovação automática",
          texto: d.motivo || "Indisponível para esta licença.", botao: "", url: "" };
      }
      var o = d.oferta || {};
      /* ⚠ o texto diz ANTES o que vai acontecer com o dinheiro: valor, com
         que frequência e a partir de quando. Aviso genérico a pessoa lê como
         formalidade; número ela confere. */
      var quando = d.vencida
        ? "A primeira cobrança sai hoje e sua licença volta a valer assim que o pagamento for confirmado."
        : (d.vence ? "A primeira cobrança sai só no vencimento (" +
            self.dataBR(new Date(d.vence - 3 * 3600000).toISOString()) + "): você não paga duas vezes pelo mesmo período." : "");
      return { tom: "oferta", titulo: "Nunca mais deixe vencer",
        texto: "Assine a renovação automática: " + self.brl(o.valor) + " no cartão, " + (o.porExtenso || "") +
          ". " + quando + " Você cadastra o cartão uma vez, na página do Asaas — o OrçaPRO não guarda os dados do seu cartão. Pode cancelar quando quiser falando com a RA Engenharia.",
        /* ⚠ NÃO CHAMAR ISTO DE "ATIVAR". O rodapé deste mesmo modal tem um
           botão "Ativar", que ativa a CHAVE colada no campo abaixo — coisa
           completamente diferente. Dois "Ativar" na mesma tela fazem quem
           está com pressa clicar no do rodapé e receber "Cole a chave de
           licença" como erro, sem entender o que deu errado. Só se viu isso
           olhando a foto da tela; nenhum assert pega dois rótulos parecidos. */
        botao: "Assinar renovação automática", url: "" };
    },

    /* ---------------- fiação (fala com o servidor) ---------------- */

    _srv: function () {
      try { return (typeof Licenca !== "undefined" && Licenca._servidor) ? Licenca._servidor() : ""; }
      catch (e) { return ""; }
    },
    _chave: function () {
      try { return (typeof Licenca !== "undefined" && Licenca.chave) ? Licenca.chave() : ""; }
      catch (e) { return ""; }
    },

    /* consulta o estado. cb recebe o objeto do servidor, ou {ok:false}. */
    consultar: function (cb) {
      var srv = this._srv(), chave = this._chave();
      if (!srv || !chave || typeof fetch === "undefined") { cb({ ok: false, erro: "sem servidor" }); return; }
      fetch(srv + "/api/licenca/assinatura", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chave: chave })
      }).then(function (r) { return r.json(); })
        .then(function (d) { cb(d && typeof d === "object" ? d : { ok: false }); })
      ["catch"](function () { cb({ ok: false, erro: "rede" }); });
    },

    /* abre a assinatura. cb recebe {ok, invoiceUrl, ...} ou {ok:false, erro}. */
    criar: function (cb) {
      var srv = this._srv(), chave = this._chave();
      if (!srv || !chave || typeof fetch === "undefined") { cb({ ok: false, erro: "Ativar a renovação automática precisa de internet." }); return; }
      fetch(srv + "/api/licenca/assinatura/criar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chave: chave })
      }).then(function (r) { return r.json(); })
        .then(function (d) { cb(d && typeof d === "object" ? d : { ok: false, erro: "Resposta inesperada do servidor." }); })
      ["catch"](function () { cb({ ok: false, erro: "Não foi possível falar com o servidor. Tente de novo com a internet ligada." }); });
    },

    /* Desenha dentro de um elemento já existente na tela (o modal de licença
       reserva um `<div id="assin-box">`). Faz a consulta e preenche.
       ⚠ o elemento pode ter sumido enquanto a resposta vinha (modal fechado):
         toda escrita confere se ele ainda está no documento. */
    montar: function (idAlvo) {
      var self = this;
      var alvo = (typeof document !== "undefined") ? document.getElementById(idAlvo) : null;
      if (!alvo) return;
      alvo.textContent = "Consultando renovação automática…";
      this.consultar(function (d) {
        var el = document.getElementById(idAlvo);
        if (!el) return;   // o modal fechou antes da resposta
        self._desenhar(el, self.texto(d), d);
      });
    },

    _desenhar: function (el, t, d) {
      var self = this;
      while (el.firstChild) el.removeChild(el.firstChild);
      var cores = { ok: "#16a34a", oferta: "#0f2740", aviso: "#b45309", neutro: "#64748b" };
      var card = document.createElement("div");
      card.className = "card";
      card.style.marginTop = "10px";
      card.style.borderLeft = "3px solid " + (cores[t.tom] || cores.neutro);

      var h = document.createElement("b");
      h.textContent = t.titulo;
      h.style.color = cores[t.tom] || cores.neutro;
      card.appendChild(h);

      var p = document.createElement("div");
      p.style.marginTop = "4px";
      p.style.fontSize = "13px";
      p.textContent = t.texto;      // ⚠ textContent: texto do servidor não vira HTML
      card.appendChild(p);

      if (t.botao) {
        var b = document.createElement("button");
        b.className = "btn sm primary";
        b.style.marginTop = "10px";
        b.textContent = t.botao;
        b.onclick = function () {
          if (t.url) { self._abrir(t.url); return; }
          b.disabled = true;
          b.textContent = "Abrindo…";
          self.criar(function (r) {
            if (!r || !r.ok) {
              b.disabled = false; b.textContent = t.botao;
              if (typeof UI !== "undefined" && UI.toast) UI.toast((r && r.erro) || "Não foi possível abrir a assinatura.", "erro");
              return;
            }
            if (self.linkValido(r.invoiceUrl)) {
              self._abrir(r.invoiceUrl);
              /* redesenha no estado "falta cadastrar o cartão": a assinatura
                 existe, mas NADA foi cobrado ainda — dizer "pronto" aqui seria
                 recado que mente, e a pessoa fecharia a aba do cartão achando
                 que acabou. */
              self._desenhar(el, self.texto({ ok: true, vence: d && d.vence, vencida: d && d.vencida,
                assinatura: { aguardandoCartao: true, valor: r.valor, porExtenso: r.porExtenso, invoiceUrl: r.invoiceUrl } }), d);
            } else {
              b.disabled = false; b.textContent = t.botao;
              if (typeof UI !== "undefined" && UI.toast) UI.toast("Assinatura aberta, mas o link do cartão não veio. Fale com a RA Engenharia.", "erro");
            }
          });
        };
        card.appendChild(b);
      }
      el.appendChild(card);
    },

    _abrir: function (url) {
      if (!this.linkValido(url)) return false;
      try { global.open(url, "_blank", "noopener"); return true; } catch (e) { return false; }
    }
  };

  global.Assinatura = Assinatura;
  if (typeof module !== "undefined" && module.exports) module.exports = Assinatura;
})(typeof window !== "undefined" ? window : this);
