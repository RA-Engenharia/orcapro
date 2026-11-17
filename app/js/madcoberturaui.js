/* =====================================================================
 * madcoberturaui.js — A TELA da madeira calculada na cobertura do BIM (fiação fina: a conta está no js/madcobertura.js).
 *
 * FLUXO CURTO — desenhar → escolher → calcular → ver:
 *   1) desenhar: a ferramenta de Telhado de sempre (traçado em planta, paredes, contorno ou perfil por corte), com beiral sim/não + medida, águas, inclinação e telha;
 *   2) escolher: em Propriedades da ferramenta, "Madeira (módulo de cálculo)" = "Calcular ao lançar" — ou depois, em Arquitetura › Madeira calculada;
 *   3) calcular: o sistema detecta o APOIO (laje, paredes, pilares), escolhe tesouras / terças sobre pontaletes / vigas sobre pilares, roda o motor e GRAVA o resultado no
 *      telhado (as peças, ripas, telhas e o quantitativo saem do modelo);
 *   4) ver: janela de resultado + 3D. Mudou delimitação, beiral, inclinação, telha, apoio ou nível → recalcula sozinho (um de cada vez, em segundo plano).
 * O usuário não digita espaçamento: o menu "Ajustar" só SOBRESCREVE (apoio, tesoura Pratt/Howe/Fink, telhado aparente, ligações ocultas).
 * Motor de tesouras (T2/T3): Web Worker (minutos); laço de terças/caibros/vigas: na hora.
 * Sem a prévia do modelador nada aparece (como o telhado).
 * ===================================================================== */
