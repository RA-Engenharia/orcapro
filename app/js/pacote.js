/* =====================================================================
 * pacote.js — PACOTE DE ORÇAMENTO (orçamento pronto entrando no OrçaPRO)
 *
 * POR QUE EXISTE: um orçamento pode nascer FORA do app — numa planilha, num
 * script, numa proposta montada no escritório — e até aqui o único caminho
 * para dentro era digitar tudo de novo na planilha. O Pacote é um arquivo
 * .json que já traz o orçamento cadastrado (etapas, itens, BDI, condições
 * comerciais) e, opcionalmente, o CLIENTE e a OBRA vinculados. Entra por
 * três portas, todas caindo na MESMA função `aplicar`:
 *
 *   1) LINK  — app/?importar=<url do .json>  (o app baixa, mostra o que vem
 *              e pede confirmação; serve para "subir direto" a partir do
 *              repositório publicado, ou de qualquer URL com CORS).
 *   2) ARQUIVO — 💾 Backup › Restaurar de um backup: o mesmo <input> aceita
 *              o pacote (ele É um backup com `tipo: "pacote-orcamento"`).
 *   3) CÓDIGO — Pacote.aplicar(dump) para quem automatiza.
 *
 * FORMATO (compatível com o backup do app — um leitor antigo o restaura):
 *   { app: "OrçaPRO", tipo: "pacote-orcamento", versao, exportadoEm,
 *     geradoPor, orcamentos: [ <orçamento no schema do app> ],
 *     gestao: { clientes: [...], obras: [...] } }
 *
 * AS REGRAS (as mesmas do "restaurar backup", de propósito):
 *  • MESCLA, nunca apaga: o que existe na conta e não está no arquivo fica.
 *  • O MAIS NOVO VENCE, por id e por `atualizadoEm`: reimportar o mesmo
 *    arquivo é um no-op (idempotente); um arquivo mais novo atualiza; um
 *    mais velho é mantido de fora e a tela diz isso.
 *  • O carimbo do arquivo é PRESERVADO (4º argumento do Store) — senão o
 *    registro entraria como "agora" e venceria a nuvem em todos os aparelhos.
 *  • ⚠ SÓ `clientes` e `obras` entram pela Gestão. Um pacote NÃO pode trazer
 *    `equipe`, `conta`, `usuarios` nem `prefs`: é por isso que ele dispensa a
 *    guarda de administrador que o backup completo exige (js/app.js
 *    importarBackup). Qualquer outra entidade no arquivo REPROVA o pacote,
 *    em vez de ser ignorada em silêncio.
 *  • ZERO NÃO É PREÇO: item sem custo unitário ou sem quantidade reprova,
 *    igual à trava da proposta (js/proposta.js validar).
 * ===================================================================== */
