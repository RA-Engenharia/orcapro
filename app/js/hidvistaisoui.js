/* =====================================================================
 * hidvistaisoui.js — HIDRO-3D: os COMANDOS e a TELA da vista "Isométrico do ambiente" / "Planta do ambiente" DENTRO do sistema.
 *
 *   No BIM, selecione o ambiente › Propriedades › Hidrossanitário › "Isométrico do ambiente":
 *     1) cria (ou reabre) a VISTA SALVA do ambiente × sistema em `bim_vistas` (campo hidIso — js/hidvistaiso.js): caixa de corte do ambiente,
 *        câmera isométrica 30° (SE/SO/NE/NO), visibilidade gráfica (arquitetura transparente, louça em contorno, instalação em destaque na cor do sistema);
 *     2) mostra a vista NA TELA: o render do modelo 3D (o MESMO three do BIM) + os balões/rótulos como anotação ligada à peça, auto-posicionados
 *        e ARRASTÁVEIS (a posição fica salva na vista);
 *     3) "Gerar folha do ambiente" = a prancha/caderno só ORGANIZA: coloca a vista salva (viewport) com a planta, as tabelas e o carimbo (js/hidcaderno.js).
 *   "Planta do ambiente" = a planta do próprio sistema recortada no ambiente, fundo branco, também salva como vista.
 * Os motores são os da folha (hidpranchas.js folhaPerspectiva, hidcaderno.js vistaIsoTela): a tela e a folha mostram a MESMA composição.
 * ===================================================================== */
