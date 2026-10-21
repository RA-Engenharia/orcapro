/* =====================================================================
 * marmorariaui.js — a TELA da MARMORARIA (bancadas de pedra com cuba e torneira) e do MÓDULO MARMORARIA
 *
 * Fiação fina: o motor é o js/marmoraria.js (bancada resolvida, 3D, hidro, orçamento SINAPI), a tabela de preços e o
 * orçamento do marmorista saem do js/marmprecos.js, a proposta do js/marmproposta.js, as folhas do
 * js/marmorariapranchas.js e a licença do js/marmmodulo.js. Aqui, na aba Arquitetura (painel "Marmoraria"):
 *   Ambiente pelas medidas — as quatro paredes de um cômodo retangular pela largura × profundidade (a bancada encosta);
 *   Bancada de banheiro / Bancada de cozinha — coloca o CONJUNTO (pedra + cuba + torneira) como família: clique na
 *     parede (o fundo encosta nela); depois troca-se a pedra, a cuba e a torneira em Propriedades (desfaz com Ctrl+Z);
 *   Executivo de marmoraria — uma folha por bancada do modelo (planta cotada, frontal, borda, plano de chapa, lista de
 *     peças) com o carimbo: PDF e DXF;
 *   Tabela de preços — os preços DO MARMORISTA (por empresa, sincronizados), importar/exportar .xlsx;
 *   Orçamento e proposta — o orçamento de cada bancada com a tabela dele e a proposta em PDF com a marca dele.
 * ⚠ TODO comando do módulo passa por `porta()` (MarmModulo.guarda): sem a licença, ele recusa e mostra a oferta —
 *   a trava é na função, não no botão.
 * Quem chama `registrar` é o js/bimarqui.js (como a marcenaria).
 * ===================================================================== */
