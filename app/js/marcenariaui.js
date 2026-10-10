/* =====================================================================
 * marcenariaui.js — a TELA da CARPINTARIA & MARCENARIA (OrçaPRO Modela)
 *
 * Fiação fina: o motor é o js/marcenaria.js (módulos, explosão, plano de
 * corte, carpintaria) e os arquivos saem do js/marcenariasaida.js. Aqui:
 *   · a FITA da disciplina "marcenaria" (BimRibbon.acrescentar):
 *       Módulos       — Inserir módulo, Editar módulo, Explodir em peças
 *       Chapas e fitas — o catálogo (chapas, fitas, serra, refilo, furação)
 *       Corte         — Plano de corte, Planilha, Cortecloud, CSV, DXF CNC,
 *                       Etiquetas, Ferragens
 *       Carpintaria   — Pergolado, Deck, Tesoura, Lista de corte (serradas)
 *   · o módulo vai para o modelo como FAMÍLIA (op "familia" de sempre: desfaz
 *     com Ctrl+Z, aparece em Propriedades, vai no IFC como IfcFurniture);
 *   · catálogo e perfil do CSV ficam NESTE aparelho (localStorage).
 * Sem o modelador (js/bimprevia.js) — ou com a disciplina desligada — nada
 * daqui aparece: quem chama `registrar` é o js/bimarqui.js.
 * ===================================================================== */
