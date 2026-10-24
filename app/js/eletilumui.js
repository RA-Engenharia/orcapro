/* =====================================================================
 * eletilumui.js — TELA DA LIGAÇÃO ELÉTRICA DA ILUMINAÇÃO (o motor é o js/eletilum.js)
 *
 *  · COLOCOU A LUMINÁRIA, A LIGAÇÃO NASCE JUNTO: o js/bim.js chama EletIlumUI.aoColocar(op, ops, famAval) ao colocar
 *    uma família de luminária; volta UM lote (a luminária + ponto de luz + interruptor + eletroduto + registro) — um
 *    Ctrl+Z tira tudo. Desligável ("Ligar sozinho ao colocar a luminária").
 *  · PAINEL (Instalações › Ligação da iluminação): o ambiente, o CAMINHO do eletroduto (automático, forro, laje, parede,
 *    piso), a REGRA dos interruptores (botões de um clique, texto livre interpretado por regras fixas, ou clicar os
 *    pontos), os comandos com o esquema de ligação de cada um, a fiação, o que é valor "a conferir" e os PROBLEMAS do
 *    auditor com Corrigir e Mostrar no 3D (componente único js/problemacard.js).
 * O que a tela guarda no navegador (localStorage): só as preferências desta pessoa (ligar sozinho, caminho, regra).
 * ===================================================================== */
