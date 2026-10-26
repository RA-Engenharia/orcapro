/* =====================================================================
 * bimdocaui.js — a TELA dos painéis encaixáveis do BIM.
 *
 * O modelo (onde cada painel está, recolhido, solto, tamanhos, layouts
 * prontos) é de js/bimdoca.js — puro e testado. Aqui só se desenha e se
 * liga o ponteiro:
 *   · cada GRUPO vira um quadro (`.rv-gp`) com a barra de título: abas,
 *     recolher, soltar como janela e o menu "Mover para…" (a via por menu é
 *     de quem não usa mouse — arrastar não pode ser o único caminho);
 *   · arrastar pela barra: o alvo é medido em retângulos (BimDoca.alvo) e
 *     só aparece uma pré-visualização — NADA muda de tamanho enquanto o
 *     ponteiro anda, e o 3D só é redimensionado UMA vez, ao soltar;
 *   · recolhido = aba fina na borda; clicar abre o painel POR CIMA do 3D
 *     (sem empurrá-lo); "fixar" encaixa de volta;
 *   · a fita pode recolher (só as abas) e abre por cima ao clicar numa aba.
 *
 * ⚠ O 3D NÃO PODE REDIMENSIONAR A CADA PIXEL. Cada `setSize` do WebGL realoca
 *   o buffer; arrastar uma alça com o ResizeObserver do viewer acordado era
 *   um quadro perdido por pixel. Durante o arrasto `congelado()` é verdadeiro
 *   e js/bim.js não refaz o buffer; ao soltar, `onLayout` pede UM redimensionamento.
 * ⚠ NADA de backdrop-filter aqui: o ancestral com ele vira o bloco contentor
 *   dos `position:fixed` e o BIM encolheu a 0 px uma vez por isso.
 * ⚠ Os painéis são MOVIDOS no DOM (nunca recriados): quem os pinta
 *   (pintarProps, pintarArvore, a gaveta) acha os nós pelas mesmas classes
 *   de sempre, em qualquer lugar do layout.
 *
 * ES5, sem framework.
 * ===================================================================== */
