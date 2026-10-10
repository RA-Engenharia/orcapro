/* =====================================================================
 * metalui.js — a TELA da disciplina METÁLICA & MECÂNICA do OrçaPRO
 * Modela (prévia `?previa=modelador`). Fina: quem calcula a geometria, as
 * ligações, o galpão e os arquivos são os motores puros
 *   js/metalnorma.js  (furos, parafusos, distâncias da NBR 8800, solda)
 *   js/metalpeca.js   (chapa, perfil cortado, parafuso, peça mecânica)
 *   js/metalligacao.js (as macros de ligação)
 *   js/metalgalpao.js (o assistente de galpão)
 *   js/metalfab.js    (marcas, DSTV, DXF, listas, desenho de fabricação)
 * Aqui: a fita (painéis Peças, Ligações, Galpão, Fabricação), os diálogos e
 * a entrega dos arquivos. Sem a prévia NADA daqui aparece.
 *
 * ⚠ A tela diz, em todo diálogo: isto é MODELAGEM, DETALHAMENTO e
 *   FABRICAÇÃO — não é cálculo estrutural.
 * ===================================================================== */
(function (global) {
  "use strict";
  function B() { return global.BIM; }
  function M() { return global.BimMetal; }
  function L() { return global.BimMetalLig; }
  function F() { return global.BimMetalFab; }
  function NN() { return global.BimMetalNorma; }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function br(v, c) { return (Math.round(num(v, 0) * Math.pow(10, c == null ? 2 : c)) / Math.pow(10, c == null ? 2 : c)).toFixed(c == null ? 2 : c).replace(".", ","); }
  function junta(a, b) { Object.keys(b || {}).forEach(function (k) { a[k] = b[k]; }); return a; }
  function status(t) { try { if (global.BimShell && BimShell.status) BimShell.status(t); } catch (e) {} }
  function toast(t, tipo, ms) { try { if (global.UI) UI.toast(t, tipo || "ok", ms || 6000); } catch (e) {} }
  var NAO_CALCULO = '<p class="muted" style="font-size:12px;margin:0 0 8px" data-met="nao-calculo">Modelagem, detalhamento e fabricação — <b>não é cálculo estrutural</b>. Os valores que vêm preenchidos são de <b>partida</b> (editáveis); quem garante perfis, parafusos, chapas e soldas é o projeto estrutural.</p>';

  function previa() { var P = global.BimPrevia; if (!P || !P.modelador || !P.modelador()) return false; if (P.disciplina) { try { return P.disciplina("metalica") !== false; } catch (e) { return true; } } return true; }

  var BimMetalUI = {
    _G: null, _n: 0, ultimo: null,
    estado: function () { var b = B(), e = b && b.editarEstado ? b.editarEstado() : null; return e ? e.estado : null; },
    novoId: function () { BimMetalUI._n++; return "met-" + Date.now().toString(36) + "-" + BimMetalUI._n; },
    selecao: function () {
      var ids = [], b = B();
      try { var p = b && b.precisao ? b.precisao() : null; if (p) ids = p.selecao().map(String); } catch (e) {}
      if (!ids.length) { var G = this._G || global.Gestao, u = G && G._bimSelecao && G._bimSelecao.uid; if (u && /^edit:/.test(u)) ids = [String(u).slice(5)]; }
      return ids;
    },
    caixas: function (ids) { var st = this.estado(), por = {}; ((st && st.caixas) || []).forEach(function (c) { por[String(c.id)] = c; }); return ids.map(function (id) { return por[String(id)]; }).filter(Boolean); },
    enviar: function (op) {
      var b = B(); if (!b || !op) return false;
      if (op.op === "lote") return !!(b.editarLote && b.editarLote(op));
      return !!(b.b2Op && b.b2Op(op));
    },
    baixar: function (nome, dados, mime) {
      var G = this._G || global.Gestao;
      if (G && G._opBaixar) return G._opBaixar(nome, dados, mime);
      try { var bl = new Blob([dados], { type: mime || "application/octet-stream" }), u = URL.createObjectURL(bl), a = document.createElement("a"); a.href = u; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 5000); return true; } catch (e) { return false; }
    },
    nomeObra: function () { var G = this._G || global.Gestao, o = null; try { o = G && G._bimSel && global.Store ? Store.obter(Auth.empresaId(), "obras", G._bimSel) : null; } catch (e) {} return (o && o.nome) || "obra"; },
    arqBase: function () { var n = this.nomeObra(); return (global.OpFormato ? OpFormato.nomeSeguro(n) : n.replace(/[^\w.-]+/g, "-")); },

    /* ================================================= FITA */
    COMANDOS: {
      "Peças": [
        { id: "met-chapa", rotulo: "Chapa", icone: "quadrado", grande: true, dica: "Chapa paramétrica: retângulo ou contorno, espessura, furos em grade (furo-padrão = parafuso + 1,5 mm, NBR 8800), recortes e chanfros. Vai para o DXF de corte e para o DSTV." },
        { id: "met-perfil", rotulo: "Perfil\ncortado", icone: "regua", grande: true, dica: "Barra de perfil do catálogo (W, U, L, tubo — AISC e Gerdau) cortada no comprimento, com corte reto ou inclinado (ângulo na alma e na aba). Vai para o DSTV (serra e furação)." },
        { id: "met-enrijecedor", rotulo: "Enrijecedor", icone: "estrutura", grande: true, dica: "Enrijecedor no perfil I/U selecionado: chapas no plano da seção, soldadas na alma e nas mesas, com chanfro para livrar a concordância." },
        { id: "met-mecanica", rotulo: "Peça\nmecânica", icone: "ajustes", grande: true, dica: "Família paramétrica de peça mecânica: flange (disco com furação), suporte em L, eixo maciço e bucha." }
      ],
      "Ligações": [
        { id: "met-placa-base", rotulo: "Placa\nde base", icone: "pilar", grande: true, dica: "Placa de base no pilar selecionado: placa, chumbadores (comprimento pela placa + ancoragem), furos alargados e solda em volta do pilar." },
        { id: "met-chapa-ext", rotulo: "Chapa de\nextremidade", icone: "bloco", grande: true, dica: "Selecione a VIGA e depois o PILAR (ou a outra viga, na cumeeira): chapa soldada na ponta da viga, parafusos no gage e furos no apoio. A viga encosta na chapa." },
        { id: "met-cant-dupla", rotulo: "Cantoneira\ndupla", icone: "camadas", grande: true, dica: "Selecione a VIGA e o PILAR: duas cantoneiras na alma da viga, aparafusadas na viga e no pilar." },
        { id: "met-emenda", rotulo: "Emenda\ncobrejunta", icone: "link", grande: true, dica: "Selecione as DUAS vigas colineares: talas na alma (dos dois lados) e nas mesas, parafusos dos dois lados da emenda." },
        { id: "met-clip", rotulo: "Clip de\nterça", icone: "ima", grande: true, dica: "Selecione a TERÇA e a VIGA de cobertura: cantoneira soldada na mesa da viga e aparafusada na alma da terça." },
        { id: "met-contravento", rotulo: "Contra-\nventamento", icone: "grade", grande: true, dica: "Selecione a DIAGONAL e o APOIO: chapa gusset soldada no apoio, a diagonal aparafusada no gusset (a ponta recua do apoio)." },
        { id: "met-no", rotulo: "Nó de\ntreliça", icone: "alvo", grande: true, dica: "Selecione as barras que chegam no nó: um gusset aparafusado em todas; as pontas recuam até os grupos de parafusos não se tocarem." },
        { id: "met-conferir", rotulo: "Conferir\nfuros", icone: "checklist", grande: true, dica: "Confere as distâncias de TODOS os furos do modelo (entre furos e às bordas) pela NBR 8800 — aviso, não bloqueio." },
        { id: "met-apagar-lig", rotulo: "Desfazer\nligação", icone: "lixeira", grande: true, dica: "Apaga a ligação inteira da peça selecionada: chapas, parafusos e os furos que ela abriu." }
      ],
      "Galpão": [
        { id: "met-galpao", rotulo: "Assistente\nde galpão", icone: "casa", grande: true, dica: "Galpão de duas águas: pórticos de alma cheia ou treliçados, terças, tirantes, contraventamentos e colunas de tapamento, com os perfis do catálogo que você escolher e as ligações padrão aplicadas. Não dimensiona." }
      ],
      "Fabricação": [
        { id: "met-numerar", rotulo: "Numerar\npeças", icone: "lista", grande: true, dica: "Marca as peças (iguais = mesma marca: P1, CH12…) e os conjuntos de montagem (peça principal + o que é soldado nela = A1…). Sempre a mesma marca para o mesmo modelo." },
        { id: "met-desenho", rotulo: "Desenho de\nfabricação", icone: "prancha", grande: true, dica: "Uma folha por peça e por conjunto: vistas, furação cotada a partir da origem e a lista de furos — vai para as Pranchas do projeto." },
        { id: "met-dstv", rotulo: "DSTV\n(.nc1)", icone: "exportar", grande: true, dica: "Arquivos DSTV NC1 para serra, furadeira e corte — um por marca (perfis e chapas), num .zip." },
        { id: "met-dxf", rotulo: "DXF de\nchapas", icone: "baixar", grande: true, dica: "DXF 1:1 em mm para laser/plasma: CUT_OUTSIDE, CUT_INSIDE e ETCH, um por marca, e o aproveitamento numa chapa padrão." },
        { id: "met-listas", rotulo: "Listas\n(.xlsx)", icone: "planilha", grande: true, dica: "Lista de peças, de conjuntos, de parafusos/porcas/arruelas, de chapas e o resumo de peso por material (o mesmo peso do içamento)." },
        { id: "met-ifc", rotulo: "IFC de\nfabricação", icone: "estrutura", grande: true, dica: "IFC4 com IfcPlate, IfcMember, IfcBeam e IfcColumn agrupados em conjuntos (IfcElementAssembly), parafusos como IfcMechanicalFastener e os furos como aberturas." },
        { id: "met-pacote", rotulo: "Pacote da\nfábrica", icone: "pasta", grande: true, dica: "Tudo num .zip: DSTV, DXF, nesting, listas em Excel e o IFC de fabricação." },
        { id: "met-fontes", rotulo: "De onde vem\ncada número", icone: "livro", grande: true, dica: "As fontes de cada regra (NBR 8800, catálogos, DSTV) e o que é valor de partida a conferir." }
      ]
    },
    ids: function () { var o = []; var C = this.COMANDOS; Object.keys(C).forEach(function (k) { C[k].forEach(function (c) { o.push(c.id); }); }); return o; },
    registrar: function (reg, G) {
      this._G = G || this._G;
      var R = global.BimRibbon, self = this;
      if (!previa() || !R || !M() || !L()) return false;
      Object.keys(this.COMANDOS).forEach(function (pn) { R.acrescentar("metalica", "Metálica & Mecânica", pn, self.COMANDOS[pn]); });
      if (global.BimDisciplinas && global.BimDisciplinas.declarar) { try { global.BimDisciplinas.declarar(this.ids(), "metalica"); } catch (e) {} }
      var h = {
        "met-chapa": function () { self.dlgChapa(); }, "met-perfil": function () { self.dlgPerfil(); }, "met-enrijecedor": function () { self.dlgLigacao("enrijecedor"); }, "met-mecanica": function () { self.dlgMecanica(); },
        "met-placa-base": function () { self.dlgLigacao("placaBase"); }, "met-chapa-ext": function () { self.dlgLigacao("chapaExtremidade"); }, "met-cant-dupla": function () { self.dlgLigacao("cantoneiraDupla"); },
        "met-emenda": function () { self.dlgLigacao("emendaCobrejunta"); }, "met-clip": function () { self.dlgLigacao("clipTerca"); }, "met-contravento": function () { self.dlgLigacao("contraventamento"); }, "met-no": function () { self.dlgLigacao("noTrelica"); },
        "met-conferir": function () { self.conferirTudo(); }, "met-apagar-lig": function () { self.apagarLigacao(); },
        "met-galpao": function () { self.dlgGalpao(); },
        "met-numerar": function () { self.numerar(); }, "met-desenho": function () { self.desenhos(); }, "met-dstv": function () { self.exportar("dstv"); }, "met-dxf": function () { self.exportar("dxf"); },
        "met-listas": function () { self.listas(); }, "met-ifc": function () { self.ifc(); }, "met-pacote": function () { self.pacote(); }, "met-fontes": function () { self.fontes(); }
      };
      Object.keys(h).forEach(function (k) { reg[k] = function () { try { h[k](); } catch (e) { toast("Metálica: " + (e && e.message ? e.message : e), "erro", 8000); } return true; }; });
      /* a aba é NOVA: se a casca já estava montada, ela ressincroniza a barra de abas
         (BimShell._sincAbas — o mesmo mecanismo da troca de disciplina, que respeita o
         filtro: escolhida outra disciplina, a aba não aparece). Quando a casca monta
         depois, ela já nasce com a aba. */
      setTimeout(function () {
        try { var sh = global.BimShell; if (sh && sh._raiz && typeof sh._sincAbas === "function") sh._sincAbas(); } catch (e) {}
      }, 0);
      return true;
    },

    /* =============================================== DIÁLOGO genérico de campos */
    form: function (titulo, campos, ao, extraHtml, rotuloOk) {
      var h = NAO_CALCULO + (extraHtml || "") + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px 12px">';
      campos.forEach(function (c) {
        h += '<label style="display:flex;flex-direction:column;font-size:12px;gap:3px"><span>' + esc(c.rotulo) + (c.partida ? ' <i class="muted" title="valor de partida, editável">(partida)</i>' : "") + '</span>';
        if (c.opcoes) h += '<select data-met-campo="' + c.id + '">' + c.opcoes.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(c.valor) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>";
        else if (c.lista) h += '<input data-met-campo="' + c.id + '" list="met-dl-' + c.id + '" value="' + esc(c.valor) + '"><datalist id="met-dl-' + c.id + '">' + c.lista.map(function (o) { return '<option value="' + esc(o) + '">'; }).join("") + "</datalist>";
        else if (c.tipo === "check") h += '<input type="checkbox" data-met-campo="' + c.id + '"' + (c.valor ? " checked" : "") + ">";
        else h += '<input data-met-campo="' + c.id + '" value="' + esc(c.valor) + '"' + (c.num ? ' inputmode="decimal"' : "") + ">";
        h += "</label>";
      });
      h += "</div>";
      UI.modal(titulo, h, [
        { texto: rotuloOk || "Aplicar", classe: "primary", onClick: function () {
          var v = {};
          campos.forEach(function (c) { var el = document.querySelector('[data-met-campo="' + c.id + '"]'); if (!el) return; v[c.id] = c.tipo === "check" ? el.checked : el.value; });
          UI.fecharModal(); ao(v);
        } },
        { texto: "Cancelar", onClick: function () { UI.fecharModal(); } }
      ]);
    },
    parafusos: function () { return NN().PARAFUSOS.map(function (p) { return [p.id, p.id + (p.sistema === "POL" ? " (pol.)" : "")]; }); },
    classes: function () { var C = NN().CLASSES; return Object.keys(C).map(function (k) { return [k, C[k].nome]; }); },
    catalogo: function (serie) { var A = global.PerfisAco; if (!A) return []; return serie ? A.listar(serie) : ["W", "C", "L", "HSSR", "HSSC", "GERDAU"].reduce(function (o, s) { return o.concat(A.listar(s)); }, []); },
    pontoPadrao: function () {
      var cx = this.caixas(this.selecao())[0], b = B();
      if (cx) return [num(cx.cx, 0), num(cx.cy, 0), num(cx.cz, 0)];
      return [0, b && b.editarBase ? b.editarBase() : 0, 0];
    },

    /* ============================================================ PEÇAS */
    dlgChapa: function () {
      var self = this, P = this.pontoPadrao();
      this.form("Chapa paramétrica", [
        { id: "L", rotulo: "Comprimento (mm)", valor: 300, num: 1 }, { id: "B", rotulo: "Largura (mm)", valor: 200, num: 1 }, { id: "t", rotulo: "Espessura (mm)", valor: 12.5, num: 1, partida: 1 },
        { id: "plano", rotulo: "Plano", valor: "h", opcoes: [["h", "Horizontal (deitada)"], ["x", "Vertical, ao longo de X"], ["z", "Vertical, ao longo de Z"]] },
        { id: "parafuso", rotulo: "Parafuso dos furos", valor: "M20", opcoes: this.parafusos() }, { id: "furo", rotulo: "Furo", valor: "padrao", opcoes: [["padrao", "Padrão (db + 1,5)"], ["alargado", "Alargado"], ["pouco", "Pouco alongado"], ["muito", "Muito alongado"]] },
        { id: "nx", rotulo: "Furos ao longo (colunas)", valor: 2, num: 1 }, { id: "ny", rotulo: "Furos na largura (linhas)", valor: 2, num: 1 },
        { id: "borda", rotulo: "Borda até o furo (mm)", valor: NN().partida(20, "laminada").borda, num: 1, partida: 1 }, { id: "chanfro", rotulo: "Chanfro nos 4 cantos (mm)", valor: 0, num: 1 },
        { id: "recorte", rotulo: "Recorte central Ø (mm, 0 = sem)", valor: 0, num: 1 },
        { id: "x", rotulo: "Origem X (m)", valor: br(P[0], 3), num: 1 }, { id: "y", rotulo: "Origem Y (m)", valor: br(P[1], 3), num: 1 }, { id: "z", rotulo: "Origem Z (m)", valor: br(P[2], 3), num: 1 },
        { id: "aco", rotulo: "Aço", valor: "ASTM A36", lista: ["ASTM A36", "ASTM A572 Gr.50", "SAE 1020", "SAE 1045", "Inox AISI 304"] }
      ], function (v) { self.criarChapa(v); }, "", "Criar");
    },
    criarChapa: function (v) {
      var Lm = num(v.L, 300) / 1000, Bm = num(v.B, 200) / 1000, e = num(v.borda, 30) / 1000, nx = Math.max(0, Math.round(num(v.nx, 0))), ny = Math.max(0, Math.round(num(v.ny, 0))), p = NN().parafuso(v.parafuso || "M20");
      var furos = [];
      for (var i = 0; i < nx; i++) for (var j = 0; j < ny; j++) furos.push({ u: nx === 1 ? Lm / 2 : e + i * (Lm - 2 * e) / (nx - 1), v: ny === 1 ? Bm / 2 : e + j * (Bm - 2 * e) / (ny - 1), db: p.d, tipo: v.furo || "padrao" });
      var ch = num(v.chanfro, 0) / 1000, rec = num(v.recorte, 0) / 1000;
      var eixos = v.plano === "x" ? { ex: [1, 0, 0], ey: [0, 1, 0] } : (v.plano === "z" ? { ex: [0, 0, 1], ey: [0, 1, 0] } : { ex: [1, 0, 0], ey: [0, 0, -1] });
      var c = M().chapa({ origem: [num(v.x, 0), num(v.y, 0), num(v.z, 0)], ex: eixos.ex, ey: eixos.ey, t: num(v.t, 12.5) / 1000, ret: { L: Lm, B: Bm }, furos: furos, aco: v.aco,
        chanfros: ch > 0 ? [0, 1, 2, 3].map(function (k) { return { i: k, c: ch }; }) : [], recortes: rec > 0 ? [M().pol.circ(Lm / 2, Bm / 2, rec / 2, 48)] : [], papel: "Chapa" });
      if (c.erro) { toast(c.erro, "aviso"); return null; }
      var cf = L().conferirChapa(c);
      return this.criarPecas([c], "Chapa " + Math.round(Lm * 1000) + " × " + Math.round(Bm * 1000) + " × " + br(num(v.t, 12.5), 1) + " mm com " + furos.length + " furo(s)", cf.avisos);
    },
    criarPecas: function (cxs, resumo, avisos) {
      var self = this, ops = cxs.map(function (c) { return { op: "criar", id: self.novoId(), caixa: c }; });
      /* peça soldada em outra peça criada junto (suporte): "@base" vira o id */
      ops.forEach(function (o, i) { if (o.caixa.metal && o.caixa.metal.soldadaEm === "@base" && i > 0) o.caixa.metal.soldadaEm = ops[0].id; });
      var lote = { op: "lote", id: this.novoId(), origem: "metal-peca", ops: ops };
      if (!this.enviar(lote)) { toast("O editor recusou a peça.", "erro"); return null; }
      status(resumo + "." + (avisos && avisos.length ? " Atenção: " + avisos.map(function (a) { return a.texto || a; }).join("; ") + "." : "") + " Ctrl+Z desfaz.");
      if (avisos && avisos.length) this.mostrarAvisos(resumo, avisos.map(function (a) { return a.texto ? a.texto + " — NBR 8800 " + a.item : a; }));
      return lote;
    },
    dlgPerfil: function () {
      var self = this, P = this.pontoPadrao();
      this.form("Perfil cortado", [
        { id: "cat", rotulo: "Perfil (catálogo)", valor: "W200X26.6", lista: this.catalogo() }, { id: "L", rotulo: "Comprimento (mm)", valor: 3000, num: 1 },
        { id: "dir", rotulo: "Direção do eixo", valor: "x", opcoes: [["x", "Ao longo de X"], ["z", "Ao longo de Z"], ["y", "Vertical (Y)"]] },
        { id: "almaIni", rotulo: "Corte na alma, início (°)", valor: 0, num: 1 }, { id: "almaFim", rotulo: "Corte na alma, fim (°)", valor: 0, num: 1 },
        { id: "abaIni", rotulo: "Corte na aba, início (°)", valor: 0, num: 1 }, { id: "abaFim", rotulo: "Corte na aba, fim (°)", valor: 0, num: 1 },
        { id: "x", rotulo: "Início X (m)", valor: br(P[0], 3), num: 1 }, { id: "y", rotulo: "Início Y (m)", valor: br(P[1], 3), num: 1 }, { id: "z", rotulo: "Início Z (m)", valor: br(P[2], 3), num: 1 },
        { id: "aco", rotulo: "Aço", valor: "ASTM A572 Gr.50", lista: ["ASTM A36", "ASTM A572 Gr.50", "ASTM A992"] }
      ], function (v) {
        var ax = v.dir === "z" ? { ex: [0, 0, 1], ey: [0, 1, 0] } : (v.dir === "y" ? { ex: [0, 1, 0], ey: [1, 0, 0] } : { ex: [1, 0, 0], ey: [0, 1, 0] });
        var c = M().perfil({ origem: [num(v.x, 0), num(v.y, 0), num(v.z, 0)], ex: ax.ex, ey: ax.ey, cat: v.cat, L: num(v.L, 3000) / 1000, aco: v.aco, papel: "Perfil", ifc: v.dir === "y" ? "IFCCOLUMN" : "IFCMEMBER",
          cortes: { almaIni: num(v.almaIni, 0), almaFim: num(v.almaFim, 0), abaIni: num(v.abaIni, 0), abaFim: num(v.abaFim, 0) } });
        if (c.erro) { toast(c.erro, "aviso"); return; }
        self.criarPecas([c], "Perfil " + v.cat + " × " + Math.round(num(v.L, 3000)) + " mm");
      }, "", "Criar");
    },
    dlgMecanica: function () {
      var self = this, P = this.pontoPadrao();
      this.form("Peça mecânica", [
        { id: "tipo", rotulo: "Peça", valor: "flange", opcoes: [["flange", "Flange (disco com furação)"], ["suporte", "Suporte em L (2 chapas soldadas)"], ["eixo", "Eixo maciço"], ["bucha", "Bucha (tubo)"]] },
        { id: "D", rotulo: "Diâmetro externo / largura (mm)", valor: 200, num: 1 }, { id: "d", rotulo: "Furo central / interno (mm)", valor: 60, num: 1 },
        { id: "L", rotulo: "Comprimento / espessura (mm)", valor: 16, num: 1 }, { id: "n", rotulo: "Furos na flange", valor: 4, num: 1 }, { id: "Dc", rotulo: "Círculo de furação (mm)", valor: 150, num: 1 },
        { id: "parafuso", rotulo: "Parafuso", valor: "M12", opcoes: this.parafusos() },
        { id: "x", rotulo: "X (m)", valor: br(P[0], 3), num: 1 }, { id: "y", rotulo: "Y (m)", valor: br(P[1], 3), num: 1 }, { id: "z", rotulo: "Z (m)", valor: br(P[2], 3), num: 1 },
        { id: "aco", rotulo: "Material", valor: "SAE 1045", lista: ["SAE 1020", "SAE 1045", "ASTM A36", "Inox AISI 304"] }
      ], function (v) {
        var O = [num(v.x, 0), num(v.y, 0), num(v.z, 0)], mm = function (k, d) { return num(v[k], d) / 1000; }, r;
        if (v.tipo === "flange") r = M().flange({ origem: O, ex: [1, 0, 0], ey: [0, 0, -1], D: mm("D", 200), d: mm("d", 60), t: mm("L", 16), n: num(v.n, 4), Dc: mm("Dc", 150), db: NN().parafuso(v.parafuso).d, aco: v.aco });
        else if (v.tipo === "suporte") r = M().suporte({ origem: O, ex: [1, 0, 0], ey: [0, 0, 1], L: mm("D", 150), B: mm("Dc", 100), H: mm("Dc", 100), t: mm("L", 9.5), db: NN().parafuso(v.parafuso).d, aco: v.aco });
        else r = M().mecanica({ tipoMec: v.tipo, origem: O, ex: [1, 0, 0], ey: [0, 1, 0], D: mm("D", 50), d: mm("d", 20), L: mm("L", 200), aco: v.aco });
        if (r && r.erro) { toast(r.erro, "aviso"); return; }
        self.criarPecas(Array.isArray(r) ? r : [r], "Peça mecânica: " + v.tipo);
      }, "", "Criar");
    },

    /* =========================================================== LIGAÇÕES */
    PARAMS: {
      placaBase: [["t", "Espessura da placa (mm)", 25, 1], ["parafuso", "Chumbador", "3/4\"", 0, "par"], ["nChumb", "Chumbadores", 4, 0, [[4, "4"], [6, "6"]]], ["ancoragem", "Ancoragem no concreto (mm)", 400, 1], ["graute", "Graute (mm)", 25, 1], ["furo", "Furo", "alargado", 1, "furo"]],
      chapaExtremidade: [["t", "Espessura da chapa (mm)", 16, 1], ["parafuso", "Parafuso", "M20", 0, "par"], ["classe", "Classe", "8.8", 0, "classe"], ["linhas", "Linhas (0 = automático)", 0, 1], ["ext", "Chapa estendida além das mesas (mm)", 0, 1]],
      cantoneiraDupla: [["cat", "Cantoneira", "L89X89X7.9", 1, "L"], ["parafuso", "Parafuso", "M20", 0, "par"], ["classe", "Classe", "8.8", 0, "classe"], ["linhas", "Linhas (0 = automático)", 0, 1], ["folga", "Folga da viga ao pilar (mm)", 12.7, 1]],
      emendaCobrejunta: [["tAlma", "Tala da alma (mm)", 8, 1], ["tMesa", "Tala da mesa (mm)", 12.5, 1], ["colunas", "Colunas de parafuso por lado", 2, 1], ["parafuso", "Parafuso", "M20", 0, "par"], ["classe", "Classe", "8.8", 0, "classe"]],
      clipTerca: [["cat", "Cantoneira do clip", "L76X76X6.4", 1, "L"], ["parafuso", "Parafuso", "M12", 0, "par"], ["parafusos", "Parafusos por terça", 2, 1]],
      contraventamento: [["t", "Espessura do gusset (mm)", 9.5, 1], ["parafuso", "Parafuso", "M16", 0, "par"], ["parafusos", "Parafusos na diagonal", 2, 1], ["folga", "Folga da ponta ao apoio (mm)", 20, 1]],
      noTrelica: [["t", "Espessura do gusset (mm)", 9.5, 1], ["parafuso", "Parafuso", "M16", 0, "par"], ["parafusos", "Parafusos por barra", 2, 1]],
      enrijecedor: [["t", "Espessura (mm)", 8, 1], ["x", "Posição a partir do início (mm, vazio = meio)", "", 0], ["lados", "Lados", "ambos", 0, [["ambos", "Os dois lados da alma"], ["um", "Um lado"]]], ["chanfro", "Chanfro (mm, vazio = raio + 5)", "", 1]]
    },
    dlgLigacao: function (tipo) {
      var self = this, mac = L().MACROS[tipo], ids = this.selecao(), cxs = this.caixas(ids);
      var precisa = tipo === "noTrelica" ? 2 : mac.pede.length;
      if (cxs.length < precisa) { toast(mac.rotulo + ": selecione " + mac.pede.join(" e depois ") + " (com Ctrl para somar à seleção).", "aviso", 8000); status(mac.rotulo + ": selecione " + mac.pede.join(" + ") + "."); return; }
      var campos = this.PARAMS[tipo].map(function (p) {
        var c = { id: p[0], rotulo: p[1], valor: p[2], partida: !!p[3] };
        if (p[4] === "par") c.opcoes = self.parafusos(); else if (p[4] === "classe") c.opcoes = self.classes(); else if (p[4] === "L") c.lista = self.catalogo("L");
        else if (p[4] === "furo") c.opcoes = [["padrao", "Padrão (db + 1,5)"], ["alargado", "Alargado"], ["pouco", "Pouco alongado"], ["muito", "Muito alongado"]]; else if (Array.isArray(p[4])) c.opcoes = p[4];
        return c;
      });
      var sel = '<p style="font-size:12px;margin:0 0 8px">Peças: ' + cxs.map(function (c, i) { return "<b>" + esc((mac.pede[i] || "barra") + ": ") + "</b>" + esc(c.tipo === "metal" ? M().nome(c) : (c.tipo === "pilar" ? "Pilar " : "Viga ") + c.id); }).join(" · ") + "</p>";
      this.form(mac.rotulo, campos, function (v) { self.aplicarLigacao(tipo, cxs, self.parDe(tipo, v)); }, sel);
    },
    parDe: function (tipo, v) {
      var p = {}, mmK = ["t", "ext", "folga", "tAlma", "tMesa", "ancoragem", "graute", "x", "chanfro"];
      Object.keys(v).forEach(function (k) {
        if (v[k] === "" || v[k] == null) return;
        p[k] = mmK.indexOf(k) >= 0 ? num(v[k], 0) / 1000 : (/^(linhas|colunas|parafusos|nChumb)$/.test(k) ? num(v[k], 0) : v[k]);
      });
      if (p.linhas === 0) delete p.linhas;
      return p;
    },
    /* aplica (e devolve o resultado — a e2e e o teste usam) */
    aplicarLigacao: function (tipo, cxs, par) {
      var r = L().aplicar(tipo, cxs, junta({ lig: this.novoId() }, par));
      /* a viga e o pilar fora de ordem: tenta ao contrário uma vez */
      if (!r.ok && cxs.length === 2 && /chapaExtremidade|cantoneiraDupla|clipTerca|contraventamento/.test(tipo)) { var r2 = L().aplicar(tipo, [cxs[1], cxs[0]], junta({ lig: this.novoId() }, par)); if (r2.ok) r = r2; }
      if (!r.ok) { toast(L().MACROS[tipo].rotulo + ": " + r.motivo, "aviso", 8000); return r; }
      var op = L().ops(r, this.novoId.bind(this));
      if (!this.enviar(op)) { toast("O editor recusou a ligação.", "erro"); r.ok = false; return r; }
      this.ultimo = { tipo: tipo, resumo: r.resumo, avisos: r.avisos, lig: r.lig };
      status(r.resumo + "." + (r.avisos.length ? " " + r.avisos.length + " aviso(s) da NBR 8800." : " Distâncias conferidas pela NBR 8800.") + " Ctrl+Z desfaz.");
      if (r.avisos.length) this.mostrarAvisos(r.resumo, r.avisos);
      else toast(r.resumo + ".", "ok", 7000);
      return r;
    },
    mostrarAvisos: function (titulo, avisos) {
      UI.modal("Conferência — NBR 8800", NAO_CALCULO + '<p style="font-size:13px"><b>' + esc(titulo) + '</b></p><ul data-met="avisos" style="font-size:12px;max-height:50vh;overflow:auto">' + avisos.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>" +
        '<p class="muted" style="font-size:11px">Aviso, não bloqueio: quem decide é o projeto. As distâncias de partida estão em “De onde vem cada número”.</p>', [{ texto: "Ok", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
    },
    conferirTudo: function () {
      var st = this.estado(); if (!st) { toast("Abra o modelador primeiro.", "aviso"); return; }
      var av = [], nP = 0;
      st.caixas.forEach(function (c) {
        if (c.tipo === "metal" && c.metal && c.metal.kind === "chapa" && c.metal.furos.length) { nP++; av = av.concat(L().conferirChapa(c).avisos.map(function (a) { return a.texto + " — NBR 8800 " + a.item; })); }
        var mb = M().membro(c), fs = M().furosDe(c);
        if (mb && fs.length) { nP++; av = av.concat(L().conferirMembro(mb, fs, c.tipo === "metal" ? M().nome(c) : (c.tipo === "pilar" ? "Pilar " : "Viga ") + c.id).map(function (a) { return a.texto + " — NBR 8800 " + a.item; })); }
      });
      if (!av.length) { toast(nP + " peça(s) com furos conferidas: nenhuma distância fora da NBR 8800.", "ok", 7000); return av; }
      this.mostrarAvisos(nP + " peça(s) com furos conferidas", av);
      return av;
    },
    apagarLigacao: function () {
      var cx = this.caixas(this.selecao())[0], lig = cx && cx.metal && cx.metal.lig;
      if (!lig && cx && cx.metalFuros && cx.metalFuros.length) lig = cx.metalFuros[0].lig;
      if (!lig) { toast("Selecione uma chapa, um parafuso ou uma peça da ligação.", "aviso"); return; }
      if (!this.enviar({ op: "lote", id: this.novoId(), origem: "metal-lig", ops: [{ op: "metalApagarLig", lig: lig }] })) { toast("O editor recusou.", "erro"); return; }
      status("Ligação apagada (chapas, parafusos e furos). Ctrl+Z desfaz.");
    },

    /* ============================================================= GALPÃO */
    dlgGalpao: function () {
      var self = this, G0 = global.BimMetalGalpao.PADRAO, P = this.pontoPadrao();
      this.form("Assistente de galpão", [
        { id: "vao", rotulo: "Vão (m, eixo a eixo)", valor: G0.vao, num: 1 }, { id: "comprimento", rotulo: "Comprimento (m)", valor: G0.comprimento, num: 1 }, { id: "espacamento", rotulo: "Espaçamento dos pórticos (m)", valor: G0.espacamento, num: 1 },
        { id: "peDireito", rotulo: "Pé-direito (m)", valor: G0.peDireito, num: 1 }, { id: "inclinacao", rotulo: "Inclinação do telhado (%)", valor: G0.inclinacao, num: 1 },
        { id: "tipo", rotulo: "Pórtico", valor: G0.tipo, opcoes: [["alma-cheia", "Alma cheia"], ["trelicado", "Treliçado"]] },
        { id: "pilar", rotulo: "Perfil do pilar", valor: G0.pilar, lista: this.catalogo(), partida: 1 }, { id: "viga", rotulo: "Perfil da viga (alma cheia)", valor: G0.viga, lista: this.catalogo(), partida: 1 },
        { id: "banzo", rotulo: "Banzos (treliçado)", valor: G0.banzo, lista: this.catalogo("L"), partida: 1 }, { id: "diagonal", rotulo: "Diagonais e montantes", valor: G0.diagonal, lista: this.catalogo("L"), partida: 1 },
        { id: "alturaTrelica", rotulo: "Altura da treliça na ponta (m)", valor: G0.alturaTrelica, num: 1, partida: 1 },
        { id: "terca", rotulo: "Perfil da terça", valor: G0.terca, lista: this.catalogo(), partida: 1 }, { id: "espTercas", rotulo: "Espaçamento máx. das terças (m)", valor: G0.espTercas, num: 1, partida: 1 },
        { id: "contravento", rotulo: "Perfil do contraventamento", valor: G0.contravento, lista: this.catalogo("L"), partida: 1 }, { id: "tirante", rotulo: "Tirante Ø (mm, 0 = sem)", valor: G0.tirante * 1000, num: 1, partida: 1 },
        { id: "tapamentos", rotulo: "Colunas de tapamento por oitão", valor: G0.tapamentos, num: 1 }, { id: "tapamento", rotulo: "Perfil da coluna de tapamento", valor: G0.tapamento, lista: this.catalogo(), partida: 1 },
        { id: "contraventos", rotulo: "Contraventamentos nos vãos extremos", valor: G0.contraventos, tipo: "check" }, { id: "ligacoes", rotulo: "Aplicar as ligações padrão", valor: G0.ligacoes, tipo: "check" },
        { id: "x0", rotulo: "Origem X (m)", valor: br(P[0], 2), num: 1 }, { id: "z0", rotulo: "Origem Z (m)", valor: br(P[2], 2), num: 1 }, { id: "base", rotulo: "Cota da base (m)", valor: br(P[1], 2), num: 1 }
      ], function (v) { self.gerarGalpao(v); }, "", "Gerar galpão");
    },
    gerarGalpao: function (v) {
      var par = {};
      Object.keys(v || {}).forEach(function (k) { par[k] = v[k]; });
      ["vao", "comprimento", "espacamento", "peDireito", "inclinacao", "alturaTrelica", "espTercas", "tapamentos", "x0", "z0", "base"].forEach(function (k) { if (par[k] != null) par[k] = num(par[k], undefined); });
      if (par.tirante != null) par.tirante = num(par.tirante, 0) / 1000;
      if (par.tirante === 0) par.tirantes = false;
      var r = global.BimMetalGalpao.gerar(par, this.novoId.bind(this));
      if (!r.ok) { toast("Galpão: " + r.motivo, "aviso", 8000); return r; }
      if (!this.enviar(r.op)) { toast("O editor recusou o galpão.", "erro"); r.ok = false; return r; }
      this.ultimo = { tipo: "galpao", resumo: r.resumo, avisos: r.avisos.concat(r.avisosLigacoes) };
      status(r.resumo + " Não dimensiona: confira os perfis no projeto estrutural. Ctrl+Z desfaz.");
      if (r.avisos.length || r.avisosLigacoes.length) this.mostrarAvisos(r.resumo, r.avisos.concat(r.avisosLigacoes));
      else toast(r.resumo, "ok", 9000);
      try { if (B() && B().enquadrar) B().enquadrar(); } catch (e) {}
      return r;
    },

    /* ========================================================= FABRICAÇÃO */
    numerar: function () {
      var st = this.estado(); if (!st) { toast("Abra o modelador primeiro.", "aviso"); return null; }
      var n = F().numerar(st), op = F().opNumerar(st);
      if (!op) { toast("Não há peça de aço para numerar.", "aviso"); return n; }
      if (!this.enviar(op)) { toast("O editor recusou a numeração.", "erro"); return n; }
      status(n.grupos.length + " marca(s) de peça para " + n.pecas.length + " peça(s) e " + n.conjuntos.length + " conjunto(s) de montagem. Peças iguais têm a mesma marca. Ctrl+Z desfaz.");
      toast("Numeração: " + n.grupos.length + " marcas de peça, " + n.conjuntos.length + " conjuntos de montagem.", "ok");
      return n;
    },
    zip: function (arqs) {
      var Z = global.BimBcf; if (!Z || !Z.zipEscrever) return null;
      return Z.zipEscrever(arqs);
    },
    exportar: function (qual) {
      var st = this.estado(); if (!st) { toast("Abra o modelador primeiro.", "aviso"); return null; }
      var r = F().arquivos(st, { pedido: this.nomeObra().slice(0, 20) }), sel = {};
      Object.keys(r.arquivos).forEach(function (k) { if (qual === "dstv" ? /^DSTV\//.test(k) : /^DXF\//.test(k)) sel[k] = r.arquivos[k]; });
      var n = Object.keys(sel).length;
      if (!n) { toast(qual === "dstv" ? "Não há perfil nem chapa para o DSTV." : "Não há chapa para o DXF.", "aviso"); return null; }
      this.ultimo = { tipo: qual, arquivos: sel, nesting: r.nesting };
      var z = this.zip(sel); if (!z) { toast("O gerador de .zip (js/bimbcf.js) não carregou.", "erro"); return null; }
      this.baixar(this.arqBase() + (qual === "dstv" ? "-dstv.zip" : "-dxf-chapas.zip"), z, "application/zip");
      var extra = qual === "dxf" && r.nesting.length ? " Aproveitamento (chapa padrão 3000 × 1200, valor de partida): " + r.nesting.map(function (x) { return x.grupo + " " + x.chapas + " chapa(s), " + br(x.aproveitamento, 1) + " %"; }).join("; ") + "." : "";
      toast((qual === "dstv" ? n + " arquivo(s) DSTV NC1" : n + " DXF de corte") + " no .zip." + extra + " Confira o sentido dos ângulos e o cabeçalho de chapa no pós-processador da máquina.", "ok", 10000);
      return sel;
    },
    listas: function () {
      var st = this.estado(), self = this; if (!st) { toast("Abra o modelador primeiro.", "aviso"); return; }
      var Ls = F().listas(st);
      if (!Ls.pecas.length) { toast("Não há peça de aço no modelo.", "aviso"); return; }
      this.ultimo = { tipo: "listas", listas: Ls };
      var go = function () {
        F().xlsx(Ls, global.ExcelJS).xlsx.writeBuffer().then(function (buf) {
          self.baixar(self.arqBase() + "-listas-fabricacao.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
          toast("Listas: " + Ls.pecas.length + " marcas, " + Ls.conjuntos.length + " conjuntos, " + Ls.parafusos.reduce(function (s, p) { return s + p.quantidade; }, 0) + " parafusos — " + br(Ls.totais.peso, 1) + " kg de aço (" + br(Ls.totais.kN, 1) + " kN).", "ok", 9000);
        }, function (e) { toast("Não gerei a planilha: " + e.message, "erro"); });
      };
      if (global.ExcelJS) go(); else if (global.ExcelOrc && ExcelOrc.ensureExcelJS) ExcelOrc.ensureExcelJS(go); else toast("O gerador de Excel não carregou.", "erro");
    },
    ifc: function (soTexto) {
      var b = B(), self = this, G = this._G || global.Gestao; if (!b || !b.ifcSaida) { toast("Abra o BIM primeiro.", "aviso"); return Promise.resolve(null); }
      var niveis = G && G._nivLer ? G._nivLer().map(function (n) { return { id: n.id, nome: n.nome, elevacao: Number(n.elevacao) }; }) : [];
      return b.ifcSaida({ fabricacao: true, niveis: niveis, projeto: this.nomeObra(), semente: "obra:" + ((G && G._bimSel) || "geral"), arquivo: this.arqBase() + "-fabricacao.ifc" }).then(function (r) {
        if (!r || !r.ok) { toast("Não exportei o IFC: " + ((r && r.erro) || "erro"), "aviso"); return null; }
        if (!soTexto) {
          self.baixar(self.arqBase() + "-fabricacao.ifc", r.texto, "application/x-step");
          var pe = r.resumo.porEntidade;
          toast("IFC de fabricação: " + ["IFCELEMENTASSEMBLY", "IFCPLATE", "IFCMEMBER", "IFCBEAM", "IFCCOLUMN", "IFCMECHANICALFASTENER", "IFCOPENINGELEMENT"].filter(function (k) { return pe[k]; }).map(function (k) { return pe[k] + " " + k.replace("IFC", "").toLowerCase(); }).join(", ") + ".", "ok", 9000);
        }
        return r;
      });
    },
    pacote: function () {
      var st = this.estado(), self = this; if (!st) { toast("Abra o modelador primeiro.", "aviso"); return; }
      var r = F().arquivos(st, { pedido: this.nomeObra().slice(0, 20) }), arqs = {};
      Object.keys(r.arquivos).forEach(function (k) { arqs[k] = r.arquivos[k]; });
      var fim = function (buf) {
        if (buf) arqs["listas-fabricacao.xlsx"] = new Uint8Array(buf);
        self.ifc(true).then(function (ri) {
          if (ri && ri.texto) arqs["fabricacao.ifc"] = ri.texto;
          arqs["LEIA-ME.txt"] = "OrcaPRO Modela - Metalica & Mecanica\r\nDSTV/: um .nc1 por marca (DSTV NC1, 7a ed. jul/1998). Conferir no pos-processador da maquina o sentido dos angulos de corte e o cabecalho de chapa.\r\nDXF/: chapas 1:1 em mm (CUT_OUTSIDE, CUT_INSIDE, ETCH) e o nesting simples na chapa padrao.\r\nNao e calculo estrutural: perfis, parafusos, chapas e soldas de partida devem ser conferidos pelo projeto.\r\n";
          var z = self.zip(arqs); if (!z) { toast("O gerador de .zip não carregou.", "erro"); return; }
          self.ultimo = { tipo: "pacote", arquivos: Object.keys(arqs) };
          self.baixar(self.arqBase() + "-pacote-fabrica.zip", z, "application/zip");
          toast("Pacote da fábrica: " + Object.keys(arqs).length + " arquivos (DSTV, DXF, nesting, listas e IFC).", "ok", 9000);
        });
      };
      var Ls = r.listas;
      var go = function () { F().xlsx(Ls, global.ExcelJS).xlsx.writeBuffer().then(fim, function () { fim(null); }); };
      if (global.ExcelJS) go(); else if (global.ExcelOrc && ExcelOrc.ensureExcelJS) ExcelOrc.ensureExcelJS(go); else fim(null);
    },
    /* DESENHO DE FABRICAÇÃO → uma prancha A3 com uma folha por marca de peça e por conjunto */
    desenhos: function () {
      var st = this.estado(), G = this._G || global.Gestao; if (!st) { toast("Abra o modelador primeiro.", "aviso"); return null; }
      var n = F().numerar(st); if (!n.grupos.length) { toast("Não há peça de aço no modelo.", "aviso"); return null; }
      var folhas = [], imgs = {}, base = "metfab:" + Date.now().toString(36) + ":";
      function folha(d, i, titulo) {
        if (!d || !d.svg) return;
        var ch = base + i, url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(d.svg);
        imgs[ch] = url;
        folhas.push({ id: "f" + (folhas.length + 1), conteudo: titulo, escala: "1:" + d.escala, blocos: [
          { tipo: "imagem", x: 30, y: 15, w: 270, h: 170, titulo: d.titulo, chave: ch },
          { tipo: "tabela", x: 30, y: 192, w: 270, h: 80, titulo: "Lista", cabecalho: d.tabela.cabecalho, linhas: d.tabela.linhas.slice(0, 24) }
        ] });
      }
      n.grupos.forEach(function (g, i) { var p = g.rep; folha(p.kind === "perfil" ? F().desenhoPerfil(p, g.marca, g.ids.length) : (p.kind === "chapa" ? F().desenhoChapa(p, g.marca, g.ids.length) : null), "p" + i, "Peça " + g.marca); });
      n.conjuntos.forEach(function (c, i) { folha(F().desenhoConjunto(st, c, n), "c" + i, "Conjunto " + c.marca); });
      var pr = { id: "", obraId: String((G && G._bimSel) || ""), nome: "Fabricação — metálica (" + n.grupos.length + " peças, " + n.conjuntos.length + " conjuntos)", formato: "A3", orientacao: "paisagem", origem: "metalica", criadoEm: new Date().toISOString(),
                 carimbo: { projeto: "Desenho de fabricação — estrutura metálica", obra: this.nomeObra(), data: new Date().toLocaleDateString("pt-BR") }, folhas: folhas };
      this.ultimo = { tipo: "desenho", folhas: folhas.length, prancha: pr, imagens: imgs };
      var salvar = function () {
        try { if (global.Store && global.Auth) global.Store.salvar(Auth.empresaId(), "bim_pranchas", global.Prancha ? Prancha.normalizar(pr) : pr); } catch (e) { toast("Não gravei a prancha: " + e.message, "erro"); return; }
        try { if (G && G._bimAbrirPainel) { G._bimAbrirPainel("pranchas"); G._prRender(); } } catch (e2) {}
        toast("Desenho de fabricação: " + folhas.length + " folha(s) A3 em Pranchas do projeto (furação cotada a partir da origem).", "ok", 9000);
      };
      if (global.Idb && Idb.set) Promise.all(Object.keys(imgs).map(function (k) { return Idb.set(k, imgs[k])["catch"](function () {}); })).then(salvar);
      else salvar();
      return pr;
    },
    fontes: function () {
      var f = NN().fontes(), h = NAO_CALCULO + '<table class="tabela" data-met="fontes"><thead><tr><th>Regra</th><th>Fonte</th><th>Situação</th></tr></thead><tbody>' +
        f.map(function (x) { return "<tr><td>" + esc(x.regra) + "</td><td>" + esc(x.item) + "</td><td>" + esc(x.situacao) + "</td></tr>"; }).join("") +
        "<tr><td>Formato DSTV (blocos ST, BO, AK, IK, SI, EN)</td><td>DSTV — Standard Description for Steel Structure Pieces for the Numerical Controls, 7ª ed., jul/1998</td><td>conferido; ângulo de corte, cabeçalho de chapa e oblongo: conferir no pós-processador</td></tr>" +
        "<tr><td>Perfis</td><td>" + esc((global.PerfisAco && PerfisAco.FONTE) || "catálogo") + " · Gerdau (folder técnico 10/18)</td><td>catálogo</td></tr>" +
        "<tr><td>Massa específica do aço</td><td>7 850 kg/m³</td><td>usada no peso de todas as peças</td></tr></tbody></table>" +
        '<p class="muted" style="font-size:11px">A ABNT NBR 8800:2024 já existe: conferir qual edição a obra adota.</p>';
      UI.modal("De onde vem cada número", h, [{ texto: "Ok", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
    }
  };

  global.BimMetalUI = BimMetalUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimMetalUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
