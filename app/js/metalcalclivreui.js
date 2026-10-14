/* =====================================================================
 * metalcalclivreui.js — a TELA "CALCULAR A ESTRUTURA DESENHADA" (Metálica
 * › Cálculo, ao lado do assistente de galpão). 13/10/2026.
 *
 * Fina: quem calcula é o js/acodimlivre.js (+ js/acomodelolivre.js); o
 * memorial é o js/acomemoriallivre.js; a vista 3D (js/metalcalcvista.js) e
 * o CYPE (js/acocype.js) são os do galpão. Passo a passo enxuto:
 *   1. ESTRUTURA — o que o sistema leu do modelo (barras, nós, ligações
 *      desenhadas, problemas), as BASES (rotulada/engastada, todas ou pilar
 *      a pilar) e o padrão das ligações que não foram desenhadas;
 *   2. CARGAS — áreas (um piso por nível ou as vigas selecionadas) com o
 *      revestimento e o USO da NBR 6120 (valor da Tabela 10), carga pontual
 *      na peça selecionada e, se a estrutura é fechada/coberta, o vento;
 *   3. CALCULAR — com a opção de achar o perfil mais leve por grupo; o
 *      resultado (aprovado, peso, razões, flechas, reações, decisões,
 *      problemas com o botão da solução), Ver em 3D, Memorial, CYPE e
 *      "Aplicar os perfis no modelo" — as peças são TROCADAS NO LUGAR (op
 *      metalAjustar), num lote só: um Ctrl+Z desfaz tudo.
 * Os dados ficam na obra (localStorage `orcapro:metal:livre:<obra>`).
 * ⚠ Sem backdrop-filter; a janela fica no z 49 (abaixo do modal do app).
 * ===================================================================== */
