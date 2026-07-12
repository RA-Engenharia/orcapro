/* =====================================================================
 * apresentacao.js — Modo APRESENTAÇÃO do orçamento (tela cheia p/ reunião
 * com o cliente). O engenheiro clica 🖥️ Apresentar no editor e o orçamento
 * vira uma apresentação fullscreen elegante, read-only, tipografia grande,
 * navegável por setas / clique nas metades / swipe.
 *
 * Arquitetura:
 *   - Apresentacao.slides(orc, empresa, basesTxt) — FUNÇÃO PURA (Node-testável):
 *     devolve [{ id, titulo, html }] sem tocar em DOM nem em globals do app.
 *   - Apresentacao.abrir(orc) — camada de UI: injeta CSS uma vez
 *     (<style id="apres-css">), monta overlay fixed, pede requestFullscreen
 *     (fallback silencioso), controla teclado/clique/swipe e limpa tudo ao fechar.
 *
 * Decisões documentadas (p/ manter slides() pura e determinística):
 *   - BDI recalculado INTERNAMENTE com a MESMA fórmula de Bdi.aplicar:
 *     preço = custo × (1 + pct/100). Nada de depender de window.Bdi no Node.
 *   - Formatação BR própria (fmtBR/fmtMoeda) sem toLocaleString → o teste em
 *     Node não depende de ICU e o resultado é idêntico em qualquer ambiente.
 *   - Escape HTML próprio (equivalente a Util.esc) — descrições vindas de
 *     SINAPI/usuário nunca viram HTML vivo.
 *   - basesUsadasTexto NÃO é chamado aqui dentro: abrir() injeta o texto
 *     pronto como 3º argumento (basesTxt), então slides() segue pura.
 * ===================================================================== */
