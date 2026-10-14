/* =====================================================================
 * blocokexecui.js — a TELA do módulo Blocok (aba Alvenaria do BIM) e as
 * PEÇAS no 3D. Fina: quem pagina, calcula e escreve documento são os
 * motores puros:
 *   js/blocokexec.js (paginação em amarração) · js/blocokcalc.js (cálculo)
 *   js/blocokmodelo.js (modelador/IFC → obra) · js/blocokmemorial.js
 *   js/blocokpranchas.js · js/blocokdxf.js · js/blocokmanual.js
 *   js/blocokorc.js · js/blocokexecxls.js
 * Padrão único de tela (ROTEIRO-MODULO.md, js/modulo.js): cabeçalho →
 * aviso → indicadores → abas → seções. Abas = o caminho de quem projeta:
 *   1. Paredes — as paredes Blocok lidas do modelo, encontros, quem
 *      recebe laje, a paginação de cada uma (elevação numerada);
 *   2. Premissas — laje, cobertura, vento, solo, ensaio do painel;
 *   3. Resultado — painel, vergas, cintas, pilaretes e fundação;
 *   4. Orçamento — composições, custo e cronograma;
 *   5. Documentos — memorial, pranchas, DXF, manual de montagem, planilha.
 *
 * LIBERAÇÃO (decisão do Rogério, 14/10/2026: "módulo pago à parte"):
 * Modela.tem("blocok") — compra, teste de 7 dias ou vitrine — OU a trava
 * antiga do cliente que já tinha o Blocok (BIM.temBotao("blocok")).
 * Os tipos de parede Blocok (js/alvtipos.js) só aparecem com isto liberado.
 * ===================================================================== */
