/* =====================================================================
 * cobranca.js — o aviso de parcela vencida na tela do cliente
 *
 * O SERVIDOR DE LICENÇA DECIDE TUDO (server/vps/cobranca-srv.js): se há
 * cobrança aberta para esta chave, quais parcelas, o prazo e se já está
 * suspensa. Este arquivo só pergunta, mostra e devolve a resposta.
 *
 * Como funciona para quem usa:
 *   - ao abrir o app, e de 5 em 5 minutos, o aviso aparece por 30 s;
 *   - para de repetir quando alguém da empresa responde o motivo;
 *   - vencido o prazo sem pagamento, `Licenca.status()` passa a responder
 *     `suspensa` e o app para de salvar e exportar — o MESMO gate da licença
 *     vencida (App._trialBloqueado), nenhuma trava nova;
 *   - pago, o servidor vê no Asaas e a próxima consulta solta sozinha.
 *
 * ⚠ NENHUM DADO DE CLIENTE AQUI. Nome da empresa, valores e links chegam
 *   do servidor em tempo de execução. A pasta js/ vai para os 38 pacotes e
 *   para uma URL pública sem login (CLAUDE.md §5).
 * ⚠ O AVISO NÃO USA UI.modal. O UI.modal fecha o modal aberto antes de
 *   abrir o seu: um aviso que volta de 5 em 5 minutos apagaria o formulário
 *   que a pessoa estava preenchendo. Ele é uma camada própria, por cima de
 *   tudo, e ao sair deixa a tela exatamente como estava.
 * ⚠ 30 s NA TELA, MAS NUNCA FECHA EM CIMA DE QUEM ESTÁ ESCREVENDO. Fechar
 *   levaria o motivo digitado junto, e a pessoa teria que escrever de novo
 *   no próximo ciclo — o que ensina a não responder.
 * ⚠ TEXTO DO SERVIDOR ENTRA POR textContent, NUNCA innerHTML. Nome de
 *   empresa com "<" não vira HTML, e link só abre se for do Asaas.
 * ⚠ SÓ RESPOSTA CERTA MUDA O ESTADO. Sem internet, servidor fora ou resposta
 *   torta: fica o que havia. Nem suspende por defeito, nem solta a suspensão
 *   porque o Wi-Fi caiu.
 * ⚠ LICENÇA DE EQUIPE (`equipe` no aviso): texto próprio, sem nada do
 *   titular e sem caixa de resposta; aparece ao abrir o app, nunca de 5 em 5
 *   minutos. O servidor já não manda nome, parcelas nem links para ela.
 * ⚠ O CICLO NÃO APAGA O MOTIVO: com texto na caixa (ou o cursor nela), o
 *   aviso aberto não é recriado — só se anota que foi exibido.
 * ===================================================================== */
