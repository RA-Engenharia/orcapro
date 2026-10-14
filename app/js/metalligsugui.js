/* =====================================================================
 * metalligsugui.js — a TELA da LIGAÇÃO INTELIGENTE e do CATÁLOGO DE
 * LIGAÇÕES (aba Metálica & Mecânica › grupo "Ligação inteligente"; só com a
 * prévia do modelador). 14/10/2026.
 *
 * Fina: quem entende as peças e sugere é o js/acoligsugere.js; quem
 * dimensiona é o js/acoligcalc2.js (e o js/acoligcalc.js); quem desenha no 3D
 * é o js/metalligacao.js. Aqui:
 *   · "Ligação inteligente": as peças selecionadas (clique no pilar e, com
 *     Ctrl, na viga) → painel com até 3 sugestões (regra, confiança, prós e
 *     contras, o dimensionamento, o reforço, o desenho) → "Aplicar" cria a
 *     ligação no modelo num lote só (Ctrl+Z desfaz) e guarda a escolha na 1ª
 *     peça (caixa.ligInfo) — é dela que saem o memorial e o quantitativo
 *     (as chapas e os parafusos entram no peso do modelo como toda peça);
 *   · "Catálogo de ligações": todas as tipologias por aplicação, com o
 *     desenho, a família, as verificações (item da NBR 8800) e as limitações;
 *   · "Memorial das ligações": cada ligação aplicada, verificação por
 *     verificação (o memorial da estrutura desenhada também traz a seção);
 *   · "Ligar todos os nós": a melhor opção que passa em cada nó da seleção.
 * Cores: tokens do css/app.css (tema claro e escuro).
 * ===================================================================== */
