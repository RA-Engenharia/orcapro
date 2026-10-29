/* =====================================================================
 * bimrodapeui.js — a TELA do RODAPÉ (prévia `?previa=modelador`), 29/10/2026.
 *
 * O motor é o js/bimrodape.js (puro). Aqui só: o botão "Rodapé" na fita (Arquitetura › Modelador e
 * Acabamentos › Piso e revestimento), as Propriedades da FERRAMENTA (modo, face, embutido, altura,
 * espessura, material), a op que a ferramenta manda e o balão de resumo. Quem coleta o clique na
 * parede é o js/bim.js (gancho S._rodapeClique); quem chama `registrar` e `esquema` é o
 * js/bimarqui.js. As Propriedades da PEÇA vêm do registro (js/bimparam.js, categoria rodape).
 *
 * MODOS: "todas" = TODAS as paredes sem revestimento do nível, num botão (a parede nova do nível
 * entra sozinha); "selecionadas" = só as paredes selecionadas (clique, Ctrl+clique ou caixa);
 * "clicar" = clique em cada parede (Esc termina). Face = Dentro | Fora | Ambas. Embutido (rente à
 * face acabada) ou sobreposto (com a espessura). Material = "Igual ao piso" (o do piso em contato,
 * no 3D e no Twinmotion) ou outro da lista.
 * ===================================================================== */
