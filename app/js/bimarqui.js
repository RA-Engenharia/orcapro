/* =====================================================================
 * bimarqui.js — a TELA do modelador B2 (prévia `?previa=modelador`).
 *
 * Liga a fita do BIM às ferramentas do js/bim.js (bloco "B2 — MODELADOR")
 * e monta as Propriedades: com a ferramenta armada, as
 * Propriedades mostram o TIPO e os parâmetros dela (tipo de parede, tipo de
 * laje, perfil, escada, guarda-corpo, nível); com uma peça do modelador
 * selecionada, mostram a peça (camadas com área e volume, juntas, anexar
 * topo, perfil…) e cada mudança vira uma op `ajustar` (desfaz/refaz).
 *
 * Sem a prévia NADA daqui roda: `registrar` e `secoesProps` saem na hora.
 * A lógica de geometria e de quantitativo mora no js/bimarq.js (puro).
 * ===================================================================== */
(function (global) {
  "use strict";
  function B() { return global.BIM; }
  function A() { return global.BimArq; }
  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function n2(v, c) { var x = Number(v); return isFinite(x) ? String(Math.round(x * Math.pow(10, c == null ? 2 : c)) / Math.pow(10, c == null ? 2 : c)).replace(".", ",") : "—"; }
  function num0(v, d) { var x = Number(v); return v != null && v !== "" && isFinite(x) ? x : d; }
  function ro(id, rot, v) { return { id: id, rotulo: rot, leitura: true, valor: v == null || v === "" ? "—" : v }; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function status(t) { try { if (global.BimShell && BimShell.status) BimShell.status(t); } catch (e) {} }

  var cfg = {
    anexarTopo: false, unir: true, juntaCanto: "topo", lajeModo: "contorno", tipoLajeId: "macica-12",
    perfilPilar: { forma: "ret", b: 0.20, h: 0.20 }, materialPilar: "concreto", giroPilar: 0,
    perfilViga: { forma: "ret", b: 0.14, h: 0.40 }, materialViga: "concreto",
    /* o tipo de escada padrão é o de mercado (BimArq.TIPOS_ESCADA[0]): espelho máx. 18 cm,
       piso mín. 27,5 cm, largura mín. 1,00 m, guarda-corpo nos dois lados */
    escada: { forma: "reta", largura: 1.0, giro: "direita", espessura: 0.12, desnivel: null, tipoId: "revit-180-275", emax: 0.18, pmin: 0.275, piso: null, larguraMin: 1.0, guarda: "dois",
              /* P9: regra de cálculo (padrão), poço da escada em U, começar/terminar com espelho, revestimento */
              regra: "revit", vao: 0, comecaEspelho: true, terminaEspelho: true, revPiso: null, revEspelho: null },
    guarda: { altura: 1.10, espac: 1.20, lado: "" },
    nivelId: null,
    /* P1-B — RESTRIÇÕES POR NÍVEL da ferramenta (a barra de opções da ferramenta:
       "Altura: Não conectada / Até o nível X" + deslocamentos). `sup`/`ref`:
       "acima" = o nível logo acima do atual (segue o nível que estiver lá),
       "" = não conectada, ou o id de um nível. Altura não conectada vazia =
       o pé-direito do nível atual. Padrão: até o nível acima — a parede, o
       pilar e a escada nascem com a mesma altura de antes (o pé-direito) e
       passam a acompanhar o nível de cima. */
    rs: {
      parede: { sup: "acima", deslocBase: 0, deslocSuperior: 0, alturaNaoConectada: null },
      pilar:  { sup: "acima", deslocBase: 0, deslocSuperior: 0, alturaNaoConectada: null },
      escada: { sup: "acima", deslocBase: 0, deslocSuperior: 0, alturaNaoConectada: null },
      laje:   { deslocBase: 0 },
      viga:   { ref: "acima", deslocBase: 0 },
      cobertura: { ref: "acima", deslocBase: 0 }
    }
  };
  var G = null;   /* o Gestao: níveis da obra (_nivLer) e o tipo de parede ativo (_alvTipo) */

  /* o canto em L: topo (união pela linha de centro — a parede criada antes passa) ou meia-esquadria */
  var OPC_CANTO = [{ id: "topo", rotulo: "Topo — a criada antes passa (padrão)" }, { id: "esquadria", rotulo: "Meia-esquadria" }];
  var ROT_SUB = { parede: "Parede", laje: "Laje por contorno", furo: "Furo na laje", pilar: "Pilar por perfil", viga: "Viga por perfil", eixo: "Eixos", escada: "Escada", guarda: "Guarda-corpo", forro: "Forro", rampa: "Rampa", trelica: "Treliça",
                  telhado: "Telhado", fundacao: "Fundação", "telhado-borda": "Bordas do telhado", "telhado-unir": "Unir telhado" };   /* P9: rampa, treliça */

  var BimArqUI = {
    ativo: previa,
    cfg: function () { return cfg; },

    /* ------------------------------------------------------------ nível */
    niveis: function () {
      try { return G && G._nivLer && global.Niveis ? global.Niveis.listar(G._nivLer()) : []; } catch (e) { return []; }
    },
    /* o nível em que o próximo elemento nasce: o escolhido, ou o 1º que não é
       terreno/fundação (o piso do térreo) — a mesma regra da planta 2D */
    nivelAtivo: function () {
      var L = this.niveis(); if (!L.length) return null;
      var n = L.filter(function (x) { return String(x.id) === String(cfg.nivelId); })[0];
      if (!n) n = L.filter(function (x) { return !/terreno|funda|sondag/i.test(x.nome || ""); })[0] || L[0];
      cfg.nivelId = n.id;
      return { id: n.id, nome: n.nome, elevacao: +n.elevacao || 0, peDireito: n.peDireito != null ? +n.peDireito : null };
    },
    escolherNivel: function () {
      var self = this, L = this.niveis();
      if (!L.length) { try { UI.toast("Esta obra ainda não tem níveis. Crie os níveis e volte aqui.", "aviso"); } catch (e) {} if (G && G._niveis) G._niveis(); return; }
      var at = this.nivelAtivo();
      var h = '<p class="muted" style="margin:0 0 10px">O próximo elemento nasce neste nível: a parede e a laje partem da elevação dele, e a parede sobe até o nível acima (Restrições, em Propriedades). Mudou a elevação de um nível, o que está preso a ele acompanha.</p>' +
        L.slice().reverse().map(function (n) {
          return '<label style="display:flex;gap:8px;align-items:center;padding:6px 0"><input type="radio" name="b2-nivel" value="' + String(n.id).replace(/"/g, "&quot;") + '"' + (at && String(at.id) === String(n.id) ? " checked" : "") + "> " +
            String(n.nome).replace(/</g, "&lt;") + " · " + (n.elevacao >= 0 ? "+" : "") + n2(n.elevacao) + " m" + (n.peDireito != null ? " (pé-direito " + n2(n.peDireito) + " m)" : "") + "</label>";
        }).join("");
      UI.modal("Nível atual", h, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Usar este nível", classe: "primary", onClick: function () {
          var r = document.querySelector('input[name="b2-nivel"]:checked'); if (r) cfg.nivelId = r.value;
          UI.fecharModal(); self.enviar();
          var nv = self.nivelAtivo(); status("Nível atual: " + (nv ? nv.nome + " (" + n2(nv.elevacao) + " m)" : "—") + ".");
        } }
      ]);
    },

    /* ------------------------------------------------------------ tipos */
    tipoParede: function () {
      var t = null;
      try { t = G && G._alvTipo ? G._alvTipo() : null; } catch (e) { t = null; }
      if (!t && global.AlvTipos) t = global.AlvTipos.tipo("est-14-int");
      return A() ? A().tipoParede(t) : null;
    },
    tipoLaje: function () {
      var L = A() ? A().TIPOS_LAJE : [];
      return L.filter(function (t) { return t.id === cfg.tipoLajeId; })[0] || L[2] || null;
    },
    /* a configuração vai para o visor (BIM.editarB2) — a ferramenta lê de lá */
    enviar: function () {
      var b = B(); if (!b || !b.editarB2) return null;
      var self = this, rs = {};
      ["parede", "pilar", "escada", "laje", "viga", "cobertura"].forEach(function (k) { rs[k] = self.restricoesFerramenta(k); });
      return b.editarB2({ nivel: this.nivelAtivo(), tipoParede: this.tipoParede(), anexarTopo: cfg.anexarTopo, unir: cfg.unir, juntaCanto: cfg.juntaCanto, lajeModo: cfg.lajeModo,
        tipoLaje: this.tipoLaje(), perfilPilar: cfg.perfilPilar, materialPilar: cfg.materialPilar, giroPilar: cfg.giroPilar,
        perfilViga: cfg.perfilViga, materialViga: cfg.materialViga, escada: cfg.escada, guarda: cfg.guarda,
        restricoes: rs, niveis: this.niveis() });   /* P1-B: as restrições de cada ferramenta e os níveis da obra */
    },

    /* --------------------------------- P1-B — restrições por nível */
    /* as restrições que a peça NOVA leva (null = obra sem níveis: plano do
       modelo, como antes). Formato = o da op v:2 (js/bimarq.js). */
    restricoesFerramenta: function (sub) {
      var Ar = A(), L = this.niveis(), at = this.nivelAtivo(), r = cfg.rs[sub];
      if (!Ar || !r || !L.length || !at) return null;
      var acima = Ar.nivelAcima(L, at.id), pd = at.peDireito > 0 ? at.peDireito : 2.8;
      if (Ar.RESTR_TIPO[sub] === "vertical") {
        var sup = r.sup === "acima" ? (acima ? String(acima.id) : null) : (r.sup ? String(r.sup) : null);
        var anc = r.alturaNaoConectada > 0 ? r.alturaNaoConectada : (sub === "escada" && cfg.escada.desnivel > 0 ? cfg.escada.desnivel : pd);
        return { nivelBase: String(at.id), deslocBase: num0(r.deslocBase, 0), restricaoSuperior: sup, deslocSuperior: num0(r.deslocSuperior, 0), alturaNaoConectada: anc };
      }
      if (sub === "laje") return { nivelBase: String(at.id), deslocBase: num0(r.deslocBase, 0) };
      /* viga e cobertura: o nível de referência (padrão: o de cima — a viga
         pendura do nível de cima); sem nível acima, o atual +
         o pé-direito (a cota de antes) */
      var ref = r.ref === "acima" ? acima : (r.ref ? L.filter(function (n) { return String(n.id) === String(r.ref); })[0] : at);
      if (!ref) return { nivelBase: String(at.id), deslocBase: Math.round((pd + num0(r.deslocBase, 0)) * 1e6) / 1e6 };
      return { nivelBase: String(ref.id), deslocBase: num0(r.deslocBase, 0) };
    },
    /* a altura que a ferramenta vai dar (parede, pilar, escada), pela regra do nível de referência */
    alturaFerramenta: function (sub) {
      var r = this.restricoesFerramenta(sub); if (!r || r.alturaNaoConectada == null) return null;
      if (r.restricaoSuperior == null) return r.alturaNaoConectada;
      var M = A().mapaNiveis(this.niveis());
      var H = M[r.restricaoSuperior] + r.deslocSuperior - (M[r.nivelBase] + r.deslocBase);
      return H >= 0.1 ? H : r.alturaNaoConectada;
    },
    _secRestrFerr: function (sub) {
      var Ar = A(), L = this.niveis(), at = this.nivelAtivo(), r = cfg.rs[sub], RT = Ar.ROTULOS_RESTR[sub];
      if (!r || !RT || !L.length || !at) return null;
      var acima = Ar.nivelAcima(L, at.id), ps = [], ef = this.restricoesFerramenta(sub);
      if (Ar.RESTR_TIPO[sub] === "vertical") {
        ps.push(ro("b2f:rs:base", RT.nivelBase, at.nome + " (o nível atual)"));
        ps.push({ id: "b2f:rs:deslocBase", rotulo: RT.deslocBase, unidade: "m", tipo: "numero", passo: "0.01", valor: num0(r.deslocBase, 0) });
        var opS = [{ id: "", rotulo: sub === "escada" ? "Nenhum (altura desejada)" : "Não conectada" },
                   { id: "acima", rotulo: acima ? "Até o nível acima: " + acima.nome : "Até o nível acima (não há)" }]
          .concat(L.filter(function (n) { return n.elevacao > at.elevacao && (!acima || String(n.id) !== String(acima.id)); }).map(function (n) { return { id: String(n.id), rotulo: "Até o nível: " + n.nome }; }));
        ps.push({ id: "b2f:rs:sup", rotulo: sub === "parede" ? "Altura (" + RT.restricaoSuperior + ")" : RT.restricaoSuperior, tipo: "lista", valor: r.sup || "", opcoes: opS });
        if (ef.restricaoSuperior != null) ps.push({ id: "b2f:rs:deslocSuperior", rotulo: RT.deslocSuperior, unidade: "m", tipo: "numero", passo: "0.01", valor: num0(r.deslocSuperior, 0) });
        else ps.push({ id: "b2f:rs:alturaNaoConectada", rotulo: RT.alturaNaoConectada, unidade: "m", tipo: "numero", passo: "0.01", valor: ef.alturaNaoConectada });
        var H = this.alturaFerramenta(sub);
        ps.push(ro("b2f:rs:h", "Altura que vai sair", H != null ? n2(H) + " m" + (ef.restricaoSuperior != null ? " (acompanha o nível de cima)" : "") : "—"));
      } else if (sub === "laje") {
        ps.push(ro("b2f:rs:base", RT.nivelBase, at.nome + " (o nível atual)"));
        ps.push({ id: "b2f:rs:deslocBase", rotulo: RT.deslocBase, unidade: "m", tipo: "numero", passo: "0.01", valor: num0(r.deslocBase, 0) });
      } else {
        var opR = [{ id: "acima", rotulo: acima ? "O nível acima: " + acima.nome : "O nível acima (não há: o atual + o pé-direito)" }]
          .concat(L.filter(function (n) { return !acima || String(n.id) !== String(acima.id); }).map(function (n) { return { id: String(n.id), rotulo: n.nome }; }));
        ps.push({ id: "b2f:rs:ref", rotulo: RT.nivelBase, tipo: "lista", valor: r.ref || "acima", opcoes: opR });
        ps.push({ id: "b2f:rs:deslocBase", rotulo: RT.deslocBase, unidade: "m", tipo: "numero", passo: "0.01", valor: num0(r.deslocBase, 0) });
      }
      return { nome: "Restrições", params: ps };
    },
    _mudarRestrFerr: function (sub, campo, valor) {
      var r = cfg.rs[sub]; if (!r) return;
      var v = parseFloat(String(valor).replace(",", "."));
      if (campo === "sup" || campo === "ref") r[campo] = valor == null ? "" : String(valor);
      else if (campo === "alturaNaoConectada") r.alturaNaoConectada = isFinite(v) && v >= 0.1 ? v : null;
      else if (campo === "deslocBase" || campo === "deslocSuperior") r[campo] = isFinite(v) ? v : 0;
    },
    /* Propriedades da PEÇA: as restrições, com os nomes em PT-BR do inventário */
    _secRestrPeca: function (c) {
      var Ar = A(), RT = Ar.ROTULOS_RESTR[c.tipo]; if (!RT) return null;
      var L = this.niveis(), ps = [], vert = Ar.RESTR_TIPO[c.tipo] === "vertical";
      var nb = c.nivelBase != null ? String(c.nivelBase) : (c.nivelId != null ? String(c.nivelId) : "");
      if (!L.length) return { nome: "Restrições", params: [ro("b2:rs:sem", RT.nivelBase, nb ? "a obra não tem níveis: a peça fica na cota em que nasceu" : "sem níveis (plano do modelo)")] };
      var preso = !!nb && c.deslocBase != null;
      ps.push({ id: "b2:rs:nivelBase", rotulo: RT.nivelBase, tipo: "lista", valor: nb,
        opcoes: (preso ? [] : [{ id: "", rotulo: "— (plano do modelo)" }]).concat(L.map(function (n) { return { id: String(n.id), rotulo: n.nome + " (" + n2(n.elevacao) + " m)" }; })) });
      if (preso) {
        ps.push({ id: "b2:rs:deslocBase", rotulo: RT.deslocBase, unidade: "m", tipo: "numero", passo: "0.01", valor: c.deslocBase });
        if (vert) {
          ps.push({ id: "b2:rs:restricaoSuperior", rotulo: RT.restricaoSuperior, tipo: "lista", valor: c.restricaoSuperior != null ? String(c.restricaoSuperior) : "",
            opcoes: [{ id: "", rotulo: c.tipo === "escada" ? "Nenhum (altura desejada)" : "Não conectada" }].concat(L.map(function (n) { return { id: String(n.id), rotulo: (c.tipo === "parede" ? "Até o nível: " : "") + n.nome }; })) });
          if (c.restricaoSuperior != null) {
            ps.push({ id: "b2:rs:deslocSuperior", rotulo: RT.deslocSuperior, unidade: "m", tipo: "numero", passo: "0.01", valor: num0(c.deslocSuperior, 0) });
            ps.push(ro("b2:rs:anc", RT.alturaNaoConectada, n2(c.alturaEfetiva) + " m (pelos níveis)"));
          } else ps.push({ id: "b2:rs:alturaNaoConectada", rotulo: RT.alturaNaoConectada, unidade: "m", tipo: "numero", passo: "0.01", valor: c.alturaNaoConectada });
        }
      }
      if (c.v1Migrado) ps.push(ro("b2:rs:v1", "Origem", "peça de antes das restrições: a cota foi lida como " + RT.nivelBase.toLowerCase() + " + deslocamento. Mude qualquer restrição e ela passa a acompanhar o nível."));
      if (c.avisoNivel) ps.push(ro("b2:rs:av", "Atenção", c.avisoNivel));
      return { nome: "Restrições", params: ps };
    },
    /* uma restrição da peça mudou → as restrições COMPLETAS (op v:2): o que
       não mudou vai como está agora, então o resultado não depende do replay */
    _restrPeca: function (c, campo, valor) {
      var Ar = A(), vert = Ar.RESTR_TIPO[c.tipo] === "vertical", v = parseFloat(String(valor).replace(",", "."));
      var nb = c.nivelBase != null ? c.nivelBase : c.nivelId;
      if (nb == null || c.deslocBase == null) return campo === "nivelBase" && valor ? { nivelBase: String(valor) } : null;   /* entra no nível e fica onde está */
      var rs = { nivelBase: String(nb), deslocBase: c.deslocBase };
      if (vert) {
        rs.restricaoSuperior = c.restricaoSuperior != null ? String(c.restricaoSuperior) : null;
        rs.deslocSuperior = num0(c.deslocSuperior, 0);
        /* soltar o topo deixa a altura que estava */
        rs.alturaNaoConectada = c.restricaoSuperior != null ? num0(c.alturaEfetiva, c.alturaNaoConectada) : c.alturaNaoConectada;
      }
      if (campo === "nivelBase") { if (!valor) return null; rs.nivelBase = String(valor); }
      else if (campo === "restricaoSuperior") { if (!vert) return null; rs.restricaoSuperior = valor ? String(valor) : null; }
      else if (campo === "alturaNaoConectada") { if (!(isFinite(v) && v >= 0.1)) return null; rs.alturaNaoConectada = v; }
      else if (campo === "deslocBase" || campo === "deslocSuperior") { if (!isFinite(v)) return null; rs[campo] = v; }
      else return null;
      return rs;
    },
    armar: function (sub) {
      var b = B(); if (!b || !b.editarArmar) return false;
      this.enviar();
      var ok = b.editarArmar(sub);   /* abre o editor se estiver fechado */
      this._sub = sub;
      try { if (global.BimShell) BimShell.pintarProps(this.esquemaFerramenta(sub)); } catch (e) {}
      var nv = this.nivelAtivo();
      status((ROT_SUB[sub] || sub) + (nv ? " no nível " + nv.nome + " (" + n2(nv.elevacao) + " m)" : "") + " — o tipo e os parâmetros estão em Propriedades.");
      return ok !== false;
    },

    /* ------------------------------------------------------- a fita */
    registrar: function (reg, g) {
      G = g || G;
      if (!previa() || !global.BimRibbon || !A()) return false;
      var self = this, R = global.BimRibbon;
      R.acrescentar("arquitetura", "Arquitetura", "Modelador", [
        { id: "eixo", rotulo: "Eixo", icone: "grade", grande: true, tipo: "alterna", dica: "Grade de eixos (A, B, C… / 1, 2, 3…): dois cliques por eixo. Aparece no 3D e na planta, com a bolinha e o nome. Mover: ferramenta Mover, clique perto da linha." },
        { id: "furo-laje", rotulo: "Furo na\nlaje", icone: "corte", grande: true, tipo: "alterna", dica: "Abre um furo (shaft, escada) numa laje por contorno: a área e o volume descontam." },
        { id: "escada", rotulo: "Escada", icone: "niveis", grande: true, tipo: "alterna", dica: "Escada reta ou em L pelas regras do tipo (espelho máximo, piso mínimo, largura mínima): degraus calculados pelo desnível, patamar na virada e guarda-corpo automático. Blondel (63 a 64 cm) aparece como aviso." },
        { id: "guarda-corpo", rotulo: "Guarda-\ncorpo", icone: "regua", grande: true, tipo: "alterna", dica: "Guarda-corpo ao longo de um caminho (Enter termina) ou pela lateral de uma escada: montantes, corrimão e os metros no quantitativo." }
      ]);
      /* na fita de sempre a viga só existe na fita nova: entra na aba Estrutura */
      R.acrescentar("estrutura", "Estrutura", "Elementos", [
        { id: "viga", rotulo: "Viga", icone: "estrutura", grande: true, tipo: "alterna", dica: "Viga por perfil: concreto, madeira ou aço. Dois cliques; o topo fica no topo da parede." }
      ], "alvenaria");
      ["eixo", "furo-laje", "escada", "guarda-corpo", "viga"].forEach(function (k) { if (R._EXCLUSIVOS.indexOf(k) < 0) R._EXCLUSIVOS.push(k); });
      if (global.BimForroUI) global.BimForroUI.registrar(reg, self);   /* P2-B: comando Forro (js/bimforroui.js) */
      if (global.BimTerrenoUI) global.BimTerrenoUI.registrar(reg, self);   /* P11: aba Massa e terreno (js/bimterrenoui.js) */
      if (global.BimEstrutUI) global.BimEstrutUI.registrar(reg, self);   /* P9 — GANCHO: Rampa, Escada em U, Treliça (js/bimestrutui.js) */
      if (global.BimP3UI) global.BimP3UI.registrar(reg, self);   /* P3: telhado, bordas, unir telhado e fundação (js/bimp3ui.js) */
      if (global.MarcenariaUI) global.MarcenariaUI.registrar(reg, self);   /* CARPINTARIA & MARCENARIA: aba da disciplina (js/marcenariaui.js) */
      function ferr(sub) {
        return function (e) {
          if (e && e.ligado === false) { var b = B(); if (b && b.editarArmar) b.editarArmar(null); status("Ferramenta desligada."); return true; }
          return self.armar(sub);
        };
      }
      /* a parede, o piso, o pilar e a viga da fita passam a ser os do modelador */
      reg.parede = ferr("parede"); reg.piso = ferr("laje"); reg.pilar = ferr("pilar"); reg.viga = ferr("viga");
      reg.eixo = ferr("eixo"); reg["furo-laje"] = ferr("furo"); reg.escada = ferr("escada"); reg["guarda-corpo"] = ferr("guarda");
      reg["nivel-atual"] = function () { self.escolherNivel(); return true; };
      /* P1-B: o replay (BimEdit.aplicar) lê os níveis da obra daqui — mudou a
         elevação, a peça presa ao nível acompanha */
      if (global.BimEdit && global.BimEdit.fonteNiveis) global.BimEdit.fonteNiveis(function () { return self.niveis(); });
      this.enviar();
      return true;
    },

    /* ------------------------------------- Propriedades da FERRAMENTA */
    _secNivel: function () {
      var L = this.niveis(), at = this.nivelAtivo();
      if (!L.length) return { nome: "Nível", params: [ro("b2f:nivel", "Nível", "sem níveis (plano do modelo)"), { id: "b2f:niveis", rotulo: "Níveis da obra", tipo: "botao", rotuloBotao: "Criar níveis", acao: "niveis" }] };
      return { nome: "Nível", params: [
        { id: "b2f:nivel", rotulo: "Nível atual", tipo: "lista", valor: at ? String(at.id) : "", opcoes: L.map(function (n) { return { id: String(n.id), rotulo: n.nome + " (" + n2(n.elevacao) + " m)" }; }) },
        ro("b2f:pd", "Pé-direito", at && at.peDireito != null ? n2(at.peDireito) + " m" : "—") ] };
    },
    /* o catálogo de perfis de aço (js/perfisaco.js), agrupado por série */
    _opcoesCatalogo: function () {
      var P = global.PerfisAco; if (!P) return null;
      var op = [{ id: "", rotulo: "Medidas digitadas (sem catálogo)" }];
      P.SERIES.forEach(function (s) { P.listar(s.id).forEach(function (nm) { op.push({ id: nm, rotulo: nm, grupo: s.rotulo }); }); });
      return op;
    },
    _paramsPerfil: function (pre, perfil, material) {
      var Ar = A(), F = Ar.PERFIS, ps = [], P = global.PerfisAco;
      ps.push({ id: pre + "mat", rotulo: "Material", tipo: "lista", valor: material, opcoes: Object.keys(Ar.MATERIAIS).map(function (k) { return { id: k, rotulo: Ar.MATERIAIS[k].rotulo }; }) });
      if (material === "aco" && P) {
        /* o perfil comercial sai do catálogo de tipos (AISC) — lista por série ou busca pelo nome */
        ps.push({ id: pre + "cat", rotulo: "Perfil de catálogo", tipo: "lista", valor: perfil.cat || "", opcoes: this._opcoesCatalogo() });
        ps.push({ id: pre + "busca", rotulo: "Buscar perfil (ex.: W250X73)", tipo: "texto", valor: "" });
      }
      ps.push({ id: pre + "forma", rotulo: "Perfil", tipo: "lista", valor: perfil.forma,
        opcoes: Object.keys(F).filter(function (k) { return F[k].materiais.indexOf(material) >= 0; }).map(function (k) { return { id: k, rotulo: F[k].rotulo }; }) });
      (F[perfil.forma] ? F[perfil.forma].campos : []).forEach(function (c) {
        ps.push({ id: pre + "d:" + c[0], rotulo: c[1], unidade: "cm", tipo: "numero", passo: "0.1", valor: Math.round((perfil[c[0]] != null ? perfil[c[0]] : c[2]) * 10000) / 100 });   /* 0,01 cm: a alma do W250X73 tem 0,864 cm */
      });
      var s = Ar.secao(perfil);
      ps.push(ro(pre + "sec", "Seção", s.ok ? s.rotulo + " · " + n2(s.area * 1e4, 1) + " cm²" : s.motivo));
      if (material === "aco") ps.push(ro(pre + "rho", "Massa por metro", s.ok ? n2(s.area * Ar.MATERIAIS.aco.rho, 2) + " kg/m (" + Ar.MATERIAIS.aco.fonte + ")" : "—"));
      if (material === "aco") {
        var dc = perfil.cat && P ? P.obter(perfil.cat) : null;
        if (dc) {
          ps.push(ro(pre + "catd", "Catálogo", dc.nome + " · A " + n2(dc.A / 100, 1) + " cm² · " + n2(dc.massa, 1) + " kg/m" + (dc.Ix ? " · Ix " + n2(dc.Ix / 1e4, 0) + " cm⁴" : "") + (dc.Iy ? " · Iy " + n2(dc.Iy / 1e4, 0) + " cm⁴" : "")));
          ps.push(ro(pre + "catf", "Fonte", dc.fonte || P.FONTE));   /* P9: a fonte da SÉRIE (AISC ou Gerdau) */
          if (s.ok) ps.push(ro(pre + "catv", "Área desenhada × catálogo", n2(s.area * 1e4, 2) + " × " + n2(dc.A / 100, 2) + " cm² (o volume é o da geometria, com os raios)"));
        } else ps.push(ro(pre + "pend", "Catálogo", P ? "medidas digitadas — escolha um perfil do catálogo AISC para usar as do fabricante" : "catálogo de perfis não carregado"));
      }
      return ps;
    },
    /* troca de perfil: a forma nova começa com os valores de partida dela */
    _mudarPerfil: function (perfil, material, chave, valor) {
      var F = A().PERFIS, p = clone(perfil), P = global.PerfisAco;
      if (chave === "cat" || chave === "busca") {
        if (!P) return null;
        var nome = chave === "busca" ? (P.buscar(valor, 1)[0] || null) : valor;
        if (!nome) { if (chave === "cat") { delete p.cat; return { perfil: p, material: material }; } return null; }
        var pc = P.paraPerfil(nome); return pc ? { perfil: pc, material: "aco" } : null;
      }
      if (chave === "mat") {
        if (F[p.forma].materiais.indexOf(valor) < 0) { var f0 = Object.keys(F).filter(function (k) { return F[k].materiais.indexOf(valor) >= 0; })[0]; p = { forma: f0 }; F[f0].campos.forEach(function (c) { p[c[0]] = c[2]; }); }
        return { perfil: p, material: valor };
      }
      if (chave === "forma" && F[valor]) { p = { forma: valor }; F[valor].campos.forEach(function (c) { p[c[0]] = c[2]; }); return { perfil: p, material: material }; }
      /* medida digitada à mão: deixa de ser o perfil do catálogo (o nome sairia mentindo) */
      if (chave.indexOf("d:") === 0) { var v = parseFloat(String(valor).replace(",", ".")); if (isFinite(v) && v > 0) { p[chave.slice(2)] = Math.round(v * 100) / 10000; delete p.cat; } return { perfil: p, material: material }; }
      return null;
    },
    esquemaFerramenta: function (sub) {
      if (!previa() || !A()) return null;
      if (sub === "forro" && global.BimForroUI) return global.BimForroUI.esquema(this);   /* P2-B: a ferramenta do forro */
      if (/^p11-/.test(String(sub)) && global.BimTerrenoUI) return global.BimTerrenoUI.esquema(sub, this);   /* P11: as ferramentas do terreno */
      if ((sub === "rampa" || sub === "trelica") && global.BimEstrutUI) return global.BimEstrutUI.esquema(sub, this);   /* P9 — GANCHO */
      if (/^(telhado|fundacao|telhado-borda|telhado-unir)$/.test(sub) && global.BimP3UI) return global.BimP3UI.esquema(sub, this);   /* P3 */
      var self = this, Ar = A(), secs = [this._secNivel()], ps = [];
      var sR = cfg.rs[sub] ? this._secRestrFerr(sub) : null;   /* P1-B: Restrições (como a barra de opções da ferramenta) */
      if (sR) secs.push(sR);
      if (sub === "parede") {
        var tp = this.tipoParede();
        ps.push({ id: "b2f:tipoParede", rotulo: "Tipo", tipo: "lista", valor: G && G._alvTipoId ? G._alvTipoId : "", opcoes: global.AlvTipos ? global.AlvTipos.listar().map(function (t) { return { id: t.id, rotulo: t.rotulo }; }) : [] });
        ps.push(ro("b2f:esp", "Espessura (soma das camadas)", tp ? n2(tp.espessura * 100, 1) + " cm" : "—"));
        ps.push({ id: "b2f:anexarTopo", rotulo: "Anexar topo à laje/cobertura", tipo: "sim-nao", valor: !!cfg.anexarTopo });
        ps.push({ id: "b2f:unir", rotulo: "Unir nos cantos (L, T, X)", tipo: "sim-nao", valor: cfg.unir !== false });
        ps.push({ id: "b2f:juntaCanto", rotulo: "Canto em L", tipo: "lista", valor: cfg.juntaCanto === "esquadria" ? "esquadria" : "topo", opcoes: OPC_CANTO });
        secs.push({ nome: "Parede", params: ps });
        if (tp) secs.push({ nome: "Camadas (de fora para dentro)", params: tp.camadas.map(function (c, i) { return ro("b2f:cam" + i, c.rotulo + " · " + c.face, n2(c.e * 1000, 0) + " mm"); }) });
      } else if (sub === "laje" || sub === "furo") {
        if (sub === "laje") ps.push({ id: "b2f:tipoLaje", rotulo: "Tipo de laje", tipo: "lista", valor: cfg.tipoLajeId, opcoes: Ar.TIPOS_LAJE.map(function (t) { return { id: t.id, rotulo: t.rotulo }; }) });
        ps.push({ id: "b2f:lajeModo", rotulo: "Desenho", tipo: "lista", valor: cfg.lajeModo, opcoes: [{ id: "contorno", rotulo: "Contorno (clique os cantos)" }, { id: "retangulo", rotulo: "Retângulo (dois cantos)" }] });
        secs.push({ nome: sub === "laje" ? "Laje" : "Furo", params: ps });
      } else if (sub === "pilar") {
        ps = this._paramsPerfil("b2f:pp:", cfg.perfilPilar, cfg.materialPilar);
        ps.push({ id: "b2f:giroPilar", rotulo: "Giro", unidade: "graus", tipo: "numero", passo: "15", valor: cfg.giroPilar || 0 });
        secs.push({ nome: "Pilar", params: ps });
      } else if (sub === "viga") {
        secs.push({ nome: "Viga", params: this._paramsPerfil("b2f:pv:", cfg.perfilViga, cfg.materialViga) });
      } else if (sub === "escada") {
        var e = cfg.escada, at = this.nivelAtivo(), H = this.alturaFerramenta("escada") || (e.desnivel > 0 ? e.desnivel : (at && at.peDireito > 0 ? at.peDireito : null));
        var c = H ? Ar.escadaCalc(H, { emax: e.emax, pmin: e.pmin, piso: e.piso, tipoId: e.tipoId, larguraMin: e.larguraMin, largura: e.largura, regra: e.regra }) : null;
        ps.push({ id: "b2f:esc:forma", rotulo: "Forma", tipo: "lista", valor: e.forma, opcoes: [{ id: "reta", rotulo: "Reta" }, { id: "L", rotulo: "Em L (com patamar)" }, { id: "U", rotulo: "Em U (patamar de meia-volta)" }] });   /* P9: U */
        if (e.forma === "L" || e.forma === "U") ps.push({ id: "b2f:esc:giro", rotulo: "Vira para a", tipo: "lista", valor: e.giro, opcoes: [{ id: "direita", rotulo: "Direita" }, { id: "esquerda", rotulo: "Esquerda" }] });
        if (e.forma === "U") ps.push({ id: "b2f:esc:vao", rotulo: "Vão entre os lances (poço)", unidade: "m", tipo: "numero", passo: "0.05", valor: e.vao || 0 });   /* P9 */
        /* P9: começar/terminar com espelho (parâmetros do lance) e o revestimento */
        ps.push({ id: "b2f:esc:comecaEspelho", rotulo: "Começar com espelho", tipo: "sim-nao", valor: e.comecaEspelho !== false });
        ps.push({ id: "b2f:esc:terminaEspelho", rotulo: "Finalizar com espelho", tipo: "sim-nao", valor: e.terminaEspelho !== false });
        ps.push({ id: "b2f:esc:revPiso", rotulo: "Revestimento do piso (espessura)", unidade: "cm", tipo: "numero", passo: "0.5", valor: e.revPiso > 0 ? Math.round(e.revPiso * 1000) / 10 : "" });
        ps.push({ id: "b2f:esc:revEspelho", rotulo: "Revestimento do espelho (espessura)", unidade: "cm", tipo: "numero", passo: "0.5", valor: e.revEspelho > 0 ? Math.round(e.revEspelho * 1000) / 10 : "" });
        ps.push({ id: "b2f:esc:largura", rotulo: "Largura do lance", unidade: "m", tipo: "numero", passo: "0.05", valor: e.largura });
        ps.push({ id: "b2f:esc:desnivel", rotulo: cfg.rs.escada.sup && this.niveis().length ? "Desnível (só sem nível superior; vazio = pé-direito)" : "Desnível (vazio = pé-direito)", unidade: "m", tipo: "numero", passo: "0.01", valor: e.desnivel > 0 ? e.desnivel : "" });
        ps.push({ id: "b2f:esc:espessura", rotulo: "Laje da escada", unidade: "cm", tipo: "numero", passo: "1", valor: Math.round(e.espessura * 100) });
        secs.push({ nome: "Escada", params: ps });
        /* as REGRAS do tipo, como as Propriedades de tipo da escada */
        var pt = [];
        pt.push({ id: "b2f:esc:tipoId", rotulo: "Tipo", tipo: "lista", valor: e.tipoId, opcoes: Ar.TIPOS_ESCADA.map(function (t) { return { id: t.id, rotulo: t.rotulo }; }) });
        /* P9: "Regras de cálculo" (padrão = piso mínimo do tipo; Blondel RA = 63 a 64 cm) */
        if (Ar.REGRAS_ESCADA) pt.push({ id: "b2f:esc:regra", rotulo: "Regras de cálculo", tipo: "lista", valor: Ar.regraEscada(e.regra), opcoes: Object.keys(Ar.REGRAS_ESCADA).map(function (k) { return { id: k, rotulo: Ar.REGRAS_ESCADA[k] }; }) });
        pt.push({ id: "b2f:esc:emax", rotulo: "Altura máxima do espelho", unidade: "cm", tipo: "numero", passo: "0.5", valor: Math.round(e.emax * 1000) / 10 });
        pt.push({ id: "b2f:esc:pmin", rotulo: "Profundidade mínima do piso", unidade: "cm", tipo: "numero", passo: "0.5", valor: Math.round(e.pmin * 1000) / 10 });
        pt.push({ id: "b2f:esc:piso", rotulo: "Profundidade do piso (vazio = a mínima)", unidade: "cm", tipo: "numero", passo: "0.5", valor: e.piso > 0 ? Math.round(e.piso * 1000) / 10 : "" });
        pt.push({ id: "b2f:esc:larguraMin", rotulo: "Largura mínima do lance", unidade: "m", tipo: "numero", passo: "0.05", valor: e.larguraMin });
        pt.push({ id: "b2f:esc:guarda", rotulo: "Guarda-corpo", tipo: "lista", valor: e.guarda, opcoes: Object.keys(Ar.GUARDA_ESCADA).map(function (k) { return { id: k, rotulo: Ar.GUARDA_ESCADA[k] }; }) });
        pt.push(ro("b2f:esc:calc", "Degraus", c && c.ok ? c.n + " espelhos de " + n2(c.e * 100, 1) + " cm · piso " + n2(c.p * 100, 1) + " cm · 2e + p = " + n2(c.blondel * 100, 1) + " cm" : (c ? c.motivo : "informe o desnível ou crie os níveis")));
        if (c && c.ok && c.avisos.length) pt.push(ro("b2f:esc:av", "Atenção", c.avisos.join(" ")));
        secs.push({ nome: "Tipo de escada (regras)", params: pt });
      } else if (sub === "guarda") {
        var gc = cfg.guarda;
        ps.push({ id: "b2f:gc:altura", rotulo: "Altura", unidade: "m", tipo: "numero", passo: "0.05", valor: gc.altura });
        ps.push({ id: "b2f:gc:espac", rotulo: "Vão máximo entre montantes", unidade: "m", tipo: "numero", passo: "0.1", valor: gc.espac });
        ps.push({ id: "b2f:gc:lado", rotulo: "Lado (na escada)", tipo: "lista", valor: gc.lado, opcoes: [{ id: "", rotulo: "Padrão (direita / externo)" }, { id: "direita", rotulo: "Direita" }, { id: "esquerda", rotulo: "Esquerda" }, { id: "externo", rotulo: "Externo (escada em L)" }, { id: "interno", rotulo: "Interno (escada em L)" }] });
        secs.push({ nome: "Guarda-corpo", params: ps });
      } else if (sub === "eixo") {
        var est = B() && B().editarEstado ? B().editarEstado() : null, EX = (est && est.estado && est.estado.eixos) || [];
        secs.push({ nome: "Eixos (" + EX.length + ")", params: EX.length ? EX.map(function (x) { return { id: "b2f:eixo:" + x.id, rotulo: "Eixo " + x.id, tipo: "texto", valor: x.nome }; })
          .concat(EX.map(function (x) { return { id: "b2f:eixoDel:" + x.id, rotulo: "Eixo " + x.nome, tipo: "botao", rotuloBotao: "Apagar", fn: function () { B().b2Op({ op: "apagar", id: x.id }); self._repintar(); } }; }))
          : [ro("b2f:eixo0", "Eixos", "nenhum — clique as duas pontas no 3D")] });
      }
      return { titulo: "Ferramenta: " + (ROT_SUB[sub] || sub), icone: sub === "parede" ? "parede" : (sub === "pilar" ? "pilar" : "quadrado"), semEditarTipo: true, secoes: secs,
               onMudar: function (pid, valor) { return self.mudarFerramenta(sub, pid, valor); } };
    },
    _repintar: function () { try { if (global.BimShell && this._sub) BimShell.pintarProps(this.esquemaFerramenta(this._sub)); } catch (e) {} },
    mudarFerramenta: function (sub, pid, valor) {
      var k = String(pid).replace(/^b2f:/, ""), num = parseFloat(String(valor).replace(",", "."));
      if (k === "nivel") cfg.nivelId = valor;
      else if (k.indexOf("rs:") === 0) this._mudarRestrFerr(sub, k.slice(3), valor);   /* P1-B */
      else if (k === "tipoParede" && G && global.AlvTipos && global.AlvTipos.TIPOS[valor]) {
        /* o tipo ativo é o MESMO do painel "Tipos de parede" (Gestao._alvTipoId) */
        G._alvTipoId = valor; G._alvEspessuras = null; G._alvNucleoEscolhido = null; G._alvEspNucleo = null;
      }
      else if (k === "anexarTopo" || k === "unir") cfg[k] = !!valor;
      else if (k === "juntaCanto") cfg.juntaCanto = valor === "esquadria" ? "esquadria" : "topo";
      else if (k === "tipoLaje") cfg.tipoLajeId = valor;
      else if (k === "lajeModo") cfg.lajeModo = valor === "retangulo" ? "retangulo" : "contorno";
      else if (k === "giroPilar") cfg.giroPilar = isFinite(num) ? num : 0;
      else if (k.indexOf("pp:") === 0 || k.indexOf("pv:") === 0) {
        var pil = k.indexOf("pp:") === 0, r = this._mudarPerfil(pil ? cfg.perfilPilar : cfg.perfilViga, pil ? cfg.materialPilar : cfg.materialViga, k.slice(3), valor);
        if (r) { if (pil) { cfg.perfilPilar = r.perfil; cfg.materialPilar = r.material; } else { cfg.perfilViga = r.perfil; cfg.materialViga = r.material; } }
      }
      else if (k.indexOf("esc:") === 0) {
        var ck = k.slice(4);
        if (ck === "forma" || ck === "giro") cfg.escada[ck] = valor;
        else if (ck === "tipoId") {
          /* trocar o tipo traz as regras dele (como em qualquer troca de tipo) */
          var te = A().tipoEscada(valor);
          cfg.escada.tipoId = te.id; cfg.escada.emax = te.emax; cfg.escada.pmin = te.pmin; cfg.escada.piso = te.piso; cfg.escada.larguraMin = te.larguraMin; cfg.escada.guarda = te.guarda;
        }
        else if (ck === "guarda") cfg.escada.guarda = A().GUARDA_ESCADA[valor] ? valor : "dois";
        else if (ck === "desnivel") cfg.escada.desnivel = isFinite(num) && num > 0 ? num : null;
        else if (ck === "piso") cfg.escada.piso = isFinite(num) && num > 0 ? num / 100 : null;
        else if (ck === "pmin" && isFinite(num) && num > 0) cfg.escada.pmin = num / 100;
        else if (ck === "larguraMin" && isFinite(num) && num > 0) cfg.escada.larguraMin = num;
        else if (ck === "emax" && isFinite(num) && num > 0) cfg.escada.emax = num / 100;
        else if (ck === "espessura" && isFinite(num) && num > 0) cfg.escada.espessura = num / 100;
        else if (ck === "largura" && isFinite(num) && num > 0) cfg.escada.largura = num;
        /* P9 */
        else if (ck === "regra") cfg.escada.regra = A().regraEscada(valor);
        else if (ck === "vao") cfg.escada.vao = isFinite(num) && num >= 0 ? num : 0;
        else if (ck === "comecaEspelho" || ck === "terminaEspelho") cfg.escada[ck] = !!valor;
        else if (ck === "revPiso" || ck === "revEspelho") cfg.escada[ck] = isFinite(num) && num > 0 ? num / 100 : null;
      }
      else if (k.indexOf("gc:") === 0) {
        var gk = k.slice(3);
        if (gk === "lado") cfg.guarda.lado = valor;
        else if (isFinite(num) && num > 0) cfg.guarda[gk] = num;
      }
      else if (k.indexOf("eixo:") === 0) { if (String(valor).trim()) B().b2Op({ op: "renomear", id: k.slice(5), nome: String(valor) }); }
      this.enviar();
      return this.esquemaFerramenta(sub);
    },

    /* ------------------------------------- Propriedades da PEÇA */
    _peca: function (uid) {
      var m = /^edit:(.+)$/.exec(String(uid || "")); if (!m) return null;
      var est = B() && B().editarEstado ? B().editarEstado() : null; if (!est) return null;
      var c = (est.estado.caixas || []).filter(function (x) { return x.id === m[1]; })[0];
      if (!c || !c.b2) return null;
      var vz = global.BimEdit ? global.BimEdit.vaosDasParedes(est.estado, B().familiaAvaliar) : {};
      return { c: c, areaVaos: vz[c.id] ? vz[c.id].areaVaos : 0, estado: est.estado };
    },
    secoesProps: function (info) {
      if (!previa() || !A() || !info) return [];
      var x = this._peca(info.uid); if (!x) return [];
      var c = x.c, Ar = A(), self = this, ps = [], secs = [];
      var med = global.BimEdit ? global.BimEdit.medidasDe(c, x.areaVaos) : {};
      if (c.tipo === "parede") {
        ps.push({ id: "b2:tipoParede", rotulo: "Tipo", tipo: "lista", valor: c.tipoParede ? c.tipoParede.id : "", opcoes: [{ id: "", rotulo: c.tipoParede ? c.tipoParede.rotulo : "Genérica (sem tipo)" }].concat(global.AlvTipos ? global.AlvTipos.listar().map(function (t) { return { id: t.id, rotulo: t.rotulo }; }) : []) });
        ps.push(ro("b2:esp", "Espessura", n2(c.espessura * 100, 1) + " cm"));
        ps.push({ id: "b2:anexarTopo", rotulo: "Anexar topo", tipo: "sim-nao", valor: !!c.anexarTopo });
        ps.push({ id: "b2:unir", rotulo: "Unir nos cantos", tipo: "sim-nao", valor: c.unir !== false });
        ps.push({ id: "b2:inverterFaces", rotulo: "Inverter faces (fora ↔ dentro)", tipo: "sim-nao", valor: !!c.inverterFaces });
        ps.push({ id: "b2:juntaCanto", rotulo: "Canto em L", tipo: "lista", valor: c.juntaCanto === "esquadria" ? "esquadria" : "topo", opcoes: OPC_CANTO });
        ps.push(ro("b2:juntas", "Junções", (c.juntas || []).length ? c.juntas.map(function (j) {
          return j.tipo + " com " + j.com + (j.modo === "esquadria" ? " (meia-esquadria)" : (j.modo === "topo" ? (j.passa ? " (topo, passa)" : " (topo, para na face)") : ""));
        }).join(", ") : "nenhuma"));
        ps.push(ro("b2:comp", "Comprimento (eixo líquido)", n2(med.comprimento) + " m"));
        ps.push(ro("b2:faces", "Área das faces (fora / dentro)", n2(med.areaFora) + " / " + n2(med.areaDentro) + " m²"));
        ps.push(ro("b2:nivel", "Nível", c.nivelId || "—"));
        secs.push({ nome: "Modelador", params: ps });
        if (c.tipoParede) secs.push({ nome: "Camadas — quantitativo", params: Ar.camadasDe(c, x.areaVaos).map(function (k, i) { return ro("b2:cam" + i, k.rotulo + " · " + k.face, n2(k.area) + " m² · " + n2(k.volume, 3) + " m³"); }) });
      } else if (c.tipo === "laje") {
        ps.push({ id: "b2:tipoLaje", rotulo: "Tipo de laje", tipo: "lista", valor: c.tipoLaje ? c.tipoLaje.id : "", opcoes: [{ id: "", rotulo: c.tipoLaje ? c.tipoLaje.rotulo : "—" }].concat(Ar.TIPOS_LAJE.map(function (t) { return { id: t.id, rotulo: t.rotulo }; })) });
        ps.push(ro("b2:area", "Área líquida", n2(c.area) + " m²" + (c.areaFuros ? " (furos " + n2(c.areaFuros) + " m²)" : "")));
        ps.push(ro("b2:per", "Perímetro (bordas)", n2(c.perimetro) + " m"));
        ps.push(ro("b2:vol", "Volume", n2(c.volume, 3) + " m³"));
        ps.push({ id: "b2:furo", rotulo: "Furo", tipo: "botao", rotuloBotao: "Desenhar furo", fn: function () { self.armar("furo"); } });
        if (c.avisos) ps.push(ro("b2:av", "Atenção", c.avisos.join("; ")));
        secs.push({ nome: "Modelador", params: ps });
      } else if ((c.tipo === "pilar" || c.tipo === "viga") && c.perfil) {
        ps = this._paramsPerfil("b2:pf:", c.perfil, c.material);
        ps.push(ro("b2:vol", "Volume", n2(c.volume, 4) + " m³"));
        if (c.massa != null) ps.push(ro("b2:massa", "Massa", n2(c.massa, 1) + " kg"));
        secs.push({ nome: "Perfil", params: ps });
      } else if (c.tipo === "escada" && c.escada) {
        var p = c.escada.par || {}, k = c.escada.calc || {};
        ps.push({ id: "b2:esc:forma", rotulo: "Forma", tipo: "lista", valor: p.forma, opcoes: [{ id: "reta", rotulo: "Reta" }, { id: "L", rotulo: "Em L (com patamar)" }] });
        if (p.forma === "L") ps.push({ id: "b2:esc:giro", rotulo: "Vira para a", tipo: "lista", valor: p.giro, opcoes: [{ id: "direita", rotulo: "Direita" }, { id: "esquerda", rotulo: "Esquerda" }] });
        ps.push({ id: "b2:esc:largura", rotulo: "Largura", unidade: "m", tipo: "numero", passo: "0.05", valor: p.largura });
        /* P1-B: com o nível superior, o desnível sai dos níveis (Restrições) */
        if (c.restricaoSuperior != null && c.deslocBase != null) ps.push(ro("b2:esc:desnivelN", "Desnível", n2(p.desnivel) + " m (pelos níveis)"));
        else ps.push({ id: "b2:esc:desnivel", rotulo: "Desnível", unidade: "m", tipo: "numero", passo: "0.01", valor: p.desnivel });
        ps.push({ id: "b2:esc:emaxCm", rotulo: "Altura máxima do espelho (tipo)", unidade: "cm", tipo: "numero", passo: "0.5", valor: Math.round(num0(k.emax, 0.18) * 1000) / 10 });
        ps.push({ id: "b2:esc:pminCm", rotulo: "Profundidade mínima do piso (tipo)", unidade: "cm", tipo: "numero", passo: "0.5", valor: Math.round(num0(k.pmin, 0.275) * 1000) / 10 });
        ps.push(ro("b2:esc:calc", "Degraus", k.n + " espelhos de " + n2(k.e * 100, 1) + " cm · piso " + n2(k.p * 100, 1) + " cm · 2e + p = " + n2(k.blondel * 100, 1) + " cm"));
        var gHosp = (x.estado.caixas || []).filter(function (g) { return g.tipo === "guarda" && g.guarda && g.guarda.host && String(g.guarda.host.id) === String(c.id); });
        ps.push(ro("b2:esc:gc", "Guarda-corpos da escada", gHosp.length ? gHosp.length + " (" + gHosp.map(function (g) { return g.guarda.host.lado; }).join(", ") + ") — seguem a escada" : "nenhum"));
        if (k.avisos && k.avisos.length) ps.push(ro("b2:esc:av", "Atenção", k.avisos.join(" ")));
        ps.push(ro("b2:esc:q", "Quantitativo", n2(med.volume, 3) + " m³ · " + n2(med.area) + " m² de piso · " + (c.medidas ? c.medidas.pisos : "—") + " pisos"));
        secs.push({ nome: "Escada", params: ps });
      } else if (c.tipo === "guarda" && c.guarda) {
        var gp = c.guarda.par || {};
        ps.push({ id: "b2:gc:altura", rotulo: "Altura", unidade: "m", tipo: "numero", passo: "0.05", valor: gp.altura });
        ps.push({ id: "b2:gc:espac", rotulo: "Vão máximo entre montantes", unidade: "m", tipo: "numero", passo: "0.1", valor: gp.espac });
        ps.push(ro("b2:gc:q", "Quantitativo", n2(med.comprimento) + " m · " + (c.medidas ? c.medidas.montantes : "—") + " montantes"));
        secs.push({ nome: "Guarda-corpo", params: ps });
      }
      /* P1-B: Restrições (nível base/superior e deslocamentos), logo depois do tipo */
      var sR = this._secRestrPeca(c);
      if (sR) secs.splice(Math.min(1, secs.length), 0, sR);
      return secs;
    },
    /* P1-C — com a paleta do registro (js/bimpropsui.js), as Restrições, o
       tipo, as cotas e a identidade vêm do registro. Ficam aqui só os
       controles do OrçaPRO que não são parâmetro do inventário (uniões, faces,
       canto, furo, forma da escada…), numa seção "Modelador (OrçaPRO)". */
    secoesExtrasPaleta: function (info) {
      if (global.BimTerrenoUI) { var t11 = global.BimTerrenoUI.secoesPaleta(info); if (t11) return t11; }   /* P11: plataforma (orçamento), divisa (rumos), terreno (curvas) */
      var IDS = { "b2:anexarTopo": 1, "b2:unir": 1, "b2:inverterFaces": 1, "b2:juntaCanto": 1, "b2:juntas": 1, "b2:furo": 1, "b2:av": 1,
                  "b2:esc:forma": 1, "b2:esc:giro": 1, "b2:esc:calc": 1, "b2:esc:gc": 1, "b2:esc:av": 1, "b2:gc:q": 1 };
      var ps = [];
      this.secoesProps(info).forEach(function (s) {
        if (s.nome === "Restrições") return;
        (s.params || []).forEach(function (p) { if (IDS[p.id]) ps.push(p); });
      });
      return ps.length ? [{ nome: "Modelador (OrçaPRO)", params: ps }] : [];
    },
    /* uma propriedade da peça mudou → op `ajustar` (true = repintar) */
    mudar: function (info, pid, valor) {
      if (/^b2:p11:/.test(String(pid)) && global.BimTerrenoUI) return global.BimTerrenoUI.mudarPaleta(info, pid, valor);   /* P11 */
      var x = this._peca(info && info.uid); if (!x || !B() || !B().b2Op) return false;
      var c = x.c, k = String(pid).replace(/^b2:/, ""), campos = null, num = parseFloat(String(valor).replace(",", "."));
      if (k === "anexarTopo" || k === "unir" || k === "inverterFaces") { campos = {}; campos[k] = !!valor; }
      else if (k === "juntaCanto") campos = { juntaCanto: valor === "esquadria" ? "esquadria" : "topo" };
      else if (k === "tipoParede" && global.AlvTipos && global.AlvTipos.TIPOS[valor]) campos = { tipoParede: A().tipoParede(global.AlvTipos.tipo(valor)) };
      else if (k === "tipoLaje") { var tl = A().TIPOS_LAJE.filter(function (t) { return t.id === valor; })[0]; if (tl) campos = { tipoLaje: tl }; }
      else if (k.indexOf("pf:") === 0) { var r = this._mudarPerfil(c.perfil, c.material, k.slice(3), valor); if (r) campos = { perfil: r.perfil, material: r.material }; }
      else if (k.indexOf("rs:") === 0) { var rs = this._restrPeca(c, k.slice(3), valor); if (rs) campos = { restricoes: rs }; }   /* P1-B */
      else if (k === "esc:desnivel" && c.deslocBase != null && (c.nivelBase != null || c.nivelId != null)) {
        /* escada presa a nível sem nível superior: o desnível É a altura desejada */
        var rsE = this._restrPeca(c, "alturaNaoConectada", valor); if (rsE) campos = { restricoes: rsE };
      }
      else if (k.indexOf("esc:") === 0) {
        var ek = k.slice(4), e = {};
        if (ek === "forma" || ek === "giro") e[ek] = valor;
        else if ((ek === "emaxCm" || ek === "pminCm") && isFinite(num) && num > 0) e[ek.slice(0, -2)] = num / 100;   /* a tela fala em cm, a escada guarda em m */
        else if (isFinite(num) && num > 0) e[ek] = num; else return false;
        campos = { escada: e };
      }
      else if (k.indexOf("gc:") === 0 && isFinite(num) && num > 0) { campos = { guarda: {} }; campos.guarda[k.slice(3)] = num; }
      if (!campos) return false;
      return B().b2Op({ op: "ajustar", id: c.id, campos: campos });
    }
  };

  global.BimArqUI = BimArqUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimArqUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
