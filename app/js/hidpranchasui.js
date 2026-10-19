/* =====================================================================
 * hidpranchasui.js — "GERAR PRANCHAS" do hidrossanitário: UM lugar, UM clique (fiação fina sobre js/hidpranchas.js).
 * Pedido do Rogério (18/10/2026): "capricha nas pranchas, nas configurações de gerar os desenhos: tem que ser bem
 * prático para a gente gerar".
 *
 *   HidPranchasUI.abrir(ctx)    a tela: disciplinas/sistemas, folha (A0–A4 ou automática), escala (automática ou fixa),
 *                               prefixo da numeração (HID-01…), revisão, conjuntos (plantas, cortes, isométricos,
 *                               perspectivas 3D por ambiente, esquema, detalhes, quadro), ambientes da perspectiva e a
 *                               vista, nível da planta, QR do portal; o carimbo RA vem do cadastro da empresa e da obra.
 *                               A configuração fica MEMORIZADA por obra (localStorage orcapro:hid:pranchas:<obra>).
 *   HidPranchasUI.gerar(ctx, cfg)  gera, baixa o PDF vetorial e o DXF (todas as folhas com carimbo) e abre as folhas
 *                               nas ABAS DE FOLHA do BIM (registro "Pranchas do hidrossanitário", origem "hidro").
 *   HidPranchasUI.abrir3dAmbiente(amb)  a PRÉVIA 3D do ambiente na modelagem: caixa de corte justa no cômodo, vista
 *                               Instalações (arquitetura translúcida), câmera isométrica.
 *   ctx = { resultado, modelo: { estado, avaliarFam }, pavimentos, empresa, obra, logo, obraKey }
 *
 * Sem DOM nos cálculos: a montagem da configuração (configDaTela, chave, ambientesDoCtx) é pura e testada em Node.
 * Teste: node tools/test-hid-pranchas-gerar.js · e2e: node tools/e2e-hid-pranchas.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function HP() { return dep("HidPranchas", "./hidpranchas.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  var CHAVE = "orcapro:hid:pranchas:";
  var NOME_SIS = { agua_fria: "Água fria", agua_quente: "Água quente", esgoto: "Esgoto e ventilação", pluvial: "Águas pluviais", incendio: "Incêndio", industrial: "Fluidos / gás", tratamento: "Tratamento" };
  var ESCALAS = ["auto", "20", "25", "50", "75", "100", "125"];   // hid:ok escalas de desenho oferecidas na tela (as mesmas do K2.escalas)
  var ULTIMO = { r: null, ctx: null };

  /* ------------------------------------------------------------ puro */
  function chave(obraKey) { return CHAVE + (txt(obraKey) || "geral"); }
  function lerMemoria(obraKey, ls) {
    var L = ls || (global.localStorage || null), v = null;
    try { v = L ? JSON.parse(L.getItem(chave(obraKey)) || "null") : null; } catch (e) { v = null; }
    return HP().normalizarConfig(v || {});
  }
  function gravarMemoria(obraKey, cfg, ls) {
    var L = ls || (global.localStorage || null);
    try { if (L) L.setItem(chave(obraKey), JSON.stringify(HP().normalizarConfig(cfg))); return true; } catch (e) { return false; }
  }
  /* os sistemas que o cálculo trouxe (a tela só oferece o que existe) */
  function sistemasDoResultado(r) {
    var S = (r && r.sistemas) || {}, out = ["agua_fria", "esgoto"];
    ["agua_quente", "pluvial", "incendio", "industrial", "tratamento"].forEach(function (k) { if (S[k]) out.push(k); });
    return out;
  }
  function ambientesDoCtx(ctx) {
    var P = HP(); if (!P || !ctx || !ctx.modelo) return [];
    try { return P.ambientesAuto(ctx.modelo.estado, arr(ctx.pavimentos)); } catch (e) { return []; }
  }
  /* o objeto de opções do HidPranchas.gerar: a configuração + o CARIMBO (empresa, RT, obra) */
  function opcoesDe(ctx, cfg) {
    var em = (ctx && ctx.empresa) || {}, ob = (ctx && ctx.obra) || {}, c = HP().normalizarConfig(cfg);
    return { pavimentos: arr(ctx && ctx.pavimentos), formato: c.formato, escala: c.escala, prefixo: c.prefixo, revisao: c.revisao, descricaoRevisao: c.descricaoRevisao,
             sistemas: c.sistemas, conjuntos: c.conjuntos, nivelPlanta: c.nivelPlanta, arquitetura: c.arquitetura, qr: c.qr, perspectiva: c.perspectiva,
             empresa: em.nome ? em : "", responsavel: txt(em.responsavel), registro: txt(em.crea), tituloProfissional: txt(em.titulo),
             obra: txt(ob.nome), proprietario: txt(ob.clienteNome), contratante: txt(ob.clienteNome), local: txt(ob.local || ob.endereco), logo: (ctx && ctx.logo) || null,
             ambientes: arr(ctx && ctx.ambientes).length ? ctx.ambientes : undefined };
  }
  /* o registro das folhas no BIM (Store bim_pranchas): as folhas prontas entram como IMAGEM INTEIRA (a folha gerada fora,
     com carimbo); o desenho em si fica só na sessão (refeito pelo Gerar — a folha nunca guarda uma cópia velha) */
  function registroFolhas(r, existente, obraId, o) {
    o = o || {};
    var novas = r.folhas.map(function (f) { return { id: "hid-" + f.id, conteudo: f.numero + " - " + f.titulo, escala: f.escala, blocos: [], imagemInteira: "hidsvg:" + f.id }; });
    /* mesclar = a folha avulsa (perspectiva de UM ambiente) entra junto das que já estão, trocando a de mesmo id */
    var folhas = o.mesclar && existente ? arr(existente.folhas).filter(function (f) { return !novas.some(function (q) { return q.id === f.id; }); }).concat(novas) : novas;
    folhas.forEach(function (f, i) { f.n = i + 1; });
    var reg = { nome: o.nome || "Pranchas do hidrossanitário", origem: o.origem || "hidro", formato: r.folhas[0] ? r.folhas[0].formato : "A1", orientacao: "paisagem", carimbo: { modelo: "RA" }, folhas: folhas };
    if (existente && existente.id) { reg.id = existente.id; reg.criadoEm = existente.criadoEm; }
    reg.obraId = txt(obraId);
    return reg;
  }
  function dataUrlSvg(svg) { return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); }

  /* ------------------------------------------------------------ tela */
  function marcado(v) { return v ? " checked" : ""; }
  function html(ctx, cfg) {
    var P = HP(), sis = sistemasDoResultado(ctx.resultado), ambs = ambientesDoCtx(ctx), em = ctx.empresa || {}, ob = ctx.obra || {};
    var h = '<div data-hpr="tela" data-modal-largo="1" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;font-size:13px">';
    h += '<fieldset style="border:1px solid var(--linha);border-radius:var(--raio-sm);padding:8px"><legend><b>Disciplinas e sistemas</b></legend>' +
      sis.map(function (s) { return '<label style="display:block"><input type="checkbox" data-hpr-sis="' + s + '"' + marcado(!cfg.sistemas.length || cfg.sistemas.indexOf(s) >= 0) + "> " + esc(NOME_SIS[s] || s) + "</label>"; }).join("") + "</fieldset>";
    h += '<fieldset style="border:1px solid var(--linha);border-radius:var(--raio-sm);padding:8px"><legend><b>Folha e escala</b></legend>' +
      '<label>Folha <select data-hpr="formato">' + P.FORMATOS.map(function (f) { return '<option value="' + f + '"' + (cfg.formato === f ? " selected" : "") + ">" + (f === "AUTO" ? "Automática (a menor que cabe)" : f) + "</option>"; }).join("") + "</select></label><br>" +
      '<label>Escala da planta <select data-hpr="escala">' + ESCALAS.map(function (e) { return '<option value="' + e + '"' + (String(cfg.escala) === e ? " selected" : "") + ">" + (e === "auto" ? "Automática (a maior que cabe)" : "1:" + e) + "</option>"; }).join("") + "</select></label><br>" +
      '<label>Planta <select data-hpr="nivel"><option value="medio"' + (cfg.nivelPlanta !== "baixo" ? " selected" : "") + '>Médio (tubo cheio, conexão branca)</option><option value="baixo"' + (cfg.nivelPlanta === "baixo" ? " selected" : "") + ">Baixo (linha única)</option></select></label><br>" +
      '<label><input type="checkbox" data-hpr="arq"' + marcado(cfg.arquitetura) + "> Arquitetura em meio-tom</label></fieldset>";
    h += '<fieldset style="border:1px solid var(--linha);border-radius:var(--raio-sm);padding:8px"><legend><b>Numeração e revisão</b></legend>' +
      '<label>Prefixo <input data-hpr="prefixo" value="' + esc(cfg.prefixo) + '" size="6"></label> <span class="muted">→ ' + esc(cfg.prefixo) + "-01, " + esc(cfg.prefixo) + "-02…</span><br>" +
      '<label>Revisão <input data-hpr="revisao" value="' + esc(cfg.revisao) + '" size="4"></label><br>' +
      '<label>Descrição <input data-hpr="descrev" value="' + esc(cfg.descricaoRevisao) + '" style="width:100%"></label></fieldset>';
    h += '<fieldset style="border:1px solid var(--linha);border-radius:var(--raio-sm);padding:8px"><legend><b>O que gerar</b></legend>' +
      P.CONJUNTOS.map(function (k) { return '<label style="display:block"><input type="checkbox" data-hpr-cj="' + k + '"' + marcado(cfg.conjuntos[k] !== false) + "> " + esc(P.ROTULO_CONJUNTO[k]) + "</label>"; }).join("") + "</fieldset>";
    h += '<fieldset style="border:1px solid var(--linha);border-radius:var(--raio-sm);padding:8px"><legend><b>Perspectiva 3D por ambiente</b></legend>' +
      (ambs.length ? ambs.map(function (a) { return '<div style="display:flex;gap:6px;align-items:center"><label style="flex:1"><input type="checkbox" data-hpr-amb="' + esc(a.nome) + '"' + marcado(!cfg.perspectiva.ambientes.length || cfg.perspectiva.ambientes.indexOf(a.nome) >= 0) + "> " + esc(a.nome) + '</label><button class="btn sm ghost" data-hpr-3d="' + esc(a.id) + '" title="Prévia: abre o 3D só deste ambiente (caixa de corte e arquitetura translúcida)">3D do ambiente</button></div>'; }).join("")
        : '<p class="muted">Nenhum ambiente com aparelho no modelo.</p>') +
      '<label>Vista <select data-hpr="vista">' + ["SE", "SO", "NO", "NE"].map(function (v) { return '<option value="' + v + '"' + (cfg.perspectiva.vista === v ? " selected" : "") + ">" + v + "</option>"; }).join("") + "</select></label></fieldset>";
    h += '<fieldset style="border:1px solid var(--linha);border-radius:var(--raio-sm);padding:8px"><legend><b>Carimbo e saída</b></legend>' +
      '<div class="muted" style="font-size:12px">Carimbo RA com o cadastro da empresa e da obra:<br>' + esc(em.nome || "(empresa sem nome no cadastro)") + " · RT " + esc(em.responsavel || "—") + " " + esc(em.crea || "") + "<br>Obra: " + esc(ob.nome || "—") + "</div>" +
      '<label>QR do portal da obra (link) <input data-hpr="qr" value="' + esc(cfg.qr) + '" style="width:100%" placeholder="vazio = sem QR"></label>' +
      '<label style="display:block"><input type="checkbox" data-hpr-out="pdf" checked> PDF vetorial</label><label style="display:block"><input type="checkbox" data-hpr-out="dxf" checked> DXF com carimbo (abre no CAD e salva em DWG)</label>' +
      '<label style="display:block"><input type="checkbox" data-hpr-out="abas" checked> Abrir nas abas de folha do BIM</label></fieldset>';
    return h + '</div><div data-hpr="msg" class="muted" style="margin-top:8px;font-size:12.5px"></div>';
  }
  /* lê a tela → configuração (puro sobre um "leitor" de elementos; no navegador é o document) */
  function configDaTela(raiz, base) {
    var c = clone(base), q = function (s) { return raiz.querySelector(s); }, qa = function (s) { return Array.prototype.slice.call(raiz.querySelectorAll(s)); };
    var sis = qa("[data-hpr-sis]"), marc = sis.filter(function (e) { return e.checked; }).map(function (e) { return e.getAttribute("data-hpr-sis"); });
    c.sistemas = marc.length === sis.length ? [] : marc;
    if (q('[data-hpr="formato"]')) c.formato = q('[data-hpr="formato"]').value;
    if (q('[data-hpr="escala"]')) c.escala = q('[data-hpr="escala"]').value;
    if (q('[data-hpr="nivel"]')) c.nivelPlanta = q('[data-hpr="nivel"]').value;
    if (q('[data-hpr="arq"]')) c.arquitetura = !!q('[data-hpr="arq"]').checked;
    if (q('[data-hpr="prefixo"]')) c.prefixo = q('[data-hpr="prefixo"]').value;
    if (q('[data-hpr="revisao"]')) c.revisao = q('[data-hpr="revisao"]').value;
    if (q('[data-hpr="descrev"]')) c.descricaoRevisao = q('[data-hpr="descrev"]').value;
    if (q('[data-hpr="qr"]')) c.qr = q('[data-hpr="qr"]').value;
    c.conjuntos = c.conjuntos || {}; qa("[data-hpr-cj]").forEach(function (e) { c.conjuntos[e.getAttribute("data-hpr-cj")] = !!e.checked; });
    var am = qa("[data-hpr-amb]"), amM = am.filter(function (e) { return e.checked; }).map(function (e) { return e.getAttribute("data-hpr-amb"); });
    c.perspectiva = { vista: q('[data-hpr="vista"]') ? q('[data-hpr="vista"]').value : "SE", ambientes: amM.length === am.length ? [] : amM };
    return HP().normalizarConfig(c);
  }
  function baixar(nome, dados, mime) {
    var d = global.document; if (!d) return false;
    try { var bl = new Blob([dados], { type: mime }), u = URL.createObjectURL(bl), a = d.createElement("a"); a.href = u; a.download = nome; d.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 5000); return true; } catch (e) { return false; }   // hid:ok 5 s até soltar a URL do arquivo
  }
  function toast(t, k) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info"); } catch (e) {} }

  /* ------------------------------------------------------------ gerar */
  function gerar(ctx, cfg, saida) {
    var P = HP(); saida = saida || { pdf: true, dxf: true, abas: true };
    if (!P) return { ok: false, avisos: ["js/hidpranchas.js não carregou."] };
    if (!ctx || !ctx.resultado) return { ok: false, avisos: ["Dimensione primeiro: sem resultado não há o que apresentar."] };
    var c = P.normalizarConfig(cfg), r = P.gerar(ctx.resultado, ctx.modelo, opcoesDe(ctx, c));
    ULTIMO.r = r; ULTIMO.ctx = ctx;
    if (!r || !r.ok) return r || { ok: false, avisos: [] };
    gravarMemoria(ctx.obraKey, c);
    var nome = (r.prefixo || "HID") + "-" + (r.revisao || "R00") + " projeto hidrossanitario";
    r.arquivos = [];
    if (saida.pdf) { var pdf = P.exportar(r, "pdf"); if (pdf && baixar(nome + ".pdf", pdf, "application/pdf")) r.arquivos.push(nome + ".pdf"); }
    if (saida.dxf) { var dxf = P.exportar(r, "dxf"); if (dxf && baixar(nome + ".dxf", dxf, "application/dxf")) r.arquivos.push(nome + ".dxf"); }
    if (saida.abas) r.abas = abrirNasAbas(r, ctx, saida.registro);
    return r;
  }
  /* as folhas nas ABAS DE FOLHA do BIM: um registro só por obra (o Gerar de novo SUBSTITUI as folhas — idempotente) */
  function abrirNasAbas(r, ctx, o) {
    o = o || {};
    var BF = global.BimFolhaUI; if (!BF || !BF.salvarRegistro || !global.Store) return null;
    var regs = []; try { regs = arr(BF.registros()); } catch (e) { regs = []; }
    var org = o.origem || "hidro", exist = regs.filter(function (x) { return x && x.origem === org; })[0] || null;
    var salvo = BF.salvarRegistro(registroFolhas(r, exist, ctx && ctx.obraId != null ? ctx.obraId : (ctx && ctx.obraKey), o));   /* a obra do BIM (o registro só aparece na obra dele) */
    if (!salvo) return null;
    BF._imagensExternas = BF._imagensExternas || {};
    r.folhas.forEach(function (f) { BF._imagensExternas["hidsvg:" + f.id] = dataUrlSvg(f.svg); });
    var id = BF.idFolha(salvo.id, "hid-" + r.folhas[0].id);
    try { if (BF.ativo && BF.ativo()) BF.abrir(id); } catch (e) { /* sem a casca do BIM: fica no registro */ }
    return { registro: salvo.id, primeira: id, folhas: r.folhas.length };
  }

  /* ------------------------------------------------------------ prévia 3D do ambiente na modelagem */
  function abrir3dAmbiente(amb, ctx, o) {
    o = o || {};
    var B = global.BIM; if (!amb || !B) return false;
    var pv = arr(ctx && ctx.pavimentos)[0] || { cota: 0 }, base = isFinite(+amb.base) ? +amb.base : (+pv.cota || 0), Kp = HP().K2;
    try { if (global.Gestao && global.Gestao._bimVxAtivar) global.Gestao._bimVxAtivar("3d"); } catch (eA) { /* sem abas */ }
    var y0 = base - Kp.perspFundo, y1 = base + Kp.perspAltura;
    /* a altura da caixa acompanha a rede do cômodo (o esgoto no rebaixo, o ramal no forro) */
    try { arr(ctx.modelo.estado.instalacoes.trechos).forEach(function (t) { [t.p1, t.p2].forEach(function (p) { if (p.x >= amb.x0 && p.x <= amb.x1 && p.z >= amb.z0 && p.z <= amb.z1) { y0 = Math.min(y0, p.y - Kp.perspFundo); y1 = Math.max(y1, Math.min(p.y, base + Kp.perspAlturaMax)); } }); }); } catch (e0) { /* sem rede */ }
    var min = [amb.x0, y0, amb.z0], max = [amb.x1, y1, amb.z1];
    try { if (B.vistaInstalacoes) B.vistaInstalacoes(true); } catch (e) { /* sem a vista Instalações */ }
    var ok = false;
    try { ok = B.caixaCorteEm ? B.caixaCorteEm(min, max, HP().K2.iso3d) : false; } catch (e2) { ok = false; }
    if (ok && o.salvar !== false) salvarVista3d(amb, min, max, ctx);
    toast(ok ? "3D do ambiente " + amb.nome + ": caixa de corte no cômodo, arquitetura translúcida" + (o.salvar !== false ? " — salvo no Navegador como “3D — " + amb.nome + "”." : ".") : "Não consegui abrir o 3D do ambiente (a vista 3D ainda não abriu).", ok ? "ok" : "aviso");
    return ok;
  }
  /* o "3D — <ambiente>" fica no Navegador de projeto (Pontos de vista): um registro por ambiente (abrir de novo SUBSTITUI);
     a câmera isométrica e a CAIXA DE CORTE do cômodo (hid3d) — reabrir pelo Navegador refaz a caixa (reabrir3d) */
  function salvarVista3d(amb, min, max, ctx) {
    var St = global.Store, BV = global.BimVista, G = global.Gestao; if (!St || !BV) return null;
    var eid = null; try { eid = global.Auth && global.Auth.empresaId ? global.Auth.empresaId() : null; } catch (e) { eid = null; }
    var obra = ctx && ctx.obraId != null ? ctx.obraId : (G ? G._bimSel || "" : ""), c = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    var dd = Math.sqrt(Math.pow(max[0] - min[0], 2) + Math.pow(max[1] - min[1], 2) + Math.pow(max[2] - min[2], 2));
    var v = BV.vista({ obraId: obra, nome: "3D — " + amb.nome, criadoEm: new Date().toISOString(), completa: false, camera: { pos: [c[0] + dd, c[1] + dd, c[2] + dd], alvo: c, up: [0, 1, 0], fov: HP().K2.fov3d } });
    if (!v) return null;
    var exist = []; try { exist = arr(St.listar(eid, "bim_vistas")).filter(function (x) { return x && x.hid3d && x.hid3d.ambiente === amb.id && String(x.obraId || "") === String(obra || ""); }); } catch (e2) { exist = []; }
    if (exist[0]) v.id = exist[0].id;
    v.hid3d = { ambiente: amb.id, nome: amb.nome, min: min, max: max };
    var salvo = null; try { salvo = St.salvar(eid, "bim_vistas", v); } catch (e3) { salvo = null; }
    try { if (G && G._bimVistaRender) G._bimVistaRender(); if (G && G._nivArvore) G._nivArvore(); } catch (e4) { /* sem navegador */ }
    return salvo;
  }
  function reabrir3d(v) {
    var B = global.BIM, h = v && v.hid3d; if (!B || !h) return false;
    try { if (global.Gestao && global.Gestao._bimVxAtivar) global.Gestao._bimVxAtivar("3d"); } catch (e) { /* sem abas */ }
    try { if (B.vistaInstalacoes) B.vistaInstalacoes(true); } catch (e2) { /* sem a vista Instalações */ }
    var ok = false; try { ok = B.caixaCorteEm ? B.caixaCorteEm(h.min, h.max, HP().K2.iso3d) : false; } catch (e3) { ok = false; }
    toast(ok ? "3D — " + h.nome + ": a caixa de corte do cômodo de volta." : "Não consegui reabrir o 3D do ambiente.", ok ? "ok" : "aviso");
    return ok;
  }
  /* o AMBIENTE do BIM (o cômodo desenhado) pelo id: a caixa pelo contorno calculado e a base */
  function ambienteBim(fid) {
    var B = global.BIM, st = null; try { st = B && B.editarEstado ? B.editarEstado() : null; } catch (e) { st = null; }
    var est = st && st.estado, id = txt(fid).replace(/^edit:/, ""), a = arr(est && est.ambientes).filter(function (x) { return x && x.id === id; })[0];
    var ct = a && a.calc ? arr(a.calc.contorno) : []; if (!a || ct.length < HP().K2.minContorno) return null;
    var xs = ct.map(function (q) { return +q.x; }), zs = ct.map(function (q) { return +q.z; });
    return { id: "bim:" + a.id, ambienteBim: a.id, nome: txt(a.nome || "Ambiente").toUpperCase(), x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), z0: Math.min.apply(null, zs), z1: Math.max.apply(null, zs),
             base: a.calc && isFinite(+a.calc.base) ? +a.calc.base : null };
  }
  /* o contexto da tela a partir do que está aberto (para a ação do ambiente, fora da tela Gerar pranchas) */
  function ctxAtual() {
    var B = global.BIM, st = null; try { st = B && B.editarEstado ? B.editarEstado() : null; } catch (e) { st = null; }
    var em = {}, ob = {}, logo = null, G = global.Gestao, pavs = [];
    try { if (global.Empresa && global.Empresa.dados) em = global.Empresa.dados() || {}; if (global.Empresa && global.Empresa.logo) logo = global.Empresa.logo(); } catch (e1) {}
    try { if (G && G._bimSel && global.Store && global.Auth) ob = global.Store.obter(global.Auth.empresaId(), "obras", G._bimSel) || {}; } catch (e2) {}
    try { arr(global.BimEdit && global.BimEdit.niveisAtuais ? global.BimEdit.niveisAtuais() : []).forEach(function (n) { if (n && isFinite(n.elevacao) && !/terreno|funda|sondag|cobertura|telhado/i.test(n.nome || "")) pavs.push({ nome: n.nome || "Nível", cota: n.elevacao }); }); } catch (e3) {}
    var R = global.HidCalcUI && global.HidCalcUI.estado ? global.HidCalcUI.estado.resultado : null;
    return { resultado: R, modelo: st ? { estado: st.estado, avaliarFam: B.familiaAvaliar } : null, pavimentos: pavs, empresa: em, obra: ob, logo: logo,
             obraKey: String((G && G._bimSel) || "geral"), obraId: String((G && G._bimSel) || "") };
  }
  /* "Para a prancha": a perspectiva SÓ deste ambiente, numa folha do registro "Perspectivas do hidrossanitário" */
  function paraPrancha(amb, ctx) {
    ctx = ctx || ctxAtual();
    if (!ctx.resultado) { toast("Dimensione primeiro (Instalações › Dimensionar): a perspectiva leva os DN do cálculo.", "aviso"); return null; }
    var c = lerMemoria(ctx.obraKey), cj = {};
    HP().CONJUNTOS.forEach(function (k) { cj[k] = k === "perspectivas"; });
    c.conjuntos = cj; c.perspectiva = { vista: c.perspectiva.vista, ambientes: [amb.nome] };
    var cx = {}; for (var k in ctx) if (Object.prototype.hasOwnProperty.call(ctx, k)) cx[k] = ctx[k];
    cx.ambientes = [amb];
    var r = HP().gerar(ctx.resultado, ctx.modelo, opcoesDe(cx, c));
    if (!r || !r.ok) { toast("A perspectiva não saiu: " + arr(r && r.avisos).join(" "), "aviso"); return r; }
    r.folhas = r.folhas.filter(function (f) { return f.tipo === "perspectiva"; });
    r.folhas.forEach(function (f) { f.id = "persp-" + amb.id; });
    if (!r.folhas.length) { toast("Sem tubulação neste ambiente para a perspectiva.", "aviso"); return r; }
    r.abas = abrirNasAbas(r, cx, { origem: "hidro-perspectiva", nome: "Perspectivas do hidrossanitário", mesclar: true });
    toast("Perspectiva de " + amb.nome + " na folha (aba de folha do BIM).", "ok");
    return r;
  }
  /* a seção "Hidrossanitário" nas Propriedades do AMBIENTE selecionado (clique na planta, no corte ou no 3D) */
  function secaoAmbiente(fid) {
    var a = ambienteBim(fid); if (!a) return [];
    return [{ nome: "Hidrossanitário", params: [
      { id: "hid-3d-amb", rotulo: "3D do ambiente", tipo: "botao", rotuloBotao: "Abrir 3D do ambiente", fn: function () { abrir3dAmbiente(a, ctxAtual(), { salvar: true }); } },
      { id: "hid-3d-prancha", rotulo: "Perspectiva", tipo: "botao", rotuloBotao: "Para a prancha", fn: function () { paraPrancha(a); } }] }];
  }

  function abrir(ctx) {
    var U = global.UI; if (!U || !U.modal) return false;
    var cfg = lerMemoria(ctx.obraKey);
    U.modal("Gerar pranchas — hidrossanitário", html(ctx, cfg), [
      { texto: "Cancelar", classe: "ghost", onClick: function () { U.fecharModal(); } },
      { texto: "Padrão", onClick: function () { gravarMemoria(ctx.obraKey, HP().configPadrao()); U.fecharModal(); abrir(ctx); } },
      { texto: "Gerar pranchas", classe: "primary", onClick: function () {
        var raiz = global.document.querySelector('[data-hpr="tela"]').parentNode, c = configDaTela(raiz, cfg), msg = raiz.querySelector('[data-hpr="msg"]');
        var sa = {}; Array.prototype.forEach.call(raiz.querySelectorAll("[data-hpr-out]"), function (e) { sa[e.getAttribute("data-hpr-out")] = !!e.checked; });
        var r = null; try { r = gerar(ctx, c, sa); } catch (e) { r = { ok: false, avisos: [e && e.message ? e.message : String(e)] }; }
        if (!r || !r.ok) { if (msg) msg.textContent = "Não gerou: " + arr(r && r.avisos).join(" "); return; }
        U.fecharModal();
        var v = r.verificacao || {};
        toast(r.folhas.length + " folha(s) geradas · sobreposição: texto×texto " + v.sobreposicoes + ", rótulo×tubo " + v.rotuloTubo + ", rótulo×cota " + v.rotuloCota + (arr(r.avisos).length ? " · " + r.avisos.length + " aviso(s)" : ""), (v.sobreposicoes || v.rotuloTubo || v.rotuloCota) ? "aviso" : "ok");
      } }
    ]);
    var el = global.document.querySelector('[data-hpr="tela"]');
    if (el) el.onclick = function (e) {
      var b = e.target.closest ? e.target.closest("[data-hpr-3d]") : null; if (!b) return;
      var id = b.getAttribute("data-hpr-3d"), a = ambientesDoCtx(ctx).filter(function (x) { return x.id === id; })[0];
      if (a) abrir3dAmbiente(a, ctx);
    };
    return true;
  }

  var HidPranchasUI = { abrir: abrir, gerar: gerar, abrir3dAmbiente: abrir3dAmbiente, reabrir3d: reabrir3d, secaoAmbiente: secaoAmbiente, paraPrancha: paraPrancha, ultimo: function () { return ULTIMO; },
    _int: { ambienteBim: ambienteBim, ctxAtual: ctxAtual, salvarVista3d: salvarVista3d, chave: chave, lerMemoria: lerMemoria, gravarMemoria: gravarMemoria, opcoesDe: opcoesDe, registroFolhas: registroFolhas, sistemasDoResultado: sistemasDoResultado, ambientesDoCtx: ambientesDoCtx, configDaTela: configDaTela, html: html, dataUrlSvg: dataUrlSvg } };
  global.HidPranchasUI = HidPranchasUI;
  if (typeof module !== "undefined" && module.exports) module.exports = HidPranchasUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
