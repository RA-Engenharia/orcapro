/* =====================================================================
 * metalfabui.js — a TELA das ferramentas de FABRICAÇÃO da Metálica
 * (grupo "Fabricação" da aba Metálica & Mecânica, prévia do modelador).
 * Fina: quem calcula é motor puro —
 *   js/metalcorte.js    lista de corte com aproveitamento de barras e o
 *                       nesting das chapas nas chapas comerciais;
 *   js/metalplanif.js   chapa dobrada e planificação (fator K);
 *   js/metalpintura.js  área de pintura, peso e tinta por demão;
 *   js/metalfabdes.js   as folhas de fabricação (Padrão RA, carimbo RA);
 *   js/svgpdf.js        as folhas → PDF vetorial.
 * Aqui: os diálogos (com os valores de PARTIDA editáveis e lembrados neste
 * computador), os downloads (.xlsx formatado, PDF, DXF, .zip) e o
 * "Lançar no orçamento" da pintura. `ultimo` guarda o último resultado
 * (o e2e confere por ele).
 * ===================================================================== */
(function (global) {
  "use strict";
  function U() { return global.BimMetalUI; }
  function F() { return global.BimMetalFab; }
  function CO() { return global.BimMetalCorte; }
  function PL() { return global.BimMetalPlanif; }
  function PI() { return global.BimMetalPintura; }
  function FD() { return global.BimMetalFabDes; }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(/\./g, function (m, i, s) { return /,/.test(s) ? "" : m; }).replace(",", ".")); return isFinite(n) ? n : d; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function br(v, c) { c = c == null ? 2 : c; var s = (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c), neg = s.charAt(0) === "-"; if (neg) s = s.slice(1); var p = s.split("."); return (neg ? "-" : "") + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (p[1] ? "," + p[1] : ""); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function toast(t, tipo, ms) { try { if (global.UI) UI.toast(t, tipo || "ok", ms || 7000); } catch (e) {} }
  function status(t) { try { if (global.BimShell && BimShell.status) BimShell.status(t); } catch (e) {} }
  function q(sel) { return document.querySelector(sel); }
  function val(id) { var e = q('[data-mf-campo="' + id + '"]'); return e ? (e.type === "checkbox" ? e.checked : e.value) : null; }
  function nomeP(n) { return global.BimMetalFabDes && BimMetalFabDes.perfilTxt ? BimMetalFabDes.perfilTxt(n) : String(n == null ? "" : n); }
  var CHAVE = "orcapro:metalfab:cfg:v1";
  var NAO_CALC = '<p class="muted" style="font-size:12px;margin:0 0 8px">Modelagem, detalhamento e fabricação — <b>não é cálculo estrutural</b>. Os valores preenchidos são de <b>partida</b> (editáveis, lembrados neste computador).</p>';
  var CSS_CAMPOS = "display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px 12px;margin:0 0 10px";
  function campo(id, rotulo, valor, o) {
    o = o || {};
    var h = '<label style="display:flex;flex-direction:column;font-size:12px;gap:3px"><span>' + esc(rotulo) + (o.partida ? ' <i class="muted">(partida)</i>' : "") + "</span>";
    if (o.opcoes) h += '<select data-mf-campo="' + id + '">' + o.opcoes.map(function (op) { return '<option value="' + esc(op[0]) + '"' + (String(op[0]) === String(valor) ? " selected" : "") + ">" + esc(op[1]) + "</option>"; }).join("") + "</select>";
    else if (o.check) h += '<input type="checkbox" data-mf-campo="' + id + '"' + (valor ? " checked" : "") + ">";
    else h += '<input data-mf-campo="' + id + '" value="' + esc(valor) + '"' + (o.num ? ' inputmode="decimal"' : "") + ">";
    return h + "</label>";
  }
  function aviso(t, tipo) { var c = tipo === "erro" ? "var(--vermelho)" : (tipo === "ok" ? "var(--verde)" : "var(--amarelo)"); return '<p style="font-size:12px;margin:6px 0;padding:6px 10px;border-left:3px solid ' + c + ';background:var(--surface-2);color:var(--texto)">' + t + "</p>"; }

  var MetalFabUI = {
    ultimo: null,
    cfg: function () {
      var c = {};
      try { c = JSON.parse(global.localStorage.getItem(CHAVE) || "{}") || {}; } catch (e) { c = {}; }
      var CB = CO() ? CO().CONFIG_BARRAS : { barras: [6000, 12000], serra: 3, sobraMin: 1000, refilo: 0 }, CC = CO() ? CO().CONFIG_CHAPAS : { chapas: [[1200, 3000], [1500, 3000], [1500, 6000]], folga: 10, borda: 10 };
      var CP = PI() ? PI().CONFIG : { demaos: [{ nome: "Fundo (primer)", rendimento: 10 }, { nome: "Acabamento", rendimento: 10 }], perda: 0 };
      return { barras: c.barras || CB.barras.slice(), serra: c.serra != null ? c.serra : CB.serra, sobraMin: c.sobraMin != null ? c.sobraMin : CB.sobraMin, refilo: c.refilo != null ? c.refilo : CB.refilo,
               chapas: c.chapas || CC.chapas.map(function (x) { return x.slice(); }), folga: c.folga != null ? c.folga : CC.folga, borda: c.borda != null ? c.borda : CC.borda,
               demaos: c.demaos || CP.demaos.map(function (d) { return { nome: d.nome, rendimento: d.rendimento }; }), perda: c.perda != null ? c.perda : CP.perda, bordas: !!c.bordas,
               sistema: c.sistema || null, perdaModo: c.perdaModo || "acrescimo", sisSel: c.sisSel || null,
               kModo: c.kModo || "padrao", k: c.k != null ? c.k : 0.33 };
    },
    gravar: function (mud) { var c = this.cfg(); Object.keys(mud || {}).forEach(function (k) { c[k] = mud[k]; }); try { global.localStorage.setItem(CHAVE, JSON.stringify(c)); } catch (e) {} if (PL()) PL().configurar({ kModo: c.kModo, k: c.k }); return c; },
    estado: function () { return U() ? U().estado() : null; },
    numeracao: function () { var st = this.estado(); if (!st) { toast("Abra o modelador primeiro.", "aviso"); return null; } if (PL()) { var c = this.cfg(); PL().configurar({ kModo: c.kModo, k: c.k }); } return F().numerar(st); },
    nomeArq: function (suf) { return (U() ? U().arqBase() : "obra") + "-" + suf; },
    baixar: function (nome, dados, mime) { return U() ? U().baixar(nome, dados, mime) : false; },
    excel: function (gerar, nome, fim) {
      var self = this;
      var go = function () {
        gerar(global.ExcelJS).xlsx.writeBuffer().then(function (buf) { self.baixar(nome, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); if (fim) fim(buf); },
          function (e) { toast("Não gerei a planilha: " + (e && e.message ? e.message : e), "erro"); });
      };
      if (global.ExcelJS) go(); else if (global.ExcelOrc && ExcelOrc.ensureExcelJS) ExcelOrc.ensureExcelJS(go); else toast("O gerador de Excel não carregou.", "erro");
    },
    opFolhas: function () {
      var d = {}, logo = null, G = U() && U()._G || global.Gestao, o = null;
      try { if (global.Empresa && Empresa.dados) d = Empresa.dados() || {}; if (global.Empresa && Empresa.logo) logo = Empresa.logo(); } catch (e) {}
      try { o = G && G._bimSel && global.Store ? Store.obter(Auth.empresaId(), "obras", G._bimSel) : null; } catch (e2) {}
      return { empresa: d && d.nome ? d : "", responsavel: d.responsavel || "", registro: d.crea || "", tituloProfissional: d.titulo || "", obra: (o && o.nome) || (U() ? U().nomeObra() : ""),
               proprietario: (o && o.clienteNome) || "", contratante: (o && o.clienteNome) || "", local: (o && o.local) || "", codigo: "FAB-MET", revisao: "R00", formato: "A3", logo: logo || null };
    },
    pdfBaixar: function (folhas, nome, titulo) {
      var b = FD().pdf(folhas, titulo); if (!b) { toast("O gerador de PDF (js/svgpdf.js) não carregou.", "erro"); return null; }
      this.baixar(nome, b, "application/pdf"); return b;
    },

    /* ============================================================ LISTA DE CORTE */
    corte: function () {
      var self = this, n = this.numeracao(); if (!n) return;
      if (!n.grupos.some(function (g) { return g.rep.kind === "perfil"; })) { toast("Não há perfil no modelo para a lista de corte.", "aviso"); return; }
      var c = this.cfg();
      var h = NAO_CALC + '<div style="' + CSS_CAMPOS + '">' + campo("barras", "Barras comerciais (mm)", c.barras.join("; "), { partida: true }) + campo("serra", "Perda de corte da serra (mm)", c.serra, { num: true, partida: true }) +
        campo("sobraMin", "Sobra reaproveitável a partir de (mm)", c.sobraMin, { num: true, partida: true }) + campo("refilo", "Refilo na ponta da barra (mm)", c.refilo, { num: true, partida: true }) + "</div>" +
        '<div data-mf="res-corte"></div>';
      UI.modal("Lista de corte — aproveitamento de barras", h, [
        { texto: "Recalcular", onClick: function () { self._corteCalc(true); } },
        { texto: "Baixar .xlsx", classe: "primary", onClick: function () { self._corteCalc(true); self.corteXlsx(); } },
        { texto: "Baixar PDF", onClick: function () { self._corteCalc(true); self.cortePdf(); } },
        { texto: "Fechar", onClick: function () { UI.fecharModal(); } }]);
      this._corteCalc(false);
    },
    _corteCalc: function (ler) {
      var c = this.cfg();
      if (ler) {
        var b = CO().lerLista(val("barras"));
        c = this.gravar({ barras: b.length ? b : c.barras, serra: num(val("serra"), c.serra), sobraMin: num(val("sobraMin"), c.sobraMin), refilo: num(val("refilo"), c.refilo) });
      }
      var n = this.numeracao(), p = CO().planoBarras(n, c), T = p.totais;
      this.ultimo = { tipo: "corte", plano: p };
      var el = q('[data-mf="res-corte"]'); if (!el) return p;
      var linhas = p.grupos.map(function (g) {
        return '<tr data-mf-perfil="' + esc(g.perfil) + '"><td>' + esc(nomeP(g.perfil)) + "</td><td>" + esc(g.aco) + '</td><td class="num">' + g.nPecas + "</td><td>" + g.compra.map(function (x) { return x.quantidade + " × " + br(x.comprimento / 1000, 0) + " m"; }).join(" + ") +
          '</td><td class="num">' + br(g.compradoKg, 1) + '</td><td class="num">' + br(g.sobrasKg, 1) + '</td><td class="num">' + br(g.perdaKg, 1) + '</td><td class="num">' + br(g.perdaPct, 1) + '</td></tr>';
      }).join("");
      var fora = p.grupos.filter(function (g) { return g.fora.length; }).map(function (g) { return g.perfil + ": " + g.fora.map(function (x) { return x.marca + " (" + br(x.L, 0) + " mm)"; }).join(", "); });
      el.innerHTML = '<table class="tbl tbl-compacta" data-mf="tab-corte"><thead><tr><th>Perfil</th><th>Aço</th><th class="num">Peças</th><th>Barras a comprar</th><th class="num">Comprado (kg)</th><th class="num">Sobras (kg)</th><th class="num">Perda (kg)</th><th class="num">Perda (%)</th></tr></thead><tbody>' + linhas +
        '<tr style="font-weight:600"><td>Total</td><td></td><td class="num">' + T.pecas + "</td><td>" + T.barras + ' barra(s)</td><td class="num">' + br(T.compradoKg, 1) + '</td><td class="num">' + br(T.sobrasKg, 1) + '</td><td class="num">' + br(T.perdaKg, 1) + '</td><td class="num">' + br(T.perdaPct, 1) + "</td></tr></tbody></table>" +
        (fora.length ? aviso("Peça maior que a barra comercial (emenda ou barra especial): " + esc(fora.join("; ")), "erro") : "") +
        '<p class="muted" style="font-size:11px;margin:6px 0 0">First-fit decreasing + melhoria local (determinístico). Perda = comprado − peças − sobras reaproveitáveis. O .xlsx traz o plano barra a barra.</p>';
      status("Lista de corte: " + T.barras + " barra(s), " + br(T.compradoKg, 0) + " kg comprados, perda " + br(T.perdaPct, 1) + " %.");
      return p;
    },
    corteXlsx: function () {
      var p = this.ultimo && this.ultimo.tipo === "corte" ? this.ultimo.plano : this._corteCalc(false), self = this, nome = this.nomeArq("lista-de-corte.xlsx");
      this.excel(function (X) { return CO().xlsxCorte(p, X, { obra: U() ? U().nomeObra() : "" }); }, nome, function () {
        self.ultimo = { tipo: "corte", plano: p, xlsx: nome };
        toast("Lista de corte: " + p.totais.barras + " barra(s) a comprar, perda " + br(p.totais.perdaPct, 1) + " % — " + nome + ".", "ok", 9000);
      });
    },
    cortePdf: function () {
      var p = this.ultimo && this.ultimo.tipo === "corte" ? this.ultimo.plano : this._corteCalc(false), r = FD().folhasCorte(p, this.opFolhas());
      if (!r.ok) { toast(r.avisos.join(" "), "erro"); return; }
      var nome = this.nomeArq("plano-de-corte.pdf"); this.pdfBaixar(r.folhas, nome, "Plano de corte");
      this.ultimo = { tipo: "corte", plano: p, pdf: nome, folhas: r.folhas.length };
      toast("Plano de corte em PDF: " + r.folhas.length + " folha(s) A3 com o carimbo.", "ok");
    },

    /* ============================================================ CHAPA DOBRADA (criar) */
    dobrada: function () {
      var self = this, st = this.estado(); if (!st) { toast("Abra o modelador primeiro.", "aviso"); return; }
      var P0 = U().pontoPadrao ? U().pontoPadrao() : [0, 0, 0], FS = PL().FORMAS;
      var h = NAO_CALC + '<div style="' + CSS_CAMPOS + '">' + campo("tipo", "Forma", "U", { opcoes: Object.keys(FS).map(function (k) { return [k, FS[k].nome]; }) }) +
        campo("d1", "Dimensão 1 (mm) — L: aba a; U/Ue/Z: alma h; cartola: altura", 100, { num: true }) + campo("d2", "Dimensão 2 (mm) — L: aba b; mesa b; cartola: topo", 50, { num: true }) +
        campo("d3", "Dimensão 3 (mm) — Ue: enrijecedor; cartola: aba", 20, { num: true }) + campo("pts", "Polilinha livre (linha média, mm): x,y; x,y …", "0,0; 80,0; 80,40", {}) +
        campo("t", "Espessura t (mm)", 3, { num: true }) + campo("ri", "Raio interno (mm)", 3, { num: true, partida: true }) + campo("L", "Comprimento da peça (mm)", 2000, { num: true }) +
        campo("aco", "Aço", "ASTM A36", {}) + campo("x", "Origem x (m)", br(P0[0], 2), { num: true }) + campo("y", "Origem y (m)", br(P0[1], 2), { num: true }) + campo("z", "Origem z (m)", br(P0[2], 2), { num: true }) + "</div>" +
        '<p class="muted" style="font-size:11px;margin:0">Medidas EXTERNAS da forma; a peça corre ao longo de x. A polilinha livre é pela linha média da espessura (cada vértice do meio vira uma dobra com o raio interno).</p>';
      UI.modal("Chapa dobrada", h, [{ texto: "Criar", classe: "primary", onClick: function () { self.criarDobrada(); } }, { texto: "Cancelar", onClick: function () { UI.fecharModal(); } }]);
    },
    criarDobrada: function (v) {
      v = v || { tipo: val("tipo"), d1: val("d1"), d2: val("d2"), d3: val("d3"), pts: val("pts"), t: val("t"), ri: val("ri"), L: val("L"), aco: val("aco"), x: val("x"), y: val("y"), z: val("z") };
      var tipo = v.tipo || "U", dims = {}, a = num(v.d1, 0), b = num(v.d2, 0), c3 = num(v.d3, 0);
      if (tipo === "L") dims = { a: a, b: b }; else if (tipo === "U" || tipo === "Z") dims = { h: a, b: b }; else if (tipo === "Ue") dims = { h: a, b: b, d: c3 }; else if (tipo === "cartola") dims = { h: a, bc: b, bf: c3 }; else dims = { pts: PL().lerPolilinha(v.pts) };
      var cx = PL().dobrada({ origem: [num(v.x, 0), num(v.y, 0), num(v.z, 0)], ex: [1, 0, 0], ey: [0, 1, 0], L: num(v.L, 0) / 1000, tipo: tipo, dims: dims, t: num(v.t, 0) / 1000, ri: num(v.ri, 0) / 1000, aco: v.aco || "ASTM A36" });
      if (cx.erro) { toast("Chapa dobrada: " + cx.erro, "erro", 9000); return null; }
      UI.fecharModal();
      U().criarPecas([cx], "Chapa dobrada criada (" + (cx.metal.perfilRotulo || "") + ")");
      var pl = PL().planificar(cx.metal.perfil, cx.metal.L, this.cfg());
      this.ultimo = { tipo: "dobrada", caixa: cx, planif: pl };
      toast("Chapa dobrada criada: planificada " + br(pl.Ld, 1) + " × " + br(pl.Lpeca, 0) + " mm, " + pl.dobras.length + " dobra(s). Fabricação › Planificação mostra as linhas de dobra.", "ok", 9000);
      return cx;
    },

    /* ============================================================ PLANIFICAÇÃO */
    planificacao: function () {
      var self = this, st = this.estado(); if (!st) { toast("Abra o modelador primeiro.", "aviso"); return; }
      var dobs = (st.caixas || []).filter(function (c) { return PL().ehDobrada(c); });
      if (!dobs.length) { toast("Não há chapa dobrada no modelo — crie em Fabricação › Chapa dobrada.", "aviso", 8000); return; }
      var c = this.cfg();
      var h = NAO_CALC + '<div style="' + CSS_CAMPOS + '">' + campo("kModo", "Fator K", c.kModo, { opcoes: [["padrao", "0,33 de partida (conferir com a dobradeira)"], ["tabela", "Tabela por ri/t (DIN 6935)"], ["manual", "Informado pela dobradeira"]] }) +
        campo("k", "K informado (0 a 0,5)", br(c.k, 2), { num: true }) + "</div>" + '<div data-mf="res-planif"></div>';
      UI.modal("Planificação das chapas dobradas", h, [
        { texto: "Recalcular", onClick: function () { self._planifCalc(true); } },
        { texto: "Baixar DXF", classe: "primary", onClick: function () { self._planifCalc(true); self.planifDxf(); } },
        { texto: "Fechar", onClick: function () { UI.fecharModal(); } }]);
      this._planifCalc(false);
    },
    _planifCalc: function (ler) {
      var c = this.cfg();
      if (ler) c = this.gravar({ kModo: val("kModo") || c.kModo, k: Math.max(0, Math.min(0.5, num(val("k"), c.k))) });
      var n = this.numeracao(), gs = n.grupos.filter(function (g) { return g.rep.kind === "chapa" && g.rep.dobras; });
      this.ultimo = { tipo: "planif", grupos: gs };
      var el = q('[data-mf="res-planif"]'); if (!el) return gs;
      el.innerHTML = gs.map(function (g) {
        var p = g.rep, d = p.dobrada;
        return '<h4 style="margin:10px 0 4px;font-size:13px">' + esc(g.marca) + " — " + esc(d.rot) + " · # " + br(d.t, 2) + " mm · " + g.ids.length + ' peça(s)</h4><p style="font-size:12px;margin:0 0 4px">Comprimento desenvolvido <b data-mf="ld">' + br(d.Ld, 1) + "</b> mm × " + br(p.B, 0) + " mm · K = " + br(d.K, 2) + " (" + esc(d.fonteK) + ")</p>" +
          '<table class="tbl tbl-compacta"><thead><tr><th>Dobra</th><th class="num">Posição (mm)</th><th class="num">Ângulo</th><th>Sentido</th><th class="num">Ri (mm)</th><th class="num">Desenv. da dobra (mm)</th></tr></thead><tbody>' +
          p.dobras.map(function (x) { return "<tr><td>D" + x.n + '</td><td class="num">' + br(x.x, 1) + '</td><td class="num">' + br(x.ang, 1) + "°</td><td>" + (x.sentido === "cima" ? "para cima" : "para baixo") + '</td><td class="num">' + br(x.ri, 1) + '</td><td class="num">' + br(x.BA, 2) + "</td></tr>"; }).join("") + "</tbody></table>" +
          (d.avisos || []).map(function (a) { return aviso(esc(a), /trinca/.test(a) ? "erro" : "aviso"); }).join("");
      }).join("");
      return gs;
    },
    planifDxf: function () {
      var gs = this._planifCalc(false), arqs = {};
      gs.forEach(function (g) { arqs["PLANIFICACAO/" + g.marca + ".dxf"] = F().dxfChapa(g.rep, g.marca); });
      var z = U().zip(arqs); if (!z) { toast("O gerador de .zip não carregou.", "erro"); return; }
      var nome = this.nomeArq("planificacao-dxf.zip"); this.baixar(nome, z, "application/zip");
      this.ultimo = { tipo: "planif", grupos: gs, arquivos: arqs, zip: nome };
      toast(gs.length + " DXF de planificação (CUT_OUTSIDE, BEND, BEND_TEXT, ETCH) no .zip. Confira o K com a dobradeira antes de cortar.", "ok", 9000);
    },

    /* ============================================================ PINTURA E PESO
     * De 1 a 4 demãos (nome + rendimento m²/L). COM o catálogo industrial (js/acocatalogoind.js) entra o seletor "Sistema por ambiente":
     * ambiente ISO 12944-2 × durabilidade (ISO 12944-1) × aplicação preenche as demãos com o sistema típico (ligante e EPS de cada
     * demão), o SV (sólidos por volume) da ficha técnica de cada família — editável — e o rendimento teórico = SV × 10 ÷ EPS; a perda
     * passa a ser a fração da tinta que não chega ao aço (litros = m² ÷ rendimento ÷ (1 − perda)) e o resultado mostra o preparo de
     * superfície. SEM o catálogo, ou com "nenhum" no seletor, é o diálogo de sempre (litros = m² × (1 + perda) ÷ rendimento). */
    pintura: function () {
      var self = this, n = this.numeracao(); if (!n) return;
      if (!n.grupos.length) { toast("Não há peça de aço no modelo.", "aviso"); return; }
      var CI = this.catalogo(), c = this.cfg(), sel = CI ? c.sisSel : null;
      this._sis = CI && sel && sel.amb ? CI.sistemaPintura(sel.amb, sel.dur || "H") : null;
      var sis = !!this._sis, dm = c.demaos, grade = "";
      for (var i = 0; i < 4; i++) {
        var d = dm[i] || {}, rotN = i === 0 ? "1ª demão" : (i === 1 ? "2ª demão (vazio = só uma)" : (i + 1) + "ª demão (vazio = não usar)");
        grade += campo("d" + i + "n", rotN, d.nome || (i === 0 ? "Fundo (primer)" : ""), {}) + campo("d" + i + "r", "Rendimento " + (i + 1) + "ª demão (m²/L)", d.rendimento ? br(d.rendimento, 1) : (i === 0 ? br(10, 1) : ""), { num: true, partida: true });
      }
      var corpo = '<div style="' + CSS_CAMPOS + '">' + grade + campo("perda", "Perda de aplicação (%)", br(c.perda, 0), { num: true, partida: true }) + campo("bordas", "Somar as bordas das chapas", c.bordas, { check: true }) + "</div>";
      var caixa = "";
      if (CI) {
        var amb = [["", "— nenhum (rendimentos digitados) —"]].concat(CI.AMBIENTES.map(function (a) { return [a[0], a[0] + " — " + a[1]]; }));
        caixa = '<div data-mf="sis-caixa" style="border:1px solid var(--linha);border-radius:8px;padding:10px 12px;margin:0 0 10px"><b style="font-size:13px">Sistema de pintura por ambiente</b> <span class="muted" style="font-size:11px">(catálogo industrial, ISO 12944 — referência de fabricante; conferir a ficha da tinta)</span>' +
          '<div style="' + CSS_CAMPOS + ';margin-top:8px">' + campo("sisAmb", "Ambiente (ISO 12944-2)", sel ? sel.amb : "", { opcoes: amb }) +
          campo("sisDur", "Durabilidade (ISO 12944-1)", sel && sel.dur ? sel.dur : "H", { opcoes: [["L", "Baixa (L)"], ["M", "Média (M)"], ["H", "Alta (H)"], ["VH", "Muito alta (VH)"]] }) +
          campo("sisMet", "Aplicação (perda de partida)", sel && sel.met ? sel.met : "", { opcoes: [["", "— digitar a perda —"], ["convencional", "Pistola convencional / HVLP (Hempel: ~1/3 se perde no ar)"], ["airless", "Airless (sem percentual publicado)"], ["rolo", "Rolo (sem percentual publicado)"], ["trincha", "Trincha (sem percentual publicado)"]] }) + "</div>" +
          '<div data-mf="sis-demaos" style="' + CSS_CAMPOS + ';display:' + (sis ? "grid" : "none") + '">' + [0, 1, 2, 3].map(function (k) { var d = dm[k] || {}; return campo("d" + k + "e", "Demão " + (k + 1) + " — EPS seca (µm)", d.eps_um != null ? br(d.eps_um, 0) : "", { num: true }) + campo("d" + k + "s", "Demão " + (k + 1) + " — SV (%)", d.sv_pct != null ? br(d.sv_pct, 1) : "", { num: true }); }).join("") + "</div>" +
          '<div data-mf="sis-info"></div></div>';
      }
      var h = NAO_CALC + caixa + corpo;
      h += '<div data-mf="res-pintura"></div>';
      var bg = UI.modal("Área de pintura e peso", h, [
        { texto: "Recalcular", onClick: function () { self._pinturaCalc(true); } },
        { texto: "Baixar .xlsx", classe: "primary", onClick: function () { self._pinturaCalc(true); self.pinturaXlsx(); } },
        { texto: "Lançar no orçamento", onClick: function () { self._pinturaCalc(true); self.pinturaOrcamento(); } },
        { texto: "Fechar", onClick: function () { UI.fecharModal(); } }]);
      if (CI && bg && bg.addEventListener) bg.addEventListener("change", function (ev) {
        var k = ev.target && ev.target.getAttribute ? ev.target.getAttribute("data-mf-campo") : null;
        if (k === "sisAmb" || k === "sisDur") self._pinturaSistema();
        else if (k === "sisMet") self._pinturaMetodo();
        else if (/^d[0-3][es]$/.test(k || "")) self._pinturaCalc(true);
      });
      this._pinturaMarcar();
      this._pinturaCalc(false);
    },
    /* o catálogo industrial, se carregou (sem ele o diálogo é o de sempre) */
    catalogo: function () { var C = global.AcoCatalogoInd; return C && C.sistemaPintura && C.consumoTinta && C.AMBIENTES ? C : null; },
    /* rendimento do campo "rendimento" travado (só leitura) enquanto o sistema manda (SV × 10 ÷ EPS) */
    _pinturaMarcar: function () {
      var sis = !!this._sis;
      [0, 1, 2, 3].forEach(function (k) { var e = q('[data-mf-campo="d' + k + 'r"]'); if (e) e.readOnly = sis && !!String(val("d" + k + "e") || "").trim(); });
      var bl = q('[data-mf="sis-demaos"]'); if (bl) bl.style.display = sis ? "grid" : "none";
    },
    _pinturaSet: function (id, v) { var e = q('[data-mf-campo="' + id + '"]'); if (!e) return; if (e.type === "checkbox") e.checked = !!v; else e.value = v == null ? "" : String(v); },
    /* ambiente/durabilidade/aplicação mudaram: busca o sistema no catálogo e preenche as demãos (EPS, SV da família, rendimento teórico) */
    _pinturaSistema: function () {
      var CI = this.catalogo(), self = this, amb = val("sisAmb"), dur = val("sisDur") || "H", info = q('[data-mf="sis-info"]');
      this._sis = null; if (!CI) return;
      if (!amb) { if (info) info.innerHTML = ""; this._pinturaMarcar(); this._pinturaCalc(true); return; }
      var s = CI.sistemaPintura(amb, dur);
      if (!s) {
        if (info) info.innerHTML = aviso("Não há sistema de pintura com fonte para " + amb + " / " + dur + " neste catálogo — consulte o fabricante da tinta (ISO 12944-5) e digite os rendimentos.", "aviso");
        this._pinturaMarcar(); this._pinturaCalc(true); return;
      }
      this._sis = s;
      for (var i = 0; i < 4; i++) {
        var d = arr(s.demaos)[i];
        if (!d) { ["n", "r", "e", "s"].forEach(function (p) { self._pinturaSet("d" + i + p, ""); }); continue; }
        var svl = d.sv_pct != null ? { sv: d.sv_pct } : CI.svDeLigante(d.ligante), sv = svl ? svl.sv : null, eps = d.eps_um;
        this._pinturaSet("d" + i + "n", (d.funcao ? d.funcao + " — " : "") + (d.ligante || "demão " + (i + 1)) + (eps != null ? " (" + br(eps, 0) + " µm)" : ""));
        this._pinturaSet("d" + i + "e", eps != null ? br(eps, 0) : ""); this._pinturaSet("d" + i + "s", sv != null ? br(sv, 1) : "");
        this._pinturaSet("d" + i + "r", sv != null && eps > 0 ? br(sv * 10 / eps, 2) : "");
      }
      this._pinturaMarcar();
      this._pinturaMetodo();
    },
    /* a aplicação mudou (ou o sistema foi trocado): a perda de partida do catálogo entra no campo — só quando o catálogo TEM percentual para o método
       (hoje: pistola convencional/HVLP, regra da Hempel); sem percentual publicado o campo fica como a pessoa digitou. Não mexe nas demãos nem no SV */
    _pinturaMetodo: function () {
      var CI = this.catalogo(), s = this._sis, met = val("sisMet");
      if (CI && s && met) { var cc = CI.consumoTinta(1, s, { metodo: met }); if (cc && cc.ok && cc.perdaPct > 0) this._pinturaSet("perda", br(cc.perdaPct, 1)); }
      this._pinturaCalc(true);
    },
    _pinturaCalc: function (ler) {
      var CI = this.catalogo(), c = this.cfg(), sisObj = null, self = this;
      if (ler) {
        var amb = CI ? val("sisAmb") : "", dur = CI ? (val("sisDur") || "H") : "", met = CI ? val("sisMet") : "";
        var S = CI && this._sis && amb ? this._sis : null, dm = [];
        for (var i = 0; i < 4; i++) {
          var nome = String(val("d" + i + "n") || "").trim(), rend = num(val("d" + i + "r"), 0), eps = num(val("d" + i + "e"), null), sv = num(val("d" + i + "s"), null);
          if (S && eps > 0 && sv > 0 && sv <= 100) rend = sv * 10 / eps;   /* com o sistema o rendimento é o teórico da ficha */
          var sd = S ? arr(S.demaos)[i] : null, o = { nome: nome || "Demão " + (i + 1), rendimento: rend };
          if (S) { if (eps != null) o.eps_um = eps; if (sv != null) o.sv_pct = sv; if (sd && sd.ligante) o.ligante = sd.ligante; if (sd && sd.funcao) o.funcao = sd.funcao; if (sd && sd.produto) o.produto = sd.produto;
                   var svl = sd && sd.sv_pct == null && sd.ligante ? CI.svDeLigante(sd.ligante) : null; if (svl && sv != null && Math.abs(sv - svl.sv) < 0.06) o.svFaixa = [svl.min, svl.max]; }
          if (i === 0 || (nome && (rend > 0 || S))) dm.push(o);
        }
        if (S) {
          sisObj = { id: S.id, ambiente: amb, durabilidade: dur, preparo: S.preparo || "", epsTotal_um: S.epsTotal_um == null ? null : S.epsTotal_um, referencia: S.referencia || "", conferir: !!S.conferir, pendencia: S.pendencia || "", viaEquivalencia: S.viaEquivalencia || null };
          dm = dm.filter(function (d) { return d.nome && (d.rendimento > 0 || d.eps_um != null || d.sv_pct != null); });
        } else dm = dm.filter(function (d) { return d.rendimento > 0; });
        c = this.gravar({ demaos: dm, perda: num(val("perda"), 0), bordas: !!val("bordas"), sistema: sisObj, perdaModo: sisObj ? "transferencia" : "acrescimo", sisSel: CI && amb ? { amb: amb, dur: dur, met: met } : null });
        this._pinturaMarcar();
      }
      /* sem o catálogo carregado o cálculo é SEMPRE o de sempre, mesmo que o que ficou lembrado seja de um sistema */
      var cc = c; if (!CI || !this._sis) cc = { demaos: c.demaos, perda: c.perda, bordas: c.bordas, perdaModo: "acrescimo" };
      else if (!ler && c.sistema) { cc = c; }
      var r = PI().calcular(this.numeracao(), cc);
      this.ultimo = { tipo: "pintura", r: r };
      var el = q('[data-mf="res-pintura"]'); if (!el) return r;
      var S2 = r.sistema, tintaTxt = r.tinta.map(function (t) { return esc(t.demao) + " " + br(t.litros, 1) + " L" + (t.litrosFaixa && Math.abs(t.litrosFaixa[1] - t.litrosFaixa[0]) > 0.05 ? " (" + br(t.litrosFaixa[0], 1) + "–" + br(t.litrosFaixa[1], 1) + ")" : ""); }).join(" · ");
      el.innerHTML = '<table class="tbl tbl-compacta" data-mf="tab-pintura"><thead><tr><th>Marca</th><th>Tipo</th><th>Perfil / chapa</th><th class="num">Qtd</th><th class="num">Peso total (kg)</th><th class="num">Pintura total (m²)</th><th>Como foi medido</th></tr></thead><tbody>' +
        r.porMarca.map(function (m) { return "<tr><td>" + esc(m.marca) + "</td><td>" + esc(m.tipo) + "</td><td>" + esc(nomeP(m.perfil)) + '</td><td class="num">' + m.qtd + '</td><td class="num">' + br(m.kgTotal, 1) + '</td><td class="num">' + br(m.m2Total, 2) + '</td><td class="muted" style="font-size:11px">' + esc(m.fonte) + "</td></tr>"; }).join("") +
        '<tr style="font-weight:600"><td>Total</td><td></td><td></td><td class="num">' + r.total.pecas + '</td><td class="num" data-mf="kg">' + br(r.total.kg, 1) + '</td><td class="num" data-mf="m2">' + br(r.total.m2, 2) + "</td><td>" + br(r.total.m2t, 1) + " m²/t</td></tr></tbody></table>" +
        (S2 ? '<div data-mf="sis-res" style="font-size:12px;margin:8px 0 0"><b>Sistema ' + esc(S2.id) + "</b> (" + esc(S2.ambiente) + ", durabilidade " + esc(S2.durabilidade) + ") — <b>preparo de superfície:</b> " + esc(S2.preparoGrau ? S2.preparoGrau + " (ISO 8501-1)" : (S2.preparo || "conforme a ficha do primer")) + " em " + br(r.total.m2, 2) + " m²" +
          (S2.epsTotal_um != null ? " — EPS total " + br(S2.epsTotal_um, 0) + " µm" : "") + (S2.conferir ? ' <span class="muted">(conferir: ' + esc(S2.pendencia || "ver a fonte") + ")</span>" : "") + (S2.viaEquivalencia ? " — sistema de " + esc(S2.viaEquivalencia) + " por equivalência da ISO 12944-5" : "") + "</div>" : "") +
        '<p style="font-size:12px;margin:8px 0 0" data-mf="tinta"><b>Tinta:</b> ' + tintaTxt + " — total " + br(r.litros, 1) + " L" + (r.litrosFaixa && r.completo !== false && Math.abs(r.litrosFaixa[1] - r.litrosFaixa[0]) > 0.05 ? " (faixa pelo SV das fichas: " + br(r.litrosFaixa[0], 1) + "–" + br(r.litrosFaixa[1], 1) + " L)" : "") + "</p>" +
        (S2 ? '<p class="muted" style="font-size:11px;margin:2px 0 0">Litros = área ÷ rendimento teórico (SV × 10 ÷ EPS) ÷ (1 − perda de ' + br(r.config.perda, 0) + " %)." + (r.config.perda ? "" : " Nenhuma perda aplicada: informe a do seu método.") + " Estimativa de ficha técnica.</p>" : "") +
        (r.pendentes && r.pendentes.length ? aviso("Demão sem SV (fora da soma): " + r.pendentes.join("; "), "aviso") : "");
      status("Pintura: " + br(r.total.m2, 1) + " m², " + br(r.total.kg, 0) + " kg de aço, " + br(r.litros, 1) + " L de tinta.");
      return r;
    },
    pinturaXlsx: function () {
      var r = this.ultimo && this.ultimo.tipo === "pintura" ? this.ultimo.r : this._pinturaCalc(false), self = this, nome = this.nomeArq("pintura-e-peso.xlsx");
      this.excel(function (X) { return PI().xlsxPintura(r, X, { obra: U() ? U().nomeObra() : "" }); }, nome, function () { self.ultimo = { tipo: "pintura", r: r, xlsx: nome }; toast("Pintura e peso: " + br(r.total.m2, 1) + " m², " + br(r.total.kg, 0) + " kg — " + nome + ".", "ok"); });
    },
    pinturaOrcamento: function () {
      var r = this.ultimo && this.ultimo.tipo === "pintura" ? this.ultimo.r : this._pinturaCalc(false), lev = PI().linhasOrcamento(r);
      this.ultimo = { tipo: "pintura", r: r, orcamento: lev };
      if (!global.App || !App.criarOrcamentoDoBIM) { toast("O orçamento não está disponível nesta tela.", "aviso"); return; }
      UI.fecharModal();
      App.criarOrcamentoDoBIM(lev, U() ? U().nomeObra() : "");
    },

    /* ============================================================ NESTING */
    nesting: function () {
      var self = this, n = this.numeracao(); if (!n) return;
      if (!n.grupos.some(function (g) { return g.rep.kind === "chapa"; })) { toast("Não há chapa no modelo para o nesting.", "aviso"); return; }
      var c = this.cfg();
      var h = NAO_CALC + '<div style="' + CSS_CAMPOS + '">' + campo("chapas", "Chapas comerciais (mm)", c.chapas.map(function (x) { return x[0] + "x" + x[1]; }).join("; "), { partida: true }) +
        campo("folga", "Folga entre peças (mm)", c.folga, { num: true, partida: true }) + campo("borda", "Borda da chapa (mm)", c.borda, { num: true, partida: true }) + "</div>" + '<div data-mf="res-nesting"></div>';
      UI.modal("Nesting de chapas", h, [
        { texto: "Recalcular", onClick: function () { self._nestingCalc(true); } },
        { texto: "Baixar PDF", classe: "primary", onClick: function () { self._nestingCalc(true); self.nestingPdf(); } },
        { texto: "Baixar .xlsx", onClick: function () { self._nestingCalc(true); self.nestingXlsx(); } },
        { texto: "Fechar", onClick: function () { UI.fecharModal(); } }]);
      this._nestingCalc(false);
    },
    _nestingCalc: function (ler) {
      var c = this.cfg();
      if (ler) { var ch = CO().lerChapas(val("chapas")); c = this.gravar({ chapas: ch.length ? ch : c.chapas, folga: num(val("folga"), c.folga), borda: num(val("borda"), c.borda) }); }
      var r = CO().nestingChapas(CO().itensChapas(this.numeracao()), c);
      this.ultimo = { tipo: "nesting", r: r };
      var el = q('[data-mf="res-nesting"]'); if (!el) return r;
      el.innerHTML = '<table class="tbl tbl-compacta" data-mf="tab-nesting"><thead><tr><th>Espessura</th><th>Aço</th><th>Chapas a comprar</th><th class="num">Aproveitamento</th><th class="num">Comprado (kg)</th><th class="num">Perda (kg)</th></tr></thead><tbody>' +
        r.grupos.map(function (g) { return "<tr><td># " + br(g.t, 1) + " mm</td><td>" + esc(g.aco) + "</td><td>" + g.compra.map(function (x) { return x.quantidade + " × " + esc(x.formato); }).join(" + ") + '</td><td class="num">' + br(g.aproveitamento, 1) + ' %</td><td class="num">' + br(g.kgChapas, 1) + '</td><td class="num">' + br(g.perdaKg, 1) + "</td></tr>"; }).join("") +
        '<tr style="font-weight:600"><td>Total</td><td></td><td>' + r.totais.chapas + ' chapa(s)</td><td class="num" data-mf="aprov">' + br(r.totais.aproveitamento, 1) + ' %</td><td class="num">' + br(r.totais.kgChapas, 1) + '</td><td class="num">' + br(r.totais.perdaKg, 1) + "</td></tr></tbody></table>" +
        (r.totais.fora ? aviso(r.totais.fora + " peça(s) maiores que a maior chapa comercial: comprar chapa especial.", "erro") : "") +
        '<p class="muted" style="font-size:11px;margin:6px 0 0">Pelo retângulo envolvente de cada peça (inclusive as chapas dobradas planificadas). O DXF de chapas (Fabricação › DXF) sai com este arranjo.</p>';
      status("Nesting: " + r.totais.chapas + " chapa(s), aproveitamento " + br(r.totais.aproveitamento, 1) + " %.");
      return r;
    },
    nestingPdf: function () {
      var r = this.ultimo && this.ultimo.tipo === "nesting" ? this.ultimo.r : this._nestingCalc(false), f = FD().folhasNesting(r, this.opFolhas());
      if (!f.ok) { toast(f.avisos.join(" "), "erro"); return; }
      var nome = this.nomeArq("nesting-chapas.pdf"); this.pdfBaixar(f.folhas, nome, "Nesting de chapas");
      this.ultimo = { tipo: "nesting", r: r, pdf: nome, folhas: f.folhas.length };
      toast("Nesting em PDF: " + f.folhas.length + " folha(s), aproveitamento " + br(r.totais.aproveitamento, 1) + " %.", "ok");
    },
    nestingXlsx: function () {
      var r = this.ultimo && this.ultimo.tipo === "nesting" ? this.ultimo.r : this._nestingCalc(false), self = this, nome = this.nomeArq("nesting-chapas.xlsx");
      this.excel(function (X) { return CO().xlsxNesting(r, X, { obra: U() ? U().nomeObra() : "" }); }, nome, function () { self.ultimo = { tipo: "nesting", r: r, xlsx: nome }; toast("Nesting: " + r.totais.chapas + " chapa(s) — " + nome + ".", "ok"); });
    },

    /* ============================================================ DESENHO DE FABRICAÇÃO */
    desenhos: function () {
      var self = this, n = this.numeracao(); if (!n) return;
      if (!n.grupos.length) { toast("Não há peça de aço no modelo.", "aviso"); return; }
      var h = NAO_CALC + '<p style="font-size:13px;margin:0 0 8px">Uma folha A3 por <b>marca</b> (' + n.grupos.length + ") e por <b>conjunto soldado</b> (" + n.conjuntos.filter(function (c) { return c.partes.length; }).length + ") no Padrão RA, com o carimbo: vista com a furação cotada a partir da ponta, cortes, chanfros, dobras, solda (AWS A2.4) e a lista de material da marca.</p>" +
        '<div style="' + CSS_CAMPOS + '">' + campo("marca", "Só a marca (vazio = todas)", "", { opcoes: [["", "Todas as marcas"]].concat(n.grupos.map(function (g) { return [g.marca, g.marca + " — " + (g.rep.nomePerfil || g.rep.papel)]; })) }) + "</div>";
      UI.modal("Desenho de fabricação", h, [
        { texto: "Caderno em PDF", classe: "primary", onClick: function () { self.caderno(val("marca")); } },
        { texto: "PDF por marca (.zip)", onClick: function () { self.pdfPorMarca(val("marca")); } },
        { texto: "Enviar às Pranchas", onClick: function () { UI.fecharModal(); if (U() && U().desenhosPrancha) U().desenhosPrancha(); } },
        { texto: "Fechar", onClick: function () { UI.fecharModal(); } }]);
    },
    folhas: function (marca) {
      var st = this.estado(); if (!st) return null;
      var op = this.opFolhas(); if (marca) op.marcas = [marca];
      op.numeracao = this.numeracao();
      return FD().folhasFabricacao(st, op);
    },
    caderno: function (marca) {
      var r = this.folhas(marca); if (!r || !r.ok || !r.folhas.length) { toast("Não gerei as folhas: " + ((r && r.avisos || []).join(" ") || "sem peça"), "erro"); return; }
      var nome = this.nomeArq(marca ? "fabricacao-" + marca + ".pdf" : "caderno-fabricacao.pdf"), b = this.pdfBaixar(r.folhas, nome, "Desenhos de fabricação");
      this.ultimo = { tipo: "desenho", folhas: r.folhas.length, marcas: r.folhas.map(function (f) { return f.marca; }), pdf: nome, bytes: b ? b.length : 0, avisos: r.avisos };
      toast("Caderno de fabricação: " + r.folhas.length + " folha(s) A3 em PDF (Padrão RA, carimbo RA)." + (r.avisos.length ? " " + r.avisos.length + " aviso(s)." : ""), "ok", 9000);
    },
    pdfPorMarca: function (marca) {
      var r = this.folhas(marca); if (!r || !r.ok || !r.folhas.length) { toast("Não gerei as folhas.", "erro"); return; }
      var arqs = {};
      r.folhas.forEach(function (f) { arqs["FABRICACAO/" + f.id + ".pdf"] = FD().pdf([f], f.titulo); });
      var z = U().zip(arqs); if (!z) { toast("O gerador de .zip não carregou.", "erro"); return; }
      var nome = this.nomeArq("fabricacao-pdf-por-marca.zip"); this.baixar(nome, z, "application/zip");
      this.ultimo = { tipo: "desenho", folhas: r.folhas.length, arquivos: Object.keys(arqs), zip: nome };
      toast(r.folhas.length + " PDF (um por marca e por conjunto) no .zip.", "ok", 9000);
    },

    /* ============================================================ DICAS (DicaRica) */
    DICAS: {
      "met-corte": ["Lista de corte", "Junta as peças de cada perfil e aço e encaixa os comprimentos nas barras comerciais (6 m e 12 m), descontando a serra a cada corte.", "Na compra do aço e no corte em serra: quantas barras pedir, o plano barra a barra, as sobras para estoque e a perda em kg e %.", "Barra de 12 m nem sempre existe em toda bitola: ajuste os comprimentos com o fornecedor antes de comprar.",
        '<rect x="20" y="60" width="280" height="22" fill="#c5d0dc" stroke="#4f6275" stroke-width="1.2"/><rect x="20" y="60" width="120" height="22" fill="#e9a23b" stroke="#a86a10" stroke-width="1.2"/><rect x="144" y="60" width="100" height="22" fill="#e9a23b" stroke="#a86a10" stroke-width="1.2"/><line x1="142" y1="52" x2="142" y2="90" stroke="#1d2733" stroke-width="1.6"/><line x1="246" y1="52" x2="246" y2="90" stroke="#1d2733" stroke-width="1.6"/><text x="80" y="110" font-size="11" font-family="sans-serif" fill="#1d2733" text-anchor="middle">P1</text><text x="194" y="110" font-size="11" font-family="sans-serif" fill="#1d2733" text-anchor="middle">P2</text><text x="272" y="110" font-size="11" font-family="sans-serif" fill="#1d2733" text-anchor="middle">sobra</text><text x="160" y="150" font-size="11" font-family="sans-serif" fill="#1d2733" text-anchor="middle">barra de 12 m</text>'],
      "met-dobrada": ["Chapa dobrada", "Peça de chapa fina dobrada (L, U, Ue, Z, cartola ou polilinha livre) com espessura e raio interno; o 3D, o peso e o IFC saem dela.", "Rufos, calhas, perfis de acabamento, cantoneiras e Us dobrados em dobradeira.", "Raio interno menor que a espessura pode trincar: confira com a dobradeira e o aço.",
        '<polyline points="80,60 60,60 60,150 200,150 200,60 220,60" fill="none" stroke="#a86a10" stroke-width="8.4" stroke-linejoin="round"/><polyline points="80,60 60,60 60,150 200,150 200,60 220,60" fill="none" stroke="#e9a23b" stroke-width="6" stroke-linejoin="round"/><text x="130" y="175" font-size="11" font-family="sans-serif" fill="#1d2733" text-anchor="middle">t e raio interno</text>'],
      "met-planif": ["Planificação", "O comprimento desenvolvido da chapa dobrada pelo fator K e a chapa plana com as linhas de dobra, o ângulo e o sentido de cada dobra — e o DXF para o corte.", "Antes de cortar a chapa que vai para a dobradeira.", "K = 0,33 é de partida: a dobradeira informa o K da ferramenta e do aço dela.",
        '<rect x="40" y="70" width="240" height="60" fill="#c5d0dc" stroke="#4f6275" stroke-width="1.2"/><line x1="110" y1="62" x2="110" y2="138" stroke="#1d2733" stroke-width="1.2" stroke-dasharray="8 3 2 3"/><line x1="210" y1="62" x2="210" y2="138" stroke="#1d2733" stroke-width="1.2" stroke-dasharray="8 3 2 3"/><text x="110" y="55" font-size="11" font-family="sans-serif" fill="#1d2733" text-anchor="middle">D1 90°</text><text x="210" y="55" font-size="11" font-family="sans-serif" fill="#1d2733" text-anchor="middle">D2 90°</text><text x="160" y="155" font-size="11" font-family="sans-serif" fill="#1d2733" text-anchor="middle">Ld = abas + dobras (K)</text>'],
      "met-nesting": ["Nesting de chapas", "Arruma as chapas de cada espessura e aço nas chapas comerciais (1200 × 3000, 1500 × 3000, 1500 × 6000…) pelo retângulo envolvente e diz o aproveitamento.", "Na compra de chapa e no corte a laser, plasma ou oxicorte.", "A folga entre peças depende do processo: laser pede menos que oxicorte.",
        '<rect x="30" y="40" width="260" height="120" fill="#c5d0dc" stroke="#4f6275" stroke-width="1.2"/><rect x="38" y="48" width="90" height="60" fill="#e9a23b" stroke="#a86a10" stroke-width="1.2"/><rect x="134" y="48" width="70" height="40" fill="#e9a23b" stroke="#a86a10" stroke-width="1.2"/><rect x="134" y="94" width="40" height="40" fill="#e9a23b" stroke="#a86a10" stroke-width="1.2"/><rect x="38" y="114" width="60" height="38" fill="#e9a23b" stroke="#a86a10" stroke-width="1.2"/><text x="160" y="180" font-size="11" font-family="sans-serif" fill="#1d2733" text-anchor="middle">aproveitamento %</text>'],
      "met-pintura": ["Pintura e peso", "Área de pintura (perímetro do perfil × comprimento; chapas dos dois lados) e peso por peça, por marca e total, com a tinta de 1 a 4 demãos pelo rendimento — ou pelo SISTEMA DE PINTURA do ambiente (ISO 12944: demãos, EPS, preparo de superfície e litros).", "No orçamento da pintura e do aço — vira linha do orçamento (preparo em m², pintura em m² e tinta em L, sem preço nem código).", "O rendimento real está na ficha técnica da tinta (sólidos por volume e espessura seca): rendimento = SV × 10 ÷ EPS.",
        '<rect x="60" y="80" width="200" height="16" fill="#c5d0dc" stroke="#4f6275" stroke-width="1.2"/><rect x="152" y="96" width="16" height="50" fill="#c5d0dc" stroke="#4f6275" stroke-width="1.2"/><rect x="60" y="146" width="200" height="16" fill="#c5d0dc" stroke="#4f6275" stroke-width="1.2"/><polyline points="40,76 60,72 80,76 100,72 120,76 140,72 160,76 180,72 200,76 220,72 240,76 260,72 280,76" fill="none" stroke="#e9a23b" stroke-width="3"/><text x="160" y="185" font-size="11" font-family="sans-serif" fill="#1d2733" text-anchor="middle">m² = perímetro × comprimento</text>'],
      "met-desenho": ["Desenho de fabricação", "Uma folha A3 por marca e por conjunto soldado, no Padrão RA e com o carimbo: vista com a furação cotada da ponta, cortes, chanfros, dobras, solda AWS A2.4 e a lista de material.", "Na oficina: o que cada peça leva antes de ir para a montagem.", "Caderno em PDF com todas, PDF por marca (.zip) ou nas Pranchas do projeto.",
        '<rect x="30" y="30" width="260" height="150" fill="none" stroke="#1d2733" stroke-width="1.6"/><rect x="200" y="130" width="90" height="50" fill="none" stroke="#1d2733" stroke-width="1"/><rect x="50" y="70" width="130" height="30" fill="#c5d0dc" stroke="#4f6275" stroke-width="1.2"/><circle cx="160" cy="85" r="5" fill="#fff" stroke="#3a4652"/><circle cx="145" cy="85" r="5" fill="#fff" stroke="#3a4652"/><line x1="50" y1="115" x2="160" y2="115" stroke="#8a94a3" stroke-width="0.8" stroke-dasharray="3 3"/><text x="245" y="160" font-size="11" font-family="sans-serif" fill="#1d2733" text-anchor="middle">carimbo RA</text>']
    },
    registrarDicas: function () {
      /* o fator K escolhido (lembrado neste computador) vale para a planificação desde a abertura do BIM */
      try { var c = this.cfg(); if (PL()) PL().configurar({ kModo: c.kModo, k: c.k }); } catch (eK) {}
      var D = global.DicaRica, self = this; if (!D || !D.item) return;
      Object.keys(this.DICAS).forEach(function (cmd) {
        var d = self.DICAS[cmd], id = "mf-" + cmd;
        D.item(id, { titulo: d[0], oQueE: d[1], ondeUsa: d[2], dica: d[3], svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">' + d[4] + "</svg>" });
        D.registrar(cmd, id);
      });
    }
  };

  global.MetalFabUI = MetalFabUI;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalFabUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