(function (global) {
  "use strict";

  var MAX_LINHAS = 14; // máximo de etapas por slide da visão executiva

  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  // ---- Helpers puros (sem dependência de Util/Bdi — ver decisões no topo) ----
  // Entende formato BR em dado legado ("1.234,56") — mesma semântica do Util.num:
  // vírgula presente → ponto é milhar; senão parseFloat direto (gate v1.1.63).
  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    if (v == null || v === "") return 0;
    var s = String(v).trim();
    if (s.indexOf(",") > -1) s = s.replace(/\./g, "").replace(",", ".");
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* Número BR determinístico: milhar "." e decimal ",". */
  function fmtBR(n, casas) {
    casas = (casas == null) ? 2 : casas;
    n = num(n);
    var neg = n < 0 ? "-" : "";
    var s = Math.abs(n).toFixed(casas);
    var partes = s.split(".");
    var inteiro = partes[0], dec = partes.length > 1 ? partes[1] : "";
    var out = "";
    while (inteiro.length > 3) { out = "." + inteiro.slice(-3) + out; inteiro = inteiro.slice(0, -3); }
    return neg + inteiro + out + (dec ? "," + dec : "");
  }

  function fmtMoeda(n) { return "R$ " + fmtBR(n, 2); }

  /* Mesma fórmula de Bdi.aplicar (js/bdi.js): custo × (1 + pct/100). */
  function aplicarBdi(custo, pct) { return num(custo) * (1 + num(pct) / 100); }

  function dataExtenso(d) {
    d = d || new Date();
    return d.getDate() + " de " + MESES[d.getMonth()] + " de " + d.getFullYear();
  }

  /* cliente/obra podem ser objeto {nome} (schema atual) ou string legada. */
  function nomeDe(v) {
    if (v == null) return "";
    if (typeof v === "object") return String(v.nome || "");
    return String(v);
  }

  /* 1º valor não-vazio dentre as chaves (aceita nomes do schema e apelidos). */
  function valorComercial(c, chaves) {
    if (!c || typeof c !== "object") return "";
    for (var i = 0; i < chaves.length; i++) {
      var v = c[chaves[i]];
      if (v != null && String(v).trim() !== "") return String(v);
    }
    return "";
  }

  var Apresentacao = {

    /* =================================================================
     * slides(orc, empresa, basesTxt) — FUNÇÃO PURA.
     *   orc      : orçamento ({numero,nome,cliente,obra,bdi:{percentual},
     *              comercial?, etapas:[{codigo,nome,itens:[{quantidade,
     *              custoUnitario}]}]})
     *   empresa  : opcional {nome, logoHTML?, contato?}
     *   basesTxt : opcional, texto pronto das bases de preço (injete
     *              Orcamento.basesUsadasTexto(orc) — abrir() já faz isso)
     * Devolve array de slides [{ id, titulo, html }].
     * ================================================================= */
    slides: function (orc, empresa, basesTxt) {
      orc = orc || {};
      empresa = empresa || {};

      var pct = num(orc.bdi && orc.bdi.percentual);
      var etapas = Array.isArray(orc.etapas) ? orc.etapas : [];

      // custo por etapa = Σ qtd × custoUnit; total direto = Σ etapas
      var linhas = [], custoTotal = 0;
      etapas.forEach(function (e) {
        if (!e) return;
        var c = 0;
        (Array.isArray(e.itens) ? e.itens : []).forEach(function (it) {
          if (it) c += num(it.quantidade) * num(it.custoUnitario);
        });
        linhas.push({ codigo: e.codigo, nome: e.nome, custo: c });
        custoTotal += c;
      });
      var precoTotal = aplicarBdi(custoTotal, pct);
      var valorBdi = precoTotal - custoTotal;

      var out = [];

      // ---- 1) CAPA ----
      var cliente = nomeDe(orc.cliente), obra = nomeDe(orc.obra);
      var htmlCapa = '<div class="ap-capa">' +
        (empresa.logoHTML ? '<div class="ap-logo">' + empresa.logoHTML + "</div>" : "") +
        (empresa.nome ? '<div class="ap-emp">' + esc(empresa.nome) + "</div>" : "") +
        '<h1 class="ap-titulo">' + esc(orc.nome || "Orçamento de Obra") + "</h1>" +
        ((cliente || obra)
          ? '<div class="ap-sub">' + esc(cliente) + (cliente && obra ? " · " : "") + esc(obra) + "</div>"
          : "") +
        '<div class="ap-meta">' + (orc.numero ? "Proposta " + esc(orc.numero) + " · " : "") +
        dataExtenso() + "</div>" +
        "</div>";
      out.push({ id: "capa", titulo: "Capa", html: htmlCapa });

      // ---- 2) NÚMEROS (custo direto / BDI / preço de venda) ----
      var htmlNums = '<h2 class="ap-h2">Investimento</h2>' +
        '<div class="ap-nums">' +
        '<div class="ap-num"><div class="ap-num-rotulo">Custo direto</div>' +
        '<div class="ap-num-valor">' + fmtMoeda(custoTotal) + "</div></div>" +
        '<div class="ap-num"><div class="ap-num-rotulo">BDI ' + fmtBR(pct, 2) + "%</div>" +
        '<div class="ap-num-valor">' + fmtMoeda(valorBdi) + "</div></div>" +
        '<div class="ap-num ap-venda"><div class="ap-num-rotulo">Preço de venda</div>' +
        '<div class="ap-num-valor">' + fmtMoeda(precoTotal) + "</div></div>" +
        "</div>" +
        (basesTxt ? '<div class="ap-bases">Bases de preço: ' + esc(basesTxt) + "</div>" : "");
      out.push({ id: "numeros", titulo: "Investimento", html: htmlNums });

      // ---- 3) ETAPAS (visão executiva, sem itens; quebra a cada 14 linhas) ----
      if (linhas.length) {
        var blocos = [];
        for (var i = 0; i < linhas.length; i += MAX_LINHAS) blocos.push(linhas.slice(i, i + MAX_LINHAS));
        blocos.forEach(function (bloco, bi) {
          var titulo = blocos.length > 1 ? "Etapas (" + (bi + 1) + "/" + blocos.length + ")" : "Etapas";
          var rows = "";
          bloco.forEach(function (l) {
            var preco = aplicarBdi(l.custo, pct);
            var p = precoTotal > 0 ? (preco / precoTotal) * 100 : 0;
            rows += '<tr data-pct="' + p.toFixed(4) + '">' +
              '<td class="ap-cod">' + esc(l.codigo) + "</td>" +
              "<td>" + esc(l.nome) + "</td>" +
              '<td class="ap-dir">' + fmtMoeda(l.custo) + "</td>" +
              '<td class="ap-dir">' + fmtMoeda(preco) + "</td>" +
              '<td class="ap-dir">' + fmtBR(p, 1) + "%</td></tr>";
          });
          var html = '<h2 class="ap-h2">' + esc(titulo) + "</h2>" +
            '<table class="ap-tbl"><thead><tr>' +
            "<th>Código</th><th>Etapa</th>" +
            '<th class="ap-dir">Custo direto</th><th class="ap-dir">Preço c/ BDI</th>' +
            '<th class="ap-dir">% do total</th>' +
            "</tr></thead><tbody>" + rows + "</tbody></table>";
          out.push({ id: blocos.length > 1 ? "etapas-" + (bi + 1) : "etapas", titulo: titulo, html: html });
        });
      }

      // ---- 4) CONDIÇÕES COMERCIAIS (só se houver algo) ----
      var prazo = valorComercial(orc.comercial, ["prazoExecucao", "prazo"]);
      var pagamento = valorComercial(orc.comercial, ["condicoesPagamento", "pagamento"]);
      var validade = valorComercial(orc.comercial, ["validadeProposta", "validade"]);
      if (prazo || pagamento || validade) {
        var conds = "";
        if (prazo) conds += '<div class="ap-cond"><div class="ap-cond-rotulo">Prazo de execução</div>' +
          '<div class="ap-cond-txt">' + esc(prazo) + "</div></div>";
        if (pagamento) conds += '<div class="ap-cond"><div class="ap-cond-rotulo">Condições de pagamento</div>' +
          '<div class="ap-cond-txt">' + esc(pagamento) + "</div></div>";
        if (validade) conds += '<div class="ap-cond"><div class="ap-cond-rotulo">Validade da proposta</div>' +
          '<div class="ap-cond-txt">' + esc(validade) + "</div></div>";
        out.push({
          id: "condicoes", titulo: "Condições Comerciais",
          html: '<h2 class="ap-h2">Condições Comerciais</h2><div class="ap-conds">' + conds + "</div>"
        });
      }

      // ---- 5) FECHAMENTO ----
      // "Proposta válida por X dias" quando a validade traz um nº de dias;
      // senão mostra o texto de validade como está; sem validade, omite a linha.
      var mDias = validade ? String(validade).match(/(\d+)\s*dias?/i) : null;
      var linhaValidade = "";
      if (mDias) linhaValidade = "Proposta válida por " + mDias[1] + " dias.";
      else if (validade) linhaValidade = "Validade: " + esc(validade);
      var htmlFech = '<div class="ap-fech">' +
        '<div class="ap-fech-obrigado">Obrigado.</div>' +
        (linhaValidade ? '<div class="ap-fech-validade">' + linhaValidade + "</div>" : "") +
        ((empresa.nome || empresa.contato)
          ? '<div class="ap-fech-emp">' + esc(empresa.nome || "") +
            (empresa.nome && empresa.contato ? " · " : "") + esc(empresa.contato || "") + "</div>"
          : "") +
        '<div class="ap-fech-msg">À disposição para ajustarmos o que for preciso.</div>' +
        "</div>";
      out.push({ id: "fechamento", titulo: "Fechamento", html: htmlFech });

      return out;
    },

    /* =================================================================
     * abrir(orc) — monta o overlay fullscreen e assume a navegação.
     * Devolve o controlador { el, ir, fechar } (ou null fora do browser).
     * ================================================================= */
    abrir: function (orc) {
      if (typeof document === "undefined") return null; // Node/teste: só slides() interessa
      this._injetarCss();

      // já tem uma apresentação aberta? fecha antes (idempotente, sem listener órfão)
      if (this._atual && this._atual.fechar) { try { this._atual.fechar(); } catch (e0) {} }

      // contexto do app — injeções tolerantes a ausência (nada aqui é obrigatório)
      var empresa = {};
      try {
        if (typeof global.Empresa !== "undefined" && global.Empresa.dados) {
          var d = global.Empresa.dados() || {};
          empresa.nome = d.nome || "";
          empresa.contato = d.contato || "";
          if (global.Empresa.logo && global.Empresa.logo()) empresa.logoHTML = global.Empresa.logoHTML(110);
        }
      } catch (e1) {}
      try {
        if (!empresa.nome && typeof global.Auth !== "undefined" && global.Auth.usuario && global.Auth.usuario()) {
          empresa.nome = global.Auth.usuario().empresa || "";
        }
      } catch (e2) {}
      var basesTxt = "";
      try {
        if (typeof global.Orcamento !== "undefined" && global.Orcamento.basesUsadasTexto) {
          basesTxt = global.Orcamento.basesUsadasTexto(orc);
        }
      } catch (e3) {}

      var slides = this.slides(orc, empresa, basesTxt);
      var n = slides.length, idx = 0;

      var el = document.createElement("div");
      el.className = "apres-overlay";
      var htmlSlides = "";
      for (var i = 0; i < n; i++) {
        htmlSlides += '<section class="apres-slide' + (i === 0 ? " on" : "") +
          '" data-id="' + esc(slides[i].id) + '">' + slides[i].html + "</section>";
      }
      el.innerHTML =
        '<div class="apres-palco">' + htmlSlides + "</div>" +
        '<button type="button" class="apres-nav apres-ant" aria-label="Slide anterior">&lsaquo;</button>' +
        '<button type="button" class="apres-nav apres-prox" aria-label="Próximo slide">&rsaquo;</button>' +
        '<div class="apres-contador">1 / ' + n + "</div>" +
        '<button type="button" class="apres-fechar" aria-label="Fechar apresentação (Esc)">&#10005;</button>';
      document.body.appendChild(el);

      var nodes = el.querySelectorAll(".apres-slide");
      var contador = el.querySelector(".apres-contador");
      var self = this;

      function ir(i) {
        if (i < 0) i = 0;
        if (i > n - 1) i = n - 1;
        idx = i;
        for (var k = 0; k < nodes.length; k++) {
          // "antes" desliza pra esquerda, "on" entra; o resto espera à direita
          nodes[k].className = "apres-slide" + (k === idx ? " on" : (k < idx ? " antes" : ""));
        }
        if (contador) contador.textContent = (idx + 1) + " / " + n;
      }

      function aoTeclar(e) {
        var k = e.key || e.keyCode;
        if (k === "ArrowRight" || k === 39 || k === "PageDown" || k === 34) {
          if (e.preventDefault) e.preventDefault(); ir(idx + 1);
        } else if (k === "ArrowLeft" || k === 37 || k === "PageUp" || k === 33) {
          if (e.preventDefault) e.preventDefault(); ir(idx - 1);
        } else if (k === "Escape" || k === "Esc" || k === 27) {
          if (e.preventDefault) e.preventDefault(); fechar();
        }
      }

      // clique "solto": metade esquerda volta, metade direita avança
      function aoClicar(e) {
        var alvo = e.target;
        while (alvo && alvo !== el) { // botões/links têm ação própria
          if (alvo.tagName === "BUTTON" || alvo.tagName === "A") return;
          alvo = alvo.parentNode;
        }
        var r = el.getBoundingClientRect();
        if (e.clientX - r.left < r.width / 2) ir(idx - 1); else ir(idx + 1);
      }

      // swipe: deltaX > 40px muda de slide
      var toqueX = null;
      function aoTocar(e) {
        var t = e.touches && e.touches[0];
        toqueX = t ? t.clientX : null;
      }
      function aoSoltar(e) {
        if (toqueX == null) return;
        var t = e.changedTouches && e.changedTouches[0];
        var x0 = toqueX; toqueX = null;
        if (!t) return;
        var dx = t.clientX - x0;
        if (dx < -40) ir(idx + 1);
        else if (dx > 40) ir(idx - 1);
      }

      function fechar() {
        document.removeEventListener("keydown", aoTeclar, true);
        el.removeEventListener("click", aoClicar);
        el.removeEventListener("touchstart", aoTocar);
        el.removeEventListener("touchend", aoSoltar);
        try { // sai do fullscreen se fomos nós que entramos
          var fs = document.fullscreenElement || document.webkitFullscreenElement;
          if (fs) {
            if (document.exitFullscreen) {
              var p = document.exitFullscreen();
              if (p && p.catch) p.catch(function () {});
            } else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
          }
        } catch (e5) {}
        if (el.parentNode) el.parentNode.removeChild(el);
        if (self._atual && self._atual.el === el) self._atual = null;
      }

      document.addEventListener("keydown", aoTeclar, true);
      el.addEventListener("click", aoClicar);
      el.addEventListener("touchstart", aoTocar);
      el.addEventListener("touchend", aoSoltar);
      el.querySelector(".apres-ant").addEventListener("click", function () { ir(idx - 1); });
      el.querySelector(".apres-prox").addEventListener("click", function () { ir(idx + 1); });
      el.querySelector(".apres-fechar").addEventListener("click", function () { fechar(); });

      // fullscreen com fallback silencioso (negado/indisponível → overlay fixed já cobre tudo)
      try {
        var req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
        if (req) {
          var pr = req.call(el);
          if (pr && pr.catch) pr.catch(function () {});
        }
      } catch (e4) {}

      this._atual = { el: el, ir: ir, fechar: fechar };
      return this._atual;
    },

    /* CSS injetado UMA vez. Tokens do design system (var(--navy)/--aco/--verde…)
     * com fallback hard-coded — a apresentação fica bonita mesmo sem app.css. */
    _injetarCss: function () {
      if (typeof document === "undefined" || document.getElementById("apres-css")) return;
      var css = "" +
        '.apres-overlay{position:fixed;inset:0;z-index:99999;color:#f2f7fc;overflow:hidden;cursor:pointer;' +
        "user-select:none;-webkit-user-select:none;" +
        'font-family:var(--fonte,"Inter","Segoe UI",system-ui,-apple-system,sans-serif);' +
        "background:radial-gradient(1200px 800px at 72% -12%,rgba(90,155,201,.20) 0%,rgba(90,155,201,0) 55%)," +
        "radial-gradient(900px 620px at -8% 112%,rgba(34,197,94,.10) 0%,rgba(34,197,94,0) 58%)," +
        "var(--navy,#0f2740)}" +
        ".apres-palco{position:absolute;inset:0}" +
        ".apres-slide{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;" +
        "padding:clamp(24px,5vw,72px);opacity:0;transform:translateX(48px);" +
        "transition:opacity .38s ease,transform .38s ease;pointer-events:none}" +
        ".apres-slide.antes{transform:translateX(-48px)}" +
        ".apres-slide.on{opacity:1;transform:none;pointer-events:auto}" +
        // títulos de seção
        ".apres-overlay .ap-h2{font-size:clamp(26px,3.4vw,44px);margin:0 0 30px;font-weight:800;letter-spacing:-.5px;color:#dce9f5}" +
        // capa
        ".ap-capa{text-align:center;max-width:1200px}" +
        ".ap-logo{margin-bottom:20px}" +
        ".ap-emp{font-size:clamp(14px,1.6vw,20px);letter-spacing:.24em;text-transform:uppercase;color:var(--aco-claro,#5a9bc9);font-weight:700;margin-bottom:3vh}" +
        ".ap-titulo{font-size:clamp(34px,7vw,92px);line-height:1.04;margin:0 0 3vh;font-weight:900;letter-spacing:-1.5px}" +
        ".ap-sub{font-size:clamp(18px,2.6vw,34px);color:#cfe0ef;margin-bottom:2vh}" +
        ".ap-meta{font-size:clamp(13px,1.5vw,19px);color:#8fa9c2}" +
        // números gigantes
        ".ap-nums{display:flex;gap:clamp(20px,4vw,64px);align-items:flex-end;justify-content:center;flex-wrap:wrap}" +
        ".ap-num{text-align:center}" +
        ".ap-num-rotulo{font-size:clamp(13px,1.5vw,20px);text-transform:uppercase;letter-spacing:.14em;color:#8fa9c2;font-weight:700;margin-bottom:12px}" +
        ".ap-num-valor{font-size:clamp(30px,4.6vw,64px);font-weight:800;letter-spacing:-1px;white-space:nowrap}" +
        ".ap-venda .ap-num-valor{font-size:clamp(44px,8vw,110px);color:var(--verde-claro,#22c55e)}" +
        ".ap-bases{margin-top:6vh;font-size:clamp(12px,1.3vw,17px);color:#7f99b3}" +
        // tabela de etapas (legível a 3 metros)
        ".ap-tbl{border-collapse:collapse;font-size:clamp(16px,1.7vw,22px);width:min(92vw,1280px)}" +
        ".ap-tbl th{font-size:clamp(12px,1.2vw,15px);text-transform:uppercase;letter-spacing:.1em;color:#8fa9c2;" +
        "text-align:left;padding:10px 16px;border-bottom:2px solid rgba(255,255,255,.18)}" +
        ".ap-tbl td{padding:11px 16px;border-bottom:1px solid rgba(255,255,255,.07)}" +
        ".ap-tbl tbody tr:nth-child(even){background:rgba(255,255,255,.045)}" + // zebra sutil
        ".ap-tbl .ap-dir{text-align:right;white-space:nowrap}" +
        ".ap-cod{color:var(--aco-claro,#5a9bc9);font-weight:700;white-space:nowrap}" +
        // condições comerciais
        ".ap-conds{display:flex;flex-direction:column;gap:28px;max-width:1100px;width:100%}" +
        ".ap-cond-rotulo{font-size:clamp(13px,1.4vw,18px);text-transform:uppercase;letter-spacing:.14em;color:var(--aco-claro,#5a9bc9);font-weight:700;margin-bottom:6px}" +
        ".ap-cond-txt{font-size:clamp(17px,2vw,26px);color:#e8f0f8;line-height:1.5;white-space:pre-line}" +
        // fechamento
        ".ap-fech{text-align:center;max-width:1100px}" +
        ".ap-fech-obrigado{font-size:clamp(40px,7vw,96px);font-weight:900;letter-spacing:-1.5px;margin-bottom:4vh}" +
        ".ap-fech-validade{font-size:clamp(18px,2.4vw,30px);color:var(--verde-claro,#22c55e);font-weight:700;margin-bottom:2.5vh}" +
        ".ap-fech-emp{font-size:clamp(15px,1.8vw,22px);color:#cfe0ef;margin-bottom:1.4vh}" +
        ".ap-fech-msg{font-size:clamp(13px,1.5vw,18px);color:#8fa9c2}" +
        // controles discretos
        ".apres-nav{position:absolute;top:50%;transform:translateY(-50%);width:52px;height:52px;border-radius:50%;" +
        "border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.05);color:#e6eef7;" +
        "font-size:28px;line-height:1;cursor:pointer;opacity:.45;transition:opacity .2s,background .2s;z-index:2}" +
        ".apres-nav:hover{opacity:1;background:rgba(255,255,255,.12)}" +
        ".apres-ant{left:18px}.apres-prox{right:18px}" +
        ".apres-contador{position:absolute;bottom:18px;left:50%;transform:translateX(-50%);" +
        "font-size:14px;color:#8fa9c2;letter-spacing:.12em;z-index:2}" +
        ".apres-fechar{position:absolute;top:16px;right:18px;width:44px;height:44px;border-radius:50%;" +
        "border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.05);color:#e6eef7;" +
        "font-size:17px;line-height:1;cursor:pointer;opacity:.55;transition:opacity .2s,background .2s;z-index:2}" +
        ".apres-fechar:hover{opacity:1;background:rgba(220,38,38,.4)}";
      var st = document.createElement("style");
      st.id = "apres-css";
      st.textContent = css;
      document.head.appendChild(st);
    }
  };

  global.Apresentacao = Apresentacao;
  if (typeof module !== "undefined" && module.exports) module.exports = Apresentacao;
  // global = window no browser; no Node (teste) usa o global real.
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