(function (global) {
  "use strict";

  var TIPO = "pacote-orcamento";
  var ENT_PERMITIDAS = ["clientes", "obras"];
  var PARAM = "importar";
  var CHAVE_PENDENTE = "orcapro:pacote-pendente";
  var ENT_LOG = "pacotes_importados";   // trilha local: quem importou o quê, quando, de onde

  function esc(s) { return (typeof Util !== "undefined" && Util.esc) ? Util.esc(s) : String(s == null ? "" : s); }
  function arr(a) { return (typeof Util !== "undefined" && Util.arr) ? Util.arr(a) : (Array.isArray(a) ? a : []); }

  var Pacote = {
    TIPO: TIPO,
    PARAM: PARAM,
    ENT_PERMITIDAS: ENT_PERMITIDAS,

    ehPacote: function (dump) { return !!(dump && typeof dump === "object" && dump.tipo === TIPO); },

    /* Reprova cedo e diz o motivo: arquivo pela metade não entra pela metade. */
    validar: function (dump) {
      var erros = [];
      if (!dump || typeof dump !== "object") return { ok: false, erros: ["O arquivo não é um JSON de objeto."] };
      if (dump.tipo !== TIPO) erros.push('O campo "tipo" tem de ser "' + TIPO + '".');
      var orcs = arr(dump.orcamentos);
      if (!orcs.length) erros.push("O pacote não traz nenhum orçamento.");
      var vistos = {};
      orcs.forEach(function (o, i) {
        var p = "Orçamento " + (i + 1) + ": ";
        if (!o || typeof o !== "object") { erros.push(p + "inválido."); return; }
        if (!o.id) erros.push(p + "sem id.");
        else if (vistos[o.id]) erros.push(p + "id repetido (" + o.id + ").");
        vistos[o.id] = 1;
        if (!Util.naoVazio(o.nome)) erros.push(p + "sem nome.");
        if (!arr(o.etapas).length) erros.push(p + "sem etapas.");
        arr(o.etapas).forEach(function (e, ei) {
          if (!e || !e.id) { erros.push(p + "etapa " + (ei + 1) + " sem id."); return; }
          arr(e.itens).forEach(function (it, ii) {
            var q = p + "item " + (ei + 1) + "." + (ii + 1) + " ";
            if (!it || !it.id) { erros.push(q + "sem id."); return; }
            if (!Util.naoVazio(it.descricao)) erros.push(q + "sem descrição.");
            if (!(Util.num(it.quantidade) > 0) && !it.qtdPendente) erros.push(q + "sem quantidade.");
            if (!(Util.num(it.custoUnitario) > 0)) erros.push(q + "sem preço (zero não é preço).");
          });
        });
      });
      var g = (dump.gestao && typeof dump.gestao === "object") ? dump.gestao : {};
      Object.keys(g).forEach(function (ent) {
        if (ENT_PERMITIDAS.indexOf(ent) < 0) {
          erros.push('A entidade "' + ent + '" não entra por pacote (só ' + ENT_PERMITIDAS.join(" e ") + ").");
          return;
        }
        arr(g[ent]).forEach(function (r, i) {
          if (!r || typeof r !== "object" || !r.id) erros.push(ent + " " + (i + 1) + ": sem id.");
          else if (!Util.naoVazio(r.nome)) erros.push(ent + " " + (i + 1) + ": sem nome.");
        });
      });
      return { ok: !erros.length, erros: erros };
    },

    /* O que o usuário vê ANTES de confirmar: nomes e totais, não ids. */
    resumo: function (dump) {
      var r = { orcamentos: [], clientes: [], obras: [] };
      arr(dump && dump.orcamentos).forEach(function (o) {
        var total = null;
        try { total = Orcamento.totais(o).precoVenda; } catch (e) {}
        r.orcamentos.push({ id: o.id, nome: o.nome || "", numero: o.numero || "", cliente: (o.cliente && o.cliente.nome) || "", total: total });
      });
      ENT_PERMITIDAS.forEach(function (ent) {
        arr(dump && dump.gestao && dump.gestao[ent]).forEach(function (x) { r[ent].push({ id: x.id, nome: x.nome || "" }); });
      });
      return r;
    },

    /* A porta única. Devolve { ok, nOrc, orcMantidos, orcIds, gestao:{ent:{novos,mantidos}} }. */
    aplicar: function (dump, origem) {
      var v = this.validar(dump);
      if (!v.ok) return { ok: false, erros: v.erros };
      var eid = Auth.empresaId();
      var res = { ok: true, nOrc: 0, orcMantidos: 0, orcIds: [], gestao: {} };

      // ---- orçamentos: mais novo vence, carimbo do arquivo preservado ----
      var idx = Object.create(null);
      try { Store.listarOrcamentos(eid).forEach(function (x) { if (x && x.id) idx[x.id] = String(x.atualizadoEm || ""); }); } catch (e) {}
      var entramOrc = [];
      arr(dump.orcamentos).forEach(function (o) {
        var c = Util.clone(o);
        if (c.schemaVersao == null) c.schemaVersao = CONFIG.schemaVersao;
        if (!c.criadoEm) c.criadoEm = Util.agoraISO();
        if (!c.atualizadoEm) c.atualizadoEm = c.criadoEm;
        res.orcIds.push(c.id);
        if (idx[c.id] != null && idx[c.id] >= String(c.atualizadoEm)) { res.orcMantidos++; return; }
        try { Orcamento.garantirConfig(c); Orcamento.garantirComercial(c); } catch (e) {}
        entramOrc.push(c);
      });
      /* a lápide de uma exclusão anterior tem de ser desfeita, senão o
         primeiro sync apaga de novo o que acabou de entrar (ver Store.desenterrar) */
      try { Store.desenterrar(eid, "orcamentos", entramOrc.map(function (x) { return x.id; })); } catch (e) {}
      entramOrc.forEach(function (c) { if (Store.salvarOrcamento(eid, c, true)) res.nOrc++; });

      // ---- gestão: só o que a validação deixou passar ----
      ENT_PERMITIDAS.forEach(function (ent) {
        var lista = arr(dump.gestao && dump.gestao[ent]);
        if (!lista.length) return;
        var ix = Object.create(null);
        try { Store.listar(eid, ent).forEach(function (x) { if (x && x.id != null) ix[String(x.id)] = String(x.atualizadoEm || ""); }); } catch (e) {}
        var entram = [], mantidos = 0;
        lista.forEach(function (r) {
          var c = Util.clone(r);
          if (!c.atualizadoEm) c.atualizadoEm = Util.agoraISO();
          if (!c.criadoEm) c.criadoEm = c.atualizadoEm;
          if (ix[String(c.id)] != null && ix[String(c.id)] >= String(c.atualizadoEm)) { mantidos++; return; }
          ix[String(c.id)] = String(c.atualizadoEm);
          entram.push(c);
        });
        try { Store.desenterrar(eid, ent, entram.map(function (x) { return x.id; })); } catch (e) {}
        var n = entram.length ? Store.salvarVarios(eid, ent, entram, true) : 0;
        res.gestao[ent] = { novos: n, mantidos: mantidos };
      });

      // ---- trilha local (não sincroniza; é o "quem/quando/de onde" deste aparelho) ----
      try {
        var u = Auth.usuario() || {};
        Store.salvar(eid, ENT_LOG, {
          id: Util.uid("pkg"), quando: Util.agoraISO(), origem: String(origem || "arquivo"),
          usuario: u.email || u.login || "", geradoPor: dump.geradoPor || "", exportadoEm: dump.exportadoEm || "",
          orcIds: res.orcIds.slice(), nOrc: res.nOrc, orcMantidos: res.orcMantidos, gestao: res.gestao
        });
      } catch (eL) {}
      return res;
    },

    mensagem: function (res) {
      if (!res || !res.ok) return "Pacote não importado.";
      var partes = [res.nOrc + " orçamento(s) importado(s)"];
      if (res.orcMantidos) partes.push(res.orcMantidos + " já estava(m) mais novo(s) aqui e foi(ram) mantido(s)");
      ENT_PERMITIDAS.forEach(function (ent) {
        var g = res.gestao[ent]; if (!g) return;
        partes.push(ent + ": " + g.novos + " novo(s)/atualizado(s)" + (g.mantidos ? ", " + g.mantidos + " mantido(s)" : ""));
      });
      return partes.join(" · ") + ".";
    },

    /* Mostra o que vem, pede confirmação, aplica e abre o orçamento. */
    confirmarEAplicar: function (dump, origem, aoTerminar) {
      var self = this;
      var v = this.validar(dump);
      if (!v.ok) {
        UI.modal("Pacote de orçamento inválido",
          '<p>O arquivo não pôde ser importado:</p><ul style="font-size:13px">' + v.erros.slice(0, 12).map(function (e) { return "<li>" + esc(e) + "</li>"; }).join("") +
          (v.erros.length > 12 ? "<li>… e mais " + (v.erros.length - 12) + "</li>" : "") + "</ul>",
          [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
        if (aoTerminar) aoTerminar({ ok: false, erros: v.erros });
        return;
      }
      var r = this.resumo(dump);
      var fm = function (n) { return (n == null) ? "—" : Util.fmtMoeda(n); };
      var html = '<p>Este pacote traz:</p><ul style="font-size:13px">' +
        r.orcamentos.map(function (o) {
          return "<li><b>" + esc(o.nome) + "</b>" + (o.numero ? " · " + esc(o.numero) : "") + (o.cliente ? " · cliente " + esc(o.cliente) : "") + " · <b>" + fm(o.total) + "</b></li>";
        }).join("") +
        (r.clientes.length ? "<li>Cliente(s): " + r.clientes.map(function (c) { return esc(c.nome); }).join(", ") + "</li>" : "") +
        (r.obras.length ? "<li>Obra(s): " + r.obras.map(function (c) { return esc(c.nome); }).join(", ") + "</li>" : "") +
        "</ul>" +
        '<p class="muted" style="font-size:12.5px">Importar <b>mescla</b> com o que já existe nesta conta — nada é apagado. ' +
        "Se um registro já estiver mais novo aqui, ele é mantido e o do arquivo fica de fora." +
        (origem ? "<br>Origem: <span class=\"mono\" style=\"font-size:11px\">" + esc(origem) + "</span>" : "") + "</p>";
      UI.modal("Importar orçamento pronto", html, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); if (aoTerminar) aoTerminar({ ok: false, cancelado: true }); } },
        { texto: "Importar", classe: "primary", onClick: function () {
          var res = self.aplicar(dump, origem);
          UI.fecharModal();
          UI.toast(self.mensagem(res), res.ok ? "ok" : "erro");
          /* mesmo caminho da busca global (js/busca-ui.js): primeiro a visão
             Orçamentos, depois o editor — senão o Painel da Gestão fica na frente */
          if (res.ok && typeof App !== "undefined") {
            try {
              if (App.irPara && App.irPara("orcamentos") === false) return;
              if (res.orcIds.length === 1 && App.abrirOrcamento) App.abrirOrcamento(res.orcIds[0]);
              else { App.tela = "lista"; App.render(); }
            } catch (e) {}
          }
          if (aoTerminar) aoTerminar(res);
        } }
      ]);
    },

    importarDeUrl: function (url, cb) {
      if (!/^(https?:)?\/\/|^[./]|^[\w-]/.test(String(url || ""))) { cb(new Error("URL inválida.")); return; }
      try {
        fetch(url, { cache: "no-store" })
          .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
          .then(function (dump) { cb(null, dump); })
          .catch(function (e) { cb(e); });
      } catch (e) { cb(e); }
    },

    /* app/?importar=<url> — guarda a URL, limpa a barra e espera a sessão. */
    processarParam: function () {
      var self = this, url = "";
      try {
        var q = new URLSearchParams(location.search || "");
        url = String(q.get(PARAM) || "").trim();
        if (url) {
          try { sessionStorage.setItem(CHAVE_PENDENTE, url); } catch (e) {}
          q["delete"](PARAM);
          var qs = q.toString();
          try { history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + (location.hash || "")); } catch (e2) {}
        }
      } catch (e3) {}
      var pend = null;
      try { pend = sessionStorage.getItem(CHAVE_PENDENTE); } catch (e4) {}
      if (!pend) return false;
      this._aguardarSessao(function () {
        UI.toast("Baixando o orçamento para importar…", "ok");
        self.importarDeUrl(pend, function (err, dump) {
          if (err) { UI.toast("Não consegui baixar o pacote (" + err.message + "). O link continua válido: abra-o de novo com internet.", "erro"); return; }
          try { sessionStorage.removeItem(CHAVE_PENDENTE); } catch (e5) {}
          self.confirmarEAplicar(dump, pend);
        });
      });
      return true;
    },

    /* A sessão pode ainda não existir (tela de login). Espera até 10 min. */
    _aguardarSessao: function (fn) {
      var tentativas = 0;
      (function tenta() {
        var ok = false;
        try { ok = !!(typeof Auth !== "undefined" && Auth.usuario() && Auth.podeModulo("orcamentos")); } catch (e) {}
        if (ok) { fn(); return; }
        if (++tentativas > 1200) return;
        setTimeout(tenta, 500);
      })();
    }
  };

  global.Pacote = Pacote;
})(typeof window !== "undefined" ? window : this);