(function (global) {
  "use strict";
  var doc = global.document;

  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(/\s/g, "").replace(",", ".")); return isFinite(n) ? n : d; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  function fmt(v, c) { if (v == null || !isFinite(v)) return "—"; c = c == null ? 2 : c; var s = Math.abs(v).toFixed(c).split("."), i = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, "."); return (v < 0 && Number(s.join(".")) !== 0 ? "−" : "") + i + (c ? "," + s[1] : ""); }
  function fin(v) { return v == null || v === "" ? "" : String(v).replace(".", ","); }
  function toast(t, tipo, ms) { try { if (global.UI && UI.toast) UI.toast(t, tipo || "ok", ms || 6000); } catch (e) {} }
  function status(t) { try { if (global.BimShell && BimShell.status) BimShell.status(t); } catch (e) {} }
  function ML() { return global.AcoModeloLivre; }
  function DL() { return global.AcoDimLivre; }
  function MU() { return global.BimMetalUI; }
  function obraId() { var g = global.Gestao; return String((g && g._bimSel) || "geral"); }
  function obra() { var g = global.Gestao, o = null; try { if (g && g._bimSel && global.Store && global.Auth) o = Store.obter(Auth.empresaId(), "obras", g._bimSel); } catch (e) {} return o; }
  function chave() { return "orcapro:metal:livre:" + obraId(); }

  var PADRAO = { apoios: { basePadrao: "rotulada", bases: {} }, ligacoes: { vigaPilar: "rotulada", vigaViga: "rotulada" }, areas: [], pontuais: [],
                 vento: { ativo: false, v0: "", lat: "", lon: "", categoria: "II", grupoS3: 2, faces: { frente: true, fundo: true, esquerda: true, direita: true } }, otimizar: false, soSelecao: false, acrescimo: 0.05 };
  var U = { est: null, obra: null, passo: 1, modo: "passos", r: null, lido: null, G: null, calculando: false, sel: [] };

  function ler() { try { var s = global.localStorage && localStorage.getItem(chave()); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function salvar() { try { if (global.localStorage) localStorage.setItem(chave(), JSON.stringify(U.est)); } catch (e) {} }
  function estado() {
    if (U.obra !== obraId()) { U.obra = obraId(); U.est = null; U.r = null; }
    if (!U.est) { var s = ler(), e = copia(PADRAO); if (s) Object.keys(s).forEach(function (k) { e[k] = s[k]; }); U.est = e; }
    return U.est;
  }
  function caixas() { var M = MU(), st = M && M.estado ? M.estado() : null; return (st && st.caixas) || []; }
  function selecao() { var M = MU(); try { return M && M.selecao ? M.selecao() : []; } catch (e) { return []; } }

  /* ============================================================ LEITURA (prévia, sem calcular) */
  function lerModelo() {
    var M = ML(), e = estado(); if (!M) return null;
    var ids = e.soSelecao ? selecao() : null;
    U.lido = M.ler(caixas(), { ids: ids && ids.length ? ids : null });
    U.G = null;
    if (U.lido.pecas.length) { try { U.G = M.montar(U.lido, { basePadrao: e.apoios.basePadrao, bases: e.apoios.bases, vigaPilar: e.ligacoes.vigaPilar, vigaViga: e.ligacoes.vigaViga }); } catch (er) { U.G = null; } }
    return U.lido;
  }
  function entrada() {
    var e = estado(), ids = e.soSelecao ? selecao() : null;
    var areas = e.areas.map(function (a) { var o = copia(a); o.g = num(a.g, 0); o.qInformado = num(a.qInformado, null); o.alturaEstoque = num(a.alturaEstoque, null); o.inclinacaoPct = num(a.inclinacaoPct, 3); if (!o.uso) delete o.uso; return o; });
    var v = e.vento && e.vento.ativo ? { v0: num(e.vento.v0, null), lat: num(e.vento.lat, null), lon: num(e.vento.lon, null), categoria: e.vento.categoria, grupoS3: num(e.vento.grupoS3, 2), faces: {} } : null;
    if (v) Object.keys(e.vento.faces || {}).forEach(function (f) { v.faces[f] = { fechada: !!e.vento.faces[f] }; });
    return { caixas: caixas(), ids: ids && ids.length ? ids : null, apoios: copia(e.apoios), ligacoes: copia(e.ligacoes),
             cargas: { areas: areas, pontuais: copia(e.pontuais), acrescimoLigacoes: num(e.acrescimo, 0.05), vento: v }, otimizar: !!e.otimizar };
  }

  /* ============================================================ ESTILO */
  function estilo() {
    if (!doc || doc.getElementById("ml-css")) return;
    var st = doc.createElement("style"); st.id = "ml-css";
    st.textContent = [
      ".ml-veu{position:fixed;inset:0;z-index:49;background:rgba(9,20,33,.5);display:flex;align-items:center;justify-content:center;padding:18px}",
      ".ml-jan{--ml-bg:#f3f6fa;--ml-sup:#fff;--ml-sup2:#eef3f8;--ml-linha:#d8e1ea;--ml-tx:#13202e;--ml-tx2:#55677a;--ml-navy:#0f2740;--ml-aco:#0d6ebd;--ml-ambar:#e9a23b;--ml-ok:#15803d;--ml-aviso:#aa6200;--ml-erro:#c81e25;--ml-okbg:#e9f6ee;--ml-errobg:#fdecec;--ml-avbg:#fff6e6;",
      "width:min(1180px,100%);height:min(820px,100%);display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:var(--ml-bg);border-radius:16px;overflow:hidden;color:var(--ml-tx);font-family:var(--fonte,'Segoe UI',system-ui,sans-serif);font-size:13.5px;line-height:1.45;box-shadow:0 30px 90px rgba(4,12,24,.5)}",
      "[data-tema='dark'] .ml-jan{--ml-bg:#0e1824;--ml-sup:#142130;--ml-sup2:#1b2b3c;--ml-linha:#28394b;--ml-tx:#e3ecf5;--ml-tx2:#9db0c4;--ml-okbg:#12301f;--ml-errobg:#3a1517;--ml-avbg:#3a2a10}",
      ".ml-jan *{box-sizing:border-box} .ml-jan:focus{outline:none}",
      ".ml-cab{display:flex;align-items:center;gap:14px;padding:13px 18px;background:linear-gradient(120deg,#0f2740,#1d4a74);color:#fff;border-bottom:3px solid var(--ml-ambar)}",
      ".ml-cab h2{margin:0;font-size:17px;font-weight:700;color:#fff} .ml-cab p{margin:1px 0 0;font-size:12px;color:#a9c3dc} .ml-esp{flex:1}",
      ".ml-cb{height:34px;padding:0 12px;border-radius:9px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.07);color:#e6eff8;font:600 12.5px inherit;cursor:pointer} .ml-cb:hover{background:rgba(255,255,255,.15)}",
      ".ml-corpo{display:grid;grid-template-columns:230px minmax(0,1fr);min-height:0} .ml-corpo.cheio{grid-template-columns:minmax(0,1fr)}",
      ".ml-trilho{background:var(--ml-sup);border-right:1px solid var(--ml-linha);padding:14px 10px;display:flex;flex-direction:column;gap:4px}",
      ".ml-passo{display:grid;grid-template-columns:28px 1fr;gap:9px;text-align:left;background:none;border:0;border-radius:10px;padding:9px;cursor:pointer;color:inherit;font:inherit}",
      ".ml-passo:hover{background:var(--ml-sup2)} .ml-passo[aria-current='step']{background:var(--ml-sup2);box-shadow:inset 3px 0 0 var(--ml-ambar)}",
      ".ml-passo .n{width:26px;height:26px;border-radius:50%;border:2px solid var(--ml-linha);display:grid;place-items:center;font-weight:700;font-size:12px}",
      ".ml-passo[aria-current='step'] .n{background:var(--ml-navy);border-color:var(--ml-navy);color:#fff} .ml-passo b{display:block;font-size:13.5px} .ml-passo small{display:block;color:var(--ml-tx2);font-size:11.5px}",
      ".ml-palco{overflow:auto;padding:18px 22px} .ml-palco h3{margin:0 0 4px;font-size:16px} .ml-palco .ml-d{margin:0 0 14px;color:var(--ml-tx2)}",
      ".ml-card{background:var(--ml-sup);border:1px solid var(--ml-linha);border-radius:12px;padding:12px 14px;margin:0 0 12px}",
      ".ml-card h4{margin:0 0 8px;font-size:13.5px} .ml-lin{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:6px 0}",
      ".ml-campo{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--ml-tx2)} .ml-campo input,.ml-campo select{height:32px;border:1px solid var(--ml-linha);border-radius:8px;padding:0 8px;background:var(--ml-sup);color:var(--ml-tx);font:inherit;min-width:90px}",
      ".ml-campo select{max-width:420px}",
      ".ml-seg{display:inline-flex;border:1px solid var(--ml-linha);border-radius:9px;overflow:hidden} .ml-seg button{border:0;background:var(--ml-sup);color:var(--ml-tx);padding:7px 12px;font:600 12.5px inherit;cursor:pointer}",
      ".ml-seg button[aria-pressed='true']{background:var(--ml-navy);color:#fff}",
      ".ml-bt{height:34px;padding:0 14px;border-radius:9px;border:1px solid var(--ml-linha);background:var(--ml-sup);color:var(--ml-tx);font:600 13px inherit;cursor:pointer} .ml-bt:hover{border-color:var(--ml-aco)}",
      ".ml-bt.pri{background:var(--ml-aco);border-color:var(--ml-aco);color:#fff} .ml-bt.mini{height:28px;padding:0 10px;font-size:12px} .ml-bt:disabled{opacity:.5;cursor:default}",
      ".ml-rod{display:flex;align-items:center;gap:10px;padding:11px 18px;background:var(--ml-sup);border-top:1px solid var(--ml-linha)} .ml-rod .ml-msg{flex:1;color:var(--ml-tx2);font-size:12.5px}",
      "table.ml-t{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums} table.ml-t th{text-align:left;font-weight:650;color:var(--ml-tx2);border-bottom:1px solid var(--ml-linha);padding:5px 6px} table.ml-t td{border-bottom:1px solid var(--ml-linha);padding:5px 6px;vertical-align:top} table.ml-t td.n{text-align:right;white-space:nowrap}",
      ".ml-chip{display:inline-block;padding:2px 9px;border-radius:99px;font-size:11.5px;font-weight:650;background:var(--ml-sup2);color:var(--ml-tx2)} .ml-chip.ok{background:var(--ml-okbg);color:var(--ml-ok)} .ml-chip.erro{background:var(--ml-errobg);color:var(--ml-erro)} .ml-chip.av{background:var(--ml-avbg);color:var(--ml-aviso)}",
      ".ml-kpi span{display:block;margin-top:2px} .ml-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0 0 12px} .ml-kpi{background:var(--ml-sup);border:1px solid var(--ml-linha);border-radius:12px;padding:10px 12px} .ml-kpi small{display:block;color:var(--ml-tx2);font-size:11.5px} .ml-kpi b{font-size:19px}",
      ".ml-barra{height:7px;border-radius:9px;background:var(--ml-sup2);overflow:hidden;min-width:70px} .ml-barra i{display:block;height:100%;border-radius:9px}",
      ".ml-prob{border:1px solid var(--ml-erro);background:var(--ml-errobg);border-radius:12px;padding:12px 14px;margin:0 0 12px} .ml-prob p{margin:0 0 8px}",
      ".ml-aviso{color:var(--ml-aviso);font-size:12.5px} .ml-nota{color:var(--ml-tx2);font-size:12px} ul.ml-l{margin:4px 0;padding-left:18px} ul.ml-l li{margin:2px 0}"
    ].join("");
    doc.head.appendChild(st);
  }
  function raiz() { return doc ? doc.getElementById("ml-veu") : null; }
  function garantir() {
    estilo(); estado();
    var v = raiz(); if (v) return v;
    v = doc.createElement("div"); v.id = "ml-veu"; v.className = "ml-veu";
    v.innerHTML = '<div class="ml-jan" role="dialog" aria-modal="true" aria-labelledby="ml-tit" tabindex="-1"></div>';
    doc.body.appendChild(v);
    v.addEventListener("click", function (ev) { var b = ev.target.closest("[data-ml-acao]"); if (b && v.contains(b)) { ev.preventDefault(); acao(b.getAttribute("data-ml-acao"), b.getAttribute("data-ml-v"), b); } });
    v.addEventListener("change", function (ev) { var c = ev.target.closest("[data-ml-campo]"); if (c) campo(c); });
    v.addEventListener("keydown", function (ev) { if (ev.key === "Escape") { ev.stopPropagation(); if (U.modo === "vista") { U.modo = "resultado"; render(); } else fechar(); } });
    return v;
  }
  function fechar() { soltarVista(); salvar(); var v = raiz(); if (v) v.remove(); }

  /* ============================================================ RENDER */
  var PASSOS = [{ n: 1, t: "Estrutura e apoios" }, { n: 2, t: "Cargas" }, { n: 3, t: "Calcular" }];
  function resumoPasso(n) {
    var e = estado(), L = U.lido;
    if (n === 1) return L ? L.pecas.length + " barras · bases " + (e.apoios.basePadrao === "engastada" ? "engastadas" : "rotuladas") : "—";
    if (n === 2) return e.areas.length + " área(s) · " + e.pontuais.length + " pontual(is)" + (e.vento.ativo ? " · vento" : "");
    return U.r ? (U.r.ok ? (U.r.aprovado ? "Aprovado" : "Reprovado") + " · " + fmt(U.r.peso, 0) + " kg" : "Não calculou") : "Pronto para calcular";
  }
  function cab() {
    var o = obra();
    return '<header class="ml-cab"><div><h2 id="ml-tit">Calcular a estrutura desenhada</h2><p>' + esc((o && o.nome ? o.nome + " · " : "") + "NBR 8800 · NBR 14762 · NBR 6120 · NBR 8681 · NBR 6123") + '</p></div><span class="ml-esp"></span>' +
      (global.MetalCalcUI ? '<button class="ml-cb" data-ml-acao="galpao" title="O assistente do galpão (pórticos, terças, vento pelo endereço)">Assistente de galpão</button>' : "") +
      (U.r && U.modo !== "resultado" ? '<button class="ml-cb" data-ml-acao="resultado">Resultado</button>' : "") +
      '<button class="ml-cb" data-ml-acao="fechar" aria-label="Fechar" title="Fechar (Esc) — os dados ficam na obra">✕</button></header>';
  }
  function render() {
    var v = garantir(), jan = v.querySelector(".ml-jan"), h = cab();
    if (U.modo !== "vista") soltarVista();
    if (U.modo === "passos") {
      h += '<div class="ml-corpo"><nav class="ml-trilho" aria-label="Passos">' + PASSOS.map(function (p) { return '<button class="ml-passo" data-ml-acao="passo" data-ml-v="' + p.n + '"' + (p.n === U.passo ? ' aria-current="step"' : "") + '><span class="n">' + p.n + "</span><span><b>" + p.t + "</b><small data-ml-resumo=\"" + p.n + "\">" + esc(resumoPasso(p.n)) + "</small></span></button>"; }).join("") + "</nav>" +
        '<main class="ml-palco" data-ml-passo="' + U.passo + '">' + (U.passo === 1 ? passoEstrutura() : U.passo === 2 ? passoCargas() : passoCalcular()) + "</main></div>" +
        '<footer class="ml-rod"><span class="ml-msg">' + esc(U.passo === 3 ? "O sistema decide nós, flambagem e travamentos; o que ele não sabe vira aviso, nunca número chutado." : "Os dados ficam salvos na obra.") + "</span>" +
        (U.passo > 1 ? '<button class="ml-bt" data-ml-acao="passo" data-ml-v="' + (U.passo - 1) + '">Voltar</button>' : "") +
        (U.passo < 3 ? '<button class="ml-bt pri" data-ml-acao="passo" data-ml-v="' + (U.passo + 1) + '">Próximo</button>' : '<button class="ml-bt pri" data-ml-acao="calcular"' + (U.calculando ? " disabled" : "") + ">Calcular</button>") + "</footer>";
    } else if (U.modo === "calculando") {
      h += '<div class="ml-corpo cheio"><main class="ml-palco" data-ml-modo="calculando"><div class="ml-card" style="max-width:520px;margin:60px auto;text-align:center"><h3>Calculando a estrutura</h3><p class="ml-nota">Modelo, combinações, 2ª ordem, verificação de cada barra' + (estado().otimizar ? " e a busca do perfil mais leve por grupo" : "") + ".</p></div></main></div><footer class=\"ml-rod\"><span class=\"ml-msg\"></span></footer>";
    } else if (U.modo === "resultado") {
      h += '<div class="ml-corpo cheio"><main class="ml-palco" data-ml-modo="resultado">' + resultadoHtml(U.r) + "</main></div>" + rodapeResultado();
    } else if (U.modo === "vista") {
      h += '<div class="ml-corpo cheio"><main class="ml-palco" style="padding:0" data-ml-modo="vista"><div data-ml="vista3d" style="position:relative;width:100%;height:100%;min-height:420px"></div></main></div><footer class="ml-rod"><span class="ml-msg">Aproveitamento, deformada e flambagem global do cálculo.</span><button class="ml-bt" data-ml-acao="resultado">Voltar ao resultado</button></footer>';
    }
    jan.innerHTML = h; jan.setAttribute("data-ml-modo", U.modo);
    if (!v.contains(doc.activeElement)) { try { jan.focus({ preventScroll: true }); } catch (e) {} }
  }

  /* ---------------------------------------------------------- passo 1 */
  function seg(acaoId, atual, ops) { return '<div class="ml-seg" role="group">' + ops.map(function (o) { return '<button type="button" data-ml-acao="' + acaoId + '" data-ml-v="' + o[0] + '" aria-pressed="' + (String(atual) === String(o[0])) + '">' + esc(o[1]) + "</button>"; }).join("") + "</div>"; }
  function passoEstrutura() {
    var e = estado(), L = lerModelo(), G = U.G, h = '<h3>Estrutura e apoios</h3><p class="ml-d">O sistema lê as peças desenhadas na Metálica: as pontas que se tocam viram nós; a peça que passa por um nó continua por ele. Diga só como são as bases e as ligações que não foram desenhadas.</p>';
    if (!L) return h + '<div class="ml-prob"><p>O motor do cálculo não carregou nesta tela.</p></div>';
    var cont = {}; L.pecas.forEach(function (p) { cont[p.papel] = (cont[p.papel] || 0) + 1; });
    h += '<div class="ml-card"><h4>O que o sistema leu</h4><div class="ml-lin">' +
      ["pilar", "viga", "terca", "diagonal"].map(function (k) { return '<span class="ml-chip">' + (cont[k] || 0) + " " + { pilar: "pilares", viga: "vigas", terca: "terças", diagonal: "diagonais" }[k] + "</span>"; }).join("") +
      (G ? '<span class="ml-chip">' + G.modelo.nos.length + " nós</span><span class=\"ml-chip\">" + G.modelo.apoios.length + " apoios</span>" : "") +
      (Object.keys(L.ligacoes).length ? '<span class="ml-chip ok">' + Object.keys(L.ligacoes).length + " ligação(ões) desenhada(s)</span>" : "") + "</div>" +
      '<label class="ml-lin" style="gap:6px;font-size:12.5px"><input type="checkbox" data-ml-campo="soSelecao"' + (e.soSelecao ? " checked" : "") + "> Calcular só as peças selecionadas no modelo (" + selecao().length + " selecionada(s))</label>";
    if (!L.pecas.length) h += '<p class="ml-aviso">Nenhuma barra de aço desenhada' + (e.soSelecao ? " na seleção" : "") + ": use Metálica › Peças (Pilar, Viga, Diagonal, Terça).</p>";
    if (L.semPerfil.length) h += '<p class="ml-aviso">' + L.semPerfil.length + " peça(s) sem perfil do catálogo: " + esc(L.semPerfil.map(function (s) { return s.nome; }).join("; ")) + ' — escolha o perfil nas Propriedades. <button class="ml-bt mini" data-ml-acao="selecionar" data-ml-v="' + esc(L.semPerfil.map(function (s) { return s.id; }).join(",")) + '">Selecionar</button></p>';
    if (L.semAco.length) h += '<p class="ml-aviso">' + L.semAco.length + " peça(s) com aço desconhecido: " + esc(L.semAco.map(function (s) { return s.nome + " (" + s.aco + ")"; }).join("; ")) + ".</p>";
    h += "</div>";
    var pil = G ? G.bases : [];
    h += '<div class="ml-card"><h4>Bases dos pilares</h4><div class="ml-lin">' + seg("basePadrao", e.apoios.basePadrao, [["rotulada", "Todas rotuladas"], ["engastada", "Todas engastadas"]]) + '<span class="ml-nota">Rotulada: a fundação recebe só forças. Engastada: recebe momento (bloco maior, chumbadores fora das mesas).</span></div>' +
      (pil.length ? '<table class="ml-t"><thead><tr><th>Pilar</th><th>Peça</th><th>Cota da base</th><th>Base</th></tr></thead><tbody>' + pil.map(function (b) {
        var val = e.apoios.bases[b.peca] || "";
        return "<tr><td>" + esc(b.mid) + "</td><td>" + esc((U.lido.pecas.filter(function (p) { return p.id === b.peca; })[0] || {}).nome || b.peca) + '</td><td class="n">' + fmt(b.cota, 2) + ' m</td><td><select data-ml-campo="base" data-ml-peca="' + esc(b.peca) + '"><option value=""' + (!val ? " selected" : "") + ">como todas (" + (e.apoios.basePadrao === "engastada" ? "engastada" : "rotulada") + ')</option><option value="rotulada"' + (val === "rotulada" ? " selected" : "") + '>rotulada</option><option value="engastada"' + (val === "engastada" ? " selected" : "") + ">engastada</option></select></td></tr>";
      }).join("") + "</tbody></table>" : '<p class="ml-nota">Nenhuma base encontrada: a ponta de baixo do pilar que não encosta em nenhuma peça vira base.</p>') + "</div>";
    h += '<div class="ml-card"><h4>Ligações que NÃO foram desenhadas</h4><p class="ml-nota" style="margin-top:0">A ligação desenhada (chapa de extremidade → rígida; cantoneira dupla, clip, gusset → rotulada; cobrejunta → contínua) sempre manda.</p>' +
      '<div class="ml-lin"><span style="min-width:120px">Viga × pilar</span>' + seg("vigaPilar", e.ligacoes.vigaPilar, [["rotulada", "Rotulada"], ["rigida", "Rígida (pórtico)"]]) + "</div>" +
      '<div class="ml-lin"><span style="min-width:120px">Viga × viga</span>' + seg("vigaViga", e.ligacoes.vigaViga, [["rotulada", "Rotulada"], ["rigida", "Rígida"]]) + "</div></div>";
    return h;
  }
  /* ---------------------------------------------------------- passo 2 */
  function opcoesUso(atual) {
    var M = ML(), gr = {}, h = '<option value=""' + (!atual ? " selected" : "") + ">sem sobrecarga de uso</option>";
    M.USOS.forEach(function (u) { (gr[u.grupo] = gr[u.grupo] || []).push(u); });
    Object.keys(gr).forEach(function (g) { h += '<optgroup label="' + esc(g) + '">' + gr[g].map(function (u) { return '<option value="' + u.id + '"' + (u.id === atual ? " selected" : "") + ">" + esc(u.local) + (u.q != null ? " — " + fmt(u.q, u.q < 1 ? 2 : 1) + " kN/m²" : "") + (u.pag ? " (p. " + u.pag + ")" : "") + "</option>"; }).join("") + "</optgroup>"; });
    return h;
  }
  function passoCargas() {
    var e = estado(), M = ML(), h = '<h3>Cargas</h3><p class="ml-d">Peso próprio automático (perfis + ' + fmt(num(e.acrescimo, 0.05) * 100, 0) + ' % de ligações). Por área: o revestimento (permanente) e o USO da NBR 6120 — a carga vai para as vigas por faixas. Pontual: na peça selecionada.</p>';
    h += '<div class="ml-card"><h4>Áreas carregadas</h4><div class="ml-lin"><button class="ml-bt" data-ml-acao="area-niveis">Um piso por nível</button><button class="ml-bt" data-ml-acao="area-sel">Área com as vigas selecionadas</button><span class="ml-nota">O contorno é o das vigas; a placa vence o menor vão entre vigas paralelas.</span></div>';
    if (!e.areas.length) h += '<p class="ml-nota">Nenhuma área ainda.</p>';
    e.areas.forEach(function (a, k) {
      var u = a.uso ? M.usoDe(a.uso) : null, uc = a.uso ? M.usoCarga({ uso: a.uso, qInformado: num(a.qInformado, null), alturaEstoque: num(a.alturaEstoque, null), inclinacaoPct: num(a.inclinacaoPct, 3) }) : null;
      h += '<div class="ml-card" style="background:var(--ml-sup2)" data-ml-area="' + k + '"><div class="ml-lin" style="justify-content:space-between"><b>' + esc(a.nome) + '</b><span class="ml-nota">' + fmt(M.areaPoligono(a.poligono), 2) + " m² · cota " + fmt(a.cota, 2) + " m · " + arr(a.vigas).length + ' vigas</span><button class="ml-bt mini" data-ml-acao="area-tirar" data-ml-v="' + k + '">Remover</button></div>' +
        '<div class="ml-lin"><label class="ml-campo">Revestimento / piso g (kN/m²)<input data-grandeza="superficie" data-ml-campo="area.g" data-ml-k="' + k + '" value="' + esc(fin(a.g)) + '" inputmode="decimal"></label>' +
        '<label class="ml-campo">γ do permanente<select data-ml-campo="area.gCategoria" data-ml-k="' + k + '">' + [["G-geral", "em geral / equipamentos (1,50)"], ["G-insitu", "industrializado + in loco, p. ex. steel deck com concreto (1,40)"], ["G-industrializado", "industrializado, p. ex. grade, chapa (1,35)"]].map(function (o) { return '<option value="' + o[0] + '"' + ((a.gCategoria || "G-geral") === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" +
        '<label class="ml-campo">Uso — NBR 6120:2019, Tabela 10<select data-grandeza="superficie" data-ml-campo="area.uso" data-ml-k="' + k + '">' + opcoesUso(a.uso) + "</select></label>" +
        (u && (u.informado || u.q == null) && !u.cobertura ? '<label class="ml-campo">q informado (kN/m²)<input data-grandeza="superficie" data-ml-campo="area.qInformado" data-ml-k="' + k + '" value="' + esc(fin(a.qInformado)) + '" inputmode="decimal"></label>' : "") +
        (u && u.estoque ? '<label class="ml-campo">Altura de estoque (m)<input data-ml-campo="area.alturaEstoque" data-ml-k="' + k + '" value="' + esc(fin(a.alturaEstoque == null ? 2.5 : a.alturaEstoque)) + '" inputmode="decimal"></label>' : "") +
        (u && u.cobertura ? '<label class="ml-campo">Inclinação (%)<input data-ml-campo="area.inclinacaoPct" data-ml-k="' + k + '" value="' + esc(fin(a.inclinacaoPct == null ? 3 : a.inclinacaoPct)) + '" inputmode="decimal"></label>' : "") +
        '<label class="ml-campo">Direção da placa<select data-ml-campo="area.direcao" data-ml-k="' + k + '">' + [["auto", "automática (menor vão)"], ["x", "vigas em x"], ["z", "vigas em z"]].map(function (o) { return '<option value="' + o[0] + '"' + ((a.direcao || "auto") === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" +
        '<label class="ml-lin" style="gap:6px;font-size:12.5px"><input type="checkbox" data-ml-campo="area.cobertura" data-ml-k="' + k + '"' + (a.cobertura ? " checked" : "") + "> é cobertura (flecha L/250; recebe o vento)</label></div>" +
        (uc ? (uc.ok ? '<p class="ml-nota" style="margin:2px 0 0">' + esc(uc.texto) + " — " + esc(uc.referencia) + (uc.avisos.length ? '<br><span class="ml-aviso">' + esc(uc.avisos.join(" ")) + "</span>" : "") + "</p>" : '<p class="ml-aviso" style="margin:2px 0 0">' + esc(uc.motivo) + "</p>") : "") + "</div>";
    });
    h += "</div>";
    h += '<div class="ml-card"><h4>Cargas pontuais (equipamento, talha, reação de outra estrutura)</h4><div class="ml-lin"><label class="ml-campo">Distância do início da peça (m)<input data-ml-campo="pt.s" value="' + esc(fin(U.ptS)) + '" inputmode="decimal" placeholder="meio"></label>' +
      '<label class="ml-campo">Fx (kN)<input data-grandeza="forca" data-ml-campo="pt.fx" value="' + esc(fin(U.ptF && U.ptF[0])) + '" inputmode="decimal" placeholder="0"></label><label class="ml-campo">Fy (kN, − para baixo)<input data-grandeza="forca" data-ml-campo="pt.fy" value="' + esc(fin(U.ptF && U.ptF[1])) + '" inputmode="decimal" placeholder="−10"></label><label class="ml-campo">Fz (kN)<input data-grandeza="forca" data-ml-campo="pt.fz" value="' + esc(fin(U.ptF && U.ptF[2])) + '" inputmode="decimal" placeholder="0"></label>' +
      '<label class="ml-campo">Caso<select data-ml-campo="pt.caso"><option value="G">permanente (equipamento fixo)</option><option value="Q"' + (U.ptCaso === "Q" ? " selected" : "") + '>variável</option></select></label><button class="ml-bt" data-ml-acao="pt-add">Na peça selecionada</button></div>' +
      (e.pontuais.length ? '<table class="ml-t"><thead><tr><th>Carga</th><th>Peça</th><th>s (m)</th><th>F x; y; z (kN)</th><th>Caso</th><th></th></tr></thead><tbody>' + e.pontuais.map(function (p, k) { return "<tr><td>" + esc(p.nome) + "</td><td>" + esc(p.peca) + '</td><td class="n">' + fmt(p.s, 2) + '</td><td class="n">' + p.F.map(function (x) { return fmt(x, 2); }).join("; ") + "</td><td>" + esc(p.caso) + '</td><td><button class="ml-bt mini" data-ml-acao="pt-tirar" data-ml-v="' + k + '">Remover</button></td></tr>'; }).join("") + "</tbody></table>" : "") + "</div>";
    var vt = e.vento;
    h += '<div class="ml-card"><h4>Vento (NBR 6123)</h4><label class="ml-lin" style="gap:6px"><input type="checkbox" data-ml-campo="vento.ativo"' + (vt.ativo ? " checked" : "") + "> A estrutura é fechada/coberta: considerar o vento (paredes → pilares da face; cobertura → vigas da área marcada como cobertura)</label>" +
      (vt.ativo ? '<div class="ml-lin"><label class="ml-campo">V0 (m/s)<input data-ml-campo="vento.v0" value="' + esc(fin(vt.v0)) + '" inputmode="decimal" placeholder="mapa"></label><label class="ml-campo">ou latitude<input data-ml-campo="vento.lat" value="' + esc(fin(vt.lat)) + '"></label><label class="ml-campo">longitude<input data-ml-campo="vento.lon" value="' + esc(fin(vt.lon)) + '"></label>' +
        '<label class="ml-campo">Rugosidade<select data-ml-campo="vento.categoria">' + ["I", "II", "III", "IV", "V"].map(function (c) { return '<option value="' + c + '"' + (vt.categoria === c ? " selected" : "") + ">Categoria " + c + "</option>"; }).join("") + "</select></label>" +
        '<label class="ml-campo">Grupo S3<select data-ml-campo="vento.grupoS3">' + [1, 2, 3, 4, 5].map(function (g) { return '<option value="' + g + '"' + (Number(vt.grupoS3) === g ? " selected" : "") + ">Grupo " + g + "</option>"; }).join("") + "</select></label></div>" +
        '<div class="ml-lin">Faces fechadas: ' + ["frente", "fundo", "esquerda", "direita"].map(function (f) { return '<label style="display:inline-flex;gap:4px;align-items:center"><input type="checkbox" data-ml-campo="vento.face" data-ml-f="' + f + '"' + (vt.faces[f] ? " checked" : "") + "> " + f + " (" + { frente: "z mín.", fundo: "z máx.", esquerda: "x mín.", direita: "x máx." }[f] + ")</label>"; }).join(" ") + "</div>" : '<p class="ml-nota">Mezanino ou estrutura dentro de outra edificação: sem vento (o memorial diz isso).</p>') + "</div>";
    return h;
  }
  /* ---------------------------------------------------------- passo 3 */
  function passoCalcular() {
    var e = estado(), L = U.lido || lerModelo(), G = U.G, gr = G ? Object.keys(G.grupos) : [];
    return '<h3>Calcular</h3><p class="ml-d">Combinações da NBR 8681, análise de 2ª ordem, verificação de todas as barras (NBR 8800 / NBR 14762), flechas (NBR 8800, Anexo C), reações e o memorial.</p>' +
      '<div class="ml-card"><label class="ml-lin" style="gap:6px"><input type="checkbox" data-ml-campo="otimizar"' + (e.otimizar ? " checked" : "") + "> <b>Achar o perfil mais leve</b> de cada grupo de peças iguais (mesmo papel e mesmo perfil) — o cálculo inteiro é refeito a cada troca</label>" +
      (gr.length ? '<table class="ml-t"><thead><tr><th>Grupo</th><th>Perfil</th><th>Peças</th></tr></thead><tbody>' + gr.map(function (k) { var g = G.grupos[k]; return "<tr><td>" + esc({ pilar: "Pilares", viga: "Vigas", terca: "Terças", diagonal: "Diagonais" }[g.papel] || g.papel) + "</td><td>" + esc(g.perfil) + '</td><td class="n">' + g.membros.length + "</td></tr>"; }).join("") + "</tbody></table>" : "") + "</div>" +
      '<div class="ml-card"><h4>Resumo</h4><ul class="ml-l"><li>' + esc(resumoPasso(1)) + "</li><li>" + esc(resumoPasso(2)) + "</li><li>Ligações sem desenho: viga × pilar " + esc(e.ligacoes.vigaPilar) + ", viga × viga " + esc(e.ligacoes.vigaViga) + "</li></ul>" + (!e.areas.length && !e.pontuais.length ? '<p class="ml-aviso">Sem área nem carga pontual: só o peso próprio será calculado.</p>' : "") + "</div>";
  }
  /* ---------------------------------------------------------- resultado */
  function cor(r) { return r > 1 ? "var(--ml-erro)" : r > 0.9 ? "var(--ml-aviso)" : r > 0.7 ? "#d4a017" : "var(--ml-ok)"; }
  function barra(r) { return '<div class="ml-barra"><i style="width:' + Math.min(100, Math.round(r * 100)) + "%;background:" + cor(r) + '"></i></div>'; }
  function resultadoHtml(r) {
    if (!r) return '<p class="ml-nota">Ainda não há cálculo.</p>';
    var h = "";
    if (!r.ok) {
      h += '<div class="ml-prob" data-ml="problemas"><h3 style="margin:0 0 6px">O cálculo não seguiu</h3>' + arr(r.problemas).map(function (p) {
        return '<p data-ml-prob="' + esc(p.tipo) + '"><b>' + esc(p.texto) + "</b></p>" + (arr(p.pecas).length ? '<button class="ml-bt mini" data-ml-acao="selecionar" data-ml-v="' + esc(p.pecas.join(",")) + '">Selecionar no modelo</button> ' : "") +
          arr(p.solucoes).map(function (s) { return /^(engastar-bases|ligacoes-rigidas)$/.test(s.id) ? '<button class="ml-bt mini pri" data-ml-acao="solucao" data-ml-v="' + s.id + '">' + esc(s.texto) + "</button> " : '<span class="ml-nota">· ' + esc(s.texto) + "</span> "; }).join("");
      }).join("<hr style='border:0;border-top:1px solid var(--ml-linha)'>") + (!arr(r.problemas).length ? "<p>" + esc(r.motivo || "") + "</p>" : "") + "</div>";
      return h;
    }
    var lmin = arr(r.flambagem).reduce(function (a, f) { return f.lambda > 0 && f.lambda < a ? f.lambda : a; }, Infinity);
    h += '<div class="ml-kpis"><div class="ml-kpi" data-ml-kpi="situacao"><small>Situação</small><b style="color:' + (r.aprovado ? "var(--ml-ok)" : "var(--ml-erro)") + '">' + (r.aprovado ? "Aprovado" : "Reprovado") + '</b><span class="ml-nota">' + (r.aprovado ? "todas as verificações atendem" : r.falhas + " verificação(ões) não atende(m)") + "</span></div>" +
      '<div class="ml-kpi" data-ml-kpi="peso"><small>Aço dos perfis</small><b>' + fmt(r.peso, 0) + ' kg</b><span class="ml-nota">' + (r.taxa ? fmt(r.taxa, 1) + " kg/m² da área carregada" : "") + "</span></div>" +
      '<div class="ml-kpi"><small>Flambagem global</small><b>' + (isFinite(lmin) ? "λcr " + fmt(lmin, 2) : "—") + '</b><span class="ml-nota">deslocabilidade ' + esc(r.deslocabilidade.classe) + " (Δ2/Δ1 " + fmt(r.deslocabilidade.razao, 2) + ")</span></div>" +
      '<div class="ml-kpi"><small>Modelo</small><b>' + r.modelo.membros.length + ' barras</b><span class="ml-nota">' + r.modelo.modelo.nos.length + " nós · " + r.combinacoes.length + " combinações · " + fmt(r.tempoMs / 1000, 1) + " s</span></div></div>";
    if (r.estabilidadeGlobal && !r.estabilidadeGlobal.ok) h += '<div class="ml-prob" data-ml="estabilidade"><p><b>' + esc(r.estabilidadeGlobal.texto) + '</b></p></div>';
    if (r.trocas) h += '<div class="ml-card" data-ml="trocas" style="border-color:var(--ml-aco)"><b>' + r.trocas + " peça(s) com perfil novo</b> (o mais leve que passa): " + esc(Object.keys(r.pecas).filter(function (k) { return r.pecas[k].mudou; }).map(function (k) { return r.pecas[k].membro + " " + r.pecas[k].de + " → " + r.pecas[k].para; }).slice(0, 12).join("; ")) + (r.aplicado ? ' <span class="ml-chip ok">aplicado no modelo</span>' : ' — <button class="ml-bt mini pri" data-ml-acao="aplicar">Aplicar os perfis no modelo</button>') + "</div>";
    h += '<div class="ml-card"><h4>Barras (estado-limite último e deslocamentos)</h4><table class="ml-t" data-ml="barras"><thead><tr><th>Barra</th><th>Peça</th><th>Perfil</th><th>Razão</th><th></th><th>Governa</th><th>Flecha / desloc.</th></tr></thead><tbody>' +
      r.modelo.membros.map(function (m) {
        var v = r.membros[m.id] || {}, sv = r.servico.filter(function (s) { return s.membro === m.id; }).sort(function (a, b) { return b.razao - a.razao; })[0];
        return '<tr data-ml-membro="' + esc(m.id) + '"><td><b>' + esc(m.id) + "</b></td><td>" + esc(m.nome) + "</td><td>" + esc(m.secao.nome) + '</td><td class="n" style="color:' + cor(v.razao) + '">' + fmt(v.razao, 2) + "</td><td>" + barra(v.razao || 0) + "</td><td>" + esc(v.governante || "—") + (v.sugestao ? '<br><span class="ml-aviso">' + esc(v.sugestao) + "</span>" : "") + "</td><td>" + (sv ? '<span style="color:' + cor(sv.razao) + '">' + fmt(sv.valor * 1000, 1) + " / " + fmt(sv.limite * 1000, 1) + " mm</span>" : "—") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
    var reac = Object.keys(r.reacoes);
    if (reac.length) h += '<div class="ml-card"><h4>Cargas na fundação (envoltória ELU)</h4><table class="ml-t"><thead><tr><th>Apoio</th><th>Pilar</th><th>Tipo</th><th>Fy mín./máx. (kN)</th><th>H máx. (kN)</th><th>M máx. (kN·m)</th></tr></thead><tbody>' + reac.map(function (n) {
      var R = r.reacoes[n], e = R.envELU, H = Math.max(Math.abs(e.Fx[0]), Math.abs(e.Fx[1]), Math.abs(e.Fz[0]), Math.abs(e.Fz[1])), Mm = Math.max(Math.abs(e.Mx[0]), Math.abs(e.Mx[1]), Math.abs(e.Mz[0]), Math.abs(e.Mz[1]));
      return "<tr><td>" + esc(n) + "</td><td>" + esc(R.membro || "") + "</td><td>" + esc(R.tipo || "") + '</td><td class="n">' + fmt(e.Fy[0], 1) + " / " + fmt(e.Fy[1], 1) + '</td><td class="n">' + fmt(H, 1) + '</td><td class="n">' + fmt(Mm, 1) + "</td></tr>";
    }).join("") + "</tbody></table></div>";
    h += '<div class="ml-card"><h4>Decisões do sistema</h4><table class="ml-t"><tbody>' + r.decisoes.map(function (d) { return "<tr><td><b>" + esc(d.tema) + "</b></td><td>" + esc(d.decisao) + '<br><span class="ml-nota">' + esc(d.motivo) + "</span></td></tr>"; }).join("") + "</tbody></table></div>";
    if (r.avisos.length) h += '<div class="ml-card"><h4>Avisos</h4><ul class="ml-l">' + r.avisos.map(function (a) { return '<li class="ml-aviso">' + esc(a) + "</li>"; }).join("") + "</ul></div>";
    h += '<div class="ml-card"><h4>Itens não abrangidos (vão para o memorial)</h4><ul class="ml-l">' + arr(r.naoAbrangidos).map(function (a) { return '<li class="ml-nota">' + esc(a) + "</li>"; }).join("") + "</ul></div>";
    if (r.otimizacao && r.otimizacao.log.length) h += '<details class="ml-card"><summary><b>Otimização</b> — ' + r.otimizacao.iteracoes + " rodadas</summary><ul class=\"ml-l\">" + r.otimizacao.log.map(function (x) { return '<li class="ml-nota">' + esc(x) + "</li>"; }).join("") + "</ul></details>";
    return h;
  }
  function rodapeResultado() {
    var r = U.r, ok = r && r.ok;
    return '<footer class="ml-rod"><span class="ml-msg">' + (ok ? "Memorial, vista 3D e CYPE saem deste resultado." : "Resolva o problema e calcule de novo.") + '</span><button class="ml-bt" data-ml-acao="passo" data-ml-v="1">Dados</button>' +
      (ok ? '<button class="ml-bt" data-ml-acao="ver3d">Ver em 3D</button><button class="ml-bt" data-ml-acao="memorial">Memorial</button><button class="ml-bt" data-ml-acao="cype">Para o CYPE 3D</button>' : "") +
      '<button class="ml-bt pri" data-ml-acao="calcular">Calcular de novo</button></footer>';
  }

  /* ============================================================ AÇÕES */
  function campo(el) {
    var e = estado(), c = el.getAttribute("data-ml-campo"), k = +el.getAttribute("data-ml-k"), v = el.type === "checkbox" ? el.checked : (global.UnidadesUI ? UnidadesUI.texto(el) : el.value), rer = false;
    if (c === "soSelecao") { e.soSelecao = v; rer = true; }
    else if (c === "base") { var p = el.getAttribute("data-ml-peca"); if (v) e.apoios.bases[p] = v; else delete e.apoios.bases[p]; }
    else if (/^area\./.test(c)) { var a = e.areas[k]; if (!a) return; var f = c.slice(5); a[f] = v; if (f === "uso" || f === "cobertura") rer = true; if (f === "qInformado" || f === "alturaEstoque" || f === "inclinacaoPct") rer = true; }
    else if (c === "pt.s") U.ptS = num(v, null);
    else if (/^pt\.f[xyz]$/.test(c)) { U.ptF = U.ptF || [0, 0, 0]; U.ptF["xyz".indexOf(c.slice(4))] = num(v, 0); }
    else if (c === "pt.caso") U.ptCaso = v;
    else if (c === "vento.ativo") { e.vento.ativo = v; rer = true; }
    else if (c === "vento.face") e.vento.faces[el.getAttribute("data-ml-f")] = v;
    else if (/^vento\./.test(c)) e.vento[c.slice(6)] = v;
    else if (c === "otimizar") e.otimizar = v;
    salvar();
    if (rer) render(); else atualizarResumos();
  }
  function atualizarResumos() { PASSOS.forEach(function (p) { var el = doc.querySelector('[data-ml-resumo="' + p.n + '"]'); if (el) el.textContent = resumoPasso(p.n); }); }
  function acao(a, v) {
    var e = estado();
    if (a === "fechar") return fechar();
    if (a === "galpao") { fechar(); if (global.MetalCalcUI) MetalCalcUI.abrir(); return; }
    if (a === "passo") { U.modo = "passos"; U.passo = Math.max(1, Math.min(3, +v)); render(); return; }
    if (a === "resultado") { U.modo = U.r ? "resultado" : "passos"; render(); return; }
    if (a === "basePadrao") { e.apoios.basePadrao = v; salvar(); render(); return; }
    if (a === "vigaPilar" || a === "vigaViga") { e.ligacoes[a] = v; salvar(); render(); return; }
    if (a === "selecionar") { selecionarNoModelo(String(v || "").split(",").filter(Boolean)); return; }
    if (a === "area-niveis") {
      if (!U.G) lerModelo(); if (!U.G) { toast("Nenhuma estrutura lida para achar os níveis.", "aviso"); return; }
      var ns = ML().areasPorNivel(U.G); if (!ns.length) { toast("Nenhuma viga horizontal para formar um piso.", "aviso"); return; }
      ns.forEach(function (n) { if (!e.areas.some(function (x) { return x.id === n.id; })) e.areas.push({ id: n.id, nome: n.nome, cota: n.cota, poligono: n.poligono, vigas: n.vigas, g: "", gCategoria: "G-geral", uso: "", direcao: "auto" }); });
      salvar(); render(); toast(ns.length + " piso(s) — escolha o revestimento e o uso de cada um.", "ok", 4000); return;
    }
    if (a === "area-sel") {
      if (!U.G) lerModelo(); var sel = selecao(); var ar = U.G ? ML().areaDasVigas(U.G, sel, "Área " + (e.areas.length + 1)) : null;
      if (!ar) { toast("Selecione no modelo as vigas (horizontais) da área.", "aviso", 5000); return; }
      ar.g = ""; ar.gCategoria = "G-geral"; ar.uso = ""; ar.direcao = "auto"; e.areas.push(ar); salvar(); render(); return;
    }
    if (a === "area-tirar") { e.areas.splice(+v, 1); salvar(); render(); return; }
    if (a === "pt-add") {
      var s0 = selecao(); if (s0.length !== 1) { toast("Selecione UMA peça no modelo para receber a carga.", "aviso", 5000); return; }
      var F = (U.ptF || [0, 0, 0]).slice(); if (!F.some(function (x) { return x; })) { toast("Informe a força (Fy negativa = para baixo).", "aviso"); return; }
      e.pontuais.push({ nome: "Carga " + (e.pontuais.length + 1), peca: s0[0], s: U.ptS, F: F, caso: U.ptCaso === "Q" ? "Q" : "G" }); salvar(); render(); return;
    }
    if (a === "pt-tirar") { e.pontuais.splice(+v, 1); salvar(); render(); return; }
    if (a === "calcular") return calcular();
    if (a === "solucao") { if (v === "engastar-bases") e.apoios.basePadrao = "engastada"; if (v === "ligacoes-rigidas") e.ligacoes.vigaPilar = "rigida"; salvar(); return calcular(); }
    if (a === "aplicar") return aplicar();
    if (a === "ver3d") return verEm3D();
    if (a === "memorial") return memorial();
    if (a === "cype") return cype();
  }
  function selecionarNoModelo(ids) { try { if (global.BIM && BIM.selecionar) BIM.selecionar(ids.map(function (id) { return "edit:" + id; }), "trocar"); toast(ids.length + " peça(s) selecionada(s) no modelo.", "ok", 3000); } catch (e) { toast("Não deu para selecionar: " + e.message, "aviso"); } }

  function calcular() {
    var D = DL(); if (!D) { toast("O cálculo da estrutura desenhada não carregou (js/acodimlivre.js).", "erro", 8000); return false; }
    var ent = entrada();
    U.calculando = true; U.modo = "calculando"; render();
    setTimeout(function () {
      var r;
      try { r = D.calcular(ent); } catch (e) { r = { ok: false, motivo: "Erro no cálculo: " + (e && e.message), problemas: [{ tipo: "erro", texto: "Erro no cálculo: " + (e && e.message), solucoes: [] }] }; }
      U.calculando = false; U.r = r; U.modo = "resultado"; render();
      status(r.ok ? "Estrutura desenhada: " + (r.aprovado ? "APROVADA" : "REPROVADA (" + r.falhas + " falha(s))") + " — " + fmt(r.peso, 0) + " kg de aço." : "Estrutura desenhada: " + (r.motivo || "não calculou"));
    }, 40);
    return true;
  }
  function aplicar() {
    var r = U.r, D = DL(), M = MU(); if (!r || !r.ok || !r.trocas || !D || !M) return;
    var lt = D.opsAplicar(r, caixas(), function () { return M.novoId(); });
    if (!lt || !lt.lote) { toast("Nada a aplicar" + (lt && lt.erros.length ? ": " + lt.erros.join("; ") : "."), "aviso", 7000); return; }
    if (!M.enviar(lt.lote)) { toast("O editor recusou a troca de perfis.", "erro"); return; }
    r.aplicado = true; render();
    toast(lt.n + " peça(s) trocada(s) no lugar — Ctrl+Z desfaz tudo de uma vez." + (lt.erros.length ? " Não trocadas: " + lt.erros.join("; ") : ""), "ok", 8000);
  }
  var vistaCtl = null;
  function soltarVista() { if (vistaCtl && vistaCtl.destruir) { try { vistaCtl.destruir(); } catch (e) {} } vistaCtl = null; }
  function verEm3D() {
    var r = U.r, V3 = global.MetalCalcVista; if (!r || !r.ok || !V3 || !V3.abrir) { toast("A vista 3D dos resultados não carregou.", "aviso"); return; }
    U.modo = "vista"; render();
    try { vistaCtl = V3.abrir(doc.querySelector("[data-ml='vista3d']"), r, { modo: "aproveitamento", tema: "auto" }); } catch (e) { toast("Vista 3D: " + e.message, "erro", 8000); U.modo = "resultado"; render(); }
  }
  function fotos(r) {
    var V3 = global.MetalCalcVista; if (!V3 || !V3.abrir || !doc) return Promise.resolve({});
    return new Promise(function (ok) {
      var box = doc.createElement("div"), c = null, img = {}; box.style.cssText = "position:fixed;left:-12000px;top:0;width:1400px;height:900px;pointer-events:none"; doc.body.appendChild(box);
      function fim() { try { if (c && c.destruir) c.destruir(); } catch (e) {} box.remove(); ok(img); }
      try { c = V3.abrir(box, r, { modo: "aproveitamento", tema: "claro", animar: false, barra: false }); } catch (e) { fim(); return; }
      setTimeout(function () {
        try { img.perspectiva = c.foto(1400, 900); } catch (e) {}
        try { c.modo("deformada"); img.deformada = c.foto(1400, 900); } catch (e) {}
        try { c.modo("flambagem"); if (c.animar) c.animar(false); img.flambagem = c.foto(1400, 900); } catch (e) {}
        Object.keys(img).forEach(function (k) { if (!/^data:image\/png/.test(String(img[k] || ""))) delete img[k]; });
        fim();
      }, 450);
    });
  }
  function nomeArq() { var o = obra(), n = String((o && o.nome) || "obra"); try { n = n.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {} return n.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "obra"; }
  function baixar(nome, dados, mime) { var M = MU(); if (M && M.baixar) return M.baixar(nome, dados, mime); return false; }
  function memorial() {
    var r = U.r, Mm = global.AcoMemorialLivre; if (!r || !r.ok || !Mm) { toast("O memorial sai de um cálculo que fechou.", "aviso"); return; }
    var w = null; try { w = global.open("", "_blank"); } catch (e) { w = null; }
    var emp = {}, logo = null; try { if (global.Empresa && Empresa.dados) emp = Empresa.dados() || {}; if (global.Empresa && Empresa.logo) logo = Empresa.logo(); } catch (e) {}
    var o = obra() || {};
    status("Montando o memorial (fotos do 3D, verificações)…");
    fotos(r).then(function (img) {
      var x = Mm.gerar(r, { obra: { nome: o.nome, endereco: o.endereco, cidade: o.cidade, cliente: o.cliente }, empresa: { nome: emp.nome || emp.razaoSocial, cnpj: emp.cnpj, logoDataUrl: logo }, responsavel: { nome: emp.responsavel, titulo: emp.titulo, crea: emp.crea }, imagens: img, versao: global.CONFIG && CONFIG.versao });
      if (x && x.ok && global.UnidadesMemorial) x.html = UnidadesMemorial.preparar(x.html);   /* aba SI | Técnica (kgf / tf) — js/unidadesmemorial.js */
      U.ultimoMemorial = x && x.ok ? { titulo: x.titulo, secoes: x.secoes.length, bytes: x.html.length, avisos: x.avisos.length } : null;
      if (!x || !x.ok) { if (w) try { w.close(); } catch (e) {} toast("Memorial: " + ((x && x.motivo) || "falhou"), "erro"); return; }
      if (w && w.document) { w.document.open(); w.document.write(x.html); w.document.close(); toast("Memorial aberto em outra aba: imprima ou salve em PDF (Ctrl+P).", "ok", 7000); }
      else { baixar(nomeArq() + "-memorial-estrutura-metalica.html", x.html, "text/html"); toast("Memorial baixado (.html).", "ok", 6000); }
    });
  }
  function cype() {
    var r = U.r, CY = global.AcoCype; if (!r || !r.ok || !CY) { toast("A exportação para o CYPE sai de um cálculo que fechou.", "aviso"); return; }
    var b = (nomeArq() + "-estrutura-cype3d").replace(/[^A-Za-z0-9_-]+/g, "_"), lista;
    try { lista = CY.arquivos(r, { base: b, arquivoIfc: b + ".ifc", obra: (obra() || {}).nome || "" }); } catch (e) { toast("CYPE: " + e.message, "erro", 9000); return; }
    U.ultimoCype = lista.map(function (x) { return x.nome; });
    if (global.BimBcf && BimBcf.zipEscrever) { var arqs = {}; lista.forEach(function (x) { arqs[x.nome] = x.conteudo; }); baixar(b + ".zip", BimBcf.zipEscrever(arqs), "application/zip"); }
    else lista.forEach(function (x) { baixar(x.nome, x.conteudo, x.tipo); });
    toast("Pacote para o CYPE 3D baixado: IFC analítico, texto da geometria e o roteiro com seções, cargas e combinações.", "ok", 8000);
  }

  /* ============================================================ API */
  var MetalCalcLivreUI = {
    abrir: function (passo) { estado(); garantir(); U.modo = "passos"; if (passo) U.passo = Math.max(1, Math.min(3, +passo)); lerModelo(); render(); return true; },
    calcular: function () { estado(); garantir(); return calcular(); },
    resultado: function () { return U.r; },
    estado: function () { return estado(); },
    fechar: fechar,
    tela: function () { return raiz() ? U.modo : null; },
    ultimas: function () { return { memorial: U.ultimoMemorial || null, cype: U.ultimoCype || null }; },
    entrada: entrada
  };
  global.MetalCalcLivreUI = MetalCalcLivreUI;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalCalcLivreUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
