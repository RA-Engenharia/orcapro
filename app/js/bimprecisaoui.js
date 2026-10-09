/* =====================================================================
 * bimprecisaoui.js — a TELA do desenho de precisão (fase B3 do
 * PLANO-BIM-MODELADOR.md, 08/10/2026). Só com a prévia do modelador
 * (`BimPrevia.modelador()`, `?previa=modelador`); sem ela, o editor fica
 * exatamente como na 1.2.128.
 *
 * Quem faz o quê:
 *   js/bimprecisao.js ... a CONTA (snap, transformações, cotas, ops) — puro;
 *   este arquivo ........ mouse, teclado, marcador, caixa de digitar, cotas
 *                         temporárias, alças e a barra de opções;
 *   js/bim.js ........... só ganchos: entrega o que este arquivo precisa do
 *                         visualizador (cena, câmera, plano de trabalho, editOp)
 *                         em `montar(api)` e chama mover/clique/selecionar.
 * P4 (09/10/2026): as ferramentas da aba Modificar que faltavam (alinhar,
 * deslocamento, aparar, dividir, fixar, similar, corresponder tipo, escala),
 * Geometria (juntas de parede, alternar ordem de união, unir/desunir) e
 * Pintar (pintar, dividir face, remover pintura — a película no 3D), com a
 * barra de opções delas; a conta é do js/bimprecisao.js e do js/bimpintar.js.
 * Nada aqui grava estado próprio: tudo o que muda o modelo vira OP do BimEdit
 * (api.op), e o desfazer/refazer de sempre (Ctrl+Z/Ctrl+Y) volta.
 * O IFC importado nunca é alterado: a seleção só aceita peça do editor.
 * ===================================================================== */
