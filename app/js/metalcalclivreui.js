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
  /* FRENTE S5 (14/10/2026): o envoltório (faces + fechamento → vento), as pranchas e o DXF da estrutura desenhada */
  function EV() { return global.AcoEnvoltorio; }
  function PL() { return global.AcoPranchasLivre; }
  /* FRENTE S5: o LOCAL da obra sem formulário — as coordenadas do cadastro da obra ou, sem elas, as que o assistente do
     galpão já achou para esta obra; o endereço/link/coordenadas digitados no envoltório mandam */
  function localObra() {
    var o = obra();
    if (o && o.lat != null && o.lon != null && isFinite(+o.lat) && isFinite(+o.lon)) return { lat: +o.lat, lon: +o.lon, fonte: "cadastro da obra", endereco: String(o.local || o.endereco || o.cidade || "") };
    try { var g = global.localStorage && JSON.parse(localStorage.getItem("orcapro:metal:calc:" + obraId()) || "null"), l = g && g.local; if (l && isFinite(+l.lat) && isFinite(+l.lon) && l.lat !== null && l.lon !== null) return { lat: +l.lat, lon: +l.lon, fonte: "local do assistente do galpão desta obra", endereco: String(l.endereco || "") }; } catch (e) {}
    return null;
  }
  function eixosModelo() { try { var st = global.BIM && BIM.editarEstado ? BIM.editarEstado().estado : null; return (st && st.eixos) || []; } catch (e) { return []; } }
  function obraId() { var g = global.Gestao; return String((g && g._bimSel) || "geral"); }
  function obra() { var g = global.Gestao, o = null; try { if (g && g._bimSel && global.Store && global.Auth) o = Store.obter(Auth.empresaId(), "obras", g._bimSel); } catch (e) {} return o; }
  function chave() { return "orcapro:metal:livre:" + obraId(); }

  var PADRAO = { apoios: { basePadrao: "rotulada", bases: {} }, ligacoes: { vigaPilar: "rotulada", vigaViga: "rotulada" }, areas: [], pontuais: [], escadas: [],
                 vento: { ativo: false, v0: "", lat: "", lon: "", local: "", endereco: "", fonte: "", categoria: "II", grupoS3: 2, faces: { frente: true, fundo: true, esquerda: true, direita: true } }, otimizar: false, soSelecao: false, acrescimo: 0.05,
                 envoltorio: { situacao: "livre", porChave: {}, cobertura: { tipo: "sem" } }, acoEstrutura: "" };
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
    U.lido = M.ler(caixas(), { ids: ids && ids.length ? ids : null, acoEstrutura: e.acoEstrutura || null });
    U.G = null; U.env = null;
    if (U.lido.pecas.length) { try { U.G = M.montar(U.lido, { basePadrao: e.apoios.basePadrao, bases: e.apoios.bases, vigaPilar: e.ligacoes.vigaPilar, vigaViga: e.ligacoes.vigaViga, ligacoes: e.ligacoes.pontas || {} }); } catch (er) { U.G = null; } }
    if (U.G && EV()) { try { U.env = EV().ler(U.G, { eixos: eixosModelo() }); } catch (er2) { U.env = null; } }
    return U.lido;
  }
  function entrada() {
    var e = estado(), ids = e.soSelecao ? selecao() : null;
    var areas = e.areas.map(function (a) { var o = copia(a); o.g = num(a.g, 0); o.qInformado = num(a.qInformado, null); o.alturaEstoque = num(a.alturaEstoque, null); o.inclinacaoPct = num(a.inclinacaoPct, 3); if (!o.uso) delete o.uso; return o; });
    /* FRENTE S5: o vento sai do ENVOLTÓRIO (situação + fechamento de cada face lida da geometria — js/acoenvoltorio.js); aqui
       vão só o local e o terreno */
    var env = e.envoltorio || PADRAO.envoltorio, livre = env.situacao !== "interna";
    var v = livre ? { v0: num(e.vento.v0, null), lat: num(e.vento.lat, null), lon: num(e.vento.lon, null), endereco: e.vento.endereco || "", categoria: e.vento.categoria, grupoS3: num(e.vento.grupoS3, 2) } : null;
    if (v && v.v0 == null && (v.lat == null || v.lon == null)) { var lo = localObra(); if (lo) { v.lat = lo.lat; v.lon = lo.lon; v.endereco = v.endereco || lo.endereco || ""; v.fonteLocal = lo.fonte; } }
    var escs = arr(e.escadas).map(function (x) { var o = copia(x); o.g = num(x.g, 0); o.largura = num(x.largura, 0); if (!o.uso) delete o.uso; return o; });
    return { caixas: caixas(), ids: ids && ids.length ? ids : null, apoios: copia(e.apoios), ligacoes: copia(e.ligacoes), acoEstrutura: e.acoEstrutura || null,
             envoltorio: { situacao: env.situacao || "livre", porChave: copia(env.porChave || {}), cobertura: copia(env.cobertura || { tipo: "sem" }), eixos: eixosModelo(), todasAbertas: !!env.todasAbertas },
             cargas: { areas: areas, pontuais: copia(e.pontuais), escadas: escs, acrescimoLigacoes: num(e.acrescimo, 0.05), vento: v }, otimizar: !!e.otimizar };
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
    /* REVISÃO S5 C3: com a tela aberta, Ctrl+Z desfaz o último "Apoiar os cantos" e NÃO chega ao editor do modelo — na
       CAPTURA do document (o foco pode estar no body depois do redesenho, fora da tela; o desfazer do editor está no
       document, na fase de borbulha) */
    if (!U.ctrlZ && doc.addEventListener) { U.ctrlZ = true; doc.addEventListener("keydown", function (ev) {
      var t = ev.target || {}; if (!raiz() || !(ev.ctrlKey || ev.metaKey) || ev.shiftKey || ev.altKey || !(ev.key === "z" || ev.key === "Z") || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || "")) return;
      if ((U.pilhaApoios || []).length) { ev.preventDefault(); ev.stopPropagation(); desfazerApoios(); }
    }, true); }
    v.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") { ev.stopPropagation(); if (U.modo === "folha") { U.modo = "pranchas"; render(); } else if (U.modo === "vista" || U.modo === "pranchas") { U.modo = "resultado"; render(); } else fechar(); } });
    return v;
  }
  function fechar() { soltarVista(); salvar(); var v = raiz(); if (v) v.remove(); }

  /* ============================================================ RENDER */
  var PASSOS = [{ n: 1, t: "Estrutura, envoltório e apoios" }, { n: 2, t: "Cargas" }, { n: 3, t: "Calcular" }];
  function resumoPasso(n) {
    var e = estado(), L = U.lido;
    if (n === 1) return L ? L.pecas.length + " barras · bases " + (e.apoios.basePadrao === "engastada" ? "engastadas" : "rotuladas") : "—";
    if (n === 2) return e.areas.length + " área(s) · " + e.pontuais.length + " pontual(is)" + (arr(e.escadas).length ? " · " + e.escadas.length + " escada(s)" : "") + (e.vento.ativo ? " · vento" : "");
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
        (U.passo < 3 ? '<button class="ml-bt" data-ml-acao="passo" data-ml-v="' + (U.passo + 1) + '">Próximo</button>' : "") + '<button class="ml-bt pri" data-ml-acao="calcular"' + (U.calculando ? " disabled" : "") + ">Calcular</button></footer>";
    } else if (U.modo === "calculando") {
      h += '<div class="ml-corpo cheio"><main class="ml-palco" data-ml-modo="calculando"><div class="ml-card" style="max-width:520px;margin:60px auto;text-align:center"><h3>Calculando a estrutura</h3><p class="ml-nota">Modelo, combinações, 2ª ordem, verificação de cada barra' + (estado().otimizar ? " e a busca do perfil mais leve por grupo" : "") + ".</p></div></main></div><footer class=\"ml-rod\"><span class=\"ml-msg\"></span></footer>";
    } else if (U.modo === "resultado") {
      h += '<div class="ml-corpo cheio"><main class="ml-palco" data-ml-modo="resultado">' + resultadoHtml(U.r) + "</main></div>" + rodapeResultado();
    } else if (U.modo === "pranchas" || U.modo === "folha") {
      h += '<div class="ml-corpo cheio"><main class="ml-palco" data-ml-modo="' + U.modo + '">' + (U.modo === "pranchas" ? pranchasHtml() : folhaHtml()) + "</main></div>" +
        '<footer class="ml-rod"><span class="ml-msg">' + esc(U.pranchas ? U.pranchas.folhas.length + " folhas · carimbo RA · Padrão RA de detalhamento (penas, letra RomanS, cotas em mm)" : "") + "</span>" +
        (U.modo === "folha" ? '<button class="ml-bt" data-ml-acao="pranchas-voltar">Todas as folhas</button><button class="ml-bt" data-ml-acao="folha-nav" data-ml-v="-1">← Anterior</button><button class="ml-bt" data-ml-acao="folha-nav" data-ml-v="1">Próxima →</button>'
          : '<button class="ml-bt" data-ml-acao="resultado">Voltar ao resultado</button><button class="ml-bt" data-ml-acao="pranchas-svg">Baixar SVG (.zip)</button><button class="ml-bt" data-ml-acao="pranchas-dxf">DXF (.zip)</button><button class="ml-bt" data-ml-acao="pranchas-dwg">DWG</button><button class="ml-bt pri" data-ml-acao="pranchas-imprimir">Imprimir / PDF</button>') + "</footer>";
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
    if (L.semAco.length) h += '<p class="ml-aviso">' + L.semAco.length + " peça(s) com aço desconhecido: " + esc(L.semAco.map(function (s) { return s.nome + " (" + s.aco + ")"; }).join("; ")) + "." + (L.semAco.some(function (q) { return q.estrutura; }) ? ' <button class="ml-bt mini pri" data-ml-acao="solucao" data-ml-v="aco-estrutura">Usar ASTM A572 Gr.50 nas peças da aba Estrutura</button>' : "") + "</p>";
    if (L.estrutura && L.estrutura.aco) h += '<p class="ml-nota" data-ml="estrutura-aco">' + L.estrutura.aco + " pilar(es)/viga(s) de aço da aba Estrutura lido(s)" + (e.acoEstrutura ? " (aço " + esc(e.acoEstrutura) + ")" : "") + ".</p>";
    arr(L.avisos).forEach(function (a) { h += '<p class="ml-nota">' + esc(a) + "</p>"; });
    h += "</div>";
    h += envoltorioHtml() + apoiosHtml();
    var pil = G ? G.bases : [];
    h += '<div class="ml-card"><h4>Bases dos pilares</h4><div class="ml-lin">' + seg("basePadrao", e.apoios.basePadrao, [["rotulada", "Todas rotuladas"], ["engastada", "Todas engastadas"]]) + '<span class="ml-nota">Rotulada: a fundação recebe só forças. Engastada: recebe momento (bloco maior, chumbadores fora das mesas).</span></div>' +
      (pil.length ? '<table class="ml-t"><thead><tr><th>Pilar</th><th>Peça</th><th>Cota da base</th><th>Base</th></tr></thead><tbody>' + pil.map(function (b) {
        var val = e.apoios.bases[b.peca] || "";
        return "<tr><td>" + esc(b.mid) + "</td><td>" + esc((U.lido.pecas.filter(function (p) { return p.id === b.peca; })[0] || {}).nome || b.peca) + '</td><td class="n">' + fmt(b.cota, 2) + ' m</td><td><select data-ml-campo="base" data-ml-peca="' + esc(b.peca) + '"><option value=""' + (!val ? " selected" : "") + ">como todas (" + (e.apoios.basePadrao === "engastada" ? "engastada" : "rotulada") + ')</option><option value="rotulada"' + (val === "rotulada" ? " selected" : "") + '>rotulada</option><option value="engastada"' + (val === "engastada" ? " selected" : "") + ">engastada</option></select></td></tr>";
      }).join("") + "</tbody></table>" : '<p class="ml-nota">Nenhuma base encontrada: a ponta de baixo do pilar que não encosta em nenhuma peça vira base.</p>') + "</div>";
    h += '<div class="ml-card"><h4>Ligações que NÃO foram desenhadas</h4><p class="ml-nota" style="margin-top:0">A ligação desenhada (chapa de extremidade → rígida; cantoneira dupla, clip, gusset → rotulada; cobrejunta → contínua) sempre manda.</p>' +
      '<div class="ml-lin"><span style="min-width:120px">Viga × pilar</span>' + seg("vigaPilar", e.ligacoes.vigaPilar, [["rotulada", "Rotulada"], ["rigida", "Rígida (pórtico)"]]) + "</div>" +
      '<div class="ml-lin"><span style="min-width:120px">Viga × viga</span>' + seg("vigaViga", e.ligacoes.vigaViga, [["rotulada", "Rotulada"], ["rigida", "Rígida"]]) + "</div>" + pontasHtml(G, e) + "</div>";
    return h;
  }
  /* SIMULAÇÃO S2 (14/10/2026): a ligação de CADA PONTA de viga (sem ligação desenhada) — o pórtico espacial tem joelhos
     rígidos nos pórticos e as vigas de ligação rotuladas; só o padrão geral não dava para fazer isso pela tela */
  function pontasHtml(G, e) {
    if (!G) return "";
    var pt = e.ligacoes.pontas || {}, linhas = [];
    G.membros.forEach(function (m) {
      if (m.papelLivre !== "viga") return;
      var cel = ["ini", "fim"].map(function (k) {
        var c = (m.pontas || {})[k] || {}; if (c.tipo === "livre" || c.tipo === "apoio" || c.lig) return "<td>" + esc(c.tipo === "livre" ? "livre" : c.tipo === "apoio" ? "apoio" : "desenhada (" + (c.tipo === "continua" ? "contínua" : c.tipo) + ")") + "</td>";
        var ch = m.peca + ":" + k, v = pt[ch] || "";
        return '<td><select data-ml-campo="ponta" data-ml-chave="' + esc(ch) + '"><option value=""' + (!v ? " selected" : "") + ">padrão</option><option value=\"rigida\"" + (v === "rigida" ? " selected" : "") + ">rígida</option><option value=\"rotulada\"" + (v === "rotulada" ? " selected" : "") + ">rotulada</option></select></td>";
      }).join("");
      linhas.push('<tr data-ml-viga="' + esc(m.peca) + '"><td><b>' + esc(m.id) + "</b></td><td>" + esc(m.nome) + '</td><td class="n">' + fmt(m.L, 2) + " m</td>" + cel + "</tr>");
    });
    if (!linhas.length) return "";
    return '<details class="ml-card" data-ml="pontas" style="margin:10px 0 0"' + (Object.keys(pt).length ? " open" : "") + '><summary><b>Ponta a ponta</b> — a ligação de cada viga (quando uma é rígida e outra rotulada: pórtico com vigas de ligação)</summary>' +
      '<table class="ml-t"><thead><tr><th>Viga</th><th>Peça</th><th>L</th><th>Início</th><th>Fim</th></tr></thead><tbody>' + linhas.join("") + "</tbody></table></details>";
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
    /* SIMULAÇÃO S3 (14/10/2026): ESCADAS — as longarinas aos pares; o peso dos degraus do modelo e o uso da NBR 6120
       (Tabela 10, "Escadas e passarelas"); o pé apoia no piso */
    var M2 = ML(), usosEsc = M2.USOS.filter(function (u) { return /Escadas e passarelas/.test(u.grupo); });
    h += '<div class="ml-card" data-ml="escadas"><h4>Escadas (NBR 6120)</h4><div class="ml-lin"><button class="ml-bt" data-ml-acao="esc-achar">Achar as escadas</button><span class="ml-nota">Longarinas aos pares: cada uma leva (degraus + uso) × largura/2 por metro em planta; o pé apoia no piso.</span></div>' +
      (arr(e.escadas).length ? '<table class="ml-t"><thead><tr><th>Escada</th><th>Largura</th><th>Degraus (kN/m²)</th><th>Uso — NBR 6120:2019, Tabela 10</th><th></th></tr></thead><tbody>' + e.escadas.map(function (x, k) {
        return '<tr data-ml-escada="' + k + '"><td>' + esc(x.nome) + '</td><td class="n">' + fmt(num(x.largura, 0), 2) + ' m</td><td><input data-ml-campo="esc.g" data-ml-k="' + k + '" value="' + esc(fin(x.g)) + '" inputmode="decimal" style="width:6em"></td><td><select data-ml-campo="esc.uso" data-ml-k="' + k + '"><option value=""' + (!x.uso ? " selected" : "") + '>sem sobrecarga</option>' + usosEsc.map(function (u) { return '<option value="' + u.id + '"' + (x.uso === u.id ? " selected" : "") + ">" + esc(u.local) + " — " + fmt(u.q, 1) + " kN/m²</option>"; }).join("") + '</select></td><td><button class="ml-bt mini" data-ml-acao="esc-tirar" data-ml-v="' + k + '">Remover</button></td></tr>';
      }).join("") + "</tbody></table>" : '<p class="ml-nota">Nenhuma escada nesta obra ainda.</p>') + "</div>";
    var sitV = (e.envoltorio || {}).situacao === "interna";
    h += '<div class="ml-card" data-ml="vento-recado"><h4>Vento (NBR 6123)</h4><p class="ml-nota" style="margin:0">' + (sitV ? "Estrutura dentro de outra edificação: sem vento (o memorial diz isso)." : "O vento sai do envoltório: as faces que o sistema leu da geometria, o fechamento de cada uma e o local da obra — no passo 1.") + ' <button class="ml-bt mini" data-ml-acao="passo" data-ml-v="1">Envoltório e vento</button></p></div>';
    return h;
  }
  /* ---------------------------------------------------------- FRENTE S5: o que o sistema entendeu + envoltório e vento */
  function plantaSvg(env) {
    var c = env.caixa; if (!c) return "";
    var W = 300, Hh = 180, m = 26, dx = Math.max(0.5, c.x1 - c.x0), dz = Math.max(0.5, c.z1 - c.z0), k = Math.min((W - 2 * m) / dx, (Hh - 2 * m) / dz);
    function X(x) { return m + (x - c.x0) * k + ((W - 2 * m) - dx * k) / 2; } function Z(z) { return m + (z - c.z0) * k + ((Hh - 2 * m) - dz * k) / 2; }
    var h = '<svg viewBox="0 0 ' + W + " " + Hh + '" width="' + W + '" height="' + Hh + '" role="img" aria-label="Planta: contorno e faces" data-ml="planta-faces" style="background:var(--ml-sup2);border-radius:10px;flex:none">';
    arr(env.eixos).forEach(function (e) { h += '<line x1="' + X(e.x0).toFixed(1) + '" y1="' + Z(e.z0).toFixed(1) + '" x2="' + X(e.x1).toFixed(1) + '" y2="' + Z(e.z1).toFixed(1) + '" stroke="#8aa0b6" stroke-width="0.6" stroke-dasharray="6 2 1 2"/>'; var bx = e.dir === "x" ? X(e.c) : Math.max(9, X(e.x0) - 8), bz = e.dir === "x" ? Math.max(9, Z(e.z0) - 8) : Z(e.c); h += '<circle cx="' + bx.toFixed(1) + '" cy="' + bz.toFixed(1) + '" r="7" fill="var(--ml-sup)" stroke="#8aa0b6"/><text x="' + bx.toFixed(1) + '" y="' + (bz + 3.5).toFixed(1) + '" font-size="9" text-anchor="middle" fill="currentColor">' + esc(e.nome) + "</text>"; });
    if (arr(env.contorno).length >= 3) h += '<polygon points="' + env.contorno.map(function (q) { return X(q[0]).toFixed(1) + "," + Z(q[1]).toFixed(1); }).join(" ") + '" fill="rgba(13,110,189,.08)" stroke="none"/>';
    arr(env.faces).forEach(function (f, i) { var fa = (U.fechV || {})[f.id], cor = fa && fa !== "aberta" ? "#0d6ebd" : "#e9a23b"; h += '<line x1="' + X(f.a[0]).toFixed(1) + '" y1="' + Z(f.a[1]).toFixed(1) + '" x2="' + X(f.b[0]).toFixed(1) + '" y2="' + Z(f.b[1]).toFixed(1) + '" stroke="' + cor + '" stroke-width="' + (fa && fa !== "aberta" ? 3.2 : 1.6) + '"' + (fa && fa !== "aberta" ? "" : ' stroke-dasharray="5 3"') + "/>";
      var mx = (X(f.a[0]) + X(f.b[0])) / 2 + f.normal[0] * 11, mz = (Z(f.a[1]) + Z(f.b[1])) / 2 + f.normal[1] * 11; h += '<text x="' + mx.toFixed(1) + '" y="' + (mz + 3.5).toFixed(1) + '" font-size="9.5" font-weight="700" text-anchor="middle" fill="' + cor + '">' + (i + 1) + "</text>"; });
    var EVm = EV(); arr(EVm && U.G ? EVm.pilaresPlanta(U.G) : []).forEach(function (p) { h += '<rect x="' + (X(p.x) - 2.5).toFixed(1) + '" y="' + (Z(p.z) - 2.5).toFixed(1) + '" width="5" height="5" fill="currentColor"/>'; });
    return h + '<text x="' + (W - 6) + '" y="12" font-size="9" text-anchor="end" fill="#8aa0b6">N ↑ (z−)</text></svg>';
  }
  function envoltorioHtml() {
    var e = estado(), env = U.env, E = EV(); if (!E || !env || !U.G) return "";
    var f = E.casarFechamentos(env, e.envoltorio), sit = f.situacao, vt = e.vento;
    U.fechV = {}; Object.keys(f.faces).forEach(function (k) { U.fechV[k] = f.faces[k].tipo; });
    var h = '<div class="ml-card" data-ml="entendeu"><h4>O que o sistema entendeu da geometria</h4><div class="ml-lin" style="align-items:flex-start;gap:14px">' + plantaSvg(env) +
      '<ul class="ml-l" style="flex:1;min-width:240px">' + env.resumo.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div></div>";
    h += '<div class="ml-card" data-ml="faces"><h4>Envoltório e vento (NBR 6123)</h4><div class="ml-lin">' + seg("situacao", sit, [["livre", "Ao ar livre (vento da NBR 6123)"], ["interna", "Dentro de outra edificação (sem vento)"]]) + "</div>";
    if (sit === "interna") return h + '<p class="ml-nota">Sem vento: o memorial registra que a estrutura fica protegida dentro de outra edificação (decisão do engenheiro).</p></div>';
    if (env.faces.length) h += '<table class="ml-t" data-ml="tabela-faces"><thead><tr><th>#</th><th>Face</th><th>Comprimento</th><th>Altura</th><th>Pilares</th><th>Fechamento</th><th>h (m)</th></tr></thead><tbody>' + env.faces.map(function (fc, i) {
      var d = f.faces[fc.id] || {}, F = E.fechamentoDe(d.tipo), ch = E.chaveFace(fc);
      return '<tr data-ml-face="' + esc(fc.id) + '"><td><b>' + (i + 1) + "</b></td><td>" + esc(fc.nome) + '</td><td class="n">' + fmt(fc.L, 2) + ' m</td><td class="n">' + fmt(fc.altura, 2) + ' m</td><td>' + esc(fc.marcas.join(", ") || "—") + "</td>" +
        '<td><select data-ml-campo="face.tipo" data-ml-face="' + esc(fc.id) + '" data-ml-chave="' + esc(ch) + '"' + (d.semEscolha ? ' style="border-color:var(--ml-erro)"' : "") + ">" + (d.semEscolha ? '<option value="" selected>— escolha —</option>' : "") + E.FECHAMENTOS.map(function (o) { return '<option value="' + o.id + '"' + (!d.semEscolha && o.id === F.id ? " selected" : "") + ">" + esc(o.nome) + "</option>"; }).join("") + "</select></td>" +
        "<td>" + (F.comH ? '<input data-ml-campo="face.h" data-ml-chave="' + esc(ch) + '" value="' + esc(fin(d.h != null ? d.h : Math.min(fc.altura, 1.2))) + '" inputmode="decimal" style="width:5em">' : "—") + "</td></tr>";
    }).join("") + "</tbody></table>";
    var cob = f.cobertura || { tipo: "sem" }, C0 = E.coberturaDe(cob.tipo), tI = C0.grupoTelha ? E.telhaInfo(cob.telha || E.telhaPadrao(C0.grupoTelha)) : null;
    if (env.cobertura) h += '<div class="ml-lin" data-ml="cobertura"><span style="min-width:120px"><b>Cobertura</b> (' + (env.cobertura.tipo === "plana" ? "topo a " + fmt(env.cobertura.cota, 2) + " m" : "vigas a " + fmt(env.cobertura.inclinacaoGraus, 1) + "°") + ')</span><label class="ml-campo">Fechamento<select data-ml-campo="cob.tipo">' + E.COBERTURAS.map(function (o) { return '<option value="' + o.id + '"' + (o.id === C0.id ? " selected" : "") + ">" + esc(o.nome) + "</option>"; }).join("") + "</select></label>" +
      (C0.id !== "sem" ? '<label class="ml-campo">Inclinação (%)<input data-ml-campo="cob.incl" value="' + esc(fin(cob.inclinacaoPct)) + '" placeholder="' + esc(env.cobertura.inclinacaoPct >= 1 ? fmt(env.cobertura.inclinacaoPct, 1) : (tI && tI.inclMin ? fmt(tI.inclMin, 0) + " (mín. da telha)" : "")) + '" inputmode="decimal" style="width:7em"></label><span class="ml-nota">' + esc(tI ? tI.nome + " — " + fmt(tI.peso, 4) + " kN/m² (" + tI.texto + ")" : "") + "</span>" : "") + "</div>";
    if ((e.envoltorio || {}).todasAbertas) h += '<p class="ml-aviso" data-ml="faces-todas-abertas">As faces sem fechamento escolhido estão DECLARADAS abertas (cálculo de plataforma dos Acessos). <button class="ml-bt mini" data-ml-acao="faces-escolher">Escolher face a face</button></p>';
    if (f.semEscolha.length) h += '<p class="ml-aviso" data-ml="faces-sem-escolha">' + f.semEscolha.length + ' face(s) sem fechamento escolhido — nada vira "aberta" sozinho. <button class="ml-bt mini" data-ml-acao="faces-abertas">As faces sem escolha são abertas</button></p>';
    var v = E.vento(env, f, { coberturaArea: arr(e.areas).some(function (a) { return a.cobertura; }) });
    h += v.ok ? '<p class="ml-nota" data-ml="vento-status">' + (v.coberturaIsolada ? "Vento: cobertura isolada (faces abertas) — NBR 6123, Tabelas 17/18." : "Vento: calculado pela NBR 6123 com o fechamento destas faces (Tabela 4 nas paredes, Tabelas 5/6 na cobertura, cpi pelo 6.2 e Anexo D).") + "</p>"
      : '<p class="ml-aviso" data-ml="vento-status"><b>Vento NÃO VERIFICADO:</b> ' + esc(v.naoVerificado) + ' <button class="ml-bt mini" data-ml-acao="situacao" data-ml-v="interna">É dentro de outra edificação</button></p>';
    h += localVentoHtml(vt) + '<div class="ml-lin"><label class="ml-campo">V0 (m/s)<input data-ml-campo="vento.v0" value="' + esc(fin(vt.v0)) + '" inputmode="decimal" placeholder="mapa"></label><label class="ml-campo">ou latitude<input data-ml-campo="vento.lat" value="' + esc(fin(vt.lat)) + '"></label><label class="ml-campo">longitude<input data-ml-campo="vento.lon" value="' + esc(fin(vt.lon)) + '"></label>' +
      '<label class="ml-campo">Rugosidade<select data-ml-campo="vento.categoria">' + ["I", "II", "III", "IV", "V"].map(function (c) { return '<option value="' + c + '"' + (vt.categoria === c ? " selected" : "") + ">Categoria " + c + "</option>"; }).join("") + "</select></label>" +
      '<label class="ml-campo">Grupo S3<select data-ml-campo="vento.grupoS3">' + [1, 2, 3, 4, 5].map(function (g) { return '<option value="' + g + '"' + (Number(vt.grupoS3) === g ? " selected" : "") + ">Grupo " + g + "</option>"; }).join("") + "</select></label></div>";
    return h + "</div>";
  }
  /* SIMULAÇÃO S2 (14/10/2026): o VENTO PELO ENDEREÇO — o endereço da obra (busca do servidor, com internet), o link do
     mapa ou as coordenadas → latitude e longitude → V0 no mapa de isopletas da NBR 6123 (js/acoisopletas.js) */
  function localVentoHtml(vt) {
    var o = obra() || {}, txt = vt.local || [o.endereco, o.cidade].filter(Boolean).join(", "), la = num(vt.lat, null), lo = num(vt.lon, null), Iso = global.AcoIsopletas, v0 = null;
    if ((la == null || lo == null) && num(vt.v0, null) == null) { var lO = localObra(); if (lO) { la = lO.lat; lo = lO.lon; vt = { fonte: lO.fonte, endereco: lO.endereco, local: vt.local }; } }
    if (la != null && lo != null && Iso && Iso.v0) { try { v0 = Iso.v0(la, lo); } catch (e) { v0 = null; } }
    return '<div class="ml-lin" data-ml="local-vento"><label class="ml-campo" style="flex:1;min-width:260px">Endereço da obra, link do mapa ou coordenadas<input data-ml-campo="vento.local" value="' + esc(txt) + '" placeholder="Rua, número, cidade/UF · link do Google Maps · −18,92, −48,28"></label>' +
      '<button class="ml-bt" data-ml-acao="vento-localizar"' + (U.localizando ? " disabled" : "") + ">" + (U.localizando ? "Procurando…" : "Localizar") + "</button></div>" +
      (la != null && lo != null ? '<p class="ml-nota" data-ml="v0-mapa">Obra em ' + fmt(la, 4) + "°; " + fmt(lo, 4) + "°" + (vt.fonte ? " (" + esc(vt.fonte) + ")" : "") + (vt.endereco ? " — " + esc(vt.endereco) : "") + (v0 && v0.v0Adotado ? " · V0 = " + fmt(v0.v0Adotado, 0) + " m/s no mapa de isopletas da NBR 6123" : "") + "</p>" : "") +
      (U.erroLocal ? '<p class="ml-aviso">' + esc(U.erroLocal) + "</p>" : "");
  }
  function localizarVento() {
    var e = estado(), vt = e.vento, inp = doc && doc.querySelector('#ml-veu [data-ml-campo="vento.local"]'), txt = String((inp && inp.value) || vt.local || "").replace(/[−–]/g, "-").trim();
    vt.local = txt; U.erroLocal = null;
    function usar(la, lo, fonte, end) { vt.lat = Math.round(la * 1e6) / 1e6; vt.lon = Math.round(lo * 1e6) / 1e6; vt.fonte = fonte || ""; vt.endereco = end || ""; vt.v0 = ""; salvar(); render(); toast("Obra localizada (" + (fonte || "coordenadas") + "): o V0 sai do mapa de isopletas.", "ok", 5000); }
    var G0 = global.IcarGeo, c = null;
    try { c = G0 && G0.lerCoordenada ? G0.lerCoordenada(txt) : null; } catch (eC) { c = null; }
    if (!c) { var m = /^\s*(-?\d+(?:[.,]\d+)?)\s*[;,\s]\s*(-?\d+(?:[.,]\d+)?)\s*$/.exec(txt); if (m) { var la0 = num(m[1], NaN), lo0 = num(m[2], NaN); if (Math.abs(la0) <= 90 && Math.abs(lo0) <= 180) c = { lat: la0, lon: lo0, fonte: "coordenadas" }; } }
    if (c) return usar(c.lat, c.lon, c.fonte, "");
    if (txt.length < 4) { U.erroLocal = "Escreva o endereço (rua, número, cidade/UF), cole o link do mapa ou as coordenadas."; render(); return; }
    var g = global.Gestao;
    if (!g || !g._icarGeoPost) { U.erroLocal = "A busca de endereço não está disponível aqui: cole o link do mapa ou as coordenadas."; render(); return; }
    U.localizando = true; render();
    g._icarGeoPost("/ia/geo/busca", { q: txt }).then(function (x) {
      U.localizando = false;
      var L = x && x.s === 200 && x.j && x.j.ok ? arr(x.j.resultados) : [];
      if (!L.length) { U.erroLocal = (x && x.s === 200 ? "Não achei esse endereço." : "A busca de endereço não respondeu.") + " Tente com cidade e estado, ou cole o link do mapa ou as coordenadas."; if (raiz()) render(); return; }
      usar(+L[0].lat, +L[0].lon, "endereço (OpenStreetMap)", L[0].nome);
    }, function () { U.localizando = false; U.erroLocal = "Sem conexão com a busca de endereço: cole o link do mapa ou as coordenadas."; if (raiz()) render(); });
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
      h += '<div class="ml-prob" data-ml="problemas"><h3 style="margin:0 0 6px">O cálculo não seguiu</h3>' + arr(r.problemas).map(function (p, kP) {
        return '<p data-ml-prob="' + esc(p.tipo) + '"><b>' + esc(p.texto) + "</b></p>" + (arr(p.pecas).length ? '<button class="ml-bt mini" data-ml-acao="selecionar" data-ml-v="' + esc(p.pecas.join(",")) + '">Selecionar no modelo</button> ' : "") +
          arr(p.solucoes).map(function (s) { var bt = BOTAO_SOL[s.id]; return bt ? '<button class="ml-bt mini pri" data-ml-acao="solucao" data-ml-v="' + s.id + '" data-ml-p="' + kP + '">' + esc(bt === true ? s.texto : bt) + "</button> " : '<span class="ml-nota">· ' + esc(s.texto) + "</span> "; }).join("");
      }).join("<hr style='border:0;border-top:1px solid var(--ml-linha)'>") + (!arr(r.problemas).length ? "<p>" + esc(r.motivo || "") + "</p>" : "") + "</div>";
      return h;
    }
    var lmin = arr(r.flambagem).reduce(function (a, f) { return f.lambda > 0 && f.lambda < a ? f.lambda : a; }, Infinity);
    /* FRENTE S5: "aprovado" só com o vento verificado (ou a estrutura declarada interna) — senão "incompleto" */
    var sit = r.situacao ? r.situacao.id : (r.aprovado ? "aprovado" : "reprovado"), nvs = arr(r.naoVerificados);
    h += '<div class="ml-kpis"><div class="ml-kpi" data-ml-kpi="situacao"><small>Situação</small><b style="color:' + (sit === "aprovado" ? "var(--ml-ok)" : sit === "incompleto" ? "var(--ml-aviso)" : "var(--ml-erro)") + '">' + ({ aprovado: "Aprovado", reprovado: "Reprovado", incompleto: "Incompleto" }[sit] || "Reprovado") + '</b><span class="ml-nota">' + (sit === "aprovado" ? "as verificações das barras atendem — emitir só com as ligações e as placas de base dimensionadas (o memorial e as pranchas dizem o que falta)" : sit === "incompleto" ? "barras atendem; NÃO verificado: " + esc(nvs.map(function (x) { return x.tema; }).join(", ")) : r.falhas + " verificação(ões) não atende(m)") + "</span></div>" +
      '<div class="ml-kpi" data-ml-kpi="peso"><small>Aço dos perfis</small><b>' + fmt(r.peso, 0) + ' kg</b><span class="ml-nota">' + (r.taxa ? fmt(r.taxa, 1) + " kg/m² da área carregada" : "") + "</span></div>" +
      '<div class="ml-kpi"><small>Flambagem global</small><b>' + (isFinite(lmin) ? "λcr " + fmt(lmin, 2) : "—") + '</b><span class="ml-nota">deslocabilidade ' + esc(r.deslocabilidade.classe) + " (Δ2/Δ1 " + fmt(r.deslocabilidade.razao, 2) + ")</span></div>" +
      '<div class="ml-kpi"><small>Modelo</small><b>' + r.modelo.membros.length + ' barras</b><span class="ml-nota">' + r.modelo.modelo.nos.length + " nós · " + r.combinacoes.length + " combinações · " + fmt(r.tempoMs / 1000, 1) + " s</span></div></div>";
    if (r.estabilidadeGlobal && !r.estabilidadeGlobal.ok) h += '<div class="ml-prob" data-ml="estabilidade"><p><b>' + esc(r.estabilidadeGlobal.texto) + '</b></p></div>';
    if (nvs.length) h += '<div class="ml-prob" data-ml="nao-verificado" style="border-color:var(--ml-aviso);background:var(--ml-avbg)"><h4 style="margin:0 0 6px">Não verificado</h4>' + nvs.map(function (x) { return "<p><b>" + esc(x.tema) + ":</b> " + esc(x.motivo) + "</p>"; }).join("") +
      (nvs.some(function (x) { return /Vento/.test(x.tema); }) ? '<button class="ml-bt mini pri" data-ml-acao="solucao" data-ml-v="interna">A estrutura fica dentro de outra edificação (sem vento)</button> ' : "") + '<button class="ml-bt mini" data-ml-acao="passo" data-ml-v="1">Rever o envoltório</button></div>';
    var ajC = ajustesCota(); if (ajC.length) h += '<div class="ml-card" data-ml="ajuste-cota" style="border-color:var(--ml-aviso)"><h4>Ajuste de cota das fundações</h4><ul class="ml-l">' + ajC.map(function (x) { return '<li class="ml-aviso">' + esc(x.texto) + "</li>"; }).join("") + '</ul><button class="ml-bt mini pri" data-ml-acao="solucao" data-ml-v="ajustar-topos">Ajustar o topo das fundações (' + ajC.length + ")</button></div>";
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
    return '<footer class="ml-rod"><span class="ml-msg">' + (ok ? "Memorial, pranchas (DXF/DWG), vista 3D e CYPE saem deste resultado." : "Resolva o problema e calcule de novo.") + '</span><button class="ml-bt" data-ml-acao="passo" data-ml-v="1">Dados</button>' +
      (ok ? '<button class="ml-bt" data-ml-acao="ver3d">Ver em 3D</button><button class="ml-bt" data-ml-acao="memorial">Memorial</button>' + (PL() ? '<button class="ml-bt" data-ml-acao="pranchas">Pranchas</button>' : "") + '<button class="ml-bt" data-ml-acao="cype">Para o CYPE 3D</button>' : "") +
      '<button class="ml-bt pri" data-ml-acao="calcular">Calcular de novo</button></footer>';
  }

  /* ============================================================ AÇÕES */
  function campo(el) {
    var e = estado(), c = el.getAttribute("data-ml-campo"), k = +el.getAttribute("data-ml-k"), v = el.type === "checkbox" ? el.checked : (global.UnidadesUI ? UnidadesUI.texto(el) : el.value), rer = false;
    if (c === "soSelecao") { e.soSelecao = v; rer = true; }
    else if (c === "base") { var p = el.getAttribute("data-ml-peca"); if (v) e.apoios.bases[p] = v; else delete e.apoios.bases[p]; }
    else if (c === "ponta") { var chv = el.getAttribute("data-ml-chave"); e.ligacoes.pontas = e.ligacoes.pontas || {}; if (v) e.ligacoes.pontas[chv] = v; else delete e.ligacoes.pontas[chv]; rer = true; }
    else if (/^area\./.test(c)) { var a = e.areas[k]; if (!a) return; var f = c.slice(5); a[f] = v; if (f === "uso" || f === "cobertura") rer = true; if (f === "qInformado" || f === "alturaEstoque" || f === "inclinacaoPct") rer = true; }
    else if (c === "pt.s") U.ptS = num(v, null);
    else if (/^pt\.f[xyz]$/.test(c)) { U.ptF = U.ptF || [0, 0, 0]; U.ptF["xyz".indexOf(c.slice(4))] = num(v, 0); }
    else if (c === "pt.caso") U.ptCaso = v;
    else if (c === "vento.ativo") { e.vento.ativo = v; rer = true; }
    else if (c === "face.tipo" && !v) { return; }
    else if (c === "face.tipo" || c === "face.h") { var chF = el.getAttribute("data-ml-chave"), env0 = e.envoltorio = e.envoltorio || copia(PADRAO.envoltorio); env0.porChave = env0.porChave || {}; var d0 = env0.porChave[chF] || { tipo: "aberta" }; if (c === "face.tipo") d0.tipo = v; else d0.h = num(v, null); env0.porChave[chF] = d0; rer = true; }
    else if (c === "cob.tipo" || c === "cob.incl") { var env1 = e.envoltorio = e.envoltorio || copia(PADRAO.envoltorio); env1.cobertura = env1.cobertura || { tipo: "sem" }; if (c === "cob.tipo") env1.cobertura.tipo = v; else env1.cobertura.inclinacaoPct = num(v, null); rer = true; }
    else if (c === "vento.face") e.vento.faces[el.getAttribute("data-ml-f")] = v;
    else if (c === "vento.local") e.vento.local = v;
    else if (/^esc\./.test(c)) { var es0 = e.escadas[k]; if (es0) es0[c.slice(4)] = v; }
    else if (/^vento\./.test(c)) e.vento[c.slice(6)] = v;
    else if (c === "otimizar") e.otimizar = v;
    salvar();
    if (rer) render(); else atualizarResumos();
  }
  function atualizarResumos() { PASSOS.forEach(function (p) { var el = doc.querySelector('[data-ml-resumo="' + p.n + '"]'); if (el) el.textContent = resumoPasso(p.n); }); }
  function acao(a, v, el) {
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
      /* SIMULAÇÃO S1 (14/10/2026): guarda também o PONTO no espaço — a ligação que encurta a peça não leva a carga junto */
      var Pt = null; try { var cP = caixas().filter(function (c) { return String(c.id) === String(s0[0]); })[0], li = cP && global.MetalCriar ? MetalCriar.linhaAtual(cP) : null;
        if (li) { var dv = [li.b[0] - li.a[0], li.b[1] - li.a[1], li.b[2] - li.a[2]], Lp = Math.sqrt(dv[0] * dv[0] + dv[1] * dv[1] + dv[2] * dv[2]), sx = U.ptS == null ? Lp / 2 : Math.max(0, Math.min(Lp, U.ptS)); if (Lp > 0) Pt = [0, 1, 2].map(function (k) { return Math.round((li.a[k] + dv[k] * sx / Lp) * 1e6) / 1e6; }); } } catch (eP) { Pt = null; }
      /* REVISÃO C4: guarda também a linha da peça no lançamento (ref) — se a peça for movida, a carga a acompanha */
      var Ref = null; try { var cR = caixas().filter(function (c) { return String(c.id) === String(s0[0]); })[0], lR = cR && global.MetalCriar ? MetalCriar.linhaAtual(cR) : null; if (lR) Ref = { a: lR.a.map(function (v) { return Math.round(v * 1e6) / 1e6; }), b: lR.b.map(function (v) { return Math.round(v * 1e6) / 1e6; }) }; } catch (eR) { Ref = null; }
      e.pontuais.push({ nome: "Carga " + (e.pontuais.length + 1), peca: s0[0], s: U.ptS, P: Pt, ref: Ref, F: F, caso: U.ptCaso === "Q" ? "Q" : "G" }); salvar(); render(); return;
    }
    if (a === "pt-tirar") { e.pontuais.splice(+v, 1); salvar(); render(); return; }
    if (a === "vento-localizar") return localizarVento();
    if (a === "esc-achar") {
      if (!U.G) lerModelo(); var L2 = U.G && ML().escadas ? ML().escadas(caixas(), U.G) : [];
      if (!L2.length) { toast("Nenhuma escada no modelo (longarinas aos pares, paralelas).", "aviso", 5000); return; }
      e.escadas = L2.map(function (x) { var velho = arr(e.escadas).filter(function (y) { return y.pecas && y.pecas.join() === x.pecas.join(); })[0]; return { id: x.id, nome: x.nome, pecas: x.pecas, largura: x.largura, g: velho ? velho.g : x.g, gCategoria: "G-industrializado", uso: velho ? velho.uso : "passarela-sem-publico", kgDegraus: x.kgDegraus, nDegraus: x.nDegraus }; });
      salvar(); render(); toast(L2.length + " escada(s): degraus pelo peso das chapas do modelo; confira o uso.", "ok", 5000); return;
    }
    if (a === "esc-tirar") { e.escadas.splice(+v, 1); salvar(); render(); return; }
    if (a === "calcular") return calcular();
    if (a === "apoio-tirar") { var ex0 = e.apoios.extras || {}; U.pilhaApoios = U.pilhaApoios || []; U.pilhaApoios.push(copia(ex0)); if (v === "*") e.apoios.extras = {}; else delete ex0[v]; salvar(); lerModelo(); render(); return; }
    if (a === "apoio-desfazer") { desfazerApoios(); return; }
    if (a === "faces-abertas") { marcarFacesAbertas(); return; }
    if (a === "faces-escolher") { if (e.envoltorio) delete e.envoltorio.todasAbertas; salvar(); lerModelo(); render(); return; }
    if (a === "situacao") { e.envoltorio = e.envoltorio || copia(PADRAO.envoltorio); e.envoltorio.situacao = v === "interna" ? "interna" : "livre"; salvar(); render(); return; }
    if (a === "solucao") return solucao(v, el);
    if (a === "pranchas") return pranchas();
    if (a === "pranchas-voltar") { U.modo = "pranchas"; render(); return; }
    if (a === "prancha-ver") { U.folha = +v || 0; U.modo = "folha"; render(); return; }
    if (a === "folha-nav") { var nf = U.pranchas ? U.pranchas.folhas.length : 1; U.folha = ((U.folha || 0) + (+v || 0) + nf) % nf; render(); return; }
    if (a === "pranchas-imprimir") return imprimirPranchas();
    if (a === "pranchas-svg") return baixarSvgs();
    if (a === "pranchas-dxf") return baixarDxf();
    if (a === "pranchas-dwg") return explicarDwg();
    if (a === "aplicar") return aplicar();
    if (a === "ver3d") return verEm3D();
    if (a === "memorial") return memorial();
    if (a === "cype") return cype();
  }
  /* ============================================================ FRENTE S5: as SOLUÇÕES com botão (nada de botão que não faz nada) */
  /* REVISÃO S5 A4: as faces sem fechamento escolhido (novas ou de um modelo que mudou) viram "aberta" só por este botão */
  function marcarFacesAbertas() {
    var e = estado(), E = EV(); lerModelo(); if (!E || !U.env) return;
    var env0 = e.envoltorio = e.envoltorio || copia(PADRAO.envoltorio); env0.porChave = env0.porChave || {};
    var f = E.casarFechamentos(U.env, env0), n = 0;
    U.env.faces.forEach(function (fc) { if (f.semEscolha.indexOf(fc.id) >= 0) { env0.porChave[E.chaveFace(fc)] = { tipo: "aberta" }; n++; } });
    salvar(); render(); toast(n ? n + " face(s) sem escolha marcada(s) como ABERTAS." : "Todas as faces já têm fechamento.", "ok", 5000);
  }
  var BOTAO_SOL = { "engastar-bases": true, "ligacoes-rigidas": true, contraventar: "Gerar o contraventamento (X nos planos que se movem)", "contraventar-plano": "Gerar o X no plano do piso",
                    ligar: "Ligar as peças soltas (a ponta vai à peça mais perto)", base: "Apoiar os cantos numa parede/estrutura existente", "aco-estrutura": true, "vento-local": true, interna: true, "faces-abertas": true, "rever-envoltorio": true };
  function solucao(v, el) {
    var e = estado(), kP = el ? +el.getAttribute("data-ml-p") : -1, prob = U.r && arr(U.r.problemas)[kP];
    if (v === "engastar-bases") { e.apoios.basePadrao = "engastada"; salvar(); return calcular(); }
    if (v === "ligacoes-rigidas") { e.ligacoes.vigaPilar = "rigida"; salvar(); return calcular(); }
    if (v === "aco-estrutura") { e.acoEstrutura = "ASTM A572 Gr.50"; salvar(); toast("Peças de aço da aba Estrutura: ASTM A572 Gr.50 (fy 345 MPa) — o padrão de pilar e viga da Metálica. Vai para as decisões do memorial.", "ok", 6000); if (U.modo === "passos") { lerModelo(); render(); return; } return calcular(); }
    if (v === "interna") { e.envoltorio = e.envoltorio || copia(PADRAO.envoltorio); e.envoltorio.situacao = "interna"; salvar(); return calcular(); }
    if (v === "vento-local") { U.modo = "passos"; U.passo = 1; render(); setTimeout(function () { var i = doc.querySelector('#ml-veu [data-ml-campo="vento.local"]'); if (i) { i.scrollIntoView({ block: "center" }); i.focus(); } }, 60); return; }
    if (v === "ajustar-topos") { var L0 = global.MetalLigSugUI && MetalLigSugUI.ajustarTopos ? MetalLigSugUI.ajustarTopos(ajustesCota()) : false; if (L0) { U.ajustesFeitos = true; render(); } return; }
    if (v === "contraventar" || v === "contraventar-plano") return gerarContraventamento(v === "contraventar-plano");
    if (v === "ligar") return ligarSoltas(prob ? arr(prob.pecas) : []);
    if (v === "base") return apoiarCantos(prob ? arr(prob.pecas) : []);
    if (v === "faces-abertas") { marcarFacesAbertas(); return calcular(); }
    if (v === "rever-envoltorio") { U.modo = "passos"; U.passo = 1; render(); setTimeout(function () { var c = doc.querySelector('#ml-veu [data-ml="faces"]'); if (c) c.scrollIntoView({ block: "start" }); }, 60); return; }
  }
  function ajustesCota() {
    if (U.ajustesFeitos) return [];
    var o = [], vistos = {};
    var fu = {}; fundacoesModelo().forEach(function (f) { if (f && f.id != null) fu[String(f.id)] = f; });
    arr(U.ultimasLigacoes).concat(global.MetalLigSugUI && MetalLigSugUI.ajustesCota ? MetalLigSugUI.ajustesCota() : []).forEach(function (x) {
      var a = x && (x.ajusteCota || (x.fundacao != null && x.deslocTopoNovo != null ? x : null)); if (!a || vistos[a.fundacao]) return;
      var f = fu[String(a.fundacao)]; if (f && Math.abs(num(f.deslocTopo, 0) - num(a.deslocTopoNovo, 0)) < 1e-4) return;   /* já ajustada */
      vistos[a.fundacao] = true; o.push(a);
    });
    return o;
  }
  function gerarContraventamento(soPlano) {
    var M = MU(), E = EV(), MC = global.MetalCriar; if (!M || !E || !MC) return;
    lerModelo(); if (!U.G || !U.env) { toast("Não deu para ler a estrutura para gerar o contraventamento.", "aviso"); return; }
    var L0 = E.contraventar(U.G, U.env); if (soPlano) L0 = L0.filter(function (q) { return Math.abs(q.a[1] - q.b[1]) < 1e-6; });
    /* barra redonda 5/8" em X (só tração — a do outro sentido trabalha), a mesma do cenário 2 das simulações; sem ela no
       catálogo, a cantoneira de partida da ferramenta Diagonal */
    var ops = [], erros = [], BR = 'BR 5/8" (D 15,88 mm) Gerdau', perfil = MC.perfilCat && MC.perfilCat(BR) ? BR : ((MC.FERRAMENTAS && MC.FERRAMENTAS.diagonal && MC.FERRAMENTAS.diagonal.perfil) || "L51X51X4.8");
    L0.forEach(function (q) { var c = MC.barra(q.a, q.b, { ferr: "diagonal", cat: perfil }); if (c && !c.erro) ops.push({ op: "criar", id: String(M.novoId()), caixa: c }); else erros.push(c && c.erro); });
    if (!ops.length) { toast("Nenhum plano para contraventar automaticamente" + (U.env.tipo === "plano" ? ": o pórtico é plano — fora do plano dele só engastando as bases" : "") + ".", "aviso", 8000); return; }
    if (!M.enviar({ op: "lote", id: String(M.novoId()), origem: "metal-calc-livre-contravento", ops: ops })) { toast("O editor recusou o contraventamento.", "erro"); return; }
    var planos = []; L0.forEach(function (q) { if (planos.indexOf(q.plano) < 0) planos.push(q.plano); });
    toast(ops.length + " diagonais " + (perfil === BR ? "de barra redonda 5/8\" em X (só tração)" : perfil.replace(/X/g, " × ")) + " em " + planos.join("; ") + " — Ctrl+Z desfaz; o cálculo confere (e o perfil mais leve acha outra se precisar). Calculando…", "ok", 8000);
    setTimeout(calcular, 300);
  }
  function ligarSoltas(pecas) {
    var M = MU(), E = EV(), MC = global.MetalCriar; if (!M || !E || !MC) return;
    lerModelo(); if (!U.G) return;
    var lg = E.ligarSoltas(U.G, pecas), por = {}; caixas().forEach(function (c) { por[String(c.id)] = c; });
    var ops = [], fora = lg.semAlvo.slice();
    lg.linhas.forEach(function (q) {
      var c = por[q.peca]; if (!c || c.tipo !== "metal") { fora.push(q.peca); return; }
      var li = MC.linhaAtual(c), n = MC.barra(q.a, q.b, { ferr: li.ferr || "viga", perfil: c.metal.perfil, giro: li.giro, just: li.just, lado: li.lado, espelhar: li.espelhar, papel: c.metal.papel, ifc: c.ifc, aco: c.metal.aco, nivel: li.nivel });
      if (n && !n.erro) ops.push(MC.opAjustar(q.peca, n)); else fora.push(q.peca);
    });
    if (ops.length && !M.enviar({ op: "lote", id: String(M.novoId()), origem: "metal-calc-livre-ligar", ops: ops })) { toast("O editor recusou a ligação das peças soltas.", "erro"); return; }
    toast((ops.length ? ops.length + " peça(s) ligada(s): a ponta foi até a peça mais perto (" + lg.linhas.map(function (q) { return fmt(q.d * 100, 0) + " cm"; }).join(", ") + ") — Ctrl+Z desfaz." : "") + (fora.length ? " Sem peça a até 1 m: " + fora.join(", ") + " — encoste à mão ou apague." : ""), ops.length ? "ok" : "aviso", 9000);
    if (ops.length) setTimeout(calcular, 300);
  }
  /* REVISÃO S5 C3 (14/10/2026): "Apoiar os cantos" só põe apoio em nó que é VÉRTICE do contorno da estrutura e onde
     nenhuma peça passa (antes a regra "≤ 2 peças no nó" pegava o nó em T no MEIO do vão da viga e aprovava a grelha —
     r3 do revisor: V1 1,376 → 0,036). Os apoios declarados ficam listados no passo 1 (remover um a um), Ctrl+Z desfaz o
     último "apoiar" e a decisão vai para o memorial. */
  function apoiarCantos(pecas) {
    lerModelo(); var G = U.G, e = estado(), env = U.env; if (!G) return;
    var ex = e.apoios.extras = e.apoios.extras || {}, antes = copia(ex), n = 0, E = EV();
    (E && E.cantosApoio ? E.cantosApoio(G, env, pecas) : []).forEach(function (c) { if (ex[c.chave] !== "fixo") { ex[c.chave] = "fixo"; n++; } });
    if (!n) { toast("Nenhum vértice do contorno sem peça passando para apoiar — marque o apoio na ponta certa ou desça um pilar.", "aviso", 9000); return; }
    U.pilhaApoios = U.pilhaApoios || []; U.pilhaApoios.push(antes); salvar();
    toast(n + " canto(s) do contorno apoiado(s) (apoio fixo: parede ou estrutura existente — declarado pelo engenheiro; lista no passo 1, Ctrl+Z desfaz).", "ok", 9000);
    calcular();
  }
  function desfazerApoios() {
    var e = estado(), p = U.pilhaApoios || []; if (!p.length) return false;
    e.apoios.extras = p.pop(); salvar(); toast("Apoios declarados desfeitos (o último \"Apoiar os cantos\").", "ok", 6000); if (U.modo === "resultado") calcular(); else { lerModelo(); render(); } return true;
  }
  function apoiosHtml() {
    var e = estado(), ex = (e.apoios && e.apoios.extras) || {}, ks = Object.keys(ex); if (!ks.length) return "";
    var G = U.G, pos = {}; if (G) G.membros.forEach(function (m) { [["ini", m.nos[0]], ["fim", m.nos[m.nos.length - 1]]].forEach(function (k) { var I = G.noInfo[k[1]]; if (I) pos[m.peca + ":" + k[0]] = { P: I.P, mid: m.id }; }); });
    return '<div class="ml-card" data-ml="apoios-declarados"><h4>Apoios declarados (parede ou estrutura existente)</h4><table class="ml-t"><thead><tr><th>Ponta</th><th>Posição (m)</th><th>Apoio</th><th></th></tr></thead><tbody>' + ks.map(function (k) { var q = pos[k]; return "<tr><td>" + esc(q ? q.mid + (/:ini$/.test(k) ? " (início)" : " (fim)") : k) + '</td><td class="n">' + (q ? fmt(q.P[0], 2) + "; " + fmt(q.P[1], 2) + "; " + fmt(q.P[2], 2) : "—") + "</td><td>" + esc(ex[k]) + '</td><td><button class="ml-bt mini" data-ml-acao="apoio-tirar" data-ml-v="' + esc(k) + '">Remover</button></td></tr>'; }).join("") + "</tbody></table>" +
      '<div class="ml-lin"><button class="ml-bt mini" data-ml-acao="apoio-tirar" data-ml-v="*">Remover todos</button>' + ((U.pilhaApoios || []).length ? '<button class="ml-bt mini" data-ml-acao="apoio-desfazer">Desfazer o último (Ctrl+Z)</button>' : "") + '<span class="ml-nota">Vão para as decisões do memorial: confirme na obra que a parede/estrutura recebe as reações.</span></div></div>';
  }
  /* ============================================================ FRENTE S5: PRANCHAS da estrutura desenhada (js/acopranchaslivre.js) */
  function hojeBR() { var d = new Date(), z = function (n) { return (n < 10 ? "0" : "") + n; }; return z(d.getDate()) + "/" + z(d.getMonth() + 1) + "/" + d.getFullYear(); }
  function opcoesPranchas() {
    var em = {}, logo = null, o = obra() || {}; try { if (global.Empresa && Empresa.dados) em = Empresa.dados() || {}; if (global.Empresa && Empresa.logo) logo = Empresa.logo(); } catch (e) {}
    var vt = estado().vento || {};
    return { empresa: em && em.nome ? em : "", responsavel: em.responsavel || "", registro: em.crea || "", tituloProfissional: em.titulo || "", obra: o.nome || "", proprietario: o.clienteNome || o.cliente || "", contratante: o.clienteNome || o.cliente || "",
             local: vt.endereco || [o.endereco, o.cidade].filter(Boolean).join(", "), codigo: "EST-MET", revisao: "R00", data: hojeBR(), formato: "A1", logo: logo, ligacoes: U.ultimasLigacoesCompletas || null, caixas: caixas(), fundacoes: fundacoesModelo() };
  }
  function fundacoesModelo() { try { var st = global.BIM && BIM.editarEstado ? BIM.editarEstado().estado : null; return (st && st.fundacoes) || []; } catch (e) { return []; } }
  function pranchas() {
    var r = U.r, P = PL(); if (!r || !r.ok || !P) { toast("As pranchas saem de um cálculo que fechou.", "aviso"); return; }
    var ligs = []; try { if (global.MetalLigSugUI && MetalLigSugUI.ligacoesComCalculo) ligs = MetalLigSugUI.ligacoesComCalculo(r); } catch (eL) { ligs = []; }
    U.ultimasLigacoesCompletas = ligs;
    var x; try { x = P.gerar(r, opcoesPranchas()); } catch (e) { toast("Pranchas: " + e.message, "erro", 9000); return; }
    if (!x || !x.ok || !arr(x.folhas).length) { toast("Pranchas: " + ((x && arr(x.avisos)[0]) || "nada gerado") + ".", "erro", 9000); return; }
    U.pranchas = x; U.modo = "pranchas"; render();
    status("Pranchas da estrutura desenhada: " + x.folhas.length + " folhas.");
  }
  function pranchasHtml() {
    var x = U.pranchas || { folhas: [], avisos: [] };
    var h = '<h3>Pranchas do projeto executivo — estrutura desenhada</h3><p class="ml-d">' + x.folhas.length + " folhas " + esc((x.folhas[0] || {}).formato || "A1") + " no Padrão RA (carimbo RA). Abra uma folha, imprima em PDF ou baixe os desenhos (SVG, DXF com as penas por camada; DWG pelo DXF).</p>";
    if (arr(x.avisos).length) h += '<div class="ml-card" data-ml="pranchas-avisos"><h4>Avisos</h4><ul class="ml-l">' + x.avisos.map(function (a) { return '<li class="ml-aviso">' + esc(a) + "</li>"; }).join("") + "</ul></div>";
    h += '<div data-ml="pranchas" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">' + x.folhas.map(function (f, i) {
      return '<div class="ml-card" style="margin:0;padding:8px" data-ml-folha="' + esc(f.id) + '"><div style="background:#fff;border:1px solid var(--ml-linha);border-radius:8px;overflow:hidden;cursor:zoom-in;aspect-ratio:841/594" data-ml-acao="prancha-ver" data-ml-v="' + i + '" title="Ver a folha grande">' + f.svg.replace("<svg ", '<svg style="width:100%;height:100%;display:block" ') + '</div><p style="margin:6px 2px 0"><b>' + esc(f.numero) + "</b> — " + esc(f.titulo) + '<br><span class="ml-nota">Escala ' + esc(f.escala || "indicada") + "</span></p></div>";
    }).join("") + "</div>";
    return h;
  }
  function folhaHtml() {
    var x = U.pranchas || { folhas: [] }, i = U.folha || 0, f = x.folhas[i];
    if (!f) return '<p class="ml-nota">Sem folha.</p>';
    return '<h3 style="margin-bottom:8px">' + esc(f.numero + " — " + f.titulo) + ' <span class="ml-nota">folha ' + (i + 1) + " de " + x.folhas.length + " · escala " + esc(f.escala || "indicada") + '</span></h3><div data-ml="folha" style="background:#fff;border-radius:8px;overflow:hidden">' + f.svg.replace("<svg ", '<svg style="width:100%;height:auto;display:block" ') + "</div>";
  }
  function imprimirPranchas() {
    var x = U.pranchas; if (!x) return;
    var f0 = x.folhas[0] || {}, A = { A0: [1189, 841], A1: [841, 594], A2: [594, 420], A3: [420, 297] }[f0.formato || "A1"] || [841, 594];
    var html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pranchas — estrutura metálica — ' + esc((obra() || {}).nome || "") + "</title><style>@page{size:" + A[0] + "mm " + A[1] + "mm;margin:0}html,body{margin:0;background:#888}.f{width:" + A[0] + "mm;height:" + A[1] + "mm;background:#fff;page-break-after:always;overflow:hidden;margin:0 auto 8mm}.f svg{width:100%;height:100%;display:block}@media print{body{background:#fff}.f{margin:0}}</style></head><body>" +
      x.folhas.map(function (f) { return '<div class="f">' + f.svg + "</div>"; }).join("") + "</body></html>";
    U.ultimoPrint = html;
    var w = null; try { w = global.open("", "_blank"); } catch (e) { w = null; }
    if (w && w.document) { w.document.open(); w.document.write(html); w.document.close(); toast("Pranchas abertas em outra aba: imprima em PDF no tamanho " + (f0.formato || "A1") + ".", "ok", 7000); }
    else baixar(nomeArq() + "-pranchas-estrutura-desenhada.html", html, "text/html");
  }
  function nomeFolha(f, i, ext) { return (f.numero || ("folha-" + (i + 1))).replace(/[^\w.-]+/g, "-") + "-" + String(f.titulo || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.-]+/g, "-").slice(0, 40) + "." + ext; }
  function baixarSvgs() {
    var x = U.pranchas; if (!x || !global.BimBcf || !BimBcf.zipEscrever) { toast("O gerador de .zip não carregou.", "erro"); return; }
    var arqs = {}; x.folhas.forEach(function (f, i) { arqs[nomeFolha(f, i, "svg")] = f.svg; });
    baixar(nomeArq() + "-pranchas-estrutura-desenhada-svg.zip", BimBcf.zipEscrever(arqs), "application/zip");
  }
  function baixarDxf() {
    var x = U.pranchas, P = PL(); if (!x || !P || !P.dxf) { toast("O DXF das pranchas não carregou.", "erro"); return; }
    var arqs = {}, nomes = [];
    try { x.folhas.forEach(function (f, i) { var n = nomeFolha(f, i, "dxf"); arqs[n] = P.dxf(f); nomes.push(n); }); } catch (e) { toast("DXF: " + e.message, "erro", 9000); return; }
    U.ultimoDxf = { nomes: nomes, bytes: Object.keys(arqs).reduce(function (t, k) { return t + arqs[k].length; }, 0), primeiro: arqs[nomes[0]], arquivos: arqs };
    if (global.BimBcf && BimBcf.zipEscrever) baixar(nomeArq() + "-pranchas-estrutura-desenhada-dxf.zip", BimBcf.zipEscrever(arqs), "application/zip");
    else nomes.forEach(function (n) { baixar(n, arqs[n], "application/dxf"); });
    toast(nomes.length + " DXF (R2000, mm de papel 1:1, camadas do Padrão RA com a pena e a cor do CTB, carimbo RA). O AutoCAD abre direto e salva em DWG.", "ok", 9000);
  }
  function explicarDwg() {
    var m = (global.BimDxf && BimDxf.DWG && BimDxf.DWG.motivo) || "Use o DXF: o AutoCAD abre direto e salva em DWG.";
    if (global.UI && UI.modal) UI.modal("DWG das pranchas", '<p style="font-size:13px;line-height:1.5">' + esc(m) + '</p><p class="muted" style="font-size:12px">O DXF das pranchas sai com as camadas do Padrão RA (pena = espessura de linha da camada; cor = a do CTB), o texto em RomanS e o carimbo RA: no AutoCAD, Abrir → Salvar como → DWG — as camadas, as espessuras e o carimbo vão junto.</p>',
      [{ texto: "Baixar o DXF", classe: "primary", onClick: function () { UI.fecharModal(); baixarDxf(); } }, { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
    else baixarDxf();
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
      status(r.ok ? "Estrutura desenhada: " + (r.situacao && r.situacao.id === "incompleto" ? "INCOMPLETA (não verificado: " + arr(r.naoVerificados).map(function (x) { return x.tema; }).join(", ") + ")" : r.aprovado ? "APROVADA" : "REPROVADA (" + r.falhas + " falha(s))") + " — " + fmt(r.peso, 0) + " kg de aço." : "Estrutura desenhada: " + (r.motivo || "não calculou"));
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
      /* SIMULAÇÃO S1 (14/10/2026): as ligações do modelo refeitas com os esforços DESTE cálculo (js/metalligsugui.js) */
      var ligs = []; try { if (global.MetalLigSugUI && MetalLigSugUI.ligacoesComCalculo) ligs = MetalLigSugUI.ligacoesComCalculo(r); } catch (eL) { ligs = []; }
      U.ultimasLigacoesCompletas = ligs;
      U.ultimasLigacoes = ligs.map(function (l) { return { id: l.id, tipologia: l.info && l.info.tipologia, ok: !!(l.resultado && l.resultado.ok), razao: l.resultado && l.resultado.razao, confere: l.confere, comCalculo: l.comCalculo, fundacao: l.resultado && l.resultado.fundacao ? l.resultado.fundacao.id : null, ajusteCota: l.resultado && l.resultado.ajusteCota ? l.resultado.ajusteCota : null }; });
      var x = Mm.gerar(r, { ligacoes: ligs, obra: { nome: o.nome, endereco: o.endereco, cidade: o.cidade, cliente: o.cliente }, empresa: { nome: emp.nome || emp.razaoSocial, cnpj: emp.cnpj, logoDataUrl: logo }, responsavel: { nome: emp.responsavel, titulo: emp.titulo, crea: emp.crea }, imagens: img, versao: global.CONFIG && CONFIG.versao });
      if (x && x.ok && global.MetalEscadaLinhaUI && MetalEscadaLinhaUI.secaoMemorial) try { x.html = MetalEscadaLinhaUI.secaoMemorial(x.html); } catch (eE) {}   /* S6 (14/10/2026): a fixação das escadas — js/metalescadalinhaui.js */
      if (x && x.ok && global.UnidadesMemorial) x.html = UnidadesMemorial.preparar(x.html);   /* aba SI | Técnica (kgf / tf) — js/unidadesmemorial.js */
      U.ultimoMemorial = x && x.ok ? { titulo: x.titulo, secoes: x.secoes.length, bytes: x.html.length, avisos: x.avisos.length, ids: x.secoes.map(function (q) { return q.id; }) } : null;
      U.ultimoHtml = x && x.ok ? x.html : null;
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
    ultimas: function () { return { memorial: U.ultimoMemorial || null, cype: U.ultimoCype || null, ligacoes: U.ultimasLigacoes || null, html: U.ultimoHtml || null, pranchas: U.pranchas || null, dxf: U.ultimoDxf || null }; },
    envoltorio: function () { return U.env || null; },
    pranchas: function () { estado(); garantir(); if (!U.r) { U.modo = "passos"; lerModelo(); render(); toast("Calcule primeiro: as pranchas saem do resultado.", "aviso"); return false; } pranchas(); return true; },
    abrirResultado: function () { estado(); garantir(); if (!U.r) { U.modo = "passos"; lerModelo(); render(); return false; } U.modo = "resultado"; render(); return true; },
    memorial: function () { estado(); garantir(); if (!U.r || !U.r.ok) { U.modo = "passos"; lerModelo(); render(); toast("Calcule primeiro: o memorial sai do resultado.", "aviso"); return false; } U.modo = "resultado"; render(); memorial(); return true; },
    cype: function () { estado(); garantir(); if (!U.r || !U.r.ok) { U.modo = "passos"; lerModelo(); render(); toast("Calcule primeiro: o pacote do CYPE sai do resultado.", "aviso"); return false; } U.modo = "resultado"; render(); cype(); return true; },
    entrada: entrada
  };
  global.MetalCalcLivreUI = MetalCalcLivreUI;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalCalcLivreUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