(function (global) {
  "use strict";
  var CHAVE_CAT = "orcapro:marcenaria:catalogo:v1", CHAVE_CSV = "orcapro:marcenaria:perfilcsv:v1";
  function MC() { return global.Marcenaria; }
  function MS() { return global.MarcenariaSaida; }
  function B() { return global.BIM || null; }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var n = parseFloat(txt(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function esc(s) { return txt(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function br(v, c) { return (Math.round(num(v, 0) * Math.pow(10, c || 0)) / Math.pow(10, c || 0)).toString().replace(".", ","); }
  function toast(m, t) { try { if (global.UI && UI.toast) UI.toast(m, t || "ok"); } catch (e) {} }
  function status(t) { try { if (global.BimShell && BimShell.status) BimShell.status(t); } catch (e) {} }
  function modal(t, h, bts) { return global.UI && UI.modal ? UI.modal(t, h, bts) : null; }
  function fechar() { try { UI.fecharModal(); } catch (e) {} }
  function q(sel) { return document.querySelector(sel); }
  function ler(k) { try { var v = global.localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function gravar(k, v) { try { global.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  /* o catálogo do aparelho entra ANTES de qualquer família ser desenhada */
  (function () { var c = ler(CHAVE_CAT); if (c && MC()) { var r = MC().definirCatalogo(c); if (!r.ok) try { console.warn("catálogo de marcenaria do aparelho recusado: " + r.erros.join("; ")); } catch (e) {} } })();

  var MarcenariaUI = {
    _ultimoArquivo: null,
    ativo: function () { return !!(MC() && MC().disciplinaLigada()); },

    /* --------------------------------------------------------- a fita */
    registrar: function (reg, arqui, opts) {
      var on = opts && opts.ativo != null ? !!opts.ativo : this.ativo(), R = global.BimRibbon, self = this;
      if (!on || !R || !reg || !MC()) return false;
      var A = "marcenaria", AR = "Carpintaria & Marcenaria";
      R.acrescentar(A, AR, "Módulos", [
        { id: "marc-inserir", rotulo: "Inserir\nmódulo", icone: "familia", grande: true, dica: "Armário aéreo, balcão, gaveteiro, roupeiro, prateleira, painel ripado ou nicho: escolha as medidas, a chapa, portas, gavetas e prateleiras e clique no modelo. O módulo já nasce com as peças, a fita e a furação." },
        { id: "marc-editar", rotulo: "Editar\nmódulo", icone: "editar", grande: true, dica: "Muda as medidas, as chapas e o interior de um módulo já colocado (desfaz com Ctrl+Z)." },
        { id: "marc-explodir", rotulo: "Explodir\nem peças", icone: "lista", grande: true, dica: "Lista cada peça dos módulos do modelo: comprimento (sentido do veio) × largura × espessura, fita por lado (C1, C2, L1, L2), furos e usinagens, e as ferragens." }
      ]);
      R.acrescentar(A, AR, "Chapas e fitas", [
        { id: "marc-catalogo", rotulo: "Chapas e\nfitas", icone: "camadas", grande: true, dica: "O catálogo deste aparelho: chapas (MDF, MDP, compensado, tamanho e veio), fitas de borda, espessura da serra, refilo e a furação (dobradiça, minifix, cavilha). Tudo é valor de partida: ajuste ao que você compra." }
      ]);
      R.acrescentar(A, AR, "Corte", [
        { id: "marc-plano", rotulo: "Plano de\ncorte", icone: "corte", grande: true, dica: "Otimiza o corte das peças nas chapas (guilhotina, serra e refilo, peça com veio não gira): chapas por material, aproveitamento de cada uma e metros de fita. Baixa o PDF com o desenho de cada chapa." },
        { id: "marc-planilha", rotulo: "Planilha\n.xlsx", icone: "planilha", grande: true, dica: "A lista de corte para a empresa de corte: peça, comprimento (veio), largura, espessura, quantidade, material, veio, fita C1/C2/L1/L2, observação e módulo — mais ferragens, fitas e plano." },
        { id: "marc-cortecloud", rotulo: "Cortecloud", icone: "exportar", dica: "Planilha sem cabeçalho na ordem de importação: quantidade, comprimento, largura, função, fita e material." },
        { id: "marc-csv", rotulo: "CSV", icone: "tabela", dica: "CSV com a ordem das colunas e o separador que você escolher (fica gravado). Para o Corte Certo e outros." },
        { id: "marc-dxf", rotulo: "DXF CNC", icone: "regua", dica: "DXF em milímetros, 1:1: contorno e furos/usinagens em camadas com a ferramenta e a profundidade no nome (FURO_35_PROF_12…). Uma peça por arquivo (.zip) ou todas lado a lado." },
        { id: "marc-etiquetas", rotulo: "Etiquetas", icone: "nota", dica: "PDF A4 com uma etiqueta por peça: código, módulo, medidas, material, fita por lado e o QR do código." },
        { id: "marc-ferragens", rotulo: "Ferragens", icone: "checklist", dica: "Dobradiças, corrediças, puxadores, minifix, cavilhas e parafusos dos módulos do modelo, com quantidade." }
      ]);
      R.acrescentar(A, AR, "Carpintaria", [
        { id: "marc-pergolado", rotulo: "Pergolado", icone: "estrutura", grande: true, dica: "Pergolado de madeira serrada (pilares, vigas, caibros) — vira lista de corte. Seções de partida: confira pela NBR 7190." },
        { id: "marc-deck", rotulo: "Deck", icone: "grade", grande: true, dica: "Deck: barrotes e tábuas com junta; tábua maior que a barra emenda sobre o barrote." },
        { id: "marc-tesoura", rotulo: "Tesoura", icone: "telhado", grande: true, dica: "Tesoura simples (linha, pernas, pendural, escoras) com o ângulo de corte de cada ponta." },
        { id: "marc-serradas", rotulo: "Lista de\ncorte", icone: "lista", grande: true, dica: "As peças serradas do modelo (carpintaria e as peças de madeira da biblioteca): seção, comprimento, cortes, espécie, volume — e quantas barras comprar." }
      ]);
      var ids = ["marc-inserir", "marc-editar", "marc-explodir", "marc-catalogo", "marc-plano", "marc-planilha", "marc-cortecloud", "marc-csv", "marc-dxf", "marc-etiquetas", "marc-ferragens", "marc-pergolado", "marc-deck", "marc-tesoura", "marc-serradas"];
      if (global.BimDisciplinas && typeof global.BimDisciplinas.declarar === "function") { try { global.BimDisciplinas.declarar(ids, "marcenaria"); } catch (e) {} }
      ids.forEach(function (k) { if (R._EXCLUSIVOS && R._EXCLUSIVOS.indexOf(k) < 0) R._EXCLUSIVOS.push(k); });
      /* a BARRA de abas da casca (js/bimshell.js _abas) pode ter sido desenhada antes deste
         registro: a casca ressincroniza a barra (BimShell._sincAbas — o mesmo mecanismo da
         troca de disciplina, que respeita o filtro). O e2e-cara-nova conta as abas. */
      setTimeout(function () {
        try { var sh = global.BimShell; if (sh && sh._raiz && typeof sh._sincAbas === "function") sh._sincAbas(); } catch (e) {}
      }, 0);
      reg["marc-inserir"] = function () { return self.inserir(); };
      reg["marc-editar"] = function () { return self.editar(); };
      reg["marc-explodir"] = function () { return self.explodir(); };
      reg["marc-catalogo"] = function () { return self.catalogo(); };
      reg["marc-plano"] = function () { return self.plano(); };
      reg["marc-planilha"] = function () { return self.baixarPlanilha(); };
      reg["marc-cortecloud"] = function () { return self.baixarCortecloud(); };
      reg["marc-csv"] = function () { return self.csv(); };
      reg["marc-dxf"] = function () { return self.dxf(); };
      reg["marc-etiquetas"] = function () { return self.etiquetas(); };
      reg["marc-ferragens"] = function () { return self.ferragens(); };
      reg["marc-pergolado"] = function () { return self.carpintaria("pergolado"); };
      reg["marc-deck"] = function () { return self.carpintaria("deck"); };
      reg["marc-tesoura"] = function () { return self.carpintaria("tesoura"); };
      reg["marc-serradas"] = function () { return self.serradas(); };
      return true;
    },

    /* ---------------------------------------------------- o modelo */
    estado: function () { var b = B(), e = b && b.editarEstado ? b.editarEstado() : null; return e ? e.estado : null; },
    avaliar: function (famId, tipoId, inst) {
      var b = B(); if (b && b.familiaAvaliar) { var a = b.familiaAvaliar(famId, tipoId, inst); if (a) return a; }
      var f = global.FamiliasMarcenaria && FamiliasMarcenaria.obter(famId, true); if (f && global.Familia) return Familia.avaliar(f, tipoId, inst);
      var r = global.FamiliasRA && FamiliasRA.obter(famId, true); return r && global.Familia ? Familia.avaliar(r, tipoId, inst) : null;
    },
    modulosNoModelo: function () { var st = this.estado(); return arr(st && st.familias).filter(function (f) { return FamiliasMarcenaria.ehMarcenaria(f.famId); }); },
    projeto: function () { var st = this.estado(), self = this; return MC().doModelo(arr(st && st.familias), function (a, b, c) { return self.avaliar(a, b, c); }); },
    _semNada: function (p) {
      if (p.pecas.length || p.serradas.length) return false;
      toast("Nenhum módulo de marcenaria no modelo ainda. Use Inserir módulo (ou Pergolado, Deck, Tesoura).", "aviso"); return true;
    },
    _sincronizar: function () { try { if (global.FamiliaUI && FamiliaUI._sincronizarVisor) FamiliaUI._sincronizarVisor(); else if (B() && B().familiasDefinir) B().familiasDefinir(FamiliasMarcenaria.lista()); } catch (e) {} },
    _selecionado: function () {
      var ids = [], b = B();
      try { var p = b && b.precisao ? b.precisao() : null; if (p) ids = p.selecao().map(String); } catch (e) {}
      try { var u = global.Gestao && Gestao._bimSelecao && Gestao._bimSelecao.uid; if (!ids.length && u && /^edit:/.test(u)) ids = [String(u).slice(5)]; } catch (e) {}
      var mods = this.modulosNoModelo();
      for (var i = 0; i < ids.length; i++) for (var j = 0; j < mods.length; j++) if (mods[j].id === ids[i]) return mods[j];
      return null;
    },

    /* --------------------------------------------- inserir / editar */
    _form: function (m, tipoFam, editando) {
      var M = MC(), cat = M.catalogo(), fam = FamiliasMarcenaria.obter("ra-marc-" + m.tipo.replace("_", "-"), true);
      function sel(k, ops, v) { return '<select data-mc="' + k + '">' + ops.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>"; }
      function campo(rot, html, so) { return '<div class="field" style="margin-bottom:8px"' + (so ? ' data-so="' + so + '"' : "") + "><label>" + rot + "</label>" + html + "</div>"; }
      function n(k, v, passo) { return '<input data-mc="' + k + '" type="number" step="' + (passo || 1) + '" value="' + esc(v) + '">'; }
      var chapas = cat.chapas.map(function (c) { return [c.id, c.nome + (c.veio ? " (veio)" : "")]; });
      var caixa = m.tipo !== "prateleira" && m.tipo !== "painel_ripado";
      var h = '<div data-modal-largo style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 14px;font-size:12.5px">';
      h += campo("Módulo", editando ? "<b>" + esc(M.TIPOS_MODULO[m.tipo]) + "</b>" : sel("tipo", Object.keys(M.TIPOS_MODULO).map(function (k) { return [k, M.TIPOS_MODULO[k]]; }), m.tipo));
      h += campo("Ponto de partida", editando ? "<span class=\"muted\">o módulo colocado</span>" : sel("tipoFam", arr(fam && fam.tipos).map(function (t) { return [t.id, t.nome]; }), tipoFam));
      h += campo("Ambiente", '<input data-mc="ambiente" value="' + esc(m.ambiente) + '" placeholder="Cozinha, quarto…">');
      h += campo("Largura (mm)", n("L", m.L)) + campo(m.tipo === "prateleira" ? "Espessura (vale a da chapa)" : "Altura (mm)", n("H", m.H)) + (m.tipo === "painel_ripado" ? "" : campo("Profundidade da caixa (mm)", n("P", m.P)));
      h += campo("Altura da base do piso (mm)", n("cota", m.cota)) + campo("Chapa da caixa", sel("chapa", chapas, m.chapa));
      if (caixa) {
        h += campo("Chapa das portas e frentes", sel("chapaFrente", chapas, m.chapaFrente));
        h += campo("Fundo", sel("fundo", [["encaixado", "Encaixado no canal"], ["sobreposto", "Sobreposto (pregado atrás)"], ["sem", "Sem fundo"]], m.fundo));
        h += campo("Chapa do fundo", sel("chapaFundo", chapas, m.chapaFundo));
        h += campo("Montagem", sel("montagem", [["lateral_passante", "Lateral passante"], ["tampo_passante", "Tampo passante"]], m.montagem));
        h += campo("Em cima", sel("tampo", [["inteiro", "Tampo inteiro"], ["travessas", "2 travessas (bancada por cima)"]], m.tampo));
        h += campo("Rodapé", sel("rodape", [["sem", "Sem"], ["soculo", "Sóculo"], ["pes", "Pés reguláveis"]], m.rodape));
        h += campo("Portas", n("portas", m.portas)) + campo("Tipo de porta", sel("tipoPorta", [["giro", "De giro (dobradiça de caneco)"], ["correr", "De correr"]], m.tipoPorta));
        h += campo("Uma porta: dobradiças", sel("abertura", [["esquerda", "À esquerda"], ["direita", "À direita"]], m.abertura));
        h += campo("Gavetas", n("gavetas", m.gavetas)) + campo("Prateleiras por vão", n("prateleiras", m.prateleiras));
        h += campo("Prateleira", sel("prateleiraMovel", [["sim", "Regulável (pino)"], ["nao", "Fixa"]], m.prateleiraMovel === false || m.prateleiraMovel === "nao" ? "nao" : "sim"));
        h += campo("Divisórias", n("divisorias", m.divisorias)) + campo("Cabideiro", sel("cabideiro", [["nao", "Não"], ["sim", "Sim"]], m.cabideiro === true || m.cabideiro === "sim" ? "sim" : "nao"));
        h += campo("Puxador", sel("puxador", [["barra", "Barra"], ["botao", "Botão"], ["perfil", "Perfil de alumínio"], ["sem", "Sem (toque)"]], m.puxador)) + campo("Puxador: entre furos (mm)", n("entreFuros", m.entreFuros));
        h += campo("Ligação da caixa", sel("ligacao", [["minifix", "Minifix + cavilha"], ["cavilha", "Só cavilha (colada)"], ["parafuso", "Parafuso"]], m.ligacao));
        h += campo("Folga entre portas (mm)", n("folga", m.folga, 0.5));
      }
      if (m.tipo === "painel_ripado") h += campo("Chapa das ripas", sel("chapaRipa", chapas, m.chapaRipa)) + campo("Largura da ripa (mm)", n("ripaLargura", m.ripaLargura)) + campo("Vão entre ripas (mm)", n("ripaEspaco", m.ripaEspaco));
      h += '</div><div data-mc="resumo" style="margin-top:6px;font-size:12.5px;line-height:1.5"></div>' +
        '<p class="muted" style="font-size:11.5px;margin:6px 0 0">Medidas em mm. Folgas, furação e fita padrão vêm do catálogo (Chapas e fitas) — valores de partida, editáveis.</p>';
      return h;
    },
    _lerForm: function (m0) {
      var m = JSON.parse(JSON.stringify(m0));
      Array.prototype.slice.call(document.querySelectorAll("[data-mc]")).forEach(function (el) {
        var k = el.getAttribute("data-mc"); if (k === "resumo" || k === "tipo" || k === "tipoFam") return;
        if (el.type === "number") m[k] = num(el.value, m[k]); else m[k] = el.value;
      });
      m.prateleiraMovel = m.prateleiraMovel !== "nao"; m.cabideiro = m.cabideiro === "sim";
      return m;
    },
    _resumo: function (m) {
      var r = MC().explodir(m), el = q('[data-mc="resumo"]'); if (!el) return r;
      if (!r.ok) { el.innerHTML = '<span style="color:var(--perigo,#b91c1c)">Não dá: ' + esc(r.erros.join("; ")) + "</span>"; return r; }
      var fer = r.ferragens.filter(function (f) { return /dobradica|corredica|minifix|puxador/.test(f.id); }).map(function (f) { return f.quantidade + " " + f.nome.split(" (")[0].toLowerCase(); });
      el.innerHTML = "<b>" + r.pecas.length + " peças</b>" + (fer.length ? " · " + esc(fer.join(" · ")) : "") + (r.avisos.length ? '<br><span class="muted">Atenção: ' + esc(r.avisos.join("; ")) + "</span>" : "");
      return r;
    },
    _modDoTipo: function (tipo, tipoFam) {
      var f = FamiliasMarcenaria.obter("ra-marc-" + tipo.replace("_", "-"), true), t = tipoFam || (f && f.tipos[0] && f.tipos[0].id);
      var av = f && global.Familia ? Familia.avaliar(f, t, {}) : null;
      return { m: av && av.valores ? MC().moduloDeValores(av.valores) : MC().modulo(tipo), tipoFam: t };
    },
    inserir: function (tipo, tipoFam) {
      var self = this, base = this._modDoTipo(tipo || "aereo", tipoFam), m = base.m;
      modal("Inserir módulo de marcenaria", this._form(m, base.tipoFam, false), [
        { texto: "Cancelar", classe: "ghost", onClick: fechar },
        { texto: "Colocar no modelo", classe: "primary", onClick: function () { var mm = self._lerForm(m), r = MC().explodir(mm); if (!r.ok) { toast("Não dá: " + r.erros[0], "erro"); return; } fechar(); self.colocar(mm, base.tipoFam); } }
      ]);
      var bg = q("#modal-bg"); if (!bg) return true;
      bg.addEventListener("change", function (e) {
        var k = e.target.getAttribute && e.target.getAttribute("data-mc");
        if (k === "tipo") { self.inserir(e.target.value); return; }
        if (k === "tipoFam") { self.inserir(m.tipo, e.target.value); return; }
        self._resumo(self._lerForm(m));
      });
      bg.addEventListener("input", function () { self._resumo(self._lerForm(m)); });
      this._resumo(m);
      return true;
    },
    /* arma a família no modelo: o próximo clique coloca (a op "familia" de sempre) */
    colocar: function (m, tipoFam) {
      var b = B(), famId = "ra-marc-" + m.tipo.replace("_", "-");
      if (!b || !b.editarArmar) { toast("Abra o modelo (BIM) para colocar o módulo.", "aviso"); return false; }
      this._sincronizar();
      var inst = MC().instDeModulo(m);
      b.editarArmar("familia", { famId: famId, tipoId: tipoFam, inst: inst });
      this._armado = { famId: famId, tipoId: tipoFam, inst: inst };
      status(MC().TIPOS_MODULO[m.tipo] + ": clique no modelo para colocar (encostado na parede, a frente para fora). Esc cancela.");
      return true;
    },
    editar: function (id) {
      var self = this, mods = this.modulosNoModelo().filter(function (f) { return /^ra-marc-/.test(f.famId); });
      if (!mods.length) { toast("Nenhum módulo de marcenaria no modelo.", "aviso"); return false; }
      var alvo = null; mods.forEach(function (f) { if (f.id === id) alvo = f; });
      alvo = alvo || this._selecionado() || mods[mods.length - 1];
      var av = this.avaliar(alvo.famId, alvo.tipoId, alvo.inst), m = MC().moduloDeValores(av && av.valores);
      var lista = '<div class="field" style="margin-bottom:8px"><label>Módulo do modelo</label><select data-mced="id">' + mods.map(function (f, i) {
        var a = self.avaliar(f.famId, f.tipoId, f.inst), mm = a && a.valores ? MC().moduloDeValores(a.valores) : null;
        return '<option value="' + esc(f.id) + '"' + (f.id === alvo.id ? " selected" : "") + ">M" + (i < 9 ? "0" : "") + (i + 1) + " · " + esc(mm ? MC().TIPOS_MODULO[mm.tipo] + " " + mm.L + " × " + mm.H + (mm.ambiente ? " · " + mm.ambiente : "") : f.famId) + "</option>";
      }).join("") + "</select></div>";
      modal("Editar módulo", lista + this._form(m, alvo.tipoId, true), [
        { texto: "Cancelar", classe: "ghost", onClick: fechar },
        { texto: "Aplicar", classe: "primary", onClick: function () {
          var mm = self._lerForm(m), r = MC().explodir(mm); if (!r.ok) { toast("Não dá: " + r.erros[0], "erro"); return; }
          fechar(); var b = B();
          if (b && b.instanciaAlterar && b.instanciaAlterar(alvo.id, { inst: MC().instDeModulo(mm) })) status("Módulo atualizado: " + r.pecas.length + " peças (Ctrl+Z desfaz).");
        } }
      ]);
      var bg = q("#modal-bg"); if (!bg) return true;
      bg.addEventListener("change", function (e) { if (e.target.getAttribute("data-mced") === "id") { self.editar(e.target.value); return; } self._resumo(self._lerForm(m)); });
      bg.addEventListener("input", function () { self._resumo(self._lerForm(m)); });
      this._resumo(m);
      return true;
    },

    /* --------------------------------------------- explodir em peças */
    explodir: function () {
      var p = this.projeto(); if (this._semNada(p)) return false;
      var cat = MC().catalogo(), h = "";
      if (p.erros.length) h += '<p style="color:var(--perigo,#b91c1c);font-size:12.5px">' + esc(p.erros.join(" · ")) + "</p>";
      if (p.avisos.length) h += '<p class="muted" style="font-size:12px">' + esc(p.avisos.join(" · ")) + "</p>";
      p.modulos.forEach(function (m) {
        if (!m.pecas.length) return;
        h += '<h4 style="margin:12px 0 4px">' + esc(m.marca + " · " + m.nome + (m.ambiente ? " · " + m.ambiente : "")) + " — " + m.pecas.length + " peças</h4>";
        h += '<table class="tbl" style="font-size:11.5px"><thead><tr><th>Código</th><th>Peça</th><th>C (veio) × L × E</th><th>Material</th><th>Fita</th><th>Furos</th><th>Obs.</th></tr></thead><tbody>' +
          m.pecas.map(function (x) {
            var fit = ["C1", "C2", "L1", "L2"].filter(function (s) { return x.fita[s]; }).join(" ") || "—";
            var fu = x.furos.length + x.furosTopo.length + (x.usinagens.length ? " + canal" : "");
            return "<tr><td>" + esc(x.codigo) + "</td><td>" + esc(x.nome) + "</td><td>" + br(x.comprimento, 1) + " × " + br(x.largura, 1) + " × " + br(x.espessura, 1) + "</td><td>" + esc(x.material) + (x.veio ? " (veio)" : "") + "</td><td>" + fit + "</td><td>" + fu + "</td><td>" + esc(x.obs) + "</td></tr>";
          }).join("") + "</tbody></table>";
      });
      void cat;
      modal("Peças dos módulos (" + p.pecas.length + ")", h, [
        { texto: "Ferragens", onClick: function () { MarcenariaUI.ferragens(); } },
        { texto: "Plano de corte", classe: "primary", onClick: function () { MarcenariaUI.plano(); } },
        { texto: "Fechar", classe: "ghost", onClick: fechar }
      ]);
      try { UI.modalConsulta(); } catch (e) {}
      return p;
    },

    /* --------------------------------------------- catálogo */
    catalogo: function () {
      var self = this, c = JSON.parse(JSON.stringify(MC().catalogo()));
      function linhaCh(ch, i) {
        return "<tr data-ch=\"" + i + "\"><td><input data-k=\"nome\" value=\"" + esc(ch.nome) + "\" style=\"width:190px\"></td><td><input data-k=\"tipo\" value=\"" + esc(ch.tipo) + "\" style=\"width:80px\"></td>" +
          ["espessura", "comprimento", "largura"].map(function (k) { return "<td><input data-k=\"" + k + "\" type=\"number\" step=\"0.5\" value=\"" + esc(ch[k]) + "\" style=\"width:70px\"></td>"; }).join("") +
          "<td><select data-k=\"veio\"><option value=\"0\"" + (ch.veio ? "" : " selected") + ">Não</option><option value=\"1\"" + (ch.veio ? " selected" : "") + ">Sim</option></select></td>" +
          "<td><select data-k=\"fita\"><option value=\"\">—</option>" + c.fitas.map(function (f) { return '<option value="' + esc(f.id) + '"' + (f.id === ch.fita ? " selected" : "") + ">" + esc(f.nome) + "</option>"; }).join("") + "</select></td>" +
          "<td><input data-k=\"cor\" type=\"color\" value=\"" + esc(ch.cor || "#cccccc") + "\"></td></tr>";
      }
      function linhaFi(f, i) {
        return "<tr data-fi=\"" + i + "\"><td><input data-k=\"nome\" value=\"" + esc(f.nome) + "\" style=\"width:220px\"></td>" +
          ["largura", "espessura"].map(function (k) { return "<td><input data-k=\"" + k + "\" type=\"number\" step=\"0.05\" value=\"" + esc(f[k]) + "\" style=\"width:70px\"></td>"; }).join("") + "</tr>";
      }
      var F = c.furacao, cr = c.corte;
      function nn(k, v, rot) { return '<label style="display:inline-block;margin:0 12px 6px 0;font-size:12px">' + rot + ' <input data-cfg="' + k + '" type="number" step="0.5" value="' + esc(v) + '" style="width:70px"></label>'; }
      var h = '<p class="muted" style="font-size:12px;margin-top:0">Valores de partida, editáveis: confira no fornecedor da chapa e no gabarito da ferragem. Fica gravado neste aparelho.</p>' +
        '<h4 style="margin:6px 0">Chapas</h4><table class="tbl" style="font-size:12px"><thead><tr><th>Nome</th><th>Tipo</th><th>Esp. (mm)</th><th>Comprimento (mm)</th><th>Largura (mm)</th><th>Veio</th><th>Fita padrão</th><th>Cor</th></tr></thead><tbody>' + c.chapas.map(linhaCh).join("") + "</tbody></table>" +
        '<button class="btn sm" data-cat="nova-chapa" style="margin:6px 0">+ Chapa</button>' +
        '<h4 style="margin:10px 0 6px">Fitas de borda</h4><table class="tbl" style="font-size:12px"><thead><tr><th>Nome</th><th>Largura (mm)</th><th>Espessura (mm)</th></tr></thead><tbody>' + c.fitas.map(linhaFi).join("") + "</tbody></table>" +
        '<button class="btn sm" data-cat="nova-fita" style="margin:6px 0">+ Fita</button>' +
        '<h4 style="margin:10px 0 6px">Corte</h4>' + nn("corte.kerf", cr.kerf, "Serra (kerf, mm)") + nn("corte.refilo", cr.refilo, "Refilo por borda (mm)") + nn("corte.sobraFita", cr.sobraFita, "Sobra de fita por aresta (mm)") + nn("corte.barra", cr.barra, "Barra de madeira (mm)") +
        '<h4 style="margin:10px 0 6px">Furação</h4>' + nn("furacao.dobradica.prof", F.dobradica.prof, "Caneco: fundo") + nn("furacao.dobradica.borda", F.dobradica.borda, "Caneco: centro à borda") + nn("furacao.dobradica.ponta", F.dobradica.ponta, "Caneco: das pontas") +
        nn("furacao.minifix.dist", F.minifix.dist, "Minifix: da borda") + nn("furacao.minifix.profCorpo", F.minifix.profCorpo, "Minifix: fundo") + nn("furacao.cavilha.profFace", F.cavilha.profFace, "Cavilha: fundo na face") + nn("furacao.cavilha.profTopo", F.cavilha.profTopo, "Cavilha: fundo no topo") +
        nn("furacao.ligacao.recuo", F.ligacao.recuo, "Recuo das ligações (sistema 32)") + nn("furacao.canal.prof", F.canal.prof, "Canal do fundo: fundo") + nn("furacao.corredica.folga", F.corredica.folga, "Corrediça: folga por lado");
      modal("Chapas e fitas", h, [
        { texto: "Voltar ao de partida", classe: "ghost", onClick: function () { MC().restaurarCatalogo(); try { global.localStorage.removeItem(CHAVE_CAT); } catch (e) {} self._sincronizar(); fechar(); toast("Catálogo de partida restaurado.", "ok"); } },
        { texto: "Cancelar", classe: "ghost", onClick: fechar },
        { texto: "Salvar", classe: "primary", onClick: function () { self._salvarCatalogo(c); } }
      ]);
      var bg = q("#modal-bg");
      if (bg) bg.addEventListener("click", function (e) {
        var k = e.target.getAttribute && e.target.getAttribute("data-cat"); if (!k) return;
        self._lerCatalogo(c);
        if (k === "nova-chapa") c.chapas.push({ id: "chapa-" + Date.now().toString(36), nome: "Chapa nova 18 mm", tipo: "MDF", espessura: 18, comprimento: 2750, largura: 1850, veio: false, cor: "#dddddd", fita: c.fitas[0] ? c.fitas[0].id : "" });
        if (k === "nova-fita") c.fitas.push({ id: "fita-" + Date.now().toString(36), nome: "Fita nova 22 × 1 mm", largura: 22, espessura: 1, cor: "#dddddd" });
        MC().definirCatalogo(c); self.catalogo();
      });
      return true;
    },
    _lerCatalogo: function (c) {
      Array.prototype.slice.call(document.querySelectorAll("[data-ch]")).forEach(function (tr) {
        var ch = c.chapas[+tr.getAttribute("data-ch")];
        Array.prototype.slice.call(tr.querySelectorAll("[data-k]")).forEach(function (el) { var k = el.getAttribute("data-k"); ch[k] = k === "veio" ? el.value === "1" : (el.type === "number" ? num(el.value, ch[k]) : el.value); });
      });
      Array.prototype.slice.call(document.querySelectorAll("[data-fi]")).forEach(function (tr) {
        var f = c.fitas[+tr.getAttribute("data-fi")];
        Array.prototype.slice.call(tr.querySelectorAll("[data-k]")).forEach(function (el) { var k = el.getAttribute("data-k"); f[k] = el.type === "number" ? num(el.value, f[k]) : el.value; });
      });
      Array.prototype.slice.call(document.querySelectorAll("[data-cfg]")).forEach(function (el) {
        var p = el.getAttribute("data-cfg").split("."), o = c; for (var i = 0; i < p.length - 1; i++) o = o[p[i]]; o[p[p.length - 1]] = num(el.value, o[p[p.length - 1]]);
      });
      return c;
    },
    _salvarCatalogo: function (c) {
      this._lerCatalogo(c);
      var r = MC().definirCatalogo(c);
      if (!r.ok) { toast("Não salvei: " + r.erros.join("; "), "erro"); return false; }
      gravar(CHAVE_CAT, MC().catalogo());
      this._sincronizar(); fechar();
      toast("Catálogo salvo neste aparelho. Os módulos do modelo foram redesenhados com ele.", "ok");
      return true;
    },

    /* --------------------------------------------- plano de corte */
    _plano: function (p) { return MC().otimizar(p.pecas); },
    plano: function () {
      var self = this, p = this.projeto(); if (this._semNada(p)) return false;
      var pl = this._plano(p), h = "";
      if (!p.pecas.length) h += '<p class="muted">Só peças serradas no modelo: veja a Lista de corte (Carpintaria).</p>';
      h += '<p style="font-size:12.5px;margin-top:0"><b>' + pl.totalChapas + " chapa(s)</b> para " + p.pecas.length + " peças · serra " + pl.kerf + " mm · refilo " + pl.refilo + " mm por borda · peça com veio não gira.</p>";
      if (pl.naoCouberam.length) h += '<p style="color:var(--perigo,#b91c1c);font-size:12.5px">Não couberam: ' + esc(pl.naoCouberam.join(", ")) + " — " + esc(pl.avisos.join(" · ")) + "</p>";
      h += '<table class="tbl" style="font-size:12px"><thead><tr><th>Material</th><th>Chapa (mm)</th><th>Chapas</th><th>Peças</th><th>Aproveitamento</th></tr></thead><tbody>' +
        pl.grupos.map(function (g) { return "<tr><td>" + esc(g.material) + "</td><td>" + g.comprimento + " × " + g.largura + "</td><td>" + g.nChapas + "</td><td>" + g.pecas + "</td><td>" + br(g.aproveitamento, 1) + "%</td></tr>"; }).join("") + "</tbody></table>";
      h += '<p style="font-size:12.5px">Fita: ' + pl.fitas.map(function (f) { return esc(f.nome) + " — " + br(f.metros, 2) + " m (" + br(f.metrosComSobra, 2) + " m com sobra)"; }).join(" · ") + "</p>";
      var nDes = 0, cores = ["#dbeafe", "#dcfce7", "#fef9c3", "#fde2e2", "#ede9fe", "#ffedd5"];
      h += '<div data-mc-chapas style="display:flex;flex-wrap:wrap;gap:10px">';
      pl.grupos.forEach(function (g) {
        g.chapas.forEach(function (s) {
          if (nDes++ >= 12) return;
          h += '<figure style="margin:0;width:300px"><svg viewBox="0 0 ' + g.comprimento + " " + g.largura + '" style="width:300px;background:#fafafa;border:1px solid #999">' +
            s.pecas.map(function (x, i) { return '<rect x="' + x.x + '" y="' + x.y + '" width="' + x.w + '" height="' + x.h + '" fill="' + cores[i % cores.length] + '" stroke="#333" stroke-width="3"><title>' + esc(x.codigo + " " + x.nome + " " + x.comprimento + " × " + x.largura) + "</title></rect>" +
              '<text x="' + (x.x + x.w / 2) + '" y="' + (x.y + x.h / 2 + 20) + '" font-size="' + Math.max(40, Math.min(90, Math.min(x.w, x.h) * 0.4)) + '" text-anchor="middle">' + (i + 1) + "</text>"; }).join("") +
            '</svg><figcaption style="font-size:11px">' + esc(g.material) + " · chapa " + s.indice + "/" + g.nChapas + " · " + br(s.aproveitamento, 1) + "%</figcaption></figure>";
        });
      });
      h += "</div>" + (nDes > 12 ? '<p class="muted" style="font-size:11.5px">Mostrando 12 de ' + nDes + " chapas — todas vão no PDF.</p>" : "");
      modal("Plano de corte", h, [
        { texto: "PDF do plano", classe: "primary", onClick: function () { self.baixarPdfPlano(p, pl); } },
        { texto: "Planilha .xlsx", onClick: function () { self.baixarPlanilha(); } },
        { texto: "Cortecloud", onClick: function () { self.baixarCortecloud(); } },
        { texto: "CSV", onClick: function () { self.csv(); } },
        { texto: "DXF CNC", onClick: function () { self.dxf(); } },
        { texto: "Etiquetas", onClick: function () { self.etiquetas(); } },
        { texto: "Fechar", classe: "ghost", onClick: fechar }
      ]);
      try { UI.modalConsulta(); } catch (e) {}
      this._ultimoPlano = pl;
      return pl;
    },
    _nome: function (ext) { var d = new Date(), z = function (n) { return (n < 10 ? "0" : "") + n; }; return "marcenaria-" + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + "-" + z(d.getHours()) + z(d.getMinutes()) + "." + ext; },
    baixar: function (nome, dados, mime) {
      var tam = dados && dados.byteLength != null ? dados.byteLength : txt(dados).length;
      this._ultimoArquivo = { nome: nome, tamanho: tam, tipo: mime };
      try {
        var url = URL.createObjectURL(new Blob([dados], { type: mime || "application/octet-stream" })), a = document.createElement("a");
        a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      } catch (e) { toast("Não consegui gerar o arquivo: " + e.message, "erro"); return false; }
      return true;
    },
    _comExcel: function (fn) {
      if (global.ExcelJS) { fn(global.ExcelJS); return; }
      if (global.ExcelOrc && ExcelOrc.ensureExcelJS) ExcelOrc.ensureExcelJS(function () { fn(global.ExcelJS); });
      else toast("O gerador de Excel não carregou.", "erro");
    },
    baixarPlanilha: function () {
      var self = this, p = this.projeto(); if (this._semNada(p)) return false;
      var pl = p.pecas.length ? this._plano(p) : null;
      this._comExcel(function (EJ) {
        MS().planilha(EJ, p, pl, { catalogo: MC().catalogo(), barra: MC().catalogo().corte.barra }).xlsx.writeBuffer().then(function (buf) {
          var nm = self._nome("xlsx");
          if (self.baixar(nm, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")) toast("Planilha " + nm + ": " + p.pecas.length + " peças" + (p.serradas.length ? " e " + p.serradas.length + " peças serradas" : "") + ".", "ok");
        });
      });
      return true;
    },
    baixarCortecloud: function () {
      var self = this, p = this.projeto(); if (this._semNada(p)) return false;
      this._comExcel(function (EJ) {
        MS().planilhaCortecloud(EJ, p).xlsx.writeBuffer().then(function (buf) {
          var nm = self._nome("xlsx").replace("marcenaria-", "cortecloud-");
          if (self.baixar(nm, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")) toast("Cortecloud: " + nm + " — sem cabeçalho (quantidade, comprimento, largura, função, fita, material). Confira o texto da fita na importação.", "ok");
        });
      });
      return true;
    },
    perfilCsv: function () { var p = ler(CHAVE_CSV); return p && arr(p.colunas).length ? p : JSON.parse(JSON.stringify(MS().PERFIS_CSV.planilha)); },
    csv: function () {
      var self = this, pf = this.perfilCsv(), C = MS().CAMPOS;
      var ordem = pf.colunas.concat(Object.keys(C).filter(function (k) { return pf.colunas.indexOf(k) < 0; }));
      var h = '<p class="muted" style="font-size:12px;margin-top:0">' + esc(MS().PERFIS_CSV.cortecerto.nota) + "</p>" +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;font-size:12.5px;margin-bottom:8px"><label>Partir de <select data-csv="perfil"><option value="">—</option><option value="planilha">Planilha completa</option><option value="cortecerto">Corte Certo (conferir)</option></select></label>' +
        '<label>Separador <select data-csv="sep"><option value=";"' + (pf.separador === ";" ? " selected" : "") + '>; (ponto e vírgula)</option><option value=","' + (pf.separador === "," ? " selected" : "") + '>, (vírgula)</option><option value="tab"' + (pf.separador === "tab" ? " selected" : "") + ">Tabulação</option></select></label>" +
        '<label>Decimal <select data-csv="dec"><option value=","' + (pf.decimal !== "." ? " selected" : "") + '>vírgula</option><option value="."' + (pf.decimal === "." ? " selected" : "") + ">ponto</option></select></label>" +
        '<label><input type="checkbox" data-csv="cab"' + (pf.cabecalho !== false ? " checked" : "") + "> Cabeçalho</label></div>" +
        '<p style="font-size:12px;margin:4px 0">Colunas (marque e ponha na ordem com ↑ ↓):</p><ol data-csv="cols" style="font-size:12.5px;padding-left:20px">' +
        ordem.map(function (k) { return '<li data-col="' + k + '"><label><input type="checkbox"' + (pf.colunas.indexOf(k) >= 0 ? " checked" : "") + "> " + esc(C[k]) + '</label> <button class="btn sm ghost" data-mv="-1">↑</button><button class="btn sm ghost" data-mv="1">↓</button></li>'; }).join("") + "</ol>";
      modal("CSV para a empresa de corte", h, [
        { texto: "Cancelar", classe: "ghost", onClick: fechar },
        { texto: "Salvar perfil e baixar", classe: "primary", onClick: function () { var n = self._lerCsv(); gravar(CHAVE_CSV, n); fechar(); self.baixarCsv(n); } }
      ]);
      var bg = q("#modal-bg");
      if (bg) {
        bg.addEventListener("click", function (e) {
          var mv = e.target.getAttribute && e.target.getAttribute("data-mv"); if (!mv) return;
          var li = e.target.closest("li"), ol = li.parentNode;
          if (mv === "-1" && li.previousElementSibling) ol.insertBefore(li, li.previousElementSibling);
          if (mv === "1" && li.nextElementSibling) ol.insertBefore(li.nextElementSibling, li);
        });
        bg.addEventListener("change", function (e) { if (e.target.getAttribute("data-csv") === "perfil" && e.target.value) { gravar(CHAVE_CSV, MS().PERFIS_CSV[e.target.value]); self.csv(); } });
      }
      return true;
    },
    _lerCsv: function () {
      var cols = Array.prototype.slice.call(document.querySelectorAll('[data-csv="cols"] li')).filter(function (li) { return li.querySelector("input").checked; }).map(function (li) { return li.getAttribute("data-col"); });
      return { nome: "Meu perfil", colunas: cols, separador: (q('[data-csv="sep"]') || {}).value || ";", decimal: (q('[data-csv="dec"]') || {}).value || ",", cabecalho: !!(q('[data-csv="cab"]') || {}).checked };
    },
    baixarCsv: function (pf) {
      var p = this.projeto(); if (this._semNada(p)) return false;
      var r = MS().csv(p, pf || this.perfilCsv());
      if (!r.ok) { toast("Não gerei o CSV: " + r.erro, "erro"); return false; }
      var nm = this._nome("csv");
      if (this.baixar(nm, r.texto, "text/csv;charset=utf-8")) toast("CSV " + nm + ": " + r.linhas + " linhas, " + r.colunas.length + " colunas.", "ok");
      return r;
    },
    dxf: function () {
      var self = this, p = this.projeto(); if (this._semNada(p)) return false;
      modal("DXF para CNC", '<p style="font-size:12.5px;margin-top:0">' + p.pecas.length + ' peças. Milímetros, 1:1, vistas pela face usinada (face A).</p><p class="muted" style="font-size:12px">Camadas: CONTORNO (polilinha fechada), FURO_&lt;diâmetro&gt;_PROF_&lt;fundo&gt; (face A), …_FACE_B, FURO_HORIZ_… (furo de topo, desenhado como a linha do eixo), CANAL_FUNDO_LARG_…_PROF_…, ETIQUETA (texto, não usinar).</p>', [
        { texto: "Cancelar", classe: "ghost", onClick: fechar },
        { texto: "Uma peça por arquivo (.zip)", onClick: function () { fechar(); var z = global.BimBcf && BimBcf.zipEscrever; if (!z) { toast("O gerador de .zip não carregou.", "erro"); return; } self.baixar(self._nome("zip").replace("marcenaria-", "dxf-pecas-"), MS().dxfZip(p.pecas, z), "application/zip"); } },
        { texto: "Todas lado a lado (.dxf)", classe: "primary", onClick: function () { fechar(); self.baixar(self._nome("dxf"), MS().dxfTodas(p.pecas), "application/dxf"); } }
      ]);
      return true;
    },
    etiquetas: function () {
      var p = this.projeto(); if (this._semNada(p)) return false;
      if (!p.pecas.length) { toast("Etiquetas são das peças em chapa: nenhum módulo no modelo.", "aviso"); return false; }
      var r = MS().pdfEtiquetas(p.pecas, { catalogo: MC().catalogo() }, { qrcode: global.qrcode });
      var nm = this._nome("pdf").replace("marcenaria-", "etiquetas-");
      if (this.baixar(nm, r.bytes, "application/pdf")) toast("Etiquetas: " + r.etiquetas + " em " + r.paginas + " folha(s) A4 (3 × 8, 70 × 37 mm).", "ok");
      return r;
    },
    baixarPdfPlano: function (p, pl) {
      p = p || this.projeto(); pl = pl || this._plano(p);
      var r = MS().pdfPlano(pl, p, { titulo: "Plano de corte" }), nm = this._nome("pdf").replace("marcenaria-", "plano-de-corte-");
      if (this.baixar(nm, r.bytes, "application/pdf")) toast("Plano de corte: " + r.paginas + " folhas (uma por chapa + ferragens e fitas).", "ok");
      return r;
    },
    ferragens: function () {
      var self = this, p = this.projeto(); if (this._semNada(p)) return false;
      var h = '<table class="tbl" style="font-size:12.5px"><thead><tr><th>Item</th><th>Unidade</th><th>Quantidade</th></tr></thead><tbody>' +
        p.ferragens.map(function (f) { return "<tr><td>" + esc(f.nome) + "</td><td>" + esc(f.unidade) + "</td><td>" + br(f.quantidade, 2) + "</td></tr>"; }).join("") + "</tbody></table>" +
        '<p class="muted" style="font-size:11.5px">Quantidades pela furação dos módulos (valores de partida do catálogo).</p>';
      modal("Ferragens", h, [
        { texto: "Baixar .csv", onClick: function () { self.baixar(self._nome("csv").replace("marcenaria-", "ferragens-"), "﻿Item;Unidade;Quantidade\r\n" + p.ferragens.map(function (f) { return '"' + f.nome.replace(/"/g, '""') + '";' + f.unidade + ";" + String(f.quantidade).replace(".", ","); }).join("\r\n") + "\r\n", "text/csv;charset=utf-8"); } },
        { texto: "Fechar", classe: "ghost", onClick: fechar }
      ]);
      try { UI.modalConsulta(); } catch (e) {}
      return p.ferragens;
    },

    /* --------------------------------------------- carpintaria */
    carpintaria: function (tipo) {
      var self = this, M = MC(), o = M.PADRAO_CARP[tipo], rot = M.PARAMS_CARP;
      var h = '<div data-modal-largo style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 14px;font-size:12.5px">' +
        Object.keys(o).filter(function (k) { return k !== "especie"; }).map(function (k) { return '<div class="field" style="margin-bottom:8px"><label>' + esc(rot[k] || k) + '</label><input data-cp="' + k + '" type="number" step="1" value="' + esc(o[k]) + '"></div>'; }).join("") +
        '<div class="field"><label>Espécie</label><select data-cp="especie">' + Object.keys(M.ESPECIES).map(function (k) { return '<option value="' + k + '"' + (k === o.especie ? " selected" : "") + ">" + esc(M.ESPECIES[k].nome) + "</option>"; }).join("") + "</select></div>" +
        '<div class="field"><label>Ambiente</label><input data-cp="ambiente" value=""></div></div><div data-cp-res style="font-size:12.5px"></div>' +
        '<p class="muted" style="font-size:11.5px">' + esc(M.AVISO_NBR) + ".</p>";
      function lerO() { var r = {}; Array.prototype.slice.call(document.querySelectorAll("[data-cp]")).forEach(function (el) { var k = el.getAttribute("data-cp"); r[k] = el.type === "number" ? num(el.value, o[k]) : el.value; }); return r; }
      function res() { var r = M.carpintaria(tipo, lerO()), el = q("[data-cp-res]"); if (el) el.innerHTML = r.ok ? "<b>" + r.pecas.length + " peças serradas</b> · " + esc(M.agruparSerradas(r.pecas).map(function (s) { return s.quantidade + "× " + s.nome + " " + s.b + "×" + s.h + " × " + s.comprimento; }).join(" · ")) : '<span style="color:#b91c1c">' + esc(r.erros.join("; ")) + "</span>"; return r; }
      modal(M.NOMES_CARP[tipo], h, [
        { texto: "Cancelar", classe: "ghost", onClick: fechar },
        { texto: "Colocar no modelo", classe: "primary", onClick: function () {
          var r = res(); if (!r.ok) return; var v = lerO(), inst = { Especie: v.especie, Ambiente: v.ambiente };
          Object.keys(o).forEach(function (k) { if (k !== "especie") inst["C_" + k] = v[k]; });
          fechar(); var b = B(); if (!b || !b.editarArmar) { toast("Abra o modelo para colocar.", "aviso"); return; }
          self._sincronizar(); b.editarArmar("familia", { famId: "ra-carp-" + tipo, tipoId: tipo + "-1", inst: inst });
          status(M.NOMES_CARP[tipo] + ": clique no modelo para colocar. Esc cancela.");
        } }
      ]);
      var bg = q("#modal-bg"); if (bg) bg.addEventListener("input", res);
      res();
      return true;
    },
    serradas: function () {
      var self = this, p = this.projeto(), M = MC();
      if (!p.serradas.length) { toast("Nenhuma peça serrada no modelo: Pergolado, Deck, Tesoura ou as peças de madeira da biblioteca.", "aviso"); return false; }
      var ag = M.agruparSerradas(p.serradas), ob = M.otimizarBarras(p.serradas, { barra: M.catalogo().corte.barra });
      var vol = ag.reduce(function (s, x) { return s + x.volume; }, 0);
      var h = '<table class="tbl" style="font-size:12px"><thead><tr><th>Peça</th><th>Seção (mm)</th><th>Comprimento (mm)</th><th>Qtd.</th><th>Corte 1</th><th>Corte 2</th><th>Espécie</th><th>Volume (m³)</th></tr></thead><tbody>' +
        ag.map(function (s) { return "<tr><td>" + esc(s.nome) + "</td><td>" + s.b + " × " + s.h + "</td><td>" + s.comprimento + "</td><td>" + s.quantidade + "</td><td>" + esc(s.corte1.descricao) + "</td><td>" + esc(s.corte2.descricao) + "</td><td>" + esc(s.especie.split(" (")[0]) + "</td><td>" + br(s.volume, 4) + "</td></tr>"; }).join("") +
        "</tbody></table><p style=\"font-size:12.5px\">Total " + br(vol, 3) + " m³. Barras de " + ob.barra + " mm: " + ob.grupos.map(function (g) { return g.nBarras + " de " + g.secao; }).join(" · ") +
        (ob.maioresQueABarra.length ? ' · <b>maiores que a barra</b> (pedir sob medida ou emendar): ' + esc(ob.maioresQueABarra.join(", ")) : "") + '</p><p class="muted" style="font-size:11.5px">' + esc(M.AVISO_NBR) + ".</p>";
      modal("Lista de corte — peças serradas", h, [{ texto: "Planilha .xlsx", classe: "primary", onClick: function () { self.baixarPlanilha(); } }, { texto: "Fechar", classe: "ghost", onClick: fechar }]);
      try { UI.modalConsulta(); } catch (e) {}
      return ag;
    }
  };
  global.MarcenariaUI = MarcenariaUI;
  if (typeof module !== "undefined" && module.exports) module.exports = MarcenariaUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