(function (global) {
  "use strict";
  var doc = typeof document !== "undefined" ? document : null;
  function E() { return global.EletIlum || null; }
  function B() { return global.BIM || null; }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  var CHAVE = "orcapro:eletilum:cfg";
  var REGRAS = [
    { id: "entrada", rot: "Só na entrada", regra: { pontos: [{ tipo: "entrada" }] } },
    { id: "portas", rot: "Um em cada porta", regra: { pontos: [{ tipo: "todas_portas" }] } },
    { id: "janela", rot: "Entrada + janela", regra: { pontos: [{ tipo: "entrada" }, { tipo: "janela" }] } },
    { id: "cabeceira", rot: "Entrada + cabeceira", regra: { pontos: [{ tipo: "entrada" }, { tipo: "cabeceira", lados: 1 }] } },
    { id: "cabeceira2", rot: "Entrada + os dois lados da cama", regra: { pontos: [{ tipo: "entrada" }, { tipo: "cabeceira", lados: 2 }] } }
  ];
  var CAMINHOS = [["auto", "Automático (forro se houver, senão laje)"], ["forro", "Pelo forro"], ["laje", "Pela laje"], ["parede", "Pela parede"], ["piso", "Pelo piso (alimentação)"]];

  var U = {
    cfg: { auto: true, caminho: "auto" },
    amb: null, ultimo: null, cliques: null, msg: null,
    carregar: function () { try { var c = JSON.parse(global.localStorage.getItem(CHAVE) || "null"); if (c && typeof c === "object") { if (typeof c.auto === "boolean") U.cfg.auto = c.auto; if (c.caminho) U.cfg.caminho = c.caminho; } } catch (e) {} },
    salvar: function () { try { global.localStorage.setItem(CHAVE, JSON.stringify(U.cfg)); } catch (e) {} },

    /* o gancho da colocação (js/bim.js): devolve o lote ou null (a luminária entra sozinha) */
    aoColocar: function (opFam, ops, famAval) {
      var M = E(); if (!M || !U.cfg.auto || !opFam) return null;
      var r = null;
      try { r = M.ligar({ ops: arr(ops).concat([opFam]), avaliarFam: famAval, luminaria: opFam.id, config: U.cfg.caminho !== "auto" ? { caminho: U.cfg.caminho } : null }); } catch (e) { r = null; }
      U.ultimo = r;
      if (!r || !r.ok) { U.msg = r && r.pendencias.length ? "Luminária sem ligação: " + r.pendencias[0].motivo : null; return null; }
      U.amb = r.ambiente.id;
      U.msg = "Ligação do " + r.ambiente.nome + ": " + r.pontos.length + " interruptor(es), " + r.comandos.length + " comando(s).";
      if (U.aberto()) setTimeout(function () { U.render(); }, 50);
      return { op: "lote", id: "lum-lig-" + Date.now().toString(36), origem: "eletilum", pedido: "Luminária com a ligação elétrica (" + r.ambiente.nome + ")", ops: [opFam].concat(r.ops) };
    },
    rotuloColocar: function () { var r = U.ultimo; return r && r.ok ? " com a ligação elétrica: ponto de luz, " + r.pontos.length + " interruptor(es) e eletroduto — Ctrl+Z desfaz tudo; ajustes em Instalações › Ligação da iluminação" : (U.msg ? " — " + U.msg : ""); },

    /* ---------------------------------------------------- o painel */
    aberto: function () { return !!(doc && doc.getElementById("eletilum-painel") && doc.getElementById("eletilum-painel").style.display !== "none"); },
    abrir: function (ambId) {
      if (!doc) return false;
      var p = doc.getElementById("eletilum-painel");
      if (!p) {
        p = doc.createElement("div"); p.id = "eletilum-painel"; p.setAttribute("role", "dialog"); p.setAttribute("aria-label", "Ligação elétrica da iluminação");
        p.style.cssText = "position:fixed;right:16px;top:84px;width:min(440px,calc(100vw - 32px));max-height:calc(100vh - 110px);overflow:auto;z-index:60;background:var(--surface,#fff);color:var(--texto,#111);border:1px solid rgba(127,127,127,.35);border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.25);padding:12px 14px;font-size:13px";
        doc.body.appendChild(p);
        p.addEventListener("click", U.clique); p.addEventListener("change", U.mudou);
        if (global.ProblemaCard) global.ProblemaCard.ligar(p, { corrigir: U.corrigir, mostrar: function (ids) { global.ProblemaCard.mostrarNo3D(ids); } });
      }
      if (ambId) U.amb = ambId;
      p.style.display = "block"; U.render(); return true;
    },
    fechar: function () { var p = doc && doc.getElementById("eletilum-painel"); if (p) p.style.display = "none"; U.pararCliques(); },
    contexto: function () {
      var b = B(), est = b && b.editarEstado ? b.editarEstado() : null;
      return { estado: est && est.estado, ops: b && b.editarOps ? b.editarOps() : [], famAval: b && b.familiaAvaliar ? b.familiaAvaliar : null };
    },
    ambientes: function (est) { return arr(est && est.ambientes).filter(function (a) { return a && a.calc && arr(a.calc.contorno).length >= 3; }); },
    registro: function (est, amb) { return arr(est && est.instalacoes && est.instalacoes.ligacoes).filter(function (r) { return r.amb === amb; })[0] || null; },

    render: function () {
      var p = doc && doc.getElementById("eletilum-painel"); if (!p) return;
      var C = U.contexto(), est = C.estado, M = E();
      if (!M || !est) { p.innerHTML = '<p>Abra o modelo no editor do BIM para ligar a iluminação.</p><button class="btn sm" data-el="fechar">Fechar</button>'; return; }
      var ambs = U.ambientes(est);
      if (!U.amb || !ambs.some(function (a) { return a.id === U.amb; })) { var r0 = arr(est.instalacoes && est.instalacoes.ligacoes)[0]; U.amb = r0 ? r0.amb : (ambs[0] ? ambs[0].id : null); }
      var reg = U.registro(est, U.amb), h = "";
      h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><b style="flex:1;font-size:14px">Ligação elétrica da iluminação</b><button class="btn sm" data-el="fechar" aria-label="Fechar">✕</button></div>';
      h += '<label style="display:flex;gap:6px;align-items:center;margin:0 0 8px"><input type="checkbox" data-el="auto"' + (U.cfg.auto ? " checked" : "") + '> Ligar sozinho ao colocar a luminária</label>';
      h += '<label style="display:block;margin:0 0 6px">Ambiente <select data-el="amb" style="width:100%">' + ambs.map(function (a) { return '<option value="' + esc(a.id) + '"' + (a.id === U.amb ? " selected" : "") + ">" + esc(a.nome || a.id) + (U.registro(est, a.id) ? " — ligado" : "") + "</option>"; }).join("") + "</select></label>";
      var cam = reg ? reg.caminho : U.cfg.caminho;
      h += '<label style="display:block;margin:0 0 8px">Caminho do eletroduto <select data-el="caminho" style="width:100%">' + CAMINHOS.map(function (c) { return '<option value="' + c[0] + '"' + (c[0] === cam ? " selected" : "") + ">" + c[1] + "</option>"; }).join("") + "</select></label>";
      h += '<div style="margin:0 0 4px"><b>Interruptores</b></div><div style="display:flex;flex-wrap:wrap;gap:6px;margin:0 0 6px">' + REGRAS.map(function (r) { return '<button class="btn sm" data-el="regra" data-r="' + r.id + '">' + esc(r.rot) + "</button>"; }).join("") + "</div>";
      h += '<div style="display:flex;gap:6px;margin:0 0 6px"><input data-el="texto" placeholder="Ex.: dois pontos, um próximo de cada porta" style="flex:1;min-width:0" value="' + esc(reg && reg.regra && reg.regra.texto || "") + '"><button class="btn sm primary" data-el="texto-ok">Aplicar</button></div>';
      h += U.cliques ? '<div style="margin:0 0 8px">Clique nas paredes onde quer os interruptores: <b>' + U.cliques.length + "</b> ponto(s). <button class=\"btn sm primary\" data-el=\"cliques-ok\">Concluir</button> <button class=\"btn sm\" data-el=\"cliques-sair\">Cancelar</button></div>"
        : '<div style="margin:0 0 8px"><button class="btn sm" data-el="cliques">Clicar os pontos no 3D</button> <button class="btn sm" data-el="religar">Refazer a ligação</button></div>';
      if (U.msg) h += '<p style="margin:0 0 8px;color:var(--texto-fraco,#555)">' + esc(U.msg) + "</p>";
      /* o resultado: refaz a leitura do motor sem gravar nada (é o mesmo cálculo que o lote aplicou) */
      var R = null; if (reg) { try { R = M.ligar({ ops: C.ops, estado: est, avaliarFam: C.famAval, ambiente: U.amb }); } catch (e) { R = null; } }
      if (!reg) h += "<p>Este ambiente ainda não tem a ligação. Coloque uma luminária nele, ou escolha a regra acima.</p>";
      else if (R && R.ok) {
        h += '<div style="margin:6px 0"><b>Comandos e esquema de ligação</b><ul style="margin:4px 0 0 18px;padding:0">' + R.esquema.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div>";
        h += '<div style="margin:6px 0"><b>Interruptores</b><ul style="margin:4px 0 0 18px;padding:0">' + R.pontos.map(function (q) { return "<li>" + esc(q.rotulo) + ": " + q.modulos.map(function (m) { return esc(m.nome) + " (" + esc(m.esquema) + ")"; }).join(" · ") + (q.ladoMacaneta ? "" : " — <b>lado da dobradiça</b>") + ' <button class="btn sm" data-el="ver" data-id="' + esc(q.id) + '">Mostrar no 3D</button></li>'; }).join("") + "</ul></div>";
        h += '<p style="margin:6px 0">Circuito <b>' + esc(reg.circuito) + "</b> · carga " + esc(reg.cargaVA) + " VA · cabo " + String(R.fiacao.secao).replace(".", ",") + " mm²: " + f2(R.fiacao.metrosCabo) + " m (fase " + f2(R.fiacao.totais.fase) + ", neutro " + f2(R.fiacao.totais.neutro) + ", retorno " + f2(R.fiacao.totais.retorno) + ", terra " + f2(R.fiacao.totais.terra) + ")</p>";
        if (R.decisoes.length) h += '<details style="margin:6px 0"><summary>Decisões (' + R.decisoes.length + ")</summary><ul style=\"margin:4px 0 0 18px;padding:0\">" + R.decisoes.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></details>";
        var conf = R.pendencias.filter(function (q) { return q.conferir; }), pend = R.pendencias.filter(function (q) { return !q.conferir; });
        if (R.avisos.length || pend.length) h += '<div style="margin:6px 0"><b>Atenção</b><ul style="margin:4px 0 0 18px;padding:0">' + R.avisos.concat(pend.map(function (q) { return q.motivo; })).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div>";
        if (conf.length) h += '<details style="margin:6px 0"><summary>Valores a conferir na NBR 5410 (' + conf.length + ")</summary><ul style=\"margin:4px 0 0 18px;padding:0\">" + conf.map(function (q) { return "<li>" + esc(q.motivo) + "</li>"; }).join("") + "</ul></details>";
      }
      /* os problemas (auditor), com Corrigir e Mostrar no 3D */
      var A = null; try { A = M.auditar(est, C.famAval, C.ops); } catch (e) { A = null; }
      U._probs = A ? A.itens : [];
      if (U._probs.length && global.ProblemaCard) {
        h += global.ProblemaCard.lista(U._probs.map(function (it, k) { return { tipo: it.tipo, titulo: it.texto, gravidade: it.gravidade, pecas: it.ids, solucoes: it.solucoes.map(function (s, j) { return { id: k + ":" + j, texto: s.texto, temOps: !!(s.ops && s.ops.length) }; }) }; }),
          { titulo: "Problemas da ligação (" + U._probs.length + ")", prefixoIndice: "", acoes: function (s) { return s.temOps ? s.texto : false; } });
      } else if (A) h += '<p style="margin:6px 0;color:var(--texto-fraco,#555)">Sem problemas na ligação elétrica.</p>';
      p.innerHTML = h;
    },
    aplicar: function (ops, texto) {
      var b = B(); if (!b || !b.editarLote || !arr(ops).length) return false;
      var ok = b.editarLote({ op: "lote", id: "eletilum-" + Date.now().toString(36), origem: "eletilum", pedido: texto, ops: JSON.parse(JSON.stringify(ops)) });
      U.msg = ok ? texto + " (Ctrl+Z desfaz)." : "O editor recusou a alteração.";
      setTimeout(U.render, 60); return ok;
    },
    religar: function (config, texto) {
      var M = E(), C = U.contexto(); if (!M || !C.estado || !U.amb) return false;
      var r = M.ligar({ ops: C.ops, estado: C.estado, avaliarFam: C.famAval, ambiente: U.amb, config: config || null });
      if (!r.ok) { U.msg = r.pendencias.length ? r.pendencias[0].motivo : "Não foi possível ligar este ambiente."; U.render(); return false; }
      return U.aplicar(r.ops, texto || "Ligação refeita");
    },
    corrigir: function (solId) {
      var k = String(solId).split(":"), it = U._probs && U._probs[+k[0]], s = it && it.solucoes[+k[1]];
      if (s && s.ops && s.ops.length) U.aplicar(s.ops, "Correção aplicada: " + s.texto);
    },
    clique: function (ev) {
      var bt = ev.target && ev.target.closest ? ev.target.closest("[data-el]") : null; if (!bt) return;
      var a = bt.getAttribute("data-el");
      if (a === "fechar") U.fechar();
      else if (a === "regra") { var r = REGRAS.filter(function (x) { return x.id === bt.getAttribute("data-r"); })[0]; if (r) U.religar({ regra: r.regra }, "Interruptores: " + r.rot.toLowerCase()); }
      else if (a === "texto-ok") { var inp = doc.querySelector('#eletilum-painel [data-el="texto"]'), t = inp ? inp.value : ""; if (t.trim()) { var I = E().interpretar(t); U.religar({ regra: { pontos: I.pontos, texto: t, quantos: I.quantos } }, "Interruptores: " + I.entendido.join(", ")); } }
      else if (a === "religar") U.religar(null, "Ligação refeita");
      else if (a === "cliques") U.coletar();
      else if (a === "cliques-sair") { U.pararCliques(); U.render(); }
      else if (a === "cliques-ok") { var pts = (U.cliques || []).map(function (q) { return { tipo: "ponto", x: q.x, z: q.z }; }); U.pararCliques(); if (pts.length) U.religar({ regra: { pontos: pts } }, pts.length + " interruptor(es) nos pontos clicados"); else U.render(); }
      else if (a === "ver") { if (global.ProblemaCard) global.ProblemaCard.mostrarNo3D([bt.getAttribute("data-id")]); }
    },
    mudou: function (ev) {
      var el = ev.target, a = el && el.getAttribute && el.getAttribute("data-el"); if (!a) return;
      if (a === "auto") { U.cfg.auto = !!el.checked; U.salvar(); }
      else if (a === "amb") { U.amb = el.value; U.msg = null; U.render(); }
      else if (a === "caminho") { U.cfg.caminho = el.value; U.salvar(); var C = U.contexto(); if (U.registro(C.estado, U.amb)) U.religar({ caminho: el.value }, "Caminho do eletroduto: " + el.options[el.selectedIndex].text.toLowerCase()); }
    },
    coletar: function () {
      var b = B(); if (!b || !b.coletarCliques) { U.msg = "O 3D não está aberto para clicar."; U.render(); return; }
      U.cliques = [];
      b.coletarCliques(function (p) { if (!p || !p.p) return; U.cliques.push({ x: p.p[0], z: p.p[2] }); U.render(); });
      U.render();
    },
    pararCliques: function () { var b = B(); if (U.cliques && b && b.coletarCliques) b.coletarCliques(null); U.cliques = null; }
  };
  U.carregar();
  global.EletIlumUI = U;
  if (typeof module !== "undefined" && module.exports) module.exports = U;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