(function (global) {
  "use strict";

  function D() { return global.BimDoca; }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function icone(nome) {
    /* ícones próprios, de traço: independem do registro de ícones do app */
    var p = {
      esq: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
      dir: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
      base: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 14h18"/>',
      topo: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
      solto: '<rect x="3" y="7" width="12" height="12" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2"/>',
      mais: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
      fixar: '<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 14v7"/>',
      fechar: '<path d="M6 6l12 12M18 6L6 18"/>',
      sombra: '<path d="M5 12h14"/>',
      baixo: '<path d="M6 9l6 6 6-6"/>',
      cima: '<path d="M6 15l6-6 6 6"/>'
    }[nome] || "";
    return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>";
  }
  var SETA_REC = { esq: "esq", dir: "dir", base: "base", topo: "topo" };
  var NOME_ZONA = { esq: "à esquerda", dir: "à direita", base: "embaixo", topo: "em cima" };

  var E = null;   /* o estado vivo (um só: a casca é um singleton) */

  /* ------------------------------------------------------------ utilidades */
  function arm() { try { return E && E.cfg.storage ? E.cfg.storage : (typeof localStorage !== "undefined" ? localStorage : null); } catch (e) { return null; } }
  function usuario() { try { return E && E.cfg.usuario ? E.cfg.usuario() : ""; } catch (e) { return ""; } }
  function rotulo(id) {
    try { if (E.cfg.rotulo) { var r = E.cfg.rotulo(id); if (r) return r; } } catch (e) {}
    return D().ROTULO[id] || id;
  }
  function visivel(id) { try { return E.cfg.visivel ? !!E.cfg.visivel(id) : true; } catch (e) { return true; } }
  function efetivo() {
    /* tela estreita (celular/tablet em pé): sem encaixe, o arranjo de sempre */
    if (E.ativo) return E.L;
    var P = D().padrao(); return P;
  }
  function rect(e) { var r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }
  function status(t) { try { if (E.cfg.status) E.cfg.status(t); } catch (e) {} }
  function aoMudarLayout() { try { if (E.cfg.onLayout) E.cfg.onLayout(); } catch (e) {} }
  function raizRect() { return E.raiz.getBoundingClientRect(); }

  /* ================================================================ MONTAR */
  function montar(raiz, cfg) {
    desmontar();
    E = { raiz: raiz, cfg: cfg, L: D().padrao(), ativo: true, congelado: 0, sobre: null, drag: null, press: null, menu: null, z: 100,
      zonas: cfg.zonas, bordas: cfg.bordas, alcas: cfg.alcas, corpo: cfg.corpo, centro: cfg.centro, flutEl: cfg.flutEl, guarda: cfg.guarda, painel: cfg.paineis,
      quadros: {}, fitaSobre: false, origem: "padrao", ouvintes: [] };
    var mq = null;
    try { mq = global.matchMedia ? global.matchMedia("(min-width: 901px)") : null; } catch (e) {}
    E.mq = mq; E.ativo = mq ? mq.matches : true;
    var carga = D().carregar(arm(), usuario());
    E.origem = carga.origem;
    E.L = carga.layout;
    if (carga.origem === "padrao" || carga.origem === "sem-armazenamento") migrarLegado();
    ligar();
    render();
    atributosFita();
    return api;
  }
  function desmontar() {
    if (!E) return;
    fecharSobre(true); fecharMenu();
    E.ouvintes.forEach(function (o) { try { o.alvo.removeEventListener(o.tipo, o.fn, o.cap); } catch (e) {} });
    if (E.mq && E.mqFn) { try { E.mq.removeListener(E.mqFn); } catch (e) {} }
    if (E.obsTit) { try { E.obsTit.disconnect(); } catch (e) {} }
    if (E.roCorpo) { try { E.roCorpo.disconnect(); } catch (e) {} }
    E = null;
  }
  function on(alvo, tipo, fn, cap) { alvo.addEventListener(tipo, fn, !!cap); E.ouvintes.push({ alvo: alvo, tipo: tipo, fn: fn, cap: !!cap }); }

  /* preferências de antes dos painéis encaixáveis (lateral recolhida, larguras, divisória) viram o 1º layout */
  function migrarLegado() {
    var a = arm(); if (!a) return;
    try {
      var L = E.L, mexeu = false;
      if (a.getItem("orcapro:bim:lateral-off") === "1") { L = D().recolher(L, "props", true); L = D().recolher(L, "nav", true); mexeu = true; }
      var lw = +a.getItem("orcapro:bim:lateral-w"); if (lw >= 200 && lw <= 700) { L = D().tamZona(L, "esq", lw); mexeu = true; }
      var ph = +a.getItem("orcapro:bim:props-h"); if (ph >= 15 && ph <= 85) { L = D().divisoria(L, "esq", 0, ph); mexeu = true; }
      if (a.getItem("orcapro:bim:lateral-lado") === "dir") { L = D().encaixar(L, "props", "dir", {}); L = D().encaixar(L, "nav", "dir", {}); mexeu = true; }
      if (mexeu) E.L = L;
    } catch (e) {}
  }

  /* ================================================================ RENDER */
  function guardar(no) {
    if (!no || !E.guarda) return;
    if (no.parentNode !== E.guarda) E.guarda.appendChild(no);
    /* o próprio nó fica escondido (quem pergunta pelo display do Navegador recolhido recebe "none") */
    no.classList.add("rv-pn-off");
  }
  /* o título da ferramenta aberta é o rótulo da aba "Ferramentas": observa o título da gaveta (que só entra no DOM depois da casca) */
  function observarTitulo() {
    var tit = document.getElementById("bim-drawer-tit");
    if (!tit || E.titObs === tit || !global.MutationObserver) return;
    if (E.obsTit) { try { E.obsTit.disconnect(); } catch (e) {} }
    E.titObs = tit;
    E.obsTit = new MutationObserver(function () {
      if (!E) return;
      [].forEach.call(E.raiz.querySelectorAll('.rv-gp-aba[data-pn="ferr"]'), function (a) { a.textContent = rotulo("ferr"); });
      [].forEach.call(E.raiz.querySelectorAll('.rv-borda-bt[data-pn-rec="ferr"] .rv-borda-rot'), function (a) { a.textContent = rotulo("ferr"); });
    });
    E.obsTit.observe(tit, { childList: true, characterData: true, subtree: true });
  }
  /* a janela solta mora na camada .rv-flut: as coordenadas dela são relativas a ela */
  function flutRect() { return E.flutEl.getBoundingClientRect(); }

  function render() {
    if (!E) return;
    fecharSobre(true);
    var Lm = efetivo();
    /* todo painel volta à guarda antes de limpar: nenhum nó é destruído */
    Object.keys(E.painel).forEach(function (id) { guardar(E.painel[id].el); });
    E.quadros = {};
    D().ZONAS.forEach(function (z) { renderZona(z, Lm); });
    renderFlut(Lm);
    renderBordas(Lm);
    aplicarTamanhos(Lm);
    atributos(Lm);
    observarTitulo();
  }

  function gruposVisiveis(z, Lm) {
    var out = [];
    Lm.zonas[z].forEach(function (g, i) {
      var vis = g.abas.filter(function (id) { return !Lm.rec[id] && visivel(id); });
      if (vis.length) out.push({ g: g, i: i, vis: vis, ativa: vis.indexOf(g.ativa) >= 0 ? g.ativa : vis[0] });
    });
    return out;
  }

  function botao(cls, acao, dica, svg, extra) {
    var b = el("button", "rv-gp-bt " + (cls || ""));
    b.type = "button"; b.setAttribute("data-doca-acao", acao); b.title = dica; b.setAttribute("aria-label", dica);
    b.innerHTML = svg;
    if (extra) Object.keys(extra).forEach(function (k) { b.setAttribute(k, extra[k]); });
    return b;
  }

  /* o quadro de um grupo: barra de título (abas + ações) e o corpo com os painéis */
  function quadro(opt) {
    var gp = el("div", "rv-gp" + (opt.cls ? " " + opt.cls : ""));
    gp.setAttribute("data-z", opt.zona || "");
    if (opt.grupo != null) gp.setAttribute("data-g", String(opt.grupo));
    gp.setAttribute("data-ativa", opt.ativa);
    var cab = el("div", "rv-gp-cab");
    var abas = el("div", "rv-gp-abas"); abas.setAttribute("role", "tablist");
    opt.abas.forEach(function (id) {
      var b = el("button", "rv-gp-aba", rotulo(id));
      b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("data-pn", id);
      b.setAttribute("aria-selected", id === opt.ativa ? "true" : "false");
      b.title = rotulo(id) + " — arraste pela barra para encaixar onde quiser";
      abas.appendChild(b);
    });
    cab.appendChild(abas);
    var ac = el("div", "rv-gp-acoes");
    ac.appendChild(botao("", "menu", "Mover este painel para… (esquerda, direita, embaixo, em cima, janela solta)", icone("mais")));
    if (opt.modo === "flut") {
      ac.appendChild(botao("", "sombrear", "Enrolar a janela (fica só a barra de título)", icone("sombra")));
      ac.appendChild(botao("", "encaixar", "Encaixar de volta na borda", icone("esq")));
    } else if (opt.modo === "sobre") {
      ac.appendChild(botao("", "fixar", "Fixar: encaixa o painel de volta e empurra o 3D", icone("fixar")));
      ac.appendChild(botao("", "solto", "Soltar como janela flutuante", icone("solto")));
      ac.appendChild(botao("", "fechar-sobre", "Fechar (volta a ser uma aba na borda)", icone("fechar")));
    } else {
      ac.appendChild(botao("", "recolher", "Recolher: vira uma aba fina na borda (clique nela para abrir por cima do 3D)", icone(SETA_REC[opt.zona] || "esq")));
      ac.appendChild(botao("", "solto", "Soltar como janela flutuante", icone("solto")));
    }
    cab.appendChild(ac);
    gp.appendChild(cab);
    var corpo = el("div", "rv-gp-corpo");
    opt.abas.forEach(function (id) {
      var pn = E.painel[id]; if (!pn) return;
      pn.el.classList.toggle("rv-pn-off", id !== opt.ativa);
      corpo.appendChild(pn.el);
      E.quadros[id] = gp;
    });
    gp.appendChild(corpo);
    return gp;
  }

  function renderZona(z, Lm) {
    var cont = E.zonas[z], alca = E.alcas[z];
    while (cont.firstChild) cont.removeChild(cont.firstChild);
    var gs = gruposVisiveis(z, Lm);
    cont.setAttribute("data-vazia", gs.length ? "0" : "1");
    /* o modo modelagem (foco) esconde as zonas, menos a que mostra a ferramenta aberta */
    cont.setAttribute("data-ferr", gs.some(function (x) { return x.vis.indexOf("ferr") >= 0; }) ? "1" : "0");
    if (alca) alca.setAttribute("data-vazia", gs.length ? "0" : "1");
    gs.forEach(function (x, k) {
      if (k > 0) {
        var sp = el("div", "rv-split " + (D().vertical(z) ? "rv-split-h" : "rv-split-v"));
        sp.setAttribute("data-z", z); sp.setAttribute("data-ga", String(gs[k - 1].i)); sp.setAttribute("data-gb", String(x.i));
        sp.setAttribute("role", "separator"); sp.tabIndex = 0;
        sp.setAttribute("aria-orientation", D().vertical(z) ? "horizontal" : "vertical");
        sp.title = D().vertical(z) ? "Arraste para dividir o espaço entre os painéis" : "Arraste para dividir a largura entre os painéis";
        cont.appendChild(sp);
      }
      var gp = quadro({ zona: z, grupo: x.i, abas: x.vis, ativa: x.ativa, modo: "zona" });
      gp.style.flex = String(x.g.tam) + " 1 0px";
      cont.appendChild(gp);
    });
  }

  function renderFlut(Lm) {
    var fl = E.flutEl;
    while (fl.firstChild) fl.removeChild(fl.firstChild);
    if (!E.ativo) return;
    var R = flutRect();
    Object.keys(Lm.flut).forEach(function (id) {
      if (!E.painel[id] || !visivel(id)) return;
      var r = Lm.flut[id], rec = !!Lm.rec[id];
      var gp = quadro({ zona: "", abas: [id], ativa: id, modo: "flut", cls: "rv-gp-flut" + (rec ? " rv-gp-enrolado" : "") });
      gp.setAttribute("data-flut", id);
      var c = limitarFlut(r, R);
      gp.style.left = c.x + "px"; gp.style.top = c.y + "px"; gp.style.width = c.w + "px"; gp.style.height = rec ? "" : c.h + "px";
      gp.style.zIndex = String(E.z + (r.z || 0));
      ["n", "s", "e", "w", "ne", "nw", "se", "sw"].forEach(function (d) {
        var h = el("div", "rv-gp-alca rv-gp-alca-" + d); h.setAttribute("data-dir", d); gp.appendChild(h);
      });
      fl.appendChild(gp);
    });
  }
  /* a janela solta nunca fica fora da tela: sempre sobra um pedaço da barra de título para pegar */
  function limitarFlut(r, R) {
    var W = Math.max(300, R.width || 1000), H = Math.max(240, R.height || 700), lim = D().FLUT_MIN;
    var w = Math.max(lim.w, Math.min(r.w, W - 20)), h = Math.max(lim.h, Math.min(r.h, H - 60));
    var x = Math.max(-w + 90, Math.min(r.x, W - 90)), y = Math.max(0, Math.min(r.y, H - 40));
    return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
  }

  /* as abas finas das bordas: um botão por painel recolhido */
  function renderBordas(Lm) {
    D().ZONAS.forEach(function (z) {
      var b = E.bordas[z]; while (b.firstChild) b.removeChild(b.firstChild);
      var n = 0;
      Lm.zonas[z].forEach(function (g) {
        g.abas.forEach(function (id) {
          if (!Lm.rec[id] || !visivel(id)) return;
          var t = el("button", "rv-borda-bt");
          t.type = "button"; t.setAttribute("data-pn-rec", id); t.setAttribute("aria-expanded", E.sobre && E.sobre.id === id ? "true" : "false");
          t.title = rotulo(id) + " — clique para abrir por cima do 3D; arraste para encaixar em outro lugar";
          t.innerHTML = '<span class="rv-borda-seta">' + (z === "dir" ? "◀" : z === "esq" ? "▶" : z === "base" ? "▲" : "▼") + '</span><span class="rv-borda-rot">' + rotulo(id).replace(/</g, "&lt;") + "</span>";
          b.appendChild(t); n++;
        });
      });
      b.setAttribute("data-n", String(n));
    });
  }

  function aplicarTamanhos(Lm) {
    var r = E.raiz, ferr = visivel("ferr") && !Lm.rec.ferr && E.cfg.largFerr ? E.cfg.largFerr() : 0, pos = D().onde(Lm, "ferr");
    function px(z) {
      var v = Lm.tam[z];
      if (ferr && pos && pos.zona === z && (z === "esq" || z === "dir")) v = Math.max(D().LIM[z].min, ferr);
      return v;
    }
    var maxW = Math.max(300, (E.corpo.clientWidth || 1200) * 0.75), maxH = Math.max(200, (E.corpo.clientHeight || 700) * 0.6);
    r.style.setProperty("--rv-lat-w", Math.round(Math.min(px("esq"), maxW)) + "px");
    r.style.setProperty("--rv-dir-w", Math.round(Math.min(px("dir"), maxW)) + "px");
    r.style.setProperty("--rv-base-h", Math.round(Math.min(px("base"), maxH)) + "px");
    r.style.setProperty("--rv-topo-h", Math.round(Math.min(px("topo"), maxH)) + "px");
  }

  /* atributos da casca que o resto do app (e as provas) já lê */
  function atributos(Lm) {
    var r = E.raiz;
    r.setAttribute("data-rv-doca", E.ativo ? "on" : "off");
    var esq = gruposVisiveis("esq", Lm).length;
    var recProps = !!Lm.rec.props, recNav = !!Lm.rec.nav;
    var posP = D().onde(Lm, "props"), posN = D().onde(Lm, "nav");
    var emEsq = function (p) { return p && p.zona === "esq"; };
    var tudo = (recProps || !emEsq(posP)) && (recNav || !emEsq(posN)) && (recProps || recNav) && esq === 0;
    if (E.ativo) r.setAttribute("data-rv-lateral-off", tudo ? "1" : "0"); else r.setAttribute("data-rv-lateral-off", "0");
    var parcial = E.ativo && !tudo && E.bordas.esq.getAttribute("data-n") !== "0";
    if (parcial) E.bordas.esq.setAttribute("data-parcial", "1"); else E.bordas.esq.removeAttribute("data-parcial");
    if (E.ativo && posP && posP.zona === "dir") r.setAttribute("data-rv-lat-lado", "dir"); else r.removeAttribute("data-rv-lat-lado");
    atributosFita();
  }
  function atributosFita() {
    if (!E) return;
    var rec = E.ativo && E.L.fita.rec;
    E.raiz.setAttribute("data-rv-fita-rec", rec ? "1" : "0");
    if (!rec) { E.fitaSobre = false; }
    E.raiz.setAttribute("data-rv-fita-sobre", rec && E.fitaSobre ? "1" : "0");
    var pin = E.raiz.querySelector(".rv-fita-pin");
    if (pin) { pin.setAttribute("aria-pressed", rec ? "true" : "false"); pin.title = rec ? "Fixar a fita (mostrar os botões o tempo todo)" : "Recolher a fita (só as abas; clique numa aba para abrir por cima do 3D)"; }
  }

  /* ================================================== OPERAÇÕES (alto nível) */
  function aplicar(L, msg, opts) {
    opts = opts || {};
    E.L = D().validar(L);
    D().salvar(arm(), usuario(), E.L);
    render();
    if (msg) status(msg);
    if (!opts.semLayout) aoMudarLayout();
    return E.L;
  }
  function recolher(id, on) {
    var c = D().recolher(E.L, id, on == null ? undefined : !!on);
    legadoLateral();
    return aplicar(c, !!c.rec[id] ? rotulo(id) + " recolhido na borda (clique na aba para abrir)." : rotulo(id) + " fixado.");
  }
  function encaixar(id, zona) {
    return aplicar(D().encaixar(E.L, id, zona, {}), rotulo(id) + " encaixado " + NOME_ZONA[zona] + ".");
  }
  function soltarJanela(id, rect) {
    var R = flutRect(), r = rect || {};
    var pos = D().onde(E.L, id), base = pos && pos.zona && quadroRect(id);
    if (!rect && base) r = { x: base.l - R.left + 24, y: base.t - R.top + 24, w: Math.max(D().FLUT_MIN.w, base.r - base.l), h: Math.max(D().FLUT_MIN.h, Math.min(base.b - base.t, 520)) };
    return aplicar(D().flutuar(E.L, id, r), rotulo(id) + " solto como janela (arraste pela barra; ⊞ encaixa de volta).");
  }
  function quadroRect(id) { var q = E.quadros[id]; return q ? rect(q) : null; }
  function voltarPainel(id) { return aplicar(D().voltar(E.L, id), rotulo(id) + " encaixado de volta."); }
  function pronto(nome) {
    var info = D().PRONTOS.filter(function (p) { return p.id === nome; })[0];
    var L = D().pronto(nome); L.fita = { rec: !!L.fita.rec };
    var r = aplicar(L, "Layout \"" + (info ? info.rotulo : nome) + "\".");
    atributosFita();
    return r;
  }
  function restaurar() {
    var a = arm();
    try {
      ["orcapro:bim:lateral-w", "orcapro:bim:props-h", "orcapro:bim:lateral-off", "orcapro:bim:lateral-lado"].forEach(function (k) { if (a) a.removeItem(k); });
      if (a) { var tira = []; for (var i = 0; i < a.length; i++) { var k2 = a.key(i); if (String(k2).indexOf("orcapro:bim:direita-w:") === 0) tira.push(k2); } tira.forEach(function (k3) { a.removeItem(k3); }); }
    } catch (e) {}
    D().esquecer(a, usuario());
    E.L = D().padrao();
    E.fitaSobre = false;
    render(); atributosFita();
    status("Layout padrão restaurado.");
    aoMudarLayout();
    return E.L;
  }
  /* o antigo "esconder a coluna lateral" também deixa a chave que as outras telas leem */
  function legadoLateral() {
    var a = arm(); if (!a) return;
    try { a.setItem("orcapro:bim:lateral-off", E.L.rec.props && E.L.rec.nav ? "1" : "0"); } catch (e) {}
  }
  function lateralFixa(on) {
    var atual = E.raiz.getAttribute("data-rv-lateral-off") === "1";
    var novo = on == null ? !atual : !!on;
    var L = D().recolher(E.L, "props", novo); L = D().recolher(L, "nav", novo);
    aplicar(L, novo ? "Propriedades e Navegador recolhidos nas bordas." : "Propriedades e Navegador à vista.");
    legadoLateral();
    return novo;
  }
  function ladoLateral(lado) {
    var L = E.L;
    if (lado === "dir" || lado === "esq") {
      L = D().encaixar(L, "props", lado, {}); L = D().encaixar(L, "nav", lado, {});
      aplicar(L, lado === "dir" ? "Propriedades e Navegador encaixados à direita." : "Propriedades e Navegador encaixados à esquerda.");
    }
    var p = D().onde(E.L, "props");
    return p && p.zona === "dir" ? "dir" : "esq";
  }
  /* a gaveta de ferramentas abriu/fechou: o grupo dela entra/sai da zona; se estava recolhida, é fixada (quem pediu a ferramenta quer vê-la) */
  function sincronizar(abriu) {
    if (!E) return;
    if (abriu && E.L.rec.ferr && E.ativo) { E.L = D().recolher(E.L, "ferr", false); D().salvar(arm(), usuario(), E.L); }
    render();
  }
  /* deixa o painel À VISTA: fora do recolhimento, na aba da frente do grupo, desenrolado se for janela solta */
  function mostrar(id) {
    var c = E.L, pos = D().onde(c, id);
    if (c.rec[id]) c = D().recolher(c, id, false);
    if (pos && !pos.flut) c = D().ativar(c, id);
    if (c !== E.L) aplicar(c, "");
    return true;
  }
  function fitaRec(on) {
    var L = D().fitaRec(E.L, on == null ? undefined : !!on);
    E.fitaSobre = false;
    E.L = L; D().salvar(arm(), usuario(), E.L);
    atributosFita();
    status(L.fita.rec ? "Fita recolhida: só as abas (clique numa aba para abrir)." : "Fita fixada.");
    aoMudarLayout();
    return L.fita.rec;
  }
  function fitaAbrirSobre(on) {
    if (!E.ativo || !E.L.fita.rec) return false;
    var novo = on == null ? !E.fitaSobre : !!on;
    E.fitaSobre = novo;
    if (novo) {
      var ab = E.raiz.querySelector(".rv-abas");
      if (ab) E.raiz.style.setProperty("--rv-fita-top", Math.round(ab.getBoundingClientRect().bottom - E.raiz.getBoundingClientRect().top) + "px");
    }
    atributosFita();
    return novo;
  }

  /* =============================================================== OVERLAY */
  /* o painel recolhido aberto POR CIMA do 3D (não empurra nada) */
  function abrirSobre(id) {
    var Lm = efetivo(), pos = D().onde(Lm, id);
    if (!pos || pos.flut || !E.painel[id]) return false;
    if (E.sobre && E.sobre.id === id) { fecharSobre(); return false; }
    fecharSobre(true);
    var z = pos.zona;
    var ov = el("div", "rv-sobre"); ov.setAttribute("data-z", z); ov.setAttribute("data-pn", id);
    var gp = quadro({ zona: z, abas: [id], ativa: id, modo: "sobre", cls: "rv-gp-sobre" });
    ov.appendChild(gp);
    ov.style.setProperty("--rv-sobre-t", Lm.tam[z] + "px");
    E.corpo.appendChild(ov);
    E.sobre = { id: id, el: ov, zona: z };
    renderBordas(Lm);
    if (E.cfg.aoAbrirSobre) { try { E.cfg.aoAbrirSobre(id); } catch (e) {} }
    return true;
  }
  function fecharSobre(quieto) {
    if (!E || !E.sobre) return;
    var s = E.sobre; E.sobre = null;
    guardar(E.painel[s.id] && E.painel[s.id].el);
    if (s.el.parentNode) s.el.parentNode.removeChild(s.el);
    if (!quieto) {
      /* painel que NÃO estava recolhido (aberto por cima só no modo modelagem) volta ao quadro dele */
      if (!efetivo().rec[s.id]) render(); else renderBordas(efetivo());
    }
  }

  /* ================================================================ MENUS */
  function fecharMenu() {
    if (!E || !E.menu) return;
    var m = E.menu; E.menu = null;
    if (m.el.parentNode) m.el.parentNode.removeChild(m.el);
    if (m.foco && m.foco.focus) { try { m.foco.focus(); } catch (e) {} }
  }
  function abrirMenu(x, y, itens, foco) {
    fecharMenu();
    var m = el("div", "rv-doca-menu"); m.setAttribute("role", "menu");
    itens.forEach(function (it) {
      if (it.sep) { m.appendChild(el("div", "rv-doca-menu-sep")); return; }
      if (it.tit) { m.appendChild(el("div", "rv-doca-menu-tit", it.tit)); return; }
      var b = el("button", "rv-doca-menu-it"); b.type = "button"; b.setAttribute("role", it.check != null ? "menuitemcheckbox" : "menuitem");
      if (it.check != null) b.setAttribute("aria-checked", it.check ? "true" : "false");
      b.innerHTML = '<span class="rv-doca-menu-ck">' + (it.check ? "✓" : "") + "</span><span></span>";
      b.lastChild.textContent = it.rot;
      if (it.dica) b.title = it.dica;
      if (it.off) b.disabled = true;
      b.onclick = function () { fecharMenu(); try { it.fn(); } catch (e) {} };
      m.appendChild(b);
    });
    E.raiz.appendChild(m);
    var R = raizRect(), mw = m.offsetWidth || 240, mh = m.offsetHeight || 240;
    m.style.left = Math.max(4, Math.min(x - R.left, R.width - mw - 4)) + "px";
    m.style.top = Math.max(4, Math.min(y - R.top, R.height - mh - 4)) + "px";
    E.menu = { el: m, foco: foco || null };
    var p = m.querySelector("button:not([disabled])"); if (p) p.focus();
    return m;
  }
  function itensMover(id) {
    var pos = D().onde(E.L, id) || {}, fl = !!pos.flut, rec = !!E.L.rec[id], L = [{ tit: rotulo(id) }];
    D().ZONAS.forEach(function (z) {
      L.push({ rot: "Encaixar " + NOME_ZONA[z], check: !fl && pos.zona === z && !rec, fn: function () { encaixar(id, z); } });
    });
    L.push({ rot: "Soltar como janela flutuante", check: fl, fn: function () { soltarJanela(id); } });
    L.push({ sep: true });
    if (!fl) L.push({ rot: rec ? "Fixar (empurra o 3D)" : "Recolher na borda", fn: function () { recolher(id, !rec); } });
    L.push({ sep: true });
    L.push({ rot: "Restaurar layout padrão", fn: function () { restaurar(); } });
    return L;
  }
  /* o menu geral "Painéis": mostra/recolhe cada painel, layouts prontos, fita, modo modelagem */
  function itensMenu() {
    var L = [{ tit: "Painéis" }];
    D().PAINEIS.forEach(function (id) {
      var vis = id === "ferr" ? visivel("ferr") : true;
      L.push({ rot: D().ROTULO[id], check: !E.L.rec[id] && vis,
        dica: id === "ferr" ? "A gaveta onde abrem Instalações, Famílias, Pranchas, Render… (abre pela fita)" : "Mostrar ou recolher na borda",
        fn: function () { if (id === "ferr" && !visivel("ferr")) { status("Abra uma ferramenta pela fita: ela aparece neste painel."); return; } recolher(id, !E.L.rec[id]); } });
    });
    L.push({ sep: true }); L.push({ tit: "Layouts prontos" });
    D().PRONTOS.forEach(function (p) { L.push({ rot: p.rotulo, dica: p.dica, fn: function () { pronto(p.id); } }); });
    L.push({ sep: true });
    L.push({ rot: "Fita só com as abas", check: !!E.L.fita.rec, fn: function () { fitaRec(); } });
    L.push({ rot: "Modo modelagem (tela cheia do 3D)", dica: "Esconde tudo menos a vista (F11 ou Esc para sair)", fn: function () { try { if (E.cfg.foco) E.cfg.foco(); } catch (e) {} } });
    L.push({ rot: "Restaurar layout padrão", fn: function () { restaurar(); } });
    return L;
  }
  /* no modo modelagem as zonas somem: cada painel abre POR CIMA do 3D, e só enquanto se usa */
  function itensFoco() {
    var L = [{ tit: "Abrir por cima do 3D" }];
    D().PAINEIS.forEach(function (id) {
      L.push({ rot: D().ROTULO[id], off: id === "ferr" && !visivel("ferr"), dica: id === "ferr" ? "Disponível quando uma ferramenta está aberta" : "", fn: function () { abrirSobre(id); } });
    });
    L.push({ sep: true });
    L.push({ rot: "Sair do modo modelagem (F11)", fn: function () { try { if (E.cfg.foco) E.cfg.foco(); } catch (e) {} } });
    return L;
  }
  function menuGeral(ancora, foco) {
    var r = ancora && ancora.getBoundingClientRect ? ancora.getBoundingClientRect() : { left: 20, bottom: 40 };
    return abrirMenu(r.left, r.bottom + 2, foco ? itensFoco() : itensMenu(), ancora);
  }

  /* ===================================================== PONTEIRO / ARRASTO */
  function geo() {
    var g = { corpo: rect(E.corpo), centro: rect(E.centro.querySelector(".rv-area") || E.centro), zonas: {}, grupos: [], borda: 72, pad: {} };
    var Lm = efetivo();
    D().ZONAS.forEach(function (z) {
      g.pad[z] = Lm.tam[z];
      var c = E.zonas[z];
      g.zonas[z] = c.getAttribute("data-vazia") === "1" ? null : rect(c);
      [].forEach.call(c.querySelectorAll(":scope > .rv-gp"), function (q) {
        var r = rect(q), cab = rect(q.querySelector(".rv-gp-cab")), abas = [];
        [].forEach.call(q.querySelectorAll(".rv-gp-aba"), function (a) { var ar = rect(a); abas.push({ id: a.getAttribute("data-pn"), l: ar.l, r: ar.r }); });
        g.grupos.push({ zona: z, i: +q.getAttribute("data-g"), l: r.l, t: r.t, r: r.r, b: r.b, cab: cab, abas: abas });
      });
    });
    return g;
  }

  function indicador() {
    var d = E.drag;
    if (!d.alvoEl) { d.alvoEl = el("div", "rv-alvo"); d.alvoEl.setAttribute("aria-hidden", "true"); E.raiz.appendChild(d.alvoEl); }
    return d.alvoEl;
  }
  function pintarAlvo(a) {
    var d = E.drag, R = raizRect();
    if (!a || !a.rect) { if (d.alvoEl) d.alvoEl.style.display = "none"; return; }
    var e = indicador(), r = a.rect;
    e.style.display = "block";
    e.setAttribute("data-tipo", a.tipo);
    e.style.transform = "translate(" + Math.round(r.l - R.left) + "px," + Math.round(r.t - R.top) + "px)";
    e.style.width = Math.max(4, Math.round(r.r - r.l)) + "px"; e.style.height = Math.max(4, Math.round(r.b - r.t)) + "px";
    var rot = a.tipo === "flut" ? "Soltar como janela" : (a.tipo === "aba" ? "Juntar em abas" : "Encaixar " + NOME_ZONA[a.zona]);
    e.setAttribute("data-rot", rot);
  }

  function aoPressionar(ev) {
    if (!E || !E.ativo || ev.button !== 0) return;
    var t = ev.target;
    if (!t || !t.closest) return;
    /* o botão fino da borda também se arrasta (e clica para abrir) */
    var bb = t.closest(".rv-borda-bt");
    var cab = t.closest(".rv-gp-cab");
    if (cab && t.closest(".rv-gp-bt")) return;
    if (!cab && !bb) return;
    var gp = cab ? cab.closest(".rv-gp") : null;
    var aba = t.closest(".rv-gp-aba");
    var id = bb ? bb.getAttribute("data-pn-rec") : (aba ? aba.getAttribute("data-pn") : (gp && gp.getAttribute("data-ativa")));
    if (!id) return;
    E.press = { id: id, x0: ev.clientX, y0: ev.clientY, gp: gp, borda: !!bb, aba: !!aba, flut: !!(gp && gp.classList.contains("rv-gp-flut")), pid: ev.pointerId, dragging: false, alvo: t };
    if (E.press.flut) { var q = gp; E.z++; q.style.zIndex = String(E.z); }
    try { (aba || bb || cab).setPointerCapture(ev.pointerId); } catch (e) {}
    on(document, "pointermove", aoMover, true);
    on(document, "pointerup", aoSoltar, true);
    on(document, "pointercancel", aoCancelar, true);
    on(document, "keydown", aoTeclaArrasto, true);
  }
  function soltarOuvintes() {
    if (!E) return;
    ["pointermove", "pointerup", "pointercancel", "keydown"].forEach(function (tp) {
      E.ouvintes = E.ouvintes.filter(function (o) {
        var casa = o.alvo === document && o.tipo === tp && (o.fn === aoMover || o.fn === aoSoltar || o.fn === aoCancelar || o.fn === aoTeclaArrasto);
        if (casa) { try { o.alvo.removeEventListener(o.tipo, o.fn, o.cap); } catch (e) {} }
        return !casa;
      });
    });
  }
  function comecarArrasto(ev) {
    var p = E.press; p.dragging = true;
    E.drag = { id: p.id, flut: p.flut, geo: null, alvo: null, alvoEl: null, ghost: null, pos0: null };
    fecharMenu();
    /* painel aberto por cima: sai do overlay antes (a pré-visualização mostra para onde vai) */
    if (E.sobre) fecharSobre(false);
    E.congelado++;
    E.raiz.setAttribute("data-rv-movendo", "1");
    if (p.flut) {
      var q = E.flutEl.querySelector('[data-flut="' + p.id + '"]'), R = flutRect();
      var r = q ? q.getBoundingClientRect() : { left: ev.clientX, top: ev.clientY };
      E.drag.pos0 = { x: r.left - R.left, y: r.top - R.top, q: q };
      if (q) q.classList.add("rv-gp-arrastando");
    } else {
      var g = el("div", "rv-ghost", rotulo(p.id)); g.setAttribute("aria-hidden", "true");
      E.raiz.appendChild(g); E.drag.ghost = g;
    }
    E.drag.geo = geo();
  }
  function aoMover(ev) {
    if (!E || !E.press) return;
    var p = E.press;
    if (!p.dragging) {
      if (Math.abs(ev.clientX - p.x0) + Math.abs(ev.clientY - p.y0) < 6) return;
      comecarArrasto(ev);
    }
    var d = E.drag, R = raizRect();
    var alvo = D().alvo(d.geo, { x: ev.clientX, y: ev.clientY });
    d.alvo = alvo;
    if (d.flut && d.pos0 && d.pos0.q) {
      /* a janela solta segue o ponteiro; só vira encaixe quando o alvo é uma borda/grupo */
      var nx = d.pos0.x + (ev.clientX - p.x0), ny = d.pos0.y + (ev.clientY - p.y0);
      d.pos0.q.style.left = Math.round(nx) + "px"; d.pos0.q.style.top = Math.round(ny) + "px";
      d.livre = { x: nx, y: ny };
      pintarAlvo(alvo && alvo.tipo !== "flut" ? alvo : null);
    } else {
      if (d.ghost) d.ghost.style.transform = "translate(" + Math.round(ev.clientX - R.left + 14) + "px," + Math.round(ev.clientY - R.top + 10) + "px)";
      pintarAlvo(alvo);
    }
    ev.preventDefault();
  }
  function aoSoltar(ev) {
    if (!E || !E.press) return;
    var p = E.press, d = E.drag;
    try { if (p.alvo && p.alvo.releasePointerCapture) p.alvo.releasePointerCapture(ev.pointerId); } catch (e) {}
    soltarOuvintes();
    E.press = null;
    /* clique simples (sem arrastar): quem age é o `click` — aba ativa o painel, botão da borda abre por cima.
       Assim o teclado (Enter/Espaço) e o mouse caem no mesmo caminho */
    if (!p.dragging) return;
    var alvo = d.alvo;
    encerrarArrasto();
    if (d.flut) {
      if (alvo && alvo.tipo !== "flut") aplicar(D().soltar(E.L, p.id, alvo), rotulo(p.id) + " encaixado.");
      else if (d.livre) { aplicar(D().posFlut(E.L, p.id, { x: d.livre.x, y: d.livre.y }), "", { semLayout: true }); }
      return;
    }
    if (alvo && alvo.tipo === "flut") alvo = emFlut(alvo);
    if (alvo) aplicar(D().soltar(E.L, p.id, alvo), alvo.tipo === "flut" ? rotulo(p.id) + " solto como janela." : rotulo(p.id) + (alvo.tipo === "aba" ? " juntado em abas." : " encaixado " + NOME_ZONA[alvo.zona] + "."));
    else status("Solte sobre uma borda do 3D, sobre outro painel ou no meio da vista (janela solta).");
  }
  function encerrarArrasto() {
    var d = E.drag; E.drag = null;
    if (d) {
      if (d.ghost && d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
      if (d.alvoEl && d.alvoEl.parentNode) d.alvoEl.parentNode.removeChild(d.alvoEl);
      if (d.pos0 && d.pos0.q) d.pos0.q.classList.remove("rv-gp-arrastando");
    }
    E.raiz.removeAttribute("data-rv-movendo");
    E.congelado = Math.max(0, E.congelado - 1);
    /* depois de um arrasto o navegador ainda manda um `click` ao mesmo botão: engole */
    E.sup = true; setTimeout(function () { if (E) E.sup = false; }, 0);
  }
  /* o retângulo do alvo (coordenadas da tela) vira o da camada das janelas soltas */
  function emFlut(a) {
    var R = flutRect(), r = a.rect;
    return { tipo: "flut", rect: { l: r.l - R.left, t: r.t - R.top, r: r.r - R.left, b: r.b - R.top } };
  }
  function aoCancelar() {
    if (!E || !E.press) return;
    var dragging = E.press.dragging;
    soltarOuvintes(); E.press = null;
    if (dragging) { encerrarArrasto(); render(); }
  }
  function aoTeclaArrasto(ev) { if (ev.key === "Escape" && E && E.press) { ev.stopPropagation(); ev.preventDefault(); aoCancelar(); } }
  function ativarAba(id) {
    var c = D().ativar(E.L, id);
    E.L = c; D().salvar(arm(), usuario(), E.L);
    var q = E.quadros[id];
    if (q) {
      q.setAttribute("data-ativa", id);
      [].forEach.call(q.querySelectorAll(".rv-gp-aba"), function (a) { a.setAttribute("aria-selected", a.getAttribute("data-pn") === id ? "true" : "false"); });
      [].forEach.call(q.querySelectorAll(".rv-gp-corpo > *"), function (n) { n.classList.add("rv-pn-off"); });
      if (E.painel[id]) E.painel[id].el.classList.remove("rv-pn-off");
    }
    /* a gaveta de ferramentas acompanha o painel de baixo do grupo */
  }

  /* ----------------------------------------------- cliques nos botões do quadro */
  function aoClicar(ev) {
    if (!E) return;
    var t = ev.target; if (!t || !t.closest) return;
    if (E.sup) return;
    var ab0 = t.closest(".rv-gp-aba");
    if (ab0) { ativarAba(ab0.getAttribute("data-pn")); return; }
    var bb0 = t.closest(".rv-borda-bt");
    if (bb0) { abrirSobre(bb0.getAttribute("data-pn-rec")); return; }
    var bt = t.closest(".rv-gp-bt");
    if (bt) {
      var gp = bt.closest(".rv-gp"), id = gp && gp.getAttribute("data-ativa"), acao = bt.getAttribute("data-doca-acao");
      if (!id) return;
      ev.stopPropagation();
      if (acao === "recolher") recolher(id, true);
      else if (acao === "solto") soltarJanela(id);
      else if (acao === "encaixar") voltarPainel(id);
      else if (acao === "fixar") { fecharSobre(true); recolher(id, false); }
      else if (acao === "fechar-sobre") { fecharSobre(false); }
      else if (acao === "sombrear") { var c = D().recolher(E.L, id); aplicar(c, ""); }
      else if (acao === "menu") { var r = bt.getBoundingClientRect(); abrirMenu(r.left, r.bottom + 2, itensMover(id), bt); }
      return;
    }
    var rb = t.closest(".rv-borda");
    if (rb && t === rb && rb.classList.contains("rv-lat-aba")) { lateralFixa(false); return; }   /* a faixa fina da lateral (clique fora dos botões) traz tudo de volta */
  }
  function aoTeclaAba(ev) {
    if (!E) return;
    var t = ev.target;
    /* menu dos painéis: setas, Home/End */
    if (t && t.closest && t.closest(".rv-doca-menu") && /^(ArrowDown|ArrowUp|Home|End)$/.test(ev.key)) {
      var its = [].slice.call(t.closest(".rv-doca-menu").querySelectorAll(".rv-doca-menu-it:not(:disabled)")), i0 = its.indexOf(t), n0;
      if (ev.key === "ArrowDown") n0 = its[(i0 + 1) % its.length]; else if (ev.key === "ArrowUp") n0 = its[(i0 - 1 + its.length) % its.length]; else if (ev.key === "Home") n0 = its[0]; else n0 = its[its.length - 1];
      if (n0) { n0.focus(); ev.preventDefault(); }
      return;
    }
    if (t && t.classList && t.classList.contains("rv-gp-aba")) {
      if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") {
        var abas = [].slice.call(t.parentNode.querySelectorAll(".rv-gp-aba")), i = abas.indexOf(t) + (ev.key === "ArrowRight" ? 1 : -1);
        if (abas[i]) { abas[i].focus(); ativarAba(abas[i].getAttribute("data-pn")); ev.preventDefault(); }
      } else if (ev.key === "ContextMenu" || (ev.shiftKey && ev.key === "F10")) {
        var r = t.getBoundingClientRect(); abrirMenu(r.left, r.bottom, itensMover(t.getAttribute("data-pn")), t); ev.preventDefault();
      }
    }
    if (t && t.classList && t.classList.contains("rv-split") && /^Arrow/.test(ev.key)) {
      var vert = D().vertical(t.getAttribute("data-z")), passo = ev.shiftKey ? 8 : 3;
      var sg = (ev.key === "ArrowUp" || ev.key === "ArrowLeft") ? -1 : 1;
      if ((vert && (ev.key === "ArrowUp" || ev.key === "ArrowDown")) || (!vert && (ev.key === "ArrowLeft" || ev.key === "ArrowRight"))) { moverDivisoria(t, sg * passo, true); ev.preventDefault(); }
    }
    if (t && t.classList && t.classList.contains("rv-alca") && /^Arrow/.test(ev.key)) {
      var z = t.getAttribute("data-z"), vz = D().vertical(z), pa = ev.shiftKey ? 48 : 16;
      var dir = 0;
      if (vz && ev.key === "ArrowLeft") dir = z === "esq" ? -1 : 1; else if (vz && ev.key === "ArrowRight") dir = z === "esq" ? 1 : -1;
      else if (!vz && ev.key === "ArrowUp") dir = z === "topo" ? -1 : 1; else if (!vz && ev.key === "ArrowDown") dir = z === "topo" ? 1 : -1;
      if (dir) { var cur = tamanhoAtual(z); fixarTamanho(z, cur + dir * pa); ev.preventDefault(); }
    }
  }
  function aoDuploClique(ev) {
    var t = ev.target; if (!t || !t.closest) return;
    var cab = t.closest(".rv-gp-flut .rv-gp-cab");
    if (cab && !t.closest(".rv-gp-bt")) { var q = cab.closest(".rv-gp"); var id = q.getAttribute("data-ativa"); aplicar(D().recolher(E.L, id), ""); }
  }

  /* ----------------------------------------------- alças (tamanho das zonas) */
  function tamanhoAtual(z) {
    var c = E.zonas[z], r = c.getBoundingClientRect();
    return Math.round(D().vertical(z) ? r.width : r.height) || E.L.tam[z];
  }
  function tamanhoMax(z) {
    var lim = D().LIM[z], cw = E.corpo.clientWidth || 1200, ch = E.corpo.clientHeight || 700;
    return Math.max(lim.min, Math.min(lim.max, Math.round(D().vertical(z) ? cw * 0.75 : ch * 0.6)));
  }
  function fixarTamanho(z, px) {
    px = Math.max(D().LIM[z].min, Math.min(tamanhoMax(z), Math.round(px)));
    var pos = D().onde(E.L, "ferr"), comFerr = (z === "esq" || z === "dir") && pos && pos.zona === z && visivel("ferr") && !E.L.rec.ferr;
    if (comFerr && E.cfg.salvarLargFerr) { try { E.cfg.salvarLargFerr(px); } catch (e) {} }
    else E.L = D().tamZona(E.L, z, px);
    if (z === "esq") { try { var a = arm(); if (a) a.setItem("orcapro:bim:lateral-w", String(px)); } catch (e2) {} }
    D().salvar(arm(), usuario(), E.L);
    aplicarTamanhos(efetivo());
    aoMudarLayout();
  }
  function aoPressionarAlca(ev) {
    if (!E || !E.ativo || ev.button !== 0) return;
    var t = ev.target; if (!t || !t.closest) return;
    var al = t.closest(".rv-alca"), sp = t.closest(".rv-split"), fh = t.closest(".rv-gp-alca");
    if (!al && !sp && !fh) return;
    ev.preventDefault();
    try { (al || sp || fh).setPointerCapture(ev.pointerId); } catch (e) {}
    var x0 = ev.clientX, y0 = ev.clientY;
    E.congelado++;
    E.raiz.setAttribute("data-rv-arrastando", "1");
    var mv, fim;
    if (al) {
      var z = al.getAttribute("data-z"), s0 = tamanhoAtual(z), vz = D().vertical(z);
      var sinal = z === "esq" || z === "topo" ? 1 : -1;
      E.raiz.setAttribute("data-rv-eixo", vz ? "x" : "y");
      mv = function (e2) {
        var delta = vz ? e2.clientX - x0 : e2.clientY - y0;
        var v = Math.max(D().LIM[z].min, Math.min(tamanhoMax(z), s0 + sinal * delta));
        E.raiz.style.setProperty(z === "esq" ? "--rv-lat-w" : z === "dir" ? "--rv-dir-w" : z === "base" ? "--rv-base-h" : "--rv-topo-h", Math.round(v) + "px");
        E.vivo = v;
      };
      fim = function () { var v = E.vivo; E.vivo = null; if (v != null) fixarTamanho(z, v); };
    } else if (sp) {
      var za = sp.getAttribute("data-z"), ia = +sp.getAttribute("data-ga"), ib = +sp.getAttribute("data-gb"), vert = D().vertical(za);
      var qa = sp.previousElementSibling, qb = sp.nextElementSibling;
      var ra = qa.getBoundingClientRect(), rb = qb.getBoundingClientRect();
      var ta = vert ? ra.height : ra.width, tb = vert ? rb.height : rb.width, soma = ta + tb;
      E.raiz.setAttribute("data-rv-eixo", vert ? "y" : "x");
      mv = function (e3) {
        var dl = vert ? e3.clientY - y0 : e3.clientX - x0;
        var a = Math.max(soma * 0.12, Math.min(soma * 0.88, ta + dl));
        var tamA = parseFloat(qa.style.flexGrow) || 1, tamB = parseFloat(qb.style.flexGrow) || 1, s = tamA + tamB;
        qa.style.flex = (a / soma * s) + " 1 0px"; qb.style.flex = ((soma - a) / soma * s) + " 1 0px";
        E.divPct = a / soma * 100;
      };
      fim = function () {
        var pct = E.divPct; E.divPct = null;
        if (pct != null) {
          E.L = D().divisoria(E.L, za, ia, pct, ib);
          D().salvar(arm(), usuario(), E.L);
          if (za === "esq" && ia === 0) { try { var a2 = arm(); if (a2) a2.setItem("orcapro:bim:props-h", String(Math.round(pct * 10) / 10)); } catch (e4) {} }
          render();
        }
        aoMudarLayout();
      };
    } else {
      /* alças da janela solta: oito direções */
      var gp = fh.closest(".rv-gp"), id = gp.getAttribute("data-flut"), dr = fh.getAttribute("data-dir");
      var rg = gp.getBoundingClientRect(), R = flutRect(), lim = D().FLUT_MIN;
      var b0 = { x: rg.left - R.left, y: rg.top - R.top, w: rg.width, h: rg.height };
      mv = function (e5) {
        var dx = e5.clientX - x0, dy = e5.clientY - y0, x = b0.x, y = b0.y, w = b0.w, h = b0.h;
        if (dr.indexOf("e") >= 0) w = Math.max(lim.w, b0.w + dx);
        if (dr.indexOf("s") >= 0) h = Math.max(lim.h, b0.h + dy);
        if (dr.indexOf("w") >= 0) { w = Math.max(lim.w, b0.w - dx); x = b0.x + (b0.w - w); }
        if (dr.indexOf("n") >= 0) { h = Math.max(lim.h, b0.h - dy); y = b0.y + (b0.h - h); }
        gp.style.left = Math.round(x) + "px"; gp.style.top = Math.round(y) + "px"; gp.style.width = Math.round(w) + "px"; gp.style.height = Math.round(h) + "px";
        E.vivoF = { x: x, y: y, w: w, h: h };
      };
      fim = function () { var v = E.vivoF; E.vivoF = null; if (v) { E.L = D().posFlut(E.L, id, v); D().salvar(arm(), usuario(), E.L); } aoMudarLayout(); };
    }
    function up() {
      document.removeEventListener("pointermove", mv, true); document.removeEventListener("pointerup", up, true); document.removeEventListener("pointercancel", up, true);
      E.raiz.removeAttribute("data-rv-arrastando"); E.raiz.removeAttribute("data-rv-eixo");
      E.congelado = Math.max(0, E.congelado - 1);
      fim();
    }
    document.addEventListener("pointermove", mv, true); document.addEventListener("pointerup", up, true); document.addEventListener("pointercancel", up, true);
  }
  function moverDivisoria(sp, delta, fim) {
    var za = sp.getAttribute("data-z"), ia = +sp.getAttribute("data-ga"), ib = +sp.getAttribute("data-gb"), vert = D().vertical(za);
    var qa = sp.previousElementSibling, qb = sp.nextElementSibling, ra = qa.getBoundingClientRect(), rb = qb.getBoundingClientRect();
    var ta = vert ? ra.height : ra.width, tb = vert ? rb.height : rb.width, pct = (ta + delta) / (ta + tb) * 100;
    E.L = D().divisoria(E.L, za, ia, pct, ib); D().salvar(arm(), usuario(), E.L);
    render(); if (fim) aoMudarLayout();
  }

  /* ----------------------------------------------- fora do overlay = fecha */
  function aoPressionarFora(ev) {
    if (!E) return;
    var t = ev.target;
    if (E.menu && !(t.closest && t.closest(".rv-doca-menu"))) fecharMenu();
    if (E.sobre && !(t.closest && (t.closest(".rv-sobre") || t.closest('[data-pn-rec="' + E.sobre.id + '"]') || t.closest(".rv-doca-menu")))) fecharSobre(false);
    if (E.fitaSobre && !(t.closest && (t.closest(".rv-fita") || t.closest(".rv-abas") || t.closest(".rv-doca-menu") || t.closest(".rv-menu-doc") || t.closest("[data-fx-menu]")))) { E.fitaSobre = false; atributosFita(); }
  }
  function aoTeclaGlobal(ev) {
    if (!E) return;
    if (ev.key === "Escape") {
      if (E.menu) { fecharMenu(); ev.stopPropagation(); return; }
      if (E.sobre) { fecharSobre(false); ev.stopPropagation(); return; }
      if (E.fitaSobre) { E.fitaSobre = false; atributosFita(); ev.stopPropagation(); return; }
    }
  }

  /* a janela do BIM muda de altura DEPOIS de montada (a casca mede o pé da tela) e a camada das janelas soltas junto:
     a janela solta que ficou para fora é puxada de volta, sem refazer o quadro */
  function reenquadrarFlut() {
    if (!E || !E.ativo) return;
    var R = flutRect(), Lm = efetivo();
    [].forEach.call(E.flutEl.querySelectorAll(".rv-gp-flut"), function (g) {
      var r = Lm.flut[g.getAttribute("data-flut")]; if (!r) return;
      var c = limitarFlut(r, R);
      g.style.left = c.x + "px"; g.style.top = c.y + "px"; g.style.width = c.w + "px";
      if (!g.classList.contains("rv-gp-enrolado")) g.style.height = c.h + "px";
    });
  }
  function ligar() {
    var r = E.raiz;
    if (global.ResizeObserver) {
      E.roCorpo = new global.ResizeObserver(function () { if (E && !E.congelado) { clearTimeout(E._rf); E._rf = setTimeout(reenquadrarFlut, 60); } });
      E.roCorpo.observe(E.corpo);
    }
    on(r, "pointerdown", aoPressionar);
    on(r, "pointerdown", aoPressionarAlca);
    on(r, "click", aoClicar);
    on(r, "keydown", aoTeclaAba);
    on(r, "dblclick", aoDuploClique);
    on(document, "pointerdown", aoPressionarFora, true);
    on(document, "keydown", aoTeclaGlobal, true);
    on(global, "resize", function () { if (!E) return; clearTimeout(E._rz); E._rz = setTimeout(function () { if (E) { renderFlut(efetivo()); aplicarTamanhos(efetivo()); } }, 120); });
    if (E.mq) {
      E.mqFn = function (m) { if (!E) return; E.ativo = !!m.matches; render(); atributosFita(); aoMudarLayout(); };
      try { E.mq.addListener(E.mqFn); } catch (e) {}
    }
    /* o título da ferramenta aberta na gaveta é o rótulo da aba do painel "Ferramentas" */
    /* o botão da fita recolhida: clique numa aba abre a fita por cima */
    on(r, "click", function (ev) {
      var t = ev.target; if (!t || !t.closest || !E.ativo) return;
      var ab = t.closest(".rv-abas [data-rv-aba]");
      if (ab && E.L.fita.rec) { fitaAbrirSobre(!(E.fitaSobre && ab.getAttribute("aria-selected") === "true" && E._abaAnt === ab.getAttribute("data-rv-aba")) ? true : false); E._abaAnt = ab.getAttribute("data-rv-aba"); }
      var pin = t.closest(".rv-fita-pin");
      if (pin) fitaRec();
    }, true);
  }

  var api = {
    montar: montar, desmontar: desmontar,
    layout: function () { return E ? E.L : null; },
    origem: function () { return E ? E.origem : null; },
    ativo: function () { return !!(E && E.ativo); },
    congelado: function () { return !!(E && E.congelado > 0); },
    render: function () { if (E) render(); },
    recolher: function (id, on2) { return E ? recolher(id, on2) : null; },
    mostrar: function (id) { return E ? mostrar(id) : false; },
    encaixar: function (id, z) { return E ? encaixar(id, z) : null; },
    soltarJanela: function (id, r) { return E ? soltarJanela(id, r) : null; },
    voltar: function (id) { return E ? voltarPainel(id) : null; },
    abrirSobre: function (id) { return E ? abrirSobre(id) : false; },
    fecharSobre: function () { if (E) fecharSobre(false); },
    sobre: function () { return E && E.sobre ? E.sobre.id : null; },
    pronto: function (n) { return E ? pronto(n) : null; },
    restaurar: function () { return E ? restaurar() : null; },
    lateralFixa: function (on2) { return E ? lateralFixa(on2) : false; },
    ladoLateral: function (l) { return E ? ladoLateral(l) : "esq"; },
    sincronizar: function (abriu) { if (E) sincronizar(abriu); },
    fitaRec: function (on2) { return E ? fitaRec(on2) : false; },
    fitaAbrirSobre: function (on2) { return E ? fitaAbrirSobre(on2) : false; },
    fitaSobre: function () { return !!(E && E.fitaSobre); },
    fitaRecolhida: function () { return !!(E && E.ativo && E.L.fita.rec); },
    atributosFita: atributosFita,
    itensMenu: function () { return E ? itensMenu() : []; },
    menuGeral: function (a, foco) { return E ? menuGeral(a, foco) : null; },
    fecharMenu: fecharMenu,
    geo: function () { return E ? geo() : null; },
    aplicarTamanhos: function () { if (E) aplicarTamanhos(efetivo()); }
  };

  global.BimDocaUI = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