(function (global) {
  "use strict";

  var KEY = "orcapro:cobranca";      // ⚠ o mesmo nome é lido por js/licenca.js (_suspensaPorCobranca)
  var ID_TELA = "cobranca-aviso";
  var TICK_MS = 60000;
  /* folga de meio tick nas contas de "já deu 5 min?": a consulta é marcada no
     COMEÇO e a exibição no FIM (depois da resposta do servidor), e sem folga o
     tick dos 5 min sempre caía uns segundos antes — o aviso vinha de 10 em 10 */
  var FOLGA_MS = TICK_MS / 2;
  var SEM_AVISO_MIN = 15;            // sem cobrança conhecida, pergunta de 15 em 15 min

  function agora() { return new Date().getTime(); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function el(tag, attrs, texto) {
    var e = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        if (k === "className") e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
      }
    }
    if (texto != null) e.textContent = String(texto);
    return e;
  }

  var Cobranca = {
    REF_LEN: 16,

    /* ---------------- motor (puro; tools/test-cobranca.js) ---------------- */
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
    /* o prazo em hora LOCAL do aparelho: é a hora que a pessoa confere no relógio dela */
    _dh: function (ms) {
      var d = new Date(Number(ms) || 0);
      return { data: pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear(), hora: pad(d.getHours()) + "h" + pad(d.getMinutes()) };
    },
    urlSegura: function (u) { u = String(u || ""); return /^https:\/\/([a-z0-9-]+\.)*asaas\.com\//i.test(u) ? u : ""; },
    _numeroDe: function (rotulo) { var m = /Parcela\s+(\d+)/i.exec(String(rotulo || "")); return m ? m[1] : ""; },
    _juntar: function (l) { return l.length <= 1 ? l.join("") : l.slice(0, -1).join(", ") + " e " + l[l.length - 1]; },

    /* ⚠ LICENÇA DE EQUIPE: o servidor manda só estado e prazo, nada do
       titular. O texto diz o que acontece com ESTE acesso e com quem falar;
       não há parcela para listar nem resposta a dar — quem deve é quem contratou. */
    _textoEquipe: function (av) {
      var susp = av.estado === "suspensa", dh = av.prazoEm ? this._dh(av.prazoEm) : null;
      var preservado = "Os dados ficam preservados e o acesso volta automaticamente quando o pagamento for regularizado.";
      var titulo, conseq;
      if (susp) titulo = "LICENÇA DA EQUIPE SUSPENSA POR PAGAMENTO EM ATRASO";
      else if (dh) titulo = "ATENÇÃO: LICENÇA DA EQUIPE SERÁ SUSPENSA EM " + dh.data + " ÀS " + dh.hora;
      else titulo = "ATENÇÃO: LICENÇA DA EQUIPE COM PAGAMENTO EM ATRASO";
      if (susp) conseq = (dh ? "Desde " + dh.data + " às " + dh.hora + ", o" : "O") + " sistema não salva nem exporta neste acesso. " + preservado;
      else if (dh) conseq = "Sem a regularização até a data acima, o sistema para de salvar e exportar neste acesso. " + preservado;
      else conseq = "Sem a regularização, o sistema pode parar de salvar e exportar neste acesso. " + preservado;
      return {
        titulo: titulo,
        saudacao: "",
        intro: "A licença de equipe a que este acesso pertence tem pagamento em atraso com quem a contratou.",
        linhas: [],
        total: "",
        consequencia: conseq,
        instrucao: "Para regularizar, fale com quem contratou a licença da sua equipe.",
        assinatura: "RA Engenharia — Setor Financeiro"
      };
    },

    /* O texto do aviso, pedaço por pedaço: a tela monta, o teste lê.
       ⚠ O PRAZO SAI COMO DATA E HORA, NUNCA "EM 24 HORAS". O aviso volta de 5
       em 5 minutos; "24 horas" repetido às 22h do dia seguinte seria mentira. */
    texto: function (av) {
      av = av || {};
      if (av.equipe) return this._textoEquipe(av);
      var self = this, susp = av.estado === "suspensa";
      var nums = (av.parcelas || []).map(function (p) { return self._numeroDe(p.rotulo); }).filter(Boolean);
      var produto = av.produto ? "da licença " + av.produto : "da sua licença do OrçaPRO";
      var dh = av.prazoEm ? this._dh(av.prazoEm) : null;
      var titulo, intro, conseq;
      if (susp) titulo = "LICENÇA SUSPENSA POR FALTA DE PAGAMENTO";
      else if (dh) titulo = "ATENÇÃO: LICENÇA SERÁ SUSPENSA EM " + dh.data + " ÀS " + dh.hora;
      else titulo = "ATENÇÃO: PARCELAS EM ATRASO — LICENÇA SUJEITA A SUSPENSÃO";
      if (nums.length > 1) intro = "As parcelas " + this._juntar(nums) + " " + produto + " estão vencidas e não foram pagas:";
      else if (nums.length === 1) intro = "A parcela " + nums[0] + " " + produto + " está vencida e não foi paga:";
      else intro = "Há parcelas " + produto + " vencidas e não pagas:";
      var preservado = "Os dados ficam preservados e o acesso volta automaticamente quando o pagamento compensar.";
      if (susp) conseq = (dh ? "Desde " + dh.data + " às " + dh.hora + ", o" : "O") + " sistema não salva nem exporta em nenhum computador da empresa. " + preservado;
      else if (dh) conseq = "Sem a regularização até a data acima, o sistema para de salvar e exportar em todos os computadores da empresa. " + preservado;
      else conseq = "Sem a regularização em até " + (Number(av.horas) || 24) + " horas, o sistema para de salvar e exportar em todos os computadores da empresa. " + preservado;
      return {
        titulo: titulo,
        saudacao: av.empresa ? String(av.empresa) + "," : "",
        intro: intro,
        linhas: (av.parcelas || []).map(function (p) {
          return String(p.rotulo || "Parcela") + " — " + self.brl(p.valor) + " — venceu em " + self.dataBR(p.venc);
        }),
        total: "Total vencido: " + this.brl(av.totalVencido),
        consequencia: conseq,
        instrucao: av.respondido ? "Sua resposta já chegou ao setor financeiro." : "Informe abaixo o motivo do atraso ou a data prevista de pagamento.",
        assinatura: "RA Engenharia — Setor Financeiro"
      };
    },

    /* Estado local novo a partir da resposta do servidor. Ver o ⚠ do topo:
       só `ok:true` com a marca `v:1` mexe em alguma coisa. A chave entra pela
       ponta (`chaveRef`): trocar de licença não herda aviso de outra. */
    aplicar: function (loc, resp, ref, t) {
      var n = {}, k;
      if (loc && loc.chaveRef === ref) { for (k in loc) { if (Object.prototype.hasOwnProperty.call(loc, k)) n[k] = loc[k]; } }
      n.chaveRef = ref;
      if (!resp || resp.ok !== true || resp.v !== 1) return n;
      n.aviso = resp.aviso || null;
      n.suspensa = !!(resp.aviso && resp.aviso.estado === "suspensa");
      n.atualizadoEm = t;
      return n;
    },

    /* Vai para a tela agora? "Toda vez que abrir" e de 5 em 5 minutos, até
       alguém responder. Respondido, só volta ao ABRIR o app se já estiver
       suspensa — aí a pessoa precisa saber por que não consegue salvar. */
    deveExibir: function (loc, av, t, noBoot) {
      if (!av || !av.id) return false;
      /* licença de equipe: ao ABRIR o app, sempre (é como a pessoa fica
         sabendo); de 5 em 5 minutos, nunca — ela não tem o que responder */
      if (av.equipe) return !!noBoot;
      loc = loc || {};
      var respondido = !!av.respondido || loc.respondidoId === av.id;
      if (respondido) return !!(noBoot && av.estado === "suspensa");
      if (noBoot) return true;
      var ult = (loc.exibidoId === av.id) ? (Number(loc.ultimaExibicao) || 0) : 0;
      return t - ult >= (Number(av.repetirMin) || 5) * 60000 - FOLGA_MS;
    },

    /* ---------------- fiação ---------------- */
    _ler: function () { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } },
    _gravar: function (o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} },
    _chave: function () {
      if (typeof Licenca === "undefined") return "";
      try { var st = Licenca.status(); if (!st || st.trial) return ""; } catch (e) { return ""; }
      return Licenca.chave ? String(Licenca.chave() || "") : "";
    },
    _post: function (rota, corpo) {
      var srv = (typeof Licenca !== "undefined" && Licenca._servidor) ? Licenca._servidor() : "";
      if (!srv || typeof fetch === "undefined") return Promise.reject(new Error("sem servidor"));
      return fetch(srv + rota, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })
        .then(function (r) { return r.json(); });
    },

    consultar: function (noBoot) {
      var self = this, chave = this._chave();
      if (!chave || this._consultando) return;
      var t = agora(), ref = chave.slice(-this.REF_LEN);
      var loc = this._ler() || {};
      if (loc.chaveRef !== ref) loc = { chaveRef: ref };
      var oculto = typeof document !== "undefined" && document.hidden;
      var ciclo = ((loc.aviso && Number(loc.aviso.repetirMin)) || 5) * 60000;
      /* `exibindo` avisa o servidor que, havendo aviso, ele vai para a tela
         AGORA — é o que liga o prazo na primeira vez. Aba escondida não conta:
         30 s num lugar que ninguém olha não é aviso. */
      var exibindo = !oculto && (!!noBoot || t - (Number(loc.ultimaExibicao) || 0) >= ciclo - FOLGA_MS);
      this._consultando = true; this._ultimaConsulta = t;
      this._post("/api/licenca/aviso", { licenca: chave, deviceId: Licenca.deviceId(), exibindo: exibindo })
        .then(function (resp) {
          self._consultando = false;
          var n = self.aplicar(self._ler(), resp, ref, agora());
          self._gravar(n);
          if (n.aviso) { if (exibindo && self.deveExibir(n, n.aviso, agora(), noBoot)) self.mostrar(n.aviso); }
          else if (resp && resp.ok === true) self.fechar();   // pagou ou foi encerrada: sai da tela
        }, function () { self._consultando = false; });
    },

    iniciar: function () {
      if (this._ligado || typeof window === "undefined" || !this._chave()) return;
      this._ligado = true;
      var self = this;
      this.consultar(true);
      this._timer = setInterval(function () { self._tick(); }, TICK_MS);
      try { document.addEventListener("visibilitychange", function () { if (!document.hidden) self._tick(); }); } catch (e) {}
    },
    _tick: function () {
      if (typeof document !== "undefined" && document.hidden) return;
      var loc = this._ler() || {};
      /* sem aviso conhecido também pergunta (mais espaçado): é assim que uma
         cobrança aberta HOJE chega a quem está com o app aberto desde ontem */
      var min = loc.aviso ? ((Number(loc.aviso.repetirMin)) || 5) : SEM_AVISO_MIN;
      if (agora() - (this._ultimaConsulta || 0) >= min * 60000) this.consultar(false);
    },

    /* chamado pelo gate de salvar (App._avisoTrial) quando a licença está suspensa */
    mostrarAgora: function () {
      var loc = this._ler() || {};
      if (loc.aviso) { this.mostrar(loc.aviso); return true; }
      return false;
    },

    responder: function (av, texto, cb) {
      var self = this, chave = this._chave();
      if (!chave) { cb({ ok: false, erro: "Licença não encontrada neste aparelho." }); return; }
      var usuario = "";
      try { var u = (typeof Auth !== "undefined" && Auth.usuario) ? Auth.usuario() : null; usuario = u ? String(u.nome || u.email || "") : ""; } catch (e) {}
      this._post("/api/licenca/aviso/resposta", { licenca: chave, deviceId: Licenca.deviceId(), avisoId: av.id, texto: texto, usuario: usuario })
        .then(function (r) {
          if (r && r.ok) {
            var loc = self._ler() || {};
            loc.respondidoId = av.id;
            if (loc.aviso && loc.aviso.id === av.id) loc.aviso.respondido = true;
            self._gravar(loc);
          }
          cb(r || { ok: false, erro: "Resposta inesperada do servidor." });
        }, function () {
          cb({ ok: false, erro: "Sem conexão com o servidor. Verifique a internet e tente de novo — o texto continua aqui." });
        });
    },

    fechar: function () {
      if (this._contador) { clearInterval(this._contador); this._contador = null; }
      var e = (typeof document !== "undefined") ? document.getElementById(ID_TELA) : null;
      if (e && e.parentNode) e.parentNode.removeChild(e);
    },

    _css: function () {
      if (document.getElementById("cobranca-css")) return;
      var s = el("style", { id: "cobranca-css" });
      /* paleta FIXA de propósito: aviso financeiro não muda de cara com o tema,
         e peso até 600 porque a fonte embarcada não tem 700+ (desenharia igual) */
      s.textContent =
        "#cobranca-aviso{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483000;background:rgba(8,15,25,.72);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif}" +
        "#cobranca-aviso .cob-card{background:#fff;color:#1f2937;width:100%;max-width:580px;max-height:100%;overflow:auto;box-sizing:border-box;border-radius:12px;border-top:6px solid #b91c1c;box-shadow:0 20px 60px rgba(0,0,0,.45);padding:22px 24px 16px;outline:none}" +
        "#cobranca-aviso .cob-card.suspensa{border-top-color:#7f1d1d}" +
        "#cobranca-aviso h2{margin:0 0 14px;font-size:17px;line-height:1.35;font-weight:600;color:#b91c1c;letter-spacing:.2px}" +
        "#cobranca-aviso .cob-card.suspensa h2{color:#7f1d1d}" +
        "#cobranca-aviso .cob-corpo p{margin:0 0 10px;font-size:14px;line-height:1.5}" +
        "#cobranca-aviso .cob-saud{font-weight:600}" +
        "#cobranca-aviso .cob-parcelas{margin:0 0 8px;padding-left:20px;font-size:14px;line-height:1.65}" +
        "#cobranca-aviso .cob-total{font-weight:600;font-size:15px}" +
        "#cobranca-aviso .cob-pagar{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 14px}" +
        "#cobranca-aviso .cob-btn{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:8px 16px;border-radius:8px;font-size:14px;font-weight:600;border:1px solid transparent;cursor:pointer;text-decoration:none;font-family:inherit;box-sizing:border-box}" +
        "#cobranca-aviso .cob-btn-pagar{background:#15803d;color:#fff}" +
        "#cobranca-aviso .cob-btn-enviar{background:#1d4ed8;color:#fff}" +
        "#cobranca-aviso .cob-btn-enviar[disabled]{background:#9ca3af;cursor:not-allowed}" +
        "#cobranca-aviso .cob-btn-fechar{background:#fff;color:#374151;border-color:#d1d5db}" +
        "#cobranca-aviso .cob-btn:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}" +
        "#cobranca-aviso .cob-lbl{display:block;font-size:13.5px;font-weight:600;margin:4px 0 6px;color:#374151}" +
        "#cobranca-aviso textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;font:inherit;font-size:14px;resize:vertical;min-height:70px;color:#111827;background:#fff}" +
        "#cobranca-aviso .cob-resp{display:flex;align-items:center;gap:10px;margin:8px 0 4px;flex-wrap:wrap}" +
        "#cobranca-aviso .cob-status{font-size:13px;color:#4b5563}" +
        "#cobranca-aviso .cob-status.ok{color:#15803d}#cobranca-aviso .cob-status.erro{color:#b91c1c}" +
        "#cobranca-aviso .cob-rodape{display:flex;align-items:center;gap:12px;flex-wrap:wrap;border-top:1px solid #e5e7eb;margin-top:14px;padding-top:12px}" +
        "#cobranca-aviso .cob-assin{font-size:12.5px;color:#6b7280;flex:1;min-width:180px}" +
        "#cobranca-aviso .cob-contador{font-size:12.5px;color:#6b7280}";
      document.head.appendChild(s);
    },

    /* o que o cartão desenha, numa string: compara o que está na tela com o
       aviso que acabou de chegar (ver a proteção do ciclo em mostrar) */
    _assinatura: function (av) {
      var self = this;
      try {
        return JSON.stringify([String(av.id || ""), String(av.estado || ""), this.texto(av),
          (av.parcelas || []).map(function (p) { return self.urlSegura(p && p.url); })]);
      } catch (e) { return "sem-assinatura-" + agora(); }
    },

    mostrar: function (av) {
      if (!av || typeof document === "undefined" || !document.body) return;
      var self = this;
      /* ⚠ O CICLO DE 5 MIN NÃO RECRIA O AVISO EM CIMA DE QUEM ESCREVE. Recriar
         jogava fora o motivo que a pessoa estava digitando (achado na revisão
         da 1.2.69). Com texto na caixa, ou o cursor nela, o aviso aberto fica
         como está e só se anota que foi exibido — desde que seja o MESMO aviso
         no MESMO estado: um aviso que virou "suspensa" não pode ficar dizendo
         "será suspensa em". Aí redesenha, e o motivo que estava sendo escrito
         para ESTE aviso vai junto para o cartão novo. */
      var telaAberta = document.getElementById(ID_TELA), taAberto = document.getElementById("cob-motivo");
      var escrevendoJa = !!(telaAberta && taAberto && !taAberto.readOnly &&
          (String(taAberto.value || "").trim() || document.activeElement === taAberto));
      var mesmoAviso = !!(telaAberta && telaAberta.getAttribute("data-id") === String(av.id));
      /* "o mesmo aviso" é o mesmo DESENHO: mesmo id e o mesmo texto, parcelas,
         total, prazo e links. Pagar uma parcela ou ganhar prorrogação mantém o
         id e o estado, e o cartão velho ficaria mostrando o que já não vale.
         Com a resposta A CAMINHO o cartão fica sempre: trocá-lo liberaria um
         segundo envio (achado na verificação da segunda rodada). */
      var assin = this._assinatura(av);
      var enviando = !!(telaAberta && telaAberta.getAttribute("data-enviando"));
      if (mesmoAviso && (enviando || (escrevendoJa && telaAberta.getAttribute("data-assin") === assin))) {
        var locE = this._ler() || {};
        locE.exibidoId = av.id; locE.ultimaExibicao = agora();
        this._gravar(locE);
        return;
      }
      var rascunho = (escrevendoJa && mesmoAviso) ? String(taAberto.value || "") : "";
      var focoNaCaixa = !!(taAberto && document.activeElement === taAberto);
      /* o texto ANTES de tirar o cartão da tela: um aviso torto que faça
         texto() lançar sai com o cartão antigo (e o rascunho) intactos */
      var tx = this.texto(av);
      this.fechar();
      this._css();
      var respondido = !!av.respondido || ((this._ler() || {}).respondidoId === av.id);

      var bg = el("div", { id: ID_TELA, role: "alertdialog", "aria-modal": "true", "aria-labelledby": "cob-titulo", "aria-describedby": "cob-corpo",
        "data-id": String(av.id || ""), "data-estado": String(av.estado || ""), "data-assin": assin });
      var card = el("div", { className: "cob-card" + (av.estado === "suspensa" ? " suspensa" : ""), tabindex: "-1" });
      card.appendChild(el("h2", { id: "cob-titulo" }, tx.titulo));
      var corpo = el("div", { id: "cob-corpo", className: "cob-corpo" });
      if (tx.saudacao) corpo.appendChild(el("p", { className: "cob-saud" }, tx.saudacao));
      corpo.appendChild(el("p", null, tx.intro));
      if (tx.linhas.length) {
        var ul = el("ul", { className: "cob-parcelas" });
        tx.linhas.forEach(function (l) { ul.appendChild(el("li", null, l)); });
        corpo.appendChild(ul);
      }
      if (tx.total) corpo.appendChild(el("p", { className: "cob-total" }, tx.total));
      corpo.appendChild(el("p", null, tx.consequencia));
      card.appendChild(corpo);

      var pag = el("div", { className: "cob-pagar" });
      (av.parcelas || []).forEach(function (p) {
        var u = self.urlSegura(p.url);
        if (!u) return;
        pag.appendChild(el("a", { href: u, target: "_blank", rel: "noopener noreferrer", className: "cob-btn cob-btn-pagar" }, "Pagar parcela " + self._numeroDe(p.rotulo)));
      });
      if (pag.childNodes.length) card.appendChild(pag);

      var ta = null;
      if (!respondido && !av.equipe) {
        card.appendChild(el("label", { "for": "cob-motivo", className: "cob-lbl" }, tx.instrucao));
        ta = el("textarea", { id: "cob-motivo", maxlength: "1000", rows: "3", placeholder: "Ex.: pagamento previsto para o dia 15; ou: já pagamos no dia 10." });
        card.appendChild(ta);
        var linha = el("div", { className: "cob-resp" });
        var btn = el("button", { type: "button", className: "cob-btn cob-btn-enviar", disabled: "disabled" }, "Enviar resposta");
        var st = el("span", { className: "cob-status", "aria-live": "polite" }, "");
        linha.appendChild(btn); linha.appendChild(st);
        card.appendChild(linha);
        ta.addEventListener("input", function () {
          if (ta.readOnly) return;   // envio em curso ou já enviado: o botão fica como está
          if (String(ta.value || "").trim().length >= 10) btn.removeAttribute("disabled"); else btn.setAttribute("disabled", "disabled");
        });
        if (rascunho) { ta.value = rascunho; if (rascunho.trim().length >= 10) btn.removeAttribute("disabled"); }
        btn.addEventListener("click", function () {
          var texto = String(ta.value || "").trim();
          if (texto.length < 10) return;
          btn.setAttribute("disabled", "disabled");
          st.className = "cob-status"; st.textContent = "Enviando…";
          bg.setAttribute("data-enviando", "1");
          /* a caixa trava durante o envio: digitar reacendia o Enviar e saía um
             segundo POST (cada um vira uma mensagem no WhatsApp do financeiro) */
          ta.setAttribute("readonly", "readonly");
          self.responder(av, texto, function (r) {
            /* este retorno é DESTE cartão: se ele já saiu da tela, não mexe no
               que estiver lá agora nem o fecha */
            if (!bg.parentNode) return;
            bg.removeAttribute("data-enviando");
            if (r && (r.ok || r.encerrada)) {
              st.className = "cob-status ok";
              st.textContent = r.ok ? "Resposta enviada ao setor financeiro. Obrigado." : (r.erro || "");
              ta.setAttribute("readonly", "readonly");
              setTimeout(function () { if (bg.parentNode) self.fechar(); }, 2500);
              return;
            }
            st.className = "cob-status erro"; st.textContent = (r && r.erro) || "Não foi possível enviar.";
            ta.removeAttribute("readonly");
            btn.removeAttribute("disabled");
          });
        });
      } else {
        card.appendChild(el("p", { className: "cob-lbl" }, tx.instrucao));
      }

      var rod = el("div", { className: "cob-rodape" });
      var cont = el("span", { className: "cob-contador", "aria-live": "off" }, "");
      var bFechar = el("button", { type: "button", className: "cob-btn cob-btn-fechar" }, "Fechar");
      bFechar.style.display = "none";
      bFechar.addEventListener("click", function () { self.fechar(); });
      rod.appendChild(el("span", { className: "cob-assin" }, tx.assinatura));
      rod.appendChild(cont); rod.appendChild(bFechar);
      card.appendChild(rod);
      bg.appendChild(card);
      document.body.appendChild(bg);
      try { card.focus(); } catch (eF) {}
      if ((rascunho || focoNaCaixa) && ta) { try { ta.focus(); } catch (eT) {} }

      var loc = this._ler() || {};
      loc.exibidoId = av.id; loc.ultimaExibicao = agora();
      this._gravar(loc);

      /* 30 s na tela; sem ✕ antes disso. No fim, se a pessoa está no meio do
         motivo, o aviso fica e ganha o botão Fechar (ver o ⚠ do topo). */
      var fim = agora() + Math.max(5, Number(av.segundos) || 30) * 1000;
      var escrevendo = function () {
        if (bg.getAttribute("data-enviando")) return true;   // a resposta está a caminho: não some antes do retorno
        return !!(ta && !ta.readOnly && (String(ta.value || "").trim() || document.activeElement === ta));
      };
      var passo = function () {
        var resta = Math.ceil((fim - agora()) / 1000);
        if (resta > 0) { cont.textContent = "Esta mensagem fecha em " + resta + " s"; return; }
        if (self._contador) { clearInterval(self._contador); self._contador = null; }
        bFechar.style.display = "";
        if (escrevendo()) { cont.textContent = "Termine a resposta e envie, ou feche."; return; }
        self.fechar();
      };
      passo();
      this._contador = setInterval(passo, 1000);
    }
  };

  global.Cobranca = Cobranca;
  if (typeof module !== "undefined" && module.exports) { module.exports = Cobranca; }
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