(function (global) {
  "use strict";
  var doc = global.document;
  var KEY = "orcapro:blocok:exec:v1";
  var UI = { aba: "paredes", fonte: "", obra: null, res: null, erro: "", avisos: [], parede: null, pecas3d: false, param: ler() };
  var API3 = null, grupo3 = null, escondidas = [], timer = null, estadoAtual = null;

  function num(v, d) { var n = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v).replace(/\./g, "").replace(",", ".")); return isFinite(n) ? n : (d == null ? 0 : d); }
  function fmt(v, c) { var n = +v; if (!isFinite(n)) return "—"; return n.toLocaleString("pt-BR", { minimumFractionDigits: c == null ? 2 : c, maximumFractionDigits: c == null ? 2 : c }); }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function toast(t, tipo, ms) { try { if (global.UI && global.UI.toast) global.UI.toast(t, tipo || "ok", ms || 6000); } catch (e) {} }
  function ico(nome, t) { try { if (global.Icones && Icones.get) return Icones.get(nome, t || 16) || ""; } catch (e) {} return ""; }
  function M() { return global.Modulo || null; }
  function bt(acao, texto, o) {
    o = o || {};
    return '<button type="button" class="btn' + (o.sm ? " sm" : "") + (o.pri ? " primary" : "") + '" data-bkx="' + acao + '"' + (o.v != null ? ' data-bkx-v="' + esc(o.v) + '"' : "") +
      (o.dis ? " disabled" : "") + (o.dica ? ' title="' + esc(o.dica) + '"' : "") + ">" + (o.ico ? ico(o.ico, 15) + " " : "") + esc(texto) + "</button>";
  }
  function ler() { try { return JSON.parse(global.localStorage.getItem(KEY) || "null") || padraoParam(); } catch (e) { return padraoParam(); } }
  function salvar() { try { global.localStorage.setItem(KEY, JSON.stringify(UI.param)); } catch (e) {} }
  function padraoParam() {
    return { laje: { tipo: "macica", espessura: 0.10, revestimento: 1.0, uso: "residencial", vao: 4.0 },
      cobertura: { g: 0.5, q: 0.25, vao: 4.0 }, vento: { v0: "", categoria: "IV", grupoS3: 2 }, solo: { tensaoAdm: "" },
      painel: { MRdX: "", MRdY: "", fonte: "" }, fck: 25, caa: "II", apoia: {}, nome: "", local: "" };
  }

  /* --------------------------------------------------------- liberação */
  function liberado() {
    try { if (global.Modela && Modela.tem && Modela.tem("blocok")) return true; } catch (e) {}
    try { if (global.BIM && BIM.temBotao && BIM.temBotao("blocok")) return true; } catch (e2) {}
    return false;
  }
  function ligarTipos() { try { if (global.AlvTipos) global.AlvTipos.moduloLiberado = function (m) { return m === "blocok" && liberado(); }; } catch (e) {} }
  ligarTipos();

  /* --------------------------------------------------------- leitura das paredes */
  function ehBlocok(c) {
    var tp = c && c.tipoParede; if (!tp) return false;
    if (/^blk-/.test(String(tp.id || ""))) return true;
    return (tp.camadas || []).some(function (k) { return k.face === "nucleo" && /^blocok_/.test(String(k.id || "")); });
  }
  function espCmDe(c) {
    var nuc = (c.tipoParede.camadas || []).filter(function (k) { return k.face === "nucleo"; })[0];
    var e = nuc ? num(nuc.e) : num(c.espessura);
    return global.BlocokExec ? BlocokExec.espCm(e) : Math.round(e * 100);
  }
  function estado() {
    if (estadoAtual) return estadoAtual;
    try { var e = global.BIM && BIM.editarEstado ? BIM.editarEstado() : null; return e && e.estado ? e.estado : null; } catch (e2) { return null; }
  }
  function paredesDoModelo() {
    var st = estado(), A = global.BimArq; if (!st || !A || !A.frameDe) return [];
    var vaosMap = {};
    try { vaosMap = API3 && API3.vaos ? API3.vaos(st) : (global.BimEdit && BimEdit.vaosDasParedes ? BimEdit.vaosDasParedes(st, function (a, b, c) { return global.BIM && BIM.familiaAvaliar ? BIM.familiaAvaliar(a, b, c) : null; }) : {}); } catch (e) { vaosMap = {}; }
    return (st.caixas || []).filter(function (c) { return c.tipo === "parede" && ehBlocok(c); }).map(function (c) {
      var f = A.frameDe(c), p1 = A.aMundo(f, -f.L / 2, 0), p2 = A.aMundo(f, f.L / 2, 0);
      var vr = vaosMap[c.id] || {}, ac = vr.aceitos || [];
      return { id: String(c.id), nome: c.nome || ("Parede " + c.id), p1: p1, p2: p2, t: f.t, H: f.H, y0: f.y0, esp: espCmDe(c), fonte: "modelo",
        vaos: ac.map(function (v) { return { id: v.id, tipo: num(v.y0) < 0.05 ? "porta" : "janela", x0: num(v.x0) + f.L / 2, x1: num(v.x1) + f.L / 2, y0: num(v.y0), y1: num(v.y1) }; }) };
    });
  }
  function paredesDoIfc() {
    var r; try { r = global.BIM && BIM.blocokParedes ? BIM.blocokParedes() : null; } catch (e) { r = null; }
    return ((r && r.paredes) || []).map(function (w) {
      return { id: String(w.id), nome: w.nome, p1: w.p1, p2: w.p2, t: num(w.espM, 0.15), H: num(w.altura), y0: num(w.yMin, 0), esp: num(w.espessura, 15), fonte: "ifc", uid: w.uid,
        vaos: (w.vaos || []).map(function (v) { return { tipo: num(v.y) < 0.05 ? "porta" : "janela", x0: num(v.x), x1: num(v.x) + num(v.w), y0: num(v.y), y1: num(v.y) + num(v.h) }; }) };
    });
  }
  function opcoesDaObra() {
    var p = UI.param, lj = p.laje, g = lj.tipo === "nenhuma" ? 0 : 25 * num(lj.espessura, 0.1) + num(lj.revestimento, 1);
    var q = lj.uso === "servico" ? 2.0 : (lj.uso === "cobertura" ? 1.0 : 1.5);
    var o = {
      nome: p.nome || "", local: p.local || "",
      laje: { tipo: lj.tipo, g: g, q: lj.tipo === "nenhuma" ? 0 : q, vao: num(lj.vao, 4) },
      cobertura: { g: num(p.cobertura.g, 0.5), q: num(p.cobertura.q, 0.25), vao: num(p.cobertura.vao, 4) },
      vento: { v0: p.vento.v0 === "" ? null : num(p.vento.v0), categoria: p.vento.categoria, grupoS3: num(p.vento.grupoS3, 2) },
      solo: { tensaoAdm: p.solo.tensaoAdm === "" ? null : num(p.solo.tensaoAdm) },
      painel: (p.painel.MRdX !== "" && p.painel.MRdY !== "") ? { MRdX: num(p.painel.MRdX), MRdY: num(p.painel.MRdY), fonte: p.painel.fonte || "fabricante" } : {},
      apoiaLaje: p.apoia || {}
    };
    return o;
  }
  function lerObra() {
    var ps = paredesDoModelo(), fonte = "modelo";
    if (!ps.length) { ps = paredesDoIfc(); fonte = "ifc"; }
    UI.fonte = ps.length ? fonte : "";
    if (!ps.length) { UI.obra = null; UI.res = null; return false; }
    var r = BlocokModelo.obra(ps, opcoesDaObra());
    r.obra.parametros.fck = num(UI.param.fck, 25); r.obra.parametros.caa = UI.param.caa;
    UI.obra = r.obra; UI.avisos = r.avisos; UI.mapaParedes = ps;
    return true;
  }
  function calcular() {
    UI.erro = "";
    try {
      if (!lerObra()) { UI.res = null; render(); return; }
      UI.res = BlocokCalc.calcular(UI.obra);
      try { if (global.BlocokOrc) { UI.orc = BlocokOrc.orcar(UI.res, {}); UI.crono = BlocokOrc.cronograma(UI.res, {}); } } catch (eo) { UI.orc = null; UI.crono = null; }
    } catch (e) { UI.erro = String(e && e.message || e); UI.res = null; }
    render();
    if (UI.pecas3d) desenhar3d();
  }

  /* --------------------------------------------------------- 3D */
  function limpar3d() {
    if (grupo3 && grupo3.parent) grupo3.parent.remove(grupo3);
    if (grupo3) grupo3.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
    grupo3 = null;
    escondidas.forEach(function (m) { m.visible = true; }); escondidas = [];
  }
  function desenhar3d() {
    limpar3d();
    if (!UI.pecas3d || !API3 || !API3.THREE) return;
    if (!UI.obra && !lerObra()) return;
    var T = API3.THREE, S = API3.S;
    var resParedes = UI.res ? UI.res.paredes.map(function (p) { return p.pag; }) : UI.obra.paredes.map(function (w) { return BlocokExec.paginar(w); });
    var cores = { face: 0xc9c5bc, eps: 0xf3efe2, concreto: 0x9a5b4f, junta: 0x6f6f6f };
    var lista = { face: [], eps: [], concreto: [], junta: [] };
    var base = {}; (UI.mapaParedes || []).forEach(function (p) { base[p.id] = p; });
    resParedes.forEach(function (pag) {
      var w = UI.obra.paredes.filter(function (z) { return z.id === pag.id; })[0]; if (!w || !w.planta) return;
      var p1 = w.planta.p1, p2 = w.planta.p2, L = Math.sqrt(Math.pow(p2[0] - p1[0], 2) + Math.pow(p2[1] - p1[1], 2)) || 1;
      var ux = (p2[0] - p1[0]) / L, uz = (p2[1] - p1[1]) / L, th = Math.atan2(-uz, ux);
      var y0 = base[pag.id] ? num(base[pag.id].y0) : 0;
      var mw = new T.Matrix4().makeRotationY(th); mw.setPosition(p1[0], y0, p1[1]);
      BlocokExec.geometria3d(pag, { juntas: true }).forEach(function (cx) {
        var ml = new T.Matrix4().compose(new T.Vector3(cx.x + cx.w / 2, cx.y + cx.h / 2, cx.z + cx.d / 2), new T.Quaternion(), new T.Vector3(Math.max(cx.w, 1e-4), Math.max(cx.h, 1e-4), Math.max(cx.d, 1e-4)));
        (lista[cx.tipo] || lista.face).push(new T.Matrix4().multiplyMatrices(mw, ml));
      });
      // esconde a caixa original da parede enquanto as peças aparecem
      var bp = base[pag.id];
      if (S && S.modelRoot) S.modelRoot.traverse(function (m) {
        if (!m.isMesh || !m.visible) return; var ud = m.userData || {};
        var casa = bp && ((bp.fonte === "modelo" && ud.mid === "edit" && String(ud.expressID) === pag.id) || (bp.fonte === "ifc" && bp.uid && (String(ud.mid) + ":" + String(ud.expressID)) === bp.uid));
        if (casa) { m.visible = false; escondidas.push(m); }
      });
    });
    grupo3 = new T.Group(); grupo3.name = "blocok-pecas"; grupo3.renderOrder = 2;
    var geo = new T.BoxGeometry(1, 1, 1);
    Object.keys(lista).forEach(function (k) {
      var arr = lista[k]; if (!arr.length) return;
      var mat = new T.MeshStandardMaterial({ color: cores[k], roughness: k === "eps" ? 0.95 : 0.85, metalness: 0 });
      var im = new T.InstancedMesh(geo, mat, arr.length);
      arr.forEach(function (m, i) { im.setMatrixAt(i, m); });
      im.instanceMatrix.needsUpdate = true; im.userData = { blocok: k }; im.raycast = function () {};
      grupo3.add(im);
    });
    (API3.scene || (S && S.scene)).add(grupo3);
  }
  function alternar3d(liga) {
    UI.pecas3d = liga == null ? !UI.pecas3d : !!liga;
    if (UI.pecas3d) { if (!UI.obra) lerObra(); if (!UI.obra) { UI.pecas3d = false; toast("Nenhuma parede Blocok no modelo. Escolha um tipo \"Blocok\" nas paredes (ou traga um IFC).", "alerta"); return; } desenhar3d(); toast("Peças Blocok no 3D: face, EPS, concreto dos reforços e juntas.", "ok", 4000); }
    else limpar3d();
    if (raiz()) render();
  }
  function montar3d(api) {
    API3 = api || null;
    return {
      aposRebuild: function (st) {
        estadoAtual = st || null;
        if (UI.fonte === "exemplo") return;            // o exemplo não é o modelo: não relê por cima dele
        if (!UI.pecas3d && !raiz()) return;
        clearTimeout(timer);
        timer = setTimeout(function () { UI.obra = null; if (raiz()) calcular(); else if (UI.pecas3d) { lerObra(); desenhar3d(); } }, 350);
      }
    };
  }

  /* --------------------------------------------------------- janela */
  function estilo() {
    if (!doc || doc.getElementById("bkx-estilo")) return;
    var st = doc.createElement("style"); st.id = "bkx-estilo";
    st.textContent = [
      ".bkx-veu{position:fixed;inset:0;z-index:49;background:var(--bg);color:var(--texto);display:flex;flex-direction:column}",
      ".bkx-jan{position:relative;flex:1;overflow:auto;padding:18px 24px 40px;outline:none}",
      ".bkx-in{max-width:1320px;margin:0 auto;display:flex;flex-direction:column;gap:16px}",
      ".bkx-fechar{position:absolute;top:14px;right:16px;z-index:2}",
      ".bkx-in .mod-cab{padding-right:48px}",
      ".bkx-grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px 16px}",
      ".bkx-campo{display:flex;flex-direction:column;gap:4px;font-size:var(--t-peq);color:var(--texto-fraco)}",
      ".bkx-campo input,.bkx-campo select{font-size:var(--t-base);color:var(--texto)}",
      ".bkx-fraco{color:var(--texto-fraco);font-size:var(--t-peq)}",
      ".bkx-tab-rola{overflow-x:auto}",
      "table.tbl.bkx-t th,table.tbl.bkx-t td{padding:7px 9px;white-space:nowrap}",
      ".bkx-elev{background:white;border:1px solid var(--linha);border-radius:var(--raio);overflow:auto;padding:8px}",
      ".bkx-elev svg{display:block;max-width:100%;height:auto}",
      ".bkx-docs{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}",
      ".bkx-doc{border:1px solid var(--linha);border-radius:var(--raio);padding:14px;display:flex;flex-direction:column;gap:8px;background:var(--surface)}",
      ".bkx-doc b{font-weight:var(--p-forte)} .bkx-doc p{margin:0;color:var(--texto-fraco);font-size:var(--t-peq)} .bkx-doc .btn{align-self:flex-start}",
      ".bkx-lista{margin:0;padding-left:18px} .bkx-lista li{margin:4px 0}",
      "@media (max-width:640px){.bkx-jan{padding:12px 12px 32px}.bkx-docs{grid-template-columns:1fr}}"
    ].join("\n");
    doc.head.appendChild(st);
  }
  function raiz() { return doc ? doc.getElementById("bkx-veu") : null; }
  function garantir() {
    estilo();
    var v = raiz(); if (v) return v;
    v = doc.createElement("div"); v.id = "bkx-veu"; v.className = "bkx-veu";
    v.innerHTML = '<div class="bkx-jan" role="dialog" aria-modal="true" aria-labelledby="bkx-tit" tabindex="-1"></div>';
    doc.body.appendChild(v);
    v.addEventListener("click", function (ev) { var b = ev.target.closest("[data-bkx]"); if (b && !b.disabled) acao(b.getAttribute("data-bkx"), b.getAttribute("data-bkx-v"), b); });
    v.addEventListener("change", function (ev) { var i = ev.target.closest("[data-bkx-p]"); if (i) parametro(i.getAttribute("data-bkx-p"), i.type === "checkbox" ? i.checked : i.value); });
    v.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && !doc.querySelector(".modal-bg, .mod-mais-menu:not([hidden])")) { ev.stopPropagation(); fechar(); } });
    setTimeout(function () { var j = v.querySelector(".bkx-jan"); if (j) try { j.focus({ preventScroll: true }); } catch (e) {} }, 0);
    return v;
  }
  function fechar() { var v = raiz(); if (v) v.remove(); }
  function parametro(caminho, valor) {
    var p = UI.param, k = caminho.split(".");
    if (k[0] === "apoia") { p.apoia = p.apoia || {}; p.apoia[k[1]] = !!valor; }
    else { var o = p; for (var i = 0; i < k.length - 1; i++) { o[k[i]] = o[k[i]] || {}; o = o[k[i]]; } o[k[k.length - 1]] = valor; }
    salvar();
    if (UI.fonte === "exemplo") return exemplo();      // premissa mudou com o exemplo aberto: recalcula o exemplo
    UI.obra = null;
    calcular();
  }

  function cabecalho() {
    var Mo = M(), nome = UI.param.nome || "";
    var sub = (nome ? nome + " · " : "") + "Diretriz SiNAT 019 · NBR 6118 · NBR 6123 · NBR 15575-4";
    var acoes = [bt("ler", "Ler o modelo", { ico: "ciclo", dica: "Relê as paredes com tipo Blocok do modelador (ou as paredes do IFC, se não houver) e recalcula" }),
      bt("pecas3d", UI.pecas3d ? "Esconder peças no 3D" : "Mostrar peças no 3D", { ico: "camadas", dica: "Mostra cada peça Blocok no 3D: as duas faces, o EPS, o concreto de pilaretes/vergas/cintas e as juntas" })];
    if (Mo) acoes.push(Mo.SEP);
    acoes.push(bt("exemplo", "Carregar exemplo", { ico: "livro", dica: "Casa térrea 10 × 8 m com laje, para conhecer o módulo sem modelo" }));
    var pri = '<button type="button" class="btn primary" data-bkx="calcular">' + ico("raio", 15) + " Calcular</button>";
    var h = Mo ? Mo.cab({ iconeHtml: ico("bloco", 22), titulo: "Blocok — paredes prontas", sub: sub, acoes: acoes, primariaHtml: pri }).replace("<h1>", '<h1 id="bkx-tit">')
      : '<header class="mod-cab"><h1 id="bkx-tit">Blocok — paredes prontas</h1>' + acoes.join("") + pri + "</header>";
    return h;
  }
  function avisoTopo() {
    var Mo = M(), r = UI.res; if (!Mo) return "";
    if (UI.erro) return Mo.aviso({ tom: "erro", titulo: "O cálculo não terminou", texto: UI.erro });
    if (!UI.obra) return Mo.aviso({ tom: "info", titulo: "Nenhuma parede Blocok no modelo", texto: "Desenhe as paredes escolhendo um tipo \"Blocok\" (Propriedades › Tipo) — ou traga um IFC. As peças, a paginação e o cálculo saem daqui.", acaoHtml: bt("exemplo", "Carregar exemplo", { sm: 1 }) });
    if (!r) return "";
    if (r.erros.length) return Mo.aviso({ tom: "erro", titulo: "Não emitir: " + r.erros.length + " problema(s)", texto: r.erros[0] + (r.erros.length > 1 ? " (e mais " + (r.erros.length - 1) + " — ver Resultado)" : ""), acaoHtml: bt("aba", "Ver", { v: "resultado", sm: 1 }) });
    if (r.pendencias.length) return Mo.aviso({ tom: "alerta", titulo: r.pendencias.length + " pendência(s) para o responsável técnico", texto: r.pendencias[0].texto, acaoHtml: bt("aba", "Premissas", { v: "premissas", sm: 1 }) });
    return Mo.aviso({ tom: "ok", titulo: "Paredes calculadas", texto: "Sem erro nem pendência. Confira os documentos antes de emitir." });
  }
  function kpis() {
    var Mo = M(), r = UI.res; if (!Mo || !r) return "";
    var t = r.consolidado.totais;
    return Mo.kpis([
      { rotulo: "Situação", valor: r.erros.length ? "Não atende" : (r.pendencias.length ? "Pendente" : "Atende"), sub: r.resumo.aprovadas + " de " + r.resumo.paredes + " paredes", tom: r.erros.length ? "neg" : (r.pendencias.length ? "alerta" : "pos"), id: "bkx-k-sit" },
      { rotulo: "Placas a comprar", valor: fmt(t.placasCompra, 0), sub: fmt(t.pecas, 0) + " peças assentadas (com recortes)", id: "bkx-k-placas" },
      { rotulo: "Área de parede", valor: fmt(t.areaPecas, 1) + " m²", sub: "líquida dos vãos", id: "bkx-k-area" },
      { rotulo: "Peso", valor: fmt(t.pesoTotalKg / 1000, 2) + " t", sub: "peças + concreto + argamassa", id: "bkx-k-peso" },
      { rotulo: "Concreto e aço", valor: fmt(t.concretoM3, 2) + " m³", sub: fmt(t.acoKg, 0) + " kg de aço (construtivo/calculado)", tom: "info", id: "bkx-k-conc" }
    ]);
  }
  function abas() {
    var Mo = M(), L = [{ id: "paredes", r: "Paredes" }, { id: "premissas", r: "Premissas" }, { id: "resultado", r: "Resultado" }, { id: "orcamento", r: "Orçamento" }, { id: "documentos", r: "Documentos" }];
    return Mo ? Mo.abas(L.map(function (a) { return { rotulo: a.r, ativa: UI.aba === a.id, attrs: 'data-bkx="aba" data-bkx-v="' + a.id + '"' }; })) : "";
  }
  function secao(t, sub, corpo, acoes) { var Mo = M(); return Mo ? Mo.secao({ titulo: t, sub: sub || "", corpoHtml: corpo, acoesHtml: acoes || "" }) : "<section><h2>" + esc(t) + "</h2>" + corpo + "</section>"; }
  function pil(t, tom) { var Mo = M(); return Mo && Mo.pilula ? Mo.pilula(t, tom) : esc(t); }
  function encTxt(e) { return !e ? "—" : (e.tipo === "canto" ? "canto (" + (e.passaPar === 0 ? "atravessa nas fiadas ímpares" : "atravessa nas pares") + ")" : (e.tipo === "T" ? "encosta em T" : (e.tipo === "pilar" ? "pilar" : "livre"))); }

  /* elevação simples da parede (as pranchas completas são do js/blocokpranchas.js) */
  function svgParede(pag) {
    var s = 110, Lx = pag.comprimento + 0.4, Hy = pag.altura + 0.3, W = Lx * s + 20, H = Hy * s + 20;
    function X(x) { return 10 + (x + 0.2) * s; } function Y(y) { return H - 10 - y * s; }
    var o = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W.toFixed(0) + " " + H.toFixed(0) + '" width="' + W.toFixed(0) + '" font-family="sans-serif" font-size="10">';
    var rf = pag.reforcos, cor = { pilarete: "#e57373", verga: "#ba68c8", contraverga: "#ba68c8", cinta: "#ffb74d" };
    [].concat(rf.pilaretes, rf.vergas, rf.contravergas, rf.cintas).forEach(function (f) {
      o += '<rect x="' + X(f.x).toFixed(1) + '" y="' + Y(f.y + f.h).toFixed(1) + '" width="' + (f.w * s).toFixed(1) + '" height="' + (f.h * s).toFixed(1) + '" fill="' + (cor[f.tipo] || "#ccc") + '" opacity=".45"><title>' + esc(f.id) + "</title></rect>";
    });
    pag.pecas.forEach(function (p) {
      o += '<rect x="' + X(p.x).toFixed(1) + '" y="' + Y(p.y + p.h).toFixed(1) + '" width="' + (p.w * s).toFixed(1) + '" height="' + (p.h * s).toFixed(1) + '" fill="none" stroke="#1d2b3a" stroke-width="1.2"><title>' + esc(p.cod + " · " + p.tipo + " · " + fmt(p.w, 2) + "×" + fmt(p.h, 2) + " m · " + fmt(p.peso, 1) + " kg") + "</title></rect>";
      (p.furos || []).forEach(function (f) { o += '<rect x="' + X(f.x).toFixed(1) + '" y="' + Y(f.y + f.h).toFixed(1) + '" width="' + (f.w * s).toFixed(1) + '" height="' + (f.h * s).toFixed(1) + '" fill="white" stroke="#1d2b3a" stroke-width="1.2"/>'; });
      if (p.w * s > 22 && p.h * s > 14) o += '<text x="' + X(p.x + p.w / 2).toFixed(1) + '" y="' + (Y(p.y + p.h / 2) + 3).toFixed(1) + '" text-anchor="middle" fill="#1d2b3a">' + p.n + "</text>";
    });
    (pag.vaos || []).forEach(function (v) { o += '<rect x="' + X(v.x).toFixed(1) + '" y="' + Y(v.y + v.h).toFixed(1) + '" width="' + (v.w * s).toFixed(1) + '" height="' + (v.h * s).toFixed(1) + '" fill="none" stroke="#1565c0" stroke-dasharray="5 3"/>'; });
    return o + "</svg>";
  }

  function corpoParedes() {
    if (!UI.obra) return "";
    var r = UI.res, linhas = UI.obra.paredes.map(function (w, i) {
      var pr = r ? r.paredes[i] : null, pg = pr ? pr.pag : null;
      var st = !pr ? "" : (pr.erros.length ? pil("Não atende", "neg") : (pr.painel && pr.painel.status === "pendente" ? pil("Pendente", "alerta") : pil("Atende", "pos")));
      return "<tr><td><b>" + esc(w.id) + "</b>" + (w.nome ? '<br><span class="bkx-fraco">' + esc(w.nome) + "</span>" : "") + "</td><td>" + w.espessura + " cm</td><td>" + fmt(w.comprimento) + " × " + fmt(w.altura) + "</td>" +
        "<td>" + encTxt(w.ini) + "<br>" + encTxt(w.fim) + "</td><td>" + (w.externa ? "fachada" : "interna") + "</td>" +
        '<td><label><input type="checkbox" data-bkx-p="apoia.' + esc(w.id) + '"' + (w.apoiaLaje ? " checked" : "") + "> recebe laje</label></td>" +
        "<td>" + (w.vaos.length || "—") + "</td><td>" + (pg ? pg.quant.pecas + " / " + pg.quant.placasCompra : "—") + "</td><td>" + (pg && pg.validacao.menorTranspasse != null ? fmt(pg.validacao.menorTranspasse * 100, 0) + " cm" : "—") + "</td><td>" + st + "</td>" +
        "<td>" + bt("ver", "Paginação", { v: w.id, sm: 1 }) + "</td></tr>";
    }).join("");
    var tab = '<div class="bkx-tab-rola"><table class="tbl bkx-t"><thead><tr><th>Parede</th><th>Peça</th><th>Comp. × alt. (m)</th><th>Encontros</th><th>Posição</th><th>Laje</th><th>Vãos</th><th>Peças / placas</th><th>Menor transpasse</th><th>Situação</th><th></th></tr></thead><tbody>' + linhas + "</tbody></table></div>";
    var fonte = UI.fonte === "ifc" ? "Paredes lidas do IFC (medidas pela malha). Para o projeto executivo, prefira desenhar com o tipo Blocok no modelador." : "Paredes do modelador com tipo Blocok.";
    var h = secao("Paredes Blocok", fonte + " A amarração alterna nos cantos e nenhuma junta fica a menos de 33 % da peça da de baixo (Diretriz SiNAT 019).", tab);
    var sel = UI.parede && r ? r.paredes.filter(function (p) { return p.id === UI.parede; })[0] : null;
    if (sel) {
      var v = sel.pag.validacao, q = sel.pag.quant;
      var info = "<p class=\"bkx-fraco\">" + q.pecas + " peças (" + q.porTipo.inteira + " inteiras, " + (q.porTipo.meia || 0) + " meias, " + q.porTipo.recorte + " recortes, " + (q.porTipo["recorte-L"] || 0) + " em L) · " + q.placasCompra + " placas a comprar · menor transpasse " + fmt((v.menorTranspasse || 0) * 100, 0) + " cm (mínimo " + fmt(v.transpasseMin * 100, 0) + " cm)</p>";
      var avs = sel.pag.avisos.length ? '<ul class="bkx-lista">' + sel.pag.avisos.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>" : "";
      h += secao("Paginação — " + sel.id, "Peças numeradas de baixo para cima; em vermelho os pilaretes, em lilás vergas/contravergas, em laranja a cinta (EPS retirado e concretado).", info + avs + '<div class="bkx-elev">' + svgParede(sel.pag) + "</div>", bt("fechar-par", "Fechar", { sm: 1 }));
    }
    return h;
  }
  function campo(rot, cam, val, tipo, opcoes, dica) {
    var inp = opcoes ? '<select data-bkx-p="' + cam + '">' + opcoes.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(val) === String(o[0]) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>"
      : '<input type="' + (tipo || "text") + '" data-bkx-p="' + cam + '" value="' + esc(val) + '"' + (dica ? ' placeholder="' + esc(dica) + '"' : "") + ">";
    return '<label class="bkx-campo">' + esc(rot) + inp + "</label>";
  }
  function corpoPremissas() {
    var p = UI.param;
    var g1 = '<div class="bkx-grade">' + campo("Nome da obra", "nome", p.nome) + campo("Local (cidade/UF)", "local", p.local) +
      campo("Concreto dos reforços (fck, MPa)", "fck", p.fck, "number") + campo("Agressividade (CAA)", "caa", p.caa, null, [["I", "I — fraca (rural/interno seco)"], ["II", "II — moderada (urbana)"], ["III", "III — forte (marinha/industrial)"], ["IV", "IV — muito forte"]]) + "</div>";
    var g2 = '<div class="bkx-grade">' + campo("Laje", "laje.tipo", p.laje.tipo, null, [["macica", "Maciça"], ["pre-moldada", "Pré-moldada/treliçada"], ["nenhuma", "Sem laje (só telhado)"]]) +
      campo("Espessura da laje (m)", "laje.espessura", p.laje.espessura, "number") + campo("Revestimento + contrapiso (kN/m²)", "laje.revestimento", p.laje.revestimento, "number") +
      campo("Uso (NBR 6120, Tabela 10)", "laje.uso", p.laje.uso, null, [["residencial", "Residencial — 1,5 kN/m²"], ["servico", "Área de serviço — 2,0 kN/m²"], ["cobertura", "Laje de cobertura (manutenção) — 1,0 kN/m²"]]) +
      campo("Vão da laje entre apoios (m)", "laje.vao", p.laje.vao, "number") + "</div>";
    var g3 = '<div class="bkx-grade">' + campo("Telhado: peso (kN/m²)", "cobertura.g", p.cobertura.g, "number") + campo("Telhado: sobrecarga (kN/m²)", "cobertura.q", p.cobertura.q, "number", null, "NBR 6120 6.4: 0,25 a 0,50") + campo("Telhado: vão (m)", "cobertura.vao", p.cobertura.vao, "number") + "</div>";
    var g4 = '<div class="bkx-grade">' + campo("V0 — velocidade básica (m/s)", "vento.v0", p.vento.v0, "number", null, "isopletas da NBR 6123") +
      campo("Categoria do terreno", "vento.categoria", p.vento.categoria, null, [["I", "I"], ["II", "II"], ["III", "III"], ["IV", "IV — cidade, subúrbio"], ["V", "V — centro de cidade grande"]]) +
      campo("Grupo do fator S3", "vento.grupoS3", p.vento.grupoS3, null, [["1", "1"], ["2", "2 — residência"], ["3", "3"], ["4", "4"], ["5", "5"]]) + "</div>";
    var g5 = '<div class="bkx-grade">' + campo("Tensão admissível do solo (kPa)", "solo.tensaoAdm", p.solo.tensaoAdm, "number", null, "da sondagem SPT") + "</div>";
    var g6 = '<div class="bkx-grade">' + campo("M resistente horizontal (kN·m/m)", "painel.MRdX", p.painel.MRdX, "number", null, "vazio = ensaio simulado") + campo("M resistente vertical (kN·m/m)", "painel.MRdY", p.painel.MRdY, "number", null, "vazio = ensaio simulado") + campo("Fonte (laudo do fabricante)", "painel.fonte", p.painel.fonte) + "</div>";
    return secao("Obra e materiais", "", g1) + secao("Laje", "As paredes marcadas \"recebe laje\" levam a reação (g + q)·vão/2. Só a peça de 20 cm aceita pilar estrutural (NBR 6118 13.2.3).", g2) +
      secao("Cobertura (telhado)", "", g3) + secao("Vento (NBR 6123)", "Sem V0, o vento fica pendente.", g4) + secao("Solo", "Sem a sondagem, a fundação fica pendente.", g5) +
      secao("Resistência do painel — valores do fabricante (opcional)", "Sem preencher, vale o ENSAIO SIMULADO do sistema: o painel calculado como sanduíche pelos materiais (faces de microconcreto, núcleo de EPS e junta de argamassa) — flexão, cisalhamento, compressão e deslocamento. Com o laudo do fabricante, os valores dele passam a valer.", g6);
  }
  function tabela(cab, linhas) { return '<div class="bkx-tab-rola"><table class="tbl bkx-t"><thead><tr>' + cab.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" + linhas.join("") + "</tbody></table></div>"; }
  function corpoResultado() {
    var r = UI.res; if (!r) return "";
    var h = "";
    if (r.erros.length || r.pendencias.length || r.avisos.length) h += secao("Para resolver", "", '<ul class="bkx-lista">' + r.erros.map(function (e) { return "<li><b>Erro:</b> " + esc(e) + "</li>"; }).join("") + r.pendencias.map(function (p) { return "<li><b>Pendência:</b> " + esc(p.texto) + "</li>"; }).join("") + r.avisos.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>");
    var V = r.vento;
    h += secao("Vento", V.ok ? "q = " + fmt(V.qVed, 3) + " kN/m² · " + esc(V.fonte) : "Pendente", V.ok ? tabela(["Face", "p (kN/m²)"], Object.keys(V.porFace).map(function (f) { return "<tr><td>" + f + "</td><td>" + fmt(V.porFace[f], 3) + "</td></tr>"; }).concat(["<tr><td>paredes internas</td><td>" + fmt(V.interna, 3) + "</td></tr>"])) : "");
    h += secao("Painel (vedação) ao vento e por contato", "Placa apoiada nos 4 lados (Navier), γf = 1,4. Resistência: " + (r.paredes[0] && r.paredes[0].painel && r.paredes[0].painel.fonte ? esc(r.paredes[0].painel.fonte) : "ensaio simulado") + ".", tabela(["Parede", "Vão horiz. × vert. (m)", "MSd h / v", "MRd h / v", "VSd / VRd (kN/m)", "NSd / NRd (kN/m)", "Deslocamento / limite (mm)", "Ajuste", "Situação"], r.paredes.map(function (p) {
      var pn = p.painel || {}, aj = p.ajustePainel;
      return "<tr><td>" + esc(p.id) + "</td><td>" + fmt(pn.vaoHorizontal) + " × " + fmt(pn.vaoVertical) + "</td><td>" + fmt(pn.MSdX, 3) + " / " + fmt(pn.MSdY, 3) + "</td><td>" + fmt(pn.MRdX, 3) + " / " + fmt(pn.MRdY, 3) + "</td><td>" + fmt(pn.VSd, 2) + " / " + fmt(pn.VRd, 2) + "</td><td>" + fmt(pn.NSd, 1) + " / " + fmt(pn.NRd, 1) + "</td><td>" + fmt(pn.flechaMm || 0, 2) + " / " + fmt((pn.flechaLim || 0) * 1000, 1) + "</td><td>" + (aj ? "pilaretes a " + fmt(aj.espMaxPilaretes, 1) + " m" + (aj.cintaIntermediaria ? " + cinta intermediária" : "") : "—") + "</td><td>" + (pn.status === "atende" ? pil("Atende", "pos") : pil("Não atende", "neg")) + "</td></tr>";
    })));
    var lv = [];
    r.paredes.forEach(function (p) { (p.vergas || []).forEach(function (v) { lv.push("<tr><td>" + esc(p.id) + "</td><td>" + esc(v.id) + (v.viga ? " (viga)" : "") + "</td><td>" + fmt(v.vao) + "</td><td>" + fmt((v.hRecomendada || v.h) * 100, 0) + " cm</td><td>" + fmt(v.Md, 2) + "</td><td>" + esc(v.armadura || "—") + "</td><td>" + (v.cisalhamento && v.cisalhamento.ok ? "φ" + fmt(v.cisalhamento.phi, 1) + " c/" + fmt(v.cisalhamento.s * 100, 0) : "—") + "</td><td>" + (v.ok ? pil("Atende", "pos") : pil("Não atende", "neg")) + "</td></tr>"); }); });
    h += secao("Vergas", "NBR 6118 — flexão, cisalhamento e flecha (L/250).", lv.length ? tabela(["Parede", "Verga", "Vão (m)", "Altura", "Md (kN·m)", "Armadura", "Estribos", "Situação"], lv) : '<p class="bkx-fraco">Sem vãos.</p>');
    h += secao("Cintas de respaldo", "", tabela(["Parede", "Vão entre pilaretes (m)", "Altura", "Md (kN·m)", "Armadura", "Vento sem laje", "Situação"], r.paredes.filter(function (p) { return p.cinta; }).map(function (p) {
      var c = p.cinta; return "<tr><td>" + esc(p.id) + "</td><td>" + fmt(c.vaoEntrePilaretes) + "</td><td>" + fmt((c.hRecomendada || c.h) * 100, 0) + " cm</td><td>" + fmt(c.Md, 2) + "</td><td>" + esc(c.armadura || "—") + "</td><td>" + (c.ventoHorizontal ? (c.ventoHorizontal.flexao.ok ? "verificada" : "não passa") : "travada pela laje") + "</td><td>" + (c.ok ? pil("Atende", "pos") : pil("Ver", "alerta")) + "</td></tr>";
    })));
    var lp = [];
    r.paredes.forEach(function (p) { (p.pilaretes || []).forEach(function (q) { lp.push("<tr><td>" + esc(p.id) + "</td><td>" + esc(q.id) + "</td><td>" + esc(q.motivo) + "</td><td>" + fmt(q.h * 100, 0) + " × " + fmt(q.b * 100, 0) + "</td><td>" + (q.estrutural ? "estrutural" : "travamento") + "</td><td>" + fmt(q.trib) + " m</td><td>" + esc(q.armadura || "—") + "</td><td>" + (q.ok ? pil("Atende", "pos") : pil("Não atende", "neg")) + "</td></tr>"); }); });
    h += secao("Pilaretes", "Estruturais (recebem laje/telhado): flexo-compressão com 2ª ordem. De travamento: só vento.", tabela(["Parede", "Pilarete", "Por quê", "Seção (cm)", "Função", "Faixa de vento", "Armadura", "Situação"], lp));
    var F = r.fundacao;
    h += secao("Fundação", F.recomendacao, '<ul class="bkx-lista">' + F.justificativa.map(function (j) { return "<li>" + esc(j) + "</li>"; }).join("") + "</ul>" + tabela(["Parede", "Parede (kN/m)", "Laje/telhado g (kN/m)", "q (kN/m)", "Total (kN/m)"], r.paredes.map(function (p) { var f = p.fundacao || {}; return "<tr><td>" + esc(p.id) + "</td><td>" + fmt(f.gParede) + "</td><td>" + fmt(f.gTopo) + "</td><td>" + fmt(f.qTopo) + "</td><td><b>" + fmt(f.qk) + "</b></td></tr>"; })));
    return h;
  }
  function corpoOrcamento() {
    if (!global.BlocokOrc) return secao("Orçamento", "", '<p class="bkx-fraco">O motor de orçamento do Blocok não está carregado nesta versão.</p>');
    var o = UI.orc, c = UI.crono; if (!o) return "";
    var linhas = (o.linhas || []).map(function (l) { return "<tr><td>" + esc(l.etapa || "") + "</td><td>" + esc(l.codigo) + "</td><td>" + esc(l.descricao) + "</td><td>" + esc(l.unidade) + "</td><td>" + fmt(l.quantidade, 2) + "</td><td>" + (l.custoUnitario != null ? "R$ " + fmt(l.custoUnitario) : '<span class="bkx-fraco">sem preço</span>') + "</td><td>" + (l.custoUnitario != null ? "R$ " + fmt(l.custoUnitario * l.quantidade) : "—") + '</td><td class="bkx-fraco">' + esc(l.origemPreco || "") + "</td></tr>"; });
    var tt = o.totais || {}, m2 = tt.custoPorM2 || tt.porM2 || null;
    var resumo = (tt.total != null || tt.direto != null) ? '<p><b>Total direto: R$ ' + fmt(tt.total != null ? tt.total : tt.direto) + "</b>" + (m2 ? " · R$ " + fmt(typeof m2 === "object" ? (m2.total || m2.valor) : m2) + "/m² de parede" : "") + ' <span class="bkx-fraco">(BDI não incluso)</span></p>' : "";
    var h = secao("Composições e quantidades", "Composições próprias BLK com preços de referência RA de mercado (out/2026) e coeficientes da RA — tudo editável; confira com o seu fornecedor.", resumo + tabela(["Etapa", "Código", "Serviço", "Un.", "Quant.", "Custo unit.", "Total", "Origem do preço"], linhas));
    if (c && c.atividades) h += secao("Cronograma", "Pela produtividade parametrizada (estimada até a calibração em obra).", tabela(["Atividade", "Duração (dias)", "Início", "Fim", "Depende de"], c.atividades.map(function (a) { return "<tr><td>" + esc(a.nome) + "</td><td>" + (a.duracao != null ? fmt(a.duracao, 0) : "a definir") + "</td><td>" + (a.inicio != null ? a.inicio : "—") + "</td><td>" + (a.fim != null ? a.fim : "—") + "</td><td>" + esc((a.predecessoras || []).join(", ")) + "</td></tr>"; })));
    return h;
  }
  function corpoDocumentos() {
    var r = UI.res, dis = !r;
    function card(t, txt, acao, mod) { var tem = !!global[mod]; return '<div class="bkx-doc"><b>' + esc(t) + "</b><p>" + esc(txt) + "</p>" + bt(acao, tem ? "Gerar" : "Indisponível", { sm: 1, dis: dis || !tem }) + "</div>"; }
    return secao("Documentos", r && r.erros.length ? "Há erro de cálculo: os documentos saem marcados como NÃO EMITIR." : "", '<div class="bkx-docs">' +
      card("Memorial de cálculo", "Vento, painel, vergas, cintas, pilaretes, fundação, pendências e a memória passo a passo.", "memorial", "BlocokMemorial") +
      card("Pranchas executivas", "Paginação de cada parede com peças numeradas e peso, locação dos reforços, detalhes típicos e tabela de aço.", "pranchas", "BlocokPranchas") +
      card("DXF das pranchas", "Para abrir no AutoCAD (salvar como DWG lá).", "dxf", "BlocokDxf") +
      card("Manual de montagem", "Uma etapa por página para a equipe: marcação, fiadas, cantos, vergas, pilaretes, juntas.", "manual", "BlocokManual") +
      card("Planilha (.xlsx)", "Romaneio de peças, compra, reforços, aço, composições, orçamento e cronograma.", "xlsx", "BlocokExecXLS") +
      "</div>");
  }
  function render() {
    var v = garantir(), jan = v.querySelector(".bkx-jan"), top = jan.scrollTop;
    var corpo = UI.aba === "premissas" ? corpoPremissas() : UI.aba === "resultado" ? corpoResultado() : UI.aba === "orcamento" ? corpoOrcamento() : UI.aba === "documentos" ? corpoDocumentos() : corpoParedes();
    jan.innerHTML = '<button type="button" class="btn sm bkx-fechar" data-bkx="fechar" title="Fechar (Esc)">' + (ico("fechar", 15) || "×") + '</button><div class="bkx-in">' + cabecalho() + avisoTopo() + kpis() + abas() + corpo + "</div>";
    jan.scrollTop = top;
  }

  /* --------------------------------------------------------- documentos */
  function janela(titulo) { var w = global.open("", "_blank"); if (w) { w.document.write("<!doctype html><meta charset=utf-8><title>" + esc(titulo) + "</title><p style='font-family:sans-serif;padding:24px'>Montando…</p>"); } return w; }
  function mostrar(w, html, nome) {
    if (w && !w.closed) { w.document.open(); w.document.write(html); w.document.close(); return; }
    baixar(nome, html, "text/html");
  }
  function baixar(nome, conteudo, tipo) {
    var b = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo || "application/octet-stream" });
    var a = doc.createElement("a"); a.href = URL.createObjectURL(b); a.download = nome; doc.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function nomeBase() { return "Blocok - " + ((UI.param.nome || "obra").replace(/[\\/:*?"<>|]/g, "-")); }
  function opDocs() {
    var planta = UI.obra ? { paredes: UI.obra.paredes.filter(function (w) { return w.planta; }).map(function (w) { return { id: w.id, x1: w.planta.p1[0], y1: w.planta.p1[1], x2: w.planta.p2[0], y2: w.planta.p2[1] }; }) } : null;
    return { obra: UI.param.nome, cliente: "", local: UI.param.local, data: new Date().toISOString().slice(0, 10), planta: planta };
  }
  var DOC = {
    memorial: function () { var w = janela("Memorial"); var g = BlocokMemorial.gerar(UI.res, opDocs()); mostrar(w, g.html, nomeBase() + " - memorial.html"); },
    manual: function () { var w = janela("Manual"); var g = BlocokManual.gerar(UI.res, opDocs()); mostrar(w, g.html, nomeBase() + " - manual de montagem.html"); },
    pranchas: function () {
      var w = janela("Pranchas"), g = BlocokPranchas.gerar(UI.res, opDocs());
      var html = "<!doctype html><meta charset=utf-8><title>Pranchas Blocok</title><style>@page{size:A1 landscape;margin:0}body{margin:0}.f{page-break-after:always;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center}.f svg{width:100%;height:100%}</style>" +
        (g.folhas || []).map(function (f) { return '<div class="f">' + f.svg + "</div>"; }).join("") + "<script>setTimeout(function(){print()},400)<\/script>";
      mostrar(w, html, nomeBase() + " - pranchas.html");
    },
    dxf: function () {
      var g = BlocokDxf.gerar(UI.res, opDocs()); var arqs = g.arquivos || [];
      if (global.BimBcf && BimBcf.zipEscrever && arqs.length > 1) { var o = {}; arqs.forEach(function (a) { o[a.nome] = a.texto; }); baixar(nomeBase() + " - DXF.zip", BimBcf.zipEscrever(o), "application/zip"); }
      else arqs.forEach(function (a) { baixar(a.nome, a.texto, "application/dxf"); });
      toast("DXF gerado. Para DWG: abra no AutoCAD e salve como DWG.", "ok");
    },
    xlsx: function () {
      BlocokExecXLS.gerar({ resultado: UI.res, orcamento: UI.orc, cronograma: UI.crono, obra: UI.obra, nome: UI.param.nome }, { nome: nomeBase(), ok: function () { toast("Planilha baixada.", "ok"); }, erro: function (e) { toast("Planilha: " + (e && e.message || e), "erro"); } });
    }
  };

  function acao(a, v) {
    try {
      if (a === "fechar") return fechar();
      if (a === "aba") { UI.aba = v; return render(); }
      if (a === "ler") { UI.obra = null; UI.fonte = ""; return calcular(); }
      if (a === "calcular") { if (UI.fonte === "exemplo") { UI.res = BlocokCalc.calcular(UI.obra); return render(); } UI.obra = null; return calcular(); }
      if (a === "pecas3d") return alternar3d();
      if (a === "exemplo") return exemplo();
      if (a === "ver") { UI.parede = v; UI.aba = "paredes"; return render(); }
      if (a === "fechar-par") { UI.parede = null; return render(); }
      if (DOC[a]) { if (!UI.res) return toast("Calcule primeiro.", "alerta"); return DOC[a](); }
    } catch (e) { toast("Blocok: " + (e && e.message ? e.message : e), "erro", 8000); }
  }
  /* exemplo sem modelo: casa térrea 10 × 8 com laje (o mesmo de tools/blocok-exemplo.js) */
  function exemplo() {
    var t = 0.2, H = 2.75;
    var ps = [
      { id: "P1", nome: "Fachada frontal", p1: [0, 0], p2: [10, 0], t: t, H: H, y0: 0, esp: 20, vaos: [{ tipo: "porta", x0: 1, x1: 1.9, y0: 0, y1: 2.1 }, { tipo: "janela", x0: 5.2, x1: 6.7, y0: 0.915, y1: 1.915 }] },
      { id: "P2", nome: "Lateral direita", p1: [10, 0], p2: [10, 8], t: t, H: H, y0: 0, esp: 20, vaos: [{ tipo: "janela", x0: 3, x1: 4.2, y0: 0.915, y1: 1.915 }] },
      { id: "P3", nome: "Fundos", p1: [10, 8], p2: [0, 8], t: t, H: H, y0: 0, esp: 20, vaos: [{ tipo: "porta", x0: 1.7, x1: 2.5, y0: 0, y1: 2.1 }] },
      { id: "P4", nome: "Lateral esquerda", p1: [0, 8], p2: [0, 0], t: t, H: H, y0: 0, esp: 20, vaos: [] },
      { id: "P5", nome: "Divisória quartos", p1: [4, 0], p2: [4, 4], t: 0.15, H: H, y0: 0, esp: 15, vaos: [{ tipo: "porta", x0: 2.6, x1: 3.4, y0: 0, y1: 2.1 }] }
    ];
    if (!UI.param.vento.v0) UI.param.vento.v0 = 35;
    if (UI.param.solo.tensaoAdm === "") UI.param.solo.tensaoAdm = 120;
    if (!UI.param.nome) UI.param.nome = "Residência exemplo";
    var r = BlocokModelo.obra(ps, opcoesDaObra());
    UI.obra = r.obra; UI.mapaParedes = ps; UI.fonte = "exemplo"; UI.avisos = r.avisos;
    try { UI.res = BlocokCalc.calcular(UI.obra); if (global.BlocokOrc) { UI.orc = BlocokOrc.orcar(UI.res, {}); UI.crono = BlocokOrc.cronograma(UI.res, {}); } } catch (e) { UI.erro = String(e && e.message || e); }
    render();
  }

  /* --------------------------------------------------------- fita */
  var COMANDOS = [
    { id: "blocok-exec", rotulo: "Blocok\nexecutivo", icone: "bloco", grande: true, dica: "Paredes Blocok: paginação em amarração, reforços, cálculo (NBR 6118/6123), orçamento e documentos." },
    { id: "blocok-pecas", rotulo: "Peças\nno 3D", icone: "camadas", grande: true, dica: "Mostra/esconde cada peça Blocok no 3D (faces, EPS, concreto dos reforços, juntas)." },
    { id: "blocok-docs", rotulo: "Documentos\nBlocok", icone: "relatorio", dica: "Memorial, pranchas, DXF, manual de montagem e planilha." }
  ];
  function registrar(reg) {
    ligarTipos();
    var R = global.BimRibbon;
    if (!liberado() || !R || !reg) return false;
    R.acrescentar("alvenaria", "Alvenaria", "Blocok", COMANDOS);
    var ids = COMANDOS.map(function (c) { return c.id; });
    if (global.BimDisciplinas && typeof global.BimDisciplinas.declarar === "function") { try { global.BimDisciplinas.declarar(ids, "civil"); } catch (e) {} }
    reg["blocok-exec"] = function () { abrir(); return true; };
    reg["blocok-pecas"] = function () { alternar3d(); return true; };
    reg["blocok-docs"] = function () { abrir("documentos"); return true; };
    setTimeout(function () { try { var sh = global.BimShell; if (sh && sh._raiz && typeof sh._sincAbas === "function") sh._sincAbas(); } catch (e) {} }, 0);
    return true;
  }
  function abrir(aba) {
    if (!liberado()) { toast("O módulo Blocok não está liberado nesta conta.", "alerta"); return false; }
    garantir(); if (aba) UI.aba = aba;
    if (!UI.res) calcular(); else render();
    return true;
  }

  global.BlocokExecUI = {
    registrar: registrar, abrir: abrir, fechar: fechar, montar3d: montar3d, liberado: liberado, alternar3d: alternar3d, exemplo: exemplo,
    /* para as e2e */
    estado: function () { return { aba: UI.aba, fonte: UI.fonte, paredes: UI.obra ? UI.obra.paredes.length : 0, ok: UI.res ? UI.res.ok : null, erros: UI.res ? UI.res.erros.length : 0, pendencias: UI.res ? UI.res.pendencias.length : 0, pecas3d: UI.pecas3d, instancias: grupo3 ? grupo3.children.reduce(function (s, m) { return s + (m.count || 0); }, 0) : 0 }; },
    _paredesDoModelo: paredesDoModelo,
    _resultado: function () { return UI.res; },
    _opDocs: function () { return opDocs(); }
  };
})(typeof window !== "undefined" ? window : this);