(function (global) {
  "use strict";
  function arr(v) { return Array.isArray(v) ? v : []; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function virg(v, c) { var x = Number(v); return isFinite(x) ? x.toFixed(c == null ? 2 : c).replace(".", ",") : "—"; }
  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function MC() { return global.MadCobertura || null; }
  function B() { return global.BIM || null; }
  function estado() { try { var b = B(); return b && b.editarEstado ? b.editarEstado().estado : null; } catch (e) { return null; } }
  function aplicarOps(ops, id) { var b = B(); if (!b || !b.editarLote) { status("O editor 3D não está aberto."); return false; } return !!b.editarLote({ op: "lote", id: id, origem: "madeira-cobertura", ops: ops }); }
  function janela(titulo, html) { var CU = global.BimCoberturaUI; return CU && CU.janela ? CU.janela(titulo, html) : null; }
  function telhados(st) { return arr(st && st.telhados).filter(function (t) { return t && t.ok && t.modo !== "extrusao"; }); }

  var UI_ESTADO = { rodando: false, fila: [], pref: { aparente: false, ligacaoOculta: false, forro: false, apoio: null, tesoura: null }, timer: 0, ultimo: {}, worker: null, progresso: null, resultado: {} };

  /* ------------------------------------------------------------ os dados da obra que o motor de madeira já guarda (V0 por coordenada, umidade, categoria…) */
  function obraId() { try { var g = global.Gestao; return String((g && g._bimSel) || "geral"); } catch (e) { return "geral"; } }
  function chaveObra() { return "orcapro:madeira:eng:v1:" + obraId(); }
  function lerObra() {
    try { var t = global.localStorage.getItem(chaveObra()), s = t ? JSON.parse(t) : null; return s && s.estado && s.estado.obra ? JSON.parse(JSON.stringify(s.estado.obra)) : {}; } catch (e) { return {}; }
  }
  function gravarLocal(lat, lon, local) {
    try {
      var t = global.localStorage.getItem(chaveObra()), s = t ? JSON.parse(t) : null, EN = global.MadEngEntrada;
      if (!s || !s.estado) s = { v: 2, estado: EN ? EN.migrar({}) : { obra: {} }, resumos: {}, porTip: {} };
      s.estado.obra = s.estado.obra || {}; s.estado.obra.lat = lat; s.estado.obra.lon = lon; if (local) s.estado.obra.local = local;
      global.localStorage.setItem(chaveObra(), JSON.stringify(s)); return true;
    } catch (e) { return false; }
  }
  function lerCoordenada(txt) {
    var G0 = global.IcarGeo, c = null; txt = String(txt || "").replace(/[−–]/g, "-").trim();
    if (G0 && G0.lerCoordenada) { try { c = G0.lerCoordenada(txt); } catch (e) { c = null; } }
    if (!c) { var m = /^\s*(-?\d+(?:[.,]\d+)?)\s*[;,\s]\s*(-?\d+(?:[.,]\d+)?)\s*$/.exec(txt); if (m) c = { lat: parseFloat(m[1].replace(",", ".")), lon: parseFloat(m[2].replace(",", ".")) }; }
    return c && fin(c.lat) && fin(c.lon) ? c : null;
  }

  /* ------------------------------------------------------------ o motor de tesouras no Worker (ou na página, se o navegador recusar) */
  function versao() { try { var m = /[?&]v=([^&]+)/.exec(String(global.location && global.location.search || "")); return m ? m[1] : ""; } catch (e) { return ""; } }
  function rodarMotor(sol, prog) {
    return new Promise(function (ok, erro) {
      var id = "mc" + new Date().getTime(), wk = null;
      function naPagina(motivo) {
        var W = global.MadEngWorker; if (!W) { erro(new Error("o motor da madeira não carregou (" + motivo + ")")); return; }
        var lista = W.MOTORES.filter(function (a) { return !global[W.GLOBAL_DE[a]] || /^mad(dimensionar2|auditor|ligacoes|tipologias)/.test(a); }), i = 0, doc = global.document;
        (function prox() {
          if (i >= lista.length) { setTimeout(function () { try { ok(JSON.parse(JSON.stringify(W.rodar(sol, null)))); } catch (e) { erro(e); } }, 60); return; }
          var arq = lista[i++], s = doc.createElement("script"); s.src = "js/" + arq + (versao() ? "?v=" + encodeURIComponent(versao()) : ""); s.async = false; s.onload = prox; s.onerror = function () { erro(new Error("não carregou js/" + arq)); };
          (doc.head || doc.documentElement).appendChild(s);
        })();
      }
      try { wk = new global.Worker("js/madengworker.js" + (versao() ? "?v=" + encodeURIComponent(versao()) : "")); } catch (e) { wk = null; }
      if (!wk) { naPagina("o navegador não abriu o processo paralelo"); return; }
      UI_ESTADO.worker = wk;
      wk.onmessage = function (ev) {
        var m = ev.data || {}; if (m.id !== id) return;
        if (m.tipo === "progresso") { if (prog) prog(m); }
        else if (m.tipo === "fim") { try { wk.terminate(); } catch (e) {} UI_ESTADO.worker = null; try { ok(JSON.parse(m.texto)); } catch (eP) { erro(eP); } }
        else if (m.tipo === "erro") { try { wk.terminate(); } catch (e) {} UI_ESTADO.worker = null; if (/Não carregou/.test(m.mensagem || "")) naPagina(m.mensagem); else erro(new Error(m.mensagem)); }
      };
      wk.onerror = function (ev) { if (ev && ev.preventDefault) ev.preventDefault(); try { wk.terminate(); } catch (e) {} UI_ESTADO.worker = null; naPagina("o processo paralelo falhou"); };
      wk.postMessage({ tipo: "calcular", id: id, sol: sol });
    });
  }

  /* motores que a página não carrega de saída (as ligações da madeira): injeta o script uma vez e espera */
  function garantir(lista) {
    var doc = global.document, i = 0;
    return new Promise(function (ok, erro) {
      (function prox() {
        while (i < lista.length && global[lista[i][0]]) i++;
        if (i >= lista.length) { ok(true); return; }
        var arq = lista[i][1], s = doc.createElement("script"); i++;
        s.src = "js/" + arq + (versao() ? "?v=" + encodeURIComponent(versao()) : ""); s.async = false; s.onload = prox; s.onerror = function () { erro(new Error("não carregou js/" + arq)); };
        (doc.head || doc.documentElement).appendChild(s);
      })();
    });
  }

  /* ------------------------------------------------------------ a configuração do telhado (o que a pessoa SOBRESCREVEU) */
  function cfgDe(t) {
    var c = t && t.calcMadeira && t.calcMadeira.cfg ? t.calcMadeira.cfg : null, p = UI_ESTADO.pref;
    return { apoio: c ? c.apoio : p.apoio, tesoura: c ? c.tesoura : p.tesoura, aparente: c ? !!c.aparente : p.aparente, ligacaoOculta: c ? !!c.ligacaoOculta : p.ligacaoOculta, forro: c ? !!c.forro : p.forro };
  }

  /* ------------------------------------------------------------ calcular */
  function pedirLocal(depois) {
    var ov = janela("Onde é a obra?", '<p>O vento da cobertura (NBR 6123) sai do V0 do local. Digite as <b>coordenadas</b> da obra (ex.: <code>−19,92 −43,94</code>) ou cole o link do mapa.</p>' +
      '<p><input id="mcob-loc" class="inp" style="width:100%" placeholder="latitude longitude"></p><p><button type="button" class="btn" id="mcob-loc-ok">Usar e calcular</button></p><p id="mcob-loc-msg" style="color:#b9770e"></p>');
    if (!ov) { status("Informe a cidade ou as coordenadas da obra no módulo Madeira (Estruturas de madeira › passo 1)."); return; }
    ov.querySelector("#mcob-loc-ok").addEventListener("click", function () {
      var c = lerCoordenada(ov.querySelector("#mcob-loc").value);
      if (!c) { ov.querySelector("#mcob-loc-msg").textContent = "Não entendi. Use dois números: latitude e longitude."; return; }
      gravarLocal(Math.round(c.lat * 1e6) / 1e6, Math.round(c.lon * 1e6) / 1e6, "");
      var x = ov.parentNode; try { var f = ov.querySelector("[data-cob-fechar]"); if (f) f.click(); } catch (e) {} void x; depois();
    });
  }
  function progressoTexto(p) { return p ? (p.etapa === "dimensionar" ? "dimensionando (iteração " + (p.it || 0) + ")" : String(p.etapa || "")) : ""; }

  function calcular(tid, opc) {
    opc = opc || {};
    var M = MC(), st = estado(); if (!M || !st) { status("O motor da madeira calculada não carregou."); return false; }
    var t = telhados(st).filter(function (x) { return String(x.id) === String(tid); })[0]; if (!t) { status("Telhado " + tid + " não encontrado."); return false; }
    if (UI_ESTADO.rodando) { if (UI_ESTADO.fila.indexOf(String(tid)) < 0) UI_ESTADO.fila.push(String(tid)); status("Já tem um cálculo de madeira rodando; o do telhado " + tid + " entra na fila."); return true; }
    var cfg = cfgDe(t); if (opc.cfg) Object.keys(opc.cfg).forEach(function (k) { cfg[k] = opc.cfg[k]; });
    var prep = M.preparar(st, tid, cfg, { obra: lerObra() });
    if (!prep.ok) {
      if (prep.pendente === "local") { pedirLocal(function () { calcular(tid, opc); }); return false; }
      status("Madeira calculada: " + prep.motivo); if (!opc.silencioso) janela("Madeira calculada — telhado " + tid, "<p><b>Não deu para calcular.</b></p><p>" + esc(prep.motivo) + "</p>");
      return false;
    }
    UI_ESTADO.rodando = true; UI_ESTADO.progresso = "preparando";
    function fim() { UI_ESTADO.rodando = false; UI_ESTADO.progresso = null; var prox = UI_ESTADO.fila.shift(); if (prox) setTimeout(function () { calcular(prox, { silencioso: true }); }, 50); }
    function gravar(out) {
      var calc = out.calc, ops = [M.opAplicar(tid, calc)];
      var ok = aplicarOps(ops, "mc-" + tid + "-" + new Date().getTime());
      if (ok) { UI_ESTADO.ultimo[tid] = calc.chave; UI_ESTADO.resultado[tid] = out; status("Madeira calculada (telhado " + tid + "): " + out.resumo); if (!opc.silencioso) mostrar(tid, out); }
      else status("Não consegui gravar o cálculo no telhado " + tid + ".");
      fim();
    }
    if (prep.via === "laco") { garantir([["MadLig", "madligacoes.js"]]).then(function () { gravar(M.rodarLaco(prep)); }, function (e) { status("Madeira calculada: " + (e && e.message ? e.message : e)); fim(); }); return true; }
    status("Calculando as tesouras do telhado " + tid + " no módulo Madeira (leva alguns minutos; pode continuar trabalhando)…");
    (function rodar(p) {
      rodarMotor(p.sol, function (m) { UI_ESTADO.progresso = progressoTexto(m); }).then(function (res) {
        var o = M.concluirMotor(p, res);
        if (o.repetir) { status("Madeira (telhado " + tid + "): não fechou com tesouras a " + virg(p.sTes) + " m — tentando espaçamento menor…"); rodar(M.proximaTentativa(p)); return; }
        gravar(o);
      }, function (e) { status("Cálculo da madeira falhou: " + (e && e.message ? e.message : e)); fim(); });
    })(prep);
    return true;
  }

  /* ------------------------------------------------------------ a janela de resultado */
  var NOME_PAPEL = { perna: "Perna (banzo superior)", linha: "Linha (banzo inferior)", pendural: "Pendural (montante)", escora: "Escora (diagonal)", terca: "Terça", caibro: "Caibro", viga: "Viga sobre pilares", espigao: "Espigão" };
  function htmlResultado(tid, c) {
    var h = '<div data-mcob="resultado"><p style="margin:0 0 6px"><b>' + (c.preliminar ? '<span style="color:#c0392b">PRELIMINAR</span> — ' : "") + esc(c.sistema) + (c.aparente ? " — telhado aparente" : "") + "</b></p>";
    h += "<p style=\"margin:0 0 6px\">Apoio " + (c.apoioAuto ? "detectado no modelo" : "escolhido") + ": <b>" + esc(c.apoio) + "</b>. Telha: peso " + virg(c.pesoTelha, 2) + " kN/m² + trama " + virg(c.pesoTrama, 2) + " kN/m² = <b>" + virg(c.pesoTotal, 2) + " kN/m²</b> no cálculo. Modelo de madeira: " + esc(c.modelo) + ".</p>";
    h += '<table style="border-collapse:collapse;font-size:12px;margin:6px 0"><tr><th align="left">Peça</th><th align="left">Seção calculada</th></tr>' + Object.keys(c.secoes || {}).map(function (k) { var s = c.secoes[k]; return "<tr><td style=\"padding:2px 10px 2px 0\">" + esc(NOME_PAPEL[k] || k) + "</td><td>" + virg(s.b * 100, 0) + " × " + virg(s.h * 100, 0) + " cm</td></tr>"; }).join("") + "</table>";
    if (c.espApoio) h += "<p style=\"margin:0 0 6px\">Apoios a no máximo <b>" + virg(c.espApoio) + " m</b> (escolhido pelo laço de cálculo); terças a " + virg(c.espTerca) + " m (vão da telha / caibro).</p>";
    if (c.eta) h += "<p style=\"margin:0 0 6px;font-size:12px\">Aproveitamento (η): " + Object.keys(c.eta).filter(function (k) { return c.eta[k] != null; }).map(function (k) { return esc(k) + " " + virg(c.eta[k], 3); }).join("; ") + ".</p>";
    function lista(t, l) { l = arr(l); return l.length ? "<h4 style=\"margin:8px 0 3px\">" + t + "</h4><ul style=\"margin:0 0 0 18px;padding:0\">" + l.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : ""; }
    h += lista("Por que PRELIMINAR", c.preliminar ? c.motivos : []) + lista("Premissas", c.premissas) + lista("Não verificado neste cálculo", c.naoVerificado) + lista("Avisos", c.avisos) + lista("Sem peça própria no modelo", c.semPeca);
    if (c.cargasNaLaje && c.cargasNaLaje.n) h += "<p style=\"margin:8px 0 0;font-size:12px\"><b>Cargas na laje:</b> " + c.cargasNaLaje.n + " pontaletes × " + virg(c.cargasNaLaje.porPonto_kN, 2) + " kN (total " + virg(c.cargasNaLaje.total_kN, 1) + " kN). " + esc(c.cargasNaLaje.aviso) + ".</p>";
    if (c.aparente) h += "<p style=\"margin:8px 0 0;font-size:12px\">Telhado aparente: peças com acabamento à vista" + (c.ligacaoOculta ? ", ligações ocultas" : "") + "; sem forro. Os cortes de encaixe vêm do módulo de encaixes (js/madencaixe.js) quando ele estiver no sistema.</p>";
    h += '<p style="margin:10px 0 0"><button type="button" class="btn" data-mcob-acao="recalcular">Recalcular</button> <button type="button" class="btn" data-mcob-acao="limpar">Voltar à madeira de partida</button></p></div>';
    void tid; return h;
  }
  function mostrar(tid, out) {
    var c = out && out.calc ? out.calc : null; if (!c) return;
    var ov = janela("Madeira calculada — telhado " + tid, htmlResultado(tid, c)); if (!ov) return;
    ov.addEventListener("click", function (ev) {
      var a = ev.target && ev.target.getAttribute ? ev.target.getAttribute("data-mcob-acao") : null; if (!a) return;
      if (a === "recalcular") calcular(tid, {});
      if (a === "limpar") { aplicarOps([MC().opLimpar(tid)], "mc-limpar-" + tid); status("Cálculo removido: o telhado volta às seções de partida do SINAPI."); }
    });
  }

  /* ------------------------------------------------------------ recalcular sozinho quando o modelo muda */
  function vigiar() {
    if (typeof document === "undefined" || document.hidden || UI_ESTADO.rodando) return;
    var M = MC(), st = estado(); if (!M || !st) return;
    telhados(st).forEach(function (t) {
      if (!t.calcMadeira || UI_ESTADO.rodando) return;
      var s = M.situacao(st, t.id);
      if (!s.calculado || !s.desatualizado) { delete UI_ESTADO["estavel" + t.id]; return; }
      if (UI_ESTADO.ultimo[t.id] === s.chaveNova) return;   /* já tentei esta mesma entrada */
      var k = "estavel" + t.id;
      if (UI_ESTADO[k] !== s.chaveNova) { UI_ESTADO[k] = s.chaveNova; return; }   /* espera o modelo ficar parado entre dois ciclos */
      UI_ESTADO.ultimo[t.id] = s.chaveNova;
      status("O telhado " + t.id + " mudou: recalculando a madeira…");
      calcular(t.id, { silencioso: true });
    });
  }
  function ligarVigia() { if (UI_ESTADO.timer || typeof global.setInterval !== "function") return; UI_ESTADO.timer = global.setInterval(function () { try { vigiar(); } catch (e) {} }, 1500); }

  /* ------------------------------------------------------------ a fita, a ferramenta e as Propriedades */
  function passoTodos(fn) { var st = estado(), l = telhados(st); if (!l.length) { status("Lance um telhado (Arquitetura › Telhado) antes."); return; } l.forEach(function (t) { fn(t); }); }
  function mudarCfg(campo, valor) {   /* valor = o novo valor ou uma função (valor atual do telhado → novo) */
    var P = UI_ESTADO.pref, n = 0;
    passoTodos(function (t) { var c = cfgDe(t); c[campo] = typeof valor === "function" ? valor(c[campo]) : valor; P[campo] = c[campo]; n++; if (t.calcMadeira) calcular(t.id, { cfg: c, silencioso: false }); else status("Ajuste guardado: vale no próximo cálculo (Madeira calculada › Calcular)."); });
    void n;
  }

  var MadCoberturaUI = {
    ativo: previa, chaveObra: chaveObra, gravarLocal: gravarLocal, lerObra: lerObra, calcular: calcular, mostrar: mostrar, vigiar: vigiar, estado: UI_ESTADO, rodarMotor: rodarMotor, htmlResultado: htmlResultado,
    /* chamado pela ferramenta de Telhado logo depois de lançar */
    aposLancar: function (tid) { if (!previa() || !MC()) return false; setTimeout(function () { calcular(tid, {}); }, 80); ligarVigia(); return true; },
    /* as linhas da ferramenta de Telhado (Propriedades) */
    params: function (c) {
      return [{ id: "b2f:te:madCalc", rotulo: "Madeira (módulo de cálculo)", tipo: "lista", valor: c.madCalc === "auto" ? "auto" : "nao",
        opcoes: [{ id: "nao", rotulo: "Só desenhar (madeira de partida)" }, { id: "auto", rotulo: "Calcular ao lançar — apoio e sistema automáticos" }] }];
    },
    /* a seção do telhado nas Propriedades (depois de lançado) */
    secao: function (t, tid) {
      var M = MC(), st = estado(), s = M && st ? M.situacao(st, tid) : { calculado: false }, ps = [], c = s.calc;
      var ro = function (id, rot, v) { return { id: id, rotulo: rot, leitura: true, valor: v == null || v === "" ? "—" : v }; };
      if (!s.calculado) ps.push(ro("mcob:st", "Madeira", "não calculada — madeira de partida do SINAPI"));
      else {
        ps.push(ro("mcob:st", "Madeira", (s.desatualizado ? "DESATUALIZADA (o telhado mudou" + (UI_ESTADO.rodando ? "; recalculando…)" : ")") : "em dia") + (c.preliminar ? " — PRELIMINAR" : "")));
        ps.push(ro("mcob:sis", "Sistema", c.sistema + " · apoio " + c.apoio + (c.aparente ? " · aparente" : "")));
        Object.keys(c.secoes || {}).forEach(function (k) { ps.push(ro("mcob:s" + k, NOME_PAPEL[k] || k, virg(c.secoes[k].b * 100, 0) + "×" + virg(c.secoes[k].h * 100, 0) + " cm")); });
      }
      ps.push({ id: "mcob:calc", rotulo: "Cálculo", tipo: "botao", rotuloBotao: s.calculado ? "Recalcular a madeira" : "Calcular a madeira", fn: function () { calcular(tid, {}); } });
      if (s.calculado) ps.push({ id: "mcob:ver", rotulo: "Resultado", tipo: "botao", rotuloBotao: "Ver o resultado", fn: function () { mostrar(tid, { calc: c }); } });
      void t; return { nome: "Madeira calculada (módulo Madeira)", params: ps };
    },
    registrar: function (reg, arqui, opts) {
      var pv = opts && opts.previa != null ? !!opts.previa : previa(), R = global.BimRibbon;
      if (!pv || !R || !reg || !MC()) return false;
      R.acrescentar("arquitetura", "Arquitetura", "Madeira calculada", [
        { id: "mad-cob", rotulo: "Madeira\ncalculada", icone: "calculadora", grande: true, tipo: "menu",
          dica: "Calcula a madeira do telhado no módulo Madeira: o sistema detecta o apoio (laje, paredes ou pilares), escolhe tesouras, terças sobre pontaletes ou vigas sobre pilares, fecha as seções em laço e devolve o resultado para as peças do modelo (ripas e telhas pela telha escolhida). Você só sobrescreve em Ajustar.",
          itens: [{ id: "mad-cob-calc", rotulo: "Calcular a madeira do telhado (automático)", icone: "calculadora" }, { id: "mad-cob-ver", rotulo: "Ver o resultado", icone: "calculadora" },
                  { id: "mad-cob-ap-auto", rotulo: "Ajustar › Apoio: detectar no modelo", icone: "estrutura" }, { id: "mad-cob-ap-laje", rotulo: "Ajustar › Apoio: sobre laje (pontaletes)", icone: "estrutura" },
                  { id: "mad-cob-ap-paredes", rotulo: "Ajustar › Apoio: sobre paredes (tesouras)", icone: "estrutura" }, { id: "mad-cob-ap-pilares", rotulo: "Ajustar › Apoio: pilares do modelo (aparente)", icone: "estrutura" },
                  { id: "mad-cob-tes-pratt", rotulo: "Ajustar › Tesoura Pratt", icone: "estrutura" }, { id: "mad-cob-tes-howe", rotulo: "Ajustar › Tesoura Howe", icone: "estrutura" }, { id: "mad-cob-tes-fink", rotulo: "Ajustar › Tesoura Fink (2 águas)", icone: "estrutura" },
                  { id: "mad-cob-aparente", rotulo: "Telhado aparente (liga/desliga)", icone: "camadas" }, { id: "mad-cob-oculta", rotulo: "Ligações ocultas (liga/desliga)", icone: "camadas" },
                  { id: "mad-cob-limpar", rotulo: "Voltar à madeira de partida", icone: "mais" }] }
      ]);
      reg["mad-cob"] = function () { return true; };
      reg["mad-cob-calc"] = function () { ligarVigia(); passoTodos(function (t) { calcular(t.id, {}); }); return true; };
      reg["mad-cob-ver"] = function () { passoTodos(function (t) { var s = MC().situacao(estado(), t.id); if (s.calculado) mostrar(t.id, { calc: s.calc }); else status("O telhado " + t.id + " ainda não foi calculado."); }); return true; };
      [["auto", null], ["laje", "laje"], ["paredes", "paredes"], ["pilares", "pilares"]].forEach(function (p) { reg["mad-cob-ap-" + p[0]] = function () { mudarCfg("apoio", p[1]); return true; }; });
      ["pratt", "howe", "fink"].forEach(function (k) { reg["mad-cob-tes-" + k] = function () { mudarCfg("tesoura", k); return true; }; });
      reg["mad-cob-aparente"] = function () { mudarCfg("aparente", function (v) { return !v; }); return true; };
      reg["mad-cob-oculta"] = function () { mudarCfg("ligacaoOculta", function (v) { return !v; }); return true; };
      reg["mad-cob-limpar"] = function () { passoTodos(function (t) { if (t.calcMadeira) aplicarOps([MC().opLimpar(t.id)], "mc-limpar-" + t.id); }); status("Madeira de partida restaurada."); return true; };
      ligarVigia();
      return true;
    }
  };
  global.MadCoberturaUI = MadCoberturaUI;
  if (typeof module !== "undefined" && module.exports) module.exports = MadCoberturaUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