(function (global) {
  "use strict";

  function S() { return global.AcoLigSugere || null; }
  function T() { return global.AcoLigTipos || null; }
  function C2() { return global.AcoLigCalc2 || null; }
  function L() { return global.BimMetalLig || null; }
  function MU() { return global.BimMetalUI || null; }
  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function br(v, c) { c = c == null ? 0 : c; return (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, k, ms) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info", ms || 6000); } catch (e) {} }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  var FAM = { flexivel: "flexível", rigida: "rígida", semirrigida: "semirrígida", reforco: "reforço" };
  var REL = { "viga-pilar": "viga → pilar", "viga-viga": "viga → viga", "emenda-viga": "emenda de viga", cumeeira: "cumeeira", "emenda-pilar": "emenda de pilar", base: "base de pilar", contraventamento: "contraventamento", "no-trelica": "nó de treliça", tubular: "nó tubular", terca: "terça → viga" };

  var COMANDOS = [
    { id: "met-lig-inteligente", rotulo: "Ligação\ninteligente", icone: "raio", grande: true, dica: "Clique no PILAR e, com Ctrl, na VIGA (ou viga e viga, um pilar sozinho para a base, a diagonal e o apoio) e chame: o sistema entende o encontro (mesa ou alma, topo, nó rígido ou rotulado no cálculo) e traz até 3 ligações dimensionadas pela NBR 8800, com o reforço que precisar. Aplicar cria as chapas, parafusos e soldas." },
    { id: "met-lig-catalogo", rotulo: "Catálogo de\nligações", icone: "livro", grande: true, dica: "Todas as tipologias de ligação por aplicação — cantoneiras, chapas, talas, chapa de extremidade, assento, mísula, emendas, bases, gussets, nós tubulares, consolo — com o desenho, a família, as verificações e as limitações." },
    { id: "met-lig-lote", rotulo: "Ligar todos\nos nós", icone: "grade", grande: true, dica: "Para as peças selecionadas (ou o modelo todo): em cada encontro viga × pilar, viga × viga e base, aplica a melhor ligação que passa e tem desenho automático. Um lote só — Ctrl+Z desfaz." },
    { id: "met-lig-memorial", rotulo: "Memorial das\nligações", icone: "relatorio", grande: false, dica: "Cada ligação aplicada pela ligação inteligente, verificação por verificação (item da NBR 8800, fórmula, valores e razão), com os reforços e o que não foi verificado." }
  ];

  /* ------------------------------------------------------------ estilo (tokens) */
  function css() {
    if (typeof document === "undefined" || document.getElementById("lsg-css")) return;
    var s = document.createElement("style"); s.id = "lsg-css";
    s.textContent = ".lsg{display:flex;flex-direction:column;gap:10px;font-size:13px;color:var(--texto)}" +
      ".lsg-topo{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center}.lsg-topo b{font-weight:600}.lsg-topo select{min-height:30px}" +
      ".lsg-av{margin:0;padding:8px 10px 8px 26px;border:1px solid var(--linha);border-radius:8px;background:var(--surface);font-size:12px;color:var(--texto-fraco)}" +
      ".lsg-av li.inc{color:var(--vermelho);font-weight:600}" +
      ".lsg-ops{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}" +
      ".lsg-op{border:1px solid var(--linha);border-radius:10px;background:var(--card-bg,var(--surface));padding:10px;display:flex;flex-direction:column;gap:6px;min-width:0}" +
      ".lsg-op.ok{border-color:var(--verde)}.lsg-op.nok{border-color:var(--vermelho)}" +
      ".lsg-op h3{font-size:14px;margin:0;display:flex;gap:6px;align-items:baseline}.lsg-op h3 .n{color:var(--texto-fraco);font-weight:500}" +
      ".lsg-chips{display:flex;flex-wrap:wrap;gap:4px}.lsg-chip{font-size:11px;border:1px solid var(--linha);border-radius:999px;padding:1px 8px;color:var(--texto-fraco)}" +
      ".lsg-chip.ok{color:var(--verde);border-color:var(--verde)}.lsg-chip.nok{color:var(--vermelho);border-color:var(--vermelho)}" +
      ".lsg-svg svg{width:100%;height:auto;display:block;background:#fff;border-radius:6px;border:1px solid var(--linha)}" +
      ".lsg-op p{margin:0;font-size:12px}.lsg-op ul{margin:0;padding-left:16px;font-size:11.5px}.lsg-op .pro li{color:var(--verde)}.lsg-op .con li{color:var(--texto-fraco)}" +
      ".lsg-op details{font-size:11.5px}.lsg-op details table{width:100%;border-collapse:collapse;font-size:11px}.lsg-op details td{border-top:1px solid var(--linha);padding:2px 4px;vertical-align:top}" +
      ".lsg-op .acoes{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto}.lsg-op .sem3d{font-size:11px;color:var(--texto-fraco)}" +
      ".lsg-cat{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px;max-height:64vh;overflow:auto}" +
      ".lsg-cat .lsg-op h3{font-size:13px}.lsg-nota{font-size:11px;color:var(--texto-fraco);margin:0}" +
      "@media (max-width:760px){.lsg-ops{grid-template-columns:1fr}}";
    document.head.appendChild(s);
  }

  var U = { preferir: "", ultimo: null, ctx: null, sg: null };
  /* PADRÃO por combinação de seções (R-TAB): guardado NESTE navegador (conveniência; não é dado da obra) */
  var CHAVE_TAB = "orcapro:metal:ligpadrao:v1";
  function lerTabela() { try { var t = JSON.parse(global.localStorage.getItem(CHAVE_TAB) || "{}"); return t && typeof t === "object" ? t : {}; } catch (e) { return {}; } }
  function gravarTabela(t) { try { global.localStorage.setItem(CHAVE_TAB, JSON.stringify(t)); return true; } catch (e) { return false; } }
  var CUSTO = { 1: "baixo", 2: "médio", 3: "alto" };
  /* QUEM PODE SER APLICADA (revisão A1): só a opção que PASSA, sem bloqueio e com desenho; a chapa estendida que pede o
     pilar prolongado só pelo botão de prolongar. Devolve { ok, prolongar, motivo } */
  function podeAplicar(o) {
    if (!o) return { ok: false, motivo: "opção inexistente" };
    var r = o.resultado || {}, bq = o.bloqueio || arr(r.bloqueante)[0] || "";
    if (bq) return { ok: false, motivo: "não verificado: " + bq };
    if (!o.aplicar) return o.passa ? { ok: false, semDesenho: true, motivo: "desenho no 3D ainda não automático para esta tipologia" } : { ok: false, motivo: o.bloqueioProlongar || "NÃO PASSA (governa: " + (r.governante || "—") + ")" };
    /* o prolongar só destrava quando é o ÚNICO bloqueio (revisão N1: a oblíqua no topo do pilar ganhava o botão) */
    if (o.bloqueioProlongar) return o.aplicar.prolongar && r.ok ? { ok: false, prolongar: true, motivo: o.bloqueioProlongar } : { ok: false, motivo: o.bloqueioProlongar };
    if (!o.passa) return { ok: false, motivo: "NÃO PASSA (governa: " + (r.governante || "—") + ")" };
    return { ok: true };
  }

  function clone2(o) { var n = {}; Object.keys(o || {}).forEach(function (k) { n[k] = o[k]; }); return n; }
  function selCaixas() { var M = MU(); if (!M) return []; return M.caixas(M.selecao()); }
  function todasCaixas() { var M = MU(), st = M && M.estado ? M.estado() : null; return (st && st.caixas) || []; }
  function resultadoCalc() { try { var C = global.MetalCalcLivreUI; return C && C.resultado ? C.resultado() : null; } catch (e) { return null; } }

  /* ------------------------------------------------------------ painel de sugestões */
  function cartao(o, i) {
    var r = o.resultado || {}, bloq = o.bloqueio || o.bloqueioProlongar || arr(r.bloqueante)[0] || "", pa = podeAplicar(o), Tp = T(), svg = Tp ? Tp.svg(o.tipologia) : "", inc = o.avisos.some(function (a) { return /INCOER/.test(a); });
    var h = '<div class="lsg-op ' + (o.passa ? "ok" : "nok") + '" data-lsg-op="' + i + '" data-lsg-tip="' + esc(o.tipologia) + '">' +
      '<h3><span class="n">' + (i + 1) + "º</span> " + esc(o.nome) + "</h3>" +
      '<div class="lsg-chips"><span class="lsg-chip ' + (o.passa ? "ok" : "nok") + '" data-lsg="passa">' + (o.passa ? "passa" : "não passa") + " · " + br(num(r.razao, 0) * 100) + " %</span>" +
      '<span class="lsg-chip">' + esc(FAM[o.familia] || o.familia) + '</span><span class="lsg-chip">confiança ' + esc(o.confianca) + '</span>' +
      '<span class="lsg-chip" data-lsg="custo">custo ' + esc(CUSTO[o.custo.custo] || "—") + " · fabricação " + esc(CUSTO[o.custo.fabricacao] || "—") + " · montagem " + esc(CUSTO[o.custo.montagem] || "—") + "</span>" +
      (o.peso != null ? '<span class="lsg-chip" data-lsg="peso">≈ ' + esc(String(o.peso).replace(".", ",")) + " kg de aço</span>" : "") + '<span class="lsg-chip" title="' + esc(o.regra.texto) + '">regra ' + esc(o.regra.id) + "</span>" +
      (inc ? '<span class="lsg-chip nok">incoerente com o cálculo</span>' : "") + "</div>" +
      (svg ? '<div class="lsg-svg">' + svg + "</div>" : "") +
      "<p>" + esc(o.justificativa) + "</p>" +
      '<p><b>Dimensionado:</b> ' + esc(r.resumo || r.motivo || "—") + "</p>" +
      (r.notaCorte ? '<p data-lsg="corte"><b>Corte:</b> ' + esc(r.notaCorte) + "</p>" : "") +
      (o.reforcos.length ? '<p data-lsg="reforco"><b>Reforço:</b> ' + esc(o.reforcos.join("; ")) + "</p>" : "") +
      (o.pros.length ? '<ul class="pro">' + o.pros.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") +
      (o.contras.length ? '<ul class="con">' + o.contras.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") +
      (o.avisos.length ? '<ul class="con" data-lsg="avisos-op">' + o.avisos.map(function (x) { return '<li' + (/INCOER/.test(x) ? ' style="color:var(--vermelho)"' : "") + ">" + esc(x) + "</li>"; }).join("") + "</ul>" : "") +
      "<details><summary>Verificações (" + arr(r.verificacoes).length + ")</summary><table>" + arr(r.verificacoes).map(function (v) { return "<tr><td>" + esc(v.nome) + '<br><span class="lsg-nota">' + esc(v.item) + '</span></td><td style="text-align:right;white-space:nowrap;color:' + (v.razao <= 1 + 1e-9 ? "var(--verde)" : "var(--vermelho)") + '">' + br(v.razao * 100) + " %</td></tr>"; }).join("") + "</table></details>" +
      '<div class="acoes">' + (pa.prolongar ? '<button class="btn primary sm" data-lsg-prolongar="' + i + '" title="' + esc(bloq) + '">Prolongar o pilar ' + o.aplicar.prolongar.mm + ' mm e aplicar</button>' : !pa.ok && !pa.semDesenho ? '<span class="sem3d" data-lsg="bloqueio">Não aplicável: ' + esc(pa.motivo) + '.</span>' : o.aplicar ? '<button class="btn primary sm" data-lsg-aplicar="' + i + '">Aplicar no modelo</button>' : '<span class="sem3d" data-lsg="sem3d">Desenho no 3D ainda não automático para esta tipologia — o dimensionamento vale e vai no memorial.</span>') +
      '<button class="btn ghost sm" data-lsg-memorial="' + i + '">Memorial</button>' +
      (o.regra.id === "R-TAB" ? '<span class="sem3d">padrão guardado</span>' : '<button class="btn ghost sm" data-lsg-padrao="' + i + '" title="Nas próximas vezes, esta combinação de seções traz esta ligação primeiro (guardado neste navegador)">Usar como padrão</button>') + "</div></div>";
    return h;
  }
  function painelHtml(ctx, sg) {
    var pecas = arr(ctx.pecas).map(function (p) { return esc(p.papel) + " " + esc(p.id) + " (" + esc(p.perfil && p.perfil.nome) + ")"; }).join(" · ");
    var no = ctx.no || {}, rel = REL[ctx.relacao] || ctx.relacao;
    var h = '<div class="lsg" data-lsg="painel" data-modal-largo data-lsg-relacao="' + esc(ctx.relacao) + '" data-lsg-face="' + esc(ctx.face) + '">' +
      '<div class="lsg-topo"><span><b>Encontro:</b> ' + esc(rel) + (ctx.relacao === "viga-pilar" ? " — na <b data-lsg=\"face\">" + esc(ctx.face) + "</b> do pilar" + (ctx.topoPilar ? " (topo do pilar)" : "") : "") + "</span>" +
      "<span><b>Nó:</b> " + esc(no.rigido === true ? "rígido" : no.rigido === false ? "rotulado" : "padrão (rotulado)") + " — " + esc(no.texto || "") + "</span>" +
      '<label>Preferência <select data-lsg="preferir"><option value=""' + (!U.preferir ? " selected" : "") + '>pelo cálculo</option><option value="rigida"' + (U.preferir === "rigida" ? " selected" : "") + '>rígida</option><option value="flexivel"' + (U.preferir === "flexivel" ? " selected" : "") + ">flexível</option></select></label></div>" +
      '<p class="lsg-nota">Peças: ' + pecas + ". Esforços: " + esc(ctx.origemEsforcos || "—") + "</p>";
    var av = arr(sg.avisos);
    if (av.length) h += '<ul class="lsg-av" data-lsg="avisos">' + av.map(function (a) { return "<li" + (/INCOER/.test(a) ? ' class="inc"' : "") + ">" + esc(a) + "</li>"; }).join("") + "</ul>";
    var E0 = sg.escopo;
    if (E0) h += '<details class="lsg-av" data-lsg="escopo"><summary><b>Escopo:</b> o que o sistema verificou e o que NÃO verificou (efeito alavanca e placa de base da NBR 8800:2024 pendentes do texto)</summary><p>' + esc(E0.verificado) + "</p><ul>" + E0.naoVerificado.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></details>";
    h += '<div class="lsg-ops">' + sg.opcoes.map(cartao).join("") + "</div>";
    h += '<p class="lsg-nota">' + esc(T() ? T().EDICAO.aviso : "") + " Regras usadas: " + sg.regras.map(function (r) { return esc(r.id); }).join(", ") + ' — passe o mouse na regra para ler. <a href="#" data-lsg="ver-catalogo">Ver todas as tipologias deste encontro</a>.</p></div>';
    return h;
  }
  function ligar(raiz) {
    if (!raiz) return;
    raiz.addEventListener("click", function (ev) {
      var a = ev.target.closest ? ev.target.closest("[data-lsg-aplicar],[data-lsg-prolongar],[data-lsg-memorial],[data-lsg-padrao],[data-lsg='ver-catalogo']") : null; if (!a) return;
      ev.preventDefault();
      if (a.getAttribute("data-lsg-aplicar") != null) MetalLigSugUI.aplicar(+a.getAttribute("data-lsg-aplicar"));
      else if (a.getAttribute("data-lsg-prolongar") != null) MetalLigSugUI.aplicar(+a.getAttribute("data-lsg-prolongar"), { prolongar: true });
      else if (a.getAttribute("data-lsg-memorial") != null) MetalLigSugUI.memorialOpcao(+a.getAttribute("data-lsg-memorial"));
      else if (a.getAttribute("data-lsg-padrao") != null) MetalLigSugUI.usarComoPadrao(+a.getAttribute("data-lsg-padrao"));
      else MetalLigSugUI.catalogo(apDe(U.ctx));
    });
    var sel = raiz.querySelector("[data-lsg='preferir']");
    if (sel) sel.addEventListener("change", function () { U.preferir = sel.value; MetalLigSugUI.abrir({ manter: true }); });
  }
  function apDe(ctx) {
    if (!ctx) return "";
    var m = { "viga-pilar": ctx.face === "alma" ? "viga-alma-pilar" : "viga-mesa-pilar", "viga-viga": "viga-viga", "emenda-viga": "emenda-viga", cumeeira: "emenda-viga", "emenda-pilar": "emenda-pilar", base: "base", contraventamento: "contraventamento", "no-trelica": "no-trelica", tubular: "tubular", terca: "terca" };
    return m[ctx.relacao] || "";
  }

  /* ------------------------------------------------------------ aplicar */
  /* a altura da viga no pilar: o ponto do eixo da viga na ponta do nó, medido ao longo do pilar (m, do início do sólido) */
  function alturaNoPilar(pil, vg) {
    var M = global.BimMetal; if (!pil || !vg || !M) return null;
    var mp = M.membro(pil), mv = M.membro(vg); if (!mp || !mv) return null;
    var V = M.vet, pts = [mv.P0, V.add(mv.P0, V.mul(mv.X, mv.L))];
    function perp(P) { var d = V.sub(P, mp.P0), t = V.dot(d, mp.X); return V.len(V.sub(d, V.mul(mp.X, t))); }
    var P = perp(pts[1]) < perp(pts[0]) ? pts[1] : pts[0];
    return { mp: mp, mv: mv, xc: V.dot(V.sub(P, mp.P0), mp.X) };
  }
  /* aplica a opção: o lote (prolongar o pilar, se pedido + a macro + enrijecedores + chapa de reforço da alma) e a escolha
     guardada; op = { prolongar: true } faz o pilar subir o que a chapa estendida pede (no MESMO lote: um Ctrl+Z) */
  function aplicarOpcao(o, ctx, porId, novoId, op) {
    op = op || {};
    var BL = L(), ap = o.aplicar; if (!BL || !ap) return { ok: false, motivo: "Esta tipologia não tem desenho automático." };
    var pre = [];
    if (op.prolongar) {
      if (!ap.prolongar) return { ok: false, motivo: "Esta opção não pede pilar prolongado." };
      var pil0 = porId[String(ap.prolongar.alvo)], opP = pil0 && BL.prolongar ? BL.prolongar(pil0, ap.prolongar.mm / 1000) : null;
      if (!opP || !opP._apos) return { ok: false, motivo: "Este pilar não é de aço do modelador (prolongue pelas Propriedades: " + ap.prolongar.mm + " mm)." };
      porId = clone2(porId); porId[String(ap.prolongar.alvo)] = opP._apos; pre.push(opP);
    }
    var cx = ap.ordem.map(function (id) { return porId[String(id)]; }).filter(Boolean);
    if (cx.length !== ap.ordem.length) return { ok: false, motivo: "As peças da ligação não estão mais no modelo." };
    var lig = novoId(), par = clone(ap.par) || {}, r, lote; par.lig = lig;
    if (ap.macro) {
      r = BL.aplicar(ap.macro, cx, par);
      if (!r.ok && cx.length === 2) { var r2 = BL.aplicar(ap.macro, [cx[1], cx[0]], par); if (r2.ok) r = r2; }
      if (!r.ok) return { ok: false, motivo: r.motivo || "a macro recusou" };
      lote = BL.ops(r, novoId);
    } else { r = { ok: true, resumo: o.nome, avisos: [] }; lote = { op: "lote", id: String(novoId()), origem: "metal-lig", ops: [] }; }
    lote.ops = pre.concat(lote.ops);
    var extras = [];
    /* enrijecedores de continuidade no pilar, na altura das mesas da viga (mesma ligação: "Desfazer ligação" leva junto) */
    arr(ap.enrijecedores).forEach(function (en) {
      var pil = porId[String(en.alvo)], an = alturaNoPilar(pil, porId[String(ctx.A)]); if (!an) return;
      var mp = an.mp, mv = an.mv, xc = an.xc, h = mv.s.alt / 2 - num(mv.perfil.tf, 0.01) / 2;
      [xc + h, xc - h].forEach(function (x) {
        var tq = en.t || 0.0125; if (x < -0.05 || x > mp.L + 0.05) return;
        x = Math.max(tq / 2 + 0.002, Math.min(mp.L - tq / 2 - 0.002, x));   /* no topo do pilar o enrijecedor de cima encosta na ponta (vira a tampa entre as mesas) */
        var re = BL.enrijecedor(pil, { x: x, t: tq, lig: lig });
        if (re.ok) { var lo = BL.ops(re, novoId); if (lo) extras = extras.concat(lo.ops.filter(function (q) { return q.op === "criar"; })); }
      });
    });
    /* chapa de reforço da alma do pilar no painel do nó (altura da viga + 100 mm de cada lado) */
    arr(ap.reforcos).forEach(function (rf) {
      var pil = porId[String(rf.alvo)], an = alturaNoPilar(pil, porId[String(ctx.A)]); if (!an || !BL.reforcoAlma) return;
      var rr = BL.reforcoAlma(pil, { x: an.xc, t: rf.t || 0.008, altura: an.mv.s.alt + 0.2, lig: lig });
      if (rr.ok) { var lo2 = BL.ops(rr, novoId); if (lo2) extras = extras.concat(lo2.ops.filter(function (q) { return q.op === "criar"; })); }
    });
    if (!lote.ops.length && !extras.length) return { ok: false, motivo: "Nada a desenhar para esta opção." };
    lote.ops = lote.ops.concat(extras);
    /* a 1ª peça NOVA da ligação (as primeiras ops podem ser o ajuste da ponta da viga, que recria a viga) */
    var primeira = lote.ops.filter(function (q) { return q.op === "criar" && q.caixa && q.caixa.metal && q.caixa.metal.lig === lig; })[0];
    if (op.prolongar) r.resumo = "Pilar prolongado " + ap.prolongar.mm + " mm; " + (r.resumo || "");
    var S0 = S(), ent = o.entrada || (S0 ? S0.entradaCalc(ctx, {}) : null);
    if (primeira) primeira.caixa.ligInfo = { v: 1, tipologia: o.tipologia, nome: o.nome, familia: o.familia, regra: o.regra.id, pecas: arr(ctx.ordem).slice(), entrada: ent, notaCorte: (o.resultado && o.resultado.notaCorte) || null,
      resumo: (o.resultado || {}).resumo || "", razao: num((o.resultado || {}).razao, 0), ok: !!o.passa, estimativa: !!ctx.estimativa, em: new Date().toISOString() };
    return { ok: true, lote: lote, r: r, lig: lig, n: lote.ops.length, aviso: ap.aviso };
  }

  var MetalLigSugUI = {
    COMANDOS: COMANDOS,
    ids: function () { return COMANDOS.map(function (c) { return c.id; }); },
    registrar: function (reg) {
      if (!previa() || !S() || !T() || !C2()) return false;
      var self = this, h = { "met-lig-inteligente": function () { self.abrir(); }, "met-lig-catalogo": function () { self.catalogo(); }, "met-lig-lote": function () { self.lote(); }, "met-lig-memorial": function () { self.memorial(); } };
      Object.keys(h).forEach(function (k) { reg[k] = function () { try { h[k](); } catch (e) { toast("Ligação inteligente: " + (e && e.message ? e.message : e), "erro", 8000); } return true; }; });
      try {
        var D = global.DicaRica;
        if (D && D.item && D.registrar) {
          D.item("lig-inteligente", { titulo: "Ligação inteligente", oQueE: "O sistema entende o encontro das peças selecionadas e sugere a ligação que fica melhor, dimensionada.", ondeUsa: "Viga × pilar (mesa ou alma), viga × viga, emendas, bases, contraventamento, treliça, terça.", dica: "Clique no pilar e, com Ctrl, na viga; depois chame o comando.", svg: T().svg("chapa-ext-estendida-enrij") });
          D.item("lig-catalogo", { titulo: "Catálogo de ligações", oQueE: T().TIPOS.length + " tipologias de ligação com desenho, família, verificações e limitações.", ondeUsa: "Escolher e conhecer a ligação antes de detalhar.", dica: "Filtre pela aplicação.", svg: T().svg("cant-dupla-paraf") });
          D.registrar("met-lig-inteligente", "lig-inteligente"); D.registrar("met-lig-catalogo", "lig-catalogo");
        }
      } catch (eD) {}
      return true;
    },

    /* abre o painel com as sugestões para a seleção (devolve o resultado — a e2e usa) */
    abrir: function (o) {
      o = o || {};
      var S0 = S(); if (!S0 || !global.UI) return null;
      css();
      var cxs = o.manter && U.cxs ? U.cxs : selCaixas();
      if (!cxs.length) { var t = "Ligação inteligente: selecione as peças que se encontram — clique no PILAR e, com Ctrl, na VIGA (ou um pilar sozinho para a base)."; status(t); toast(t, "aviso", 8000); return null; }
      var ctx = S0.analisar(cxs, { resultado: resultadoCalc() });
      if (!ctx.ok) { status("Ligação inteligente: " + ctx.motivo); toast(ctx.motivo, "aviso", 8000); return null; }
      var sg = S0.sugerir(ctx, { preferir: U.preferir || null, tabela: lerTabela() });
      U.cxs = cxs; U.ctx = ctx; U.sg = sg;
      if (!sg.ok || !sg.opcoes.length) { toast("Ligação inteligente: nenhuma tipologia para este encontro (" + (REL[ctx.relacao] || ctx.relacao) + ").", "aviso", 8000); return sg; }
      UI.modal("Ligação inteligente — " + (REL[ctx.relacao] || ctx.relacao), painelHtml(ctx, sg), [{ texto: "Catálogo", onClick: function () { MetalLigSugUI.catalogo(apDe(ctx)); } }, { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
      ligar(document.querySelector("[data-lsg='painel']"));
      status("Ligação inteligente: " + sg.opcoes.length + " opção(ões) para " + (REL[ctx.relacao] || ctx.relacao) + "; a 1ª " + (sg.opcoes[0].passa ? "passa" : "NÃO passa") + ".");
      return sg;
    },
    sugestao: function () { return U.sg; },
    /* a opção vira o padrão desta combinação de seções (R-TAB) e o painel se refaz */
    usarComoPadrao: function (i) {
      var o = U.sg && U.sg.opcoes[i]; if (!o || !U.sg.chave) return false;
      var t = lerTabela(); t[U.sg.chave] = o.tipologia;
      if (!gravarTabela(t)) { toast("Não deu para guardar o padrão neste navegador.", "aviso", 6000); return false; }
      toast(o.nome + ": padrão para " + U.sg.chave.split("|").join(" · ") + ".", "ok", 6000);
      this.abrir({ manter: true });
      return true;
    },
    tabela: function () { return lerTabela(); },
    podeAplicar: podeAplicar, _cartao: function (o, i) { return cartao(o, i || 0); },
    limparTabela: function () { return gravarTabela({}); },
    contexto: function () { return U.ctx; },
    aplicar: function (i, opA) {
      opA = opA || {};
      var sg = U.sg, ctx = U.ctx, o = sg && sg.opcoes[i], M = MU(); if (!o || !M) return null;
      if (!o.aplicar) { toast("Esta tipologia ainda não tem desenho automático no 3D.", "aviso", 7000); return null; }
      var pod = podeAplicar(o);
      if (!(pod.ok || (opA.prolongar && pod.prolongar))) { toast("Não aplicável: " + pod.motivo + ".", "aviso", 8000); return null; }
      var por = {}; todasCaixas().forEach(function (c) { por[String(c.id)] = c; });
      var a = aplicarOpcao(o, ctx, por, M.novoId.bind(M), { prolongar: !!opA.prolongar });
      if (!a.ok) { toast("Aplicar: " + a.motivo, "aviso", 8000); return a; }
      if (!M.enviar(a.lote)) { toast("O editor recusou a ligação.", "erro"); return { ok: false, motivo: "editor recusou" }; }
      U.ultimo = { lig: a.lig, tipologia: o.tipologia, n: a.n };
      try { UI.fecharModal(); } catch (e) {}
      var av = arr(a.r.avisos);
      status(o.nome + " aplicada: " + a.r.resumo + "." + (a.aviso ? " " + a.aviso : "") + (av.length ? " " + av.length + " aviso(s) de furação." : "") + " Ctrl+Z desfaz.");
      toast(o.nome + " aplicada (" + (o.passa ? "passa" : "NÃO passa") + ", " + br(num(o.resultado.razao, 0) * 100) + " %).", o.passa ? "ok" : "aviso", 7000);
      return a;
    },
    ultimo: function () { return U.ultimo; },

    /* ------------------------------------------------------------ catálogo */
    catalogo: function (ap) {
      var Tp = T(); if (!Tp || !global.UI) return false;
      css();
      var opts = '<option value="">Todas as aplicações</option>' + Object.keys(Tp.APLICACOES).map(function (k) { return '<option value="' + k + '"' + (k === ap ? " selected" : "") + ">" + esc(Tp.APLICACOES[k]) + "</option>"; }).join("");
      function lista(a) {
        return (a ? Tp.porAplicacao(a) : Tp.TIPOS).map(function (t) {
          return '<div class="lsg-op" data-lsg-cat="' + esc(t.id) + '"><h3>' + esc(t.nome) + '</h3><div class="lsg-chips"><span class="lsg-chip">' + esc(FAM[t.familia]) + '</span><span class="lsg-chip">' + esc(t.meio === "mista" ? "soldada + parafusada" : t.meio) + '</span><span class="lsg-chip">' + (t.geometria ? "desenho no 3D" : "só cálculo") + "</span></div>" +
            '<div class="lsg-svg">' + (Tp.svg(t.id) || "") + "</div><p>" + esc(t.dica) + "</p>" +
            "<details><summary>Verificações e limitações</summary><ul>" + Tp.verificacoesDe(t.id).map(function (v) { return "<li>" + esc(v.texto) + " — " + esc(v.norma) + ", " + esc(v.item) + "</li>"; }).join("") + "</ul><ul class=\"con\">" + t.limitacoes.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></details></div>";
        }).join("");
      }
      var h = '<div class="lsg" data-lsg="catalogo" data-modal-largo><div class="lsg-topo"><label>Aplicação <select data-lsg="cat-ap">' + opts + '</select></label><span class="lsg-nota" data-lsg="cat-n"></span></div><div class="lsg-cat" data-lsg="cat-lista">' + lista(ap) + '</div><p class="lsg-nota">' + esc(Tp.EDICAO.aviso) + " Os desenhos são esquemas didáticos, sem escala.</p></div>";
      UI.modal("Catálogo de ligações (" + Tp.TIPOS.length + " tipologias)", h, [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
      var raiz = document.querySelector("[data-lsg='catalogo']"), sel = raiz && raiz.querySelector("[data-lsg='cat-ap']"), cont = raiz && raiz.querySelector("[data-lsg='cat-n']"), box = raiz && raiz.querySelector("[data-lsg='cat-lista']");
      function conta() { if (cont && box) cont.textContent = box.querySelectorAll("[data-lsg-cat]").length + " tipologia(s)"; }
      if (sel) sel.addEventListener("change", function () { box.innerHTML = lista(sel.value); conta(); });
      conta();
      return true;
    },

    /* ------------------------------------------------------------ memorial */
    ligacoesDoModelo: function (caixas) {
      var C = C2(); if (!C) return [];
      var out = [];
      arr(caixas || todasCaixas()).forEach(function (c) {
        var li = c && c.ligInfo; if (!li || !li.tipologia) return;
        var ent = clone(li.entrada) || {};
        var r = C.verificar(li.tipologia, ent);
        out.push({ id: String((c.metal && c.metal.lig) || c.id), titulo: (li.nome || li.tipologia) + " — peças " + arr(li.pecas).join(" × "), resultado: r, info: li });
      });
      return out;
    },
    memorialHtml: function (lista, titulo) {
      var S0 = S(), sec = S0 ? S0.secaoMemorial(lista) : null;
      return "<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><title>" + esc(titulo || "Memorial das ligações") + "</title><style>body{font:11pt/1.45 system-ui,sans-serif;color:#1d2733;max-width:190mm;margin:12mm auto;padding:0 8mm}h1{font-size:16pt}h3{font-size:12pt;margin-top:8mm;border-bottom:1px solid #ccd5de}h4{font-size:10pt;margin:4mm 0 1mm}.eq{font-family:ui-monospace,monospace;color:#2d6a9c}.nota{color:#5b6774;font-size:9pt}li{margin-bottom:.6mm}</style></head><body><h1>" + esc(titulo || "Memorial das ligações") + "</h1>" +
        (sec ? sec.html : "<p>Nenhuma ligação aplicada pela ligação inteligente neste modelo.</p>" + (S0 && S0.escopoHtml ? S0.escopoHtml() : "")) + "</body></html>";
    },
    abrirHtml: function (html, nome) {
      if (global.UnidadesMemorial) html = UnidadesMemorial.preparar(html);   /* aba SI | Técnica (kgf / tf) */
      var w = null; try { w = global.open("", "_blank"); } catch (e) { w = null; }
      if (w && w.document) { w.document.open(); w.document.write(html); w.document.close(); toast("Memorial aberto em outra aba (Ctrl+P para PDF).", "ok", 6000); return true; }
      var M = MU(); if (M && M.baixar) { M.baixar((M.arqBase ? M.arqBase() : "obra") + "-" + nome + ".html", html, "text/html"); toast("Memorial baixado (.html).", "ok", 6000); return true; }
      return false;
    },
    memorialOpcao: function (i) {
      var o = U.sg && U.sg.opcoes[i]; if (!o) return null;
      var html = this.memorialHtml([{ id: o.tipologia, titulo: o.nome, resultado: o.resultado }], "Memorial — " + o.nome);
      this._ultimoMemorial = { n: 1, bytes: html.length };
      this.abrirHtml(html, "memorial-ligacao");
      return html;
    },
    memorial: function () {
      var lst = this.ligacoesDoModelo();
      if (!lst.length) { toast("Memorial das ligações: nenhuma ligação aplicada pela Ligação inteligente neste modelo.", "aviso", 7000); return null; }
      var html = this.memorialHtml(lst, "Memorial das ligações");
      this._ultimoMemorial = { n: lst.length, bytes: html.length };
      this.abrirHtml(html, "memorial-ligacoes");
      return html;
    },

    /* ------------------------------------------------------------ ligar todos os nós */
    nos: function (caixas) {
      var M = global.BimMetal, S0 = S(); if (!M || !S0) return [];
      var mbs = [];
      arr(caixas).forEach(function (c) { var mb = M.membro(c); if (mb && !(c.metal && c.metal.lig)) mbs.push({ c: c, mb: mb, vert: Math.abs(mb.X[1]) >= Math.cos(15 * Math.PI / 180) }); });
      var V = M.vet, pares = [], vistos = {}, ligados = {};
      arr(caixas).forEach(function (c) { if (c && c.metal && c.metal.lig && c.metal.soldadaEm) (ligados[String(c.metal.lig)] = ligados[String(c.metal.lig)] || {})[String(c.metal.soldadaEm)] = 1; arr(c && c.metalFuros).forEach(function (f) { if (f.lig) (ligados[String(f.lig)] = ligados[String(f.lig)] || {})[String(c.id)] = 1; }); });
      function jaLigados(a, b) { return Object.keys(ligados).some(function (k) { return ligados[k][a] && ligados[k][b]; }); }
      mbs.forEach(function (A) {
        if (A.vert) return;
        [A.mb.P0, V.add(A.mb.P0, V.mul(A.mb.X, A.mb.L))].forEach(function (P) {
          var melhor = null, dm = Infinity;
          mbs.forEach(function (B) {
            if (B === A) return;
            var d = V.sub(P, B.mb.P0), t = V.dot(d, B.mb.X), perp = V.len(V.sub(d, V.mul(B.mb.X, t)));
            if (t < -0.05 || t > B.mb.L + 0.05 || Math.abs(V.dot(A.mb.X, B.mb.X)) > 0.996) return;
            if (perp < Math.max(B.mb.s.alt, B.mb.s.larg) / 2 + A.mb.s.alt / 2 + 0.05 && perp < dm) { dm = perp; melhor = B; }
          });
          if (!melhor) return;
          var k = A.c.id + "|" + melhor.c.id + "|" + (V.dot(V.sub(P, A.mb.P0), A.mb.X) < A.mb.L / 2 ? "i" : "f");
          if (vistos[k] || jaLigados(String(A.c.id), String(melhor.c.id))) return; vistos[k] = 1;
          pares.push([A.c, melhor.c]);
        });
      });
      /* bases: a ponta de baixo do pilar sem nada embaixo */
      var minY = Infinity; mbs.forEach(function (m) { minY = Math.min(minY, m.mb.P0[1], m.mb.P0[1] + m.mb.X[1] * m.mb.L); });
      mbs.forEach(function (m) { if (m.vert && Math.min(m.mb.P0[1], m.mb.P0[1] + m.mb.X[1] * m.mb.L) < minY + 0.05 && !Object.keys(ligados).some(function (k) { return ligados[k][String(m.c.id)] && Object.keys(ligados[k]).length === 1; })) pares.push([m.c]); });
      return pares;
    },
    lote: function () {
      var S0 = S(), M = MU(); if (!S0 || !M) return null;
      var sel = selCaixas(), base = sel.length ? sel : todasCaixas().filter(function (c) { return c.tipo === "metal" && c.metal && c.metal.kind === "perfil" && !c.metal.lig; });
      var pares = this.nos(base);
      if (!pares.length) { toast("Ligar todos os nós: nenhum encontro sem ligação nas peças " + (sel.length ? "selecionadas" : "do modelo") + ".", "aviso", 7000); return null; }
      /* o estado LOCAL anda junto: a 2ª ligação da mesma viga vê a ponta já ajustada e os furos da 1ª (replay do BimEdit) */
      var E = global.BimEdit, baseOps = todasCaixas().map(function (c) { return { op: "criar", id: String(c.id), caixa: clone(c) }; });
      var res = { feitas: [], puladas: [] }, ops = [], rc = resultadoCalc();
      function porAtual() {
        var lst = todasCaixas();
        if (ops.length && E && E.aplicar) { try { var st = E.aplicar(baseOps.concat([{ op: "lote", id: "lsg-tmp", origem: "metal-lig", ops: ops }])); if (st && st.caixas) lst = st.caixas; } catch (e) {} }
        var o = {}; lst.forEach(function (c) { o[String(c.id)] = c; }); return o;
      }
      pares.forEach(function (pp0) {
        var por = porAtual(), pp = pp0.map(function (c) { return por[String(c.id)] || c; });
        var ctx = S0.analisar(pp, { resultado: rc }); if (!ctx.ok) { res.puladas.push({ pecas: pp.map(function (c) { return c.id; }), motivo: ctx.motivo }); return; }
        var sg = S0.sugerir(ctx, {}), o = sg.opcoes.filter(function (x) { return x.passa && x.aplicar && !x.avisos.some(function (a) { return /INCOER/.test(a); }); })[0];
        if (!o) { res.puladas.push({ pecas: ctx.ordem, motivo: "nenhuma opção que passa com desenho automático" }); return; }
        var a = aplicarOpcao(o, ctx, por, M.novoId.bind(M));
        if (!a.ok) { res.puladas.push({ pecas: ctx.ordem, motivo: a.motivo }); return; }
        ops = ops.concat(a.lote.ops); res.feitas.push({ pecas: ctx.ordem, tipologia: o.tipologia, resumo: a.r.resumo });
      });
      if (ops.length && !M.enviar({ op: "lote", id: M.novoId(), origem: "metal-lig", ops: ops })) { toast("O editor recusou o lote.", "erro"); return null; }
      var msg = res.feitas.length + " ligação(ões) aplicada(s)" + (res.puladas.length ? "; " + res.puladas.length + " encontro(s) sem solução automática" : "") + ". Ctrl+Z desfaz.";
      status("Ligar todos os nós: " + msg); toast(msg, res.feitas.length ? "ok" : "aviso", 8000);
      if (res.puladas.length && global.UI) {
        UI.modal("Ligar todos os nós", '<div class="lsg" data-lsg="lote"><p>' + esc(msg) + "</p><ul>" + res.puladas.map(function (p) { return "<li>" + esc(arr(p.pecas).join(" × ")) + ": " + esc(p.motivo) + "</li>"; }).join("") + "</ul><p class=\"lsg-nota\">Os que ficaram: selecione as peças e use a Ligação inteligente.</p></div>", [{ texto: "Ok", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
      }
      this._ultimoLote = res;
      return res;
    }
  };
  global.MetalLigSugUI = MetalLigSugUI;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalLigSugUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
