/* =====================================================================
 * problemacard.js — o CARTÃO DE PROBLEMA único do OrçaPRO (BACKLOG #53)
 *
 * REGRA DO DONO (15/10/2026): todo problema mostrado ao usuário tem
 *   (a) o que é, em palavras simples;
 *   (b) botão "Corrigir: <o que faz>" com a(s) solução(ões) — quando é
 *       cálculo, testada e aplicada com desfazer, nunca em silêncio;
 *   (c) botão "Mostrar no 3D", que seleciona e enquadra a peça/nó/plano.
 * Motivo: um texto como "desenhe o X" (mecanismo com tirante, 15/10)
 * deixava a pessoa travada, sem saber o que fazer.
 *
 * SEM TELA PRÓPRIA: só monta o HTML e delega os cliques. Quem usa diz quais
 * soluções têm ação (opts.acoes). Solução SEM ação vira nota de texto,
 * NUNCA botão — botão que não faz nada é o defeito que este arquivo existe
 * para impedir (o teste tools/test-problemacard.js tem o controle negativo).
 *
 *   ProblemaCard.html(problema, opts)   → um cartão
 *   ProblemaCard.lista(problemas, opts) → vários num contêiner com título
 *   ProblemaCard.ligar(raiz, handlers)  → delega corrigir(solId, k, el) e
 *                                         mostrar(pecas, k, el)
 *   ProblemaCard.mostrarNo3D(pecas)     → seleciona e enquadra no 3D
 *   ProblemaCard.irPara(seletor, raiz)  → rola até o campo e foca
 *
 * problema = { tipo, titulo, texto, gravidade: "erro"|"aviso",
 *              solucoes: [{ id, texto, muda, pecas }], pecas: [ids], no }
 * opts     = { acoes: { id: true | "rótulo" } ou function (sol) → true|"rótulo"|false,
 *              indice (ou prefixoIndice na lista: "x:nv" → "x:nv0"…), pre: "ml" (repete os atributos data-ml-* da tela do cálculo),
 *              estilo: "ml" | "btn", antes(p,k), depois(p,k) → html extra }
 * ===================================================================== */
