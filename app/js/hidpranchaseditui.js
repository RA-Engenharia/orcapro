/* =====================================================================
 * hidpranchaseditui.js — AS PRANCHAS DO HIDROSSANITÁRIO COMO FOLHAS EDITÁVEIS (fiação fina sobre js/hidpranchasedit.js). ETAPA 3, 17/11/2026.
 * Pedido do Rogério: "as pranchas hidro geradas viram FOLHAS SALVAS no projeto (as mesmas folhas do BIM), reabríveis e editáveis; em cada vista o usuário
 * arrasta o crop e a profundidade, gira o isométrico (SE/SO/NE/NO, órbita livre e travar), esconde/mostra por categoria e por elemento, move/redimensiona a
 * viewport e move rótulos e balões. REGERAR NÃO APAGA O AJUSTE MANUAL; há 'voltar ao automático' por vista; o PDF sai igual à tela."
 *
 * NÃO DUPLICA nada do BIM: a folha continua sendo a aba de folha do BimFolhaUI (registro `bim_pranchas`, imagemInteira "hidsvg:<id>"); aqui só entram
 *   (1) o SNAPSHOT do desenho automático de cada folha (IndexedDB, por obra) — a folha REABRE depois de recarregar o app, sem Dimensionar;
 *   (2) por cima da folha aberta, uma camada de edição (a vista clicada, arrastar a viewport, alça de tamanho, rótulos arrastáveis) e um painel;
 *   (3) os comandos que o BIM já tem: "Pegar câmera do 3D" lê a câmera do 3D (a que o BIM.travar prende), "Travar câmera 3D" = BIM.travar e "Salvar como
 *       vista 3D" = o comando da fita (Gestao._bimVistaSalvar3d); a visibilidade por categoria/disciplina é a do BimFoco (1.2.370), a mesma lista da fita.
 * O ajuste de DESENHO (viewport, rótulos, camadas) aplica-se na hora sobre o SVG guardado (sem refazer nada); o ajuste que muda a FOTO do modelo (câmera, crop,
 * categoria/peça escondida) refaz a geração com o cache de fotos da sessão (só a foto cuja entrada mudou é refeita).
 *
 *   HidPranchasEditUI.aoPintar(BimFolhaUI, tabId, achado, tela)   chamado pelo BimFolhaUI.pintar em toda folha "hidsvg:"
 *   HidPranchasEditUI.registrar(r, obraKey)  guarda o resultado do gerar (snapshot na sessão e no IndexedDB)
 *   HidPranchasEditUI.restaurar(obraKey)     Promise<bool>: recoloca as folhas guardadas (depois de recarregar o app)
 *   HidPranchasEditUI.pdfVetorial(BimFolhaUI, itens, nome)  PDF vetorial (svgpdf) das folhas hidro como estão na tela
 * Teste: tools/test-hid-pranchas-editaveis.js (motor) · e2e: tools/e2e-hid-pranchas-editaveis.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function EX() { return dep("HidPranchasEdit", "./hidpranchasedit.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function r2(v) { return Math.round(v * 100) / 100; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function toast(t, k) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info"); } catch (e) { /* sem UI */ } }
  function dataUrlSvg(svg) { return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); }
  var PREFIXO_SVG = "data:image/svg+xml;charset=utf-8,";
  function svgDeUrl(u) { u = String(u); try { return decodeURIComponent(u.indexOf(PREFIXO_SVG) === 0 ? u.slice(PREFIXO_SVG.length) : u); } catch (e) { return ""; } }

  /* hid:geometria-inicio — tamanhos de TELA (px, mm de papel, ms) da edição: nenhum valor de norma aqui */
  var K = { alca: 4, ponto: 2.2, passo: 0.1, esperaFoto: 450, planoW: 250, planoH: 160, maxPecas: 300, margemPecas: 0.5, margemPlano: 0.35, limiarMover: 0.8, kMin: 0.3, minLadoCrop: 0.1 };
  /* hid:geometria-fim */
  var NOME_CAM = { "HID-AF-TUBO": "Tubo de água fria", "HID-AQ-TUBO": "Tubo de água quente", "HID-ES-TUBO": "Tubo de esgoto", "HID-VE-TUBO": "Tubo de ventilação", "HID-CONTEXTO": "Arquitetura e contexto", "HID-COTA": "Cotas e chamadas", "HID-TITULO": "Títulos", "HID-CONEXAO": "Conexões" };

  /* ------------------------------------------------------------ estado da sessão */
  var FOLHAS = {};            /* id da folha (sem "hidsvg:") → { id, numero, titulo, svgBase, editaveis } */
  var MODELO = { vistas: {}, imagens: {} };   /* vistasModelo do gerar (caixa automática e atual) e as imagens por chave (para o PDF) */
  var ST = { obra: null, aj: null, sel: {}, modo: {}, msg: "", painel: null, pecas: null, foto: null, ocupado: false };

  function obraDe(BF) { try { return BF && BF.obraKey ? BF.obraKey() : "geral"; } catch (e) { return "geral"; } }
  function ajustes(obra) { if (ST.obra !== obra || !ST.aj) { ST.obra = obra; ST.aj = EX().ler(obra); } return ST.aj; }
  function gravarAj(obra, aj) {
    ST.obra = obra; ST.aj = EX().normalizar(aj);
    /* revisão 21/11: armazenamento cheio/bloqueado = o ajuste vale só nesta sessão; avisar em vez de perder calado ao recarregar */
    ST.naoGravou = EX().gravar(obra, ST.aj) === false;
  }
  function svgAtual(id) { var F = FOLHAS[id]; return F ? EX().aplicarSvg(F.svgBase, ajustes(ST.obra || "geral")) : ""; }
  /* a parte do ajuste que muda a FOTO do modelo (assinatura): se mudou, regera */
  function assinaturaFoto(aj) {
    var o = {}; Object.keys(aj.vistas).forEach(function (k) { var v = aj.vistas[k], x = {}; if (v.cam) x.cam = v.cam; if (v.crop) x.crop = v.crop; if (v.oculto && (v.oculto.cats.length || v.oculto.discs.length || v.oculto.uids.length)) x.oc = { c: v.oculto.cats, d: v.oculto.discs, u: v.oculto.uids }; if (Object.keys(x).length) o[k] = x; });
    return JSON.stringify(o);
  }

  /* ------------------------------------------------------------ persistência (IndexedDB, por obra): a folha reabre depois de recarregar o app */
  function kIdb(obra, sufixo) { return "hidpr:" + obra + ":" + sufixo; }
  function guardar(obra, r) {
    var I = global.Idb; if (!I || !I.set) return Promise.resolve(false);
    var ids = r.folhas.map(function (f) { return f.id; }), ps = [];
    r.folhas.forEach(function (f) { ps.push(Promise.resolve(I.set(kIdb(obra, "folha:" + f.id), { id: f.id, numero: f.numero, titulo: f.titulo, svgBase: f.svgBase || f.svg, editaveis: f.editaveis || [] }))["catch"](function () { return null; })); });
    ps.push(Promise.resolve(I.set(kIdb(obra, "meta"), { vistas: r.vistasModelo || {}, imagens: r.imagensPorChave || {} }))["catch"](function () { return null; }));
    ps.push(Promise.resolve(I.set(kIdb(obra, "indice"), { ids: ids, ts: Date.now() }))["catch"](function () { return null; }));
    return Promise.all(ps).then(function () { return true; });
  }
  function registrar(r, obra) {
    if (!r || !r.ok) return false;
    obra = obra || "geral"; ST.obra = obra;
    FOLHAS = {};
    arr(r.folhas).forEach(function (f) { FOLHAS[f.id] = { id: f.id, numero: f.numero, titulo: f.titulo, svgBase: f.svgBase || f.svg, editaveis: arr(f.editaveis) }; });
    MODELO = { vistas: r.vistasModelo || {}, imagens: r.imagensPorChave || {} };
    guardar(obra, r);
    return true;
  }
  function restaurar(obra) {
    var I = global.Idb; obra = obra || "geral";
    if (!I || !I.get) return Promise.resolve(false);
    return Promise.resolve(I.get(kIdb(obra, "indice"))).then(function (ix) {
      if (!ix || !arr(ix.ids).length) return false;
      return Promise.all(ix.ids.map(function (id) { return Promise.resolve(I.get(kIdb(obra, "folha:" + id)))["catch"](function () { return null; }); }).concat([Promise.resolve(I.get(kIdb(obra, "meta")))["catch"](function () { return null; })])).then(function (v) {
        var meta = v[v.length - 1]; FOLHAS = {}; ST.obra = obra;
        v.slice(0, -1).forEach(function (f) { if (f && f.id) FOLHAS[f.id] = f; });
        MODELO = { vistas: (meta && meta.vistas) || {}, imagens: (meta && meta.imagens) || {} };
        return Object.keys(FOLHAS).length > 0;
      });
    })["catch"](function () { return false; });
  }
  /* o SVG ajustado de cada folha para a aba de folha do BIM (e para o CAD/DWG, que lê o mesmo registro) */
  function publicar(BF) {
    BF._imagensExternas = BF._imagensExternas || {};
    Object.keys(FOLHAS).forEach(function (id) { BF._imagensExternas["hidsvg:" + id] = dataUrlSvg(svgAtual(id)); });
  }
  function repintar(BF) {
    publicar(BF);
    Object.keys(BF._telas || {}).forEach(function (tid) { try { var a = BF.achar(tid); if (a && /^hidsvg:/.test(a.folha.imagemInteira || "")) BF.pintar(tid); } catch (e) { /* aba fechada */ } });
  }

  /* ------------------------------------------------------------ mudar o ajuste (UM caminho para a tela toda) */
  function mudar(BF, fn) {
    var obra = obraDe(BF), antes = ajustes(obra), depois = EX().normalizar(fn(clone(antes)));
    var refoto = assinaturaFoto(antes) !== assinaturaFoto(depois);
    gravarAj(obra, depois); repintar(BF);
    if (ST.naoGravou) { ST.msg = "Atenção: não consegui guardar o ajuste neste computador (armazenamento cheio ou bloqueado). Ele vale até fechar o app."; atualizarPainel(BF); }
    if (refoto) agendarFoto(BF);   /* sem foto a refazer: a repintada da aba (repintar) já remonta o painel */
  }
  function agendarFoto(BF) {
    ST.msg = "Foto do 3D vai ser refeita…"; atualizarPainel(BF);
    if (ST.foto) clearTimeout(ST.foto);
    ST.foto = setTimeout(function () { ST.foto = null; refazerFoto(BF); }, K.esperaFoto);
  }
  function refazerFoto(BF) {
    var U = global.HidPranchasUI;
    if (!U || !U.regerar) { ST.msg = "O gerador de pranchas não está carregado."; atualizarPainel(BF); return null; }
    ST.msg = "Refazendo a foto do 3D…"; ST.ocupado = true; atualizarPainel(BF);
    var r = null;
    try { r = U.regerar(); } catch (e) { r = null; }
    ST.ocupado = false;
    if (!r || !r.ok) { ST.msg = "Ajuste guardado. Para refazer a foto do 3D, dimensione de novo (Instalações › Dimensionar): ele entra na próxima geração."; atualizarPainel(BF); return null; }
    ST.msg = "Foto do 3D refeita com o seu ajuste."; repintar(BF);
    return r;
  }

  /* ------------------------------------------------------------ a tela: camada sobre a folha + painel */
  function limparPainel() { if (ST.painel && ST.painel.parentNode) ST.painel.parentNode.removeChild(ST.painel); ST.painel = null; }
  function blocoDe(F, chave) { var b = null; arr(F && F.editaveis).forEach(function (e) { if (e.chave === chave) b = e; }); return b; }
  /* o retângulo da vista como está NA TELA (com a viewport ajustada) */
  function retangulo(b, v) {
    var vp = v && v.vp ? v.vp : { dx: 0, dy: 0, k: 1 };
    return { x: b.x + vp.dx, y: b.y + vp.dy, w: b.w * vp.k, h: b.h * vp.k, k: vp.k };
  }
  function mmCss(v) { return r3(v) + "mm"; }

  function aoPintar(BF, tabId, a, t) {
    limparPainel();
    var fi = txt(a && a.folha && a.folha.imagemInteira); if (!/^hidsvg:/.test(fi)) return false;
    var fid = fi.replace(/^hidsvg:/, ""), obra = obraDe(BF);
    if (!FOLHAS[fid]) {   /* depois de recarregar o app: o snapshot volta do IndexedDB e a aba se repinta com a folha */
      if (!ST.restaurando) {
        ST.restaurando = restaurar(obra).then(function (ok) { ST.restaurando = null; if (ok && FOLHAS[fid]) { publicar(BF); try { BF.pintar(tabId); } catch (e) { /* aba fechada */ } } else if (ok) toast("Esta folha não está mais guardada: gere as pranchas de novo.", "aviso"); });
      }
      return false;
    }
    if (!(BF._imagensExternas || {})[fi]) { publicar(BF); try { BF.pintar(tabId); } catch (e) { /* aba fechada */ } return true; }
    var folhaEl = t && t.el ? t.el.querySelector(".folha") : null; if (!folhaEl) return false;
    var aj = ajustes(obra), F = FOLHAS[fid], camada = global.document.createElement("div");
    camada.setAttribute("data-hid-edit", fid); camada.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none";
    var sel = ST.sel[tabId] && blocoDe(F, ST.sel[tabId]) ? ST.sel[tabId] : null;
    arr(F.editaveis).forEach(function (b) {
      if (!(b.w > 0 && b.h > 0)) return;
      var v = aj.vistas[b.chave], R = retangulo(b, v), ehSel = b.chave === sel, d = global.document.createElement("div");
      d.setAttribute("data-hid-bloco", b.chave);
      d.style.cssText = "position:absolute;pointer-events:auto;box-sizing:border-box;cursor:" + (ehSel ? "move" : "pointer") + ";left:" + mmCss(R.x) + ";top:" + mmCss(R.y) + ";width:" + mmCss(R.w) + ";height:" + mmCss(R.h) + ";" +
        (ehSel ? "z-index:3;outline:0.7mm solid #1a6cb5;background:rgba(26,108,181,.07)" : (v ? "outline:0.4mm dashed rgba(200,120,0,.8)" : "outline:0.25mm dashed rgba(26,108,181,.35)"));
      d.title = "Vista: " + b.chave + (v ? " (ajustada à mão)" : " (automática)") + " — clique para editar";
      if (ehSel) {
        var alca = global.document.createElement("div"); alca.setAttribute("data-hid-alca", "1");
        /* a alça nunca fica menor que 14 px na tela (folha inteira em zoom baixo = 4 mm viravam 5 px) e fica POR CIMA das vistas vizinhas */
        var tA = "max(" + mmCss(K.alca) + ",14px)", mA = "min(" + mmCss(-K.alca / 2) + ",-7px)";
        alca.style.cssText = "position:absolute;z-index:4;right:" + mA + ";bottom:" + mA + ";width:" + tA + ";height:" + tA + ";background:#1a6cb5;cursor:nwse-resize;border:0.3mm solid #fff";
        alca.title = "Puxe para redimensionar a viewport (a escala acompanha)"; d.appendChild(alca);
      }
      camada.appendChild(d);
    });
    /* rótulos e balões arrastáveis da vista escolhida (modo "Mover rótulos") */
    if (sel && ST.modo[tabId] === "rot") {
      var bs = blocoDe(F, sel), vs = aj.vistas[sel] || {}, R0 = retangulo(bs, vs), rots = vs.rot || {};
      arr(bs.rotulos).forEach(function (rt) {
        var o = rots[rt.id] || { dx: 0, dy: 0 }, px = R0.x + (rt.x + o.dx - bs.x) * R0.k, py = R0.y + (rt.y + o.dy - bs.y) * R0.k, p = global.document.createElement("div");
        p.setAttribute("data-hid-rot", rt.id);
        p.style.cssText = "position:absolute;z-index:5;pointer-events:auto;cursor:grab;border-radius:50%;background:" + (rots[rt.id] ? "#d97706" : "#1a6cb5") + ";opacity:.85;border:0.25mm solid #fff;width:" + mmCss(K.ponto * 2) + ";height:" + mmCss(K.ponto * 2) + ";left:" + mmCss(px - K.ponto) + ";top:" + mmCss(py - K.ponto);
        p.title = (rt.balao ? "Balão " : "Rótulo ") + "“" + rt.texto + "”: arraste"; camada.appendChild(p);
      });
    }
    folhaEl.appendChild(camada);
    ligarCamada(BF, tabId, camada, F);
    montarPainel(BF, tabId, F);
    return true;
  }

  /* arrastar: clique seleciona; arrastar a vista selecionada move; a alça redimensiona; o ponto move o rótulo */
  function ligarCamada(BF, tabId, camada, F) {
    var doc = global.document, G = null;
    function mm(ev) { return BF._mm(tabId, ev); }
    function seguir(ini, aoMover, aoSoltar) {
      G = { ini: ini, moveu: false };
      function mv(ev) { var p = mm(ev); if (!p) return; G.moveu = G.moveu || Math.abs(p.x - ini.x) + Math.abs(p.y - ini.y) > K.limiarMover; aoMover(p, ev); }
      function up(ev) { doc.removeEventListener("pointermove", mv, true); doc.removeEventListener("pointerup", up, true); var g = G; G = null; aoSoltar(mm(ev), g); }
      doc.addEventListener("pointermove", mv, true); doc.addEventListener("pointerup", up, true);
    }
    camada.addEventListener("pointerdown", function (ev) {
      var alvo = ev.target, p = mm(ev); if (!p) return;
      var el = alvo.closest ? alvo.closest("[data-hid-bloco],[data-hid-rot],[data-hid-alca]") : null; if (!el) return;
      ev.stopPropagation(); ev.preventDefault();
      var obra = obraDe(BF), aj = ajustes(obra);
      if (el.hasAttribute("data-hid-rot")) {
        var id = el.getAttribute("data-hid-rot"), ch = ST.sel[tabId], b = blocoDe(F, ch), v0 = aj.vistas[ch] || {}, o0 = (v0.rot && v0.rot[id]) || { dx: 0, dy: 0 }, k = retangulo(b, v0).k, cx0 = parseFloat(el.style.left), cy0 = parseFloat(el.style.top);
        seguir(p, function (q) { el.style.left = mmCss(cx0 + (q.x - p.x)) ; el.style.top = mmCss(cy0 + (q.y - p.y)); }, function (q, g) {
          if (!q || !g.moveu) return;
          mudar(BF, function (a2) { var rot = (a2.vistas[ch] && a2.vistas[ch].rot) || {}; rot = clone(rot); rot[id] = { dx: o0.dx + (q.x - p.x) / k, dy: o0.dy + (q.y - p.y) / k }; return EX().definir(a2, ch, "rot", rot); });
        });
        return;
      }
      if (el.hasAttribute("data-hid-alca")) {
        var ch2 = ST.sel[tabId], b2 = blocoDe(F, ch2), v2 = aj.vistas[ch2] || {}, vp2 = v2.vp || { dx: 0, dy: 0, k: 1 }, pai = el.parentNode, w0 = b2.w * vp2.k, h0 = b2.h * vp2.k;
        seguir(p, function (q) { var f = Math.max(K.kMin, Math.max((w0 + q.x - p.x) / w0, (h0 + q.y - p.y) / h0)); pai.style.width = mmCss(w0 * f); pai.style.height = mmCss(h0 * f); }, function (q, g) {
          if (!q || !g.moveu) return;
          var f2 = Math.max((w0 + q.x - p.x) / w0, (h0 + q.y - p.y) / h0);
          mudar(BF, function (a2) { return EX().definir(a2, ch2, "vp", { dx: vp2.dx, dy: vp2.dy, k: vp2.k * f2 }); });
        });
        return;
      }
      var chave = el.getAttribute("data-hid-bloco");
      if (ST.sel[tabId] !== chave) { ST.sel[tabId] = chave; ST.pecas = null; ST.msg = ""; try { BF.pintar(tabId); } catch (e) { /* aba fechada */ } return; }
      var bb = blocoDe(F, chave), v1 = aj.vistas[chave] || {}, vp1 = v1.vp || { dx: 0, dy: 0, k: 1 }, l0 = parseFloat(el.style.left), t0 = parseFloat(el.style.top);
      seguir(p, function (q) { el.style.left = mmCss(l0 + q.x - p.x); el.style.top = mmCss(t0 + q.y - p.y); }, function (q, g) {
        if (!q || !g.moveu) return;
        mudar(BF, function (a2) { return EX().definir(a2, chave, "vp", { dx: vp1.dx + (q.x - p.x), dy: vp1.dy + (q.y - p.y), k: vp1.k }); });
      });
    }, true);
  }

  /* ------------------------------------------------------------ painel */
  function checks(lista, atributo, marcados, rotulo) {
    return lista.map(function (x) { var id = x.id != null ? x.id : (x.uid != null ? x.uid : x); return '<label style="display:block"><input type="checkbox" ' + atributo + '="' + esc(id) + '"' + (marcados.indexOf(id) >= 0 ? " checked" : "") + "> " + esc(rotulo ? rotulo(x) : id) + "</label>"; }).join("");
  }
  function planoSvg(vm, crop) {
    var A = vm.caixaAuto, W = K.planoW, H = K.planoH, mx = (A.x1 - A.x0) * K.margemPlano, mz = (A.z1 - A.z0) * K.margemPlano, X0 = A.x0 - mx, Z0 = A.z0 - mz, WX = (A.x1 - A.x0) + 2 * mx, WZ = (A.z1 - A.z0) + 2 * mz, s = Math.min(W / WX, H / WZ);
    function px(x) { return r2((x - X0) * s); } function pz(z) { return r2((z - Z0) * s); }
    var c = crop;
    return '<svg data-hid-plano="1" data-x0="' + r3(X0) + '" data-z0="' + r3(Z0) + '" data-s="' + r3(s) + '" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" style="background:#fff;border:1px solid #bbb;touch-action:none;display:block;margin:4px 0">' +
      '<rect x="' + px(A.x0) + '" y="' + pz(A.z0) + '" width="' + r2((A.x1 - A.x0) * s) + '" height="' + r2((A.z1 - A.z0) * s) + '" fill="none" stroke="#999" stroke-dasharray="4 3"/>' +
      '<rect data-hid-crop-ret="1" x="' + px(c.x0) + '" y="' + pz(c.z0) + '" width="' + r2((c.x1 - c.x0) * s) + '" height="' + r2((c.z1 - c.z0) * s) + '" fill="rgba(26,108,181,.12)" stroke="#1a6cb5" stroke-width="1.5" style="cursor:move"/>' +
      '<rect data-hid-crop-alca="nw" x="' + (px(c.x0) - 5) + '" y="' + (pz(c.z0) - 5) + '" width="10" height="10" fill="#1a6cb5" style="cursor:nwse-resize"/>' +
      '<rect data-hid-crop-alca="se" x="' + (px(c.x1) - 5) + '" y="' + (pz(c.z1) - 5) + '" width="10" height="10" fill="#1a6cb5" style="cursor:nwse-resize"/>' +
      '<text x="4" y="12" font-size="10" fill="#666">planta: x →, z ↓ (tracejado = recorte automático)</text></svg>';
  }
  function html(F, b, aj, vm) {
    var v = aj.vistas[b.chave] || {}, cam = v.cam || {}, oc = v.oculto || { cats: [], discs: [], camadas: [], uids: [] }, vp = v.vp || { dx: 0, dy: 0, k: 1 }, FO = global.BimFoco, E = EX();
    var h = '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font-size:13px">Vista da folha ' + esc(F.numero) + '</b><button class="btn sm ghost" data-hid-p="fechar" title="Fechar o painel (o ajuste fica)">×</button></div>' +
      '<div style="font-size:11.5px;color:#555;margin:2px 0 6px">' + esc(F.titulo) + '<br><code style="font-size:10.5px">' + esc(b.chave) + "</code>" + (v && Object.keys(v).length ? ' · <span style="color:#b45309"><b>ajustada à mão</b></span>' : " · automática") + "</div>";
    h += '<div style="display:flex;gap:6px;margin-bottom:6px"><button class="btn sm" data-hid-p="auto" title="Tira todo o ajuste manual desta vista e volta ao que o gerador decidiu (a câmera travada fica)"' + (Object.keys(v).length ? "" : " disabled") + ">Voltar ao automático</button>" +
      '<button class="btn sm ' + (ST.modo[ST.tab] === "rot" ? "primary" : "ghost") + '" data-hid-p="rot" title="Mostra um ponto em cada rótulo e balão desta vista: arraste para mover">Mover rótulos e balões</button></div>';
    h += '<fieldset style="border:1px solid #ccd;border-radius:4px;padding:6px;margin:0 0 6px"><legend><b>Viewport na folha</b></legend>' +
      '<div class="muted" style="font-size:11.5px">Arraste a vista na folha; a alça azul do canto muda o tamanho.</div>' +
      '<label>x <input data-hid-vp="dx" type="number" step="1" value="' + r2(vp.dx) + '" style="width:60px"></label> <label>y <input data-hid-vp="dy" type="number" step="1" value="' + r2(vp.dy) + '" style="width:60px"></label> ' +
      '<label>tamanho <input data-hid-vp="k" type="number" step="5" min="30" max="300" value="' + Math.round(vp.k * 100) + '" style="width:56px"> %</label></fieldset>';
    if (vm) {
      var ang = E.anguloDe(cam), az = ang != null ? ang : (vm.vista && /^A/.test(vm.vista) ? +vm.vista.slice(1) : (E.anguloDe({ vista: vm.vista }) || 0)), vistaAtual = cam.vista || (cam.az != null ? "" : vm.vista);
      h += '<fieldset style="border:1px solid #ccd;border-radius:4px;padding:6px;margin:0 0 6px"><legend><b>Câmera do isométrico</b></legend><div>' +
        E.VISTAS.map(function (q) { return '<button class="btn sm ' + (vistaAtual === q ? "primary" : "ghost") + '" data-hid-cam="' + q + '">' + q + "</button>"; }).join(" ") + ' <span class="muted" style="font-size:11.5px">' + (cam.az == null && !cam.vista ? "automática: " + esc(vm.vista) : (cam.travada ? "🔒 travada" : "manual")) + "</span></div>" +
        '<label style="display:block;margin-top:4px">Órbita livre <input data-hid-az="1" type="range" min="0" max="359" step="1" value="' + Math.round(az) + '" style="width:130px"> <b data-hid-azv="1">' + Math.round(az) + "°</b></label>" +
        '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px"><button class="btn sm" data-hid-p="pegar3d" title="Usa o ângulo em que o 3D está agora (gire o 3D, trave a câmera e clique aqui)">Pegar câmera do 3D</button>' +
        '<button class="btn sm" data-hid-p="travar3d" title="Trava a câmera do 3D (o BIM.travar da fita Vista)">Travar câmera 3D</button><button class="btn sm" data-hid-p="salvar3d" title="Guarda a câmera do 3D como vista 3D com nome (Navegador › Vistas 3D)">Salvar como vista 3D</button>' +
        '<button class="btn sm ' + (cam.travada ? "primary" : "ghost") + '" data-hid-p="travarcam" title="Trava a câmera DESTA vista: o Voltar ao automático não a muda"' + (cam.vista || cam.az != null ? "" : " disabled") + ">" + (cam.travada ? "Destravar câmera" : "Travar câmera") + "</button></div></fieldset>";
      var c = vm.caixa;
      h += '<fieldset style="border:1px solid #ccd;border-radius:4px;padding:6px;margin:0 0 6px"><legend><b>Recorte (crop) e profundidade</b></legend>' + planoSvg(vm, c) +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;font-size:11.5px">' + ["x0", "x1", "z0", "z1", "y0", "y1"].map(function (k) { return '<label>' + k + ' <input data-hid-crop="' + k + '" type="number" step="0.05" value="' + r2(c[k]) + '" style="width:62px"></label>'; }).join("") + "</div>" +
        '<div class="muted" style="font-size:11px">x, z = planta; y0 = fundo e y1 = topo (profundidade) em metros do modelo.</div></fieldset>';
      h += '<fieldset style="border:1px solid #ccd;border-radius:4px;padding:6px;margin:0 0 6px"><legend><b>Esconder no 3D</b></legend>';
      if (FO) {
        h += "<div><b>Disciplinas</b></div>" + checks(FO.DISC_VIS, "data-hid-disc", oc.discs, function (d) { return d.rotulo; });
        h += '<details style="margin-top:4px"><summary><b>Categorias</b> (' + oc.cats.length + ' escondida(s))</summary>' + checks(FO.CATEGORIAS, "data-hid-cat", oc.cats, function (c0) { return c0.rotulo; }) + "</details>";
      }
      h += '<div style="margin-top:4px"><button class="btn sm" data-hid-p="pecas" title="Lista as peças do modelo dentro do recorte desta vista: marque a que deve sair da foto">Peças desta vista…</button></div>';
      if (ST.pecas) h += '<div style="max-height:170px;overflow:auto;border:1px solid #e3e3e3;padding:4px;margin-top:4px;font-size:11.5px">' + (ST.pecas.length ? checks(ST.pecas, "data-hid-uid", oc.uids, function (p) { return p.nome + " · " + p.catRotulo; }) : "Nenhuma peça do modelo no recorte.") + "</div>";
      h += "</fieldset>";
    }
    if (arr(b.camadas).length) h += '<fieldset style="border:1px solid #ccd;border-radius:4px;padding:6px;margin:0 0 6px"><legend><b>Camadas do desenho</b></legend>' + checks(b.camadas.map(function (c0) { return c0.id; }), "data-hid-camada", oc.camadas, function (id) { return NOME_CAM[id] || id; }) + "</fieldset>";
    h += '<div data-hid-msg="1" style="font-size:12px;color:#374151;min-height:16px">' + esc(ST.msg || "") + "</div>";
    return h;
  }
  function montarPainel(BF, tabId, F) {
    limparPainel(); ST.tab = tabId;
    var ch = ST.sel[tabId], b = ch ? blocoDe(F, ch) : null, doc = global.document;
    var p = doc.createElement("div"); p.setAttribute("data-hid-painel", tabId);
    p.style.cssText = "position:fixed;right:14px;top:92px;width:300px;max-height:calc(100vh - 140px);overflow:auto;z-index:45;background:#fff;color:#111;border:1px solid #9aa4b2;border-radius:8px;box-shadow:0 6px 22px rgba(0,0,0,.28);padding:10px;font-size:12.5px";
    if (!b) p.innerHTML = '<b>Folha ' + esc(F.numero) + '</b><div class="muted" style="margin-top:4px">Clique numa vista da folha (contorno pontilhado) para editar: câmera, recorte, o que aparece, tamanho e rótulos. O ajuste fica guardado e <b>regerar não o apaga</b>.</div>' + (Object.keys(ajustes(ST.obra || "geral").vistas).length ? '<div style="margin-top:6px;font-size:11.5px;color:#b45309">' + Object.keys(ajustes(ST.obra || "geral").vistas).length + " vista(s) da obra com ajuste manual.</div>" : "");
    else p.innerHTML = html(F, b, ajustes(ST.obra || "geral"), MODELO.vistas[ch] || null);
    (doc.body || doc.documentElement).appendChild(p); ST.painel = p;
    ligarPainel(BF, tabId, p, F, b);
  }
  function atualizarPainel(BF) {
    var tid = ST.tab, a = null; try { a = tid ? BF.achar(tid) : null; } catch (e) { a = null; }
    if (!a) return; var fid = txt(a.folha.imagemInteira).replace(/^hidsvg:/, ""); if (FOLHAS[fid]) montarPainel(BF, tid, FOLHAS[fid]);
  }
  function ligarPainel(BF, tabId, p, F, b) {
    var ch = b ? b.chave : null;
    function lista(ev, atr) { return [].slice.call(p.querySelectorAll("[" + atr + "]")).filter(function (e) { return e.checked; }).map(function (e) { return e.getAttribute(atr); }); }
    function parte(a2, nome) { return clone((a2.vistas[ch] && a2.vistas[ch][nome]) || null); }
    function oculto(a2) { var o = parte(a2, "oculto") || { cats: [], discs: [], camadas: [], uids: [] }; return o; }
    p.addEventListener("click", function (ev) {
      var el = ev.target.closest ? ev.target.closest("[data-hid-p],[data-hid-cam]") : null; if (!el) return;
      var a = el.getAttribute("data-hid-p"), q = el.getAttribute("data-hid-cam");
      if (q) { mudar(BF, function (a2) { var c0 = parte(a2, "cam") || {}; return EX().definir(a2, ch, "cam", { vista: q, travada: c0.travada }); }); return; }
      if (a === "fechar") { delete ST.sel[tabId]; try { BF.pintar(tabId); } catch (e) { /* aba fechada */ } return; }
      if (a === "auto") {
        mudar(BF, function (a2) { var c0 = parte(a2, "cam"); return EX().voltarAutomatico(a2, ch, c0 && c0.travada ? ["crop", "oculto", "vp", "rot"] : null); });
        ST.msg = "Vista de volta ao automático."; atualizarPainel(BF); return;
      }
      if (a === "rot") { ST.modo[tabId] = ST.modo[tabId] === "rot" ? null : "rot"; try { BF.pintar(tabId); } catch (e) { /* aba fechada */ } return; }
      if (a === "travarcam") { mudar(BF, function (a2) { var c0 = parte(a2, "cam"); if (!c0) return a2; c0.travada = !c0.travada; return EX().definir(a2, ch, "cam", c0); }); return; }
      if (a === "pegar3d") {
        var e3 = null; try { e3 = global.BIM && global.BIM.estadoVista ? global.BIM.estadoVista() : null; } catch (e) { e3 = null; }
        var cam = e3 && (e3.camera || e3.cam);
        if (!cam || !cam.pos) { ST.msg = "Não consegui ler a câmera do 3D: abra o 3D do modelo."; atualizarPainel(BF); return; }
        var az = EX().azDeCamera(cam.pos, cam.alvo); mudar(BF, function (a2) { return EX().definir(a2, ch, "cam", { az: az }); }); ST.msg = "Câmera do 3D: " + az + "° (" + EX().quadranteDe(az) + " mais próximo)."; atualizarPainel(BF); return;
      }
      if (a === "travar3d") { var ok = false; try { ok = global.BIM && global.BIM.travar ? global.BIM.travar(true) !== false : false; } catch (e) { ok = false; } ST.msg = ok ? "Câmera do 3D travada." : "O 3D não está aberto."; atualizarPainel(BF); return; }
      if (a === "salvar3d") { var g = global.Gestao, ok2 = false; try { ok2 = !!(g && g._bimVistaSalvar3d && g._bimVistaSalvar3d()); } catch (e) { ok2 = false; } ST.msg = ok2 ? "Vista 3D salva no Navegador." : "Abra o 3D do modelo para salvar a vista."; atualizarPainel(BF); return; }
      if (a === "pecas") {
        var vm = MODELO.vistas[ch]; if (!vm || !global.BIM || !global.BIM.pecasNaCaixa) { ST.msg = "Abra o 3D do modelo para listar as peças."; atualizarPainel(BF); return; }
        /* a foto vê além do recorte justo do tubo (o fundo vai até a folga): a lista usa a caixa com margem, senão a parede onde o tubo corre não aparece */
        var c = vm.caixa, mg = K.margemPecas; ST.pecas = global.BIM.pecasNaCaixa([c.x0 - mg, c.y0 - mg, c.z0 - mg], [c.x1 + mg, c.y1 + mg, c.z1 + mg], K.maxPecas); atualizarPainel(BF); return;
      }
    });
    p.addEventListener("change", function (ev) {
      var e = ev.target; if (!ch || !e) return;
      if (e.hasAttribute("data-hid-vp")) {
        var vv = {}; [].slice.call(p.querySelectorAll("[data-hid-vp]")).forEach(function (i) { vv[i.getAttribute("data-hid-vp")] = parseFloat(i.value); }); vv.k = (vv.k || 100) / 100;
        mudar(BF, function (a2) { return EX().definir(a2, ch, "vp", vv); }); return;
      }
      if (e.hasAttribute("data-hid-crop")) {
        var cc = {}; [].slice.call(p.querySelectorAll("[data-hid-crop]")).forEach(function (i) { cc[i.getAttribute("data-hid-crop")] = parseFloat(i.value); });
        mudar(BF, function (a2) { return EX().definir(a2, ch, "crop", cc); }); return;
      }
      if (e.hasAttribute("data-hid-disc") || e.hasAttribute("data-hid-cat") || e.hasAttribute("data-hid-camada") || e.hasAttribute("data-hid-uid")) {
        var disc = lista(ev, "data-hid-disc"), cat = lista(ev, "data-hid-cat"), cam2 = lista(ev, "data-hid-camada"), uidAtivos = lista(ev, "data-hid-uid");
        mudar(BF, function (a2) {
          var o = oculto(a2); o.discs = disc; o.camadas = cam2;
          if (p.querySelector("[data-hid-cat]")) o.cats = cat;
          if (p.querySelector("[data-hid-uid]")) { var vis = [].slice.call(p.querySelectorAll("[data-hid-uid]")).map(function (i) { return i.getAttribute("data-hid-uid"); }); o.uids = o.uids.filter(function (u) { return vis.indexOf(u) < 0; }).concat(uidAtivos); }
          return EX().definir(a2, ch, "oculto", o);
        });
      }
    });
    p.addEventListener("input", function (ev) {
      var e = ev.target; if (e && e.hasAttribute && e.hasAttribute("data-hid-az")) { var o = p.querySelector("[data-hid-azv]"); if (o) o.textContent = e.value + "°"; }
    });
    var rg = p.querySelector("[data-hid-az]");
    if (rg) rg.addEventListener("change", function () { var az = parseFloat(rg.value); mudar(BF, function (a2) { var c0 = parte(a2, "cam") || {}; return EX().definir(a2, ch, "cam", { az: az, travada: c0.travada }); }); });
    /* o recorte arrastado na planta pequena: mover o retângulo e puxar o canto (noroeste ou sudeste) */
    var plano = p.querySelector("[data-hid-plano]");
    if (plano && b) {
      var vm2 = MODELO.vistas[ch], doc = global.document;
      plano.addEventListener("pointerdown", function (ev) {
        var alvo = ev.target, modo = alvo.getAttribute && alvo.getAttribute("data-hid-crop-alca") ? alvo.getAttribute("data-hid-crop-alca") : (alvo.hasAttribute && alvo.hasAttribute("data-hid-crop-ret") ? "mover" : null); if (!modo) return;
        ev.preventDefault(); ev.stopPropagation();
        var X0 = +plano.getAttribute("data-x0"), Z0 = +plano.getAttribute("data-z0"), s = +plano.getAttribute("data-s"), r = plano.getBoundingClientRect(), c0 = clone(vm2.caixa);
        function mundo(e2) { return { x: X0 + (e2.clientX - r.left) / s, z: Z0 + (e2.clientY - r.top) / s }; }
        var ini = mundo(ev), novo = clone(c0), minLado = K.minLadoCrop;
        function mv(e2) {
          var q = mundo(e2), dx = q.x - ini.x, dz = q.z - ini.z; novo = clone(c0);
          if (modo === "mover") { novo.x0 += dx; novo.x1 += dx; novo.z0 += dz; novo.z1 += dz; }
          else if (modo === "nw") { novo.x0 = Math.min(c0.x0 + dx, Math.max(c0.x0, c0.x1 - minLado)); novo.z0 = Math.min(c0.z0 + dz, Math.max(c0.z0, c0.z1 - minLado)); }
          else { /* o mínimo nunca AUMENTA um recorte que já nasceu mais estreito que ele (o automático do tubo pode ter 24 cm) */
            novo.x1 = Math.max(c0.x1 + dx, Math.min(c0.x1, c0.x0 + minLado)); novo.z1 = Math.max(c0.z1 + dz, Math.min(c0.z1, c0.z0 + minLado)); }
          var ret = plano.querySelector("[data-hid-crop-ret]"); if (ret) { ret.setAttribute("x", (novo.x0 - X0) * s); ret.setAttribute("y", (novo.z0 - Z0) * s); ret.setAttribute("width", (novo.x1 - novo.x0) * s); ret.setAttribute("height", (novo.z1 - novo.z0) * s); }
        }
        function up() { doc.removeEventListener("pointermove", mv, true); doc.removeEventListener("pointerup", up, true); if (JSON.stringify(novo) !== JSON.stringify(c0)) mudar(BF, function (a2) { return EX().definir(a2, ch, "crop", novo); }); }
        doc.addEventListener("pointermove", mv, true); doc.addEventListener("pointerup", up, true);
      });
    }
  }

  /* ------------------------------------------------------------ PDF vetorial igual à tela (svgpdf) */
  function pdfVetorial(BF, itens, nome) {
    var S = dep("SvgPdf", "./svgpdf.js"), svgs = [], faltou = 0;
    if (!S || !S.pdf) return null;
    arr(itens).forEach(function (a) {
      var id = txt(a.folha.imagemInteira).replace(/^hidsvg:/, "");
      if (FOLHAS[id]) svgs.push(svgAtual(id));
      else { var u = (BF._imagensExternas || {})[a.folha.imagemInteira]; if (u) svgs.push(svgDeUrl(u)); else faltou++; }
    });
    if (!svgs.length || faltou) return null;
    var bytes = S.pdf(svgs, { titulo: txt(nome).replace(/\.pdf$/, ""), imagensPorChave: MODELO.imagens || {} });
    return { bytes: bytes, paginas: svgs.length };
  }

  var HidPranchasEditUI = { aoPintar: aoPintar, registrar: registrar, restaurar: restaurar, publicar: publicar, limparPainel: limparPainel, pdfVetorial: pdfVetorial, svgAtual: svgAtual,
    ajustes: function (obra) { return ajustes(obra || ST.obra || "geral"); },
    mudar: mudar, refazerFoto: refazerFoto,
    _int: { FOLHAS: function () { return FOLHAS; }, MODELO: function () { return MODELO; }, ST: ST, retangulo: retangulo, assinaturaFoto: assinaturaFoto, guardar: guardar } };
  global.HidPranchasEditUI = HidPranchasEditUI;
  if (typeof module !== "undefined" && module.exports) module.exports = HidPranchasEditUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