(function (global) {
  "use strict";
  function R() { return global.BimRodape || null; }
  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function n2(v, c) { var x = Number(v); return isFinite(x) ? x.toFixed(c == null ? 2 : c).replace(".", ",") : "—"; }
  function num(v, d) { var x = parseFloat(String(v).replace(",", ".")); return isFinite(x) ? x : d; }
  function ro(id, rot, v) { return { id: id, rotulo: rot, leitura: true, valor: v == null || v === "" ? "—" : v }; }

  var cfg = { modo: "todas", face: "dentro", embutido: false, altura: 0.07, espessura: 0.015, material: "piso", ultimo: "" };
  var MODOS = [{ id: "todas", rotulo: "Todas as paredes sem revestimento (1 clique)" }, { id: "selecionadas", rotulo: "Paredes selecionadas" }, { id: "clicar", rotulo: "Clicar parede a parede" }];
  var FACES = [{ id: "dentro", rotulo: "Dentro" }, { id: "fora", rotulo: "Fora" }, { id: "ambas", rotulo: "Ambas" }];

  /* a lista de materiais: "Igual ao piso" + os pisos e as pinturas do catálogo de acabamento */
  function opcoesMaterial() {
    var out = [{ id: "piso", rotulo: "Igual ao piso" }], AV = global.BimAcabVis;
    if (AV) {
      AV.CATALOGO.forEach(function (e) { if (e.grupo === "piso") out.push({ id: e.rotulo, rotulo: e.rotulo, grupo: "Pisos" }); });
      AV.CATALOGO.forEach(function (e) { if (e.grupo === "fachada" && /pintura|textura|madeira|ripado/i.test(e.rotulo)) out.push({ id: e.rotulo, rotulo: e.rotulo, grupo: "Pintura e madeira" }); });
    }
    return out;
  }
  /* o próximo id do conjunto: ro1, ro2… (não repete com os que já existem) */
  function proximoId(estado) {
    var usados = {}; arr(estado && estado.rodapeSpecs).forEach(function (s) { usados[String(s.id)] = 1; });
    arr(estado && estado.caixas).forEach(function (c) { usados[String(c.id)] = 1; });
    for (var i = 1; i < 100000; i++) if (!usados["ro" + i]) return "ro" + i;
    return "ro" + Date.now().toString(36);
  }
  function dadosDaCfg() {
    return { face: cfg.face, embutido: !!cfg.embutido, altura: cfg.altura, espessura: cfg.espessura, material: cfg.material || "piso" };
  }
  function paredesDoEstado(estado) { return arr(estado && estado.caixas).filter(function (c) { return c && c.tipo === "parede"; }); }

  /* as paredes selecionadas agora (seleção do 3D + desenho de precisão) que são paredes do modelador */
  function selecionadas(estado) {
    var ids = [], eh = {}; paredesDoEstado(estado).forEach(function (c) { eh[String(c.id)] = 1; });
    try {
      var b = global.BIM, pr = b && b.precisao ? b.precisao() : null;
      arr(pr && pr.selecao ? pr.selecao() : []).forEach(function (i) { i = String(i); if (eh[i] && ids.indexOf(i) < 0) ids.push(i); });
      var su = b && b.selecao ? (b.selecao().uids || []) : [];
      arr(su).forEach(function (u) { u = String(u); if (/^edit:/.test(u)) { var i = u.slice(5); if (eh[i] && ids.indexOf(i) < 0) ids.push(i); } });
    } catch (e) {}
    return ids;
  }
  function resumoDe(id) {
    try {
      var est = global.BIM && global.BIM.editarEstado ? global.BIM.editarEstado().estado : null, r = est && est.rodapeResumo && est.rodapeResumo.porConjunto ? est.rodapeResumo.porConjunto[id] : null;
      return r && R() ? R().resumoTexto(r) : "";
    } catch (e) { return ""; }
  }

  var BimRodapeUI = {
    ativo: previa, cfg: function () { return JSON.parse(JSON.stringify(cfg)); },
    MODOS: MODOS, FACES: FACES, proximoId: proximoId, selecionadas: selecionadas,

    /* o botão na fita (chamado pelo BimArqUI.registrar) */
    registrar: function (reg, arqui, opts) {
      var pv = opts && opts.previa != null ? !!opts.previa : previa(), Rb = global.BimRibbon;
      if (!pv || !Rb || !R() || !reg) return false;
      var dica = "Rodapé 3D: uma peça paramétrica que SEGUE as paredes (esticou a parede, o rodapé acompanha). Em Propriedades: todas as paredes sem revestimento (1 clique), só as selecionadas ou parede a parede; dentro, fora ou ambas; embutido (rente) ou sobreposto; altura, espessura e material \"Igual ao piso\" (o mesmo material do piso em contato, também no Twinmotion). Corta nas portas e não nasce em parede revestida de cerâmica/porcelanato/azulejo. O metro de rodapé do ambiente passa a sair da peça.";
      Rb.acrescentar("arquitetura", "Arquitetura", "Modelador", [{ id: "rodape", rotulo: "Rodapé", icone: "regua", grande: true, tipo: "alterna", dica: dica }]);
      Rb.acrescentar("acabamentos", "Acabamentos", "Piso e revestimento", [{ id: "rodape-acab", rotulo: "Rodapé", icone: "regua", grande: true, tipo: "alterna", requer: "modelo", dica: dica }]);
      ["rodape", "rodape-acab"].forEach(function (k) { if (Rb._EXCLUSIVOS && Rb._EXCLUSIVOS.indexOf(k) < 0) Rb._EXCLUSIVOS.push(k); });
      var liga = function (e) {
        if (e && e.ligado === false) { var b = global.BIM; if (b && b.editarArmar) b.editarArmar(null); return true; }
        return arqui && arqui.armar ? arqui.armar("rodape") : false;
      };
      reg.rodape = liga; reg["rodape-acab"] = liga;
      return true;
    },

    /* a op de um CONJUNTO novo (todas / selecionadas) — conferida; estado = o atual */
    opLancar: function (estado, nivel) {
      var M = R(); if (!M) return { ok: false, motivo: "O motor do rodapé (js/bimrodape.js) não carregou." };
      if (!paredesDoEstado(estado).length) return { ok: false, motivo: "Não há paredes do modelador para receber rodapé." };
      var d = dadosDaCfg();
      if (cfg.modo === "selecionadas") {
        var ids = selecionadas(estado);
        if (!ids.length) return { ok: false, motivo: "Selecione as paredes (clique, Ctrl+clique ou caixa) e clique em Lançar." };
        d.modo = "paredes"; d.paredes = ids;
      } else { d.modo = "todas"; if (nivel && nivel.id != null && arr(estado && estado.caixas).some(function (c) { return c && c.tipo === "parede" && c.nivelId != null; })) d.nivelId = String(nivel.id); }
      var o = M.op(proximoId(estado), d);
      return o ? { ok: true, op: o } : { ok: false, motivo: "Rodapé inválido: confira altura, espessura e material." };
    },
    /* clicar parede a parede: a parede do clique vira um conjunto de uma parede só (ou entra no conjunto "clicado" desta sessão) */
    opParede: function (estado, paredeId, id) {
      var M = R(); if (!M) return { ok: false, motivo: "O motor do rodapé (js/bimrodape.js) não carregou." };
      var c = paredesDoEstado(estado).filter(function (x) { return String(x.id) === String(paredeId); })[0];
      if (!c) return { ok: false, motivo: "Clique em cima de uma parede do modelador." };
      var d = dadosDaCfg(); d.modo = "paredes"; d.paredes = [String(paredeId)];
      var o = M.op(id || proximoId(estado), d);
      return o ? { ok: true, op: o } : { ok: false, motivo: "Rodapé inválido: confira altura, espessura e material." };
    },
    /* o clique do 3D na ferramenta (chamado pelo js/bim.js › S._rodapeClique) → mensagem do balão */
    cliqueParede: function (estado, paredeId) {
      var r = this.opParede(estado, paredeId);
      if (!r.ok) return r;
      return { ok: true, op: r.op, resumo: "Rodapé na parede " + paredeId + " (" + (cfg.face === "ambas" ? "dos dois lados" : "lado de " + cfg.face) + "). Clique em outra parede, ou Esc." };
    },
    lancar: function (arqui) {
      var b = global.BIM; if (!b || !b.editarEstado || !b.b2Op) return false;
      var est = b.editarEstado().estado, nv = arqui && arqui.nivelAtivo ? arqui.nivelAtivo() : null, r = this.opLancar(est, nv);
      if (!r.ok) { cfg.ultimo = r.motivo; if (b.dica) b.dica(r.motivo); return false; }
      var ok = b.b2Op(r.op);
      var res = ok ? resumoDe(r.op.id) : "";
      cfg.ultimo = ok ? (res ? "Rodapé lançado: " + res + "." : "Rodapé lançado.") : "Não foi possível lançar o rodapé.";
      if (b.dica) b.dica(cfg.ultimo);
      return ok;
    },

    /* Propriedades da FERRAMENTA (chamado pelo BimArqUI.esquemaFerramenta) */
    esquema: function (arqui) {
      var self = this, secs = [];
      if (arqui && arqui._secNivel) secs.push(arqui._secNivel());
      var ps = [
        { id: "b2f:ro:modo", rotulo: "Modo", tipo: "lista", valor: cfg.modo, opcoes: MODOS },
        { id: "b2f:ro:face", rotulo: "Face", tipo: "lista", valor: cfg.face, opcoes: FACES },
        { id: "b2f:ro:embutido", rotulo: "Embutido (rente à parede)", tipo: "sim-nao", valor: !!cfg.embutido },
        { id: "b2f:ro:altura", rotulo: "Altura", unidade: "m", tipo: "numero", passo: "0.01", valor: cfg.altura },
        { id: "b2f:ro:espessura", rotulo: "Espessura", unidade: "m", tipo: "numero", passo: "0.005", valor: cfg.espessura },
        { id: "b2f:ro:material", rotulo: "Material", tipo: "lista", valor: cfg.material, opcoes: opcoesMaterial() }
      ];
      if (cfg.modo === "clicar") ps.push(ro("b2f:ro:dica", "Como usar", "Clique em cada parede; Esc termina."));
      else ps.push({ id: "b2f:ro:lancar", rotulo: cfg.modo === "todas" ? "Lançar" : "Lançar", tipo: "botao", rotuloBotao: cfg.modo === "todas" ? "Lançar em todas as paredes sem revestimento" : "Lançar nas paredes selecionadas", fn: function () { self.lancar(arqui); if (arqui && global.BimShell) { try { global.BimShell.pintarProps(arqui.esquemaFerramenta("rodape")); } catch (e) {} } } });
      if (cfg.ultimo) ps.push(ro("b2f:ro:ultimo", "Último lançamento", cfg.ultimo));
      secs.push({ nome: "Rodapé", params: ps });
      return { titulo: "Ferramenta: Rodapé", icone: "regua", semEditarTipo: true, secoes: secs, onMudar: function (pid, valor) { return self.mudar(pid, valor, arqui); } };
    },
    mudar: function (pid, valor, arqui) {
      var k = String(pid).replace(/^b2f:/, "");
      if (k === "nivel" && arqui && arqui.mudarFerramenta) return arqui.mudarFerramenta("rodape", pid, valor);
      if (k === "ro:modo" && MODOS.some(function (m) { return m.id === valor; })) cfg.modo = valor;
      else if (k === "ro:face" && FACES.some(function (m) { return m.id === valor; })) cfg.face = valor;
      else if (k === "ro:embutido") cfg.embutido = valor === true || valor === "true" || valor === "Sim";
      else if (k === "ro:altura") { var a = num(valor, cfg.altura); if (a >= 0.02 && a <= 0.5) cfg.altura = a; }
      else if (k === "ro:espessura") { var e = num(valor, cfg.espessura); if (e >= 0.003 && e <= 0.1) cfg.espessura = e; }
      else if (k === "ro:material") cfg.material = String(valor || "piso");
      return this.esquema(arqui);
    }
  };

  global.BimRodapeUI = BimRodapeUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimRodapeUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