(function (global) {
  "use strict";

  function Pr() { return global.BimPrecisao; }
  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function fmt(v) { return Pr().fmtM(v); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var CHAVE = "orcapro:bim:precisao:v1";   /* só preferência do aparelho (snaps ligados, passo da grade) */
  /* cor do marcador por tipo — tokens do css/app.css (o tema escuro vem junto) */
  var COR = { fim: "var(--verde)", intersecao: "var(--vermelho)", meio: "var(--amarelo)", centro: "var(--aco)", perpendicular: "var(--aco)",
              extensao: "var(--amarelo)", proximo: "var(--texto-fraco)", grade: "var(--texto-fraco)" };
  /* ferramentas desta fase e os passos de cada uma */
  var PASSOS = {
    mover: ["sel", "base", "destino"], copiar: ["sel", "base", "destino"], espelhar: ["sel", "eixo1", "eixo2"],
    girar: ["sel", "centro", "ref", "final"], matriz: ["sel", "base", "destino"], cota: ["p1", "p2", "pos"],
    /* P4 — Modificar, Geometria e Pintar (plano do BIM, fase P4) */
    alinhar: ["linhaRef", "linhaAlvo"], deslocar: ["alvoD"], aparar: ["pecaA", "pecaB"], "aparar-varios": ["linhaRef", "alvoV"],
    dividir: ["pontoDiv"], fixar: ["pecaF"], desafixar: ["pecaF"], similar: ["fonte", "pS1", "pS2"], "corresp-tipo": ["fonte", "alvoT"],
    escala: ["sel", "baseE"], juntas: ["canto"], "alternar-uniao": ["pecaU1", "pecaU2"], "unir-geo": ["pecaU1", "pecaU2"], "desunir-geo": ["pecaU1", "pecaU2"],
    pintar: ["face"], "dividir-face": ["face"], "remover-pintura": ["face"]
  };
  /* P4: os passos que pedem a PEÇA ou a LINHA clicada (não só um ponto do plano) */
  var P4 = { linhaRef: 1, linhaAlvo: 1, alvoD: 1, pecaA: 1, pecaB: 1, alvoV: 1, pontoDiv: 1, pecaF: 1, fonte: 1, pS1: 1, pS2: 1, alvoT: 1, baseE: 1, canto: 1, pecaU1: 1, pecaU2: 1, face: 1 };
  var DICA = {
    sel: "Clique no elemento criado no OrçaPRO (Ctrl soma outro; Enter segue).",
    base: "Clique o PONTO BASE.", destino: "Clique o destino — ou digite a distância (Tab: ângulo) e Enter.",
    eixo1: "Clique o 1º ponto do EIXO do espelho.", eixo2: "Clique o 2º ponto do eixo — ou digite o ângulo do eixo e Enter.",
    centro: "Clique o CENTRO do giro.", ref: "Digite o ângulo e Enter — ou clique a direção de referência.", final: "Clique a direção final — ou digite o ângulo e Enter.",
    p1: "clique o 1º ponto.", p2: "Clique o 2º ponto — ou digite o comprimento (Tab: ângulo) e Enter.", pos: "Clique onde passa a linha da cota (Enter: 0,50 m ao lado).",
    /* P4 */
    linhaRef: "Clique a LINHA DE REFERÊNCIA (face, eixo da parede, eixo da grade).", linhaAlvo: "Clique a linha da peça que vai encostar na referência.",
    alvoD: "Clique na parede ou viga, do lado para onde vai o deslocamento (a distância está na barra de opções).",
    pecaA: "Clique a 1ª parede (ou viga) no trecho que FICA.", pecaB: "Clique a 2ª no trecho que FICA — as duas vão até o canto.",
    alvoV: "Clique cada parede/viga que vai até a referência (o lado clicado fica). Esc termina.",
    pontoDiv: "Clique na parede ou viga onde ela se divide.", pecaF: "Clique na peça.",
    fonte: "Clique na peça de ORIGEM.", pS1: "Clique o 1º ponto da peça nova.", pS2: "Clique o 2º ponto.",
    alvoT: "Clique cada peça que passa a ser do tipo da origem. Esc termina.", baseE: "Clique o PONTO BASE da escala (o fator está na barra de opções).",
    canto: "Clique perto do canto de duas paredes.", pecaU1: "Clique perto do canto de duas paredes, ou na 1ª peça.", pecaU2: "Clique na 2ª peça.",
    face: "Clique na FACE da parede (ou da laje)."
  };
  var ROT_FERR = { mover: "Mover", copiar: "Copiar", espelhar: "Espelhar", girar: "Girar", matriz: "Matriz", cota: "Cota alinhada",
    alinhar: "Alinhar", deslocar: "Deslocamento", aparar: "Aparar/estender para canto", "aparar-varios": "Aparar/estender vários", dividir: "Dividir elemento",
    fixar: "Fixar", desafixar: "Desafixar", similar: "Criar similar", "corresp-tipo": "Igualar tipo", escala: "Escala",
    juntas: "Juntas de parede", "alternar-uniao": "Alternar ordem de união", "unir-geo": "Unir geometria", "desunir-geo": "Desunir geometria",
    pintar: "Pintar", "dividir-face": "Dividir face", "remover-pintura": "Remover pintura" };
  var MODOS_JUNTA = [["topo", "Topo"], ["esquadria", "Meia-esquadria"], ["quadrado", "Esquadrar"]];
  function Pt() { return global.BimPintar || null; }

  var BimPrecisaoUI = {
    montar: function (api) {
      var THREE = api.THREE, S = api.S, edit = api.edit;
      var pr = { snapOn: true, tipos: {}, grade: 0.10, sel: [], passo: null, pts: [], copiaEsp: true, copiaGir: false,
                 mat: { tipo: "linear", n: 3, graus: 360 }, ult: null, geo: null, geoExc: "", tecla: "", teclaT: 0, arrasto: null, cotasTmp: [],
                 /* P4: as opções da barra (deslocamento, junta, escala, pintura) e o que a ferramenta já pegou */
                 p4: { desl: 0.15, deslCopia: true, juntaModo: "topo", fator: 2, material: "Pintura acrílica", codigo: "", barrado: 1.5, ref: null, a: null, fonte: null, pts: [] } };
      Pr().TIPOS.forEach(function (t) { pr.tipos[t] = true; });
      try { var g0 = JSON.parse(global.localStorage.getItem(CHAVE) || "null"); if (g0) { if (g0.tipos) Object.keys(g0.tipos).forEach(function (k) { if (k in pr.tipos) pr.tipos[k] = !!g0.tipos[k]; }); if (g0.grade >= 0) pr.grade = +g0.grade; if (g0.snapOn === false) pr.snapOn = false; } } catch (eL) {}
      function guardarPref() { try { global.localStorage.setItem(CHAVE, JSON.stringify({ tipos: pr.tipos, grade: pr.grade, snapOn: pr.snapOn })); } catch (eG) {} }
      function ativo() { return previa() && edit.on && S.alive !== false; }
      function host() { return api.host(); }
      function cam() { return api.camera(); }
      function V3(p, y) { return new THREE.Vector3(p.x, y == null ? edit.base : y, p.z); }
      function hint(t) { if (api.hint) api.hint(t); }
      function nid(pre) { return pre + (++edit.seq); }
      function estado() { return edit.estado || (global.BimEdit ? global.BimEdit.aplicar(edit.ops) : { caixas: [] }); }
      function ferramenta() { return PASSOS[edit.sub] ? edit.sub : null; }

      /* ------------------------------------------------------- DOM */
      function el(tag, cls, html) { var d = document.createElement(tag); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; }
      var caixa = el("div", "bp-digita");
      caixa.setAttribute("data-bp", "digita");
      caixa.innerHTML = '<span class="bp-vivo" data-bp="vivo"></span>' +
        '<label data-bp="l-comp">Comprimento <input data-bp="comp" inputmode="decimal" autocomplete="off" aria-label="Comprimento em metros"></label>' +
        '<label data-bp="l-ang">Ângulo <input data-bp="ang" inputmode="decimal" autocomplete="off" aria-label="Ângulo em graus"></label>';
      var opcoes = el("div", "bp-opcoes"); opcoes.setAttribute("data-bp", "opcoes");
      var painel = el("div", "bp-snaps"); painel.setAttribute("data-bp", "snaps");
      var camadaDom = el("div", "bp-camada"); camadaDom.setAttribute("data-bp", "camada");
      function pendurar() {
        var h = host(); if (!h) return;
        [caixa, painel, camadaDom].forEach(function (d) { if (d.parentNode !== h) h.appendChild(d); });
        /* PLANTA (js/bimbarraopcoes.js): as opções de Mover/Copiar/Girar… entram na barra de opções
           sob a fita (vale na planta e no 3D); sem a barra, flutuam sobre o 3D como antes */
        var sl = (global.BimBarraOpcoes && global.BimBarraOpcoes.substituiPainel && global.BimBarraOpcoes.substituiPainel()) ? global.BimBarraOpcoes.slot() : null;
        var alvoOp = sl || h; if (opcoes.parentNode !== alvoOp) alvoOp.appendChild(opcoes);
      }
      /* ⚠ só pendura na tela quando a prévia está em uso (pendurar() no 1º uso): sem
         a prévia o palco do BIM fica com os mesmos filhos da 1.2.128 */
      var inComp = caixa.querySelector('[data-bp="comp"]'), inAng = caixa.querySelector('[data-bp="ang"]');

      /* ------------------------------------------------ 3D auxiliar */
      var grp = new THREE.Group(); grp.name = "precisao-aux"; grp.renderOrder = 997; api.scene.add(grp);
      var cotasGrp = new THREE.Group(); cotasGrp.name = "precisao-cotas"; api.scene.add(cotasGrp);
      var selGrp = new THREE.Group(); selGrp.name = "precisao-selecao"; api.scene.add(selGrp);
      var pintGrp = new THREE.Group(); pintGrp.name = "p4-pinturas"; api.scene.add(pintGrp);   /* P4: o material pintado nas faces */
      var matSelLinha = new THREE.LineBasicMaterial({ color: 0x2effa0, depthTest: false, transparent: true, opacity: 0.95 });
      var matLinha = new THREE.LineBasicMaterial({ color: 0x2fbf71, depthTest: false, transparent: true, opacity: 0.95 });
      var matGuia = new THREE.LineDashedMaterial({ color: 0xd99a1e, depthTest: false, dashSize: 0.15, gapSize: 0.1, transparent: true, opacity: 0.9 });
      var matFant = new THREE.LineBasicMaterial({ color: 0x3fb5e5, depthTest: false, transparent: true, opacity: 0.95 });
      var matCota = new THREE.LineBasicMaterial({ color: 0x1f6fb2, depthTest: false });
      var matTmp = new THREE.LineDashedMaterial({ color: 0x1f6fb2, depthTest: false, dashSize: 0.1, gapSize: 0.06, transparent: true, opacity: 0.85 });
      function limparGrupo(g) { g.children.slice().forEach(function (o) { g.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material && o.material.map) { o.material.map.dispose(); o.material.dispose(); } }); }
      function segs(lista, mat, y) {
        if (!lista.length) return null;
        var pts = []; lista.forEach(function (s) { pts.push(V3(s[0], y), V3(s[1], y)); });
        var ls = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat);
        if (mat.isLineDashedMaterial) ls.computeLineDistances();
        ls.renderOrder = 998; ls.frustumCulled = false; return ls;
      }

      /* ------------------------------------------- PONTO COM SNAP */
      function geometria() {
        /* só a peça cuja ALÇA está sendo arrastada sai do snap (senão a ponta agarra nela mesma e não anda);
           no copiar/mover/girar o ponto base costuma ser a ponta da própria peça selecionada */
        var exc = (pr.arrasto ? [pr.arrasto.id] : []).join("|");
        if (!pr.geo || pr.geoExc !== exc) { pr.geo = Pr().geometria(estado(), { excluir: exc ? exc.split("|") : [], avaliar: api.avaliar }); pr.geoExc = exc; }
        return pr.geo;
      }
      /* tolerância do snap em METROS: o raio em pixels (14 no mouse, 30 no dedo) medido no plano de trabalho */
      function tolM(e) {
        var a = api.planoPonto(e.clientX, e.clientY), b = api.planoPonto(e.clientX + api.raio(e), e.clientY);
        return a && b ? Math.max(0.005, Math.min(2, a.distanceTo(b))) : 0.2;
      }
      function baseAtual() {
        var f = ferramenta();
        if (!f) return (edit.p1 && /^(parede|viga|laje|cobertura)$/.test(edit.sub)) ? { x: edit.p1.x, z: edit.p1.z } : null;
        if ((pr.passo === "destino" || pr.passo === "eixo2" || pr.passo === "p2") && pr.pts[0]) return pr.pts[0];
        if ((pr.passo === "ref" || pr.passo === "final") && pr.pts[0]) return pr.pts[0];
        return null;
      }
      function pontoSnap(e, hit) {
        var pl = api.planoPonto(e.clientX, e.clientY); if (!pl) return null;
        var cur = { x: pl.x, z: pl.z }, ref = baseAtual(), tol = tolM(e), sn = null, malha = false;
        if (pr.snapOn) sn = Pr().snap(cur, geometria(), { tol: tol, tipos: pr.tipos, ref: ref, grade: pr.tipos.grade ? pr.grade : 0 });
        /* o canto do IFC importado (malha) entra quando aqui não há PONTO notável:
           desenhar a parede nova sobre a planta do projeto continua agarrando */
        if (pr.snapOn && (!sn || Pr().CLASSE[sn.sub || sn.tipo] > 0) && hit && hit.object && hit.object.userData && hit.object.userData.mid !== "edit") {
          var ms = api.snapMalha(e, hit);
          if (ms && ms.tipo) { sn = { p: { x: ms.p.x, z: ms.p.z }, tipo: ms.tipo, malha: true, obj: ms.obj, seg: ms.seg }; malha = true; }
        }
        var p = sn ? { x: sn.p.x, z: sn.p.z } : cur;
        if (e.shiftKey && ref) { p = Pr().orto(ref, p); if (sn && !malha) sn = { p: p, tipo: sn.tipo === "grade" ? "grade" : null }; }
        return { p: p, sn: sn, malha: malha, tol: tol };
      }
      function mostrarMarca(sp) {
        limparGrupo(grp);
        if (!sp || !sp.sn || !sp.sn.tipo) { api.marcaEsconder(); return; }
        if (sp.malha) { api.marca({ p: V3(sp.p), tipo: sp.sn.tipo, obj: sp.sn.obj, seg: sp.sn.seg }); return; }
        api.marca({ p: V3(sp.p), tipo: sp.sn.tipo, editor: true, cor: COR[sp.sn.tipo] });
        var gs = (sp.sn.guias || []).map(function (g) { return [g.a, g.b]; });
        var l = segs(gs, matGuia, edit.base + 0.01); if (l) grp.add(l);
      }

      /* ------------------------------------------- caixa de digitar */
      function campos() {
        var f = ferramenta(), so = null;
        if (f === "girar" || f === "espelhar") so = "ang";
        if (!f && (edit.sub === "laje" || edit.sub === "cobertura")) so = "ret";
        return so;
      }
      function caixaPos(x, y) {
        var hr = host().getBoundingClientRect();
        caixa.style.left = (x - hr.left + 18) + "px"; caixa.style.top = (y - hr.top + 14) + "px";
      }
      function caixaMostrar(e, base, p) {
        var so = campos(), digitando = caixa.contains(document.activeElement);
        caixa.querySelector('[data-bp="l-ang"]').style.display = so === "ret" ? "none" : "";
        caixa.querySelector('[data-bp="l-comp"]').style.display = so === "ang" ? "none" : "";
        caixa.querySelector('[data-bp="l-comp"]').firstChild.nodeValue = so === "ret" ? "Largura x profundidade " : "Comprimento ";
        var da = Pr().distAng(base, p), viv = caixa.querySelector('[data-bp="vivo"]');
        if (so === "ret") viv.textContent = fmt(Math.abs(p.x - base.x)) + " × " + fmt(Math.abs(p.z - base.z)) + " m";
        else if (ferramenta() === "girar" && pr.passo === "final" && pr.pts[1]) viv.textContent = fmt(angRel(pr.pts[0], pr.pts[1], p)) + "°";
        else viv.textContent = fmt(da.dist) + " m · " + fmt(da.graus) + "°";
        caixa.style.display = "flex";
        if (!digitando && e) caixaPos(e.clientX, e.clientY);
        pr.ultBase = base; pr.ultP = p;
      }
      function caixaEsconder() { caixa.style.display = "none"; inComp.value = ""; inAng.value = ""; if (caixa.contains(document.activeElement)) document.activeElement.blur(); }
      function angRel(c, a, b) { var g = Pr().distAng(c, b).graus - Pr().distAng(c, a).graus; if (g > 180) g -= 360; if (g <= -180) g += 360; return g; }
      /* Enter na caixa: o ponto vem do que foi digitado; o que ficou vazio vem do cursor */
      function confirmarDigitado() {
        var base = pr.ultBase || baseAtual(), p = pr.ultP; if (!base) return false;
        var so = campos(), f = ferramenta();
        if (so === "ret") {
          var r = Pr().lerRetangulo(inComp.value); if (!r) { hint("Digite largura x profundidade, por exemplo 4x3."); return false; }
          var sx = p && p.x < base.x ? -1 : 1, sz = p && p.z < base.z ? -1 : 1;
          api.clique({ clientX: 0, clientY: 0, shiftKey: false }, null, V3({ x: base.x + sx * r.a, z: base.z + sz * r.b }));
          caixaEsconder(); return true;
        }
        var daCur = p ? Pr().distAng(base, p) : { dist: 0, graus: 0 };
        var d = inComp.value.trim() ? Pr().lerNumero(inComp.value) : daCur.dist, g = inAng.value.trim() ? Pr().lerAngulo(inAng.value) : null;
        if (d == null || !(d >= 0)) { hint("Comprimento inválido — use metros (2,50) ou 250 cm."); return false; }
        if (inAng.value.trim() && g == null) { hint("Ângulo inválido — use graus (30 ou −45)."); return false; }
        if (f === "girar") {
          if (g == null) { hint("Digite o ângulo do giro e Enter."); return false; }
          girarCom(g); caixaEsconder(); return true;
        }
        if (g == null) g = daCur.graus;
        var q = Pr().pontoPor(base, d, g);
        caixaEsconder();
        if (f) { passoComPonto(q); return true; }
        if (!(d > 0.01)) return false;
        if (edit.sub === "parede") api.concluirParede(V3(q));
        else api.clique({ clientX: 0, clientY: 0, shiftKey: false }, null, V3(q));
        return true;
      }
      caixa.addEventListener("keydown", function (e) {
        e.stopPropagation();   /* não aciona os atalhos do visualizador (WASD do voo, G da grade) */
        if (e.key === "Tab") { e.preventDefault(); var vis = [inComp, inAng].filter(function (i) { return i.parentNode.style.display !== "none"; }); if (vis.length > 1) (document.activeElement === vis[0] ? vis[1] : vis[0]).focus(); return; }
        if (e.key === "Enter") { e.preventDefault(); confirmarDigitado(); return; }
        if (e.key === "Escape") { e.preventDefault(); caixaEsconder(); cancelarPasso(); }
      });

      /* ------------------------------------------- barra de opções */
      function pintarOpcoes() {
        var f = ferramenta();
        if (!ativo() || !f) { opcoes.style.display = "none"; return; }
        pendurar();
        var h = '<b>' + esc(ROT_FERR[f]) + '</b>';
        if (f === "espelhar") h += '<label><input type="checkbox" data-bpo="copiaEsp"' + (pr.copiaEsp ? " checked" : "") + '> Manter o original</label>';
        if (f === "girar") h += '<label><input type="checkbox" data-bpo="copiaGir"' + (pr.copiaGir ? " checked" : "") + '> Copiar</label>';
        if (f === "matriz") {
          h += '<label>Tipo <select data-bpo="tipo"><option value="linear"' + (pr.mat.tipo === "linear" ? " selected" : "") + '>Linear</option><option value="polar"' + (pr.mat.tipo === "polar" ? " selected" : "") + '>Polar</option></select></label>' +
               '<label>Itens <input data-bpo="n" type="number" min="2" max="200" step="1" value="' + pr.mat.n + '"></label>' +
               (pr.mat.tipo === "polar" ? '<label>Ângulo total <input data-bpo="graus" inputmode="decimal" value="' + String(pr.mat.graus).replace(".", ",") + '">°</label>' : '');
        }
        /* P4 — a barra de opções das ferramentas novas */
        var q = pr.p4;
        if (f === "deslocar") h += '<label>Distância <input data-bpo="desl" inputmode="decimal" value="' + esc(fmt(q.desl)) + '"> m</label><label><input type="checkbox" data-bpo="deslCopia"' + (q.deslCopia ? " checked" : "") + '> Copiar</label>';
        if (f === "juntas") h += '<label>Junta <select data-bpo="juntaModo">' + MODOS_JUNTA.map(function (m) { return '<option value="' + m[0] + '"' + (q.juntaModo === m[0] ? " selected" : "") + '>' + m[1] + '</option>'; }).join("") + '</select></label>';
        if (f === "escala") h += '<label>Fator <input data-bpo="fator" inputmode="decimal" value="' + esc(String(q.fator).replace(".", ",")) + '"></label>';
        if (f === "pintar") {
          var mats = Pt() ? Pt().MATERIAIS : [], tem = mats.some(function (m) { return m.rotulo === q.material; });
          h += '<label>Material <select data-bpo="material">' + mats.map(function (m) { return '<option' + (m.rotulo === q.material ? " selected" : "") + '>' + esc(m.rotulo) + '</option>'; }).join("") +
               (tem ? "" : '<option selected>' + esc(q.material) + '</option>') + '</select></label>' +
               '<label>Composição <input data-bpo="codigo" inputmode="numeric" placeholder="código SINAPI (opcional)" value="' + esc(q.codigo) + '" style="width:9em"></label>';
        }
        if (f === "dividir-face") h += '<label>Altura do barrado <input data-bpo="barrado" inputmode="decimal" value="' + esc(fmt(q.barrado)) + '"> m</label>';
        var semSel = { cota: 1, alinhar: 1, deslocar: 1, aparar: 1, "aparar-varios": 1, dividir: 1, similar: 1, "corresp-tipo": 1, juntas: 1, "alternar-uniao": 1, "unir-geo": 1, "desunir-geo": 1, pintar: 1, "dividir-face": 1, "remover-pintura": 1 };
        h += '<span class="bp-sel" data-bp="nsel">' + (semSel[f] ? "" : (pr.sel.length ? pr.sel.length + " selecionado(s)" : "nada selecionado")) + '</span>';
        opcoes.innerHTML = h; opcoes.style.display = "flex";
      }
      opcoes.addEventListener("change", function (e) {
        var k = e.target.getAttribute("data-bpo"); if (!k) return;
        if (k === "copiaEsp") pr.copiaEsp = !!e.target.checked;
        else if (k === "copiaGir") pr.copiaGir = !!e.target.checked;
        else if (k === "tipo") { pr.mat.tipo = e.target.value === "polar" ? "polar" : "linear"; reiniciarPasso(); pintarOpcoes(); }
        else if (k === "n") { var n = Math.round(+e.target.value); pr.mat.n = Math.max(2, Math.min(200, isFinite(n) ? n : 3)); e.target.value = pr.mat.n; }
        else if (k === "graus") { var g = Pr().lerAngulo(e.target.value); if (g != null && g !== 0) pr.mat.graus = g; e.target.value = String(pr.mat.graus).replace(".", ","); }
        /* P4 */
        else if (k === "desl") { var dv = Pr().lerNumero(e.target.value); if (dv != null && dv > 0 && dv <= 100) pr.p4.desl = dv; e.target.value = fmt(pr.p4.desl); }
        else if (k === "deslCopia") pr.p4.deslCopia = !!e.target.checked;
        else if (k === "juntaModo") pr.p4.juntaModo = e.target.value;
        else if (k === "fator") { var fv = parseFloat(String(e.target.value).replace(",", ".")); if (isFinite(fv) && fv >= 0.01 && fv <= 100 && Math.abs(fv - 1) > 1e-9) pr.p4.fator = fv; e.target.value = String(pr.p4.fator).replace(".", ","); }
        else if (k === "material") pr.p4.material = e.target.value;
        else if (k === "codigo") pr.p4.codigo = String(e.target.value || "").trim().slice(0, 24);
        else if (k === "barrado") { var bv = Pr().lerNumero(e.target.value); if (bv != null && bv > 0 && bv <= 30) pr.p4.barrado = bv; e.target.value = fmt(pr.p4.barrado); }
      });
      opcoes.addEventListener("keydown", function (e) { e.stopPropagation(); });

      /* ------------------------------------------- painel de snaps */
      function pintarPainel() {
        painel.innerHTML = '<div class="bp-snaps-tit"><b>Snaps do editor</b><button type="button" class="btn sm" data-bps="fechar" aria-label="Fechar">Fechar</button></div>' +
          '<label class="bp-snaps-todos"><input type="checkbox" data-bps="on"' + (pr.snapOn ? " checked" : "") + '> Snaps ligados <span class="bp-tecla">F3</span></label>' +
          Pr().TIPOS.map(function (t) {
            return '<label class="bp-snaps-item"><input type="checkbox" data-bps="t" data-t="' + t + '"' + (pr.tipos[t] ? " checked" : "") + '><span class="bp-glifo" style="color:' + COR[t] + '">' + Pr().glifoSvg(t) + '</span> ' + esc(Pr().ROTULO[t]) + '</label>';
          }).join("") +
          '<label class="bp-snaps-grade">Passo da grade <input data-bps="grade" inputmode="decimal" value="' + String(pr.grade).replace(".", ",") + '"> m</label>' +
          '<div class="bp-snaps-nota">Prioridade: ponto (final, interseção, meio, centro) &gt; perpendicular &gt; extensão &gt; próximo &gt; grade.</div>';
      }
      painel.addEventListener("change", function (e) {
        var k = e.target.getAttribute("data-bps"); if (!k) return;
        if (k === "on") pr.snapOn = !!e.target.checked;
        else if (k === "t") pr.tipos[e.target.getAttribute("data-t")] = !!e.target.checked;
        else if (k === "grade") { var g = Pr().lerNumero(e.target.value); if (g != null && g >= 0 && g <= 10) pr.grade = g; e.target.value = String(pr.grade).replace(".", ","); }
        guardarPref();
      });
      painel.addEventListener("click", function (e) { var b = e.target.closest ? e.target.closest('[data-bps="fechar"]') : null; if (b) painel.style.display = "none"; });
      painel.addEventListener("keydown", function (e) { e.stopPropagation(); if (e.key === "Escape") painel.style.display = "none"; });
      function alternarSnaps() {
        pr.snapOn = !pr.snapOn; guardarPref();
        if (painel.style.display === "block") pintarPainel();
        if (!pr.snapOn) { api.marcaEsconder(); limparGrupo(grp); }
        hint(pr.snapOn ? "Snaps ligados (F3 desliga)." : "Snaps desligados (F3 liga): o ponto fica onde o cursor está.");
        return pr.snapOn;
      }

      /* --------------------------------------------- seleção */
      /* ⚠ a seleção é um CONTORNO, como o da seleção do visualizador: com a malha mesclada
         (o desenho usa a malha agregada, camada 0) trocar o material da peça às vezes não
         aparece na tela — a peça "selecionada" continuava bege. O contorno sempre aparece. */
      function realcar() {
        limparGrupo(selGrp);
        var mo = edit.modelo; if (!mo || !mo.grupo || !pr.sel.length) return;
        var s = {}; pr.sel.forEach(function (id) { s[id] = 1; });
        mo.grupo.children.forEach(function (m) {
          if (!s[m.userData.expressID] || !m.geometry) return;
          var ln = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), matSelLinha);
          ln.matrixAutoUpdate = false; ln.matrix.copy(m.matrixWorld); ln.renderOrder = 1000; ln.raycast = function () {};
          selGrp.add(ln);
        });
      }
      function existe(id) { return !!Pr().tipoNoEstado(estado(), id); }
      function selDefinir(ids) { pr.sel = ids.filter(existe); pr.geo = null; realcar(); montarTemporarias(); pintarOpcoes(); }
      function idDoHit() {
        var h = api.hits() && api.hits()[0]; var m = h && h.object;
        return m && m.userData && m.userData.mid === "edit" ? m.userData.expressID : null;
      }

      /* ------------------------------------ cotas temporárias e alças */
      function montarTemporarias() {
        camadaDom.innerHTML = ""; pr.cotasTmp = []; pr.alcas = [];
        limparGrupo(grp);
        var tmpL = grp.getObjectByName("tmp"); if (tmpL) grp.remove(tmpL);
        if (!ativo() || pr.sel.length !== 1 || ferramenta()) return;
        pendurar();
        var id = pr.sel[0], st = estado();
        pr.cotasTmp = Pr().cotasTemporarias(st, id, { avaliar: api.avaliar });
        pr.cotasTmp.forEach(function (c, i) {
          var b = el("button", "bp-cota-tmp", esc(fmt(c.valor)));
          b.type = "button"; b.setAttribute("data-bp-cota", String(i)); b.setAttribute("data-k", c.k);
          b.title = c.k === "comprimento" ? "Comprimento — clique e digite para esticar a ponta" : "Distância livre até o vizinho — clique e digite para mover";
          camadaDom.appendChild(b); c.dom = b;
        });
        var alvo = (st.caixas || []).filter(function (c) { return c.id === id; })[0];
        pr.alcas = alvo ? Pr().alcas(alvo) : [];
        pr.alcas.forEach(function (a, i) {
          var b = el("button", "bp-alca"); b.type = "button"; b.setAttribute("data-bp-alca", String(i));
          b.setAttribute("aria-label", "Alça para esticar — arraste, ou setas do teclado"); b.title = "Arraste para esticar (com snap). Setas: passo da grade.";
          camadaDom.appendChild(b); a.dom = b;
        });
        var l = segs(pr.cotasTmp.map(function (c) { return [c.de, c.ate]; }), matTmp, edit.base + 0.02); if (l) { l.name = "tmp"; grp.add(l); }
        posicionar();
      }
      function tela(p, y) {
        var v = V3(p, y).project(cam()), rc = api.canvas.getBoundingClientRect(), hr = host().getBoundingClientRect();
        return { x: (v.x + 1) / 2 * rc.width + (rc.left - hr.left), y: (1 - v.y) / 2 * rc.height + (rc.top - hr.top), fora: v.z > 1 || v.z < -1 };
      }
      function posicionar() {
        if (!pr.cotasTmp.length && !(pr.alcas && pr.alcas.length)) return;
        pr.cotasTmp.forEach(function (c) {
          if (!c.dom || c.dom.querySelector("input")) return;
          var t = tela({ x: (c.de.x + c.ate.x) / 2, z: (c.de.z + c.ate.z) / 2 }, edit.base + 0.02);
          c.dom.style.display = t.fora ? "none" : ""; c.dom.style.left = t.x + "px"; c.dom.style.top = t.y + "px";
        });
        (pr.alcas || []).forEach(function (a) {
          if (!a.dom) return;
          var p = pr.arrasto && pr.arrasto.k === a.k && pr.arrasto.p ? pr.arrasto.p : a.p, t = tela(p, edit.base + 0.02);
          a.dom.style.display = t.fora ? "none" : ""; a.dom.style.left = t.x + "px"; a.dom.style.top = t.y + "px";
        });
      }
      S._tickExtra.push(function () { if (camadaDom.childNodes.length) posicionar(); for (var i = 0; i < cotasGrp.children.length; i++) if (cotasGrp.children[i].isSprite) api.reescalar(cotasGrp.children[i]); });
      camadaDom.addEventListener("click", function (e) {
        var b = e.target.closest ? e.target.closest("[data-bp-cota]") : null; if (!b || b.querySelector("input")) return;
        var c = pr.cotasTmp[+b.getAttribute("data-bp-cota")]; if (!c) return;
        b.innerHTML = '<input data-bp="cota-in" inputmode="decimal" value="' + esc(fmt(c.valor)) + '" aria-label="Novo valor da cota em metros">';
        var inp = b.querySelector("input"); inp.focus(); inp.select();
        inp.addEventListener("keydown", function (ev) {
          ev.stopPropagation();
          if (ev.key === "Escape") { ev.preventDefault(); montarTemporarias(); return; }
          if (ev.key !== "Enter") return;
          ev.preventDefault();
          var v = Pr().lerNumero(inp.value);
          var op = v != null ? Pr().opDaCota(estado(), pr.sel[0], c, v) : null;
          if (!op) { hint("Valor inválido para esta cota."); return; }
          api.op(op);
          hint(c.k === "comprimento" ? "Comprimento ajustado para " + fmt(v) + " m (Ctrl+Z desfaz)." : "Movido: a distância agora é " + fmt(v) + " m (Ctrl+Z desfaz).");
        });
      });
      /* alças: arrastar com o mouse (snap ligado) ou setas no teclado */
      camadaDom.addEventListener("pointerdown", function (e) {
        var b = e.target.closest ? e.target.closest("[data-bp-alca]") : null; if (!b) return;
        var a = pr.alcas[+b.getAttribute("data-bp-alca")]; if (!a) return;
        e.preventDefault(); e.stopPropagation();
        try { b.setPointerCapture(e.pointerId); } catch (eC) {}
        pr.arrasto = { id: pr.sel[0], k: a.k, p: a.p, p0: a.p, b: b }; pr.geo = null;
      });
      camadaDom.addEventListener("pointermove", function (e) {
        if (!pr.arrasto) return;
        var sp = pontoSnap(e, null); if (!sp) return;
        pr.arrasto.p = sp.p; mostrarMarca(sp); posicionar();
      });
      function soltarAlca(e) {
        if (!pr.arrasto) return;
        var a = pr.arrasto; pr.arrasto = null; pr.geo = null;
        try { a.b.releasePointerCapture(e.pointerId); } catch (eR) {}
        api.marcaEsconder();
        if (!a.p || (Math.abs(a.p.x - a.p0.x) < 1e-6 && Math.abs(a.p.z - a.p0.z) < 1e-6)) { posicionar(); return; }   /* soltou sem arrastar */
        api.op({ op: "esticar", id: a.id, ponta: a.k, x: Math.round(a.p.x * 10000) / 10000, z: Math.round(a.p.z * 10000) / 10000 });
        hint("Esticado (Ctrl+Z desfaz).");
      }
      camadaDom.addEventListener("pointerup", soltarAlca);
      camadaDom.addEventListener("pointercancel", function () { pr.arrasto = null; posicionar(); });
      camadaDom.addEventListener("keydown", function (e) {
        var b = e.target.closest ? e.target.closest("[data-bp-alca]") : null; if (!b) return;
        var a = pr.alcas[+b.getAttribute("data-bp-alca")], el0 = (estado().caixas || []).filter(function (c) { return c.id === pr.sel[0]; })[0];
        if (!a || !el0) return;
        var passo = pr.grade > 0 ? pr.grade : 0.05, u = { x: Math.cos(el0.rotY), z: -Math.sin(el0.rotY) }, n = { x: Math.sin(el0.rotY), z: Math.cos(el0.rotY) }, d = null;
        if (typeof a.k === "string") { var sg = a.k === "b" ? 1 : -1; if (e.key === "ArrowRight" || e.key === "ArrowUp") d = { x: u.x * passo * sg, z: u.z * passo * sg }; if (e.key === "ArrowLeft" || e.key === "ArrowDown") d = { x: -u.x * passo * sg, z: -u.z * passo * sg }; }
        else { if (e.key === "ArrowRight") d = { x: u.x * passo, z: u.z * passo }; if (e.key === "ArrowLeft") d = { x: -u.x * passo, z: -u.z * passo }; if (e.key === "ArrowUp") d = { x: -n.x * passo, z: -n.z * passo }; if (e.key === "ArrowDown") d = { x: n.x * passo, z: n.z * passo }; }
        if (!d) return;
        e.preventDefault(); e.stopPropagation();
        var k = a.k, idx = +b.getAttribute("data-bp-alca");
        api.op({ op: "esticar", id: pr.sel[0], ponta: k, x: Math.round((a.p.x + d.x) * 10000) / 10000, z: Math.round((a.p.z + d.z) * 10000) / 10000 });
        var nb = camadaDom.querySelector('[data-bp-alca="' + idx + '"]'); if (nb) nb.focus();
      });

      /* --------------------------------------------- ferramentas */
      function reiniciarPasso() {
        var f = ferramenta(); pr.pts = [];
        pr.p4.ref = null; pr.p4.a = null; pr.p4.fonte = null; pr.p4.pts = [];   /* P4: o que a ferramenta tinha pegado */
        if (!f) { pr.passo = null; return; }
        var ps = PASSOS[f];
        pr.passo = (ps[0] === "sel" && pr.sel.length) ? ps[1] : ps[0];
        if (f === "matriz" && pr.mat.tipo === "polar" && pr.passo === "base") pr.passo = "centro";
        /* EMBREVE (Igualar tipo, 09/10/2026): com UMA peça já selecionada, ela é a origem — o próximo clique já é o alvo */
        if (f === "corresp-tipo" && pr.sel.length === 1) { pr.p4.fonte = pr.sel[0]; pr.passo = "alvoT"; }
        hint(ROT_FERR[f] + ": " + DICA[pr.passo]);
        pintarOpcoes();
      }
      function cancelarPasso() {
        if (!ferramenta()) return false;
        var tinha = pr.pts.length > 0;
        limparGrupo(grp); caixaEsconder(); reiniciarPasso();
        return tinha;
      }
      function proximo() {
        var f = ferramenta(), ps = PASSOS[f], i = ps.indexOf(pr.passo);
        if (f === "matriz" && pr.mat.tipo === "polar") { pr.passo = pr.passo === "sel" ? "centro" : "centro"; }
        else pr.passo = ps[i + 1];
        hint(ROT_FERR[f] + ": " + DICA[pr.passo]); pintarOpcoes();
      }
      function aplicarResultado(r, msg) {
        if (!r || r.erro) { hint((r && r.erro) || "Não deu para aplicar."); return false; }
        api.op(r.op); hint(msg + " (Ctrl+Z desfaz.)"); api.fechou(); return true;
      }
      function girarCom(graus) {
        var c = pr.pts[0]; if (!c) return;
        var T = { tipo: "girar", cx: c.x, cz: c.z, graus: Math.round(graus * 10000) / 10000 };
        if (aplicarResultado(Pr().opTransformar(estado(), pr.sel, T, pr.copiaGir, nid), (pr.copiaGir ? "Copiado e girado " : "Girado ") + fmt(graus) + "°")) { limparGrupo(grp); reiniciarPasso(); }
      }
      /* um ponto (clicado ou digitado) entra no passo atual da ferramenta */
      function passoComPonto(p) {
        var f = ferramenta(), st = estado(); if (!f) return;
        if (pr.passo === "base" || pr.passo === "eixo1" || pr.passo === "p1" || pr.passo === "centro") {
          pr.pts = [p];
          if (f === "matriz" && pr.mat.tipo === "polar") {
            aplicarResultado(Pr().opMatriz(st, pr.sel, { tipo: "polar", n: pr.mat.n, cx: p.x, cz: p.z, graus: pr.mat.graus }, nid), "Matriz polar: " + pr.mat.n + " itens em " + fmt(pr.mat.graus) + "°");
            reiniciarPasso(); return;
          }
          proximo(); return;
        }
        if (pr.passo === "destino") {
          var b = pr.pts[0], T = { tipo: "mover", dx: Math.round((p.x - b.x) * 10000) / 10000, dz: Math.round((p.z - b.z) * 10000) / 10000 };
          if (Math.abs(T.dx) + Math.abs(T.dz) < 1e-6) { hint("O destino é o próprio ponto base."); return; }
          if (f === "matriz") aplicarResultado(Pr().opMatriz(st, pr.sel, { tipo: "linear", n: pr.mat.n, dx: T.dx, dz: T.dz }, nid), "Matriz linear: " + pr.mat.n + " itens a cada " + fmt(Math.sqrt(T.dx * T.dx + T.dz * T.dz)) + " m");
          else aplicarResultado(Pr().opTransformar(st, pr.sel, T, f === "copiar", nid), (f === "copiar" ? "Copiado" : "Movido") + " " + fmt(Math.sqrt(T.dx * T.dx + T.dz * T.dz)) + " m");
          limparGrupo(grp); reiniciarPasso(); return;
        }
        if (pr.passo === "eixo2") {
          var a = pr.pts[0];
          if (Math.abs(p.x - a.x) + Math.abs(p.z - a.z) < 1e-6) { hint("O eixo precisa de dois pontos diferentes."); return; }
          aplicarResultado(Pr().opTransformar(st, pr.sel, { tipo: "espelhar", ax: a.x, az: a.z, bx: p.x, bz: p.z }, pr.copiaEsp, nid), pr.copiaEsp ? "Espelhado (original mantido)" : "Espelhado");
          limparGrupo(grp); reiniciarPasso(); return;
        }
        if (pr.passo === "ref") { pr.pts[1] = p; proximo(); return; }
        if (pr.passo === "final") { girarCom(angRel(pr.pts[0], pr.pts[1], p)); return; }
        if (pr.passo === "p2") {
          if (Math.abs(p.x - pr.pts[0].x) + Math.abs(p.z - pr.pts[0].z) < 1e-6) { hint("Os dois pontos da cota são o mesmo."); return; }
          pr.pts[1] = p; proximo(); return;
        }
        if (pr.passo === "pos") criarCota(Pr().offsetCota(pr.pts[0], pr.pts[1], p));
      }
      /* ------------------------------------------------ P4: as ferramentas novas
         Cada clique pega a PEÇA (idDoHit), a LINHA (segmento de snap mais perto)
         ou o PONTO (com snap); a conta e a op são do js/bimprecisao.js (puro),
         a face pintada do js/bimpintar.js. */
      function irPara(passo) { pr.passo = passo; hint(ROT_FERR[ferramenta()] + ": " + DICA[passo]); pintarOpcoes(); }
      function pontoDoHit() { var h = api.hits() && api.hits()[0]; return h && h.point ? { x: h.point.x, y: h.point.y, z: h.point.z } : null; }
      function caixaDe(st, id) { return (st.caixas || []).filter(function (c) { return c.id === id; })[0] || null; }
      function aplicarP4(r, msg, ficar) {
        if (!r || r.erro) { hint((r && r.erro) || "Não deu para aplicar."); return false; }
        api.op(r.op); hint(msg + " (Ctrl+Z desfaz.)"); api.fechou();
        if (!ficar) reiniciarPasso();
        return true;
      }
      function passoP4(e, hit) {
        var f = ferramenta(), st = estado(), passo = pr.passo, q = pr.p4;
        var sp = pontoSnap(e, hit), p = sp ? sp.p : null, id = idDoHit(), tol = sp ? Math.max(sp.tol, 0.08) : 0.3;
        limparGrupo(grp); caixaEsconder();
        if (passo === "linhaRef") {
          var sr = p && Pr().segmentoPerto(st, p, tol, { avaliar: api.avaliar });
          if (!sr) { hint("Não achei linha perto do clique: clique numa face, no eixo de uma parede ou num eixo da grade."); return true; }
          q.ref = sr; pr.pts = [p]; irPara(f === "alinhar" ? "linhaAlvo" : "alvoV"); return true;
        }
        if (passo === "linhaAlvo") {
          var sa = p && Pr().segmentoPerto(st, p, tol, { avaliar: api.avaliar, excluir: q.ref && q.ref.id != null ? [q.ref.id] : [] });
          if (!sa || sa.id == null) { hint("Clique a linha de uma peça criada no OrçaPRO."); return true; }
          aplicarP4(Pr().opAlinhar(st, q.ref, sa), "Alinhado"); return true;
        }
        if (passo === "alvoV") {
          if (id == null || !p) { hint(DICA.alvoV); return true; }
          aplicarP4(Pr().opAparoAte(st, q.ref, { id: id, p: p }), "Aparado/estendido até a referência", true); return true;
        }
        if (passo === "alvoD") {
          if (id == null || !p) { hint(DICA.alvoD); return true; }
          aplicarP4(Pr().opDeslocamento(st, id, q.desl, p, q.deslCopia, nid), (q.deslCopia ? "Cópia deslocada " : "Deslocada ") + fmt(q.desl) + " m", true); return true;
        }
        if (passo === "pecaA") { if (id == null || !p) { hint(DICA.pecaA); return true; } q.a = { id: id, p: p }; pr.pts = [p]; irPara("pecaB"); return true; }
        if (passo === "pecaB") { if (id == null || !p) { hint(DICA.pecaB); return true; } aplicarP4(Pr().opAparoCanto(st, q.a, { id: id, p: p }, nid), "Canto fechado"); return true; }
        if (passo === "pontoDiv") { if (id == null || !p) { hint(DICA.pontoDiv); return true; } aplicarP4(Pr().opDividir(st, id, p, nid), "Dividida em duas", true); return true; }
        if (passo === "pecaF") { if (id == null) { hint(DICA.pecaF); return true; } aplicarP4(Pr().opFixar(st, [id], f === "fixar"), f === "fixar" ? "Fixada" : "Desafixada", true); return true; }
        if (passo === "fonte") {
          if (id == null) { hint("Clique numa peça criada no OrçaPRO."); return true; }
          q.fonte = id; pr.pts = [p || { x: 0, z: 0 }];
          if (f === "corresp-tipo") { irPara("alvoT"); return true; }
          var np = Pr().pontosSimilar((st.caixas || []).concat(st.familias || []).filter(function (x) { return x.id === id; })[0]);
          if (!np) { var r0 = Pr().opSimilar(st, id, [], nid); hint(r0.erro || "Esta peça não tem Criar similar."); q.fonte = null; pr.pts = []; return true; }
          q.pts = []; irPara("pS1"); return true;
        }
        if (passo === "pS1" || passo === "pS2") {
          if (!p) return true;
          q.pts.push(p);
          var el0 = (st.caixas || []).concat(st.familias || []).filter(function (x) { return x.id === q.fonte; })[0], need = Pr().pontosSimilar(el0);
          if (q.pts.length < need) { pr.pts = [p]; irPara("pS2"); return true; }
          var fonte = q.fonte, rs = Pr().opSimilar(st, fonte, q.pts, nid);
          if (aplicarP4(rs, "Peça similar criada", true)) { q.pts = []; pr.pts = []; irPara("pS1"); q.fonte = fonte; }
          else { q.pts = []; irPara("pS1"); }
          return true;
        }
        if (passo === "alvoT") { if (id == null) { hint(DICA.alvoT); return true; } aplicarP4(Pr().opCorresponderTipo(st, q.fonte, id, nid), "Tipo correspondido", true); return true; }
        if (passo === "baseE") { if (!p) return true; aplicarP4(Pr().opEscala(st, pr.sel, p, q.fator), "Escala " + String(q.fator).replace(".", ",") + "×"); return true; }
        if (passo === "canto") {
          var ct = p && Pr().cantoPerto(st, p, 1.2);
          if (!ct) { hint("Não achei canto de duas paredes perto do clique."); return true; }
          var A0 = caixaDe(st, ct.a), B0 = caixaDe(st, ct.b), dono = String(ct.a) < String(ct.b) ? A0 : B0, outro = dono === A0 ? B0 : A0;
          aplicarP4({ op: { op: "ajustar", id: dono.id, campos: { uniao: { com: outro.id, modo: q.juntaModo } } } }, "Junta: " + MODOS_JUNTA.filter(function (m) { return m[0] === q.juntaModo; })[0][1], true);
          return true;
        }
        if (passo === "pecaU1") {
          var cid = id != null ? caixaDe(st, id) : null;
          if (f === "alternar-uniao" && p && (!cid || cid.tipo === "parede")) {
            var c2 = Pr().cantoPerto(st, p, 0.8);
            if (c2) { aplicarP4({ op: { op: "alternarUniao", a: c2.a, b: c2.b } }, "Ordem de união alternada: agora passa a outra parede", true); return true; }
          }
          if (id == null) { hint(DICA.pecaU1); return true; }
          q.a = { id: id, p: p }; pr.pts = [p || { x: 0, z: 0 }]; irPara("pecaU2"); return true;
        }
        if (passo === "pecaU2") {
          if (id == null || !q.a) { hint(DICA.pecaU2); return true; }
          if (id === q.a.id) { hint("Clique OUTRA peça."); return true; }
          var opU = { alternarUniao: "alternarUniao", "unir-geo": "unirGeometria", "desunir-geo": "desunirGeometria", "alternar-uniao": "alternarUniao" }[f];
          aplicarP4({ op: { op: opU, a: q.a.id, b: id } }, { alternarUniao: "Ordem de união alternada", unirGeometria: "Unidas (a de maior prioridade corta a outra)", desunirGeometria: "Desunidas" }[opU]);
          return true;
        }
        if (passo === "face") {
          var cf = id != null ? caixaDe(st, id) : null, P3 = pontoDoHit(), BP = Pt();
          if (!cf || !P3 || !BP) { hint("Clique na face de uma parede ou laje criada no OrçaPRO."); return true; }
          var fd = BP.faceDoPonto(cf, P3);
          if (!fd || !(BP.FACES[cf.tipo] || []).length) { hint("Pintar vale para a face da parede (externa/interna) e da laje (superior/inferior)."); return true; }
          if (f === "pintar") {
            var o = { op: "pintar", id: id, face: fd.face, regiao: fd.regiao, material: q.material };
            if (q.codigo) o.codigo = q.codigo;
            aplicarP4({ op: o }, BP.ROTULO_FACE[fd.face] + " pintada: " + q.material, true);
          } else if (f === "dividir-face") {
            if (cf.tipo !== "parede") { hint("Dividir face (barrado) vale para a face da parede."); return true; }
            var atual = ((cf.divFaces || {})[fd.face] || []).slice();
            if (atual.some(function (h0) { return Math.abs(h0 - q.barrado) < 1e-3; })) { hint("A face já está dividida a " + fmt(q.barrado) + " m."); return true; }
            atual.push(q.barrado); atual.sort(function (x, y) { return x - y; });
            aplicarP4({ op: { op: "dividirFace", id: id, face: fd.face, alturas: atual } }, BP.ROTULO_FACE[fd.face] + " dividida a " + fmt(q.barrado) + " m", true);
          } else aplicarP4({ op: { op: "removerPintura", id: id, face: fd.face, regiao: fd.regiao } }, "Pintura removida", true);
          return true;
        }
        return false;
      }
      /* o material pintado no 3D: uma película 3 mm fora da face, com os vãos furados */
      function desenharPinturas(st) {
        limparGrupo(pintGrp);
        var BP = Pt(); if (!previa() || !BP || !global.BimArq) return;
        var cxs = (st.caixas || []).filter(function (c) { return c && c.pinturas; }); if (!cxs.length) return;
        var vz = {}; try { vz = global.BimEdit.vaosDasParedes(st, api.avaliar) || {}; } catch (eV) { vz = {}; }
        cxs.forEach(function (c) {
          BP.regioes(c, vz[c.id] ? vz[c.id].aceitos : null).forEach(function (r) {
            var d = BP.desenhoRegiao(c, r.face, r.regiao, vz[c.id] ? vz[c.id].aceitos : null); if (!d) return;
            var mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(r.cor), side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
            var g = null;
            if (d.laje) {
              var C = c.contorno ? c.contorno.map(function (q) { return [q.x, q.z]; }) : (function () { var f = global.BimArq.frameDe(c); return [[-f.L / 2, -f.t / 2], [f.L / 2, -f.t / 2], [f.L / 2, f.t / 2], [-f.L / 2, f.t / 2]].map(function (q) { return global.BimArq.aMundo(f, q[0], q[1]); }); })();
              var sh = new THREE.Shape(C.map(function (q) { return new THREE.Vector2(q[0], q[1]); }));
              (c.furos || []).forEach(function (F) { sh.holes.push(new THREE.Path(F.pts.map(function (q) { return new THREE.Vector2(q.x, q.z); }))); });
              g = new THREE.ShapeGeometry(sh);
              var pos = g.attributes.position; for (var i = 0; i < pos.count; i++) { var x = pos.getX(i), y = pos.getY(i); pos.setXYZ(i, x, d.y, y); }
            } else {
              var sh2 = new THREE.Shape(d.poli.map(function (q) { return new THREE.Vector2(q[0], q[1]); }));
              d.furos.forEach(function (F) { sh2.holes.push(new THREE.Path(F.map(function (q) { return new THREE.Vector2(q[0], q[1]); }))); });
              g = new THREE.ShapeGeometry(sh2);
              var ps = g.attributes.position; for (var j = 0; j < ps.count; j++) { var u = ps.getX(j), yy = ps.getY(j), w3 = global.BimArq.aMundo(d.frame, u, d.w); ps.setXYZ(j, w3[0], yy, w3[1]); }
            }
            g.computeBoundingSphere();
            var m = new THREE.Mesh(g, mat); m.renderOrder = 2; m.userData = { p4Pintura: c.id, face: r.face, regiao: r.regiao }; m.raycast = function () {};
            pintGrp.add(m);
          });
        });
      }
      function criarCota(off) {
        var r = Pr().opCota(V3(pr.pts[0]), V3(pr.pts[1]), off, nid("e"));
        if (aplicarResultado(r, "Cota de " + fmt(Pr().distAng(pr.pts[0], pr.pts[1]).dist) + " m gravada")) { limparGrupo(grp); reiniciarPasso(); }
      }
      /* fantasma: a pegada do que vai mudar, já transformada */
      function fantasma(p) {
        var f = ferramenta(), T = null;
        if ((pr.passo === "destino") && pr.pts[0]) T = { tipo: "mover", dx: p.x - pr.pts[0].x, dz: p.z - pr.pts[0].z };
        else if (pr.passo === "eixo2" && pr.pts[0] && (Math.abs(p.x - pr.pts[0].x) + Math.abs(p.z - pr.pts[0].z)) > 1e-6) T = { tipo: "espelhar", ax: pr.pts[0].x, az: pr.pts[0].z, bx: p.x, bz: p.z };
        else if (pr.passo === "final" && pr.pts[1]) T = { tipo: "girar", cx: pr.pts[0].x, cz: pr.pts[0].z, graus: angRel(pr.pts[0], pr.pts[1], p) };
        var linhas = [];
        if (pr.pts[0] && pr.passo !== "pos") linhas.push([pr.pts[0], p]);
        if (pr.passo === "pos" && pr.pts[1]) { var dc = Pr().desenhoCota({ a: pr.pts[0], b: pr.pts[1], off: Pr().offsetCota(pr.pts[0], pr.pts[1], p) }); if (dc) linhas.push([dc.l1, dc.l2], dc.e1, dc.e2); }
        if (pr.passo === "final" && pr.pts[1]) linhas.push([pr.pts[0], pr.pts[1]]);
        var l = segs(linhas, matLinha, edit.base + 0.02); if (l) grp.add(l);
        if (!T || f === "cota" || !pr.sel.length) return;
        var Ts = f === "matriz" ? Pr().passosMatriz({ tipo: "linear", n: pr.mat.n, dx: T.dx, dz: T.dz }) : [T], ar = [], st = estado();
        var geoS = Pr().geometria(st, {}).els.filter(function (g) { return pr.sel.indexOf(g.id) >= 0; });
        Ts.forEach(function (Tk) { geoS.forEach(function (g) { g.segs.forEach(function (s) { if (s.k !== "eixo") ar.push([Pr().ponto(s.a, Tk), Pr().ponto(s.b, Tk)]); }); }); });
        var lf = segs(ar, matFant, edit.base + 0.03); if (lf) grp.add(lf);
      }
      /* rubber band das ferramentas de sempre (parede, viga, laje, cobertura) */
      function elastico(p) {
        if (!edit.p1) return;
        var b = { x: edit.p1.x, z: edit.p1.z }, ls;
        if (edit.sub === "laje" || edit.sub === "cobertura") ls = [[b, { x: p.x, z: b.z }], [{ x: p.x, z: b.z }, p], [p, { x: b.x, z: p.z }], [{ x: b.x, z: p.z }, b]];
        else ls = [[b, p]];
        var l = segs(ls, matLinha, edit.base + 0.02); if (l) grp.add(l);
      }

      /* --------------------------------------------- cotas permanentes 3D */
      function desenharCotas(st) {
        limparGrupo(cotasGrp);
        if (!previa()) return;
        (st.cotas || []).forEach(function (c) {
          var dc = Pr().desenhoCota(c); if (!dc) return;
          var y = (+c.a.y || 0) + 0.02, tk = 0.12, t1 = [];
          /* tique oblíquo nas duas pontas, como na prancha */
          var ux = (dc.l2.x - dc.l1.x) / dc.valor, uz = (dc.l2.z - dc.l1.z) / dc.valor;
          [dc.l1, dc.l2].forEach(function (q) { t1.push([{ x: q.x - (ux + dc.nx) * tk / 2, z: q.z - (uz + dc.nz) * tk / 2 }, { x: q.x + (ux + dc.nx) * tk / 2, z: q.z + (uz + dc.nz) * tk / 2 }]); });
          var ls = segs([[dc.l1, dc.l2], dc.e1, dc.e2].concat(t1), matCota, y); if (ls) { ls.userData.cotaId = c.id; cotasGrp.add(ls); }
          var sp = api.rotulo(fmt(dc.valor) + " m", "#1f6fb2");
          sp.position.set(dc.meio.x + dc.nx * 0.18, y, dc.meio.z + dc.nz * 0.18); sp.userData.cotaId = c.id;
          cotasGrp.add(sp); api.reescalar(sp);
        });
      }

      /* --------------------------------------------- teclado */
      function digitandoFora(t) { return t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || "") || t.isContentEditable) && !caixa.contains(t); }
      document.addEventListener("keydown", function (e) {
        if (!ativo()) return;
        var alvo = e.target || {};
        if (digitandoFora(alvo) || caixa.contains(alvo)) return;
        if (e.key === "F3") { e.preventDefault(); e.stopPropagation(); alternarSnaps(); return; }
        /* Esc, um passo por vez: 1) desfaz o ponto já clicado; 2) sai da
           ferramenta (o editor continua aberto); 3) limpa a seleção; 4) só então o Esc de
           sempre (fecha o editor). Parede/viga com o traço aberto: o Esc de sempre encerra o traço. */
        if (e.key === "Escape") {
          if (pr.arrasto) { pr.arrasto = null; posicionar(); e.stopPropagation(); return; }
          if (ferramenta() && pr.pts.length) { e.preventDefault(); e.stopPropagation(); cancelarPasso(); hint("Passo cancelado. Esc de novo sai da ferramenta."); return; }
          if (edit.sub && !edit.p1) {
            e.preventDefault(); e.stopPropagation(); api.desarmar();
            try { if (global.BimRibbon) global.BimRibbon.desligarTodas(); if (global.BimShell && global.BimShell.pintarFita) global.BimShell.pintarFita(); } catch (eR) {}
            hint("Ferramenta encerrada. Esc de novo " + (pr.sel.length ? "limpa a seleção." : "fecha o editor.")); return;
          }
          if (!edit.sub && pr.sel.length) { e.preventDefault(); e.stopPropagation(); selDefinir([]); return; }
          return;
        }
        if (e.key === "Enter") {
          var f = ferramenta();
          if (f && pr.passo === "sel" && pr.sel.length) { e.preventDefault(); e.stopPropagation(); proximo(); return; }
          if (f === "cota" && pr.passo === "pos") { e.preventDefault(); e.stopPropagation(); criarCota(0.5); return; }
          if (baseAtual() && (inComp.value || inAng.value)) { e.preventDefault(); e.stopPropagation(); confirmarDigitado(); return; }
          return;
        }
        if ((e.key === "Delete" || e.key === "Del") && !edit.sub && pr.sel.length) {
          e.preventDefault(); e.stopPropagation();
          var stD = estado(), fix = pr.sel.filter(function (id) { return Pr().fixado(stD, id); }), lib = pr.sel.filter(function (id) { return fix.indexOf(id) < 0; });   /* P4: fixada não sai */
          lib.forEach(function (id) { api.op({ op: "apagar", id: id }); });
          hint(lib.length + " elemento(s) apagado(s) (Ctrl+Z desfaz um por vez)." + (fix.length ? " " + fix.length + " fixado(s) ficou(aram): use Desafixar antes." : "")); return;
        }
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        /* número com um traço em andamento: vai direto para a caixa */
        if (baseAtual() && /^[0-9.,-]$/.test(e.key)) {
          e.preventDefault(); e.stopPropagation();
          var alvoIn = campos() === "ang" ? inAng : inComp;
          if (caixa.style.display === "none" && pr.ultP) caixaMostrar(null, baseAtual(), pr.ultP);
          caixa.style.display = "flex"; alvoIn.focus(); alvoIn.value += e.key; return;
        }
        /* atalhos de duas letras (convenção de mercado): MV, CO, MM, RO, AR, DI, WA */
        if (/^[a-zA-Z]$/.test(e.key)) {
          var agora = Date.now(), k = e.key.toUpperCase();
          pr.tecla = (agora - pr.teclaT < 1200 ? pr.tecla : "") + k; pr.teclaT = agora;
          var sub = Pr().ATALHOS[pr.tecla.slice(-2)];
          if (sub) { e.preventDefault(); e.stopPropagation(); pr.tecla = ""; if (edit.sub !== sub) api.armar(sub); return; }
        }
      }, true);

      /* --------------------------------------------- o que bim.js chama */
      var self = {
        ativo: ativo,
        /* pointermove do canvas: true = tratado aqui (o handler de sempre sai) */
        mover: function (e) {
          if (!ativo()) return false;
          pendurar();
          if (!edit.sub) { if (!pr.cotasTmp.length) api.marcaEsconder(); return true; }
          if (edit.sub === "apagar" || edit.sub === "anotar") return false;   /* elas não usam ponto do plano: o de sempre */
          if (edit.sub === "familia") api.ghost(e);
          var hit = api.raycast(e.clientX, e.clientY);
          var sp = pontoSnap(e, hit); if (!sp) return true;
          pr.ult = sp;
          mostrarMarca(sp);
          var base = baseAtual(), pv = sp.p;
          /* parede e viga: a trava orto/ângulo do editor de sempre (botão Orto, ∠) vale também aqui */
          if (!ferramenta() && edit.p1 && (edit.sub === "parede" || edit.sub === "viga")) { var q = api.ajustar(V3(sp.p), e); pv = { x: q.x, z: q.z }; }
          if (ferramenta()) { if (pr.passo !== "sel") fantasma(sp.p); }
          else if (edit.p1) elastico(pv);
          if (base && pr.passo !== "pos") caixaMostrar(e, base, pv);
          else if (!caixa.contains(document.activeElement)) caixa.style.display = "none";
          return true;
        },
        /* clique do editor: true = consumido aqui; Vector3 = o ponto (com snap) para a ferramenta de sempre; null = a de sempre decide */
        clique: function (e, hit) {
          if (!ativo()) return null;
          var f = ferramenta();
          if (!f) {
            if (!edit.sub || edit.sub === "apagar" || edit.sub === "anotar") return null;
            var sp0 = pontoSnap(e, hit); if (!sp0) return null;
            caixaEsconder(); limparGrupo(grp);
            return V3(sp0.p);
          }
          if (pr.passo === "sel") {
            var id = idDoHit();
            if (id == null) { hint("Só elemento CRIADO no OrçaPRO se transforma (o IFC importado não muda)."); return true; }
            var ja = pr.sel.indexOf(id) >= 0;
            selDefinir(e.ctrlKey || e.metaKey || e.shiftKey ? (ja ? pr.sel.filter(function (x) { return x !== id; }) : pr.sel.concat([id])) : [id]);
            if (!(e.ctrlKey || e.metaKey || e.shiftKey)) proximo();
            else hint(ROT_FERR[f] + ": " + pr.sel.length + " selecionado(s). Enter segue.");
            return true;
          }
          if (P4[pr.passo]) return passoP4(e, hit);   /* P4: peça, linha, face ou canto */
          var sp = pontoSnap(e, hit); if (!sp) { hint("Não achei o ponto no plano de trabalho."); return true; }
          limparGrupo(grp); caixaEsconder();
          passoComPonto(sp.p);
          return true;
        },
        /* PLANTA (js/bimplantamodelar.js): o clique da planta 2D nas ferramentas desta fase — o ponto
           já vem com snap e ângulo, a peça (passo "seleção") vem pela pegada na planta */
        cliquePlanta: function (p, alvoId, mods) {
          if (!ativo()) return false;
          var f = ferramenta(); if (!f) return false;
          mods = mods || {};
          if (pr.passo === "sel") {
            if (alvoId == null || !existe(alvoId)) { hint("Só elemento CRIADO no OrçaPRO se transforma (o IFC importado não muda)."); return true; }
            var ja = pr.sel.indexOf(alvoId) >= 0, soma = !!(mods.ctrl || mods.shift);
            selDefinir(soma ? (ja ? pr.sel.filter(function (x) { return x !== alvoId; }) : pr.sel.concat([alvoId])) : [alvoId]);
            if (!soma) proximo(); else hint(ROT_FERR[f] + ": " + pr.sel.length + " selecionado(s). Enter segue.");
            return true;
          }
          if (P4[pr.passo]) { hint(ROT_FERR[f] + ": esta etapa pega a face/linha da peça na vista 3D."); return true; }
          limparGrupo(grp); caixaEsconder(); passoComPonto(p);
          return true;
        },
        /* o ponto base do passo atual (a planta mede o ângulo a partir dele) */
        basePlanta: function () { return ativo() ? baseAtual() : null; },
        /* clique sem ferramenta: seleciona a peça do editor (Ctrl/Shift soma) */
        selecionar: function (e, hit) {
          if (!ativo()) return;
          var id = hit ? idDoHit() : null;
          if (id == null) { if (pr.sel.length) selDefinir([]); return; }
          var ja = pr.sel.indexOf(id) >= 0;
          selDefinir(e && (e.ctrlKey || e.metaKey || e.shiftKey) ? (ja ? pr.sel.filter(function (x) { return x !== id; }) : pr.sel.concat([id])) : [id]);
          if (pr.sel.length === 1 && pr.cotasTmp.length) hint("Clique numa cota para mudar a distância; arraste as alças para esticar. Delete apaga; CO copia, MV move, RO gira, MM espelha.");
        },
        /* o modelo foi refeito (op nova, desfazer, refazer, reabrir) */
        aposRebuild: function (st) {
          pr.geo = null;
          pr.sel = pr.sel.filter(function (id) { return !!Pr().tipoNoEstado(st, id); });
          realcar(); desenharCotas(st); montarTemporarias(); pintarOpcoes();
          try { desenharPinturas(st); } catch (eP) {}   /* P4 */
        },
        aoSub: function (sub) {
          pr.pts = []; caixaEsconder(); limparGrupo(grp);
          if (!ativo()) {   /* editor desligado: a seleção sai e a peça volta à cor dela */
            pr.sel = []; realcar(); pr.passo = null;
            opcoes.style.display = "none"; painel.style.display = "none"; camadaDom.innerHTML = ""; pr.cotasTmp = []; pr.alcas = []; return;
          }
          if (PASSOS[sub]) reiniciarPasso(); else { pr.passo = null; pintarOpcoes(); }
          /* P4: Fixar/Desafixar com peça já selecionada vale na hora */
          if ((sub === "fixar" || sub === "desafixar") && pr.sel.length) {
            var rF = Pr().opFixar(estado(), pr.sel, sub === "fixar");
            if (rF.op) { api.op(rF.op); hint((sub === "fixar" ? "Fixada(s): " : "Desafixada(s): ") + rF.op.ids.length + " (Ctrl+Z desfaz)."); } else hint(rF.erro);
          }
          montarTemporarias();
        },
        /* para a fita, o e2e e o suporte */
        api: {
          painelSnaps: function (on) {
            pendurar();
            var abrir = on == null ? painel.style.display !== "block" : !!on;
            if (abrir) pintarPainel();
            painel.style.display = abrir ? "block" : "none";
            return abrir;
          },
          snaps: function (cfg) {
            if (cfg) {
              if (cfg.on != null) pr.snapOn = !!cfg.on;
              if (cfg.tipos) Object.keys(cfg.tipos).forEach(function (k) { if (k in pr.tipos) pr.tipos[k] = !!cfg.tipos[k]; });
              if (cfg.grade != null && +cfg.grade >= 0) pr.grade = +cfg.grade;
              guardarPref();
            }
            return { on: pr.snapOn, tipos: JSON.parse(JSON.stringify(pr.tipos)), grade: pr.grade };
          },
          alternarSnaps: alternarSnaps,
          /* PLANTA (js/bimplantamodelar.js) */
          cliquePlanta: function (p, alvoId, mods) { return self.cliquePlanta(p, alvoId, mods); },
          basePlanta: function () { return self.basePlanta(); },
          ferramenta: function () { return ativo() ? ferramenta() : null; },
          selecionar: function (ids) { selDefinir(ids || []); if (ferramenta()) reiniciarPasso(); return pr.sel.slice(); },
          selecao: function () { return pr.sel.slice(); },
          estado: function () {
            return { passo: pr.passo, ferramenta: ferramenta(), pts: pr.pts.slice(), sel: pr.sel.slice(), ultimo: pr.ult ? { p: pr.ult.p, tipo: pr.ult.sn ? pr.ult.sn.tipo : null } : null,
                     cotasTemporarias: pr.cotasTmp.map(function (c) { return { k: c.k, valor: c.valor, vizinho: c.vizinho }; }), alcas: (pr.alcas || []).map(function (a) { return { k: a.k, p: a.p }; }),
                     caixa: caixa.style.display !== "none", cotas3d: cotasGrp.children.length, contorno: selGrp.children.length, opcoes: { copiaEsp: pr.copiaEsp, copiaGir: pr.copiaGir, matriz: JSON.parse(JSON.stringify(pr.mat)) } };
          },
          /* P4: as opções das ferramentas novas (distância do deslocamento, junta, fator, material, composição, barrado) */
          p4: function (o) {
            var K = ["desl", "deslCopia", "juntaModo", "fator", "material", "codigo", "barrado"];
            if (o) K.forEach(function (k) { if (o[k] != null) pr.p4[k] = o[k]; });
            pintarOpcoes();
            var r = {}; K.forEach(function (k) { r[k] = pr.p4[k]; }); r.passo = pr.passo; r.pinturas3d = pintGrp.children.length;
            return r;
          },
          opcoes: function (o) { o = o || {}; if (o.copiaEsp != null) pr.copiaEsp = !!o.copiaEsp; if (o.copiaGir != null) pr.copiaGir = !!o.copiaGir; if (o.matriz) { if (o.matriz.tipo) pr.mat.tipo = o.matriz.tipo === "polar" ? "polar" : "linear"; if (o.matriz.n) pr.mat.n = Math.max(2, Math.min(200, Math.round(o.matriz.n))); if (o.matriz.graus) pr.mat.graus = +o.matriz.graus; } if (ferramenta()) reiniciarPasso(); pintarOpcoes(); return true; }
        }
      };
      return self;
    }
  };

  global.BimPrecisaoUI = BimPrecisaoUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimPrecisaoUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