(function (global) {
  "use strict";
  /* hid:geometria-inicio — módulo de DESENHO (mm de papel, px, proporção de vista, cores): nenhum valor de norma aqui (valor de norma vem só da biblioteca de normas, fora deste módulo) */
  function arr(a) { return Array.isArray(a) ? a : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function HP() { return global.HidPranchas; }
  function HC() { return global.HidCaderno; }
  function HV() { return global.HidVistaIso; }
  function R3() { return global.HidRender3D; }
  function HPU() { return global.HidPranchasUI; }
  function toast(t, k) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info"); } catch (e) { /* sem avisos na tela */ } }
  function eid() { try { return global.Auth && global.Auth.empresaId ? global.Auth.empresaId() : null; } catch (e) { return null; } }
  var ULT = { folha: null, tela: null, rasters: {} };

  /* ------------------------------------------------------------ dados */
  function contexto(ctx) {
    ctx = ctx || HPU()._int.ctxAtual();
    if (!HP() || !HC() || !HV() || !R3()) return { erro: "Os módulos do hidrossanitário (hidpranchas, hidcaderno, hidrender3d, hidvistaiso) não carregaram." };
    if (!ctx.resultado) return { erro: "Dimensione primeiro (Instalações › Dimensionar): a vista leva os DN do cálculo." };
    if (!ctx.modelo) return { erro: "Abra o BIM com o modelo: a vista sai da rede modelada." };
    var cfg = HPU()._int.lerMemoria(ctx.obraKey), op = HPU()._int.opcoesDe(ctx, cfg), c = null;
    try { c = HP()._int.ctxBase(ctx.resultado, ctx.modelo, op, "A3"); } catch (e) { return { erro: "Não montei o contexto das pranchas: " + (e && e.message ? e.message : e) }; }
    return { ctx: ctx, cfg: cfg, op: op, c: c, pv: c.pavs[0] };
  }
  /* o ambiente do BIM (cômodo desenhado) → o ambiente do caderno (o que tem a rede dentro) */
  function ambCaderno(cx, ambBim) {
    var lista = HC().ambientesDoModelo(cx.c, cx.pv), alvo = txt(ambBim && ambBim.nome).toUpperCase(), r = lista.filter(function (a) { return txt(a.nome).toUpperCase() === alvo; })[0];
    if (!r && ambBim) { var mx = (ambBim.x0 + ambBim.x1) / 2, mz = (ambBim.z0 + ambBim.z1) / 2; r = lista.filter(function (a) { return mx >= a.x0 && mx <= a.x1 && mz >= a.z0 && mz <= a.z1; })[0]; }
    return r || null;
  }
  function listaVistas() { try { return arr(global.Store.listar(eid(), "bim_vistas")).filter(function (v) { return v && v.hidIso; }); } catch (e) { return []; } }
  function salvarVista(v) {
    var G = global.Gestao;
    try { var s = global.Store.salvar(eid(), "bim_vistas", v); try { if (G && G._bimVistaRender) G._bimVistaRender(); if (G && G._nivArvore) G._nivArvore(); } catch (e2) { /* sem navegador */ } return s || v; } catch (e) { return null; }
  }
  function coresDo(c) {
    var CAM = { agua_fria: "AF", agua_quente: "AQ", esgoto: "ES", ventilacao: "VE", pluvial: "AP", gas: "GAS" }, cores = {};
    Object.keys(CAM).forEach(function (s) { var ca = c.E && c.E.camadas && c.E.camadas["HID-" + CAM[s] + "-TUBO"]; if (ca && ca.cor) cores[s] = ca.cor; });
    return cores;
  }
  function soma(cena) { var t = 0; cena.malhas.forEach(function (m) { t += m.pos.length * 7 + (m.pos[0] || 0) * 13 + (m.pos[m.pos.length - 1] || 0) * 17; }); return Math.round(t * 1000); }

  /* o RENDER da vista (three do BIM; a visibilidade gráfica salva na vista); guarda por chave — só refaz se o modelo/a vista mudaram */
  function rasterizar(vista, cx, am) {
    var pzv = HC().pzDaVista(cx.c, am, cx.pv, vista); if (!pzv) return null;
    var cena = R3().cena(pzv.cg, pzv.pz, { cores: coresDo(cx.c) }), hi = vista.hidIso;
    var chave = [vista.id, hi.quadrante, JSON.stringify(hi.caixa), JSON.stringify(hi.visibilidade), cena.malhas.length, soma(cena)].join("|");
    var ca = ULT.rasters[chave];
    if (!ca) {
      var B = global.BIM, T = B && B.three ? B.three() : null; if (!T) return { erro: "O 3D do BIM ainda não abriu (o render usa o three dele)." };
      var rr = R3().renderizar(T, cena, { largura: 2200, vis: hi.visibilidade }), url = rr.canvas.toDataURL("image/jpeg", 0.92);
      try { rr.renderer.dispose(); if (rr.renderer.forceContextLoss) rr.renderer.forceContextLoss(); rr.canvas.width = rr.canvas.height = 1; } catch (e) { /* já liberado */ }   /* solta a memória do contexto WebGL (o vigia de memória do app recarrega a página se subir) */
      var b64 = url.replace(/^data:image\/jpeg;base64,/, "");
      ca = { key: "r" + (Object.keys(ULT.rasters).length + 1), href: url, jpeg: global.atob(b64), pxW: rr.w, pxH: rr.h, u0: cena.proj.u0, u1: cena.proj.u1, v0: cena.proj.v0, v1: cena.proj.v1, malhas: cena.malhas.length, semMalha: cena.semMalha.length };
      ULT.rasters[chave] = ca;
    }
    var rs = {}; rs[pzv.chave] = ca;
    return { rasters: rs, raster: ca, chave: pzv.chave };
  }
  /* o RENDER da PLANTA do ambiente: vista superior ortográfica das MESMAS malhas 3D (tubos, conexões, peças, registros), plano de corte acima das louças,
     arquitetura cortada (cinza com contorno) e louça em linha fina — o três do BIM, nada de símbolo desenhado pelo gerador */
  function rasterizarPlanta(vista, cx, am) {
    var pzv = HC().pzDaPlanta(cx.c, am, cx.pv, vista); if (!pzv) return null;
    var ins = HC().insumosPlanta(cx.c, am, cx.pv, vista);
    var cena = R3().cenaPlanta(pzv.cg, pzv.pz, { cores: coresDo(cx.c), box: ins.box, paredes: ins.paredes, pilares: ins.pilares, loucas: ins.loucas, cotaPiso: ins.cotaPiso, yCorte: ins.yCorte, arqCor: ins.arqCor, arqContorno: ins.arqContorno, corLouca: ins.corLouca });
    var chave = [vista.id, "planta", JSON.stringify(ins.box), ins.yCorte, cena.malhas.length, soma(cena), ins.paredes.length, ins.loucas.length].join("|");
    var ca = ULT.rasters[chave];
    if (!ca) {
      var B = global.BIM, T = B && B.three ? B.three() : null; if (!T) return { erro: "O 3D do BIM ainda não abriu (o render usa o three dele)." };
      var rr = R3().renderizar(T, cena, { largura: 2000 }), url = rr.canvas.toDataURL("image/jpeg", 0.93);
      try { rr.renderer.dispose(); if (rr.renderer.forceContextLoss) rr.renderer.forceContextLoss(); rr.canvas.width = rr.canvas.height = 1; } catch (e) { /* já liberado */ }
      var b64 = url.replace(/^data:image\/jpeg;base64,/, "");
      ca = { key: "p" + (Object.keys(ULT.rasters).length + 1), href: url, jpeg: global.atob(b64), pxW: rr.w, pxH: rr.h, u0: cena.proj.u0, u1: cena.proj.u1, v0: cena.proj.v0, v1: cena.proj.v1, malhas: cena.malhas.length, semMalha: cena.semMalha.length };
      ULT.rasters[chave] = ca;
    }
    var rs = {}; rs[pzv.chave + "|planta"] = ca;
    return { rasters: rs, raster: ca, chave: pzv.chave + "|planta" };
  }
  function comporVista(vista, cx, am) {
    if (vista.hidIso.tipo === "planta") {
      var rp = rasterizarPlanta(vista, cx, am); if (!rp) return { ok: false, avisos: ["Sem tubulação do sistema neste ambiente."] };
      if (rp.erro) return { ok: false, avisos: [rp.erro] };
      var p = HC().vistaPlantaTela(cx.c, am, cx.pv, vista, { largura: 200, altura: 150, rasters: rp.rasters });
      return p.ok ? { ok: true, t: p, rz: rp, planta: true } : { ok: false, avisos: p.avisos };
    }
    var rz = rasterizar(vista, cx, am); if (!rz) return { ok: false, avisos: ["Sem tubulação do sistema neste ambiente."] };
    if (rz.erro) return { ok: false, avisos: [rz.erro] };
    var t = HC().vistaIsoTela(cx.c, am, cx.pv, vista, { rasters: rz.rasters });
    return t.ok ? { ok: true, t: t, rz: rz } : { ok: false, avisos: t.avisos };
  }

  /* ------------------------------------------------------------ criar / reabrir a vista (idempotente por obra × ambiente × sistema × tipo) */
  function criar(ambBim, ctx, o) {
    o = o || {};
    var cx = contexto(ctx); if (cx.erro) { toast(cx.erro, "aviso"); return null; }
    var am = ambCaderno(cx, ambBim); if (!am) { toast("O ambiente " + txt(ambBim && ambBim.nome) + " não tem rede modelada dentro dele.", "aviso"); return null; }
    var gs = []; try { gs = HC().gruposDoAmbiente(cx.c, am, cx.pv); } catch (e) { gs = []; }
    var grupo = o.grupo || (gs.some(function (g) { return g.id === "esgoto"; }) ? "esgoto" : (gs[0] && gs[0].id) || "esgoto");
    var obra = cx.ctx.obraId != null ? cx.ctx.obraId : "", tipo = o.tipo === "planta" ? "planta" : "iso";
    var hi0 = HV().nova({ ambiente: am, grupo: grupo, quadrante: o.quadrante, tipo: tipo, criadoEm: new Date().toISOString() }), id = HV().idDa(obra, hi0);
    var exist = listaVistas().filter(function (v) { return v.id === id; })[0], vista = exist || HV().registro({ obraId: obra, hidIso: hi0, criadoEm: hi0.criadoEm });
    if (exist && o.quadrante && HV().K.quadrantes.indexOf(o.quadrante) >= 0) vista.hidIso.quadrante = o.quadrante;
    var r = comporVista(vista, cx, am);
    if (!r.ok) { toast("A vista não saiu: " + arr(r.avisos).join(" "), "aviso"); return null; }
    if (!vista.hidIso.k && r.t.k) vista.hidIso.k = r.t.k;
    if (tipo === "iso") { /* a câmera do 3D da vista: a caixa do ambiente (como o "3D do ambiente") */
      var cxb = vista.hidIso.caixa, c0 = [(cxb.x0 + cxb.x1) / 2, (am.base != null ? am.base : cx.pv.cota) + 1.2, (cxb.z0 + cxb.z1) / 2], dd = 6;
      vista.camera = { pos: [c0[0] + dd, c0[1] + dd, c0[2] + dd], alvo: c0, up: [0, 1, 0], fov: HP().K2.fov3d };
    }
    var salvo = salvarVista(vista); if (!salvo) { toast("Não consegui salvar a vista (armazenamento cheio?).", "erro"); return null; }
    if (o.abrir !== false) abrirTela(vista, cx.ctx, { cx: cx, am: am });
    return vista;
  }
  function isometrico(ambBim, ctx, o) { var oo = {}; for (var k in (o || {})) oo[k] = o[k]; oo.tipo = "iso"; return criar(ambBim, ctx, oo); }
  function planta(ambBim, ctx, o) { var oo = {}; for (var k in (o || {})) oo[k] = o[k]; oo.tipo = "planta"; return criar(ambBim, ctx, oo); }
  /* reabrir pelo Navegador de projeto (Pontos de vista) */
  function reabrir(v) {
    var cx = contexto(); if (cx.erro) { toast(cx.erro, "aviso"); return false; }
    var am = HC().ambientesDoModelo(cx.c, cx.pv).filter(function (a) { return a.id === v.hidIso.ambiente.id || txt(a.nome).toUpperCase() === txt(v.hidIso.ambiente.nome).toUpperCase(); })[0];
    if (!am) { toast("O ambiente desta vista não está mais no modelo.", "aviso"); return false; }
    abrirTela(v, cx.ctx, { cx: cx, am: am }); return true;
  }

  /* ------------------------------------------------------------ a folha do ambiente: a prancha só ORGANIZA (viewport da vista) */
  function folha(vista, cx, am) {
    cx = cx || contexto(); if (cx.erro) { toast(cx.erro, "aviso"); return null; }
    am = am || ambCaderno(cx, { nome: vista.hidIso.ambiente.nome });
    var rz = rasterizar(vista, cx, am); if (!rz || rz.erro) { toast("Sem render da vista para a folha.", "aviso"); return null; }
    var vs = {}; vs[rz.chave] = vista;
    /* a folha CRIA a vista que faltar: a planta do ambiente do mesmo sistema (salva, como a do isométrico) */
    var obra = cx.ctx.obraId != null ? cx.ctx.obraId : "", hiP = HV().nova({ ambiente: am, grupo: vista.hidIso.grupo, tipo: "planta", criadoEm: new Date().toISOString() }), idP = HV().idDa(obra, hiP);
    var vP = listaVistas().filter(function (v) { return v.id === idP; })[0] || HV().registro({ obraId: obra, hidIso: hiP, criadoEm: hiP.criadoEm });
    var cp0 = comporVista(vP, cx, am); if (!cp0.ok) { toast("A planta do ambiente não saiu: " + arr(cp0.avisos).join(" "), "aviso"); return null; }
    if (!vP.hidIso.k && cp0.t.k) vP.hidIso.k = cp0.t.k;
    salvarVista(vP);
    var rps = {}; for (var kr in rz.rasters) rps[kr] = rz.rasters[kr]; for (var kp in cp0.rz.rasters) rps[kp] = cp0.rz.rasters[kp];
    var vsP = {}; vsP[rz.chave] = vP;
    var op = {}; for (var k in cx.op) if (Object.prototype.hasOwnProperty.call(cx.op, k)) op[k] = cx.op[k];
    op.ambiente = am.nome; op.grupo = vista.hidIso.grupo; op.rasters = rps; op.vistas = vs; op.vistasPlanta = vsP; op.revisao = op.revisao || "R00";
    var r = HC().previa(cx.ctx.resultado, cx.ctx.modelo, op);
    if (!r || !r.ok) { toast("A folha não saiu: " + arr(r && r.avisos).join(" "), "aviso"); return r; }
    var pdf = HC().exportar(r, "pdf");
    ULT.folha = { r: r, pdf: pdf, svg: r.paginas[0].svg, vista: vista.id, nome: "Folha " + am.nome + " — " + vista.hidIso.grupo + ".pdf" };
    baixar(ULT.folha.nome, pdf, "application/pdf");
    var v = r.verificacao || {};
    toast("Folha do ambiente " + am.nome + ": a vista “" + vista.nome + "” colocada na prancha · sobreposição " + v.sobreposicoes + ", rótulo×tubo " + v.rotuloTubo + (arr(r.avisos).length ? " · " + r.avisos.length + " aviso(s)" : ""), (v.sobreposicoes || v.rotuloTubo) ? "aviso" : "ok");
    return r;
  }
  /* ------------------------------------------------------------ o CADERNO do hidro a partir das VISTAS SALVAS (R05, Casa 487): cada vista "Isométrico do ambiente"
   * da obra vira a folha do ambiente × sistema (render das malhas + planta do ambiente salva); capa, abertura e notas do gerador do caderno */
  function plantaDaVista(vista, cx, am) {
    var obra = cx.ctx.obraId != null ? cx.ctx.obraId : "", hiP = HV().nova({ ambiente: am, grupo: vista.hidIso.grupo, tipo: "planta", criadoEm: new Date().toISOString() }), idP = HV().idDa(obra, hiP);
    var vP = listaVistas().filter(function (v) { return v.id === idP; })[0] || HV().registro({ obraId: obra, hidIso: hiP, criadoEm: hiP.criadoEm });
    var cp0 = comporVista(vP, cx, am); if (!cp0.ok) return { erro: arr(cp0.avisos).join(" ") };
    if (!vP.hidIso.k && cp0.t.k) vP.hidIso.k = cp0.t.k;
    salvarVista(vP);
    return { vista: vP, rz: cp0.rz };
  }
  function caderno(o) {
    o = o || {};
    var cx = contexto(); if (cx.erro) { toast(cx.erro, "aviso"); return null; }
    var obra = String(cx.ctx.obraId != null ? cx.ctx.obraId : ""), ambs = HC().ambientesDoModelo(cx.c, cx.pv), rs = {}, vs = {}, vsP = {}, faltam = [], n = 0;
    function up(s) { return txt(s).toUpperCase(); }
    listaVistas().filter(function (v) { return txt(v.obraId) === obra && v.hidIso.tipo === "iso"; }).forEach(function (v) {
      var am = ambs.filter(function (a) { return a.id === v.hidIso.ambiente.id || up(a.nome) === up(v.hidIso.ambiente.nome); })[0];
      if (!am) { faltam.push(v.nome + " (ambiente fora do modelo)"); return; }
      var rz = rasterizar(v, cx, am); if (!rz || rz.erro) { faltam.push(v.nome + " (sem render)"); return; }
      var pp = plantaDaVista(v, cx, am); if (pp.erro) { faltam.push(v.nome + " (planta: " + pp.erro + ")"); return; }
      for (var k1 in rz.rasters) rs[k1] = rz.rasters[k1]; for (var k2 in pp.rz.rasters) rs[k2] = pp.rz.rasters[k2];
      vs[rz.chave] = v; vsP[rz.chave] = pp.vista; n++;
    });
    if (!n) { toast("Nenhuma vista 'Isométrico do ambiente' salva nesta obra: crie as vistas pelo ambiente (Propriedades › Hidrossanitário).", "aviso"); return null; }
    var op = {}; for (var k in cx.op) if (Object.prototype.hasOwnProperty.call(cx.op, k)) op[k] = cx.op[k];
    op.rasters = rs; op.vistas = vs; op.vistasPlanta = vsP; op.revisao = op.revisao || "R00";
    var r = HC().gerar(cx.ctx.resultado, cx.ctx.modelo, op);
    if (!r || !r.ok) { toast("O caderno não saiu: " + arr(r && r.avisos).join(" "), "aviso"); return r; }
    if (faltam.length) r.avisos.push("Vistas fora do caderno: " + faltam.join("; "));
    var pdf = HC().exportar(r, "pdf");
    ULT.caderno = { r: r, pdf: pdf, nome: "Caderno hidrossanitário " + op.revisao + ".pdf", vistas: n, faltam: faltam };
    if (o.baixar !== false) baixar(ULT.caderno.nome, pdf, "application/pdf");
    var v0 = r.verificacao || {};
    toast("Caderno do hidro: " + r.paginas.length + " página(s), " + n + " folha(s) do modelo · sobreposição " + v0.sobreposicoes + ", rótulo×tubo " + v0.rotuloTubo + (faltam.length ? " · " + faltam.length + " vista(s) fora" : ""), (v0.sobreposicoes || v0.rotuloTubo || faltam.length) ? "aviso" : "ok");
    return r;
  }
  function baixar(nome, dados, mime) {
    var d = global.document; if (!d || !dados) return false;
    try { var bl = new Blob([dados], { type: mime }), u = URL.createObjectURL(bl), a = d.createElement("a"); a.href = u; a.download = nome; d.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 5000); return true; } catch (e) { return false; }
  }

  /* ------------------------------------------------------------ a TELA da vista */
  function fecharTela() { var e = global.document.getElementById("hvi-tela"); if (e && e.parentNode) e.parentNode.removeChild(e); ULT.tela = null; }
  function abrirTela(vista, ctx, o) {
    var d = global.document; if (!d) return false;
    o = o || {}; var cx = o.cx || contexto(ctx), am = o.am; if (cx.erro) { toast(cx.erro, "aviso"); return false; }
    if (!am) am = ambCaderno(cx, { nome: vista.hidIso.ambiente.nome }); if (!am) return false;
    fecharTela();
    var raiz = d.createElement("div"); raiz.id = "hvi-tela";
    raiz.setAttribute("style", "position:fixed;inset:0;z-index:9500;background:#dcdce0;display:flex;flex-direction:column;font:13px system-ui,Segoe UI,Arial,sans-serif;color:#222");
    var quads = HV().K.quadrantes.map(function (q) { return '<option value="' + q + '"' + (q === vista.hidIso.quadrante ? " selected" : "") + ">" + q + "</option>"; }).join("");
    var iso = vista.hidIso.tipo !== "planta";
    /* R05 (Casa 487): o SISTEMA da vista (água; esgoto e ventilação; gás…) escolhido aqui — cada um vira a sua vista salva (idempotente por ambiente × sistema × tipo) */
    var gsT = []; try { gsT = HC().gruposDoAmbiente(cx.c, am, cx.pv); } catch (eG) { gsT = []; }
    var selG = gsT.length > 1 ? "<label>Sistema <select data-hvi=\"grupo\">" + gsT.map(function (g) { return "<option value=\"" + esc(g.id) + "\"" + (g.id === vista.hidIso.grupo ? " selected" : "") + ">" + esc(g.nome) + "</option>"; }).join("") + "</select></label>" : "";
    raiz.innerHTML = '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 12px;background:#2b2b2f;color:#fff">' +
      '<b data-hvi="titulo" style="margin-right:8px">' + esc(vista.nome) + "</b>" +
      selG + (iso ? '<label>Quadrante <select data-hvi="quad">' + quads + "</select></label>" +
        '<button data-hvi="auto" title="Recompõe os balões; os que você arrastou ficam onde estão">Auto-posicionar balões</button>' +
        '<button data-hvi="soltar" title="Devolve ao automático os balões que você arrastou">Soltar balões movidos</button>' : "") +
      '<button data-hvi="folha">Gerar folha do ambiente</button><button data-hvi="caderno" title="Junta as vistas salvas desta obra (todos os ambientes e sistemas) no caderno do hidro">Gerar caderno (vistas salvas)</button><button data-hvi="fechar" style="margin-left:auto">Fechar</button></div>' +
      '<div style="flex:1;overflow:auto;padding:12px;display:flex;justify-content:center;align-items:flex-start"><div data-hvi="papel" style="background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.25);width:min(100%,calc((100vh - 120px) * 243 / 178))"></div></div>' +
      '<div data-hvi="rodape" style="padding:6px 12px;background:#fff;font-size:12px;border-top:1px solid #bbb"></div>';
    d.body.appendChild(raiz);
    ULT.tela = { vista: vista, cx: cx, am: am };
    function pintar() {
      var cx2 = ULT.tela.cx, r = comporVista(vista, cx2, am), papel = raiz.querySelector('[data-hvi="papel"]'), rod = raiz.querySelector('[data-hvi="rodape"]');
      if (!r.ok) { papel.innerHTML = '<p style="padding:20px">' + esc(arr(r.avisos).join(" ")) + "</p>"; raiz.setAttribute("data-ok", "0"); return; }
      var t = r.t; papel.innerHTML = t.svg.replace(/ width="[\d.]+mm" height="[\d.]+mm"/, ' width="100%" style="display:block"');
      var svg = papel.querySelector("svg"); ULT.tela.res = t.res || null; ULT.tela.t = t;
      if (t.res) { montarAlcas(svg, vista, t, pintarSalvando); }
      var res = t.res, nb = res ? res.itens.length : 0;
      raiz.setAttribute("data-ok", "1"); raiz.setAttribute("data-marcacoes", String(nb)); raiz.setAttribute("data-cruzamentos", String(res ? res.cruzamentos : 0)); raiz.setAttribute("data-orfas", String(res ? res.orfaos.length : 0));
      var h = (iso || res) ? (nb + " marcação(ões) ligadas às peças do modelo · " + (res ? res.cruzamentos : 0) + " chamada(s) cruzada(s) · arraste um balão para reposicionar (fica salvo na vista)" +
        (res && res.orfaos.length ? ' · <b style="color:#b00">órfãs: ' + res.orfaos.map(function (q) { return esc(q.s || q.key) + ' <a href="#" data-hvi-rm="' + esc(q.key) + '">remover</a>'; }).join(", ") + "</b>" : "")) : ("Planta do ambiente — escala 1:" + (t.den || "?") + " · fundo branco");
      if (!iso && res) h = "Planta do ambiente 1:" + (t.den || "?") + " · vista superior das malhas do modelo · " + h;
      rod.innerHTML = h + (arr(t.avisos).length ? " · " + arr(t.avisos).length + " aviso(s): " + esc(arr(t.avisos).slice(0, 2).join(" | ")) : "");
    }
    function pintarSalvando() { salvarVista(vista); pintar(); }
    raiz.addEventListener("click", function (ev) {
      var rm = ev.target.closest ? ev.target.closest("[data-hvi-rm]") : null;
      if (rm) { ev.preventDefault(); HV().soltar(vista, rm.getAttribute("data-hvi-rm")); pintarSalvando(); return; }
      var b = ev.target.closest ? ev.target.closest("[data-hvi]") : null; if (!b) return; var a = b.getAttribute("data-hvi");
      if (a === "fechar") fecharTela();
      else if (a === "auto") { pintar(); toast("Balões recompostos; os que você arrastou ficaram onde estão.", "ok"); }
      else if (a === "soltar") { HV().soltar(vista); pintarSalvando(); }
      else if (a === "folha") folha(vista, ULT.tela.cx, am);
      else if (a === "caderno") caderno();
    });
    raiz.addEventListener("change", function (ev) { var s = ev.target; if (s && s.getAttribute && s.getAttribute("data-hvi") === "quad") { vista.hidIso.quadrante = s.value; pintarSalvando(); }
      else if (s && s.getAttribute && s.getAttribute("data-hvi") === "grupo" && s.value !== vista.hidIso.grupo) criar({ nome: vista.hidIso.ambiente.nome }, ctx, { grupo: s.value, tipo: vista.hidIso.tipo }); });
    pintar();
    return true;
  }
  /* alças para ARRASTAR cada marcação; ao soltar grava o deslocamento da peça na vista e recompõe */
  function montarAlcas(svg, vista, t, depois) {
    var NS = "http://www.w3.org/2000/svg", g = global.document.createElementNS(NS, "g"), esc0 = t.k && vista.hidIso.k ? t.k / vista.hidIso.k : 1;
    g.setAttribute("data-hvi-alcas", "1"); svg.appendChild(g);
    function mm(ev) { var pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; var m = svg.getScreenCTM(); return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 }; }
    t.res.itens.forEach(function (it) {
      if (it.tipo === "dn" || it.tipo === "nivel") return;
      var h = it.r ? global.document.createElementNS(NS, "circle") : global.document.createElementNS(NS, "rect");
      if (it.r) { h.setAttribute("cx", it.x); h.setAttribute("cy", it.y); h.setAttribute("r", it.r + 0.4); }
      else { h.setAttribute("x", it.x - it.w / 2); h.setAttribute("y", it.y - it.h / 2); h.setAttribute("width", it.w); h.setAttribute("height", it.h); }
      h.setAttribute("fill", "rgba(0,120,255,0.001)"); h.setAttribute("stroke", it.manual ? "rgba(0,120,255,.55)" : "none"); h.setAttribute("stroke-width", "0.3"); h.setAttribute("data-hvi-alca", it.key); h.setAttribute("style", "cursor:grab;touch-action:none");
      var p0 = null, alvos = [];
      h.addEventListener("pointerdown", function (ev) {
        ev.preventDefault(); p0 = mm(ev); try { h.setPointerCapture(ev.pointerId); } catch (e) { /* sem captura */ }
        alvos = [].slice.call(svg.querySelectorAll('[data-vi="' + it.key.replace(/"/g, "") + '"]')).concat([h]);
      });
      h.addEventListener("pointermove", function (ev) {
        if (!p0) return; var p = mm(ev), dx = p.x - p0.x, dy = p.y - p0.y;
        alvos.forEach(function (e) { e.setAttribute("transform", "translate(" + dx + " " + dy + ")"); });
      });
      h.addEventListener("pointerup", function (ev) {
        if (!p0) return; var p = mm(ev), dx = p.x - p0.x, dy = p.y - p0.y; p0 = null;
        if (Math.abs(dx) < 0.2 && Math.abs(dy) < 0.2) { alvos.forEach(function (e) { e.removeAttribute("transform"); }); return; }
        HV().mover(vista, it.key, it.x + dx, it.y + dy, it.ax, it.ay, esc0, it.s, it.ai); depois();
      });
      g.appendChild(h);
    });
  }

  var HidVistaIsoUI = { criar: criar, isometrico: isometrico, planta: planta, reabrir: reabrir, folha: folha, caderno: caderno, abrirTela: abrirTela, fechar: fecharTela, vistas: listaVistas, ultimo: function () { return ULT; },
    _int: { contexto: contexto, ambCaderno: ambCaderno, rasterizar: rasterizar, rasterizarPlanta: rasterizarPlanta, comporVista: comporVista } };
  global.HidVistaIsoUI = HidVistaIsoUI;
  if (typeof module !== "undefined" && module.exports) module.exports = HidVistaIsoUI;
  /* hid:geometria-fim */
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