(function (global) {
  "use strict";
  var doc = typeof document !== "undefined" ? document : null;

  function arr(x) { return Array.isArray(x) ? x : []; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /* qual rótulo a solução ganha — false quando não há ação (aí NÃO sai botão) */
  function rotulo(acoes, sol) {
    if (!sol || sol.id == null || sol.id === "") return false;
    var a = typeof acoes === "function" ? acoes(sol) : (acoes && Object.prototype.hasOwnProperty.call(acoes, sol.id) ? acoes[sol.id] : false);
    if (!a) return false;
    var t = a === true ? (sol.rotulo || sol.texto || "") : String(a);
    t = String(t).replace(/^\s*corrigir\s*:\s*/i, "");
    return t ? t : false;
  }
  /* as peças do problema e as das soluções, sem repetir */
  function pecasDe(p) {
    var ids = [];
    function add(id) { if (id == null || id === "") return; id = String(id); if (ids.indexOf(id) < 0) ids.push(id); }
    arr(p && p.pecas).forEach(add);
    arr(p && p.solucoes).forEach(function (s) { arr(s && s.pecas).forEach(add); });
    return ids;
  }
  /* "a × b" (rótulo de nó das ligações) → ["a", "b"] */
  function pecasDoNo(rot) { return String(rot == null ? "" : rot).split(/\s*×\s*/).map(function (x) { return x.trim(); }).filter(Boolean); }

  function classes(opts) {
    var ml = (opts && (opts.estilo || opts.pre)) === "ml";
    return {
      cx: ml ? "ml-prob" : "pc-prob",
      bt: ml ? "ml-bt mini" : "btn ghost sm",
      pri: ml ? "ml-bt mini pri" : "btn primary sm",
      nota: ml ? "ml-nota" : "pc-nota"
    };
  }

  /* o MIOLO de um problema (título, texto, botões) — sem a caixa */
  function miolo(p, opts) {
    opts = opts || {}; p = p || {};
    var k = opts.indice != null ? opts.indice : 0, pre = opts.pre === "ml", C = classes(opts);
    var tit = p.titulo || p.texto || "", txt = p.titulo && p.texto && p.texto !== p.titulo ? p.texto : "";
    var h = '<p class="pc-tit"' + (pre ? ' data-ml-prob="' + esc(p.tipo || "") + '"' : "") + "><b>" + esc(tit) + "</b></p>";
    if (txt) h += '<p class="pc-txt">' + esc(txt) + "</p>";
    var bts = [], notas = [], pcs = pecasDe(p);
    if (pcs.length && opts.mostrar !== false)
      bts.push('<button type="button" class="' + C.bt + '" data-pc-acao="mostrar" data-pc-p="' + k + '" data-pc-pecas="' + esc(pcs.join(",")) + '"' +
        (pre ? ' data-ml-acao="mostrar3d" data-ml-p="' + k + '"' : "") + ' title="Seleciona e enquadra no 3D: ' + esc(pcs.slice(0, 8).join(", ") + (pcs.length > 8 ? "…" : "")) + '">Mostrar no 3D</button>');
    if (opts.antes) { var a0 = opts.antes(p, k); if (a0) bts.push(a0); }
    arr(p.solucoes).forEach(function (s) {
      var r = rotulo(opts.acoes, s);
      if (!r) { if (s && s.texto) notas.push(String(s.texto)); return; }
      bts.push('<button type="button" class="' + C.pri + '" data-pc-acao="corrigir" data-pc-sol="' + esc(s.id) + '" data-pc-p="' + k + '"' +
        (pre ? ' data-ml-acao="solucao" data-ml-v="' + esc(s.id) + '" data-ml-p="' + k + '"' : "") +
        (s.muda ? ' title="' + esc((s.texto || r) + " — " + s.muda) + '"' : "") + ">Corrigir: " + esc(r) + "</button>");
    });
    if (bts.length) h += '<div class="pc-acoes">' + bts.join(" ") + "</div>";
    if (notas.length) h += '<p class="' + C.nota + ' pc-sem-acao">Sem correção automática — ' + notas.map(esc).join(" · ") + "</p>";
    if (opts.depois) { var d0 = opts.depois(p, k); if (d0) h += d0; }
    return h;
  }
  function html(p, opts) {
    opts = opts || {}; var C = classes(opts), av = p && p.gravidade === "aviso";
    css();
    return '<div class="' + C.cx + (av ? " pc-aviso" : "") + '" data-pc="problema" data-pc-tipo="' + esc((p && p.tipo) || "") + '"' + (opts.attrs ? " " + opts.attrs : "") +
      (av && C.cx === "ml-prob" ? ' style="border-color:var(--ml-aviso);background:var(--ml-avbg)"' : "") + ">" + miolo(p, opts) + "</div>";
  }
  function lista(probs, opts) {
    opts = opts || {}; var C = classes(opts), L = arr(probs);
    if (!L.length && !opts.vazio) return "";
    css();
    var sep = C.cx === "ml-prob" ? "<hr style='border:0;border-top:1px solid var(--ml-linha)'>" : '<hr class="pc-sep">';
    var av = opts.gravidade === "aviso";
    return '<div class="' + C.cx + (av ? " pc-aviso" : "") + '" data-pc="lista"' + (opts.attrs ? " " + opts.attrs : "") +
      (av && C.cx === "ml-prob" ? ' style="border-color:var(--ml-aviso);background:var(--ml-avbg)"' : "") + ">" +
      (opts.titulo ? "<h3 style=\"margin:0 0 6px\">" + esc(opts.titulo) + "</h3>" : "") +
      (L.length ? L.map(function (p, k) { var o = {}; Object.keys(opts).forEach(function (x) { o[x] = opts[x]; }); o.indice = opts.prefixoIndice ? opts.prefixoIndice + k : k; return '<div class="pc-item" data-pc="problema" data-pc-tipo="' + esc(p.tipo || "") + '">' + miolo(p, o) + "</div>"; }).join(sep) : "<p>" + esc(opts.vazio) + "</p>") +
      "</div>";
  }

  /* delega os cliques; devolve a função que desliga */
  function ligar(raiz, handlers) {
    if (!raiz || !raiz.addEventListener) return function () {};
    handlers = handlers || {};
    if (raiz._pcDesligar) raiz._pcDesligar();
    function clique(ev) {
      var t = ev.target, b = t && t.closest ? t.closest("[data-pc-acao]") : null;
      if (!b || !raiz.contains(b)) return;
      var a = b.getAttribute("data-pc-acao"), k0 = b.getAttribute("data-pc-p"), k = /^-?\d+$/.test(String(k0)) ? +k0 : k0;
      if (a === "corrigir" && typeof handlers.corrigir === "function") { ev.preventDefault(); handlers.corrigir(b.getAttribute("data-pc-sol"), k, b); }
      else if (a === "mostrar") { ev.preventDefault(); var ids = String(b.getAttribute("data-pc-pecas") || "").split(",").filter(Boolean); if (typeof handlers.mostrar === "function") handlers.mostrar(ids, k, b); else mostrarNo3D(ids); }
    }
    raiz.addEventListener("click", clique);
    raiz._pcDesligar = function () { raiz.removeEventListener("click", clique); raiz._pcDesligar = null; };
    return raiz._pcDesligar;
  }

  /* seleciona (no 3D e na seleção de precisão, que a Ligação inteligente lê) e enquadra */
  function mostrarNo3D(pecas) {
    var ids = arr(pecas).map(String).filter(Boolean), B = global.BIM, o = { ids: ids, selecionou: false, enquadrou: false };
    if (!ids.length || !B) return o;
    var uids = ids.map(function (id) { return /^edit:/.test(id) ? id : "edit:" + id; });
    try { if (B.selecionar) { B.selecionar(uids, "trocar"); o.selecionou = true; } } catch (e1) {}
    try { var P = B.precisao ? B.precisao() : null; if (P && P.selecionar) { P.selecionar(ids.map(function (id) { return String(id).replace(/^edit:/, ""); })); o.selecionou = true; } } catch (e2) {}
    try { if (B.enquadrarUids) o.enquadrou = !!B.enquadrarUids(uids); } catch (e3) {}
    ProblemaCard.ultimoMostrar = o;
    return o;
  }
  /* "Ir para <campo>": rola até o campo e foca (tenta de novo depois do render da tela) */
  function irPara(seletor, raiz) {
    if (!doc || !seletor) return false;
    function tenta() { var el = (raiz || doc).querySelector(seletor); if (!el) return false; try { el.scrollIntoView({ block: "center" }); } catch (e) {} try { if (el.focus) el.focus(); } catch (e2) {} return true; }
    if (tenta()) return true;
    setTimeout(tenta, 80); setTimeout(tenta, 300);
    return false;
  }

  function css() {
    if (!doc || !doc.head || doc.getElementById("pc-estilo")) return;
    var st = doc.createElement("style"); st.id = "pc-estilo";
    st.textContent = ".pc-prob{border:1px solid #c0392b;background:rgba(192,57,43,.07);border-radius:12px;padding:10px 12px;margin:0 0 10px}" +
      ".pc-prob.pc-aviso{border-color:#b45309;background:rgba(180,83,9,.07)} .pc-prob p,.pc-item p{margin:0 0 6px}" +
      ".pc-acoes{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 6px} .pc-nota{font-size:12px;opacity:.8} .pc-sep{border:0;border-top:1px solid rgba(127,127,127,.3);margin:8px 0}";
    doc.head.appendChild(st);
  }

  var ProblemaCard = { html: html, lista: lista, miolo: miolo, ligar: ligar, mostrarNo3D: mostrarNo3D, irPara: irPara, pecasDe: pecasDe, pecasDoNo: pecasDoNo, rotulo: rotulo, ultimoMostrar: null };
  global.ProblemaCard = ProblemaCard;
  if (typeof module !== "undefined" && module.exports) module.exports = ProblemaCard;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