(function (global) {
  "use strict";
  function MM() { return global.Marmoraria; }
  function MP() { return global.MarmorariaPranchas; }
  function PR() { return global.MarmPrecos; }
  function PP() { return global.MarmProposta; }
  function MOD() { return global.MarmModulo; }
  function B() { return global.BIM || null; }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function esc(s) { return txt(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function brl(v) { return "R$ " + (Math.round(v * 100) / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  function br(v, c) { var p = Math.pow(10, c == null ? 2 : c); return (Math.round(v * p) / p).toFixed(c == null ? 2 : c).replace(".", ","); }
  function vNum(v) { return v == null ? "" : String(v).replace(".", ","); }
  function toast(m, t) { try { if (global.UI && UI.toast) UI.toast(m, t || "ok"); } catch (e) {} }
  function status(t) { try { if (global.BimShell && BimShell.status) BimShell.status(t); } catch (e) {} }
  function baixar(nome, conteudo, tipo) {
    var d = global.document, b = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo || "application/octet-stream" });
    var a = d.createElement("a"); a.href = URL.createObjectURL(b); a.download = nome; d.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function empresa() { var d = {}, logo = null; try { if (global.Empresa && Empresa.dados) d = Empresa.dados() || {}; if (global.Empresa && Empresa.logo) logo = Empresa.logo(); } catch (e) {} return { d: d, logo: logo }; }
  function obra() { var g = global.Gestao, o = null; try { if (g && g._bimSel && global.Store && global.Auth) o = Store.obter(Auth.empresaId(), "obras", g._bimSel); } catch (e) {} return o || {}; }
  function q(sel) { return global.document ? global.document.querySelector(sel) : null; }
  function qa(sel) { return global.document ? arr(Array.prototype.slice.call(global.document.querySelectorAll(sel))) : []; }
  function nomeArq(s) { return txt(s).replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim(); }

  var CMDS = ["marm-ambiente", "marm-banho", "marm-cozinha", "marm-executivo", "marm-precos", "marm-orcamento"];

  var MarmorariaUI = {
    _G: null,
    CMDS: CMDS,
    registrar: function (reg, g) {
      var R = global.BimRibbon, self = this;
      if (!R || !reg || !MM()) return false;
      this._G = g || null;
      R.acrescentar("arquitetura", "Arquitetura", "Marmoraria", [
        { id: "marm-ambiente", rotulo: "Ambiente\npelas medidas", icone: "parede", grande: true, dica: "As quatro paredes de um cômodo retangular pela largura × profundidade de dentro. Depois clique na parede para colocar a bancada." },
        { id: "marm-banho", rotulo: "Bancada de\nbanheiro", icone: "familia", grande: true, dica: "Bancada de pedra com cuba e torneira (o conjunto): o tampo já sai recortado pelo gabarito da cuba, com saia, rodabanca e os pontos de água e esgoto na parede. Clique na parede. Troque a pedra, a cuba e a torneira em Propriedades." },
        { id: "marm-cozinha", rotulo: "Bancada de\ncozinha", icone: "familia", grande: true, dica: "Bancada de cozinha em pedra com cuba de inox (embutir, por baixo ou de sobrepor) e torneira de mesa ou de parede." },
        { id: "marm-executivo", rotulo: "Executivo de\nmarmoraria", icone: "lista", grande: true, dica: "Uma folha por bancada do modelo: planta da peça cotada a partir das bordas, furos e cortes, vista frontal, detalhe da borda, plano de chapa e lista de peças, com o carimbo. PDF e DXF." },
        { id: "marm-precos", rotulo: "Tabela de\npreços", icone: "calculadora", grande: true, dica: "Os SEUS preços: R$/m² por pedra, R$/m de cada acabamento de borda, furo, recorte de cuba, cuba fornecida, mão-francesa, instalação, frete, perda de chapa, margem e desconto. Importa e exporta planilha." },
        { id: "marm-orcamento", rotulo: "Orçamento e\nproposta", icone: "calculadora", grande: true, dica: "O orçamento de cada bancada do modelo com a sua tabela de preços e a proposta em PDF com a sua marca e o executivo anexo." }
      ]);
      CMDS.forEach(function (k) { if (R._EXCLUSIVOS && R._EXCLUSIVOS.indexOf(k) < 0 && (k === "marm-banho" || k === "marm-cozinha")) R._EXCLUSIVOS.push(k); });
      reg["marm-ambiente"] = function () { return self.porta("ambiente", function () { return self.ambiente(); }); };
      reg["marm-banho"] = function () { return self.porta("bancada", function () { return self.colocar("ra-marm-bancada-banho", "b120"); }); };
      reg["marm-cozinha"] = function () { return self.porta("bancada", function () { return self.colocar("ra-marm-bancada-cozinha", "c160"); }); };
      reg["marm-executivo"] = function () { return self.porta("executivo", function () { return self.executivo(); }); };
      reg["marm-precos"] = function () { return self.porta("precos", function () { return self.precos(); }); };
      reg["marm-orcamento"] = function () { return self.porta("orcamento", function () { return self.orcamento(); }); };
      return true;
    },

    /* ------------------------------------------------------------ LICENÇA */
    /* ⚠ a porta de todo comando: liberado → executa; senão recusa e mostra a oferta (nunca executa "só desta vez") */
    porta: function (acao, fn) {
      var M = MOD(), g = M ? M.guarda(acao) : { ok: false, motivo: "módulo não carregado" };   /* sem o js/marmmodulo.js: fecha (antes abria tudo) */
      if (g.ok) return fn();
      this.oferta(g);
      return false;
    },
    oferta: function (g) {
      var M = MOD(), O = (g && g.oferta) || (M && M.OFERTA) || {}, self = this;
      var h = '<div style="font-size:13px;line-height:1.5;max-width:560px">' + (g && g.demo ? '<p data-marm-demo style="margin:0 0 10px;padding:8px 10px;border:1px solid #f3c77a;background:#fff8e6;border-radius:6px;color:#7a4b00"><b>Demonstração: exportar está bloqueado.</b> ' + esc(g.motivo) + "</p>" : "") + '<p style="margin:0 0 8px"><b>' + esc(O.subtitulo) + "</b></p><ul style=\"margin:0 0 10px 18px;padding:0\">" +
        arr(O.itens).map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul><p class=\"muted\" style=\"margin:0 0 8px\">" + esc(O.semOrcapro) + "</p>" +
        '<div id="marm-oferta-venda" class="muted">' + (g && g.testeEncerrado ? "O seu teste de 7 dias terminou. " : "") + esc(O.vendaFechada) + "</div></div>";
      var bts = [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }];
      if (g && g.podeTestar) bts.unshift({ texto: "Começar o teste de 7 dias", classe: "primary", onClick: function () { M.iniciarTeste(function () {}); UI.fecharModal(); toast("Teste de 7 dias do módulo Marmoraria começado.", "ok"); } });
      if (global.UI && UI.modal) UI.modal(O.titulo || "Módulo Marmoraria", h, bts);
      /* a venda abre quando o servidor listar um plano modela_marmoraria_* (decisão de preço do dono) */
      try {
        var srv = global.Modela && Modela._servidor ? Modela._servidor() : "";
        if (srv && global.fetch && M) global.fetch(srv + "/api/modela/oferta", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
          var pl = M.planosAVenda(d), el = q("#marm-oferta-venda"); if (!pl.length || !el) return;
          el.innerHTML = pl.map(function (p) { return '<a class="btn primary" target="_blank" rel="noopener" href="' + esc(srv + "/modelagem?plano=" + encodeURIComponent(p.id)) + '">' + esc(p.nome) + " — " + esc(brl(p.valor)) + " " + esc(p.periodo || "") + "</a>"; }).join(" ");
        }, function () {});
      } catch (e) {}
      return false;
    },

    /* ------------------------------------------------------------ MODELO */
    colocar: function (famId, tipoId) {
      var b = B(), G = this._G; if (!b || !b.editarArmar) return false;
      this._catalogo();
      try { if (G && G._famSync) G._famSync(); else if (global.FamiliaUI && FamiliaUI._sincronizarVisor) FamiliaUI._sincronizarVisor(); } catch (e) {}
      b.editarArmar("familia", { famId: famId, tipoId: tipoId, inst: {} });
      status("Clique na parede onde fica a bancada (o fundo encosta nela; Espaço gira 90°). Depois troque a pedra, a cuba e a torneira em Propriedades.");
      return true;
    },
    /* as pedras cadastradas pelo marmorista entram na lista de Pedra das Propriedades */
    _catalogo: function () { try { if (PR()) PR().tabela(); } catch (e) {} },
    /* AMBIENTE PELAS MEDIDAS: 4 paredes, medidas INTERNAS (é como o marmorista mede), eixo a meia espessura para fora */
    paredesDoAmbiente: function (larg, prof, op) {
      op = op || {}; var e = op.espessura > 0 ? op.espessura : 0.15, h = op.altura > 0 ? op.altura : 2.8, y = op.base || 0, x0 = op.x || 0, z0 = op.z || 0, s = e / 2;
      var E = global.BimEdit; if (!E || !E.parede || !(larg > 0.3) || !(prof > 0.3)) return [];
      var P = [[-s, -s, larg + s, -s], [larg + s, -s, larg + s, prof + s], [larg + s, prof + s, -s, prof + s], [-s, prof + s, -s, -s]], base = "MA" + Date.now().toString(36);
      return P.map(function (w, i) { return { op: "criar", id: base + i, caixa: E.parede({ x: x0 + w[0], z: z0 + w[1] }, { x: x0 + w[2], z: z0 + w[3] }, e, h, y) }; }).filter(function (o) { return o.caixa; });
    },
    ambiente: function () {
      var self = this;
      var h = '<div style="display:grid;grid-template-columns:auto 120px;gap:8px 12px;align-items:center;font-size:13px">' +
        '<label for="marm-amb-l">Largura de dentro (m)</label><input id="marm-amb-l" class="input" inputmode="decimal" value="2,40">' +
        '<label for="marm-amb-p">Profundidade de dentro (m)</label><input id="marm-amb-p" class="input" inputmode="decimal" value="2,00">' +
        '<label for="marm-amb-a">Altura das paredes (m)</label><input id="marm-amb-a" class="input" inputmode="decimal" value="2,80">' +
        '<label for="marm-amb-e">Espessura das paredes (m)</label><input id="marm-amb-e" class="input" inputmode="decimal" value="0,15"></div>' +
        '<p class="muted" style="font-size:12px;margin:10px 0 0">Meça de face a face, por dentro. Depois use Bancada de banheiro ou de cozinha e clique na parede.</p>';
      UI.modal("Ambiente pelas medidas", h, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Criar as paredes", classe: "primary", onClick: function () {
          var N = PR().numU, L = N(q("#marm-amb-l").value), P = N(q("#marm-amb-p").value), A = N(q("#marm-amb-a").value), E = N(q("#marm-amb-e").value);
          if (!(L > 0.3) || !(P > 0.3)) { toast("Informe a largura e a profundidade em metros (mais de 0,30 m).", "aviso"); return; }
          UI.fecharModal(); self.criarAmbiente(L, P, { altura: A, espessura: E });
        } }]);
      return true;
    },
    criarAmbiente: function (L, P, op) {
      var b = B(); if (!b || !b.editarAplicar) return { ok: false };
      op = op || {}; op.base = b.editarBase ? b.editarBase() : 0;
      /* ao lado do que já existe (não em cima): à direita da caixa do modelo */
      try { var cx = b.pavimentos2d && b.pavimentos2d().caixa; if (cx && cx.max && isFinite(cx.max[0])) { op.x = Math.round((cx.max[0] + 2) * 100) / 100; op.z = Math.round(cx.min[2] * 100) / 100; } } catch (e) {}
      var ops = this.paredesDoAmbiente(L, P, op);
      if (!ops.length) return { ok: false };
      b.editarAplicar(b.editarOps().concat(ops));
      try { if (b.enquadrarUids) b.enquadrarUids(ops.map(function (o) { return "edit:" + o.id; })); } catch (e2) {}
      status("Ambiente de " + br(L) + " × " + br(P) + " m criado. Agora: Bancada de banheiro ou de cozinha e clique na parede.");
      return { ok: true, ids: ops.map(function (o) { return o.id; }) };
    },
    estado: function () { var b = B(), e = b && b.editarEstado ? b.editarEstado() : null; return e ? e.estado : null; },
    avaliar: function (famId, tipoId, inst) {
      var b = B(); if (b && b.familiaAvaliar) { var a = b.familiaAvaliar(famId, tipoId, inst); if (a) return a; }
      var r = global.FamiliasRA && FamiliasRA.obter(famId, true); return r && global.Familia ? Familia.avaliar(r, tipoId, inst) : null;
    },
    /* as bancadas do modelo, resolvidas (cada uma com o rótulo B1, B2… na ordem do modelo) */
    bancadas: function () {
      var st = this.estado(), self = this, out = [];
      arr(st && st.familias).filter(function (f) { return MM().ehMarmoraria(f.famId); }).forEach(function (f, i) {
        var av = self.avaliar(f.famId, f.tipoId, f.inst); if (!av || !av.valores) return;
        var amb = /cozinha/.test(f.famId) ? "cozinha" : "banheiro";
        out.push({ rotulo: "B" + (i + 1), nome: (amb === "cozinha" ? "Bancada de cozinha" : "Bancada de banheiro") + " (" + f.id + ")", id: f.id, def: MM().montar(av.valores, { ambiente: amb }) });
      });
      return out;
    },
    mostrar3d: function (idOuRotulo) {
      var b = B(), bs = this.bancadas(), x = bs.filter(function (k) { return k.id === idOuRotulo || k.rotulo === idOuRotulo; })[0];
      if (!b || !x) return false;
      try { UI.fecharModal(); } catch (e) {}
      try { if (global.Gestao && Gestao._bimVxAtivar) Gestao._bimVxAtivar("3d"); } catch (e0) {}
      try { if (b.selecionar) b.selecionar(["edit:" + x.id]); } catch (e1) {}
      try { if (b.enquadrarUids) b.enquadrarUids(["edit:" + x.id]); } catch (e2) {}
      status(x.rotulo + " — " + x.nome + ": selecionada. Troque a pedra, a cuba e a torneira em Propriedades.");
      return true;
    },
    opcoes: function () {
      var em = empresa(), ob = obra(), cli = ob.clienteNome || ob.cliente || "";
      return { obra: ob.nome || "", local: ob.endereco || ob.local || "", contratante: cli, proprietario: cli, empresa: em.d && em.d.nome ? em.d : "", responsavel: em.d.responsavel || "", registro: em.d.crea || "", logo: em.logo || null, codigo: "MAR", revisao: "R00", data: new Date().toISOString().slice(0, 10) };
    },

    /* ------------------------------------------------------------ EXECUTIVO */
    executivo: function () {
      var bs = this.bancadas();
      if (!bs.length) { toast("Nenhuma bancada de pedra no modelo. Use Bancada de banheiro ou Bancada de cozinha.", "aviso"); return false; }
      var op = this.opcoes(), r = MP().gerar(bs, op), self = this, soMarm = !!(MOD() && MOD().soMarmoraria());
      this._ultimo = { r: r, bs: bs, op: op };
      var h = '<div data-modal-largo style="font-size:12.5px;max-height:72vh;overflow:auto">';
      h += '<div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap"><button class="btn" data-marm="pdf">PDF das folhas</button><button class="btn" data-marm="dxf">DXF das folhas</button><button class="btn primary" data-marm="orcamentoDoExecutivo">Orçamento e proposta</button></div>';
      r.folhas.forEach(function (f) { h += '<div style="border:1px solid #ccc;margin:6px 0;background:#fff">' + f.svg.replace(/width="\d+mm" height="\d+mm"/, 'width="100%" height="auto"') + "</div>"; });
      /* o orçamento de referência (SINAPI conferida, composição própria, catálogo) é da obra, no OrçaPRO completo; quem tem só
         o módulo usa a tabela dele (Orçamento e proposta) — mostrar a SINAPI aqui confundiria o preço DELE com o de referência */
      if (!soMarm) {
        var orc = bs.map(function (b) { return { b: b, o: MM().orcamento(b.def) }; }), tot = 0;
        orc.forEach(function (x) {
          h += "<h4 style=\"margin:12px 0 4px\">Orçamento de referência — " + esc(x.b.rotulo) + " " + esc(x.b.nome) + "</h4><table class=\"tabela\" style=\"width:100%\"><tr><th>Código</th><th>Descrição</th><th>Un</th><th>Quant.</th><th>Unitário</th><th>Total</th></tr>";
          x.o.itens.forEach(function (i) { h += "<tr><td>" + esc(i.codigo) + "</td><td>" + esc(i.descricao) + '<div class="muted" style="font-size:11px">' + esc(i.fonte) + "</div>" + (i.provisorio ? '<div style="font-size:11px;color:#b45309;font-weight:600">' + esc(i.obs || "PREÇO PROVISÓRIO") + "</div>" : "") + "</td><td>" + esc(i.unidade) + "</td><td>" + esc(String(i.quantidade).replace(".", ",")) + "</td><td>" + brl(i.unitario) + "</td><td>" + brl(i.total) + "</td></tr>"; });
          h += "<tr><td></td><td><b>Total</b></td><td></td><td></td><td></td><td><b>" + brl(x.o.total) + "</b></td></tr></table>";
          tot += x.o.total;
        });
        h += "<p><b>Total de referência da marmoraria e metais: " + brl(tot) + "</b> (" + esc(orc[0].o.fonteSinapi) + ")</p>";
      }
      if (r.avisos.length) h += '<details><summary>Avisos (' + r.avisos.length + ")</summary><ul>" + r.avisos.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul></details>";
      h += "</div>";
      if (global.UI && UI.modal) {
        UI.modal("Executivo de marmoraria", h, [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
        setTimeout(function () { qa("[data-marm]").forEach(function (bt) { bt.onclick = function () { self[bt.getAttribute("data-marm")](); }; }); }, 0);
      }
      return r;
    },
    orcamentoDoExecutivo: function () { return this.porta("orcamento", this.orcamento.bind(this)); },
    pdf: function () {
      var u = this._ultimo; if (!u) return;
      var html = MP().htmlImpressao(u.r.folhas, "Executivo de marmoraria", { imprimir: true }), w = global.open("", "_blank");
      if (w && !w.closed) { w.document.open(); w.document.write(html); w.document.close(); } else baixar("Executivo de marmoraria.html", html, "text/html");
    },
    dxf: function () {
      var u = this._ultimo; if (!u) return;
      var g = MP().dxf(u.r, u.op), arqs = g.arquivos || [];
      if (global.BimBcf && BimBcf.zipEscrever && arqs.length > 1) { var o = {}; arqs.forEach(function (a) { o[a.nome] = a.texto; }); baixar("Executivo de marmoraria - DXF.zip", BimBcf.zipEscrever(o), "application/zip"); }
      else arqs.forEach(function (a) { baixar(a.nome, a.texto, "application/dxf"); });
      toast("DXF gerado. Para DWG: abra no AutoCAD e salve como DWG.", "ok");
    },

    /* ------------------------------------------------------------ TABELA DE PREÇOS */
    precos: function (foco) {
      var P = PR(), t = P.tabela(), L = P.linhas(t), self = this, grupos = {}, ordem = [];
      L.forEach(function (l) { if (!grupos[l.grupo]) { grupos[l.grupo] = []; ordem.push(l.grupo); } grupos[l.grupo].push(l); });
      var p = t.param, M = P.MODOS;
      function sel(campo, modos, atual) { return '<select class="input" data-marm-par="' + campo + '"><option value="">— escolha —</option>' + Object.keys(modos).map(function (k) { return '<option value="' + k + '"' + (atual === k ? " selected" : "") + ">" + esc(modos[k]) + "</option>"; }).join("") + "</select>"; }
      function inp(campo, v, ph) { return '<input class="input" style="width:110px" inputmode="decimal" data-marm-par="' + campo + '" value="' + esc(vNum(v)) + '" placeholder="' + esc(ph || "") + '">'; }
      var h = '<div data-modal-largo style="font-size:12.5px;max-height:70vh;overflow:auto">';
      h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px"><button class="btn" data-marm-acao="exportar">Exportar planilha (.xlsx)</button><label class="btn" style="cursor:pointer">Importar planilha<input type="file" accept=".xlsx,.xls" data-marm-acao="importar" style="display:none"></label><button class="btn" data-marm-acao="novaPedra">Cadastrar pedra</button>' +
        '<span class="muted" style="align-self:center">Tudo começa vazio: o que não tiver preço aparece no orçamento como "preencha". Salva sozinho.</span></div>';
      h += '<h4 style="margin:8px 0 4px">Parâmetros do orçamento</h4><div style="display:grid;grid-template-columns:auto 1fr;gap:6px 12px;align-items:center">' +
        "<label>Instalação</label><div>" + sel("instalacaoModo", M.instalacao, p.instalacaoModo) + " " + inp("instalacaoValor", p.instalacaoValor, "R$") + "</div>" +
        "<label>Frete</label><div>" + sel("freteModo", M.frete, p.freteModo) + " " + inp("freteValor", p.freteValor, "R$ ou R$/km") + " " + inp("freteKm", p.freteKm, "km padrão") + "</div>" +
        "<label>Perda da chapa</label><div>" + sel("perdaModo", M.perda, p.perdaModo) + " " + inp("perdaPct", p.perdaPct, "%") + "</div>" +
        "<label>Margem / BDI (%)</label><div>" + inp("bdiPct", p.bdiPct, "%") + ' <span class="muted">0 se a margem já está nos preços</span></div>' +
        "<label>Desconto (%)</label><div>" + inp("descontoPct", p.descontoPct, "%") + "</div>" +
        "<label>Validade (dias)</label><div>" + inp("validadeDias", p.validadeDias, "dias") + "</div>" +
        "<label>Prazo de entrega (dias)</label><div>" + inp("prazoDias", p.prazoDias, "dias") + "</div>" +
        '<label>Condições de pagamento</label><div><input class="input" style="width:100%" data-marm-par="pagamento" value="' + esc(p.pagamento) + '" placeholder="ex.: 50% na aprovação e 50% na instalação"></div>' +
        '<label>Observações da proposta</label><div><input class="input" style="width:100%" data-marm-par="observacoes" value="' + esc(p.observacoes) + '"></div></div>';
      ordem.forEach(function (g) {
        var pedra = /^Pedras/.test(g);
        h += '<h4 style="margin:12px 0 4px">' + esc(g) + '</h4><table class="tabela" style="width:100%"><tr><th>Item</th><th>Un</th><th>' + (pedra ? "R$/m² (20 mm)" : "Preço (R$)") + "</th>" + (pedra ? "<th>R$/m² (30 mm)</th>" : "<th>Não fornecemos</th>") + "</tr>";
        grupos[g].forEach(function (l) {
          h += '<tr data-marm-linha="' + esc(l.id) + '"><td>' + esc(l.rotulo) + (l.sub ? ' <span class="muted" style="font-size:11px">' + esc(l.sub) + "</span>" : "") + "</td><td>" + esc(l.unidade) + "</td>" +
            '<td><input class="input" style="width:100px" inputmode="decimal" data-marm-campo="valor" value="' + esc(vNum(l.valor)) + '"' + (l.fora ? " disabled" : "") + "></td>" +
            (pedra ? '<td><input class="input" style="width:100px" inputmode="decimal" data-marm-campo="valor30" value="' + esc(vNum(l.valor30)) + '"></td>'
              : "<td>" + (l.podeFora ? '<input type="checkbox" data-marm-campo="fora"' + (l.fora ? " checked" : "") + ">" : "") + "</td>") + "</tr>";
        });
        h += "</table>";
      });
      h += "</div>";
      UI.modal("Tabela de preços da marmoraria", h, [{ texto: "Ver o orçamento", classe: "primary", onClick: function () { UI.fecharModal(); self.porta("orcamento", function () { return self.orcamento(); }); } },
        { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
      setTimeout(function () { self._ligarPrecos(foco); }, 0);
      return true;
    },
    _ligarPrecos: function (foco) {
      var P = PR(), self = this;
      qa("[data-marm-linha] [data-marm-campo]").forEach(function (el) {
        el.addEventListener("change", function () {
          var tr = el.closest("[data-marm-linha]"), id = tr.getAttribute("data-marm-linha"), t = P.tabela(), reg = JSON.parse(JSON.stringify(t.linhas[id] || { id: id, tipo: /^pedra/.test(id) ? "pedra" : "servico" }));
          var c = el.getAttribute("data-marm-campo");
          if (c === "fora") { reg.fora = !!el.checked; var vi = tr.querySelector('[data-marm-campo="valor"]'); if (vi) vi.disabled = reg.fora; }
          else { var v = P.numU(el.value); if (el.value.trim() && (v == null || v < 0)) { toast("Preço inválido: use número (ex.: 450,00).", "aviso"); el.value = vNum(reg[c]); return; } reg[c] = v; }
          var r = P.gravar(reg); if (!r.ok) toast("Não salvou: " + r.motivo, "erro"); else self._salvo();
        });
      });
      qa("[data-marm-par]").forEach(function (el) {
        el.addEventListener("change", function () {
          var t = P.tabela(), reg = JSON.parse(JSON.stringify(t.param)), c = el.getAttribute("data-marm-par");
          if (el.tagName === "SELECT" || c === "pagamento" || c === "observacoes") reg[c] = el.value;
          else { var v = P.numU(el.value); if (el.value.trim() && (v == null || v < 0)) { toast("Valor inválido: use número.", "aviso"); el.value = vNum(reg[c]); return; } reg[c] = v; }
          reg.id = P.PARAM_ID; reg.tipo = "param";
          var r = P.gravar(reg); if (!r.ok) toast("Não salvou: " + r.motivo, "erro"); else self._salvo();
        });
      });
      var ex = q('[data-marm-acao="exportar"]'); if (ex) ex.onclick = function () { self.exportarXlsx(); };
      var im = q('[data-marm-acao="importar"]'); if (im) im.onchange = function () { if (im.files && im.files[0]) self.importarXlsx(im.files[0]); };
      var np = q('[data-marm-acao="novaPedra"]'); if (np) np.onclick = function () { self.novaPedra(); };
      if (foco) {
        var alvo = foco.campo && foco.chave === "_param" ? q('[data-marm-par="' + foco.campo + '"]') : q('[data-marm-linha="' + (global.CSS && CSS.escape ? CSS.escape(foco.chave) : foco.chave) + '"] [data-marm-campo="' + (foco.campo || "valor") + '"]');
        if (alvo) { try { alvo.scrollIntoView({ block: "center" }); } catch (e) {} alvo.focus(); alvo.style.outline = "2px solid #c00000"; }
      }
    },
    _salvo: function () { status("Tabela de preços salva."); },
    novaPedra: function () {
      var P = PR(), self = this;
      var h = '<div style="display:grid;grid-template-columns:auto 1fr;gap:8px 12px;align-items:center;font-size:13px">' +
        '<label>Nome comercial</label><input id="marm-np-nome" class="input" placeholder="ex.: Branco Itaúnas">' +
        '<label>Tipo</label><select id="marm-np-tipo" class="input"><option value="granito">Granito</option><option value="marmore">Mármore</option><option value="quartzo">Quartzo</option><option value="sinterizado">Sinterizado / porcelanato</option></select>' +
        '<label>Cor (para o 3D)</label><input id="marm-np-cor" type="color" value="#8a8580">' +
        '<label>Chapa (mm)</label><div><input id="marm-np-cl" class="input" style="width:90px" placeholder="comprimento"> × <input id="marm-np-cp" class="input" style="width:90px" placeholder="largura"></div>' +
        '<label>R$/m² (20 mm)</label><input id="marm-np-v" class="input" inputmode="decimal"><label>R$/m² (30 mm)</label><input id="marm-np-v30" class="input" inputmode="decimal"></div>';
      UI.modal("Cadastrar pedra", h, [{ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); self.precos(); } },
        { texto: "Cadastrar", classe: "primary", onClick: function () {
          var nome = txt(q("#marm-np-nome").value).trim(); if (!nome) { toast("Dê o nome comercial da pedra.", "aviso"); return; }
          var r = P.novaPedra(nome, { tipoPedra: q("#marm-np-tipo").value, cor: q("#marm-np-cor").value, chapaL: q("#marm-np-cl").value, chapaP: q("#marm-np-cp").value, valor: q("#marm-np-v").value, valor30: q("#marm-np-v30").value });
          var g = P.gravar(r); if (!g.ok) { toast("Não salvou: " + g.motivo, "erro"); return; }
          P.tabela(); UI.fecharModal(); toast("Pedra " + nome + " cadastrada — já aparece na lista de Pedra das Propriedades.", "ok"); self.precos();
        } }]);
    },
    exportarXlsx: function () {
      var P = PR(), pl = P.planilha(P.tabela()), em = empresa().d;
      if (!global.Excel || !Excel.ensureExcelJS) { toast("O gerador de planilha não carregou.", "erro"); return; }
      Excel.ensureExcelJS(function () {
        var wb = new global.ExcelJS.Workbook();
        pl.abas.forEach(function (a) {
          var ws = wb.addWorksheet(a.nome);
          a.linhas.forEach(function (l) { ws.addRow(l); });
          var c1 = ws.getRow(1); c1.font = { bold: true, color: { argb: "FFFFFFFF" } }; c1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5E5348" } };
          ws.views = [{ state: "frozen", ySplit: 1 }];
          ws.columns.forEach(function (c, i) { c.width = i === 0 ? 34 : (i === 2 || (a.nome === "Parâmetros" && i === 0) ? 46 : 18); });
          if (a.nome === "Preços") { ws.getColumn(5).numFmt = "#,##0.00"; ws.getColumn(6).numFmt = "#,##0.00"; ws.getColumn(1).hidden = false; }
        });
        wb.xlsx.writeBuffer().then(function (buf) { baixar(nomeArq("Tabela de preços - " + (em.nome || "marmoraria")) + ".xlsx", new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })); toast("Planilha exportada. Preencha a coluna Preço e importe de volta.", "ok"); });
      });
    },
    importarXlsx: function (arquivo) {
      var P = PR(), self = this;
      Excel.ensureSheetJS(function () {
        var fr = new FileReader();
        fr.onload = function () {
          var res = { registros: [], avisos: [] };
          try {
            var wb = global.XLSX.read(new Uint8Array(fr.result), { type: "array" });
            var abas = wb.SheetNames.map(function (n) { return { nome: n, linhas: global.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "", raw: true }) }; });
            res = P.daPlanilha(abas, P.tabela());
          } catch (e) { toast("Não consegui ler a planilha: " + e.message, "erro"); return; }
          var n = 0; res.registros.forEach(function (r) { var g = P.gravar(r); if (g.ok && !g.igual) n++; });
          P.tabela();
          UI.fecharModal(); self.precos();
          toast(n + " linha(s) atualizada(s)" + (res.avisos.length ? " · " + res.avisos.length + " aviso(s): " + res.avisos.slice(0, 2).join("; ") : ""), res.avisos.length ? "aviso" : "ok");
        };
        fr.readAsArrayBuffer(arquivo);
      });
    },

    /* ------------------------------------------------------------ ORÇAMENTO E PROPOSTA */
    _km: null,
    calcular: function () {
      var bs = this.bancadas(), t = PR().tabela();
      return { bs: bs, t: t, o: PR().orcar(bs, t, { km: this._km }) };
    },
    orcamento: function () {
      var c = this.calcular(), o = c.o, self = this;
      if (!c.bs.length) { toast("Nenhuma bancada de pedra no modelo. Use Ambiente pelas medidas e depois Bancada de banheiro ou de cozinha.", "aviso"); return false; }
      this._ultOrc = c;
      var h = '<div data-modal-largo style="font-size:12.5px;max-height:70vh;overflow:auto">';
      if (o.pendencias.length) {
        h += '<div style="border:1px solid #f0b4b4;background:#fff5f5;border-radius:6px;padding:8px 10px;margin-bottom:10px"><b style="color:#a40000">Falta preencher ' + o.pendencias.length + " item(ns) da sua tabela de preços</b> — sem eles o total não fecha (nenhum preço é inventado).<ul style=\"margin:6px 0 0 16px;padding:0\">" +
          o.pendencias.map(function (p, i) { return "<li style=\"margin:3px 0\">" + esc(p.texto) + (p.bancadas.length ? ' <span class="muted">(' + esc(p.bancadas.join(", ")) + ")</span>" : "") +
            ' <button class="btn sm" data-marm-pend="corrigir" data-n="' + i + '">Corrigir</button>' + (p.bancadas.length ? ' <button class="btn sm ghost" data-marm-pend="ver" data-n="' + i + '">Mostrar no 3D</button>' : "") + "</li>"; }).join("") + "</ul></div>";
      }
      /* perda pela chapa inteira com aproveitamento baixo: o aviso fica no topo (é dinheiro do cliente dele) */
      if (o.avisos && o.avisos.length) h += '<div data-marm-aviso style="border:1px solid #f3c77a;background:#fff8e6;border-radius:6px;padding:8px 10px;margin-bottom:10px;color:#7a4b00">' + o.avisos.map(esc).join("<br>") + "</div>";
      o.bancadas.forEach(function (b) {
        h += '<h4 style="margin:10px 0 4px">' + esc(b.rotulo) + " — " + esc(b.nome) + ' <button class="btn sm ghost" data-marm-ver="' + esc(b.rotulo) + '">Mostrar no 3D</button></h4><div class="muted">' + esc(b.pedra) + ", " + br(b.L) + " × " + br(b.P) + " m, e = " + Math.round(b.e * 1000) + " mm, " + br(b.m2, 3) + " m²</div>" +
          '<table class="tabela" style="width:100%"><tr><th>Item</th><th>Un</th><th>Quant.</th><th>Unitário</th><th>Total</th></tr>' +
          b.itens.map(function (it) { var qq = it.quantidadeCobrada != null ? it.quantidadeCobrada : it.quantidade; return "<tr><td>" + esc(it.descricao) + (it.obs ? ' <span class="muted">(' + esc(it.obs) + ")</span>" : "") + "</td><td>" + esc(it.unidade === "m2" ? "m²" : it.unidade) + "</td><td>" + br(qq, it.unidade === "un" ? 0 : 3) + "</td><td>" + (it.pendente ? '<b style="color:#c00000">preencha</b>' : brl(it.unitario)) + "</td><td>" + (it.pendente ? "—" : brl(it.total)) + "</td></tr>"; }).join("") +
          "<tr><td><b>Total " + esc(b.rotulo) + "</b></td><td></td><td></td><td></td><td><b>" + brl(b.total) + "</b></td></tr></table>";
      });
      var km = o.frete && o.frete.modo === "km" ? ' <label>distância desta obra (km) <input class="input" style="width:80px" data-marm-km value="' + esc(vNum(this._km != null ? this._km : o.param.freteKm)) + '"></label>' : "";
      h += '<h4 style="margin:12px 0 4px">Resumo</h4><table class="tabela" style="width:100%"><tr><td>Bancadas</td><td style="text-align:right">' + brl(o.subtotal) + "</td></tr>" +
        "<tr><td>" + esc(o.frete.texto || "Frete") + km + '</td><td style="text-align:right">' + brl(o.frete.valor) + "</td></tr>" +
        "<tr><td>Margem / BDI (" + br(o.bdiPct, 1) + ' %)</td><td style="text-align:right">' + brl(o.bdiValor) + "</td></tr>" +
        (o.descontoValor ? "<tr><td>Desconto (" + br(o.descontoPct, 1) + ' %)</td><td style="text-align:right">− ' + brl(o.descontoValor) + "</td></tr>" : "") +
        "<tr><td><b>Total" + (o.completo ? "" : " (parcial — faltam preços)") + '</b></td><td style="text-align:right"><b>' + brl(o.total) + "</b></td></tr></table>";
      if (o.plano && o.plano.length) h += '<p class="muted">Plano de chapa: ' + o.plano.map(function (g) { return esc(g.pedra) + " " + (g.ok ? g.nChapas + " chapa(s), aproveitamento " + br(g.aproveitamento, 1) + " %" : "não fechou"); }).join(" · ") + "</p>";
      if (o.naoIncluso.length) h += '<p class="muted">Não incluso (marcado na tabela): ' + esc(o.naoIncluso.join(", ")) + "</p>";
      h += "</div>";
      UI.modal("Orçamento da marmoraria", h, [
        { texto: "Gerar proposta (PDF)", classe: "primary", onClick: function () { self.porta("proposta", function () { return self.proposta(); }); } },
        { texto: "Tabela de preços", classe: "", onClick: function () { UI.fecharModal(); self.precos(); } },
        { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
      setTimeout(function () {
        qa("[data-marm-pend]").forEach(function (bt) { bt.onclick = function () { var p = o.pendencias[Number(bt.getAttribute("data-n"))]; if (!p) return; if (bt.getAttribute("data-marm-pend") === "ver") self.mostrar3d(p.bancadas[0]); else { UI.fecharModal(); self.precos({ chave: p.chave, campo: p.campo }); } }; });
        qa("[data-marm-ver]").forEach(function (bt) { bt.onclick = function () { self.mostrar3d(bt.getAttribute("data-marm-ver")); }; });
        var k = q("[data-marm-km]"); if (k) k.onchange = function () { self._km = PR().numU(k.value); self.orcamento(); };
      }, 0);
      return o;
    },
    /* o logo do cadastro (PNG/JPEG em data URI) → JPEG para o PDF (fundo branco) */
    _logoJpeg: function (cb) {
      var lg = empresa().logo, d = global.document;
      if (!lg || !d) { cb(null); return; }
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, k = Math.min(1, 600 / Math.max(w, h)), cv = d.createElement("canvas");
          cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
          var cx = cv.getContext("2d"); cx.fillStyle = "#ffffff"; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
          var url = cv.toDataURL("image/jpeg", 0.9);
          cb({ jpeg: url.split(",")[1], pxW: cv.width, pxH: cv.height, dataURI: url });
        } catch (e) { cb(null); }
      };
      img.onerror = function () { cb(null); };
      img.src = lg;
    },
    /* os dados da proposta + o número (idempotente: a mesma obra mantém o mesmo número) */
    dadosProposta: function (o) {
      var em = empresa(), ob = obra(), P = PR(), eid = P._eid(), lista = [];
      try { lista = arr(Store.listar(eid, P.ENT_PROPOSTAS)); } catch (e) {}
      var nr = P.numeroProposta(lista, ob.id || "", Date.now());
      return { empresa: em.d, cliente: ob.clienteNome || ob.cliente || "", obra: ob.nome || "", local: ob.endereco || ob.local || "", numero: nr.numero, idProposta: nr.id, obraId: ob.id || "", data: new Date().toISOString().slice(0, 10), param: o.param,
        credito: (global.Empresa && Empresa.docsCfg && Empresa.docsCfg().creditos && Empresa.creditoTexto) ? Empresa.creditoTexto() : "" };
    },
    gerarPdf: function (cb) {
      var c = this.calcular(), self = this;
      if (!c.bs.length) { toast("Nenhuma bancada de pedra no modelo.", "aviso"); cb(null); return; }
      var d = this.dadosProposta(c.o), anexos = [];
      try { anexos = MP().gerar(c.bs, this.opcoes()).folhas.map(function (f) { return f.svg; }); } catch (e) {}
      this._logoJpeg(function (logo) {
        d.logo = logo;
        var r = PP().pdf(c.o, d, anexos);
        r.numero = d.numero; r.dados = d; r.orc = c.o;
        /* registro da proposta: um por obra (gerar de novo atualiza o mesmo, com o total de agora) */
        try {
          var P = PR(); Store.salvar(P._eid(), P.ENT_PROPOSTAS, { id: d.idProposta, obraId: d.obraId, numero: d.numero, cliente: d.cliente, total: c.o.total, completo: c.o.completo, bancadas: c.bs.length, geradaEm: new Date().toISOString() });
        } catch (e2) {}
        self._ultPdf = r;
        cb(r);
      });
    },
    proposta: function () {
      var self = this;
      this.gerarPdf(function (r) {
        if (!r || !r.ok) { if (r) toast("A proposta não foi gerada: " + r.motivo, "erro"); return; }
        baixar(nomeArq("Proposta " + r.numero + (r.dados.cliente ? " - " + r.dados.cliente : "")) + ".pdf", new Blob([r.bytes], { type: "application/pdf" }));
        if (r.placeholders.length) toast("Proposta " + r.numero + " gerada com " + r.placeholders.length + " campo(s) em vermelho para completar: " + r.placeholders.slice(0, 4).join(", ") + (r.placeholders.length > 4 ? "…" : "") + ". Complete em ⚙ Empresa e na Tabela de preços.", "aviso");
        else toast("Proposta " + r.numero + " gerada (" + r.paginas + " páginas, executivo anexo).", "ok");
        try { if (global.Auditoria && Auditoria.registrar) Auditoria.registrar("marmoraria", "proposta", { numero: r.numero, total: r.orc.total }); } catch (e) {}
      });
      return true;
    }
  };
  /* ⚠ A TRAVA NA FUNÇÃO DE VERDADE (revisão 21/10/2026): antes só os comandos registrados na fita passavam pela
     porta — `MarmorariaUI.proposta()`, `.orcamento()`, `.precos()` ou `.exportarXlsx()` chamados direto (console,
     atalho, outro módulo) rodavam sem licença e geravam a proposta com a marca da empresa. Agora cada função pública
     que faz trabalho do módulo é embrulhada pela porta (chamada interna já liberada passa direto: a porta é barata).
     tools/test-marmoraria-modulo.js [a3] reprova se alguma delas rodar sem licença. */
  var PUBLICAS = ["colocar", "ambiente", "criarAmbiente", "executivo", "pdf", "dxf", "precos", "novaPedra", "exportarXlsx", "importarXlsx", "orcamento", "gerarPdf", "proposta"];
  var SAIDAS = { pdf: 1, dxf: 1, exportarXlsx: 1, gerarPdf: 1, proposta: 1 };
  /* licença do OrçaPRO suspensa (parcela vencida, js/cobranca.js) ou teste vencido: o mesmo gate de sempre
     (App._trialBloqueado) — nada exporta. A vitrine (?demo=1) nunca bloqueia, como no resto do app. */
  function saidaBloqueada() { try { return !!(global.App && App._trialBloqueado && App._trialBloqueado()); } catch (e) { return false; } }
  function demoBloqueio(M) {
    var e = null; try { e = M.estado(); } catch (x) {}
    var t = (e && e.teste) || {};
    return { ok: false, demo: true, oferta: M.OFERTA, motivo: "Na demonstração você modela e vê o orçamento na tela; a proposta em PDF, a planilha e o executivo (PDF/DXF) saem com o teste de 7 dias ou com o módulo.",
      podeTestar: !!t.disponivel && !(e && e.play), testeEncerrado: !!t.encerrado };
  }
  MarmorariaUI.PUBLICAS = PUBLICAS;
  MarmorariaUI.SAIDAS = Object.keys(SAIDAS);
  PUBLICAS.forEach(function (nome) {
    var orig = MarmorariaUI[nome];
    if (typeof orig !== "function") return;
    MarmorariaUI[nome] = function () {
      var self = this, args = arguments, cb = typeof args[args.length - 1] === "function" ? args[args.length - 1] : null;
      var M = MOD(), g = M ? M.guarda(nome) : { ok: false, motivo: "módulo não carregado" };
      if (!g.ok) { self.oferta(g); if (cb && nome === "gerarPdf") cb(null); return false; }
      /* VITRINE (?demo=1) — decisão do Rogério, 21/10/2026: "demo modela, mas não exporta". Na vitrine modela-se e o
         orçamento aparece NA TELA; proposta (PDF), planilha (.xlsx) e o PDF/DXF do executivo NÃO saem — senão a
         vitrine vira licença grátis (as tabelas ficam salvas no aparelho). Aviso com o teste de 7 dias / contato. */
      if (SAIDAS[nome] && g.motivo === "demo") { self.oferta(demoBloqueio(M)); if (cb && nome === "gerarPdf") cb(null); return false; }
      if (SAIDAS[nome] && saidaBloqueada()) { try { if (App._avisoTrial) App._avisoTrial(); } catch (e) {} if (cb && nome === "gerarPdf") cb(null); return false; }
      return orig.apply(self, args);
    };
  });
  global.MarmorariaUI = MarmorariaUI;
  if (typeof module !== "undefined" && module.exports) module.exports = MarmorariaUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
