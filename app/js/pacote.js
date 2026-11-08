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
 *  • ⚠ MESMO CERTAME, OUTRA VEZ (07/11/2026): "o mais novo vence" sozinho
 *    segurava o pacote em silêncio quando o orçamento daqui tinha sido
 *    editado (o carimbo dele é mais novo que o do arquivo) — a pessoa reabria
 *    o certame e continuava vendo o orçamento antigo. Agora, se já existe
 *    orçamento com o mesmo id E ele foi editado depois da importação (ou tem
 *    preço/quantidade diferente do pacote), a confirmação pergunta: SUBSTITUIR
 *    (o atual vai para uma cópia "nome (antes da reimportação dd/mm hh:mm)" —
 *    o padrão) ou MANTER o atual. Nunca se apaga sem cópia. Sem edição local,
 *    vale a regra de sempre.
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

    /* MODELO DE PROPOSTA exportado pelo app (js/proptpl.js, `paraArquivo`):
       entra pela mesma porta do link/arquivo, mas vai para o fluxo dos modelos
       (confirmação, fotos no IndexedDB, nome livre). Assim o escritório publica
       o modelo da empresa e cada usuário traz com um clique. */
    ehModelo: function (obj) {
      return !!(obj && typeof obj === "object" && typeof PropTpl !== "undefined" && obj.marca === PropTpl.MARCA_ARQUIVO);
    },
    importarModelo: function (obj) {
      if (typeof PropTpl === "undefined" || typeof Gestao === "undefined" || !Gestao._propModConfirmarImport) {
        UI.toast("Modelos de proposta não estão disponíveis nesta conta.", "erro"); return false;
      }
      if (typeof Auth !== "undefined" && Auth.podeModulo && !Auth.podeModulo("modelos")) {
        UI.toast("Você não tem acesso a Modelos de proposta.", "erro"); return false;
      }
      var r = PropTpl.doArquivo(obj);
      if (!r.ok) { UI.toast(r.erro, "erro"); return false; }
      Gestao._propModConfirmarImport(r);
      return true;
    },

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

    /* ------------------------------------------------------------------
     * REIMPORTAR O MESMO CERTAME
     * ------------------------------------------------------------------ */
    _dataHoraBr: function (iso) {
      var d = new Date(iso || Date.now());
      if (isNaN(d.getTime())) d = new Date();
      var z = function (n) { return (n < 10 ? "0" : "") + n; };
      return z(d.getDate()) + "/" + z(d.getMonth() + 1) + " " + z(d.getHours()) + ":" + z(d.getMinutes());
    },
    /* O orçamento daqui foi mexido desde que o pacote entrou?
       Critérios (qualquer um basta): carimbo `atualizadoEm` depois do
       `importadoEm`; preço ou quantidade diferente do pacote em item de mesmo
       id; item acrescentado que o pacote não tem. Os itens "identificados no
       edital" (etapa opcional que o OrçaPRO cria) não contam como edição. */
    editadoLocal: function (existente, pacoteOrc) {
      var motivos = [];
      var ehIdent = function (e, it) {
        return !!((typeof Licitacao !== "undefined" && Licitacao.ehEtapaIdentificados && Licitacao.ehEtapaIdentificados(e)) || (it && it.identificadoEdital));
      };
      if (existente.importadoEm && String(existente.atualizadoEm || "") > String(existente.importadoEm)) {
        motivos.push("alterado depois da importação de " + this._dataHoraBr(existente.importadoEm));
      }
      var doPacote = Object.create(null);
      arr(pacoteOrc && pacoteOrc.etapas).forEach(function (e) { arr(e && e.itens).forEach(function (it) { if (it && it.id != null) doPacote[String(it.id)] = it; }); });
      var difer = 0, extras = 0;
      arr(existente && existente.etapas).forEach(function (e) {
        arr(e && e.itens).forEach(function (it) {
          if (!it || it.id == null || ehIdent(e, it)) return;
          var p = doPacote[String(it.id)];
          if (!p) { extras++; return; }
          if (Math.abs(Util.num(it.custoUnitario) - Util.num(p.custoUnitario)) > 0.005 || Math.abs(Util.num(it.quantidade) - Util.num(p.quantidade)) > 1e-9) difer++;
        });
      });
      if (difer) motivos.push(difer + " item(ns) com preço ou quantidade diferente do pacote");
      if (extras) motivos.push(extras + " item(ns) que o pacote não tem");
      return { editado: motivos.length > 0, motivos: motivos };
    },
    /* Lista os orçamentos do pacote que JÁ existem aqui com o mesmo id e foram
       editados — é o que a confirmação mostra. */
    conflitos: function (dump) {
      var self = this, out = [], eid;
      try { eid = Auth.empresaId(); } catch (e) { return out; }
      var idx = Object.create(null);
      try { Store.listarOrcamentos(eid).forEach(function (x) { if (x && x.id) idx[x.id] = x; }); } catch (e2) {}
      arr(dump && dump.orcamentos).forEach(function (o) {
        var ex = o && idx[o.id];
        if (!ex) return;
        var r = self.editadoLocal(ex, o);
        if (r.editado) out.push({ id: o.id, nome: ex.nome || o.nome || "", numero: ex.numero || "", motivos: r.motivos, atualizadoEm: ex.atualizadoEm || "", importadoEm: ex.importadoEm || "" });
      });
      return out;
    },
    /* Cópia do orçamento que vai ser substituído. Vem ANTES da substituição:
       sem a cópia gravada, nada é trocado. */
    copiaAntesDaReimportacao: function (ex, agora) {
      var cp = Util.clone(ex), rot = this._dataHoraBr(agora);
      cp.id = Util.uid("orc");
      cp.nome = String(ex.nome || "Orçamento") + " (antes da reimportação " + rot + ")";
      if (ex.numero) cp.numero = String(ex.numero) + "-ANTES-" + rot.replace(/[^0-9]/g, "");
      cp.copiaDe = ex.id; cp.copiaMotivo = "reimportacao-pacote";
      cp.criadoEm = agora; cp.atualizadoEm = agora;
      delete cp.importadoEm;
      return cp;
    },

    /* A porta única. Devolve { ok, nOrc, orcMantidos, orcIds, gestao:{ent:{novos,mantidos}} }. */
    aplicar: function (dump, origem, opcoes) {
      var v = this.validar(dump);
      if (!v.ok) return { ok: false, erros: v.erros };
      var self = this, eid = Auth.empresaId();
      opcoes = opcoes || {};
      var agora = opcoes.agora || Util.agoraISO();
      var res = { ok: true, nOrc: 0, orcMantidos: 0, orcIds: [], gestao: {}, copias: [], mantidosPorEscolha: 0 };

      // ---- orçamentos: mais novo vence, carimbo do arquivo preservado ----
      var idx = Object.create(null), existentes = Object.create(null);
      try { Store.listarOrcamentos(eid).forEach(function (x) { if (x && x.id) { idx[x.id] = String(x.atualizadoEm || ""); existentes[x.id] = x; } }); } catch (e) {}
      var entramOrc = [], copiasOrc = [];
      arr(dump.orcamentos).forEach(function (o) {
        var c = Util.clone(o);
        if (c.schemaVersao == null) c.schemaVersao = CONFIG.schemaVersao;
        if (!c.criadoEm) c.criadoEm = Util.agoraISO();
        if (!c.atualizadoEm) c.atualizadoEm = c.criadoEm;
        res.orcIds.push(c.id);
        var ex = existentes[c.id];
        if (ex) {
          var ed = self.editadoLocal(ex, o);
          if (ed.editado) {
            /* EDITADO AQUI: nunca "o mais novo vence" em silêncio. A pessoa
               escolheu na confirmação; sem escolha, o padrão é SUBSTITUIR
               GUARDANDO CÓPIA. */
            var esc = (opcoes.escolhas && opcoes.escolhas[c.id]) || "substituir";
            if (esc === "manter") { res.orcMantidos++; res.mantidosPorEscolha++; return; }
            copiasOrc.push({ origem: ex, copia: self.copiaAntesDaReimportacao(ex, agora), novoId: c.id });
            /* ⚠ SUBSTITUIÇÃO ESCOLHIDA LEVA CARIMBO "AGORA" (exceção à regra do
               carimbo do arquivo, lá no topo). O editado daqui tem atualizadoEm
               MAIS NOVO que o do arquivo e já subiu para a nuvem; com o carimbo
               do arquivo, o merge da nuvem ("o mais novo vence", js/nuvem.js)
               trazia o editado de volta por cima do pacote na sincronização
               seguinte, e a escolha da pessoa sumia sem aviso (revisão de
               07/11/2026). Aqui vencer a nuvem é justamente o que se pediu. */
            c.atualizadoEm = (String(agora) > String(ex.atualizadoEm || "")) ? agora : Util.agoraISO();
          } else if (idx[c.id] >= String(c.atualizadoEm)) { res.orcMantidos++; return; }
        }
        c.importadoEm = agora;
        try { Orcamento.garantirConfig(c); Orcamento.garantirComercial(c); } catch (e) {}
        /* BLOCO `certamepro` (js/licitacao.js): vira config.licitacao e trava os
           itens do órgão. Com mais de um orçamento no pacote só recebe o que
           tem o número do certame — não se carimba licitação em orçamento alheio. */
        try {
          if (dump.certamepro && typeof Licitacao !== "undefined" && Licitacao.aplicarPacote) {
            var _nOrcs = arr(dump.orcamentos).length;
            if (_nOrcs === 1 || String(c.numero || "") === String(dump.certamepro.certame || "")) {
              var _lic = Licitacao.aplicarPacote(c, dump.certamepro);
              if (_lic) {
                res.licitacao = (res.licitacao || 0) + 1;
                if (_lic.basesExigidas && _lic.basesExigidas.length) res.basesExigidas = (res.basesExigidas || 0) + _lic.basesExigidas.length;
                if (_lic.itensIdentificados && _lic.itensIdentificados.novos) res.identificados = (res.identificados || 0) + _lic.itensIdentificados.novos;
              }
            }
          }
        } catch (eLic) {}
        entramOrc.push(c);
      });
      /* a lápide de uma exclusão anterior tem de ser desfeita, senão o
         primeiro sync apaga de novo o que acabou de entrar (ver Store.desenterrar) */
      try { Store.desenterrar(eid, "orcamentos", entramOrc.map(function (x) { return x.id; })); } catch (e) {}
      /* a cópia do orçamento antigo é gravada ANTES de trocá-lo; se não gravar,
         o orçamento novo NÃO entra (nunca apagar sem cópia) */
      var semCopia = Object.create(null);
      copiasOrc.forEach(function (k) {
        var ok = null;
        try { ok = Store.salvarOrcamento(eid, k.copia, true); } catch (eC) { ok = null; }
        if (ok) res.copias.push({ id: k.copia.id, nome: k.copia.nome, deId: k.origem.id });
        else { semCopia[k.novoId] = 1; res.copiaFalhou = (res.copiaFalhou || 0) + 1; }
      });
      entramOrc = entramOrc.filter(function (c) { if (semCopia[c.id]) { res.orcMantidos++; return false; } return true; });
      res.salvos = [];   // ids que de fato entraram NESTA importação (o "Manter o atual" fica de fora)
      entramOrc.forEach(function (c) {
        if (Store.salvarOrcamento(eid, c, true)) { res.nOrc++; res.salvos.push(c.id); return; }
        /* lista de orçamentos ilegível neste aparelho (js/store.js, quarentena):
           o recado diz por que não entrou, em vez de só "0 importado(s)" */
        if (Store.ultimaRecusa && Store.ultimaRecusa.tipo === "corrompido") res.orcIlegivel = (res.orcIlegivel || 0) + 1;
      });

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
      if (res.licitacao) partes.push("modo licitação ligado (itens do órgão travados; avisos de preço e teto ativos)");
      if (res.identificados) partes.push(res.identificados + " item(ns) identificado(s) no edital fora da planilha do órgão, na etapa opcional “Itens identificados no edital” (sem preço: a compor; fora do total da proposta)");
      if (res.basesExigidas) partes.push(res.basesExigidas + " base(s) de preço exigida(s) pelo edital — confira o painel \"Bases exigidas pelo edital\" antes de rodar o Orçamentista");
      if (res.copias && res.copias.length) partes.push("o orçamento anterior ficou guardado como cópia: " + res.copias.map(function (k) { return "“" + k.nome + "”"; }).join(", "));
      if (res.copiaFalhou) partes.push(res.copiaFalhou + " NÃO foi substituído(s): não consegui gravar a cópia do atual, e nada se apaga sem cópia");
      if (res.mantidosPorEscolha) partes.push(res.mantidosPorEscolha + " mantido(s) como estava(m) aqui, por escolha sua (o pacote ficou de fora)");
      var _antigos = res.orcMantidos - (res.mantidosPorEscolha || 0) - (res.copiaFalhou || 0);
      if (_antigos > 0) partes.push(_antigos + " já estava(m) mais novo(s) aqui e foi(ram) mantido(s)");
      if (res.orcIlegivel) partes.push(res.orcIlegivel + " NÃO entrou(aram): a lista de orçamentos deste aparelho está ilegível (arquivo corrompido) — veja o aviso na lista de orçamentos");
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
      /* MESMO CERTAME, EDITADO AQUI: a pessoa escolhe (padrão: substituir
         guardando cópia). Sem conflito, a confirmação é a de sempre. */
      var conf = [];
      try { conf = this.conflitos(dump); } catch (eCf) { conf = []; }
      var quando = this._dataHoraBr(Util.agoraISO());
      conf.forEach(function (k, i) {
        html += '<div class="pkg-reimp" data-pkg-reimp="' + esc(k.id) + '" style="margin-top:10px;padding:8px 10px;border:1px solid var(--linha);border-radius:8px">' +
          '<p style="margin:0 0 6px;font-size:13px"><b>Este certame já está nesta conta</b> (' + esc(k.nome) + (k.numero ? " · " + esc(k.numero) : "") + ') e o orçamento foi <b>editado depois da importação anterior</b>: ' + esc(k.motivos.join("; ")) + '.</p>' +
          '<label style="display:block;font-size:13px;margin:3px 0"><input type="radio" name="pkg-reimp-' + i + '" value="substituir" checked> ' +
            '<b>Substituir</b> pelo pacote — o atual vai para uma cópia “' + esc(k.nome) + ' (antes da reimportação ' + esc(quando) + ')”</label>' +
          '<label style="display:block;font-size:13px;margin:3px 0"><input type="radio" name="pkg-reimp-' + i + '" value="manter"> ' +
            '<b>Manter o atual</b> — o pacote deste certame fica de fora</label></div>';
      });
      var lerEscolhas = function () {
        var esc2 = {};
        conf.forEach(function (k, i) {
          try {
            var r = document.querySelector('input[name="pkg-reimp-' + i + '"]:checked');
            esc2[k.id] = (r && r.value === "manter") ? "manter" : "substituir";
          } catch (e) { esc2[k.id] = "substituir"; }
        });
        return esc2;
      };
      UI.modal("Importar orçamento pronto", html, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); if (aoTerminar) aoTerminar({ ok: false, cancelado: true }); } },
        { texto: "Importar", classe: "primary", onClick: function () {
          var res = self.aplicar(dump, origem, { escolhas: lerEscolhas() });
          UI.fecharModal();
          UI.toast(self.mensagem(res), res.ok && !res.orcIlegivel ? "ok" : "erro", res.orcIlegivel ? 12000 : undefined);
          /* mesmo caminho da busca global (js/busca-ui.js): primeiro a visão
             Orçamentos, depois o editor — senão o Painel da Gestão fica na frente */
          if (res.ok && typeof App !== "undefined") {
            try {
              if (App.irPara && App.irPara("orcamentos") === false) return;
              if (res.orcIds.length === 1 && App.abrirOrcamento) App.abrirOrcamento(res.orcIds[0]);
              else { App.tela = "lista"; App.render(); }
            } catch (e) {}
            /* ORÇAMENTO AUTOMÁTICO (contrato v1; js/licitacaoautoui.js): pacote com
               `orcamento_automatico: true` roda o preset, o preço pelas bases exigidas, o
               BDI e a devolução sozinho. Sem o campo, nada acontece (fluxo manual de hoje). */
            try {
              /* ⚠ só o orçamento que ENTROU agora: res.orcIds também lista o que a pessoa mandou
                 "Manter o atual" (revisão de 08/11/2026) — rodar o automático nele refaria os preços
                 e o devolveria de novo contra a escolha dela */
              if (res.orcIds.length === 1 && (res.salvos || []).indexOf(res.orcIds[0]) >= 0 && App.licitacaoAutomaticaSePedido) App.licitacaoAutomaticaSePedido(res.orcIds[0]);
            } catch (eAuto) { try { UI.toast("O orçamento automático não rodou: " + (eAuto && eAuto.message ? eAuto.message : eAuto) + ". O orçamento foi importado; use o botão “Orçar sozinho”.", "erro", 12000); } catch (eT) {} }
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
          if (self.ehModelo(dump)) { self.importarModelo(dump); return; }
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
